import { useState, useCallback } from 'react'

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export function useLibrary() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState(false)

  const fetchLibrary = useCallback(async () => {
    setLoading(true)
    setAuthError(false)
    try {
      const res = await fetch(`${API}/library`, { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        setAuthError(true)
        setCategories([])
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const normalized = (data.categories || []).map(c => ({
        ...c,
        songs: Array.isArray(c.songs) ? c.songs : []
      }))
      setCategories(normalized)
    } catch (e) {
      console.warn('Library fetch failed:', e.message)
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [])

  // NO auto-fetch on mount — only fetch when explicitly called

  const createCategory = async (name, color) => {
    const res = await fetch(`${API}/library/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, color })
    })
    if (!res.ok) throw new Error('Failed to create category')
    const category = await res.json()
    const safe = { ...category, songs: Array.isArray(category.songs) ? category.songs : [] }
    setCategories(prev => [...prev, safe])
    return safe
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
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to add song')
    }
    const song = await res.json()
    setCategories(prev => prev.map(c =>
      c.id === categoryId ? { ...c, songs: [...(c.songs || []), song] } : c
    ))
    return song
  }

  const deleteSong = async (categoryId, videoId) => {
    await fetch(`${API}/library/categories/${categoryId}/songs/${videoId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    setCategories(prev => prev.map(c =>
      c.id === categoryId ? { ...c, songs: (c.songs || []).filter(s => s.videoId !== videoId) } : c
    ))
  }

  return { categories, loading, authError, createCategory, deleteCategory, addSong, deleteSong, refetch: fetchLibrary }
}
