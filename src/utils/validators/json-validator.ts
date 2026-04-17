// src/utils/validators/json-validator.ts
/**
 * @fileoverview JSON 验证与清洗工具
 * 
 * 专门用于处理 LLM 返回的非结构化文本中提取有效 JSON。
 * LLM 经常返回 Markdown 代码块包裹的 JSON（```json ... ```），
 * 或包含前后缀说明文字，本模块提供鲁棒的提取和验证机制。
 * 
 * 功能：
 * - Markdown 代码块提取
 * - 注释移除（JSON 中的行注释 // 和块注释）
 * - 尾随逗号清理
 * - 错误位置标记与修复建议
 * - 多行 JSON 拼接处理
 * 
 * @module utils/validators/json-validator
 */

import { Logger } from '../logger.js';

/**
 * JSON 验证结果接口
 */
export interface JSONValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 解析后的数据对象（失败时为 null） */
  data: unknown | null;
  /** 清洗后的原始字符串（失败时为 null） */
  cleaned: string | null;
  /** 错误信息数组 */
  errors: string[];
  /** 错误位置信息（行号/列号） */
  errorPosition?: {
    line: number;
    column: number;
    excerpt: string;
  };
  /** 修复建议 */
  suggestions?: string[];
}

/**
 * JSON 清洗选项
 */
export interface JSONCleanOptions {
  /** 是否移除注释 */
  removeComments: boolean;
  /** 是否移除尾随逗号 */
  removeTrailingCommas: boolean;
  /** 是否提取 Markdown 代码块 */
  extractMarkdown: boolean;
  /** 是否允许多个 JSON 对象（返回数组） */
  allowMultiple: boolean;
  /** 最大递归深度（防止循环引用） */
  maxDepth: number;
  /** 是否宽松模式（尝试多种修复策略） */
  lenient: boolean;
}

/**
 * 默认清洗选项
 */
const DefaultCleanOptions: JSONCleanOptions = {
  removeComments: true,
  removeTrailingCommas: true,
  extractMarkdown: true,
  allowMultiple: false,
  maxDepth: 10,
  lenient: true
};

/**
 * JSON 验证器类
 * 
 * 处理从 LLM 输出中提取和验证 JSON 的复杂场景。
 * 实现了多层降级策略：标准解析 -> 清洗后解析 -> 宽松模式解析。
 */
export class JSONValidator {
  private logger: Logger;
  private options: JSONCleanOptions;

  /**
   * 创建验证器实例
   * 
   * @param options - 清洗选项
   */
  constructor(options?: Partial<JSONCleanOptions>) {
    this.options = { ...DefaultCleanOptions, ...options };
    this.logger = Logger.create({ context: 'JSONValidator' });
  }

