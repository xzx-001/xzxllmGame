import { PlayerProfile } from '../../memory/models/player-profile.js';
import { NarrativeState } from '../../memory/models/narrative-state.js';
import { MiniGameZone } from '../minigame/types.js';
import { DialogueContext } from './dialogue-generator.js';
export interface ContextBuildParams {
    playerProfile: PlayerProfile;
    narrativeState: NarrativeState;
    llmProvider: any;
    currentGameZone?: MiniGameZone;
    recentObservations?: Array<{
        type: string;
        success: boolean;
        timestamp: number;
    }>;
}
export declare class DialogueContextBuilder {
    private params;
    private maxNodes;
    private forcedTopic?;
    constructor(params: ContextBuildParams);
    setMaxNodes(count: number): this;
    setTopic(topic: string): this;
    build(): DialogueContext;
    private determineTopic;
    private filterAvailableClues;
    private calculateMaxNodes;
    static quickBuild(params: ContextBuildParams): DialogueContext;
}
//# sourceMappingURL=context-builder.d.ts.map