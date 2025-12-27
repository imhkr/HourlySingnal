import dotenv from 'dotenv';
import path from 'path';
import { NewsCategory } from '../types';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
    // X (Twitter) API
    twitter: {
        apiKey: process.env.X_API_KEY || '',
        apiSecret: process.env.X_API_SECRET || '',
        bearerToken: process.env.X_BEARER_TOKEN || '',
        accessToken: process.env.X_ACCESS_TOKEN || '',
        accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET || '',
        clientId: process.env.X_CLIENT_ID || '',
        clientSecret: process.env.X_CLIENT_SECRET || '',
    },

    // News APIs
    news: {
        newsDataApiKeys: (process.env.NEWSDATA_API_KEY || '').split(',').map(k => k.trim()).filter(k => k),
        gNewsApiKeys: (process.env.GNEWS_API_KEY || '').split(',').map(k => k.trim()).filter(k => k),
    },

    // AI Provider
    ai: {
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        mistralApiKey: process.env.MISTRAL_API_KEY || '',
    },

    // App Settings
    app: {
        tweetIntervalMinutes: parseInt(process.env.TWEET_INTERVAL_MINUTES || '85', 10),
        maxReflexionIterations: parseInt(process.env.MAX_REFLEXION_ITERATIONS || '3', 10),
        logLevel: process.env.LOG_LEVEL || 'info',
    },

    // Bot Configuration - FLEXIBLE FOR ANY CATEGORY
    bot: {
        // Active category: cricket, football, technology, indian-news, international-news, etc.
        activeCategory: (process.env.ACTIVE_CATEGORY || 'cricket') as NewsCategory,
        // Bot display name for tweets
        botName: process.env.BOT_NAME || 'HourlySignal',
        // Emoji for tweets
        botEmoji: process.env.BOT_EMOJI || '📰',
        // Custom hashtags (comma-separated)
        customHashtags: (process.env.CUSTOM_HASHTAGS || '#News #Breaking').split(',').map(h => h.trim()),
    },
};

// Validate required config
export function validateConfig(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    // Check Twitter keys
    if (!config.twitter.apiKey) missing.push('X_API_KEY');
    if (!config.twitter.apiSecret) missing.push('X_API_SECRET');
    if (!config.twitter.accessToken) missing.push('X_ACCESS_TOKEN');
    if (!config.twitter.accessTokenSecret) missing.push('X_ACCESS_TOKEN_SECRET');

    // Check News API keys
    if (config.news.newsDataApiKeys.length === 0) missing.push('NEWSDATA_API_KEY');
    if (config.news.gNewsApiKeys.length === 0) missing.push('GNEWS_API_KEY');

    // Check AI keys (at least one required)
    if (!config.ai.openaiApiKey && !config.ai.geminiApiKey) {
        missing.push('OPENAI_API_KEY or GEMINI_API_KEY');
    }

    return {
        valid: missing.length === 0,
        missing,
    };
}

export default config;
