import { NewsArticle, NewsCategory, INewsFetcher } from '../types';
import { NewsDataService } from '../services/news/newsdata.service';
import { GNewsService } from '../services/news/gnews.service';
import { log } from '../utils/logger';
import { getSheetConfig } from '../services/config/sheets.service';

export class FetcherAgent {
    private newsDataService: NewsDataService;
    private gNewsService: GNewsService;

    constructor() {
        this.newsDataService = new NewsDataService();
        this.gNewsService = new GNewsService();
    }

    async fetch(category: NewsCategory, limit: number = 5): Promise<NewsArticle[]> {
        log.news('Fetching started', category, { limit });

        const [newsDataArticles, gNewsArticles] = await Promise.all([
            this.newsDataService.fetchNews(category, limit),
            this.gNewsService.fetchNews(category, limit),
        ]);

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
        return articles.sort((a, b) =>
            b.publishedAt.getTime() - a.publishedAt.getTime()
        );
    }

    private getUniqueSources(articles: NewsArticle[]): string[] {
        return [...new Set(articles.map(a => a.source))];
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default FetcherAgent;
