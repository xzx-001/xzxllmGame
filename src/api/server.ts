// src/api/server.ts
/**
 * @fileoverview API 服务器主入口
 * @description 整合 HTTP 和 WebSocket 服务，提供统一的 API 层入口
 * @module api/server
 * @author xzxllm
 * @license MIT
 *
 * @example
 * // 创建并启动服务器
 * const server = await createAPIServer(engine, {
 *   http: { port: 3000 },
 *   websocket: { enabled: true }
 * });
 * await server.start();
 */

import type { XZXLLMGameEngine } from '../core/engine.js';
import type { HTTPServerConfig } from './http/server.js';
import type { WebSocketConfig } from './websocket/socket-handler.js';
import { createHTTPServer, HTTPServer } from './http/server.js';
import { createWebSocketHandler, WebSocketHandler } from './websocket/socket-handler.js';

/**
 * API 服务器配置
 */
export interface APIServerConfig {
  /** HTTP 服务器配置 */
  http: Partial<HTTPServerConfig>;
  /** WebSocket 服务器配置 */
  websocket?: {
    enabled: boolean;
    config?: WebSocketConfig;
  };
  /** 优雅关闭超时（毫秒） */
  gracefulShutdownTimeout?: number;
}

/**
 * 服务器状态
 */
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

/**
 * API 服务器主类
 */
export class APIServer {
  private httpServer: HTTPServer;
  private wsHandler: WebSocketHandler | null = null;
  private config: Required<APIServerConfig>;
  private startTime: number | null = null;
  private isShuttingDown = false;

  constructor(engine: XZXLLMGameEngine, config: APIServerConfig) {
    this.config = {
      http: config.http || { port: 3000 },
      websocket: config.websocket || { enabled: true },
      gracefulShutdownTimeout: config.gracefulShutdownTimeout || 30000,
    };

    // 创建 HTTP 服务器
    this.httpServer = createHTTPServer(engine, this.config.http);

    // 创建 WebSocket 处理器（如果启用）
    if (this.config.websocket.enabled) {
      this.wsHandler = createWebSocketHandler(engine, this.config.websocket.config);
    }

    // 设置优雅关闭处理
    this.setupGracefulShutdown();
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Server is shutting down');
    }

    // 启动 HTTP 服务器
    await this.httpServer.start();
    this.startTime = Date.now();

    console.log('[APIServer] Server started successfully');
    console.log(`[APIServer] HTTP: http://${this.config.http.host || 'localhost'}:${this.config.http.port || 3000}`);

    if (this.config.websocket.enabled) {
      console.log('[APIServer] WebSocket: ws://' +
        `${this.config.http.host || 'localhost'}:${this.config.http.port || 3000}/ws`);
    }
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log('[APIServer] Shutting down...');

    // 创建超时 Promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Shutdown timeout'));
      }, this.config.gracefulShutdownTimeout);
    });

    try {
      // 等待服务器关闭或超时
      await Promise.race([
        this.performShutdown(),
        timeoutPromise,
      ]);

      console.log('[APIServer] Server stopped');
    } catch (error) {
      console.error('[APIServer] Shutdown error:', error);
      // 强制退出
      process.exit(1);
    }
  }

  /**
   * 获取服务器状态
   */
  getStatus(): ServerStatus {
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

  /**
   * 广播生成进度到所有订阅的客户端
   */
  broadcastProgress(sessionId: string, progress: any): void {
    if (this.wsHandler) {
      this.wsHandler.broadcastProgress(sessionId, progress);
    }
  }

  /**
   * 广播生成完成消息
   */
  broadcastCompletion(sessionId: string, levelId: string): void {
    if (this.wsHandler) {
      this.wsHandler.broadcastCompletion(sessionId, levelId);
    }
  }

  /**
   * 执行关闭操作
   */
  private async performShutdown(): Promise<void> {
    // 关闭 WebSocket 处理器
    if (this.wsHandler) {
      this.wsHandler.dispose();
      this.wsHandler = null;
    }

    // 关闭 HTTP 服务器
    await this.httpServer.stop();
  }

  /**
   * 设置优雅关闭处理
   */
  private setupGracefulShutdown(): void {
    // 处理 SIGTERM
    process.on('SIGTERM', () => {
      console.log('[APIServer] Received SIGTERM');
      this.stop().then(() => {
        process.exit(0);
      }).catch(() => {
        process.exit(1);
      });
    });

    // 处理 SIGINT
    process.on('SIGINT', () => {
      console.log('[APIServer] Received SIGINT');
      this.stop().then(() => {
        process.exit(0);
      }).catch(() => {
        process.exit(1);
      });
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      console.error('[APIServer] Uncaught exception:', error);
      this.stop().catch(() => {});
    });

    // 处理未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[APIServer] Unhandled rejection at:', promise, 'reason:', reason);
    });
  }
}

/**
 * 创建 API 服务器的工厂函数
 *
 * @param engine xzxllmGame 引擎实例
 * @param config 服务器配置
 * @returns API 服务器实例
 */
export async function createAPIServer(
  engine: XZXLLMGameEngine,
  config: APIServerConfig
): Promise<APIServer> {
  const server = new APIServer(engine, config);
  return server;
}

/**
 * 启动完整服务的快捷函数
 *
 * @param engine xzxllmGame 引擎实例
 * @param port HTTP 端口
 * @returns 运行的服务器实例
 */
export async function startServer(
  engine: XZXLLMGameEngine,
  port = 3000
): Promise<APIServer> {
  const server = new APIServer(engine, {
    http: { port },
    websocket: { enabled: true },
  });

  await server.start();
  return server;
}

export default APIServer;
