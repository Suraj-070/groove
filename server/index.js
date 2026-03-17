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
    .catch(e => console.error('❌ MongoDB error:', e.message))
} else {
  console.warn('⚠️  No MONGODB_URI set — library will not persist across restarts')
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
  roomId:    { type: String, required: true, index: true },
  id:        { type: String, required: true },
  username:  { type: String, default: 'system' },
  text:      { type: String, default: '' },
  ts:        { type: Number, required: true },
  type:      { type: String, default: 'msg' },
  avatar:    { type: String, default: null },
  edited:    { type: Boolean, default: false },
  replyTo:   { type: mongoose.Schema.Types.Mixed, default: null },
  reactions: { type: mongoose.Schema.Types.Mixed, default: {} },
  status:    { type: String, default: 'sent' },
  createdAt: { type: Date, default: Date.now }   // TTL uses this
});

// TTL index on createdAt — auto-delete after 24 hours
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });
// Index for fast room queries
messageSchema.index({ roomId: 1, ts: 1 });

// Force fresh model — never use cached version with old schema
if (mongoose.models.Message) delete mongoose.models.Message;
const Message = mongoose.model('Message', messageSchema);

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
  category: { type: String },  // derived: Sad/Chill/Party/Focus/Hype/Romance/Feel Good/Hip-Hop/Vibes
  fetchedAt:{ type: Number, default: () => Date.now() },
});
songDNASchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30 day cache
const SongDNA = mongoose.models.SongDNA || mongoose.model('SongDNA', songDNASchema);

// ── Map Last.fm tags → mood/energy/danceability ─────────────
function mapLastFmTags(tags = []) {
  const t = tags.map(t => (t.name || '').toLowerCase());
  const has = (...words) => words.some(w => t.some(tag => tag.includes(w)));

  let mood = 'neutral';
  let energy = 0.5;
  let danceability = 0.5;

  // Mood
  if (has('sad', 'melanchol', 'heartbreak', 'emotional', 'crying', 'depressing')) mood = 'sad';
  else if (has('happy', 'euphoric', 'uplifting', 'feel good', 'joyful', 'positive')) mood = 'euphoric';
  else if (has('chill', 'relax', 'calm', 'peaceful', 'ambient', 'sleep', 'lofi', 'lo-fi')) mood = 'chill';
  else if (has('aggressive', 'angry', 'intense', 'rage', 'metal', 'hardcore')) mood = 'aggressive';
  else if (has('romantic', 'love', 'sensual', 'smooth')) mood = 'romantic';

  // Energy
  if (has('energetic', 'pump', 'workout', 'hype', 'intense', 'power', 'edm', 'dubstep', 'drum and bass', 'dnb', 'hardstyle')) energy = 0.9;
  else if (has('party', 'dance', 'club', 'banger', 'trap', 'hip hop', 'hip-hop')) energy = 0.75;
  else if (has('chill', 'relax', 'ambient', 'lofi', 'lo-fi', 'sleep', 'study')) energy = 0.2;
  else if (has('indie', 'acoustic', 'folk', 'soft', 'mellow', 'slow')) energy = 0.35;

  // Danceability
  if (has('dance', 'club', 'edm', 'house', 'techno', 'disco', 'funk', 'groove', 'afrobeats')) danceability = 0.9;
  else if (has('hip hop', 'hip-hop', 'trap', 'r&b', 'rnb', 'pop')) danceability = 0.72;
  else if (has('ballad', 'acoustic', 'classical', 'ambient', 'lofi')) danceability = 0.2;

  return { mood, energy, danceability };
}

// ── Estimate BPM from title keywords ─────────────────────────
function estimateBpmFromTitle(title = '') {
  const t = title.toLowerCase();
  if (t.includes('slowed')) return 65;
  if (t.includes('nightcore')) return 160;
  if (t.includes('lofi') || t.includes('lo-fi')) return 85;
  if (t.includes('drum and bass') || t.includes('dnb')) return 174;
  if (t.includes('hardstyle')) return 150;
  if (t.includes('dubstep')) return 140;
  if (t.includes('house')) return 125;
  if (t.includes('techno')) return 135;
  if (t.includes('trap')) return 70;
  if (t.includes('drill')) return 145;
  if (t.includes('reggaeton')) return 95;
  if (t.includes('ballad') || t.includes('acoustic')) return 75;
  return null;
}

