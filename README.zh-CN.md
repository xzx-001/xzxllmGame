# xzxllmGame

<p align="center">
  <b>开源 LLM 游戏内容生成引擎</b><br>
  通过大语言模型动态生成剧情、谜题、对话与游戏指令 —— 为游戏开发者提供智能化内容接口
</p>

<p align="center">
  <b>🇨🇳 中文</b> | <a href="./README.md">🇬🇧 English</a>
</p>

<p align="center">
  <a href="#-核心特性">核心特性</a> •
  <a href="#-架构设计">架构设计</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-项目结构">项目结构</a> •
  <a href="#-扩展开发">扩展开发</a> •
  <a href="#-贡献指南">贡献指南</a>
</p>

---

## 📌 项目定位

**xzxllmGame** 是一个面向游戏开发者的开源内容生成中间件。本项目的核心目标不是实现具体的游戏玩法，而是：

- **提供标准化接口**：让任何游戏引擎（Unity、Unreal、自研引擎等）都能通过 API/SDK 获取 AI 生成的内容
- **动态内容生成**：基于 LLM 实时生成剧情文本、小游戏配置、NPC 对话树、关卡指令等
- **智能难度适配**：根据玩家表现动态调整内容难度，实现个性化的游戏体验
- **多后端兼容**：同时支持本地模型、Ollama 服务、OpenAI/Anthropic 等云端 API

> 💡 **设计理念**：游戏本身负责渲染、输入、物理等核心玩法，xzxllmGame 负责"决定游戏中应该出现什么"。

---

## ✨ 核心特性

| 特性                             | 说明                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| 🎮**多类型内容生成**       | 推箱子、激光反射、电路连接、滑块拼图、文字谜题等小游戏配置生成                       |
| 🤖**多 LLM 后端支持**      | 本地模型（node-llama-cpp）、Ollama、OpenAI、Anthropic Claude、自定义 OpenAI 兼容 API |
| 🧠**智能难度调整（DDDA）** | 基于玩家历史表现的动态难度系统，自动平衡挑战性与挫败感                               |
| 🏭**工厂模式架构**         | 高度模块化的设计，小游戏生成器、LLM 提供商均可运行时动态注册与扩展                   |
| 💾**灵活存储后端**         | SQLite（默认，零配置）、Redis（分布式）、内存（测试/开发）                           |
| 🎭**叙事包装系统**         | 将冷冰冰的游戏机制包装为动态剧情（如将"推箱子"描述为"调整量子棱镜"）                 |
| 🌐**多接入方式**           | 提供 TypeScript SDK、HTTP REST API、WebSocket 实时推送三种接入方式                   |
| 🔌**引擎无关设计**         | 通过适配器模式支持 Unity、Unreal、Cocos 等主流游戏引擎                               |

---

## 🏗️ 架构设计

### 设计原则

xzxllmGame 采用**工厂方法模式（Factory Method）**为核心设计模式，遵循以下原则：

1. **单一职责（SRP）**：每个模块只负责一件事，LLM 模块只管调用模型，生成器模块只管构建提示词，存储模块只管数据持久化
2. **开闭原则（OCP）**：对扩展开放，对修改关闭。新增小游戏类型无需修改引擎核心代码
3. **依赖倒置（DIP）**：高层模块依赖抽象接口（`ILLMProvider`、`IMiniGameGenerator`、`StorageAdapter`），不依赖具体实现
4. **接口隔离（ISP）**：每个接口精简专注，避免"胖接口"

### 核心架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        游戏客户端                                │
│   (Unity / Unreal / Web / 自研引擎 —— 本项目不包含游戏逻辑)       │
└────────────────────┬────────────────────────────────────────────┘
                     │ ① SDK / HTTP / WebSocket
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API 接口层 (src/api/)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  GameClient  │  │ HTTP Server  │  │ WebSocket Handler    │  │
│  │     SDK      │  │  (REST API)  │  │ (实时进度推送)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     │ ② 调用引擎
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      核心引擎层 (src/core/)                      │
│                                                                 │
│   ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│   │   Engine    │───▶│   Container  │───▶│   EventBus      │   │
│   │  (外观模式)  │    │  (依赖注入)   │    │  (事件总线)      │   │
│   └──────┬──────┘    └──────────────┘    └─────────────────┘   │
│          │                                                      │
│          │ 协调调度                                               │
│          ▼                                                      │
│   ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│   │ ConfigManager│   │  生成队列控制  │    │   健康检查       │   │
│   └─────────────┘    └──────────────┘    └─────────────────┘   │
└────────────────────┬────────────────────────────────────────────┘
                     │ ③ 调用具体服务
         ┌───────────┼───────────┐
         ▼           ▼           ▼
