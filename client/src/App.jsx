import { useEffect, useState, useRef, useCallback } from 'react'
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
import MarqueeText from './components/MarqueeText'
import VideoPanel from './components/VideoPanel'
import InviteModal from './components/InviteModal'
import HistoryPanel from './components/HistoryPanel'
import SessionDNACard from './components/SessionDNACard'
import TasteFingerprint from './components/TasteFingerprint'
import GrooveRadar from './components/GrooveRadar'
import TimeMachine from './components/TimeMachine'
import WeeklyWrapped from './components/WeeklyWrapped'
import ChemistryScore from './components/ChemistryScore'
import { registerServiceWorker, isPushSupported, getPushStatus, subscribeToPush, unsubscribeFromPush } from './services/NotificationService'
import './App.css'

// ── Detect Discord Activity context ──────────────────────────
const IS_DISCORD = window.location.hostname.endsWith('.discordsays.com')

const BACKEND = IS_DISCORD
  ? '/.proxy/api'
  : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001')

const socket = io(BACKEND, { withCredentials: true, autoConnect: false })

let discordSdk = null
if (IS_DISCORD) {
  discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID)
}

// ── Keyboard shortcut handler (exported for App use) ─────────
const SHORTCUTS_HELP = [
  { key: 'Space', desc: 'Play / Pause' },
  { key: '→', desc: 'Skip to next song' },
  { key: '←', desc: 'Previous song' },
  { key: 'M', desc: 'Mute / Unmute' },
  { key: 'L', desc: 'Toggle loop' },
  { key: '?', desc: 'Show this help' },
]

