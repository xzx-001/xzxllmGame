/**
 * @fileoverview 玩家行为观察记录 (DialogueObservation)
 * @description 记录玩家在游戏中的微观行为，用于：
 * - 实时难度调整 (DDDA)
 * - AI 对话生成上下文
 * - 玩家技能分析
 * - 异常行为检测 (作弊/bug)
 * 
 * 观察数据是临时的，处理后聚合到 PlayerProfile
 * 
 * @module memory/models/observation
 */

/**
 * 行为事件类型
 */
export enum ObservationType {
  // 谜题相关
  PUZZLE_START = 'puzzle_start',
  PUZZLE_COMPLETE = 'puzzle_complete',
  PUZZLE_FAIL = 'puzzle_fail',
  PUZZLE_HINT_USED = 'puzzle_hint_used',
  PUZZLE_ACTION = 'puzzle_action', // 具体动作 (推箱子、移动等)
  
  // 探索相关
  ROOM_ENTER = 'room_enter',
  ROOM_EXIT = 'room_exit',
  OBJECT_INTERACT = 'object_interact',
  
  // 对话相关
  DIALOGUE_CHOICE = 'dialogue_choice',
  DIALOGUE_IGNORE = 'dialogue_ignore',
  
  // 系统相关
  PAUSE = 'pause',
  RESUME = 'resume',
  QUIT = 'quit',
  ERROR = 'error'
}

/**
 * 单个行为观察记录
 */
export interface Observation {
  /** 唯一ID */
  id: string;
  
  /** 关联的玩家ID */
  playerId: string;
  
  /** 观察类型 */
  type: ObservationType;
  
  /** 时间戳 (毫秒) */
  timestamp: number;
  
  /** 关卡/房间ID */
  locationId: string;
  
  /** 谜题ID (如果适用) */
  puzzleId?: string;
  
  /** 事件详情 (JSON对象，根据类型变化) */
  details: Record<string, unknown>;
  
  /** 计算的紧迫度分数 (0-1，越高越需要立即响应) */
  urgency: number;
  
  /** 是否已处理 */
  processed: boolean;
  
  /** 处理时间 */
  processedAt?: number;
  
  /** 处理结果 (如难度调整值) */
  processingResult?: {
    difficultyAdjustment: number;
    moodChange: string;
    hintProvided: boolean;
  };
}

/**
 * 行为观察批量处理结果
 */
export interface ObservationBatch {
  /** 玩家ID */
  playerId: string;
  
  /** 观察时间段 */
  startTime: number;
  endTime: number;
  
  /** 原始观察列表 */
  observations: Observation[];
  
  /** 聚合指标 */
  metrics: {
    totalAttempts: number;
    successRate: number;
    avgTimePerAction: number;
    hintUsageRate: number;
    frustrationIndicators: number;
  };
  
  /** 建议的AI响应 */
  recommendedAction: {
    mood: string;
    difficultyDelta: number;
    shouldProvideHint: boolean;
    dialoguePrompt: string;
  };
}

/**
 * 观察记录工厂
 */
export class ObservationFactory {
  private static idCounter = 0;

  /**
   * 创建新的观察记录
   */
  static create(
    playerId: string,
    type: ObservationType,
    locationId: string,
    details: Record<string, unknown> = {},
    puzzleId?: string
  ): Observation {
    // 计算紧迫度
    const urgency = this.calculateUrgency(type, details);
    
    return {
      id: `obs_${Date.now()}_${++this.idCounter}`,
      playerId,
      type,
      timestamp: Date.now(),
      locationId,
      details,
      urgency,
      processed: false,
      ...(puzzleId !== undefined && { puzzleId })
    } as Observation;
  }

  /**
   * 批量处理观察记录
   * 分析行为模式，生成AI响应建议
   */
  static processBatch(observations: Observation[]): ObservationBatch {
    if (observations.length === 0) {
      throw new Error('Empty observation batch');
    }
    
    const firstObs = observations[0]!;
    const playerId = firstObs.playerId;
    const sorted = [...observations].sort((a, b) => a.timestamp - b.timestamp);
    const startTime = sorted[0]!.timestamp;
    const endTime = sorted[sorted.length - 1]!.timestamp;
    
    // 计算指标
    let attempts = 0;
    let successes = 0;
    let hintsUsed = 0;
    let totalActionTime = 0;
    let actionCount = 0;
    let frustrationSignals = 0;
    
    for (const obs of sorted) {
      obs.processed = true;
      obs.processedAt = Date.now();
      
      switch (obs.type) {
        case ObservationType.PUZZLE_START:
          attempts++;
          break;
        case ObservationType.PUZZLE_COMPLETE:
          successes++;
          break;
        case ObservationType.PUZZLE_FAIL:
          frustrationSignals++;
          break;
        case ObservationType.PUZZLE_HINT_USED:
          hintsUsed++;
          break;
        case ObservationType.PUZZLE_ACTION:
          actionCount++;
          if (obs.details.duration) {
            totalActionTime += obs.details.duration as number;
          }
          break;
        case ObservationType.PAUSE:
        case ObservationType.QUIT:
          frustrationSignals += 2; // 强挫败信号
          break;
      }
    }
    
    const totalAttempts = attempts || 1;
    const successRate = successes / totalAttempts;
    const avgTime = actionCount > 0 ? totalActionTime / actionCount : 0;
    const hintRate = hintsUsed / totalAttempts;
    
    // 生成建议
    let mood = 'neutral';
    let difficultyDelta = 0;
    let shouldHint = false;
    let dialoguePrompt = '';
    
    if (frustrationSignals >= 3 || hintRate > 0.5) {
      mood = 'concerned';
      difficultyDelta = -0.1;
      shouldHint = true;
      dialoguePrompt = 'Player seems frustrated. Offer encouragement and a subtle hint.';
    } else if (successRate > 0.8 && avgTime < 5000) {
      mood = 'stubborn';
      difficultyDelta = 0.15;
      shouldHint = false;
      dialoguePrompt = 'Player is performing excellently. Increase challenge and be cheeky.';
    } else if (hintRate === 0 && attempts > 5) {
      shouldHint = true;
      dialoguePrompt = 'Player has been attempting for a while without hints. Offer help subtly.';
    }
    
    return {
      playerId,
      startTime,
      endTime,
      observations: sorted,
      metrics: {
        totalAttempts,
        successRate,
        avgTimePerAction: avgTime,
        hintUsageRate: hintRate,
        frustrationIndicators: frustrationSignals
      },
      recommendedAction: {
        mood,
        difficultyDelta,
        shouldProvideHint: shouldHint,
        dialoguePrompt
      }
    };
  }

  /**
   * 计算紧迫度分数
   */
  private static calculateUrgency(
    type: ObservationType, 
    _details: Record<string, unknown>
  ): number {
    switch (type) {
      case ObservationType.PUZZLE_FAIL:
        return 0.7;
      case ObservationType.QUIT:
        return 1.0; // 最高紧迫度
      case ObservationType.PAUSE:
        return 0.5;
      case ObservationType.PUZZLE_HINT_USED:
        return 0.4;
      case ObservationType.ERROR:
        return 0.9;
      case ObservationType.PUZZLE_COMPLETE:
        return 0.3;
      default:
        return 0.1;
    }
  }

  /**
   * 序列化
   */
  static serialize(obs: Observation): string {
    return JSON.stringify(obs);
  }

  /**
   * 反序列化
   */
  static deserialize(data: string): Observation {
    return JSON.parse(data);
  }
}