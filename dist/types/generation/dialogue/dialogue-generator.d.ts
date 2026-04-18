import { ILLMProvider } from '../../llm/types.js';
import { PlayerProfile } from '../../memory/models/player-profile.js';
import { AIMood, NarrativeState } from '../../memory/models/narrative-state.js';
export interface DialogueNode {
    id: string;
    speaker: string;
    text: string;
    emotion?: string;
    options?: DialogueOption[];
    triggers?: string[];
    revealsClue?: string;
    requires?: string[];
    metadata?: {
        generationTime: number;
        aiMood: AIMood;
    };
}
export interface DialogueOption {
    id: string;
    text: string;
    nextNodeId?: string;
    condition?: string;
    effects?: Record<string, number | boolean>;
    type: 'question' | 'answer' | 'action' | 'exit';
}
export interface DialogueContext {
    playerProfile: PlayerProfile;
    narrativeState: NarrativeState;
    currentTopic?: string;
    availableClues: string[];
    llmProvider: ILLMProvider;
    maxNodes?: number;
}
export declare class DialogueGenerator {
    generateDialogue(context: DialogueContext): Promise<DialogueNode[]>;
    private generateNode;
    private buildNodePrompt;
    private parseNodeResponse;
    generateQuickReply(playerInput: string, context: DialogueContext): Promise<string>;
    private cleanText;
}
//# sourceMappingURL=dialogue-generator.d.ts.map