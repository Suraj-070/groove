import { useState, useEffect, useRef } from 'react'
import EmojiPicker from './EmojiPicker'

export default function Chat({ socket, roomId, username, isOpen, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const messagesRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    socket.on('chat-msg', (msg) => setMessages(prev => [...prev, msg]))
    return () => socket.off('chat-msg')
  }, [socket])

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }, [isOpen])

  const sendMessage = (text) => {
    if (!text.trim()) return
    const msg = {
      id: Date.now(), username, text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    socket.emit('chat-msg', { roomId, msg })
    setMessages(prev => [...prev, { ...msg, self: true }])
    setInput('')
  }

  if (!isOpen) return null

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>💬 Room Chat</span>
        <button className="chat-close" onClick={onClose}>×</button>
      </div>

      <div className="chat-messages" ref={messagesRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>No messages yet</p>
            <p className="chat-empty-sub">Say something! 👋</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg ${msg.self ? 'self' : ''}`}>
            {!msg.self && <span className="chat-username">{msg.username}</span>}
            <div className="chat-bubble">{msg.text}</div>
            <span className="chat-time">{msg.time}</span>
          </div>
        ))}

      </div>

      {showPicker && (
        <div className="emoji-picker-wrap">
          <EmojiPicker
            onSelect={(emoji) => { setInput(prev => prev + emoji); setShowPicker(false); inputRef.current?.focus() }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}

      <div className="chat-input-row">
        <button className={`emoji-toggle-btn ${showPicker ? 'active' : ''}`}
          onClick={() => setShowPicker(p => !p)}>😊</button>
        <input
          ref={inputRef}
          type="text"
          placeholder="Say something..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
        />
        <button className="send-btn" onClick={() => sendMessage(input)}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
        </button>
      </div>
    </div>
  )
}