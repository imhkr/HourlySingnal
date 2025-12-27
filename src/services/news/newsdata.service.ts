import axios, { AxiosInstance } from 'axios';
import config from '../../config';
import { NewsArticle, NewsCategory, INewsFetcher } from '../../types';
import { log } from '../../utils/logger';

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

    async fetchNews(category: NewsCategory, limit: number = 10, customQuery?: string): Promise<NewsArticle[]> {
        let attempts = 0;

        while (attempts < this.apiKeys.length) {
            try {
                const apiKey = this.apiKeys[this.currentKeyIndex];
                const params = this.buildParams(category, customQuery);

                log.api('NewsData.io', '/news', 0);

                log.info(`[NEWS] NewsData fetching { category: "${category}", limit: 10${customQuery ? ', query: "' + customQuery + '"' : ''} }`);

                const response = await this.client.get('/news', {
                    params: {
                        apikey: apiKey,
                        ...params,
                        size: 10,
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

    private buildParams(category: NewsCategory, customQuery?: string): any {
        if (customQuery) {
            return {
                language: 'en',
                q: customQuery,
            };
        }

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
                    q: category,
                    category: 'top',
                };
        }
    }

    private transformArticles(results: any[], category: NewsCategory): NewsArticle[] {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000; // Max 24 hours old

        const filtered = results
            .map((r: any) => {
                const pubDate = new Date(r.pubDate || Date.now());
                log.debug(`NewsData: "${r.title.slice(0, 30)}..." | Date: ${pubDate.toISOString()}`);
                return {
                    title: r.title,
                    description: r.description || '',
                    source: r.source_id || 'NewsData',
                    url: r.link,
                    publishedAt: pubDate,
                    category,
                };
            });

        const fresh = filtered.filter(a => a.publishedAt.getTime() > cutoff);

        if (filtered.length > 0 && fresh.length === 0) {
            const freshest = Math.max(...filtered.map(a => a.publishedAt.getTime()));
            const hoursOld = ((Date.now() - freshest) / (1000 * 60 * 60)).toFixed(1);
            log.warn(`⚠️ All NewsData articles for ${category} are stale. Freshest is ${hoursOld}h old (Max: 24h).`);
        }

        return fresh;
    }
}

export default NewsDataService;
