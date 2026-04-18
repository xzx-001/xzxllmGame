/**
 * @fileoverview 存储适配器基础接口与抽象类
 * @description 定义 xzxllmGame 记忆系统的标准存储契约。
 * 采用业务领域导向的接口设计（玩家画像、叙事状态、观察记录、关卡缓冲），
 * 同时支持通用KV存储模式 (StorageItem/StorageQuery)。
 * 
 * 架构层级：
 * 1. StorageAdapter (接口) - 定义业务方法契约
 * 2. BaseStorageAdapter (抽象类) - 提供通用工具和默认实现
 * 3. 具体实现 - SQLiteStorageAdapter / RedisStorageAdapter / MemoryStorageAdapter
 * 
 * @module memory/storage/base-storage
 * @author xzxllm
 * @license MIT
 */

import {
  PlayerProfile,
  NarrativeState,
  DialogueObservation,
  LevelStructure,
  RelationshipStage,
  AIMood
} from '../../core/interfaces/base.types.js';

// ==================== 通用KV存储类型 (兼容层) ====================

/**
 * 通用存储项标准格式
 * 用于基础键值存储操作，支持任意类型数据
 * 
 * @template T 存储值的类型
 */
export interface StorageItem<T> {
  /** 存储键 (唯一标识) */
  key: string;
  
  /** 存储值 (任意可序列化数据) */
  value: T;
  
  /** 创建时间戳 (Unix毫秒或ISO字符串，取决于实现) */
  createdAt: number;
  
  /** 最后更新时间戳 */
  updatedAt: number;
}

/**
 * 通用存储查询条件
 * 用于在存储中搜索和过滤数据
 * 
 * @template T 存储值的类型，用于过滤函数类型推断
 */
export interface StorageQuery<T> {
  /** 键前缀匹配 (如 "player:" 匹配所有玩家相关键) */
  prefix?: string;
  
  /** 值过滤函数 (对值进行自定义判断) */
  filter?: (value: T) => boolean;
  
  /** 时间范围开始 (时间戳，包含) */
  since?: number;
  
  /** 时间范围结束 (时间戳，包含) */
  until?: number;
  
  /** 排序字段 (StorageItem的字段名) */
  orderBy?: keyof StorageItem<T>;
  
  /** 排序方向 (默认升序) */
  order?: 'asc' | 'desc';
  
  /** 结果数量限制 */
  limit?: number;
}

// ==================== 存储配置与选项 ====================

/**
 * 存储适配器通用选项
 * 用于控制存储行为的元数据
 */
export interface StorageOptions {
  /** 
   * 数据生存时间 (TTL, Time To Live)，单位毫秒
   * 0 或 undefined 表示永不过期
   * 主要用于关卡缓冲池的自动清理
   */
  ttl?: number;
  
  /** 
   * 数据标签，用于分类和查询
   * 例如：['minigame', 'laser', 'difficult']
   */
  tags?: string[];
  
  /** 
   * 优先级，影响缓冲池消费顺序
   * 数值越高越优先，默认 0 (FIFO)
   */
  priority?: number;
}

// ==================== 统计与监控类型 ====================

/**
 * 存储后端统计信息
 * 用于监控、告警和容量规划
 */
export interface StorageStats {
  /** 存储的总玩家档案数 */
  totalPlayerProfiles: number;
  
  /** 活跃叙事会话数 (最近1小时有活动) */
  activeNarrativeSessions: number;
  
  /** 待处理的观察记录数 */
  pendingObservations: number;
  
  /** 关卡缓冲池中的总关卡数 */
  bufferedPuzzles: number;
  
  /** 存储占用估算 (MB)，-1 表示不支持 */
  estimatedSizeMB: number;
  
  /** 
   * 操作统计 (上次重置以来)
   * 用于性能监控
   */
  operations: {
    reads: number;
    writes: number;
    deletes: number;
    errors: number;
  };
  
  /** 统计时间戳 (ISO 8601) */
  timestamp: string;
  
  /** 存储后端类型标识 */
  storageType: string;
  
  /** 运行时长 (秒)，-1 表示未知 */
  uptime: number;
}

/**
 * 缓冲关卡条目
 * 包含关卡数据和元数据
 */
export interface BufferedPuzzle {
  /** 唯一标识 (由存储层生成) */
  id: string;
  
  /** 序列化的关卡数据 */
  puzzleData: LevelStructure | object;
  
  /** 生成时的难度系数 (0-1) */
  difficulty: number;
  
  /** 生成时的AI情绪状态 */
  mood: string;
  
  /** 创建时间戳 (ISO 8601) */
  createdAt: string;
  
  /** 消费状态 */
  consumed: boolean;
  
  /** 消费时间 (如已消费) */
  consumedAt?: string;
  
  /** 关联的会话ID */
  sessionId: string;
  
  /** 标签 (如谜题类型) */
  tags?: string[];
}

/**
 * 存储健康状态详情
 */
