// src/api/sdk/game-client-sdk.ts
/**
 * @fileoverview 游戏客户端 SDK
 * @description 游戏引擎集成的主要入口，提供关卡生成、玩家数据管理等功能
 * @module api/sdk/game-client-sdk
 * @author xzxllm
 * @license MIT
 *
 * @example
 * // 基础使用
 * const sdk = new GameClientSDK({
 *   apiEndpoint: 'http://localhost:3000',
 *   apiKey: 'your-api-key'
 * });
 *
 * await sdk.initialize();
 * const level = await sdk.requestLevel('player-001', 'session-001');
 * console.log(level);
 */

import type {
  SDKConfig,
  SDKEventCallback,
  LevelGenerationOptions,
  PlayerSession,
  LevelResult,
  GenerationStatus,
  SDKStats,
  RequestConfig,
  LevelStructure,
  PlayerProfile,
  HealthStatus,
  ApiResponse,
} from './types.js';

import { SDKEvent, WebSocketState } from './types.js';

/**
 * 游戏客户端 SDK 主类
 *
 * 为游戏开发者提供简单的接口来与 xzxllmGame 引擎交互。
 * 支持 HTTP REST API 和 WebSocket 实时通信。
 */
export class GameClientSDK {
  /** SDK 配置 */
  private config: Required<SDKConfig>;

  /** 当前会话信息 */
  private currentSession: PlayerSession | null = null;

  /** WebSocket 连接实例 */
  private ws: WebSocket | null = null;

  /** WebSocket 重连定时器 */
  private reconnectTimer: NodeJS.Timeout | null = null;

  /** 事件监听器映射 */
  private eventListeners: Map<SDKEvent, Set<SDKEventCallback>> = new Map();

  /** 请求缓存 */
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  /** 缓存过期时间（毫秒） */
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟

