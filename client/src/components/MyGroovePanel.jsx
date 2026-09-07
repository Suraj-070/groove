import { useState } from 'react'
import GrooveRadar from './GrooveRadar'
import TasteFingerprint from './TasteFingerprint'
import HistoryPanel from './HistoryPanel'
import WeeklyWrapped from './WeeklyWrapped'
import TimeMachine from './TimeMachine'

const TAB_ICONS = {
  radar: <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>,
  fingerprint: <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67-.09.18-.26.28-.44.28zM3.5 9.72c-.1 0-.2-.03-.29-.09-.23-.16-.28-.47-.12-.7.99-1.4 2.25-2.5 3.75-3.27C9.98 4.04 14 4.03 17.15 6.07c1.5.79 2.75 1.9 3.75 3.31.16.22.11.54-.12.7-.23.16-.54.11-.7-.12-.9-1.26-2.04-2.25-3.39-2.96-2.87-1.83-6.55-1.84-9.4.02-1.35.71-2.48 1.7-3.38 2.96-.08.14-.23.24-.41.24zm6.25 12.07c-.13 0-.26-.05-.35-.15-.87-.87-1.34-1.43-2.01-2.64-.69-1.23-1.05-2.73-1.05-4.34 0-2.97 2.54-5.39 5.66-5.39s5.66 2.42 5.66 5.39c0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-2.42-2.09-4.39-4.66-4.39-2.57 0-4.66 1.97-4.66 4.39 0 1.44.32 2.77.93 3.85.64 1.15 1.08 1.64 1.85 2.42.19.2.19.51 0 .71-.11.1-.24.15-.37.15zm7.17-1.85c-1.19 0-2.24-.3-3.1-.89-1.49-1.01-2.38-2.65-2.38-4.39 0-.28.22-.5.5-.5s.5.22.5.5c0 1.41.72 2.74 1.94 3.56.71.48 1.54.71 2.54.71.24 0 .64-.03 1.04-.1.27-.05.53.13.58.41.05.27-.13.53-.41.58-.57.11-1.07.12-1.21.12zM14.91 22c-.04 0-.09-.01-.13-.02-1.59-.44-2.63-1.03-3.72-2.1-1.4-1.39-2.17-3.24-2.17-5.22 0-1.62 1.38-2.94 3.08-2.94 1.7 0 3.08 1.32 3.08 2.94 0 1.07.93 1.94 2.08 1.94s2.08-.87 2.08-1.94c0-3.77-3.25-6.83-7.25-6.83-2.84 0-5.44 1.58-6.61 4.03-.39.81-.59 1.76-.59 2.8 0 .78.07 2.01.67 3.61.1.26-.03.55-.29.64-.26.1-.55-.04-.64-.29-.49-1.31-.73-2.61-.73-3.96 0-1.2.23-2.29.68-3.24 1.33-2.79 4.28-4.6 7.51-4.6 4.55 0 8.25 3.51 8.25 7.83 0 1.62-1.38 2.94-3.08 2.94s-3.08-1.32-3.08-2.94c0-1.07-.93-1.94-2.08-1.94s-2.08.87-2.08 1.94c0 1.71.66 3.31 1.87 4.51.95.94 1.86 1.46 3.27 1.85.27.07.42.35.35.61-.05.23-.26.38-.47.38z"/></svg>,
  history: <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>,
  wrapped: <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>,
  timemachine: <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L11 13.37V7h1.5v5.75l4.74 2.82-1.01 1.43z"/></svg>,
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
              <span className="mg-tab-icon">{TAB_ICONS[t.id]}</span>
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
