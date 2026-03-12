import { useState, useEffect, useRef } from 'react'

const EMOJI_CATEGORIES = [
  { label: '😀', name: 'Faces', emojis: ['😀','😂','🥹','😍','🤩','😎','🥳','😭','😤','🤯','😱','🤣','😅','🫶','😌','🥺','😏','😒','😔','🤔','😶','🙄','😬','🤐','😴','🤤','🥴','😵','🤠','🤡'] },
  { label: '👍', name: 'Gestures', emojis: ['👍','👎','👏','🙌','🤝','✌️','🤞','🤟','🤘','💪','🦾','🙏','👋','🤙','💅','🫶','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞'] },
  { label: '🔥', name: 'Symbols', emojis: ['🔥','💯','✨','⭐','🌟','💫','⚡','💥','🎉','🎊','🎵','🎶','🎸','🥁','🎹','🎺','🎻','🎤','🎧','🎼','🎮','🕹️','🎲','🃏','🎯','🏆','🥇','🎖️','🏅'] },
  { label: '🐶', name: 'Animals', emojis: ['💀','👻','👽','🤖','🎃','💩','🙈','🙉','🙊','🐵','🐶','🐱','🐭','🐹','🦊','🐻','🐼','🐨','🐯','🦁','🐸','🐧','🐦','🦆','🦉','🦇','🐺','🦄','🐉','🔮'] },
  { label: '🍕', name: 'Food', emojis: ['🍕','🍔','🌮','🌯','🍜','🍣','🍱','🍛','🍝','🥗','🍿','🧃','☕','🍺','🍻','🥤','🧋','🍰','🎂','🍩','🍪','🍫','🍬','🍭','🍦','🥐','🥨','🥞','🧇','🥓'] },
  { label: '🌊', name: 'Nature', emojis: ['🌊','🌈','🌙','☀️','🌸','🌺','🌻','🍀','🌴','🌵','🍄','🌾','🍁','🍂','🌍','🌏','🏔️','🗻','🌋','🏖️','🏜️','🌅','🌄','🌠','🌌','🌃','🏙️','🌉'] },
]

const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap(c => c.emojis)

export default function EmojiPicker({ onSelect, onClose }) {
  const [tab, setTab] = useState(0)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Safe display — always an array, never null
  const displayed = search.trim()
    ? ALL_EMOJIS.filter(e => {
        // Search by name via codepoint — fallback to showing all
        try { return e.codePointAt(0).toString(16).includes(search) } catch { return true }
      }).slice(0, 48)
    : (EMOJI_CATEGORIES[tab]?.emojis ?? EMOJI_CATEGORIES[0].emojis)

  return (
    <div className="ep-picker" ref={ref}>
      <div className="ep-search-wrap">
        <input
          className="ep-search"
          placeholder="Search emoji..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        {search && (
          <button className="ep-search-clear" onClick={() => setSearch('')}>×</button>
        )}
      </div>

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

      <div className="ep-grid">
        {displayed.length === 0
          ? <p className="ep-no-results">No results</p>
          : displayed.map((emoji, i) => (
              <button
                key={i}
                className="ep-emoji-btn"
                onClick={() => onSelect(emoji)}
              >
                {emoji}
              </button>
            ))
        }
      </div>
    </div>
  )
}
