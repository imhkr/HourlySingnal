import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import config from '../../config';
import { log } from '../../utils/logger';

/**
 * Google Gemini AI Service
 * Used for summarization, evaluation, and headline generation
 * Rate limited to 12 calls/minute (1 call every 5 seconds) to stay safe
 */
export class GeminiService {
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;
    private lastCallTime: number = 0;
    private readonly MIN_CALL_INTERVAL = 5000; // 5 seconds between calls = max 12/min

    constructor() {
        this.genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
        // Using Gemini 2.0 Flash - latest stable model per docs
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    }

    /**
     * Wait for rate limit before making a call
     */
    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;

        if (timeSinceLastCall < this.MIN_CALL_INTERVAL) {
            const waitTime = this.MIN_CALL_INTERVAL - timeSinceLastCall;
            log.debug(`⏳ Rate limiting: waiting ${(waitTime / 1000).toFixed(1)}s`);
            await this.delay(waitTime);
        }

        this.lastCallTime = Date.now();
    }

    /**
     * Generate a response from Gemini
     * No retry on rate limit - let Beast Mode handle fallback to Mistral
     */
    async generate(prompt: string, maxRetries: number = 1): Promise<string> {
        // Wait for rate limit before making call
        await this.waitForRateLimit();

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                log.debug('Gemini request', { attempt, promptLength: prompt.length });

                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                log.debug('Gemini response', { responseLength: text.length });

                return text;
            } catch (error: any) {
                // Rate limit (429) - throw immediately, let Beast Mode fallback
                if (error.message?.includes('429') || error.message?.includes('Too Many')) {
                    log.warn('Gemini rate limited - throwing for Beast Mode fallback');
                    throw error;
                }

                // Other errors - log and throw
                log.error('Gemini failed', { error: error.message?.slice(0, 50), attempt });
                throw error;
            }
        }

        throw new Error('Gemini generation failed');
    }

    /**
     * Helper delay function
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate a news summary (one-liner)
     */
    async summarizeNews(articles: { title: string; description: string; source: string }[]): Promise<string> {
        const articlesText = articles
            .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   ${a.description}`)
            .join('\n\n');

        const prompt = `You are a professional news summarizer for a Twitter account called "HourlySignal".

TASK: Create a ONE-LINE summary (max 100 characters) of these news articles.

RULES:
1. Be concise, engaging, and informative
2. Focus on the MOST important/interesting news
3. Use simple language that's Twitter-friendly
4. NEVER claim this is your own news - you're summarizing
5. Do NOT use hashtags in the summary
6. Do NOT mention source names in the summary
7. Make it attention-grabbing but factual

NEWS ARTICLES:
${articlesText}

ONE-LINE SUMMARY (max 100 chars):`;

        return this.generate(prompt);
    }

    /**
     * Evaluate a summary for quality
     */
    async evaluateSummary(
        summary: string,
        originalArticles: { title: string; description: string }[]
    ): Promise<{
        passed: boolean;
        score: number;
        feedback: string;
        criteria: {
            accuracy: number;
            engagement: number;
            conciseness: number;
            attribution: number;
        };
    }> {
        const articlesText = originalArticles
            .map((a, i) => `${i + 1}. ${a.title}: ${a.description}`)
            .join('\n');

        const prompt = `You are a quality evaluator for news summaries.

ORIGINAL NEWS:
${articlesText}

SUMMARY TO EVALUATE:
"${summary}"

Evaluate on these criteria (0-10 each):
1. ACCURACY: Does it reflect the news correctly?
2. ENGAGEMENT: Is it interesting and Twitter-worthy?
3. CONCISENESS: Is it short and punchy?
4. ATTRIBUTION: Does it avoid claiming ownership of news?

Respond in this EXACT JSON format:
{
  "accuracy": <0-10>,
  "engagement": <0-10>,
  "conciseness": <0-10>,
  "attribution": <0-10>,
  "feedback": "<specific improvement suggestions>"
}`;

        try {
            const response = await this.generate(prompt);

            // Parse JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Invalid JSON response from evaluator');
            }

            const evaluation = JSON.parse(jsonMatch[0]);
            const avgScore = (
                evaluation.accuracy +
                evaluation.engagement +
                evaluation.conciseness +
                evaluation.attribution
            ) / 4;

            return {
                passed: avgScore >= 7,
                score: avgScore,
                feedback: evaluation.feedback,
                criteria: {
                    accuracy: evaluation.accuracy,
                    engagement: evaluation.engagement,
                    conciseness: evaluation.conciseness,
                    attribution: evaluation.attribution,
                },
            };
        } catch (error: any) {
            log.error('Evaluation parsing failed', { error: error.message });
            // Return passing score if evaluation fails
            return {
                passed: true,
                score: 7,
                feedback: 'Evaluation failed, using default pass',
                criteria: { accuracy: 7, engagement: 7, conciseness: 7, attribution: 7 },
            };
        }
    }

    /**
     * Refine a summary based on feedback
     */
    async refineSummary(
        originalSummary: string,
        feedback: string,
        articles: { title: string; description: string }[]
    ): Promise<string> {
        const articlesText = articles
            .map((a, i) => `${i + 1}. ${a.title}: ${a.description}`)
            .join('\n');

        const prompt = `You are refining a news summary based on feedback.

ORIGINAL NEWS:
${articlesText}

CURRENT SUMMARY:
"${originalSummary}"

FEEDBACK TO ADDRESS:
${feedback}

TASK: Create an IMPROVED one-line summary (max 100 chars) that addresses the feedback.

IMPROVED SUMMARY:`;

        return this.generate(prompt);
    }

    /**
     * Generate a catchy headline for the mega-tweet
     */
    async generateHeadline(summaries: Map<string, string>): Promise<string> {
        const summariesText = Array.from(summaries.entries())
            .map(([category, summary]) => `${category}: ${summary}`)
            .join('\n');

        const prompt = `Create a SHORT, CATCHY headline (max 40 chars) for this news digest.

NEWS SUMMARIES:
${summariesText}

The headline should be:
- Attention-grabbing
- Use an emoji at the start
- Capture the overall theme
- NOT be clickbait

HEADLINE (max 40 chars):`;

        const headline = await this.generate(prompt);
        return headline.trim().slice(0, 50);
    }

    /**
     * Check virality potential of a tweet
     */
    async checkVirality(tweetContent: string): Promise<{
        score: number;
        isViral: boolean;
        feedback: string;
        suggestions: string[];
    }> {
        const prompt = `You are a Twitter/X viral content expert. Analyze this tweet for VIRALITY potential.

TWEET:
"${tweetContent}"

Rate on these criteria (0-10 each):
1. HOOK: Does it grab attention in first line?
2. EMOTION: Does it trigger curiosity, excitement, or FOMO?
3. SHAREABILITY: Would people retweet this?
4. ENGAGEMENT: Does it invite comments/replies?
5. HASHTAGS: Are hashtags relevant and trending?

Respond in this EXACT JSON format:
{
  "hook": <0-10>,
  "emotion": <0-10>,
  "shareability": <0-10>,
  "engagement": <0-10>,
  "hashtags": <0-10>,
  "feedback": "<what's wrong>",
  "suggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>"]
}`;

        try {
            const response = await this.generate(prompt);
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Invalid JSON');

            const result = JSON.parse(jsonMatch[0]);
            const avgScore = (result.hook + result.emotion + result.shareability + result.engagement + result.hashtags) / 5;

            return {
                score: avgScore,
                isViral: avgScore >= 7,
                feedback: result.feedback,
                suggestions: result.suggestions || [],
            };
        } catch (error: any) {
            log.error('Virality check failed', { error: error.message });
            return { score: 7, isViral: true, feedback: '', suggestions: [] };
        }
    }

    /**
     * Enhance tweet for maximum virality
     */
    async enhanceForVirality(
        tweetContent: string,
        feedback: string,
        suggestions: string[]
    ): Promise<{
        enhancedTweet: string;
        addedHashtags: string[];
        engagementHook: string;
    }> {
        const prompt = `You are a Twitter/X viral content expert. Enhance this tweet for MAXIMUM VIRALITY.

