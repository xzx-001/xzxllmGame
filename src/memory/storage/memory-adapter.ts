/**
 * @fileoverview 高性能内存存储适配器 (MemoryStorageAdapter)
 * @description 基于 Map 的高性能内存存储实现，支持：
 * - TTL (Time To Live) 自动过期
 - LRU (Least Recently Used) 缓存淘汰策略
 * - 持久化导出/导入 (JSON/二进制)
 * - 内存上限保护
 * - 事件订阅 (插入、更新、删除、过期)
 * - 线程安全操作 (单线程模型下的安全设计)
 * 
 * 适用场景：
 * - 开发环境快速迭代
 * - 生产环境高并发缓存层
 * - 单元测试 mock 对象
 * - 游戏服务器实时数据缓存
 * 
 * @module memory/storage/memory-adapter
 * @author xzxllmGame Team
 */

import {
  StorageOptions,
  StorageItem,
  StorageQuery,
  StorageStats,
  BaseStorageAdapter,
  BufferedPuzzle,
  HealthStatus
} from './base-storage.js';
import {
  PlayerProfile,
  NarrativeState,
  DialogueObservation,
  LevelStructure,
  AIMood,
  RelationshipStage
} from '../../core/interfaces/base.types.js';
import { TypedEventBus } from '../../core/event-bus.js';

/**
 * 内存存储配置选项
 * 提供更精细的内存控制策略
 */
export interface MemoryStorageOptions extends StorageOptions {
  /** 最大存储条目数 (LRU触发阈值)，默认 10000 */
  maxSize?: number;
  
  /** 全局默认TTL(毫秒)，默认 0 表示永不过期 */
  defaultTTL?: number;
  
  /** 检查过期项的间隔(毫秒)，默认 60000 (1分钟) */
  cleanupInterval?: number;
  
  /** 是否启用LRU淘汰，默认 true */
  enableLRU?: boolean;
  
  /** 内存使用上限(MB)，超过时触发紧急清理，默认 512 */
  memoryLimitMB?: number;
  
  /** 是否开启写入即持久化(同步导出)，默认 false */
  autoPersist?: boolean;
  
  /** 持久化文件路径(autoPersist为true时有效) */
  persistPath?: string;
}

/**
 * 带元数据的内存存储项
 * 内部使用，包含管理所需的额外信息
 */
interface MemoryStorageItem<T> extends StorageItem<T> {
  /** 最后访问时间戳 (用于LRU) */
  lastAccessed: number;
  
  /** 访问次数统计 (用于LFU扩展) */
  accessCount: number;
  
  /** 插入时的内存大小估算(字节) */
  sizeEstimate: number;
  
  /** 过期时间戳 (0 表示永不过期) */
  expiresAt: number;
}

/**
 * 存储变更事件类型
 */
export type StorageEventType = 'insert' | 'update' | 'delete' | 'expire' | 'evict';

/**
 * 存储变更事件数据
 */
export interface StorageEvent<T = unknown> {
  type: StorageEventType;
  key: string;
  oldValue?: T;
  newValue?: T;
  timestamp: number;
  reason?: 'ttl' | 'lru' | 'manual' | 'clear';
}

/**
 * 高性能内存存储适配器
 * 
 * @example
 * ```typescript
 * // 基础用法 - 开发环境
 * const memory = new MemoryStorageAdapter();
 * await memory.initialize();
 * await memory.set('player:123', { name: 'Alice', score: 100 });
 * 
 * // 生产环境配置 - 带TTL和LRU
 * const cache = new MemoryStorageAdapter({
 *   maxSize: 50000,
 *   defaultTTL: 300000, // 5分钟
 *   enableLRU: true,
 *   memoryLimitMB: 1024,
 *   autoPersist: true,
 *   persistPath: './cache/memory-backup.json'
 * });
 * 
 * // 事件监听
 * cache.on('expire', (event) => {
 *   console.log(`Key ${event.key} expired`);
 * });
 * ```
 */
export class MemoryStorageAdapter extends BaseStorageAdapter {
  /** 存储类型标识 */
  readonly storageType = 'memory';
  
  /** 是否已初始化 */
  private _initialized = false;
  
  /** 核心存储 Map */
  private store: Map<string, MemoryStorageItem<unknown>>;
  
  /** 配置选项 */
  private options: Required<MemoryStorageOptions>;
  
