import { BaseLLMProvider } from '../base/base-provider.js';
import { LLMRequestOptions, LLMResponse, LLMConfig, LLMErrorType } from '../types.js';
export declare class LocalLLMProvider extends BaseLLMProvider {
    readonly name = "LocalLLM";
    private model;
    private context;
    private modelInfo;
    constructor(config: LLMConfig);
    initialize(): Promise<void>;
    protected doGenerate(prompt: string, options: LLMRequestOptions): Promise<LLMResponse>;
    protected classifyError(error: any): {
        type: LLMErrorType;
        message: string;
        retryable: boolean;
        statusCode?: number;
    };
    estimateTokens(text: string): number;
    dispose(): Promise<void>;
    private warmup;
}
//# sourceMappingURL=local-provider.d.ts.map