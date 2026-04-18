import { parseBody, sendJson, generateRequestId } from '../utils.js';
export const createLevel = async (req, res, engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
        const body = await parseBody(req);
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
        const params = {
            playerId: body.playerId,
            sessionId: body.sessionId,
        };
        if (body.difficulty !== undefined)
            params.difficulty = body.difficulty;
        if (body.preferredGameTypes !== undefined)
            params.preferredGameTypes = body.preferredGameTypes;
        if (body.theme !== undefined)
            params.theme = body.theme;
        if (body.previousLevelId !== undefined)
            params.previousLevelId = body.previousLevelId;
        if (body.triggerEvent !== undefined)
            params.triggerEvent = body.triggerEvent;
        if (body.forceIncludeType !== undefined)
            params.forceIncludeType = body.forceIncludeType;
        if (body.maxMiniGames !== undefined)
            params.maxMiniGames = body.maxMiniGames;
        const level = await engine.generateLevel(params);
        sendJson(res, 200, {
            success: true,
            data: level,
            meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
        });
    }
    catch (error) {
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
export const getBufferedLevel = async (req, res, engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
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
    }
    catch (error) {
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
export const getLevelById = async (req, res, _engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
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
        sendJson(res, 501, {
            success: false,
            error: {
                code: 'NOT_IMPLEMENTED',
                message: 'Fetching level by ID is not yet implemented',
            },
            meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
        });
    }
    catch (error) {
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
export const validateLevel = async (req, res, _engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
        const body = await parseBody(req);
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
        const level = body.levelConfig;
        const validation = {
            valid: true,
            errors: [],
            warnings: [],
        };
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
    }
    catch (error) {
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
export const getLevelTemplates = async (req, res, _engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const difficulty = parseFloat(url.searchParams.get('difficulty') || '0.5');
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
        const filtered = templates.filter((t) => Math.abs(t.difficulty - difficulty) <= 0.2);
        sendJson(res, 200, {
            success: true,
            data: filtered,
            meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
        });
    }
    catch (error) {
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
export const levelRoutes = {
    'POST /api/levels': createLevel,
    'GET /api/levels/buffered': getBufferedLevel,
    'GET /api/levels/templates': getLevelTemplates,
    'POST /api/levels/validate': validateLevel,
    'GET /api/levels/*': getLevelById,
};
export default levelRoutes;
//# sourceMappingURL=level.routes.js.map