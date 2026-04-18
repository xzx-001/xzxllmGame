import type { IncomingMessage, ServerResponse } from 'http';
import type { XZXLLMGameEngine } from '../../../core/engine.js';
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;
export declare const getPlayerProfile: RouteHandler;
export declare const updatePlayerProfile: RouteHandler;
export declare const getPlayerHistory: RouteHandler;
export declare const getPlayerStats: RouteHandler;
export declare const resetPlayerData: RouteHandler;
export declare const playerRoutes: {
    'GET /api/players/*/profile': RouteHandler;
    'PUT /api/players/*/profile': RouteHandler;
    'GET /api/players/*/history': RouteHandler;
    'GET /api/players/*/stats': RouteHandler;
    'POST /api/players/*/reset': RouteHandler;
};
export default playerRoutes;
//# sourceMappingURL=player.routes.d.ts.map