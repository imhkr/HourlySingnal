import { NewsCategory, NewsSummary, MegaTweet, CategoryDisplayNames } from '../types';
import { FetcherAgent } from '../agents/fetcher.agent';
import {
    SummarizerAgent,
    EvaluatorAgent,
    RefinerAgent,
    HeadlineAgent
} from '../agents/summarizer.agent';
import { ViralityAgent } from '../agents/virality.agent';
import { OriginalityAgent } from '../agents/originality.agent';
import { memory } from '../agents/memory';
import { TwitterService } from '../services/social/twitter.service';
import { ImageService } from '../services/image/image.service';
import { getSheetConfig, SheetConfig } from '../services/config/sheets.service';
import config from '../config';
import { log } from '../utils/logger';
import { getTrendingHashtags } from '../utils/trending';
import { getBeastMode, BeastModeAI } from '../services/ai/beast-mode.service';

/**
 * Tweet Composer - SMART THREAD MODE
 * Main tweet = Most viral story (longest/most detailed)
 * Reply = Other categories summary
 * Tracks daily usage to stay under 17 tweets/day
 */
export class TweetComposer {
    private readonly MAX_TWEET = 275;
    private static dailyTweetCount = 0;
    private static lastResetDate = new Date().toDateString();

    /**
     * Compose smart thread: Main viral + Reply with others
     */
    compose(
        headline: string,
        summaries: Map<NewsCategory, string>,
        sheetConfig?: SheetConfig,
        opinion?: string
    ): MegaTweet {
        const timestamp = new Date();

        // Reset daily counter at midnight
        const today = new Date().toDateString();
        if (TweetComposer.lastResetDate !== today) {
            TweetComposer.dailyTweetCount = 0;
            TweetComposer.lastResetDate = today;
        }

        // Get all valid stories sorted by length
        const stories = this.getSortedStories(summaries);

        // Calculate usage
        const maxDaily = sheetConfig?.maxDailyTweets || 17;
        const remainingTweets = maxDaily - TweetComposer.dailyTweetCount;

        let tweets: string[];
        // For now we use single tweet mode for better focus, but keeping logic for future
        tweets = [this.buildTweetWithConfig(stories, sheetConfig)];
        TweetComposer.dailyTweetCount += 1;

        log.info(`📊 Daily Usage: ${TweetComposer.dailyTweetCount}/${maxDaily}`);

        return {
            headline,
            summaries,
            opinion,
            timestamp,
            characterCount: tweets.reduce((a, b) => a + b.length, 0),
            isThread: tweets.length > 1,
            tweets,
        };
    }

    /**
     * Get stories sorted by detail/virality (longer = better)
     */
    private getSortedStories(summaries: Map<NewsCategory, string>): { cat: NewsCategory; text: string }[] {
        const stories: { cat: NewsCategory; text: string }[] = [];

        for (const [cat, text] of summaries.entries()) {
            if (text && text.length > 15 && !text.includes('No news')) {
                stories.push({ cat, text });
            }
        }

        // Sort by length
        return stories.sort((a, b) => b.text.length - a.text.length);
    }

    /**
     * Truncate at word boundary
     */
    private truncateAtWord(text: string, maxLen: number): string {
        if (text.length <= maxLen) return text;
        const truncated = text.slice(0, maxLen);
        const lastSpace = truncated.lastIndexOf(' ');
        return lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated;
    }

    // Builds tweet using Google Sheets config
    private buildTweetWithConfig(stories: { cat: NewsCategory; text: string }[], sheetConfig?: SheetConfig): string {
        // Use Google Sheet config if available
        const emoji = sheetConfig?.botEmoji || config.bot.botEmoji;
        const hashtags = sheetConfig?.hashtags?.join(' ') || config.bot.customHashtags.join(' ');

        const story1 = stories[0];
        if (!story1) return 'No updates at this time';

        // Dynamic label based on category
        let label = 'UPDATE';
        if (story1.cat !== 'custom') {
            const catLabel = story1.cat.replace(/-/g, ' ').toUpperCase();
            label = `${catLabel} UPDATE`;
        }

        const text1 = this.truncateAtWord(story1.text, 220);
        return `${emoji} ${label}\n\n${text1}\n\n${hashtags}`;
    }
}


/**
 * Main Pipeline Orchestrator
 * Coordinates the entire flow from fetching to tweeting
 */
