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

export class TweetComposer {
    private readonly MAX_TWEET = 275;
    private static dailyTweetCount = 0;
    private static lastResetDate = new Date().toDateString();

    compose(
        headline: string,
        summaries: Map<NewsCategory, string>,
        sheetConfig?: SheetConfig,
        opinion?: string
    ): MegaTweet {
        const timestamp = new Date();

        const today = new Date().toDateString();
        if (TweetComposer.lastResetDate !== today) {
            TweetComposer.dailyTweetCount = 0;
            TweetComposer.lastResetDate = today;
        }

        const stories = this.getSortedStories(summaries);

        const maxDaily = sheetConfig?.maxDailyTweets || 17;
        const remainingTweets = maxDaily - TweetComposer.dailyTweetCount;

        let tweets: string[];
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

    private getSortedStories(summaries: Map<NewsCategory, string>): { cat: NewsCategory; text: string }[] {
        const stories: { cat: NewsCategory; text: string }[] = [];

        for (const [cat, text] of summaries.entries()) {
            if (text && text.length > 15 && !text.includes('No news')) {
                stories.push({ cat, text });
            }
        }

        return stories.sort((a, b) => b.text.length - a.text.length);
    }

    private truncateAtWord(text: string, maxLen: number): string {
        if (text.length <= maxLen) return text;

        // Find last sentence end
        const truncated = text.slice(0, maxLen);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('. '),
            truncated.lastIndexOf('! '),
            truncated.lastIndexOf('? '),
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?')
        );

        if (lastSentenceEnd > maxLen * 0.4) {
            return truncated.slice(0, lastSentenceEnd + 1).trim();
        }

        // Word boundary fallback
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLen * 0.6) {
            return truncated.slice(0, lastSpace).trim() + '...';
        }

        return truncated.slice(0, maxLen - 3).trim() + '...';
    }

    private buildTweetWithConfig(stories: { cat: NewsCategory; text: string }[], sheetConfig?: SheetConfig): string {
        // Use Google Sheet config if available
        const emoji = sheetConfig?.botEmoji || config.bot.botEmoji;

        // Custom hashtag logic for fallbacks
        let hashtags = '';
        if (sheetConfig?.hashtags && sheetConfig.hashtags.length > 0 && sheetConfig.hashtags[0] !== '') {
            hashtags = sheetConfig.hashtags.join(' ');
        } else if (stories[0]?.cat === 'custom') {
            // Generate meaningful hashtag from story content
            const words = stories[0].text.split(' ')
                .filter(w => w.length > 4 && /^[a-zA-Z]+$/.test(w))
                .slice(0, 2)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
            hashtags = words.length > 0 ? `#${words.join('')}` : '#Interesting';
        } else {
            hashtags = config.bot.customHashtags.join(' ');
        }

        const story1 = stories[0];
        if (!story1) return 'No updates at this time';

        // Emoji only + News text. Removed all 'UPDATE' or category text labels.
        const label = '';

        const text1 = this.truncateAtWord(story1.text, 200);
        return `${emoji}${label ? ' ' + label : ''}\n\n${text1}${hashtags ? '\n\n' + hashtags : ''}`.trim();
    }
}


