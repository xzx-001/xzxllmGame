// src/api/http/server.ts
/**
 * @fileoverview HTTP 服务器封装
 * @description 基于 Node.js 原生 http 模块的 REST API 服务器实现
 * @module api/http/server
 * @author xzxllm
 * @license MIT
 */

import http, { IncomingMessage, ServerResponse } from 'http';
import type { XZXLLMGameEngine } from '../../core/engine.js';

import { AuthMiddleware, createAuthMiddleware } from './middleware/auth.js';
import { RateLimitMiddleware, createRateLimit, RateLimitPresets } from './middleware/rate-limit.js';
import { levelRoutes } from './routes/level.routes.js';
import { playerRoutes } from './routes/player.routes.js';
import { feedbackRoutes } from './routes/feedback.routes.js';
import { sendJson, generateRequestId } from './utils.js';

/**
 * HTTP 服务器配置
 */
export interface HTTPServerConfig {
  /** 服务器端口 */
  port: number;
  /** 服务器主机 */
  host?: string;
  /** 是否启用认证 */
  enableAuth?: boolean;
  /** 有效的 API Key 列表 */
  apiKeys?: string[];
  /** 是否启用限流 */
  enableRateLimit?: boolean;
  /** 限流配置 */
  rateLimitConfig?: Parameters<typeof createRateLimit>[0];
  /** 请求体大小限制（字节） */
  maxBodySize?: number;
  /** CORS 配置 */
  cors?: {
    enabled: boolean;
    origins?: string[];
    methods?: string[];
    headers?: string[];
  };
}

/**
 * 路由定义
 */
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;
interface RouteMap {
  [key: string]: RouteHandler;
}

/**
 * 默认服务器配置
 */
const DEFAULT_CONFIG: HTTPServerConfig = {
  port: 3000,
  host: '0.0.0.0',
  enableAuth: true,
  apiKeys: [],
  enableRateLimit: true,
  maxBodySize: 10 * 1024 * 1024, // 10MB
  cors: {
    enabled: true,
    origins: ['*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization', 'X-API-Key'],
  },
};

/**
 * HTTP 服务器类
 */
export class HTTPServer {
  private server: http.Server;
  private config: HTTPServerConfig;
  private engine: XZXLLMGameEngine;
  private authMiddleware: AuthMiddleware;
  private rateLimitMiddleware: RateLimitMiddleware;
  private routes: RouteMap = {};
  private isRunning = false;

