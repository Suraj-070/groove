import { useState, useEffect, useRef, useCallback } from 'react'
import EmojiPicker from './EmojiPicker'

const SPAM_LIMIT = 8
const SPAM_WINDOW = 2000
const QUICK_EMOJIS = ['🔥','💯','🎵','❤️','😂','👏','🚀','✨','💀','🤩']
const HOLD_DELAY = 400
const SPAM_INTERVAL = 200

export default function ReactionBurst({ socket, roomId, username }) {
  const [bursts, setBursts] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [recentEmojis, setRecentEmojis] = useState([])

  const spamCountRef    = useRef(0)
  const spamTimerRef    = useRef(null)
  const spamIntervalRef = useRef(null)
  const holdTimerRef    = useRef(null)
  const isHoldingRef    = useRef(false)
  const activeEmojiRef  = useRef(null)
  const sendReactionRef = useRef(null)

  // ── Burst cleanup: single interval instead of one setTimeout per burst ──
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setBursts(prev => {
        if (prev.length === 0) return prev
        const next = prev.filter(b => b.expiresAt > now)
        return next.length === prev.length ? prev : next
      })
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // ── Global pointer-up: stop spam no matter where pointer is released ──
  useEffect(() => {
    const stopAll = () => {
      clearTimeout(holdTimerRef.current)
      clearInterval(spamIntervalRef.current)
      holdTimerRef.current = null
      spamIntervalRef.current = null
      if (activeEmojiRef.current && !isHoldingRef.current) {
        sendReactionRef.current?.(activeEmojiRef.current)
      }
      isHoldingRef.current = false
      activeEmojiRef.current = null
    }
    document.addEventListener('mouseup', stopAll)
    document.addEventListener('touchend', stopAll)
    document.addEventListener('touchcancel', stopAll)
    return () => {
      document.removeEventListener('mouseup', stopAll)
      document.removeEventListener('touchend', stopAll)
      document.removeEventListener('touchcancel', stopAll)
    }
  }, [])

  // ── spawnBurst defined before socket effect so reference is valid ──
  const spawnBurst = useCallback((emoji, from, isSelf) => {
    const id = Date.now() + Math.random()
    const x = 5 + Math.random() * 90
    const size = 1.2 + Math.random() * 1.0
    const duration = 2200 + Math.random() * 800
    const expiresAt = Date.now() + duration + 300
    setBursts(prev => {
      const next = [...prev, { id, emoji, from, x, size, duration, isSelf, expiresAt }]
      return next.length > 12 ? next.slice(next.length - 12) : next
    })
  }, [])

  // ── Socket listener — spawnBurst is now defined above ──
  useEffect(() => {
    socket.on('reaction', ({ emoji, username: from }) => spawnBurst(emoji, from, false))
    return () => socket.off('reaction')
  }, [socket, spawnBurst])

  const sendReaction = useCallback((emoji) => {
    spamCountRef.current++
    if (!spamTimerRef.current) {
      spamTimerRef.current = setTimeout(() => {
        spamCountRef.current = 0
        spamTimerRef.current = null
      }, SPAM_WINDOW)
    }
    if (spamCountRef.current > SPAM_LIMIT) return
    spawnBurst(emoji, username, true)
    socket.emit('reaction', { roomId, emoji, username })
    setRecentEmojis(prev => [emoji, ...prev.filter(e => e !== emoji)].slice(0, 8))
  }, [socket, roomId, username, spawnBurst])

  // Keep ref in sync so stopAll can always call the latest sendReaction
  useEffect(() => { sendReactionRef.current = sendReaction }, [sendReaction])

  const startHold = (emoji) => {
    clearTimeout(holdTimerRef.current)
    clearInterval(spamIntervalRef.current)
    isHoldingRef.current = false
    activeEmojiRef.current = emoji
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true
      spamIntervalRef.current = setInterval(() => sendReactionRef.current(emoji), SPAM_INTERVAL)
    }, HOLD_DELAY)
  }

  const quickEmojis = recentEmojis.length > 0 ? recentEmojis : QUICK_EMOJIS

  return (
    <>
      <div className="burst-overlay">
        {bursts.map((burst) => (
          <div key={burst.id} className={`burst-item ${burst.isSelf ? 'burst-self' : ''}`}
            style={{ left: `${burst.x}%`, fontSize: `${burst.size}rem`, animationDuration: `${burst.duration}ms` }}>
            <span className="burst-emoji">{burst.emoji}</span>
            <span className="burst-name">{burst.from}</span>
          </div>
        ))}
      </div>

      <div className="reaction-trigger">
        <button className={`react-btn ${showPicker ? 'active' : ''}`}
          onClick={() => setShowPicker(p => !p)} title="Send reactions">
          <span>🎉</span>
        </button>

        {showPicker && (
          <div className="reaction-picker-wrap">
            {/* Hold-to-spam hint */}
            <div className="reaction-hold-hint">⚡ Tap once · Hold to spam</div>
            {/* Quick emojis — hold supported */}
            <div className="reaction-quick-row">
              {quickEmojis.map((emoji, i) => (
                <button
                  key={i}
                  className="reaction-quick-btn"
                  onMouseDown={(e) => { e.preventDefault(); startHold(emoji) }}
                  onTouchStart={(e) => { e.preventDefault(); startHold(emoji) }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {/* Full picker — category tabs + grid */}
            <EmojiPicker onSelect={sendReaction} onClose={() => setShowPicker(false)} />
          </div>
        )}
      </div>
    </>
  )
}