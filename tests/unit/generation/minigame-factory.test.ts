// tests/unit/generation/minigame-factory.test.ts
/**
 * @fileoverview 小游戏生成器工厂单元测试
 * @description 测试 MiniGameGeneratorFactory 的注册、获取和筛选功能
 * @module tests/unit/generation/minigame-factory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MiniGameGeneratorFactory,
  GeneratorFactoryError,
  RegisterMiniGame
} from '../../../src/generation/minigame/factory.js';
import {
  MiniGameType,
  MiniGameContext,
  MiniGameZone,
  MiniGameConfig,
  ValidationResult
} from '../../../src/generation/minigame/types.js';
import { BaseMiniGameGenerator } from '../../../src/generation/minigame/base-generator.js';

// 测试用的 Mock 生成器
class MockGameConfig implements MiniGameConfig {
  version = '1.0';
  type = MiniGameType.PUSHBOX;
  winCondition = 'Test condition';
}

class MockGenerator extends BaseMiniGameGenerator<MockGameConfig> {
  readonly type = MiniGameType.PUSHBOX;
  readonly name = 'Mock Pushbox';
  readonly supportedDifficultyRange: [number, number] = [0.1, 0.9];
  readonly minSize = { width: 5, height: 5 };

  buildPrompt(context: MiniGameContext): string {
    return `Mock prompt for difficulty ${context.targetDifficulty}`;
  }

  parseResponse(_response: string, zoneId: string): MiniGameZone {
    return {
      id: zoneId,
      type: this.type,
      position: { x: 0, y: 0 },
      size: { width: 5, height: 5 },
      initialConfig: this.createDefaultConfig(),
      difficulty: 0.5,
      estimatedTime: 60,
      allowHints: true
    };
  }

  validate(): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: []
    };
  }

  generateFallback(context: MiniGameContext): MiniGameZone {
    return {
      id: context.zoneId,
      type: this.type,
      position: context.position,
      size: { width: 5, height: 5 },
      initialConfig: this.createDefaultConfig(),
      difficulty: context.targetDifficulty,
      estimatedTime: 60,
      allowHints: true
    };
  }

  private createDefaultConfig(): MockGameConfig {
    return new MockGameConfig();
  }
}

class LaserGenerator extends BaseMiniGameGenerator<MockGameConfig> {
  readonly type = MiniGameType.LASER_MIRROR;
  readonly name = 'Mock Laser';
  readonly supportedDifficultyRange: [number, number] = [0.2, 1.0];
  readonly minSize = { width: 6, height: 6 };

  buildPrompt(): string {
    return 'Laser prompt';
  }

  parseResponse(_response: string, zoneId: string): MiniGameZone {
    return {
      id: zoneId,
      type: this.type,
      position: { x: 0, y: 0 },
      size: { width: 6, height: 6 },
      initialConfig: new MockGameConfig(),
      difficulty: 0.6,
      estimatedTime: 90,
      allowHints: true
    };
  }

  validate(): ValidationResult {
    return { valid: true, errors: [], warnings: [] };
  }

  generateFallback(context: MiniGameContext): MiniGameZone {
    return {
      id: context.zoneId,
      type: this.type,
      position: context.position,
      size: { width: 6, height: 6 },
      initialConfig: new MockGameConfig(),
      difficulty: context.targetDifficulty,
      estimatedTime: 90,
      allowHints: true
    };
  }
}

// 用于 override 测试的子类
class OverriddenMockGenerator extends BaseMiniGameGenerator<MockGameConfig> {
  readonly type = MiniGameType.PUSHBOX;
  readonly name = 'Overridden Mock';
  readonly supportedDifficultyRange: [number, number] = [0.1, 0.9];
  readonly minSize = { width: 5, height: 5 };

  buildPrompt(context: MiniGameContext): string {
    return `Overridden prompt for ${context.targetDifficulty}`;
  }

  parseResponse(_response: string, zoneId: string): MiniGameZone {
    return {
      id: zoneId,
      type: this.type,
      position: { x: 0, y: 0 },
      size: { width: 5, height: 5 },
      initialConfig: new MockGameConfig(),
      difficulty: 0.5,
      estimatedTime: 60,
      allowHints: true
    };
  }

  validate(): ValidationResult {
    return { valid: true, errors: [], warnings: [] };
  }

  generateFallback(context: MiniGameContext): MiniGameZone {
    return {
      id: context.zoneId,
      type: this.type,
      position: context.position,
      size: { width: 5, height: 5 },
      initialConfig: new MockGameConfig(),
      difficulty: context.targetDifficulty,
      estimatedTime: 60,
      allowHints: true
    };
  }
}

describe('MiniGameGeneratorFactory', () => {
  beforeEach(() => {
    // 清理注册表
    MiniGameGeneratorFactory.clear();
  });

  describe('register', () => {
    it('应该成功注册生成器', () => {
      const generator = new MockGenerator();

      MiniGameGeneratorFactory.register(generator);

      expect(MiniGameGeneratorFactory.hasGenerator(MiniGameType.PUSHBOX)).toBe(true);
    });

    it('重复注册应该抛出错误', () => {
      const generator = new MockGenerator();
      MiniGameGeneratorFactory.register(generator);

      expect(() => {
        MiniGameGeneratorFactory.register(generator);
      }).toThrow(GeneratorFactoryError);
    });
  });

  describe('override', () => {
    it('应该覆盖已存在的生成器', () => {
      const generator1 = new MockGenerator();
      const generator2 = new OverriddenMockGenerator();

      MiniGameGeneratorFactory.register(generator1);
      MiniGameGeneratorFactory.override(generator2);

      const retrieved = MiniGameGeneratorFactory.getGenerator(MiniGameType.PUSHBOX);
      expect(retrieved.name).toBe('Overridden Mock');
    });
  });

  describe('getGenerator', () => {
    it('应该返回已注册的生成器', () => {
      const generator = new MockGenerator();
      MiniGameGeneratorFactory.register(generator);

      const retrieved = MiniGameGeneratorFactory.getGenerator(MiniGameType.PUSHBOX);

      expect(retrieved).toBeDefined();
      expect(retrieved.type).toBe(MiniGameType.PUSHBOX);
      expect(retrieved.name).toBe('Mock Pushbox');
    });

    it('未注册的生成器应该抛出错误', () => {
      expect(() => {
        MiniGameGeneratorFactory.getGenerator(MiniGameType.RIDDLE);
      }).toThrow(GeneratorFactoryError);
    });
  });

  describe('hasGenerator', () => {
    it('已注册的类型应该返回 true', () => {
      MiniGameGeneratorFactory.register(new MockGenerator());

      expect(MiniGameGeneratorFactory.hasGenerator(MiniGameType.PUSHBOX)).toBe(true);
    });

    it('未注册的类型应该返回 false', () => {
      expect(MiniGameGeneratorFactory.hasGenerator(MiniGameType.CIRCUIT_CONNECTION)).toBe(false);
    });
  });

  describe('getAvailableTypes', () => {
    it('应该返回所有已注册的类型', () => {
      MiniGameGeneratorFactory.register(new MockGenerator());
      MiniGameGeneratorFactory.register(new LaserGenerator());

      const types = MiniGameGeneratorFactory.getAvailableTypes();

      expect(types).toContain(MiniGameType.PUSHBOX);
      expect(types).toContain(MiniGameType.LASER_MIRROR);
      expect(types).toHaveLength(2);
    });

    it('空注册表应该返回空数组', () => {
      const types = MiniGameGeneratorFactory.getAvailableTypes();

      expect(types).toEqual([]);
    });
  });

  describe('getGeneratorInfos', () => {
    it('应该返回所有生成器的信息', () => {
      MiniGameGeneratorFactory.register(new MockGenerator());
      MiniGameGeneratorFactory.register(new LaserGenerator());

      const infos = MiniGameGeneratorFactory.getGeneratorInfos();

      expect(infos).toHaveLength(2);
      expect(infos[0]).toHaveProperty('type');
      expect(infos[0]).toHaveProperty('name');
      expect(infos[0]).toHaveProperty('supportedDifficulty');
    });
  });

  describe('getSuitableTypes', () => {
    beforeEach(() => {
      MiniGameGeneratorFactory.register(new MockGenerator());
      MiniGameGeneratorFactory.register(new LaserGenerator());
    });

    it('应该返回支持指定难度的类型', () => {
      const types = MiniGameGeneratorFactory.getSuitableTypes(0.5);

      expect(types).toContain(MiniGameType.PUSHBOX);
      expect(types).toContain(MiniGameType.LASER_MIRROR);
    });

    it('应该过滤掉不支持指定难度的类型', () => {
      const types = MiniGameGeneratorFactory.getSuitableTypes(0.05); // 低于 pushbox 的最小难度

      expect(types).not.toContain(MiniGameType.PUSHBOX);
    });

    it('高难度应该只返回 laser', () => {
      const types = MiniGameGeneratorFactory.getSuitableTypes(0.95);

      expect(types).toContain(MiniGameType.LASER_MIRROR);
      expect(types).not.toContain(MiniGameType.PUSHBOX);
    });
  });

  describe('createRandomZone', () => {
    it('应该创建随机游戏区域', async () => {
      MiniGameGeneratorFactory.register(new MockGenerator());

      const zone = await MiniGameGeneratorFactory.createRandomZone(0.5);

      expect(zone).toBeDefined();
      expect(zone.type).toBe(MiniGameType.PUSHBOX);
      expect(zone.difficulty).toBe(0.5);
    });

    it('没有可用生成器时应该抛出错误', async () => {
      await expect(
        MiniGameGeneratorFactory.createRandomZone(0.5)
      ).rejects.toThrow(GeneratorFactoryError);
    });
  });

  describe('unregister', () => {
    it('应该成功卸载生成器', () => {
      MiniGameGeneratorFactory.register(new MockGenerator());

      const result = MiniGameGeneratorFactory.unregister(MiniGameType.PUSHBOX);

      expect(result).toBe(true);
      expect(MiniGameGeneratorFactory.hasGenerator(MiniGameType.PUSHBOX)).toBe(false);
    });

    it('卸载不存在的生成器应该返回 false', () => {
      const result = MiniGameGeneratorFactory.unregister(MiniGameType.RIDDLE);

      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('应该清空所有生成器', () => {
      MiniGameGeneratorFactory.register(new MockGenerator());
      MiniGameGeneratorFactory.register(new LaserGenerator());

      MiniGameGeneratorFactory.clear();

      expect(MiniGameGeneratorFactory.getAvailableTypes()).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      MiniGameGeneratorFactory.register(new MockGenerator());
      MiniGameGeneratorFactory.register(new LaserGenerator());

      const stats = MiniGameGeneratorFactory.getStats();

      expect(stats.totalRegistered).toBe(2);
      expect(stats.types).toContain(MiniGameType.PUSHBOX);
      expect(stats.types).toContain(MiniGameType.LASER_MIRROR);
    });
  });
});

describe('RegisterMiniGame Decorator', () => {
  beforeEach(() => {
    MiniGameGeneratorFactory.clear();
  });

  it('装饰器应该自动注册生成器', () => {
    @RegisterMiniGame()
    class DecoratedGenerator extends BaseMiniGameGenerator<MockGameConfig> {
      readonly type = MiniGameType.RIDDLE;
      readonly name = 'Decorated Riddle';
      readonly supportedDifficultyRange: [number, number] = [0.1, 0.9];
      readonly minSize = { width: 5, height: 5 };

      buildPrompt(): string {
        return 'Decorated prompt';
      }

      parseResponse(_response: string, zoneId: string): MiniGameZone {
        return {
          id: zoneId,
          type: this.type,
          position: { x: 0, y: 0 },
          size: { width: 5, height: 5 },
          initialConfig: new MockGameConfig(),
          difficulty: 0.5,
          estimatedTime: 60,
          allowHints: true
        };
      }

      validate(): ValidationResult {
        return { valid: true, errors: [], warnings: [] };
      }

      generateFallback(context: MiniGameContext): MiniGameZone {
        return {
          id: context.zoneId,
          type: this.type,
          position: context.position,
          size: { width: 5, height: 5 },
          initialConfig: new MockGameConfig(),
          difficulty: context.targetDifficulty,
          estimatedTime: 60,
          allowHints: true
        };
      }
    }

    // 实例化触发注册
    new DecoratedGenerator();

    expect(MiniGameGeneratorFactory.hasGenerator(MiniGameType.RIDDLE)).toBe(true);
  });
});
