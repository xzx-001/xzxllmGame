/**
 * @fileoverview 情感分析器 (SentimentAnalyzer)
 * @description 分析玩家对话和行为中的情感倾向，为AI响应提供情绪上下文。
 * 
 * 支持分析维度：
 * - 极性 (Polarity): 积极/消极/中性
 * - 强度 (Intensity): 情绪激烈程度
 * - 类别 (Category): 愤怒、困惑、兴奋、满意等
 * - 紧急度 (Urgency): 是否需要立即响应
 * 
 * 实现方式：
 * - 基于关键词规则 (轻量级)
 * - 可扩展对接外部NLP服务 (如调用LLM)
 * 
 * @module memory/analytics/sentiment-analyzer
 */

import { PlayerProfile } from '../models/player-profile.js';

/**
 * 情感分析结果
 */
export interface SentimentResult {
  /** 极性分数 (-1 到 1, 负到正) */
  polarity: number;
  
  /** 强度 (0-1) */
  intensity: number;
  
  /** 主导情绪类别 */
  dominantEmotion: 'anger' | 'confusion' | 'excitement' | 'satisfaction' | 
                   'frustration' | 'curiosity' | 'neutral';
  
  /** 紧急度 (0-1，越高越需要立即响应) */
  urgency: number;
  
  /** 关键词匹配 */
  keywords: string[];
  
  /** 建议的AI语气 */
  recommendedTone: 'empathetic' | 'cheerful' | 'serious' | 'mysterious' | 'playful';
  
  /** 建议的响应策略 */
  strategy: 'provide_hint' | 'offer_encouragement' | 'maintain_challenge' | 
            'back_off' | 'escalate_help';
}

/**
 * 情感词典
 * 简单的规则引擎，可扩展
 */
const SENTIMENT_LEXICON: Record<string, { 
  polarity: number; 
  intensity: number; 
  emotion: SentimentResult['dominantEmotion'];
  urgency: number;
}> = {
  // 消极/挫败
  'stuck': { polarity: -0.6, intensity: 0.5, emotion: 'frustration', urgency: 0.6 },
  'impossible': { polarity: -0.8, intensity: 0.7, emotion: 'frustration', urgency: 0.8 },
  'hate': { polarity: -0.9, intensity: 0.8, emotion: 'anger', urgency: 0.7 },
  'stupid': { polarity: -0.7, intensity: 0.6, emotion: 'anger', urgency: 0.5 },
  'help': { polarity: -0.3, intensity: 0.4, emotion: 'confusion', urgency: 0.7 },
  'confused': { polarity: -0.4, intensity: 0.4, emotion: 'confusion', urgency: 0.6 },
  'dont understand': { polarity: -0.5, intensity: 0.4, emotion: 'confusion', urgency: 0.6 },
  'too hard': { polarity: -0.6, intensity: 0.5, emotion: 'frustration', urgency: 0.7 },
  'unfair': { polarity: -0.7, intensity: 0.6, emotion: 'anger', urgency: 0.6 },
  'quit': { polarity: -0.8, intensity: 0.9, emotion: 'frustration', urgency: 1.0 },
  'boring': { polarity: -0.5, intensity: 0.3, emotion: 'frustration', urgency: 0.4 },
  
  // 积极/兴奋
  'love': { polarity: 0.9, intensity: 0.8, emotion: 'excitement', urgency: 0.2 },
  'awesome': { polarity: 0.8, intensity: 0.7, emotion: 'excitement', urgency: 0.2 },
  'easy': { polarity: 0.5, intensity: 0.4, emotion: 'satisfaction', urgency: 0.3 },
  'got it': { polarity: 0.6, intensity: 0.5, emotion: 'satisfaction', urgency: 0.2 },
  'finally': { polarity: 0.4, intensity: 0.6, emotion: 'satisfaction', urgency: 0.3 },
  'fun': { polarity: 0.8, intensity: 0.6, emotion: 'excitement', urgency: 0.2 },
  'interesting': { polarity: 0.6, intensity: 0.4, emotion: 'curiosity', urgency: 0.3 },
  'more': { polarity: 0.5, intensity: 0.5, emotion: 'curiosity', urgency: 0.4 },
  
  // 中性/探索
  'why': { polarity: 0, intensity: 0.3, emotion: 'curiosity', urgency: 0.4 },
  'how': { polarity: 0, intensity: 0.3, emotion: 'curiosity', urgency: 0.5 },
  'what': { polarity: 0, intensity: 0.3, emotion: 'confusion', urgency: 0.4 },
  'maybe': { polarity: 0, intensity: 0.2, emotion: 'neutral', urgency: 0.2 }
};

/**
 * 情感分析器
 */
export class SentimentAnalyzer {
  private useExternalAPI: boolean;
  private externalAPIEndpoint: string | undefined;

  /**
   * 创建分析器
   * @param useExternalAPI 是否使用外部NLP API (如Google NLP, AWS Comprehend)
   * @param externalEndpoint 外部API地址
   */
  constructor(useExternalAPI: boolean = false, externalEndpoint?: string) {
    this.useExternalAPI = useExternalAPI;
    this.externalAPIEndpoint = externalEndpoint;
  }

