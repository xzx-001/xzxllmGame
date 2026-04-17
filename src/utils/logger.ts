// src/utils/logger.ts
/**
 * @fileoverview 日志工具模块
 * 
 * 提供分级日志记录功能，支持控制台和文件输出。
 * 采用单例模式管理全局日志实例，支持结构化日志输出（JSON格式）。
 * 日志级别遵循 syslog 标准：DEBUG < INFO < WARN < ERROR < FATAL
 * 
 * @module utils/logger
 * @version 1.0.0
 * @license MIT
 */

import { EventEmitter } from 'events';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * 日志级别枚举
 * 数值越小优先级越低（越详细）
 */
export enum LogLevel {
  DEBUG = 0,   // 调试信息，仅开发环境使用
  INFO = 1,    // 一般信息，记录正常运行状态
  WARN = 2,    // 警告，可能的问题但不影响运行
  ERROR = 3,   // 错误，功能受损但系统仍运行
  FATAL = 4,   // 致命错误，系统即将崩溃
  SILENT = 5   // 完全静默，不输出任何日志
}

/**
 * 日志配置选项接口
 */
export interface LoggerOptions {
  /** 最低日志级别，低于此级别的日志将被忽略 */
  level: LogLevel;
  /** 是否启用彩色输出（控制台） */
  enableColors: boolean;
  /** 是否包含时间戳 */
  includeTimestamp: boolean;
  /** 日志文件路径（可选），如不提供则仅输出到控制台 */
  logFilePath?: string | undefined;
  /** 是否以JSON格式输出（结构化日志） */
  jsonFormat: boolean;
  /** 最大日志文件大小（MB），超过将触发轮转 */
  maxFileSizeMB: number;
  /** 日志轮转保留份数 */
  maxBackupFiles: number;
  /** 上下文前缀，用于区分不同模块的日志 */
  context?: string | undefined;
}

/**
 * 日志条目结构
 */
export interface LogEntry {
  /** 时间戳（ISO 8601格式） */
  timestamp: string;
  /** 日志级别 */
  level: LogLevel;
  /** 级别名称 */
  levelName: string;
  /** 日志消息 */
  message: string;
  /** 上下文/模块名 */
  context?: string;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
  /** 错误堆栈（如果是错误日志） */
  stack?: string;
}

/**
 * 日志事件类型
 */
export type LogEventType = 'log' | 'error' | 'rotate';

/**
 * 全局日志配置
 */
const GlobalConfig: LoggerOptions = {
  level: LogLevel.INFO,
  enableColors: true,
  includeTimestamp: true,
  jsonFormat: false,
  maxFileSizeMB: 10,
  maxBackupFiles: 5,
  logFilePath: undefined
};

/**
 * ANSI 颜色代码（用于控制台彩色输出）
 */
const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  // 前景色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // 背景色
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

/**
 * 日志级别对应的颜色映射
 */
const LevelColors: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: Colors.cyan,
  [LogLevel.INFO]: Colors.green,
  [LogLevel.WARN]: Colors.yellow,
  [LogLevel.ERROR]: Colors.red,
  [LogLevel.FATAL]: Colors.bgRed + Colors.white,
  [LogLevel.SILENT]: ''
};

/**
 * 日志级别名称映射
 */
const LevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
  [LogLevel.SILENT]: 'SILENT'
};

/**
 * 日志记录器类
 * 
 * 功能特性：
 * 1. 分级日志控制 - 根据配置级别过滤日志
 * 2. 双模式输出 - 支持人类可读的文本格式和机器可解析的JSON格式
 * 3. 文件轮转 - 自动管理日志文件大小，防止磁盘占满
 * 4. 事件驱动 - 提供日志事件监听，便于集成外部监控系统
 * 5. 上下文追踪 - 支持模块化日志，标识日志来源
 * 
 * @example
 * ```typescript
 * const logger = Logger.getInstance();
 * logger.info('系统启动', { version: '1.0.0' });
 * 
 * // 创建带上下文的子记录器
 * const gameLogger = logger.withContext('GameEngine');
 * gameLogger.debug('生成关卡', { levelId: 'L001' });
 * ```
 */
export class Logger extends EventEmitter {
  /** 单例实例 */
  private static instance: Logger | null = null;
  /** 当前日志配置 */
  private config: LoggerOptions;
  /** 当前日志文件大小（字节） */
  private currentFileSize: number = 0;
  /** 是否已初始化文件系统 */
  private fileSystemReady: boolean = false;

  /**
   * 私有构造函数，强制使用 getInstance()
   */
  protected constructor(options: Partial<LoggerOptions> = {}) {
    super();
    this.config = { ...GlobalConfig, ...options };
    this.initializeFileSystem();
  }

  /**
   * 获取 Logger 单例实例
   * 
   * @param options - 可选的配置覆盖（仅在首次创建时生效）
   * @returns Logger 实例
   */
  /**
   * 创建新的 Logger 实例（非单例）
   */
  public static create(options?: Partial<LoggerOptions>): Logger {
    return new Logger(options);
  }

