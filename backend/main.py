from fastapi import FastAPI
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


@app.post("/ingest")
def ingest(body: IngestRequest):
    print('in /ingest')
    existing = supabase.table("documents").select("id").eq("repo_url", body.repo_url).limit(1).execute()
    if existing.data and not body.force:
        print('returning already_indexed')
        return {"status": "already_indexed"}

    if body.force:
        print('body.force is true')
        supabase.table("documents").delete().eq("repo_url", body.repo_url).execute()

    parts = body.repo_url.rstrip("/").split("/")
    owner = parts[-2]
    repo = parts[-1]

    token = os.getenv("GITHUB_TOKEN")
    headers = {"Authorization": f"token {token}"}

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
        chunks = chunk_file(file["path"], file["content"])
        all_chunks.extend(chunks)

    embedded_chunks = embed_chunks(all_chunks)

    rows = [
        {
            "repo_url": body.repo_url,
            "file_path": chunk["path"],
            "content": chunk["content"],
            "embedding": chunk["embedding"],
        }
        for chunk in embedded_chunks
    ]
    supabase.table("documents").insert(rows).execute()

    return {"status": "indexed", "stored": len(rows)}


@app.post("/query")
def query(body: QueryRequest):

    # call openai api to embed question into a vector
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=body.question
    )
    question_embedding = response.data[0].embedding

    # calling match_documents function in supabase to find matching chunks
    results = supabase.rpc("match_documents", {
      "query_embedding": question_embedding,
      "match_threshold": 0.1,
      "match_count": 10,
      "filter_repo_url": body.repo_url
  }).execute()
    
    # build a string of all matching file paths and content from the matching documents
    context = "\n\n".join([
        f"File: {match['file_path']}\n{match['content']}"
        for match in results.data
    ])   

    # message we give to openai endpoint
    messages = [
      {"role": "system", "content": f"""
       You are a helpful assistant that answers questions about a codebase. 
       Use the following code snippets as context to answer the user's question.
       \n\n{context}"""},

      *body.history,
      {"role": "user", "content": body.question}
  ]


    chat_response = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=messages
    )

    answer = chat_response.choices[0].message.content
    return {"answer": answer}
