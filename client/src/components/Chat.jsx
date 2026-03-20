import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react'
import EmojiPicker from './EmojiPicker'
import GifPicker from './GifPicker'

// ── Helpers ───────────────────────────────────────────────
const USER_COLORS = [
  '#5865f2','#57f287','#fee75c','#eb459e',
  '#ed4245','#00b0f4','#faa61a','#3ba55c',
  '#a78bfa','#f472b6','#34d399','#fb923c',
]
function userColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return USER_COLORS[Math.abs(h) % USER_COLORS.length]
}
function userInitial(name = '') {
  const clean = name.replace(/^[^a-zA-Z]+/, '')
  return (clean[0] || name[0] || '?').toUpperCase()
}
function formatTs(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function formatDateLabel(ts) {
  const d = new Date(ts), now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 768
function parseText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = []; let last = 0, m
  while ((m = urlRegex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) })
    parts.push({ type: 'url', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts.length ? parts : [{ type: 'text', value: text }]
}
function ytId(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}
const QUICK_EMOJIS = ['❤️','🔥','😂','😮','👏','💀','🎵','✨','🤩','🎉','💯','😭','🤣','👀','💜','🥹']

// ── Date Divider ──────────────────────────────────────────
const DateDivider = memo(({ ts }) => (
  <div className="ig-date-divider">
    <span>{formatDateLabel(ts)}</span>
  </div>
))

// ── System Message ────────────────────────────────────────
const SystemMsg = memo(({ msg }) => (
  <div className="ig-system"><span>{msg.text}</span></div>
))

// ── Now Playing ───────────────────────────────────────────
const NowPlayingMsg = memo(({ msg }) => (
  <div className="ig-np">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
    <span>{msg.text}</span>
  </div>
))

// ── Song Card ─────────────────────────────────────────────
const SongCard = memo(({ msg, onAddToQueue, isSelf }) => (
  <div className={`ig-song-card ${isSelf ? 'ig-song-card--self' : ''}`}>
    <img src={`https://img.youtube.com/vi/${msg.videoId}/mqdefault.jpg`} alt="" className="ig-song-thumb" loading="lazy" />
    <div className="ig-song-info">
      <p className="ig-song-title">{msg.text}</p>
      <p className="ig-song-by">Added by {msg.username}</p>
    </div>
    {onAddToQueue && (
      <button className="ig-song-add" onClick={() => onAddToQueue(msg)}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>
    )}
  </div>
))

// ── Reactions ─────────────────────────────────────────────
const Reactions = memo(({ reactions = {}, onReact, username, isSelf, recentEmojis = [] }) => {
  const [showAdd, setShowAdd] = useState(false)
  const entries = Object.entries(reactions).filter(([, v]) => v.count > 0)
  // Recent emojis first, then fill with QUICK_EMOJIS, deduplicated
  const pickerEmojis = [...new Set([...recentEmojis, ...QUICK_EMOJIS])].slice(0, 24)

  if (!entries.length) return null

  return (
    <div className={`ig-reactions ${isSelf ? 'ig-reactions--self' : ''}`} style={{ position: 'relative' }}>
      {entries.map(([emoji, { count, users }]) => (
        <button key={emoji}
          className={`ig-reaction ${users?.includes(username) ? 'ig-reaction--mine' : ''}`}
          onClick={() => onReact(emoji)}
          title={users?.join(', ')}>
          {emoji}<span>{count}</span>
        </button>
      ))}
      {/* + button to add more */}
      <button
        className="ig-reaction"
        onClick={() => setShowAdd(p => !p)}
        title="Add reaction"
        style={{ opacity: 0.6, fontSize: '0.8rem', padding: '2px 8px' }}
      >
        +
      </button>
      {showAdd && <ReactionAddPicker isSelf={isSelf} onReact={onReact} onClose={() => setShowAdd(false)} />}
    </div>
  )
})

// ── Reaction add picker — full emoji library ──
const ReactionAddPicker = memo(({ isSelf, onReact, onClose }) => (
  <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: isSelf ? 'auto' : 0, right: isSelf ? 0 : 'auto', zIndex: 50 }}>
    <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={onClose} />
    <EmojiPicker onSelect={(e) => { onReact(e); onClose() }} onClose={onClose} />
  </div>
))

// ── Reply Quote ───────────────────────────────────────────
const ReplyQuote = memo(({ reply, isSelf }) => {
  const color = userColor(reply.username)
  return (
    <div className={`ig-reply-quote ${isSelf ? 'ig-reply-quote--self' : ''}`}>
      <div className="ig-reply-bar" style={{ background: isSelf ? 'rgba(255,255,255,0.5)' : color }} />
      <div>
        <span className="ig-reply-name" style={{ color: isSelf ? 'rgba(255,255,255,0.8)' : color }}>{reply.username}</span>
        <span className="ig-reply-preview">{reply.text?.slice(0, 60) || 'GIF'}</span>
      </div>
    </div>
  )
})

