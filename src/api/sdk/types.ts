// src/api/sdk/types.ts
/**
 * @fileoverview SDK 类型定义
 * @description 游戏客户端 SDK 使用的专属类型定义
 * @module api/sdk/types
 * @author xzxllm
 * @license MIT
 */

import type {
  LevelStructure,
  PlayerProfile,
  MiniGameType,
} from '../../core/interfaces/base.types.js';
import type {
  LevelRequestParams,
  PlayerFeedbackData,
  GenerationProgress,
  HealthStatus,
  ApiResponse,
} from '../../core/interfaces/api.types.js';

/**
 * SDK 事件回调函数类型
 */
export type SDKEventCallback<T = any> = (data: T) => void;

/**
 * SDK 事件类型枚举
 */
export enum SDKEvent {
  /** 连接已建立 */
  CONNECTED = 'connected',
  /** 连接已断开 */
  DISCONNECTED = 'disconnected',
  /** 连接发生错误 */
  ERROR = 'error',
  /** 开始生成关卡 */
  GENERATION_STARTED = 'generation:started',
  /** 生成进度更新 */
  GENERATION_PROGRESS = 'generation:progress',
  /** 关卡生成完成 */
  LEVEL_READY = 'level:ready',
  /** 收到新的对话 */
  DIALOGUE_RECEIVED = 'dialogue:received',
  /** 玩家画像更新 */
  PROFILE_UPDATED = 'profile:updated',
  /** 配置变更 */
  CONFIG_CHANGED = 'config:changed',
}

/**
 * SDK 配置选项
 */
export interface SDKConfig {
  /**
   * 远程 API 端点
   * 格式: http://host:port 或 https://api.example.com
   */
  apiEndpoint: string;

  /**
   * API 密钥（用于认证）
   */
  apiKey?: string;

  /**
   * 请求超时时间（毫秒）
   * @default 30000
   */
  timeout?: number;

  /**
   * 重试次数
   * @default 3
   */
  retryAttempts?: number;

  /**
   * 自动重连间隔（毫秒，WebSocket 使用）
   * @default 5000
   */
  reconnectInterval?: number;

  /**
   * 是否启用自动预生成
   * @default true
   */
  enablePregeneration?: boolean;

  /**
   * 调试模式
   * @default false
   */
  debug?: boolean;

  /**
   * 日志级别
   * @default 'info'
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 关卡生成选项
 */
export interface LevelGenerationOptions {
  /**
   * 指定难度系数 0.0-1.0
   */
  difficulty?: number;

  /**
   * 偏好游戏类型列表
   */
  gameTypes?: MiniGameType[];

  /**
   * 主题偏好
   */
  theme?: string;

  /**
   * 是否立即返回（使用缓冲池）
   * @default true
   */
  immediate?: boolean;

  /**
   * 特定剧情事件触发
   */
  triggerEvent?: string;

  /**
   * 自定义上下文数据
   */
  customContext?: Record<string, any>;
}

/**
 * 玩家会话信息
 */
export interface PlayerSession {
  /**
   * 玩家 ID
   */
  playerId: string;

  /**
   * 会话 ID
   */
  sessionId: string;

  /**
   * 会话开始时间
   */
  startTime: string;

  /**
   * 当前关卡索引
   */
  currentLevelIndex: number;

  /**
   * 会话累计游戏时间（秒）
   */
  totalPlayTime: number;
}

/**
 * 关卡结果数据
 */
export interface LevelResult {
  /**
   * 关卡 ID
   */
  levelId: string;

  /**
   * 完成时间（秒）
   */
  completionTime: number;

  /**
   * 尝试次数
   */
  attempts: number;

  /**
   * 是否成功通关
   */
  success: boolean;

  /**
   * 使用的提示次数
   */
  hintsUsed: number;

  /**
   * 玩家评分 1-5（可选）
   */
  rating?: number;

  /**
   * 玩家文字反馈（可选）
   */
  feedback?: string;

  /**
   * 行为日志（可选）
   */
  behaviorLog?: Array<{
    timestamp: number;
    event: string;
    data?: any;
  }>;
}

/**
 * 实时生成状态
 */
export interface GenerationStatus {
  /**
   * 是否正在生成
   */
  isGenerating: boolean;

  /**
   * 当前进度 0-100
   */
  progress: number;

  /**
   * 当前阶段描述
   */
  currentStage: string;

  /**
   * 预计剩余时间（秒）
   */
  estimatedTimeRemaining?: number;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  /**
   * 缓存命中次数
   */
  hits: number;

  /**
   * 缓存未命中次数
   */
  misses: number;

  /**
   * 缓存命中率 0-1
   */
  hitRate: number;

  /**
   * 当前缓存条目数
   */
  size: number;
}

/**
 * SDK 统计信息
 */
export interface SDKStats {
  /**
   * 总请求次数
   */
  totalRequests: number;

  /**
   * 成功请求次数
   */
  successfulRequests: number;

  /**
   * 失败请求次数
   */
  failedRequests: number;

  /**
   * 平均响应时间（毫秒）
   */
  averageResponseTime: number;

  /**
   * 缓存统计
   */
  cacheStats: CacheStats;

  /**
   * 当前活跃会话数
   */
  activeSessions: number;
}

/**
 * WebSocket 连接状态
 */
export enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

/**
 * HTTP 请求方法
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * 请求配置
 */
export interface RequestConfig {
  /**
   * 请求方法
   */
  method?: HTTPMethod;

  /**
   * 请求路径
   */
  path: string;

  /**
   * 请求体数据
   */
  data?: any;

  /**
   * 查询参数
   */
  params?: Record<string, string | number | boolean>;

  /**
   * 自定义请求头
   */
  headers?: Record<string, string>;

  /**
   * 超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 是否跳过缓存
   */
  skipCache?: boolean;
}

/**
 * 导出类型别名以便 SDK 用户使用
 */
export type {
  LevelStructure,
  PlayerProfile,
  MiniGameType,
  LevelRequestParams,
  PlayerFeedbackData,
  GenerationProgress,
  HealthStatus,
  ApiResponse,
};
