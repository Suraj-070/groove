
// ── Now Playing Box ───────────────────────────────────────────
function NowPlayingBox({ queue, currentIndex, onPrev, onNext, onSelectSong }) {
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
        <button onClick={onNext} disabled={currentIndex >= queue.length - 1}>Next ⏭</button>
      </div>
    </div>
  )
}

import { useState, useRef, useCallback } from 'react'

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

export default function Queue({ queue, currentIndex, onAddSong, onSelectSong, onRemoveSong, onNext, onPrev, socket, roomId, username }) {
  // ── shared URL state across both tabs ────────────────────
  const [sharedUrl, setSharedUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [tab, setTab] = useState('song')
  const [addedFlash, setAddedFlash] = useState(false)

  // multi-select
  const [selected, setSelected] = useState(new Set())
  const [selectMode, setSelectMode] = useState(false)

  // save to library
  const [lastImported, setLastImported] = useState(null)
  const [savingLibrary, setSavingLibrary] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const inputRef = useRef(null)

  // ── URL helpers ───────────────────────────────────────────
  const videoId = extractVideoId(sharedUrl)
  const playlistId = extractPlaylistId(sharedUrl)
  const isValidSong = !!videoId
  const isValidPlaylist = !!playlistId

  // ── Add single song ───────────────────────────────────────
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
    setTimeout(() => { setAddedFlash(false); setError('') }, 2000)
    inputRef.current?.focus()
  }

  // ── Import playlist ───────────────────────────────────────
  const handleImportPlaylist = async () => {
    if (!sharedUrl.trim()) { setError('Paste a YouTube playlist URL first'); return }
    if (!playlistId) { setError('Could not find a playlist ID in this URL'); return }
    setImporting(true)
    setError('')
    setImportProgress('Fetching playlist...')
    setLastImported(null)
    try {
      const res = await fetch(`${BACKEND}/youtube/playlist?playlistId=${playlistId}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to fetch playlist'); return }
      setImportProgress(`Adding ${data.total} songs...`)
      for (const song of data.songs) onAddSong({ videoId: song.videoId, title: song.title })
      setLastImported({ songs: data.songs, count: data.total })
      setSharedUrl('')
      setImportProgress(null)
    } catch {
      setError('Failed to import playlist — check the URL')
      setImportProgress(null)
    } finally {
      setImporting(false)
    }
  }

  // ── Multi-select ──────────────────────────────────────────
  const toggleSelect = useCallback((i) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }, [])

  const selectAll = () => {
    if (selected.size === queue.length) setSelected(new Set())
    else setSelected(new Set(queue.map((_, i) => i)))
  }

  const removeSelected = () => {
    const indices = [...selected].sort((a, b) => b - a)
    indices.forEach(i => onRemoveSong(i))
    setSelected(new Set())
    setSelectMode(false)
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  // ── Save imported to library ──────────────────────────────
  const handleSaveToLibrary = async () => {
    if (!lastImported) return
    setSavingLibrary(true)
    try {
      const catRes = await fetch(`${BACKEND}/library/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: `Import (${lastImported.count} songs)`, color: '#7c6aff' })
      })
      if (!catRes.ok) throw new Error()
      const category = await catRes.json()
      for (const song of lastImported.songs) {
        await fetch(`${BACKEND}/library/categories/${category.id}/songs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ videoId: song.videoId, title: song.title })
        })
      }
      setSaveSuccess(true)
      setLastImported(null)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setError('Could not save — are you logged in with Discord or Google?')
    } finally {
      setSavingLibrary(false)
    }
  }

  // ── Save selected songs to library ────────────────────────
  const handleSaveSelectedToLibrary = async () => {
    const songs = [...selected].map(i => queue[i])
    setSavingLibrary(true)
    try {
      const catRes = await fetch(`${BACKEND}/library/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: `Queue Selection (${songs.length} songs)`, color: '#ff6a8a' })
      })
      if (!catRes.ok) throw new Error()
      const category = await catRes.json()
      for (const song of songs) {
        await fetch(`${BACKEND}/library/categories/${category.id}/songs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ videoId: song.videoId, title: song.title })
        })
      }
      setSaveSuccess(true)
      exitSelectMode()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setError('Could not save to library')
    } finally {
      setSavingLibrary(false)
    }
  }

  return (
    <div className="queue">
      <div className="queue-header">
        <h2>Queue</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {queue.length > 0 && (
            <button
              className={`toolbar-btn ${selectMode ? 'active-mode' : ''}`}
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            >
              {selectMode ? '✕ Cancel' : '☐ Select'}
            </button>
          )}
          <span className="queue-count">{queue.length} songs</span>
        </div>
      </div>

      {/* ── Now Playing Box ─────────────────────────────── */}
      {queue.length > 0 && (
        <NowPlayingBox
          queue={queue}
          currentIndex={currentIndex}
          onPrev={onPrev}
          onNext={onNext}
          onSelectSong={onSelectSong}
        />
      )}

      {/* ── Tabs ─────────────────────────────────────────── */}
      <div className="queue-tabs">
        <button className={`queue-tab ${tab === 'song' ? 'active' : ''}`}
          onClick={() => { setTab('song'); setError('') }}>
          Add Song
        </button>
        <button className={`queue-tab ${tab === 'playlist' ? 'active' : ''}`}
          onClick={() => { setTab('playlist'); setError('') }}>
          🎵 Import Playlist
        </button>
      </div>

      {/* ── Shared URL input ─────────────────────────────── */}
      <div className="add-song">
        <input
          ref={inputRef}
          type="text"
          placeholder={tab === 'song' ? 'Paste YouTube URL...' : 'Paste YouTube playlist URL...'}
          value={sharedUrl}
          onChange={(e) => { setSharedUrl(e.target.value); setError('') }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            if (tab === 'song') handleAddSong()
            else handleImportPlaylist()
          }}
        />
        {tab === 'song' ? (
          <button
            className={`add-btn ${addedFlash ? 'flash' : ''}`}
            onClick={handleAddSong}
            disabled={loading}
            title="Add song"
          >
            {loading ? <span className="loading-spinner" />
              : addedFlash
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            }
          </button>
        ) : (
          <button className="add-btn" onClick={handleImportPlaylist} disabled={importing} title="Import playlist">
            {importing
              ? <span className="loading-spinner" />
              : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            }
          </button>
        )}
      </div>

      {/* URL smart hint */}
      {sharedUrl && (
        <div className="url-hint">
          {isValidSong && <span className="url-hint-good">✓ Valid YouTube video</span>}
          {isValidPlaylist && <span className="url-hint-playlist">📋 Playlist detected — switch to Import tab</span>}
          {!isValidSong && !isValidPlaylist && sharedUrl.length > 5 && <span className="url-hint-bad">✗ Not a valid YouTube URL</span>}
        </div>
      )}

      {importProgress && <div className="import-progress"><span className="loading-spinner" />{importProgress}</div>}
      {error && <p className={`error ${error.startsWith('⚠️') ? 'warn' : ''}`}>{error}</p>}

      {/* Save to library after import */}
      {lastImported && (
        <div className="save-library-banner">
          <span>✅ {lastImported.count} songs added!</span>
          <button className="save-library-btn" onClick={handleSaveToLibrary} disabled={savingLibrary}>
            {savingLibrary ? <span className="loading-spinner" /> : '📚 Save to Library'}
          </button>
        </div>
      )}
      {saveSuccess && <div className="save-library-banner success">✅ Saved to your library!</div>}

      {/* Multi-select toolbar */}
      {selectMode && queue.length > 0 && (
        <div className="queue-toolbar">
          <button className="toolbar-btn" onClick={selectAll}>
            {selected.size === queue.length ? '☑ Deselect All' : '☐ Select All'}
          </button>
          {selected.size > 0 && (
            <>
              <button className="toolbar-btn danger" onClick={removeSelected}>
                🗑 Remove {selected.size}
              </button>
              <button className="toolbar-btn save" onClick={handleSaveSelectedToLibrary} disabled={savingLibrary}>
                📚 Save {selected.size}
              </button>
            </>
          )}
        </div>
      )}

      {/* Song list */}
      <ul className="song-list">
        {queue.length === 0 && (
          <li className="empty">
            <span>🎧</span>
            <p>Queue is empty</p>
            <p className="empty-sub">Add a song or import a playlist above</p>
          </li>
        )}
        {queue.map((song, i) => (
          <li
            key={`${song.videoId}-${i}`}
            className={`song-item ${i === currentIndex ? 'active' : ''} ${selected.has(i) ? 'selected' : ''} ${selectMode ? 'select-mode' : ''}`}
            onClick={() => selectMode ? toggleSelect(i) : onSelectSong(i)}
          >
            {/* Checkbox — always visible in select mode */}
            {selectMode && (
              <div className={`song-check ${selected.has(i) ? 'checked' : ''}`}>
                {selected.has(i) && <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
              </div>
            )}

            <div className="song-thumb">
              <img src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`} alt="" />
              {i === currentIndex && (
                <div className="now-playing-overlay">
                  <div className="bars"><span /><span /><span /></div>
                </div>
              )}
            </div>

            <div className="song-info">
              <p className="song-name">{song.title}</p>
              {song.addedBy && <p className="song-id">by {song.addedBy}</p>}
            </div>

            {/* Remove button — always visible, not hidden */}
            {!selectMode && (
              <button
                className="remove-btn"
                onClick={(e) => { e.stopPropagation(); onRemoveSong(i) }}
                title="Remove"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
