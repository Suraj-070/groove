import { useEffect, useRef, useState, useCallback } from 'react'

let YT = null
let ytApiLoading = false
const ytReadyCallbacks = []

// ── Load YouTube API once globally ───────────────────────────
function loadYouTubeAPI(cb) {
  if (window.YT && window.YT.Player) { YT = window.YT; cb(); return }
  ytReadyCallbacks.push(cb)
  if (ytApiLoading) return
  ytApiLoading = true
  const tag = document.createElement('script')
  tag.src = 'https://www.youtube.com/iframe_api'
  document.body.appendChild(tag)
  window.onYouTubeIframeAPIReady = () => {
    YT = window.YT
    ytReadyCallbacks.forEach(fn => fn())
    ytReadyCallbacks.length = 0
  }
}

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

function BeatBorder({ isPlaying }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const isPlayingRef = useRef(isPlaying)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let time = 0, beat = 0, lastBeat = 0, beatCount = 0
    let paletteIndex = 0, palette = PALETTES[0]
    const BPM = 120, beatInterval = 60 / BPM
    const r = 14

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(canvas)

    const frame = () => {
      const W = canvas.width, H = canvas.height
      const playing = isPlayingRef.current
      time += 0.016
      if (playing && time - lastBeat > beatInterval) {
        lastBeat = time; beat = 1.0; beatCount++
        if (beatCount % 8 === 0) { paletteIndex = (paletteIndex + 1) % PALETTES.length; palette = PALETTES[paletteIndex] }
      }
      beat *= playing ? 0.88 : 0.75
      ctx.clearRect(0, 0, W, H)

      if (!playing && beat < 0.01) {
        const a = 0.3 + Math.sin(time * 0.8) * 0.15
        ctx.strokeStyle = `rgba(124,106,255,${a})`
        ctx.lineWidth = 2; ctx.shadowColor = '#7c6aff'; ctx.shadowBlur = 8
        ctx.beginPath(); ctx.roundRect(1, 1, W-2, H-2, r); ctx.stroke()
        animRef.current = requestAnimationFrame(frame); return
      }

      const segments = 120
      for (let i = 0; i < segments; i++) {
        const t = i / segments, next = (i + 1) / segments
        const colorT = (t + time * 0.12) % 1
        const ci = Math.floor(colorT * palette.length)
        const color = palette[ci % palette.length]
        const wave = Math.sin(t * Math.PI * 6 + time * 4) * 0.5 + 0.5
        const alpha = (0.5 + wave * 0.5 + beat * 0.5) * (playing ? 1 : 0.3)
        const lw = (2 + wave * 3 + beat * 6) * (playing ? 1 : 0.4)
        const [x1, y1] = pointOnRoundRect(t, W, H, r)
        const [x2, y2] = pointOnRoundRect(next, W, H, r)
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw
        ctx.shadowColor = color; ctx.shadowBlur = 10 + beat * 20 + wave * 8
        ctx.globalAlpha = alpha
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore()
      }

      if (beat > 0.7) {
        ctx.save(); ctx.strokeStyle = palette[0]; ctx.lineWidth = 3 + beat * 8
        ctx.shadowColor = palette[0]; ctx.shadowBlur = 30 + beat * 40
        ctx.globalAlpha = (beat - 0.7) * 0.8
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

export default function Player({ socket, roomId, videoId, title, onEnded, onSkip, onPrev, isDJ, djMode, initialTime, initialPlaying, onPlayStateChange, hasPrev }) {
  const playerContainerRef = useRef(null)
  const playerInstanceRef = useRef(null)
  const isSyncingRef = useRef(false)
  const isPlayingRef = useRef(false)
  const lastVideoIdRef = useRef(null)
  const pendingSongRef = useRef(null)
  const [ytReady, setYtReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(80)
  const [showVolume, setShowVolume] = useState(false)
  const [playerStatus, setPlayerStatus] = useState('loading') // loading | ready | playing | buffering

  const onEndedRef = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  const setPlay = useCallback((playing) => {
    setIsPlaying(playing)
    isPlayingRef.current = playing
    onPlayStateChange?.(playing)
  }, [onPlayStateChange])

  // ── Init YouTube player ONCE ──────────────────────────────
  useEffect(() => {
    let destroyed = false

    const init = () => {
      if (destroyed || !playerContainerRef.current) return
      const div = document.createElement('div')
      playerContainerRef.current.appendChild(div)

      playerInstanceRef.current = new YT.Player(div, {
        height: '100%', width: '100%', videoId: '',
        playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1, enablejsapi: 1 },
        events: {
          onReady: () => {
            if (destroyed) return
            playerInstanceRef.current.setVolume(volume)
            setYtReady(true)
            setPlayerStatus('ready')
            // Load pending song if any
            if (pendingSongRef.current) {
              const { vid, time, playing } = pendingSongRef.current
              pendingSongRef.current = null
              playerInstanceRef.current.loadVideoById({ videoId: vid, startSeconds: time || 0 })
              if (!playing) setTimeout(() => playerInstanceRef.current?.pauseVideo(), 1000)
            }
          },
          onStateChange: (e) => {
            if (destroyed) return
            if (e.data === YT.PlayerState.PLAYING) {
              setPlay(true); setPlayerStatus('playing')
            } else if (e.data === YT.PlayerState.PAUSED) {
              setPlay(false); setPlayerStatus('ready')
            } else if (e.data === YT.PlayerState.BUFFERING) {
              setPlayerStatus('buffering')
            } else if (e.data === YT.PlayerState.ENDED) {
              setPlay(false)
              onEndedRef.current?.()
            }
          },
          onError: (e) => {
            console.warn('YouTube player error:', e.data)
            setPlayerStatus('ready')
          }
        }
      })
    }

    loadYouTubeAPI(init)

    return () => {
      destroyed = true
      try { playerInstanceRef.current?.destroy() } catch {}
      playerInstanceRef.current = null
    }
  }, []) // eslint-disable-line

  // ── Load new video when videoId changes ───────────────────
  useEffect(() => {
    if (!videoId || videoId === lastVideoIdRef.current) return
    lastVideoIdRef.current = videoId

    const p = playerInstanceRef.current
    if (!ytReady || !p || typeof p.loadVideoById !== 'function') {
      // Queue it for when player is ready
      pendingSongRef.current = { vid: videoId, time: initialTime || 0, playing: initialPlaying ?? true }
      return
    }

    p.loadVideoById({ videoId, startSeconds: 0 })
    // Don't force play here — server sync-heartbeat / room-state will handle timing
  }, [videoId, ytReady]) // eslint-disable-line

  // ── Socket events ─────────────────────────────────────────
  useEffect(() => {
    const safeSeek = (time) => {
      const p = playerInstanceRef.current
      if (p && typeof p.seekTo === 'function') p.seekTo(time, true)
    }

    const onPlay = ({ time }) => {
      isSyncingRef.current = true
      safeSeek(time)
      playerInstanceRef.current?.playVideo()
      setPlay(true)
      setTimeout(() => { isSyncingRef.current = false }, 600)
    }

    const onPause = ({ time }) => {
      isSyncingRef.current = true
      safeSeek(time)
      playerInstanceRef.current?.pauseVideo()
      setPlay(false)
      setTimeout(() => { isSyncingRef.current = false }, 600)
    }

    const onSeek = ({ time }) => {
      isSyncingRef.current = true
      safeSeek(time)
      setCurrentTime(time)
      setTimeout(() => { isSyncingRef.current = false }, 600)
    }

    const onSyncCheck = ({ time }) => {
      const p = playerInstanceRef.current
      if (!p || typeof p.getCurrentTime !== 'function') return
      const current = p.getCurrentTime() || 0
      if (Math.abs(current - time) > 2) p.seekTo(time, true)
    }

    socket.on('play', onPlay)
    socket.on('pause', onPause)
    socket.on('seek', onSeek)
    socket.on('sync-check', onSyncCheck)

    return () => {
      socket.off('play', onPlay)
      socket.off('pause', onPause)
      socket.off('seek', onSeek)
      socket.off('sync-check', onSyncCheck)
    }
  }, [socket, setPlay])

  // ── Progress ticker ───────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const p = playerInstanceRef.current
      if (p && typeof p.getCurrentTime === 'function') {
        setCurrentTime(p.getCurrentTime() || 0)
        setDuration(p.getDuration() || 0)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // ── Sync heartbeat (every 10s) ────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const p = playerInstanceRef.current
      if (isPlayingRef.current && p && typeof p.getCurrentTime === 'function') {
        socket.emit('sync-heartbeat', { roomId, time: p.getCurrentTime() || 0 })
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [roomId, socket])

  // ── Volume ────────────────────────────────────────────────
  useEffect(() => {
    const p = playerInstanceRef.current
    if (p && typeof p.setVolume === 'function') p.setVolume(volume)
  }, [volume])

  const getTime = () => {
    const p = playerInstanceRef.current
    return (p && typeof p.getCurrentTime === 'function') ? (p.getCurrentTime() || 0) : 0
  }

  const handlePlay = () => {
    if (isSyncingRef.current) return
    const p = playerInstanceRef.current
    if (!p || typeof p.playVideo !== 'function') return
    const time = getTime()
    p.playVideo()
    setPlay(true)
    socket.emit('play', { roomId, time })
  }

  const handlePause = () => {
    if (isSyncingRef.current) return
    const p = playerInstanceRef.current
    if (!p || typeof p.pauseVideo !== 'function') return
    const time = getTime()
    p.pauseVideo()
    setPlay(false)
    socket.emit('pause', { roomId, time })
  }

  const handleSeek = (e) => {
    const p = playerInstanceRef.current
    const time = parseFloat(e.target.value)
    if (p && typeof p.seekTo === 'function') p.seekTo(time, true)
    setCurrentTime(time)
    socket.emit('seek', { roomId, time })
  }

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00'
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  const progress = duration ? (currentTime / duration) * 100 : 0
  const isLocked = djMode && !isDJ

  return (
    <div className="player" style={{ position: 'relative', overflow: 'visible' }}>
      <BeatBorder isPlaying={isPlaying} />

      {/* Hidden YouTube player container */}
      <div ref={playerContainerRef} style={{ display: 'none' }} />

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
        {playerStatus === 'buffering' && (
          <div className="art-loading"><div className="art-loading-spinner" /></div>
        )}
      </div>

      <div className="player-info">
        <p className="player-title">{title || 'No song loaded'}</p>
        <p className="player-sub">{videoId ? 'YouTube' : 'Add a song to the queue →'}</p>
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
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
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
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/>
            </svg>
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
                  onChange={(e) => setVolume(parseInt(e.target.value))} className="volume-slider" orient="vertical" />
                <span className="volume-label">{volume}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sync-badge">
        <span className={`sync-dot ${playerStatus === 'buffering' ? 'buffering' : ''}`} />
        {playerStatus === 'buffering' ? 'Buffering...' : isLocked ? 'Listening' : 'Synced'}
      </div>
    </div>
  )
}
