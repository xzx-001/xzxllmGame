// src/llm/providers/anthropic-provider.ts
/**
 * @fileoverview Anthropic (Claude) 提供商
 * @description 支持 Claude 3 (Opus/Sonnet/Haiku) 模型
 * @module llm/providers/anthropic
 */

import { BaseLLMProvider } from '../base/base-provider.js';
import { 
  LLMRequestOptions, 
  LLMResponse, 
  LLMConfig,
  LLMErrorType 
} from '../types.js';

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = 'Anthropic';
  
  private apiKey: string;
  private baseUrl: string;
  private apiVersion: string;

  constructor(config: LLMConfig) {
    super(config);
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
    this.apiVersion = '2023-06-01'; // Anthropic API 版本
    
    if (!this.apiKey) {
      throw new Error('Anthropic API key required (ANTHROPIC_API_KEY)');
    }
  }

  async initialize(): Promise<void> {
    // 简单验证：检查 API Key 格式（Anthropic 以 sk-ant- 开头）
    if (!this.apiKey.startsWith('sk-ant-')) {
      this.log('warn', 'API Key format looks incorrect (should start with sk-ant-)');
    }
    
    this._isAvailable = true;
    this.log('info', `Anthropic provider ready (${this.config.model})`);
  }

  protected async doGenerate(
    prompt: string, 
    options: LLMRequestOptions
  ): Promise<LLMResponse> {
    // Anthropic 使用 /v1/messages 端点
    const requestBody: any = {
      model: this.config.model,
      max_tokens: options.maxTokens ?? 1024,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      stop_sequences: options.stopSequences,
    };

    // Claude 支持 system 参数（不同于 OpenAI 的 system message）
    if (options.systemPrompt) {
      requestBody.system = options.systemPrompt;
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(options.timeout ?? 60000) // Claude 有时较慢
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${error}`);
    }

    const data = await response.json() as {
      id: string;
      type: string;
      role: string;
      content: Array<{ type: string; text: string }>;
      model: string;
      stop_reason: string | null;
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    return {
      content: data.content?.[0]?.text || '',
      model: data.model,
      finishReason: data.stop_reason === 'end_turn' ? 'stop' : 
                    data.stop_reason === 'max_tokens' ? 'length' : 'stop',
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      }
    };
  }

  protected classifyError(error: any): {
    type: LLMErrorType;
    message: string;
    retryable: boolean;
    statusCode?: number;
  } {
    const message = error.message || String(error);
    const statusMatch = message.match(/(\d{3})/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : undefined;

    if (statusCode === 401) {
      return {
        type: LLMErrorType.AUTHENTICATION,
        message,
        statusCode,
        retryable: false
      };
    }

    if (statusCode === 429) {
      return {
        type: LLMErrorType.RATE_LIMIT,
        message,
        statusCode,
        retryable: true
      };
    }

    if (statusCode === 529) { // Anthropic 过载错误
      return {
        type: LLMErrorType.SERVER_ERROR,
        message: 'Anthropic API overloaded',
        statusCode,
        retryable: true
      };
    }

    // 当 statusCode 为 undefined 时，不包含该属性
    const result: {
      type: LLMErrorType;
      message: string;
      retryable: boolean;
      statusCode?: number;
    } = {
      type: LLMErrorType.UNKNOWN,
      message,
      retryable: true
    };

    if (statusCode !== undefined) {
      result.statusCode = statusCode;
    }

    return result;
  }

  async dispose(): Promise<void> {
    this._isAvailable = false;
  }
}