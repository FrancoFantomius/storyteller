import os
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, Dict, List

import httpx
from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Base paths
SERVER_DIR = Path(__file__).resolve().parent
ROOT_DIR = SERVER_DIR.parent
DIST_DIR = ROOT_DIR / "dist"
WORLDS_DIR = SERVER_DIR / "worlds"
CAMPAIGNS_DIR = SERVER_DIR / "campaigns"
GENERATED_IMAGES_DIR = SERVER_DIR / "generated_images"

# Default environment hosts (configurable for Docker or host execution)
DEFAULT_LLAMACPP_HOST = os.environ.get("LLM_HOST", "http://localhost:8080")
DEFAULT_DIFFUSERS_HOST = os.environ.get("DIFFUSERS_HOST", "http://localhost:8001")
DEFAULT_OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# Ensure storage directories exist
WORLDS_DIR.mkdir(parents=True, exist_ok=True)
CAMPAIGNS_DIR.mkdir(parents=True, exist_ok=True)
GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Storyteller AI Fullstack Server",
    description="Python FastAPI backend hosting the frontend, llama.cpp, Ollama, and ROCm Diffusers AI endpoints",
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
# 3. AI Backend Proxy & Inference Endpoints (llama.cpp, Diffusers, Ollama)
# ---------------------------------------------------------------------------

@app.get("/api/ai/status")
async def check_all_ai_status(
    llamacpp_host: str = Query(default=DEFAULT_LLAMACPP_HOST),
    diffusers_host: str = Query(default=DEFAULT_DIFFUSERS_HOST),
    ollama_host: str = Query(default=DEFAULT_OLLAMA_HOST),
):
    """Checks the health and status of all configured AI inference engines."""
    status_result = {
        "llamacpp": {"online": False, "host": llamacpp_host, "info": None},
        "diffusers": {"online": False, "host": diffusers_host, "info": None},
        "ollama": {"online": False, "host": ollama_host, "info": None},
    }

    async with httpx.AsyncClient(timeout=2.5) as client:
        # Check llama.cpp (supports /health or /v1/models)
        try:
            resp = await client.get(f"{llamacpp_host.rstrip('/')}/health")
            if resp.status_code == 200:
                status_result["llamacpp"] = {"online": True, "host": llamacpp_host, "info": resp.json()}
            else:
                resp2 = await client.get(f"{llamacpp_host.rstrip('/')}/v1/models")
                if resp2.status_code == 200:
                    status_result["llamacpp"] = {"online": True, "host": llamacpp_host, "info": resp2.json()}
        except Exception as e:
            status_result["llamacpp"]["error"] = str(e)

        # Check Diffusers ROCm microservice
        try:
            resp = await client.get(f"{diffusers_host.rstrip('/')}/health")
            if resp.status_code == 200:
                status_result["diffusers"] = {"online": True, "host": diffusers_host, "info": resp.json()}
        except Exception as e:
            status_result["diffusers"]["error"] = str(e)

        # Check Ollama
        try:
            resp = await client.get(f"{ollama_host.rstrip('/')}/api/tags")
            if resp.status_code == 200:
                status_result["ollama"] = {"online": True, "host": ollama_host, "info": resp.json()}
        except Exception as e:
            status_result["ollama"]["error"] = str(e)

    return status_result

@app.get("/api/llamacpp/status")
async def check_llamacpp_status(host: str = Query(default=DEFAULT_LLAMACPP_HOST)):
    """Check connection to llama.cpp server."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{host.rstrip('/')}/health")
            if resp.status_code == 200:
                return {"online": True, "status": resp.json()}
            resp2 = await client.get(f"{host.rstrip('/')}/v1/models")
            if resp2.status_code == 200:
                return {"online": True, "models": resp2.json().get("data", [])}
            return {"online": False, "error": f"Status code {resp.status_code}"}
    except Exception as err:
        return {"online": False, "error": str(err)}

@app.get("/api/diffusers/status")
async def check_diffusers_status(host: str = Query(default=DEFAULT_DIFFUSERS_HOST)):
    """Check connection to Diffusers ROCm service."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{host.rstrip('/')}/health")
            if resp.status_code == 200:
                return {"online": True, **resp.json()}
            return {"online": False, "error": f"Status code {resp.status_code}"}
    except Exception as err:
        return {"online": False, "error": str(err)}

