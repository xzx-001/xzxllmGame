// src/api/http/middleware/rate-limit.ts
/**
 * @fileoverview 请求限流中间件
 * @description 基于令牌桶算法实现 API 请求限流，防止服务被过度使用
 * @module api/http/middleware/rate-limit
 * @author xzxllm
 * @license MIT
 */

import type { IncomingMessage, ServerResponse } from 'http';

/**
 * 限流配置选项
 */
export interface RateLimitConfig {
  /**
   * 时间窗口大小（毫秒）
   * @default 60000 (1分钟)
   */
  windowMs: number;

  /**
   * 每个时间窗口内的最大请求数
   * @default 100
   */
  maxRequests: number;

  /**
   * 是否跳过成功的请求（2xx/3xx）
   * @default false
   */
  skipSuccessfulRequests?: boolean;

  /**
   * 跳过限流的路径
   * @default ['/health']
   */
  skipPaths?: string[];

  /**
   * 限流触发时的消息
   */
  message?: string;

  /**
   * 是否在响应头中包含限流信息
   * @default true
   */
  includeHeaders?: boolean;

  /**
   * 自定义键生成函数（用于区分不同客户端）
   */
  keyGenerator?: (req: IncomingMessage) => string;
}

/**
 * 客户端限流状态
 *
 * 表示单个客户端在当前时间窗口内的请求状态。
 */
interface ClientRateLimitState {
  /**
   * 剩余请求数
   *
   * 在当前时间窗口内，客户端还可以发出的请求数量。
   * 当此值降至 0 时，后续请求将被拒绝。
   */
  remaining: number;
  /**
   * 窗口重置时间
   *
   * 时间窗口重置的时间戳（毫秒）。
   * 当当前时间超过此值时，客户端状态将被重置。
   */
  resetTime: number;
  /**
   * 总请求数
   *
   * 客户端在当前时间窗口内发出的总请求数（包括被拒绝的请求）。
   * 用于统计和监控。
   */
  totalRequests: number;
}

/**
 * 默认限流配置
 */
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 100,
  skipSuccessfulRequests: false,
  skipPaths: ['/health', '/healthz'],
  message: 'Too many requests, please try again later.',
  includeHeaders: true,
};

/**
 * 限流中间件类
 * 使用内存存储客户端状态（单机部署）
 */
