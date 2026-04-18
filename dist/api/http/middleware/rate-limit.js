const DEFAULT_RATE_LIMIT_CONFIG = {
    windowMs: 60 * 1000,
    maxRequests: 100,
    skipSuccessfulRequests: false,
    skipPaths: ['/health', '/healthz'],
    message: 'Too many requests, please try again later.',
    includeHeaders: true,
};
export class RateLimitMiddleware {
    config;
    clients = new Map();
    cleanupInterval = null;
    constructor(config = {}) {
        this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
        this.startCleanupInterval();
    }
    middleware(req, res, next) {
        if (this.shouldSkipPath(req.url || '')) {
            next();
            return;
        }
        const key = this.getClientKey(req);
        const now = Date.now();
        let state = this.clients.get(key);
        if (!state || now > state.resetTime) {
            state = {
                remaining: this.config.maxRequests,
                resetTime: now + this.config.windowMs,
                totalRequests: 0,
            };
        }
        if (state.remaining <= 0) {
            this.handleRateLimitExceeded(res, state);
            return;
        }
        state.remaining--;
        state.totalRequests++;
        this.clients.set(key, state);
        if (this.config.includeHeaders) {
            this.setRateLimitHeaders(res, state);
        }
        if (this.config.skipSuccessfulRequests) {
            const originalEnd = res.end.bind(res);
            res.end = ((...args) => {
                if (res.statusCode && res.statusCode < 400) {
                    state.remaining++;
                    this.clients.set(key, state);
                }
                return originalEnd(...args);
            });
        }
        next();
    }
    getClientStatus(key) {
        return this.clients.get(key) || null;
    }
    resetClient(key) {
        this.clients.delete(key);
    }
    resetAll() {
        this.clients.clear();
    }
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clients.clear();
    }
    getStats() {
        const now = Date.now();
        const activeWindows = Array.from(this.clients.values()).filter((s) => s.resetTime > now).length;
        const totalRequests = Array.from(this.clients.values()).reduce((sum, s) => sum + s.totalRequests, 0);
        return {
            totalClients: this.clients.size,
            activeWindows,
            avgRequestsPerClient: this.clients.size > 0 ? totalRequests / this.clients.size : 0,
        };
    }
    handleRateLimitExceeded(res, state) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        if (this.config.includeHeaders) {
            this.setRateLimitHeaders(res, state);
        }
        res.end(JSON.stringify({
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: this.config.message,
                retryAfter: Math.ceil((state.resetTime - Date.now()) / 1000),
            },
        }));
    }
    setRateLimitHeaders(res, state) {
        res.setHeader('X-RateLimit-Limit', String(this.config.maxRequests));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, state.remaining)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(state.resetTime / 1000)));
    }
    getClientKey(req) {
        if (this.config.keyGenerator) {
            return this.config.keyGenerator(req);
        }
        const ip = this.getClientIp(req);
        const userAgent = req.headers['user-agent'] || 'unknown';
        return `${ip}:${userAgent.slice(0, 50)}`;
    }
    getClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        const realIp = req.headers['x-real-ip'];
        if (forwarded) {
            let ip;
            if (Array.isArray(forwarded)) {
                ip = forwarded[0];
            }
            else {
                ip = forwarded.split(',')[0];
            }
            if (ip)
                return ip.trim();
        }
        if (realIp) {
            const ip = Array.isArray(realIp) ? realIp[0] : realIp;
            if (ip)
                return ip;
        }
        return req.socket?.remoteAddress || 'unknown';
    }
    shouldSkipPath(url) {
        const path = url.split('?')[0] || '';
        return this.config.skipPaths.some((pattern) => {
            if (pattern.endsWith('/*')) {
                return path.startsWith(pattern.slice(0, -1));
            }
            return path === pattern;
        });
    }
    startCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, state] of this.clients.entries()) {
                if (now > state.resetTime + this.config.windowMs) {
                    this.clients.delete(key);
                }
            }
        }, 5 * 60 * 1000);
    }
}
export function createRateLimit(config) {
    return new RateLimitMiddleware(config);
}
export const RateLimitPresets = {
    strict: () => ({
        windowMs: 60 * 1000,
        maxRequests: 30,
        message: 'Rate limit exceeded. Please slow down your requests.',
    }),
    lenient: () => ({
        windowMs: 60 * 1000,
        maxRequests: 1000,
    }),
    generation: () => ({
        windowMs: 60 * 1000,
        maxRequests: 10,
        message: 'Generation requests are rate limited. Please wait before generating again.',
    }),
    public: () => ({
        windowMs: 60 * 60 * 1000,
        maxRequests: 100,
        message: 'Public API rate limit exceeded. Consider upgrading your plan.',
    }),
};
export default RateLimitMiddleware;
//# sourceMappingURL=rate-limit.js.map