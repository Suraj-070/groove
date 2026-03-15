import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ── Draggable floating video panel ───────────────────────────
// Completely separate from the Player — no interference with
// audio controls or sync. Opens via a button in the app header.
// Draggable by the title bar. Resizable via corner handle.
// Remembers position between open/close within the session.

const MIN_W = 280
const MIN_H = 180
const DEFAULT_W = 400
const DEFAULT_H = 248  // 16:9 content + 36px title bar

export default function VideoPanel({ videoId, title, isOpen, onClose }) {
  const [pos, setPos]   = useState(null) // { x, y } — null = center on first open
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H })
  const [minimized, setMinimized] = useState(false)

  const panelRef   = useRef(null)
  const dragRef    = useRef(null)  // { startX, startY, origX, origY }
  const resizeRef  = useRef(null)  // { startX, startY, origW, origH }

  // Center panel on first open
  useEffect(() => {
    if (isOpen && !pos) {
      setPos({
        x: Math.max(0, (window.innerWidth  - DEFAULT_W) / 2),
        y: Math.max(0, (window.innerHeight - DEFAULT_H) / 2 - 60),
      })
    }
  }, [isOpen, pos])

  // ── Drag ──────────────────────────────────────────────────
  const onDragStart = useCallback((e) => {
    e.preventDefault()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    dragRef.current = { startX: clientX, startY: clientY, origX: pos.x, origY: pos.y }

    const move = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY
      const dx = cx - dragRef.current.startX
      const dy = cy - dragRef.current.startY
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - size.w, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40,     dragRef.current.origY + dy)),
      })
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup',   up)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend',  up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup',   up)
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend',  up)
  }, [pos, size.w])

  // ── Resize (bottom-right corner) ──────────────────────────
  const onResizeStart = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    resizeRef.current = { startX: clientX, startY: clientY, origW: size.w, origH: size.h }

    const move = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY
      const dx = cx - resizeRef.current.startX
      const dy = cy - resizeRef.current.startY
      const newW = Math.max(MIN_W, resizeRef.current.origW + dx)
      const newH = Math.max(MIN_H, resizeRef.current.origH + dy)
      setSize({ w: newW, h: newH })
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup',   up)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend',  up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup',   up)
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend',  up)
  }, [size])

  if (!isOpen || !videoId || !pos) return null

  const videoH = minimized ? 0 : size.h - 36
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&controls=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`

  return createPortal(
    <div
      ref={panelRef}
      className={`video-panel ${minimized ? 'video-panel--mini' : ''}`}
      style={{
        left: pos.x,
        top:  pos.y,
        width: size.w,
        height: minimized ? 36 : size.h,
      }}
    >
      {/* Title bar — drag handle */}
      <div
        className="video-panel-bar"
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
      >
        <div className="video-panel-bar-left">
          <svg className="video-panel-icon" viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
            <path d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1 2-2V5c0-1-1-2-2-2zm0 16H3V5h18v14zM8 15l5-3-5-3v6z"/>
          </svg>
          <span className="video-panel-title">
            {title ? (title.length > 32 ? title.slice(0, 32) + '…' : title) : 'Video'}
          </span>
        </div>
        <div className="video-panel-bar-actions">
          <button
            className="video-panel-btn"
            onClick={() => setMinimized(p => !p)}
            title={minimized ? 'Expand' : 'Minimise'}
          >
            {minimized
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
            }
          </button>
          <button
            className="video-panel-btn video-panel-btn--close"
            onClick={onClose}
            title="Close"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Video iframe */}
      {!minimized && (
        <div className="video-panel-content" style={{ height: videoH }}>
          <iframe
            key={videoId}
            src={embedUrl}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={title || 'Video'}
            className="video-panel-iframe"
          />
        </div>
      )}

      {/* Resize handle */}
      {!minimized && (
        <div
          className="video-panel-resize"
          onMouseDown={onResizeStart}
          onTouchStart={onResizeStart}
        />
      )}
    </div>,
    document.body
  )
}
