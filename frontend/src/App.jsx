import { useState, useRef, useEffect } from 'react'
import { supabase } from './supabaseClient'
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="4" />
      <polyline points="5 11 12 4 19 11" />
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

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
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
  const [isTyping, setIsTyping] = useState(false)
  const [history, setHistory] = useState([])
  const messagesEndRef = useRef(null)
  const [session, setSession] = useState(null)

  const indexed = indexState === 'success'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin }
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function handleIndex(force = false) {
    if (!repoInput.trim() || indexState === 'indexing') return
    setIndexState('indexing')
    try {
      const res = await fetch('http://localhost:8000/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: force ? indexedRepo : repoInput.trim(), force })
      })
      const data = await res.json()
      console.log("data.status from ingest is: " + data.status)
      if (data.status === 'indexed' || data.status === 'already_indexed') {
        setIndexedRepo(force ? indexedRepo : repoInput.trim())
        setIndexState('success')
        if (force) {
          setMessages([])
          setHistory([])
        }
      } else {
        setIndexState('failed')
      }
    } catch (err) {
      console.error('Indexing error:', err)
      setIndexState('failed')
    }
  }

  function handleRepoKeyDown(e) {
    if (e.key === 'Enter') handleIndex()
  }

  async function handleSend() {
    if (!indexed || !chatInput.trim()) return
    const userMsg = { role: 'user', text: chatInput.trim() }
    setMessages(prev => [...prev, userMsg])
    setChatInput('')
    setIsTyping(true)
    try {
      const res = await fetch('http://localhost:8000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMsg.text,
          repo_url: indexedRepo,
          history: history
        })
      })
      const data = await res.json()
      const answer = data.answer
      setIsTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', text: answer }])
      setHistory(prev => [
        ...prev,
        { role: 'user', content: userMsg.text },
        { role: 'assistant', content: answer }
      ])
    } catch {
      setIsTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please try again.' }])
    }
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
          {sidebarOpen && (
            <div className="sidebar-brand">
              <img
                src={dark ? '/aitomize_logo_DARK.png' : '/aitomize_logo_LIGHT.png'}
                alt="Aitomize logo"
                className="sidebar-logo"
              />
              <span className="wordmark sidebar-wordmark">Aitomize</span>
            </div>
          )}
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar">
            <ChevronIcon collapsed={!sidebarOpen} />
          </button>
        </div>
        {sidebarOpen && (
          <>
            <span className="sidebar-title">History</span>
            <span className="sidebar-coming-soon"><span className="coming-soon-tag">Coming soon</span></span>
          </>
        )}
      </aside>

      <div className="main-column">
        <nav className="navbar">
          <div className="navbar-side" />
          <div className="navbar-center">
            {indexed && (
              <div className="navbar-indexed-row">
                <div className="indexed-badge">
                  <span className="indexed-label">{repoShortName}</span>
                </div>
                <button className="reindex-btn" onClick={() => handleIndex(true)} disabled={indexState === 'indexing'}>
                  {indexState === 'indexing' ? <Spinner /> : <>Re-index <span className="reindex-chevron">›</span></>}
                </button>
              </div>
            )}
            {indexState === 'failed' && (
              <div className="indexed-badge">
                <span className="status-dot red" />
                <span className="indexed-label">Indexing failed — try again</span>
              </div>
            )}
          </div>
          <div className="navbar-right">
            {session ? (
              <>
                <img src={session.user.user_metadata.avatar_url} className="user-avatar" alt="avatar" />
                <button className="logout-btn" onClick={handleLogout}>Sign out</button>
              </>
            ) : (
              <button className="signin-btn" onClick={handleLogin}>
                <GitHubIcon /> Sign in
              </button>
            )}
            <button className="theme-toggle" onClick={() => setDark(d => !d)} aria-label="Toggle theme">
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </nav>

        {!indexed ? (
          <div className="landing">
            <div className="landing-card">
              <div className="landing-brand">
                <img
                  src={dark ? '/aitomize_logo_DARK.png' : '/aitomize_logo_LIGHT.png'}
                  alt="Aitomize"
                  className="landing-logo"
                />
                <h1 className="landing-title">Aitomize</h1>
              </div>
              <p className="landing-subtitle">Ask anything about any codebase.</p>
              <p className="landing-label">Enter a GitHub repository</p>
              <div className="landing-input-row">
                <input
                  className="landing-input"
                  type="text"
                  placeholder="github.com/owner/repo"
                  value={repoInput}
                  onChange={e => setRepoInput(e.target.value)}
                  onKeyDown={handleRepoKeyDown}
                  disabled={indexState === 'indexing'}
                  spellCheck={false}
                  autoFocus
                />
              </div>
              <button
                className="landing-btn"
                onClick={() => handleIndex()}
                disabled={!repoInput.trim() || indexState === 'indexing'}
              >
                {indexState === 'indexing' ? <><Spinner /> Indexing…</> : 'Index Repository'}
              </button>
              {indexState === 'failed' && (
                <p className="landing-error">Indexing failed. Please check the URL and try again.</p>
              )}
            </div>
          </div>
        ) : (
          <main className="chat-area">
            {messages.length === 0 && (
              <div className="empty-state">
                <p className="empty-hint">Ask anything about your codebase.</p>
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
              {isTyping && (
                <div className="message-row ai-row">
                  <div className="typing-bubble">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-bar">
              <textarea
                className="chat-textarea"
                placeholder="Ask about your codebase…"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                rows={1}
              />
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!chatInput.trim()}
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
