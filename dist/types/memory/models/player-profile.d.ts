export interface PlayerSkills {
    logicalThinking: number;
    spatialReasoning: number;
    patternRecognition: number;
    reactionSpeed: number;
    creativity: number;
    memoryRetention: number;
    computationalSkill: number;
}
export interface PlayerEmotionState {
    frustrationLevel: number;
    engagementLevel: number;
    confusionLevel: number;
    satisfactionLevel: number;
    lastUpdated: number;
    history: Array<{
        emotion: string;
        intensity: number;
        timestamp: number;
        trigger: string;
    }>;
}
export interface PlayerPreferences {
    favoriteMiniGameTypes: Array<{
        type: string;
        weight: number;
    }>;
    difficultyBias: number;
    narrativePreference: number;
    preferredSessionLength: number;
    preferredThemes: string[];
    dislikedMechanics: string[];
}
export interface LearningProgress {
    firstPlayedAt: number;
    totalPlayTime: number;
    totalSessions: number;
    levelHistory: Array<{
        levelId: string;
        completed: boolean;
        attempts: number;
        timeSpent: number;
        hintsUsed: number;
        timestamp: number;
    }>;
    skillGrowth: Array<{
        date: number;
        skills: Partial<PlayerSkills>;
    }>;
}
export interface PlayerProfile {
    id: string;
    displayName: string;
    createdAt: number;
    lastActiveAt: number;
    skillRating: number;
    skills: PlayerSkills;
    emotion: PlayerEmotionState;
    preferences: PlayerPreferences;
    progress: LearningProgress;
    tags: string[];
    notes: string;
}
export declare class PlayerProfileFactory {
    static create(displayName?: string): PlayerProfile;
    static updateSkillRating(profile: PlayerProfile, levelDifficulty: number, success: boolean, performanceScore: number): void;
    static updateEmotion(profile: PlayerProfile, emotion: keyof Omit<PlayerEmotionState, 'lastUpdated' | 'history'>, value: number, trigger: string): void;
    static recordLevelAttempt(profile: PlayerProfile, levelId: string, completed: boolean, timeSpent: number, hintsUsed: number): void;
    static updateSkills(profile: PlayerProfile, skillUpdates: Partial<PlayerSkills>): void;
    static serialize(profile: PlayerProfile): string;
    static deserialize(data: string): PlayerProfile;
    static calculateRecommendedDifficulty(profile: PlayerProfile): number;
    static generateSummary(profile: PlayerProfile): string;
}
//# sourceMappingURL=player-profile.d.ts.map