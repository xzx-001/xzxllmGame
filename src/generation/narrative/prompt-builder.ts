/**
 * @fileoverview 叙事提示词构建器 (PromptBuilder)
 * @description 根据游戏状态构建结构化的LLM提示词。
 * 包含模板系统和动态内容注入。
 * 
 * @module generation/narrative/prompt-builder
 */

import { NarrativeState, AIMood } from '../../memory/models/narrative-state.js';
import { PlayerProfile, PlayerProfileFactory } from '../../memory/models/player-profile.js';
import { MiniGameZone, MiniGameType } from '../minigame/types.js';
import { NarrativeGenerator } from './narrative-generator.js';

/**
 * 构建参数基础接口
 */
interface BaseBuildParams {
  state: NarrativeState;
  playerProfile: PlayerProfile;
  mood: AIMood;
  maxLength?: number;
}

/**
 * Intro构建参数
 */
interface IntroBuildParams extends BaseBuildParams {
  upcomingGame?: MiniGameZone | undefined;
  theme: string;
}

/**
 * Bridge构建参数
 */
interface BridgeBuildParams extends BaseBuildParams {
  completedGame: {
    zone: MiniGameZone;
    success: boolean;
    timeSpent: number;
  };
  upcomingGame?: MiniGameZone | undefined;
}

/**
 * Climax构建参数
 */
interface ClimaxBuildParams {
  state: NarrativeState;
  playerProfile: PlayerProfile;
  accumulatedClues: string[];
  tensionLevel: number;
}

/**
 * 提示词构建器
 * 封装提示词组装逻辑
 */
export class PromptBuilder {
  private narrativeGenerator?: NarrativeGenerator;

  /**
   * 构建开场白提示词
   */
  buildIntroPrompt(params: IntroBuildParams): string {
    const { state, playerProfile, upcomingGame, mood, theme, maxLength = 300 } = params;
    
    // 获取玩家摘要
    const playerSummary = PlayerProfileFactory.generateSummary(playerProfile);
    
    // 包装游戏机制
    let gameContext = '';
    if (upcomingGame) {
      const wrapper = this.wrapGameMechanic(upcomingGame, theme);
      gameContext = `
UPCOMING CHALLENGE:
${wrapper.narrativeName}: ${wrapper.description}
Mechanic (hidden from player): ${upcomingGame.type}
Difficulty: ${(upcomingGame.difficulty * 100).toFixed(0)}%
Estimated time: ${upcomingGame.estimatedTime}s
`;
    }
    
    // 根据情绪选择语气描述
    const toneDescription = this.getToneDescription(mood);
    
    return `You are an AI game master narrating an interactive puzzle adventure.

PLAYER CONTEXT:
${playerSummary}
Current Location: ${state.context.worldState.currentLocation}
Time in game: ${state.context.worldState.storyTime} units

WORLD STATE:
Discovered clues: ${state.context.worldState.cluesFound.join(', ') || 'None yet'}
Active flags: ${Array.from(state.context.worldState.flags).join(', ') || 'None'}

NARRATIVE THEME: ${theme}
CURRENT AI MOOD: ${mood}
TONE REQUIREMENTS: ${toneDescription}
${gameContext}

INSTRUCTIONS:
Generate an atmospheric intro (max ${maxLength} chars) describing the scene and introducing the challenge.
- Use second person ("you see", "you feel")
- Include sensory details appropriate to theme
- Subtly hint at puzzle mechanics without explicitly stating rules
- Establish the AI's personality based on CURRENT AI MOOD
- If clues are relevant, reference them naturally in narrative
- Do NOT use generic fantasy tropes unless theme requires

Output only the narrative text, no meta-commentary or JSON.`;
  }

