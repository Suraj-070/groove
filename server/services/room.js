const { Room, UserProfile, ListenHistory, RoomSession } = require('../models')

// ── In-memory room state ──────────────────────────────────
const rooms = {}

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
    songsPlayed: []
  }
  if (process.env.MONGODB_URI) {
    try {
      const saved = await Room.findOne({ roomId }).lean()
      if (saved) {
        fresh.queue = saved.queue || []
        fresh.currentIndex = saved.currentIndex || 0
      }
    } catch {}
  }
  rooms[roomId] = fresh
  return fresh
}

async function saveRoom(roomId) {
  const room = rooms[roomId]
  if (!room || !process.env.MONGODB_URI) return
  try {
    await Room.findOneAndUpdate(
      { roomId },
      { roomId, queue: room.queue, currentIndex: room.currentIndex },
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
  const score = { overall: 0, breakdown: {} }
  if (participants.length < 2) return score
  try {
    const sessionLen = Date.now() - (songsPlayed[0]?.playedAt || Date.now())
    const retentionScore = Math.min(100, (sessionLen / 60000) * 5)
    const diversityScore = Math.min(100, new Set(songsPlayed.map(s => s.videoId)).size * 10)
    const reactionScore  = Math.min(100, Object.keys(reactions || {}).length * 5)
    score.overall = Math.round((retentionScore + diversityScore + reactionScore) / 3)
    score.breakdown = { retention: Math.round(retentionScore), diversity: Math.round(diversityScore), reactions: Math.round(reactionScore) }
  } catch {}
  return score
}

module.exports = { rooms, getRoom, saveRoom, updateStreak, recordListen, computeChemistry, todayStr }
