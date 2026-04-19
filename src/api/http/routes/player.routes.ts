// src/api/http/routes/player.routes.ts
/**
 * @fileoverview 玩家路由
 * @description 处理玩家数据、画像和历史记录相关接口
 * @module api/http/routes/player
 * @author xzxllm
 * @license MIT
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { XZXLLMGameEngine } from '../../../core/engine.js';
import type { PlayerProfile } from '../../../core/interfaces/base.types.js';
import { parseBody, sendJson, extractPathSegment, generateRequestId } from '../utils.js';

/**
 * 路由处理器类型定义
 *
 * HTTP 路由的标准处理器签名，用于统一处理玩家数据相关接口。
 * 每个路由处理器接收 HTTP 请求对象、响应对象和游戏引擎实例，
 * 异步处理后发送适当的 JSON 响应。
 *
 * @param req - Node.js HTTP 请求对象，包含请求方法、URL、头信息和请求体
 * @param res - Node.js HTTP 响应对象，用于设置状态码、头信息和返回数据
 * @param engine - XZXLLMGameEngine 实例，用于执行玩家画像查询、统计计算等业务逻辑
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 */
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;



/**
 * GET /api/players/:id/profile - 获取玩家画像
 *
 * 根据玩家 ID 从引擎存储中获取完整的玩家画像数据。
 * 玩家画像包含技能评级、挫败感水平、关系阶段、游戏历史等长期统计数据。
 *
 * **路径参数：**
 * - `:id` (必需) - 玩家唯一标识符
 *
 * **响应：**
 * - 成功时返回 200 状态码和 PlayerProfile 对象
 * - 参数验证失败时返回 400 状态码
 * - 玩家不存在时返回 404 状态码和 `PLAYER_NOT_FOUND` 错误
 * - 获取过程中出错时返回 500 状态码
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param engine - 游戏引擎实例
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * GET /api/players/player_001/profile
 */
