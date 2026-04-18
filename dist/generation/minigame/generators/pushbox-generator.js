var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { MiniGameType } from '../types.js';
import { BaseMiniGameGenerator } from '../base-generator.js';
import { RegisterMiniGame } from '../factory.js';
var CellType;
(function (CellType) {
    CellType[CellType["EMPTY"] = 0] = "EMPTY";
    CellType[CellType["WALL"] = 1] = "WALL";
    CellType[CellType["BOX"] = 2] = "BOX";
    CellType[CellType["TARGET"] = 3] = "TARGET";
    CellType[CellType["PLAYER"] = 4] = "PLAYER";
    CellType[CellType["BOX_ON_TARGET"] = 5] = "BOX_ON_TARGET";
})(CellType || (CellType = {}));
let PushboxGenerator = class PushboxGenerator extends BaseMiniGameGenerator {
    type = MiniGameType.PUSHBOX;
    name = 'Pushbox (Sokoban)';
    supportedDifficultyRange = [0.1, 0.95];
    minSize = { width: 5, height: 5 };
    buildPrompt(context) {
        const { targetDifficulty, playerProfile, theme, availableSize } = context;
        const boxCount = Math.floor(this.interpolate(targetDifficulty, 2, 6));
        const gridSize = Math.min(availableSize.width, availableSize.height, Math.floor(this.interpolate(targetDifficulty, 6, 12)));
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
1. All positions must be within grid boundaries (0 to ${gridSize - 1})
2. No overlapping walls, boxes, or player start
3. Boxes cannot start on their targets (must require at least one push)
4. Dependency chain must form a DAG (no circular dependencies)
5. Reserved paths must be clear of walls

Generate only the JSON, no explanation.`;
    }
    parseResponse(response, zoneId, position) {
        try {
            const jsonStr = this.extractJSON(response, zoneId);
            const data = JSON.parse(jsonStr);
            if (!data.width || !data.height || !data.boxes || !data.walls) {
                throw new Error('Missing required fields in pushbox config');
            }
            const baseTime = 60;
            const boxTime = data.boxes.length * 30;
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
        }
        catch (error) {
            throw new Error(`Failed to parse pushbox response: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    validate(zone) {
        const common = this.validateCommon(zone);
        const config = zone.initialConfig;
        const errors = [...common.errors];
        const warnings = [...common.warnings];
        const checkBounds = (pos, name) => {
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
        const occupied = new Set();
        const mark = (pos, name) => {
            const key = `${pos.x},${pos.y}`;
            if (occupied.has(key)) {
                errors.push(`Overlap at (${pos.x},${pos.y}): ${name} conflicts with existing element`);
            }
            occupied.add(key);
        };
        config.walls.forEach(w => mark(w, 'Wall'));
        config.boxes.forEach((b, i) => mark(b.start, `Box ${i}`));
        mark(config.playerStart, 'Player');
        config.boxes.forEach((box, i) => {
            if (box.start.x === box.target.x && box.start.y === box.target.y) {
                warnings.push(`Box ${i} starts on its target (trivial solution)`);
            }
        });
        if (config.dependencyChain) {
            const visited = new Set();
            const visiting = new Set();
            const hasCycle = (boxId) => {
                if (visiting.has(boxId))
                    return true;
                if (visited.has(boxId))
                    return false;
                visiting.add(boxId);
                const deps = config.dependencyChain.filter(d => d.boxId === boxId);
                for (const dep of deps) {
                    for (const depOn of dep.dependsOn) {
                        if (hasCycle(depOn))
                            return true;
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
        if (config.reservedPaths) {
            for (const path of config.reservedPaths) {
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
        if (config.deadlockChecks) {
            for (const check of config.deadlockChecks) {
                if (check.allowedNeighbors.length < 2) {
                    warnings.push(`Deadlock check at (${check.position.x},${check.position.y}) has fewer than 2 allowed neighbors`);
                }
            }
        }
        const result = {
            valid: errors.length === 0,
            errors,
            warnings
        };
        if (errors.length > 0) {
            result.suggestions = ['Consider using fallback configuration'];
        }
        return result;
    }
    generateFallback(context) {
        const { targetDifficulty, zoneId, position } = context;
        const size = Math.max(6, Math.min(10, Math.floor(targetDifficulty * 10) + 4));
        const boxes = [];
        const walls = [];
        for (let x = 0; x < size; x++) {
            walls.push({ x, y: 0 });
            walls.push({ x, y: size - 1 });
        }
        for (let y = 1; y < size - 1; y++) {
            walls.push({ x: 0, y });
            walls.push({ x: size - 1, y });
        }
        const centerY = Math.floor(size / 2);
        const boxCount = Math.max(2, Math.floor(targetDifficulty * 4) + 1);
        for (let i = 0; i < boxCount; i++) {
            const x = 2 + i * 2;
            boxes.push({
                id: `box_${i}`,
                start: { x, y: centerY - 1 },
                target: { x, y: centerY + 1 }
            });
        }
        const reservedPaths = [
            {
                from: { x: 1, y: centerY - 1 },
                to: { x: size - 2, y: centerY - 1 },
                type: 'push'
            },
            {
                from: { x: 1, y: centerY },
                to: { x: size - 2, y: centerY },
                type: 'player'
            }
        ];
        const config = {
            type: MiniGameType.PUSHBOX,
            version: '1.0',
            winCondition: 'Push all boxes to targets below',
            maxSteps: boxCount * 3,
            width: size,
            height: size,
            playerStart: { x: 1, y: 1 },
            boxes,
            walls,
            dependencyChain: boxes.slice(1).map((box, i) => ({
                boxId: box.id,
                dependsOn: [boxes[i].id],
                reason: 'Must clear path from left'
            })),
            reservedPaths,
            deadlockChecks: boxes.map(b => ({
                position: b.target,
                allowedNeighbors: [
                    { x: b.target.x - 1, y: b.target.y },
                    { x: b.target.x + 1, y: b.target.y }
                ]
            }))
        };
        return {
            id: zoneId,
            type: MiniGameType.PUSHBOX,
            position,
            size: { width: size, height: size },
            initialConfig: config,
            difficulty: targetDifficulty,
            estimatedTime: boxCount * 45,
            allowHints: true
        };
    }
    checkSolvability(config) {
        const grid = this.buildGrid(config);
        const issues = [];
        for (const box of config.boxes) {
            const pushDirs = [
                { dx: 0, dy: -1, name: 'up' }, { dx: 0, dy: 1, name: 'down' },
                { dx: -1, dy: 0, name: 'left' }, { dx: 1, dy: 0, name: 'right' }
            ];
            let canPush = false;
            for (const dir of pushDirs) {
                const playerPos = { x: box.start.x - dir.dx, y: box.start.y - dir.dy };
                const targetPos = { x: box.start.x + dir.dx, y: box.start.y + dir.dy };
                if (this.isValidPos(playerPos, config, grid) &&
                    this.isValidPos(targetPos, config, grid, true)) {
                    canPush = true;
                    break;
                }
            }
            if (!canPush) {
                issues.push(`Box ${box.id} cannot be pushed in any direction`);
            }
            const targetNeighbors = [
                { x: box.target.x, y: box.target.y - 1 },
                { x: box.target.x, y: box.target.y + 1 },
                { x: box.target.x - 1, y: box.target.y },
                { x: box.target.x + 1, y: box.target.y }
            ].filter(p => this.isValidPos(p, config, grid, true));
            if (targetNeighbors.length < 2) {
                issues.push(`Target for ${box.id} is a dead end`);
            }
        }
        const result = {
            solvable: issues.length === 0
        };
        if (issues.length > 0) {
            result.solution = issues;
        }
        return result;
    }
    calculateDifficulty(config) {
        let score = 0;
        score += Math.min(0.4, config.boxes.length * 0.08);
        if (config.dependencyChain) {
            const maxDepth = this.calculateDependencyDepth(config.dependencyChain);
            score += Math.min(0.3, maxDepth * 0.1);
        }
        const totalCells = config.width * config.height;
        const wallDensity = config.walls.length / totalCells;
        score += wallDensity * 0.5;
        if (config.reservedPaths) {
            score += Math.max(0, 0.1 - config.reservedPaths.length * 0.02);
        }
        return Math.min(0.95, Math.max(0.1, score));
    }
    calculateDependencyDepth(chain) {
        if (!chain || chain.length === 0)
            return 0;
        const graph = new Map();
        for (const dep of chain) {
            graph.set(dep.boxId, dep.dependsOn);
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
        for (const [node] of graph) {
            dfs(node, 1);
        }
        return maxDepth;
    }
    buildGrid(config) {
        const grid = Array(config.height).fill(0)
            .map(() => Array(config.width).fill(CellType.EMPTY));
        for (const wall of config.walls) {
            if (wall.y >= 0 && wall.y < config.height && wall.x >= 0 && wall.x < config.width) {
                grid[wall.y][wall.x] = CellType.WALL;
            }
        }
        for (const box of config.boxes) {
            if (box.start.y >= 0 && box.start.y < config.height && box.start.x >= 0 && box.start.x < config.width) {
                grid[box.start.y][box.start.x] = CellType.BOX;
            }
        }
        return grid;
    }
    isValidPos(pos, config, grid, allowBoxTarget = false) {
        if (pos.x < 0 || pos.x >= config.width || pos.y < 0 || pos.y >= config.height) {
            return false;
        }
        const cell = grid[pos.y][pos.x];
        return cell === CellType.EMPTY || (allowBoxTarget && cell === CellType.BOX);
    }
};
PushboxGenerator = __decorate([
    RegisterMiniGame()
], PushboxGenerator);
export { PushboxGenerator };
//# sourceMappingURL=pushbox-generator.js.map