async function enrichSong(videoId, title) {
  // Check cache first
  if (MONGO_URI) {
    const cached = await SongDNA.findOne({ videoId }).lean();
    if (cached) return cached;
  }

  const dna = { videoId, title, bpm: null, energy: 0.5, mood: 'neutral', danceability: 0.5, genre: null, category: null };

  try {
    const clean = (title || '').replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 80);

    // ── 1. Deezer — BPM, gain, genre (no API key needed) ─────
    try {
      const dzRes = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(clean)}&limit=1&output=json`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(4000) }
      );
      if (dzRes.ok) {
        const dzData = await dzRes.json();
        const track = dzData?.data?.[0];
        if (track) {
          if (track.bpm && track.bpm > 40 && track.bpm < 220) dna.bpm = Math.round(track.bpm);
          if (track.gain != null) {
            // gain is in dB (-15 to +5 range) — normalize to 0-1 energy
            dna.energy = Math.min(1, Math.max(0, (track.gain + 15) / 20));
          }
          if (track.album?.genre_id && track.album.genre_id > 0) {
            // Map Deezer genre IDs to names
            const genreMap = { 132:'pop', 116:'rap', 152:'electro', 113:'dance', 129:'jazz',
              98:'classical', 144:'reggae', 197:'latin', 165:'soul', 85:'alternative',
              100:'folk', 173:'r&b', 106:'rock', 169:'metal' };
            dna.genre = genreMap[track.album.genre_id] || null;
          }
        }
      }
    } catch { /* Deezer is best-effort */ }

    // ── 2. Last.fm — mood, energy refinement, genre tags ─────
    if (process.env.LASTFM_API_KEY) {
      try {
        const lfRes = await fetch(
          `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(clean)}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (lfRes.ok) {
          const lfSearch = await lfRes.json();
          const match = lfSearch?.results?.trackmatches?.track?.[0];
          if (match?.name && match?.artist) {
            // Get top tags for the track
            const tagsRes = await fetch(
              `https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&track=${encodeURIComponent(match.name)}&artist=${encodeURIComponent(match.artist)}&api_key=${process.env.LASTFM_API_KEY}&format=json`,
              { signal: AbortSignal.timeout(4000) }
            );
            if (tagsRes.ok) {
              const tagsData = await tagsRes.json();
              const tags = tagsData?.toptags?.tag || [];
              // Only use tags with count > 10 (more reliable)
              const goodTags = tags.filter(t => parseInt(t.count) > 10);
              const mapped = mapLastFmTags(goodTags);
              dna.mood = mapped.mood;
              // Refine energy — Deezer gain wins if available, else use Last.fm
              if (dna.energy === 0.5) dna.energy = mapped.energy;
              dna.danceability = mapped.danceability;
              // Genre from tags if Deezer didn't give one
              if (!dna.genre && goodTags.length > 0) {
                dna.genre = goodTags[0].name.toLowerCase();
              }
            }
          }
        }
      } catch { /* Last.fm is best-effort */ }
    }

    // ── 3. BPM fallback from title keywords ──────────────────
    if (!dna.bpm) {
      const titleBpm = estimateBpmFromTitle(title);
      if (titleBpm) dna.bpm = titleBpm;
    }

    // ── 4. YouTube tags for category ─────────────────────────
    let ytTags = [];
    if (process.env.YOUTUBE_API_KEY) {
      try {
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          ytTags = ytData.items?.[0]?.snippet?.tags || [];
        }
      } catch {}
    }
    dna.category = deriveCategory(dna, ytTags);

    // ── 5. Cache in MongoDB ───────────────────────────────────
    if (MONGO_URI) {
      await SongDNA.findOneAndUpdate(
        { videoId },
        { ...dna, fetchedAt: Date.now() },
        { upsert: true }
      );
    }
  } catch (e) { /* enrichment is always best-effort — never block playback */ }

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

