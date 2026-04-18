import type { IncomingMessage, ServerResponse } from 'http';
export interface AuthConfig {
    validApiKeys: string[];
    enabled?: boolean;
    exemptPaths?: string[];
    headerName?: string;
    allowQueryParam?: boolean;
}
export interface AuthResult {
    success: boolean;
    apiKey?: string;
    error?: {
        code: string;
        message: string;
    };
}
export interface AuthenticatedRequest extends IncomingMessage {
    apiKey?: string;
    clientIp?: string;
}
export declare class AuthMiddleware {
    private config;
    constructor(config?: Partial<AuthConfig>);
    authenticate(req: AuthenticatedRequest, _res: ServerResponse): AuthResult;
    middleware(req: AuthenticatedRequest, res: ServerResponse, next: () => void): void;
    private extractApiKey;
    private isValidApiKey;
    private isPathExempt;
    addApiKey(apiKey: string): void;
    removeApiKey(apiKey: string): void;
    getClientIp(req: IncomingMessage): string;
}
export declare function createAuthMiddleware(config?: Partial<AuthConfig>): AuthMiddleware;
export declare class ApiKeyStore {
    private keys;
    generateKey(metadata?: any): string;
    validateKey(key: string): boolean;
    revokeKey(key: string): boolean;
    getAllKeys(): string[];
    private randomString;
}
export default AuthMiddleware;
//# sourceMappingURL=auth.d.ts.map