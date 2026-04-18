// src/api/websocket/socket-handler.ts
/**
 * @fileoverview WebSocket 处理器
 * @description 处理实时连接，支持生成进度推送和双向通信
 * @module api/websocket/socket-handler
 * @author xzxllm
 * @license MIT
 */

import type { IncomingMessage } from 'http';
import type { XZXLLMGameEngine } from '../../core/engine.js';
import type { WebSocketMessage, GenerationProgress } from '../../core/interfaces/api.types.js';

/**
 * WebSocket 客户端连接
 */
interface WebSocketClient {
  /** 连接 ID */
  id: string;
  /** WebSocket 实例 */
  socket: WebSocket;
  /** 关联的会话 ID */
  sessionId?: string;
  /** 连接时间 */
  connectedAt: Date;
  /** 最后 ping 时间 */
  lastPingAt: number;
  /** 是否已认证 */
  isAuthenticated: boolean;
}

/**
 * WebSocket 处理器配置
 */
export interface WebSocketConfig {
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number;
  /** 连接超时（毫秒） */
  connectionTimeout?: number;
  /** 最大连接数 */
  maxConnections?: number;
  /** 是否要求认证 */
  requireAuth?: boolean;
}

/**
 * WebSocket 处理器类
 * 管理 WebSocket 连接，处理实时消息推送
 */
export class WebSocketHandler {
  private clients: Map<string, WebSocketClient> = new Map();
  private config: Required<WebSocketConfig>;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageSequence = 0;

  constructor(_engine: XZXLLMGameEngine, config: WebSocketConfig = {}) {
    this.config = {
      heartbeatInterval: config.heartbeatInterval || 30000, // 30秒
      connectionTimeout: config.connectionTimeout || 60000, // 60秒
      maxConnections: config.maxConnections || 1000,
      requireAuth: config.requireAuth ?? false,
    };

    this.startHeartbeat();
  }

  /**
   * 处理新的 WebSocket 连接
   *
   * @param socket WebSocket 实例
   * @param request HTTP 升级请求
   */
  handleConnection(socket: WebSocket, _request: IncomingMessage): void {
    // 检查最大连接数
    if (this.clients.size >= this.config.maxConnections) {
      socket.close(1013, 'Maximum connections reached'); // Try Again Later
      return;
    }

    const clientId = this.generateClientId();
    const client: WebSocketClient = {
      id: clientId,
      socket,
      connectedAt: new Date(),
      lastPingAt: Date.now(),
      isAuthenticated: !this.config.requireAuth,
    };

    this.clients.set(clientId, client);
    console.log(`[WebSocket] Client connected: ${clientId}, total: ${this.clients.size}`);

    // 绑定事件处理器
    socket.onmessage = (event) => this.handleMessage(clientId, event.data);
    socket.onclose = () => this.handleDisconnect(clientId);
    socket.onerror = (error) => this.handleError(clientId, error);

    // 发送欢迎消息
    this.sendToClient(clientId, {
      type: 'complete',
      sessionId: '',
      payload: {
        clientId,
        message: 'Connected to xzxllmGame WebSocket server',
      },
      timestamp: new Date().toISOString(),
      sequence: this.getNextSequence(),
    } as WebSocketMessage);
  }

  /**
   * 向指定会话广播生成进度
   *
   * @param sessionId 会话 ID
   * @param progress 进度信息
   */
  broadcastProgress(sessionId: string, progress: GenerationProgress): void {
    const message: WebSocketMessage<GenerationProgress> = {
      type: 'progress',
      sessionId,
      payload: progress,
      timestamp: new Date().toISOString(),
      sequence: this.getNextSequence(),
    };

    // 发送给订阅了该会话的所有客户端
    for (const [clientId, client] of this.clients.entries()) {
      if (client.sessionId === sessionId) {
        this.sendToClient(clientId, message);
      }
    }
  }

  /**
   * 广播生成完成消息
   *
   * @param sessionId 会话 ID
   * @param levelId 关卡 ID
   */
  broadcastCompletion(sessionId: string, levelId: string): void {
    const message: WebSocketMessage = {
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

  /**
   * 广播错误消息
   *
   * @param sessionId 会话 ID
   * @param error 错误信息
   */
  broadcastError(sessionId: string, error: { code: string; message: string }): void {
    const message: WebSocketMessage = {
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

  /**
   * 获取活跃连接统计
   */
  getStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    sessions: string[];
  } {
    const sessions = new Set<string>();
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

  /**
   * 断开指定会话的所有连接
   */
  disconnectSession(sessionId: string): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.sessionId === sessionId) {
        client.socket.close(1000, 'Session ended');
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * 关闭所有连接并清理资源
   */
  dispose(): void {
    // 停止心跳
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // 关闭所有连接
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.socket.close(1001, 'Server shutting down'); // Going Away
      } catch (error) {
        console.warn(`[WebSocket] Error closing client ${clientId}:`, error);
      }
    }

    this.clients.clear();
    console.log('[WebSocket] Handler disposed');
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(clientId: string, data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // 只处理文本消息
      if (typeof data !== 'string') {
        console.warn(`[WebSocket] Received non-text message from ${clientId}`);
        return;
      }

      const message = JSON.parse(data) as WebSocketMessage;

      switch (message.type) {
        case 'ping':
          // 更新最后 ping 时间
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
          // 订阅会话更新
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

        case 'unsubscribe' as any:
          // 取消订阅
          delete client.sessionId;
          this.sendToClient(clientId, {
            type: 'complete',
            sessionId: message.sessionId || '',
            payload: { success: true, message: 'Unsubscribed from session' },
            timestamp: new Date().toISOString(),
            sequence: this.getNextSequence(),
          } as WebSocketMessage);
          break;

        default:
          console.log(`[WebSocket] Unknown message type from ${clientId}:`, message.type);
      }
    } catch (error) {
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

  /**
   * 处理连接断开
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(`[WebSocket] Client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    }
  }

  /**
   * 处理连接错误
   */
  private handleError(clientId: string, error: Event): void {
    console.error(`[WebSocket] Error from client ${clientId}:`, error);
    // 错误通常会导致连接关闭，所以这里不需要额外处理
  }

  /**
   * 发送消息给指定客户端
   */
  private sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error(`[WebSocket] Error sending to client ${clientId}:`, error);
    }
  }

  /**
   * 启动心跳检查
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeout = this.config.connectionTimeout;

      for (const [clientId, client] of this.clients.entries()) {
        // 检查超时
        if (now - client.lastPingAt > timeout) {
          console.log(`[WebSocket] Client ${clientId} timed out`);
          client.socket.close(1001, 'Connection timeout');
          this.clients.delete(clientId);
          continue;
        }

        // 发送 ping
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

  /**
   * 生成唯一的客户端 ID
   */
  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取下一个消息序列号
   */
  private getNextSequence(): number {
    return ++this.messageSequence;
  }
}

/**
 * 创建 WebSocket 处理器的工厂函数
 */
export function createWebSocketHandler(
  engine: XZXLLMGameEngine,
  config?: WebSocketConfig
): WebSocketHandler {
  return new WebSocketHandler(engine, config);
}

export default WebSocketHandler;