  /**
   * 构建过渡提示词
   */
  buildBridgePrompt(params: BridgeBuildParams): string {
    const { state, playerProfile, completedGame, upcomingGame, mood, maxLength = 250 } = params;
    
    const wrapper = this.wrapGameMechanic(completedGame.zone, state.theme);
    const playerSummary = PlayerProfileFactory.generateSummary(playerProfile);
    
    const resultText = completedGame.success ? 'succeeded' : 'struggled with';
    const timeDesc = completedGame.timeSpent < 60 ? 'quickly' : 
                    completedGame.timeSpent < 180 ? 'after some effort' : 'with great difficulty';
    
    let nextChallenge = '';
    if (upcomingGame) {
      const nextWrapper = this.wrapGameMechanic(upcomingGame, state.theme);
      nextChallenge = `
NEXT CHALLENGE PREVIEW:
${nextWrapper.narrativeName}: ${nextWrapper.description}
`;
    }
    
    return `Continue the interactive narrative as AI game master.

PLAYER: ${playerSummary}

RECENT EVENT:
Player just ${resultText} the ${wrapper.narrativeName} ${timeDesc}.
Time spent: ${completedGame.timeSpent}s
Success: ${completedGame.success ? 'Yes' : 'No (may need hint next)'}

CURRENT STATE:
Location: ${state.context.worldState.currentLocation}
Mood shift to: ${mood}
${nextChallenge}

INSTRUCTIONS:
Generate a narrative bridge (max ${maxLength} chars):
- React to player's performance (success or struggle)
- Acknowledge their ${completedGame.success ? 'skill' : 'difficulty'} appropriately
- Transition smoothly to next area or challenge
- Adjust tone to match new AI MOOD: ${mood}
- If player struggled, subtly encourage without giving away solution
- If player succeeded, increase challenge tone or congratulate sarcastically based on mood

Output only narrative text.`;
  }

  /**
   * 构建高潮提示词
   */
  buildClimaxPrompt(params: ClimaxBuildParams): string {
    const { playerProfile, accumulatedClues, tensionLevel } = params;
    
    const clueText = accumulatedClues.length > 0 
      ? `Accumulated clues: ${accumulatedClues.join(', ')}` 
      : 'No clues gathered yet (player may be lost)';
    
    return `Generate a climactic narrative moment.

PLAYER SKILL RATING: ${playerProfile.skillRating}
${clueText}
TENSION LEVEL: ${(tensionLevel * 100).toFixed(0)}%

REVEAL REQUIREMENTS:
${tensionLevel > 0.7 ? '- Major revelation or plot twist appropriate' : '- Building tension, partial revelation'}
${accumulatedClues.length > 3 ? '- Connect multiple clues together' : '- Hint at importance of undiscovered clues'}

Create a dramatic scene (max 400 chars) that:
- Resolves or intensifies current mystery based on clues found
- Makes player feel their choices mattered
- Sets up finale or next major chapter
- Uses mysterious or dramatic tone`;
  }

  /**
   * 包装游戏机制描述
   */
  private wrapGameMechanic(zone: MiniGameZone, theme: string): {
    narrativeName: string;
    description: string;
  } {
    // 初始化 narrativeGenerator 如果需要
    if (!this.narrativeGenerator) {
      this.narrativeGenerator = new NarrativeGenerator();
    }

    // 调用 NarrativeGenerator 的方法进行包装
    const wrapped = this.narrativeGenerator.wrapMechanicInNarrative(
      zone.type,
      this.getBaseDescription(zone.type),
      theme
    );

    return {
      narrativeName: wrapped.narrativeName,
      description: wrapped.description
    };
  }

  /**
   * 获取游戏类型的基础描述
   */
  private getBaseDescription(gameType: MiniGameType): string {
    const baseDescriptions: Record<MiniGameType, string> = {
      [MiniGameType.PUSHBOX]: 'Move boxes to designated locations',
      [MiniGameType.LASER_MIRROR]: 'Reflect light beam to reach target',
      [MiniGameType.CIRCUIT_CONNECTION]: 'Connect wires to restore power flow',
      [MiniGameType.RIDDLE]: 'Solve the verbal puzzle',
      [MiniGameType.SLIDING_PUZZLE]: 'Slide tiles into correct order',
      [MiniGameType.MEMORY_SEQUENCE]: 'Remember and repeat the sequence',
      [MiniGameType.LOGIC_GRID]: 'Deduce correct arrangement from clues'
    };

    return baseDescriptions[gameType] || 'Solve the puzzle challenge';
  }

  /**
   * 获取情绪对应的语气描述
   */
  private getToneDescription(mood: AIMood): string {
    const descriptions: Record<AIMood, string> = {
      [AIMood.PLAYFUL]: 'Light-hearted, encouraging, uses gentle humor, offers hints generously',
      [AIMood.STUBBORN]: 'Challenging, skeptical, makes player prove themselves, minimal hints',
      [AIMood.CONCERNED]: 'Supportive, watches out for player, offers help proactively, reassuring',
      [AIMood.MYSTERIOUS]: 'Cryptic, symbolic language, speaks in riddles, atmospheric',
      [AIMood.SARCASTIC]: 'Witty, dry humor, feigned surprise at player actions, cheeky'
    };
    return descriptions[mood];
  }
}