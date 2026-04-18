import { ILLMProvider } from '../../llm/types.js';
import { PlayerProfile } from '../../memory/models/player-profile.js';
import { AIMood, NarrativeState } from '../../memory/models/narrative-state.js';
import { MiniGameType, MiniGameZone } from '../minigame/types.js';
export interface NarrativeContext {
    state: NarrativeState;
    playerProfile: PlayerProfile;
    upcomingGame?: MiniGameZone;
    completedGame?: {
        zone: MiniGameZone;
        success: boolean;
        timeSpent: number;
    };
    llmProvider: ILLMProvider;
    maxLength?: number;
}
export interface NarrativeResult {
    content: string;
    type: 'intro' | 'bridge' | 'climax' | 'resolution';
    clues?: string[];
    suggestedMood: AIMood;
    promptUsed?: string;
}
export declare class NarrativeGenerator {
    private promptBuilder;
    constructor();
    generateIntro(context: NarrativeContext): Promise<NarrativeResult>;
    generateBridge(context: NarrativeContext): Promise<NarrativeResult>;
    generateClimax(context: NarrativeContext): Promise<NarrativeResult>;
    wrapMechanicInNarrative(gameType: MiniGameType, baseDescription: string, theme: string): {
        narrativeName: string;
        description: string;
        verb: string;
    };
    generateChoices(context: NarrativeContext, choiceCount?: number): Promise<Array<{
        text: string;
        consequence: string;
        difficulty: number;
    }>>;
    private cleanNarrativeText;
    private extractClues;
    private detectMoodShift;
    private getSuccessMood;
    private getFailureMood;
}
//# sourceMappingURL=narrative-generator.d.ts.map