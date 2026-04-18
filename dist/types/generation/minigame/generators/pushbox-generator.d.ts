import { MiniGameType, MiniGameContext, MiniGameZone, MiniGameConfig, ValidationResult, Position } from '../types.js';
import { BaseMiniGameGenerator } from '../base-generator.js';
export interface PushboxConfig extends MiniGameConfig {
    type: MiniGameType.PUSHBOX;
    width: number;
    height: number;
    playerStart: Position;
    boxes: Array<{
        id: string;
        start: Position;
        target: Position;
    }>;
    walls: Position[];
    dependencyChain?: Array<{
        boxId: string;
        dependsOn: string[];
        reason: string;
    }>;
    reservedPaths: Array<{
        from: Position;
        to: Position;
        type: 'player' | 'push' | 'return';
    }>;
    deadlockChecks: Array<{
        position: Position;
        allowedNeighbors: Position[];
    }>;
}
export declare class PushboxGenerator extends BaseMiniGameGenerator<PushboxConfig> {
    readonly type = MiniGameType.PUSHBOX;
    readonly name = "Pushbox (Sokoban)";
    readonly supportedDifficultyRange: [number, number];
    readonly minSize: {
        width: number;
        height: number;
    };
    buildPrompt(context: MiniGameContext): string;
    parseResponse(response: string, zoneId: string, position: Position): MiniGameZone;
    validate(zone: MiniGameZone): ValidationResult;
    generateFallback(context: MiniGameContext): MiniGameZone;
    checkSolvability(config: PushboxConfig): {
        solvable: boolean;
        solution?: unknown[];
    };
    private calculateDifficulty;
    private calculateDependencyDepth;
    private buildGrid;
    private isValidPos;
}
//# sourceMappingURL=pushbox-generator.d.ts.map