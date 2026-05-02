from fastapi import FastAPI
from pydantic import BaseModel
import requests
import os
import base64
from dotenv import load_dotenv

load_dotenv()

class IngestRequest(BaseModel):
    repo_url: str

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}

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
    for file_path in files:                                                                                                             file_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"
    file_response = requests.get(file_url, headers=headers)
    file_data = file_response.json()

    content = base64.b64decode(file_data["content"]).decode("utf-8", errors="ignore")
    file_contents.append({"path": file_path, "content": content})

    return {"files": file_contents}
