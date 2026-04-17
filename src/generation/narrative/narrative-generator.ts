/**
 * @fileoverview 叙事生成器 (NarrativeGenerator)
 * @description 基于LLM的剧情生成器，负责：
 * - 生成关卡开场白(根据玩家画像和世界状态)
 * - 创建剧情过渡文本(连接小游戏)
 * - 调整叙事语气(AI Mood)
 * - 管理剧情分支线索
 * 
 * 叙事包装将抽象的游戏机制转化为故事情节
 * 
 * @module generation/narrative/narrative-generator
 */

import { ILLMProvider } from '../../llm/types.js';
import { PlayerProfile } from '../../memory/models/player-profile.js';
import {
  AIMood,
  NarrativeState,
  NarrativeStateFactory
} from '../../memory/models/narrative-state.js';
import { MiniGameType, MiniGameZone } from '../minigame/types.js';
import { PromptBuilder } from './prompt-builder.js';
import { IntroTemplates, BridgeTemplates } from './templates/index.js';

/**
 * 叙事生成上下文
 */
export interface NarrativeContext {
  /** 当前叙事状态 */
  state: NarrativeState;
  
  /** 玩家画像 */
  playerProfile: PlayerProfile;
  
  /** 即将进行的游戏(用于包装) */
  upcomingGame?: MiniGameZone;
  
  /** 刚完成的游戏(用于过渡) */
  completedGame?: {
    zone: MiniGameZone;
    success: boolean;
    timeSpent: number;
  };
  
  /** LLM提供商 */
  llmProvider: ILLMProvider;
  
  /** 最大生成长度 */
  maxLength?: number;
}

/**
 * 生成结果
 */
export interface NarrativeResult {
  /** 生成的文本内容 */
  content: string;
  
  /** 内容类型 */
  type: 'intro' | 'bridge' | 'climax' | 'resolution';
  
  /** 提取的关键线索(如果有) */
  clues?: string[];
  
  /** 建议的下一个AI情绪 */
  suggestedMood: AIMood;
  
  /** 使用的提示词(调试) */
  promptUsed?: string;
}

/**
 * 叙事生成器
 * 协调提示词构建、LLM调用和结果处理
 */
export class NarrativeGenerator {
  private promptBuilder: PromptBuilder;
  private templates: {
    intro: IntroTemplates;
    bridge: BridgeTemplates;
  };

  constructor() {
    this.promptBuilder = new PromptBuilder();
    this.templates = {
      intro: new IntroTemplates(),
      bridge: new BridgeTemplates()
    };
  }

  /**
   * 生成关卡开场白
   * 在玩家进入新关卡时调用
   */
  async generateIntro(context: NarrativeContext): Promise<NarrativeResult> {
    const { state, playerProfile, upcomingGame, llmProvider } = context;
    
    // 构建提示词
    const prompt = this.promptBuilder.buildIntroPrompt({
      state,
      playerProfile,
      upcomingGame,
      theme: state.theme,
      mood: state.context.currentMood,
      maxLength: context.maxLength || 300
    });
    
    // 调用LLM
    const response = await llmProvider.generate(prompt, {
      temperature: 0.8,
      maxTokens: 500
    });
    
    // 处理响应
    const text = typeof response.text === 'string' ? response.text : await response.text;
    const content = this.cleanNarrativeText(text);
    const clues = this.extractClues(content);
    const suggestedMood = this.detectMoodShift(content, state.context.currentMood);
    
    return {
      content,
      type: 'intro',
      clues,
      suggestedMood,
      promptUsed: prompt
    };
  }

  /**
   * 生成过渡文本
   * 连接完成的小游戏和下一个挑战
   */
  async generateBridge(context: NarrativeContext): Promise<NarrativeResult> {
    const { state, playerProfile, completedGame, upcomingGame, llmProvider } = context;
    
    if (!completedGame) {
      throw new Error('Bridge generation requires completedGame');
    }
    
    // 根据完成情况调整语气
    const baseMood = state.context.currentMood;
    const adaptedMood = completedGame.success 
      ? this.getSuccessMood(baseMood) 
      : this.getFailureMood(baseMood, completedGame.timeSpent);
    
    const prompt = this.promptBuilder.buildBridgePrompt({
      state,
      playerProfile,
      completedGame,
      upcomingGame,
      mood: adaptedMood,
      maxLength: context.maxLength || 250
    });
    
    const response = await llmProvider.generate(prompt, {
      temperature: 0.75,
      maxTokens: 400
    });
    
    const text = typeof response.text === 'string' ? response.text : await response.text;
    const content = this.cleanNarrativeText(text);
    
    return {
      content,
      type: 'bridge',
      suggestedMood: adaptedMood,
      promptUsed: prompt
    };
  }

