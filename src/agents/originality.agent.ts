import { getBeastMode, BeastModeAI } from '../services/ai/beast-mode.service';
import { log } from '../utils/logger';

export class OriginalityAgent {
    private ai: BeastModeAI;

    constructor() {
        this.ai = getBeastMode();
    }

    async ensureOriginal(
        summary: string,
        originalTitles: string[],
        maxAttempts: number = 2,
        maxChars: number = 180
    ): Promise<{
        finalSummary: string;
        isOriginal: boolean;
        attempts: number;
    }> {
        log.info('✍️ Ensuring originality...');

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            log.info(`Originality attempt ${attempt}/${maxAttempts}`);

            try {
                const rewritten = await this.ai.rewriteOriginal(summary, originalTitles, maxChars);

                const cleaned = rewritten
                    .replace(/^["']|["']$/g, '')
                    .replace(/^(Your|Rewrite|Original)[^:]*:/i, '')
                    .trim();

                if (!this.isTooSimilar(cleaned, originalTitles)) {
                    log.info(`✅ Original: "${cleaned}"`);
                    return {
                        finalSummary: cleaned,
                        isOriginal: true,
                        attempts: attempt,
                    };
                }

                summary = cleaned; // Use for next attempt
            } catch (error: any) {
                log.warn('Rewrite attempt failed', { error: error.message });
            }
        }

        const fallback = this.generateSafeFallback(originalTitles);
        return {
            finalSummary: fallback,
            isOriginal: true,
            attempts: maxAttempts,
        };
    }

    private isTooSimilar(text: string, originals: string[]): boolean {
        const textLower = text.toLowerCase();

        const ignoreTerms = [
            'ballon', "d'or", 'india', 'world', 'cup', 'premier', 'league',
            'cricket', 'football', 'award', 'bravery', 'olympics', 'test',
            'match', 'final', 'champions', 'trophy', 'medal'
        ];

        for (const original of originals) {
            const originalLower = original.toLowerCase();

            const originalWords = originalLower.split(/\s+/).filter(w => w.length > 2);

            for (let i = 0; i < originalWords.length - 4; i++) {
                const phrase = originalWords.slice(i, i + 5).join(' ');
                if (textLower.includes(phrase)) {
                    log.warn(`Full phrase match: "${phrase}"`);
                    return true;
                }
            }

            const textWords = textLower.split(/\s+/).filter(w =>
                w.length > 3 && !ignoreTerms.includes(w)
            );
            const origFiltered = originalWords.filter(w =>
                w.length > 3 && !ignoreTerms.includes(w)
            );

            let matchCount = 0;
            for (const word of origFiltered) {
                if (textWords.some(tw => tw === word)) matchCount++;
            }

            if (origFiltered.length > 5 && matchCount / origFiltered.length > 0.5) {
                log.warn(`High word overlap: ${matchCount}/${origFiltered.length}`);
                return true;
            }
        }

        return false;
    }

    private generateSafeFallback(titles: string[]): string {
        const keywords = titles[0]?.match(/\b[A-Z][a-z]+\b|\d+/g) || [];
        const mainWord = keywords[0] || 'Update';

        const templates = [
            `📰 Breaking: ${mainWord} making headlines today!`,
            `⚡ News Update: Big ${mainWord} developments`,
            `🔥 Just in: ${mainWord} story trending now`,
        ];

        return templates[Math.floor(Math.random() * templates.length)].slice(0, 80);
    }
}

export default OriginalityAgent;
