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
 * 路由处理器类型定义
 *
 * HTTP 路由的标准处理器签名，用于统一处理关卡相关接口。
 * 每个路由处理器接收 HTTP 请求对象、响应对象和游戏引擎实例，
 * 异步处理后发送适当的 JSON 响应。
 *
 * @param req - Node.js HTTP 请求对象，包含请求方法、URL、头信息和请求体
 * @param res - Node.js HTTP 响应对象，用于设置状态码、头信息和返回数据
 * @param engine - XZXLLMGameEngine 实例，用于执行关卡生成、查询等业务逻辑
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 */
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;



/**
 * POST /api/levels - 生成新关卡
 *
 * 处理关卡生成请求，调用游戏引擎生成完整的关卡结构。
 * 支持自定义难度、偏好游戏类型、主题等参数，生成的小游戏类型和数量由引擎动态决定。
 *
 * **请求体参数：**
 * - `playerId: string` (必需) - 玩家唯一标识符
 * - `sessionId: string` (必需) - 当前会话标识符
 * - `difficulty?: number` (可选) - 目标难度系数（0.0-1.0）
 * - `preferredGameTypes?: string[]` (可选) - 偏好的小游戏类型列表
 * - `theme?: string` (可选) - 关卡主题风格（如 'cyber', 'fantasy'）
 * - `previousLevelId?: string` (可选) - 前一关卡 ID（用于连续生成）
 * - `triggerEvent?: string` (可选) - 触发事件（如 'retry', 'next'）
 * - `forceIncludeType?: string` (可选) - 强制包含的小游戏类型
 * - `maxMiniGames?: number` (可选) - 最大小游戏数量限制
 *
 * **响应：**
 * - 成功时返回 200 状态码和完整的 LevelStructure 对象
 * - 参数验证失败时返回 400 状态码和错误信息
 * - 生成过程中出错时返回 500 状态码和错误信息
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param engine - 游戏引擎实例
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * POST /api/levels
 * {
 *   "playerId": "player_001",
 *   "sessionId": "session_001",
 *   "difficulty": 0.7,
 *   "theme": "cyber"
 * }
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
 *
 * 从引擎的预生成缓冲池中获取下一个可用的关卡。
 * 引擎会根据配置（`pregenerateCount`）预先生成关卡并存入缓冲池，
 * 此接口提供快速响应的关卡获取，避免实时生成的延迟。
 *
 * **查询参数：**
 * - `sessionId: string` (必需) - 当前会话标识符，用于隔离不同会话的缓冲池
 *
 * **响应：**
 * - 成功时返回 200 状态码和 LevelStructure 对象
 * - 参数验证失败时返回 400 状态码
 * - 缓冲池为空时返回 404 状态码和 `NO_BUFFERED_LEVEL` 错误
 * - 获取过程中出错时返回 500 状态码
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param engine - 游戏引擎实例
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * GET /api/levels/buffered?sessionId=session_001
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
 *
 * **注意：此接口当前未完整实现，需要存储层扩展支持。**
 *
 * 根据关卡 ID 从存储中获取对应的关卡配置详情。
 * 此功能需要存储层实现按 ID 检索关卡的能力，当前引擎接口暂不支持。
 *
 * **路径参数：**
 * - `:id` (必需) - 关卡唯一标识符
 *
 * **响应：**
 * - 成功时返回 200 状态码和 LevelStructure 对象
 * - 参数验证失败时返回 400 状态码
 * - 关卡不存在时返回 404 状态码
 * - 功能未实现时返回 501 状态码和 `NOT_IMPLEMENTED` 错误
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param _engine - 游戏引擎实例（当前未使用）
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * GET /api/levels/level_abc123def456
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
 *
 * 对传入的关卡配置进行结构验证，确保符合引擎要求的数据格式。
 * 当前实现基础验证（必要字段、数组类型等），可扩展为完整的 JSON Schema 验证。
 *
 * **请求体参数：**
 * - `levelConfig: LevelStructure` (必需) - 要验证的关卡配置对象
 *
 * **响应：**
 * - 成功时返回 200 状态码和验证结果对象，包含 `valid` 布尔值和错误/警告列表
 * - 参数验证失败时返回 400 状态码
 * - 验证过程中出错时返回 500 状态码
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param _engine - 游戏引擎实例（当前未使用）
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * POST /api/levels/validate
 * {
 *   "levelConfig": { "metadata": { "id": "level_001" }, "baseMap": { ... } }
 * }
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
 *
 * 返回预设的关卡模板列表，供游戏客户端参考或作为关卡生成的基准。
 * 模板包含预设的难度系数、推荐游戏类型等信息，可根据查询参数按难度筛选。
 *
 * **查询参数：**
 * - `difficulty?: number` (可选) - 目标难度系数（0.0-1.0），用于筛选相近难度的模板
 *
 * **响应：**
 * - 成功时返回 200 状态码和模板列表（模板对象数组）
 * - 获取过程中出错时返回 500 状态码
 *
 * **模板结构：**
 * ```typescript
 * {
 *   id: string,           // 模板唯一标识符
 *   name: string,         // 模板名称（人类可读）
 *   difficulty: number,   // 难度系数
 *   description: string,  // 模板描述
 *   recommendedTypes: string[] // 推荐包含的小游戏类型列表
 * }
 * ```
 *
 * @param req - HTTP 请求对象
 * @param res - HTTP 响应对象
 * @param _engine - 游戏引擎实例（当前未使用）
 * @returns Promise<void> 处理器执行完成后返回的 Promise
 *
 * @example
 * GET /api/levels/templates?difficulty=0.6
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
 *
 * 定义所有关卡相关路由的路径-处理器映射。
 * 格式：`'HTTP方法 路径模式': 路由处理器函数`
 *
 * **支持的路径模式：**
 * - 固定路径：`GET /api/levels/buffered`
 * - 通配符路径：`GET /api/levels/*` 匹配任意关卡 ID
 *
 * **路由注册：**
 * 此对象被 HTTP 服务器扫描并自动注册到路由表中。
 *
 * @see HTTPServer.registerRoutes() 了解路由注册机制
 */
export const levelRoutes = {
  'POST /api/levels': createLevel,
  'GET /api/levels/buffered': getBufferedLevel,
  'GET /api/levels/templates': getLevelTemplates,
  'POST /api/levels/validate': validateLevel,
  'GET /api/levels/*': getLevelById,
};

export default levelRoutes;
