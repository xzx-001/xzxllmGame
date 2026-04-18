/**
 * @fileoverview 激光反射生成器 (LaserGenerator)
 * @description 生成激光反射谜题，包含：
 * - 激光源、目标、镜子(可旋转/固定)、分光器、阻挡物等元件
 * - 光路追踪计算(确保有解)
 * - 镜子角度依赖链(某些镜子必须在其他镜子调整后才能正确放置)
 * - 基于物理的反射模拟
 * 
 * @module generation/minigame/generators/laser-generator
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
 * 激光元件类型
 */
export enum LaserComponentType {
  SOURCE = 'source',       // 激光源(固定方向发射)
  TARGET = 'target',       // 接收器(必须被激光击中)
  MIRROR = 'mirror',       // 镜子(45度反射，可旋转)
  FIXED_MIRROR = 'fixed_mirror', // 固定角度镜子
  SPLITTER = 'splitter',   // 分光器(透射+反射)
  BLOCK = 'block',         // 阻挡物(吸收激光)
  PORTAL = 'portal',       // 传送门(成对出现)
  PRISM = 'prism'          // 棱镜(色散，多目标需要)
}

/**
 * 方向枚举(顺时针)
 */
export enum Direction {
  UP = 0,
  RIGHT = 1,
  DOWN = 2,
  LEFT = 3
}

/**
 * 激光元件配置
 */
export interface LaserComponent {
  id: string;
  type: LaserComponentType;
  position: Position;
  direction: Direction;     // 初始朝向/激光发射方向
  fixed: boolean;           // 玩家是否可以旋转/移动
  properties?: {
    color?: 'red' | 'green' | 'blue' | 'white'; // 激光颜色
    intensity?: number;     // 光强(分光后衰减)
    targetId?: string;      // 传送门目标ID
    reflectiveSides?: number[]; // 哪些边可以反射(0=上,1=右...)
  };
}

/**
 * 光路追踪结果
 */
export interface LightPath {
  start: Position;
  direction: Direction;
  segments: Array<{
    from: Position;
    to: Position;
    hitComponent?: string | undefined;
  }>;
  hitsTarget: boolean;
  hitTargetId?: string;
}

/**
 * 激光谜题配置
 */
export interface LaserConfig extends MiniGameConfig {
  type: MiniGameType.LASER_MIRROR;
  
  /** 网格尺寸 */
  width: number;
  height: number;
  
  /** 所有元件列表 */
  components: LaserComponent[];
  
  /** 必须被激活的目标列表 */
  requiredTargets: string[];
  
  /** 可选目标(额外分数) */
  optionalTargets?: string[];
  
  /** 镜子调整依赖链(调整顺序约束) */
  mirrorDependencies?: Array<{
    mirrorId: string;
    mustBeSetAfter: string[];
    reason: string;
  }>;
  
  /** 预计算的光路(用于验证和提示) */
  solutionPath?: LightPath[];
  
  /** 最大允许的镜子旋转次数(限制步数) */
  maxRotations?: number;
  
  /** 是否允许移动元件(高难度) */
  allowMoving?: boolean;
}

/**
 * 激光反射生成器
 */
@RegisterMiniGame()
export class LaserGenerator extends BaseMiniGameGenerator<LaserConfig> {
  readonly type = MiniGameType.LASER_MIRROR;
  readonly name = 'Laser Mirror Puzzle';
  readonly supportedDifficultyRange: [number, number] = [0.2, 0.9];
  readonly minSize = { width: 6, height: 6 };

