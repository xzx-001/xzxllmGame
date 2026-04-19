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
 * HTTP 服务器配置接口
 *
 * 定义 HTTP 服务器的所有可配置选项，用于创建和定制 REST API 服务。
 * 所有字段均为可选，未指定时使用 DEFAULT_CONFIG 中的默认值。
 *
 * @property port - 服务器监听的端口号（必需）
 * @property host - 服务器绑定的主机地址，默认 '0.0.0.0'（监听所有网络接口）
 * @property enableAuth - 是否启用 API Key 认证，默认 true
 * @property apiKeys - 有效的 API Key 字符串数组，用于客户端认证
 * @property enableRateLimit - 是否启用请求频率限制，默认 true
 * @property rateLimitConfig - 限流中间件配置，详见 RateLimitMiddleware 类型
 * @property maxBodySize - 请求体最大字节数限制，默认 10MB
 * @property cors - CORS（跨源资源共享）配置
 * @property cors.enabled - 是否启用 CORS，默认 true
 * @property cors.origins - 允许的来源域名列表，默认 ['*']（允许所有）
 * @property cors.methods - 允许的 HTTP 方法列表，默认 ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
 * @property cors.headers - 允许的请求头列表，默认 ['Content-Type', 'Authorization', 'X-API-Key']
 *
 * @example
 * const config: HTTPServerConfig = {
 *   port: 8080,
 *   host: 'localhost',
 *   enableAuth: true,
 *   apiKeys: ['secret-key-1', 'secret-key-2'],
 *   cors: { enabled: true, origins: ['https://game.example.com'] }
 * };
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
 * 路由处理器类型定义
 *
 * HTTP 路由的标准处理器签名，接收请求、响应和引擎实例，返回 Promise<void>。
 *
 * @param req - Node.js HTTP 请求对象
 * @param res - Node.js HTTP 响应对象
 * @param engine - 游戏引擎实例，用于执行业务逻辑
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @see RouteHandler 在 level.routes.ts、player.routes.ts 等文件中的具体实现
 */
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;

/**
 * 路由映射表接口
 *
 * 定义路由路径到处理器的映射关系表。
 * 键格式：`'HTTP方法 路径模式'`（如 `'GET /api/health'`）
 * 值：对应的 RouteHandler 函数
 *
 * **路径模式语法：**
 * - 固定路径：`'GET /api/health'`
 * - 通配符路径：`'GET /api/players/*/profile'`
 * - 动态参数路径（暂未实现）：`'GET /api/players/:id'`
 */
interface RouteMap {
  [key: string]: RouteHandler;
}

/**
 * 默认服务器配置常量
 *
 * HTTP 服务器的默认配置选项，当用户未提供相应配置时使用。
 * 此配置适用于开发环境，生产环境应根据需要调整安全设置。
 *
 * **配置详情：**
 * - `port: 3000` - 默认端口，可在命令行或配置中覆盖
 * - `host: '0.0.0.0'` - 监听所有网络接口，允许外部访问
 * - `enableAuth: true` - 默认启用认证，建议生产环境保持启用
 * - `apiKeys: []` - 默认无有效 API Key，需通过配置或环境变量添加
 * - `enableRateLimit: true` - 默认启用限流，防止 API 滥用
 * - `maxBodySize: 10MB` - 默认请求体大小限制，可防止大文件攻击
 * - `cors` - 默认 CORS 配置：
 *   - `enabled: true` - 启用跨域支持
 *   - `origins: ['*']` - 允许所有来源（开发环境），生产环境应限制
 *   - `methods` - 允许所有常用 HTTP 方法
 *   - `headers` - 允许常用请求头
 *
 * @see HTTPServerConfig 了解各字段的详细说明
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
 *
 * 基于 Node.js 原生 http 模块实现的 REST API 服务器，提供完整的游戏内容生成 API。
 * 支持路由分发、中间件处理、CORS、认证、限流等现代 Web 服务器功能。
 *
 * **核心特性：**
 * - 完整的 REST API 路由系统，支持通配符和动态路由
 * - 模块化中间件支持（认证、限流等）
 * - 可配置的 CORS 跨域支持
 * - 内置健康检查、请求追踪和错误处理
 * - 线程安全的请求处理，支持并发访问
 *
 * **生命周期管理：**
 * 1. 创建实例：`new HTTPServer(engine, config)`
 * 2. 启动服务：`await server.start()`
 * 3. 处理请求：自动路由到对应的处理器
 * 4. 停止服务：`await server.stop()`
 *
 * @property server - Node.js HTTP 服务器实例
 * @property config - 服务器配置（合并后的最终配置）
 * @property engine - 游戏引擎实例，用于执行业务逻辑
 * @property authMiddleware - 认证中间件实例
 * @property rateLimitMiddleware - 限流中间件实例
 * @property routes - 路由映射表，存储所有注册的路由
 * @property isRunning - 服务器运行状态标志
 *
 * @example
 * const engine = createEngine({ llm: { provider: 'ollama' } });
 * const server = new HTTPServer(engine, { port: 8080 });
 * await server.start();
 * console.log(`Server running at http://localhost:8080`);
 *
 * @see HTTPServerConfig 了解配置选项
 * @see createHTTPServer() 了解工厂函数用法
 */