┌─────────────┐ ┌──────────┐ ┌─────────────┐
│   LLM 模块   │ │ 生成器模块 │ │  记忆模块    │
│ (src/llm/)  │ │(src/generation)│ │(src/memory/)│
└─────────────┘ └──────────┘ └─────────────┘
```

### 工厂方法模式应用

本项目在以下两处核心使用工厂方法模式：

#### 1. LLM 提供商工厂 (`src/llm/factory.ts`)

```typescript
// 运行时动态注册新的 LLM 后端
LLMProviderFactory.registerProvider('myapi', MyCustomProvider);

// 通过配置创建对应实例
const provider = LLMProviderFactory.createProvider({
  provider: 'ollama',
  model: 'qwen2.5:7b'
});
```

**支持的提供商**：

- `local` — 本地 GGUF 模型（通过 node-llama-cpp 直接加载）
- `ollama` — Ollama HTTP 服务（支持本地/远程）
- `openai` — OpenAI / Azure OpenAI API
- `anthropic` — Anthropic Claude API
- `custom` — 任何 OpenAI 兼容格式的自定义 API

#### 2. 小游戏生成器工厂 (`src/generation/minigame/factory.ts`)

```typescript
// 注册新的游戏类型生成器
MiniGameGeneratorFactory.register(new PushboxGenerator());
MiniGameGeneratorFactory.register(new LaserGenerator());

