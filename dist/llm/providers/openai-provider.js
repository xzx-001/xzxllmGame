import { BaseLLMProvider } from '../base/base-provider.js';
import { LLMErrorType } from '../types.js';
export class OpenAIProvider extends BaseLLMProvider {
    name;
    apiKey;
    baseUrl;
    organization;
    constructor(config) {
        super(config);
        if (config.baseUrl?.includes('azure.com')) {
            this.name = 'AzureOpenAI';
            this.baseUrl = config.baseUrl;
        }
        else {
            this.name = 'OpenAI';
            this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        }
        this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
        this.organization = process.env.OPENAI_ORG_ID;
        if (!this.apiKey) {
            throw new Error('OpenAI API key is required. Provide it via:\n' +
                '1. config.apiKey\n' +
                '2. OPENAI_API_KEY environment variable');
        }
    }
    async initialize() {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(10000)
            });
            if (response.status === 401) {
                throw new Error('Invalid API key');
            }
            if (!response.ok) {
                throw new Error(`API check failed: ${response.statusText}`);
            }
            this._isAvailable = true;
            this.log('info', `${this.name} provider initialized (${this.config.model})`);
        }
        catch (error) {
            if (error.message.includes('fetch')) {
                throw new Error(`Cannot connect to ${this.name}. Check your network.`);
            }
            throw error;
        }
    }
    async doGenerate(prompt, options) {
        const messages = [
            { role: 'user', content: prompt }
        ];
        if (options.systemPrompt) {
            messages.unshift({ role: 'system', content: options.systemPrompt });
        }
        const requestBody = {
            model: this.config.model,
            messages: messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens,
            top_p: options.topP,
            stop: options.stopSequences,
            user: 'xzxllm-game-user'
        };
        if (options.responseFormat === 'json') {
            requestBody.response_format = { type: 'json_object' };
            if (!requestBody.messages.some((m) => m.role === 'system')) {
                requestBody.messages.unshift({
                    role: 'system',
                    content: 'You are a helpful assistant designed to output JSON.'
                });
            }
        }
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                ...this.getHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(options.timeout ?? 30000)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API error ${response.status}: ${errorData.error?.message || response.statusText}`);
        }
        const data = await response.json();
        const choice = data.choices[0];
        const text = choice?.message?.content || '';
        return {
            text,
            content: text,
            model: data.model,
            finishReason: this.mapFinishReason(choice?.finish_reason || 'error'),
            usage: {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0,
            }
        };
    }
    getHeaders() {
        if (this.name === 'AzureOpenAI') {
            return {
                'api-key': this.apiKey,
                ...(this.organization && { 'OpenAI-Organization': this.organization })
            };
        }
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            ...(this.organization && { 'OpenAI-Organization': this.organization })
        };
    }
    mapFinishReason(reason) {
        switch (reason) {
            case 'stop': return 'stop';
            case 'length': return 'length';
            case 'content_filter': return 'content_filter';
            default: return 'error';
        }
    }
    classifyError(error) {
        const message = error.message || String(error);
        const statusMatch = message.match(/(\d{3})/);
        const statusCode = statusMatch ? parseInt(statusMatch[1]) : undefined;
        if (statusCode === 401 || message.includes('Invalid API key')) {
            return {
                type: LLMErrorType.AUTHENTICATION,
                message: `Authentication failed: ${message}`,
                statusCode: 401,
                retryable: false
            };
        }
        if (statusCode === 429 || message.includes('rate limit')) {
            return {
                type: LLMErrorType.RATE_LIMIT,
                message: `Rate limit exceeded: ${message}`,
                statusCode: 429,
                retryable: true
            };
        }
        if (statusCode === 400 && message.includes('context length')) {
            return {
                type: LLMErrorType.CONTEXT_LENGTH_EXCEEDED,
                message: `Context too long: ${message}`,
                statusCode: 400,
                retryable: false
            };
        }
        if (statusCode === 400 && message.includes('content filter')) {
            return {
                type: LLMErrorType.CONTENT_FILTER,
                message: `Content filtered: ${message}`,
                statusCode: 400,
                retryable: false
            };
        }
        if (statusCode && statusCode >= 500) {
            return {
                type: LLMErrorType.SERVER_ERROR,
                message: `Server error: ${message}`,
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
    estimateTokens(text) {
        const latinChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length;
        const otherChars = text.length - latinChars;
        return Math.ceil(latinChars / 4) + otherChars;
    }
    async dispose() {
        this._isAvailable = false;
        this.log('info', `${this.name} provider disposed`);
    }
}
//# sourceMappingURL=openai-provider.js.map