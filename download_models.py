#!/usr/bin/env python3
"""
Model Downloader for Storyteller
Downloads AI models to host storage (models/llm, hf_cache) using huggingface_hub.
"""

import os
import sys
import re
import argparse
from pathlib import Path

try:
    from huggingface_hub import hf_hub_download, snapshot_download
except ImportError:
    print("[!] 'huggingface_hub' is required. Please install it using:")
    print("    pip install huggingface_hub")
    sys.exit(1)

ROOT_DIR = Path(__file__).resolve().parent
MODELS_DIR = ROOT_DIR / "models"
LLM_DIR = MODELS_DIR / "llm"
DIFFUSERS_DIR = MODELS_DIR / "diffusers"
HF_CACHE_DIR = ROOT_DIR / "hf_cache"


def load_env_file(env_path: Path):
    """Simple parser for .env file."""
    env_vars = {}
    if not env_path.exists():
        return env_vars
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                env_vars[key.strip()] = val.strip().strip("'\"")
    return env_vars


def format_bytes(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024.0:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{size:.2f} PB"


def parse_hf_url(url: str):
    """Extracts repo_id, filename, and revision from a HuggingFace URL if present."""
    match = re.search(r"huggingface\.co/([^/]+/[^/]+)/(?:resolve|raw|blob)/([^/]+)/(.+)", url)
    if match:
        repo_id = match.group(1)
        revision = match.group(2)
        filename = match.group(3)
        return repo_id, filename, revision
    return None, None, None


def download_llm_model(repo_id: str, filename: str, revision: str = "main", token: str = None):
    """Downloads GGUF model for llama.cpp using huggingface_hub."""
    LLM_DIR.mkdir(parents=True, exist_ok=True)
    target_path = LLM_DIR / filename

    if target_path.exists() and target_path.stat().st_size > 1024 * 1024:
        print(f"[+] LLM Model already exists at {target_path} ({format_bytes(target_path.stat().st_size)}). Skipping.")
        return

    print(f"\n=== Downloading Text LLM Model ({filename}) from '{repo_id}' ===")
    
    downloaded_path = hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        revision=revision,
        local_dir=str(LLM_DIR),
        token=token,
    )
    print(f"[+] Successfully downloaded to {downloaded_path}")


def download_diffusers_model(model_id: str, token: str = None):
    """Pre-caches HuggingFace Diffusers model using huggingface_hub snapshot_download."""
    HF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    DIFFUSERS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\n=== Downloading Diffusers Model ({model_id}) ===")
    
    snapshot_download(
        repo_id=model_id,
        cache_dir=str(HF_CACHE_DIR),
        token=token,
        allow_patterns=["*.json", "*.txt", "*.fp16.safetensors", "unet/diffusion_pytorch_model.safetensors", "vae/*", "text_encoder/*"],
        ignore_patterns=["*.bin", "*.onnx*", "*.msgpack"]
    )
    print(f"[+] Model '{model_id}' successfully cached in {HF_CACHE_DIR}.")


def main():
    parser = argparse.ArgumentParser(description="Download AI models for Storyteller using huggingface_hub")
    parser.add_argument("--all", action="store_true", help="Download all models (LLM and Diffusers)")
    parser.add_argument("--llm", action="store_true", help="Download GGUF LLM model")
    parser.add_argument("--diffusers", action="store_true", help="Download Diffusers model")
    args = parser.parse_args()

    env_vars = load_env_file(ROOT_DIR / ".env")
    if not env_vars:
        env_vars = load_env_file(ROOT_DIR / ".env.example")

    hf_token = os.environ.get("HF_TOKEN") or env_vars.get("HF_TOKEN") or env_vars.get("HUGGING_FACE_HUB_TOKEN")

    # Determine LLM repo and filename
    llm_repo = os.environ.get("LLAMA_MODEL_REPO_ID", env_vars.get("LLAMA_MODEL_REPO_ID"))
    llm_filename = os.environ.get("LLAMA_MODEL_FILENAME", env_vars.get("LLAMA_MODEL_FILENAME", "dolphin-2.8-mistral-7b-v02-Q6_K.gguf"))
    llm_revision = "main"

    llm_download_url = os.environ.get(
        "LLAMA_MODEL_DOWNLOAD_URL",
        env_vars.get("LLAMA_MODEL_DOWNLOAD_URL", "https://huggingface.co/bartowski/dolphin-2.8-mistral-7b-v02-GGUF/resolve/main/dolphin-2.8-mistral-7b-v02-Q6_K.gguf")
    )

    if not llm_repo and llm_download_url:
        parsed_repo, parsed_file, parsed_rev = parse_hf_url(llm_download_url)
        if parsed_repo:
            llm_repo = parsed_repo
            llm_filename = parsed_file or llm_filename
            llm_revision = parsed_rev or "main"

    if not llm_repo:
        llm_repo = "bartowski/dolphin-2.8-mistral-7b-v02-GGUF"

    diffusers_model_id = os.environ.get("DIFFUSERS_MODEL_ID", env_vars.get("DIFFUSERS_MODEL_ID", "stabilityai/sd-turbo"))

    # If no flags passed, default to --all
    if not (args.all or args.llm or args.diffusers):
        args.all = True

    if args.all or args.llm:
        download_llm_model(llm_repo, llm_filename, revision=llm_revision, token=hf_token)

    if args.all or args.diffusers:
        download_diffusers_model(diffusers_model_id, token=hf_token)

    print("\n[✔] Setup completed.")


if __name__ == "__main__":
    main()
