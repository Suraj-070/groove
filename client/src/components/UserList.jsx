export default function UserList({ users, currentUser, djId }) {
  const colors = ['#7c6aff', '#ff6a8a', '#6affb8', '#ffb86a', '#6ab8ff', '#ff6aff']

  const getColor = (id) => {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }

  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??'

  return (
    <div className="user-list">
      <p className="user-list-label">
        <span className="live-dot" />
        {users.length} listening
      </p>
      <div className="user-avatars">
        {users.map((user) => (
          <div key={user.id} className="avatar-wrap"
            title={user.username + (user.id === currentUser ? ' (you)' : '') + (user.id === djId ? ' DJ' : '')}>
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
          </div>
        ))}
      </div>
    </div>
  )
}
