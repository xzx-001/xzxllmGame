/**
 * @fileoverview 过渡文本模板 (BridgeTemplates)
 * @description 连接小游戏之间的叙事过渡
 * 
 * @module generation/narrative/templates/bridge-templates
 */

import { AIMood } from '../../../memory/models/narrative-state.js';

/**
 * 过渡模板
 */
export interface BridgeTemplate {
  /** 适用条件 */
  condition: 'success' | 'failure' | 'neutral';
  
  /** 适用情绪 */
  moods: AIMood[];
  
  /** 模板文本 */
  texts: string[]; // 多个变体，随机选择
  
  /** 是否包含时间感知 */
  timeAware: boolean;
}

/**
 * 过渡模板集合
 */
export class BridgeTemplates {
  private templates: BridgeTemplate[] = [
    // 成功过渡
    {
      condition: 'success',
      moods: [AIMood.PLAYFUL, AIMood.SARCASTIC],
      texts: [
        `Not bad! Those old mechanisms practically sang as you aligned them. But don't get too comfortable—the temple has deeper chambers, and they don't appreciate amateur hour.`,
        `Well, color me impressed. You actually listened to the subtle hints in the carvings. The path opens before you, though I suspect the next test won't be so forgiving.`,
        `Victory is sweet, isn't it? I hope you savored it, because that was merely the appetizer. The main course awaits, and it has quite the appetite for overconfident explorers.`
      ],
      timeAware: true
    },
    {
      condition: 'success',
      moods: [AIMood.STUBBORN],
      texts: [
        `Hmph. You solved it, but I noticed you took the scenic route with those extra moves. The next chamber won't tolerate such inefficiency.`,
        `Adequate. The mechanism recognized your solution, grudgingly. Prove this wasn't luck—prove it in the next trial.`,
        `You survived. Good. I was beginning to worry I'd have to explain to the maintenance drones why there was organic residue in the puzzle chamber.`
      ],
      timeAware: true
    },
    {
      condition: 'success',
      moods: [AIMood.CONCERNED],
      texts: [
        `Excellent work! The way you approached that methodically was exactly right. The next area is more complex, but I have confidence in your careful approach.`,
        `You handled that beautifully. Take a moment to breathe—the atmosphere is getting thinner ahead, and you'll need your focus. I'm here if you need guidance.`,
        `Perfect alignment! Your patience paid off. The subsequent challenge requires similar precision; trust your instincts as you did just now.`
      ],
      timeAware: false
    },
    
    // 失败过渡
    {
      condition: 'failure',
      moods: [AIMood.CONCERNED, AIMood.MYSTERIOUS],
      texts: [
        `The mechanism resets with a grinding sigh. Don't be discouraged—these puzzles are designed to resist, not to break you. Look for the pattern you missed; it's there, waiting for patient eyes.`,
        `Another attempt, another lesson. The temple isn't rejecting you; it's teaching you its language. Listen to the silence between the stone.`,
        `The system locks down protectively. Perhaps we rushed? In my analysis, haste creates more errors than ignorance. Shall we review the approach?`
      ],
      timeAware: true
    },
    {
      condition: 'failure',
      moods: [AIMood.SARCASTIC, AIMood.STUBBORN],
      texts: [
        `Ah, the sweet sound of defeat. Don't worry, I'm taking notes for my " Humans vs Ancient Technology" compilation. Ready to try a different approach, or shall we continue the comedy routine?`,
        `The puzzle remains. You do not. Metaphorically speaking, of course—you're still physically here, staring at your failure. Try again, or admit defeat?`,
        `Fascinating. You managed to create an entirely new way to fail that I hadn't predicted. At least you're creative in your errors.`
      ],
      timeAware: false
    },
    
    // 中性过渡
    {
      condition: 'neutral',
      moods: [AIMood.MYSTERIOUS],
      texts: [
        `The path winds deeper. Shadows lengthen as if time itself grows hesitant. What awaits around the next bend is neither reward nor punishment—merely consequence.`,
        `A threshold crossed, yet the destination recedes. The journey reshapes itself based on your footsteps. Walk with intention.`,
        `Silence fills the space between challenges. In this pause, the true puzzle reveals itself: not the mechanism, but the mind that approaches it.`
      ],
      timeAware: false
    }
  ];

  /**
   * 获取匹配的过渡文本
   */
  getBridge(
    success: boolean, 
    mood: AIMood, 
    timeSpent?: number
  ): string {
    const condition = success ? 'success' : 'failure';
    
    // 查找匹配模板
    const candidates = this.templates.filter(t => 
      t.condition === condition && t.moods.includes(mood)
    );
    
    if (candidates.length === 0) {
      return success 
        ? 'You proceed to the next challenge.' 
        : 'You may try again or continue.';
    }
    
    // 合并所有匹配的文本变体
    const allTexts = candidates.flatMap(t => t.texts);
    
    // 基于时间感知选择(如果有)
    if (timeSpent !== undefined && candidates.some(c => c.timeAware)) {
      if (timeSpent > 300 && !success) {
        // 长时间失败，选择鼓励性文本
        const encouraging = candidates.find(c => 
          c.moods.includes(AIMood.CONCERNED)
        );
        if (encouraging) {
          return this.randomPick(encouraging.texts);
        }
      }
    }
    
    return this.randomPick(allTexts);
  }

  /**
   * 随机选择
   */
  private randomPick<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return array[Math.floor(Math.random() * array.length)]!;
  }

  /**
   * 添加自定义模板
   */
  addTemplate(template: BridgeTemplate): void {
    this.templates.push(template);
  }
}