// src/api/http/routes/level.routes.ts
/**
 * @fileoverview 关卡路由
 * @description 处理关卡生成、查询和管理相关接口
 * @module api/http/routes/level
 * @author xzxllm
 * @license MIT
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { XZXLLMGameEngine } from '../../../core/engine.js';
import type {
  LevelGenerationParams,
} from '../../../core/interfaces/api.types.js';
import type { LevelStructure } from '../../../core/interfaces/base.types.js';
import { parseBody, sendJson, generateRequestId } from '../utils.js';

/**
 * 路由处理器类型
 */
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;



/**
 * POST /api/levels - 生成新关卡
 */
export const createLevel: RouteHandler = async (req, res, engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const body = await parseBody(req) as Partial<LevelGenerationParams>;

    // 参数验证
    if (!body.playerId || typeof body.playerId !== 'string') {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing required field: playerId',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    if (!body.sessionId || typeof body.sessionId !== 'string') {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing required field: sessionId',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 构建生成参数
    const params: LevelGenerationParams = {
      playerId: body.playerId,
      sessionId: body.sessionId,
    };
    if (body.difficulty !== undefined) params.difficulty = body.difficulty;
    if (body.preferredGameTypes !== undefined) params.preferredGameTypes = body.preferredGameTypes;
    if (body.theme !== undefined) params.theme = body.theme;
    if (body.previousLevelId !== undefined) params.previousLevelId = body.previousLevelId;
    if (body.triggerEvent !== undefined) params.triggerEvent = body.triggerEvent;
    if (body.forceIncludeType !== undefined) params.forceIncludeType = body.forceIncludeType;
    if (body.maxMiniGames !== undefined) params.maxMiniGames = body.maxMiniGames;

    // 调用引擎生成关卡
    const level = await engine.generateLevel(params);

    sendJson(res, 200, {
      success: true,
      data: level,
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[LevelRoutes] Failed to generate level:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'GENERATION_FAILED',
        message: error.message || 'Failed to generate level',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * GET /api/levels/buffered - 获取预生成的关卡
 */
export const getBufferedLevel: RouteHandler = async (req, res, engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // 解析查询参数
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing required query parameter: sessionId',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    const level = await engine.getNextLevel(sessionId);

    if (!level) {
      sendJson(res, 404, {
        success: false,
        error: {
          code: 'NO_BUFFERED_LEVEL',
          message: 'No pre-generated level available in buffer pool',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      data: level,
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[LevelRoutes] Failed to get buffered level:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message || 'Failed to fetch buffered level',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * GET /api/levels/:id - 获取指定关卡详情
 */
export const getLevelById: RouteHandler = async (req, res, _engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // 从 URL 中提取关卡 ID
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/');
    const levelId = pathParts[pathParts.length - 1];

    if (!levelId || levelId === 'levels') {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing level ID',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 注意：当前引擎没有直接通过 ID 获取关卡的方法
    // 这需要通过存储层实现，这里返回功能未实现
    sendJson(res, 501, {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Fetching level by ID is not yet implemented',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[LevelRoutes] Failed to get level:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message || 'Failed to fetch level',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * POST /api/levels/validate - 验证关卡配置
 */
export const validateLevel: RouteHandler = async (req, res, _engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const body = await parseBody(req) as { levelConfig?: LevelStructure };

    if (!body.levelConfig) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing required field: levelConfig',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 基础验证逻辑
    const level = body.levelConfig;
    const validation = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
    };

    // 验证必要字段
    if (!level.metadata?.id) {
      validation.errors.push('Missing level metadata.id');
    }
    if (!level.baseMap?.size || level.baseMap.size.length !== 2) {
      validation.errors.push('Invalid baseMap.size (must be [width, height])');
    }
    if (!Array.isArray(level.miniGames)) {
      validation.errors.push('miniGames must be an array');
    }

    validation.valid = validation.errors.length === 0;

    sendJson(res, 200, {
      success: true,
      data: validation,
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[LevelRoutes] Failed to validate level:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: error.message || 'Failed to validate level',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * GET /api/levels/templates - 获取关卡模板列表
 */
export const getLevelTemplates: RouteHandler = async (req, res, _engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // 解析查询参数
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const difficulty = parseFloat(url.searchParams.get('difficulty') || '0.5');

    // 返回一些预设模板
    const templates = [
      {
        id: 'template_easy',
        name: '简单关卡模板',
        difficulty: 0.3,
        description: '适合新玩家的入门关卡',
        recommendedTypes: ['pushbox', 'riddle'],
      },
      {
        id: 'template_medium',
        name: '中等关卡模板',
        difficulty: 0.5,
        description: '平衡的挑战性',
        recommendedTypes: ['pushbox', 'laser-mirror'],
      },
      {
        id: 'template_hard',
        name: '困难关卡模板',
        difficulty: 0.8,
        description: '高难度的挑战',
        recommendedTypes: ['circuit', 'sliding-puzzle'],
      },
    ];

    // 根据难度筛选
    const filtered = templates.filter(
      (t) => Math.abs(t.difficulty - difficulty) <= 0.2
    );

    sendJson(res, 200, {
      success: true,
      data: filtered,
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[LevelRoutes] Failed to get templates:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message || 'Failed to fetch level templates',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * 关卡路由注册表
 */
export const levelRoutes = {
  'POST /api/levels': createLevel,
  'GET /api/levels/buffered': getBufferedLevel,
  'GET /api/levels/templates': getLevelTemplates,
  'POST /api/levels/validate': validateLevel,
  'GET /api/levels/*': getLevelById,
};

export default levelRoutes;
