import { AIMood, RelationshipStage } from '../interfaces/base.types.js';
export declare const DEFAULT_CONFIG: {
    readonly generation: {
        readonly difficulty: 0.5;
        readonly pregenerateCount: 2;
        readonly maxMiniGames: 3;
        readonly minMiniGames: 1;
        readonly mapSize: {
            readonly easy: [number, number];
            readonly medium: [number, number];
            readonly hard: [number, number];
        };
        readonly timeout: 60000;
        readonly enableNarrative: true;
        readonly enableValidation: true;
    };
    readonly player: {
        readonly skillRating: 0.5;
        readonly frustrationLevel: 0;
        readonly winStreak: 0;
        readonly relationshipStage: RelationshipStage.RIVALS;
        readonly currentMood: AIMood.PLAYFUL;
        readonly skillDimensions: {
            readonly spatial: 0.5;
            readonly logic: 0.5;
            readonly mechanism: 0.5;
            readonly narrative: 0.5;
        };
    };
    readonly difficultyAdjustment: {
        readonly frustrationThreshold: 0.8;
        readonly winStreakThreshold: 3;
        readonly adjustmentStep: 0.1;
        readonly maxDifficulty: 1;
        readonly minDifficulty: 0.1;
        readonly decayFactor: 0.95;
    };
    readonly memory: {
        readonly retentionDays: 30;
        readonly minImportance: 2;
        readonly maxBufferedLevels: 5;
        readonly sessionTimeoutHours: 24;
    };
    readonly llm: {
        readonly provider: "ollama";
        readonly model: "qwen2.5:7b";
        readonly temperature: 0.7;
        readonly maxTokens: 2000;
        readonly retryAttempts: 3;
        readonly timeout: 30000;
    };
    readonly miniGameWeights: {
        readonly pushbox: 1;
        readonly "laser-mirror": 1;
        readonly "circuit-connection": 0.8;
        readonly "sliding-puzzle": 0.8;
        readonly "memory-tiles": 0.6;
        readonly "text-riddle": 0.9;
    };
};
export declare const ENV_MAPPINGS: {
    readonly LLM_PROVIDER: "llm.provider";
    readonly LLM_MODEL: "llm.model";
    readonly LLM_API_KEY: "llm.apiKey";
    readonly LLM_BASE_URL: "llm.baseUrl";
    readonly LLM_TEMPERATURE: "llm.temperature";
    readonly STORAGE_TYPE: "storage.type";
    readonly DATABASE_URL: "storage.connectionString";
    readonly GENERATION_TIMEOUT: "generation.timeout";
    readonly ENABLE_NARRATIVE: "generation.enableNarrative";
    readonly DEBUG: "debug";
    readonly LOG_LEVEL: "logging.level";
};
//# sourceMappingURL=default.config.d.ts.map