import { useState, useEffect, useRef, useCallback } from 'react'

// Giphy public beta key — still works for existing apps, no registration needed
// Falls back to static curated GIFs if API fails
const GIPHY_KEY = 'bS0cRf1KVChzdHqPyCXFfpZmgSvooUWB'

// Curated fallback GIFs per category (always works, no API needed)
const FALLBACK = {
  '🔥 Trending': [
    { id:'1', preview:'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif', title:'Fire' },
    { id:'2', preview:'https://media.giphy.com/media/3o7TKtnuHOHHUjR38Y/giphy.gif', title:'Party' },
    { id:'3', preview:'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', title:'Dance' },
    { id:'4', preview:'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif', title:'Music' },
    { id:'5', preview:'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', title:'Wow' },
    { id:'6', preview:'https://media.giphy.com/media/3oz8xIsloV7zOmt81G/giphy.gif', title:'Cool' },
  ],
  '🎵 Music': [
    { id:'m1', preview:'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif', title:'Music' },
    { id:'m2', preview:'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', title:'Dance' },
    { id:'m3', preview:'https://media.giphy.com/media/3o7TKqnN349PBUtGFO/giphy.gif', title:'Headphones' },
  ],
  '😂 Funny': [
    { id:'f1', preview:'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', title:'Laugh' },
    { id:'f2', preview:'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif', title:'LOL' },
  ],
  '❤️ Love': [
    { id:'l1', preview:'https://media.giphy.com/media/3oEdv1UFAngHwQCMBi/giphy.gif', title:'Love' },
    { id:'l2', preview:'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif', title:'Heart' },
  ],
}

async function searchGiphy(query, limit = 20) {
  const url = query
    ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=${limit}&rating=pg-13`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status}`)
  const json = await res.json()
  return json.data.map(g => ({
    id: g.id,
    url: g.images.original.url,
    preview: g.images.fixed_width_small?.url || g.images.downsized?.url,
    title: g.title,
  }))
}

const TAGS = ['🔥 Trending','🎵 Music','😂 Funny','💃 Dance','🎉 Party','❤️ Love','😮 Shocked','💀 Dead']

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery]         = useState('')
  const [gifs, setGifs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [activeTag, setActiveTag] = useState('🔥 Trending')
  const ref    = useRef(null)
  const debRef = useRef(null)

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    setTimeout(() => {
      document.addEventListener('mousedown', fn)
      document.addEventListener('touchstart', fn, { passive: true })
    }, 100)
    return () => {
      document.removeEventListener('mousedown', fn)
      document.removeEventListener('touchstart', fn)
    }
  }, [onClose])

  const load = useCallback(async (q, tag) => {
    setLoading(true); setError(null)
    try {
      const results = await searchGiphy(q)
      setGifs(results)
    } catch (e) {
      // Fallback to curated GIFs
      const fallback = FALLBACK[tag] || FALLBACK['🔥 Trending']
      setGifs(fallback.map(g => ({ ...g, url: g.preview })))
      setError(null) // don't show error — just use fallback silently
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load('', '🔥 Trending') }, [load])

  const handleSearch = (val) => {
    setQuery(val)
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => load(val, activeTag), 400)
  }

  const handleTag = (tag) => {
    setActiveTag(tag)
    setQuery('')
    const q = tag.replace(/^[\u{1F300}-\u{1FFFF}🔥💀❤️😂💃🎉😮]\s*/u, '').replace('Trending','').trim()
    load(q, tag)
  }

  return (
    <div ref={ref} className="gif-picker">
      <div className="gif-search-wrap">
        <svg className="gif-search-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input className="gif-search-input" placeholder="Search GIFs…"
          value={query} onChange={e => handleSearch(e.target.value)}
          readOnly={false} inputMode="search" />
        {query && <button className="gif-search-clear" onClick={() => { setQuery(''); load('', activeTag) }}>✕</button>}
      </div>

      <div className="gif-tags">
        {TAGS.map(tag => (
          <button key={tag} className={`gif-tag ${activeTag === tag ? 'active' : ''}`}
            onClick={() => handleTag(tag)}>{tag}</button>
        ))}
      </div>

      <div className="gif-grid">
        {loading && <div className="gif-loading"><div className="gif-spinner" /><p>Loading…</p></div>}
        {!loading && gifs.length === 0 && <p className="gif-empty">No GIFs found{query ? ` for "${query}"` : ''}</p>}
        {!loading && gifs.map(gif => (
          <button key={gif.id} className="gif-item" onClick={() => onSelect(gif)} title={gif.title}>
            <img src={gif.preview} alt={gif.title} loading="lazy" />
          </button>
        ))}
      </div>

      <div className="gif-powered">Powered by GIPHY</div>
    </div>
  )
}