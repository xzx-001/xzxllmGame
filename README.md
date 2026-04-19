# xzxllmGame

<p align="center">
  <b>Open Source LLM Game Content Generation Engine</b><br>
  Dynamically generate storylines, puzzles, dialogues, and game instructions through LLM — providing intelligent content interfaces for game developers
</p>

<p align="center">
  <a href="./README.zh-CN.md">🇨🇳 中文</a> | <b>🇬🇧 English</b>
</p>

<p align="center">
  <a href="#-core-features">Core Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-project-structure">Project Structure</a> •
  <a href="#-extending">Extending</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## 📌 Project Positioning

**xzxllmGame** is an open-source content generation middleware for game developers. The core goal of this project is not to implement specific game mechanics, but to:

- **Provide standardized interfaces**: Enable any game engine (Unity, Unreal, custom engines) to obtain AI-generated content through API/SDK
- **Dynamic content generation**: Real-time generation of story text, mini-game configurations, NPC dialogue trees, level instructions based on LLM
- **Intelligent difficulty adaptation**: Dynamically adjust content difficulty based on player performance for personalized gaming experience
- **Multi-backend compatibility**: Support local models, Ollama services, OpenAI/Anthropic cloud APIs simultaneously

> 💡 **Design Philosophy**: The game handles rendering, input, physics, and core gameplay, while xzxllmGame decides "what should appear in the game."
>
> 🤖 **About This Project**: Most of the code in this project was developed with AI assistance (Claude Code). The `AGENTS.md` file is specifically designed for AI coding assistants to help them quickly understand the project architecture and development standards. The source code contains detailed Chinese comments aimed at facilitating human developers' understanding, learning, and future maintenance.

---

## ✨ Core Features

| Feature                                              | Description                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 🎮**Multi-type content generation**            | Sokoban, laser reflection, circuit connection, sliding puzzle, text riddle, and other mini-game configuration generation |
| 🤖**Multi-LLM backend support**                | Local models (node-llama-cpp), Ollama, OpenAI, Anthropic Claude, custom OpenAI-compatible APIs                           |
| 🧠**Intelligent difficulty adjustment (DDDA)** | Dynamic difficulty system based on player history, automatically balancing challenge and frustration                     |
| 🏭**Factory pattern architecture**             | Highly modular design, mini-game generators and LLM providers can be dynamically registered and extended at runtime      |
| 💾**Flexible storage backends**                | SQLite (default, zero-config), Redis (distributed), Memory (testing/development)                                         |
| 🎭**Narrative wrapping system**                | Wrap cold game mechanics into dynamic storylines (e.g., describing "pushing boxes" as "adjusting quantum prisms")        |
| 🌐**Multiple access methods**                  | TypeScript SDK, HTTP REST API, WebSocket real-time push                                                                  |
| 🔌**Engine-agnostic design**                   | Support Unity, Unreal, Cocos, and other mainstream game engines through adapter pattern                                  |

---

## 🏗️ Architecture

### Design Principles

xzxllmGame adopts **Factory Method Pattern** as the core design pattern, following these principles:

1. **Single Responsibility (SRP)**: Each module is responsible for only one thing—LLM module only calls models, generator module only builds prompts, storage module only handles data persistence
2. **Open/Closed (OCP)**: Open for extension, closed for modification. Adding new mini-game types doesn't require modifying engine core code
3. **Dependency Inversion (DIP)**: High-level modules depend on abstract interfaces (`ILLMProvider`, `IMiniGameGenerator`, `StorageAdapter`), not concrete implementations
4. **Interface Segregation (ISP)**: Each interface is lean and focused, avoiding "fat interfaces"

### Core Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Game Client                               │
│   (Unity / Unreal / Web / Custom Engine — game logic not        │
│    included in this project)                                     │
└────────────────────┬────────────────────────────────────────────┘
                     │ ① SDK / HTTP / WebSocket
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Layer (src/api/)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  GameClient  │  │ HTTP Server  │  │ WebSocket Handler    │  │
│  │     SDK      │  │  (REST API)  │  │ (Real-time progress) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     │ ② Call Engine
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Core Engine (src/core/)                     │
│                                                                  │
│   ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│   │   Engine    │───▶│   Container  │───▶│   EventBus      │   │
│   │  (Facade)   │    │  (DI)        │    │  (Event Bus)    │   │
│   └──────┬──────┘    └──────────────┘    └─────────────────┘   │
│          │                                                       │
│          │ Coordination                                          │
│          ▼                                                       │
│   ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│   │ ConfigManager│   │ Generation   │    │ Health Check    │   │
│   └─────────────┘    │ Queue Control│    └─────────────────┘   │
│                      └──────────────┘                          │
└────────────────────┬────────────────────────────────────────────┘
                     │ ③ Call Services
         ┌───────────┼───────────┐
         ▼           ▼           ▼
