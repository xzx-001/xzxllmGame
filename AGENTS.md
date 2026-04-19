# AGENTS.md —— xzxllmGame AI 开发指南

> 本文件面向 AI 编码助手和自动化工具，描述项目结构、开发规范与关键上下文。
> 人类开发者请优先阅读 README.md 和 README.zh-CN.md。
>
> **为什么有这个文件？** 本项目主要由 AI（Claude Code）辅助开发，AGENTS.md 作为 AI 的"项目记忆"，帮助 AI 在后续对话中快速理解代码库结构、设计原则和开发规范，确保代码风格一致性和架构完整性。

---

## 1. 项目身份

- **名称**: xzxllmGame
- **类型**: TypeScript / Node.js 开源库
- **定位**: LLM 驱动的游戏内容生成引擎（中间件/接口层，不包含具体游戏逻辑）
- **仓库**: https://github.com/xzxllm/xzxllmGame
- **许可证**: MIT

---

## 2. 核心目标（任何改动不得违背）

1. **非游戏引擎**: 本项目不实现渲染、物理、输入处理等游戏功能，只输出"游戏应该出现什么内容"
2. **接口优先**: 所有功能必须提供 SDK / HTTP API / WebSocket 三种接入方式之一
3. **LLM 无关性**: 引擎核心逻辑不得耦合任何特定 LLM 提供商，统一通过 `ILLMProvider` 接口调用
4. **工厂扩展**: 新增小游戏类型、LLM 提供商必须通过工厂注册，不得修改引擎主流程
5. **详细注释**: 作为开源项目，所有公共 API、类型定义、复杂算法必须有中文 JSDoc 注释

---

## 3. 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript 5.3+ (ES Module) |
| 运行时 | Node.js 18+ |
| 测试 | Vitest |
| 构建 | tsc + tsc-alias |
| CLI | Commander.js |
| 存储 | SQLite (better-sqlite3) / Redis (ioredis) / Memory |
| HTTP | 原生 fetch (Node 18+) |

---

## 4. 架构速查

### 4.1 模块依赖关系（禁止反向依赖）

```
core/ (interfaces, engine, container, event-bus, config)
  ├── 被 llm/ 依赖（ILLMProvider 接口定义在 core/interfaces 中，实际在 llm/types.ts）
  ├── 被 generation/ 依赖
  ├── 被 memory/ 依赖
  └── 被 api/ 依赖

llm/ (providers, factory)
  └── 仅依赖 core/ 的类型定义

generation/ (minigame, narrative, dialogue)
  └── 依赖 llm/ 和 core/

memory/ (storage, models, analytics)
  └── 依赖 core/

api/ (sdk, http, websocket)
  └── 依赖 core/, generation/, memory/

utils/ (logger, validators, helpers)
  └── 可被任何模块依赖（底层工具）

cli/ (commands)
  └── 依赖所有上层模块
```

### 4.2 关键设计模式

| 模式 | 应用位置 | 说明 |
|------|----------|------|
| 工厂方法 | `llm/factory.ts`, `generation/minigame/factory.ts` | 运行时动态创建实例 |
| 外观模式 | `core/engine.ts` | XZXLLMGameEngine 统一对外接口 |
| 依赖注入 | `core/container.ts` | Container 管理服务生命周期 |
| 观察者模式 | `core/event-bus.ts` | TypedEventBus 组件解耦 |
| 适配器模式 | `memory/storage/*-adapter.ts` | 统一存储接口，多后端实现 |
| 模板方法 | `llm/base/base-provider.ts` | BaseLLMProvider 定义重试流程，子类实现 doGenerate |

---

## 5. 关键文件与接口

### 5.1 引擎入口

**文件**: `src/core/engine.ts`
**类**: `XZXLLMGameEngine`

```typescript
// 核心公共方法（任何改动需保持向后兼容）
engine.initialize(): Promise<void>
engine.generateLevel(params: LevelGenerationParams): Promise<LevelStructure>
engine.getNextLevel(sessionId: string): Promise<LevelStructure | null>
engine.submitFeedback(sessionId, feedback): Promise<void>
engine.getPlayerStats(playerId): Promise<PlayerProfile | null>
engine.healthCheck(): Promise<{ status, components }>
engine.dispose(): Promise<void>
```

