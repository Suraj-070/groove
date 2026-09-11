const { Room, UserProfile, ListenHistory, RoomSession } = require('../models')
const { randomUUID } = require('crypto')

// ── In-memory room state ──────────────────────────────────
const rooms = {}

// Ensure every queue item has a stable id (qid) — all queue ops are
// qid-based so concurrent edits never hit the wrong song (index drift).
function backfillQids(queue = []) {
  for (const s of queue) {
    if (!s.qid) s.qid = randomUUID()
  }
  return queue
}

// Keep currentIndex pointing at the song that is actually playing,
// even after the queue array is reordered/filtered.
function recomputeCurrentIndex(room) {
  if (!room) return 0
  if (room.currentQid) {
    const idx = room.queue.findIndex(s => s.qid === room.currentQid)
    if (idx !== -1) { room.currentIndex = idx; return idx }
  }
  if (room.currentIndex >= room.queue.length)
    room.currentIndex = Math.max(0, room.queue.length - 1)
  return room.currentIndex
}

async function getRoom(roomId) {
  if (rooms[roomId]) return rooms[roomId]
  const fresh = {
    id: roomId,
    queue: [], currentIndex: 0,
    isPlaying: false, currentTime: 0,
    users: {}, djId: null,
    loop: false,
    reactions: {},
    sessionStart: Date.now(),
    songsPlayed: [],
    // ── Resilience fields (survive restart via DB) ──
    currentQid: null,   // qid of the song that is playing right now
    loadCount: 0,       // increments per load — clients use it to force reload
    lastEndedQid: null, // guards against double-advance
  }
  if (process.env.MONGODB_URI) {
    try {
      const saved = await Room.findOne({ roomId }).lean()
      if (saved) {
        fresh.queue = saved.queue || []
        fresh.currentIndex = saved.currentIndex || 0
        // Restore session context so recaps/wrapped survive restarts
        if (saved.sessionStart) fresh.sessionStart = saved.sessionStart
        if (Array.isArray(saved.songsPlayed)) fresh.songsPlayed = saved.songsPlayed
        if (saved.reactions && typeof saved.reactions === 'object') fresh.reactions = saved.reactions
        if (saved.currentQid) fresh.currentQid = saved.currentQid
        if (typeof saved.loadCount === 'number') fresh.loadCount = saved.loadCount
        // Don't restore isPlaying — clients re-broadcast real playback state
      }
    } catch {}
  }
  backfillQids(fresh.queue)
  // After a restart the old currentIndex may point past the queue
  if (fresh.currentIndex >= fresh.queue.length)
    fresh.currentIndex = Math.max(0, fresh.queue.length - 1)
  rooms[roomId] = fresh
  return fresh
}

async function saveRoom(roomId) {
  const room = rooms[roomId]
  if (!room || !process.env.MONGODB_URI) return
  try {
    await Room.findOneAndUpdate(
      { roomId },
      {
        roomId,
        queue: room.queue,
        currentIndex: room.currentIndex,
        sessionStart: room.sessionStart,
        songsPlayed: room.songsPlayed || [],
        reactions: room.reactions || {},
        currentQid: room.currentQid || null,
        loadCount: room.loadCount || 0,
        updatedAt: Date.now(),
      },
      { upsert: true }
    )
  } catch {}
}

// ── Streak helpers ────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

async function updateStreak(userId, username, avatar) {
  if (!process.env.MONGODB_URI || !userId) return null
  try {
    const today = todayStr()
    let profile = await UserProfile.findOne({ userId })
    if (!profile) {
      profile = await UserProfile.create({
        userId, username, avatar,
        streak: 1, lastActiveDate: today,
        longestStreak: 1, totalDaysActive: 1,
        totalSongsPlayed: 0
      })
      return profile
    }
    profile.username = username
    profile.avatar   = avatar
    if (profile.lastActiveDate === today) return profile
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const yStr = yesterday.toISOString().slice(0, 10)
    if (profile.lastActiveDate === yStr) {
      profile.streak++
    } else {
      profile.streak = 1
    }
    profile.longestStreak  = Math.max(profile.streak, profile.longestStreak || 1)
    profile.lastActiveDate = today
    profile.totalDaysActive = (profile.totalDaysActive || 0) + 1
    await profile.save()
    return profile
  } catch (e) {
    console.error('updateStreak error:', e.message)
    return null
  }
}

// ── Listen history ────────────────────────────────────────
async function recordListen(userId, videoId, title, roomId) {
  if (!process.env.MONGODB_URI || !userId) return
  try {
    await ListenHistory.create({ userId, videoId, title, roomId, playedAt: Date.now() })
    await UserProfile.findOneAndUpdate(
      { userId },
      { $inc: { totalSongsPlayed: 1 } },
      { upsert: false }
    )
  } catch {}
}

// ── Chemistry algorithm ───────────────────────────────────
async function computeChemistry(participants, songsPlayed, reactions) {
  if (!participants || participants.length < 2) return 0
  try {
    const sessionLen = Date.now() - (songsPlayed[0]?.playedAt || Date.now())
    const retentionScore = Math.min(100, (sessionLen / 60000) * 5)
    const diversityScore = Math.min(100, new Set(songsPlayed.map(s => s.videoId)).size * 10)
    const reactionScore  = Math.min(100, Object.keys(reactions || {}).length * 5)
    return Math.round((retentionScore + diversityScore + reactionScore) / 3)
  } catch { return 0 }
}

module.exports = { rooms, getRoom, saveRoom, updateStreak, recordListen, computeChemistry, todayStr, backfillQids, recomputeCurrentIndex }