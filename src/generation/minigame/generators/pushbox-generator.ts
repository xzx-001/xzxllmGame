/**
 * @fileoverview 推箱子生成器 (PushboxGenerator)
 * @description 生成推箱子谜题(Sokoban-like)，包含：
 * - 关卡布局生成(墙、箱子、目标点、玩家起始位置)
 * - 依赖链计算(确保箱子必须按特定顺序推动)
 * - 死锁检测(避免生成无解局面)
 * - 基于难度的复杂度控制
 * 
 * 生成的配置可直接用于Unity/Unreal等引擎
 * 
 * @module generation/minigame/generators/pushbox-generator
 */

import { 
  MiniGameType, 
  MiniGameContext, 
  MiniGameZone, 
  MiniGameConfig,
  ValidationResult,
  Position
} from '../types.js';
import { BaseMiniGameGenerator } from '../base-generator.js';
import { RegisterMiniGame } from '../factory.js';

/**
 * 推箱子具体配置
 */
export interface PushboxConfig extends MiniGameConfig {
  type: MiniGameType.PUSHBOX;
  
  /** 网格宽度 */
  width: number;
  
  /** 网格高度 */
  height: number;
  
  /** 玩家起始位置 */
  playerStart: Position;
  
  /** 箱子数组(含起始位置和目标位置) */
  boxes: Array<{
    id: string;
    start: Position;
    target: Position;
  }>;
  
  /** 墙体位置列表 */
  walls: Position[];
  
  /** 依赖链(推动顺序约束) */
  dependencyChain?: Array<{
    boxId: string;
    dependsOn: string[]; // 必须先完成的箱子ID
    reason: string; // 解释为何有此依赖
  }>;
  
  /** 预留通道(确保可达性) */
  reservedPaths: Array<{
    from: Position;
    to: Position;
    type: 'player' | 'push' | 'return';
  }>;
  
  /** 死锁检查点 */
  deadlockChecks: Array<{
    position: Position;
    allowedNeighbors: Position[]; // 允许的相邻位置，防止墙角死锁
  }>;
}

/**
 * 网格单元格类型
 */
enum CellType {
  EMPTY = 0,
  WALL = 1,
  BOX = 2,
  TARGET = 3,
  PLAYER = 4,
  BOX_ON_TARGET = 5
}

/**
 * 推箱子生成器
 */
@RegisterMiniGame()
export class PushboxGenerator extends BaseMiniGameGenerator<PushboxConfig> {
  readonly type = MiniGameType.PUSHBOX;
  readonly name = 'Pushbox (Sokoban)';
  readonly supportedDifficultyRange: [number, number] = [0.1, 0.95];
  readonly minSize = { width: 5, height: 5 };

  /**
   * 构建LLM提示词
   * 要求生成带依赖链的推箱子关卡
   */
  buildPrompt(context: MiniGameContext): string {
    const { targetDifficulty, playerProfile, theme, availableSize } = context;
    
    // 根据难度计算参数
    const boxCount = Math.floor(this.interpolate(targetDifficulty, 2, 6));
    const gridSize = Math.min(
      availableSize.width,
      availableSize.height,
      Math.floor(this.interpolate(targetDifficulty, 6, 12))
    );
    
    return `You are a puzzle game designer. Generate a Sokoban-style pushbox puzzle configuration.

THEME: ${theme || 'ancient_temple'}
DIFFICULTY: ${(targetDifficulty * 100).toFixed(0)}%
PLAYER_SKILL: ${playerProfile.skills?.spatialReasoning || 0.5} (spatial reasoning)

REQUIREMENTS:
- Grid size: ${gridSize}x${gridSize} cells
- Number of boxes: ${boxCount} (each must have a target spot)
- Must be SOLVABLE with EXACTLY ${boxCount} box-pushes to targets
- Include DEPENDENCY CHAIN: some boxes must be moved before others
- Include DEADLOCK PREVENTION: no box should be stuck in corners
- Reserve paths for player movement between all critical points

OUTPUT FORMAT (JSON):
{
  "width": ${gridSize},
  "height": ${gridSize},
  "playerStart": {"x": 1, "y": 1},
  "boxes": [
    {
      "id": "box_1",
      "start": {"x": 3, "y": 3},
      "target": {"x": 5, "y": 5}
    }
  ],
  "walls": [{"x": 0, "y": 0}, ...],
  "dependencyChain": [
    {
      "boxId": "box_2",
      "dependsOn": ["box_1"],
      "reason": "box_2's target is blocked by box_1's start position"
    }
  ],
  "reservedPaths": [
    {
      "from": {"x": 1, "y": 1},
      "to": {"x": 3, "y": 3},
      "type": "push"
    }
  ],
  "deadlockChecks": [
    {
      "position": {"x": 5, "y": 5},
      "allowedNeighbors": [{"x": 5, "y": 4}, {"x": 4, "y": 5}]
    }
  ]
}

RULES:
1. All positions must be within grid boundaries (0 to ${gridSize-1})
2. No overlapping walls, boxes, or player start
3. Boxes cannot start on their targets (must require at least one push)
4. Dependency chain must form a DAG (no circular dependencies)
5. Reserved paths must be clear of walls

Generate only the JSON, no explanation.`;
  }

