import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../utils/logger';

interface TweetStats {
    tweetsToday: number;
    lastResetDate: string;
    remainingQuota: number;
    resetTime?: number;
}

/**
 * 📊 StatsService
 * Persists tweet counts and Twitter API quota info across bot restarts
 */
class StatsService {
    private readonly statsPath: string;
    private stats: TweetStats;

    constructor() {
        this.statsPath = path.resolve(process.cwd(), 'tweet_stats.json');
        this.stats = this.loadStats();
    }

    private loadStats(): TweetStats {
        try {
            if (fs.existsSync(this.statsPath)) {
                const data = fs.readFileSync(this.statsPath, 'utf-8');
                const parsed = JSON.parse(data);

                // Check for daily reset
                const today = new Date().toDateString();
                if (parsed.lastResetDate !== today) {
                    log.info('📅 New day detected, resetting local tweet counter');
                    return {
                        tweetsToday: 0,
                        lastResetDate: today,
                        remainingQuota: 17, // Start with fresh limit
                    };
                }
                return parsed;
            }
        } catch (error: any) {
            log.warn('Could not load stats file, using defaults', { error: error.message });
        }

        return {
            tweetsToday: 0,
            lastResetDate: new Date().toDateString(),
            remainingQuota: 17,
        };
    }

    private saveStats(): void {
        try {
            fs.writeFileSync(this.statsPath, JSON.stringify(this.stats, null, 2));
        } catch (error: any) {
            log.error('Failed to save stats', { error: error.message });
        }
    }

    getStats(): TweetStats {
        return this.stats;
    }

    incrementTweets(): void {
        this.stats.tweetsToday++;
        if (this.stats.remainingQuota > 0) {
            this.stats.remainingQuota--;
        }
        this.saveStats();
    }

    updateQuota(remaining: number, resetTime?: number): void {
        this.stats.remainingQuota = remaining;
        if (resetTime) {
            this.stats.resetTime = resetTime;
        }
        this.saveStats();
    }

    getRemainingTweets(): number {
        // Use the smaller of (17 - sent) or the actual API remaining count
        const calculatedRemaining = Math.max(0, 17 - this.stats.tweetsToday);
        return Math.min(calculatedRemaining, this.stats.remainingQuota);
    }
}

export const statsService = new StatsService();
export default statsService;
