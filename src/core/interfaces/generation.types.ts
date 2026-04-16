// src/core/interfaces/generation.types.ts
/**
 * @fileoverview 内容生成相关类型定义
 * @description 定义小游戏生成器使用的上下文、参数和结果类型
 * @module core/interfaces/generation
 * @author xzxllm
 * @license MIT
 */

import { 
  MiniGameZone, 
  MiniGameType, 
  AIMood 
} from './base.types.js';

/**
 * 小游戏生成上下文
 * 包含生成小游戏所需的全部上下文信息
 * 由引擎构建后传递给具体生成器
 */
export interface MiniGameContext {
  /** 目标难度系数 0.0-1.0（影响谜题复杂度） */
  difficulty: number;
  
  /** 玩家技能水平（基于历史数据评估） */
  playerSkill: number;
  
  /** 空间限制（宽、高格子数） */
  bounds: { 
    w: number; 
    h: number; 
  };
  
  /** 主题风格（影响叙事包装和视觉描述） */
  theme: string;
  
  /** 历史记忆上下文（自然语言描述，用于个性化生成） */
  memoryContext: string;
  
  /** 当前 AI 情绪状态（影响提示词语气） */
  mood: AIMood;
  
  /** 避免重复的游戏类型（最近用过的类型列表） */
  recentTypes?: MiniGameType[];
  
  /** 特定的随机种子（用于可复现测试） */
  seed?: number;
  
  /** 玩家偏好的特定机制（可选） */
  preferredMechanics?: string[];
}

/**
 * 小游戏生成器接口
 * 所有具体游戏生成器（推箱子、激光等）必须实现此接口
 * 
 * @example
 * class PushboxGenerator implements IMiniGameGenerator {
 *   readonly type = MiniGameType.PUSHBOX;
 *   
 *   buildPrompt(context: MiniGameContext): string {
 *     return `生成推箱子谜题，难度${context.difficulty}...`;
 *   }
 *   
 *   parseResponse(response: string, zoneId: string, position: Position): MiniGameZone {
 *     // 解析 LLM 返回的 JSON
 *   }
 *   
 *   validate(zone: MiniGameZone): ValidationResult {
 *     // 验证谜题可解性
 *   }
 * }
 */
export interface IMiniGameGenerator {
  /** 生成器支持的游戏类型标识 */
  readonly type: MiniGameType;
  
  /** 生成器显示名称（用于日志和调试） */
  readonly name: string;
  
  /**
   * 构建生成提示词
   * @param context 生成上下文（难度、玩家技能、主题等）
   * @returns 发送给 LLM 的完整提示词文本
   */
  buildPrompt(context: MiniGameContext): string;
  
  /**
   * 解析 LLM 返回的响应为结构化数据
   * @param response LLM 原始响应（通常包含 JSON）
   * @param zoneId 区域唯一ID（用于标识此游戏实例）
   * @param position 地图位置（左上角坐标）
   * @returns 结构化的小游戏区域定义
   */
  parseResponse(
    response: string, 
    zoneId: string, 
    position: { x: number; y: number }
  ): MiniGameZone;
  
  /**
   * 验证生成的内容是否有效/可解
   * @param zone 生成的游戏区域
   * @returns 验证结果，包含可解性评分和错误信息
   */
  validate(zone: MiniGameZone): ValidationResult;
  
  /**
   * 生成失败时的回退方案
   * 当 LLM 生成失败或验证不通过时，返回预设的简单谜题
   * @param context 原始生成上下文
   * @returns 确保可玩的简化版游戏区域
   */
  generateFallback(context: MiniGameContext): MiniGameZone;
}

/**
 * 验证结果
 * 生成器验证关卡有效性的返回结构
 */
export interface ValidationResult {
  /** 是否通过验证（可以安全地提供给玩家） */
  valid: boolean;
  
  /** 错误信息列表（验证失败时） */
  errors?: string[];
  
  /** 警告信息列表（非致命问题，如难度估计偏差） */
  warnings?: string[];
  
  /** 实际评估的难度（可能偏离请求值） */
  estimatedDifficulty?: number;
  
  /** 可解性评分（0-1，1 为确定可解） */
  solvabilityScore?: number;
  
  /** 建议的修改（修复问题时的人工提示） */
  suggestions?: string[];
}

/**
 * 小游戏配置模板
 * 用于从 content/ 目录加载特定游戏的配置
 * 包含提示词模板、验证规则等元数据
 */
export interface MiniGameTemplate {
  /** 游戏类型标识 */
  type: MiniGameType;
  
  /** 显示名称 */
  displayName: string;
  
  /** 游戏描述（用于 LLM 理解游戏机制） */
  description: string;
  
  /** AI 生成提示词配置 */
  aiGenerationPrompt: {
    /** 系统角色设定 */
    role: string;
    
    /** 约束条件列表（必须遵守的规则） */
    constraints: string[];
    
    /** 输出格式说明（JSON Schema 示例或详细描述） */
    outputFormat: object;
    
    /** 示例输入输出（少样本学习） */
    examples?: string[];
  };
  
  /** 验证规则配置 */
  validationRules: {
    /** 最小复杂度（如最小箱子数） */
    minComplexity?: number;
    
    /** 最大复杂度（如最大箱子数） */
    maxComplexity?: number;
    
    /** 必须包含的元素类型 */
    requiredElements?: string[];
    
    /** 禁止的模式（如死锁配置） */
    forbiddenPatterns?: string[];
  };
}

/**
 * 生成进度事件
 * 用于实时推送生成状态（WebSocket/SSE/进度回调）
 */
export interface GenerationProgress {
  /** 会话 ID */
  sessionId: string;
  
  /** 当前阶段 */
  stage: 
    | 'initializing' 
    | 'analyzing' 
    | 'generating_map' 
    | 'generating_minigame' 
    | 'validating' 
    | 'finalizing';
  
  /** 当前步骤索引（如第 N 个小游戏） */
  currentStep: number;
  
  /** 总步骤数 */
  totalSteps: number;
  
  /** 进度百分比 0-100 */
  percent: number;
  
  /** 状态描述（用于显示在用户界面） */
  message: string;
  
  /** 当前处理的小游戏类型（如适用） */
  currentMiniGameType?: MiniGameType;
  
  /** 时间戳（ISO 8601） */
  timestamp: string;
}

/**
 * 提示词构建配置
 * 用于 LLM 提示词模板化
 */
export interface PromptConfig {
  /** 系统角色设定 */
  systemRole: string;
  
  /** 任务描述 */
  task: string;
  
  /** 约束条件列表 */
  constraints: string[];
  
  /** 输出格式说明（JSON Schema 或示例） */
  outputFormat: string | object;
  
  /** 示例输入输出 */
  examples?: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  
  /** 上下文窗口限制（用于截断历史记录） */
  maxContextLength?: number;
  
  /** 温度参数覆盖（可选，覆盖全局设置） */
  temperature?: number;
}

/**
 * 生成结果包装器（内部使用）
 * 包含生成的内容和元信息
 */
export interface GenerationResult<T> {
  /** 是否成功生成 */
  success: boolean;
  
  /** 生成的内容（失败时为 null） */
  data: T | null;
  
  /** 错误信息（失败时） */
  error?: string;
  
  /** 使用的模型/提供商 */
  provider?: string;
  
  /** 实际消耗的 Token 数 */
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  
  /** 生成耗时（毫秒） */
  latency?: number;
  
  /** 是否使用了降级模板（LLM 失败时的备用方案） */
  usedFallback?: boolean;
}