export interface HealthStatus {
  /** 是否健康 */
  healthy: boolean;
  
  /** 响应延迟 (ms)，-1 表示超时或失败 */
  latencyMs: number;
  
  /** 检查时间戳 */
  checkedAt: string;
  
  /** 状态详情 */
  details: {
    /** 连接状态 */
    connected: boolean;
    
    /** 存储空间状态 (true = 充足) */
    diskSpaceAvailable?: boolean;
    
    /** 内存使用状态 (true = 正常) */
    memoryPressure?: boolean;
    
    /** 最后错误信息 (如有) */
    lastError?: string;
  };
}

/**
 * 分页查询结果包装器
 */
export interface PaginatedResult<T> {
  /** 当前页数据 */
  data: T[];
  
  /** 是否有更多数据 */
  hasMore: boolean;
  
  /** 下一页游标 (null 表示无更多页) */
  nextCursor: string | null;
  
  /** 总数估算 (-1 表示不支持) */
  totalEstimate: number;
}

// ==================== 存储适配器接口 ====================

/**
 * 存储适配器接口
 * 
 * 设计原则：
 * 1. 领域驱动：方法名反映业务概念 (PlayerProfile, NarrativeState) 而非技术概念 (get/set)
 * 2. 异步优先：所有IO操作均为Promise，支持async/await
 * 3. 幂等设计：创建操作均为"如不存在则创建"语义，避免重复检查
 * 4. 批量友好：观察记录支持批量提交和批量标记处理，减少IO次数
 * 5. 类型安全：充分利用TypeScript泛型和严格类型
 * 
 * 实现指南：
 * - 必须实现所有抽象方法
 * - 建议覆盖默认实现以利用特定后端优化 (如SQL索引、Redis管道)
 * - 所有时间戳使用 ISO 8601 格式 (new Date().toISOString())
 * - 错误应抛出而非返回null，但"不存在"应返回null而非抛出
 */
export interface StorageAdapter {
  [x: string]: any;
  /** 
   * 存储后端类型标识
   * 如: 'sqlite', 'redis', 'memory', 'postgresql'
   */
  readonly storageType: string;
  
  // ==================== 生命周期管理 ====================
  
  /**
   * 初始化存储连接
   * 
   * 职责：
   * - 建立数据库连接/连接池
   * - 创建表结构和索引
   * - 执行迁移脚本 (如有)
   * - 验证连接可用性
   * 
   * @throws {StorageInitError} 连接失败或权限不足时抛出
   * @throws {StorageMigrationError} 迁移失败时抛出
   */
  initialize(): Promise<void>;
  
  /**
   * 关闭存储连接
   * 
   * 职责：
   * - 优雅关闭连接池
   * - 刷新缓冲区 (如SQLite的WAL模式)
   * - 释放文件句柄
   * - 清理临时资源
   * 
   * 注意：应用关闭前必须调用，防止数据丢失或句柄泄漏
   */
  close(): Promise<void>;
  
  // ==================== 通用KV操作 (兼容层) ====================
  
  /**
   * 通用键值存储 - 设置值
   * 用于灵活存储非结构化数据
   * 
   * @param key 存储键
   * @param value 存储值
   * @param options 存储选项
   */
  set<T>(key: string, value: T, options?: StorageOptions): Promise<boolean>;
  
  /**
   * 通用键值存储 - 获取值
   * 
   * @param key 存储键
   * @returns 存储值，不存在返回 undefined
   */
  get<T>(key: string): Promise<T | undefined>;
  
  /**
   * 通用批量获取
   * 
   * @param keys 键数组
   * @returns 键值映射 (不存在的键不出现)
   */
  getMany<T>(keys: string[]): Promise<Map<string, T>>;
  
  /**
   * 通用批量设置
   * 
   * @param entries 键值对数组
   * @param options 存储选项
   */
  setMany<T>(
    entries: Array<{ key: string; value: T }>, 
    options?: StorageOptions
  ): Promise<void>;
  
  /**
   * 通用删除
   * 
   * @param key 存储键
   * @returns 是否成功删除
   */
  delete(key: string): Promise<boolean>;
  
  /**
   * 通用查询
   * 基于 StorageQuery 条件搜索
   * 
   * @param query 查询条件
   * @returns 匹配的存储项列表
   */
  query<T>(query: StorageQuery<T>): Promise<StorageItem<T>[]>;
  
  /**
   * 清空所有数据 (危险操作)
   */
  clear(): Promise<void>;
  
  /**
   * 检查键是否存在
   * 
   * @param key 存储键
   */
  has(key: string): Promise<boolean>;
  
  /**
   * 获取所有键列表 (谨慎使用)
   */
  keys(): Promise<string[]>;
  
  /**
   * 导出数据
   * 
   * @param filter 可选过滤函数
   */
  export<T>(filter?: (key: string) => boolean): Promise<Record<string, T>>;
  
