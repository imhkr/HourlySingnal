import { getBeastMode, BeastModeAI } from '../services/ai/beast-mode.service';
import { log } from '../utils/logger';

/**
 * Virality Agent - Uses Beast Mode AI
 */
export class ViralityAgent {
    private ai: BeastModeAI;

    constructor() {
        this.ai = getBeastMode();
    }

    async checkVirality(tweetContent: string): Promise<{
        score: number;
        isViral: boolean;
        feedback: string;
        suggestions: string[];
    }> {
        log.info('🔥 Checking virality...');

        const result = await this.ai.checkVirality(tweetContent);

        log.info(`Virality: ${result.score.toFixed(1)}/10 ${result.isViral ? '✅' : '❌'}`);

        return {
            score: result.score,
            isViral: result.isViral,
            feedback: result.suggestions.join('; '),
            suggestions: result.suggestions,
        };
    }

    async enhance(
        tweetContent: string,
        feedback: string,
        suggestions: string[]
    ): Promise<{
        enhancedTweet: string;
        addedHashtags: string[];
        engagementHook: string;
    }> {
        log.info('⚡ Enhancing for virality...');

        const enhanced = await this.ai.enhanceVirality(tweetContent, suggestions);

        // Extract hashtags from enhanced text
        const hashtags = enhanced.match(/#\w+/g) || [];

        return {
            enhancedTweet: enhanced.slice(0, 280),
            addedHashtags: hashtags,
            engagementHook: suggestions[0] || '',
        };
    }

    async ensureViral(tweetContent: string, maxIterations: number = 2): Promise<{
        finalTweet: string;
        viralityScore: number;
        wasEnhanced: boolean;
        hashtags: string[];
        engagementHook: string;
    }> {
        let currentTweet = tweetContent;
        let wasEnhanced = false;
        let finalHashtags: string[] = [];
        let finalHook = '';

        for (let i = 0; i < maxIterations; i++) {
            log.info(`Virality check ${i + 1}/${maxIterations}`);

            const check = await this.checkVirality(currentTweet);

            if (check.isViral) {
                return {
                    finalTweet: currentTweet,
                    viralityScore: check.score,
                    wasEnhanced,
                    hashtags: finalHashtags,
                    engagementHook: finalHook,
                };
            }

            const enhanced = await this.enhance(currentTweet, check.feedback, check.suggestions);
            currentTweet = enhanced.enhancedTweet;
            finalHashtags = enhanced.addedHashtags;
            finalHook = enhanced.engagementHook;
            wasEnhanced = true;
        }

        const finalCheck = await this.checkVirality(currentTweet);

        return {
            finalTweet: currentTweet,
            viralityScore: finalCheck.score,
            wasEnhanced,
            hashtags: finalHashtags,
            engagementHook: finalHook,
        };
    }
}

export default ViralityAgent;
