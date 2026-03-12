import { useState, useEffect, useRef, useCallback } from 'react'

// Full emoji library organized by category
const EMOJI_CATEGORIES = {
  '🔥 Hype': ['🔥','💯','⚡','✨','🚀','💥','🎯','🏆','👑','💎','🎪','🌟','⭐','🎆','🎇'],
  '🎵 Music': ['🎵','🎶','🎸','🥁','🎹','🎺','🎻','🎼','🎤','🎧','🎷','🪗','🪘','🎙️','📻'],
  '💃 Vibe': ['💃','🕺','🙌','👏','🤸','🎉','🎊','🥳','🪩','🫶','❤️','💜','🖤','💙','💚'],
  '😂 React': ['😂','🤣','😭','😍','🤩','😎','🥹','😤','🤯','😱','🫠','😅','🥴','😈','👻'],
  '👍 Feels': ['👍','👎','❤️','💔','🫶','🤝','✌️','🤞','🤙','💪','🙏','👋','🤘','🫡','💅'],
  '🍕 Fun': ['🍕','🧃','☕','🍺','🍻','🎮','🕹️','🎲','🃏','🧸','🦄','🐸','🐧','🦊','🐺'],
]

const ALL_EMOJIS = Object.values(EMOJI_CATEGORIES).flat()

// Spam throttle — max 3 per second per user
const SPAM_LIMIT = 3
const SPAM_WINDOW = 1000

export default function ReactionBurst({ socket, roomId, username }) {
  const [bursts, setBursts] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [activeCategory, setActiveCategory] = useState('🔥 Hype')
  const [recentEmojis, setRecentEmojis] = useState([])
  const spamCountRef = useRef(0)
  const spamTimerRef = useRef(null)
  const pickerRef = useRef(null)

  useEffect(() => {
    socket.on('reaction', ({ emoji, username: from }) => {
      spawnBurst(emoji, from, false)
    })
    return () => socket.off('reaction')
  }, [socket])

  // Close picker on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
      }
    }
    if (showPicker) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPicker])

  const spawnBurst = useCallback((emoji, from, isSelf) => {
    const count = isSelf ? 1 : 1
    for (let i = 0; i < count; i++) {
      const id = Date.now() + Math.random()
      const x = 5 + Math.random() * 90
      const size = 1.2 + Math.random() * 1.2
      const duration = 2200 + Math.random() * 800
      const delay = i * 80

      setBursts(prev => [...prev, { id, emoji, from, x, size, duration, delay, isSelf }])
      setTimeout(() => {
        setBursts(prev => prev.filter(b => b.id !== id))
      }, duration + delay + 200)
    }
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

    // Track recently used
    setRecentEmojis(prev => {
      const filtered = prev.filter(e => e !== emoji)
      return [emoji, ...filtered].slice(0, 8)
    })
  }, [socket, roomId, username, spawnBurst])

  // Quick-spam: hold button
  const spamIntervalRef = useRef(null)
  const startSpam = (emoji) => {
    sendReaction(emoji)
    spamIntervalRef.current = setInterval(() => sendReaction(emoji), 350)
  }
  const stopSpam = () => {
    clearInterval(spamIntervalRef.current)
  }

  return (
    <>
      {/* Flying bursts overlay */}
      <div className="burst-overlay" style={{ pointerEvents: 'none' }}>
        {bursts.map((burst) => (
          <div
            key={burst.id}
            className={`burst-item ${burst.isSelf ? 'burst-self' : ''}`}
            style={{
              left: `${burst.x}%`,
              animationDuration: `${burst.duration}ms`,
              animationDelay: `${burst.delay}ms`,
              fontSize: `${burst.size}rem`,
            }}
          >
            <span className="burst-emoji">{burst.emoji}</span>
            <span className="burst-name">{burst.from}</span>
          </div>
        ))}
      </div>

      {/* Reaction panel */}
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
            {/* Recent emojis quick-bar */}
            {recentEmojis.length > 0 && (
              <div className="recent-emojis">
                <span className="emoji-cat-label">Recent</span>
                <div className="emoji-quick-row">
                  {recentEmojis.map((emoji, i) => (
                    <button
                      key={i}
                      className="reaction-emoji-btn"
                      onClick={() => sendReaction(emoji)}
                      onMouseDown={() => startSpam(emoji)}
                      onMouseUp={stopSpam}
                      onMouseLeave={stopSpam}
                      onTouchStart={() => startSpam(emoji)}
                      onTouchEnd={stopSpam}
                      title="Hold to spam!"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Category tabs */}
            <div className="emoji-category-tabs">
              {Object.keys(EMOJI_CATEGORIES).map(cat => (
                <button
                  key={cat}
                  className={`emoji-cat-tab ${activeCategory === cat ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* Emoji grid */}
            <div className="reaction-emoji-grid">
              {EMOJI_CATEGORIES[activeCategory].map((emoji, i) => (
                <button
                  key={i}
                  className="reaction-emoji-btn"
                  onClick={() => sendReaction(emoji)}
                  onMouseDown={() => startSpam(emoji)}
                  onMouseUp={stopSpam}
                  onMouseLeave={stopSpam}
                  onTouchStart={() => startSpam(emoji)}
                  onTouchEnd={stopSpam}
                  title="Hold to spam!"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <p className="spam-hint">💡 Hold any emoji to spam it!</p>
          </div>
        )}
      </div>
    </>
  )
}
