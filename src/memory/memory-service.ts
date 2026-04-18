/**
 * @fileoverview 记忆服务层 (MemoryService)
 * @description 提供统一的高层API，协调存储适配器、数据模型和分析器。
 * 这是外部系统（如Engine、API层）与记忆系统交互的主要入口。
 * 
 * 核心职责：
 * - 玩家画像管理 (CRUD + 智能更新)
 * - 叙事状态管理
 * - 行为观察收集与处理
 * - 缓存策略管理
 * - 数据持久化协调
 * 
 * @module memory/memory-service
 */

import { StorageAdapter } from './storage/base-storage.js';
import { 
  PlayerProfile, 
  PlayerProfileFactory 
} from './models/player-profile.js';
import { 
  NarrativeState, 
  NarrativeStateFactory, 
  AIMood 
} from './models/narrative-state.js';
import { 
  Observation, 
  ObservationType, 
  ObservationFactory 
} from './models/observation.js';


/**
 * 记忆服务配置
 */
export interface MemoryServiceConfig {
  /** 主存储适配器 (必须持久化) */
  primaryStorage: StorageAdapter;
  
  /** 缓存存储适配器 (可选，用于高性能读取) */
  cacheStorage?: StorageAdapter;
  
  /** 是否启用写入缓存 */
  enableWriteCache?: boolean;
  
  /** 观察处理批量大小 */
  observationBatchSize?: number;
  
  /** 观察处理间隔(毫秒) */
  observationFlushInterval?: number;
}

/**
 * 记忆服务主类
 * 单例模式，由 DI 容器管理
 */
export class MemoryService {
  private primaryStorage: StorageAdapter;
  private cacheStorage: StorageAdapter | undefined;
  private config: Omit<Required<MemoryServiceConfig>, 'cacheStorage'> & { cacheStorage?: StorageAdapter };
  
  
  // 观察收集缓冲
  private observationBuffer: Map<string, Observation[]> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;

  /**
   * 创建记忆服务实例
   */
  constructor(config: MemoryServiceConfig) {
    this.primaryStorage = config.primaryStorage;
    this.cacheStorage = config.cacheStorage as StorageAdapter | undefined;
    const configObj: any = {
      primaryStorage: config.primaryStorage,
      enableWriteCache: config.enableWriteCache ?? true,
      observationBatchSize: config.observationBatchSize ?? 10,
      observationFlushInterval: config.observationFlushInterval ?? 5000
    };
    if (config.cacheStorage !== undefined) {
      configObj.cacheStorage = config.cacheStorage;
    }
    this.config = configObj as Omit<Required<MemoryServiceConfig>, 'cacheStorage'> & { cacheStorage?: StorageAdapter };
    
  
    this.startFlushTimer();
  }

  /**
   * 初始化服务
   * 确保存储适配器已就绪
   */
  async initialize(): Promise<void> {
    await this.primaryStorage.initialize();
    if (this.cacheStorage) {
      await this.cacheStorage.initialize();
    }
    console.log('[MemoryService] Initialized');
  }

  // ==================== 玩家画像管理 ====================

  /**
   * 获取玩家画像
   * 先查缓存，再查主存储
   */
  async getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
    // 1. 尝试缓存
    if (this.cacheStorage) {
      const cached = await this.cacheStorage.get<PlayerProfile>(`profile:${playerId}`);
      if (cached) return cached;
    }
    
    // 2. 查询主存储
    const profile = await this.primaryStorage.get<PlayerProfile>(`profile:${playerId}`);
    
    // 3. 回填缓存
    if (profile && this.cacheStorage) {
      await this.cacheStorage.set(`profile:${playerId}`, profile, { ttl: 300000 }); // 5分钟TTL
    }
    
