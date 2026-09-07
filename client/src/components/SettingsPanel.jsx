import { useRef } from 'react'

const THEMES = [
  { id:'violet',    color:'#7c6aff', label:'Violet'    },
  { id:'midnight',  color:'#3b8bff', label:'Midnight'  },
  { id:'synthwave', color:'#ff2d78', label:'Synthwave' },
  { id:'forest',    color:'#00c974', label:'Forest'    },
  { id:'amber',     color:'#ffb300', label:'Amber'     },
  { id:'crimson',   color:'#ff3b3b', label:'Crimson'   },
]

function Toggle({ checked, onChange, label, sub }) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-toggle-info">
        <p className="settings-toggle-label">{label}</p>
        {sub && <p className="settings-toggle-sub">{sub}</p>}
      </div>
      <button
        className={`settings-toggle ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span className="settings-toggle-thumb" />
      </button>
    </div>
  )
}

export default function SettingsPanel({
  isOpen, onClose,
  theme, onThemeChange,
  partyMode, onPartyModeChange,
  radioMode, onRadioModeChange,
  pushEnabled, pushLoading, onTogglePush,
  sleepTimer, onSleepTimer, onCancelSleep,
  onShortcuts,
  pwaInstallable,
}) {
  if (!isOpen) return null

  // Safe mobile check inside render (not module level)
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  const handleInstall = async () => {
    if (window.__triggerPWAInstall) {
      const accepted = await window.__triggerPWAInstall()
      if (accepted) onClose()
    }
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel-modal settings-modal" onClick={e => e.stopPropagation()}>

        {/* Drag pill — mobile */}
        <div className="settings-drag-pill" />

        <div className="panel-header">
          <div className="panel-header-left">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style={{flexShrink:0,opacity:0.7}}>
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
            <div>
              <p className="panel-title">Settings</p>
              <p className="panel-sub">Personalize your Groove</p>
            </div>
          </div>
          <button className="panel-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div className="settings-body">

          {/* PWA Install */}
          {pwaInstallable && (
            <>
              <div className="settings-section">
                <p className="settings-section-label">App</p>
                <button className="settings-action-btn settings-install-btn" onClick={handleInstall}>
                  <span className="settings-action-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14zm-4.2-5.78v-3.6h-1.6v3.6H9l3 3 3-3h-2.2z"/></svg>
                  </span>
                  <div className="settings-action-text">
                    <p className="settings-action-title">Install Groove</p>
                    <p className="settings-action-sub">Add to home screen for the best experience</p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" className="settings-action-arrow"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
              </div>
              <div className="settings-divider" />
            </>
          )}

          {/* Theme */}
          <div className="settings-section">
            <p className="settings-section-label">Accent color</p>
            <div className="settings-themes">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  className={`settings-theme-btn ${theme === t.id ? 'active' : ''}`}
                  onClick={() => onThemeChange(t.id)}
                  title={t.label}
                >
                  <span className="settings-theme-dot" style={{ background: t.color }} />
                  <span className="settings-theme-name">{t.label}</span>
                  {theme === t.id && (
                    <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11" className="settings-theme-check">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-divider" />

          {/* Playback */}
          <div className="settings-section">
            <p className="settings-section-label">Playback</p>
            {!isMobile && (
              <Toggle
                checked={partyMode}
                onChange={onPartyModeChange}
                label="Party Mode"
                sub="Enhanced visualizer and effects"
              />
            )}
            <Toggle
              checked={radioMode}
              onChange={onRadioModeChange}
              label="Smart Radio"
              sub="Auto-add songs when queue empties"
            />
          </div>

          <div className="settings-divider" />

          {/* Notifications */}
          <div className="settings-section">
            <p className="settings-section-label">Notifications</p>
            <Toggle
              checked={pushEnabled}
              onChange={onTogglePush}
              label={pushLoading ? 'Updating…' : pushEnabled ? 'Push notifications on' : 'Push notifications off'}
              sub="Songs added, chat messages, DJ changes"
            />
          </div>

          <div className="settings-divider" />

          {/* Utilities */}
          <div className="settings-section">
            <p className="settings-section-label">Utilities</p>
            <button className="settings-action-btn" onClick={onSleepTimer}>
              <span className="settings-action-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L11 13.37V7h1.5v5.75l4.74 2.82-1.01 1.43z"/></svg>
              </span>
              <div className="settings-action-text">
                <p className="settings-action-title">Sleep Timer</p>
                {sleepTimer && <p className="settings-action-sub">{Math.ceil((sleepTimer.endsAt - Date.now()) / 60000)}m remaining</p>}
              </div>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" className="settings-action-arrow"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
            {!isMobile && (
              <button className="settings-action-btn" onClick={onShortcuts}>
                <span className="settings-action-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 5H5v-2h2v2zm9 0H8v-2h8v2zm2 0h-2v-2h2v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>
                </span>
                <span className="settings-action-text">
                  <p className="settings-action-title">Keyboard shortcuts</p>
                </span>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" className="settings-action-arrow"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
