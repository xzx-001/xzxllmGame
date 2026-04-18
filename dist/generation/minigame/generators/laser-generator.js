var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { MiniGameType } from '../types.js';
import { BaseMiniGameGenerator } from '../base-generator.js';
import { RegisterMiniGame } from '../factory.js';
export var LaserComponentType;
(function (LaserComponentType) {
    LaserComponentType["SOURCE"] = "source";
    LaserComponentType["TARGET"] = "target";
    LaserComponentType["MIRROR"] = "mirror";
    LaserComponentType["FIXED_MIRROR"] = "fixed_mirror";
    LaserComponentType["SPLITTER"] = "splitter";
    LaserComponentType["BLOCK"] = "block";
    LaserComponentType["PORTAL"] = "portal";
    LaserComponentType["PRISM"] = "prism";
})(LaserComponentType || (LaserComponentType = {}));
export var Direction;
(function (Direction) {
    Direction[Direction["UP"] = 0] = "UP";
    Direction[Direction["RIGHT"] = 1] = "RIGHT";
    Direction[Direction["DOWN"] = 2] = "DOWN";
    Direction[Direction["LEFT"] = 3] = "LEFT";
})(Direction || (Direction = {}));
let LaserGenerator = class LaserGenerator extends BaseMiniGameGenerator {
    type = MiniGameType.LASER_MIRROR;
    name = 'Laser Mirror Puzzle';
    supportedDifficultyRange = [0.2, 0.9];
    minSize = { width: 6, height: 6 };
    buildPrompt(context) {
        const { targetDifficulty, theme, availableSize } = context;
        const componentCount = Math.floor(this.interpolate(targetDifficulty, 3, 8));
        const gridSize = Math.min(availableSize.width, availableSize.height, Math.floor(this.interpolate(targetDifficulty, 6, 12)));
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
All positions must be within 0-${gridSize - 1} range.

Generate only valid JSON.`;
    }
    parseResponse(response, zoneId, position) {
        try {
            const jsonStr = this.extractJSON(response, zoneId);
            const data = JSON.parse(jsonStr);
            if (!data.solutionPath) {
                data.solutionPath = this.calculateSolutionPath(data);
            }
            const rotatableMirrors = data.components.filter(c => c.type === LaserComponentType.MIRROR && !c.fixed).length;
            const estimatedTime = 45 + rotatableMirrors * 20;
            return {
                id: zoneId,
                type: MiniGameType.LASER_MIRROR,
                position,
                size: { width: data.width, height: data.height },
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
        }
        catch (error) {
            throw new Error(`Failed to parse laser puzzle: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    validate(zone) {
        const common = this.validateCommon(zone);
        const config = zone.initialConfig;
        const errors = [...common.errors];
        const warnings = [...common.warnings];
        const hasSource = config.components.some(c => c.type === LaserComponentType.SOURCE);
        const targets = config.components.filter(c => c.type === LaserComponentType.TARGET);
        if (!hasSource) {
            errors.push('No laser source found');
        }
        if (targets.length === 0) {
            errors.push('No targets found');
        }
        for (const targetId of config.requiredTargets) {
            if (!config.components.some(c => c.id === targetId)) {
                errors.push(`Required target "${targetId}" not found in components`);
            }
        }
        for (const comp of config.components) {
            if (comp.position.x < 0 || comp.position.x >= config.width ||
                comp.position.y < 0 || comp.position.y >= config.height) {
                errors.push(`Component ${comp.id} out of bounds`);
            }
        }
        const positions = new Map();
        for (const comp of config.components) {
            const key = `${comp.position.x},${comp.position.y}`;
            if (positions.has(key)) {
                const existing = positions.get(key);
                if (comp.type !== LaserComponentType.PORTAL ||
                    config.components.find(c => c.id === existing)?.type !== LaserComponentType.PORTAL) {
                    errors.push(`Components overlap at ${key}: ${existing} and ${comp.id}`);
                }
            }
            positions.set(key, comp.id);
        }
        if (config.solutionPath) {
            for (const path of config.solutionPath) {
                if (!path.hitsTarget && config.requiredTargets.length > 0) {
                    warnings.push(`Solution path starting at (${path.start.x},${path.start.y}) does not hit required target`);
                }
            }
        }
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
    generateFallback(context) {
        const { targetDifficulty, zoneId, position } = context;
        const size = 6;
        const components = [
            {
                id: 'source',
                type: LaserComponentType.SOURCE,
                position: { x: 0, y: 0 },
                direction: Direction.RIGHT,
                fixed: true,
                properties: { color: 'white', intensity: 1 }
            },
            {
                id: 'mirror1',
                type: LaserComponentType.MIRROR,
                position: { x: 3, y: 0 },
                direction: Direction.DOWN,
                fixed: false
            },
            {
                id: 'target',
                type: LaserComponentType.TARGET,
                position: { x: 3, y: 4 },
                direction: Direction.UP,
                fixed: true
            }
        ];
        const blocks = [
            {
                id: 'block1',
                type: LaserComponentType.BLOCK,
                position: { x: 3, y: 1 },
                direction: Direction.UP,
                fixed: true
            },
            {
                id: 'block2',
                type: LaserComponentType.BLOCK,
                position: { x: 3, y: 2 },
                direction: Direction.UP,
                fixed: true
            }
        ];
        if (targetDifficulty > 0.5) {
            components.push(...blocks);
        }
        const config = {
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
        config.solutionPath = this.calculateSolutionPath(config);
        return {
            id: zoneId,
            type: MiniGameType.LASER_MIRROR,
            position,
            size: { width: size, height: size },
            initialConfig: config,
            difficulty: targetDifficulty,
            estimatedTime: 60,
            allowHints: true
        };
    }
    calculateSolutionPath(config) {
        const paths = [];
        const sources = config.components.filter(c => c.type === LaserComponentType.SOURCE);
        for (const source of sources) {
            const path = this.traceBeam(config, source);
            paths.push(path);
        }
        return paths;
    }
    traceBeam(config, source) {
        const segments = [];
        let currentPos = { ...source.position };
        let currentDir = source.direction;
        const visited = new Set();
        const MAX_STEPS = 50;
        for (let step = 0; step < MAX_STEPS; step++) {
            const key = `${currentPos.x},${currentPos.y},${currentDir}`;
            if (visited.has(key))
                break;
            visited.add(key);
            const nextPos = this.getNextPosition(currentPos, currentDir);
            if (nextPos.x < 0 || nextPos.x >= config.width ||
                nextPos.y < 0 || nextPos.y >= config.height) {
                segments.push({
                    from: { ...currentPos },
                    to: { ...nextPos },
                    hitComponent: undefined
                });
                break;
            }
            const hitComp = config.components.find(c => c.position.x === nextPos.x && c.position.y === nextPos.y);
            segments.push({
                from: { ...currentPos },
                to: { ...nextPos },
                hitComponent: hitComp?.id
            });
            if (!hitComp) {
                currentPos = nextPos;
                continue;
            }
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
                    currentDir = this.reflectDirection(currentDir, hitComp.direction);
                    currentPos = nextPos;
                    break;
                case LaserComponentType.SPLITTER:
                    currentDir = this.reflectDirection(currentDir, hitComp.direction);
                    currentPos = nextPos;
                    break;
                case LaserComponentType.PORTAL:
                    const pair = config.components.find(c => c.type === LaserComponentType.PORTAL &&
                        c.id !== hitComp.id &&
                        c.properties?.targetId === hitComp.id);
                    if (pair) {
                        currentPos = { ...pair.position };
                    }
                    else {
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
    getNextPosition(pos, dir) {
        const moves = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 }
        ];
        const move = moves[dir];
        return {
            x: pos.x + move.x,
            y: pos.y + move.y
        };
    }
    reflectDirection(incidentDir, mirrorDir) {
        const diff = (mirrorDir - incidentDir + 4) % 4;
        if (diff === 1 || diff === 3) {
            return (mirrorDir + (diff === 1 ? 1 : -1) + 4) % 4;
        }
        return (incidentDir + 2) % 4;
    }
    calculateDifficulty(config) {
        let score = 0;
        const componentCount = config.components.length;
        score += Math.min(0.3, componentCount * 0.02);
        const movableMirrors = config.components.filter(c => c.type === LaserComponentType.MIRROR && !c.fixed).length;
        score += Math.min(0.3, movableMirrors * 0.1);
        if (config.mirrorDependencies && config.mirrorDependencies.length > 0) {
            const maxDepth = this.calculateMirrorDependencyDepth(config.mirrorDependencies);
            score += Math.min(0.2, maxDepth * 0.05);
        }
        const targetCount = config.requiredTargets.length;
        score += Math.min(0.2, targetCount * 0.05);
        const optionalTargetCount = config.optionalTargets?.length || 0;
        score += Math.min(0.1, optionalTargetCount * 0.02);
        return Math.min(0.95, Math.max(0.2, score));
    }
    calculateMirrorDependencyDepth(dependencies) {
        if (!dependencies || dependencies.length === 0)
            return 0;
        const graph = new Map();
        for (const dep of dependencies) {
            graph.set(dep.mirrorId, dep.mustBeSetAfter);
        }
        let maxDepth = 0;
        const visited = new Set();
        const dfs = (node, depth) => {
            if (visited.has(node))
                return;
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
    checkSolvability(config) {
        const paths = this.calculateSolutionPath(config);
        const hitTargets = new Set(paths.filter(p => p.hitsTarget).map(p => p.hitTargetId));
        const missing = config.requiredTargets.filter(t => !hitTargets.has(t));
        const result = {
            solvable: missing.length === 0
        };
        if (missing.length > 0) {
            result.solution = missing.map(t => `Cannot hit target: ${t}`);
        }
        return result;
    }
};
LaserGenerator = __decorate([
    RegisterMiniGame()
], LaserGenerator);
export { LaserGenerator };
//# sourceMappingURL=laser-generator.js.map