import { useEffect, useRef, useState, useCallback } from 'react'
import MarqueeText from './MarqueeText'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
let YT = null

window.__grooveBeatEnergy = 0
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 768

const PALETTES = [
  ['#7c6aff', '#ff6a8a', '#6affb8', '#ffb86a'],
  ['#00f5ff', '#ff00ff', '#00ff88', '#ffff00'],
  ['#ff4444', '#ff8800', '#ffdd00', '#ff4488'],
  ['#4400ff', '#0088ff', '#00ffdd', '#8800ff'],
  ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec'],
]

function pointOnRoundRect(t, W, H, r) {
  const perimeter = 2 * (W + H) - 8 * r + 2 * Math.PI * r
  let d = t * perimeter
  const topEdge = W - 2 * r
  if (d < topEdge) return [r + d, 0]; d -= topEdge
  const qc = Math.PI / 2 * r
  if (d < qc) { const a = -Math.PI/2 + d/r; return [W-r+Math.cos(a)*r, r+Math.sin(a)*r] }; d -= qc
  const rightEdge = H - 2 * r
  if (d < rightEdge) return [W, r + d]; d -= rightEdge
  if (d < qc) { const a = d/r; return [W-r+Math.cos(a)*r, H-r+Math.sin(a)*r] }; d -= qc
  if (d < topEdge) return [W-r-d, H]; d -= topEdge
  if (d < qc) { const a = Math.PI/2 + d/r; return [r+Math.cos(a)*r, H-r+Math.sin(a)*r] }; d -= qc
  if (d < rightEdge) return [0, H-r-d]; d -= rightEdge
  const a = Math.PI + d/r; return [r+Math.cos(a)*r, r+Math.sin(a)*r]
}

// ── BPM via backend song-dna ───────────────────────────────
async function fetchBPM(videoId, title) {
  if (!videoId && !title) return null
  try {
    const res = await fetch(`${BACKEND}/song-dna`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ songs: [{ videoId: videoId || '', title: title || '' }] }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.dna?.[0]?.bpm || null
  } catch { return null }
}

// ── Synced Lyrics via LRCLIB ───────────────────────────────
async function fetchLyrics(title) {
  if (!title) return null
  try {
    const clean = title.replace(/\(.*?\)|\[.*?\]/g, '').trim()
    const res = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const results = await res.json()
    const match = results?.[0]
    if (!match?.syncedLyrics && !match?.plainLyrics) return null
    return { synced: match.syncedLyrics || null, plain: match.plainLyrics || null }
  } catch { return null }
}

function parseSyncedLyrics(raw) {
  if (!raw) return []
  return raw.split('\n').map(line => {
    const m = line.match(/^\[(\d+):(\d+\.\d+)\]\s*(.*)$/)
    if (!m) return null
    return { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3] }
  }).filter(Boolean)
}

// ── BeatBorder ─────────────────────────────────────────────
function BeatBorder({ isPlaying, bpm }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)
  const isPlayingRef = useRef(isPlaying)
  const bpmRef       = useRef(bpm || 120)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { bpmRef.current = bpm || 120 }, [bpm])
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let time = 0, beat = 0, lastBeat = 0, beatCount = 0
    let paletteIndex = 0, palette = PALETTES[0]
    const r = 14
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(canvas)
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(animRef.current)
      else animRef.current = requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', onVisibility)
    const frame = () => {
      const W = canvas.width, H = canvas.height
      const playing = isPlayingRef.current
      const currentBPM = bpmRef.current
      const beatInterval = 60 / currentBPM
      const energy = window.__grooveBeatEnergy || 0
      time += 0.016
      if (playing && time - lastBeat > beatInterval) {
        lastBeat = time; beat = Math.min(1.0, 0.75 + energy * 0.5); beatCount++
        if (beatCount % 8 === 0) { paletteIndex = (paletteIndex + 1) % PALETTES.length; palette = PALETTES[paletteIndex] }
      }
      beat = Math.max(beat, energy * 0.3); beat *= playing ? 0.88 : 0.75
      ctx.clearRect(0, 0, W, H)
      if (!playing && beat < 0.01) { animRef.current = requestAnimationFrame(frame); return }
      const segments = 120; const speedFactor = currentBPM / 120
      for (let i = 0; i < segments; i++) {
        const t = i / segments, next = (i + 1) / segments
        const colorT = (t + time * 0.12 * speedFactor) % 1
        const color = palette[Math.floor(colorT * palette.length) % palette.length]
        const wave = Math.sin(t * Math.PI * 6 + time * 4 * speedFactor) * 0.5 + 0.5
        const alpha = (0.5 + wave * 0.5 + beat * 0.5) * (playing ? 1 : 0.3)
        const lw = (2 + wave * 3 + beat * 6) * (playing ? 1 : 0.4)
        const [x1, y1] = pointOnRoundRect(t, W, H, r)
        const [x2, y2] = pointOnRoundRect(next, W, H, r)
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw
        ctx.shadowColor = color; ctx.shadowBlur = 8 + beat * 16
        ctx.globalAlpha = alpha
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore()
      }
      if (beat > 0.65) {
        ctx.save(); ctx.strokeStyle = palette[0]; ctx.lineWidth = 3 + beat * 8
        ctx.shadowColor = palette[0]; ctx.shadowBlur = 20 + beat * 30
        ctx.globalAlpha = (beat - 0.65) * 0.9
        ctx.beginPath(); ctx.roundRect(1, 1, W-2, H-2, r); ctx.stroke(); ctx.restore()
      }
      animRef.current = requestAnimationFrame(frame)
    }
    animRef.current = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  return <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', borderRadius:14 }} />
}

