// src/core/engine.ts
/**
 * @fileoverview xzxllmGame 核心引擎
 * @description 框架的主入口，协调 LLM、生成器、存储和记忆系统
 * @implements 外观模式（Facade Pattern）+ 模板方法模式
 * 
 * 职责：
 * 1. 生命周期管理：初始化、运行、销毁
 * 2. 请求路由：分发生成请求到对应组件
 * 3. 状态协调：维护生成状态，处理并发
 * 4. 错误处理：降级策略、重试逻辑
 * 
 * @example
 * const engine = new XZXLLMGameEngine(config);
 * await engine.initialize();
 * const level = await engine.generateLevel({ playerId: 'p1', sessionId: 's1' });
 * await engine.dispose();
 */

import { EventEmitter } from 'events';
import { Container, container as globalContainer } from './container.js';
import { TypedEventBus } from './event-bus.js';
import { ConfigManager } from './config/config-manager.js';
import { DEFAULT_CONFIG } from './config/default.config.js';

// 类型导入
import {
  LevelStructure,
  PlayerProfile,
  NarrativeState,
  AIMood,
  RelationshipStage,
  GenerationResult,
  DialogueObservation
} from './interfaces/base.types.js';
import { 
  LevelGenerationParams, 
  GenerationProgress,
  SDKConfig 
} from './interfaces/api.types.js';

// 服务接口（实际实现由其他模块提供）
import { ILLMProvider, LLMConfig } from '../llm/types.js';
import { StorageAdapter } from '../memory/storage/base-storage.js';
import { IMiniGameGenerator, MiniGameContext } from '../generation/minigame/types.js';

/**
 * 引擎配置接口
 */
export interface GameEngineConfig {
  /** LLM 提供商配置 */
  llm: {
    provider: 'local' | 'ollama' | 'openai' | 'anthropic' | 'custom';
    model: string;
    apiKey?: string;
    baseUrl?: string;
    localOptions?: {
      modelPath: string;
      gpuLayers?: number;
      contextSize?: number;
      threads?: number;
    };
    temperature?: number;
    maxTokens?: number;
  };
  /** 存储配置 */
  storage?: {
    type: 'sqlite' | 'memory' | 'redis';
    connectionString?: string;
  };
  /** 生成配置 */
  generation?: {
    pregenerateCount?: number;
    enableNarrative?: boolean;
    defaultDifficulty?: number;
    timeout?: number;
  };
  /** 调试配置 */
  debug?: boolean;
}

/**
 * xzxllmGame 核心引擎类
 * 
 * 这是框架的主要 API 类，游戏开发者通过此类与框架交互。
 * 内部通过 Container 管理依赖，通过 EventBus 进行组件通信。
 */
export class XZXLLMGameEngine extends EventEmitter {
  /** 依赖注入容器（可使用自定义容器进行隔离） */
  private container: Container;
  
  /** 配置管理器 */
  private configManager!: ConfigManager;
  
  /** 是否已初始化 */
  private initialized = false;
  
  /** 是否正在关闭 */
  private disposing = false;
  
  /** 生成任务队列（防止并发冲突） */
  private generationQueue = new Map<string, Promise<any>>();
  
  /** 预生成计时器 */
  private pregenerationTimers = new Map<string, NodeJS.Timeout>();

  /**
   * 创建引擎实例
   * @param config 引擎配置（可选，默认使用配置文件的配置）
   * @param customContainer 自定义 DI 容器（可选，用于隔离多个引擎实例）
   */
  constructor(
    private config: GameEngineConfig,
    customContainer?: Container
  ) {
    super();
    this.container = customContainer || globalContainer.createChild();
  }

