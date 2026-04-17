// src/utils/helpers/string-helper.ts
/**
 * @fileoverview 字符串处理辅助工具
 * 
 * 提供游戏开发中常用的字符串操作：
 * - 截断与缩略（带省略号）
 * - 命名风格转换（驼峰、蛇形、烤串形）
 * - 模板插值（简单变量替换）
 * - 清理控制字符（处理 LLM 输出中的特殊字符）
 * - 相似度计算（Levenshtein 距离，用于模糊匹配）
 * 
 * @module utils/helpers/string-helper
 */

/**
 * 命名风格类型
 */
export type NamingConvention = 'camel' | 'snake' | 'kebab' | 'pascal' | 'screaming_snake';

/**
 * 截断字符串，超出长度显示省略号
 * 
 * @param str - 原始字符串
 * @param maxLength - 最大长度（包含省略号）
 * @param ellipsis - 省略号字符，默认为 '...'
 * @returns 截断后的字符串
 * 
 * @example
 * truncate('这是一个很长的字符串', 8) // '这是一个...'
 */
export function truncate(str: string, maxLength: number, ellipsis: string = '...'): string {
  if (str.length <= maxLength) return str;
  
  const truncateLength = maxLength - ellipsis.length;
  if (truncateLength <= 0) return ellipsis;
  
  return str.substring(0, truncateLength) + ellipsis;
}

/**
 * 清理字符串中的控制字符和异常空白
 * 
 * LLM 输出常包含零宽字符、不间断空格等，需要清理
 * 
 * @param str - 原始字符串
 * @returns 清理后的字符串
 */
export function sanitize(str: string): string {
  return str
    // 移除零宽字符
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // 统一各种空白为普通空格
    .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    // 移除控制字符（保留换行和制表）
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    // 规范化换行
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 合并连续空白
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * 命名风格转换
 * 
 * @param str - 输入字符串（任意风格）
 * @param target - 目标风格
 * @returns 转换后的字符串
 */
export function convertNaming(str: string, target: NamingConvention): string {
  // 首先拆分为单词数组
  const words = str
    .replace(/([A-Z])/g, ' $1') // 驼峰转空格分隔
    .toLowerCase()
    .replace(/[_-]/g, ' ') // 蛇形/烤串转空格
    .trim()
    .split(/\s+/);

  switch (target) {
    case 'camel':
      return words
        .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
    
    case 'pascal':
      return words
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
    
    case 'snake':
      return words.join('_');
    
    case 'screaming_snake':
      return words.join('_').toUpperCase();
    
    case 'kebab':
      return words.join('-');
    
    default:
      return str;
  }
}

/**
 * 简单模板插值
 * 
 * 支持 {{variable}} 语法，如果变量不存在保留原样或替换为空
 * 
 * @param template - 模板字符串
 * @param variables - 变量映射
 * @param strict - 严格模式（缺失变量报错），默认 false
 * @returns 插值后的字符串
 * 
 * @example
 * template('Hello, {{name}}!', { name: 'World' }) // 'Hello, World!'
 */
export function template(
  template: string, 
  variables: Record<string, string | number>,
  strict: boolean = false
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in variables) {
      return String(variables[key]);
    }
    if (strict) {
      throw new Error(`模板变量缺失: ${key}`);
    }
    return match; // 非严格模式保留原样
  });
}

/**
 * 计算 Levenshtein 编辑距离
 * 
 * 用于模糊字符串匹配，如玩家输入与预期答案的相似度
 * 
 * @param a - 字符串 A
 * @param b - 字符串 B
 * @returns 编辑距离（越小越相似）
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // 初始化第一行和第一列
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  // 填充矩阵
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // 替换
          matrix[i]![j - 1]! + 1,     // 插入
          matrix[i - 1]![j]! + 1      // 删除
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * 计算字符串相似度（0-1）
 * 
 * @param a - 字符串 A
 * @param b - 字符串 B
 * @returns 相似度，1 表示完全相同
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

/**
 * 生成随机字符串 ID（用于临时标识）
 * 
 * @param length - 长度，默认 8
 * @param prefix - 可选前缀
 * @returns 随机字符串
 */
export function randomId(length: number = 8, prefix?: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix ? `${prefix}_${result}` : result;
}

/**
 * 转义正则表达式特殊字符
 * 
 * @param str - 原始字符串
 * @returns 转义后的字符串，可用于 RegExp 构造
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将多行文本格式化为固定宽度（用于游戏内终端显示）
 * 
 * @param text - 原始文本
 * @param width - 目标宽度
 * @returns 格式化后的行数组
 */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length > width) {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines;
}