from fastapi import FastAPI, Depends, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
from supabase import create_client
from typing import Optional
from collections import defaultdict
from datetime import datetime, timedelta
import threading
import requests
import os
import base64
import re
from dotenv import load_dotenv
from tree_sitter import Language, Parser
from openai import RateLimitError as OpenAIRateLimitError

load_dotenv()

# --- AST chunking setup ---

_TS_LANGUAGES: dict[str, Language] = {}

def _try_load(name: str, factory):
    try:
        _TS_LANGUAGES[name] = Language(factory())
    except Exception as e:
        print(f"[tree-sitter] skipping '{name}': {e}")

_try_load('python',     lambda: __import__('tree_sitter_python').language())
_try_load('javascript', lambda: __import__('tree_sitter_javascript').language())
_try_load('go',         lambda: __import__('tree_sitter_go').language())
_try_load('rust',       lambda: __import__('tree_sitter_rust').language())
_try_load('java',       lambda: __import__('tree_sitter_java').language())
_try_load('c',          lambda: __import__('tree_sitter_c').language())
_try_load('cpp',        lambda: __import__('tree_sitter_cpp').language())
_try_load('ruby',       lambda: __import__('tree_sitter_ruby').language())

try:
    import tree_sitter_typescript as _tst
    _TS_LANGUAGES['typescript'] = Language(_tst.language_typescript())
    _TS_LANGUAGES['tsx']        = Language(_tst.language_tsx())
except Exception as e:
    print(f"[tree-sitter] skipping typescript: {e}")

EXT_TO_LANG = {
    '.py': 'python',
    '.js': 'javascript', '.jsx': 'javascript',
    '.ts': 'typescript', '.tsx': 'tsx',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c', '.h': 'c',
    '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp',
    '.rb': 'ruby',
}

CHUNK_NODE_TYPES: dict[str, set[str]] = {
    'python':     {'function_definition', 'decorated_definition'},
    'javascript': {'function_declaration', 'method_definition'},
    'typescript': {'function_declaration', 'method_definition'},
    'tsx':        {'function_declaration', 'method_definition'},
    'go':         {'function_declaration', 'method_declaration'},
    'rust':       {'function_item'},
    'java':       {'method_declaration', 'constructor_declaration'},
    'c':          {'function_definition'},
    'cpp':        {'function_definition'},
    'ruby':       {'method', 'singleton_method'},
}

MAX_AST_CHUNK_LINES = 80

BATCH_EMBEDDINGS = True

# --- Rate limiting ---
RATE_WINDOW_SECONDS = 86_400  # 24 hours

ANON_INDEX_LIMIT = 5    # anon: repo indexes per day
ANON_QUERY_LIMIT = 100  # anon: messages per day
USER_INDEX_LIMIT = 5    # signed-in: repo indexes per day
USER_QUERY_LIMIT = 100  # signed-in: messages per day

class _RateLimiter:
    def __init__(self):
        self._store: dict[str, list] = defaultdict(list)
        self._lock = threading.Lock()

    def is_allowed(self, key: str, limit: int, window: int) -> bool:
        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=window)
        with self._lock:
            self._store[key] = [t for t in self._store[key] if t > cutoff]
            if len(self._store[key]) >= limit:
                return False
            self._store[key].append(now)
            return True

_limiter = _RateLimiter()

def _get_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

class IngestRequest(BaseModel):
    repo_url: str
    force: bool = False

class IngestPersonalRequest(BaseModel):
    repo_url: str
    force: bool = False
    provider_token: Optional[str] = None

class QueryRequest(BaseModel):
    question: str
    repo_url: str
    history: list

    def trimmed_history(self):
        return self.history[-20:]

class SourcesRequest(BaseModel):
    question: str
    repo_url: str

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_methods=["*"],
    allow_headers=["*"],
)

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    try:
        user = supabase.auth.get_user(token)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/health")
def health():
    return {"status": "ok"}

def _line_chunk(path, content, chunk_size=30, overlap=5):
    lines = content.split("\n")
    chunks = []
    i = 0
    while i < len(lines):
        chunks.append({"path": path, "content": "\n".join(lines[i:i + chunk_size])})
        i += chunk_size - overlap
    return chunks