// 根据类型获取对应生成器
const generator = MiniGameGeneratorFactory.getGenerator(MiniGameType.PUSHBOX);
```

**内置生成器实现状态**：

| 生成器 | 类型 | 状态 | 说明 |
|--------|------|------|------|
| 推箱子（Pushbox）| 空间规划 | ✅ 已完成 | 561 行，含死锁检测、依赖链计算 |
| 激光反射（Laser Mirror）| 光学/角度 | ✅ 已完成 | 659 行，完整实现 |
| 电路连接（Circuit）| 逻辑/拓扑 | ❌ 待实现 | 空文件，需创建 |
| 滑块拼图（Sliding）| 华容道 | ❌ 待实现 | 空文件，需创建 |
| 文字谜题（Riddle）| 纯文本推理 | ❌ 待实现 | 空文件，需创建 |

---

## 📁 项目结构

```
xzxllmGame/
├── 📁 .github/                          # GitHub Actions、Issue 模板等
│
├── 📁 src/                              # 源代码（核心）
│   ├── 📁 core/                         # 核心基础设施 —— 框架的"骨架"
│   │   ├── interfaces/                  # 类型定义层（DTO / 契约）
│   │   │   ├── base.types.ts            # 核心数据模型：Level、Player、Dialogue 等
│   │   │   ├── generation.types.ts      # 生成相关类型：IMiniGameGenerator、ValidationResult
│   │   │   └── api.types.ts             # API 接口类型：SDKConfig、ApiResponse、WebSocketMessage
│   │   ├── engine.ts                    # 主引擎（外观模式 Facade）—— 统一对外入口
│   │   ├── container.ts                 # 依赖注入容器（DI Container）—— 服务定位器模式
│   │   ├── event-bus.ts                 # 强类型事件总线 —— 组件解耦通信
│   │   └── config/                      # 配置管理子系统
│   │       ├── config-manager.ts        # 配置管理器（支持 YAML/JSON/环境变量多源加载）
│   │       └── default.config.ts        # 默认配置常量与默认值
│   │
│   ├── 📁 llm/                          # LLM 提供商模块 —— "大脑"
│   │   ├── types.ts                     # LLM 抽象接口定义（ILLMProvider、LLMConfig、LLMResponse）
│   │   ├── factory.ts                   # LLM 工厂 —— 根据配置动态创建提供商实例
│   │   ├── base/
│   │   │   └── base-provider.ts         # 提供商抽象基类（含指数退避重试、错误分类）
│   │   └── providers/                   # 具体提供商实现（每个文件对应一个后端）
│   │       ├── local-provider.ts        # 本地模型（node-llama-cpp 加载 GGUF）
│   │       ├── ollama-provider.ts       # Ollama HTTP API（支持流式响应）
│   │       ├── openai-provider.ts       # OpenAI / Azure API
│   │       ├── anthropic-provider.ts    # Anthropic Claude API
│   │       └── custom-provider.ts       # 自定义 OpenAI 兼容 API（如 DeepSeek、Grok 等）
│   │
│   ├── 📁 generation/                   # 内容生成器模块 —— "创意工坊"
│   │   ├── 📁 minigame/                 # 小游戏生成器工厂
│   │   │   ├── types.ts                 # 小游戏生成器接口定义（IMiniGameGenerator）
│   │   │   ├── factory.ts               # 生成器注册表工厂（运行时动态注册）
│   │   │   ├── base-generator.ts        # 小游戏生成器抽象基类（含 JSON 提取、验证框架）
│   │   │   └── generators/              # 具体小游戏实现（每个文件一种游戏）
│   │   │       ├── pushbox-generator.ts # 推箱子生成器（561 行，含死锁检测、依赖链计算）✅
│   │   │       ├── laser-generator.ts   # 激光反射生成器（659 行）✅
│   │   │       ├── circuit-generator.ts # [待实现] 电路连接生成器（空文件）
│   │   │       ├── riddle-generator.ts  # [待实现] 文字谜题生成器（空文件）
│   │   │       └── sliding-generator.ts # [待实现] 滑块拼图生成器（空文件）
│   │   │
│   │   ├── 📁 narrative/                # 叙事生成模块 —— "编剧"
│   │   │   ├── narrative-generator.ts   # 剧情生成器（调用 LLM 生成开场白、过渡文本）
│   │   │   ├── prompt-builder.ts        # 提示词构建器（整合玩家画像、情绪状态、主题）
│   │   │   └── templates/               # 叙事模板库（按 AIMood 分类）
│   │   │       ├── intro-templates.ts   # 开场白模板（playful/stubborn/concerned 等语气）
│   │   │       └── bridge-templates.ts  # 关卡过渡文本模板
│   │   │
│   │   └── 📁 dialogue/                 # 对话生成模块 —— "配音导演"
│   │       ├── dialogue-generator.ts    # 对话树生成器（271 行，生成带分支的 DialogueNode[]）
│   │       ├── context-builder.ts       # 对话上下文构建（156 行，整合记忆、情绪、世界观）
│   │       └── emotion-analyzer.ts      # [待实现] 情感分析器（分析玩家输入的情绪倾向）
│   │
│   ├── 📁 memory/                       # 长期记忆系统 —— "存档点"
│   │   ├── storage/                     # 存储适配器（适配器模式）
│   │   │   ├── base-storage.ts          # 存储抽象接口（StorageAdapter）
│   │   │   ├── sqlite-adapter.ts        # SQLite 实现（默认，零配置，单文件）
│   │   │   ├── memory-adapter.ts        # 内存存储（开发/测试用，Map 实现）
│   │   │   └── redis-adapter.ts         # Redis 实现（分布式/高并发场景）
│   │   ├── models/                      # 数据模型定义
│   │   │   ├── player-profile.ts        # 玩家画像模型（技能评级、挫败感、关系阶段）
│   │   │   ├── narrative-state.ts       # 叙事状态模型（会话级别的临时状态）
│   │   │   └── observation.ts           # 观察记录模型（玩家行为/反馈记录）
│   │   ├── memory-service.ts            # 记忆服务门面（对外统一接口）
│   │   └── analytics/                   # 分析模块（数据驱动难度调整）
│   │       ├── difficulty-analyzer.ts   # 难度分析器（根据历史表现计算目标难度）
│   │       └── sentiment-analyzer.ts    # 情感分析器（判断玩家情绪正负）
│   │
│   ├── 📁 api/                          # 对外接口层 —— "对外窗口"
│   │   ├── 📁 sdk/                      # 游戏客户端 SDK（TypeScript/JavaScript 项目直接引入）
│   │   │   ├── game-client-sdk.ts       # [待实现] 主 SDK 类（空文件）
│   │   │   ├── types.ts                 # [待实现] SDK 专属类型定义（空文件）
│   │   │   └── adapters/                # 游戏引擎适配器
│   │   │       ├── unity-adapter.ts     # Unity C# 项目适配辅助
│   │   │       └── unreal-adapter.ts    # Unreal Engine 适配辅助
│   │   │
│   │   ├── 📁 http/                     # HTTP REST API（可选部署为独立服务）
│   │   │   ├── server.ts                # [待实现] 服务器封装（空文件）
│   │   │   ├── routes/                  # API 路由定义
│   │   │   │   ├── level.routes.ts      # [待实现] 关卡生成接口（空文件）
│   │   │   │   ├── player.routes.ts     # [待实现] 玩家数据接口（空文件）
│   │   │   │   └── feedback.routes.ts   # [待实现] 反馈提交接口（空文件）
│   │   │   └── middleware/              # 中间件
│   │   │       ├── auth.ts              # API Key 认证中间件
│   │   │       └── rate-limit.ts        # 请求限流中间件
│   │   │
│   │   └── 📁 websocket/                # WebSocket 实时接口（可选）
│   │       └── socket-handler.ts        # 实时生成进度推送（SSE / WebSocket）
│   │
│   ├── 📁 utils/                        # 工具类库 —— "工具箱"
│   │   ├── content-loader.ts            # 内容文件加载器（699 行，支持热重载、缓存、多格式）✅
│   │   ├── logger.ts                    # 分级日志工具（debug/info/warn/error）
│   │   ├── validators/                  # 验证器集合
│   │   │   ├── json-validator.ts        # LLM 返回 JSON 清洗与验证（处理 markdown 包裹等）
│   │   │   └── schema-validator.ts      # JSON Schema 数据结构验证
│   │   └── helpers/                     # 辅助函数
│   │       ├── string-helper.ts         # 字符串处理（截断、清理、模板替换）
│   │       └── math-helper.ts           # 数学计算（难度曲线、平滑插值）
│   │
│   ├── 📁 cli/                          # 命令行工具 —— "运维工具"
│   │   ├── commands/                    # 子命令实现
│   │   │   ├── generate.ts              # [待实现] 生成测试关卡（空文件）
│   │   │   ├── verify-config.ts         # [待实现] 验证配置文件（空文件）
│   │   │   ├── db-migrate.ts            # [待实现] 数据库迁移管理（空文件）
│   │   │   └── benchmark.ts             # [待实现] LLM 性能基准测试（空文件）
│   │   └── index.ts                     # [待实现] CLI 入口（空文件）
│   │
│   └── index.ts                         # 库入口文件（导出公共 API）
│
├── 📁 content/                          # 内容资源目录（非代码，可热重载）
│   ├── 📁 prompts/                      # AI 提示词模板
│   │   ├── system-persona.json          # [待填充] AI 人设/人格设定（空文件）
│   │   ├── minigames/                   # 小游戏生成提示词
│   │   │   ├── pushbox.json             # [待填充] 推箱子提示词模板（空文件）
│   │   │   ├── laser-mirror.json        # [待填充] 激光反射提示词（空文件）
│   │   │   ├── circuit-connection.json  # [待填充] 电路连接提示词（空文件）
│   │   │   └── riddle.json              # [待填充] 文字谜题提示词（空文件）
│   │   └── narrative/                   # 叙事生成提示词
│   │       ├── intro-prompts.json       # [待填充] 开场白变体（空文件）
│   │       └── mood-adaptation.json     # [待填充] 情绪适配规则（空文件）
│   │
│   ├── 📁 schemas/                      # JSON Schema（运行时验证用）
│   │   ├── level.schema.json            # [待填充] 关卡数据结构验证（空文件）
│   │   ├── minigame.schema.json         # [待填充] 小游戏配置验证（空文件）
│   │   └── dialogue.schema.json         # [待填充] 对话树结构验证（空文件）
│   │
│   └── 📁 templates/                    # 备用模板
│       └── fallback-levels/             # 降级备用关卡
│           ├── easy-template.json       # [待填充] 简单关卡模板
│           └── hard-template.json       # [待填充] 困难关卡模板
│
├── 📁 config/                           # 配置示例文件
│   ├── config.example.yaml              # 完整配置示例（所有选项注释说明）
│   ├── config.ollama.yaml               # Ollama 快速配置模板
│   ├── config.openai.yaml               # OpenAI 快速配置模板
│   └── config.local.yaml                # 本地模型快速配置模板
│
├── 📁 docs/                             # 文档（面向开发者和用户）
│   ├── 📁 guide/                        # 使用指南
│   │   ├── getting-started.md           # 快速开始教程
│   │   ├── configuration.md             # 配置详解
│   │   ├── architecture.md              # 架构设计深度说明
│   │   └── best-practices.md            # 生产环境最佳实践
│   ├── 📁 api/                          # API 参考文档
│   │   ├── engine.md                    # 引擎 API 文档
│   │   ├── sdk.md                       # SDK 使用文档
│   │   ├── llm-providers.md             # LLM 提供商接入指南
│   │   └── minigame-generators.md       # 小游戏生成器开发指南
│   ├── 📁 development/                  # 开发文档
│   │   ├── contributing.md              # 贡献指南（PR 流程、代码规范）
│   │   ├── coding-standards.md          # 代码规范与注释标准
│   │   └── testing.md                   # 测试指南（单元测试、集成测试）
│   └── assets/                          # 文档图片资源
│       └── architecture-diagram.png
│
├── 📁 examples/                         # 使用示例代码
│   ├── 📁 basic/                        # 基础示例
│   │   ├── simple-generation.ts         # 最简单的关卡生成示例
│   │   └── custom-provider.ts           # 接入自定义 LLM 提供商示例
│   ├── 📁 advanced/                     # 高级示例
│   │   ├── dynamic-difficulty.ts        # 动态难度调整完整示例
│   │   ├── custom-minigame.ts           # 添加自定义小游戏类型示例
│   │   └── unity-integration/           # Unity 集成示例
│   │       ├── XZXLLMGameClient.cs      # C# 客户端封装
│   │       └── ExampleScene.unity       # 示例场景（可选）
│   └── 📁 configs/                      # 配置示例脚本
│       ├── ollama-setup.ts              # Ollama 环境配置脚本
│       └── openai-setup.ts              # OpenAI 环境配置脚本
│
├── 📁 tests/                            # 测试套件（Vitest）
│   ├── 📁 unit/                         # 单元测试
│   │   ├── llm/                         # LLM 模块测试
│   │   │   ├── factory.test.ts          # 工厂创建测试
│   │   │   └── providers.test.ts        # 提供商 Mock 测试
│   │   ├── generation/                  # 生成器测试
│   │   │   ├── minigame-factory.test.ts
│   │   │   └── pushbox-generator.test.ts
│   │   └── memory/                      # 存储测试
│   │       └── sqlite-adapter.test.ts
│   │
│   ├── 📁 integration/                  # 集成测试
│   │   ├── end-to-end.test.ts           # 端到端流程测试
│   │   └── api-routes.test.ts           # API 路由测试
│   │
│   ├── 📁 fixtures/                     # 测试数据
│   │   ├── sample-levels/               # 示例关卡 JSON
│   │   ├── mock-responses/              # LLM 模拟响应（用于离线测试）
│   │   └── test-configs/                # 测试专用配置
│   │
│   └── setup.ts                         # 测试环境初始化
│
├── 📁 scripts/                          # 构建与运维脚本
│   ├── build.sh                         # 构建脚本
│   ├── release.sh                       # 版本发布脚本
│   └── setup-models.sh                  # 本地模型自动下载脚本
│
├── .eslintrc.json                       # ESLint 代码规范配置
├── .prettierrc                          # Prettier 格式化配置
├── .gitignore                           # Git 忽略规则
├── .npmignore                           # NPM 发布忽略规则
├── Dockerfile                           # Docker 构建文件（独立服务部署）
├── docker-compose.yml                   # Docker Compose（含 Ollama 一体化部署）
├── LICENSE                              # MIT 开源许可证
├── package.json                         # Node.js 项目配置
├── README.md                            # 英文项目说明
├── README.zh-CN.md                      # 中文项目说明（本文件）
├── tsconfig.json                        # TypeScript 编译配置
└── tsconfig.build.json                  # 构建专用 TS 配置（更严格）
```

---

## 🚀 快速开始

### 环境要求

- **Node.js**: >= 18.0.0（推荐使用 20 LTS）
- **TypeScript**: >= 5.0（开发时）
- **SQLite**: 内置，无需额外安装（默认存储）
- **Ollama**: 可选，如需本地运行开源模型（[安装指南](https://ollama.com/download)）

### 安装

```bash
# 通过 npm 安装（未来发布到 npm 后）
npm install xzxllm-game

