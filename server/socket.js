const { randomUUID } = require('crypto')
const { Message, Room, RoomSession } = require('./models')
const { enrichSong, getCachedDNA } = require('./services/music')
const { sendPush, sendPushToRoom } = require('./services/push')
const { rooms, getRoom, saveRoom, updateStreak, recordListen, computeChemistry, recomputeCurrentIndex } = require('./services/room')

// ── In-memory message store ───────────────────────────────
const memMessages = {}

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

// Returns false when the message already exists (client resend after
// reconnect) so callers can ack without re-broadcasting a duplicate.
async function saveMessage(roomId, msg) {
  if (!memMessages[roomId]) memMessages[roomId] = []
  if (msg.id && memMessages[roomId].some(m => m.id === msg.id)) return false
  memMessages[roomId].push(msg)
  if (memMessages[roomId].length > 100) memMessages[roomId].shift()
  if (!process.env.MONGODB_URI || (msg.type !== 'msg' && msg.type !== 'gif')) return true
  try {
    await Message.create({ roomId, ...msg, createdAt: new Date() })
  } catch (e) { console.error('[Chat] saveMessage error:', e.message) }
  return true
}

// ── Server-side auto-advance ──────────────────────────────
// If the DJ's tab dies during the last seconds of a song, the room used to
// stall forever. With song durations stored, the server advances on its own.
function clearAdvanceTimer(room) {
  if (room && room._advanceTimer) {
    clearTimeout(room._advanceTimer)
    room._advanceTimer = null
    room._advanceQid = null
  }
}

function armAdvanceTimer(io, roomId, room) {
  clearAdvanceTimer(room)
  if (!room || !room.isPlaying) return
  const item = room.queue[room.currentIndex]
  if (!item || !item.duration || !(item.duration > 0)) return
  const remainingMs = (item.duration - (room.currentTime || 0)) * 1000 + 2500
  if (remainingMs <= 0) return
  room._advanceQid = item.qid
  room._advanceTimer = setTimeout(() => { autoAdvance(io, roomId).catch(() => {}) }, remainingMs)
}

async function autoAdvance(io, roomId) {
  const room = rooms[roomId]
  if (!room || !room.isPlaying) return
  const idx = room.queue.findIndex(q => q.qid === room._advanceQid)
  if (idx === -1 || idx !== room.currentIndex) return // song changed — stale timer
  const endedQid = room.queue[idx].qid
  let next = room.loopAuto ? idx : idx + 1
  if (next >= room.queue.length) {
    // End of queue — stop cleanly (radio mode is client-driven)
    room.isPlaying = false
    clearAdvanceTimer(room)
    io.to(roomId).emit('pause', { time: 0 })
    return
  }
  // Mark as just-ended so late client onEnded events don't double-advance
  room.lastEndedQid = endedQid
  setTimeout(() => {
    if (rooms[roomId] && rooms[roomId].lastEndedQid === endedQid) rooms[roomId].lastEndedQid = null
  }, 10000)
  await performLoad(io, roomId, next, { force: room.loopAuto })
}

// Shared load routine — used by the load-song handler AND auto-advance
async function performLoad(io, roomId, index, { force = false } = {}) {
  const room = rooms[roomId]
  if (!room) return
  const prev = room.queue[room.currentIndex]
  const song = room.queue[index]
  if (!song) return
  if (prev && index !== room.currentIndex && !room.songsPlayed.find(s => s.videoId === prev.videoId))
    room.songsPlayed.push({ ...prev, playedAt: Date.now() })
  room.currentIndex = index
  room.currentTime = 0
  room.currentTimeAt = Date.now()
  room.isPlaying = true
  room.currentQid = song.qid || null
  room.currentLoadedAt = Date.now()
  room.loadCount = (room.loadCount || 0) + 1
  clearAdvanceTimer(room)
  // Record listen history for all users in room
  if (song) {
    await Promise.all(Object.values(room.users).map(u =>
      (u.discordId || u.userId) ? recordListen(u.discordId || u.userId, song.videoId, song.title, roomId) : Promise.resolve()
    ))
  }
  io.to(roomId).emit('load-song', {
    index, qid: song.qid, videoId: song.videoId, title: song.title,
    queue: room.queue, currentIndex: room.currentIndex,
    loadCount: room.loadCount, force,
  })
  await saveRoom(roomId)
  // Arm the fallback timer right away when we already know the duration
  armAdvanceTimer(io, roomId, room)
}