  /**
   * 导入数据
   * 
   * @param data 数据对象
   * @param options 导入选项
   */
  import<T>(
    data: Record<string, T>, 
    options?: { ttl?: number; skipExisting?: boolean }
  ): Promise<void>;
  
  // ==================== 玩家画像操作 (Player Profile) ====================
  
  /**
   * 获取玩家完整画像
   * 
   * 性能提示：实现应使用缓存或索引优化频繁读取
   * 
   * @param playerId 玩家唯一标识 (通常是UUID或设备ID)
   * @returns 玩家画像对象，不存在时返回 null (而非undefined)
   * @throws 存储访问错误时抛出
   */
  getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
  
  /**
   * 原子性更新玩家画像
   * 
   * 语义：
   * - 使用 Partial<PlayerProfile> 支持部分字段更新
   * - 实现应自动处理 lastUpdated 时间戳更新
   * - 建议实现乐观锁或原子操作防止并发覆盖
   * 
   * @param playerId 玩家标识
   * @param updates 要更新的字段 (无需包含完整对象)
   * @throws 玩家不存在时可选择抛出或静默创建
   */
  updatePlayerProfile(playerId: string, updates: Partial<PlayerProfile>): Promise<void>;
  
  /**
   * 创建玩家档案（如不存在）
   * 
   * 幂等语义：
   * - 检查是否存在
   * - 如存在，返回现有档案
   * - 如不存在，创建默认档案并返回
   * 
   * 默认档案值：
   * - skillRating: 0.5 (中等水平)
   * - frustrationLevel: 0 (无挫败感)
   * - relationshipStage: 'rivals' (游戏叙事设定)
   * 
   * @param playerId 玩家标识
   * @returns 现有或新创建的档案
   */
  createPlayerProfileIfNotExists(playerId: string): Promise<PlayerProfile>;
  
  /**
   * 获取近期活跃玩家列表
   * 
   * 用途：后台任务批量处理玩家数据
   * 
   * @param hours 时间窗口 (小时)，默认 24
   * @param limit 最大返回数，默认 100
   * @returns 玩家ID数组，按最近活跃时间倒序
   */
  getRecentPlayers(hours?: number, limit?: number): Promise<string[]>;
  
  // ==================== 叙事状态操作 (Narrative State) ====================
  
  /**
   * 获取会话叙事状态
   * 
   * 叙事状态包含：
   * - 当前AI情绪 (currentMood)
   * - 生成状态 (generationStatus: idle/generating/ready/error)
   * - 世界观状态 (worldState)
   * - 进行中的剧情线 (ongoingPlot)
   * 
   * @param sessionId 会话唯一标识 (不同于playerId，一次游戏会话一个ID)
   * @returns 叙事状态，不存在返回 null
   */
  getNarrativeState(sessionId: string): Promise<NarrativeState | null>;
  
  /**
   * 更新会话叙事状态
   * 
   * 典型更新场景：
   * - AI情绪变化 (playful -> stubborn)
   * - 生成状态变更 (idle -> generating)
   * - 世界观变量更新 (发现新线索)
   * 
   * @param sessionId 会话标识
   * @param updates 部分字段更新
   */
  updateNarrativeState(sessionId: string, updates: Partial<NarrativeState>): Promise<void>;
  
  /**
   * 创建叙事状态（如不存在）
   * 
   * 默认状态：
   * - currentMood: 'playful'
   * - generationStatus: 'idle'
   * - ongoingPlot: 'beginning'
   * 
   * @param sessionId 会话标识
   * @param playerId 关联的玩家标识 (外键关系)
   * @returns 现有或新创建的状态
   */
  createNarrativeStateIfNotExists(sessionId: string, playerId: string): Promise<NarrativeState>;
  
  /**
   * 获取会话当前有效 mood
   * 快捷方法，避免获取完整对象
   */
  getCurrentMood(sessionId: string): Promise<string | null>;
  
  // ==================== 观察记录操作 (Observations) ====================
  
  /**
   * 提交单个观察记录
   * 
   * 观察类型 (observationType)：
   * - 'dialogue': 玩家对话/选择
   * - 'action': 游戏内操作 (推箱子、点击等)
   * - 'emotion': 检测到的情绪信号
   * - 'progress': 进度事件 (关卡完成/失败)
   * 
   * 存储层自动生成：
   * - id: 自增ID或UUID
   * - timestamp: ISO 8601 当前时间
   * - processed: false
   * 
   * @param obs 观察记录 (不含 id/timestamp/processed)
   */
  submitObservation(obs: Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>): Promise<void>;
  
  /**
   * 批量提交观察记录
   * 
   * 性能优化：单条提交在大量事件时性能差，应使用此方法
   * 默认实现：循环调用单条，子类应覆盖使用批量插入
   * 
   * @param observations 观察记录数组
   */
  submitObservationsBatch(
    observations: Array<Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>>
  ): Promise<void>;
  
