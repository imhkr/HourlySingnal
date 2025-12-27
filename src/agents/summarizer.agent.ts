import { NewsArticle, NewsCategory, NewsSummary, EvaluationResult } from '../types';
import { getBeastMode, BeastModeAI } from '../services/ai/beast-mode.service';
import { log } from '../utils/logger';

/**
 * Summarizer Agent - Uses Beast Mode AI
 */
export class SummarizerAgent {
    private ai: BeastModeAI;

    constructor() {
        this.ai = getBeastMode();
    }

    async summarize(articles: NewsArticle[], maxChars: number = 180): Promise<NewsSummary> {
        if (articles.length === 0) {
            return {
                category: 'indian-news',
                oneLiner: 'No news available at this time.',
                sources: [],
                articles: [],
            };
        }

        const category = articles[0].category;
        log.info(`📝 Summarizing ${articles.length} articles for ${category}`);

        const articlesForAI = articles.map(a => ({
            title: a.title,
            description: a.description || a.title,
            source: a.source,
        }));

        try {
            const oneLiner = await this.ai.summarize(articlesForAI, maxChars);
            const cleanSummary = oneLiner
                .replace(/^["']|["']$/g, '')
                .replace(/\n/g, ' ')
                .trim();

            log.info(`✅ Summary: "${cleanSummary.slice(0, 50)}..."`);

            return {
                category,
                oneLiner: cleanSummary,
                sources: [...new Set(articles.map(a => a.source))],
                articles,
            };
        } catch (error: any) {
            log.error('Summarization failed', { error: error.message });
            return {
                category,
                oneLiner: articles[0].title.slice(0, 80),
                sources: [articles[0].source],
                articles,
            };
        }
    }
}

/**
 * Evaluator Agent - Uses Beast Mode AI
 */
export class EvaluatorAgent {
    private ai: BeastModeAI;

    constructor() {
        this.ai = getBeastMode();
    }

    async evaluate(summary: NewsSummary): Promise<EvaluationResult> {
        log.info(`📊 Evaluating summary for ${summary.category}`);

        const articlesForEval = summary.articles.map((a: NewsArticle) => ({
            title: a.title,
            description: a.description || '',
        }));

        const result = await this.ai.evaluate(summary.oneLiner, articlesForEval);
        log.reflexion(0, result.score, result.passed);

        return {
            passed: result.passed,
            score: result.score,
            feedback: result.feedback,
            criteria: {
                accuracy: result.score,
                engagement: result.score,
                conciseness: result.score,
                attribution: result.score,
            },
        };
    }
}

/**
 * Refiner Agent - Uses Beast Mode AI
 */
export class RefinerAgent {
    private ai: BeastModeAI;

    constructor() {
        this.ai = getBeastMode();
    }

    async refine(
        summary: NewsSummary,
        feedback: string,
        previousFeedback: string[] = []
    ): Promise<NewsSummary> {
        log.info(`🔧 Refining summary for ${summary.category}`);

        const articlesText = summary.articles
            .slice(0, 3)
            .map((a: NewsArticle) => a.title)
            .join('; ');

        const prompt = `Improve this news summary based on feedback.
Make it sound natural and human-written.

Current: "${summary.oneLiner}"
News: ${articlesText}
Feedback: ${feedback}

Better summary (max 180 chars):`;

        try {
            const refined = await this.ai.generate(prompt);
            const cleanRefined = refined
                .replace(/^["']|["']$/g, '')
                .trim();

            return { ...summary, oneLiner: cleanRefined };
        } catch (error: any) {
            log.error('Refinement failed');
            return summary;
        }
    }
}

/**
 * Headline Agent - Uses Beast Mode AI
 */
export class HeadlineAgent {
    private ai: BeastModeAI;

    constructor() {
        this.ai = getBeastMode();
    }

    async generate(summaries: Map<NewsCategory, string>): Promise<string> {
        log.info('📰 Generating headline');

        try {
            const headline = await this.ai.generateHeadline(summaries);
            log.info(`✅ Headline: "${headline}"`);
            return headline;
        } catch (error: any) {
            const time = new Date().toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit'
            });
            return `🔥 HourlySignal | ${time}`;
        }
    }
}
