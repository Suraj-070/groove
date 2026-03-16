require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { randomUUID } = require('crypto');
const mongoose = require('mongoose');
const webpush  = require('web-push');

// ─── WEB PUSH (PWA notifications) ────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_MAILTO  = process.env.VAPID_MAILTO || 'mailto:groove@example.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('✅ Web Push VAPID configured');
} else {
  console.warn('⚠️  VAPID keys not set — push notifications disabled');
}

const app = express();
app.set('trust proxy', 1);

const isProd = !!process.env.FRONTEND_URL;
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = ['http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options(/.*/, cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'groove_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// ─── MONGODB ──────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(e => console.error('❌ MongoDB error:', e.message));
} else {
  console.warn('⚠️  No MONGODB_URI set — library will not persist across restarts');
}

// ─── LIBRARY SCHEMA ───────────────────────────────────────────
const songSchema = new mongoose.Schema({
  videoId: { type: String, required: true },
  title:   { type: String, required: true },
  addedAt: { type: Number, default: () => Date.now() }
}, { _id: false });

const categorySchema = new mongoose.Schema({
  id:        { type: String, default: () => randomUUID() },
  name:      { type: String, required: true },
  color:     { type: String, default: '#7c6aff' },
  songs:     { type: [songSchema], default: [] },
  createdAt: { type: Number, default: () => Date.now() }
}, { _id: false });

const librarySchema = new mongoose.Schema({
  userId:     { type: String, required: true, unique: true, index: true },
  categories: { type: [categorySchema], default: [] },
  updatedAt:  { type: Number, default: () => Date.now() }
});

const Library = mongoose.models.Library || mongoose.model('Library', librarySchema);

// ─── ROOM SCHEMA ──────────────────────────────────────────────
const roomSchema = new mongoose.Schema({
  roomId:       { type: String, required: true, unique: true, index: true },
  queue:        { type: Array, default: [] },
  currentIndex: { type: Number, default: 0 },
  updatedAt:    { type: Number, default: () => Date.now() }
});

const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);

// ─── CHAT MESSAGE SCHEMA ──────────────────────────────────────
const messageSchema = new mongoose.Schema({
  roomId:   { type: String, required: true, index: true },
  id:       { type: String, required: true },
  username: { type: String, required: true },
  text:     { type: String, required: true },
  ts:       { type: Number, required: true },   // UTC ms — clients format to local tz
  type:     { type: String, default: 'msg' }
}, { _id: false });

// TTL index: messages auto-delete after 7 days
messageSchema.index({ ts: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// ─── PUSH SUBSCRIPTION SCHEMA ────────────────────────────────
const pushSubSchema = new mongoose.Schema({
  userId:   { type: String, required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys:     { p256dh: String, auth: String },
  prefs: {
    songAdded:  { type: Boolean, default: true },
    chatMsg:    { type: Boolean, default: true },
    userJoined: { type: Boolean, default: false },
    djCrown:    { type: Boolean, default: true },
    songLoaded: { type: Boolean, default: false },
  },
  createdAt: { type: Number, default: () => Date.now() }
});
const PushSub = mongoose.models.PushSub || mongoose.model('PushSub', pushSubSchema);

// Send push to all subs of a user — silently removes stale subs
async function sendPush(userId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.log('[Push] VAPID not configured — skipping');
    return;
  }
  try {
    const subs = await PushSub.find({ userId }).lean();
    console.log(`[Push] userId="${userId}" type="${payload.type}" subs=${subs.length}`);
    if (subs.length === 0) {
      // Check if ANY subs exist in DB at all — helps diagnose save vs lookup mismatch
      const total = await PushSub.countDocuments();
      console.log(`[Push] Total subs in DB: ${total}`);
    }
    for (const sub of subs) {
      const prefs = sub.prefs || {};
      if (payload.type === 'chat'        && prefs.chatMsg    === false) continue;
      if (payload.type === 'song_added'  && prefs.songAdded  === false) continue;
      if (payload.type === 'user_joined' && prefs.userJoined === false) continue;
      if (payload.type === 'dj_crown'    && prefs.djCrown    === false) continue;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
          { TTL: 60 }
        );
        console.log(`[Push] ✅ sent to ${userId}`);
      } catch (e) {
        console.log(`[Push] ❌ send failed: ${e.statusCode} ${e.message}`);
        if (e.statusCode === 404 || e.statusCode === 410) {
          await PushSub.deleteOne({ endpoint: sub.endpoint });
        }
      }
    }
  } catch (e) {
    console.error('[Push] sendPush error:', e.message);
  }
}

// Send push to all users in a room except one (the actor)
async function sendPushToRoom(roomId, exceptUserId, payload) {
  const room = rooms[roomId];
  if (!room) return;
  const userIds = Object.values(room.users)
    .filter(u => u.id !== exceptUserId && u.discordId)
    .map(u => u.discordId);
  console.log(`[Push] room="${roomId}" type="${payload.type}" targets=${JSON.stringify(userIds)}`);
  await Promise.all(userIds.map(uid => sendPush(uid, payload)));
}

