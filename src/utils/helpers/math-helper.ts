// src/utils/helpers/math-helper.ts
/**
 * @fileoverview 数学计算辅助工具
 * 
 * 游戏难度曲线计算、插值算法、随机分布等数学工具。
 * 专为游戏 AI 和动态难度调整（DDDA）系统设计。
 * 
 * @module utils/helpers/math-helper
 */

/**
 * 线性插值
 * 
 * @param a - 起始值
 * @param b - 结束值
 * @param t - 插值因子 [0, 1]
 * @returns 插值结果
 */
export function lerp(a: number, b: number, t: number): number {
  // 限制 t 在 [0,1] 范围内
  t = Math.max(0, Math.min(1, t));
  return a + (b - a) * t;
}

/**
 * 平滑步插值（Smoothstep）
 * 
 * 比线性插值更平滑，起始和结束速度为0
 * 公式：3t² - 2t³
 * 
 * @param a - 起始值
 * @param b - 结束值
 * @param t - 插值因子 [0, 1]
 * @returns 平滑插值结果
 */
export function smoothStep(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const smooth = t * t * (3 - 2 * t);
  return a + (b - a) * smooth;
}

/**
 * 更平滑的插值（Smootherstep）
 * 
 * 公式：6t⁵ - 15t⁴ + 10t³
 * 
 * @param a - 起始值
 * @param b - 结束值
 * @param t - 插值因子 [0, 1]
 * @returns 更平滑的插值结果
 */
export function smootherStep(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const smooth = t * t * t * (t * (t * 6 - 15) + 10);
  return a + (b - a) * smooth;
}

/**
 * 难度曲线函数集合
 * 
 * 用于将玩家技能评分（0-1）映射到游戏难度参数
 */
export const DifficultyCurves = {
  /**
   * 线性增长
   */
  linear: (x: number): number => x,
  
  /**
   * 指数增长（前期简单，后期困难）
   * 适用于需要快速上手的游戏
   */
  exponential: (x: number, power: number = 2): number => Math.pow(x, power),
  
  /**
   * S型曲线（Sigmoid）- 中间难度增长最快
   * 适用于有明确学习曲线的游戏
   */
  sigmoid: (x: number, steepness: number = 10): number => {
    const adjusted = (x - 0.5) * steepness;
    return 1 / (1 + Math.exp(-adjusted));
  },
  
  /**
   * 对数曲线（前期困难，后期平缓）
   * 适用于需要早期挑战的游戏
   */
  logarithmic: (x: number, base: number = 10): number => {
    if (x <= 0) return 0;
    return Math.log(1 + (base - 1) * x) / Math.log(base);
  },
  
  /**
   * 弹性曲线（有起伏，适合动态调整）
   */
  elastic: (x: number, oscillations: number = 3): number => {
    const decay = Math.exp(-x * 3);
    const wave = Math.cos(x * Math.PI * 2 * oscillations);
    return 1 - decay * (1 - wave) * 0.5;
  }
};

/**
 * 计算基于玩家表现的动态难度系数
 * 
 * 使用加权移动平均和历史方差调整
 * 
 * @param winStreak - 连胜次数
 * @param avgSolveTime - 平均解题时间（秒）
 * @param historicalAccuracy - 历史正确率 [0,1]
 * @returns 难度系数 [0,1]
 */
export function calculateDynamicDifficulty(
  winStreak: number,
  avgSolveTime: number,
  historicalAccuracy: number
): number {
  // 连胜影响（连胜越高，难度应越高，但边际递减）
  const streakFactor = Math.min(winStreak / 10, 1) * 0.3;
  
  // 解题时间影响（越快说明越简单，应增加难度）
  // 假设理想解题时间为 60 秒，越快难度应越高
  const timeFactor = Math.max(0, 1 - avgSolveTime / 120) * 0.4;
  
  // 准确率影响（准确率高则增加难度）
  const accuracyFactor = historicalAccuracy * 0.3;
  
  // 综合计算，加入随机扰动增加变化性
  const baseDifficulty = streakFactor + timeFactor + accuracyFactor;
  const noise = (Math.random() - 0.5) * 0.05; // ±2.5% 随机波动
  
  return Math.max(0, Math.min(1, baseDifficulty + noise));
}

