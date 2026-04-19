// src/api/sdk/index.ts
/**
 * @fileoverview SDK 模块入口
 * @description 导出游戏客户端 SDK 及其相关类型
 * @module api/sdk
 * @author xzxllm
 * @license MIT
 */

/**
 * 主 SDK 类及工厂函数
 * GameClientSDK 是游戏客户端与 xzxllmGame 引擎交互的主要接口
 * createSDK 是创建 SDK 实例的便捷工厂函数
 */
export { GameClientSDK, createSDK } from './game-client-sdk.js';

/**
 * SDK 配置与运行时类型定义
 * 包含 SDK 配置选项、请求/响应数据结构、统计信息等类型
 */
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

/**
 * SDK 事件与状态枚举
 * SDKEvent: SDK 内部事件类型枚举，用于事件监听系统
 * WebSocketState: WebSocket 连接状态枚举
 */
export { SDKEvent, WebSocketState } from './types.js';

/**
 * 核心游戏数据结构（来自引擎层）
 * 这些类型定义在核心接口模块，为 SDK 用户提供统一类型引用
 */
export type {
  LevelStructure,
  PlayerProfile,
  MiniGameType,
} from '../../core/interfaces/base.types.js';

/**
 * 引擎 API 响应类型（来自引擎层）
 * 包含生成进度、健康状态、API 通用响应等类型
 */
export type {
  GenerationProgress,
  HealthStatus,
  ApiResponse,
} from '../../core/interfaces/api.types.js';

/**
 * 引擎请求参数类型（来自引擎层）
 * 关卡生成请求参数和玩家反馈数据结构的类型定义
 */
export type {
  LevelRequestParams,
  PlayerFeedbackData,
} from '../../core/interfaces/api.types.js';

/**
 * Unity 游戏引擎适配器
 * 为 Unity C# 项目提供专门的类型转换和集成辅助
 */
export { UnityAdapter } from './adapters/unity-adapter.js';
export type { UnityAdapterConfig, UnityLevelData } from './adapters/unity-adapter.js';

/**
 * Unreal Engine 游戏引擎适配器
 * 为 Unreal Engine 项目提供专门的类型转换和集成辅助
 */
export { UnrealAdapter } from './adapters/unreal-adapter.js';
export type {
  UnrealAdapterConfig,
  UnrealLevelData,
  UnrealVector2D,
  UnrealMiniGameData,
} from './adapters/unreal-adapter.js';
