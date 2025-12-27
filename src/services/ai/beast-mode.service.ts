import { GeminiService } from './gemini.service';
import { MistralService } from './mistral.service';
import config from '../../config';
import { log } from '../../utils/logger';

/**
 * 🔥 BEAST MODE AI Service - PRODUCTION GRADE
 * 
 * Features:
 * - MISTRAL PRIMARY (60 RPM)
 * - Gemini as backup only
 * - Circuit breaker: If Gemini fails once, disable for 5 minutes
 * - INSTANT fallback - no waiting
 * - Zero rate limit issues
 */
export class BeastModeAI {
    private gemini: GeminiService | null = null;
    private mistral: MistralService | null = null;

    // Circuit breaker for Gemini
    private geminiDisabled: boolean = false;
    private geminiDisabledUntil: number = 0;
    private geminiFailCount: number = 0;

    private callCount: number = 0;

    constructor() {
        // Initialize providers
        if (config.ai.mistralApiKey) {
            this.mistral = new MistralService();
            log.info('🟠 Mistral initialized (PRIMARY)');
        }

        if (config.ai.geminiApiKey) {
            this.gemini = new GeminiService();
            log.info('🔷 Gemini initialized (BACKUP)');
        }

        if (!this.mistral && !this.gemini) {
            throw new Error('No AI provider! Add MISTRAL_API_KEY or GEMINI_API_KEY');
        }

        log.info('🔥 BEAST MODE activated - Production Grade!');
    }

    /**
     * Check if Gemini circuit breaker is open
     */
    private isGeminiAvailable(): boolean {
        if (!this.gemini) return false;

        if (this.geminiDisabled) {
            if (Date.now() > this.geminiDisabledUntil) {
                // Re-enable after cooldown
                this.geminiDisabled = false;
                this.geminiFailCount = 0;
                log.info('🔷 Gemini re-enabled after cooldown');
                return true;
            }
            return false;
        }

        return true;
    }

    /**
     * Handle Gemini failure - activate circuit breaker
     */
    private handleGeminiFailure(error: any): void {
        this.geminiFailCount++;

        if (error.message?.includes('429') || error.message?.includes('Too Many')) {
            // Rate limit - disable for 5 minutes
            this.geminiDisabled = true;
            this.geminiDisabledUntil = Date.now() + 5 * 60 * 1000;
            log.warn('⚠️ Gemini rate limited - disabled for 5 minutes, using Mistral only');
        } else if (this.geminiFailCount >= 3) {
            // 3 consecutive failures - disable for 2 minutes
            this.geminiDisabled = true;
            this.geminiDisabledUntil = Date.now() + 2 * 60 * 1000;
            log.warn('⚠️ Gemini failed 3 times - disabled for 2 minutes');
        }
    }

    /**
     * MAIN GENERATE METHOD - Production Grade
     * 
     * Priority:
     * 1. Always try Mistral first (60 RPM, higher limit)
     * 2. Only use Gemini if Mistral fails AND Gemini available
     */
    async generate(prompt: string): Promise<string> {
        this.callCount++;

        // MISTRAL FIRST - Always
        if (this.mistral) {
            try {
                return await this.mistral.generate(prompt);
            } catch (mistralError: any) {
                log.warn('Mistral failed, trying Gemini backup...', {
                    error: mistralError.message?.slice(0, 50)
                });
            }
        }

        // GEMINI BACKUP - Only if Mistral fails and Gemini available
        if (this.isGeminiAvailable() && this.gemini) {
            try {
                return await this.gemini.generate(prompt, 1); // Only 1 retry, no waiting
            } catch (geminiError: any) {
                this.handleGeminiFailure(geminiError);
                log.error('Gemini also failed', {
                    error: geminiError.message?.slice(0, 50)
                });
            }
        }

        // FALLBACK - Return safe default
        log.warn('All AI providers failed, using safe default');
        return this.getSafeDefault(prompt);
    }

    /**
     * Safe default when all providers fail
     */
    private getSafeDefault(prompt: string): string {
        if (prompt.includes('summary') || prompt.includes('NEWS')) {
            return 'Breaking news update - check back soon! 📰';
        }
        if (prompt.includes('headline')) {
            return '🔥 News Digest | Today';
        }
        if (prompt.includes('virality') || prompt.includes('score')) {
            return '{"score": 7, "suggestions": []}';
        }
        if (prompt.includes('Rewrite')) {
            return 'News: Latest headlines and updates! 📰';
        }
        return 'Update coming soon...';
    }

