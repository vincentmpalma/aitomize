from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI
import requests
import os
import base64
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class IngestRequest(BaseModel):
    repo_url: str

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}

def chunk_file(path, content, chunk_size=50, overlap=10):
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
    parts = body.repo_url.rstrip("/").split("/")
    owner = parts[-2]
    repo = parts[-1]

    token = os.getenv("GITHUB_TOKEN")
    headers = {"Authorization": f"token {token}"}

    tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1"
    response = requests.get(tree_url, headers=headers)
    tree = response.json()

    ALLOWED_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".md", ".json", ".html", ".css"}  
    files = [
      item["path"] for item in tree.get("tree", [])
      if item["type"] == "blob" and os.path.splitext(item["path"])[1] in ALLOWED_EXTENSIONS
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
    return {"chunks": embedded_chunks, "total": len(embedded_chunks)}
