# Aitomize

Aitomize is a full-stack AI codebase assistant that lets users ask natural-language questions about GitHub repositories.

Users can index a public repository by URL or sign in with GitHub to access their own repositories. Aitomize fetches the codebase, breaks files into searchable chunks, generates vector embeddings, and retrieves relevant code context to answer questions through a ChatGPT-style interface.

> Current status: local development / pre-deployment. A live demo will be added after deployment.

---

## Features

- Natural-language Q&A over GitHub repositories
- Public repository indexing by URL
- Private repository support through GitHub OAuth
- Repository picker for authenticated users
- Persistent repo-specific chat history
- Streaming AI responses
- Markdown-rendered answers
- Repository re-indexing support
- Light/dark mode interface
- Private repo warning and access-aware UI

---

## How It Works

1. A user enters a GitHub repository URL or selects one of their GitHub repositories.
2. Aitomize fetches supported source/config files from the repository.
3. Files are split into overlapping chunks to preserve context across nearby lines of code.
4. Each chunk is embedded using OpenAI embeddings.
5. Embeddings and code chunks are stored in Supabase.
6. When the user asks a question, Aitomize embeds the query and performs vector similarity search to retrieve relevant code chunks.
7. Retrieved chunks are passed as context to the language model, which streams a repo-specific answer back to the user.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | FastAPI, Python |
| Database | Supabase, PostgreSQL, pgvector |
| AI | OpenAI Embeddings, GPT-4o-mini |
| Authentication | Supabase Auth, GitHub OAuth |
| APIs | GitHub API, OpenAI API, Supabase API |

---

## Architecture Overview

```
React Chat Interface (user enters question)
        |
        v
FastAPI Backend
        |
        v
OpenAI Embeddings (query)
        |
        v
Supabase pgvector — Vector Similarity Search
        |
        v
File Chunks (retrieved context)
        |
        v
GPT-4o-mini (streams answer)
        |
        v
React Chat Interface (displays response)
```

Indexing flow (one-time per repository):

```
GitHub Repository
        |
        v
FastAPI Backend — File Filtering + Chunking
        |
        v
OpenAI Embeddings
        |
        v
Supabase pgvector Storage
```

---

## Getting Started

### Prerequisites

- Node.js
- Python 3.9+
- Supabase project with pgvector enabled
- OpenAI API key
- GitHub OAuth app (configured in Supabase Auth)

### Backend Environment Variables

Create a `.env` file in the `backend/` directory:

```env
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
GITHUB_TOKEN=
```

### Frontend Environment Variables

Create a `.env` file in the `frontend/` directory:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

> GitHub OAuth is handled entirely through Supabase Auth. Configure your GitHub OAuth app credentials (Client ID and Secret) in the Supabase dashboard under Authentication → Providers → GitHub. No `VITE_GITHUB_CLIENT_ID` is needed in the frontend.

---

## Run Locally

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`

---

## Private Repository Notice

Aitomize supports private repository indexing for authenticated GitHub users. Private repositories are only accessible through the user's authenticated session, but indexed code is stored in the application database. Users should avoid indexing repositories that contain secrets, credentials, sensitive business logic, or confidential information.

---

## Current Limitations

- File and line-number citations are planned but not yet implemented
- Repository search inside the repo picker is planned
- Error handling and rate limiting are still being improved
- The current version is optimized for development and has not yet been deployed publicly
- Indexing large repositories may take several minutes

---

## Future Improvements

- Source citations with file names and line numbers
- Search/filtering inside the My Repos modal
- Better error handling for GitHub, OpenAI, and Supabase failures
- Rate limiting for API protection and cost control
- Delete chat functionality with confirmation
- Example prompt chips for newly indexed repositories
- Production deployment with environment-based API configuration
- Basic backend test coverage for chunking, ingestion, authentication, and query behavior

---

## Why "Aitomize"?

The name combines **AI** with **atomize**. Aitomize breaks a codebase into smaller pieces — files, chunks, embeddings, and numerical vectors — so the system can search and reason over the repository more effectively.

The name also nods to pre-Socratic atomism: the idea that complex things can be understood by breaking them down into smaller fundamental parts.
