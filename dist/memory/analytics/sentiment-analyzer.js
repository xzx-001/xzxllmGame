const SENTIMENT_LEXICON = {
    'stuck': { polarity: -0.6, intensity: 0.5, emotion: 'frustration', urgency: 0.6 },
    'impossible': { polarity: -0.8, intensity: 0.7, emotion: 'frustration', urgency: 0.8 },
    'hate': { polarity: -0.9, intensity: 0.8, emotion: 'anger', urgency: 0.7 },
    'stupid': { polarity: -0.7, intensity: 0.6, emotion: 'anger', urgency: 0.5 },
    'help': { polarity: -0.3, intensity: 0.4, emotion: 'confusion', urgency: 0.7 },
    'confused': { polarity: -0.4, intensity: 0.4, emotion: 'confusion', urgency: 0.6 },
    'dont understand': { polarity: -0.5, intensity: 0.4, emotion: 'confusion', urgency: 0.6 },
    'too hard': { polarity: -0.6, intensity: 0.5, emotion: 'frustration', urgency: 0.7 },
    'unfair': { polarity: -0.7, intensity: 0.6, emotion: 'anger', urgency: 0.6 },
    'quit': { polarity: -0.8, intensity: 0.9, emotion: 'frustration', urgency: 1.0 },
    'boring': { polarity: -0.5, intensity: 0.3, emotion: 'frustration', urgency: 0.4 },
    'love': { polarity: 0.9, intensity: 0.8, emotion: 'excitement', urgency: 0.2 },
    'awesome': { polarity: 0.8, intensity: 0.7, emotion: 'excitement', urgency: 0.2 },
    'easy': { polarity: 0.5, intensity: 0.4, emotion: 'satisfaction', urgency: 0.3 },
    'got it': { polarity: 0.6, intensity: 0.5, emotion: 'satisfaction', urgency: 0.2 },
    'finally': { polarity: 0.4, intensity: 0.6, emotion: 'satisfaction', urgency: 0.3 },
    'fun': { polarity: 0.8, intensity: 0.6, emotion: 'excitement', urgency: 0.2 },
    'interesting': { polarity: 0.6, intensity: 0.4, emotion: 'curiosity', urgency: 0.3 },
    'more': { polarity: 0.5, intensity: 0.5, emotion: 'curiosity', urgency: 0.4 },
    'why': { polarity: 0, intensity: 0.3, emotion: 'curiosity', urgency: 0.4 },
    'how': { polarity: 0, intensity: 0.3, emotion: 'curiosity', urgency: 0.5 },
    'what': { polarity: 0, intensity: 0.3, emotion: 'confusion', urgency: 0.4 },
    'maybe': { polarity: 0, intensity: 0.2, emotion: 'neutral', urgency: 0.2 }
};
export class SentimentAnalyzer {
    useExternalAPI;
    externalAPIEndpoint;
    constructor(useExternalAPI = false, externalEndpoint) {
        this.useExternalAPI = useExternalAPI;
        this.externalAPIEndpoint = externalEndpoint;
    }
    async analyze(text, context) {
        if (this.useExternalAPI && this.externalAPIEndpoint) {
            return this.analyzeWithAPI(text);
        }
        return this.analyzeWithRules(text, context);
    }
    analyzeWithRules(text, context) {
        const lowerText = text.toLowerCase();
        let totalPolarity = 0;
        let maxIntensity = 0;
        let detectedEmotion = 'neutral';
        let totalUrgency = 0;
        const matchedKeywords = [];
        for (const [keyword, data] of Object.entries(SENTIMENT_LEXICON)) {
            if (lowerText.includes(keyword)) {
                matchedKeywords.push(keyword);
                totalPolarity += data.polarity;
                if (data.intensity > maxIntensity) {
                    maxIntensity = data.intensity;
                    detectedEmotion = data.emotion;
                }
                totalUrgency += data.urgency;
            }
        }
        const count = matchedKeywords.length || 1;
        const avgPolarity = totalPolarity / count;
        const avgUrgency = Math.min(1, totalUrgency / count);
        let adjustedUrgency = avgUrgency;
        let finalEmotion = detectedEmotion;
        if (context) {
            if (context.emotion.frustrationLevel > 0.6) {
                adjustedUrgency = Math.min(1, avgUrgency * 1.3);
            }
            if (context.emotion.engagementLevel > 0.7 && avgPolarity < 0) {
                adjustedUrgency *= 0.7;
            }
        }
        const { strategy, tone } = this.determineStrategy(avgPolarity, maxIntensity, finalEmotion, adjustedUrgency);
        return {
            polarity: avgPolarity,
            intensity: maxIntensity,
            dominantEmotion: finalEmotion,
            urgency: adjustedUrgency,
            keywords: matchedKeywords,
            recommendedTone: tone,
            strategy
        };
    }
    async analyzeWithAPI(text) {
        console.warn('[SentimentAnalyzer] External API not implemented, falling back to rules');
        return this.analyzeWithRules(text);
    }
    determineStrategy(polarity, intensity, emotion, urgency) {
        if (urgency > 0.7 && polarity < -0.3) {
            return {
                strategy: 'provide_hint',
                tone: 'empathetic'
            };
        }
        if (emotion === 'frustration' && intensity > 0.6) {
            return {
                strategy: 'back_off',
                tone: 'empathetic'
            };
        }
        if (emotion === 'anger') {
            return {
                strategy: 'escalate_help',
                tone: 'serious'
            };
        }
        if (emotion === 'confusion' && polarity > -0.5) {
            return {
                strategy: 'offer_encouragement',
                tone: 'playful'
            };
        }
        if (emotion === 'excitement' || emotion === 'satisfaction') {
            return {
                strategy: 'maintain_challenge',
                tone: emotion === 'excitement' ? 'cheerful' : 'mysterious'
            };
        }
        return {
            strategy: 'maintain_challenge',
            tone: 'mysterious'
        };
    }
    async analyzeBatch(texts) {
        return Promise.all(texts.map(t => this.analyze(t)));
    }
    needsImmediateAttention(text) {
        const urgentKeywords = ['quit', 'impossible', 'hate', 'unfair', 'bug', 'broken'];
        const lowerText = text.toLowerCase();
        return urgentKeywords.some(kw => lowerText.includes(kw));
    }
}
//# sourceMappingURL=sentiment-analyzer.js.map