function ShortcutsModal({ onClose }) {
  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h3>⌨️ Keyboard Shortcuts</h3>
          <button className="shortcuts-close" onClick={onClose}>✕</button>
        </div>
        <ul className="shortcuts-list">
          {SHORTCUTS_HELP.map(s => (
            <li key={s.key}>
              <kbd>{s.key}</kbd>
              <span>{s.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Sleep Timer ───────────────────────────────────────────────
function SleepTimerModal({ onClose, onSet }) {
  const [minutes, setMinutes] = useState(30)
  const options = [5, 10, 15, 20, 30, 45, 60, 90]
  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h3>😴 Sleep Timer</h3>
          <button className="shortcuts-close" onClick={onClose}>✕</button>
        </div>
        <div className="sleep-timer-body">
          <p>Stop playback after:</p>
          <div className="sleep-timer-options">
            {options.map(m => (
              <button
                key={m}
                className={`sleep-option ${minutes === m ? 'active' : ''}`}
                onClick={() => setMinutes(m)}
              >
                {m}m
              </button>
            ))}
          </div>
          <button className="btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={() => { onSet(minutes); onClose() }}>
            Set Timer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Offline Banner ────────────────────────────────────────────
function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline  = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline) }
  }, [])
  if (!offline) return null
  return (
    <div className="offline-banner">
      <span>⚠️ You're offline — music may stop syncing</span>
    </div>
  )
}

// ── Mobile Mini Player ────────────────────────────────────────
function MiniPlayer({ title, videoId, isPlaying, onPlay, onPause, onSkip, onOpen }) {
  if (!videoId) return null
  return (
    <div className="mini-player" onClick={onOpen}>
      <img
        src={`https://img.youtube.com/vi/${videoId}/default.jpg`}
        alt=""
        className="mini-player-thumb"
      />
      <MarqueeText className="mini-player-title" as="p">{title || 'No song'}</MarqueeText>
      <div className="mini-player-controls" onClick={e => e.stopPropagation()}>
        <button
          className="mini-ctrl-btn"
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying
            ? <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>
          }
        </button>
        <button className="mini-ctrl-btn" onClick={onSkip}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
        </button>
      </div>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [serverWaking, setServerWaking] = useState(false)
  const [roomId, setRoomId] = useState(null)
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [users, setUsers] = useState([])
  const [chatOpen, setChatOpen] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [videoOpen, setVideoOpen]   = useState(false)
  const [inviteOpen, setInviteOpen]   = useState(false)
  const [historyOpen, setHistoryOpen]         = useState(false)
  const [fingerprintOpen, setFingerprintOpen] = useState(false)
  const [showDNACard, setShowDNACard]         = useState(false)
  const [radarOpen, setRadarOpen]             = useState(false)
  const [timeMachineOpen, setTimeMachineOpen] = useState(false)
  const [wrappedOpen, setWrappedOpen]         = useState(false)
  const [chemistryOpen, setChemistryOpen]     = useState(false)
  const [streakData, setStreakData]           = useState(null)
  const [streakToast, setStreakToast]         = useState(null)
  const [radioMode, setRadioMode]             = useState(false)
  const [radioLoading, setRadioLoading]       = useState(false)
  const [theme, setTheme]             = useState(() => localStorage.getItem('groove_theme') || 'violet')
  const [pushEnabled, setPushEnabled]   = useState(false)
  const [pushLoading, setPushLoading]   = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
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
  const touchStartY = useRef(null)

  // ── Apply room theme ─────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('groove_theme', theme)
  }, [theme])

  // ── Register SW + check push support ─────────────────────
  useEffect(() => {
    const supported = isPushSupported()
    setPushSupported(supported)
    registerServiceWorker()
    if (supported) {
      getPushStatus()
        .then(s => { if (s.subscribed) setPushEnabled(true) })
        .catch(() => {})
    }
  }, [])

  // ── New feature state ─────────────────────────────────────
  const [loop, setLoop] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSleepTimer, setShowSleepTimer] = useState(false)
  const [sleepTimer, setSleepTimer] = useState(null)   // { endsAt: timestamp, label: '30m' }
  const [volume, setVolume] = useState(80)             // lifted to App for keyboard mute
  const sleepTimerRef = useRef(null)
  const playerRef = useRef(null)  // ref to Player's imperative handle

  useEffect(() => {
    let timer
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setWindowWidth(window.innerWidth), 150)
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); clearTimeout(timer) }
  }, [])
  const isMobileView = windowWidth <= 768

  const isDJ = socket.id === djId

  // ── Browser tab title ─────────────────────────────────────
  useEffect(() => {
    const title = queue[currentIndex]?.title
    if (title) {
      document.title = `♪ ${title} — Groove`
    } else if (roomId) {
      document.title = `Groove · ${roomId}`
    } else {
      document.title = 'Groove Together'
    }
  }, [queue, currentIndex, roomId])

  // ── Hotlink room joining (?room=ABC123) ───────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const roomParam = params.get('room')
    if (roomParam) {
      // Store it; will be picked up once user is authenticated
      sessionStorage.setItem('groove_invite_room', roomParam.toUpperCase())
      window.history.replaceState({}, '', '/')
    }
  }, [])

  // ── Sleep timer countdown ─────────────────────────────────
  useEffect(() => {
    if (!sleepTimer) return
    const remaining = sleepTimer.endsAt - Date.now()
    if (remaining <= 0) { handleSleepExpire(); return }
    const t = setTimeout(handleSleepExpire, remaining)
    return () => clearTimeout(t)
  }, [sleepTimer])

  const handleSleepExpire = useCallback(() => {
    socket.emit('pause', { roomId, time: 0 })
    setSleepTimer(null)
  }, [roomId])

  const handleSetSleepTimer = (minutes) => {
    setSleepTimer({ endsAt: Date.now() + minutes * 60 * 1000, label: `${minutes}m` })
  }

  const handleCancelSleepTimer = () => setSleepTimer(null)

  // ── Mobile hardware back button → close topmost sheet ────────────────────
  // Only active on mobile. Pushes a fake history entry when any sheet opens,
  // then intercepts popstate to close the sheet instead of navigating away.
  const sheetOpenRef = useRef(false)

  useEffect(() => {
    if (!isMobileView) return

    const anySheetOpen = mobileTab === 'queue' || chatOpen || libraryOpen || profileOpen || videoOpen
    if (anySheetOpen && !sheetOpenRef.current) {
      // A sheet just opened — push a dummy entry so back button has somewhere to pop
      window.history.pushState({ groove_sheet: true }, '')
      sheetOpenRef.current = true
    } else if (!anySheetOpen && sheetOpenRef.current) {
      // All sheets closed by UI (not back button) — remove the dummy entry we pushed
      // so the real browser history stays clean
      if (window.history.state?.groove_sheet) window.history.back()
      sheetOpenRef.current = false
    }
  }, [mobileTab, chatOpen, libraryOpen, profileOpen, isMobileView])

  useEffect(() => {
    if (!isMobileView) return
    const handlePop = (e) => {
      // Only intercept our own pushed states
      if (!sheetOpenRef.current) return
      sheetOpenRef.current = false
      // Close in priority order: video → profile → library → chat → queue
      if (videoOpen)             { setVideoOpen(false);   return }
      if (profileOpen)           { setProfileOpen(false); return }
      if (libraryOpen)           { setLibraryOpen(false); return }
      if (chatOpen)              { setChatOpen(false);    return }
      if (mobileTab === 'queue') { setMobileTab('player'); }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [isMobileView, videoOpen, profileOpen, libraryOpen, chatOpen, mobileTab])

  // ── Keyboard shortcuts ────────────────────────────────────
  // Stable refs so keyboard handler never re-registers
  const kbRef = useRef({})
  useEffect(() => {
    kbRef.current = { isPlaying, djMode, isDJ, currentIndex, queueLen: queue.length, roomId }
  }, [isPlaying, djMode, isDJ, currentIndex, queue.length, roomId])

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const { isPlaying, djMode, isDJ, currentIndex, queueLen, roomId } = kbRef.current

      if (e.key === '?' || e.key === '/') { setShowShortcuts(p => !p); return }
      const isLocked = djMode && !isDJ
      if (e.code === 'Space') {
        e.preventDefault()
        if (isLocked) return
        socket.emit(isPlaying ? 'pause' : 'play', { roomId, time: 0 })
        setIsPlaying(p => !p); return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (!isLocked && currentIndex < queueLen - 1) handleLoadSong(currentIndex + 1); return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (!isLocked && currentIndex > 0) handleLoadSong(currentIndex - 1); return
      }
      if (e.key === 'm' || e.key === 'M') { setVolume(v => v === 0 ? 80 : 0); return }
      if (e.key === 'l' || e.key === 'L') { setLoop(p => !p); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // empty deps — handler reads from ref, never re-registers

  const handlePrev = () => {
    const prev = currentIndex - 1
    if (prev >= 0) handleLoadSong(prev)
  }

  // ── Auth ─────────────────────────────────────────────────
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (IS_DISCORD && discordSdk) {
          await discordSdk.ready()
          const { code } = await discordSdk.commands.authorize({
            client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
            response_type: 'code',
            state: '',
            prompt: 'none',
            scope: ['identify']
          })
          const res = await fetch(`${BACKEND}/auth/discord/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code })
          })
          if (res.ok) {
            const userData = await res.json()
            setUser(userData)
            const channelId = discordSdk.channelId || 'discord-activity'
            setRoomId(channelId)
            if (!socket.connected) socket.connect()
            socket.emit('join-room', { roomId: channelId, username: userData.username, avatar: userData.avatar, discordId: userData.id })
          }
        } else {
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            const res = await fetch(`${BACKEND}/auth/me`, { credentials: 'include', signal: controller.signal })
            clearTimeout(timeout)
            if (res.ok) setUser(await res.json())
          } catch {
            // First attempt timed out — server is cold starting, retry with longer timeout
            setServerWaking(true)
            try {
              const res = await fetch(`${BACKEND}/auth/me`, { credentials: 'include' })
              if (res.ok) setUser(await res.json())
            } catch {}
            setServerWaking(false)
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

  // ── Auto-rejoin on reload + invite room handling ──────────
  useEffect(() => {
    if (!user || IS_DISCORD) return
    if (roomId) return
    // Check invite link first, then saved room
    const inviteRoom = sessionStorage.getItem('groove_invite_room')
    const savedRoom  = localStorage.getItem('groove_roomId')
    const targetRoom = inviteRoom || savedRoom
    if (!targetRoom) return
    if (inviteRoom) sessionStorage.removeItem('groove_invite_room')
    setRoomId(targetRoom)
    if (!socket.connected) socket.connect()
    socket.emit('join-room', { roomId: targetRoom, username: user.username, avatar: user.avatar, discordId: user.id })
  }, [user])

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
    localStorage.setItem('groove_roomId', roomId)
    if (!socket.connected) socket.connect()
    socket.emit('join-room', { roomId, username: user.username, avatar: user.avatar, discordId: user.id })
  }

  const handleTogglePush = async () => {
    if (!isPushSupported()) {
      alert('Push notifications are not supported on this device/browser.')
      return
    }
    setPushLoading(true)
    try {
      if (pushEnabled) {
        await unsubscribeFromPush()
        setPushEnabled(false)
      } else {
        await subscribeToPush({
          songAdded: true,
          chatMsg: true,
          userJoined: false,
          djCrown: true,
        })
        setPushEnabled(true)
      }
    } catch (e) {
      alert(e.message || 'Failed to update notifications')
    } finally {
      setPushLoading(false)
    }
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

  // Smart Radio Mode
  const triggerRadio = useCallback(async () => {
    if (!radioMode || radioLoading || !currentSong) return
    setRadioLoading(true)
    try {
      const roomHistory = queue.map(s => s.videoId)
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/radio/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lastSong: currentSong, roomHistory })
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.songs?.length) {
        socket.emit('add-songs-batch', { roomId, songs: data.songs, addedBy: '📻 Radio' })
      }
    } catch {}
    finally { setRadioLoading(false) }
  }, [radioMode, radioLoading, currentSong, queue, roomId, socket])

  const handleNext = useCallback(() => {
    if (djMode && !isDJ) return
    if (loop) {
      // Reload current song from beginning
      handleLoadSong(currentIndex)
      return
    }
    const next = currentIndex + 1
    if (next < queue.length) {
      handleLoadSong(next)
    } else if (radioMode) {
      triggerRadio()
    }
  }, [djMode, isDJ, loop, currentIndex, queue.length])

  const handleToggleDJMode = () => {
    socket.emit('toggle-dj-mode', { roomId })
  }

  const handleGetRecap = () => {
    socket.emit('get-recap', { roomId })
  }

  const handleLogout = async () => {
    await fetch(`${BACKEND}/auth/logout`, { credentials: 'include' })
    localStorage.removeItem('groove_roomId')
    setUser(null)
    setRoomId(null)
  }

  const handleCopyInvite = () => setInviteOpen(true)

  const handleTransferDJ = (toSocketId) => {
    socket.emit('transfer-dj', { roomId, toSocketId })
  }

  useEffect(() => {
    const handleNewMsg = () => {
      if (!chatOpen) setUnread((p) => p + 1)
    }
    socket.on('chat-msg', handleNewMsg)
    return () => socket.off('chat-msg', handleNewMsg)
  }, [chatOpen])

  useEffect(() => {
    const handleReconnect = () => {
      if (roomId && user) {
        socket.emit('join-room', { roomId, username: user.username, avatar: user.avatar, discordId: user.id })
      }
    }
    socket.on('connect', handleReconnect)
    return () => socket.off('connect', handleReconnect)
  }, [roomId, user])

  useEffect(() => {
    socket.on('room-state', (data) => {
      if (!data || typeof data !== 'object') return
      const { queue, currentIndex, currentTime, isPlaying, users, djId, djMode, chatHistory } = data
      setQueue(Array.isArray(queue) ? queue : [])
      setCurrentIndex(typeof currentIndex === 'number' ? currentIndex : 0)
      setUsers(Array.isArray(users) ? users : [])
      if (djId !== undefined) setDjId(djId)
      if (djMode !== undefined) setDjMode(djMode)
      if (typeof currentTime === 'number') setInitialTime(currentTime)
      if (isPlaying !== undefined) { setInitialPlaying(isPlaying); setIsPlaying(isPlaying) }
      if (Array.isArray(chatHistory)) setChatHistory(chatHistory)
    })
    socket.on('queue-updated', ({ queue }) => setQueue(Array.isArray(queue) ? queue : []))
    socket.on('load-song', ({ index, queue: updatedQueue }) => {
      if (updatedQueue) setQueue(Array.isArray(updatedQueue) ? updatedQueue : [])
      if (typeof index === 'number' && !isNaN(index)) setCurrentIndex(index)
      // Video panel iframe auto-reloads because videoId prop changes (key={videoId} in VideoPanel)
    })
    socket.on('user-joined', ({ users }) => setUsers(Array.isArray(users) ? users : []))
    socket.on('user-left', ({ users }) => setUsers(Array.isArray(users) ? users : []))
    socket.on('dj-mode-changed', ({ djMode, djId }) => { if (djMode !== undefined) setDjMode(djMode); if (djId !== undefined) setDjId(djId) })
    socket.on('streak-update', (data) => {
      setStreakData(data)
      if (data.milestone) {
        setStreakToast({ type: 'milestone', streak: data.milestone })
        setTimeout(() => setStreakToast(null), 5000)
      } else if (data.isNew && data.streak > 1) {
        setStreakToast({ type: 'streak', streak: data.streak })
        setTimeout(() => setStreakToast(null), 3000)
      }
    })
    socket.on('streak-milestone', ({ username, streak }) => {
      setStreakToast({ type: 'room-milestone', username, streak })
      setTimeout(() => setStreakToast(null), 5000)
    })
    socket.on('dj-transferred', ({ fromUsername, toUsername, toSocketId }) => {
      // Show system message in chat
      socket.emit('chat-system-local', { text: `👑 ${fromUsername} passed the crown to ${toUsername}` })
    })
    socket.on('recap-data', (data) => {
      if (!data) return
      setRecap({ ...data, songsPlayed: Array.isArray(data.songsPlayed) ? data.songsPlayed : [], users: Array.isArray(data.users) ? data.users : [] })
      setShowRecap(true)
    })
    socket.on('play', () => setIsPlaying(true))
    socket.on('pause', () => setIsPlaying(false))
    socket.on('queue-full', ({ limit }) => {
      alert(`Queue is full (${limit} songs max). Remove some songs before adding more.`)
    })
    socket.on('queue-limit-reached', ({ added, skipped, limit }) => {
      alert(`Added ${added} songs. ${skipped} songs were skipped — queue limit of ${limit} reached.\nRemove some songs and paste the playlist link again to continue importing.`)
    })
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
        <p className="auth-status">
          {IS_DISCORD
            ? 'Loading Activity...'
            : serverWaking
            ? '☕ Server is waking up, hang tight...'
            : 'Checking session...'}
        </p>
      </div>
    )
  }

  if (!roomId) return <RoomJoin onJoin={handleJoin} user={user} onGuestLogin={handleGuestLogin} />

  const currentSong = queue[currentIndex]

  return (
    <div className="app">
      <OfflineBanner />
      <Visualizer isPlaying={isPlaying} partyMode={partyMode} />
      <ReactionBurst socket={socket} roomId={roomId} username={user?.username} />

      {/* Sleep timer badge */}
      {sleepTimer && (
        <div className="sleep-timer-badge">
          😴 Stopping in {Math.ceil((sleepTimer.endsAt - Date.now()) / 60000)}m
          <button onClick={handleCancelSleepTimer}>✕</button>
        </div>
      )}

      <header className="app-header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="hg1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7c6aff"/><stop offset="100%" stopColor="#ff6a8a"/>
              </linearGradient>
              <linearGradient id="hg2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.95"/><stop offset="100%" stopColor="#e0daff"/>
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

          <button className="recap-btn" onClick={() => setShowSleepTimer(true)} title="Sleep Timer">😴</button>
          <button className="recap-btn" onClick={() => setShowShortcuts(true)} title="Keyboard Shortcuts">⌨️</button>
          <button className={`recap-btn party-btn ${partyMode ? 'party-active' : ''}`} onClick={() => setPartyMode(p => !p)} title="Party Mode">🎊</button>
          <button className="recap-btn" onClick={handleGetRecap} title="Session Recap">📊</button>
          <button className={`recap-btn ${libraryOpen ? 'active' : ''}`} onClick={() => setLibraryOpen(p => !p)} title="My Library">📚</button>

          {/* Watch button — only shown when a song is loaded */}
          {currentSong && (
            <button
              className={`watch-btn ${videoOpen ? 'active' : ''}`}
              onClick={() => setVideoOpen(p => !p)}
              title={videoOpen ? 'Close video' : 'Watch video'}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1 2-2V5c0-1-1-2-2-2zm0 16H3V5h18v14zM8 15l5-3-5-3v6z"/>
              </svg>
              <span>{videoOpen ? 'Close' : 'Watch'}</span>
            </button>
          )}

          <button className={`chat-toggle-btn ${chatOpen ? "active" : ""}`} onClick={() => { setChatOpen(p => !p); setUnread(0) }}>
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
                {streakData?.streak > 0 && (
                  <span className="streak-badge" title={`${streakData.streak} day streak`}>
                    🔥{streakData.streak}
                  </span>
                )}
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
                        <p className="pd-tag">{IS_DISCORD ? 'Discord Activity' : user.provider === 'google' ? 'via Google' : 'via Discord'}</p>
                      {streakData?.streak > 0 && (
                        <p className="pd-streak">🔥 {streakData.streak} day streak{streakData.longestStreak > streakData.streak ? ` · best ${streakData.longestStreak}` : ''}</p>
                      )}
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
                        <span className="pd-action-icon">📊</span><span>Session Recap</span>
                      </button>
                      <button className="pd-action" onClick={() => { setLibraryOpen(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">📚</span><span>My Library</span>
                      </button>
                      <button className="pd-action" onClick={() => { setPartyMode(p => !p); setProfileOpen(false) }}>
                        <span className="pd-action-icon">🎊</span>
                        <span>Party Mode {partyMode ? 'ON' : 'OFF'}</span>
                        <span className={`pd-toggle ${partyMode ? 'on' : ''}`} />
                      </button>
                      <button className="pd-action" onClick={() => { setShowSleepTimer(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">😴</span><span>Sleep Timer {sleepTimer ? `(${Math.ceil((sleepTimer.endsAt - Date.now()) / 60000)}m)` : ''}</span>
                      </button>
                      <button className="pd-action" onClick={() => { setShowShortcuts(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">⌨️</span><span>Shortcuts</span>
                      </button>
                      <button className="pd-action" onClick={() => { setHistoryOpen(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">🕐</span><span>Listen History & Moments</span>
                      </button>
                      <button className="pd-action" onClick={() => { setFingerprintOpen(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">🫆</span><span>Taste Fingerprint</span>
                      </button>
                      <button className="pd-action" onClick={() => { setRadarOpen(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">📡</span><span>Groove Radar</span>
                      </button>
                      <button className="pd-action" onClick={() => { setTimeMachineOpen(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">⏰</span><span>Time Machine</span>
                      </button>
                      <button className="pd-action" onClick={() => { setWrappedOpen(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">📊</span><span>Weekly Wrapped</span>
                      </button>
                      <button className="pd-action" onClick={() => { setChemistryOpen(true); setProfileOpen(false) }}>
                        <span className="pd-action-icon">💜</span><span>Room Chemistry</span>
                      </button>
                      <button className={`pd-action ${radioMode ? 'pd-action--active' : ''}`} onClick={() => { setRadioMode(p => !p); setProfileOpen(false) }}>
                        <span className="pd-action-icon">📻</span>
                        <span>Radio Mode {radioMode ? 'ON' : 'OFF'}</span>
                        <span className={`pd-toggle ${radioMode ? 'on' : ''}`} />
                      </button>
                      <div className="pd-theme-row">
                        <span className="pd-theme-label">Room theme</span>
                        <div className="theme-picker">
                          {[
                            { id:'violet',   color:'#7c6aff', label:'Violet' },
                            { id:'midnight', color:'#3b8bff', label:'Midnight' },
                            { id:'synthwave',color:'#ff2d78', label:'Synthwave' },
                            { id:'forest',   color:'#00c974', label:'Forest' },
                            { id:'amber',    color:'#ffb300', label:'Amber' },
                            { id:'crimson',  color:'#ff3b3b', label:'Crimson' },
                          ].map(t => (
                            <button
                              key={t.id}
                              className={`theme-swatch ${theme === t.id ? 'active' : ''}`}
                              style={{ background: t.color }}
                              onClick={() => setTheme(t.id)}
                              title={t.label}
                            />
                          ))}
                        </div>
                      </div>
                      <button
                        className="pd-action"
                        onClick={handleTogglePush}
                      >
                        <span className="pd-action-icon">{pushEnabled ? '🔔' : '🔕'}</span>
                        <span>
                          {pushLoading
                            ? 'Updating…'
                            : pushEnabled
                              ? 'Notifications ON'
                              : 'Notifications OFF'}
                        </span>
                        <span className={`pd-toggle ${pushEnabled ? 'on' : ''}`} />
                      </button>
                    </div>

                    <div className="pd-divider" />

                    <div className="pd-room">
                      <span className="pd-room-label">Room</span>
                      <span className="pd-room-id">{roomId}</span>
                      <button className="pd-copy" onClick={handleCopyInvite} title="Copy invite link">🔗</button>
                    </div>

                    {!IS_DISCORD && (
                      <>
                        <div className="pd-divider" />
                        <button className="pd-logout" onClick={() => { setProfileOpen(false); handleLogout() }}>
                          <span>↩</span><span>Sign Out</span>
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
            videoId={currentSong?.videoId}
            title={currentSong?.title}
            onEnded={handleNext}
            onSkip={handleNext}
            onPrev={handlePrev}
            hasPrev={currentIndex > 0}
            isDJ={isDJ}
            djMode={djMode}
            initialTime={initialTime}
            initialPlaying={initialPlaying}
            onPlayStateChange={setIsPlaying}
            externalVolume={volume}
            onVolumeChange={setVolume}
            loop={loop}
          />
          <UserList users={users} currentUser={socket.id} djId={djId} isDJ={isDJ} onTransferDJ={handleTransferDJ} />
        </div>

        {isMobileView && (
          <div
            className={`mobile-queue-backdrop ${mobileTab === 'queue' ? 'visible' : ''}`}
            onClick={() => setMobileTab('player')}
          />
        )}

        <div
          className={`right-panel ${!isMobileView && queueCollapsed ? 'collapsed' : ''} ${isMobileView && mobileTab === 'queue' ? 'mobile-open' : ''}`}
        >
          {/* Swipe-down handle — touch only fires here, not on the song list */}
          {isMobileView && (
            <div
              className="queue-swipe-handle"
              onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY }}
              onTouchEnd={(e) => {
                if (touchStartY.current === null) return
                const dy = e.changedTouches[0].clientY - touchStartY.current
                if (dy > 40) setMobileTab('player')
                touchStartY.current = null
              }}
            />
          )}
          <Queue
            queue={queue}
            currentIndex={currentIndex}
            onAddSong={handleAddSong}
            onSelectSong={handleLoadSong}
            onRemoveSong={handleRemoveSong}
            onNext={handleNext}
            onPrev={handlePrev}
            socket={socket}
            roomId={roomId}
            username={user?.username}
            loop={loop}
            onToggleLoop={() => setLoop(p => !p)}
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

      {/* Mobile mini player — shown when queue tab is open */}
      {isMobileView && mobileTab === 'queue' && currentSong && (
        <MiniPlayer
          title={currentSong.title}
          videoId={currentSong.videoId}
          isPlaying={isPlaying}
          onPlay={() => { socket.emit('play', { roomId, time: 0 }); setIsPlaying(true) }}
          onPause={() => { socket.emit('pause', { roomId, time: 0 }); setIsPlaying(false) }}
          onSkip={handleNext}
          onOpen={() => setMobileTab('player')}
        />
      )}

      {isMobileView && (
        <nav className="mobile-bottom-nav">
          <button
            className={`mobile-nav-btn ${mobileTab === 'player' && !libraryOpen && !chatOpen ? 'active' : ''}`}
            onClick={() => { setMobileTab('player'); setLibraryOpen(false); setChatOpen(false) }}
          >
            <span className="nav-icon">🎵</span>
            <span className="nav-label">Player</span>
          </button>

          <button
            className={`mobile-nav-btn ${mobileTab === 'queue' && !libraryOpen && !chatOpen ? 'active' : ''}`}
            onClick={() => { setLibraryOpen(false); setChatOpen(false); setMobileTab(t => t === 'queue' ? 'player' : 'queue') }}
          >
            <span className="nav-icon">🎶</span>
            <span className="nav-label">Queue</span>
            {queue.length > 0 && <span className="nav-badge" />}
          </button>

          <button
            className={`mobile-nav-btn ${chatOpen ? 'active' : ''}`}
            onClick={() => { setLibraryOpen(false); setChatOpen(true); setUnread(0); setMobileTab('player') }}
          >
            <span className="nav-icon">💬</span>
            <span className="nav-label">Chat</span>
            {unread > 0 && <span className="nav-badge" />}
          </button>

          <button
            className={`mobile-nav-btn ${libraryOpen ? 'active' : ''}`}
            onClick={() => { setChatOpen(false); setMobileTab('player'); setLibraryOpen(p => !p) }}
          >
            <span className="nav-icon">📚</span>
            <span className="nav-label">Library</span>
          </button>

          <button
            className={`mobile-nav-btn ${profileOpen ? 'active' : ''}`}
            onClick={() => { setLibraryOpen(false); setChatOpen(false); setProfileOpen(p => !p) }}
          >
            {user?.avatar
              ? <img src={user.avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
              : <span className="nav-icon">👤</span>
            }
            <span className="nav-label">Profile</span>
          </button>
        </nav>
      )}

      {/* Chat overlay — floats over everything on both desktop and mobile */}
      <Chat socket={socket} roomId={roomId} username={user?.username} isOpen={chatOpen} onClose={() => setChatOpen(false)} currentSong={currentSong} chatHistory={chatHistory} />
      {showRecap && recap && (
        <SessionDNACard recap={recap} onClose={() => setShowRecap(false)} />
      )}
      {libraryOpen && (
        <Library
          isOpen={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          socket={socket}
          roomId={roomId}
          username={user?.username}
          onAddSongToQueue={handleAddSong}
          onAddSongsToQueue={(songs) => socket.emit('add-songs-batch', { roomId, songs, addedBy: user.username })}
          currentVideoId={currentSong?.videoId}
        />
      )}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showSleepTimer && <SleepTimerModal onClose={() => setShowSleepTimer(false)} onSet={handleSetSleepTimer} />}

      <TasteFingerprint isOpen={fingerprintOpen} onClose={() => setFingerprintOpen(false)} />
      <GrooveRadar isOpen={radarOpen} onClose={() => setRadarOpen(false)} onAddToQueue={song => socket.emit('add-song', { roomId, videoId: song.videoId, title: song.title, addedBy: user?.username })} />
      <TimeMachine isOpen={timeMachineOpen} onClose={() => setTimeMachineOpen(false)} onLoadSession={songs => { socket.emit('add-songs-batch', { roomId, songs, addedBy: user?.username }); setTimeMachineOpen(false) }} />
      <WeeklyWrapped isOpen={wrappedOpen} onClose={() => setWrappedOpen(false)} />
      <ChemistryScore isOpen={chemistryOpen} onClose={() => setChemistryOpen(false)} roomId={roomId} />

      {/* Streak toast */}
      {streakToast && (
        <div className={`streak-toast ${streakToast.type === 'milestone' ? 'streak-toast--milestone' : ''}`}>
          {streakToast.type === 'milestone' && <span className="streak-toast-firework">🎉</span>}
          {streakToast.type === 'milestone' && <span>{streakToast.streak} day streak milestone! 🔥</span>}
          {streakToast.type === 'streak' && <span>🔥 {streakToast.streak} day streak! Keep it up</span>}
          {streakToast.type === 'room-milestone' && <span>🔥 {streakToast.username} hit a {streakToast.streak} day streak!</span>}
        </div>
      )}

      {/* Radio loading indicator */}
      {radioLoading && (
        <div className="radio-loading-toast">📻 Finding songs for your vibe…</div>
      )}
      {historyOpen && (
        <HistoryPanel
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onAddToQueue={handleAddSong}
          roomId={roomId}
        />
      )}
      {inviteOpen && roomId && (
        <InviteModal roomId={roomId} onClose={() => setInviteOpen(false)} />
      )}
      <VideoPanel
        videoId={currentSong?.videoId}
        title={currentSong?.title}
        isOpen={videoOpen && !!currentSong}
        onClose={() => setVideoOpen(false)}
      />
    </div>
  )
}

export default App