// ─── SHARED SONGS SCHEMA ─────────────────────────────────────
// Stores a temporary selection of songs shared via a short link.
// TTL index auto-deletes after 24 hours.
const sharedSongsSchema = new mongoose.Schema({
  shareId:   { type: String, required: true, unique: true, index: true },
  sharedBy:  { type: String, required: true },   // username
  crateName: { type: String, default: '' },       // source crate name
  songs:     { type: Array,  required: true },    // [{ videoId, title }]
  createdAt: { type: Date,   default: Date.now }
});
// Auto-delete after 24 hours
sharedSongsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });
const SharedSongs = mongoose.models.SharedSongs || mongoose.model('SharedSongs', sharedSongsSchema);

// ─── LISTEN HISTORY SCHEMA ───────────────────────────────────
const listenHistorySchema = new mongoose.Schema({
  userId:    { type: String, required: true, index: true },
  videoId:   { type: String, required: true },
  title:     { type: String, required: true },
  roomId:    { type: String, default: '' },
  listenedAt:{ type: Number, default: () => Date.now() },
});
// Keep last 500 per user — TTL after 90 days
listenHistorySchema.index({ listenedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
listenHistorySchema.index({ userId: 1, listenedAt: -1 });
const ListenHistory = mongoose.models.ListenHistory || mongoose.model('ListenHistory', listenHistorySchema);

// ─── MOMENT STAMP SCHEMA ─────────────────────────────────────
const momentSchema = new mongoose.Schema({
  userId:    { type: String, required: true, index: true },
  videoId:   { type: String, required: true },
  title:     { type: String, required: true },
  timestamp: { type: Number, required: true },
  roomId:    { type: String, default: '' },
  note:      { type: String, default: '' },
  stampedAt: { type: Number, default: () => Date.now() },
});
momentSchema.index({ userId: 1, stampedAt: -1 });
const Moment = mongoose.models.Moment || mongoose.model('Moment', momentSchema);

// ─── SONG DNA CACHE ──────────────────────────────────────────
// Caches enriched song data so we don't re-fetch for the same song
const songDNASchema = new mongoose.Schema({
  videoId:  { type: String, required: true, unique: true, index: true },
  title:    { type: String },
  bpm:      { type: Number },
  energy:   { type: Number },  // 0-1
  mood:     { type: String },  // euphoric/confident/calm/sad/aggressive/chill
  danceability: { type: Number }, // 0-1
  genre:    { type: String },
  fetchedAt:{ type: Number, default: () => Date.now() },
});
songDNASchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30 day cache
const SongDNA = mongoose.models.SongDNA || mongoose.model('SongDNA', songDNASchema);

// Mood mapping from AcousticBrainz mood/mirex tags
function mapMood(abData) {
  const mood = abData?.highlevel?.mood_happy?.value ||
               abData?.highlevel?.mood_aggressive?.value ||
               abData?.highlevel?.mood_relaxed?.value ||
               abData?.highlevel?.mood_sad?.value || null;
  const happy    = parseFloat(abData?.highlevel?.mood_happy?.probability    || 0);
  const sad      = parseFloat(abData?.highlevel?.mood_sad?.probability      || 0);
  const relax    = parseFloat(abData?.highlevel?.mood_relaxed?.probability  || 0);
  const aggr     = parseFloat(abData?.highlevel?.mood_aggressive?.probability || 0);
  const scores = { euphoric: happy, sad, chill: relax, aggressive: aggr };
  const best = Object.entries(scores).sort((a,b) => b[1]-a[1])[0];
  return best[1] > 0.3 ? best[0] : 'neutral';
}

async function enrichSong(videoId, title) {
  // Check cache first
  if (MONGO_URI) {
    const cached = await SongDNA.findOne({ videoId }).lean();
    if (cached) return cached;
  }

  const dna = { videoId, title, bpm: null, energy: null, mood: 'neutral', danceability: null, genre: null };

  try {
    const clean = (title || '').replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 60);
    const query = encodeURIComponent(clean);

    // MusicBrainz lookup
    const mbRes = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${query}&limit=3&fmt=json`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'GrooveTogether/1.0' } }
    );
    if (!mbRes.ok) return dna;
    const mbData = await mbRes.json();
    const rec = mbData?.recordings?.[0];
    if (!rec?.id) return dna;

    // AcousticBrainz high-level (mood, genre, danceability)
    const [llRes, hlRes] = await Promise.all([
      fetch(`https://acousticbrainz.org/${rec.id}/low-level`),
      fetch(`https://acousticbrainz.org/${rec.id}/high-level`),
    ]);

    if (llRes.ok) {
      const ll = await llRes.json();
      const bpm = ll?.rhythm?.bpm;
      if (bpm && bpm > 40 && bpm < 220) dna.bpm = Math.round(bpm);
      const rms = ll?.lowlevel?.average_loudness;
      if (rms) dna.energy = Math.min(1, Math.max(0, parseFloat(rms)));
    }
    if (hlRes.ok) {
      const hl = await hlRes.json();
      dna.mood = mapMood(hl);
      const danceable = hl?.highlevel?.danceability?.value;
      dna.danceability = danceable === 'danceable' ? 0.8 : 0.3;
      const genre = hl?.highlevel?.genre_rosamerica?.value;
      if (genre) dna.genre = genre;
    }

    // Cache it
    if (MONGO_URI) {
      await SongDNA.findOneAndUpdate({ videoId }, { ...dna, fetchedAt: Date.now() }, { upsert: true });
    }
  } catch (e) { /* enrichment is best-effort — never block */ }

  return dna;
}