// Derive human-readable category from DNA + YouTube tags
function deriveCategory(dna, ytTags = []) {
  const { bpm, mood, danceability, energy, genre } = dna;
  const tags = (ytTags || []).join(' ').toLowerCase();
  const titleLower = (dna.title || '').toLowerCase();
  const combined = tags + ' ' + titleLower;

  // YouTube tag heuristics (strong signal — music videos tag themselves)
  if (/sad|heartbreak|crying|emotional|breakup|grief|miss you/.test(combined)) return 'Sad';
  if (/lo.?fi|study|focus|concentration|work|deep work/.test(combined)) return 'Focus';
  if (/workout|gym|beast mode|motivation|hype|rage|aggressive/.test(combined)) return 'Hype';
  if (/chill|relax|calm|ambient|peaceful|sleep|night/.test(combined)) return 'Chill';
  if (/party|club|dance|EDM|rave|festival|banger/.test(combined)) return 'Party';
  if (/love|romantic|romance|wedding|R&B|soul/.test(combined)) return 'Romance';
  if (/hip.?hop|rap|trap|drill|freestyle|cypher/.test(combined)) return 'Hip-Hop';
  if (/feel good|happy|summer|good vibes|positive|upbeat/.test(combined)) return 'Feel Good';

  // Deezer + Last.fm data
  if (mood === 'sad' || energy < 0.25) return 'Sad';
  if (bpm && bpm < 80 && mood !== 'sad' && energy < 0.45) return 'Chill';
  if (bpm && bpm < 90 && danceability < 0.4 && energy < 0.5) return 'Focus';
  if (bpm && bpm > 145 && energy > 0.7) return 'Hype';
  if (danceability > 0.72 && bpm > 118 && energy > 0.65) return 'Party';
  if (mood === 'euphoric' && danceability > 0.55) return 'Feel Good';
  if (mood === 'confident' && bpm > 85) return 'Hip-Hop';
  if (energy > 0.4 && energy < 0.65 && mood !== 'aggressive') return 'Chill';

  // Genre fallback
  if (genre) {
    if (/hip|rap/.test(genre)) return 'Hip-Hop';
    if (/dan|elec/.test(genre)) return 'Party';
    if (/roc/.test(genre)) return 'Hype';
    if (/cla|jaz/.test(genre)) return 'Focus';
    if (/r.b|sou/.test(genre)) return 'Romance';
  }

  return 'Vibes'; // catch-all
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
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    return await Message.find(
      { roomId, createdAt: { $gte: since } },
      { roomId: 0, __v: 0 }
    ).sort({ ts: 1 }).limit(200).lean();
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

  // Only persist real chat messages — not system/np dividers
  if (!MONGO_URI || msg.type !== 'msg') return;
  try {
    await Message.create({ roomId, ...msg, createdAt: new Date() });
    console.log('[Chat] Saved message from', msg.username, 'in room', roomId);
  } catch (e) {
    console.error('[Chat] saveMessage error:', e.message);
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
    queue: [], currentIndex: 0, currentTime: 0, currentTimeAt: Date.now(),
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

// ─── USER PROFILE SCHEMA ─────────────────────────────────────
const userProfileSchema = new mongoose.Schema({
  userId:       { type: String, required: true, unique: true, index: true },
  username:     { type: String },
  avatar:       { type: String },
  streak:       { type: Number, default: 0 },
  longestStreak:{ type: Number, default: 0 },
  lastJoinDate: { type: String, default: '' }, // YYYY-MM-DD
  streakMilestones: { type: [Number], default: [] }, // [7,30,100] earned
  totalSessions:{ type: Number, default: 0 },
  totalSongs:   { type: Number, default: 0 },
  createdAt:    { type: Number, default: () => Date.now() },
});
const UserProfile = mongoose.models.UserProfile || mongoose.model('UserProfile', userProfileSchema);

// Sync all indexes after models are defined — handles TTL changes etc
if (MONGO_URI) {
  mongoose.connection.once('open', async () => {
    try {
      await Promise.all([
        Message.syncIndexes(),
        SongDNA.syncIndexes(),
        ListenHistory.syncIndexes(),
      ])
      console.log('✅ MongoDB indexes synced')
    } catch (e) {
      console.warn('⚠️  Index sync warning:', e.message)
    }
  })
}

// ─── ROOM SESSION SCHEMA (for chemistry + time machine) ───────
const roomSessionSchema = new mongoose.Schema({
  roomId:       { type: String, required: true, index: true },
  sessionStart: { type: Number, required: true },
  sessionEnd:   { type: Number },
  participants: [{ userId: String, username: String, avatar: String, joinedAt: Number }],
  songsPlayed:  { type: Array, default: [] },
  reactions:    { type: Object, default: {} }, // { videoId: { emoji: count } }
  chemistry:    { type: Number, default: 0 },
  dominantMood: { type: String, default: 'neutral' },
  avgBpm:       { type: Number },
});
roomSessionSchema.index({ sessionStart: -1 });
roomSessionSchema.index({ 'participants.userId': 1 });
const RoomSession = mongoose.models.RoomSession || mongoose.model('RoomSession', roomSessionSchema);

// ─── STREAK HELPERS ───────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function updateStreak(userId, username, avatar) {
  if (!MONGO_URI || !userId) return null;
  try {
    const today = todayStr();
    let profile = await UserProfile.findOne({ userId });
    if (!profile) {
      profile = await UserProfile.create({ userId, username, avatar, streak: 1, longestStreak: 1, lastJoinDate: today, totalSessions: 1 });
      return { streak: 1, isNew: true, milestone: null };
    }
    if (profile.lastJoinDate === today) return { streak: profile.streak, isNew: false, milestone: null };

    const last = new Date(profile.lastJoinDate || '2000-01-01');
    const diff = Math.floor((new Date(today) - last) / 86400000);
    const newStreak = diff === 1 ? profile.streak + 1 : 1;
    const longest   = Math.max(newStreak, profile.longestStreak || 0);
    const MILESTONES = [3, 7, 14, 30, 60, 100, 365];
    const milestone  = MILESTONES.find(m => newStreak === m && !(profile.streakMilestones||[]).includes(m)) || null;
    const milestones = milestone ? [...(profile.streakMilestones||[]), milestone] : (profile.streakMilestones||[]);

    await UserProfile.updateOne({ userId }, {
      username, avatar,
      streak: newStreak,
      longestStreak: longest,
      lastJoinDate: today,
      milestones,
      $inc: { totalSessions: 1 }
    });
    return { streak: newStreak, isNew: diff > 1, milestone, longestStreak: longest };
  } catch (e) { console.error('updateStreak error:', e.message); return null; }
}

// ─── CHEMISTRY ALGORITHM ─────────────────────────────────────
async function computeChemistry(participants, songsPlayed, reactions) {
  if (participants.length < 2) return 50;
  try {
    // Song DNA for played songs
    const dnaList = await Promise.all(songsPlayed.slice(0,20).map(s => enrichSong(s.videoId, s.title).catch(()=>({}))));
    
    // Taste overlap — how similar are played song categories
    const cats = dnaList.map(d => d.category || 'Vibes');
    const uniqueCats = new Set(cats);
    const variety = Math.min(100, uniqueCats.size * 15);
    
    // Reaction sync — did everyone react to the same songs
    const reactionScores = Object.values(reactions || {});
    const totalReactions = reactionScores.reduce((a, b) => a + Object.values(b).reduce((x,y)=>x+y,0), 0);
    const reactionDensity = Math.min(100, totalReactions * 5);
    
    // Retention score — how long did people stay
    const sessionLen = Date.now() - (songsPlayed[0]?.playedAt || Date.now());
    const retentionScore = Math.min(100, (sessionLen / 60000) * 5); // 20min = 100%
    
    const chemistry = Math.round(variety * 0.3 + reactionDensity * 0.4 + retentionScore * 0.3);
    return Math.min(100, Math.max(10, chemistry));
  } catch { return 50; }
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

// Categorize songs in bulk — used by Library and Queue
app.post('/categorize', requireAuth, async (req, res) => {
  const { songs } = req.body;
  if (!Array.isArray(songs)) return res.status(400).json({ error: 'songs array required' });
  const capped = songs.slice(0, 50);
  try {
    const results = await Promise.all(
      capped.map(async s => {
        const dna = await enrichSong(s.videoId, s.title);
        return {
          videoId: s.videoId,
          category: dna.category || 'Vibes',
          mood: dna.mood || 'neutral',
          bpm: dna.bpm || null,
          energy: dna.energy || null,
        };
      })
    );
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Categorization failed' });
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

// ─── STREAK + PROFILE ENDPOINTS ─────────────────────────────

app.get('/profile/me', requireAuth, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user.id }).lean();
    res.json({ profile: profile || { userId: req.user.id, streak: 0, longestStreak: 0 } });
  } catch (e) { res.status(500).json({ error: 'Failed to load profile' }); }
});

app.get('/profile/leaderboard/:roomId', requireAuth, async (req, res) => {
  try {
    // Top streaks among users who have been in this room
    const sessions = await RoomSession.find({ 'participants.roomId': req.params.roomId }).lean();
    const userIds  = [...new Set(sessions.flatMap(s => s.participants.map(p => p.userId)))];
    const profiles = await UserProfile.find({ userId: { $in: userIds } })
      .sort({ streak: -1 }).limit(10).lean();
    res.json({ leaderboard: profiles });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ─── CHEMISTRY ENDPOINTS ─────────────────────────────────────

app.get('/chemistry/:roomId', requireAuth, async (req, res) => {
  try {
    const sessions = await RoomSession.find({ roomId: req.params.roomId })
      .sort({ sessionStart: -1 }).limit(10).lean();
    const avg = sessions.length
      ? Math.round(sessions.reduce((a,s)=>a+s.chemistry,0)/sessions.length)
      : null;
    res.json({ sessions, avgChemistry: avg });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ─── GROOVE TIME MACHINE ENDPOINTS ───────────────────────────

app.get('/time-machine', requireAuth, async (req, res) => {
  try {
    const today = new Date();
    const memories = [];
    // Check 30, 60, 90, 365 days ago
    for (const daysAgo of [7, 14, 30, 60, 90, 365]) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - daysAgo);
      const dayStart = new Date(targetDate.setHours(0,0,0,0)).getTime();
      const dayEnd   = dayStart + 86400000;
      const sessions = await RoomSession.find({
        sessionStart: { $gte: dayStart, $lt: dayEnd },
        'participants.userId': req.user.id,
      }).lean();
      if (sessions.length > 0) {
        memories.push({
          daysAgo,
          date: new Date(dayStart).toISOString(),
          sessions: sessions.map(s => ({
            roomId: s.roomId,
            songsPlayed: s.songsPlayed,
            participants: s.participants,
            chemistry: s.chemistry,
            dominantMood: s.dominantMood,
            sessionStart: s.sessionStart,
          }))
        });
      }
    }
    res.json({ memories });
  } catch (e) { res.status(500).json({ error: 'Failed to load memories' }); }
});

// ─── GROOVE RADAR ENDPOINT ────────────────────────────────────

app.get('/radar', requireAuth, async (req, res) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Radar not configured' });
  try {
    // Build fingerprint from listen history
    const history = await ListenHistory.find({ userId: req.user.id })
      .sort({ listenedAt: -1 }).limit(100).lean();
    if (history.length < 3) return res.json({ results: [], message: 'Listen to more songs to unlock Radar' });

    const dnaList = await Promise.all(history.slice(0,30).map(h => enrichSong(h.videoId, h.title).catch(()=>({}))));
    const valid   = dnaList.filter(d => d.bpm || d.energy != null);
    const avgBpm  = valid.filter(d=>d.bpm).reduce((a,d)=>a+d.bpm,0) / (valid.filter(d=>d.bpm).length||1);
    const avgEnergy = valid.filter(d=>d.energy!=null).reduce((a,d)=>a+d.energy,0) / (valid.filter(d=>d.energy!=null).length||1);
    const moodCounts = {};
    dnaList.forEach(d => { if(d.mood) moodCounts[d.mood]=(moodCounts[d.mood]||0)+1; });
    const dominantMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'neutral';
    const catCounts = {};
    dnaList.forEach(d => { if(d.category) catCounts[d.category]=(catCounts[d.category]||0)+1; });
    const dominantCat = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Vibes';

    // Build search query from fingerprint
    const MOOD_QUERIES = {
      euphoric: 'upbeat feel good energy',
      confident: 'confident anthem bold',
      chill: 'chill relaxing calm vibes',
      sad: 'emotional heartfelt melancholy',
      aggressive: 'intense powerful hype',
      neutral: 'popular music',
    };
    const BPM_LABEL = avgBpm > 130 ? 'fast energetic' : avgBpm > 100 ? 'upbeat mid-tempo' : avgBpm > 75 ? 'mid-tempo' : 'slow';
    const catQuery  = dominantCat !== 'Vibes' ? dominantCat.toLowerCase() : '';
    const query     = `${MOOD_QUERIES[dominantMood]||'music'} ${BPM_LABEL} ${catQuery} music`.trim();

    // YouTube search
    const ytUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    ytUrl.searchParams.set('part', 'snippet');
    ytUrl.searchParams.set('q', query);
    ytUrl.searchParams.set('type', 'video');
    ytUrl.searchParams.set('videoCategoryId', '10');
    ytUrl.searchParams.set('maxResults', '20');
    ytUrl.searchParams.set('key', apiKey);
    const ytRes = await fetch(ytUrl.toString());
    const ytData = await ytRes.json();
    const items  = ytData.items || [];

    // Filter out already heard songs
    const historyIds = new Set(history.map(h => h.videoId));
    const fresh = items.filter(item => !historyIds.has(item.id.videoId));

    // Enrich + score each result
    const fingerprint = { bpm: avgBpm, energy: avgEnergy, mood: dominantMood };
    const scored = await Promise.all(fresh.slice(0, 12).map(async item => {
      const dna = await enrichSong(item.id.videoId, item.snippet.title).catch(() => ({}));
      // Similarity score
      let score = 60;
      if (dna.bpm && fingerprint.bpm) score += Math.max(-25, 25 - Math.abs(dna.bpm - fingerprint.bpm) / 2);
      if (dna.energy != null && fingerprint.energy != null) score += Math.max(-20, 20 - Math.abs(dna.energy - fingerprint.energy) * 40);
      if (dna.mood === fingerprint.mood) score += 15;
      score = Math.max(10, Math.min(99, Math.round(score)));
      return {
        videoId: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url,
        matchScore: score,
        mood: dna.mood || null,
        bpm: dna.bpm || null,
        category: dna.category || null,
      };
    }));

    const results = scored.sort((a,b) => b.matchScore - a.matchScore).filter(r => r.matchScore >= 40);
    res.json({ results, fingerprint: { mood: dominantMood, bpm: Math.round(avgBpm), category: dominantCat }, query });
  } catch (e) {
    console.error('radar error:', e.message);
    res.status(500).json({ error: 'Radar failed' });
  }
});

// ─── SMART RADIO ENDPOINT ─────────────────────────────────────

app.post('/radio/next', requireAuth, async (req, res) => {
  const { lastSong, roomHistory = [] } = req.body;
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !lastSong) return res.status(400).json({ error: 'Missing data' });
  try {
    const dna = await enrichSong(lastSong.videoId, lastSong.title).catch(() => ({}));
    const MOOD_QUERIES = {
      euphoric:'upbeat feel good', confident:'confident bold anthem',
      chill:'chill relaxing calm', sad:'emotional heartfelt',
      aggressive:'intense hype powerful', neutral:'popular music',
    };
    const bpmLabel = (dna.bpm||120) > 130 ? 'fast' : (dna.bpm||120) > 100 ? 'upbeat' : 'chill';
    const query = `${MOOD_QUERIES[dna.mood||'neutral']} ${bpmLabel} ${dna.category||''} music`.trim();

    const ytUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    ytUrl.searchParams.set('part','snippet');
    ytUrl.searchParams.set('q', query);
    ytUrl.searchParams.set('type','video');
    ytUrl.searchParams.set('videoCategoryId','10');
    ytUrl.searchParams.set('maxResults','10');
    ytUrl.searchParams.set('key', apiKey);
    const ytRes  = await fetch(ytUrl.toString());
    const ytData = await ytRes.json();
    const historyIds = new Set([...roomHistory, lastSong.videoId]);
    const fresh = (ytData.items||[]).filter(item => !historyIds.has(item.id.videoId));

    const songs = fresh.slice(0,5).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      addedBy: '📻 Radio',
      thumbnail: item.snippet.thumbnails?.medium?.url,
    }));
    res.json({ songs, mood: dna.mood, query });
  } catch (e) {
    res.status(500).json({ error: 'Radio failed' });
  }
});

