import { useState, useEffect, useCallback } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function formatTs(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatTime(s) {
  if (!s && s !== 0) return ''
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`
}

function SongRow({ item, onAddToQueue, onDelete, isMoment }) {
  const [added, setAdded] = useState(false)
  const handleAdd = () => {
    onAddToQueue({ videoId: item.videoId, title: item.title })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }
  return (
    <div className={`hist-row ${isMoment ? 'hist-row--moment' : ''}`}>
      <div className="hist-thumb">
        <img src={`https://img.youtube.com/vi/${item.videoId}/default.jpg`} alt="" loading="lazy" />
        {isMoment && item.timestamp !== undefined && (
          <span className="hist-stamp-time">{formatTime(item.timestamp)}</span>
        )}
      </div>
      <div className="hist-info">
        <p className="hist-title">{item.title}</p>
        <div className="hist-meta">
          {isMoment && item.note && <span className="hist-note">"{item.note}"</span>}
          {item.roomId && <span className="hist-room">Room {item.roomId}</span>}
          <span className="hist-time">{formatTs(isMoment ? item.stampedAt : item.listenedAt)}</span>
        </div>
      </div>
      <div className="hist-actions">
        <button className={`hist-add-btn ${added ? 'added' : ''}`} onClick={handleAdd} title="Add to queue">
          {added
            ? <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          }
        </button>
        <button className="hist-del-btn" onClick={() => onDelete(item)} title="Remove">
          <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
    </div>
  )
}

export default function HistoryPanel({ isOpen, onClose, onAddToQueue, roomId }) {
  const [tab, setTab]           = useState('history')
  const [history, setHistory]   = useState([])
  const [moments, setMoments]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [page, setPage]         = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError]         = useState('')

  const fetchHistory = useCallback(async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${BACKEND}/history?page=${p}&limit=50`, { credentials: 'include' })
      if (res.status === 401) { setError('Please log in to view history'); return }
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load'); return }
      if (p === 1) setHistory(data.history || [])
      else setHistory(prev => [...prev, ...(data.history || [])])
      setTotalPages(data.pages || 1)
      setPage(p)
    } catch (e) { setError('Network error: ' + e.message) }
    finally { setLoading(false) }
  }, [])

  const fetchMoments = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${BACKEND}/moments`, { credentials: 'include' })
      if (res.status === 401) { setError('Please log in to view moments'); return }
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load'); return }
      setMoments(data.moments || [])
    } catch (e) { setError('Network error: ' + e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    if (tab === 'history') fetchHistory(1)
    else fetchMoments()
  }, [isOpen, tab, fetchHistory, fetchMoments])

  const handleDeleteHistory = async (item) => {
    setHistory(prev => prev.filter(h => h.listenedAt !== item.listenedAt))
    await fetch(`${BACKEND}/history`, { method: 'DELETE', credentials: 'include' })
  }

  const handleDeleteMoment = async (item) => {
    setMoments(prev => prev.filter(m => !(m.videoId === item.videoId && m.stampedAt === item.stampedAt)))
    const qs = item.stampedAt ? `?stampedAt=${item.stampedAt}` : ''
    await fetch(`${BACKEND}/moments/${item.videoId}${qs}`, { method: 'DELETE', credentials: 'include' })
  }

  const handleClearHistory = async () => {
    if (!confirm('Clear all listen history?')) return
    setHistory([])
    await fetch(`${BACKEND}/history`, { method: 'DELETE', credentials: 'include' })
  }

  if (!isOpen) return null

  return (
    <div className="hist-overlay" onClick={onClose}>
      <div className="hist-panel" onClick={e => e.stopPropagation()}>
        <div className="hist-header">
          <div className="hist-tabs">
            <button className={`hist-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7v4l4-4-4-4v2zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8H12z"/></svg>
              History
            </button>
            <button className={`hist-tab ${tab === 'moments' ? 'active' : ''}`} onClick={() => setTab('moments')}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              Moments
              {moments.length > 0 && <span className="hist-tab-badge">{moments.length}</span>}
            </button>
          </div>
          <div className="hist-header-actions">
            {tab === 'history' && history.length > 0 && (
              <button className="hist-clear-btn" onClick={handleClearHistory} title="Clear history">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z"/></svg>
              </button>
            )}
            <button className="hist-close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>

        <div className="hist-body">
          {error && (
            <div className="hist-empty">
              <p style={{color:'#ff6a6a'}}>{error}</p>
            </div>
          )}
          {loading && history.length === 0 && moments.length === 0 && (
            <div className="hist-loading">
              <div className="shared-spinner" />
              <span>Loading…</span>
            </div>
          )}

          {tab === 'history' && !loading && history.length === 0 && (
            <div className="hist-empty">
              <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" style={{opacity:0.2}}>
                <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7v4l4-4-4-4v2zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8H12z"/>
              </svg>
              <p>No listen history yet</p>
              <p className="hist-empty-sub">Songs you listen to will appear here</p>
            </div>
          )}

          {tab === 'moments' && !loading && moments.length === 0 && (
            <div className="hist-empty">
              <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" style={{opacity:0.2}}>
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
              <p>No moments stamped yet</p>
              <p className="hist-empty-sub">Tap ★ on the player to save a moment</p>
            </div>
          )}

          <div className="hist-list">
            {tab === 'history' && history.map((item, i) => (
              <SongRow
                key={`${item.videoId}-${item.listenedAt}-${i}`}
                item={item}
                onAddToQueue={onAddToQueue}
                onDelete={handleDeleteHistory}
                isMoment={false}
              />
            ))}
            {tab === 'moments' && moments.map((item, i) => (
              <SongRow
                key={`${item.videoId}-${item.stampedAt}-${i}`}
                item={item}
                onAddToQueue={onAddToQueue}
                onDelete={handleDeleteMoment}
                isMoment={true}
              />
            ))}
          </div>

          {tab === 'history' && page < totalPages && (
            <button className="hist-load-more" onClick={() => fetchHistory(page + 1)} disabled={loading}>
              {loading ? 'Loading…' : `Load more`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}