### 5.2 LLM 抽象层

**文件**: `src/llm/types.ts`
**接口**: `ILLMProvider`

```typescript
interface ILLMProvider {
  readonly name: string;
  readonly isAvailable: boolean;
  initialize(): Promise<void>;
  generate(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse>;
  generateStream?(prompt, options, callbacks): Promise<void>;
  healthCheck(): Promise<boolean>;
  dispose(): Promise<void>;
}
```

**文件**: `src/llm/factory.ts`
**类**: `LLMProviderFactory`

```typescript
// 核心静态方法
LLMProviderFactory.createProvider(config: LLMConfig): ILLMProvider
LLMProviderFactory.registerProvider(type: string, providerClass): void
LLMProviderFactory.getAvailableProviders(): string[]
```

### 5.3 小游戏生成器

**文件**: `src/generation/minigame/types.ts`
**接口**: `IMiniGameGenerator`

```typescript
interface IMiniGameGenerator {
  readonly type: MiniGameType;
  readonly name: string;
  readonly supportedDifficultyRange: [number, number];
  buildPrompt(context: MiniGameContext): string;
  parseResponse(response: string, zoneId: string, position: {x,y}): MiniGameZone;
  validate(zone: MiniGameZone): ValidationResult;
  generateFallback(context: MiniGameContext): MiniGameZone;
}
```

**文件**: `src/generation/minigame/factory.ts`
**类**: `MiniGameGeneratorFactory`

```typescript
MiniGameGeneratorFactory.register(generator: IMiniGameGenerator): void
MiniGameGeneratorFactory.getGenerator(type: MiniGameType): IMiniGameGenerator
MiniGameGeneratorFactory.getSuitableTypes(difficulty): MiniGameType[]
```

### 5.4 存储抽象

**文件**: `src/memory/storage/base-storage.ts`
**接口**: `StorageAdapter`

```typescript
interface StorageAdapter {
  initialize(): Promise<void>;
  getPlayerProfile(playerId): Promise<PlayerProfile | null>;
  updatePlayerProfile(playerId, profile): Promise<void>;
  getNarrativeState(sessionId): Promise<NarrativeState | null>;
  updateNarrativeState(sessionId, state): Promise<void>;
  storePuzzle(sessionId, level, difficulty, mood): Promise<void>;
  consumeNextPuzzle(sessionId): Promise<LevelStructure | null>;
  getPendingPuzzleCount(sessionId): Promise<number>;
  submitObservation(obs): Promise<void>;
  getUnprocessedObservations(limit): Promise<DialogueObservation[]>;
  markObservationsProcessed(ids): Promise<void>;
  dispose(): Promise<void>;
}
```

---

## 6. 类型系统

### 6.1 核心枚举（扩展需同步修改工厂）

```typescript
// src/core/interfaces/base.types.ts
enum MiniGameType {
  PUSHBOX = 'pushbox',
  LASER_MIRROR = 'laser-mirror',
  CIRCUIT = 'circuit-connection',
  SLIDING = 'sliding-puzzle',
  MEMORY = 'memory-tiles',
  RIDDLE = 'text-riddle',
  CUSTOM = 'custom'
}

enum AIMood {
  PLAYFUL = 'playful',      // 轻松调侃
  STUBBORN = 'stubborn',    // 较劲对抗
  CONCERNED = 'concerned',  // 关心降难
  IMPRESSED = 'impressed',  // 赞赏升难
  MYSTERIOUS = 'mysterious' // 谜语人
}

enum RelationshipStage {
  RIVALS = 'rivals',         // 竞争对手
  FRENEMIES = 'frenemies',   // 亦敌亦友
  RESPECT = 'respect',       // 相互尊重
  MENTOR = 'mentor'          // 导师关系
}

enum ObservationType {
  SENTIMENT = 'sentiment',       // 情感反馈
  STRATEGY = 'strategy',         // 策略观察
  FRUSTRATION = 'frustration',   // 挫败感
  COMPLETION = 'completion',     // 完成事件
  SYSTEM = 'system'              // 系统事件
}
```