# 或通过 yarn
yarn add xzxllm-game

# 或通过 pnpm
pnpm add xzxllm-game
```

### 基础使用示例

#### 1. 使用 Ollama（本地开源模型）

```typescript
import { createEngine } from 'xzxllm-game';

// 创建引擎实例
const engine = createEngine({
  llm: {
    provider: 'ollama',
    model: 'qwen2.5:7b',      // 或其他已下载的模型
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
    maxTokens: 2000
  },
  storage: {
    type: 'sqlite',
    connectionString: './data/game.db'
  },
  generation: {
    enableNarrative: true,    // 启用叙事包装
    pregenerateCount: 2       // 预生成 2 个关卡保持缓冲
  }
});

// 初始化引擎
await engine.initialize();

// 生成关卡
const level = await engine.generateLevel({
  playerId: 'player_001',
  sessionId: 'session_001',
  difficulty: 0.6,            // 难度 0.0 - 1.0
  theme: 'cyber'              // 主题风格
});

console.log('生成关卡:', level);
console.log('小游戏列表:', level.miniGames);
console.log('开场白:', level.narrativeBridge);

// 提交玩家反馈（用于动态调整难度）
await engine.submitFeedback('session_001', {
  type: 'completion',
  content: '玩家用时 45 秒通关，表现优秀',
  importance: 8
});

