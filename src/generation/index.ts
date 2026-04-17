/**
 * @fileoverview 生成模块入口 (Generation Index)
 * @description 统一导出内容生成系统所有组件
 *
 * @module generation/index
 */
// 小游戏生成器
export {
    MiniGameType
} from './minigame/types.js';
export type {
    MiniGameZone,
    MiniGameConfig,
    MiniGameContext,
    GenerationResult,
    ValidationResult,
    IMiniGameGenerator,
    Position,
    ZoneSize
} from './minigame/types.js';

export {
  MiniGameGeneratorFactory,
  GeneratorFactoryError,
  RegisterMiniGame
} from './minigame/factory.js';

export {
    BaseMiniGameGenerator
} from './minigame/base-generator.js';
export type { BaseGeneratorOptions } from './minigame/base-generator.js';

// 具体生成器(按需导出)
export { PushboxGenerator } from './minigame/generators/pushbox-generator.js';
export type { PushboxConfig } from './minigame/generators/pushbox-generator.js';
export { LaserGenerator, LaserComponentType } from './minigame/generators/laser-generator.js';
export type { LaserConfig } from './minigame/generators/laser-generator.js';

// 叙事生成
export {
    NarrativeGenerator
} from './narrative/narrative-generator.js';
export type {
    NarrativeContext,
    NarrativeResult
} from './narrative/narrative-generator.js';

export {
  PromptBuilder
} from './narrative/prompt-builder.js';

export {
  IntroTemplates,
  BridgeTemplates
} from './narrative/templates/index.js';

// 对话生成
export {
    DialogueGenerator
} from './dialogue/dialogue-generator.js';
export type {
    DialogueNode,
    DialogueOption,
    DialogueContext
} from './dialogue/dialogue-generator.js';

export {
    DialogueContextBuilder
} from './dialogue/context-builder.js';
export type { ContextBuildParams } from './dialogue/context-builder.js';
