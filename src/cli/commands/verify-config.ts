// src/cli/commands/verify-config.ts
/**
 * @fileoverview 配置验证命令
 * @description 验证 YAML/JSON 配置文件的格式和逻辑正确性
 * @module cli/commands/verify-config
 * @author xzxllm
 * @license MIT
 *
 * 使用示例:
 * npx xzxllm-game verify-config ./config.yaml
 * npx xzxllm-game verify-config ./my-config.json --verbose
 * npx xzxllm-game verify-config (验证默认路径)
 */

import { Command, Option } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager, ConfigValidationError } from '../../core/config/config-manager.js';
import { ENV_MAPPINGS } from '../../core/config/default.config.js';

/**
 * 验证命令选项接口
 */
interface VerifyOptions {
  /** 详细输出模式 */
  verbose: boolean;
  /** 显示环境变量映射 */
  showEnv: boolean;
  /** 显示默认值 */
  showDefaults: boolean;
  /** 配置文件路径 */
  config: string;
  /** 调试模式 */
  debug: boolean;
}

/**
 * 验证结果接口
 */
interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: string[];
  /** 警告列表 */
  warnings: string[];
  /** 配置路径 */
  configPath?: string;
  /** 配置内容摘要 */
  summary?: Record<string, unknown>;
}

/**
 * 注册验证配置命令
 * @param program Commander 程序实例
 */
export function registerVerifyConfigCommand(program: Command): void {
  program
    .command('verify-config')
    .alias('verify')
    .description('验证配置文件格式和逻辑正确性')
    .argument('[config-path]', '配置文件路径 (YAML 或 JSON)', './config.yaml')
    .addOption(
      new Option('-v, --verbose', '显示详细验证信息')
        .default(false)
    )
    .addOption(
      new Option('--show-env', '显示环境变量映射')
        .default(false)
    )
    .addOption(
      new Option('--show-defaults', '显示默认配置值')
        .default(false)
    )
    .action(async (configPath: string, options: VerifyOptions) => {
      // 将位置参数合并到选项中
      options.config = configPath;
      await executeVerify(options);
    });
}

/**
 * 执行验证命令
 * @param options 命令选项
 */
async function executeVerify(options: VerifyOptions): Promise<void> {
  console.log('🔍 xzxllmGame 配置验证工具');
  console.log('═══════════════════════════════\n');

  let exitCode = 0;

  try {
    // 如果请求显示环境变量映射
    if (options.showEnv) {
      displayEnvMappings();
      return;
    }

    // 如果请求显示默认值
    if (options.showDefaults) {
      await displayDefaultValues();
      return;
    }

    // 执行配置验证
    const result = await validateConfiguration(options.config, options.verbose);

    // 显示验证结果
    displayValidationResult(result, options.verbose);

    exitCode = result.valid ? 0 : 1;

  } catch (error) {
    console.error('\n❌ 验证过程出错:');
    console.error(error instanceof Error ? error.message : String(error));

    if (options.debug && error instanceof Error && error.stack) {
      console.error('\n调试信息:', error.stack);
    }

    exitCode = 1;
  }

  process.exit(exitCode);
}

/**
 * 验证配置文件
 * @param configPath 配置文件路径
 * @param verbose 是否详细输出
 * @returns 验证结果
 */
