import { MiniGameZone, MiniGameType, AIMood } from './base.types.js';
export interface MiniGameContext {
    difficulty: number;
    playerSkill: number;
    bounds: {
        w: number;
        h: number;
    };
    theme: string;
    memoryContext: string;
    mood: AIMood;
    recentTypes?: MiniGameType[];
    seed?: number;
    preferredMechanics?: string[];
}
export interface IMiniGameGenerator {
    readonly type: MiniGameType;
    readonly name: string;
    buildPrompt(context: MiniGameContext): string;
    parseResponse(response: string, zoneId: string, position: {
        x: number;
        y: number;
    }): MiniGameZone;
    validate(zone: MiniGameZone): ValidationResult;
    generateFallback(context: MiniGameContext): MiniGameZone;
}
export interface ValidationResult {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
    estimatedDifficulty?: number;
    solvabilityScore?: number;
    suggestions?: string[];
}
export interface MiniGameTemplate {
    type: MiniGameType;
    displayName: string;
    description: string;
    aiGenerationPrompt: {
        role: string;
        constraints: string[];
        outputFormat: object;
        examples?: string[];
    };
    validationRules: {
        minComplexity?: number;
        maxComplexity?: number;
        requiredElements?: string[];
        forbiddenPatterns?: string[];
    };
}
export interface GenerationProgress {
    sessionId: string;
    stage: 'initializing' | 'analyzing' | 'generating_map' | 'generating_minigame' | 'validating' | 'finalizing';
    currentStep: number;
    totalSteps: number;
    percent: number;
    message: string;
    currentMiniGameType?: MiniGameType;
    timestamp: string;
}
export interface PromptConfig {
    systemRole: string;
    task: string;
    constraints: string[];
    outputFormat: string | object;
    examples?: Array<{
        input: string;
        output: string;
        explanation?: string;
    }>;
    maxContextLength?: number;
    temperature?: number;
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
//# sourceMappingURL=generation.types.d.ts.map