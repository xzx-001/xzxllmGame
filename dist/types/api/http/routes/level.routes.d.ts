import type { IncomingMessage, ServerResponse } from 'http';
import type { XZXLLMGameEngine } from '../../../core/engine.js';
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;
export declare const createLevel: RouteHandler;
export declare const getBufferedLevel: RouteHandler;
export declare const getLevelById: RouteHandler;
export declare const validateLevel: RouteHandler;
export declare const getLevelTemplates: RouteHandler;
export declare const levelRoutes: {
    'POST /api/levels': RouteHandler;
    'GET /api/levels/buffered': RouteHandler;
    'GET /api/levels/templates': RouteHandler;
    'POST /api/levels/validate': RouteHandler;
    'GET /api/levels/*': RouteHandler;
};
export default levelRoutes;
//# sourceMappingURL=level.routes.d.ts.map