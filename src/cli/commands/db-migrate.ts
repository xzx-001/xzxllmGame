// src/cli/commands/db-migrate.ts
/**
 * @fileoverview 数据库迁移命令
 * @description 管理 SQLite/Redis 数据库的迁移、备份、清理等操作
 * @module cli/commands/db-migrate
 * @author xzxllm
 * @license MIT
 *
 * 使用示例:
 * npx xzxllm-game db-migrate --action status       查看迁移状态
 * npx xzxllm-game db-migrate --action up           执行所有待执行迁移
 * npx xzxllm-game db-migrate --action down         回滚最后一条迁移
 * npx xzxllm-game db-migrate --action create       创建新迁移文件
 * npx xzxllm-game db-migrate --action backup       备份数据库
 * npx xzxllm-game db-migrate --action cleanup      清理过期数据
 */

import { Command, Option } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../../core/config/config-manager.js';
import { SQLiteStorageAdapter } from '../../memory/storage/sqlite-adapter.js';
import { MemoryStorageAdapter } from '../../memory/storage/memory-adapter.js';

/**
 * 迁移命令选项接口
 */
interface MigrateOptions {
  /** 操作类型 */
  action: 'status' | 'up' | 'down' | 'create' | 'backup' | 'cleanup' | 'reset';
  /** 迁移文件名称 (用于 create) */
  name?: string;
  /** 配置文件路径 */
  config: string;
  /** 调试模式 */
  debug: boolean;
  /** 数据库路径 (覆盖配置) */
  database?: string;
  /** 清理天数 (用于 cleanup) */
  days?: string;
  /** 备份目录 */
  backupDir?: string;
}

/**

/**
 * 注册数据库迁移命令
 * @param program Commander 程序实例
 */
export function registerDbMigrateCommand(program: Command): void {
  program
    .command('db-migrate')
    .alias('db')
    .description('数据库迁移管理工具')
    .addOption(
      new Option('-a, --action <action>', '执行的操作')
        .choices(['status', 'up', 'down', 'create', 'backup', 'cleanup', 'reset'])
        .default('status')
    )
    .addOption(
      new Option('-n, --name <name>', '迁移名称 (用于 create 操作)')
    )
    .addOption(
      new Option('-d, --database <path>', '数据库路径 (覆盖配置文件)')
    )
    .addOption(
      new Option('--days <number>', '清理数据的天数阈值')
        .default('30')
        .argParser(parseInt)
    )
    .addOption(
      new Option('--backup-dir <path>', '备份目录')
        .default('./backups')
    )
    .addOption(
      new Option('-y, --yes', '确认危险操作，不提示')
        .default(false)
    )
    .argument('[migration-name]', '迁移名称 (create 操作使用)')
    .action(async (argName: string | undefined, options: MigrateOptions & { yes: boolean }) => {
      // 如果提供了位置参数，使用它作为名称
      if (argName) {
        options.name = argName;
      }
      await executeMigrate(options);
    });
}

/**
 * 执行迁移命令
 * @param options 命令选项
 */
async function executeMigrate(options: MigrateOptions & { yes?: boolean }): Promise<void> {
  console.log('🗄️  xzxllmGame 数据库迁移工具');
  console.log('═══════════════════════════════\n');

  let storage: SQLiteStorageAdapter | MemoryStorageAdapter | null = null;
  let exitCode = 0;

  try {
    // 加载配置
    const configManager = new ConfigManager();
    const configPath = options.config;

    if (fs.existsSync(configPath)) {
      await configManager.load(configPath);
    } else {
      await configManager.load();
    }

    // 确定数据库路径
    const dbPath = options.database || configManager.get<string>('storage.connectionString', './data/game.db');
    const storageType = configManager.get<string>('storage.type', 'sqlite');

    console.log(`存储类型: ${storageType}`);
    console.log(`数据库路径: ${path.resolve(dbPath)}\n`);

    // 根据不同操作执行不同逻辑
    switch (options.action) {
      case 'status':
        await showStatus(dbPath, storageType);
        break;

      case 'up':
        storage = await initStorage(dbPath, storageType);
        await runMigrationsUp(storage);
        break;

      case 'down':
        storage = await initStorage(dbPath, storageType);
        await runMigrationDown(storage);
        break;

      case 'create':
        if (!options.name) {
          throw new Error('创建迁移需要提供名称，使用: db-migrate create <name>');
        }
        await createMigrationFile(options.name);
        break;

      case 'backup':
        await backupDatabase(dbPath, options.backupDir || './backups');
        break;

      case 'cleanup':
        storage = await initStorage(dbPath, storageType);
        const days = parseInt(options.days || '30', 10);
        await cleanupData(storage, days, options.yes || false);
        break;

      case 'reset':
        if (!options.yes) {
          console.log('⚠️  警告: 重置数据库将删除所有数据！');
          console.log('请使用 --yes 参数确认此操作');
          exitCode = 1;
          break;
        }
        storage = await initStorage(dbPath, storageType);
        await resetDatabase(storage, dbPath);
        break;

      default:
        console.error(`未知操作: ${options.action}`);
        exitCode = 1;
    }

  } catch (error) {
    console.error('\n❌ 操作失败:', error instanceof Error ? error.message : String(error));

    if (options.debug && error instanceof Error && error.stack) {
      console.error('\n调试信息:', error.stack);
    }

    exitCode = 1;
  } finally {
    if (storage) {
      console.log('\n🔌 关闭存储连接...');
      await storage.close();
    }
  }

  process.exit(exitCode);
}