// 释放资源
await engine.dispose();
```

#### 2. 使用 OpenAI（云端 API）

```typescript
const engine = createEngine({
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY,  // 从环境变量读取
    temperature: 0.7
  }
});
```

#### 3. 使用本地 GGUF 模型（无需网络）

```typescript
const engine = createEngine({
  llm: {
    provider: 'local',
    model: 'qwen2.5-7b',
    localOptions: {
      modelPath: './models/qwen2.5-7b-q4.gguf',
      gpuLayers: 20,          // GPU 加速层数（0 = 纯 CPU）
      contextSize: 4096,      // 上下文窗口
      threads: 4              // CPU 线程数
    }
  }
});
```

---

## ⚙️ 配置说明

### 完整配置示例（`config/config.example.yaml`）

```
# ═══════════════════════════════════════════════════
# xzxllmGame 完整配置示例
# 所有字段均为可选，未填写时使用 src/core/config/default.config.ts 中的默认值
# ═══════════════════════════════════════════════════

# ─── LLM 配置 ──────────────────────────────────────
llm:
  # 提供商类型：local | ollama | openai | anthropic | custom
  provider: ollama

  # 模型名称（格式取决于提供商）
  # - ollama: qwen2.5:7b, llama3, mistral 等
  # - openai: gpt-4o, gpt-4o-mini, gpt-3.5-turbo
  # - anthropic: claude-3-5-sonnet, claude-3-opus
  # - local: 任意名称（仅用于标识）
  model: qwen2.5:7b

  # API 基础 URL（ollama 和 custom 必需）
  baseUrl: http://localhost:11434

  # API 密钥（openai / anthropic / custom 必需）
  # 也可通过环境变量 LLM_API_KEY 或 OPENAI_API_KEY 设置
  apiKey: ""

  # 本地模型专用配置（仅 provider=local 时有效）
  localOptions:
    modelPath: "./models/model.gguf"   # GGUF 模型文件路径
    gpuLayers: 20                       # GPU 卸载层数（0=CPU，20=全GPU）
    contextSize: 4096                   # 上下文长度
    threads: 4                          # CPU 推理线程

  # 默认生成参数
  temperature: 0.7       # 0.0=最确定，2.0=最随机
  maxTokens: 2000        # 单次生成最大 Token 数
  timeout: 30000         # 请求超时（毫秒）
  retryAttempts: 3       # 失败重试次数

