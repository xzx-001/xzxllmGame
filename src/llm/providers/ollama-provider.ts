// src/llm/providers/ollama-provider.ts
/**
 * @fileoverview Ollama 提供商
 * @description 通过 HTTP API 连接 Ollama 服务（本地或远程）
 * @module llm/providers/ollama
 * 
 * 特点：
 * - 支持本地 Ollama 服务（默认 localhost:11434）
 * - 支持远程 Ollama（需配置 baseUrl）
 * - 自动模型拉取（如果本地不存在）
 * - 流式响应支持
 * 
 * 要求：
 * - 运行 Ollama 服务（docker 或本地安装）
 */

import { BaseLLMProvider } from '../base/base-provider.js';
import { 
  LLMRequestOptions, 
  LLMResponse, 
  LLMConfig,
  LLMErrorType,
  StreamCallbacks 
} from '../types.js';

export class OllamaProvider extends BaseLLMProvider {
  readonly name = 'Ollama';
  
  /** API 基础 URL */
  private baseUrl: string;
  
  /** 当前使用的模型 */
  private currentModel: string;

  constructor(config: LLMConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.currentModel = config.model;
    
    // 确保 URL 格式正确（去除末尾斜杠）
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
  }

  /**
   * 初始化 Ollama 连接
   * 流程：
   * 1. 检查 Ollama 服务是否响应
   * 2. 检查模型是否存在
   * 3. 不存在则尝试拉取（可选）
   */
  async initialize(): Promise<void> {
    this.log('info', `Connecting to Ollama at ${this.baseUrl}...`);
    
    // 1. 检查服务可用性
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000) // 10秒超时
      });
      
      if (!response.ok) {
        throw new Error(`Ollama service returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json() as { models: Array<{ name: string; size: number }> };
      
      // 2. 检查模型是否存在
      const modelExists = data.models.some((m: any) => 
        m.name === this.currentModel || m.name.startsWith(`${this.currentModel}:`)
      );
      
      if (!modelExists) {
        this.log('warn', `Model ${this.currentModel} not found locally. Attempting to pull...`);
        await this.pullModel();
      } else {
        this.log('info', `Model ${this.currentModel} is ready`);
      }
      
      this._isAvailable = true;
      
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          `Cannot connect to Ollama at ${this.baseUrl}. ` +
          `Please ensure Ollama is running:\n` +
          `- Docker: docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama\n` +
          `- Local: ollama serve`
        );
      }
      throw error;
    }
  }

  /**
   * 实际生成请求
   * 使用 Ollama /api/generate 端点
   */
  protected async doGenerate(
    prompt: string, 
    options: LLMRequestOptions
  ): Promise<LLMResponse> {
    const requestBody: any = {
      model: this.currentModel,
      prompt: prompt,
      system: options.systemPrompt,
      stream: false, // 非流式
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1024,
        top_p: options.topP ?? 1.0,
        stop: options.stopSequences,
        seed: options.seed,
        // 其他 Ollama 特定选项
        repeat_penalty: options.repeatPenalty ?? 1.1,
      }
    };

    // 格式参数（如果要求 JSON）
    if (options.responseFormat === 'json') {
      requestBody.format = 'json';
    }

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(options.timeout ?? 30000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      response: string;
      done: boolean;
      prompt_eval_count?: number;
      eval_count?: number;
      total_duration?: number;
      load_duration?: number;
    };

    return {
      content: data.response,
      model: this.currentModel,
      finishReason: data.done ? 'stop' : 'length',
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      // Ollama 提供详细的时间统计，可用于性能分析
      rawResponse: {
        totalDuration: data.total_duration,
        loadDuration: data.load_duration,
      }
    };
  }

  /**
   * 流式生成实现
   * 使用 Ollama 的 stream=true 模式
   */
  async generateStream(
    prompt: string,
    options: LLMRequestOptions,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const requestBody = {
      model: this.currentModel,
      prompt: prompt,
      system: options.systemPrompt,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1024,
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // 处理 SSE 流（Ollama 使用换行分隔的 JSON）
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      let fullContent = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 解码 Uint8Array
        const chunk = new TextDecoder().decode(value);
        
        // 处理多行 JSON（Ollama 每行一个 JSON 对象）
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              fullContent += data.response;
              callbacks.onData(data.response, {
                completionTokens: data.eval_count
              });
            }
            if (data.done) {
              callbacks.onComplete({
                content: fullContent,
                model: this.currentModel,
                finishReason: 'stop',
                usage: {
                  promptTokens: data.prompt_eval_count || 0,
                  completionTokens: data.eval_count || 0,
                  totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                }
              });
              return;
            }
          } catch (e) {
            // 忽略解析失败的行（可能是心跳或空行）
          }
        }
      }
    } catch (error) {
      callbacks.onError(error as Error);
    }
  }

  /**
   * 拉取模型（如果本地不存在）
   * Ollama 的 /api/pull 端点
   */
  private async pullModel(): Promise<void> {
    this.log('info', `Pulling model ${this.currentModel}... This may take a while.`);
    
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: this.currentModel, 
        stream: false // 简化处理，非流式拉取
      }),
      signal: AbortSignal.timeout(600000) // 拉取可能很慢（10分钟超时）
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.statusText}`);
    }

    this.log('info', `Model ${this.currentModel} pulled successfully`);
  }

  /**
   * 错误分类
   */
  protected classifyError(error: any): {
    type: LLMErrorType;
    message: string;
    retryable: boolean;
    statusCode?: number;
  } {
    const message = error.message || String(error);
    
    if (message.includes('404') || message.includes('not found')) {
      return {
        type: LLMErrorType.MODEL_NOT_FOUND,
        message: `Model not found: ${message}`,
        retryable: false
      };
    }
    
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return {
        type: LLMErrorType.NETWORK_ERROR,
        message: `Cannot connect to Ollama: ${message}`,
        retryable: true
      };
    }
    
    if (message.includes('timeout')) {
      return {
        type: LLMErrorType.TIMEOUT,
        message: `Request timeout: ${message}`,
        retryable: true
      };
    }

    return {
      type: LLMErrorType.UNKNOWN,
      message: message,
      retryable: true
    };
  }

  /**
   * 获取模型信息
   */
  async getModelInfo(): Promise<{
    id: string;
    contextWindow: number;
    maxTokens: number;
    capabilities: string[];
  }> {
    // Ollama 的 /api/show 可获取详情，这里简化处理
    return {
      id: this.currentModel,
      contextWindow: 4096, // 默认值，实际应从模型获取
      maxTokens: 4096,
      capabilities: ['chat', 'completion']
    };
  }

  /**
   * 释放连接
   * Ollama 是无状态的，主要清理待处理请求
   */
  async dispose(): Promise<void> {
    // 取消所有进行中的 fetch 请求（需要 AbortController 支持）
    this._isAvailable = false;
    this.log('info', 'Ollama provider disposed');
  }
}