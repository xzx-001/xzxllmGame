/**
 * @fileoverview 叙事状态模型 (NarrativeState)
 * @description 管理游戏叙事的完整上下文，包括：
 * - 当前剧情节点位置
 * - 世界状态变量
 * - 角色关系图谱
 * - 历史决策树
 * - AI人格状态
 * 
 * 支持非线性叙事和动态剧情生成
 * 
 * @module memory/models/narrative-state
 */

/**
 * AI 当前人格/情绪状态
 * 影响叙事语气和谜题设计
 */
export enum AIMood {
  /**  playful: 轻松、鼓励、提示较多 */
  PLAYFUL = 'playful',
  
  /** stubborn: 挑战性强、故意刁难、少提示 */
  STUBBORN = 'stubborn',
  
  /** concerned: 关心玩家、降低难度、提供帮助 */
  CONCERNED = 'concerned',
  
  /** mysterious: 神秘、模糊、象征性语言 */
  MYSTERIOUS = 'mysterious',
  
  /** sarcastic: 讽刺、幽默、调侃 */
  SARCASTIC = 'sarcastic'
}

/**
 * 叙事节点
 * 故事树中的单个节点
 */
export interface NarrativeNode {
  /** 节点ID */
  id: string;
  
  /** 节点类型 */
  type: 'intro' | 'bridge' | 'climax' | 'resolution' | 'twist' | 'puzzle_intro';
  
  /** 节点内容/文本 */
  content: string;
  
  /** 关联的谜题ID (如果有) */
  linkedPuzzleId?: string;
  
  /** 子节点 (选择分支) */
  children: Array<{
    nodeId: string;
    choiceText: string; // 玩家看到的选择文本
    condition?: string; // 触发条件 (如 "skill>50")
  }>;
  
  /** 进入该节点时的世界状态变更 */
  stateChanges: Record<string, number | boolean | string>;
  
  /** 节点元数据 */
  metadata: {
    generatedAt: number;
    aiMood: AIMood;
    difficultyOverride?: number;
  };
}

/**
 * 世界状态变量
 * 跟踪叙事中的持久状态
 */
export interface WorldState {
  /** 玩家发现的关键线索 */
  cluesFound: string[];
  
  /** 角色关系值 (-1 敌对, 0 中立, 1 友好) */
  characterRelations: Record<string, number>;
  
  /** 剧情标志位 (如 "rescued_princess", "found_key") */
  flags: Set<string>;
  
  /** 数值变量 (如 "reputation", "sanity") */
  variables: Record<string, number>;
  
  /** 位置状态 */
  currentLocation: string;
  visitedLocations: string[];
  
  /** 时间追踪 */
  storyTime: number; // 虚拟时间单位
  realTimeElapsed: number; // 实际秒数
}

/**
 * 叙事上下文
 * 传递给生成器的完整状态
 */
export interface NarrativeContext {
  /** 玩家ID */
  playerId: string;
  
  /** 当前所在节点ID */
  currentNodeId: string;
  
  /** 已访问节点历史 */
  visitedNodes: string[];
  
  /** 决策历史 */
  decisionHistory: Array<{
    nodeId: string;
    choiceIndex: number;
    timestamp: number;
  }>;
  
  /** 世界状态 */
  worldState: WorldState;
  
  /** 当前AI情绪 */
  currentMood: AIMood;
  
  /** 即将到来的谜题预告 */
  upcomingPuzzle?: {
    type: string;
    difficulty: number;
    theme: string;
  };
}

/**
 * 叙事状态主类
 * 完整的叙事数据容器
 */
export interface NarrativeState {
  /** 状态ID (对应玩家ID) */
  id: string;
  
  /** 关联的玩家ID */
  playerId: string;
  
  /** 叙事标题/主题 */
  theme: string;
  
  /** 故事根节点 */
  rootNodeId: string;
  
  /** 所有节点映射 */
  nodes: Map<string, NarrativeNode>;
  
  /** 当前上下文 */
  context: NarrativeContext;
  
  /** 创建时间 */
  createdAt: number;
  
  /** 最后更新时间 */
  updatedAt: number;
  
  /** 版本号 (用于冲突解决) */
  version: number;
  
  /** 元数据 */
  meta: {
    totalNodes: number;
    maxDepth: number;
    branchFactor: number;
    aiPersonality: string;
  };
}

/**
 * 叙事状态工厂
 * 提供创建、导航、更新等方法
 */