┌─────────────┐ ┌──────────┐ ┌─────────────┐
│   LLM Module│ │ Generation│ │ Memory      │
│ (src/llm/)  │ │ (src/gen) │ │ (src/mem)   │
└─────────────┘ └──────────┘ └─────────────┘
```

### Factory Method Pattern Application

This project uses factory method pattern in two core locations:

#### 1. LLM Provider Factory (`src/llm/factory.ts`)

```typescript
// Dynamically register new LLM backends at runtime
LLMProviderFactory.registerProvider('myapi', MyCustomProvider);

// Create corresponding instance through configuration
const provider = LLMProviderFactory.createProvider({
  provider: 'ollama',
  model: 'qwen2.5:7b'
});
```

**Supported Providers**:

- `local` — Local GGUF models (loaded directly via node-llama-cpp)
- `ollama` — Ollama HTTP service (supports local/remote)
- `openai` — OpenAI / Azure OpenAI API
- `anthropic` — Anthropic Claude API
- `custom` — Any custom API with OpenAI-compatible format

#### 2. Mini-Game Generator Factory (`src/generation/minigame/factory.ts`)

```typescript
// Register new game type generators
MiniGameGeneratorFactory.register(new PushboxGenerator());
MiniGameGeneratorFactory.register(new LaserGenerator());

