// src/cli/commands/generate.ts
/**
 * @fileoverview 生成测试关卡命令
 * @description 通过 CLI 生成游戏关卡，支持自定义难度、主题、输出格式等参数
 * @module cli/commands/generate
 * @author xzxllm
 * @license MIT
 *
 * 使用示例:
 * npx xzxllm-game generate --difficulty 0.7 --theme cyberpunk
 * npx xzxllm-game generate -d 0.5 -t dungeon --output ./level.json --pretty
 * npx xzxllm-game generate --player player_001 --session session_001 --pregenerate 3
 */

import { Command, Option } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { createEngine, XZXLLMGameEngine, GameEngineConfig } from '../../core/engine.js';
import { ConfigManager } from '../../core/config/config-manager.js';
import { LevelStructure } from '../../core/interfaces/base.types.js';

/**
 * 生成命令选项接口
 */
interface GenerateOptions {
  /** 难度系数 (0.0 - 1.0) */
  difficulty: string;
  /** 关卡主题 */
  theme: string;
  /** 玩家 ID */
  player: string;
  /** 会话 ID */
  session: string;
  /** 输出文件路径 */
  output?: string;
  /** 是否格式化 JSON 输出 */
  pretty: boolean;
  /** 预生成数量 */
  pregenerate: string;
  /** 配置文件路径 */
  config: string;
  /** 是否只显示元数据 */
  metadataOnly: boolean;
  /** 调试模式 */
  debug: boolean;
}

/**
 * 注册生成命令
 * @param program Commander 程序实例
 */
export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .alias('gen')
    .description('生成游戏关卡')
    .addOption(
      new Option('-d, --difficulty <number>', '难度系数 (0.0 - 1.0)')
        .default('0.5')
        .argParser(parseFloat)
    )
    .addOption(
      new Option('-t, --theme <string>', '关卡主题风格')
        .default('dungeon')
        .choices(['dungeon', 'cyberpunk', 'forest', 'space', 'medieval', 'abstract'])
    )
    .addOption(
      new Option('-p, --player <id>', '玩家唯一标识')
        .default(`player_${Date.now()}`)
    )
    .addOption(
      new Option('-s, --session <id>', '会话唯一标识')
        .default(`session_${Date.now()}`)
    )
    .addOption(
      new Option('-o, --output <path>', '输出文件路径 (JSON格式)')
    )
    .addOption(
      new Option('--pretty', '格式化 JSON 输出 (带缩进)')
        .default(false)
    )
    .addOption(
      new Option('--pregenerate <number>', '额外预生成关卡数量')
        .default('0')
        .argParser(parseInt)
    )
    .addOption(
      new Option('--metadata-only', '仅输出关卡元数据，不包含完整内容')
        .default(false)
    )
    .action(async (options: GenerateOptions) => {
      await executeGenerate(options);
    });
}

/**
 * 执行生成命令
 * @param options 命令选项
 */
async function executeGenerate(options: GenerateOptions): Promise<void> {
  const startTime = Date.now();
  let engine: XZXLLMGameEngine | null = null;

  try {
    // 验证参数
    const difficulty = parseFloat(options.difficulty);
    if (isNaN(difficulty) || difficulty < 0 || difficulty > 1) {
      throw new Error('难度系数必须在 0.0 - 1.0 之间');
    }

    const pregenerateCount = parseInt(options.pregenerate, 10);
    if (isNaN(pregenerateCount) || pregenerateCount < 0) {
      throw new Error('预生成数量必须是非负整数');
    }

    console.log('🎮 xzxllmGame 关卡生成器');
    console.log('═══════════════════════════════');
    console.log(`难度: ${(difficulty * 100).toFixed(0)}%`);
    console.log(`主题: ${options.theme}`);
    console.log(`玩家: ${options.player}`);
    console.log(`会话: ${options.session}`);
    if (pregenerateCount > 0) {
      console.log(`预生成: ${pregenerateCount} 个关卡`);
    }
    console.log('═══════════════════════════════\n');

    // 加载配置
    const configManager = new ConfigManager();
    const configPath = options.config;

    if (fs.existsSync(configPath)) {
      console.log(`📄 加载配置文件: ${configPath}`);
      await configManager.load(configPath);
    } else {
      console.log('⚠️ 未找到配置文件，使用默认配置');
      await configManager.load();
    }

    // 构建引擎配置
    const engineConfig: GameEngineConfig = {
      llm: {
        provider: configManager.get('llm.provider', 'ollama'),
        model: configManager.get('llm.model', 'qwen2.5:7b'),
        apiKey: configManager.get('llm.apiKey'),
        baseUrl: configManager.get('llm.baseUrl'),
        temperature: configManager.get('llm.temperature', 0.7),
        maxTokens: configManager.get('llm.maxTokens', 2000),
      },
      storage: {
        type: configManager.get('storage.type', 'sqlite'),
        connectionString: configManager.get('storage.connectionString', './data/game.db'),
      },
      generation: {
        pregenerateCount: pregenerateCount,
        enableNarrative: configManager.get('generation.enableNarrative', true),
        defaultDifficulty: difficulty,
      },
      debug: options.debug,
    };

    // 创建并初始化引擎
    console.log('🔧 初始化引擎...');
    engine = createEngine(engineConfig);
    await engine.initialize();
    console.log('✅ 引擎初始化完成\n');

    // 生成关卡
    console.log('🎯 正在生成关卡...');
    const level = await engine.generateLevel({
      playerId: options.player,
      sessionId: options.session,
      difficulty: difficulty,
      theme: options.theme,
    });

    // 如果需要预生成额外关卡
    if (pregenerateCount > 0) {
      console.log(`⏳ 预生成 ${pregenerateCount} 个额外关卡...`);
      for (let i = 0; i < pregenerateCount; i++) {
        await engine.generateLevel({
          playerId: options.player,
          sessionId: options.session,
          difficulty: difficulty,
          theme: options.theme,
        });
        console.log(`  ✓ 预生成 ${i + 1}/${pregenerateCount}`);
      }
    }

    // 输出结果
    console.log('\n✅ 关卡生成成功！\n');

    // 显示关卡信息
    displayLevelInfo(level, options.metadataOnly);

    // 保存到文件
    if (options.output) {
      await saveLevelToFile(level, options.output, options.pretty, options.metadataOnly);
      console.log(`\n💾 关卡已保存到: ${path.resolve(options.output)}`);
    }

    const duration = Date.now() - startTime;
    console.log(`\n⏱️ 总耗时: ${(duration / 1000).toFixed(2)} 秒`);

  } catch (error) {
    console.error('\n❌ 生成失败:', error instanceof Error ? error.message : String(error));
    if (options.debug && error instanceof Error && error.stack) {
      console.error('\n调试信息:', error.stack);
    }
    process.exit(1);
  } finally {
    if (engine) {
      console.log('\n🔌 释放引擎资源...');
      await engine.dispose();
    }
  }
}