  constructor(engine: XZXLLMGameEngine, config: Partial<HTTPServerConfig> = {}) {
    this.engine = engine;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 初始化中间件
    this.authMiddleware = createAuthMiddleware({
      enabled: this.config.enableAuth ?? true,
      validApiKeys: this.config.apiKeys || [],
    });

    this.rateLimitMiddleware = createRateLimit({
      ...RateLimitPresets.lenient(),
      ...this.config.rateLimitConfig,
    });

    // 注册路由
    this.registerRoutes();

    // 创建 HTTP 服务器
    this.server = http.createServer(this.handleRequest.bind(this));

    // 错误处理
    this.server.on('error', this.handleServerError.bind(this));
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
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

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
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

  /**
   * 获取服务器状态
   */
  getStatus(): { isRunning: boolean; port: number; host: string } {
    return {
      isRunning: this.isRunning,
      port: this.config.port,
      host: this.config.host || '0.0.0.0',
    };
  }

  /**
   * 注册自定义路由
   */
  registerRoute(method: string, path: string, handler: RouteHandler): void {
    const key = `${method.toUpperCase()} ${path}`;
    this.routes[key] = handler;
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      // 设置 CORS 头
      this.setCORSHeaders(res);

      // 处理预检请求
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      // 限流检查
      if (this.config.enableRateLimit) {
        const rateLimitResult = await new Promise<boolean>((resolve) => {
          this.rateLimitMiddleware.middleware(req, res, () => resolve(true));
        });
        if (!rateLimitResult) return; // 已被限流中间件处理
      }

      // 认证检查
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

      // 路由匹配
      const routeKey = this.matchRoute(req.method || 'GET', req.url || '/');
      if (routeKey && this.routes[routeKey]) {
        await this.routes[routeKey](req, res, this.engine);
      } else {
        // 404 处理
        sendJson(res, 404, {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Route not found: ${req.method} ${req.url}`,
          },
          meta: { requestId, timestamp: new Date().toISOString(), duration: Date.now() - startTime, version: '1.0.0' },
        });
      }
    } catch (error: any) {
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

  /**
   * 注册所有内置路由
   */
  private registerRoutes(): void {
    // 健康检查（公开路由）
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
      } catch (error: any) {
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

    // 注册关卡路由
    Object.entries(levelRoutes).forEach(([route, handler]) => {
      const parts = route.split(' ');
      const method = parts[0];
      const path = parts.slice(1).join(' ');
      if (path && method) this.registerRoute(method, path, handler);
    });

    // 注册玩家路由
    Object.entries(playerRoutes).forEach(([route, handler]) => {
      const parts = route.split(' ');
      const method = parts[0];
      const path = parts.slice(1).join(' ');
      // 处理通配符路径
      if (path && method) {
        if (path.includes('*')) {
          this.registerWildcardRoute(method, path, handler);
        } else {
          this.registerRoute(method, path, handler);
        }
      }
    });

    // 注册反馈路由
    Object.entries(feedbackRoutes).forEach(([route, handler]) => {
      const parts = route.split(' ');
      const method = parts[0];
      const path = parts.slice(1).join(' ');
      if (path && method) this.registerRoute(method, path, handler);
    });
  }

  /**
   * 注册通配符路由
   */
  private registerWildcardRoute(method: string, pathPattern: string, handler: RouteHandler): void {
    const key = `${method} ${pathPattern}`;
    this.routes[key] = handler;
  }

  /**
   * 匹配路由
   */
  private matchRoute(method: string, url: string): string | null {
    const path = url.split('?')[0] || '';

    // 精确匹配
    const exactKey = `${method} ${path}`;
    if (this.routes[exactKey]) {
      return exactKey;
    }

    // 模式匹配
    for (const key of Object.keys(this.routes)) {
      const parts = key.split(' ');
      const routeMethod = parts[0];
      const routePattern = parts.slice(1).join(' ');
      if (!routeMethod || routeMethod !== method) continue;
      if (!routePattern) continue;

      // 处理通配符
      if (routePattern.includes('*')) {
        const regexPattern = routePattern
          .replace(/\*/g, '([^/]+)')
          .replace(/\//g, '\\/');
        const regex = new RegExp(`^${regexPattern}$`);
        if (regex.test(path)) {
          return key;
        }
      }

      // 处理动态参数 :id
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

  /**
   * 设置 CORS 响应头
   */
  private setCORSHeaders(res: ServerResponse): void {
    if (!this.config.cors?.enabled) return;

    const origins = this.config.cors.origins || ['*'];
    res.setHeader('Access-Control-Allow-Origin', origins.join(', '));
    res.setHeader('Access-Control-Allow-Methods', (this.config.cors.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']).join(', '));
    res.setHeader('Access-Control-Allow-Headers', (this.config.cors.headers || ['Content-Type', 'Authorization']).join(', '));
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  /**
   * 处理服务器错误
   */
  private handleServerError(error: Error): void {
    console.error('[HTTPServer] Server error:', error);
  }
}

/**
 * 发送 JSON 响应
 */


/**
 * 创建 HTTP 服务器的工厂函数
 */
export function createHTTPServer(
  engine: XZXLLMGameEngine,
  config?: Partial<HTTPServerConfig>
): HTTPServer {
  return new HTTPServer(engine, config);
}

export default HTTPServer;
