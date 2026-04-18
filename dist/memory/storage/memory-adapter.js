import { BaseStorageAdapter } from './base-storage.js';
import { AIMood, RelationshipStage } from '../../core/interfaces/base.types.js';
import { TypedEventBus } from '../../core/event-bus.js';
export class MemoryStorageAdapter extends BaseStorageAdapter {
    storageType = 'memory';
    _initialized = false;
    store;
    options;
    eventBus;
    cleanupTimer = null;
    currentMemoryBytes = 0;
    memoryStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        expirations: 0,
        sets: 0,
        gets: 0,
        deletes: 0
    };
    constructor(options = {}) {
        super(options);
        this.options = {
            maxSize: options.maxSize ?? 10000,
            defaultTTL: options.defaultTTL ?? 0,
            cleanupInterval: options.cleanupInterval ?? 60000,
            enableLRU: options.enableLRU ?? true,
            memoryLimitMB: options.memoryLimitMB ?? 512,
            autoPersist: options.autoPersist ?? false,
            persistPath: options.persistPath ?? './memory-backup.json',
            ttl: options.ttl ?? 0,
            tags: options.tags ?? [],
            priority: options.priority ?? 0
        };
        this.store = new Map();
        this.eventBus = new TypedEventBus();
        if (this.options.autoPersist) {
            this.eventBus.on('storage', (event) => {
                if (['insert', 'update', 'delete'].includes(event.type)) {
                    try {
                        this.persistSync();
                    }
                    catch (err) {
                        console.error('[MemoryStorage] Auto-persist failed:', err);
                    }
                }
            });
        }
    }
    async initialize() {
        if (this._initialized) {
            return;
        }
        try {
            this.startCleanupTask();
            if (this.options.autoPersist) {
                await this.restore();
            }
            this._initialized = true;
            console.log(`[MemoryStorage] Initialized (maxSize: ${this.options.maxSize}, TTL: ${this.options.defaultTTL}ms)`);
        }
        catch (error) {
            console.error('[MemoryStorage] Initialization failed:', error);
            throw error;
        }
    }
    get isInitialized() {
        return this._initialized;
    }
    async set(key, value, options) {
        this.ensureInitialized();
        try {
            const now = Date.now();
            const ttl = options?.ttl ?? this.options.defaultTTL;
            const sizeEstimate = this.estimateSize(value);
            const existing = this.store.get(key);
            if (existing) {
                this.currentMemoryBytes -= existing.sizeEstimate;
            }
            while (this.options.enableLRU &&
                this.store.size >= this.options.maxSize &&
                !this.store.has(key)) {
                this.evictLRU();
            }
            const limitBytes = this.options.memoryLimitMB * 1024 * 1024;
            if (this.currentMemoryBytes + sizeEstimate > limitBytes) {
                console.warn(`[MemoryStorage] Memory limit approaching, evicting...`);
                this.evictLRU();
            }
            const item = {
                key,
                value,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                lastAccessed: now,
                accessCount: existing ? existing.accessCount + 1 : 0,
                sizeEstimate,
                expiresAt: ttl > 0 ? now + ttl : 0
            };
            this.store.set(key, item);
            this.currentMemoryBytes += sizeEstimate;
            this.memoryStats.sets++;
            this.eventBus.emit('storage', {
                type: existing ? 'update' : 'insert',
                key,
                oldValue: existing?.value,
                newValue: value,
                timestamp: now,
                reason: 'manual'
            });
            return true;
        }
        catch (error) {
            console.error(`[MemoryStorage] Set failed for key "${key}":`, error);
            return false;
        }
    }
    async get(key) {
        this.ensureInitialized();
        this.memoryStats.gets++;
        const item = this.store.get(key);
        if (!item) {
            this.memoryStats.misses++;
            return undefined;
        }
        if (this.isExpired(item)) {
            this.memoryStats.misses++;
            this.deleteInternal(key, 'ttl');
            return undefined;
        }
        item.lastAccessed = Date.now();
        item.accessCount++;
        this.memoryStats.hits++;
        return item.value;
    }
    async getMany(keys) {
        this.ensureInitialized();
        const results = new Map();
        await Promise.all(keys.map(async (key) => {
            const value = await this.get(key);
            if (value !== undefined) {
                results.set(key, value);
            }
        }));
        return results;
    }
    async setMany(entries, options) {
        this.ensureInitialized();
        for (const { key, value } of entries) {
            await this.set(key, value, options);
        }
    }
    async delete(key) {
        this.ensureInitialized();
        this.memoryStats.deletes++;
        return this.deleteInternal(key, 'manual');
    }
    async query(query) {
        this.ensureInitialized();
        const results = [];
        for (const [key, item] of Array.from(this.store.entries())) {
            if (this.isExpired(item)) {
                this.deleteInternal(key, 'ttl');
                continue;
            }
            if (query.prefix && !key.startsWith(query.prefix)) {
                continue;
            }
            if (query.filter && !query.filter(item.value)) {
                continue;
            }
            if (query.since && item.updatedAt < query.since) {
                continue;
            }
            if (query.until && item.updatedAt > query.until) {
                continue;
            }
            results.push({
                key: item.key,
                value: item.value,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            });
        }
        if (query.orderBy) {
            results.sort((a, b) => {
                const aVal = a[query.orderBy];
                const bVal = b[query.orderBy];
                return query.order === 'desc' ? bVal - aVal : aVal - bVal;
            });
        }
        if (query.limit && results.length > query.limit) {
            return results.slice(0, query.limit);
        }
        return results;
    }
    async clear() {
        this.ensureInitialized();
        const keys = Array.from(this.store.keys());
        for (const key of keys) {
            this.deleteInternal(key, 'clear');
        }
        this.store.clear();
        this.currentMemoryBytes = 0;
        console.log(`[MemoryStorage] Cleared ${keys.length} items`);
    }
    async getStats() {
        const timestamp = new Date().toISOString();
        let uptime = -1;
        if (this.initializedAt) {
            uptime = Math.floor((Date.now() - this.initializedAt.getTime()) / 1000);
        }
        return {
            totalPlayerProfiles: 0,
            activeNarrativeSessions: 0,
            pendingObservations: 0,
            bufferedPuzzles: 0,
            estimatedSizeMB: Math.round(this.currentMemoryBytes / 1024 / 1024 * 100) / 100,
            operations: {
                reads: this.memoryStats.gets,
                writes: this.memoryStats.sets,
                deletes: this.memoryStats.deletes,
                errors: 0
            },
            timestamp,
            storageType: this.storageType,
            uptime
        };
    }
    async has(key) {
        this.ensureInitialized();
        const item = this.store.get(key);
        if (!item)
            return false;
        if (this.isExpired(item)) {
            this.deleteInternal(key, 'ttl');
            return false;
        }
        return true;
    }
    async keys() {
        this.ensureInitialized();
        return Array.from(this.store.keys()).filter(key => {
            const item = this.store.get(key);
            if (item && this.isExpired(item)) {
                this.deleteInternal(key, 'ttl');
                return false;
            }
            return true;
        });
    }
    async export(filter) {
        this.ensureInitialized();
        const data = {};
        for (const [key, item] of Array.from(this.store.entries())) {
            if (this.isExpired(item))
                continue;
            if (filter && !filter(key))
                continue;
            data[key] = item.value;
        }
        return data;
    }
    async import(data, options) {
        this.ensureInitialized();
        for (const [key, value] of Object.entries(data)) {
            if (options?.skipExisting && this.store.has(key)) {
                continue;
            }
            const storageOptions = {};
            if (options?.ttl !== undefined) {
                storageOptions.ttl = options.ttl;
            }
            await this.set(key, value, storageOptions);
        }
    }
    async persist() {
        if (!this.options.persistPath) {
            throw new Error('[MemoryStorage] Persist path not configured');
        }
        const fs = await import('fs/promises');
        const data = await this.export();
        await fs.writeFile(this.options.persistPath, JSON.stringify(data, null, 2), 'utf-8');
    }
    persistSync() {
        if (!this.options.persistPath)
            return;
        try {
            const fs = require('fs');
            const data = {};
            for (const [key, item] of this.store.entries()) {
                if (!this.isExpired(item)) {
                    data[key] = item.value;
                }
            }
            fs.writeFileSync(this.options.persistPath, JSON.stringify(data, null, 2), 'utf-8');
        }
        catch (error) {
            console.error('[MemoryStorage] Sync persist failed:', error);
        }
    }
    async restore() {
        if (!this.options.persistPath)
            return;
        try {
            const fs = await import('fs/promises');
            const exists = await fs.access(this.options.persistPath)
                .then(() => true)
                .catch(() => false);
            if (!exists)
                return;
            const content = await fs.readFile(this.options.persistPath, 'utf-8');
            const data = JSON.parse(content);
            await this.import(data);
            console.log(`[MemoryStorage] Restored ${Object.keys(data).length} items`);
        }
        catch (error) {
            console.error('[MemoryStorage] Restore failed:', error);
        }
    }
    on(event, handler) {
        this.eventBus.on('storage', (evt) => {
            if (event === 'all' || evt.type === event) {
                handler(evt);
            }
        });
    }
    off(_event, _handler) {
        console.warn('[MemoryStorage] off method not fully implemented');
    }
    async close() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        if (this.options.autoPersist) {
            await this.persist();
        }
        this.store.clear();
        this._initialized = false;
        console.log('[MemoryStorage] Closed');
    }
    async cleanup() {
        this.ensureInitialized();
        let cleaned = 0;
        const now = Date.now();
        for (const [key, item] of this.store.entries()) {
            if (item.expiresAt > 0 && item.expiresAt <= now) {
                this.deleteInternal(key, 'ttl');
                cleaned++;
            }
        }
        return cleaned;
    }
    ensureInitialized() {
        if (!this._initialized) {
            throw new Error('[MemoryStorage] Adapter not initialized. Call initialize() first.');
        }
    }
    isExpired(item) {
        if (item.expiresAt === 0)
            return false;
        return Date.now() >= item.expiresAt;
    }
    deleteInternal(key, reason) {
        const item = this.store.get(key);
        if (!item)
            return false;
        this.store.delete(key);
        this.currentMemoryBytes -= item.sizeEstimate;
        if (reason === 'ttl') {
            this.memoryStats.expirations++;
        }
        else if (reason === 'lru') {
            this.memoryStats.evictions++;
        }
        this.eventBus.emit('storage', {
            type: reason === 'ttl' ? 'expire' : 'delete',
            key,
            oldValue: item.value,
            timestamp: Date.now(),
            reason
        });
        return true;
    }
    evictLRU() {
        if (this.store.size === 0)
            return;
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [key, item] of this.store.entries()) {
            if (this.isExpired(item)) {
                this.deleteInternal(key, 'ttl');
                return;
            }
            if (item.lastAccessed < oldestTime) {
                oldestTime = item.lastAccessed;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            this.deleteInternal(oldestKey, 'lru');
            console.debug(`[MemoryStorage] LRU evicted key: ${oldestKey}`);
        }
    }
    startCleanupTask() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.cleanupTimer = setInterval(() => {
            this.cleanup().then(count => {
                if (count > 0) {
                    console.debug(`[MemoryStorage] Cleaned up ${count} expired items`);
                }
            });
        }, this.options.cleanupInterval);
        if (!this.options.autoPersist) {
            this.cleanupTimer.unref();
        }
    }
    estimateSize(obj) {
        if (obj === null || obj === undefined)
            return 8;
        const type = typeof obj;
        if (type === 'boolean')
            return 4;
        if (type === 'number')
            return 8;
        if (type === 'string')
            return obj.length * 2 + 24;
        if (Array.isArray(obj)) {
            return obj.reduce((sum, item) => sum + this.estimateSize(item), 24);
        }
        if (type === 'object') {
            let size = 24;
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    size += key.length * 2 + 8;
                    size += this.estimateSize(obj[key]);
                }
            }
            return size;
        }
        return 8;
    }
    async getPlayerProfile(playerId) {
        const data = await this.get(`player:${playerId}:profile`);
        return data || null;
    }
    async updatePlayerProfile(playerId, updates) {
        const existing = await this.getPlayerProfile(playerId);
        const now = this.now();
        const profile = {
            playerId,
            skillRating: updates.skillRating ?? existing?.skillRating ?? 0.5,
            preferredTypes: updates.preferredTypes ?? existing?.preferredTypes ?? [],
            frustrationLevel: updates.frustrationLevel ?? existing?.frustrationLevel ?? 0,
            winStreak: updates.winStreak ?? existing?.winStreak ?? 0,
            loseStreak: updates.loseStreak ?? existing?.loseStreak ?? 0,
            relationshipStage: updates.relationshipStage ?? existing?.relationshipStage ?? RelationshipStage.RIVALS,
            lastUpdated: now,
            createdAt: existing?.createdAt ?? now
        };
        await this.set(`player:${playerId}:profile`, profile);
    }
    async getNarrativeState(sessionId) {
        const data = await this.get(`narrative:${sessionId}`);
        return data || null;
    }
    async updateNarrativeState(sessionId, updates) {
        const existing = await this.getNarrativeState(sessionId);
        const now = this.now();
        const state = {
            sessionId,
            playerId: updates.playerId ?? existing?.playerId ?? '',
            currentMood: updates.currentMood ?? existing?.currentMood ?? AIMood.PLAYFUL,
            generationStatus: updates.generationStatus ?? existing?.generationStatus ?? 'idle',
            aiImpression: updates.aiImpression ?? existing?.aiImpression ?? '',
            ongoingPlot: updates.ongoingPlot ?? existing?.ongoingPlot ?? 'beginning',
            worldState: updates.worldState ?? existing?.worldState ?? {},
            sessionHistory: updates.sessionHistory ?? existing?.sessionHistory ?? [],
            updatedAt: now
        };
        const lastPuzzleDifficulty = updates.lastPuzzleDifficulty ?? existing?.lastPuzzleDifficulty;
        const generatedIntro = updates.generatedIntro ?? existing?.generatedIntro;
        if (lastPuzzleDifficulty !== undefined) {
            state.lastPuzzleDifficulty = lastPuzzleDifficulty;
        }
        if (generatedIntro !== undefined) {
            state.generatedIntro = generatedIntro;
        }
        await this.set(`narrative:${sessionId}`, state);
    }
    async submitObservation(obs) {
        const id = Math.floor(Math.random() * 1000000);
        const observation = {
            ...obs,
            id,
            timestamp: this.now(),
            processed: false
        };
        await this.set(`observation:${id}`, observation);
    }
    async getUnprocessedObservations(limit = 50) {
        const results = [];
        for (const [key, item] of this.store.entries()) {
            if (!key.startsWith('observation:'))
                continue;
            if (this.isExpired(item))
                continue;
            const obs = item.value;
            if (!obs.processed) {
                results.push(obs);
                if (results.length >= limit)
                    break;
            }
        }
        return results;
    }
    async markObservationsProcessed(ids) {
        for (const id of ids) {
            const key = `observation:${id}`;
            const obs = await this.get(key);
            if (obs) {
                obs.processed = true;
                await this.set(key, obs);
            }
        }
    }
    async storePuzzle(sessionId, puzzleData, difficulty, mood, options) {
        const puzzleId = this.generateUUID();
        const puzzle = {
            id: puzzleId,
            puzzleData,
            difficulty,
            mood,
            createdAt: this.now(),
            consumed: false,
            sessionId
        };
        if (options?.tags) {
            puzzle.tags = options.tags;
        }
        await this.set(`puzzle:${puzzleId}`, puzzle, options);
        return puzzleId;
    }
    async consumeNextPuzzle(sessionId, filter) {
        let nextPuzzle = null;
        let earliestTime = Infinity;
        for (const [key, item] of this.store.entries()) {
            if (!key.startsWith('puzzle:'))
                continue;
            if (this.isExpired(item))
                continue;
            const puzzle = item.value;
            if (puzzle.consumed || puzzle.sessionId !== sessionId)
                continue;
            if (filter?.maxDifficulty && puzzle.difficulty > filter.maxDifficulty)
                continue;
            if (filter?.tags && filter.tags.length > 0) {
                if (!puzzle.tags || !puzzle.tags.some(tag => filter.tags.includes(tag)))
                    continue;
            }
            if (!puzzle.createdAt)
                continue;
            const createTime = new Date(puzzle.createdAt).getTime();
            if (createTime < earliestTime) {
                earliestTime = createTime;
                nextPuzzle = puzzle;
            }
        }
        if (nextPuzzle) {
            nextPuzzle.consumed = true;
            nextPuzzle.consumedAt = this.now();
            await this.set(`puzzle:${nextPuzzle.id}`, nextPuzzle);
        }
        return nextPuzzle;
    }
    async getPendingPuzzleCount(sessionId) {
        let count = 0;
        for (const [key, item] of this.store.entries()) {
            if (!key.startsWith('puzzle:'))
                continue;
            if (this.isExpired(item))
                continue;
            const puzzle = item.value;
            if (!puzzle.consumed && puzzle.sessionId === sessionId) {
                count++;
            }
        }
        return count;
    }
    async getActiveSessions(hours = 1) {
        const sessions = new Set();
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        for (const [key, item] of this.store.entries()) {
            if (this.isExpired(item))
                continue;
            if (key.startsWith('observation:')) {
                const obs = item.value;
                if (!obs.timestamp)
                    continue;
                const time = new Date(obs.timestamp).getTime();
                if (time > cutoffTime) {
                    sessions.add(obs.sessionId);
                }
            }
            else if (key.startsWith('narrative:')) {
                const state = item.value;
                const time = new Date(state.updatedAt).getTime();
                if (time > cutoffTime) {
                    sessions.add(state.sessionId);
                }
            }
            else if (key.startsWith('puzzle:')) {
                const puzzle = item.value;
                if (!puzzle.createdAt)
                    continue;
                const time = new Date(puzzle.createdAt).getTime();
                if (time > cutoffTime) {
                    sessions.add(puzzle.sessionId);
                }
            }
        }
        return Array.from(sessions);
    }
    async healthCheck() {
        const now = new Date().toISOString();
        try {
            const testKey = '__health_check__';
            const testValue = { timestamp: now };
            const startTime = Date.now();
            await this.set(testKey, testValue);
            const retrieved = await this.get(testKey);
            const latencyMs = Date.now() - startTime;
            await this.delete(testKey);
            const healthy = retrieved !== undefined && retrieved.timestamp === now;
            const details = {
                connected: healthy
            };
            if (!healthy) {
                details.lastError = 'Health check failed';
            }
            return {
                healthy,
                latencyMs: healthy ? latencyMs : -1,
                checkedAt: now,
                details
            };
        }
        catch (error) {
            const details = {
                connected: false
            };
            if (error) {
                details.lastError = error instanceof Error ? error.message : 'Unknown error';
            }
            return {
                healthy: false,
                latencyMs: -1,
                checkedAt: now,
                details
            };
        }
    }
}
export function createMemoryStorage(options) {
    return new MemoryStorageAdapter(options);
}
//# sourceMappingURL=memory-adapter.js.map