import { IncomingMessage, ServerResponse } from 'http';
import type { XZXLLMGameEngine } from '../../core/engine.js';
import { createRateLimit } from './middleware/rate-limit.js';
export interface HTTPServerConfig {
    port: number;
    host?: string;
    enableAuth?: boolean;
    apiKeys?: string[];
    enableRateLimit?: boolean;
    rateLimitConfig?: Parameters<typeof createRateLimit>[0];
    maxBodySize?: number;
    cors?: {
        enabled: boolean;
        origins?: string[];
        methods?: string[];
        headers?: string[];
    };
}
type RouteHandler = (req: IncomingMessage, res: ServerResponse, engine: XZXLLMGameEngine) => Promise<void>;
export declare class HTTPServer {
    private server;
    private config;
    private engine;
    private authMiddleware;
    private rateLimitMiddleware;
    private routes;
    private isRunning;
    constructor(engine: XZXLLMGameEngine, config?: Partial<HTTPServerConfig>);
    start(): Promise<void>;
    stop(): Promise<void>;
    getStatus(): {
        isRunning: boolean;
        port: number;
        host: string;
    };
    registerRoute(method: string, path: string, handler: RouteHandler): void;
    private handleRequest;
    private registerRoutes;
    private registerWildcardRoute;
    private matchRoute;
    private setCORSHeaders;
    private handleServerError;
}
export declare function createHTTPServer(engine: XZXLLMGameEngine, config?: Partial<HTTPServerConfig>): HTTPServer;
export default HTTPServer;
//# sourceMappingURL=server.d.ts.map