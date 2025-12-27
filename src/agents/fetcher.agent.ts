import { NewsArticle, NewsCategory, INewsFetcher } from '../types';
import { NewsDataService } from '../services/news/newsdata.service';
import { GNewsService } from '../services/news/gnews.service';
import { log } from '../utils/logger';
import { getSheetConfig } from '../services/config/sheets.service';
import { getBeastMode, BeastModeAI } from '../services/ai/beast-mode.service';

export class FetcherAgent {
    private newsDataService: NewsDataService;
    private gNewsService: GNewsService;
    private ai: BeastModeAI;

    constructor() {
        this.newsDataService = new NewsDataService();
        this.gNewsService = new GNewsService();
        this.ai = getBeastMode();
    }

    async fetch(category: NewsCategory, limit: number = 10): Promise<NewsArticle[]> {
        log.news('Fetching started', category, { limit });

        let optimizedQuery: string | undefined;
        try {
            optimizedQuery = await this.ai.generateSearchQuery(category);
            log.info(`[NEWS] AI optimized query for ${category}: "${optimizedQuery}"`);
        } catch (err) {
            log.warn('AI query optimization failed, using raw category');
        }

        let [newsDataArticles, gNewsArticles] = await Promise.all([
            this.newsDataService.fetchNews(category, limit, optimizedQuery),
            this.gNewsService.fetchNews(category, limit, optimizedQuery),
        ]);

        // Failover: If optimized query returned 0 from BOTH, retry with raw category
        if (newsDataArticles.length === 0 && gNewsArticles.length === 0 && optimizedQuery) {
            log.warn(`[NEWS] Optimized query "${optimizedQuery}" returned nothing. Retrying with raw category "${category}"...`);
            [newsDataArticles, gNewsArticles] = await Promise.all([
                this.newsDataService.fetchNews(category, limit),
                this.gNewsService.fetchNews(category, limit),
            ]);
        }

        log.news('Fetched from sources', category, {
            newsData: newsDataArticles.length,
            gNews: gNewsArticles.length,
        });

        const merged = this.mergeAndDeduplicate([...newsDataArticles, ...gNewsArticles]);

        const sorted = this.sortByRecency(merged).slice(0, limit);

        log.news('Fetch complete', category, {
            total: sorted.length,
            sources: this.getUniqueSources(sorted),
        });

        return sorted;
    }

    async fetchAll(limit: number = 5): Promise<Map<NewsCategory, NewsArticle[]>> {
        const config = await getSheetConfig().getConfig();
        const categories = config.activeCategories;

        const results = new Map<NewsCategory, NewsArticle[]>();

        for (const category of categories) {
            const articles = await this.fetch(category, limit);
            results.set(category, articles);

            await this.delay(500);
        }

        return results;
    }

    private mergeAndDeduplicate(articles: NewsArticle[]): NewsArticle[] {
        const seen = new Set<string>();
        const unique: NewsArticle[] = [];

        for (const article of articles) {
            const key = this.normalizeTitle(article.title);

            if (!seen.has(key) && article.title && article.title.length > 10) {
                seen.add(key);
                unique.push(article);
            }
        }

        return unique;
    }

    private normalizeTitle(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 50);
    }

    private sortByRecency(articles: NewsArticle[]): NewsArticle[] {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;

        return articles.sort((a, b) => {
            const aFresh = a.publishedAt.getTime() > oneHourAgo;
            const bFresh = b.publishedAt.getTime() > oneHourAgo;

            // Priority: under 1 hour first
            if (aFresh && !bFresh) return -1;
            if (!aFresh && bFresh) return 1;

            // Then sort by recency
            return b.publishedAt.getTime() - a.publishedAt.getTime();
        });
    }

    private getUniqueSources(articles: NewsArticle[]): string[] {
        return [...new Set(articles.map(a => a.source))];
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default FetcherAgent;