  /**
   * 生成高潮/转折文本
   * 关键剧情点使用
   */
  async generateClimax(context: NarrativeContext): Promise<NarrativeResult> {
    const prompt = this.promptBuilder.buildClimaxPrompt({
      state: context.state,
      playerProfile: context.playerProfile,
      accumulatedClues: context.state.context.worldState.cluesFound,
      tensionLevel: context.state.context.worldState.variables.tension || 0.5
    });
    
    const response = await context.llmProvider.generate(prompt, {
      temperature: 0.9, // 更高的创造性
      maxTokens: 600
    });

    const text = typeof response.text === 'string' ? response.text : await response.text;

    return {
      content: this.cleanNarrativeText(text),
      type: 'climax',
      clues: this.extractClues(text),
      suggestedMood: AIMood.MYSTERIOUS
    };
  }

  /**
   * 将游戏机制包装为叙事概念
   * 将"推箱子"转化为"调整棱镜对齐光束"等
   * 
   * @param gameType 游戏类型
   * @param baseDescription 基础描述
   * @param theme 当前主题
   */
  wrapMechanicInNarrative(
    gameType: MiniGameType, 
    baseDescription: string,
    theme: string
  ): { narrativeName: string; description: string; verb: string } {
    const wrappers: Record<MiniGameType, Record<string, {name: string; desc: string; verb: string}>> = {
      [MiniGameType.PUSHBOX]: {
        'ancient_temple': {
          name: 'Stone Seal Alignment',
          desc: 'Ancient stone mechanisms must be pushed into sacred grooves to open passages',
          verb: 'align'
        },
        'sci-fi_lab': {
          name: 'Cargo Container Routing',
          desc: 'Heavy containers block the corridor and must be shifted to clear a path',
          verb: 'reroute'
        },
        'default': {
          name: 'Mechanical Puzzle',
          desc: 'Crates block your path and must be moved to targets',
          verb: 'push'
        }
      },
      [MiniGameType.LASER_MIRROR]: {
        'ancient_temple': {
          name: 'Sunlight Reflection',
          desc: 'Ancient mirrors must be angled to direct sunlight onto crystal receivers',
          verb: 'reflect'
        },
        'sci-fi_lab': {
          name: 'Laser Grid Calibration',
          desc: 'Security lasers need realignment to unlock doors',
          verb: 'calibrate'
        },
        'default': {
          name: 'Beam Alignment',
          desc: 'Mirrors must be adjusted to guide the energy beam',
          verb: 'align'
        }
      },
      // 其他类型...
      [MiniGameType.CIRCUIT_CONNECTION]: {
        'default': {
          name: 'Circuit Repair',
          desc: 'Wires must be connected to restore power',
          verb: 'connect'
        }
      },
      [MiniGameType.RIDDLE]: {
        'default': {
          name: 'Riddle Challenge',
          desc: 'A mysterious voice poses a question',
          verb: 'answer'
        }
      },
      [MiniGameType.SLIDING_PUZZLE]: {
        'default': {
          name: 'Tile Arrangement',
          desc: 'Scattered tiles must be slid into correct order',
          verb: 'arrange'
        }
      },
      [MiniGameType.MEMORY_SEQUENCE]: {
        'default': {
          name: 'Echo Pattern',
          desc: 'Remember and repeat the sequence of tones',
          verb: 'repeat'
        }
      },
      [MiniGameType.LOGIC_GRID]: {
        'default': {
          name: 'Logic Deduction',
          desc: 'Deduce the correct arrangement based on clues',
          verb: 'deduce'
        }
      }
    };
    
    const themeWrappers = wrappers[gameType] || wrappers[MiniGameType.PUSHBOX] || {
      'default': { name: 'Puzzle', desc: baseDescription, verb: 'solve' }
    };
    const wrapper = themeWrappers[theme] || themeWrappers['default'] || {
      name: 'Puzzle',
      desc: baseDescription,
      verb: 'solve'
    };
    
    return {
      narrativeName: wrapper.name,
      description: wrapper.desc,
      verb: wrapper.verb
    };
  }

