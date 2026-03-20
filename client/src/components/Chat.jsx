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
  const d = new Date(ts), now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today at ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + time
}
function formatDateLabel(ts) {
  const d = new Date(ts), now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
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

// ── Status Icon ────────────────────────────────────────────
const StatusIcon = memo(({ status }) => {
  if (status === 'sending') return <span className="dc-status dc-status--sending">○</span>
  if (status === 'read')    return <span className="dc-status dc-status--read">✓✓</span>
  return <span className="dc-status dc-status--sent">✓</span>
})

// ── System Message ─────────────────────────────────────────
const SystemMsg = memo(({ msg }) => (
  <div className="dc-system"><span>{msg.text}</span></div>
))

// ── Date Divider ───────────────────────────────────────────
const DateDivider = memo(({ ts }) => (
  <div className="dc-date-divider">
    <div className="dc-divider-line" />
    <span className="dc-date-label">{formatDateLabel(ts)}</span>
    <div className="dc-divider-line" />
  </div>
))

// ── Unread Divider ─────────────────────────────────────────
const UnreadDivider = memo(() => (
  <div className="dc-unread-divider">
    <div className="dc-unread-line" />
    <span className="dc-unread-label">New Messages</span>
    <div className="dc-unread-line" />
  </div>
))

// ── Now Playing ────────────────────────────────────────────
const NowPlayingDivider = memo(({ msg }) => (
  <div className="dc-np-divider">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
    <span>{msg.text}</span>
  </div>
))

// ── Song Card ──────────────────────────────────────────────
const SongCard = memo(({ msg, onAddToQueue }) => (
  <div className="dc-song-card">
    <img src={`https://img.youtube.com/vi/${msg.videoId}/mqdefault.jpg`} alt="" className="dc-song-thumb" loading="lazy" />
    <div className="dc-song-info">
      <p className="dc-song-title">{msg.text}</p>
      <p className="dc-song-by">Added by {msg.username}</p>
    </div>
    {onAddToQueue && (
      <button className="dc-song-add" onClick={() => onAddToQueue(msg)}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>
    )}
  </div>
))

// ── Stamp Card ─────────────────────────────────────────────
const StampCard = memo(({ msg }) => (
  <div className="dc-stamp-card">
    <span>📍</span>
    <div><span className="dc-stamp-label">Moment stamped</span><span className="dc-stamp-title">{msg.text}</span></div>
  </div>
))

// ── Link Preview ───────────────────────────────────────────
const LinkPreview = memo(({ url }) => {
  const vid = ytId(url)
  if (!vid) return null
  return (
    <div className="dc-link-preview">
      <div className="dc-link-accent" />
      <div className="dc-link-body">
        <div className="dc-link-site">YouTube</div>
        <a className="dc-link-title" href={url} target="_blank" rel="noopener noreferrer">
          {url.length > 55 ? url.slice(0, 55) + '…' : url}
        </a>
        <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="" className="dc-link-thumb" loading="lazy" />
      </div>
    </div>
  )
})

// ── Reply Quote ────────────────────────────────────────────
const ReplyQuote = memo(({ reply }) => {
  const color = userColor(reply.username)
  return (
    <div className="dc-reply-quote">
      <div className="dc-reply-bar" style={{ background: color }} />
      <span className="dc-reply-name" style={{ color }}>{reply.username}</span>
      <span className="dc-reply-preview">{reply.text?.slice(0, 80) || 'GIF'}</span>
    </div>
  )
})

// ── Reactions ──────────────────────────────────────────────
const Reactions = memo(({ reactions = {}, onReact, username }) => {
  const entries = Object.entries(reactions).filter(([, v]) => v.count > 0)
  if (!entries.length) return null
  return (
    <div className="dc-reactions">
      {entries.map(([emoji, { count, users }]) => (
        <button key={emoji}
          className={`dc-reaction ${users?.includes(username) ? 'dc-reaction--mine' : ''}`}
          onClick={() => onReact(emoji)}
          title={users?.join(', ')}>
          {emoji}<span>{count}</span>
        </button>
      ))}
    </div>
  )
})

// ── Typing Indicator ───────────────────────────────────────
const TypingIndicator = memo(({ typers, avatarMap }) => {
  if (!typers.length) return null
  return (
    <div className="dc-typing">
      <div className="dc-typing-avatars">
        {typers.slice(0, 3).map(u => (
          avatarMap[u]
            ? <img key={u} src={avatarMap[u]} alt="" className="dc-typing-av" />
            : <div key={u} className="dc-typing-av dc-typing-av--init" style={{ background: userColor(u) }}>{userInitial(u)}</div>
        ))}
      </div>
      <div className="dc-typing-dots"><span /><span /><span /></div>
      <span className="dc-typing-text">
        {typers.slice(0, 2).join(', ')}{typers.length > 2 ? ` +${typers.length - 2}` : ''} {typers.length === 1 ? 'is' : 'are'} typing…
      </span>
    </div>
  )
})

// ── Pinned Banner ──────────────────────────────────────────
const PinnedBanner = memo(({ msg, onDismiss, canPin }) => {
  if (!msg) return null
  return (
    <div className="dc-pinned">
      <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M17 4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1H5v2h1v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h1V5h-2V4z"/></svg>
      <span className="dc-pinned-label">Pinned</span>
      <span className="dc-pinned-text">{msg.text?.slice(0, 55)}</span>
      {canPin && <button className="dc-pinned-close" onClick={onDismiss}>✕</button>}
    </div>
  )
})

// ── Quick Reaction Picker ──────────────────────────────────
const QUICK_EMOJIS = ['❤️','🔥','😂','😮','👏','💀','🎵','✨','💯','🚀']
const QuickReact = memo(({ isSelf, onReact, onClose }) => (
  <div className={`dc-quick-react ${isSelf ? 'dc-quick-react--self' : ''}`}>
    {QUICK_EMOJIS.map(e => (
      <button key={e} onClick={() => { onReact(e); onClose() }}>{e}</button>
    ))}
  </div>
))

// ── Mobile Context Menu ────────────────────────────────────
const ContextMenu = memo(({ isSelf, onReact, onReply, onForward, onCopy, onPin, onEdit, canPin, onClose, isGif }) => (
  <>
    <div className="dc-ctx-overlay" onClick={onClose} />
    <div className={`dc-ctx-menu ${isSelf ? 'dc-ctx-menu--self' : ''}`}>
      <div className="dc-ctx-reactions">
        {QUICK_EMOJIS.slice(0, 8).map(e => (
          <button key={e} onClick={() => { onReact(e); onClose() }}>{e}</button>
        ))}
      </div>
      <div className="dc-ctx-sep" />
      <button className="dc-ctx-btn" onClick={() => { onReply(); onClose() }}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
        Reply
      </button>
      {onEdit && (
        <button className="dc-ctx-btn" onClick={() => { onEdit(); onClose() }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          Edit Message
        </button>
      )}
      <button className="dc-ctx-btn" onClick={() => { onForward(); onClose() }}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>
        Forward
      </button>
      <button className="dc-ctx-btn" onClick={() => { onCopy(); onClose() }}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        {isGif ? 'Copy URL' : 'Copy Text'}
      </button>
      {canPin && (
        <button className="dc-ctx-btn dc-ctx-btn--pin" onClick={() => { onPin(); onClose() }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17 4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1H5v2h1v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h1V5h-2V4z"/></svg>
          Pin Message
        </button>
      )}
    </div>
  </>
))

// ── GIF Lightbox ───────────────────────────────────────────
const GifLightbox = memo(({ gif, title, onClose }) => (
  <div className="dc-lightbox" onClick={onClose}>
    <button className="dc-lightbox-close" onClick={onClose}>✕</button>
    <div className="dc-lightbox-body" onClick={e => e.stopPropagation()}>
      <img src={gif} alt={title} className="dc-lightbox-img" />
      <div className="dc-lightbox-foot">
        <span>{title}</span>
        <a href={gif} target="_blank" rel="noopener noreferrer">Open original ↗</a>
      </div>
    </div>
  </div>
))

// ── Hover Action Bar ───────────────────────────────────────
const ActionBar = memo(({ isSelf, onReact, onReply, onForward, onCopy, onPin, onEdit, canPin }) => {
  const [showQuick, setShowQuick] = useState(false)
  return (
    <div className={`dc-action-bar ${isSelf ? 'dc-action-bar--self' : ''}`}>
      {showQuick && <QuickReact isSelf={isSelf} onReact={onReact} onClose={() => setShowQuick(false)} />}
      <div className="dc-action-btns">
        <button className="dc-action-btn" onClick={() => setShowQuick(p => !p)} title="Add reaction">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
        </button>
        <button className="dc-action-btn" onClick={onReply} title="Reply">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
        </button>
        {onEdit && <button className="dc-action-btn" onClick={onEdit} title="Edit">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>}
        <button className="dc-action-btn" onClick={onForward} title="Forward">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>
        </button>
        <button className="dc-action-btn" onClick={onCopy} title="Copy">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        </button>
        {canPin && <button className="dc-action-btn" onClick={onPin} title="Pin">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17 4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1H5v2h1v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h1V5h-2V4z"/></svg>
        </button>}
      </div>
    </div>
  )
})

// ── Message Row ────────────────────────────────────────────
const MessageRow = memo(({
  msg, isSelf, showAvatar, showName, avatarSrc, isFirstUnread, isCompact,
  onReact, onReply, onForward, onCopy, onPin, onEdit,
  isEditing, editText, onEditChange, onEditSave, onEditCancel,
  canPin, username,
}) => {
  const color = userColor(msg.username)
  const [hover, setHover] = useState(false)
  const [showCtx, setShowCtx] = useState(false)
  const swipeRef = useRef(null)
  const swipeStartX = useRef(null)
  const longPressTimer = useRef(null)
  const touchMoved = useRef(false)

  const textParts = parseText(msg.text || '')
  const hasUrl = textParts.some(p => p.type === 'url')

  const onTouchStart = (e) => {
    touchMoved.current = false
    swipeStartX.current = e.touches[0].clientX
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) { setShowCtx(true); try { navigator.vibrate?.(12) } catch {} }
    }, 500)
  }
  const onTouchMove = (e) => {
    touchMoved.current = true
    clearTimeout(longPressTimer.current)
    if (swipeStartX.current === null) return
    const dx = Math.max(0, e.touches[0].clientX - swipeStartX.current)
    if (swipeRef.current && dx < 80) swipeRef.current.style.transform = `translateX(${dx * 0.35}px)`
  }
  const onTouchEnd = (e) => {
    clearTimeout(longPressTimer.current)
    if (swipeStartX.current === null) return
    const dx = e.changedTouches[0].clientX - swipeStartX.current
    if (dx > 55 && touchMoved.current) { onReply(msg); try { navigator.vibrate?.(8) } catch {} }
    swipeStartX.current = null
    if (swipeRef.current) swipeRef.current.style.transform = ''
  }

  return (
    <div
      className={`dc-msg ${isCompact ? 'dc-msg--compact' : ''} ${hover ? 'dc-msg--hover' : ''}`}
      onMouseEnter={() => !IS_MOBILE && setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-id={msg.id}
    >
      {isFirstUnread && <UnreadDivider />}

      {isCompact
        ? <div className="dc-msg-ts-side">{msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
        : <div className="dc-msg-av-col">
            {showAvatar
              ? avatarSrc
                ? <img src={avatarSrc} alt="" className="dc-av dc-av--img" />
                : <div className="dc-av" style={{ background: color }}>{userInitial(msg.username)}</div>
              : <div className="dc-av-ghost" />
            }
          </div>
      }

      <div className="dc-msg-col" ref={swipeRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {!isCompact && showName && (
          <div className="dc-msg-meta">
            <span className="dc-msg-author" style={{ color }}>{msg.username}</span>
            <span className="dc-msg-time">{formatTs(msg.ts)}</span>
          </div>
        )}
        {msg.replyTo && <ReplyQuote reply={msg.replyTo} />}
        {isEditing ? (
          <div className="dc-edit-wrap">
            <input className="dc-edit-input" value={editText}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEditSave(); if (e.key === 'Escape') onEditCancel() }}
              autoFocus />
            <div className="dc-edit-hint">
              <span>escape to <button onClick={onEditCancel}>cancel</button></span>
              <span>· enter to <button onClick={onEditSave}>save</button></span>
            </div>
          </div>
        ) : (
          <p className="dc-msg-text">
            {textParts.map((p, i) =>
              p.type === 'url'
                ? <a key={i} href={p.value} target="_blank" rel="noopener noreferrer" className="dc-link">{p.value}</a>
                : <span key={i} dangerouslySetInnerHTML={{ __html: p.value.replace(/@(\w+)/g, '<span class="dc-mention">@$1</span>') }} />
            )}
            {msg.edited && <span className="dc-edited"> (edited)</span>}
            {isSelf && <StatusIcon status={msg.status || 'sent'} />}
          </p>
        )}
        {hasUrl && !isEditing && textParts.filter(p => p.type === 'url').map((p, i) => (
          <LinkPreview key={i} url={p.value} />
        ))}
        <Reactions reactions={msg.reactions} onReact={e => onReact(msg.id, e)} username={username} />
      </div>

      {hover && !IS_MOBILE && !isEditing && (
        <ActionBar
          isSelf={isSelf}
          onReact={e => onReact(msg.id, e)}
          onReply={() => onReply(msg)}
          onForward={() => onForward(msg)}
          onCopy={() => onCopy(msg.text)}
          onPin={() => onPin(msg)}
          onEdit={isSelf ? () => onEdit(msg) : null}
          canPin={canPin}
        />
      )}
      {showCtx && (
        <ContextMenu
          isSelf={isSelf}
          onReact={e => onReact(msg.id, e)}
          onReply={() => onReply(msg)}
          onForward={() => onForward(msg)}
          onCopy={() => onCopy(msg.text)}
          onPin={() => onPin(msg)}
          onEdit={isSelf ? () => onEdit(msg) : null}
          canPin={canPin}
          onClose={() => setShowCtx(false)}
        />
      )}
    </div>
  )
})

// ── GIF Message Row ────────────────────────────────────────
const GifRow = memo(({
  msg, isSelf, showAvatar, showName, avatarSrc, isFirstUnread, isCompact,
  onReact, onReply, onForward, onCopy, onPin, canPin, username,
}) => {
  const color = userColor(msg.username)
  const [hover, setHover] = useState(false)
  const [showCtx, setShowCtx] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const longPressTimer = useRef(null)
  const touchMoved = useRef(false)

  return (
    <>
      {lightbox && <GifLightbox gif={msg.gif} title={msg.text} onClose={() => setLightbox(false)} />}
      <div
        className={`dc-msg ${isCompact ? 'dc-msg--compact' : ''} ${hover ? 'dc-msg--hover' : ''}`}
        onMouseEnter={() => !IS_MOBILE && setHover(true)}
        onMouseLeave={() => setHover(false)}
        data-id={msg.id}
      >
        {isFirstUnread && <UnreadDivider />}
        {isCompact
          ? <div className="dc-msg-ts-side">{msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
          : <div className="dc-msg-av-col">
              {showAvatar
                ? avatarSrc
                  ? <img src={avatarSrc} alt="" className="dc-av dc-av--img" />
                  : <div className="dc-av" style={{ background: color }}>{userInitial(msg.username)}</div>
                : <div className="dc-av-ghost" />
              }
            </div>
        }
        <div className="dc-msg-col"
          onTouchStart={() => { touchMoved.current = false; longPressTimer.current = setTimeout(() => { setShowCtx(true); try { navigator.vibrate?.(12) } catch {} }, 500) }}
          onTouchMove={() => { touchMoved.current = true; clearTimeout(longPressTimer.current) }}
          onTouchEnd={() => clearTimeout(longPressTimer.current)}
        >
          {!isCompact && showName && (
            <div className="dc-msg-meta">
              <span className="dc-msg-author" style={{ color }}>{msg.username}</span>
              <span className="dc-msg-time">{formatTs(msg.ts)}</span>
            </div>
          )}
          {msg.replyTo && <ReplyQuote reply={msg.replyTo} />}
          <div className="dc-gif-wrap" onClick={() => setLightbox(true)}>
            <img src={msg.gif} alt={msg.text} className="dc-gif-img" loading="lazy" />
            <span className="dc-gif-badge">GIF</span>
          </div>
          <Reactions reactions={msg.reactions} onReact={e => onReact(msg.id, e)} username={username} />
          {isSelf && <div className="dc-gif-status"><StatusIcon status={msg.status || 'sent'} /></div>}
        </div>
        {hover && !IS_MOBILE && (
          <ActionBar
            isSelf={isSelf}
            onReact={e => onReact(msg.id, e)}
            onReply={() => onReply(msg)}
            onForward={() => onForward(msg)}
            onCopy={() => onCopy(msg.gif)}
            onPin={() => onPin(msg)}
            canPin={canPin}
          />
        )}
        {showCtx && (
          <ContextMenu
            isSelf={isSelf}
            onReact={e => onReact(msg.id, e)}
            onReply={() => onReply(msg)}
            onForward={() => onForward(msg)}
            onCopy={() => onCopy(msg.gif)}
            onPin={() => onPin(msg)}
            canPin={canPin}
            onClose={() => setShowCtx(false)}
            isGif
          />
        )}
      </div>
    </>
  )
})

// ── Reply Banner ───────────────────────────────────────────
const ReplyBanner = memo(({ replyTo, onClear }) => {
  if (!replyTo) return null
  const color = userColor(replyTo.username)
  return (
    <div className="dc-reply-banner">
      <div className="dc-reply-banner-bar" style={{ background: color }} />
      <div className="dc-reply-banner-info">
        <span className="dc-reply-banner-to">Replying to </span>
        <span className="dc-reply-banner-name" style={{ color }}>{replyTo.username}</span>
        <span className="dc-reply-banner-preview">{replyTo.text?.slice(0, 55) || 'GIF'}</span>
      </div>
      <button className="dc-reply-banner-x" onClick={onClear}>✕</button>
    </div>
  )
})

// ── Main Chat ──────────────────────────────────────────────
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
    if (chatHistory.length > 0 && !historySeeded.current) { historySeeded.current = true; setMessages(chatHistory) }
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
    socket.on('chat-edit', onEdit); socket.on('chat-reaction', onReaction)
    socket.on('chat-read', onRead); socket.on('chat-pin', onPin)
    socket.on('chat-unpin', onUnpin); socket.on('chat-system', onSystem)
    socket.on('user-typing', onTyping)
    return () => {
      socket.off('chat-msg', onMsg); socket.off('chat-msg-echo', onEcho)
      socket.off('chat-edit', onEdit); socket.off('chat-reaction', onReaction)
      socket.off('chat-read', onRead); socket.off('chat-pin', onPin)
      socket.off('chat-unpin', onUnpin); socket.off('chat-system', onSystem)
      socket.off('user-typing', onTyping)
    }
  }, [socket, muted, isOpen])

  useEffect(() => { if (isOpen) { unreadMarked.current = false; setNewCount(0) } }, [isOpen])
  useEffect(() => { const el = messagesRef.current; if (!el || !atBottom) return; el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) }, [messages, typers, atBottom])
  useEffect(() => {
    if (isOpen && firstUnreadId && messagesRef.current) {
      const el = messagesRef.current.querySelector(`[data-id="${firstUnreadId}"]`)
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200)
    }
  }, [isOpen, firstUnreadId])
  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 120) }, [isOpen])
  useEffect(() => {
    if (!window.visualViewport) return
    const fn = () => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight }
    window.visualViewport.addEventListener('resize', fn)
    return () => window.visualViewport.removeEventListener('resize', fn)
  }, [])

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
    if (text.startsWith('/add ')) {
      const url = text.slice(5).trim(); const vid = ytId(url) || url
      if (vid) {
        const sm = { id: Date.now(), type: 'song', username, videoId: vid, text: url, avatar: userAvatar, ts: Date.now() }
        socket.emit('chat-msg', { roomId, msg: sm }); socket.emit('add-song', { roomId, videoId: vid, title: url, addedBy: username })
        setMessages(prev => [...prev, { ...sm, self: true }]); setInput(''); return
      }
    }
    const msg = { id: Date.now(), type: 'msg', username, text, avatar: userAvatar || null, ts: Date.now(), status: 'sending',
      ...(replyTo ? { replyTo: { id: replyTo.id, username: replyTo.username, text: replyTo.text } } : {}) }
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
    try { navigator.vibrate?.(8) } catch {}
  }, [messages, socket, roomId, username])

  const handlePin      = useCallback((msg) => { socket.emit('chat-pin', { roomId, msg }); setPinnedMsg(msg) }, [socket, roomId])
  const handleCopy     = useCallback((text) => { navigator.clipboard.writeText(text).then(() => showToast('📋 Copied!')) }, [showToast])
  const handleForward  = useCallback((msg) => { navigator.clipboard.writeText(msg.text || msg.gif || '').then(() => showToast('✉️ Copied!')) }, [showToast])
  const handleGifSelect = useCallback((gif) => {
    const msg = { id: Date.now(), type: 'gif', username, gif: gif.url, preview: gif.preview, text: gif.title || 'GIF', avatar: userAvatar || null, ts: Date.now(), status: 'sending' }
    socket.emit('chat-msg', { roomId, msg }); setMessages(prev => [...prev, { ...msg, self: true }])
    setShowGifPicker(false); setAtBottom(true)
    setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }), 30)
  }, [socket, roomId, username, userAvatar])

  const handleEditSave = useCallback((msgId) => {
    if (!editText.trim()) return
    const msg = messages.find(m => m.id === msgId)
    if (!msg || editText.trim() === msg.text) { setEditingId(null); return }
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: editText.trim(), edited: true } : m))
    socket.emit('chat-edit', { roomId, msgId, text: editText.trim() }); setEditingId(null)
  }, [editText, messages, socket, roomId])

  const displayMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages
    const q = searchQuery.toLowerCase()
    return messages.filter(m => (m.type === 'msg' || m.type === 'gif') && m.text?.toLowerCase().includes(q))
  }, [messages, searchQuery])

  useEffect(() => {
    if (searchQuery && displayMessages.length > 0 && messagesRef.current) {
      const el = messagesRef.current.querySelector(`[data-id="${displayMessages[0].id}"]`)
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
    }
  }, [searchQuery, displayMessages])

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
      <PinnedBanner msg={pinnedMsg} canPin={isDJ} onDismiss={() => { setPinnedMsg(null); socket.emit('chat-unpin', { roomId }) }} />

      {/* Header */}
      <div className="dc-header">
        <div className="dc-header-l">
          {IS_MOBILE && (
            <button className="dc-hbtn dc-hbtn--back" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
          )}
          <div className="dc-header-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </div>
          <div className="dc-header-text">
            <span className="dc-header-name">room-chat</span>
            {currentSong && !searchOpen && (
              <span className="dc-header-np">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
                {currentSong.title.length > 24 ? currentSong.title.slice(0, 24) + '…' : currentSong.title}
              </span>
            )}
          </div>
        </div>
        <div className="dc-header-r">
          {searchOpen && (
            <input className="dc-search-input" placeholder="Search messages…" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} autoFocus />
          )}
          <button className={`dc-hbtn ${searchOpen ? 'dc-hbtn--on' : ''}`} onClick={() => { setSearchOpen(p => !p); setSearchQuery('') }} title="Search">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          </button>
          <button className={`dc-hbtn ${muted ? 'dc-hbtn--on' : ''}`} onClick={() => setMuted(p => !p)} title={muted ? 'Unmute' : 'Mute'}>
            {muted
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A6.97 6.97 0 0 1 14 18.98v2.06A8.99 8.99 0 0 0 17.54 19l1.73 1.73L20.54 19 5.54 4 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
            }
          </button>
          {!IS_MOBILE && (
            <button className="dc-hbtn" onClick={onClose} title="Close">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="dc-messages" ref={messagesRef} onScroll={handleScroll}>
        {messages.length === 0 && !searchQuery && (
          <div className="dc-empty">
            <div className="dc-empty-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            </div>
            <p className="dc-empty-title">Welcome to #room-chat</p>
            <p className="dc-empty-sub">This is the beginning of the conversation. Say hi! 👋</p>
          </div>
        )}
        {searchQuery && displayMessages.length === 0 && (
          <div className="dc-empty">
            <p className="dc-empty-title">No results for "{searchQuery}"</p>
            <p className="dc-empty-sub">Try different keywords</p>
          </div>
        )}

        {messagesWithDividers.map((msg, i) => {
          if (msg.type === 'date')   return <DateDivider key={msg.id} ts={msg.ts} />
          if (msg.type === 'system') return <SystemMsg key={msg.id} msg={msg} />
          if (msg.type === 'np')     return <NowPlayingDivider key={msg.id} msg={msg} />
          if (msg.type === 'song')   return <SongCard key={msg.id} msg={msg} onAddToQueue={!msg.self ? onAddSongToQueue : null} />
          if (msg.type === 'stamp')  return <StampCard key={msg.id} msg={msg} />

          const prevMsg = messagesWithDividers[i - 1]
          const nextMsg = messagesWithDividers[i + 1]
          const isFirstUnread = msg.id === firstUnreadId
          const sameAuthorPrev = prevMsg && (prevMsg.type === 'msg' || prevMsg.type === 'gif') && prevMsg.username === msg.username
          const sameAuthorNext = nextMsg && (nextMsg.type === 'msg' || nextMsg.type === 'gif') && nextMsg.username === msg.username
          const isCompact = sameAuthorPrev && !msg.replyTo && !isFirstUnread
          const showAvatar = !sameAuthorNext || msg.type !== (nextMsg?.type)
          const showName   = !sameAuthorPrev

          if (msg.type === 'gif') return (
            <GifRow key={msg.id} msg={msg} isSelf={!!msg.self}
              showAvatar={showAvatar} showName={showName} isCompact={isCompact}
              avatarSrc={msg.avatar || avatarMap[msg.username]} isFirstUnread={isFirstUnread}
              onReact={handleReact} onReply={setReplyTo} onForward={handleForward}
              onCopy={handleCopy} onPin={handlePin} canPin={isDJ} username={username} />
          )

          return (
            <MessageRow key={msg.id} msg={msg} isSelf={!!msg.self}
              showAvatar={showAvatar} showName={showName} isCompact={isCompact}
              avatarSrc={msg.avatar || avatarMap[msg.username]} isFirstUnread={isFirstUnread}
              onReact={handleReact} onReply={setReplyTo} onForward={handleForward}
              onCopy={handleCopy} onPin={handlePin}
              onEdit={(m) => { setEditingId(m.id); setEditText(m.text) }}
              isEditing={editingId === msg.id} editText={editText}
              onEditChange={setEditText} onEditSave={() => handleEditSave(msg.id)}
              onEditCancel={() => setEditingId(null)} canPin={isDJ} username={username} />
          )
        })}
        <TypingIndicator typers={typers.filter(u => u !== username)} avatarMap={avatarMap} />
        <div style={{ height: 8 }} />
      </div>

      {/* Scroll to bottom */}
      {!atBottom && (
        <button className="dc-scroll-btn" onClick={() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }); setAtBottom(true); setNewCount(0) }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
          {newCount > 0 && <span className="dc-scroll-badge">{newCount}</span>}
        </button>
      )}

      {/* Toast */}
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

      {/* Reply */}
      <ReplyBanner replyTo={replyTo} onClear={() => setReplyTo(null)} />

      {/* Input */}
      <div className="dc-input-area">
        <div className="dc-input-box">
          <button className={`dc-ibtn ${showPicker ? 'dc-ibtn--on' : ''}`} onClick={() => { setShowGifPicker(false); setShowPicker(p => !p) }} title="Emoji">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
          </button>
          <button className={`dc-gif-btn ${showGifPicker ? 'dc-gif-btn--on' : ''}`} onClick={() => { setShowPicker(false); setShowGifPicker(p => !p) }} title="GIF">
            GIF
          </button>
          <input ref={inputRef} type="text" className="dc-input"
            placeholder={replyTo ? `Reply to ${replyTo.username}…` : muted ? '🔕 Chat muted' : 'Message #room-chat'}
            value={input} onChange={handleInputChange} maxLength={300}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                clearTimeout(typingTimer.current); isTypingRef.current = false
                socket.emit('user-typing', { roomId, username, isTyping: false })
                sendMessage()
              }
            }}
            disabled={muted} inputMode="text" autoComplete="off" />
          <button className={`dc-send ${input.trim() && !muted ? 'dc-send--on' : ''}`}
            onClick={sendMessage} disabled={!input.trim() || muted}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}