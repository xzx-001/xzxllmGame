import type { IncomingMessage, ServerResponse } from 'http';
import type { ApiResponse } from '../../core/interfaces/api.types.js';
export declare function parseBody(req: IncomingMessage, maxSize?: number): Promise<any>;
export declare function sendJson<T>(res: ServerResponse, statusCode: number, data: ApiResponse<T>): void;
export declare function extractRouteParams(urlPath: string, routePattern: string): Record<string, string> | null;
export declare function extractPathSegment(urlPath: string, keyword: string, offset?: number): string | null;
export declare function parseQueryParams(req: IncomingMessage): Record<string, string>;
export declare function generateRequestId(): string;
export declare function safeJsonStringify(value: unknown): string;
//# sourceMappingURL=utils.d.ts.map