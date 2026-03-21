import { useEffect } from 'react'

// All CTAs point to /app
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
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault()
    const id = a.getAttribute('href').slice(1)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  })
})

  }, [])

  return (
    <>
      <style>{\`

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --accent: #7c6aff;
  --pink: #ff6a8a;
  --green: #00c974;
  --bg: #060410;
  --bg2: #0a0818;
  --surface: rgba(255,255,255,0.04);
  --border: rgba(255,255,255,0.08);
  --text: #f0eeff;
  --muted: rgba(255,255,255,0.4);
  --app-url: 'https://groovetoget.vercel.app';
}

html { scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'DM Sans', sans-serif;
  overflow-x: hidden;
  line-height: 1.6;
}

/* ── Noise texture overlay ── */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
}

/* ── NAV ── */
nav {
  position: fixed; top: 0; left: 0; right: 0;
  z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 48px;
  background: rgba(6,4,16,0.7);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
}

.nav-logo {
  display: flex; align-items: center; gap: 10px;
  font-family: 'Unbounded', sans-serif;
  text-decoration: none;
}

.nav-logo-text {
  display: flex; flex-direction: column; line-height: 1.1;
}

.nav-logo-big {
  font-weight: 900; font-size: 1rem;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #fff 0%, #c4b5fd 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}

.nav-logo-small {
  font-size: 0.48rem; letter-spacing: 0.18em;
  font-weight: 400;
  background: linear-gradient(135deg, #fff 0%, #c4b5fd 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  opacity: 0.55;
}

.nav-logo svg { flex-shrink: 0; }

.nav-cta {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 22px;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  border: none; border-radius: 50px;
  color: #fff; font-family: 'DM Sans', sans-serif;
  font-weight: 600; font-size: 0.9rem;
  cursor: pointer; text-decoration: none;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 24px rgba(124,106,255,0.35);
}
.nav-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(124,106,255,0.5); }

/* ── HERO ── */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 120px 24px 80px;
  overflow: hidden;
}

/* Ambient glow blobs */
.hero::before {
  content: '';
  position: absolute;
  width: 700px; height: 700px;
  background: radial-gradient(circle, rgba(124,106,255,0.18) 0%, transparent 70%);
  top: -100px; left: 50%; transform: translateX(-50%);
  pointer-events: none;
}
.hero::after {
  content: '';
  position: absolute;
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(255,106,138,0.12) 0%, transparent 70%);
  bottom: 0; right: -100px;
  pointer-events: none;
}

.hero-badge {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 6px 16px 6px 10px;
  background: rgba(124,106,255,0.1);
  border: 1px solid rgba(124,106,255,0.3);
  border-radius: 50px;
  font-size: 0.78rem; font-weight: 500;
  color: #c4b5fd;
  margin-bottom: 28px;
  animation: fadeUp 0.6s ease both;
}
.hero-badge-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
  animation: blink 1.5s ease-in-out infinite;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }

.hero-title {
  font-family: 'Unbounded', sans-serif;
  font-weight: 900;
  font-size: clamp(2.8rem, 8vw, 6.5rem);
  line-height: 1.0;
  letter-spacing: -0.03em;
  margin-bottom: 12px;
  animation: fadeUp 0.6s 0.1s ease both;
}

.hero-title-line1 {
  display: block;
  background: linear-gradient(135deg, #ffffff 0%, #e0daff 60%, #c4b5fd 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}

.hero-title-line2 {
  display: block;
  background: linear-gradient(135deg, var(--accent) 0%, var(--pink) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}

.hero-sub {
  font-size: clamp(1rem, 2.5vw, 1.3rem);
  color: var(--muted);
  max-width: 560px;
  font-weight: 300;
  margin-bottom: 40px;
  animation: fadeUp 0.6s 0.2s ease both;
}

.hero-sub strong { color: rgba(255,255,255,0.75); font-weight: 500; }

.hero-actions {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap; justify-content: center;
  margin-bottom: 64px;
  animation: fadeUp 0.6s 0.3s ease both;
}

.btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 16px 36px;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  border: none; border-radius: 50px;
  color: #fff; font-family: 'DM Sans', sans-serif;
  font-weight: 700; font-size: 1.05rem;
  cursor: pointer; text-decoration: none;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 8px 32px rgba(124,106,255,0.4);
  position: relative; overflow: hidden;
}
.btn-primary::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
  opacity: 0; transition: opacity 0.2s;
}
.btn-primary:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(124,106,255,0.55); }
.btn-primary:hover::after { opacity: 1; }

.btn-secondary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 16px 32px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 50px;
  color: rgba(255,255,255,0.8); font-family: 'DM Sans', sans-serif;
  font-weight: 500; font-size: 1rem;
  cursor: pointer; text-decoration: none;
  transition: all 0.2s;
}
.btn-secondary:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); color: #fff; }

.hero-social-proof {
  display: flex; align-items: center; gap: 10px;
  font-size: 0.8rem; color: var(--muted);
}
.hero-avatars {
  display: flex;
}
.hero-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid var(--bg);
  margin-left: -8px;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  display: flex; align-items: center; justify-content: center;
  font-size: 0.6rem; font-weight: 800; color: #fff;
}
.hero-avatar:first-child { margin-left: 0; }

/* ── APP MOCKUP ── */
.hero-mockup {
  position: relative;
  width: 100%; max-width: 900px;
  animation: fadeUp 0.8s 0.4s ease both;
}

.mockup-glow {
  position: absolute;
  inset: -40px;
  background: radial-gradient(ellipse at 50% 60%, rgba(124,106,255,0.25) 0%, transparent 65%);
  pointer-events: none;
}

.mockup-window {
  background: #0d0b1e;
  border: 1px solid rgba(124,106,255,0.25);
  border-radius: 20px;
  overflow: hidden;
  box-shadow:
    0 40px 100px rgba(0,0,0,0.8),
    0 0 0 1px rgba(124,106,255,0.1),
    inset 0 1px 0 rgba(255,255,255,0.05);
  position: relative;
}

.mockup-titlebar {
  display: flex; align-items: center; gap: 6px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot-r { background: #ff5f57; }
.dot-y { background: #ffbd2e; }
.dot-g { background: #28ca41; }

.mockup-titlebar-url {
  flex: 1; text-align: center;
  font-size: 0.72rem; color: rgba(255,255,255,0.25);
  font-family: 'DM Sans', sans-serif;
}

.mockup-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 360px;
}

.mockup-player {
  border-right: 1px solid var(--border);
  padding: 24px;
  display: flex; flex-direction: column; gap: 16px;
}

.mockup-header {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em;
}

.mockup-room-badge {
  display: flex; align-items: center; gap: 5px;
  background: rgba(0,201,116,0.1); border: 1px solid rgba(0,201,116,0.25);
  border-radius: 20px; padding: 3px 10px;
  font-size: 0.65rem; color: var(--green); font-weight: 600;
}

.mockup-art {
  width: 160px; height: 160px;
  border-radius: 14px;
  background: linear-gradient(135deg, #1a1535, #2d1b4e);
  margin: 0 auto;
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
  box-shadow: 0 16px 40px rgba(0,0,0,0.6);
}

.mockup-art-gradient {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(124,106,255,0.4), rgba(255,106,138,0.4));
}

.mockup-art-note {
  position: relative; font-size: 3rem; z-index: 1;
  animation: float 3s ease-in-out infinite;
}
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }

.mockup-song-info { text-align: center; }
.mockup-song-title { font-weight: 700; font-size: 0.9rem; color: #fff; }
.mockup-song-sub { font-size: 0.72rem; color: var(--muted); margin-top: 3px; }

.mockup-progress {
  height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; position: relative;
}
.mockup-progress-fill {
  height: 100%; width: 42%; border-radius: 2px;
  background: linear-gradient(90deg, var(--accent), var(--pink));
}

.mockup-controls {
  display: flex; align-items: center; justify-content: center; gap: 20px;
}
.mockup-ctrl {
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(255,255,255,0.06);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; color: var(--muted);
}
.mockup-ctrl-play {
  width: 44px; height: 44px;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  box-shadow: 0 4px 16px rgba(124,106,255,0.5);
  font-size: 1rem; color: #fff;
}

.mockup-users {
  display: flex; align-items: center; gap: 6px; justify-content: center;
}
.mockup-user-av {
  width: 22px; height: 22px; border-radius: 50%;
  border: 1.5px solid var(--bg2);
}
.mockup-user-av:nth-child(1) { background: linear-gradient(135deg,#7c6aff,#ff6a8a); }
.mockup-user-av:nth-child(2) { background: linear-gradient(135deg,#ff6a8a,#ffb86a); }
.mockup-user-av:nth-child(3) { background: linear-gradient(135deg,#6affb8,#6ab8ff); }
.mockup-user-label { font-size: 0.65rem; color: var(--muted); }
.mockup-live-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px var(--green); animation: blink 1.5s ease-in-out infinite; }

.mockup-queue {
  padding: 20px;
  display: flex; flex-direction: column; gap: 8px;
}

.mockup-queue-header {
  font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--muted); margin-bottom: 4px;
  display: flex; align-items: center; justify-content: space-between;
}

.mockup-song-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid transparent;
  transition: all 0.2s;
}
.mockup-song-item.active {
  background: rgba(124,106,255,0.1);
  border-color: rgba(124,106,255,0.25);
}

.mockup-song-thumb {
  width: 34px; height: 34px; border-radius: 7px; flex-shrink: 0;
}
.mockup-song-thumb:nth-child(1) { background: linear-gradient(135deg,#7c6aff,#ff6a8a); }

.t1 { background: linear-gradient(135deg,#7c6aff,#ff6a8a); }
.t2 { background: linear-gradient(135deg,#ff6a8a,#ffb86a); }
.t3 { background: linear-gradient(135deg,#6ab8ff,#6affb8); }
.t4 { background: linear-gradient(135deg,#ffb86a,#ff6a8a); }

.mockup-song-meta { flex: 1; min-width: 0; }
.mockup-song-name { font-size: 0.75rem; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mockup-song-by { font-size: 0.62rem; color: var(--muted); margin-top: 1px; }

.mockup-playing-anim {
  display: flex; align-items: flex-end; gap: 2px; height: 14px;
}
.mockup-playing-anim span {
  width: 3px; border-radius: 2px;
  background: var(--accent);
  animation: barAnim 0.8s ease-in-out infinite alternate;
}
.mockup-playing-anim span:nth-child(1) { height: 6px; animation-delay: 0s; }
.mockup-playing-anim span:nth-child(2) { height: 14px; animation-delay: 0.15s; }
.mockup-playing-anim span:nth-child(3) { height: 9px; animation-delay: 0.3s; }
@keyframes barAnim { from{height:4px} to{height:14px} }

/* ── FEATURES ── */
.section {
  padding: 100px 24px;
  position: relative;
}

.section-label {
  text-align: center;
  font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em;
  color: var(--accent); font-weight: 600;
  margin-bottom: 16px;
}

.section-title {
  text-align: center;
  font-family: 'Unbounded', sans-serif;
  font-weight: 900;
  font-size: clamp(1.8rem, 5vw, 3.2rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #fff 30%, #c4b5fd 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}

.section-sub {
  text-align: center;
  color: var(--muted);
  font-size: 1.05rem;
  max-width: 520px;
  margin: 0 auto 64px;
  font-weight: 300;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

.feature-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 32px;
  position: relative;
  overflow: hidden;
  transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s;
}

.feature-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
}

.feature-card:hover {
  transform: translateY(-6px);
  border-color: rgba(124,106,255,0.3);
  box-shadow: 0 20px 60px rgba(124,106,255,0.12);
}

.feature-icon {
  width: 52px; height: 52px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.5rem;
  margin-bottom: 20px;
}

.feature-card:nth-child(1) .feature-icon { background: rgba(124,106,255,0.15); }
.feature-card:nth-child(2) .feature-icon { background: rgba(255,106,138,0.15); }
.feature-card:nth-child(3) .feature-icon { background: rgba(0,201,116,0.15); }
.feature-card:nth-child(4) .feature-icon { background: rgba(255,184,106,0.15); }

.feature-card:nth-child(1):hover { box-shadow: 0 20px 60px rgba(124,106,255,0.15); }
.feature-card:nth-child(2):hover { box-shadow: 0 20px 60px rgba(255,106,138,0.12); }
.feature-card:nth-child(3):hover { box-shadow: 0 20px 60px rgba(0,201,116,0.1); }
.feature-card:nth-child(4):hover { box-shadow: 0 20px 60px rgba(255,184,106,0.1); }

.feature-title {
  font-family: 'Unbounded', sans-serif;
  font-weight: 700; font-size: 1rem;
  margin-bottom: 10px; color: #fff;
  letter-spacing: -0.01em;
}

.feature-desc {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.65;
  font-weight: 300;
}

.feature-tag {
  display: inline-block;
  margin-top: 16px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.68rem; font-weight: 600;
  background: rgba(124,106,255,0.1);
  color: #c4b5fd;
  border: 1px solid rgba(124,106,255,0.2);
}

/* ── HOW IT WORKS ── */
.how-section {
  padding: 100px 24px;
  background: radial-gradient(ellipse at 50% 0%, rgba(124,106,255,0.08) 0%, transparent 60%);
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  max-width: 900px;
  margin: 0 auto;
  position: relative;
}

.steps::before {
  content: '';
  position: absolute;
  top: 38px; left: calc(16.66% + 20px); right: calc(16.66% + 20px);
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(124,106,255,0.4), rgba(255,106,138,0.4), transparent);
}

.step {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; padding: 0 24px;
  position: relative;
}

.step-num {
  width: 76px; height: 76px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Unbounded', sans-serif;
  font-weight: 900; font-size: 1.5rem;
  margin-bottom: 24px;
  position: relative; z-index: 1;
  border: 2px solid;
  transition: transform 0.3s;
}
.step:hover .step-num { transform: scale(1.08); }

.step:nth-child(1) .step-num {
  background: rgba(124,106,255,0.12);
  border-color: rgba(124,106,255,0.4);
  color: var(--accent);
  box-shadow: 0 0 30px rgba(124,106,255,0.2);
}
.step:nth-child(2) .step-num {
  background: rgba(255,106,138,0.1);
  border-color: rgba(255,106,138,0.35);
  color: var(--pink);
  box-shadow: 0 0 30px rgba(255,106,138,0.15);
}
.step:nth-child(3) .step-num {
  background: rgba(0,201,116,0.1);
  border-color: rgba(0,201,116,0.35);
  color: var(--green);
  box-shadow: 0 0 30px rgba(0,201,116,0.15);
}

.step-title {
  font-family: 'Unbounded', sans-serif;
  font-weight: 700; font-size: 0.95rem;
  color: #fff; margin-bottom: 10px;
}

.step-desc {
  color: var(--muted); font-size: 0.88rem;
  font-weight: 300; line-height: 1.6;
}

/* ── STATS BAR ── */
.stats-bar {
  padding: 60px 24px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.stats-inner {
  display: flex; align-items: center; justify-content: center;
  gap: 0;
  max-width: 800px; margin: 0 auto;
}

.stat-item {
  flex: 1; text-align: center; padding: 0 32px;
  position: relative;
}

.stat-item + .stat-item::before {
  content: '';
  position: absolute; left: 0; top: 10%; bottom: 10%;
  width: 1px; background: var(--border);
}

.stat-num {
  font-family: 'Unbounded', sans-serif;
  font-weight: 900; font-size: 2.2rem;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
  display: block;
}

.stat-label {
  font-size: 0.8rem; color: var(--muted);
  font-weight: 300; margin-top: 4px;
  text-transform: uppercase; letter-spacing: 0.08em;
}

/* ── CTA BOTTOM ── */
.cta-section {
  padding: 120px 24px;
  text-align: center;
  position: relative; overflow: hidden;
}

.cta-section::before {
  content: '';
  position: absolute;
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(124,106,255,0.15) 0%, transparent 70%);
  top: 50%; left: 50%; transform: translate(-50%,-50%);
  pointer-events: none;
}

.cta-section::after {
  content: '';
  position: absolute;
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(255,106,138,0.1) 0%, transparent 70%);
  top: 50%; left: 30%; transform: translate(-50%,-50%);
  pointer-events: none;
}

.cta-title {
  font-family: 'Unbounded', sans-serif;
  font-weight: 900;
  font-size: clamp(2rem, 6vw, 4.5rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
  margin-bottom: 20px;
  position: relative; z-index: 1;
}

.cta-title span {
  display: block;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}

.cta-sub {
  color: var(--muted); font-size: 1.1rem;
  font-weight: 300; margin-bottom: 40px;
  position: relative; z-index: 1;
}

.cta-note {
  font-size: 0.78rem; color: rgba(255,255,255,0.25);
  margin-top: 16px;
}

/* ── FOOTER ── */
footer {
  padding: 40px 48px;
  border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 16px;
}

.footer-logo {
  font-family: 'Unbounded', sans-serif;
  font-weight: 900; font-size: 0.9rem;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}

.footer-links {
  display: flex; gap: 28px;
}

.footer-links a {
  color: var(--muted); font-size: 0.85rem;
  text-decoration: none; transition: color 0.2s;
}
.footer-links a:hover { color: #fff; }

.footer-copy {
  font-size: 0.78rem; color: rgba(255,255,255,0.2);
}

/* ── SCROLL ANIMATIONS ── */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

.reveal {
  opacity: 0; transform: translateY(30px);
  transition: opacity 0.7s ease, transform 0.7s ease;
}
.reveal.visible {
  opacity: 1; transform: translateY(0);
}
.reveal-delay-1 { transition-delay: 0.1s; }
.reveal-delay-2 { transition-delay: 0.2s; }
.reveal-delay-3 { transition-delay: 0.3s; }
.reveal-delay-4 { transition-delay: 0.4s; }

/* ── MOBILE ── */
@media (max-width: 768px) {
  nav { padding: 16px 20px; }
  .nav-links { display: none; }

  .hero { padding: 100px 20px 60px; }

  .mockup-body { grid-template-columns: 1fr; }
  .mockup-queue { display: none; }
  .mockup-player { border-right: none; }

  .steps { grid-template-columns: 1fr; gap: 40px; }
  .steps::before { display: none; }

  .stats-inner { flex-direction: column; gap: 32px; }
  .stat-item + .stat-item::before { display: none; }

  footer { flex-direction: column; align-items: flex-start; padding: 32px 20px; }
  .footer-links { flex-wrap: wrap; gap: 16px; }
}

/* ── SCROLLBAR ── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: rgba(124,106,255,0.3); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(124,106,255,0.5); }

      \`}</style>
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
    </>
  )
}