// Get corresponding generator by type
const generator = MiniGameGeneratorFactory.getGenerator(MiniGameType.PUSHBOX);
```

**Built-in Generator Implementation Status**:

| Generator          | Type                | Status       | Description                                                          |
| ------------------ | ------------------- | ------------ | -------------------------------------------------------------------- |
| Pushbox (Sokoban)  | Spatial Planning    | ✅ Completed | 561 lines, includes deadlock detection, dependency chain calculation |
| Laser Mirror       | Optics/Angle        | ✅ Completed | 659 lines, full implementation                                       |
| Circuit Connection | Logic/Topology      | ❌ Pending   | Empty file, needs implementation                                     |
| Sliding Puzzle     | Klotski             | ❌ Pending   | Empty file, needs implementation                                     |
| Text Riddle        | Pure Text Reasoning | ❌ Pending   | Empty file, needs implementation                                     |

---

## 📁 Project Structure

```
xzxllmGame/
├── 📁 .github/                          # GitHub Actions, Issue templates, etc.
│
├── 📁 src/                              # Source code (core)
│   ├── 📁 core/                         # Core infrastructure — framework "skeleton"
│   │   ├── interfaces/                  # Type definitions (DTO / Contracts)
│   │   │   ├── base.types.ts            # Core data models: Level, Player, Dialogue, etc.
│   │   │   ├── generation.types.ts      # Generation types: IMiniGameGenerator, ValidationResult
│   │   │   └── api.types.ts             # API types: SDKConfig, ApiResponse, WebSocketMessage
│   │   ├── engine.ts                    # Main engine (Facade) — unified external entry
│   │   ├── container.ts                 # DI Container — service locator pattern
│   │   ├── event-bus.ts                 # Strongly-typed event bus — component decoupling
│   │   └── config/                      # Configuration subsystem
│   │       ├── config-manager.ts        # Config manager (YAML/JSON/env multi-source loading)
│   │       └── default.config.ts        # Default config constants
│   │
│   ├── 📁 llm/                          # LLM Provider Module — "Brain"
│   │   ├── types.ts                     # LLM abstract interface (ILLMProvider, LLMConfig, LLMResponse)
│   │   ├── factory.ts                   # LLM factory — dynamically create provider instances
│   │   ├── base/
│   │   │   └── base-provider.ts         # Provider abstract base (exponential backoff retry, error classification)
│   │   └── providers/                   # Concrete provider implementations
│   │       ├── local-provider.ts        # Local models (node-llama-cpp loads GGUF)
│   │       ├── ollama-provider.ts       # Ollama HTTP API (streaming response support)
│   │       ├── openai-provider.ts       # OpenAI / Azure API
│   │       ├── anthropic-provider.ts    # Anthropic Claude API
│   │       └── custom-provider.ts       # Custom OpenAI-compatible APIs (DeepSeek, Grok, etc.)
│   │
│   ├── 📁 generation/                   # Content Generators — "Creative Workshop"
│   │   ├── 📁 minigame/                 # Mini-game generator factory
│   │   │   ├── types.ts                 # Mini-game generator interface (IMiniGameGenerator)
│   │   │   ├── factory.ts               # Generator registry factory (runtime dynamic registration)
│   │   │   ├── base-generator.ts        # Mini-game generator abstract base (JSON extraction, validation framework)
│   │   │   └── generators/              # Concrete mini-game implementations
│   │   │       ├── pushbox-generator.ts # Pushbox generator (561 lines, deadlock detection, dependency chain) ✅
│   │   │       ├── laser-generator.ts   # Laser reflection generator (659 lines) ✅
│   │   │       ├── circuit-generator.ts # [Pending] Circuit connection generator (empty file)
│   │   │       ├── riddle-generator.ts  # [Pending] Text riddle generator (empty file)
│   │   │       └── sliding-generator.ts # [Pending] Sliding puzzle generator (empty file)
│   │   │
│   │   ├── 📁 narrative/                # Narrative generation — "Scriptwriter"
│   │   │   ├── narrative-generator.ts   # Story generator (generates intros, transitions via LLM)
│   │   │   ├── prompt-builder.ts        # Prompt builder (integrates player profile, mood, theme)
│   │   │   └── templates/               # Narrative template library (by AIMood)
│   │   │       ├── intro-templates.ts   # Intro templates (playful/stubborn/concerned tones)
│   │   │       └── bridge-templates.ts  # Level transition text templates
│   │   │
│   │   └── 📁 dialogue/                 # Dialogue generation — "Voice Director"
│   │       ├── dialogue-generator.ts    # Dialogue tree generator (271 lines, DialogueNode[] with branches)
│   │       ├── context-builder.ts       # Dialogue context builder (156 lines, integrates memory, mood, worldview)
│   │       └── emotion-analyzer.ts      # [Pending] Emotion analyzer (analyzes player input sentiment)
│   │
│   ├── 📁 memory/                       # Long-term memory system — "Save Point"
│   │   ├── storage/                     # Storage adapters (adapter pattern)
│   │   │   ├── base-storage.ts          # Storage abstract interface (StorageAdapter)
│   │   │   ├── sqlite-adapter.ts        # SQLite implementation (default, zero-config, single file)
│   │   │   ├── memory-adapter.ts        # Memory storage (dev/testing, Map implementation)
│   │   │   └── redis-adapter.ts         # Redis implementation (distributed/high-concurrency)
│   │   ├── models/                      # Data model definitions
│   │   │   ├── player-profile.ts        # Player profile model (skill rating, frustration, relationship stage)
│   │   │   ├── narrative-state.ts       # Narrative state model (session-level temporary state)
│   │   │   └── observation.ts           # Observation record model (player behavior/feedback)
│   │   ├── memory-service.ts            # Memory service facade (unified external interface)
│   │   └── analytics/                   # Analytics module (data-driven difficulty adjustment)
│   │       ├── difficulty-analyzer.ts   # Difficulty analyzer (calculates target difficulty from history)
│   │       └── sentiment-analyzer.ts    # Sentiment analyzer (determines player emotion positive/negative)
│   │
│   ├── 📁 api/                          # External interface layer — "External Window"
│   │   ├── 📁 sdk/                      # Game client SDK (TypeScript/JavaScript projects)
│   │   │   ├── game-client-sdk.ts       # Main SDK class (775 lines, full implementation) ✅
│   │   │   ├── types.ts                 # SDK-specific type definitions (371 lines) ✅
│   │   │   ├── index.ts                 # SDK module entry (57 lines) ✅
│   │   │   └── adapters/                # Game engine adapters
│   │   │       ├── unity-adapter.ts     # Unity C# adapter (478 lines, with C# examples) ✅
│   │   │       └── unreal-adapter.ts    # Unreal Engine adapter (567 lines, with C++/Blueprint examples) ✅
│   │   │
│   │   ├── 📁 http/                     # HTTP REST API (optional standalone service deployment)
│   │   │   ├── server.ts                # HTTP server wrapper (393 lines, native Node.js http) ✅
│   │   │   ├── utils.ts                 # HTTP utilities (203 lines, request/response helpers) ✅
│   │   │   ├── routes/                  # API route definitions
│   │   │   │   ├── level.routes.ts      # Level generation routes (331 lines) ✅
│   │   │   │   ├── player.routes.ts     # Player data routes (330 lines) ✅
│   │   │   │   └── feedback.routes.ts   # Feedback routes (379 lines) ✅
│   │   │   └── middleware/              # Middleware
│   │   │       ├── auth.ts              # API Key auth middleware (340 lines, multi-source extraction) ✅
│   │   │       └── rate-limit.ts        # Rate limiting middleware (372 lines, token bucket) ✅
│   │   │
│   │   ├── 📁 websocket/                # WebSocket real-time interface (optional)
│   │   │   └── socket-handler.ts        # Real-time progress push (401 lines, heartbeat/subscription) ✅
│   │   │
│   │   └── server.ts                    # API server main entry (265 lines, HTTP + WebSocket integration) ✅
│   │
│   ├── 📁 utils/                        # Utilities — "Toolbox"
│   │   ├── content-loader.ts            # Content file loader (699 lines, hot reload, caching, multi-format) ✅
│   │   ├── logger.ts                    # Leveled logging (debug/info/warn/error)
│   │   ├── validators/                  # Validators collection
│   │   │   ├── json-validator.ts        # LLM response JSON cleaning/validation (handles markdown wrapping)
│   │   │   └── schema-validator.ts      # JSON Schema data structure validation
│   │   └── helpers/                     # Helper functions
│   │       ├── string-helper.ts         # String processing (truncation, cleanup, template replacement)
│   │       └── math-helper.ts           # Math calculations (difficulty curves, smooth interpolation)
│   │
│   ├── 📁 cli/                          # Command line tools — "DevOps Tools"
│   │   ├── commands/                    # Subcommand implementations
│   │   │   ├── generate.ts              # Generate test levels (325 lines) ✅
│   │   │   ├── verify-config.ts         # Verify config file, show env mappings (445 lines) ✅
│   │   │   ├── db-migrate.ts            # Database migration, backup, cleanup (476 lines) ✅
│   │   │   ├── benchmark.ts             # LLM performance benchmark, multi-provider comparison (657 lines) ✅
│   │   │   └── index.ts                 # Command registry (39 lines) ✅
│   │   └── index.ts                     # CLI entry using Commander.js (88 lines) ✅
│   │
│   └── index.ts                         # Library entry file (exports public API)
│
├── 📁 content/                          # Content resources (non-code, hot reloadable)
│   ├── 📁 prompts/                      # AI prompt templates
│   │   ├── system-persona.json          # [Pending] AI persona/system prompt (empty file)
│   │   ├── minigames/                   # Mini-game generation prompts
│   │   │   ├── pushbox.json             # [Pending] Pushbox prompt template (empty file)
│   │   │   ├── laser-mirror.json        # [Pending] Laser reflection prompt (empty file)
│   │   │   ├── circuit-connection.json  # [Pending] Circuit connection prompt (empty file)
│   │   │   └── riddle.json              # [Pending] Text riddle prompt (empty file)
│   │   └── narrative/                   # Narrative generation prompts
│   │       ├── intro-prompts.json       # [Pending] Intro variants (empty file)
│   │       └── mood-adaptation.json     # [Pending] Mood adaptation rules (empty file)
│   │
│   ├── 📁 schemas/                      # JSON Schema (runtime validation)
│   │   ├── level.schema.json            # [Pending] Level data structure validation (empty file)
│   │   ├── minigame.schema.json         # [Pending] Mini-game config validation (empty file)
│   │   └── dialogue.schema.json         # [Pending] Dialogue tree validation (empty file)
│   │
│   └── 📁 templates/                    # Backup templates
│       └── fallback-levels/             # Fallback levels (when LLM fails)
│           ├── easy-template.json       # [Pending] Easy level template
│           └── hard-template.json       # [Pending] Hard level template
│
├── 📁 config/                           # Config example files
│   ├── config.example.yaml              # Full config example (all options documented)
│   ├── config.ollama.yaml               # Ollama quick config template
│   ├── config.openai.yaml               # OpenAI quick config template
│   └── config.local.yaml                # Local model quick config template
│
├── 📁 docs/                             # Documentation (for developers and users)
│   ├── 📁 guide/                        # User guides
│   │   ├── getting-started.md           # Quick start tutorial
│   │   ├── configuration.md             # Configuration details
│   │   ├── architecture.md              # Architecture deep dive
│   │   └── best-practices.md            # Production best practices
│   ├── 📁 api/                          # API reference
│   │   ├── engine.md                    # Engine API docs
│   │   ├── sdk.md                       # SDK usage docs
│   │   ├── llm-providers.md             # LLM provider integration guide
│   │   └── minigame-generators.md       # Mini-game generator development guide
│   ├── 📁 development/                  # Development docs
│   │   ├── contributing.md              # Contributing guide (PR process, code standards)
│   │   ├── coding-standards.md          # Code standards and comment standards
│   │   └── testing.md                   # Testing guide (unit, integration)
│   └── assets/                          # Documentation images
│       └── architecture-diagram.png
│
├── 📁 examples/                         # Usage examples
│   ├── 📁 basic/                        # Basic examples
│   │   ├── simple-generation.ts         # Simplest level generation example
│   │   └── custom-provider.ts           # Custom LLM provider integration example
│   ├── 📁 advanced/                     # Advanced examples
│   │   ├── dynamic-difficulty.ts        # Dynamic difficulty adjustment full example
│   │   ├── custom-minigame.ts           # Add custom mini-game type example
│   │   └── unity-integration/           # Unity integration example
│   │       ├── XZXLLMGameClient.cs      # C# client wrapper
│   │       └── ExampleScene.unity       # Example scene (optional)
│   └── 📁 configs/                      # Config example scripts
│       ├── ollama-setup.ts              # Ollama environment config script
│       └── openai-setup.ts              # OpenAI environment config script
│
├── 📁 tests/                            # Test suite (Vitest)
│   ├── 📁 unit/                         # Unit tests
│   │   ├── llm/                         # LLM module tests
│   │   │   ├── factory.test.ts          # Factory creation tests
│   │   │   └── providers.test.ts        # Provider mock tests
│   │   ├── generation/                  # Generator tests
│   │   │   ├── minigame-factory.test.ts
│   │   │   └── pushbox-generator.test.ts
│   │   └── memory/                      # Storage tests
│   │       └── sqlite-adapter.test.ts
│   │
│   ├── 📁 integration/                  # Integration tests
│   │   ├── end-to-end.test.ts           # End-to-end flow tests
│   │   └── api-routes.test.ts           # API route tests
│   │
│   ├── 📁 fixtures/                     # Test data
│   │   ├── sample-levels/               # Sample level JSONs
│   │   ├── mock-responses/              # LLM mock responses (for offline testing)
│   │   └── test-configs/                # Test-specific configs
│   │
│   └── setup.ts                         # Test environment initialization
│
├── 📁 scripts/                          # Build and ops scripts
│   ├── build.sh                         # Build script
│   ├── release.sh                       # Version release script
│   └── setup-models.sh                  # Local model auto-download script
│
├── .eslintrc.json                       # ESLint config
├── .prettierrc                          # Prettier formatting config
├── .gitignore                           # Git ignore rules
├── .npmignore                           # NPM publish ignore rules
├── Dockerfile                           # Docker build file (standalone service)
├── docker-compose.yml                   # Docker Compose (with Ollama integrated deployment)
├── LICENSE                              # MIT License
├── package.json                         # Node.js project config
├── README.md                            # English README (this file)
├── README.zh-CN.md                      # Chinese README
├── tsconfig.json                        # TypeScript compile config
└── tsconfig.build.json                  # Build-specific TS config (stricter)
```

---

## 🚀 Quick Start

### Requirements

- **Node.js**: >= 18.0.0 (recommended 20 LTS)
- **TypeScript**: >= 5.0 (for development)
- **SQLite**: Built-in, no additional installation needed (default storage)
- **Ollama**: Optional, for running open-source models locally ([download guide](https://ollama.com/download))

### Installation

```bash
# Install via npm (after npm publishing)
npm install xzxllm-game

