/**
 * @fileoverview 对话上下文构建器 (DialogueContextBuilder)
 * @description 构建对话生成所需的完整上下文，
 * 整合玩家画像、叙事状态、游戏进度等信息。
 * 
 * @module generation/dialogue/context-builder
 */

import { PlayerProfile } from '../../memory/models/player-profile.js';
import { NarrativeState } from '../../memory/models/narrative-state.js';
import { MiniGameZone } from '../minigame/types.js';
import { DialogueContext } from './dialogue-generator.js';

/**
 * 构建参数
 */
export interface ContextBuildParams {
  playerProfile: PlayerProfile;
  narrativeState: NarrativeState;
  llmProvider: any; // ILLMProvider
  currentGameZone?: MiniGameZone;
  recentObservations?: Array<{
    type: string;
    success: boolean;
    timestamp: number;
  }>;
}

/**
 * 上下文构建器
 * 使用建造者模式组装对话上下文
 */
export class DialogueContextBuilder {
  private params: ContextBuildParams;
  private maxNodes: number = 5;
  private forcedTopic?: string;


  constructor(params: ContextBuildParams) {
    this.params = params;
  }

  /**
   * 设置最大对话节点数
   */
  setMaxNodes(count: number): this {
    this.maxNodes = count;
    return this;
  }

  /**
   * 强制指定话题
   */
  setTopic(topic: string): this {
    this.forcedTopic = topic;
    return this;
  }

  /**
   * 构建最终上下文
   */
  build(): DialogueContext {
    const { playerProfile, narrativeState, llmProvider } = this.params;
    
    // 确定当前话题
    const topic = this.determineTopic();
    
    // 筛选可用线索(未揭示的)
    const availableClues = this.filterAvailableClues();
    
    // 根据玩家状态调整难度
    const adjustedMaxNodes = this.calculateMaxNodes();
    
    return {
      playerProfile,
      narrativeState,
      currentTopic: topic,
      availableClues,
      llmProvider,
      maxNodes: adjustedMaxNodes
    };
  }

  /**
   * 确定当前最适合的话题
   */
  private determineTopic(): string {
    if (this.forcedTopic) return this.forcedTopic;
    
    const { currentGameZone, recentObservations } = this.params;
    
    // 根据最近的游戏活动推断话题
    if (recentObservations && recentObservations.length > 0) {
      const lastFail = recentObservations.find(o => !o.success);
      if (lastFail) {
        return 'hint_request'; // 最近失败了，玩家可能需要提示
      }
    }
    
    if (currentGameZone) {
      return `puzzle_${currentGameZone.type}`;
    }
    
    // 检查叙事状态中的线索
    const { narrativeState } = this.params;
    const unmentionedClues = narrativeState.context.worldState.cluesFound.filter(
      clue => !narrativeState.nodes.has(`clue_${clue}`)
    );
    
    if (unmentionedClues.length > 0) {
      return `reveal_${unmentionedClues[0]}`;
    }
    
    return 'general_progress';
  }

  /**
   * 筛选可用线索
   */
  private filterAvailableClues(): string[] {
    const { narrativeState, playerProfile } = this.params;
    const allClues = narrativeState.context.worldState.cluesFound;
    
    // 根据玩家进度筛选
    // 新手玩家不展示过多线索造成信息过载
    const maxClues = playerProfile.progress.totalSessions < 3 ? 2 : 5;
    
    return allClues.slice(0, maxClues);
  }

  /**
   * 计算最大节点数
   * 基于玩家偏好
   */
  private calculateMaxNodes(): number {
    const { playerProfile } = this.params;
    
    // 偏好短对话的玩家
    if (playerProfile.preferences.preferredSessionLength < 15) {
      return Math.min(3, this.maxNodes);
    }
    
    // 喜欢叙事的玩家
    if (playerProfile.preferences.narrativePreference > 0.7) {
      return Math.min(8, this.maxNodes + 2);
    }
    
    return this.maxNodes;
  }

  /**
   * 快速构建方法(工厂方法)
   */
  static quickBuild(params: ContextBuildParams): DialogueContext {
    return new DialogueContextBuilder(params).build();
  }
}