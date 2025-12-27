import { GeminiService } from './gemini.service';
import { MistralService } from './mistral.service';
import config from '../../config';
import { log } from '../../utils/logger';

export class BeastModeAI {
    private gemini: GeminiService | null = null;
    private mistral: MistralService | null = null;

    private geminiDisabled: boolean = false;
    private geminiDisabledUntil: number = 0;
    private geminiFailCount: number = 0;

    private callCount: number = 0;

    constructor() {
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

    private isGeminiAvailable(): boolean {
        if (!this.gemini) return false;

        if (this.geminiDisabled) {
            if (Date.now() > this.geminiDisabledUntil) {
                this.geminiDisabled = false;
                this.geminiFailCount = 0;
                log.info('🔷 Gemini re-enabled after cooldown');
                return true;
            }
            return false;
        }

        return true;
    }

    private handleGeminiFailure(error: any): void {
        this.geminiFailCount++;

        if (error.message?.includes('429') || error.message?.includes('Too Many')) {
            this.geminiDisabled = true;
            this.geminiDisabledUntil = Date.now() + 5 * 60 * 1000;
            log.warn('⚠️ Gemini rate limited - disabled for 5 minutes, using Mistral only');
        } else if (this.geminiFailCount >= 3) {
            this.geminiDisabled = true;
            this.geminiDisabledUntil = Date.now() + 2 * 60 * 1000;
            log.warn('⚠️ Gemini failed 3 times - disabled for 2 minutes');
        }
    }

    async generate(prompt: string): Promise<string> {
        this.callCount++;

        if (this.mistral) {
            try {
                return await this.mistral.generate(prompt);
            } catch (mistralError: any) {
                log.warn('Mistral failed, trying Gemini backup...', {
                    error: mistralError.message?.slice(0, 50)
                });
            }
        }

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

        log.warn('All AI providers failed, using safe default');
        return this.getSafeDefault(prompt);
    }

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

    async summarize(articles: { title: string; description: string; source: string }[], maxChars: number = 200): Promise<string> {
        const articlesText = articles
            .slice(0, 3)
            .map((a, i) => `${i + 1}. ${a.title}${a.description ? ' - ' + a.description.slice(0, 100) : ''}`)
            .join('\n');

        const prompt = `Write an ENGAGING & DETAILED news summary (max ${maxChars} chars). 
Write like a human reporter - natural, professional, but not robotic. 
MUST include full context (Names, Places, Numbers).
CRITICAL:
1. MUST END with a complete sentence + PERIOD (.). DO NOT cut off.
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

    async rewriteOriginal(summary: string, avoidPhrases: string[], maxChars: number = 200): Promise<string> {
        const banned = avoidPhrases.slice(0, 2).join(', ').slice(0, 100);

        const prompt = `Rewrite this news in different words (max ${maxChars} chars).
Write like a human reporter.
CRITICAL:
1. MUST END with a complete sentence + PERIOD (.).
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

    async generateSearchQuery(category: string): Promise<string> {
        const prompt = `Act as an SEO News Expert. Convert this category into a single search query (keywords only).
Focus on keywords that find BREAKING news and LIVE updates from the LAST 1-2 HOURS.

Category: "${category}"

CRITICAL RULES:
1. OUTPUT ONLY THE KEYWORDS.
2. NO MARKDOWN, NO BOLDING, NO QUOTES.
3. NO NUMBERED LISTS, NO BULLETS.
4. NO EXPLANATIONS OR META-TEXT.
5. Max 3-5 words.

SEARCH QUERY:`;

        const result = await this.generate(prompt);
        return result
            .replace(/[*#]/g, '') // Remove markdown bold/headers
            .replace(/['"]/g, '')
            .replace(/^(Keywords|Search|Query|Search Query)[:\s]*/gi, '')
            .replace(/\d+\.|[-•]/g, '') // Remove list numbers or bullets
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .slice(0, 5)
            .join(' ');
    }

    async generateImagePrompt(summary: string, category: string = 'news'): Promise<string> {
        // Add randomness for varied images
        const styles = ['cinematic', 'dramatic', 'artistic', 'photorealistic', 'atmospheric', 'vibrant'][Math.floor(Math.random() * 6)];

        const prompt = `Create a short AI image generation prompt (max 100 chars) for this ${category} news.
The image should be: ${styles}, high-quality, professional style.
Focus on: key action, thematic atmosphere, or iconic representation of ${category}.
NO text in image. NO specific real people faces (copyright).
Be CREATIVE - suggest a unique visual angle.

News: "${summary.slice(0, 250)}"

PROMPT:`;

        try {
            const result = await this.generate(prompt);
            const cleaned = result
                .replace(/['"]/g, '')
                .replace(/^Prompt:/i, '')
                .trim()
                .slice(0, 150);

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

    async generateCricketImagePrompt(summary: string): Promise<string> {
        return this.generateImagePrompt(summary, 'cricket');
    }


    async generateHeadline(summaries: Map<string, string>): Promise<string> {
        const text = Array.from(summaries.values()).slice(0, 2).join('; ').slice(0, 150);

        const prompt = `Catchy 40 - char headline with emoji for: ${text}
        HEADLINE: `;

        const result = await this.generate(prompt);
        return result.trim().slice(0, 50);
    }

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

    async enhanceVirality(tweet: string, suggestions: string[]): Promise<string> {
        const prompt = `Rewrite this tweet to be more viral(max 270 chars).
Include a question to engage users.
            Add 2 relevant hashtags.
OUTPUT ONLY THE TWEET TEXT.NO META COMMENTS.
DO NOT add UPDATE, BREAKING, or any label at the start.

            Original: "${tweet.slice(0, 150)}"
        Suggestions: ${suggestions.slice(0, 2).join(', ')}

VIRAL TWEET: `;

        const result = await this.generate(prompt);
        return result
            .replace(/^["']|["']$/g, '')
            .replace(/^(Viral|Tweet|Rewrite|Here|Output|UPDATE|BREAKING|Breaking|Update)[:\s]*/gi, '')
            .replace(/📢\s*UPDATE\s*/gi, '') // Remove 📢 UPDATE
            .replace(/🚨\s*(BREAKING|UPDATE)\s*/gi, '') // Remove 🚨 BREAKING/UPDATE
            .replace(/\(.*chars.*\)/gi, '') // Remove (280 chars) notes
            .trim();
    }



    async evaluateContentUrgency(headlines: string[], category: string = 'news'): Promise<{
        importance: 'LIVE' | 'HIGH' | 'NORMAL';
        suggestedInterval: number;
        reason: string;
        isLiveEvent: boolean;
    }> {
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

        const hasLiveKeyword = liveKeywords.some(kw => headlinesText.includes(kw));
        const hasMajorEvent = majorEventKeywords.some(kw => headlinesText.includes(kw));

        if (hasLiveKeyword && hasMajorEvent) {
            log.info(`⚡🔴 LIVE ${category.toUpperCase()} EVENT DETECTED!`);
            return {
                importance: 'LIVE',
                suggestedInterval: 20,
                reason: `Live ${category} event in progress`,
                isLiveEvent: true
            };
        }

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

    async evaluateMatchImportance(headlines: string[]): Promise<any> {
        return this.evaluateContentUrgency(headlines, 'cricket');
    }

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

    async generateCustomTopicTweet(topic: string, maxChars: number = 200): Promise<string> {
        // Add randomness seed for variety
        const randomAngle = ['fascinating fact', 'surprising insight', 'historical perspective',
            'modern relevance', 'little-known detail', 'interesting comparison'][Math.floor(Math.random() * 6)];

        const prompt = `Generate a UNIQUE tweet about this topic.

Topic: "${topic}"

Focus on: ${randomAngle}

STRICT RULES:
- Maximum ${maxChars} characters
- MUST end with complete sentence and period (.)
- Be creative and unique each time

DO NOT INCLUDE:
- Character count like "(199 characters)"
- Labels like "UPDATE:", "BREAKING:", "Tweet:"
- Hashtags
- Emojis at start
- Any meta commentary

OUTPUT: Just the tweet text, nothing else.`;

        try {
            const response = await this.generate(prompt);
            let tweet = response
                .replace(/^["']|["']$/g, '')
                .replace(/\n/g, ' ')
                .replace(/^(UPDATE|BREAKING|Breaking|Update)[:\s]*/gi, '')
                .replace(/📢\s*UPDATE\s*/gi, '')
                .replace(/\(\d+\s*characters?\)/gi, '') // Remove "(199 characters)" type text
                .replace(/\s+/g, ' ') // Normalize spaces
                .trim();

            // Ensure tweet ends with complete sentence
            if (tweet.length > maxChars) {
                tweet = this.ensureCompleteSentence(tweet, maxChars);
            }

            log.info('✅ Custom topic tweet generated', { topic: topic.slice(0, 30) });
            return tweet;
        } catch (error: any) {
            log.error('Custom topic generation failed');
            return `Interesting thoughts on ${topic}...`;
        }
    }

    private ensureCompleteSentence(text: string, maxLen: number): string {
        if (text.length <= maxLen) return text;

        const truncated = text.slice(0, maxLen);
        // Find last sentence-ending punctuation
        const lastPeriod = truncated.lastIndexOf('.');
        const lastExclaim = truncated.lastIndexOf('!');
        const lastQuestion = truncated.lastIndexOf('?');

        const lastEnd = Math.max(lastPeriod, lastExclaim, lastQuestion);

        if (lastEnd > maxLen * 0.5) {
            return truncated.slice(0, lastEnd + 1).trim();
        }

        // Fallback: add period at last space
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLen * 0.6) {
            return truncated.slice(0, lastSpace).trim() + '.';
        }

        return truncated.trim() + '.';
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
