import { useRef, useEffect, useState } from 'react'
import { CATEGORIES } from '../hooks/useCategories'

export default function CategoryFilter({ active, onChange, counts = {}, loading = false }) {
  const scrollRef = useRef(null)
  const [showLeft, setShowLeft]   = useState(false)
  const [showRight, setShowRight] = useState(false)

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setShowLeft(el.scrollLeft > 8)
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)
    return () => { el.removeEventListener('scroll', checkScroll); window.removeEventListener('resize', checkScroll) }
  }, [])

  // Auto-scroll active pill into view
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const btn = el.querySelector(`[data-cat="${active}"]`)
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [active])

  return (
    <div className="catfilter-wrap">
      {showLeft  && <div className="catfilter-fade catfilter-fade--left"  />}
      {showRight && <div className="catfilter-fade catfilter-fade--right" />}

      <div className="catfilter-scroll" ref={scrollRef}>
        {CATEGORIES.map(cat => {
          const isActive = active === cat.id
          const count    = cat.id === 'All' ? null : counts[cat.id]
          return (
            <button
              key={cat.id}
              data-cat={cat.id}
              className={`catfilter-pill ${isActive ? 'catfilter-pill--active' : ''}`}
              style={isActive ? { '--cat-color': cat.color } : {}}
              onClick={() => onChange(cat.id)}
              title={cat.desc}
            >
              <span className="catfilter-emoji">{cat.emoji}</span>
              <span className="catfilter-label">{cat.id}</span>
              {count != null && count > 0 && (
                <span className="catfilter-count">{count}</span>
              )}
              {loading && !isActive && count == null && (
                <span className="catfilter-dot" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
