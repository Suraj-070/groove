import { useState } from 'react'
import { createPortal } from 'react-dom'

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
      {user.id === djId && <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', zIndex: 1 }}>👑</span>}
      {user.avatar
        ? <img src={user.avatar} alt={user.username} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', outline: user.id === currentUser ? `2px solid ${getColor(user.id)}` : 'none', outlineOffset: 2 }} />
        : <div style={{ width: size, height: size, borderRadius: '50%', background: getColor(user.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.28, fontWeight: 800, color: 'rgba(0,0,0,0.7)', outline: user.id === currentUser ? `2px solid ${getColor(user.id)}` : 'none', outlineOffset: 2 }}>
            {getInitials(user.username)}
          </div>
      }
    </div>
  )

  const panel = showPanel && createPortal(
    <div style={{
      position: 'fixed',
      right: 20,
      top: 72,
      width: 320,
      height: 'calc(100dvh - 88px)',
      zIndex: 9999,
      background: '#0e0c1a',
      border: '1px solid rgba(124,106,255,0.18)',
      borderRadius: 22,
      boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,106,255,0.08)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'chatIn 0.28s cubic-bezier(0.34,1.2,0.64,1)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: 'var(--accent)', display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>In the Room</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: 'var(--accent)', background: 'rgba(124,106,255,0.1)', border: '1px solid rgba(124,106,255,0.2)', borderRadius: 20, padding: '2px 8px 2px 6px', fontWeight: 500 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00c974', display: 'inline-block', boxShadow: '0 0 6px rgba(0,201,116,0.8)' }} />
            {users.length} live
          </span>
        </div>
        <button onClick={() => setShowPanel(false)}
          style={{ background: 'rgba(255,255,255,0.04)', border: 'none', color: 'var(--muted)', width: 28, height: 28, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s, color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '' }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      {/* User list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '10px 12px' }}>
        {users.map((user, i) => {
          const isYou   = user.id === currentUser
          const isDJUser = user.id === djId
          const color   = getColor(user.id)
          return (
            <div key={user.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 14,
              background: isYou ? `${color}14` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isYou ? `${color}28` : 'rgba(255,255,255,0.05)'}`,
              marginBottom: 6,
              transition: 'background 0.15s',
              animation: `chatIn 0.25s cubic-bezier(0.34,1.1,0.64,1) ${i * 0.04}s both`,
            }}
              onMouseEnter={e => { if (!isYou) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={e => { if (!isYou) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
            >
              <Avatar user={user} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>{user.username}</span>
                  {isYou && <span style={{ fontSize: '0.58rem', background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>You</span>}
                  {isDJUser && <span style={{ fontSize: '0.58rem', background: 'rgba(255,184,106,0.12)', color: '#ffb86a', border: '1px solid rgba(255,184,106,0.3)', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>👑 DJ</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00c974', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>{formatJoinTime(user.joinedAt)}</span>
                </div>
              </div>
              {isDJ && !isYou && !isDJUser && (
                <button
                  onClick={() => { setConfirmId(user.id) }}
                  style={{ background: 'rgba(255,184,106,0.08)', border: '1px solid rgba(255,184,106,0.2)', borderRadius: 8, color: '#ffb86a', fontSize: '0.68rem', fontWeight: 700, padding: '5px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,184,106,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,184,106,0.08)'}
                >👑</button>
              )}
            </div>
          )
        })}
      </div>

      {/* DJ transfer confirm — inline inside panel */}
      {confirmId && (() => {
        const user = users.find(u => u.id === confirmId)
        if (!user) return null
        return (
          <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,184,106,0.05)', flexShrink: 0 }}>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', margin: '0 0 10px', textAlign: 'center' }}>
              Pass 👑 crown to <strong style={{ color: '#fff' }}>{user.username}</strong>?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: '9px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => { onTransferDJ?.(user.id); setConfirmId(null); setShowPanel(false) }} style={{ flex: 1, padding: '9px', background: 'linear-gradient(135deg,#ffb86a,#ff8c00)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700 }}>👑 Crown</button>
            </div>
          </div>
        )
      })()}
    </div>,
    document.body
  )

  return (
    <>
      <div className="user-list" onClick={() => setShowPanel(p => !p)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
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
      {panel}
    </>
  )
}