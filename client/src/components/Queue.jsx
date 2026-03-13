// ── Now Playing Box ───────────────────────────────────────────
function NowPlayingBox({ queue = [], currentIndex = 0, onPrev, onNext, loop, onToggleLoop, onShuffle }) {
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
          <img src={`https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`} alt="" />
        </div>
        <p className="now-playing-box-title">{song.title}</p>
      </div>
      <div className="now-playing-nav">
        <button onClick={onPrev} disabled={currentIndex === 0}>⏮ Prev</button>
        <button className={`npb-icon-btn ${loop ? 'active' : ''}`} onClick={onToggleLoop} title={loop ? 'Loop: On' : 'Loop: Off'}>🔁</button>
        <button className="npb-icon-btn" onClick={onShuffle} title="Shuffle queue">🔀</button>
        <button onClick={onNext} disabled={currentIndex >= queue.length - 1}>Next ⏭</button>
      </div>
    </div>
  )
}

import { useState, useRef, useCallback, useEffect } from 'react'

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

// ── Song preview tooltip (portal-based to escape overflow) ───
import { createPortal } from 'react-dom'

function SongPreview({ song, visible, anchorRef }) {
  const [pos, setPos] = useState({ top: 0, left: 0, above: true })

  useEffect(() => {
    if (!visible || !anchorRef?.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const tooltipH = 90
    const above = rect.top > tooltipH + 16
    setPos({
      top: above ? rect.top - tooltipH - 8 : rect.bottom + 8,
      left: Math.min(rect.left + rect.width / 2, window.innerWidth - 310),
      above,
    })
  }, [visible, anchorRef])

  if (!visible || !song) return null

  return createPortal(
    <div
      className="song-preview-tooltip"
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
    >
      <img src={`https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`} alt="" className="song-preview-thumb" />
      <div className="song-preview-info">
        <p className="song-preview-title">{song.title}</p>
        {song.addedBy && <p className="song-preview-by">Added by {song.addedBy}</p>}
        <a href={`https://www.youtube.com/watch?v=${song.videoId}`} target="_blank" rel="noopener noreferrer"
          className="song-preview-link" onClick={e => e.stopPropagation()}>
          ▶ Open on YouTube
        </a>
      </div>
    </div>,
    document.body
  )
}

// ── Per-song reactions ────────────────────────────────────────
const REACTION_EMOJIS = ['❤️', '🔥', '😂', '😮', '👏', '💀']

function SongReactions({ reactions = {}, videoId, onReact }) {
  const [open, setOpen] = useState(false)
  const total = Object.values(reactions).reduce((a, b) => a + b, 0)
  return (
    <div className="song-reactions" onClick={e => e.stopPropagation()}>
      {total > 0 && (
        <div className="song-reaction-counts">
          {Object.entries(reactions).map(([emoji, count]) =>
            count > 0 ? (
              <span key={emoji} className="song-reaction-pill" onClick={() => onReact(videoId, emoji)}>
                {emoji} {count}
              </span>
            ) : null
          )}
        </div>
      )}
      <button className="song-react-btn" onClick={() => setOpen(p => !p)} title="React">
        {open ? '✕' : '😊'}
      </button>
      {open && (
        <div className="song-react-picker">
          {REACTION_EMOJIS.map(e => (
            <button key={e} onClick={() => { onReact(videoId, e); setOpen(false) }}>{e}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Queue({
  queue = [], currentIndex = 0,
  onAddSong, onSelectSong, onRemoveSong, onNext, onPrev,
  socket, roomId, username,
  loop, onToggleLoop,
}) {
  const [sharedUrl, setSharedUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [tab, setTab] = useState('song')
  const [addedFlash, setAddedFlash] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [lastImported, setLastImported] = useState(null)
  const [savingLibrary, setSavingLibrary] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [hoverIndex, setHoverIndex] = useState(null)
  const [reactions, setReactions] = useState({})
  const [toast, setToast] = useState(null)
  const hoverTimer = useRef(null)
  const toastTimer = useRef(null)
  const inputRef = useRef(null)

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  // Listen for song-added notifications from other users
  useEffect(() => {
    if (!socket) return
    const handler = ({ title, addedBy }) => {
      if (addedBy !== username) showToast(`🎵 ${addedBy} added "${title}"`)
    }
    socket.on('song-added-notify', handler)
    return () => socket.off('song-added-notify', handler)
  }, [socket, username, showToast])

  // Listen for reactions from other users
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

  const handleReact = (videoId, emoji) => {
    setReactions(prev => ({
      ...prev,
      [videoId]: { ...(prev[videoId] || {}), [emoji]: ((prev[videoId]?.[emoji]) || 0) + 1 }
    }))
    socket?.emit('song-react', { roomId, videoId, emoji, username })
  }

  const videoId = extractVideoId(sharedUrl)
  const playlistId = extractPlaylistId(sharedUrl)
  const isValidSong = !!videoId
  const isValidPlaylist = !!playlistId

  const handleAddSong = async () => {
    if (!sharedUrl.trim()) { setError('Paste a YouTube URL first'); return }
    if (!videoId) { setError('Invalid YouTube URL — could not extract video ID'); return }
    const dupeCount = queue.filter(s => s.videoId === videoId).length
    if (dupeCount >= 3) { setError('Already in queue 3 times — not adding more'); return }
    if (dupeCount > 0) setError(`⚠️ Already in queue (${dupeCount}x) — added again`)
    else setError('')
    setLoading(true)
    const title = await fetchTitle(videoId)
    onAddSong({ videoId, title })
    setSharedUrl('')
    setLoading(false)
    setAddedFlash(true)
    showToast(`✅ Added "${title}"`)
    setTimeout(() => { setAddedFlash(false); setError('') }, 2000)
    inputRef.current?.focus()
  }

  const handleImportPlaylist = async () => {
    if (!sharedUrl.trim()) { setError('Paste a YouTube playlist URL first'); return }
    if (!playlistId) { setError('Could not find a playlist ID in this URL'); return }
    setImporting(true); setError(''); setImportProgress('Fetching playlist...'); setLastImported(null)
    try {
      const res = await fetch(`${BACKEND}/youtube/playlist?playlistId=${playlistId}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to fetch playlist'); return }
      setImportProgress(`Adding ${data.total} songs...`)
      for (const song of data.songs) onAddSong({ videoId: song.videoId, title: song.title })
      setLastImported({ songs: data.songs, count: data.total })
      showToast(`🎵 Imported ${data.total} songs!`)
      setSharedUrl(''); setImportProgress(null)
    } catch {
      setError('Failed to import playlist — check the URL'); setImportProgress(null)
    } finally { setImporting(false) }
  }

  // Shuffle remaining queue after current song
  const handleShuffle = () => {
    if (queue.length < 2) return
    const before = queue.slice(0, currentIndex + 1)
    const after = queue.slice(currentIndex + 1)
    for (let i = after.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [after[i], after[j]] = [after[j], after[i]]
    }
    socket?.emit('reorder-queue', { roomId, queue: [...before, ...after] })
    showToast('🔀 Queue shuffled!')
  }

  // Drag to reorder
  const handleDragStart = (e, index) => { setDragIndex(index); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver = (e, index) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIndex(index) }
  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); setDragOverIndex(null); return }
    const newQueue = [...queue]
    const [moved] = newQueue.splice(dragIndex, 1)
    newQueue.splice(dropIndex, 0, moved)
    socket?.emit('reorder-queue', { roomId, queue: newQueue })
    setDragIndex(null); setDragOverIndex(null)
  }
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null) }

  // Hover preview (delay 600ms)
  const handleMouseEnter = (index) => { hoverTimer.current = setTimeout(() => setHoverIndex(index), 600) }
  const handleMouseLeave = () => { clearTimeout(hoverTimer.current); setHoverIndex(null) }

  const toggleSelect = useCallback((i) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next })
  }, [])
  const selectAll = () => { if (selected.size === queue.length) setSelected(new Set()); else setSelected(new Set(queue.map((_, i) => i))) }
  const removeSelected = () => { [...selected].sort((a, b) => b - a).forEach(i => onRemoveSong(i)); setSelected(new Set()); setSelectMode(false) }
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }

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
          value={sharedUrl} onChange={(e) => { setSharedUrl(e.target.value); setError('') }}
          onKeyDown={(e) => { if (e.key !== 'Enter') return; if (tab === 'song') handleAddSong(); else handleImportPlaylist() }}
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
        {queue.map((song, i) => {
          const itemRef = { current: null }
          return (
          <li
            key={`${song.videoId}-${i}`}
            ref={el => itemRef.current = el}
            className={['song-item', i === currentIndex ? 'active' : '', selected.has(i) ? 'selected' : '', selectMode ? 'select-mode' : '', dragOverIndex === i ? 'drag-over' : '', dragIndex === i ? 'dragging' : ''].filter(Boolean).join(' ')}
            draggable={!selectMode}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            onMouseEnter={() => !selectMode && handleMouseEnter(i)}
            onMouseLeave={handleMouseLeave}
            onClick={() => selectMode ? toggleSelect(i) : onSelectSong(i)}
            style={{ position: 'relative' }}
          >
            {!selectMode && <div className="drag-handle" title="Drag to reorder">⠿</div>}

            {selectMode && (
              <div className={`song-check ${selected.has(i) ? 'checked' : ''}`}>
                {selected.has(i) && <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
              </div>
            )}

            <div className="song-thumb">
              <img src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`} alt="" />
              {i === currentIndex && <div className="now-playing-overlay"><div className="bars"><span /><span /><span /></div></div>}
            </div>

            <div className="song-info">
              <p className="song-name">{song.title}</p>
              {song.addedBy && <p className="song-id">by {song.addedBy}</p>}
            </div>

            {!selectMode && <SongReactions reactions={reactions[song.videoId] || {}} videoId={song.videoId} onReact={handleReact} />}

            {!selectMode && (
              <button className="remove-btn" onClick={(e) => { e.stopPropagation(); onRemoveSong(i) }} title="Remove">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            )}

            <SongPreview song={song} visible={hoverIndex === i} anchorRef={itemRef} />
          </li>
        )})}

      </ul>
    </div>
  )
}