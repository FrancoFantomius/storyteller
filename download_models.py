#!/usr/bin/env python3
"""
Model Downloader for Storyteller
Downloads AI models to host storage (models/llm, models/diffusers, hf_cache) on demand.
"""

import os
import sys
import argparse
import urllib.request
import subprocess
from pathlib import Path

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

def download_file_with_progress(url: str, destination: Path):
    """Downloads a file with a live terminal progress indicator."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_dest = destination.with_suffix(".download")
    
    print(f"\n[*] Downloading from: {url}")
    print(f"[*] Destination: {destination}")

    def reporthook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100.0, (downloaded / total_size) * 100.0)
            bar_length = 30
            filled = int(bar_length * downloaded / total_size)
            bar = "=" * filled + "-" * (bar_length - filled)
            sys.stdout.write(
                f"\r[{bar}] {percent:.1f}% ({format_bytes(downloaded)} / {format_bytes(total_size)})"
            )
        else:
            sys.stdout.write(f"\rDownloaded {format_bytes(downloaded)}")
        sys.stdout.flush()

    try:
        urllib.request.urlretrieve(url, temp_dest, reporthook=reporthook)
        if temp_dest.exists():
            temp_dest.replace(destination)
        print(f"\n[+] Successfully downloaded to {destination}")
    except Exception as e:
        if temp_dest.exists():
            temp_dest.unlink()
        print(f"\n[-] Download failed: {e}")
        raise e

def download_llm_model(model_filename: str, download_url: str):
    """Downloads GGUF model for llama.cpp."""
    LLM_DIR.mkdir(parents=True, exist_ok=True)
    target_path = LLM_DIR / model_filename
    if target_path.exists() and target_path.stat().st_size > 1024 * 1024:
        print(f"[+] LLM Model already exists at {target_path} ({format_bytes(target_path.stat().st_size)}). Skipping.")
        return
    print(f"\n=== Downloading Text LLM Model ({model_filename}) ===")
    download_file_with_progress(download_url, target_path)

def download_diffusers_model(model_id: str):
    """Pre-caches HuggingFace Diffusers model using huggingface_hub or diffusers."""
    HF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    DIFFUSERS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\n=== Downloading Diffusers Model ({model_id}) ===")
    
    try:
        from huggingface_hub import snapshot_download
        print(f"[*] Downloading snapshot of '{model_id}' to cache...")
        snapshot_download(repo_id=model_id, cache_dir=str(HF_CACHE_DIR))
        print(f"[+] Model '{model_id}' successfully cached in {HF_CACHE_DIR}.")
    except ImportError:
        print(f"[*] 'huggingface_hub' python package not found on host.")
        print(f"[*] The diffusers container will automatically cache the model to ./hf_cache when first generating an image.")

def main():
    parser = argparse.ArgumentParser(description="Download AI models for Storyteller")
    parser.add_argument("--all", action="store_true", help="Download all models (LLM and Diffusers)")
    parser.add_argument("--llm", action="store_true", help="Download GGUF LLM model")
    parser.add_argument("--diffusers", action="store_true", help="Download Diffusers model")
    args = parser.parse_args()

    env_vars = load_env_file(ROOT_DIR / ".env")
    if not env_vars:
        env_vars = load_env_file(ROOT_DIR / ".env.example")

    # Defaults
    llm_filename = os.environ.get("LLAMA_MODEL_FILENAME", env_vars.get("LLAMA_MODEL_FILENAME", "dolphin-2.8-mistral-7b-v02.Q4_K_M.gguf"))
    llm_download_url = os.environ.get(
        "LLAMA_MODEL_DOWNLOAD_URL",
        env_vars.get(
            "LLAMA_MODEL_DOWNLOAD_URL",
            "https://huggingface.co/TheBloke/dolphin-2.8-mistral-7b-v02-GGUF/resolve/main/dolphin-2.8-mistral-7b-v02.Q4_K_M.gguf"
        )
    )
    diffusers_model_id = os.environ.get("DIFFUSERS_MODEL_ID", env_vars.get("DIFFUSERS_MODEL_ID", "stabilityai/sd-turbo"))

    # If no flags passed, default to --all
    if not (args.all or args.llm or args.diffusers):
        args.all = True

    if args.all or args.llm:
        download_llm_model(llm_filename, llm_download_url)

    if args.all or args.diffusers:
        download_diffusers_model(diffusers_model_id)

    print("\n[✔] Setup completed.")

if __name__ == "__main__":
    main()