// ── Register all socket handlers ──────────────────────────
module.exports = function registerSockets(io) {
  io.on('connection', (socket) => {
  socket.on('join-room', async ({ roomId, username, avatar, discordId, userId, password, visible }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    // ── Persistent identity ──
    // Clients send a stable userId (account id or a localStorage UUID).
    // A page refresh / network drop mints a NEW socket.id, which used to
    // orphan the DJ crown and split the user into two room entries.
    socket.userId = userId || discordId || socket.id;
    const room = await getRoom(roomId);
    const isFirstUser = Object.keys(room.users).length === 0;
    // ── Room password check ──
    if (!isFirstUser && room.password) {
      if (room.password !== password) {
        socket.emit('join-error', { code: 'wrong-password', message: 'Incorrect room password' });
        socket.leave(roomId);
        return;
      }
    }
    // ── Reconnect handling: same person, new socket ──
    // Silently replace the old socket entry; carry over the crown + joinedAt.
    const prevEntry = Object.entries(room.users).find(([sid, u]) => u.userId === socket.userId && sid !== socket.id)
    let joinedAt = Date.now()
    if (prevEntry) {
      const [prevSid, prevUser] = prevEntry
      if (room.djId === prevSid) room.djId = socket.id // reconnected DJ keeps the crown
      joinedAt = prevUser.joinedAt || joinedAt
      delete room.users[prevSid]
    }
    room.users[socket.id] = { id: socket.id, userId: socket.userId, discordId, username, avatar, joinedAt, visible: visible !== false };
    // Track everyone who was part of this session (used when the last
    // person leaves to persist an accurate RoomSession record)
    if (!room.sessionParticipants) room.sessionParticipants = {}
    room.sessionParticipants[socket.userId] = {
      userId: discordId || socket.userId, username, avatar, joinedAt
    }
    if (isFirstUser) {
      room.djId = socket.id;
      room.reactions = {}; // track reactions per session
    }
    // Update streak for this user
    const identityId = discordId || socket.userId
    if (identityId) {
      const streakData = await updateStreak(identityId, username, avatar);
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
      loadCount: room.loadCount || 0,
      currentQid: room.currentQid || null,
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
    if (room.djMode && socket.id !== room.djId) {
      socket.emit('room-error', { code: 'dj-locked', message: '👑 DJ mode is on — only the DJ can control playback' });
      return;
    }
    room.isPlaying = true; room.currentTime = time;
    armAdvanceTimer(io, roomId, room);
    socket.to(roomId).emit('play', { time });
  });

  socket.on('pause', async ({ roomId, time }) => {
    const room = await getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) {
      socket.emit('room-error', { code: 'dj-locked', message: '👑 DJ mode is on — only the DJ can control playback' });
      return;
    }
    room.isPlaying = false; room.currentTime = time;
    clearAdvanceTimer(room);
    socket.to(roomId).emit('pause', { time });
  });

  socket.on('seek', async ({ roomId, time }) => {
    const room = await getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) {
      socket.emit('room-error', { code: 'dj-locked', message: '👑 DJ mode is on — only the DJ can control playback' });
      return;
    }
    room.currentTime = time;
    if (room.isPlaying) armAdvanceTimer(io, roomId, room);
    socket.to(roomId).emit('seek', { time });
  });

  socket.on('add-song', async ({ roomId, videoId, title, addedBy, duration }) => {
    const room = await getRoom(roomId);
    if (room.queue.length >= 200) {
      socket.emit('queue-full', { limit: 200 });
      return;
    }
    // ── Duplicate guard ──
    // Same song already queued → tell the sender instead of silently
    // adding a second copy that splits reactions and skips.
    const dupIndex = room.queue.findIndex(s => s.videoId === videoId)
    if (dupIndex !== -1) {
      socket.emit('song-duplicate', { videoId, title, position: dupIndex + 1, addedBy: room.queue[dupIndex].addedBy })
      return
    }
    const item = { qid: randomUUID(), videoId, title, addedBy }
    if (duration && duration > 0) item.duration = Math.round(duration)
    socket.to(roomId).emit('song-added-notify', { title, addedBy });
    room.queue.push(item);
    recomputeCurrentIndex(room)
    io.to(roomId).emit('queue-updated', { queue: room.queue, currentIndex: room.currentIndex });
    // Confirm to the sender with position number
    socket.emit('song-added-confirm', { title, addedBy, position: room.queue.length })
    await saveRoom(roomId);
    // Background enrichment — fills the DNA cache without blocking anyone
    enrichSong(videoId, title).catch(() => {})
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
    // Skip songs already in the queue
    const known = new Set(room.queue.map(s => s.videoId))
    const fresh = songs.filter(s => s && !known.has(s.videoId))
    const toAdd = fresh.slice(0, remaining).map(s => ({ qid: randomUUID(), ...s, addedBy }));
    const skipped = songs.length - toAdd.length;
    room.queue.push(...toAdd);
    io.to(roomId).emit('queue-updated', { queue: room.queue, currentIndex: room.currentIndex });
    if (skipped > 0) socket.emit('queue-limit-reached', { added: toAdd.length, skipped, limit: 200 });
    await saveRoom(roomId);
    // Warm the DNA cache for the next few songs only (avoid a stampede)
    toAdd.slice(0, 8).forEach(s => enrichSong(s.videoId, s.title).catch(() => {}))
  });

  socket.on('load-song', async ({ roomId, qid, index, force }) => {
    const room = await getRoom(roomId);
    if (room.djMode && socket.id !== room.djId) {
      socket.emit('room-error', { code: 'dj-locked', message: '👑 DJ mode is on — only the DJ can control playback' });
      return;
    }
    // Resolve target: qid first (race-safe), index as fallback
    let idx = -1
    if (qid) idx = room.queue.findIndex(s => s.qid === qid)
    else if (typeof index === 'number') idx = index
    if (idx === -1 || !room.queue[idx]) return
    const reqQid = room.queue[idx].qid
    // Ignore loads for a song that just auto-advanced away (stale client)
    if (!force && room.lastEndedQid && reqQid === room.lastEndedQid) return
    // Ignore replays of a song loaded moments ago (double-advance guard).
    // Manual restarts usually happen later than 5s after load.
    if (!force && reqQid === room.currentQid && room.currentLoadedAt && Date.now() - room.currentLoadedAt < 5000) return
    await performLoad(io, roomId, idx, { force: !!force });
  });

  // Client player reports the real stream duration — enables the
  // server-side auto-advance fallback and queue timing.
  socket.on('song-duration', async ({ roomId, videoId, duration }) => {
    const room = rooms[roomId]
    if (!room || typeof duration !== 'number' || !(duration > 0)) return
    const item = room.queue[room.currentIndex]
    if (!item || item.videoId !== videoId) return
    item.duration = Math.round(duration)
    if (!room.currentQid) room.currentQid = item.qid
    armAdvanceTimer(io, roomId, room)
    await saveRoom(roomId)
  });

  socket.on('remove-song', async ({ roomId, qid, index }) => {
    const room = await getRoom(roomId);
    let idx = -1
    if (qid) idx = room.queue.findIndex(s => s.qid === qid)
    else if (typeof index === 'number') idx = index
    if (idx === -1 || !room.queue[idx]) return
    room.queue.splice(idx, 1);
    recomputeCurrentIndex(room)
    io.to(roomId).emit('queue-updated', { queue: room.queue, currentIndex: room.currentIndex });
    await saveRoom(roomId);
  });

  // Batch remove (multi-select delete) — one broadcast instead of N,
  // and qid-based so concurrent edits can't remove the wrong songs.
  socket.on('remove-songs', async ({ roomId, qids = [] }) => {
    const room = await getRoom(roomId);
    if (!Array.isArray(qids) || qids.length === 0) return
    const kill = new Set(qids)
    const currentSong = room.queue[room.currentIndex]
    room.queue = room.queue.filter(s => !kill.has(s.qid))
    if (currentSong && !kill.has(currentSong.qid)) {
      recomputeCurrentIndex(room)
    } else if (room.currentIndex >= room.queue.length) {
      room.currentIndex = Math.max(0, room.queue.length - 1)
    }
    io.to(roomId).emit('queue-updated', { queue: room.queue, currentIndex: room.currentIndex });
    await saveRoom(roomId);
  });

  socket.on('push-category', async ({ roomId, songs, categoryName, username }) => {
    const room = await getRoom(roomId);
    songs.forEach(song => room.queue.push({ qid: randomUUID(), ...song, addedBy: username }));
    io.to(roomId).emit('queue-updated', { queue: room.queue, currentIndex: room.currentIndex });
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
    const targetIdentity = target.discordId || target.userId
    if (targetIdentity) {
      sendPush(targetIdentity, {
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

  // Non-DJ asks for control — DJ gets a live toast instead of silence
  socket.on('request-dj', ({ roomId, username }) => {
    const room = rooms[roomId]
    if (!room || !room.djMode || !room.djId) return
    if (socket.id === room.djId) return
    io.to(room.djId).emit('dj-control-request', { username, socketId: socket.id })
  })

  socket.on('toggle-dj-mode', async ({ roomId }) => {
    const room = await getRoom(roomId);
    if (socket.id !== room.djId) return;
    room.djMode = !room.djMode;
    io.to(roomId).emit('dj-mode-changed', { djMode: room.djMode, djId: room.djId });
  });

  // Loop state lives on the server now so auto-advance honours it
  socket.on('set-loop', ({ roomId, loop }) => {
    const room = rooms[roomId]
    if (!room) return
    room.loopAuto = !!loop
    if (room.loopAuto && room.isPlaying) armAdvanceTimer(io, roomId, room)
  })

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
    if (process.env.MONGODB_URI) {
      Message.updateOne({ id: msgId }, { $set: { text, edited: true } }).catch(() => {})
    }
  })

  socket.on('chat-reaction', ({ roomId, msgId, emoji, username, action }) => {
    io.to(roomId).emit('chat-reaction', { msgId, emoji, username, action })
    // Persist reaction to MongoDB
    if (process.env.MONGODB_URI) {
      const field = `reactions.${emoji}`
      if (action === 'add') {
        Message.updateOne({ id: msgId }, { $addToSet: { [`reactions.${emoji}.users`]: username }, $inc: { [`reactions.${emoji}.count`]: 1 } }).catch(() => {})
      } else {
        Message.updateOne({ id: msgId }, { $pull: { [`reactions.${emoji}.users`]: username }, $inc: { [`reactions.${emoji}.count`]: -1 } }).catch(() => {})
      }
    }
  })

  socket.on('chat-delete', ({ roomId, msgId }) => {
    io.to(roomId).emit('chat-delete', { msgId })
    if (process.env.MONGODB_URI) {
      Message.deleteOne({ id: msgId }).catch(() => {})
    }
  })

  socket.on('chat-pin', ({ roomId, msg }) => {
    io.to(roomId).emit('chat-pin', { msg })
  })

  socket.on('chat-unpin', ({ roomId }) => {
    io.to(roomId).emit('chat-unpin')
  })

  socket.on('leave-room', ({ roomId, username }) => {
    socket.leave(roomId)
    if (roomId) {
      io.to(roomId).emit('user-left', { username })
      io.to(roomId).emit('chat-system', { text: `${username} left the room` })
    }
  })

  socket.on('chat-read', ({ roomId, msgId }) => {
    // Notify the sender their message was read
    socket.to(roomId).emit('chat-read', { msgId })
  })

  socket.on('chat-msg', async ({ roomId, msg }) => {
    const stamped = { ...msg, ts: msg.ts || Date.now() };
    // Always ack the sender (echo = delivery confirmation for the resend queue)
    socket.emit('chat-msg-echo', stamped);
    // Await the dedupe check — a resend must NOT be re-broadcast
    const isNew = await saveMessage(roomId, stamped);
    if (!isNew) return // reconnect resend — already saved, don't double-broadcast
    socket.to(roomId).emit('chat-msg', stamped);
    // Push to room members who are away (app closed/backgrounded).
    // Users with the tab visible are filtered out server-side.
    sendPushToRoom(roomId, socket.id, {
      type: 'chat',
      title: `${msg.username}`,
      body: (msg.text || '').length > 100 ? msg.text.slice(0, 100) + '…' : msg.text,
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

  // ── Presence: tab visibility & buffering ──────────────────
  // Visibility gates push notifications; buffering is relayed to the DJ.
  socket.on('client-visibility', ({ roomId, visible }) => {
    const room = rooms[roomId]
    if (room && room.users[socket.id]) room.users[socket.id].visible = !!visible
  })

  socket.on('client-buffering', ({ roomId, isBuffering }) => {
    if (!roomId) return
    socket.to(roomId).emit('user-buffering', { username: socket.username, isBuffering: !!isBuffering })
  })

  // Reorder queue (drag-to-reorder) — race-safe via qid reconciliation.
  // Trust the client's ORDER, but keep any songs added meanwhile and
  // re-derive currentIndex from the actually-playing song.
  socket.on('reorder-queue', async ({ roomId, queue: newQueue }) => {
    const room = await getRoom(roomId);
    if (!room || !Array.isArray(newQueue)) return;
    const serverByQid = new Map(room.queue.filter(s => s.qid).map(s => [s.qid, s]))
    const merged = []
    const seen = new Set()
    for (const s of newQueue) {
      if (!s) continue
      const qid = s.qid
      if (qid && serverByQid.has(qid) && !seen.has(qid)) { merged.push(serverByQid.get(qid)); seen.add(qid) }
      else if (qid && !seen.has(qid)) { merged.push({ ...s, qid }); seen.add(qid) }
    }
    // Songs added while the client was shuffling — keep them
    for (const s of room.queue) {
      if (s.qid && !seen.has(s.qid)) { merged.push(s); seen.add(s.qid) }
    }
    room.queue = merged
    recomputeCurrentIndex(room)
    await saveRoom(roomId);
    // Emit to ALL in room including sender so their UI reflects confirmed state
    io.to(roomId).emit('queue-reordered', { queue: room.queue, currentIndex: room.currentIndex });
  });

  // Single-item move (drag & drop) — qid-based, no full-array overwrite
  socket.on('move-queue-item', async ({ roomId, qid, toIndex }) => {
    const room = await getRoom(roomId)
    if (!room || !qid || typeof toIndex !== 'number') return
    const from = room.queue.findIndex(s => s.qid === qid)
    if (from === -1) return
    const [item] = room.queue.splice(from, 1)
    const target = Math.max(0, Math.min(toIndex, room.queue.length))
    room.queue.splice(target, 0, item)
    recomputeCurrentIndex(room)
    await saveRoom(roomId)
    io.to(roomId).emit('queue-reordered', { queue: room.queue, currentIndex: room.currentIndex })
  })

  // Room password management (DJ/first user only)
  socket.on('set-room-password', async ({ roomId, password }) => {
    const room = await getRoom(roomId);
    if (!room) return;
    // Only the DJ can set/clear the password
    if (room.djId && room.djId !== socket.id) {
      socket.emit('room-error', { message: 'Only the DJ can set the room password' });
      return;
    }
    room.password = password || null;
    // Notify room of lock state change (don't broadcast the password itself)
    io.to(roomId).emit('room-lock-changed', { locked: !!room.password });
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
    // Read DNA from cache only — recaps open instantly. Anything missing is
    // enriched in the background and appears next time.
    const enrichedSongs = await Promise.all(
      allSongs.map(async s => {
        try {
          const cached = await getCachedDNA(s.videoId)
          if (cached) return { ...s, ...cached }
          enrichSong(s.videoId, s.title).catch(() => {})
        } catch {}
        return s
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
    const { roomId, username, userId } = socket;
    if (roomId && rooms[roomId]) {
      const leaver = rooms[roomId].users[socket.id]
      const hadDJ = rooms[roomId].djId === socket.id
      delete rooms[roomId].users[socket.id];
      const users = Object.values(rooms[roomId].users);
      // Same person still connected from another tab/socket — no leave events
      const sameUserStillHere = userId && users.some(u => u.userId === userId)
      // Save session when room empties
      if (users.length === 0 && process.env.MONGODB_URI) {
        const room = rooms[roomId];
        try {
          // Full participant list for the whole session (not just the last leaver)
          const participants = Object.values(room.sessionParticipants || {})
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
        clearAdvanceTimer(room)
      }

      if (hadDJ && users.length > 0) {
        // Crown the longest-standing listener (oldest joinedAt), not a random one
        const oldest = users.slice().sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0]
        rooms[roomId].djId = oldest.id;
        io.to(roomId).emit('dj-mode-changed', { djMode: rooms[roomId].djMode, djId: rooms[roomId].djId });
      }

      if (!sameUserStillHere) {
        io.to(roomId).emit('user-left', { userId: socket.id, username, users });
        // (leave chat-system is emitted by the explicit leave-room handler;
        //  disconnect stays quiet to avoid noise on refresh)
      }

      // If room is empty, remove from memory AND clean up from DB
      if (users.length === 0) {
        clearAdvanceTimer(rooms[roomId])
        delete rooms[roomId];
        if (process.env.MONGODB_URI) {
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
