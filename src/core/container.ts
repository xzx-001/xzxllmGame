// src/core/container.ts
/**
 * @fileoverview 依赖注入容器（DI Container）
 * @description 管理框架内所有服务的生命周期和依赖关系
 * @implements 服务定位器模式（Service Locator）+ 工厂模式
 * 
 * @example
 * // 注册服务
 * Container.register('llm', () => new OpenAIProvider(config));
 * 
 * // 获取服务
 * const llm = Container.get<ILLMProvider>('llm');
 * 
 * // 自动注入依赖
 * Container.register('generator', (c) => new PuzzleGenerator(c.get('llm')));
 */

import { EventEmitter } from 'events';
import { ILLMProvider } from '../llm/types.js';
import { StorageAdapter } from '../memory/storage/base-storage.js';

/**
 * 服务工厂函数类型
 * @template T 服务类型
 * @param container 容器实例（用于解析依赖）
 */
type ServiceFactory<T> = (container: Container) => T;

/**
 * 服务定义
 * 包含工厂和生命周期配置
 */
interface ServiceDefinition<T = any> {
  /** 工厂函数 */
  factory: ServiceFactory<T>;
  /** 是否为单例 */
  singleton: boolean;
  /** 实例缓存（单例模式下使用） */
  instance?: T;
  /** 依赖的服务键列表（用于循环依赖检测） */
  dependencies: string[];
}

/**
 * 依赖注入容器
 * 框架的核心基础设施，管理所有组件的创建和依赖解析
 * 
 * 设计原则：
 * 1. 延迟初始化 - 服务首次使用时才创建
 * 2. 单例管理 - 默认单例，确保状态一致性
 * 3. 循环依赖检测 - 初始化时检测并抛出错误
 * 4. 类型安全 - 支持泛型获取，编译时类型检查
 */
export class Container {
  /** 服务注册表 */
  private services = new Map<string, ServiceDefinition>();
  
  /** 解析中的服务（用于循环依赖检测） */
  private resolving = new Set<string>();
  
  /** 全局事件总线（用于服务间解耦通信） */
  public readonly eventBus: EventEmitter;
  
  /** 容器是否已冻结（防止运行时修改） */
  private frozen = false;

  constructor() {
    this.eventBus = new EventEmitter();
    // 设置最大监听器数量，避免内存泄漏警告
    this.eventBus.setMaxListeners(50);
  }

  /**
   * 注册服务
   * @param key 服务唯一标识符
   * @param factory 工厂函数
   * @param options 配置选项
   * 
   * @throws 如果容器已冻结则抛出错误
   * 
   * @example
   * // 注册单例服务
   * container.register('storage', () => new SQLiteAdapter(), { singleton: true });
   * 
   * // 注册多例服务（每次获取新实例）
   * container.register('logger', () => new Logger(), { singleton: false });
   */
  register<T>(
    key: string, 
    factory: ServiceFactory<T>, 
    options: { singleton?: boolean; dependencies?: string[] } = {}
  ): this {
    if (this.frozen) {
      throw new Error(`Cannot register service "${key}": Container is frozen`);
    }

    if (this.services.has(key)) {
      console.warn(`Service "${key}" is being overwritten`);
    }

    this.services.set(key, {
      factory,
      singleton: options.singleton !== false, // 默认为 true
      dependencies: options.dependencies || []
    });

    return this; // 支持链式调用
  }

  /**
   * 获取服务实例
   * @template T 服务类型
   * @param key 服务标识符
   * @returns 服务实例
   * 
   * @throws 服务未找到时抛出错误
   * @throws 检测到循环依赖时抛出错误
   * 
   * @example
   * const storage = container.get<StorageAdapter>('storage');
   */
  get<T>(key: string): T {
    const definition = this.services.get(key);
    
    if (!definition) {
      throw new Error(`Service "${key}" not found. Did you forget to register it?`);
    }

    // 循环依赖检测
    if (this.resolving.has(key)) {
      throw new Error(
        `Circular dependency detected: ${Array.from(this.resolving).join(' -> ')} -> ${key}`
      );
    }

    // 单例模式：返回缓存实例
    if (definition.singleton && definition.instance !== undefined) {
      return definition.instance as T;
    }

    // 创建新实例
    try {
      this.resolving.add(key);
      
      // 检查依赖是否已注册
      if (definition.dependencies.length > 0) {
        for (const dep of definition.dependencies) {
          if (!this.services.has(dep)) {
            throw new Error(
              `Service "${key}" depends on "${dep}" which is not registered`
            );
          }
        }
      }

      const instance = definition.factory(this);
      
      if (definition.singleton) {
        definition.instance = instance;
      }

      return instance as T;
    } finally {
      this.resolving.delete(key);
    }
  }

  /**
   * 检查服务是否已注册
   * @param key 服务标识符
   */
  has(key: string): boolean {
    return this.services.has(key);
  }

  /**
   * 移除服务注册
   * @param key 服务标识符
   * 
   * @throws 如果容器已冻结则抛出错误
   */
  remove(key: string): this {
    if (this.frozen) {
      throw new Error(`Cannot remove service "${key}": Container is frozen`);
    }
    
    this.services.delete(key);
    return this;
  }

  /**
   * 创建子容器
   * 子容器继承父容器服务，但可覆盖注册
   * 用于隔离不同会话或测试环境
   */
  createChild(): Container {
    const child = new Container();
    
    // 复制父容器注册表（但不复制实例）
    for (const [key, def] of this.services) {
      child.services.set(key, {
        factory: def.factory,
        singleton: def.singleton,
        dependencies: def.dependencies || []
        // 不复制 instance，让子容器自己创建
      });
    }
    
    return child;
  }

  /**
   * 冻结容器
   * 防止运行时意外修改服务注册（生产环境建议启用）
   */
  freeze(): this {
    this.frozen = true;
    return this;
  }

  /**
   * 释放所有服务资源
   * 调用所有服务的 dispose 方法（如果存在）
   */
  async dispose(): Promise<void> {
    const disposePromises: Promise<void>[] = [];
    
    for (const [key, def] of this.services) {
      if (def.instance && typeof (def.instance as any).dispose === 'function') {
        disposePromises.push(
          Promise.resolve((def.instance as any).dispose()).catch(err => {
            console.error(`Error disposing service "${key}":`, err);
          })
        );
      }
    }
    
    await Promise.all(disposePromises);
    this.services.clear();
    this.eventBus.removeAllListeners();
  }

  /**
   * 获取所有已注册服务名称（调试使用）
   */
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * 重置容器（测试使用）
   */
  reset(): void {
    if (this.frozen) {
      throw new Error('Cannot reset frozen container');
    }
    this.services.clear();
    this.resolving.clear();
  }
}

/**
 * 全局容器实例
 * 应用主容器，通常在应用启动时配置
 * 
 * 注意：测试时应使用 Container.createChild() 创建独立容器，避免状态污染
 */
export const container = new Container();