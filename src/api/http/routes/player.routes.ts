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
 * 路由处理器类型
 */
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;



/**
 * GET /api/players/:id/profile - 获取玩家画像
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
 */
export const playerRoutes = {
  'GET /api/players/*/profile': getPlayerProfile,
  'PUT /api/players/*/profile': updatePlayerProfile,
  'GET /api/players/*/history': getPlayerHistory,
  'GET /api/players/*/stats': getPlayerStats,
  'POST /api/players/*/reset': resetPlayerData,
};

export default playerRoutes;
