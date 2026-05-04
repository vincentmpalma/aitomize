import { useState, useRef, useEffect } from 'react'
import './App.css'

function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function ChevronIcon({ collapsed }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s' }}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export default function App() {
  const [dark, setDark] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [repoInput, setRepoInput] = useState('')
  const [indexState, setIndexState] = useState('idle')
  const [indexedRepo, setIndexedRepo] = useState('')
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const messagesEndRef = useRef(null)

  const indexed = indexState === 'success'
  const chatEnabled = indexed

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleIndex() {
    if (!repoInput.trim() || indexState === 'indexing') return
    setIndexState('indexing')
    setTimeout(() => {
      if (repoInput.toLowerCase().includes('fail')) {
        setIndexState('failed')
      } else {
        setIndexedRepo(repoInput.trim())
        setIndexState('success')
      }
    }, 2000)
  }

  function handleRepoKeyDown(e) {
    if (e.key === 'Enter') handleIndex()
  }

  function handleSend() {
    if (!chatEnabled || !chatInput.trim()) return
    const userMsg = { role: 'user', text: chatInput.trim() }
    setMessages(prev => [...prev, userMsg])
    setChatInput('')
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `I've analyzed the indexed repository and I'm ready to help. You asked: "${userMsg.text}"`,
        },
      ])
    }, 1200)
  }

  function handleChatKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const repoShortName = indexedRepo.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')

  return (
    <div className="app">
      <aside className={`sidebar${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <div className="sidebar-header">
          {sidebarOpen && <span className="wordmark sidebar-wordmark">Aitomize</span>}
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar">
            <ChevronIcon collapsed={!sidebarOpen} />
          </button>
        </div>
        {sidebarOpen && (
          <>
            <span className="sidebar-title">History</span>
            <span className="sidebar-coming-soon">Coming soon</span>
          </>
        )}
      </aside>

      <div className="main-column">
      <nav className="navbar">
        <div className="navbar-side" />
        <div className="navbar-center">
          {indexState === 'success' ? (
            <div className="indexed-badge">
              <span className="status-dot green" />
              <span className="indexed-label">{repoShortName} indexed</span>
            </div>
          ) : indexState === 'failed' ? (
            <div className="indexed-badge">
              <span className="status-dot red" />
              <span className="indexed-label">Indexing failed</span>
            </div>
          ) : (
            <div className="repo-input-group">
              <input
                className="repo-input"
                type="text"
                placeholder="github.com/owner/repo"
                value={repoInput}
                onChange={e => setRepoInput(e.target.value)}
                onKeyDown={handleRepoKeyDown}
                disabled={indexState === 'indexing'}
                spellCheck={false}
              />
              <button
                className="index-btn"
                onClick={handleIndex}
                disabled={!repoInput.trim() || indexState === 'indexing'}
              >
                {indexState === 'indexing' ? <Spinner /> : 'Index'}
              </button>
            </div>
          )}
        </div>

        <button className="theme-toggle" onClick={() => setDark(d => !d)} aria-label="Toggle theme">
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </nav>

      <main className="chat-area">
        {messages.length === 0 && (
          <div className="empty-state">
            <p className="empty-hint">
              {indexed ? 'Ask anything about your codebase.' : 'Index a repository to get started.'}
            </p>
            <p className="empty-sub">
              {indexed ? 'Powered by your indexed repo' : 'Paste a GitHub URL above and click Index'}
            </p>
          </div>
        )}

        <div className="messages">
          {messages.map((msg, i) =>
            msg.role === 'user' ? (
              <div key={i} className="message-row user-row">
                <div className="bubble user-bubble">{msg.text}</div>
              </div>
            ) : (
              <div key={i} className="message-row ai-row">
                <div className="ai-card">{msg.text}</div>
              </div>
            )
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className={`chat-input-bar${chatEnabled ? '' : ' dimmed'}`}>
          <textarea
            className="chat-textarea"
            placeholder="Ask about your codebase…"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            disabled={!chatEnabled}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!chatEnabled || !chatInput.trim()}
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>
      </main>
      </div>
    </div>
  )
}