# Or via yarn
yarn add xzxllm-game

# Or via pnpm
pnpm add xzxllm-game
```

### Basic Usage Example

#### 1. Using Ollama (Local Open Source Model)

```typescript
import { createEngine } from 'xzxllm-game';

// Create engine instance
const engine = createEngine({
  llm: {
    provider: 'ollama',
    model: 'qwen2.5:7b',      // Or other downloaded models
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
    maxTokens: 2000
  },
  storage: {
    type: 'sqlite',
    connectionString: './data/game.db'
  },
  generation: {
    enableNarrative: true,    // Enable narrative wrapping
    pregenerateCount: 2       // Pre-generate 2 levels for buffer
  }
});

// Initialize engine
await engine.initialize();

// Generate level
const level = await engine.generateLevel({
  playerId: 'player_001',
  sessionId: 'session_001',
  difficulty: 0.6,            // Difficulty 0.0 - 1.0
  theme: 'cyber'              // Theme style
});

console.log('Generated level:', level);
console.log('Mini-games:', level.miniGames);
console.log('Narrative intro:', level.narrativeBridge);

// Submit player feedback (for dynamic difficulty adjustment)
await engine.submitFeedback('session_001', {
  type: 'completion',
  content: 'Player completed in 45 seconds, excellent performance',
  importance: 8
});

