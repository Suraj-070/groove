import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const PALETTES = [
  ['#7c6aff', '#ff6a8a', '#6affb8', '#ffb86a'],
  ['#00f5ff', '#ff00ff', '#00ff88', '#ffff00'],
  ['#ff4444', '#ff8800', '#ffdd00', '#ff4488'],
  ['#4400ff', '#0088ff', '#00ffdd', '#8800ff'],
  ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec'],
]

function rnd(a, b) { return Math.random() * (b - a) + a }
function rgba(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${n>>16},${(n>>8)&255},${n&255},${Math.min(1, Math.max(0, a))})`
}

// Detect mobile once at module level — no re-check needed
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 768

// Mobile: fewer particles, no party mode bars, no shadowBlur
const PARTICLE_COUNT = IS_MOBILE ? 30 : 80

function VisualizerCanvas({ isPlaying, partyMode }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef({ isPlaying, partyMode })
  useEffect(() => { stateRef.current.isPlaying = isPlaying }, [isPlaying])
  useEffect(() => { stateRef.current.partyMode = partyMode }, [partyMode])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: false }) // alpha:false = faster compositing

    const setSize = () => {
      // On mobile, render at half resolution then scale up — massive perf win
      const scale = IS_MOBILE ? 0.5 : 1
      canvas.width  = Math.floor(window.innerWidth  * scale)
      canvas.height = Math.floor(window.innerHeight * scale)
      canvas.style.width  = '100vw'
      canvas.style.height = '100vh'
    }
    setSize()
    window.addEventListener('resize', setSize)

    let t = 0, beat = 0, lastBeat = -999, gridPulse = 0
    let beatN = 0, palI = 0, pal = PALETTES[0], prevParty = false

    // Bars — only used in party mode on desktop
    const N = IS_MOBILE ? 0 : 64
    const bh = new Array(N).fill(0.02)
    const bt = new Array(N).fill(0.02)
    const bs = new Array(N).fill(0).map(() => rnd(0.04, 0.09))
    const bphase = new Array(N).fill(0).map((_, i) => (i / N) * Math.PI * 6)

    const circles = []

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: rnd(0, window.innerWidth),
      y: rnd(0, window.innerHeight),
      vx: rnd(-0.3, 0.3),
      vy: rnd(-1.2, -0.2),
      r: rnd(2, IS_MOBILE ? 3 : 5),
      a: rnd(0.4, 0.9),
      life: rnd(0, 1),
      max: rnd(4, 9),
      c: pal[Math.floor(rnd(0, pal.length))],
    }))

    const resetP = (p) => {
      p.x = rnd(0, canvas.width); p.y = canvas.height + 10
      p.vx = rnd(-0.3, 0.3); p.vy = rnd(-1.2, -0.2)
      p.r = rnd(2, IS_MOBILE ? 3 : 5); p.a = rnd(0.4, 0.9)
      p.life = 0; p.max = rnd(4, 9)
      p.c = pal[Math.floor(rnd(0, pal.length))]
    }

    let raf
    const loop = () => {
      const playing = stateRef.current.isPlaying
      const party   = stateRef.current.partyMode
      const cw = canvas.width, ch = canvas.height

      if (party && !prevParty) {
        lastBeat = t; beat = 0; gridPulse = 0
        circles.length = 0
        for (let i = 0; i < N; i++) { bh[i] = 0.02; bt[i] = 0.02 }
      }
      prevParty = party

      if (party) t += 0.016

      // Beat
      if (playing && t - lastBeat > 0.5) {
        lastBeat = t; beat = 1.0; gridPulse = 1.0; beatN++
        // Fewer circles on mobile
        if (!IS_MOBILE) {
          circles.push(
            { x: cw/2 + rnd(-120,120), y: ch*0.5, r: 15, max: rnd(180, cw*0.42), a: 0.9, spd: rnd(5,11), c: pal[beatN % pal.length] },
            { x: cw/2 + rnd(-80,80),   y: ch*0.5, r: 10, max: rnd(80,  cw*0.26), a: 0.7, spd: rnd(3, 8), c: pal[(beatN+2) % pal.length] }
          )
        } else {
          circles.push({ x: cw/2, y: ch*0.5, r: 10, max: rnd(80, cw*0.35), a: 0.7, spd: rnd(4,9), c: pal[beatN % pal.length] })
        }
        for (let i = 0; i < N; i++) bt[i] = rnd(0.3, 1.0)
        if (beatN % 8 === 0) {
          palI = (palI + 1) % PALETTES.length; pal = PALETTES[palI]
          particles.forEach(p => { p.c = pal[Math.floor(rnd(0, pal.length))] })
        }
      }

      if (!playing) {
        beat *= 0.70; gridPulse *= 0.70
        for (let i = 0; i < N; i++) bt[i] = 0.01
      } else {
        beat *= 0.88; gridPulse *= 0.82
      }
      window.__grooveBeatEnergy = beat

      // Clear
      ctx.fillStyle = '#080810'
      ctx.fillRect(0, 0, cw, ch)

      // ── 1. FLOOR GRID (desktop party only) ──────────────
      if (!IS_MOBILE && party && (beat > 0.01 || gridPulse > 0.01)) {
        const vanY = ch * 0.60
        const gA = 0.18 + gridPulse * 0.55
        ctx.lineWidth = 0.7
        for (let i = 0; i < 18; i++) {
          const p = i / 17
          const y = vanY + (ch - vanY) * (p ** 1.4)
          ctx.strokeStyle = rgba(pal[0], gA * p * 2)
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke()
        }
        for (let i = 0; i <= 24; i++) {
          const x = (i / 24) * cw
          ctx.strokeStyle = rgba(pal[1], gA * 0.45)
          ctx.beginPath(); ctx.moveTo(x, ch); ctx.lineTo(cw/2, vanY); ctx.stroke()
        }
      }

      // ── 2. WAVEFORM BARS (desktop party only) ───────────
      if (!IS_MOBILE && party) {
        const vanY = ch * 0.60, maxH = vanY * 0.88
        const slotW = (cw * 0.8) / N, startX = cw * 0.1
        // Disable shadowBlur on mobile — already skipped, but belt+suspenders
        ctx.shadowBlur = 0
        for (let i = 0; i < N; i++) {
          bh[i] += (bt[i] - bh[i]) * bs[i]
          if (playing) bh[i] += Math.sin(t * 5 + bphase[i]) * 0.006
          const h = Math.max(2, bh[i] * maxH)
          const x = startX + i * slotW, y = vanY - h
          const col = pal[Math.floor((i / N) * pal.length) % pal.length]
          const barAlpha = playing ? 1 : Math.max(0, bh[i] * 8)
          const g = ctx.createLinearGradient(0, y, 0, vanY)
          g.addColorStop(0, rgba(col, 0.92 * barAlpha))
          g.addColorStop(1, rgba(col, 0.02))
          ctx.fillStyle = g
          ctx.fillRect(x, y, slotW - 2, h)
        }
      }

      // ── 3. CIRCLES ───────────────────────────────────────
      if (party && circles.length) {
        ctx.shadowBlur = IS_MOBILE ? 0 : 22  // no shadow on mobile
        for (let i = circles.length - 1; i >= 0; i--) {
          const c = circles[i]
          c.r += playing ? c.spd : c.spd * 0.3
          c.a -= playing ? 0.013 : 0.06
          if (c.a <= 0 || c.r > c.max) { circles.splice(i, 1); continue }
          ctx.strokeStyle = rgba(c.c, c.a)
          ctx.lineWidth = IS_MOBILE ? 1.5 : 2.5 + beat * 5
          ctx.shadowColor = IS_MOBILE ? 'transparent' : c.c
          ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.shadowBlur = 0
      }

      // ── 4. PARTICLES ─────────────────────────────────────
      // Batch all particles with same alpha — avoid save/restore per particle
      ctx.shadowBlur = IS_MOBILE ? 0 : 10
      for (const p of particles) {
        p.life += 0.01
        if (p.life >= p.max) { resetP(p); continue }
        p.x += p.vx; p.y += p.vy
        p.vx += rnd(-0.01, 0.01)
        const lr = p.life / p.max
        const alpha = Math.sin(lr * Math.PI) * p.a * (party ? (playing ? 1 : 0) : 1)
        if (alpha < 0.05) continue // skip nearly-invisible particles
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.c
        if (!IS_MOBILE) ctx.shadowColor = p.c
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0

      // ── 5. BEAT FLASH (desktop only) ─────────────────────
      if (!IS_MOBILE && party && beat > 0.55 && playing) {
        const g = ctx.createRadialGradient(cw/2, ch/2, 0, cw/2, ch/2, cw * 0.7)
        g.addColorStop(0, rgba(pal[0], (beat - 0.55) * 0.3))
        g.addColorStop(1, rgba(pal[0], 0))
        ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch)
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', setSize) }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: 0, pointerEvents: 'none', display: 'block',
      }}
    />
  )
}

export default function Visualizer({ isPlaying, partyMode }) {
  return createPortal(<VisualizerCanvas isPlaying={isPlaying} partyMode={partyMode} />, document.body)
}