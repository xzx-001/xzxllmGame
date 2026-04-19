// tests/unit/memory/sqlite-adapter.test.ts
/**
 * @fileoverview 存储适配器单元测试
 * @description 使用 MemoryStorageAdapter 测试存储接口（避免依赖 SQLite）
 * @module tests/unit/memory/sqlite-adapter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStorageAdapter } from '../../../src/memory/storage/memory-adapter.js';
import { ObservationType, RelationshipStage, AIMood } from '../../../src/core/interfaces/base.types.js';

describe('MemoryStorageAdapter', () => {
  let adapter: MemoryStorageAdapter;

  beforeEach(async () => {
    adapter = new MemoryStorageAdapter({
      maxSize: 1000,
      defaultTTL: 0 // 永不过期
    });
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('基础 KV 操作', () => {
    it('应该能设置和获取值', async () => {
      await adapter.set('key1', { foo: 'bar' });

      const value = await adapter.get('key1');

      expect(value).toEqual({ foo: 'bar' });
    });

    it('获取不存在的键应该返回 undefined', async () => {
      const value = await adapter.get('non-existent');

      expect(value).toBeUndefined();
    });

    it('应该能删除键', async () => {
      await adapter.set('key1', 'value');
      await adapter.delete('key1');

      const value = await adapter.get('key1');

      expect(value).toBeUndefined();
    });

    it('应该能检查键是否存在', async () => {
      await adapter.set('key1', 'value');

      expect(await adapter.has('key1')).toBe(true);
      expect(await adapter.has('key2')).toBe(false);
    });

    it('应该能清空所有数据', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');

      await adapter.clear();

      expect(await adapter.get('key1')).toBeUndefined();
      expect(await adapter.get('key2')).toBeUndefined();
    });
  });

  describe('批量操作', () => {
    it('应该能批量获取', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');
      await adapter.set('key3', 'value3');

      const results = await adapter.getMany(['key1', 'key2', 'non-existent']);

      expect(results.get('key1')).toBe('value1');
      expect(results.get('key2')).toBe('value2');
      expect(results.has('non-existent')).toBe(false);
    });

    it('应该能批量设置', async () => {
      await adapter.setMany([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' }
      ]);

      expect(await adapter.get('key1')).toBe('value1');
      expect(await adapter.get('key2')).toBe('value2');
    });
  });

  describe('玩家画像操作', () => {
    const testPlayerId = 'player-123';

    it('应该能创建新玩家画像', async () => {
      await adapter.updatePlayerProfile(testPlayerId, {
        skillRating: 0.7,
        preferredTypes: ['pushbox']
      });

      const profile = await adapter.getPlayerProfile(testPlayerId);

      expect(profile).toBeDefined();
      expect(profile?.playerId).toBe(testPlayerId);
      expect(profile?.skillRating).toBe(0.7);
    });

    it('应该能更新现有玩家画像', async () => {
      await adapter.updatePlayerProfile(testPlayerId, { skillRating: 0.5 });
      await adapter.updatePlayerProfile(testPlayerId, { skillRating: 0.8 });

      const profile = await adapter.getPlayerProfile(testPlayerId);

      expect(profile?.skillRating).toBe(0.8);
    });

    it('不存在玩家应该返回 null', async () => {
      const profile = await adapter.getPlayerProfile('non-existent');

      expect(profile).toBeNull();
    });

    it('应该能创建默认玩家画像', async () => {
      const profile = await adapter.createPlayerProfileIfNotExists(testPlayerId);

      expect(profile.playerId).toBe(testPlayerId);
      expect(profile.skillRating).toBe(0.5);
      expect(profile.relationshipStage).toBe(RelationshipStage.RIVALS);
    });

    it('已有玩家时不应重复创建', async () => {
      await adapter.updatePlayerProfile(testPlayerId, { skillRating: 0.9 });

      const profile = await adapter.createPlayerProfileIfNotExists(testPlayerId);

      expect(profile.skillRating).toBe(0.9);
    });
  });

  describe('叙事状态操作', () => {
    const testSessionId = 'session-456';
    const testPlayerId = 'player-789';

    it('应该能创建新叙事状态', async () => {
      await adapter.updateNarrativeState(testSessionId, {
        playerId: testPlayerId,
        currentMood: AIMood.PLAYFUL
      });

      const state = await adapter.getNarrativeState(testSessionId);

      expect(state).toBeDefined();
      expect(state?.sessionId).toBe(testSessionId);
      expect(state?.playerId).toBe(testPlayerId);
    });

    it('应该能更新叙事状态', async () => {
      await adapter.updateNarrativeState(testSessionId, {
        playerId: testPlayerId,
        currentMood: AIMood.PLAYFUL
      });
      await adapter.updateNarrativeState(testSessionId, {
        currentMood: AIMood.STUBBORN
      });

      const state = await adapter.getNarrativeState(testSessionId);

      expect(state?.currentMood).toBe(AIMood.STUBBORN);
    });

    it('不存在状态应该返回 null', async () => {
      const state = await adapter.getNarrativeState('non-existent');

      expect(state).toBeNull();
    });

    it('应该能创建默认叙事状态', async () => {
      const state = await adapter.createNarrativeStateIfNotExists(testSessionId, testPlayerId);

      expect(state.sessionId).toBe(testSessionId);
      expect(state.playerId).toBe(testPlayerId);
      expect(state.currentMood).toBe(AIMood.PLAYFUL);
    });

    it('应该能获取当前 mood', async () => {
      await adapter.updateNarrativeState(testSessionId, {
        playerId: testPlayerId,
        currentMood: AIMood.MYSTERIOUS
      });

      const mood = await adapter.getCurrentMood(testSessionId);

      expect(mood).toBe(AIMood.MYSTERIOUS);
    });
  });

  describe('观察记录操作', () => {
    const testSessionId = 'session-obs';

    it('应该能提交观察记录', async () => {
      await adapter.submitObservation({
        sessionId: testSessionId,
        observationType: ObservationType.SENTIMENT,
        content: 'Test observation',
        importance: 5
      });

      const observations = await adapter.getUnprocessedObservations(10);

      expect(observations.length).toBeGreaterThan(0);
      expect(observations[0].content).toBe('Test observation');
    });

    it('应该能批量提交观察记录', async () => {
      await adapter.submitObservationsBatch([
        { sessionId: testSessionId, observationType: ObservationType.SENTIMENT, content: 'obs1', importance: 1 },
        { sessionId: testSessionId, observationType: ObservationType.STRATEGY, content: 'obs2', importance: 2 }
      ]);

      const observations = await adapter.getUnprocessedObservations(10);

      expect(observations.length).toBe(2);
    });

    it('应该能标记观察记录为已处理', async () => {
      await adapter.submitObservation({
        sessionId: testSessionId,
        observationType: ObservationType.SENTIMENT,
        content: 'Test',
        importance: 5
      });

      const unprocessed = await adapter.getUnprocessedObservations(10);
      expect(unprocessed.length).toBeGreaterThan(0);

      await adapter.markObservationsProcessed([unprocessed[0].id!]);

      const after = await adapter.getUnprocessedObservations(10);
      expect(after.every(obs => obs.id !== unprocessed[0].id)).toBe(true);
    });
  });

  describe('关卡缓冲池操作', () => {
    const testSessionId = 'session-puzzle';

    it('应该能存储关卡', async () => {
      const puzzleId = await adapter.storePuzzle(
        testSessionId,
        { level: 1, data: 'test' },
        0.5,
        'playful'
      );

      expect(puzzleId).toBeDefined();
      expect(typeof puzzleId).toBe('string');
    });

    it('应该能消费关卡', async () => {
      await adapter.storePuzzle(testSessionId, { level: 1 }, 0.5, 'playful');
      await adapter.storePuzzle(testSessionId, { level: 2 }, 0.6, 'stubborn');

      const puzzle = await adapter.consumeNextPuzzle(testSessionId);

      expect(puzzle).toBeDefined();
      expect(puzzle?.consumed).toBe(true);
    });

    it('应该能获取待消费关卡数量', async () => {
      await adapter.storePuzzle(testSessionId, { level: 1 }, 0.5, 'playful');
      await adapter.storePuzzle(testSessionId, { level: 2 }, 0.6, 'stubborn');

      const count = await adapter.getPendingPuzzleCount(testSessionId);

      expect(count).toBe(2);
    });

    it('消费后待消费数量应该减少', async () => {
      await adapter.storePuzzle(testSessionId, { level: 1 }, 0.5, 'playful');
      await adapter.storePuzzle(testSessionId, { level: 2 }, 0.6, 'stubborn');

      const before = await adapter.getPendingPuzzleCount(testSessionId);
      await adapter.consumeNextPuzzle(testSessionId);
      const after = await adapter.getPendingPuzzleCount(testSessionId);

      expect(after).toBe(before - 1);
    });
  });

  describe('健康检查和统计', () => {
    it('健康检查应该通过', async () => {
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('应该能获取统计信息', async () => {
      await adapter.set('key1', 'value1');
      await adapter.get('key1');

      const stats = await adapter.getStats();

      expect(stats.storageType).toBe('memory');
      expect(stats.operations.writes).toBeGreaterThan(0);
    });
  });

  describe('数据导入导出', () => {
    it('应该能导出数据', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');

      const data = await adapter.export();

      expect(data.key1).toBe('value1');
      expect(data.key2).toBe('value2');
    });

    it('应该能导入数据', async () => {
      await adapter.import({
        key1: 'imported1',
        key2: 'imported2'
      });

      expect(await adapter.get('key1')).toBe('imported1');
      expect(await adapter.get('key2')).toBe('imported2');
    });

    it('导入时应该支持跳过已存在项', async () => {
      await adapter.set('key1', 'original');

      await adapter.import({ key1: 'new', key2: 'imported' }, { skipExisting: true });

      expect(await adapter.get('key1')).toBe('original');
      expect(await adapter.get('key2')).toBe('imported');
    });
  });
});