function BpmBadge({ bpm, loading }) {
  if (loading) return <span className="bpm-badge bpm-loading">♩ detecting...</span>
  if (!bpm) return null
  return <span className="bpm-badge">♩ {bpm} BPM</span>
}

// ── Lyrics overlay ─────────────────────────────────────────
function LyricsOverlay({ lyrics, currentTime, onClose }) {
  const parsed = parseSyncedLyrics(lyrics?.synced)
  const activeRef = useRef(null)
  let activeIdx = -1
  if (parsed.length > 0) {
    for (let i = parsed.length - 1; i >= 0; i--) {
      if (currentTime >= parsed[i].time) { activeIdx = i; break }
    }
  }
  useEffect(() => { activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [activeIdx])
  const lines = parsed.length > 0 ? parsed : (lyrics?.plain || '').split('\n').map((t, i) => ({ time: i, text: t }))
  return (
    <div className="lyrics-overlay">
      <button className="lyrics-close" onClick={onClose}>✕</button>
      <div className="lyrics-scroll">
        {lines.map((line, i) => (
          <p key={i} ref={i === activeIdx ? activeRef : null} className={`lyrics-line ${i === activeIdx ? 'lyrics-active' : ''}`}>
            {line.text || '♪'}
          </p>
        ))}
        {lines.length === 0 && <p className="lyrics-empty">No lyrics found</p>}
      </div>
    </div>
  )
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]

export default function Player({ socket, roomId, videoId, title, onEnded, onSkip, onPrev, isDJ, djMode, initialTime, initialPlaying, onPlayStateChange, onProgressChange, onLoadingChange, hasPrev, externalVolume, onVolumeChange, loop, onToggleLoop, onShuffle }) {
  const playerRef     = useRef(null)
  const playerInst    = useRef(null)
  const isSyncingRef  = useRef(false)
  const isPlayingRef  = useRef(false)
  const initialSyncDone = useRef(false)
  const timersRef     = useRef([])
  const swipeStartX   = useRef(null)
  const swipeStartY   = useRef(null)

  const [isPlaying, setIsPlaying]   = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]     = useState(0)
  const [isReady, setIsReady]       = useState(false)
  const [volume, setVolume]         = useState(externalVolume ?? 80)
  const [speedIdx, setSpeedIdx]     = useState(1)
  const [bpm, setBpm]               = useState(null)
  const [bpmLoading, setBpmLoading] = useState(false)
  const [stamped, setStamped]       = useState(false)
  const [stampAnim, setStampAnim]   = useState(false)
  const [lyrics, setLyrics]         = useState(null)
  const [showLyrics, setShowLyrics] = useState(false)
  const [lyricsLoading, setLyricsLoading] = useState(false)

  const onEndedRef = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  const safeTimeout = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms); timersRef.current.push(id); return id
  }, [])

  useEffect(() => () => { timersRef.current.forEach(clearTimeout) }, [])

  useEffect(() => { if (externalVolume !== undefined) setVolume(externalVolume) }, [externalVolume])

  // ── Init YouTube IFrame API ────────────────────────────
  useEffect(() => {
    let destroyed = false
    const initPlayer = () => {
      if (!playerRef.current || destroyed) return
      if (playerInst.current?.destroy) { playerInst.current.destroy(); playerInst.current = null }
      playerInst.current = new YT.Player(playerRef.current, {
        height: '100%', width: '100%', videoId: '',
        playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, disablekb: 1, fs: 0 },
        events: {
          onReady: () => { if (!destroyed) { setIsReady(true); onLoadingChange?.(false) } },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) onEndedRef.current?.()
            if (e.data === YT.PlayerState.PLAYING) onLoadingChange?.(false)
            if (e.data === YT.PlayerState.BUFFERING) onLoadingChange?.(true)
          },
          onError: (e) => {
            if (!destroyed) { console.warn('[YT Error]', e.data); safeTimeout(() => onEndedRef.current?.(), 2500) }
          }
        }
      })
    }
    if (window.YT && window.YT.Player) { YT = window.YT; initPlayer() }
    else {
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api'; document.body.appendChild(tag)
      }
      window.onYouTubeIframeAPIReady = () => { YT = window.YT; initPlayer() }
    }
    return () => { destroyed = true; playerInst.current?.destroy?.(); playerInst.current = null }
  }, [])

  // ── Load video when videoId changes ───────────────────
  useEffect(() => {
    const p = playerInst.current
    if (!p || !isReady || !videoId) return
    if (typeof p.loadVideoById !== 'function') return
    initialSyncDone.current = false
    onLoadingChange?.(true)
    p.loadVideoById(videoId)
    if (!initialSyncDone.current && initialTime && initialTime > 0) {
      initialSyncDone.current = true
      safeTimeout(() => {
        const pi = playerInst.current; if (!pi) return
        pi.seekTo(initialTime, true)
        if (initialPlaying) { pi.playVideo(); setIsPlaying(true); onPlayStateChange?.(true) }
        else { pi.pauseVideo(); setIsPlaying(false); onPlayStateChange?.(false) }
      }, 800)
    } else {
      safeTimeout(() => {
        const pi = playerInst.current; if (pi?.playVideo) { pi.playVideo(); setIsPlaying(true); onPlayStateChange?.(true) }
      }, 300)
    }
  }, [videoId, isReady])

  // ── Poll time + progress ───────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const p = playerInst.current
      if (!p || typeof p.getCurrentTime !== 'function') return
      const t = p.getCurrentTime() || 0
      const d = p.getDuration() || 0
      setCurrentTime(t); setDuration(d)
      if (d) onProgressChange?.((t / d) * 100)
    }, IS_MOBILE ? 1000 : 500)
    return () => clearInterval(interval)
  }, [])

  // ── Socket sync ────────────────────────────────────────
  useEffect(() => {
    const seek = (time) => { const p = playerInst.current; if (p?.seekTo) p.seekTo(time, true) }
    socket.on('play', ({ time }) => {
      isSyncingRef.current = true; seek(time)
      playerInst.current?.playVideo?.(); setIsPlaying(true); onPlayStateChange?.(true)
      safeTimeout(() => { isSyncingRef.current = false }, 500)
    })
    socket.on('pause', ({ time }) => {
      isSyncingRef.current = true; seek(time)
      playerInst.current?.pauseVideo?.(); setIsPlaying(false); onPlayStateChange?.(false)
      safeTimeout(() => { isSyncingRef.current = false }, 500)
    })
    socket.on('seek', ({ time }) => {
      isSyncingRef.current = true; seek(time); setCurrentTime(time)
      safeTimeout(() => { isSyncingRef.current = false }, 500)
    })
    socket.on('sync-check', ({ time }) => {
      const p = playerInst.current; if (!p?.getCurrentTime) return
      const cur = p.getCurrentTime() || 0
      if (cur < 3 || time < cur - 5) return
      if (Math.abs(cur - time) > 3) p.seekTo(time, true)
    })
    return () => { socket.off('play'); socket.off('pause'); socket.off('seek'); socket.off('sync-check') }
  }, [socket])

  // ── Sync heartbeat ─────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const p = playerInst.current
      const shouldEmit = !djMode || isDJ
      if (shouldEmit && isPlayingRef.current && p?.getCurrentTime) {
        const t = p.getCurrentTime() || 0
        if (t > 0) socket.emit('sync-heartbeat', { roomId, time: t })
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [roomId, socket, djMode, isDJ])

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  // ── Volume ─────────────────────────────────────────────
  useEffect(() => {
    playerInst.current?.setVolume?.(volume)
  }, [volume])

  // ── Media Session ──────────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator) || !title) return
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: title || 'Groove Together', artist: 'Groove Together', album: 'Room ' + (roomId || ''),
      artwork: videoId ? [
        { src: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
        { src: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
      ] : [],
    })
  }, [title, videoId, roomId])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', handlePlay)
    navigator.mediaSession.setActionHandler('pause', handlePause)
    navigator.mediaSession.setActionHandler('nexttrack', () => onSkip?.())
    navigator.mediaSession.setActionHandler('previoustrack', () => onPrev?.())
    navigator.mediaSession.setActionHandler('seekto', (d) => {
      if (d.seekTime !== undefined) { playerInst.current?.seekTo?.(d.seekTime, true); setCurrentTime(d.seekTime) }
    })
    return () => ['play','pause','nexttrack','previoustrack','seekto'].forEach(a => { try { navigator.mediaSession.setActionHandler(a, null) } catch {} })
  }, [onSkip, onPrev])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration) return
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(currentTime, duration) }) } catch {}
  }, [currentTime, duration])

  // ── BPM ────────────────────────────────────────────────
  useEffect(() => {
    if (!videoId && !title) { setBpm(null); return }
    setBpmLoading(true); setBpm(null)
    let cancelled = false
    fetchBPM(videoId, title).then(r => { if (!cancelled) { setBpm(r); setBpmLoading(false) } })
    return () => { cancelled = true }
  }, [videoId, title])

  // ── Lyrics ─────────────────────────────────────────────
  useEffect(() => {
    setLyrics(null); setShowLyrics(false)
    if (!title) return
    let cancelled = false; setLyricsLoading(true)
    fetchLyrics(title).then(r => { if (!cancelled) { setLyrics(r); setLyricsLoading(false) } })
    return () => { cancelled = true }
  }, [title])

  const getTime = () => playerInst.current?.getCurrentTime?.() || 0

  const handlePlay = () => {
    if (isSyncingRef.current) return
    playerInst.current?.playVideo?.(); setIsPlaying(true); onPlayStateChange?.(true)
    socket.emit('play', { roomId, time: getTime() })
  }
  const handlePause = () => {
    if (isSyncingRef.current) return
    playerInst.current?.pauseVideo?.(); setIsPlaying(false); onPlayStateChange?.(false)
    socket.emit('pause', { roomId, time: getTime() })
  }
  const handleSeek = (e) => {
    const time = parseFloat(e.target.value)
    playerInst.current?.seekTo?.(time, true); setCurrentTime(time)
    socket.emit('seek', { roomId, time })
  }
  const handleVolumeChange = (e) => { const v = parseInt(e.target.value); setVolume(v); onVolumeChange?.(v) }
  const handleSpeedCycle = () => {
    const next = (speedIdx + 1) % SPEEDS.length; setSpeedIdx(next)
    playerInst.current?.setPlaybackRate?.(SPEEDS[next])
  }

  const handleStamp = async () => {
    if (!videoId || !title) return
    setStampAnim(true); safeTimeout(() => setStampAnim(false), 600)
    try {
      const res = await fetch(`${BACKEND}/moments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ videoId, title, timestamp: Math.floor(getTime()), roomId })
      })
      if (res.ok || res.status === 409) { setStamped(true); safeTimeout(() => setStamped(false), 3000) }
    } catch {}
  }

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00'
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  const progress = duration ? (currentTime / duration) * 100 : 0
  const isLocked = djMode && !isDJ

  return (
    <div className="player" style={{ position: 'relative', overflow: 'visible' }}>
      {!IS_MOBILE && <BeatBorder isPlaying={isPlaying} bpm={bpm || 120} />}

      {/* YouTube IFrame — hidden, audio plays through it */}
      <div ref={playerRef} style={{ display: 'none' }} />

      {djMode && (
        <div className={`dj-badge ${isDJ ? 'is-dj' : 'not-dj'}`}>
          {isDJ ? 'You are the DJ' : 'DJ is controlling playback'}
        </div>
      )}

      <div
        className={`player-art${videoId ? ' song-changing' : ''}`} key={videoId}
        onTouchStart={e => { swipeStartX.current = e.touches[0].clientX; swipeStartY.current = e.touches[0].clientY }}
        onTouchEnd={e => {
          if (swipeStartX.current === null) return
          const dx = e.changedTouches[0].clientX - swipeStartX.current
          const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY.current)
          swipeStartX.current = null; swipeStartY.current = null
          if (dy > 40) return
          if (dx < -60) onSkip?.()
          else if (dx > 60 && hasPrev) onPrev?.()
        }}
      >
        {videoId
          ? <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="thumbnail" className="art-img" />
          : <div className="art-placeholder"><span>🎵</span></div>}
        {isPlaying && <div className="art-pulse" />}
        {!isReady && videoId && <div className="art-loading"><div className="art-loading-spinner" /></div>}
      </div>

      <div className="player-info">
        <MarqueeText className="player-title">{title || 'No song loaded'}</MarqueeText>
        <div className="player-sub-row">
          <p className="player-sub">{videoId ? 'YouTube' : 'Add a song to the queue →'}</p>
          <BpmBadge bpm={bpm} loading={bpmLoading && !!title} />
        </div>
      </div>

      {showLyrics && lyrics && (
        <LyricsOverlay lyrics={lyrics} currentTime={currentTime} onClose={() => setShowLyrics(false)} />
      )}

      <div className="player-progress">
        <span className="time-label">{formatTime(currentTime)}</span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
          <input type="range" className="progress-input" min={0} max={duration || 100} step={0.1}
            value={currentTime} onChange={handleSeek} disabled={isLocked} />
        </div>
        <span className="time-label">{formatTime(duration)}</span>
      </div>

      <div className="player-controls-wrap">
        <div className="ctrl-slot ctrl-left">
          {!IS_MOBILE && onShuffle && (
            <button className="ctrl-btn ctrl-icon-btn" onClick={onShuffle} disabled={isLocked} title="Shuffle">
              <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            </button>
          )}
          <button className="ctrl-btn prev-btn" onClick={onPrev} disabled={!hasPrev || isLocked} title="Previous">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </button>
        </div>
        <div className="ctrl-slot ctrl-center">
          <button className={`play-btn ${isPlaying ? 'playing' : ''}`} onClick={isPlaying ? handlePause : handlePlay} disabled={!videoId || isLocked}>
            {isPlaying
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>}
          </button>
        </div>
        <div className="ctrl-slot ctrl-right">
          <button className="ctrl-btn skip-btn" onClick={onSkip} disabled={!videoId || isLocked} title="Next">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
          </button>
          {!IS_MOBILE && onToggleLoop && (
            <button className={`ctrl-btn ctrl-icon-btn ${loop ? 'ctrl-active' : ''}`} onClick={onToggleLoop}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
            </button>
          )}
        </div>
      </div>

      {IS_MOBILE && (
        <div className="mobile-extra-controls">
          {onShuffle && (
            <button className="ctrl-btn ctrl-icon-btn" onClick={onShuffle} disabled={isLocked}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            </button>
          )}
          {onToggleLoop && (
            <button className={`ctrl-btn ctrl-icon-btn ${loop ? 'ctrl-active' : ''}`} onClick={onToggleLoop}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
            </button>
          )}
        </div>
      )}

      {!IS_MOBILE && (
        <div className="volume-row">
          <button className="ctrl-btn volume-icon-btn" onClick={() => { const v = volume === 0 ? 80 : 0; setVolume(v); onVolumeChange?.(v) }}>
            {volume === 0
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A6.97 6.97 0 0 1 14 18.98v2.06A9 9 0 0 0 17.54 19l1.73 1.73L20.54 19 5.54 4 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            }
          </button>
          <input type="range" min={0} max={100} value={volume} step={1} onChange={handleVolumeChange} className="volume-inline-slider" style={{ '--vol': `${volume}%` }} />
          <span className="volume-pct">{volume}%</span>
          <button className="speed-btn" onClick={handleSpeedCycle}>{SPEEDS[speedIdx]}×</button>
          {(lyrics || lyricsLoading) && (
            <button className={`ctrl-btn ctrl-icon-btn ${showLyrics ? 'ctrl-active' : ''}`} onClick={() => setShowLyrics(v => !v)} disabled={lyricsLoading}>
              {lyricsLoading ? <span className="loading-spinner" style={{width:14,height:14}} /> : '🎼'}
            </button>
          )}
        </div>
      )}

      {videoId && (
        <div className="player-action-row">
          <button className={`player-action-btn stamp-btn-compact ${stamped ? 'stamped' : ''} ${stampAnim ? 'stamp-anim' : ''}`} onClick={handleStamp}>
            {stamped
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" strokeLinejoin="round"/></svg>
            }
            <span>{stamped ? 'Stamped!' : `★ ${formatTime(currentTime)}`}</span>
          </button>
          {IS_MOBILE && (lyrics || lyricsLoading) && (
            <button className={`player-action-btn ${showLyrics ? 'stamped' : ''}`} onClick={() => setShowLyrics(v => !v)} disabled={lyricsLoading}>
              {lyricsLoading ? '...' : '🎼 Lyrics'}
            </button>
          )}
        </div>
      )}

      <div className="sync-badge"><span className="sync-dot" />{isLocked ? 'Listening' : 'Synced'}</div>
    </div>
  )
}
