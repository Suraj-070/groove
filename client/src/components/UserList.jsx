import { useState } from 'react'

export default function UserList({ users: rawUsers = [], currentUser, djId, isDJ, onTransferDJ }) {
  const users = Array.isArray(rawUsers) ? rawUsers : []
  const colors = ['#7c6aff','#ff6a8a','#6affb8','#ffb86a','#6ab8ff','#ff6aff','#a78bfa','#34d399']
  const [confirmId, setConfirmId] = useState(null)
  const [showPanel, setShowPanel] = useState(false)

  const getColor = (id) => {
    let h = 0
    for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
    return colors[Math.abs(h) % colors.length]
  }

  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??'

  const formatJoinTime = (ts) => {
    if (!ts) return 'Just joined'
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return 'Just joined'
    if (diff < 3600) return `${Math.floor(diff / 60)}m in room`
    return `${Math.floor(diff / 3600)}h in room`
  }

  const Avatar = ({ user, size = 34 }) => (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {user.id === djId && (
        <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', zIndex: 1 }}>👑</span>
      )}
      {user.avatar
        ? <img src={user.avatar} alt={user.username} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', outline: user.id === currentUser ? `2px solid ${getColor(user.id)}` : 'none', outlineOffset: 2 }} />
        : <div style={{ width: size, height: size, borderRadius: '50%', background: getColor(user.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.28, fontWeight: 800, color: 'rgba(0,0,0,0.7)', outline: user.id === currentUser ? `2px solid ${getColor(user.id)}` : 'none', outlineOffset: 2 }}>
            {getInitials(user.username)}
          </div>
      }
    </div>
  )

  return (
    <>
      {/* ── Strip ── */}
      <div className="user-list" onClick={() => setShowPanel(true)}
        style={{ cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(124,106,255,0.3)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = ''}
      >
        <p className="user-list-label">
          <span className="live-dot" />
          {users.length} listening
        </p>
        <div className="user-avatars">
          {users.slice(0, 6).map(user => (
            <div key={user.id} style={{ position: 'relative' }}>
              {user.id === djId && <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', zIndex: 1 }}>👑</span>}
              <Avatar user={user} size={34} />
            </div>
          ))}
          {users.length > 6 && (
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)' }}>
              +{users.length - 6}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel ── */}
      {showPanel && (
        <>
          {/* Backdrop */}
          <div onClick={() => setShowPanel(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.18s ease' }}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 501,
            width: 360,
            maxHeight: '70vh',
            background: 'linear-gradient(160deg, #0f0a1e, #0a0814)',
            border: '1px solid rgba(124,106,255,0.2)',
            borderRadius: 24,
            boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,106,255,0.08)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            animation: 'panelSpringIn 0.3s cubic-bezier(0.34,1.2,0.64,1)',
          }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,201,116,0.12)', border: '1px solid rgba(0,201,116,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00c974', display: 'block', boxShadow: '0 0 8px rgba(0,201,116,0.8)', animation: 'blink 1.5s ease-in-out infinite' }} />
                  </div>
                  <div>
                    <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '0.9rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                      {users.length} Listening
                    </p>
                    <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', margin: 0, marginTop: 2 }}>
                      Live in this room
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowPanel(false)}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
                >✕</button>
              </div>
            </div>

            {/* User list */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 16px' }}>
              {users.map((user, i) => {
                const isYou   = user.id === currentUser
                const isDJUser = user.id === djId
                const color   = getColor(user.id)

                return (
                  <div key={user.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 14px',
                      borderRadius: 16,
                      background: isYou ? `${color}12` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isYou ? `${color}28` : 'rgba(255,255,255,0.05)'}`,
                      marginBottom: 8,
                      transition: 'background 0.15s',
                      animation: `songItemIn 0.3s cubic-bezier(0.34,1.1,0.64,1) ${i * 0.04}s both`,
                    }}
                    onMouseEnter={e => { if (!isYou) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                    onMouseLeave={e => { if (!isYou) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  >
                    <Avatar user={user} size={46} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                          {user.username}
                        </span>
                        {isYou && (
                          <span style={{ fontSize: '0.6rem', background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>
                            You
                          </span>
                        )}
                        {isDJUser && (
                          <span style={{ fontSize: '0.6rem', background: 'rgba(255,184,106,0.12)', color: '#ffb86a', border: '1px solid rgba(255,184,106,0.25)', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>
                            👑 DJ
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00c974', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)' }}>
                          {formatJoinTime(user.joinedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Pass crown */}
                    {isDJ && !isYou && !isDJUser && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmId(user.id); setShowPanel(false) }}
                        style={{ background: 'rgba(255,184,106,0.08)', border: '1px solid rgba(255,184,106,0.2)', borderRadius: 10, color: '#ffb86a', fontSize: '0.72rem', fontWeight: 700, padding: '6px 12px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,184,106,0.18)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,184,106,0.08)' }}
                      >
                        👑 Crown
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* DJ transfer confirm */}
          {confirmId && (() => {
            const user = users.find(u => u.id === confirmId)
            if (!user) return null
            return (
              <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 502, background: 'linear-gradient(160deg,#0f0a1e,#0a0814)', border: '1px solid rgba(255,184,106,0.3)', borderRadius: 20, padding: '24px 22px', width: 280, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.7)', animation: 'panelSpringIn 0.25s cubic-bezier(0.34,1.2,0.64,1)' }}>
                <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.5)', margin: '0 0 12px' }}>Pass the DJ crown to</p>
                <Avatar user={user} size={52} />
                <p style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', margin: '10px 0 16px' }}>{user.username}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600 }}>Cancel</button>
                  <button onClick={() => { onTransferDJ?.(user.id); setConfirmId(null) }} style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#ffb86a,#ff8c00)', border: 'none', borderRadius: 12, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700 }}>👑 Crown</button>
                </div>
              </div>
            )
          })()}
        </>
      )}
    </>
  )
}