  /**
   * 解析LLM响应
   */
  parseResponse(response: string, zoneId: string, position: Position): MiniGameZone {
    try {
      const jsonStr = this.extractJSON(response, zoneId);
      const data = JSON.parse(jsonStr) as PushboxConfig;
      
      // 验证基础结构
      if (!data.width || !data.height || !data.boxes || !data.walls) {
        throw new Error('Missing required fields in pushbox config');
      }
      
      // 计算预估时间(基于箱子和难度)
      const baseTime = 60; // 基础60秒
      const boxTime = data.boxes.length * 30; // 每箱子30秒
      const dependencyPenalty = (data.dependencyChain?.length || 0) * 15;
      const estimatedTime = baseTime + boxTime + dependencyPenalty;
      
      return {
        id: zoneId,
        type: MiniGameType.PUSHBOX,
        position,
        size: { width: data.width, height: data.height },
        initialConfig: {
          ...data,
          type: MiniGameType.PUSHBOX,
          version: '1.0',
          winCondition: 'Push all boxes to their target positions',
          maxSteps: data.boxes.length * 5 + 10
        },
        difficulty: this.calculateDifficulty(data),
        estimatedTime,
        allowHints: true
      };
    } catch (error) {
      throw new Error(`Failed to parse pushbox response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 验证推箱子配置
   */
  validate(zone: MiniGameZone): ValidationResult {
    // 通用验证
    const common = this.validateCommon(zone);
    const config = zone.initialConfig as PushboxConfig;
    const errors = [...common.errors];
    const warnings = [...common.warnings];
    
    // 特定验证
    
    // 1. 检查网格边界
    const checkBounds = (pos: Position, name: string) => {
      if (pos.x < 0 || pos.x >= config.width || pos.y < 0 || pos.y >= config.height) {
        errors.push(`${name} (${pos.x},${pos.y}) out of bounds ${config.width}x${config.height}`);
      }
    };
    
    checkBounds(config.playerStart, 'Player start');
    config.boxes.forEach((box, i) => {
      checkBounds(box.start, `Box ${i} start`);
      checkBounds(box.target, `Box ${i} target`);
    });
    config.walls.forEach((w, i) => checkBounds(w, `Wall ${i}`));
    
    // 2. 检查重叠
    const occupied = new Set<string>();
    const mark = (pos: Position, name: string) => {
      const key = `${pos.x},${pos.y}`;
      if (occupied.has(key)) {
        errors.push(`Overlap at (${pos.x},${pos.y}): ${name} conflicts with existing element`);
      }
      occupied.add(key);
    };
    
    config.walls.forEach(w => mark(w, 'Wall'));
    config.boxes.forEach((b, i) => mark(b.start, `Box ${i}`));
    mark(config.playerStart, 'Player');
    
    // 3. 检查箱子起始不在目标上(除非故意设计的简单关卡)
    config.boxes.forEach((box, i) => {
      if (box.start.x === box.target.x && box.start.y === box.target.y) {
        warnings.push(`Box ${i} starts on its target (trivial solution)`);
      }
    });
    
    // 4. 验证依赖链(无循环)
    if (config.dependencyChain) {
      const visited = new Set<string>();
      const visiting = new Set<string>();
      
      const hasCycle = (boxId: string): boolean => {
        if (visiting.has(boxId)) return true;
        if (visited.has(boxId)) return false;
        
        visiting.add(boxId);
        const deps = config.dependencyChain!.filter(d => d.boxId === boxId);
        for (const dep of deps) {
          for (const depOn of dep.dependsOn) {
            if (hasCycle(depOn)) return true;
          }
        }
        visiting.delete(boxId);
        visited.add(boxId);
        return false;
      };
      
      for (const box of config.boxes) {
        if (hasCycle(box.id)) {
          errors.push(`Circular dependency detected involving ${box.id}`);
          break;
        }
      }
    }
    
    // 5. 验证预留路径可达性
    if (config.reservedPaths) {
      for (const path of config.reservedPaths) {
        // 简化检查：确保起点和终点不是墙
        const startKey = `${path.from.x},${path.from.y}`;
        const endKey = `${path.to.x},${path.to.y}`;
        if (config.walls.some(w => `${w.x},${w.y}` === startKey)) {
          errors.push(`Reserved path starts on wall at (${path.from.x},${path.from.y})`);
        }
        if (config.walls.some(w => `${w.x},${w.y}` === endKey)) {
          errors.push(`Reserved path ends on wall at (${path.to.x},${path.to.y})`);
        }
      }
    }
    
    // 6. 死锁检查点验证
    if (config.deadlockChecks) {
      for (const check of config.deadlockChecks) {
        if (check.allowedNeighbors.length < 2) {
          warnings.push(`Deadlock check at (${check.position.x},${check.position.y}) has fewer than 2 allowed neighbors`);
        }
      }
    }
    
    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings
    };

    if (errors.length > 0) {
      result.suggestions = ['Consider using fallback configuration'];
    }

    return result;
  }

  /**
   * 生成降级配置(当LLM失败时使用)
   * 生成经典的"箱子排成一排"的简单谜题
   */
  generateFallback(context: MiniGameContext): MiniGameZone {
    const { targetDifficulty, zoneId, position } = context;
    const size = Math.max(6, Math.min(10, Math.floor(targetDifficulty * 10) + 4));
    
    // 创建简单线性布局
    const boxes: Array<{ id: string; start: Position; target: Position }> = [];
    const walls = [];
    
    // 外围墙
    for (let x = 0; x < size; x++) {
      walls.push({x, y: 0});
      walls.push({x, y: size - 1});
    }
    for (let y = 1; y < size - 1; y++) {
      walls.push({x: 0, y});
      walls.push({x: size - 1, y});
    }
    
    // 内部通道中间的箱子和目标
    const centerY = Math.floor(size / 2);
    const boxCount = Math.max(2, Math.floor(targetDifficulty * 4) + 1);
    
    for (let i = 0; i < boxCount; i++) {
      const x = 2 + i * 2;
      boxes.push({
        id: `box_${i}`,
        start: {x, y: centerY - 1},
        target: {x, y: centerY + 1}
      });
    }
    
    // 预留通道确保可达
    const reservedPaths = [
      {
        from: {x: 1, y: centerY - 1},
        to: {x: size - 2, y: centerY - 1},
        type: 'push' as const
      },
      {
        from: {x: 1, y: centerY},
        to: {x: size - 2, y: centerY},
        type: 'player' as const
      }
    ];
    
    const config: PushboxConfig = {
      type: MiniGameType.PUSHBOX,
      version: '1.0',
      winCondition: 'Push all boxes to targets below',
      maxSteps: boxCount * 3,
      width: size,
      height: size,
      playerStart: {x: 1, y: 1},
      boxes,
      walls,
      dependencyChain: boxes.slice(1).map((box, i) => ({
        boxId: box.id,
        dependsOn: [boxes[i]!.id], // 简单线性依赖
        reason: 'Must clear path from left'
      })),
      reservedPaths,
      deadlockChecks: boxes.map(b => ({
        position: b.target,
        allowedNeighbors: [
          {x: b.target.x - 1, y: b.target.y},
          {x: b.target.x + 1, y: b.target.y}
        ]
      }))
    };
    
    return {
      id: zoneId,
      type: MiniGameType.PUSHBOX,
      position,
      size: {width: size, height: size},
      initialConfig: config,
      difficulty: targetDifficulty,
      estimatedTime: boxCount * 45,
      allowHints: true
    };
  }

  /**
   * 检查可解性(简化BFS)
   * 检查玩家是否能到达所有关键位置
   */
  checkSolvability(config: PushboxConfig): { solvable: boolean; solution?: unknown[] } {
    // 简化检查：确保玩家可以到达每个箱子的四个推动面
    // 并且每个目标位置不是死角
    
    const grid = this.buildGrid(config);
    const issues: string[] = [];
    
    for (const box of config.boxes) {
      // 检查箱子可推动方向
      const pushDirs = [
        {dx: 0, dy: -1, name: 'up'}, {dx: 0, dy: 1, name: 'down'},
        {dx: -1, dy: 0, name: 'left'}, {dx: 1, dy: 0, name: 'right'}
      ];
      
      let canPush = false;
      for (const dir of pushDirs) {
        const playerPos = {x: box.start.x - dir.dx, y: box.start.y - dir.dy};
        const targetPos = {x: box.start.x + dir.dx, y: box.start.y + dir.dy};
        
        // 玩家能站到对面且目标位置不是墙
        if (this.isValidPos(playerPos, config, grid) && 
            this.isValidPos(targetPos, config, grid, true)) {
          canPush = true;
          break;
        }
      }
      
      if (!canPush) {
        issues.push(`Box ${box.id} cannot be pushed in any direction`);
      }
      
      // 检查目标不是死角(至少两个相邻非墙位置，除非在目标上)
      const targetNeighbors = [
        {x: box.target.x, y: box.target.y - 1},
        {x: box.target.x, y: box.target.y + 1},
        {x: box.target.x - 1, y: box.target.y},
        {x: box.target.x + 1, y: box.target.y}
      ].filter(p => this.isValidPos(p, config, grid, true));
      
      if (targetNeighbors.length < 2) {
        issues.push(`Target for ${box.id} is a dead end`);
      }
    }
    
    const result: { solvable: boolean; solution?: unknown[] } = {
      solvable: issues.length === 0
    };

    if (issues.length > 0) {
      result.solution = issues;
    }

    return result;
  }

  /**
   * 计算实际难度分数(基于多维度)
   */
  private calculateDifficulty(config: PushboxConfig): number {
    let score = 0;
    
    // 箱子数量 (0-0.4)
    score += Math.min(0.4, config.boxes.length * 0.08);
    
    // 依赖链复杂度 (0-0.3)
    if (config.dependencyChain) {
      const maxDepth = this.calculateDependencyDepth(config.dependencyChain);
      score += Math.min(0.3, maxDepth * 0.1);
    }
    
    // 地图密度(墙体占比) (0-0.2)
    const totalCells = config.width * config.height;
    const wallDensity = config.walls.length / totalCells;
    score += wallDensity * 0.5; // 0-0.2
    
    // 预留路径数量(负相关，路径越多越简单) (0-0.1)
    if (config.reservedPaths) {
      score += Math.max(0, 0.1 - config.reservedPaths.length * 0.02);
    }
    
    return Math.min(0.95, Math.max(0.1, score));
  }

  /**
   * 计算依赖链深度
   */
  private calculateDependencyDepth(chain: PushboxConfig['dependencyChain']): number {
    if (!chain || chain.length === 0) return 0;
    
    const graph = new Map<string, string[]>();
    for (const dep of chain) {
      graph.set(dep.boxId, dep.dependsOn);
    }
    
    let maxDepth = 0;
    const visited = new Set<string>();
    
    const dfs = (node: string, depth: number) => {
      if (visited.has(node)) return;
      visited.add(node);
      maxDepth = Math.max(maxDepth, depth);
      
      const deps = graph.get(node) || [];
      for (const dep of deps) {
        dfs(dep, depth + 1);
      }
    };
    
    for (const [node] of graph) {
      dfs(node, 1);
    }
    
    return maxDepth;
  }

  /**
   * 构建网格辅助方法
   */
  private buildGrid(config: PushboxConfig): number[][] {
    const grid: number[][] = Array(config.height).fill(0)
      .map(() => Array(config.width).fill(CellType.EMPTY));

    for (const wall of config.walls) {
      if (wall.y >= 0 && wall.y < config.height && wall.x >= 0 && wall.x < config.width) {
        grid[wall.y]![wall.x] = CellType.WALL;
      }
    }

    for (const box of config.boxes) {
      if (box.start.y >= 0 && box.start.y < config.height && box.start.x >= 0 && box.start.x < config.width) {
        grid[box.start.y]![box.start.x] = CellType.BOX;
      }
    }

    return grid;
  }

  /**
   * 检查位置是否有效(在边界内且不是墙)
   */
  private isValidPos(
    pos: Position, 
    config: PushboxConfig, 
    grid: number[][],
    allowBoxTarget = false
  ): boolean {
    if (pos.x < 0 || pos.x >= config.width || pos.y < 0 || pos.y >= config.height) {
      return false;
    }
    const cell = grid[pos.y]![pos.x];
    return cell === CellType.EMPTY || (allowBoxTarget && cell === CellType.BOX);
  }
}