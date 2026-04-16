// src/core/interfaces/base.types.ts
/**
 * @fileoverview xzxllmGame - 核心数据类型定义
 * @description 定义整个框架使用的基础数据结构，包括关卡、玩家、AI状态等模型
 * @module core/interfaces/base
 * @author xzxllm
 * @license MIT
 */

/**
 * 玩家技能评估维度
 * 用于多维度评估玩家能力，支持个性化难度调整
 */
export enum SkillDimension {
  /** 空间推理能力 - 处理推箱子、路径规划等 */
  SPATIAL = 'spatial',
  /** 逻辑推理能力 - 处理数学、符号逻辑等 */
  LOGIC = 'logic',
  /** 机制理解能力 - 理解游戏规则、机关运作 */
  MECHANISM = 'mechanism',
  /** 叙事理解能力 - 理解剧情线索、文字谜题 */
  NARRATIVE = 'narrative'
}

/**
 * AI 情绪状态枚举
 * 决定生成内容的语气、难度倾向和交互风格
 */
export enum AIMood {
  /** 轻松 playful - 友好调侃，低压力 */
  PLAYFUL = 'playful',
  /** 较劲 stubborn - 提高挑战性，略带对抗 */
  STUBBORN = 'stubborn',
  /** 关心 concerned - 降低难度，提供提示 */
  CONCERNED = 'concerned',
  /** 赞赏 impressed - 高难度挑战，认可玩家能力 */
  IMPRESSED = 'impressed',
  /** 神秘 mysterious - 谜语人风格，隐喻暗示 */
  MYSTERIOUS = 'mysterious'
}

/**
 * 玩家与 AI 的关系阶段
 * 影响叙事语气、难度曲线和互动模式
 */
export enum RelationshipStage {
  /** 竞争对手 rivals - 对抗性语气 */
  RIVALS = 'rivals',
  /** 亦敌亦友 frenemies - 调侃式互动 */
  FRENEMIES = 'frenemies',
  /** 相互尊重 respect - 平等对话 */
  RESPECT = 'respect',
  /** 导师关系 mentor - 教学式引导 */
  MENTOR = 'mentor'
}

/**
 * 小游戏类型枚举
 * 扩展新类型时需在此注册，并在工厂中实现对应生成器
 */
export enum MiniGameType {
  /** 推箱子 - 空间规划类 */
  PUSHBOX = 'pushbox',
  /** 激光反射 - 光学/角度计算类 */
  LASER_MIRROR = 'laser-mirror',
  /** 电路连接 - 逻辑/拓扑类 */
  CIRCUIT = 'circuit-connection',
  /** 滑块拼图 - 华容道类 */
  SLIDING = 'sliding-puzzle',
  /** 记忆翻牌 - 记忆力类 */
  MEMORY = 'memory-tiles',
  /** 文字谜题 - 纯文本/推理类 */
  RIDDLE = 'text-riddle',
  /** 自定义类型 - 用于扩展 */
  CUSTOM = 'custom'
}

/**
 * 观察记录类型
 * 用于情感分析和玩家画像构建
 */
export enum ObservationType {
  /** 情感反馈 - 玩家情绪表达 */
  SENTIMENT = 'sentiment',
  /** 策略观察 - 玩家解题策略 */
  STRATEGY = 'strategy',
  /** 挫败感标记 - 卡关/困难 */
  FRUSTRATION = 'frustration',
  /** 完成事件 - 通关/成就 */
  COMPLETION = 'completion',
  /** 系统事件 - 异常/错误 */
  SYSTEM = 'system'
}

/**
 * 二维坐标接口
 * 用于地图位置、游戏元素定位
 */
export interface Position {
  /** X 坐标（水平方向） */
  x: number;
  /** Y 坐标（垂直方向） */
  y: number;
}

/**
 * 游戏关卡元数据
 * 描述关卡的基本属性和生成参数
 */
export interface LevelMetadata {
  /** 全局唯一标识符 */
  id: string;
  /** 内容版本号（用于兼容性检查） */
  version: string;
  /** 总体难度系数 0.0-1.0 */
  totalDifficulty: number;
  /** 生成时的 AI 情绪状态 */
  intendedMood: AIMood;
  /** 预计完成时间（秒） */
  estimatedTime: number;
  /** 内容标签（用于分类和搜索） */
  tags: string[];
  /** 生成时间戳（ISO 8601） */
  generatedAt?: string;
}

