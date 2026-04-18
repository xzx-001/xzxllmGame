export class DialogueGenerator {
    async generateDialogue(context) {
        const { maxNodes = 5 } = context;
        const nodes = [];
        const rootNode = await this.generateNode({
            context,
            speaker: 'ai',
            parentText: '',
            depth: 0,
            maxDepth: maxNodes,
            availableOptions: 3
        });
        nodes.push(rootNode);
        if (rootNode.options) {
            for (const option of rootNode.options) {
                const responseNode = await this.generateNode({
                    context,
                    speaker: 'player',
                    parentText: option.text,
                    depth: 1,
                    maxDepth: maxNodes,
                    parentOption: option
                });
                nodes.push(responseNode);
                option.nextNodeId = responseNode.id;
                if (1 < maxNodes - 1) {
                    const aiReply = await this.generateNode({
                        context,
                        speaker: 'ai',
                        parentText: responseNode.text,
                        depth: 2,
                        maxDepth: maxNodes
                    });
                    nodes.push(aiReply);
                }
            }
        }
        return nodes;
    }
    async generateNode(params) {
        const { context, speaker, depth } = params;
        const prompt = this.buildNodePrompt(params);
        const response = await context.llmProvider.generate(prompt, {
            temperature: 0.8,
            maxTokens: 400
        });
        const text = typeof response.text === 'string' ? response.text : await response.text;
        const parsed = this.parseNodeResponse(text, speaker);
        return {
            ...parsed,
            id: `dialogue_${Date.now()}_${depth}`,
            speaker: parsed.speaker ?? speaker,
            text: parsed.text ?? text.substring(0, 200),
            metadata: {
                generationTime: Date.now(),
                aiMood: context.narrativeState.context.currentMood
            }
        };
    }
    buildNodePrompt(params) {
        const { context, speaker, parentText, depth, availableOptions } = params;
        const { playerProfile, narrativeState, currentTopic } = context;
        const mood = narrativeState.context.currentMood;
        const playerSkill = playerProfile.skillRating;
        return `Generate a dialogue node for an AI character in a puzzle game.

CONTEXT:
- Speaker: ${speaker}
- Player Skill: ${playerSkill}
- AI Mood: ${mood}
- Conversation Depth: ${depth}/${params.maxDepth}
- Current Topic: ${currentTopic || 'general'}
${parentText ? `- Previous: "${parentText}"` : ''}

AVAILABLE CLUES TO REVEAL: ${context.availableClues.join(', ') || 'none'}

REQUIREMENTS:
${speaker === 'ai' ? `
- Write 1-2 sentences as the AI character
- Tone should match AI Mood: ${mood}
- May subtly hint at puzzles or reveal one clue if appropriate
- Provide ${availableOptions} player response options
` : `
- Write the player's response or question
- Should relate to previous AI statement
`}

FORMAT (JSON):
{
  "text": "Dialogue text here",
  "emotion": "neutral|happy|concerned|mysterious|annoyed",
  ${speaker === 'ai' ? `"options": [
    {"text": "Option 1", "type": "question"},
    {"text": "Option 2", "type": "answer"},
    {"text": "Option 3", "type": "action"}
  ],
  "revealsClue": "clue_name_or_null"` : ''}
}`;
    }
    parseNodeResponse(text, speaker) {
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (!parsed.speaker) {
                    parsed.speaker = speaker;
                }
                return parsed;
            }
        }
        catch {
        }
        return {
            text: text.trim().substring(0, 200),
            speaker
        };
    }
    async generateQuickReply(playerInput, context) {
        const prompt = `
Player says: "${playerInput}"

Respond as an AI ${context.narrativeState.context.currentMood} guide in a puzzle game.
- Keep response under 100 characters
- Match the emotional tone
- May include subtle hint if player seems stuck (frustration > 0.6)
- Never break character as AI narrator

Response:`;
        const response = await context.llmProvider.generate(prompt, {
            temperature: 0.9,
            maxTokens: 150
        });
        const text = typeof response.text === 'string' ? response.text : await response.text;
        return this.cleanText(text);
    }
    cleanText(text) {
        return text.trim().replace(/^["']|["']$/g, '');
    }
}
//# sourceMappingURL=dialogue-generator.js.map