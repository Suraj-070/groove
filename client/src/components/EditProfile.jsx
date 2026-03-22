import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// Preset avatar options — emoji-based
const PRESET_AVATARS = [
  '🎵','🎸','🎹','🎺','🎻','🥁','🎷','🎤',
  '🦋','🌊','🔥','⚡','🌙','☀️','🌈','💫',
  '🐉','🦄','🐺','🦊','🐬','🦁','🐼','🎭',
]

function EmojiAvatar({ emoji, size = 64 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, rgba(124,106,255,0.3), rgba(255,106,138,0.3))',
      border: '2px solid rgba(124,106,255,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45,
    }}>
      {emoji}
    </div>
  )
}

export default function EditProfile({ user, onClose, onUpdate }) {
  const [username, setUsername] = useState(user?.username || '')
  const [avatar, setAvatar]     = useState(user?.avatar || '')
  const [tab, setTab]           = useState('emoji') // 'emoji' | 'url'
  const [urlInput, setUrlInput] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const isGuest   = user?.isGuest
  const isEmail   = user?.id?.startsWith('email_')
  const isGoogle  = user?.provider === 'google' || user?.providers?.includes('google')
  const canEdit   = !isGuest && (isEmail || isGoogle)

  const currentAvatar = avatar || username?.slice(0, 2).toUpperCase()
  const isEmoji = avatar && [...avatar].length === 1 && avatar.match(/\p{Emoji}/u)

  const handleSave = async () => {
    if (!username.trim()) return setError('Username is required')
    if (username.trim().length < 2) return setError('At least 2 characters')
    if (username.trim().length > 24) return setError('Max 24 characters')
    setLoading(true); setError('')
    try {
      const res = await fetch(`${BACKEND}/auth/profile/update`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), avatar }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to update'); return }
      setSuccess('Profile updated!')
      onUpdate(data) // update user in App state
      setTimeout(onClose, 800)
    } catch { setError('Failed to update profile') }
    finally { setLoading(false) }
  }

  const selectEmoji = (emoji) => {
    setAvatar(emoji)
  }

  const applyUrl = () => {
    if (urlInput.trim()) setAvatar(urlInput.trim())
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 2001, width: 'min(400px, calc(100vw - 32px))',
        background: '#0e0c1a',
        border: '1px solid rgba(124,106,255,0.2)',
        borderRadius: 24,
        boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        overflow: 'hidden',
        animation: 'panelSpringIn 0.28s cubic-bezier(0.34,1.2,0.64,1)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>Edit Profile</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 28, height: 28, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        <div style={{ padding: '20px' }}>
          {!canEdit && (
            <div style={{ background: 'rgba(255,184,106,0.1)', border: '1px solid rgba(255,184,106,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', color: '#ffd080', marginBottom: 16 }}>
              👤 Guests cannot edit profiles. Create an account first.
            </div>
          )}
          {isGoogle && !isEmail && (
            <div style={{ background: 'rgba(124,106,255,0.08)', border: '1px solid rgba(124,106,255,0.15)', borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem', color: 'rgba(196,181,253,0.7)', marginBottom: 16 }}>
              ℹ️ You signed in with Google. Changing your avatar here overrides your Google picture in Groove.
            </div>
          )}

          {/* Current avatar preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            {avatar && !isEmoji
              ? <img src={avatar} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(124,106,255,0.4)' }}
                  onError={() => setAvatar('')} />
              : isEmoji
              ? <EmojiAvatar emoji={avatar} size={64} />
              : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#7c6aff,#ff6a8a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                  {username?.slice(0, 2).toUpperCase() || '??'}
                </div>
            }
            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', margin: 0 }}>{username || 'Your Name'}</p>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', margin: '3px 0 0' }}>{user?.email || (isGuest ? 'Guest' : '')}</p>
            </div>
          </div>

          {/* Username */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={!canEdit}
              maxLength={24}
              placeholder="Your display name"
              style={{ width: '100%', padding: '10px 13px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none', opacity: canEdit ? 1 : 0.5, boxSizing: 'border-box' }}
              onFocus={e => { if (canEdit) { e.target.style.borderColor = 'rgba(124,106,255,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(124,106,255,0.1)' }}}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {/* Avatar picker */}
          {canEdit && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Avatar</label>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {['emoji', 'url'].map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', background: tab === t ? 'rgba(124,106,255,0.15)' : 'transparent', borderColor: tab === t ? 'rgba(124,106,255,0.4)' : 'rgba(255,255,255,0.1)', color: tab === t ? '#c4b5fd' : 'rgba(255,255,255,0.4)' }}>
                    {t === 'emoji' ? '😊 Emoji' : '🔗 Image URL'}
                  </button>
                ))}
              </div>

              {tab === 'emoji' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
                  {/* Remove avatar option */}
                  <button onClick={() => setAvatar('')} title="Remove avatar"
                    style={{ width: '100%', aspectRatio: '1', borderRadius: 10, background: avatar === '' ? 'rgba(255,106,138,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${avatar === '' ? 'rgba(255,106,138,0.4)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ✕
                  </button>
                  {PRESET_AVATARS.map(e => (
                    <button key={e} onClick={() => selectEmoji(e)}
                      style={{ width: '100%', aspectRatio: '1', borderRadius: 10, background: avatar === e ? 'rgba(124,106,255,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${avatar === e ? 'rgba(124,106,255,0.5)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,106,255,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = avatar === e.currentTarget.textContent ? 'rgba(124,106,255,0.15)' : 'rgba(255,255,255,0.04)'}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}

              {tab === 'url' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    style={{ flex: 1, padding: '10px 13px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontFamily: 'inherit', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                    onKeyDown={e => e.key === 'Enter' && applyUrl()}
                  />
                  <button onClick={applyUrl} style={{ padding: '10px 14px', background: 'rgba(124,106,255,0.15)', border: '1px solid rgba(124,106,255,0.3)', borderRadius: 10, color: '#c4b5fd', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error/Success */}
          {error && <div style={{ background: 'rgba(255,80,100,0.1)', border: '1px solid rgba(255,80,100,0.2)', borderRadius: 8, padding: '9px 12px', fontSize: '0.82rem', color: '#ffb0bc', marginBottom: 12 }}>{error}</div>}
          {success && <div style={{ background: 'rgba(0,201,116,0.1)', border: '1px solid rgba(0,201,116,0.2)', borderRadius: 8, padding: '9px 12px', fontSize: '0.82rem', color: '#80e8c0', marginBottom: 12 }}>✓ {success}</div>}

          {/* Save button */}
          {canEdit && (
            <button onClick={handleSave} disabled={loading}
              style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#7c6aff,#ff6a8a)', border: 'none', borderRadius: 12, color: '#fff', fontFamily: 'inherit', fontSize: '0.92rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, boxShadow: '0 4px 16px rgba(124,106,255,0.3)' }}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}