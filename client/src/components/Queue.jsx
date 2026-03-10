import { useState } from 'react'

async function fetchTitle(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    )
    const data = await res.json()
    return data.title
  } catch { return `Song (${videoId})` }
}

function extractVideoId(url) {
  const patterns = [
    /(?:v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:embed\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) { const m = url.match(p); if (m) return m[1] }
  return null
}

function extractPlaylistId(url) {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

export default function Queue({ queue, currentIndex, onAddSong, onSelectSong, onRemoveSong }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [tab, setTab] = useState('song') // 'song' | 'playlist'
  const [playlistInput, setPlaylistInput] = useState('')

  const handleAddSong = async () => {
    const trimmed = input.trim()
    if (!trimmed) return
    const videoId = extractVideoId(trimmed)
    if (!videoId) { setError('Please paste a valid YouTube URL'); return }
    setLoading(true)
    setError('')
    const title = await fetchTitle(videoId)
    onAddSong({ videoId, title })
    setInput('')
    setLoading(false)
  }

  const handleImportPlaylist = async () => {
    const trimmed = playlistInput.trim()
    if (!trimmed) return

    const playlistId = extractPlaylistId(trimmed)
    if (!playlistId) {
      setError('Please paste a valid YouTube playlist URL')
      return
    }

    setImporting(true)
    setError('')
    setImportProgress('Fetching playlist...')

    try {
      const res = await fetch(
        `http://localhost:3001/youtube/playlist?playlistId=${playlistId}`,
        { credentials: 'include' }
      )
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to fetch playlist')
        return
      }

      setImportProgress(`Adding ${data.total} songs...`)

      // Add all songs to queue
      for (const song of data.songs) {
        onAddSong({ videoId: song.videoId, title: song.title })
      }

      setPlaylistInput('')
      setImportProgress(null)
      setTab('song')
    } catch (e) {
      setError('Failed to import playlist')
      setImportProgress(null)
    } finally {
      setImporting(false)
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
        <button
          className={`queue-tab ${tab === 'song' ? 'active' : ''}`}
          onClick={() => { setTab('song'); setError('') }}
        >
          Add Song
        </button>
        <button
          className={`queue-tab ${tab === 'playlist' ? 'active' : ''}`}
          onClick={() => { setTab('playlist'); setError('') }}
        >
          🎵 Import Playlist
        </button>
      </div>

      {/* Add single song */}
      {tab === 'song' && (
        <div className="add-song">
          <input
            type="text"
            placeholder="Paste YouTube URL..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSong()}
          />
          <button className="add-btn" onClick={handleAddSong} disabled={loading}>
            {loading ? <span className="loading-spinner" /> : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* Import playlist */}
      {tab === 'playlist' && (
        <div className="playlist-import">
          <p className="playlist-hint">
            Paste a YouTube playlist URL to add all songs at once
          </p>
          <div className="add-song">
            <input
              type="text"
              placeholder="https://youtube.com/playlist?list=..."
              value={playlistInput}
              onChange={(e) => setPlaylistInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImportPlaylist()}
              disabled={importing}
            />
            <button className="add-btn" onClick={handleImportPlaylist} disabled={importing}>
              {importing ? <span className="loading-spinner" /> : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>
          {importProgress && (
            <div className="import-progress">
              <span className="loading-spinner" />
              {importProgress}
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <p className="playlist-note">⚠️ Large playlists may take a moment</p>
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
            key={i}
            className={`song-item ${i === currentIndex ? 'active' : ''}`}
            onClick={() => onSelectSong(i)}
          >
            <div className="song-thumb">
              <img
                src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`}
                alt=""
              />
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
            >×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
