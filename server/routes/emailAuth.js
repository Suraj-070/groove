const express    = require('express')
const router     = express.Router()
const crypto     = require('crypto')
const { User, MagicToken } = require('../models')

// Safe require — these packages must be installed via npm install
let bcrypt
try {
  bcrypt = require('bcryptjs')
} catch (e) {
  console.error('[EmailAuth] Missing bcryptjs — run: npm install bcryptjs')
  console.error('[EmailAuth] Error:', e.message)
}

// Guard — return friendly error if packages not installed
function checkDeps(res) {
  if (!bcrypt) {
    res.status(503).json({ error: 'Email auth not available yet. Please use Google or Guest login.' })
    return false
  }
  return true
}

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173'

// ── Email transporter ─────────────────────────────────────
// Use Resend HTTP API directly — no SMTP, no port issues, instant
async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[Email] No RESEND_API_KEY — skipping send')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Groove Together <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('[Email] Resend API error:', data)
      return false
    }
    console.log('[Email] Sent via Resend HTTP API, id:', data.id)
    return true
  } catch (e) {
    console.error('[Email] Send failed:', e.message)
    return false
  }
}

function getTransporter() { return !!process.env.RESEND_API_KEY }

// ── Email templates ───────────────────────────────────────
function magicLinkEmail(link, username) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#060410;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:2rem;font-weight:900;letter-spacing:-0.02em;background:linear-gradient(135deg,#7c6aff,#ff6a8a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;color:#7c6aff;">GROOVE</div>
      <div style="font-size:0.7rem;letter-spacing:0.18em;color:rgba(255,255,255,0.4);margin-top:2px;">· together ·</div>
    </div>
    <div style="background:#0e0c1a;border:1px solid rgba(124,106,255,0.2);border-radius:20px;padding:36px;text-align:center;">
      <div style="font-size:2.5rem;margin-bottom:16px;">🎵</div>
      <h1 style="color:#fff;font-size:1.3rem;font-weight:700;margin:0 0 10px;">Your magic link is ready</h1>
      <p style="color:rgba(255,255,255,0.45);font-size:0.9rem;line-height:1.6;margin:0 0 28px;">
        Hey ${username ? username : 'there'}! Click the button below to sign in to Groove Together. This link expires in <strong style="color:rgba(255,255,255,0.7);">15 minutes</strong>.
      </p>
      <a href="${link}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#7c6aff,#ff6a8a);border-radius:50px;color:#fff;font-weight:700;font-size:1rem;text-decoration:none;box-shadow:0 8px 24px rgba(124,106,255,0.4);">
        Sign In to Groove →
      </a>
      <p style="color:rgba(255,255,255,0.2);font-size:0.75rem;margin:24px 0 0;">
        If you didn't request this, you can safely ignore this email.<br>
        Link expires in 15 minutes and can only be used once.
      </p>
    </div>
    <p style="text-align:center;color:rgba(255,255,255,0.15);font-size:0.72rem;margin-top:24px;">
      © 2026 Groove Together · <a href="${FRONTEND}" style="color:rgba(124,106,255,0.6);text-decoration:none;">groovetoget.vercel.app</a>
    </p>
  </div>
</body>
</html>`
}

function welcomeEmail(username) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#060410;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:2rem;font-weight:900;color:#7c6aff;">GROOVE</div>
      <div style="font-size:0.7rem;letter-spacing:0.18em;color:rgba(255,255,255,0.4);">· together ·</div>
    </div>
    <div style="background:#0e0c1a;border:1px solid rgba(124,106,255,0.2);border-radius:20px;padding:36px;text-align:center;">
      <div style="font-size:2.5rem;margin-bottom:16px;">🎉</div>
      <h1 style="color:#fff;font-size:1.3rem;font-weight:700;margin:0 0 10px;">Welcome to Groove, ${username}!</h1>
      <p style="color:rgba(255,255,255,0.45);font-size:0.9rem;line-height:1.6;margin:0 0 28px;">
        Your account is all set. Start a room, invite friends, and listen together in real time.
      </p>
      <a href="${FRONTEND}/app" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#7c6aff,#ff6a8a);border-radius:50px;color:#fff;font-weight:700;font-size:1rem;text-decoration:none;">
        Open Groove →
      </a>
    </div>
  </div>
</body>
</html>`
}

