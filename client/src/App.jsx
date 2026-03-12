import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { io } from 'socket.io-client'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import Player from './components/Player'
import Queue from './components/Queue'
import RoomJoin from './components/RoomJoin'
import UserList from './components/UserList'
import Chat from './components/Chat'
import ReactionBurst from './components/ReactionBurst'
import SessionRecap from './components/SessionRecap'
import Library from './components/Library'
import Visualizer from './components/Visualizer'
import './App.css'

// ── Detect Discord Activity context ──────────────────────────
const IS_DISCORD = window.location.hostname.endsWith('.discordsays.com')

// ── Backend URL: use /.proxy/api inside Discord, direct otherwise
const BACKEND = IS_DISCORD
  ? '/.proxy/api'
  : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001')

const socket = io(BACKEND, { withCredentials: true, autoConnect: false })

// ── Discord SDK (only init inside Discord) ───────────────────
let discordSdk = null
if (IS_DISCORD) {
  discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID)
}

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [roomId, setRoomId] = useState(null)
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [users, setUsers] = useState([])
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [djMode, setDjMode] = useState(false)
  const [djId, setDjId] = useState(null)
  const [initialTime, setInitialTime] = useState(0)
  const [initialPlaying, setInitialPlaying] = useState(false)
  const [recap, setRecap] = useState(null)
  const [showRecap, setShowRecap] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [queueCollapsed, setQueueCollapsed] = useState(false)
  const [partyMode, setPartyMode] = useState(false)
  const [mobileTab, setMobileTab] = useState('player')
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const isMobileView = windowWidth <= 768

  const isDJ = socket.id === djId

  const handlePrev = () => {
    const prev = currentIndex - 1
    if (prev >= 0) handleLoadSong(prev)
  }

  // ── Auth: Discord Activity vs Web ────────────────────────────
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (IS_DISCORD && discordSdk) {
          // ── Discord Activity auth flow ──
          await discordSdk.ready()

          const { code } = await discordSdk.commands.authorize({
            client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
            response_type: 'code',
            state: '',
            prompt: 'none',
            scope: ['identify']
          })

          // Exchange code for token via our backend
          const res = await fetch(`${BACKEND}/auth/discord/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code })
          })

          if (res.ok) {
            const userData = await res.json()
            setUser(userData)
            // Auto-join a room based on Discord channel
            const channelId = discordSdk.channelId || 'discord-activity'
            setRoomId(channelId)
            if (!socket.connected) socket.connect()
            socket.emit('join-room', {
              roomId: channelId,
              username: userData.username,
              avatar: userData.avatar,
              discordId: userData.id
            })
          }
        } else {
          // ── Standard web auth flow ──
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            const res = await fetch(`${BACKEND}/auth/me`, { credentials: 'include', signal: controller.signal })
            clearTimeout(timeout)
            if (res.ok) {
              const userData = await res.json()
              setUser(userData)
            }
          } catch (e) {
            // Session check failed or timed out — continue as guest
          }

          const params = new URLSearchParams(window.location.search)
          if (params.get('auth') === 'success') {
            window.history.replaceState({}, '', '/')
            try {
              const res2 = await fetch(`${BACKEND}/auth/me`, { credentials: 'include' })
              if (res2.ok) setUser(await res2.json())
            } catch {}
          }
        }
      } catch (e) {
        console.error('Auth init failed:', e)
      } finally {
        setAuthLoading(false)
      }
    }

    initAuth()
  }, [])


  const handleGuestLogin = async ({ username }) => {
    try {
      const res = await fetch(`${BACKEND}/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username })
      })
      if (res.ok) setUser(await res.json())
    } catch (e) {
      console.error('Guest login failed:', e)
    }
  }

  const handleJoin = ({ roomId }) => {
    setRoomId(roomId)
    if (!socket.connected) socket.connect()
    socket.emit('join-room', {
      roomId,
      username: user.username,
      avatar: user.avatar,
      discordId: user.id
    })
  }

  const handleAddSong = ({ videoId, title }) => {
    socket.emit('add-song', { roomId, videoId, title, addedBy: user.username })
  }

  const handleLoadSong = (index) => {
    setCurrentIndex(index)
    socket.emit('load-song', { roomId, index })
  }

  const handleRemoveSong = (index) => {
    socket.emit('remove-song', { roomId, index })
  }

  const handleNext = () => {
    if (djMode && !isDJ) return
    const next = currentIndex + 1
    if (next < queue.length) handleLoadSong(next)
  }

  const handleToggleDJMode = () => {
    socket.emit('toggle-dj-mode', { roomId })
  }

  const handleGetRecap = () => {
    socket.emit('get-recap', { roomId })
  }

  const handleLogout = async () => {
    await fetch(`${BACKEND}/auth/logout`, { credentials: 'include' })
    setUser(null)
    setRoomId(null)
  }

  useEffect(() => {
    const handleNewMsg = () => {
      if (!chatOpen) setUnread((p) => p + 1)
    }
    socket.on('chat-msg', handleNewMsg)
    return () => socket.off('chat-msg', handleNewMsg)
  }, [chatOpen])

  // ── Rejoin room if socket reconnects (e.g. server restart) ─
  useEffect(() => {
    const handleReconnect = () => {
      if (roomId && user) {
        socket.emit('join-room', {
          roomId,
          username: user.username,
          avatar: user.avatar,
          discordId: user.id
        })
      }
    }
    socket.on('connect', handleReconnect)
    return () => socket.off('connect', handleReconnect)
  }, [roomId, user])

  useEffect(() => {
    socket.on('room-state', ({ queue, currentIndex, currentTime, isPlaying, users, djId, djMode }) => {
      setQueue(queue)
      setCurrentIndex(currentIndex)
      setUsers(users)
      setDjId(djId)
      setDjMode(djMode)
      setInitialTime(currentTime)
      setInitialPlaying(isPlaying)
      setIsPlaying(isPlaying)
    })
    socket.on('queue-updated', ({ queue }) => setQueue(queue))
    socket.on('load-song', ({ index, queue: updatedQueue }) => {
      if (updatedQueue) setQueue(updatedQueue)
      setCurrentIndex(index)
      // Don't set isPlaying here — Player's onStateChange handles it
    })
    socket.on('user-joined', ({ users }) => setUsers(users))
    socket.on('user-left', ({ users }) => setUsers(users))
    socket.on('dj-mode-changed', ({ djMode, djId }) => { setDjMode(djMode); setDjId(djId) })
    socket.on('recap-data', (data) => { setRecap(data); setShowRecap(true) })
    socket.on('play', () => setIsPlaying(true))
    socket.on('pause', () => setIsPlaying(false))

    return () => {
      socket.off('room-state'); socket.off('queue-updated'); socket.off('load-song')
      socket.off('user-joined'); socket.off('user-left')
      socket.off('dj-mode-changed'); socket.off('recap-data')
      socket.off('play'); socket.off('pause')
    }
  }, [])

  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-logo-wrap">
          <svg className="auth-logo-svg" width="80" height="80" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="alg1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7c6aff"/>
                <stop offset="100%" stopColor="#ff6a8a"/>
              </linearGradient>
              <linearGradient id="alg2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.95"/>
                <stop offset="100%" stopColor="#e0daff"/>
              </linearGradient>
            </defs>
            <circle cx="28" cy="28" r="28" fill="url(#alg1)" opacity="0.15"/>
            <circle cx="28" cy="28" r="22" fill="url(#alg1)" opacity="0.2"/>
            <path d="M14 22 Q10 28 14 34" stroke="url(#alg1)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
            <path d="M10 18 Q4 28 10 38" stroke="url(#alg1)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
            <path d="M42 22 Q46 28 42 34" stroke="url(#alg1)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
            <path d="M46 18 Q52 28 46 38" stroke="url(#alg1)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
            <path d="M24 36V22l12-3v14" stroke="url(#alg2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="22" cy="36" r="3.5" fill="url(#alg2)"/>
            <circle cx="34" cy="33" r="3.5" fill="url(#alg2)"/>
          </svg>
          <svg className="auth-ring" width="110" height="110" viewBox="0 0 110 110" fill="none">
            <circle cx="55" cy="55" r="50" stroke="url(#rg1)" strokeWidth="2" strokeLinecap="round" strokeDasharray="80 240"/>
            <defs>
              <linearGradient id="rg1" x1="0" y1="0" x2="110" y2="110" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7c6aff"/>
                <stop offset="100%" stopColor="#ff6a8a"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="auth-text">
          <span className="auth-title-big">GROOVE</span>
          <span className="auth-title-small">· together ·</span>
        </div>
        <p className="auth-status">{IS_DISCORD ? 'Loading Activity...' : 'Checking session...'}</p>
      </div>
    )
  }

  if (!roomId) return <RoomJoin onJoin={handleJoin} user={user} onGuestLogin={handleGuestLogin} />

  return (
    <div className="app">
      <Visualizer isPlaying={isPlaying} partyMode={partyMode} />
      <ReactionBurst socket={socket} roomId={roomId} username={user?.username} />

      <header className="app-header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="hg1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7c6aff"/>
                <stop offset="100%" stopColor="#ff6a8a"/>
              </linearGradient>
              <linearGradient id="hg2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.95"/>
                <stop offset="100%" stopColor="#e0daff"/>
              </linearGradient>
            </defs>
            <circle cx="28" cy="28" r="28" fill="url(#hg1)" opacity="0.15"/>
            <circle cx="28" cy="28" r="22" fill="url(#hg1)" opacity="0.2"/>
            <path d="M14 22 Q10 28 14 34" stroke="url(#hg1)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
            <path d="M10 18 Q4 28 10 38" stroke="url(#hg1)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
            <path d="M42 22 Q46 28 42 34" stroke="url(#hg1)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
            <path d="M46 18 Q52 28 46 38" stroke="url(#hg1)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
            <path d="M24 36V22l12-3v14" stroke="url(#hg2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="22" cy="36" r="3.5" fill="url(#hg2)"/>
            <circle cx="34" cy="33" r="3.5" fill="url(#hg2)"/>
          </svg>
          <div className="logo-text">
            <span className="logo-big">GROOVE</span>
            <span className="logo-small">· together ·</span>
          </div>
        </div>
        <div className="header-right">
          <div className="room-badge">Room: <span>{roomId}</span></div>

          {isDJ && (
            <button className={`dj-toggle-btn ${djMode ? 'active' : ''}`} onClick={handleToggleDJMode}>
              {djMode ? '👑 DJ Mode' : '🎛 Free Mode'}
            </button>
          )}

          <button className={`recap-btn party-btn ${partyMode ? 'party-active' : ''}`} onClick={() => setPartyMode(p => !p)} title="Party Mode">🎊</button>
          <button className="recap-btn" onClick={handleGetRecap} title="Session Recap">📊</button>
          <button className="recap-btn" onClick={() => setLibraryOpen(true)} title="My Library">📚</button>

          <button className="chat-toggle-btn" onClick={() => { setChatOpen(true); setUnread(0) }}>
            💬
            {unread > 0 && <span className="unread-badge">{unread}</span>}
          </button>

          {user && (
            <div className="profile-wrap" ref={profileRef}>
              <button
                className={`profile-trigger ${profileOpen ? 'active' : ''}`}
                onClick={() => setProfileOpen(p => !p)}
                title="Profile"
              >
                {user.avatar
                  ? <img src={user.avatar} alt="" className="header-avatar" />
                  : <div className="header-avatar-placeholder">{user.username?.slice(0,2).toUpperCase()}</div>
                }
                <span className="profile-chevron">{profileOpen ? '▲' : '▼'}</span>
              </button>

              {profileOpen && createPortal(
                <>
                  <div className="profile-backdrop" onClick={() => setProfileOpen(false)} />
                  <div className="profile-dropdown profile-dropdown--portal">
                    <div className="pd-header">
                      <div className="pd-avatar-wrap">
                        {user.avatar
                          ? <img src={user.avatar} alt="" className="pd-avatar" />
                          : <div className="pd-avatar-placeholder">{user.username?.slice(0,2).toUpperCase()}</div>
                        }
                        <span className="pd-online-dot" />
                      </div>
                      <div className="pd-info">
                        <p className="pd-name">{user.username}</p>
                        <p className="pd-tag">{IS_DISCORD ? 'Discord Activity' : 'via Discord'}</p>
                      </div>
                    </div>

                    <div className="pd-divider" />

                    <div className="pd-stats">
                      <div className="pd-stat">
                        <span className="pd-stat-val">{queue.length}</span>
                        <span className="pd-stat-lbl">In Queue</span>
                      </div>
                      <div className="pd-stat">
                        <span className="pd-stat-val">{users.length}</span>
                        <span className="pd-stat-lbl">Listening</span>
                      </div>
                      <div className="pd-stat">
                        <span className="pd-stat-val">{isDJ ? '👑' : '🎧'}</span>
                        <span className="pd-stat-lbl">{isDJ ? 'DJ' : 'Listener'}</span>
                      </div>
                    </div>

                    <div className="pd-divider" />

                    <div className="pd-actions">
                      <button className="pd-action" onClick={() => { handleGetRecap(); setProfileOpen(false) }}>
                        <span className="pd-action-icon">📊</span>
                        <span>Session Recap</span>
                      </button>
                      <button className="pd-action" onClick={() => { setLibraryOpen(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">📚</span>
                        <span>My Library</span>
                      </button>
                      <button className="pd-action" onClick={() => { setPartyMode(p => !p); setProfileOpen(false) }}>
                        <span className="pd-action-icon">🎊</span>
                        <span>Party Mode {partyMode ? 'ON' : 'OFF'}</span>
                        <span className={`pd-toggle ${partyMode ? 'on' : ''}`} />
                      </button>
                    </div>

                    <div className="pd-divider" />

                    <div className="pd-room">
                      <span className="pd-room-label">Room</span>
                      <span className="pd-room-id">{roomId}</span>
                      <button className="pd-copy" onClick={() => navigator.clipboard?.writeText(roomId)} title="Copy room ID">⎘</button>
                    </div>

                    {!IS_DISCORD && (
                      <>
                        <div className="pd-divider" />
                        <button className="pd-logout" onClick={() => { setProfileOpen(false); handleLogout() }}>
                          <span>↩</span>
                          <span>Sign Out</span>
                        </button>
                      </>
                    )}
                  </div>
                </>,
                document.body
              )}
            </div>
          )}
        </div>
      </header>

      <main className={`app-main ${queueCollapsed ? 'queue-collapsed' : ''}`}>
        <div className="left-panel">
          <Player
            socket={socket}
            roomId={roomId}
            videoId={queue[currentIndex]?.videoId}
            title={queue[currentIndex]?.title}
            onEnded={handleNext}
            onSkip={handleNext}
            onPrev={handlePrev}
            hasPrev={currentIndex > 0}
            isDJ={isDJ}
            djMode={djMode}
            initialTime={initialTime}
            initialPlaying={initialPlaying}
            onPlayStateChange={setIsPlaying}
          />
          <UserList users={users} currentUser={socket.id} djId={djId} />
        </div>

        {isMobileView && (
          <div
            className={`mobile-queue-backdrop ${mobileTab === 'queue' ? 'visible' : ''}`}
            onClick={() => setMobileTab('player')}
          />
        )}

        <div className={`right-panel ${!isMobileView && queueCollapsed ? 'collapsed' : ''} ${isMobileView && mobileTab === 'queue' ? 'mobile-open' : ''}`}>
          <Queue
            queue={queue}
            currentIndex={currentIndex}
            onAddSong={handleAddSong}
            onSelectSong={handleLoadSong}
            onRemoveSong={handleRemoveSong}
            socket={socket}
            roomId={roomId}
            username={user?.username}
          />
        </div>

        {!isMobileView && (
          <button
            className={`queue-collapse-btn ${queueCollapsed ? 'is-collapsed' : ''}`}
            onClick={() => setQueueCollapsed(p => !p)}
            title={queueCollapsed ? 'Show Queue' : 'Hide Queue'}
          >
            <span className="collapse-arrow">‹</span>
            <span>{queueCollapsed ? 'Queue' : 'Hide'}</span>
          </button>
        )}
      </main>

      {isMobileView && (
        <nav className="mobile-bottom-nav">
          <button className={`mobile-nav-btn ${mobileTab === 'player' ? 'active' : ''}`} onClick={() => setMobileTab('player')}>
            <span className="nav-icon">🎵</span>
            <span className="nav-label">Player</span>
          </button>
          <button className={`mobile-nav-btn ${mobileTab === 'queue' ? 'active' : ''}`} onClick={() => setMobileTab(t => t === 'queue' ? 'player' : 'queue')}>
            <span className="nav-icon">🎶</span>
            <span className="nav-label">Queue</span>
            {queue.length > 0 && <span className="nav-badge" />}
          </button>
          <button className={`mobile-nav-btn ${partyMode ? 'active' : ''}`} onClick={() => setPartyMode(p => !p)}>
            <span className="nav-icon">🎊</span>
            <span className="nav-label">Party</span>
          </button>
          <button className="mobile-nav-btn" onClick={() => { setChatOpen(true); setUnread(0) }}>
            <span className="nav-icon">💬</span>
            <span className="nav-label">Chat</span>
            {unread > 0 && <span className="nav-badge" />}
          </button>
          <button className="mobile-nav-btn" onClick={handleGetRecap}>
            <span className="nav-icon">📊</span>
            <span className="nav-label">Recap</span>
          </button>
        </nav>
      )}

      <Chat socket={socket} roomId={roomId} username={user?.username} isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      {showRecap && <SessionRecap recap={recap} onClose={() => setShowRecap(false)} />}
      <Library isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} socket={socket} roomId={roomId} username={user?.username} />
    </div>
  )
}

export default App
