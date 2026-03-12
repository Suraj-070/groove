import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0f', color: '#fff', fontFamily: 'Outfit, sans-serif',
          gap: 16, padding: 24, textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <h2 style={{ margin: 0, fontFamily: 'Unbounded, sans-serif', fontSize: '1.2rem' }}>
            Something went wrong
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: '0.85rem', maxWidth: 400 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#7c6aff', border: 'none', borderRadius: 10,
              color: '#fff', fontFamily: 'Outfit, sans-serif', fontWeight: 600,
              fontSize: '0.9rem', padding: '10px 24px', cursor: 'pointer', marginTop: 8
            }}
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