export class NarrativeStateFactory {
  /**
   * 创建新的叙事状态
   */
  static create(playerId: string, theme: string): NarrativeState {
    const rootNode = this.createNode('intro', AIMood.MYSTERIOUS, theme);
    
    const worldState: WorldState = {
      cluesFound: [],
      characterRelations: {},
      flags: new Set(),
      variables: {
        tension: 0.5, // 紧张度
        hope: 0.5,    // 希望值
        mystery: 0.8  // 神秘度
      },
      currentLocation: 'start',
      visitedLocations: ['start'],
      storyTime: 0,
      realTimeElapsed: 0
    };
    
    const nodes = new Map<string, NarrativeNode>();
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

  /**
   * 创建新节点
   */
  static createNode(
    type: NarrativeNode['type'],
    mood: AIMood,
    theme: string,
    content?: string
  ): NarrativeNode {
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

  /**
   * 添加子节点
   * 创建分支选择
   */
  static addChildNode(
    state: NarrativeState,
    parentNodeId: string,
    choiceText: string,
    mood: AIMood,
    content?: string
  ): NarrativeNode {
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

  /**
   * 导航到子节点
   * 更新上下文状态
   */
  static navigateToNode(
    state: NarrativeState,
    childIndex: number
  ): NarrativeNode | null {
    const currentNode = state.nodes.get(state.context.currentNodeId);
    if (!currentNode || childIndex >= currentNode.children.length) {
      return null;
    }
    
    const choice = currentNode.children[childIndex];
    if (!choice) return null;
    const nextNode = state.nodes.get(choice.nodeId);
    if (!nextNode) return null;
    
    // 记录决策
    state.context.decisionHistory.push({
      nodeId: currentNode.id,
      choiceIndex: childIndex,
      timestamp: Date.now()
    });
    
    // 更新世界状态
    for (const [key, value] of Object.entries(nextNode.stateChanges)) {
      if (typeof value === 'number' && typeof state.context.worldState.variables[key] === 'number') {
        state.context.worldState.variables[key] += value;
      } else if (typeof value === 'boolean') {
        state.context.worldState.flags.add(key);
      } else {
        state.context.worldState.variables[key] = value as number;
      }
    }
    
    // 检查线索
    if (nextNode.content.includes('[CLUE:')) {
      const clueMatch = nextNode.content.match(/\[CLUE:([^\]]+)\]/);
      if (clueMatch) {
        const clue = clueMatch[1];
        if (clue) {
          state.context.worldState.cluesFound.push(clue);
        }
      }
    }
    
    // 更新当前节点
    state.context.currentNodeId = nextNode.id;
    state.context.visitedNodes.push(nextNode.id);
    state.context.currentMood = nextNode.metadata.aiMood;
    
    // 更新时间
    state.context.worldState.storyTime += 10; // 每个节点推进10个时间单位
    state.context.worldState.realTimeElapsed = 
      (Date.now() - state.createdAt) / 1000;
    
    state.updatedAt = Date.now();
    state.version++;
    
    return nextNode;
  }

  /**
   * 更新AI情绪
   * 基于玩家表现调整
   */
  static updateMood(state: NarrativeState, newMood: AIMood): void {
    state.context.currentMood = newMood;
    
    // 更新当前节点的情绪
    const currentNode = state.nodes.get(state.context.currentNodeId);
    if (currentNode) {
      currentNode.metadata.aiMood = newMood;
    }
    
    state.updatedAt = Date.now();
    state.version++;
  }

  /**
   * 添加线索
   */
  static addClue(state: NarrativeState, clue: string): void {
    if (!state.context.worldState.cluesFound.includes(clue)) {
      state.context.worldState.cluesFound.push(clue);
    }
  }

  /**
   * 设置标志位
   */
  static setFlag(state: NarrativeState, flag: string): void {
    state.context.worldState.flags.add(flag);
  }

  /**
   * 获取标志值
   */
  static hasFlag(state: NarrativeState, flag: string): boolean {
    return state.context.worldState.flags.has(flag);
  }

  /**
   * 设置变量
   */
  static setVariable(state: NarrativeState, key: string, value: number): void {
    state.context.worldState.variables[key] = value;
  }

  /**
   * 获取变量
   */
  static getVariable(state: NarrativeState, key: string): number {
    return state.context.worldState.variables[key] || 0;
  }

  /**
   * 序列化 (处理Set类型)
   */
  static serialize(state: NarrativeState): string {
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

  /**
   * 反序列化
   */
  static deserialize(data: string): NarrativeState {
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

  /**
   * 获取当前路径描述
   * 用于LLM上下文
   */
  static getPathDescription(state: NarrativeState): string {
    const path = state.context.visitedNodes
      .map(id => state.nodes.get(id))
      .filter(Boolean)
      .map((node, index) => `${index + 1}. [${node!.type}] ${node!.content.slice(0, 50)}...`);
    
    return path.join('\n');
  }

  /**
   * 生成选择提示
   * 显示给玩家的选项
   */
  static getCurrentChoices(state: NarrativeState): Array<{
    text: string;
    available: boolean;
    hint?: string;
  }> {
    const current = state.nodes.get(state.context.currentNodeId);
    if (!current) return [];
    
    return current.children.map(child => ({
      text: child.choiceText,
      available: this.checkCondition(state, child.condition),
      ...(child.condition && { hint: child.condition })
    }));
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 检查条件
   */
  private static checkCondition(state: NarrativeState, condition?: string): boolean {
    if (!condition) return true;
    
    // 简单条件解析: "skill>50", "has_flag:rescued"
    if (condition.startsWith('has_flag:')) {
      const flag = condition.slice('has_flag:'.length);
      return this.hasFlag(state, flag);
    }
    
    if (condition.includes('>')) {
      const [varName, val] = condition.split('>');
      if (!varName || !val) return true;
      return this.getVariable(state, varName) > parseFloat(val);
    }
    
    return true;
  }

  /**
   * 计算最大深度
   */
  private static calculateMaxDepth(state: NarrativeState): number {
    let maxDepth = 0;
    
    const dfs = (nodeId: string, depth: number) => {
      const node = state.nodes.get(nodeId);
      if (!node) return;
      
      maxDepth = Math.max(maxDepth, depth);
      
      for (const child of node.children) {
        dfs(child.nodeId, depth + 1);
      }
    };
    
    dfs(state.rootNodeId, 1);
    return maxDepth;
  }

  /**
   * 计算平均分支因子
   */
  private static calculateAvgBranching(state: NarrativeState): number {
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