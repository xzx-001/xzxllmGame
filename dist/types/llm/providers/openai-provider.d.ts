import { BaseLLMProvider } from '../base/base-provider.js';
import { LLMRequestOptions, LLMResponse, LLMConfig, LLMErrorType } from '../types.js';
export declare class OpenAIProvider extends BaseLLMProvider {
    readonly name: string;
    private apiKey;
    private baseUrl;
    private organization;
    constructor(config: LLMConfig);
    initialize(): Promise<void>;
    protected doGenerate(prompt: string, options: LLMRequestOptions): Promise<LLMResponse>;
    private getHeaders;
    private mapFinishReason;
    protected classifyError(error: any): {
        type: LLMErrorType;
        message: string;
        retryable: boolean;
        statusCode?: number;
    };
    estimateTokens(text: string): number;
    dispose(): Promise<void>;
}
//# sourceMappingURL=openai-provider.d.ts.map