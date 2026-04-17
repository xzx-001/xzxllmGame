/**
 * @fileoverview 开场白模板 (IntroTemplates)
 * @description 按主题和情绪分类的叙事模板。
 * 用于快速生成或作为LLM示例。
 * 
 * @module generation/narrative/templates/intro-templates
 */

import { AIMood } from '../../../memory/models/narrative-state.js';

/**
 * 模板结构
 */
export interface NarrativeTemplate {
  /** 模板ID */
  id: string;
  
  /** 适用主题 */
  themes: string[];
  
  /** 适用情绪 */
  moods: AIMood[];
  
  /** 模板文本(支持变量插值) */
  text: string;
  
  /** 变量列表 */
  variables: string[];
  
  /** 难度基础值 */
  baseDifficulty: number;
}

/**
 * 开场白模板集合
 */
export class IntroTemplates {
  private templates: NarrativeTemplate[] = [
    // 古代神庙主题
    {
      id: 'temple_mysterious',
      themes: ['ancient_temple', 'ruins', 'archaeology'],
      moods: [AIMood.MYSTERIOUS],
      text: `Dust motes dance in the shafts of light piercing the ancient chamber. Before you stands a mechanism untouched for millennia—stone blocks etched with symbols that seem to shift in the shadows. The air grows heavy as you sense the temple's awareness, testing whether you are worthy of its secrets.`,
      variables: ['location', 'mechanism_type'],
      baseDifficulty: 0.5
    },
    {
      id: 'temple_playful',
      themes: ['ancient_temple'],
      moods: [AIMood.PLAYFUL],
      text: `Well, well, another adventurer thinks they can outsmart centuries-old stonework! The carved faces on the walls seem to grin at your approach. Don't worry, these old rocks haven't seen a living soul in ages—they're probably just excited to play with someone new.`,
      variables: [],
      baseDifficulty: 0.3
    },
    {
      id: 'temple_stubborn',
      themes: ['ancient_temple'],
      moods: [AIMood.STUBBORN],
      text: `The chamber lies silent and judging. Many have stood where you stand now; their bones rest in the alcoves above. The mechanism before you has humbled greater minds than yours. Prove you are different, or add your name to the list of the failed.`,
      variables: [],
      baseDifficulty: 0.7
    },
    
    // 科幻实验室主题
    {
      id: 'scifi_concerned',
      themes: ['sci-fi_lab', 'space_station', 'cyberpunk'],
      moods: [AIMood.CONCERNED],
      text: `Warning lights flicker amber across the diagnostic panel. The automated system's failure has created a dangerous configuration—energy conduits misaligned, containment fields fluctuating. I can guide you through the manual override, but we must proceed carefully. One mistake could cascade into system failure.`,
      variables: ['system_name', 'danger_level'],
      baseDifficulty: 0.6
    },
    {
      id: 'scifi_sarcastic',
      themes: ['sci-fi_lab'],
      moods: [AIMood.SARCASTIC],
      text: `Oh, brilliant. The "foolproof" AI has crashed and left us with this delightful manual calibration puzzle. Look at you, staring at holographic schematics like you're trying to read ancient Sumerian. Try not to electrocute yourself—the cleanup protocols are tedious.`,
      variables: [],
      baseDifficulty: 0.5
    },
    
    // 通用主题
    {
      id: 'generic_mysterious',
      themes: ['default', 'dreamscape', 'abstract'],
      moods: [AIMood.MYSTERIOUS],
      text: `Reality bends here. The path forward is obscured by shifting geometries that obey unfamiliar physics. You sense that observation itself affects the outcome—that the puzzle watches back, waiting for the pattern of your thoughts to align with its own hidden logic.`,
      variables: [],
      baseDifficulty: 0.6
    }
  ];

  /**
   * 查找匹配模板
   */
  findMatch(theme: string, mood: AIMood): NarrativeTemplate | undefined {
    // 精确匹配
    let match = this.templates.find(t => 
      t.themes.includes(theme) && t.moods.includes(mood)
    );
    
    // 退回到主题匹配
    if (!match) {
      match = this.templates.find(t => t.themes.includes(theme));
    }
    
    // 退回到情绪匹配
    if (!match) {
      match = this.templates.find(t => t.moods.includes(mood));
    }
    
    // 默认
    return match || this.templates.find(t => t.id === 'generic_mysterious');
  }

  /**
   * 获取所有适用主题的模板
   */
  getByTheme(theme: string): NarrativeTemplate[] {
    return this.templates.filter(t => t.themes.includes(theme));
  }

  /**
   * 渲染模板(简单变量替换)
   */
  render(template: NarrativeTemplate, variables: Record<string, string>): string {
    let text = template.text;
    for (const [key, value] of Object.entries(variables)) {
      text = text.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return text;
  }

  /**
   * 添加自定义模板
   */
  addTemplate(template: NarrativeTemplate): void {
    this.templates.push(template);
  }
}