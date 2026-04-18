// src/core/interfaces/api.types.ts
/**
 * @fileoverview API 层类型定义
 * @description 定义 SDK 和 HTTP API 使用的接口类型
 * @module core/interfaces/api
 * @author xzxllm
 * @license MIT
 */

import { 
  MiniGameType
} from './base.types.js';

/**
 * SDK 配置选项
 * 初始化游戏客户端 SDK 时使用
 * 
 * @example
 * const config: SDKConfig = {
 *   apiEndpoint: 'http://localhost:3000',
 *   apiKey: 'your-api-key',
 *   timeout: 30000,
 *   pregenerateCount: 2
 * };
 */
export interface SDKConfig {
  /** 
   * 引擎配置（本地部署时使用） 
   * 如果提供，SDK 将直接创建本地引擎实例而非连接远程 API
   */
  engineConfig?: {
    llm: {
      provider: 'local' | 'ollama' | 'openai';
      model: string;
      apiKey?: string;
      baseUrl?: string;
    };
    storage?: {
      type: 'sqlite' | 'memory';
      connectionString?: string;
    };
  };
  
  /** 
   * 远程 API 端点（云服务时使用）
   * 格式: http://host:port 或 https://api.example.com
   */
  apiEndpoint?: string;
  
  /** 
   * API 密钥（云服务时用于认证）
   * 在请求头中通过 X-API-Key 传递
   */
  apiKey?: string;
  
  /** 
   * 请求超时时间（毫秒）
   * @default 30000 (30秒)
   */
  timeout?: number;
  
  /** 
   * 请求失败时的重试次数
   * @default 3
   */
  retryAttempts?: number;
  
  /** 
   * 自动预生成关卡数（保持缓冲池大小）
   * 设置为 0 可禁用预生成
   * @default 1
   */
  pregenerateCount?: number;
  
  /** 
   * 调试模式
   * 开启后会输出详细的日志信息，包括 LLM 提示词和原始响应
   * @default false
   */
  debug?: boolean;
  
  /** 
   * 日志级别
   * @default 'info'
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  
  /** 
   * 是否启用请求压缩（gzip）
   * 对大请求体启用可提高传输效率
   * @default true
   */
  enableCompression?: boolean;
}

/**
 * 关卡请求参数
 * SDK 的 requestLevel 方法参数
 * 用于向引擎请求生成新关卡
 */
export interface LevelRequestParams {
  /** 
   * 玩家唯一标识符
   * 用于关联玩家画像和历史记录
   */
  playerId: string;
  
  /** 
   * 会话标识符
   * 单次游戏会话的 ID，用于上下文连续性
   */
  sessionId: string;
  
  /** 
   * 指定难度系数（可选）
   * 范围 0.0 - 1.0，不提供则由引擎根据玩家画像自动计算
   */
  difficulty?: number;
  
  /** 
   * 偏好游戏类型列表（可选）
   * 指定希望包含的小游戏类型，引擎会优先选择
   */
  gameTypes?: MiniGameType[] | string[];
  
  /** 
   * 主题偏好（可选）
   * 如 'dungeon', 'cyber', 'garden' 等
   */
  theme?: string;
  
  /** 
   * 是否立即返回（使用缓冲池）
   * true: 立即返回预生成的关卡（如果没有则等待生成）
   * false: 强制实时生成新关卡
   * @default true
   */
  immediate?: boolean;
  
  /** 
   * 特定剧情事件触发（可选）
   * 用于叙事连续性，如 'found_key', 'defeated_boss'
   */
  triggerEvent?: string;
  
  /** 
   * 要求包含特定小游戏类型（可选）
   * 如需要强制包含 tutorial 类型的谜题
   */
  forceIncludeType?: MiniGameType;
  
  /** 
   * 最大小游戏数量限制（可选）
   * 覆盖默认配置
   */
  maxMiniGames?: number;
  
  /** 
   * 自定义上下文数据（可选）
   * 会传递给 LLM 作为生成参考
   */
  customContext?: Record<string, any>;
}

/**
 * 关卡生成参数
 * 引擎接收的生成请求参数
 * 与 MiniGameContext 的区别：这是 API 层参数，会被转换为内部上下文
 */
export interface LevelGenerationParams {
  /** 玩家唯一标识符（用于关联画像） */
  playerId: string;
  
  /** 会话标识符（单次游戏会话） */
  sessionId: string;
  