export class HTTPServer {
  private server: http.Server;
  private config: HTTPServerConfig;
  private engine: XZXLLMGameEngine;
  private authMiddleware: AuthMiddleware;
  private rateLimitMiddleware: RateLimitMiddleware;
  private routes: RouteMap = {};
  private isRunning = false;

  /**
   * 构造函数，创建 HTTP 服务器实例
   *
   * 初始化服务器配置、中间件、路由表和底层 HTTP 服务器。
   * 调用顺序：合并配置 → 初始化中间件 → 注册路由 → 创建服务器实例 → 绑定错误处理。
   *
   * @param engine - 游戏引擎实例，用于路由处理器执行业务逻辑
   * @param config - 部分服务器配置，会与默认配置合并
   *
   * @throws 如果配置无效或初始化过程中出错，构造函数不会直接抛出异常，
   *         但启动时可能因端口占用等问题失败。
   *
   * @example
   * const engine = createEngine({ llm: { provider: 'ollama' } });
   * const server = new HTTPServer(engine, {
   *   port: 8080,
   *   apiKeys: ['my-secret-key']
   * });
   */
  constructor(engine: XZXLLMGameEngine, config: Partial<HTTPServerConfig> = {}) {
    this.engine = engine;
    // 合并用户配置和默认配置，用户配置优先
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 初始化认证中间件
    this.authMiddleware = createAuthMiddleware({
      enabled: this.config.enableAuth ?? true,
      validApiKeys: this.config.apiKeys || [],
    });

    // 初始化限流中间件，使用宽松预设并合并用户配置
    this.rateLimitMiddleware = createRateLimit({
      ...RateLimitPresets.lenient(),
      ...this.config.rateLimitConfig,
    });

    // 注册内置路由（健康检查、关卡、玩家、反馈等）
    this.registerRoutes();

    // 创建底层 HTTP 服务器，绑定请求处理函数
    this.server = http.createServer(this.handleRequest.bind(this));

    // 绑定服务器级错误处理
    this.server.on('error', this.handleServerError.bind(this));
  }

  /**
   * 启动服务器，开始监听网络请求
   *
   * 将底层 HTTP 服务器绑定到配置的端口和主机，开始接收客户端连接。
   * 如果服务器已在运行，则打印警告并立即返回（幂等操作）。
   *
   * **网络绑定过程：**
   * 1. 检查运行状态，避免重复启动
   * 2. 调用 Node.js `server.listen()` 绑定端口
   * 3. 设置运行状态标志
   * 4. 打印启动成功日志
   *
   * @returns Promise<void> 启动完成后解决的 Promise
   * @throws 如果端口被占用、无权限或网络错误，Promise 将被拒绝
   *
   * @example
   * try {
   *   await server.start();
   *   console.log('Server started successfully');
   * } catch (error) {
   *   console.error('Failed to start server:', error);
   * }
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
   * 停止服务器，释放网络资源
   *
   * 优雅地停止 HTTP 服务器，不再接受新连接，但会处理完已建立的连接。
   * 如果服务器未运行，则立即返回（幂等操作）。
   *
   * **停止过程：**
   * 1. 检查运行状态，如果未运行则直接返回
   * 2. 调用 Node.js `server.close()` 停止监听
   * 3. 等待所有连接处理完成
   * 4. 重置运行状态标志
   * 5. 打印停止成功日志
   *
   * @returns Promise<void> 停止完成后解决的 Promise
   * @throws 如果关闭过程中出错（如仍有活动连接无法关闭），Promise 将被拒绝
   *
   * @example
   * await server.stop();
   * console.log('Server stopped gracefully');
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
   * 获取服务器当前状态信息
   *
   * 返回服务器的运行状态、监听端口和主机地址。
   * 用于监控、健康检查或 CLI 工具显示状态信息。
   *
   * @returns 状态对象，包含：
   *   - `isRunning: boolean` - 服务器是否正在运行
   *   - `port: number` - 当前监听的端口号
   *   - `host: string` - 当前绑定的主机地址
   *
   * @example
   * const status = server.getStatus();
   * console.log(`Server is ${status.isRunning ? 'running' : 'stopped'}`);
   * console.log(`Listening on ${status.host}:${status.port}`);
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
   *
   * 允许用户代码在运行时添加自定义 API 路由，扩展服务器功能。
   * 路由键格式：`'HTTP方法 路径'`（如 `'POST /api/custom'`）
   * 支持覆盖已有的路由定义（后注册的优先级高）。
   *
   * @param method - HTTP 方法（如 'GET', 'POST', 'PUT', 'DELETE'），不区分大小写
   * @param path - 路由路径（如 '/api/custom'），支持固定路径，不支持通配符
   * @param handler - 路由处理器函数，接收请求、响应和引擎实例
   *
   * @example
   * server.registerRoute('POST', '/api/custom', async (req, res, engine) => {
   *   const data = await parseBody(req);
   *   // 处理自定义逻辑
   *   sendJson(res, 200, { success: true, data });
   * });
   *
   * @see registerWildcardRoute() 了解通配符路由注册
   */
  registerRoute(method: string, path: string, handler: RouteHandler): void {
    const key = `${method.toUpperCase()} ${path}`;
    this.routes[key] = handler;
  }

