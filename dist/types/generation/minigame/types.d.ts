import { ILLMProvider } from '../../llm/types.js';
import { PlayerProfile } from '../../memory/models/player-profile.js';
import type { BaseGeneratorOptions } from './base-generator.js';
export declare enum MiniGameType {
    PUSHBOX = "pushbox",
    LASER_MIRROR = "laser_mirror",
    CIRCUIT_CONNECTION = "circuit_connection",
    RIDDLE = "riddle",
    SLIDING_PUZZLE = "sliding_puzzle",
    MEMORY_SEQUENCE = "memory_sequence",
    LOGIC_GRID = "logic_grid"
}
export interface Position {
    x: number;
    y: number;
}
export interface ZoneSize {
    width: number;
    height: number;
}
export interface MiniGameZone {
    id: string;
    type: MiniGameType;
    position: Position;
    size: ZoneSize;
    initialConfig: MiniGameConfig;
    difficulty: number;
    estimatedTime: number;
    allowHints: boolean;
    narrativeContextId?: string;
}
export interface MiniGameConfig {
    version: string;
    type: MiniGameType;
    winCondition: string;
    maxSteps?: number;
    timeLimit?: number;
}
export interface MiniGameContext {
    targetDifficulty: number;
    playerProfile: PlayerProfile;
    availableSize: ZoneSize;
    zoneId: string;
    position: Position;
    theme?: string;
    prerequisites?: string[];
    llmProvider: ILLMProvider;
    timeout?: number;
}
export interface GenerationResult<T extends MiniGameConfig = MiniGameConfig> {
    success: boolean;
    config?: T;
    error?: string;
    usedPrompt?: string | undefined;
    rawResponse?: string | undefined;
    metadata?: {
        generationTime: number;
        llmTokensUsed?: number;
        attempts: number;
    };
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    suggestions?: string[];
}
export interface IMiniGameGenerator<T extends MiniGameConfig = MiniGameConfig> {
    readonly type: MiniGameType;
    readonly name: string;
    readonly supportedDifficultyRange: [number, number];
    readonly minSize: ZoneSize;
    buildPrompt(context: MiniGameContext): string;
    parseResponse(response: string, zoneId: string, position: Position): MiniGameZone;
    validate(zone: MiniGameZone): ValidationResult;
    generateFallback(context: MiniGameContext): MiniGameZone;
    generate(context: MiniGameContext): Promise<GenerationResult<T>>;
    checkSolvability?(config: T): {
        solvable: boolean;
        solution?: unknown[];
    };
}
export type MiniGameGeneratorConstructor = new (options?: BaseGeneratorOptions) => IMiniGameGenerator;
//# sourceMappingURL=types.d.ts.map