### 6.2 核心数据结构

```typescript
// 完整关卡（引擎输出，游戏客户端消费）
interface LevelStructure {
  metadata: LevelMetadata;        // ID、难度、版本、标签
  baseMap: BaseMapConfig;         // 地图尺寸、主题、起始位置
  miniGames: MiniGameZone[];      // 1-3 个小游戏配置
  props: PropItem[];              // 道具/物品
  narrativeBridge: string;        // AI 生成的开场白
  dialogues: DialogueNode[];      // 预设对话树
  debugInfo?: {...};              // 调试信息（开发模式）
}

// 玩家画像（长期存储，驱动难度调整）
interface PlayerProfile {
  playerId: string;
  skillRating: number;            // 0.0-1.0 综合技能
  skillDimensions: Record<SkillDimension, number>;
  preferredTypes: string[];
  frustrationLevel: number;       // 0.0-1.0 挫败感
  winStreak: number;
  loseStreak: number;
  relationshipStage: RelationshipStage;
  totalPlayTime?: number;
  completedLevels?: number;
  lastUpdated: string;
  createdAt?: string;
}
```

---

## 7. 开发规范（AI 必须遵守）

### 7.1 代码风格

- **缩进**: 2 空格
- **引号**: 单引号（字符串）
- **分号**: 必须
- **尾逗号**: 多行对象/数组必须带尾逗号
- **最大行宽**: 100 字符

### 7.2 注释规范（强制）

每个文件头部必须有 JSDoc：

```typescript
// src/xxx/xxx.ts
/**
 * @fileoverview 简短描述（20字以内）
 * @description 详细说明（多行）
 * @module 模块路径
 * @author xzxllm
 * @license MIT
 */
```

每个导出符号必须有 JSDoc：

```typescript
/**
 * 简短说明（函数/类/接口做什么）
 *
 * 详细说明（可选，复杂逻辑解释）
 *
 * @param paramName 参数说明
 * @returns 返回值说明
 * @throws 异常说明
 *
 * @example
 * const result = myFunction('test');
 */
```

类型字段必须有注释：

```typescript
export interface Example {
  /** 字段说明 */
  fieldName: string;
}
```

### 7.3 模块导入规范

- 内部模块使用 `.js` 扩展名（ESM 要求）
- 类型导入使用 `import type`
- 禁止循环依赖（Container 会检测并抛出错误）
- 动态导入（`require()`）仅用于避免循环依赖的场景

### 7.4 错误处理

- LLM 错误使用 `LLMError` 类，带 `LLMErrorType` 分类
- 可重试错误（网络、超时）使用指数退避
- 不可重试错误（认证、模型不存在）立即抛出

### 7.5 测试要求

- 新增功能必须附带单元测试（Vitest）
- LLM 依赖的测试使用 Mock 响应（`tests/fixtures/mock-responses/`）
- 存储测试使用 MemoryAdapter（避免污染真实数据库）

---

## 8. 配置速查

### 8.1 环境变量映射

```
LLM_PROVIDER      -> llm.provider
LLM_MODEL         -> llm.model
LLM_API_KEY       -> llm.apiKey
LLM_BASE_URL      -> llm.baseUrl
LLM_TEMPERATURE   -> llm.temperature
STORAGE_TYPE      -> storage.type
DATABASE_URL      -> storage.connectionString
GENERATION_TIMEOUT-> generation.timeout
ENABLE_NARRATIVE  -> generation.enableNarrative
DEBUG             -> debug
LOG_LEVEL         -> logging.level
```

### 8.2 默认配置 (`src/core/config/default.config.ts`)

