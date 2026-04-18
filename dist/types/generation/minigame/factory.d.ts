import { IMiniGameGenerator, MiniGameType, MiniGameGeneratorConstructor } from './types.js';
export declare class GeneratorFactoryError extends Error {
    constructor(message: string);
}
export declare class MiniGameGeneratorFactory {
    private static registry;
    static register(generator: IMiniGameGenerator): void;
    static override(generator: IMiniGameGenerator): void;
    static getGenerator(type: MiniGameType): IMiniGameGenerator;
    static hasGenerator(type: MiniGameType): boolean;
    static getAvailableTypes(): MiniGameType[];
    static getGeneratorInfos(): Array<{
        type: MiniGameType;
        name: string;
        supportedDifficulty: [number, number];
    }>;
    static getSuitableTypes(difficulty: number): MiniGameType[];
    static createRandomZone(difficulty: number, availableTypes?: MiniGameType[]): Promise<ReturnType<IMiniGameGenerator['generateFallback']>>;
    static unregister(type: MiniGameType): boolean;
    static clear(): void;
    static getStats(): {
        totalRegistered: number;
        types: MiniGameType[];
    };
}
export declare function RegisterMiniGame(): <T extends MiniGameGeneratorConstructor>(constructor: T) => T;
//# sourceMappingURL=factory.d.ts.map