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

export default function Queue({ queue, currentIndex, onAddSong, onSelectSong, onRemoveSong, socket, roomId, username }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [tab, setTab] = useState('song')
  const [playlistInput, setPlaylistInput] = useState('')
  const [addedFlash, setAddedFlash] = useState(false)
  const [selected, setSelected] = useState(new Set()) // multi-select
  const [lastImported, setLastImported] = useState(null) // { songs, count } for save-to-library
  const [savingLibrary, setSavingLibrary] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const inputRef = useRef(null)

  const handleAddSong = async () => {
    const trimmed = input.trim()
    if (!trimmed) { setError('Paste a YouTube URL first'); return }
    const videoId = extractVideoId(trimmed)
    if (!videoId) { setError('Invalid YouTube URL'); return }

    // Duplicate check — allow but warn
    const dupeCount = queue.filter(s => s.videoId === videoId).length
    if (dupeCount > 0 && dupeCount < 3) {
      // Allow up to 3 of same song (DJ use case) but warn
      setError(`⚠️ This song is already in queue (${dupeCount}x) — added again`)
    } else if (dupeCount >= 3) {
      setError('This song is already in queue 3 times — not adding more')
      return
    } else {
      setError('')
    }

    setLoading(true)
    const title = await fetchTitle(videoId)
    onAddSong({ videoId, title })
    setInput('')
    setLoading(false)
    setAddedFlash(true)
    setTimeout(() => { setAddedFlash(false); setError('') }, 2000)
    inputRef.current?.focus()
  }

  const handleImportPlaylist = async () => {
    const trimmed = playlistInput.trim()
    if (!trimmed) return
    const playlistId = extractPlaylistId(trimmed)
    if (!playlistId) { setError('Please paste a valid YouTube playlist URL'); return }

    setImporting(true)
    setError('')
    setImportProgress('Fetching playlist...')
    setLastImported(null)

    try {
      const res = await fetch(`${BACKEND}/youtube/playlist?playlistId=${playlistId}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to fetch playlist'); return }

      setImportProgress(`Adding ${data.total} songs...`)
      for (const song of data.songs) {
        onAddSong({ videoId: song.videoId, title: song.title })
      }

      setLastImported({ songs: data.songs, count: data.total })
      setPlaylistInput('')
      setImportProgress(null)
      setTab('song')
    } catch {
      setError('Failed to import playlist')
      setImportProgress(null)
    } finally {
      setImporting(false)
    }
  }

  // ── Multi-select ──────────────────────────────────────────
  const toggleSelect = useCallback((i, e) => {
    e.stopPropagation()
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
    // Remove in reverse order so indices don't shift
    const indices = [...selected].sort((a, b) => b - a)
    indices.forEach(i => onRemoveSong(i))
    setSelected(new Set())
  }

  // ── Save imported songs to library ───────────────────────
  const handleSaveToLibrary = async () => {
    if (!lastImported) return
    setSavingLibrary(true)
    try {
      // Create a new category
      const catRes = await fetch(`${BACKEND}/library/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: `Playlist Import (${lastImported.count} songs)`, color: '#7c6aff' })
      })
      if (!catRes.ok) throw new Error()
      const category = await catRes.json()

      // Add all songs
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

  return (
    <div className="queue">
      <div className="queue-header">
        <h2>Queue</h2>
        <span className="queue-count">{queue.length} songs</span>
      </div>

      {/* Tabs */}
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

      {/* Add single song */}
      {tab === 'song' && (
        <div className="add-song">
          <input
            ref={inputRef}
            type="text"
            placeholder="Paste YouTube URL..."
            value={input}
            onChange={(e) => { setInput(e.target.value); if (!e.target.value) setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleAddSong()}
          />
          <button className={`add-btn ${addedFlash ? 'flash' : ''}`} onClick={handleAddSong} disabled={loading}>
            {loading ? <span className="loading-spinner" /> : addedFlash
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            }
          </button>
          {error && <p className={`error ${error.startsWith('⚠️') ? 'warn' : ''}`}>{error}</p>}
        </div>
      )}

      {/* Import playlist */}
      {tab === 'playlist' && (
        <div className="playlist-import">
          <p className="playlist-hint">Paste a YouTube playlist URL to add all songs at once</p>
          <div className="add-song">
            <input
              type="text"
              placeholder="https://youtube.com/playlist?list=..."
              value={playlistInput}
              onChange={(e) => { setPlaylistInput(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && !importing && handleImportPlaylist()}
              disabled={importing}
            />
            <button className="add-btn" onClick={handleImportPlaylist} disabled={importing}>
              {importing
                ? <span className="loading-spinner" />
                : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
              }
            </button>
          </div>
          {importProgress && <div className="import-progress"><span className="loading-spinner" />{importProgress}</div>}
          {error && <p className="error">{error}</p>}
          <p className="playlist-note">⚠️ Large playlists may take a moment</p>
        </div>
      )}

      {/* Save to library banner after import */}
      {lastImported && (
        <div className="save-library-banner">
          <span>✅ {lastImported.count} songs added!</span>
          <button className="save-library-btn" onClick={handleSaveToLibrary} disabled={savingLibrary}>
            {savingLibrary ? <span className="loading-spinner" /> : '📚 Save to Library'}
          </button>
        </div>
      )}
      {saveSuccess && (
        <div className="save-library-banner success">
          ✅ Saved to your library!
        </div>
      )}

      {/* Multi-select toolbar */}
      {queue.length > 0 && (
        <div className="queue-toolbar">
          <button className="toolbar-btn" onClick={selectAll} title="Select all">
            {selected.size === queue.length ? '☑ Deselect All' : '☐ Select All'}
          </button>
          {selected.size > 0 && (
            <button className="toolbar-btn danger" onClick={removeSelected}>
              🗑 Remove {selected.size} selected
            </button>
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
            className={`song-item ${i === currentIndex ? 'active' : ''} ${selected.has(i) ? 'selected' : ''}`}
            onClick={() => selected.size > 0 ? toggleSelect(i, { stopPropagation: () => {} }) : onSelectSong(i)}
          >
            {/* Checkbox */}
            <div
              className={`song-check ${selected.has(i) ? 'checked' : ''}`}
              onClick={(e) => toggleSelect(i, e)}
            >
              {selected.has(i) ? '✓' : ''}
            </div>

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
            <button
              className="remove-btn"
              onClick={(e) => { e.stopPropagation(); onRemoveSong(i) }}
              title="Remove"
            >×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
