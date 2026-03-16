import { useState, useRef, useCallback, useEffect, memo, useMemo, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import CategoryFilter from './CategoryFilter'
import { useCategories, getCategoryDef } from '../hooks/useCategories'

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



const EMPTY_OBJ = {}

// ── Song row — fully memoized, uses forwardRef for hover positioning ──
const SongItem = memo(forwardRef(function SongItem(
  { song, index, currentIndex, selected, selectMode, dragOverIndex, dragIndex,
    onSelect, onDragStart, onDragOver, onDrop, onDragEnd,
    onRemove },
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
  loop, onToggleLoop, isVisible = true,
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
  const [toast, setToast]                   = useState(null)

  const [searchQuery, setSearchQuery]       = useState('')
  const [searchResults, setSearchResults]   = useState([])
  const [searching, setSearching]           = useState(false)
  const [searchError, setSearchError]       = useState('')
  const searchTimer                         = useRef(null)

  const [flowScores, setFlowScores]   = useState({})
  const [dnaData, setDnaData]         = useState({})
  const [activeCategory, setActiveCategory] = useState('All')

  const { categories, loading: catLoading } = useCategories(queue)

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = {}
    Object.values(categories).forEach(d => {
      if (d.category) counts[d.category] = (counts[d.category] || 0) + 1
    })
    return counts
  }, [categories])

  // Filter queue by active category
  const filteredQueue = useMemo(() => {
    if (activeCategory === 'All') return queue
    return queue.filter((s, i) => {
      const cat = categories[s.videoId]?.category || 'Vibes'
      return cat === activeCategory
    })
  }, [queue, activeCategory, categories])

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

  const handleSearch = useCallback(async (query) => {
    if (!query.trim()) { setSearchResults([]); return }
    setSearching(true); setSearchError('')
    try {
      const res = await fetch(`${BACKEND}/youtube/search?q=${encodeURIComponent(query)}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setSearchResults(data.results || [])
    } catch (e) {
      setSearchError(e.message)
      setSearchResults([])
    } finally { setSearching(false) }
  }, [])

  const handleSearchInput = (value) => {
    setSearchQuery(value)
    clearTimeout(searchTimer.current)
    if (!value.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(() => handleSearch(value), 500)
  }

  const handleAddFromSearch = useCallback(async (result) => {
    onAddSong({ videoId: result.videoId, title: result.title })
    setAddedFlash(true)
    setTimeout(() => setAddedFlash(false), 800)
    showToast(`🎵 Added "${result.title}"`)
  }, [onAddSong, showToast])

  // Fetch flow scores when queue changes
  useEffect(() => {
    if (queue.length < 2 || !isVisible) { setFlowScores({}); return }
    const fetchFlows = async () => {
      try {
        const res = await fetch(`${BACKEND}/flow-scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ songs: queue.map(s => ({ videoId: s.videoId, title: s.title })) })
        })
        if (!res.ok) return
        const data = await res.json()
        const map = {}
        ;(data.scores || []).forEach(s => { map[s.videoId] = s })
        setFlowScores(map)
      } catch {}
    }
    // Debounce — don't fetch on every single queue change
    const t = setTimeout(fetchFlows, 1500)
    return () => clearTimeout(t)
  }, [queue.map(s=>s.videoId).join(',')])

  // Select a song — plays it when not in select mode, toggles selection when in select mode
  const handleSelect = useCallback((index) => {
    if (selectMode) {
      setSelected(prev => {
        const next = new Set(prev)
        next.has(index) ? next.delete(index) : next.add(index)
        return next
      })
    } else {
      onSelectSong(index)
    }
  }, [selectMode, onSelectSong])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelected(new Set())
  }, [])

  const selectAll = useCallback(() => {
    if (selected.size === queue.length) setSelected(new Set())
    else setSelected(new Set(queue.map((_, i) => i)))
  }, [selected.size, queue.length])

  const removeSelected = useCallback(() => {
    // Remove in reverse order so indices don't shift
    const indices = [...selected].sort((a, b) => b - a)
    indices.forEach(i => onRemoveSong(i))
    exitSelectMode()
  }, [selected, onRemoveSong, exitSelectMode])

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
        <button className={`queue-tab ${tab === 'search' ? 'active' : ''}`} onClick={() => { setTab('search'); setError('') }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style={{marginRight:'4px'}}><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          Search
        </button>
        <button className={`queue-tab ${tab === 'playlist' ? 'active' : ''}`} onClick={() => { setTab('playlist'); setError('') }}>Import Playlist</button>
      </div>

      <div className={`add-song ${tab === 'search' ? 'add-song--hidden' : ''}`}>
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

      {sharedUrl && tab !== 'search' && (
        <div className="url-hint">
          {isValidSong && <span className="url-hint-good">✓ Valid YouTube video</span>}
          {isValidPlaylist && <span className="url-hint-playlist">📋 Playlist detected — switch to Import tab</span>}
          {!isValidSong && !isValidPlaylist && sharedUrl.length > 5 && <span className="url-hint-bad">✗ Not a valid YouTube URL</span>}
        </div>
      )}

      {/* YouTube Search UI */}
      {tab === 'search' && (
        <div className="yt-search">
          <div className="yt-search-input-wrap">
            <svg className="yt-search-icon" viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input
              className="yt-search-input"
              type="text"
              placeholder="Search for a song..."
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button className="yt-search-clear" onClick={() => { setSearchQuery(''); setSearchResults([]) }}>×</button>
            )}
          </div>

          {searching && (
            <div className="yt-search-loading">
              <span className="loading-spinner" />
              <span>Searching…</span>
            </div>
          )}

          {searchError && (
            <p className="yt-search-error">{searchError}</p>
          )}

          {!searching && searchResults.length > 0 && (
            <ul className="yt-search-results">
              {searchResults.map(result => (
                <li key={result.videoId} className="yt-result-item" onClick={() => handleAddFromSearch(result)}>
                  <div className="yt-result-thumb">
                    <img src={result.thumbnail} alt="" loading="lazy" />
                    <div className="yt-result-play">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <div className="yt-result-info">
                    <p className="yt-result-title">{result.title}</p>
                    <p className="yt-result-channel">{result.channel}</p>
                  </div>
                  <button className="yt-result-add" title="Add to queue">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!searching && searchQuery && searchResults.length === 0 && !searchError && (
            <p className="yt-search-empty">No results for "{searchQuery}"</p>
          )}

          {!searchQuery && (
            <p className="yt-search-hint">Type to search YouTube music</p>
          )}
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
            onRemove={onRemoveSong}
          />
        ))}
      </ul>
    </div>
  )
}