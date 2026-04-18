import { ObservationType } from '../models/observation.js';
export class DifficultyAnalyzer {
    MAX_ADJUSTMENT = 0.25;
    analyze(input) {
        const { recentObservations, playerProfile, currentBaseline } = input;
        const metrics = this.calculateMetrics(recentObservations);
        const winRateScore = this.normalizeWinRate(metrics.winRate);
        const timeScore = this.normalizeTime(metrics.avgTime, metrics.expectedTime);
        const attemptScore = this.normalizeAttempts(metrics.avgAttempts);
        const helpScore = 1 - metrics.helpRate;
        const emotionMultiplier = this.calculateEmotionMultiplier(playerProfile.emotion.frustrationLevel, playerProfile.emotion.engagementLevel);
        const compositeScore = (winRateScore * 0.35 +
            timeScore * 0.25 +
            attemptScore * 0.25 +
            helpScore * 0.15) * emotionMultiplier;
        const targetScore = 0.65;
        const rawAdjustment = (targetScore - compositeScore) * 0.5;
        const clampedAdjustment = Math.max(-this.MAX_ADJUSTMENT, Math.min(this.MAX_ADJUSTMENT, rawAdjustment));
        let newDifficulty = currentBaseline + clampedAdjustment;
        newDifficulty = Math.max(0.1, Math.min(0.95, newDifficulty));
        const confidence = Math.min(1, metrics.sampleSize / 20);
        const prediction = this.predictOutcome(newDifficulty, metrics, playerProfile);
        const reason = this.generateReason(metrics, winRateScore, timeScore, emotionMultiplier, clampedAdjustment);
        return {
            recommendedDifficulty: newDifficulty,
            adjustmentDelta: clampedAdjustment,
            reason,
            confidence,
            prediction,
            nextReviewInSeconds: this.calculateNextReview(metrics.avgAttempts, confidence)
        };
    }
    calculateMetrics(observations) {
        if (observations.length === 0) {
            return {
                winRate: 0.5,
                avgTime: 300,
                expectedTime: 300,
                avgAttempts: 3,
                helpRate: 0.3,
                sampleSize: 0
            };
        }
        let wins = 0;
        let totalTime = 0;
        let timeCount = 0;
        let totalAttempts = 0;
        let helps = 0;
        let completions = 0;
        const puzzleGroups = new Map();
        for (const obs of observations) {
            if (obs.puzzleId) {
                if (!puzzleGroups.has(obs.puzzleId)) {
                    puzzleGroups.set(obs.puzzleId, []);
                }
                puzzleGroups.get(obs.puzzleId).push(obs);
            }
        }
        for (const [_, group] of puzzleGroups) {
            const complete = group.find(o => o.type === ObservationType.PUZZLE_COMPLETE);
            const fail = group.find(o => o.type === ObservationType.PUZZLE_FAIL);
            const attempts = group.filter(o => o.type === ObservationType.PUZZLE_START).length;
            const hintUsed = group.some(o => o.type === ObservationType.PUZZLE_HINT_USED);
            if (complete) {
                wins++;
                totalTime += complete.details.timeSpent || 300;
                timeCount++;
                helps += hintUsed ? 1 : 0;
                completions++;
            }
            else if (fail) {
                totalAttempts += attempts;
                helps += hintUsed ? 1 : 0;
                completions++;
            }
        }
        const sampleSize = puzzleGroups.size;
        const winRate = sampleSize > 0 ? wins / sampleSize : 0.5;
        const avgTime = timeCount > 0 ? totalTime / timeCount : 300;
        const avgAttempts = sampleSize > 0 ? totalAttempts / sampleSize : 3;
        const helpRate = completions > 0 ? helps / completions : 0.3;
        const expectedTime = 180 + 600 * 0.5;
        return {
            winRate,
            avgTime,
            expectedTime,
            avgAttempts,
            helpRate,
            sampleSize
        };
    }
    normalizeWinRate(winRate) {
        if (winRate < 0.3)
            return 0.1;
        if (winRate > 0.8)
            return 0.9;
        if (winRate >= 0.5 && winRate <= 0.7)
            return 0.5;
        return winRate < 0.5 ? 0.3 : 0.7;
    }
    normalizeTime(actual, expected) {
        const ratio = actual / expected;
        if (ratio < 0.5)
            return 0.8;
        if (ratio > 2.0)
            return 0.2;
        if (ratio >= 0.8 && ratio <= 1.5)
            return 0.5;
        return ratio < 0.8 ? 0.7 : 0.3;
    }
    normalizeAttempts(attempts) {
        if (attempts <= 2)
            return 0.7;
        if (attempts <= 5)
            return 0.5;
        if (attempts <= 10)
            return 0.3;
        return 0.1;
    }
    calculateEmotionMultiplier(frustration, engagement) {
        const frustrationFactor = 1 - frustration * 0.5;
        const engagementFactor = 1 + (engagement - 0.5) * 0.2;
        return frustrationFactor * engagementFactor;
    }
    predictOutcome(newDifficulty, metrics, profile) {
        const skillAdjustedDiff = newDifficulty * (2000 / (profile.skillRating + 1000));
        const expectedWinRate = Math.max(0.1, Math.min(0.9, 1 - skillAdjustedDiff * 0.8 + Math.random() * 0.1));
        const expectedFrustration = (1 - expectedWinRate) * metrics.avgAttempts * 0.1;
        const expectedTimeMinutes = (180 + newDifficulty * 600) / 60;
        return {
            expectedWinRate,
            expectedFrustration: Math.min(1, expectedFrustration),
            expectedTimeMinutes
        };
    }
    generateReason(metrics, _winScore, _timeScore, emotionMult, adjustment) {
        const parts = [];
        if (metrics.winRate < 0.3) {
            parts.push(`胜率过低 (${(metrics.winRate * 100).toFixed(0)}%)`);
        }
        else if (metrics.winRate > 0.8) {
            parts.push(`胜率过高 (${(metrics.winRate * 100).toFixed(0)}%)`);
        }
        if (metrics.avgAttempts > 8) {
            parts.push(`平均尝试次数过多 (${metrics.avgAttempts.toFixed(1)}次)`);
        }
        if (emotionMult < 0.8) {
            parts.push('检测到玩家挫败感');
        }
        if (parts.length === 0) {
            parts.push('维持当前难度平衡');
        }
        const direction = adjustment > 0 ? '增加' : '减少';
        return `${parts.join('，')}。建议${direction}难度 ${Math.abs(adjustment * 100).toFixed(0)}%`;
    }
    calculateNextReview(avgAttempts, confidence) {
        const baseTime = 30;
        const confidenceFactor = 1 + (1 - confidence) * 2;
        const attemptFactor = Math.min(3, avgAttempts / 3);
        return Math.round(baseTime * confidenceFactor * attemptFactor);
    }
}
//# sourceMappingURL=difficulty-analyzer.js.map