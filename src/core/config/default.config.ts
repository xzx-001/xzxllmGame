// src/core/config/default.config.ts
/**
 * @fileoverview 默认配置常量
 * @description 定义框架的默认参数值
 * @module core/config/defaults
 */

import { SkillDimension, AIMood, RelationshipStage, MiniGameType } from '../interfaces/base.types.js';

/**
 * 引擎默认配置
 * 当用户未提供配置项时使用这些值
 */
export const DEFAULT_CONFIG = {
  /** 生成相关默认配置 */
  generation: {
    /** 默认难度（中等） */
    difficulty: 0.5,
    /** 预生成关卡数（保持缓冲） */
    pregenerateCount: 2,
    /** 最大小游戏数量 */
    maxMiniGames: 3,
    /** 最小小游戏数量 */
    minMiniGames: 1,
    /** 默认地图尺寸 */
    mapSize: {
      easy: [10, 10] as [number, number],
      medium: [14, 14] as [number, number],
      hard: [18, 18] as [number, number]
    },
    /** 生成超时（毫秒） */
    timeout: 60000,
    /** 是否启用叙事包装 */
    enableNarrative: true,
    /** 是否启用验证（生产环境建议开启） */
    enableValidation: true
  },

  /** 玩家画像默认配置 */
  player: {
    /** 初始技能评级 */
    skillRating: 0.5,
    /** 初始挫败感 */
    frustrationLevel: 0.0,
    /** 初始连胜 */
    winStreak: 0,
    /** 初始关系阶段 */
    relationshipStage: RelationshipStage.RIVALS,
    /** 初始情绪 */
    currentMood: AIMood.PLAYFUL,
    /** 默认技能维度分布 */
    skillDimensions: {
      [SkillDimension.SPATIAL]: 0.5,
      [SkillDimension.LOGIC]: 0.5,
      [SkillDimension.MECHANISM]: 0.5,
      [SkillDimension.NARRATIVE]: 0.5
    }
  },

  /** 难度调整算法参数（DDDA - Dynamic Difficulty Adjustment） */
  difficultyAdjustment: {
    /** 挫败感阈值（超过则降难度） */
    frustrationThreshold: 0.8,
    /** 连胜阈值（超过则升难度） */
    winStreakThreshold: 3,
    /** 难度调整步长 */
    adjustmentStep: 0.1,
    /** 最大难度 */
    maxDifficulty: 1.0,
    /** 最小难度 */
    minDifficulty: 0.1,
    /** 衰减因子（历史数据权重随时间降低） */
    decayFactor: 0.95
  },

  /** 记忆系统默认配置 */
  memory: {
    /** 观察记录保留天数 */
    retentionDays: 30,
    /** 重要性阈值（低于此值不存储） */
    minImportance: 2,
    /** 最大缓冲关卡数（每会话） */
    maxBufferedLevels: 5,
    /** 会话超时（小时，无活动后清理） */
    sessionTimeoutHours: 24
  },

  /** LLM 默认配置 */
  llm: {
    /** 默认提供商 */
    provider: 'ollama' as const,
    /** 默认模型 */
    model: 'qwen2.5:7b',
    /** 默认温度（创造性 vs 确定性平衡） */
    temperature: 0.7,
    /** 最大 Token 数 */
    maxTokens: 2000,
    /** 重试次数 */
    retryAttempts: 3,
    /** 请求超时 */
    timeout: 30000
  },

  /** 小游戏类型权重（影响随机选择概率） */
  miniGameWeights: {
    [MiniGameType.PUSHBOX]: 1.0,
    [MiniGameType.LASER_MIRROR]: 1.0,
    [MiniGameType.CIRCUIT]: 0.8,
    [MiniGameType.SLIDING]: 0.8,
    [MiniGameType.MEMORY]: 0.6,
    [MiniGameType.RIDDLE]: 0.9
  }
} as const;

/**
 * 环境变量映射
 * 支持通过环境变量覆盖配置
 */
export const ENV_MAPPINGS = {
  // LLM 配置
  'LLM_PROVIDER': 'llm.provider',
  'LLM_MODEL': 'llm.model',
  'LLM_API_KEY': 'llm.apiKey',
  'LLM_BASE_URL': 'llm.baseUrl',
  'LLM_TEMPERATURE': 'llm.temperature',
  
  // 存储配置
  'STORAGE_TYPE': 'storage.type',
  'DATABASE_URL': 'storage.connectionString',
  
  // 生成配置
  'GENERATION_TIMEOUT': 'generation.timeout',
  'ENABLE_NARRATIVE': 'generation.enableNarrative',
  
  // 调试配置
  'DEBUG': 'debug',
  'LOG_LEVEL': 'logging.level'
} as const;