@app.get("/api/ollama/status")
async def check_ollama_status(host: str = Query(default=DEFAULT_OLLAMA_HOST)):
    """Check connection to Ollama and fetch list of available models."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{host.rstrip('/')}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                return {"online": True, "models": data.get("models", [])}
            return {"online": False, "error": f"Status code {resp.status_code}"}
    except Exception as err:
        return {"online": False, "error": str(err), "models": []}

@app.post("/api/ai/chat")
async def ai_chat_proxy(
    request: Request,
    provider: str = Query(default="llamacpp"),
    host: Optional[str] = Query(default=None),
):
    """
    Unified streaming AI chat proxy for llama.cpp, Ollama, and compatible servers.
    Supports both OpenAI format (/v1/chat/completions) used by llama.cpp and Ollama's native (/api/chat).
    """
    body = await request.json()

    if provider == "llamacpp" or provider == "openai":
        target_host = host or DEFAULT_LLAMACPP_HOST
        target_url = f"{target_host.rstrip('/')}/v1/chat/completions"
        media_type = "text/event-stream"
    else:
        target_host = host or DEFAULT_OLLAMA_HOST
        target_url = f"{target_host.rstrip('/')}/api/chat"
        media_type = "application/x-ndjson"

    async def stream_generator():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", target_url, json=body) as response:
                    async for chunk in response.aiter_bytes():
                        yield chunk
        except Exception as e:
            error_json = json.dumps({"error": str(e)}) + "\n"
            yield error_json.encode("utf-8")

    return StreamingResponse(stream_generator(), media_type=media_type)

class SceneImageRequest(BaseModel):
    prompt: str
    genre: Optional[str] = "Fantasy"
    mood: Optional[str] = "mysterious"
    width: Optional[int] = 512
    height: Optional[int] = 512
    steps: Optional[int] = 4
    host: Optional[str] = None

@app.post("/api/ai/generate-scene-image")
async def generate_scene_image(req: SceneImageRequest):
    """
    Transforms story scene context into an optimized visual diffusion prompt,
    calls the ROCm Diffusers microservice, and saves / returns the image.
    """
    target_host = req.host or DEFAULT_DIFFUSERS_HOST
    
    # Enrich prompt with genre and cinematic aesthetic keywords
    style_suffix = "cinematic lighting, highly detailed digital illustration, atmospheric, 8k resolution concept art"
    if "cyber" in req.genre.lower():
        style_suffix += ", cyberpunk aesthetic, neon lights, volumetric fog"
    elif "horror" in req.genre.lower():
        style_suffix += ", eerie grimdark atmosphere, dramatic chiaroscuro, moody shadows"
    elif "space" in req.genre.lower() or "sci-fi" in req.genre.lower():
        style_suffix += ", sci-fi epic, deep space nebula, sharp details"
    else:
        style_suffix += ", high fantasy artstation trending, vibrant rich colors"

    enhanced_prompt = f"{req.prompt.strip()}, {style_suffix}"

    payload = {
        "prompt": enhanced_prompt,
        "negative_prompt": "blurry, low quality, deformed, text, watermark, bad anatomy, noisy, cropped",
        "width": req.width,
        "height": req.height,
        "num_inference_steps": req.steps,
        "return_base64": True,
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(f"{target_host.rstrip('/')}/generate", json=payload)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Diffusers service error: {resp.text}")
            
            data = resp.json()
            data_url = data.get("data_url")
            
            # Optionally persist image to server/generated_images
            img_id = f"img_{int(datetime.now().timestamp()*1000)}_{uuid.uuid4().hex[:4]}.png"
            if data_url and data_url.startswith("data:image/png;base64,"):
                try:
                    raw_b64 = data_url.split(",", 1)[1]
                    img_bytes = base64.b64decode(raw_b64)
                    file_path = GENERATED_IMAGES_DIR / img_id
                    with open(file_path, "wb") as f:
                        f.write(img_bytes)
                    data["file_url"] = f"/generated_images/{img_id}"
                except Exception:
                    pass

            return data
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to Diffusers service at {target_host}. Ensure the diffusers container is running with AMD GPU passthrough."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
