import { Observation } from '../models/observation.js';
import { PlayerProfile } from '../models/player-profile.js';
export interface DifficultyAnalysisInput {
    recentObservations: Observation[];
    playerProfile: PlayerProfile;
    currentBaseline: number;
    maxFrustration: number;
    minEngagement: number;
}
export interface DifficultyAdjustment {
    recommendedDifficulty: number;
    adjustmentDelta: number;
    reason: string;
    confidence: number;
    prediction: {
        expectedWinRate: number;
        expectedFrustration: number;
        expectedTimeMinutes: number;
    };
    nextReviewInSeconds: number;
}
export declare class DifficultyAnalyzer {
    private readonly MAX_ADJUSTMENT;
    analyze(input: DifficultyAnalysisInput): DifficultyAdjustment;
    private calculateMetrics;
    private normalizeWinRate;
    private normalizeTime;
    private normalizeAttempts;
    private calculateEmotionMultiplier;
    private predictOutcome;
    private generateReason;
    private calculateNextReview;
}
//# sourceMappingURL=difficulty-analyzer.d.ts.map