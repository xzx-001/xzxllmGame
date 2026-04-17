/**
 * @fileoverview 难度分析器 (DifficultyAnalyzer)
 * @description 基于玩家历史表现和实时行为，计算最优难度曲线。
 * 实现 Dynamic Difficulty Adjustment (DDA) 算法的核心逻辑。
 * 
 * 算法考虑因素：
 * - 胜率趋势 (Win Rate Trend)
 * - 完成时间分布 (Time Distribution)
 * - 尝试次数 (Attempt Count)
 * - 帮助使用率 (Help Usage)
 * - 情绪波动 (Emotion Fluctuation)
 * 
 * @module memory/analytics/difficulty-analyzer
 */

import { Observation, ObservationType } from '../models/observation.js';
import { PlayerProfile } from '../models/player-profile.js';

/**
 * 难度分析输入
 */
export interface DifficultyAnalysisInput {
  /** 最近观察记录 */
  recentObservations: Observation[];
  
  /** 玩家当前画像 */
  playerProfile: PlayerProfile;
  
  /** 当前难度基线 (0-1) */
  currentBaseline: number;
  
  /** 目标挫败感上限 (防止玩家流失) */
  maxFrustration: number;
  
  /** 目标投入度下限 */
  minEngagement: number;
}

/**
 * 难度调整建议
 */
export interface DifficultyAdjustment {
  /** 建议的新难度 (0-1) */
  recommendedDifficulty: number;
  
  /** 调整幅度 (-0.5 到 0.5) */
  adjustmentDelta: number;
  
  /** 调整原因说明 */
  reason: string;
  
  /** 置信度 (0-1) */
  confidence: number;
  
  /** 预期结果预测 */
  prediction: {
    expectedWinRate: number;
    expectedFrustration: number;
    expectedTimeMinutes: number;
  };
  
  /** 应用此调整后的下次检查时间 */
  nextReviewInSeconds: number;
}

/**
 * 难度分析器
 * 使用加权评分算法
 */
export class DifficultyAnalyzer {
  // 历史权重配置 (越新的记录权重越高)
  private readonly WEIGHT_DECAY = 0.9;
  
  // 难度调整上限 (防止剧烈波动)
  private readonly MAX_ADJUSTMENT = 0.25;

  /**
   * 分析并生成难度调整建议
   * 主入口方法
   */
  analyze(input: DifficultyAnalysisInput): DifficultyAdjustment {
    const { recentObservations, playerProfile, currentBaseline } = input;
    
    // 1. 计算各项指标
    const metrics = this.calculateMetrics(recentObservations);
    
    // 2. 计算各维度得分 (0-1)
    const winRateScore = this.normalizeWinRate(metrics.winRate);
    const timeScore = this.normalizeTime(metrics.avgTime, metrics.expectedTime);
    const attemptScore = this.normalizeAttempts(metrics.avgAttempts);
    const helpScore = 1 - metrics.helpRate; // 帮助使用率越低越好
    
    // 3. 情绪修正
    const emotionMultiplier = this.calculateEmotionMultiplier(
      playerProfile.emotion.frustrationLevel,
      playerProfile.emotion.engagementLevel
    );
    
    // 4. 综合评分 (0-1, 0.5为平衡点)
    const compositeScore = (
      winRateScore * 0.35 +
      timeScore * 0.25 +
      attemptScore * 0.25 +
      helpScore * 0.15
    ) * emotionMultiplier;
    
    // 5. 计算调整量
    // 目标分数为 0.65 (稍微有挑战但不过分)
    const targetScore = 0.65;
    const rawAdjustment = (targetScore - compositeScore) * 0.5; // 缩放因子
    const clampedAdjustment = Math.max(
      -this.MAX_ADJUSTMENT,
      Math.min(this.MAX_ADJUSTMENT, rawAdjustment)
    );
    
    // 6. 生成新难度
    let newDifficulty = currentBaseline + clampedAdjustment;
    newDifficulty = Math.max(0.1, Math.min(0.95, newDifficulty));
    
    // 7. 计算置信度 (基于数据量)
    const confidence = Math.min(1, metrics.sampleSize / 20); // 20个样本为满置信
    
    // 8. 生成预测
    const prediction = this.predictOutcome(newDifficulty, metrics, playerProfile);
    
    // 9. 生成理由
    const reason = this.generateReason(
      metrics,
      winRateScore,
      timeScore,
      emotionMultiplier,
      clampedAdjustment
    );
    
    return {
      recommendedDifficulty: newDifficulty,
      adjustmentDelta: clampedAdjustment,
      reason,
      confidence,
      prediction,
      nextReviewInSeconds: this.calculateNextReview(metrics.avgAttempts, confidence)
    };
  }

