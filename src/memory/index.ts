/**
 * @fileoverview 记忆模块入口 (Memory Index)
 * @description 统一导出记忆系统所有组件
 *
 * @module memory/index
 */
// 存储适配器
export type { StorageItem, StorageQuery } from './storage/base-storage.js';
export type { StorageOptions, StorageStats } from './storage/base-storage.js';
export type { StorageAdapter } from './storage/base-storage.js';
export { MemoryStorageAdapter, createMemoryStorage } from './storage/memory-adapter.js';
export type { MemoryStorageOptions } from './storage/memory-adapter.js';
export { RedisStorageAdapter } from './storage/redis-adapter.js';
export type { RedisStorageOptions } from './storage/redis-adapter.js';

// 数据模型
export {
    PlayerProfileFactory
} from './models/player-profile.js';
export type {
    PlayerProfile,
    PlayerSkills,
    PlayerEmotionState,
    PlayerPreferences,
    LearningProgress
} from './models/player-profile.js';

export {
    AIMood,
    NarrativeStateFactory
} from './models/narrative-state.js';
export type {
    NarrativeState,
    NarrativeNode,
    WorldState,
    NarrativeContext
} from './models/narrative-state.js';

export {
    ObservationType,
    ObservationFactory
} from './models/observation.js';
export type { Observation } from './models/observation.js';

// 服务层
export { MemoryService } from './memory-service.js';
export type { MemoryServiceConfig } from './memory-service.js';

// 分析器
export { DifficultyAnalyzer } from './analytics/difficulty-analyzer.js';
export type { DifficultyAnalysisInput, DifficultyAdjustment } from './analytics/difficulty-analyzer.js';
export { SentimentAnalyzer } from './analytics/sentiment-analyzer.js';
export type { SentimentResult } from './analytics/sentiment-analyzer.js';
