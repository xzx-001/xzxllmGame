// src/llm/factory.ts
/**
 * @fileoverview LLM 提供商工厂
 * @description 根据配置动态创建对应的 LLM 提供商实例
 * @module llm/factory
 * 
 * 设计模式：工厂方法 + 注册表
 * 支持运行时动态注册新的提供商类型
 */

import { ILLMProvider, LLMConfig, LLMProviderType } from './types.js';
import { LocalLLMProvider } from './providers/local-provider.js';
import { OllamaProvider } from './providers/ollama-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { CustomProvider } from './providers/custom-provider.js';

/**
 * 提供商构造函数类型
 */
type ProviderConstructor = new (config: LLMConfig) => ILLMProvider;

/**
 * LLM 提供商工厂
 * 
 * 职责：
 * 1. 维护提供商类型到构造函数的映射
 * 2. 根据配置创建正确的提供商实例
 * 3. 支持运行时注册自定义提供商
 * 
 * @example
 * // 标准用法
 * const provider = LLMProviderFactory.createProvider({
 *   provider: 'ollama',
 *   model: 'qwen2.5:7b'
 * });
 * 
 * // 注册自定义提供商
 * LLMProviderFactory.registerProvider('myapi', MyAPIProvider);
 */
export class LLMProviderFactory {
  /** 提供商注册表 */
  private static providers = new Map<LLMProviderType | string, ProviderConstructor>([
    ['local', LocalLLMProvider],
    ['ollama', OllamaProvider],
    ['openai', OpenAIProvider],
    ['anthropic', AnthropicProvider],
    ['custom', CustomProvider],
  ]);

  /**
   * 创建 LLM 提供商实例
   * 
   * 流程：
   * 1. 根据 config.provider 查找对应的构造函数
   * 2. 调整配置（如为特定提供商设置默认参数）
   * 3. 实例化提供商
   * 4. 返回实例（尚未初始化，需调用 initialize()）
   * 
   * @param config LLM 配置对象
   * @returns 提供商实例（未初始化）
   * @throws 未知的提供商类型
   * 
   * @example
   * const provider = LLMProviderFactory.createProvider({
   *   provider: 'ollama',
   *   model: 'llama3',
   *   baseUrl: 'http://localhost:11434'
   * });
   * await provider.initialize();
   */
  static createProvider(config: LLMConfig): ILLMProvider {
    const ProviderClass = this.providers.get(config.provider);
    
    if (!ProviderClass) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new Error(
        `Unknown LLM provider type: "${config.provider}".\n` +
        `Available providers: ${available}\n` +
        `You can register custom providers using LLMProviderFactory.registerProvider()`
      );
    }

    // 深拷贝配置，防止外部修改影响实例
    const adjustedConfig = this.adjustConfig(config);
    
    // 创建实例
    return new ProviderClass(adjustedConfig);
  }

  /**
   * 注册自定义提供商
   * 
   * 用于扩展框架支持新的 LLM 后端：
   * - 私有部署的模型
   * - 新兴的 API 服务
   * - 实验性提供商
   * 
   * @param type 提供商类型标识符（唯一）
   * @param providerClass 实现 ILLMProvider 的类
   * 
   * @example
   * class MyProvider extends BaseLLMProvider {
   *   // 实现抽象方法
   * }
   * 
   * LLMProviderFactory.registerProvider('myprovider', MyProvider);
   * 
   * const provider = LLMProviderFactory.createProvider({
   *   provider: 'myprovider',
   *   model: 'my-model'
   * });
   */
  static registerProvider(type: string, providerClass: ProviderConstructor): void {
    if (this.providers.has(type)) {
      console.warn(`Provider "${type}" is being overwritten`);
    }
    
    this.providers.set(type, providerClass);
    console.log(`[LLMFactory] Registered custom provider: ${type}`);
  }

  /**
   * 获取所有可用的提供商类型
   * @returns 提供商类型列表
   */
  static getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 检查提供商类型是否已注册
   * @param type 提供商类型
   */
  static isRegistered(type: string): boolean {
    return this.providers.has(type);
  }

  /**
   * 调整配置（为特定提供商设置默认值）
   * @param config 原始配置
   * @returns 调整后的配置
   */
  private static adjustConfig(config: LLMConfig): LLMConfig {
    // 深拷贝
    const adjusted: LLMConfig = {
      ...config,
      defaults: { ...config.defaults }
    };

    // 为特定提供商设置智能默认值
    switch (config.provider) {
      case 'local':
        // 本地模型默认更低温度（更确定性）
        adjusted.defaults = {
          temperature: 0.6,
          maxTokens: 2048,
          ...adjusted.defaults
        };
        break;
        
      case 'ollama':
        // Ollama 默认超时更长（首次生成可能慢）
        adjusted.timeout = config.timeout || 60000;
        break;
        
      case 'anthropic':
        // Claude 默认温度
        adjusted.defaults = {
          temperature: 0.7,
          ...adjusted.defaults
        };
        // Claude 有时需要更长超时
        adjusted.timeout = config.timeout || 60000;
        break;
        
      case 'custom':
        // 自定义提供商默认使用 OpenAI 格式
        if (!adjusted.baseUrl) {
          throw new Error('Custom provider requires baseUrl');
        }
        break;
    }

    return adjusted;
  }
}

/**
 * 便捷的创建函数
 * 快速创建并初始化提供商
 * 
 * @example
 * const provider = await createLLMProvider({
 *   provider: 'ollama',
 *   model: 'qwen2.5:7b'
 * });
 * // 已初始化，可直接使用
 */
export async function createLLMProvider(config: LLMConfig): Promise<ILLMProvider> {
  const provider = LLMProviderFactory.createProvider(config);
  await provider.initialize();
  return provider;
}