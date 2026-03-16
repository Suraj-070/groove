import { useState, useEffect } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const MOOD_EMOJI = { euphoric:'😤', confident:'😎', chill:'😌', sad:'😢', aggressive:'🔥', neutral:'🎵' }

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })
}

export default function TimeMachine({ isOpen, onClose, onLoadSession }) {
  const [memories, setMemories] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true); setError('')
    fetch(`${BACKEND}/time-machine`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setMemories(d.memories || []) })
      .catch(() => setError('Failed to load memories'))
      .finally(() => setLoading(false))
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel-modal" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-header-left">
            <span style={{fontSize:'1.2rem'}}>⏰</span>
            <div>
              <p className="panel-title">Groove Time Machine</p>
              <p className="panel-sub">Relive your past sessions</p>
            </div>
          </div>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <div className="panel-body">
          {loading && <div className="panel-loading"><div className="shared-spinner"/><span>Searching your musical past…</span></div>}
          {error && <div className="panel-empty"><span>⏰</span><p>{error}</p></div>}

          {!loading && memories.length === 0 && !error && (
            <div className="panel-empty">
              <span style={{fontSize:'2.5rem'}}>⏰</span>
              <p>No memories yet</p>
              <p className="panel-empty-sub">Come back after a few weeks — your past sessions will appear here</p>
            </div>
          )}

          <div className="tm-list">
            {memories.map((mem, mi) => (
              <div key={mi} className="tm-memory">
                <div className="tm-memory-header" onClick={() => setExpanded(expanded === mi ? null : mi)}>
                  <div className="tm-memory-left">
                    <span className="tm-ago">{mem.daysAgo === 7 ? '1 week ago' : mem.daysAgo === 14 ? '2 weeks ago' : mem.daysAgo === 30 ? '1 month ago' : mem.daysAgo === 60 ? '2 months ago' : mem.daysAgo === 90 ? '3 months ago' : '1 year ago'}</span>
                    <span className="tm-date">{formatDate(mem.date)}</span>
                  </div>
                  <div className="tm-memory-right">
                    <span className="tm-session-count">{mem.sessions.length} session{mem.sessions.length!==1?'s':''}</span>
                    <span className="tm-chevron">{expanded === mi ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expanded === mi && mem.sessions.map((session, si) => (
                  <div key={si} className="tm-session">
                    <div className="tm-session-info">
                      <span className="tm-session-room">Room {session.roomId}</span>
                      {session.dominantMood && <span className="tm-session-mood">{MOOD_EMOJI[session.dominantMood]} {session.dominantMood}</span>}
                      {session.chemistry > 0 && <span className="tm-session-chem">💜 {session.chemistry}% chemistry</span>}
                    </div>
                    <div className="tm-songs-preview">
                      {session.songsPlayed.slice(0, 4).map((s, i) => (
                        <img key={i} src={`https://img.youtube.com/vi/${s.videoId}/default.jpg`} alt="" className="tm-song-thumb" loading="lazy" title={s.title} />
                      ))}
                      {session.songsPlayed.length > 4 && <span className="tm-songs-more">+{session.songsPlayed.length - 4}</span>}
                    </div>
                    <div className="tm-participants">
                      {session.participants.slice(0, 5).map((p, i) => (
                        p.avatar
                          ? <img key={i} src={p.avatar} alt={p.username} className="tm-avatar" title={p.username} />
                          : <div key={i} className="tm-avatar tm-avatar-placeholder" title={p.username}>{p.username?.slice(0,2).toUpperCase()}</div>
                      ))}
                    </div>
                    <button
                      className="tm-replay-btn"
                      onClick={() => onLoadSession(session.songsPlayed.map(s => ({ videoId: s.videoId, title: s.title })))}
                    >
                      ▶ Replay this session
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
