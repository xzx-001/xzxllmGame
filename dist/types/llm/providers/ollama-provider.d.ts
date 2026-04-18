import { BaseLLMProvider } from '../base/base-provider.js';
import { LLMRequestOptions, LLMResponse, LLMConfig, LLMErrorType, StreamCallbacks } from '../types.js';
export declare class OllamaProvider extends BaseLLMProvider {
    readonly name = "Ollama";
    private baseUrl;
    private currentModel;
    constructor(config: LLMConfig);
    initialize(): Promise<void>;
    protected doGenerate(prompt: string, options: LLMRequestOptions): Promise<LLMResponse>;
    generateStream(prompt: string, options: LLMRequestOptions, callbacks: StreamCallbacks): Promise<void>;
    private pullModel;
    protected classifyError(error: any): {
        type: LLMErrorType;
        message: string;
        retryable: boolean;
        statusCode?: number;
    };
    getModelInfo(): Promise<{
        id: string;
        contextWindow: number;
        maxTokens: number;
        capabilities: string[];
    }>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=ollama-provider.d.ts.map