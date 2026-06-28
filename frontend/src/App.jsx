import { useState, useRef, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Toaster, toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
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

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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

const API_URL = import.meta.env.VITE_API_URL

const EXAMPLE_REPOS = [
  'https://github.com/vincentmpalma/aitomize',
]

const PROMPT_SUGGESTIONS = [
  'What does this repo do?',
  'How is this project structured?',
  'Where is authentication handled?',
  'What should I read first?',
]

function toShortName(url) {
  return url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')
}

export default function App() {
  const [dark, setDark] = useState(true)
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
  const [indexMode, setIndexMode] = useState('shared')
  const [isReposModal, setIsReposModal] = useState(false)
  const [repos, setRepos] = useState([])
  const [reposLoading, setReposLoading] = useState(false)
  const [isRepoActionsModal, setIsRepoActionsModal] = useState(false)
  const [reindexConfirm, setReindexConfirm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isAvatarDropdown, setIsAvatarDropdown] = useState(false)
  const avatarRef = useRef(null)
  const [chatId, setChatId] = useState(null)
  const [chats, setChats] = useState([])
  const [reindexing, setReindexing] = useState(false)
  const chatIdRef = useRef(null)
  const [repoSearch, setRepoSearch] = useState('')

  const indexed = indexState === 'success'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) { setChatId(null); setChats([]) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isAvatarDropdown) return
    function handleClickOutside(e) {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setIsAvatarDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isAvatarDropdown])

  useEffect(() => { chatIdRef.current = chatId }, [chatId])

  useEffect(() => {
    if (!session) return
    supabase.from('chats').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('fetchChats error:', error)
        setChats(data ?? [])
      })
  }, [session])

  async function handleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin, scopes: 'repo' }
    })
  }

  function resetToHome() {
    setIndexState('idle')
    setIndexedRepo('')
    setMessages([])
    setHistory([])
    setChatId(null)
    setIndexMode('shared')
    setRepoInput('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    resetToHome()
  }

  async function handleDeleteChat() {
    setIsRepoActionsModal(false)
    setDeleteConfirm(false)
    if (chatId) {
      await supabase.from('chats').delete().eq('id', chatId)
      setChats(prev => prev.filter(c => c.id !== chatId))
    }
    if (indexedRepo && session) {
      await supabase.from('documents').delete().eq('repo_url', indexedRepo).eq('user_id', session.user.id)
    }
    resetToHome()
  }

  async function openRepos(){
    if (!session){
      console.log("false")
      toast('Sign in to view your repos')
    } else{
      setIsReposModal(true)
      setReposLoading(true)
       try {
      const res = await fetch(`${API_URL}/repos`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'X-Provider-Token': session.provider_token ?? ''
        }
      })
      const data = await res.json()
      if (!Array.isArray(data.repos)) {
        toast.error('Failed to load repos')
        setReposLoading(false)
        return
      }
      setRepos(data.repos)
    } catch {
      toast.error('Failed to load repos')
    } finally {
      setReposLoading(false)
    }
    }
  }

  function closeRepos() {
    setIsReposModal(false)
    setRepos([])
    setRepoSearch('')
  }

  async function createChat(repoUrl, isPersonal) {
    if (!session) return null
    const { data, error } = await supabase.from('chats').insert({
      user_id: session.user.id,
      repo_url: repoUrl,
      title: toShortName(repoUrl),
      is_personal: isPersonal
    }).select().single()
    if (error) console.error('createChat error:', error)
    if (data) setChats(prev => [data, ...prev])
    return data?.id ?? null
  }

  async function loadChat(chat) {
    const { data: msgs, error } = await supabase.from('messages').select('*').eq('chat_id', chat.id).order('created_at')
    if (error) console.error('loadChat error:', error)
    setMessages((msgs ?? []).map(m => ({ role: m.role, text: m.content })))
    setHistory((msgs ?? []).map(m => ({ role: m.role, content: m.content })))
    setIndexedRepo(chat.repo_url)
    setIndexMode(chat.is_personal ? 'personal' : 'shared')
    setChatId(chat.id)
    setIndexState('success')
  }

  async function handleIndex(force = false) {
    if (!repoInput.trim() || indexState === 'indexing') return
    if (session) {
      await handleIndexPersonal(force ? indexedRepo : repoInput.trim(), force)
      return
    }
    setIndexState('indexing')
    try {
      const res = await fetch(`${API_URL}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: force ? indexedRepo : repoInput.trim(), force })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setIndexState('idle')
        toast.error(err.detail || 'Indexing failed. Please try again.')
        return
      }
      const data = await res.json()
      if (data.status === 'indexed' || data.status === 'already_indexed') {
        const repoUrl = force ? indexedRepo : repoInput.trim()
        setIndexedRepo(repoUrl)
        setIndexState('success')
        setIndexMode('shared')
        if (force) {
          setMessages([])
          setHistory([])
          if (chatId) await supabase.from('messages').delete().eq('chat_id', chatId)
        } else {
          setMessages([])
          setHistory([])
          const id = await createChat(repoUrl, false)
          setChatId(id)
        }
      } else {
        setIndexState('failed')
      }
    } catch (err) {
      console.error('Indexing error:', err)
      setIndexState('failed')
    }
  }

  async function handleIndexPersonal(repoUrl, force = false) {
    if (reindexing || indexState === 'indexing') return
    if (force) {
      setReindexing(true)
    } else {
      setIndexState('indexing')
    }
    try {
      const body = { repo_url: repoUrl, force }
      if (session?.provider_token) body.provider_token = session.provider_token
      const res = await fetch(`${API_URL}/ingest-personal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (!force) setIndexState('idle')
        else setReindexing(false)
        toast.error(err.detail || 'Indexing failed. Please try again.')
        return
      }
      const data = await res.json()
      if (data.status === 'indexed' || data.status === 'already_indexed') {
        setIndexedRepo(repoUrl)
        setIndexState('success')
        setIndexMode('personal')
        if (!force) {
          setMessages([])
          setHistory([])
          const id = await createChat(repoUrl, true)
          setChatId(id)
        }
      } else {
        if (!force) setIndexState('failed')
        else toast.error('Re-indexing failed. Please try again.')
      }
    } catch (err) {
      console.error('Indexing error:', err)
      if (!force) setIndexState('failed')
      else toast.error('Re-indexing failed. Please try again.')
    } finally {
      if (force) setReindexing(false)
    }
  }

  function handleRepoKeyDown(e) {
    if (e.key === 'Enter') handleIndex()
  }

  async function handleSend(overrideText) {
    const text = typeof overrideText === 'string' ? overrideText : chatInput.trim()
    if (!indexed || !text || reindexing) return
    const activeChatId = chatId
    const userMsg = { role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setChatInput('')
    setIsTyping(true)
    if (activeChatId) {
      const { error } = await supabase.from('messages').insert({ chat_id: activeChatId, role: 'user', content: userMsg.text })
      if (error) console.error('save user message error:', error)
    }
    try {
      const isPersonal = indexMode === 'personal'
      const endpoint = isPersonal ? `${API_URL}/query-personal` : `${API_URL}/query`
      const sourcesEndpoint = isPersonal ? `${API_URL}/sources-personal` : `${API_URL}/sources`
      const headers = { 'Content-Type': 'application/json' }
      if (isPersonal) headers['Authorization'] = `Bearer ${session.access_token}`

      const sourcesPromise = fetch(sourcesEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: userMsg.text, repo_url: indexedRepo })
      }).then(r => r.json()).catch(() => ({ sources: [] }))

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: userMsg.text, repo_url: indexedRepo, history })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setIsTyping(false)
        setMessages(prev => prev.slice(0, -1))
        toast.error(err.detail || 'Something went wrong. Please try again.')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      setIsTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', text: '' }])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        if (chatIdRef.current === activeChatId) {
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', text: fullText }
            return updated
          })
        }
      }
      const { sources } = await sourcesPromise
      if (chatIdRef.current === activeChatId) {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', text: fullText, sources: sources ?? [] }
          return updated
        })
        setHistory(prev => [
          ...prev,
          { role: 'user', content: userMsg.text },
          { role: 'assistant', content: fullText }
        ])
      }
      if (activeChatId) {
        const { error } = await supabase.from('messages').insert({ chat_id: activeChatId, role: 'assistant', content: fullText })
        if (error) console.error('save assistant message error:', error)
      }
    } catch {
      setIsTyping(false)
      if (chatIdRef.current === activeChatId) {
        setMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please try again.' }])
      }
    }
  }

  function handleChatKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const repoShortName = toShortName(indexedRepo)

  return (
    <div className="app">
      <aside className={`sidebar${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <div className="sidebar-header">
          {sidebarOpen && (
            <button className="sidebar-brand" onClick={resetToHome}>
              <img
                src={dark ? '/aitomize_logo_DARK.png' : '/aitomize_logo_LIGHT.png'}
                alt="Aitomize logo"
                className="sidebar-logo"
              />
              <span className="wordmark sidebar-wordmark">Aitomize</span>
            </button>
          )}
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar">
            <ChevronIcon collapsed={!sidebarOpen} />
          </button>
        </div>
        {sidebarOpen && (
          <>
            <span className="sidebar-title">History</span>
            {session ? (
              chats.length === 0 ? (
                <span className="sidebar-empty">No chats yet</span>
              ) : (
                chats.map(chat => (
                  <button
                    key={chat.id}
                    className={`sidebar-chat-item${chatId === chat.id ? ' active' : ''}`}
                    onClick={() => loadChat(chat)}
                  >
                    <span className="sidebar-chat-title">{chat.title.split('/').slice(1).join('/') || chat.title}</span>
                  </button>
                ))
              )
            ) : (
              <button className="sidebar-signin-row" onClick={handleLogin}>
                <span>Sign in to save history</span>
                <span className="sidebar-signin-chevron">›</span>
              </button>
            )}
          </>
        )}
      </aside>
        <Toaster 
        position="top-center" 
        theme={dark ? 'dark' : 'light'}
            toastOptions={{
      style: {
        textAlign: 'center',
        alignItems: 'center',
        justifyContent: 'center',
      }
    }}
        
        />
      <div className="main-column">
        {(indexState === 'indexing' || reindexing) && (
          <>
            <div className="index-progress-bar"><div className="index-progress-fill" /></div>
            <p className="index-progress-hint">Large repositories may take a few minutes to index.</p>
          </>
        )}
        <nav className="navbar">
  
          <div className="navbar-side" />
          <div className="navbar-center">
            {indexed && (
              <button className="indexed-badge indexed-badge-btn" onClick={() => setIsRepoActionsModal(true)} disabled={indexState === 'indexing' || reindexing}>
                {(indexState === 'indexing' || reindexing) ? <><Spinner /><span className="indexed-label">{reindexing ? 'Re-indexing…' : 'Indexing…'}</span></> : <><span className="indexed-label">{repoShortName}</span><span className="indexed-chevron">›</span></>}
              </button>
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
              <div className="avatar-menu" ref={avatarRef}>
                <button className="avatar-btn" onClick={() => setIsAvatarDropdown(d => !d)}>
                  <img src={session.user.user_metadata.avatar_url} className="user-avatar" alt="avatar" />
                </button>
                {isAvatarDropdown && (
                  <div className="avatar-dropdown">
                    <button className="avatar-dropdown-item" onClick={() => { setIsAvatarDropdown(false); openRepos() }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                      My Repos
                    </button>
                    <div className="avatar-dropdown-divider" />
                    <button className="avatar-dropdown-item destructive" onClick={() => { setIsAvatarDropdown(false); handleLogout() }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="signin-btn" onClick={handleLogin}>
                <GitHubIcon /> Sign in
              </button>
            )}
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
              <button
                className="example-repo-btn"
                onClick={() => {
                  const filtered = EXAMPLE_REPOS.filter(r => r !== repoInput)
                  const pool = filtered.length ? filtered : EXAMPLE_REPOS
                  setRepoInput(pool[Math.floor(Math.random() * pool.length)])
                }}
                disabled={indexState === 'indexing'}
              >
                Try an example
              </button>
            </div>
          </div>
        ) : (
          <main className="chat-area">
            {messages.length === 0 && (
              <div className="empty-state">
                <p className="empty-hint">Ask anything about your codebase.</p>
                <div className="prompt-suggestions">
                  {PROMPT_SUGGESTIONS.map(p => (
                    <button key={p} className="prompt-pill" onClick={() => handleSend(p)} disabled={reindexing}>
                      {p}
                    </button>
                  ))}
                </div>
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
                    <div className="ai-card">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="source-pills">
                          {msg.sources.slice(0, 5).map((s, j) => (
                            <span key={j} className="source-pill">
                              {s.file.split('/').pop()}{s.start ? `:${s.start}–${s.end}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
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
                disabled={reindexing}
              />
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!chatInput.trim() || reindexing}
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </div>
          </main>
        )}
      </div>

        {
          isReposModal && (
            <div className="modal-backdrop" onClick={closeRepos}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-top">
            <div className="modal-header-spacer" />
            <span className="modal-title">Your Repositories</span>
            <button className="modal-close" onClick={closeRepos}>Done</button>
          </div>
          <span className="modal-disclaimer">
            Private repos are only accessible to your account, but all indexed code is stored in Aitomize's database. Avoid indexing sensitive repositories.
          </span>
          <input
            className="modal-search"
            type="text"
            placeholder="Search repositories…"
            value={repoSearch}
            onChange={e => setRepoSearch(e.target.value)}
            autoFocus={!reposLoading}
          />
        </div>
        <div className="modal-body">
          {reposLoading ? (
            <div className="modal-loading"><Spinner /></div>
          ) : (() => {
            const filtered = repos.filter(r =>
              r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
              (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase()))
            )
            return filtered.length === 0 ? (
              <p className="modal-no-results">No repositories match "{repoSearch}"</p>
            ) : filtered.map(repo => (
              <button
                key={repo.id}
                className="repo-row"
                onClick={() => {
                  closeRepos()
                  handleIndexPersonal(repo.html_url)
                }}
              >
                <div className="repo-row-content">
                  <span className="repo-name">
                    {repo.full_name}
                    {repo.private && <span className="repo-private-badge">Private</span>}
                  </span>
                  {repo.description && <span className="repo-desc">{repo.description}</span>}
                </div>
                <span className="repo-chevron">›</span>
              </button>
            ))
          })()}
        </div>
        <div className="modal-body-fade" />
      </div>
    </div>
          )
        }

        {isRepoActionsModal && (
          <div className="modal-backdrop" onClick={() => { setIsRepoActionsModal(false); setReindexConfirm(false); setDeleteConfirm(false) }}>
            <div className="modal repo-actions-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-top">
                  <div className="modal-header-spacer" />
                  <div className="repo-actions-titles">
                    <span className="repo-actions-subtitle">Repository</span>
                    <span className="modal-title">{repoShortName}</span>
                  </div>
                  <button className="modal-close" onClick={() => { setIsRepoActionsModal(false); setReindexConfirm(false); setDeleteConfirm(false) }}>Cancel</button>
                </div>
              </div>
              <div className="modal-body">
                {reindexConfirm ? (
                  <div className="repo-actions-confirm">
                    <p className="repo-actions-confirm-title">Re-index Repository?</p>
                    <p className="repo-actions-confirm-desc">Re-fetch the repository and rebuild its embeddings. This will clear the current chat.</p>
                    <div className="repo-actions-confirm-btns">
                      <button className="repo-actions-confirm-cancel" onClick={() => setReindexConfirm(false)}>Cancel</button>
                      <button className="repo-actions-confirm-go" onClick={() => {
                        setIsRepoActionsModal(false)
                        setReindexConfirm(false)
                        indexMode === 'personal' ? handleIndexPersonal(indexedRepo, true) : handleIndex(true)
                      }}>Re-index</button>
                    </div>
                  </div>
                ) : deleteConfirm ? (
                  <div className="repo-actions-confirm">
                    <p className="repo-actions-confirm-title">Delete Chat?</p>
                    <p className="repo-actions-confirm-desc">This will permanently delete this chat and all indexed data for this repository.</p>
                    <div className="repo-actions-confirm-btns">
                      <button className="repo-actions-confirm-cancel" onClick={() => setDeleteConfirm(false)}>Cancel</button>
                      <button className="repo-actions-confirm-go destructive" onClick={handleDeleteChat}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <div className="repo-actions-list">
                    <button className="repo-action-row" onClick={() => setReindexConfirm(true)}>
                      <div className="repo-action-icon">↺</div>
                      <div className="repo-action-text">
                        <span className="repo-action-label">Re-index Repository</span>
                        <span className="repo-action-desc">Re-fetch the repository and rebuild its embeddings.</span>
                      </div>
                    </button>
                    {session && (
                      <button className="repo-action-row destructive" onClick={() => setDeleteConfirm(true)}>
                        <div className="repo-action-icon">🗑</div>
                        <div className="repo-action-text">
                          <span className="repo-action-label">Delete Chat</span>
                          <span className="repo-action-desc">Remove this chat and all indexed data for this repository.</span>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

    </div>
  )
}