  /**
   * 构建LLM提示词
   */
  buildPrompt(context: MiniGameContext): string {
    const { targetDifficulty, theme, availableSize } = context;
    
    const componentCount = Math.floor(this.interpolate(targetDifficulty, 3, 8));
    const gridSize = Math.min(
      availableSize.width, 
      availableSize.height, 
      Math.floor(this.interpolate(targetDifficulty, 6, 12))
    );
    
    const requiresColorMixing = targetDifficulty > 0.7;
    
    return `Generate a laser reflection puzzle configuration.

THEME: ${theme || 'sci-fi_lab'}
DIFFICULTY: ${(targetDifficulty * 100).toFixed(0)}%
GRID: ${gridSize}x${gridSize}

ELEMENTS TO INCLUDE:
- 1 Laser Source (fixed position, emits in one direction)
- ${Math.max(1, Math.floor(componentCount / 2))} Targets (must be hit by laser)
- ${Math.floor(componentCount / 2)} Mirrors (some fixed, some rotatable)
${targetDifficulty > 0.5 ? '- 1 Splitter (splits beam into two)' : ''}
${targetDifficulty > 0.6 ? '- 1-2 Blocks (obstacles that must be worked around)' : ''}
${requiresColorMixing ? '- Color prism requiring multiple beam colors to activate' : ''}

REQUIREMENTS:
1. There must be a valid solution path from source to all targets
2. Some mirrors must be rotated by player to solve (not all fixed)
3. Include MIRROR DEPENDENCIES: mirror A must be set correctly before mirror B works
4. No infinite loops in beam path
5. Targets cannot be in direct line of sight from source (must require at least one reflection)

OUTPUT FORMAT (JSON):
{
  "width": ${gridSize},
  "height": ${gridSize},
  "components": [
    {
      "id": "source_1",
      "type": "source",
      "position": {"x": 0, "y": 2},
      "direction": 1,
      "fixed": true,
      "properties": {"color": "white", "intensity": 1.0}
    },
    {
      "id": "target_1",
      "type": "target",
      "position": {"x": 5, "y": 5},
      "direction": 0,
      "fixed": true
    },
    {
      "id": "mirror_1",
      "type": "mirror",
      "position": {"x": 3, "y": 2},
      "direction": 1,
      "fixed": false
    }
  ],
  "requiredTargets": ["target_1"],
  "mirrorDependencies": [
    {
      "mirrorId": "mirror_2",
      "mustBeSetAfter": ["mirror_1"],
      "reason": "mirror_1 must redirect beam to reach mirror_2's position"
    }
  ],
  "allowMoving": false
}

DIRECTIONS: 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT
All positions must be within 0-${gridSize-1} range.

Generate only valid JSON.`;

  }