// ── Helpers ───────────────────────────────────────────────
function makeSession(user) {
  return {
    id:        `email_${user._id}`,
    username:  user.username,
    avatar:    user.avatar,
    email:     user.email,
    provider:  user.linkedProviders?.includes('google') ? 'google' : 'email',
    providers: user.linkedProviders || [],
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validatePassword(password) {
  if (!password || password.length < 6) return 'Password must be at least 6 characters'
  if (password.length > 128) return 'Password too long'
  return null
}

// ── Routes ────────────────────────────────────────────────

// REGISTER with email + password
router.post('/auth/email/register', async (req, res) => {
  if (!checkDeps(res)) return
  try {
    const { email, password, username } = req.body

    if (!email || !validateEmail(email))
      return res.status(400).json({ error: 'Invalid email address' })

    const pwError = validatePassword(password)
    if (pwError) return res.status(400).json({ error: pwError })

    if (!username?.trim() || username.trim().length < 2)
      return res.status(400).json({ error: 'Username must be at least 2 characters' })

    if (username.trim().length > 24)
      return res.status(400).json({ error: 'Username must be under 24 characters' })

    const emailLower = email.toLowerCase()
    const existing = await User.findOne({ email: emailLower })

    if (existing) {
      if (existing.passwordHash) {
        // Already has a password — just tell them to log in
        return res.status(409).json({
          error: 'An account with this email already exists. Sign in instead.',
          hint: 'login'
        })
      }

      // Account exists (Google/magic) but no password yet — ADD password to it
      // This links email auth to their existing account seamlessly
      existing.passwordHash = await bcrypt.hash(password, 12)
      if (username.trim() && !existing.username) existing.username = username.trim()
      if (!existing.linkedProviders) existing.linkedProviders = []
      if (!existing.linkedProviders.includes('email')) existing.linkedProviders.push('email')
      await existing.save()

      const sessionUser = makeSession(existing)
      return req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ error: 'Login failed' })
        res.json({ ...sessionUser, linked: true, message: 'Password added to your existing account!' })
      })
    }

    // Brand new account
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.create({
      email:           emailLower,
      username:        username.trim(),
      passwordHash,
      provider:        'email',
      linkedProviders: ['email'],
      verified:        true,
    })

    const sessionUser = makeSession(user)
    req.login(sessionUser, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed after registration' })
      sendEmail({ to: user.email, subject: 'Welcome to Groove Together! 🎵', html: welcomeEmail(user.username) })
      res.json(sessionUser)
    })
  } catch (e) {
    console.error('[Auth] Register error:', e.message)
    res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

// LOGIN with email + password
router.post('/auth/email/login', async (req, res) => {
  if (!checkDeps(res)) return
  try {
    const { email, password } = req.body

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' })

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) return res.status(401).json({ error: 'No account found with this email' })

    if (!user.passwordHash) {
      // Account exists but no password — tell them which method to use
      const providers = user.linkedProviders || []
      if (providers.includes('google'))
        return res.status(401).json({ error: 'This account uses Google sign-in. Use "Continue with Google" instead.', hint: 'google' })
      return res.status(401).json({ error: 'This account uses magic link. Request a magic link to sign in.', hint: 'magic' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Incorrect password' })

    // Link email provider if not already
    if (!user.linkedProviders?.includes('email')) {
      user.linkedProviders = [...(user.linkedProviders || []), 'email']
      await user.save()
    }

    const sessionUser = makeSession(user)
    req.login(sessionUser, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed' })
      res.json(sessionUser)
    })
  } catch (e) {
    console.error('[Auth] Login error:', e.message)
    res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})

// SEND MAGIC LINK
router.post('/auth/magic/send', async (req, res) => {
  if (!checkDeps(res)) return
  try {
    const { email } = req.body

    if (!email || !validateEmail(email))
      return res.status(400).json({ error: 'Invalid email address' })

    const emailLower = email.toLowerCase()

    // Find or create user (magic link creates account automatically)
    let user = await User.findOne({ email: emailLower })
    if (!user) {
      // Auto-create account with email as username base
      const username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'Groover'
      user = await User.create({ email: emailLower, username, provider: 'email', linkedProviders: ['magic'], verified: true })
    }

    // Delete any existing unused tokens for this email
    await MagicToken.deleteMany({ email: emailLower, used: false })

    // Create new token
    const token = crypto.randomBytes(32).toString('hex')
    await MagicToken.create({
      email: emailLower,
      token,
      type: 'magic',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    })

    const link = `${FRONTEND}/app?magic=${token}`
    console.log(`[Magic] Sending to ${emailLower}, RESEND_API_KEY: ${!!process.env.RESEND_API_KEY}`)

    const sent = await sendEmail({
      to: emailLower,
      subject: 'Your Groove sign-in link 🎵',
      html: magicLinkEmail(link, user.username),
    })

    console.log(`[Magic] Email sent: ${sent}`)

    if (!sent) {
      // Email not configured — return clickable link so user can still sign in
      console.log(`[Magic] No email provider — returning devLink for: ${emailLower}`)
      return res.json({ success: true, devToken: token, devLink: link, emailConfigured: false })
    }

    res.json({ success: true, message: 'Magic link sent! Check your email.', emailConfigured: true })
  } catch (e) {
    console.error('[Auth] Magic send error:', e.message)
    res.status(500).json({ error: 'Failed to send magic link. Please try again.' })
  }
})

// VERIFY MAGIC LINK TOKEN
router.post('/auth/magic/verify', async (req, res) => {
  if (!checkDeps(res)) return
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'Token required' })

    const record = await MagicToken.findOne({ token })

    if (!record)       return res.status(401).json({ error: 'Invalid or expired link' })
    if (record.used)   return res.status(401).json({ error: 'This link has already been used' })
    if (record.expiresAt < new Date()) return res.status(401).json({ error: 'This link has expired. Request a new one.' })

    // Mark as used
    record.used = true
    await record.save()

    // Get user and ensure magic is in linkedProviders
    const user = await User.findOne({ email: record.email })
    if (!user) return res.status(401).json({ error: 'Account not found' })

    if (!user.linkedProviders?.includes('magic')) {
      user.linkedProviders = [...(user.linkedProviders || []), 'magic']
      await user.save()
    }

    const sessionUser = makeSession(user)
    req.login(sessionUser, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed' })
      res.json(sessionUser)
    })
  } catch (e) {
    console.error('[Auth] Magic verify error:', e.message)
    res.status(500).json({ error: 'Verification failed. Please try again.' })
  }
})

