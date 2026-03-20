import { useState, useEffect, useRef, useCallback } from 'react'

const SPAM_LIMIT = 8
const SPAM_WINDOW = 2000
const QUICK_EMOJIS = ['🔥','💯','🎵','❤️','😂','👏','🚀','✨','💀','🤩','😭','🤣','👀','💜','🥹','🎉','😍','🤯','🫶','💥','🎶','😤','🙌','⚡','🫠','😈','🤘','💃','🕺','🎸']
const HOLD_DELAY = 400
const SPAM_INTERVAL = 200
const BTN_SIZE = 52
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 768

export default function ReactionBurst({ socket, roomId, username }) {
  const [bursts, setBursts]         = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [recentEmojis, setRecentEmojis] = useState([])

  // Mobile drag state
  const [btnPos, setBtnPos]         = useState({ x: 16, y: window.innerHeight - 160 })
  const [isDragging, setIsDragging] = useState(false)
  const [dockedSide, setDockedSide] = useState('left')

  const spamCountRef    = useRef(0)
  const spamTimerRef    = useRef(null)
  const spamIntervalRef = useRef(null)
  const holdTimerRef    = useRef(null)
  const isHoldingRef    = useRef(false)
  const sendReactionRef = useRef(null)
  const btnRef          = useRef(null)
  const dragStartRef    = useRef(null)
  const btnPosRef       = useRef({ x: 16, y: window.innerHeight - 160 })
  const didDragRef      = useRef(false)

  // ── Burst cleanup ──────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now()
      setBursts(prev => {
        if (!prev.length) return prev
        const next = prev.filter(b => b.expiresAt > now)
        return next.length === prev.length ? prev : next
      })
    }, 500)
    return () => clearInterval(iv)
  }, [])

  // ── Spawn burst ────────────────────────────────────────
  const spawnBurst = useCallback((emoji, from, isSelf) => {
    const id = Date.now() + Math.random()
    const x = 5 + Math.random() * 90
    const size = 1.2 + Math.random() * 1.0
    const duration = 2200 + Math.random() * 800
    setBursts(prev => {
      const next = [...prev, { id, emoji, from, x, size, duration, isSelf, expiresAt: Date.now() + duration + 300 }]
      return next.length > 12 ? next.slice(-12) : next
    })
  }, [])

  // ── Socket listener ────────────────────────────────────
  useEffect(() => {
    socket.on('reaction', ({ emoji, username: from }) => spawnBurst(emoji, from, false))
    return () => socket.off('reaction')
  }, [socket, spawnBurst])

  // ── Send reaction ──────────────────────────────────────
  const sendReaction = useCallback((emoji) => {
    spamCountRef.current++
    if (!spamTimerRef.current) {
      spamTimerRef.current = setTimeout(() => { spamCountRef.current = 0; spamTimerRef.current = null }, SPAM_WINDOW)
    }
    if (spamCountRef.current > SPAM_LIMIT) return
    spawnBurst(emoji, username, true)
    try { navigator.vibrate?.(8) } catch {}
    socket.emit('reaction', { roomId, emoji, username })
    setRecentEmojis(prev => [emoji, ...prev.filter(e => e !== emoji)].slice(0, 8))
  }, [socket, roomId, username, spawnBurst])

  useEffect(() => { sendReactionRef.current = sendReaction }, [sendReaction])

  // ── Hold to spam ───────────────────────────────────────
  const startHold = useCallback((emoji) => {
    clearTimeout(holdTimerRef.current)
    clearInterval(spamIntervalRef.current)
    isHoldingRef.current = false
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true
      spamIntervalRef.current = setInterval(() => sendReactionRef.current?.(emoji), SPAM_INTERVAL)
    }, HOLD_DELAY)
  }, [])

  const stopHold = useCallback((emoji, fire) => {
    clearTimeout(holdTimerRef.current)
    clearInterval(spamIntervalRef.current)
    const wasHolding = isHoldingRef.current
    isHoldingRef.current = false
    if (fire && !wasHolding && emoji) sendReactionRef.current?.(emoji)
  }, [])

  // ── Mobile drag ────────────────────────────────────────
  const snapToEdge = (x, y) => {
    const isLeft = x + BTN_SIZE / 2 < window.innerWidth / 2
    const snappedX = isLeft ? 16 : window.innerWidth - BTN_SIZE - 16
    const clampedY = Math.max(80, Math.min(window.innerHeight - BTN_SIZE - 80, y))
    setDockedSide(isLeft ? 'left' : 'right')
    return { x: snappedX, y: clampedY }
  }

  const onPointerDown = (e) => {
    if (!IS_MOBILE) return
    // Don't capture if tapping an emoji button inside picker
    if (e.target.closest('.rb-emoji-btn')) return
    e.stopPropagation()
    dragStartRef.current = { px: e.clientX, py: e.clientY, bx: btnPosRef.current.x, by: btnPosRef.current.y }
    didDragRef.current = false
    setIsDragging(false)
    btnRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (!dragStartRef.current) return
    const dx = e.clientX - dragStartRef.current.px
    const dy = e.clientY - dragStartRef.current.py
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      didDragRef.current = true
      setIsDragging(true)
      setShowPicker(false) // close picker while dragging
    }
    if (didDragRef.current) {
      const next = {
        x: Math.max(0, Math.min(window.innerWidth - BTN_SIZE, dragStartRef.current.bx + dx)),
        y: Math.max(80, Math.min(window.innerHeight - BTN_SIZE - 64, dragStartRef.current.by + dy))
      }
      btnPosRef.current = next
      setBtnPos({ ...next })
    }
  }

  const onPointerUp = (e) => {
    if (!dragStartRef.current) return
    const wasDrag = didDragRef.current
    dragStartRef.current = null
    didDragRef.current = false
    setIsDragging(false)
    if (wasDrag) {
      const snapped = snapToEdge(btnPosRef.current.x, btnPosRef.current.y)
      btnPosRef.current = snapped
      setBtnPos({ ...snapped })
    } else {
      setShowPicker(p => !p)
    }
  }

  const displayEmojis = recentEmojis.length > 0
    ? [...new Set([...recentEmojis, ...QUICK_EMOJIS])].slice(0, 30)
    : QUICK_EMOJIS

  // ── Desktop version ────────────────────────────────────
  if (!IS_MOBILE) {
    return (
      <>
        <BurstOverlay bursts={bursts} />
        <div className="reaction-trigger">
          <button
            className={`react-btn ${showPicker ? 'active' : ''}`}
            onClick={() => setShowPicker(p => !p)}
            title="Send reactions"
          >
            <span>😊</span>
          </button>
          {showPicker && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowPicker(false)} />
              <DesktopPicker
                emojis={displayEmojis}
                onSend={(e) => { sendReaction(e) }}
                startHold={startHold}
                stopHold={stopHold}
              />
            </>
          )}
        </div>
      </>
    )
  }

  // ── Mobile version — picker rendered at root level (not inside draggable) ──
  return (
    <>
      <BurstOverlay bursts={bursts} />

      {/* Emoji picker — rendered outside drag container so touches work */}
      {showPicker && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 298 }}
            onClick={() => setShowPicker(false)}
          />
          <MobilePicker
            emojis={displayEmojis}
            btnPos={btnPos}
            dockedSide={dockedSide}
            onSend={(e) => { sendReaction(e); setShowPicker(false) }}
            startHold={startHold}
            stopHold={stopHold}
          />
        </>
      )}

      {/* Draggable button */}
      <div
        ref={btnRef}
        style={{
          position: 'fixed',
          left: btnPos.x,
          top: btnPos.y,
          width: BTN_SIZE,
          height: BTN_SIZE,
          zIndex: 300,
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          className={`react-btn ${showPicker ? 'active' : ''}`}
          style={{
            width: BTN_SIZE,
            height: BTN_SIZE,
            borderRadius: '50%',
            background: showPicker
              ? 'linear-gradient(135deg, #ff6a8a, #ff2d78)'
              : 'linear-gradient(135deg, #7c6aff, #9b6aff)',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(124,106,255,0.5)',
            touchAction: 'none',
            pointerEvents: 'none', // let parent div handle events
          }}
        >
          <span style={{ pointerEvents: 'none' }}>{showPicker ? '✕' : '😊'}</span>
        </button>
      </div>
    </>
  )
}