  /**
   * 获取未处理的观察记录
   * 
   * 后台分析器使用此方法轮询新数据
   * 实现应保证：
   * - 返回的记录标记为处理中或锁定，防止并发重复处理
   * - 按时间戳排序，保证FIFO
   * 
   * @param limit 最大返回数量，默认 50
   * @returns 观察记录列表，可能为空数组
   */
  getUnprocessedObservations(limit?: number): Promise<DialogueObservation[]>;
  
  /**
   * 标记观察记录为已处理
   * 
   * 分析完成后调用，防止重复处理
   * 应支持批量更新以提高性能
   * 
   * @param ids 记录ID列表 (StorageAdapter生成的id)
   */
  markObservationsProcessed(ids: number[] | string[]): Promise<void>;
  
  /**
   * 获取玩家观察历史
   * 
   * 用于构建LLM上下文，需要最近的观察记录
   * 支持类型筛选，例如只获取 'dialogue' 和 'progress'
   * 
   * @param playerId 玩家标识 (注意：可能是playerId或sessionId，取决于obs存储方式)
   * @param limit 返回数量限制，默认 50
   * @param types 筛选特定类型，undefined 表示不筛选
   * @returns 观察记录列表，按时间倒序
   */
  getPlayerObservations(
    playerId: string, 
    limit?: number,
    types?: string[]
  ): Promise<DialogueObservation[]>;
  
  /**
   * 获取会话观察历史 (分页)
   * 
   * 用于详细分析或导出
   * 
   * @param sessionId 会话标识
   * @param cursor 分页游标 (null 表示第一页)
   * @param pageSize 每页大小，默认 100
   */
  getObservationsPaginated(
    sessionId: string,
    cursor?: string | null,
    pageSize?: number
  ): Promise<PaginatedResult<DialogueObservation>>;
  
  /**
   * 清理过期观察记录
   * 
   * 防止存储无限增长，应定期调用
   * 默认策略：保留30天
   * 
   * @param daysToKeep 保留天数，默认 30
   * @returns 删除的记录数
   */
  cleanupOldObservations(daysToKeep?: number): Promise<number>;
  
  // ==================== 关卡缓冲池操作 (Puzzle Buffer) ====================
  
  /**
   * 存储预生成的关卡
   * 
   * 放入FIFO队列，供后续快速消费
   * 支持选项：
   * - priority: 高优先级关卡优先消费
   * - tags: 类型标签用于筛选
   * - ttl: 过期时间，自动清理
   * 
   * @param sessionId 会话标识
   * @param puzzleData 关卡数据对象 (JSON序列化)
   * @param difficulty 难度系数 (0-1)
   * @param mood 生成时的AI情绪
   * @param options 存储选项
   * @returns 关卡ID
   */
  storePuzzle(
    sessionId: string, 
    puzzleData: LevelStructure | object, 
    difficulty: number, 
    mood: string,
    options?: StorageOptions
  ): Promise<string>;
  
  /**
   * 消费下一个可用关卡
   * 
   * FIFO队列，但受priority影响：
   * - 优先返回高优先级 (priority 值大) 的关卡
   * - 同优先级下按 createdAt 先后
   * 
   * 消费后标记 consumed=true 并记录 consumedAt
   * 
   * @param sessionId 会话标识
   * @param filter 可选过滤条件，如特定类型关卡
   * @returns 关卡数据，无可用返回 null (触发实时生成)
   */
  consumeNextPuzzle(
    sessionId: string,
    filter?: { tags?: string[]; maxDifficulty?: number }
  ): Promise<BufferedPuzzle | null>;
  
  /**
   * 查看但不消费下一个关卡
   * 用于预览或难度检查
   */
  peekNextPuzzle(sessionId: string): Promise<BufferedPuzzle | null>;
  
  /**
   * 获取待消费关卡数量
   * 
   * 监控指标：低于阈值时触发后台预生成
   * 
   * @param sessionId 会话标识
   * @param filter 可选筛选条件
   */
  getPendingPuzzleCount(
    sessionId: string,
    filter?: { tags?: string[] }
  ): Promise<number>;
  
  /**
   * 列出所有待消费关卡 (分页)
   * 用于管理界面查看缓冲池状态
   */
  listPendingPuzzles(
    sessionId: string,
    cursor?: string | null,
    pageSize?: number
  ): Promise<PaginatedResult<BufferedPuzzle>>;
  
  /**
   * 清理过期关卡
   * 
   * 关卡长时间未消费可能已不适应当前玩家技能，应清理
   * 默认策略：24小时
   * 
   * @param maxAgeHours 最大保留时间（小时），默认 24
   * @param sessionId 可选指定会话，undefined 清理所有
   * @returns 清理数量
   */
  cleanupOldPuzzles(maxAgeHours?: number, sessionId?: string): Promise<number>;
  
  /**
   * 删除特定关卡
   * 用于手动管理或测试
   */
  removePuzzle(puzzleId: string): Promise<boolean>;
  
  // ==================== 会话管理 (Session Management) ====================
  
