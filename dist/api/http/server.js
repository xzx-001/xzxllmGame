import http from 'http';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimit, RateLimitPresets } from './middleware/rate-limit.js';
import { levelRoutes } from './routes/level.routes.js';
import { playerRoutes } from './routes/player.routes.js';
import { feedbackRoutes } from './routes/feedback.routes.js';
import { sendJson, generateRequestId } from './utils.js';
const DEFAULT_CONFIG = {
    port: 3000,
    host: '0.0.0.0',
    enableAuth: true,
    apiKeys: [],
    enableRateLimit: true,
    maxBodySize: 10 * 1024 * 1024,
    cors: {
        enabled: true,
        origins: ['*'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'X-API-Key'],
    },
};
export class HTTPServer {
    server;
    config;
    engine;
    authMiddleware;
    rateLimitMiddleware;
    routes = {};
    isRunning = false;
    constructor(engine, config = {}) {
        this.engine = engine;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.authMiddleware = createAuthMiddleware({
            enabled: this.config.enableAuth ?? true,
            validApiKeys: this.config.apiKeys || [],
        });
        this.rateLimitMiddleware = createRateLimit({
            ...RateLimitPresets.lenient(),
            ...this.config.rateLimitConfig,
        });
        this.registerRoutes();
        this.server = http.createServer(this.handleRequest.bind(this));
        this.server.on('error', this.handleServerError.bind(this));
    }
    async start() {
        if (this.isRunning) {
            console.warn('[HTTPServer] Server is already running');
            return;
        }
        return new Promise((resolve, reject) => {
            this.server.listen(this.config.port, this.config.host, () => {
                this.isRunning = true;
                console.log(`[HTTPServer] Server running at http://${this.config.host}:${this.config.port}`);
                resolve();
            });
            this.server.once('error', reject);
        });
    }
    async stop() {
        if (!this.isRunning) {
            return;
        }
        return new Promise((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.isRunning = false;
                console.log('[HTTPServer] Server stopped');
                resolve();
            });
        });
    }
    getStatus() {
        return {
            isRunning: this.isRunning,
            port: this.config.port,
            host: this.config.host || '0.0.0.0',
        };
    }
    registerRoute(method, path, handler) {
        const key = `${method.toUpperCase()} ${path}`;
        this.routes[key] = handler;
    }
    async handleRequest(req, res) {
        const startTime = Date.now();
        const requestId = generateRequestId();
        try {
            this.setCORSHeaders(res);
            if (req.method === 'OPTIONS') {
                res.statusCode = 204;
                res.end();
                return;
            }
            if (this.config.enableRateLimit) {
                const rateLimitResult = await new Promise((resolve) => {
                    this.rateLimitMiddleware.middleware(req, res, () => resolve(true));
                });
                if (!rateLimitResult)
                    return;
            }
            if (this.config.enableAuth) {
                const authResult = this.authMiddleware.authenticate(req, res);
                if (!authResult.success) {
                    sendJson(res, 401, {
                        success: false,
                        error: authResult.error || { code: 'AUTH_FAILED', message: 'Authentication failed' },
                        meta: { requestId, timestamp: new Date().toISOString(), duration: Date.now() - startTime, version: '1.0.0' },
                    });
                    return;
                }
            }
            const routeKey = this.matchRoute(req.method || 'GET', req.url || '/');
            if (routeKey && this.routes[routeKey]) {
                await this.routes[routeKey](req, res, this.engine);
            }
            else {
                sendJson(res, 404, {
                    success: false,
                    error: {
                        code: 'NOT_FOUND',
                        message: `Route not found: ${req.method} ${req.url}`,
                    },
                    meta: { requestId, timestamp: new Date().toISOString(), duration: Date.now() - startTime, version: '1.0.0' },
                });
            }
        }
        catch (error) {
            console.error('[HTTPServer] Request handling error:', error);
            sendJson(res, 500, {
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Internal server error',
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                },
                meta: { requestId, timestamp: new Date().toISOString(), duration: Date.now() - startTime, version: '1.0.0' },
            });
        }
    }
    registerRoutes() {
        this.registerRoute('GET', '/health', async (_req, res, engine) => {
            const startTime = Date.now();
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            try {
                const health = await engine.healthCheck();
                sendJson(res, 200, {
                    success: true,
                    data: {
                        status: health.status,
                        components: health.components,
                        version: '1.0.0',
                        timestamp: new Date().toISOString(),
                    },
                    meta: { requestId, timestamp: new Date().toISOString(), duration: Date.now() - startTime, version: '1.0.0' },
                });
            }
            catch (error) {
                sendJson(res, 503, {
                    success: false,
                    error: {
                        code: 'SERVICE_UNAVAILABLE',
                        message: 'Health check failed',
                    },
                    meta: { requestId, timestamp: new Date().toISOString(), duration: Date.now() - startTime, version: '1.0.0' },
                });
            }
        });
        Object.entries(levelRoutes).forEach(([route, handler]) => {
            const parts = route.split(' ');
            const method = parts[0];
            const path = parts.slice(1).join(' ');
            if (path && method)
                this.registerRoute(method, path, handler);
        });
        Object.entries(playerRoutes).forEach(([route, handler]) => {
            const parts = route.split(' ');
            const method = parts[0];
            const path = parts.slice(1).join(' ');
            if (path && method) {
                if (path.includes('*')) {
                    this.registerWildcardRoute(method, path, handler);
                }
                else {
                    this.registerRoute(method, path, handler);
                }
            }
        });
        Object.entries(feedbackRoutes).forEach(([route, handler]) => {
            const parts = route.split(' ');
            const method = parts[0];
            const path = parts.slice(1).join(' ');
            if (path && method)
                this.registerRoute(method, path, handler);
        });
    }
    registerWildcardRoute(method, pathPattern, handler) {
        const key = `${method} ${pathPattern}`;
        this.routes[key] = handler;
    }
    matchRoute(method, url) {
        const path = url.split('?')[0] || '';
        const exactKey = `${method} ${path}`;
        if (this.routes[exactKey]) {
            return exactKey;
        }
        for (const key of Object.keys(this.routes)) {
            const parts = key.split(' ');
            const routeMethod = parts[0];
            const routePattern = parts.slice(1).join(' ');
            if (!routeMethod || routeMethod !== method)
                continue;
            if (!routePattern)
                continue;
            if (routePattern.includes('*')) {
                const regexPattern = routePattern
                    .replace(/\*/g, '([^/]+)')
                    .replace(/\//g, '\\/');
                const regex = new RegExp(`^${regexPattern}$`);
                if (regex.test(path)) {
                    return key;
                }
            }
            if (routePattern.includes(':')) {
                const regexPattern = routePattern
                    .replace(/:\w+/g, '([^/]+)')
                    .replace(/\//g, '\\/');
                const regex = new RegExp(`^${regexPattern}$`);
                if (regex.test(path)) {
                    return key;
                }
            }
        }
        return null;
    }
    setCORSHeaders(res) {
        if (!this.config.cors?.enabled)
            return;
        const origins = this.config.cors.origins || ['*'];
        res.setHeader('Access-Control-Allow-Origin', origins.join(', '));
        res.setHeader('Access-Control-Allow-Methods', (this.config.cors.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']).join(', '));
        res.setHeader('Access-Control-Allow-Headers', (this.config.cors.headers || ['Content-Type', 'Authorization']).join(', '));
        res.setHeader('Access-Control-Max-Age', '86400');
    }
    handleServerError(error) {
        console.error('[HTTPServer] Server error:', error);
    }
}
export function createHTTPServer(engine, config) {
    return new HTTPServer(engine, config);
}
export default HTTPServer;
//# sourceMappingURL=server.js.map