/**
 * 初始化存储适配器
 * @param dbPath 数据库路径
 * @param storageType 存储类型
 * @returns 存储适配器实例
 */
async function initStorage(
  dbPath: string,
  storageType: string
): Promise<SQLiteStorageAdapter | MemoryStorageAdapter> {
  if (storageType === 'memory') {
    console.log('使用内存存储（数据将在程序结束时丢失）');
    return new MemoryStorageAdapter();
  }

  if (storageType === 'sqlite') {
    // 确保目录存在
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const adapter = new SQLiteStorageAdapter({ dbPath });
    await adapter.initialize();
    return adapter;
  }

  throw new Error(`不支持的存储类型: ${storageType}，迁移工具仅支持 sqlite 和 memory`);
}

/**
 * 显示数据库状态
 * @param dbPath 数据库路径
 * @param storageType 存储类型
 */
async function showStatus(dbPath: string, storageType: string): Promise<void> {
  console.log('📊 数据库状态\n');

  // 检查数据库文件
  if (storageType === 'sqlite') {
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      console.log(`✅ 数据库文件存在`);
      console.log(`   路径: ${path.resolve(dbPath)}`);
      console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`   修改时间: ${stats.mtime.toLocaleString()}`);
    } else {
      console.log(`⚠️  数据库文件不存在: ${path.resolve(dbPath)}`);
      console.log(`   将在首次初始化时自动创建`);
    }
  }

  // 尝试连接并获取统计
  try {
    const storage = await initStorage(dbPath, storageType);
    const stats = await storage.getStats();

    console.log('\n📈 数据统计');
    console.log('───────────────────────────────');
    console.log(`玩家档案数: ${stats.totalPlayerProfiles}`);
    console.log(`活跃会话数: ${stats.activeNarrativeSessions}`);
    console.log(`待处理观察: ${stats.pendingObservations}`);
    console.log(`缓冲关卡数: ${stats.bufferedPuzzles}`);
    console.log(`存储占用: ${stats.estimatedSizeMB > 0 ? `${stats.estimatedSizeMB.toFixed(2)} MB` : '未知'}`);

    await storage.close();
  } catch (error) {
    console.log('\n⚠️  无法获取详细统计:', error instanceof Error ? error.message : String(error));
  }

  // 显示迁移历史
  console.log('\n📝 迁移记录');
  console.log('───────────────────────────────');
  console.log('当前版本: 初始版本');
  console.log('（SQLite 适配器使用自动迁移，无需手动管理）');
}

/**
 * 执行所有待执行的迁移
 * @param storage 存储适配器
 */
async function runMigrationsUp(storage: SQLiteStorageAdapter | MemoryStorageAdapter): Promise<void> {
  console.log('🚀 执行数据库迁移...\n');

  // SQLite 适配器使用自动迁移
  console.log('✅ SQLite 适配器使用自动迁移机制');
  console.log('   表结构将在首次使用时自动创建/更新');

  // 执行健康检查
  const health = await storage.healthCheck();
  if (health.healthy) {
    console.log('✅ 数据库健康检查通过');
    console.log(`   响应延迟: ${health.latencyMs}ms`);
  } else {
    console.log('❌ 数据库健康检查失败');
    if (health.details.lastError) {
      console.log(`   错误: ${health.details.lastError}`);
    }
  }
}

/**
 * 回滚最后一条迁移
 * @param storage 存储适配器
 */
async function runMigrationDown(storage: SQLiteStorageAdapter | MemoryStorageAdapter): Promise<void> {
  console.log('⏪ 回滚迁移...\n');
  console.log('⚠️  SQLite 适配器不支持自动回滚');
  console.log('   如需回滚，请手动恢复备份或重置数据库');
  console.log('\n建议操作:');
  console.log('  1. 使用备份恢复: db-migrate backup --action restore');
  console.log('  2. 或重置数据库: db-migrate reset --yes');
}

/**
 * 创建新的迁移文件
 * @param name 迁移名称
 */
