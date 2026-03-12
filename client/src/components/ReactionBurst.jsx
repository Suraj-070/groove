import { useState, useEffect, useRef, useCallback } from 'react'
import EmojiPicker from './EmojiPicker'

const SPAM_LIMIT = 4
const SPAM_WINDOW = 1000
const QUICK_EMOJIS = ['🔥','💯','🎵','❤️','😂','👏','🚀','✨','💀','🤩']

export default function ReactionBurst({ socket, roomId, username }) {
  const [bursts, setBursts] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [recentEmojis, setRecentEmojis] = useState([])
  const spamCountRef = useRef(0)
  const spamTimerRef = useRef(null)
  const spamIntervalRef = useRef(null)
  const pickerRef = useRef(null)

  useEffect(() => {
    socket.on('reaction', ({ emoji, username: from }) => spawnBurst(emoji, from, false))
    return () => socket.off('reaction')
  }, [socket])

  const spawnBurst = useCallback((emoji, from, isSelf) => {
    const id = Date.now() + Math.random()
    const x = 5 + Math.random() * 90
    const size = 1.2 + Math.random() * 1.0
    const duration = 2200 + Math.random() * 800
    setBursts(prev => [...prev, { id, emoji, from, x, size, duration, isSelf }])
    setTimeout(() => setBursts(prev => prev.filter(b => b.id !== id)), duration + 300)
  }, [])

  const sendReaction = useCallback((emoji) => {
    spamCountRef.current++
    if (!spamTimerRef.current) {
      spamTimerRef.current = setTimeout(() => { spamCountRef.current = 0; spamTimerRef.current = null }, SPAM_WINDOW)
    }
    if (spamCountRef.current > SPAM_LIMIT) return
    spawnBurst(emoji, username, true)
    socket.emit('reaction', { roomId, emoji, username })
    setRecentEmojis(prev => [emoji, ...prev.filter(e => e !== emoji)].slice(0, 8))
  }, [socket, roomId, username, spawnBurst])

  const holdTimerRef = useRef(null)
  const isHoldingRef = useRef(false)

  const startHold = (emoji) => {
    isHoldingRef.current = false
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true
      spamIntervalRef.current = setInterval(() => sendReaction(emoji), 200)
    }, 300) // 300ms delay before spam kicks in
  }

  const stopHold = () => {
    clearTimeout(holdTimerRef.current)
    clearInterval(spamIntervalRef.current)
    holdTimerRef.current = null
    spamIntervalRef.current = null
  }

  const handleEmojiClick = (emoji) => {
    if (!isHoldingRef.current) sendReaction(emoji)
    isHoldingRef.current = false
    stopHold()
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

      <div className="reaction-trigger" ref={pickerRef}>
        <button className={`react-btn ${showPicker ? 'active' : ''}`}
          onClick={() => setShowPicker(p => !p)} title="Send reactions">
          <span>🎉</span>
        </button>

        {showPicker && (
          <div className="reaction-picker-wrap">
            <div className="quick-emoji-bar">
              <span className="quick-label">⚡ Hold to spam</span>
              <div className="quick-emoji-row">
                {quickEmojis.map((emoji, i) => (
                  <button key={i} className="reaction-emoji-btn"
                    onClick={() => handleEmojiClick(emoji)}
                    onMouseDown={() => startHold(emoji)}
                    onMouseUp={() => handleEmojiClick(emoji)}
                    onMouseLeave={stopHold}
                    onTouchStart={(e) => { e.preventDefault(); startHold(emoji) }}
                    onTouchEnd={(e) => { e.preventDefault(); handleEmojiClick(emoji) }}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <EmojiPicker onSelect={(emoji) => sendReaction(emoji)} onClose={() => setShowPicker(false)} />
          </div>
        )}
      </div>
    </>
  )
}