# ─── 存储配置 ──────────────────────────────────────
storage:
  # 存储类型：sqlite | memory | redis
  type: sqlite

  # 连接字符串
  # - sqlite: 文件路径，如 "./data/game.db"
  # - memory: 无需设置（仅内存，重启丢失）
  # - redis: redis://localhost:6379/0
  connectionString: "./data/game.db"

# ─── 生成配置 ──────────────────────────────────────
generation:
  # 预生成关卡数（保持缓冲池大小，0=禁用）
  pregenerateCount: 2

  # 是否启用叙事包装（将游戏机制包装为剧情描述）
  enableNarrative: true

  # 默认难度系数（0.0-1.0，玩家未有足够的游戏历史时使用）
  defaultDifficulty: 0.5

  # 生成超时（毫秒）
  timeout: 60000

  # 最大/最小小游戏数量
  maxMiniGames: 3
  minMiniGames: 1

# ─── 调试配置 ──────────────────────────────────────
debug: false              # 开启后输出详细日志（含 LLM 提示词和原始响应）
logLevel: info            # debug | info | warn | error
```

### 环境变量覆盖

所有配置项均支持通过环境变量覆盖（遵循 `ENV_MAPPINGS` 定义）：

```bash
# LLM 配置
export LLM_PROVIDER=ollama
export LLM_MODEL=qwen2.5:7b
export LLM_API_KEY=sk-xxx
export LLM_BASE_URL=http://localhost:11434

