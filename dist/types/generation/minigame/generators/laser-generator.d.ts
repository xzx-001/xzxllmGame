import { MiniGameType, MiniGameContext, MiniGameZone, MiniGameConfig, ValidationResult, Position } from '../types.js';
import { BaseMiniGameGenerator } from '../base-generator.js';
export declare enum LaserComponentType {
    SOURCE = "source",
    TARGET = "target",
    MIRROR = "mirror",
    FIXED_MIRROR = "fixed_mirror",
    SPLITTER = "splitter",
    BLOCK = "block",
    PORTAL = "portal",
    PRISM = "prism"
}
export declare enum Direction {
    UP = 0,
    RIGHT = 1,
    DOWN = 2,
    LEFT = 3
}
export interface LaserComponent {
    id: string;
    type: LaserComponentType;
    position: Position;
    direction: Direction;
    fixed: boolean;
    properties?: {
        color?: 'red' | 'green' | 'blue' | 'white';
        intensity?: number;
        targetId?: string;
        reflectiveSides?: number[];
    };
}
export interface LightPath {
    start: Position;
    direction: Direction;
    segments: Array<{
        from: Position;
        to: Position;
        hitComponent?: string | undefined;
    }>;
    hitsTarget: boolean;
    hitTargetId?: string;
}
export interface LaserConfig extends MiniGameConfig {
    type: MiniGameType.LASER_MIRROR;
    width: number;
    height: number;
    components: LaserComponent[];
    requiredTargets: string[];
    optionalTargets?: string[];
    mirrorDependencies?: Array<{
        mirrorId: string;
        mustBeSetAfter: string[];
        reason: string;
    }>;
    solutionPath?: LightPath[];
    maxRotations?: number;
    allowMoving?: boolean;
}
export declare class LaserGenerator extends BaseMiniGameGenerator<LaserConfig> {
    readonly type = MiniGameType.LASER_MIRROR;
    readonly name = "Laser Mirror Puzzle";
    readonly supportedDifficultyRange: [number, number];
    readonly minSize: {
        width: number;
        height: number;
    };
    buildPrompt(context: MiniGameContext): string;
    parseResponse(response: string, zoneId: string, position: Position): MiniGameZone;
    validate(zone: MiniGameZone): ValidationResult;
    generateFallback(context: MiniGameContext): MiniGameZone;
    private calculateSolutionPath;
    private traceBeam;
    private getNextPosition;
    private reflectDirection;
    private calculateDifficulty;
    private calculateMirrorDependencyDepth;
    checkSolvability(config: LaserConfig): {
        solvable: boolean;
        solution?: unknown[];
    };
}
//# sourceMappingURL=laser-generator.d.ts.map