  /**
   * 分析文本情感
   * 主入口方法
   */
  async analyze(text: string, context?: PlayerProfile): Promise<SentimentResult> {
    // 如果使用外部API且配置了端点
    if (this.useExternalAPI && this.externalAPIEndpoint) {
      return this.analyzeWithAPI(text);
    }
    
    // 否则使用本地规则引擎
    return this.analyzeWithRules(text, context);
  }

  /**
   * 基于规则的情感分析
   */
  private analyzeWithRules(
    text: string, 
    context?: PlayerProfile
  ): SentimentResult {
    const lowerText = text.toLowerCase();
    
    let totalPolarity = 0;
    let maxIntensity = 0;
    let detectedEmotion: SentimentResult['dominantEmotion'] = 'neutral';
    let totalUrgency = 0;
    const matchedKeywords: string[] = [];
    
    // 匹配词典
    for (const [keyword, data] of Object.entries(SENTIMENT_LEXICON)) {
      if (lowerText.includes(keyword)) {
        matchedKeywords.push(keyword);
        totalPolarity += data.polarity;
        
        if (data.intensity > maxIntensity) {
          maxIntensity = data.intensity;
          detectedEmotion = data.emotion;
        }
        
        totalUrgency += data.urgency;
      }
    }
    
    // 计算平均值
    const count = matchedKeywords.length || 1;
    const avgPolarity = totalPolarity / count;
    const avgUrgency = Math.min(1, totalUrgency / count);
    
    // 结合玩家上下文调整
    let adjustedUrgency = avgUrgency;
    let finalEmotion = detectedEmotion;
    
    if (context) {
      // 如果历史挫败感高，提升当前分析 urgency
      if (context.emotion.frustrationLevel > 0.6) {
        adjustedUrgency = Math.min(1, avgUrgency * 1.3);
      }
      
      // 如果投入度高，降低负面情绪的 urgency
      if (context.emotion.engagementLevel > 0.7 && avgPolarity < 0) {
        adjustedUrgency *= 0.7;
      }
    }
    
    // 确定策略和语气
    const { strategy, tone } = this.determineStrategy(
      avgPolarity, 
      maxIntensity, 
      finalEmotion,
      adjustedUrgency
    );
    
    return {
      polarity: avgPolarity,
      intensity: maxIntensity,
      dominantEmotion: finalEmotion,
      urgency: adjustedUrgency,
      keywords: matchedKeywords,
      recommendedTone: tone,
      strategy
    };
  }

  /**
   * 使用外部API (占位实现)
   */
  private async analyzeWithAPI(text: string): Promise<SentimentResult> {
    // 实际实现应调用外部情感分析API
    // 这里降级到本地分析
    console.warn('[SentimentAnalyzer] External API not implemented, falling back to rules');
    return this.analyzeWithRules(text);
  }

  /**
   * 确定响应策略
   */
  private determineStrategy(
    polarity: number,
    intensity: number,
    emotion: SentimentResult['dominantEmotion'],
    urgency: number
  ): { strategy: SentimentResult['strategy']; tone: SentimentResult['recommendedTone'] } {
    // 高紧急度负面 -> 提供帮助
    if (urgency > 0.7 && polarity < -0.3) {
      return { 
        strategy: 'provide_hint',
        tone: 'empathetic'
      };
    }
    
    // 高挫败感 -> 后退/降低难度
    if (emotion === 'frustration' && intensity > 0.6) {
      return {
        strategy: 'back_off',
        tone: 'empathetic'
      };
    }
    
    // 愤怒 -> 认真对待
    if (emotion === 'anger') {
      return {
        strategy: 'escalate_help',
        tone: 'serious'
      };
    }
    
    // 困惑但不太负面 -> 鼓励
    if (emotion === 'confusion' && polarity > -0.5) {
      return {
        strategy: 'offer_encouragement',
        tone: 'playful'
      };
    }
    
    // 兴奋/满意 -> 保持挑战
    if (emotion === 'excitement' || emotion === 'satisfaction') {
      return {
        strategy: 'maintain_challenge',
        tone: emotion === 'excitement' ? 'cheerful' : 'mysterious'
      };
    }
    
    // 默认
    return {
      strategy: 'maintain_challenge',
      tone: 'mysterious'
    };
  }

  /**
   * 批量分析多个文本
   */
  async analyzeBatch(texts: string[]): Promise<SentimentResult[]> {
    return Promise.all(texts.map(t => this.analyze(t)));
  }

  /**
   * 快速检测是否需要立即关注
   * 用于实时过滤
   */
  needsImmediateAttention(text: string): boolean {
    const urgentKeywords = ['quit', 'impossible', 'hate', 'unfair', 'bug', 'broken'];
    const lowerText = text.toLowerCase();
    return urgentKeywords.some(kw => lowerText.includes(kw));
  }
}