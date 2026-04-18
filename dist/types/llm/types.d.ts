export interface LLMRequestOptions {
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
    systemPrompt?: string;
    timeout?: number;
    stream?: boolean;
    repeatPenalty?: number;
    topP?: number;
    seed?: number;
    responseFormat?: 'text' | 'json';
}
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
export interface LLMResponse {
    text: string | PromiseLike<string>;
    content: string;
    usage?: TokenUsage;
    model: string;
    finishReason: 'stop' | 'length' | 'error' | 'content_filter';
    isComplete?: boolean;
    rawResponse?: any;
}
export interface StreamCallbacks {
    onData: (chunk: string, usage?: Partial<TokenUsage>) => void;
    onComplete: (fullResponse: LLMResponse) => void;
    onError: (error: Error) => void;
}
export interface ILLMProvider {
    readonly name: string;
    readonly isAvailable: boolean;
    initialize(): Promise<void>;
    generate(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse>;
    generateStream?(prompt: string, options: LLMRequestOptions, callbacks: StreamCallbacks): Promise<void>;
    healthCheck(): Promise<boolean>;
    getModelInfo?(): Promise<{
        id: string;
        contextWindow: number;
        maxTokens: number;
        capabilities: string[];
    }>;
    estimateTokens?(text: string): number;
    dispose(): Promise<void>;
}
export type LLMProviderType = 'local' | 'ollama' | 'openai' | 'anthropic' | 'custom';
export interface LLMConfig {
    provider: LLMProviderType;
    model: string;
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    localOptions?: {
        modelPath: string;
        gpuLayers?: number;
        contextSize?: number;
        threads?: number;
        useMmap?: boolean;
        useMlock?: boolean;
    } | undefined;
    timeout?: number | undefined;
    retryAttempts?: number | undefined;
    defaults?: {
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        repeatPenalty?: number;
    } | undefined;
    streaming?: {
        enabled: boolean;
        chunkSize?: number;
    } | undefined;
}
export declare enum LLMErrorType {
    NETWORK_ERROR = "network_error",
    TIMEOUT = "timeout",
    RATE_LIMIT = "rate_limit",
    AUTHENTICATION = "authentication",
    MODEL_NOT_FOUND = "model_not_found",
    CONTENT_FILTER = "content_filter",
    CONTEXT_LENGTH_EXCEEDED = "context_length",
    SERVER_ERROR = "server_error",
    UNKNOWN = "unknown"
}
export declare class LLMError extends Error {
    type: LLMErrorType;
    provider: string;
    statusCode?: number | undefined;
    retryable: boolean;
    constructor(message: string, type: LLMErrorType, provider: string, statusCode?: number | undefined, retryable?: boolean);
}
//# sourceMappingURL=types.d.ts.map