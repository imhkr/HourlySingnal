/**
 * 🔥 HourlySignal - Reflexion Pattern News Agent
 * 
 * An AI-powered news aggregation agent that:
 * 1. Fetches top news from multiple sources (NewsData.io, GNews)
 * 2. Summarizes using Gemini AI with Reflexion pattern
 * 3. Posts combined mega-tweets to X/Twitter every ~84 minutes
 * 
 * @author HourlySignal
 * @version 1.0.0
 */

import { CLI } from './ui/cli';
import { validateConfig } from './config';
import { log } from './utils/logger';

async function main() {
    console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🔥 HourlySignal - Reflexion Pattern News Agent         ║
  ║                                                           ║
  ║   Fetches • Summarizes • Tweets                          ║
  ║   Every ~84 minutes with AI-powered quality control      ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);

    // Check configuration
    const configStatus = validateConfig();

    if (!configStatus.valid) {
        log.error('Configuration incomplete', { missing: configStatus.missing });
        console.log('\n❌ Missing required configuration:');
        configStatus.missing.forEach(key => {
            console.log(`   - ${key}`);
        });
        console.log('\n📝 Please copy .env.example to .env and fill in your API keys.\n');
        process.exit(1);
    }

    log.info('HourlySignal starting...');

    // Start CLI
    const cli = new CLI();
    await cli.start();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down HourlySignal...\n');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    log.error('Uncaught exception', { error: error.message });
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
});

// Run
main().catch((error) => {
    log.error('Fatal error', { error: error.message });
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
});
