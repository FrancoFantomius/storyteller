import os
import io
import time
import base64
import logging
from typing import Optional, List, Dict, Any
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("diffusers_service")

# Environment configurations
MODEL_ID = os.environ.get("DIFFUSERS_MODEL_ID", "stabilityai/sd-turbo")
HF_CACHE_DIR = os.environ.get("HF_HOME", "/root/.cache/huggingface")
LOCAL_MODELS_DIR = os.environ.get("LOCAL_MODELS_DIR", "/models")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

app = FastAPI(
    title="Storyteller Diffusers ROCm Microservice",
    description="ROCm-accelerated image generation service using HuggingFace Diffusers for Storyteller",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = None
current_model_id = None

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

def get_gpu_info() -> Dict[str, Any]:
    gpu_available = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if gpu_available else "CPU"
    vram_total_gb = 0.0
    vram_allocated_gb = 0.0

    if gpu_available:
        try:
            vram_total_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2)
            vram_allocated_gb = round(torch.cuda.memory_allocated(0) / (1024**3), 2)
        except Exception:
            pass

    return {
        "available": gpu_available,
        "device_name": device_name,
        "is_rocm": hasattr(torch.version, "hip") and bool(torch.version.hip),
        "hip_version": getattr(torch.version, "hip", None),
        "torch_version": torch.__version__,
        "vram_total_gb": vram_total_gb,
        "vram_allocated_gb": vram_allocated_gb,
    }

def load_diffusion_pipeline(model_id_or_path: str):
    global pipeline, current_model_id
    from diffusers import AutoPipelineForText2Image, DiffusionPipeline

    logger.info(f"Loading diffusion model: {model_id_or_path} on {DEVICE} ({DTYPE})...")
    start_time = time.time()

    # Determine if local directory or HuggingFace repo
    model_path = Path(model_id_or_path)
    if not model_path.exists() and (Path(LOCAL_MODELS_DIR) / model_id_or_path).exists():
        model_id_or_path = str(Path(LOCAL_MODELS_DIR) / model_id_or_path)

    try:
        pipe = AutoPipelineForText2Image.from_pretrained(
            model_id_or_path,
            torch_dtype=DTYPE,
            variant="fp16" if DTYPE == torch.float16 else None,
            use_safetensors=True,
            cache_dir=HF_CACHE_DIR,
        )
    except Exception as e:
        logger.warning(f"AutoPipeline failed, trying generic DiffusionPipeline: {e}")
        pipe = DiffusionPipeline.from_pretrained(
            model_id_or_path,
            torch_dtype=DTYPE,
            cache_dir=HF_CACHE_DIR,
        )

    pipe = pipe.to(DEVICE)

    # Memory optimizations for ROCm consumer GPUs
    if DEVICE == "cuda":
        try:
            pipe.enable_attention_slicing()
        except Exception:
            pass

    pipeline = pipe
    current_model_id = model_id_or_path
    elapsed = round(time.time() - start_time, 2)
    logger.info(f"Model {model_id_or_path} successfully loaded in {elapsed}s.")
    return pipeline

@app.on_event("startup")
async def startup_event():
    logger.info("Initializing Diffusers ROCm service...")
    gpu_info = get_gpu_info()
    logger.info(f"GPU Status: {gpu_info}")
    
    # Preload default model if configured
    try:
        load_diffusion_pipeline(MODEL_ID)
    except Exception as e:
        logger.error(f"Could not automatically load default model '{MODEL_ID}': {e}. Pipeline can be loaded on-demand.")

@app.get("/")
def root():
    return {
        "service": "Storyteller Diffusers ROCm Microservice",
        "status": "online",
        "gpu": get_gpu_info(),
        "loaded_model": current_model_id,
    }

@app.get("/health")
def health_check():
    gpu = get_gpu_info()
    return {
        "status": "healthy" if pipeline is not None else "degraded (no model loaded)",
        "pipeline_loaded": pipeline is not None,
        "loaded_model": current_model_id,
        "gpu": gpu,
    }

@app.post("/load-model")
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

@app.post("/generate")
def generate_image(req: GenerationRequest):
    global pipeline
    if pipeline is None:
        try:
            load_diffusion_pipeline(MODEL_ID)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Diffusers model pipeline is not ready: {str(e)}"
            )

    try:
        generator = None
        if req.seed is not None and req.seed >= 0:
            generator = torch.Generator(device=DEVICE).manual_seed(req.seed)

        start_time = time.time()
        
        # Adjust guidance scale and steps for turbo/lcm models if guidance is 0.0
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

        # Output format
        buffered = io.BytesIO()
        image.save(buffered, format="PNG", optimize=True)
        img_bytes = buffered.getvalue()

        if req.return_base64:
            base64_str = base64.b64encode(img_bytes).decode("utf-8")
            data_url = f"data:image/png;base64,{base64_str}"
            return {
                "success": True,
                "data_url": data_url,
                "generation_time_seconds": gen_time,
                "prompt": req.prompt,
                "model": current_model_id,
                "dimensions": f"{image.width}x{image.height}",
            }
        else:
            return Response(content=img_bytes, media_type="image/png")

    except Exception as e:
        logger.error(f"Image generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    logger.info(f"Starting Diffusers ROCm Server on port {port}...")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
