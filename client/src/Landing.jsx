import { useEffect } from 'react'
import './Landing.css'

const APP_URL = '/app'

function GrooveLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id="ll1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c6aff" /><stop offset="100%" stopColor="#ff6a8a" />
        </linearGradient>
        <linearGradient id="ll2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" /><stop offset="100%" stopColor="#e0daff" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="28" fill="url(#ll1)" opacity="0.2" />
      <path d="M14 22 Q10 28 14 34" stroke="url(#ll1)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M42 22 Q46 28 42 34" stroke="url(#ll1)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 36V22l12-3v14" stroke="url(#ll2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="36" r="3.5" fill="url(#ll2)" />
      <circle cx="34" cy="33" r="3.5" fill="url(#ll2)" />
    </svg>
  )
}

export default function Landing() {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) }
      })
    }, { threshold: 0.12 })
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const features = [
    { icon: '🔄', title: 'Real-Time Sync', desc: 'Everyone hears the same song at the exact same moment. No lag, no drift. Powered by WebSocket technology for zero-latency sync.', tag: 'WebSocket powered', color: '#7c6aff' },
    { icon: '📡', title: 'Groove Radar', desc: 'AI-powered recommendations built from your listening history. Analyses your taste DNA — mood, BPM, energy — and surfaces songs you\'ll love.', tag: 'Smart recommendations', color: '#ff6a8a' },
    { icon: '📚', title: 'Personal Library', desc: 'Build crates of your favourite songs, import entire YouTube playlists in one click, and push them to any room instantly.', tag: 'YouTube import', color: '#00c974' },
    { icon: '📱', title: 'Works on Mobile', desc: 'Fully responsive PWA — install on your home screen and listen on the go. Background audio and push notifications built in.', tag: 'Install as PWA', color: '#ffb86a' },
  ]

  const steps = [
    { n: '1', title: 'Create a Room', desc: 'Hit "Create New Room" and get a unique room code instantly. Share it with anyone you want to listen with.', color: '#7c6aff' },
    { n: '2', title: 'Add Songs', desc: 'Paste any YouTube URL, search by song name, or import a full playlist. Everyone in the room can add to the queue.', color: '#ff6a8a' },
    { n: '3', title: 'Vibe Together', desc: 'Music syncs in real time for everyone. Chat, react, and let Groove Radar keep the queue going automatically.', color: '#00c974' },
  ]

  const queueSongs = [
    { title: 'Blinding Lights', by: 'Suraj', active: true, c: 'l-t1' },
    { title: 'Levitating', by: 'DreamCatcher', active: false, c: 'l-t2' },
    { title: 'Stay', by: 'Suraj', active: false, c: 'l-t3' },
    { title: 'Peaches', by: 'DreamCatcher', active: false, c: 'l-t4' },
  ]

  const avatarColors = [
    'linear-gradient(135deg,#7c6aff,#ff6a8a)',
    'linear-gradient(135deg,#ff6a8a,#ffb86a)',
    'linear-gradient(135deg,#6affb8,#6ab8ff)',
    'linear-gradient(135deg,#ffb86a,#ff6a8a)',
  ]

  return (
    <div className="landing">

      <nav className="l-nav">
        <a href={APP_URL} className="l-logo">
          <GrooveLogo size={28} />
          <div className="l-logo-text">
            <span className="l-logo-big">GROOVE</span>
            <span className="l-logo-small">· together ·</span>
          </div>
        </a>
        <a href={APP_URL} className="l-nav-cta">Try Groove Free →</a>
      </nav>

      <section className="l-hero">
        <div className="l-hero-badge">
          <span className="l-live-dot" />
          Live music sync — free forever
        </div>
        <h1 className="l-hero-title">
          <span className="l-title-white">Listen Together.</span>
          <span className="l-title-gradient">Feel the Groove.</span>
        </h1>
        <p className="l-hero-sub">
          Sync music with friends in <strong>real time</strong>. Add songs, control the room,
          chat live — all from your browser. No downloads required.
        </p>
        <div className="l-hero-actions">
          <a href={APP_URL} className="l-btn-primary">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5v14l11-7z" /></svg>
            Try Groove Free
          </a>
          <a href="#how" className="l-btn-secondary">How it works ↓</a>
        </div>
        <div className="l-social-proof">
          <div className="l-avatars">
            {['SJ','DC','MK','AR'].map((n, i) => (
              <div key={n} className="l-av" style={{ background: avatarColors[i] }}>{n}</div>
            ))}
          </div>
          <span>Join friends already listening together</span>
        </div>

        <div className="l-mockup">
          <div className="l-mockup-glow" />
          <div className="l-mockup-window">
            <div className="l-titlebar">
              <span className="l-dot l-dot-r" />
              <span className="l-dot l-dot-y" />
              <span className="l-dot l-dot-g" />
              <span className="l-url">groovetoget.vercel.app</span>
            </div>
            <div className="l-mockup-body">
              <div className="l-player">
                <div className="l-mockup-header">
                  <span>Now Playing</span>
                  <div className="l-room-badge">
                    <span className="l-live-dot" />
                    ROOM: GROOVE1
                  </div>
                </div>
                <div className="l-art">
                  <div className="l-art-bg" />
                  <span className="l-art-note">🎵</span>
                </div>
                <div className="l-song-info">
                  <div className="l-song-title">Blinding Lights</div>
                  <div className="l-song-sub">The Weeknd · Added by Suraj</div>
                </div>
                <div className="l-progress">
                  <div className="l-progress-fill" />
                </div>
                <div className="l-controls">
                  <div className="l-ctrl">⏮</div>
                  <div className="l-ctrl l-ctrl-play">▶</div>
                  <div className="l-ctrl">⏭</div>
                </div>
                <div className="l-listeners">
                  <span className="l-live-dot" />
                  <div className="l-user-av l-av-0" />
                  <div className="l-user-av l-av-1" />
                  <div className="l-user-av l-av-2" />
                  <span className="l-listener-label">3 listening live</span>
                </div>
              </div>
              <div className="l-queue">
                <div className="l-queue-header">
                  <span>Up Next</span>
                  <span className="l-queue-count">4 songs</span>
                </div>
                {queueSongs.map(s => (
                  <div key={s.title} className={'l-song-item' + (s.active ? ' l-song-item--active' : '')}>
                    <div className={'l-thumb ' + s.c} />
                    <div className="l-meta">
                      <div className="l-meta-title">{s.title}</div>
                      <div className="l-meta-by">by {s.by}</div>
                    </div>
                    {s.active && (
                      <div className="l-bars">
                        <span /><span /><span />
                      </div>
                    )}
                  </div>
                ))}
                <div className="l-add-hint">🔗 Paste YouTube URL or search...</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="l-stats reveal">
        {[
          { num: '100%', label: 'Free forever' },
          { num: '0ms', label: 'Setup required' },
          { num: '∞', label: 'Songs on YouTube' },
          { num: 'Real-time', label: 'Sync across devices' },
        ].map(s => (
          <div key={s.label} className="l-stat">
            <span className="l-stat-num">{s.num}</span>
            <span className="l-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <section className="l-section" id="features">
        <p className="l-label reveal">What makes Groove special</p>
        <h2 className="l-section-title reveal">Everything your room needs</h2>
        <p className="l-section-sub reveal">
          From synced playback to AI-powered recommendations — Groove has every feature for the perfect listening session.
        </p>
        <div className="l-features">
          {features.map((f, i) => (
            <div key={f.title} className="l-card reveal" style={{ transitionDelay: i * 0.1 + 's' }}>
              <div className="l-card-icon" style={{ background: f.color + '22' }}>{f.icon}</div>
              <h3 className="l-card-title">{f.title}</h3>
              <p className="l-card-desc">{f.desc}</p>
              <span className="l-card-tag" style={{ background: f.color + '18', color: f.color, borderColor: f.color + '33' }}>
                {f.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="l-how" id="how">
        <p className="l-label reveal">Simple as 1-2-3</p>
        <h2 className="l-section-title reveal">Up and running in seconds</h2>
        <p className="l-section-sub reveal">No account needed to start. Sign in with Google to save your library.</p>
        <div className="l-steps">
          {steps.map((s, i) => (
            <div key={s.n} className="l-step reveal" style={{ transitionDelay: i * 0.15 + 's' }}>
              <div className="l-step-num" style={{ background: s.color + '18', borderColor: s.color + '55', color: s.color }}>
                {s.n}
              </div>
              <h3 className="l-step-title">{s.title}</h3>
              <p className="l-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="l-cta">
        <h2 className="l-cta-title reveal">
          Ready to vibe?
          <span className="l-cta-gradient"> Start your room now.</span>
        </h2>
        <p className="l-cta-sub reveal">Free. No downloads. Works in your browser.</p>
        <div className="reveal">
          <a href={APP_URL} className="l-btn-primary l-btn-lg">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z" /></svg>
            Try Groove Free
          </a>
          <p className="l-cta-note">No credit card · No account required · Works instantly</p>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-footer-logo">
          <span className="l-footer-big">GROOVE</span>
          <span className="l-footer-small">· together ·</span>
        </div>
        <div className="l-footer-links">
          <a href={APP_URL}>Launch App</a>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
        </div>
        <div className="l-footer-copy">© 2026 Groove Together. Built with ♥</div>
      </footer>
    </div>
  )
}