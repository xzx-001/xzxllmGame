import { AIMood } from '../../../memory/models/narrative-state.js';
export class IntroTemplates {
    templates = [
        {
            id: 'temple_mysterious',
            themes: ['ancient_temple', 'ruins', 'archaeology'],
            moods: [AIMood.MYSTERIOUS],
            text: `Dust motes dance in the shafts of light piercing the ancient chamber. Before you stands a mechanism untouched for millennia—stone blocks etched with symbols that seem to shift in the shadows. The air grows heavy as you sense the temple's awareness, testing whether you are worthy of its secrets.`,
            variables: ['location', 'mechanism_type'],
            baseDifficulty: 0.5
        },
        {
            id: 'temple_playful',
            themes: ['ancient_temple'],
            moods: [AIMood.PLAYFUL],
            text: `Well, well, another adventurer thinks they can outsmart centuries-old stonework! The carved faces on the walls seem to grin at your approach. Don't worry, these old rocks haven't seen a living soul in ages—they're probably just excited to play with someone new.`,
            variables: [],
            baseDifficulty: 0.3
        },
        {
            id: 'temple_stubborn',
            themes: ['ancient_temple'],
            moods: [AIMood.STUBBORN],
            text: `The chamber lies silent and judging. Many have stood where you stand now; their bones rest in the alcoves above. The mechanism before you has humbled greater minds than yours. Prove you are different, or add your name to the list of the failed.`,
            variables: [],
            baseDifficulty: 0.7
        },
        {
            id: 'scifi_concerned',
            themes: ['sci-fi_lab', 'space_station', 'cyberpunk'],
            moods: [AIMood.CONCERNED],
            text: `Warning lights flicker amber across the diagnostic panel. The automated system's failure has created a dangerous configuration—energy conduits misaligned, containment fields fluctuating. I can guide you through the manual override, but we must proceed carefully. One mistake could cascade into system failure.`,
            variables: ['system_name', 'danger_level'],
            baseDifficulty: 0.6
        },
        {
            id: 'scifi_sarcastic',
            themes: ['sci-fi_lab'],
            moods: [AIMood.SARCASTIC],
            text: `Oh, brilliant. The "foolproof" AI has crashed and left us with this delightful manual calibration puzzle. Look at you, staring at holographic schematics like you're trying to read ancient Sumerian. Try not to electrocute yourself—the cleanup protocols are tedious.`,
            variables: [],
            baseDifficulty: 0.5
        },
        {
            id: 'generic_mysterious',
            themes: ['default', 'dreamscape', 'abstract'],
            moods: [AIMood.MYSTERIOUS],
            text: `Reality bends here. The path forward is obscured by shifting geometries that obey unfamiliar physics. You sense that observation itself affects the outcome—that the puzzle watches back, waiting for the pattern of your thoughts to align with its own hidden logic.`,
            variables: [],
            baseDifficulty: 0.6
        }
    ];
    findMatch(theme, mood) {
        let match = this.templates.find(t => t.themes.includes(theme) && t.moods.includes(mood));
        if (!match) {
            match = this.templates.find(t => t.themes.includes(theme));
        }
        if (!match) {
            match = this.templates.find(t => t.moods.includes(mood));
        }
        return match || this.templates.find(t => t.id === 'generic_mysterious');
    }
    getByTheme(theme) {
        return this.templates.filter(t => t.themes.includes(theme));
    }
    render(template, variables) {
        let text = template.text;
        for (const [key, value] of Object.entries(variables)) {
            text = text.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }
        return text;
    }
    addTemplate(template) {
        this.templates.push(template);
    }
}
//# sourceMappingURL=intro-templates.js.map