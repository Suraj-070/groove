import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react'
import EmojiPicker from './EmojiPicker'
import GifPicker from './GifPicker'

// ── Helpers ───────────────────────────────────────────────
const USER_COLORS = [
  '#a78bfa','#f472b6','#34d399','#fb923c',
  '#60a5fa','#e879f9','#4ade80','#facc15',
  '#f87171','#38bdf8','#a3e635','#ff6a8a',
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
  if (isToday) return time
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
}
function formatDateLabel(ts) {
  const d = new Date(ts), now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

// Detect mobile once at module level
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

// ── Sub-components ────────────────────────────────────────
const SystemMsg = memo(({ msg }) => (
  <div className="chat-system"><span className="chat-system-text">{msg.text}</span></div>
))

const DateDivider = memo(({ ts }) => (
  <div className="chat-date-divider">
    <span className="chat-date-label">{formatDateLabel(ts)}</span>
  </div>
))

const UnreadDivider = memo(() => (
  <div className="chat-unread-divider">
    <span className="chat-unread-label">New messages</span>
  </div>
))

const NowPlayingDivider = memo(({ msg }) => (
  <div className="chat-np-divider">
    <span className="chat-np-bar" />
    <span className="chat-np-label">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
      {msg.text}
    </span>
    <span className="chat-np-bar" />
  </div>
))

// Song card — when a song is added via chat /add command
const SongCard = memo(({ msg, onAddToQueue }) => (
  <div className="chat-song-card">
    <img src={`https://img.youtube.com/vi/${msg.videoId}/mqdefault.jpg`} alt="" className="chat-song-thumb" loading="lazy" />
    <div className="chat-song-info">
      <p className="chat-song-title">{msg.text}</p>
      <p className="chat-song-by">Added by {msg.username}</p>
    </div>
    {onAddToQueue && (
      <button className="chat-song-add" onClick={() => onAddToQueue(msg)} title="Add to queue">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>
    )}
  </div>
))

// Stamp card — when someone stamps a moment
const StampCard = memo(({ msg }) => (
  <div className="chat-stamp-card">
    <span className="chat-stamp-star">★</span>
    <div className="chat-stamp-info">
      <p className="chat-stamp-title">{msg.songTitle}</p>
      <p className="chat-stamp-meta">{msg.username} stamped at {msg.stampTime}</p>
    </div>
  </div>
))

const LinkPreview = memo(({ url }) => {
  const vid = ytId(url)
  if (vid) return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="chat-link-preview">
      <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="" className="chat-link-thumb" loading="lazy" />
      <div className="chat-link-info">
        <span className="chat-link-domain">▶ YouTube</span>
        <span className="chat-link-url">{url.slice(0, 40)}{url.length > 40 ? '…' : ''}</span>
      </div>
    </a>
  )
  return <a href={url} target="_blank" rel="noopener noreferrer" className="chat-link-plain">{url.slice(0, 50)}{url.length > 50 ? '…' : ''}</a>
})

const StatusIcon = memo(({ status }) => {
  if (status === 'sending') return <span className="chat-status chat-status--sending">○</span>
  if (status === 'sent')    return <span className="chat-status chat-status--sent">✓</span>
  if (status === 'read')    return <span className="chat-status chat-status--read">✓✓</span>
  return null
})

const ReplyQuote = memo(({ reply }) => {
  if (!reply) return null
  const color = userColor(reply.username)
  return (
    <div className="chat-reply-quote" style={{ borderLeftColor: color }}>
      <span className="chat-reply-name" style={{ color }}>{reply.username}</span>
      <span className="chat-reply-text">{reply.text?.slice(0, 60)}{reply.text?.length > 60 ? '…' : ''}</span>
    </div>
  )
})