  /**
   * 解析响应
   */
  parseResponse(response: string, zoneId: string, position: Position): MiniGameZone {
    try {
      const jsonStr = this.extractJSON(response, zoneId);
      const data = JSON.parse(jsonStr) as LaserConfig;
      
      // 预计算解决方案(如果LLM没提供)
      if (!data.solutionPath) {
        data.solutionPath = this.calculateSolutionPath(data);
      }
      
      // 计算预估时间
      const rotatableMirrors = data.components.filter(
        c => c.type === LaserComponentType.MIRROR && !c.fixed
      ).length;
      const estimatedTime = 45 + rotatableMirrors * 20;
      
      return {
        id: zoneId,
        type: MiniGameType.LASER_MIRROR,
        position,
        size: {width: data.width, height: data.height},
        initialConfig: {
          ...data,
          type: MiniGameType.LASER_MIRROR,
          version: '1.0',
          winCondition: `Activate all required targets: ${data.requiredTargets.join(', ')}`,
          timeLimit: Math.floor(estimatedTime * 1.5)
        },
        difficulty: this.calculateDifficulty(data),
        estimatedTime,
        allowHints: true
      };
    } catch (error) {
      throw new Error(`Failed to parse laser puzzle: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 验证配置
   */
  validate(zone: MiniGameZone): ValidationResult {
    const common = this.validateCommon(zone);
    const config = zone.initialConfig as LaserConfig;
    const errors = [...common.errors];
    const warnings = [...common.warnings];
    
    // 1. 检查必需元件
    const hasSource = config.components.some(c => c.type === LaserComponentType.SOURCE);
    const targets = config.components.filter(c => c.type === LaserComponentType.TARGET);
    
    if (!hasSource) {
      errors.push('No laser source found');
    }
    
    if (targets.length === 0) {
      errors.push('No targets found');
    }
    
    // 2. 检查所有必需目标存在
    for (const targetId of config.requiredTargets) {
      if (!config.components.some(c => c.id === targetId)) {
        errors.push(`Required target "${targetId}" not found in components`);
      }
    }
    
    // 3. 检查边界
    for (const comp of config.components) {
      if (comp.position.x < 0 || comp.position.x >= config.width ||
          comp.position.y < 0 || comp.position.y >= config.height) {
        errors.push(`Component ${comp.id} out of bounds`);
      }
    }
    
    // 4. 检查重叠(除了传送门可以成对同位置)
    const positions = new Map<string, string>();
    for (const comp of config.components) {
      const key = `${comp.position.x},${comp.position.y}`;
      if (positions.has(key)) {
        const existing = positions.get(key)!;
        // 允许传送门对
        if (comp.type !== LaserComponentType.PORTAL || 
            config.components.find(c => c.id === existing)?.type !== LaserComponentType.PORTAL) {
          errors.push(`Components overlap at ${key}: ${existing} and ${comp.id}`);
        }
      }
      positions.set(key, comp.id);
    }
    
    // 5. 光路验证(如果提供了解决方案)
    if (config.solutionPath) {
      for (const path of config.solutionPath) {
        if (!path.hitsTarget && config.requiredTargets.length > 0) {
          warnings.push(`Solution path starting at (${path.start.x},${path.start.y}) does not hit required target`);
        }
      }
    }
    
    // 6. 检查依赖链有效性
    if (config.mirrorDependencies) {
      const allMirrorIds = config.components
        .filter(c => c.type === LaserComponentType.MIRROR)
        .map(c => c.id);
      
      for (const dep of config.mirrorDependencies) {
        if (!allMirrorIds.includes(dep.mirrorId)) {
          errors.push(`Dependency references unknown mirror: ${dep.mirrorId}`);
        }
        for (const after of dep.mustBeSetAfter) {
          if (!allMirrorIds.includes(after)) {
            errors.push(`Dependency references unknown mirror: ${after}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 生成降级配置
   */
  generateFallback(context: MiniGameContext): MiniGameZone {
    const { targetDifficulty, zoneId, position } = context;
    const size = 6;
    
    // 创建简单的L形反射谜题
    const components: LaserComponent[] = [
      {
        id: 'source',
        type: LaserComponentType.SOURCE,
        position: {x: 0, y: 0},
        direction: Direction.RIGHT,
        fixed: true,
        properties: {color: 'white', intensity: 1}
      },
      {
        id: 'mirror1',
        type: LaserComponentType.MIRROR,
        position: {x: 3, y: 0},
        direction: Direction.DOWN, // 需要将激光反射向下
        fixed: false
      },
      {
        id: 'target',
        type: LaserComponentType.TARGET,
        position: {x: 3, y: 4},
        direction: Direction.UP,
        fixed: true
      }
    ];
    
    // 添加一些阻挡墙壁作为障碍物
    const blocks: LaserComponent[] = [
      {
        id: 'block1',
        type: LaserComponentType.BLOCK,
        position: {x: 3, y: 1},
        direction: Direction.UP,
        fixed: true
      },
      {
        id: 'block2',
        type: LaserComponentType.BLOCK,
        position: {x: 3, y: 2},
        direction: Direction.UP,
        fixed: true
      }
    ];
    
    if (targetDifficulty > 0.5) {
      components.push(...blocks);
    }
    
    const config: LaserConfig = {
      type: MiniGameType.LASER_MIRROR,
      version: '1.0',
      winCondition: 'Reflect laser from source to target using mirror',
      width: size,
      height: size,
      components,
      requiredTargets: ['target'],
      mirrorDependencies: [{
        mirrorId: 'mirror1',
        mustBeSetAfter: [],
        reason: 'Single mirror solution'
      }],
      allowMoving: false
    };
    
    // 计算解决方案
    config.solutionPath = this.calculateSolutionPath(config);
    
    return {
      id: zoneId,
      type: MiniGameType.LASER_MIRROR,
      position,
      size: {width: size, height: size},
      initialConfig: config,
      difficulty: targetDifficulty,
      estimatedTime: 60,
      allowHints: true
    };
  }

  /**
   * 计算光路解决方案
   * 模拟光束传播
   */
  private calculateSolutionPath(config: LaserConfig): LightPath[] {
    const paths: LightPath[] = [];
    const sources = config.components.filter(c => c.type === LaserComponentType.SOURCE);
    
    for (const source of sources) {
      const path = this.traceBeam(config, source);
      paths.push(path);
    }
    
    return paths;
  }

  /**
   * 追踪单条光束
   */
  private traceBeam(config: LaserConfig, source: LaserComponent): LightPath {
    const segments: LightPath['segments'] = [];
    let currentPos = {...source.position};
    let currentDir = source.direction;
    const visited = new Set<string>(); // 防止循环
    
    const MAX_STEPS = 50;
    
    for (let step = 0; step < MAX_STEPS; step++) {
      const key = `${currentPos.x},${currentPos.y},${currentDir}`;
      if (visited.has(key)) break; // 检测到循环
      visited.add(key);
      
      // 计算下一位置
      const nextPos = this.getNextPosition(currentPos, currentDir);
      
      // 检查边界
      if (nextPos.x < 0 || nextPos.x >= config.width || 
          nextPos.y < 0 || nextPos.y >= config.height) {
        segments.push({
          from: {...currentPos},
          to: {...nextPos},
          hitComponent: undefined
        });
        break;
      }
      
      // 检查击中元件
      const hitComp = config.components.find(c => 
        c.position.x === nextPos.x && c.position.y === nextPos.y
      );
      
      segments.push({
        from: {...currentPos},
        to: {...nextPos},
        hitComponent: hitComp?.id
      });
      
      if (!hitComp) {
        currentPos = nextPos;
        continue;
      }
      
      // 处理击中
      switch (hitComp.type) {
        case LaserComponentType.TARGET:
          return {
            start: source.position,
            direction: source.direction,
            segments,
            hitsTarget: true,
            hitTargetId: hitComp.id
          };
          
        case LaserComponentType.BLOCK:
          return {
            start: source.position,
            direction: source.direction,
            segments,
            hitsTarget: false
          };
          
        case LaserComponentType.MIRROR:
        case LaserComponentType.FIXED_MIRROR:
          // 根据镜子方向反射
          currentDir = this.reflectDirection(currentDir, hitComp.direction);
          currentPos = nextPos;
          break;
          
        case LaserComponentType.SPLITTER:
          // 简化：只追踪主反射路径，忽略透射
          currentDir = this.reflectDirection(currentDir, hitComp.direction);
          currentPos = nextPos;
          break;
          
        case LaserComponentType.PORTAL:
          // 传送到配对传送门
          const pair = config.components.find(c => 
            c.type === LaserComponentType.PORTAL && 
            c.id !== hitComp.id &&
            c.properties?.targetId === hitComp.id
          );
          if (pair) {
            currentPos = {...pair.position};
          } else {
            currentPos = nextPos;
          }
          break;
          
        default:
          currentPos = nextPos;
      }
    }
    
    return {
      start: source.position,
      direction: source.direction,
      segments,
      hitsTarget: false
    };
  }

  /**
   * 根据当前位置和方向计算下一个位置
   */
  private getNextPosition(pos: Position, dir: Direction): Position {
    const moves = [
      {x: 0, y: -1}, // UP
      {x: 1, y: 0},  // RIGHT
      {x: 0, y: 1},  // DOWN
      {x: -1, y: 0}  // LEFT
    ];
    // Direction枚举确保dir的值在0-3范围内
    const move = moves[dir]!;
    return {
      x: pos.x + move.x,
      y: pos.y + move.y
    };
  }

  /**
   * 计算反射后的方向
   * 假设镜子以45度角放置，反射公式基于入射角和镜子朝向
   */
  private reflectDirection(incidentDir: Direction, mirrorDir: Direction): Direction {
    // 简化模型：镜子方向表示其反射面的法线方向
    // 入射方向 -> 反射方向
    // 这只是一个简化的反射逻辑
    
    // 相对角度差
    const diff = (mirrorDir - incidentDir + 4) % 4;
    
    // 根据相对位置决定反射
    if (diff === 1 || diff === 3) {
      // 45度入射，反射
      return (mirrorDir + (diff === 1 ? 1 : -1) + 4) % 4 as Direction;
    }
    
    // 其他情况原路返回或吸收(简化)
    return (incidentDir + 2) % 4 as Direction;
  }

  /**
   * 计算激光谜题难度
   */
  private calculateDifficulty(config: LaserConfig): number {
    let score = 0;

    // 元件数量 (0-0.3)
    const componentCount = config.components.length;
    score += Math.min(0.3, componentCount * 0.02);

    // 可移动镜子数量 (0-0.3)
    const movableMirrors = config.components.filter(c =>
      c.type === LaserComponentType.MIRROR && !c.fixed
    ).length;
    score += Math.min(0.3, movableMirrors * 0.1);

    // 依赖链复杂度 (0-0.2)
    if (config.mirrorDependencies && config.mirrorDependencies.length > 0) {
      const maxDepth = this.calculateMirrorDependencyDepth(config.mirrorDependencies);
      score += Math.min(0.2, maxDepth * 0.05);
    }

    // 必须激活的目标数量 (0-0.2)
    const targetCount = config.requiredTargets.length;
    score += Math.min(0.2, targetCount * 0.05);

    // 可选目标数量 (额外复杂度) (0-0.1)
    const optionalTargetCount = config.optionalTargets?.length || 0;
    score += Math.min(0.1, optionalTargetCount * 0.02);

    return Math.min(0.95, Math.max(0.2, score));
  }

  /**
   * 计算镜子依赖链深度
   */
  private calculateMirrorDependencyDepth(dependencies: Array<{mirrorId: string; mustBeSetAfter: string[]}>): number {
    if (!dependencies || dependencies.length === 0) return 0;

    const graph = new Map<string, string[]>();
    for (const dep of dependencies) {
      graph.set(dep.mirrorId, dep.mustBeSetAfter);
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

    for (const node of graph.keys()) {
      dfs(node, 1);
    }

    return maxDepth;
  }

  // 覆盖基类的checkSolvability(可选实现)
  checkSolvability(config: LaserConfig): { solvable: boolean; solution?: unknown[] } {
    const paths = this.calculateSolutionPath(config);
    const hitTargets = new Set(paths.filter(p => p.hitsTarget).map(p => p.hitTargetId));
    const missing = config.requiredTargets.filter(t => !hitTargets.has(t));

    const result: { solvable: boolean; solution?: string[] } = {
      solvable: missing.length === 0
    };

    if (missing.length > 0) {
      result.solution = missing.map(t => `Cannot hit target: ${t}`);
    }

    return result;
  }
}