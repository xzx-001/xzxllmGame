import { IMiniGameGenerator, MiniGameType, MiniGameConfig, MiniGameContext, MiniGameZone, GenerationResult, ValidationResult, ZoneSize, Position } from './types.js';
export interface BaseGeneratorOptions {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
    validateSolvability?: boolean;
    debug?: boolean;
}
export declare abstract class BaseMiniGameGenerator<T extends MiniGameConfig = MiniGameConfig> implements IMiniGameGenerator<T> {
    abstract readonly type: MiniGameType;
    abstract readonly name: string;
    abstract readonly supportedDifficultyRange: [number, number];
    abstract readonly minSize: ZoneSize;
    protected options: Required<BaseGeneratorOptions>;
    constructor(options?: BaseGeneratorOptions);
    abstract buildPrompt(context: MiniGameContext): string;
    abstract parseResponse(response: string, zoneId: string, position: Position): MiniGameZone;
    abstract validate(zone: MiniGameZone): ValidationResult;
    abstract generateFallback(context: MiniGameContext): MiniGameZone;
    generate(context: MiniGameContext): Promise<GenerationResult<T>>;
    protected callLLM(context: MiniGameContext, prompt: string): Promise<string>;
    protected extractJSON(response: string, zoneId: string): string;
    protected validateCommon(zone: MiniGameZone): ValidationResult;
    checkSolvability?(config: T): {
        solvable: boolean;
        solution?: unknown[];
    };
    protected delay(ms: number): Promise<void>;
    protected generateId(prefix: string): string;
    protected interpolate(difficulty: number, min: number, max: number): number;
    protected selectByDifficulty<T>(difficulty: number, options: Array<{
        threshold: number;
        value: T;
    }>): T;
}
//# sourceMappingURL=base-generator.d.ts.map