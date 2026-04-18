import type { LevelStructure, PlayerProfile, MiniGameType } from '../../core/interfaces/base.types.js';
import type { LevelRequestParams, PlayerFeedbackData, GenerationProgress, HealthStatus, ApiResponse } from '../../core/interfaces/api.types.js';
export type SDKEventCallback<T = any> = (data: T) => void;
export declare enum SDKEvent {
    CONNECTED = "connected",
    DISCONNECTED = "disconnected",
    ERROR = "error",
    GENERATION_STARTED = "generation:started",
    GENERATION_PROGRESS = "generation:progress",
    LEVEL_READY = "level:ready",
    DIALOGUE_RECEIVED = "dialogue:received",
    PROFILE_UPDATED = "profile:updated",
    CONFIG_CHANGED = "config:changed"
}
export interface SDKConfig {
    apiEndpoint: string;
    apiKey?: string;
    timeout?: number;
    retryAttempts?: number;
    reconnectInterval?: number;
    enablePregeneration?: boolean;
    debug?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
export interface LevelGenerationOptions {
    difficulty?: number;
    gameTypes?: MiniGameType[];
    theme?: string;
    immediate?: boolean;
    triggerEvent?: string;
    customContext?: Record<string, any>;
}
export interface PlayerSession {
    playerId: string;
    sessionId: string;
    startTime: string;
    currentLevelIndex: number;
    totalPlayTime: number;
}
export interface LevelResult {
    levelId: string;
    completionTime: number;
    attempts: number;
    success: boolean;
    hintsUsed: number;
    rating?: number;
    feedback?: string;
    behaviorLog?: Array<{
        timestamp: number;
        event: string;
        data?: any;
    }>;
}
export interface GenerationStatus {
    isGenerating: boolean;
    progress: number;
    currentStage: string;
    estimatedTimeRemaining?: number;
}
export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
}
export interface SDKStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    cacheStats: CacheStats;
    activeSessions: number;
}
export declare enum WebSocketState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3
}
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export interface RequestConfig {
    method?: HTTPMethod;
    path: string;
    data?: any;
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    timeout?: number;
    skipCache?: boolean;
}
export type { LevelStructure, PlayerProfile, MiniGameType, LevelRequestParams, PlayerFeedbackData, GenerationProgress, HealthStatus, ApiResponse, };
//# sourceMappingURL=types.d.ts.map