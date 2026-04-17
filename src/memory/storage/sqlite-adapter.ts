// src/memory/storage/sqlite-adapter.ts
/**
 * @fileoverview SQLite 存储适配器
 * @description 使用 better-sqlite3 的高性能 SQLite 实现
 * @module memory/storage/sqlite
 * 
 * 特点：
 * - 本地文件存储，零配置
 * - 支持 WAL 模式（并发性能）
 * - 自动迁移（创建表和索引）
 * - 事务支持（保证数据一致性）
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import {
  BaseStorageAdapter,
  StorageOptions,
  StorageQuery,
  StorageItem,
  HealthStatus,
  StorageStats,
  BufferedPuzzle
} from './base-storage.js';
import {
  PlayerProfile,
  NarrativeState,
  DialogueObservation,
  AIMood,
  RelationshipStage,
  LevelStructure
} from '../../core/interfaces/base.types.js';

/**
 * SQLite 存储配置
 */
export interface SQLiteConfig extends Record<string, unknown> {
  /** 数据库文件路径 */
  dbPath: string;
  /** 是否启用 WAL 模式（默认 true） */
  enableWAL?: boolean;
  /** 是否启用外键约束（默认 true） */
  enableForeignKeys?: boolean;
  /** 是否只读模式（默认 false） */
  readonly?: boolean;
  /** 页面大小（默认 4096） */
  pageSize?: number;
  /** 缓存大小（页数，默认 2000） */
  cacheSize?: number;
}

/**
 * SQLite 存储适配器
 * 
 * 表结构：
 * - player_profiles: 玩家画像（长期数据）
 * - narrative_states: 叙事状态（会话级临时数据）
 * - observations: 观察记录（原始事件日志）
 * - puzzle_buffer: 关卡缓冲池（预生成关卡队列）
 */
export class SQLiteStorageAdapter extends BaseStorageAdapter {
  readonly storageType = 'sqlite';
  
  /** better-sqlite3 数据库实例 */
  private db: Database | null = null;

  /** 数据库文件路径 */
  private dbPath: string;

  /** 配置选项 */
  private options: SQLiteConfig;

  constructor(config: SQLiteConfig) {
    super(config);
    this.dbPath = config.dbPath;
    this.options = {
      enableWAL: true,
      enableForeignKeys: true,
      readonly: false,
      pageSize: 4096,
      cacheSize: 2000,
      ...config
    };
  }

  /**
   * 初始化数据库
   * 流程：
   * 1. 确保目录存在
   * 2. 打开数据库连接
   * 3. 应用 PRAGMA 设置（WAL 模式等）
   * 4. 创建表和索引（迁移）
   */
  async initialize(): Promise<void> {
    // 1. 确保目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 2. 打开数据库（better-sqlite3 是同步的，但包装为 async 以符合接口）
    const openOptions: { readonly?: boolean } = {};
    if (this.options.readonly) {
      openOptions.readonly = true;
    }

    this.db = new Database(this.dbPath, openOptions);

    // 3. 应用 SQLite 优化设置
    this.applyPragmas();

    // 4. 创建表结构
    this.createTables();

    // 5. 创建索引
    this.createIndexes();

    // 设置初始化时间
    this.initializedAt = new Date();

    console.log(`[SQLite] Database initialized at ${this.dbPath}`);

    // 定期清理（每小时清理一次过期关卡）
    setInterval(() => this.cleanupOldPuzzles(), 60 * 60 * 1000);
  }

  /**
   * 应用 SQLite PRAGMA 设置
   * 优化性能和可靠性
   */
  private applyPragmas(): void {
    if (!this.db) return;

    // WAL 模式：提高并发写入性能
    if (this.options.enableWAL) {
      this.db.pragma('journal_mode = WAL');
    }

    // 外键约束：维护数据完整性
    if (this.options.enableForeignKeys) {
      this.db.pragma('foreign_keys = ON');
    }

    // 同步模式：NORMAL 平衡性能和可靠性
    this.db.pragma('synchronous = NORMAL');

    // 页面大小
    if (this.options.pageSize) {
      this.db.pragma(`page_size = ${this.options.pageSize}`);
    }

    // 缓存大小
    if (this.options.cacheSize) {
      this.db.pragma(`cache_size = -${this.options.cacheSize}`); // 负值表示页数
    }

    // 临时表存储：内存（速度）vs 文件（安全）
    this.db.pragma('temp_store = memory');
    
    // 内存映射 I/O（大页面时提升性能）
    this.db.pragma('mmap_size = 30000000000'); // ~30GB
  }

