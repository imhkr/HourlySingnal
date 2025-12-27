import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../utils/logger';

/**
 * 🖼️ Pollinations.ai Image Generation Service - FREE & DYNAMIC
 */
export class ImageService {
    private readonly baseUrl = 'https://image.pollinations.ai/prompt';
    private readonly tempDir: string;

    constructor() {
        // Create temp directory for images
        this.tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Generate an AI image from prompt
     */
    async generateImage(prompt: string, category: string = 'news'): Promise<string | null> {
        try {
            // Enhance prompt based on category
            let enhancement = 'professional journalism, high quality, 4k, modern media aesthetic';

            const isSports = ['cricket', 'football', 'sports', 'tennis', 'nba'].some(s => category.toLowerCase().includes(s));
            if (isSports) {
                enhancement = `${category} action photography, dramatic stadium lighting, high quality, 4k, professional sports photo`;
            }

            const enhancedPrompt = `${prompt}, ${enhancement}`;
            const encodedPrompt = encodeURIComponent(enhancedPrompt);

            // Pollinations.ai generates image directly from URL
            const imageUrl = `${this.baseUrl}/${encodedPrompt}?width=1200&height=675&nologo=true`;

            log.info(`🖼️ Generating AI image for [${category}]...`);

            // Download the image
            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
            });

            // Save to temp file
            const filename = `img_${Date.now()}.jpg`;
            const filepath = path.join(this.tempDir, filename);

            fs.writeFileSync(filepath, response.data);
            log.info('✅ Image generated successfully');

            return filepath;
        } catch (error: any) {
            log.error('❌ Image generation failed', { error: error.message });
            return null;
        }
    }

    // Generates contextual image based on content - fully dynamic
    async generateNewsImage(content: string): Promise<string | null> {
        const lowerContent = content.toLowerCase();

        let prompt = 'news update, professional journalism, modern media';
        let category = 'news';

        // Detect content and generate appropriate image
        if (lowerContent.includes('cricket') || lowerContent.includes('ipl') || lowerContent.includes('ashes')) {
            prompt = 'Cricket stadium action, dramatic sports photography';
            category = 'cricket';
        } else if (lowerContent.includes('football') || lowerContent.includes('soccer') || lowerContent.includes('goal')) {
            prompt = 'Football match action, stadium crowd, sports moment';
            category = 'football';
        } else if (lowerContent.includes('tech') || lowerContent.includes('ai') || lowerContent.includes('software')) {
            prompt = 'Technology futuristic, digital innovation, modern aesthetic';
            category = 'technology';
        } else if (lowerContent.includes('business') || lowerContent.includes('stock') || lowerContent.includes('market')) {
            prompt = 'Business finance, professional corporate setting';
            category = 'finance';
        } else if (lowerContent.includes('roman') || lowerContent.includes('history') || lowerContent.includes('ancient')) {
            prompt = 'Ancient historical architecture, dramatic lighting, epic landscape';
            category = 'history';
        }

        return this.generateImage(prompt, category);
    }

    // Alias for backward compatibility
    async generateCricketImage(content: string): Promise<string | null> {
        return this.generateNewsImage(content);
    }

    /**
     * Clean up old temp images
     */
    cleanup(): void {
        try {
            if (!fs.existsSync(this.tempDir)) return;
            const files = fs.readdirSync(this.tempDir);
            for (const file of files) {
                if (file.endsWith('.jpg')) {
                    fs.unlinkSync(path.join(this.tempDir, file));
                }
            }
        } catch (error: any) {
            log.error('Cleanup failed');
        }
    }
}

export default ImageService;
