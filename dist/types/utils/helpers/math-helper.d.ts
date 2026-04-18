export declare function lerp(a: number, b: number, t: number): number;
export declare function smoothStep(a: number, b: number, t: number): number;
export declare function smootherStep(a: number, b: number, t: number): number;
export declare const DifficultyCurves: {
    linear: (x: number) => number;
    exponential: (x: number, power?: number) => number;
    sigmoid: (x: number, steepness?: number) => number;
    logarithmic: (x: number, base?: number) => number;
    elastic: (x: number, oscillations?: number) => number;
};
export declare function calculateDynamicDifficulty(winStreak: number, avgSolveTime: number, historicalAccuracy: number): number;
export declare function weightedRandom<T>(items: T[], weights: number[]): T;
export declare function gaussianRandom(mean?: number, stdDev?: number): number;
export declare function clamp(value: number, min: number, max: number): number;
export declare function applyDeadZone(value: number, threshold: number): number;
export declare function quadraticBezier(t: number, p0: {
    x: number;
    y: number;
}, p1: {
    x: number;
    y: number;
}, p2: {
    x: number;
    y: number;
}): {
    x: number;
    y: number;
};
export declare function roundTo(value: number, precision?: number): number;
export declare function approximatelyEqual(a: number, b: number, epsilon?: number): boolean;
export declare function factorial(n: number): number;
export declare function combination(n: number, k: number): number;
export declare function shuffle<T>(array: T[]): T[];
export declare function sample<T>(array: T[], count: number): T[];
//# sourceMappingURL=math-helper.d.ts.map