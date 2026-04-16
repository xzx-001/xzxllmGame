// src/llm/base/base-provider.ts
/**
 * @fileoverview LLM 提供商抽象基类
 * @description 提供通用的重试逻辑、错误处理和日志记录
 * @module llm/base/base-provider
 * @author xzxllm
 */

import { 
  ILLMProvider, 
  LLMRequestOptions, 
  LLMResponse, 
  LLMConfig,
  LLMError,
  LLMErrorType 
} from './../types.js';

/**
 * 重试策略配置
 */
interface RetryPolicy {
  /** 最大重试次数 */
  maxAttempts: number;
  /** 初始延迟（毫秒） */
  baseDelay: number;
  /** 最大延迟（毫秒） */
  maxDelay: number;
  /** 退避乘数（指数退避） */
  backoffMultiplier: number;
  /** 哪些错误类型可以重试 */
  retryableErrors: LLMErrorType[];
}

/**
 * LLM 提供商抽象基类
 * 
 * 封装通用功能：
 * 1. 指数退避重试机制（自动处理瞬时失败）
 * 2. 超时控制（防止请求挂起）
 * 3. 错误分类（决定重试策略）
 * 4. 日志记录（统一格式）
 * 
 * 子类只需实现：
 * - doGenerate(): 实际的发送请求逻辑
 * - classifyError(): 错误分类方法
 * 
 * @abstract
 */
export abstract class BaseLLMProvider implements ILLMProvider {
  /** 提供商显示名称（子类应覆盖） */
  abstract readonly name: string;
  
  /** 内部可用状态 */
  protected _isAvailable = false;
  
  /** 配置对象 */
  protected config: LLMConfig;
  
  /** 重试策略 */
  protected retryPolicy: RetryPolicy;
  
  /** 默认请求选项（合并到每次请求） */
  protected defaultOptions: LLMRequestOptions;

  constructor(config: LLMConfig) {
    this.config = config;
    
    // 设置重试策略（可配置或默认）
    this.retryPolicy = {
      maxAttempts: config.retryAttempts ?? 3,
      baseDelay: 1000,           // 1秒
      maxDelay: 30000,           // 30秒
      backoffMultiplier: 2,      // 指数退避
      retryableErrors: [
        LLMErrorType.NETWORK_ERROR,
        LLMErrorType.TIMEOUT,
        LLMErrorType.RATE_LIMIT,
        LLMErrorType.SERVER_ERROR
      ]
    };
    
    // 默认选项
    this.defaultOptions = {
      temperature: config.defaults?.temperature ?? 0.7,
      maxTokens: config.defaults?.maxTokens ?? 1024,
      timeout: config.timeout ?? 30000,
      ...config.defaults
    };
  }

  /** 
   * 获取可用状态
   */
  get isAvailable(): boolean {
    return this._isAvailable;
  }

  /** 
   * 初始化提供商（子类必须实现）
   * @abstract
   */
  abstract initialize(): Promise<void>;

  /** 
   * 实际生成方法（子类必须实现）
   * @abstract
   * @protected
   */
  protected abstract doGenerate(
    prompt: string, 
    options: LLMRequestOptions
  ): Promise<LLMResponse>;

  /** 
   * 错误分类（子类必须实现）
   * @abstract
   * @protected
   * 根据错误信息/状态码判断错误类型，决定重试策略
   */
  protected abstract classifyError(error: any): {
    type: LLMErrorType;
    message: string;
    statusCode?: number;
    retryable: boolean;
  };

