export { XZXLLMGameEngine, createEngine } from './core/engine.js';
export type { GameEngineConfig } from './core/engine.js';
export { GameClientSDK, createSDK } from './api/sdk/game-client-sdk.js';
export { SDKEvent, WebSocketState } from './api/sdk/types.js';
export type { SDKConfig, LevelGenerationOptions, PlayerSession, LevelResult, GenerationStatus, SDKStats, } from './api/sdk/types.js';
export { UnityAdapter } from './api/sdk/adapters/unity-adapter.js';
export { UnrealAdapter } from './api/sdk/adapters/unreal-adapter.js';
export { APIServer, createAPIServer, startServer } from './api/server.js';
export { createHTTPServer, HTTPServer } from './api/http/server.js';
export { createWebSocketHandler, WebSocketHandler } from './api/websocket/socket-handler.js';
export { createAuthMiddleware, AuthMiddleware, ApiKeyStore } from './api/http/middleware/auth.js';
export { createRateLimit, RateLimitMiddleware, RateLimitPresets, } from './api/http/middleware/rate-limit.js';
export type { LevelStructure, LevelMetadata, BaseMapConfig, MiniGameZone, PropItem, DialogueNode, PlayerProfile, NarrativeState, MiniGameType, AIMood, RelationshipStage, SkillDimension, ObservationType, DialogueObservation, } from './core/interfaces/base.types.js';
export type { LevelRequestParams, LevelGenerationParams, PlayerFeedbackData, GenerationProgress, HealthStatus, ApiResponse, WebSocketMessage, EngineStatus, } from './core/interfaces/api.types.js';
export declare const VERSION = "1.0.0";
export declare const NAME = "xzxllmGame";
//# sourceMappingURL=index.d.ts.map