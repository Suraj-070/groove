import { useState } from 'react'

export default function UserList({ users: rawUsers = [], currentUser, djId, isDJ, onTransferDJ }) {
  const users = Array.isArray(rawUsers) ? rawUsers : []
  const colors = ['#7c6aff', '#ff6a8a', '#6affb8', '#ffb86a', '#6ab8ff', '#ff6aff']
  const [confirmId, setConfirmId] = useState(null)

  const getColor = (id) => {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }

  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??'

  const handleAvatarClick = (user) => {
    // Only DJ can transfer, and not to themselves
    if (!isDJ || user.id === currentUser) return
    setConfirmId(user.id)
  }

  const confirmTransfer = (user) => {
    onTransferDJ?.(user.id)
    setConfirmId(null)
  }

  return (
    <div className="user-list">
      <p className="user-list-label">
        <span className="live-dot" />
        {users.length} listening
      </p>
      <div className="user-avatars">
        {users.map((user) => (
          <div
            key={user.id}
            className={`avatar-wrap ${isDJ && user.id !== currentUser ? 'avatar-wrap--clickable' : ''}`}
            title={
              user.username +
              (user.id === currentUser ? ' (you)' : '') +
              (user.id === djId ? ' 👑 DJ' : '') +
              (isDJ && user.id !== currentUser ? ' — tap to pass crown' : '')
            }
            onClick={() => handleAvatarClick(user)}
          >
            {user.id === djId && <span className="dj-crown">👑</span>}

            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                className={'avatar-img' + (user.id === currentUser ? ' you' : '')}
                style={{ outline: user.id === currentUser ? '2px solid ' + getColor(user.id) : 'none', outlineOffset: '2px' }}
              />
            ) : (
              <div
                className={'avatar' + (user.id === currentUser ? ' you' : '')}
                style={{ background: getColor(user.id) }}
              >
                {getInitials(user.username)}
              </div>
            )}

            {/* Transfer confirm tooltip */}
            {confirmId === user.id && (
              <div className="dj-transfer-confirm" onClick={e => e.stopPropagation()}>
                <p>Pass crown to<br /><strong>{user.username}</strong>?</p>
                <div className="dj-transfer-btns">
                  <button className="dj-transfer-yes" onClick={() => confirmTransfer(user)}>👑 Yes</button>
                  <button className="dj-transfer-no" onClick={() => setConfirmId(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