  /** 指定难度系数 0.0-1.0（可选，不提供则自动计算） */
  difficulty?: number;
  
  /** 偏好游戏类型列表（可选，引擎优先选择） */
  preferredGameTypes?: MiniGameType[];
  
  /** 主题偏好（可选，如 'dungeon', 'cyber'） */
  theme?: string;
  
  /** 上一个关卡 ID（用于连续性，可选） */
  previousLevelId?: string;
  
  /** 特定剧情事件触发（可选，如 'found_key'） */
  triggerEvent?: string;
  
  /** 强制包含特定小游戏类型（可选） */
  forceIncludeType?: MiniGameType;
  
  /** 最大小游戏数量限制（可选，覆盖默认） */
  maxMiniGames?: number;
}

/**
 * 生成进度事件（API 层导出）
 * 与 generation.types.ts 中的定义保持一致，用于跨模块共享
 */
export interface GenerationProgress {
  /** 会话 ID */
  sessionId: string;
  
  /** 当前阶段 */
  stage: 
    | 'initializing' 
    | 'analyzing' 
    | 'generating_map' 
    | 'generating_minigame' 
    | 'validating' 
    | 'finalizing';
  
  /** 当前步骤索引 */
  currentStep: number;
  
  /** 总步骤数 */
  totalSteps: number;
  
  /** 进度百分比 0-100 */
  percent: number;
  
  /** 状态描述（UI 显示用） */
  message: string;
  
  /** 当前处理的小游戏类型 */
  currentMiniGameType?: MiniGameType;
  
  /** 时间戳（ISO 8601） */
  timestamp: string;
}



/**
 * 玩家反馈数据
 * 提交给引擎的玩家表现数据，用于动态难度调整（DDDA）
 */
export interface PlayerFeedbackData {
  /** 会话 ID */
  sessionId: string;
  
  /** 关卡 ID */
  levelId: string;
  
  /** 
   * 完成时间（秒）
   * 从开始到成功通关的总耗时
   */
  completionTime: number;
  
  /** 
   * 尝试次数
   * 失败的尝试 + 最终成功的 1 次
   */
  attempts: number;
  
  /** 
   * 是否成功通关
   * false 表示玩家放弃或超时
   */
  success: boolean;
  
  /** 
   * 使用的提示次数
   * 包括系统提示和玩家主动请求的提示
   */
  usedHints: number;
  
  /** 
   * 玩家文字反馈（可选）
   * 玩家直接输入的反馈，如"太难了"、"太简单"等
   */
  playerFeedback?: string;
  
  /** 
   * 具体行为日志（可选）
   * 详细记录玩家每一步操作，用于深度分析
   */
  behaviorLog?: Array<{
    /** 时间戳（毫秒，相对于关卡开始） */
    timestamp: number;
    /** 事件类型，如 'move', 'interaction', 'hint_request', 'failure' */
    event: string;
    /** 附加数据 */
    data?: any;
  }>;
  
  /** 
   * 玩家评分 1-5（可选）
   * 通关后让玩家对关卡满意度打分
   */
  rating?: number;
  
  /** 
   * 跳过原因（可选）
   * 如果玩家选择跳过关卡，记录原因
   */
  skipReason?: string;
  
  /** 
   * 发现的bug或问题（可选）
   * 用于收集测试反馈
   */
  reportedIssues?: string[];
}

/**
 * 引擎事件类型枚举
 * 事件总线使用的枚举，用于组件间通信
 */
export enum EngineEvent {
  /** 引擎初始化完成，可以开始接收请求 */
  INITIALIZED = 'initialized',
  
  /** 引擎开始关闭，正在清理资源 */
  DISPOSING = 'disposing',
  
  /** 引擎已完全关闭 */
  DISPOSED = 'disposed',
  
  /** 开始生成关卡 */
  GENERATION_STARTED = 'generation:started',
  
  /** 生成进度更新（包含百分比信息） */
  GENERATION_PROGRESS = 'generation:progress',
  
  /** 关卡生成完成（包含完整关卡数据） */
  LEVEL_GENERATED = 'level:generated',
  
  /** 关卡从缓冲池被取出使用 */
  LEVEL_CONSUMED = 'level:consumed',
  
  /** 玩家画像更新 */
  PROFILE_UPDATED = 'profile:updated',
  
  /** 叙事状态变更 */
  NARRATIVE_CHANGED = 'narrative:changed',
  
