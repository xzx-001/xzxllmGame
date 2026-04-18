import { EventEmitter } from 'events';
import { container as globalContainer } from './container.js';
import { TypedEventBus } from './event-bus.js';
import { ConfigManager } from './config/config-manager.js';
import { DEFAULT_CONFIG } from './config/default.config.js';
import { AIMood } from './interfaces/base.types.js';
export class XZXLLMGameEngine extends EventEmitter {
    config;
    container;
    configManager;
    initialized = false;
    disposing = false;
    generationQueue = new Map();
    pregenerationTimers = new Map();
    constructor(config, customContainer) {
        super();
        this.config = config;
        this.container = customContainer || globalContainer.createChild();
    }
    async initialize() {
        if (this.initialized) {
            console.warn('[Engine] Already initialized');
            return;
        }
        try {
            this.emit('status', { status: 'initializing', stage: 'config' });
            this.configManager = new ConfigManager();
            await this.configManager.load();
            if (this.config) {
                this.configManager.merge({
                    llm: this.config.llm,
                    storage: this.config.storage,
                    generation: this.config.generation
                });
            }
            this.configManager.validate();
            this.emit('status', { status: 'initializing', stage: 'storage' });
            this.container.register('storage', () => this.createStorage(), { singleton: true });
            this.emit('status', { status: 'initializing', stage: 'llm' });
            this.container.register('llm', () => this.createLLMProvider(), { singleton: true });
            this.container.register('config', () => this.configManager, { singleton: true });
            this.container.register('eventBus', () => new TypedEventBus(), { singleton: true });
            if (this.config.storage?.type !== 'memory') {
                const storage = this.container.get('storage');
                await storage.initialize();
            }
            this.initialized = true;
            this.emit('initialized');
            this.emit('status', { status: 'ready' });
            console.log('[Engine] xzxllmGame initialized successfully');
        }
        catch (error) {
            this.emit('error', error);
            this.emit('status', { status: 'error', error });
            throw new Error(`Engine initialization failed: ${error}`);
        }
    }
    async generateLevel(params) {
        this.ensureInitialized();
        const { sessionId } = params;
        try {
            if (this.generationQueue.has(sessionId)) {
                console.log(`[Engine] Generation already in progress for ${sessionId}, waiting...`);
                return this.generationQueue.get(sessionId);
            }
            const generationPromise = this.doGenerateLevel(params);
            this.generationQueue.set(sessionId, generationPromise);
            generationPromise.finally(() => {
                this.generationQueue.delete(sessionId);
            });
            return await generationPromise;
        }
        catch (error) {
            console.error(`[Engine] Generation failed for ${sessionId}:`, error);
            throw error;
        }
    }
    async getNextLevel(sessionId) {
        this.ensureInitialized();
        const storage = this.container.get('storage');
        const puzzle = await storage.consumeNextPuzzle(sessionId);
        if (puzzle) {
            this.emit('level:consumed', { sessionId, levelId: puzzle.metadata?.id });
            return puzzle;
        }
        return null;
    }
    async submitFeedback(sessionId, feedback) {
        this.ensureInitialized();
        const storage = this.container.get('storage');
        await storage.submitObservation({
            sessionId,
            observationType: feedback.type,
            content: feedback.content,
            importance: feedback.importance || 5,
            ...(feedback.rawQuote !== undefined ? { rawQuote: feedback.rawQuote } : {})
        });
        this.analyzeFeedbackAsync(sessionId).catch((err) => {
            console.error('[Engine] Feedback analysis failed:', err);
        });
        this.emit('feedback:received', { sessionId, type: feedback.type });
    }
    async getPlayerStats(playerId) {
        this.ensureInitialized();
        const storage = this.container.get('storage');
        return await storage.getPlayerProfile(playerId);
    }
    async healthCheck() {
        const checks = {};
        try {
            if (this.container.has('storage')) {
                checks.storage = true;
            }
            if (this.container.has('llm')) {
                const llm = this.container.get('llm');
                checks.llm = llm.isAvailable;
            }
            const allHealthy = Object.values(checks).every((v) => v);
            return {
                status: allHealthy ? 'healthy' : 'degraded',
                components: checks
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                components: { ...checks, error: false }
            };
        }
    }
    async dispose() {
        if (this.disposing)
            return;
        this.disposing = true;
        this.emit('status', { status: 'disposing' });
        for (const timer of this.pregenerationTimers.values()) {
            clearTimeout(timer);
        }
        this.pregenerationTimers.clear();
        const pendingGenerations = Array.from(this.generationQueue.values());
        if (pendingGenerations.length > 0) {
            console.log(`[Engine] Waiting for ${pendingGenerations.length} pending generations...`);
            await Promise.race([
                Promise.all(pendingGenerations),
                new Promise(resolve => setTimeout(resolve, 5000))
            ]);
        }
        await this.container.dispose();
        this.initialized = false;
        this.emit('disposed');
        console.log('[Engine] Resources disposed');
    }
    async doGenerateLevel(params) {
        const startTime = Date.now();
        const storage = this.container.get('storage');
        const eventBus = this.container.get('eventBus');
        const { playerId, sessionId } = params;
        const difficulty = params.difficulty ?? this.configManager.get('generation.defaultDifficulty', 0.5);
        let profile = await storage.getPlayerProfile(playerId);
        if (!profile) {
            profile = await this.createDefaultProfile(playerId);
        }
        let narrativeState = await storage.getNarrativeState(sessionId);
        if (!narrativeState) {
            narrativeState = await this.createDefaultNarrativeState(sessionId, playerId);
        }
        this.emit('generation:started', { sessionId, difficulty });
        eventBus.emit('generation:started', { sessionId });
        const mapSize = this.calculateMapSize(difficulty);
        const baseMap = {
            size: mapSize,
            theme: (params.theme || 'dungeon'),
            playerStart: { x: 1, y: 1 },
            exitPosition: { x: mapSize[0] - 2, y: mapSize[1] - 2 },
            safeZones: [{ x: 1, y: 1 }, { x: mapSize[0] - 2, y: mapSize[1] - 2 }],
            ambientElements: []
        };
        const miniGames = [];
        const miniGameCount = difficulty > 0.7 ? 3 : difficulty > 0.4 ? 2 : 1;
        for (let i = 0; i < miniGameCount; i++) {
            const progress = {
                sessionId,
                stage: 'generating_minigame',
                currentStep: i + 1,
                totalSteps: miniGameCount,
                percent: Math.floor((i / miniGameCount) * 100),
                message: `Generating mini-game ${i + 1}/${miniGameCount}`,
                timestamp: new Date().toISOString()
            };
            this.emit('generation:progress', progress);
            miniGames.push({
                id: `mg_${i}`,
                type: 'pushbox',
                bounds: { x: 3 + i * 5, y: 3, w: 5, h: 5 },
                config: {},
                difficulty: difficulty
            });
        }
        const levelId = `lvl_${sessionId}_${Date.now()}`;
        const level = {
            metadata: {
                id: levelId,
                version: '1.0.0',
                totalDifficulty: difficulty,
                intendedMood: narrativeState.currentMood || AIMood.PLAYFUL,
                estimatedTime: this.estimateTime(miniGames.length, difficulty),
                tags: miniGames.map((g) => g.type),
                generatedAt: new Date().toISOString()
            },
            baseMap,
            miniGames,
            props: [],
            narrativeBridge: `Welcome to level ${levelId}`,
            dialogues: [],
            debugInfo: this.config.debug ? {
                generationTime: Date.now() - startTime
            } : undefined
        };
        await storage.storePuzzle(sessionId, level, difficulty, level.metadata.intendedMood);
        this.emit('level:generated', { sessionId, levelId: level.metadata.id, level });
        eventBus.emit('level:generated', level);
        this.schedulePregeneration(sessionId, params);
        return level;
    }
    async createDefaultProfile(playerId) {
        const storage = this.container.get('storage');
        const profile = {
            playerId,
            skillRating: DEFAULT_CONFIG.player.skillRating,
            preferredTypes: [],
            frustrationLevel: DEFAULT_CONFIG.player.frustrationLevel,
            winStreak: 0,
            loseStreak: 0,
            relationshipStage: DEFAULT_CONFIG.player.relationshipStage,
            lastUpdated: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        await storage.updatePlayerProfile(playerId, profile);
        return profile;
    }
    async createDefaultNarrativeState(sessionId, playerId) {
        const storage = this.container.get('storage');
        const state = {
            sessionId,
            playerId,
            currentMood: DEFAULT_CONFIG.player.currentMood,
            generationStatus: 'idle',
            aiImpression: 'New player, initial encounter',
            ongoingPlot: 'beginning',
            worldState: {},
            updatedAt: new Date().toISOString()
        };
        await storage.updateNarrativeState(sessionId, state);
        return state;
    }
    async analyzeFeedbackAsync(sessionId) {
        const storage = this.container.get('storage');
        const observations = await storage.getUnprocessedObservations(50);
        const sessionObs = observations.filter((o) => o.sessionId === sessionId);
        if (sessionObs.length === 0)
            return;
        let frustrationDelta = 0;
        for (const obs of sessionObs) {
            if (obs.observationType === 'frustration')
                frustrationDelta += 0.1;
            if (obs.observationType === 'completion')
                frustrationDelta -= 0.05;
        }
        const narrativeState = await storage.getNarrativeState(sessionId);
        if (narrativeState) {
            const newFrustration = Math.max(0, Math.min(1, narrativeState.frustrationLevel + frustrationDelta));
            await storage.updateNarrativeState(sessionId, {
                frustrationLevel: newFrustration
            });
        }
        const ids = sessionObs.map((o) => o.id).filter((id) => id !== undefined);
        await storage.markObservationsProcessed(ids);
    }
    createStorage() {
        const storageType = this.configManager.get('storage.type', 'sqlite');
        const { SQLiteStorageAdapter } = require('../memory/storage/sqlite-adapter.js');
        switch (storageType) {
            case 'sqlite':
                return new SQLiteStorageAdapter({
                    dbPath: this.configManager.get('storage.connectionString', './data/game.db')
                });
            case 'memory':
                const { MemoryStorageAdapter } = require('../memory/storage/memory-adapter.js');
                return new MemoryStorageAdapter();
            default:
                throw new Error(`Unsupported storage type: ${storageType}`);
        }
    }
    createLLMProvider() {
        const { LLMProviderFactory } = require('../llm/factory.js');
        const llmConfig = {
            provider: this.config.llm.provider,
            model: this.config.llm.model,
            apiKey: this.config.llm.apiKey,
            baseUrl: this.config.llm.baseUrl,
            localOptions: this.config.llm.localOptions,
            timeout: this.configManager.get('llm.timeout', 30000),
            retryAttempts: 3
        };
        return LLMProviderFactory.createProvider(llmConfig);
    }
    calculateMapSize(difficulty) {
        if (difficulty > 0.8)
            return [18, 18];
        if (difficulty > 0.5)
            return [14, 14];
        return [10, 10];
    }
    estimateTime(miniGameCount, difficulty) {
        const baseTime = 60;
        const perPuzzle = 90 * difficulty;
        return Math.floor(baseTime + miniGameCount * perPuzzle);
    }
    schedulePregeneration(sessionId, params) {
        const pregenerateCount = this.configManager.get('generation.pregenerateCount', 1);
        if (pregenerateCount <= 0)
            return;
        const timer = setTimeout(async () => {
            try {
                const storage = this.container.get('storage');
                const pending = await storage.getPendingPuzzleCount(sessionId);
                if (pending < pregenerateCount) {
                    console.log(`[Engine] Pregenerating level for ${sessionId}...`);
                    this.generateLevel(params).catch((err) => {
                        console.warn('[Engine] Pregeneration failed:', err);
                    });
                }
            }
            catch (error) {
                console.error('[Engine] Pregeneration check failed:', error);
            }
        }, 1000);
        this.pregenerationTimers.set(sessionId, timer);
    }
    ensureInitialized() {
        if (!this.initialized) {
            throw new Error('Engine not initialized. Call initialize() first.');
        }
        if (this.disposing) {
            throw new Error('Engine is being disposed');
        }
    }
}
export function createEngine(config, container) {
    return new XZXLLMGameEngine(config, container);
}
//# sourceMappingURL=engine.js.map