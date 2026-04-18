/**
 * @fileoverview 小游戏生成器工厂 (MiniGameGeneratorFactory)
 * @description 注册表模式实现，管理所有小游戏生成器的生命周期。
 * 支持运行时动态注册新的生成器类型。
 * 
 * @module generation/minigame/factory
 */

import { 
  IMiniGameGenerator, 
  MiniGameType, 
  MiniGameGeneratorConstructor 
} from './types.js';

/**
 * 工厂错误类型
 */
export class GeneratorFactoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratorFactoryError';
  }
}

/**
 * 小游戏生成器工厂
 * 单例模式管理所有生成器实例
 * 
 * @example
 * ```typescript
 * // 注册生成器
 * MiniGameGeneratorFactory.register(new PushboxGenerator());
 * MiniGameGeneratorFactory.register(new LaserGenerator());
 * 
 * // 获取生成器
 * const generator = MiniGameGeneratorFactory.getGenerator(MiniGameType.PUSHBOX);
 * 
 * // 生成游戏
 * const zone = await generator.generate(context);
 * ```
 */
export class MiniGameGeneratorFactory {
  /** 生成器注册表 */
  private static registry = new Map<MiniGameType, IMiniGameGenerator>();
  
  /**
   * 注册生成器实例
   * @param generator 生成器实例
   * @throws GeneratorFactoryError 如果该类型已注册
   */
  static register(generator: IMiniGameGenerator): void {
    if (this.registry.has(generator.type)) {
      throw new GeneratorFactoryError(
        `Generator for type "${generator.type}" is already registered. ` +
        `Use override() to replace existing generator.`
      );
    }
    
    this.registry.set(generator.type, generator);
    console.log(`[MiniGameFactory] Registered generator: ${generator.name} (${generator.type})`);
  }

  /**
   * 强制覆盖已有生成器
   * @param generator 新的生成器实例
   */
  static override(generator: IMiniGameGenerator): void {
    this.registry.set(generator.type, generator);
    console.log(`[MiniGameFactory] Overridden generator: ${generator.name} (${generator.type})`);
  }

  /**
   * 获取生成器实例
   * @param type 小游戏类型
   * @returns 生成器实例
   * @throws GeneratorFactoryError 如果类型未注册
   */
  static getGenerator(type: MiniGameType): IMiniGameGenerator {
    const generator = this.registry.get(type);
    if (!generator) {
      throw new GeneratorFactoryError(
        `No generator registered for type "${type}". ` +
        `Available types: ${this.getAvailableTypes().join(', ')}`
      );
    }
    return generator;
  }

  /**
   * 检查类型是否已注册
   * @param type 小游戏类型
   */
  static hasGenerator(type: MiniGameType): boolean {
    return this.registry.has(type);
  }

  /**
   * 获取所有可用类型
   */
  static getAvailableTypes(): MiniGameType[] {
    return Array.from(this.registry.keys());
  }

  /**
   * 获取所有生成器信息
   */
  static getGeneratorInfos(): Array<{
    type: MiniGameType;
    name: string;
    supportedDifficulty: [number, number];
  }> {
    return Array.from(this.registry.entries()).map(([type, generator]) => ({
      type,
      name: generator.name,
      supportedDifficulty: generator.supportedDifficultyRange
    }));
  }

  /**
   * 根据难度筛选可用类型
   * @param difficulty 目标难度
   * @param playerSkills 玩家技能(可选，用于个性化推荐)
   */
  static getSuitableTypes(
    difficulty: number, 
  ): MiniGameType[] {
    const suitable: MiniGameType[] = [];
    
    for (const [type, generator] of this.registry.entries()) {
      const [min, max] = generator.supportedDifficultyRange;
      
      // 检查难度范围
      if (difficulty >= min && difficulty <= max) {
        suitable.push(type);
      }
    }
    
    return suitable;
  }

  /**
   * 创建随机游戏配置(用于测试或快速原型)
   * @param difficulty 目标难度
   * @param availableTypes 可选类型列表(默认全部)
   */
  static async createRandomZone(
    difficulty: number,
    availableTypes?: MiniGameType[]
  ): Promise<ReturnType<IMiniGameGenerator['generateFallback']>> {
    const types = availableTypes || this.getAvailableTypes();
    if (types.length === 0) {
      throw new GeneratorFactoryError('No generators available');
    }
    
    // 随机选择类型
    const randomType = types[Math.floor(Math.random() * types.length)]!;
    const generator = this.getGenerator(randomType);
    
    // 创建虚拟上下文
    const mockContext = {
      targetDifficulty: difficulty,
      playerProfile: {} as any,
      availableSize: { width: 8, height: 8 },
      zoneId: `random_${Date.now()}`,
      position: { x: 0, y: 0 },
      theme: 'random',
      llmProvider: {} as any
    };
    
    return generator.generateFallback(mockContext);
  }

  /**
   * 卸载生成器
   * @param type 小游戏类型
   */
  static unregister(type: MiniGameType): boolean {
    const existed = this.registry.delete(type);
    if (existed) {
      console.log(`[MiniGameFactory] Unregistered generator: ${type}`);
    }
    return existed;
  }

  /**
   * 清空所有生成器
   */
  static clear(): void {
    this.registry.clear();
    console.log('[MiniGameFactory] Cleared all generators');
  }

  /**
   * 获取注册表统计
   */
  static getStats(): {
    totalRegistered: number;
    types: MiniGameType[];
  } {
    return {
      totalRegistered: this.registry.size,
      types: this.getAvailableTypes()
    };
  }
}

/**
 * 装饰器：自动注册生成器类
 * @example
 * ```typescript
 * @RegisterMiniGame()
 * class MyGenerator implements IMiniGameGenerator {
 *   // ...
 * }
 * ```
 */
export function RegisterMiniGame() {
  return function <T extends MiniGameGeneratorConstructor>(constructor: T) {
    const instance = new constructor();
    MiniGameGeneratorFactory.register(instance);
    return constructor;
  };
}