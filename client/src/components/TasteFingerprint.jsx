import { useState, useEffect } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const MOOD_EMOJI = { euphoric:'😤', confident:'😎', chill:'😌', sad:'😢', aggressive:'🔥', neutral:'🎵' }
const MOOD_COLOR = { euphoric:'#ff2d78', confident:'#9b6aff', chill:'#3b8bff', sad:'#6ab8ff', aggressive:'#ff6a3d', neutral:'#7c6aff' }

function Bar({ label, value, color, suffix = '%' }) {
  return (
    <div className="fp-bar-row">
      <span className="fp-bar-label">{label}</span>
      <div className="fp-bar-track">
        <div className="fp-bar-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="fp-bar-val">{value}{suffix}</span>
    </div>
  )
}

export default function TasteFingerprint({ isOpen, onClose }) {
  const [fp, setFp]         = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (!isOpen) return
    setLoading(true); setError('')
    fetch(`${BACKEND}/taste-fingerprint`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else if (!d.fingerprint) setError(d.message || 'Not enough data yet')
        else setFp(d.fingerprint)
      })
      .catch(() => setError('Failed to load fingerprint'))
      .finally(() => setLoading(false))
  }, [isOpen])

  if (!isOpen) return null

  const moodBreakdown = fp?.moodBreakdown || {}
  const totalMoods = Object.values(moodBreakdown).reduce((a,b) => a+b, 0) || 1

  // Personality label based on fingerprint
  const getPersonality = (fp) => {
    if (!fp) return null
    if (fp.energy > 75 && fp.danceability > 65) return { label: 'Party Starter', emoji: '🎉', desc: 'High energy, loves to dance' }
    if (fp.energy < 40 && fp.dominantMood === 'chill') return { label: 'Vibe Curator', emoji: '🌙', desc: 'Calm, atmospheric selections' }
    if (fp.variety > 70) return { label: 'Wildcard', emoji: '🎲', desc: 'Unpredictably eclectic taste' }
    if (fp.dominantMood === 'sad') return { label: 'Emotion Chaser', emoji: '💙', desc: 'Feels music deeply' }
    if (fp.dominantMood === 'euphoric') return { label: 'Peak Seeker', emoji: '⚡', desc: 'Always chasing the high' }
    if (fp.danceability > 70) return { label: 'Dance Floor King', emoji: '🕺', desc: 'Born to move' }
    return { label: 'Well-Rounded', emoji: '🎵', desc: 'Balanced and open-minded' }
  }

  const personality = fp ? getPersonality(fp) : null

  return (
    <div className="fp-overlay" onClick={onClose}>
      <div className="fp-panel" onClick={e => e.stopPropagation()}>
        <div className="fp-header">
          <div className="fp-header-left">
            <span className="fp-header-icon">🫆</span>
            <div>
              <p className="fp-title">Taste Fingerprint</p>
              {fp && <p className="fp-sub">Based on {fp.totalSongs} songs</p>}
            </div>
          </div>
          <button className="hist-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div className="fp-body">
          {loading && (
            <div className="hist-loading">
              <div className="shared-spinner" />
              <span>Analyzing your listening DNA…</span>
            </div>
          )}

          {error && (
            <div className="hist-empty">
              <span style={{fontSize:'2rem'}}>🫆</span>
              <p>{error}</p>
              <p className="hist-empty-sub">Listen to more songs to unlock your fingerprint</p>
            </div>
          )}

          {fp && !loading && (
            <>
              {/* Personality card */}
              {personality && (
                <div className="fp-personality">
                  <span className="fp-personality-emoji">{personality.emoji}</span>
                  <div>
                    <p className="fp-personality-label">{personality.label}</p>
                    <p className="fp-personality-desc">{personality.desc}</p>
                  </div>
                </div>
              )}

              {/* Metrics */}
              <div className="fp-section">
                <p className="fp-section-label">Your sound profile</p>
                <Bar label="Energy"       value={fp.energy || 0}       color="#ff2d78" />
                <Bar label="Danceability" value={fp.danceability || 0} color="#9b6aff" />
                <Bar label="Variety"      value={fp.variety || 0}      color="#00c974" />
                {fp.bpm && <Bar label="Avg BPM" value={fp.bpm} color="#3b8bff" suffix=" bpm" />}
              </div>

              {/* Mood breakdown */}
              <div className="fp-section">
                <p className="fp-section-label">Mood breakdown</p>
                <div className="fp-moods">
                  {Object.entries(moodBreakdown)
                    .sort((a,b) => b[1]-a[1])
                    .map(([mood, count]) => {
                      const pct = Math.round(count / totalMoods * 100)
                      return (
                        <div key={mood} className="fp-mood-pill" style={{ background: `${MOOD_COLOR[mood]}18`, borderColor: `${MOOD_COLOR[mood]}40` }}>
                          <span>{MOOD_EMOJI[mood]}</span>
                          <span className="fp-mood-name">{mood}</span>
                          <span className="fp-mood-pct" style={{color: MOOD_COLOR[mood]}}>{pct}%</span>
                        </div>
                      )
                    })
                  }
                </div>
              </div>

              {/* Dominant mood highlight */}
              <div className="fp-dominant" style={{ background: `${MOOD_COLOR[fp.dominantMood]}12`, borderColor: `${MOOD_COLOR[fp.dominantMood]}30` }}>
                <span className="fp-dominant-emoji">{MOOD_EMOJI[fp.dominantMood]}</span>
                <div>
                  <p className="fp-dominant-label">Your dominant mood</p>
                  <p className="fp-dominant-val" style={{color: MOOD_COLOR[fp.dominantMood]}}>{fp.dominantMood}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
