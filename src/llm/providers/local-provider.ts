// src/llm/providers/local-provider.ts
/**
 * @fileoverview 本地模型提供商
 * @description 使用 node-llama-cpp 加载运行本地 GGUF 模型
 * @module llm/providers/local
 * 
 * 特点：
 * - 完全离线运行，无需网络
 * - 数据隐私（敏感提示词不上云）
 * - 支持 GPU 加速（CUDA/Metal）
 * 
 * 要求：
 * - 提前下载 .gguf 模型文件
 * - 安装 node-llama-cpp（编译原生模块可能需要 Python/CMake）
 */

import { BaseLLMProvider } from '../base/base-provider.js';
import { 
  LLMRequestOptions, 
  LLMResponse, 
  LLMConfig,
  LLMErrorType 
} from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

// 动态导入 node-llama-cpp（可选依赖，不存在时报错）
let llamaModule: any;
let LlamaModel: any;
let LlamaContext: any;
let LlamaChatSession: any;
let getLlama: any;

export class LocalLLMProvider extends BaseLLMProvider {
  readonly name = 'LocalLLM';
  
  /** 已加载的模型实例 */
  private model: any = null;
  
  /** 模型上下文（可复用） */
  private context: any = null;
  
  /** 模型元数据 */
  private modelInfo: {
    path: string;
    size: number;      // 文件大小 MB
    gpuLayers: number;
    contextSize: number;
  } | null = null;

  constructor(config: LLMConfig) {
    super(config);
    
    if (!config.localOptions?.modelPath) {
      throw new Error('LocalLLM requires config.localOptions.modelPath');
    }
  }

  /**
   * 初始化本地模型
   * 流程：
   * 1. 检查模型文件存在
   * 2. 动态导入 node-llama-cpp
   * 3. 加载模型到内存/GPU
   * 4. 创建上下文
   * 5. 预热（可选）
   */
  async initialize(): Promise<void> {
    const modelPath = this.config.localOptions!.modelPath;
    
    // 1. 验证模型文件
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model file not found: ${modelPath}\n` +
        `Please download the model and place it at the specified path.\n` +
        `Example: wget https://huggingface.co/.../model.gguf -O ${modelPath}`);
    }

    const stats = fs.statSync(modelPath);
    this.modelInfo = {
      path: modelPath,
      size: Math.round(stats.size / 1024 / 1024),
      gpuLayers: this.config.localOptions!.gpuLayers ?? 0,
      contextSize: this.config.localOptions!.contextSize ?? 4096
    };

    this.log('info', `Initializing with model: ${path.basename(modelPath)} ` +
      `(${this.modelInfo.size}MB, ${this.modelInfo.gpuLayers} GPU layers)`);

    // 2. 动态导入（处理可选依赖）
    try {
      llamaModule = await import('node-llama-cpp');
      getLlama = llamaModule.getLlama;
      LlamaModel = llamaModule.LlamaModel;
      LlamaContext = llamaModule.LlamaContext;
      LlamaChatSession = llamaModule.LlamaChatSession;
    } catch (error) {
      throw new Error(
        `Failed to load node-llama-cpp. Please install it:\n` +
        `npm install node-llama-cpp\n\n` +
        `Note: This package requires compilation tools (Python, CMake, C++ compiler).\n` +
        `See: https://github.com/withcatai/node-llama-cpp`
      );
    }

    // 3. 初始化 Llama 后端
    const llama = await getLlama({
      logLevel: process.env.NODE_ENV === 'development' ? 'info' : 'error',
      // 可添加其他后端选项
    });

    // 4. 加载模型（耗时操作，可能需几秒到几分钟）
    this.log('info', 'Loading model into memory...');
    this.model = await llama.loadModel({
      modelPath: modelPath,
      gpuLayers: this.modelInfo.gpuLayers,
      // 内存优化选项
      useMmap: this.config.localOptions?.useMmap ?? true,  // 内存映射，大模型必需
      useMlock: this.config.localOptions?.useMlock ?? false, // 锁定内存（需要权限）
      vocabOnly: false,
    });

    // 5. 创建上下文（可复用，但注意线程安全）
    this.context = await this.model.createContext({
      contextSize: this.modelInfo.contextSize,
      threads: this.config.localOptions?.threads ?? 4,
      // 批处理大小（影响性能）
      batchSize: 512,
    });

    this._isAvailable = true;
    this.log('info', `Model loaded successfully. Context size: ${this.modelInfo.contextSize}`);
    
