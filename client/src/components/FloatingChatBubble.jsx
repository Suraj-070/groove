import { useState, useRef, useEffect, useCallback } from 'react'

export default function FloatingChatBubble({ 
  user, unread, chatOpen, onToggle, lastMessage 
}) {
  // Start bottom-right above nav bar
  const [pos, setPos]         = useState({ x: window.innerWidth - 70, y: window.innerHeight - 160 })
  const [dragging, setDragging] = useState(false)
  const [didDrag, setDidDrag]   = useState(false)
  const [docked, setDocked]     = useState('right') // 'left' | 'right'
  const [bouncing, setBouncing] = useState(false)

  const posRef      = useRef(pos)
  const dragStart   = useRef(null)
  const bubbleRef   = useRef(null)
  const SIZE        = 52

  // Snap to nearest edge when drag ends
  const snapToEdge = useCallback((x, y) => {
    const midX = window.innerWidth / 2
    const snappedX = x < midX
      ? 10
      : window.innerWidth - SIZE - 10
    const clampedY = Math.max(80, Math.min(window.innerHeight - SIZE - 80, y))
    setDocked(snappedX < midX ? 'left' : 'right')
    return { x: snappedX, y: clampedY }
  }, [])

  // Pointer events for drag
  const onPointerDown = (e) => {
    e.preventDefault()
    dragStart.current = {
      px: e.clientX, py: e.clientY,
      bx: posRef.current.x, by: posRef.current.y,
    }
    setDragging(true)
    setDidDrag(false)
    bubbleRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = useCallback((e) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.px
    const dy = e.clientY - dragStart.current.py
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) setDidDrag(true)
    const nx = dragStart.current.bx + dx
    const ny = dragStart.current.by + dy
    const clamped = {
      x: Math.max(0, Math.min(window.innerWidth - SIZE, nx)),
      y: Math.max(80, Math.min(window.innerHeight - SIZE - 64, ny)),
    }
    posRef.current = clamped
    setPos(clamped)
  }, [])

  const onPointerUp = useCallback((e) => {
    if (!dragStart.current) return
    const wasDrag = didDrag
    dragStart.current = null
    setDragging(false)
    if (wasDrag) {
      // Snap to edge
      const snapped = snapToEdge(posRef.current.x, posRef.current.y)
      posRef.current = snapped
      setPos(snapped)
      // Bounce animation
      setBouncing(true)
      setTimeout(() => setBouncing(false), 400)
    } else {
      // It was a tap — toggle chat
      onToggle()
    }
  }, [didDrag, snapToEdge, onToggle])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  // Pulse when new message arrives
  const [pulse, setPulse] = useState(false)
  const prevUnread = useRef(unread)
  useEffect(() => {
    if (unread > prevUnread.current && !chatOpen) {
      setPulse(true)
      setTimeout(() => setPulse(false), 600)
    }
    prevUnread.current = unread
  }, [unread, chatOpen])

  return (
    <div
      ref={bubbleRef}
      className={`fcb-bubble ${chatOpen ? 'fcb-open' : ''} ${dragging ? 'fcb-dragging' : ''} ${bouncing ? 'fcb-bounce' : ''} ${pulse ? 'fcb-pulse' : ''}`}
      style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
      onPointerDown={onPointerDown}
    >
      {/* Chat icon button */}
      <div className="fcb-icon">
        {chatOpen
          ? <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          : <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
            </svg>
        }
        {/* Unread badge */}
        {unread > 0 && !chatOpen && (
          <span className="fcb-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </div>

      {/* Last message preview — shows briefly when not open */}
      {!chatOpen && lastMessage && (
        <div className={`fcb-preview fcb-preview--${docked}`}>
          <span className="fcb-preview-name">{lastMessage.username}</span>
          <span className="fcb-preview-text">{lastMessage.text?.slice(0,28)}{lastMessage.text?.length > 28 ? '…' : ''}</span>
        </div>
      )}


    </div>
  )
}