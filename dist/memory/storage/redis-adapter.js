import { BaseStorageAdapter } from './base-storage.js';
export class RedisStorageAdapter extends BaseStorageAdapter {
    storageType = 'redis';
    client = null;
    options;
    _initialized = false;
    serializer;
    deserializer;
    constructor(options = {}) {
        super(options);
        this.options = {
            host: options.host ?? 'localhost',
            port: options.port ?? 6379,
            db: options.db ?? 0,
            password: options.password ?? '',
            keyPrefix: options.keyPrefix ?? 'xzxllm:',
            cluster: options.cluster ?? [],
            connectTimeout: options.connectTimeout ?? 10000,
            enableOfflineQueue: options.enableOfflineQueue ?? true,
            serializer: options.serializer ?? JSON.stringify,
            deserializer: options.deserializer ?? JSON.parse,
            retryStrategy: options.retryStrategy ?? ((times) => Math.min(times * 50, 2000)),
            uri: options.uri ?? '',
            ttl: options.ttl ?? 0,
            tags: options.tags ?? [],
            priority: options.priority ?? 0
        };
        this.serializer = this.options.serializer;
        this.deserializer = this.options.deserializer;
    }
    async initialize() {
        if (this._initialized)
            return;
        try {
            const { Redis: RedisClient } = await import('ioredis');
            if (this.options.cluster.length > 0) {
                this.client = new RedisClient.Cluster(this.options.cluster, {
                    redisOptions: {
                        password: this.options.password,
                        db: this.options.db,
                        connectTimeout: this.options.connectTimeout
                    },
                    slotsRefreshTimeout: 2000,
                    slotsRefreshInterval: 5000
                });
            }
            else {
                this.client = new RedisClient({
                    host: this.options.host,
                    port: this.options.port,
                    db: this.options.db,
                    password: this.options.password || undefined,
                    keyPrefix: this.options.keyPrefix,
                    connectTimeout: this.options.connectTimeout,
                    enableOfflineQueue: this.options.enableOfflineQueue,
                    retryStrategy: this.options.retryStrategy,
                    lazyConnect: true
                });
            }
            this.client.on('connect', () => {
                console.log('[RedisStorage] Connected to Redis');
            });
            this.client.on('error', (err) => {
                console.error('[RedisStorage] Redis error:', err.message);
            });
            await this.client.connect();
            this._initialized = true;
            this.initializedAt = new Date();
        }
        catch (error) {
            console.error('[RedisStorage] Initialization failed:', error);
            throw error;
        }
    }
    getClient() {
        return this.client;
    }
    async set(key, value, options) {
        this.ensureInitialized();
        try {
            const fullKey = this.getKey(key);
            const serialized = this.serializer(value);
            if (options?.ttl && options.ttl > 0) {
                const seconds = Math.ceil(options.ttl / 1000);
                await this.client.setex(fullKey, seconds, serialized);
            }
            else {
                await this.client.set(fullKey, serialized);
            }
            const meta = {
                updatedAt: Date.now(),
                createdAt: Date.now()
            };
            const existing = await this.client.get(`${fullKey}:meta`);
            if (existing) {
                const oldMeta = this.deserializer(existing);
                meta.createdAt = oldMeta.createdAt;
            }
            await this.client.set(`${fullKey}:meta`, this.serializer(meta));
            return true;
        }
        catch (error) {
            console.error(`[RedisStorage] Set failed for key "${key}":`, error);
            return false;
        }
    }
    async get(key) {
        this.ensureInitialized();
        try {
            const fullKey = this.getKey(key);
            const data = await this.client.get(fullKey);
            if (data === null)
                return undefined;
            return this.deserializer(data);
        }
        catch (error) {
            console.error(`[RedisStorage] Get failed for key "${key}":`, error);
            return undefined;
        }
    }
    async getMany(keys) {
        this.ensureInitialized();
        const results = new Map();
        if (keys.length === 0)
            return results;
        try {
            const pipeline = this.client.pipeline();
            const fullKeys = keys.map(k => this.getKey(k));
            for (const key of fullKeys) {
                pipeline.get(key);
            }
            const res = await pipeline.exec();
            res?.forEach((item, index) => {
                const [err, data] = item;
                if (!err && data !== null) {
                    try {
                        const value = this.deserializer(data);
                        results.set(keys[index], value);
                    }
                    catch (e) {
                        console.warn(`[RedisStorage] Deserialization failed for key ${keys[index]}`);
                    }
                }
            });
        }
        catch (error) {
            console.error('[RedisStorage] GetMany failed:', error);
        }
        return results;
    }
    async setMany(entries, options) {
        this.ensureInitialized();
        if (entries.length === 0)
            return;
        try {
            const pipeline = this.client.pipeline();
            const now = Date.now();
            for (const { key, value } of entries) {
                const fullKey = this.getKey(key);
                const serialized = this.serializer(value);
                if (options?.ttl && options.ttl > 0) {
                    const seconds = Math.ceil(options.ttl / 1000);
                    pipeline.setex(fullKey, seconds, serialized);
                }
                else {
                    pipeline.set(fullKey, serialized);
                }
                pipeline.set(`${fullKey}:meta`, this.serializer({
                    updatedAt: now,
                    createdAt: now
                }));
            }
            await pipeline.exec();
        }
        catch (error) {
            console.error('[RedisStorage] SetMany failed:', error);
            throw error;
        }
    }
    async delete(key) {
        this.ensureInitialized();
        try {
            const fullKey = this.getKey(key);
            const result = await this.client.del(fullKey, `${fullKey}:meta`);
            return result > 0;
        }
        catch (error) {
            console.error(`[RedisStorage] Delete failed for key "${key}":`, error);
            return false;
        }
    }
    async query(query) {
        this.ensureInitialized();
        const results = [];
        try {
            const pattern = query.prefix
                ? `${this.options.keyPrefix}${query.prefix}*`
                : `${this.options.keyPrefix}*`;
            const keys = [];
            if (this.client.constructor.name === 'Cluster') {
                const clusterClient = this.client;
                const nodes = clusterClient.nodes('master');
                for (const node of nodes) {
                    const stream = node.scanStream({ match: pattern, count: 100 });
                    for await (const keyBatch of stream) {
                        const validKeys = keyBatch.filter(k => !k.endsWith(':meta'));
                        keys.push(...validKeys);
                        if (query.limit && keys.length >= query.limit * 2) {
                            break;
                        }
                    }
                    if (query.limit && keys.length >= query.limit * 2) {
                        break;
                    }
                }
            }
            else {
                const stream = this.client.scanStream({ match: pattern, count: 100 });
                for await (const keyBatch of stream) {
                    const validKeys = keyBatch.filter(k => !k.endsWith(':meta'));
                    keys.push(...validKeys);
                    if (query.limit && keys.length >= query.limit * 2) {
                        break;
                    }
                }
            }
            if (keys.length > 0) {
                const values = await this.getMany(keys.map(k => k.replace(this.options.keyPrefix, '')));
                const entries = Array.from(values.entries());
                for (const [key, value] of entries) {
                    if (query.filter && !query.filter(value))
                        continue;
                    const metaKey = `${this.getKey(key)}:meta`;
                    const metaData = await this.client.get(metaKey);
                    const meta = metaData ? this.deserializer(metaData) : {};
                    if (query.since && meta.updatedAt < query.since)
                        continue;
                    if (query.until && meta.updatedAt > query.until)
                        continue;
                    results.push({
                        key,
                        value,
                        createdAt: meta.createdAt || Date.now(),
                        updatedAt: meta.updatedAt || Date.now()
                    });
                    if (query.limit && results.length >= query.limit)
                        break;
                }
            }
            if (query.orderBy) {
                results.sort((a, b) => {
                    const aVal = a[query.orderBy];
                    const bVal = b[query.orderBy];
                    return query.order === 'desc' ? bVal - aVal : aVal - bVal;
                });
            }
        }
        catch (error) {
            console.error('[RedisStorage] Query failed:', error);
        }
        return results;
    }
    async clear() {
        this.ensureInitialized();
        try {
            const pattern = `${this.options.keyPrefix}*`;
            if (this.client.constructor.name === 'Cluster') {
                const clusterClient = this.client;
                const nodes = clusterClient.nodes('master');
                for (const node of nodes) {
                    const stream = node.scanStream({ match: pattern });
                    for await (const keyBatch of stream) {
                        if (keyBatch.length > 0) {
                            await node.del(...keyBatch);
                        }
                    }
                }
            }
            else {
                const stream = this.client.scanStream({ match: pattern });
                for await (const keyBatch of stream) {
                    if (keyBatch.length > 0) {
                        await this.client.del(...keyBatch);
                    }
                }
            }
        }
        catch (error) {
            console.error('[RedisStorage] Clear failed:', error);
            throw error;
        }
    }
    async getStats() {
        this.ensureInitialized();
        try {
            const info = await this.client.info('memory');
            const usedMemory = info.match(/used_memory:(\d+)/)?.[1] || '0';
            const pattern = `${this.options.keyPrefix}*`;
            let count = 0;
            if (this.client.constructor.name === 'Cluster') {
                const clusterClient = this.client;
                const nodes = clusterClient.nodes('master');
                for (const node of nodes) {
                    const stream = node.scanStream({ match: pattern });
                    for await (const keyBatch of stream) {
                        count += keyBatch.filter(k => !k.endsWith(':meta')).length;
                    }
                }
            }
            else {
                const stream = this.client.scanStream({ match: pattern });
                for await (const keyBatch of stream) {
                    count += keyBatch.filter(k => !k.endsWith(':meta')).length;
                }
            }
            return {
                totalPlayerProfiles: 0,
                activeNarrativeSessions: 0,
                pendingObservations: 0,
                bufferedPuzzles: 0,
                estimatedSizeMB: Math.round(parseInt(usedMemory) / 1024 / 1024 * 100) / 100,
                operations: this.stats,
                timestamp: new Date().toISOString(),
                storageType: this.storageType,
                uptime: this.getUptimeSeconds()
            };
        }
        catch (error) {
            console.error('[RedisStorage] GetStats failed:', error);
            return {
                totalPlayerProfiles: 0,
                activeNarrativeSessions: 0,
                pendingObservations: 0,
                bufferedPuzzles: 0,
                estimatedSizeMB: 0,
                operations: this.stats,
                timestamp: new Date().toISOString(),
                storageType: this.storageType,
                uptime: this.getUptimeSeconds()
            };
        }
    }
    async has(key) {
        this.ensureInitialized();
        const exists = await this.client.exists(this.getKey(key));
        return exists === 1;
    }
    async keys() {
        this.ensureInitialized();
        const pattern = `${this.options.keyPrefix}*`;
        const keys = [];
        if (this.client.constructor.name === 'Cluster') {
            const clusterClient = this.client;
            const nodes = clusterClient.nodes('master');
            for (const node of nodes) {
                const stream = node.scanStream({ match: pattern });
                for await (const keyBatch of stream) {
                    const validKeys = keyBatch.filter(k => !k.endsWith(':meta'));
                    keys.push(...validKeys.map(k => k.replace(this.options.keyPrefix, '')));
                }
            }
        }
        else {
            const stream = this.client.scanStream({ match: pattern });
            for await (const keyBatch of stream) {
                const validKeys = keyBatch.filter(k => !k.endsWith(':meta'));
                keys.push(...validKeys.map(k => k.replace(this.options.keyPrefix, '')));
            }
        }
        return keys;
    }
    async export(filter) {
        const keys = await this.keys();
        const data = {};
        for (const key of keys) {
            if (filter && !filter(key))
                continue;
            const value = await this.get(key);
            if (value !== undefined) {
                data[key] = value;
            }
        }
        return data;
    }
    async import(data, options) {
        const entries = Object.entries(data).map(([key, value]) => ({ key, value }));
        const storageOptions = {};
        if (options?.ttl !== undefined) {
            storageOptions.ttl = options.ttl;
        }
        await this.setMany(entries, storageOptions);
    }
    async close() {
        if (this.client) {
            await this.client.quit();
            this.client = null;
            this._initialized = false;
            console.log('[RedisStorage] Disconnected');
        }
    }
    async dispose() {
        await this.close();
    }
    getKey(key) {
        if (key.startsWith(this.options.keyPrefix)) {
            return key;
        }
        return `${this.options.keyPrefix}${key}`;
    }
    ensureInitialized() {
        if (!this._initialized || !this.client) {
            throw new Error('[RedisStorage] Adapter not initialized. Call initialize() first.');
        }
    }
    async getPlayerProfile(playerId) {
        this.ensureInitialized();
        try {
            const key = `player:profile:${playerId}`;
            const data = await this.client.get(key);
            if (!data)
                return null;
            return this.deserializer(data);
        }
        catch (error) {
            console.error(`[RedisStorage] getPlayerProfile failed for player "${playerId}":`, error);
            return null;
        }
    }
    async updatePlayerProfile(playerId, updates) {
        this.ensureInitialized();
        try {
            const key = `player:profile:${playerId}`;
            const existing = await this.getPlayerProfile(playerId);
            const profile = existing ? { ...existing, ...updates } : {
                playerId,
                ...updates,
                createdAt: this.now(),
                lastUpdated: this.now()
            };
            profile.lastUpdated = this.now();
            if (!existing) {
                profile.createdAt = this.now();
            }
            await this.client.set(key, this.serializer(profile));
            this.stats.writes++;
        }
        catch (error) {
            console.error(`[RedisStorage] updatePlayerProfile failed for player "${playerId}":`, error);
            this.stats.errors++;
            throw error;
        }
    }
    async getNarrativeState(sessionId) {
        this.ensureInitialized();
        try {
            const key = `narrative:state:${sessionId}`;
            const data = await this.client.get(key);
            if (!data)
                return null;
            return this.deserializer(data);
        }
        catch (error) {
            console.error(`[RedisStorage] getNarrativeState failed for session "${sessionId}":`, error);
            return null;
        }
    }
    async updateNarrativeState(sessionId, updates) {
        this.ensureInitialized();
        try {
            const key = `narrative:state:${sessionId}`;
            const existing = await this.getNarrativeState(sessionId);
            const state = existing ? { ...existing, ...updates, updatedAt: this.now() } : {
                sessionId,
                ...updates,
                updatedAt: this.now()
            };
            await this.client.set(key, this.serializer(state));
            this.stats.writes++;
        }
        catch (error) {
            console.error(`[RedisStorage] updateNarrativeState failed for session "${sessionId}":`, error);
            this.stats.errors++;
            throw error;
        }
    }
    async submitObservation(obs) {
        this.ensureInitialized();
        try {
            const observationId = this.generateUUID();
            const key = `observation:${observationId}`;
            const fullObservation = {
                ...obs,
                id: observationId,
                timestamp: this.now(),
                processed: false
            };
            await this.client.set(key, this.serializer(fullObservation));
            const sessionKey = `session:observations:${obs.sessionId}`;
            await this.client.lpush(sessionKey, observationId);
            await this.client.lpush('observations:unprocessed', observationId);
            this.stats.writes++;
        }
        catch (error) {
            console.error('[RedisStorage] submitObservation failed:', error);
            this.stats.errors++;
            throw error;
        }
    }
    async getUnprocessedObservations(limit = 50) {
        this.ensureInitialized();
        try {
            const observationIds = await this.client.lrange('observations:unprocessed', 0, limit - 1);
            const observations = [];
            for (const id of observationIds) {
                const key = `observation:${id}`;
                const data = await this.client.get(key);
                if (data) {
                    observations.push(this.deserializer(data));
                }
            }
            return observations;
        }
        catch (error) {
            console.error('[RedisStorage] getUnprocessedObservations failed:', error);
            return [];
        }
    }
    async markObservationsProcessed(ids) {
        this.ensureInitialized();
        try {
            for (const id of ids) {
                const key = `observation:${id}`;
                const data = await this.client.get(key);
                if (data) {
                    const obs = this.deserializer(data);
                    obs.processed = true;
                    await this.client.set(key, this.serializer(obs));
                    await this.client.lrem('observations:unprocessed', 0, id.toString());
                }
            }
            this.stats.writes++;
        }
        catch (error) {
            console.error('[RedisStorage] markObservationsProcessed failed:', error);
            this.stats.errors++;
            throw error;
        }
    }
    async storePuzzle(sessionId, puzzleData, difficulty, mood, options) {
        this.ensureInitialized();
        try {
            const puzzleId = this.generateUUID();
            const key = `puzzle:${puzzleId}`;
            const puzzle = {
                id: puzzleId,
                sessionId,
                puzzleData,
                difficulty,
                mood,
                createdAt: this.now(),
                consumed: false,
                tags: options?.tags || []
            };
            await this.client.set(key, this.serializer(puzzle));
            const sessionPuzzlesKey = `session:puzzles:${sessionId}:unconsumed`;
            await this.client.lpush(sessionPuzzlesKey, puzzleId);
            if (options?.ttl && options.ttl > 0) {
                await this.client.expire(key, Math.ceil(options.ttl / 1000));
                await this.client.expire(sessionPuzzlesKey, Math.ceil(options.ttl / 1000));
            }
            this.stats.writes++;
            return puzzleId;
        }
        catch (error) {
            console.error('[RedisStorage] storePuzzle failed:', error);
            this.stats.errors++;
            throw error;
        }
    }
    async consumeNextPuzzle(sessionId, filter) {
        this.ensureInitialized();
        try {
            const sessionPuzzlesKey = `session:puzzles:${sessionId}:unconsumed`;
            const puzzleIds = await this.client.lrange(sessionPuzzlesKey, 0, -1);
            for (const puzzleId of puzzleIds) {
                const key = `puzzle:${puzzleId}`;
                const data = await this.client.get(key);
                if (!data)
                    continue;
                const puzzle = this.deserializer(data);
                if (filter?.tags && filter.tags.length > 0) {
                    const puzzleTags = puzzle.tags || [];
                    if (!filter.tags.some(tag => puzzleTags.includes(tag)))
                        continue;
                }
                if (filter?.maxDifficulty !== undefined && puzzle.difficulty > filter.maxDifficulty) {
                    continue;
                }
                puzzle.consumed = true;
                puzzle.consumedAt = this.now();
                await this.client.set(key, this.serializer(puzzle));
                await this.client.lrem(sessionPuzzlesKey, 0, puzzleId);
                this.stats.reads++;
                return puzzle;
            }
            return null;
        }
        catch (error) {
            console.error('[RedisStorage] consumeNextPuzzle failed:', error);
            this.stats.errors++;
            return null;
        }
    }
    async getPendingPuzzleCount(sessionId, filter) {
        this.ensureInitialized();
        try {
            const sessionPuzzlesKey = `session:puzzles:${sessionId}:unconsumed`;
            const puzzleIds = await this.client.lrange(sessionPuzzlesKey, 0, -1);
            if (!filter?.tags || filter.tags.length === 0) {
                return puzzleIds.length;
            }
            let count = 0;
            for (const puzzleId of puzzleIds) {
                const key = `puzzle:${puzzleId}`;
                const data = await this.client.get(key);
                if (!data)
                    continue;
                const puzzle = this.deserializer(data);
                const puzzleTags = puzzle.tags || [];
                if (filter.tags.some(tag => puzzleTags.includes(tag))) {
                    count++;
                }
            }
            return count;
        }
        catch (error) {
            console.error('[RedisStorage] getPendingPuzzleCount failed:', error);
            return 0;
        }
    }
    async getActiveSessions(_hours = 1) {
        this.ensureInitialized();
        try {
            const pattern = `session:observations:*`;
            const sessions = new Set();
            if (this.client.constructor.name === 'Cluster') {
                const clusterClient = this.client;
                const nodes = clusterClient.nodes('master');
                for (const node of nodes) {
                    const stream = node.scanStream({ match: pattern });
                    for await (const keys of stream) {
                        for (const key of keys) {
                            const sessionId = key.replace('session:observations:', '');
                            const recentObservations = await node.lrange(key, 0, 0);
                            if (recentObservations.length > 0) {
                                sessions.add(sessionId);
                            }
                        }
                    }
                }
            }
            else {
                const stream = this.client.scanStream({ match: pattern });
                for await (const keys of stream) {
                    for (const key of keys) {
                        const sessionId = key.replace('session:observations:', '');
                        const recentObservations = await this.client.lrange(key, 0, 0);
                        if (recentObservations.length > 0) {
                            sessions.add(sessionId);
                        }
                    }
                }
            }
            return Array.from(sessions);
        }
        catch (error) {
            console.error('[RedisStorage] getActiveSessions failed:', error);
            return [];
        }
    }
    async healthCheck() {
        this.ensureInitialized();
        const startTime = Date.now();
        try {
            await this.client.ping();
            const latencyMs = Date.now() - startTime;
            return {
                healthy: true,
                latencyMs,
                checkedAt: this.now(),
                details: {
                    connected: true
                }
            };
        }
        catch (error) {
            return {
                healthy: false,
                latencyMs: -1,
                checkedAt: this.now(),
                details: {
                    connected: false,
                    lastError: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
    async getPlayerObservations(playerId, limit = 50, types) {
        this.ensureInitialized();
        try {
            const pattern = `observation:*`;
            const observations = [];
            if (this.client.constructor.name === 'Cluster') {
                const clusterClient = this.client;
                const nodes = clusterClient.nodes('master');
                for (const node of nodes) {
                    const stream = node.scanStream({ match: pattern });
                    for await (const keys of stream) {
                        for (const key of keys) {
                            const data = await node.get(key);
                            if (data) {
                                observations.push(this.deserializer(data));
                            }
                        }
                    }
                }
            }
            else {
                const stream = this.client.scanStream({ match: pattern });
                for await (const keys of stream) {
                    for (const key of keys) {
                        const data = await this.client.get(key);
                        if (data) {
                            observations.push(this.deserializer(data));
                        }
                    }
                }
            }
            let filtered = observations.filter((obs) => obs.playerId === playerId);
            if (types && types.length > 0) {
                filtered = filtered.filter((obs) => types.includes(obs.observationType));
            }
            filtered.sort((a, b) => {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timeB - timeA;
            });
            return filtered.slice(0, limit);
        }
        catch (error) {
            console.error('[RedisStorage] getPlayerObservations failed:', error);
            return [];
        }
    }
    async getObservationsPaginated(sessionId, cursor = null, pageSize = 100) {
        const sessionKey = `session:observations:${sessionId}`;
        const observationIds = await this.client.lrange(sessionKey, 0, -1);
        const observations = [];
        for (const id of observationIds) {
            const key = `observation:${id}`;
            const data = await this.client.get(key);
            if (data) {
                observations.push(this.deserializer(data));
            }
        }
        observations.sort((a, b) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeB - timeA;
        });
        let startIndex = 0;
        if (cursor) {
            const cursorIndex = observations.findIndex(obs => obs.id === cursor);
            if (cursorIndex !== -1) {
                startIndex = cursorIndex + 1;
            }
        }
        const data = observations.slice(startIndex, startIndex + pageSize);
        const hasMore = observations.length > startIndex + pageSize;
        const lastItem = data.length > 0 ? data[data.length - 1] : null;
        const nextCursor = hasMore && lastItem ? lastItem.id : null;
        return {
            data,
            hasMore,
            nextCursor,
            totalEstimate: observations.length
        };
    }
}
//# sourceMappingURL=redis-adapter.js.map