  /** 内部事件总线 - 用于存储内部事件 */
  private eventBus: TypedEventBus;
  
  /** 清理定时器引用 */
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  /** 当前内存使用量估算(字节) */
  private currentMemoryBytes = 0;
  
  /** 内存特定统计信息 */
  private memoryStats = {
    hits: 0,      // 缓存命中
    misses: 0,    // 缓存未命中
    evictions: 0, // 淘汰次数
    expirations: 0, // 过期次数
    sets: 0,      // 写入次数
    gets: 0,      // 读取次数
    deletes: 0    // 删除次数
  };

  /**
   * 创建内存存储适配器实例
   * @param options 内存存储配置选项
   */
  constructor(options: MemoryStorageOptions = {}) {
    // 调用父类构造函数，传递配置
    super(options as Record<string, unknown>);

    // 设置默认配置
    this.options = {
      maxSize: options.maxSize ?? 10000,
      defaultTTL: options.defaultTTL ?? 0,
      cleanupInterval: options.cleanupInterval ?? 60000,
      enableLRU: options.enableLRU ?? true,
      memoryLimitMB: options.memoryLimitMB ?? 512,
      autoPersist: options.autoPersist ?? false,
      persistPath: options.persistPath ?? './memory-backup.json',
      // StorageOptions 属性
      ttl: options.ttl ?? 0,
      tags: options.tags ?? [],
      priority: options.priority ?? 0
    };

    // 初始化存储和事件系统
    this.store = new Map();
    this.eventBus = new TypedEventBus();
    
    // 如果启用自动持久化，监听变更事件
    if (this.options.autoPersist) {
      this.eventBus.on<StorageEvent>('storage', (event: StorageEvent) => {
        if (['insert', 'update', 'delete'].includes(event.type)) {
          try {
            this.persistSync();
          } catch (err) {
            console.error('[MemoryStorage] Auto-persist failed:', err);
          }
        }
      });
    }
  }

  /**
   * 初始化存储适配器
   * 启动过期检查定时器，恢复持久化数据(如果存在)
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      // 启动定期清理任务
      this.startCleanupTask();
      
      // 尝试恢复持久化数据
      if (this.options.autoPersist) {
        await this.restore();
      }
      
      this._initialized = true;
      console.log(`[MemoryStorage] Initialized (maxSize: ${this.options.maxSize}, TTL: ${this.options.defaultTTL}ms)`);
    } catch (error) {
      console.error('[MemoryStorage] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 检查适配器是否已初始化
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 存储键值对
   * 支持可选的TTL覆盖和条件写入
   * 
   * @param key 存储键 (建议使用命名空间如 "player:123:profile")
   * @param value 存储值 (任意可序列化对象)
   * @param options 存储选项 (TTL等)
   * @returns 操作是否成功
   */
  async set<T>(
    key: string, 
    value: T, 
    options?: StorageOptions
  ): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const now = Date.now();
      const ttl = options?.ttl ?? this.options.defaultTTL;
      
      // 估算内存占用 (粗略估计)
      const sizeEstimate = this.estimateSize(value);
      
      // 检查是否已存在(用于事件通知)
      const existing = this.store.get(key);
      
      // 如果是更新操作，减去旧值的大小
      if (existing) {
        this.currentMemoryBytes -= existing.sizeEstimate;
      }
      
      // 检查内存限制，需要时执行LRU淘汰
      while (
        this.options.enableLRU && 
        this.store.size >= this.options.maxSize && 
        !this.store.has(key)
      ) {
        this.evictLRU();
      }
      
      // 检查内存上限
      const limitBytes = this.options.memoryLimitMB * 1024 * 1024;
      if (this.currentMemoryBytes + sizeEstimate > limitBytes) {
        console.warn(`[MemoryStorage] Memory limit approaching, evicting...`);
        this.evictLRU();
      }
      
      // 创建存储项
      const item: MemoryStorageItem<T> = {
        key,
        value,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastAccessed: now,
        accessCount: existing ? existing.accessCount + 1 : 0,
        sizeEstimate,
        expiresAt: ttl > 0 ? now + ttl : 0
      };
      
      // 存入 Map
      this.store.set(key, item as MemoryStorageItem<unknown>);
      this.currentMemoryBytes += sizeEstimate;
      this.memoryStats.sets++;
      
