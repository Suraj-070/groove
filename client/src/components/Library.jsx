import { useState, useEffect, useRef, useMemo } from 'react'
import { useCategories, getCategoryDef } from '../hooks/useCategories'
import { useLibrary } from '../hooks/useLibrary'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

async function createShareLink(songs) {
  const res = await fetch(`${BACKEND}/share/songs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ songs })
  })
  if (!res.ok) throw new Error('Failed')
  return res.json()
}

const CRATE_GRADIENTS = [
  { from: '#7c6aff', to: '#ff6a8a' },
  { from: '#ff6a8a', to: '#ffb86a' },
  { from: '#00c974', to: '#6ab8ff' },
  { from: '#ffb86a', to: '#ffe06a' },
  { from: '#6ab8ff', to: '#7c6aff' },
  { from: '#ff6aff', to: '#7c6aff' },
  { from: '#00c974', to: '#ffb86a' },
  { from: '#ff4444', to: '#ff6a8a' },
]

const MOODS = ['🔥','😢','🌙','💪','❤️','🎉','😌','⚡','🌊','🤩','💀','🎸','🌈','🍕','👑']

function extractVideoId(url) {
  if (!url) return null
  const t = url.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t
  for (const p of [/[?&]v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /shorts\/([a-zA-Z0-9_-]{11})/]) {
    const m = t.match(p); if (m) return m[1]
  }
  return null
}

function extractPlaylistId(url) {
  if (!url) return null
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/)
  if (!match) return null
  const id = match[1]
  return /^(PL|RD|UU|FL|OL|LL|WL)/i.test(id) ? id : null
}

async function fetchTitle(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
    if (!res.ok) throw new Error()
    return (await res.json()).title || `Song (${videoId})`
  } catch { return `Song (${videoId})` }
}

function getGradient(idx) {
  const g = CRATE_GRADIENTS[idx % CRATE_GRADIENTS.length]
  return `linear-gradient(135deg, ${g.from}, ${g.to})`
}
function getAccent(idx) { return CRATE_GRADIENTS[idx % CRATE_GRADIENTS.length].from }

function getColorIdx(id) {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xff
  return h % CRATE_GRADIENTS.length
}

// ── Crate Card ────────────────────────────────────────────────
function CrateCard({ crate, colorIdx, onClick, onPlay, onShuffle, onDelete, isPlaying }) {
  const songs = crate.songs || []
  const topThree = songs.slice(0, 3)
  const accent = getAccent(colorIdx)
  const gradient = getGradient(colorIdx)

  return (
    <div className={`lc-card ${isPlaying ? 'lc-card--active' : ''}`}
      style={{ '--lc-accent': accent, '--lc-gradient': gradient }}
      onClick={onClick}
    >
      {/* Gradient header */}
      <div className="lc-card-header">
        {topThree.length > 0 ? (
          <div className="lc-thumbs">
            {topThree.map((s, i) => (
              <img key={s.videoId} src={`https://img.youtube.com/vi/${s.videoId}/hqdefault.jpg`}
                alt="" className={`lc-thumb lc-thumb--${i}`} loading="lazy" />
            ))}
            <div className="lc-thumb-overlay" />
          </div>
        ) : (
          <div className="lc-thumb-empty">🎵</div>
        )}
        {isPlaying && (
          <div className="lc-playing-badge">
            <div className="bars"><span /><span /><span /></div> Playing
          </div>
        )}
        <button className="lc-delete" onClick={e => { e.stopPropagation(); onDelete() }} title="Delete">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      {/* Info */}
      <div className="lc-card-body">
        <p className="lc-card-name">{crate.name}</p>
        <p className="lc-card-count">{songs.length} {songs.length === 1 ? 'song' : 'songs'}</p>
      </div>

      {/* Actions */}
      <div className="lc-card-actions" onClick={e => e.stopPropagation()}>
        <button className="lc-btn-play" onClick={onPlay} disabled={!songs.length}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
          Play all
        </button>
        <button className="lc-btn-shuffle" onClick={onShuffle} disabled={!songs.length} title="Shuffle">
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
        </button>
      </div>
    </div>
  )
}