def _ast_chunk(path, content, lang_name):
    lang = _TS_LANGUAGES[lang_name]
    parser = Parser(lang)
    tree = parser.parse(bytes(content, 'utf-8'))
    target_types = CHUNK_NODE_TYPES.get(lang_name, set())
    lines = content.split('\n')
    chunks = []

    def walk(node):
        if node.type in target_types:
            start = node.start_point[0]
            end = node.end_point[0] + 1
            node_lines = lines[start:end]
            if len(node_lines) > MAX_AST_CHUNK_LINES:
                chunks.extend(_line_chunk(path, "\n".join(node_lines)))
            else:
                chunks.append({
                    "path": path,
                    "content": f"# {path} lines {start + 1}-{end}\n" + "\n".join(node_lines)
                })
            return
        for child in node.children:
            walk(child)

    walk(tree.root_node)
    return chunks

def chunk_file(path, content, chunk_size=30, overlap=5):
    ext = os.path.splitext(path)[1]
    lang_name = EXT_TO_LANG.get(ext)
    if lang_name and lang_name in _TS_LANGUAGES:
        try:
            chunks = _ast_chunk(path, content, lang_name)
            if chunks:
                return chunks
        except Exception as e:
            print(f"[tree-sitter] AST chunking failed for {path}: {e}")
    return _line_chunk(path, content, chunk_size, overlap)

def _insert_batched(rows, batch_size=100):
    for i in range(0, len(rows), batch_size):
        supabase.table("documents").insert(rows[i:i + batch_size]).execute()

def embed_chunks(chunks, batch_size=500):
    chunks = [c for c in chunks if c["content"].strip()]
    try:
        if BATCH_EMBEDDINGS:
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=[c["content"] for c in batch]
                )
                for chunk, embedding_obj in zip(batch, response.data):
                    chunk["embedding"] = embedding_obj.embedding
        else:
            for chunk in chunks:
                response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=chunk["content"]
                )
                chunk["embedding"] = response.data[0].embedding
    except OpenAIRateLimitError:
        raise HTTPException(status_code=503, detail="Service temporarily unavailable. Please try again later.")
    return chunks

def _parse_github_url(repo_url: str):
    match = re.match(r"^https?://github\.com/([^/]+)/([^/.]+)(?:\.git)?/?$", repo_url.strip())
    if not match:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL.")
    return match.group(1), match.group(2)

def fetch_and_embed(repo_url, github_token):
    owner, repo = _parse_github_url(repo_url)
    headers = {"Authorization": f"token {github_token}"}

    tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1"
    response = requests.get(tree_url, headers=headers)
    tree = response.json()

    if "tree" not in tree:
        message = tree.get("message", "")
        if "Not Found" in message:
            raise HTTPException(status_code=404, detail="Repository not found or is private.")
        if "rate limit" in message.lower():
            raise HTTPException(status_code=429, detail="GitHub API rate limit reached. Try again later.")
        raise HTTPException(status_code=400, detail=f"Could not access repository: {message or 'unknown error'}")

    ALLOWED_EXTENSIONS = {
        ".js", ".ts", ".jsx", ".tsx", ".vue", ".svelte",
        ".html", ".css", ".scss", ".sass",
        ".py", ".rb", ".php", ".go", ".rs", ".java",
        ".kt", ".cs", ".scala", ".swift",
        ".c", ".h", ".cpp", ".cc", ".hpp",
        ".json", ".yaml", ".yml", ".toml", ".xml",
        ".md", ".mdx", ".graphql", ".gql", ".proto", ".sql",
        ".sh", ".bash", ".zsh",
    }
    EXCLUDED_FILES = {
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
        "bun.lockb", "composer.lock", "Gemfile.lock",
        "poetry.lock", "Pipfile.lock",
    }
    EXCLUDED_DIRS = {
        "node_modules", "vendor", ".git", ".svn", ".hg",
        "dist", "build", "out", ".next", ".nuxt", ".output",
        "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
        "venv", ".venv", "env", ".env",
        ".idea", ".vscode", ".DS_Store",
        "coverage", ".nyc_output", ".cache",
        "target", "bin", "obj",
    }
    files = [
        item["path"] for item in tree.get("tree", [])
        if item["type"] == "blob"
        and os.path.splitext(item["path"])[1] in ALLOWED_EXTENSIONS
        and os.path.basename(item["path"]) not in EXCLUDED_FILES
        and not any(part in EXCLUDED_DIRS for part in item["path"].split("/"))
        and not item["path"].endswith(".min.js")
        and not item["path"].endswith(".min.css")
    ]

    if not files:
        raise HTTPException(status_code=400, detail="No supported code files found in this repository.")

    file_contents = []
    for file_path in files:
        file_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"
        file_response = requests.get(file_url, headers=headers)
        file_data = file_response.json()
        if "content" not in file_data:
            continue
        content = base64.b64decode(file_data["content"]).decode("utf-8", errors="ignore")
        file_contents.append({"path": file_path, "content": content})

    all_chunks = []
    for file in file_contents:
        all_chunks.extend(chunk_file(file["path"], file["content"]))

    if not all_chunks:
        raise HTTPException(status_code=400, detail="No indexable code chunks found in this repository.")

    file_count = len(file_contents)
    total_lines = sum(len(f["content"].split("\n")) for f in file_contents)
    return embed_chunks(all_chunks), file_count, total_lines