  /**
   * 获取活跃会话列表
   * 
   * 活跃定义：最近有观察记录或缓冲关卡更新的会话
   * 
   * @param hours 时间窗口（小时），默认 1
   * @returns 会话ID列表，按最近活动时间倒序
   */
  getActiveSessions(hours?: number): Promise<string[]>;
  
  /**
   * 获取会话统计
   * 
   * 快速概览，无需聚合查询
   * 
   * @param sessionId 会话标识
   */
  getSessionStats(sessionId: string): Promise<{
    observationCount: number;
    pendingPuzzles: number;
    lastActivity: string | null;
  }>;
  
  /**
   * 结束会话 (软删除)
   * 
   * 标记会话为结束状态，但保留数据
   * 实际清理由 cleanupOldObservations 处理
   */
  endSession(sessionId: string): Promise<void>;
  
  // ==================== 监控与运维 ====================
  
  /**
   * 获取存储统计信息
   * 
   * 用于监控面板、容量规划、告警
   * 
   * @returns 统计快照
   */
  getStats(): Promise<StorageStats>;
  
  /**
   * 重置统计计数器
   * 用于定期监控区间统计
   */
  resetStats(): Promise<void>;
  
  /**
   * 健康检查
   * 
   * 快速检测存储可用性
   * 
   * @returns 健康状态详情
   */
  healthCheck(): Promise<HealthStatus>;
  
  /**
   * 导出会话完整数据
   * 
   * 用于调试、备份、迁移
   * 包含：档案、状态、观察、关卡
   * 
   * @param sessionId 会话标识
   * @returns 完整数据JSON对象
   */
  exportSessionData(sessionId: string): Promise<{
    profile: PlayerProfile | null;
    narrative: NarrativeState | null;
    observations: DialogueObservation[];
    puzzles: BufferedPuzzle[];
  }>;
  
  /**
   * 导入会话数据
   * 
   * 用于恢复或测试数据注入
   * 警告：可能覆盖现有数据
   */
  importSessionData(
    sessionId: string,
    data: {
      profile?: PlayerProfile;
      narrative?: NarrativeState;
      observations?: DialogueObservation[];
      puzzles?: BufferedPuzzle[];
    }
  ): Promise<void>;
  
  /**
   * 全局搜索
   * 
   * 跨所有数据类型搜索 (调试用途)
   * 注意：性能开销大，生产环境慎用
   */
  search?(query: string, limit?: number): Promise<Array<{
    type: 'profile' | 'observation' | 'puzzle' | 'narrative';
    id: string;
    snippet: string;
  }>>;
}

// ==================== 抽象基类 ====================

/**
 * 存储适配器抽象基类
 * 
 * 提供：
 * 1. 通用工具方法 (时间戳、JSON序列化)
 * 2. 默认实现 (简单循环批量操作)
 * 3. 配置管理
 * 
 * 子类实现指南：
 * 1. 设置 readonly storageType
 * 2. 实现所有抽象方法
 * 3. 覆盖默认实现以利用特定后端优化
 * 4. 调用 super.initialize() 和 super.close() (如需要基础功能)
 */
export abstract class BaseStorageAdapter implements StorageAdapter {
  /** 必须由子类定义，标识存储类型 */
  abstract readonly storageType: string;
  
  /** 配置对象，由构造函数传入 */
  protected config: Record<string, unknown>;
  
  /** 统计计数器，子类应更新这些值 */
  protected stats: StorageStats['operations'];
  
  /** 初始化时间，用于计算运行时长 */
  protected initializedAt: Date | null = null;

