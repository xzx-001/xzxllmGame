import type { IncomingMessage, ServerResponse } from 'http';
export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests?: boolean;
    skipPaths?: string[];
    message?: string;
    includeHeaders?: boolean;
    keyGenerator?: (req: IncomingMessage) => string;
}
interface ClientRateLimitState {
    remaining: number;
    resetTime: number;
    totalRequests: number;
}
export declare class RateLimitMiddleware {
    private config;
    private clients;
    private cleanupInterval;
    constructor(config?: Partial<RateLimitConfig>);
    middleware(req: IncomingMessage, res: ServerResponse, next: () => void): void;
    getClientStatus(key: string): ClientRateLimitState | null;
    resetClient(key: string): void;
    resetAll(): void;
    destroy(): void;
    getStats(): {
        totalClients: number;
        activeWindows: number;
        avgRequestsPerClient: number;
    };
    private handleRateLimitExceeded;
    private setRateLimitHeaders;
    private getClientKey;
    private getClientIp;
    private shouldSkipPath;
    private startCleanupInterval;
}
export declare function createRateLimit(config?: Partial<RateLimitConfig>): RateLimitMiddleware;
export declare const RateLimitPresets: {
    strict: () => Partial<RateLimitConfig>;
    lenient: () => Partial<RateLimitConfig>;
    generation: () => Partial<RateLimitConfig>;
    public: () => Partial<RateLimitConfig>;
};
export default RateLimitMiddleware;
//# sourceMappingURL=rate-limit.d.ts.map