/**
 * 带权重的随机选择（轮盘赌算法）
 * 
 * 用于根据概率分布选择游戏元素
 * 
 * @param items - 选项数组
 * @param weights - 对应权重数组（会自动归一化）
 * @returns 选中的选项
 * 
 * @example
 * const enemy = weightedRandom(['goblin', 'dragon'], [0.7, 0.3]);
 */
export function weightedRandom<T>(items: T[], weights: number[]): T {
  if (items.length !== weights.length) {
    throw new Error('选项和权重数量不匹配');
  }
  
  if (items.length === 0) {
    throw new Error('空数组');
  }

  // 计算总和
  const sum = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * sum;
  
  for (let i = 0; i < items.length; i++) {
    random -= weights[i]!;
    if (random <= 0) {
      return items[i]!;
    }
  }
  
  return items[items.length - 1]!; // 兜底
}

/**
 * 高斯/正态分布随机数（Box-Muller 变换）
 * 
 * 用于生成符合自然分布的随机参数（如 NPC 属性浮动）
 * 
 * @param mean - 均值
 * @param stdDev - 标准差
 * @returns 符合正态分布的随机数
 */
export function gaussianRandom(mean: number = 0, stdDev: number = 1): number {
  // Box-Muller 变换
  const u1 = Math.random();
  const u2 = Math.random();
  
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  
  return z0 * stdDev + mean;
}

/**
 * 限制数值在范围内（钳制）
 * 
 * @param value - 输入值
 * @param min - 最小值
 * @param max - 最大值
 * @returns 钳制后的值
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 数值死区处理（消除微小抖动）
 * 
 * 常用于摇杆输入或传感器数据
 * 
 * @param value - 输入值
 * @param threshold - 死区阈值
 * @returns 处理后的值
 */
export function applyDeadZone(value: number, threshold: number): number {
  if (Math.abs(value) < threshold) return 0;
  // 平滑过渡：重新映射 (threshold, 1] 到 (0, 1]
  return (value - threshold * Math.sign(value)) / (1 - threshold);
}

/**
 * 贝塞尔曲线计算（二次）
 * 
 * @param t - 参数 [0,1]
 * @param p0 - 起点
 * @param p1 - 控制点
 * @param p2 - 终点
 * @returns 曲线上点坐标 {x, y}
 */
export function quadraticBezier(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): { x: number; y: number } {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x,
    y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y
  };
}

/**
 * 数值 round 到指定精度
 * 
 * @param value - 数值
 * @param precision - 小数位数，默认 2
 * @returns 四舍五入后的值
 */
export function roundTo(value: number, precision: number = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * 检查数值是否在给定误差范围内相等
 * 
 * 用于浮点数比较，避免精度问题
 * 
 * @param a - 数值 A
 * @param b - 数值 B
 * @param epsilon - 误差范围，默认 1e-9
 * @returns 是否近似相等
 */
export function approximatelyEqual(a: number, b: number, epsilon: number = 1e-9): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * 阶乘计算（带缓存）
 */
const factorialCache: number[] = [1, 1];
export function factorial(n: number): number {
  if (n < 0) return NaN;
  if (n < factorialCache.length) return factorialCache[n]!;
  
  let result = factorialCache[factorialCache.length - 1]!;
  for (let i = factorialCache.length; i <= n; i++) {
    result *= i;
    factorialCache[i] = result;
  }
  return result;
}

/**
 * 组合数计算 C(n, k)
 * 
 * @param n - 总数
 * @param k - 选取数
 * @returns 组合数
 */
export function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  
  // 利用对称性减少计算
  k = Math.min(k, n - k);
  
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result); // 消除浮点误差
}

/**
 * 数组洗牌算法（Fisher-Yates）
 * 
 * @param array - 输入数组（会被修改）
 * @returns 打乱后的数组（同一引用）
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j]!, array[i]!];
  }
  return array;
}

/**
 * 从数组中随机抽取指定数量元素（不重复）
 * 
 * @param array - 源数组
 * @param count - 抽取数量
 * @returns 新数组
 */
export function sample<T>(array: T[], count: number): T[] {
  if (count >= array.length) return [...array];
  if (count <= 0) return [];
  
  const shuffled = [...array];
  shuffle(shuffled);
  return shuffled.slice(0, count);
}