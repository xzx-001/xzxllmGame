import { EventEmitter } from 'events';
import { Container } from './container.js';
import { LevelStructure, PlayerProfile, ObservationType } from './interfaces/base.types.js';
import { LevelGenerationParams } from './interfaces/api.types.js';
export interface GameEngineConfig {
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
    storage?: {
        type: 'sqlite' | 'memory' | 'redis';
        connectionString?: string;
    };
    generation?: {
        pregenerateCount?: number;
        enableNarrative?: boolean;
        defaultDifficulty?: number;
        timeout?: number;
    };
    debug?: boolean;
}
export declare class XZXLLMGameEngine extends EventEmitter {
    private config;
    private container;
    private configManager;
    private initialized;
    private disposing;
    private generationQueue;
    private pregenerationTimers;
    constructor(config: GameEngineConfig, customContainer?: Container);
    initialize(): Promise<void>;
    generateLevel(params: LevelGenerationParams): Promise<LevelStructure>;
    getNextLevel(sessionId: string): Promise<LevelStructure | null>;
    submitFeedback(sessionId: string, feedback: {
        type: ObservationType;
        content: string;
        rawQuote?: string;
        importance?: number;
        levelId?: string;
    }): Promise<void>;
    getPlayerStats(playerId: string): Promise<PlayerProfile | null>;
    healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        components: Record<string, boolean>;
    }>;
    dispose(): Promise<void>;
    private doGenerateLevel;
    private createDefaultProfile;
    private createDefaultNarrativeState;
    private analyzeFeedbackAsync;
    private createStorage;
    private createLLMProvider;
    private calculateMapSize;
    private estimateTime;
    private schedulePregeneration;
    private ensureInitialized;
}
export declare function createEngine(config: GameEngineConfig, container?: Container): XZXLLMGameEngine;
//# sourceMappingURL=engine.d.ts.map