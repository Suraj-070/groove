require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const express    = require('express')
const http       = require('http')
const { Server } = require('socket.io')
const cors       = require('cors')
const session    = require('express-session')
const passport   = require('passport')
const mongoose   = require('mongoose')

// ── App setup ─────────────────────────────────────────────
const app    = express()
const server = http.createServer(app)
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }
})

const isProd   = !!process.env.FRONTEND_URL
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173'
const PORT     = process.env.PORT || 3001

// ── Middleware ────────────────────────────────────────────
app.set('trust proxy', 1)
app.use(cors({
  origin: (origin, cb) => {
    const allowed = ['http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean)
    if (!origin || allowed.includes(origin)) cb(null, true)
    else cb(new Error('Not allowed by CORS'))
  },
  credentials: true
}))
app.options(/.*/, cors())
app.use(express.json())
app.use(session({
  secret: process.env.SESSION_SECRET || 'groove_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd, httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}))
app.use(passport.initialize())
app.use(passport.session())

// ── MongoDB ───────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => {
      console.log('✅ MongoDB connected')
      // Sync indexes after connection
      const { Message, SongDNA, ListenHistory } = require('./models')
      Promise.all([
        Message.syncIndexes(),
        SongDNA.syncIndexes(),
        ListenHistory.syncIndexes(),
      ]).then(() => console.log('✅ MongoDB indexes synced'))
        .catch(e => console.warn('⚠️  Index sync:', e.message))
    })
    .catch(e => console.error('❌ MongoDB error:', e.message))
} else {
  console.warn('⚠️  No MONGODB_URI — data will not persist')
}

// ── Routes ────────────────────────────────────────────────
const { router: authRouter } = require('./routes/auth')
const emailAuthRouter = require('./routes/emailAuth')
const libraryRouter = require('./routes/library')
const apiRouter     = require('./routes/api')

app.use('/', authRouter)
app.use('/', emailAuthRouter)
app.use('/', libraryRouter)
app.use('/', apiRouter)

// ── Sockets ───────────────────────────────────────────────
const registerSockets = require('./socket')
registerSockets(io)

// ── Start ─────────────────────────────────────────────────
server.listen(PORT, () => console.log(`🎵 Groove server running on port ${PORT}`))