export class RateLimitMiddleware {
  private config: RateLimitConfig;
  private clients: Map<string, ClientRateLimitState> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };

    // 启动定期清理
    this.startCleanupInterval();
  }

  /**
   * Express/Connect 风格的中间件
   *
   * @param req HTTP 请求
   * @param res HTTP 响应
   * @param next 下一个中间件
   */
  middleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void {
    // 检查路径是否跳过限流
    if (this.shouldSkipPath(req.url || '')) {
      next();
      return;
    }

    // 获取客户端标识
    const key = this.getClientKey(req);
    const now = Date.now();

    // 获取或创建客户端状态
    let state = this.clients.get(key);
    if (!state || now > state.resetTime) {
      state = {
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        totalRequests: 0,
      };
    }

    // 检查是否超出限制
    if (state.remaining <= 0) {
      this.handleRateLimitExceeded(res, state);
      return;
    }

    // 更新状态
    state.remaining--;
    state.totalRequests++;
    this.clients.set(key, state);

    // 设置响应头
    if (this.config.includeHeaders) {
      this.setRateLimitHeaders(res, state);
    }

    // 监听响应完成，以便跳过成功请求计数（如果配置）
    if (this.config.skipSuccessfulRequests) {
      const originalEnd = res.end.bind(res);
      res.end = ((...args: any[]) => {
        // 恢复状态（如果请求成功）
        if (res.statusCode && res.statusCode < 400) {
          state!.remaining++;
          this.clients.set(key, state!);
        }
        return originalEnd(...args);
      }) as typeof res.end;
    }

    next();
  }

  /**
   * 获取指定客户端的限流状态
   */
  getClientStatus(key: string): ClientRateLimitState | null {
    return this.clients.get(key) || null;
  }

  /**
   * 重置指定客户端的限流状态
   */
  resetClient(key: string): void {
    this.clients.delete(key);
  }

  /**
   * 重置所有限流状态
   */
  resetAll(): void {
    this.clients.clear();
  }

  /**
   * 销毁中间件，清理资源
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clients.clear();
  }

  /**
   * 获取所有限流统计信息
   */
  getStats(): {
    totalClients: number;
    activeWindows: number;
    avgRequestsPerClient: number;
  } {
    const now = Date.now();
    const activeWindows = Array.from(this.clients.values()).filter(
      (s) => s.resetTime > now
    ).length;

    const totalRequests = Array.from(this.clients.values()).reduce(
      (sum, s) => sum + s.totalRequests,
      0
    );

    return {
      totalClients: this.clients.size,
      activeWindows,
      avgRequestsPerClient:
        this.clients.size > 0 ? totalRequests / this.clients.size : 0,
    };
  }

  /**
   * 处理超出限流的情况
   *
   * 当客户端超出请求限制时调用，返回 429 Too Many Requests 响应。
   * 响应中包含错误信息和重试等待时间。
   *
   * @param res HTTP 响应对象
   * @param state 客户端的当前限流状态
   */
  private handleRateLimitExceeded(
    res: ServerResponse,
    state: ClientRateLimitState
  ): void {
    res.statusCode = 429; // Too Many Requests
    res.setHeader('Content-Type', 'application/json');

    if (this.config.includeHeaders) {
      this.setRateLimitHeaders(res, state);
    }

    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: this.config.message,
          retryAfter: Math.ceil((state.resetTime - Date.now()) / 1000),
        },
      })
    );
  }

  /**
   * 设置限流相关的响应头
   *
   * 根据 RFC 标准设置限流相关的 HTTP 响应头，帮助客户端了解当前限制状态。
   * 设置的响应头包括：
   * - X-RateLimit-Limit: 时间窗口内的最大请求数
   * - X-RateLimit-Remaining: 剩余请求数
   * - X-RateLimit-Reset: 窗口重置时间（Unix 时间戳秒数）
   *
   * @param res HTTP 响应对象
   * @param state 客户端的当前限流状态
   */
  private setRateLimitHeaders(
    res: ServerResponse,
    state: ClientRateLimitState
  ): void {
    res.setHeader('X-RateLimit-Limit', String(this.config.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, state.remaining)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(state.resetTime / 1000)));
  }

  /**
   * 获取客户端标识键
   *
   * 生成用于标识客户端的唯一键，用于区分不同客户端的限流状态。
   * 默认使用客户端 IP 地址和 User-Agent 的组合，也可以使用自定义的 keyGenerator。
   *
   * @param req HTTP 请求对象
   * @returns 客户端标识键字符串
   */
  private getClientKey(req: IncomingMessage): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req);
    }

    // 默认使用 IP + User-Agent 组合
    const ip = this.getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    return `${ip}:${userAgent.slice(0, 50)}`;
  }

  /**
   * 获取客户端 IP 地址
   *
   * 从 HTTP 请求中提取客户端真实 IP 地址，支持代理转发场景。
   * 检查顺序：
   * 1. X-Forwarded-For 头（支持代理链）
   * 2. X-Real-IP 头
   * 3. Socket 远程地址
   *
   * @param req HTTP 请求对象
   * @returns 客户端 IP 地址字符串
   */
  private getClientIp(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];

    if (forwarded) {
      let ip: string | undefined;
      if (Array.isArray(forwarded)) {
        ip = forwarded[0];
      } else {
        ip = forwarded.split(',')[0];
      }
      if (ip) return ip.trim();
    }

    if (realIp) {
      const ip = Array.isArray(realIp) ? realIp[0] : realIp;
      if (ip) return ip;
    }

    return (req as any).socket?.remoteAddress || 'unknown';
  }

  /**
   * 检查路径是否跳过限流
   *
   * 根据配置的 skipPaths 列表检查请求路径是否需要限流。
   * 支持精确匹配和前缀匹配（使用 '/*' 后缀表示前缀匹配）。
   *
   * @param url 请求 URL（包含路径和查询参数）
   * @returns 如果路径跳过限流则返回 true，否则返回 false
   */
  private shouldSkipPath(url: string): boolean {
    const path = url.split('?')[0] || ''; // 移除查询参数
    return this.config.skipPaths!.some((pattern) => {
      if (pattern.endsWith('/*')) {
        return path.startsWith(pattern.slice(0, -1));
      }
      return path === pattern;
    });
  }

  /**
   * 启动定期清理过期状态的定时器
   *
   * 每5分钟运行一次，清理超过重置时间一个窗口周期的客户端状态。
   * 防止内存泄漏，确保不再活跃的客户端状态被及时清理。
   */
  private startCleanupInterval(): void {
    // 每5分钟清理一次过期的客户端状态
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, state] of this.clients.entries()) {
        if (now > state.resetTime + this.config.windowMs) {
          this.clients.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }
}

/**
 * 创建限流中间件的工厂函数
 */
export function createRateLimit(config?: Partial<RateLimitConfig>): RateLimitMiddleware {
  return new RateLimitMiddleware(config);
}

/**
 * 针对不同场景的预设配置
 */
export const RateLimitPresets = {
  /**
   * 严格模式 - 适合高安全性场景
   */
  strict: (): Partial<RateLimitConfig> => ({
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Rate limit exceeded. Please slow down your requests.',
  }),

  /**
   * 宽松模式 - 适合内部服务
   */
  lenient: (): Partial<RateLimitConfig> => ({
    windowMs: 60 * 1000,
    maxRequests: 1000,
  }),

  /**
   * 生成模式 - 考虑到生成可能较慢
   */
  generation: (): Partial<RateLimitConfig> => ({
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Generation requests are rate limited. Please wait before generating again.',
  }),

  /**
   * 公共 API 模式
   */
  public: (): Partial<RateLimitConfig> => ({
    windowMs: 60 * 60 * 1000, // 1小时
    maxRequests: 100,
    message: 'Public API rate limit exceeded. Consider upgrading your plan.',
  }),
};

export default RateLimitMiddleware;
