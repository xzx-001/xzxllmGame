import { parseBody, sendJson, generateRequestId } from '../utils.js';
export const submitFeedback = async (req, res, engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
        const body = await parseBody(req);
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
        const feedbackContent = buildFeedbackContent(body);
        let observationType = 'completion';
        if (!body.success) {
            observationType = 'frustration';
        }
        else if (body.playerFeedback?.toLowerCase().includes('hard') || body.playerFeedback?.toLowerCase().includes('difficult')) {
            observationType = 'frustration';
        }
        await engine.submitFeedback(body.sessionId, {
            type: observationType,
            content: feedbackContent,
            importance: calculateImportance(body),
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
    }
    catch (error) {
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
export const submitQuickFeedback = async (req, res, engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
        const body = await parseBody(req);
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
        const sentiment = body.rating >= 4 ? 'positive' : body.rating <= 2 ? 'negative' : 'neutral';
        const content = `Quick feedback: ${body.rating}/5 stars. ${body.comment || ''}`;
        await engine.submitFeedback(body.sessionId, {
            type: 'sentiment',
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
    }
    catch (error) {
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
export const getFeedbackAnalytics = async (req, res, _engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const playerId = url.searchParams.get('playerId');
        const sessionId = url.searchParams.get('sessionId');
        const days = parseInt(url.searchParams.get('days') || '7', 10);
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
                ratings: [0, 0, 0, 0, 0],
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
    }
    catch (error) {
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
export const submitObservation = async (req, res, engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
        const body = await parseBody(req);
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
            type: body.type,
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
    }
    catch (error) {
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
function buildFeedbackContent(data) {
    const parts = [];
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
function calculateImportance(data) {
    let importance = 5;
    if (!data.success) {
        importance += 2;
    }
    if (data.attempts > 5) {
        importance += 1;
    }
    if (data.rating && data.rating <= 2) {
        importance += 2;
    }
    if (data.usedHints > 3) {
        importance += 1;
    }
    return Math.min(10, importance);
}
export const feedbackRoutes = {
    'POST /api/feedback': submitFeedback,
    'POST /api/feedback/quick': submitQuickFeedback,
    'POST /api/feedback/observation': submitObservation,
    'GET /api/feedback/analytics': getFeedbackAnalytics,
};
export default feedbackRoutes;
//# sourceMappingURL=feedback.routes.js.map