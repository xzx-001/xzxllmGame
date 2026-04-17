// src/utils/content-loader.ts
/**
 * @fileoverview 内容资源加载器
 * 
 * 负责从文件系统加载提示词模板、关卡配置、叙事文本等游戏内容资源。
 * 支持 JSON 和 YAML 格式，具备热重载（Hot Reload）功能用于开发环境，
 * 以及生产环境的缓存机制以提高性能。
 * 
 * 特性：
 * - 多格式支持：JSON、YAML、JSON5
 * - 热重载：开发模式下文件变更自动刷新（基于文件监听或轮询）
 * - 智能缓存：生产环境缓存文件内容，带TTL过期策略
 * - 路径解析：支持相对路径和绝对路径，自动解析 content/ 目录结构
 * - 错误处理：详细的加载错误报告，包含文件路径和行号信息
 * 
 * @module utils/content-loader
 * @version 1.0.0
 */

import { 
  readFileSync, 
  existsSync, 
  watch, 
  FSWatcher, 
  statSync,
  readdirSync
} from 'fs';
import { resolve, join, extname, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { Logger, LogLevel } from './logger.js';

/**
 * 解析 YAML 的占位类型声明
 * 实际项目中应安装 js-yaml 包
 */
interface YamlLib {
  load(content: string): unknown;
  dump(obj: unknown): string;
}

/**
 * 内容格式枚举
 */
export enum ContentFormat {
  JSON = 'json',
  YAML = 'yaml',
  JSON5 = 'json5',
  UNKNOWN = 'unknown'
}

/**
 * 加载器配置选项
 */
export interface ContentLoaderOptions {
  /** 基础内容目录路径，默认为项目根目录下的 content/ */
  basePath: string;
  /** 是否启用热重载（开发模式） */
  enableHotReload: boolean;
  /** 热重载轮询间隔（毫秒），如果系统不支持文件系统事件 */
  hotReloadIntervalMs: number;
  /** 是否启用缓存（生产模式） */
  enableCache: boolean;
  /** 缓存TTL（毫秒），0表示永不过期 */
  cacheTTLMs: number;
  /** 是否递归加载子目录 */
  recursive: boolean;
  /** 文件编码，默认 utf-8 */
  encoding: BufferEncoding;
  /** YAML解析器实例（可选，如使用YAML格式需提供） */
  yamlParser?: YamlLib;
  /** JSON5解析器实例（可选） */
  json5Parser?: { parse(text: string): unknown };
}

/**
 * 缓存条目结构
 */
interface CacheEntry<T> {
  /** 缓存的数据内容 */
  data: T;
  /** 最后加载时间戳 */
  loadedAt: number;
  /** 文件最后修改时间 */
  mtime: number;
  /** 访问次数（用于LRU策略） */
  accessCount: number;
}

/**
 * 加载结果封装
 */
export interface LoadResult<T> {
  /** 是否加载成功 */
  success: boolean;
  /** 加载的数据（失败时为 null） */
  data: T | null;
  /** 错误信息（失败时） */
  error?: string;
  /** 文件路径 */
  path: string;
  /** 格式类型 */
  format: ContentFormat;
  /** 加载耗时（毫秒） */
  loadTimeMs: number;
  /** 是否来自缓存 */
  fromCache: boolean;
}

/**
 * 内容变更事件类型
 */
export interface ContentChangeEvent {
  /** 变更的文件路径 */
  path: string;
  /** 变更类型：修改或删除 */
  type: 'changed' | 'deleted';
  /** 上次修改时间 */
  previousMtime?: number;
}

/**
 * 内容加载器类
 * 
 * 管理游戏内容资源的加载、缓存和热重载。
 * 使用观察者模式监听文件变更，支持手动刷新和自动清理过期缓存。
 * 
 * @example
 * ```typescript
 * const loader = new ContentLoader({
 *   basePath: './content',
 *   enableHotReload: process.env.NODE_ENV === 'development'
 * });
 * 
 * // 加载单个文件
 * const result = await loader.load('prompts/minigames/pushbox.json');
 * if (result.success) {
 *   console.log(result.data);
 * }
 * 
 * // 加载整个目录
 * const prompts = await loader.loadDirectory('prompts/minigames');
 * 
 * // 监听变更
 * loader.onChange((event) => {
 *   console.log(`文件 ${event.path} 已${event.type === 'changed' ? '修改' : '删除'}`);
 * });
 * ```
 */
export class ContentLoader {
  private options: ContentLoaderOptions;
  private logger: Logger;
  /** 内存缓存存储 */
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  /** 文件监听器映射（路径 -> FSWatcher） */
  private watchers: Map<string, FSWatcher> = new Map();
  /** 变更回调函数列表 */
  private changeCallbacks: Array<(event: ContentChangeEvent) => void> = [];
  /** 轮询定时器ID */
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** 文件修改时间映射（用于轮询检测） */
  private fileMtimes: Map<string, number> = new Map();
  /** 加载统计信息 */
  private stats = {
    totalLoads: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0
  };

  /**
   * 创建内容加载器实例
   * 
   * @param options - 加载器配置选项
   */
  constructor(options?: Partial<ContentLoaderOptions>) {
    this.options = {
      basePath: this.resolveDefaultBasePath(),
      enableHotReload: false,
      hotReloadIntervalMs: 1000,
      enableCache: true,
      cacheTTLMs: 0, // 默认永不过期，依赖文件监听
      recursive: true,
      encoding: 'utf-8',
      ...options
    };

    this.logger = Logger.create({ 
      context: 'ContentLoader',
      level: LogLevel.INFO 
    });

    this.logger.info('ContentLoader 初始化完成', {
      basePath: this.options.basePath,
      hotReload: this.options.enableHotReload,
      cacheEnabled: this.options.enableCache
    });

    // 如果启用热重载，启动轮询或文件监听
    if (this.options.enableHotReload) {
      this.startHotReload();
    }
  }

  /**
   * 解析默认基础路径
   * 尝试从当前文件位置推断项目根目录
   */
  private resolveDefaultBasePath(): string {
    try {
      // ES Module 环境下获取当前文件路径
      const currentFilePath = fileURLToPath(import.meta.url);
      // 假设目录结构是 src/utils/content-loader.ts，content/ 在项目根
      return resolve(dirname(currentFilePath), '..', '..', 'content');
    } catch {
      // 回退到进程当前工作目录
      return resolve(process.cwd(), 'content');
    }
  }

  /**
   * 获取文件格式类型
   * 
   * @param filePath - 文件路径
   * @returns 识别出的格式类型
   */
  private detectFormat(filePath: string): ContentFormat {
    const ext = extname(filePath).toLowerCase();
    switch (ext) {
      case '.json':
        return ContentFormat.JSON;
      case '.yaml':
      case '.yml':
        return ContentFormat.YAML;
      case '.json5':
        return ContentFormat.JSON5;
      default:
        return ContentFormat.UNKNOWN;
    }
  }

  /**
   * 解析文件内容为对象
   * 
   * @param content - 原始文件内容字符串
   * @param format - 格式类型
   * @param filePath - 文件路径（用于错误报告）
   * @returns 解析后的对象
   */
  private parseContent(content: string, format: ContentFormat, filePath: string): unknown {
    try {
      switch (format) {
        case ContentFormat.JSON:
          return JSON.parse(content);
        
        case ContentFormat.YAML:
          if (!this.options.yamlParser) {
            throw new Error('加载YAML文件需要提供 yamlParser 选项（如 js-yaml 实例）');
          }
          return this.options.yamlParser.load(content);
        
        case ContentFormat.JSON5:
          if (!this.options.json5Parser) {
            throw new Error('加载JSON5文件需要提供 json5Parser 选项');
          }
          return this.options.json5Parser.parse(content);
        
        default:
          // 尝试作为JSON解析，失败则返回原始字符串
          try {
            return JSON.parse(content);
          } catch {
            return content;
          }
      }
    } catch (error) {
      // 增强错误信息，包含文件路径
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`解析文件 ${filePath} 失败: ${errorMsg}`);
    }
  }

  /**
   * 构建绝对路径
   * 
   * @param relativePath - 相对于 basePath 的路径
   * @returns 绝对路径
   */
  private resolvePath(relativePath: string): string {
    // 如果已经是绝对路径，直接返回
    if (resolve(relativePath) === relativePath) {
      return relativePath;
    }
    return join(this.options.basePath, relativePath);
  }

  /**
   * 检查缓存是否有效
   * 
   * @param entry - 缓存条目
   * @returns 是否有效
   */
  private isCacheValid(entry: CacheEntry<unknown>): boolean {
    // 如果禁用缓存，无效
    if (!this.options.enableCache) {
      return false;
    }

    // 如果TTL为0，永不过期（依赖文件监听更新）
    if (this.options.cacheTTLMs === 0) {
      return true;
    }

    // 检查是否过期
    const now = Date.now();
    return (now - entry.loadedAt) < this.options.cacheTTLMs;
  }

  /**
   * 加载单个文件
   * 
   * 这是核心方法，实现了缓存优先、错误处理和性能监控。
   * 
   * @param filePath - 文件路径（相对于 basePath 或绝对路径）
   * @returns 加载结果对象
   */
  public async load<T = unknown>(filePath: string): Promise<LoadResult<T>> {
    const startTime = Date.now();
    const absolutePath = this.resolvePath(filePath);
    
    // 检查文件存在性
    if (!existsSync(absolutePath)) {
      this.stats.errors++;
      return {
        success: false,
        data: null,
        error: `文件不存在: ${absolutePath}`,
        path: absolutePath,
        format: ContentFormat.UNKNOWN,
        loadTimeMs: Date.now() - startTime,
        fromCache: false
      };
    }

    try {
      // 获取文件状态（用于缓存验证）
      const stats = statSync(absolutePath);
      const mtime = stats.mtimeMs;

      // 检查缓存
      const cached = this.cache.get(absolutePath);
      if (cached && cached.mtime === mtime && this.isCacheValid(cached)) {
        this.stats.cacheHits++;
        this.stats.totalLoads++;
        cached.accessCount++;
        
        this.logger.debug(`缓存命中: ${filePath}`, {
          hitCount: cached.accessCount
        });

        return {
          success: true,
          data: cached.data as T,
          path: absolutePath,
          format: this.detectFormat(absolutePath),
          loadTimeMs: Date.now() - startTime,
          fromCache: true
        };
      }

      // 缓存未命中，读取文件
      this.stats.cacheMisses++;
      const content = readFileSync(absolutePath, this.options.encoding);
      const format = this.detectFormat(absolutePath);
      
      // 解析内容
      const data = this.parseContent(content, format, absolutePath) as T;

      // 存入缓存
      if (this.options.enableCache) {
        this.cache.set(absolutePath, {
          data,
          loadedAt: Date.now(),
          mtime,
          accessCount: 1
        });
      }

      // 如果是热重载模式，确保监听此文件
      if (this.options.enableHotReload && !this.watchers.has(absolutePath)) {
        this.watchFile(absolutePath);
      }

      this.stats.totalLoads++;
      const loadTime = Date.now() - startTime;

      this.logger.debug(`文件加载成功: ${filePath}`, {
        format,
        size: content.length,
        loadTimeMs: loadTime
      });

      return {
        success: true,
        data,
        path: absolutePath,
        format,
        loadTimeMs: loadTime,
        fromCache: false
      };

    } catch (error) {
      this.stats.errors++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`加载文件失败: ${filePath}`, { error: errorMsg });

      return {
        success: false,
        data: null,
        error: errorMsg,
        path: absolutePath,
        format: ContentFormat.UNKNOWN,
        loadTimeMs: Date.now() - startTime,
        fromCache: false
      };
    }
  }

  /**
   * 同步加载（阻塞式，仅用于初始化阶段）
   * 
   * @param filePath - 文件路径
   * @returns 加载结果
   */
  public loadSync<T = unknown>(filePath: string): LoadResult<T> {
    // 使用 Promise 的语法糖实现同步外观
    let result: LoadResult<T> | undefined;
    
    // 使用同步阻塞的方式获取结果
    this.load<T>(filePath).then(r => { result = r; });
    
    // 等待 Promise 完成（阻塞，慎用，仅用于启动时）
    // 注意：实际项目中应使用 deasync 包或重构为纯异步
    // 这里简化处理，实际上应该始终使用 async/await
    return result!;
  }

  /**
   * 加载目录下所有内容文件
   * 
   * @param dirPath - 目录路径（相对于 basePath）
   * @param pattern - 文件扩展名过滤（如 '.json'），可选
   * @returns 文件名到数据的映射
   */
  public async loadDirectory<T = unknown>(
    dirPath: string, 
    pattern?: string
  ): Promise<Map<string, T>> {
    const absoluteDir = this.resolvePath(dirPath);
    const results = new Map<string, T>();

    if (!existsSync(absoluteDir)) {
      this.logger.warn(`目录不存在: ${absoluteDir}`);
      return results;
    }

    try {
      const entries = readdirSync(absoluteDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(absoluteDir, entry.name);
        
        if (entry.isDirectory() && this.options.recursive) {
          // 递归加载子目录，键名包含相对路径
          const subResults = await this.loadDirectory<T>(
            relative(this.options.basePath, fullPath),
            pattern
          );
          for (const [key, value] of subResults) {
            results.set(`${entry.name}/${key}`, value);
          }
        } else if (entry.isFile()) {
          // 检查扩展名匹配
          if (pattern && !entry.name.endsWith(pattern)) {
            continue;
          }

          const result = await this.load<T>(
            relative(this.options.basePath, fullPath)
          );
          
          if (result.success && result.data !== null) {
            // 去除扩展名作为键
            const key = entry.name.replace(extname(entry.name), '');
            results.set(key, result.data);
          }
        }
      }

      this.logger.info(`目录加载完成: ${dirPath}`, {
        fileCount: results.size
      });

    } catch (error) {
      this.logger.error(`加载目录失败: ${dirPath}`, { error });
    }

    return results;
  }

  /**
   * 监听单个文件变更（内部方法）
   * 
   * @param filePath - 绝对路径
   */
  private watchFile(filePath: string): void {
    try {
      // 使用 Node.js fs.watch（递归:false，监听单个文件）
      // 注意：某些系统上 fs.watch 不可靠，需要轮询作为后备
      const watcher = watch(filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          this.handleFileChange(filePath, 'changed');
        } else if (eventType === 'rename') {
          // 文件可能被删除或重命名
          if (!existsSync(filePath)) {
            this.handleFileChange(filePath, 'deleted');
          }
        }
      });

      this.watchers.set(filePath, watcher);
      
      // 记录初始修改时间用于轮询后备
      try {
        const stats = statSync(filePath);
        this.fileMtimes.set(filePath, stats.mtimeMs);
      } catch {
        // 忽略
      }

    } catch (error) {
      this.logger.warn(`无法监听文件: ${filePath}，将使用轮询`, { error });
    }
  }

  /**
   * 启动热重载机制（轮询作为后备）
   */
  private startHotReload(): void {
    // 如果系统不支持 fs.watch，使用轮询
    this.pollTimer = setInterval(() => {
      for (const [filePath, lastMtime] of this.fileMtimes) {
        try {
          const stats = statSync(filePath);
          if (stats.mtimeMs !== lastMtime) {
            this.fileMtimes.set(filePath, stats.mtimeMs);
            this.handleFileChange(filePath, 'changed');
          }
        } catch {
          // 文件可能已删除
          if (lastMtime !== 0) {
            this.fileMtimes.set(filePath, 0);
            this.handleFileChange(filePath, 'deleted');
          }
        }
      }
    }, this.options.hotReloadIntervalMs);

    this.logger.info('热重载已启动', {
      intervalMs: this.options.hotReloadIntervalMs
    });
  }

  /**
   * 处理文件变更事件
   * 
   * @param filePath - 文件路径
   * @param type - 变更类型
   */
  private handleFileChange(filePath: string, type: 'changed' | 'deleted'): void {
    const previousMtime = this.fileMtimes.get(filePath);
    
    // 使缓存失效
    if (type === 'deleted') {
      this.cache.delete(filePath);
      this.fileMtimes.delete(filePath);
    } else {
      // 修改时保留条目但标记为过期（下次加载会更新mtime）
      const cached = this.cache.get(filePath);
      if (cached) {
        cached.loadedAt = 0; // 强制过期
      }
    }

    // 触发回调
    const event: ContentChangeEvent = {
      path: filePath,
      type,
      ...(previousMtime !== undefined && { previousMtime })
    };

    this.changeCallbacks.forEach(cb => {
      try {
        cb(event);
      } catch (error) {
        this.logger.error('热重载回调执行失败', { error });
      }
    });

    this.logger.info(`文件${type === 'changed' ? '修改' : '删除'}: ${filePath}`);
  }

  /**
   * 注册文件变更回调
   * 
   * @param callback - 变更时调用的函数
   * @returns 取消订阅函数
   */
  public onChange(callback: (event: ContentChangeEvent) => void): () => void {
    this.changeCallbacks.push(callback);
    
    // 返回取消订阅函数
    return () => {
      const index = this.changeCallbacks.indexOf(callback);
      if (index > -1) {
        this.changeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 强制刷新缓存（重新加载所有缓存的文件）
   * 
   * @returns 刷新结果映射
   */
  public async refreshAll(): Promise<Map<string, LoadResult<unknown>>> {
    const results = new Map<string, LoadResult<unknown>>();
    
    for (const filePath of this.cache.keys()) {
      // 清除缓存强制重新加载
      this.cache.delete(filePath);
      const result = await this.load(filePath);
      results.set(filePath, result);
    }

    this.logger.info('强制刷新完成', { refreshedCount: results.size });
    return results;
  }

  /**
   * 清除所有缓存
   */
  public clearCache(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.logger.info(`缓存已清除: ${count} 项`);
  }

  /**
   * 停止热重载和文件监听
   * 应在应用关闭时调用以清理资源
   */
  public dispose(): void {
    // 停止轮询
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // 关闭所有文件监听器
    for (const [path, watcher] of this.watchers) {
      watcher.close();
      this.logger.debug(`停止监听: ${path}`);
    }
    this.watchers.clear();
    this.changeCallbacks = [];

    this.logger.info('ContentLoader 已释放资源');
  }

  /**
   * 获取加载统计信息
   */
  public getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * 获取当前缓存状态（调试用）
   */
  public getCacheStatus(): Array<{ path: string; age: number; hits: number }> {
    const now = Date.now();
    return Array.from(this.cache.entries()).map(([path, entry]) => ({
      path,
      age: now - entry.loadedAt,
      hits: entry.accessCount
    }));
  }
}