async function createMigrationFile(name: string): Promise<void> {
  console.log(`📝 创建迁移文件: ${name}\n`);

  // 清理名称
  const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const filename = `${timestamp}_${cleanName}.sql`;

  // 迁移目录
  const migrationsDir = './migrations';
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  const filepath = path.join(migrationsDir, filename);

  // 迁移文件模板
  const template = `-- Migration: ${name}
-- Created at: ${new Date().toISOString()}

-- UP Migration (执行)
-- 在这里添加你的 schema 变更

-- 示例:
-- CREATE TABLE IF NOT EXISTS example (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   name TEXT NOT NULL,
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
-- );

-- DOWN Migration (回滚)
-- 如果需要回滚，在这里添加反向操作

-- 示例:
-- DROP TABLE IF EXISTS example;
`;

  fs.writeFileSync(filepath, template, 'utf8');
  console.log(`✅ 迁移文件已创建: ${filepath}`);
  console.log('\n提示:');
  console.log('  1. 编辑文件添加你的 schema 变更');
  console.log('  2. 使用 db-migrate --action up 执行迁移');
}

/**
 * 备份数据库
 * @param dbPath 数据库路径
 * @param backupDir 备份目录
 */
async function backupDatabase(dbPath: string, backupDir: string): Promise<void> {
  console.log('💾 备份数据库...\n');

  // 检查数据库文件是否存在
  if (!fs.existsSync(dbPath)) {
    throw new Error(`数据库文件不存在: ${dbPath}`);
  }

  // 确保备份目录存在
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 生成备份文件名
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const dbName = path.basename(dbPath, path.extname(dbPath));
  const backupName = `${dbName}_backup_${timestamp}.db`;
  const backupPath = path.join(backupDir, backupName);

  // 复制文件
  fs.copyFileSync(dbPath, backupPath);

  console.log(`✅ 备份完成`);
  console.log(`   源文件: ${path.resolve(dbPath)}`);
  console.log(`   备份文件: ${path.resolve(backupPath)}`);

  // 显示备份列表
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(`${dbName}_backup_`))
    .sort()
    .reverse();

  console.log(`\n📁 备份列表 (${backupDir}):`);
  console.log('───────────────────────────────');

  if (backups.length === 0) {
    console.log('无备份文件');
  } else {
    backups.slice(0, 10).forEach((backup, index) => {
      const backupFilePath = path.join(backupDir, backup);
      const stats = fs.statSync(backupFilePath);
      const size = (stats.size / 1024).toFixed(2);
      console.log(`  ${index + 1}. ${backup} (${size} KB)`);
    });

    if (backups.length > 10) {
      console.log(`  ... 还有 ${backups.length - 10} 个备份`);
    }
  }
}

/**
 * 清理过期数据
 * @param storage 存储适配器
 * @param days 天数阈值
 * @param yes 是否确认
 */
async function cleanupData(
  storage: SQLiteStorageAdapter | MemoryStorageAdapter,
  days: number,
  yes: boolean
): Promise<void> {
  console.log('🧹 清理过期数据...\n');
  console.log(`清理阈值: ${days} 天前的数据`);

  if (!yes) {
    console.log('\n⚠️  此操作将永久删除数据！');
    console.log('请使用 --yes 参数确认，或使用 --days 调整阈值');
    return;
  }

  // 获取清理前的统计
  const statsBefore = await storage.getStats();
  console.log('\n清理前统计:');
  console.log(`  待处理观察: ${statsBefore.pendingObservations}`);
  console.log(`  缓冲关卡: ${statsBefore.bufferedPuzzles}`);

  // 执行清理
  console.log('\n执行清理操作...');

  const cleanedObservations = await storage.cleanupOldObservations(days);
  console.log(`  ✓ 清理观察记录: ${cleanedObservations} 条`);

  const cleanedPuzzles = await storage.cleanupOldPuzzles(24, undefined); // 24小时
  console.log(`  ✓ 清理过期关卡: ${cleanedPuzzles} 个`);

  // 获取清理后的统计
  const statsAfter = await storage.getStats();
  console.log('\n清理后统计:');
  console.log(`  待处理观察: ${statsAfter.pendingObservations}`);
  console.log(`  缓冲关卡: ${statsAfter.bufferedPuzzles}`);

  console.log('\n✅ 清理完成');
}

/**
 * 重置数据库
 * @param storage 存储适配器
 * @param dbPath 数据库路径
 */
async function resetDatabase(
  storage: SQLiteStorageAdapter | MemoryStorageAdapter,
  dbPath: string
): Promise<void> {
  console.log('🗑️  重置数据库...\n');

  // 清除所有数据
  await storage.clear();
  console.log('✅ 已清除所有数据');

  // 如果是 SQLite，也可以删除文件重新创建
  if (storage instanceof SQLiteStorageAdapter && fs.existsSync(dbPath)) {
    // 关闭连接
    await storage.close();

    // 删除文件
    fs.unlinkSync(dbPath);
    console.log(`✅ 已删除数据库文件: ${dbPath}`);

    // 重新初始化
    }

  console.log('\n⚠️  数据库已重置为初始状态');
}