  /**
   * 创建数据库表结构
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // 使用事务批量执行 DDL
    this.db.exec(`
      -- ========================================
      -- 玩家画像表：长期学习数据，用于 DDDA
      -- ========================================
      CREATE TABLE IF NOT EXISTS player_profiles (
        player_id TEXT PRIMARY KEY,
        
        -- 技能评估
        skill_rating REAL DEFAULT 0.5 CHECK (skill_rating >= 0 AND skill_rating <= 1),
        skill_dimensions TEXT DEFAULT '{}', -- JSON: {spatial: 0.8, logic: 0.6...}
        
        -- 偏好与情感
        preferred_types TEXT DEFAULT '[]', -- JSON 数组: ["pushbox", "laser-mirror"]
        frustration_level REAL DEFAULT 0.0 CHECK (frustration_level >= 0 AND frustration_level <= 1),
        
        -- 连胜/败统计
        win_streak INTEGER DEFAULT 0,
        lose_streak INTEGER DEFAULT 0,
        total_wins INTEGER DEFAULT 0,
        total_losses INTEGER DEFAULT 0,
        
        -- 关系进展
        relationship_stage TEXT DEFAULT 'rivals' CHECK (relationship_stage IN ('rivals', 'frenemies', 'respect', 'mentor')),
        
        -- 统计信息
        total_play_time INTEGER DEFAULT 0, -- 分钟
        completed_levels INTEGER DEFAULT 0,
        
        -- 时间戳
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ========================================
      -- 叙事状态表：会话级临时状态
      -- ========================================
      CREATE TABLE IF NOT EXISTS narrative_states (
        session_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        
        -- AI 状态
        current_mood TEXT DEFAULT 'playful' CHECK (current_mood IN ('playful', 'stubborn', 'concerned', 'impressed', 'mysterious')),
        generation_status TEXT DEFAULT 'idle' CHECK (generation_status IN ('idle', 'designing', 'generating', 'ready', 'error')),
        
        -- 叙事进展
        ai_impression TEXT DEFAULT '',
        ongoing_plot TEXT DEFAULT 'beginning',
        world_state TEXT DEFAULT '{}', -- JSON: 持久化的世界状态（剧情选择）
        session_history TEXT DEFAULT '[]', -- JSON 数组: 本次会话事件
        
        -- 生成缓存
        last_puzzle_difficulty REAL,
        generated_intro TEXT,
        
        -- 时间戳
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- 外键约束
        FOREIGN KEY (player_id) REFERENCES player_profiles(player_id) ON DELETE CASCADE
      );

      -- ========================================
      -- 观察记录表：原始事件日志（可定期归档）
      -- ========================================
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        
        -- 关联信息
        session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        level_id TEXT,
        
        -- 观察内容
        observation_type TEXT NOT NULL CHECK (observation_type IN ('sentiment', 'strategy', 'frustration', 'completion', 'system')),
        content TEXT NOT NULL, -- 摘要/分析结果
        raw_quote TEXT, -- 玩家原话（可选）
        
        -- 元数据
        importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
        sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
        processed INTEGER DEFAULT 0, -- 0=未处理, 1=已处理
        
        -- 时间戳
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- 外键
        FOREIGN KEY (session_id) REFERENCES narrative_states(session_id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES player_profiles(player_id) ON DELETE CASCADE
      );

      -- ========================================
      -- 关卡缓冲池表：预生成关卡队列（FIFO）
      -- ========================================
      CREATE TABLE IF NOT EXISTS puzzle_buffer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- 关联信息
        session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,

        -- 关卡数据
        puzzle_data TEXT NOT NULL, -- JSON 序列化的 LevelStructure
        difficulty_score REAL NOT NULL,
        intended_mood TEXT NOT NULL,
        game_types TEXT NOT NULL, -- JSON 数组，包含的小游戏类型

        -- 状态
        consumed INTEGER DEFAULT 0, -- 0=待消费, 1=已消费
        consumed_at DATETIME,

        -- 时间戳
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- 存储选项
        priority INTEGER DEFAULT 0, -- 优先级，影响消费顺序
        tags TEXT DEFAULT '[]', -- JSON 数组，标签分类
        expires_at DATETIME, -- 过期时间 (NULL 表示永不过期)

        -- 外键
        FOREIGN KEY (session_id) REFERENCES narrative_states(session_id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES player_profiles(player_id) ON DELETE CASCADE
      );

      -- ========================================
      -- 通用键值存储表：用于通用KV操作
      -- ========================================
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,

        -- 存储值 (JSON序列化)
        value TEXT NOT NULL,

        -- 元数据
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- 过期时间 (NULL 表示永不过期)
        expires_at DATETIME,

        -- 标签 (JSON数组，用于分类)
        tags TEXT DEFAULT '[]'
      );

      -- 触发器：自动更新时间戳
      CREATE TRIGGER IF NOT EXISTS update_player_profiles_timestamp 
      AFTER UPDATE ON player_profiles
      BEGIN
        UPDATE player_profiles SET updated_at = CURRENT_TIMESTAMP WHERE player_id = NEW.player_id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_narrative_states_timestamp 
      AFTER UPDATE ON narrative_states
      BEGIN
        UPDATE narrative_states SET updated_at = CURRENT_TIMESTAMP WHERE session_id = NEW.session_id;
      END;
    `);
  }

  /**
   * 创建性能优化索引
   */
  private createIndexes(): void {
    if (!this.db) return;

    this.db.exec(`
      -- 观察记录索引
      CREATE INDEX IF NOT EXISTS idx_observations_processed ON observations(processed);
      CREATE INDEX IF NOT EXISTS idx_observations_session_time ON observations(session_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_observations_player_type ON observations(player_id, observation_type);
      CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp DESC);

      -- 关卡缓冲池索引
      CREATE INDEX IF NOT EXISTS idx_puzzle_session_consumed ON puzzle_buffer(session_id, consumed, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_puzzle_created ON puzzle_buffer(created_at);

      -- 叙事状态索引
      CREATE INDEX IF NOT EXISTS idx_narrative_player ON narrative_states(player_id);
      CREATE INDEX IF NOT EXISTS idx_narrative_updated ON narrative_states(updated_at DESC);

      -- 通用键值存储索引
      CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv_store(expires_at);
      CREATE INDEX IF NOT EXISTS idx_kv_updated ON kv_store(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_kv_created ON kv_store(created_at DESC);
    `);
  }

