import { LocalLLMProvider } from './providers/local-provider.js';
import { OllamaProvider } from './providers/ollama-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { CustomProvider } from './providers/custom-provider.js';
export class LLMProviderFactory {
    static providers = new Map([
        ['local', LocalLLMProvider],
        ['ollama', OllamaProvider],
        ['openai', OpenAIProvider],
        ['anthropic', AnthropicProvider],
        ['custom', CustomProvider],
    ]);
    static createProvider(config) {
        const ProviderClass = this.providers.get(config.provider);
        if (!ProviderClass) {
            const available = Array.from(this.providers.keys()).join(', ');
            throw new Error(`Unknown LLM provider type: "${config.provider}".\n` +
                `Available providers: ${available}\n` +
                `You can register custom providers using LLMProviderFactory.registerProvider()`);
        }
        const adjustedConfig = this.adjustConfig(config);
        return new ProviderClass(adjustedConfig);
    }
    static registerProvider(type, providerClass) {
        if (this.providers.has(type)) {
            console.warn(`Provider "${type}" is being overwritten`);
        }
        this.providers.set(type, providerClass);
        console.log(`[LLMFactory] Registered custom provider: ${type}`);
    }
    static getAvailableProviders() {
        return Array.from(this.providers.keys());
    }
    static isRegistered(type) {
        return this.providers.has(type);
    }
    static adjustConfig(config) {
        const adjusted = {
            ...config,
            defaults: { ...config.defaults }
        };
        switch (config.provider) {
            case 'local':
                adjusted.defaults = {
                    temperature: 0.6,
                    maxTokens: 2048,
                    ...adjusted.defaults
                };
                break;
            case 'ollama':
                adjusted.timeout = config.timeout || 60000;
                break;
            case 'anthropic':
                adjusted.defaults = {
                    temperature: 0.7,
                    ...adjusted.defaults
                };
                adjusted.timeout = config.timeout || 60000;
                break;
            case 'custom':
                if (!adjusted.baseUrl) {
                    throw new Error('Custom provider requires baseUrl');
                }
                break;
        }
        return adjusted;
    }
}
export async function createLLMProvider(config) {
    const provider = LLMProviderFactory.createProvider(config);
    await provider.initialize();
    return provider;
}
//# sourceMappingURL=factory.js.map