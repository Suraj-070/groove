const express        = require('express')
const router         = express.Router()
const passport       = require('passport')
const GoogleStrategy  = require('passport-google-oauth20').Strategy
const { randomUUID } = require('crypto')

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173'

// ── Passport strategies ───────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL
  }, (accessToken, refreshToken, profile, done) => {
    done(null, {
      id: `google_${profile.id}`,
      username: profile.displayName,
      avatar: profile.photos?.[0]?.value || null,
      provider: 'google'
    })
  }))
}

passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user, done) => done(null, user))

// ── Routes ────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok' }))

router.get('/auth/discord', passport.authenticate('discord'))
router.get('/auth/discord/callback', (req, res, next) => {
  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      console.error('[Discord Auth Error]', err.message, err.oauthError?.data || '')
      return res.redirect(`${FRONTEND}/app?error=auth_failed&reason=${encodeURIComponent(err.message)}`)
    }
    if (!user) {
      console.error('[Discord Auth Failed]', info)
      return res.redirect(`${FRONTEND}/app?error=auth_failed`)
    }
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr)
      return res.redirect(`${FRONTEND}/app?auth=success`)
    })
  })(req, res, next)
})

router.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }))
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: `${FRONTEND}?error=auth_failed` }),
  (req, res) => res.redirect(`${FRONTEND}/app?auth=success`)
)

router.get('/auth/me', (req, res) => {
  if (req.isAuthenticated()) res.json(req.user)
  else res.status(401).json({ error: 'Not authenticated' })
})

router.post('/auth/guest', (req, res) => {
  const { username } = req.body
  if (!username?.trim()) return res.status(400).json({ error: 'Username required' })
  const user = {
    id: `guest_${randomUUID()}`,
    username: username.trim(),
    avatar: null, provider: 'guest', isGuest: true
  }
  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: 'Login failed' })
    res.json(user)
  })
})

router.get('/auth/logout', (req, res) => {
  req.logout(() => res.json({ success: true }))
})

// ── Middleware ────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated() && !req.user?.isGuest) return next()
  res.status(401).json({ error: 'Not authenticated' })
}

module.exports = { router, requireAuth }