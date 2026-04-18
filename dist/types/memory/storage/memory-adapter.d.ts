import { StorageOptions, StorageItem, StorageQuery, StorageStats, BaseStorageAdapter, BufferedPuzzle, HealthStatus } from './base-storage.js';
import { PlayerProfile, NarrativeState, DialogueObservation, LevelStructure } from '../../core/interfaces/base.types.js';
export interface MemoryStorageOptions extends StorageOptions {
    maxSize?: number;
    defaultTTL?: number;
    cleanupInterval?: number;
    enableLRU?: boolean;
    memoryLimitMB?: number;
    autoPersist?: boolean;
    persistPath?: string;
}
export type StorageEventType = 'insert' | 'update' | 'delete' | 'expire' | 'evict';
export interface StorageEvent<T = unknown> {
    type: StorageEventType;
    key: string;
    oldValue?: T;
    newValue?: T;
    timestamp: number;
    reason?: 'ttl' | 'lru' | 'manual' | 'clear';
}
export declare class MemoryStorageAdapter extends BaseStorageAdapter {
    readonly storageType = "memory";
    private _initialized;
    private store;
    private options;
    private eventBus;
    private cleanupTimer;
    private currentMemoryBytes;
    private memoryStats;
    constructor(options?: MemoryStorageOptions);
    initialize(): Promise<void>;
    get isInitialized(): boolean;
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
    getStats(): Promise<StorageStats>;
    has(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
    export<T>(filter?: (key: string) => boolean): Promise<Record<string, T>>;
    import<T>(data: Record<string, T>, options?: {
        ttl?: number;
        skipExisting?: boolean;
    }): Promise<void>;
    persist(): Promise<void>;
    persistSync(): void;
    restore(): Promise<void>;
    on<T = unknown>(event: StorageEventType | 'all', handler: (event: StorageEvent<T>) => void): void;
    off<T = unknown>(_event: StorageEventType | 'all', _handler: (event: StorageEvent<T>) => void): void;
    close(): Promise<void>;
    cleanup(): Promise<number>;
    private ensureInitialized;
    private isExpired;
    private deleteInternal;
    private evictLRU;
    private startCleanupTask;
    private estimateSize;
    getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
    updatePlayerProfile(playerId: string, updates: Partial<PlayerProfile>): Promise<void>;
    getNarrativeState(sessionId: string): Promise<NarrativeState | null>;
    updateNarrativeState(sessionId: string, updates: Partial<NarrativeState>): Promise<void>;
    submitObservation(obs: Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>): Promise<void>;
    getUnprocessedObservations(limit?: number): Promise<DialogueObservation[]>;
    markObservationsProcessed(ids: (number | string)[]): Promise<void>;
    storePuzzle(sessionId: string, puzzleData: LevelStructure | object, difficulty: number, mood: string, options?: StorageOptions): Promise<string>;
    consumeNextPuzzle(sessionId: string, filter?: {
        tags?: string[];
        maxDifficulty?: number;
    }): Promise<BufferedPuzzle | null>;
    getPendingPuzzleCount(sessionId: string): Promise<number>;
    getActiveSessions(hours?: number): Promise<string[]>;
    healthCheck(): Promise<HealthStatus>;
}
export declare function createMemoryStorage(options?: MemoryStorageOptions): MemoryStorageAdapter;
//# sourceMappingURL=memory-adapter.d.ts.map