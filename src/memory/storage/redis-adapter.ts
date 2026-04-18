/**
 * @fileoverview Redis 存储适配器 (RedisStorageAdapter)
 * @description 基于 ioredis 的分布式存储实现，适用于：
 * - 多服务器部署共享数据
 * - 生产环境高可用存储
 * - 大数据量持久化
 * - 跨进程/跨机器状态同步
 * 
 * 特性：
 * - 连接池管理
 * - 自动重连机制
 * - 集群模式支持
 * - 数据序列化/反序列化
 * - 批量操作优化 (pipeline)
 * 
 * @module memory/storage/redis-adapter
 * @requires ioredis
 */

import {
  BaseStorageAdapter,
  StorageOptions,
  StorageItem,
  StorageQuery,
  StorageStats
} from './base-storage.js';
import type { Redis, Cluster } from 'ioredis';

/**
 * Redis 连接配置
 */
export interface RedisStorageOptions extends StorageOptions {
  /** Redis 连接URI (优先于其他配置) */
  uri?: string;
  
  /** 主机地址 */
  host?: string;
  
  /** 端口 */
  port?: number;
  
  /** 数据库索引 */
  db?: number;
  
  /** 密码 */
  password?: string;
  
  /** 键前缀 (用于命名空间隔离) */
  keyPrefix?: string;
  
  /** 集群节点配置 (启用集群模式) */
  cluster?: { host: string; port: number }[];
  
  /** 重连策略 */
  retryStrategy?: (times: number) => number | null;
  
  /** 连接超时(毫秒) */
  connectTimeout?: number;
  
  /** 是否启用离线队列(断线时缓存命令) */
  enableOfflineQueue?: boolean;
  
  /** 序列化函数 */
  serializer?: (value: unknown) => string;
  
  /** 反序列化函数 */
  deserializer?: (data: string) => unknown;
}

/**
 * Redis 存储适配器
 * 
 * @example
 * ```typescript
 * // 单机模式
 * const redis = new RedisStorageAdapter({
 *   host: 'localhost',
 *   port: 6379,
 *   db: 0,
 *   keyPrefix: 'game:'
 * });
 * 
 * // 集群模式
 * const clusterRedis = new RedisStorageAdapter({
 *   cluster: [
 *     { host: '10.0.0.1', port: 6379 },
 *     { host: '10.0.0.2', port: 6379 }
 *   ],
 *   keyPrefix: 'game:'
 * });
 * ```
 */
export class RedisStorageAdapter extends BaseStorageAdapter {
  readonly storageType = 'redis';
  
  private client: Redis | Cluster | null = null;
  private options: Required<RedisStorageOptions>;
  private _initialized = false;
  
  // 默认 JSON 序列化
  private serializer: (value: unknown) => string;
  private deserializer: (data: string) => unknown;

  /**
   * 创建 Redis 存储适配器
   */
  constructor(options: RedisStorageOptions = {}) {
    super(options as Record<string, unknown>);

    this.options = {
      host: options.host ?? 'localhost',
      port: options.port ?? 6379,
      db: options.db ?? 0,
      password: options.password ?? '',
      keyPrefix: options.keyPrefix ?? 'xzxllm:',
      cluster: options.cluster ?? [],
      connectTimeout: options.connectTimeout ?? 10000,
      enableOfflineQueue: options.enableOfflineQueue ?? true,
      serializer: options.serializer ?? JSON.stringify,
      deserializer: options.deserializer ?? JSON.parse,
      retryStrategy: options.retryStrategy ?? ((times) => Math.min(times * 50, 2000)),
      // 添加缺失的属性以满足 Required<RedisStorageOptions>
      uri: options.uri ?? '',
      ttl: options.ttl ?? 0,
      tags: options.tags ?? [],
      priority: options.priority ?? 0
    };

    this.serializer = this.options.serializer;
    this.deserializer = this.options.deserializer;
  }

