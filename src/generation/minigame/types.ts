/**
 * @fileoverview 小游戏生成器类型定义 (MiniGame Types)
 * @description 定义小游戏生成器的标准接口和数据结构。
 * 所有小游戏生成器必须遵循这些契约以确保与引擎的兼容性。
 * 
 * @module generation/minigame/types
 */

import { ILLMProvider } from '../../llm/types.js';
import { PlayerProfile } from '../../memory/models/player-profile.js';
import type { BaseGeneratorOptions } from './base-generator.js';

/**
 * 小游戏类型枚举
 * 扩展新类型时在此处添加
 */
export enum MiniGameType {
  PUSHBOX = 'pushbox',           // 推箱子
  LASER_MIRROR = 'laser_mirror', // 激光反射
  CIRCUIT_CONNECTION = 'circuit_connection', // 电路连接
  RIDDLE = 'riddle',             // 文字谜题
  SLIDING_PUZZLE = 'sliding_puzzle', // 滑块拼图
  MEMORY_SEQUENCE = 'memory_sequence', // 记忆序列
  LOGIC_GRID = 'logic_grid'      // 逻辑网格
}

/**
 * 位置坐标
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * 游戏区域尺寸
 */
export interface ZoneSize {
  width: number;
  height: number;
}

/**
 * 小游戏区域配置
 * 定义在关卡地图中的位置和大小
 */
export interface MiniGameZone {
  /** 唯一标识符 */
  id: string;
  
  /** 游戏类型 */
  type: MiniGameType;
  
  /** 在地图中的位置 */
  position: Position;
  
  /** 区域尺寸(格子数) */
  size: ZoneSize;
  
  /** 初始配置数据(由LLM生成) */
  initialConfig: MiniGameConfig;
  
  /** 难度系数(0-1) */
  difficulty: number;
  
  /** 预估解决时间(秒) */
  estimatedTime: number;
  
  /** 是否允许提示 */
  allowHints: boolean;
  
  /** 关联的叙事ID(用于剧情包装) */
  narrativeContextId?: string;
}

/**
 * 小游戏配置基类
 * 所有具体游戏配置必须继承此接口
 */
export interface MiniGameConfig {
  /** 配置版本 */
  version: string;
  
  /** 游戏类型标识 */
  type: MiniGameType;
  
  /** 胜利条件描述 */
  winCondition: string;
  
  /** 最大步数/时间限制(可选) */
  maxSteps?: number;
  timeLimit?: number;
}

/**
 * 小游戏生成上下文
 * 传递给生成器的输入参数
 */
export interface MiniGameContext {
  /** 目标难度(0-1) */
  targetDifficulty: number;
  
  /** 玩家画像(用于个性化) */
  playerProfile: PlayerProfile;
  
  /** 可用空间尺寸 */
  availableSize: ZoneSize;
  
  /** 位置ID */
  zoneId: string;
  
  /** 绝对坐标位置 */
  position: Position;
  
  /** 关联的主题/风格 */
  theme?: string;
  
  /** 前置条件(如需要先获得某道具) */
  prerequisites?: string[];
  
  /** LLM提供商(用于生成内容) */
  llmProvider: ILLMProvider;
  
  /** 超时配置(毫秒) */
  timeout?: number;
}

/**
 * 生成结果
 */
export interface GenerationResult<T extends MiniGameConfig = MiniGameConfig> {
  /** 是否成功生成 */
  success: boolean;
  
  /** 生成的配置 */
  config?: T;
  
  /** 错误信息(如果失败) */
  error?: string;
  
  /** 使用的提示词(用于调试) */
  usedPrompt?: string | undefined;
  
  /** LLM原始响应(用于调试) */
  rawResponse?: string | undefined;
  
  /** 生成的元数据 */
  metadata?: {
    generationTime: number;
    llmTokensUsed?: number;
    attempts: number;
  };
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否通过验证 */
  valid: boolean;
  
  /** 错误列表 */
  errors: string[];
  
  /** 警告列表 */
  warnings: string[];
  
  /** 建议的修复 */
  suggestions?: string[];
}

/**
 * 小游戏生成器接口
 * 所有具体生成器必须实现
 */
export interface IMiniGameGenerator<T extends MiniGameConfig = MiniGameConfig> {
  /** 支持的游戏类型 */
  readonly type: MiniGameType;
  
  /** 生成器名称(人类可读) */
  readonly name: string;
  
  /** 支持的难度范围 */
  readonly supportedDifficultyRange: [number, number]; // [min, max]
  
  /** 最小所需空间尺寸 */
  readonly minSize: ZoneSize;
  
  /**
   * 构建LLM提示词
   * 根据上下文生成完整的提示词
   */
  buildPrompt(context: MiniGameContext): string;
  
  /**
   * 解析LLM响应
   * 将文本转换为结构化的游戏配置
   */
  parseResponse(response: string, zoneId: string, position: Position): MiniGameZone;
  
  /**
   * 验证生成的配置
   * 确保配置合法且可解
   */
  validate(zone: MiniGameZone): ValidationResult;
  
  /**
   * 生成降级方案
   * 当LLM生成失败时提供预设配置
   */
  generateFallback(context: MiniGameContext): MiniGameZone;
  
  /**
   * 生成完整游戏
   * 组合提示词构建、LLM调用、解析和验证
   */
  generate(context: MiniGameContext): Promise<GenerationResult<T>>;
  
  /**
   * 检查可解性(复杂游戏需要)
   * 返回解决方案或null(无解)
   */
  checkSolvability?(config: T): { solvable: boolean; solution?: unknown[] };
}

/**
 * 小游戏生成器构造函数
 */
export type MiniGameGeneratorConstructor = new (options?: BaseGeneratorOptions) => IMiniGameGenerator;