export const getPlayerProfile: RouteHandler = async (req, res, engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // 从 URL 中提取玩家 ID
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const playerId = extractPathSegment(url.pathname, 'players');

    if (!playerId) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing player ID',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    const profile = await engine.getPlayerStats(playerId);

    if (!profile) {
      sendJson(res, 404, {
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: `Player with ID '${playerId}' not found`,
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      data: profile,
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[PlayerRoutes] Failed to get player profile:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message || 'Failed to fetch player profile',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * PUT /api/players/:id/profile - 更新玩家画像
 *
 * **注意：此接口当前未完整实现，需要存储层扩展支持。**
 *
 * 更新指定玩家的画像数据。请求体可包含要更新的字段，但 playerId 字段不可修改。
 * 此功能需要存储层实现完整的玩家画像更新接口，当前引擎接口暂不支持。
 *
 * **路径参数：**
 * - `:id` (必需) - 玩家唯一标识符
 *
 * **请求体参数：**
 * - 可包含 PlayerProfile 接口的部分字段，但以下字段受限制：
 *   - `playerId` - 不可修改，必须与路径参数一致（如不一致返回错误）
 *   - `createdAt` - 通常由系统维护，不可修改
 *
 * **响应：**
 * - 成功时返回 200 状态码和更新后的 PlayerProfile 对象
 * - 参数验证失败时返回 400 状态码
 * - 功能未实现时返回 501 状态码和 `NOT_IMPLEMENTED` 错误
 * - 更新过程中出错时返回 500 状态码
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param _engine - 游戏引擎实例（当前未使用）
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * PUT /api/players/player_001/profile
 * {
 *   "skillRating": 0.75,
 *   "frustrationLevel": 0.2
 * }
 */
export const updatePlayerProfile: RouteHandler = async (req, res, _engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // 从 URL 中提取玩家 ID
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const playerId = extractPathSegment(url.pathname, 'players');

    if (!playerId) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing player ID',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    const body = await parseBody(req) as Partial<PlayerProfile>;

    // 不允许修改 playerId
    if (body.playerId && body.playerId !== playerId) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Cannot change playerId',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 注意：当前引擎接口不支持直接更新画像，需要扩展存储层
    sendJson(res, 501, {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Direct profile update is not yet implemented',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[PlayerRoutes] Failed to update player profile:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: error.message || 'Failed to update player profile',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * GET /api/players/:id/history - 获取玩家历史记录
 *
 * **注意：此接口当前未完整实现，需要存储层扩展支持。**
 *
 * 获取指定玩家的游戏历史记录，包括已完成的关卡、尝试次数、通关时间等详细数据。
 * 支持分页查询（预留参数），当前引擎接口暂未实现此功能。
 *
 * **路径参数：**
 * - `:id` (必需) - 玩家唯一标识符
 *
 * **查询参数（预留，当前未使用）：**
 * - `limit?: number` - 分页限制（默认 20）
 * - `offset?: number` - 分页偏移量（默认 0）
 * - `type?: string` - 过滤历史记录类型（如 'completed', 'attempted'）
 *
 * **响应：**
 * - 成功时返回 200 状态码和历史记录列表
 * - 参数验证失败时返回 400 状态码
 * - 功能未实现时返回 501 状态码和 `NOT_IMPLEMENTED` 错误
 * - 获取过程中出错时返回 500 状态码
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param _engine - 游戏引擎实例（当前未使用）
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * GET /api/players/player_001/history?limit=10&offset=0
 */
export const getPlayerHistory: RouteHandler = async (req, res, _engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // 从 URL 中提取玩家 ID
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const playerId = extractPathSegment(url.pathname, 'players');

    if (!playerId) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing player ID',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 解析分页参数（预留，待存储层扩展后使用）
    // const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    // const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // 注意：当前引擎没有直接获取历史记录的接口
    // 这需要扩展存储层
    sendJson(res, 501, {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Player history retrieval is not yet implemented',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[PlayerRoutes] Failed to get player history:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message || 'Failed to fetch player history',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * GET /api/players/:id/stats - 获取玩家统计信息
 *
 * 获取指定玩家的聚合统计信息，基于玩家画像计算得出的游戏表现摘要。
 * 与完整画像相比，统计信息更专注于游戏表现的核心指标，便于客户端显示。
 *
 * **路径参数：**
 * - `:id` (必需) - 玩家唯一标识符
 *
 * **响应结构：**
 * ```typescript
 * {
 *   playerId: string,           // 玩家 ID
 *   skillRating: number,        // 技能评级（0.0-1.0）
 *   skillLevel: string,         // 技能等级（'beginner'/'intermediate'/'expert'）
 *   totalPlayTime: number,      // 总游戏时长（秒）
 *   completedLevels: number,    // 已完成关卡数
 *   currentStreak: number,      // 当前连胜/连败次数
 *   relationshipStage: string,  // 关系阶段（'rivals'/'frenemies' 等）
 *   frustrationLevel: number,   // 挫败感水平（0.0-1.0）
 *   lastUpdated: string         // 最后更新时间戳
 * }
 * ```
 *
 * **响应：**
 * - 成功时返回 200 状态码和统计信息对象
 * - 参数验证失败时返回 400 状态码
 * - 玩家不存在时返回 404 状态码和 `PLAYER_NOT_FOUND` 错误
 * - 获取过程中出错时返回 500 状态码
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param engine - 游戏引擎实例
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * GET /api/players/player_001/stats
 */
export const getPlayerStats: RouteHandler = async (req, res, engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // 从 URL 中提取玩家 ID
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const playerId = extractPathSegment(url.pathname, 'players');

    if (!playerId) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing player ID',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    const profile = await engine.getPlayerStats(playerId);

    if (!profile) {
      sendJson(res, 404, {
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: `Player with ID '${playerId}' not found`,
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 计算统计信息
    const stats = {
      playerId: profile.playerId,
      skillRating: profile.skillRating,
      skillLevel: profile.skillRating < 0.3 ? 'beginner' : profile.skillRating < 0.7 ? 'intermediate' : 'expert',
      totalPlayTime: profile.totalPlayTime || 0,
      completedLevels: profile.completedLevels || 0,
      currentStreak: profile.winStreak,
      relationshipStage: profile.relationshipStage,
      frustrationLevel: profile.frustrationLevel,
      lastUpdated: profile.lastUpdated,
    };

    sendJson(res, 200, {
      success: true,
      data: stats,
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[PlayerRoutes] Failed to get player stats:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message || 'Failed to fetch player stats',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * POST /api/players/:id/reset - 重置玩家数据
 *
 * **注意：此接口当前未完整实现，需要存储层扩展支持。**
 *
 * 重置指定玩家的所有游戏数据，包括画像、历史记录和统计信息。
 * 为防止误操作，必须通过请求体明确确认（`confirm: true`）。
 * 此功能需要存储层实现数据重置接口，当前引擎接口暂不支持。
 *
 * **路径参数：**
 * - `:id` (必需) - 玩家唯一标识符
 *
 * **请求体参数：**
 * - `confirm: boolean` (必需) - 必须为 `true` 以确认重置操作
 *
 * **响应：**
 * - 成功时返回 200 状态码和重置结果信息
 * - 参数验证失败时返回 400 状态码
 * - 未确认时返回 400 状态码和 `CONFIRMATION_REQUIRED` 错误
 * - 功能未实现时返回 501 状态码和 `NOT_IMPLEMENTED` 错误
 * - 重置过程中出错时返回 500 状态码
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param _engine - 游戏引擎实例（当前未使用）
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * POST /api/players/player_001/reset
 * {
 *   "confirm": true
 * }
 */
export const resetPlayerData: RouteHandler = async (req, res, _engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // 从 URL 中提取玩家 ID
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const playerId = extractPathSegment(url.pathname, 'players');

    if (!playerId) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing player ID',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    const body = await parseBody(req) as { confirm?: boolean };

    if (!body.confirm) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Please confirm the reset by setting confirm: true',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 注意：当前引擎没有直接重置数据的接口
    sendJson(res, 501, {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Player data reset is not yet implemented',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[PlayerRoutes] Failed to reset player data:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'RESET_FAILED',
        message: error.message || 'Failed to reset player data',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * 玩家路由注册表
 *
 * 定义所有玩家数据相关路由的路径-处理器映射。
 * 格式：`'HTTP方法 路径模式': 路由处理器函数`
 *
 * **路径模式语法：**
 * - 通配符模式：`GET /api/players/*/profile` 匹配任意玩家 ID
 * - 星号 (*) 表示动态段，可通过 `extractPathSegment` 提取具体值
 *
 * **路由注册：**
 * 此对象被 HTTP 服务器扫描并自动注册到路由表中，通配符路径由服务器特殊处理。
 *
 * @see HTTPServer.registerWildcardRoute() 了解通配符路由注册机制
 * @see extractPathSegment() 了解如何从 URL 中提取动态段值
 */
export const playerRoutes = {
  'GET /api/players/*/profile': getPlayerProfile,
  'PUT /api/players/*/profile': updatePlayerProfile,
  'GET /api/players/*/history': getPlayerHistory,
  'GET /api/players/*/stats': getPlayerStats,
  'POST /api/players/*/reset': resetPlayerData,
};

export default playerRoutes;
