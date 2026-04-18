// src/api/sdk/index.ts
/**
 * @fileoverview SDK 模块入口
 * @description 导出游戏客户端 SDK 及其相关类型
 * @module api/sdk
 * @author xzxllm
 * @license MIT
 */

// 主 SDK 类
export { GameClientSDK, createSDK } from './game-client-sdk.js';

// 类型定义
export type {
  SDKConfig,
  LevelGenerationOptions,
  PlayerSession,
  LevelResult,
  GenerationStatus,
  SDKStats,
  CacheStats,
  HTTPMethod,
  RequestConfig,
} from './types.js';

// 枚举
export { SDKEvent, WebSocketState } from './types.js';

// 重导出核心类型以便 SDK 用户使用
export type {
  LevelStructure,
  PlayerProfile,
  MiniGameType,
} from '../../core/interfaces/base.types.js';

export type {
  GenerationProgress,
  HealthStatus,
  ApiResponse,
} from '../../core/interfaces/api.types.js';

export type {
  LevelRequestParams,
  PlayerFeedbackData,
} from '../../core/interfaces/api.types.js';

// 游戏引擎适配器
export { UnityAdapter } from './adapters/unity-adapter.js';
export type { UnityAdapterConfig, UnityLevelData } from './adapters/unity-adapter.js';

export { UnrealAdapter } from './adapters/unreal-adapter.js';
export type {
  UnrealAdapterConfig,
  UnrealLevelData,
  UnrealVector2D,
  UnrealMiniGameData,
} from './adapters/unreal-adapter.js';
