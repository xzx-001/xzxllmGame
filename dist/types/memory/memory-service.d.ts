import { StorageAdapter } from './storage/base-storage.js';
import { PlayerProfile } from './models/player-profile.js';
import { NarrativeState, AIMood } from './models/narrative-state.js';
import { Observation, ObservationType } from './models/observation.js';
export interface MemoryServiceConfig {
    primaryStorage: StorageAdapter;
    cacheStorage?: StorageAdapter;
    enableWriteCache?: boolean;
    observationBatchSize?: number;
    observationFlushInterval?: number;
}
export declare class MemoryService {
    private primaryStorage;
    private cacheStorage;
    private config;
    private observationBuffer;
    private flushTimer;
    constructor(config: MemoryServiceConfig);
    initialize(): Promise<void>;
    getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
    createPlayer(playerId: string, displayName?: string): Promise<PlayerProfile>;
    savePlayerProfile(profile: PlayerProfile): Promise<void>;
    updatePlayerSkill(playerId: string, levelDifficulty: number, success: boolean, performanceScore: number, skillUpdates?: Partial<PlayerProfile['skills']>): Promise<void>;
    updatePlayerEmotion(playerId: string, emotion: 'frustrationLevel' | 'engagementLevel' | 'confusionLevel' | 'satisfactionLevel', value: number, trigger: string): Promise<void>;
    getOrCreateNarrative(playerId: string, theme?: string): Promise<NarrativeState>;
    saveNarrativeState(state: NarrativeState): Promise<void>;
    advanceNarrative(playerId: string, choiceIndex: number): Promise<{
        success: boolean;
        node?: NarrativeState['nodes'] extends Map<infer _K, infer V> ? V : never;
        state?: NarrativeState;
    }>;
    updateNarrativeMood(playerId: string, mood: AIMood): Promise<void>;
    recordObservation(playerId: string, type: ObservationType, locationId: string, details?: Record<string, unknown>, puzzleId?: string): Promise<void>;
    flushObservations(playerId: string): Promise<void>;
    getRecentObservations(playerId: string, limit?: number): Promise<Observation[]>;
    getRecommendedDifficulty(playerId: string): Promise<number>;
    generatePlayerContext(playerId: string): Promise<{
        profileSummary: string;
        narrativeContext: string;
        recentObservations: Observation[];
        currentMood: AIMood;
    }>;
    healthCheck(): Promise<{
        primary: boolean;
        cache: boolean;
        stats: Record<string, unknown>;
    }>;
    dispose(): Promise<void>;
    private startFlushTimer;
}
//# sourceMappingURL=memory-service.d.ts.map