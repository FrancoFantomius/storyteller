import os
import sys
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, Dict, List

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Base paths
SERVER_DIR = Path(__file__).resolve().parent
ROOT_DIR = SERVER_DIR.parent
DIST_DIR = ROOT_DIR / "dist"
WORLDS_DIR = SERVER_DIR / "worlds"
CAMPAIGNS_DIR = SERVER_DIR / "campaigns"
GENERATED_IMAGES_DIR = SERVER_DIR / "generated_images"

# Ensure storage directories exist
WORLDS_DIR.mkdir(parents=True, exist_ok=True)
CAMPAIGNS_DIR.mkdir(parents=True, exist_ok=True)
GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# Ensure server module path is available for imports
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

try:
    from AI import ai_router
except ImportError:
    from server.AI import ai_router

app = FastAPI(
    title="Storyteller Fullstack Server",
    description="Python FastAPI backend hosting the frontend, REST APIs, and AI endpoints",
    version="1.0.0",
)

# CORS configuration for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helper functions for File Storage
# ---------------------------------------------------------------------------

def find_entity_by_id(directory: Path, entity_id: str) -> Optional[tuple[Path, Dict[str, Any]]]:
    # 1. Direct filename check
    direct_path = directory / f"{entity_id}.json"
    if direct_path.exists():
        try:
            with open(direct_path, "r", encoding="utf-8") as f:
                return direct_path, json.load(f)
        except Exception:
            pass

    # 2. Scan all JSON files in the directory
    for file_path in directory.glob("*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("id") == entity_id:
                    return file_path, data
        except Exception:
            continue

    return None

# ---------------------------------------------------------------------------
# 1. Worlds REST API
# ---------------------------------------------------------------------------

@app.get("/api/worlds")
def list_worlds() -> List[Dict[str, Any]]:
    worlds = []
    for file_path in WORLDS_DIR.glob("*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                worlds.append(json.load(f))
        except Exception:
            continue
    return worlds

@app.post("/api/worlds", status_code=status.HTTP_201_CREATED)
def create_world(world_data: Dict[str, Any]) -> Dict[str, Any]:
    if not world_data.get("id"):
        world_data["id"] = f"world_{int(datetime.now().timestamp()*1000)}_{uuid.uuid4().hex[:5]}"
    
    now_iso = datetime.utcnow().isoformat() + "Z"
    world_data["updatedAt"] = now_iso
    if not world_data.get("createdAt"):
        world_data["createdAt"] = now_iso

    file_path = WORLDS_DIR / f"{world_data['id']}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(world_data, f, indent=2, ensure_ascii=False)
    
    return world_data

@app.get("/api/worlds/{world_id}")
def get_world(world_id: str) -> Dict[str, Any]:
    found = find_entity_by_id(WORLDS_DIR, world_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"World '{world_id}' not found")
    return found[1]

@app.put("/api/worlds/{world_id}")
def update_world(world_id: str, world_data: Dict[str, Any]) -> Dict[str, Any]:
    found = find_entity_by_id(WORLDS_DIR, world_id)
    world_data["id"] = world_id
    world_data["updatedAt"] = datetime.utcnow().isoformat() + "Z"
    
    save_path = found[0] if found else WORLDS_DIR / f"{world_id}.json"
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(world_data, f, indent=2, ensure_ascii=False)
        
    return world_data

@app.delete("/api/worlds/{world_id}")
def delete_world(world_id: str) -> Dict[str, Any]:
    found = find_entity_by_id(WORLDS_DIR, world_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"World '{world_id}' not found")
    try:
        found[0].unlink()
        return {"success": True, "id": world_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# 2. Campaigns REST API
# ---------------------------------------------------------------------------

@app.get("/api/campaigns")
def list_campaigns() -> List[Dict[str, Any]]:
    campaigns = []
    for file_path in CAMPAIGNS_DIR.glob("*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                campaigns.append(json.load(f))
        except Exception:
            continue
    
    # Sort descending by updatedAt
    campaigns.sort(key=lambda c: c.get("updatedAt", ""), reverse=True)
    return campaigns

@app.post("/api/campaigns", status_code=status.HTTP_201_CREATED)
def create_campaign(campaign_data: Dict[str, Any]) -> Dict[str, Any]:
    if not campaign_data.get("id"):
        campaign_data["id"] = f"camp_{int(datetime.now().timestamp()*1000)}_{uuid.uuid4().hex[:5]}"
    
    now_iso = datetime.utcnow().isoformat() + "Z"
    campaign_data["updatedAt"] = now_iso
    if not campaign_data.get("createdAt"):
        campaign_data["createdAt"] = now_iso

    file_path = CAMPAIGNS_DIR / f"{campaign_data['id']}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(campaign_data, f, indent=2, ensure_ascii=False)
    
    return campaign_data

@app.get("/api/campaigns/{campaign_id}")
def get_campaign(campaign_id: str) -> Dict[str, Any]:
    found = find_entity_by_id(CAMPAIGNS_DIR, campaign_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")
    return found[1]

@app.put("/api/campaigns/{campaign_id}")
def update_campaign(campaign_id: str, campaign_data: Dict[str, Any]) -> Dict[str, Any]:
    found = find_entity_by_id(CAMPAIGNS_DIR, campaign_id)
    campaign_data["id"] = campaign_id
    campaign_data["updatedAt"] = datetime.utcnow().isoformat() + "Z"
    
    save_path = found[0] if found else CAMPAIGNS_DIR / f"{campaign_id}.json"
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(campaign_data, f, indent=2, ensure_ascii=False)
        
    return campaign_data

@app.delete("/api/campaigns/{campaign_id}")
def delete_campaign(campaign_id: str) -> Dict[str, Any]:
    found = find_entity_by_id(CAMPAIGNS_DIR, campaign_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")
    try:
        found[0].unlink()
        return {"success": True, "id": campaign_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# 3. AI Endpoints Integration (Delegated to AI.py)
# ---------------------------------------------------------------------------

app.include_router(ai_router)

# ---------------------------------------------------------------------------
# 4. Static Files & Multi-Page Frontend Serving (dist/ & generated_images/)
# ---------------------------------------------------------------------------

# Mount generated images folder
if GENERATED_IMAGES_DIR.exists():
    app.mount("/generated_images", StaticFiles(directory=GENERATED_IMAGES_DIR), name="generated_images")

# Mount built assets folder if it exists
assets_dir = DIST_DIR / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

@app.get("/")
async def serve_index():
    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse(
        status_code=200,
        content={"message": "Storyteller Backend is running. Run 'npm run build' to generate frontend dist/ files."}
    )

@app.get("/play")
@app.get("/play.html")
async def serve_play():
    file_path = DIST_DIR / "play.html"
    if file_path.exists():
        return FileResponse(file_path)
    return FileResponse(DIST_DIR / "index.html") if (DIST_DIR / "index.html").exists() else JSONResponse({"error": "Page not built yet"})

@app.get("/world-editor")
@app.get("/world-editor.html")
async def serve_world_editor():
    file_path = DIST_DIR / "world-editor.html"
    if file_path.exists():
        return FileResponse(file_path)
    return FileResponse(DIST_DIR / "index.html") if (DIST_DIR / "index.html").exists() else JSONResponse({"error": "Page not built yet"})

@app.get("/settings")
@app.get("/settings.html")
async def serve_settings():
    file_path = DIST_DIR / "settings.html"
    if file_path.exists():
        return FileResponse(file_path)
    return FileResponse(DIST_DIR / "index.html") if (DIST_DIR / "index.html").exists() else JSONResponse({"error": "Page not built yet"})

# Fallback static mount for any other files in dist/ (e.g. icons, manifests, favicons)
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="dist_root")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting Storyteller Server at http://localhost:{port}")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