```typescript
DEFAULT_CONFIG = {
  generation: {
    difficulty: 0.5,
    pregenerateCount: 2,
    maxMiniGames: 3,
    minMiniGames: 1,
    timeout: 60000,
    enableNarrative: true,
    enableValidation: true
  },
  player: {
    skillRating: 0.5,
    frustrationLevel: 0.0,
    winStreak: 0,
    relationshipStage: RelationshipStage.RIVALS,
    currentMood: AIMood.PLAYFUL
  },
  difficultyAdjustment: {
    frustrationThreshold: 0.8,   // 超过降难度
    winStreakThreshold: 3,       // 超过升难度
    adjustmentStep: 0.1,
    maxDifficulty: 1.0,
    minDifficulty: 0.1,
    decayFactor: 0.95
  },
  memory: {
    retentionDays: 30,
    minImportance: 2,
    maxBufferedLevels: 5,
    sessionTimeoutHours: 24
  },
  llm: {
    provider: 'ollama',
    model: 'qwen2.5:7b',
    temperature: 0.7,
    maxTokens: 2000,
    retryAttempts: 3,
    timeout: 30000
  }
}
```

---

## 9. 常见问题（AI 开发时注意）

### Q: 新增小游戏类型需要改哪些文件？

A:
**实现步骤（参考 pushbox-generator.ts / laser-generator.ts）：**

1. **类型定义** - `src/core/interfaces/base.types.ts`
   - 在 `MiniGameType` 枚举新增类型（如 `MAZE = 'maze'`）

2. **生成器类** - `src/generation/minigame/generators/your-game-generator.ts`
   - 继承 `BaseMiniGameGenerator<T>`（T 为游戏配置类型）
   - 使用 `@RegisterMiniGame()` 装饰器自动注册
   - 必须实现：
     - `buildPrompt(context)` - 构建 LLM 提示词
     - `parseResponse(response, zoneId, position)` - 解析 JSON 响应
     - `validate(zone)` - 验证配置有效性
     - `generateFallback(context)` - 降级备用方案

3. **提示词模板** - `content/prompts/minigames/your-game.json`
   - 创建提示词模板（可选，也可直接写在 buildPrompt 中）

4. **单元测试** - `tests/unit/generation/your-game-generator.test.ts`
   - 测试提示词构建、响应解析、验证逻辑

**当前待实现的生成器：**
- `circuit-generator.ts` - 电路连接（空文件，参考 pushbox-generator.ts 实现）
- `riddle-generator.ts` - 文字谜题（空文件）
- `sliding-generator.ts` - 滑块拼图（空文件）
- `emotion-analyzer.ts` - 情感分析器（文件不存在，需在 dialogue/ 下创建）

### Q: 新增 LLM 提供商需要改哪些文件？

A:
1. `src/llm/providers/` — 创建新的提供商类（继承 BaseLLMProvider）
2. `src/llm/factory.ts` — 在静态注册表中添加映射
3. `src/llm/types.ts` — 在 `LLMProviderType` 中新增类型（如需要）

### Q: 如何避免循环依赖？

A: 
- 类型定义集中在 `src/core/interfaces/`
- 工厂类使用动态导入（`require()`）实例化具体类
- Container 注册时通过回调延迟解析依赖

### Q: 数据流向是怎样的？

A:
```
游戏客户端请求 -> Engine.generateLevel()
  -> 获取/创建 PlayerProfile（StorageAdapter）
  -> 获取/创建 NarrativeState（StorageAdapter）
  -> 计算目标难度（DifficultyAnalyzer）
  -> 选择小游戏类型（MiniGameGeneratorFactory）
  -> 并行生成小游戏（调用各 IMiniGameGenerator）
    -> buildPrompt() -> LLMProvider.generate() -> parseResponse()
  -> 生成叙事文本（NarrativeGenerator + LLM）
  -> 组装 LevelStructure
  -> 存储到缓冲池（StorageAdapter.storePuzzle）
  -> 触发预生成（异步）
  -> 返回 LevelStructure
```

---

## 10. 待办状态（长期维护）

以下模块为当前重点，AI 在开发时应了解：