  /**
   * 初始化引擎
   * 按顺序初始化：配置 -> 存储 -> LLM -> 生成器工厂
   * 
   * @throws 初始化失败时抛出错误
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[Engine] Already initialized');
      return;
    }

    try {
      this.emit('status', { status: 'initializing', stage: 'config' });
      
      // 1. 初始化配置管理器
      this.configManager = new ConfigManager();
      await this.configManager.load(); // 尝试加载配置文件
      
      // 合并传入的配置（最高优先级）
      if (this.config) {
        this.configManager.merge({ 
          llm: this.config.llm,
          storage: this.config.storage,
          generation: this.config.generation 
        });
      }
      
      // 验证配置
      this.configManager.validate();

      this.emit('status', { status: 'initializing', stage: 'storage' });

      // 2. 注册存储服务（单例）
      this.container.register('storage', () => this.createStorage(), { singleton: true });

      this.emit('status', { status: 'initializing', stage: 'llm' });

      // 3. 注册 LLM 服务（单例，延迟初始化）
      this.container.register('llm', () => this.createLLMProvider(), { singleton: true });

      // 4. 注册配置服务
      this.container.register('config', () => this.configManager, { singleton: true });

      // 5. 注册事件总线（单例，全局共享）
      this.container.register('eventBus', () => new TypedEventBus(), { singleton: true });

      // 6. 预初始化关键服务（可选）
      if (this.config.storage?.type !== 'memory') {
        const storage = this.container.get<StorageAdapter>('storage');
        await storage.initialize();
      }

      this.initialized = true;
      this.emit('initialized');
      this.emit('status', { status: 'ready' });
      
      console.log('[Engine] xzxllmGame initialized successfully');
    } catch (error: any) {
      this.emit('error', error);
      this.emit('status', { status: 'error', error });
      throw new Error(`Engine initialization failed: ${error}`);
    }
  }

  /**
   * 生成游戏关卡（核心 API）
   * 
   * 流程：
   * 1. 获取/创建玩家画像
   * 2. 计算目标难度（基于历史表现）
   * 3. 生成基础地图
   * 4. 并行生成小游戏
   * 5. 生成道具和叙事
   * 6. 验证和组装
   * 7. 触发预生成（异步）
   * 
   * @param params 生成参数
   * @returns 生成的关卡数据
   * 
   * @example
   * const level = await engine.generateLevel({
   *   playerId: 'player_001',
   *   sessionId: 'session_001',
   *   difficulty: 0.7,
   *   theme: 'cyber'
   * });
   */
  async generateLevel(params: LevelGenerationParams): Promise<LevelStructure> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    const { playerId, sessionId } = params;

