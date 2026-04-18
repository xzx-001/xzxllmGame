import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { BaseStorageAdapter } from './base-storage.js';
import { AIMood, RelationshipStage } from '../../core/interfaces/base.types.js';
export class SQLiteStorageAdapter extends BaseStorageAdapter {
    storageType = 'sqlite';
    db = null;
    dbPath;
    options;
    constructor(config) {
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
    async initialize() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const openOptions = {};
        if (this.options.readonly) {
            openOptions.readonly = true;
        }
        this.db = new Database(this.dbPath, openOptions);
        this.applyPragmas();
        this.createTables();
        this.createIndexes();
        this.initializedAt = new Date();
        console.log(`[SQLite] Database initialized at ${this.dbPath}`);
        setInterval(() => this.cleanupOldPuzzles(), 60 * 60 * 1000);
    }
    applyPragmas() {
        if (!this.db)
            return;
        if (this.options.enableWAL) {
            this.db.pragma('journal_mode = WAL');
        }
        if (this.options.enableForeignKeys) {
            this.db.pragma('foreign_keys = ON');
        }
        this.db.pragma('synchronous = NORMAL');
        if (this.options.pageSize) {
            this.db.pragma(`page_size = ${this.options.pageSize}`);
        }
        if (this.options.cacheSize) {
            this.db.pragma(`cache_size = -${this.options.cacheSize}`);
        }
        this.db.pragma('temp_store = memory');
        this.db.pragma('mmap_size = 30000000000');
    }
    createTables() {
        if (!this.db)
            throw new Error('Database not initialized');
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
    createIndexes() {
        if (!this.db)
            return;
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
    async getPlayerProfile(playerId) {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare('SELECT * FROM player_profiles WHERE player_id = ?');
        const row = stmt.get(playerId);
        if (!row)
            return null;
        return this.rowToPlayerProfile(row);
    }
    async updatePlayerProfile(playerId, updates) {
        if (!this.db)
            throw new Error('Database not initialized');
        const fields = [];
        const values = [];
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
        if (fields.length === 0)
            return;
        values.push(playerId);
        const sql = `UPDATE player_profiles SET ${fields.join(', ')} WHERE player_id = ?`;
        this.db.prepare(sql).run(...values);
    }
    async getNarrativeState(sessionId) {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare('SELECT * FROM narrative_states WHERE session_id = ?');
        const row = stmt.get(sessionId);
        if (!row)
            return null;
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
    async updateNarrativeState(sessionId, updates) {
        if (!this.db)
            throw new Error('Database not initialized');
        const fields = [];
        const values = [];
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
        if (fields.length === 0)
            return;
        values.push(sessionId);
        const sql = `UPDATE narrative_states SET ${fields.join(', ')} WHERE session_id = ?`;
        this.db.prepare(sql).run(...values);
    }
    async submitObservation(obs) {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare(`
      INSERT INTO observations
      (session_id, player_id, level_id, observation_type, content, raw_quote, importance, sentiment, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(obs.sessionId, obs.playerId, obs.levelId || null, obs.observationType, obs.content, obs.rawQuote || null, obs.importance || 5, obs.sentiment || null, 0);
    }
    async getUnprocessedObservations(limit = 50) {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare(`
      SELECT * FROM observations 
      WHERE processed = 0 
      ORDER BY importance DESC, timestamp DESC 
      LIMIT ?
    `);
        const rows = stmt.all(limit);
        return rows.map(row => this.rowToObservation(row));
    }
    async markObservationsProcessed(ids) {
        if (!this.db || ids.length === 0)
            return;
        const stmt = this.db.prepare('UPDATE observations SET processed = 1 WHERE id = ?');
        const transaction = this.db.transaction((ids) => {
            for (const id of ids) {
                stmt.run(id);
            }
        });
        transaction(ids);
    }
    async getPlayerObservations(playerId, limit = 50, types) {
        if (!this.db)
            throw new Error('Database not initialized');
        let sql = 'SELECT * FROM observations WHERE player_id = ?';
        const params = [playerId];
        if (types && types.length > 0) {
            sql += ` AND observation_type IN (${types.map(() => '?').join(',')})`;
            params.push(...types);
        }
        sql += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return rows.map(row => this.rowToObservation(row));
    }
    async storePuzzle(sessionId, puzzleData, difficulty, mood, options) {
        if (!this.db)
            throw new Error('Database not initialized');
        const data = puzzleData;
        const gameTypes = JSON.stringify(data.miniGames?.map((g) => g.type) || []);
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
        const result = stmt.run(sessionId, JSON.stringify(puzzleData), difficulty, mood, gameTypes, priority, tags, expiresAt, sessionId);
        return result.lastInsertRowid.toString();
    }
    async consumeNextPuzzle(sessionId, filter) {
        if (!this.db)
            throw new Error('Database not initialized');
        const transaction = this.db.transaction((sid) => {
            let sql = `
        SELECT * FROM puzzle_buffer
        WHERE session_id = ?
          AND consumed = 0
          AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
      `;
            const params = [sid];
            if (filter?.maxDifficulty !== undefined) {
                sql += ' AND difficulty_score <= ?';
                params.push(filter.maxDifficulty);
            }
            if (filter?.tags && filter.tags.length > 0) {
                const tagConditions = filter.tags.map(() => `tags LIKE ?`);
                sql += ` AND (${tagConditions.join(' OR ')})`;
                params.push(...filter.tags.map(tag => `%"${tag}"%`));
            }
            sql += ' ORDER BY priority DESC, created_at ASC LIMIT 1';
            const selectStmt = this.db.prepare(sql);
            const row = selectStmt.get(...params);
            if (!row)
                return null;
            const updateStmt = this.db.prepare(`
        UPDATE puzzle_buffer
        SET consumed = 1, consumed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
            updateStmt.run(row.id);
            return row;
        });
        const row = transaction(sessionId);
        if (!row)
            return null;
        try {
            const puzzleData = JSON.parse(row.puzzle_data);
            const tags = JSON.parse(row.tags || '[]');
            const bufferedPuzzle = {
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
        }
        catch (error) {
            console.error('Failed to parse puzzle data:', error);
            return null;
        }
    }
    async getPendingPuzzleCount(sessionId) {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM puzzle_buffer 
      WHERE session_id = ? AND consumed = 0
    `);
        const result = stmt.get(sessionId);
        return result.count;
    }
    async cleanupOldPuzzles(maxAgeHours = 24) {
        if (!this.db)
            return 0;
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
    async getActiveSessions(hours = 1) {
        if (!this.db)
            throw new Error('Database not initialized');
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
        const rows = stmt.all();
        return [...new Set(rows.map(r => r.session_id))];
    }
    async healthCheck() {
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
            this.db.prepare('SELECT 1').get();
            const latencyMs = Date.now() - startTime;
            let diskSpaceAvailable = true;
            try {
                const stats = fs.statSync(this.dbPath);
                const fileSizeMB = stats.size / (1024 * 1024);
                if (fileSizeMB > 1024) {
                    diskSpaceAvailable = false;
                }
            }
            catch (error) {
            }
            const details = {
                connected: true
            };
            if (diskSpaceAvailable !== undefined) {
                details.diskSpaceAvailable = diskSpaceAvailable;
            }
            details.memoryPressure = false;
            return {
                healthy: true,
                latencyMs,
                checkedAt: now,
                details
            };
        }
        catch (error) {
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
    async close() {
        if (this.db) {
            this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
            this.db.close();
            this.db = null;
            console.log('[SQLite] Connection closed');
        }
    }
    rowToPlayerProfile(row) {
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
    rowToObservation(row) {
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
    async cleanupExpiredKeys() {
        if (!this.db)
            return;
        const stmt = this.db.prepare('DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP');
        stmt.run();
    }
    async set(key, value, options) {
        if (!this.db)
            throw new Error('Database not initialized');
        try {
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
        }
        catch (error) {
            console.error(`[SQLite] Set failed for key "${key}":`, error);
            return false;
        }
    }
    async get(key) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.cleanupExpiredKeys();
        const stmt = this.db.prepare('SELECT value FROM kv_store WHERE key = ? AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)');
        const row = stmt.get(key);
        if (!row)
            return undefined;
        try {
            return JSON.parse(row.value);
        }
        catch (error) {
            console.error(`[SQLite] JSON parse failed for key "${key}":`, error);
            return undefined;
        }
    }
    async getMany(keys) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.cleanupExpiredKeys();
        const result = new Map();
        if (keys.length === 0)
            return result;
        const placeholders = keys.map(() => '?').join(',');
        const sql = `SELECT key, value FROM kv_store WHERE key IN (${placeholders}) AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)`;
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...keys);
        for (const row of rows) {
            try {
                result.set(row.key, JSON.parse(row.value));
            }
            catch (error) {
                console.error(`[SQLite] JSON parse failed for key "${row.key}":`, error);
            }
        }
        return result;
    }
    async setMany(entries, options) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.cleanupExpiredKeys();
        const now = new Date().toISOString();
        const ttl = options?.ttl;
        let expiresAt = null;
        if (ttl && ttl > 0) {
            const expiresDate = new Date(Date.now() + ttl);
            expiresAt = expiresDate.toISOString();
        }
        const tags = options?.tags ? JSON.stringify(options.tags) : '[]';
        const transaction = this.db.transaction((items) => {
            const stmt = this.db.prepare(`
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
    async delete(key) {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare('DELETE FROM kv_store WHERE key = ?');
        const result = stmt.run(key);
        return result.changes > 0;
    }
    async query(query) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.cleanupExpiredKeys();
        let sql = 'SELECT * FROM kv_store WHERE 1=1';
        const params = [];
        if (query.prefix) {
            sql += ' AND key LIKE ?';
            params.push(`${query.prefix}%`);
        }
        if (query.since) {
            sql += ' AND updated_at >= ?';
            params.push(new Date(query.since).toISOString());
        }
        if (query.until) {
            sql += ' AND updated_at <= ?';
            params.push(new Date(query.until).toISOString());
        }
        sql += ' AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)';
        if (query.orderBy) {
            const orderByField = query.orderBy === 'createdAt' ? 'created_at' :
                query.orderBy === 'updatedAt' ? 'updated_at' :
                    query.orderBy === 'key' ? 'key' : 'created_at';
            sql += ` ORDER BY ${orderByField} ${query.order === 'desc' ? 'DESC' : 'ASC'}`;
        }
        if (query.limit) {
            sql += ' LIMIT ?';
            params.push(query.limit);
        }
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        const results = [];
        for (const row of rows) {
            try {
                const value = JSON.parse(row.value);
                if (query.filter && !query.filter(value)) {
                    continue;
                }
                results.push({
                    key: row.key,
                    value: value,
                    createdAt: new Date(row.created_at).getTime(),
                    updatedAt: new Date(row.updated_at).getTime()
                });
            }
            catch (error) {
                console.error(`[SQLite] JSON parse failed for key "${row.key}":`, error);
            }
        }
        return results;
    }
    async clear() {
        if (!this.db)
            throw new Error('Database not initialized');
        const transaction = this.db.transaction(() => {
            this.db.exec('DELETE FROM kv_store');
            this.db.exec('DELETE FROM player_profiles');
            this.db.exec('DELETE FROM narrative_states');
            this.db.exec('DELETE FROM observations');
            this.db.exec('DELETE FROM puzzle_buffer');
        });
        transaction();
    }
    async has(key) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.cleanupExpiredKeys();
        const stmt = this.db.prepare('SELECT 1 FROM kv_store WHERE key = ? AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)');
        const row = stmt.get(key);
        return !!row;
    }
    async keys() {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.cleanupExpiredKeys();
        const stmt = this.db.prepare('SELECT key FROM kv_store WHERE expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP');
        const rows = stmt.all();
        return rows.map(row => row.key);
    }
    async export(filter) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.cleanupExpiredKeys();
        const stmt = this.db.prepare('SELECT key, value FROM kv_store WHERE expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP');
        const rows = stmt.all();
        const result = {};
        for (const row of rows) {
            if (filter && !filter(row.key))
                continue;
            try {
                result[row.key] = JSON.parse(row.value);
            }
            catch (error) {
                console.error(`[SQLite] JSON parse failed for key "${row.key}":`, error);
            }
        }
        return result;
    }
    async import(data, options) {
        if (!this.db)
            throw new Error('Database not initialized');
        const entries = Object.entries(data).map(([key, value]) => ({ key, value }));
        const storageOptions = {};
        if (options?.ttl !== undefined) {
            storageOptions.ttl = options.ttl;
        }
        await this.setMany(entries, storageOptions);
    }
    async createPlayerProfileIfNotExists(playerId) {
        const existing = await this.getPlayerProfile(playerId);
        if (existing)
            return existing;
        const newProfile = {
            playerId,
            skillRating: 0.5,
            preferredTypes: [],
            frustrationLevel: 0,
            winStreak: 0,
            loseStreak: 0,
            relationshipStage: RelationshipStage.RIVALS,
            lastUpdated: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare(`
      INSERT INTO player_profiles
      (player_id, skill_rating, preferred_types, frustration_level, win_streak, lose_streak, relationship_stage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(newProfile.playerId, newProfile.skillRating, JSON.stringify(newProfile.preferredTypes), newProfile.frustrationLevel, newProfile.winStreak, newProfile.loseStreak, newProfile.relationshipStage);
        return newProfile;
    }
    async createNarrativeStateIfNotExists(sessionId, playerId) {
        const existing = await this.getNarrativeState(sessionId);
        if (existing)
            return existing;
        const newState = {
            sessionId,
            playerId,
            currentMood: AIMood.PLAYFUL,
            generationStatus: 'idle',
            aiImpression: '',
            ongoingPlot: 'beginning',
            worldState: {},
            updatedAt: new Date().toISOString()
        };
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare(`
      INSERT INTO narrative_states
      (session_id, player_id, current_mood, generation_status, ai_impression, ongoing_plot, world_state)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(newState.sessionId, newState.playerId, newState.currentMood, newState.generationStatus, newState.aiImpression, newState.ongoingPlot, JSON.stringify(newState.worldState));
        return newState;
    }
    async getCurrentMood(sessionId) {
        const state = await this.getNarrativeState(sessionId);
        return state?.currentMood ?? null;
    }
    async submitObservationsBatch(observations) {
        if (!this.db)
            throw new Error('Database not initialized');
        const transaction = this.db.transaction((obsList) => {
            const stmt = this.db.prepare(`
        INSERT INTO observations
        (session_id, player_id, level_id, observation_type, content, raw_quote, importance, sentiment, processed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
            for (const obs of obsList) {
                stmt.run(obs.sessionId, '', obs.levelId || null, obs.observationType, obs.content, obs.rawQuote || null, obs.importance || 5, obs.sentiment || null, 0);
            }
        });
        transaction(observations);
    }
    async getStats() {
        if (!this.db)
            throw new Error('Database not initialized');
        const timestamp = new Date().toISOString();
        const totalPlayerProfiles = this.db.prepare('SELECT COUNT(*) as count FROM player_profiles').get();
        const pendingObservations = this.db.prepare('SELECT COUNT(*) as count FROM observations WHERE processed = 0').get();
        const bufferedPuzzles = this.db.prepare('SELECT COUNT(*) as count FROM puzzle_buffer WHERE consumed = 0').get();
        const activeNarrativeSessions = this.db.prepare(`
      SELECT COUNT(DISTINCT session_id) as count FROM (
        SELECT session_id FROM observations WHERE timestamp > datetime('now', '-1 hour')
        UNION
        SELECT session_id FROM narrative_states WHERE updated_at > datetime('now', '-1 hour')
        UNION
        SELECT session_id FROM puzzle_buffer WHERE created_at > datetime('now', '-1 hour')
      )
    `).get();
        let estimatedSizeMB = -1;
        try {
            const stats = fs.statSync(this.dbPath);
            estimatedSizeMB = Math.round(stats.size / (1024 * 1024) * 100) / 100;
        }
        catch (error) {
        }
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
                reads: 0,
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
//# sourceMappingURL=sqlite-adapter.js.map