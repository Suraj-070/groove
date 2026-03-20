const mongoose = require('mongoose')

// ─── LIBRARY ──────────────────────────────────────────────
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


// ─── PUSH SUBSCRIPTION ────────────────────────────────────
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

// ─── SHARED SONGS ─────────────────────────────────────────
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


// ─── LISTEN HISTORY ───────────────────────────────────────
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


// ─── MOMENT STAMP ─────────────────────────────────────────
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


// ─── SONG DNA ─────────────────────────────────────────────
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


// ─── USER PROFILE ─────────────────────────────────────────
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


// ─── ROOM SESSION ─────────────────────────────────────────
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


module.exports = {
  Library, Room, Message, PushSub, SharedSongs,
  ListenHistory, Moment, SongDNA, UserProfile, RoomSession
}