async function validateConfiguration(
  configPath: string,
  verbose: boolean
): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // 1. 检查文件是否存在
  console.log(`📄 检查配置文件: ${configPath}`);

  if (!fs.existsSync(configPath)) {
    // 尝试其他默认路径
    const fallbackPaths = [
      './config.yaml',
      './config.yml',
      './config.json',
      './xzxllm-game.config.yaml',
    ];

    let found = false;
    for (const fallback of fallbackPaths) {
      if (fs.existsSync(fallback)) {
        console.log(`  ℹ️  使用备用配置: ${fallback}`);
        configPath = fallback;
        found = true;
        break;
      }
    }

    if (!found) {
      result.valid = false;
      result.errors.push(`配置文件不存在: ${configPath}`);
      result.errors.push('请提供有效的配置文件路径，或创建默认配置文件');
      return result;
    }
  }

  result.configPath = path.resolve(configPath);
  console.log(`  ✅ 文件存在: ${result.configPath}`);

  // 2. 检查文件格式
  const ext = path.extname(configPath).toLowerCase();
  if (!['.yaml', '.yml', '.json'].includes(ext)) {
    result.warnings.push(`非标准配置文件扩展名: ${ext}，建议使用 .yaml 或 .json`);
  }

  // 3. 读取文件内容
  console.log('\n📖 读取文件内容...');
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(configPath, 'utf8');
    console.log(`  ✅ 文件大小: ${(fileContent.length / 1024).toFixed(2)} KB`);
  } catch (error) {
    result.valid = false;
    result.errors.push(`无法读取文件: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }

  // 4. 解析配置
  console.log('\n🔧 解析配置文件...');
  const configManager = new ConfigManager();

  try {
    await configManager.load(configPath);
    console.log('  ✅ 配置文件解析成功');
  } catch (error) {
    result.valid = false;
    result.errors.push(`配置解析失败: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }

  // 5. 验证配置逻辑
  console.log('\n✅ 验证配置逻辑...');
  try {
    configManager.validate();
    console.log('  ✅ 配置验证通过');
  } catch (error) {
    result.valid = false;
    if (error instanceof ConfigValidationError) {
      result.errors.push(...error.errors);
    } else {
      result.errors.push(`验证失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 6. 检查特定配置项
  console.log('\n🔍 检查配置项...');
  checkSpecificConfigs(configManager, result, verbose);

  // 7. 生成配置摘要
  if (verbose) {
    result.summary = generateConfigSummary(configManager);
  }

  return result;
}

/**
 * 检查特定配置项
 * @param configManager 配置管理器
 * @param result 验证结果
 * @param verbose 是否详细输出
 */
function checkSpecificConfigs(
  configManager: ConfigManager,
  result: ValidationResult,
  verbose: boolean
): void {
  // 检查 LLM 配置
  const llmProvider = configManager.get<string>('llm.provider');
  console.log(`  LLM 提供商: ${llmProvider || '未设置 (将使用默认值)'}`);

  if (llmProvider === 'local') {
    const modelPath = configManager.get<string>('llm.localOptions.modelPath');
    if (!modelPath) {
      result.errors.push('本地模型配置错误: 未设置模型路径 (llm.localOptions.modelPath)');
    } else if (!fs.existsSync(modelPath)) {
      result.warnings.push(`本地模型文件不存在: ${modelPath}`);
    } else if (verbose) {
      const stats = fs.statSync(modelPath);
      console.log(`    模型文件: ${modelPath}`);
      console.log(`    文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  if (['openai', 'anthropic', 'custom'].includes(llmProvider || '')) {
    const apiKey = configManager.get<string>('llm.apiKey');
    const envApiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey && !envApiKey) {
      result.warnings.push(`${llmProvider} 提供商建议设置 API Key`);
    } else {
      console.log(`    API Key: ${'*'.repeat(8)} (已设置)`);
    }
  }

  // 检查存储配置
  const storageType = configManager.get<string>('storage.type');
  console.log(`  存储类型: ${storageType || '未设置 (将使用默认值)'}`);

  if (storageType === 'sqlite') {
    const dbPath = configManager.get<string>('storage.connectionString');
    if (dbPath) {
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        result.warnings.push(`数据库目录不存在，将自动创建: ${dbDir}`);
      } else {
        console.log(`    数据库路径: ${dbPath}`);
      }
    }
  }

  // 检查生成配置
  const difficulty = configManager.get<number>('generation.difficulty');
  if (difficulty !== undefined) {
    if (difficulty < 0 || difficulty > 1) {
      result.errors.push(`难度值无效: ${difficulty}，必须在 0.0 - 1.0 之间`);
    } else {
      console.log(`  默认难度: ${(difficulty * 100).toFixed(0)}%`);
    }
  }

  const pregenerateCount = configManager.get<number>('generation.pregenerateCount');
  if (pregenerateCount !== undefined) {
    if (pregenerateCount < 0 || pregenerateCount > 10) {
      result.warnings.push(`预生成数量 ${pregenerateCount} 超出推荐范围 (0-10)`);
    } else {
      console.log(`  预生成数量: ${pregenerateCount}`);
    }
  }

  // 检查超时配置
  const timeout = configManager.get<number>('llm.timeout');
  if (timeout !== undefined && timeout < 5000) {
    result.warnings.push(`LLM 超时时间 ${timeout}ms 较短，可能导致频繁超时`);
  }
}

/**
 * 生成配置摘要
 * @param configManager 配置管理器
 * @returns 配置摘要对象
 */
function generateConfigSummary(configManager: ConfigManager): Record<string, unknown> {
  const allConfig = configManager.getAll();

  return {
    llm: {
      provider: allConfig.llm?.provider,
      model: allConfig.llm?.model,
      baseUrl: allConfig.llm?.baseUrl,
      temperature: allConfig.llm?.temperature,
    },
    storage: {
      type: allConfig.storage?.type,
      connectionString: allConfig.storage?.connectionString
        ? '[已设置]'
        : '[未设置]',
    },
    generation: allConfig.generation,
  };
}

/**
 * 显示验证结果
 * @param result 验证结果
 * @param verbose 是否详细输出
 */
function displayValidationResult(result: ValidationResult, verbose: boolean): void {
  console.log('\n═══════════════════════════════');
  console.log('📋 验证结果');
  console.log('═══════════════════════════════');

  if (result.valid && result.errors.length === 0) {
    console.log('\n✅ 配置文件验证通过！');
    console.log(`配置文件路径: ${result.configPath}`);
  } else {
    console.log('\n❌ 配置文件验证失败');
  }

  if (result.errors.length > 0) {
    console.log(`\n❌ 错误 (${result.errors.length}):`);
    result.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  警告 (${result.warnings.length}):`);
    result.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
  }

  if (verbose && result.summary) {
    console.log('\n📊 配置摘要:');
    console.log(JSON.stringify(result.summary, null, 2));
  }

  console.log('\n═══════════════════════════════');
}

/**
 * 显示环境变量映射
 */
function displayEnvMappings(): void {
  console.log('\n🌍 环境变量映射表');
  console.log('═══════════════════════════════');
  console.log('以下环境变量可用于覆盖配置文件中的设置:\n');

  const maxKeyLength = Math.max(...Object.keys(ENV_MAPPINGS).map((k) => k.length));

  Object.entries(ENV_MAPPINGS).forEach(([envVar, configPath]) => {
    const paddedKey = envVar.padEnd(maxKeyLength);
    console.log(`  ${paddedKey} → ${configPath}`);
  });

  console.log('\n使用示例:');
  console.log('  export LLM_PROVIDER=ollama');
  console.log('  export LLM_MODEL=qwen2.5:7b');
  console.log('  export LLM_API_KEY=sk-xxx');
  console.log('  export STORAGE_TYPE=sqlite');
  console.log('  export DATABASE_URL=./data/game.db');
}

/**
 * 显示默认配置值
 */
async function displayDefaultValues(): Promise<void> {
  console.log('\n🔧 默认配置值');
  console.log('═══════════════════════════════');

  const configManager = new ConfigManager();
  await configManager.load(); // 加载默认配置

  const defaults = configManager.getAll();

  console.log('\nLLM 配置:');
  console.log(`  提供商: ${defaults.llm?.provider}`);
  console.log(`  模型: ${defaults.llm?.model}`);
  console.log(`  温度: ${defaults.llm?.temperature}`);
  console.log(`  最大 Token: ${defaults.llm?.maxTokens}`);
  console.log(`  超时: ${defaults.llm?.timeout}ms`);
  console.log(`  重试次数: ${defaults.llm?.retryAttempts}`);

  console.log('\n存储配置:');
  console.log(`  类型: ${defaults.storage?.type}`);
  console.log(`  连接字符串: ${defaults.storage?.connectionString || '[使用默认]'}`);

  console.log('\n生成配置:');
  console.log(`  默认难度: ${defaults.generation?.difficulty}`);
  console.log(`  预生成数量: ${defaults.generation?.pregenerateCount}`);
  console.log(`  最小小游戏数: ${defaults.generation?.minMiniGames}`);
  console.log(`  最大小游戏数: ${defaults.generation?.maxMiniGames}`);
  console.log(`  超时: ${defaults.generation?.timeout}ms`);
  console.log(`  启用叙事: ${defaults.generation?.enableNarrative}`);

  console.log('\n难度调整配置:');
  console.log(`  挫败感阈值: ${defaults.difficultyAdjustment?.frustrationThreshold}`);
  console.log(`  连胜阈值: ${defaults.difficultyAdjustment?.winStreakThreshold}`);
  console.log(`  调整步长: ${defaults.difficultyAdjustment?.adjustmentStep}`);
  console.log(`  最大难度: ${defaults.difficultyAdjustment?.maxDifficulty}`);
  console.log(`  最小难度: ${defaults.difficultyAdjustment?.minDifficulty}`);

  console.log('\n记忆系统配置:');
  console.log(`  保留天数: ${defaults.memory?.retentionDays}`);
  console.log(`  最小重要性: ${defaults.memory?.minImportance}`);
  console.log(`  最大缓冲关卡: ${defaults.memory?.maxBufferedLevels}`);
  console.log(`  会话超时: ${defaults.memory?.sessionTimeoutHours} 小时`);
}
