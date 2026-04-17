// src/llm/types.ts
/**
 * @fileoverview LLM 模块类型定义
 * @description 定义所有 LLM 提供商必须实现的接口和配置类型
 * @module llm/types
 * @author xzxllm
 * @license MIT
 */

/**
 * LLM 请求选项
 * 控制生成行为的参数
 */
export interface LLMRequestOptions {
  /** 
   * 温度参数（0.0 - 2.0）
   * 控制输出的随机性。低值（0.1）更确定性，高值（1.5+）更有创造性
   * @default 0.7
   */
  temperature?: number;
  
  /** 
   * 最大生成 Token 数
   * 控制输出长度，防止过长响应
   * @default 1024
   */
  maxTokens?: number;
  
  /** 
   * 停止序列
   * 生成遇到这些字符串时停止
   */
  stopSequences?: string[];
  
  /** 
   * 系统提示词（人设/角色设定）
   * 设置 AI 的行为模式和背景
   */
  systemPrompt?: string;
  
  /** 
   * 请求超时（毫秒）
   * 超过此时间未响应则放弃
   * @default 30000
   */
  timeout?: number;
  
  /** 
   * 是否启用流式响应
   * true: 逐步返回内容（适合实时显示）
   * false: 一次性返回完整内容
   * @default false
   */
  stream?: boolean;
  
  /** 
   * 重复惩罚系数（1.0 = 无惩罚）
   * 防止模型重复同样的内容
   * @default 1.0
   */
  repeatPenalty?: number;
  
  /** 
   * Top P 采样（核采样）
   * 控制词汇选择的多样性
   * @default 1.0
   */
  topP?: number;
  
  /** 
   * 随机种子（用于可复现输出）
   * 相同种子+输入=相同输出（如果模型支持）
   */
  seed?: number;
  
  /** 
   * 响应格式要求
   * 如 'json' 强制要求模型输出 JSON
   */
  responseFormat?: 'text' | 'json';
}

/**
 * Token 使用统计
 * 用于计费和性能监控
 */
export interface TokenUsage {
  /** 输入提示词 Token 数 */
  promptTokens: number;
  /** 生成内容 Token 数 */
  completionTokens: number;
  /** 总 Token 数 */
  totalTokens: number;
}

/**
 * LLM 响应结构
 */
export interface LLMResponse {
  /** 
   * 生成的文本内容
   * 如果出错或过滤，可能为空
   */
  content: string;
  
  /** 
   * Token 使用统计（可选，某些提供商可能不提供）
   */
  usage?: TokenUsage;
  
  /** 使用的模型名称 */
  model: string;
  
  /** 
   * 完成原因
   * - stop: 正常完成（遇到 stop 序列或自然结束）
   * - length: 达到 maxTokens 限制
   * - error: 发生错误
   */
  finishReason: 'stop' | 'length' | 'error' | 'content_filter';
  
  /** 
   * 流式响应的结束标记（仅在 stream=true 时）
   */
  isComplete?: boolean;
  
  /** 
   * 原始响应对象（调试使用）
   */
  rawResponse?: any;
}

/**
 * 流式响应回调
 * 用于实时接收生成内容
 */
export interface StreamCallbacks {
  /** 收到新内容片段时调用 */
  onData: (chunk: string, usage?: Partial<TokenUsage>) => void;
  /** 完成时调用 */
  onComplete: (fullResponse: LLMResponse) => void;
  /** 出错时调用 */
  onError: (error: Error) => void;
}

/**
 * LLM 提供商抽象接口
 * 所有具体提供商（OpenAI、Ollama、本地模型）必须实现此接口
 * 
 * 设计原则：
 * 1. 统一接口：无论底层是本地 GGUF 还是云端 API，调用方式一致
 * 2. 状态管理：通过 isAvailable 跟踪提供商就绪状态
 * 3. 资源管理：dispose() 确保释放显存/连接
 */
export interface ILLMProvider {
  /** 
   * 提供商名称（用于日志和监控）
   * 如 'OpenAI', 'Ollama', 'LocalLLM'
   */
  readonly name: string;
  
  /** 
   * 当前是否可用
   * initialize() 成功后为 true，dispose() 后为 false
   */
  readonly isAvailable: boolean;
  
  /** 
   * 初始化提供商
   * - 本地模型：加载模型文件到内存/GPU
   * - 云端 API：验证 API Key，测试连接
   * 
   * @throws 初始化失败时抛出错误（如模型文件不存在、API Key 无效）
   */
  initialize(): Promise<void>;
  
