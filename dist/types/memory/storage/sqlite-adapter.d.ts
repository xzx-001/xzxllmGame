import { BaseStorageAdapter, StorageOptions, StorageQuery, StorageItem, HealthStatus, StorageStats, BufferedPuzzle } from './base-storage.js';
import { PlayerProfile, NarrativeState, DialogueObservation, LevelStructure } from '../../core/interfaces/base.types.js';
export interface SQLiteConfig extends Record<string, unknown> {
    dbPath: string;
    enableWAL?: boolean;
    enableForeignKeys?: boolean;
    readonly?: boolean;
    pageSize?: number;
    cacheSize?: number;
}
export declare class SQLiteStorageAdapter extends BaseStorageAdapter {
    readonly storageType = "sqlite";
    private db;
    private dbPath;
    private options;
    constructor(config: SQLiteConfig);
    initialize(): Promise<void>;
    private applyPragmas;
    private createTables;
    private createIndexes;
    getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
    updatePlayerProfile(playerId: string, updates: Partial<PlayerProfile>): Promise<void>;
    getNarrativeState(sessionId: string): Promise<NarrativeState | null>;
    updateNarrativeState(sessionId: string, updates: Partial<NarrativeState>): Promise<void>;
    submitObservation(obs: Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'> & {
        playerId?: string;
        levelId?: string;
    }): Promise<void>;
    getUnprocessedObservations(limit?: number): Promise<DialogueObservation[]>;
    markObservationsProcessed(ids: number[]): Promise<void>;
    getPlayerObservations(playerId: string, limit?: number, types?: string[]): Promise<DialogueObservation[]>;
    storePuzzle(sessionId: string, puzzleData: LevelStructure | object, difficulty: number, mood: string, options?: StorageOptions): Promise<string>;
    consumeNextPuzzle(sessionId: string, filter?: {
        tags?: string[];
        maxDifficulty?: number;
    }): Promise<BufferedPuzzle | null>;
    getPendingPuzzleCount(sessionId: string): Promise<number>;
    cleanupOldPuzzles(maxAgeHours?: number): Promise<number>;
    getActiveSessions(hours?: number): Promise<string[]>;
    healthCheck(): Promise<HealthStatus>;
    close(): Promise<void>;
    private rowToPlayerProfile;
    private rowToObservation;
    private cleanupExpiredKeys;
    set<T>(key: string, value: T, options?: StorageOptions): Promise<boolean>;
    get<T>(key: string): Promise<T | undefined>;
    getMany<T>(keys: string[]): Promise<Map<string, T>>;
    setMany<T>(entries: Array<{
        key: string;
        value: T;
    }>, options?: StorageOptions): Promise<void>;
    delete(key: string): Promise<boolean>;
    query<T>(query: StorageQuery<T>): Promise<StorageItem<T>[]>;
    clear(): Promise<void>;
    has(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
    export<T>(filter?: (key: string) => boolean): Promise<Record<string, T>>;
    import<T>(data: Record<string, T>, options?: {
        ttl?: number;
        skipExisting?: boolean;
    }): Promise<void>;
    createPlayerProfileIfNotExists(playerId: string): Promise<PlayerProfile>;
    createNarrativeStateIfNotExists(sessionId: string, playerId: string): Promise<NarrativeState>;
    getCurrentMood(sessionId: string): Promise<string | null>;
    submitObservationsBatch(observations: Array<Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'> & {
        playerId?: string;
        levelId?: string;
    }>): Promise<void>;
    getStats(): Promise<StorageStats>;
}
//# sourceMappingURL=sqlite-adapter.d.ts.map