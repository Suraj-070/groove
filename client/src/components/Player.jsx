import { useEffect, useRef, useState, useCallback } from 'react'
import MarqueeText from './MarqueeText'

let YT = null

// Global beat energy bus — Visualizer writes here, BeatBorder reads it
window.__grooveBeatEnergy = 0

// Detect mobile once — BeatBorder is too expensive on phones
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

// ── BPM fetch (MusicBrainz + AcousticBrainz, no API key needed) ──────────────
async function fetchBPM(title) {
  if (!title) return null
  try {
    // Clean the title for search
    const query = encodeURIComponent(title.replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 60))
    const mbRes = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${query}&limit=3&fmt=json`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'GrooveTogether/1.0' } }
    )
    if (!mbRes.ok) return null
    const mbData = await mbRes.json()
    const recording = mbData?.recordings?.[0]
    if (!recording?.id) return null

    const abRes = await fetch(`https://acousticbrainz.org/${recording.id}/low-level`)
    if (!abRes.ok) return null
    const abData = await abRes.json()
    const bpm = abData?.rhythm?.bpm
    if (bpm && bpm > 40 && bpm < 220) return Math.round(bpm)
    return null
  } catch {
    return null
  }
}

// ── Beat-synced border ────────────────────────────────────────────────────────
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

    const frame = () => {
      const W = canvas.width, H = canvas.height
      const playing = isPlayingRef.current
      const currentBPM = bpmRef.current
      // Combine BPM-based interval with energy from visualizer
      const beatInterval = 60 / currentBPM
      const energy = window.__grooveBeatEnergy || 0

      time += 0.016

      if (playing && time - lastBeat > beatInterval) {
        lastBeat = time
        // Beat intensity = 1.0 base + energy boost from visualizer (0–0.5 extra)
        beat = Math.min(1.0, 0.75 + energy * 0.5)
        beatCount++
        if (beatCount % 8 === 0) {
          paletteIndex = (paletteIndex + 1) % PALETTES.length
          palette = PALETTES[paletteIndex]
        }
      }

      // Also allow visualizer energy spikes to add mini-pulses between beats
      const energyBoost = energy * 0.3
      beat = Math.max(beat, energyBoost)
      beat *= playing ? 0.88 : 0.75

      ctx.clearRect(0, 0, W, H)

      // Idle glow when not playing
      if (!playing && beat < 0.01) {
        const a = 0.3 + Math.sin(time * 0.8) * 0.15
        ctx.strokeStyle = `rgba(124,106,255,${a})`
        ctx.lineWidth = 2; ctx.shadowColor = '#7c6aff'; ctx.shadowBlur = 8
        ctx.beginPath(); ctx.roundRect(1, 1, W-2, H-2, r); ctx.stroke()
        animRef.current = requestAnimationFrame(frame); return
      }

      // ── Animated border segments ──
      const segments = 120
      // Speed scales with BPM — faster songs = border moves faster
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

      // ── Big flash on strong beat ──
      if (beat > 0.65) {
        ctx.save(); ctx.strokeStyle = palette[0]; ctx.lineWidth = 3 + beat * 8
        ctx.shadowColor = palette[0]; ctx.shadowBlur = 30 + beat * 40
        ctx.globalAlpha = (beat - 0.65) * 0.9
        ctx.beginPath(); ctx.roundRect(1, 1, W-2, H-2, r); ctx.stroke(); ctx.restore()
      }

      animRef.current = requestAnimationFrame(frame)
    }
    animRef.current = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(animRef.current); ro.disconnect() }
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', borderRadius: 14,
    }} />
  )
}

// ── BPM display badge ─────────────────────────────────────────────────────────
function BpmBadge({ bpm, loading }) {
  if (loading) return <span className="bpm-badge bpm-loading">♩ detecting...</span>
  if (!bpm) return null
  return <span className="bpm-badge">♩ {bpm} BPM</span>
}

