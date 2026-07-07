# Aitomize

Aitomize is a deployed full-stack AI codebase assistant that lets users ask natural-language questions about GitHub repositories and receive streamed answers grounded in the repository's actual source code.

**Live demo: [aitomize.app](https://aitomize.app)**

---

## Project Highlights

- Built a full-stack AI application with React, FastAPI, Supabase, PostgreSQL/pgvector, OpenAI, and GitHub OAuth
- Implemented repository ingestion for public and private GitHub repositories
- Designed an AST-aware chunking pipeline with tree-sitter to improve code retrieval quality
- Added vector similarity search over embedded code chunks using Supabase pgvector
- Optimized repository indexing by replacing sequential OpenAI embedding calls with batched requests
- Implemented streaming AI responses with markdown rendering and source citations
- Deployed production frontend and backend using AWS S3, CloudFront, EC2, Nginx, and Route 53

---

## What It Does

Users enter a public GitHub repository URL or sign in with GitHub to access their own repositories. Aitomize fetches the codebase, splits files into chunks using AST-aware parsing, generates vector embeddings, and retrieves relevant code context to answer questions through a streaming chat interface.

The goal is to help developers quickly understand unfamiliar codebases without manually searching through files.

---

## Features

- Natural-language Q&A over GitHub repositories
- Public repository indexing by URL
- Private repository support through GitHub OAuth
- Repository picker for authenticated users
- AST-aware chunking with tree-sitter for higher-quality retrieval
- Source citations with file names and line numbers
- Persistent chat history per repository
- Streaming AI responses with markdown rendering
- IP-based rate limiting for anonymous users
- Repository re-indexing support

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | FastAPI, Python |
| Database | Supabase, PostgreSQL, pgvector |
| AI | OpenAI Embeddings, GPT-4o-mini |
| Authentication | Supabase Auth, GitHub OAuth |
| Infrastructure | AWS EC2, S3, CloudFront, Route 53 |

---

## Architecture Overview

```
React (aitomize.app via CloudFront + S3)
        |
        v
FastAPI Backend (api.aitomize.app via EC2 + Nginx)
        |
        v
OpenAI Embeddings (query embedding)
        |
        v
Supabase pgvector — Vector Similarity Search
        |
        v
Retrieved Code Chunks (context)
        |
        v
GPT-4o-mini (streams answer back to user)
```

Indexing flow (one-time per repository):

```
GitHub Repository
        |
        v
FastAPI — File Filtering + AST Chunking (tree-sitter)
        |
        v
OpenAI Embeddings
        |
        v
Supabase pgvector Storage
```

---

## Deployment

- **Frontend** — React SPA built with Vite, served via AWS CloudFront CDN with a private S3 origin
- **Backend** — FastAPI on AWS EC2 (Ubuntu, t3.small) behind Nginx reverse proxy with Let's Encrypt HTTPS
- **Database** — Supabase (PostgreSQL + pgvector) for embeddings, auth, and chat history
- **DNS** — AWS Route 53 with `aitomize.app` → CloudFront and `api.aitomize.app` → EC2

---

## Run Locally

### Prerequisites

- Node.js
- Python 3.9+
- Supabase project with pgvector enabled
- OpenAI API key
- GitHub OAuth app configured in Supabase Auth

### Backend

Create `backend/.env`:

```env
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_KEY=
GITHUB_TOKEN=
FRONTEND_URL=http://localhost:5173
```

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

Create `frontend/.env`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:8000
```

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

> GitHub OAuth is handled through Supabase Auth. Configure your GitHub OAuth app credentials in the Supabase dashboard under Authentication → Providers → GitHub.

---

## Private Repository Notice

Private repositories are only accessible through the user's authenticated GitHub session. Indexed code is stored in the application database. Avoid indexing repositories that contain secrets, credentials, or confidential information.