// Flow score between two songs (0-100)
function flowScore(songA, songB) {
  if (!songA || !songB) return 50;
  let score = 100;
  // BPM compatibility (within 20 BPM = smooth, >40 BPM = jarring)
  if (songA.bpm && songB.bpm) {
    const bpmDiff = Math.abs(songA.bpm - songB.bpm);
    score -= Math.min(40, bpmDiff * 1.2);
  }
  // Energy delta
  if (songA.energy != null && songB.energy != null) {
    const eDiff = Math.abs(songA.energy - songB.energy);
    score -= eDiff * 30;
  }
  // Mood compatibility
  const moodCompat = {
    euphoric: { euphoric:10, confident:5, chill:-5, sad:-15, aggressive:0, neutral:0 },
    confident:{ euphoric:5, confident:10, chill:0, sad:-10, aggressive:5, neutral:3 },
    chill:    { euphoric:-5, confident:0, chill:10, sad:5, aggressive:-15, neutral:5 },
    sad:      { euphoric:-15, confident:-10, chill:5, sad:10, aggressive:-10, neutral:0 },
    aggressive:{ euphoric:0, confident:5, chill:-15, sad:-10, aggressive:10, neutral:0 },
    neutral:  { euphoric:0, confident:3, chill:5, sad:0, aggressive:0, neutral:10 },
  };
  const moodDelta = moodCompat[songA.mood]?.[songB.mood] ?? 0;
  score += moodDelta;
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function recordListen(userId, videoId, title, roomId) {
  if (!MONGO_URI || !userId) {
    console.log('[History] skipped — MONGO_URI:', !!MONGO_URI, 'userId:', userId);
    return;
  }
  try {
    const recent = await ListenHistory.findOne({
      userId, videoId, listenedAt: { $gt: Date.now() - 5 * 60 * 1000 }
    });
    if (!recent) {
      await ListenHistory.create({ userId, videoId, title, roomId, listenedAt: Date.now() });
      console.log(`[History] ✅ saved for userId="${userId}" title="${title.slice(0,30)}"`);
    } else {
      console.log(`[History] skipped duplicate for userId="${userId}"`);
    }
  } catch (e) { console.error('[History] recordListen error:', e.message); }
}

// In-memory fallback for when MongoDB is unavailable
const memMessages = {}; // { roomId: [msg, ...] }

async function getMessages(roomId) {
  if (!MONGO_URI) return memMessages[roomId] || [];
  try {
    return await Message.find({ roomId }, { _id: 0, roomId: 0, __v: 0 })
      .sort({ ts: 1 })
      .limit(100)
      .lean();
  } catch (e) {
    console.error('getMessages error:', e.message);
    return memMessages[roomId] || [];
  }
}

async function saveMessage(roomId, msg) {
  // Always keep in-memory (fast access for active rooms)
  if (!memMessages[roomId]) memMessages[roomId] = [];
  memMessages[roomId].push(msg);
  // Keep only last 100 in memory
  if (memMessages[roomId].length > 100) memMessages[roomId].shift();

  if (!MONGO_URI) return;
  try {
    await Message.create({ roomId, ...msg });
  } catch (e) {
    console.error('saveMessage error:', e.message);
  }
}

// In-memory fallback when MongoDB is not connected
const memLibraries = {};

async function getLibrary(userId) {
  if (!MONGO_URI) {
    if (!memLibraries[userId]) memLibraries[userId] = { userId, categories: [] };
    return memLibraries[userId];
  }
  let lib = await Library.findOne({ userId });
  if (!lib) { lib = await Library.create({ userId, categories: [] }); }
  return lib;
}

// ─── AUTH ─────────────────────────────────────────────────────
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
  done(null, {
    id: `discord_${profile.id}`,
    username: profile.username,
    avatar: profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(profile.id) % 5}.png`,
    provider: 'discord'
  });
}));

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, (accessToken, refreshToken, profile, done) => {
    done(null, {
      id: `google_${profile.id}`,
      username: profile.displayName,
      avatar: profile.photos?.[0]?.value || null,
      provider: 'google'
    });
  }));
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ─── AUTH ROUTES ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: `${FRONTEND}?error=auth_failed` }),
  (req, res) => res.redirect(`${FRONTEND}?auth=success`)
);

app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: `${FRONTEND}?error=auth_failed` }),
  (req, res) => res.redirect(`${FRONTEND}?auth=success`)
);

app.get('/auth/me', (req, res) => {
  if (req.isAuthenticated()) res.json(req.user);
  else res.status(401).json({ error: 'Not authenticated' });
});

app.post('/auth/guest', (req, res) => {
  const { username } = req.body;
  if (!username?.trim()) return res.status(400).json({ error: 'Username required' });
  const user = { id: `guest_${randomUUID()}`, username: username.trim(), avatar: null, provider: 'guest', isGuest: true };
  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: 'Login failed' });
    res.json(user);
  });
});

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.json({ success: true }));
});

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated() && !req.user?.isGuest) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ─── LIBRARY API ──────────────────────────────────────────────
app.get('/library', requireAuth, async (req, res) => {
  try {
    const lib = await getLibrary(req.user.id);
    res.json({ categories: lib.categories });
  } catch (e) {
    console.error('GET /library error:', e);
    res.status(500).json({ error: 'Failed to load library' });
  }
});

app.post('/library/categories', requireAuth, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const category = { id: randomUUID(), name: name.trim(), color: color || '#7c6aff', songs: [], createdAt: Date.now() };

    if (!MONGO_URI) {
      const lib = await getLibrary(req.user.id);
      lib.categories.push(category);
      return res.json(category);
    }

    await Library.findOneAndUpdate(
      { userId: req.user.id },
      { $push: { categories: category }, $set: { updatedAt: Date.now() } },
      { upsert: true }
    );
    res.json(category);
  } catch (e) {
    console.error('POST /library/categories error:', e);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

app.delete('/library/categories/:categoryId', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) {
      const lib = await getLibrary(req.user.id);
      lib.categories = lib.categories.filter(c => c.id !== req.params.categoryId);
      return res.json({ success: true });
    }
    await Library.findOneAndUpdate(
      { userId: req.user.id },
      { $pull: { categories: { id: req.params.categoryId } }, $set: { updatedAt: Date.now() } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

app.post('/library/categories/:categoryId/songs', requireAuth, async (req, res) => {
  try {
    const { videoId, title } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId required' });

    const lib = await getLibrary(req.user.id);
    const categories = lib.categories || [];
    const category = categories.find(c => c.id === req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Collection not found' });
    if ((category.songs || []).find(s => s.videoId === videoId))
      return res.status(409).json({ error: 'Song already in collection' });

    const song = { videoId, title, addedAt: Date.now() };

    if (!MONGO_URI) {
      category.songs.push(song);
      return res.json(song);
    }

    await Library.findOneAndUpdate(
      { userId: req.user.id, 'categories.id': req.params.categoryId },
      { $push: { 'categories.$.songs': song }, $set: { updatedAt: Date.now() } }
    );
    res.json(song);
  } catch (e) {
    console.error('POST /library/songs error:', e);
    res.status(500).json({ error: 'Failed to add song' });
  }
});

// ── Batch add songs to a crate (playlist import) ─────────────
// Single HTTP request instead of N sequential requests
app.post('/library/categories/:categoryId/songs/batch', requireAuth, async (req, res) => {
  try {
    const { songs } = req.body; // [{ videoId, title }, ...]
    if (!Array.isArray(songs) || songs.length === 0)
      return res.status(400).json({ error: 'songs array required' });

    const CRATE_SONG_LIMIT = 500;
    const lib = await getLibrary(req.user.id);
    const category = (lib.categories || []).find(c => c.id === req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Collection not found' });

    const existing = new Set((category.songs || []).map(s => s.videoId));
    const remaining = CRATE_SONG_LIMIT - (category.songs || []).length;

    if (remaining <= 0)
      return res.status(409).json({ error: 'CRATE_FULL', limit: CRATE_SONG_LIMIT });

    // Deduplicate + cap
    const toAdd = songs
      .filter(s => s.videoId && s.title && !existing.has(s.videoId))
      .slice(0, remaining)
      .map(s => ({ videoId: s.videoId, title: s.title, addedAt: Date.now() }));

    const skipped = songs.length - toAdd.length;

    if (!MONGO_URI) {
      category.songs.push(...toAdd);
      return res.json({ added: toAdd.length, skipped, songs: toAdd });
    }

    if (toAdd.length > 0) {
      await Library.findOneAndUpdate(
        { userId: req.user.id, 'categories.id': req.params.categoryId },
        { $push: { 'categories.$.songs': { $each: toAdd } }, $set: { updatedAt: Date.now() } }
      );
    }
    res.json({ added: toAdd.length, skipped, songs: toAdd });
  } catch (e) {
    console.error('POST /library/songs/batch error:', e);
    res.status(500).json({ error: 'Failed to batch add songs' });
  }
});

app.delete('/library/categories/:categoryId/songs/:videoId', requireAuth, async (req, res) => {
  try {
    if (!MONGO_URI) {
      const lib = await getLibrary(req.user.id);
      const category = lib.categories.find(c => c.id === req.params.categoryId);
      if (category) category.songs = category.songs.filter(s => s.videoId !== req.params.videoId);
      return res.json({ success: true });
    }

    await Library.findOneAndUpdate(
      { userId: req.user.id, 'categories.id': req.params.categoryId },
      { $pull: { 'categories.$.songs': { videoId: req.params.videoId } }, $set: { updatedAt: Date.now() } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to remove song' });
  }
});

// ─── YOUTUBE PLAYLIST API ─────────────────────────────────────
app.get('/youtube/playlist', requireAuth, async (req, res) => {
  const { playlistId } = req.query;
  if (!playlistId) return res.status(400).json({ error: 'playlistId required' });
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YouTube API key not configured' });
  try {
    let songs = [], nextPageToken = null;
    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('playlistId', playlistId);
      url.searchParams.set('maxResults', '50');
      url.searchParams.set('key', apiKey);
      if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);
      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      (data.items || []).forEach(item => {
        const videoId = item.snippet?.resourceId?.videoId;
        const title = item.snippet?.title;
        if (videoId && title && title !== 'Deleted video' && title !== 'Private video')
          songs.push({ videoId, title });
      });
      nextPageToken = data.nextPageToken || null;
    } while (nextPageToken && songs.length < 200);
    res.json({ songs, total: songs.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// ─── ROOM STATE ───────────────────────────────────────────────
const rooms = {};

// Load room from memory, or restore queue from MongoDB if server restarted
async function getRoom(roomId) {
  if (rooms[roomId]) return rooms[roomId];

  // Try to restore queue from DB after a server restart
  if (MONGO_URI) {
    try {
      const saved = await Room.findOne({ roomId });
      if (saved) {
        console.log(`🔄 Restored room "${roomId}" from DB (${saved.queue.length} songs)`);
        rooms[roomId] = {
          queue: saved.queue,
          currentIndex: saved.currentIndex,
          currentTime: 0,    // can't restore — ephemeral
          isPlaying: false,  // same
          users: {},
          djId: null,
          djMode: false,
          sessionStart: Date.now(),
          songsPlayed: []
        };
        return rooms[roomId];
      }
    } catch (e) {
      console.error('getRoom DB error:', e.message);
    }
  }

  // Fresh room
  rooms[roomId] = {
    queue: [], currentIndex: 0, currentTime: 0,
    isPlaying: false, users: {}, djId: null, djMode: false,
    sessionStart: Date.now(), songsPlayed: []
  };
  return rooms[roomId];
}

// Save only queue + currentIndex to MongoDB (not ephemeral playback state)
async function saveRoom(roomId) {
  if (!MONGO_URI) return;
  const room = rooms[roomId];
  if (!room) return;
  try {
    await Room.findOneAndUpdate(
      { roomId },
      { queue: room.queue, currentIndex: room.currentIndex, updatedAt: Date.now() },
      { upsert: true }
    );
  } catch (e) {
    console.error('saveRoom error:', e.message);
  }
}

// ─── YOUTUBE SEARCH ──────────────────────────────────────────
app.get('/youtube/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'Query required' });
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Search not configured' });
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', q.trim());
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoCategoryId', '10'); // Music category
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('key', apiKey);
    const response = await fetch(url.toString());
    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const results = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    }));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── SONG DNA ENDPOINTS ──────────────────────────────────────

// Enrich a single song (or batch)
app.post('/song-dna', requireAuth, async (req, res) => {
  const { songs } = req.body; // [{ videoId, title }]
  if (!Array.isArray(songs)) return res.status(400).json({ error: 'songs array required' });
  const capped = songs.slice(0, 20); // max 20 at a time
  try {
    const results = await Promise.all(
      capped.map(s => enrichSong(s.videoId, s.title))
    );
    res.json({ dna: results });
  } catch (e) {
    res.status(500).json({ error: 'Enrichment failed' });
  }
});

// Flow scores for a queue
app.post('/flow-scores', requireAuth, async (req, res) => {
  const { songs } = req.body; // [{ videoId, title }]
  if (!Array.isArray(songs) || songs.length < 2)
    return res.json({ scores: [] });
  try {
    const dnaList = await Promise.all(songs.map(s => enrichSong(s.videoId, s.title)));
    const scores = dnaList.slice(1).map((song, i) => ({
      videoId: song.videoId,
      score: flowScore(dnaList[i], song),
      fromMood: dnaList[i].mood,
      toMood: song.mood,
      bpmDiff: (dnaList[i].bpm && song.bpm) ? Math.abs(dnaList[i].bpm - song.bpm) : null,
    }));
    res.json({ scores });
  } catch (e) {
    res.status(500).json({ error: 'Flow score failed' });
  }
});

// Personal taste fingerprint
app.get('/taste-fingerprint', requireAuth, async (req, res) => {
  try {
    // Get user's listen history
    const history = await ListenHistory.find({ userId: req.user.id })
      .sort({ listenedAt: -1 })
      .limit(100)
      .lean();

    if (history.length < 3) {
      return res.json({ fingerprint: null, message: 'Listen to more songs to build your fingerprint' });
    }

    // Fetch DNA for all songs (use cache heavily)
    const dnaList = await Promise.all(
      history.map(h => enrichSong(h.videoId, h.title))
    );

    // Aggregate
    const valid = dnaList.filter(d => d.bpm || d.energy != null);
    const avgBpm = valid.filter(d=>d.bpm).reduce((a,d)=>a+d.bpm,0) / (valid.filter(d=>d.bpm).length||1);
    const avgEnergy = valid.filter(d=>d.energy!=null).reduce((a,d)=>a+d.energy,0) / (valid.filter(d=>d.energy!=null).length||1);
    const avgDance = valid.filter(d=>d.danceability!=null).reduce((a,d)=>a+d.danceability,0) / (valid.filter(d=>d.danceability!=null).length||1);

    // Mood distribution
    const moodCounts = {};
    dnaList.forEach(d => { moodCounts[d.mood||'neutral'] = (moodCounts[d.mood||'neutral']||0)+1; });
    const dominantMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'neutral';

    // Variety score — how diverse are the BPMs?
    const bpms = valid.filter(d=>d.bpm).map(d=>d.bpm);
    const bpmStdDev = bpms.length > 1
      ? Math.sqrt(bpms.reduce((s,b)=>s+(b-avgBpm)**2,0)/bpms.length)
      : 0;
    const variety = Math.min(100, Math.round(bpmStdDev / 0.5));

    res.json({
      fingerprint: {
        energy:       Math.round(avgEnergy * 100),
        danceability: Math.round(avgDance * 100),
        bpm:          Math.round(avgBpm),
        variety,
        dominantMood,
        moodBreakdown: moodCounts,
        totalSongs:   history.length,
      }
    });
  } catch (e) {
    console.error('taste-fingerprint error:', e.message);
    res.status(500).json({ error: 'Failed to build fingerprint' });
  }
});

// ─── LISTEN HISTORY ENDPOINTS ────────────────────────────────

app.get('/history', requireAuth, async (req, res) => {
  try {
    const page  = parseInt(req.query.page  || '1');
    const limit = parseInt(req.query.limit || '50');
    const history = await ListenHistory.find({ userId: req.user.id })
      .sort({ listenedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-_id -__v')
      .lean();
    const total = await ListenHistory.countDocuments({ userId: req.user.id });
    console.log(`[History] GET userId="${req.user.id}" found=${total}`);
    res.json({ history, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: 'Failed to load history' }); }
});

app.delete('/history', requireAuth, async (req, res) => {
  try {
    await ListenHistory.deleteMany({ userId: req.user.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to clear history' }); }
});

// ─── MOMENT STAMP ENDPOINTS ──────────────────────────────────

app.get('/moments', requireAuth, async (req, res) => {
  try {
    const moments = await Moment.find({ userId: req.user.id })
      .sort({ stampedAt: -1 })
      .limit(200)
      .select('-_id -__v')
      .lean();
    res.json({ moments });
  } catch (e) { res.status(500).json({ error: 'Failed to load moments' }); }
});

app.post('/moments', requireAuth, async (req, res) => {
  const { videoId, title, timestamp, roomId, note } = req.body;
  if (!videoId || timestamp === undefined)
    return res.status(400).json({ error: 'videoId and timestamp required' });
  try {
    // Check duplicate — same song + within 10s of existing stamp
    const existing = await Moment.findOne({
      userId: req.user.id,
      videoId,
      timestamp: { $gte: Number(timestamp) - 10, $lte: Number(timestamp) + 10 }
    });
    if (existing) return res.status(409).json({ error: 'Already stamped this moment' });
    await Moment.create({ userId: req.user.id, videoId, title, timestamp, roomId: roomId || '', note: note || '' });
    console.log(`[Moment] ✅ saved for userId="${req.user.id}" title="${(title||'').slice(0,30)}" ts=${timestamp}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to save moment' }); }
});