# 存储配置
export STORAGE_TYPE=sqlite
export DATABASE_URL=./data/game.db

# 功能开关
export ENABLE_NARRATIVE=true
export DEBUG=true
```

---

## 🔌 SDK / API 使用

### TypeScript SDK（推荐）

游戏项目直接安装 npm 包后使用：

```typescript
import { GameClientSDK } from 'xzxllm-game/api/sdk';

const sdk = new GameClientSDK({
  apiEndpoint: 'http://localhost:3000',
  apiKey: 'your-api-key'
});

// 请求关卡
const level = await sdk.requestLevel({
  playerId: 'player_001',
  sessionId: 'session_001',
  difficulty: 0.5
});

// 提交反馈
await sdk.submitFeedback({
  sessionId: 'session_001',
  levelId: level.metadata.id,
  completionTime: 120,
  attempts: 3,
  success: true
});
```

### HTTP REST API

独立部署为服务时，游戏客户端通过 HTTP 调用：

```bash
# 生成关卡
curl -X POST http://localhost:3000/api/levels \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "playerId": "player_001",
    "sessionId": "session_001",
    "difficulty": 0.5,
    "theme": "cyber"
  }'

# 提交反馈
curl -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session_001",
    "type": "completion",
    "content": "通关用时 45 秒"
  }'
```

### WebSocket 实时推送

用于实时显示生成进度（如加载界面的进度条）：

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

## 🔧 扩展开发

### 添加自定义 LLM 提供商

任何实现 `ILLMProvider` 接口的类都可以注册到工厂中：

```typescript
import { BaseLLMProvider } from 'xzxllm-game/llm/base';
import { LLMProviderFactory } from 'xzxllm-game/llm';

class MyProvider extends BaseLLMProvider {
  readonly name = 'MyProvider';
  
  async initialize() { /* 连接验证 */ }
  protected async doGenerate(prompt, options) { /* 实际请求 */ }
  async dispose() { /* 资源释放 */ }
}

// 运行时注册
LLMProviderFactory.registerProvider('myprovider', MyProvider);

// 使用
const engine = createEngine({
  llm: { provider: 'myprovider', model: 'my-model' }
});
```

### 添加自定义小游戏类型

当前项目已完成的生成器：
- **PushboxGenerator** (`src/generation/minigame/generators/pushbox-generator.ts`) - 561 行，参考实现
- **LaserGenerator** (`src/generation/minigame/generators/laser-generator.ts`) - 659 行，参考实现

待实现的生成器（空文件，欢迎贡献）：
- **CircuitGenerator** - 电路连接谜题
- **RiddleGenerator** - 文字谜题
- **SlidingGenerator** - 滑块拼图（华容道）

实现 `IMiniGameGenerator` 接口并注册到工厂：

```typescript
import { IMiniGameGenerator } from 'xzxllm-game/generation/minigame';
import { MiniGameGeneratorFactory } from 'xzxllm-game/generation/minigame/factory';

class ChessGenerator implements IMiniGameGenerator {
  readonly type = MiniGameType.CUSTOM;
  readonly name = '国际象棋谜题';
  readonly supportedDifficultyRange = [0.3, 1.0];
  
  buildPrompt(context) {
    return `生成一个难度 ${context.difficulty} 的国际象棋残局...`;
  }
  
