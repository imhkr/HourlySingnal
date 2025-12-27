import axios from 'axios';
import { log } from '../../utils/logger';
import { NewsCategory } from '../../types';

// Bot config from Google Sheets
export interface SheetConfig {
    activeCategory: NewsCategory;
    activeCategories: NewsCategory[];
    botName: string;
    botEmoji: string;
    hashtags: string[];
    tweetInterval: number;      // Gap between tweets (minutes)
    maxDailyTweets: number;     // Max tweets per day
    isActive: boolean;
    isNewsTweet: boolean;       // true = news mode, false = custom topic mode
    customTopic: string;        // Custom topic when isNewsTweet = false
}

// Default config if sheet fetch fails
const DEFAULT_CONFIG: SheetConfig = {
    activeCategory: 'cricket',
    activeCategories: ['cricket'],
    botName: 'HourlySignal',
    botEmoji: '📰',
    hashtags: ['#News', '#Breaking'],
    tweetInterval: 85,
    maxDailyTweets: 17,
    isActive: true,
    isNewsTweet: true,
    customTopic: '',
};

// Connects to a public Google Sheet CSV for remote control
export class GoogleSheetsConfig {
    private sheetUrl: string;
    private cachedConfig: SheetConfig | null = null;
    private lastFetch: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 min cache

    constructor() {
        this.sheetUrl = process.env.GOOGLE_SHEET_URL || '';
    }

    // Fetches config from Google Sheet - NO CACHING for real-time updates
    async getConfig(): Promise<SheetConfig> {
        // If no sheet URL, use defaults
        if (!this.sheetUrl) {
            log.warn('No GOOGLE_SHEET_URL set, using default config');
            return DEFAULT_CONFIG;
        }

        try {
            log.info('📊 Fetching config from Google Sheets...');

            const response = await axios.get(this.sheetUrl, { timeout: 30000 });
            const csvData = response.data as string;

            // Parse CSV (key,value format)
            const config = this.parseCSV(csvData);

            this.cachedConfig = config;
            this.lastFetch = Date.now();

            log.info('✅ Config loaded from Google Sheets', {
                category: config.activeCategory,
                isActive: config.isActive,
            });

            return config;
        } catch (error: any) {
            log.error('❌ Failed to fetch Google Sheet config', { error: error.message });
            return this.cachedConfig || DEFAULT_CONFIG;
        }
    }

    private parseCSV(csv: string): SheetConfig {
        const lines = csv.trim().split('\n');
        const config: Record<string, string> = {};

        for (const line of lines.slice(1)) { // Skip header
            const [key, value] = line.split(',').map(s => s.trim().replace(/"/g, ''));
            if (key && value) {
                config[key] = value;
            }
        }

        const categories = (config['activeCategory'] || 'cricket').split(',').map(c => c.trim() as NewsCategory);

        const maxDailyTweetsValue = parseInt(config['maxDailyTweets'] || '17', 10);

        return {
            activeCategory: categories[0],
            activeCategories: categories,
            botName: config['botName'] || 'HourlySignal',
            botEmoji: config['botEmoji'] || '📰',
            hashtags: (config['hashtags'] || '#News,#Breaking').split(',').map(h => h.trim()),
            tweetInterval: parseInt(config['tweetInterval'] || '85', 10),
            maxDailyTweets: maxDailyTweetsValue,
            isActive: config['isActive']?.toLowerCase() !== 'false',
            isNewsTweet: config['isNewsTweet']?.toLowerCase() !== 'false',
            customTopic: config['customTopic'] || '',
        };
    }

    async isActive(): Promise<boolean> {
        const config = await this.getConfig();
        return config.isActive;
    }

    clearCache(): void {
        this.cachedConfig = null;
        this.lastFetch = 0;
    }
}

let instance: GoogleSheetsConfig | null = null;

export function getSheetConfig(): GoogleSheetsConfig {
    if (!instance) {
        instance = new GoogleSheetsConfig();
    }
    return instance;
}

export default GoogleSheetsConfig;