const ReactionPills = memo(({ reactions = {}, onReact, isSelf, onAddReact }) => {
  const entries = Object.entries(reactions).filter(([, v]) => v.count > 0)
  const [showAdd, setShowAdd] = useState(false)
  if (!entries.length) return null
  return (
    <div className={`chat-reactions ${isSelf ? 'chat-reactions--self' : ''}`}>
      {entries.map(([emoji, { count, users }]) => (
        <button key={emoji} className={`chat-reaction-pill ${users?.includes?.('me') ? 'active' : ''}`}
          onClick={() => onReact(emoji)} title={users?.join?.(', ')}>
          {emoji} <span>{count}</span>
        </button>
      ))}
      {/* + button to add more reactions using the same EmojiPicker */}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button className="chat-reaction-add" onClick={() => setShowAdd(p => !p)} title="Add reaction">+</button>
        {showAdd && (
          <div className={`chat-reaction-add-picker ${isSelf ? 'chat-reaction-add-picker--self' : ''}`}>
            <EmojiPicker
              onSelect={(e) => { onReact(e); setShowAdd(false) }}
              onClose={() => setShowAdd(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
})

const TypingIndicator = memo(({ typers, avatarMap }) => {
  if (!typers.length) return null
  return (
    <div className="chat-typing">
      <div className="chat-typing-avatars">
        {typers.slice(0, 3).map(who => {
          const src = avatarMap[who], color = userColor(who)
          return src
            ? <img key={who} src={src} alt="" className="chat-typing-avatar" />
            : <div key={who} className="chat-typing-avatar chat-typing-avatar--initials" style={{ background: color }}>{userInitial(who)}</div>
        })}
      </div>
      <div className="chat-typing-bubble">
        <span className="chat-typing-dot"/><span className="chat-typing-dot"/><span className="chat-typing-dot"/>
      </div>
    </div>
  )
})

const PinnedBanner = memo(({ msg, onDismiss, canPin }) => {
  if (!msg) return null
  return (
    <div className="chat-pinned">
      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M17 4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1H5v2h1v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h1V5h-2V4zm-6 12H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
      <span className="chat-pinned-text">{msg.username}: {msg.text?.slice(0, 50)}{msg.text?.length > 50 ? '…' : ''}</span>
      {canPin && <button className="chat-pinned-close" onClick={onDismiss}>✕</button>}
    </div>
  )
})

// ── Chat Bubble ───────────────────────────────────────────
const ChatBubble = memo(({
  msg, isSelf, showAvatar, showName, avatarSrc,
  onReact, onReply, onForward, onCopy, onPin,
  onEdit, isEditing, editText, onEditChange, onEditSave, onEditCancel,
  isFirstUnread, canPin,
}) => {
  const color = userColor(msg.username)
  const [showActions, setShowActions] = useState(false)
  const [showReactPicker, setShowReactPicker] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const swipeRef = useRef(null)
  const swipeStartX = useRef(null)
  const longPressTimer = useRef(null)

  const touchMoved = useRef(false)
  const onTouchStart = (e) => {
    touchMoved.current = false
    swipeStartX.current = e.touches[0].clientX
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        setShowContextMenu(true)
        try { navigator.vibrate?.(12) } catch {}
        swipeStartX.current = null
        // Reset swipe transform when context menu opens
        if (swipeRef.current) swipeRef.current.style.transform = ''
      }
    }, 850) // Increased from 600ms to 850ms to reduce conflict with swipe
  }
  const onTouchEnd = (e) => {
    clearTimeout(longPressTimer.current)
    if (swipeStartX.current === null) return
    if (!touchMoved.current) {
      // tap — do nothing extra
    } else {
      const dx = e.changedTouches[0].clientX - swipeStartX.current
      if (dx > 55) { onReply(msg); try { navigator.vibrate?.(8) } catch {} }
    }
    swipeStartX.current = null
    if (swipeRef.current) swipeRef.current.style.transform = ''
  }
  const onTouchMove = (e) => {
    touchMoved.current = true
    clearTimeout(longPressTimer.current)
    if (swipeStartX.current === null) return
    const dx = Math.max(0, e.touches[0].clientX - swipeStartX.current)
    if (swipeRef.current && dx < 80) swipeRef.current.style.transform = `translateX(${dx * 0.4}px)`
  }

  const textParts = parseText(msg.text || '')
  const hasUrl = textParts.some(p => p.type === 'url')

  // Mention highlight
  const renderText = () => textParts.map((p, i) =>
    p.type === 'url'
      ? <a key={i} href={p.value} target="_blank" rel="noopener noreferrer" className="chat-link">{p.value}</a>
      : <span key={i} dangerouslySetInnerHTML={{ __html: p.value.replace(/@(\w+)/g, '<span class="chat-mention">@$1</span>') }} />
  )

  return (
    <div className={`chat-row ${isSelf ? 'chat-row--self' : 'chat-row--other'}`}
      onMouseEnter={() => !IS_MOBILE && setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactPicker(false) }}
    >
      {!isSelf && (
        <div className="chat-avatar-col">
          {showAvatar
            ? avatarSrc
              ? <img src={avatarSrc} alt="" className="chat-avatar chat-avatar--img" />
              : <div className="chat-avatar" style={{ background: color }}>{userInitial(msg.username)}</div>
            : <div className="chat-avatar-spacer" />
          }
        </div>
      )}

      <div className="chat-bubble-col" ref={swipeRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ transition: 'transform 0.2s' }}
      >
        {!isSelf && showName && <span className="chat-name" style={{ color }}>{msg.username}</span>}

        {/* Reply quote */}
        {msg.replyTo && <ReplyQuote reply={msg.replyTo} />}

        {/* Hover action bar — desktop only */}
        {showActions && !isEditing && !IS_MOBILE && (
          <div className={`chat-action-bar ${isSelf ? 'chat-action-bar--self' : ''}`}>
            <button className="chat-action-icon" onClick={() => setShowReactPicker(p => !p)}>😊</button>
            <button className="chat-action-icon" onClick={() => onReply(msg)} title="Reply">
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
            </button>
            <button className="chat-action-icon" onClick={() => onForward(msg)} title="Forward">
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>
            </button>
            <button className="chat-action-icon" onClick={() => onCopy(msg.text)} title="Copy">
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            </button>
            {canPin && (
              <button className="chat-action-icon" onClick={() => onPin(msg)} title="Pin">
                <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M17 4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1H5v2h1v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h1V5h-2V4z"/></svg>
              </button>
            )}
            {isSelf && (
              <button className="chat-action-icon" onClick={onEdit} title="Edit">
                <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
            )}
          </div>
        )}

        {/* Quick react picker */}
        {showReactPicker && (
          <div className={`chat-quick-react ${isSelf ? 'chat-quick-react--self' : ''}`}>
            {['❤️','🔥','😂','😮','👏','💀','🎵','✨'].map(e => (
              <button key={e} onClick={() => { onReact(msg.id, e); setShowReactPicker(false) }}>{e}</button>
            ))}
          </div>
        )}

        {/* Mobile context menu */}
        {showContextMenu && (
          <>
            <div className="chat-context-overlay" onClick={() => setShowContextMenu(false)} />
            <div className={`chat-context-menu ${isSelf ? 'chat-context-menu--self' : ''}`}>
              {/* Quick reactions row - Instagram style */}
              <div className="chat-context-reactions">
                {['❤️','🔥','😂','😮','👏','💀','🎵','✨'].map(e => (
                  <button key={e} className="chat-context-reaction" onClick={() => { onReact(msg.id, e); setShowContextMenu(false) }}>{e}</button>
                ))}
              </div>
              {/* Action buttons */}
              <button onClick={() => { onReply(msg); setShowContextMenu(false) }}>↩ Reply</button>
              <button onClick={() => { onCopy(msg.text); setShowContextMenu(false) }}>📋 Copy</button>
              <button onClick={() => { onForward(msg); setShowContextMenu(false) }}>➡️ Forward</button>
              {isSelf && <button onClick={() => { onEdit(); setShowContextMenu(false) }}>✏️ Edit</button>}
              {canPin && <button onClick={() => { onPin(msg); setShowContextMenu(false) }}>📌 Pin</button>}
            </div>
          </>
        )}

        {/* Bubble */}
        {isEditing ? (
          <div className="chat-edit-wrap">
            <input className="chat-edit-input" value={editText}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEditSave(); if (e.key === 'Escape') onEditCancel() }}
              autoFocus />
            <div className="chat-edit-actions">
              <button onClick={onEditSave}>Save</button>
              <button onClick={onEditCancel}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className={`chat-bubble ${isSelf ? 'chat-bubble--self' : 'chat-bubble--other'} ${isFirstUnread ? 'chat-bubble--first-unread' : ''}`}>
            <span className="chat-bubble-text">{renderText()}</span>
            {msg.edited && <span className="chat-edited">(edited)</span>}
          </div>
        )}

        {/* Link preview */}
        {hasUrl && !isEditing && textParts.filter(p => p.type === 'url').map((p, i) => (
          <LinkPreview key={i} url={p.value} />
        ))}

        {/* Reactions */}
        <ReactionPills reactions={msg.reactions} onReact={e => onReact(msg.id, e)} isSelf={isSelf} onAddReact={e => onReact(msg.id, e)} />

        {/* Meta */}
        <div className="chat-meta">
          <span className="chat-ts">{formatTs(msg.ts)}</span>
          {isSelf && <StatusIcon status={msg.status || 'sent'} />}
        </div>
      </div>
    </div>
  )
})

