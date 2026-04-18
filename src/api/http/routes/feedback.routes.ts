// src/api/http/routes/feedback.routes.ts
/**
 * @fileoverview 反馈路由
 * @description 处理玩家反馈、关卡结果提交和数据分析相关接口
 * @module api/http/routes/feedback
 * @author xzxllm
 * @license MIT
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { XZXLLMGameEngine } from '../../../core/engine.js';
import type { ObservationType } from '../../../core/interfaces/base.types.js';
import { parseBody, sendJson, generateRequestId } from '../utils.js';

/**
 * 路由处理器类型
 */
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;

/**
 * 关卡结果提交数据
 */
interface LevelResultSubmission {
  sessionId: string;
  levelId: string;
  completionTime: number;
  attempts: number;
  success: boolean;
  usedHints: number;
  playerFeedback?: string;
  rating?: number;
  behaviorLog?: Array<{
    timestamp: number;
    event: string;
    data?: any;
  }>;
  skipReason?: string;
}



/**
 * POST /api/feedback - 提交关卡结果和反馈
 */
export const submitFeedback: RouteHandler = async (req, res, engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const body = await parseBody(req) as Partial<LevelResultSubmission>;

    // 参数验证
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

    if (!body.levelId || typeof body.levelId !== 'string') {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing required field: levelId',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    if (typeof body.success !== 'boolean') {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing or invalid required field: success (must be boolean)',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 构建反馈内容
    const feedbackContent = buildFeedbackContent(body as LevelResultSubmission);

    // 确定观察类型
    let observationType: ObservationType = 'completion' as ObservationType;
    if (!body.success) {
      observationType = 'frustration' as ObservationType;
    } else if (body.playerFeedback?.toLowerCase().includes('hard') || body.playerFeedback?.toLowerCase().includes('difficult')) {
      observationType = 'frustration' as ObservationType;
    }

    // 提交反馈
    await engine.submitFeedback(body.sessionId, {
      type: observationType,
      content: feedbackContent,
      importance: calculateImportance(body as LevelResultSubmission),
      levelId: body.levelId,
    });

    sendJson(res, 200, {
      success: true,
      data: {
        received: true,
        feedbackId: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[FeedbackRoutes] Failed to submit feedback:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'SUBMIT_FAILED',
        message: error.message || 'Failed to submit feedback',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * POST /api/feedback/quick - 快速反馈（简化的反馈接口）
 */
export const submitQuickFeedback: RouteHandler = async (req, res, engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const body = await parseBody(req) as {
      sessionId: string;
      levelId: string;
      rating: number; // 1-5 快速评分
      comment?: string;
    };

    if (!body.sessionId || !body.levelId || typeof body.rating !== 'number') {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing required fields: sessionId, levelId, rating',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 验证评分范围
    if (body.rating < 1 || body.rating > 5) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Rating must be between 1 and 5',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    // 构建反馈内容
    const sentiment = body.rating >= 4 ? 'positive' : body.rating <= 2 ? 'negative' : 'neutral';
    const content = `Quick feedback: ${body.rating}/5 stars. ${body.comment || ''}`;

    await engine.submitFeedback(body.sessionId, {
      type: 'sentiment' as ObservationType,
      content,
      importance: body.rating <= 2 ? 8 : body.rating >= 4 ? 6 : 4,
      levelId: body.levelId,
    });

    sendJson(res, 200, {
      success: true,
      data: {
        received: true,
        sentiment,
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[FeedbackRoutes] Failed to submit quick feedback:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'SUBMIT_FAILED',
        message: error.message || 'Failed to submit feedback',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * GET /api/feedback/analytics - 获取反馈分析数据
 */
export const getFeedbackAnalytics: RouteHandler = async (req, res, _engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // 解析查询参数
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const playerId = url.searchParams.get('playerId');
    const sessionId = url.searchParams.get('sessionId');
    const days = parseInt(url.searchParams.get('days') || '7', 10);

    // 返回模拟的分析数据（实际应从存储层获取）
    const analytics = {
      period: {
        start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      },
      playerId: playerId || undefined,
      sessionId: sessionId || undefined,
      summary: {
        totalFeedback: 0,
        averageRating: 0,
        completionRate: 0,
        averageCompletionTime: 0,
      },
      trends: {
        ratings: [0, 0, 0, 0, 0], // 1-5 星分布
        dailyActivity: [],
      },
      insights: [
        'Analytics data retrieval is not yet fully implemented',
      ],
    };

    sendJson(res, 200, {
      success: true,
      data: analytics,
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[FeedbackRoutes] Failed to get analytics:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message || 'Failed to fetch feedback analytics',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * POST /api/feedback/observation - 提交观察记录（更细粒度的数据）
 */
export const submitObservation: RouteHandler = async (req, res, engine) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const body = await parseBody(req) as {
      sessionId: string;
      type: string;
      content: string;
      importance?: number;
      metadata?: Record<string, any>;
    };

    if (!body.sessionId || !body.type || !body.content) {
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing required fields: sessionId, type, content',
        },
        meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
      });
      return;
    }

    await engine.submitFeedback(body.sessionId, {
      type: body.type as ObservationType,
      content: body.content,
      importance: body.importance || 5,
    });

    sendJson(res, 200, {
      success: true,
      data: {
        received: true,
        observationType: body.type,
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    console.error('[FeedbackRoutes] Failed to submit observation:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'SUBMIT_FAILED',
        message: error.message || 'Failed to submit observation',
      },
      meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
    });
  }
};

/**
 * 构建反馈内容文本
 */
function buildFeedbackContent(data: LevelResultSubmission): string {
  const parts: string[] = [];

  parts.push(`Level ${data.levelId} ${data.success ? 'completed' : 'failed'}`);
  parts.push(`Time: ${data.completionTime}s`);
  parts.push(`Attempts: ${data.attempts}`);

  if (data.usedHints > 0) {
    parts.push(`Hints used: ${data.usedHints}`);
  }

  if (data.playerFeedback) {
    parts.push(`Player comment: "${data.playerFeedback}"`);
  }

  if (data.rating) {
    parts.push(`Rating: ${data.rating}/5`);
  }

  if (data.skipReason) {
    parts.push(`Skipped: ${data.skipReason}`);
  }

  return parts.join('. ');
}

/**
 * 计算反馈重要性
 */
function calculateImportance(data: LevelResultSubmission): number {
  let importance = 5;

  // 失败的情况更重要
  if (!data.success) {
    importance += 2;
  }

  // 多次尝试表明困难
  if (data.attempts > 5) {
    importance += 1;
  }

  // 低评分很重要
  if (data.rating && data.rating <= 2) {
    importance += 2;
  }

  // 使用了很多提示
  if (data.usedHints > 3) {
    importance += 1;
  }

  return Math.min(10, importance);
}

/**
 * 反馈路由注册表
 */
export const feedbackRoutes = {
  'POST /api/feedback': submitFeedback,
  'POST /api/feedback/quick': submitQuickFeedback,
  'POST /api/feedback/observation': submitObservation,
  'GET /api/feedback/analytics': getFeedbackAnalytics,
};

export default feedbackRoutes;
