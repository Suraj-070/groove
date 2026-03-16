import { useRef, useState, useEffect } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

const MOOD_EMOJI = { euphoric:'😤', confident:'😎', chill:'😌', sad:'😢', aggressive:'🔥', neutral:'🎵' }
const MOOD_COLOR = { euphoric:'#ff2d78', confident:'#9b6aff', chill:'#3b8bff', sad:'#6ab8ff', aggressive:'#ff6a3d', neutral:'#7c6aff' }

function formatDuration(ms) {
  const m = Math.floor(ms / 60000)
  return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`
}

function EnergyArc({ songs }) {
  if (!songs?.length) return null
  const maxH = 44
  const barW = Math.max(8, Math.min(20, Math.floor(280 / songs.length) - 3))
  return (
    <div className="dna-arc">
      {songs.map((s, i) => {
        const h = s.energy != null ? Math.max(6, Math.round(s.energy * maxH)) : maxH * 0.4
        const color = MOOD_COLOR[s.mood] || '#7c6aff'
        return (
          <div key={i} className="dna-arc-bar-wrap" title={s.title}>
            <div className="dna-arc-bar" style={{ height: h, width: barW, background: color, opacity: 0.85 }} />
          </div>
        )
      })}
    </div>
  )
}

function UserAvatar({ user, size = 28 }) {
  const colors = ['#7c6aff','#ff6a8a','#6affb8','#ffb86a','#6ab8ff','#ff6aff']
  let hash = 0
  const id = user.id || user.username || ''
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const color = colors[Math.abs(hash) % colors.length]
  if (user.avatar) return (
    <img src={user.avatar} alt={user.username}
      style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(255,255,255,0.15)' }}
    />
  )
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.35, fontWeight:700, color:'#fff', border:'2px solid rgba(255,255,255,0.15)', flexShrink:0 }}>
      {(user.username||'?').slice(0,2).toUpperCase()}
    </div>
  )
}

export default function SessionDNACard({ recap, onClose }) {
  const cardRef = useRef(null)
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!recap) return null

  const songs = recap.songsPlayed || []
  const users = recap.users || []

  // Compute DNA stats
  const withBpm   = songs.filter(s => s.bpm)
  const withEnergy= songs.filter(s => s.energy != null)
  const avgBpm    = withBpm.length ? Math.round(withBpm.reduce((a,s)=>a+s.bpm,0)/withBpm.length) : null
  const avgEnergy = withEnergy.length ? Math.round(withEnergy.reduce((a,s)=>a+s.energy,0)/withEnergy.length * 100) : null
  const moodCounts = {}
  songs.forEach(s => { const m = s.mood||'neutral'; moodCounts[m] = (moodCounts[m]||0)+1 })
  const dominantMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'neutral'
  const peakSong = songs.reduce((best,s) => (!best || (s.energy||0) > (best.energy||0)) ? s : best, null)

  // Arc description
  const arcDesc = () => {
    if (songs.length < 2) return 'Single track session'
    const first = songs[0]?.energy || 0.5
    const last  = songs[songs.length-1]?.energy || 0.5
    const mid   = Math.max(...songs.map(s=>s.energy||0))
    if (mid > 0.75 && last < 0.5) return 'Build-up → Peak → Wind down'
    if (first < 0.4 && mid > 0.7) return 'Chill intro → High energy'
    if (last > first) return 'Gradually building energy'
    if (first > last) return 'High energy → Chill out'
    return 'Steady vibe throughout'
  }

  const handleShare = async () => {
    setSharing(true)
    try {
      // Build share text
      const text = [
        `🎵 Groove Session — ${formatDuration(recap.sessionDuration)}`,
        `${songs.length} songs · ${users.length} listeners · Room ${recap.roomId || ''}`,
        dominantMood ? `Vibe: ${MOOD_EMOJI[dominantMood]} ${dominantMood}` : '',
        avgBpm ? `Avg BPM: ${avgBpm}` : '',
        '',
        songs.slice(0,5).map((s,i) => `${i+1}. ${s.title}`).join('\n'),
        songs.length > 5 ? `+ ${songs.length-5} more` : '',
        '',
        '🎵 groovetoget.vercel.app',
      ].filter(Boolean).join('\n')

      if (navigator.share) {
        await navigator.share({ title: 'My Groove Session', text })
      } else {
        await navigator.clipboard?.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    } catch {}
    setSharing(false)
  }

  return (
    <div className="dna-overlay" onClick={onClose}>
      <div className="dna-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="dna-modal-header">
          <span className="dna-modal-title">Session DNA</span>
          <button className="dna-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div className="dna-scroll">
          {/* THE CARD */}
          <div className="dna-card" ref={cardRef}>
            {/* Card header */}
            <div className="dna-card-top">
              <div className="dna-card-brand">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
                Groove Together
              </div>
              <div className="dna-card-room">Room {recap.roomId || '—'}</div>
            </div>

            {/* Mood hero */}
            <div className="dna-mood-hero" style={{ background: `linear-gradient(135deg, ${MOOD_COLOR[dominantMood]}22, transparent)`, borderColor: `${MOOD_COLOR[dominantMood]}44` }}>
              <span className="dna-mood-emoji">{MOOD_EMOJI[dominantMood]}</span>
              <div>
                <div className="dna-mood-name">{dominantMood}</div>
                <div className="dna-mood-sub">{arcDesc()}</div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="dna-stats-grid">
              <div className="dna-stat-cell">
                <span className="dna-stat-val">{songs.length}</span>
                <span className="dna-stat-lbl">songs</span>
              </div>
              <div className="dna-stat-cell">
                <span className="dna-stat-val">{formatDuration(recap.sessionDuration)}</span>
                <span className="dna-stat-lbl">duration</span>
              </div>
              {avgBpm && (
                <div className="dna-stat-cell">
                  <span className="dna-stat-val">{avgBpm}</span>
                  <span className="dna-stat-lbl">avg BPM</span>
                </div>
              )}
              {avgEnergy && (
                <div className="dna-stat-cell">
                  <span className="dna-stat-val">{avgEnergy}%</span>
                  <span className="dna-stat-lbl">energy</span>
                </div>
              )}
            </div>

            {/* Energy arc */}
            {songs.length > 1 && (
              <div className="dna-arc-section">
                <div className="dna-arc-label">Energy arc</div>
                <EnergyArc songs={songs} />
                {peakSong && (
                  <div className="dna-peak">Peak: <span>{peakSong.title?.slice(0,35)}{peakSong.title?.length>35?'…':''}</span></div>
                )}
              </div>
            )}

            {/* Song list */}
            <div className="dna-songs-section">
              <div className="dna-songs-label">Played</div>
              <div className="dna-songs-list">
                {songs.slice(0, 6).map((s, i) => (
                  <div key={i} className="dna-song-item">
                    <img src={`https://img.youtube.com/vi/${s.videoId}/default.jpg`} alt="" className="dna-song-thumb" loading="lazy" />
                    <div className="dna-song-info">
                      <span className="dna-song-title">{s.title?.slice(0,36)}{s.title?.length>36?'…':''}</span>
                      {s.mood && <span className="dna-song-mood" style={{color: MOOD_COLOR[s.mood]}}>{MOOD_EMOJI[s.mood]} {s.mood}</span>}
                    </div>
                    {s.bpm && <span className="dna-song-bpm">{s.bpm}</span>}
                  </div>
                ))}
                {songs.length > 6 && <div className="dna-songs-more">+{songs.length - 6} more songs</div>}
              </div>
            </div>

            {/* Listeners */}
            {users.length > 0 && (
              <div className="dna-listeners">
                <div className="dna-listeners-label">Listened together</div>
                <div className="dna-listeners-row">
                  {users.slice(0,8).map((u,i) => (
                    <UserAvatar key={i} user={u} size={26} />
                  ))}
                  {users.length > 8 && <span className="dna-listeners-more">+{users.length-8}</span>}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="dna-card-footer">
              <span>groovetoget.vercel.app</span>
              <span>{new Date(recap.sessionStart).toLocaleDateString([], {month:'short',day:'numeric'})}</span>
            </div>
          </div>

          {/* Share button */}
          <button className="dna-share-btn" onClick={handleShare} disabled={sharing}>
            {sharing ? 'Sharing…' : copied ? '✓ Copied to clipboard!' : (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
                Share Session DNA
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
