import { useEffect, useRef } from 'react'

/**
 * MarqueeText — auto-scrolls text that is too long to fit its container.
 * Usage:
 *   <MarqueeText className="player-title">{title}</MarqueeText>
 *
 * Wraps children in a .marquee-wrap div + .marquee-inner span.
 * Adds `is-overflowing` class only when the inner text is actually
 * wider than the container, so short titles stay still.
 */
export default function MarqueeText({ children, className = '', as: Tag = 'p', style }) {
  const wrapRef  = useRef(null)
  const innerRef = useRef(null)

  useEffect(() => {
    const wrap  = wrapRef.current
    const inner = innerRef.current
    if (!wrap || !inner) return

    const check = () => {
      const overflowing = inner.scrollWidth > wrap.clientWidth + 2
      if (overflowing) {
        // Calculate how far to scroll so the end is visible
        const distance = inner.scrollWidth - wrap.clientWidth
        inner.style.setProperty('--marquee-distance', `-${distance}px`)
        wrap.classList.add('is-overflowing')
        // Remove ellipsis since we're scrolling
        wrap.style.textOverflow = 'clip'
      } else {
        wrap.classList.remove('is-overflowing')
        wrap.style.textOverflow = ''
      }
    }

    check()
    const ro = new ResizeObserver(check)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [children])

  return (
    <Tag className={`marquee-wrap ${className}`} style={style} ref={wrapRef}>
      <span className="marquee-inner" ref={innerRef}>{children}</span>
    </Tag>
  )
}