  /**
   * 生成选择分支文本
   * 当玩家需要做出剧情选择时
   */
  async generateChoices(
    context: NarrativeContext,
    choiceCount: number = 3
  ): Promise<Array<{text: string; consequence: string; difficulty: number}>> {
    const prompt = `
Based on the current narrative context, generate ${choiceCount} distinct choices for the player.
Each choice should have narrative consequences and affect future difficulty.

Context: ${context.state.context.currentNodeId}
Mood: ${context.state.context.currentMood}
Player Skill: ${context.playerProfile.skillRating}

Format as JSON array:
[
  {"text": "Choice description", "consequence": "What happens", "difficulty": 0.3},
  ...
]
`;
    
    const response = await context.llmProvider.generate(prompt, {
      temperature: 0.8,
      maxTokens: 400
    });

    const text = typeof response.text === 'string' ? response.text : await response.text;

    try {
      const jsonStr = text.match(/\[[\s\S]*\]/)?.[0] || text;
      return JSON.parse(jsonStr);
    } catch {
      // 返回默认选择
      return [
        {text: 'Proceed cautiously', consequence: 'Lower risk, slower progress', difficulty: 0.3},
        {text: 'Charge ahead', consequence: 'Higher challenge, faster advancement', difficulty: 0.7},
        {text: 'Seek alternative path', consequence: 'Puzzle complexity increases', difficulty: 0.5}
      ];
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 清理叙事文本
   * 去除多余空格、修正标点等
   */
  private cleanNarrativeText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')           // 多个空格合并
      .replace(/([.!?])\s*/g, "$1 ")   // 确保标点后有空格
      .replace(/^\s*["']|["']\s*$/g, '') // 去除包裹引号
      .substring(0, 1000);             // 长度限制
  }

  /**
   * 从文本中提取线索标记
   * 格式: [CLUE:clue_name] 或 线索：clue_name
   */
  private extractClues(text: string): string[] {
    const clues: string[] = [];
    
    // 匹配 [CLUE:name] 格式
    const bracketMatches = text.matchAll(/\[CLUE:([^\]]+)\]/gi);
    for (const match of bracketMatches) {
      if (match[1]) {
        clues.push(match[1].trim());
      }
    }
    
    // 匹配 线索：name 格式
    const chineseMatches = text.matchAll(/线索[：:]\s*([^\s,.;!，。；！]+)/gi);
    for (const match of chineseMatches) {
      if (match[1]) {
        clues.push(match[1].trim());
      }
    }
    
    return [...new Set(clues)]; // 去重
  }

  /**
   * 检测语气转变需求
   * 根据文本内容和当前情绪建议新情绪
   */
  private detectMoodShift(text: string, currentMood: AIMood): AIMood {
    const lowerText = text.toLowerCase();
    
    // 检测到威胁/警告 -> Stubborn
    if (lowerText.includes('challenge') || lowerText.includes('dare') || lowerText.includes('prove')) {
      return AIMood.STUBBORN;
    }
    
    // 检测到帮助/关心 -> Concerned
    if (lowerText.includes('help') || lowerText.includes('careful') || lowerText.includes('warning')) {
      return AIMood.CONCERNED;
    }
    
    // 检测到玩笑/轻松 -> Playful
    if (lowerText.includes('joke') || lowerText.includes('play') || lowerText.includes('fun')) {
      return AIMood.PLAYFUL;
    }
    
    // 检测到神秘/未知 -> Mysterious
    if (lowerText.includes('secret') || lowerText.includes('unknown') || lowerText.includes('mystery')) {
      return AIMood.MYSTERIOUS;
    }
    
    return currentMood;
  }

  /**
   * 根据基础情绪获取成功时的情绪
   */
  private getSuccessMood(baseMood: AIMood): AIMood {
    const transitions: Record<AIMood, AIMood> = {
      [AIMood.PLAYFUL]: AIMood.SARCASTIC,
      [AIMood.STUBBORN]: AIMood.PLAYFUL,
      [AIMood.CONCERNED]: AIMood.PLAYFUL,
      [AIMood.MYSTERIOUS]: AIMood.SARCASTIC,
      [AIMood.SARCASTIC]: AIMood.PLAYFUL
    };
    return transitions[baseMood] || AIMood.PLAYFUL;
  }

  /**
   * 根据基础情绪和耗时获取失败时的情绪
   */
  private getFailureMood(baseMood: AIMood, timeSpent: number): AIMood {
    // 耗时过长(>5分钟)转为关心
    if (timeSpent > 300) {
      return AIMood.CONCERNED;
    }
    
    const transitions: Record<AIMood, AIMood> = {
      [AIMood.PLAYFUL]: AIMood.STUBBORN,
      [AIMood.STUBBORN]: AIMood.SARCASTIC,
      [AIMood.CONCERNED]: AIMood.CONCERNED, // 保持关心
      [AIMood.MYSTERIOUS]: AIMood.CONCERNED,
      [AIMood.SARCASTIC]: AIMood.STUBBORN
    };
    return transitions[baseMood] || AIMood.CONCERNED;
  }
}