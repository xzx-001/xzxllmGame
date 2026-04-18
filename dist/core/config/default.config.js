import { SkillDimension, AIMood, RelationshipStage, MiniGameType } from '../interfaces/base.types.js';
export const DEFAULT_CONFIG = {
    generation: {
        difficulty: 0.5,
        pregenerateCount: 2,
        maxMiniGames: 3,
        minMiniGames: 1,
        mapSize: {
            easy: [10, 10],
            medium: [14, 14],
            hard: [18, 18]
        },
        timeout: 60000,
        enableNarrative: true,
        enableValidation: true
    },
    player: {
        skillRating: 0.5,
        frustrationLevel: 0.0,
        winStreak: 0,
        relationshipStage: RelationshipStage.RIVALS,
        currentMood: AIMood.PLAYFUL,
        skillDimensions: {
            [SkillDimension.SPATIAL]: 0.5,
            [SkillDimension.LOGIC]: 0.5,
            [SkillDimension.MECHANISM]: 0.5,
            [SkillDimension.NARRATIVE]: 0.5
        }
    },
    difficultyAdjustment: {
        frustrationThreshold: 0.8,
        winStreakThreshold: 3,
        adjustmentStep: 0.1,
        maxDifficulty: 1.0,
        minDifficulty: 0.1,
        decayFactor: 0.95
    },
    memory: {
        retentionDays: 30,
        minImportance: 2,
        maxBufferedLevels: 5,
        sessionTimeoutHours: 24
    },
    llm: {
        provider: 'ollama',
        model: 'qwen2.5:7b',
        temperature: 0.7,
        maxTokens: 2000,
        retryAttempts: 3,
        timeout: 30000
    },
    miniGameWeights: {
        [MiniGameType.PUSHBOX]: 1.0,
        [MiniGameType.LASER_MIRROR]: 1.0,
        [MiniGameType.CIRCUIT]: 0.8,
        [MiniGameType.SLIDING]: 0.8,
        [MiniGameType.MEMORY]: 0.6,
        [MiniGameType.RIDDLE]: 0.9
    }
};
export const ENV_MAPPINGS = {
    'LLM_PROVIDER': 'llm.provider',
    'LLM_MODEL': 'llm.model',
    'LLM_API_KEY': 'llm.apiKey',
    'LLM_BASE_URL': 'llm.baseUrl',
    'LLM_TEMPERATURE': 'llm.temperature',
    'STORAGE_TYPE': 'storage.type',
    'DATABASE_URL': 'storage.connectionString',
    'GENERATION_TIMEOUT': 'generation.timeout',
    'ENABLE_NARRATIVE': 'generation.enableNarrative',
    'DEBUG': 'debug',
    'LOG_LEVEL': 'logging.level'
};
//# sourceMappingURL=default.config.js.map