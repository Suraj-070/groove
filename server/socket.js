const { Message } = require('./models')
const { enrichSong, flowScore } = require('./services/music')
const { sendPushToRoom } = require('./services/push')

// ── In-memory state ───────────────────────────────────────
const rooms       = {}
const memMessages = {}

// ── Message helpers ───────────────────────────────────────
async function getMessages(roomId) {
  if (!process.env.MONGODB_URI) return memMessages[roomId] || []
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    return await Message.find(
      { roomId, createdAt: { $gte: since } },
      { roomId: 0, __v: 0 }
    ).sort({ ts: 1 }).limit(200).lean()
  } catch { return memMessages[roomId] || [] }
}

async function saveMessage(roomId, msg) {
  if (!memMessages[roomId]) memMessages[roomId] = []
  memMessages[roomId].push(msg)
  if (memMessages[roomId].length > 100) memMessages[roomId].shift()
  if (!process.env.MONGODB_URI || msg.type !== 'msg') return
  try {
    await Message.create({ roomId, ...msg, createdAt: new Date() })
  } catch (e) { console.error('[Chat] saveMessage error:', e.message) }
}

// ── Register all socket handlers ──────────────────────────
module.exports = function registerSockets(io) {
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
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎵 Groove Together server on port ${PORT}`);
});

