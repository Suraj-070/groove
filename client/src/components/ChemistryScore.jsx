import { useState, useEffect } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function ChemistryRing({ score }) {
  const r = 36, circ = 2 * Math.PI * r
  const fill = circ * (1 - score / 100)
  const color = score >= 75 ? '#7c6aff' : score >= 50 ? '#ffb300' : '#ff6a8a'
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={circ} strokeDashoffset={fill}
        strokeLinecap="round" transform="rotate(-90 44 44)"
        style={{transition:'stroke-dashoffset 1s ease'}}/>
      <text x="44" y="44" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="16" fontWeight="700">{score}%</text>
    </svg>
  )
}

export default function ChemistryScore({ isOpen, onClose, roomId }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !roomId) return
    setLoading(true)
    fetch(`${BACKEND}/chemistry/${roomId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen, roomId])

  if (!isOpen) return null
  const avgChem = data?.avgChemistry
  const sessions = data?.sessions || []

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel-modal" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-header-left">
            <span style={{fontSize:'1.2rem'}}>💜</span>
            <div>
              <p className="panel-title">Room Chemistry</p>
              <p className="panel-sub">Room {roomId}</p>
            </div>
          </div>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <div className="panel-body">
          {loading && <div className="panel-loading"><div className="shared-spinner"/><span>Calculating chemistry…</span></div>}

          {!loading && avgChem != null && (
            <>
              <div className="chem-hero">
                <ChemistryRing score={avgChem} />
                <div>
                  <p className="chem-hero-label">Average chemistry</p>
                  <p className="chem-hero-sub">
                    {avgChem >= 80 ? '🔥 This room is electric!' : avgChem >= 60 ? '💜 Great vibe together' : avgChem >= 40 ? '🎵 Good session' : '🌱 Still warming up'}
                  </p>
                  <p className="chem-hero-sessions">{sessions.length} session{sessions.length!==1?'s':''} together</p>
                </div>
              </div>

              {sessions.length > 0 && (
                <div className="chem-sessions">
                  <p className="wrapped-section-label">Past sessions</p>
                  {sessions.slice(0,5).map((s,i) => (
                    <div key={i} className="chem-session-row">
                      <div className="chem-session-info">
                        <span className="chem-session-date">{new Date(s.sessionStart).toLocaleDateString([], {month:'short',day:'numeric'})}</span>
                        <span className="chem-session-songs">{s.songsPlayed?.length||0} songs</span>
                        {s.dominantMood && <span className="chem-session-mood">{s.dominantMood}</span>}
                      </div>
                      <div className="chem-session-score" style={{color: s.chemistry>=75?'#7c6aff':s.chemistry>=50?'#ffb300':'#ff6a8a'}}>
                        {s.chemistry}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && avgChem == null && (
            <div className="panel-empty">
              <span style={{fontSize:'2.5rem'}}>💜</span>
              <p>No sessions yet in this room</p>
              <p className="panel-empty-sub">Listen together and your chemistry score will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