export class Pipeline {
    private fetcher: FetcherAgent;
    private summarizer: SummarizerAgent;
    private evaluator: EvaluatorAgent;
    private refiner: RefinerAgent;
    private headlineAgent: HeadlineAgent;
    private viralityAgent: ViralityAgent;
    private originalityAgent: OriginalityAgent;
    private composer: TweetComposer;
    private twitter: TwitterService;
    private imageService: ImageService;
    private ai: BeastModeAI;
    private isRunning: boolean = false;

    constructor() {
        this.fetcher = new FetcherAgent();
        this.summarizer = new SummarizerAgent();
        this.evaluator = new EvaluatorAgent();
        this.refiner = new RefinerAgent();
        this.headlineAgent = new HeadlineAgent();
        this.viralityAgent = new ViralityAgent();
        this.originalityAgent = new OriginalityAgent();
        this.composer = new TweetComposer();
        this.twitter = new TwitterService();
        this.imageService = new ImageService();
        this.ai = getBeastMode();
    }

    /**
     * Run the complete pipeline
     */
    async run(userOpinion?: string): Promise<{
        success: boolean;
        tweetIds: string[];
        summaries: Map<NewsCategory, string>;
    }> {
        if (this.isRunning) {
            log.warn('Pipeline already running, skipping');
            return { success: false, tweetIds: [], summaries: new Map() };
        }

        this.isRunning = true;
        const startTime = Date.now();

        log.info('🚀 Pipeline started');

        try {
            // Fetch config from Google Sheets (or fallback to local)
            const sheetConfig = await getSheetConfig().getConfig();

            // Check if bot is active (can be turned off from Google Sheet!)
            if (!sheetConfig.isActive) {
                log.warn('⚠️ Bot is DISABLED in Google Sheets config');
                return { success: false, tweetIds: [], summaries: new Map() };
            }

            const summaries = new Map<NewsCategory, string>();

            // 🎯 CUSTOM TOPIC MODE (isNewsTweet = false)
            if (!sheetConfig.isNewsTweet && sheetConfig.customTopic) {
                log.info(`📝 Custom Topic Mode: "${sheetConfig.customTopic}"`);

                // Step 1: Content Moderation - Check if topic is appropriate
                const moderation = await this.ai.moderateContent(sheetConfig.customTopic);

                if (!moderation.isSafe) {
                    log.error('🚫 BLOCKED: Topic failed content moderation', {
                        topic: sheetConfig.customTopic,
                        reason: moderation.reason
                    });
                    return { success: false, tweetIds: [], summaries: new Map() };
                }

                // Step 2: Generate tweet about custom topic
                const customTweet = await this.ai.generateCustomTopicTweet(sheetConfig.customTopic, 200);
                summaries.set('custom' as NewsCategory, customTweet);

                // Step 3: Build and post custom topic tweet
                log.info('✅ Custom topic processed, posting tweet...');

                const emoji = sheetConfig.botEmoji || config.bot.botEmoji;
                const hashtags = sheetConfig.hashtags?.join(' ') || config.bot.customHashtags.join(' ');

                // Dynamic label (not just cricket!)
                const updateLabel = 'UPDATE';
                const fullTweet = `${emoji} ${updateLabel}\n\n${customTweet}\n\n${hashtags}`;

                // Generate image
                const imagePath = await this.imageService.generateNewsImage(customTweet);

                let tweetIds: string[] = [];
                let success = false;

                if (imagePath) {
                    const imgResult = await this.twitter.postTweetWithImage(fullTweet, imagePath);
                    success = imgResult.success;
                    if (imgResult.tweetId) tweetIds = [imgResult.tweetId];
                    this.imageService.cleanup();
                } else {
                    const textResult = await this.twitter.postTweet(fullTweet);
                    success = textResult.success;
                    if (textResult.tweetId) tweetIds = [textResult.tweetId];
                }

                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                log.info(`✅ Custom topic tweet completed in ${duration}s`);

                return { success, tweetIds, summaries };

            } else {
                // 📰 NEWS MODE (default)
                // Use category from Google Sheet (remote) or fallback to .env
                const categories: NewsCategory[] = [
                    sheetConfig.activeCategory || config.bot.activeCategory,
                ];

                // Step 1: Fetch and summarize for each category
                for (const category of categories) {
                    log.info(`Processing category: ${category}`);

                    // Fetch news
                    const articles = await this.fetcher.fetch(category, 5);

                    if (articles.length === 0) {
                        log.warn(`No articles found for ${category}`);
                        summaries.set(category, 'No updates at this time');
                        continue;
                    }

                    // Summarize with Reflexion loop
                    // Use shorter summaries for International & Tech to fit in one tweet
                    const maxChars = (category === 'international-news' || category === 'technology') ? 105 : 180;
                    let summary = await this.summarizer.summarize(articles, maxChars);
                    let iteration = 0;
                    const maxIterations = config.app.maxReflexionIterations;

                    while (iteration < maxIterations) {
                        // Evaluate
                        const evaluation = await this.evaluator.evaluate(summary);

                        log.reflexion(iteration + 1, evaluation.score, evaluation.passed);

                        if (evaluation.passed) {
                            log.info(`✅ Summary approved for ${category} (score: ${evaluation.score})`);
                            break;
                        }

                        // Store feedback in memory
                        memory.store({
                            category,
                            originalSummary: summary.oneLiner,
                            feedback: evaluation.feedback,
                            refinedSummary: '',  // Will be updated after refinement
                            improvement: 0,
                        });

                        // Refine
                        const previousFeedback = memory.getRecent(category, 3);
                        summary = await this.refiner.refine(summary, evaluation.feedback, previousFeedback);

                        iteration++;
                    }

                    // Step 1.5: ORIGINALITY CHECK 📝
                    // Rewrite in unique language to avoid plagiarism
                    log.info('📝 Checking originality...');
                    const originalTitles = articles.map(a => a.title);
                    const originalResult = await this.originalityAgent.ensureOriginal(
                        summary.oneLiner,
                        originalTitles,
                        2, // max 2 rewrite attempts
                        maxChars
                    );

                    if (originalResult.isOriginal) {
                        log.info('✅ Summary is original');
                    } else {
                        log.warn('⚠️ Summary may need manual review');
                    }

                    // Use the original (unique) version
                    summaries.set(category, originalResult.finalSummary);

                    // Small delay between categories
                    await this.delay(1000);
                }

                // Step 2: Generate headline
                const headline = await this.headlineAgent.generate(summaries);

                // AUTO-OPINION: If no user opinion, generate one via AI
                let opinion = userOpinion;
                if (!opinion || opinion.trim() === '') {
                    log.info('🤖 Generating AI Expert Opinion...');
                    const mainSummary = summaries.get('indian-news') || Array.from(summaries.values())[0];
                    if (mainSummary && mainSummary !== 'No updates at this time') {
                        try {
                            opinion = await this.ai.generateOpinion(mainSummary);
                            log.info(`✅ AI Opinion: "${opinion}"`);
                        } catch (err) {
                            log.warn('Failed to generate AI opinion, skipping.');
                        }
                    }
                }

                // Step 3: Compose mega-tweet
                let megaTweet = this.composer.compose(headline, summaries, sheetConfig, opinion);

                log.info('📝 Mega-tweet composed', {
                    isThread: megaTweet.isThread,
                    tweetCount: megaTweet.tweets.length,
                    charCount: megaTweet.characterCount,
                });

                // Step 4: VIRALITY CHECK & ENHANCEMENT 🔥
                log.info('🔥 Running virality check...');

                // Check virality of the first tweet (main content)
                const viralResult = await this.viralityAgent.ensureViral(
                    megaTweet.tweets[0],
                    2 // max 2 enhancement iterations
                );

                if (viralResult.wasEnhanced) {
                    log.info('⚡ Tweet was enhanced for virality!', {
                        score: viralResult.viralityScore.toFixed(1),
                        hashtags: viralResult.hashtags,
                        hook: viralResult.engagementHook.slice(0, 50),
                    });

                    // Update the tweet with enhanced version
                    megaTweet.tweets[0] = viralResult.finalTweet;
                } else {
                    log.info('✅ Tweet already viral-ready!', {
                        score: viralResult.viralityScore.toFixed(1),
                    });
                }

                // Step 5: Validate & Post to Twitter WITH IMAGE
                const firstTweet = megaTweet.tweets[0] || '';
                if (firstTweet.toLowerCase().includes('no updates') || firstTweet.length < 20) {
                    log.error('❌ Generated content is empty ("No updates"). Aborting Tweet.');
                    return {
                        success: false,
                        tweetIds: [],
                        summaries
                    };
                }

                // Generate contextual image
                log.info(`🖼️ Generating AI image for ${sheetConfig.activeCategory}...`);
                const imagePath = await this.imageService.generateNewsImage(firstTweet);

                let tweetIds: string[] = [];
                let success = false;

                if (imagePath) {
                    log.info('✅ Image ready, posting with image...');
                    const imgResult = await this.twitter.postTweetWithImage(firstTweet, imagePath);
                    success = imgResult.success;
                    if (imgResult.tweetId) tweetIds = [imgResult.tweetId];
                    // Cleanup temp image
                    this.imageService.cleanup();
                } else {
                    log.warn('Image generation failed, posting text only...');
                    const textResult = await this.twitter.postMegaTweet(megaTweet);
                    success = textResult.success;
                    tweetIds = textResult.tweetIds;
                }

                const duration = ((Date.now() - startTime) / 1000).toFixed(1);

                if (success) {
                    log.info(`✅ Pipeline completed in ${duration}s`, {
                        tweetIds,
                    });
                } else {
                    log.error('❌ Pipeline failed to post tweets');
                }

                return {
                    success,
                    tweetIds,
                    summaries,
                };
            } // End of else (NEWS MODE)

        } catch (error: any) {
            log.error('Pipeline failed', { error: error.message });
            return { success: false, tweetIds: [], summaries: new Map() };
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Test run without posting to Twitter
     */
    async dryRun(): Promise<Map<NewsCategory, string>> {
        log.info('🧪 Dry run started (no tweeting)');

        // Fetch config from Google Sheets
        const sheetConfig = await getSheetConfig().getConfig();

        // LOG ALL SHEET VALUES
        log.info('📊 GOOGLE SHEET CONFIG:', {
            activeCategory: sheetConfig.activeCategory,
            botName: sheetConfig.botName,
            botEmoji: sheetConfig.botEmoji,
            hashtags: sheetConfig.hashtags,
            tweetInterval: sheetConfig.tweetInterval,
            maxDailyTweets: sheetConfig.maxDailyTweets,
            isActive: sheetConfig.isActive,
            isNewsTweet: sheetConfig.isNewsTweet,
            customTopic: sheetConfig.customTopic,
        });

        const summaries = new Map<NewsCategory, string>();

        // CUSTOM TOPIC MODE
        if (!sheetConfig.isNewsTweet && sheetConfig.customTopic) {
            log.info(`🎯 CUSTOM TOPIC MODE: "${sheetConfig.customTopic}"`);

            // Content moderation check
            const moderation = await this.ai.moderateContent(sheetConfig.customTopic);
            log.info('🛡️ Moderation result:', moderation);

            if (!moderation.isSafe) {
                log.error('🚫 BLOCKED: Topic failed moderation');
                summaries.set('custom' as NewsCategory, `BLOCKED: ${moderation.reason}`);
                return summaries;
            }

            // Generate custom topic tweet
            const customTweet = await this.ai.generateCustomTopicTweet(sheetConfig.customTopic, 200);
            summaries.set('custom' as NewsCategory, customTweet);
            log.info(`✅ Custom topic tweet: "${customTweet}"`);

            return summaries;
        }

        // NEWS MODE
        log.info(`📰 NEWS MODE: Fetching ${sheetConfig.activeCategory}`);
        const categories: NewsCategory[] = [
            sheetConfig.activeCategory || config.bot.activeCategory,
        ];

        for (const category of categories) {
            log.info(`\n📰 Processing: ${category}`);

            const articles = await this.fetcher.fetch(category, 3);

            if (articles.length === 0) {
                summaries.set(category, 'No news available');
                log.warn(`${category}: No articles found`);
                continue;
            }

            const summary = await this.summarizer.summarize(articles);

            // Run originality check
            const originalTitles = articles.map(a => a.title);
            const originalResult = await this.originalityAgent.ensureOriginal(
                summary.oneLiner,
                originalTitles,
                1 // Quick check for dry run
            );

            summaries.set(category, originalResult.finalSummary);
            log.info(`✅ ${category}: ${originalResult.finalSummary}`);
        }

        return summaries;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default Pipeline;
