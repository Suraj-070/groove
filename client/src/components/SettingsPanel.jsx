const isMobile = window.innerWidth <= 768

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
}) {
  if (!isOpen) return null

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel-modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-header-left">
            <span style={{fontSize:'1.2rem'}}>⚙️</span>
            <div>
              <p className="panel-title">Settings</p>
              <p className="panel-sub">Personalize your Groove experience</p>
            </div>
          </div>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">

          {/* Theme */}
          <div className="settings-section">
            <p className="settings-section-label">Room theme</p>
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
                  {theme === t.id && <span className="settings-theme-check">✓</span>}
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
                label="Party Mode 🎊"
                sub="Enhanced visualizer and effects"
              />
            )}
            <Toggle
              checked={radioMode}
              onChange={onRadioModeChange}
              label="Smart Radio 📻"
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
              label={pushLoading ? 'Updating…' : pushEnabled ? 'Push notifications ON 🔔' : 'Push notifications OFF 🔕'}
              sub="Songs added, chat messages, DJ crown"
            />
          </div>

          <div className="settings-divider" />

          {/* Utilities */}
          <div className="settings-section">
            <p className="settings-section-label">Utilities</p>
            <button className="settings-action-btn" onClick={onSleepTimer}>
              <span>😴</span>
              <span>Sleep Timer {sleepTimer ? `· ${Math.ceil((sleepTimer.endsAt - Date.now()) / 60000)}m remaining` : ''}</span>
              <span className="settings-action-arrow">›</span>
            </button>
            {!isMobile && (
              <button className="settings-action-btn" onClick={onShortcuts}>
                <span>⌨️</span>
                <span>Keyboard shortcuts</span>
                <span className="settings-action-arrow">›</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}