// ── New Crate Modal ───────────────────────────────────────────
function NewCrateModal({ onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [mood, setMood] = useState('🔥')
  const [colorIdx, setColorIdx] = useState(0)

  return (
    <div className="lc-modal-overlay" onClick={onCancel}>
      <div className="lc-modal" onClick={e => e.stopPropagation()}>
        <div className="lc-modal-header">
          <p className="lc-modal-title">New Collection</p>
          <button className="lc-modal-close" onClick={onCancel}>✕</button>
        </div>

        <div className="lc-modal-body">
          <p className="lc-modal-label">Pick a vibe</p>
          <div className="lc-mood-grid">
            {MOODS.map(m => (
              <button key={m} className={`lc-mood-btn ${mood === m ? 'active' : ''}`} onClick={() => setMood(m)}>{m}</button>
            ))}
          </div>

          <p className="lc-modal-label">Name</p>
          <input className="lc-modal-input" placeholder="e.g. Late Night Drives"
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && name.trim() && onCreate(`${mood} ${name.trim()}`, colorIdx)}
            autoFocus />

          <p className="lc-modal-label">Color</p>
          <div className="lc-color-row">
            {CRATE_GRADIENTS.map((g, i) => (
              <button key={i} className={`lc-color-dot ${colorIdx === i ? 'active' : ''}`}
                style={{ background: `linear-gradient(135deg,${g.from},${g.to})` }}
                onClick={() => setColorIdx(i)} />
            ))}
          </div>
        </div>

        <div className="lc-modal-footer">
          <button className="lc-modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="lc-modal-create" onClick={() => name.trim() && onCreate(`${mood} ${name.trim()}`, colorIdx)} disabled={!name.trim()}>
            Create Collection
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Crate Detail ──────────────────────────────────────────────
function CrateDetail({ crate, colorIdx, onBack, onAddSong, onAddSongsBatch, onDeleteSong, onPlaySong, onPushToQueue, onShuffle, currentVideoId }) {
  const [search, setSearch] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [addMode, setAddMode] = useState('url')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [sharing, setSharing] = useState(false)
  const PAGE_SIZE = 50

  const accent = getAccent(colorIdx)
  const gradient = getGradient(colorIdx)
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const { categories } = useCategories(crate.songs || [])

  const filtered = useMemo(() =>
    (crate.songs || []).filter(s => s.title.toLowerCase().includes(search.toLowerCase())),
    [crate.songs, search]
  )
  const visible = filtered.slice(0, page * PAGE_SIZE)

  const handleAddSong = async () => {
    const videoId = extractVideoId(urlInput)
    if (!videoId) { setError('Invalid YouTube URL'); return }
    setLoading(true); setError('')
    try {
      const title = await fetchTitle(videoId)
      await onAddSong(crate.id, videoId, title)
      setUrlInput(''); showToast('✓ Song added!')
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const handleImport = async () => {
    const playlistId = extractPlaylistId(urlInput)
    if (!playlistId) { setError('Invalid playlist URL'); return }
    setImporting(true); setError('')
    setImportProgress('Fetching playlist...')
    try {
      const res = await fetch(`${BACKEND}/youtube/playlist?playlistId=${playlistId}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportProgress(`Saving ${data.total} songs...`)
      const result = await onAddSongsBatch(crate.id, data.songs)
      setUrlInput(''); setImportProgress('')
      showToast(`✓ Imported ${result.added} songs!`)
    } catch (e) { setError(e.message); setImportProgress('') }
    finally { setImporting(false) }
  }

  const handleShare = async () => {
    const songs = (crate.songs || []).filter(s => selectedIds.has(s.videoId))
    if (!songs.length) return
    setSharing(true)
    try {
      const { url } = await createShareLink(songs)
      await navigator.clipboard.writeText(url)
      showToast(`🔗 Link copied! (${songs.length} songs)`)
      setSelectMode(false); setSelectedIds(new Set())
    } catch { showToast('Failed to create link') } finally { setSharing(false) }
  }

  return (
    <div className="lc-detail" style={{ '--lc-accent': accent, '--lc-gradient': gradient }}>
      {/* Header */}
      <div className="lc-detail-header">
        <button className="lc-detail-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <div className="lc-detail-hero" style={{ background: gradient }}>
          <div className="lc-detail-hero-content">
            <p className="lc-detail-name">{crate.name}</p>
            <p className="lc-detail-meta">{(crate.songs||[]).length} songs · ~{Math.round((crate.songs||[]).length * 3.5)}m</p>
          </div>
        </div>
        <div className="lc-detail-actions">
          <button className="lc-detail-btn lc-detail-btn--play" onClick={() => onPushToQueue(crate)} disabled={!(crate.songs||[]).length}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
            Play all
          </button>
          <button className="lc-detail-btn lc-detail-btn--shuffle" onClick={onShuffle} disabled={!(crate.songs||[]).length}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            Shuffle
          </button>
          <button className={`lc-detail-btn ${selectMode ? 'lc-detail-btn--active' : ''}`}
            onClick={() => { setSelectMode(p=>!p); setSelectedIds(new Set()) }}>
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        </div>
      </div>

      <div className="lc-detail-body">
        {/* Left — songs */}
        <div className="lc-detail-left">
          <div className="lc-detail-search">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input placeholder="Search songs..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
            {search && <button onClick={() => { setSearch(''); setPage(1) }}>×</button>}
          </div>

          {/* Select bar */}
          {selectMode && (
            <div className="lc-select-bar">
              <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Tap to select'}</span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => {
                  if (selectedIds.size === filtered.length) setSelectedIds(new Set())
                  else setSelectedIds(new Set(filtered.map(s => s.videoId)))
                }}>{selectedIds.size === filtered.length ? 'Deselect all' : 'Select all'}</button>
                <button className="lc-share-btn" onClick={handleShare} disabled={!selectedIds.size || sharing}>
                  {sharing ? 'Sharing…' : `🔗 Share ${selectedIds.size || ''}`}
                </button>
              </div>
            </div>
          )}

          <ul className="lc-song-list">
            {filtered.length === 0 && (
              <li className="lc-empty">{search ? `No results for "${search}"` : 'No songs yet'}</li>
            )}
            {visible.map((song, i) => {
              const isNowPlaying = currentVideoId === song.videoId
              const isSelected = selectedIds.has(song.videoId)
              const cat = categories[song.videoId]
              return (
                <li key={song.videoId}
                  className={`lc-song ${isNowPlaying ? 'lc-song--playing' : ''} ${selectMode && isSelected ? 'lc-song--selected' : ''}`}
                  onClick={selectMode ? () => {
                    setSelectedIds(prev => { const n=new Set(prev); n.has(song.videoId)?n.delete(song.videoId):n.add(song.videoId); return n })
                  } : undefined}
                >
                  {selectMode
                    ? <div className={`lc-checkbox ${isSelected ? 'checked' : ''}`}>
                        {isSelected && <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
                      </div>
                    : <span className="lc-song-num">{i + 1}</span>
                  }
                  <div className="lc-song-thumb">
                    <img src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`} alt="" loading="lazy" />
                    {isNowPlaying && !selectMode && <div className="lc-song-playing"><div className="bars"><span/><span/><span/></div></div>}
                  </div>
                  <div className="lc-song-info">
                    <p className="lc-song-title">{song.title}</p>
                    {cat?.category && cat.category !== 'Vibes' && (
                      <span className="lc-cat-badge" style={{ '--badge-color': getCategoryDef(cat.category).color }}>
                        {getCategoryDef(cat.category).emoji} {cat.category}
                        {cat.bpm && <span> · {cat.bpm} BPM</span>}
                      </span>
                    )}
                  </div>
                  {!selectMode && (
                    <div className="lc-song-actions">
                      <button onClick={() => onPlaySong(song)} title="Add to queue">+ Queue</button>
                      <button onClick={() => onDeleteSong(crate.id, song.videoId)} title="Remove">×</button>
                    </div>
                  )}
                </li>
              )
            })}
            {page * PAGE_SIZE < filtered.length && (
              <li className="lc-load-more">
                <button onClick={() => setPage(p=>p+1)}>Load {filtered.length - page*PAGE_SIZE} more</button>
              </li>
            )}
          </ul>
        </div>

        {/* Right — add songs */}
        <div className="lc-detail-right">
          <div className="lc-add-panel">
            <p className="lc-add-title">Add Songs</p>
            <div className="lc-add-tabs">
              <button className={addMode==='url'?'active':''} onClick={()=>setAddMode('url')}>Single</button>
              <button className={addMode==='playlist'?'active':''} onClick={()=>setAddMode('playlist')}>Playlist</button>
            </div>
            <input className="lc-add-input"
              placeholder={addMode==='url' ? 'YouTube URL...' : 'Playlist URL...'}
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setError('') }}
              onKeyDown={e => e.key==='Enter' && (addMode==='url'?handleAddSong():handleImport())} />
            {error && <p className="lc-add-error">{error}</p>}
            {importProgress && <p className="lc-add-progress">{importProgress}</p>}
            <button className="lc-add-btn" style={{ '--lc-accent': accent }}
              onClick={addMode==='url'?handleAddSong:handleImport}
              disabled={loading||importing||!urlInput.trim()}>
              {loading||importing ? <span className="loading-spinner"/> : addMode==='url'?'Add Song':'Import'}
            </button>
            <div className="lc-add-stats">
              <div><span>{(crate.songs||[]).length}</span><span>Songs</span></div>
              <div><span>~{Math.round((crate.songs||[]).length*3.5)}m</span><span>Est. Time</span></div>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="lc-toast">{toast}</div>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function Library({ isOpen, onClose, socket, roomId, username, onAddSongToQueue, currentVideoId }) {
  const { categories, loading, authError, createCategory, deleteCategory, addSong, addSongsBatch, deleteSong, refetch } = useLibrary()
  const [activeCrateId, setActiveCrateId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  useEffect(() => { if (isOpen) refetch() }, [isOpen])
  if (!isOpen) return null

  const activeCrate = categories.find(c => c.id === activeCrateId)
  const playingCrateId = currentVideoId
    ? categories.find(c => (c.songs||[]).some(s => s.videoId === currentVideoId))?.id
    : null

  const handleCreate = async (name, colorIdx) => {
    const cat = await createCategory(name, getAccent(colorIdx))
    setActiveCrateId(cat.id)
    setShowNew(false)
  }

  const handleDelete = async (id) => {
    await deleteCategory(id)
    if (activeCrateId === id) setActiveCrateId(null)
  }

  const handlePushToQueue = (crate, shuffled = false) => {
    const songs = shuffled ? [...(crate.songs||[])].sort(()=>Math.random()-0.5) : (crate.songs||[])
    socket.emit('push-category', { roomId, songs, categoryName: crate.name, username })
    showToast(`${shuffled?'🔀 Shuffled':'▶ Playing'} ${crate.name}`)
  }

  return (
    <div className="lc-library">
      <div className="lc-ambient" />
      {toast && <div className="lc-toast">{toast}</div>}
      {showNew && <NewCrateModal onCreate={handleCreate} onCancel={() => setShowNew(false)} />}

      {activeCrate ? (
        <CrateDetail
          crate={activeCrate}
          colorIdx={getColorIdx(activeCrate.id)}
          onBack={() => setActiveCrateId(null)}
          onAddSong={addSong}
          onAddSongsBatch={addSongsBatch}
          onDeleteSong={deleteSong}
          onPlaySong={song => { onAddSongToQueue?.({ videoId: song.videoId, title: song.title }); showToast(`+ ${song.title.slice(0,30)}`) }}
          onPushToQueue={handlePushToQueue}
          onShuffle={() => handlePushToQueue(activeCrate, true)}
          currentVideoId={currentVideoId}
        />
      ) : (
        <div className="lc-grid-view">
          {/* Header */}
          <div className="lc-header">
            <button className="lc-back" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
              Back to Room
            </button>
            <div className="lc-header-center">
              <h1 className="lc-title">My Library</h1>
              <p className="lc-subtitle">{categories.length} collections · {categories.reduce((a,c) => a+(c.songs||[]).length, 0)} songs</p>
            </div>
            <button className="lc-new-btn" onClick={() => setShowNew(true)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              New
            </button>
          </div>

          {loading ? (
            <div className="lc-loading"><div className="lc-spinner" /><p>Loading...</p></div>
          ) : authError ? (
            <div className="lc-empty"><div className="lc-empty-icon">🔒</div><h2>Sign in to use Library</h2></div>
          ) : categories.length === 0 ? (
            <div className="lc-empty">
              <div className="lc-empty-icon">📦</div>
              <h2>No collections yet</h2>
              <p>Create your first collection to organize your music</p>
              <button className="lc-new-btn" onClick={() => setShowNew(true)}>Create collection</button>
            </div>
          ) : (
            <div className="lc-grid">
              {categories.map((crate, i) => (
                <CrateCard
                  key={crate.id}
                  crate={crate}
                  colorIdx={getColorIdx(crate.id)}
                  isPlaying={crate.id === playingCrateId}
                  onClick={() => setActiveCrateId(crate.id)}
                  onPlay={() => handlePushToQueue(crate)}
                  onShuffle={() => handlePushToQueue(crate, true)}
                  onDelete={() => handleDelete(crate.id)}
                />
              ))}
              <div className="lc-new-card" onClick={() => setShowNew(true)}>
                <div className="lc-new-card-plus">+</div>
                <p>New Collection</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}