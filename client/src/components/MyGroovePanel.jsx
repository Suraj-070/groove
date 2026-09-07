import { useState } from 'react'
import GrooveRadar from './GrooveRadar'
import TasteFingerprint from './TasteFingerprint'
import HistoryPanel from './HistoryPanel'
import WeeklyWrapped from './WeeklyWrapped'
import TimeMachine from './TimeMachine'

function TabIcon({ id }) {
  if (id === 'radar')       return <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
  if (id === 'fingerprint') return <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67-.09.18-.26.28-.44.28z"/></svg>
  if (id === 'history')     return <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
  if (id === 'wrapped')     return <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
  return <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L11 13.37V7h1.5v5.75l4.74 2.82-1.01 1.43z"/></svg>
}

const TABS = [
  { id: 'radar',       label: 'Radar' },
  { id: 'fingerprint', label: 'Taste' },
  { id: 'history',     label: 'History' },
  { id: 'wrapped',     label: 'Wrapped' },
  { id: 'timemachine', label: 'Memories' },
]

export default function MyGroovePanel({ isOpen, onClose, initialTab = 'radar', onAddToQueue, onLoadSession, roomId }) {
  const [tab, setTab] = useState(initialTab)
  if (!isOpen) return null

  return (
    <div className="mg-overlay" onClick={onClose}>
      <div className="mg-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="mg-header">
          <div className="mg-header-left">
            <span className="mg-header-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg></span>
            <div>
              <p className="mg-title">My Groove</p>
              <p className="mg-sub">Your personal music universe</p>
            </div>
          </div>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="mg-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`mg-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="mg-tab-icon"><TabIcon id={t.id} /></span>
              <span className="mg-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content — each tab renders its own panel inline */}
        <div className="mg-content">
          {/* Lazy mount — only render active tab, unmount others to prevent API spam */}
          {tab === 'radar' &&
            <GrooveRadar isOpen={true} onClose={() => {}} onAddToQueue={onAddToQueue} inline />}
          {tab === 'fingerprint' &&
            <TasteFingerprint isOpen={true} onClose={() => {}} inline />}
          {tab === 'history' &&
            <HistoryPanel isOpen={true} onClose={() => {}} onAddToQueue={onAddToQueue} roomId={roomId} inline />}
          {tab === 'wrapped' &&
            <WeeklyWrapped isOpen={true} onClose={() => {}} inline />}
          {tab === 'timemachine' &&
            <TimeMachine isOpen={true} onClose={() => {}} onLoadSession={onLoadSession} inline />}
        </div>
      </div>
    </div>
  )
}