// Release resources
await engine.dispose();
```

#### 2. Using OpenAI (Cloud API)

```typescript
const engine = createEngine({
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY,  // Read from environment
    temperature: 0.7
  }
});
```

#### 3. Using Local GGUF Model (No Network)

```typescript
const engine = createEngine({
  llm: {
    provider: 'local',
    model: 'qwen2.5-7b',
    localOptions: {
      modelPath: './models/qwen2.5-7b-q4.gguf',
      gpuLayers: 20,          // GPU acceleration layers (0 = CPU only)
      contextSize: 4096,      // Context window
      threads: 4              // CPU threads
    }
  }
});
```

---

## ⚙️ Configuration

### Full Config Example (`config/config.example.yaml`)

```yaml
# ═══════════════════════════════════════════════════
# xzxllmGame Full Config Example
# All fields optional, defaults from src/core/config/default.config.ts
# ═══════════════════════════════════════════════════

# ─── LLM Config ──────────────────────────────────────
llm:
  # Provider type: local | ollama | openai | anthropic | custom
  provider: ollama

  # Model name (format depends on provider)
  # - ollama: qwen2.5:7b, llama3, mistral, etc.
  # - openai: gpt-4o, gpt-4o-mini, gpt-3.5-turbo
  # - anthropic: claude-3-5-sonnet, claude-3-opus
  # - local: any name (for identification only)
  model: qwen2.5:7b

  # API base URL (required for ollama and custom)
  baseUrl: http://localhost:11434

  # API key (required for openai / anthropic / custom)
  # Can also use env vars LLM_API_KEY or OPENAI_API_KEY
  apiKey: ""

  # Local model-specific config (only when provider=local)
  localOptions:
    modelPath: "./models/model.gguf"   # GGUF model file path
    gpuLayers: 20                       # GPU offload layers (0=CPU, 20=all GPU)
    contextSize: 4096                   # Context length
    threads: 4                          # CPU inference threads

  # Default generation parameters
  temperature: 0.7       # 0.0=most deterministic, 2.0=most random
  maxTokens: 2000        # Max tokens per generation
  timeout: 30000         # Request timeout (ms)
  retryAttempts: 3       # Retry attempts on failure

