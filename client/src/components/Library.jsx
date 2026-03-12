import { useState } from 'react'
import { useLibrary } from '../hooks/useLibrary'

const CATEGORY_COLORS = [
  '#7c6aff', '#ff6a8a', '#6affb8', '#ffb86a',
  '#6ab8ff', '#ff6aff', '#a8ff6a', '#ff9f6a'
]

const CATEGORY_EMOJIS = ['🎵', '😢', '🔥', '🌙', '💪', '❤️', '🎉', '😌', '⚡', '🌊']

async function fetchTitle(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
    const data = await res.json()
    return data.title
  } catch { return videoId }
}

function extractVideoId(url) {
  const patterns = [/(?:v=)([a-zA-Z0-9_-]{11})/, /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/]
  for (const p of patterns) { const m = url.match(p); if (m) return m[1] }
  return null
}

function extractPlaylistId(url) {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

// ─── Warning Modal ────────────────────────────────────────────
function PlaylistWarningModal({ total, onImportAll, onImportFirst, onCancel }) {
  return (
    <div className="warning-overlay">
      <div className="warning-modal">
        <div className="warning-icon">⚠️</div>
        <h2>Large Playlist Detected</h2>
        <p className="warning-desc">
          This playlist has <strong>{total} songs</strong> — importing all of them may take a while and fill up your queue quickly.
        </p>

        <div className="warning-suggestions">
          <p className="warning-suggestions-label">What would you like to do?</p>

          <button className="warning-option" onClick={() => onImportFirst(50)}>
            <span className="warning-option-icon">⚡</span>
            <div>
              <p className="warning-option-title">Import first 50 songs</p>
              <p className="warning-option-sub">Fast and manageable</p>
            </div>
          </button>

          <button className="warning-option" onClick={() => onImportFirst(100)}>
            <span className="warning-option-icon">🎵</span>
            <div>
              <p className="warning-option-title">Import first 100 songs</p>
              <p className="warning-option-sub">Good balance of variety</p>
            </div>
          </button>

          <button className="warning-option warning-option-all" onClick={onImportAll}>
            <span className="warning-option-icon">📥</span>
            <div>
              <p className="warning-option-title">Import all {total} songs</p>
              <p className="warning-option-sub">May take longer to load</p>
            </div>
          </button>
        </div>

        <button className="warning-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function Library({ isOpen, onClose, socket, roomId, username, onAddSongToQueue, currentVideoId }) {
  const { categories, loading, createCategory, deleteCategory, addSong, deleteSong } = useLibrary()
  const [activeCategory, setActiveCategory] = useState(null)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0])
  const [newCatEmoji, setNewCatEmoji] = useState('🎵')

  // Single song state
  const [songInput, setSongInput] = useState('')
  const [addingToCategory, setAddingToCategory] = useState(null)
  const [error, setError] = useState('')

  // Playlist import state
  const [playlistInput, setPlaylistInput] = useState('')
  const [importingPlaylist, setImportingPlaylist] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [addTab, setAddTab] = useState('song') // 'song' | 'playlist'

  // Warning modal state
  const [warningData, setWarningData] = useState(null) // { songs, total }

  const [pushSuccess, setPushSuccess] = useState('')

  if (!isOpen) return null

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    await createCategory(`${newCatEmoji} ${newCatName}`, newCatColor)
    setNewCatName('')
    setShowNewCategory(false)
  }

  const handleAddSong = async (categoryId) => {
    const videoId = extractVideoId(songInput.trim())
    if (!videoId) { setError('Invalid YouTube URL'); return }
    setError('')
    setAddingToCategory(categoryId)
    try {
      const title = await fetchTitle(videoId)
      await addSong(categoryId, videoId, title)
      setSongInput('')
    } catch (e) {
      setError(e.message)
    } finally {
      setAddingToCategory(null)
    }
  }

  // Fetch playlist from server
  const fetchPlaylist = async (playlistId) => {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/youtube/playlist?playlistId=${playlistId}`,
      { credentials: 'include' }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch playlist')
    return data
  }

  // Actually add songs to library category
  const doImportToLibrary = async (categoryId, songs) => {
    setWarningData(null)
    setImportProgress(`Adding ${songs.length} songs to library...`)
    let added = 0
    for (const song of songs) {
      try {
        await addSong(categoryId, song.videoId, song.title)
        added++
        if (added % 10 === 0) setImportProgress(`Added ${added}/${songs.length} songs...`)
      } catch (e) {
        // Skip duplicates silently
      }
    }
    setImportProgress(null)
    setPlaylistInput('')
    setAddTab('song')
    setPushSuccess(`✅ Imported ${added} songs!`)
    setTimeout(() => setPushSuccess(''), 3000)
  }

  const handleImportPlaylist = async (categoryId) => {
    const trimmed = playlistInput.trim()
    if (!trimmed) return
    const playlistId = extractPlaylistId(trimmed)
    if (!playlistId) { setError('Please paste a valid YouTube playlist URL'); return }

    setImportingPlaylist(true)
    setError('')
    setImportProgress('Fetching playlist info...')

    try {
      const data = await fetchPlaylist(playlistId)

      if (data.total > 200) {
        // Show warning modal with full songs list
        setImportProgress(null)
        setImportingPlaylist(false)
        setWarningData({ songs: data.songs, total: data.total, categoryId })
        return
      }

      // Under 200 — import directly
      await doImportToLibrary(categoryId, data.songs)
    } catch (e) {
      setError(e.message)
      setImportProgress(null)
    } finally {
      setImportingPlaylist(false)
    }
  }

  const handlePushToQueue = (category) => {
    if (!category.songs.length) return
    socket.emit('push-category', {
      roomId, songs: category.songs,
      categoryName: category.name, username
    })
    setPushSuccess(`${category.name} pushed to queue!`)
    setTimeout(() => setPushSuccess(''), 3000)
  }

  const activeCat = categories.find(c => c.id === activeCategory)

  return (
    <>
      <div className="library-overlay" onClick={onClose}>
        <div className="library-panel" onClick={e => e.stopPropagation()}>

          <div className="library-header">
            <span>📚 My Library</span>
            <button className="lib-close" onClick={onClose}>×</button>
          </div>

          {pushSuccess && <div className="push-success">{pushSuccess}</div>}

          {!activeCategory ? (
            // ── Category Grid ──
            <div className="library-body">
              {loading ? (
                <div className="lib-loading">Loading your library...</div>
              ) : (
                <>
                  <div className="category-grid">
                    {categories.map(cat => (
                      <div key={cat.id} className="category-card"
                        style={{ '--cat-color': cat.color }}
                        onClick={() => setActiveCategory(cat.id)}>
                        <div className="cat-card-top">
                          <span className="cat-name">{cat.name}</span>
                          <button className="cat-delete" onClick={e => {
                            e.stopPropagation(); deleteCategory(cat.id)
                          }}>×</button>
                        </div>
                        <p className="cat-count">{cat.songs.length} songs</p>
                        <button className="cat-push-btn" onClick={e => {
                          e.stopPropagation(); handlePushToQueue(cat)
                        }} disabled={!cat.songs.length}>
                          ▶ Push to Queue
                        </button>
                      </div>
                    ))}

                    <div className="category-card new-card" onClick={() => setShowNewCategory(true)}>
                      <span className="new-cat-plus">+</span>
                      <span className="new-cat-label">New Category</span>
                    </div>
                  </div>

                  {showNewCategory && (
                    <div className="new-cat-form">
                      <h3>Create Category</h3>
                      <div className="emoji-row">
                        {CATEGORY_EMOJIS.map(e => (
                          <button key={e}
                            className={`emoji-opt ${newCatEmoji === e ? 'selected' : ''}`}
                            onClick={() => setNewCatEmoji(e)}>{e}</button>
                        ))}
                      </div>
                      <input type="text" placeholder="Category name (e.g. Sad, Hype, Late Night)"
                        value={newCatName} onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreateCategory()} autoFocus />
                      <div className="color-row">
                        {CATEGORY_COLORS.map(c => (
                          <button key={c}
                            className={`color-opt ${newCatColor === c ? 'selected' : ''}`}
                            style={{ background: c }} onClick={() => setNewCatColor(c)} />
                        ))}
                      </div>
                      <div className="new-cat-actions">
                        <button className="btn-cancel" onClick={() => setShowNewCategory(false)}>Cancel</button>
                        <button className="btn-create" onClick={handleCreateCategory}>Create</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            // ── Category Detail ──
            <div className="library-body">
              <div className="cat-detail-header">
                <button className="back-btn" onClick={() => { setActiveCategory(null); setError(''); setAddTab('song') }}>← Back</button>
                <span className="cat-detail-name" style={{ color: activeCat?.color }}>{activeCat?.name}</span>
                <button className="cat-push-full-btn"
                  onClick={() => handlePushToQueue(activeCat)}
                  disabled={!activeCat?.songs.length}>
                  ▶ Push All
                </button>
              </div>

              {/* Add tabs */}
              <div className="queue-tabs">
                <button className={`queue-tab ${addTab === 'song' ? 'active' : ''}`}
                  onClick={() => { setAddTab('song'); setError('') }}>Add Song</button>
                <button className={`queue-tab ${addTab === 'playlist' ? 'active' : ''}`}
                  onClick={() => { setAddTab('playlist'); setError('') }}>🎵 Import Playlist</button>
              </div>

              {/* Single song */}
              {addTab === 'song' && (
                <div className="cat-add-song">
                  <input type="text" placeholder="Paste YouTube URL..."
                    value={songInput} onChange={e => setSongInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddSong(activeCategory)} />
                  <button className="add-btn"
                    onClick={() => handleAddSong(activeCategory)}
                    disabled={addingToCategory === activeCategory}>
                    {addingToCategory === activeCategory
                      ? <span className="loading-spinner" /> : '+'}
                  </button>
                  {error && <p className="error">{error}</p>}
                </div>
              )}

              {/* Playlist import */}
              {addTab === 'playlist' && (
                <div className="playlist-import">
                  <p className="playlist-hint">Import all songs from a YouTube playlist into this category</p>
                  <div className="cat-add-song">
                    <input type="text" placeholder="https://youtube.com/playlist?list=..."
                      value={playlistInput} onChange={e => setPlaylistInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleImportPlaylist(activeCategory)}
                      disabled={importingPlaylist} />
                    <button className="add-btn"
                      onClick={() => handleImportPlaylist(activeCategory)}
                      disabled={importingPlaylist}>
                      {importingPlaylist ? <span className="loading-spinner" /> : '+'}
                    </button>
                  </div>
                  {importProgress && (
                    <div className="import-progress">
                      <span className="loading-spinner" />
                      {importProgress}
                    </div>
                  )}
                  {error && <p className="error">{error}</p>}
                  <p className="playlist-note">⚠️ Only public playlists are supported</p>
                </div>
              )}

              {/* Song list */}
              <ul className="lib-song-list">
                {activeCat?.songs.length === 0 && (
                  <li className="lib-empty">No songs yet. Add a YouTube URL above!</li>
                )}
                {activeCat?.songs.map((song, i) => (
                  <li key={song.videoId} className="lib-song-item">
                    <span className="lib-num">{i + 1}</span>
                    <img src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`} alt="" />
                    <div className="lib-song-info">
                      <p className="lib-song-title">{song.title}</p>
                      <p className="lib-song-id">youtu.be/{song.videoId}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        className={`lib-play-btn ${currentVideoId === song.videoId ? 'playing' : ''}`}
                        onClick={() => onAddSongToQueue?.({ videoId: song.videoId, title: song.title })}
                        title="Add to queue"
                      >
                        {currentVideoId === song.videoId ? '▶ Playing' : '+ Queue'}
                      </button>
                      <button className="lib-remove-btn"
                        onClick={() => deleteSong(activeCategory, song.videoId)}>×</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Warning Modal */}
      {warningData && (
        <PlaylistWarningModal
          total={warningData.total}
          onImportAll={() => doImportToLibrary(warningData.categoryId, warningData.songs)}
          onImportFirst={(n) => doImportToLibrary(warningData.categoryId, warningData.songs.slice(0, n))}
          onCancel={() => { setWarningData(null); setPlaylistInput('') }}
        />
      )}
    </>
  )
}
