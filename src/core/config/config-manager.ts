// src/core/config/config-manager.ts
/**
 * @fileoverview 配置管理器
 * @description 负责加载、验证和合并配置（文件、代码、环境变量）
 * @implements 单例模式（通过 Container 管理）
 * 
 * 配置优先级（从高到低）：
 * 1. 运行时传入的 config 对象
 * 2. 环境变量
 * 3. 配置文件（config.yaml）
 * 4. 默认配置（DEFAULT_CONFIG）
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG, ENV_MAPPINGS } from './default.config.js';

/**
 * 深度合并工具函数
 * @param target 目标对象
 * @param sources 源对象（可多个，后面的覆盖前面的）
 */
function deepMerge<T extends object>(target: T, ...sources: Partial<T>[]): T {
  for (const source of sources) {
    if (!source) continue;
    for (const key in source) {
      const sourceValue = source[key];
      if (sourceValue === undefined) continue;

      const targetValue = (target as any)[key];

      if (typeof sourceValue === 'object' && !Array.isArray(sourceValue) && sourceValue !== null) {
        // 如果目标值不是对象，则初始化为空对象
        (target as any)[key] = deepMerge(
          typeof targetValue === 'object' && !Array.isArray(targetValue) && targetValue !== null ? targetValue : {},
          sourceValue
        );
      } else {
        (target as any)[key] = sourceValue;
      }
    }
  }
  return target;
}

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Configuration validation failed:\n${errors.join('\n')}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * 配置管理器
 * 
 * 使用示例：
 * const configManager = new ConfigManager();
 * await configManager.load('./config.yaml');
 * const llmConfig = configManager.get('llm');
 */
export class ConfigManager {
  private config: Record<string, any> = {};
  private loaded = false;
  private configPath?: string;

  /**
   * 从文件加载配置
   * @param filePath 配置文件路径（YAML 或 JSON）
   */
  async load(filePath?: string): Promise<void> {
    // 1. 从默认配置开始
    this.config = deepMerge({}, DEFAULT_CONFIG);

    // 2. 尝试加载配置文件
    const configFile = filePath || this.findConfigFile();
    if (configFile && fs.existsSync(configFile)) {
      try {
        const content = fs.readFileSync(configFile, 'utf8');
        const fileConfig = this.parseConfig(content, path.extname(configFile));
        this.config = deepMerge(this.config, fileConfig);
        this.configPath = configFile;
      } catch (error) {
        console.warn(`Failed to load config file ${configFile}:`, error);
      }
    }

    // 3. 从环境变量加载（最高优先级，除了运行时配置）
    // 注意：必须先设置 loaded = true，因为 loadFromEnv 内部调用 set，set 会检查 ensureLoaded
    this.loaded = true;
    this.loadFromEnv();
  }

  /**
   * 获取配置项
   * @param key 点分隔的路径（如 'llm.provider'）
   * @param defaultValue 默认值（如果未找到）
   */
  get<T>(key: string, defaultValue?: T): T {
    this.ensureLoaded();
    
    const keys = key.split('.');
    let value: any = this.config;
    
    for (const k of keys) {
      if (value === undefined || value === null) break;
      value = value[k];
    }
    
    if (value !== undefined) {
        return value as T;
    }
    return defaultValue as T;
  }

  /**
   * 获取整个配置对象（只读副本）
   */
  getAll(): Readonly<Record<string, any>> {
    this.ensureLoaded();
    return deepMerge({}, this.config);
  }

  /**
   * 覆盖配置（运行时动态修改）
   * @param key 配置路径
   * @param value 新值
   */
  set<T>(key: string, value: T): void {
    this.ensureLoaded();
    
    const keys = key.split('.');
    let target: any = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!target[k!] || typeof target[k!] !== 'object') {
        target[k!] = {};
      }
      target = target[k!];
    }
    
    target[keys[keys.length - 1]!] = value;
  }

  /**
   * 合并配置对象（批量设置）
   * @param partial 部分配置对象
   */
  merge(partial: Record<string, any>): void {
    this.ensureLoaded();
    this.config = deepMerge(this.config, partial);
  }

  /**
   * 验证配置完整性
   * @throws ConfigValidationError 验证失败时抛出
   */
  validate(): void {
    const errors: string[] = [];

    // 验证 LLM 配置
    const llmProvider = this.get<string>('llm.provider');
    if (!llmProvider) {
      errors.push('LLM provider is required');
    }

    if (llmProvider === 'local') {
      const modelPath = this.get<string>('llm.localOptions.modelPath');
      if (!modelPath) {
        errors.push('Local model path is required when using local provider');
      } else if (!fs.existsSync(modelPath)) {
        errors.push(`Local model file not found: ${modelPath}`);
      }
    }

    if (['openai', 'anthropic'].includes(llmProvider || '')) {
      const apiKey = this.get<string>('llm.apiKey') || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        errors.push(`API key is required for ${llmProvider} provider`);
      }
    }

    // 验证存储配置
    const storageType = this.get<string>('storage.type');
    if (!['sqlite', 'memory', 'redis'].includes(storageType || '')) {
      errors.push(`Unsupported storage type: ${storageType}`);
    }

    if (errors.length > 0) {
      throw new ConfigValidationError(errors);
    }
  }

  /**
   * 获取配置文件路径（如果通过文件加载）
   */
  getConfigPath(): string | undefined {
    return this.configPath;
  }

  /**
   * 重新加载配置
   */
  async reload(): Promise<void> {
    this.loaded = false;
    await this.load(this.configPath);
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
  }

  private findConfigFile(): string | null {
    const candidates = [
      './config.yaml',
      './config.yml',
      './config.json',
      './xzxllm-game.config.yaml',
      process.env.XZXLLM_CONFIG
    ].filter(Boolean) as string[];

    for (const file of candidates) {
      if (fs.existsSync(file)) return file;
    }

    return null;
  }

  private parseConfig(content: string, ext: string): any {
    if (ext === '.json') {
      return JSON.parse(content);
    } else {
      // YAML 解析（需要安装 js-yaml）
      try {
        const yaml = require('js-yaml');
        return yaml.load(content);
      } catch {
        throw new Error('YAML support requires js-yaml package. Install with: npm install js-yaml');
      }
    }
  }

  private loadFromEnv(): void {
    for (const [envKey, configPath] of Object.entries(ENV_MAPPINGS)) {
      if (!configPath) continue; // 跳过无效映射
      const value = process.env[envKey];
      if (value !== undefined) {
        // 尝试解析数字和布尔值
        const parsed = this.parseEnvValue(value);
        this.set(configPath, parsed);
      }
    }
  }

  private parseEnvValue(value: string): any {
    // 布尔值
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // 数字
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    
    // JSON 对象/数组
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    
    return value;
  }
}

/**
 * 创建配置管理器工厂函数
 * 便于依赖注入和测试
 */
export function createConfigManager(): ConfigManager {
  return new ConfigManager();
}