  /**
   * 初始化 Redis 连接
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    try {
      const { Redis: RedisClient } = await import('ioredis');
      
      // 根据配置创建单机或集群连接
      if (this.options.cluster.length > 0) {
        this.client = new RedisClient.Cluster(this.options.cluster, {
          redisOptions: {
            password: this.options.password,
            db: this.options.db,
            connectTimeout: this.options.connectTimeout
          },
          slotsRefreshTimeout: 2000,
          slotsRefreshInterval: 5000
        });
      } else {
        this.client = new RedisClient({
          host: this.options.host,
          port: this.options.port,
          db: this.options.db,
          password: this.options.password || undefined,
          keyPrefix: this.options.keyPrefix,
          connectTimeout: this.options.connectTimeout,
          enableOfflineQueue: this.options.enableOfflineQueue,
          retryStrategy: this.options.retryStrategy,
          lazyConnect: true // 延迟连接，便于错误处理
        });
      }
      
      // 监听连接事件
      this.client.on('connect', () => {
        console.log('[RedisStorage] Connected to Redis');
      });
      
      this.client.on('error', (err) => {
        console.error('[RedisStorage] Redis error:', err.message);
      });
      
      // 建立连接
      await this.client.connect();
      this._initialized = true;
      this.initializedAt = new Date();

    } catch (error) {
      console.error('[RedisStorage] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 获取 Redis 客户端实例 (供高级操作使用)
   */
  getClient(): Redis | Cluster | null {
    return this.client;
  }

  /**
   * 存储键值对
   * Redis SET 支持 NX/XX 模式
   */
  async set<T>(key: string, value: T, options?: StorageOptions): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const fullKey = this.getKey(key);
      const serialized = this.serializer(value);
      
      // 如果有TTL，使用 SETEX/PSETEX
      if (options?.ttl && options.ttl > 0) {
        // Redis SETEX 接受秒，需要转换毫秒到秒
        const seconds = Math.ceil(options.ttl / 1000);
        await this.client!.setex(fullKey, seconds, serialized);
      } else {
        await this.client!.set(fullKey, serialized);
      }
      
      // 存储元数据 (更新时间等)
      const meta = {
        updatedAt: Date.now(),
        createdAt: Date.now()
      };
      
      // 尝试获取创建时间(如果键已存在)
      const existing = await this.client!.get(`${fullKey}:meta`);
      if (existing) {
        const oldMeta = this.deserializer(existing) as any;
        meta.createdAt = oldMeta.createdAt;
      }
      
      await this.client!.set(`${fullKey}:meta`, this.serializer(meta));
      
