import { AIMood } from '../../../memory/models/narrative-state.js';
export interface BridgeTemplate {
    condition: 'success' | 'failure' | 'neutral';
    moods: AIMood[];
    texts: string[];
    timeAware: boolean;
}
export declare class BridgeTemplates {
    private templates;
    getBridge(success: boolean, mood: AIMood, timeSpent?: number): string;
    private randomPick;
    addTemplate(template: BridgeTemplate): void;
}
//# sourceMappingURL=bridge-templates.d.ts.map