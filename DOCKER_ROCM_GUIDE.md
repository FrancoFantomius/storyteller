# Docker AMD GPU (ROCm) Passthrough Guide: llama.cpp & Diffusers

This guide explains how to run **Storyteller** with **llama.cpp** (for LLM narrative generation) and **HuggingFace Diffusers** (for AI scene illustration) inside Docker containers with your **AMD Radeon GPU passed through** via **ROCm (Radeon Open Compute)**.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Storyteller System                       │
├───────────────────────────────┬─────────────────────────────┤
│ 1. Storyteller App (Port 8000)│ FastAPI Fullstack & UI      │
│ 2. llama.cpp Server (Port 8080)│ GGUF LLM Text Generation    │
│ 3. Diffusers Server (Port 8001)│ Stable Diffusion Scene Art  │
├───────────────────────────────┴─────────────────────────────┤
│                   AMD GPU (ROCm / HIP)                      │
│      Device Passthrough: /dev/kfd & /dev/dri                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Prerequisites & AMD Driver Setup

### A. Windows (Docker Desktop + WSL2)

1. **AMD Adrenalin Driver**: Ensure you have modern AMD Adrenalin drivers installed on Windows (v23.10+ or newer recommended).
2. **WSL2 with Docker Desktop**:
   - Ensure Docker Desktop is configured to use the **WSL2 backend** (**Settings -> General -> Use the WSL 2 based engine**).
   - In your default WSL2 distribution (e.g. Ubuntu), verify that the GPU is visible:
     ```bash
     ls -la /dev/kfd /dev/dri
     ```
3. **AMD ROCm WSL Support**: Modern AMD Windows drivers pass the DirectML / ROCm GPU devices through WSL2 automatically to `/dev/kfd` and `/dev/dri`.

### B. Linux (Native Ubuntu / Debian / Fedora / Arch)

1. **User Permissions**: Add your user to the `video` and `render` groups:
   ```bash
   sudo usermod -a -G video,render $USER
   ```
2. **Kernel Modules**: Ensure `amdgpu` driver is loaded:
   ```bash
   ls -la /dev/kfd /dev/dri
   ```
3. **Verify ROCm Tools**:
   ```bash
   rocm-smi
   ```

---

## 3. AMD GPU Architecture Override (`HSA_OVERRIDE_GFX_VERSION`)

Most consumer AMD Radeon GPUs require setting `HSA_OVERRIDE_GFX_VERSION` so ROCm compiles/executes compatible HIP kernels:

| AMD GPU Model | Architecture | Set `HSA_OVERRIDE_GFX_VERSION` |
| :--- | :--- | :--- |
| **Radeon RX 7900 XTX / 7900 XT / 7800 XT / 7700 XT / 7600** | RDNA3 (Navi 3x) | `11.0.0` |
| **Radeon RX 6950 XT / 6900 XT / 6800 XT / 6800 / 6700 XT / 6750 XT** | RDNA2 (Navi 21/22) | `10.3.0` |
| **Radeon RX 6650 XT / 6600 XT / 6600 / 6500 XT** | RDNA2 (Navi 23/24) | `10.3.0` |
| **Radeon RX 5700 XT / 5700 / 5600 XT** | RDNA1 (Navi 10) | `10.1.0` |
| **Radeon VII / Vega 64 / Vega 56** | GFX9 | `9.0.0` |
| **Radeon Pro W7900 / W7800 / W6800 / Instinct MI200/MI300** | CDNA / RDNA Pro | `11.0.0` / `10.3.0` (Native) |

---

## 4. Setting up Models

### 1. Place your GGUF LLM Model
Download any `.gguf` model (e.g. from HuggingFace `bartowski/Meta-Llama-3.1-8B-Instruct-GGUF` or `Qwen/Qwen2.5-7B-Instruct-GGUF`) and place it inside:
```
./models/llm/model.gguf
```

### 2. Configure Diffusers Model
By default, the Diffusers service uses `stabilityai/sd-turbo` (ultra-fast 1 to 4 step generation) and caches models in `./hf_cache`.
You can also change `DIFFUSERS_MODEL_ID` in `.env` to:
- `runwayml/stable-diffusion-v1-5`
- `stabilityai/sdxl-turbo`
- `Lykon/dreamshaper-8`
- Or any local checkpoint in `./models/diffusers/`

---

## 5. Launching with Docker Compose

1. Copy `.env.example` to `.env` and adjust your GPU version:
   ```bash
   cp .env.example .env
   ```

2. Start the stack:
   ```bash
   docker compose up --build
   ```

3. Open your browser and go to:
   - **Storyteller UI**: `http://localhost:8000`
   - **Settings Page**: `http://localhost:8000/settings.html`
   - **llama.cpp Health**: `http://localhost:8080/health`
   - **Diffusers Health**: `http://localhost:8001/health`

---

## 6. How the GPU Passthrough is Defined in `docker-compose.yml`

```yaml
services:
  llama-cpp:
    image: ghcr.io/ggerganov/llama.cpp:server-rocm
    environment:
      - HSA_OVERRIDE_GFX_VERSION=11.0.0
      - HIP_VISIBLE_DEVICES=0
    devices:
      - /dev/kfd:/dev/kfd
      - /dev/dri:/dev/dri
    group_add:
      - video
      - render
    security_opt:
      - seccomp:unconfined

  diffusers:
    build: ./services/diffusers
    environment:
      - HSA_OVERRIDE_GFX_VERSION=11.0.0
      - HIP_VISIBLE_DEVICES=0
    devices:
      - /dev/kfd:/dev/kfd
      - /dev/dri:/dev/dri
    group_add:
      - video
      - render
    security_opt:
      - seccomp:unconfined
```

---

## 7. Troubleshooting & Verification

### Check GPU Detection in Diffusers:
```bash
docker exec -it storyteller-diffusers python3 -c "import torch; print('CUDA/ROCm Available:', torch.cuda.is_available(), 'Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None')"
```

### Check llama.cpp ROCm Acceleration:
```bash
docker logs storyteller-llamacpp
```
Look for `ggml_cuda_init: found 1 ROCm devices` and `offloaded 33/33 layers to GPU`.
