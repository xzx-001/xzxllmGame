import { PlayerProfile } from '../models/player-profile.js';
export interface SentimentResult {
    polarity: number;
    intensity: number;
    dominantEmotion: 'anger' | 'confusion' | 'excitement' | 'satisfaction' | 'frustration' | 'curiosity' | 'neutral';
    urgency: number;
    keywords: string[];
    recommendedTone: 'empathetic' | 'cheerful' | 'serious' | 'mysterious' | 'playful';
    strategy: 'provide_hint' | 'offer_encouragement' | 'maintain_challenge' | 'back_off' | 'escalate_help';
}
export declare class SentimentAnalyzer {
    private useExternalAPI;
    private externalAPIEndpoint;
    constructor(useExternalAPI?: boolean, externalEndpoint?: string);
    analyze(text: string, context?: PlayerProfile): Promise<SentimentResult>;
    private analyzeWithRules;
    private analyzeWithAPI;
    private determineStrategy;
    analyzeBatch(texts: string[]): Promise<SentimentResult[]>;
    needsImmediateAttention(text: string): boolean;
}
//# sourceMappingURL=sentiment-analyzer.d.ts.map