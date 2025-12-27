import { Pipeline } from './pipeline';
import config from '../config';
import { log } from '../utils/logger';
import { getBeastMode } from '../services/ai/beast-mode.service';
import { FetcherAgent } from '../agents/fetcher.agent';

/**
 * 🏏 Smart Scheduler with AI Match Detection
 * 
 * Features:
 * - Normal Mode: 1 tweet every 85 mins
 * - Live Match Mode: Tweet every 20 mins when major match detected
 * - AI evaluates match importance from headlines
 */
export class Scheduler {
    private pipeline: Pipeline;
    private fetcher: FetcherAgent;
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private currentMode: 'NORMAL' | 'LIVE' | 'HIGH' = 'NORMAL';
    private tweetsToday: number = 0;
    private lastResetDate: string = new Date().toDateString();
    private readonly MAX_DAILY_TWEETS = 17;

    constructor() {
        this.pipeline = new Pipeline();
        this.fetcher = new FetcherAgent();
    }

    /**
     * Start the smart scheduler
     */
    start(): void {
        if (this.isRunning) {
            log.warn('Scheduler already running');
            return;
        }

        log.info('⏰ Starting SMART scheduler with AI match detection');
        log.info(`📊 Default interval: ${config.app.tweetIntervalMinutes} minutes`);
        log.info(`🏏 Live match mode: 20 minute intervals`);

        this.isRunning = true;
        this.scheduleNext();

        log.info('✅ Smart scheduler started successfully');
    }

    /**
     * Schedule the next check with dynamic interval
     */
    private async scheduleNext(): Promise<void> {
        if (!this.isRunning) return;

        // Reset daily counter at midnight
        const today = new Date().toDateString();
        if (this.lastResetDate !== today) {
            this.tweetsToday = 0;
            this.lastResetDate = today;
            log.info('📅 Daily tweet counter reset');
        }

        // Check if we've hit daily limit
        if (this.tweetsToday >= this.MAX_DAILY_TWEETS) {
            log.warn(`⚠️ Daily limit reached (${this.tweetsToday}/${this.MAX_DAILY_TWEETS}). Waiting for midnight reset.`);
            // Wait 1 hour and check again
            this.intervalId = setTimeout(() => this.scheduleNext(), 60 * 60 * 1000);
            return;
        }

        // Evaluate match importance using AI
        let interval = config.app.tweetIntervalMinutes;
        try {
            const articles = await this.fetcher.fetch('cricket', 5);
            const headlines = articles.map(a => a.title);

            if (headlines.length > 0) {
                const ai = getBeastMode();
                const evaluation = await ai.evaluateMatchImportance(headlines);

                this.currentMode = evaluation.importance;
                interval = evaluation.suggestedInterval;

                if (evaluation.isLiveMatch) {
                    log.info(`🏏🔴 LIVE MODE: ${evaluation.reason}`);
                    log.info(`⚡ Interval set to ${interval} mins for live coverage`);
                } else {
                    log.info(`📊 Mode: ${evaluation.importance} | Interval: ${interval} mins`);
                }
            }
        } catch (err: any) {
            log.warn('Could not evaluate match importance, using default interval');
        }

        // Run the pipeline
        await this.runPipeline();
        this.tweetsToday++;

        log.info(`📊 Tweets today: ${this.tweetsToday}/${this.MAX_DAILY_TWEETS}`);

        // Schedule next run
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
        return {
            running: this.isRunning,
            mode: this.currentMode,
            tweetsToday: this.tweetsToday,
            maxDaily: this.MAX_DAILY_TWEETS,
        };
    }
}

export default Scheduler;

