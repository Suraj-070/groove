import { useEffect, useRef } from 'react'
import data from '@emoji-mart/data'
import { Picker } from '@emoji-mart/react'

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
    <div ref={ref} className="ep-wrapper">
      <Picker
        data={data}
        onEmojiSelect={(e) => onSelect(e.native)}
        theme="dark"
        set="native"
        showPreview={false}
        showSkinTones={true}
        emojiSize={22}
        emojiButtonSize={32}
        maxFrequentRows={2}
        locale="en"
        previewPosition="none"
        skinTonePosition="search"
        navPosition="bottom"
        perLine={9}
      />
    </div>
  )
}