/**
 * 显示关卡信息
 * @param level 关卡数据
 * @param metadataOnly 是否只显示元数据
 */
function displayLevelInfo(level: LevelStructure, metadataOnly: boolean): void {
  console.log('📊 关卡信息');
  console.log('───────────────────────────────');
  console.log(`ID: ${level.metadata.id}`);
  console.log(`版本: ${level.metadata.version}`);
  console.log(`难度: ${(level.metadata.totalDifficulty * 100).toFixed(0)}%`);
  console.log(`情绪: ${level.metadata.intendedMood}`);
  console.log(`预计时间: ${level.metadata.estimatedTime} 秒`);
  console.log(`标签: ${level.metadata.tags.join(', ') || '无'}`);
  console.log(`生成时间: ${level.metadata.generatedAt ? new Date(level.metadata.generatedAt).toLocaleString() : '未知'}`);

  console.log('\n🗺️ 地图配置');
  console.log('───────────────────────────────');
  console.log(`尺寸: ${level.baseMap.size[0]} x ${level.baseMap.size[1]}`);
  console.log(`主题: ${level.baseMap.theme}`);
  console.log(`起始位置: (${level.baseMap.playerStart.x}, ${level.baseMap.playerStart.y})`);
  console.log(`出口位置: (${level.baseMap.exitPosition.x}, ${level.baseMap.exitPosition.y})`);

  if (!metadataOnly) {
    console.log('\n🎮 小游戏');
    console.log('───────────────────────────────');
    if (level.miniGames.length === 0) {
      console.log('无小游戏');
    } else {
      level.miniGames.forEach((game, index) => {
        console.log(`\n  [${index + 1}] ${game.id}`);
        console.log(`      类型: ${game.type}`);
        console.log(`      难度: ${(game.difficulty * 100).toFixed(0)}%`);
        console.log(`      位置: (${game.bounds.x}, ${game.bounds.y}) [${game.bounds.w}x${game.bounds.h}]`);
      });
    }

    console.log('\n📦 道具');
    console.log('───────────────────────────────');
    if (level.props.length === 0) {
      console.log('无道具');
    } else {
      level.props.forEach((prop, index) => {
        console.log(`  [${index + 1}] ${JSON.stringify(prop)}`);
      });
    }

    console.log('\n💬 叙事开场白');
    console.log('───────────────────────────────');
    console.log(level.narrativeBridge);

    if (level.dialogues.length > 0) {
      console.log('\n🗨️ 对话节点');
      console.log('───────────────────────────────');
      console.log(`共 ${level.dialogues.length} 个对话节点`);
    }
  }

  if (level.debugInfo) {
    console.log('\n🔍 调试信息');
    console.log('───────────────────────────────');
    Object.entries(level.debugInfo).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
  }
}

/**
 * 保存关卡到文件
 * @param level 关卡数据
 * @param outputPath 输出路径
 * @param pretty 是否格式化
 * @param metadataOnly 是否只保存元数据
 */
async function saveLevelToFile(
  level: LevelStructure,
  outputPath: string,
  pretty: boolean,
  metadataOnly: boolean
): Promise<void> {
  const outputDir = path.dirname(outputPath);

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 准备输出数据
  const outputData = metadataOnly
    ? {
        metadata: level.metadata,
        baseMap: {
          size: level.baseMap.size,
          theme: level.baseMap.theme,
        },
        miniGameCount: level.miniGames.length,
        propCount: level.props.length,
      }
    : level;

  // 写入文件
  const jsonContent = pretty
    ? JSON.stringify(outputData, null, 2)
    : JSON.stringify(outputData);

  fs.writeFileSync(outputPath, jsonContent, 'utf8');
}
