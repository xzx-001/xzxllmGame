import { AIMood } from '../../memory/models/narrative-state.js';
import { PlayerProfileFactory } from '../../memory/models/player-profile.js';
import { MiniGameType } from '../minigame/types.js';
import { NarrativeGenerator } from './narrative-generator.js';
export class PromptBuilder {
    narrativeGenerator;
    buildIntroPrompt(params) {
        const { state, playerProfile, upcomingGame, mood, theme, maxLength = 300 } = params;
        const playerSummary = PlayerProfileFactory.generateSummary(playerProfile);
        let gameContext = '';
        if (upcomingGame) {
            const wrapper = this.wrapGameMechanic(upcomingGame, theme);
            gameContext = `
UPCOMING CHALLENGE:
${wrapper.narrativeName}: ${wrapper.description}
Mechanic (hidden from player): ${upcomingGame.type}
Difficulty: ${(upcomingGame.difficulty * 100).toFixed(0)}%
Estimated time: ${upcomingGame.estimatedTime}s
`;
        }
        const toneDescription = this.getToneDescription(mood);
        return `You are an AI game master narrating an interactive puzzle adventure.

PLAYER CONTEXT:
${playerSummary}
Current Location: ${state.context.worldState.currentLocation}
Time in game: ${state.context.worldState.storyTime} units

WORLD STATE:
Discovered clues: ${state.context.worldState.cluesFound.join(', ') || 'None yet'}
Active flags: ${Array.from(state.context.worldState.flags).join(', ') || 'None'}

NARRATIVE THEME: ${theme}
CURRENT AI MOOD: ${mood}
TONE REQUIREMENTS: ${toneDescription}
${gameContext}

INSTRUCTIONS:
Generate an atmospheric intro (max ${maxLength} chars) describing the scene and introducing the challenge.
- Use second person ("you see", "you feel")
- Include sensory details appropriate to theme
- Subtly hint at puzzle mechanics without explicitly stating rules
- Establish the AI's personality based on CURRENT AI MOOD
- If clues are relevant, reference them naturally in narrative
- Do NOT use generic fantasy tropes unless theme requires

Output only the narrative text, no meta-commentary or JSON.`;
    }
    buildBridgePrompt(params) {
        const { state, playerProfile, completedGame, upcomingGame, mood, maxLength = 250 } = params;
        const wrapper = this.wrapGameMechanic(completedGame.zone, state.theme);
        const playerSummary = PlayerProfileFactory.generateSummary(playerProfile);
        const resultText = completedGame.success ? 'succeeded' : 'struggled with';
        const timeDesc = completedGame.timeSpent < 60 ? 'quickly' :
            completedGame.timeSpent < 180 ? 'after some effort' : 'with great difficulty';
        let nextChallenge = '';
        if (upcomingGame) {
            const nextWrapper = this.wrapGameMechanic(upcomingGame, state.theme);
            nextChallenge = `
NEXT CHALLENGE PREVIEW:
${nextWrapper.narrativeName}: ${nextWrapper.description}
`;
        }
        return `Continue the interactive narrative as AI game master.

PLAYER: ${playerSummary}

RECENT EVENT:
Player just ${resultText} the ${wrapper.narrativeName} ${timeDesc}.
Time spent: ${completedGame.timeSpent}s
Success: ${completedGame.success ? 'Yes' : 'No (may need hint next)'}

CURRENT STATE:
Location: ${state.context.worldState.currentLocation}
Mood shift to: ${mood}
${nextChallenge}

INSTRUCTIONS:
Generate a narrative bridge (max ${maxLength} chars):
- React to player's performance (success or struggle)
- Acknowledge their ${completedGame.success ? 'skill' : 'difficulty'} appropriately
- Transition smoothly to next area or challenge
- Adjust tone to match new AI MOOD: ${mood}
- If player struggled, subtly encourage without giving away solution
- If player succeeded, increase challenge tone or congratulate sarcastically based on mood

Output only narrative text.`;
    }
    buildClimaxPrompt(params) {
        const { playerProfile, accumulatedClues, tensionLevel } = params;
        const clueText = accumulatedClues.length > 0
            ? `Accumulated clues: ${accumulatedClues.join(', ')}`
            : 'No clues gathered yet (player may be lost)';
        return `Generate a climactic narrative moment.

PLAYER SKILL RATING: ${playerProfile.skillRating}
${clueText}
TENSION LEVEL: ${(tensionLevel * 100).toFixed(0)}%

REVEAL REQUIREMENTS:
${tensionLevel > 0.7 ? '- Major revelation or plot twist appropriate' : '- Building tension, partial revelation'}
${accumulatedClues.length > 3 ? '- Connect multiple clues together' : '- Hint at importance of undiscovered clues'}

Create a dramatic scene (max 400 chars) that:
- Resolves or intensifies current mystery based on clues found
- Makes player feel their choices mattered
- Sets up finale or next major chapter
- Uses mysterious or dramatic tone`;
    }
    wrapGameMechanic(zone, theme) {
        if (!this.narrativeGenerator) {
            this.narrativeGenerator = new NarrativeGenerator();
        }
        const wrapped = this.narrativeGenerator.wrapMechanicInNarrative(zone.type, this.getBaseDescription(zone.type), theme);
        return {
            narrativeName: wrapped.narrativeName,
            description: wrapped.description
        };
    }
    getBaseDescription(gameType) {
        const baseDescriptions = {
            [MiniGameType.PUSHBOX]: 'Move boxes to designated locations',
            [MiniGameType.LASER_MIRROR]: 'Reflect light beam to reach target',
            [MiniGameType.CIRCUIT_CONNECTION]: 'Connect wires to restore power flow',
            [MiniGameType.RIDDLE]: 'Solve the verbal puzzle',
            [MiniGameType.SLIDING_PUZZLE]: 'Slide tiles into correct order',
            [MiniGameType.MEMORY_SEQUENCE]: 'Remember and repeat the sequence',
            [MiniGameType.LOGIC_GRID]: 'Deduce correct arrangement from clues'
        };
        return baseDescriptions[gameType] || 'Solve the puzzle challenge';
    }
    getToneDescription(mood) {
        const descriptions = {
            [AIMood.PLAYFUL]: 'Light-hearted, encouraging, uses gentle humor, offers hints generously',
            [AIMood.STUBBORN]: 'Challenging, skeptical, makes player prove themselves, minimal hints',
            [AIMood.CONCERNED]: 'Supportive, watches out for player, offers help proactively, reassuring',
            [AIMood.MYSTERIOUS]: 'Cryptic, symbolic language, speaks in riddles, atmospheric',
            [AIMood.SARCASTIC]: 'Witty, dry humor, feigned surprise at player actions, cheeky'
        };
        return descriptions[mood];
    }
}
//# sourceMappingURL=prompt-builder.js.map