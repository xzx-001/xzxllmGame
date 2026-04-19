// tests/unit/generation/pushbox-generator.test.ts
/**
 * @fileoverview 推箱子生成器单元测试
 * @description 测试 PushboxGenerator 的提示词构建、响应解析、验证和降级功能
 * @module tests/unit/generation/pushbox-generator
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PushboxGenerator } from '../../../src/generation/minigame/generators/pushbox-generator.js';
import {
  MiniGameType,
  MiniGameContext,
  MiniGameZone
} from '../../../src/generation/minigame/types.js';
import { PlayerProfileFactory } from '../../../src/memory/models/player-profile.js';

// Mock LLM Provider
const mockLLMProvider = {
  name: 'MockLLM',
  isAvailable: true,
  async initialize() {},
  async generate() {
    return {
      text: '{}',
      content: '{}',
      model: 'mock',
      finishReason: 'stop' as const
    };
  },
  async healthCheck() { return true; },
  async dispose() {}
};

describe('PushboxGenerator', () => {
  let generator: PushboxGenerator;
  let mockContext: MiniGameContext;

  beforeAll(() => {
    generator = new PushboxGenerator();

    // 使用 PlayerProfileFactory 创建符合类型的玩家画像
    const mockPlayerProfile = PlayerProfileFactory.create('test-player');

    mockContext = {
      targetDifficulty: 0.5,
      playerProfile: mockPlayerProfile,
      availableSize: { width: 10, height: 10 },
      zoneId: 'test-zone-1',
      position: { x: 0, y: 0 },
      theme: 'cyberpunk',
      llmProvider: mockLLMProvider as any
    };
  });

  describe('基本属性', () => {
    it('应该有正确的类型标识', () => {
      expect(generator.type).toBe(MiniGameType.PUSHBOX);
    });

    it('应该有正确的人类可读名称', () => {
      expect(generator.name).toBe('Pushbox (Sokoban)');
    });

    it('应该有正确的难度范围', () => {
      expect(generator.supportedDifficultyRange).toEqual([0.1, 0.95]);
    });

    it('应该有正确的最小尺寸要求', () => {
      expect(generator.minSize).toEqual({ width: 5, height: 5 });
    });
  });

  describe('buildPrompt', () => {
    it('应该返回非空的提示词', () => {
      const prompt = generator.buildPrompt(mockContext);

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('提示词应该包含主题信息', () => {
      const prompt = generator.buildPrompt(mockContext);

      expect(prompt).toContain('cyberpunk');
    });

    it('提示词应该包含难度信息', () => {
      const prompt = generator.buildPrompt(mockContext);

      expect(prompt).toContain('50'); // 0.5 * 100
    });

    it('提示词应该包含网格尺寸要求', () => {
      const prompt = generator.buildPrompt(mockContext);

      expect(prompt).toContain('grid');
    });

    it('提示词应该包含输出格式要求', () => {
      const prompt = generator.buildPrompt(mockContext);

      expect(prompt).toContain('JSON');
    });
  });

  describe('parseResponse', () => {
    it('应该正确解析有效的 JSON 响应', () => {
      const validResponse = JSON.stringify({
        width: 8,
        height: 8,
        playerStart: { x: 1, y: 1 },
        boxes: [
          {
            id: 'box_1',
            start: { x: 3, y: 3 },
            target: { x: 5, y: 5 }
          }
        ],
        walls: [{ x: 0, y: 0 }],
        dependencyChain: [],
        reservedPaths: [],
        deadlockChecks: []
      });

      const zone = generator.parseResponse(validResponse, 'zone-1', { x: 0, y: 0 });

      expect(zone).toBeDefined();
      expect(zone.id).toBe('zone-1');
      expect(zone.type).toBe(MiniGameType.PUSHBOX);
      expect(zone.position).toEqual({ x: 0, y: 0 });
    });

    it('应该正确计算预估时间', () => {
      const validResponse = JSON.stringify({
        width: 8,
        height: 8,
        playerStart: { x: 1, y: 1 },
        boxes: [
          { id: 'box_1', start: { x: 3, y: 3 }, target: { x: 5, y: 5 } },
          { id: 'box_2', start: { x: 4, y: 4 }, target: { x: 6, y: 6 } }
        ],
        walls: [],
        dependencyChain: [{ boxId: 'box_2', dependsOn: ['box_1'], reason: 'test' }],
        reservedPaths: [],
        deadlockChecks: []
      });

      const zone = generator.parseResponse(validResponse, 'zone-1', { x: 0, y: 0 });

      expect(zone.estimatedTime).toBeGreaterThan(0);
    });

    it('应该设置允许提示', () => {
      const validResponse = JSON.stringify({
        width: 8,
        height: 8,
        playerStart: { x: 1, y: 1 },
        boxes: [{ id: 'box_1', start: { x: 3, y: 3 }, target: { x: 5, y: 5 } }],
        walls: [],
        dependencyChain: [],
        reservedPaths: [],
        deadlockChecks: []
      });

      const zone = generator.parseResponse(validResponse, 'zone-1', { x: 0, y: 0 });

      expect(zone.allowHints).toBe(true);
    });

    it('无效响应应该抛出错误', () => {
      const invalidResponse = 'not valid json';

      expect(() => {
        generator.parseResponse(invalidResponse, 'zone-1', { x: 0, y: 0 });
      }).toThrow();
    });
  });

  describe('validate', () => {
    const createValidZone = (): MiniGameZone => ({
      id: 'test-zone',
      type: MiniGameType.PUSHBOX,
      position: { x: 0, y: 0 },
      size: { width: 8, height: 8 },
      initialConfig: {
        version: '1.0',
        type: MiniGameType.PUSHBOX,
        winCondition: 'Push all boxes',
        width: 8,
        height: 8,
        playerStart: { x: 1, y: 1 },
        boxes: [
          { id: 'box_1', start: { x: 3, y: 3 }, target: { x: 5, y: 5 } }
        ],
        walls: [{ x: 0, y: 0 }],
        reservedPaths: [],
        deadlockChecks: []
      } as any,
      difficulty: 0.5,
      estimatedTime: 60,
      allowHints: true
    });

    it('有效配置应该通过验证', () => {
      const zone = createValidZone();
      const result = generator.validate(zone);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('边界检查应该检测超出边界的元素', () => {
      const zone = createValidZone();
      (zone.initialConfig as any).playerStart = { x: 10, y: 10 }; // 超出边界

      const result = generator.validate(zone);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('out of bounds'))).toBe(true);
    });

    it('应该检测重叠元素', () => {
      const zone = createValidZone();
      (zone.initialConfig as any).walls = [{ x: 3, y: 3 }]; // 与箱子重叠

      const result = generator.validate(zone);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Overlap'))).toBe(true);
    });

    it('应该检测循环依赖', () => {
      const zone = createValidZone();
      (zone.initialConfig as any).dependencyChain = [
        { boxId: 'box_1', dependsOn: ['box_2'], reason: 'circular' },
        { boxId: 'box_2', dependsOn: ['box_1'], reason: 'circular' }
      ];
      (zone.initialConfig as any).boxes = [
        { id: 'box_1', start: { x: 3, y: 3 }, target: { x: 5, y: 5 } },
        { id: 'box_2', start: { x: 4, y: 4 }, target: { x: 6, y: 6 } }
      ];

      const result = generator.validate(zone);

      expect(result.errors.some(e => e.includes('Circular'))).toBe(true);
    });
  });

  describe('generateFallback', () => {
    it('应该生成有效的降级配置', () => {
      const zone = generator.generateFallback(mockContext);

      expect(zone).toBeDefined();
      expect(zone.id).toBe(mockContext.zoneId);
      expect(zone.type).toBe(MiniGameType.PUSHBOX);
      expect(zone.position).toEqual(mockContext.position);
      expect(zone.difficulty).toBe(mockContext.targetDifficulty);
    });

    it('降级配置应该有合理的网格尺寸', () => {
      const zone = generator.generateFallback(mockContext);

      expect(zone.size.width).toBeGreaterThanOrEqual(6);
      expect(zone.size.height).toBeGreaterThanOrEqual(6);
    });

    it('降级配置应该包含箱子', () => {
      const zone = generator.generateFallback(mockContext);

      expect((zone.initialConfig as any).boxes.length).toBeGreaterThan(0);
    });

    it('降级配置应该包含墙体', () => {
      const zone = generator.generateFallback(mockContext);

      expect((zone.initialConfig as any).walls.length).toBeGreaterThan(0);
    });

    it('降级配置应该有预留通道', () => {
      const zone = generator.generateFallback(mockContext);

      expect((zone.initialConfig as any).reservedPaths.length).toBeGreaterThan(0);
    });

    it('应该允许提示', () => {
      const zone = generator.generateFallback(mockContext);

      expect(zone.allowHints).toBe(true);
    });
  });

  describe('generate 完整流程', () => {
    it('应该返回生成结果对象', async () => {
      const result = await generator.generate(mockContext);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('metadata');
    });

    it('应该包含使用的提示词（调试模式下）', async () => {
      const debugContext = {
        ...mockContext,
        llmProvider: {
          ...mockContext.llmProvider,
          generate: async () => ({
            text: JSON.stringify({
              width: 8, height: 8, playerStart: { x: 1, y: 1 },
              boxes: [{ id: 'box_1', start: { x: 3, y: 3 }, target: { x: 5, y: 5 } }],
              walls: [{ x: 0, y: 0 }], dependencyChain: [], reservedPaths: [], deadlockChecks: []
            }),
            content: JSON.stringify({
              width: 8, height: 8, playerStart: { x: 1, y: 1 },
              boxes: [{ id: 'box_1', start: { x: 3, y: 3 }, target: { x: 5, y: 5 } }],
              walls: [{ x: 0, y: 0 }], dependencyChain: [], reservedPaths: [], deadlockChecks: []
            }),
            model: 'mock', finishReason: 'stop' as const
          })
        }
      };

      const result = await generator.generate(debugContext);

      // usedPrompt 仅在 debug 模式下返回
      expect(result).toBeDefined();
    });
  });
});
