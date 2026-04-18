import type { IncomingMessage, ServerResponse } from 'http';
import type { XZXLLMGameEngine } from '../../../core/engine.js';
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;
export declare const submitFeedback: RouteHandler;
export declare const submitQuickFeedback: RouteHandler;
export declare const getFeedbackAnalytics: RouteHandler;
export declare const submitObservation: RouteHandler;
export declare const feedbackRoutes: {
    'POST /api/feedback': RouteHandler;
    'POST /api/feedback/quick': RouteHandler;
    'POST /api/feedback/observation': RouteHandler;
    'GET /api/feedback/analytics': RouteHandler;
};
export default feedbackRoutes;
//# sourceMappingURL=feedback.routes.d.ts.map