// FORGOT PASSWORD — sends reset link
router.post('/auth/email/forgot', async (req, res) => {
  if (!checkDeps(res)) return
  try {
    const { email } = req.body
    if (!email || !validateEmail(email))
      return res.status(400).json({ error: 'Invalid email' })

    const user = await User.findOne({ email: email.toLowerCase() })
    // Always return success to prevent email enumeration
    if (!user || !user.passwordHash) return res.json({ success: true })

    await MagicToken.deleteMany({ email: email.toLowerCase(), type: 'reset' })
    const token = crypto.randomBytes(32).toString('hex')
    await MagicToken.create({
      email: email.toLowerCase(), token, type: 'reset',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    })

    const link = `${FRONTEND}/app?reset=${token}`
    await sendEmail({
      to: email.toLowerCase(),
      subject: 'Reset your Groove password',
      html: `<div style="font-family:sans-serif;background:#060410;color:#fff;padding:40px;max-width:480px;margin:0 auto;border-radius:20px;">
        <h2 style="color:#7c6aff">Reset your password</h2>
        <p style="color:rgba(255,255,255,0.6)">Click below to set a new password. Link expires in 1 hour.</p>
        <a href="${link}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#7c6aff,#ff6a8a);border-radius:50px;color:#fff;font-weight:700;text-decoration:none;margin:16px 0">Reset Password →</a>
        <p style="color:rgba(255,255,255,0.3);font-size:0.8rem">If you didn't request this, ignore this email.</p>
      </div>`,
    })

    res.json({ success: true })
  } catch (e) {
    console.error('[Auth] Forgot error:', e.message)
    res.status(500).json({ error: 'Failed to send reset email' })
  }
})

// RESET PASSWORD
router.post('/auth/email/reset', async (req, res) => {
  if (!checkDeps(res)) return
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' })

    const pwError = validatePassword(password)
    if (pwError) return res.status(400).json({ error: pwError })

    const record = await MagicToken.findOne({ token, type: 'reset' })
    if (!record || record.used || record.expiresAt < new Date())
      return res.status(401).json({ error: 'Invalid or expired reset link' })

    record.used = true
    await record.save()

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.findOneAndUpdate(
      { email: record.email },
      { passwordHash },
      { new: true }
    )
    if (!user) return res.status(404).json({ error: 'Account not found' })

    const sessionUser = makeSession(user)
    req.login(sessionUser, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed after reset' })
      res.json({ success: true, user: sessionUser })
    })
  } catch (e) {
    console.error('[Auth] Reset error:', e.message)
    res.status(500).json({ error: 'Password reset failed' })
  }
})

module.exports = router