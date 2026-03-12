import { useState, useEffect, useRef, useCallback } from 'react'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

// Spam throttle — max 4 per second
const SPAM_LIMIT = 4
const SPAM_WINDOW = 1000

// Quick-access emojis shown above picker
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
    socket.on('reaction', ({ emoji, username: from }) => {
      spawnBurst(emoji, from, false)
    })
    return () => socket.off('reaction')
  }, [socket])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target))
        setShowPicker(false)
    }
    if (showPicker) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPicker])

  const spawnBurst = useCallback((emoji, from, isSelf) => {
    const id = Date.now() + Math.random()
    const x = 5 + Math.random() * 90
    const size = 1.2 + Math.random() * 1.0
    const duration = 2200 + Math.random() * 800
    setBursts(prev => [...prev, { id, emoji, from, x, size, duration, isSelf }])
    setTimeout(() => setBursts(prev => prev.filter(b => b.id !== id)), duration + 300)
  }, [])

  const sendReaction = useCallback((emoji) => {
    // Spam throttle
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

  // Hold to spam
  const startSpam = (emoji) => {
    sendReaction(emoji)
    spamIntervalRef.current = setInterval(() => sendReaction(emoji), 280)
  }
  const stopSpam = () => clearInterval(spamIntervalRef.current)

  // emoji-mart returns { native } for the emoji
  const handlePickerSelect = (emojiObj) => {
    sendReaction(emojiObj.native)
    // Don't close picker so user can spam easily
  }

  const quickEmojis = recentEmojis.length > 0 ? recentEmojis : QUICK_EMOJIS

  return (
    <>
      {/* Flying bursts overlay */}
      <div className="burst-overlay">
        {bursts.map((burst) => (
          <div
            key={burst.id}
            className={`burst-item ${burst.isSelf ? 'burst-self' : ''}`}
            style={{
              left: `${burst.x}%`,
              fontSize: `${burst.size}rem`,
              animationDuration: `${burst.duration}ms`,
            }}
          >
            <span className="burst-emoji">{burst.emoji}</span>
            <span className="burst-name">{burst.from}</span>
          </div>
        ))}
      </div>

      {/* Reaction trigger */}
      <div className="reaction-trigger" ref={pickerRef}>
        <button
          className={`react-btn ${showPicker ? 'active' : ''}`}
          onClick={() => setShowPicker(p => !p)}
          title="Send reactions"
        >
          <span>🎉</span>
        </button>

        {showPicker && (
          <div className="reaction-picker-wrap">
            {/* Quick-access row — hold to spam */}
            <div className="quick-emoji-bar">
              <span className="quick-label">⚡ Hold to spam</span>
              <div className="quick-emoji-row">
                {quickEmojis.map((emoji, i) => (
                  <button
                    key={i}
                    className="reaction-emoji-btn"
                    onClick={() => sendReaction(emoji)}
                    onMouseDown={() => startSpam(emoji)}
                    onMouseUp={stopSpam}
                    onMouseLeave={stopSpam}
                    onTouchStart={(e) => { e.preventDefault(); startSpam(emoji) }}
                    onTouchEnd={stopSpam}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Full emoji-mart picker */}
            <Picker
              data={data}
              onEmojiSelect={handlePickerSelect}
              theme="dark"
              previewPosition="none"
              skinTonePosition="search"
              searchPosition="sticky"
              navPosition="bottom"
              perLine={8}
              emojiSize={22}
              emojiButtonSize={34}
            />
          </div>
        )}
      </div>
    </>
  )
}
