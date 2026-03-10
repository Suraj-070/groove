import { useState, useEffect, useRef } from 'react'

const EMOJIS = [
  '😀','😂','🥹','😍','🤩','😎','🥳','😭','😤','🤯',
  '👍','👎','❤️','🔥','💯','✨','🎵','🎶','🎸','🥁',
  '🎉','🎊','💃','🕺','👏','🙌','💀','😱','🤣','😅',
  '🫶','💜','🖤','⚡','🌊','🍕','🧃','☕','🍻','🎮',
]

function spawnBurst(setBursts, emoji, from) {
  const id = Date.now() + Math.random()
  const x = 10 + Math.random() * 80
  setBursts((prev) => [...prev, { id, emoji, from, x }])
  setTimeout(() => {
    setBursts((prev) => prev.filter((b) => b.id !== id))
  }, 2800)
}

export default function ReactionBurst({ socket, roomId, username }) {
  const [bursts, setBursts] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => {
    socket.on('reaction', ({ emoji, username: from }) => {
      spawnBurst(setBursts, emoji, from)
    })
    return () => socket.off('reaction')
  }, [socket])

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
      }
    }
    if (showPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const handleEmojiSelect = (emoji) => {
    setShowPicker(false)
    spawnBurst(setBursts, emoji, username)
    socket.emit('reaction', { roomId, emoji, username })
  }

  return (
    <>
      <div className="burst-overlay">
        {bursts.map((burst) => (
          <div key={burst.id} className="burst-item" style={{ left: `${burst.x}%` }}>
            <span className="burst-emoji">{burst.emoji}</span>
            <span className="burst-name">{burst.from}</span>
          </div>
        ))}
      </div>

      <div className="reaction-trigger" ref={pickerRef}>
        <button
          className="react-btn"
          onClick={() => setShowPicker((p) => !p)}
          title="Send a reaction"
        >
          <span>☺️</span>
        </button>

        {showPicker && (
          <div className="reaction-picker-wrap">
            <div className="emoji-grid">
              {EMOJIS.map((emoji) => (
                <button key={emoji} className="emoji-btn" onClick={() => handleEmojiSelect(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}