  /** 
   * 发送生成请求
   * 主接口：发送提示词，返回生成结果
   * 
   * @param prompt 用户提示词
   * @param options 生成选项（可选，覆盖默认配置）
   * @returns 生成结果
   * 
   * @throws 生成失败时抛出错误（如网络超时、模型过载）
   * 
   * @example
   * const response = await provider.generate(
   *   "设计一个推箱子谜题", 
   *   { temperature: 0.8, maxTokens: 1500 }
   * );
   */
  generate(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse>;
  
  /** 
   * 流式生成
   * 逐步返回内容，适合实时显示打字机效果
   * 
   * @param prompt 用户提示词
   * @param options 生成选项
   * @param callbacks 回调函数（onData, onComplete, onError）
   * 
   * @example
   * await provider.generateStream(
   *   "讲个故事",
   *   { maxTokens: 500 },
   *   {
   *     onData: (chunk) => process.stdout.write(chunk),
   *     onComplete: (resp) => console.log('完成'),
   *     onError: (err) => console.error(err)
   *   }
   * );
   */
  generateStream?(
    prompt: string, 
    options: LLMRequestOptions, 
    callbacks: StreamCallbacks
  ): Promise<void>;
  
  /** 
   * 健康检查
   * 快速验证提供商是否正常工作
   * 用于负载均衡和服务监控
   * 
   * @returns true 表示健康，false 表示异常
   */
  healthCheck(): Promise<boolean>;
  
  /** 
   * 获取模型信息
   * 返回当前使用的模型元数据
   */
  getModelInfo?(): Promise<{
    id: string;
    contextWindow: number;
    maxTokens: number;
    capabilities: string[];
  }>;
  
  /** 
   * 估算 Token 数
   * 用于成本预估和长度检查（不保证 100% 准确）
   */
  estimateTokens?(text: string): number;
  
  /** 
   * 释放资源
   * - 本地模型：释放显存，卸载模型
   * - 云端 API：关闭连接池
   * 
   * 必须在应用关闭时调用，防止内存泄漏
   */
  dispose(): Promise<void>;
}

/**
 * 支持的 LLM 提供商类型
 */
export type LLMProviderType = 
  | 'local'      // 本地 GGUF 模型（node-llama-cpp）
  | 'ollama'     // Ollama HTTP API
  | 'openai'     // OpenAI API（GPT-4/GPT-3.5）
  | 'anthropic'  // Anthropic API（Claude）
  | 'custom';    // 自定义 OpenAI 兼容 API

/**
 * LLM 配置结构
 * 用于工厂创建提供商实例
 */
export interface LLMConfig {
  /** 提供商类型 */
  provider: LLMProviderType;
  
  /** 模型名称或 ID */
  model: string;
  
  /** 
   * API 基础 URL（可选）
   * - Ollama: http://localhost:11434
   * - 自定义: https://api.example.com/v1
   * - OpenAI/Anthropic: 使用默认值，无需设置
   */
  baseUrl?: string | undefined;
  
  /** 
   * API 密钥（云提供商必需）
   * 从环境变量 LLM_API_KEY 或 OPENAI_API_KEY 读取也可
   */
  apiKey?: string | undefined;
  
  /** 
   * 本地模型专用配置
   * 仅当 provider='local' 时有效
   */
  localOptions?: {
  /** 模型文件路径（.gguf 格式） */
  modelPath: string;
  /** GPU 层数（0=纯 CPU，20=全部 GPU） */
  gpuLayers?: number;
  /** 上下文窗口大小（默认 4096） */
  contextSize?: number;
  /** CPU 线程数（默认 4） */
  threads?: number;
  /** 是否使用内存映射（大模型建议开启） */
  useMmap?: boolean;
  /** 是否锁定内存（防止交换） */
  useMlock?: boolean;
} | undefined;
  
  /** 默认请求超时（毫秒） */
  timeout?: number | undefined;
  
  /** 失败重试次数（默认 3） */
  retryAttempts?: number | undefined;
  
  /** 默认生成参数 */
  defaults?: {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  repeatPenalty?: number;
} | undefined;
  
  /** 流式响应配置（如果支持） */
  streaming?: {
  /** 是否默认启用流式 */
  enabled: boolean;
  /** 流式块大小（字符数） */
  chunkSize?: number;
} | undefined;
}

/**
 * 提供商错误分类
 * 用于错误处理和重试策略
 */
export enum LLMErrorType {
  /** 网络连接失败（可重试） */
  NETWORK_ERROR = 'network_error',
  
  /** 请求超时（可重试） */
  TIMEOUT = 'timeout',
  
  /** API 限流（指数退避后重试） */
  RATE_LIMIT = 'rate_limit',
  
  /** 认证失败（不可重试，需检查 Key） */
  AUTHENTICATION = 'authentication',
  
  /** 模型不存在（不可重试，需检查配置） */
  MODEL_NOT_FOUND = 'model_not_found',
  
  /** 内容被过滤（不可重试，需修改提示词） */
  CONTENT_FILTER = 'content_filter',
  
  /** 上下文长度超限（需截断提示词） */
  CONTEXT_LENGTH_EXCEEDED = 'context_length',
  
  /** 服务器错误（可重试） */
  SERVER_ERROR = 'server_error',
  
  /** 未知错误 */
  UNKNOWN = 'unknown'
}

/**
 * LLM 错误类
 * 带分类的错误，便于调用方处理
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public type: LLMErrorType,
    public provider: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMError';
  }
}