  /** 收到玩家反馈 */
  FEEDBACK_RECEIVED = 'feedback:received',
  
  /** 分析完成，画像已更新 */
  ANALYSIS_COMPLETED = 'analysis:completed',
  
  /** 发生错误 */
  ERROR = 'error',
  
  /** 配置变更 */
  CONFIG_CHANGED = 'config:changed',
  
  /** 健康状态变更 */
  HEALTH_STATUS_CHANGED = 'health:changed',
  
  /** LLM 提供商状态变更 */
  LLM_STATUS_CHANGED = 'llm:status_changed',
  
  /** 存储后端状态变更 */
  STORAGE_STATUS_CHANGED = 'storage:status_changed'
}

/**
 * 引擎状态对象
 * 描述引擎当前的运行状态
 */
export interface EngineStatus {
  /** 状态标识 */
  status: 'initializing' | 'ready' | 'busy' | 'error' | 'disposing';
  
  /** 当前活动会话数 */
  activeSessions: number;
  
  /** 进行中的生成任务数 */
  pendingGenerations: number;
  
  /** 缓冲池中的关卡总数（所有会话） */
  bufferedLevelsCount: number;
  
  /** 上次生成耗时（毫秒，最近 5 次平均） */
  avgGenerationTime?: number;
  
  /** 当前配置摘要 */
  configSnapshot?: {
    llmProvider: string;
    storageType: string;
    narrativeEnabled: boolean;
  };
}

/**
 * API 响应标准格式
 * HTTP API 返回的统一结构
 * 
 * @template T 响应数据类型
 */
export interface ApiResponse<T> {
  /** 
   * 请求是否成功处理
   * 注意：HTTP 状态码可能仍是 200，但业务逻辑可能失败
   */
  success: boolean;
  
  /** 
   * 响应数据（成功时）
   * 失败时为 undefined
   */
  data?: T;
  
  /** 
   * 错误信息（失败时）
   */
  error?: {
    /** 错误代码（可用于国际化） */
    code: string;
    /** 错误描述（人类可读） */
    message: string;
    /** 详细错误信息（调试使用） */
    details?: any;
    /** 建议的修复操作 */
    suggestions?: string[];
  };
  
