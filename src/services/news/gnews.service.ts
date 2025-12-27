import axios, { AxiosInstance } from 'axios';
import config from '../../config';
import { NewsArticle, NewsCategory, INewsFetcher } from '../../types';
import { log } from '../../utils/logger';

// Secondary news source with automatic key rotation
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

        while (attempts < this.apiKeys.length) {
            const apiKey = this.apiKeys[this.currentKeyIndex];

            if (this.exhaustedKeys.has(apiKey)) {
                log.warn(`Skipping exhausted GNews Key ${this.currentKeyIndex + 1}...`);
                this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
                attempts++; // Count this as an attempt (skipped)
                continue;
            }

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

                    const isQpsLimit = status === 429 || (status === 403 && message.includes('short period'));

                    if (isQpsLimit) {
                        log.warn(`⏳ GNews QPS Limit (Key ${this.currentKeyIndex + 1}). Waiting 2s... (Retry ${retry + 1}/3)`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        continue; // Retry same key
                    }

                    const isDailyLimit = status === 401 || (status === 403 && message.includes('request limit'));

                    if (isDailyLimit) {
                        log.warn(`⚠️ GNews Key ${this.currentKeyIndex + 1} exhausted. Marking as dead for today. Reason: ${message}`);
                        this.exhaustedKeys.add(apiKey); // Mark as exhausted
                        // Break retry loop to rotate key
                        break;
                    }

                    throw error;
                }
            }

            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
            attempts++;
        }
        throw new Error('All GNews API keys exhausted');
    }

    async fetchNews(category: NewsCategory, limit: number = 10, customQuery?: string): Promise<NewsArticle[]> {
        try {
            const params = this.buildParams(category, customQuery);
            const safeLimit = Math.min(limit, 10); // GNews free tier limit is 10

            log.info(`[NEWS] GNews fetching { category: "${category}", limit: ${safeLimit}${customQuery ? ', query: "' + customQuery + '"' : ''} }`);

            const endpoint = (params.q || customQuery) ? '/search' : '/top-headlines';
            const data = await this.request(endpoint, {
                ...params,
                max: safeLimit,
            });

            log.api('GNews', endpoint, 200);
            log.news('Fetched articles from GNews', category, {
                count: data.articles?.length || 0
            });

            return this.transformArticles(data.articles || [], category);
        } catch (error: any) {
            log.error('GNews fetch failed', {
                category,
                error: error.message,
                customQuery
            });
            return [];
        }
    }

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

    private buildParams(category: NewsCategory, customQuery?: string): any {
        if (customQuery) {
            return {
                lang: 'en',
                q: customQuery,
            };
        }

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
                return {
                    lang: 'en',
                    q: 'cricket',
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
                    q: category,
                };
        }
    }

    private transformArticles(articles: any[], category: NewsCategory): NewsArticle[] {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000; // Max 24 hours old

        const mapped = articles
            .map((article: any) => {
                const pubDate = new Date(article.publishedAt || Date.now());
                log.debug(`GNews: "${article.title.slice(0, 30)}..." | Date: ${pubDate.toISOString()}`);
                return {
                    title: article.title || '',
                    description: article.description || '',
                    content: article.content || '',
                    source: article.source?.name || 'Unknown',
                    sourceUrl: article.source?.url || '',
                    url: article.url || '',
                    imageUrl: article.image || '',
                    publishedAt: pubDate,
                    category,
                };
            });

        const fresh = mapped.filter(article => article.publishedAt.getTime() > cutoff);

        if (mapped.length > 0 && fresh.length === 0) {
            const freshest = Math.max(...mapped.map(a => a.publishedAt.getTime()));
            const hoursOld = ((Date.now() - freshest) / (1000 * 60 * 60)).toFixed(1);
            log.warn(`⚠️ All GNews articles for ${category} are stale. Freshest is ${hoursOld}h old (Max: 24h).`);
        }

        return fresh;
    }
}

export default GNewsService;
