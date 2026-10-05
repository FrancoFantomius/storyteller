# Storyteller

Storyteller is an interactive storytelling platform and choose-your-own-adventure engine. It provides a browser interface for text-based role-playing, dynamic world creation, and procedural image generation using locally hosted language and diffusion models.

## Overview

The application is composed of three primary services:
1. **Frontend**: Single-page application built with Vite and Material Design 3 Web Components (`@francofantomius/material-components`).
2. **Backend**: FastAPI Python server managing campaigns, world definitions, prompt assembly, and inference routing.
3. **Inference Services**: Local LLM inference via the dedicated LLM backend (llama.cpp server), along with local image generation via a PyTorch Diffusers microservice.

## Features

### Gameplay Engine
- **Input Modes**: Switch between explicit action types:
  - `Do`: Physical and tactical actions performed by the character.
  - `Say`: Direct in-character dialogue.
  - `Story`: Scene direction, environmental progression, and third-person events.
  - `Direct`: Explicit instructions to guide narration style or introduce scenario events.
- **Skill Checks**: Integrated D20 dice roller evaluating character attributes (Strength, Agility, Intelligence, Charisma, Willpower) against target Difficulty Classes (DC).
- **Turn Management**: Full history tracking with the ability to edit, retry, or branch past narrative steps.
- **Scene Illustration**: Automated prompt synthesis for generating visual scene cards based on current story context.

### World and Scenario Editor
- **Lorebooks**: Keyword-triggered encyclopedias that dynamically inject lore, faction details, NPC sheets, and location data into model context.
- **Character Archetypes**: Customizable starting stats, biographical details, and inventory.
- **Narrative Tone Configuration**: Configurable system prompt modifiers per world to steer narration style.
- **Import and Export**: JSON-based serialization for backing up and sharing worlds and campaigns.

### Local Inference Support
- **Text Generation**: Native support for OpenAI-compatible `/v1/chat/completions` endpoints (llama.cpp server) with automatic Hugging Face model downloading.
- **Image Generation**: Dedicated Stable Diffusion service supporting AMD ROCm GPU acceleration, Hugging Face caching, and CPU fallback.

## Quickstart with Docker (Recommended)

You don't need to clone the repository or install Python. You only need **`docker-compose.yml`** and **`.env.example`**.

### 1. Download Files
Download [docker-compose.yml](https://raw.githubusercontent.com/FrancoFantomius/storyteller/refs/heads/main/docker-compose.yml) and [.env.example](https://raw.githubusercontent.com/FrancoFantomius/storyteller/refs/heads/main/.env.example) into an empty directory:

```bash
# Copy .env.example to .env
cp .env.example .env
```

*(Optional)* Open `.env` and set `HSA_OVERRIDE_GFX_VERSION` if you are using an AMD GPU (e.g., `11.0.0` for RX 7000 series, `10.3.0` for RX 6000 series).

### 2. Start the Stack
```bash
docker compose up -d
```

### 3. Open the App
Visit [http://localhost:8000](http://localhost:8000) in your web browser.

> [!NOTE]
> **Data Persistence**: All worlds, campaigns, and generated images are automatically saved to `./data/` in your directory. Downloaded models are cached in `./models/llm/` and `./hf_cache/`, so they will not be re-downloaded on future restarts.

---

## Configuration Reference

Key environment variables configurable in `.env`:

| Variable | Description | Default |
|---|---|---|
| `HSA_OVERRIDE_GFX_VERSION` | ROCm GPU target architecture override | `11.0.0` |
| `LLAMA_MODEL_REPO_ID` | Hugging Face GGUF repository | `bartowski/dolphin-2.8-mistral-7b-v02-GGUF` |
| `LLAMA_MODEL_FILENAME` | GGUF model filename in repository | `dolphin-2.8-mistral-7b-v02-Q6_K.gguf` |
| `LLAMA_CTX_SIZE` | Context window length for llama.cpp | `4096` |
| `LLAMA_N_GPU_LAYERS` | Number of layers to offload to GPU | `99` |
| `DIFFUSERS_MODEL_ID` | HuggingFace diffusion model identifier | `stabilityai/sd-turbo` |
| `HF_TOKEN` | *(Optional)* Hugging Face access token for gated models | `""` |
| `PORT` | Web application port | `8000` |

---

## Manual Development Setup (Without Docker)

For developers contributing to the codebase:

### 1. Download Models
```bash
python download_models.py --all
```

### 2. Backend Server
```bash
pip install -r requirements.txt
python server/server.py
```
The FastAPI backend will run on `http://localhost:8000`.

### 3. Frontend Development Server
```bash
npm install
npm run dev
```
The Vite dev server will run on `http://localhost:5173` with API calls automatically proxied to the backend.

### 4. Diffusers Microservice (Optional)
```bash
cd services/diffusers
pip install -r requirements.txt
python server.py
```
The Diffusers microservice will run on `http://localhost:8001`.

---

## CI/CD and Releases

Automated releases are managed through GitHub Actions (`.github/workflows/release.yml`).

When a commit pushed to `main` updates the version in `package.json`:
1. The workflow builds and publishes container images to GitHub Container Registry (`ghcr.io`):
   - `ghcr.io/francofantomius/storyteller:latest`
   - `ghcr.io/francofantomius/storyteller-diffusers:latest`
2. A GitHub Release is created with release notes and downloadable assets.

## License

This project is licensed under the [MIT License](LICENSE).
