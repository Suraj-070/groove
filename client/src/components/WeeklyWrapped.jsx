import { useState, useEffect } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const MOOD_EMOJI = { euphoric:'😤', confident:'😎', chill:'😌', sad:'😢', aggressive:'🔥', neutral:'🎵' }
const MOOD_COLOR = { euphoric:'#ff2d78', confident:'#9b6aff', chill:'#3b8bff', sad:'#6ab8ff', aggressive:'#ff6a3d', neutral:'#7c6aff' }

export default function WeeklyWrapped({ isOpen, onClose }) {
  const [wrapped, setWrapped] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true); setError('')
    fetch(`${BACKEND}/wrapped`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else if (!d.wrapped) setError(d.message||'Not enough data'); else setWrapped(d.wrapped) })
      .catch(() => setError('Failed to load wrapped'))
      .finally(() => setLoading(false))
  }, [isOpen])

  const handleShare = async () => {
    if (!wrapped) return
    const text = [
      `🎵 My Groove Week`,
      `${wrapped.totalSongs} songs · ${wrapped.totalMinutes} min · ${wrapped.sessions} sessions`,
      `Vibe: ${MOOD_EMOJI[wrapped.dominantMood]} ${wrapped.dominantMood}`,
      wrapped.avgBpm ? `Avg BPM: ${wrapped.avgBpm}` : '',
      wrapped.streak > 0 ? `🔥 ${wrapped.streak} day streak` : '',
      '',
      'Top songs:',
      ...wrapped.topSongs.slice(0,3).map((s,i) => `${i+1}. ${s.title}`),
      '',
      '🎵 groovetoget.vercel.app',
    ].filter(Boolean).join('\n')
    if (navigator.share) await navigator.share({ title: 'My Groove Week', text })
    else { await navigator.clipboard?.writeText(text); setCopied(true); setTimeout(()=>setCopied(false), 2000) }
  }

  if (!isOpen) return null
  const mood = wrapped?.dominantMood || 'neutral'

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel-modal" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-header-left">
            <span style={{fontSize:'1.2rem'}}>📊</span>
            <div>
              <p className="panel-title">Weekly Wrapped</p>
              <p className="panel-sub">Your last 7 days on Groove</p>
            </div>
          </div>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <div className="panel-body">
          {loading && <div className="panel-loading"><div className="shared-spinner"/><span>Building your week…</span></div>}
          {error && <div className="panel-empty"><span>📊</span><p>{error}</p><p className="panel-empty-sub">Keep listening and check back soon</p></div>}

          {wrapped && !loading && (
            <>
              {/* Hero mood */}
              <div className="wrapped-hero" style={{ background:`linear-gradient(135deg, ${MOOD_COLOR[mood]}20, transparent)`, borderColor:`${MOOD_COLOR[mood]}40` }}>
                <span className="wrapped-hero-emoji">{MOOD_EMOJI[mood]}</span>
                <div>
                  <p className="wrapped-hero-mood" style={{color: MOOD_COLOR[mood]}}>{mood}</p>
                  <p className="wrapped-hero-sub">Your dominant vibe this week</p>
                </div>
              </div>

              {/* Stats */}
              <div className="wrapped-stats">
                {[
                  { val: wrapped.totalSongs, lbl: 'songs' },
                  { val: `${wrapped.totalMinutes}m`, lbl: 'listened' },
                  { val: wrapped.sessions, lbl: 'sessions' },
                  { val: wrapped.uniqueRooms, lbl: 'rooms' },
                  ...(wrapped.streak > 0 ? [{ val: `🔥${wrapped.streak}`, lbl: 'streak' }] : []),
                  ...(wrapped.avgBpm ? [{ val: wrapped.avgBpm, lbl: 'avg BPM' }] : []),
                ].map((s,i) => (
                  <div key={i} className="wrapped-stat">
                    <span className="wrapped-stat-val">{s.val}</span>
                    <span className="wrapped-stat-lbl">{s.lbl}</span>
                  </div>
                ))}
              </div>

              {/* Top songs */}
              {wrapped.topSongs.length > 0 && (
                <div className="wrapped-section">
                  <p className="wrapped-section-label">Top songs this week</p>
                  {wrapped.topSongs.map((song, i) => (
                    <div key={song.videoId} className="wrapped-song-row">
                      <span className="wrapped-song-rank">{i+1}</span>
                      <img src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`} alt="" className="wrapped-song-thumb" />
                      <div className="wrapped-song-info">
                        <p className="wrapped-song-title">{song.title}</p>
                        <p className="wrapped-song-count">played {song.count}×</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Mood breakdown */}
              {wrapped.moodBreakdown && Object.keys(wrapped.moodBreakdown).length > 0 && (
                <div className="wrapped-section">
                  <p className="wrapped-section-label">Mood breakdown</p>
                  <div className="wrapped-moods">
                    {Object.entries(wrapped.moodBreakdown).sort((a,b)=>b[1]-a[1]).map(([m,c]) => {
                      const total = Object.values(wrapped.moodBreakdown).reduce((a,b)=>a+b,0)
                      return (
                        <div key={m} className="wrapped-mood-bar">
                          <span className="wrapped-mood-label">{MOOD_EMOJI[m]} {m}</span>
                          <div className="wrapped-mood-track">
                            <div className="wrapped-mood-fill" style={{width:`${Math.round(c/total*100)}%`, background: MOOD_COLOR[m]}}/>
                          </div>
                          <span className="wrapped-mood-pct">{Math.round(c/total*100)}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <button className="panel-share-btn" onClick={handleShare}>
                {copied ? '✓ Copied!' : navigator.share ? '↗ Share Wrapped' : '📋 Copy Wrapped'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
