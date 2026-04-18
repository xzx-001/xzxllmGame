// src/api/http/utils.ts
/**
 * @fileoverview HTTP API 工具函数
 * @description 提供路由处理常用的请求解析、响应发送和参数提取工具
 * @module api/http/utils
 * @author xzxllm
 * @license MIT
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { ApiResponse } from '../../core/interfaces/api.types.js';

/**
 * 解析 JSON 请求体
 *
 * 从可读流中读取数据并解析为 JSON 对象。
 * 支持可选的请求体大小限制，超过限制时抛出错误。
 *
 * @param req HTTP 请求对象
 * @param maxSize 最大允许体大小（字节），默认 10MB
 * @returns 解析后的 JSON 对象
 * @throws 当请求体超过大小限制或 JSON 解析失败时
 *
 * @example
 * const body = await parseBody(req, 1024 * 1024); // 限制 1MB
 */
export async function parseBody(req: IncomingMessage, maxSize = 10 * 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk: Buffer | string) => {
      size += Buffer.byteLength(chunk);
      if (size > maxSize) {
        reject(new Error(`Request body exceeds maximum size of ${maxSize} bytes`));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * 发送 JSON 响应
 *
 * 统一封装 JSON 响应格式，自动补充 meta 中的时间戳和版本信息。
 *
 * @param res HTTP 响应对象
 * @param statusCode HTTP 状态码
 * @param data API 响应数据
 *
 * @example
 * sendJson(res, 200, { success: true, data: level });
 */
export function sendJson<T>(res: ServerResponse, statusCode: number, data: ApiResponse<T>): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      ...data,
      meta: {
        ...data.meta,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    }),
  );
}

/**
 * 从 URL 路径中提取路由参数
 *
 * 根据路由模式（如 `/api/players/:id/profile`）从实际 URL 中提取参数值。
 *
 * @param urlPath URL 路径（不含查询参数）
 * @param routePattern 路由模式，动态段使用 `:paramName`
 * @returns 参数名到值的映射，如果 URL 不匹配则返回 null
 *
 * @example
 * const params = extractRouteParams('/api/players/p123/profile', '/api/players/:id/profile');
 * // params = { id: 'p123' }
 */
export function extractRouteParams(
  urlPath: string,
  routePattern: string,
): Record<string, string> | null {
  const patternParts = routePattern.split('/');
  const urlParts = urlPath.split('/');

  if (patternParts.length !== urlParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];
    const urlPart = urlParts[i];
    if (!part || !urlPart) {
      return null;
    }
    if (part.startsWith(':')) {
      const paramName = part.slice(1);
      params[paramName] = decodeURIComponent(urlPart);
    } else if (part !== urlPart) {
      return null;
    }
  }

  return params;
}

/**
 * 从 URL 中提取特定路径段
 *
 * 用于通配符路由中按索引或关键字提取路径段。
 *
 * @param urlPath URL 路径（不含查询参数）
 * @param keyword 用于定位的关键字段（如 'players'）
 * @param offset 关键字后的偏移量（默认 1，即关键字后的下一段）
 * @returns 提取的路径段，找不到则返回 null
 *
 * @example
 * const playerId = extractPathSegment('/api/players/p123/profile', 'players');
 * // playerId = 'p123'
 */
export function extractPathSegment(
  urlPath: string,
  keyword: string,
  offset = 1,
): string | null {
  const parts = urlPath.split('/').filter(Boolean);
  const index = parts.indexOf(keyword);
  if (index === -1 || index + offset >= parts.length) {
    return null;
  }
  const segment = parts[index + offset];
  if (!segment) {
    return null;
  }
  return decodeURIComponent(segment);
}

/**
 * 解析查询参数为对象
 *
 * @param req HTTP 请求对象
 * @returns 查询参数键值对
 */
export function parseQueryParams(req: IncomingMessage): Record<string, string> {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * 生成请求 ID
 *
 * 基于时间戳和随机数生成唯一请求标识。
 *
 * @returns 请求 ID 字符串
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 安全的 JSON 序列化
 *
 * 处理循环引用和大数字，确保 JSON 序列化不会抛出异常。
 *
 * @param value 要序列化的值
 * @returns JSON 字符串
 */
export function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        return '[Circular Reference]';
      }
      seen.add(val);
    }
    if (typeof val === 'bigint') {
      return val.toString();
    }
    return val;
  });
}
