// tests/unit/llm/providers.test.ts
/**
 * @fileoverview LLM 提供商单元测试
 * @description 测试各个 LLM 提供商的基础功能和错误处理
 * @module tests/unit/llm/providers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseLLMProvider } from '../../../src/llm/base/base-provider.js';
import { LLMConfig, LLMErrorType, LLMResponse, LLMError } from '../../../src/llm/types.js';

// Mock Provider 实现用于测试基类
class TestProvider extends BaseLLMProvider {
  readonly name = 'TestProvider';
  private shouldFail = false;
  private failCount = 0;
  private currentFail = 0;

  constructor(config: LLMConfig) {
    super(config);
  }

  setFailPattern(count: number): void {
    this.shouldFail = true;
    this.failCount = count;
    this.currentFail = 0;
  }

  async initialize(): Promise<void> {
    this._isAvailable = true;
  }

  protected async doGenerate(
    prompt: string
  ): Promise<LLMResponse> {
    if (this.shouldFail && this.currentFail < this.failCount) {
      this.currentFail++;
      throw new Error(`Simulated failure ${this.currentFail}/${this.failCount}`);
    }

    return {
      text: `Response to: ${prompt}`,
      content: `Response to: ${prompt}`,
      model: this.config.model,
      finishReason: 'stop',
      usage: {
        promptTokens: prompt.length,
        completionTokens: 10,
        totalTokens: prompt.length + 10
      }
    };
  }

  protected classifyError(error: any): {
    type: LLMErrorType;
    message: string;
    statusCode?: number;
    retryable: boolean;
  } {
    if (error.message?.includes('timeout')) {
      return {
        type: LLMErrorType.TIMEOUT,
        message: error.message,
        retryable: true
      };
    }
    if (error.message?.includes('network')) {
      return {
        type: LLMErrorType.NETWORK_ERROR,
        message: error.message,
        retryable: true
      };
    }
    if (error.message?.includes('Simulated failure')) {
      // 模拟失败是可重试的，用于测试
      return {
        type: LLMErrorType.SERVER_ERROR,
        message: error.message,
        retryable: true
      };
    }
    return {
      type: LLMErrorType.UNKNOWN,
      message: error.message || 'Unknown error',
      retryable: false
    };
  }
}

describe('BaseLLMProvider', () => {
  let provider: TestProvider;
  const baseConfig: LLMConfig = {
    provider: 'custom',
    model: 'test-model',
    baseUrl: 'http://localhost:11434'
  };

  beforeEach(() => {
    provider = new TestProvider(baseConfig);
  });

  describe('初始化', () => {
    it('初始化后应该设置为可用状态', async () => {
      expect(provider.isAvailable).toBe(false);
      await provider.initialize();
      expect(provider.isAvailable).toBe(true);
    });
  });

  describe('generate', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('应该成功生成响应', async () => {
      const response = await provider.generate('Hello');

      expect(response).toBeDefined();
      expect(response.content).toBe('Response to: Hello');
      expect(response.model).toBe('test-model');
      expect(response.finishReason).toBe('stop');
    });

    it('未初始化时应该抛出错误', async () => {
      const uninitializedProvider = new TestProvider(baseConfig);

      await expect(uninitializedProvider.generate('Hello')).rejects.toThrow();
    });

    it('应该合并默认选项和用户选项', async () => {
      const providerWithDefaults = new TestProvider({
        ...baseConfig,
        defaults: {
          temperature: 0.5,
          maxTokens: 500
        }
      });
      await providerWithDefaults.initialize();

      const response = await providerWithDefaults.generate('Test', {
        temperature: 0.8
      });

      expect(response).toBeDefined();
    });
  });

  describe('重试机制', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('应该成功重试并最终成功', async () => {
      provider.setFailPattern(2); // 前2次失败

      const response = await provider.generate('Test');

      expect(response).toBeDefined();
      expect(response.content).toBe('Response to: Test');
    });

    it('超过最大重试次数应该抛出错误', async () => {
      provider.setFailPattern(5); // 超过默认的3次重试

      await expect(provider.generate('Test')).rejects.toThrow();
    });
  });

  describe('healthCheck', () => {
    it('健康检查应该返回 true 当服务正常', async () => {
      await provider.initialize();

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(true);
    });

    it('健康检查应该返回 false 当服务异常', async () => {
      await provider.initialize();
      provider.setFailPattern(10); // 持续失败

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(false);
    });
  });

  describe('dispose', () => {
    it('dispose 后应该设置为不可用', async () => {
      await provider.initialize();
      expect(provider.isAvailable).toBe(true);

      await provider.dispose();

      expect(provider.isAvailable).toBe(false);
    });
  });
});

describe('LLMError', () => {
  it('应该正确创建错误对象', () => {
    const error = new LLMError(
      'Test error',
      LLMErrorType.NETWORK_ERROR,
      'TestProvider',
      500,
      true
    );

    expect(error.message).toBe('Test error');
    expect(error.type).toBe(LLMErrorType.NETWORK_ERROR);
    expect(error.provider).toBe('TestProvider');
    expect(error.statusCode).toBe(500);
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('LLMError');
  });
});

// Mock 具体的提供商实现
describe('Provider Implementations (Mocked)', () => {
  describe('OllamaProvider', () => {
    it('应该有正确的提供商名称', async () => {
      const { OllamaProvider } = await import('../../../src/llm/providers/ollama-provider.js');
      const provider = new OllamaProvider({
        provider: 'ollama',
        model: 'llama3',
        baseUrl: 'http://localhost:11434'
      });

      expect(provider.name).toBe('Ollama');
    });
  });

  describe('OpenAIProvider', () => {
    it('应该有正确的提供商名称', async () => {
      const { OpenAIProvider } = await import('../../../src/llm/providers/openai-provider.js');
      const provider = new OpenAIProvider({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key'
      });

      expect(provider.name).toBe('OpenAI');
    });
  });

  describe('AnthropicProvider', () => {
    it('应该有正确的提供商名称', async () => {
      const { AnthropicProvider } = await import('../../../src/llm/providers/anthropic-provider.js');
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        apiKey: 'test-key'
      });

      expect(provider.name).toBe('Anthropic');
    });
  });

  describe('LocalLLMProvider', () => {
    it('应该有正确的提供商名称', async () => {
      const { LocalLLMProvider } = await import('../../../src/llm/providers/local-provider.js');
      const provider = new LocalLLMProvider({
        provider: 'local',
        model: 'test-model',
        localOptions: {
          modelPath: './test.gguf'
        }
      });

      expect(provider.name).toBe('LocalLLM');
    });
  });

  describe('CustomProvider', () => {
    it('应该有正确的提供商名称', async () => {
      const { CustomProvider } = await import('../../../src/llm/providers/custom-provider.js');
      const provider = new CustomProvider({
        provider: 'custom',
        model: 'custom-model',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key'
      });

      expect(provider.name).toContain('Custom');
    });
  });
});
