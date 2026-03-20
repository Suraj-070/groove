import { useEffect, useRef } from 'react'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 768

export default function EmojiPicker({ onSelect, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.()
    }
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('touchstart', handleClick)
    }, 100)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
    }
  }, [onClose])

  return (
    <div ref={ref} className="ep-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Picker
        data={data}
        onEmojiSelect={(e) => onSelect(e.native)}
        theme="dark"
        set="native"
        showPreview={false}
        showSkinTones={true}
        emojiSize={IS_MOBILE ? 20 : 22}
        emojiButtonSize={IS_MOBILE ? 30 : 32}
        maxFrequentRows={IS_MOBILE ? 1 : 2}
        locale="en"
        previewPosition="none"
        skinTonePosition="search"
        navPosition="bottom"
        perLine={IS_MOBILE ? 8 : 9}
        autoFocus={false}
        searchPosition={IS_MOBILE ? "none" : "sticky"}
      />
    </div>
  )
}