export var AIMood;
(function (AIMood) {
    AIMood["PLAYFUL"] = "playful";
    AIMood["STUBBORN"] = "stubborn";
    AIMood["CONCERNED"] = "concerned";
    AIMood["MYSTERIOUS"] = "mysterious";
    AIMood["SARCASTIC"] = "sarcastic";
})(AIMood || (AIMood = {}));
export class NarrativeStateFactory {
    static create(playerId, theme) {
        const rootNode = this.createNode('intro', AIMood.MYSTERIOUS, theme);
        const worldState = {
            cluesFound: [],
            characterRelations: {},
            flags: new Set(),
            variables: {
                tension: 0.5,
                hope: 0.5,
                mystery: 0.8
            },
            currentLocation: 'start',
            visitedLocations: ['start'],
            storyTime: 0,
            realTimeElapsed: 0
        };
        const nodes = new Map();
        nodes.set(rootNode.id, rootNode);
        return {
            id: `narrative_${playerId}`,
            playerId,
            theme,
            rootNodeId: rootNode.id,
            nodes,
            context: {
                playerId,
                currentNodeId: rootNode.id,
                visitedNodes: [rootNode.id],
                decisionHistory: [],
                worldState,
                currentMood: AIMood.MYSTERIOUS
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
            meta: {
                totalNodes: 1,
                maxDepth: 1,
                branchFactor: 0,
                aiPersonality: 'mysterious_guide'
            }
        };
    }
    static createNode(type, mood, theme, content) {
        return {
            id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type,
            content: content || `[Generated content for ${type} node in ${theme} theme]`,
            children: [],
            stateChanges: {},
            metadata: {
                generatedAt: Date.now(),
                aiMood: mood
            }
        };
    }
    static addChildNode(state, parentNodeId, choiceText, mood, content) {
        const parent = state.nodes.get(parentNodeId);
        if (!parent) {
            throw new Error(`Parent node ${parentNodeId} not found`);
        }
        const child = this.createNode('bridge', mood, state.theme, content);
        state.nodes.set(child.id, child);
        parent.children.push({
            nodeId: child.id,
            choiceText
        });
        state.meta.totalNodes++;
        state.meta.maxDepth = this.calculateMaxDepth(state);
        state.meta.branchFactor = this.calculateAvgBranching(state);
        state.updatedAt = Date.now();
        state.version++;
        return child;
    }
    static navigateToNode(state, childIndex) {
        const currentNode = state.nodes.get(state.context.currentNodeId);
        if (!currentNode || childIndex >= currentNode.children.length) {
            return null;
        }
        const choice = currentNode.children[childIndex];
        if (!choice)
            return null;
        const nextNode = state.nodes.get(choice.nodeId);
        if (!nextNode)
            return null;
        state.context.decisionHistory.push({
            nodeId: currentNode.id,
            choiceIndex: childIndex,
            timestamp: Date.now()
        });
        for (const [key, value] of Object.entries(nextNode.stateChanges)) {
            if (typeof value === 'number' && typeof state.context.worldState.variables[key] === 'number') {
                state.context.worldState.variables[key] += value;
            }
            else if (typeof value === 'boolean') {
                state.context.worldState.flags.add(key);
            }
            else {
                state.context.worldState.variables[key] = value;
            }
        }
        if (nextNode.content.includes('[CLUE:')) {
            const clueMatch = nextNode.content.match(/\[CLUE:([^\]]+)\]/);
            if (clueMatch) {
                const clue = clueMatch[1];
                if (clue) {
                    state.context.worldState.cluesFound.push(clue);
                }
            }
        }
        state.context.currentNodeId = nextNode.id;
        state.context.visitedNodes.push(nextNode.id);
        state.context.currentMood = nextNode.metadata.aiMood;
        state.context.worldState.storyTime += 10;
        state.context.worldState.realTimeElapsed =
            (Date.now() - state.createdAt) / 1000;
        state.updatedAt = Date.now();
        state.version++;
        return nextNode;
    }
    static updateMood(state, newMood) {
        state.context.currentMood = newMood;
        const currentNode = state.nodes.get(state.context.currentNodeId);
        if (currentNode) {
            currentNode.metadata.aiMood = newMood;
        }
        state.updatedAt = Date.now();
        state.version++;
    }
    static addClue(state, clue) {
        if (!state.context.worldState.cluesFound.includes(clue)) {
            state.context.worldState.cluesFound.push(clue);
        }
    }
    static setFlag(state, flag) {
        state.context.worldState.flags.add(flag);
    }
    static hasFlag(state, flag) {
        return state.context.worldState.flags.has(flag);
    }
    static setVariable(state, key, value) {
        state.context.worldState.variables[key] = value;
    }
    static getVariable(state, key) {
        return state.context.worldState.variables[key] || 0;
    }
    static serialize(state) {
        const plain = {
            ...state,
            nodes: Array.from(state.nodes.entries()),
            context: {
                ...state.context,
                worldState: {
                    ...state.context.worldState,
                    flags: Array.from(state.context.worldState.flags)
                }
            }
        };
        return JSON.stringify(plain);
    }
    static deserialize(data) {
        const plain = JSON.parse(data);
        return {
            ...plain,
            nodes: new Map(plain.nodes),
            context: {
                ...plain.context,
                worldState: {
                    ...plain.context.worldState,
                    flags: new Set(plain.context.worldState.flags || [])
                }
            }
        };
    }
    static getPathDescription(state) {
        const path = state.context.visitedNodes
            .map(id => state.nodes.get(id))
            .filter(Boolean)
            .map((node, index) => `${index + 1}. [${node.type}] ${node.content.slice(0, 50)}...`);
        return path.join('\n');
    }
    static getCurrentChoices(state) {
        const current = state.nodes.get(state.context.currentNodeId);
        if (!current)
            return [];
        return current.children.map(child => ({
            text: child.choiceText,
            available: this.checkCondition(state, child.condition),
            ...(child.condition && { hint: child.condition })
        }));
    }
    static checkCondition(state, condition) {
        if (!condition)
            return true;
        if (condition.startsWith('has_flag:')) {
            const flag = condition.slice('has_flag:'.length);
            return this.hasFlag(state, flag);
        }
        if (condition.includes('>')) {
            const [varName, val] = condition.split('>');
            if (!varName || !val)
                return true;
            return this.getVariable(state, varName) > parseFloat(val);
        }
        return true;
    }
    static calculateMaxDepth(state) {
        let maxDepth = 0;
        const dfs = (nodeId, depth) => {
            const node = state.nodes.get(nodeId);
            if (!node)
                return;
            maxDepth = Math.max(maxDepth, depth);
            for (const child of node.children) {
                dfs(child.nodeId, depth + 1);
            }
        };
        dfs(state.rootNodeId, 1);
        return maxDepth;
    }
    static calculateAvgBranching(state) {
        let totalBranches = 0;
        let nodeCount = 0;
        for (const node of state.nodes.values()) {
            if (node.children.length > 0) {
                totalBranches += node.children.length;
                nodeCount++;
            }
        }
        return nodeCount > 0 ? totalBranches / nodeCount : 0;
    }
}
//# sourceMappingURL=narrative-state.js.map