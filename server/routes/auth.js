const express        = require('express')
const router         = express.Router()
const passport       = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const { randomUUID } = require('crypto')
const { User }       = require('../models')

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173'

// ── Universal user session builder ────────────────────────
// No matter which method they use, session looks the same
function makeSession(user) {
  return {
    id:       `email_${user._id}`,  // always email_ prefix = one ID per person
    username: user.username,
    avatar:   user.avatar,
    email:    user.email,
    provider: user.linkedProviders?.includes('google') ? 'google' : 'email',
    providers: user.linkedProviders || [],
  }
}

// ── Google OAuth — email-first approach ───────────────────
if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
    scope:        ['profile', 'email'],  // request email scope
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email    = profile.emails?.[0]?.value?.toLowerCase()
      const avatar   = profile.photos?.[0]?.value || null
      const username = profile.displayName

      if (!email) {
        // No email from Google — fall back to google-only ID
        return done(null, {
          id: `google_${profile.id}`,
          username,
          avatar,
          provider: 'google',
          providers: ['google'],
        })
      }

      // Find existing account by email OR create one
      let user = await User.findOne({ email })

      if (user) {
        // Account exists — link Google if not already linked
        if (!user.linkedProviders) user.linkedProviders = []
        if (!user.linkedProviders.includes('google')) {
          user.linkedProviders.push('google')
        }
        if (!user.googleId) user.googleId = profile.id
        // Always sync latest Google avatar (it may have changed)
        if (avatar) user.avatar = avatar
        // Sync username from Google if not set manually
        if (!user.username && username) user.username = username
        await user.save()
      } else {
        // New user — create account with Google
        user = await User.create({
          email,
          username,
          avatar,
          provider:        'google',
          linkedProviders: ['google'],
          googleId:        profile.id,
          verified:        true,
        })
      }

      return done(null, makeSession(user))
    } catch (e) {
      console.error('[Google Auth]', e.message)
      return done(e)
    }
  }))
}

passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user, done) => done(null, user))

// ── Routes ────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok' }))

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: `${FRONTEND}/app?error=auth_failed` }),
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
    avatar: null, provider: 'guest', isGuest: true,
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