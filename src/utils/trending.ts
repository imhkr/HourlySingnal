import googleTrends from 'google-trends-api';
import { log } from './logger';

/**
 * Fetch real-time trending topics using Google Trends API
 * 100% legal, free, no API key needed
 */
export async function fetchTrendingTopics(): Promise<string[]> {
    try {
        // Fetch real-time trending searches for India
        const response = await googleTrends.realTimeTrends({
            geo: 'IN',  // India
            category: 'all'
        });

        const data = JSON.parse(response);
        const trends: string[] = [];

        // Extract trending topics
        if (data.storySummaries && data.storySummaries.trendingStories) {
            const stories = data.storySummaries.trendingStories.slice(0, 5);

            for (const story of stories) {
                if (story.entityNames && story.entityNames.length > 0) {
                    // Get first entity name and convert to hashtag
                    const topic = story.entityNames[0]
                        .replace(/\s+/g, '')  // Remove spaces
                        .replace(/[^a-zA-Z0-9]/g, '');  // Remove special chars

                    if (topic.length > 2) {
                        trends.push(`#${topic}`);
                    }
                }
            }
        }

        // Get top 3 unique
        const uniqueTrends = [...new Set(trends)].slice(0, 3);

        log.info(`✅ Fetched ${uniqueTrends.length} trending topics from Google`, {
            trends: uniqueTrends
        });

        return uniqueTrends.length > 0 ? uniqueTrends : ['#India', '#News', '#Breaking'];
    } catch (error: any) {
        log.warn('Failed to fetch Google Trends, using fallback', {
            error: error.message
        });

        // Fallback to generic trending topics
        return ['#India', '#News', '#Breaking'];
    }
}

/**
 * Get trending hashtags for tweet (with caching)
 */
let cachedTrends: string[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export async function getTrendingHashtags(articleText?: string): Promise<string[]> {
    // Refresh cache if older than 30 mins
    const now = Date.now();
    if (now - lastFetchTime > CACHE_DURATION || cachedTrends.length === 0) {
        cachedTrends = await fetchTrendingTopics();
        lastFetchTime = now;
    }

    // If article text provided, try to match with trending
    if (articleText && cachedTrends.length > 0) {
        const lowerText = articleText.toLowerCase();
        for (const trend of cachedTrends) {
            const keyword = trend.replace('#', '').toLowerCase();
            if (lowerText.includes(keyword)) {
                return [trend];
            }
        }
    }

    // Return top trending or fallback
    return cachedTrends.length > 0 ? [cachedTrends[0]] : ['#News', '#Today'];
}
