import { useState, useEffect } from 'react'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'

export default function ReactionBurst({ socket, roomId, username }) {
  const [bursts, setBursts] = useState([])
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    socket.on('reaction', ({ emoji, username: from }) => {
      spawnBurst(emoji, from)
    })
    return () => socket.off('reaction')
  }, [socket])

  const spawnBurst = (emoji, from) => {
    const id = Date.now() + Math.random()
    const x = 10 + Math.random() * 80 // random horizontal %
    setBursts((prev) => [...prev, { id, emoji, from, x }])
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id))
    }, 2800)
  }

  const handleEmojiSelect = (emoji) => {
    setShowPicker(false)
    spawnBurst(emoji.native, username)
    socket.emit('reaction', { roomId, emoji: emoji.native, username })
  }

  return (
    <>
      {/* Flying bursts overlay */}
      <div className="burst-overlay">
        {bursts.map((burst) => (
          <div
            key={burst.id}
            className="burst-item"
            style={{ left: `${burst.x}%` }}
          >
            <span className="burst-emoji">{burst.emoji}</span>
            <span className="burst-name">{burst.from}</span>
          </div>
        ))}
      </div>

      {/* Reaction trigger button */}
      <div className="reaction-trigger">
        <button
          className="react-btn"
          onClick={() => setShowPicker((p) => !p)}
          title="Send a reaction"
        >
          <span>☺️</span>
        </button>

        {showPicker && (
          <div className="reaction-picker-wrap">
            <Picker
              data={data}
              onEmojiSelect={handleEmojiSelect}
              theme="dark"
              previewPosition="none"
              skinTonePosition="none"
            />
          </div>
        )}
      </div>
    </>
  )
}