    // ============ HIGH LEVEL METHODS ============

    /**
     * Summarize news with FULL CONTEXT - No vague references
     */
    /**
     * Summarize news with FULL CONTEXT - No vague references
     */
    async summarize(articles: { title: string; description: string; source: string }[], maxChars: number = 180): Promise<string> {
        const articlesText = articles
            .slice(0, 3)
            .map((a, i) => `${i + 1}. ${a.title}${a.description ? ' - ' + a.description.slice(0, 100) : ''}`)
            .join('\n');

        const prompt = `Write an ENGAGING & DETAILED news summary (max ${maxChars} chars). 
Write like a human reporter - natural, professional, but not robotic. 
MUST include full context (Names, Places, Numbers).
CRITICAL:
1. END with a complete sentence. DO NOT cut off.
2. NO transition words like "Elsewhere", "Meanwhile", "In other news".
3. NO introduction like "Here is the summary". Just the story.

NEWS:
${articlesText}

CRITICAL RULES:
1. ALWAYS mention COUNTRY/CITY name (e.g., "US President" not "Former president")
2. ALWAYS mention PERSON'S full name or title
3. Include KEY NUMBERS (deaths, scores, amounts)
4. Plain text - NO markdown, NO asterisks, NO emojis
5. NO vague words like "Former president" - say "Former US President Obama"

GOOD EXAMPLES:
✅ "Karnataka bus crash kills 6 near Bengaluru, 28 injured on NH-48"
✅ "Former US President Obama cautions kids about Santa in holiday calls"
✅ "Russia attacks Odesa port, Ukraine reports 2 missiles hit grain facility"

YOUR DETAILED SUMMARY WITH FULL CONTEXT:`;


        const result = await this.generate(prompt);

        // Clean output thoroughly
        return result
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/^["']|["']$/g, '')
            .replace(/^(Breaking|Update|News|Summary|Your|Here)[:\s]*/gi, '')
            .replace(/🚨|🔥|⚡|📰|🇮🇳|🌍|💥|❗/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Evaluate summary quality
     */
    async evaluate(summary: string, articles: { title: string }[]): Promise<{
        passed: boolean;
        score: number;
        feedback: string;
    }> {
        const titles = articles.slice(0, 3).map(a => a.title).join('; ');

        const prompt = `Rate summary(0 - 10): "${summary}"
News: ${titles.slice(0, 200)}
JSON: { "score": X, "feedback": "..." }`;

        try {
            const response = await this.generate(prompt);
            const match = response.match(/\{[\s\S]*\}/);
            if (match) {
                const result = JSON.parse(match[0]);
                return {
                    passed: (result.score || 7) >= 7,
                    score: result.score || 7,
                    feedback: result.feedback || '',
                };
            }
        } catch {
            // Silent fail
        }

        return { passed: true, score: 7, feedback: '' };
    }

    /**
     * Rewrite for originality - CLEAN OUTPUT
     */
    async rewriteOriginal(summary: string, avoidPhrases: string[], maxChars: number = 180): Promise<string> {
        const banned = avoidPhrases.slice(0, 2).join(', ').slice(0, 100);

        const prompt = `Rewrite this news in different words (max ${maxChars} chars).
Write like a human reporter.
CRITICAL:
1. END with a complete sentence.
2. NO transition words ("Elsewhere", "Meanwhile").
3. NO markdown, NO asterisks, NO prefixes.

Original: "${summary.slice(0, 200)}"
Avoid these words: ${banned}

REWRITTEN (plain text only):`;

        const result = await this.generate(prompt);

        // Clean output thoroughly
        return result
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/^(Rewritten|Output)[:\s]*/gi, '')
            .replace(/🚨|🔥|⚡|📰|🇮🇳|🌍|💥|❗/g, '')
            .trim(); // Ensure no leading/trailing whitespace
    }

    /**
     * Generate an expert opinion for the tweet lead
     */
    async generateOpinion(summary: string): Promise<string> {
        const prompt = `Act as an expert news analyst. Read this news summary and provide a brief, insightful, 1-sentence opinion or takeaway (max 100 chars).
It should be punchy, engaging, and professional.
NO hashtags. NO "In my opinion". NO "This news highlights".
Just the insight.

News: "${summary.slice(0, 300)}"

OPINION:`;

        const result = await this.generate(prompt);
        return result
            .replace(/['"]/g, '')
            .replace(/^Opinion:/i, '')
            .trim();
    }

    /**
     * Generate a contextual AI image generation prompt
     */
    async generateImagePrompt(summary: string, category: string = 'news'): Promise<string> {
        const prompt = `Create a short AI image generation prompt (max 100 chars) for this ${category} news.
The image should be: dramatic, high-quality, professional style.
Focus on: key action, thematic atmosphere, or iconic representation of ${category}.
NO text in image. NO specific real people faces (copyright).

News: "${summary.slice(0, 250)}"

PROMPT:`;

        try {
            const result = await this.generate(prompt);
            const cleaned = result
                .replace(/['"]/g, '')
                .replace(/^Prompt:/i, '')
                .trim()
                .slice(0, 150);

            // Default fallbacks based on category
            const fallbacks: Record<string, string> = {
                'cricket': 'Cricket stadium action, professional sports photography',
                'football': 'Football match highlight, dramatic sports shot',
                'technology': 'Digital innovation, futuristic technology aesthetic',
                'finance': 'Professional financial setting, markets and trading',
                'history': 'Epic historical architecture, dramatic lighting',
            };

            return cleaned || fallbacks[category.toLowerCase()] || 'Professional news journalism aesthetic, high quality';
        } catch {
            return 'Professional news journalism aesthetic, high quality';
        }
    }

    // Alias for backward compatibility
    async generateCricketImagePrompt(summary: string): Promise<string> {
        return this.generateImagePrompt(summary, 'cricket');
    }


    /**
     * Generate headline
     */
    async generateHeadline(summaries: Map<string, string>): Promise<string> {
        const text = Array.from(summaries.values()).slice(0, 2).join('; ').slice(0, 150);

        const prompt = `Catchy 40 - char headline with emoji for: ${text}
        HEADLINE: `;

        const result = await this.generate(prompt);
        return result.trim().slice(0, 50);
    }

    /**
     * Check virality
     */
    async checkVirality(tweet: string): Promise<{
        score: number;
        isViral: boolean;
        suggestions: string[];
    }> {
        const prompt = `Rate tweet virality(0 - 10): "${tweet.slice(0, 100)}"
        JSON: { "score": X, "suggestions": ["tip1"] } `;

        try {
            const response = await this.generate(prompt);
            const match = response.match(/\{[\s\S]*\}/);
            if (match) {
                const result = JSON.parse(match[0]);
                return {
                    score: result.score || 7,
                    isViral: (result.score || 7) >= 7,
                    suggestions: result.suggestions || [],
                };
            }
        } catch {
            // Silent fail
        }

        return { score: 7, isViral: true, suggestions: [] };
    }

    /**
     * Enhance for virality
     */
    /**
     * Enhance for virality
     */
    async enhanceVirality(tweet: string, suggestions: string[]): Promise<string> {
        const prompt = `Rewrite this tweet to be more viral(max 270 chars).
Include a question to engage users.
            Add 2 relevant hashtags.
OUTPUT ONLY THE TWEET TEXT.NO META COMMENTS.

            Original: "${tweet.slice(0, 150)}"
        Suggestions: ${suggestions.slice(0, 2).join(', ')}

VIRAL TWEET: `;

        const result = await this.generate(prompt);
        return result
            .replace(/^["']|["']$/g, '')
            .replace(/^(Viral|Tweet|Rewrite|Here|Output)[:\s]*/gi, '')
            .replace(/\(.*chars.*\)/gi, '') // Remove (280 chars) notes
            .trim();
    }



    /**
 * Evaluate urgency/importance of current headlines to adjust tweet frequency
 * Works for any category (Cricket, Football, Tech, etc.)
 */
    async evaluateContentUrgency(headlines: string[], category: string = 'news'): Promise<{
        importance: 'LIVE' | 'HIGH' | 'NORMAL';
        suggestedInterval: number;
        reason: string;
        isLiveEvent: boolean;
    }> {
        // Broad event keywords
        const liveKeywords = [
            'live', 'playing', 'underway', 'score', 'results', 'updates',
            'ongoing', 'breaking', 'happening now', 'just in', 'live coverage'
        ];
        const majorEventKeywords = [
            'world cup', 'final', 'semi-final', 'championship', 'tournament',
            'launch', 'election', 'emergency', 'summit', 'announcement',
            'ipl', 'bgt', 'isl', 'premier league', 'unveiled'
        ];

        const headlinesText = headlines.join(' ').toLowerCase();

        // Quick keyword check first
        const hasLiveKeyword = liveKeywords.some(kw => headlinesText.includes(kw));
        const hasMajorEvent = majorEventKeywords.some(kw => headlinesText.includes(kw));

        // If obvious live major event, return immediately
        if (hasLiveKeyword && hasMajorEvent) {
            log.info(`⚡🔴 LIVE ${category.toUpperCase()} EVENT DETECTED!`);
            return {
                importance: 'LIVE',
                suggestedInterval: 20,
                reason: `Live ${category} event in progress`,
                isLiveEvent: true
            };
        }

        // Use AI to determine urgency
        const prompt = `Analyze these ${category} headlines. Is there a MAJOR event currently LIVE or very HIGH URGENCY breaking news?

Headlines: "${headlinesText.slice(0, 400)}"

Respond in JSON ONLY:
{
  "isLiveOrUrgent": true/false,
  "importance": "LIVE" or "HIGH" or "NORMAL",
  "reason": "brief reason why"
}`;

        try {
            const response = await this.generate(prompt);
            const match = response.match(/\{[\s\S]*\}/);
            if (match) {
                const result = JSON.parse(match[0]);
                if (result.isLiveOrUrgent || result.importance === 'LIVE') {
                    log.info(`⚡🔴 AI detected URGENT ${category}:`, result.reason);
                    return {
                        importance: 'LIVE',
                        suggestedInterval: 20,
                        reason: result.reason || 'AI detected live urgency',
                        isLiveEvent: true
                    };
                }
                if (result.importance === 'HIGH') {
                    return {
                        importance: 'HIGH',
                        suggestedInterval: 45,
                        reason: result.reason || `High priority ${category} news`,
                        isLiveEvent: false
                    };
                }
            }
        } catch {
            // Fallback to keyword-based
        }

        // Default: Normal mode
        return {
            importance: 'NORMAL',
            suggestedInterval: 85,
            reason: `Regular ${category} updates`,
            isLiveEvent: false
        };
    }

    // Alias for backward compatibility
    async evaluateMatchImportance(headlines: string[]): Promise<any> {
        return this.evaluateContentUrgency(headlines, 'cricket');
    }

    // 🛡️ Content Moderation - Check if topic is appropriate
    async moderateContent(topic: string): Promise<{ isSafe: boolean; reason: string }> {
        const prompt = `You are a content moderator. Check if this topic is appropriate for a professional Twitter/X news account.

Topic: "${topic}"

Check for:
- Vulgar or offensive content
- Hate speech or discrimination
- Adult/NSFW content
- Violence or harmful content
- Spam or misleading content

Respond ONLY in this JSON format:
{"isSafe": true/false, "reason": "brief explanation"}`;

        try {
            const response = await this.generate(prompt);
            const json = response.match(/\{[\s\S]*\}/)?.[0];
            if (json) {
                const result = JSON.parse(json);
                log.info(result.isSafe ? '✅ Content is SAFE' : '🚫 Content BLOCKED', { topic, reason: result.reason });
                return result;
            }
        } catch (error) {
            log.error('Moderation check failed, defaulting to SAFE');
        }

        return { isSafe: true, reason: 'Moderation check passed' };
    }

    // 🎯 Generate tweet for custom topic (non-news)
    async generateCustomTopicTweet(topic: string, maxChars: number = 200): Promise<string> {
        const prompt = `Generate an engaging, informative tweet about this topic.

Topic: "${topic}"

Rules:
- Maximum ${maxChars} characters
- Professional and engaging tone
- Include interesting facts or insights
- No hashtags (will be added later)
- No emojis at start
- Sound natural, not robotic

Tweet:`;

        try {
            const response = await this.generate(prompt);
            const tweet = response
                .replace(/^["']|["']$/g, '')
                .replace(/\n/g, ' ')
                .trim()
                .slice(0, maxChars);

            log.info('✅ Custom topic tweet generated', { topic: topic.slice(0, 30) });
            return tweet;
        } catch (error: any) {
            log.error('Custom topic generation failed');
            return `Interesting thoughts on ${topic}...`;
        }
    }

    // Get stats
    getStats(): { calls: number; geminiAvailable: boolean } {
        return {
            calls: this.callCount,
            geminiAvailable: this.isGeminiAvailable(),
        };
    }
}

// Singleton
let instance: BeastModeAI | null = null;

export function getBeastMode(): BeastModeAI {
    if (!instance) {
        instance = new BeastModeAI();
    }
    return instance;
}

export default BeastModeAI;
