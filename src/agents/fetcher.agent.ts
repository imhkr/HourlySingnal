import { NewsArticle, NewsCategory, INewsFetcher } from '../types';
import { NewsDataService } from '../services/news/newsdata.service';
import { GNewsService } from '../services/news/gnews.service';
import { log } from '../utils/logger';

/**
 * Fetcher Agent
 * Aggregates news from multiple sources and deduplicates
 */
export class FetcherAgent {
    private newsDataService: NewsDataService;
    private gNewsService: GNewsService;

    constructor() {
        this.newsDataService = new NewsDataService();
        this.gNewsService = new GNewsService();
    }

    /**
     * Fetch news from multiple sources and merge
     */
    async fetch(category: NewsCategory, limit: number = 5): Promise<NewsArticle[]> {
        log.news('Fetching started', category, { limit });

        // Fetch from both sources in parallel
        const [newsDataArticles, gNewsArticles] = await Promise.all([
            this.newsDataService.fetchNews(category, limit),
            this.gNewsService.fetchNews(category, limit),
        ]);

        log.news('Fetched from sources', category, {
            newsData: newsDataArticles.length,
            gNews: gNewsArticles.length,
        });

        // Merge and deduplicate
        const merged = this.mergeAndDeduplicate([...newsDataArticles, ...gNewsArticles]);

        // Sort by recency and take top N
        const sorted = this.sortByRecency(merged).slice(0, limit);

        log.news('Fetch complete', category, {
            total: sorted.length,
            sources: this.getUniqueSources(sorted),
        });

        return sorted;
    }

    /**
     * Fetch news for all categories
     */
    async fetchAll(limit: number = 5): Promise<Map<NewsCategory, NewsArticle[]>> {
        const categories: NewsCategory[] = [
            'indian-news',
            'international-news',
            'indian-sports',
            'international-sports',
            'indian-youtuber',
            'international-youtuber',
        ];

        const results = new Map<NewsCategory, NewsArticle[]>();

        // Fetch sequentially to avoid rate limiting
        for (const category of categories) {
            const articles = await this.fetch(category, limit);
            results.set(category, articles);

            // Small delay between categories
            await this.delay(500);
        }

        return results;
    }

    /**
     * Merge articles and remove duplicates based on title similarity
     */
    private mergeAndDeduplicate(articles: NewsArticle[]): NewsArticle[] {
        const seen = new Set<string>();
        const unique: NewsArticle[] = [];

        for (const article of articles) {
            // Create a normalized key from the title
            const key = this.normalizeTitle(article.title);

            if (!seen.has(key) && article.title && article.title.length > 10) {
                seen.add(key);
                unique.push(article);
            }
        }

        return unique;
    }

    /**
     * Normalize title for deduplication
     */
    private normalizeTitle(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 50); // First 50 chars for matching
    }

    /**
     * Sort articles by publish date (most recent first)
     */
    private sortByRecency(articles: NewsArticle[]): NewsArticle[] {
        return articles.sort((a, b) =>
            b.publishedAt.getTime() - a.publishedAt.getTime()
        );
    }

    /**
     * Get unique sources from articles
     */
    private getUniqueSources(articles: NewsArticle[]): string[] {
        return [...new Set(articles.map(a => a.source))];
    }

    /**
     * Helper delay function
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default FetcherAgent;
