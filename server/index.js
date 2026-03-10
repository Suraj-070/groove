require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { randomUUID } = require('crypto');

const app = express();

app.set('trust proxy', 1)
const isProd = !!process.env.FRONTEND_URL

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true)
    else cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['set-cookie']
}));

app.options('*', cors())

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

// ─── DISCORD PASSPORT ─────────────────────────────────────────
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
  return done(null, {
    id: profile.id,
    username: profile.username,
    avatar: profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(profile.id) % 5}.png`
  });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ─── AUTH ROUTES ──────────────────────────────────────────────
app.get('/auth/discord', passport.authenticate('discord'));

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173'

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: `${FRONTEND}?error=auth_failed` }),
  (req, res) => {
    res.redirect(`${FRONTEND}?auth=success`)
  }
);

app.get('/auth/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.json({ success: true });
  });
});

// ─── LIBRARY PERSISTENCE ──────────────────────────────────────
const LIBRARY_FILE = path.join(__dirname, 'library.json');

function loadLibraries() {
  try {
    if (fs.existsSync(LIBRARY_FILE))
      return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
  } catch (e) { console.error('Failed to load library:', e); }
  return {};
}

function saveLibraries() {
  try { fs.writeFileSync(LIBRARY_FILE, JSON.stringify(libraries, null, 2)); }
  catch (e) { console.error('Failed to save library:', e); }
}

const libraries = loadLibraries();

function getLibrary(userId) {
  if (!libraries[userId]) libraries[userId] = { categories: [] };
  return libraries[userId];
}

// Auth middleware
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ─── LIBRARY REST API ─────────────────────────────────────────
app.get('/library', requireAuth, (req, res) => {
  res.json(getLibrary(req.user.id));
});

app.post('/library/categories', requireAuth, (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const lib = getLibrary(req.user.id);
  const category = { id: randomUUID(), name: name.trim(), color: color || '#7c6aff', songs: [], createdAt: Date.now() };
  lib.categories.push(category);
  saveLibraries();
  res.json(category);
});

app.delete('/library/categories/:categoryId', requireAuth, (req, res) => {
  const lib = getLibrary(req.user.id);
  lib.categories = lib.categories.filter(c => c.id !== req.params.categoryId);
  saveLibraries();
  res.json({ success: true });
});

app.post('/library/categories/:categoryId/songs', requireAuth, (req, res) => {
  const { videoId, title } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId required' });
  const lib = getLibrary(req.user.id);
  const category = lib.categories.find(c => c.id === req.params.categoryId);
  if (!category) return res.status(404).json({ error: 'Category not found' });
  if (category.songs.find(s => s.videoId === videoId))
    return res.status(409).json({ error: 'Song already in category' });
  const song = { videoId, title, addedAt: Date.now() };
  category.songs.push(song);
  saveLibraries();
  res.json(song);
});

app.delete('/library/categories/:categoryId/songs/:videoId', requireAuth, (req, res) => {
  const lib = getLibrary(req.user.id);
  const category = lib.categories.find(c => c.id === req.params.categoryId);
  if (!category) return res.status(404).json({ error: 'Category not found' });
  category.songs = category.songs.filter(s => s.videoId !== req.params.videoId);
  saveLibraries();
  res.json({ success: true });
});

// ─── YOUTUBE PLAYLIST API ─────────────────────────────────────
app.get('/youtube/playlist', requireAuth, async (req, res) => {
  const { playlistId } = req.query;
  if (!playlistId) return res.status(400).json({ error: 'playlistId required' });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YouTube API key not configured' });

  try {
    let songs = [];
    let nextPageToken = null;

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

      const items = data.items || [];
      items.forEach(item => {
        const videoId = item.snippet?.resourceId?.videoId;
        const title = item.snippet?.title;
        if (videoId && title && title !== 'Deleted video' && title !== 'Private video') {
          songs.push({ videoId, title })
        }
      });

      nextPageToken = data.nextPageToken || null;
    } while (nextPageToken && songs.length < 200)

    res.json({ songs, total: songs.length });
  } catch (e) {
    console.error('YouTube API error:', e);
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
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
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

    socket.to(roomId).emit('user-joined', {
      user: room.users[socket.id],
      users: Object.values(room.users)
    });
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
    io.to(roomId).emit('load-song', {
      index,
      videoId: room.queue[index]?.videoId,
      title: room.queue[index]?.title,
      queue: room.queue
    });
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
  console.log(`🎵 Groove Together server running on http://localhost:${PORT}`);
});