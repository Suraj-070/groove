import { useEffect, useRef } from 'react'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 768

export default function EmojiPicker({ onSelect, onClose, height }) {
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

  const pickerHeight = height || (IS_MOBILE ? Math.floor(window.innerHeight * 0.55) : 380)

  return (
    <div ref={ref}>
      <Picker
        data={data}
        onEmojiSelect={(e) => onSelect(e.native)}
        theme="dark"
        set="native"
        previewPosition="none"
        skinTonePosition="none"
        navPosition="bottom"
        perLine={IS_MOBILE ? 8 : 9}
        emojiSize={22}
        emojiButtonSize={34}
        maxFrequentRows={1}
        autoFocus={false}
        searchPosition={IS_MOBILE ? 'none' : 'sticky'}
        height={pickerHeight}
      />
    </div>
  )
}