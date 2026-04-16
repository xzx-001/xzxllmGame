// src/core/event-bus.ts
/**
 * @fileoverview 事件总线（Event Bus）
 * @description 提供强类型的发布/订阅机制，用于组件间解耦通信
 * @implements 观察者模式（Observer Pattern）
 * 
 * 使用场景：
 * 1. 引擎状态变更通知（生成开始/完成）
 * 2. 玩家行为事件广播（用于 analytics）
 * 3. 服务间异步通信（避免循环依赖）
 * 
 * @example
 * // 订阅事件
 * eventBus.on(EngineEvent.LEVEL_GENERATED, (level) => {
 *   console.log('New level:', level.id);
 * });
 * 
 * // 发布事件
 * eventBus.emit(EngineEvent.LEVEL_GENERATED, { id: 'lvl_123', ... });
 */

import { EventEmitter } from 'events';
import { EngineEvent } from './interfaces/api.types.js';

/**
 * 事件处理器类型
 */
type EventHandler<T = any> = (payload: T) => void | Promise<void>;

/**
 * 强类型事件总线
 * 包装 Node.js EventEmitter 提供类型安全的事件管理
 * 
 * 特性：
 * - 类型安全：事件名称和负载类型关联
 * - 命名空间：支持按模块分组事件
 * - 一次性监听：支持 once 模式
 * - 错误隔离：处理器异常不影响其他监听者
 */
export class TypedEventBus {
  private emitter: EventEmitter;
  
  /** 事件统计（用于调试） */
  private stats = new Map<string, number>();

  constructor() {
    this.emitter = new EventEmitter();
    // 设置最大监听器数量，避免内存泄漏
    this.emitter.setMaxListeners(100);
  }

  /**
   * 订阅事件
   * @param event 事件名称（枚举或字符串）
   * @param handler 事件处理器
   * @returns 取消订阅函数（用于清理）
   * 
   * @example
   * const unsubscribe = eventBus.on(EngineEvent.LEVEL_GENERATED, handleNewLevel);
   * // 清理时
   * unsubscribe();
   */
  on<T>(event: EngineEvent | string, handler: EventHandler<T>): () => void {
    const wrappedHandler = async (payload: T) => {
      try {
        await handler(payload);
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
        // 不抛出，避免影响其他处理器
      }
    };

    this.emitter.on(event, wrappedHandler);
    this.incrementStat(event);

    // 返回取消订阅函数
    return () => {
      this.emitter.off(event, wrappedHandler);
      this.decrementStat(event);
    };
  }

  /**
   * 一次性订阅（触发后自动移除）
   * @param event 事件名称
   * @param handler 事件处理器
   * @returns Promise，在事件触发时 resolve
   */
  once<T>(event: EngineEvent | string, handler?: EventHandler<T>): Promise<T> {
    if (handler) {
      this.emitter.once(event, handler);
      return Promise.resolve(null as T); // 已有 handler 时不返回 Promise
    }

    // 返回 Promise 模式（async/await 友好）
    return new Promise((resolve) => {
      this.emitter.once(event, (payload: T) => resolve(payload));
    });
  }

  /**
   * 发布事件
   * @param event 事件名称
   * @param payload 事件数据
   * @returns 是否有监听器处理了事件
   */
  emit<T>(event: EngineEvent | string, payload: T): boolean {
    return this.emitter.emit(event, payload);
  }

  /**
   * 异步发布（等待所有处理器完成）
   * @param event 事件名称
   * @param payload 事件数据
   * @returns 处理器执行结果数组
   */
  async emitAsync<T>(event: EngineEvent | string, payload: T): Promise<any[]> {
    const listeners = this.emitter.listeners(event);
    const promises = listeners.map(listener => 
      Promise.resolve().then(() => listener(payload))
    );
    return Promise.all(promises);
  }

  /**
   * 移除特定事件的所有监听器
   * @param event 事件名称（不提供则移除所有）
   */
  off(event?: EngineEvent | string): void {
    if (event) {
      this.emitter.removeAllListeners(event);
      this.stats.delete(event);
    } else {
      this.emitter.removeAllListeners();
      this.stats.clear();
    }
  }

  /**
   * 获取事件监听器数量
   * @param event 事件名称
   */
  listenerCount(event: EngineEvent | string): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * 获取事件统计信息（调试）
   */
  getStats(): Record<string, number> {
    return Object.fromEntries(this.stats);
  }

  private incrementStat(event: string | EngineEvent): void {
    const key = String(event);
    this.stats.set(key, (this.stats.get(key) || 0) + 1);
  }

  private decrementStat(event: string | EngineEvent): void {
    const key = String(event);
    const count = (this.stats.get(key) || 0) - 1;
    if (count <= 0) {
      this.stats.delete(key);
    } else {
      this.stats.set(key, count);
    }
  }
}

/**
 * 全局事件总线实例
 * 
 * 注意：大型应用可能需要多个总线实例（按模块隔离），
 * 但单一总线配合命名空间（eventName: 'module/action'）通常足够
 */
export const eventBus = new TypedEventBus();