# Storyteller AI - Interactive Choose-Your-Own-Adventure Platform

An AI-powered, browser-based interactive storytelling platform that lets users create, explore, and play choose-your-own-adventure style games with virtually unlimited freedom.

Built with **Vite**, **TypeScript**, **@francofantomius/material-components** (Material Design 3 Web Components), and local **Ollama** LLM inference.

---

## 🌟 Key Features

### 1. 📖 Storyteller Game Mode & Freedom
- **Unlimited Agency**: Describe what you want your character to do, say, or how the environment changes—the AI responds dynamically with zero rigid quest constraints.
- **Storyteller Modes via M3 Segmented Buttons**:
  - ⚔️ **Do**: Execute physical or tactical actions (`> Inspect the ancient leylines...`)
  - 💬 **Say**: Deliver in-character dialogue (`> "Who commands the skyreach garrison?"`)
  - 📜 **Story**: Advance scene descriptions and environmental events (`> A storm gathers...`)
  - ⚡ **Direct (Storyteller Override)**: God-mode authorial guidance that instructs the AI narrator to reshape reality or introduce specific lore events.
- **Dynamic Quick Action Chips**: 1-tap contextual AI choices for fluid mobile interaction.
- **RPG D20 Skill Checks**: Roll 20-sided dice with character ability modifiers (Strength, Agility, Intelligence, Charisma, Willpower) against Difficulty Classes (DC).
- **Undo / Edit History**: Seamlessly rewrite previous turns, create branches, or adjust narrative details.
- **Atmospheric Procedural Artwork**: Real-time generative vector scene cards tailored to biome, genre, lighting, and keywords.
- **Ambient Soundscape Synthesizer & TTS**: Synthesized audio themes (Fantasy, Cyberpunk, Horror, Sci-Fi, Tavern) and text-to-speech voice narration.

### 2. 🌍 World & Scenario Creation Studio
- **Lorebook / Memory Engine**: Define entries with trigger keywords (locations, NPCs, factions, artifacts) that are dynamically injected into the AI context window whenever mentioned.
- **Playable Archetypes**: Customize starting roles, biographies, ability stats, and starter gear.
- **Starter Scenarios**: Create opening story hooks with custom difficulty ratings and starter actions.
- **Narrative Tone & Master Instructions**: Tune the AI narrator's style (Epic & Poetic, Gritty & Realistic, Dark & Suspenseful, Whimsical, Cinematic).
- **Pre-Built Worlds**: Ready-to-play universes across High Fantasy (*Aethelgard*), Cyberpunk (*Neo-Kyoto 2099*), Cosmic Horror (*The Sunken Vaults of Innsmouth*), and Hard Sci-Fi (*Starfarer Kepler Anomaly*).

### 3. 🌐 Community Universe Hub
- **Share & Discover**: Browse featured player-created worlds and shared adventure logs.
- **Like, Review, and Remix**: Rate community creations, write reviews, and fork existing worlds directly into your studio.
- **Export / Import JSON**: 1-click JSON backup, file download, or clipboard import for sharing with friends.

### 4. ⚙️ Local Ollama Inference & Fallback
- **Zero Configuration Proxy**: Connects directly to `http://localhost:11434` (or `/api/ollama` via Vite reverse proxy) without CORS issues.
- **Live Model Detection**: Auto-detects installed models (`llama3`, `mistral`, `gemma`, `phi3`, `qwen`, `deepseek`, etc.).
- **Built-In Simulator Fallback**: Enables instant testing and gameplay even if Ollama is warming up or offline.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### 3. (Optional) Run with Local Ollama
Make sure Ollama is installed and running on your machine:
```bash
ollama run llama3
```
In the Storyteller **Settings** tab, verify that the connection indicator shows **Ollama Online**.

---

## 🎨 Tech Stack & Architecture

- **Frontend**: Vite 5 + TypeScript + ESM Web Components
- **UI Components**: `@francofantomius/material-components` (Material Design 3 Lit-based components)
  - `<md-top-app-bar>` / `<md-top-bar>`
  - `<md-navigation-bar>` & `<md-navigation-rail>` (responsive layout)
  - `<md-card>`, `<md-button>`, `<md-icon-button>`, `<md-segmented-button>`
  - `<md-dialog>`, `<md-search-bar>`, `<md-chip>`, `<md-switch>`, `<md-slider>`, `<md-player>`
- **Inference Engine**: Ollama HTTP API with token streaming and dynamic memory injection.
- **Styling**: Standard Material Design 3 design tokens with Light/Dark theme switching and mobile-first responsive layout.
