export function lerp(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return a + (b - a) * t;
}
export function smoothStep(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const smooth = t * t * (3 - 2 * t);
    return a + (b - a) * smooth;
}
export function smootherStep(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const smooth = t * t * t * (t * (t * 6 - 15) + 10);
    return a + (b - a) * smooth;
}
export const DifficultyCurves = {
    linear: (x) => x,
    exponential: (x, power = 2) => Math.pow(x, power),
    sigmoid: (x, steepness = 10) => {
        const adjusted = (x - 0.5) * steepness;
        return 1 / (1 + Math.exp(-adjusted));
    },
    logarithmic: (x, base = 10) => {
        if (x <= 0)
            return 0;
        return Math.log(1 + (base - 1) * x) / Math.log(base);
    },
    elastic: (x, oscillations = 3) => {
        const decay = Math.exp(-x * 3);
        const wave = Math.cos(x * Math.PI * 2 * oscillations);
        return 1 - decay * (1 - wave) * 0.5;
    }
};
export function calculateDynamicDifficulty(winStreak, avgSolveTime, historicalAccuracy) {
    const streakFactor = Math.min(winStreak / 10, 1) * 0.3;
    const timeFactor = Math.max(0, 1 - avgSolveTime / 120) * 0.4;
    const accuracyFactor = historicalAccuracy * 0.3;
    const baseDifficulty = streakFactor + timeFactor + accuracyFactor;
    const noise = (Math.random() - 0.5) * 0.05;
    return Math.max(0, Math.min(1, baseDifficulty + noise));
}
export function weightedRandom(items, weights) {
    if (items.length !== weights.length) {
        throw new Error('选项和权重数量不匹配');
    }
    if (items.length === 0) {
        throw new Error('空数组');
    }
    const sum = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * sum;
    for (let i = 0; i < items.length; i++) {
        random -= weights[i];
        if (random <= 0) {
            return items[i];
        }
    }
    return items[items.length - 1];
}
export function gaussianRandom(mean = 0, stdDev = 1) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
}
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
export function applyDeadZone(value, threshold) {
    if (Math.abs(value) < threshold)
        return 0;
    return (value - threshold * Math.sign(value)) / (1 - threshold);
}
export function quadraticBezier(t, p0, p1, p2) {
    const oneMinusT = 1 - t;
    return {
        x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x,
        y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y
    };
}
export function roundTo(value, precision = 2) {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
}
export function approximatelyEqual(a, b, epsilon = 1e-9) {
    return Math.abs(a - b) < epsilon;
}
const factorialCache = [1, 1];
export function factorial(n) {
    if (n < 0)
        return NaN;
    if (n < factorialCache.length)
        return factorialCache[n];
    let result = factorialCache[factorialCache.length - 1];
    for (let i = factorialCache.length; i <= n; i++) {
        result *= i;
        factorialCache[i] = result;
    }
    return result;
}
export function combination(n, k) {
    if (k < 0 || k > n)
        return 0;
    if (k === 0 || k === n)
        return 1;
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 0; i < k; i++) {
        result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
}
export function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
export function sample(array, count) {
    if (count >= array.length)
        return [...array];
    if (count <= 0)
        return [];
    const shuffled = [...array];
    shuffle(shuffled);
    return shuffled.slice(0, count);
}
//# sourceMappingURL=math-helper.js.map