/**
 * @fileoverview 玩家画像数据模型 (PlayerProfile)
 * @description 定义玩家在游戏中的完整画像，包括：
 * - 技能评级 (DDDA系统: Dynamic Difficulty Adjustment)
 * - 情绪状态追踪 (挫败感、兴奋度)
 * - 游戏偏好 (谜题类型偏好)
 * - 历史表现统计
 * - 学习曲线分析
 * 
 * 用于动态难度调整和个性化内容生成
 * 
 * @module memory/models/player-profile
 */

import { randomUUID } from 'crypto';

/**
 * 玩家技能维度
 * 多维度评估玩家能力
 */
export interface PlayerSkills {
  /** 逻辑推理能力 (0-1) */
  logicalThinking: number;
  
  /** 空间想象力 (0-1) - 推箱子、拼图类 */
  spatialReasoning: number;
  
  /** 模式识别速度 (0-1) */
  patternRecognition: number;
  
  /** 反应速度 (0-1) - 动作类谜题 */
  reactionSpeed: number;
  
  /** 创造力评分 (0-1) - 开放性问题 */
  creativity: number;
  
  /** 记忆能力 (0-1) - 序列记忆类 */
  memoryRetention: number;
  
  /** 计算能力 (0-1) - 数学谜题 */
  computationalSkill: number;
}

/**
 * 玩家情绪状态
 * 用于叙事生成时的语气调整
 */
export interface PlayerEmotionState {
  /** 挫败感水平 (0-1)，高值表示玩家快放弃了 */
  frustrationLevel: number;
  
  /** 兴奋/投入度 (0-1) */
  engagementLevel: number;
  
  /** 困惑度 (0-1) */
  confusionLevel: number;
  
  /** 满意度 (0-1) */
  satisfactionLevel: number;
  
  /** 最后更新时间 */
  lastUpdated: number;
  
  /** 情绪历史 (最近10次) */
  history: Array<{
    emotion: string;
    intensity: number;
    timestamp: number;
    trigger: string; // 触发事件
  }>;
}

/**
 * 游戏偏好设置
 * 玩家显式或隐式偏好的谜题类型
 */
export interface PlayerPreferences {
  /** 喜欢的谜题类型 (按权重排序) */
  favoriteMiniGameTypes: Array<{
    type: string;
    weight: number; // 0-1
  }>;
  
  /** 偏好难度倾向 (-1 到 1, -1偏简单, 1偏难) */
  difficultyBias: number;
  
  /** 喜欢叙事强度 (0-1) */
  narrativePreference: number;
  
  /** 单次游戏时长偏好 (分钟) */
  preferredSessionLength: number;
  
  /** 喜欢的主题/风格 */
  preferredThemes: string[];
  
  /** 不喜欢的机制 */
  dislikedMechanics: string[];
}

/**
 * 学习进度追踪
 * 记录玩家在各技能维度上的成长
 */
export interface LearningProgress {
  /** 首次游戏时间 */
  firstPlayedAt: number;
  
  /** 总游戏时长 (分钟) */
  totalPlayTime: number;
  
  /** 总游戏场次 */
  totalSessions: number;
  
  /** 关卡完成历史 */
  levelHistory: Array<{
    levelId: string;
    completed: boolean;
    attempts: number;
    timeSpent: number; // 秒
    hintsUsed: number;
    timestamp: number;
  }>;
  
  /** 技能成长曲线 (每次评估的分数) */
  skillGrowth: Array<{
    date: number;
    skills: Partial<PlayerSkills>;
  }>;
}

/**
 * 玩家画像主类
 * 完整的玩家数据容器
 */
export interface PlayerProfile {
  /** 唯一标识符 */
  id: string;
  
  /** 显示名称 (匿名或昵称) */
  displayName: string;
  
  /** 创建时间 */
  createdAt: number;
  
  /** 最后活跃时间 */
  lastActiveAt: number;
  
  /** 当前综合技能评级 (ELO-like, 1000为初始值) */
  skillRating: number;
  
  /** 各维度技能评分 */
  skills: PlayerSkills;
  
  /** 情绪状态快照 */
  emotion: PlayerEmotionState;
  
  /** 游戏偏好 */
  preferences: PlayerPreferences;
  
  /** 学习进度 */
  progress: LearningProgress;
  
  /** 个性化标签 (由AI生成) */
  tags: string[];
  
  /** 备注 (人工添加) */
  notes: string;
}

/**
 * 玩家画像工厂类
 * 提供创建、更新、序列化等方法
 */
export class PlayerProfileFactory {
  /**
   * 创建新玩家画像
   * 使用默认值初始化所有字段
   */
  static create(displayName?: string): PlayerProfile {
    const now = Date.now();
    const id = randomUUID();
    
    return {
      id,
      displayName: displayName || `Player_${id.slice(0, 8)}`,
      createdAt: now,
      lastActiveAt: now,
      skillRating: 1000,
      skills: {
        logicalThinking: 0.5,
        spatialReasoning: 0.5,
        patternRecognition: 0.5,
        reactionSpeed: 0.5,
        creativity: 0.5,
        memoryRetention: 0.5,
        computationalSkill: 0.5
      },
      emotion: {
        frustrationLevel: 0,
        engagementLevel: 0.5,
        confusionLevel: 0,
        satisfactionLevel: 0.5,
        lastUpdated: now,
        history: []
      },
      preferences: {
        favoriteMiniGameTypes: [],
        difficultyBias: 0,
        narrativePreference: 0.5,
        preferredSessionLength: 30,
        preferredThemes: [],
        dislikedMechanics: []
      },
      progress: {
        firstPlayedAt: now,
        totalPlayTime: 0,
        totalSessions: 0,
        levelHistory: [],
        skillGrowth: []
      },
      tags: [],
      notes: ''
    };
  }

