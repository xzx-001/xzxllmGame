import { PlayerProfile, NarrativeState, DialogueObservation, LevelStructure } from '../../core/interfaces/base.types.js';
export interface StorageItem<T> {
    key: string;
    value: T;
    createdAt: number;
    updatedAt: number;
}
export interface StorageQuery<T> {
    prefix?: string;
    filter?: (value: T) => boolean;
    since?: number;
    until?: number;
    orderBy?: keyof StorageItem<T>;
    order?: 'asc' | 'desc';
    limit?: number;
}
export interface StorageOptions {
    ttl?: number;
    tags?: string[];
    priority?: number;
}
export interface StorageStats {
    totalPlayerProfiles: number;
    activeNarrativeSessions: number;
    pendingObservations: number;
    bufferedPuzzles: number;
    estimatedSizeMB: number;
    operations: {
        reads: number;
        writes: number;
        deletes: number;
        errors: number;
    };
    timestamp: string;
    storageType: string;
    uptime: number;
}
export interface BufferedPuzzle {
    id: string;
    puzzleData: LevelStructure | object;
    difficulty: number;
    mood: string;
    createdAt: string;
    consumed: boolean;
    consumedAt?: string;
    sessionId: string;
    tags?: string[];
}
export interface HealthStatus {
    healthy: boolean;
    latencyMs: number;
    checkedAt: string;
    details: {
        connected: boolean;
        diskSpaceAvailable?: boolean;
        memoryPressure?: boolean;
        lastError?: string;
    };
}
export interface PaginatedResult<T> {
    data: T[];
    hasMore: boolean;
    nextCursor: string | null;
    totalEstimate: number;
}
export interface StorageAdapter {
    [x: string]: any;
    readonly storageType: string;
    initialize(): Promise<void>;
    close(): Promise<void>;
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
    getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
    updatePlayerProfile(playerId: string, updates: Partial<PlayerProfile>): Promise<void>;
    createPlayerProfileIfNotExists(playerId: string): Promise<PlayerProfile>;
    getRecentPlayers(hours?: number, limit?: number): Promise<string[]>;
    getNarrativeState(sessionId: string): Promise<NarrativeState | null>;
    updateNarrativeState(sessionId: string, updates: Partial<NarrativeState>): Promise<void>;
    createNarrativeStateIfNotExists(sessionId: string, playerId: string): Promise<NarrativeState>;
    getCurrentMood(sessionId: string): Promise<string | null>;
    submitObservation(obs: Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>): Promise<void>;
    submitObservationsBatch(observations: Array<Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>>): Promise<void>;
    getUnprocessedObservations(limit?: number): Promise<DialogueObservation[]>;
    markObservationsProcessed(ids: number[] | string[]): Promise<void>;
    getPlayerObservations(playerId: string, limit?: number, types?: string[]): Promise<DialogueObservation[]>;
    getObservationsPaginated(sessionId: string, cursor?: string | null, pageSize?: number): Promise<PaginatedResult<DialogueObservation>>;
    cleanupOldObservations(daysToKeep?: number): Promise<number>;
    storePuzzle(sessionId: string, puzzleData: LevelStructure | object, difficulty: number, mood: string, options?: StorageOptions): Promise<string>;
    consumeNextPuzzle(sessionId: string, filter?: {
        tags?: string[];
        maxDifficulty?: number;
    }): Promise<BufferedPuzzle | null>;
    peekNextPuzzle(sessionId: string): Promise<BufferedPuzzle | null>;
    getPendingPuzzleCount(sessionId: string, filter?: {
        tags?: string[];
    }): Promise<number>;
    listPendingPuzzles(sessionId: string, cursor?: string | null, pageSize?: number): Promise<PaginatedResult<BufferedPuzzle>>;
    cleanupOldPuzzles(maxAgeHours?: number, sessionId?: string): Promise<number>;
    removePuzzle(puzzleId: string): Promise<boolean>;
    getActiveSessions(hours?: number): Promise<string[]>;
    getSessionStats(sessionId: string): Promise<{
        observationCount: number;
        pendingPuzzles: number;
        lastActivity: string | null;
    }>;
    endSession(sessionId: string): Promise<void>;
    getStats(): Promise<StorageStats>;
    resetStats(): Promise<void>;
    healthCheck(): Promise<HealthStatus>;
    exportSessionData(sessionId: string): Promise<{
        profile: PlayerProfile | null;
        narrative: NarrativeState | null;
        observations: DialogueObservation[];
        puzzles: BufferedPuzzle[];
    }>;
    importSessionData(sessionId: string, data: {
        profile?: PlayerProfile;
        narrative?: NarrativeState;
        observations?: DialogueObservation[];
        puzzles?: BufferedPuzzle[];
    }): Promise<void>;
    search?(query: string, limit?: number): Promise<Array<{
        type: 'profile' | 'observation' | 'puzzle' | 'narrative';
        id: string;
        snippet: string;
    }>>;
}
export declare abstract class BaseStorageAdapter implements StorageAdapter {
    abstract readonly storageType: string;
    protected config: Record<string, unknown>;
    protected stats: StorageStats['operations'];
    protected initializedAt: Date | null;
    constructor(config?: Record<string, unknown>);
    abstract initialize(): Promise<void>;
    abstract close(): Promise<void>;
    abstract set<T>(key: string, value: T, options?: StorageOptions): Promise<boolean>;
    abstract get<T>(key: string): Promise<T | undefined>;
    abstract getMany<T>(keys: string[]): Promise<Map<string, T>>;
    abstract setMany<T>(entries: Array<{
        key: string;
        value: T;
    }>, options?: StorageOptions): Promise<void>;
    abstract delete(key: string): Promise<boolean>;
    abstract query<T>(query: StorageQuery<T>): Promise<StorageItem<T>[]>;
    abstract clear(): Promise<void>;
    abstract has(key: string): Promise<boolean>;
    abstract keys(): Promise<string[]>;
    abstract export<T>(filter?: (key: string) => boolean): Promise<Record<string, T>>;
    abstract import<T>(data: Record<string, T>, options?: {
        ttl?: number;
        skipExisting?: boolean;
    }): Promise<void>;
    abstract getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
    abstract updatePlayerProfile(playerId: string, updates: Partial<PlayerProfile>): Promise<void>;
    abstract getNarrativeState(sessionId: string): Promise<NarrativeState | null>;
    abstract updateNarrativeState(sessionId: string, updates: Partial<NarrativeState>): Promise<void>;
    abstract submitObservation(obs: Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>): Promise<void>;
    abstract getUnprocessedObservations(limit?: number): Promise<DialogueObservation[]>;
    abstract markObservationsProcessed(ids: number[] | string[]): Promise<void>;
    abstract storePuzzle(sessionId: string, puzzleData: LevelStructure | object, difficulty: number, mood: string, options?: StorageOptions): Promise<string>;
    abstract consumeNextPuzzle(sessionId: string, filter?: {
        tags?: string[];
        maxDifficulty?: number;
    }): Promise<BufferedPuzzle | null>;
    abstract getPendingPuzzleCount(sessionId: string, filter?: {
        tags?: string[];
    }): Promise<number>;
    abstract getActiveSessions(hours?: number): Promise<string[]>;
    abstract healthCheck(): Promise<HealthStatus>;
    abstract getStats(): Promise<StorageStats>;
    submitObservationsBatch(observations: Array<Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'>>): Promise<void>;
    createPlayerProfileIfNotExists(playerId: string): Promise<PlayerProfile>;
    createNarrativeStateIfNotExists(sessionId: string, playerId: string): Promise<NarrativeState>;
    getCurrentMood(sessionId: string): Promise<string | null>;
    getPlayerObservations(playerId: string, limit?: number, types?: string[]): Promise<DialogueObservation[]>;
    getObservationsPaginated(sessionId: string, cursor?: string | null, pageSize?: number): Promise<PaginatedResult<DialogueObservation>>;
    cleanupOldObservations(daysToKeep?: number): Promise<number>;
    peekNextPuzzle(sessionId: string): Promise<BufferedPuzzle | null>;
    listPendingPuzzles(sessionId: string, cursor?: string | null, pageSize?: number): Promise<PaginatedResult<BufferedPuzzle>>;
    cleanupOldPuzzles(maxAgeHours?: number, sessionId?: string): Promise<number>;
    removePuzzle(puzzleId: string): Promise<boolean>;
    getRecentPlayers(hours?: number, limit?: number): Promise<string[]>;
    getSessionStats(sessionId: string): Promise<{
        observationCount: number;
        pendingPuzzles: number;
        lastActivity: string | null;
    }>;
    endSession(sessionId: string): Promise<void>;
    resetStats(): Promise<void>;
    exportSessionData(sessionId: string): Promise<{
        profile: PlayerProfile | null;
        narrative: NarrativeState | null;
        observations: DialogueObservation[];
        puzzles: BufferedPuzzle[];
    }>;
    importSessionData(sessionId: string, data: {
        profile?: PlayerProfile;
        narrative?: NarrativeState;
        observations?: DialogueObservation[];
        puzzles?: BufferedPuzzle[];
    }): Promise<void>;
    protected now(): string;
    protected safeJSONStringify(obj: unknown, space?: number): string;
    protected safeJSONParse<T>(data: string, defaultValue?: T | null): T | null;
    protected generateUUID(): string;
    protected getUptimeSeconds(): number;
    protected requireConfig(key: string): unknown;
    protected getConfig<T>(key: string, defaultValue: T): T;
}
export declare class StorageError extends Error {
    readonly code: string;
    readonly cause?: Error | undefined;
    constructor(message: string, code: string, cause?: Error | undefined);
}
export declare class StorageInitError extends StorageError {
    constructor(message: string, cause?: Error);
}
export declare class StorageMigrationError extends StorageError {
    constructor(message: string, cause?: Error);
}
export declare class StorageConnectionError extends StorageError {
    constructor(message: string, cause?: Error);
}
export declare class StorageSerializationError extends StorageError {
    constructor(message: string, cause?: Error);
}
//# sourceMappingURL=base-storage.d.ts.map