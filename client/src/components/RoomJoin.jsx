import { useState, useRef, useEffect } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

const GrooveLogo = () => (
  <svg width="48" height="48" viewBox="0 0 56 56" fill="none">
    <defs>
      <linearGradient id="rjg1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#7c6aff"/><stop offset="100%" stopColor="#ff6a8a"/>
      </linearGradient>
      <linearGradient id="rjg2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.95"/><stop offset="100%" stopColor="#e0daff"/>
      </linearGradient>
    </defs>
    <circle cx="28" cy="28" r="28" fill="url(#rjg1)" opacity="0.15"/>
    <circle cx="28" cy="28" r="22" fill="url(#rjg1)" opacity="0.2"/>
    <path d="M14 22 Q10 28 14 34" stroke="url(#rjg1)" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M42 22 Q46 28 42 34" stroke="url(#rjg1)" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M24 36V22l12-3v14" stroke="url(#rjg2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="22" cy="36" r="3.5" fill="url(#rjg2)"/>
    <circle cx="34" cy="33" r="3.5" fill="url(#rjg2)"/>
  </svg>
)

// Input with NO autoFocus — prevents layout bounce
function Field({ label, type = 'text', value, onChange, placeholder, onEnter, inputRef }) {
  const [showPw, setShowPw] = useState(false)
  const isPassword = type === 'password'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type={isPassword && showPw ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && onEnter?.()}
          style={{
            width: '100%',
            padding: isPassword ? '11px 40px 11px 13px' : '11px 13px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, color: '#fff',
            fontFamily: 'inherit', fontSize: '0.9rem',
            outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
            boxSizing: 'border-box',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'rgba(124,106,255,0.55)'
            e.target.style.boxShadow = '0 0 0 3px rgba(124,106,255,0.1)'
          }}
          onBlur={e => {
            e.target.style.borderColor = 'rgba(255,255,255,0.1)'
            e.target.style.boxShadow = 'none'
          }}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPw(p => !p)}
            style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', padding: 0 }}
          >
            {showPw ? '🙈' : '👁'}
          </button>
        )}
      </div>
    </div>
  )
}

function ErrMsg({ msg }) {
  if (!msg) return null
  return <div style={{ background: 'rgba(255,80,100,0.1)', border: '1px solid rgba(255,80,100,0.2)', borderRadius: 8, padding: '9px 12px', fontSize: '0.82rem', color: '#ffb0bc', lineHeight: 1.4 }}>{msg}</div>
}

function OkMsg({ msg }) {
  if (!msg) return null
  return <div style={{ background: 'rgba(0,201,116,0.1)', border: '1px solid rgba(0,201,116,0.2)', borderRadius: 8, padding: '9px 12px', fontSize: '0.82rem', color: '#80e8c0', display: 'flex', alignItems: 'center', gap: 7 }}><span>✓</span>{msg}</div>
}

function PBtn({ children, onClick, loading, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        width: '100%', padding: '12px', border: 'none', borderRadius: 10,
        background: 'linear-gradient(135deg,#7c6aff,#ff6a8a)',
        color: '#fff', fontFamily: 'inherit', fontSize: '0.92rem', fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        boxShadow: '0 4px 16px rgba(124,106,255,0.3)',
        transition: 'opacity 0.15s, transform 0.15s',
        ...style,
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = '' }}
    >
      {loading ? '···' : children}
    </button>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0', transition: 'color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.color = '#fff'}
      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
    >← Back</button>
  )
}

function LinkBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: 'rgba(124,106,255,0.8)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0', transition: 'color 0.15s', textDecoration: 'underline', textDecorationColor: 'rgba(124,106,255,0.3)' }}
      onMouseEnter={e => e.currentTarget.style.color = '#c4b5fd'}
      onMouseLeave={e => e.currentTarget.style.color = 'rgba(124,106,255,0.8)'}
    >{children}</button>
  )
}

function Or() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>or</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}

// Shell must be defined OUTSIDE RoomJoin — if defined inside it recreates
// on every render causing inputs to unmount/remount and lose focus
function Shell({ children }) {
  return (
    <div className="room-join">
      <div className="join-card">
        <div className="join-logo"><GrooveLogo /></div>
        <h1 className="join-title">
          <span className="join-title-big">GROOVE</span>
          <span className="join-title-small">· together ·</span>
        </h1>
        {children}
      </div>
    </div>
  )
}