export default function Player({ socket, roomId, videoId, title, onEnded, onSkip, onPrev, isDJ, djMode, initialTime, initialPlaying, onPlayStateChange, hasPrev, externalVolume, onVolumeChange, loop }) {
  const playerRef = useRef(null)
  const playerInstanceRef = useRef(null)
  const isSyncingRef = useRef(false)
  const isPlayingRef = useRef(false)
  const initialSyncDone = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [volume, setVolume] = useState(externalVolume ?? 80)

  // Sync with parent keyboard mute
  useEffect(() => {
    if (externalVolume !== undefined) setVolume(externalVolume)
  }, [externalVolume])
  const [showVolume, setShowVolume] = useState(false)
  const [bpm, setBpm] = useState(null)
  const [bpmLoading, setBpmLoading] = useState(false)

  const onEndedRef = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  // ── Fetch BPM whenever title changes ──
  useEffect(() => {
    if (!title) { setBpm(null); return }
    setBpmLoading(true)
    setBpm(null)
    let cancelled = false
    fetchBPM(title).then(result => {
      if (!cancelled) {
        setBpm(result)
        setBpmLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [title])

  useEffect(() => {
    let destroyed = false
    const initPlayer = () => {
      if (!playerRef.current || destroyed) return
      if (playerInstanceRef.current && typeof playerInstanceRef.current.destroy === 'function') {
        playerInstanceRef.current.destroy()
        playerInstanceRef.current = null
      }
      playerInstanceRef.current = new YT.Player(playerRef.current, {
        height: '100%', width: '100%', videoId: '',
        playerVars: {
          autoplay: 0,
          controls: 0,       // Groove's own controls handle play/pause/seek
          rel: 0,            // No related videos at end
          modestbranding: 1, // Minimal YouTube branding
          playsinline: 1,    // Critical for iOS — prevents fullscreen hijack
          iv_load_policy: 3, // No video annotations
          disablekb: 1,      // Disable YouTube keyboard shortcuts (Groove handles them)
          fs: 0,             // Disable YouTube's own fullscreen button
        },
        events: {
          onReady: () => { if (!destroyed) setIsReady(true) },
          onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) onEndedRef.current?.() }
        }
      })
    }
    if (window.YT && window.YT.Player) { YT = window.YT; initPlayer() }
    else {
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(tag)
      }
      window.onYouTubeIframeAPIReady = () => { YT = window.YT; initPlayer() }
    }
    return () => {
      destroyed = true
      if (playerInstanceRef.current && typeof playerInstanceRef.current.destroy === 'function') {
        playerInstanceRef.current.destroy()
        playerInstanceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const p = playerInstanceRef.current
    if (!p || !isReady || !videoId) return
    if (typeof p.loadVideoById !== 'function') return
    p.loadVideoById(videoId)
    if (!initialSyncDone.current && initialTime && initialTime > 0) {
      initialSyncDone.current = true
      setTimeout(() => {
        const pi = playerInstanceRef.current
        if (!pi || typeof pi.seekTo !== 'function') return
        pi.seekTo(initialTime, true)
        if (initialPlaying) { pi.playVideo(); setIsPlaying(true); onPlayStateChange?.(true) }
        else { pi.pauseVideo(); setIsPlaying(false); onPlayStateChange?.(false) }
      }, 800)
    } else {
      setTimeout(() => {
        const pi = playerInstanceRef.current
        if (pi && typeof pi.playVideo === 'function') { pi.playVideo(); setIsPlaying(true); onPlayStateChange?.(true) }
      }, 300)
    }
  }, [videoId, isReady])

  useEffect(() => {
    socket.on('play', ({ time }) => {
      const p = playerInstanceRef.current
      if (!p || typeof p.seekTo !== 'function') return
      isSyncingRef.current = true
      p.seekTo(time, true); p.playVideo()
      setIsPlaying(true); onPlayStateChange?.(true)
      setTimeout(() => { isSyncingRef.current = false }, 500)
    })
    socket.on('pause', ({ time }) => {
      const p = playerInstanceRef.current
      if (!p || typeof p.seekTo !== 'function') return
      isSyncingRef.current = true
      p.seekTo(time, true); p.pauseVideo()
      setIsPlaying(false); onPlayStateChange?.(false)
      setTimeout(() => { isSyncingRef.current = false }, 500)
    })
    socket.on('seek', ({ time }) => {
      const p = playerInstanceRef.current
      if (!p || typeof p.seekTo !== 'function') return
      isSyncingRef.current = true
      p.seekTo(time, true); setCurrentTime(time)
      setTimeout(() => { isSyncingRef.current = false }, 500)
    })
    socket.on('load-song', ({ videoId }) => {
      const p = playerInstanceRef.current
      if (videoId && p && typeof p.loadVideoById === 'function') p.loadVideoById(videoId)
      setIsPlaying(true); onPlayStateChange?.(true)
    })
    socket.on('sync-check', ({ time }) => {
      const p = playerInstanceRef.current
      if (!p || typeof p.getCurrentTime !== 'function') return
      const current = p.getCurrentTime() || 0
      if (Math.abs(current - time) > 1.5) p.seekTo(time, true)
    })
    return () => { socket.off('play'); socket.off('pause'); socket.off('seek'); socket.off('load-song'); socket.off('sync-check') }
  }, [socket])

  useEffect(() => {
    // Mobile: poll every 1s (half the re-renders). Desktop: every 500ms for smooth scrubbing
    const interval = setInterval(() => {
      const p = playerInstanceRef.current
      if (p && typeof p.getCurrentTime === 'function') {
        setCurrentTime(p.getCurrentTime() || 0); setDuration(p.getDuration() || 0)
      }
    }, IS_MOBILE ? 1000 : 500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  useEffect(() => {
    const interval = setInterval(() => {
      const p = playerInstanceRef.current
      if (isPlayingRef.current && p && typeof p.getCurrentTime === 'function')
        socket.emit('sync-heartbeat', { roomId, time: p.getCurrentTime() || 0 })
    }, 10000)
    return () => clearInterval(interval)
  }, [roomId, socket])

  useEffect(() => {
    const p = playerInstanceRef.current
    if (p && typeof p.setVolume === 'function') p.setVolume(volume)
  }, [volume])

  const getTime = () => {
    const p = playerInstanceRef.current
    return (p && typeof p.getCurrentTime === 'function') ? p.getCurrentTime() || 0 : 0
  }

  const handlePlay = () => {
    if (isSyncingRef.current) return
    const p = playerInstanceRef.current
    if (!p || typeof p.playVideo !== 'function') return
    const time = getTime()
    p.playVideo(); setIsPlaying(true); onPlayStateChange?.(true)
    socket.emit('play', { roomId, time })
  }
  const handlePause = () => {
    if (isSyncingRef.current) return
    const p = playerInstanceRef.current
    if (!p || typeof p.pauseVideo !== 'function') return
    const time = getTime()
    p.pauseVideo(); setIsPlaying(false); onPlayStateChange?.(false)
    socket.emit('pause', { roomId, time })
  }
  const handleSeek = (e) => {
    const p = playerInstanceRef.current
    const time = parseFloat(e.target.value)
    if (p && typeof p.seekTo === 'function') p.seekTo(time, true)
    setCurrentTime(time)
    socket.emit('seek', { roomId, time })
  }
  const handleVolumeChange = (e) => { const v = parseInt(e.target.value); setVolume(v); onVolumeChange?.(v) }

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00'
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  const progress = duration ? (currentTime / duration) * 100 : 0
  const isLocked = djMode && !isDJ

  return (
    <div className="player" style={{ position: 'relative', overflow: 'visible' }}>
      {!IS_MOBILE && <BeatBorder isPlaying={isPlaying} bpm={bpm || 120} />}
      {/* YouTube iframe — always hidden, audio only. Video handled by VideoPanel */}
      <div ref={playerRef} style={{ display: 'none' }} />

      {djMode && (
        <div className={`dj-badge ${isDJ ? 'is-dj' : 'not-dj'}`}>
          {isDJ ? '👑 You are the DJ' : '🎧 DJ is controlling playback'}
        </div>
      )}

      <div className="player-art">
        {videoId
          ? <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="thumbnail" className="art-img" />
          : <div className="art-placeholder"><span>🎵</span></div>}
        {isPlaying && <div className="art-pulse" />}
        {!isReady && <div className="art-loading"><div className="art-loading-spinner" /></div>}
      </div>

      <div className="player-info">
        <MarqueeText className="player-title">{title || 'No song loaded'}</MarqueeText>
        <div className="player-sub-row">
          <p className="player-sub">{videoId ? 'YouTube' : 'Add a song to the queue →'}</p>
          <BpmBadge bpm={bpm} loading={bpmLoading && !!title} />
        </div>
      </div>

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
          <button className="ctrl-btn prev-btn" onClick={onPrev} disabled={!hasPrev || isLocked} title="Previous">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </button>
        </div>
        <div className="ctrl-slot ctrl-center">
          <button className={`play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={isPlaying ? handlePause : handlePlay} disabled={!videoId || isLocked}>
            {isPlaying
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>}
          </button>
        </div>
        <div className="ctrl-slot ctrl-right">
          <button className="ctrl-btn skip-btn" onClick={onSkip} disabled={!videoId || isLocked} title="Next">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
          </button>
          <div className="volume-wrap">
            <button className="ctrl-btn volume-btn" onClick={() => setShowVolume(p => !p)} title="Volume">
              {volume === 0
                ? <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A6.97 6.97 0 0 1 14 18.98v2.06A9 9 0 0 0 17.54 19l1.73 1.73L20.54 19 5.54 4 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
                : volume < 50
                ? <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
              }
            </button>
            {showVolume && (
              <div className="volume-popup">
                <input type="range" min={0} max={100} value={volume}
                  onChange={handleVolumeChange} className="volume-slider" orient="vertical" />
                <span className="volume-label">{volume}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sync-badge">
        <span className="sync-dot" />
        {isLocked ? 'Listening' : 'Synced'}
      </div>
    </div>
  )
}