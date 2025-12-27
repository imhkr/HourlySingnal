import { Pipeline } from './pipeline';
import config from '../config';
import { log } from '../utils/logger';
import { getBeastMode } from '../services/ai/beast-mode.service';
import { FetcherAgent } from '../agents/fetcher.agent';
import { getSheetConfig } from '../services/config/sheets.service';
import statsService from '../services/stats/stats.service';

// Smart Scheduler with Google Sheets Remote Control
export class Scheduler {
    private pipeline: Pipeline;
    private fetcher: FetcherAgent;
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private currentMode: 'NORMAL' | 'LIVE' | 'HIGH' = 'NORMAL';

    constructor() {
        this.pipeline = new Pipeline();
        this.fetcher = new FetcherAgent();
    }

    start(): void {
        if (this.isRunning) {
            log.warn('Scheduler already running');
            return;
        }

        log.info('⏰ Starting SMART scheduler with Google Sheets control');
        this.isRunning = true;
        this.scheduleNext();
        log.info('✅ Smart scheduler started successfully');
    }

    private async scheduleNext(): Promise<void> {
        if (!this.isRunning) return;

        // Fetch config from Google Sheets
        const sheetConfig = await getSheetConfig().getConfig();
        const stats = statsService.getStats();

        // Log sheet config & stats
        log.info('📊 BOT STATUS:', {
            activeCategory: sheetConfig.activeCategory,
            tweetsToday: stats.tweetsToday,
            remainingQuota: stats.remainingQuota,
            isActive: sheetConfig.isActive,
        });

        // Check if bot is disabled from sheet
        if (!sheetConfig.isActive) {
            log.warn('⏸️ Bot is PAUSED (isActive=false in Google Sheet)');
            // Check again in 5 minutes
            this.intervalId = setTimeout(() => this.scheduleNext(), 5 * 60 * 1000);
            return;
        }

        // Use maxDailyTweets from sheet vs persistent stats
        const maxDaily = sheetConfig.maxDailyTweets || 17;
        const currentSent = stats.tweetsToday;

        if (currentSent >= maxDaily || stats.remainingQuota <= 0) {
            log.warn(`⚠️ Daily limit reached (${currentSent}/${maxDaily}). Remaining Quota: ${stats.remainingQuota}. Waiting for reset.`);
            // Check again in 1 hour
            this.intervalId = setTimeout(() => this.scheduleNext(), 60 * 60 * 1000);
            return;
        }

        // Get interval from sheet (default from AI match detection if news mode)
        let interval = sheetConfig.tweetInterval || config.app.tweetIntervalMinutes;

        // Only do AI match detection for news mode
        if (sheetConfig.isNewsTweet) {
            try {
                const articles = await this.fetcher.fetch(sheetConfig.activeCategory, 5);
                const headlines = articles.map(a => a.title);

                if (headlines.length > 0) {
                    const ai = getBeastMode();
                    const evaluation = await ai.evaluateContentUrgency(headlines, sheetConfig.activeCategory);

                    this.currentMode = evaluation.importance;
                    // Use AI suggested interval only if it's shorter
                    if (evaluation.suggestedInterval < interval) {
                        interval = evaluation.suggestedInterval;
                    }

                    if (evaluation.isLiveEvent) {
                        log.info(`⚡🔴 LIVE ${sheetConfig.activeCategory.toUpperCase()} MODE: ${evaluation.reason}`);
                        log.info(`⚡ Interval set to ${interval} mins for live coverage`);
                    } else {
                        log.info(`📊 Mode: ${evaluation.importance} | Category: ${sheetConfig.activeCategory} | Interval: ${interval} mins`);
                    }
                }
            } catch (err: any) {
                log.warn('Could not evaluate urgency, using sheet interval');
            }
        } else {
            log.info(`🎯 Custom Topic Mode: "${sheetConfig.customTopic}"`);
        }

        // Run the pipeline
        await this.runPipeline();

        const updatedStats = statsService.getStats();
        log.info(`📊 Tweets today: ${updatedStats.tweetsToday}/${maxDaily}`);

        // Schedule next run using sheet interval
        const nextRunMs = interval * 60 * 1000;
        const nextRunTime = new Date(Date.now() + nextRunMs);
        log.info(`📅 Next run: ${nextRunTime.toLocaleTimeString('en-IN')} (${interval} mins)`);

        this.intervalId = setTimeout(() => this.scheduleNext(), nextRunMs);
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        log.info('🛑 Scheduler stopped');
    }

    /**
     * Run pipeline once manually
     */
    async runOnce(opinion?: string): Promise<void> {
        log.info('▶️ Manual run triggered');
        await this.runPipeline(opinion);
    }

    /**
     * Run pipeline with error handling
     */
    private async runPipeline(opinion?: string): Promise<void> {
        try {
            const result = await this.pipeline.run(opinion);

            if (result.success) {
                log.info('✅ Pipeline run completed successfully', {
                    tweetIds: result.tweetIds,
                });
            } else {
                log.error('❌ Pipeline run failed');
            }
        } catch (error: any) {
            log.error('Pipeline error', { error: error.message });
        }
    }

    /**
     * Get scheduler status
     */
    getStatus(): {
        running: boolean;
        mode: string;
        tweetsToday: number;
        maxDaily: number;
    } {
        const stats = statsService.getStats();
        return {
            running: this.isRunning,
            mode: this.currentMode,
            tweetsToday: stats.tweetsToday,
            maxDaily: 17, // Default
        };
    }
}

export default Scheduler;