export default function RoomJoin({ onJoin, user, onGuestLogin }) {
  const [roomId, setRoomId] = useState(() => sessionStorage.getItem('groove_invite_room') || '')
  const [view, setView]     = useState('home')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')

  // Form fields — all kept at parent level to prevent re-mount focus issues
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [username, setUsername]   = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [guestName, setGuestName] = useState('')

  const go = (v) => { setError(''); setSuccess(''); setView(v) }

  const apiPost = async (path, body) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    try {
      const res = await fetch(`${BACKEND}${path}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      return data
    } catch (e) {
      clearTimeout(timeout)
      if (e.name === 'AbortError') throw new Error('Server is waking up — please wait 30 seconds and try again ☕')
      throw e
    }
  }

  const handleRegister = async () => {
    if (!username.trim()) return setError('Username is required')
    if (!email.trim()) return setError('Email is required')
    if (!password) return setError('Password is required')
    if (password.length < 6) return setError('Password must be at least 6 characters')
    if (password !== confirmPw) return setError('Passwords do not match')
    setLoading(true); setError('')
    try {
      const u = await apiPost('/auth/email/register', { email, password, username })
      if (u.linked) {
        // Password was added to existing Google/magic account — show brief success
        setSuccess('Password added to your existing account!')
        setTimeout(() => onGuestLogin(u), 800)
      } else {
        onGuestLogin(u)
      }
    } catch (e) {
      setError(e.message)
      // Server says account exists with password — redirect to login
      if (e.message.includes('Sign in instead')) {
        setTimeout(() => go('login'), 1200)
      }
    }
    finally { setLoading(false) }
  }

  const [loginHint, setLoginHint] = useState('')

  const handleLogin = async () => {
    if (!email.trim() || !password) return setError('Email and password are required')
    setLoading(true); setError(''); setLoginHint('')
    try {
      const res = await fetch(`${BACKEND}/auth/email/login`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        onGuestLogin(data)
      } else {
        setError(data.error || 'Login failed')
        if (data.hint) setLoginHint(data.hint)
      }
    } catch (e) { setError('Connection failed. Please try again.') }
    finally { setLoading(false) }
  }

  const handleMagicSend = async () => {
    if (!email.trim()) return setError('Email is required')
    setLoading(true); setError('')
    // Show waking message if slow (Render cold start)
    const wakingTimer = setTimeout(() => setError('☕ Server is waking up, hang tight...'), 5000)
    try {
      // 30 second timeout — Render cold starts can take 20+ seconds
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      const res = await fetch(`${BACKEND}/auth/magic/send`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      clearTimeout(wakingTimer)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send magic link')
        return
      }
      if (!data.emailConfigured && data.devLink) {
        // Email not set up — show clickable link directly in UI
        setMagicLink(data.devLink)
        setView('magic-sent')
      } else if (data.emailConfigured) {
        // Real email sent — show "check inbox" screen
        setMagicLink('')
        setView('magic-sent')
      } else if (data.devToken) {
        // Dev auto-verify fallback
        try {
          const u = await apiPost('/auth/magic/verify', { token: data.devToken })
          onGuestLogin(u)
        } catch {
          setMagicLink(data.devLink || '')
          setView('magic-sent')
        }
      } else {
        setView('magic-sent')
      }
    } catch (e) {
      clearTimeout(wakingTimer)
      if (e.name === 'AbortError') {
        setError('Server took too long — please try again ☕')
      } else {
        setError(e.message || 'Failed to send magic link')
      }
    }
    finally { setLoading(false) }
  }

  const handleForgot = async () => {
    if (!email.trim()) return setError('Email is required')
    setLoading(true); setError('')
    try {
      await apiPost('/auth/email/forgot', { email })
      setSuccess('If an account exists, a reset link has been sent.')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleGuestSubmit = () => {
    const name = guestName.trim()
    if (!name) return setError('Please enter a username')
    if (name.length < 2) return setError('Must be at least 2 characters')
    if (name.length > 20) return setError('Max 20 characters')
    onGuestLogin({ username: name })
  }

  const handleJoin = () => {
    if (!roomId.trim()) return
    onJoin({ roomId: roomId.toUpperCase().trim() })
  }

  // ── Logged in ─────────────────────────────────────────
  if (user) {
    const providerLabel = user.isGuest
      ? '👤 Guest'
      : user.providers?.includes('google') && user.providers?.includes('email')
      ? '🔵 Google + ✉️ Email'
      : user.providers?.includes('google') || user.provider === 'google'
      ? '🔵 via Google'
      : '✉️ via Email'

    return (
      <div className="room-join">
        <div className="join-card">
          <div className="join-logo"><GrooveLogo /></div>
          <h1 className="join-title">
            <span className="join-title-big">GROOVE</span>
            <span className="join-title-small">· together ·</span>
          </h1>
          <div className="discord-user">
            {user.avatar
              ? <img src={user.avatar} alt="" className="discord-avatar" />
              : <div className="discord-avatar-placeholder">{user.username?.slice(0, 2).toUpperCase()}</div>
            }
            <div>
              <p className="discord-name">{user.username}</p>
              <p className="discord-sub">{providerLabel}</p>
            </div>
          </div>
          <div className="join-form">
            <input type="text" placeholder="Room code (e.g. GROOVE1)"
              value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()} maxLength={10} />
            <button className="btn-primary" onClick={handleJoin} disabled={!roomId.trim()}>Join Room</button>
            <div className="divider"><span>or</span></div>
            <button className="btn-secondary" onClick={() => onJoin({ roomId: Math.random().toString(36).substring(2, 8).toUpperCase() })}>Create New Room</button>
          </div>
        </div>
      </div>
    )
  }



  // ── Magic link sent ───────────────────────────────────




  // ── Login ─────────────────────────────────────────────
  if (view === 'login') return (
    <Shell>
      <p className="join-sub" style={{ marginBottom: 18 }}>Sign in to your account</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <ErrMsg msg={error} />
        {/* Smart hint — redirect to correct method */}
        {loginHint === 'google' && (
          <button onClick={() => window.location.href = `${BACKEND}/auth/google`}
            style={{ padding: '11px', background: 'rgba(66,133,244,0.1)', border: '1px solid rgba(66,133,244,0.3)', borderRadius: 10, color: '#7ab3ff', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            → Sign in with Google instead
          </button>
        )}
        {loginHint === 'magic' && (
          <button onClick={() => go('magic')}
            style={{ padding: '11px', background: 'rgba(255,184,106,0.1)', border: '1px solid rgba(255,184,106,0.25)', borderRadius: 10, color: '#ffd080', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            → Send me a magic link instead
          </button>
        )}
        <Field label="Email" type="email" value={email} onChange={v => { setEmail(v); setLoginHint('') }} placeholder="you@example.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" onEnter={handleLogin} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LinkBtn onClick={() => go('forgot')}>Forgot password?</LinkBtn>
        </div>
        <PBtn onClick={handleLogin} loading={loading}>Sign In</PBtn>
        <Or />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BackBtn onClick={() => go('home')} />
          <LinkBtn onClick={() => go('register')}>Create account</LinkBtn>
        </div>
      </div>
    </Shell>
  )

  // ── Register ──────────────────────────────────────────
  if (view === 'register') return (
    <Shell>
      <p className="join-sub" style={{ marginBottom: 18 }}>Create your Groove account</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <ErrMsg msg={error} />
        <OkMsg msg={success} />
        <Field label="Username" value={username} onChange={setUsername} placeholder="Your display name" />
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="Min 6 characters" />
        <Field label="Confirm password" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="Repeat password" onEnter={handleRegister} />
        <PBtn onClick={handleRegister} loading={loading}>Create Account</PBtn>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BackBtn onClick={() => go('home')} />
          <LinkBtn onClick={() => go('login')}>Already have an account?</LinkBtn>
        </div>
      </div>
    </Shell>
  )

  // ── Forgot password ───────────────────────────────────
  if (view === 'forgot') return (
    <Shell>
      <p className="join-sub" style={{ marginBottom: 18 }}>Reset your password</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <ErrMsg msg={error} />
        <OkMsg msg={success} />
        {!success && (
          <>
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" onEnter={handleForgot} />
            <PBtn onClick={handleForgot} loading={loading}>Send Reset Link</PBtn>
          </>
        )}
        <BackBtn onClick={() => go('login')} />
      </div>
    </Shell>
  )

  // ── Guest ─────────────────────────────────────────────
  if (view === 'guest') return (
    <Shell>
      <p className="join-sub" style={{ marginBottom: 18 }}>Choose your display name</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <ErrMsg msg={error} />
        <Field value={guestName} onChange={v => { setGuestName(v); setError('') }} placeholder="e.g. DreamCatcher..." onEnter={handleGuestSubmit} />
        <PBtn onClick={handleGuestSubmit}>Enter Groove →</PBtn>
        <BackBtn onClick={() => go('home')} />
        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.18)', textAlign: 'center' }}>Guest accounts don't save your library or history</p>
      </div>
    </Shell>
  )

  // ── Home ─────────────────────────────────────────────
  return (
    <Shell>
      <p className="join-sub">Listen to music in sync with your friends</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>

        {/* Google */}
        <button className="google-login-btn" onClick={() => window.location.href = `${BACKEND}/auth/google`}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <Or />

        {/* Email tabs */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
          <button onClick={() => go('login')}
            style={{ width: '100%', padding: '13px 16px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(124,106,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>✉️</span>
            <span>Sign in with email</span>
            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>›</span>
          </button>

          <button onClick={() => go('register')}
            style={{ width: '100%', padding: '13px 16px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,201,116,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>🎵</span>
            <span>Create account</span>
            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>›</span>
          </button>
        </div>

        <Or />

        {/* Guest */}
        <button className="guest-login-btn" onClick={() => go('guest')}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
          Continue as Guest
        </button>
      </div>
    </Shell>
  )
}