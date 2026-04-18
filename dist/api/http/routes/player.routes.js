import { parseBody, sendJson, extractPathSegment, generateRequestId } from '../utils.js';
export const getPlayerProfile = async (req, res, engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
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
    }
    catch (error) {
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
export const updatePlayerProfile = async (req, res, _engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
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
        const body = await parseBody(req);
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
        sendJson(res, 501, {
            success: false,
            error: {
                code: 'NOT_IMPLEMENTED',
                message: 'Direct profile update is not yet implemented',
            },
            meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
        });
    }
    catch (error) {
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
export const getPlayerHistory = async (req, res, _engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
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
        sendJson(res, 501, {
            success: false,
            error: {
                code: 'NOT_IMPLEMENTED',
                message: 'Player history retrieval is not yet implemented',
            },
            meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
        });
    }
    catch (error) {
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
export const getPlayerStats = async (req, res, engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
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
    }
    catch (error) {
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
export const resetPlayerData = async (req, res, _engine) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    try {
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
        const body = await parseBody(req);
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
        sendJson(res, 501, {
            success: false,
            error: {
                code: 'NOT_IMPLEMENTED',
                message: 'Player data reset is not yet implemented',
            },
            meta: { requestId, timestamp: '', duration: Date.now() - startTime, version: '1.0.0' },
        });
    }
    catch (error) {
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
export const playerRoutes = {
    'GET /api/players/*/profile': getPlayerProfile,
    'PUT /api/players/*/profile': updatePlayerProfile,
    'GET /api/players/*/history': getPlayerHistory,
    'GET /api/players/*/stats': getPlayerStats,
    'POST /api/players/*/reset': resetPlayerData,
};
export default playerRoutes;
//# sourceMappingURL=player.routes.js.map