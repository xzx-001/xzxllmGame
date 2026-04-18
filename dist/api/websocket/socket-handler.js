export class WebSocketHandler {
    clients = new Map();
    config;
    heartbeatTimer = null;
    messageSequence = 0;
    constructor(_engine, config = {}) {
        this.config = {
            heartbeatInterval: config.heartbeatInterval || 30000,
            connectionTimeout: config.connectionTimeout || 60000,
            maxConnections: config.maxConnections || 1000,
            requireAuth: config.requireAuth ?? false,
        };
        this.startHeartbeat();
    }
    handleConnection(socket, _request) {
        if (this.clients.size >= this.config.maxConnections) {
            socket.close(1013, 'Maximum connections reached');
            return;
        }
        const clientId = this.generateClientId();
        const client = {
            id: clientId,
            socket,
            connectedAt: new Date(),
            lastPingAt: Date.now(),
            isAuthenticated: !this.config.requireAuth,
        };
        this.clients.set(clientId, client);
        console.log(`[WebSocket] Client connected: ${clientId}, total: ${this.clients.size}`);
        socket.onmessage = (event) => this.handleMessage(clientId, event.data);
        socket.onclose = () => this.handleDisconnect(clientId);
        socket.onerror = (error) => this.handleError(clientId, error);
        this.sendToClient(clientId, {
            type: 'complete',
            sessionId: '',
            payload: {
                clientId,
                message: 'Connected to xzxllmGame WebSocket server',
            },
            timestamp: new Date().toISOString(),
            sequence: this.getNextSequence(),
        });
    }
    broadcastProgress(sessionId, progress) {
        const message = {
            type: 'progress',
            sessionId,
            payload: progress,
            timestamp: new Date().toISOString(),
            sequence: this.getNextSequence(),
        };
        for (const [clientId, client] of this.clients.entries()) {
            if (client.sessionId === sessionId) {
                this.sendToClient(clientId, message);
            }
        }
    }
    broadcastCompletion(sessionId, levelId) {
        const message = {
            type: 'complete',
            sessionId,
            payload: {
                levelId,
                message: 'Level generation completed',
            },
            timestamp: new Date().toISOString(),
            sequence: this.getNextSequence(),
        };
        for (const [clientId, client] of this.clients.entries()) {
            if (client.sessionId === sessionId) {
                this.sendToClient(clientId, message);
            }
        }
    }
    broadcastError(sessionId, error) {
        const message = {
            type: 'error',
            sessionId,
            payload: error,
            timestamp: new Date().toISOString(),
            sequence: this.getNextSequence(),
        };
        for (const [clientId, client] of this.clients.entries()) {
            if (client.sessionId === sessionId) {
                this.sendToClient(clientId, message);
            }
        }
    }
    getStats() {
        const sessions = new Set();
        let authenticated = 0;
        for (const client of this.clients.values()) {
            if (client.sessionId) {
                sessions.add(client.sessionId);
            }
            if (client.isAuthenticated) {
                authenticated++;
            }
        }
        return {
            totalConnections: this.clients.size,
            authenticatedConnections: authenticated,
            sessions: Array.from(sessions),
        };
    }
    disconnectSession(sessionId) {
        for (const [clientId, client] of this.clients.entries()) {
            if (client.sessionId === sessionId) {
                client.socket.close(1000, 'Session ended');
                this.clients.delete(clientId);
            }
        }
    }
    dispose() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        for (const [clientId, client] of this.clients.entries()) {
            try {
                client.socket.close(1001, 'Server shutting down');
            }
            catch (error) {
                console.warn(`[WebSocket] Error closing client ${clientId}:`, error);
            }
        }
        this.clients.clear();
        console.log('[WebSocket] Handler disposed');
    }
    handleMessage(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        try {
            if (typeof data !== 'string') {
                console.warn(`[WebSocket] Received non-text message from ${clientId}`);
                return;
            }
            const message = JSON.parse(data);
            switch (message.type) {
                case 'ping':
                    client.lastPingAt = Date.now();
                    this.sendToClient(clientId, {
                        type: 'pong',
                        sessionId: client.sessionId || '',
                        payload: { timestamp: Date.now() },
                        timestamp: new Date().toISOString(),
                        sequence: this.getNextSequence(),
                    });
                    break;
                case 'subscribe':
                    if (message.sessionId) {
                        client.sessionId = message.sessionId;
                        this.sendToClient(clientId, {
                            type: 'subscribe',
                            sessionId: message.sessionId,
                            payload: { success: true, message: 'Subscribed to session' },
                            timestamp: new Date().toISOString(),
                            sequence: this.getNextSequence(),
                        });
                    }
                    break;
                case 'unsubscribe':
                    delete client.sessionId;
                    this.sendToClient(clientId, {
                        type: 'complete',
                        sessionId: message.sessionId || '',
                        payload: { success: true, message: 'Unsubscribed from session' },
                        timestamp: new Date().toISOString(),
                        sequence: this.getNextSequence(),
                    });
                    break;
                default:
                    console.log(`[WebSocket] Unknown message type from ${clientId}:`, message.type);
            }
        }
        catch (error) {
            console.error(`[WebSocket] Error handling message from ${clientId}:`, error);
            this.sendToClient(clientId, {
                type: 'error',
                sessionId: client.sessionId || '',
                payload: { code: 'INVALID_MESSAGE', message: 'Failed to parse message' },
                timestamp: new Date().toISOString(),
                sequence: this.getNextSequence(),
            });
        }
    }
    handleDisconnect(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            console.log(`[WebSocket] Client disconnected: ${clientId}`);
            this.clients.delete(clientId);
        }
    }
    handleError(clientId, error) {
        console.error(`[WebSocket] Error from client ${clientId}:`, error);
    }
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        try {
            if (client.socket.readyState === WebSocket.OPEN) {
                client.socket.send(JSON.stringify(message));
            }
        }
        catch (error) {
            console.error(`[WebSocket] Error sending to client ${clientId}:`, error);
        }
    }
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();
            const timeout = this.config.connectionTimeout;
            for (const [clientId, client] of this.clients.entries()) {
                if (now - client.lastPingAt > timeout) {
                    console.log(`[WebSocket] Client ${clientId} timed out`);
                    client.socket.close(1001, 'Connection timeout');
                    this.clients.delete(clientId);
                    continue;
                }
                this.sendToClient(clientId, {
                    type: 'ping',
                    sessionId: client.sessionId || '',
                    payload: {},
                    timestamp: new Date().toISOString(),
                    sequence: this.getNextSequence(),
                });
            }
        }, this.config.heartbeatInterval);
    }
    generateClientId() {
        return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getNextSequence() {
        return ++this.messageSequence;
    }
}
export function createWebSocketHandler(engine, config) {
    return new WebSocketHandler(engine, config);
}
export default WebSocketHandler;
//# sourceMappingURL=socket-handler.js.map