  /**
   * 计算基础指标
   */
  private calculateMetrics(observations: Observation[]): {
    winRate: number;
    avgTime: number;
    expectedTime: number;
    avgAttempts: number;
    helpRate: number;
    sampleSize: number;
  } {
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
    
    // 按谜题分组计算
    const puzzleGroups = new Map<string, Observation[]>();
    
    for (const obs of observations) {
      if (obs.puzzleId) {
        if (!puzzleGroups.has(obs.puzzleId)) {
          puzzleGroups.set(obs.puzzleId, []);
        }
        puzzleGroups.get(obs.puzzleId)!.push(obs);
      }
    }
    
    for (const [_, group] of puzzleGroups) {
      // 找出该谜题的完成/失败记录
      const complete = group.find(o => o.type === ObservationType.PUZZLE_COMPLETE);
      const fail = group.find(o => o.type === ObservationType.PUZZLE_FAIL);
      const attempts = group.filter(o => o.type === ObservationType.PUZZLE_START).length;
      const hintUsed = group.some(o => o.type === ObservationType.PUZZLE_HINT_USED);
      
      if (complete) {
        wins++;
        totalTime += (complete.details.timeSpent as number) || 300;
        timeCount++;
        helps += hintUsed ? 1 : 0;
        completions++;
      } else if (fail) {
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
    
    // 期望时间基于难度线性计算 (简化模型)
    const expectedTime = 180 + 600 * 0.5; // 假设中等难度期望时间
    
    return {
      winRate,
      avgTime,
      expectedTime,
      avgAttempts,
      helpRate,
      sampleSize
    };
  }

  /**
   * 标准化胜率得分
   * 0.5-0.7 为理想区间
   */
  private normalizeWinRate(winRate: number): number {
    if (winRate < 0.3) return 0.1; // 太难
    if (winRate > 0.8) return 0.9; // 太简单
    if (winRate >= 0.5 && winRate <= 0.7) return 0.5; // 理想
    return winRate < 0.5 ? 0.3 : 0.7;
  }

  /**
   * 标准化时间得分
   */
  private normalizeTime(actual: number, expected: number): number {
    const ratio = actual / expected;
    if (ratio < 0.5) return 0.8; // 太快，可能太简单
    if (ratio > 2.0) return 0.2; // 太慢，可能太难
    if (ratio >= 0.8 && ratio <= 1.5) return 0.5; // 理想范围
    return ratio < 0.8 ? 0.7 : 0.3;
  }

  /**
   * 标准化尝试次数
   */
  private normalizeAttempts(attempts: number): number {
    if (attempts <= 2) return 0.7;
    if (attempts <= 5) return 0.5;
    if (attempts <= 10) return 0.3;
    return 0.1; // 尝试次数过多
  }

  /**
   * 计算情绪乘数
   * 高挫败感降低目标分数，使系统倾向于降低难度
   */
  private calculateEmotionMultiplier(frustration: number, engagement: number): number {
    // 挫败感高时，目标降低 (乘数<1，导致adjustment倾向于负)
    // 投入度高时，可以提高挑战 (乘数>1)
    const frustrationFactor = 1 - frustration * 0.5; // 0.5 - 1.0
    const engagementFactor = 1 + (engagement - 0.5) * 0.2; // 0.9 - 1.1
    
    return frustrationFactor * engagementFactor;
  }

  /**
   * 预测调整后的结果
   */
  private predictOutcome(
    newDifficulty: number,
    metrics: ReturnType<DifficultyAnalyzer['calculateMetrics']>,
    profile: PlayerProfile
  ): DifficultyAdjustment['prediction'] {
    // 简化模型：假设难度和胜率呈负相关
    const skillAdjustedDiff = newDifficulty * (2000 / (profile.skillRating + 1000));
    
    const expectedWinRate = Math.max(
      0.1,
      Math.min(0.9, 1 - skillAdjustedDiff * 0.8 + Math.random() * 0.1)
    );
    
    const expectedFrustration = (1 - expectedWinRate) * metrics.avgAttempts * 0.1;
    const expectedTimeMinutes = (180 + newDifficulty * 600) / 60;
    
    return {
      expectedWinRate,
      expectedFrustration: Math.min(1, expectedFrustration),
      expectedTimeMinutes
    };
  }

  /**
   * 生成人类可读的调整原因
   */
  private generateReason(
    metrics: ReturnType<DifficultyAnalyzer['calculateMetrics']>,
    winScore: number,
    timeScore: number,
    emotionMult: number,
    adjustment: number
  ): string {
    const parts: string[] = [];
    
    if (metrics.winRate < 0.3) {
      parts.push(`胜率过低 (${(metrics.winRate * 100).toFixed(0)}%)`);
    } else if (metrics.winRate > 0.8) {
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

  /**
   * 计算下次评估时间
   * 数据不足时更频繁检查
   */
  private calculateNextReview(avgAttempts: number, confidence: number): number {
    // 基础30秒，根据置信度和尝试次数调整
    const baseTime = 30;
    const confidenceFactor = 1 + (1 - confidence) * 2; // 1-3倍
    const attemptFactor = Math.min(3, avgAttempts / 3); // 经常失败的玩家需要更密切监控
    
    return Math.round(baseTime * confidenceFactor * attemptFactor);
  }
}