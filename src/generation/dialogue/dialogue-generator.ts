/**
 * @fileoverview 对话生成器 (DialogueGenerator)
 * @description 生成动态对话树，支持：
 * - 基于玩家画像的个性化对话
 * - 情绪感知响应
 * - 线索揭示管理
 * - 分支选择生成
 * 
 * @module generation/dialogue/dialogue-generator
 */

import { ILLMProvider } from '../../llm/types.js';
import { PlayerProfile } from '../../memory/models/player-profile.js';
import { AIMood, NarrativeState } from '../../memory/models/narrative-state.js';

/**
 * 对话节点
 */
export interface DialogueNode {
  id: string;
  /** 说话者: 'ai' | 'player' | 'npc' */
  speaker: string;
  /** 对话文本 */
  text: string;
  /** 情绪标记(用于面部动画/语气) */
  emotion?: string;
  /** 玩家选项(如果是AI/NPC说话) */
  options?: DialogueOption[];
  /** 触发的事件(如果有) */
  triggers?: string[];
  /** 揭示的线索 */
  revealsClue?: string;
  /** 需要的先决条件 */
  requires?: string[];
  /** 节点元数据 */
  metadata?: {
    generationTime: number;
    aiMood: AIMood;
  };
}

/**
 * 对话选项
 */
export interface DialogueOption {
  id: string;
  text: string;
  /** 选择后的下一个节点ID */
  nextNodeId?: string;
  /** 可用的条件 */
  condition?: string;
  /** 选择效果(变量变更等) */
  effects?: Record<string, number | boolean>;
  /** 选项类型 */
  type: 'question' | 'answer' | 'action' | 'exit';
}

/**
 * 对话上下文
 */
export interface DialogueContext {
  playerProfile: PlayerProfile;
  narrativeState: NarrativeState;
  currentTopic?: string;
  availableClues: string[];
  llmProvider: ILLMProvider;
  maxNodes?: number;
}

/**
 * 对话生成器
 */
export class DialogueGenerator {
  
  /**
   * 生成完整对话树
   */
  async generateDialogue(context: DialogueContext): Promise<DialogueNode[]> {
    const { playerProfile, narrativeState, llmProvider, maxNodes = 5 } = context;
    
    const nodes: DialogueNode[] = [];
    const rootNode = await this.generateNode({
      context,
      speaker: 'ai',
      parentText: '',
      depth: 0,
      maxDepth: maxNodes,
      availableOptions: 3
    });
    
    nodes.push(rootNode);
    
    // 递归生成后续节点(简化实现，实际可能使用BFS/DFS)
    if (rootNode.options) {
      for (const option of rootNode.options) {
        const responseNode = await this.generateNode({
          context,
          speaker: 'player',
          parentText: option.text,
          depth: 1,
          maxDepth: maxNodes,
          parentOption: option
        });
        nodes.push(responseNode);
        option.nextNodeId = responseNode.id;
        
        // 再生成AI回复
        if (1 < maxNodes - 1) {
          const aiReply = await this.generateNode({
            context,
            speaker: 'ai',
            parentText: responseNode.text,
            depth: 2,
            maxDepth: maxNodes
          });
          nodes.push(aiReply);
        }
      }
    }
    
    return nodes;
  }

  /**
   * 生成单个对话节点
   */
  private async generateNode(params: {
    context: DialogueContext;
    speaker: string;
    parentText: string;
    depth: number;
    maxDepth: number;
    availableOptions?: number;
    parentOption?: DialogueOption;
  }): Promise<DialogueNode> {
    const { context, speaker, parentText, depth, maxDepth, availableOptions = 3 } = params;
    
    const prompt = this.buildNodePrompt(params);
    
    const response = await context.llmProvider.generate(prompt, {
      temperature: 0.8,
      maxTokens: 400
    });
    
    const text = typeof response.text === 'string' ? response.text : await response.text;
    const parsed = this.parseNodeResponse(text, speaker);
    
    return {
      ...parsed,
      id: `dialogue_${Date.now()}_${depth}`,
      speaker: parsed.speaker ?? speaker,
      text: parsed.text ?? text.substring(0, 200),
      metadata: {
        generationTime: Date.now(),
        aiMood: context.narrativeState.context.currentMood
      }
    };
  }

  /**
   * 生成提示词
   */
  private buildNodePrompt(params: {
    context: DialogueContext;
    speaker: string;
    parentText: string;
    depth: number;
    maxDepth: number;
    availableOptions?: number;
    parentOption?: DialogueOption;
  }): string {
    const { context, speaker, parentText, depth, availableOptions } = params;
    const { playerProfile, narrativeState, currentTopic } = context;
    
    const mood = narrativeState.context.currentMood;
    const playerSkill = playerProfile.skillRating;
    
    return `Generate a dialogue node for an AI character in a puzzle game.

CONTEXT:
- Speaker: ${speaker}
- Player Skill: ${playerSkill}
- AI Mood: ${mood}
- Conversation Depth: ${depth}/${params.maxDepth}
- Current Topic: ${currentTopic || 'general'}
${parentText ? `- Previous: "${parentText}"` : ''}

AVAILABLE CLUES TO REVEAL: ${context.availableClues.join(', ') || 'none'}

REQUIREMENTS:
${speaker === 'ai' ? `
- Write 1-2 sentences as the AI character
- Tone should match AI Mood: ${mood}
- May subtly hint at puzzles or reveal one clue if appropriate
- Provide ${availableOptions} player response options
` : `
- Write the player's response or question
- Should relate to previous AI statement
`}

FORMAT (JSON):
{
  "text": "Dialogue text here",
  "emotion": "neutral|happy|concerned|mysterious|annoyed",
  ${speaker === 'ai' ? `"options": [
    {"text": "Option 1", "type": "question"},
    {"text": "Option 2", "type": "answer"},
    {"text": "Option 3", "type": "action"}
  ],
  "revealsClue": "clue_name_or_null"` : ''}
}`;
  }

  /**
   * 解析节点响应
   */
  private parseNodeResponse(text: string, speaker: string): Partial<DialogueNode> {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // 确保speaker属性存在
        if (!parsed.speaker) {
          parsed.speaker = speaker;
        }
        return parsed;
      }
    } catch {
      // JSON解析失败，使用原始文本
    }

    return {
      text: text.trim().substring(0, 200),
      speaker
    };
  }

  /**
   * 生成简短对话(单个回合)
   * 用于快速响应玩家输入
   */
  async generateQuickReply(
    playerInput: string,
    context: DialogueContext
  ): Promise<string> {
    const prompt = `
Player says: "${playerInput}"

Respond as an AI ${context.narrativeState.context.currentMood} guide in a puzzle game.
- Keep response under 100 characters
- Match the emotional tone
- May include subtle hint if player seems stuck (frustration > 0.6)
- Never break character as AI narrator

Response:`;
    
    const response = await context.llmProvider.generate(prompt, {
      temperature: 0.9,
      maxTokens: 150
    });
    
    const text = typeof response.text === 'string' ? response.text : await response.text;
    return this.cleanText(text);
  }

  /**
   * 清理文本
   */
  private cleanText(text: string): string {
    return text.trim().replace(/^["']|["']$/g, '');
  }
}