  /**
   * 构造函数
   * @param config 存储特定配置 (如连接字符串、端口等)
   */
  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.stats = {
      reads: 0,
      writes: 0,
      deletes: 0,
      errors: 0
    };
  }

  // ==================== 必须由子类实现的方法 ====================
  
  abstract initialize(): Promise<void>;
  abstract close(): Promise<void>;
  abstract set<T>(key: string, value: T, options?: StorageOptions): Promise<boolean>;
  abstract get<T>(key: string): Promise<T | undefined>;
  abstract getMany<T>(keys: string[]): Promise<Map<string, T>>;
  abstract setMany<T>(entries: Array<{ key: string; value: T }>, options?: StorageOptions): Promise<void>;
  abstract delete(key: string): Promise<boolean>;
  abstract query<T>(query: StorageQuery<T>): Promise<StorageItem<T>[]>;
  abstract clear(): Promise<void>;
  abstract has(key: string): Promise<boolean>;
  abstract keys(): Promise<string[]>;
  abstract export<T>(filter?: (key: string) => boolean): Promise<Record<string, T>>;
  abstract import<T>(data: Record<string, T>, options?: { ttl?: number; skipExisting?: boolean }): Promise<void>;
  abstract getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
  abstract updatePlayerProfile(playerId: string, updates: Partial<PlayerProfile>): Promise<void>;
  abstract getNarrativeState(sessionId: string): Promise<NarrativeState | null>;
  abstract updateNarrativeState(sessionId: string, updates: Partial<NarrativeState>): Promise<void>;
  abstract submitObservation(obs: Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>): Promise<void>;
  abstract getUnprocessedObservations(limit?: number): Promise<DialogueObservation[]>;
  abstract markObservationsProcessed(ids: number[] | string[]): Promise<void>;
  abstract storePuzzle(
    sessionId: string, 
    puzzleData: LevelStructure | object, 
    difficulty: number, 
    mood: string,
    options?: StorageOptions
  ): Promise<string>;
  abstract consumeNextPuzzle(
    sessionId: string,
    filter?: { tags?: string[]; maxDifficulty?: number }
  ): Promise<BufferedPuzzle | null>;
  abstract getPendingPuzzleCount(
    sessionId: string,
    filter?: { tags?: string[] }
  ): Promise<number>;
  abstract getActiveSessions(hours?: number): Promise<string[]>;
  abstract healthCheck(): Promise<HealthStatus>;
  abstract getStats(): Promise<StorageStats>;

  // ==================== 带默认实现的方法 ====================
  
  /**
   * 默认实现：批量提交观察记录
   * 
   * 子类应覆盖此方法以使用原生批量插入：
   * - SQLite: INSERT INTO ... VALUES (...), (...), (...)
   * - Redis: Pipeline 或 MULTI/EXEC
   * - PostgreSQL: COPY FROM 或批量 INSERT
   * 
   * 当前默认实现：顺序单条插入，性能较低但保证兼容性
   */
  async submitObservationsBatch(
    observations: Array<Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>>
  ): Promise<void> {
    for (const obs of observations) {
      await this.submitObservation(obs);
    }
  }

  /**
   * 默认实现：创建玩家档案（如不存在）
   * 
   * 逻辑：
   * 1. 查询现有档案
   * 2. 如存在，返回
   * 3. 如不存在，创建默认值并保存
   * 
   * 子类可覆盖以使用原子操作 (如 INSERT OR IGNORE)
   */
  async createPlayerProfileIfNotExists(playerId: string): Promise<PlayerProfile> {
    const existing = await this.getPlayerProfile(playerId);
    if (existing) return existing;
    
    // 创建符合游戏设定的默认档案
    const newProfile: PlayerProfile = {
      playerId,
      skillRating: 0.5,           // 中等初始技能
      preferredTypes: [],         // 无初始偏好
      frustrationLevel: 0,        // 无挫败感
      winStreak: 0,               // 连胜纪录
      loseStreak: 0,              // 连败纪录
      relationshipStage: RelationshipStage.RIVALS, // 叙事设定：AI与玩家是对手关系
      lastUpdated: this.now(),
      createdAt: this.now()
    };
    
    await this.updatePlayerProfile(playerId, newProfile);
    return newProfile;
  }

  /**
   * 默认实现：创建叙事状态（如不存在）
   */
  async createNarrativeStateIfNotExists(sessionId: string, playerId: string): Promise<NarrativeState> {
    const existing = await this.getNarrativeState(sessionId);
    if (existing) return existing;
    
    const newState: NarrativeState = {
      sessionId,
      playerId,
      currentMood: AIMood.PLAYFUL,      // 初始情绪：轻松玩闹
      generationStatus: 'idle',    // 初始状态：空闲
      aiImpression: '',            // 初始印象：空
      ongoingPlot: 'beginning',    // 剧情线：开始
      worldState: {},              // 世界观状态：空对象
      updatedAt: this.now()
    };
    
    await this.updateNarrativeState(sessionId, newState);
    return newState;
  }

  /**
   * 默认实现：获取当前 mood
   * 简单委托给 getNarrativeState，子类可优化为单独查询
   */
  async getCurrentMood(sessionId: string): Promise<string | null> {
    const state = await this.getNarrativeState(sessionId);
    return state?.currentMood ?? null;
  }

  /**
   * 默认实现：获取玩家观察历史
   * 
   * 注意：此默认实现效率低，获取所有未处理记录后过滤
   * 子类应实现为带 playerId 条件的数据库查询
   */
  async getPlayerObservations(
    playerId: string,
    limit: number = 50,
    types?: string[]
  ): Promise<DialogueObservation[]> {
    // 获取大量记录后内存过滤 (仅适用于测试)
    const all = await this.getUnprocessedObservations(1000);
    
    let filtered = all.filter(obs => obs.sessionId === playerId);
    
    if (types && types.length > 0) {
      filtered = filtered.filter(obs => types.includes(obs.observationType));
    }
    
    // 按时间倒序 (最新在前)
    filtered.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
    
    return filtered.slice(0, limit);
  }

  /**
   * 默认实现：分页获取观察记录
   * 使用游标分页 (Cursor-based)，避免OFFSET性能问题
   */
  async getObservationsPaginated(
    sessionId: string,
    cursor: string | null = null,
    pageSize: number = 100
  ): Promise<PaginatedResult<DialogueObservation>> {
    // 基础实现：获取全部后切片 (仅适用于测试)
    const all = await this.getPlayerObservations(sessionId, 10000);
    
    let startIndex = 0;
    if (cursor) {
      const cursorNum = parseInt(cursor, 10);
      if (!isNaN(cursorNum)) {
        const cursorIndex = all.findIndex(obs => obs.id !== undefined && obs.id === cursorNum);
        if (cursorIndex !== -1) {
          startIndex = cursorIndex + 1;
        }
      }
    }
    
    const data = all.slice(startIndex, startIndex + pageSize);
    const hasMore = all.length > startIndex + pageSize;
    const lastItem = data.length > 0 ? data[data.length - 1] : null;
    const nextCursor = hasMore && lastItem && lastItem.id !== undefined
      ? String(lastItem.id)
      : null;
    
    return {
      data,
      hasMore,
      nextCursor,
      totalEstimate: all.length
    };
  }

  /**
   * 默认实现：清理过期观察记录
   * 子类应使用数据库的 DELETE WHERE timestamp < date
   */
  async cleanupOldObservations(daysToKeep: number = 30): Promise<number> {
    void daysToKeep;
    console.warn(`[${this.storageType}] cleanupOldObservations using default no-op implementation`);
    return 0;
  }

  /**
   * 默认实现：查看但不消费关卡
   */
  async peekNextPuzzle(sessionId: string): Promise<BufferedPuzzle | null> {
    void sessionId;
    // 消费后立即回滚实现复杂，默认实现不支持
    // 子类可使用 SELECT FOR UPDATE SKIP LOCKED (PostgreSQL) 或事务
    console.warn(`[${this.storageType}] peekNextPuzzle not implemented, returning null`);
    return null;
  }

  /**
   * 默认实现：列出待消费关卡
   */
  async listPendingPuzzles(
    sessionId: string,
    cursor: string | null = null,
    pageSize: number = 100
  ): Promise<PaginatedResult<BufferedPuzzle>> {
    void cursor;
    void pageSize;
    // 基础实现：无分页支持
    return {
      data: [],
      hasMore: false,
      nextCursor: null,
      totalEstimate: await this.getPendingPuzzleCount(sessionId)
    };
  }

  /**
   * 默认实现：清理过期关卡
   */
  async cleanupOldPuzzles(maxAgeHours: number = 24, sessionId?: string): Promise<number> {
    void maxAgeHours;
    void sessionId;
    console.warn(`[${this.storageType}] cleanupOldPuzzles using default no-op implementation`);
    return 0;
  }

  /**
   * 默认实现：删除特定关卡
   */
  async removePuzzle(puzzleId: string): Promise<boolean> {
    void puzzleId;
    console.warn(`[${this.storageType}] removePuzzle not implemented`);
    return false;
  }

  /**
   * 默认实现：获取近期活跃玩家
   * 基于观察记录时间
   */
  async getRecentPlayers(hours: number = 24, limit: number = 100): Promise<string[]> {
    // 从活跃会话反推玩家
    const sessions = await this.getActiveSessions(hours);
    const players = new Set<string>();
    
    for (const sessionId of sessions.slice(0, limit)) {
      const state = await this.getNarrativeState(sessionId);
      if (state) {
        players.add(state.playerId);
      }
    }
    
    return Array.from(players).slice(0, limit);
  }

  /**
   * 默认实现：获取会话统计
   */
  async getSessionStats(sessionId: string): Promise<{
    observationCount: number;
    pendingPuzzles: number;
    lastActivity: string | null;
  }> {
    const [observations, pendingCount] = await Promise.all([
      this.getPlayerObservations(sessionId, 1000),
      this.getPendingPuzzleCount(sessionId)
    ]);
    
    const lastObservation = observations.length > 0 ? observations[0] : null;
    return {
      observationCount: observations.length,
      pendingPuzzles: pendingCount,
      lastActivity: lastObservation && lastObservation.timestamp ? lastObservation.timestamp : null
    };
  }

  /**
   * 默认实现：结束会话
   * 简单更新 narrative state 标记为结束，子类可扩展
   */
  async endSession(sessionId: string): Promise<void> {
    const state = await this.getNarrativeState(sessionId);
    if (state) {
      await this.updateNarrativeState(sessionId, {
        ...state,
        generationStatus: 'idle',
        worldState: { ...state.worldState, endedAt: this.now() },
        updatedAt: this.now()
      });
    }
  }

  /**
   * 默认实现：重置统计
   */
  async resetStats(): Promise<void> {
    this.stats = {
      reads: 0,
      writes: 0,
      deletes: 0,
      errors: 0
    };
  }

  /**
   * 默认实现：导出会话数据
   */
  async exportSessionData(sessionId: string): Promise<{
    profile: PlayerProfile | null;
    narrative: NarrativeState | null;
    observations: DialogueObservation[];
    puzzles: BufferedPuzzle[];
  }> {
    const narrative = await this.getNarrativeState(sessionId);
    
    const [profile, observations] = await Promise.all([
      narrative ? this.getPlayerProfile(narrative.playerId) : Promise.resolve(null),
      this.getPlayerObservations(sessionId, 10000)
    ]);
    
    return {
      profile,
      narrative,
      observations,
      puzzles: [] // 子类需覆盖以获取实际关卡数据
    };
  }

  /**
   * 默认实现：导入会话数据
   */
  async importSessionData(
    sessionId: string,
    data: {
      profile?: PlayerProfile;
      narrative?: NarrativeState;
      observations?: DialogueObservation[];
      puzzles?: BufferedPuzzle[];
    }
  ): Promise<void> {
    if (data.profile) {
      await this.updatePlayerProfile(data.profile.playerId, data.profile);
    }
    
    if (data.narrative) {
      await this.updateNarrativeState(sessionId, data.narrative);
    }
    
    if (data.observations && data.observations.length > 0) {
      await this.submitObservationsBatch(data.observations.map(obs => ({
        sessionId: obs.sessionId,
        observationType: obs.observationType,
        content: obs.content,
        importance: obs.importance,
        ...(obs.playerId !== undefined ? { playerId: obs.playerId } : {}),
        ...(obs.rawQuote !== undefined ? { rawQuote: obs.rawQuote } : {}),
        ...(obs.levelId !== undefined ? { levelId: obs.levelId } : {}),
        ...(obs.sentiment !== undefined ? { sentiment: obs.sentiment } : {})
      })));
    }
    
    // puzzles 导入需要 storePuzzle 支持 ID 指定，子类应覆盖
    console.warn(`[${this.storageType}] Puzzle import not fully implemented in base class`);
  }

  // ==================== 工具方法 (子类可用) ====================
  
  /**
   * 生成当前 ISO 8601 时间戳
   * 统一使用此方法确保格式一致
   */
  protected now(): string {
    return new Date().toISOString();
  }

  /**
   * 安全 JSON 序列化
   * 处理：
   * - 循环引用 (替换为 [Circular])
   * - 非有限数值 (Infinity, NaN 转为字符串)
   * - BigInt (转为字符串)
   * - undefined (在数组中转为 null，在对象中忽略)
   * 
   * @param obj 要序列化的对象
   * @param space 缩进空格数，默认 undefined (紧凑)
   */
  protected safeJSONStringify(obj: unknown, space?: number): string {
    const seen = new WeakSet();
    
    return JSON.stringify(obj, (_key, value) => {
      // 处理循环引用
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      
      // 处理非有限数值
      if (typeof value === 'number') {
        if (!isFinite(value)) {
          return String(value);
        }
      }
      
      // 处理 BigInt
      if (typeof value === 'bigint') {
        return value.toString();
      }
      
      return value;
    }, space);
  }

  /**
   * 安全 JSON 解析
   * 处理可能的解析错误，返回 null 而非抛出
   * 
   * @param data JSON 字符串
   * @param defaultValue 解析失败时的默认值
   */
  protected safeJSONParse<T>(data: string, defaultValue: T | null = null): T | null {
    try {
      return JSON.parse(data) as T;
    } catch (error) {
      console.error(`[${this.storageType}] JSON parse error:`, error);
      return defaultValue;
    }
  }

  /**
   * 生成 UUID v4
   * 用于 ID 生成 (如关卡ID、观察记录ID等)
   */
  protected generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 计算运行时长 (秒)
   * 用于统计报告
   */
  protected getUptimeSeconds(): number {
    if (!this.initializedAt) return -1;
    return Math.floor((Date.now() - this.initializedAt.getTime()) / 1000);
  }

  /**
   * 验证配置项存在
   * 子类在 initialize 中调用，确保必要配置存在
   * 
   * @param key 配置键
   * @throws 配置缺失时抛出错误
   */
  protected requireConfig(key: string): unknown {
    if (!(key in this.config) || this.config[key] === undefined || this.config[key] === null) {
      throw new Error(`[${this.storageType}] Required config missing: ${key}`);
    }
    return this.config[key];
  }

  /**
   * 获取配置项 (带默认值)
   */
  protected getConfig<T>(key: string, defaultValue: T): T {
    return (this.config[key] as T) ?? defaultValue;
  }
}

// ==================== 错误类型 ====================

/**
 * 存储错误基类
 * 用于区分存储层错误和业务逻辑错误
 */
export class StorageError extends Error {
  constructor(
    message: string, 
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * 初始化错误
 */
export class StorageInitError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_INIT_ERROR', cause);
    this.name = 'StorageInitError';
  }
}

/**
 * 迁移错误
 */
export class StorageMigrationError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_MIGRATION_ERROR', cause);
    this.name = 'StorageMigrationError';
  }
}

/**
 * 连接错误
 */
export class StorageConnectionError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_CONNECTION_ERROR', cause);
    this.name = 'StorageConnectionError';
  }
}

/**
 * 序列化错误
 */
export class StorageSerializationError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_SERIALIZATION_ERROR', cause);
    this.name = 'StorageSerializationError';
  }
}