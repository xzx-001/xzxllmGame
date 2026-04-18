import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG, ENV_MAPPINGS } from './default.config.js';
function deepMerge(target, ...sources) {
    for (const source of sources) {
        if (!source)
            continue;
        for (const key in source) {
            const sourceValue = source[key];
            if (sourceValue === undefined)
                continue;
            const targetValue = target[key];
            if (typeof sourceValue === 'object' && !Array.isArray(sourceValue) && sourceValue !== null) {
                target[key] = deepMerge(typeof targetValue === 'object' && !Array.isArray(targetValue) && targetValue !== null ? targetValue : {}, sourceValue);
            }
            else {
                target[key] = sourceValue;
            }
        }
    }
    return target;
}
export class ConfigValidationError extends Error {
    errors;
    constructor(errors) {
        super(`Configuration validation failed:\n${errors.join('\n')}`);
        this.errors = errors;
        this.name = 'ConfigValidationError';
    }
}
export class ConfigManager {
    config = {};
    loaded = false;
    configPath;
    async load(filePath) {
        this.config = deepMerge({}, DEFAULT_CONFIG);
        const configFile = filePath || this.findConfigFile();
        if (configFile && fs.existsSync(configFile)) {
            try {
                const content = fs.readFileSync(configFile, 'utf8');
                const fileConfig = this.parseConfig(content, path.extname(configFile));
                this.config = deepMerge(this.config, fileConfig);
                this.configPath = configFile;
            }
            catch (error) {
                console.warn(`Failed to load config file ${configFile}:`, error);
            }
        }
        this.loadFromEnv();
        this.loaded = true;
    }
    get(key, defaultValue) {
        this.ensureLoaded();
        const keys = key.split('.');
        let value = this.config;
        for (const k of keys) {
            if (value === undefined || value === null)
                break;
            value = value[k];
        }
        if (value !== undefined) {
            return value;
        }
        return defaultValue;
    }
    getAll() {
        this.ensureLoaded();
        return deepMerge({}, this.config);
    }
    set(key, value) {
        this.ensureLoaded();
        const keys = key.split('.');
        let target = this.config;
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!target[k] || typeof target[k] !== 'object') {
                target[k] = {};
            }
            target = target[k];
        }
        target[keys[keys.length - 1]] = value;
    }
    merge(partial) {
        this.ensureLoaded();
        this.config = deepMerge(this.config, partial);
    }
    validate() {
        const errors = [];
        const llmProvider = this.get('llm.provider');
        if (!llmProvider) {
            errors.push('LLM provider is required');
        }
        if (llmProvider === 'local') {
            const modelPath = this.get('llm.localOptions.modelPath');
            if (!modelPath) {
                errors.push('Local model path is required when using local provider');
            }
            else if (!fs.existsSync(modelPath)) {
                errors.push(`Local model file not found: ${modelPath}`);
            }
        }
        if (['openai', 'anthropic'].includes(llmProvider || '')) {
            const apiKey = this.get('llm.apiKey') || process.env.OPENAI_API_KEY;
            if (!apiKey) {
                errors.push(`API key is required for ${llmProvider} provider`);
            }
        }
        const storageType = this.get('storage.type');
        if (!['sqlite', 'memory', 'redis'].includes(storageType || '')) {
            errors.push(`Unsupported storage type: ${storageType}`);
        }
        if (errors.length > 0) {
            throw new ConfigValidationError(errors);
        }
    }
    getConfigPath() {
        return this.configPath;
    }
    async reload() {
        this.loaded = false;
        await this.load(this.configPath);
    }
    ensureLoaded() {
        if (!this.loaded) {
            throw new Error('Configuration not loaded. Call load() first.');
        }
    }
    findConfigFile() {
        const candidates = [
            './config.yaml',
            './config.yml',
            './config.json',
            './xzxllm-game.config.yaml',
            process.env.XZXLLM_CONFIG
        ].filter(Boolean);
        for (const file of candidates) {
            if (fs.existsSync(file))
                return file;
        }
        return null;
    }
    parseConfig(content, ext) {
        if (ext === '.json') {
            return JSON.parse(content);
        }
        else {
            try {
                const yaml = require('js-yaml');
                return yaml.load(content);
            }
            catch {
                throw new Error('YAML support requires js-yaml package. Install with: npm install js-yaml');
            }
        }
    }
    loadFromEnv() {
        for (const [envKey, configPath] of Object.entries(ENV_MAPPINGS)) {
            if (!configPath)
                continue;
            const value = process.env[envKey];
            if (value !== undefined) {
                const parsed = this.parseEnvValue(value);
                this.set(configPath, parsed);
            }
        }
    }
    parseEnvValue(value) {
        if (value.toLowerCase() === 'true')
            return true;
        if (value.toLowerCase() === 'false')
            return false;
        if (/^\d+$/.test(value))
            return parseInt(value, 10);
        if (/^\d+\.\d+$/.test(value))
            return parseFloat(value);
        if (value.startsWith('{') || value.startsWith('[')) {
            try {
                return JSON.parse(value);
            }
            catch {
                return value;
            }
        }
        return value;
    }
}
export function createConfigManager() {
    return new ConfigManager();
}
//# sourceMappingURL=config-manager.js.map