# ─── Storage Config ──────────────────────────────────────
storage:
  # Storage type: sqlite | memory | redis
  type: sqlite

  # Connection string
  # - sqlite: file path, e.g., "./data/game.db"
  # - memory: no setting needed (memory only, lost on restart)
  # - redis: redis://localhost:6379/0
  connectionString: "./data/game.db"

# ─── Generation Config ──────────────────────────────────────
generation:
  # Pre-generate level count (buffer pool size, 0=disabled)
  pregenerateCount: 2

  # Enable narrative wrapping (wrap game mechanics in story)
  enableNarrative: true

  # Default difficulty coefficient (0.0-1.0, when player has no history)
  defaultDifficulty: 0.5

  # Generation timeout (ms)
  timeout: 60000

  # Max/min mini-game count
  maxMiniGames: 3
  minMiniGames: 1

# ─── Debug Config ──────────────────────────────────────
debug: false              # Enable for detailed logs (includes LLM prompts and raw responses)
logLevel: info            # debug | info | warn | error
```

### Environment Variable Overrides

All config items support environment variable overrides (following `ENV_MAPPINGS`):

```bash
# LLM config
export LLM_PROVIDER=ollama
export LLM_MODEL=qwen2.5:7b
export LLM_API_KEY=sk-xxx
export LLM_BASE_URL=http://localhost:11434

# Storage config
export STORAGE_TYPE=sqlite
export DATABASE_URL=./data/game.db

