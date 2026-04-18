import { createHTTPServer } from './http/server.js';
import { createWebSocketHandler } from './websocket/socket-handler.js';
export class APIServer {
    httpServer;
    wsHandler = null;
    config;
    startTime = null;
    isShuttingDown = false;
    constructor(engine, config) {
        this.config = {
            http: config.http || { port: 3000 },
            websocket: config.websocket || { enabled: true },
            gracefulShutdownTimeout: config.gracefulShutdownTimeout || 30000,
        };
        this.httpServer = createHTTPServer(engine, this.config.http);
        if (this.config.websocket.enabled) {
            this.wsHandler = createWebSocketHandler(engine, this.config.websocket.config);
        }
        this.setupGracefulShutdown();
    }
    async start() {
        if (this.isShuttingDown) {
            throw new Error('Server is shutting down');
        }
        await this.httpServer.start();
        this.startTime = Date.now();
        console.log('[APIServer] Server started successfully');
        console.log(`[APIServer] HTTP: http://${this.config.http.host || 'localhost'}:${this.config.http.port || 3000}`);
        if (this.config.websocket.enabled) {
            console.log('[APIServer] WebSocket: ws://' +
                `${this.config.http.host || 'localhost'}:${this.config.http.port || 3000}/ws`);
        }
    }
    async stop() {
        if (this.isShuttingDown) {
            return;
        }
        this.isShuttingDown = true;
        console.log('[APIServer] Shutting down...');
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Shutdown timeout'));
            }, this.config.gracefulShutdownTimeout);
        });
        try {
            await Promise.race([
                this.performShutdown(),
                timeoutPromise,
            ]);
            console.log('[APIServer] Server stopped');
        }
        catch (error) {
            console.error('[APIServer] Shutdown error:', error);
            process.exit(1);
        }
    }
    getStatus() {
        const httpStatus = this.httpServer.getStatus();
        const wsStats = this.wsHandler?.getStats();
        return {
            isRunning: httpStatus.isRunning,
            http: {
                port: httpStatus.port,
                host: httpStatus.host,
            },
            websocket: {
                enabled: this.config.websocket.enabled,
                connections: wsStats?.totalConnections || 0,
                sessions: wsStats?.sessions || [],
            },
            uptime: this.startTime ? Date.now() - this.startTime : 0,
        };
    }
    broadcastProgress(sessionId, progress) {
        if (this.wsHandler) {
            this.wsHandler.broadcastProgress(sessionId, progress);
        }
    }
    broadcastCompletion(sessionId, levelId) {
        if (this.wsHandler) {
            this.wsHandler.broadcastCompletion(sessionId, levelId);
        }
    }
    async performShutdown() {
        if (this.wsHandler) {
            this.wsHandler.dispose();
            this.wsHandler = null;
        }
        await this.httpServer.stop();
    }
    setupGracefulShutdown() {
        process.on('SIGTERM', () => {
            console.log('[APIServer] Received SIGTERM');
            this.stop().then(() => {
                process.exit(0);
            }).catch(() => {
                process.exit(1);
            });
        });
        process.on('SIGINT', () => {
            console.log('[APIServer] Received SIGINT');
            this.stop().then(() => {
                process.exit(0);
            }).catch(() => {
                process.exit(1);
            });
        });
        process.on('uncaughtException', (error) => {
            console.error('[APIServer] Uncaught exception:', error);
            this.stop().catch(() => { });
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('[APIServer] Unhandled rejection at:', promise, 'reason:', reason);
        });
    }
}
export async function createAPIServer(engine, config) {
    const server = new APIServer(engine, config);
    return server;
}
export async function startServer(engine, port = 3000) {
    const server = new APIServer(engine, {
        http: { port },
        websocket: { enabled: true },
    });
    await server.start();
    return server;
}
export default APIServer;
//# sourceMappingURL=server.js.map