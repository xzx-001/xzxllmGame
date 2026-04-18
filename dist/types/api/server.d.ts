import type { XZXLLMGameEngine } from '../core/engine.js';
import type { HTTPServerConfig } from './http/server.js';
import type { WebSocketConfig } from './websocket/socket-handler.js';
export interface APIServerConfig {
    http: Partial<HTTPServerConfig>;
    websocket?: {
        enabled: boolean;
        config?: WebSocketConfig;
    };
    gracefulShutdownTimeout?: number;
}
export interface ServerStatus {
    isRunning: boolean;
    http: {
        port: number;
        host: string;
    };
    websocket: {
        enabled: boolean;
        connections: number;
        sessions: string[];
    };
    uptime: number;
}
export declare class APIServer {
    private httpServer;
    private wsHandler;
    private config;
    private startTime;
    private isShuttingDown;
    constructor(engine: XZXLLMGameEngine, config: APIServerConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    getStatus(): ServerStatus;
    broadcastProgress(sessionId: string, progress: any): void;
    broadcastCompletion(sessionId: string, levelId: string): void;
    private performShutdown;
    private setupGracefulShutdown;
}
export declare function createAPIServer(engine: XZXLLMGameEngine, config: APIServerConfig): Promise<APIServer>;
export declare function startServer(engine: XZXLLMGameEngine, port?: number): Promise<APIServer>;
export default APIServer;
//# sourceMappingURL=server.d.ts.map