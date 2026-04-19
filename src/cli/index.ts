// src/cli/index.ts
/**
 * @fileoverview xzxllmGame CLI 入口
 * @description 命令行工具入口，提供关卡生成、配置验证、数据库迁移、性能基准测试等功能
 * @module cli/index
 * @author xzxllm
 * @license MIT
 *
 * 使用方法:
 * npx xzxllm-game <command> [options]
 *
 * 可用命令:
 * - generate: 生成测试关卡
 * - verify-config: 验证配置文件
 * - db-migrate: 数据库迁移管理
 * - benchmark: LLM 性能基准测试
 *
 * @example
 * npx xzxllm-game generate --difficulty 0.7 --theme cyberpunk
 * npx xzxllm-game verify-config ./config.yaml
 * npx xzxllm-game db-migrate --action up
 * npx xzxllm-game benchmark --provider ollama --model qwen2.5:7b
 */

import { Command } from 'commander';
import { registerCommands } from './commands/index.js';

/**
 * 创建并配置 CLI 程序
 * @returns 配置好的 Command 实例
 */
function createCLI(): Command {
  const program = new Command();

  // 基础配置
  program
    .name('xzxllm-game')
    .description('xzxllmGame - LLM 驱动的游戏内容生成引擎 CLI 工具')
    .version('1.0.0', '-v, --version', '显示版本号')
    .helpOption('-h, --help', '显示帮助信息')
    .configureHelp({
      sortSubcommands: true,
      showGlobalOptions: true,
    });

  // 全局选项
  program.option(
    '-c, --config <path>',
    '指定配置文件路径',
    './config.yaml'
  );

  program.option(
    '--debug',
    '启用调试模式，输出详细日志',
    false
  );

  // 注册所有子命令
  registerCommands(program);

  return program;
}

/**
 * 运行 CLI 程序
 * @param argv 命令行参数数组，默认使用 process.argv
 */
export async function run(argv: string[] = process.argv): Promise<void> {
  try {
    const program = createCLI();
    await program.parseAsync(argv);
  } catch (error) {
    console.error('\n[CLI Error]', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * 主入口点
 * 当直接运行此文件时执行
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}

// 导出供测试使用
export { createCLI };