// ── Burst overlay (shared) ──────────────────────────────
function BurstOverlay({ bursts }) {
  return (
    <div className="burst-overlay">
      {bursts.map((b) => (
        <div key={b.id} className={`burst-item ${b.isSelf ? 'burst-self' : ''}`}
          style={{ left: `${b.x}%`, fontSize: `${b.size}rem`, animationDuration: `${b.duration}ms` }}>
          <span className="burst-emoji">{b.emoji}</span>
          <span className="burst-name">{b.from}</span>
        </div>
      ))}
    </div>
  )
}

// ── Desktop picker ──────────────────────────────────────
function DesktopPicker({ emojis, onSend, startHold, stopHold }) {
  return (
    <div className="reaction-picker-wrap"
      style={{ position: 'absolute', bottom: BTN_SIZE + 8, left: '50%', transform: 'translateX(-50%)', zIndex: 300 }}>
      <div className="reaction-hold-hint">⚡ Tap once · Hold to spam</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, padding: '6px 8px' }}>
        {emojis.map((emoji, i) => (
          <button key={i}
            className="reaction-quick-btn rb-emoji-btn"
            style={{ fontSize: '1.3rem', padding: '5px 3px', textAlign: 'center' }}
            onMouseDown={(e) => { e.preventDefault(); startHold(emoji) }}
            onMouseUp={() => stopHold(emoji, true)}
            onMouseLeave={() => stopHold(null, false)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Mobile picker — fixed position, outside drag container ──
function MobilePicker({ emojis, btnPos, dockedSide, onSend, startHold, stopHold }) {
  const PICKER_W = 220
  const PICKER_H = 200

  // Calculate position above the button, clamped to screen
  const left = dockedSide === 'left'
    ? Math.min(btnPos.x, window.innerWidth - PICKER_W - 8)
    : Math.max(8, btnPos.x + BTN_SIZE - PICKER_W)
  const top = Math.max(8, btnPos.y - PICKER_H - 12)

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width: PICKER_W,
        background: '#1a1730',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        zIndex: 299,
        overflow: 'hidden',
        touchAction: 'auto',
      }}
      // Stop click from propagating to the backdrop
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: '6px 8px 3px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', fontWeight: 700, letterSpacing: '0.06em' }}>
        ⚡ TAP · HOLD TO SPAM
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, padding: '4px 6px 8px' }}>
        {emojis.map((emoji, i) => (
          <button
            key={i}
            className="rb-emoji-btn"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.35rem',
              padding: '6px 2px',
              cursor: 'pointer',
              lineHeight: 1,
              textAlign: 'center',
              borderRadius: 8,
              touchAction: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              startHold(emoji)
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              stopHold(emoji, true)
              onSend(emoji)
            }}
            onPointerCancel={() => stopHold(null, false)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}