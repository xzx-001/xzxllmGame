import { MiniGameType } from './base.types.js';
export interface SDKConfig {
    engineConfig?: {
        llm: {
            provider: 'local' | 'ollama' | 'openai';
            model: string;
            apiKey?: string;
            baseUrl?: string;
        };
        storage?: {
            type: 'sqlite' | 'memory';
            connectionString?: string;
        };
    };
    apiEndpoint?: string;
    apiKey?: string;
    timeout?: number;
    retryAttempts?: number;
    pregenerateCount?: number;
    debug?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    enableCompression?: boolean;
}
export interface LevelRequestParams {
    playerId: string;
    sessionId: string;
    difficulty?: number;
    gameTypes?: MiniGameType[] | string[];
    theme?: string;
    immediate?: boolean;
    triggerEvent?: string;
    forceIncludeType?: MiniGameType;
    maxMiniGames?: number;
    customContext?: Record<string, any>;
}
export interface LevelGenerationParams {
    playerId: string;
    sessionId: string;
    difficulty?: number;
    preferredGameTypes?: MiniGameType[];
    theme?: string;
    previousLevelId?: string;
    triggerEvent?: string;
    forceIncludeType?: MiniGameType;
    maxMiniGames?: number;
}
export interface GenerationProgress {
    sessionId: string;
    stage: 'initializing' | 'analyzing' | 'generating_map' | 'generating_minigame' | 'validating' | 'finalizing';
    currentStep: number;
    totalSteps: number;
    percent: number;
    message: string;
    currentMiniGameType?: MiniGameType;
    timestamp: string;
}
export interface PlayerFeedbackData {
    sessionId: string;
    levelId: string;
    completionTime: number;
    attempts: number;
    success: boolean;
    usedHints: number;
    playerFeedback?: string;
    behaviorLog?: Array<{
        timestamp: number;
        event: string;
        data?: any;
    }>;
    rating?: number;
    skipReason?: string;
    reportedIssues?: string[];
}
export declare enum EngineEvent {
    INITIALIZED = "initialized",
    DISPOSING = "disposing",
    DISPOSED = "disposed",
    GENERATION_STARTED = "generation:started",
    GENERATION_PROGRESS = "generation:progress",
    LEVEL_GENERATED = "level:generated",
    LEVEL_CONSUMED = "level:consumed",
    PROFILE_UPDATED = "profile:updated",
    NARRATIVE_CHANGED = "narrative:changed",
    FEEDBACK_RECEIVED = "feedback:received",
    ANALYSIS_COMPLETED = "analysis:completed",
    ERROR = "error",
    CONFIG_CHANGED = "config:changed",
    HEALTH_STATUS_CHANGED = "health:changed",
    LLM_STATUS_CHANGED = "llm:status_changed",
    STORAGE_STATUS_CHANGED = "storage:status_changed"
}
export interface EngineStatus {
    status: 'initializing' | 'ready' | 'busy' | 'error' | 'disposing';
    activeSessions: number;
    pendingGenerations: number;
    bufferedLevelsCount: number;
    avgGenerationTime?: number;
    configSnapshot?: {
        llmProvider: string;
        storageType: string;
        narrativeEnabled: boolean;
    };
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
        suggestions?: string[];
    };
    meta?: {
        requestId: string;
        timestamp: string;
        duration: number;
        version: string;
        pagination?: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
        };
    };
}
export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
        llm: {
            status: 'up' | 'down' | 'degraded';
            provider: string;
            latency: number;
            quotaRemaining?: number;
        };
        storage: {
            status: 'up' | 'down';
            type: string;
            poolUtilization?: number;
        };
        generation: {
            status: 'idle' | 'busy' | 'overloaded';
            queueSize: number;
            avgWaitTime?: number;
        };
        memory?: {
            status: 'normal' | 'high' | 'critical';
            used: number;
            total: number;
            percent: number;
        };
    };
    version: string;
    uptime: number;
    timestamp: string;
}
export interface WebSocketMessage<T = any> {
    type: 'progress' | 'complete' | 'error' | 'ping' | 'pong' | 'subscribe';
    sessionId: string;
    payload: T;
    timestamp: string;
    sequence?: number;
}
export interface BatchRequest<T> {
    batchId: string;
    items: T[];
    concurrency?: number;
    continueOnError?: boolean;
}
export interface BatchResponse<T> {
    batchId: string;
    succeeded: Array<{
        index: number;
        data: T;
    }>;
    failed: Array<{
        index: number;
        error: {
            code: string;
            message: string;
        };
    }>;
    stats: {
        total: number;
        successCount: number;
        failCount: number;
        totalDuration: number;
    };
}
export interface ExportConfig {
    format: 'json' | 'yaml' | 'csv';
    include: Array<'profile' | 'history' | 'levels' | 'observations'>;
    dateRange?: {
        start: string;
        end: string;
    };
    anonymize?: boolean;
    compression?: 'none' | 'gzip' | 'zip';
}
export interface ImportConfig {
    format: 'json' | 'yaml';
    mode: 'merge' | 'replace' | 'skip';
    validation: 'strict' | 'lenient' | 'none';
    backupBeforeImport?: boolean;
}
export interface DebugInfo {
    prompts?: {
        system?: string;
        user: string;
        full: string;
    };
    rawLLMResponse?: string;
    parsingSteps?: Array<{
        step: string;
        input: any;
        output: any;
        duration: number;
    }>;
    validationDetails?: {
        passed: boolean;
        checks: Array<{
            name: string;
            passed: boolean;
            message?: string;
        }>;
    };
    timing?: {
        total: number;
        llmRequest: number;
        parsing: number;
        validation: number;
        storage: number;
    };
    memorySnapshot?: {
        heapUsed: number;
        heapTotal: number;
        external: number;
    };
}
export interface PaginationParams {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    filter?: Record<string, any>;
}
export interface CacheControl {
    enabled: boolean;
    maxAge?: number;
    shared?: boolean;
    cacheKey?: string[];
}
export interface RealtimeStats {
    activeSessions: number;
    requestsPerMinute: number;
    generationTimeTrend: number[];
    providerUsage: Record<string, number>;
    errorRateTrend: number[];
    playerRatings: {
        '1': number;
        '2': number;
        '3': number;
        '4': number;
        '5': number;
    };
    popularGameTypes: Array<{
        type: MiniGameType;
        count: number;
    }>;
}
//# sourceMappingURL=api.types.d.ts.map