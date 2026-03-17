import { useState, useEffect, useRef, useCallback } from 'react'

const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPzkcsvZnUpdated'
// Tenor v2 public key — works without billing for moderate usage
const TENOR_ANON_KEY = 'LIVDSRZULELA'

async function searchGifs(query, limit = 20) {
  const base = query
    ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_ANON_KEY}&limit=${limit}&media_filter=gif`
    : `https://tenor.googleapis.com/v2/featured?key=${TENOR_ANON_KEY}&limit=${limit}&media_filter=gif`
  const res = await fetch(base)
  if (!res.ok) throw new Error('Tenor error')
  const data = await res.json()
  return data.results?.map(r => ({
    id: r.id,
    url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url,
    preview: r.media_formats?.tinygif?.url || r.media_formats?.nanogif?.url,
    width: r.media_formats?.tinygif?.dims?.[0] || 200,
    height: r.media_formats?.tinygif?.dims?.[1] || 150,
    title: r.title || '',
  })) || []
}

const TRENDING_TOPICS = ['🔥 Trending', '🎵 Music', '😂 Funny', '💃 Dance', '🎉 Party', '😍 Love', '💀 Dead', '🤯 Shocked']

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery]     = useState('')
  const [gifs, setGifs]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [activeTag, setActiveTag] = useState('🔥 Trending')
  const ref       = useRef(null)
  const inputRef  = useRef(null)
  const debounce  = useRef(null)

  // Close on outside click
  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    setTimeout(() => {
      document.addEventListener('mousedown', fn)
      document.addEventListener('touchstart', fn)
    }, 100)
    return () => {
      document.removeEventListener('mousedown', fn)
      document.removeEventListener('touchstart', fn)
    }
  }, [onClose])

  // Load trending on mount
  useEffect(() => { fetchGifs('') }, [])

  const fetchGifs = useCallback(async (q) => {
    setLoading(true); setError(null)
    try {
      const results = await searchGifs(q)
      setGifs(results)
    } catch {
      setError('Could not load GIFs')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearch = (val) => {
    setQuery(val)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => fetchGifs(val), 400)
  }

  const handleTag = (tag) => {
    setActiveTag(tag)
    const q = tag.replace(/^[^\s]+\s/, '') // strip emoji prefix
    setQuery(q === 'Trending' ? '' : q)
    fetchGifs(q === 'Trending' ? '' : q)
  }

  return (
    <div ref={ref} className="gif-picker">
      {/* Search */}
      <div className="gif-search-wrap">
        <svg className="gif-search-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input
          ref={inputRef}
          className="gif-search-input"
          placeholder="Search GIFs…"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          autoFocus
        />
        {query && (
          <button className="gif-search-clear" onClick={() => { setQuery(''); fetchGifs('') }}>✕</button>
        )}
      </div>

      {/* Topic tags */}
      {!query && (
        <div className="gif-tags">
          {TRENDING_TOPICS.map(tag => (
            <button key={tag}
              className={`gif-tag ${activeTag === tag ? 'active' : ''}`}
              onClick={() => handleTag(tag)}>
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* GIF grid */}
      <div className="gif-grid">
        {loading && (
          <div className="gif-loading">
            <div className="gif-spinner" />
          </div>
        )}
        {error && <p className="gif-error">{error}</p>}
        {!loading && !error && gifs.length === 0 && (
          <p className="gif-empty">No GIFs found for "{query}"</p>
        )}
        {!loading && gifs.map(gif => (
          <button key={gif.id} className="gif-item" onClick={() => onSelect(gif)}
            title={gif.title}>
            <img src={gif.preview} alt={gif.title} loading="lazy"
              style={{ aspectRatio: `${gif.width}/${gif.height}` }} />
          </button>
        ))}
      </div>

      {/* Tenor attribution — required by Tenor TOS */}
      <div className="gif-powered">Powered by Tenor</div>
    </div>
  )
}
