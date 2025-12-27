// News Article Interface - Unified format for all news sources
export interface NewsArticle {
    title: string;
    description: string;
    content?: string;
    source: string;
    sourceUrl?: string;
    url: string;
    imageUrl?: string;
    publishedAt: Date;
    category: NewsCategory;
}

// News Categories - Including dedicated Football & Cricket
export type NewsCategory =
    | 'indian-news'
    | 'international-news'
    | 'indian-sports'
    | 'international-sports'
    | 'football'        // Dedicated worldwide football
    | 'cricket'         // Dedicated worldwide cricket
    | 'technology'      // New: Tech news
    | 'indian-youtuber'
    | 'international-youtuber'
    | 'custom';         // New: Custom topic mode

// Category Display Names
export const CategoryDisplayNames: Record<NewsCategory, string> = {
    'indian-news': '🇮🇳 India',
    'international-news': '🌍 World',
    'indian-sports': '🏏 Sports IN',
    'international-sports': '⚽ Sports Intl',
    'football': '⚽ Football',
    'cricket': '🏏 Cricket',
    'indian-youtuber': '🎬 YT India',
    'international-youtuber': '🎥 YT Global',
    'technology': '💻 Tech',
    'custom': '✨ Custom',
};

// Category Emojis for tweets
export const CategoryEmojis: Record<NewsCategory, string> = {
    'indian-news': '🇮🇳',
    'international-news': '🌍',
    'indian-sports': '🏏',
    'international-sports': '⚽',
    'football': '⚽',
    'cricket': '🏏',
    'indian-youtuber': '🎬',
    'international-youtuber': '🎥',
    'technology': '💻',
    'custom': '✨',
};

// News Fetcher Interface
export interface INewsFetcher {
    fetchNews(category: NewsCategory, limit: number): Promise<NewsArticle[]>;
}

// Summary with Evaluation
export interface NewsSummary {
    category: NewsCategory;
    oneLiner: string;
    sources: string[];
    articles: NewsArticle[];
}

// Evaluation Result
export interface EvaluationResult {
    passed: boolean;
    score: number;
    feedback: string;
    criteria: {
        accuracy: number;
        engagement: number;
        conciseness: number;
        attribution: number;
    };
}

// Mega Tweet Structure
export interface MegaTweet {
    headline: string;
    summaries: Map<NewsCategory, string>;
    opinion?: string;
    timestamp: Date;
    characterCount: number;
    isThread: boolean;
    tweets: string[];
}

// Reflexion Memory Entry
export interface ReflexionMemory {
    timestamp: Date;
    category: NewsCategory;
    originalSummary: string;
    feedback: string;
    refinedSummary: string;
    improvement: number;
}
