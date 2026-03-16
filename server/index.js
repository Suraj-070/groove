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
    socket.emit('recap-data', {
      songsPlayed: allSongs, sessionStart: room.sessionStart,
      sessionDuration: Date.now() - room.sessionStart,
      userCount: Object.keys(room.users).length,
      users: Object.values(room.users)
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