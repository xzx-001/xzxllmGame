import { BaseLLMProvider } from '../base/base-provider.js';
import { LLMErrorType } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';
let llamaModule;
let LlamaChatSession;
let getLlama;
export class LocalLLMProvider extends BaseLLMProvider {
    name = 'LocalLLM';
    model = null;
    context = null;
    modelInfo = null;
    constructor(config) {
        super(config);
        if (!config.localOptions?.modelPath) {
            throw new Error('LocalLLM requires config.localOptions.modelPath');
        }
    }
    async initialize() {
        const modelPath = this.config.localOptions.modelPath;
        if (!fs.existsSync(modelPath)) {
            throw new Error(`Model file not found: ${modelPath}\n` +
                `Please download the model and place it at the specified path.\n` +
                `Example: wget https://huggingface.co/.../model.gguf -O ${modelPath}`);
        }
        const stats = fs.statSync(modelPath);
        this.modelInfo = {
            path: modelPath,
            size: Math.round(stats.size / 1024 / 1024),
            gpuLayers: this.config.localOptions.gpuLayers ?? 0,
            contextSize: this.config.localOptions.contextSize ?? 4096
        };
        this.log('info', `Initializing with model: ${path.basename(modelPath)} ` +
            `(${this.modelInfo.size}MB, ${this.modelInfo.gpuLayers} GPU layers)`);
        try {
            llamaModule = await import('node-llama-cpp');
            getLlama = llamaModule.getLlama;
            LlamaChatSession = llamaModule.LlamaChatSession;
        }
        catch (error) {
            throw new Error(`Failed to load node-llama-cpp. Please install it:\n` +
                `npm install node-llama-cpp\n\n` +
                `Note: This package requires compilation tools (Python, CMake, C++ compiler).\n` +
                `See: https://github.com/withcatai/node-llama-cpp`);
        }
        const llama = await getLlama({
            logLevel: process.env.NODE_ENV === 'development' ? 'info' : 'error',
        });
        this.log('info', 'Loading model into memory...');
        this.model = await llama.loadModel({
            modelPath: modelPath,
            gpuLayers: this.modelInfo.gpuLayers,
            useMmap: this.config.localOptions?.useMmap ?? true,
            useMlock: this.config.localOptions?.useMlock ?? false,
            vocabOnly: false,
        });
        this.context = await this.model.createContext({
            contextSize: this.modelInfo.contextSize,
            threads: this.config.localOptions?.threads ?? 4,
            batchSize: 512,
        });
        this._isAvailable = true;
        this.log('info', `Model loaded successfully. Context size: ${this.modelInfo.contextSize}`);
        await this.warmup();
    }
    async doGenerate(prompt, options) {
        if (!this.context || !this._isAvailable) {
            throw new Error('Model not initialized');
        }
        const contextSequence = this.context.getSequence();
        const session = new LlamaChatSession({
            contextSequence,
            systemPrompt: options.systemPrompt || 'You are a helpful assistant.',
        });
        try {
            const result = await session.prompt(prompt, {
                maxTokens: options.maxTokens ?? 1024,
                temperature: options.temperature ?? 0.7,
                stop: options.stopSequences,
                repeatPenalty: {
                    penalty: options.repeatPenalty ?? 1.1,
                    penalizeNewLine: false,
                },
                topP: options.topP ?? 1.0,
                seed: options.seed,
            });
            return {
                text: result,
                content: result,
                model: path.basename(this.modelInfo.path),
                finishReason: 'stop',
                usage: {
                    promptTokens: this.estimateTokens(prompt),
                    completionTokens: this.estimateTokens(result),
                    totalTokens: this.estimateTokens(prompt) + this.estimateTokens(result),
                }
            };
        }
        finally {
            session.dispose();
        }
    }
    classifyError(error) {
        const message = error.message || String(error);
        if (message.includes('CUDA') || message.includes('out of memory')) {
            return {
                type: LLMErrorType.SERVER_ERROR,
                message: `GPU memory error: ${message}`,
                retryable: false
            };
        }
        if (message.includes('context size') || message.includes('too long')) {
            return {
                type: LLMErrorType.CONTEXT_LENGTH_EXCEEDED,
                message: `Input too long for context window: ${message}`,
                retryable: false
            };
        }
        if (message.includes('model') && message.includes('not found')) {
            return {
                type: LLMErrorType.MODEL_NOT_FOUND,
                message: message,
                retryable: false
            };
        }
        return {
            type: LLMErrorType.UNKNOWN,
            message: message,
            retryable: true
        };
    }
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
    async dispose() {
        this.log('info', 'Disposing model resources...');
        if (this.context) {
            try {
                this.context.dispose();
            }
            catch (e) {
                this.log('warn', 'Error disposing context', e);
            }
            this.context = null;
        }
        if (this.model) {
            try {
                if (this.model.dispose) {
                    this.model.dispose();
                }
            }
            catch (e) {
                this.log('warn', 'Error disposing model', e);
            }
            this.model = null;
        }
        this._isAvailable = false;
        this.log('info', 'Model resources released');
    }
    async warmup() {
        try {
            this.log('debug', 'Warming up model...');
            await this.doGenerate('Hello', { maxTokens: 10, temperature: 0 });
            this.log('debug', 'Warmup complete');
        }
        catch (error) {
            this.log('warn', 'Warmup failed (non-critical)', error);
        }
    }
}
//# sourceMappingURL=local-provider.js.map