  /**
   * 处理 HTTP 请求（核心方法）
   *
   * 每个客户端请求都会进入此方法，按照以下流程处理：
   * 1. 设置 CORS 响应头（如果启用）
   * 2. 处理 OPTIONS 预检请求
   * 3. 应用限流中间件（如果启用）
   * 4. 应用认证中间件（如果启用）
   * 5. 路由匹配，调用对应的处理器
   * 6. 处理未匹配路由（404）
   * 7. 捕获并处理所有未捕获的异常
   *
   * **请求处理流程详细说明：**
   * - 时间追踪：记录请求开始时间，计算处理耗时
   * - 请求 ID：为每个请求生成唯一标识，便于日志追踪
   * - 错误处理：所有异常都会被捕获并返回标准错误响应
   * - 中间件：认证和限流中间件可能提前结束请求
   * - 路由匹配：支持固定路径、通配符和动态参数
   *
   * @param req - Node.js HTTP 请求对象
   * @param res - Node.js HTTP 响应对象
   * @returns Promise<void> 请求处理完成后返回的 Promise
   *
   * @see matchRoute() 了解路由匹配机制
   * @see setCORSHeaders() 了解 CORS 设置
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
   *
   * 在服务器初始化时自动调用，注册系统默认的路由配置。
   * 注册顺序：健康检查路由 → 关卡路由 → 玩家路由 → 反馈路由。
   *
   * **内置路由类别：**
   * 1. 健康检查 (`GET /health`) - 公开访问，无需认证
   * 2. 关卡路由 - 来自 `levelRoutes` 对象的所有路由
   * 3. 玩家路由 - 来自 `playerRoutes` 对象的所有路由（含通配符）
   * 4. 反馈路由 - 来自 `feedbackRoutes` 对象的所有路由
   *
   * **通配符路由处理：**
   * 玩家路由包含通配符路径（如 `GET /api/players/*/profile`），
   * 这些路由通过 `registerWildcardRoute()` 特殊处理。
   *
   * @see levelRoutes 在 level.routes.ts 中定义
   * @see playerRoutes 在 player.routes.ts 中定义
   * @see feedbackRoutes 在 feedback.routes.ts 中定义
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
   *
   * 注册包含星号 (*) 通配符的路由模式，用于匹配动态路径段。
   * 通配符路由在路由匹配时具有较低的优先级，仅在精确匹配失败后尝试。
   *
   * **通配符语法：**
   * - `GET /api/players/*/profile` - 匹配任意玩家 ID
   * - `GET /api/players/*/stats` - 匹配任意玩家 ID
   * - 一个路径中只能有一个通配符段
   *
   * **匹配原理：**
   * 通配符在匹配时被转换为正则表达式，如 `GET /api/players/*/profile`
   * 转换为 `/^GET \/api\/players\/([^/]+)\/profile$/`。
   *
   * @param method - HTTP 方法（如 'GET', 'POST'）
   * @param pathPattern - 包含通配符的路径模式
   * @param handler - 路由处理器函数
   *
   * @example
   * // 注册通配符路由
   * this.registerWildcardRoute('GET', '/api/players/*/profile', getPlayerProfile);
   * // 匹配：GET /api/players/player_001/profile
   * // 匹配：GET /api/players/player_abc/profile
   * // 不匹配：GET /api/players/player_001/profile/extra
   *
   * @see matchRoute() 了解通配符匹配的实现
   */
  private registerWildcardRoute(method: string, pathPattern: string, handler: RouteHandler): void {
    const key = `${method} ${pathPattern}`;
    this.routes[key] = handler;
  }

