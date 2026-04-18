import { BaseStorageAdapter, StorageOptions, StorageItem, StorageQuery, StorageStats } from './base-storage.js';
import type { Redis, Cluster } from 'ioredis';
export interface RedisStorageOptions extends StorageOptions {
    uri?: string;
    host?: string;
    port?: number;
    db?: number;
    password?: string;
    keyPrefix?: string;
    cluster?: {
        host: string;
        port: number;
    }[];
    retryStrategy?: (times: number) => number | null;
    connectTimeout?: number;
    enableOfflineQueue?: boolean;
    serializer?: (value: unknown) => string;
    deserializer?: (data: string) => unknown;
}
export declare class RedisStorageAdapter extends BaseStorageAdapter {
    readonly storageType = "redis";
    private client;
    private options;
    private _initialized;
    private serializer;
    private deserializer;
    constructor(options?: RedisStorageOptions);
    initialize(): Promise<void>;
    getClient(): Redis | Cluster | null;
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
    close(): Promise<void>;
    dispose(): Promise<void>;
    private getKey;
    private ensureInitialized;
    getPlayerProfile(playerId: string): Promise<import('../../core/interfaces/base.types.js').PlayerProfile | null>;
    updatePlayerProfile(playerId: string, updates: Partial<import('../../core/interfaces/base.types.js').PlayerProfile>): Promise<void>;
    getNarrativeState(sessionId: string): Promise<import('../../core/interfaces/base.types.js').NarrativeState | null>;
    updateNarrativeState(sessionId: string, updates: Partial<import('../../core/interfaces/base.types.js').NarrativeState>): Promise<void>;
    submitObservation(obs: Omit<import('../../core/interfaces/base.types.js').DialogueObservation, 'id' | 'timestamp' | 'processed'> & {
        playerId?: string;
        levelId?: string;
    }): Promise<void>;
    getUnprocessedObservations(limit?: number): Promise<import('../../core/interfaces/base.types.js').DialogueObservation[]>;
    markObservationsProcessed(ids: (number | string)[]): Promise<void>;
    storePuzzle(sessionId: string, puzzleData: import('../../core/interfaces/base.types.js').LevelStructure | object, difficulty: number, mood: string, options?: StorageOptions): Promise<string>;
    consumeNextPuzzle(sessionId: string, filter?: {
        tags?: string[];
        maxDifficulty?: number;
    }): Promise<import('./base-storage.js').BufferedPuzzle | null>;
    getPendingPuzzleCount(sessionId: string, filter?: {
        tags?: string[];
    }): Promise<number>;
    getActiveSessions(_hours?: number): Promise<string[]>;
    healthCheck(): Promise<import('./base-storage.js').HealthStatus>;
    getPlayerObservations(playerId: string, limit?: number, types?: string[]): Promise<import('../../core/interfaces/base.types.js').DialogueObservation[]>;
    getObservationsPaginated(sessionId: string, cursor?: string | null, pageSize?: number): Promise<import('./base-storage.js').PaginatedResult<import('../../core/interfaces/base.types.js').DialogueObservation>>;
}
//# sourceMappingURL=redis-adapter.d.ts.map