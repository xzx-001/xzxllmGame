const DEFAULT_AUTH_CONFIG = {
    validApiKeys: [],
    enabled: true,
    exemptPaths: ['/health', '/healthz', '/api/public/', '/docs/'],
    headerName: 'x-api-key',
    allowQueryParam: false,
};
export class AuthMiddleware {
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_AUTH_CONFIG, ...config };
    }
    authenticate(req, _res) {
        if (!this.config.enabled) {
            return { success: true };
        }
        const path = req.url || '/';
        if (this.isPathExempt(path)) {
            return { success: true };
        }
        const apiKey = this.extractApiKey(req);
        if (!apiKey) {
            return {
                success: false,
                error: {
                    code: 'AUTH_MISSING_KEY',
                    message: `Missing API key. Please provide it in the '${this.config.headerName}' header.`,
                },
            };
        }
        if (!this.isValidApiKey(apiKey)) {
            return {
                success: false,
                error: {
                    code: 'AUTH_INVALID_KEY',
                    message: 'Invalid API key provided.',
                },
            };
        }
        req.apiKey = apiKey;
        return { success: true, apiKey };
    }
    middleware(req, res, next) {
        const result = this.authenticate(req, res);
        if (!result.success) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                success: false,
                error: result.error,
            }));
            return;
        }
        next();
    }
    extractApiKey(req) {
        const headerName = (this.config.headerName || 'x-api-key').toLowerCase();
        const headerKey = req.headers[headerName];
        if (headerKey) {
            const key = Array.isArray(headerKey) ? headerKey[0] : headerKey;
            return key || null;
        }
        if (this.config.allowQueryParam) {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const queryKey = url.searchParams.get('api_key') || url.searchParams.get('apiKey');
            if (queryKey) {
                return queryKey;
            }
        }
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        return null;
    }
    isValidApiKey(apiKey) {
        if (this.config.validApiKeys.length === 0) {
            console.warn('[AuthMiddleware] No API keys configured, allowing all requests (development mode)');
            return true;
        }
        return this.config.validApiKeys.includes(apiKey);
    }
    isPathExempt(path) {
        const exemptPaths = this.config.exemptPaths || DEFAULT_AUTH_CONFIG.exemptPaths;
        return exemptPaths.some((pattern) => {
            if (pattern.endsWith('/*')) {
                return path.startsWith(pattern.slice(0, -1));
            }
            return path === pattern || path.startsWith(pattern);
        });
    }
    addApiKey(apiKey) {
        if (!this.config.validApiKeys.includes(apiKey)) {
            this.config.validApiKeys.push(apiKey);
        }
    }
    removeApiKey(apiKey) {
        const index = this.config.validApiKeys.indexOf(apiKey);
        if (index !== -1) {
            this.config.validApiKeys.splice(index, 1);
        }
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
        const socket = req.socket;
        if (socket) {
            return socket.remoteAddress || 'unknown';
        }
        return 'unknown';
    }
}
export function createAuthMiddleware(config) {
    return new AuthMiddleware(config);
}
export class ApiKeyStore {
    keys = new Map();
    generateKey(metadata) {
        const key = `xzx_${this.randomString(32)}`;
        this.keys.set(key, {
            createdAt: new Date(),
            metadata,
        });
        return key;
    }
    validateKey(key) {
        return this.keys.has(key);
    }
    revokeKey(key) {
        return this.keys.delete(key);
    }
    getAllKeys() {
        return Array.from(this.keys.keys());
    }
    randomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}
export default AuthMiddleware;
//# sourceMappingURL=auth.js.map