| 模块 | 状态 | 说明 |
|------|------|------|
| `llm/providers/` | ✅ 完成 | 5 个提供商已实现（local/ollama/openai/anthropic/custom） |
| `core/engine.ts` | ✅ 完成 | 主引擎框架完成（660 行），小游戏调用已接入 factory |
| `generation/minigame/factory.ts` | ✅ 完成 | 工厂注册表完成（222 行），支持运行时动态注册 |
| `generation/minigame/generators/*` | ⚠️ 部分完成 | pushbox-generator（561 行）、laser-generator（659 行）已完成；circuit/riddle/sliding 生成器为空文件待实现 |
| `generation/narrative/` | ✅ 完成 | narrative-generator（436 行）、prompt-builder（243 行）、templates（301 行）已完成 |
| `generation/dialogue/` | ⚠️ 部分完成 | dialogue-generator（271 行）、context-builder（156 行）已完成；**emotion-analyzer.ts 缺失** |
| `memory/storage/` | ✅ 完成 | sqlite-adapter（1309 行）、memory-adapter（1143 行）、redis-adapter（1120 行）均已完成 |
| `api/sdk/` | ✅ 完成 | game-client-sdk.ts（775 行）、types.ts（371 行）、index.ts（57 行）及适配器全部完成 |
| `api/http/` | ✅ 完成 | server.ts（393 行）、utils.ts（203 行）、routes/、middleware/ 全部完成 |
| `api/websocket/` | ✅ 完成 | socket-handler.ts（401 行）完整实现，支持心跳/订阅/广播 |
| `utils/content-loader.ts` | ✅ 完成 | 内容加载器已实现（699 行），支持热重载、缓存、多格式 |
| `cli/commands/` | ✅ 完成 | 全部完成：generate(325行)、verify-config(445行)、db-migrate(476行)、benchmark(657行)、index(39行) |
| `tests/unit/` | ⚠️ 部分完成 | llm、generation、memory 单元测试框架存在，需补充覆盖率 |

---

*最后更新: 2026-04-18*

---

## 附：快速参考

### 代码统计

```bash
# 总 TypeScript 文件数
$ find src -name "*.ts" | wc -l
67

# 总代码行数
$ find src -name "*.ts" -exec wc -l {} + | tail -1
15000+ 行

# 各模块行数统计
$ wc -l src/core/*.ts src/core/**/*.ts src/llm/**/*.ts src/generation/**/*.ts src/memory/**/*.ts
```

### 已完成模块行数

| 模块 | 文件 | 行数 |
|------|------|------|
| 核心引擎 | engine.ts | 660 |
| 推箱子生成器 | pushbox-generator.ts | 561 |
| 激光生成器 | laser-generator.ts | 659 |
| 叙事生成器 | narrative-generator.ts | 436 |
| 对话生成器 | dialogue-generator.ts | 271 |
| SQLite 适配器 | sqlite-adapter.ts | 1309 |
| Redis 适配器 | redis-adapter.ts | 1120 |
| 内存适配器 | memory-adapter.ts | 1143 |
| 内容加载器 | content-loader.ts | 699 |
| SDK 主类 | game-client-sdk.ts | 775 |
| SDK 类型 | types.ts | 371 |
| SDK 入口 | index.ts | 57 |
| Unity 适配器 | unity-adapter.ts | 478 |
| Unreal 适配器 | unreal-adapter.ts | 567 |
| HTTP 服务器 | http/server.ts | 393 |
| HTTP 工具 | http/utils.ts | 203 |
| 关卡路由 | level.routes.ts | 331 |
| 玩家路由 | player.routes.ts | 330 |
| 反馈路由 | feedback.routes.ts | 379 |
| 认证中间件 | auth.ts | 340 |
| 限流中间件 | rate-limit.ts | 372 |
| WebSocket 处理器 | socket-handler.ts | 401 |
| API 服务器 | api/server.ts | 265 |

### 待实现（空文件或不存在）

| 模块 | 状态 |
|------|------|
| circuit-generator.ts | 空文件 |
| riddle-generator.ts | 空文件 |
| sliding-generator.ts | 空文件 |
| emotion-analyzer.ts | 不存在 |
| api/sdk/*.ts | ✅ 已完成（game-client-sdk.ts、types.ts、index.ts、适配器） |
| api/http/routes/*.ts | ✅ 已完成（level.routes.ts、player.routes.ts、feedback.routes.ts） |
| cli/commands/*.ts | ✅ 已完成（~2000行，5个命令全部实现） |
| content/**/*.json | 空文件 |
