import type { IncomingMessage } from 'http';
import type { XZXLLMGameEngine } from '../../core/engine.js';
import type { GenerationProgress } from '../../core/interfaces/api.types.js';
export interface WebSocketConfig {
    heartbeatInterval?: number;
    connectionTimeout?: number;
    maxConnections?: number;
    requireAuth?: boolean;
}
export declare class WebSocketHandler {
    private clients;
    private config;
    private heartbeatTimer;
    private messageSequence;
    constructor(_engine: XZXLLMGameEngine, config?: WebSocketConfig);
    handleConnection(socket: WebSocket, _request: IncomingMessage): void;
    broadcastProgress(sessionId: string, progress: GenerationProgress): void;
    broadcastCompletion(sessionId: string, levelId: string): void;
    broadcastError(sessionId: string, error: {
        code: string;
        message: string;
    }): void;
    getStats(): {
        totalConnections: number;
        authenticatedConnections: number;
        sessions: string[];
    };
    disconnectSession(sessionId: string): void;
    dispose(): void;
    private handleMessage;
    private handleDisconnect;
    private handleError;
    private sendToClient;
    private startHeartbeat;
    private generateClientId;
    private getNextSequence;
}
export declare function createWebSocketHandler(engine: XZXLLMGameEngine, config?: WebSocketConfig): WebSocketHandler;
export default WebSocketHandler;
//# sourceMappingURL=socket-handler.d.ts.map