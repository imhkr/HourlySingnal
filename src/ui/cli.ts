import inquirer from 'inquirer';
import chalk from 'chalk';
import { Pipeline } from '../orchestrator/pipeline';
import { Scheduler } from '../orchestrator/scheduler';
import { validateConfig } from '../config';
import { log } from '../utils/logger';
import { TwitterService } from '../services/social/twitter.service';

/**
 * CLI Interface for HourlySignal
 */
export class CLI {
    private pipeline: Pipeline;
    private scheduler: Scheduler;

    constructor() {
        this.pipeline = new Pipeline();
        this.scheduler = new Scheduler();
    }

    /**
     * Start the CLI
     */
    async start(): Promise<void> {
        console.log(chalk.cyan.bold('\n🔥 HourlySignal - Reflexion Pattern News Agent\n'));

        // Validate configuration
        const configStatus = validateConfig();
        if (!configStatus.valid) {
            console.log(chalk.red('❌ Missing configuration:'));
            configStatus.missing.forEach(key => {
                console.log(chalk.red(`   - ${key}`));
            });
            console.log(chalk.yellow('\n📝 Please update your .env file and try again.\n'));
            return;
        }

        console.log(chalk.green('✅ Configuration validated\n'));

        await this.showMainMenu();
    }

    /**
     * Show main menu
     */
    private async showMainMenu(): Promise<void> {
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: '▶️  Run now (Full Auto + AI Opinion)', value: 'run_auto' },
                    { name: '⏰ Start scheduler (automatic)', value: 'start_scheduler' },
                    { name: '🧪 Dry run (test without tweeting)', value: 'dry_run' },
                    { name: '🔑 Verify Twitter credentials', value: 'verify_twitter' },
                    { name: '❌ Exit', value: 'exit' },
                ],
            },
        ]);

        switch (action) {
            case 'run_with_opinion':
                await this.runWithOpinion();
                break;
            case 'run_auto':
                await this.runAuto();
                break;
            case 'start_scheduler':
                await this.startScheduler();
                break;
            case 'dry_run':
                await this.dryRun();
                break;
            case 'verify_twitter':
                await this.verifyTwitter();
                break;
            case 'exit':
                console.log(chalk.cyan('\n👋 Goodbye!\n'));
                process.exit(0);
        }

        // Return to menu
        await this.showMainMenu();
    }

    /**
     * Run pipeline with user opinion
     */
    private async runWithOpinion(): Promise<void> {
        console.log(chalk.cyan('\n📰 Fetching and summarizing news...\n'));

        // First do a dry run to show summaries
        const summaries = await this.pipeline.dryRun();

        console.log(chalk.cyan('\n📋 News Summaries:\n'));
        summaries.forEach((summary, category) => {
            console.log(chalk.white(`  ${category}: ${summary}`));
        });

        // Ask for opinion
        const { opinion } = await inquirer.prompt([
            {
                type: 'input',
                name: 'opinion',
                message: '💬 Enter your opinion (or press Enter to skip):',
            },
        ]);

        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: '🐦 Post to Twitter?',
                default: true,
            },
        ]);

        if (confirm) {
            console.log(chalk.yellow('\n⏳ Running full pipeline...\n'));
            const result = await this.pipeline.run(opinion || undefined);

            if (result.success) {
                console.log(chalk.green('✅ Tweet posted successfully!'));
                console.log(chalk.gray(`   Tweet IDs: ${result.tweetIds.join(', ')}`));
            } else {
                console.log(chalk.red('❌ Failed to post tweet'));
            }
        } else {
            console.log(chalk.yellow('⏭️  Skipped posting'));
        }
    }

    /**
     * Run pipeline automatically
     */
    private async runAuto(): Promise<void> {
        console.log(chalk.yellow('\n⏳ Running pipeline (no opinion)...\n'));

        const result = await this.pipeline.run();

        if (result.success) {
            console.log(chalk.green('\n✅ Tweet posted successfully!'));
            console.log(chalk.gray(`   Tweet IDs: ${result.tweetIds.join(', ')}`));
        } else {
            console.log(chalk.red('\n❌ Failed to post tweet'));
        }
    }

    /**
     * Start the scheduler
     */
    private async startScheduler(): Promise<void> {
        console.log(chalk.cyan('\n⏰ Starting scheduler...\n'));

        this.scheduler.start();

        console.log(chalk.green('✅ Scheduler running'));
        console.log(chalk.gray('   Press Ctrl+C to stop\n'));

        // Keep the process running
        await new Promise(() => { });
    }

    /**
     * Dry run (no tweeting) - WITH TWEET PREVIEW
     * Generates HTML preview with image like actual tweet
     */
    private async dryRun(): Promise<void> {
        console.log(chalk.cyan('\n🧪 Running dry test with preview...\n'));

        const summaries = await this.pipeline.dryRun();

        console.log(chalk.cyan('\n📋 Results:\n'));
        summaries.forEach((summary, category) => {
            console.log(chalk.white(`  ${category}:`));
            console.log(chalk.green(`    "${summary}"\n`));
        });

        // Generate tweet preview with image
        console.log(chalk.yellow('\n🖼️ Generating tweet preview with image...\n'));

        const { ImageService } = await import('../services/image/image.service');
        const { getSheetConfig } = await import('../services/config/sheets.service');
        const imageService = new ImageService();

        // Get config from Google Sheets
        const sheetConfig = await getSheetConfig().getConfig();

        // Get first summary for preview
        const tweetText = Array.from(summaries.values())[0] || 'No content';

        // Compose actual tweet format using DYNAMIC values from sheet
        const emoji = sheetConfig.botEmoji || '📰';
        const hashtags = sheetConfig.hashtags?.join(' ') || '#News #Breaking';
        const botName = sheetConfig.botName || 'HourlySignal';
        const isCustomMode = !sheetConfig.isNewsTweet && sheetConfig.customTopic;
        const updateLabel = isCustomMode ? 'UPDATE' : `${sheetConfig.activeCategory.toUpperCase()} UPDATE`;

        const fullTweet = `${emoji} ${updateLabel}\n\n${tweetText}\n\n${hashtags}`;

        // Generate image
        const imagePath = await imageService.generateCricketImage(tweetText);

        // Create HTML preview
        const fs = await import('fs');
        const path = await import('path');
        const { exec } = await import('child_process');

        const previewDir = path.join(process.cwd(), 'preview');
        if (!fs.existsSync(previewDir)) {
            fs.mkdirSync(previewDir, { recursive: true });
        }

        // Copy image to preview folder
        let imageFileName = 'no-image.jpg';
        if (imagePath && fs.existsSync(imagePath)) {
            imageFileName = `preview_${Date.now()}.jpg`;
            fs.copyFileSync(imagePath, path.join(previewDir, imageFileName));
        }

        // Generate HTML
        const html = `<!DOCTYPE html>
<html>
<head>
    <title>Tweet Preview - HourlySignal</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #15202b; 
            display: flex; 
            justify-content: center; 
            padding: 40px;
        }
        .tweet {
            background: #192734;
            border: 1px solid #38444d;
            border-radius: 16px;
            padding: 16px;
            max-width: 500px;
            color: #fff;
        }
        .header {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
        }
        .avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #1da1f2, #0d8ecf);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            margin-right: 12px;
        }
        .name { font-weight: bold; }
        .handle { color: #8899a6; }
        .content {
            font-size: 15px;
            line-height: 1.5;
            white-space: pre-wrap;
            margin-bottom: 12px;
        }
        .image {
            width: 100%;
            border-radius: 12px;
            margin-top: 12px;
        }
        .hashtags { color: #1da1f2; }
        .footer {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid #38444d;
            color: #8899a6;
            font-size: 13px;
        }
        .preview-badge {
            background: #ffd700;
            color: #000;
            padding: 4px 12px;
            border-radius: 20px;
            font-weight: bold;
            margin-bottom: 20px;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div>
        <div class="preview-badge">🧪 PREVIEW - Not Posted Yet</div>
        <div class="tweet">
            <div class="header">
            <div class="avatar">${emoji}</div>
                <div>
                    <div class="name">${botName}</div>
                    <div class="handle">@YourHandle</div>
                </div>
            </div>
            <div class="content">${fullTweet.replace(/\n/g, '<br>').replace(/#(\w+)/g, '<span class="hashtags">#$1</span>')}</div>
            ${imagePath ? `<img src="${imageFileName}" class="image" alt="Generated Image">` : '<div style="color:#8899a6;padding:20px;text-align:center;">Image generation timed out</div>'}
            <div class="footer">
                Preview generated at ${new Date().toLocaleString('en-IN')}
            </div>
        </div>
    </div>
</body>
</html>`;

        const htmlPath = path.join(previewDir, 'tweet_preview.html');
        fs.writeFileSync(htmlPath, html);

        console.log(chalk.green('✅ Preview generated!\n'));
        console.log(chalk.cyan(`📄 Tweet text saved to: ${htmlPath}`));
        console.log(chalk.cyan(`🖼️ Image saved to: ${path.join(previewDir, imageFileName)}`));

        // Open in browser
        console.log(chalk.yellow('\n🌐 Opening preview in browser...\n'));
        exec(`start "" "${htmlPath}"`);

        // Cleanup
        imageService.cleanup();
    }

    /**
     * Verify Twitter credentials
     */
    private async verifyTwitter(): Promise<void> {
        console.log(chalk.cyan('\n🔑 Verifying Twitter credentials...\n'));

        const twitter = new TwitterService();
        const valid = await twitter.verifyCredentials();

        if (valid) {
            console.log(chalk.green('✅ Twitter credentials are valid!'));
        } else {
            console.log(chalk.red('❌ Twitter credentials are invalid'));
            console.log(chalk.yellow('   Please check your .env file'));
        }
    }

    /**
     * Show memory statistics
     */
    private async showMemoryStats(): Promise<void> {
        const { memory } = await import('../agents/memory');
        const stats = memory.getStats();

        console.log(chalk.cyan('\n📊 Memory Statistics:\n'));
        console.log(chalk.white(`  Total reflexions: ${stats.totalReflexions}`));
        console.log(chalk.white(`  Avg improvement: ${stats.averageImprovement.toFixed(2)}`));
        console.log(chalk.white('\n  By category:'));

        Object.entries(stats.byCategory).forEach(([cat, count]) => {
            console.log(chalk.gray(`    ${cat}: ${count}`));
        });
    }
}

/**
 * Ask for opinion (can be called from scheduler too)
 */
export async function askForOpinion(prompt?: string): Promise<string | undefined> {
    const { opinion } = await inquirer.prompt([
        {
            type: 'input',
            name: 'opinion',
            message: prompt || '💬 Enter your opinion for this update:',
        },
    ]);

    return opinion || undefined;
}

export default CLI;
