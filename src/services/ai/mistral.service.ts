import { Mistral } from '@mistralai/mistralai';
import config from '../../config';
import { log } from '../../utils/logger';

/**
 * Mistral AI Service
 * Backup AI provider when Gemini fails or hits rate limits
 * Uses mistral-small-latest model (free tier friendly)
 */
export class MistralService {
    private client: Mistral;
    private lastCallTime: number = 0;
    private readonly MIN_CALL_INTERVAL = 3000; // 3 seconds between calls

    constructor() {
        this.client = new Mistral({ apiKey: config.ai.mistralApiKey });
    }

    /**
     * Wait for rate limit before making a call
     */
    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;

        if (timeSinceLastCall < this.MIN_CALL_INTERVAL) {
            const waitTime = this.MIN_CALL_INTERVAL - timeSinceLastCall;
            log.debug(`⏳ Mistral rate limiting: waiting ${(waitTime / 1000).toFixed(1)}s`);
            await this.delay(waitTime);
        }

        this.lastCallTime = Date.now();
    }

    /**
     * Helper delay function
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate a response from Mistral
     */
    async generate(prompt: string, maxRetries: number = 3): Promise<string> {
        await this.waitForRateLimit();

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                log.debug('Mistral request', { attempt, promptLength: prompt.length });

                const response = await this.client.chat.complete({
                    model: 'mistral-small-latest',
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                });

                const text = response.choices?.[0]?.message?.content || '';

                log.debug('Mistral response', { responseLength: text.length });

                return text as string;
            } catch (error: any) {
                lastError = error;

                if (error.message?.includes('429') || error.message?.includes('rate')) {
                    const waitTime = Math.pow(2, attempt) * 2000;
                    log.warn(`Mistral rate limited, waiting ${waitTime / 1000}s`);
                    await this.delay(waitTime);
                    continue;
                }

                log.error('Mistral generation failed', { error: error.message, attempt });
                break;
            }
        }

        throw lastError || new Error('Mistral generation failed');
    }

    /**
     * Summarize news articles
     */
    async summarizeNews(articles: { title: string; description: string; source: string }[]): Promise<string> {
        const articlesText = articles
            .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   ${a.description}`)
            .join('\n\n');

        const prompt = `You are a professional news summarizer for Twitter.

Create a ONE-LINE summary (max 100 characters) of these news:

${articlesText}

Rules:
- Be concise and engaging
- Focus on the MOST important news
- NO hashtags
- NO source names
- Make it attention-grabbing

ONE-LINE SUMMARY (max 100 chars):`;

        return this.generate(prompt);
    }
}

export default MistralService;
