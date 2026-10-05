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
- **Text Generation**: Native support for OpenAI-compatible `/v1/chat/completions` endpoints (llama.cpp server).
- **Image Generation**: Dedicated Stable Diffusion service supporting AMD ROCm GPU acceleration and CPU fallback.

## Project Structure

```text
├── .github/
│   └── workflows/
│       └── release.yml        # Automated release workflow on package.json version update
├── models/                    # Mounted directory for local GGUF models and diffusers weights
├── server/
│   ├── campaigns/             # Saved campaign states (JSON)
│   ├── generated_images/      # Persisted image generations
│   ├── worlds/                # World configurations and lorebooks (JSON)
│   ├── AI.py                  # Prompt builder and inference client
│   └── server.py              # FastAPI application server
├── services/
│   └── diffusers/             # Stable Diffusion microservice
│       ├── Dockerfile
│       ├── requirements.txt
│       └── server.py
├── src/
│   ├── components/            # Shared UI components
│   ├── pages/                 # Application views (play, world-editor, settings)
│   ├── services/              # Client-side API and state management
│   └── styles/                # Theme and design token definitions
├── docker-compose.yml         # Container orchestration for all services
├── Dockerfile                 # Multi-stage build for frontend and API backend
├── package.json               # Node.js dependencies and versioning
└── requirements.txt           # Python dependencies for the core server
```

## Getting Started

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- Python 3.10+ (for model downloading script) or manual download of your preferred GGUF models
- (Optional) AMD ROCm or NVIDIA GPU for hardware-accelerated LLM and image inference

---

### Running with Docker (Recommended)

Pre-built multi-arch Docker images are published automatically to the **GitHub Container Registry (GHCR)** with each [GitHub Release](https://github.com/francofantomius/storyteller/releases):
- Application (Frontend + FastAPI backend): `ghcr.io/francofantomius/storyteller:latest`
- Diffusers Microservice: `ghcr.io/francofantomius/storyteller-diffusers:latest`
- LLM Backend: `ghcr.io/ggerganov/llama.cpp:server-rocm`

#### 1. Obtain Configuration Files
You can clone the repository or simply download [`docker-compose.yml`](file:///c:/Users/franc/Programmazione/storyteller/docker-compose.yml) and [`.env.example`](file:///c:/Users/franc/Programmazione/storyteller/.env.example) from the latest release:

```bash
# Clone the repository
git clone https://github.com/francofantomius/storyteller.git
cd storyteller

# Create your local environment file
cp .env.example .env
```

#### 2. Download Model Weights
Run the included model downloader script to fetch the default GGUF text model and Diffusers pipeline:

```bash
python download_models.py --all
```

> [!TIP]
> You can also manually drop any OpenAI-compatible GGUF model into `./models/llm/` and configure its filename via `LLAMA_MODEL_FILENAME` in `.env`.

#### 3. Start the Services

Pull the pre-built images from GitHub Releases / GHCR and launch the stack:

```bash
# Pull official images from GHCR
docker compose pull

# Launch containers in background
docker compose up -d
```

If you prefer building images locally from source instead:
```bash
docker compose up --build -d
```

#### 4. Access the Application
Open [http://localhost:8000](http://localhost:8000) in your web browser.

> [!NOTE]
> **Data Persistence**: All worlds (`./server/worlds/`), campaign saves (`./server/campaigns/`), generated images (`./server/generated_images/`), and downloaded models (`./models/`, `./hf_cache/`) are mounted directly from your host directory, ensuring all your data persists across container restarts and image updates.

---

### Manual Development Setup (Without Docker)

If you want to develop on the codebase directly on your machine without Docker:

#### 1. Download Models
```bash
python download_models.py --all
```

#### 2. Backend Server
```bash
pip install -r requirements.txt
python server/server.py
```
The FastAPI backend will start on `http://localhost:8000`.

#### 3. Frontend Development Server
```bash
npm install
npm run dev
```
The Vite development server will run on `http://localhost:5173` with API calls automatically proxied to the backend.

#### 4. Image Generation Service (Optional)
```bash
cd services/diffusers
pip install -r requirements.txt
python server.py
```
The Diffusers microservice will run on `http://localhost:8001`.

## Configuration

Environment variables can be defined in `.env` or passed via Docker Compose:

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port for the main application server | `8000` |
| `LLM_HOST` | URL of the OpenAI-compatible or llama.cpp endpoint | `http://llama-cpp:8080` |
| `DIFFUSERS_HOST` | URL of the diffusers image generation microservice | `http://diffusers:8001` |
| `LLAMA_MODEL_FILENAME` | File name of the GGUF model inside `./models/llm/` | `dolphin-2.8-mistral-7b-v02.Q4_K_M.gguf` |
| `DIFFUSERS_MODEL_ID` | HuggingFace model repo or local directory for Diffusers | `stabilityai/sd-turbo` |
| `LLAMA_CTX_SIZE` | Context window length for llama.cpp | `4096` |
| `LLAMA_N_GPU_LAYERS` | Number of layers to offload to GPU in llama.cpp | `99` |
| `HSA_OVERRIDE_GFX_VERSION` | ROCm GPU target architecture override | `11.0.0` |

## CI/CD and Releases

Automated releases are managed through GitHub Actions (`.github/workflows/release.yml`).

When a commit pushed to the `main` branch modifies the `version` field in `package.json`:
1. The workflow detects the version increment and validates that the corresponding git tag does not already exist.
2. The Docker images for the main application and the diffusers service are built and published to GitHub Container Registry (`ghcr.io`).
3. A GitHub Release is created for the version tag with automatically generated release notes.

## License

This project is licensed under the [MIT License](LICENSE).

