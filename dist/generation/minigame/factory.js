export class GeneratorFactoryError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GeneratorFactoryError';
    }
}
export class MiniGameGeneratorFactory {
    static registry = new Map();
    static register(generator) {
        if (this.registry.has(generator.type)) {
            throw new GeneratorFactoryError(`Generator for type "${generator.type}" is already registered. ` +
                `Use override() to replace existing generator.`);
        }
        this.registry.set(generator.type, generator);
        console.log(`[MiniGameFactory] Registered generator: ${generator.name} (${generator.type})`);
    }
    static override(generator) {
        this.registry.set(generator.type, generator);
        console.log(`[MiniGameFactory] Overridden generator: ${generator.name} (${generator.type})`);
    }
    static getGenerator(type) {
        const generator = this.registry.get(type);
        if (!generator) {
            throw new GeneratorFactoryError(`No generator registered for type "${type}". ` +
                `Available types: ${this.getAvailableTypes().join(', ')}`);
        }
        return generator;
    }
    static hasGenerator(type) {
        return this.registry.has(type);
    }
    static getAvailableTypes() {
        return Array.from(this.registry.keys());
    }
    static getGeneratorInfos() {
        return Array.from(this.registry.entries()).map(([type, generator]) => ({
            type,
            name: generator.name,
            supportedDifficulty: generator.supportedDifficultyRange
        }));
    }
    static getSuitableTypes(difficulty) {
        const suitable = [];
        for (const [type, generator] of this.registry.entries()) {
            const [min, max] = generator.supportedDifficultyRange;
            if (difficulty >= min && difficulty <= max) {
                suitable.push(type);
            }
        }
        return suitable;
    }
    static async createRandomZone(difficulty, availableTypes) {
        const types = availableTypes || this.getAvailableTypes();
        if (types.length === 0) {
            throw new GeneratorFactoryError('No generators available');
        }
        const randomType = types[Math.floor(Math.random() * types.length)];
        const generator = this.getGenerator(randomType);
        const mockContext = {
            targetDifficulty: difficulty,
            playerProfile: {},
            availableSize: { width: 8, height: 8 },
            zoneId: `random_${Date.now()}`,
            position: { x: 0, y: 0 },
            theme: 'random',
            llmProvider: {}
        };
        return generator.generateFallback(mockContext);
    }
    static unregister(type) {
        const existed = this.registry.delete(type);
        if (existed) {
            console.log(`[MiniGameFactory] Unregistered generator: ${type}`);
        }
        return existed;
    }
    static clear() {
        this.registry.clear();
        console.log('[MiniGameFactory] Cleared all generators');
    }
    static getStats() {
        return {
            totalRegistered: this.registry.size,
            types: this.getAvailableTypes()
        };
    }
}
export function RegisterMiniGame() {
    return function (constructor) {
        const instance = new constructor();
        MiniGameGeneratorFactory.register(instance);
        return constructor;
    };
}
//# sourceMappingURL=factory.js.map