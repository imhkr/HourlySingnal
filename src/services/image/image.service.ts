import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../utils/logger';

export class ImageService {
    private readonly baseUrl = 'https://image.pollinations.ai/prompt';
    private readonly tempDir: string;

    constructor() {
        this.tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async generateImage(prompt: string, category: string = 'news'): Promise<string | null> {
        try {
            let enhancement = 'professional journalism, high quality, 4k, modern media aesthetic';

            const isSports = ['cricket', 'football', 'sports', 'tennis', 'nba'].some(s => category.toLowerCase().includes(s));
            if (isSports) {
                enhancement = `${category} action photography, dramatic stadium lighting, high quality, 4k, professional sports photo`;
            }

            const enhancedPrompt = `${prompt}, ${enhancement}`;
            const encodedPrompt = encodeURIComponent(enhancedPrompt);

            const imageUrl = `${this.baseUrl}/${encodedPrompt}?width=1200&height=675&nologo=true`;

            log.info(`🖼️ Generating AI image for [${category}]...`);

            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
            });

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

    async generateNewsImage(content: string): Promise<string | null> {
        const lowerContent = content.toLowerCase();

        const moods = ['dramatic', 'cinematic', 'atmospheric', 'majestic', 'epic', 'stunning'][Math.floor(Math.random() * 6)];
        const times = ['golden hour', 'sunset', 'sunrise', 'dusk', 'dawn', 'twilight'][Math.floor(Math.random() * 6)];
        const angles = ['wide angle', 'aerial view', 'close-up detail', 'panoramic', 'ground level', 'bird eye view'][Math.floor(Math.random() * 6)];

        let prompt = `news update, professional journalism, modern media, ${moods}, ${times}`;
        let category = 'news';

        if (lowerContent.includes('cricket') || lowerContent.includes('ipl') || lowerContent.includes('ashes')) {
            prompt = `Cricket stadium action, ${moods} sports photography, ${times} lighting`;
            category = 'cricket';
        } else if (lowerContent.includes('football') || lowerContent.includes('soccer') || lowerContent.includes('goal')) {
            prompt = `Football match action, ${moods} stadium scene, ${times}`;
            category = 'football';
        } else if (lowerContent.includes('tech') || lowerContent.includes('ai') || lowerContent.includes('software')) {
            prompt = `Technology futuristic, ${moods} digital innovation, ${angles}`;
            category = 'technology';
        } else if (lowerContent.includes('business') || lowerContent.includes('stock') || lowerContent.includes('market')) {
            prompt = `Business finance, ${moods} corporate setting, ${times}`;
            category = 'finance';
        } else if (lowerContent.includes('roman') || lowerContent.includes('history') || lowerContent.includes('ancient') || lowerContent.includes('empire')) {
            prompt = `Ancient Roman ruins, ${moods} historical architecture, ${times}, ${angles}, epic landscape`;
            category = 'history';
        }

        return this.generateImage(prompt, category);
    }

    async generateImageByCategory(category: string): Promise<string | null> {
        const moods = ['dramatic', 'cinematic', 'atmospheric', 'majestic', 'epic', 'stunning'][Math.floor(Math.random() * 6)];
        const times = ['golden hour', 'sunset', 'sunrise', 'dusk', 'dawn', 'twilight'][Math.floor(Math.random() * 6)];
        const angles = ['wide angle', 'aerial view', 'close-up detail', 'panoramic', 'ground level', 'bird eye view'][Math.floor(Math.random() * 6)];

        const categoryLower = category.toLowerCase();
        let prompt = `news update, professional journalism, modern media, ${moods}, ${times}`;

        if (categoryLower.includes('cricket')) {
            prompt = `Cricket stadium action, cricket bat ball wicket, ${moods} sports photography, ${times} lighting`;
        } else if (categoryLower.includes('football')) {
            prompt = `Football match action, soccer stadium crowd, ${moods} sports scene, ${times}`;
        } else if (categoryLower.includes('technology')) {
            prompt = `Technology futuristic, ${moods} digital innovation, circuits and screens, ${angles}`;
        } else if (categoryLower.includes('sports')) {
            prompt = `Sports action, ${moods} athletic moment, ${times} lighting`;
        } else if (categoryLower.includes('indian-news')) {
            prompt = `India cityscape, ${moods} urban scene, ${times}, professional news`;
        } else if (categoryLower.includes('international')) {
            prompt = `World news, global cityscape, ${moods} international scene, ${times}`;
        }

        return this.generateImage(prompt, category);
    }

    async generateCricketImage(content: string): Promise<string | null> {
        return this.generateNewsImage(content);
    }

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
