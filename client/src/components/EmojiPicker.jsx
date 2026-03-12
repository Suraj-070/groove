// Standalone emoji picker — no external dependencies
import { useState, useEffect, useRef } from 'react'

const EMOJI_CATEGORIES = [
  { label: '😀', name: 'Faces', emojis: ['😀','😂','🥹','😍','🤩','😎','🥳','😭','😤','🤯','😱','🤣','😅','🫶','😌','🥺','😏','😒','😔','🤔','😶','🙄','😬','🤐','😴','🤤','🥴','😵','🤠','🤡'] },
  { label: '👍', name: 'Gestures', emojis: ['👍','👎','👏','🙌','🤝','🫵','☝️','✌️','🤞','🤟','🤘','💪','🦾','🙏','👋','🤙','💅','🫶','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞'] },
  { label: '🔥', name: 'Symbols', emojis: ['🔥','💯','✨','⭐','🌟','💫','⚡','💥','🎉','🎊','🎵','🎶','🎸','🥁','🎹','🎺','🎻','🎤','🎧','🎼','🎮','🕹️','🎲','🃏','♟️','🎯','🏆','🥇','🎖️','🏅'] },
  { label: '😂', name: 'Reactions', emojis: ['💀','👻','👽','🤖','🎃','💩','🙈','🙉','🙊','🐵','🐶','🐱','🐭','🐹','🦊','🐻','🐼','🐨','🐯','🦁','🐸','🐧','🐦','🦆','🦉','🦇','🐺','🦄','🐉','🔮'] },
  { label: '🍕', name: 'Food', emojis: ['🍕','🍔','🌮','🌯','🍜','🍣','🍱','🍛','🍝','🥗','🍿','🧃','☕','🍺','🍻','🥤','🧋','🍰','🎂','🍩','🍪','🍫','🍬','🍭','🍦','🥐','🥨','🥞','🧇','🥓'] },
  { label: '🌊', name: 'Nature', emojis: ['🌊','🔥','🌈','⛈️','🌙','☀️','🌸','🌺','🌻','🍀','🌴','🌵','🍄','🌾','🍁','🍂','🌍','🌏','🏔️','🗻','🌋','🏖️','🏜️','🌅','🌄','🌠','🌌','🌃','🏙️','🌉'] },
]

export default function EmojiPicker({ onSelect, onClose }) {
  const [tab, setTab] = useState(0)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis)
  const searchResults = search
    ? allEmojis.filter((_, i) => {
        // Simple search by index label — just show all when searching
        return true
      }).filter(e => e.includes(search))
    : null

  const displayed = searchResults || EMOJI_CATEGORIES[tab].emojis

  return (
    <div className="ep-picker" ref={ref}>
      {/* Search */}
      <div className="ep-search-wrap">
        <input
          className="ep-search"
          placeholder="Search emoji..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        {search && <button className="ep-search-clear" onClick={() => setSearch('')}>×</button>}
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="ep-tabs">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={i}
              className={`ep-tab ${tab === i ? 'active' : ''}`}
              onClick={() => setTab(i)}
              title={cat.name}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="ep-grid">
        {displayed.map((emoji, i) => (
          <button key={i} className="ep-emoji-btn" onClick={() => onSelect(emoji)}>
            {emoji}
          </button>
        ))}
        {displayed.length === 0 && <p className="ep-no-results">No results</p>}
      </div>
    </div>
  )
}