      return true;
    } catch (error) {
      console.error(`[RedisStorage] Set failed for key "${key}":`, error);
      return false;
    }
  }

  /**
   * 获取键值
   */
  async get<T>(key: string): Promise<T | undefined> {
    this.ensureInitialized();
    
    try {
      const fullKey = this.getKey(key);
      const data = await this.client!.get(fullKey);
      
      if (data === null) return undefined;
      
      return this.deserializer(data) as T;
    } catch (error) {
      console.error(`[RedisStorage] Get failed for key "${key}":`, error);
      return undefined;
    }
  }

  /**
   * 批量获取 (使用 pipeline 优化)
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    this.ensureInitialized();
    const results = new Map<string, T>();
    
    if (keys.length === 0) return results;
    
    try {
      // 使用 pipeline 减少网络往返
      const pipeline = this.client!.pipeline();
      const fullKeys = keys.map(k => this.getKey(k));
      
      for (const key of fullKeys) {
        pipeline.get(key);
      }
      
      const res = await pipeline.exec();
      
      res?.forEach((item, index) => {
        const [err, data] = item as [Error | null, string | null];
        if (!err && data !== null) {
          try {
            const value = this.deserializer(data) as T;
            results.set(keys[index]!, value);
          } catch (e) {
            console.warn(`[RedisStorage] Deserialization failed for key ${keys[index]!}`);
          }
        }
      });
      
    } catch (error) {
      console.error('[RedisStorage] GetMany failed:', error);
    }
    
    return results;
  }

  /**
   * 批量设置 (使用 pipeline)
   */
  async setMany<T>(
    entries: Array<{ key: string; value: T }>, 
    options?: StorageOptions
  ): Promise<void> {
    this.ensureInitialized();
    
    if (entries.length === 0) return;
    
    try {
      const pipeline = this.client!.pipeline();
      const now = Date.now();
      
      for (const { key, value } of entries) {
        const fullKey = this.getKey(key);
        const serialized = this.serializer(value);
        
        if (options?.ttl && options.ttl > 0) {
          const seconds = Math.ceil(options.ttl / 1000);
          pipeline.setex(fullKey, seconds, serialized);
        } else {
          pipeline.set(fullKey, serialized);
        }
        
        // 元数据
        pipeline.set(`${fullKey}:meta`, this.serializer({
          updatedAt: now,
          createdAt: now
        }));
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('[RedisStorage] SetMany failed:', error);
      throw error;
    }
  }

  /**
   * 删除键值对
   */
  async delete(key: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const fullKey = this.getKey(key);
      const result = await this.client!.del(fullKey, `${fullKey}:meta`);
      return result > 0;
    } catch (error) {
      console.error(`[RedisStorage] Delete failed for key "${key}":`, error);
      return false;
    }
  }

  /**
   * 查询存储项 (使用 SCAN 避免阻塞)
   * 注意：Redis 查询能力有限，复杂查询建议在内存中处理或使用 RediSearch
   */
  async query<T>(query: StorageQuery<T>): Promise<StorageItem<T>[]> {
    this.ensureInitialized();
    const results: StorageItem<T>[] = [];
    
    try {
      // 构建匹配模式
      const pattern = query.prefix 
        ? `${this.options.keyPrefix}${query.prefix}*` 
        : `${this.options.keyPrefix}*`;
      
      const keys: string[] = [];

      // 使用 SCAN 流式获取键 (避免 KEYS 命令阻塞)
      if (this.client!.constructor.name === 'Cluster') {
        // 集群模式：遍历所有节点
        const clusterClient = this.client as import('ioredis').Cluster;
        const nodes = clusterClient.nodes('master');
        for (const node of nodes) {
          const stream = (node as any).scanStream({ match: pattern, count: 100 });
          for await (const keyBatch of stream) {
            // 过滤掉元数据键
            const validKeys = (keyBatch as string[]).filter(k => !k.endsWith(':meta'));
            keys.push(...validKeys);

            // 限制查询数量，避免内存溢出
            if (query.limit && keys.length >= query.limit * 2) {
              break;
            }
          }
          if (query.limit && keys.length >= query.limit * 2) {
            break;
          }
        }
      } else {
        // 单机模式
        const stream = (this.client as import('ioredis').Redis).scanStream({ match: pattern, count: 100 });
        for await (const keyBatch of stream) {
          // 过滤掉元数据键
          const validKeys = (keyBatch as string[]).filter(k => !k.endsWith(':meta'));
          keys.push(...validKeys);

          // 限制查询数量，避免内存溢出
          if (query.limit && keys.length >= query.limit * 2) {
            break;
          }
        }
      }
      
      // 批量获取值
      if (keys.length > 0) {
        const values = await this.getMany<T>(keys.map(k => k.replace(this.options.keyPrefix, '')));

        // 将Map转换为数组进行迭代
        const entries = Array.from(values.entries());
        for (const [key, value] of entries) {
          // 值过滤
          if (query.filter && !query.filter(value)) continue;

          // 获取元数据
          const metaKey = `${this.getKey(key)}:meta`;
          const metaData = await this.client!.get(metaKey);
          const meta = metaData ? this.deserializer(metaData) as any : {};

          // 时间过滤
          if (query.since && meta.updatedAt < query.since) continue;
          if (query.until && meta.updatedAt > query.until) continue;

          results.push({
            key,
            value,
            createdAt: meta.createdAt || Date.now(),
            updatedAt: meta.updatedAt || Date.now()
          });

          if (query.limit && results.length >= query.limit) break;
        }
      }
      
      // 排序 (在内存中进行)
      if (query.orderBy) {
        results.sort((a, b) => {
          const aVal = (a as any)[query.orderBy!];
          const bVal = (b as any)[query.orderBy!];
          return query.order === 'desc' ? bVal - aVal : aVal - bVal;
        });
      }
      
    } catch (error) {
      console.error('[RedisStorage] Query failed:', error);
    }
    
    return results;
  }

  /**
   * 清空所有数据 (使用 FLUSHDB，谨慎使用)
   * 实际会删除当前数据库所有键
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    try {
      // 只删除带有前缀的键 (更安全)
      const pattern = `${this.options.keyPrefix}*`;

      if (this.client!.constructor.name === 'Cluster') {
        // 集群模式：遍历所有节点
        const clusterClient = this.client as import('ioredis').Cluster;
        const nodes = clusterClient.nodes('master');
        for (const node of nodes) {
          const stream = (node as any).scanStream({ match: pattern });
          for await (const keyBatch of stream) {
            if ((keyBatch as string[]).length > 0) {
              await node.del(...(keyBatch as string[]));
            }
          }
        }
      } else {
        // 单机模式
        const stream = (this.client as import('ioredis').Redis).scanStream({ match: pattern });
        for await (const keyBatch of stream) {
          if ((keyBatch as string[]).length > 0) {
            await this.client!.del(...(keyBatch as string[]));
          }
        }
      }
    } catch (error) {
      console.error('[RedisStorage] Clear failed:', error);
      throw error;
    }
  }

  /**
   * 获取存储统计
   * 使用 Redis INFO 命令获取服务器信息
   */
  async getStats(): Promise<StorageStats> {
    this.ensureInitialized();
    
    try {
      const info = await this.client!.info('memory');
      const usedMemory = info.match(/used_memory:(\d+)/)?.[1] || '0';
      
      // 统计键数量 (带前缀)
      const pattern = `${this.options.keyPrefix}*`;
      let count = 0;

      if (this.client!.constructor.name === 'Cluster') {
        // 集群模式：遍历所有节点
        const clusterClient = this.client as import('ioredis').Cluster;
        const nodes = clusterClient.nodes('master');
        for (const node of nodes) {
          const stream = (node as any).scanStream({ match: pattern });
          for await (const keyBatch of stream) {
            count += (keyBatch as string[]).filter(k => !k.endsWith(':meta')).length;
          }
        }
      } else {
        // 单机模式
        const stream = (this.client as import('ioredis').Redis).scanStream({ match: pattern });
        for await (const keyBatch of stream) {
          count += (keyBatch as string[]).filter(k => !k.endsWith(':meta')).length;
        }
      }
      
      return {
        totalPlayerProfiles: 0, // Redis中需要专门统计玩家档案数
        activeNarrativeSessions: 0, // 需要专门的统计逻辑
        pendingObservations: 0, // 需要专门的统计逻辑
        bufferedPuzzles: 0, // 需要专门的统计逻辑
        estimatedSizeMB: Math.round(parseInt(usedMemory) / 1024 / 1024 * 100) / 100,
        operations: this.stats,
        timestamp: new Date().toISOString(),
        storageType: this.storageType,
        uptime: this.getUptimeSeconds()
      };
    } catch (error) {
      console.error('[RedisStorage] GetStats failed:', error);
      return {
        totalPlayerProfiles: 0,
        activeNarrativeSessions: 0,
        pendingObservations: 0,
        bufferedPuzzles: 0,
        estimatedSizeMB: 0,
        operations: this.stats,
        timestamp: new Date().toISOString(),
        storageType: this.storageType,
        uptime: this.getUptimeSeconds()
      };
    }
  }

  /**
   * 检查键是否存在
   */
  async has(key: string): Promise<boolean> {
    this.ensureInitialized();
    const exists = await this.client!.exists(this.getKey(key));
    return exists === 1;
  }

  /**
   * 获取所有键 (谨慎使用，大数据集时性能差)
   */
  async keys(): Promise<string[]> {
    this.ensureInitialized();
    const pattern = `${this.options.keyPrefix}*`;
    const keys: string[] = [];

    if (this.client!.constructor.name === 'Cluster') {
      // 集群模式：遍历所有节点
      const clusterClient = this.client as import('ioredis').Cluster;
      const nodes = clusterClient.nodes('master');
      for (const node of nodes) {
        const stream = (node as any).scanStream({ match: pattern });
        for await (const keyBatch of stream) {
          const validKeys = (keyBatch as string[]).filter(k => !k.endsWith(':meta'));
          keys.push(...validKeys.map(k => k.replace(this.options.keyPrefix, '')));
        }
      }
    } else {
      // 单机模式
      const stream = (this.client as import('ioredis').Redis).scanStream({ match: pattern });
      for await (const keyBatch of stream) {
        const validKeys = (keyBatch as string[]).filter(k => !k.endsWith(':meta'));
        keys.push(...validKeys.map(k => k.replace(this.options.keyPrefix, '')));
      }
    }
    
    return keys;
  }

  /**
   * 导出所有数据
   */
  async export<T>(filter?: (key: string) => boolean): Promise<Record<string, T>> {
    const keys = await this.keys();
    const data: Record<string, T> = {};
    
    for (const key of keys) {
      if (filter && !filter(key)) continue;
      const value = await this.get<T>(key);
      if (value !== undefined) {
        data[key] = value;
      }
    }
    
    return data;
  }

  /**
   * 导入数据
   */
  async import<T>(
    data: Record<string, T>,
    options?: { ttl?: number; skipExisting?: boolean }
  ): Promise<void> {
    const entries = Object.entries(data).map(([key, value]) => ({ key, value }));
    const storageOptions: StorageOptions = {};
    if (options?.ttl !== undefined) {
      storageOptions.ttl = options.ttl;
    }
    await this.setMany(entries, storageOptions);
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this._initialized = false;
      console.log('[RedisStorage] Disconnected');
    }
  }

  /**
   * @deprecated 使用 close() 替代
   */
  async dispose(): Promise<void> {
    await this.close();
  }

  // ==================== 私有方法 ====================

  /**
   * 构建完整键名 (添加前缀)
   */
  private getKey(key: string): string {
    // 如果已经包含前缀，不再添加
    if (key.startsWith(this.options.keyPrefix)) {
      return key;
    }
    return `${this.options.keyPrefix}${key}`;
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this._initialized || !this.client) {
      throw new Error('[RedisStorage] Adapter not initialized. Call initialize() first.');
    }
  }

  // ==================== 玩家画像操作实现 ====================

  async getPlayerProfile(playerId: string): Promise<import('../../core/interfaces/base.types.js').PlayerProfile | null> {
    this.ensureInitialized();
    try {
      const key = `player:profile:${playerId}`;
      const data = await this.client!.get(key);
      if (!data) return null;
      return this.deserializer(data) as any;
    } catch (error) {
      console.error(`[RedisStorage] getPlayerProfile failed for player "${playerId}":`, error);
      return null;
    }
  }

  async updatePlayerProfile(playerId: string, updates: Partial<import('../../core/interfaces/base.types.js').PlayerProfile>): Promise<void> {
    this.ensureInitialized();
    try {
      const key = `player:profile:${playerId}`;
      const existing = await this.getPlayerProfile(playerId);
      const profile = existing ? { ...existing, ...updates } : {
        playerId,
        ...updates,
        createdAt: this.now(),
        lastUpdated: this.now()
      } as any;

      profile.lastUpdated = this.now();
      if (!existing) {
        profile.createdAt = this.now();
      }

      await this.client!.set(key, this.serializer(profile));
      this.stats.writes++;
    } catch (error) {
      console.error(`[RedisStorage] updatePlayerProfile failed for player "${playerId}":`, error);
      this.stats.errors++;
      throw error;
    }
  }

  // ==================== 叙事状态操作实现 ====================

  async getNarrativeState(sessionId: string): Promise<import('../../core/interfaces/base.types.js').NarrativeState | null> {
    this.ensureInitialized();
    try {
      const key = `narrative:state:${sessionId}`;
      const data = await this.client!.get(key);
      if (!data) return null;
      return this.deserializer(data) as any;
    } catch (error) {
      console.error(`[RedisStorage] getNarrativeState failed for session "${sessionId}":`, error);
      return null;
    }
  }

  async updateNarrativeState(sessionId: string, updates: Partial<import('../../core/interfaces/base.types.js').NarrativeState>): Promise<void> {
    this.ensureInitialized();
    try {
      const key = `narrative:state:${sessionId}`;
      const existing = await this.getNarrativeState(sessionId);
      const state = existing ? { ...existing, ...updates, updatedAt: this.now() } : {
        sessionId,
        ...updates,
        updatedAt: this.now()
      } as any;

      await this.client!.set(key, this.serializer(state));
      this.stats.writes++;
    } catch (error) {
      console.error(`[RedisStorage] updateNarrativeState failed for session "${sessionId}":`, error);
      this.stats.errors++;
      throw error;
    }
  }

  // ==================== 观察记录操作实现 ====================

  async submitObservation(obs: Omit<import('../../core/interfaces/base.types.js').DialogueObservation, 'id' | 'timestamp' | 'processed'> & { playerId?: string; levelId?: string }): Promise<void> {
    this.ensureInitialized();
    try {
      const observationId = this.generateUUID();
      const key = `observation:${observationId}`;
      const fullObservation = {
        ...obs,
        id: observationId,
        timestamp: this.now(),
        processed: false
      };

      // 存储观察记录
      await this.client!.set(key, this.serializer(fullObservation));

      // 添加到会话的观察列表
      const sessionKey = `session:observations:${obs.sessionId}`;
      await this.client!.lpush(sessionKey, observationId);

      // 添加到未处理队列
      await this.client!.lpush('observations:unprocessed', observationId);

      this.stats.writes++;
    } catch (error) {
      console.error('[RedisStorage] submitObservation failed:', error);
      this.stats.errors++;
      throw error;
    }
  }

  async getUnprocessedObservations(limit: number = 50): Promise<import('../../core/interfaces/base.types.js').DialogueObservation[]> {
    this.ensureInitialized();
    try {
      const observationIds = await this.client!.lrange('observations:unprocessed', 0, limit - 1);
      const observations: any[] = [];

      for (const id of observationIds) {
        const key = `observation:${id}`;
        const data = await this.client!.get(key);
        if (data) {
          observations.push(this.deserializer(data));
        }
      }

      return observations;
    } catch (error) {
      console.error('[RedisStorage] getUnprocessedObservations failed:', error);
      return [];
    }
  }

  async markObservationsProcessed(ids: (number | string)[]): Promise<void> {
    this.ensureInitialized();
    try {
      for (const id of ids) {
        const key = `observation:${id}`;
        const data = await this.client!.get(key);
        if (data) {
          const obs = this.deserializer(data) as any;
          obs.processed = true;
          await this.client!.set(key, this.serializer(obs));

          // 从未处理队列中移除
          await this.client!.lrem('observations:unprocessed', 0, id.toString());
        }
      }
      this.stats.writes++;
    } catch (error) {
      console.error('[RedisStorage] markObservationsProcessed failed:', error);
      this.stats.errors++;
      throw error;
    }
  }

  // ==================== 关卡缓冲池操作实现 ====================

  async storePuzzle(
    sessionId: string,
    puzzleData: import('../../core/interfaces/base.types.js').LevelStructure | object,
    difficulty: number,
    mood: string,
    options?: StorageOptions
  ): Promise<string> {
    this.ensureInitialized();
    try {
      const puzzleId = this.generateUUID();
      const key = `puzzle:${puzzleId}`;
      const puzzle = {
        id: puzzleId,
        sessionId,
        puzzleData,
        difficulty,
        mood,
        createdAt: this.now(),
        consumed: false,
        tags: options?.tags || []
      };

      // 存储关卡
      await this.client!.set(key, this.serializer(puzzle));

      // 添加到会话的未消费关卡列表
      const sessionPuzzlesKey = `session:puzzles:${sessionId}:unconsumed`;
      await this.client!.lpush(sessionPuzzlesKey, puzzleId);

      // 设置TTL
      if (options?.ttl && options.ttl > 0) {
        await this.client!.expire(key, Math.ceil(options.ttl / 1000));
        await this.client!.expire(sessionPuzzlesKey, Math.ceil(options.ttl / 1000));
      }

      this.stats.writes++;
      return puzzleId;
    } catch (error) {
      console.error('[RedisStorage] storePuzzle failed:', error);
      this.stats.errors++;
      throw error;
    }
  }

  async consumeNextPuzzle(
    sessionId: string,
    filter?: { tags?: string[]; maxDifficulty?: number }
  ): Promise<import('./base-storage.js').BufferedPuzzle | null> {
    this.ensureInitialized();
    try {
      const sessionPuzzlesKey = `session:puzzles:${sessionId}:unconsumed`;
      const puzzleIds = await this.client!.lrange(sessionPuzzlesKey, 0, -1);

      for (const puzzleId of puzzleIds) {
        const key = `puzzle:${puzzleId}`;
        const data = await this.client!.get(key);
        if (!data) continue;

        const puzzle = this.deserializer(data) as any;

        // 检查过滤器
        if (filter?.tags && filter.tags.length > 0) {
          const puzzleTags = puzzle.tags || [];
          if (!filter.tags.some(tag => puzzleTags.includes(tag))) continue;
        }

        if (filter?.maxDifficulty !== undefined && puzzle.difficulty > filter.maxDifficulty) {
          continue;
        }

        // 标记为已消费
        puzzle.consumed = true;
        puzzle.consumedAt = this.now();
        await this.client!.set(key, this.serializer(puzzle));

        // 从未消费列表中移除
        await this.client!.lrem(sessionPuzzlesKey, 0, puzzleId);

        this.stats.reads++;
        return puzzle;
      }

      return null;
    } catch (error) {
      console.error('[RedisStorage] consumeNextPuzzle failed:', error);
      this.stats.errors++;
      return null;
    }
  }

  async getPendingPuzzleCount(sessionId: string, filter?: { tags?: string[] }): Promise<number> {
    this.ensureInitialized();
    try {
      const sessionPuzzlesKey = `session:puzzles:${sessionId}:unconsumed`;
      const puzzleIds = await this.client!.lrange(sessionPuzzlesKey, 0, -1);

      if (!filter?.tags || filter.tags.length === 0) {
        return puzzleIds.length;
      }

      // 如果有标签过滤，需要检查每个关卡
      let count = 0;
      for (const puzzleId of puzzleIds) {
        const key = `puzzle:${puzzleId}`;
        const data = await this.client!.get(key);
        if (!data) continue;

        const puzzle = this.deserializer(data) as any;
        const puzzleTags = puzzle.tags || [];
        if (filter.tags.some(tag => puzzleTags.includes(tag))) {
          count++;
        }
      }

      return count;
    } catch (error) {
      console.error('[RedisStorage] getPendingPuzzleCount failed:', error);
      return 0;
    }
  }

  // ==================== 会话管理实现 ====================

  async getActiveSessions(_hours: number = 1): Promise<string[]> {
    this.ensureInitialized();
    try {
      // Redis实现：扫描最近有活动的会话键
      const pattern = `session:observations:*`;
      const sessions = new Set<string>();

      // 使用SCAN查找所有会话观察键（对Cluster使用scanStream，对单机Redis使用scanStream）
      if (this.client!.constructor.name === 'Cluster') {
        // 集群模式：需要遍历所有节点
        const clusterClient = this.client as import('ioredis').Cluster;
        const nodes = clusterClient.nodes('master');
        for (const node of nodes) {
          const stream = (node as any).scanStream({ match: pattern });
          for await (const keys of stream) {
            for (const key of (keys as string[])) {
              const sessionId = key.replace('session:observations:', '');
              // 检查最近活动（通过最近观察记录时间）
              const recentObservations = await node.lrange(key, 0, 0);
              if (recentObservations.length > 0) {
                sessions.add(sessionId);
              }
            }
          }
        }
      } else {
        // 单机模式
        const stream = (this.client as import('ioredis').Redis).scanStream({ match: pattern });
        for await (const keys of stream) {
          for (const key of (keys as string[])) {
            const sessionId = key.replace('session:observations:', '');
            // 检查最近活动（通过最近观察记录时间）
            const recentObservations = await this.client!.lrange(key, 0, 0);
            if (recentObservations.length > 0) {
              sessions.add(sessionId);
            }
          }
        }
      }

      return Array.from(sessions);
    } catch (error) {
      console.error('[RedisStorage] getActiveSessions failed:', error);
      return [];
    }
  }

  // ==================== 健康检查实现 ====================

  async healthCheck(): Promise<import('./base-storage.js').HealthStatus> {
    this.ensureInitialized();
    const startTime = Date.now();
    try {
      // 简单PING测试
      await this.client!.ping();
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        checkedAt: this.now(),
        details: {
          connected: true
        }
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: -1,
        checkedAt: this.now(),
        details: {
          connected: false,
          lastError: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // ==================== 其他需要实现的方法 ====================

  async getPlayerObservations(
    playerId: string,
    limit: number = 50,
    types?: string[]
  ): Promise<import('../../core/interfaces/base.types.js').DialogueObservation[]> {
    // Redis实现：扫描所有观察记录并过滤
    this.ensureInitialized();
    try {
      const pattern = `observation:*`;
      const observations: any[] = [];

      // 使用SCAN查找所有观察记录
      if (this.client!.constructor.name === 'Cluster') {
        const clusterClient = this.client as import('ioredis').Cluster;
        const nodes = clusterClient.nodes('master');
        for (const node of nodes) {
          const stream = (node as any).scanStream({ match: pattern });
          for await (const keys of stream) {
            for (const key of (keys as string[])) {
              const data = await node.get(key);
              if (data) {
                observations.push(this.deserializer(data));
              }
            }
          }
        }
      } else {
        const stream = (this.client as import('ioredis').Redis).scanStream({ match: pattern });
        for await (const keys of stream) {
          for (const key of (keys as string[])) {
            const data = await this.client!.get(key);
            if (data) {
              observations.push(this.deserializer(data));
            }
          }
        }
      }

      // 过滤玩家ID
      let filtered = observations.filter((obs: any) => obs.playerId === playerId);

      if (types && types.length > 0) {
        filtered = filtered.filter((obs: any) => types.includes(obs.observationType));
      }

      // 按时间戳排序（最新的在前）
      filtered.sort((a: any, b: any) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      return filtered.slice(0, limit);
    } catch (error) {
      console.error('[RedisStorage] getPlayerObservations failed:', error);
      return [];
    }
  }

  async getObservationsPaginated(
    sessionId: string,
    cursor: string | null = null,
    pageSize: number = 100
  ): Promise<import('./base-storage.js').PaginatedResult<import('../../core/interfaces/base.types.js').DialogueObservation>> {
    // 基础实现：获取会话观察记录后分页
    const sessionKey = `session:observations:${sessionId}`;
    const observationIds = await this.client!.lrange(sessionKey, 0, -1);

    const observations: any[] = [];
    for (const id of observationIds) {
      const key = `observation:${id}`;
      const data = await this.client!.get(key);
      if (data) {
        observations.push(this.deserializer(data));
      }
    }

    // 按时间倒序排序
    observations.sort((a: any, b: any) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });

    let startIndex = 0;
    if (cursor) {
      const cursorIndex = observations.findIndex(obs => obs.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const data = observations.slice(startIndex, startIndex + pageSize);
    const hasMore = observations.length > startIndex + pageSize;
    const lastItem = data.length > 0 ? data[data.length - 1] : null;
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    return {
      data,
      hasMore,
      nextCursor,
      totalEstimate: observations.length
    };
  }
}