  /** SDK 统计 */
  private stats: SDKStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    cacheStats: { hits: 0, misses: 0, hitRate: 0, size: 0 },
    activeSessions: 0,
  };

  /** 响应时间记录 */
  private responseTimes: number[] = [];

  /** 生成状态 */
  private generationStatus: GenerationStatus = {
    isGenerating: false,
    progress: 0,
    currentStage: 'idle',
  };

  /**
   * 创建 SDK 实例
   * @param config SDK 配置选项
   */
  constructor(config: SDKConfig) {
    this.config = {
      apiEndpoint: config.apiEndpoint.replace(/\/$/, ''), // 移除尾部斜杠
      apiKey: config.apiKey || '',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      reconnectInterval: config.reconnectInterval || 5000,
      enablePregeneration: config.enablePregeneration ?? true,
      debug: config.debug || false,
      logLevel: config.logLevel || 'info',
    };

    this.log('info', 'GameClientSDK initialized');
  }

  // ==================== 核心 API 方法 ====================

  /**
   * 初始化 SDK
   *
   * 建立与服务的连接，验证配置有效性。
   * 使用 WebSocket 时会自动建立连接。
   */
  async initialize(): Promise<void> {
    this.log('info', 'Initializing SDK...');

    try {
      // 验证服务健康状态
      const health = await this.healthCheck();
      if (health.status === 'unhealthy') {
        throw new Error('Service is unhealthy');
      }

      // 建立 WebSocket 连接
      await this.connectWebSocket();

      this.emit(SDKEvent.CONNECTED, { timestamp: new Date().toISOString() });
      this.log('info', 'SDK initialized successfully');
    } catch (error: any) {
      this.log('error', 'SDK initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 请求生成新关卡
   *
   * @param playerId 玩家唯一标识符
   * @param sessionId 会话标识符
   * @param options 关卡生成选项
   * @returns 生成的关卡数据
   *
   * @example
   * const level = await sdk.requestLevel('player-001', 'session-001', {
   *   difficulty: 0.7,
   *   theme: 'cyber'
   * });
   */
  async requestLevel(
    playerId: string,
    sessionId: string,
    options: LevelGenerationOptions = {}
  ): Promise<LevelStructure> {
    this.ensureInitialized();

    // 更新或创建会话
    if (!this.currentSession || this.currentSession.sessionId !== sessionId) {
      this.currentSession = {
        playerId,
        sessionId,
        startTime: new Date().toISOString(),
        currentLevelIndex: 0,
        totalPlayTime: 0,
      };
      this.stats.activeSessions++;
    }

    this.generationStatus = {
      isGenerating: true,
      progress: 0,
      currentStage: 'initializing',
    };

    this.emit(SDKEvent.GENERATION_STARTED, { playerId, sessionId });

    try {
      const response = await this.request<LevelStructure>({
        method: 'POST',
        path: '/api/levels',
        data: {
          playerId,
          sessionId,
          difficulty: options.difficulty,
          gameTypes: options.gameTypes,
          theme: options.theme,
          immediate: options.immediate ?? true,
          triggerEvent: options.triggerEvent,
          customContext: options.customContext,
        },
        timeout: 120000, // 生成可能较慢，使用更长超时
      });

      this.currentSession.currentLevelIndex++;
      this.generationStatus.isGenerating = false;
      this.generationStatus.progress = 100;

      this.emit(SDKEvent.LEVEL_READY, response);

      return response;
    } catch (error: any) {
      this.generationStatus.isGenerating = false;
      throw error;
    }
  }

  /**
   * 从缓冲池获取预生成的关卡
   *
   * @param sessionId 会话标识符
   * @returns 关卡数据或 null（如果缓冲池为空）
   */
  async getBufferedLevel(sessionId: string): Promise<LevelStructure | null> {
    this.ensureInitialized();

    try {
      const response = await this.request<LevelStructure | null>({
        method: 'GET',
        path: `/api/levels/buffered`,
        params: { sessionId },
      });

      if (response) {
        this.emit(SDKEvent.LEVEL_READY, response);
      }

      return response;
    } catch (error: any) {
      this.log('warn', 'Failed to get buffered level:', error.message);
      return null;
    }
  }

  /**
   * 提交关卡结果和反馈
   *
   * @param result 关卡结果数据
   * @returns 是否成功提交
   *
   * @example
   * await sdk.submitLevelResult({
   *   levelId: 'lvl-001',
   *   completionTime: 120,
   *   attempts: 3,
   *   success: true,
   *   hintsUsed: 1,
   *   rating: 4
   * });
   */
  async submitLevelResult(result: LevelResult): Promise<boolean> {
    this.ensureInitialized();

    if (!this.currentSession) {
      throw new Error('No active session. Call requestLevel() first.');
    }

    try {
      await this.request<void>({
        method: 'POST',
        path: '/api/feedback',
        data: {
          sessionId: this.currentSession.sessionId,
          ...result,
        },
      });

      // 更新会话游戏时间
      this.currentSession.totalPlayTime += result.completionTime;

      this.log('info', 'Level result submitted successfully');
      return true;
    } catch (error: any) {
      this.log('error', 'Failed to submit level result:', error.message);
      return false;
    }
  }

  /**
   * 获取玩家画像
   *
   * @param playerId 玩家 ID（可选，默认使用当前会话的玩家）
   * @returns 玩家画像数据
   */
  async getPlayerProfile(playerId?: string): Promise<PlayerProfile | null> {
    this.ensureInitialized();

    const targetPlayerId = playerId || this.currentSession?.playerId;
    if (!targetPlayerId) {
      throw new Error('Player ID required');
    }

    try {
      const profile = await this.request<PlayerProfile>({
        method: 'GET',
        path: `/api/players/${targetPlayerId}/profile`,
      });

      this.emit(SDKEvent.PROFILE_UPDATED, profile);
      return profile;
    } catch (error: any) {
      this.log('warn', 'Failed to get player profile:', error.message);
      return null;
    }
  }

  /**
   * 更新玩家画像
   *
   * @param updates 部分更新的画像字段
   * @param playerId 玩家 ID（可选）
   */
  async updatePlayerProfile(
    updates: Partial<PlayerProfile>,
    playerId?: string
  ): Promise<void> {
    this.ensureInitialized();

    const targetPlayerId = playerId || this.currentSession?.playerId;
    if (!targetPlayerId) {
      throw new Error('Player ID required');
    }

    await this.request<void>({
      method: 'PUT',
      path: `/api/players/${targetPlayerId}/profile`,
      data: updates,
    });

    this.log('info', 'Player profile updated');
  }

  /**
   * 获取玩家游戏历史
   *
   * @param playerId 玩家 ID（可选）
   * @param limit 返回记录数量限制
   * @returns 关卡结果列表
   */
  async getPlayerHistory(
    playerId?: string,
    limit: number = 20
  ): Promise<LevelResult[]> {
    this.ensureInitialized();

    const targetPlayerId = playerId || this.currentSession?.playerId;
    if (!targetPlayerId) {
      throw new Error('Player ID required');
    }

    return await this.request<LevelResult[]>({
      method: 'GET',
      path: `/api/players/${targetPlayerId}/history`,
      params: { limit },
    });
  }

  /**
   * 健康检查
   *
   * @returns 服务健康状态
   */
  async healthCheck(): Promise<HealthStatus> {
    return await this.request<HealthStatus>({
      method: 'GET',
      path: '/health',
      skipCache: true,
    });
  }

  // ==================== 事件系统 ====================

  /**
   * 注册事件监听器
   *
   * @param event 事件类型
   * @param callback 回调函数
   * @returns 取消订阅函数
   *
   * @example
   * const unsubscribe = sdk.on(SDKEvent.LEVEL_READY, (level) => {
   *   console.log('Level ready:', level);
   * });
   * // 稍后取消订阅
   * unsubscribe();
   */
  on<T = any>(event: SDKEvent, callback: SDKEventCallback<T>): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }

    const listeners = this.eventListeners.get(event)!;
    listeners.add(callback);

    // 返回取消订阅函数
    return () => {
      listeners.delete(callback);
    };
  }

  /**
   * 移除事件监听器
   *
   * @param event 事件类型
   * @param callback 回调函数（可选，不提供则移除该事件的所有监听器）
   */
  off<T = any>(event: SDKEvent, callback?: SDKEventCallback<T>): void {
    if (!callback) {
      this.eventListeners.delete(event);
      return;
    }

    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * 触发事件
   * @param event 事件类型
   * @param data 事件数据
   */
  private emit<T = any>(event: SDKEvent, data: T): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          this.log('error', 'Event listener error:', error);
        }
      });
    }
  }

  // ==================== WebSocket 方法 ====================

  /**
   * 建立 WebSocket 连接
   */
  private async connectWebSocket(): Promise<void> {
    if (this.ws?.readyState === WebSocketState.OPEN) {
      return; // 已连接
    }

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.apiEndpoint.replace(/^http/, 'ws');
        this.ws = new WebSocket(`${wsUrl}/ws`);

        this.ws.onopen = () => {
          this.log('info', 'WebSocket connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleWebSocketMessage(event.data);
        };

        this.ws.onclose = () => {
          this.log('warn', 'WebSocket disconnected');
          this.emit(SDKEvent.DISCONNECTED, {});
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          this.log('error', 'WebSocket error:', error);
          this.emit(SDKEvent.ERROR, { type: 'websocket', error });
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleWebSocketMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'progress':
          this.generationStatus = {
            isGenerating: true,
            progress: message.payload.percent,
            currentStage: message.payload.stage,
            estimatedTimeRemaining: message.payload.estimatedTimeRemaining,
          };
          this.emit(SDKEvent.GENERATION_PROGRESS, message.payload);
          break;

        case 'complete':
          this.generationStatus.isGenerating = false;
          this.generationStatus.progress = 100;
          break;

        case 'error':
          this.generationStatus.isGenerating = false;
          this.emit(SDKEvent.ERROR, {
            type: 'generation',
            message: message.payload,
          });
          break;

        default:
          this.log('debug', 'Unknown WebSocket message type:', message.type);
      }
    } catch (error) {
      this.log('error', 'Failed to parse WebSocket message:', error);
    }
  }

  /**
   * 调度 WebSocket 重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.log('info', 'Attempting to reconnect WebSocket...');
      this.connectWebSocket().catch((error) => {
        this.log('error', 'Reconnection failed:', error);
      });
    }, this.config.reconnectInterval);
  }

  /**
   * 订阅会话的实时更新
   * @param sessionId 会话 ID
   */
  subscribeToSession(sessionId: string): void {
    if (this.ws?.readyState === WebSocketState.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          sessionId,
        })
      );
    }
  }

  // ==================== HTTP 请求方法 ====================

  /**
   * 发送 HTTP 请求
   *
   * @param config 请求配置
   * @returns 响应数据
   */
  private async request<T>(config: RequestConfig): Promise<T> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    const { method = 'GET', path, data, params, headers = {}, skipCache } = config;

    // 构建 URL
    let url = `${this.config.apiEndpoint}${path}`;
    if (params) {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryParams.append(key, String(value));
      });
      url += `?${queryParams.toString()}`;
    }

    // 检查缓存
    const cacheKey = `${method}:${url}:${JSON.stringify(data || {})}`;
    if (method === 'GET' && !skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.stats.cacheStats.hits++;
        this.updateCacheStats();
        return cached.data as T;
      }
    }
    this.stats.cacheStats.misses++;

    // 构建请求头
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    };

    if (this.config.apiKey) {
      requestHeaders['X-API-Key'] = this.config.apiKey;
    }

    // 发送请求（带重试）
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: data ? JSON.stringify(data) : null,
          signal: AbortSignal.timeout(config.timeout || this.config.timeout),
        });

        const responseTime = Date.now() - startTime;
        this.recordResponseTime(responseTime);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `HTTP ${response.status}: ${response.statusText} - ${errorBody}`
          );
        }

        const result = await response.json() as ApiResponse<T>;

        if (!result.success) {
          throw new Error(result.error?.message || 'Request failed');
        }

        this.stats.successfulRequests++;

        // 缓存 GET 请求结果
        if (method === 'GET' && !skipCache && result.data !== undefined) {
          this.cache.set(cacheKey, {
            data: result.data,
            timestamp: Date.now(),
          });
          this.stats.cacheStats.size = this.cache.size;
        }

        return result.data as T;
      } catch (error: any) {
        lastError = error;

        // 不重试的错误类型
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.config.timeout}ms`);
        }

        if (attempt < this.config.retryAttempts - 1) {
          const delay = Math.pow(2, attempt) * 1000; // 指数退避
          this.log('warn', `Request failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    this.stats.failedRequests++;
    throw lastError || new Error('Request failed after retries');
  }

  // ==================== 工具方法 ====================

  /**
   * 获取当前生成状态
   */
  getGenerationStatus(): GenerationStatus {
    return { ...this.generationStatus };
  }

  /**
   * 获取 SDK 统计信息
   */
  getStats(): SDKStats {
    return { ...this.stats };
  }

  /**
   * 清空请求缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.stats.cacheStats.size = 0;
    this.log('info', 'Cache cleared');
  }

  /**
   * 获取当前会话信息
   */
  getCurrentSession(): PlayerSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  /**
   * 销毁 SDK 实例
   * 清理资源、关闭连接
   */
  async dispose(): Promise<void> {
    this.log('info', 'Disposing SDK...');

    // 关闭 WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 清空缓存和监听器
    this.cache.clear();
    this.eventListeners.clear();

    this.stats.activeSessions = 0;

    this.log('info', 'SDK disposed');
  }

  /**
   * 记录响应时间
   */
  private recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }

    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    this.stats.averageResponseTime = Math.round(sum / this.responseTimes.length);
  }

  /**
   * 更新缓存统计
   */
  private updateCacheStats(): void {
    const total = this.stats.cacheStats.hits + this.stats.cacheStats.misses;
    this.stats.cacheStats.hitRate = total > 0 ? this.stats.cacheStats.hits / total : 0;
  }

  /**
   * 输出日志
   */
  private log(level: string, ...args: any[]): void {
    if (!this.config.debug && level === 'debug') return;

    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);

    if (messageLevelIndex < configLevelIndex) return;

    const prefix = `[GameClientSDK][${level.toUpperCase()}]`;
    console.log(prefix, ...args);
  }

  /**
   * 休眠指定毫秒
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 确保 SDK 已初始化
   */
  private ensureInitialized(): void {
    if (!this.currentSession && this.stats.activeSessions === 0) {
      // 允许未初始化时调用某些方法（如 healthCheck）
    }
  }
}

/**
 * 创建 SDK 实例的工厂函数
 *
 * @param config SDK 配置
 * @returns SDK 实例
 */
export function createSDK(config: SDKConfig): GameClientSDK {
  return new GameClientSDK(config);
}

export default GameClientSDK;
