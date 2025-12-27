import axios, { AxiosInstance } from 'axios';
import config from '../../config';
import { NewsArticle, NewsCategory, INewsFetcher } from '../../types';
import { log } from '../../utils/logger';

/**
 * GNews API Service
 * Secondary news source for backup and diversity
 * Free tier: 100 requests/day
 */
export class GNewsService implements INewsFetcher {
    private client: AxiosInstance;
    private baseUrl = 'https://gnews.io/api/v4';
    private apiKeys: string[];
    private currentKeyIndex = 0;

    constructor() {
        this.apiKeys = config.news.gNewsApiKeys;
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
        });
    }

    private exhaustedKeys: Set<string> = new Set();

    private async request(endpoint: string, params: any): Promise<any> {
        let attempts = 0;

        // Loop until we find a working key or run out of keys
        while (attempts < this.apiKeys.length) {
            const apiKey = this.apiKeys[this.currentKeyIndex];

            // Skip known exhausted keys
            if (this.exhaustedKeys.has(apiKey)) {
                log.warn(`Skipping exhausted GNews Key ${this.currentKeyIndex + 1}...`);
                this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
                attempts++; // Count this as an attempt (skipped)
                continue;
            }

            // Retry loop for QPS limits (same key)
            for (let retry = 0; retry < 3; retry++) {
                try {
                    const response = await this.client.get(endpoint, {
                        params: {
                            apikey: apiKey,
                            ...params,
                        },
                    });
                    return response.data;
                } catch (error: any) {
                    const status = error.response?.status;
                    const data = error.response?.data;
                    const message = data?.message || data?.errors?.[0] || error.message || 'Unknown';

                    // Check for QPS Limit (429 or "short period")
                    const isQpsLimit = status === 429 || (status === 403 && message.includes('short period'));

                    if (isQpsLimit) {
                        log.warn(`⏳ GNews QPS Limit (Key ${this.currentKeyIndex + 1}). Waiting 2s... (Retry ${retry + 1}/3)`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        continue; // Retry same key
                    }

                    // Check for Daily Limit / Invalid Key
                    const isDailyLimit = status === 401 || (status === 403 && message.includes('request limit'));

                    if (isDailyLimit) {
                        log.warn(`⚠️ GNews Key ${this.currentKeyIndex + 1} exhausted. Marking as dead for today. Reason: ${message}`);
                        this.exhaustedKeys.add(apiKey); // Mark as exhausted
                        // Break retry loop to rotate key
                        break;
                    }

                    throw error; // Other fatal error
                }
            }

            // If we broke out of retry loop (Daily Limit) or exhausted retries:
            // Rotate key and continue outer loop
            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
            attempts++;
        }
        throw new Error('All GNews API keys exhausted');
    }

    /**
     * Fetch news articles from GNews
     */
    async fetchNews(category: NewsCategory, limit: number = 5): Promise<NewsArticle[]> {
        try {
            const params = this.buildParams(category);

            log.api('GNews', '/top-headlines', 0);

            const data = await this.request('/top-headlines', {
                ...params,
                max: limit,
            });

            log.api('GNews', '/top-headlines', 200);
            log.news('Fetched articles from GNews', category, {
                count: data.articles?.length || 0
            });

            return this.transformArticles(data.articles || [], category);
        } catch (error: any) {
            log.error('GNews fetch failed', {
                category,
                error: error.message
            });
            return [];
        }
    }

    /**
     * Search for specific news (useful for YouTuber news)
     */
    async searchNews(query: string, category: NewsCategory, limit: number = 5): Promise<NewsArticle[]> {
        try {
            log.api('GNews', '/search', 0);

            const data = await this.request('/search', {
                q: query,
                lang: 'en',
                max: limit,
                sortby: 'publishedAt'
            });

            log.api('GNews', '/search', 200);
            const articles = data.articles || [];

            return this.transformArticles(articles, category);
        } catch (error: any) {
            log.error('GNews search failed', {
                category,
                query,
                error: error.message
            });
            return [];
        }
    }

    /**
     * Build query parameters based on category
     */
    private buildParams(category: NewsCategory): Record<string, string> {
        switch (category) {
            case 'indian-news':
                return {
                    country: 'in',
                    lang: 'en',
                    topic: 'nation',
                };

            case 'international-news':
                return {
                    country: 'us',
                    lang: 'en',
                    topic: 'world',
                };

            case 'indian-sports':
                return {
                    country: 'in',
                    lang: 'en',
                    topic: 'sports',
                };

            case 'international-sports':
                return {
                    country: 'us',
                    lang: 'en',
                    topic: 'sports',
                };

            case 'football':
                return {
                    lang: 'en',
                    q: 'football OR soccer OR premier league OR La Liga OR Champions League',
                };

            case 'cricket':
                // Simple query for reliability
                return {
                    lang: 'en',
                    q: 'cricket IPL Ashes',
                };

            case 'indian-youtuber':
                return {
                    country: 'in',
                    lang: 'en',
                    topic: 'entertainment',
                };

            case 'international-youtuber':
                return {
                    country: 'us',
                    lang: 'en',
                    topic: 'entertainment',
                };

            case 'technology':
                return {
                    lang: 'en',
                    topic: 'technology',
                };

            default:
                return {
                    lang: 'en',
                    topic: 'breaking-news',
                };
        }
    }

    /**
     * Transform API response to NewsArticle format
     */
    private transformArticles(articles: any[], category: NewsCategory): NewsArticle[] {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;

        return articles
            .map((article: any) => ({
                title: article.title || '',
                description: article.description || '',
                content: article.content || '',
                source: article.source?.name || 'Unknown',
                sourceUrl: article.source?.url || '',
                url: article.url || '',
                imageUrl: article.image || '',
                publishedAt: new Date(article.publishedAt || Date.now()),
                category,
            }))
            .filter(article => article.publishedAt.getTime() > cutoff);
    }
}

export default GNewsService;
