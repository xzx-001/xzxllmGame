export declare enum SkillDimension {
    SPATIAL = "spatial",
    LOGIC = "logic",
    MECHANISM = "mechanism",
    NARRATIVE = "narrative"
}
export declare enum AIMood {
    PLAYFUL = "playful",
    STUBBORN = "stubborn",
    CONCERNED = "concerned",
    IMPRESSED = "impressed",
    MYSTERIOUS = "mysterious"
}
export declare enum RelationshipStage {
    RIVALS = "rivals",
    FRENEMIES = "frenemies",
    RESPECT = "respect",
    MENTOR = "mentor"
}
export declare enum MiniGameType {
    PUSHBOX = "pushbox",
    LASER_MIRROR = "laser-mirror",
    CIRCUIT = "circuit-connection",
    SLIDING = "sliding-puzzle",
    MEMORY = "memory-tiles",
    RIDDLE = "text-riddle",
    CUSTOM = "custom"
}
export declare enum ObservationType {
    SENTIMENT = "sentiment",
    STRATEGY = "strategy",
    FRUSTRATION = "frustration",
    COMPLETION = "completion",
    SYSTEM = "system"
}
export interface Position {
    x: number;
    y: number;
}
export interface LevelMetadata {
    id: string;
    version: string;
    totalDifficulty: number;
    intendedMood: AIMood;
    estimatedTime: number;
    tags: string[];
    generatedAt?: string;
}
export interface BaseMapConfig {
    size: [number, number];
    theme: 'dungeon' | 'garden' | 'machine' | 'void' | 'cyber' | 'ancient';
    playerStart: Position;
    exitPosition: Position;
    safeZones: Position[];
    ambientElements: string[];
    obstacles?: Position[];
}
export interface MiniGameZone {
    id: string;
    type: MiniGameType;
    bounds: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    config: Record<string, any>;
    difficulty: number;
    hint?: string;
    rewards?: string[];
    narrativeContext?: string;
    isFallback?: boolean;
}
export interface PropItem {
    id: string;
    type: 'key' | 'tool' | 'decoy' | 'collectible' | 'lore' | 'powerup';
    name: string;
    position: Position;
    properties: {
        description: string;
        unlocks?: string;
        isMisleading?: boolean;
        loreContent?: string;
        durability?: number;
        iconId?: string;
    };
}
export interface DialogueChoice {
    id: string;
    text: string;
    nextNodeId?: string;
    effects?: {
        frustrationDelta?: number;
        skillRatingDelta?: number;
        addItem?: string;
        triggerEvent?: string;
    };
    conditions?: {
        requiredItems?: string[];
        minSkill?: number;
    };
}
export interface DialogueNode {
    id: string;
    speaker: 'ai' | 'narrator' | 'system' | 'npc';
    text: string;
    conditions?: {
        minSkill?: number;
        maxFrustration?: number;
        requiredItems?: string[];
        requiredEvents?: string[];
    };
    choices?: DialogueChoice[];
    emotionalTone?: AIMood;
    autoAdvance?: boolean;
    typingDelay?: number;
}
export interface LevelStructure {
    metadata: LevelMetadata;
    baseMap: BaseMapConfig;
    miniGames: MiniGameZone[];
    props: PropItem[];
    narrativeBridge: string;
    dialogues: DialogueNode[];
    debugInfo?: {
        promptPreview?: string;
        generationTime?: number;
        memoryContext?: string;
        rawLLMResponse?: string;
    } | undefined;
}
export interface PlayerProfile {
    playerId: string;
    skillRating: number;
    skillDimensions?: Record<SkillDimension, number>;
    preferredTypes: string[];
    frustrationLevel: number;
    winStreak: number;
    loseStreak: number;
    relationshipStage: RelationshipStage;
    totalPlayTime?: number;
    completedLevels?: number;
    lastUpdated: string;
    createdAt?: string;
}
export interface NarrativeState {
    sessionId: string;
    playerId: string;
    currentMood: AIMood;
    generationStatus: 'idle' | 'designing' | 'generating' | 'ready' | 'error';
    aiImpression: string;
    ongoingPlot: string;
    lastPuzzleDifficulty?: number;
    generatedIntro?: string;
    worldState: Record<string, any>;
    sessionHistory?: string[];
    updatedAt: string;
    frustrationLevel?: number;
}
export interface DialogueObservation {
    id?: number;
    sessionId: string;
    playerId?: string;
    observationType: ObservationType;
    content: string;
    rawQuote?: string;
    timestamp?: string;
    processed: boolean;
    importance: number;
    levelId?: string;
    sentiment?: 'positive' | 'negative' | 'neutral';
}
export interface GenerationResult<T> {
    success: boolean;
    data: T | null;
    error?: string;
    provider?: string;
    tokenUsage?: {
        prompt: number;
        completion: number;
        total: number;
    };
    latency?: number;
    usedFallback?: boolean;
}
//# sourceMappingURL=base.types.d.ts.map