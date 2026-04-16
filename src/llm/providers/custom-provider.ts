// src/llm/providers/custom-provider.ts
/**
 * @fileoverview 自定义提供商
 * @description 支持任何 OpenAI 兼容的 API 端点
 * @module llm/providers/custom
 * 
 * 适用场景：
 * - LiteLLM 代理
 * - LocalAI
 * - FastChat
 * - 其他 OpenAI API 格式兼容的服务
 */

import { LLMConfig } from '../types.js';
import { OpenAIProvider } from './openai-provider.js';

/**
 * 自定义提供商
 * 继承 OpenAI 提供商，但强制要求 baseUrl
 */
export class CustomProvider extends OpenAIProvider {
  readonly name: string;

  constructor(config: LLMConfig) {
    // 验证自定义端点
    if (!config.baseUrl) {
      throw new Error(
        'Custom provider requires baseUrl in config.\n' +
        'Example: https://api.litellm.ai/v1 or http://localhost:8000/v1'
      );
    }
    
    super(config);
    this.name = `Custom(${new URL(config.baseUrl!).hostname})`;
  }

  // 继承 OpenAIProvider 的所有方法
  // 可在此覆盖特定方法以适配非标准实现
}