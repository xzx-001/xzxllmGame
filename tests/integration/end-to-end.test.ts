// tests/integration/end-to-end.test.ts
/**
 * @fileoverview 端到端集成测试
 * @description 测试完整的关卡生成流程，从引擎初始化到关卡输出
 * @module tests/integration/end-to-end
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { XZXLLMGameEngine } from '../../src/core/engine.js';
import { LLMConfig } from '../../src/llm/types.js';
import { MemoryStorageAdapter } from '../../src/memory/storage/memory-adapter.js';
import { ObservationType } from '../../src/core/interfaces/base.types.js';

// Mock LLM Provider 用于集成测试
const createMockLLMProvider = () => ({
  name: 'MockLLM',
  isAvailable: true,
  async initialize() {},
  async generate() {
    // 返回模拟的推箱子配置
    return {
      text: JSON.stringify({
        width: 8,
        height: 8,
        playerStart: { x: 1, y: 1 },
        boxes: [
          { id: 'box_1', start: { x: 3, y: 3 }, target: { x: 5, y: 5 } }
        ],
        walls: [
          { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
          { x: 0, y: 1 }, { x: 0, y: 2 }
        ],
        dependencyChain: [],
        reservedPaths: [],
        deadlockChecks: []
      }),
      content: JSON.stringify({
        width: 8,
        height: 8,
        playerStart: { x: 1, y: 1 },
        boxes: [
          { id: 'box_1', start: { x: 3, y: 3 }, target: { x: 5, y: 5 } }
        ],
        walls: [
          { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
          { x: 0, y: 1 }, { x: 0, y: 2 }
        ],
        dependencyChain: [],
        reservedPaths: [],
        deadlockChecks: []
      }),
      model: 'mock-model',
      finishReason: 'stop' as const,
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300
      }
    };
  },
  async healthCheck() { return true; },
  async dispose() {}
});

describe('端到端集成测试', () => {
  let engine: XZXLLMGameEngine;
  let storage: MemoryStorageAdapter;

  beforeAll(async () => {
    storage = new MemoryStorageAdapter();
    await storage.initialize();

    const llmConfig: LLMConfig = {
      provider: 'custom',
      model: 'mock-model',
      baseUrl: 'http://localhost:11434'
    };

    engine = new XZXLLMGameEngine({
      llm: llmConfig,
      storage: {
        type: 'memory'
      },
      generation: {
        enableNarrative: true,
        pregenerateCount: 0
      }
    });

    await engine.initialize();
  });

  afterAll(async () => {
    await engine.dispose();
    await storage.close();
  });

  describe('引擎初始化', () => {
    it('引擎应该成功初始化', () => {
      expect(engine).toBeDefined();
    });

    it('健康检查应该通过', async () => {
      const health = await engine.healthCheck();
      expect(health.status).toBe('healthy');
    });
  });

  describe('玩家画像管理', () => {
    const testPlayerId = 'e2e-test-player';

    it('应该能获取玩家画像', async () => {
      const profile = await engine.getPlayerStats(testPlayerId);
      expect(profile).toBeDefined();
      if (profile) {
        expect(profile.playerId).toBe(testPlayerId);
      }
    });

    it('新玩家应该有默认画像', async () => {
      const newPlayerId = 'new-e2e-player';
      const profile = await engine.getPlayerStats(newPlayerId);
      expect(profile).toBeNull(); // 第一次获取返回 null
    });
  });

  describe('关卡生成流程', () => {
    const testPlayerId = 'e2e-level-player';
    const testSessionId = 'e2e-session-1';

    it('应该能生成关卡', async () => {
      const level = await engine.generateLevel({
        playerId: testPlayerId,
        sessionId: testSessionId,
        difficulty: 0.5,
        theme: 'cyberpunk'
      });

      expect(level).toBeDefined();
      expect(level.metadata).toBeDefined();
      expect(level.baseMap).toBeDefined();
      expect(level.miniGames).toBeDefined();
      expect(Array.isArray(level.miniGames)).toBe(true);
    });

    it('生成的关卡应该有元数据', async () => {
      const level = await engine.generateLevel({
        playerId: testPlayerId,
        sessionId: testSessionId,
        difficulty: 0.6,
        theme: 'dungeon'
      });

      expect(level.metadata.id).toBeDefined();
      expect(level.metadata.tags).toContain('dungeon');
    });

    it('生成的关卡应该有小游戏', async () => {
      const level = await engine.generateLevel({
        playerId: testPlayerId,
        sessionId: testSessionId,
        difficulty: 0.5,
        theme: 'fantasy'
      });

      expect(level.miniGames.length).toBeGreaterThan(0);
    });

    it('生成的关卡应该有叙事桥接', async () => {
      const level = await engine.generateLevel({
        playerId: testPlayerId,
        sessionId: testSessionId,
        difficulty: 0.5,
        theme: 'scifi'
      });

      expect(level.narrativeBridge).toBeDefined();
      expect(typeof level.narrativeBridge).toBe('string');
    });
  });

  describe('反馈提交流程', () => {
    const testPlayerId = 'e2e-feedback-player';
    const testSessionId = 'e2e-session-feedback';

    it('应该能提交反馈', async () => {
      // 先生成一个关卡
      const level = await engine.generateLevel({
        playerId: testPlayerId,
        sessionId: testSessionId,
        difficulty: 0.5
      });

      // 提交反馈
      await expect(
        engine.submitFeedback(testSessionId, {
          type: ObservationType.SENTIMENT,
          content: 'Player completed the level in 60 seconds',
          importance: 8
        })
      ).resolves.not.toThrow();
    });
  });

  describe('关卡获取流程', () => {
    const testPlayerId = 'e2e-get-player';
    const testSessionId = 'e2e-session-get';

    it('应该能获取下一个关卡', async () => {
      // 先预生成一个关卡
      await engine.generateLevel({
        playerId: testPlayerId,
        sessionId: testSessionId,
        difficulty: 0.5
      });

      const level = await engine.getNextLevel(testSessionId);

      expect(level).toBeDefined();
    });
  });

  describe('配置验证', () => {
    it('应该支持不同的主题', async () => {
      const themes = ['cyberpunk', 'fantasy', 'dungeon', 'scifi', 'medieval'];

      for (const theme of themes) {
        const level = await engine.generateLevel({
          playerId: `theme-test-${theme}`,
          sessionId: `theme-session-${theme}`,
          difficulty: 0.5,
          theme
        });

        expect(level).toBeDefined();
        expect(level.metadata.tags).toContain(theme);
      }
    });

    it('应该支持不同的难度等级', async () => {
      const difficulties = [0.1, 0.3, 0.5, 0.7, 0.9];

      for (const difficulty of difficulties) {
        const level = await engine.generateLevel({
          playerId: `diff-test-${difficulty}`,
          sessionId: `diff-session-${difficulty}`,
          difficulty
        });

        expect(level).toBeDefined();
      }
    });
  });
});
