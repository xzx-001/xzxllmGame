import { ILLMProvider, LLMRequestOptions, LLMResponse, LLMConfig, LLMErrorType } from './../types.js';
interface RetryPolicy {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    retryableErrors: LLMErrorType[];
}
export declare abstract class BaseLLMProvider implements ILLMProvider {
    abstract readonly name: string;
    protected _isAvailable: boolean;
    protected config: LLMConfig;
    protected retryPolicy: RetryPolicy;
    protected defaultOptions: LLMRequestOptions;
    constructor(config: LLMConfig);
    get isAvailable(): boolean;
    abstract initialize(): Promise<void>;
    protected abstract doGenerate(prompt: string, options: LLMRequestOptions): Promise<LLMResponse>;
    protected abstract classifyError(error: any): {
        type: LLMErrorType;
        message: string;
        statusCode?: number;
        retryable: boolean;
    };
    generate(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse>;
    healthCheck(): Promise<boolean>;
    dispose(): Promise<void>;
    protected withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>;
    protected calculateBackoff(attempt: number): number;
    protected sleep(ms: number): Promise<void>;
    protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any): void;
}
export {};
//# sourceMappingURL=base-provider.d.ts.map