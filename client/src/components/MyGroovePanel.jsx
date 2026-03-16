import { useState } from 'react'
import GrooveRadar from './GrooveRadar'
import TasteFingerprint from './TasteFingerprint'
import HistoryPanel from './HistoryPanel'
import WeeklyWrapped from './WeeklyWrapped'
import TimeMachine from './TimeMachine'

const TABS = [
  { id: 'radar',       icon: '📡', label: 'Radar' },
  { id: 'fingerprint', icon: '🫆', label: 'Taste' },
  { id: 'history',     icon: '🕐', label: 'History' },
  { id: 'wrapped',     icon: '📊', label: 'Wrapped' },
  { id: 'timemachine', icon: '⏰', label: 'Memories' },
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
            <span className="mg-header-icon">🎵</span>
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
              <span className="mg-tab-icon">{t.icon}</span>
              <span className="mg-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content — each tab renders its own panel inline */}
        <div className="mg-content">
          {tab === 'radar' && (
            <GrooveRadar
              isOpen={true}
              onClose={() => {}}
              onAddToQueue={onAddToQueue}
              inline
            />
          )}
          {tab === 'fingerprint' && (
            <TasteFingerprint isOpen={true} onClose={() => {}} inline />
          )}
          {tab === 'history' && (
            <HistoryPanel
              isOpen={true}
              onClose={() => {}}
              onAddToQueue={onAddToQueue}
              roomId={roomId}
              inline
            />
          )}
          {tab === 'wrapped' && (
            <WeeklyWrapped isOpen={true} onClose={() => {}} inline />
          )}
          {tab === 'timemachine' && (
            <TimeMachine
              isOpen={true}
              onClose={() => {}}
              onLoadSession={onLoadSession}
              inline
            />
          )}
        </div>
      </div>
    </div>
  )
}