  /**
   * 更新技能评级 (基于表现)
   * 使用简化的ELO算法
   * 
   * @param profile 当前画像
   * @param levelDifficulty 关卡难度 (0-1)
   * @param success 是否成功完成
   * @param performanceScore 表现分 (0-1, 基于时间、步数等)
   */
  static updateSkillRating(
    profile: PlayerProfile,
    levelDifficulty: number,
    success: boolean,
    performanceScore: number
  ): void {
    const K = 32; // ELO K因子
    
    // 期望胜率
    const expectedScore = 1 / (1 + Math.pow(10, (levelDifficulty * 2000 - profile.skillRating) / 400));
    
    // 实际得分 (成功获得高分，失败得0)
    const actualScore = success ? performanceScore : 0;
    
    // 更新评级
    const newRating = profile.skillRating + K * (actualScore - expectedScore);
    profile.skillRating = Math.max(100, Math.min(3000, newRating));
    
    // 更新最后活跃时间
    profile.lastActiveAt = Date.now();
  }

  /**
   * 更新情绪状态
   * 添加新的情绪观测，维护历史
   */
  static updateEmotion(
    profile: PlayerProfile,
    emotion: keyof Omit<PlayerEmotionState, 'lastUpdated' | 'history'>,
    value: number,
    trigger: string
  ): void {
    const now = Date.now();
    
    // 更新主值
    (profile.emotion[emotion] as number) = Math.max(0, Math.min(1, value));
    profile.emotion.lastUpdated = now;
    
    // 添加到历史
    profile.emotion.history.push({
      emotion,
      intensity: value,
      timestamp: now,
      trigger
    });
    
    // 只保留最近20条
    if (profile.emotion.history.length > 20) {
      profile.emotion.history = profile.emotion.history.slice(-20);
    }
    
    profile.lastActiveAt = now;
  }

  /**
   * 记录关卡尝试
   */
  static recordLevelAttempt(
    profile: PlayerProfile,
    levelId: string,
    completed: boolean,
    timeSpent: number,
    hintsUsed: number
  ): void {
    const attempt = {
      levelId,
      completed,
      attempts: 1,
      timeSpent,
      hintsUsed,
      timestamp: Date.now()
    };
    
    // 查找是否已有记录
    const existing = profile.progress.levelHistory.find(l => l.levelId === levelId);
    if (existing) {
      existing.attempts++;
      if (completed && !existing.completed) {
        existing.completed = true;
        existing.timeSpent = timeSpent;
      }
    } else {
      profile.progress.levelHistory.push(attempt);
    }
    
    // 更新总时长
    profile.progress.totalPlayTime += timeSpent / 60;
    
    if (completed) {
      // 更新技能成长记录
      profile.progress.skillGrowth.push({
        date: Date.now(),
        skills: { ...profile.skills }
      });
    }
    
    profile.lastActiveAt = Date.now();
  }

  /**
   * 更新技能维度 (基于表现分析)
   */
  static updateSkills(
    profile: PlayerProfile,
    skillUpdates: Partial<PlayerSkills>
  ): void {
    for (const [skill, value] of Object.entries(skillUpdates)) {
      if (skill in profile.skills) {
        // 使用移动平均平滑更新
        const current = profile.skills[skill as keyof PlayerSkills];
        const newValue = current * 0.7 + (value as number) * 0.3;
        profile.skills[skill as keyof PlayerSkills] = Math.max(0, Math.min(1, newValue));
      }
    }
    
    profile.lastActiveAt = Date.now();
  }

  /**
   * 序列化为 JSON
   */
  static serialize(profile: PlayerProfile): string {
    return JSON.stringify(profile);
  }

  /**
   * 从 JSON 反序列化
   */
  static deserialize(data: string): PlayerProfile {
    return JSON.parse(data) as PlayerProfile;
  }

  /**
   * 计算当前推荐难度 (0-1)
   * 基于技能评级和情绪状态
   */
  static calculateRecommendedDifficulty(profile: PlayerProfile): number {
    // 基础难度基于技能评级 (1000 -> 0.5)
    let baseDifficulty = profile.skillRating / 2000;
    
    // 情绪调整：高挫败感降低难度，高投入度可增加难度
    const emotionAdjust = 
      -0.2 * profile.emotion.frustrationLevel + 
      0.1 * profile.emotion.engagementLevel;
    
    // 个人偏好调整
    const preferenceAdjust = profile.preferences.difficultyBias * 0.1;
    
    let finalDifficulty = baseDifficulty + emotionAdjust + preferenceAdjust;
    
    // 限制在合理范围
    return Math.max(0.1, Math.min(0.95, finalDifficulty));
  }

  /**
   * 生成玩家摘要 (用于LLM提示词)
   * 生成简洁的玩家描述文本
   */
  static generateSummary(profile: PlayerProfile): string {
    const topSkills = Object.entries(profile.skills)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, score]) => `${name}:${(score * 100).toFixed(0)}%`);
    
    const mood = profile.emotion.frustrationLevel > 0.6 ? 'frustrated' :
                 profile.emotion.engagementLevel > 0.7 ? 'engaged' : 'neutral';
    
    return `Player ${profile.displayName} (Rating: ${profile.skillRating.toFixed(0)}):
- Top Skills: ${topSkills.join(', ')}
- Current Mood: ${mood}
- Preferred Difficulty: ${this.calculateRecommendedDifficulty(profile).toFixed(2)}
- Experience: ${profile.progress.totalSessions} sessions, ${profile.progress.totalPlayTime.toFixed(1)}h played`;
  }
}