/**
 * 基础地图配置
 * 定义关卡的空间结构和环境
 */
export interface BaseMapConfig {
  /** 地图尺寸 [宽, 高]（格子数） */
  size: [number, number];
  /** 主题风格 - 影响视觉效果和叙事包装 */
  theme: 'dungeon' | 'garden' | 'machine' | 'void' | 'cyber' | 'ancient';
  /** 玩家起始位置 */
  playerStart: Position;
  /** 出口位置 */
  exitPosition: Position;
  /** 安全区域（无陷阱/敌人） */
  safeZones: Position[];
  /** 环境装饰元素 ID 列表 */
  ambientElements: string[];
  /** 障碍位置列表（可选） */
  obstacles?: Position[];
}

/**
 * 小游戏区域定义
 * 嵌入在关卡中的独立游戏单元
 */
export interface MiniGameZone {
  /** 区域唯一 ID */
  id: string;
  /** 游戏类型 */
  type: MiniGameType;
  /** 区域边界（相对于地图的位置和大小） */
  bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  /** 游戏特定配置（由各生成器定义结构） */
  config: Record<string, any>;
  /** 实际难度（生成后评估） */
  difficulty: number;
  /** 提示文本（可逐步显示） */
  hint?: string;
  /** 通关奖励道具 ID 列表 */
  rewards?: string[];
  /** 叙事背景（将游戏机制包装在故事中） */
  narrativeContext?: string;
  /** 是否使用降级模板生成 */
  isFallback?: boolean;
}

/**
 * 道具/物品接口
 * 关卡中的可交互对象
 */
export interface PropItem {
  /** 道具唯一 ID */
  id: string;
  /** 道具类型 */
  type: 'key' | 'tool' | 'decoy' | 'collectible' | 'lore' | 'powerup';
  /** 显示名称 */
  name: string;
  /** 地图位置 */
  position: Position;
  /** 属性配置 */
  properties: {
    /** 描述文本（玩家看到） */
    description: string;
    /** 解锁的机关/门 ID（钥匙类） */
    unlocks?: string;
    /** 是否为干扰项（误导玩家） */
    isMisleading?: boolean;
    /** 背景故事内容（可收集文本） */
    loreContent?: string;
    /** 耐久度（工具类使用次数） */
    durability?: number;
    /** 图标资源 ID */
    iconId?: string;
  };
}

/**
 * 对话选择支
 * 对话树中的玩家选项
 */
export interface DialogueChoice {
  /** 选项 ID */
  id: string;
  /** 显示文本 */
  text: string;
  /** 下一个节点 ID（null 则结束对话） */
  nextNodeId?: string;
  /** 选择后的效果（数值变化等） */
  effects?: {
    /** 挫败感变化值 */
    frustrationDelta?: number;
    /** 技能评价变化 */
    skillRatingDelta?: number;
    /** 获得道具 ID */
    addItem?: string;
    /** 触发事件 ID */
    triggerEvent?: string;
  };
  /** 显示条件（如需要特定道具） */
  conditions?: {
    /** 所需道具 ID */
    requiredItems?: string[];
    /** 最低技能值 */
    minSkill?: number;
  };
}

/**
 * 对话节点
 * 对话树的基本单元
 */
export interface DialogueNode {
  /** 节点 ID */
  id: string;
  /** 说话者角色 */
  speaker: 'ai' | 'narrator' | 'system' | 'npc';
  /** 对话文本内容 */
  text: string;
  /** 显示条件 */
  conditions?: {
    /** 最低技能要求 */
    minSkill?: number;
    /** 最高挫败感（过高时显示安慰） */
    maxFrustration?: number;
    /** 必需道具 */
    requiredItems?: string[];
    /** 前置事件 */
    requiredEvents?: string[];
  };
  /** 玩家选择支 */
  choices?: DialogueChoice[];
  /** 情绪基调 */
  emotionalTone?: AIMood;
  /** 是否自动继续（无选择时） */
  autoAdvance?: boolean;
  /** 延迟（毫秒，用于打字机效果） */
  typingDelay?: number;
}

