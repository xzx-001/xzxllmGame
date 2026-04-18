// src/api/http/middleware/auth.ts
/**
 * @fileoverview API 认证中间件
 * @description 处理 API Key 认证和授权验证
 * @module api/http/middleware/auth
 * @author xzxllm
 * @license MIT
 */

import type { IncomingMessage, ServerResponse } from 'http';

/**
 * API Key 配置选项
 */
export interface AuthConfig {
  /**
   * 有效的 API Key 列表
   * 如果为空数组，则允许所有请求（开发模式）
   */
  validApiKeys: string[];

  /**
   * 是否启用认证
   * @default true
   */
  enabled?: boolean;

  /**
   * 豁免的路径（不需要认证）
   * @default ['/health', '/api/public/*']
   */
  exemptPaths?: string[];

  /**
   * 请求头中 API Key 的字段名
   * @default 'x-api-key'
   */
  headerName?: string;

  /**
   * 是否允许查询参数传递 API Key（不推荐生产环境使用）
   * @default false
   */
  allowQueryParam?: boolean;
}

/**
 * 认证结果
 */
export interface AuthResult {
  /** 是否通过认证 */
  success: boolean;
  /** API Key（如果通过认证） */
  apiKey?: string;
  /** 错误信息（如果未通过认证） */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 扩展的请求类型
 */
export interface AuthenticatedRequest extends IncomingMessage {
  /** 认证通过的 API Key */
  apiKey?: string;
  /** 客户端 IP 地址 */
  clientIp?: string;
}

/**
 * 默认认证配置
 */
const DEFAULT_AUTH_CONFIG: AuthConfig = {
  validApiKeys: [],
  enabled: true,
  exemptPaths: ['/health', '/healthz', '/api/public/', '/docs/'],
  headerName: 'x-api-key',
  allowQueryParam: false,
};

/**
 * 认证中间件类
 */
export class AuthMiddleware {
  private config: AuthConfig;

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = { ...DEFAULT_AUTH_CONFIG, ...config };
  }

  /**
   * 处理认证请求
   *
   * @param req HTTP 请求对象
   * @param res HTTP 响应对象
   * @returns 认证结果
   */
  authenticate(
    req: AuthenticatedRequest,
    _res: ServerResponse
  ): AuthResult {
    // 如果认证未启用，直接通过
    if (!this.config.enabled) {
      return { success: true };
    }

    // 检查路径是否在豁免列表中
    const path = req.url || '/';
    if (this.isPathExempt(path)) {
      return { success: true };
    }

    // 提取 API Key
    const apiKey = this.extractApiKey(req);

    if (!apiKey) {
      return {
        success: false,
        error: {
          code: 'AUTH_MISSING_KEY',
          message: `Missing API key. Please provide it in the '${this.config.headerName}' header.`,
        },
      };
    }

    // 验证 API Key
    if (!this.isValidApiKey(apiKey)) {
      return {
        success: false,
        error: {
          code: 'AUTH_INVALID_KEY',
          message: 'Invalid API key provided.',
        },
      };
    }

    // 认证通过
    req.apiKey = apiKey;
    return { success: true, apiKey };
  }

  /**
   * Express/Connect 风格的中间件函数
   *
   * @param req HTTP 请求
   * @param res HTTP 响应
   * @param next 下一个中间件
   */
  middleware(
    req: AuthenticatedRequest,
    res: ServerResponse,
    next: () => void
  ): void {
    const result = this.authenticate(req, res);

    if (!result.success) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: result.error,
        })
      );
      return;
    }

    next();
  }

  /**
   * 从请求中提取 API Key
   */
  private extractApiKey(req: IncomingMessage): string | null {
    const headerName = (this.config.headerName || 'x-api-key').toLowerCase();

    // 从请求头中提取
    const headerKey = req.headers[headerName];
    if (headerKey) {
      const key = Array.isArray(headerKey) ? headerKey[0] : headerKey;
      return key || null;
    }

    // 从查询参数中提取（如果允许）
    if (this.config.allowQueryParam) {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const queryKey = url.searchParams.get('api_key') || url.searchParams.get('apiKey');
      if (queryKey) {
        return queryKey;
      }
    }

    // 从 Authorization 头中提取（Bearer token 格式）
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * 验证 API Key 是否有效
   */
  private isValidApiKey(apiKey: string): boolean {
    // 如果没有配置 API Key，允许所有（开发模式警告）
    if (this.config.validApiKeys.length === 0) {
      console.warn('[AuthMiddleware] No API keys configured, allowing all requests (development mode)');
      return true;
    }

    return this.config.validApiKeys.includes(apiKey);
  }

  /**
   * 检查路径是否豁免认证
   */
  private isPathExempt(path: string): boolean {
    const exemptPaths = this.config.exemptPaths || DEFAULT_AUTH_CONFIG.exemptPaths!;
    return exemptPaths.some((pattern) => {
      if (pattern.endsWith('/*')) {
        return path.startsWith(pattern.slice(0, -1));
      }
      return path === pattern || path.startsWith(pattern);
    });
  }

  /**
   * 添加新的 API Key
   */
  addApiKey(apiKey: string): void {
    if (!this.config.validApiKeys.includes(apiKey)) {
      this.config.validApiKeys.push(apiKey);
    }
  }

  /**
   * 移除 API Key
   */
  removeApiKey(apiKey: string): void {
    const index = this.config.validApiKeys.indexOf(apiKey);
    if (index !== -1) {
      this.config.validApiKeys.splice(index, 1);
    }
  }

  /**
   * 获取客户端 IP 地址
   */
  getClientIp(req: IncomingMessage): string {
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

    // 尝试从 socket 获取
    const socket = (req as any).socket;
    if (socket) {
      return socket.remoteAddress || 'unknown';
    }

    return 'unknown';
  }
}

/**
 * 创建认证中间件的工厂函数
 */
export function createAuthMiddleware(config?: Partial<AuthConfig>): AuthMiddleware {
  return new AuthMiddleware(config);
}

/**
 * 简单的内存 API Key 存储（生产环境应使用数据库）
 */
export class ApiKeyStore {
  private keys: Map<string, { createdAt: Date; metadata?: any }> = new Map();

  /**
   * 生成新的 API Key
   */
  generateKey(metadata?: any): string {
    const key = `xzx_${this.randomString(32)}`;
    this.keys.set(key, {
      createdAt: new Date(),
      metadata,
    });
    return key;
  }

  /**
   * 验证 API Key
   */
  validateKey(key: string): boolean {
    return this.keys.has(key);
  }

  /**
   * 撤销 API Key
   */
  revokeKey(key: string): boolean {
    return this.keys.delete(key);
  }

  /**
   * 获取所有有效的 Key
   */
  getAllKeys(): string[] {
    return Array.from(this.keys.keys());
  }

  /**
   * 生成随机字符串
   */
  private randomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

export default AuthMiddleware;
