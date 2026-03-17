import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react'
import EmojiPicker from './EmojiPicker'

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

// Detect URLs in text
function parseText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = []
  let last = 0, m
  while ((m = urlRegex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) })
    parts.push({ type: 'url', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts.length ? parts : [{ type: 'text', value: text }]
}

// Extract YouTube video ID from URL
function ytId(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

// ── Link Preview ──────────────────────────────────────────
const LinkPreview = memo(({ url }) => {
  const vid = ytId(url)
  if (vid) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="chat-link-preview" onClick={e => e.stopPropagation()}>
        <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="" className="chat-link-thumb" loading="lazy" />
        <div className="chat-link-info">
          <span className="chat-link-domain">▶ YouTube</span>
          <span className="chat-link-url">{url.slice(0, 40)}{url.length > 40 ? '…' : ''}</span>
        </div>
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="chat-link-plain" onClick={e => e.stopPropagation()}>
      {url.slice(0, 50)}{url.length > 50 ? '…' : ''}
    </a>
  )
})

// ── Message status indicator ──────────────────────────────
const StatusIcon = memo(({ status }) => {
  if (status === 'sending') return <span className="chat-status chat-status--sending">○</span>
  if (status === 'sent')    return <span className="chat-status chat-status--sent">✓</span>
  if (status === 'read')    return <span className="chat-status chat-status--read">✓✓</span>
  return null
})

// ── Reply quote ───────────────────────────────────────────
const ReplyQuote = memo(({ reply, avatarSrc }) => {
  if (!reply) return null
  const color = userColor(reply.username)
  return (
    <div className="chat-reply-quote" style={{ borderLeftColor: color }}>
      <span className="chat-reply-name" style={{ color }}>{reply.username}</span>
      <span className="chat-reply-text">{reply.text?.slice(0, 60)}{reply.text?.length > 60 ? '…' : ''}</span>
    </div>
  )
})

// ── Reaction pills ────────────────────────────────────────
const ReactionPills = memo(({ reactions = {}, onReact, isSelf }) => {
  const entries = Object.entries(reactions).filter(([, v]) => v.count > 0)
  if (!entries.length) return null
  return (
    <div className={`chat-reactions ${isSelf ? 'chat-reactions--self' : ''}`}>
      {entries.map(([emoji, { count, users }]) => (
        <button
          key={emoji}
          className={`chat-reaction-pill ${users?.includes?.('me') ? 'active' : ''}`}
          onClick={() => onReact(emoji)}
          title={users?.join?.(', ')}
        >
          {emoji} <span>{count}</span>
        </button>
      ))}
    </div>
  )
})

// ── Typing indicator with avatars ─────────────────────────
const TypingIndicator = memo(({ typers, avatarMap }) => {
  if (!typers.length) return null
  return (
    <div className="chat-typing">
      <div className="chat-typing-avatars">
        {typers.slice(0, 3).map(who => {
          const src = avatarMap[who]
          const color = userColor(who)
          return src
            ? <img key={who} src={src} alt={who} className="chat-typing-avatar" />
            : <div key={who} className="chat-typing-avatar chat-typing-avatar--initials" style={{ background: color }}>{userInitial(who)}</div>
        })}
      </div>
      <div className="chat-typing-bubble">
        <span className="chat-typing-dot" /><span className="chat-typing-dot" /><span className="chat-typing-dot" />
      </div>
      <span className="chat-typing-label">
        {typers.length === 1 ? `${typers[0]} is typing` : `${typers.length} people are typing`}
      </span>
    </div>
  )
})

const SystemMsg = memo(({ msg }) => (
  <div className="chat-system"><span className="chat-system-text">{msg.text}</span></div>
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

// ── Chat Bubble ───────────────────────────────────────────
const ChatBubble = memo(({
  msg, isSelf, showAvatar, avatarSrc,
  onReact, onReply,
  onEdit, isEditing, editText, onEditChange, onEditSave, onEditCancel,
  replyMsg,
}) => {
  const color = userColor(msg.username)
  const [showActions, setShowActions] = useState(false)
  const [showReactPicker, setShowReactPicker] = useState(false)
  const swipeRef = useRef(null)
  const swipeStartX = useRef(null)

  // ── Swipe to reply ──────────────────────────────────────
  const onTouchStart = (e) => { swipeStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (swipeStartX.current === null) return
    const dx = e.changedTouches[0].clientX - swipeStartX.current
    if (dx > 50) { onReply(msg); try { navigator.vibrate?.(8) } catch {} }
    swipeStartX.current = null
    if (swipeRef.current) swipeRef.current.style.transform = ''
  }
  const onTouchMove = (e) => {
    if (swipeStartX.current === null) return
    const dx = Math.max(0, e.touches[0].clientX - swipeStartX.current)
    if (swipeRef.current && dx < 80) swipeRef.current.style.transform = `translateX(${dx * 0.4}px)`
  }

  const textParts = parseText(msg.text || '')
  const hasUrl = textParts.some(p => p.type === 'url')

  return (
    <div
      className={`chat-row ${isSelf ? 'chat-row--self' : 'chat-row--other'}`}
      onMouseEnter={() => setShowActions(true)}
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

      <div
        className="chat-bubble-col"
        ref={swipeRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transition: 'transform 0.2s' }}
      >
        {!isSelf && showAvatar && <span className="chat-name" style={{ color }}>{msg.username}</span>}

        {/* Reply quote */}
        {msg.replyTo && <ReplyQuote reply={msg.replyTo} />}

        {/* Hover action bar */}
        {showActions && !isEditing && (
          <div className={`chat-action-bar ${isSelf ? 'chat-action-bar--self' : ''}`}>
            <button className="chat-action-icon" onClick={() => setShowReactPicker(p => !p)} title="React">😊</button>
            <button className="chat-action-icon" onClick={() => onReply(msg)} title="Reply">
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
            </button>
            {isSelf && (
              <button className="chat-action-icon" onClick={onEdit} title="Edit">
                <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
            )}
          </div>
        )}

        {/* Inline reaction picker */}
        {showReactPicker && (
          <div className={`chat-quick-react ${isSelf ? 'chat-quick-react--self' : ''}`}>
            {['❤️','🔥','😂','😮','👏','💀','🎵','✨'].map(e => (
              <button key={e} onClick={() => { onReact(msg.id, e); setShowReactPicker(false) }}>{e}</button>
            ))}
          </div>
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
          <div className={`chat-bubble ${isSelf ? 'chat-bubble--self' : 'chat-bubble--other'}`}>
            <span className="chat-bubble-text">
              {textParts.map((p, i) =>
                p.type === 'url'
                  ? <a key={i} href={p.value} target="_blank" rel="noopener noreferrer" className="chat-link" onClick={e => e.stopPropagation()}>{p.value}</a>
                  : <span key={i}>{p.value}</span>
              )}
            </span>
            {msg.edited && <span className="chat-edited">(edited)</span>}
          </div>
        )}

        {/* Link preview */}
        {hasUrl && !isEditing && textParts.filter(p => p.type === 'url').map((p, i) => (
          <LinkPreview key={i} url={p.value} />
        ))}

        {/* Reaction pills */}
        <ReactionPills reactions={msg.reactions} onReact={e => onReact(msg.id, e)} isSelf={isSelf} />

        {/* Timestamp + status */}
        <div className="chat-meta">
          <span className="chat-ts">{formatTs(msg.ts)}</span>
          {isSelf && <StatusIcon status={msg.status || 'sent'} />}
        </div>
      </div>
    </div>
  )
})

// ── Reply banner ──────────────────────────────────────────
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
export default function Chat({ socket, roomId, username, userAvatar, isOpen, onClose, currentSong, chatHistory = [], users = [] }) {
  const [messages, setMessages]     = useState([])
  const [input, setInput]           = useState('')
  const [editingId, setEditingId]   = useState(null)
  const [editText, setEditText]     = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [typers, setTypers]         = useState([])
  const [atBottom, setAtBottom]     = useState(true)
  const [newCount, setNewCount]     = useState(0)
  const [replyTo, setReplyTo]       = useState(null)

  const messagesRef  = useRef(null)
  const inputRef     = useRef(null)
  const typingTimer  = useRef(null)
  const isTypingRef  = useRef(false)
  const prevSongRef  = useRef(null)
  const historySeeded = useRef(false)

  // Avatar map from users + message history
  const avatarMap = useMemo(() => {
    const map = {}
    users.forEach(u => { if (u.username && u.avatar) map[u.username] = u.avatar })
    messages.forEach(m => { if (m.username && m.avatar && !map[m.username]) map[m.username] = m.avatar })
    return map
  }, [users, messages])

  // Seed history once
  useEffect(() => {
    if (chatHistory.length > 0 && !historySeeded.current) {
      historySeeded.current = true
      setMessages(chatHistory)
    }
  }, [chatHistory])

  // Now-playing divider
  useEffect(() => {
    if (!currentSong?.title) return
    if (prevSongRef.current === currentSong.title) return
    prevSongRef.current = currentSong.title
    setMessages(prev => [...prev, { id: `np-${Date.now()}`, type: 'np', text: currentSong.title }])
  }, [currentSong?.title])

  // Socket listeners
  useEffect(() => {
    const handleMsg = (msg) => {
      setMessages(prev => [...prev.slice(-299), { ...msg, type: 'msg', status: 'sent' }])
      setAtBottom(prev => { if (!prev) setNewCount(c => c + 1); return prev })
      // Mark as read if at bottom
      if (messagesRef.current) {
        const el = messagesRef.current
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        if (near) socket.emit('chat-read', { roomId, msgId: msg.id })
      }
    }
    const handleEcho = (msg) => {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...msg, self: true, status: 'sent' } : m))
    }
    const handleEdit = ({ msgId, text }) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text, edited: true } : m))
    }
    const handleReaction = ({ msgId, emoji, username: who, action }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m
        const reactions = { ...(m.reactions || {}) }
        if (!reactions[emoji]) reactions[emoji] = { count: 0, users: [] }
        if (action === 'add') {
          if (!reactions[emoji].users.includes(who)) {
            reactions[emoji] = { count: reactions[emoji].count + 1, users: [...reactions[emoji].users, who] }
          }
        } else {
          reactions[emoji] = { count: Math.max(0, reactions[emoji].count - 1), users: reactions[emoji].users.filter(u => u !== who) }
        }
        return { ...m, reactions }
      }))
    }
    const handleRead = ({ msgId }) => {
      setMessages(prev => prev.map(m => m.self && m.id === msgId ? { ...m, status: 'read' } : m))
    }
    const handleSystem = (msg) => {
      setMessages(prev => [...prev, { id: Date.now(), type: 'system', text: msg.text }])
    }
    const handleTyping = ({ username: who, isTyping }) => {
      setTypers(prev => isTyping ? [...prev.filter(u => u !== who), who] : prev.filter(u => u !== who))
    }

    socket.on('chat-msg',      handleMsg)
    socket.on('chat-msg-echo', handleEcho)
    socket.on('chat-edit',     handleEdit)
    socket.on('chat-reaction', handleReaction)
    socket.on('chat-read',     handleRead)
    socket.on('chat-system',   handleSystem)
    socket.on('user-typing',   handleTyping)
    return () => {
      socket.off('chat-msg',      handleMsg)
      socket.off('chat-msg-echo', handleEcho)
      socket.off('chat-edit',     handleEdit)
      socket.off('chat-reaction', handleReaction)
      socket.off('chat-read',     handleRead)
      socket.off('chat-system',   handleSystem)
      socket.off('user-typing',   handleTyping)
    }
  }, [socket, roomId])

  // Smart auto-scroll — only if already at bottom
  useEffect(() => {
    const el = messagesRef.current
    if (!el || !atBottom) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, typers, atBottom])

  // Scroll tracking with momentum detection
  const handleScroll = useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setAtBottom(near)
    if (near) setNewCount(0)
  }, [])

  // Focus on open
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 120)
  }, [isOpen])

  // Handle virtual keyboard on mobile
  useEffect(() => {
    if (!window.visualViewport) return
    const onResize = () => {
      if (atBottom && messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight
      }
    }
    window.visualViewport.addEventListener('resize', onResize)
    return () => window.visualViewport.removeEventListener('resize', onResize)
  }, [atBottom])

  // Typing emit
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

  // React to message
  const handleReact = useCallback((msgId, emoji) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    const already = msg.reactions?.[emoji]?.users?.includes(username)
    socket.emit('chat-reaction', { roomId, msgId, emoji, username, action: already ? 'remove' : 'add' })
    try { navigator.vibrate?.(8) } catch {}
  }, [messages, socket, roomId, username])

  // Send
  const sendMessage = useCallback(() => {
    if (!input.trim()) return
    const msg = {
      id: Date.now(), type: 'msg', username,
      text: input.trim(),
      avatar: userAvatar || null,
      ts: Date.now(),
      status: 'sending',
      ...(replyTo ? { replyTo: { id: replyTo.id, username: replyTo.username, text: replyTo.text } } : {})
    }
    socket.emit('chat-msg', { roomId, msg })
    setMessages(prev => [...prev, { ...msg, self: true }])
    setInput('')
    setReplyTo(null)
    clearTimeout(typingTimer.current)
    isTypingRef.current = false
    socket.emit('user-typing', { roomId, username, isTyping: false })
    setAtBottom(true)
    setNewCount(0)
    setTimeout(() => {
      const el = messagesRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }, 30)
  }, [input, socket, roomId, username, userAvatar, replyTo])

  const scrollToBottom = () => {
    const el = messagesRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setAtBottom(true); setNewCount(0)
  }

  if (!isOpen) return null

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </span>
          <span className="chat-header-title">Room Chat</span>
          {currentSong && (
            <span className="chat-header-np">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
              {currentSong.title.length > 22 ? currentSong.title.slice(0, 22) + '…' : currentSong.title}
            </span>
          )}
        </div>
        <button className="chat-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={messagesRef} onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p className="chat-empty-title">No messages yet</p>
            <p className="chat-empty-sub">Be the first to say something</p>
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.type === 'system') return <SystemMsg key={msg.id} msg={msg} />
          if (msg.type === 'np')     return <NowPlayingDivider key={msg.id} msg={msg} />
          const prev = messages[i - 1]
          const showAvatar = !prev || prev.type !== 'msg' || prev.username !== msg.username
          return (
            <ChatBubble
              key={msg.id}
              msg={msg}
              isSelf={!!msg.self}
              showAvatar={showAvatar}
              avatarSrc={msg.avatar || avatarMap[msg.username]}
              onReact={handleReact}
              onReply={setReplyTo}
              onEdit={() => { setEditingId(msg.id); setEditText(msg.text) }}
              isEditing={editingId === msg.id}
              editText={editText}
              onEditChange={setEditText}
              onEditSave={() => {
                if (editText.trim() && editText !== msg.text) {
                  setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, text: editText.trim(), edited: true } : m))
                  socket.emit('chat-edit', { roomId, msgId: msg.id, text: editText.trim() })
                }
                setEditingId(null)
              }}
              onEditCancel={() => setEditingId(null)}
            />
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

      {/* Emoji picker */}
      {showPicker && (
        <div className="chat-emoji-wrap">
          <EmojiPicker
            onSelect={emoji => { setInput(p => p + emoji); setShowPicker(false); inputRef.current?.focus() }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}

      {/* Reply banner */}
      <ReplyBanner replyTo={replyTo} onClear={() => setReplyTo(null)} />

      {/* Input row */}
      <div className="chat-input-row">
        <button className={`chat-emoji-btn ${showPicker ? 'active' : ''}`} onClick={() => setShowPicker(p => !p)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
        </button>
        <input
          ref={inputRef} type="text" className="chat-input"
          placeholder={replyTo ? `Reply to ${replyTo.username}…` : 'Say something…'}
          value={input} onChange={handleInputChange} maxLength={300}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
        />
        <button className={`chat-send-btn ${input.trim() ? 'active' : ''}`} onClick={sendMessage} disabled={!input.trim()}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  )
}