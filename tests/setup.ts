// tests/setup.ts
/**
 * @fileoverview Vitest 测试环境初始化
 * @description 配置测试全局设置、Mock 和工具函数
 * @module tests/setup
 */

import { vi, beforeEach, afterAll } from 'vitest';

// 全局测试超时设置
vi.setConfig({ testTimeout: 30000 });

// Mock console 方法在测试中避免噪音
// 但保留错误输出以便调试
global.console = {
  ...console,
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: console.error, // 保留错误输出
  debug: vi.fn(),
};

// 模拟环境变量
process.env.NODE_ENV = 'test';
process.env.DEBUG = 'false';
process.env.LOG_LEVEL = 'error';

// 清理函数，每个测试后调用
export function cleanup(): void {
  vi.clearAllMocks();
}

// 全局测试钩子
beforeEach(() => {
  cleanup();
});

afterAll(() => {
  vi.restoreAllMocks();
});