  /** 
   * 响应元数据
   */
  meta?: {
    /** 请求唯一 ID（用于日志追踪） */
    requestId: string;
    /** 服务器时间戳（ISO 8601） */
    timestamp: string;
    /** 处理耗时（毫秒） */
    duration: number;
    /** API 版本 */
    version: string;
    /** 分页信息（如适用） */
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

/**
 * 健康检查状态
 * 服务监控和负载均衡使用
 */
export interface HealthStatus {
  /** 
   * 整体健康状态
   * - healthy: 所有组件正常
   * - degraded: 部分组件性能下降但可用
   * - unhealthy: 关键组件故障，服务不可用
   */
  status: 'healthy' | 'degraded' | 'unhealthy';
  
  /** 
   * 各组件详细状态
   */
  components: {
    /** LLM 提供商状态 */
    llm: { 
      status: 'up' | 'down' | 'degraded';
      provider: string;
      /** 最近一次请求延迟（毫秒） */
      latency: number;
      /** 剩余额度/配额（如适用） */
      quotaRemaining?: number;
    };
    
    /** 存储后端状态 */
    storage: { 
      status: 'up' | 'down';
      type: string;
      /** 连接池使用率（0-1） */
      poolUtilization?: number;
    };
    
    /** 生成队列状态 */
    generation: { 
      status: 'idle' | 'busy' | 'overloaded';
      /** 当前队列长度 */
      queueSize: number;
      /** 平均等待时间（毫秒） */
      avgWaitTime?: number;
    };
    
    /** 内存使用状态（Node.js 进程） */
    memory?: {
      status: 'normal' | 'high' | 'critical';
      used: number;      // MB
      total: number;     // MB
      percent: number;   // 0-1
    };
  };
  
  /** 服务版本 */
  version: string;
  
  /** 运行时间（秒） */
  uptime: number;
  
  /** 时间戳 */
  timestamp: string;
}

/**
 * WebSocket 实时消息类型
 * 用于 WebSocket 连接的消息结构
 */
export interface WebSocketMessage<T = any> {
  /** 消息类型 */
  type: 'progress' | 'complete' | 'error' | 'ping' | 'pong' | 'subscribe';
  
  /** 关联的会话 ID */
  sessionId: string;
  
  /** 消息负载 */
  payload: T;
  
  /** 时间戳 */
  timestamp: string;
  
  /** 序列号（用于排序和去重） */
  sequence?: number;
}

/**
 * 批量操作请求
 * 用于批量生成或查询
 */
export interface BatchRequest<T> {
  /** 批次 ID（客户端生成，用于幂等性） */
  batchId: string;
  
  /** 请求项目列表 */
  items: T[];
  
  /** 并行度限制（同时处理的数量） */
  concurrency?: number;
  
  /** 是否继续执行单个失败的项目 */
  continueOnError?: boolean;
}

/**
 * 批量操作响应
 */
export interface BatchResponse<T> {
  /** 批次 ID */
  batchId: string;
  
  /** 成功项目 */
  succeeded: Array<{
    index: number;
    data: T;
  }>;
  
  /** 失败项目 */
  failed: Array<{
    index: number;
    error: { code: string; message: string };
  }>;
  
  /** 统计信息 */
  stats: {
    total: number;
    successCount: number;
    failCount: number;
    totalDuration: number;
  };
}

/**
 * 导出配置接口
 * 用于导出玩家数据或关卡模板
 */
export interface ExportConfig {
  /** 导出格式 */
  format: 'json' | 'yaml' | 'csv';
  
  /** 包含的数据类型 */
  include: Array<'profile' | 'history' | 'levels' | 'observations'>;
  
  /** 时间范围过滤（可选） */
  dateRange?: {
    start: string;
    end: string;
  };
  
  /** 是否匿名化敏感数据 */
  anonymize?: boolean;
  
  /** 压缩选项 */
  compression?: 'none' | 'gzip' | 'zip';
}

/**
 * 导入配置接口
 * 用于导入关卡模板或玩家数据
 */
export interface ImportConfig {
  /** 数据格式 */
  format: 'json' | 'yaml';
  
  /** 导入模式 */
  mode: 'merge' | 'replace' | 'skip';
  
  /** 数据验证严格程度 */
  validation: 'strict' | 'lenient' | 'none';
  
  /** 导入前备份现有数据 */
  backupBeforeImport?: boolean;
}

/**
 * 调试信息接口
 * 开发模式下返回的详细调试数据
 */
export interface DebugInfo {
  /** 使用的提示词（完整文本） */
  prompts?: {
    system?: string;
    user: string;
    full: string;
  };
  
  /** LLM 原始响应（未解析） */
  rawLLMResponse?: string;
  
  /** 解析过程详情 */
  parsingSteps?: Array<{
    step: string;
    input: any;
    output: any;
    duration: number;
  }>;
  
  /** 验证结果详情 */
  validationDetails?: {
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      message?: string;
    }>;
  };
  
  /** 性能计时（各阶段耗时） */
  timing?: {
    total: number;
    llmRequest: number;
    parsing: number;
    validation: number;
    storage: number;
  };
  
  /** 内存使用快照 */
  memorySnapshot?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
}

/**
 * 分页查询参数
 */
export interface PaginationParams {
  /** 页码（从 1 开始） */
  page: number;
  
  /** 每页数量 */
  pageSize: number;
  
  /** 排序字段 */
  sortBy?: string;
  
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  
  /** 过滤器 */
  filter?: Record<string, any>;
}

/**
 * 缓存控制头
 * 用于 HTTP API 缓存策略
 */
export interface CacheControl {
  /** 是否启用缓存 */
  enabled: boolean;
  
  /** 缓存时间（秒） */
  maxAge?: number;
  
  /** 是否允许共享缓存（CDN） */
  shared?: boolean;
  
  /** 缓存键（基于哪些参数） */
  cacheKey?: string[];
}

/**
 * 实时统计信息
 * 用于 Dashboard 或监控面板
 */
export interface RealtimeStats {
  /** 当前在线会话数 */
  activeSessions: number;
  
  /** 最近 1 分钟生成请求数 */
  requestsPerMinute: number;
  
  /** 平均生成时间趋势（最近 10 个点） */
  generationTimeTrend: number[];
  
  /** LLM 提供商使用分布 */
  providerUsage: Record<string, number>;
  
  /** 错误率趋势（百分比） */
  errorRateTrend: number[];
  
  /** 玩家满意度分布 */
  playerRatings: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
  
  /** 热门游戏类型（最近 24 小时） */
  popularGameTypes: Array<{
    type: MiniGameType;
    count: number;
  }>;
}