    // 6. 预热（可选，首次生成更快）
    await this.warmup();
  }

  /**
   * 实际生成实现
   * 使用 LlamaChatSession 进行对话式生成
   */
  protected async doGenerate(
    prompt: string, 
    options: LLMRequestOptions
  ): Promise<LLMResponse> {
    if (!this.context || !this._isAvailable) {
      throw new Error('Model not initialized');
    }

    // 创建会话（每次请求创建新会话，避免历史混淆）
    // 或使用系统提示词创建持久人设
    const contextSequence = this.context.getSequence();
    
    const session = new LlamaChatSession({
      contextSequence,
      systemPrompt: options.systemPrompt || 'You are a helpful assistant.',
      // 对话历史（如果支持有状态对话）
      // conversationHistory: options.history
    });

    try {
      // 调用生成
      const result = await session.prompt(prompt, {
        maxTokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        // 停止序列
        stop: options.stopSequences,
        // 重复惩罚
        repeatPenalty: {
          penalty: options.repeatPenalty ?? 1.1,
          // 惩罚最近出现的 Token
          penalizeNewLine: false,
        },
        // Top P 采样
        topP: options.topP ?? 1.0,
        // 随机种子（可复现性）
        seed: options.seed,
      });

      return {
        content: result,
        model: path.basename(this.modelInfo!.path),
        finishReason: 'stop', // 本地模型通常不区分 finish reason
        // 本地模型通常不提供 token 计数，需估算
        usage: {
          promptTokens: this.estimateTokens(prompt),
          completionTokens: this.estimateTokens(result),
          totalTokens: this.estimateTokens(prompt) + this.estimateTokens(result),
        }
      };
    } finally {
      // 清理会话资源（重要，防止内存泄漏）
      session.dispose();
    }
  }

  /**
   * 错误分类
   * 将 node-llama-cpp 的错误映射到标准类型
   */
  protected classifyError(error: any): {
    type: LLMErrorType;
    message: string;
    retryable: boolean;
    statusCode?: number;
  } {
    const message = error.message || String(error);
    
    // CUDA/GPU 错误
    if (message.includes('CUDA') || message.includes('out of memory')) {
      return {
        type: LLMErrorType.SERVER_ERROR,
        message: `GPU memory error: ${message}`,
        retryable: false // 显存不足重试也没用
      };
    }
    
    // 上下文长度超限
    if (message.includes('context size') || message.includes('too long')) {
      return {
        type: LLMErrorType.CONTEXT_LENGTH_EXCEEDED,
        message: `Input too long for context window: ${message}`,
        retryable: false // 需要截断提示词
      };
    }
    
    // 模型文件错误
    if (message.includes('model') && message.includes('not found')) {
      return {
        type: LLMErrorType.MODEL_NOT_FOUND,
        message: message,
        retryable: false
      };
    }

    // 其他错误视为未知
    return {
      type: LLMErrorType.UNKNOWN,
      message: message,
      retryable: true // 未知错误可尝试重试
    };
  }

  /**
   * 估算 Token 数（简单字符估算）
   * 实际应使用模型的 tokenizer，但本地模型可能不提供
   */
  estimateTokens(text: string): number {
    // 粗略估算：1 token ≈ 4 字符（英文）
    // 中文更复杂，这里简化处理
    return Math.ceil(text.length / 4);
  }

  /**
   * 释放资源
   * 按顺序释放：会话 -> 上下文 -> 模型 -> 后端
   */
  async dispose(): Promise<void> {
    this.log('info', 'Disposing model resources...');
    
    // 释放上下文
    if (this.context) {
      try {
        this.context.dispose();
      } catch (e) {
        this.log('warn', 'Error disposing context', e);
      }
      this.context = null;
    }

    // 释放模型
    if (this.model) {
      try {
        // 某些版本可能需要特定清理
        if (this.model.dispose) {
          this.model.dispose();
        }
      } catch (e) {
        this.log('warn', 'Error disposing model', e);
      }
      this.model = null;
    }

    this._isAvailable = false;
    this.log('info', 'Model resources released');
  }

  /**
   * 模型预热
   * 发送简单请求让模型进入工作状态（首次生成更快）
   */
  private async warmup(): Promise<void> {
    try {
      this.log('debug', 'Warming up model...');
      await this.doGenerate('Hello', { maxTokens: 10, temperature: 0 });
      this.log('debug', 'Warmup complete');
    } catch (error) {
      this.log('warn', 'Warmup failed (non-critical)', error);
    }
  }
}