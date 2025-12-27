import { getBeastMode, BeastModeAI } from '../services/ai/beast-mode.service';
import { log } from '../utils/logger';

/**
 * Originality Agent - Uses Beast Mode AI
 * ALWAYS rewrites to avoid plagiarism
 */
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

                // Clean the result
                const cleaned = rewritten
                    .replace(/^["']|["']$/g, '')
                    .replace(/^(Your|Rewrite|Original)[^:]*:/i, '')
                    .trim();

                // Check if it's different enough
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

        // Fallback - generate safe generic text
        const fallback = this.generateSafeFallback(originalTitles);
        return {
            finalSummary: fallback,
            isOriginal: true,
            attempts: maxAttempts,
        };
    }

    private isTooSimilar(text: string, originals: string[]): boolean {
        const textLower = text.toLowerCase();

        // Ignore common proper nouns, names, places that will naturally match
        const ignoreTerms = [
            'ballon', "d'or", 'india', 'world', 'cup', 'premier', 'league',
            'cricket', 'football', 'award', 'bravery', 'olympics', 'test',
            'match', 'final', 'champions', 'trophy', 'medal'
        ];

        for (const original of originals) {
            const originalLower = original.toLowerCase();

            // Only check for LONG phrase matches (5+ words)
            // This prevents flagging on common 2-word terms
            const originalWords = originalLower.split(/\s+/).filter(w => w.length > 2);

            // Check 5-word phrase matches (was 2 words - too strict)
            for (let i = 0; i < originalWords.length - 4; i++) {
                const phrase = originalWords.slice(i, i + 5).join(' ');
                if (textLower.includes(phrase)) {
                    log.warn(`Full phrase match: "${phrase}"`);
                    return true;
                }
            }

            // Check if 50%+ of sentence is identical (was 30% - too strict)
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

            // Only flag if 50%+ words match (excluding common terms)
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
