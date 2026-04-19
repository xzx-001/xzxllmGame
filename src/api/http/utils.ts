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
 * 从 HTTP 请求的可读流中读取数据，解析为 JavaScript 对象。
 * 支持请求体大小限制，防止恶意的大请求攻击。
 *
 * **实现细节：**
 * - 使用 Promise 封装异步流读取
 * - 实时统计读取字节数，超过限制立即中止
 * - 自动处理 Buffer 和字符串 chunk 类型
 * - 空请求体返回空对象 `{}`
 *
 * **错误处理：**
 * - 超过大小限制：抛出 `Error`，消息包含最大限制值
 * - JSON 解析失败：抛出 `Error`，消息为 'Invalid JSON body'
 * - 请求流错误：传播底层错误
 *
 * @param req - HTTP 请求对象（Node.js IncomingMessage）
 * @param maxSize - 最大允许请求体大小（字节），默认 10MB
 * @returns Promise<any> 解析后的 JSON 对象
 * @throws 当请求体超过大小限制或 JSON 解析失败时
 *
 * @example
 * // 使用默认大小限制
 * const body = await parseBody(req);
 *
 * @example
 * // 自定义大小限制
 * const body = await parseBody(req, 5 * 1024 * 1024); // 5MB
 *
 * @example
 * // 错误处理
 * try {
 *   const body = await parseBody(req);
 * } catch (error) {
 *   if (error.message.includes('exceeds maximum size')) {
 *     // 处理过大请求
 *   } else if (error.message === 'Invalid JSON body') {
 *     // 处理无效 JSON
 *   }
 * }
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
 * 统一封装 JSON 响应格式，确保所有 API 响应遵循相同的结构。
 * 自动补充 meta 字段中的时间戳和版本信息，简化路由处理器代码。
 *
 * **响应结构：**
 * ```typescript
 * {
 *   success: boolean,      // 操作是否成功
 *   data?: T,             // 成功时的数据（可选）
 *   error?: ApiError,     // 失败时的错误信息（可选）
 *   meta: {               // 元信息（自动补充）
 *     requestId: string,  // 请求 ID
 *     timestamp: string,  // ISO 格式时间戳
 *     duration: number,   // 处理耗时（毫秒）
 *     version: string     // API 版本（固定 '1.0.0'）
 *   }
 * }
 * ```
 *
 * **自动补充字段：**
 * - `meta.timestamp` - 当前时间（ISO 字符串）
 * - `meta.version` - 固定为 '1.0.0'
 * - 保留调用方提供的其他 meta 字段
 *
 * @param res - HTTP 响应对象，用于发送响应
 * @param statusCode - HTTP 状态码（如 200, 400, 500）
 * @param data - API 响应数据对象，必须符合 ApiResponse<T> 类型
 * @typeParam T - 响应数据的类型参数
 *
 * @example
 * // 成功响应
 * sendJson(res, 200, {
 *   success: true,
 *   data: level,
 *   meta: { requestId: 'req_123', duration: 150 }
 * });
 *
 * @example
 * // 错误响应
 * sendJson(res, 400, {
 *   success: false,
 *   error: { code: 'INVALID_PARAMS', message: 'Missing playerId' },
 *   meta: { requestId: 'req_456', duration: 10 }
 * });
 *
 * @see ApiResponse 类型定义在 api.types.ts 中
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
 * 根据 Express 风格的路由模式（包含 `:paramName` 动态段）从实际 URL 中提取参数值。
 * 支持简单的路径参数提取，用于 RESTful API 的动态路由处理。
 *
 * **路由模式语法：**
 * - 固定段：`api`, `players` - 必须精确匹配
 * - 动态段：`:id`, `:sessionId` - 匹配任意非斜杠字符
 * - 不支持可选段、通配符或正则表达式
 *
 * **匹配规则：**
 * 1. 路径分段数量必须相等
 * 2. 对应位置的段必须匹配（固定段相等，动态段捕获值）
 * 3. URL 编码的段会自动解码
 * 4. 第一个不匹配即返回 null
 *
 * @param urlPath - URL 路径（不含查询参数），如 `/api/players/p123/profile`
 * @param routePattern - 路由模式，如 `/api/players/:id/profile`
 * @returns 参数名到值的映射，如 `{ id: 'p123' }`，如果 URL 不匹配则返回 null
 *
 * @example
 * // 基本用法
 * const params = extractRouteParams('/api/players/p123/profile', '/api/players/:id/profile');
 * // params = { id: 'p123' }
 *
 * @example
 * // 多个参数
 * const params = extractRouteParams(
 *   '/api/sessions/s123/players/p456',
 *   '/api/sessions/:sessionId/players/:playerId'
 * );
 * // params = { sessionId: 's123', playerId: 'p456' }
 *
 * @example
 * // URL 编码处理
 * const params = extractRouteParams('/api/players/user%20123', '/api/players/:id');
 * // params = { id: 'user 123' } (自动解码)
 *
 * @example
 * // 不匹配的情况
 * const params = extractRouteParams('/api/players/p123', '/api/games/:id');
 * // params = null (路径前缀不匹配)
 *
 * @see extractPathSegment() 了解更简单的路径段提取方法
 * @see matchRoute() 在 server.ts 中了解完整的路由匹配实现
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
 * 基于关键字定位法从 URL 路径中提取特定的段值，常用于通配符路由。
 * 此方法比 `extractRouteParams()` 更简单，适用于固定结构的路径模式。
 *
 * **工作原理：**
 * 1. 将 URL 路径按 `/` 分割为段数组
 * 2. 查找关键字在数组中的索引位置
 * 3. 根据偏移量（默认 +1）获取目标段
 * 4. 对目标段进行 URL 解码
 *
 * **使用场景：**
 * - 通配符路由：`/api/players/*/profile` 中提取玩家 ID
 * - 固定结构：`/api/sessions/{sessionId}/players/{playerId}`
 * - 快速提取：不需要完整路由模式匹配时
 *
 * @param urlPath - URL 路径（不含查询参数），如 `/api/players/p123/profile`
 * @param keyword - 用于定位的关键字段（如 `'players'`），必须在路径中存在
 * @param offset - 关键字后的偏移量，默认 1（即关键字后的下一段）
 * @returns 提取的路径段（已解码），找不到则返回 null
 *
 * @example
 * // 基本用法：提取玩家 ID
 * const playerId = extractPathSegment('/api/players/p123/profile', 'players');
 * // playerId = 'p123'
 *
 * @example
 * // 使用偏移量：提取玩家 ID（当路径结构不同时）
 * const playerId = extractPathSegment('/api/game/players/p123/data', 'players');
 * // playerId = 'p123'
 *
 * @example
 * // 提取会话 ID（偏移量 2）
 * const sessionId = extractPathSegment('/api/sessions/s123/players/p456', 'sessions', 1);
 * // sessionId = 's123'
 *
 * @example
 * // 提取玩家 ID（偏移量 3）
 * const playerId = extractPathSegment('/api/sessions/s123/players/p456', 'sessions', 3);
 * // playerId = 'p456'
 *
 * @example
 * // 不匹配的情况
 * const value = extractPathSegment('/api/games/g123', 'players');
 * // value = null (关键字不存在)
 *
 * @example
 * // 偏移量超出范围
 * const value = extractPathSegment('/api/players/p123', 'players', 5);
 * // value = null (索引超出范围)
 *
 * @see extractRouteParams() 了解基于模式的路由参数提取
 * @see parseQueryParams() 了解查询参数提取
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
 * 从 HTTP 请求 URL 中提取查询参数（问号后的部分），转换为键值对对象。
 * 使用标准的 `URL` API 进行解析，支持重复参数（最后一个值生效）。
 *
 * **特性：**
 * - 自动处理 URL 编码的参数值
 * - 重复参数：同名参数取最后一个值（标准 URL 行为）
 * - 空值处理：空字符串 `?key=` 解析为 `{ key: '' }`
 * - 无查询参数时返回空对象 `{}`
 *
 * **注意：**
 * 此方法不处理数组参数（如 `?tags=a&tags=b`），如需数组支持需扩展实现。
 *
 * @param req - HTTP 请求对象，包含 `url` 和 `headers.host` 信息
 * @returns 查询参数键值对对象，参数名作为键，解码后的字符串作为值
 *
 * @example
 * // 基本用法
 * // 请求 URL: /api/levels?difficulty=0.7&theme=cyber
 * const params = parseQueryParams(req);
 * // params = { difficulty: '0.7', theme: 'cyber' }
 *
 * @example
 * // URL 编码参数
 * // 请求 URL: /api/search?q=hello%20world
 * const params = parseQueryParams(req);
 * // params = { q: 'hello world' }
 *
 * @example
 * // 空值和重复参数
 * // 请求 URL: /api/test?empty=&dup=first&dup=last
 * const params = parseQueryParams(req);
 * // params = { empty: '', dup: 'last' }
 *
 * @example
 * // 无查询参数
 * // 请求 URL: /api/health
 * const params = parseQueryParams(req);
 * // params = {}
 *
 * @see URL.searchParams Web API 文档
 * @see extractPathSegment() 了解路径参数提取
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
 * 基于时间戳和随机数生成唯一的请求标识符，用于日志追踪和请求关联。
 * 生成的 ID 格式：`req_{timestamp}_{random}`，其中：
 * - `timestamp`: 当前毫秒级时间戳
 * - `random`: 7 位 base-36 随机字符串（a-z0-9）
 *
 * **设计考虑：**
 * - 时间戳前缀：便于按时间排序和查找
 * - 随机后缀：防止时间戳冲突
 * - 可读性：人类可读的格式，便于调试
 * - 唯一性：极低碰撞概率，适合单机部署
 *
 * **使用场景：**
 * - 日志关联：将同一请求的日志条目关联起来
 * - 错误追踪：在错误响应中包含请求 ID
 * - 性能分析：追踪请求处理耗时
 * - 调试支持：用户可提供请求 ID 进行问题排查
 *
 * @returns 请求 ID 字符串，格式如 `req_1713456789012_abc123d`
 *
 * @example
 * const requestId = generateRequestId();
 * // 可能输出: req_1713456789012_4f7g9h2
 *
 * @example
 * // 在路由处理器中使用
 * const requestId = generateRequestId();
 * console.log(`[${requestId}] Processing request to ${req.url}`);
 * // 日志: [req_1713456789012_4f7g9h2] Processing request to /api/levels
 *
 * @see sendJson() 了解如何在 API 响应中包含请求 ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 安全的 JSON 序列化
 *
 * 增强的 `JSON.stringify()` 实现，处理循环引用和大数字等边缘情况。
 * 防止序列化过程中抛出异常，确保服务稳定性。
 *
 * **处理的问题：**
 * 1. **循环引用**：对象间接引用自身，标准 `JSON.stringify()` 会抛出错误
 * 2. **BigInt 类型**：ES2020 新增类型，标准 JSON 不支持
 * 3. **复杂对象图**：深度嵌套对象的序列化
 *
 * **解决方案：**
 * - 循环引用：检测到重复对象时替换为 `'[Circular Reference]'` 字符串
 * - BigInt 值：转换为字符串表示（如 `123n` → `'123'`）
 * - WeakSet 跟踪：使用 WeakSet 避免内存泄漏，不阻止垃圾回收
 *
 * **性能考虑：**
 * - 比标准 `JSON.stringify()` 稍慢，因需要额外检查
 * - 仅用于错误处理和调试输出，不用于高性能数据序列化
 * - WeakSet 确保不会阻止被跟踪对象的垃圾回收
 *
 * @param value - 要序列化的 JavaScript 值
 * @returns 安全的 JSON 字符串，不会因循环引用或 BigInt 而抛出异常
 *
 * @example
 * // 处理循环引用
 * const obj = { name: 'test' };
 * obj.self = obj; // 循环引用
 * const json = safeJsonStringify(obj);
 * // json = '{"name":"test","self":"[Circular Reference]"}'
 *
 * @example
 * // 处理 BigInt
 * const data = { id: 123n, value: BigInt('9999999999999999') };
 * const json = safeJsonStringify(data);
 * // json = '{"id":"123","value":"9999999999999999"}'
 *
 * @example
 * // 复杂对象
 * const complex = {
 *   date: new Date(),
 *   map: new Map([['key', 'value']]),
 *   set: new Set([1, 2, 3])
 * };
 * const json = safeJsonStringify(complex);
 * // json = '{"date":"2026-04-19T10:30:00.000Z","map":{},"set":{}}'
 * // 注意：Map 和 Set 会序列化为空对象，这是标准 JSON 行为
 *
 * @see JSON.stringify() 标准方法文档
 * @see sendJson() 了解如何发送 JSON 响应
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