app.delete('/moments/:videoId', requireAuth, async (req, res) => {
  try {
    const { stampedAt } = req.query;
    const query = { userId: req.user.id, videoId: req.params.videoId };
    if (stampedAt) query.stampedAt = Number(stampedAt);
    await Moment.deleteMany(query);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete moment' }); }
});

// ─── SHARED SONGS ENDPOINTS ──────────────────────────────────

// Create a share link for selected songs
app.post('/share/songs', requireAuth, async (req, res) => {
  const { songs, crateName } = req.body;
  if (!Array.isArray(songs) || songs.length === 0)
    return res.status(400).json({ error: 'No songs provided' });
  if (songs.length > 100)
    return res.status(400).json({ error: 'Max 100 songs per share' });

  // Generate short 8-char ID
  const shareId = randomUUID().replace(/-/g, '').slice(0, 8);

  try {
    if (MONGO_URI) {
      await SharedSongs.create({
        shareId,
        sharedBy: req.user.username || req.user.id,
        crateName: crateName || '',
        songs: songs.map(s => ({ videoId: s.videoId, title: s.title })),
      });
    }
    res.json({ shareId, url: `${FRONTEND}/shared/${shareId}` });
  } catch (e) {
    console.error('POST /share/songs error:', e);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// Get shared songs by shareId — public, no auth required
app.get('/share/songs/:shareId', async (req, res) => {
  try {
    const share = await SharedSongs.findOne({ shareId: req.params.shareId }).lean();
    if (!share) return res.status(404).json({ error: 'Share link not found or expired' });
    res.json({
      shareId: share.shareId,
      sharedBy: share.sharedBy,
      crateName: share.crateName,
      songs: share.songs,
      createdAt: share.createdAt,
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load shared songs' });
  }
});

// ─── PUSH NOTIFICATION ENDPOINTS ─────────────────────────────

// Return VAPID public key so client can subscribe
app.get('/push/vapid-public-key', requireAuth, (req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ error: 'Push not configured' });
  res.json({ key: VAPID_PUBLIC });
});

// Save a push subscription
app.post('/push/subscribe', requireAuth, async (req, res) => {
  const { subscription, prefs } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  try {
    await PushSub.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        userId: req.user.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        prefs: prefs || {},
        createdAt: Date.now()
      },
      { upsert: true, new: true }
    );
    console.log(`[Push] ✅ subscription saved for userId="${req.user.id}"`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Remove a push subscription (user turned off notifications)
app.post('/push/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) await PushSub.deleteOne({ endpoint });
  else await PushSub.deleteMany({ userId: req.user.id });
  res.json({ success: true });
});

// Update notification preferences
app.patch('/push/prefs', requireAuth, async (req, res) => {
  const { prefs } = req.body;
  await PushSub.updateMany({ userId: req.user.id }, { $set: { prefs } });
  res.json({ success: true });
});

// ─── SOCKET.IO ────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

io.on('connection', (socket) => {
  socket.on('join-room', async ({ roomId, username, avatar, discordId }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    const room = await getRoom(roomId);
    const isFirstUser = Object.keys(room.users).length === 0;
    room.users[socket.id] = { id: socket.id, discordId, username, avatar, joinedAt: Date.now() };
    if (isFirstUser) room.djId = socket.id;
    const chatHistory = await getMessages(roomId);
    socket.emit('room-state', {
      queue: room.queue, currentIndex: room.currentIndex,
      currentTime: room.currentTime, isPlaying: room.isPlaying,
      users: Object.values(room.users), djId: room.djId,
      djMode: room.djMode, sessionStart: room.sessionStart,
      songsPlayed: room.songsPlayed,
      chatHistory   // last 100 messages — clients format timestamps to local tz
    });
    socket.to(roomId).emit('user-joined', { user: room.users[socket.id], users: Object.values(room.users) });
    // Notify room members of new listener (only if room has existing users)
    if (!isFirstUser) {
      sendPushToRoom(roomId, socket.id, {
        type: 'user_joined',
        title: 'Groove Together',
        body: `👋 ${username} joined the room`,
        icon: '/web-app-manifest-192x192.png',
        badge: '/favicon-96x96.png',
        tag: `join-${roomId}`,
        renotify: false,
        silent: true,
        data: { roomId, url: `/?room=${roomId}`, type: 'user_joined' }
      });
    }
  });

  socket.on('play', async ({ roomId, time }) => {
    const room = await getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) return;
    room.isPlaying = true; room.currentTime = time;
    socket.to(roomId).emit('play', { time });
  });

  socket.on('pause', async ({ roomId, time }) => {
    const room = await getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) return;
    room.isPlaying = false; room.currentTime = time;
    socket.to(roomId).emit('pause', { time });
  });

  socket.on('seek', async ({ roomId, time }) => {
    const room = await getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) return;
    room.currentTime = time;
    socket.to(roomId).emit('seek', { time });
  });

  socket.on('add-song', async ({ roomId, videoId, title, addedBy }) => {
    const room = await getRoom(roomId);
    if (room.queue.length >= 200) {
      socket.emit('queue-full', { limit: 200 });
      return;
    }
    socket.to(roomId).emit('song-added-notify', { title, addedBy });
    room.queue.push({ videoId, title, addedBy });
    io.to(roomId).emit('queue-updated', { queue: room.queue });
    await saveRoom(roomId);
    sendPushToRoom(roomId, socket.id, {
      type: 'song_added',
      title: 'Groove Together',
      body: `🎵 ${addedBy} added "${title}"`,
      icon: '/web-app-manifest-192x192.png',
      badge: '/favicon-96x96.png',
      image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      tag: `song-${roomId}`,
      renotify: true,
      silent: false,
      data: { roomId, url: `/?room=${roomId}`, type: 'song_added' }
    });
  });

  // Batch add songs from a playlist import — single DB write, single broadcast
  socket.on('add-songs-batch', async ({ roomId, songs, addedBy }) => {
    const room = await getRoom(roomId);
    const remaining = 200 - room.queue.length;
    if (remaining <= 0) {
      socket.emit('queue-full', { limit: 200 });
      return;
    }
    const toAdd = songs.slice(0, remaining).map(s => ({ ...s, addedBy }));
    const skipped = songs.length - toAdd.length;
    room.queue.push(...toAdd);
    io.to(roomId).emit('queue-updated', { queue: room.queue });
    if (skipped > 0) socket.emit('queue-limit-reached', { added: toAdd.length, skipped, limit: 200 });
    await saveRoom(roomId);
  });

  socket.on('load-song', async ({ roomId, index }) => {
    const room = await getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) return;
    const prev = room.queue[room.currentIndex];
    if (prev && !room.songsPlayed.find(s => s.videoId === prev.videoId))
      room.songsPlayed.push({ ...prev, playedAt: Date.now() });
    room.currentIndex = index; room.currentTime = 0; room.isPlaying = true;
    // Record listen history for all users in room
    const song = room.queue[index];
    if (song) {
      Object.values(room.users).forEach(u => {
        if (u.discordId) recordListen(u.discordId, song.videoId, song.title, roomId);
      });
    }
    io.to(roomId).emit('load-song', { index, videoId: room.queue[index]?.videoId, title: room.queue[index]?.title, queue: room.queue });
    await saveRoom(roomId);
  });

  socket.on('remove-song', async ({ roomId, index }) => {
    const room = await getRoom(roomId);
    room.queue.splice(index, 1);
    if (room.currentIndex >= room.queue.length)
      room.currentIndex = Math.max(0, room.queue.length - 1);
    io.to(roomId).emit('queue-updated', { queue: room.queue });
    await saveRoom(roomId);
  });

  socket.on('push-category', async ({ roomId, songs, categoryName, username }) => {
    const room = await getRoom(roomId);
    songs.forEach(song => room.queue.push({ ...song, addedBy: username }));
    io.to(roomId).emit('queue-updated', { queue: room.queue });
    io.to(roomId).emit('category-pushed', { categoryName, username, count: songs.length });
    await saveRoom(roomId);
  });

  // DJ hands crown to another user
  socket.on('transfer-dj', async ({ roomId, toSocketId }) => {
    const room = await getRoom(roomId);
    if (socket.id !== room.djId) return; // only current DJ can transfer
    const target = room.users[toSocketId];
    if (!target) return;
    const fromUsername = room.users[socket.id]?.username || 'DJ';
    room.djId = toSocketId;
    room.djMode = true; // ensure DJ mode is on
    io.to(roomId).emit('dj-mode-changed', { djMode: true, djId: toSocketId });
    io.to(roomId).emit('dj-transferred', {
      fromUsername,
      toUsername: target.username,
      toSocketId,
    });
    // Push notification to new DJ
    if (target.discordId) {
      sendPush(target.discordId, {
        type: 'dj_crown',
        title: 'You are now the DJ 👑',
        body: `${fromUsername} passed the crown to you in room ${roomId}`,
        icon: '/web-app-manifest-192x192.png',
        badge: '/favicon-96x96.png',
        tag: `dj-${roomId}`,
        data: { roomId, url: `/?room=${roomId}`, type: 'dj_crown' }
      });
    }
  });

  socket.on('toggle-dj-mode', async ({ roomId }) => {
    const room = await getRoom(roomId);
    const prevDjId = room.djId;
    if (socket.id !== room.djId) return;
    room.djMode = !room.djMode;
    io.to(roomId).emit('dj-mode-changed', { djMode: room.djMode, djId: room.djId });
  });

  socket.on('sync-heartbeat', async ({ roomId, time }) => {
    const room = await getRoom(roomId);
    room.currentTime = time;
    socket.to(roomId).emit('sync-check', { time });
  });

  socket.on('chat-msg', ({ roomId, msg }) => {
    const stamped = { ...msg, ts: Date.now(), type: 'msg' };
    socket.to(roomId).emit('chat-msg', stamped);
    socket.emit('chat-msg-echo', stamped);
    saveMessage(roomId, stamped);
    // Push to room members who are away (app closed/backgrounded)
    sendPushToRoom(roomId, socket.id, {
      type: 'chat',
      title: `${msg.username}`,
      body: msg.text.length > 100 ? msg.text.slice(0, 100) + '…' : msg.text,
      icon: '/web-app-manifest-192x192.png',
      badge: '/favicon-96x96.png',
      tag: `chat-${roomId}`,
      renotify: true,
      silent: false,
      data: { roomId, url: `/?room=${roomId}`, type: 'chat' }
    });
  });
  socket.on('reaction', ({ roomId, emoji, username }) => socket.to(roomId).emit('reaction', { emoji, username }));
  socket.on('user-typing', ({ roomId, username, isTyping }) => socket.to(roomId).emit('user-typing', { username, isTyping }));

  // Reorder queue (drag-to-reorder / shuffle)
  socket.on('reorder-queue', async ({ roomId, queue: newQueue }) => {
    const room = await getRoom(roomId);
    if (!room || !Array.isArray(newQueue)) return;
    room.queue = newQueue;
    await saveRoom(roomId);
    io.to(roomId).emit('queue-updated', { queue: room.queue });
  });

  // Per-song reactions
  socket.on('song-react', ({ roomId, videoId, emoji, username }) => {
    socket.to(roomId).emit('song-reaction', { videoId, emoji, username });
  });

  // Notify room when someone adds a song (for toast notifications)
  socket.on('song-added-notify', ({ roomId, title, addedBy }) => {
    socket.to(roomId).emit('song-added-notify', { title, addedBy });
  });

  socket.on('get-recap', async ({ roomId }) => {
    const room = await getRoom(roomId);
    const currentSong = room.queue[room.currentIndex];
    const allSongs = [...room.songsPlayed];
    if (currentSong && !allSongs.find(s => s.videoId === currentSong.videoId))
      allSongs.push({ ...currentSong, playedAt: room.sessionStart });
    // Enrich songs with DNA for the DNA card
    const enrichedSongs = await Promise.all(
      allSongs.map(async s => {
        const dna = await enrichSong(s.videoId, s.title).catch(() => ({}));
        return { ...s, ...dna };
      })
    );
    socket.emit('recap-data', {
      songsPlayed: enrichedSongs,
      sessionStart: room.sessionStart,
      sessionDuration: Date.now() - room.sessionStart,
      userCount: Object.keys(room.users).length,
      users: Object.values(room.users),
      roomId,
    });
  });

  socket.on('disconnect', async () => {
    const { roomId, username } = socket;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].users[socket.id];
      const users = Object.values(rooms[roomId].users);

      if (rooms[roomId].djId === socket.id && users.length > 0) {
        rooms[roomId].djId = users[0].id;
        io.to(roomId).emit('dj-mode-changed', { djMode: rooms[roomId].djMode, djId: rooms[roomId].djId });
      }

      io.to(roomId).emit('user-left', { userId: socket.id, username, users });

      // If room is empty, remove from memory AND clean up from DB
      if (users.length === 0) {
        delete rooms[roomId];
        if (MONGO_URI) {
          try {
            await Room.deleteOne({ roomId });
            console.log(`🗑  Room "${roomId}" deleted from DB (empty)`);
          } catch (e) {
            console.error('Room cleanup error:', e.message);
          }
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎵 Groove Together server on port ${PORT}`);
});