const ReplyBanner = memo(({ replyTo, onClear }) => {
  if (!replyTo) return null
  const color = userColor(replyTo.username)
  return (
    <div className="chat-reply-banner" style={{ borderLeftColor: color }}>
      <div className="chat-reply-banner-content">
        <span className="chat-reply-banner-name" style={{ color }}>↩ {replyTo.username}</span>
        <span className="chat-reply-banner-text">{replyTo.text?.slice(0, 60)}</span>
      </div>
      <button className="chat-reply-banner-close" onClick={onClear}>✕</button>
    </div>
  )
})

// ── Main Chat ─────────────────────────────────────────────
export default function Chat({
  socket, roomId, username, userAvatar,
  isOpen, onClose, currentSong, chatHistory = [],
  users = [], isDJ, onAddSongToQueue,
}) {
  const [messages, setMessages]     = useState([])
  const [input, setInput]           = useState('')
  const [editingId, setEditingId]   = useState(null)
  const [editText, setEditText]     = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [typers, setTypers]         = useState([])
  const [atBottom, setAtBottom]     = useState(true)
  const [newCount, setNewCount]     = useState(0)
  const [replyTo, setReplyTo]       = useState(null)
  const [pinnedMsg, setPinnedMsg]   = useState(null)
  const [muted, setMuted]           = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [firstUnreadId, setFirstUnreadId] = useState(null)
  const [forwardMsg, setForwardMsg] = useState(null)
  const [toast, setToast]           = useState('')

  const messagesRef   = useRef(null)
  const inputRef      = useRef(null)
  const typingTimer   = useRef(null)
  const isTypingRef   = useRef(false)
  const prevSongRef   = useRef(null)
  const historySeeded = useRef(false)
  const unreadMarked  = useRef(false)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  // Avatar map
  const avatarMap = useMemo(() => {
    const map = {}
    users.forEach(u => { if (u.username && u.avatar) map[u.username] = u.avatar })
    messages.forEach(m => { if (m.username && m.avatar && !map[m.username]) map[m.username] = m.avatar })
    return map
  }, [users, messages])

  // Seed history
  useEffect(() => {
    if (chatHistory.length > 0 && !historySeeded.current) {
      historySeeded.current = true
      setMessages(chatHistory)
    }
  }, [chatHistory])

  // Now-playing divider
  useEffect(() => {
    if (!currentSong?.title || prevSongRef.current === currentSong.title) return
    prevSongRef.current = currentSong.title
    setMessages(prev => [...prev, { id: `np-${Date.now()}`, type: 'np', text: currentSong.title }])
  }, [currentSong?.title])

  // Socket listeners
  useEffect(() => {
    const onMsg = (msg) => {
      if (!muted) try { navigator.vibrate?.(6) } catch {}
      setMessages(prev => {
        // Mark first unread when chat is closed
        if (!isOpen && !unreadMarked.current) {
          unreadMarked.current = true
          setFirstUnreadId(msg.id)
        }
        return [...prev.slice(-299), { ...msg, type: 'msg', status: 'sent' }]
      })
      setAtBottom(prev => { if (!prev) setNewCount(c => c + 1); return prev })
    }
    const onEcho = (msg) => {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...msg, self: true, status: 'sent' } : m))
    }
    const onEdit = ({ msgId, text }) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text, edited: true } : m))
    }
    const onReaction = ({ msgId, emoji, username: who, action }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m
        const reactions = { ...(m.reactions || {}) }
        if (!reactions[emoji]) reactions[emoji] = { count: 0, users: [] }
        if (action === 'add' && !reactions[emoji].users.includes(who)) {
          reactions[emoji] = { count: reactions[emoji].count + 1, users: [...reactions[emoji].users, who] }
        } else if (action === 'remove') {
          reactions[emoji] = { count: Math.max(0, reactions[emoji].count - 1), users: reactions[emoji].users.filter(u => u !== who) }
        }
        return { ...m, reactions }
      }))
    }
    const onRead = ({ msgId }) => {
      setMessages(prev => prev.map(m => m.self && m.id === msgId ? { ...m, status: 'read' } : m))
    }
    const onPin = ({ msg }) => setPinnedMsg(msg)
    const onUnpin = () => setPinnedMsg(null)
    const onSystem = (msg) => setMessages(prev => [...prev, { id: Date.now(), type: 'system', text: msg.text }])
    const onTyping = ({ username: who, isTyping }) => {
      setTypers(prev => isTyping ? [...prev.filter(u => u !== who), who] : prev.filter(u => u !== who))
    }

    socket.on('chat-msg',      onMsg)
    socket.on('chat-msg-echo', onEcho)
    socket.on('chat-edit',     onEdit)
    socket.on('chat-reaction', onReaction)
    socket.on('chat-read',     onRead)
    socket.on('chat-pin',      onPin)
    socket.on('chat-unpin',    onUnpin)
    socket.on('chat-system',   onSystem)
    socket.on('user-typing',   onTyping)
    return () => {
      socket.off('chat-msg',      onMsg)
      socket.off('chat-msg-echo', onEcho)
      socket.off('chat-edit',     onEdit)
      socket.off('chat-reaction', onReaction)
      socket.off('chat-read',     onRead)
      socket.off('chat-pin',      onPin)
      socket.off('chat-unpin',    onUnpin)
      socket.off('chat-system',   onSystem)
      socket.off('user-typing',   onTyping)
    }
  }, [socket, muted, isOpen])

  // Clear unread marker when chat opens
  useEffect(() => {
    if (isOpen) {
      unreadMarked.current = false
      setNewCount(0)
    }
  }, [isOpen])

  // Smart auto-scroll
  useEffect(() => {
    const el = messagesRef.current
    if (!el || !atBottom) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, typers, atBottom])

  // Scroll to first unread when opened
  useEffect(() => {
    if (isOpen && firstUnreadId && messagesRef.current) {
      const el = messagesRef.current.querySelector(`[data-id="${firstUnreadId}"]`)
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200)
    }
  }, [isOpen, firstUnreadId])

  const handleScroll = useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setAtBottom(near)
    if (near) { setNewCount(0); setFirstUnreadId(null) }
  }, [])

  // Focus on open
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 120)
  }, [isOpen])

  // Virtual keyboard handler - always scroll to bottom on mobile when keyboard opens/closes
  useEffect(() => {
    if (!window.visualViewport) return
    const fn = () => { 
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight 
      }
    }
    window.visualViewport.addEventListener('resize', fn)
    return () => window.visualViewport.removeEventListener('resize', fn)
  }, [])

  // Typing
  const handleInputChange = (e) => {
    setInput(e.target.value)
    if (!isTypingRef.current) {
      isTypingRef.current = true
      socket.emit('user-typing', { roomId, username, isTyping: true })
    }
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      isTypingRef.current = false
      socket.emit('user-typing', { roomId, username, isTyping: false })
    }, 1500)
  }

  // Send
  const sendMessage = useCallback(() => {
    const text = input.trim()
    if (!text) return

    // /add command
    if (text.startsWith('/add ')) {
      const url = text.slice(5).trim()
      const vid = ytId(url) || url
      if (vid) {
        const songMsg = { id: Date.now(), type: 'song', username, videoId: vid, text: url, avatar: userAvatar, ts: Date.now() }
        socket.emit('chat-msg', { roomId, msg: songMsg })
        socket.emit('add-song', { roomId, videoId: vid, title: url, addedBy: username })
        setMessages(prev => [...prev, { ...songMsg, self: true }])
        setInput('')
        // Close pickers
        setShowGifPicker(false)
        setShowPicker(false)
        return
      }
    }

    const msg = {
      id: Date.now(), type: 'msg', username,
      text, avatar: userAvatar || null, ts: Date.now(), status: 'sending',
      ...(replyTo ? { replyTo: { id: replyTo.id, username: replyTo.username, text: replyTo.text } } : {})
    }
    socket.emit('chat-msg', { roomId, msg })
    setMessages(prev => [...prev, { ...msg, self: true }])
    setInput(''); setReplyTo(null)
    clearTimeout(typingTimer.current)
    isTypingRef.current = false
    socket.emit('user-typing', { roomId, username, isTyping: false })
    setAtBottom(true); setNewCount(0)
    // Close pickers
    setShowGifPicker(false)
    setShowPicker(false)
    setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }), 30)
  }, [input, socket, roomId, username, userAvatar, replyTo])

  const handleReact = useCallback((msgId, emoji) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    const already = msg.reactions?.[emoji]?.users?.includes(username)
    socket.emit('chat-reaction', { roomId, msgId, emoji, username, action: already ? 'remove' : 'add' })
    try { navigator.vibrate?.(8) } catch {}
  }, [messages, socket, roomId, username])

  const handlePin = useCallback((msg) => {
    socket.emit('chat-pin', { roomId, msg })
    setPinnedMsg(msg)
  }, [socket, roomId])

  const handleCopy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => showToast('📋 Copied!'))
  }, [])

  const handleGifSelect = useCallback((gif) => {
    const msg = {
      id: Date.now(), type: 'gif', username,
      gif: gif.url, preview: gif.preview,
      text: gif.title || 'GIF',
      avatar: userAvatar || null, ts: Date.now(), status: 'sending',
    }
    socket.emit('chat-msg', { roomId, msg })
    setMessages(prev => [...prev, { ...msg, self: true }])
    setShowGifPicker(false)
    setAtBottom(true)
    setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }), 30)
  }, [socket, roomId, username, userAvatar])

  const handleForward = useCallback((msg) => {
    setForwardMsg(msg)
    navigator.clipboard.writeText(msg.text).then(() => showToast('✉️ Message copied to clipboard'))
  }, [])

  const handleEditSave = useCallback((msgId) => {
    if (!editText.trim()) return
    const msg = messages.find(m => m.id === msgId)
    if (!msg || editText.trim() === msg.text) { setEditingId(null); return }
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: editText.trim(), edited: true } : m))
    socket.emit('chat-edit', { roomId, msgId, text: editText.trim() })
    setEditingId(null)
  }, [editText, messages, socket, roomId])

  const scrollToBottom = () => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
    setAtBottom(true); setNewCount(0)
  }

  // Filtered messages for search
  const displayMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages
    const q = searchQuery.toLowerCase()
    return messages.filter(m => m.type === 'msg' && m.text?.toLowerCase().includes(q))
  }, [messages, searchQuery])

  // Auto-scroll to first search result
  useEffect(() => {
    if (searchQuery && displayMessages.length > 0 && messagesRef.current) {
      const firstResult = displayMessages[0]
      const el = messagesRef.current.querySelector(`[data-id="${firstResult.id}"]`)
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
      }
    }
  }, [searchQuery, displayMessages])

  // Insert date dividers
  const messagesWithDividers = useMemo(() => {
    const result = []
    let lastDate = null
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
    <div className="chat-panel">
      {/* Pinned message */}
      <PinnedBanner msg={pinnedMsg} canPin={isDJ} onDismiss={() => { setPinnedMsg(null); socket.emit('chat-unpin', { roomId }) }} />

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </span>
          <span className="chat-header-title">Room Chat</span>
          {currentSong && !searchOpen && (
            <span className="chat-header-np">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
              {currentSong.title.length > 18 ? currentSong.title.slice(0, 18) + '…' : currentSong.title}
            </span>
          )}
        </div>
        <div className="chat-header-actions">
          {searchOpen
            ? <input className="chat-search-input" placeholder="Search messages…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} autoFocus />
            : null
          }
          <button className={`chat-header-btn ${searchOpen ? 'active' : ''}`} onClick={() => { setSearchOpen(p => !p); setSearchQuery('') }} title="Search">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          </button>
          <button className={`chat-header-btn ${muted ? 'active' : ''}`} onClick={() => setMuted(p => !p)} title={muted ? 'Unmute' : 'Mute'}>
            {muted
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A6.97 6.97 0 0 1 14 18.98v2.06A8.99 8.99 0 0 0 17.54 19l1.73 1.73L20.54 19 5.54 4 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
            }
          </button>
          <button className="chat-close" onClick={onClose}>
            {IS_MOBILE
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            }
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={messagesRef} onScroll={handleScroll}>
        {messages.length === 0 && !searchQuery && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p className="chat-empty-title">No messages yet</p>
            <p className="chat-empty-sub">Be the first to say something</p>
          </div>
        )}
        {searchQuery && displayMessages.filter(m => m.type === 'msg').length === 0 && (
          <div className="chat-empty">
            <p className="chat-empty-title">No results for "{searchQuery}"</p>
          </div>
        )}

        {messagesWithDividers.map((msg, i) => {
          if (msg.type === 'date')   return <DateDivider key={msg.id} ts={msg.ts} />
          if (msg.type === 'system') return <SystemMsg key={msg.id} msg={msg} />
          if (msg.type === 'np')     return <NowPlayingDivider key={msg.id} msg={msg} />
          if (msg.type === 'song')   return <SongCard key={msg.id} msg={msg} onAddToQueue={!msg.self ? onAddSongToQueue : null} />
          if (msg.type === 'stamp')  return <StampCard key={msg.id} msg={msg} />
          if (msg.type === 'gif')    return (
            <div key={msg.id} className={`chat-gif-row ${msg.self ? 'chat-gif-row--self' : ''}`} data-id={msg.id}>
              {isFirstUnread && <UnreadDivider />}
              <img src={msg.gif} alt={msg.text} className="chat-gif-img" loading="lazy"
                onClick={() => window.open(msg.gif, '_blank')} />
              <div className="chat-meta" style={{ padding: '0 14px 4px', justifyContent: msg.self ? 'flex-end' : 'flex-start' }}>
                <span className="chat-ts">{formatTs(msg.ts)}</span>
                {msg.self && <StatusIcon status={msg.status || 'sent'} />}
              </div>
            </div>
          )

          const prevMsg = messagesWithDividers[i - 1]
          const nextMsg = messagesWithDividers[i + 1]
          const isFirstInGroup = !prevMsg || prevMsg.type !== 'msg' || prevMsg.username !== msg.username
          const isLastInGroup  = !nextMsg || nextMsg.type !== 'msg' || nextMsg.username !== msg.username
          const isFirstUnread  = msg.id === firstUnreadId

          return (
            <div key={msg.id} data-id={msg.id}>
              {isFirstUnread && <UnreadDivider />}
              <ChatBubble
                msg={msg}
                isSelf={!!msg.self}
                showAvatar={isLastInGroup}
                showName={isFirstInGroup}
                avatarSrc={msg.avatar || avatarMap[msg.username]}
                onReact={handleReact}
                onReply={setReplyTo}
                onForward={handleForward}
                onCopy={handleCopy}
                onPin={handlePin}
                onEdit={() => { setEditingId(msg.id); setEditText(msg.text) }}
                isEditing={editingId === msg.id}
                editText={editText}
                onEditChange={setEditText}
                onEditSave={() => handleEditSave(msg.id)}
                onEditCancel={() => setEditingId(null)}
                isFirstUnread={isFirstUnread}
                canPin={isDJ}
              />
            </div>
          )
        })}
        <TypingIndicator typers={typers.filter(u => u !== username)} avatarMap={avatarMap} />
      </div>

      {/* Scroll to bottom */}
      {!atBottom && (
        <button className="chat-scroll-btn" onClick={scrollToBottom}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
          {newCount > 0 && <span className="chat-scroll-badge">{newCount}</span>}
        </button>
      )}

      {/* Toast */}
      {toast && <div className="chat-toast">{toast}</div>}

      {/* GIF picker */}
      {showGifPicker && (
        <div className="chat-gif-wrap">
          <GifPicker
            onSelect={handleGifSelect}
            onClose={() => setShowGifPicker(false)}
          />
        </div>
      )}

      {/* Emoji picker */}
      {showPicker && (
        <>
          <div className="chat-picker-overlay" onClick={() => setShowPicker(false)} />
          <div className="chat-emoji-wrap">
            <EmojiPicker onSelect={e => { setInput(p => p + e); setShowPicker(false); inputRef.current?.focus() }}
              onClose={() => setShowPicker(false)} />
          </div>
        </>
      )}

      {/* Reply banner */}
      <ReplyBanner replyTo={replyTo} onClear={() => setReplyTo(null)} />

      {/* Input */}
      <div className="chat-input-row">
        <button className={`chat-emoji-btn ${showPicker ? 'active' : ''}`}
          onClick={() => { setShowGifPicker(false); setShowPicker(p => !p) }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
        </button>
        <button className={`chat-gif-btn ${showGifPicker ? 'active' : ''}`}
          onClick={() => { setShowPicker(false); setShowGifPicker(p => !p) }}
          title="Send a GIF">
          <span className="chat-gif-label">GIF</span>
        </button>
        <input ref={inputRef} type="text" className="chat-input"
          placeholder={replyTo ? `Reply to ${replyTo.username}…` : muted ? '🔕 Chat muted' : 'Say something… (/add URL)'}
          value={input} onChange={handleInputChange} maxLength={300}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              // Clear typing indicator immediately
              clearTimeout(typingTimer.current)
              isTypingRef.current = false
              socket.emit('user-typing', { roomId, username, isTyping: false })
              sendMessage()
            }
          }}
          disabled={muted} inputMode="text" autoComplete="off" autoCorrect="on" />
        <button className={`chat-send-btn ${input.trim() && !muted ? 'active' : ''}`}
          onClick={sendMessage} disabled={!input.trim() || muted}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  )
}