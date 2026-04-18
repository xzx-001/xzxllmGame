import { SDKEvent, WebSocketState } from './types.js';
export class GameClientSDK {
    config;
    currentSession = null;
    ws = null;
    reconnectTimer = null;
    eventListeners = new Map();
    cache = new Map();
    CACHE_TTL = 5 * 60 * 1000;
    stats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        cacheStats: { hits: 0, misses: 0, hitRate: 0, size: 0 },
        activeSessions: 0,
    };
    responseTimes = [];
    generationStatus = {
        isGenerating: false,
        progress: 0,
        currentStage: 'idle',
    };
    constructor(config) {
        this.config = {
            apiEndpoint: config.apiEndpoint.replace(/\/$/, ''),
            apiKey: config.apiKey || '',
            timeout: config.timeout || 30000,
            retryAttempts: config.retryAttempts || 3,
            reconnectInterval: config.reconnectInterval || 5000,
            enablePregeneration: config.enablePregeneration ?? true,
            debug: config.debug || false,
            logLevel: config.logLevel || 'info',
        };
        this.log('info', 'GameClientSDK initialized');
    }
    async initialize() {
        this.log('info', 'Initializing SDK...');
        try {
            const health = await this.healthCheck();
            if (health.status === 'unhealthy') {
                throw new Error('Service is unhealthy');
            }
            await this.connectWebSocket();
            this.emit(SDKEvent.CONNECTED, { timestamp: new Date().toISOString() });
            this.log('info', 'SDK initialized successfully');
        }
        catch (error) {
            this.log('error', 'SDK initialization failed:', error.message);
            throw error;
        }
    }
    async requestLevel(playerId, sessionId, options = {}) {
        this.ensureInitialized();
        if (!this.currentSession || this.currentSession.sessionId !== sessionId) {
            this.currentSession = {
                playerId,
                sessionId,
                startTime: new Date().toISOString(),
                currentLevelIndex: 0,
                totalPlayTime: 0,
            };
            this.stats.activeSessions++;
        }
        this.generationStatus = {
            isGenerating: true,
            progress: 0,
            currentStage: 'initializing',
        };
        this.emit(SDKEvent.GENERATION_STARTED, { playerId, sessionId });
        try {
            const response = await this.request({
                method: 'POST',
                path: '/api/levels',
                data: {
                    playerId,
                    sessionId,
                    difficulty: options.difficulty,
                    gameTypes: options.gameTypes,
                    theme: options.theme,
                    immediate: options.immediate ?? true,
                    triggerEvent: options.triggerEvent,
                    customContext: options.customContext,
                },
                timeout: 120000,
            });
            this.currentSession.currentLevelIndex++;
            this.generationStatus.isGenerating = false;
            this.generationStatus.progress = 100;
            this.emit(SDKEvent.LEVEL_READY, response);
            return response;
        }
        catch (error) {
            this.generationStatus.isGenerating = false;
            throw error;
        }
    }
    async getBufferedLevel(sessionId) {
        this.ensureInitialized();
        try {
            const response = await this.request({
                method: 'GET',
                path: `/api/levels/buffered`,
                params: { sessionId },
            });
            if (response) {
                this.emit(SDKEvent.LEVEL_READY, response);
            }
            return response;
        }
        catch (error) {
            this.log('warn', 'Failed to get buffered level:', error.message);
            return null;
        }
    }
    async submitLevelResult(result) {
        this.ensureInitialized();
        if (!this.currentSession) {
            throw new Error('No active session. Call requestLevel() first.');
        }
        try {
            await this.request({
                method: 'POST',
                path: '/api/feedback',
                data: {
                    sessionId: this.currentSession.sessionId,
                    ...result,
                },
            });
            this.currentSession.totalPlayTime += result.completionTime;
            this.log('info', 'Level result submitted successfully');
            return true;
        }
        catch (error) {
            this.log('error', 'Failed to submit level result:', error.message);
            return false;
        }
    }
    async getPlayerProfile(playerId) {
        this.ensureInitialized();
        const targetPlayerId = playerId || this.currentSession?.playerId;
        if (!targetPlayerId) {
            throw new Error('Player ID required');
        }
        try {
            const profile = await this.request({
                method: 'GET',
                path: `/api/players/${targetPlayerId}/profile`,
            });
            this.emit(SDKEvent.PROFILE_UPDATED, profile);
            return profile;
        }
        catch (error) {
            this.log('warn', 'Failed to get player profile:', error.message);
            return null;
        }
    }
    async updatePlayerProfile(updates, playerId) {
        this.ensureInitialized();
        const targetPlayerId = playerId || this.currentSession?.playerId;
        if (!targetPlayerId) {
            throw new Error('Player ID required');
        }
        await this.request({
            method: 'PUT',
            path: `/api/players/${targetPlayerId}/profile`,
            data: updates,
        });
        this.log('info', 'Player profile updated');
    }
    async getPlayerHistory(playerId, limit = 20) {
        this.ensureInitialized();
        const targetPlayerId = playerId || this.currentSession?.playerId;
        if (!targetPlayerId) {
            throw new Error('Player ID required');
        }
        return await this.request({
            method: 'GET',
            path: `/api/players/${targetPlayerId}/history`,
            params: { limit },
        });
    }
    async healthCheck() {
        return await this.request({
            method: 'GET',
            path: '/health',
            skipCache: true,
        });
    }
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        const listeners = this.eventListeners.get(event);
        listeners.add(callback);
        return () => {
            listeners.delete(callback);
        };
    }
    off(event, callback) {
        if (!callback) {
            this.eventListeners.delete(event);
            return;
        }
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(callback);
        }
    }
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach((callback) => {
                try {
                    callback(data);
                }
                catch (error) {
                    this.log('error', 'Event listener error:', error);
                }
            });
        }
    }
    async connectWebSocket() {
        if (this.ws?.readyState === WebSocketState.OPEN) {
            return;
        }
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = this.config.apiEndpoint.replace(/^http/, 'ws');
                this.ws = new WebSocket(`${wsUrl}/ws`);
                this.ws.onopen = () => {
                    this.log('info', 'WebSocket connected');
                    resolve();
                };
                this.ws.onmessage = (event) => {
                    this.handleWebSocketMessage(event.data);
                };
                this.ws.onclose = () => {
                    this.log('warn', 'WebSocket disconnected');
                    this.emit(SDKEvent.DISCONNECTED, {});
                    this.scheduleReconnect();
                };
                this.ws.onerror = (error) => {
                    this.log('error', 'WebSocket error:', error);
                    this.emit(SDKEvent.ERROR, { type: 'websocket', error });
                    reject(error);
                };
            }
            catch (error) {
                reject(error);
            }
        });
    }
    handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);
            switch (message.type) {
                case 'progress':
                    this.generationStatus = {
                        isGenerating: true,
                        progress: message.payload.percent,
                        currentStage: message.payload.stage,
                        estimatedTimeRemaining: message.payload.estimatedTimeRemaining,
                    };
                    this.emit(SDKEvent.GENERATION_PROGRESS, message.payload);
                    break;
                case 'complete':
                    this.generationStatus.isGenerating = false;
                    this.generationStatus.progress = 100;
                    break;
                case 'error':
                    this.generationStatus.isGenerating = false;
                    this.emit(SDKEvent.ERROR, {
                        type: 'generation',
                        message: message.payload,
                    });
                    break;
                default:
                    this.log('debug', 'Unknown WebSocket message type:', message.type);
            }
        }
        catch (error) {
            this.log('error', 'Failed to parse WebSocket message:', error);
        }
    }
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(() => {
            this.log('info', 'Attempting to reconnect WebSocket...');
            this.connectWebSocket().catch((error) => {
                this.log('error', 'Reconnection failed:', error);
            });
        }, this.config.reconnectInterval);
    }
    subscribeToSession(sessionId) {
        if (this.ws?.readyState === WebSocketState.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                sessionId,
            }));
        }
    }
    async request(config) {
        const startTime = Date.now();
        this.stats.totalRequests++;
        const { method = 'GET', path, data, params, headers = {}, skipCache } = config;
        let url = `${this.config.apiEndpoint}${path}`;
        if (params) {
            const queryParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                queryParams.append(key, String(value));
            });
            url += `?${queryParams.toString()}`;
        }
        const cacheKey = `${method}:${url}:${JSON.stringify(data || {})}`;
        if (method === 'GET' && !skipCache) {
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                this.stats.cacheStats.hits++;
                this.updateCacheStats();
                return cached.data;
            }
        }
        this.stats.cacheStats.misses++;
        const requestHeaders = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...headers,
        };
        if (this.config.apiKey) {
            requestHeaders['X-API-Key'] = this.config.apiKey;
        }
        let lastError = null;
        for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
            try {
                const response = await fetch(url, {
                    method,
                    headers: requestHeaders,
                    body: data ? JSON.stringify(data) : null,
                    signal: AbortSignal.timeout(config.timeout || this.config.timeout),
                });
                const responseTime = Date.now() - startTime;
                this.recordResponseTime(responseTime);
                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorBody}`);
                }
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.error?.message || 'Request failed');
                }
                this.stats.successfulRequests++;
                if (method === 'GET' && !skipCache && result.data !== undefined) {
                    this.cache.set(cacheKey, {
                        data: result.data,
                        timestamp: Date.now(),
                    });
                    this.stats.cacheStats.size = this.cache.size;
                }
                return result.data;
            }
            catch (error) {
                lastError = error;
                if (error.name === 'AbortError') {
                    throw new Error(`Request timeout after ${this.config.timeout}ms`);
                }
                if (attempt < this.config.retryAttempts - 1) {
                    const delay = Math.pow(2, attempt) * 1000;
                    this.log('warn', `Request failed, retrying in ${delay}ms...`);
                    await this.sleep(delay);
                }
            }
        }
        this.stats.failedRequests++;
        throw lastError || new Error('Request failed after retries');
    }
    getGenerationStatus() {
        return { ...this.generationStatus };
    }
    getStats() {
        return { ...this.stats };
    }
    clearCache() {
        this.cache.clear();
        this.stats.cacheStats.size = 0;
        this.log('info', 'Cache cleared');
    }
    getCurrentSession() {
        return this.currentSession ? { ...this.currentSession } : null;
    }
    async dispose() {
        this.log('info', 'Disposing SDK...');
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.cache.clear();
        this.eventListeners.clear();
        this.stats.activeSessions = 0;
        this.log('info', 'SDK disposed');
    }
    recordResponseTime(time) {
        this.responseTimes.push(time);
        if (this.responseTimes.length > 100) {
            this.responseTimes.shift();
        }
        const sum = this.responseTimes.reduce((a, b) => a + b, 0);
        this.stats.averageResponseTime = Math.round(sum / this.responseTimes.length);
    }
    updateCacheStats() {
        const total = this.stats.cacheStats.hits + this.stats.cacheStats.misses;
        this.stats.cacheStats.hitRate = total > 0 ? this.stats.cacheStats.hits / total : 0;
    }
    log(level, ...args) {
        if (!this.config.debug && level === 'debug')
            return;
        const levels = ['debug', 'info', 'warn', 'error'];
        const configLevelIndex = levels.indexOf(this.config.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        if (messageLevelIndex < configLevelIndex)
            return;
        const prefix = `[GameClientSDK][${level.toUpperCase()}]`;
        console.log(prefix, ...args);
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    ensureInitialized() {
        if (!this.currentSession && this.stats.activeSessions === 0) {
        }
    }
}
export function createSDK(config) {
    return new GameClientSDK(config);
}
export default GameClientSDK;
//# sourceMappingURL=game-client-sdk.js.map