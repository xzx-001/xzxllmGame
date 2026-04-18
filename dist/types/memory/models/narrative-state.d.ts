export declare enum AIMood {
    PLAYFUL = "playful",
    STUBBORN = "stubborn",
    CONCERNED = "concerned",
    MYSTERIOUS = "mysterious",
    SARCASTIC = "sarcastic"
}
export interface NarrativeNode {
    id: string;
    type: 'intro' | 'bridge' | 'climax' | 'resolution' | 'twist' | 'puzzle_intro';
    content: string;
    linkedPuzzleId?: string;
    children: Array<{
        nodeId: string;
        choiceText: string;
        condition?: string;
    }>;
    stateChanges: Record<string, number | boolean | string>;
    metadata: {
        generatedAt: number;
        aiMood: AIMood;
        difficultyOverride?: number;
    };
}
export interface WorldState {
    cluesFound: string[];
    characterRelations: Record<string, number>;
    flags: Set<string>;
    variables: Record<string, number>;
    currentLocation: string;
    visitedLocations: string[];
    storyTime: number;
    realTimeElapsed: number;
}
export interface NarrativeContext {
    playerId: string;
    currentNodeId: string;
    visitedNodes: string[];
    decisionHistory: Array<{
        nodeId: string;
        choiceIndex: number;
        timestamp: number;
    }>;
    worldState: WorldState;
    currentMood: AIMood;
    upcomingPuzzle?: {
        type: string;
        difficulty: number;
        theme: string;
    };
}
export interface NarrativeState {
    id: string;
    playerId: string;
    theme: string;
    rootNodeId: string;
    nodes: Map<string, NarrativeNode>;
    context: NarrativeContext;
    createdAt: number;
    updatedAt: number;
    version: number;
    meta: {
        totalNodes: number;
        maxDepth: number;
        branchFactor: number;
        aiPersonality: string;
    };
}
export declare class NarrativeStateFactory {
    static create(playerId: string, theme: string): NarrativeState;
    static createNode(type: NarrativeNode['type'], mood: AIMood, theme: string, content?: string): NarrativeNode;
    static addChildNode(state: NarrativeState, parentNodeId: string, choiceText: string, mood: AIMood, content?: string): NarrativeNode;
    static navigateToNode(state: NarrativeState, childIndex: number): NarrativeNode | null;
    static updateMood(state: NarrativeState, newMood: AIMood): void;
    static addClue(state: NarrativeState, clue: string): void;
    static setFlag(state: NarrativeState, flag: string): void;
    static hasFlag(state: NarrativeState, flag: string): boolean;
    static setVariable(state: NarrativeState, key: string, value: number): void;
    static getVariable(state: NarrativeState, key: string): number;
    static serialize(state: NarrativeState): string;
    static deserialize(data: string): NarrativeState;
    static getPathDescription(state: NarrativeState): string;
    static getCurrentChoices(state: NarrativeState): Array<{
        text: string;
        available: boolean;
        hint?: string;
    }>;
    private static checkCondition;
    private static calculateMaxDepth;
    private static calculateAvgBranching;
}
//# sourceMappingURL=narrative-state.d.ts.map