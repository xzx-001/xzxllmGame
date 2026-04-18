// src/index.ts
/**
 * @fileoverview xzxllmGame 库入口
 * @description 导出所有公共 API，供外部使用
 * @module xzxllmGame
 * @author xzxllm
 * @license MIT
 */

// ==================== 核心引擎 ====================
export { XZXLLMGameEngine, createEngine } from './core/engine.js';
export type { GameEngineConfig } from './core/engine.js';

// ==================== SDK ====================
export { GameClientSDK, createSDK } from './api/sdk/game-client-sdk.js';
export { SDKEvent, WebSocketState } from './api/sdk/types.js';
export type {
  SDKConfig,
  LevelGenerationOptions,
  PlayerSession,
  LevelResult,
  GenerationStatus,
  SDKStats,
} from './api/sdk/types.js';

// ==================== 游戏引擎适配器 ====================
export { UnityAdapter } from './api/sdk/adapters/unity-adapter.js';
export { UnrealAdapter } from './api/sdk/adapters/unreal-adapter.js';

// ==================== 服务器 ====================
export { APIServer, createAPIServer, startServer } from './api/server.js';
export { createHTTPServer, HTTPServer } from './api/http/server.js';
export { createWebSocketHandler, WebSocketHandler } from './api/websocket/socket-handler.js';

// ==================== 中间件 ====================
export { createAuthMiddleware, AuthMiddleware, ApiKeyStore } from './api/http/middleware/auth.js';
export {
  createRateLimit,
  RateLimitMiddleware,
  RateLimitPresets,
} from './api/http/middleware/rate-limit.js';

// ==================== 核心类型 ====================
export type {
  LevelStructure,
  LevelMetadata,
  BaseMapConfig,
  MiniGameZone,
  PropItem,
  DialogueNode,
  PlayerProfile,
  NarrativeState,
  MiniGameType,
  AIMood,
  RelationshipStage,
  SkillDimension,
  ObservationType,
  DialogueObservation,
} from './core/interfaces/base.types.js';

export type {
  LevelRequestParams,
  LevelGenerationParams,
  PlayerFeedbackData,
  GenerationProgress,
  HealthStatus,
  ApiResponse,
  WebSocketMessage,
  EngineStatus,
} from './core/interfaces/api.types.js';

// ==================== 版本信息 ====================
export const VERSION = '1.0.0';
export const NAME = 'xzxllmGame';