      // 触发事件
      this.eventBus.emit('storage', {
        type: existing ? 'update' : 'insert',
        key,
        oldValue: existing?.value as T,
        newValue: value,
        timestamp: now,
        reason: 'manual'
      });
      
      return true;
    } catch (error) {
      console.error(`[MemoryStorage] Set failed for key "${key}":`, error);
      return false;
    }
  }

  /**
   * 获取键值
   * 自动更新LRU访问时间和访问计数
   * 
   * @param key 存储键
   * @returns 存储值，不存在或已过期则返回 undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    this.ensureInitialized();
    this.memoryStats.gets++;
    
    const item = this.store.get(key) as MemoryStorageItem<T> | undefined;
    
    // 检查是否存在
    if (!item) {
      this.memoryStats.misses++;
      return undefined;
    }
    
    // 检查是否过期
    if (this.isExpired(item)) {
      this.memoryStats.misses++;
      this.deleteInternal(key, 'ttl');
      return undefined;
    }
    
    // 更新访问元数据 (LRU)
    item.lastAccessed = Date.now();
    item.accessCount++;
    
    this.memoryStats.hits++;
    return item.value;
  }

  /**
   * 批量获取
   * 优化多键读取性能
   * 
   * @param keys 键数组
   * @returns 键值对映射
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    this.ensureInitialized();
    const results = new Map<string, T>();
    
    // 并行获取所有键
    await Promise.all(
      keys.map(async (key) => {
        const value = await this.get<T>(key);
        if (value !== undefined) {
          results.set(key, value);
        }
      })
    );
    
    return results;
  }

  /**
   * 批量设置
   * 原子性批量写入(尽可能)
   * 
   * @param entries 键值对数组
   * @param options 存储选项
   */
  async setMany<T>(
    entries: Array<{ key: string; value: T }>, 
    options?: StorageOptions
  ): Promise<void> {
    this.ensureInitialized();
    
    // 顺序写入，保持事件触发顺序
    for (const { key, value } of entries) {
      await this.set(key, value, options);
    }
  }

  /**
   * 删除键值对
   * 
   * @param key 存储键
   * @returns 是否成功删除
   */
  async delete(key: string): Promise<boolean> {
    this.ensureInitialized();
    this.memoryStats.deletes++;
    return this.deleteInternal(key, 'manual');
  }

  /**
   * 查询存储项
   * 支持前缀匹配、值过滤、时间范围
   * 注意：全表扫描操作，大数据集时慎用
   * 
   * @param query 查询条件
   * @returns 匹配的存储项列表
   */
  async query<T>(query: StorageQuery<T>): Promise<StorageItem<T>[]> {
    this.ensureInitialized();
    const results: StorageItem<T>[] = [];
    
    for (const [key, item] of Array.from(this.store.entries())) {
      // 检查过期
      if (this.isExpired(item)) {
        this.deleteInternal(key, 'ttl');
        continue;
      }
      
      // 前缀匹配
      if (query.prefix && !key.startsWith(query.prefix)) {
        continue;
      }
      
      // 值过滤 (使用自定义过滤函数)
      if (query.filter && !query.filter(item.value as T)) {
        continue;
      }
      
      // 时间范围过滤
      if (query.since && item.updatedAt < query.since) {
        continue;
      }
      
      if (query.until && item.updatedAt > query.until) {
        continue;
      }
      
      // 返回标准格式 (不包含内部元数据)
      results.push({
        key: item.key,
        value: item.value as T,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      });
    }
    
    // 排序
    if (query.orderBy) {
      results.sort((a, b) => {
        const aVal = (a as any)[query.orderBy!];
        const bVal = (b as any)[query.orderBy!];
        return query.order === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    // 限制数量
    if (query.limit && results.length > query.limit) {
      return results.slice(0, query.limit);
    }
    
    return results;
  }

  /**
   * 清空所有存储
   * 触发批量删除事件
   */
  async clear(): Promise<void> {
    this.ensureInitialized();
    
    const keys = Array.from(this.store.keys());
    
    // 逐个删除以触发事件
    for (const key of keys) {
      this.deleteInternal(key, 'clear');
    }
    
    this.store.clear();
    this.currentMemoryBytes = 0;
    
    console.log(`[MemoryStorage] Cleared ${keys.length} items`);
  }

  /**
   * 获取存储统计信息
   * 包括命中率、内存使用等关键指标
   */
  async getStats(): Promise<StorageStats> {
    const timestamp = new Date().toISOString();

    // 获取运行时长
    let uptime = -1;
    if (this.initializedAt) {
      uptime = Math.floor((Date.now() - this.initializedAt.getTime()) / 1000);
    }

    return {
      totalPlayerProfiles: 0, // 内存存储不支持玩家画像业务数据
      activeNarrativeSessions: 0,
      pendingObservations: 0,
      bufferedPuzzles: 0,
      estimatedSizeMB: Math.round(this.currentMemoryBytes / 1024 / 1024 * 100) / 100,
      operations: {
        reads: this.memoryStats.gets,
        writes: this.memoryStats.sets,
        deletes: this.memoryStats.deletes,
        errors: 0 // 内存存储目前不跟踪错误
      },
      timestamp,
      storageType: this.storageType,
      uptime
    };
  }

  /**
   * 检查键是否存在(不触发LRU更新)
   * 
   * @param key 存储键
   */
  async has(key: string): Promise<boolean> {
    this.ensureInitialized();
    const item = this.store.get(key);
    
    if (!item) return false;
    if (this.isExpired(item)) {
      this.deleteInternal(key, 'ttl');
      return false;
    }
    
    return true;
  }

  /**
   * 获取所有键 (谨慎使用)
   * 主要用于调试和管理
   */
  async keys(): Promise<string[]> {
    this.ensureInitialized();
    return Array.from(this.store.keys()).filter(key => {
      const item = this.store.get(key);
      if (item && this.isExpired(item)) {
        this.deleteInternal(key, 'ttl');
        return false;
      }
      return true;
    });
  }

  /**
   * 导出数据为JSON对象
   * 用于持久化或备份
   * 
   * @param filter 可选的键过滤函数
   */
  async export<T>(filter?: (key: string) => boolean): Promise<Record<string, T>> {
    this.ensureInitialized();
    const data: Record<string, T> = {};
    
    for (const [key, item] of Array.from(this.store.entries())) {
      if (this.isExpired(item)) continue;
      if (filter && !filter(key)) continue;

      data[key] = item.value as T;
    }
    
    return data;
  }

  /**
   * 导入JSON数据
   * 会覆盖现有键
   * 
   * @param data 键值对对象
   * @param options 导入选项
   */
  async import<T>(
    data: Record<string, T>, 
    options?: { ttl?: number; skipExisting?: boolean }
  ): Promise<void> {
    this.ensureInitialized();
    
    for (const [key, value] of Object.entries(data)) {
      if (options?.skipExisting && this.store.has(key)) {
        continue;
      }
      
      const storageOptions: StorageOptions = {};
      if (options?.ttl !== undefined) {
        storageOptions.ttl = options.ttl;
      }
      await this.set(key, value, storageOptions);
    }
  }

  /**
   * 持久化到文件 (异步)
   * 使用 JSONL 格式提高大文件读写性能
   */
  async persist(): Promise<void> {
    if (!this.options.persistPath) {
      throw new Error('[MemoryStorage] Persist path not configured');
    }
    
    const fs = await import('fs/promises');
    const data = await this.export();
    await fs.writeFile(
      this.options.persistPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  /**
   * 同步持久化 (仅建议在退出时调用)
   */
  persistSync(): void {
    if (!this.options.persistPath) return;
    
    try {
      const fs = require('fs');
      const data: Record<string, unknown> = {};
      
      for (const [key, item] of this.store.entries()) {
        if (!this.isExpired(item)) {
          data[key] = item.value;
        }
      }
      
      fs.writeFileSync(
        this.options.persistPath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[MemoryStorage] Sync persist failed:', error);
    }
  }

  /**
   * 从文件恢复数据
   */
  async restore(): Promise<void> {
    if (!this.options.persistPath) return;
    
    try {
      const fs = await import('fs/promises');
      const exists = await fs.access(this.options.persistPath)
        .then(() => true)
        .catch(() => false);
      
      if (!exists) return;
      
      const content = await fs.readFile(this.options.persistPath, 'utf-8');
      const data = JSON.parse(content);
      
      await this.import(data);
      console.log(`[MemoryStorage] Restored ${Object.keys(data).length} items`);
    } catch (error) {
      console.error('[MemoryStorage] Restore failed:', error);
    }
  }

  /**
   * 订阅存储事件
   * 可用于缓存同步、审计日志等
   * 
   * @param event 事件类型或 'all'
   * @param handler 事件处理器
   */
  on<T = unknown>(
    event: StorageEventType | 'all', 
    handler: (event: StorageEvent<T>) => void
  ): void {
    this.eventBus.on('storage', (evt: StorageEvent) => {
      if (event === 'all' || evt.type === event) {
        handler(evt as StorageEvent<T>);
      }
    });
  }

  /**
   * 取消事件订阅
   */
  off<T = unknown>(
    _event: StorageEventType | 'all',
    _handler: (event: StorageEvent<T>) => void
  ): void {
    // 简化实现：目前不支持精确移除处理器
    // 如果需要精确移除，需要修改 TypedEventBus 或存储取消订阅函数
    console.warn('[MemoryStorage] off method not fully implemented');
  }

  /**
   * 优雅关闭
   * 清理定时器，持久化数据
   */
  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.options.autoPersist) {
      await this.persist();
    }

    this.store.clear();
    this._initialized = false;

    console.log('[MemoryStorage] Closed');
  }

  /**
   * 手动触发过期清理
   * 正常情况下由定时器自动执行
   */
  async cleanup(): Promise<number> {
    this.ensureInitialized();
    let cleaned = 0;
    const now = Date.now();
    
    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt > 0 && item.expiresAt <= now) {
        this.deleteInternal(key, 'ttl');
        cleaned++;
      }
    }
    
    return cleaned;
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('[MemoryStorage] Adapter not initialized. Call initialize() first.');
    }
  }

  /**
   * 检查项是否过期
   */
  private isExpired(item: MemoryStorageItem<unknown>): boolean {
    if (item.expiresAt === 0) return false;
    return Date.now() >= item.expiresAt;
  }

  /**
   * 内部删除方法
   * 处理事件触发和内存统计
   */
  private deleteInternal(key: string, reason: NonNullable<StorageEvent['reason']>): boolean {
    const item = this.store.get(key);
    if (!item) return false;
    
    this.store.delete(key);
    this.currentMemoryBytes -= item.sizeEstimate;
    
    // 更新统计
    if (reason === 'ttl') {
      this.memoryStats.expirations++;
    } else if (reason === 'lru') {
      this.memoryStats.evictions++;
    }

    // 触发事件
    this.eventBus.emit('storage', {
      type: reason === 'ttl' ? 'expire' : 'delete',
      key,
      oldValue: item.value,
      timestamp: Date.now(),
      reason
    });
    
    return true;
  }

  /**
   * LRU淘汰策略
   * 移除最久未访问的项
   */
  private evictLRU(): void {
    if (this.store.size === 0) return;
    
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, item] of this.store.entries()) {
      // 优先淘汰已过期的
      if (this.isExpired(item)) {
        this.deleteInternal(key, 'ttl');
        return;
      }
      
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.deleteInternal(oldestKey, 'lru');
      console.debug(`[MemoryStorage] LRU evicted key: ${oldestKey}`);
    }
  }

  /**
   * 启动定期清理任务
   */
  private startCleanupTask(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup().then(count => {
        if (count > 0) {
          console.debug(`[MemoryStorage] Cleaned up ${count} expired items`);
        }
      });
    }, this.options.cleanupInterval);
    
    // 确保定时器不阻止进程退出 (除非autoPersist)
    if (!this.options.autoPersist) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 估算对象内存大小 (粗略)
   * 用于内存限制检查
   */
  private estimateSize(obj: unknown): number {
    if (obj === null || obj === undefined) return 8;
    
    const type = typeof obj;
    if (type === 'boolean') return 4;
    if (type === 'number') return 8;
    if (type === 'string') return (obj as string).length * 2 + 24; // UTF-16 + 开销
    
    if (Array.isArray(obj)) {
      return obj.reduce((sum, item) => sum + this.estimateSize(item), 24);
    }
    
    if (type === 'object') {
      let size = 24; // 对象基础开销
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          size += key.length * 2 + 8; // 键
          size += this.estimateSize((obj as any)[key]); // 值
        }
      }
      return size;
    }
    
    return 8; // 默认
  }

  // ==================== 抽象方法实现 (简化业务支持) ====================

  async getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
    // 尝试从内存存储中获取
    const data = await this.get<PlayerProfile>(`player:${playerId}:profile`);
    return data || null;
  }

  async updatePlayerProfile(playerId: string, updates: Partial<PlayerProfile>): Promise<void> {
    const existing = await this.getPlayerProfile(playerId);
    const now = this.now();

    const profile: PlayerProfile = {
      playerId,
      skillRating: updates.skillRating ?? existing?.skillRating ?? 0.5,
      preferredTypes: updates.preferredTypes ?? existing?.preferredTypes ?? [],
      frustrationLevel: updates.frustrationLevel ?? existing?.frustrationLevel ?? 0,
      winStreak: updates.winStreak ?? existing?.winStreak ?? 0,
      loseStreak: updates.loseStreak ?? existing?.loseStreak ?? 0,
      relationshipStage: updates.relationshipStage ?? existing?.relationshipStage ?? RelationshipStage.RIVALS,
      lastUpdated: now,
      createdAt: existing?.createdAt ?? now
    };

    await this.set(`player:${playerId}:profile`, profile);
  }

  async getNarrativeState(sessionId: string): Promise<NarrativeState | null> {
    const data = await this.get<NarrativeState>(`narrative:${sessionId}`);
    return data || null;
  }

  async updateNarrativeState(sessionId: string, updates: Partial<NarrativeState>): Promise<void> {
    const existing = await this.getNarrativeState(sessionId);
    const now = this.now();

    const state: NarrativeState = {
      sessionId,
      playerId: updates.playerId ?? existing?.playerId ?? '',
      currentMood: updates.currentMood ?? existing?.currentMood ?? AIMood.PLAYFUL,
      generationStatus: updates.generationStatus ?? existing?.generationStatus ?? 'idle',
      aiImpression: updates.aiImpression ?? existing?.aiImpression ?? '',
      ongoingPlot: updates.ongoingPlot ?? existing?.ongoingPlot ?? 'beginning',
      worldState: updates.worldState ?? existing?.worldState ?? {},
      sessionHistory: updates.sessionHistory ?? existing?.sessionHistory ?? [],
      updatedAt: now
    };

    // 处理可选属性
    const lastPuzzleDifficulty = updates.lastPuzzleDifficulty ?? existing?.lastPuzzleDifficulty;
    const generatedIntro = updates.generatedIntro ?? existing?.generatedIntro;

    // 显式赋值可选属性
    if (lastPuzzleDifficulty !== undefined) {
      (state as any).lastPuzzleDifficulty = lastPuzzleDifficulty;
    }
    if (generatedIntro !== undefined) {
      (state as any).generatedIntro = generatedIntro;
    }

    await this.set(`narrative:${sessionId}`, state);
  }

  async submitObservation(obs: Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>): Promise<void> {
    // 为内存存储生成一个数字ID
    const id = Math.floor(Math.random() * 1000000);
    const observation: DialogueObservation = {
      ...obs,
      id,
      timestamp: this.now(),
      processed: false
    };

    await this.set(`observation:${id}`, observation);
  }

  async getUnprocessedObservations(limit: number = 50): Promise<DialogueObservation[]> {
    // 内存存储中查询未处理的观察记录效率较低
    const results: DialogueObservation[] = [];

    for (const [key, item] of this.store.entries()) {
      if (!key.startsWith('observation:')) continue;
      if (this.isExpired(item)) continue;

      const obs = item.value as DialogueObservation;
      if (!obs.processed) {
        results.push(obs);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  async markObservationsProcessed(ids: (number | string)[]): Promise<void> {
    for (const id of ids) {
      const key = `observation:${id}`;
      const obs = await this.get<DialogueObservation>(key);
      if (obs) {
        obs.processed = true;
        await this.set(key, obs);
      }
    }
  }

  async storePuzzle(
    sessionId: string,
    puzzleData: LevelStructure | object,
    difficulty: number,
    mood: string,
    options?: StorageOptions
  ): Promise<string> {
    const puzzleId = this.generateUUID();
    const puzzle: BufferedPuzzle = {
      id: puzzleId,
      puzzleData,
      difficulty,
      mood,
      createdAt: this.now(),
      consumed: false,
      sessionId
    };

    // 可选属性
    if (options?.tags) {
      (puzzle as any).tags = options.tags;
    }

    await this.set(`puzzle:${puzzleId}`, puzzle, options);
    return puzzleId;
  }

  async consumeNextPuzzle(
    sessionId: string,
    filter?: { tags?: string[]; maxDifficulty?: number }
  ): Promise<BufferedPuzzle | null> {
    // 简单的FIFO实现，不考虑优先级
    let nextPuzzle: BufferedPuzzle | null = null;
    let earliestTime = Infinity;

    for (const [key, item] of this.store.entries()) {
      if (!key.startsWith('puzzle:')) continue;
      if (this.isExpired(item)) continue;

      const puzzle = item.value as BufferedPuzzle;
      if (puzzle.consumed || puzzle.sessionId !== sessionId) continue;

      // 应用过滤条件
      if (filter?.maxDifficulty && puzzle.difficulty > filter.maxDifficulty) continue;
      if (filter?.tags && filter.tags.length > 0) {
        if (!puzzle.tags || !puzzle.tags.some(tag => filter.tags!.includes(tag))) continue;
      }

      if (!puzzle.createdAt) continue;
      const createTime = new Date(puzzle.createdAt).getTime();
      if (createTime < earliestTime) {
        earliestTime = createTime;
        nextPuzzle = puzzle;
      }
    }

    if (nextPuzzle) {
      nextPuzzle.consumed = true;
      nextPuzzle.consumedAt = this.now();
      await this.set(`puzzle:${nextPuzzle.id}`, nextPuzzle);
    }

    return nextPuzzle;
  }

  async getPendingPuzzleCount(sessionId: string): Promise<number> {
    let count = 0;

    for (const [key, item] of this.store.entries()) {
      if (!key.startsWith('puzzle:')) continue;
      if (this.isExpired(item)) continue;

      const puzzle = item.value as BufferedPuzzle;
      if (!puzzle.consumed && puzzle.sessionId === sessionId) {
        count++;
      }
    }

    return count;
  }

  async getActiveSessions(hours: number = 1): Promise<string[]> {
    const sessions = new Set<string>();
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);

    // 检查最近的活动：观察记录、叙事状态更新、关卡消费
    for (const [key, item] of this.store.entries()) {
      if (this.isExpired(item)) continue;

      if (key.startsWith('observation:')) {
        const obs = item.value as DialogueObservation;
        if (!obs.timestamp) continue;
        const time = new Date(obs.timestamp).getTime();
        if (time > cutoffTime) {
          sessions.add(obs.sessionId);
        }
      } else if (key.startsWith('narrative:')) {
        const state = item.value as NarrativeState;
        const time = new Date(state.updatedAt).getTime();
        if (time > cutoffTime) {
          sessions.add(state.sessionId);
        }
      } else if (key.startsWith('puzzle:')) {
        const puzzle = item.value as BufferedPuzzle;
        if (!puzzle.createdAt) continue;
        const time = new Date(puzzle.createdAt).getTime();
        if (time > cutoffTime) {
          sessions.add(puzzle.sessionId);
        }
      }
    }

    return Array.from(sessions);
  }

  async healthCheck(): Promise<HealthStatus> {
    const now = new Date().toISOString();

    try {
      // 简单检查：尝试写入和读取一个测试键
      const testKey = '__health_check__';
      const testValue = { timestamp: now };

      const startTime = Date.now();
      await this.set(testKey, testValue);
      const retrieved = await this.get<typeof testValue>(testKey);
      const latencyMs = Date.now() - startTime;

      // 清理测试键
      await this.delete(testKey);

      const healthy = retrieved !== undefined && retrieved.timestamp === now;

      const details: HealthStatus['details'] = {
        connected: healthy
      };

      if (!healthy) {
        (details as any).lastError = 'Health check failed';
      }

      return {
        healthy,
        latencyMs: healthy ? latencyMs : -1,
        checkedAt: now,
        details
      };
    } catch (error) {
      const details: HealthStatus['details'] = {
        connected: false
      };

      if (error) {
        (details as any).lastError = error instanceof Error ? error.message : 'Unknown error';
      }

      return {
        healthy: false,
        latencyMs: -1,
        checkedAt: now,
        details
      };
    }
  }
}

/**
 * 创建内存存储实例的工厂函数
 * 便于快速创建不同配置的实例
 */
export function createMemoryStorage(options?: MemoryStorageOptions): MemoryStorageAdapter {
  return new MemoryStorageAdapter(options);
}