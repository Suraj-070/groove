import { useState, useEffect } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const MOOD_EMOJI = { euphoric:'🤩', confident:'😎', chill:'😌', sad:'😢', aggressive:'🔥', neutral:'🎵' }
const MATCH_LABEL = score => score >= 85 ? { text:'Perfect match', color:'#00c974' } : score >= 70 ? { text:'Great match', color:'#7c6aff' } : score >= 55 ? { text:'Good match', color:'#ffb300' } : { text:'Possible match', color:'#888' }
const SOURCE_BADGE = { lastfm:'🎵 Last.fm', related:'🔗 Related', collaborative:'👥 Room', search:'🔍 Search' }

export default function GrooveRadar({ isOpen, onClose, onAddToQueue }) {
  const [results, setResults]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [fingerprint, setFingerprint] = useState(null)
  const [added, setAdded]           = useState(new Set())

  useEffect(() => {
    if (!isOpen) return
    setLoading(true); setError('')
    fetch(`${BACKEND}/radar`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else { setResults(d.results || []); setFingerprint(d.fingerprint) }
      })
      .catch(() => setError('Failed to load Radar'))
      .finally(() => setLoading(false))
  }, [isOpen])

  const handleAdd = (song) => {
    onAddToQueue(song)
    setAdded(prev => new Set([...prev, song.videoId]))
  }

  if (!isOpen) return null

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel-modal" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-header-left">
            <span style={{fontSize:'1.2rem'}}>📡</span>
            <div>
              <p className="panel-title">Groove Radar</p>
              {fingerprint && (
                <p className="panel-sub">
                  {MOOD_EMOJI[fingerprint.mood]} {fingerprint.mood}
                  {fingerprint.bpm ? ` · ${fingerprint.bpm} BPM` : ''}
                  {fingerprint.timeContext ? ` · ${fingerprint.timeContext}` : ''}
                </p>
              )}
            </div>
          </div>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <div className="panel-body">
          {loading && <div className="panel-loading"><div className="shared-spinner"/><span>Scanning your taste DNA…</span></div>}
          {error && <div className="panel-empty"><span>📡</span><p>{error}</p><p className="panel-empty-sub">Listen to more songs to unlock Radar</p></div>}

          {!loading && results.length > 0 && (
            <div className="radar-list">
              {results.map((song, i) => {
                const ml = MATCH_LABEL(song.matchScore)
                const isAdded = added.has(song.videoId)
                return (
                  <div key={song.videoId} className="radar-item">
                    <div className="radar-rank">{i + 1}</div>
                    <div className="radar-thumb">
                      <img src={song.thumbnail} alt="" loading="lazy" />
                    </div>
                    <div className="radar-info">
                      <p className="radar-title">{song.title}</p>
                      <div className="radar-meta">
                        {song.channel && <span className="radar-channel">{song.channel}</span>}
                        {song.mood && <span className="radar-mood">{MOOD_EMOJI[song.mood]} {song.mood}</span>}
                        {song.bpm && <span className="radar-bpm">♩{song.bpm}</span>}
                        {song.source && <span style={{ fontSize:'0.6rem', color:'var(--muted2)', marginLeft: 2 }}>{SOURCE_BADGE[song.source] || ''}</span>}
                      </div>
                      <div className="radar-score-row">
                        <div className="radar-score-bar">
                          <div className="radar-score-fill" style={{ width: `${song.matchScore}%`, background: ml.color }} />
                        </div>
                        <span className="radar-score-label" style={{ color: ml.color }}>{ml.text}</span>
                      </div>
                    </div>
                    <button
                      className={`radar-add-btn ${isAdded ? 'added' : ''}`}
                      onClick={() => !isAdded && handleAdd(song)}
                      title={isAdded ? 'Added!' : 'Add to queue'}
                    >
                      {isAdded
                        ? <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        : <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                      }
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="panel-empty">
              <span>📡</span>
              <p>No recommendations yet</p>
              <p className="panel-empty-sub">Listen to more songs and come back</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}