import { RelationshipStage, AIMood } from '../../core/interfaces/base.types.js';
export class BaseStorageAdapter {
    config;
    stats;
    initializedAt = null;
    constructor(config = {}) {
        this.config = config;
        this.stats = {
            reads: 0,
            writes: 0,
            deletes: 0,
            errors: 0
        };
    }
    async submitObservationsBatch(observations) {
        for (const obs of observations) {
            await this.submitObservation(obs);
        }
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
            lastUpdated: this.now(),
            createdAt: this.now()
        };
        await this.updatePlayerProfile(playerId, newProfile);
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
            updatedAt: this.now()
        };
        await this.updateNarrativeState(sessionId, newState);
        return newState;
    }
    async getCurrentMood(sessionId) {
        const state = await this.getNarrativeState(sessionId);
        return state?.currentMood ?? null;
    }
    async getPlayerObservations(playerId, limit = 50, types) {
        const all = await this.getUnprocessedObservations(1000);
        let filtered = all.filter(obs => obs.sessionId === playerId);
        if (types && types.length > 0) {
            filtered = filtered.filter(obs => types.includes(obs.observationType));
        }
        filtered.sort((a, b) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeB - timeA;
        });
        return filtered.slice(0, limit);
    }
    async getObservationsPaginated(sessionId, cursor = null, pageSize = 100) {
        const all = await this.getPlayerObservations(sessionId, 10000);
        let startIndex = 0;
        if (cursor) {
            const cursorNum = parseInt(cursor, 10);
            if (!isNaN(cursorNum)) {
                const cursorIndex = all.findIndex(obs => obs.id !== undefined && obs.id === cursorNum);
                if (cursorIndex !== -1) {
                    startIndex = cursorIndex + 1;
                }
            }
        }
        const data = all.slice(startIndex, startIndex + pageSize);
        const hasMore = all.length > startIndex + pageSize;
        const lastItem = data.length > 0 ? data[data.length - 1] : null;
        const nextCursor = hasMore && lastItem && lastItem.id !== undefined
            ? String(lastItem.id)
            : null;
        return {
            data,
            hasMore,
            nextCursor,
            totalEstimate: all.length
        };
    }
    async cleanupOldObservations(daysToKeep = 30) {
        void daysToKeep;
        console.warn(`[${this.storageType}] cleanupOldObservations using default no-op implementation`);
        return 0;
    }
    async peekNextPuzzle(sessionId) {
        void sessionId;
        console.warn(`[${this.storageType}] peekNextPuzzle not implemented, returning null`);
        return null;
    }
    async listPendingPuzzles(sessionId, cursor = null, pageSize = 100) {
        void cursor;
        void pageSize;
        return {
            data: [],
            hasMore: false,
            nextCursor: null,
            totalEstimate: await this.getPendingPuzzleCount(sessionId)
        };
    }
    async cleanupOldPuzzles(maxAgeHours = 24, sessionId) {
        void maxAgeHours;
        void sessionId;
        console.warn(`[${this.storageType}] cleanupOldPuzzles using default no-op implementation`);
        return 0;
    }
    async removePuzzle(puzzleId) {
        void puzzleId;
        console.warn(`[${this.storageType}] removePuzzle not implemented`);
        return false;
    }
    async getRecentPlayers(hours = 24, limit = 100) {
        const sessions = await this.getActiveSessions(hours);
        const players = new Set();
        for (const sessionId of sessions.slice(0, limit)) {
            const state = await this.getNarrativeState(sessionId);
            if (state) {
                players.add(state.playerId);
            }
        }
        return Array.from(players).slice(0, limit);
    }
    async getSessionStats(sessionId) {
        const [observations, pendingCount] = await Promise.all([
            this.getPlayerObservations(sessionId, 1000),
            this.getPendingPuzzleCount(sessionId)
        ]);
        const lastObservation = observations.length > 0 ? observations[0] : null;
        return {
            observationCount: observations.length,
            pendingPuzzles: pendingCount,
            lastActivity: lastObservation && lastObservation.timestamp ? lastObservation.timestamp : null
        };
    }
    async endSession(sessionId) {
        const state = await this.getNarrativeState(sessionId);
        if (state) {
            await this.updateNarrativeState(sessionId, {
                ...state,
                generationStatus: 'idle',
                worldState: { ...state.worldState, endedAt: this.now() },
                updatedAt: this.now()
            });
        }
    }
    async resetStats() {
        this.stats = {
            reads: 0,
            writes: 0,
            deletes: 0,
            errors: 0
        };
    }
    async exportSessionData(sessionId) {
        const narrative = await this.getNarrativeState(sessionId);
        const [profile, observations] = await Promise.all([
            narrative ? this.getPlayerProfile(narrative.playerId) : Promise.resolve(null),
            this.getPlayerObservations(sessionId, 10000)
        ]);
        return {
            profile,
            narrative,
            observations,
            puzzles: []
        };
    }
    async importSessionData(sessionId, data) {
        if (data.profile) {
            await this.updatePlayerProfile(data.profile.playerId, data.profile);
        }
        if (data.narrative) {
            await this.updateNarrativeState(sessionId, data.narrative);
        }
        if (data.observations && data.observations.length > 0) {
            await this.submitObservationsBatch(data.observations.map(obs => ({
                sessionId: obs.sessionId,
                observationType: obs.observationType,
                content: obs.content,
                importance: obs.importance,
                ...(obs.playerId !== undefined ? { playerId: obs.playerId } : {}),
                ...(obs.rawQuote !== undefined ? { rawQuote: obs.rawQuote } : {}),
                ...(obs.levelId !== undefined ? { levelId: obs.levelId } : {}),
                ...(obs.sentiment !== undefined ? { sentiment: obs.sentiment } : {})
            })));
        }
        console.warn(`[${this.storageType}] Puzzle import not fully implemented in base class`);
    }
    now() {
        return new Date().toISOString();
    }
    safeJSONStringify(obj, space) {
        const seen = new WeakSet();
        return JSON.stringify(obj, (_key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular]';
                }
                seen.add(value);
            }
            if (typeof value === 'number') {
                if (!isFinite(value)) {
                    return String(value);
                }
            }
            if (typeof value === 'bigint') {
                return value.toString();
            }
            return value;
        }, space);
    }
    safeJSONParse(data, defaultValue = null) {
        try {
            return JSON.parse(data);
        }
        catch (error) {
            console.error(`[${this.storageType}] JSON parse error:`, error);
            return defaultValue;
        }
    }
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    getUptimeSeconds() {
        if (!this.initializedAt)
            return -1;
        return Math.floor((Date.now() - this.initializedAt.getTime()) / 1000);
    }
    requireConfig(key) {
        if (!(key in this.config) || this.config[key] === undefined || this.config[key] === null) {
            throw new Error(`[${this.storageType}] Required config missing: ${key}`);
        }
        return this.config[key];
    }
    getConfig(key, defaultValue) {
        return this.config[key] ?? defaultValue;
    }
}
export class StorageError extends Error {
    code;
    cause;
    constructor(message, code, cause) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.name = 'StorageError';
    }
}
export class StorageInitError extends StorageError {
    constructor(message, cause) {
        super(message, 'STORAGE_INIT_ERROR', cause);
        this.name = 'StorageInitError';
    }
}
export class StorageMigrationError extends StorageError {
    constructor(message, cause) {
        super(message, 'STORAGE_MIGRATION_ERROR', cause);
        this.name = 'StorageMigrationError';
    }
}
export class StorageConnectionError extends StorageError {
    constructor(message, cause) {
        super(message, 'STORAGE_CONNECTION_ERROR', cause);
        this.name = 'StorageConnectionError';
    }
}
export class StorageSerializationError extends StorageError {
    constructor(message, cause) {
        super(message, 'STORAGE_SERIALIZATION_ERROR', cause);
        this.name = 'StorageSerializationError';
    }
}
//# sourceMappingURL=base-storage.js.map