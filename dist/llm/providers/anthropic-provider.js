import { BaseLLMProvider } from '../base/base-provider.js';
import { LLMErrorType } from '../types.js';
export class AnthropicProvider extends BaseLLMProvider {
    name = 'Anthropic';
    apiKey;
    baseUrl;
    apiVersion;
    constructor(config) {
        super(config);
        this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
        this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
        this.apiVersion = '2023-06-01';
        if (!this.apiKey) {
            throw new Error('Anthropic API key required (ANTHROPIC_API_KEY)');
        }
    }
    async initialize() {
        if (!this.apiKey.startsWith('sk-ant-')) {
            this.log('warn', 'API Key format looks incorrect (should start with sk-ant-)');
        }
        this._isAvailable = true;
        this.log('info', `Anthropic provider ready (${this.config.model})`);
    }
    async doGenerate(prompt, options) {
        const requestBody = {
            model: this.config.model,
            max_tokens: options.maxTokens ?? 1024,
            messages: [
                { role: 'user', content: prompt }
            ],
            temperature: options.temperature ?? 0.7,
            top_p: options.topP,
            stop_sequences: options.stopSequences,
        };
        if (options.systemPrompt) {
            requestBody.system = options.systemPrompt;
        }
        const response = await fetch(`${this.baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': this.apiVersion,
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(options.timeout ?? 60000)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API error ${response.status}: ${error}`);
        }
        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        return {
            text,
            content: text,
            model: data.model,
            finishReason: data.stop_reason === 'end_turn' ? 'stop' :
                data.stop_reason === 'max_tokens' ? 'length' : 'stop',
            usage: {
                promptTokens: data.usage?.input_tokens || 0,
                completionTokens: data.usage?.output_tokens || 0,
                totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            }
        };
    }
    classifyError(error) {
        const message = error.message || String(error);
        const statusMatch = message.match(/(\d{3})/);
        const statusCode = statusMatch ? parseInt(statusMatch[1]) : undefined;
        if (statusCode === 401) {
            return {
                type: LLMErrorType.AUTHENTICATION,
                message,
                statusCode,
                retryable: false
            };
        }
        if (statusCode === 429) {
            return {
                type: LLMErrorType.RATE_LIMIT,
                message,
                statusCode,
                retryable: true
            };
        }
        if (statusCode === 529) {
            return {
                type: LLMErrorType.SERVER_ERROR,
                message: 'Anthropic API overloaded',
                statusCode,
                retryable: true
            };
        }
        const result = {
            type: LLMErrorType.UNKNOWN,
            message,
            retryable: true
        };
        if (statusCode !== undefined) {
            result.statusCode = statusCode;
        }
        return result;
    }
    async dispose() {
        this._isAvailable = false;
    }
}
//# sourceMappingURL=anthropic-provider.js.map