  /**
   * 匹配路由，根据请求方法和路径查找对应的路由键
   *
   * 路由匹配按照优先级顺序进行：
   * 1. 精确匹配：完全匹配 `method + path`
   * 2. 通配符匹配：路径中包含星号 (*) 的路由
   * 3. 动态参数匹配：路径中包含冒号 (:param) 的路由（预留功能）
   *
   * **匹配算法：**
   * 1. 提取路径部分（去除查询参数）
   * 2. 尝试精确匹配
   * 3. 遍历所有路由键，依次尝试：
   *    - 通配符模式：将 `*` 转换为正则表达式 `([^/]+)`
   *    - 动态参数模式：将 `:id` 转换为正则表达式 `([^/]+)`
   * 4. 返回第一个匹配的路由键，无匹配时返回 null
   *
   * **性能考虑：**
   * - 路由表通常较小（<100 条），线性搜索可接受
   * - 精确匹配优先，避免不必要的正则计算
   * - 路径预处理减少重复计算
   *
   * @param method - HTTP 请求方法（如 'GET'）
   * @param url - 完整的请求 URL（包含查询参数）
   * @returns 匹配的路由键（如 `'GET /api/health'`），无匹配时返回 null
   *
   * @example
   * // 路由表包含：
   * // 'GET /api/health' → healthHandler
   * // 'GET /api/players/*/profile' → playerProfileHandler
   *
   * matchRoute('GET', '/api/health') // → 'GET /api/health'
   * matchRoute('GET', '/api/players/p123/profile') // → 'GET /api/players/*/profile'
   * matchRoute('GET', '/api/unknown') // → null
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
   * 设置 CORS（跨源资源共享）响应头
   *
   * 根据服务器配置设置适当的 CORS 头，允许浏览器跨域访问 API。
   * 此方法在每个请求处理开始时调用，包括 OPTIONS 预检请求。
   *
   * **设置的响应头：**
   * - `Access-Control-Allow-Origin` - 允许的来源（可配置）
   * - `Access-Control-Allow-Methods` - 允许的 HTTP 方法（可配置）
   * - `Access-Control-Allow-Headers` - 允许的请求头（可配置）
   * - `Access-Control-Max-Age` - 预检请求缓存时间（固定 24 小时）
   *
   * **安全建议：**
   * - 开发环境：可使用 `'*'` 允许所有来源
   * - 生产环境：应限制为具体的域名列表
   * - 敏感操作：结合认证机制确保安全性
   *
   * @param res - HTTP 响应对象，用于设置响应头
   *
   * @example
   * // 配置示例
   * cors: {
   *   enabled: true,
   *   origins: ['https://game.example.com', 'https://admin.example.com'],
   *   methods: ['GET', 'POST'],
   *   headers: ['Content-Type', 'Authorization']
   * }
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
   * 处理服务器级错误
   *
   * 捕获底层 HTTP 服务器发生的错误，如端口冲突、网络异常等。
   * 此方法绑定为服务器的 'error' 事件处理器，用于日志记录和错误恢复。
   *
   * **典型错误场景：**
   * - `EADDRINUSE` - 端口已被占用
   * - `EACCES` - 无权限绑定端口（如 <1024 端口）
   * - `ECONNRESET` - 连接意外重置
   * - 网络接口故障
   *
   * **处理策略：**
   * - 当前实现仅记录错误日志
   * - 生产环境可能需要更复杂的错误恢复机制
   * - 可扩展为发送警报或尝试重启
   *
   * @param error - Node.js 错误对象，包含错误信息和堆栈跟踪
   *
   * @example
   * // 典型错误日志
   * [HTTPServer] Server error: Error: listen EADDRINUSE: address already in use :::3000
   */
  private handleServerError(error: Error): void {
    console.error('[HTTPServer] Server error:', error);
  }
}

/**
 * 创建 HTTP 服务器的工厂函数
 *
 * 提供便捷的方式来创建和配置 HTTP 服务器实例，隐藏构造函数细节。
 * 推荐使用此工厂函数而非直接调用 `new HTTPServer()`。
 *
 * **使用场景：**
 * - CLI 工具需要快速启动服务器
 * - 测试环境需要临时服务器实例
 * - 应用程序集成 xzxllmGame 作为服务
 *
 * @param engine - 游戏引擎实例，用于路由处理器执行业务逻辑
 * @param config - 可选的部分服务器配置，会与默认配置合并
 * @returns 配置好的 HTTPServer 实例，需要调用 `start()` 启动
 *
 * @example
 * const engine = createEngine({ llm: { provider: 'ollama' } });
 * const server = createHTTPServer(engine, { port: 8080 });
 * await server.start();
 * // 服务器现在运行在 http://localhost:8080
 *
 * @see HTTPServer 类了解服务器方法和配置选项
 * @see createEngine() 了解如何创建游戏引擎实例
 */
export function createHTTPServer(
  engine: XZXLLMGameEngine,
  config?: Partial<HTTPServerConfig>
): HTTPServer {
  return new HTTPServer(engine, config);
}

export default HTTPServer;
