import { useState, useEffect, useCallback, useRef } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export const CATEGORIES = [
  { id: 'All',       emoji: '🎵', color: '#7c6aff', desc: 'Everything' },
  { id: 'Feel Good', emoji: '😊', color: '#ffb300', desc: 'Happy & uplifting' },
  { id: 'Sad',       emoji: '😢', color: '#6ab8ff', desc: 'Emotional & heartfelt' },
  { id: 'Chill',     emoji: '😌', color: '#6affb8', desc: 'Relaxed & calm' },
  { id: 'Party',     emoji: '🎉', color: '#ff6a8a', desc: 'Club & dance' },
  { id: 'Hype',      emoji: '💪', color: '#ff6a3d', desc: 'Workout & energy' },
  { id: 'Focus',     emoji: '🎧', color: '#3b8bff', desc: 'Study & work' },
  { id: 'Hip-Hop',   emoji: '🎤', color: '#bf5fff', desc: 'Rap & trap' },
  { id: 'Romance',   emoji: '❤️', color: '#ff2d78', desc: 'Love & R&B' },
  { id: 'Vibes',     emoji: '🌊', color: '#00c974', desc: 'Everything else' },
]

export function getCategoryDef(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[0]
}

// Shared cache so Library + Queue don't double-fetch
const dnaCache = {}

export function useCategories(songs = []) {
  const [categories, setCategories] = useState({}) // { videoId: category }
  const [loading, setLoading]       = useState(false)
  const pendingRef = useRef(false)

  const fetchCategories = useCallback(async (songList) => {
    if (!songList.length || pendingRef.current) return
    const uncached = songList.filter(s => !dnaCache[s.videoId])
    if (!uncached.length) {
      // All cached — update state immediately
      const map = {}
      songList.forEach(s => { if (dnaCache[s.videoId]) map[s.videoId] = dnaCache[s.videoId] })
      setCategories(map)
      return
    }

    pendingRef.current = true
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND}/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ songs: uncached.map(s => ({ videoId: s.videoId, title: s.title })) })
      })
      if (!res.ok) return
      const data = await res.json()
      // Update cache
      ;(data.results || []).forEach(r => { dnaCache[r.videoId] = r })
      // Build full map including previously cached
      const map = {}
      songList.forEach(s => { if (dnaCache[s.videoId]) map[s.videoId] = dnaCache[s.videoId] })
      setCategories(map)
    } catch {}
    finally { setLoading(false); pendingRef.current = false }
  }, [])

  useEffect(() => {
    if (!songs.length) return
    // Immediately use cached data
    const map = {}
    songs.forEach(s => { if (dnaCache[s.videoId]) map[s.videoId] = dnaCache[s.videoId] })
    if (Object.keys(map).length) setCategories(map)
    // Fetch uncached with debounce
    const t = setTimeout(() => fetchCategories(songs), 800)
    return () => clearTimeout(t)
  }, [songs.map(s => s.videoId).join(',')])

  return { categories, loading, refetch: () => fetchCategories(songs) }
}
