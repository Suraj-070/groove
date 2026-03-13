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

function VisualizerCanvas({ isPlaying, partyMode }) {
  const canvasRef = useRef(null)
  const stateRef = useRef({ isPlaying, partyMode })
  useEffect(() => { stateRef.current.isPlaying = isPlaying }, [isPlaying])
  useEffect(() => { stateRef.current.partyMode = partyMode }, [partyMode])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const setSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    setSize()
    window.addEventListener('resize', setSize)

    let t = 0
    let beat = 0
    let lastBeat = -999  // start far in past so first beat fires immediately... wait no
    let gridPulse = 0
    let beatN = 0
    let palI = 0
    let pal = PALETTES[0]
    let prevParty = false  // track party mode transitions

    // ── Bars ──────────────────────────────────────────
    const N = 64
    const bh    = new Array(N).fill(0.02)
    const bt    = new Array(N).fill(0.02)
    const bs    = new Array(N).fill(0).map(() => rnd(0.04, 0.09))
    const bphase= new Array(N).fill(0).map((_, i) => (i / N) * Math.PI * 6)

    // ── Circles ───────────────────────────────────────
    const circles = []

    // ── Particles (always float, color from palette) ──
    const particles = Array.from({ length: 80 }, () => ({
      x: rnd(0, window.innerWidth),
      y: rnd(0, window.innerHeight),
      vx: rnd(-0.3, 0.3),
      vy: rnd(-1.2, -0.2),
      r: rnd(2, 5),
      a: rnd(0.4, 0.9),
      life: rnd(0, 1),
      max: rnd(4, 9),
      c: pal[Math.floor(rnd(0, pal.length))],
    }))

    const resetP = (p) => {
      p.x = rnd(0, canvas.width); p.y = canvas.height + 10
      p.vx = rnd(-0.3, 0.3); p.vy = rnd(-1.2, -0.2)
      p.r = rnd(2, 5); p.a = rnd(0.4, 0.9)
      p.life = 0; p.max = rnd(4, 9)
      p.c = pal[Math.floor(rnd(0, pal.length))]
    }

    let raf
    const loop = () => {
      const playing = stateRef.current.isPlaying
      const party = stateRef.current.partyMode
      const cw = canvas.width, ch = canvas.height

      // ── Detect party mode just turned ON → reset beat clock ──
      if (party && !prevParty) {
        lastBeat = t        // reset so first beat fires on schedule, not immediately
        beat = 0
        gridPulse = 0
        circles.length = 0  // clear any stale circles
        for (let i = 0; i < N; i++) { bh[i] = 0.02; bt[i] = 0.02 }
      }
      prevParty = party

      // Only advance time when party mode is on — prevents accumulated t drift
      if (party) t += 0.016

      // ── Beat (only when playing) ───────────────────
      if (playing && t - lastBeat > 0.5) {
        lastBeat = t; beat = 1.0; gridPulse = 1.0; beatN++

        circles.push(
          { x: cw/2 + rnd(-120,120), y: ch*0.5, r: 15, max: rnd(180, cw*0.42), a: 0.9, spd: rnd(5,11), c: pal[beatN % pal.length] },
          { x: cw/2 + rnd(-80,80),   y: ch*0.5, r: 10, max: rnd(80,  cw*0.26), a: 0.7, spd: rnd(3, 8), c: pal[(beatN+2) % pal.length] }
        )
        for (let i = 0; i < N; i++) bt[i] = rnd(0.3, 1.0)

        if (beatN % 8 === 0) {
          palI = (palI + 1) % PALETTES.length
          pal = PALETTES[palI]
          particles.forEach(p => { p.c = pal[Math.floor(rnd(0, pal.length))] })
        }
      }

      // ── Decay beat immediately when stopped ────────
      if (!playing) {
        beat *= 0.70      // fast decay when paused
        gridPulse *= 0.70
        window.__grooveBeatEnergy = beat
        // Slam bars to near-zero quickly
        for (let i = 0; i < N; i++) bt[i] = 0.01
      } else {
        beat *= 0.88
        gridPulse *= 0.82
      // Publish to global so Player card reads energy
      window.__grooveBeatEnergy = beat
      }

      // ── Clear ──────────────────────────────────────
      ctx.fillStyle = '#080810'
      ctx.fillRect(0, 0, cw, ch)

      const fa = playing ? 1 : 0

      // ─────────────────────────────────────
      // 1. FLOOR GRID (party mode only)
      // ─────────────────────────────────────
      if (party && (beat > 0.01 || gridPulse > 0.01)) {
        const vanY = ch * 0.60
        const gA = (0.18 + gridPulse * 0.55)
        for (let i = 0; i < 18; i++) {
          const p = i / 17
          const y = vanY + (ch - vanY) * (p ** 1.4)
          ctx.strokeStyle = rgba(pal[0], gA * p * 2)
          ctx.lineWidth = 0.7 + p * 2.5
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke()
        }
        for (let i = 0; i <= 24; i++) {
          const x = (i / 24) * cw
          ctx.strokeStyle = rgba(pal[1], gA * 0.45)
          ctx.lineWidth = 0.6
          ctx.beginPath(); ctx.moveTo(x, ch); ctx.lineTo(cw / 2, vanY); ctx.stroke()
        }
      }

      // ─────────────────────────────────────
      // 2. WAVEFORM BARS (party mode only)
      // ─────────────────────────────────────
      if (party) {
        const vanY = ch * 0.60
        const maxH = vanY * 0.88
        const slotW = (cw * 0.8) / N
        const startX = cw * 0.1
        for (let i = 0; i < N; i++) {
          bh[i] += (bt[i] - bh[i]) * bs[i]
          if (playing) bh[i] += Math.sin(t * 5 + bphase[i]) * 0.006
          const h = Math.max(2, bh[i] * maxH)
          const x = startX + i * slotW
          const y = vanY - h
          const col = pal[Math.floor((i / N) * pal.length) % pal.length]
          const barAlpha = playing ? 1 : Math.max(0, bh[i] * 8)
          const g = ctx.createLinearGradient(0, y, 0, vanY)
          g.addColorStop(0, rgba(col, 0.92 * barAlpha))
          g.addColorStop(0.5, rgba(col, 0.5 * barAlpha))
          g.addColorStop(1, rgba(col, 0.02))
          ctx.save()
          ctx.shadowColor = col; ctx.shadowBlur = 10 + beat * 22
          ctx.fillStyle = g; ctx.fillRect(x, y, slotW - 2, h)
          ctx.fillStyle = rgba(col, barAlpha); ctx.shadowBlur = 20
          ctx.fillRect(x, y, slotW - 2, 3)
          ctx.restore()
        }
      }

      // ─────────────────────────────────────
      // 3. PULSING CIRCLES (party mode only)
      // ─────────────────────────────────────
      if (party) {
        for (let i = circles.length - 1; i >= 0; i--) {
          const c = circles[i]
          c.r += playing ? c.spd : c.spd * 0.3
          c.a -= playing ? 0.013 : 0.06
          if (c.a <= 0 || c.r > c.max) { circles.splice(i, 1); continue }
          ctx.save()
          ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
          ctx.strokeStyle = rgba(c.c, c.a)
          ctx.lineWidth = 2.5 + beat * 5
          ctx.shadowColor = c.c; ctx.shadowBlur = 22 + beat * 22
          ctx.stroke(); ctx.restore()
        }
      }

      // ─────────────────────────────────────
      // 4. PARTICLES (always float gently)
      // ─────────────────────────────────────
      for (const p of particles) {
        // particles always move — this is the one thing that stays alive
        p.life += 0.01
        if (p.life >= p.max) { resetP(p); continue }
        p.x += p.vx
        p.y += p.vy
        p.vx += rnd(-0.01, 0.01)

        const lr = p.life / p.max
        const alpha = Math.sin(lr * Math.PI) * p.a * (party ? fa : 1)
        ctx.save(); ctx.globalAlpha = alpha
        ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 10
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }

      // ─────────────────────────────────────
      // 5. BEAT FLASH
      // ─────────────────────────────────────
      if (party && beat > 0.55 && playing) {
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
