# Storyteller

Storyteller is an interactive storytelling platform and choose-your-own-adventure engine. It provides a browser interface for text-based role-playing, dynamic world creation, and procedural image generation using locally hosted language and diffusion models.

## Overview

The application is composed of three primary services:
1. **Frontend**: Single-page application built with Vite and Material Design 3 Web Components (`@francofantomius/material-components`).
2. **Backend**: FastAPI Python server managing campaigns, world definitions, prompt assembly, and inference routing.
3. **Inference Services**: Local LLM inference via llama.cpp server or Ollama, along with local image generation via a PyTorch Diffusers microservice.

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
- **Text Generation**: Native support for OpenAI-compatible `/v1/chat/completions` endpoints (llama.cpp server) and Ollama HTTP APIs.
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
- Docker and Docker Compose
- Node.js 20+ and npm (for local frontend development)
- Python 3.10+ (for local backend development)
- (Optional) AMD ROCm or NVIDIA GPU for hardware-accelerated inference

### Running with Docker Compose

1. Copy the sample environment file:
   ```bash
   cp .env.example .env
   ```

2. Place your GGUF language model into `models/llm/` (for example, `models/llm/model.gguf`).

3. Start all services:
   ```bash
   docker compose up --build
   ```

4. Open `http://localhost:8000` in a web browser.

### Manual Development Setup

#### 1. Backend Server
```bash
pip install -r requirements.txt
python server/server.py
```
The backend starts on `http://localhost:8000`.

#### 2. Frontend Development Server
```bash
npm install
npm run dev
```
The Vite development server runs on `http://localhost:5173` with API requests proxied to the backend.

#### 3. Image Generation Service (Optional)
```bash
cd services/diffusers
pip install -r requirements.txt
python server.py
```
The diffusers service runs on `http://localhost:8001`.

## Configuration

Environment variables can be defined in `.env` or passed via Docker Compose:

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port for the main application server | `8000` |
| `LLM_HOST` | URL of the OpenAI-compatible or llama.cpp endpoint | `http://llama-cpp:8080` |
| `DIFFUSERS_HOST` | URL of the diffusers image generation microservice | `http://diffusers:8001` |
| `LLAMA_MODEL_FILENAME` | File name of the GGUF model inside `./models/llm/` | `model.gguf` |
| `LLAMA_CTX_SIZE` | Context window length for llama.cpp | `4096` |
| `LLAMA_N_GPU_LAYERS` | Number of layers to offload to GPU in llama.cpp | `99` |
| `DIFFUSERS_MODEL_ID` | Hugging Face repository ID or path for image generation | `stabilityai/sd-turbo` |
| `HSA_OVERRIDE_GFX_VERSION` | ROCm GPU target architecture override | `11.0.0` |

## CI/CD and Releases

Automated releases are managed through GitHub Actions (`.github/workflows/release.yml`).

When a commit pushed to the `main` branch modifies the `version` field in `package.json`:
1. The workflow detects the version increment and validates that the corresponding git tag does not already exist.
2. The Docker images for the main application and the diffusers service are built and published to GitHub Container Registry (`ghcr.io`).
3. A GitHub Release is created for the version tag with automatically generated release notes.

## License

This project is licensed under the [MIT License](LICENSE).

