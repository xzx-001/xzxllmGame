import { LLMConfig } from '../types.js';
import { OpenAIProvider } from './openai-provider.js';
export declare class CustomProvider extends OpenAIProvider {
    readonly name: string;
    constructor(config: LLMConfig);
}
//# sourceMappingURL=custom-provider.d.ts.map