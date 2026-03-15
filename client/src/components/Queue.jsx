import { useState, useRef, useCallback, useEffect, memo, useMemo, forwardRef } from 'react'
import { createPortal } from 'react-dom'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function extractVideoId(url) {
  if (!url) return null
  const trimmed = url.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) { const m = trimmed.match(p); if (m) return m[1] }
  return null
}

function extractPlaylistId(url) {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

async function fetchTitle(videoId) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: controller.signal }
    )
    clearTimeout(timeout)
    if (!res.ok) throw new Error()
    const data = await res.json()
    return data.title || `Song (${videoId})`
  } catch {
    return `Song (${videoId})`
  }
}

// ── Now Playing Box — fully memoized ─────────────────────────
const NowPlayingBox = memo(function NowPlayingBox({ queue, currentIndex, onPrev, onNext, loop, onToggleLoop, onShuffle }) {
  const song = queue[currentIndex]
  if (!song) return null
  return (
    <div className="now-playing-box">
      <div className="now-playing-box-header">
        <span>▶ Now Playing</span>
        <span>{currentIndex + 1} / {queue.length}</span>
      </div>
      <div className="now-playing-box-song">
        <div className="now-playing-box-thumb">
          <img src={`https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`} alt="" loading="lazy" />
        </div>
        <p className="now-playing-box-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>
          {song.title}
        </p>
      </div>
      <div className="now-playing-nav">
        <button onClick={onPrev} disabled={currentIndex === 0}>⏮ Prev</button>
        <button className={`npb-icon-btn ${loop ? 'active' : ''}`} onClick={onToggleLoop}>🔁</button>
        <button className="npb-icon-btn" onClick={onShuffle}>🔀</button>
        <button onClick={onNext} disabled={currentIndex >= queue.length - 1}>Next ⏭</button>
      </div>
    </div>
  )
})

// ── Single global preview tooltip ────────────────────────────
function SongPreview({ song, pos }) {
  if (!song || !pos) return null
  return createPortal(
    <div className="song-preview-tooltip" style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)', position: 'fixed' }}>
      <img src={`https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`} alt="" className="song-preview-thumb" loading="lazy" />
      <div className="song-preview-info">
        <p className="song-preview-title">{song.title}</p>
        {song.addedBy && <p className="song-preview-by">Added by {song.addedBy}</p>}
        <a href={`https://www.youtube.com/watch?v=${song.videoId}`} target="_blank" rel="noopener noreferrer" className="song-preview-link" onClick={e => e.stopPropagation()}>
          ▶ Open on YouTube
        </a>
      </div>
    </div>,
    document.body
  )
}

// ── Reactions — memoized ──────────────────────────────────────
const REACTION_EMOJIS = ['❤️', '🔥', '😂', '😮', '👏', '💀']
const EMPTY_OBJ = {}

const SongReactions = memo(function SongReactions({ reactions, videoId, onReact }) {
  const [open, setOpen] = useState(false)
  const total = useMemo(() => Object.values(reactions).reduce((a, b) => a + b, 0), [reactions])
  return (
    <div className="song-reactions" onClick={e => e.stopPropagation()}>
      {total > 0 && (
        <div className="song-reaction-counts">
          {Object.entries(reactions).map(([emoji, count]) =>
            count > 0 ? <span key={emoji} className="song-reaction-pill" onClick={() => onReact(videoId, emoji)}>{emoji} {count}</span> : null
          )}
        </div>
      )}
      <button className="song-react-btn" onClick={() => setOpen(p => !p)}>{open ? '✕' : '😊'}</button>
      {open && (
        <div className="song-react-picker">
          {REACTION_EMOJIS.map(e => <button key={e} onClick={() => { onReact(videoId, e); setOpen(false) }}>{e}</button>)}
        </div>
      )}
    </div>
  )
})