  /**
   * 带重试机制的生成方法
   * 
   * 流程：
   * 1. 合并默认选项和用户选项
   * 2. 检查提供商可用性
   * 3. 循环尝试（最多 maxAttempts 次）
   *    - 执行 doGenerate()
   *    - 成功：返回结果
   *    - 失败：判断错误类型
   *      - 可重试且未达上限：指数退避延迟，继续循环
   *      - 不可重试：立即抛出
   * 4. 耗尽重试次数：抛出最后一次错误
   * 
   * @param prompt 用户提示词
   * @param options 生成选项
   * @returns 生成结果
   * @throws LLMError 所有生成错误包装为 LLMError
   */
  async generate(
    prompt: string, 
    options: LLMRequestOptions = {}
  ): Promise<LLMResponse> {
    // 合并选项（用户 > 默认）
    const mergedOptions: LLMRequestOptions = {
      ...this.defaultOptions,
      ...options,
      // 特殊处理：stopSequences 需要合并而非覆盖
      stopSequences: [
        ...(this.defaultOptions.stopSequences || []),
        ...(options.stopSequences || [])
      ]
    };

    // 检查可用性
    if (!this._isAvailable) {
      throw new LLMError(
        `${this.name} provider is not initialized or has been disposed`,
        LLMErrorType.UNKNOWN,
        this.name,
        undefined,
        false
      );
    }

    let lastError: LLMError | undefined;

    // 重试循环
    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt++) {
      try {
        // 记录开始时间
        const startTime = Date.now();
        
        // 添加超时控制（如果选项中有 timeout）
        let response: LLMResponse;
        if (mergedOptions.timeout && mergedOptions.timeout > 0) {
          response = await this.withTimeout(
            this.doGenerate(prompt, mergedOptions),
            mergedOptions.timeout
          );
        } else {
          response = await this.doGenerate(prompt, mergedOptions);
        }

        // 记录成功日志（调试模式）
        if (process.env.DEBUG_LLM === 'true') {
          const duration = Date.now() - startTime;
          console.log(`[${this.name}] Generation succeeded (${duration}ms)`);
        }

        return response;

      } catch (error) {
        // 分类错误
        const classified = this.classifyError(error);
        lastError = new LLMError(
          classified.message,
          classified.type,
          this.name,
          classified.statusCode,
          classified.retryable
        );

        // 判断是否应该重试
        const shouldRetry = 
          attempt < this.retryPolicy.maxAttempts &&
          this.retryPolicy.retryableErrors.includes(classified.type) &&
          classified.retryable;

        if (shouldRetry) {
          // 计算退避延迟（指数退避 + 随机抖动）
          const delay = this.calculateBackoff(attempt);
          
          console.warn(
            `[${this.name}] Attempt ${attempt}/${this.retryPolicy.maxAttempts} failed ` +
            `(${classified.type}), retrying in ${delay}ms...`
          );
          
          await this.sleep(delay);
        } else {
          // 不可重试的错误，立即抛出
          throw lastError;
        }
      }
    }

    // 耗尽所有重试
    throw new LLMError(
      `Failed after ${this.retryPolicy.maxAttempts} attempts. Last error: ${lastError?.message}`,
      lastError?.type || LLMErrorType.UNKNOWN,
      this.name,
      lastError?.statusCode,
      false
    );
  }

  /**
   * 健康检查默认实现
   * 发送简单请求验证服务状态
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 发送一个简单请求（如 "Hi"）
      const response = await this.generate("Hi", { 
        maxTokens: 5, 
        temperature: 0,
        timeout: 10000  // 健康检查用较短超时
      });
      
      return response.finishReason !== 'error' && response.content.length > 0;
    } catch (error) {
      console.warn(`[${this.name}] Health check failed:`, error);
      return false;
    }
  }

  /**
   * 释放资源默认实现
   * 子类应覆盖以释放特定资源（显存、连接等）
   */
  async dispose(): Promise<void> {
    this._isAvailable = false;
    console.log(`[${this.name}] Provider disposed`);
  }

  /**
   * 带超时的 Promise 包装
   * @param promise 原始 Promise
   * @param ms 超时毫秒数
   * @returns 原始结果
   * @throws 超时抛出 TIMEOUT 错误
   */
  protected withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${ms}ms`));
        }, ms);
      })
    ]);
  }

  /**
   * 计算退避延迟
   * 指数退避 + 随机抖动（避免惊群效应）
   */
  protected calculateBackoff(attempt: number): number {
    // 指数退避：baseDelay * 2^(attempt-1)
    const exponential = this.retryPolicy.baseDelay * 
      Math.pow(this.retryPolicy.backoffMultiplier, attempt - 1);
    
    // 限制最大值
    const capped = Math.min(exponential, this.retryPolicy.maxDelay);
    
    // 添加 0-1000ms 随机抖动
    const jitter = Math.random() * 1000;
    
    return Math.floor(capped + jitter);
  }

  /**
   * 延迟工具
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 日志记录工具
   * 统一格式，便于过滤和分析
   */
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.name}]`;
    
    if (meta) {
      console[level](`${prefix} ${message}`, meta);
    } else {
      console[level](`${prefix} ${message}`);
    }
  }
}