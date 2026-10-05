import os
import io
import sys
import json
import uuid
import time
import base64
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, Dict, List

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from PIL import Image

# Configure logging
logger = logging.getLogger("storyteller.ai")

# Base paths
SERVER_DIR = Path(__file__).resolve().parent
ROOT_DIR = SERVER_DIR.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", SERVER_DIR))
GENERATED_IMAGES_DIR = DATA_DIR / "generated_images"
LOCAL_MODELS_DIR = Path(os.environ.get("LOCAL_MODELS_DIR", ROOT_DIR / "models" / "diffusers"))

# Ensure generated images directory exists
GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

def get_system_prompt_file() -> Path:
    custom_system = DATA_DIR / "system.txt"
    if custom_system.exists() and custom_system.is_file():
        return custom_system
    root_system = ROOT_DIR / "system.txt"
    if root_system.exists() and root_system.is_file():
        return root_system
    return custom_system

SYSTEM_PROMPT_FILE = get_system_prompt_file()

# Default LLM Host
DEFAULT_LLAMACPP_HOST = os.environ.get("LLM_HOST", "http://localhost:8080")
DEFAULT_DIFFUSERS_MODEL = os.environ.get("DIFFUSERS_MODEL_ID", "stabilityai/sd-turbo")

ai_router = APIRouter()

# ---------------------------------------------------------------------------
# In-Process Diffusers Engine
# ---------------------------------------------------------------------------

pipeline = None
current_model_id: Optional[str] = None

def get_torch_and_device():
    try:
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        return torch, device, dtype
    except ImportError:
        return None, "cpu", None

def get_gpu_info() -> Dict[str, Any]:
    torch_mod, device, _ = get_torch_and_device()
    if torch_mod is None:
        return {
            "available": False,
            "torch_installed": False,
            "device_name": "CPU (PyTorch not installed)",
            "is_rocm": False,
            "hip_version": None,
            "torch_version": None,
            "vram_total_gb": 0.0,
            "vram_allocated_gb": 0.0,
        }

    gpu_available = torch_mod.cuda.is_available()
    device_name = torch_mod.cuda.get_device_name(0) if gpu_available else "CPU"
    vram_total_gb = 0.0
    vram_allocated_gb = 0.0

    if gpu_available:
        try:
            vram_total_gb = round(torch_mod.cuda.get_device_properties(0).total_memory / (1024**3), 2)
            vram_allocated_gb = round(torch_mod.cuda.memory_allocated(0) / (1024**3), 2)
        except Exception:
            pass

    return {
        "available": gpu_available,
        "torch_installed": True,
        "device_name": device_name,
        "is_rocm": hasattr(torch_mod.version, "hip") and bool(torch_mod.version.hip),
        "hip_version": getattr(torch_mod.version, "hip", None),
        "torch_version": torch_mod.__version__,
        "vram_total_gb": vram_total_gb,
        "vram_allocated_gb": vram_allocated_gb,
    }

