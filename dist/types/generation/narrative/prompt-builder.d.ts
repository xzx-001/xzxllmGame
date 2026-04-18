import { NarrativeState, AIMood } from '../../memory/models/narrative-state.js';
import { PlayerProfile } from '../../memory/models/player-profile.js';
import { MiniGameZone } from '../minigame/types.js';
interface BaseBuildParams {
    state: NarrativeState;
    playerProfile: PlayerProfile;
    mood: AIMood;
    maxLength?: number;
}
interface IntroBuildParams extends BaseBuildParams {
    upcomingGame?: MiniGameZone | undefined;
    theme: string;
}
interface BridgeBuildParams extends BaseBuildParams {
    completedGame: {
        zone: MiniGameZone;
        success: boolean;
        timeSpent: number;
    };
    upcomingGame?: MiniGameZone | undefined;
}
interface ClimaxBuildParams {
    state: NarrativeState;
    playerProfile: PlayerProfile;
    accumulatedClues: string[];
    tensionLevel: number;
}
export declare class PromptBuilder {
    private narrativeGenerator?;
    buildIntroPrompt(params: IntroBuildParams): string;
    buildBridgePrompt(params: BridgeBuildParams): string;
    buildClimaxPrompt(params: ClimaxBuildParams): string;
    private wrapGameMechanic;
    private getBaseDescription;
    private getToneDescription;
}
export {};
//# sourceMappingURL=prompt-builder.d.ts.map