    try {
      // 检查是否已有进行中的生成（防止重复请求）
      if (this.generationQueue.has(sessionId)) {
        console.log(`[Engine] Generation already in progress for ${sessionId}, waiting...`);
        return this.generationQueue.get(sessionId) as Promise<LevelStructure>;
      }

      // 创建生成 Promise
      const generationPromise = this.doGenerateLevel(params);
      this.generationQueue.set(sessionId, generationPromise);

      // 清理队列（无论成功与否）
      generationPromise.finally(() => {
        this.generationQueue.delete(sessionId);
      });

      return await generationPromise;
    } catch (error: any) {
      console.error(`[Engine] Generation failed for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * 获取下一个预生成的关卡（立即返回）
   * 如果缓冲池中没有，返回 null（应回退到实时生成）
   * 
   * @param sessionId 会话 ID
   * @returns 关卡数据或 null
   */
  async getNextLevel(sessionId: string): Promise<LevelStructure | null> {
    this.ensureInitialized();
    
    const storage = this.container.get<StorageAdapter>('storage');
    const puzzle = await storage.consumeNextPuzzle(sessionId);
    
    if (puzzle) {
      this.emit('level:consumed', { sessionId, levelId: (puzzle as any).metadata?.id });
      return puzzle as unknown as LevelStructure;
    }
    
    return null;
  }

  /**
   * 提交玩家反馈（用于动态难度调整）
   * 
   * @param sessionId 会话 ID
   * @param feedback 反馈数据
   */
  async submitFeedback(
    sessionId: string,
    feedback: {
      type: 'sentiment' | 'strategy' | 'frustration' | 'completion';
      content: string;
      rawQuote?: string;
      importance?: number;
      levelId?: string;
    }
  ): Promise<void> {
    this.ensureInitialized();
    
    const storage = this.container.get<StorageAdapter>('storage');
    
    // 存储观察记录
    await storage.submitObservation({
      sessionId,
      observationType: feedback.type,
      content: feedback.content,
      rawQuote: feedback.rawQuote,
      importance: feedback.importance || 5,
      processed: false
    });

    // 触发异步分析（不阻塞）
    this.analyzeFeedbackAsync(sessionId).catch((err: any) => {
      console.error('[Engine] Feedback analysis failed:', err);
    });

    this.emit('feedback:received', { sessionId, type: feedback.type });
  }

  /**
   * 获取玩家统计信息
   * @param playerId 玩家 ID
   */
  async getPlayerStats(playerId: string): Promise<PlayerProfile | null> {
    this.ensureInitialized();
    const storage = this.container.get<StorageAdapter>('storage');
    return await storage.getPlayerProfile(playerId);
  }

  /**
   * 健康检查
   * @returns 各组件状态
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, boolean>;
  }> {
    const checks: Record<string, boolean> = {};
    
    try {
      if (this.container.has('storage')) {
        const storage = this.container.get<StorageAdapter>('storage');
        checks.storage = true; // 简化检查
      }
      
      if (this.container.has('llm')) {
        const llm = this.container.get<ILLMProvider>('llm');
        checks.llm = llm.isAvailable;
      }
      
      const allHealthy = Object.values(checks).every((v: boolean) => v);
      return {
        status: allHealthy ? 'healthy' : 'degraded',
        components: checks
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        components: { ...checks, error: false }
      };
    }
  }

  /**
   * 释放引擎资源
   * 清理队列、关闭连接、释放内存
   */
  async dispose(): Promise<void> {
    if (this.disposing) return;
    this.disposing = true;

    this.emit('status', { status: 'disposing' });

    // 1. 清理预生成计时器
    for (const timer of this.pregenerationTimers.values()) {
      clearTimeout(timer);
    }
    this.pregenerationTimers.clear();

    // 2. 等待进行中的生成完成（或超时）
    const pendingGenerations = Array.from(this.generationQueue.values());
    if (pendingGenerations.length > 0) {
      console.log(`[Engine] Waiting for ${pendingGenerations.length} pending generations...`);
      await Promise.race([
        Promise.all(pendingGenerations),
        new Promise(resolve => setTimeout(resolve, 5000)) // 最多等待 5 秒
      ]);
    }

    // 3. 释放容器中的服务
    await this.container.dispose();

    this.initialized = false;
    this.emit('disposed');
    console.log('[Engine] Resources disposed');
  }

  // ============ 私有方法 ============

  /**
   * 实际生成关卡的内部实现
   */
  private async doGenerateLevel(params: LevelGenerationParams): Promise<LevelStructure> {
    const startTime = Date.now();
    const storage = this.container.get<StorageAdapter>('storage');
    const llm = this.container.get<ILLMProvider>('llm');
    const eventBus = this.container.get<TypedEventBus>('eventBus');

    const { playerId, sessionId } = params;
    const difficulty = params.difficulty ?? this.configManager.get('generation.defaultDifficulty', 0.5);

    // 1. 获取或创建玩家档案
    let profile = await storage.getPlayerProfile(playerId);
    if (!profile) {
      profile = await this.createDefaultProfile(playerId);
    }

    // 2. 获取叙事状态
    let narrativeState = await storage.getNarrativeState(sessionId);
    if (!narrativeState) {
      narrativeState = await this.createDefaultNarrativeState(sessionId, playerId);
    }

    // 3. 发布开始事件
    this.emit('generation:started', { sessionId, difficulty });
    eventBus.emit('generation:started', { sessionId });

    // 4. 计算地图尺寸
    const mapSize = this.calculateMapSize(difficulty);
    const baseMap = {
      size: mapSize,
      theme: (params.theme || 'dungeon') as any,
      playerStart: { x: 1, y: 1 },
      exitPosition: { x: mapSize[0] - 2, y: mapSize[1] - 2 },
      safeZones: [{ x: 1, y: 1 }, { x: mapSize[0] - 2, y: mapSize[1] - 2 }],
      ambientElements: []
    };

    // 5. 生成小游戏（这里简化处理，实际应调用 MiniGameGeneratorFactory）
    const miniGames: any[] = []; // 实际应调用具体生成器
    const miniGameCount = difficulty > 0.7 ? 3 : difficulty > 0.4 ? 2 : 1;

    for (let i = 0; i < miniGameCount; i++) {
      // 发布进度事件
      const progress: GenerationProgress = {
        sessionId,
        stage: 'generating_minigame',
        currentStep: i + 1,
        totalSteps: miniGameCount,
        percent: Math.floor((i / miniGameCount) * 100),
        message: `Generating mini-game ${i + 1}/${miniGameCount}`,
        timestamp: new Date().toISOString()
      };
      this.emit('generation:progress', progress);

      // TODO: 实际生成逻辑（需要接入 MiniGameGeneratorFactory）
      miniGames.push({
        id: `mg_${i}`,
        type: 'pushbox',
        bounds: { x: 3 + i * 5, y: 3, w: 5, h: 5 },
        config: {},
        difficulty: difficulty
      });
    }

    // 6. 组装关卡
    const levelId = `lvl_${sessionId}_${Date.now()}`;
    const level: LevelStructure = {
      metadata: {
        id: levelId,
        version: '1.0.0',
        totalDifficulty: difficulty,
        intendedMood: narrativeState.currentMood as AIMood || AIMood.PLAYFUL,
        estimatedTime: this.estimateTime(miniGames.length, difficulty),
        tags: miniGames.map((g: any) => g.type),
        generatedAt: new Date().toISOString()
      },
      baseMap,
      miniGames,
      props: [],
      narrativeBridge: `Welcome to level ${levelId}`, // 实际应由 NarrativeGenerator 生成
      dialogues: [],
      debugInfo: this.config.debug ? {
        generationTime: Date.now() - startTime
      } : undefined
    };

    // 7. 存储到缓冲池（用于预生成功能）
    await storage.storePuzzle(sessionId, level, difficulty, level.metadata.intendedMood);

    // 8. 发布完成事件
    this.emit('level:generated', { sessionId, levelId: level.metadata.id, level });
    eventBus.emit('level:generated', level);

    // 9. 触发预生成（异步，不阻塞）
    this.schedulePregeneration(sessionId, params);

    return level;
  }

  /**
   * 创建默认玩家档案
   */
  private async createDefaultProfile(playerId: string): Promise<PlayerProfile> {
    const storage = this.container.get<StorageAdapter>('storage');
    
    const profile: PlayerProfile = {
      playerId,
      skillRating: DEFAULT_CONFIG.player.skillRating,
      preferredTypes: [],
      frustrationLevel: DEFAULT_CONFIG.player.frustrationLevel,
      winStreak: 0,
      loseStreak: 0,
      relationshipStage: DEFAULT_CONFIG.player.relationshipStage,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await storage.updatePlayerProfile(playerId, profile);
    return profile;
  }

  /**
   * 创建默认叙事状态
   */
  private async createDefaultNarrativeState(
    sessionId: string, 
    playerId: string
  ): Promise<NarrativeState> {
    const storage = this.container.get<StorageAdapter>('storage');
    
    const state: NarrativeState = {
      sessionId,
      playerId,
      currentMood: DEFAULT_CONFIG.player.currentMood,
      generationStatus: 'idle',
      aiImpression: 'New player, initial encounter',
      ongoingPlot: 'beginning',
      worldState: {},
      updatedAt: new Date().toISOString()
    };

    await storage.updateNarrativeState(sessionId, state);
    return state;
  }

  /**
   * 异步分析反馈（更新玩家画像）
   */
  private async analyzeFeedbackAsync(sessionId: string): Promise<void> {
    const storage = this.container.get<StorageAdapter>('storage');
    
    // 获取未处理的观察
    const observations = await storage.getUnprocessedObservations(50);
    const sessionObs = observations.filter((o: DialogueObservation) => o.sessionId === sessionId);
    
    if (sessionObs.length === 0) return;

    // 简化分析：计算平均挫败感
    let frustrationDelta = 0;
    for (const obs of sessionObs) {
      if (obs.observationType === 'frustration') frustrationDelta += 0.1;
      if (obs.observationType === 'completion') frustrationDelta -= 0.05;
    }

    // 更新玩家画像
    const narrativeState = await storage.getNarrativeState(sessionId);
    if (narrativeState) {
      const newFrustration = Math.max(0, Math.min(1, 
        (narrativeState as any).frustrationLevel + frustrationDelta
      ));
      await storage.updateNarrativeState(sessionId, { 
        frustrationLevel: newFrustration 
      });
    }

    // 标记为已处理
    const ids = sessionObs.map((o: DialogueObservation) => o.id).filter((id: number | undefined): id is number => id !== undefined);
    await storage.markObservationsProcessed(ids);
  }

  /**
   * 创建存储适配器实例
   */
  private createStorage(): StorageAdapter {
    const storageType = this.configManager.get('storage.type', 'sqlite') as string;
    
    // 动态导入避免循环依赖
    const { SQLiteStorageAdapter } = require('../memory/storage/sqlite-adapter.js');
    
    switch (storageType) {
      case 'sqlite':
        return new SQLiteStorageAdapter({
          dbPath: this.configManager.get('storage.connectionString', './data/game.db')
        });
      case 'memory':
        const { MemoryStorageAdapter } = require('../memory/storage/memory-adapter.js');
        return new MemoryStorageAdapter();
      default:
        throw new Error(`Unsupported storage type: ${storageType}`);
    }
  }

  /**
   * 创建 LLM 提供商实例
   */
  private createLLMProvider(): ILLMProvider {
    // 动态导入工厂
    const { LLMProviderFactory } = require('../llm/factory.js');
    
    const llmConfig: LLMConfig = {
      provider: this.config.llm.provider as any,
      model: this.config.llm.model,
      apiKey: this.config.llm.apiKey,
      baseUrl: this.config.llm.baseUrl,
      localOptions: this.config.llm.localOptions,
      timeout: this.configManager.get('llm.timeout', 30000),
      retryAttempts: 3
    };

    return LLMProviderFactory.createProvider(llmConfig);
  }

  /**
   * 计算地图尺寸基于难度
   */
  private calculateMapSize(difficulty: number): [number, number] {
    if (difficulty > 0.8) return [18, 18];
    if (difficulty > 0.5) return [14, 14];
    return [10, 10];
  }

  /**
   * 估算通关时间
   */
  private estimateTime(miniGameCount: number, difficulty: number): number {
    const baseTime = 60; // 基础探索时间
    const perPuzzle = 90 * difficulty; // 每个谜题时间
    return Math.floor(baseTime + miniGameCount * perPuzzle);
  }

  /**
   * 调度预生成（异步后台任务）
   */
  private schedulePregeneration(sessionId: string, params: LevelGenerationParams): void {
    const pregenerateCount = this.configManager.get('generation.pregenerateCount', 1);
    if (pregenerateCount <= 0) return;

    // 延迟执行，避免阻塞当前请求
    const timer = setTimeout(async () => {
      try {
        const storage = this.container.get<StorageAdapter>('storage');
        const pending = await storage.getPendingPuzzleCount(sessionId);
        
        if (pending < pregenerateCount) {
          console.log(`[Engine] Pregenerating level for ${sessionId}...`);
          // 递归调用生成，但不等待结果
          this.generateLevel(params).catch((err: any) => {
            console.warn('[Engine] Pregeneration failed:', err);
          });
        }
      } catch (error: any) {
        console.error('[Engine] Pregeneration check failed:', error);
      }
    }, 1000);

    this.pregenerationTimers.set(sessionId, timer);
  }

  /**
   * 确保引擎已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }
    if (this.disposing) {
      throw new Error('Engine is being disposed');
    }
  }
}

/**
 * 引擎工厂函数
 * 便于创建和配置引擎实例
 */
export function createEngine(
  config: GameEngineConfig,
  container?: Container
): XZXLLMGameEngine {
  return new XZXLLMGameEngine(config, container);
}