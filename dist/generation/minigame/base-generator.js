export class BaseMiniGameGenerator {
    options;
    constructor(options = {}) {
        this.options = {
            maxRetries: options.maxRetries ?? 3,
            retryDelay: options.retryDelay ?? 1000,
            timeout: options.timeout ?? 30000,
            validateSolvability: options.validateSolvability ?? true,
            debug: options.debug ?? false
        };
    }
    async generate(context) {
        const startTime = Date.now();
        let lastError;
        if (context.targetDifficulty < this.supportedDifficultyRange[0] ||
            context.targetDifficulty > this.supportedDifficultyRange[1]) {
            console.warn(`[${this.name}] Difficulty ${context.targetDifficulty} out of range ` +
                `[${this.supportedDifficultyRange.join('-')}], clamping...`);
            context.targetDifficulty = Math.max(this.supportedDifficultyRange[0], Math.min(this.supportedDifficultyRange[1], context.targetDifficulty));
        }
        for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {
                const prompt = this.buildPrompt(context);
                const llmResponse = await this.callLLM(context, prompt);
                const zone = this.parseResponse(llmResponse, context.zoneId, context.position);
                const validation = this.validate(zone);
                if (!validation.valid) {
                    lastError = `Validation failed: ${validation.errors.join(', ')}`;
                    console.warn(`[${this.name}] Attempt ${attempt} failed validation:`, validation.errors);
                    if (attempt < this.options.maxRetries) {
                        await this.delay(this.options.retryDelay * attempt);
                        continue;
                    }
                }
                if (this.options.validateSolvability && this.checkSolvability) {
                    const solvability = this.checkSolvability(zone.initialConfig);
                    if (!solvability.solvable) {
                        lastError = 'Generated puzzle is not solvable';
                        console.warn(`[${this.name}] Attempt ${attempt} generated unsolvable puzzle`);
                        if (attempt < this.options.maxRetries) {
                            await this.delay(this.options.retryDelay * attempt);
                            continue;
                        }
                    }
                }
                const generationTime = Date.now() - startTime;
                return {
                    success: true,
                    config: zone.initialConfig,
                    usedPrompt: this.options.debug ? prompt : undefined,
                    rawResponse: this.options.debug ? llmResponse : undefined,
                    metadata: {
                        generationTime,
                        attempts: attempt
                    }
                };
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                console.error(`[${this.name}] Attempt ${attempt} error:`, lastError);
                if (attempt < this.options.maxRetries) {
                    await this.delay(this.options.retryDelay * attempt);
                }
            }
        }
        console.warn(`[${this.name}] All ${this.options.maxRetries} attempts failed, using fallback`);
        try {
            const fallbackZone = this.generateFallback(context);
            return {
                success: true,
                config: fallbackZone.initialConfig,
                error: `Used fallback after ${this.options.maxRetries} failed attempts. Last error: ${lastError}`,
                metadata: {
                    generationTime: Date.now() - startTime,
                    attempts: this.options.maxRetries
                }
            };
        }
        catch (fallbackError) {
            return {
                success: false,
                error: `Failed to generate and fallback also failed. ` +
                    `Last generation error: ${lastError}. ` +
                    `Fallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
                metadata: {
                    generationTime: Date.now() - startTime,
                    attempts: this.options.maxRetries
                }
            };
        }
    }
    async callLLM(context, prompt) {
        const timeout = context.timeout || this.options.timeout;
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Generation timeout after ${timeout}ms`)), timeout);
        });
        const llmPromise = context.llmProvider.generate(prompt, {
            temperature: 0.7,
            maxTokens: 2000
        });
        const response = await Promise.race([llmPromise, timeoutPromise]);
        return response.text;
    }
    extractJSON(response, zoneId) {
        const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
            return jsonBlockMatch[1].trim();
        }
        const genericBlockMatch = response.match(/```\s*([\s\S]*?)\s*```/);
        if (genericBlockMatch) {
            return genericBlockMatch[1].trim();
        }
        const firstBrace = response.indexOf('{');
        const lastBrace = response.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return response.slice(firstBrace, lastBrace + 1);
        }
        const firstBracket = response.indexOf('[');
        const lastBracket = response.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            return response.slice(firstBracket, lastBracket + 1);
        }
        throw new Error(`Cannot extract JSON from LLM response for zone ${zoneId}`);
    }
    validateCommon(zone) {
        const errors = [];
        const warnings = [];
        if (!zone.id || zone.id.trim() === '') {
            errors.push('Zone ID is required');
        }
        if (!zone.type) {
            errors.push('Game type is required');
        }
        if (zone.size.width < this.minSize.width || zone.size.height < this.minSize.height) {
            errors.push(`Zone size ${zone.size.width}x${zone.size.height} is smaller than ` +
                `minimum required ${this.minSize.width}x${this.minSize.height}`);
        }
        if (zone.difficulty < 0 || zone.difficulty > 1) {
            errors.push(`Difficulty ${zone.difficulty} out of range [0, 1]`);
        }
        if (!zone.initialConfig) {
            errors.push('Initial config is required');
        }
        if (zone.initialConfig && zone.initialConfig.type !== this.type) {
            warnings.push(`Config type "${zone.initialConfig.type}" does not match ` +
                `generator type "${this.type}"`);
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    generateId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    interpolate(difficulty, min, max) {
        return min + (max - min) * difficulty;
    }
    selectByDifficulty(difficulty, options) {
        const sorted = [...options].sort((a, b) => a.threshold - b.threshold);
        for (const option of sorted) {
            if (difficulty <= option.threshold) {
                return option.value;
            }
        }
        if (sorted.length === 0) {
            throw new Error("Options array cannot be empty");
        }
        return sorted[sorted.length - 1].value;
    }
}
//# sourceMappingURL=base-generator.js.map