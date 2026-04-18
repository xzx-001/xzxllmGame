import { randomUUID } from 'crypto';
export class PlayerProfileFactory {
    static create(displayName) {
        const now = Date.now();
        const id = randomUUID();
        return {
            id,
            displayName: displayName || `Player_${id.slice(0, 8)}`,
            createdAt: now,
            lastActiveAt: now,
            skillRating: 1000,
            skills: {
                logicalThinking: 0.5,
                spatialReasoning: 0.5,
                patternRecognition: 0.5,
                reactionSpeed: 0.5,
                creativity: 0.5,
                memoryRetention: 0.5,
                computationalSkill: 0.5
            },
            emotion: {
                frustrationLevel: 0,
                engagementLevel: 0.5,
                confusionLevel: 0,
                satisfactionLevel: 0.5,
                lastUpdated: now,
                history: []
            },
            preferences: {
                favoriteMiniGameTypes: [],
                difficultyBias: 0,
                narrativePreference: 0.5,
                preferredSessionLength: 30,
                preferredThemes: [],
                dislikedMechanics: []
            },
            progress: {
                firstPlayedAt: now,
                totalPlayTime: 0,
                totalSessions: 0,
                levelHistory: [],
                skillGrowth: []
            },
            tags: [],
            notes: ''
        };
    }
    static updateSkillRating(profile, levelDifficulty, success, performanceScore) {
        const K = 32;
        const expectedScore = 1 / (1 + Math.pow(10, (levelDifficulty * 2000 - profile.skillRating) / 400));
        const actualScore = success ? performanceScore : 0;
        const newRating = profile.skillRating + K * (actualScore - expectedScore);
        profile.skillRating = Math.max(100, Math.min(3000, newRating));
        profile.lastActiveAt = Date.now();
    }
    static updateEmotion(profile, emotion, value, trigger) {
        const now = Date.now();
        profile.emotion[emotion] = Math.max(0, Math.min(1, value));
        profile.emotion.lastUpdated = now;
        profile.emotion.history.push({
            emotion,
            intensity: value,
            timestamp: now,
            trigger
        });
        if (profile.emotion.history.length > 20) {
            profile.emotion.history = profile.emotion.history.slice(-20);
        }
        profile.lastActiveAt = now;
    }
    static recordLevelAttempt(profile, levelId, completed, timeSpent, hintsUsed) {
        const attempt = {
            levelId,
            completed,
            attempts: 1,
            timeSpent,
            hintsUsed,
            timestamp: Date.now()
        };
        const existing = profile.progress.levelHistory.find(l => l.levelId === levelId);
        if (existing) {
            existing.attempts++;
            if (completed && !existing.completed) {
                existing.completed = true;
                existing.timeSpent = timeSpent;
            }
        }
        else {
            profile.progress.levelHistory.push(attempt);
        }
        profile.progress.totalPlayTime += timeSpent / 60;
        if (completed) {
            profile.progress.skillGrowth.push({
                date: Date.now(),
                skills: { ...profile.skills }
            });
        }
        profile.lastActiveAt = Date.now();
    }
    static updateSkills(profile, skillUpdates) {
        for (const [skill, value] of Object.entries(skillUpdates)) {
            if (skill in profile.skills) {
                const current = profile.skills[skill];
                const newValue = current * 0.7 + value * 0.3;
                profile.skills[skill] = Math.max(0, Math.min(1, newValue));
            }
        }
        profile.lastActiveAt = Date.now();
    }
    static serialize(profile) {
        return JSON.stringify(profile);
    }
    static deserialize(data) {
        return JSON.parse(data);
    }
    static calculateRecommendedDifficulty(profile) {
        let baseDifficulty = profile.skillRating / 2000;
        const emotionAdjust = -0.2 * profile.emotion.frustrationLevel +
            0.1 * profile.emotion.engagementLevel;
        const preferenceAdjust = profile.preferences.difficultyBias * 0.1;
        let finalDifficulty = baseDifficulty + emotionAdjust + preferenceAdjust;
        return Math.max(0.1, Math.min(0.95, finalDifficulty));
    }
    static generateSummary(profile) {
        const topSkills = Object.entries(profile.skills)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, score]) => `${name}:${(score * 100).toFixed(0)}%`);
        const mood = profile.emotion.frustrationLevel > 0.6 ? 'frustrated' :
            profile.emotion.engagementLevel > 0.7 ? 'engaged' : 'neutral';
        return `Player ${profile.displayName} (Rating: ${profile.skillRating.toFixed(0)}):
- Top Skills: ${topSkills.join(', ')}
- Current Mood: ${mood}
- Preferred Difficulty: ${this.calculateRecommendedDifficulty(profile).toFixed(2)}
- Experience: ${profile.progress.totalSessions} sessions, ${profile.progress.totalPlayTime.toFixed(1)}h played`;
    }
}
//# sourceMappingURL=player-profile.js.map