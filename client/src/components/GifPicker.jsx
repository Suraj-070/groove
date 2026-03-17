import { useState, useEffect, useRef, useCallback } from 'react'

// Giphy public beta key — works without account for reasonable usage
// Users can replace with their own free key from developers.giphy.com
const GIPHY_KEY = 'bS0cRf1KVChzdHqPyCXFfpZmgSvooUWB'

async function searchGifs(query, limit = 24) {
  const base = query
    ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&rating=pg-13&lang=en`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=${limit}&rating=pg-13`
  const res = await fetch(base)
  if (!res.ok) throw new Error(`Giphy error ${res.status}`)
  const json = await res.json()
  return json.data?.map(g => ({
    id: g.id,
    url: g.images?.original?.url,
    preview: g.images?.fixed_width_small?.url || g.images?.downsized_small?.mp4,
    previewGif: g.images?.fixed_width_small?.url,
    width: parseInt(g.images?.fixed_width_small?.width || 100),
    height: parseInt(g.images?.fixed_width_small?.height || 80),
    title: g.title || '',
  })) || []
}

const TAGS = ['🔥 Trending', '🎵 Music', '😂 Funny', '💃 Dance', '🎉 Party', '😮 Shocked', '❤️ Love', '💀 Dead']

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery]       = useState('')
  const [gifs, setGifs]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [activeTag, setActiveTag] = useState('🔥 Trending')
  const ref      = useRef(null)
  const debounce = useRef(null)

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

  const fetchGifs = useCallback(async (q) => {
    setLoading(true); setError(null)
    try {
      setGifs(await searchGifs(q))
    } catch (e) {
      setError('Could not load GIFs — check your connection')
      console.error('GIF error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGifs('') }, [])

  const handleSearch = (val) => {
    setQuery(val)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => fetchGifs(val), 450)
  }

  const handleTag = (tag) => {
    setActiveTag(tag)
    const q = tag.replace(/^[\u{1F000}-\u{1FFFF}🔥💀❤️]\s*/u, '').replace('Trending', '')
    setQuery(q)
    fetchGifs(q)
  }

  return (
    <div ref={ref} className="gif-picker">
      <div className="gif-search-wrap">
        <svg className="gif-search-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input className="gif-search-input" placeholder="Search GIFs…"
          value={query} onChange={e => handleSearch(e.target.value)} autoFocus />
        {query && <button className="gif-search-clear" onClick={() => { setQuery(''); fetchGifs('') }}>✕</button>}
      </div>

      {!query && (
        <div className="gif-tags">
          {TAGS.map(tag => (
            <button key={tag} className={`gif-tag ${activeTag === tag ? 'active' : ''}`}
              onClick={() => handleTag(tag)}>{tag}</button>
          ))}
        </div>
      )}

      <div className="gif-grid">
        {loading && <div className="gif-loading"><div className="gif-spinner" /></div>}
        {error && <p className="gif-error">{error}</p>}
        {!loading && !error && gifs.length === 0 && (
          <p className="gif-empty">No GIFs found{query ? ` for "${query}"` : ''}</p>
        )}
        {!loading && gifs.map(gif => (
          <button key={gif.id} className="gif-item" onClick={() => onSelect(gif)} title={gif.title}>
            <img src={gif.previewGif} alt={gif.title} loading="lazy" />
          </button>
        ))}
      </div>

      <div className="gif-powered">Powered by GIPHY</div>
    </div>
  )
}