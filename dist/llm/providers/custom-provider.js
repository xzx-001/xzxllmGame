import { OpenAIProvider } from './openai-provider.js';
export class CustomProvider extends OpenAIProvider {
    name;
    constructor(config) {
        if (!config.baseUrl) {
            throw new Error('Custom provider requires baseUrl in config.\n' +
                'Example: https://api.litellm.ai/v1 or http://localhost:8000/v1');
        }
        super(config);
        this.name = `Custom(${new URL(config.baseUrl).hostname})`;
    }
}
//# sourceMappingURL=custom-provider.js.map