// src/cli/commands/index.ts
/**
 * @fileoverview CLI 命令注册中心
 * @description 集中注册所有 CLI 子命令，便于管理和扩展
 * @module cli/commands/index
 * @author xzxllm
 * @license MIT
 */

import { Command } from 'commander';
import { registerGenerateCommand } from './generate.js';
import { registerVerifyConfigCommand } from './verify-config.js';
import { registerDbMigrateCommand } from './db-migrate.js';
import { registerBenchmarkCommand } from './benchmark.js';

/**
 * 注册所有 CLI 命令
 * @param program Commander 程序实例
 *
 * @example
 * const program = new Command();
 * registerCommands(program);
 * program.parse(process.argv);
 */
export function registerCommands(program: Command): void {
  // 注册各个子命令
  registerGenerateCommand(program);
  registerVerifyConfigCommand(program);
  registerDbMigrateCommand(program);
  registerBenchmarkCommand(program);
}

// 重新导出各命令模块，便于单独使用
export {
  registerGenerateCommand,
  registerVerifyConfigCommand,
  registerDbMigrateCommand,
  registerBenchmarkCommand,
};
