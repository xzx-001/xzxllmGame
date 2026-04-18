export var ObservationType;
(function (ObservationType) {
    ObservationType["PUZZLE_START"] = "puzzle_start";
    ObservationType["PUZZLE_COMPLETE"] = "puzzle_complete";
    ObservationType["PUZZLE_FAIL"] = "puzzle_fail";
    ObservationType["PUZZLE_HINT_USED"] = "puzzle_hint_used";
    ObservationType["PUZZLE_ACTION"] = "puzzle_action";
    ObservationType["ROOM_ENTER"] = "room_enter";
    ObservationType["ROOM_EXIT"] = "room_exit";
    ObservationType["OBJECT_INTERACT"] = "object_interact";
    ObservationType["DIALOGUE_CHOICE"] = "dialogue_choice";
    ObservationType["DIALOGUE_IGNORE"] = "dialogue_ignore";
    ObservationType["PAUSE"] = "pause";
    ObservationType["RESUME"] = "resume";
    ObservationType["QUIT"] = "quit";
    ObservationType["ERROR"] = "error";
})(ObservationType || (ObservationType = {}));
export class ObservationFactory {
    static idCounter = 0;
    static create(playerId, type, locationId, details = {}, puzzleId) {
        const urgency = this.calculateUrgency(type, details);
        return {
            id: `obs_${Date.now()}_${++this.idCounter}`,
            playerId,
            type,
            timestamp: Date.now(),
            locationId,
            details,
            urgency,
            processed: false,
            ...(puzzleId !== undefined && { puzzleId })
        };
    }
    static processBatch(observations) {
        if (observations.length === 0) {
            throw new Error('Empty observation batch');
        }
        const firstObs = observations[0];
        const playerId = firstObs.playerId;
        const sorted = [...observations].sort((a, b) => a.timestamp - b.timestamp);
        const startTime = sorted[0].timestamp;
        const endTime = sorted[sorted.length - 1].timestamp;
        let attempts = 0;
        let successes = 0;
        let hintsUsed = 0;
        let totalActionTime = 0;
        let actionCount = 0;
        let frustrationSignals = 0;
        for (const obs of sorted) {
            obs.processed = true;
            obs.processedAt = Date.now();
            switch (obs.type) {
                case ObservationType.PUZZLE_START:
                    attempts++;
                    break;
                case ObservationType.PUZZLE_COMPLETE:
                    successes++;
                    break;
                case ObservationType.PUZZLE_FAIL:
                    frustrationSignals++;
                    break;
                case ObservationType.PUZZLE_HINT_USED:
                    hintsUsed++;
                    break;
                case ObservationType.PUZZLE_ACTION:
                    actionCount++;
                    if (obs.details.duration) {
                        totalActionTime += obs.details.duration;
                    }
                    break;
                case ObservationType.PAUSE:
                case ObservationType.QUIT:
                    frustrationSignals += 2;
                    break;
            }
        }
        const totalAttempts = attempts || 1;
        const successRate = successes / totalAttempts;
        const avgTime = actionCount > 0 ? totalActionTime / actionCount : 0;
        const hintRate = hintsUsed / totalAttempts;
        let mood = 'neutral';
        let difficultyDelta = 0;
        let shouldHint = false;
        let dialoguePrompt = '';
        if (frustrationSignals >= 3 || hintRate > 0.5) {
            mood = 'concerned';
            difficultyDelta = -0.1;
            shouldHint = true;
            dialoguePrompt = 'Player seems frustrated. Offer encouragement and a subtle hint.';
        }
        else if (successRate > 0.8 && avgTime < 5000) {
            mood = 'stubborn';
            difficultyDelta = 0.15;
            shouldHint = false;
            dialoguePrompt = 'Player is performing excellently. Increase challenge and be cheeky.';
        }
        else if (hintRate === 0 && attempts > 5) {
            shouldHint = true;
            dialoguePrompt = 'Player has been attempting for a while without hints. Offer help subtly.';
        }
        return {
            playerId,
            startTime,
            endTime,
            observations: sorted,
            metrics: {
                totalAttempts,
                successRate,
                avgTimePerAction: avgTime,
                hintUsageRate: hintRate,
                frustrationIndicators: frustrationSignals
            },
            recommendedAction: {
                mood,
                difficultyDelta,
                shouldProvideHint: shouldHint,
                dialoguePrompt
            }
        };
    }
    static calculateUrgency(type, _details) {
        switch (type) {
            case ObservationType.PUZZLE_FAIL:
                return 0.7;
            case ObservationType.QUIT:
                return 1.0;
            case ObservationType.PAUSE:
                return 0.5;
            case ObservationType.PUZZLE_HINT_USED:
                return 0.4;
            case ObservationType.ERROR:
                return 0.9;
            case ObservationType.PUZZLE_COMPLETE:
                return 0.3;
            default:
                return 0.1;
        }
    }
    static serialize(obs) {
        return JSON.stringify(obs);
    }
    static deserialize(data) {
        return JSON.parse(data);
    }
}
//# sourceMappingURL=observation.js.map