// ─── WEEKLY WRAPPED ENDPOINT ──────────────────────────────────

app.get('/wrapped', requireAuth, async (req, res) => {
  try {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const history = await ListenHistory.find({
      userId: req.user.id, listenedAt: { $gt: weekAgo }
    }).sort({ listenedAt: -1 }).lean();

    if (history.length < 3) return res.json({ wrapped: null, message: 'Not enough data for this week yet' });

    // Top songs by frequency
    const songCounts = {};
    history.forEach(h => { songCounts[h.videoId] = { ...(songCounts[h.videoId]||{title:h.title,videoId:h.videoId,count:0}), count: (songCounts[h.videoId]?.count||0)+1 }; });
    const topSongs = Object.values(songCounts).sort((a,b)=>b.count-a.count).slice(0,5);

    // DNA analysis
    const dnaList = await Promise.all(history.slice(0,30).map(h => enrichSong(h.videoId, h.title).catch(()=>({}))));
    const moodCounts = {};
    dnaList.forEach(d => { if(d.mood) moodCounts[d.mood]=(moodCounts[d.mood]||0)+1; });
    const dominantMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'neutral';
    const bpms = dnaList.filter(d=>d.bpm).map(d=>d.bpm);
    const avgBpm = bpms.length ? Math.round(bpms.reduce((a,b)=>a+b,0)/bpms.length) : null;

    // Sessions this week
    const sessions = await RoomSession.find({
      sessionStart: { $gt: weekAgo }, 'participants.userId': req.user.id
    }).lean();
    const totalMinutes = Math.round(history.length * 3.5); // estimate ~3.5min per song
    const uniqueRooms  = new Set(sessions.map(s=>s.roomId)).size;
    const topRoom      = sessions.reduce((best,s) => {
      const cnt = sessions.filter(x=>x.roomId===s.roomId).length;
      return cnt > (best.count||0) ? { roomId: s.roomId, count: cnt } : best;
    }, {});

    // Profile for streak
    const profile = await UserProfile.findOne({ userId: req.user.id }).lean();

    res.json({
      wrapped: {
        weekStart: new Date(weekAgo).toISOString(),
        topSongs,
        dominantMood,
        avgBpm,
        totalSongs: history.length,
        totalMinutes,
        uniqueRooms,
        topRoom: topRoom.roomId || null,
        streak: profile?.streak || 0,
        moodBreakdown: moodCounts,
        sessions: sessions.length,
      }
    });
  } catch (e) {
    console.error('wrapped error:', e.message);
    res.status(500).json({ error: 'Failed to build wrapped' });
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
    if (isFirstUser) {
      room.djId = socket.id;
      room.reactions = {}; // track reactions per session
    }
    // Update streak for this user
    if (discordId) {
      const streakData = await updateStreak(discordId, username, avatar);
      if (streakData) {
        socket.emit('streak-update', streakData);
        if (streakData.milestone) {
          io.to(roomId).emit('streak-milestone', { username, streak: streakData.milestone });
        }
      }
    }
    const chatHistory = await getMessages(roomId);
    // Estimate actual current time accounting for elapsed since last heartbeat
    let estimatedTime = room.currentTime || 0;
    if (room.isPlaying && room.currentTimeAt) {
      const elapsed = (Date.now() - room.currentTimeAt) / 1000;
      estimatedTime = Math.max(0, estimatedTime + elapsed);
    }
    socket.emit('room-state', {
      queue: room.queue, currentIndex: room.currentIndex,
      currentTime: estimatedTime, isPlaying: room.isPlaying,
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
    room.currentIndex = index; room.currentTime = 0; room.currentTimeAt = Date.now(); room.isPlaying = true;
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
    // Only the DJ / active player should send heartbeats
    // Don't persist this to DB — it's always slightly stale
    // Just relay to listeners so they can re-sync if drifted
    if (room.djMode && socket.id !== room.djId) return;
    // Update in-memory only (not saved to MongoDB)
    if (rooms[roomId]) {
      rooms[roomId].currentTime = time;
      rooms[roomId].currentTimeAt = Date.now(); // track when we last knew the time
    }
    socket.to(roomId).emit('sync-check', { time });
  });

  socket.on('chat-edit', ({ roomId, msgId, text }) => {
    io.to(roomId).emit('chat-edit', { msgId, text })
    if (MONGO_URI) {
      Message.updateOne({ id: msgId }, { $set: { text, edited: true } }).catch(() => {})
    }
  })

  socket.on('chat-reaction', ({ roomId, msgId, emoji, username, action }) => {
    io.to(roomId).emit('chat-reaction', { msgId, emoji, username, action })
    // Persist reaction to MongoDB
    if (MONGO_URI) {
      const field = `reactions.${emoji}`
      if (action === 'add') {
        Message.updateOne({ id: msgId }, { $addToSet: { [`reactions.${emoji}.users`]: username }, $inc: { [`reactions.${emoji}.count`]: 1 } }).catch(() => {})
      } else {
        Message.updateOne({ id: msgId }, { $pull: { [`reactions.${emoji}.users`]: username }, $inc: { [`reactions.${emoji}.count`]: -1 } }).catch(() => {})
      }
    }
  })

  socket.on('chat-pin', ({ roomId, msg }) => {
    io.to(roomId).emit('chat-pin', { msg })
  })

  socket.on('chat-unpin', ({ roomId }) => {
    io.to(roomId).emit('chat-unpin')
  })

  socket.on('chat-read', ({ roomId, msgId }) => {
    // Notify the sender their message was read
    socket.to(roomId).emit('chat-read', { msgId })
  })

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
    // Track for chemistry calculation
    if (rooms[roomId]) {
      if (!rooms[roomId].reactions) rooms[roomId].reactions = {};
      if (!rooms[roomId].reactions[videoId]) rooms[roomId].reactions[videoId] = {};
      rooms[roomId].reactions[videoId][emoji] = (rooms[roomId].reactions[videoId][emoji] || 0) + 1;
    }
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
      // Save session when room empties
      if (users.length === 0 && MONGO_URI) {
        const room = rooms[roomId];
        const allUsers = Object.values(room.users || {}); // already deleted but may have others
        try {
          const participants = Object.entries(room.users || {}).map(([sid, u]) => ({
            userId: u.discordId, username: u.username, avatar: u.avatar, joinedAt: u.joinedAt
          }));
          const chemistry = await computeChemistry(participants, room.songsPlayed || [], room.reactions || {});
          const dnaList = await Promise.all((room.songsPlayed||[]).slice(0,20).map(s=>enrichSong(s.videoId,s.title).catch(()=>({}))));
          const moodCounts = {};
          dnaList.forEach(d => { if(d.mood) moodCounts[d.mood]=(moodCounts[d.mood]||0)+1; });
          const dominantMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'neutral';
          const bpms = dnaList.filter(d=>d.bpm).map(d=>d.bpm);
          const avgBpm = bpms.length ? Math.round(bpms.reduce((a,b)=>a+b,0)/bpms.length) : null;
          await RoomSession.create({
            roomId,
            sessionStart: room.sessionStart || Date.now(),
            sessionEnd: Date.now(),
            participants,
            songsPlayed: room.songsPlayed || [],
            reactions: room.reactions || {},
            chemistry,
            dominantMood,
            avgBpm,
          });
          console.log(`[Session] saved room="${roomId}" chemistry=${chemistry}% songs=${(room.songsPlayed||[]).length}`);
        } catch(e) { console.error('session save error:', e.message); }
      }

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