// ── Quick React Picker ────────────────────────────────────
const QuickReact = memo(({ isSelf, onReact, onClose }) => (
  <div className={`ig-quick-react ${isSelf ? 'ig-quick-react--self' : ''}`}>
    {QUICK_EMOJIS.map(e => (
      <button key={e} onClick={() => { onReact(e); onClose() }}>{e}</button>
    ))}
  </div>
))

// ── Mobile Context Menu ───────────────────────────────────
const ContextMenu = memo(({ isSelf, onReact, onReply, onCopy, onEdit, onDelete, onPin, onClose, isGif, canPin }) => (
  <>
    <div className="ig-ctx-overlay" onClick={onClose} />
    <div className="ig-ctx-menu">
      <div className="ig-ctx-reactions">
        {QUICK_EMOJIS.map(e => (
          <button key={e} onClick={() => { onReact(e); onClose() }}>{e}</button>
        ))}
      </div>
      <button className="ig-ctx-btn" onClick={() => { onReply(); onClose() }}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
        Reply
      </button>
      {onEdit && (
        <button className="ig-ctx-btn" onClick={() => { onEdit(); onClose() }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          Edit
        </button>
      )}
      <button className="ig-ctx-btn" onClick={() => { onCopy(); onClose() }}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        {isGif ? 'Copy URL' : 'Copy'}
      </button>
      {canPin && (
        <button className="ig-ctx-btn" onClick={() => { onPin(); onClose() }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
          Pin message
        </button>
      )}
      {(isSelf || canPin) && (
        <button className="ig-ctx-btn" style={{ color: '#ff6a8a' }} onClick={() => { onDelete(); onClose() }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          Delete
        </button>
      )}
    </div>
  </>
))

// ── GIF Lightbox ──────────────────────────────────────────
const GifLightbox = memo(({ gif, onClose }) => (
  <div className="ig-lightbox" onClick={onClose}>
    <button className="ig-lightbox-close" onClick={onClose}>✕</button>
    <img src={gif} alt="GIF" className="ig-lightbox-img" onClick={e => e.stopPropagation()} />
  </div>
))

// ── Typing Indicator ──────────────────────────────────────
const TypingIndicator = memo(({ typers, avatarMap }) => {
  if (!typers.length) return null
  return (
    <div className="ig-typing">
      <div className="ig-typing-dots"><span /><span /><span /></div>
      <span className="ig-typing-text">
        {typers.slice(0, 2).join(', ')}{typers.length > 2 ? ` +${typers.length - 2}` : ''} typing…
      </span>
    </div>
  )
})

// ── Message Bubble ────────────────────────────────────────
const MessageBubble = memo(({
  msg, isSelf, avatarSrc, showAvatar, showName,
  onReact, onReply, onCopy, onEdit, onDelete, onPin,
  isEditing, editText, onEditChange, onEditSave, onEditCancel,
  username, isDJ, recentEmojis = [],
}) => {
  const color = userColor(msg.username)
  const [showQuick, setShowQuick] = useState(false)
  const [showCtx, setShowCtx] = useState(false)
  const longPressTimer = useRef(null)
  const touchStartPos = useRef(null)
  const swipeRef = useRef(null)
  const swipeStartX = useRef(null)
  const hoverLeaveTimer = useRef(null)

  const textParts = parseText(msg.text || '')
  const hasYt = textParts.some(p => p.type === 'url' && ytId(p.value))

  // Desktop hover — use a leave delay so moving into QuickReact doesn't close it
  const handleMouseEnter = () => {
    if (IS_MOBILE) return
    clearTimeout(hoverLeaveTimer.current)
    setShowQuick(true)
  }
  const handleMouseLeave = () => {
    if (IS_MOBILE) return
    hoverLeaveTimer.current = setTimeout(() => setShowQuick(false), 200)
  }
  const handleQuickMouseEnter = () => clearTimeout(hoverLeaveTimer.current)
  const handleQuickMouseLeave = () => {
    hoverLeaveTimer.current = setTimeout(() => setShowQuick(false), 150)
  }

  // Mobile long press — only cancel if moved MORE than 8px
  const onTouchStart = (e) => {
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    swipeStartX.current = e.touches[0].clientX
    longPressTimer.current = setTimeout(() => {
      setShowCtx(true)
      try { navigator.vibrate?.(15) } catch {}
    }, 500)
  }
  const onTouchMove = (e) => {
    if (!touchStartPos.current) return
    const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x)
    const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y)
    // Only cancel long press if moved significantly
    if (dx > 8 || dy > 8) clearTimeout(longPressTimer.current)
    // Swipe animation
    if (swipeStartX.current !== null) {
      const swipeDx = isSelf
        ? Math.max(0, swipeStartX.current - e.touches[0].clientX)
        : Math.max(0, e.touches[0].clientX - swipeStartX.current)
      if (swipeRef.current && swipeDx < 70)
        swipeRef.current.style.transform = `translateX(${isSelf ? -swipeDx * 0.35 : swipeDx * 0.35}px)`
    }
  }
  const onTouchEnd = (e) => {
    clearTimeout(longPressTimer.current)
    if (swipeStartX.current === null) return
    const dx = isSelf
      ? swipeStartX.current - e.changedTouches[0].clientX
      : e.changedTouches[0].clientX - swipeStartX.current
    if (dx > 55) { onReply(msg); try { navigator.vibrate?.(8) } catch {} }
    swipeStartX.current = null
    touchStartPos.current = null
    if (swipeRef.current) swipeRef.current.style.transform = ''
  }

  return (
    <div className={`ig-row ${isSelf ? 'ig-row--self' : 'ig-row--other'}`}>

      {/* Avatar — only for others */}
      {!isSelf && (
        <div className="ig-av-col">
          {showAvatar
            ? avatarSrc
              ? <img src={avatarSrc} alt="" className="ig-av ig-av--img" />
              : <div className="ig-av" style={{ background: color }}>{userInitial(msg.username)}</div>
            : <div className="ig-av-ghost" />
          }
        </div>
      )}

      <div className="ig-bubble-col" ref={swipeRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

        {/* Name — only for others, first in group */}
        {!isSelf && showName && (
          <span className="ig-name" style={{ color }}>{msg.username}</span>
        )}

        {/* Reply quote */}
        {msg.replyTo && <ReplyQuote reply={msg.replyTo} isSelf={isSelf} />}

        {/* Bubble wrapper — hover zone */}
        {isEditing ? (
          <div className="ig-edit-wrap">
            <input className="ig-edit-input" value={editText}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEditSave(); if (e.key === 'Escape') onEditCancel() }}
              autoFocus />
            <div className="ig-edit-hint">
              <button onClick={onEditCancel}>cancel</button>
              <span>·</span>
              <button onClick={onEditSave}>save</button>
            </div>
          </div>
        ) : (
          <div className="ig-bubble-hover-zone"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Action bar — emojis inline + action icons */}
            {showQuick && !IS_MOBILE && (
              <div
                className={`ig-action-bar ${isSelf ? 'ig-action-bar--self' : 'ig-action-bar--other'}`}
                onMouseEnter={handleQuickMouseEnter}
                onMouseLeave={handleQuickMouseLeave}
                style={{ display: 'flex', alignItems: 'center', gap: 2 }}
              >
                {/* Quick emoji buttons — shown inline in bar */}
                {(recentEmojis.length > 0 ? [...new Set([...recentEmojis, ...QUICK_EMOJIS])] : QUICK_EMOJIS).slice(0, 5).map(e => (
                  <button key={e}
                    className="ig-action-btn"
                    style={{ fontSize: '1rem', width: 28, height: 28 }}
                    title={e}
                    onClick={() => { onReact(msg.id, e); setShowQuick(true) }}>
                    {e}
                  </button>
                ))}
                {/* More emojis — smiley button like Discord */}
                <div style={{ position: 'relative' }}>
                  <button className="ig-action-btn"
                    title="More reactions"
                    style={{ opacity: 0.6 }}
                    onClick={() => setShowQuick(v => v === 'picker' ? true : 'picker')}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
                  </button>
                  {showQuick === 'picker' && (
                    <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: isSelf ? 'auto' : 0, right: isSelf ? 0 : 'auto', zIndex: 200 }}>
                      <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={() => setShowQuick(false)} />
                      <EmojiPicker
                        onSelect={(e) => { onReact(msg.id, e); setShowQuick(false) }}
                        onClose={() => setShowQuick(false)}
                      />
                    </div>
                  )}
                </div>
                {/* Divider */}
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px', flexShrink: 0 }} />
                {/* Reply */}
                <button className="ig-action-btn" title="Reply" onClick={() => onReply(msg)}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                </button>
                {/* Edit — own only */}
                {isSelf && (
                  <button className="ig-action-btn" title="Edit" onClick={() => onEdit(msg)}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  </button>
                )}
                {/* Pin — DJ only */}
                {isDJ && (
                  <button className="ig-action-btn" title="Pin" onClick={() => onPin(msg)}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                  </button>
                )}
                {/* Delete — own or DJ */}
                {(isSelf || isDJ) && (
                  <button className="ig-action-btn" title="Delete" onClick={() => onDelete(msg)}
                    style={{ color: '#ff6a8a' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  </button>
                )}
                {/* Copy */}
                <button className="ig-action-btn" title="Copy" onClick={onCopy}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </button>
              </div>
            )}

            <div className={`ig-bubble ${isSelf ? 'ig-bubble--self' : 'ig-bubble--other'}`}>
              <p className="ig-bubble-text">
                {textParts.map((p, i) =>
                  p.type === 'url'
                    ? <a key={i} href={p.value} target="_blank" rel="noopener noreferrer" className="ig-link">{p.value}</a>
                    : <span key={i} dangerouslySetInnerHTML={{ __html: p.value.replace(/@(\w+)/g, '<span class="ig-mention">@$1</span>') }} />
                )}
                {msg.edited && <span className="ig-edited"> (edited)</span>}
              </p>
            </div>
          </div>
        )}

        {/* YouTube preview */}
        {hasYt && !isEditing && textParts.filter(p => p.type === 'url' && ytId(p.value)).map((p, i) => {
          const vid = ytId(p.value)
          return (
            <div key={i} className={`ig-yt-preview ${isSelf ? 'ig-yt-preview--self' : ''}`}>
              <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="" />
            </div>
          )
        })}

        {/* Reactions */}
        <Reactions reactions={msg.reactions} onReact={e => onReact(msg.id, e)} username={username} isSelf={isSelf} recentEmojis={recentEmojis} />

        {/* Timestamp + status */}
        <div className={`ig-meta ${isSelf ? 'ig-meta--self' : ''}`}>
          <span className="ig-ts">{formatTs(msg.ts)}</span>
          {isSelf && (
            <span className={`ig-status ig-status--${msg.status || 'sent'}`}>
              {msg.status === 'read' ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>

      {/* Context menu */}
      {showCtx && (
        <ContextMenu
          isSelf={isSelf}
          canPin={isDJ}
          onReact={e => onReact(msg.id, e)}
          onReply={() => onReply(msg)}
          onCopy={() => { navigator.clipboard.writeText(msg.text || ''); setShowCtx(false) }}
          onEdit={isSelf ? () => onEdit(msg) : null}
          onPin={() => { onPin(msg); setShowCtx(false) }}
          onDelete={() => { onDelete(msg); setShowCtx(false) }}
          onClose={() => setShowCtx(false)}
        />
      )}
    </div>
  )
})

// ── GIF Bubble ────────────────────────────────────────────
const GifBubble = memo(({ msg, isSelf, avatarSrc, showAvatar, showName, onReact, onReply, onDelete, onPin, username, isDJ, recentEmojis = [] }) => {
  const color = userColor(msg.username)
  const [lightbox, setLightbox] = useState(false)
  const [showCtx, setShowCtx] = useState(false)
  const [showHover, setShowHover] = useState(false)
  const longPressTimer = useRef(null)
  const touchStartPos = useRef(null)
  const hoverLeaveTimer = useRef(null)

  const handleMouseEnter = () => { if (IS_MOBILE) return; clearTimeout(hoverLeaveTimer.current); setShowHover(true) }
  const handleMouseLeave = () => { if (IS_MOBILE) return; hoverLeaveTimer.current = setTimeout(() => setShowHover(false), 200) }
  const handleActionMouseEnter = () => clearTimeout(hoverLeaveTimer.current)
  const handleActionMouseLeave = () => { hoverLeaveTimer.current = setTimeout(() => setShowHover(false), 150) }

  const onTouchStart = (e) => {
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    longPressTimer.current = setTimeout(() => { setShowCtx(true); try { navigator.vibrate?.(12) } catch {} }, 500)
  }
  const onTouchMove = (e) => {
    if (!touchStartPos.current) return
    const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x)
    const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y)
    if (dx > 8 || dy > 8) clearTimeout(longPressTimer.current)
  }
  const onTouchEnd = () => { clearTimeout(longPressTimer.current); touchStartPos.current = null }

  // If gif URL missing (old messages saved wrong), show fallback text
  if (!msg.gif) {
    return (
      <div className={`ig-row ${isSelf ? 'ig-row--self' : 'ig-row--other'}`}>
        {!isSelf && (
          <div className="ig-av-col">
            {showAvatar
              ? avatarSrc
                ? <img src={avatarSrc} alt="" className="ig-av ig-av--img" />
                : <div className="ig-av" style={{ background: color }}>{userInitial(msg.username)}</div>
              : <div className="ig-av-ghost" />
            }
          </div>
        )}
        <div className="ig-bubble-col">
          {!isSelf && showName && <span className="ig-name" style={{ color }}>{msg.username}</span>}
          <div className={`ig-bubble ${isSelf ? 'ig-bubble--self' : 'ig-bubble--other'}`}>
            <p className="ig-bubble-text" style={{ opacity: 0.6, fontStyle: 'italic' }}>🎞 GIF unavailable</p>
          </div>
          <div className={`ig-meta ${isSelf ? 'ig-meta--self' : ''}`}>
            <span className="ig-ts">{formatTs(msg.ts)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {lightbox && <GifLightbox gif={msg.gif} onClose={() => setLightbox(false)} />}
      <div className={`ig-row ${isSelf ? 'ig-row--self' : 'ig-row--other'}`}>
        {!isSelf && (
          <div className="ig-av-col">
            {showAvatar
              ? avatarSrc
                ? <img src={avatarSrc} alt="" className="ig-av ig-av--img" />
                : <div className="ig-av" style={{ background: color }}>{userInitial(msg.username)}</div>
              : <div className="ig-av-ghost" />
            }
          </div>
        )}
        <div className="ig-bubble-col"
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        >
          {!isSelf && showName && <span className="ig-name" style={{ color }}>{msg.username}</span>}
          {msg.replyTo && <ReplyQuote reply={msg.replyTo} isSelf={isSelf} />}

          {/* Hover zone with action bar */}
          <div className="ig-bubble-hover-zone"
            onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
          >
            {showHover && !IS_MOBILE && (
              <div
                className={`ig-action-bar ${isSelf ? 'ig-action-bar--self' : 'ig-action-bar--other'}`}
                onMouseEnter={handleActionMouseEnter} onMouseLeave={handleActionMouseLeave}
              >
                {/* Quick emoji buttons inline */}
                {QUICK_EMOJIS.slice(0, 5).map(e => (
                  <button key={e}
                    className="ig-action-btn"
                    style={{ fontSize: '1rem', width: 28, height: 28 }}
                    onClick={() => { onReact(msg.id, e) }}>
                    {e}
                  </button>
                ))}
                {/* More emojis smiley button */}
                <div style={{ position: 'relative' }}>
                  <button className="ig-action-btn" title="More reactions"
                    style={{ opacity: 0.6 }}
                    onClick={() => setShowHover(v => v === 'picker' ? true : 'picker')}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
                  </button>
                  {showHover === 'picker' && (
                    <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: isSelf ? 'auto' : 0, right: isSelf ? 0 : 'auto', zIndex: 200 }}>
                      <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={() => setShowHover(false)} />
                      <EmojiPicker
                        onSelect={(e) => { onReact(msg.id, e); setShowHover(false) }}
                        onClose={() => setShowHover(false)}
                      />
                    </div>
                  )}
                </div>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px', flexShrink: 0 }} />
                <button className="ig-action-btn" title="Reply" onClick={() => onReply(msg)}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                </button>
                {isDJ && (
                  <button className="ig-action-btn" title="Pin" onClick={() => onPin(msg)}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                  </button>
                )}
                {(isSelf || isDJ) && (
                  <button className="ig-action-btn" title="Delete" onClick={() => onDelete(msg)}
                    style={{ color: '#ff6a8a' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  </button>
                )}
              </div>
            )}
            <div className={`ig-gif-wrap ${isSelf ? 'ig-gif-wrap--self' : ''}`} onClick={() => setLightbox(true)}>
              <img src={msg.gif} alt={msg.text || 'GIF'} className="ig-gif-img" loading="lazy" />
              <span className="ig-gif-badge">GIF</span>
            </div>
          </div>

          <Reactions reactions={msg.reactions} onReact={e => onReact(msg.id, e)} username={username} isSelf={isSelf} recentEmojis={recentEmojis} />
          <div className={`ig-meta ${isSelf ? 'ig-meta--self' : ''}`}>
            <span className="ig-ts">{formatTs(msg.ts)}</span>
            {isSelf && <span className={`ig-status ig-status--${msg.status || 'sent'}`}>{msg.status === 'read' ? '✓✓' : '✓'}</span>}
          </div>
        </div>
        {showCtx && (
          <ContextMenu isSelf={isSelf} canPin={isDJ}
            onReact={e => onReact(msg.id, e)}
            onReply={() => onReply(msg)}
            onCopy={() => { navigator.clipboard.writeText(msg.gif || ''); setShowCtx(false) }}
            onPin={() => onPin(msg)}
            onDelete={() => onDelete(msg)}
            onClose={() => setShowCtx(false)}
            isGif
          />
        )}
      </div>
    </>
  )
})

// ── Reply Banner ──────────────────────────────────────────
const ReplyBanner = memo(({ replyTo, onClear }) => {
  if (!replyTo) return null
  const color = userColor(replyTo.username)
  return (
    <div className="ig-reply-banner">
      <div className="ig-reply-banner-bar" style={{ background: color }} />
      <div className="ig-reply-banner-body">
        <span className="ig-reply-banner-name" style={{ color }}>{replyTo.username}</span>
        <span className="ig-reply-banner-text">{replyTo.text?.slice(0, 60) || 'GIF'}</span>
      </div>
      <button className="ig-reply-banner-x" onClick={onClear}>✕</button>
    </div>
  )
})

// ── Unread Divider ────────────────────────────────────────
const UnreadDivider = memo(() => (
  <div className="ig-unread-divider"><span>New Messages</span></div>
))

// ── Pinned Banner ─────────────────────────────────────────
const PinnedBanner = memo(({ msg, onDismiss, canPin }) => {
  if (!msg) return null
  return (
    <div className="ig-pinned">
      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M17 4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1H5v2h1v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h1V5h-2V4z"/></svg>
      <span className="ig-pinned-text">{msg.text?.slice(0, 50)}</span>
      {canPin && <button className="ig-pinned-close" onClick={onDismiss}>✕</button>}
    </div>
  )
})

// ── Main Chat ─────────────────────────────────────────────
export default function Chat({
  socket, roomId, username, userAvatar,
  isOpen, onClose, currentSong, chatHistory = [],
  users = [], isDJ, onAddSongToQueue,
}) {
  const [messages, setMessages]           = useState([])
  const [input, setInput]                 = useState('')
  const [editingId, setEditingId]         = useState(null)
  const [editText, setEditText]           = useState('')
  const [showPicker, setShowPicker]       = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [typers, setTypers]               = useState([])
  const [atBottom, setAtBottom]           = useState(true)
  const [newCount, setNewCount]           = useState(0)
  const [replyTo, setReplyTo]             = useState(null)
  const [pinnedMsg, setPinnedMsg]         = useState(null)
  const [muted, setMuted]                 = useState(false)
  const [searchOpen, setSearchOpen]       = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [firstUnreadId, setFirstUnreadId] = useState(null)
  const [toast, setToast]                 = useState('')
  const [recentEmojis, setRecentEmojis]     = useState([])

  const messagesRef   = useRef(null)
  const inputRef      = useRef(null)
  const typingTimer   = useRef(null)
  const isTypingRef   = useRef(false)
  const prevSongRef   = useRef(null)
  const historySeeded = useRef(false)
  const unreadMarked  = useRef(false)

  const showToast = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2200) }, [])

  const avatarMap = useMemo(() => {
    const map = {}
    users.forEach(u => { if (u.username && u.avatar) map[u.username] = u.avatar })
    messages.forEach(m => { if (m.username && m.avatar && !map[m.username]) map[m.username] = m.avatar })
    return map
  }, [users, messages])

  useEffect(() => {
    if (chatHistory.length > 0 && !historySeeded.current) {
      historySeeded.current = true
      setMessages(chatHistory)
      // After history loads, scroll to bottom
      setTimeout(() => {
        const el = messagesRef.current
        if (el) el.scrollTop = el.scrollHeight
      }, 50)
    }
  }, [chatHistory])

  useEffect(() => {
    if (!currentSong?.title || prevSongRef.current === currentSong.title) return
    prevSongRef.current = currentSong.title
    setMessages(prev => [...prev, { id: `np-${Date.now()}`, type: 'np', text: currentSong.title }])
  }, [currentSong?.title])

  useEffect(() => {
    const onMsg = (msg) => {
      if (!muted) try { navigator.vibrate?.(6) } catch {}
      setMessages(prev => {
        if (!isOpen && !unreadMarked.current) { unreadMarked.current = true; setFirstUnreadId(msg.id) }
        return [...prev.slice(-299), { ...msg, status: 'sent' }]
      })
      setAtBottom(prev => { if (!prev) setNewCount(c => c + 1); return prev })
    }
    const onEcho     = (msg) => setMessages(prev => prev.map(m => m.id === msg.id ? { ...msg, self: true, status: 'sent' } : m))
    const onEdit     = ({ msgId, text }) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text, edited: true } : m))
    const onDelete   = ({ msgId }) => setMessages(prev => prev.filter(m => m.id !== msgId))
    const onReaction = ({ msgId, emoji, username: who, action }) => setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      const r = { ...(m.reactions || {}) }
      if (!r[emoji]) r[emoji] = { count: 0, users: [] }
      if (action === 'add' && !r[emoji].users.includes(who))
        r[emoji] = { count: r[emoji].count + 1, users: [...r[emoji].users, who] }
      else if (action === 'remove')
        r[emoji] = { count: Math.max(0, r[emoji].count - 1), users: r[emoji].users.filter(u => u !== who) }
      return { ...m, reactions: r }
    }))
    const onRead   = ({ msgId }) => setMessages(prev => prev.map(m => m.self && m.id === msgId ? { ...m, status: 'read' } : m))
    const onPin    = ({ msg }) => setPinnedMsg(msg)
    const onUnpin  = () => setPinnedMsg(null)
    const onSystem = (msg) => setMessages(prev => [...prev, { id: Date.now(), type: 'system', text: msg.text }])
    const onTyping = ({ username: who, isTyping }) => setTypers(prev => isTyping ? [...prev.filter(u => u !== who), who] : prev.filter(u => u !== who))

    socket.on('chat-msg', onMsg); socket.on('chat-msg-echo', onEcho)
    socket.on('chat-edit', onEdit); socket.on('chat-delete', onDelete); socket.on('chat-reaction', onReaction)
    socket.on('chat-read', onRead); socket.on('chat-pin', onPin)
    socket.on('chat-unpin', onUnpin); socket.on('chat-system', onSystem)
    socket.on('user-typing', onTyping)
    return () => {
      socket.off('chat-msg', onMsg); socket.off('chat-msg-echo', onEcho)
      socket.off('chat-edit', onEdit); socket.off('chat-delete', onDelete); socket.off('chat-reaction', onReaction)
      socket.off('chat-read', onRead); socket.off('chat-pin', onPin)
      socket.off('chat-unpin', onUnpin); socket.off('chat-system', onSystem)
      socket.off('user-typing', onTyping)
    }
  }, [socket, muted, isOpen])

  useEffect(() => { if (isOpen) { unreadMarked.current = false; setNewCount(0) } }, [isOpen])

  // Scroll to bottom when chat opens — wait for DOM to paint
  useEffect(() => {
    if (!isOpen) return
    const tryScroll = (attempts = 0) => {
      const el = messagesRef.current
      if (!el) { if (attempts < 10) setTimeout(() => tryScroll(attempts + 1), 30); return }
      el.scrollTop = el.scrollHeight
      setAtBottom(true)
    }
    tryScroll()
  }, [isOpen])

  // Scroll to bottom when new messages arrive (only if already at bottom)
  useEffect(() => {
    const el = messagesRef.current; if (!el || !atBottom || !isOpen) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, typers, atBottom, isOpen])

  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 120) }, [isOpen])

  const handleScroll = useCallback(() => {
    const el = messagesRef.current; if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAtBottom(near); if (near) { setNewCount(0); setFirstUnreadId(null) }
  }, [])

  const handleInputChange = (e) => {
    setInput(e.target.value)
    if (!isTypingRef.current) { isTypingRef.current = true; socket.emit('user-typing', { roomId, username, isTyping: true }) }
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => { isTypingRef.current = false; socket.emit('user-typing', { roomId, username, isTyping: false }) }, 1500)
  }

  const sendMessage = useCallback(() => {
    const text = input.trim(); if (!text) return
    const msg = {
      id: Date.now(), type: 'msg', username, text,
      avatar: userAvatar || null, ts: Date.now(), status: 'sending',
      ...(replyTo ? { replyTo: { id: replyTo.id, username: replyTo.username, text: replyTo.text } } : {})
    }
    socket.emit('chat-msg', { roomId, msg })
    setMessages(prev => [...prev, { ...msg, self: true }])
    setInput(''); setReplyTo(null)
    clearTimeout(typingTimer.current); isTypingRef.current = false
    socket.emit('user-typing', { roomId, username, isTyping: false })
    setAtBottom(true); setNewCount(0); setShowGifPicker(false); setShowPicker(false)
    setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }), 30)
  }, [input, socket, roomId, username, userAvatar, replyTo])

  const handleReact = useCallback((msgId, emoji) => {
    const msg = messages.find(m => m.id === msgId); if (!msg) return
    const already = msg.reactions?.[emoji]?.users?.includes(username)
    socket.emit('chat-reaction', { roomId, msgId, emoji, username, action: already ? 'remove' : 'add' })
    if (!already) setRecentEmojis(prev => [emoji, ...prev.filter(e => e !== emoji)].slice(0, 16))
    try { navigator.vibrate?.(8) } catch {}
  }, [messages, socket, roomId, username])

  const handleGifSelect = useCallback((gif) => {
    const msg = { id: Date.now(), type: 'gif', username, gif: gif.url, preview: gif.preview, text: gif.title || 'GIF', avatar: userAvatar || null, ts: Date.now(), status: 'sending' }
    socket.emit('chat-msg', { roomId, msg }); setMessages(prev => [...prev, { ...msg, self: true }])
    setShowGifPicker(false); setAtBottom(true)
    // GIF images take time to load — retry scroll a few times
    const scrollDown = () => { const el = messagesRef.current; if (el) el.scrollTop = el.scrollHeight }
    setTimeout(scrollDown, 50)
    setTimeout(scrollDown, 200)
    setTimeout(scrollDown, 600)
  }, [socket, roomId, username, userAvatar])

  const handleEditSave = useCallback((msgId) => {
    if (!editText.trim()) return
    const msg = messages.find(m => m.id === msgId)
    if (!msg || editText.trim() === msg.text) { setEditingId(null); return }
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: editText.trim(), edited: true } : m))
    socket.emit('chat-edit', { roomId, msgId, text: editText.trim() }); setEditingId(null)
  }, [editText, messages, socket, roomId])

  const handleDelete = useCallback((msg) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id))
    socket.emit('chat-delete', { roomId, msgId: msg.id })
    showToast('🗑️ Deleted')
  }, [socket, roomId, showToast])

  const handlePin = useCallback((msg) => {
    setPinnedMsg(msg)
    socket.emit('chat-pin', { roomId, msg })
    showToast('📌 Pinned')
  }, [socket, roomId, showToast])

  const displayMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages
    const q = searchQuery.toLowerCase()
    return messages.filter(m => (m.type === 'msg' || m.type === 'gif') && m.text?.toLowerCase().includes(q))
  }, [messages, searchQuery])

  // Build list with date dividers
  const messagesWithDividers = useMemo(() => {
    const result = []; let lastDate = null
    for (const msg of displayMessages) {
      if (msg.ts) {
        const day = new Date(msg.ts).toDateString()
        if (day !== lastDate) { result.push({ type: 'date', ts: msg.ts, id: `date-${msg.ts}` }); lastDate = day }
      }
      result.push(msg)
    }
    return result
  }, [displayMessages])

  if (!isOpen) return null

  return (
    <div className="dc-panel">
      <PinnedBanner msg={pinnedMsg} canPin={isDJ}
        onDismiss={() => { setPinnedMsg(null); socket.emit('chat-unpin', { roomId }) }} />

      {/* Header */}
      <div className="dc-header">
        <div className="dc-header-l">
          {IS_MOBILE && (
            <button className="dc-hbtn dc-hbtn--back" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
          )}
          <div className="dc-header-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </div>
          <div className="dc-header-text">
            <span className="dc-header-name">room-chat</span>
            {currentSong && !searchOpen && (
              <span className="dc-header-np">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
                {currentSong.title?.length > 22 ? currentSong.title.slice(0, 22) + '…' : currentSong.title}
              </span>
            )}
          </div>
        </div>
        <div className="dc-header-r">
          {searchOpen && (
            <input className="dc-search-input" placeholder="Search…" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} autoFocus />
          )}
          <button className={`dc-hbtn ${searchOpen ? 'dc-hbtn--on' : ''}`}
            onClick={() => { setSearchOpen(p => !p); setSearchQuery('') }}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          </button>
          <button className={`dc-hbtn ${muted ? 'dc-hbtn--on' : ''}`} onClick={() => setMuted(p => !p)}>
            {muted
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A6.97 6.97 0 0 1 14 18.98v2.06A8.99 8.99 0 0 0 17.54 19l1.73 1.73L20.54 19 5.54 4 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
            }
          </button>
          {!IS_MOBILE && (
            <button className="dc-hbtn" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="dc-messages ig-messages" ref={messagesRef} onScroll={handleScroll}>
        {messages.length === 0 && !searchQuery && (
          <div className="ig-empty">
            <p>No messages yet</p>
            <span>Say something! 👋</span>
          </div>
        )}

        {messagesWithDividers.map((msg, i) => {
          if (msg.type === 'date')   return <DateDivider key={msg.id} ts={msg.ts} />
          if (msg.type === 'system') return <SystemMsg key={msg.id} msg={msg} />
          if (msg.type === 'np')     return <NowPlayingMsg key={msg.id} msg={msg} />
          if (msg.type === 'song')   return <SongCard key={msg.id} msg={msg} isSelf={!!msg.self} onAddToQueue={!msg.self ? onAddSongToQueue : null} />
          if (msg.id === firstUnreadId) return (
            <div key={`unread-${msg.id}`}>
              <UnreadDivider />
            </div>
          )

          const isSelf = !!msg.self
          // grouping only within same user
          const prevMsg = messagesWithDividers[i - 1]
          const nextMsg = messagesWithDividers[i + 1]
          const sameAsPrev = prevMsg && (prevMsg.type === 'msg' || prevMsg.type === 'gif') && prevMsg.username === msg.username
          const sameAsNext = nextMsg && (nextMsg.type === 'msg' || nextMsg.type === 'gif') && nextMsg.username === msg.username
          const showAvatar = !sameAsNext
          const showName = !sameAsPrev

          const commonProps = {
            key: msg.id, msg, isSelf,
            showAvatar, showName,
            avatarSrc: msg.avatar || avatarMap[msg.username],
            onReact: handleReact,
            onReply: setReplyTo,
            onDelete: handleDelete,
            onPin: handlePin,
            username, isDJ, recentEmojis,
          }

          if (msg.type === 'gif') return <GifBubble {...commonProps} />

          return (
            <MessageBubble {...commonProps}
              onCopy={() => { navigator.clipboard.writeText(msg.text || ''); showToast('📋 Copied!') }}
              onEdit={(m) => { setEditingId(m.id); setEditText(m.text) }}
              isEditing={editingId === msg.id}
              editText={editText}
              onEditChange={setEditText}
              onEditSave={() => handleEditSave(msg.id)}
              onEditCancel={() => setEditingId(null)}
              onDelete={handleDelete}
              onPin={handlePin}
              isDJ={isDJ}
            />
          )
        })}

        <TypingIndicator typers={typers.filter(u => u !== username)} avatarMap={avatarMap} />
        <div style={{ height: 8 }} />
      </div>

      {/* Scroll to bottom */}
      {!atBottom && (
        <button className="dc-scroll-btn" onClick={() => {
          messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
          setAtBottom(true); setNewCount(0)
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
          {newCount > 0 && <span className="dc-scroll-badge">{newCount}</span>}
        </button>
      )}

      {toast && <div className="dc-toast">{toast}</div>}

      {/* Pickers */}
      {showGifPicker && (
        <div className="dc-gif-picker-wrap">
          <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
        </div>
      )}
      {showPicker && (
        <>
          <div className="dc-overlay" onClick={() => setShowPicker(false)} />
          <div className="dc-emoji-picker-wrap">
            <EmojiPicker onSelect={e => { setInput(p => p + e); setShowPicker(false); inputRef.current?.focus() }} onClose={() => setShowPicker(false)} />
          </div>
        </>
      )}

      <ReplyBanner replyTo={replyTo} onClear={() => setReplyTo(null)} />

      {/* Input */}
      <div className="dc-input-area">
        <div className="dc-input-box">
          <button className={`dc-ibtn ${showPicker ? 'dc-ibtn--on' : ''}`}
            onClick={() => { setShowGifPicker(false); setShowPicker(p => !p) }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
          </button>
          <button className={`dc-gif-btn ${showGifPicker ? 'dc-gif-btn--on' : ''}`}
            onClick={() => { setShowPicker(false); setShowGifPicker(p => !p) }}>
            GIF
          </button>
          <input ref={inputRef} type="text" className="dc-input"
            placeholder={replyTo ? `Reply to ${replyTo.username}…` : muted ? '🔕 Muted' : 'Message…'}
            value={input} onChange={handleInputChange} maxLength={300}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                clearTimeout(typingTimer.current); isTypingRef.current = false
                socket.emit('user-typing', { roomId, username, isTyping: false })
                sendMessage()
              }
            }}
            disabled={muted} autoComplete="off" />
          <button className={`dc-send ${input.trim() && !muted ? 'dc-send--on' : ''}`}
            onClick={sendMessage} disabled={!input.trim() || muted}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}