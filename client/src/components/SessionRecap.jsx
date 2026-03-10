export default function SessionRecap({ recap, onClose }) {
  if (!recap) return null

  const { songsPlayed, sessionStart, sessionDuration, users } = recap

  const formatDuration = (ms) => {
    const totalMin = Math.floor(ms / 60000)
    const hrs = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
  }

  const formatTime = (ts) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="recap-overlay" onClick={onClose}>
      <div className="recap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recap-header">
          <div className="recap-title">
            <span className="recap-icon">🎵</span>
            <div>
              <h2>Session Recap</h2>
              <p className="recap-sub">Started at {formatTime(sessionStart)}</p>
            </div>
          </div>
          <button className="recap-close" onClick={onClose}>×</button>
        </div>

        <div className="recap-stats">
          <div className="recap-stat">
            <span className="stat-value">{songsPlayed.length}</span>
            <span className="stat-label">Songs Played</span>
          </div>
          <div className="recap-stat">
            <span className="stat-value">{formatDuration(sessionDuration)}</span>
            <span className="stat-label">Session Length</span>
          </div>
          <div className="recap-stat">
            <span className="stat-value">{users.length}</span>
            <span className="stat-label">Listeners</span>
          </div>
        </div>

        <div className="recap-songs">
          <h3>Played This Session</h3>
          {songsPlayed.length === 0 ? (
            <p className="recap-empty">No songs were played yet</p>
          ) : (
            <ul className="recap-song-list">
              {songsPlayed.map((song, i) => (
                <li key={i} className="recap-song-item">
                  <span className="recap-num">{i + 1}</span>
                  <img
                    src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`}
                    alt=""
                    className="recap-thumb"
                  />
                  <div className="recap-song-info">
                    <p className="recap-song-title">{song.title}</p>
                    {song.addedBy && (
                      <p className="recap-added-by">Added by {song.addedBy}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="recap-footer">
          <button className="recap-share-btn" onClick={() => {
            const text = `🎵 We just listened to ${songsPlayed.length} songs together for ${formatDuration(sessionDuration)} on Groove Together!\n\n` +
              songsPlayed.map((s, i) => `${i + 1}. ${s.title}`).join('\n')
            navigator.clipboard?.writeText(text)
            alert('Copied to clipboard!')
          }}>
            📋 Copy Recap
          </button>
          <button className="recap-close-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
