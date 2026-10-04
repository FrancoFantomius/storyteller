import os
import json
import uuid
import base64
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, Dict, List

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Base paths
SERVER_DIR = Path(__file__).resolve().parent
ROOT_DIR = SERVER_DIR.parent
GENERATED_IMAGES_DIR = SERVER_DIR / "generated_images"
SYSTEM_PROMPT_FILE = ROOT_DIR / "system.txt"

# Default environment hosts (configurable for Docker or host execution)
DEFAULT_LLAMACPP_HOST = os.environ.get("LLM_HOST", "http://localhost:8080")
DEFAULT_DIFFUSERS_HOST = os.environ.get("DIFFUSERS_HOST", "http://localhost:8001")
DEFAULT_OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# Ensure generated images directory exists
GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

ai_router = APIRouter()

# ---------------------------------------------------------------------------
# Status & Health Checks
# ---------------------------------------------------------------------------

@ai_router.get("/api/ai/status")
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

@ai_router.get("/api/llamacpp/status")
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

@ai_router.get("/api/diffusers/status")
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

@ai_router.get("/api/ollama/status")
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

# ---------------------------------------------------------------------------
# System Prompt & Story Turn Generation (Driven by system.txt)
# ---------------------------------------------------------------------------

def load_system_prompt_template() -> str:
    """Reads system.txt from the workspace root or provides a robust fallback."""
    if SYSTEM_PROMPT_FILE.exists():
        try:
            with open(SYSTEM_PROMPT_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content
        except Exception as e:
            print(f"Warning: Failed to read system.txt: {e}")

    return """# System Prompt: The World Engine
You are The World Engine, the omniscient narrator and simulation core of an interactive Choose-Your-Own-Adventure (CYOA) platform.
Your sole purpose is to generate a living, breathing, and reactive narrative world. Deliver vivid, immersive second-person narrative ("You...")."""

def build_dynamic_system_prompt(world_data: Dict[str, Any], active_character: Dict[str, Any], tone: Optional[str] = None) -> str:
    """
    Combines the core system.txt directives with active world lore, immutable logic rules,
    character stats, and storytelling guidelines.
    """
    base_template = load_system_prompt_template()

    world_name = world_data.get("name", "Unknown Realm")
    genre = world_data.get("genre", "Adventure")
    setting = world_data.get("setting") or world_data.get("description", "A mysterious realm.")
    tone_str = tone or world_data.get("tone", "Epic, vivid, and immersive")

    logic_rules = world_data.get("logic", [])
    logic_formatted = "\n".join([f"{i+1}. {rule}" for i, rule in enumerate(logic_rules)]) if logic_rules else "None specified."

    npcs = [c for c in world_data.get("characters", []) if c.get("type") == "npc"]
    npcs_formatted = "\n".join([
        f"- {n.get('name')} ({n.get('role', 'NPC')}, Faction: {n.get('faction', 'None')}): {n.get('bio', '')} [Secret: {n.get('secret', 'None')}]"
        for n in npcs
    ]) if npcs else "None specified."

    char_name = active_character.get("name", "Adventurer")
    char_role = active_character.get("role", "Protagonist")
    char_bio = active_character.get("bio", "")
    equipment = ", ".join(active_character.get("equipment", [])) if active_character.get("equipment") else "Standard gear"
    skills = active_character.get("skills", {})
    skills_str = ", ".join([f"{k}: Level {v}" for k, v in skills.items()]) if isinstance(skills, dict) and skills else "None specified"

    context_addon = f"""

=============================================================================
CURRENT ACTIVE WORLD CONTEXT & PARAMETERS
=============================================================================
World Name: "{world_name}"
Genre: {genre}
Master Narrative Tone: {tone_str}

WORLD SETTING & LORE:
{setting}

IMMUTABLE WORLD LOGIC RULES (You must strictly obey these rules without exception):
{logic_formatted}

KEY NPCS IN THIS WORLD:
{npcs_formatted}

ACTIVE PLAYER CHARACTER:
Name: {char_name}
Role/Archetype: {char_role}
Bio: {char_bio}
Equipment: {equipment}
Skills: {skills_str}

FORMATTING DIRECTIVES:
1. Deliver vivid, atmospheric second-person narrative ("You...").
2. Conclude every response with 3 or 4 compelling suggested next actions formatted at the very end under "**Suggestions:**" as numbered lines without any emojis.
"""
    return f"{base_template}\n{context_addon}".strip()

@ai_router.get("/api/ai/system-prompt")
def get_system_prompt_endpoint():
    """Returns the raw system.txt prompt and template status."""
    return {
        "file_path": str(SYSTEM_PROMPT_FILE),
        "exists": SYSTEM_PROMPT_FILE.exists(),
        "prompt_template": load_system_prompt_template(),
    }

class StoryTurnPayload(BaseModel):
    world: Dict[str, Any]
    activeCharacter: Dict[str, Any]
    userInput: str
    campaignHistory: Optional[List[Dict[str, Any]]] = []
    provider: Optional[str] = "llamacpp"
    host: Optional[str] = None
    temperature: Optional[float] = 0.7
    topP: Optional[float] = 0.9
    maxTokens: Optional[int] = 600
    narrativeTone: Optional[str] = None

@ai_router.post("/api/ai/story-turn")
async def generate_story_turn_endpoint(payload: StoryTurnPayload):
    """
    Unified story turn generation endpoint:
    1. Loads system.txt and builds dynamic system prompt with lore and character data.
    2. Packages conversation history.
    3. Streams response from llama.cpp or Ollama to the browser via SSE.
    """
    system_prompt = build_dynamic_system_prompt(
        world_data=payload.world,
        active_character=payload.activeCharacter,
        tone=payload.narrativeTone,
    )

    formatted_user_prompt = f"{payload.userInput.strip()}\n\nContinue the narrative based on this input. Describe what happens next."

    # Build message array
    history_messages = []
    for h in (payload.campaignHistory or [])[-8:]:
        if h.get("type") == "narrative":
            history_messages.append({"role": "assistant", "content": h.get("text", "")})
        elif h.get("type") == "action":
            history_messages.append({"role": "user", "content": h.get("text", "")})

    messages = [
        {"role": "system", "content": system_prompt},
        *history_messages,
        {"role": "user", "content": formatted_user_prompt},
    ]

    provider = payload.provider or "llamacpp"
    if provider == "llamacpp" or provider == "openai":
        target_host = payload.host or DEFAULT_LLAMACPP_HOST
        target_url = f"{target_host.rstrip('/')}/v1/chat/completions"
        req_body = {
            "messages": messages,
            "stream": True,
            "temperature": payload.temperature,
            "top_p": payload.topP,
            "max_tokens": payload.maxTokens,
        }
        media_type = "text/event-stream"
    else:
        target_host = payload.host or DEFAULT_OLLAMA_HOST
        target_url = f"{target_host.rstrip('/')}/api/chat"
        req_body = {
            "model": "llama3:latest",
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": payload.temperature,
                "top_p": payload.topP,
                "num_predict": payload.maxTokens,
            },
        }
        media_type = "application/x-ndjson"

    async def stream_generator():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", target_url, json=req_body) as response:
                    async for chunk in response.aiter_bytes():
                        yield chunk
        except Exception as e:
            error_json = json.dumps({"error": str(e)}) + "\n"
            yield error_json.encode("utf-8")

    return StreamingResponse(stream_generator(), media_type=media_type)

@ai_router.post("/api/ai/chat")
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

@ai_router.post("/api/ai/generate-scene-image")
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
