// src/llm/providers/openai-provider.ts
/**
 * @fileoverview OpenAI 提供商
 * @description 支持 OpenAI API 和 Azure OpenAI
 * @module llm/providers/openai
 * 
 * 特点：
 * - 支持 GPT-4, GPT-3.5-turbo 等模型
 * - 兼容 Azure OpenAI（通过 baseUrl 配置）
 * - 支持 JSON 模式（response_format）
 * - 完整 Token 计费信息
 */

import { BaseLLMProvider } from '../base/base-provider.js';
import { 
  LLMRequestOptions, 
  LLMResponse, 
  LLMConfig,
  LLMErrorType 
} from '../types.js';

export class OpenAIProvider extends BaseLLMProvider {
  readonly name: string;
  
  private apiKey: string;
  private baseUrl: string;
  private organization: string | undefined; // OpenAI 组织 ID

  constructor(config: LLMConfig) {
    super(config);
    
    // 支持 OpenAI 和 Azure OpenAI
    if (config.baseUrl?.includes('azure.com')) {
      this.name = 'AzureOpenAI';
      this.baseUrl = config.baseUrl;
      // Azure 使用 api-key 头部而非 Authorization
    } else {
      this.name = 'OpenAI';
      this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    }
    
    // API Key 优先级：配置 > 环境变量
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.organization = process.env.OPENAI_ORG_ID;
    
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is required. Provide it via:\n' +
        '1. config.apiKey\n' +
        '2. OPENAI_API_KEY environment variable'
      );
    }
  }

  /**
   * 初始化：验证 API Key 有效性
   */
  async initialize(): Promise<void> {
    try {
      // 轻量级验证：获取模型列表
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.status === 401) {
        throw new Error('Invalid API key');
      }
      
      if (!response.ok) {
        throw new Error(`API check failed: ${response.statusText}`);
      }
      
      this._isAvailable = true;
      this.log('info', `${this.name} provider initialized (${this.config.model})`);
      
    } catch (error) {
      if ((error as Error).message.includes('fetch')) {
        throw new Error(`Cannot connect to ${this.name}. Check your network.`);
      }
      throw error;
    }
  }

  /**
   * 执行生成请求
   * 使用 /chat/completions 端点
   */
  protected async doGenerate(
    prompt: string, 
    options: LLMRequestOptions
  ): Promise<LLMResponse> {
    // 构建消息数组
    const messages: Array<{role: string; content: string; name?: string}> = [
      { role: 'user', content: prompt }
    ];

    // 系统提示词
    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const requestBody: any = {
      model: this.config.model,
      messages: messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stop: options.stopSequences,
      // 用户标识（用于 OpenAI 滥用检测）
      user: 'xzxllm-game-user'
    };

    // JSON 模式（强制输出 JSON）
    if (options.responseFormat === 'json') {
      requestBody.response_format = { type: 'json_object' };
      // JSON 模式通常需要指定 system prompt 说明格式
      if (!requestBody.messages.some((m: any) => m.role === 'system')) {
        requestBody.messages.unshift({
          role: 'system',
          content: 'You are a helpful assistant designed to output JSON.'
        });
      }
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(options.timeout ?? 30000)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      throw new Error(
        `API error ${response.status}: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json() as {
      id: string;
      object: string;
      created: number;
      model: string;
      choices: Array<{
        index: number;
        message: {
          role: string;
          content: string;
        };
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = data.choices[0];
    const text = choice?.message?.content || '';
    
    return {
      text,
      content: text,
      model: data.model,
      finishReason: this.mapFinishReason(choice?.finish_reason || 'error'),
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      }
    };
  }

  /**
   * 获取请求头部
   * 区分标准 OpenAI 和 Azure OpenAI
   */
  private getHeaders(): Record<string, string> {
    if (this.name === 'AzureOpenAI') {
      return {
        'api-key': this.apiKey,
        ...(this.organization && { 'OpenAI-Organization': this.organization })
      };
    }
    
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      ...(this.organization && { 'OpenAI-Organization': this.organization })
    };
  }

  /**
   * 映射完成原因
   */
  private mapFinishReason(reason: string): 'stop' | 'length' | 'error' | 'content_filter' {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'content_filter': return 'content_filter';
      default: return 'error';
    }
  }

  /**
   * 错误分类
   * 处理 OpenAI 特定的错误码
   */
  protected classifyError(error: any): {
    type: LLMErrorType;
    message: string;
    retryable: boolean;
    statusCode?: number;
  } {
    const message = error.message || String(error);

    // 解析 HTTP 状态码
    const statusMatch = message.match(/(\d{3})/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : undefined;

    // 认证错误
    if (statusCode === 401 || message.includes('Invalid API key')) {
      return {
        type: LLMErrorType.AUTHENTICATION,
        message: `Authentication failed: ${message}`,
        statusCode: 401,
        retryable: false
      };
    }

    // 限流错误（429）
    if (statusCode === 429 || message.includes('rate limit')) {
      return {
        type: LLMErrorType.RATE_LIMIT,
        message: `Rate limit exceeded: ${message}`,
        statusCode: 429,
        retryable: true
      };
    }

    // 上下文长度超限
    if (statusCode === 400 && message.includes('context length')) {
      return {
        type: LLMErrorType.CONTEXT_LENGTH_EXCEEDED,
        message: `Context too long: ${message}`,
        statusCode: 400,
        retryable: false
      };
    }

    // 内容过滤
    if (statusCode === 400 && message.includes('content filter')) {
      return {
        type: LLMErrorType.CONTENT_FILTER,
        message: `Content filtered: ${message}`,
        statusCode: 400,
        retryable: false
      };
    }

    // 服务器错误（5xx）
    if (statusCode && statusCode >= 500) {
      return {
        type: LLMErrorType.SERVER_ERROR,
        message: `Server error: ${message}`,
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

  /**
   * 估算 Token 数（使用粗略估算）
   * 生产环境应使用 tiktoken，但避免额外依赖
   */
  estimateTokens(text: string): number {
    // 粗略估算：英文 1 token ≈ 4 字符，中文 1 token ≈ 1 字符
    // 实际 OpenAI 使用 BPE，这里简化处理
    const latinChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length;
    const otherChars = text.length - latinChars;
    return Math.ceil(latinChars / 4) + otherChars;
  }

  async dispose(): Promise<void> {
    // OpenAI 是无状态的，无需特殊清理
    this._isAvailable = false;
    this.log('info', `${this.name} provider disposed`);
  }
}