// Core pipeline for fetching, AI processing, and posting
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
            const sheetConfig = await getSheetConfig().getConfig();

            if (!sheetConfig.isActive) {
                log.warn('⚠️ Bot is DISABLED in Google Sheets config');
                return { success: false, tweetIds: [], summaries: new Map() };
            }

            const summaries = new Map<NewsCategory, string>();

            if (!sheetConfig.isNewsTweet && sheetConfig.customTopic) {
                log.info(`📝 Custom Topic Mode: "${sheetConfig.customTopic}"`);

                const moderation = await this.ai.moderateContent(sheetConfig.customTopic);

                if (!moderation.isSafe) {
                    log.error('🚫 BLOCKED: Topic failed content moderation', {
                        topic: sheetConfig.customTopic,
                        reason: moderation.reason
                    });
                    return { success: false, tweetIds: [], summaries: new Map() };
                }

                const customTweet = await this.ai.generateCustomTopicTweet(sheetConfig.customTopic, 200);
                summaries.set('custom' as NewsCategory, customTweet);

                log.info('✅ Custom topic processed, posting tweet...');

                const emoji = sheetConfig.botEmoji || config.bot.botEmoji;

                // For custom topics: generate meaningful hashtags from content
                // Only use sheet hashtags if explicitly set (not default #News #Breaking)
                let hashtags = '';
                const isDefaultHashtags = sheetConfig.hashtags.length === 2 &&
                    sheetConfig.hashtags[0] === '#News' &&
                    sheetConfig.hashtags[1] === '#Breaking';

                if (sheetConfig.hashtags && sheetConfig.hashtags.length > 0 &&
                    sheetConfig.hashtags[0] !== '' && !isDefaultHashtags) {
                    // User explicitly set custom hashtags in sheet
                    hashtags = sheetConfig.hashtags.join(' ');
                } else {
                    // Generate hashtag from topic keywords
                    const topicWords = sheetConfig.customTopic.split(' ')
                        .filter(w => w.length > 3 && /^[a-zA-Z]+$/.test(w))
                        .slice(0, 2)
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
                    hashtags = topicWords.length > 0 ? `#${topicWords.join('')}` : '#Trending';
                }

                const fullTweet = `${emoji}\n\n${customTweet}\n\n${hashtags}`;

                let imagePath: string | null = null;
                if (sheetConfig.generateImage) {
                    imagePath = await this.imageService.generateNewsImage(customTweet);
                }

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
                const categories: NewsCategory[] = sheetConfig.activeCategories.length > 0
                    ? sheetConfig.activeCategories
                    : [config.bot.activeCategory];

                for (const category of categories) {
                    log.info(`Processing category: ${category}`);

                    const articles = await this.fetcher.fetch(category, 10);

                    if (articles.length === 0) {
                        log.warn(`No fresh articles found for ${category}. Skipping.`);
                        continue;
                    }

                    const maxChars = 200; // Fixed limit for all categories
                    let summary = await this.summarizer.summarize(articles, maxChars);
                    let iteration = 0;
                    const maxIterations = config.app.maxReflexionIterations;

                    while (iteration < maxIterations) {
                        const evaluation = await this.evaluator.evaluate(summary);

                        log.reflexion(iteration + 1, evaluation.score, evaluation.passed);

                        if (evaluation.passed) {
                            log.info(`✅ Summary approved for ${category} (score: ${evaluation.score})`);
                            break;
                        }

                        memory.store({
                            category,
                            originalSummary: summary.oneLiner,
                            feedback: evaluation.feedback,
                            refinedSummary: '',  // Will be updated after refinement
                            improvement: 0,
                        });

                        const previousFeedback = memory.getRecent(category, 3);

                        iteration++;
                    }

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

                    await this.delay(1000);
                }

                // Abort if no fresh news found
                if (summaries.size === 0) {
                    log.warn('❌ No fresh news found for any category. Skipping tweet.');
                    return {
                        success: false,
                        tweetIds: [],
                        summaries
                    };
                }

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

                let megaTweet = this.composer.compose(headline, summaries, sheetConfig, opinion);

                log.info('📝 Mega-tweet composed', {
                    isThread: megaTweet.isThread,
                    tweetCount: megaTweet.tweets.length,
                    charCount: megaTweet.characterCount,
                });

                log.info('📊 Checking tweet quality...');

                const viralResult = await this.viralityAgent.ensureViral(
                    megaTweet.tweets[0],
                    1 // just check score, minimal enhancement
                );

                log.info(`📊 Tweet quality score: ${viralResult.viralityScore.toFixed(1)}/10`);

                // Only use enhanced version if original was really bad (score < 4)
                if (viralResult.wasEnhanced && viralResult.viralityScore >= 6) {
                    log.info('✅ Using enhanced tweet (major improvement)');
                    megaTweet.tweets[0] = viralResult.finalTweet;
                } else {
                    log.info('✅ Using original tweet (fresh news > virality)');
                }

                const firstTweet = megaTweet.tweets[0] || '';
                if (firstTweet.toLowerCase().includes('no updates') || firstTweet.length < 20) {
                    log.error('❌ Generated content is empty ("No updates"). Aborting Tweet.');
                    return {
                        success: false,
                        tweetIds: [],
                        summaries
                    };
                }

                log.info(`🖼️ Generating AI image for ${sheetConfig.activeCategory}...`);
                let imagePath: string | null = null;
                if (sheetConfig.generateImage) {
                    imagePath = await this.imageService.generateImageByCategory(sheetConfig.activeCategory);
                }

                let tweetIds: string[] = [];
                let success = false;

                if (imagePath) {
                    log.info('✅ Image ready, posting with image...');
                    const imgResult = await this.twitter.postTweetWithImage(firstTweet, imagePath);
                    success = imgResult.success;
                    if (imgResult.tweetId) tweetIds = [imgResult.tweetId];
                    this.imageService.cleanup();
                } else {
                    if (sheetConfig.generateImage) {
                        log.warn('Image generation failed, posting text only...');
                    }
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
        log.info(`📰 NEWS MODE: Fetching ${sheetConfig.activeCategories.join(', ')}`);
        const categories: NewsCategory[] = sheetConfig.activeCategories.length > 0
            ? sheetConfig.activeCategories
            : [config.bot.activeCategory];

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
