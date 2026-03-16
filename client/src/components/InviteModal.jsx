import { useEffect, useRef, useState } from 'react'

// Lightweight QR code generator — no external library needed
// Uses the qrcode CDN via dynamic script injection
export default function InviteModal({ roomId, onClose }) {
  const canvasRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}?room=${roomId}`

  useEffect(() => {
    // Load QRCode.js from CDN
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
    script.onload = () => {
      if (canvasRef.current && window.QRCode) {
        canvasRef.current.innerHTML = ''
        new window.QRCode(canvasRef.current, {
          text: url,
          width: 200,
          height: 200,
          colorDark: '#7c6aff',
          colorLight: '#0e0c1a',
          correctLevel: window.QRCode.CorrectLevel.M,
        })
      }
    }
    document.head.appendChild(script)
    return () => { if (script.parentNode) script.parentNode.removeChild(script) }
  }, [url])

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Join my Groove room', text: `Join room ${roomId} on Groove Together`, url })
    } else {
      handleCopy()
    }
  }

  return (
    <div className="invite-overlay" onClick={onClose}>
      <div className="invite-modal" onClick={e => e.stopPropagation()}>
        <div className="invite-header">
          <div className="invite-header-left">
            <span className="invite-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            </span>
            <div>
              <p className="invite-title">Invite to Room</p>
              <p className="invite-sub">Room · {roomId}</p>
            </div>
          </div>
          <button className="invite-close" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="invite-body">
          {/* QR Code */}
          <div className="invite-qr-wrap">
            <div ref={canvasRef} className="invite-qr" />
            <p className="invite-qr-hint">Scan to join instantly</p>
          </div>

          {/* Divider */}
          <div className="invite-divider">
            <span className="invite-divider-line" />
            <span className="invite-divider-text">or share the link</span>
            <span className="invite-divider-line" />
          </div>

          {/* Link */}
          <div className="invite-link-row">
            <div className="invite-link-box">
              <span className="invite-link-text">{url}</span>
            </div>
            <button className={`invite-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
              {copied
                ? <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              }
            </button>
          </div>

          {/* Share button (native on mobile) */}
          <button className="invite-share-btn" onClick={handleShare}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
            </svg>
            {navigator.share ? 'Share with friends' : copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  )
}
