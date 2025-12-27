import { GeminiService } from './gemini.service';
import { MistralService } from './mistral.service';
import config from '../../config';
import { log } from '../../utils/logger';

/**
 * Unified AI Service
 * Tries Gemini first, falls back to Mistral if Gemini fails
 * This ensures maximum uptime even when one provider has issues
 */
export class AIService {
    private gemini: GeminiService | null = null;
    private mistral: MistralService | null = null;
    private preferredProvider: 'gemini' | 'mistral' = 'gemini';

    constructor() {
        // Initialize available providers
        if (config.ai.geminiApiKey) {
            this.gemini = new GeminiService();
            log.info('✅ Gemini AI initialized');
        }

        if (config.ai.mistralApiKey) {
            this.mistral = new MistralService();
            log.info('✅ Mistral AI initialized (backup)');
        }

        if (!this.gemini && !this.mistral) {
            throw new Error('No AI provider configured! Add GEMINI_API_KEY or MISTRAL_API_KEY to .env');
        }
    }

    /**
     * Generate with fallback
     */
    async generate(prompt: string): Promise<string> {
        // Try preferred provider first
        if (this.preferredProvider === 'gemini' && this.gemini) {
            try {
                return await this.gemini.generate(prompt);
            } catch (error: any) {
                log.warn('Gemini failed, trying Mistral...', { error: error.message });

                if (this.mistral) {
                    return await this.mistral.generate(prompt);
                }
                throw error;
            }
        }

        // Try Mistral first if preferred
        if (this.preferredProvider === 'mistral' && this.mistral) {
            try {
                return await this.mistral.generate(prompt);
            } catch (error: any) {
                log.warn('Mistral failed, trying Gemini...', { error: error.message });

                if (this.gemini) {
                    return await this.gemini.generate(prompt);
                }
                throw error;
            }
        }

        // Fallback to any available provider
        if (this.gemini) {
            return await this.gemini.generate(prompt);
        }

        if (this.mistral) {
            return await this.mistral.generate(prompt);
        }

        throw new Error('No AI provider available');
    }

    /**
     * Summarize news with fallback
     */
    async summarizeNews(articles: { title: string; description: string; source: string }[]): Promise<string> {
        if (this.preferredProvider === 'gemini' && this.gemini) {
            try {
                return await this.gemini.summarizeNews(articles);
            } catch (error: any) {
                log.warn('Gemini summarize failed, trying Mistral...');

                if (this.mistral) {
                    return await this.mistral.summarizeNews(articles);
                }
                throw error;
            }
        }

        if (this.mistral) {
            return await this.mistral.summarizeNews(articles);
        }

        throw new Error('No AI provider available for summarization');
    }

    /**
     * Set preferred provider
     */
    setPreferredProvider(provider: 'gemini' | 'mistral'): void {
        this.preferredProvider = provider;
        log.info(`AI provider preference set to: ${provider}`);
    }

    /**
     * Get current status
     */
    getStatus(): { gemini: boolean; mistral: boolean; preferred: string } {
        return {
            gemini: this.gemini !== null,
            mistral: this.mistral !== null,
            preferred: this.preferredProvider,
        };
    }
}

// Singleton instance
let aiServiceInstance: AIService | null = null;

export function getAIService(): AIService {
    if (!aiServiceInstance) {
        aiServiceInstance = new AIService();
    }
    return aiServiceInstance;
}

export default AIService;