  // ==================== 玩家画像实现 ====================

  async getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare('SELECT * FROM player_profiles WHERE player_id = ?');
    const row = stmt.get(playerId) as any;
    
    if (!row) return null;
    
    return this.rowToPlayerProfile(row);
  }

  async updatePlayerProfile(playerId: string, updates: Partial<PlayerProfile>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    // 构建动态 SQL
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.skillRating !== undefined) {
      fields.push('skill_rating = ?');
      values.push(updates.skillRating);
    }
    if (updates.skillDimensions !== undefined) {
      fields.push('skill_dimensions = ?');
      values.push(JSON.stringify(updates.skillDimensions));
    }
    if (updates.preferredTypes !== undefined) {
      fields.push('preferred_types = ?');
      values.push(JSON.stringify(updates.preferredTypes));
    }
    if (updates.frustrationLevel !== undefined) {
      fields.push('frustration_level = ?');
      values.push(updates.frustrationLevel);
    }
    if (updates.winStreak !== undefined) {
      fields.push('win_streak = ?');
      values.push(updates.winStreak);
    }
    if (updates.loseStreak !== undefined) {
      fields.push('lose_streak = ?');
      values.push(updates.loseStreak);
    }
    if (updates.relationshipStage !== undefined) {
      fields.push('relationship_stage = ?');
      values.push(updates.relationshipStage);
    }
    if (updates.totalPlayTime !== undefined) {
      fields.push('total_play_time = ?');
      values.push(updates.totalPlayTime);
    }
    if (updates.completedLevels !== undefined) {
      fields.push('completed_levels = ?');
      values.push(updates.completedLevels);
    }
    
    if (fields.length === 0) return;
    
    values.push(playerId);
    
    const sql = `UPDATE player_profiles SET ${fields.join(', ')} WHERE player_id = ?`;
    this.db.prepare(sql).run(...values);
  }

  // ==================== 叙事状态实现 ====================

  async getNarrativeState(sessionId: string): Promise<NarrativeState | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare('SELECT * FROM narrative_states WHERE session_id = ?');
    const row = stmt.get(sessionId) as any;
    
    if (!row) return null;
    
    return {
      sessionId: row.session_id,
      playerId: row.player_id,
      currentMood: row.current_mood,
      generationStatus: row.generation_status,
      aiImpression: row.ai_impression,
      ongoingPlot: row.ongoing_plot,
      worldState: JSON.parse(row.world_state || '{}'),
      sessionHistory: JSON.parse(row.session_history || '[]'),
      lastPuzzleDifficulty: row.last_puzzle_difficulty,
      generatedIntro: row.generated_intro,
      updatedAt: row.updated_at
    };
  }

  async updateNarrativeState(sessionId: string, updates: Partial<NarrativeState>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.currentMood !== undefined) {
      fields.push('current_mood = ?');
      values.push(updates.currentMood);
    }
    if (updates.generationStatus !== undefined) {
      fields.push('generation_status = ?');
      values.push(updates.generationStatus);
    }
    if (updates.aiImpression !== undefined) {
      fields.push('ai_impression = ?');
      values.push(updates.aiImpression);
    }
    if (updates.ongoingPlot !== undefined) {
      fields.push('ongoing_plot = ?');
      values.push(updates.ongoingPlot);
    }
    if (updates.worldState !== undefined) {
      fields.push('world_state = ?');
      values.push(JSON.stringify(updates.worldState));
    }
    if (updates.sessionHistory !== undefined) {
      fields.push('session_history = ?');
      values.push(JSON.stringify(updates.sessionHistory));
    }
    if (updates.lastPuzzleDifficulty !== undefined) {
      fields.push('last_puzzle_difficulty = ?');
      values.push(updates.lastPuzzleDifficulty);
    }
    if (updates.generatedIntro !== undefined) {
      fields.push('generated_intro = ?');
      values.push(updates.generatedIntro);
    }
    
    if (fields.length === 0) return;
    
    values.push(sessionId);
    
    const sql = `UPDATE narrative_states SET ${fields.join(', ')} WHERE session_id = ?`;
    this.db.prepare(sql).run(...values);
  }

  // ==================== 观察记录实现 ====================

  async submitObservation(obs: Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'> & { playerId?: string; levelId?: string }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO observations
      (session_id, player_id, level_id, observation_type, content, raw_quote, importance, sentiment, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      obs.sessionId,
      obs.playerId,
      obs.levelId || null,
      obs.observationType,
      obs.content,
      obs.rawQuote || null,
      obs.importance || 5,
      obs.sentiment || null,
      0  // 默认未处理
    );
  }

  async getUnprocessedObservations(limit: number = 50): Promise<DialogueObservation[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(`
      SELECT * FROM observations 
      WHERE processed = 0 
      ORDER BY importance DESC, timestamp DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.rowToObservation(row));
  }

  async markObservationsProcessed(ids: number[]): Promise<void> {
    if (!this.db || ids.length === 0) return;
    
    const stmt = this.db.prepare('UPDATE observations SET processed = 1 WHERE id = ?');
    
    // 使用事务批量更新
    const transaction = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        stmt.run(id);
      }
    });
    
    transaction(ids);
  }

  async getPlayerObservations(
    playerId: string,
    limit: number = 50,
    types?: string[]
  ): Promise<DialogueObservation[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    let sql = 'SELECT * FROM observations WHERE player_id = ?';
    const params: any[] = [playerId];
    
    if (types && types.length > 0) {
      sql += ` AND observation_type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }
    
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => this.rowToObservation(row));
  }

  // ==================== 关卡缓冲池实现 ====================

  async storePuzzle(
    sessionId: string,
    puzzleData: LevelStructure | object,
    difficulty: number,
    mood: string,
    options?: StorageOptions
  ): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    // 从 puzzleData 中提取游戏类型
    const data = puzzleData as any;
    const gameTypes = JSON.stringify(data.miniGames?.map((g: any) => g.type) || []);

    // 处理存储选项
    const priority = options?.priority || 0;
    const tags = options?.tags ? JSON.stringify(options.tags) : '[]';
    let expiresAt = null;
    if (options?.ttl && options.ttl > 0) {
      const expiresDate = new Date(Date.now() + options.ttl);
      expiresAt = expiresDate.toISOString();
    }

    const stmt = this.db.prepare(`
      INSERT INTO puzzle_buffer
      (session_id, player_id, puzzle_data, difficulty_score, intended_mood, game_types, priority, tags, expires_at)
      SELECT ?, player_id, ?, ?, ?, ?, ?, ?, ?
      FROM narrative_states
      WHERE session_id = ?
    `);

    const result = stmt.run(
      sessionId,
      JSON.stringify(puzzleData),
      difficulty,
      mood,
      gameTypes,
      priority,
      tags,
      expiresAt,
      sessionId
    );

    // 返回关卡ID (数字转为字符串)
    return result.lastInsertRowid.toString();
  }

  async consumeNextPuzzle(
    sessionId: string,
    filter?: { tags?: string[]; maxDifficulty?: number }
  ): Promise<BufferedPuzzle | null> {
    if (!this.db) throw new Error('Database not initialized');

    // 使用事务确保原子性（取出一个并标记为已消费）
    const transaction = this.db.transaction((sid: string) => {
      // 构建查询条件
      let sql = `
        SELECT * FROM puzzle_buffer
        WHERE session_id = ?
          AND consumed = 0
          AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
      `;
      const params: any[] = [sid];

      // 难度过滤
      if (filter?.maxDifficulty !== undefined) {
        sql += ' AND difficulty_score <= ?';
        params.push(filter.maxDifficulty);
      }

      // 标签过滤 (JSON数组包含检查)
      if (filter?.tags && filter.tags.length > 0) {
        // 对于每个标签，检查 tags JSON 数组是否包含该标签
        // SQLite 没有内置的JSON包含函数，使用 LIKE 近似匹配
        const tagConditions = filter.tags.map(tag => `tags LIKE ?`);
        sql += ` AND (${tagConditions.join(' OR ')})`;
        params.push(...filter.tags.map(tag => `%"${tag}"%`));
      }

      // 排序：优先级高优先，同优先级按创建时间先后
      sql += ' ORDER BY priority DESC, created_at ASC LIMIT 1';

      const selectStmt = this.db!.prepare(sql);
      const row = selectStmt.get(...params) as any;

      if (!row) return null;

      // 标记为已消费
      const updateStmt = this.db!.prepare(`
        UPDATE puzzle_buffer
        SET consumed = 1, consumed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run(row.id);

      return row;
    });

    const row = transaction(sessionId) as any;
    if (!row) return null;

    try {
      const puzzleData = JSON.parse(row.puzzle_data);
      const tags = JSON.parse(row.tags || '[]');

      const bufferedPuzzle: BufferedPuzzle = {
        id: row.id.toString(),
        puzzleData: puzzleData,
        difficulty: row.difficulty_score,
        mood: row.intended_mood,
        createdAt: row.created_at,
        consumed: row.consumed === 1,
        consumedAt: row.consumed_at || undefined,
        sessionId: row.session_id,
        tags: tags.length > 0 ? tags : undefined
      };

      return bufferedPuzzle;
    } catch (error) {
      console.error('Failed to parse puzzle data:', error);
      return null;
    }
  }

  async getPendingPuzzleCount(sessionId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM puzzle_buffer 
      WHERE session_id = ? AND consumed = 0
    `);
    
    const result = stmt.get(sessionId) as { count: number };
    return result.count;
  }

  async cleanupOldPuzzles(maxAgeHours: number = 24): Promise<number> {
    if (!this.db) return 0;
    
    const stmt = this.db.prepare(`
      DELETE FROM puzzle_buffer 
      WHERE consumed = 0 
      AND created_at < datetime('now', '-${maxAgeHours} hours')
    `);
    
    const result = stmt.run();
    if (result.changes > 0) {
      console.log(`[SQLite] Cleaned up ${result.changes} old puzzles`);
    }
    return result.changes;
  }

  // ==================== 会话管理实现 ====================

  async getActiveSessions(hours: number = 1): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(`
      SELECT DISTINCT session_id FROM (
        SELECT session_id FROM observations 
        WHERE timestamp > datetime('now', '-${hours} hours')
        UNION
        SELECT session_id FROM puzzle_buffer 
        WHERE consumed = 0 AND created_at > datetime('now', '-${hours} hours')
        UNION
        SELECT session_id FROM narrative_states 
        WHERE updated_at > datetime('now', '-${hours} hours')
      )
    `);
    
    const rows = stmt.all() as Array<{ session_id: string }>;
    return [...new Set(rows.map(r => r.session_id))];
  }

  // ==================== 工具方法 ====================

  async healthCheck(): Promise<HealthStatus> {
    const now = new Date().toISOString();

    try {
      if (!this.db) {
        return {
          healthy: false,
          latencyMs: -1,
          checkedAt: now,
          details: {
            connected: false,
            lastError: 'Database not initialized'
          }
        };
      }

      const startTime = Date.now();
      // 简单查询测试
      this.db.prepare('SELECT 1').get();
      const latencyMs = Date.now() - startTime;

      // 检查数据库文件大小和状态
      let diskSpaceAvailable = true;
      try {
        const stats = fs.statSync(this.dbPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        // 假设如果文件大小超过 1GB 可能有空间问题
        if (fileSizeMB > 1024) {
          diskSpaceAvailable = false;
        }
      } catch (error) {
        // 无法检查磁盘空间
      }

      const details: HealthStatus['details'] = {
        connected: true
      };
      if (diskSpaceAvailable !== undefined) {
        details.diskSpaceAvailable = diskSpaceAvailable;
      }
      details.memoryPressure = false;
      // lastError 被省略，因为它是 undefined

      return {
        healthy: true,
        latencyMs,
        checkedAt: now,
        details
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: -1,
        checkedAt: now,
        details: {
          connected: false,
          lastError: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      // 检查点（WAL 模式下的同步）
      this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
      this.db.close();
      this.db = null;
      console.log('[SQLite] Connection closed');
    }
  }

  /**
   * 数据库行转换为 PlayerProfile 对象
   */
  private rowToPlayerProfile(row: any): PlayerProfile {
    return {
      playerId: row.player_id,
      skillRating: row.skill_rating,
      skillDimensions: JSON.parse(row.skill_dimensions || '{}'),
      preferredTypes: JSON.parse(row.preferred_types || '[]'),
      frustrationLevel: row.frustration_level,
      winStreak: row.win_streak,
      loseStreak: row.lose_streak,
      relationshipStage: row.relationship_stage,
      totalPlayTime: row.total_play_time,
      completedLevels: row.completed_levels,
      lastUpdated: row.updated_at,
      createdAt: row.created_at
    };
  }

  /**
   * 数据库行转换为 DialogueObservation 对象
   */
  private rowToObservation(row: any): DialogueObservation {
    return {
      id: row.id,
      sessionId: row.session_id,
      playerId: row.player_id,
      levelId: row.level_id,
      observationType: row.observation_type,
      content: row.content,
      rawQuote: row.raw_quote,
      importance: row.importance,
      sentiment: row.sentiment,
      processed: row.processed === 1,
      timestamp: row.timestamp
    };
  }

  // ==================== 通用KV存储实现 ====================

  private async cleanupExpiredKeys(): Promise<void> {
    if (!this.db) return;
    const stmt = this.db.prepare('DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP');
    stmt.run();
  }

  async set<T>(key: string, value: T, options?: StorageOptions): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // 清理过期键
      await this.cleanupExpiredKeys();

      const now = new Date().toISOString();
      const ttl = options?.ttl;
      let expiresAt = null;
      if (ttl && ttl > 0) {
        const expiresDate = new Date(Date.now() + ttl);
        expiresAt = expiresDate.toISOString();
      }

      const tags = options?.tags ? JSON.stringify(options.tags) : '[]';
      const serializedValue = JSON.stringify(value);

      const stmt = this.db.prepare(`
        INSERT INTO kv_store (key, value, created_at, updated_at, expires_at, tags)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          tags = excluded.tags
      `);

      stmt.run(key, serializedValue, now, now, expiresAt, tags);
      return true;
    } catch (error) {
      console.error(`[SQLite] Set failed for key "${key}":`, error);
      return false;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    // 清理过期键
    await this.cleanupExpiredKeys();

    const stmt = this.db.prepare('SELECT value FROM kv_store WHERE key = ? AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)');
    const row = stmt.get(key) as any;

    if (!row) return undefined;

    try {
      return JSON.parse(row.value) as T;
    } catch (error) {
      console.error(`[SQLite] JSON parse failed for key "${key}":`, error);
      return undefined;
    }
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    if (!this.db) throw new Error('Database not initialized');

    // 清理过期键
    await this.cleanupExpiredKeys();

    const result = new Map<string, T>();

    if (keys.length === 0) return result;

    // 构建参数占位符
    const placeholders = keys.map(() => '?').join(',');
    const sql = `SELECT key, value FROM kv_store WHERE key IN (${placeholders}) AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)`;
    const stmt = this.db.prepare(sql);

    const rows = stmt.all(...keys) as Array<{ key: string; value: string }>;

    for (const row of rows) {
      try {
        result.set(row.key, JSON.parse(row.value) as T);
      } catch (error) {
        console.error(`[SQLite] JSON parse failed for key "${row.key}":`, error);
      }
    }

    return result;
  }

  async setMany<T>(
    entries: Array<{ key: string; value: T }>,
    options?: StorageOptions
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 清理过期键
    await this.cleanupExpiredKeys();

    const now = new Date().toISOString();
    const ttl = options?.ttl;
    let expiresAt = null;
    if (ttl && ttl > 0) {
      const expiresDate = new Date(Date.now() + ttl);
      expiresAt = expiresDate.toISOString();
    }

    const tags = options?.tags ? JSON.stringify(options.tags) : '[]';

    const transaction = this.db.transaction((items: Array<{ key: string; value: T }>) => {
      const stmt = this.db!.prepare(`
        INSERT INTO kv_store (key, value, created_at, updated_at, expires_at, tags)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          tags = excluded.tags
      `);

      for (const { key, value } of items) {
        const serializedValue = JSON.stringify(value);
        stmt.run(key, serializedValue, now, now, expiresAt, tags);
      }
    });

    transaction(entries);
  }

  async delete(key: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM kv_store WHERE key = ?');
    const result = stmt.run(key);
    return result.changes > 0;
  }

  async query<T>(query: StorageQuery<T>): Promise<StorageItem<T>[]> {
    if (!this.db) throw new Error('Database not initialized');

    // 清理过期键
    await this.cleanupExpiredKeys();

    let sql = 'SELECT * FROM kv_store WHERE 1=1';
    const params: any[] = [];

    // 前缀匹配
    if (query.prefix) {
      sql += ' AND key LIKE ?';
      params.push(`${query.prefix}%`);
    }

    // 时间范围过滤
    if (query.since) {
      sql += ' AND updated_at >= ?';
      params.push(new Date(query.since).toISOString());
    }

    if (query.until) {
      sql += ' AND updated_at <= ?';
      params.push(new Date(query.until).toISOString());
    }

    // 过滤掉已过期的
    sql += ' AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)';

    // 排序
    if (query.orderBy) {
      const orderByField = query.orderBy === 'createdAt' ? 'created_at' :
                          query.orderBy === 'updatedAt' ? 'updated_at' :
                          query.orderBy === 'key' ? 'key' : 'created_at';
      sql += ` ORDER BY ${orderByField} ${query.order === 'desc' ? 'DESC' : 'ASC'}`;
    }

    // 限制数量
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<any>;

    const results: StorageItem<T>[] = [];

    for (const row of rows) {
      try {
        const value = JSON.parse(row.value) as T;

        // 值过滤函数
        if (query.filter && !query.filter(value)) {
          continue;
        }

        results.push({
          key: row.key,
          value: value,
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime()
        });
      } catch (error) {
        console.error(`[SQLite] JSON parse failed for key "${row.key}":`, error);
      }
    }

    return results;
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(() => {
      this.db!.exec('DELETE FROM kv_store');
      this.db!.exec('DELETE FROM player_profiles');
      this.db!.exec('DELETE FROM narrative_states');
      this.db!.exec('DELETE FROM observations');
      this.db!.exec('DELETE FROM puzzle_buffer');
    });

    transaction();
  }

  async has(key: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    // 清理过期键
    await this.cleanupExpiredKeys();

    const stmt = this.db.prepare('SELECT 1 FROM kv_store WHERE key = ? AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)');
    const row = stmt.get(key) as any;
    return !!row;
  }

  async keys(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    // 清理过期键
    await this.cleanupExpiredKeys();

    const stmt = this.db.prepare('SELECT key FROM kv_store WHERE expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP');
    const rows = stmt.all() as Array<{ key: string }>;
    return rows.map(row => row.key);
  }

  async export<T>(filter?: (key: string) => boolean): Promise<Record<string, T>> {
    if (!this.db) throw new Error('Database not initialized');

    // 清理过期键
    await this.cleanupExpiredKeys();

    const stmt = this.db.prepare('SELECT key, value FROM kv_store WHERE expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP');
    const rows = stmt.all() as Array<{ key: string; value: string }>;

    const result: Record<string, T> = {};

    for (const row of rows) {
      if (filter && !filter(row.key)) continue;

      try {
        result[row.key] = JSON.parse(row.value) as T;
      } catch (error) {
        console.error(`[SQLite] JSON parse failed for key "${row.key}":`, error);
      }
    }

    return result;
  }

  async import<T>(
    data: Record<string, T>,
    options?: { ttl?: number; skipExisting?: boolean }
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const entries = Object.entries(data).map(([key, value]) => ({ key, value }));
    const storageOptions: StorageOptions = {};
    if (options?.ttl !== undefined) {
      storageOptions.ttl = options.ttl;
    }
    await this.setMany(entries, storageOptions);
  }

  // ==================== 其他业务方法实现 ====================

  async createPlayerProfileIfNotExists(playerId: string): Promise<PlayerProfile> {
    const existing = await this.getPlayerProfile(playerId);
    if (existing) return existing;

    // 创建符合游戏设定的默认档案
    const newProfile: PlayerProfile = {
      playerId,
      skillRating: 0.5,           // 中等初始技能
      preferredTypes: [],         // 无初始偏好
      frustrationLevel: 0,        // 无挫败感
      winStreak: 0,               // 连胜纪录
      loseStreak: 0,              // 连败纪录
      relationshipStage: RelationshipStage.RIVALS, // 叙事设定：AI与玩家是对手关系
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    // 创建玩家档案
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO player_profiles
      (player_id, skill_rating, preferred_types, frustration_level, win_streak, lose_streak, relationship_stage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      newProfile.playerId,
      newProfile.skillRating,
      JSON.stringify(newProfile.preferredTypes),
      newProfile.frustrationLevel,
      newProfile.winStreak,
      newProfile.loseStreak,
      newProfile.relationshipStage
    );

    return newProfile;
  }

  async createNarrativeStateIfNotExists(sessionId: string, playerId: string): Promise<NarrativeState> {
    const existing = await this.getNarrativeState(sessionId);
    if (existing) return existing;

    const newState: NarrativeState = {
      sessionId,
      playerId,
      currentMood: AIMood.PLAYFUL,      // 初始情绪：轻松玩闹
      generationStatus: 'idle',    // 初始状态：空闲
      aiImpression: '',            // 初始印象：空
      ongoingPlot: 'beginning',    // 剧情线：开始
      worldState: {},              // 世界观状态：空对象
      updatedAt: new Date().toISOString()
    };

    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO narrative_states
      (session_id, player_id, current_mood, generation_status, ai_impression, ongoing_plot, world_state)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      newState.sessionId,
      newState.playerId,
      newState.currentMood,
      newState.generationStatus,
      newState.aiImpression,
      newState.ongoingPlot,
      JSON.stringify(newState.worldState)
    );

    return newState;
  }

  async getCurrentMood(sessionId: string): Promise<string | null> {
    const state = await this.getNarrativeState(sessionId);
    return state?.currentMood ?? null;
  }

  async submitObservationsBatch(
    observations: Array<Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'> & { playerId?: string; levelId?: string }>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction((obsList: Array<Omit<DialogueObservation, 'id' | 'timestamp' | 'processed'> & { playerId?: string; levelId?: string }>) => {
      const stmt = this.db!.prepare(`
        INSERT INTO observations
        (session_id, player_id, level_id, observation_type, content, raw_quote, importance, sentiment, processed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const obs of obsList) {
        // 注意：这里需要从sessionId获取playerId，但当前接口不支持
        // 暂时使用空字符串作为playerId
        stmt.run(
          obs.sessionId,
          '', // playerId 暂时为空，需要修复
          (obs as any).levelId || null,
          obs.observationType,
          obs.content,
          (obs as any).rawQuote || null,
          (obs as any).importance || 5,
          (obs as any).sentiment || null,
          0
        );
      }
    });

    transaction(observations);
  }

  async getStats(): Promise<StorageStats> {
    if (!this.db) throw new Error('Database not initialized');

    const timestamp = new Date().toISOString();

    // 查询各种统计
    const totalPlayerProfiles = this.db.prepare('SELECT COUNT(*) as count FROM player_profiles').get() as { count: number };
    const pendingObservations = this.db.prepare('SELECT COUNT(*) as count FROM observations WHERE processed = 0').get() as { count: number };
    const bufferedPuzzles = this.db.prepare('SELECT COUNT(*) as count FROM puzzle_buffer WHERE consumed = 0').get() as { count: number };

    // 活跃会话 (最近1小时有活动)
    const activeNarrativeSessions = this.db.prepare(`
      SELECT COUNT(DISTINCT session_id) as count FROM (
        SELECT session_id FROM observations WHERE timestamp > datetime('now', '-1 hour')
        UNION
        SELECT session_id FROM narrative_states WHERE updated_at > datetime('now', '-1 hour')
        UNION
        SELECT session_id FROM puzzle_buffer WHERE created_at > datetime('now', '-1 hour')
      )
    `).get() as { count: number };

    // 估计数据库大小 (粗略估计)
    let estimatedSizeMB = -1;
    try {
      const stats = fs.statSync(this.dbPath);
      estimatedSizeMB = Math.round(stats.size / (1024 * 1024) * 100) / 100;
    } catch (error) {
      // 无法获取文件大小
    }

    // 运行时长 (从初始化时间计算)
    let uptime = -1;
    if (this.initializedAt) {
      uptime = Math.floor((Date.now() - this.initializedAt.getTime()) / 1000);
    }

    return {
      totalPlayerProfiles: totalPlayerProfiles.count,
      activeNarrativeSessions: activeNarrativeSessions.count,
      pendingObservations: pendingObservations.count,
      bufferedPuzzles: bufferedPuzzles.count,
      estimatedSizeMB,
      operations: {
        reads: 0, // 需要在实际操作中跟踪
        writes: 0,
        deletes: 0,
        errors: 0
      },
      timestamp,
      storageType: 'sqlite',
      uptime
    };
  }
}