    return profile || null;
  }

  /**
   * 创建新玩家
   */
  async createPlayer(
    playerId: string, 
    displayName?: string
  ): Promise<PlayerProfile> {
    const profile = PlayerProfileFactory.create(displayName);
    profile.id = playerId; // 使用外部ID
    
    await this.savePlayerProfile(profile);
    return profile;
  }

  /**
   * 保存玩家画像
   * 双写策略：先主存，后缓存
   */
  async savePlayerProfile(profile: PlayerProfile): Promise<void> {
    profile.lastActiveAt = Date.now();
    
    // 主存储 (持久化)
    await this.primaryStorage.set(`profile:${profile.id}`, profile);
    
    // 缓存 (如果启用)
    if (this.cacheStorage && this.config.enableWriteCache) {
      await this.cacheStorage.set(`profile:${profile.id}`, profile, { ttl: 300000 });
    }
  }

  /**
   * 更新玩家技能评级
   * 基于关卡表现
   */
  async updatePlayerSkill(
    playerId: string,
    levelDifficulty: number,
    success: boolean,
    performanceScore: number,
    skillUpdates?: Partial<PlayerProfile['skills']>
  ): Promise<void> {
    const profile = await this.getPlayerProfile(playerId);
    if (!profile) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    // 更新ELO-like评级
    PlayerProfileFactory.updateSkillRating(
      profile, 
      levelDifficulty, 
      success, 
      performanceScore
    );
    
    // 更新具体技能维度
    if (skillUpdates) {
      PlayerProfileFactory.updateSkills(profile, skillUpdates);
    }
    
    // 记录关卡历史
    if (success) {
      PlayerProfileFactory.recordLevelAttempt(
        profile,
        'unknown_level', // 应由调用者提供具体ID
        true,
        performanceScore * 300, // 估算时间
        0
      );
    }
    
    await this.savePlayerProfile(profile);
  }

  /**
   * 更新玩家情绪
   */
  async updatePlayerEmotion(
    playerId: string,
    emotion: 'frustrationLevel' | 'engagementLevel' | 'confusionLevel' | 'satisfactionLevel',
    value: number,
    trigger: string
  ): Promise<void> {
    const profile = await this.getPlayerProfile(playerId);
    if (!profile) return;
    
    PlayerProfileFactory.updateEmotion(profile, emotion, value, trigger);
    await this.savePlayerProfile(profile);
  }

  // ==================== 叙事状态管理 ====================

  /**
   * 获取或创建叙事状态
   */
  async getOrCreateNarrative(
    playerId: string,
    theme: string = 'default'
  ): Promise<NarrativeState> {
    const key = `narrative:${playerId}`;
    
    // 尝试获取现有状态
    const existing = await this.primaryStorage.get<NarrativeState>(key);
    if (existing) {
      // 转换Map类型 (JSON反序列化后Map变成普通对象)
      if (!(existing.nodes instanceof Map)) {
        existing.nodes = new Map(Object.entries(existing.nodes));
      }
      return existing;
    }
    
    // 创建新的
    const state = NarrativeStateFactory.create(playerId, theme);
    await this.saveNarrativeState(state);
    return state;
  }

  /**
   * 保存叙事状态
   */
  async saveNarrativeState(state: NarrativeState): Promise<void> {
    // Map转普通对象以便JSON序列化
    const serializable = {
      ...state,
      nodes: Object.fromEntries(state.nodes)
    };
    
    await this.primaryStorage.set(`narrative:${state.playerId}`, serializable);
  }

  /**
   * 推进叙事节点
   */
  async advanceNarrative(
    playerId: string,
    choiceIndex: number
  ): Promise<{ success: boolean; node?: NarrativeState['nodes'] extends Map<infer _K, infer V> ? V : never; state?: NarrativeState }> {
    const state = await this.getOrCreateNarrative(playerId);
    const nextNode = NarrativeStateFactory.navigateToNode(state, choiceIndex);
    
    if (!nextNode) {
      return { success: false };
    }
    
    await this.saveNarrativeState(state);
    return { success: true, node: nextNode, state };
  }

  /**
   * 更新叙事情绪
   */
  async updateNarrativeMood(playerId: string, mood: AIMood): Promise<void> {
    const state = await this.getOrCreateNarrative(playerId);
    NarrativeStateFactory.updateMood(state, mood);
    await this.saveNarrativeState(state);
  }

  // ==================== 行为观察管理 ====================

  /**
   * 记录行为观察
   * 缓冲到批量处理器
   */
  async recordObservation(
    playerId: string,
    type: ObservationType,
    locationId: string,
    details: Record<string, unknown> = {},
    puzzleId?: string
  ): Promise<void> {
    const obs = ObservationFactory.create(
      playerId, type, locationId, details, puzzleId
    );
    
    // 添加到玩家特定的缓冲
    if (!this.observationBuffer.has(playerId)) {
      this.observationBuffer.set(playerId, []);
    }
    
    const buffer = this.observationBuffer.get(playerId)!;
    buffer.push(obs);
    
    // 检查是否达到批量处理阈值
    if (buffer.length >= this.config.observationBatchSize) {
      await this.flushObservations(playerId);
    }
  }

  /**
   * 立即处理某个玩家的所有待处理观察
   */
  async flushObservations(playerId: string): Promise<void> {
    const buffer = this.observationBuffer.get(playerId);
    if (!buffer || buffer.length === 0) return;
    
    // 清空缓冲
    this.observationBuffer.set(playerId, []);
    
    // 批量处理
    const batch = ObservationFactory.processBatch(buffer);
    
    // 保存到存储
    await this.primaryStorage.setMany(
      batch.observations.map(obs => ({
        key: `obs:${obs.id}`,
        value: obs
      }))
    );
    
    // 应用分析结果到玩家画像
    const profile = await this.getPlayerProfile(playerId);
    if (profile && batch.recommendedAction.difficultyDelta !== 0) {
      // 间接调整难度偏好
      profile.preferences.difficultyBias = Math.max(
        -0.5,
        Math.min(
          0.5,
          profile.preferences.difficultyBias + batch.recommendedAction.difficultyDelta
        )
      );
      
      // 更新情绪
      if (batch.recommendedAction.mood === 'concerned') {
        PlayerProfileFactory.updateEmotion(
          profile,
          'frustrationLevel',
          0.6,
          batch.observations[0]?.type || 'batch_analysis'
        );
      }
      
      await this.savePlayerProfile(profile);
    }
    
    // 触发事件或回调 (可由外部订阅)
    console.log(`[MemoryService] Processed ${buffer.length} observations for ${playerId}`);
  }

  /**
   * 获取玩家最近的行为历史
   */
  async getRecentObservations(
    playerId: string,
    limit: number = 50
  ): Promise<Observation[]> {
    const results = await this.primaryStorage.query<Observation>({
      prefix: `obs:`,
      filter: (obs) => obs.playerId === playerId,
      orderBy: 'createdAt',
      order: 'desc',
      limit
    });
    
    return results.map(r => r.value);
  }

  // ==================== 分析与查询 ====================

  /**
   * 获取推荐难度
   * 综合玩家画像和当前叙事状态
   */
  async getRecommendedDifficulty(playerId: string): Promise<number> {
    const profile = await this.getPlayerProfile(playerId);
    if (!profile) return 0.5;
    
    return PlayerProfileFactory.calculateRecommendedDifficulty(profile);
  }

  /**
   * 生成玩家摘要 (用于LLM提示词)
   */
  async generatePlayerContext(playerId: string): Promise<{
    profileSummary: string;
    narrativeContext: string;
    recentObservations: Observation[];
    currentMood: AIMood;
  }> {
    const [profile, narrative, observations] = await Promise.all([
      this.getPlayerProfile(playerId),
      this.getOrCreateNarrative(playerId),
      this.getRecentObservations(playerId, 10)
    ]);
    
    if (!profile) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    return {
      profileSummary: PlayerProfileFactory.generateSummary(profile),
      narrativeContext: NarrativeStateFactory.getPathDescription(narrative),
      recentObservations: observations,
      currentMood: narrative.context.currentMood
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    primary: boolean;
    cache: boolean;
    stats: Record<string, unknown>;
  }> {
    const primaryStats = await this.primaryStorage.getStats();
    const cacheStats = this.cacheStorage 
      ? await this.cacheStorage.getStats()
      : null;
    
    return {
      primary: primaryStats.timestamp !== undefined,
      cache: cacheStats !== null ? cacheStats.timestamp !== undefined : false,
      stats: {
        primary: primaryStats,
        cache: cacheStats
      }
    };
  }

  /**
   * 优雅关闭
   * 刷新所有缓冲，关闭存储
   */
  async dispose(): Promise<void> {
    // 刷新所有观察
    for (const playerId of this.observationBuffer.keys()) {
      await this.flushObservations(playerId);
    }
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    await this.primaryStorage.dispose();
    if (this.cacheStorage) {
      await this.cacheStorage.dispose();
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 启动定时刷新
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      for (const playerId of this.observationBuffer.keys()) {
        this.flushObservations(playerId).catch(err => {
          console.error(`[MemoryService] Failed to flush ${playerId}:`, err);
        });
      }
    }, this.config.observationFlushInterval);
  }
}