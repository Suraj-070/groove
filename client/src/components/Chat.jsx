import { useState, useEffect, useRef, useCallback, memo } from 'react'
import EmojiPicker from './EmojiPicker'

// ── Unique user colors derived from username ──────────────────────────────────
const USER_COLORS = [
  '#7c6aff', '#ff6a8a', '#6affb8', '#ffb86a',
  '#6ab8ff', '#ff6aff', '#afffaf', '#ffd96a',
]
function userColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return USER_COLORS[Math.abs(h) % USER_COLORS.length]
}
function userInitial(name = '') { return name.slice(0, 1).toUpperCase() || '?' }

// ── Message types ─────────────────────────────────────────────────────────────
// type: 'msg' | 'system' | 'np' (now-playing divider)

const SystemMsg = memo(({ msg }) => (
  <div className="chat-system">
    <span className="chat-system-text">{msg.text}</span>
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

const ChatBubble = memo(({ msg, isSelf, showAvatar }) => {
  const color = userColor(msg.username)
  return (
    <div className={`chat-row ${isSelf ? 'chat-row--self' : 'chat-row--other'}`}>
      {/* Avatar — only shown on first message in a group */}
      {!isSelf && (
        <div className="chat-avatar-col">
          {showAvatar ? (
            <div className="chat-avatar" style={{ background: color }}>
              {userInitial(msg.username)}
            </div>
          ) : (
            <div className="chat-avatar-spacer" />
          )}
        </div>
      )}

      <div className="chat-bubble-col">
        {!isSelf && showAvatar && (
          <span className="chat-name" style={{ color }}>{msg.username}</span>
        )}
        <div className={`chat-bubble ${isSelf ? 'chat-bubble--self' : 'chat-bubble--other'}`}>
          <span className="chat-bubble-text">{msg.text}</span>
        </div>
        <span className="chat-ts">{msg.time}</span>
      </div>
    </div>
  )
})

// ── Typing indicator ──────────────────────────────────────────────────────────
const TypingIndicator = memo(({ typers }) => {
  if (!typers.length) return null
  const label = typers.length === 1
    ? `${typers[0]} is typing`
    : typers.length === 2
      ? `${typers[0]} and ${typers[1]} are typing`
      : 'Several people are typing'
  return (
    <div className="chat-typing">
      <div className="chat-typing-dots">
        <span /><span /><span />
      </div>
      <span className="chat-typing-label">{label}</span>
    </div>
  )
})

// ── Scroll-to-bottom button ───────────────────────────────────────────────────
const ScrollBtn = memo(({ count, onClick }) => (
  <button className="chat-scroll-btn" onClick={onClick}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
    {count > 0 && <span className="chat-scroll-badge">{count}</span>}
  </button>
))

// ── Main Chat component ───────────────────────────────────────────────────────
export default function Chat({ socket, roomId, username, isOpen, onClose, currentSong }) {
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [typers, setTypers]       = useState([])
  const [atBottom, setAtBottom]   = useState(true)
  const [newCount, setNewCount]   = useState(0)

  const messagesRef  = useRef(null)
  const inputRef     = useRef(null)
  const typingTimer  = useRef(null)
  const isTypingRef  = useRef(false)
  const prevSongRef  = useRef(null)

  // ── Now-playing divider when song changes ─────────────────────────────────
  useEffect(() => {
    if (!currentSong?.title) return
    if (prevSongRef.current === currentSong.title) return
    prevSongRef.current = currentSong.title
    setMessages(prev => [
      ...prev,
      { id: `np-${Date.now()}`, type: 'np', text: currentSong.title }
    ])
  }, [currentSong?.title])

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleMsg = (msg) => {
      setMessages(prev => [...prev.slice(-199), { ...msg, type: 'msg' }])
      // If not at bottom, count as unread
      setAtBottom(prev => { if (!prev) setNewCount(c => c + 1); return prev })
    }
    const handleSystem = (msg) => {
      setMessages(prev => [...prev, { id: Date.now(), type: 'system', text: msg.text }])
    }
    const handleTyping = ({ username: who, isTyping }) => {
      setTypers(prev =>
        isTyping ? [...prev.filter(u => u !== who), who] : prev.filter(u => u !== who)
      )
    }
    socket.on('chat-msg',    handleMsg)
    socket.on('chat-system', handleSystem)
    socket.on('user-typing', handleTyping)
    return () => {
      socket.off('chat-msg',    handleMsg)
      socket.off('chat-system', handleSystem)
      socket.off('user-typing', handleTyping)
    }
  }, [socket])

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = messagesRef.current
    if (!el || !atBottom) return
    el.scrollTop = el.scrollHeight
  }, [messages, typers, atBottom])

  // ── Track scroll position ─────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAtBottom(near)
    if (near) setNewCount(0)
  }, [])

  // ── Focus input on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 120)
  }, [isOpen])

  // ── Typing emit ───────────────────────────────────────────────────────────
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

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    if (!input.trim()) return
    const msg = {
      id: Date.now(), type: 'msg', username,
      text: input.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    socket.emit('chat-msg', { roomId, msg })
    setMessages(prev => [...prev, { ...msg, self: true }])
    setInput('')
    // Stop typing
    clearTimeout(typingTimer.current)
    isTypingRef.current = false
    socket.emit('user-typing', { roomId, username, isTyping: false })
    // Scroll to bottom
    setAtBottom(true)
    setNewCount(0)
    setTimeout(() => {
      const el = messagesRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, 30)
  }, [input, socket, roomId, username])

  const scrollToBottom = () => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
    setAtBottom(true)
    setNewCount(0)
  }

  // Mobile: isOpen gates render. Desktop: always rendered, panel-inline CSS shows/hides
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
        <button className="chat-close" onClick={onClose} aria-label="Close chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={messagesRef} onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🎵</div>
            <p className="chat-empty-title">No messages yet</p>
            <p className="chat-empty-sub">Be the first to say something</p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.type === 'system') return <SystemMsg key={msg.id} msg={msg} />
          if (msg.type === 'np')     return <NowPlayingDivider key={msg.id} msg={msg} />
          // Group consecutive messages from same user
          const prev = messages[i - 1]
          const showAvatar = !prev || prev.type !== 'msg' || prev.username !== msg.username
          return (
            <ChatBubble
              key={msg.id}
              msg={msg}
              isSelf={!!msg.self}
              showAvatar={showAvatar}
            />
          )
        })}

        <TypingIndicator typers={typers.filter(u => u !== username)} />
      </div>

      {/* Scroll-to-bottom button */}
      {!atBottom && (
        <ScrollBtn count={newCount} onClick={scrollToBottom} />
      )}

      {/* Emoji picker */}
      {showPicker && (
        <div className="chat-emoji-wrap">
          <EmojiPicker
            onSelect={(emoji) => {
              setInput(prev => prev + emoji)
              setShowPicker(false)
              inputRef.current?.focus()
            }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}

      {/* Input row */}
      <div className="chat-input-row">
        <button
          className={`chat-emoji-btn ${showPicker ? 'active' : ''}`}
          onClick={() => setShowPicker(p => !p)}
          aria-label="Emoji"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
        </button>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder="Say something…"
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          maxLength={300}
        />
        <button
          className={`chat-send-btn ${input.trim() ? 'active' : ''}`}
          onClick={sendMessage}
          aria-label="Send"
          disabled={!input.trim()}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  )
}