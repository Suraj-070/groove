import { useState, useEffect } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// ── Tiny primitives — all styled via CSS classes ─────────
function Input({ label, type = 'text', value, onChange, placeholder, onEnter, autoComplete }) {
  const [showPw, setShowPw] = useState(false)
  const isPw = type === 'password'
  return (
    <div className="rj-field">
      {label && <label className="rj-label">{label}</label>}
      <div className="rj-input-wrap">
        <input
          className="rj-input"
          type={isPw && showPw ? 'text' : type}
          value={value}
          autoComplete={autoComplete || (isPw ? 'current-password' : 'off')}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        />
        {isPw && (
          <button type="button" tabIndex={-1} className="rj-pw-toggle" onClick={() => setShowPw(p => !p)}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
    </div>
  )
}

function PrimaryBtn({ children, onClick, loading, disabled }) {
  return (
    <button className="rj-btn-primary" onClick={onClick} disabled={loading || disabled}>
      {loading ? <span className="rj-spinner" /> : children}
    </button>
  )
}

function GhostBtn({ children, onClick }) {
  return <button className="rj-btn-ghost" onClick={onClick}>{children}</button>
}

function TextBtn({ children, onClick, accent }) {
  return <button className={`rj-btn-text ${accent ? 'rj-btn-text--accent' : ''}`} onClick={onClick}>{children}</button>
}

function Err({ msg }) {
  if (!msg) return null
  return <div className="rj-err">{msg}</div>
}

function Ok({ msg }) {
  if (!msg) return null
  return (
    <div className="rj-ok">
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
      {msg}
    </div>
  )
}

function Divider() {
  return <div className="rj-divider"><span>or</span></div>
}

function Back({ onClick }) {
  return (
    <button className="rj-back" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Back
    </button>
  )
}

function Shell({ children }) {
  return (
    <div className="rj-root">
      <div className="rj-card">
        {/* Logo mark */}
        <div className="rj-brand">
          <div className="rj-brand-icon">
            <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
              <path d="M10 22V12l14-3.5V19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8" cy="22" r="3" fill="white" opacity="0.9"/>
              <circle cx="22" cy="19" r="3" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <div className="rj-brand-text">
            <span className="rj-brand-name">Groove</span>
            <span className="rj-brand-sub">Together</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function RoomJoin({ onJoin, user, onGuestLogin }) {
  const [roomId, setRoomId]     = useState(() => sessionStorage.getItem('groove_invite_room') || '')
  const [view, setView]         = useState('home')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [guestName, setGuestName] = useState('')
  const [loginHint, setLoginHint] = useState('')

  const go = (v) => { setError(''); setSuccess(''); setView(v) }

  const post = async (path, body) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30000)
    try {
      const res = await fetch(`${BACKEND}${path}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: ctrl.signal,
      })
      clearTimeout(t)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      return data
    } catch (e) {
      clearTimeout(t)
      if (e.name === 'AbortError') throw new Error('Server is waking up — please wait and try again')
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
      const u = await post('/auth/email/register', { email, password, username })
      if (u.linked) { setSuccess('Password added!'); setTimeout(() => onGuestLogin(u), 600) }
      else onGuestLogin(u)
    } catch (e) {
      setError(e.message)
      if (e.message.includes('Sign in instead')) setTimeout(() => go('login'), 1200)
    } finally { setLoading(false) }
  }

  const handleLogin = async () => {
    if (!email.trim() || !password) return setError('Email and password required')
    setLoading(true); setError(''); setLoginHint('')
    try {
      const res = await fetch(`${BACKEND}/auth/email/login`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) onGuestLogin(data)
      else { setError(data.error || 'Login failed'); if (data.hint) setLoginHint(data.hint) }
    } catch { setError('Connection failed') } finally { setLoading(false) }
  }

  const handleMagicSend = async () => {
    if (!email.trim()) return setError('Email is required')
    setLoading(true); setError('')
    const wakingTimer = setTimeout(() => setError('Server is waking up, hang tight…'), 5000)
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 30000)
      const res = await fetch(`${BACKEND}/auth/magic/send`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }), signal: ctrl.signal,
      })
      clearTimeout(t); clearTimeout(wakingTimer)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to send link'); return }
      if (!data.emailConfigured && data.devLink) { setView('magic-sent') }
      else if (data.emailConfigured) { setView('magic-sent') }
      else if (data.devToken) {
        try { const u = await post('/auth/magic/verify', { token: data.devToken }); onGuestLogin(u) }
        catch { setView('magic-sent') }
      } else setView('magic-sent')
    } catch (e) {
      clearTimeout(wakingTimer)
      setError(e.name === 'AbortError' ? 'Server took too long — please try again' : e.message)
    } finally { setLoading(false) }
  }

  const handleForgot = async () => {
    if (!email.trim()) return setError('Email is required')
    setLoading(true); setError('')
    try { await post('/auth/email/forgot', { email }); setSuccess('If that email exists, a reset link has been sent.') }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const handleGuestSubmit = () => {
    const name = guestName.trim()
    if (!name) return setError('Enter a display name')
    if (name.length < 2) return setError('At least 2 characters')
    if (name.length > 20) return setError('Max 20 characters')
    onGuestLogin({ username: name })
  }

  const handleJoin = () => { if (roomId.trim()) onJoin({ roomId: roomId.toUpperCase().trim() }) }

  // ── Room preview: peek before joining ───────────────────
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    const code = roomId.trim().toUpperCase()
    if (code.length < 4) { setPreview(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND}/rooms/${encodeURIComponent(code)}/preview`, { credentials: 'include' })
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) setPreview(data)
      } catch { if (!cancelled) setPreview(null) }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [roomId])

  // ── Logged in ─────────────────────────────────────────
  if (user) {
    return (
      <Shell>
        <div className="rj-user-row">
          {user.avatar
            ? <img src={user.avatar} alt="" className="rj-user-avatar" />
            : <div className="rj-user-avatar rj-user-avatar--placeholder">{user.username?.slice(0,2).toUpperCase()}</div>
          }
          <div className="rj-user-info">
            <span className="rj-user-name">{user.username}</span>
            <span className="rj-user-sub">{user.isGuest ? 'Guest' : user.providers?.includes('google') ? 'Google' : 'Email'}</span>
          </div>
        </div>
        <div className="rj-stack">
          <input
            className="rj-input rj-input--room"
            type="text"
            placeholder="Room code"
            value={roomId}
            onChange={e => setRoomId(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            maxLength={10}
          />
          {roomId.trim().length >= 4 && preview && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
              fontSize: '0.78rem', color: 'var(--text-dim, #a29db8)',
              background: 'rgba(124,106,255,0.08)', border: '1px solid rgba(124,106,255,0.22)',
              borderRadius: 10, padding: '8px 12px',
            }}>
              {preview.exists ? (
                <>
                  <span style={{ color: preview.userCount > 0 ? '#6affb8' : 'inherit' }}>●</span>
                  <span>{preview.userCount > 0 ? `${preview.userCount} listening` : 'Empty room'}</span>
                  {preview.locked && <span>· password required</span>}
                  {preview.nowPlaying?.title && (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {preview.nowPlaying.title.length > 34 ? preview.nowPlaying.title.slice(0, 34) + '…' : preview.nowPlaying.title}
                    </span>
                  )}
                </>
              ) : (
                <span>New room — you'll be the DJ</span>
              )}
            </div>
          )}
          <PrimaryBtn onClick={handleJoin} disabled={!roomId.trim()}>Join Room</PrimaryBtn>
          <Divider />
          <GhostBtn onClick={() => onJoin({ roomId: Math.random().toString(36).substring(2,8).toUpperCase() })}>
            Create New Room
          </GhostBtn>
        </div>
      </Shell>
    )
  }

  // ── Magic sent ────────────────────────────────────────
  if (view === 'magic-sent') return (
    <Shell>
      <div className="rj-magic-sent">
        <div className="rj-magic-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
        </div>
        <p className="rj-magic-title">Check your inbox</p>
        <p className="rj-magic-sub">We sent a sign-in link to <strong>{email}</strong></p>
      </div>
      <Back onClick={() => go('home')} />
    </Shell>
  )

  // ── Login ─────────────────────────────────────────────
  if (view === 'login') return (
    <Shell>
      <p className="rj-page-title">Sign in</p>
      <div className="rj-stack">
        <Err msg={error} />
        {loginHint === 'google' && (
          <button className="rj-hint-btn rj-hint-btn--google" onClick={() => window.location.href = `${BACKEND}/auth/google`}>
            Sign in with Google instead
          </button>
        )}
        {loginHint === 'magic' && (
          <button className="rj-hint-btn" onClick={() => go('magic')}>
            Send a magic link instead
          </button>
        )}
        <Input label="Email" type="email" value={email} onChange={v => { setEmail(v); setLoginHint('') }} placeholder="you@example.com" autoComplete="email" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" onEnter={handleLogin} autoComplete="current-password" />
        <div className="rj-row-end"><TextBtn accent onClick={() => go('forgot')}>Forgot password?</TextBtn></div>
        <PrimaryBtn onClick={handleLogin} loading={loading}>Sign In</PrimaryBtn>
        <Divider />
        <div className="rj-row-between">
          <Back onClick={() => go('home')} />
          <TextBtn accent onClick={() => go('register')}>Create account</TextBtn>
        </div>
      </div>
    </Shell>
  )

  // ── Register ──────────────────────────────────────────
  if (view === 'register') return (
    <Shell>
      <p className="rj-page-title">Create account</p>
      <div className="rj-stack">
        <Err msg={error} /><Ok msg={success} />
        <Input label="Display name" value={username} onChange={setUsername} placeholder="How others see you" autoComplete="username" />
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" autoComplete="new-password" />
        <Input label="Confirm password" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="Same again" onEnter={handleRegister} autoComplete="new-password" />
        <PrimaryBtn onClick={handleRegister} loading={loading}>Create Account</PrimaryBtn>
        <div className="rj-row-between">
          <Back onClick={() => go('home')} />
          <TextBtn accent onClick={() => go('login')}>Sign in instead</TextBtn>
        </div>
      </div>
    </Shell>
  )

  // ── Forgot ────────────────────────────────────────────
  if (view === 'forgot') return (
    <Shell>
      <p className="rj-page-title">Reset password</p>
      <div className="rj-stack">
        <Err msg={error} /><Ok msg={success} />
        {!success && (
          <>
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" onEnter={handleForgot} autoComplete="email" />
            <PrimaryBtn onClick={handleForgot} loading={loading}>Send Reset Link</PrimaryBtn>
          </>
        )}
        <Back onClick={() => go('login')} />
      </div>
    </Shell>
  )

  // ── Guest ─────────────────────────────────────────────
  if (view === 'guest') return (
    <Shell>
      <p className="rj-page-title">Choose a name</p>
      <div className="rj-stack">
        <Err msg={error} />
        <Input value={guestName} onChange={v => { setGuestName(v); setError('') }} placeholder="e.g. NightOwl, DreamCatcher…" onEnter={handleGuestSubmit} autoComplete="off" />
        <PrimaryBtn onClick={handleGuestSubmit}>Enter Groove</PrimaryBtn>
        <p className="rj-guest-note">Guest accounts don't save history or library</p>
        <Back onClick={() => go('home')} />
      </div>
    </Shell>
  )

  // ── Home ──────────────────────────────────────────────
  return (
    <Shell>
      <p className="rj-tagline">Listen together, in sync</p>
      <div className="rj-stack">
        {/* Google */}
        <button className="rj-oauth-btn" onClick={() => window.location.href = `${BACKEND}/auth/google`}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <Divider />

        {/* Email options */}
        <div className="rj-email-list">
          <button className="rj-email-row" onClick={() => go('login')}>
            <span className="rj-email-icon rj-email-icon--purple">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
            </span>
            <span className="rj-email-label">Sign in with email</span>
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" className="rj-chevron"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </button>
          <button className="rj-email-row" onClick={() => go('register')}>
            <span className="rj-email-icon rj-email-icon--green">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </span>
            <span className="rj-email-label">Create account</span>
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" className="rj-chevron"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </button>
        </div>

        <Divider />

        {/* Guest */}
        <button className="rj-guest-btn" onClick={() => go('guest')}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
          Continue as Guest
        </button>
      </div>
    </Shell>
  )
}
