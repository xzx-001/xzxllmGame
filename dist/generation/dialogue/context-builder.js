export class DialogueContextBuilder {
    params;
    maxNodes = 5;
    forcedTopic;
    constructor(params) {
        this.params = params;
    }
    setMaxNodes(count) {
        this.maxNodes = count;
        return this;
    }
    setTopic(topic) {
        this.forcedTopic = topic;
        return this;
    }
    build() {
        const { playerProfile, narrativeState, llmProvider } = this.params;
        const topic = this.determineTopic();
        const availableClues = this.filterAvailableClues();
        const adjustedMaxNodes = this.calculateMaxNodes();
        return {
            playerProfile,
            narrativeState,
            currentTopic: topic,
            availableClues,
            llmProvider,
            maxNodes: adjustedMaxNodes
        };
    }
    determineTopic() {
        if (this.forcedTopic)
            return this.forcedTopic;
        const { currentGameZone, recentObservations } = this.params;
        if (recentObservations && recentObservations.length > 0) {
            const lastFail = recentObservations.find(o => !o.success);
            if (lastFail) {
                return 'hint_request';
            }
        }
        if (currentGameZone) {
            return `puzzle_${currentGameZone.type}`;
        }
        const { narrativeState } = this.params;
        const unmentionedClues = narrativeState.context.worldState.cluesFound.filter(clue => !narrativeState.nodes.has(`clue_${clue}`));
        if (unmentionedClues.length > 0) {
            return `reveal_${unmentionedClues[0]}`;
        }
        return 'general_progress';
    }
    filterAvailableClues() {
        const { narrativeState, playerProfile } = this.params;
        const allClues = narrativeState.context.worldState.cluesFound;
        const maxClues = playerProfile.progress.totalSessions < 3 ? 2 : 5;
        return allClues.slice(0, maxClues);
    }
    calculateMaxNodes() {
        const { playerProfile } = this.params;
        if (playerProfile.preferences.preferredSessionLength < 15) {
            return Math.min(3, this.maxNodes);
        }
        if (playerProfile.preferences.narrativePreference > 0.7) {
            return Math.min(8, this.maxNodes + 2);
        }
        return this.maxNodes;
    }
    static quickBuild(params) {
        return new DialogueContextBuilder(params).build();
    }
}
//# sourceMappingURL=context-builder.js.map