// ── Song row — fully memoized, uses forwardRef for hover positioning ──
const SongItem = memo(forwardRef(function SongItem(
  { song, index, currentIndex, selected, selectMode, dragOverIndex, dragIndex,
    onSelect, onDragStart, onDragOver, onDrop, onDragEnd,
    onMouseEnter, onMouseLeave, onRemove, reactions, onReact, showReactions },
  ref
) {
  const isActive   = index === currentIndex
  const isSelected = selected.has(index)

  const className = [
    'song-item',
    isActive             ? 'active'      : '',
    isSelected           ? 'selected'    : '',
    selectMode           ? 'select-mode' : '',
    dragOverIndex === index ? 'drag-over'   : '',
    dragIndex === index  ? 'dragging'    : '',
  ].filter(Boolean).join(' ')

  return (
    <li
      ref={ref}
      className={className}
      draggable={!selectMode}
      onDragStart={e => onDragStart(e, index)}
      onDragOver={e => onDragOver(e, index)}
      onDrop={e => onDrop(e, index)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => onMouseEnter(index)}
      onMouseLeave={onMouseLeave}
      onClick={() => onSelect(index)}
      style={{ position: 'relative' }}
    >
      {!selectMode && <div className="drag-handle">⠿</div>}
      {selectMode && (
        <div className={`song-check ${isSelected ? 'checked' : ''}`}>
          {isSelected && <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
        </div>
      )}

      <div className="song-thumb">
        <img
          src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`}
          alt=""
          loading="lazy"
          decoding="async"
          width="60"
          height="45"
        />
        {isActive && <div className="now-playing-overlay"><div className="bars"><span /><span /><span /></div></div>}
      </div>

      <div className="song-info">
        <p className="song-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
          {song.title}
        </p>
        {song.addedBy && <p className="song-id">by {song.addedBy}</p>}
      </div>

      {!selectMode && showReactions && (
        <SongReactions reactions={reactions[song.videoId] || EMPTY_OBJ} videoId={song.videoId} onReact={onReact} />
      )}

      {!selectMode && (
        <button className="remove-btn" onClick={e => { e.stopPropagation(); onRemove(index) }} title="Remove">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      )}
    </li>
  )
}))

// ── Main Queue ────────────────────────────────────────────────
export default function Queue({
  queue = [], currentIndex = 0,
  onAddSong, onSelectSong, onRemoveSong, onNext, onPrev,
  socket, roomId, username,
  loop, onToggleLoop,
}) {
  // Detect mobile once — no listener needed, doesn't change during session
  const isMobile = window.innerWidth <= 768
  const [sharedUrl, setSharedUrl]           = useState('')
  const [error, setError]                   = useState('')
  const [loading, setLoading]               = useState(false)
  const [importing, setImporting]           = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [tab, setTab]                       = useState('song')
  const [addedFlash, setAddedFlash]         = useState(false)
  const [selected, setSelected]             = useState(new Set())
  const [selectMode, setSelectMode]         = useState(false)
  const [lastImported, setLastImported]     = useState(null)
  const [savingLibrary, setSavingLibrary]   = useState(false)
  const [saveSuccess, setSaveSuccess]       = useState(false)
  const [dragIndex, setDragIndex]           = useState(null)
  const [dragOverIndex, setDragOverIndex]   = useState(null)
  const [reactions, setReactions]           = useState({})
  const [toast, setToast]                   = useState(null)
  const [hoverSong, setHoverSong]           = useState(null)
  const [hoverPos, setHoverPos]             = useState(null)

  const hoverTimer   = useRef(null)
  const toastTimer   = useRef(null)
  const inputRef     = useRef(null)
  const itemRefs     = useRef({})
  const lastDragOver = useRef(-1)

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    if (!socket) return
    const handler = ({ title, addedBy }) => {
      if (addedBy !== username) showToast(`🎵 ${addedBy} added "${title}"`)
    }
    socket.on('song-added-notify', handler)
    return () => socket.off('song-added-notify', handler)
  }, [socket, username, showToast])

  useEffect(() => {
    if (!socket) return
    const handler = ({ videoId, emoji }) => {
      setReactions(prev => ({
        ...prev,
        [videoId]: { ...(prev[videoId] || {}), [emoji]: ((prev[videoId]?.[emoji]) || 0) + 1 }
      }))
    }
    socket.on('song-reaction', handler)
    return () => socket.off('song-reaction', handler)
  }, [socket])

  const handleReact = useCallback((videoId, emoji) => {
    setReactions(prev => ({
      ...prev,
      [videoId]: { ...(prev[videoId] || {}), [emoji]: ((prev[videoId]?.[emoji]) || 0) + 1 }
    }))
    socket?.emit('song-react', { roomId, videoId, emoji, username })
  }, [socket, roomId, username])

  const videoId         = extractVideoId(sharedUrl)
  const playlistId      = extractPlaylistId(sharedUrl)
  const isValidSong     = !!videoId
  const isValidPlaylist = !!playlistId

  const handleAddSong = async () => {
    if (!sharedUrl.trim()) { setError('Paste a YouTube URL first'); return }
    if (!videoId) { setError('Invalid YouTube URL'); return }
    const dupeCount = queue.filter(s => s.videoId === videoId).length
    if (dupeCount >= 3) { setError('Already in queue 3 times'); return }
    if (dupeCount > 0) setError(`⚠️ Already in queue (${dupeCount}x) — added again`)
    else setError('')
    setLoading(true)
    const title = await fetchTitle(videoId)
    onAddSong({ videoId, title })
    setSharedUrl(''); setLoading(false); setAddedFlash(true)
    showToast(`✅ Added "${title}"`)
    setTimeout(() => { setAddedFlash(false); setError('') }, 2000)
    inputRef.current?.focus()
  }

  const handleImportPlaylist = async () => {
    if (!sharedUrl.trim()) { setError('Paste a playlist URL first'); return }
    if (!playlistId) { setError('Could not find a playlist ID'); return }
    setImporting(true); setError(''); setImportProgress('Fetching playlist...'); setLastImported(null)
    try {
      const res = await fetch(`${BACKEND}/youtube/playlist?playlistId=${playlistId}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to fetch playlist'); return }
      setImportProgress(`Adding ${data.total} songs...`)
      // Single batch emit — one DB write, one broadcast instead of N
      socket.emit('add-songs-batch', { roomId, songs: data.songs, addedBy: username })
      setLastImported({ songs: data.songs, count: data.total })
      showToast(`🎵 ${data.total} songs queued!`)
      setSharedUrl(''); setImportProgress(null)
    } catch {
      setError('Failed to import playlist'); setImportProgress(null)
    } finally { setImporting(false) }
  }

  const handleShuffle = useCallback(() => {
    if (queue.length < 2) return
    const before = queue.slice(0, currentIndex + 1)
    const after  = [...queue.slice(currentIndex + 1)]
    for (let i = after.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [after[i], after[j]] = [after[j], after[i]]
    }
    socket?.emit('reorder-queue', { roomId, queue: [...before, ...after] })
    showToast('🔀 Queue shuffled!')
  }, [queue, currentIndex, socket, roomId, showToast])

  const handleDragStart = useCallback((e, index) => {
    setDragIndex(index); e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    if (lastDragOver.current !== index) {
      lastDragOver.current = index
      setDragOverIndex(index)
    }
  }, [])

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault()
    setDragIndex(prev => {
      if (prev === null || prev === dropIndex) { setDragOverIndex(null); return null }
      const newQ = [...queue]
      const [moved] = newQ.splice(prev, 1)
      newQ.splice(dropIndex, 0, moved)
      socket?.emit('reorder-queue', { roomId, queue: newQ })
      setDragOverIndex(null)
      return null
    })
    lastDragOver.current = -1
  }, [queue, socket, roomId])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null); setDragOverIndex(null); lastDragOver.current = -1
  }, [])

  const handleMouseEnter = useCallback((index) => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      const el = itemRefs.current[index]
      if (!el) return
      const rect = el.getBoundingClientRect()
      const above = rect.top > 106
      setHoverSong(queue[index])
      setHoverPos({
        top:  above ? rect.top - 98 : rect.bottom + 8,
        left: Math.min(rect.left + rect.width / 2, window.innerWidth - 310),
      })
    }, 600)
  }, [queue])

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current)
    setHoverSong(null); setHoverPos(null)
  }, [])

  const handleSelect = useCallback((index) => {
    if (selectMode) {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index); else next.add(index)
        return next
      })
    } else {
      onSelectSong(index)
    }
  }, [selectMode, onSelectSong])

  const selectAll    = useCallback(() => setSelected(prev => prev.size === queue.length ? new Set() : new Set(queue.map((_, i) => i))), [queue])
  const removeSelected = useCallback(() => {
    [...selected].sort((a, b) => b - a).forEach(i => onRemoveSong(i))
    setSelected(new Set()); setSelectMode(false)
  }, [selected, onRemoveSong])
  const exitSelectMode = useCallback(() => { setSelectMode(false); setSelected(new Set()) }, [])

  const handleSaveToLibrary = async () => {
    if (!lastImported) return
    setSavingLibrary(true)
    try {
      const catRes = await fetch(`${BACKEND}/library/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: `Import (${lastImported.count} songs)`, color: '#7c6aff' }) })
      if (!catRes.ok) throw new Error()
      const category = await catRes.json()
      for (const song of lastImported.songs) {
        await fetch(`${BACKEND}/library/categories/${category.id}/songs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ videoId: song.videoId, title: song.title }) })
      }
      setSaveSuccess(true); setLastImported(null); setTimeout(() => setSaveSuccess(false), 3000)
    } catch { setError('Could not save — are you logged in?') } finally { setSavingLibrary(false) }
  }

  const handleSaveSelectedToLibrary = async () => {
    const songs = [...selected].map(i => queue[i])
    setSavingLibrary(true)
    try {
      const catRes = await fetch(`${BACKEND}/library/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: `Queue Selection (${songs.length} songs)`, color: '#ff6a8a' }) })
      if (!catRes.ok) throw new Error()
      const category = await catRes.json()
      for (const song of songs) {
        await fetch(`${BACKEND}/library/categories/${category.id}/songs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ videoId: song.videoId, title: song.title }) })
      }
      setSaveSuccess(true); exitSelectMode(); setTimeout(() => setSaveSuccess(false), 3000)
    } catch { setError('Could not save to library') } finally { setSavingLibrary(false) }
  }

  return (
    <div className="queue">
      {toast && <div className="queue-toast">{toast}</div>}

      {/* Single global hover preview — desktop only */}
      {!isMobile && <SongPreview song={hoverSong} pos={hoverPos} />}

      <div className="queue-header">
        <h2>Queue</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {queue.length > 0 && (
            <button className={`toolbar-btn ${selectMode ? 'active-mode' : ''}`} onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}>
              {selectMode ? '✕ Cancel' : '☐ Select'}
            </button>
          )}
          <span className="queue-count">{queue.length} songs</span>
        </div>
      </div>

      {queue.length > 0 && (
        <NowPlayingBox queue={queue} currentIndex={currentIndex} onPrev={onPrev} onNext={onNext} loop={loop} onToggleLoop={onToggleLoop} onShuffle={handleShuffle} />
      )}

      <div className="queue-tabs">
        <button className={`queue-tab ${tab === 'song' ? 'active' : ''}`} onClick={() => { setTab('song'); setError('') }}>Add Song</button>
        <button className={`queue-tab ${tab === 'playlist' ? 'active' : ''}`} onClick={() => { setTab('playlist'); setError('') }}>🎵 Import Playlist</button>
      </div>

      <div className="add-song">
        <input ref={inputRef} type="text"
          placeholder={tab === 'song' ? 'Paste YouTube URL...' : 'Paste YouTube playlist URL...'}
          value={sharedUrl} onChange={e => { setSharedUrl(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key !== 'Enter') return; if (tab === 'song') handleAddSong(); else handleImportPlaylist() }}
        />
        {tab === 'song' ? (
          <button className={`add-btn ${addedFlash ? 'flash' : ''}`} onClick={handleAddSong} disabled={loading} title="Add song">
            {loading ? <span className="loading-spinner" /> : addedFlash
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            }
          </button>
        ) : (
          <button className="add-btn" onClick={handleImportPlaylist} disabled={importing} title="Import playlist">
            {importing ? <span className="loading-spinner" /> : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>}
          </button>
        )}
      </div>

      {sharedUrl && (
        <div className="url-hint">
          {isValidSong && <span className="url-hint-good">✓ Valid YouTube video</span>}
          {isValidPlaylist && <span className="url-hint-playlist">📋 Playlist detected — switch to Import tab</span>}
          {!isValidSong && !isValidPlaylist && sharedUrl.length > 5 && <span className="url-hint-bad">✗ Not a valid YouTube URL</span>}
        </div>
      )}

      {importProgress && <div className="import-progress"><span className="loading-spinner" />{importProgress}</div>}
      {error && <p className={`error ${error.startsWith('⚠️') ? 'warn' : ''}`}>{error}</p>}

      {lastImported && (
        <div className="save-library-banner">
          <span>✅ {lastImported.count} songs added!</span>
          <button className="save-library-btn" onClick={handleSaveToLibrary} disabled={savingLibrary}>
            {savingLibrary ? <span className="loading-spinner" /> : '📚 Save to Library'}
          </button>
        </div>
      )}
      {saveSuccess && <div className="save-library-banner success">✅ Saved to your library!</div>}

      {selectMode && queue.length > 0 && (
        <div className="queue-toolbar">
          <button className="toolbar-btn" onClick={selectAll}>{selected.size === queue.length ? '☑ Deselect All' : '☐ Select All'}</button>
          {selected.size > 0 && (
            <>
              <button className="toolbar-btn danger" onClick={removeSelected}>🗑 Remove {selected.size}</button>
              <button className="toolbar-btn save" onClick={handleSaveSelectedToLibrary} disabled={savingLibrary}>📚 Save {selected.size}</button>
            </>
          )}
        </div>
      )}

      <ul className="song-list">
        {queue.length === 0 && (
          <li className="empty">
            <span>🎧</span>
            <p>Queue is empty</p>
            <p className="empty-sub">Add a song or import a playlist above</p>
          </li>
        )}
        {queue.map((song, i) => (
          <SongItem
            key={`${song.videoId}-${i}`}
            ref={el => { if (el) itemRefs.current[i] = el; else delete itemRefs.current[i] }}
            song={song}
            index={i}
            currentIndex={currentIndex}
            selected={selected}
            selectMode={selectMode}
            dragOverIndex={dragOverIndex}
            dragIndex={dragIndex}
            onSelect={handleSelect}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onMouseEnter={isMobile ? null : handleMouseEnter}
            onMouseLeave={isMobile ? null : handleMouseLeave}
            onRemove={onRemoveSong}
            reactions={isMobile ? EMPTY_OBJ : reactions}
            onReact={handleReact}
            showReactions={!isMobile}
          />
        ))}
      </ul>
    </div>
  )
}
