import { BaseLLMProvider } from '../base/base-provider.js';
import { LLMRequestOptions, LLMResponse, LLMConfig, LLMErrorType } from '../types.js';
export declare class AnthropicProvider extends BaseLLMProvider {
    readonly name = "Anthropic";
    private apiKey;
    private baseUrl;
    private apiVersion;
    constructor(config: LLMConfig);
    initialize(): Promise<void>;
    protected doGenerate(prompt: string, options: LLMRequestOptions): Promise<LLMResponse>;
    protected classifyError(error: any): {
        type: LLMErrorType;
        message: string;
        retryable: boolean;
        statusCode?: number;
    };
    dispose(): Promise<void>;
}
//# sourceMappingURL=anthropic-provider.d.ts.map