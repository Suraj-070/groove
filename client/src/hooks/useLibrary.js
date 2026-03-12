import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export function useLibrary() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLibrary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/library`, { credentials: 'include' })
      if (!res.ok) throw new Error('Not authenticated')
      const data = await res.json()
      // Normalize — ensure every category has songs as an array
      const normalized = (data.categories || []).map(c => ({
        ...c,
        songs: Array.isArray(c.songs) ? c.songs : []
      }))
      setCategories(normalized)
    } catch (e) {
      console.error('Failed to fetch library:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLibrary() }, [fetchLibrary])

  const createCategory = async (name, color) => {
    const res = await fetch(`${API}/library/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, color })
    })
    const category = await res.json()
    setCategories(prev => [...prev, { ...category, songs: Array.isArray(category.songs) ? category.songs : [] }])
    return category
  }

  const deleteCategory = async (categoryId) => {
    await fetch(`${API}/library/categories/${categoryId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    setCategories(prev => prev.filter(c => c.id !== categoryId))
  }

  const addSong = async (categoryId, videoId, title) => {
    const res = await fetch(`${API}/library/categories/${categoryId}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ videoId, title })
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to add song')
    }
    const song = await res.json()
    setCategories(prev => prev.map(c =>
      c.id === categoryId ? { ...c, songs: [...c.songs, song] } : c
    ))
    return song
  }

  const deleteSong = async (categoryId, videoId) => {
    await fetch(`${API}/library/categories/${categoryId}/songs/${videoId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    setCategories(prev => prev.map(c =>
      c.id === categoryId ? { ...c, songs: c.songs.filter(s => s.videoId !== videoId) } : c
    ))
  }

  return { categories, loading, createCategory, deleteCategory, addSong, deleteSong, refetch: fetchLibrary }
}
