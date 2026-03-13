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

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      queue: [], currentIndex: 0, currentTime: 0,
      isPlaying: false, users: {}, djId: null, djMode: false,
      sessionStart: Date.now(), songsPlayed: []
    };
  }
  return rooms[roomId];
}

// ─── SOCKET.IO ────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, username, avatar, discordId }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    const room = getRoom(roomId);
    const isFirstUser = Object.keys(room.users).length === 0;
    room.users[socket.id] = { id: socket.id, discordId, username, avatar, joinedAt: Date.now() };
    if (isFirstUser) room.djId = socket.id;
    socket.emit('room-state', {
      queue: room.queue, currentIndex: room.currentIndex,
      currentTime: room.currentTime, isPlaying: room.isPlaying,
      users: Object.values(room.users), djId: room.djId,
      djMode: room.djMode, sessionStart: room.sessionStart,
      songsPlayed: room.songsPlayed
    });
    socket.to(roomId).emit('user-joined', { user: room.users[socket.id], users: Object.values(room.users) });
  });

  socket.on('play', ({ roomId, time }) => {
    const room = getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) return;
    room.isPlaying = true; room.currentTime = time;
    socket.to(roomId).emit('play', { time });
  });

  socket.on('pause', ({ roomId, time }) => {
    const room = getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) return;
    room.isPlaying = false; room.currentTime = time;
    socket.to(roomId).emit('pause', { time });
  });

  socket.on('seek', ({ roomId, time }) => {
    const room = getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) return;
    room.currentTime = time;
    socket.to(roomId).emit('seek', { time });
  });

  socket.on('add-song', ({ roomId, videoId, title, addedBy }) => {
    const room = getRoom(roomId);
    room.queue.push({ videoId, title, addedBy });
    io.to(roomId).emit('queue-updated', { queue: room.queue });
  });

  socket.on('load-song', ({ roomId, index }) => {
    const room = getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) return;
    const prev = room.queue[room.currentIndex];
    if (prev && !room.songsPlayed.find(s => s.videoId === prev.videoId))
      room.songsPlayed.push({ ...prev, playedAt: Date.now() });
    room.currentIndex = index; room.currentTime = 0; room.isPlaying = true;
    io.to(roomId).emit('load-song', { index, videoId: room.queue[index]?.videoId, title: room.queue[index]?.title, queue: room.queue });
  });

  socket.on('remove-song', ({ roomId, index }) => {
    const room = getRoom(roomId);
    room.queue.splice(index, 1);
    if (room.currentIndex >= room.queue.length)
      room.currentIndex = Math.max(0, room.queue.length - 1);
    io.to(roomId).emit('queue-updated', { queue: room.queue });
  });

  socket.on('push-category', ({ roomId, songs, categoryName, username }) => {
    const room = getRoom(roomId);
    songs.forEach(song => room.queue.push({ ...song, addedBy: username }));
    io.to(roomId).emit('queue-updated', { queue: room.queue });
    io.to(roomId).emit('category-pushed', { categoryName, username, count: songs.length });
  });

  socket.on('toggle-dj-mode', ({ roomId }) => {
    const room = getRoom(roomId);
    if (socket.id !== room.djId) return;
    room.djMode = !room.djMode;
    io.to(roomId).emit('dj-mode-changed', { djMode: room.djMode, djId: room.djId });
  });

  socket.on('sync-heartbeat', ({ roomId, time }) => {
    const room = getRoom(roomId);
    room.currentTime = time;
    socket.to(roomId).emit('sync-check', { time });
  });

  socket.on('chat-msg', ({ roomId, msg }) => socket.to(roomId).emit('chat-msg', msg));
  socket.on('reaction', ({ roomId, emoji, username }) => socket.to(roomId).emit('reaction', { emoji, username }));

  socket.on('get-recap', ({ roomId }) => {
    const room = getRoom(roomId);
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

  socket.on('disconnect', () => {
    const { roomId, username } = socket;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].users[socket.id];
      const users = Object.values(rooms[roomId].users);
      if (rooms[roomId].djId === socket.id && users.length > 0) {
        rooms[roomId].djId = users[0].id;
        io.to(roomId).emit('dj-mode-changed', { djMode: rooms[roomId].djMode, djId: rooms[roomId].djId });
      }
      io.to(roomId).emit('user-left', { userId: socket.id, username, users });
      if (users.length === 0) delete rooms[roomId];
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎵 Groove Together server on port ${PORT}`);
});
