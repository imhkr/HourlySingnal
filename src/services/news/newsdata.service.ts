import axios, { AxiosInstance } from 'axios';
import config from '../../config';
import { NewsArticle, NewsCategory, INewsFetcher } from '../../types';
import { log } from '../../utils/logger';

/**
 * NewsData.io API Service
 * Primary news source for Indian and International news
 * Free tier: 200 requests/day
 */
export class NewsDataService implements INewsFetcher {
    private client: AxiosInstance;
    private baseUrl = 'https://newsdata.io/api/1';
    private apiKeys: string[];
    private currentKeyIndex = 0;

    constructor() {
        this.apiKeys = config.news.newsDataApiKeys;
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
        });
    }

    /**
     * Fetch news articles from NewsData.io
     */
    async fetchNews(category: NewsCategory, limit: number = 5): Promise<NewsArticle[]> {
        let attempts = 0;

        while (attempts < this.apiKeys.length) {
            try {
                const apiKey = this.apiKeys[this.currentKeyIndex];
                const params = this.buildParams(category);

                log.api('NewsData.io', '/news', 0);

                const response = await this.client.get('/news', {
                    params: {
                        apikey: apiKey,
                        ...params,
                        size: limit,
                    },
                });

                if (response.data.status !== 'success') {
                    // Check for rate limit error message
                    if (response.data.results?.code === 'RateLimitExceeded' ||
                        response.data.message?.includes('limit') ||
                        response.data.message?.includes('Credit')) {
                        throw new Error('RateLimitExceeded');
                    }
                    throw new Error(`NewsData API error: ${response.data.message}`);
                }

                log.api('NewsData.io', '/news', 200);
                log.news('Fetched articles', category, { count: response.data.results?.length || 0 });

                return this.transformArticles(response.data.results || [], category);
            } catch (error: any) {
                const isRateLimit = error.message === 'RateLimitExceeded' ||
                    error.response?.status === 401 ||
                    error.response?.status === 403 ||
                    error.response?.status === 429;

                if (isRateLimit) {
                    log.warn(`⚠️ NewsData Key ${this.currentKeyIndex + 1}/${this.apiKeys.length} exhausted. Rotating...`);
                    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
                    attempts++;
                    continue;
                }

                log.error('NewsData.io fetch failed', {
                    category,
                    error: error.message
                });
                return [];
            }
        }

        log.error('❌ All NewsData API keys exhausted!');
        return [];
    }

    /**
     * Build query parameters based on category
     */
    private buildParams(category: NewsCategory): Record<string, string> {
        switch (category) {
            case 'indian-news':
                return {
                    country: 'in',
                    language: 'en',
                    category: 'top',
                };

            case 'international-news':
                return {
                    country: 'us,gb,au',
                    language: 'en',
                    category: 'world',
                };

            case 'indian-sports':
                return {
                    country: 'in',
                    language: 'en',
                    category: 'sports',
                };

            case 'international-sports':
                return {
                    country: 'us,gb',
                    language: 'en',
                    category: 'sports',
                };

            case 'football':
                return {
                    language: 'en',
                    q: 'football OR soccer OR premier league OR champions league OR FIFA OR messi OR ronaldo',
                    category: 'sports',
                };

            case 'cricket':
                // Simple query to avoid 422 error
                return {
                    language: 'en',
                    q: 'cricket',
                    category: 'sports',
                };

            case 'indian-youtuber':
                return {
                    country: 'in',
                    language: 'en',
                    q: 'youtuber OR influencer OR content creator',
                    category: 'entertainment',
                };

            case 'international-youtuber':
                return {
                    country: 'us',
                    language: 'en',
                    q: 'youtuber OR influencer OR content creator',
                    category: 'entertainment',
                };

            case 'technology':
                return {
                    language: 'en',
                    category: 'technology',
                };

            default:
                return {
                    language: 'en',
                    category: 'top',
                };
        }
    }

    /**
     * Transform API response to NewsArticle format
     */
    private transformArticles(results: any[], category: NewsCategory): NewsArticle[] {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;

        return results
            .map((r: any) => ({
                title: r.title,
                description: r.description || '',
                source: r.source_id || 'NewsData',
                url: r.link, // 'link' is the correct property for NewsData, not 'url'
                publishedAt: new Date(r.pubDate || Date.now()),
                category,
            }))
            .filter(a => a.publishedAt.getTime() > cutoff);
    }
}

export default NewsDataService;