ORIGINAL TWEET:
"${tweetContent}"

ISSUES TO FIX:
${feedback}

SUGGESTIONS:
${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

ENHANCEMENT RULES:
1. Add 4-6 TRENDING and RELEVANT hashtags (mix of popular + niche)
2. Add an ENGAGEMENT HOOK at the end (question, poll idea, or call-to-action)
3. Use POWER WORDS that trigger emotion (Breaking, Massive, Shocking, etc)
4. Keep total under 280 characters if possible
5. Add emojis strategically for visual appeal
6. Make first line ATTENTION-GRABBING (this is crucial!)
7. Add a question at the end to boost replies

Respond in this EXACT JSON format:
{
  "enhancedTweet": "<the improved viral tweet>",
  "addedHashtags": ["#tag1", "#tag2", "#tag3", "#tag4"],
  "engagementHook": "<the question or CTA you added>"
}`;

        try {
            const response = await this.generate(prompt);
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Invalid JSON');

            const result = JSON.parse(jsonMatch[0]);
            return {
                enhancedTweet: result.enhancedTweet,
                addedHashtags: result.addedHashtags || [],
                engagementHook: result.engagementHook || '',
            };
        } catch (error: any) {
            log.error('Virality enhancement failed', { error: error.message });
            return { enhancedTweet: tweetContent, addedHashtags: [], engagementHook: '' };
        }
    }

    /**
     * Generate trending hashtags for a topic
     */
    async generateTrendingHashtags(topic: string, count: number = 5): Promise<string[]> {
        const prompt = `Generate ${count} TRENDING and RELEVANT hashtags for Twitter/X.

TOPIC: ${topic}

RULES:
1. Mix popular hashtags with niche ones
2. Include location-based tags if relevant (#India, #Mumbai, etc)
3. Include category tags (#Tech, #Sports, #Bollywood)
4. Include trending format tags (#Breaking, #Update, #JustIn)
5. NO generic tags like #news #today #update
6. Make them catchy and searchable

Return ONLY the hashtags, one per line, starting with #`;

        try {
            const response = await this.generate(prompt);
            const hashtags = response
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('#'))
                .slice(0, count);

            return hashtags.length > 0 ? hashtags : ['#HourlySignal', '#Breaking', '#Trending'];
        } catch (error: any) {
            return ['#HourlySignal', '#Breaking', '#Trending'];
        }
    }
}

export default GeminiService;