def build_query_messages(question, repo_url, history, user_id=None):
    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=question
        )
    except OpenAIRateLimitError:
        raise HTTPException(status_code=503, detail="Service temporarily unavailable. Please try again later.")
    question_embedding = response.data[0].embedding

    results = supabase.rpc("match_documents", {
        "query_embedding": question_embedding,
        "match_threshold": 0.1,
        "match_count": 10,
        "filter_repo_url": repo_url,
        "filter_user_id": user_id
    }).execute()

    context = "\n\n".join([
        f"File: {match['file_path']}\n{match['content']}"
        for match in results.data
    ])

    return [
        {"role": "system", "content": f"You are a helpful assistant that answers questions about a codebase. Use the following code snippets as context to answer the user's question.\n\n{context}"},
        *history,
        {"role": "user", "content": question}
    ]

def stream_chat(messages):
    def generate():
        try:
            stream = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                stream=True
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except OpenAIRateLimitError:
            yield "[Service temporarily unavailable. Please try again later.]"
    return StreamingResponse(generate(), media_type="text/plain")

@app.post("/ingest")
def ingest(body: IngestRequest, request: Request):
    ip = _get_ip(request)
    if not _limiter.is_allowed(f"index:anon:{ip}", ANON_INDEX_LIMIT, RATE_WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail="Index limit reached. Try again tomorrow.")
    existing = supabase.table("documents").select("id").eq("repo_url", body.repo_url).is_("user_id", "null").limit(1).execute()
    if existing.data and not body.force:
        return {"status": "already_indexed"}
    if body.force:
        supabase.table("documents").delete().eq("repo_url", body.repo_url).is_("user_id", "null").execute()

    embedded_chunks, file_count, total_lines = fetch_and_embed(body.repo_url, os.getenv("GITHUB_TOKEN"))
    rows = [
        {"repo_url": body.repo_url, "file_path": c["path"], "content": c["content"], "embedding": c["embedding"], "user_id": None}
        for c in embedded_chunks
    ]
    _insert_batched(rows)
    return {"status": "indexed", "stored": len(rows), "file_count": file_count, "total_lines": total_lines}

