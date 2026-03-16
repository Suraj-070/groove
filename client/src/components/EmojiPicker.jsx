import { useState, useEffect, useRef } from 'react'

const EMOJI_CATEGORIES = [
  { label: '🔥', name: 'Popular', emojis: ['🔥','💯','❤️','😂','😍','👏','🎵','✨','💀','🤩','😭','🥳','😎','🤯','💪','🙌','👑','🌊','⚡','🎉'] },
  { label: '😀', name: 'Faces',   emojis: ['😀','😂','🥹','😍','🤩','😎','🥳','😭','😤','🤯','😱','🤣','😅','😌','🥺','😏','😒','😔','🤔','😬','🙄','😴','🤤','🥴','😵','🤠','🤡','😶','🫶','💫'] },
  { label: '👍', name: 'Hands',   emojis: ['👍','👎','👏','🙌','🤝','✌️','🤞','🤟','🤘','💪','🙏','👋','🤙','💅','🫶','❤️','🧡','💛','💚','💙','💜','🖤','💔','💕','💞','💯','🔥','✨','⭐','🌟'] },
  { label: '🎵', name: 'Music',   emojis: ['🎵','🎶','🎸','🥁','🎹','🎺','🎻','🎤','🎧','🎼','🎙️','🎚️','🎛️','📻','🔊','🔉','🔈','🔇','🎷','🪗','🪘','🎺','🥁','🪕','🎻','🎸','🎹','🎤','🎧','🎵'] },
  { label: '🌊', name: 'Vibes',   emojis: ['🌊','🌈','🌙','☀️','⚡','💥','🎉','🎊','🏆','🥇','🎯','💎','👽','🤖','👻','💩','🙈','🦄','🐉','🔮','🌸','🌺','🍀','🌴','🌵','🍄','🌍','🏔️','🌅','🌌'] },
]

export default function EmojiPicker({ onSelect, onClose }) {
  const [tab, setTab] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
    }
  }, [onClose])

  return (
    <div className="ep-picker" ref={ref}>
      {/* Category tabs only — no search */}
      <div className="ep-tabs">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={i}
            className={`ep-tab ${tab === i ? 'active' : ''}`}
            onClick={() => setTab(i)}
            onTouchEnd={(e) => { e.preventDefault(); setTab(i) }}
            title={cat.name}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="ep-grid">
        {EMOJI_CATEGORIES[tab].emojis.map((emoji, i) => (
          <button
            key={i}
            className="ep-emoji-btn"
            onClick={() => onSelect(emoji)}
            onTouchEnd={(e) => { e.preventDefault(); onSelect(emoji) }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}