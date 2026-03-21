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
import MyGroovePanel from './components/MyGroovePanel'
import FloatingChatBubble from './components/FloatingChatBubble'
import SettingsPanel from './components/SettingsPanel'
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
  const [authError, setAuthError]       = useState(null)
  const [serverWaking, setServerWaking] = useState(false)
  const [roomId, setRoomId] = useState(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
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
  const [myGrooveOpen, setMyGrooveOpen]       = useState(false)
  const [myGrooveTab, setMyGrooveTab]         = useState('radar')
  const [settingsOpen, setSettingsOpen]       = useState(false)
  const [pwaInstallable, setPwaInstallable]   = useState(false)
  const [timeMachineOpen, setTimeMachineOpen] = useState(false)
  const [wrappedOpen, setWrappedOpen]         = useState(false)
  const [chemistryOpen, setChemistryOpen]     = useState(false)
  const [streakData, setStreakData]           = useState(null)
  const [streakToast, setStreakToast]         = useState(null)
  const [toast, setToast]                     = useState(null)
  const [reconnecting, setReconnecting]       = useState(false)
  const [lastMessage, setLastMessage]         = useState(null)
  const [radioMode, setRadioMode]             = useState(() => localStorage.getItem('groove_radio') === 'true')
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
  const haptic = (ms = 10) => { try { navigator.vibrate?.(ms) } catch {} }
  const showToast = (msg, duration = 3000) => { setToast(msg); setTimeout(() => setToast(null), duration) }
  const [partyMode, setPartyMode] = useState(false)
  const [mobileTab, setMobileTab] = useState('player')
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const touchStartY = useRef(null)
  // Handler refs — declared early to prevent TDZ in forward-referencing effects
  const handleNextRef     = useRef(null)
  const handleLoadSongRef = useRef(null)
  const currentSongRef    = useRef(null)
  const triggerRadioRef   = useRef(null)

  // ── PWA install prompt listener ──────────────────────────
  useEffect(() => {
    const handler = () => setPwaInstallable(true)
    window.addEventListener('pwa-installable', handler)
    return () => window.removeEventListener('pwa-installable', handler)
  }, [])

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
  const [volume, setVolume] = useState(() => {
    const saved = parseInt(localStorage.getItem('groove_vol'))
    return isNaN(saved) ? 80 : Math.max(0, Math.min(100, saved))
  })
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

  // Persist radio mode
  useEffect(() => {
    localStorage.setItem('groove_radio', radioMode)
  }, [radioMode])

  // Persist volume
  useEffect(() => {
    localStorage.setItem('groove_vol', volume)
  }, [volume])

  // Hide floating chat bubble when chat panel is open on mobile
  useEffect(() => {
    document.body.classList.toggle('chat-is-open', isMobileView && chatOpen)
  }, [chatOpen, isMobileView])

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
  const handleSleepExpire = useCallback(() => {
    socket.emit('pause', { roomId, time: 0 })
    setSleepTimer(null)
  }, [roomId])

  useEffect(() => {
    if (!sleepTimer) return
    const remaining = sleepTimer.endsAt - Date.now()
    if (remaining <= 0) { handleSleepExpire(); return }
    const t = setTimeout(handleSleepExpire, remaining)
    return () => clearTimeout(t)
  }, [sleepTimer])

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
        haptic(); socket.emit(isPlaying ? 'pause' : 'play', { roomId, time: 0 })
        setIsPlaying(p => !p); return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (!isLocked && currentIndex < queueLen - 1) handleLoadSongRef.current?.(currentIndex + 1); return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (!isLocked && currentIndex > 0) handleLoadSongRef.current?.(currentIndex - 1); return
      }
      if (e.key === 'm' || e.key === 'M') { setVolume(v => v === 0 ? 80 : 0); return }
      if (e.key === 'l' || e.key === 'L') { setLoop(p => !p); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // empty deps — handler reads from ref, never re-registers

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
            if (res.ok) {
              setUser(await res.json())
            } else {
              // Not logged in via OAuth — check for persisted guest session
              const savedGuest = sessionStorage.getItem('groove_guest')
              if (savedGuest) {
                try {
                  const guestData = JSON.parse(savedGuest)
                  // Re-authenticate guest on server
                  const gRes = await fetch(`${BACKEND}/auth/guest`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ username: guestData.username })
                  })
                  if (gRes.ok) setUser(await gRes.json())
                  else sessionStorage.removeItem('groove_guest')
                } catch { sessionStorage.removeItem('groove_guest') }
              }
            }
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
            window.history.replaceState({}, '', '/app')
            try {
              const res2 = await fetch(`${BACKEND}/auth/me`, { credentials: 'include' })
              if (res2.ok) setUser(await res2.json())
            } catch {}
          } else if (params.get('error') === 'auth_failed') {
            window.history.replaceState({}, '', '/')
            const reason = params.get('reason') || ''
            if (reason === 'rate_limit' || reason.includes('1015')) {
              setAuthError('rate_limit')
            } else if (reason === 'denied' || reason === 'access_denied') {
              setAuthError('denied')
            } else if (reason === 'config') {
              setAuthError('config')
            } else {
              setAuthError('generic')
            }
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
  // Key is user-specific so different accounts don't share saved rooms
  const roomStorageKey = user ? `groove_roomId_${user.id}` : null

  useEffect(() => {
    if (!user || IS_DISCORD) return
    if (roomId) return
    const inviteRoom = sessionStorage.getItem('groove_invite_room')
    const savedRoom  = roomStorageKey ? localStorage.getItem(roomStorageKey) : null
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
      if (res.ok) {
        const userData = await res.json()
        setUser(userData)
        // Persist guest session so refresh doesn't log them out
        sessionStorage.setItem('groove_guest', JSON.stringify(userData))
      }
    } catch (e) {
      console.error('Guest login failed:', e)
    }
  }

  const handleJoin = ({ roomId }) => {
    setRoomId(roomId)
    if (roomStorageKey) localStorage.setItem(roomStorageKey, roomId)
    if (!socket.connected) socket.connect()
    socket.emit('join-room', { roomId, username: user.username, avatar: user.avatar, discordId: user.id })
  }

  const handleLeaveRoom = () => setShowLeaveConfirm(true)

  const confirmLeaveRoom = () => {
    setShowLeaveConfirm(false)
    socket.emit('leave-room', { roomId, username: user?.username })
    if (roomStorageKey) localStorage.removeItem(roomStorageKey)
    setRoomId(null)
    setQueue([])
    setCurrentIndex(0)
    setIsPlaying(false)
    setChatOpen(false)
    setLibraryOpen(false)
    setProfileOpen(false)
    setVideoOpen(false)
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
  // Sync ref immediately (not in useEffect — plain assignment is fine for non-stale ref)
  handleLoadSongRef.current = handleLoadSong

  const handlePrev = () => {
    const prev = currentIndex - 1
    if (prev >= 0) handleLoadSong(prev)
  }

  const handleRemoveSong = (index) => {
    socket.emit('remove-song', { roomId, index })
  }

  // Smart Radio Mode
  const triggerRadio = useCallback(async () => {
    if (!radioMode || radioLoading || !currentSongRef.current) return
    setRadioLoading(true)
    try {
      const roomHistory = queue.map(s => s.videoId)
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/radio/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lastSong: currentSongRef.current, roomHistory })
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.songs?.length) {
        socket.emit('add-songs-batch', { roomId, songs: data.songs, addedBy: '📻 Radio' })
      }
    } catch {}
    finally { setRadioLoading(false) }
  }, [radioMode, radioLoading, queue, roomId, socket])

  // Keep triggerRadio ref up to date
  useEffect(() => { triggerRadioRef.current = triggerRadio }, [triggerRadio])

  const handleNext = useCallback(() => {
    if (djMode && !isDJ) return
    if (loop) {
      handleLoadSong(currentIndex)
      return
    }
    const next = currentIndex + 1
    if (next < queue.length) {
      handleLoadSong(next)
    } else if (radioMode) {
      triggerRadioRef.current?.()
    }
  }, [djMode, isDJ, loop, currentIndex, queue.length, radioMode])

  // Sync handleNext ref AFTER it's declared — used by early handlers
  useEffect(() => { handleNextRef.current = handleNext }, [handleNext])

  const handleToggleDJMode = () => {
    socket.emit('toggle-dj-mode', { roomId })
  }

  const handleGetRecap = () => {
    socket.emit('get-recap', { roomId })
  }

  const handleLogout = async () => {
    await fetch(`${BACKEND}/auth/logout`, { credentials: 'include' })
    if (roomStorageKey) localStorage.removeItem(roomStorageKey)
    sessionStorage.removeItem('groove_guest')
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
      setReconnecting(false)
      if (roomId && user) {
        socket.emit('join-room', { roomId, username: user.username, avatar: user.avatar, discordId: user.id })
      }
    }
    const handleDisconnect = () => setReconnecting(true)
    socket.on('connect', handleReconnect)
    socket.on('disconnect', handleDisconnect)
    return () => { socket.off('connect', handleReconnect); socket.off('disconnect', handleDisconnect) }
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
      showToast(`⚠️ Queue is full (${limit} songs max)`)
    })
    socket.on('queue-limit-reached', ({ added, skipped, limit }) => {
      showToast(`✅ Added ${added} songs · ${skipped} skipped (queue limit)`)
    })
    socket.on('song-added-confirm', ({ title, addedBy, position }) => {
      showToast(`🎵 "${title.length > 30 ? title.slice(0,30)+'…' : title}" added at #${position}`)
    })
    return () => {
      socket.off('room-state')
      socket.off('queue-updated')
      socket.off('load-song')
      socket.off('user-joined')
      socket.off('user-left')
      socket.off('dj-mode-changed')
      socket.off('recap-data')
      socket.off('play')
      socket.off('pause')
      socket.off('streak-update')
      socket.off('streak-milestone')
      socket.off('dj-transferred')
      socket.off('queue-full')
      socket.off('queue-limit-reached')
      socket.off('connect')
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
  currentSongRef.current = currentSong  // keep ref in sync

  return (
    <div className="app">
      <OfflineBanner />
      {reconnecting && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9000,
          background: 'linear-gradient(90deg, #7c6aff, #ff6a8a)',
          color: '#fff', textAlign: 'center', fontSize: '0.8rem',
          fontWeight: 600, padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          animation: 'slideDown 0.3s ease',
        }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
          Reconnecting to server…
        </div>
      )}
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
              <linearGradient id="hdr-g1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7c6aff"/><stop offset="100%" stopColor="#ff6a8a"/>
              </linearGradient>
              <linearGradient id="hdr-g2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.95"/><stop offset="100%" stopColor="#e0daff"/>
              </linearGradient>
            </defs>
            <circle cx="28" cy="28" r="28" fill="url(#hdr-g1)" opacity="0.15"/>
            <circle cx="28" cy="28" r="22" fill="url(#hdr-g1)" opacity="0.2"/>
            <path d="M14 22 Q10 28 14 34" stroke="url(#hdr-g1)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
            <path d="M10 18 Q4 28 10 38" stroke="url(#hdr-g1)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
            <path d="M42 22 Q46 28 42 34" stroke="url(#hdr-g1)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
            <path d="M46 18 Q52 28 46 38" stroke="url(#hdr-g1)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
            <path d="M24 36V22l12-3v14" stroke="url(#hdr-g2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="22" cy="36" r="3.5" fill="url(#hdr-g2)"/>
            <circle cx="34" cy="33" r="3.5" fill="url(#hdr-g2)"/>
          </svg>
          <div className="logo-text">
            <span className="logo-big">GROOVE</span>
            <span className="logo-small">· together ·</span>
          </div>
        </div>
        <div className="header-right">
          {/* Room live pill */}
          <div className="room-badge" title={`Room ${roomId}`}>
            <span className="room-badge-dot" />
            <span>{roomId}</span>
            {isMobileView && isDJ && (
              <span className="mobile-dj-badge">{djMode ? '👑' : '🎛'}</span>
            )}
          </div>

          {!isMobileView && isDJ && (
            <button className={`dj-toggle-btn ${djMode ? 'active' : ''}`} onClick={handleToggleDJMode}>
              {djMode ? '👑 DJ' : '🎛 Free'}
            </button>
          )}

          {/* Session tools — desktop only */}
          <div className="header-tools">
            <button className={`tool-btn party-tool-btn ${partyMode ? 'active' : ''}`} onClick={() => setPartyMode(p => !p)} title="Party Mode">🎊</button>
            <button className="tool-btn" onClick={handleLeaveRoom} title="Leave Room"
              style={{ color: '#ff6a8a' }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/>
              </svg>
            </button>
            {currentSong && (
              <button className={`tool-btn ${videoOpen ? 'active' : ''}`} onClick={() => setVideoOpen(p => !p)} title="Watch video">
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                  <path d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1 2-2V5c0-1-1-2-2-2zm0 16H3V5h18v14zM8 15l5-3-5-3v6z"/>
                </svg>
              </button>
            )}
            <button className={`tool-btn ${libraryOpen ? 'active' : ''}`} onClick={() => setLibraryOpen(p => !p)} title="My Library">📚</button>
            <button className="tool-btn" onClick={handleGetRecap} title="Session Recap">📊</button>
            <button className={`tool-btn ${chatOpen ? 'active' : ''}`} onClick={() => { setChatOpen(p => !p); setUnread(0) }} title="Room Chat">
              <span style={{position:'relative', display:'flex'}}>
                💬
                {unread > 0 && <span className="unread-badge">{unread}</span>}
              </span>
            </button>
          </div>

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

                    {/* ── Identity ── */}
                    <div className="pd-identity">
                      <div className="pd-avatar-wrap">
                        {user.avatar
                          ? <img src={user.avatar} alt="" className="pd-avatar" />
                          : <div className="pd-avatar-placeholder">{user.username?.slice(0,2).toUpperCase()}</div>
                        }
                        <span className="pd-online-dot" />
                      </div>
                      <div className="pd-info">
                        <p className="pd-name">{user.username}</p>
                        {streakData?.streak > 0
                          ? <p className="pd-streak-line">🔥 {streakData.streak} day streak{streakData.longestStreak > streakData.streak ? ` · best ${streakData.longestStreak}` : ''}</p>
                          : <p className="pd-tag">{IS_DISCORD ? 'Discord Activity' : user.provider === 'google' ? 'via Google' : 'via Discord'}</p>
                        }
                      </div>
                    </div>

                    {/* ── Queue + Listeners stats — above the big buttons ── */}
                    <div className="pd-room-stats">
                      <div className="pd-room-stat">
                        <span className="pd-room-stat-val">{queue.length}</span>
                        <span className="pd-room-stat-lbl">Queue</span>
                      </div>
                      <div className="pd-room-stat-divider" />
                      <div className="pd-room-stat">
                        <span className="pd-room-stat-val">{users.length}</span>
                        <span className="pd-room-stat-lbl">Listeners</span>
                      </div>
                      <div className="pd-room-stat-divider" />
                      <div className="pd-room-stat">
                        <span className="pd-room-stat-val">{isDJ ? '👑' : '🎧'}</span>
                        <span className="pd-room-stat-lbl">{isDJ ? 'DJ' : 'Listener'}</span>
                      </div>
                    </div>

                    <div className="pd-divider" />

                    {/* ── Two big buttons ── */}
                    <div className="pd-big-btns">
                      <button className="pd-big-btn" onClick={() => { setMyGrooveOpen(true); setMyGrooveTab('radar'); setProfileOpen(false) }}>
                        <span className="pd-big-btn-icon">📡</span>
                        <span className="pd-big-btn-label">My Groove</span>
                        <span className="pd-big-btn-sub">Radar · History · Stats</span>
                      </button>
                      <button className="pd-big-btn" onClick={() => { setSettingsOpen(true); setProfileOpen(false) }}>
                        <span className="pd-big-btn-icon">⚙️</span>
                        <span className="pd-big-btn-label">Settings</span>
                        <span className="pd-big-btn-sub">Theme · Radio · Notifs</span>
                      </button>
                    </div>

                    <div className="pd-divider" />

                    {/* ── Quick room actions ── */}
                    <div className="pd-quick-actions">
                      <button className="pd-quick" onClick={() => { handleCopyInvite(); setProfileOpen(false) }} title="Invite">
                        <span>🔗</span><span>Invite</span>
                      </button>
                      <button className="pd-quick" onClick={() => { setLibraryOpen(true); setProfileOpen(false) }} title="Library">
                        <span>📚</span><span>Library</span>
                      </button>
                      <button className="pd-quick" onClick={() => { handleGetRecap(); setProfileOpen(false) }} title="Recap">
                        <span>📊</span><span>Recap</span>
                      </button>
                      <button className="pd-quick" onClick={() => { setHistoryOpen(true); setProfileOpen(false) }} title="History">
                        <span>🕐</span><span>History</span>
                      </button>
                    </div>

                    {!IS_DISCORD && (
                      <>
                        <div className="pd-divider" />
                        <button className="pd-logout" style={{ color: '#ff6a8a' }}
                          onClick={() => { setProfileOpen(false); handleLeaveRoom() }}>
                          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                            <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/>
                          </svg>
                          Leave Room
                        </button>
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
            onToggleLoop={() => setLoop(p => !p)}
            onShuffle={() => {
              const q = [...queue]
              const before = q.slice(0, currentIndex + 1)
              const after = q.slice(currentIndex + 1).sort(() => Math.random() - 0.5)
              socket.emit('reorder-queue', { roomId, queue: [...before, ...after] })
            }}
            isVisible={!isMobileView || mobileTab === 'queue'}
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
          onPlay={() => { const t = playerRef.current?.getCurrentTime?.() || 0; socket.emit('play', { roomId, time: t }); setIsPlaying(true) }}
          onPause={() => { const t = playerRef.current?.getCurrentTime?.() || 0; socket.emit('pause', { roomId, time: t }); setIsPlaying(false) }}
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
            className={`mobile-nav-btn ${libraryOpen ? 'active' : ''}`}
            onClick={() => { setChatOpen(false); setMobileTab('player'); setLibraryOpen(p => !p) }}
          >
            <span className="nav-icon">📚</span>
            <span className="nav-label">Library</span>
          </button>

          {currentSong && (
            <button
              className={`mobile-nav-btn ${videoOpen ? 'active' : ''}`}
              onClick={() => setVideoOpen(p => !p)}
            >
              <span className="nav-icon">📺</span>
              <span className="nav-label">Watch</span>
            </button>
          )}

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

      {/* Floating chat bubble — mobile + desktop */}
      {user && (
        <FloatingChatBubble
          user={user}
          unread={unread}
          chatOpen={chatOpen}
          lastMessage={lastMessage}
          onToggle={() => { setChatOpen(p => !p); setUnread(0) }}
        />
      )}

      {/* Chat overlay — floats over everything on both desktop and mobile */}
      <Chat
        socket={socket} roomId={roomId}
        username={user?.username} userAvatar={user?.avatar}
        isOpen={chatOpen} onClose={() => setChatOpen(false)}
        currentSong={currentSong} chatHistory={chatHistory}
        users={users} isDJ={isDJ}
        onAddSongToQueue={(msg) => socket.emit('add-song', { roomId, videoId: msg.videoId, title: msg.text, addedBy: msg.username })}
      />
      {showRecap && recap && (
        <SessionDNACard recap={recap} onClose={() => setShowRecap(false)} />
      )}

      {/* Leave Room Confirmation */}
      {showLeaveConfirm && (
        <div
          onClick={() => setShowLeaveConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
            animation: 'fadeIn 0.18s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(160deg, #0f0a1e, #0a0814)',
              border: '1px solid rgba(255,106,138,0.2)',
              borderRadius: 24,
              padding: '32px 28px',
              maxWidth: 360,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,106,138,0.1)',
              animation: 'slideUp 0.22s cubic-bezier(0.34,1.2,0.64,1)',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(255,106,138,0.12)',
              border: '1px solid rgba(255,106,138,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg viewBox="0 0 24 24" fill="#ff6a8a" width="28" height="28">
                <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/>
              </svg>
            </div>

            {/* Title */}
            <h2 style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: '1.1rem', fontWeight: 800,
              color: '#fff', margin: '0 0 8px',
            }}>
              Leave Room?
            </h2>

            {/* Room pill */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20, padding: '4px 14px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.8rem', color: 'var(--accent)',
              marginBottom: 16,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00c974', display: 'inline-block' }} />
              {roomId}
            </div>

            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', margin: '0 0 28px', lineHeight: 1.5 }}>
              You can rejoin anytime with the same room code.
            </p>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                style={{
                  flex: 1, padding: '13px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14, color: 'rgba(255,255,255,0.6)',
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '0.92rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
              >
                Stay
              </button>
              <button
                onClick={confirmLeaveRoom}
                style={{
                  flex: 1, padding: '13px',
                  background: 'linear-gradient(135deg, #ff6a8a, #ff2d78)',
                  border: 'none',
                  borderRadius: 14, color: '#fff',
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '0.92rem', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: '0 4px 20px rgba(255,45,120,0.35)',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scale(1.02)' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
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
      <MyGroovePanel
        isOpen={myGrooveOpen}
        initialTab={myGrooveTab}
        onClose={() => setMyGrooveOpen(false)}
        onAddToQueue={song => socket.emit('add-song', { roomId, videoId: song.videoId, title: song.title, addedBy: user?.username })}
        onLoadSession={songs => { socket.emit('add-songs-batch', { roomId, songs, addedBy: user?.username }); setMyGrooveOpen(false) }}
        roomId={roomId}
      />
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        partyMode={partyMode}
        onPartyModeChange={setPartyMode}
        radioMode={radioMode}
        onRadioModeChange={setRadioMode}
        pushEnabled={pushEnabled}
        pushLoading={pushLoading}
        onTogglePush={handleTogglePush}
        sleepTimer={sleepTimer}
        onSleepTimer={() => { setShowSleepTimer(true); setSettingsOpen(false) }}
        onCancelSleep={() => setSleepTimer(null)}
        onShortcuts={() => { setShowShortcuts(true); setSettingsOpen(false) }}
        pwaInstallable={pwaInstallable}
      />
      <GrooveRadar isOpen={radarOpen} onClose={() => setRadarOpen(false)} onAddToQueue={song => socket.emit('add-song', { roomId, videoId: song.videoId, title: song.title, addedBy: user?.username })} />
      <TimeMachine isOpen={timeMachineOpen} onClose={() => setTimeMachineOpen(false)} onLoadSession={songs => { socket.emit('add-songs-batch', { roomId, songs, addedBy: user?.username }); setTimeMachineOpen(false) }} />
      <WeeklyWrapped isOpen={wrappedOpen} onClose={() => setWrappedOpen(false)} />
      <ChemistryScore isOpen={chemistryOpen} onClose={() => setChemistryOpen(false)} roomId={roomId} />

      {/* ── Auth Error Modal ────────────────────────────── */}
      {authError && (
        <div className="auth-error-overlay" onClick={() => setAuthError(null)}>
          <div className="auth-error-modal" onClick={e => e.stopPropagation()}>
            <div className="auth-error-icon">
              {authError === 'rate_limit' ? '⏳' : authError === 'denied' ? '🚫' : '⚠️'}
            </div>
            <h3 className="auth-error-title">
              {authError === 'rate_limit' ? 'Discord is busy right now'
               : authError === 'denied'   ? 'Login cancelled'
               : authError === 'config'   ? 'Discord not configured'
               : 'Login failed'}
            </h3>
            <p className="auth-error-body">
              {authError === 'rate_limit'
                ? "Discord's servers are temporarily rate-limiting logins. Wait 15–30 minutes and try again."
                : authError === 'denied'
                ? "You cancelled the Discord login."
                : authError === 'config'
                ? "Discord credentials are misconfigured. Contact the server admin."
                : "Something went wrong with Discord. Please try again."}
            </p>
            {authError === 'rate_limit' && (
              <div className="auth-error-tip">💡 You can join as a guest while waiting</div>
            )}
            <div className="auth-error-actions">
              <button className="auth-error-btn auth-error-btn--secondary" onClick={() => setAuthError(null)}>Dismiss</button>
              {authError !== 'rate_limit' && authError !== 'config' && (
                <button className="auth-error-btn auth-error-btn--primary"
                  onClick={() => { setAuthError(null); window.location.href = `${BACKEND}/auth/discord` }}>
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* General toast */}
      {toast && (
        <div className="general-toast">{toast}</div>
      )}

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