# Feature toggles
export ENABLE_NARRATIVE=true
export DEBUG=true
```

---

## 🔌 SDK / API Usage

### TypeScript SDK (Recommended)

Install npm package directly in game project:

```typescript
import { GameClientSDK } from 'xzxllm-game/api/sdk';

const sdk = new GameClientSDK({
  apiEndpoint: 'http://localhost:3000',
  apiKey: 'your-api-key'
});

// Request level
const level = await sdk.requestLevel({
  playerId: 'player_001',
  sessionId: 'session_001',
  difficulty: 0.5
});

// Submit feedback
await sdk.submitFeedback({
  sessionId: 'session_001',
  levelId: level.metadata.id,
  completionTime: 120,
  attempts: 3,
  success: true
});
```

### HTTP REST API

When deployed as a standalone service, game clients call via HTTP:

```bash
# Generate level
curl -X POST http://localhost:3000/api/levels \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "playerId": "player_001",
    "sessionId": "session_001",
    "difficulty": 0.5,
    "theme": "cyber"
  }'

# Submit feedback
curl -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session_001",
    "type": "completion",
    "content": "Completed in 45 seconds"
  }'
```

### WebSocket Real-time Push

For real-time generation progress (e.g., loading bar):

```typescript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'progress') {
    updateProgressBar(msg.payload.percent);
  }
};
```

---

## 🔧 Extending

### Adding Custom LLM Provider

Any class implementing `ILLMProvider` can be registered in the factory:

```typescript
import { BaseLLMProvider } from 'xzxllm-game/llm/base';
import { LLMProviderFactory } from 'xzxllm-game/llm';

class MyProvider extends BaseLLMProvider {
  readonly name = 'MyProvider';
  
  async initialize() { /* connection validation */ }
  protected async doGenerate(prompt, options) { /* actual request */ }
  async dispose() { /* resource cleanup */ }
}

// Register at runtime
LLMProviderFactory.registerProvider('myprovider', MyProvider);

// Use
const engine = createEngine({
  llm: { provider: 'myprovider', model: 'my-model' }
});
```

### Adding Custom Mini-Game Type

**Current completed generators:**

- **PushboxGenerator** (`src/generation/minigame/generators/pushbox-generator.ts`) - 561 lines, reference implementation
- **LaserGenerator** (`src/generation/minigame/generators/laser-generator.ts`) - 659 lines, reference implementation

**Pending generators (empty files, contributions welcome):**

- **CircuitGenerator** - Circuit connection puzzles
- **RiddleGenerator** - Text riddles
- **SlidingGenerator** - Sliding puzzles (Klotski)

Implement `IMiniGameGenerator` interface and register in factory:

```typescript
import { IMiniGameGenerator } from 'xzxllm-game/generation/minigame';
import { MiniGameGeneratorFactory } from 'xzxllm-game/generation/minigame/factory';

class ChessGenerator implements IMiniGameGenerator {
  readonly type = MiniGameType.CUSTOM;
  readonly name = 'Chess Puzzle';
  readonly supportedDifficultyRange = [0.3, 1.0];
  
  buildPrompt(context) {
    return `Generate a difficulty ${context.difficulty} chess endgame...`;
  }
  
  parseResponse(response, zoneId, position) {
    // Parse LLM returned JSON
    return { /* MiniGameZone object */ };
  }
  
  validate(zone) {
    // Validate puzzle solvability
    return { valid: true };
  }
  
  generateFallback(context) {
    // Fallback when LLM fails
    return { /* simple preset puzzle */ };
  }
}

