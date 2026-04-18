export declare enum ObservationType {
    PUZZLE_START = "puzzle_start",
    PUZZLE_COMPLETE = "puzzle_complete",
    PUZZLE_FAIL = "puzzle_fail",
    PUZZLE_HINT_USED = "puzzle_hint_used",
    PUZZLE_ACTION = "puzzle_action",
    ROOM_ENTER = "room_enter",
    ROOM_EXIT = "room_exit",
    OBJECT_INTERACT = "object_interact",
    DIALOGUE_CHOICE = "dialogue_choice",
    DIALOGUE_IGNORE = "dialogue_ignore",
    PAUSE = "pause",
    RESUME = "resume",
    QUIT = "quit",
    ERROR = "error"
}
export interface Observation {
    id: string;
    playerId: string;
    type: ObservationType;
    timestamp: number;
    locationId: string;
    puzzleId?: string;
    details: Record<string, unknown>;
    urgency: number;
    processed: boolean;
    processedAt?: number;
    processingResult?: {
        difficultyAdjustment: number;
        moodChange: string;
        hintProvided: boolean;
    };
}
export interface ObservationBatch {
    playerId: string;
    startTime: number;
    endTime: number;
    observations: Observation[];
    metrics: {
        totalAttempts: number;
        successRate: number;
        avgTimePerAction: number;
        hintUsageRate: number;
        frustrationIndicators: number;
    };
    recommendedAction: {
        mood: string;
        difficultyDelta: number;
        shouldProvideHint: boolean;
        dialoguePrompt: string;
    };
}
export declare class ObservationFactory {
    private static idCounter;
    static create(playerId: string, type: ObservationType, locationId: string, details?: Record<string, unknown>, puzzleId?: string): Observation;
    static processBatch(observations: Observation[]): ObservationBatch;
    private static calculateUrgency;
    static serialize(obs: Observation): string;
    static deserialize(data: string): Observation;
}
//# sourceMappingURL=observation.d.ts.map