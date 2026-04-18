import { AIMood } from '../../../memory/models/narrative-state.js';
export interface NarrativeTemplate {
    id: string;
    themes: string[];
    moods: AIMood[];
    text: string;
    variables: string[];
    baseDifficulty: number;
}
export declare class IntroTemplates {
    private templates;
    findMatch(theme: string, mood: AIMood): NarrativeTemplate | undefined;
    getByTheme(theme: string): NarrativeTemplate[];
    render(template: NarrativeTemplate, variables: Record<string, string>): string;
    addTemplate(template: NarrativeTemplate): void;
}
//# sourceMappingURL=intro-templates.d.ts.map