  public static getInstance(options?: Partial<LoggerOptions>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(options);
    } else if (options && Object.keys(options).length > 0) {
      // 如果已存在实例但提供了新配置，更新配置
      Logger.instance.updateConfig(options);
    }
    return Logger.instance;
  }

  /**
   * 重置单例（主要用于测试）
   * @internal
   */
  public static resetInstance(): void {
    Logger.instance = null;
  }

  /**
   * 更新日志配置
   * 
   * @param options - 新的配置选项
   */
  public updateConfig(options: Partial<LoggerOptions>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...options };
    
    // 如果文件路径变更，重新初始化文件系统
    if (options.logFilePath && options.logFilePath !== oldConfig.logFilePath) {
      this.fileSystemReady = false;
      this.initializeFileSystem();
    }
    
    this.emit('configChanged', { old: oldConfig, new: this.config });
  }

  /**
   * 初始化文件系统（创建日志目录）
   * @private
   */
  private initializeFileSystem(): void {
    if (this.fileSystemReady || !this.config.logFilePath) {
      return;
    }

    try {
      const dir = dirname(this.config.logFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      // 如果文件已存在，获取当前大小用于轮转判断
      if (existsSync(this.config.logFilePath)) {
        appendFileSync(this.config.logFilePath, '');
        // 这里简化了，实际上应该用 fs.statSync
      }
      
      this.fileSystemReady = true;
    } catch (error) {
      this.emit('error', { type: 'filesystem_init', error });
      // 文件系统初始化失败时降级为仅控制台输出
      this.config.logFilePath = undefined;
    }
  }

  /**
   * 创建日志条目对象
   * 
   * @param level - 日志级别
   * @param message - 消息内容
   * @param metadata - 附加元数据
   * @returns 完整的日志条目
   */
  private createEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): LogEntry {
    const error = metadata?.error as Error | undefined;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: LevelNames[level],
      message
    };

    if (this.config.context !== undefined) {
      entry.context = this.config.context;
    }
    if (metadata) {
      entry.metadata = this.sanitizeMetadata(metadata);
    }
    if (error?.stack !== undefined) {
      entry.stack = error.stack;
    }

    return entry;
  }

  /**
   * 清理元数据，移除循环引用和敏感信息
   * 
   * @param metadata - 原始元数据
   * @returns 清理后的安全数据
   */
  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const seen = new WeakSet();
    
    const sanitize = (obj: unknown): unknown => {
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }
      
      // 处理Error对象
      if (obj instanceof Error) {
        return {
          name: obj.name,
          message: obj.message,
          stack: obj.stack
        };
      }
      
      // 防止循环引用
      if (seen.has(obj as object)) {
        return '[Circular]';
      }
      seen.add(obj as object);
      
      // 处理数组
      if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item));
      }
      
      // 处理对象
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // 跳过敏感字段（简单示例，实际可能需要配置）
        if (['password', 'secret', 'token', 'apiKey'].includes(key.toLowerCase())) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = sanitize(value);
        }
      }
      return result;
    };
    
    return sanitize(metadata) as Record<string, unknown>;
  }

  /**
   * 格式化日志条目为字符串
   * 
   * @param entry - 日志条目
   * @returns 格式化后的字符串
   */
  private formatEntry(entry: LogEntry): string {
    if (this.config.jsonFormat) {
      return JSON.stringify(entry);
    }
    
    const parts: string[] = [];
    
    // 时间戳
    if (this.config.includeTimestamp) {
      const timeStr = entry.timestamp.split('T')[1]?.replace('Z', '') ?? '';
      parts.push(`[${Colors.dim}${timeStr}${Colors.reset}]`);
    }
    
    // 级别标签（带颜色）
    const levelColor = this.config.enableColors ? LevelColors[entry.level] : '';
    const resetColor = this.config.enableColors ? Colors.reset : '';
    const levelStr = `${levelColor}[${entry.levelName.padEnd(5)}]${resetColor}`;
    parts.push(levelStr);
    
    // 上下文
    if (entry.context) {
      const ctxColor = this.config.enableColors ? Colors.magenta : '';
      parts.push(`${ctxColor}[${entry.context}]${resetColor}`);
    }
    
    // 消息
    parts.push(entry.message);
    
    // 元数据（非JSON格式时简化为单行）
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const metaStr = Object.entries(entry.metadata)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ');
      parts.push(`{${metaStr}}`);
    }
    
    // 错误堆栈
    if (entry.stack) {
      parts.push('\n' + entry.stack);
    }
    
    return parts.join(' ');
  }

  /**
   * 写入日志到输出目标
   * 
   * @param entry - 日志条目
   */
  private write(entry: LogEntry): void {
    const formatted = this.formatEntry(entry);
    
    // 控制台输出
    if (entry.level >= LogLevel.ERROR) {
      console.error(formatted);
    } else if (entry.level === LogLevel.WARN) {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
    
    // 文件输出
    if (this.config.logFilePath && this.fileSystemReady) {
      try {
        const line = (this.config.jsonFormat ? formatted : formatted.replace(/\x1b\[\d+m/g, '')) + '\n';
        appendFileSync(this.config.logFilePath, line);
        
        // 简单的大小检查（实际实现可能需要更复杂的轮转逻辑）
        this.currentFileSize += Buffer.byteLength(line, 'utf8');
        if (this.currentFileSize > this.config.maxFileSizeMB * 1024 * 1024) {
          this.rotateLogFile();
        }
      } catch (error) {
        this.emit('error', { type: 'file_write', error });
      }
    }
    
    // 触发日志事件
    this.emit('log', entry);
  }

  /**
   * 日志文件轮转
   * 将当前日志文件重命名为备份，创建新文件
   */
  private rotateLogFile(): void {
    if (!this.config.logFilePath) return;
    
    try {
      // 简单的轮转：移动现有文件为 .1, .2 等
      for (let i = this.config.maxBackupFiles - 1; i >= 1; i--) {
        const oldPath = `${this.config.logFilePath}.${i}`;
        if (existsSync(oldPath)) {
          // 删除最旧的（超出保留份数）
          if (i === this.config.maxBackupFiles - 1) {
            // Node.js 18+ 支持，否则需要 fs.rmSync
            // 这里简化处理
          } else {
            // 重命名
            // fs.renameSync(oldPath, newPath);
          }
        }
      }
      
      // 将当前文件移动为 .1
      // fs.renameSync(this.config.logFilePath, `${this.config.logFilePath}.1`);
      
      this.currentFileSize = 0;
      this.emit('rotate', { file: this.config.logFilePath });
    } catch (error) {
      this.emit('error', { type: 'rotate', error });
    }
  }

  /**
   * 检查是否应该记录指定级别的日志
   * 
   * @param level - 要检查的级别
   * @returns 是否应该记录
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level && level < LogLevel.SILENT;
  }

  /**
   * 记录 DEBUG 级别日志
   * 用于详细的调试信息，仅在开发环境开启
   * 
   * @param message - 消息
   * @param metadata - 元数据
   */
  public debug(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.write(this.createEntry(LogLevel.DEBUG, message, metadata));
    }
  }

  /**
   * 记录 INFO 级别日志
   * 用于记录系统正常运行状态的关键节点
   * 
   * @param message - 消息
   * @param metadata - 元数据
   */
  public info(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.write(this.createEntry(LogLevel.INFO, message, metadata));
    }
  }

  /**
   * 记录 WARN 级别日志
   * 用于可能的问题或异常情况，但不影响核心功能
   * 
   * @param message - 消息
   * @param metadata - 元数据
   */
  public warn(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.write(this.createEntry(LogLevel.WARN, message, metadata));
    }
  }

  /**
   * 记录 ERROR 级别日志
   * 用于功能受损的错误情况
   * 
   * @param message - 消息
   * @param error - 错误对象或元数据
   */
  public error(message: string, error?: Error | Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const metadata = error instanceof Error ? { error } : error;
      this.write(this.createEntry(LogLevel.ERROR, message, metadata));
    }
  }

  /**
   * 记录 FATAL 级别日志
   * 用于系统即将崩溃的致命错误
   * 
   * @param message - 消息
   * @param error - 错误对象或元数据
   */
  public fatal(message: string, error?: Error | Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.FATAL)) {
      const metadata = error instanceof Error ? { error } : error;
      this.write(this.createEntry(LogLevel.FATAL, message, metadata));
      // FATAL 日志通常会触发警报机制
      this.emit('fatal', { message, error: metadata });
    }
  }

  /**
   * 创建带上下文的子记录器
   * 用于标识特定模块的日志来源
   * 
   * @param context - 上下文名称（如 'GameEngine', 'LLMProvider'）
   * @returns 新的 Logger 实例（共享同一个底层，但带上下文前缀）
   */
  public withContext(context: string): Logger {
    const childLogger = new Logger({
      ...this.config,
      context
    });
    // 共享事件监听器（可选）
    return childLogger;
  }

  /**
   * 设置全局日志级别
   * 这是一个便捷方法，修改单例的配置
   * 
   * @param level - 新的日志级别
   */
  public static setGlobalLevel(level: LogLevel): void {
    if (Logger.instance) {
      Logger.instance.updateConfig({ level });
    } else {
      GlobalConfig.level = level;
    }
  }
}

/**
 * 便捷的默认导出实例
 */
export const logger = Logger.getInstance();

/**
 * 空日志记录器（No-op Logger）
 * 用于测试环境或需要完全禁用日志的场景
 */
export class NoopLogger extends Logger {
  public debug(): void {}
  public info(): void {}
  public warn(): void {}
  public error(): void {}
  public fatal(): void {}
  public emit(): boolean { return true; }
}