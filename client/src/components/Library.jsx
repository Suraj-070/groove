import { useState, useEffect, useRef } from 'react'
import { useLibrary } from '../hooks/useLibrary'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

const CRATE_COLORS = [
  { bg: 'linear-gradient(135deg,#7c6aff,#ff6a8a)', accent: '#7c6aff', name: 'Violet' },
  { bg: 'linear-gradient(135deg,#ff6a8a,#ffb86a)', accent: '#ff6a8a', name: 'Coral' },
  { bg: 'linear-gradient(135deg,#6affb8,#6ab8ff)', accent: '#6affb8', name: 'Mint' },
  { bg: 'linear-gradient(135deg,#ffb86a,#ffff6a)', accent: '#ffb86a', name: 'Gold' },
  { bg: 'linear-gradient(135deg,#6ab8ff,#7c6aff)', accent: '#6ab8ff', name: 'Sky' },
  { bg: 'linear-gradient(135deg,#ff6aff,#7c6aff)', accent: '#ff6aff', name: 'Pink' },
  { bg: 'linear-gradient(135deg,#6affb8,#ffb86a)', accent: '#6affb8', name: 'Lime' },
  { bg: 'linear-gradient(135deg,#ff4444,#ff6a8a)', accent: '#ff4444', name: 'Red' },
]

const MOODS = ['🔥','😢','🌙','💪','❤️','🎉','😌','⚡','🌊','🤩','💀','🎸','🌈','🍕','👑']

function extractVideoId(url) {
  if (!url) return null
  const trimmed = url.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed
  const patterns = [/[?&]v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /shorts\/([a-zA-Z0-9_-]{11})/]
  for (const p of patterns) { const m = trimmed.match(p); if (m) return m[1] }
  return null
}

function extractPlaylistId(url) {
  if (!url) return null
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/)
  if (!match) return null
  const id = match[1]
  // Only real playlists start with PL, RD, UU, FL, OL, LL, WL
  if (/^(PL|RD|UU|FL|OL|LL|WL)/i.test(id)) return id
  return null
}

function isVideoUrl(url) {
  return !!(url && extractVideoId(url))
}

async function fetchTitle(videoId) {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { signal: controller.signal })
    if (!res.ok) throw new Error()
    const data = await res.json()
    return data.title || `Song (${videoId})`
  } catch { return `Song (${videoId})` }
}

// ── Crate Card ────────────────────────────────────────────────
function CrateCard({ crate, colorDef, onClick, onPlay, onShuffle, onDelete, isActive }) {
  const songs = crate.songs || []
  const thumbs = songs.slice(0, 3).map(s => `https://img.youtube.com/vi/${s.videoId}/default.jpg`)

  return (
    <div
      className={`crate-card ${isActive ? 'crate-active' : ''}`}
      style={{ '--crate-bg': colorDef?.bg || CRATE_COLORS[0].bg, '--crate-accent': colorDef?.accent || '#7c6aff' }}
      onClick={onClick}
    >
      {/* Glow bg */}
      <div className="crate-glow" />

      {/* Delete */}
      <button className="crate-delete-btn" onClick={e => { e.stopPropagation(); onDelete() }} title="Delete crate">×</button>

      {/* Thumbnail stack */}
      <div className="crate-thumbs">
        {thumbs.length === 0 && <div className="crate-empty-thumb">🎵</div>}
        {thumbs.map((src, i) => (
          <img key={i} src={src} alt="" className="crate-thumb-img" style={{ zIndex: thumbs.length - i, transform: `rotate(${(i - 1) * 4}deg) translateX(${(i - 1) * 8}px)` }} />
        ))}
      </div>

      {/* Info */}
      <div className="crate-info">
        <p className="crate-name">{crate.name}</p>
        <p className="crate-count">{songs.length} songs</p>
      </div>

      {/* Actions */}
      <div className="crate-actions">
        <button className="crate-action-btn play" onClick={e => { e.stopPropagation(); onPlay() }} disabled={!songs.length}>
          ▶ Play All
        </button>
        <button className="crate-action-btn shuffle" onClick={e => { e.stopPropagation(); onShuffle() }} disabled={!songs.length}>
          🔀
        </button>
      </div>

      {isActive && <div className="crate-now-playing-badge">▶ Playing</div>}
    </div>
  )
}