  parseResponse(response, zoneId, position) {
    // 解析 LLM 返回的 JSON
    return { /* MiniGameZone 对象 */ };
  }
  
  validate(zone) {
    // 验证棋局可解性
    return { valid: true };
  }
  
  generateFallback(context) {
    // LLM 失败时的备用方案
    return { /* 简单的预设谜题 */ };
  }
}

MiniGameGeneratorFactory.register(new ChessGenerator());
```

---

## 📊 开发状态（截至 2026-04-18）

### 已实现模块 ✅

| 模块                   | 文件                                                        | 代码行数 | 说明                                                       |
| ---------------------- | ----------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| **LLM 提供商**   | `src/llm/providers/*.ts`                                  | ~2500+   | 5 个提供商（local/ollama/openai/anthropic/custom）全部完成 |
| **核心引擎**     | `src/core/engine.ts`                                      | 660      | 主引擎完成，支持完整关卡生成流程                           |
| **小游戏工厂**   | `src/generation/minigame/factory.ts`                      | 222      | 工厂注册表完成，支持动态注册                               |
| **推箱子生成器** | `src/generation/minigame/generators/pushbox-generator.ts` | 561      | 含死锁检测、依赖链计算                                     |
| **激光生成器**   | `src/generation/minigame/generators/laser-generator.ts`   | 659      | 完整实现                                                   |
| **叙事生成**     | `src/generation/narrative/*.ts`                           | 980+     | generator、prompt-builder、templates 全部完成              |
| **对话生成**     | `src/generation/dialogue/*.ts`                            | 427      | generator、context-builder 完成                            |
| **存储适配器**   | `src/memory/storage/*.ts`                                 | 4900+    | sqlite、memory、redis 三个适配器全部完成                   |
| **内容加载器**   | `src/utils/content-loader.ts`                             | 699      | 支持热重载、缓存、JSON/YAML                                |

### 待实现模块 ❌

| 模块                   | 文件                     | 优先级 | 说明                           |
| ---------------------- | ------------------------ | ------ | ------------------------------ |
| **小游戏生成器** | `circuit-generator.ts` | 高     | 空文件，需实现电路连接谜题生成 |
| **小游戏生成器** | `riddle-generator.ts`  | 高     | 空文件，需实现文字谜题生成     |
| **小游戏生成器** | `sliding-generator.ts` | 中     | 空文件，需实现滑块拼图生成     |
| **情感分析器**   | `emotion-analyzer.ts`  | 中     | 文件不存在，需创建             |
| **SDK**          | `api/sdk/*.ts`         | 高     | 多个空文件，需实现客户端 SDK   |
| **HTTP API**     | `api/http/routes/*.ts` | 高     | 路由文件均为空                 |
| **CLI 工具**     | `cli/commands/*.ts`    | 低     | 所有命令文件均为空             |

---

## 🧪 开发与测试

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 类型检查
npm run type-check

# 运行测试
npm run test

# 代码检查
npm run lint

# 构建
npm run build

# CLI 工具
npx xzxllm-game generate --difficulty 0.5 --theme dungeon
npx xzxllm-game verify-config ./config.yaml
npx xzxllm-game benchmark --provider ollama --model qwen2.5:7b
```

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！请阅读 [docs/development/contributing.md](docs/development/contributing.md) 了解详细流程。

### 快速贡献流程

1. **Fork** 本仓库
2. **创建分支**：`git checkout -b feature/your-feature`
3. **编写代码**：遵循现有代码风格，确保添加详细注释
4. **添加测试**：所有新功能必须包含单元测试
5. **提交 PR**：描述清楚改动内容和动机

### 注释规范

本项目作为开源项目，要求**非常详细的注释**，以便其他开发者快速理解：

- 每个文件头部必须包含 `@fileoverview` JSDoc
- 每个导出接口/类/函数必须包含 JSDoc 说明
- 复杂算法需 inline 注释解释逻辑
- 类型定义字段必须包含中文说明注释

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源许可证。

---

## 🙏 致谢

- 感谢所有开源 LLM 项目（Ollama、llama.cpp 等）让本地部署成为可能
- 感谢游戏开发者社区的反馈与建议

---

<p align="center">
  Made with ❤️ by xzxllm | <a href="https://github.com/xzxllm/xzxllmGame">GitHub</a>
</p>