def load_diffusion_pipeline(model_id_or_path: Optional[str] = None):
    global pipeline, current_model_id
    model_to_load = model_id_or_path or DEFAULT_DIFFUSERS_MODEL

    try:
        import torch
        from diffusers import AutoPipelineForText2Image, DiffusionPipeline
    except ImportError as e:
        raise RuntimeError(f"PyTorch or Diffusers is not installed: {e}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    logger.info(f"Loading diffusion model '{model_to_load}' on {device} ({dtype})...")
    start_time = time.time()

    model_path = Path(model_to_load)
    slug = model_to_load.split("/")[-1] if "/" in model_to_load else model_to_load
    if not model_path.exists():
        if (LOCAL_MODELS_DIR / model_to_load).exists():
            model_to_load = str(LOCAL_MODELS_DIR / model_to_load)
        elif (LOCAL_MODELS_DIR / slug).exists():
            model_to_load = str(LOCAL_MODELS_DIR / slug)

    hf_token = os.environ.get("HF_TOKEN") or None
    try:
        pipe = AutoPipelineForText2Image.from_pretrained(
            model_to_load,
            torch_dtype=dtype,
            variant="fp16" if dtype == torch.float16 else None,
            use_safetensors=True,
            token=hf_token,
        )
    except Exception as e:
        logger.warning(f"AutoPipeline failed, falling back to DiffusionPipeline: {e}")
        pipe = DiffusionPipeline.from_pretrained(
            model_to_load,
            torch_dtype=dtype,
            token=hf_token,
        )

    pipe = pipe.to(device)

    # Memory optimizations for consumer / ROCm GPUs
    if device == "cuda":
        try:
            pipe.enable_attention_slicing()
        except Exception:
            pass

    pipeline = pipe
    current_model_id = model_to_load
    elapsed = round(time.time() - start_time, 2)
    logger.info(f"Model '{model_to_load}' loaded in {elapsed}s.")
    return pipeline

class GenerationRequest(BaseModel):
    prompt: str = Field(..., description="Visual scene prompt")
    negative_prompt: Optional[str] = Field(
        default="blurry, bad quality, distorted, extra limbs, low resolution, ugly, watermark, text",
        description="Negative prompt to suppress undesired artifacts",
    )
    width: Optional[int] = Field(default=512, ge=256, le=1024)
    height: Optional[int] = Field(default=512, ge=256, le=1024)
    num_inference_steps: Optional[int] = Field(default=4, ge=1, le=50)
    guidance_scale: Optional[float] = Field(default=0.0, ge=0.0, le=20.0)
    seed: Optional[int] = Field(default=-1)
    return_base64: Optional[bool] = Field(default=True)

class ModelLoadRequest(BaseModel):
    model_id_or_path: str = Field(..., description="HuggingFace model ID or path to local safetensors/diffusers checkpoint")

def run_diffusers_inference(req: GenerationRequest) -> Dict[str, Any]:
    global pipeline
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"

    if pipeline is None:
        load_diffusion_pipeline(DEFAULT_DIFFUSERS_MODEL)

    generator = None
    if req.seed is not None and req.seed >= 0:
        generator = torch.Generator(device=device).manual_seed(req.seed)

    start_time = time.time()
    extra_kwargs = {}
    if req.guidance_scale is not None and req.guidance_scale > 0.0:
        extra_kwargs["guidance_scale"] = req.guidance_scale
        if req.negative_prompt:
            extra_kwargs["negative_prompt"] = req.negative_prompt
    elif "turbo" in (current_model_id or "").lower():
        extra_kwargs["guidance_scale"] = 0.0

    with torch.inference_mode():
        result = pipeline(
            prompt=req.prompt,
            width=req.width,
            height=req.height,
            num_inference_steps=req.num_inference_steps,
            generator=generator,
            **extra_kwargs,
        )

    image: Image.Image = result.images[0]
    gen_time = round(time.time() - start_time, 2)

    buffered = io.BytesIO()
    image.save(buffered, format="PNG", optimize=True)
    img_bytes = buffered.getvalue()

    base64_str = base64.b64encode(img_bytes).decode("utf-8")
    data_url = f"data:image/png;base64,{base64_str}"

    return {
        "success": True,
        "data_url": data_url,
        "image_bytes": img_bytes,
        "generation_time_seconds": gen_time,
        "prompt": req.prompt,
        "model": current_model_id,
        "dimensions": f"{image.width}x{image.height}",
    }

# ---------------------------------------------------------------------------
# Direct Diffusers Endpoints
# ---------------------------------------------------------------------------

@ai_router.post("/load-model")
@ai_router.post("/api/diffusers/load-model")
def load_model_endpoint(req: ModelLoadRequest):
    try:
        load_diffusion_pipeline(req.model_id_or_path)
        return {
            "success": True,
            "loaded_model": current_model_id,
            "gpu": get_gpu_info(),
        }
    except Exception as e:
        logger.error(f"Failed to load model {req.model_id_or_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@ai_router.post("/generate")
@ai_router.post("/api/diffusers/generate")
def generate_image_endpoint(req: GenerationRequest):
    try:
        res = run_diffusers_inference(req)
        if req.return_base64:
            return {
                "success": True,
                "data_url": res["data_url"],
                "generation_time_seconds": res["generation_time_seconds"],
                "prompt": res["prompt"],
                "model": res["model"],
                "dimensions": res["dimensions"],
            }
        else:
            return Response(content=res["image_bytes"], media_type="image/png")
    except Exception as e:
        logger.error(f"Image generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# Status & Health Checks
# ---------------------------------------------------------------------------

@ai_router.get("/api/ai/status")
async def check_all_ai_status(
    llamacpp_host: str = Query(default=DEFAULT_LLAMACPP_HOST),
    diffusers_host: Optional[str] = Query(default=None),
):
    """Checks the health and status of all configured AI inference engines."""
    gpu = get_gpu_info()
    status_result = {
        "llamacpp": {"online": False, "host": llamacpp_host, "info": None},
        "diffusers": {
            "online": gpu["torch_installed"],
            "host": diffusers_host or "in-process",
            "pipeline_loaded": pipeline is not None,
            "loaded_model": current_model_id,
            "gpu": gpu,
        },
    }

    # Check llama.cpp
    async with httpx.AsyncClient(timeout=2.5) as client:
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

        # If a remote diffusers host is explicitly specified and not local in-process
        if diffusers_host and "localhost:8000" not in diffusers_host and diffusers_host != "in-process":
            try:
                resp = await client.get(f"{diffusers_host.rstrip('/')}/health")
                if resp.status_code == 200:
                    status_result["diffusers"] = {"online": True, "host": diffusers_host, "info": resp.json()}
            except Exception as e:
                status_result["diffusers"] = {"online": False, "host": diffusers_host, "error": str(e)}

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
@ai_router.get("/health")
async def check_diffusers_status(host: Optional[str] = Query(default=None)):
    """Check status of Diffusers engine (in-process or remote)."""
    if host and "localhost:8000" not in host and host != "in-process" and "http" in host:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{host.rstrip('/')}/health")
                if resp.status_code == 200:
                    return {"online": True, **resp.json()}
                return {"online": False, "error": f"Status code {resp.status_code}"}
        except Exception as err:
            return {"online": False, "error": str(err)}

    gpu = get_gpu_info()
    return {
        "online": gpu["torch_installed"],
        "status": "healthy" if pipeline is not None else ("ready (on-demand)" if gpu["torch_installed"] else "degraded (no torch)"),
        "pipeline_loaded": pipeline is not None,
        "loaded_model": current_model_id,
        "gpu": gpu,
    }

# ---------------------------------------------------------------------------
# System Prompt & Story Turn Generation (Driven by system.txt)
# ---------------------------------------------------------------------------

def load_system_prompt_template() -> str:
    """Reads system.txt from data or workspace root or provides a robust fallback."""
    prompt_file = get_system_prompt_file()
    if prompt_file.exists() and prompt_file.is_file():
        try:
            with open(prompt_file, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content
        except Exception as e:
            logger.warning(f"Failed to read system.txt: {e}")

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
    3. Streams response from the LLM backend to the browser via SSE.
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
    host: Optional[str] = Query(default=None),
):
    """
    Unified streaming AI chat proxy for the LLM backend (/v1/chat/completions).
    """
    body = await request.json()

    target_host = host or DEFAULT_LLAMACPP_HOST
    target_url = f"{target_host.rstrip('/')}/v1/chat/completions"
    media_type = "text/event-stream"

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
    runs the diffusers pipeline directly in-process (or on remote host if specified),
    and saves/returns the generated image.
    """
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

    img_id = f"img_{int(datetime.now().timestamp()*1000)}_{uuid.uuid4().hex[:4]}.png"
    file_path = GENERATED_IMAGES_DIR / img_id

    # If remote host specified and not local
    if req.host and "localhost:8000" not in req.host and req.host != "in-process" and "http" in req.host:
        payload = {
            "prompt": enhanced_prompt,
            "negative_prompt": "blurry, low quality, deformed, text, watermark, bad anatomy, noisy, cropped",
            "width": req.width,
            "height": req.height,
            "num_inference_steps": req.steps,
            "return_base64": True,
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(f"{req.host.rstrip('/')}/generate", json=payload)
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=f"Remote diffusers error: {resp.text}")
                data = resp.json()
                data_url = data.get("data_url")
                if data_url and data_url.startswith("data:image/png;base64,"):
                    raw_b64 = data_url.split(",", 1)[1]
                    img_bytes = base64.b64decode(raw_b64)
                    with open(file_path, "wb") as f:
                        f.write(img_bytes)
                    data["file_url"] = f"/generated_images/{img_id}"
                return data
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail=f"Cannot connect to Diffusers service at {req.host}."
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # In-process generation
    gen_req = GenerationRequest(
        prompt=enhanced_prompt,
        width=req.width,
        height=req.height,
        num_inference_steps=req.steps,
        return_base64=True,
    )
    try:
        res = run_diffusers_inference(gen_req)
        with open(file_path, "wb") as f:
            f.write(res["image_bytes"])

        return {
            "success": True,
            "data_url": res["data_url"],
            "file_url": f"/generated_images/{img_id}",
            "generation_time_seconds": res["generation_time_seconds"],
            "prompt": enhanced_prompt,
            "model": res["model"],
            "dimensions": res["dimensions"],
        }
    except Exception as e:
        logger.error(f"In-process diffusers generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"In-process image generation failed: {str(e)}"
        )

class WorldIconRequest(BaseModel):
    name: Optional[str] = ""
    genre: Optional[str] = ""
    lore: Optional[str] = ""
    description: Optional[str] = ""
    tone: Optional[str] = ""
    host: Optional[str] = None

@ai_router.post("/api/ai/generate-world-icon")
async def generate_world_icon_endpoint(req: WorldIconRequest):
    """
    Analyzes the world lore, theme, genre, and name using the server LLM backend,
    and returns a fitting Material Symbols icon name and matching theme color.
    """
    combined_lore = f"World: {req.name}\nGenre: {req.genre}\nTone: {req.tone}\nDescription: {req.description}\nLore: {req.lore}".strip()

    target_host = req.host or DEFAULT_LLAMACPP_HOST
    target_url = f"{target_host.rstrip('/')}/v1/chat/completions"

    system_msg = (
        "You are an expert Material Design 3 stylist. Analyze the given fictional world lore, "
        "and return a JSON object with: "
        "'icon': a valid, concise Material Symbols icon name (e.g. fort, castle, rocket_launch, science, "
        "skull, tsunami, forest, volcano, explore, shield, diamond, temple_hindu, crown, psychology, "
        "local_fire_department, sports_martial_arts, auto_stories, public, water_drop, dark_mode, "
        "military_tech, sports_esports, travel_explore), and "
        "'color': a matching vibrant hex color code (e.g. #6750A4, #006494, #2E7D32, #B3261E, #9C27B0, #D97706, #0288D1). "
        "Output ONLY raw JSON with keys 'icon' and 'color'."
    )

    req_body = {
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": f"Choose the best icon and theme color for this lore:\n\n{combined_lore}"},
        ],
        "temperature": 0.3,
        "max_tokens": 100,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(target_url, json=req_body)
            if resp.status_code == 200:
                result_data = resp.json()
                content = result_data["choices"][0]["message"]["content"].strip()
                if "{" in content and "}" in content:
                    json_str = content[content.find("{"):content.rfind("}")+1]
                    parsed = json.loads(json_str)
                    icon = str(parsed.get("icon", "")).strip().lower().replace(" ", "_").replace("-", "_")
                    color = str(parsed.get("color", "")).strip()
                    if icon and color:
                        return {"icon": icon, "color": color}
    except Exception:
        pass

    # Heuristic fallback based on lore keywords if LLM backend is offline
    lower_text = combined_lore.lower()
    if any(k in lower_text for k in ["space", "sci-fi", "galaxy", "star", "cyber", "robot", "tech", "alien"]):
        return {"icon": "rocket_launch" if "space" in lower_text else "memory", "color": "#006494"}
    elif any(k in lower_text for k in ["horror", "undead", "zombie", "grim", "shadow", "dark", "death", "haunted"]):
        return {"icon": "skull", "color": "#7D5260"}
    elif any(k in lower_text for k in ["magic", "wizard", "sorcer", "spell", "arcane", "dragon", "dungeon"]):
        return {"icon": "auto_stories", "color": "#6750A4"}
    elif any(k in lower_text for k in ["sea", "ocean", "water", "island", "pirate", "sail", "underwater"]):
        return {"icon": "tsunami", "color": "#0288D1"}
    elif any(k in lower_text for k in ["forest", "nature", "jungle", "wild", "beast", "tree", "plant"]):
        return {"icon": "forest", "color": "#2E7D32"}
    elif any(k in lower_text for k in ["fire", "volcano", "lava", "desert", "sun", "flame", "heat"]):
        return {"icon": "local_fire_department", "color": "#D97706"}
    elif any(k in lower_text for k in ["war", "battle", "sword", "knight", "kingdom", "empire", "castle"]):
        return {"icon": "fort", "color": "#B3261E"}
    else:
        return {"icon": "travel_explore", "color": "#6750A4"}
