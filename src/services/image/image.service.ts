import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../utils/logger';

/**
 * 🖼️ Pollinations.ai Image Generation Service
 * 
 * FREE image generation - no API key needed!
 * Generates cricket-themed images for tweets
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
     * Generate a cricket-themed image from prompt
     * Returns the local file path of the generated image
     */
    async generateImage(prompt: string): Promise<string | null> {
        try {
            // Enhance prompt for cricket aesthetic
            const enhancedPrompt = `${prompt}, cricket sports photography, dramatic lighting, high quality, 4k, professional sports photo`;

            // URL encode the prompt
            const encodedPrompt = encodeURIComponent(enhancedPrompt);

            // Pollinations.ai generates image directly from URL
            const imageUrl = `${this.baseUrl}/${encodedPrompt}?width=1200&height=675&nologo=true`;

            log.info('🖼️ Generating cricket image...', { prompt: prompt.slice(0, 50) });

            // Download the image
            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000, // 60 second timeout for image generation
            });

            // Save to temp file
            const filename = `cricket_${Date.now()}.jpg`;
            const filepath = path.join(this.tempDir, filename);

            fs.writeFileSync(filepath, response.data);

            log.info('✅ Image generated successfully', { filepath });

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

        // Detect content and generate appropriate image
        if (lowerContent.includes('cricket') || lowerContent.includes('ipl') || lowerContent.includes('ashes')) {
            prompt = 'Cricket stadium action, dramatic sports photography';
        } else if (lowerContent.includes('football') || lowerContent.includes('soccer') || lowerContent.includes('goal')) {
            prompt = 'Football match action, stadium crowd, sports moment';
        } else if (lowerContent.includes('tech') || lowerContent.includes('ai') || lowerContent.includes('software')) {
            prompt = 'Technology futuristic, digital innovation, modern aesthetic';
        } else if (lowerContent.includes('business') || lowerContent.includes('stock') || lowerContent.includes('market')) {
            prompt = 'Business finance, professional corporate setting';
        } else if (lowerContent.includes('india') || lowerContent.includes('delhi') || lowerContent.includes('mumbai')) {
            prompt = 'India cityscape, modern urban, news journalism';
        } else if (lowerContent.includes('politics') || lowerContent.includes('election')) {
            prompt = 'Politics government, official setting, news media';
        } else if (lowerContent.includes('roman') || lowerContent.includes('history') || lowerContent.includes('ancient')) {
            prompt = 'Ancient Roman architecture, historical, dramatic lighting';
        } else if (lowerContent.includes('movie') || lowerContent.includes('film') || lowerContent.includes('entertainment')) {
            prompt = 'Entertainment industry, cinema, red carpet glamour';
        } else if (lowerContent.includes('health') || lowerContent.includes('medical') || lowerContent.includes('doctor')) {
            prompt = 'Healthcare medical, modern hospital, professional';
        }

        return this.generateImage(prompt);
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
            const files = fs.readdirSync(this.tempDir);
            for (const file of files) {
                if (file.startsWith('cricket_')) {
                    fs.unlinkSync(path.join(this.tempDir, file));
                }
            }
            log.info('🧹 Cleaned up temp images');
        } catch (error) {
            // Ignore cleanup errors
        }
    }
}

export default ImageService;