MiniGameGeneratorFactory.register(new ChessGenerator());
```

---

## 📊 Development Status (As of 2026-04-19)

### Implemented Modules ✅

| Module                    | File                                                       | Lines   | Description                                                              |
| ------------------------- | ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| **LLM Providers**   | `src/llm/providers/*.ts`                                 | ~3200+  | 5 providers (local/ollama/openai/anthropic/custom) all complete          |
| **Core Engine**     | `src/core/engine.ts`                                     | 661     | Main engine complete, supports full level generation flow                |
| **Config Manager**  | `src/core/config/*.ts`                                   | 600+    | Configuration loading, validation, environment variable mapping complete |
| **DI Container**    | `src/core/container.ts`                                  | 283     | Dependency injection container with singleton and lifecycle management   |
| **Event Bus**       | `src/core/event-bus.ts`                                  | 156     | Strongly-typed event system complete                                     |
| **Mini-Game Factory** | `src/generation/minigame/factory.ts`                   | 353     | Factory registry with decorator-based auto-registration                  |
| **Pushbox Generator** | `src/generation/minigame/generators/pushbox-generator.ts` | 561   | Deadlock detection, dependency chain calculation, path planning          |
| **Laser Generator** | `src/generation/minigame/generators/laser-generator.ts`  | 659     | Full implementation with mirror reflection, beam splitters               |
| **Base Generator**  | `src/generation/minigame/base-generator.ts`              | 282     | Abstract base class providing common utilities                           |
| **Narrative Generation** | `src/generation/narrative/*.ts`                       | 1100+   | Generator, prompt-builder, templates all complete                        |
| **Dialogue Generation** | `src/generation/dialogue/*.ts`                         | 427     | Generator, context-builder complete                                      |
| **Player Models**   | `src/memory/models/*.ts`                                 | 800+    | PlayerProfile, NarrativeState, Observation models complete               |
| **Storage Adapters** | `src/memory/storage/*.ts`                               | 5200+   | sqlite, memory, redis adapters all complete                              |
| **Memory Service**  | `src/memory/memory-service.ts`                           | 200+    | Memory system facade interface                                           |
| **Content Loader**  | `src/utils/content-loader.ts`                            | 699     | Hot reload, caching, JSON/YAML support                                   |
| **SDK**             | `src/api/sdk/*.ts`                                       | 1771    | game-client-sdk, types, index, Unity/Unreal adapters all complete        |
| **HTTP API**        | `src/api/http/*.ts`                                      | 2600+   | server, routes, middleware, utils all complete                           |
| **WebSocket**       | `src/api/websocket/*.ts`                                 | 401     | socket-handler complete, heartbeat/subscription/broadcast support        |
| **API Server**      | `src/api/server.ts`                                      | 265     | HTTP + WebSocket integration entry point                                 |
| **CLI Tools**       | `src/cli/*.ts`                                           | ~2200   | 5 commands: generate, verify-config, db-migrate, benchmark              |
| **Unit Tests**      | `tests/unit/**/*.test.ts`                                | 2000+   | 104 tests passing                                                        |

### Pending Modules ❌

| Module                    | File                           | Priority | Description                              |
| ------------------------- | ------------------------------ | -------- | ---------------------------------------- |
| **Mini-Game Generators** | `circuit-generator.ts`         | Medium   | Empty file, needs circuit puzzle impl    |
| **Mini-Game Generators** | `riddle-generator.ts`          | Medium   | Empty file, needs text riddle impl       |
| **Mini-Game Generators** | `sliding-generator.ts`         | Medium   | Empty file, needs sliding puzzle impl    |
| **Emotion Analyzer**     | `emotion-analyzer.ts`          | Low      | File doesn't exist, create in dialogue/  |
| **Integration Tests**    | `tests/integration/*.test.ts`  | Medium   | Module path resolution issues to fix     |

---

## 🧪 Development & Testing

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Type check
npm run type-check

# Run tests
npm run test

# Lint
npm run lint

# Build
npm run build

# CLI tools
npx xzxllm-game generate --difficulty 0.5 --theme dungeon
npx xzxllm-game verify-config ./config.yaml
npx xzxllm-game benchmark --provider ollama --model qwen2.5:7b
```

---

## 🤝 Contributing

We welcome all forms of contribution! Please read [docs/development/contributing.md](docs/development/contributing.md) for detailed process.

### Quick Contribution Process

1. **Fork** this repository
2. **Create branch**: `git checkout -b feature/your-feature`
3. **Write code**: Follow existing code style, ensure detailed comments
4. **Add tests**: All new features must include unit tests
5. **Submit PR**: Clearly describe changes and motivation

### Comment Standards

As an open-source project, we require **very detailed comments** for other developers to quickly understand:

- Each file header must contain `@fileoverview` JSDoc
- Each exported interface/class/function must contain JSDoc
- Complex algorithms need inline comments explaining logic
- Type definition fields must contain Chinese descriptions

---

## 📄 License

This project uses [MIT License](LICENSE).

---

## 🙏 Acknowledgments

- Thanks to all open-source LLM projects (Ollama, llama.cpp, etc.) for making local deployment possible
- Thanks to the game developer community for feedback and suggestions

---

<p align="center">
  Made with ❤️ by xzx-001| <a href="https://github.com/xzxllm/xzxllmGame">GitHub</a>
</p>