  /**
   * 从文本中提取 Markdown 代码块内容
   * 
   * 支持多种格式：
   * - ```json ... ```
   * - ``` ... ```
   * - ` ... `（单行）
   * 
   * @param text - 原始文本
   * @returns 提取的内容数组（可能多个）
   */
  public extractMarkdownBlocks(text: string): string[] {
    const blocks: string[] = [];
    
    // 匹配 ```json ... ``` 或 ``` ... ```
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match[1]) {
        blocks.push(match[1].trim());
      }
    }

    // 如果没找到代码块，尝试单行 `...`
    if (blocks.length === 0) {
      const inlineRegex = /`([^`]+)`/g;
      while ((match = inlineRegex.exec(text)) !== null) {
        if (match[1]!.includes('{') || match[1]!.includes('[')) {
          blocks.push(match[1]!.trim());
        }
      }
    }

    return blocks;
  }

  /**
   * 移除 JSON 中的注释
   * 
   * 支持：
   * - 单行注释 // ...
   * - 多行注释 /* ... * /
   * - 字符串内的注释保留
   * 
   * @param json - JSON 字符串
   * @returns 清理后的字符串
   */
  public removeComments(json: string): string {
    let result = '';
    let inString = false;
    let escapeNext = false;
    let i = 0;

    while (i < json.length) {
      const char = json[i];
      const nextChar = json[i + 1];

      if (inString) {
        if (escapeNext) {
          escapeNext = false;
        } else if (char === '\\') {
          escapeNext = true;
        } else if (char === '"') {
          inString = false;
        }
        result += char;
      } else {
        // 不在字符串内，可以移除注释
        if (char === '/' && nextChar === '/') {
          // 单行注释，跳过到行尾
          while (i < json.length && json[i] !== '\n') {
            i++;
          }
          continue;
        } else if (char === '/' && nextChar === '*') {
          // 多行注释，跳过到 */
          i += 2;
          while (i < json.length - 1 && !(json[i] === '*' && json[i + 1] === '/')) {
            i++;
          }
          i += 2; // 跳过 */
          continue;
        } else if (char === '"') {
          inString = true;
          result += char;
        } else {
          result += char;
        }
      }
      i++;
    }

    return result;
  }

  /**
   * 移除尾随逗号（最后一个元素后的逗号）
   * 
   * JSON 标准不允许尾随逗号，但 JS 对象允许，LLM 经常生成这种格式
   * 
   * @param json - JSON 字符串
   * @returns 清理后的字符串
   */
  public removeTrailingCommas(json: string): string {
    // 使用正则表达式移除对象和数组中的尾随逗号
    // 匹配 }, 前的逗号 或 ] 前的逗号
    return json.replace(/,(?=\s*[}\]])/g, '');
  }

  /**
   * 预处理：统一空白字符，处理 BOM 等
   */
  public preprocess(text: string): string {
    // 移除 BOM
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    // 统一换行符为 \n
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * 尝试解析 JSON，记录详细的错误位置
   * 
   * @param text - 要解析的文本
   * @returns 验证结果
   */
  public validate(text: string): JSONValidationResult {
    const startTime = Date.now();
    let cleaned = this.preprocess(text);
    const errors: string[] = [];
    let suggestions: string[] = [];

    try {
      // 第一步：尝试直接解析
      const data = JSON.parse(cleaned);
      return {
        valid: true,
        data,
        cleaned,
        errors: []
      };
    } catch (initialError) {
      errors.push(`直接解析失败: ${initialError instanceof Error ? initialError.message : String(initialError)}`);
    }

    // 第二步：提取 Markdown 代码块
    if (this.options.extractMarkdown) {
      const blocks = this.extractMarkdownBlocks(cleaned);
      if (blocks.length > 0) {
        // 使用第一个代码块继续处理
        cleaned = blocks[0]!;
        if (blocks.length > 1 && this.options.allowMultiple) {
          // 如果允许多个，返回数组
          try {
            const multiData = blocks.map(b => JSON.parse(b));
            return {
              valid: true,
              data: multiData,
              cleaned: blocks.join('\n'),
              errors: []
            };
          } catch {
            // 多解析失败，继续单处理
          }
        }
      }
    }

    // 第三步：清洗处理
    if (this.options.removeComments) {
      cleaned = this.removeComments(cleaned);
    }
    
    if (this.options.removeTrailingCommas) {
      cleaned = this.removeTrailingCommas(cleaned);
    }

    // 再次尝试解析
    try {
      const data = JSON.parse(cleaned);
      this.logger.debug('JSON 验证成功（清洗后）', {
        durationMs: Date.now() - startTime,
        originalLength: text.length,
        cleanedLength: cleaned.length
      });
      return {
        valid: true,
        data,
        cleaned,
        errors
      };
    } catch (cleanError) {
      errors.push(`清洗后解析失败: ${cleanError instanceof Error ? cleanError.message : String(cleanError)}`);
    }

    // 第四步：宽松模式（尝试修复常见错误）
    if (this.options.lenient) {
      const fixed = this.attemptRepair(cleaned);
      if (fixed !== cleaned) {
        try {
          const data = JSON.parse(fixed);
          suggestions.push('自动修复了格式问题（如引号不匹配）');
          return {
            valid: true,
            data,
            cleaned: fixed,
            errors,
            suggestions
          };
        } catch {
          errors.push('自动修复后仍失败');
        }
      }
    }

    // 所有尝试失败，分析错误位置
    const errorPos = this.locateError(cleaned);
    
    const result: JSONValidationResult = {
      valid: false,
      data: null,
      cleaned: null,
      errors,
      suggestions: this.generateSuggestions(cleaned, errorPos)
    };
    if (errorPos !== undefined) {
      result.errorPosition = errorPos;
    }
    return result;
  }

  /**
   * 尝试修复常见 JSON 错误
   * 
   * @param json - 损坏的 JSON
   * @returns 修复后的字符串
   */
  private attemptRepair(json: string): string {
    let fixed = json;

    // 1. 修复单引号（应为双引号）
    // 这是一个简化实现，实际可能需要状态机处理字符串边界
    fixed = fixed.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3'); // 键
    fixed = fixed.replace(/(:\s*)'([^']+)'(\s*[},])/g, '$1"$2"$3'); // 值

    // 2. 修复未加引号的键
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // 3. 修复缺少的右括号（简单补全）
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/]/g) || []).length;

    if (openBraces > closeBraces) {
      fixed += '}'.repeat(openBraces - closeBraces);
    }
    if (openBrackets > closeBrackets) {
      fixed += ']'.repeat(openBrackets - closeBrackets);
    }

    return fixed;
  }

  /**
   * 定位 JSON 解析错误位置
   * 
   * @param json - 解析失败的 JSON
   * @returns 位置信息
   */
  private locateError(json: string): { line: number; column: number; excerpt: string } | undefined {
    try {
      JSON.parse(json);
      return undefined;
    } catch (error) {
      if (error instanceof Error) {
        // 尝试从错误消息提取位置，不同引擎格式不同
        // V8 引擎格式: Unexpected token } in JSON at position 123
        const posMatch = error.message.match(/position (\d+)/);
        if (posMatch) {
          const pos = parseInt(posMatch[1]!, 10);
          let line = 1;
          let col = 1;
          
          for (let i = 0; i < pos && i < json.length; i++) {
            if (json[i] === '\n') {
              line++;
              col = 1;
            } else {
              col++;
            }
          }

          // 提取上下文
          const lines = json.split('\n');
          const excerpt = lines[line - 1]?.trim() || 'N/A';

          return { line, column: col, excerpt };
        }
      }
    }
    return undefined;
  }

  /**
   * 根据错误生成修复建议
   */
  private generateSuggestions(
    json: string, 
    errorPos?: { line: number; column: number; excerpt: string }
  ): string[] {
    const suggestions: string[] = [];
    
    if (!errorPos) return suggestions;

    // 分析错误行内容给出建议
    const line = errorPos.excerpt;
    
    if (line.includes("'")) {
      suggestions.push('检测到单引号，JSON 标准要求使用双引号');
    }
    if (line.match(/[}\]]\s*,?\s*$/)) {
      suggestions.push('检查是否有尾随逗号或括号不匹配');
    }
    if (line.match(/[a-zA-Z_][a-zA-Z0-9_]*\s*:/)) {
      suggestions.push('检测到未加引号的键名，JSON 要求键名必须用双引号包裹');
    }
    if (json.split('{').length !== json.split('}').length) {
      suggestions.push('花括号数量不匹配，检查遗漏的 { 或 }');
    }

    return suggestions;
  }

  /**
   * 验证并转换为特定类型（泛型支持）
   * 
   * @param text - JSON 文本
   * @param validator - 类型守卫函数（可选）
   * @returns 类型化的验证结果
   */
  public validateAs<T>(
    text: string,
    validator?: (data: unknown) => data is T
  ): Omit<JSONValidationResult, 'data'> & { data: T | null } {
    const result = this.validate(text);
    
    if (result.valid && result.data !== null && validator) {
      if (!validator(result.data)) {
        return {
          ...result,
          valid: false,
          data: null,
          errors: [...result.errors, '类型验证失败：数据不符合预期结构']
        };
      }
    }

    return result as Omit<JSONValidationResult, 'data'> & { data: T | null };
  }

  /**
   * 快速验证（静态方法）
   * 
   * @param text - JSON 文本
   * @returns 是否有效
   */
  public static isValid(text: string): boolean {
    const validator = new JSONValidator();
    return validator.validate(text).valid;
  }

  /**
   * 快速提取（静态方法）
   * 
   * @param text - 可能包含 Markdown 的文本
   * @returns 提取的 JSON 对象（失败返回 null）
   */
  public static extract(text: string): unknown | null {
    const validator = new JSONValidator();
    return validator.validate(text).data;
  }
}