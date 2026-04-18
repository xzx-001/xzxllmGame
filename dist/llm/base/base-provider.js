import { LLMError, LLMErrorType } from './../types.js';
export class BaseLLMProvider {
    _isAvailable = false;
    config;
    retryPolicy;
    defaultOptions;
    constructor(config) {
        this.config = config;
        this.retryPolicy = {
            maxAttempts: config.retryAttempts ?? 3,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
            retryableErrors: [
                LLMErrorType.NETWORK_ERROR,
                LLMErrorType.TIMEOUT,
                LLMErrorType.RATE_LIMIT,
                LLMErrorType.SERVER_ERROR
            ]
        };
        this.defaultOptions = {
            temperature: config.defaults?.temperature ?? 0.7,
            maxTokens: config.defaults?.maxTokens ?? 1024,
            timeout: config.timeout ?? 30000,
            ...config.defaults
        };
    }
    get isAvailable() {
        return this._isAvailable;
    }
    async generate(prompt, options = {}) {
        const mergedOptions = {
            ...this.defaultOptions,
            ...options,
            stopSequences: [
                ...(this.defaultOptions.stopSequences || []),
                ...(options.stopSequences || [])
            ]
        };
        if (!this._isAvailable) {
            throw new LLMError(`${this.name} provider is not initialized or has been disposed`, LLMErrorType.UNKNOWN, this.name, undefined, false);
        }
        let lastError;
        for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt++) {
            try {
                const startTime = Date.now();
                let response;
                if (mergedOptions.timeout && mergedOptions.timeout > 0) {
                    response = await this.withTimeout(this.doGenerate(prompt, mergedOptions), mergedOptions.timeout);
                }
                else {
                    response = await this.doGenerate(prompt, mergedOptions);
                }
                if (process.env.DEBUG_LLM === 'true') {
                    const duration = Date.now() - startTime;
                    console.log(`[${this.name}] Generation succeeded (${duration}ms)`);
                }
                return response;
            }
            catch (error) {
                const classified = this.classifyError(error);
                lastError = new LLMError(classified.message, classified.type, this.name, classified.statusCode, classified.retryable);
                const shouldRetry = attempt < this.retryPolicy.maxAttempts &&
                    this.retryPolicy.retryableErrors.includes(classified.type) &&
                    classified.retryable;
                if (shouldRetry) {
                    const delay = this.calculateBackoff(attempt);
                    console.warn(`[${this.name}] Attempt ${attempt}/${this.retryPolicy.maxAttempts} failed ` +
                        `(${classified.type}), retrying in ${delay}ms...`);
                    await this.sleep(delay);
                }
                else {
                    throw lastError;
                }
            }
        }
        throw new LLMError(`Failed after ${this.retryPolicy.maxAttempts} attempts. Last error: ${lastError?.message}`, lastError?.type || LLMErrorType.UNKNOWN, this.name, lastError?.statusCode, false);
    }
    async healthCheck() {
        try {
            const response = await this.generate("Hi", {
                maxTokens: 5,
                temperature: 0,
                timeout: 10000
            });
            return response.finishReason !== 'error' && response.content.length > 0;
        }
        catch (error) {
            console.warn(`[${this.name}] Health check failed:`, error);
            return false;
        }
    }
    async dispose() {
        this._isAvailable = false;
        console.log(`[${this.name}] Provider disposed`);
    }
    withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Request timeout after ${ms}ms`));
                }, ms);
            })
        ]);
    }
    calculateBackoff(attempt) {
        const exponential = this.retryPolicy.baseDelay *
            Math.pow(this.retryPolicy.backoffMultiplier, attempt - 1);
        const capped = Math.min(exponential, this.retryPolicy.maxDelay);
        const jitter = Math.random() * 1000;
        return Math.floor(capped + jitter);
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    log(level, message, meta) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.name}]`;
        if (meta) {
            console[level](`${prefix} ${message}`, meta);
        }
        else {
            console[level](`${prefix} ${message}`);
        }
    }
}
//# sourceMappingURL=base-provider.js.map