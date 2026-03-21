import { useEffect } from 'react'
import './Landing.css'

export default function Landing() {

  useEffect(() => {
    // Scroll reveal
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible')
          observer.unobserve(e.target)
        }
      })
    }, { threshold: 0.12 })
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el))

    // Smooth scroll for anchor links
    const handleClick = (e) => {
      const href = e.currentTarget.getAttribute('href')
      if (href && href.startsWith('#')) {
        e.preventDefault()
        document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' })
      }
    }
    const anchors = document.querySelectorAll('a[href^="#"]')
    anchors.forEach(a => a.addEventListener('click', handleClick))

    return () => {
      observer.disconnect()
      anchors.forEach(a => a.removeEventListener('click', handleClick))
    }
  }, [])

  return (
    <div>



<nav>
  <a href="#" className="nav-logo">
    <svg width="28" height="28" viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c6aff"/><stop offset="100%" stopColor="#ff6a8a"/>
        </linearGradient>
        <linearGradient id="lg2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95"/><stop offset="100%" stopColor="#e0daff"/>
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="28" fill="url(#lg1)" opacity="0.2"/>
      <path d="M14 22 Q10 28 14 34" stroke="url(#lg1)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M42 22 Q46 28 42 34" stroke="url(#lg1)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M24 36V22l12-3v14" stroke="url(#lg2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="22" cy="36" r="3.5" fill="url(#lg2)"/>
      <circle cx="34" cy="33" r="3.5" fill="url(#lg2)"/>
    </svg>
    <div className="nav-logo-text">
      <span className="nav-logo-big">GROOVE</span>
      <span className="nav-logo-small">· together ·</span>
    </div>
  </a>
  <a href="/app" className="nav-cta">
    Try Groove Free →
  </a>
</nav>


<section className="hero">
  <div className="hero-badge">
    <span className="hero-badge-dot"></span>
    Live music sync — free forever
  </div>

  <h1 className="hero-title">
    <span className="hero-title-line1">Listen Together.</span>
    <span className="hero-title-line2">Feel the Groove.</span>
  </h1>

  <p className="hero-sub">
    Sync music with friends in <strong>real time</strong>. Add songs, control the room, chat live — all from your browser. No downloads, no accounts required.
  </p>

  <div className="hero-actions">
    <a href="/app" className="btn-primary">
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>
      Try Groove Free
    </a>
    <a href="#how-it-works" className="btn-secondary">
      How it works ↓
    </a>
  </div>

  <div className="hero-social-proof">
    <div className="hero-avatars">
      <div className="hero-avatar">SJ</div>
      <div className="hero-avatar" style="background:linear-gradient(135deg,#ff6a8a,#ffb86a)">DC</div>
      <div className="hero-avatar" style="background:linear-gradient(135deg,#6affb8,#6ab8ff)">MK</div>
      <div className="hero-avatar" style="background:linear-gradient(135deg,#ffb86a,#ff6a8a)">AR</div>
    </div>
    <span>Join friends already listening together</span>
  </div>

  
  <div className="hero-mockup" style="margin-top: 60px;">
    <div className="mockup-glow"></div>
    <div className="mockup-window">
      <div className="mockup-titlebar">
        <div className="dot dot-r"></div>
        <div className="dot dot-y"></div>
        <div className="dot dot-g"></div>
        <div className="mockup-titlebar-url">groovetoget.vercel.app</div>
      </div>
      <div className="mockup-body">
        
        <div className="mockup-player">
          <div className="mockup-header">
            <span>Now Playing</span>
            <div className="mockup-room-badge">
              <span className="mockup-live-dot"></span>
              ROOM: GROOVE1
            </div>
          </div>
          <div className="mockup-art">
            <div className="mockup-art-gradient"></div>
            <div className="mockup-art-note">🎵</div>
          </div>
          <div className="mockup-song-info">
            <div className="mockup-song-title">Blinding Lights</div>
            <div className="mockup-song-sub">The Weeknd · Added by Suraj</div>
          </div>
          <div className="mockup-progress">
            <div className="mockup-progress-fill"></div>
          </div>
          <div className="mockup-controls">
            <div className="mockup-ctrl">⏮</div>
            <div className="mockup-ctrl mockup-ctrl-play">▶</div>
            <div className="mockup-ctrl">⏭</div>
          </div>
          <div className="mockup-users">
            <span className="mockup-live-dot"></span>
            <div className="mockup-user-av"></div>
            <div className="mockup-user-av"></div>
            <div className="mockup-user-av"></div>
            <span className="mockup-user-label">3 listening live</span>
          </div>
        </div>

        
        <div className="mockup-queue">
          <div className="mockup-queue-header">
            <span>Up Next</span>
            <span style="color:var(--accent);font-size:0.62rem">4 songs</span>
          </div>
          <div className="mockup-song-item active">
            <div className="mockup-song-thumb t1"></div>
            <div className="mockup-song-meta">
              <div className="mockup-song-name">Blinding Lights</div>
              <div className="mockup-song-by">by Suraj</div>
            </div>
            <div className="mockup-playing-anim">
              <span></span><span></span><span></span>
            </div>
          </div>
          <div className="mockup-song-item">
            <div className="mockup-song-thumb t2"></div>
            <div className="mockup-song-meta">
              <div className="mockup-song-name">Levitating</div>
              <div className="mockup-song-by">by DreamCatcher</div>
            </div>
          </div>
          <div className="mockup-song-item">
            <div className="mockup-song-thumb t3"></div>
            <div className="mockup-song-meta">
              <div className="mockup-song-name">Stay</div>
              <div className="mockup-song-by">by Suraj</div>
            </div>
          </div>
          <div className="mockup-song-item">
            <div className="mockup-song-thumb t4"></div>
            <div className="mockup-song-meta">
              <div className="mockup-song-name">Peaches</div>
              <div className="mockup-song-by">by DreamCatcher</div>
            </div>
          </div>
          <div style="margin-top:12px; padding: 10px; background: rgba(124,106,255,0.08); border: 1px solid rgba(124,106,255,0.2); border-radius:10px; font-size:0.65rem; color: var(--muted); display:flex; align-items:center; gap:6px;">
            <span style="font-size:0.8rem">🔗</span>
            Paste YouTube URL or search...
          </div>
        </div>
      </div>
    </div>
  </div>
</section>


<div className="stats-bar reveal">
  <div className="stats-inner">
    <div className="stat-item">
      <span className="stat-num">100%</span>
      <span className="stat-label">Free forever</span>
    </div>
    <div className="stat-item">
      <span className="stat-num">0ms</span>
      <span className="stat-label">Setup required</span>
    </div>
    <div className="stat-item">
      <span className="stat-num">∞</span>
      <span className="stat-label">Songs on YouTube</span>
    </div>
    <div className="stat-item">
      <span className="stat-num">Real‑time</span>
      <span className="stat-label">Sync across devices</span>
    </div>
  </div>
</div>


<section className="section" id="features">
  <p className="section-label reveal">What makes Groove special</p>
  <h2 className="section-title reveal">Everything your room needs</h2>
  <p className="section-sub reveal">From synced playback to AI-powered recommendations — Groove has every feature you need for the perfect listening session.</p>

  <div className="features-grid">
    <div className="feature-card reveal reveal-delay-1">
      <div className="feature-icon">🔄</div>
      <h3 className="feature-title">Real-Time Sync</h3>
      <p className="feature-desc">Everyone in the room hears the same song at the exact same moment. No lag, no drift. Powered by WebSocket technology for zero-latency sync.</p>
      <span className="feature-tag">WebSocket powered</span>
    </div>

    <div className="feature-card reveal reveal-delay-2">
      <div className="feature-icon">📡</div>
      <h3 className="feature-title">Groove Radar</h3>
      <p className="feature-desc">AI-powered recommendations built from your listening history. Groove analyses your taste DNA — mood, BPM, energy — and surfaces songs you'll love.</p>
      <span className="feature-tag" style="background:rgba(255,106,138,0.1);color:#ffb0c0;border-color:rgba(255,106,138,0.2)">Smart recommendations</span>
    </div>

    <div className="feature-card reveal reveal-delay-3">
      <div className="feature-icon">📚</div>
      <h3 className="feature-title">Personal Library</h3>
      <p className="feature-desc">Build crates of your favourite songs, import entire YouTube playlists in one click, and push them to any room instantly. Your music, always ready.</p>
      <span className="feature-tag" style="background:rgba(0,201,116,0.1);color:#80e8c0;border-color:rgba(0,201,116,0.2)">YouTube import</span>
    </div>

    <div className="feature-card reveal reveal-delay-4">
      <div className="feature-icon">📱</div>
      <h3 className="feature-title">Works on Mobile</h3>
      <p className="feature-desc">Fully responsive PWA — install it on your home screen and listen on the go. Background audio, push notifications, and offline support built in.</p>
      <span className="feature-tag" style="background:rgba(255,184,106,0.1);color:#ffd080;border-color:rgba(255,184,106,0.2)">Install as PWA</span>
    </div>
  </div>
</section>


<section className="how-section" id="how-it-works">
  <p className="section-label reveal">Simple as 1-2-3</p>
  <h2 className="section-title reveal">Up and running in seconds</h2>
  <p className="section-sub reveal">No account needed to start. Sign in with Google to save your library and history.</p>

  <div className="steps">
    <div className="step reveal reveal-delay-1">
      <div className="step-num">1</div>
      <h3 className="step-title">Create a Room</h3>
      <p className="step-desc">Hit "Create New Room" and get a unique room code instantly. Share it with anyone you want to listen with.</p>
    </div>
    <div className="step reveal reveal-delay-2">
      <div className="step-num">2</div>
      <h3 className="step-title">Add Songs</h3>
      <p className="step-desc">Paste any YouTube URL, search by song name, or import a full playlist. Everyone in the room can add to the queue.</p>
    </div>
    <div className="step reveal reveal-delay-3">
      <div className="step-num">3</div>
      <h3 className="step-title">Vibe Together</h3>
      <p className="step-desc">Music syncs for everyone in real time. Chat, react, send GIFs — and let Groove Radar keep the queue going automatically.</p>
    </div>
  </div>
</section>


<section className="cta-section">
  <h2 className="cta-title reveal">
    Ready to vibe?
    <span>Start your room now.</span>
  </h2>
  <p className="cta-sub reveal">Free. No downloads. Works in your browser.</p>
  <div className="reveal">
    <a href="/app" className="btn-primary" style="font-size:1.1rem;padding:18px 44px;">
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>
      Try Groove Free
    </a>
    <p className="cta-note">No credit card · No account required · Works instantly</p>
  </div>
</section>


<footer>
  <div className="footer-logo">
  <span style="display:block;font-size:0.9rem;font-weight:900;letter-spacing:-0.02em">GROOVE</span>
  <span style="display:block;font-size:0.45rem;letter-spacing:0.18em;font-weight:400;opacity:0.55;margin-top:2px">· together ·</span>
</div>
  <div className="footer-links">
    <a href="/app" target="_blank">Launch App</a>
    <a href="#features">Features</a>
    <a href="#how-it-works">How it works</a>
  </div>
  <div className="footer-copy">© 2026 Groove Together. Built with ♥</div>
</footer>



    </div>
  )
}
