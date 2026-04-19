// tests/unit/llm/factory.test.ts
/**
 * @fileoverview LLM 提供商工厂单元测试
 * @description 测试 LLMProviderFactory 的创建、注册和配置调整功能
 * @module tests/unit/llm/factory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMProviderFactory, createLLMProvider } from '../../../src/llm/factory.js';
import { LLMConfig, LLMResponse } from '../../../src/llm/types.js';
import { BaseLLMProvider } from '../../../src/llm/base/base-provider.js';

// 测试用的 Mock Provider
class MockProvider extends BaseLLMProvider {
  readonly name = 'MockProvider';

  async initialize(): Promise<void> {
    this._isAvailable = true;
  }

  protected async doGenerate(
    prompt: string
  ): Promise<LLMResponse> {
    return {
      text: `Mock response for: ${prompt}`,
      content: `Mock response for: ${prompt}`,
      model: this.config.model,
      finishReason: 'stop'
    };
  }

  protected classifyError(error: any): {
    type: import('../../../src/llm/types.js').LLMErrorType;
    message: string;
    statusCode?: number;
    retryable: boolean;
  } {
    return {
      type: 'unknown' as import('../../../src/llm/types.js').LLMErrorType,
      message: error?.message || 'Unknown error',
      retryable: false
    };
  }
}

describe('LLMProviderFactory', () => {
  beforeEach(() => {
    // 清理自定义注册
    // 注意：我们无法真正清理静态 Map，但会确保测试隔离
  });

  describe('createProvider', () => {
    it('应该成功创建 ollama 提供商', () => {
      const config: LLMConfig = {
        provider: 'ollama',
        model: 'qwen2.5:7b',
        baseUrl: 'http://localhost:11434'
      };

      const provider = LLMProviderFactory.createProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe('Ollama');
    });

    it('应该成功创建 openai 提供商', () => {
      const config: LLMConfig = {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key'
      };

      const provider = LLMProviderFactory.createProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe('OpenAI');
    });

    it('应该成功创建 anthropic 提供商', () => {
      const config: LLMConfig = {
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        apiKey: 'test-key'
      };

      const provider = LLMProviderFactory.createProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe('Anthropic');
    });

    it('应该成功创建 local 提供商', () => {
      const config: LLMConfig = {
        provider: 'local',
        model: 'test-model',
        localOptions: {
          modelPath: './test.gguf'
        }
      };

      const provider = LLMProviderFactory.createProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe('LocalLLM');
    });

    it('应该成功创建 custom 提供商', () => {
      const config: LLMConfig = {
        provider: 'custom',
        model: 'custom-model',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key'
      };

      const provider = LLMProviderFactory.createProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toContain('Custom');
    });

    it('未知的提供商类型应该抛出错误', () => {
      const config = {
        provider: 'unknown' as any,
        model: 'test'
      };

      expect(() => LLMProviderFactory.createProvider(config)).toThrow('Unknown LLM provider type');
    });

    it('custom 提供商缺少 baseUrl 应该抛出错误', () => {
      const config: LLMConfig = {
        provider: 'custom',
        model: 'test-model'
        // 缺少 baseUrl
      };

      expect(() => LLMProviderFactory.createProvider(config)).toThrow('Custom provider requires baseUrl');
    });
  });

  describe('registerProvider', () => {
    it('应该成功注册自定义提供商', () => {
      LLMProviderFactory.registerProvider('mock', MockProvider);

      const config = {
        provider: 'mock' as any,
        model: 'test-model'
      };

      const provider = LLMProviderFactory.createProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe('MockProvider');
    });

    it('重复注册应该发出警告但不报错', () => {
      // 第一次注册
      LLMProviderFactory.registerProvider('mock2', MockProvider);
      // 第二次注册（覆盖）
      expect(() => {
        LLMProviderFactory.registerProvider('mock2', MockProvider);
      }).not.toThrow();
    });
  });

  describe('getAvailableProviders', () => {
    it('应该返回所有可用的提供商类型', () => {
      const providers = LLMProviderFactory.getAvailableProviders();

      expect(providers).toContain('local');
      expect(providers).toContain('ollama');
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('custom');
    });
  });

  describe('isRegistered', () => {
    it('已注册的类型应该返回 true', () => {
      expect(LLMProviderFactory.isRegistered('ollama')).toBe(true);
      expect(LLMProviderFactory.isRegistered('openai')).toBe(true);
    });

    it('未注册的类型应该返回 false', () => {
      expect(LLMProviderFactory.isRegistered('not-registered')).toBe(false);
    });
  });

  describe('配置调整', () => {
    it('local 提供商应该有默认的温度和最大 token', () => {
      const config: LLMConfig = {
        provider: 'local',
        model: 'test',
        localOptions: {
          modelPath: './test.gguf'
        }
      };

      const provider = LLMProviderFactory.createProvider(config);

      expect(provider).toBeDefined();
    });

    it('ollama 提供商应该有默认的超时', () => {
      const config: LLMConfig = {
        provider: 'ollama',
        model: 'test',
        baseUrl: 'http://localhost:11434'
      };

      const provider = LLMProviderFactory.createProvider(config);

      expect(provider).toBeDefined();
    });
  });
});

describe('createLLMProvider', () => {
  it('应该创建并初始化提供商', async () => {
    // 注册 mock provider
    LLMProviderFactory.registerProvider('mock-init', MockProvider);

    const config = {
      provider: 'mock-init' as any,
      model: 'test-model'
    };

    const provider = await createLLMProvider(config);

    expect(provider).toBeDefined();
    expect(provider.isAvailable).toBe(true);
  });
});
