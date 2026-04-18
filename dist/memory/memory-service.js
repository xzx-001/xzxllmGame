import { PlayerProfileFactory } from './models/player-profile.js';
import { NarrativeStateFactory } from './models/narrative-state.js';
import { ObservationFactory } from './models/observation.js';
export class MemoryService {
    primaryStorage;
    cacheStorage;
    config;
    observationBuffer = new Map();
    flushTimer = null;
    constructor(config) {
        this.primaryStorage = config.primaryStorage;
        this.cacheStorage = config.cacheStorage;
        const configObj = {
            primaryStorage: config.primaryStorage,
            enableWriteCache: config.enableWriteCache ?? true,
            observationBatchSize: config.observationBatchSize ?? 10,
            observationFlushInterval: config.observationFlushInterval ?? 5000
        };
        if (config.cacheStorage !== undefined) {
            configObj.cacheStorage = config.cacheStorage;
        }
        this.config = configObj;
        this.startFlushTimer();
    }
    async initialize() {
        await this.primaryStorage.initialize();
        if (this.cacheStorage) {
            await this.cacheStorage.initialize();
        }
        console.log('[MemoryService] Initialized');
    }
    async getPlayerProfile(playerId) {
        if (this.cacheStorage) {
            const cached = await this.cacheStorage.get(`profile:${playerId}`);
            if (cached)
                return cached;
        }
        const profile = await this.primaryStorage.get(`profile:${playerId}`);
        if (profile && this.cacheStorage) {
            await this.cacheStorage.set(`profile:${playerId}`, profile, { ttl: 300000 });
        }
        return profile || null;
    }
    async createPlayer(playerId, displayName) {
        const profile = PlayerProfileFactory.create(displayName);
        profile.id = playerId;
        await this.savePlayerProfile(profile);
        return profile;
    }
    async savePlayerProfile(profile) {
        profile.lastActiveAt = Date.now();
        await this.primaryStorage.set(`profile:${profile.id}`, profile);
        if (this.cacheStorage && this.config.enableWriteCache) {
            await this.cacheStorage.set(`profile:${profile.id}`, profile, { ttl: 300000 });
        }
    }
    async updatePlayerSkill(playerId, levelDifficulty, success, performanceScore, skillUpdates) {
        const profile = await this.getPlayerProfile(playerId);
        if (!profile) {
            throw new Error(`Player ${playerId} not found`);
        }
        PlayerProfileFactory.updateSkillRating(profile, levelDifficulty, success, performanceScore);
        if (skillUpdates) {
            PlayerProfileFactory.updateSkills(profile, skillUpdates);
        }
        if (success) {
            PlayerProfileFactory.recordLevelAttempt(profile, 'unknown_level', true, performanceScore * 300, 0);
        }
        await this.savePlayerProfile(profile);
    }
    async updatePlayerEmotion(playerId, emotion, value, trigger) {
        const profile = await this.getPlayerProfile(playerId);
        if (!profile)
            return;
        PlayerProfileFactory.updateEmotion(profile, emotion, value, trigger);
        await this.savePlayerProfile(profile);
    }
    async getOrCreateNarrative(playerId, theme = 'default') {
        const key = `narrative:${playerId}`;
        const existing = await this.primaryStorage.get(key);
        if (existing) {
            if (!(existing.nodes instanceof Map)) {
                existing.nodes = new Map(Object.entries(existing.nodes));
            }
            return existing;
        }
        const state = NarrativeStateFactory.create(playerId, theme);
        await this.saveNarrativeState(state);
        return state;
    }
    async saveNarrativeState(state) {
        const serializable = {
            ...state,
            nodes: Object.fromEntries(state.nodes)
        };
        await this.primaryStorage.set(`narrative:${state.playerId}`, serializable);
    }
    async advanceNarrative(playerId, choiceIndex) {
        const state = await this.getOrCreateNarrative(playerId);
        const nextNode = NarrativeStateFactory.navigateToNode(state, choiceIndex);
        if (!nextNode) {
            return { success: false };
        }
        await this.saveNarrativeState(state);
        return { success: true, node: nextNode, state };
    }
    async updateNarrativeMood(playerId, mood) {
        const state = await this.getOrCreateNarrative(playerId);
        NarrativeStateFactory.updateMood(state, mood);
        await this.saveNarrativeState(state);
    }
    async recordObservation(playerId, type, locationId, details = {}, puzzleId) {
        const obs = ObservationFactory.create(playerId, type, locationId, details, puzzleId);
        if (!this.observationBuffer.has(playerId)) {
            this.observationBuffer.set(playerId, []);
        }
        const buffer = this.observationBuffer.get(playerId);
        buffer.push(obs);
        if (buffer.length >= this.config.observationBatchSize) {
            await this.flushObservations(playerId);
        }
    }
    async flushObservations(playerId) {
        const buffer = this.observationBuffer.get(playerId);
        if (!buffer || buffer.length === 0)
            return;
        this.observationBuffer.set(playerId, []);
        const batch = ObservationFactory.processBatch(buffer);
        await this.primaryStorage.setMany(batch.observations.map(obs => ({
            key: `obs:${obs.id}`,
            value: obs
        })));
        const profile = await this.getPlayerProfile(playerId);
        if (profile && batch.recommendedAction.difficultyDelta !== 0) {
            profile.preferences.difficultyBias = Math.max(-0.5, Math.min(0.5, profile.preferences.difficultyBias + batch.recommendedAction.difficultyDelta));
            if (batch.recommendedAction.mood === 'concerned') {
                PlayerProfileFactory.updateEmotion(profile, 'frustrationLevel', 0.6, batch.observations[0]?.type || 'batch_analysis');
            }
            await this.savePlayerProfile(profile);
        }
        console.log(`[MemoryService] Processed ${buffer.length} observations for ${playerId}`);
    }
    async getRecentObservations(playerId, limit = 50) {
        const results = await this.primaryStorage.query({
            prefix: `obs:`,
            filter: (obs) => obs.playerId === playerId,
            orderBy: 'createdAt',
            order: 'desc',
            limit
        });
        return results.map(r => r.value);
    }
    async getRecommendedDifficulty(playerId) {
        const profile = await this.getPlayerProfile(playerId);
        if (!profile)
            return 0.5;
        return PlayerProfileFactory.calculateRecommendedDifficulty(profile);
    }
    async generatePlayerContext(playerId) {
        const [profile, narrative, observations] = await Promise.all([
            this.getPlayerProfile(playerId),
            this.getOrCreateNarrative(playerId),
            this.getRecentObservations(playerId, 10)
        ]);
        if (!profile) {
            throw new Error(`Player ${playerId} not found`);
        }
        return {
            profileSummary: PlayerProfileFactory.generateSummary(profile),
            narrativeContext: NarrativeStateFactory.getPathDescription(narrative),
            recentObservations: observations,
            currentMood: narrative.context.currentMood
        };
    }
    async healthCheck() {
        const primaryStats = await this.primaryStorage.getStats();
        const cacheStats = this.cacheStorage
            ? await this.cacheStorage.getStats()
            : null;
        return {
            primary: primaryStats.timestamp !== undefined,
            cache: cacheStats !== null ? cacheStats.timestamp !== undefined : false,
            stats: {
                primary: primaryStats,
                cache: cacheStats
            }
        };
    }
    async dispose() {
        for (const playerId of this.observationBuffer.keys()) {
            await this.flushObservations(playerId);
        }
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        await this.primaryStorage.dispose();
        if (this.cacheStorage) {
            await this.cacheStorage.dispose();
        }
    }
    startFlushTimer() {
        this.flushTimer = setInterval(() => {
            for (const playerId of this.observationBuffer.keys()) {
                this.flushObservations(playerId).catch(err => {
                    console.error(`[MemoryService] Failed to flush ${playerId}:`, err);
                });
            }
        }, this.config.observationFlushInterval);
    }
}
//# sourceMappingURL=memory-service.js.map