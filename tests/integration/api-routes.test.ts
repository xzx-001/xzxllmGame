// tests/integration/api-routes.test.ts
/**
 * @fileoverview API 路由集成测试
 * @description 测试 HTTP API 端点的基本功能
 * @module tests/integration/api-routes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHTTPServer, HTTPServer } from '../../src/api/http/server.js';
import { XZXLLMGameEngine } from '../../src/core/engine.js';

describe('API 路由集成测试', () => {
  let engine: XZXLLMGameEngine;
  let server: HTTPServer;
  let baseUrl: string;

  beforeAll(async () => {
    // 创建引擎实例
    engine = new XZXLLMGameEngine({
      llm: {
        provider: 'custom',
        model: 'mock-model',
        baseUrl: 'http://localhost:11434'
      },
      storage: {
        type: 'memory'
      }
    });
    await engine.initialize();

    // 创建服务器（使用随机端口）
    server = createHTTPServer(engine, {
      port: 0, // 随机端口
      host: '127.0.0.1'
    });

    // 启动服务器
    await server.start();

    // 获取实际分配的端口
    // @ts-ignore - 访问私有属性
    const port = server['server'].address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server.stop();
    await engine.dispose();
  });

  describe('健康检查端点', () => {
    it('GET /health 应该返回健康状态', async () => {
      const response = await fetch(`${baseUrl}/health`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('healthy');
    });
  });

  describe('关卡生成端点', () => {
    it('POST /api/levels 应该生成关卡', async () => {
      const response = await fetch(`${baseUrl}/api/levels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          playerId: 'api-test-player',
          sessionId: 'api-test-session',
          difficulty: 0.5,
          theme: 'cyberpunk'
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    it('缺少必要参数应该返回错误', async () => {
      const response = await fetch(`${baseUrl}/api/levels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // 缺少 playerId 和 sessionId
          difficulty: 0.5
        })
      });

      expect(response.status).toBe(400);
    });
  });

  describe('玩家数据端点', () => {
    const testPlayerId = 'api-player-test';

    it('GET /api/players/:id 应该返回玩家数据', async () => {
      // 先创建一些数据
      await engine.generateLevel({
        playerId: testPlayerId,
        sessionId: 'api-session-1',
        difficulty: 0.5
      });

      const response = await fetch(`${baseUrl}/api/players/${testPlayerId}`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('不存在的玩家应该返回 404', async () => {
      const response = await fetch(`${baseUrl}/api/players/non-existent-player`);

      expect(response.status).toBe(404);
    });
  });

  describe('反馈提交端点', () => {
    it('POST /api/feedback 应该提交反馈', async () => {
      const testSessionId = 'api-feedback-session';

      // 先创建一个关卡
      const levelResponse = await fetch(`${baseUrl}/api/levels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: 'api-feedback-player',
          sessionId: testSessionId,
          difficulty: 0.5
        })
      });

      const levelData = await levelResponse.json();
      const levelId = levelData.data?.metadata?.id;

      const response = await fetch(`${baseUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: testSessionId,
          levelId: levelId || 'test-level',
          type: 'completion',
          content: 'Test feedback',
          completionTime: 60,
          success: true
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('404 处理', () => {
    it('不存在的路由应该返回 404', async () => {
      const response = await fetch(`${baseUrl}/api/non-existent-route`);

      expect(response.status).toBe(404);
    });
  });

  describe('CORS 支持', () => {
    it('应该支持 CORS 预检请求', async () => {
      const response = await fetch(`${baseUrl}/api/levels`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST'
        }
      });

      expect(response.status).toBe(204);
    });
  });
});
