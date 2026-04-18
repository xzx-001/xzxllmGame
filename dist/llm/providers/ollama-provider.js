import { BaseLLMProvider } from '../base/base-provider.js';
import { LLMErrorType } from '../types.js';
export class OllamaProvider extends BaseLLMProvider {
    name = 'Ollama';
    baseUrl;
    currentModel;
    constructor(config) {
        super(config);
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        this.currentModel = config.model;
        this.baseUrl = this.baseUrl.replace(/\/$/, '');
    }
    async initialize() {
        this.log('info', `Connecting to Ollama at ${this.baseUrl}...`);
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) {
                throw new Error(`Ollama service returned ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            const modelExists = data.models.some((m) => m.name === this.currentModel || m.name.startsWith(`${this.currentModel}:`));
            if (!modelExists) {
                this.log('warn', `Model ${this.currentModel} not found locally. Attempting to pull...`);
                await this.pullModel();
            }
            else {
                this.log('info', `Model ${this.currentModel} is ready`);
            }
            this._isAvailable = true;
        }
        catch (error) {
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. ` +
                    `Please ensure Ollama is running:\n` +
                    `- Docker: docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama\n` +
                    `- Local: ollama serve`);
            }
            throw error;
        }
    }
    async doGenerate(prompt, options) {
        const requestBody = {
            model: this.currentModel,
            prompt: prompt,
            system: options.systemPrompt,
            stream: false,
            options: {
                temperature: options.temperature ?? 0.7,
                num_predict: options.maxTokens ?? 1024,
                top_p: options.topP ?? 1.0,
                stop: options.stopSequences,
                seed: options.seed,
                repeat_penalty: options.repeatPenalty ?? 1.1,
            }
        };
        if (options.responseFormat === 'json') {
            requestBody.format = 'json';
        }
        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(options.timeout ?? 30000)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${errorText}`);
        }
        const data = await response.json();
        return {
            text: data.response,
            content: data.response,
            model: this.currentModel,
            finishReason: data.done ? 'stop' : 'length',
            usage: {
                promptTokens: data.prompt_eval_count || 0,
                completionTokens: data.eval_count || 0,
                totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
            },
            rawResponse: {
                totalDuration: data.total_duration,
                loadDuration: data.load_duration,
            }
        };
    }
    async generateStream(prompt, options, callbacks) {
        const requestBody = {
            model: this.currentModel,
            prompt: prompt,
            system: options.systemPrompt,
            stream: true,
            options: {
                temperature: options.temperature ?? 0.7,
                num_predict: options.maxTokens ?? 1024,
            }
        };
        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const reader = response.body?.getReader();
            if (!reader)
                throw new Error('No response body');
            let fullContent = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                const chunk = new TextDecoder().decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.response) {
                            fullContent += data.response;
                            callbacks.onData(data.response, {
                                completionTokens: data.eval_count
                            });
                        }
                        if (data.done) {
                            callbacks.onComplete({
                                text: fullContent,
                                content: fullContent,
                                model: this.currentModel,
                                finishReason: 'stop',
                                usage: {
                                    promptTokens: data.prompt_eval_count || 0,
                                    completionTokens: data.eval_count || 0,
                                    totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                                }
                            });
                            return;
                        }
                    }
                    catch (e) {
                    }
                }
            }
        }
        catch (error) {
            callbacks.onError(error);
        }
    }
    async pullModel() {
        this.log('info', `Pulling model ${this.currentModel}... This may take a while.`);
        const response = await fetch(`${this.baseUrl}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: this.currentModel,
                stream: false
            }),
            signal: AbortSignal.timeout(600000)
        });
        if (!response.ok) {
            throw new Error(`Failed to pull model: ${response.statusText}`);
        }
        this.log('info', `Model ${this.currentModel} pulled successfully`);
    }
    classifyError(error) {
        const message = error.message || String(error);
        if (message.includes('404') || message.includes('not found')) {
            return {
                type: LLMErrorType.MODEL_NOT_FOUND,
                message: `Model not found: ${message}`,
                retryable: false
            };
        }
        if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
            return {
                type: LLMErrorType.NETWORK_ERROR,
                message: `Cannot connect to Ollama: ${message}`,
                retryable: true
            };
        }
        if (message.includes('timeout')) {
            return {
                type: LLMErrorType.TIMEOUT,
                message: `Request timeout: ${message}`,
                retryable: true
            };
        }
        return {
            type: LLMErrorType.UNKNOWN,
            message: message,
            retryable: true
        };
    }
    async getModelInfo() {
        return {
            id: this.currentModel,
            contextWindow: 4096,
            maxTokens: 4096,
            capabilities: ['chat', 'completion']
        };
    }
    async dispose() {
        this._isAvailable = false;
        this.log('info', 'Ollama provider disposed');
    }
}
//# sourceMappingURL=ollama-provider.js.map