/**
 * 完整关卡数据结构
 * 游戏客户端接收的主要数据包
 */
export interface LevelStructure {
  /** 元数据信息 */
  metadata: LevelMetadata;
  /** 基础地图配置 */
  baseMap: BaseMapConfig;
  /** 小游戏区域列表（1-3 个） */
  miniGames: MiniGameZone[];
  /** 散落道具列表 */
  props: PropItem[];
  /** 开场白/过渡文本（AI 生成） */
  narrativeBridge: string;
  /** 预设对话节点 */
  dialogues: DialogueNode[];
  /** 调试信息（开发模式包含） */
  debugInfo?: {
  /** 使用的提示词预览 */
  promptPreview?: string;
  /** 生成耗时（毫秒） */
  generationTime?: number;
  /** 记忆上下文摘要 */
  memoryContext?: string;
  /** LLM 原始响应（调试用） */
  rawLLMResponse?: string;
} | undefined;
}

/**
 * 玩家画像数据
 * 长期存储的玩家学习档案
 */
export interface PlayerProfile {
  /** 玩家唯一标识 */
  playerId: string;
  /** 综合技能评级 0.0-1.0 */
  skillRating: number;
  /** 各维度技能评分 */
  skillDimensions?: Record<SkillDimension, number>;
  /** 偏好游戏类型（JSON 数组字符串存储） */
  preferredTypes: string[];
  /** 当前挫败感水平 0.0-1.0 */
  frustrationLevel: number;
  /** 连胜计数（用于动态难度） */
  winStreak: number;
  /** 连败计数（用于检测困难） */
  loseStreak: number;
  /** 与 AI 的关系阶段 */
  relationshipStage: RelationshipStage;
  /** 总游戏时长（分钟） */
  totalPlayTime?: number;
  /** 已完成关卡数 */
  completedLevels?: number;
  /** 最后更新时间 */
  lastUpdated: string;
  /** 创建时间 */
  createdAt?: string;
}

/**
 * 叙事状态记录
 * 会话级别的临时状态
 */
export interface NarrativeState {
  /** 会话 ID（单次游戏会话） */
  sessionId: string;
  /** 关联的玩家 ID */
  playerId: string;
  /** AI 当前情绪 */
  currentMood: AIMood;
  /** 生成状态（用于异步生成） */
  generationStatus: 'idle' | 'designing' | 'generating' | 'ready' | 'error';
  /** AI 对玩家的印象描述（自然语言） */
  aiImpression: string;
  /** 当前故事线章节 */
  ongoingPlot: string;
  /** 上次生成关卡的难度 */
  lastPuzzleDifficulty?: number;
  /** 预生成的开场白 */
  generatedIntro?: string;
  /** 世界状态（持久化剧情选择） */
  worldState: Record<string, any>;
  /** 会话历史事件 */
  sessionHistory?: string[];
  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * 对话/行为观察记录
 * 用于情感分析和画像更新
 */
export interface DialogueObservation {
  /** 记录 ID（数据库自增） */
  id?: number;
  /** 所属会话 */
  sessionId: string;
  /** 观察类型 */
  observationType: ObservationType;
  /** 观察摘要（LLM 处理后的结论） */
  content: string;
  /** 玩家原话（原始输入） */
  rawQuote?: string;
  /** 记录时间 */
  timestamp?: string;
  /** 是否已处理归档 */
  processed: boolean;
  /** 重要性评分 1-10（影响记忆权重） */
  importance: number;
  /** 关联的关卡 ID（可选） */
  levelId?: string;
  /** 情感极性（分析结果） */
  sentiment?: 'positive' | 'negative' | 'neutral';
}

/**
 * 生成结果包装器
 * 包含生成的内容和元信息
 */
export interface GenerationResult<T> {
  /** 是否成功生成 */
  success: boolean;
  /** 生成的内容（失败时为 null） */
  data: T | null;
  /** 错误信息（失败时） */
  error?: string;
  /** 使用的模型/提供商 */
  provider?: string;
  /** 实际消耗的 Token 数 */
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** 生成耗时（毫秒） */
  latency?: number;
  /** 是否使用了降级模板 */
  usedFallback?: boolean;
}