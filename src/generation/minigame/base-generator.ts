/**
 * @fileoverview 小游戏生成器基类 (BaseMiniGameGenerator)
 * @description 提供所有小游戏生成器的公共功能：
 * - 通用的LLM调用和重试逻辑
 * - JSON响应解析和清理
 * - 错误处理和降级方案
 * - 日志记录
 * 
 * 具体生成器应继承此类并实现抽象方法
 * 
 * @module generation/minigame/base-generator
 */

import { 
  IMiniGameGenerator, 
  MiniGameType, 
  MiniGameConfig, 
  MiniGameContext, 
  MiniGameZone,
  GenerationResult,
  ValidationResult,
  ZoneSize,
  Position
} from './types.js';

/**
 * 基类配置选项
 */
export interface BaseGeneratorOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  
  /** 重试延迟(毫秒) */
  retryDelay?: number;
  
  /** 生成超时(毫秒) */
  timeout?: number;
  
  /** 是否验证可解性(可能耗时) */
  validateSolvability?: boolean;
  
  /** 调试模式(保留原始响应) */
  debug?: boolean;
}

/**
 * 小游戏生成器抽象基类
 * 具体实现必须继承此类
 */
export abstract class BaseMiniGameGenerator<T extends MiniGameConfig = MiniGameConfig>
  implements IMiniGameGenerator<T> {
  
  // 抽象属性：子类必须定义
  abstract readonly type: MiniGameType;
  abstract readonly name: string;
  abstract readonly supportedDifficultyRange: [number, number];
  abstract readonly minSize: ZoneSize;
  
  // 配置选项
  protected options: Required<BaseGeneratorOptions>;
  
  constructor(options: BaseGeneratorOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 30000,
      validateSolvability: options.validateSolvability ?? true,
      debug: options.debug ?? false
    };
  }

  /**
   * 构建提示词 - 子类必须实现
   * @param context 生成上下文
   */
  abstract buildPrompt(context: MiniGameContext): string;

  /**
   * 解析响应为游戏区域配置 - 子类必须实现
   * @param response LLM原始响应
   * @param zoneId 区域ID
   * @param position 位置坐标
   */
  abstract parseResponse(response: string, zoneId: string, position: Position): MiniGameZone;

  /**
   * 验证配置合法性 - 子类必须实现
   * @param zone 游戏区域配置
   */
  abstract validate(zone: MiniGameZone): ValidationResult;

  /**
   * 生成降级配置 - 子类必须实现
   * @param context 生成上下文
   */
  abstract generateFallback(context: MiniGameContext): MiniGameZone;

  /**
   * 生成完整游戏流程
   * 包含重试、验证、降级逻辑
   * 
   * @param context 生成上下文
   */
  async generate(context: MiniGameContext): Promise<GenerationResult<T>> {
    const startTime = Date.now();
    let lastError: string | undefined;
    
    // 检查难度范围
    if (context.targetDifficulty < this.supportedDifficultyRange[0] ||
        context.targetDifficulty > this.supportedDifficultyRange[1]) {
      console.warn(
        `[${this.name}] Difficulty ${context.targetDifficulty} out of range ` +
        `[${this.supportedDifficultyRange.join('-')}], clamping...`
      );
      context.targetDifficulty = Math.max(
        this.supportedDifficultyRange[0],
        Math.min(this.supportedDifficultyRange[1], context.targetDifficulty)
      );
    }

    // 重试循环
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        // 构建提示词
        const prompt = this.buildPrompt(context);
        
        // 调用LLM
        const llmResponse = await this.callLLM(context, prompt);
        
        // 解析响应
        const zone = this.parseResponse(llmResponse, context.zoneId, context.position);
        
        // 验证配置
        const validation = this.validate(zone);
        
        if (!validation.valid) {
          // 验证失败，记录错误并可能重试
          lastError = `Validation failed: ${validation.errors.join(', ')}`;
          console.warn(`[${this.name}] Attempt ${attempt} failed validation:`, validation.errors);
          
          if (attempt < this.options.maxRetries) {
            await this.delay(this.options.retryDelay * attempt); // 指数退避
            continue;
          }
        }
        
        // 检查可解性(如果启用且方法存在)
        if (this.options.validateSolvability && this.checkSolvability) {
          const solvability = this.checkSolvability(zone.initialConfig as T);
          if (!solvability.solvable) {
            lastError = 'Generated puzzle is not solvable';
            console.warn(`[${this.name}] Attempt ${attempt} generated unsolvable puzzle`);
            
            if (attempt < this.options.maxRetries) {
              await this.delay(this.options.retryDelay * attempt);
              continue;
            }
          }
        }
        
        // 成功生成
        const generationTime = Date.now() - startTime;
        
        return {
          success: true,
          config: zone.initialConfig as T,
          usedPrompt: this.options.debug ? prompt : undefined,
          rawResponse: this.options.debug ? llmResponse : undefined,
          metadata: {
            generationTime,
            attempts: attempt
          }
        };
        
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`[${this.name}] Attempt ${attempt} error:`, lastError);
        
        if (attempt < this.options.maxRetries) {
          await this.delay(this.options.retryDelay * attempt);
        }
      }
    }
    
    // 所有重试失败，返回降级方案
    console.warn(`[${this.name}] All ${this.options.maxRetries} attempts failed, using fallback`);
    
    try {
      const fallbackZone = this.generateFallback(context);
      return {
        success: true, // 降级方案也算成功
        config: fallbackZone.initialConfig as T,
        error: `Used fallback after ${this.options.maxRetries} failed attempts. Last error: ${lastError}`,
        metadata: {
          generationTime: Date.now() - startTime,
          attempts: this.options.maxRetries
        }
      };
    } catch (fallbackError) {
      // 连降级都失败了
      return {
        success: false,
        error: `Failed to generate and fallback also failed. ` +
               `Last generation error: ${lastError}. ` +
               `Fallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        metadata: {
          generationTime: Date.now() - startTime,
          attempts: this.options.maxRetries
        }
      };
    }
  }

  /**
   * 调用LLM
   * 使用上下文中的提供商
   */
  protected async callLLM(
    context: MiniGameContext, 
    prompt: string
  ): Promise<string> {
    const timeout = context.timeout || this.options.timeout;
    
    // 创建超时Promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Generation timeout after ${timeout}ms`)), timeout);
    });
    
    // LLM调用Promise
    const llmPromise = context.llmProvider.generate(prompt, {
      temperature: 0.7,
      maxTokens: 2000
    });
    
    // 竞争
    const response = await Promise.race([llmPromise, timeoutPromise]);
    return response.text;
  }

  /**
   * 从LLM响应中提取JSON
   * 处理markdown代码块、多余文本等情况
   * 
   * @param response 原始响应文本
   * @param zoneId 区域ID(用于错误信息)
   */
  protected extractJSON(response: string, zoneId: string): string {
    // 尝试匹配```json代码块
    const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      return jsonBlockMatch[1]!.trim();
    }
    
    // 尝试匹配```代码块(无语言标识)
    const genericBlockMatch = response.match(/```\s*([\s\S]*?)\s*```/);
    if (genericBlockMatch) {
      return genericBlockMatch[1]!.trim();
    }
    
    // 尝试找到第一个 { 和最后一个 }
    const firstBrace = response.indexOf('{');
    const lastBrace = response.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return response.slice(firstBrace, lastBrace + 1);
    }
    
    // 尝试找到第一个 [ 和最后一个 ]
    const firstBracket = response.indexOf('[');
    const lastBracket = response.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return response.slice(firstBracket, lastBracket + 1);
    }
    
    throw new Error(`Cannot extract JSON from LLM response for zone ${zoneId}`);
  }

  /**
   * 通用验证方法
   * 子类可以调用 super.validateCommon()
   */
  protected validateCommon(zone: MiniGameZone): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 检查ID
    if (!zone.id || zone.id.trim() === '') {
      errors.push('Zone ID is required');
    }
    
    // 检查类型
    if (!zone.type) {
      errors.push('Game type is required');
    }
    
    // 检查尺寸
    if (zone.size.width < this.minSize.width || zone.size.height < this.minSize.height) {
      errors.push(
        `Zone size ${zone.size.width}x${zone.size.height} is smaller than ` +
        `minimum required ${this.minSize.width}x${this.minSize.height}`
      );
    }
    
    // 检查难度范围
    if (zone.difficulty < 0 || zone.difficulty > 1) {
      errors.push(`Difficulty ${zone.difficulty} out of range [0, 1]`);
    }
    
    // 检查配置存在性
    if (!zone.initialConfig) {
      errors.push('Initial config is required');
    }
    
    // 警告：配置类型不匹配
    if (zone.initialConfig && zone.initialConfig.type !== this.type) {
      warnings.push(
        `Config type "${zone.initialConfig.type}" does not match ` +
        `generator type "${this.type}"`
      );
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 可解性检查(可选)
   * 复杂游戏应重写此方法
   */
  checkSolvability?(config: T): { solvable: boolean; solution?: unknown[] };

  /**
   * 延迟工具
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 生成唯一ID
   */
  protected generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 根据难度计算参数
   * 线性插值工具
   */
  protected interpolate(difficulty: number, min: number, max: number): number {
    return min + (max - min) * difficulty;
  }

  /**
   * 根据难度选择数组元素
   */
  protected selectByDifficulty<T>(
    difficulty: number, 
    options: Array<{ threshold: number; value: T }>
  ): T {
    // 按阈值排序
    const sorted = [...options].sort((a, b) => a.threshold - b.threshold);
    
    // 找到第一个满足条件的
    for (const option of sorted) {
      if (difficulty <= option.threshold) {
        return option.value;
      }
    }
    
    // 默认返回最后一个
    if (sorted.length === 0) {
      throw new Error("Options array cannot be empty");
    }
    return sorted[sorted.length - 1]!.value;
  }
}