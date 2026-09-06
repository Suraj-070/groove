import { useEffect, useRef, useState, useCallback } from 'react'
import MarqueeText from './MarqueeText'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// Global beat energy bus — Visualizer writes here, BeatBorder reads it
window.__grooveBeatEnergy = 0

// Detect mobile once
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

// ── Fetch audio stream URL from Piped, fallback to Invidious ──
async function fetchAudioStream(videoId) {
  // All stream resolution happens server-side — no CORS issues
  try {
    const res = await fetch(`${BACKEND}/audio-stream/${videoId}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.url) return { url: data.url, source: data.source || 'piped' }
    return null
  } catch { return null }
}

// ── BPM fetch ──────────────────────────────────────────────
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
    const dna = data?.dna?.[0]
    return dna?.bpm || null
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

// Parse synced lyrics "[mm:ss.xx] line" format
function parseSyncedLyrics(raw) {
  if (!raw) return []
  return raw.split('\n').map(line => {
    const m = line.match(/^\[(\d+):(\d+\.\d+)\]\s*(.*)$/)
    if (!m) return null
    const time = parseInt(m[1]) * 60 + parseFloat(m[2])
    return { time, text: m[3] }
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
      if (document.hidden) { cancelAnimationFrame(animRef.current) }
      else { animRef.current = requestAnimationFrame(frame) }
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
        lastBeat = time
        beat = Math.min(1.0, 0.75 + energy * 0.5)
        beatCount++
        if (beatCount % 8 === 0) {
          paletteIndex = (paletteIndex + 1) % PALETTES.length
          palette = PALETTES[paletteIndex]
        }
      }
      const energyBoost = energy * 0.3
      beat = Math.max(beat, energyBoost)
      beat *= playing ? 0.88 : 0.75
      ctx.clearRect(0, 0, W, H)
      if (!playing && beat < 0.01) {
        animRef.current = requestAnimationFrame(frame); return
      }
      const segments = 120
      const speedFactor = currentBPM / 120
      for (let i = 0; i < segments; i++) {
        const t = i / segments, next = (i + 1) / segments
        const colorT = (t + time * 0.12 * speedFactor) % 1
        const ci = Math.floor(colorT * palette.length)
        const color = palette[ci % palette.length]
        const wave = Math.sin(t * Math.PI * 6 + time * 4 * speedFactor) * 0.5 + 0.5
        const alpha = (0.5 + wave * 0.5 + beat * 0.5) * (playing ? 1 : 0.3)
        const lw = (2 + wave * 3 + beat * 6) * (playing ? 1 : 0.4)
        const [x1, y1] = pointOnRoundRect(t, W, H, r)
        const [x2, y2] = pointOnRoundRect(next, W, H, r)
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw
        ctx.shadowColor = color; ctx.shadowBlur = 10 + beat * 20 + wave * 8
        ctx.globalAlpha = alpha
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore()
      }
      if (beat > 0.65) {
        ctx.save(); ctx.strokeStyle = palette[0]; ctx.lineWidth = 3 + beat * 8
        ctx.shadowColor = palette[0]; ctx.shadowBlur = 30 + beat * 40
        ctx.globalAlpha = (beat - 0.65) * 0.9
        ctx.beginPath(); ctx.roundRect(1, 1, W-2, H-2, r); ctx.stroke(); ctx.restore()
      }
      animRef.current = requestAnimationFrame(frame)
    }
    animRef.current = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(animRef.current)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', borderRadius: 14,
    }} />
  )
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

  // Find active lyric line
  let activeIdx = -1
  if (parsed.length > 0) {
    for (let i = parsed.length - 1; i >= 0; i--) {
      if (currentTime >= parsed[i].time) { activeIdx = i; break }
    }
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIdx])

  const lines = parsed.length > 0 ? parsed : (lyrics?.plain || '').split('\n').map((t, i) => ({ time: i, text: t }))

  return (
    <div className="lyrics-overlay">
      <button className="lyrics-close" onClick={onClose}>✕</button>
      <div className="lyrics-scroll">
        {lines.map((line, i) => (
          <p
            key={i}
            ref={i === activeIdx ? activeRef : null}
            className={`lyrics-line ${i === activeIdx ? 'lyrics-active' : ''}`}
          >
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
  const audioRef        = useRef(null)
  const isSyncingRef    = useRef(false)
  const isPlayingRef    = useRef(false)
  const initialSyncDone = useRef(false)
  // Track all setTimeout IDs so we can clear them on unmount
  const timersRef       = useRef([])
  const swipeStartX     = useRef(null)
  const swipeStartY     = useRef(null)

  const [isPlaying, setIsPlaying]     = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]       = useState(0)
  const [isReady, setIsReady]         = useState(false)
  const [isLoading, setIsLoading]     = useState(false)
  const [streamError, setStreamError] = useState(null)
  const [streamSource, setStreamSource] = useState(null)
  const [volume, setVolume]           = useState(externalVolume ?? 80)
  const [speedIdx, setSpeedIdx]       = useState(1)
  const [bpm, setBpm]                 = useState(null)
  const [bpmLoading, setBpmLoading]   = useState(false)
  const [stamped, setStamped]         = useState(false)
  const [stampAnim, setStampAnim]     = useState(false)
  const [lyrics, setLyrics]           = useState(null)
  const [showLyrics, setShowLyrics]   = useState(false)
  const [lyricsLoading, setLyricsLoading] = useState(false)

  const onEndedRef = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  // Safe setTimeout — auto-tracked for cleanup
  const safeTimeout = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms)
    timersRef.current.push(id)
    return id
  }, [])

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => { timersRef.current.forEach(clearTimeout) }
  }, [])

  // Sync external volume
  useEffect(() => {
    if (externalVolume !== undefined) setVolume(externalVolume)
  }, [externalVolume])

  // Apply volume to audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100
  }, [volume])

  // ── Load Piped stream when videoId changes ─────────────
  useEffect(() => {
    if (!videoId) { setIsReady(false); setStreamError(null); return }
    setIsLoading(true)
    onLoadingChange?.(true)
    setIsReady(false)
    setStreamError(null)
    setStreamSource(null)
    initialSyncDone.current = false
    let cancelled = false

    fetchAudioStream(videoId).then(result => {
      if (cancelled) return
      if (!result) {
        setStreamError('Audio unavailable — skipping')
        setIsLoading(false); onLoadingChange?.(false)
        safeTimeout(() => onEndedRef.current?.(), 2500)
        return
      }
      const audio = audioRef.current
      if (!audio) return
      audio.src = result.url
      audio.playbackRate = SPEEDS[speedIdx]
      audio.volume = volume / 100
      setStreamSource(result.source)
      audio.load()
    })

    return () => { cancelled = true }
  }, [videoId])

  // ── Audio element event handlers ───────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onCanPlay = () => {
      setIsLoading(false); onLoadingChange?.(false)
      setIsReady(true)
      if (!initialSyncDone.current && initialTime && initialTime > 0) {
        initialSyncDone.current = true
        audio.currentTime = initialTime
        if (initialPlaying) { audio.play().catch(() => {}); setIsPlaying(true); onPlayStateChange?.(true) }
        else { audio.pause(); setIsPlaying(false); onPlayStateChange?.(false) }
      } else {
        audio.play().catch(() => {})
        setIsPlaying(true)
        onPlayStateChange?.(true)
      }
    }
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      if (audio.duration) onProgressChange?.((audio.currentTime / audio.duration) * 100)
    }
    const onDurationChange = () => setDuration(audio.duration || 0)
    const onEnded = () => onEndedRef.current?.()
    const onError = () => {
      setIsLoading(false); onLoadingChange?.(false)
      setStreamError('Playback error — skipping')
      safeTimeout(() => onEndedRef.current?.(), 2500)
    }

    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [initialTime, initialPlaying])

  // ── Socket sync events ─────────────────────────────────
  useEffect(() => {
    socket.on('play', ({ time }) => {
      const audio = audioRef.current
      if (!audio) return
      isSyncingRef.current = true
      audio.currentTime = time
      audio.play().catch(() => {})
      setIsPlaying(true); onPlayStateChange?.(true)
      safeTimeout(() => { isSyncingRef.current = false }, 500)
    })
    socket.on('pause', ({ time }) => {
      const audio = audioRef.current
      if (!audio) return
      isSyncingRef.current = true
      audio.currentTime = time
      audio.pause()
      setIsPlaying(false); onPlayStateChange?.(false)
      safeTimeout(() => { isSyncingRef.current = false }, 500)
    })
    socket.on('seek', ({ time }) => {
      const audio = audioRef.current
      if (!audio) return
      isSyncingRef.current = true
      audio.currentTime = time
      setCurrentTime(time)
      safeTimeout(() => { isSyncingRef.current = false }, 500)
    })
    socket.on('sync-check', ({ time }) => {
      const audio = audioRef.current
      if (!audio || audio.currentTime < 3) return
      if (time < audio.currentTime - 5) return
      if (Math.abs(audio.currentTime - time) > 3) audio.currentTime = time
    })
    return () => {
      socket.off('play'); socket.off('pause'); socket.off('seek'); socket.off('sync-check')
    }
  }, [socket])

  // ── Sync heartbeat ─────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const audio = audioRef.current
      const shouldEmit = !djMode || isDJ
      if (shouldEmit && isPlayingRef.current && audio && audio.currentTime > 0) {
        socket.emit('sync-heartbeat', { roomId, time: audio.currentTime })
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [roomId, socket, djMode, isDJ])

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  // ── Media Session API ──────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator) || !title) return
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: title || 'Groove Together',
      artist: 'Groove Together',
      album: 'Room ' + (roomId || ''),
      artwork: videoId ? [
        { src: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
        { src: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
        { src: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, sizes: '1280x720', type: 'image/jpeg' },
      ] : [],
    })
  }, [title, videoId, roomId])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => handlePlay())
    navigator.mediaSession.setActionHandler('pause', () => handlePause())
    navigator.mediaSession.setActionHandler('nexttrack', () => onSkip?.())
    navigator.mediaSession.setActionHandler('previoustrack', () => onPrev?.())
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = details.seekTime
        setCurrentTime(details.seekTime)
      }
    })
    return () => {
      ;['play','pause','nexttrack','previoustrack','seekto'].forEach(action => {
        try { navigator.mediaSession.setActionHandler(action, null) } catch {}
      })
    }
  }, [onSkip, onPrev])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration) return
    try {
      navigator.mediaSession.setPositionState({
        duration, playbackRate: 1,
        position: Math.min(currentTime, duration),
      })
    } catch {}
  }, [currentTime, duration])

  // ── BPM fetch ──────────────────────────────────────────
  useEffect(() => {
    if (!videoId && !title) { setBpm(null); return }
    setBpmLoading(true); setBpm(null)
    let cancelled = false
    fetchBPM(videoId, title).then(result => {
      if (!cancelled) { setBpm(result); setBpmLoading(false) }
    })
    return () => { cancelled = true }
  }, [videoId, title])

  // ── Lyrics fetch ───────────────────────────────────────
  useEffect(() => {
    setLyrics(null); setShowLyrics(false)
    if (!title) return
    let cancelled = false
    setLyricsLoading(true)
    fetchLyrics(title).then(result => {
      if (!cancelled) { setLyrics(result); setLyricsLoading(false) }
    })
    return () => { cancelled = true }
  }, [title])

  const getTime = () => audioRef.current?.currentTime || 0

  const handlePlay = () => {
    if (isSyncingRef.current) return
    const audio = audioRef.current
    if (!audio) return
    const time = getTime()
    audio.play().catch(() => {})
    setIsPlaying(true); onPlayStateChange?.(true)
    socket.emit('play', { roomId, time })
  }

  const handlePause = () => {
    if (isSyncingRef.current) return
    const audio = audioRef.current
    if (!audio) return
    const time = getTime()
    audio.pause()
    setIsPlaying(false); onPlayStateChange?.(false)
    socket.emit('pause', { roomId, time })
  }

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = time
    setCurrentTime(time)
    socket.emit('seek', { roomId, time })
  }

  const handleVolumeChange = (e) => {
    const v = parseInt(e.target.value)
    setVolume(v); onVolumeChange?.(v)
  }

  const handleSpeedCycle = () => {
    const next = (speedIdx + 1) % SPEEDS.length
    setSpeedIdx(next)
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next]
  }

  const handleStamp = async () => {
    if (!videoId || !title) return
    const time = getTime()
    setStampAnim(true)
    safeTimeout(() => setStampAnim(false), 600)
    try {
      const res = await fetch(`${BACKEND}/moments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoId, title, timestamp: Math.floor(time), roomId })
      })
      if (res.ok || res.status === 409) {
        setStamped(true)
        safeTimeout(() => setStamped(false), 3000)
      } else if (res.status === 401 || res.status === 403) {
        alert('Please log in to save moments')
      }
    } catch (e) { console.warn('[Stamp] error:', e.message) }
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

      {/* Hidden audio element — Piped stream */}
      <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />

      {djMode && (
        <div className={`dj-badge ${isDJ ? 'is-dj' : 'not-dj'}`}>
          {isDJ ? '👑 You are the DJ' : '🎧 DJ is controlling playback'}
        </div>
      )}

      <div
        className={`player-art${videoId ? ' song-changing' : ''}`}
        key={videoId}
        onTouchStart={e => { swipeStartX.current = e.touches[0].clientX; swipeStartY.current = e.touches[0].clientY }}
        onTouchEnd={e => {
          if (swipeStartX.current === null) return
          const dx = e.changedTouches[0].clientX - swipeStartX.current
          const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY.current)
          swipeStartX.current = null; swipeStartY.current = null
          if (dy > 40) return // vertical swipe — ignore
          if (dx < -60) { onSkip?.() }       // swipe left → next
          else if (dx > 60 && hasPrev) { onPrev?.() } // swipe right → prev
        }}
      >
        {videoId
          ? <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="thumbnail" className="art-img" />
          : <div className="art-placeholder"><span>🎵</span></div>}
        {isPlaying && <div className="art-pulse" />}
        {(isLoading || (!isReady && videoId)) && <div className="art-loading"><div className="art-loading-spinner" /></div>}
        {streamSource && (
          <span className="stream-source-badge" title={`Streaming via ${streamSource}`}>
            {streamSource === 'piped' ? '⚡' : '🔄'}
          </span>
        )}
      </div>

      <div className="player-info">
        <MarqueeText className="player-title">{title || 'No song loaded'}</MarqueeText>
        <div className="player-sub-row">
          <p className="player-sub">{streamError || (videoId ? `Audio · ${streamSource || 'loading...'}` : 'Add a song →')}</p>
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

      {/* Main controls */}
      <div className="player-controls-wrap">
        <div className="ctrl-slot ctrl-left">
          {!IS_MOBILE && onShuffle && (
            <button className="ctrl-btn ctrl-icon-btn" onClick={onShuffle} title="Shuffle queue" disabled={isLocked}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            </button>
          )}
          <button className="ctrl-btn prev-btn" onClick={onPrev} disabled={!hasPrev || isLocked} title="Previous">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </button>
        </div>

        <div className="ctrl-slot ctrl-center">
          <button className={`play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={isPlaying ? handlePause : handlePlay} disabled={!videoId || isLocked || isLoading}>
            {isLoading
              ? <span className="loading-spinner" />
              : isPlaying
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>}
          </button>
        </div>

        <div className="ctrl-slot ctrl-right">
          <button className="ctrl-btn skip-btn" onClick={onSkip} disabled={!videoId || isLocked} title="Next">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
          </button>
          {!IS_MOBILE && onToggleLoop && (
            <button className={`ctrl-btn ctrl-icon-btn ${loop ? 'ctrl-active' : ''}`} onClick={onToggleLoop} title={loop ? 'Loop on' : 'Loop off'}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Mobile: shuffle + loop */}
      {IS_MOBILE && (
        <div className="mobile-extra-controls">
          {onShuffle && (
            <button className="ctrl-btn ctrl-icon-btn" onClick={onShuffle} title="Shuffle" disabled={isLocked}>
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

      {/* Volume + speed — desktop */}
      {!IS_MOBILE && (
        <div className="volume-row">
          <button className="ctrl-btn volume-icon-btn" onClick={() => { const v = volume === 0 ? 80 : 0; setVolume(v); onVolumeChange?.(v) }} title="Mute/Unmute">
            {volume === 0
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A6.97 6.97 0 0 1 14 18.98v2.06A9 9 0 0 0 17.54 19l1.73 1.73L20.54 19 5.54 4 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
              : volume < 50
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            }
          </button>
          <input type="range" min={0} max={100} value={volume} step={1}
            onChange={handleVolumeChange} className="volume-inline-slider"
            title={`Volume: ${volume}%`} style={{ '--vol': `${volume}%` }}
          />
          <span className="volume-pct">{volume}%</span>
          <button className="speed-btn" onClick={handleSpeedCycle} title="Playback speed">
            {SPEEDS[speedIdx]}×
          </button>
          {/* Lyrics toggle */}
          {(lyrics || lyricsLoading) && (
            <button
              className={`ctrl-btn ctrl-icon-btn ${showLyrics ? 'ctrl-active' : ''}`}
              onClick={() => setShowLyrics(v => !v)}
              title={lyricsLoading ? 'Loading lyrics...' : 'Toggle lyrics'}
              disabled={lyricsLoading}
            >
              {lyricsLoading ? <span className="loading-spinner" style={{width:14,height:14}} /> : '🎼'}
            </button>
          )}
        </div>
      )}

      {/* Stamp row */}
      {videoId && (
        <div className="player-action-row">
          <button
            className={`player-action-btn stamp-btn-compact ${stamped ? 'stamped' : ''} ${stampAnim ? 'stamp-anim' : ''}`}
            onClick={handleStamp}
            title={stamped ? 'Moment stamped!' : `Stamp at ${formatTime(currentTime)}`}
          >
            {stamped
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" strokeLinejoin="round"/></svg>
            }
            <span>{stamped ? 'Stamped!' : `★ ${formatTime(currentTime)}`}</span>
          </button>
          {/* Lyrics toggle mobile */}
          {IS_MOBILE && (lyrics || lyricsLoading) && (
            <button
              className={`player-action-btn ${showLyrics ? 'stamped' : ''}`}
              onClick={() => setShowLyrics(v => !v)}
              disabled={lyricsLoading}
            >
              {lyricsLoading ? '...' : '🎼 Lyrics'}
            </button>
          )}
        </div>
      )}

      <div className="sync-badge">
        <span className="sync-dot" />
        {isLocked ? 'Listening' : 'Synced'}
      </div>
    </div>
  )
}