// ── New Crate Form ────────────────────────────────────────────
function NewCrateForm({ onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [mood, setMood] = useState('🔥')
  const [colorIdx, setColorIdx] = useState(0)

  const handleCreate = () => {
    if (!name.trim()) return
    onCreate(`${mood} ${name.trim()}`, CRATE_COLORS[colorIdx].accent, colorIdx)
    onCancel()
  }

  return (
    <div className="new-crate-overlay" onClick={onCancel}>
      <div className="new-crate-modal" onClick={e => e.stopPropagation()}>
        <h2 className="ncm-title">New Collection</h2>

        <div className="ncm-mood-row">
          {MOODS.map(m => (
            <button key={m} className={`ncm-mood ${mood === m ? 'active' : ''}`} onClick={() => setMood(m)}>{m}</button>
          ))}
        </div>

        <input
          className="ncm-input"
          placeholder="Crate name (e.g. Late Night Drives)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          autoFocus
        />

        <div className="ncm-color-row">
          {CRATE_COLORS.map((c, i) => (
            <button
              key={i}
              className={`ncm-color-dot ${colorIdx === i ? 'active' : ''}`}
              style={{ background: c.bg }}
              onClick={() => setColorIdx(i)}
            />
          ))}
        </div>

        <div className="ncm-actions">
          <button className="ncm-cancel" onClick={onCancel}>Cancel</button>
          <button className="ncm-create" onClick={handleCreate} disabled={!name.trim()}>
            Create Crate
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Crate Detail View ─────────────────────────────────────────
function CrateDetail({ crate, colorDef, onBack, onAddSong, onDeleteSong, onPlaySong, onPushToQueue, onShuffle, currentVideoId, socket, roomId, username }) {
  const [search, setSearch] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [addMode, setAddMode] = useState('url') // 'url' | 'playlist'
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const filtered = (crate.songs || []).filter(s => s.title.toLowerCase().includes(search.toLowerCase()))

  const handleAddSong = async () => {
    const videoId = extractVideoId(urlInput)
    if (!videoId) { setError('Invalid YouTube URL'); return }
    setLoading(true); setError('')
    try {
      const title = await fetchTitle(videoId)
      await onAddSong(crate.id, videoId, title)
      setUrlInput('')
      showToast('Song added!')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleImportPlaylist = async () => {
    const playlistId = extractPlaylistId(urlInput)
    if (!playlistId) {
      if (isVideoUrl(urlInput)) setError('That\'s a video URL — use the Single Song tab instead')
      else setError('Invalid playlist URL. Paste a YouTube playlist link (youtube.com/playlist?list=...)')
      return
    }
    setImporting(true); setError('')
    setImportProgress('Fetching playlist...')
    try {
      const res = await fetch(`${BACKEND}/youtube/playlist?playlistId=${playlistId}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportProgress(`Adding ${data.total} songs...`)
      let added = 0
      for (const song of data.songs) {
        try { await onAddSong(crate.id, song.videoId, song.title); added++ } catch {}
        if (added % 10 === 0) setImportProgress(`Added ${added}/${data.total}...`)
      }
      setUrlInput(''); setImportProgress('')
      showToast(`✅ Imported ${added} songs!`)
    } catch (e) { setError(e.message || 'Import failed'); setImportProgress('') }
    finally { setImporting(false) }
  }

  return (
    <div className="crate-detail" style={{ '--crate-accent': colorDef?.accent || '#7c6aff', '--crate-bg': colorDef?.bg }}>
      {/* Header */}
      <div className="cd-header">
        <button className="cd-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          Back
        </button>
        <div className="cd-title-wrap">
          <h2 className="cd-title">{crate.name}</h2>
          <span className="cd-subtitle">{(crate.songs || []).length} songs</span>
        </div>
        <div className="cd-header-actions">
          <button className="cd-action-btn shuffle" onClick={onShuffle} disabled={!(crate.songs || []).length}>🔀 Shuffle</button>
          <button className="cd-action-btn play" onClick={() => onPushToQueue(crate)} disabled={!(crate.songs || []).length}>▶ Play All</button>
        </div>
      </div>

      {/* Ambient header bg */}
      <div className="cd-ambient" style={{ background: colorDef?.bg }} />

      <div className="cd-body">
        {/* Left — Song list */}
        <div className="cd-left">
          {/* Search */}
          <div className="cd-search-wrap">
            <svg className="cd-search-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input className="cd-search" placeholder="Search songs..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="cd-search-clear" onClick={() => setSearch('')}>×</button>}
          </div>

          {/* Song list */}
          <ul className="cd-song-list">
            {filtered.length === 0 && (
              <li className="cd-empty">
                {search ? `No results for "${search}"` : 'No songs yet — add some below!'}
              </li>
            )}
            {filtered.map((song, i) => (
              <li
                key={song.videoId}
                className={`cd-song-item ${currentVideoId === song.videoId ? 'cd-now-playing' : ''}`}
              >
                <span className="cd-song-num">{i + 1}</span>
                <div className="cd-song-thumb">
                  <img src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`} alt="" />
                  {currentVideoId === song.videoId && (
                    <div className="cd-playing-overlay">
                      <div className="bars"><span /><span /><span /></div>
                    </div>
                  )}
                </div>
                <div className="cd-song-info">
                  <p className="cd-song-title">{song.title}</p>
                </div>
                <div className="cd-song-actions">
                  <button className="cd-queue-btn" onClick={() => onPlaySong(song)} title="Add to queue">
                    + Queue
                  </button>
                  <button className="cd-remove-btn" onClick={() => onDeleteSong(crate.id, song.videoId)} title="Remove">×</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Right — Add songs */}
        <div className="cd-right">
          <div className="cd-add-panel">
            <h3 className="cd-add-title">Add Songs</h3>

            <div className="cd-add-tabs">
              <button className={`cd-add-tab ${addMode === 'url' ? 'active' : ''}`} onClick={() => setAddMode('url')}>Single Song</button>
              <button className={`cd-add-tab ${addMode === 'playlist' ? 'active' : ''}`} onClick={() => setAddMode('playlist')}>Playlist</button>
            </div>

            <input
              className="cd-url-input"
              placeholder={addMode === 'url' ? 'Paste YouTube URL...' : 'Paste playlist URL...'}
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setError('') }}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                if (addMode === 'url') handleAddSong()
                else handleImportPlaylist()
              }}
            />
            {urlInput && addMode === 'playlist' && isVideoUrl(urlInput) && (
              <p className="cd-url-hint cd-url-hint--warn">
                ⚠️ That looks like a video — use <strong>Single Song</strong> tab
              </p>
            )}
            {urlInput && addMode === 'playlist' && extractPlaylistId(urlInput) && (
              <p className="cd-url-hint cd-url-hint--ok">✓ Playlist detected</p>
            )}
            {urlInput && addMode === 'url' && extractVideoId(urlInput) && (
              <p className="cd-url-hint cd-url-hint--ok">✓ Valid video</p>
            )}

            {error && <p className="cd-error">{error}</p>}
            {importProgress && <p className="cd-progress">{importProgress}</p>}

            <button
              className="cd-add-btn"
              onClick={addMode === 'url' ? handleAddSong : handleImportPlaylist}
              disabled={loading || importing || !urlInput.trim()}
            >
              {loading || importing
                ? <span className="loading-spinner" />
                : addMode === 'url' ? 'Add Song' : 'Import Playlist'
              }
            </button>

            {/* Stats */}
            <div className="cd-stats">
              <div className="cd-stat">
                <span className="cd-stat-val">{(crate.songs || []).length}</span>
                <span className="cd-stat-label">Songs</span>
              </div>
              <div className="cd-stat">
                <span className="cd-stat-val">~{Math.round((crate.songs || []).length * 3.5)}m</span>
                <span className="cd-stat-label">Est. Time</span>
              </div>
            </div>

            {/* Toast */}
            {toast && <div className="cd-toast">{toast}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Library Component ────────────────────────────────────
export default function Library({ isOpen, onClose, socket, roomId, username, onAddSongToQueue, currentVideoId }) {
  const { categories, loading, authError, createCategory, deleteCategory, addSong, deleteSong, refetch } = useLibrary()
  const [activeCrateId, setActiveCrateId] = useState(null)
  const [showNewCrate, setShowNewCrate] = useState(false)
  const [toast, setToast] = useState('')
  const [colorMap, setColorMap] = useState({}) // crateId -> colorIdx

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    if (isOpen) refetch()
  }, [isOpen])

  if (!isOpen) return null

  const activeCrate = categories.find(c => c.id === activeCrateId)
  const getCrateColorIdx = (id, fallbackIdx = 0) => {
    if (!id) return fallbackIdx
    if (colorMap[id] !== undefined) return colorMap[id]
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xff
    return hash % CRATE_COLORS.length
  }
  const activeCrateColorIdx = activeCrateId ? getCrateColorIdx(activeCrateId) : 0
  const activeCrateColor = CRATE_COLORS[activeCrateColorIdx] || CRATE_COLORS[0]

  const handleCreateCrate = async (name, color, colorIdx) => {
    const cat = await createCategory(name, color)
    setColorMap(prev => ({ ...prev, [cat.id]: colorIdx }))
    setActiveCrateId(cat.id)
  }

  const handleDeleteCrate = async (id) => {
    await deleteCategory(id)
    if (activeCrateId === id) setActiveCrateId(null)
  }

  const handlePushToQueue = (crate, shuffled = false) => {
    const songs = shuffled ? [...(crate.songs || [])].sort(() => Math.random() - 0.5) : (crate.songs || [])
    socket.emit('push-category', { roomId, songs, categoryName: crate.name, username })
    showToast(`${shuffled ? '🔀 Shuffled' : '▶ Playing'} ${crate.name}`)
  }

  const handlePlaySong = (song) => {
    onAddSongToQueue?.({ videoId: song.videoId, title: song.title })
    showToast(`+ ${song.title.slice(0, 30)}...`)
  }

  // Find which crate is currently playing
  const playingCrateId = currentVideoId
    ? categories.find(c => (c.songs || []).some(s => s.videoId === currentVideoId))?.id
    : null

  return (
    <div className="library-fullscreen">
      {/* Ambient background */}
      <div className="lib-ambient-bg" />

      {/* Global toast */}
      {toast && <div className="lib-toast">{toast}</div>}

      {/* New Crate Modal */}
      {showNewCrate && (
        <NewCrateForm
          onCreate={handleCreateCrate}
          onCancel={() => setShowNewCrate(false)}
        />
      )}

      {activeCrate ? (
        // ── Crate Detail ──────────────────────────────────────
        <CrateDetail
          crate={activeCrate}
          colorDef={activeCrateColor}
          onBack={() => setActiveCrateId(null)}
          onAddSong={addSong}
          onDeleteSong={deleteSong}
          onPlaySong={handlePlaySong}
          onPushToQueue={handlePushToQueue}
          onShuffle={() => handlePushToQueue(activeCrate, true)}
          currentVideoId={currentVideoId}
          socket={socket}
          roomId={roomId}
          username={username}
        />
      ) : (
        // ── Crate Grid ────────────────────────────────────────
        <div className="lib-crate-view">
          {/* Subheader */}
          <div className="lib-subheader">
            <button className="lib-back-room" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
              Back to Room
            </button>
            <div className="lib-header-center">
              <h1 className="lib-title">My Library</h1>
              <p className="lib-subtitle">{categories.length} collections · {categories.reduce((acc, c) => acc + (c.songs || []).length, 0)} songs</p>
            </div>
            <button className="lib-new-btn" onClick={() => setShowNewCrate(true)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              New Collection
            </button>
          </div>

          {/* Crate grid */}
          {loading ? (
            <div className="lib-loading">
              <div className="lib-loading-spinner" />
              <p>Loading your crates...</p>
            </div>
          ) : authError ? (
            <div className="lib-empty-state">
              <div className="lib-empty-icon">🔒</div>
              <h2>Sign in to use Library</h2>
              <p>Your library is saved to your account. Sign in with Discord or Google to access it.</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="lib-empty-state">
              <div className="lib-empty-icon">📦</div>
              <h2>No collections yet</h2>
              <p>Create your first collection to start organizing your music</p>
              <button className="lib-new-btn" onClick={() => setShowNewCrate(true)}>Create your first collection</button>
            </div>
          ) : (
            <div className="lib-crate-grid">
              {categories.map((crate, i) => (
                <CrateCard
                  key={crate.id}
                  crate={crate}
                  colorDef={CRATE_COLORS[getCrateColorIdx(crate.id, i)]}
                  isActive={crate.id === playingCrateId}
                  onClick={() => {
                    setActiveCrateId(crate.id)
                    setColorMap(prev => ({ ...prev, [crate.id]: prev[crate.id] ?? getCrateColorIdx(crate.id, i) }))
                  }}
                  onPlay={() => handlePushToQueue(crate)}
                  onShuffle={() => handlePushToQueue(crate, true)}
                  onDelete={() => handleDeleteCrate(crate.id)}
                />
              ))}

              {/* Add new crate card */}
              <div className="crate-card crate-new-card" onClick={() => setShowNewCrate(true)}>
                <div className="crate-new-icon">+</div>
                <p className="crate-new-label">New Collection</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