@app.post("/ingest-personal")
def ingest_personal(body: IngestPersonalRequest, user=Depends(get_current_user)):
    if not _limiter.is_allowed(f"index:user:{user.id}", USER_INDEX_LIMIT, RATE_WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail="Index limit reached. Try again tomorrow.")
    user_id = user.id
    existing = supabase.table("documents").select("id").eq("repo_url", body.repo_url).eq("user_id", user_id).limit(1).execute()
    if existing.data and not body.force:
        return {"status": "already_indexed"}
    if body.force:
        supabase.table("documents").delete().eq("repo_url", body.repo_url).eq("user_id", user_id).execute()

    embedded_chunks, file_count, total_lines = fetch_and_embed(body.repo_url, body.provider_token or os.getenv("GITHUB_TOKEN"))
    rows = [
        {"repo_url": body.repo_url, "file_path": c["path"], "content": c["content"], "embedding": c["embedding"], "user_id": user_id}
        for c in embedded_chunks
    ]
    _insert_batched(rows)
    return {"status": "indexed", "stored": len(rows), "file_count": file_count, "total_lines": total_lines}

@app.delete("/delete-repo")
def delete_repo(repo_url: str, user=Depends(get_current_user)):
    supabase.table("documents").delete().eq("repo_url", repo_url).eq("user_id", user.id).execute()
    return {"status": "deleted"}

@app.post("/query")
def query(body: QueryRequest, request: Request):
    ip = _get_ip(request)
    if not _limiter.is_allowed(f"query:anon:{ip}", ANON_QUERY_LIMIT, RATE_WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail="Message limit reached. Try again tomorrow.")
    messages = build_query_messages(body.question, body.repo_url, body.trimmed_history(), user_id=None)
    return stream_chat(messages)

@app.post("/query-personal")
def query_personal(body: QueryRequest, user=Depends(get_current_user)):
    if not _limiter.is_allowed(f"query:user:{user.id}", USER_QUERY_LIMIT, RATE_WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail="Message limit reached. Try again tomorrow.")
    messages = build_query_messages(body.question, body.repo_url, body.trimmed_history(), user_id=user.id)
    return stream_chat(messages)

def _parse_sources(results):
    sources = []
    for match in results.data:
        source = {"file": match["file_path"]}
        m = re.match(r'^# .+ lines (\d+)-(\d+)', match["content"])
        if m:
            source["start"] = int(m.group(1))
            source["end"] = int(m.group(2))
        sources.append(source)
    return sources

@app.post("/sources")
def get_sources(body: SourcesRequest, request: Request):
    ip = _get_ip(request)
    if not _limiter.is_allowed(f"query:anon:{ip}", ANON_QUERY_LIMIT, RATE_WINDOW_SECONDS):
        return {"sources": []}
    try:
        response = client.embeddings.create(model="text-embedding-3-small", input=body.question)
    except OpenAIRateLimitError:
        return {"sources": []}
    results = supabase.rpc("match_documents", {
        "query_embedding": response.data[0].embedding,
        "match_threshold": 0.1,
        "match_count": 8,
        "filter_repo_url": body.repo_url,
        "filter_user_id": None
    }).execute()
    return {"sources": _parse_sources(results)}

@app.post("/sources-personal")
def get_sources_personal(body: SourcesRequest, user=Depends(get_current_user)):
    if not _limiter.is_allowed(f"query:user:{user.id}", USER_QUERY_LIMIT, RATE_WINDOW_SECONDS):
        return {"sources": []}
    try:
        response = client.embeddings.create(model="text-embedding-3-small", input=body.question)
    except OpenAIRateLimitError:
        return {"sources": []}
    results = supabase.rpc("match_documents", {
        "query_embedding": response.data[0].embedding,
        "match_threshold": 0.1,
        "match_count": 8,
        "filter_repo_url": body.repo_url,
        "filter_user_id": user.id
    }).execute()
    return {"sources": _parse_sources(results)}

@app.get("/repos")
async def get_repos(user=Depends(get_current_user), x_provider_token: str = Header(None)):
    token = x_provider_token or os.getenv("GITHUB_TOKEN")
    headers = {"Authorization": f"token {token}"}
    response = requests.get(
        "https://api.github.com/user/repos?sort=updated&per_page=100&visibility=all",
        headers=headers
    )
    if not response.ok:
        data = response.json()
        message = data.get("message", "")
        if "rate limit" in message.lower():
            raise HTTPException(status_code=429, detail="GitHub API rate limit reached. Try again later.")
        raise HTTPException(status_code=502, detail="Failed to fetch repositories from GitHub.")
    return {"repos": response.json()}
