from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from supabase import create_client
import requests
import os
import base64
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

class IngestRequest(BaseModel):
    repo_url: str
    force: bool = False

class IngestPersonalRequest(BaseModel):
    repo_url: str
    force: bool = False
    provider_token: str

class QueryRequest(BaseModel):
    question: str
    repo_url: str
    history: list

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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

def chunk_file(path, content, chunk_size=30, overlap=5):
    lines = content.split("\n")
    chunks = []
    i = 0
    while i < len(lines):
        chunk_lines = lines[i:i + chunk_size]
        chunk_text = "\n".join(chunk_lines)
        chunks.append({"path": path, "content": chunk_text})
        i += chunk_size - overlap
    return chunks

def embed_chunks(chunks):
    for chunk in chunks:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=chunk["content"]
        )
        chunk["embedding"] = response.data[0].embedding
    return chunks

def fetch_and_embed(repo_url, github_token):
    parts = repo_url.rstrip("/").split("/")
    owner = parts[-2]
    repo = parts[-1]
    headers = {"Authorization": f"token {github_token}"}

    tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1"
    response = requests.get(tree_url, headers=headers)
    tree = response.json()

    ALLOWED_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".md", ".json", ".html", ".css"}
    EXCLUDED_FILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}
    files = [
        item["path"] for item in tree.get("tree", [])
        if item["type"] == "blob"
        and os.path.splitext(item["path"])[1] in ALLOWED_EXTENSIONS
        and os.path.basename(item["path"]) not in EXCLUDED_FILES
    ]

    file_contents = []
    for file_path in files:
        file_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"
        file_response = requests.get(file_url, headers=headers)
        file_data = file_response.json()
        content = base64.b64decode(file_data["content"]).decode("utf-8", errors="ignore")
        file_contents.append({"path": file_path, "content": content})

    all_chunks = []
    for file in file_contents:
        all_chunks.extend(chunk_file(file["path"], file["content"]))

    return embed_chunks(all_chunks)

def run_query(question, repo_url, history, user_id=None):
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=question
    )
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

    messages = [
        {"role": "system", "content": f"You are a helpful assistant that answers questions about a codebase. Use the following code snippets as context to answer the user's question.\n\n{context}"},
        *history,
        {"role": "user", "content": question}
    ]

    chat_response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages
    )

    return chat_response.choices[0].message.content

@app.post("/ingest")
def ingest(body: IngestRequest):
    existing = supabase.table("documents").select("id").eq("repo_url", body.repo_url).is_("user_id", "null").limit(1).execute()
    if existing.data and not body.force:
        return {"status": "already_indexed"}
    if body.force:
        supabase.table("documents").delete().eq("repo_url", body.repo_url).is_("user_id", "null").execute()

    embedded_chunks = fetch_and_embed(body.repo_url, os.getenv("GITHUB_TOKEN"))
    rows = [
        {"repo_url": body.repo_url, "file_path": c["path"], "content": c["content"], "embedding": c["embedding"], "user_id": None}
        for c in embedded_chunks
    ]
    supabase.table("documents").insert(rows).execute()
    return {"status": "indexed", "stored": len(rows)}

@app.post("/ingest-personal")
def ingest_personal(body: IngestPersonalRequest, user=Depends(get_current_user)):
    user_id = user.id
    existing = supabase.table("documents").select("id").eq("repo_url", body.repo_url).eq("user_id", user_id).limit(1).execute()
    if existing.data and not body.force:
        return {"status": "already_indexed"}
    if body.force:
        supabase.table("documents").delete().eq("repo_url", body.repo_url).eq("user_id", user_id).execute()

    embedded_chunks = fetch_and_embed(body.repo_url, body.provider_token)
    rows = [
        {"repo_url": body.repo_url, "file_path": c["path"], "content": c["content"], "embedding": c["embedding"], "user_id": user_id}
        for c in embedded_chunks
    ]
    supabase.table("documents").insert(rows).execute()
    return {"status": "indexed", "stored": len(rows)}

@app.post("/query")
def query(body: QueryRequest):
    return {"answer": run_query(body.question, body.repo_url, body.history, user_id=None)}

@app.post("/query-personal")
def query_personal(body: QueryRequest, user=Depends(get_current_user)):
    return {"answer": run_query(body.question, body.repo_url, body.history, user_id=user.id)}

@app.get("/repos")
async def get_repos(user=Depends(get_current_user), x_provider_token: str = Header(None)):
    token = x_provider_token or os.getenv("GITHUB_TOKEN")
    headers = {"Authorization": f"token {token}"}
    response = requests.get(
        "https://api.github.com/user/repos?sort=updated&per_page=100&visibility=all",
        headers=headers
    )
    return {"repos": response.json()}
