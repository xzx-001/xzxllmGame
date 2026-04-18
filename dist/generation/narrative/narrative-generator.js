import { AIMood } from '../../memory/models/narrative-state.js';
import { MiniGameType } from '../minigame/types.js';
import { PromptBuilder } from './prompt-builder.js';
export class NarrativeGenerator {
    promptBuilder;
    constructor() {
        this.promptBuilder = new PromptBuilder();
    }
    async generateIntro(context) {
        const { state, playerProfile, upcomingGame, llmProvider } = context;
        const prompt = this.promptBuilder.buildIntroPrompt({
            state,
            playerProfile,
            upcomingGame,
            theme: state.theme,
            mood: state.context.currentMood,
            maxLength: context.maxLength || 300
        });
        const response = await llmProvider.generate(prompt, {
            temperature: 0.8,
            maxTokens: 500
        });
        const text = typeof response.text === 'string' ? response.text : await response.text;
        const content = this.cleanNarrativeText(text);
        const clues = this.extractClues(content);
        const suggestedMood = this.detectMoodShift(content, state.context.currentMood);
        return {
            content,
            type: 'intro',
            clues,
            suggestedMood,
            promptUsed: prompt
        };
    }
    async generateBridge(context) {
        const { state, playerProfile, completedGame, upcomingGame, llmProvider } = context;
        if (!completedGame) {
            throw new Error('Bridge generation requires completedGame');
        }
        const baseMood = state.context.currentMood;
        const adaptedMood = completedGame.success
            ? this.getSuccessMood(baseMood)
            : this.getFailureMood(baseMood, completedGame.timeSpent);
        const prompt = this.promptBuilder.buildBridgePrompt({
            state,
            playerProfile,
            completedGame,
            upcomingGame,
            mood: adaptedMood,
            maxLength: context.maxLength || 250
        });
        const response = await llmProvider.generate(prompt, {
            temperature: 0.75,
            maxTokens: 400
        });
        const text = typeof response.text === 'string' ? response.text : await response.text;
        const content = this.cleanNarrativeText(text);
        return {
            content,
            type: 'bridge',
            suggestedMood: adaptedMood,
            promptUsed: prompt
        };
    }
    async generateClimax(context) {
        const prompt = this.promptBuilder.buildClimaxPrompt({
            state: context.state,
            playerProfile: context.playerProfile,
            accumulatedClues: context.state.context.worldState.cluesFound,
            tensionLevel: context.state.context.worldState.variables.tension || 0.5
        });
        const response = await context.llmProvider.generate(prompt, {
            temperature: 0.9,
            maxTokens: 600
        });
        const text = typeof response.text === 'string' ? response.text : await response.text;
        return {
            content: this.cleanNarrativeText(text),
            type: 'climax',
            clues: this.extractClues(text),
            suggestedMood: AIMood.MYSTERIOUS
        };
    }
    wrapMechanicInNarrative(gameType, baseDescription, theme) {
        const wrappers = {
            [MiniGameType.PUSHBOX]: {
                'ancient_temple': {
                    name: 'Stone Seal Alignment',
                    desc: 'Ancient stone mechanisms must be pushed into sacred grooves to open passages',
                    verb: 'align'
                },
                'sci-fi_lab': {
                    name: 'Cargo Container Routing',
                    desc: 'Heavy containers block the corridor and must be shifted to clear a path',
                    verb: 'reroute'
                },
                'default': {
                    name: 'Mechanical Puzzle',
                    desc: 'Crates block your path and must be moved to targets',
                    verb: 'push'
                }
            },
            [MiniGameType.LASER_MIRROR]: {
                'ancient_temple': {
                    name: 'Sunlight Reflection',
                    desc: 'Ancient mirrors must be angled to direct sunlight onto crystal receivers',
                    verb: 'reflect'
                },
                'sci-fi_lab': {
                    name: 'Laser Grid Calibration',
                    desc: 'Security lasers need realignment to unlock doors',
                    verb: 'calibrate'
                },
                'default': {
                    name: 'Beam Alignment',
                    desc: 'Mirrors must be adjusted to guide the energy beam',
                    verb: 'align'
                }
            },
            [MiniGameType.CIRCUIT_CONNECTION]: {
                'default': {
                    name: 'Circuit Repair',
                    desc: 'Wires must be connected to restore power',
                    verb: 'connect'
                }
            },
            [MiniGameType.RIDDLE]: {
                'default': {
                    name: 'Riddle Challenge',
                    desc: 'A mysterious voice poses a question',
                    verb: 'answer'
                }
            },
            [MiniGameType.SLIDING_PUZZLE]: {
                'default': {
                    name: 'Tile Arrangement',
                    desc: 'Scattered tiles must be slid into correct order',
                    verb: 'arrange'
                }
            },
            [MiniGameType.MEMORY_SEQUENCE]: {
                'default': {
                    name: 'Echo Pattern',
                    desc: 'Remember and repeat the sequence of tones',
                    verb: 'repeat'
                }
            },
            [MiniGameType.LOGIC_GRID]: {
                'default': {
                    name: 'Logic Deduction',
                    desc: 'Deduce the correct arrangement based on clues',
                    verb: 'deduce'
                }
            }
        };
        const themeWrappers = wrappers[gameType] || wrappers[MiniGameType.PUSHBOX] || {
            'default': { name: 'Puzzle', desc: baseDescription, verb: 'solve' }
        };
        const wrapper = themeWrappers[theme] || themeWrappers['default'] || {
            name: 'Puzzle',
            desc: baseDescription,
            verb: 'solve'
        };
        return {
            narrativeName: wrapper.name,
            description: wrapper.desc,
            verb: wrapper.verb
        };
    }
    async generateChoices(context, choiceCount = 3) {
        const prompt = `
Based on the current narrative context, generate ${choiceCount} distinct choices for the player.
Each choice should have narrative consequences and affect future difficulty.

Context: ${context.state.context.currentNodeId}
Mood: ${context.state.context.currentMood}
Player Skill: ${context.playerProfile.skillRating}

Format as JSON array:
[
  {"text": "Choice description", "consequence": "What happens", "difficulty": 0.3},
  ...
]
`;
        const response = await context.llmProvider.generate(prompt, {
            temperature: 0.8,
            maxTokens: 400
        });
        const text = typeof response.text === 'string' ? response.text : await response.text;
        try {
            const jsonStr = text.match(/\[[\s\S]*\]/)?.[0] || text;
            return JSON.parse(jsonStr);
        }
        catch {
            return [
                { text: 'Proceed cautiously', consequence: 'Lower risk, slower progress', difficulty: 0.3 },
                { text: 'Charge ahead', consequence: 'Higher challenge, faster advancement', difficulty: 0.7 },
                { text: 'Seek alternative path', consequence: 'Puzzle complexity increases', difficulty: 0.5 }
            ];
        }
    }
    cleanNarrativeText(text) {
        return text
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/([.!?])\s*/g, "$1 ")
            .replace(/^\s*["']|["']\s*$/g, '')
            .substring(0, 1000);
    }
    extractClues(text) {
        const clues = [];
        const bracketMatches = text.matchAll(/\[CLUE:([^\]]+)\]/gi);
        for (const match of bracketMatches) {
            if (match[1]) {
                clues.push(match[1].trim());
            }
        }
        const chineseMatches = text.matchAll(/线索[：:]\s*([^\s,.;!，。；！]+)/gi);
        for (const match of chineseMatches) {
            if (match[1]) {
                clues.push(match[1].trim());
            }
        }
        return [...new Set(clues)];
    }
    detectMoodShift(text, currentMood) {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('challenge') || lowerText.includes('dare') || lowerText.includes('prove')) {
            return AIMood.STUBBORN;
        }
        if (lowerText.includes('help') || lowerText.includes('careful') || lowerText.includes('warning')) {
            return AIMood.CONCERNED;
        }
        if (lowerText.includes('joke') || lowerText.includes('play') || lowerText.includes('fun')) {
            return AIMood.PLAYFUL;
        }
        if (lowerText.includes('secret') || lowerText.includes('unknown') || lowerText.includes('mystery')) {
            return AIMood.MYSTERIOUS;
        }
        return currentMood;
    }
    getSuccessMood(baseMood) {
        const transitions = {
            [AIMood.PLAYFUL]: AIMood.SARCASTIC,
            [AIMood.STUBBORN]: AIMood.PLAYFUL,
            [AIMood.CONCERNED]: AIMood.PLAYFUL,
            [AIMood.MYSTERIOUS]: AIMood.SARCASTIC,
            [AIMood.SARCASTIC]: AIMood.PLAYFUL
        };
        return transitions[baseMood] || AIMood.PLAYFUL;
    }
    getFailureMood(baseMood, timeSpent) {
        if (timeSpent > 300) {
            return AIMood.CONCERNED;
        }
        const transitions = {
            [AIMood.PLAYFUL]: AIMood.STUBBORN,
            [AIMood.STUBBORN]: AIMood.SARCASTIC,
            [AIMood.CONCERNED]: AIMood.CONCERNED,
            [AIMood.MYSTERIOUS]: AIMood.CONCERNED,
            [AIMood.SARCASTIC]: AIMood.STUBBORN
        };
        return transitions[baseMood] || AIMood.CONCERNED;
    }
}
//# sourceMappingURL=narrative-generator.js.map