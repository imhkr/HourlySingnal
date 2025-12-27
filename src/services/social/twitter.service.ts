import { TwitterApi } from 'twitter-api-v2';
import * as fs from 'fs';
import config from '../../config';
import { log } from '../../utils/logger';
import { MegaTweet } from '../../types';
import statsService from '../stats/stats.service';

export class TwitterService {
    private client: TwitterApi;
    private readonly MAX_TWEET_LENGTH = 280;

    constructor() {
        this.client = new TwitterApi({
            appKey: config.twitter.apiKey,
            appSecret: config.twitter.apiSecret,
            accessToken: config.twitter.accessToken,
            accessSecret: config.twitter.accessTokenSecret,
        });
    }

    async postTweet(text: string): Promise<{ success: boolean; tweetId?: string; error?: string }> {
        try {
            if (text.length > this.MAX_TWEET_LENGTH) {
                log.warn('Tweet exceeds character limit, will be truncated', {
                    length: text.length,
                    max: this.MAX_TWEET_LENGTH,
                });
            }

            const tweet = await this.client.v2.tweet(text.slice(0, this.MAX_TWEET_LENGTH));

            const rateLimit = (tweet as any).rateLimit;
            if (rateLimit) {
                statsService.updateQuota(rateLimit.remaining, rateLimit.reset);
            }
            statsService.incrementTweets();

            log.tweet('Posted successfully', {
                tweetId: tweet.data.id,
                length: text.length,
            });

            return {
                success: true,
                tweetId: tweet.data.id
            };
        } catch (error: any) {
            log.error('❌ Twitter API Error:', {
                message: error.message,
                code: error.code,
                data: error.data,
                rateLimit: error.rateLimit,
            });

            if (error.rateLimit) {
                statsService.updateQuota(error.rateLimit.remaining, error.rateLimit.reset);

                if (error.code === 429) {
                    const resetDate = new Date(error.rateLimit.reset * 1000);
                    log.error(`⏱️ 429 Rate Limited. Reset at: ${resetDate.toLocaleTimeString()}`);
                }
            }

            return {
                success: false,
                error: `${error.code}: ${error.message}`
            };
        }
    }

    async postTweetWithImage(text: string, imagePath: string): Promise<{ success: boolean; tweetId?: string; error?: string }> {
        try {
            if (!fs.existsSync(imagePath)) {
                log.warn('Image file not found, posting without image');
                return this.postTweet(text);
            }

            log.info('🖼️ Uploading image to Twitter...');

            const mediaId = await this.client.v1.uploadMedia(imagePath);
            log.info('✅ Image uploaded', { mediaId });

            const tweet = await this.client.v2.tweet(text.slice(0, this.MAX_TWEET_LENGTH), {
                media: { media_ids: [mediaId] }
            });

            const rateLimit = (tweet as any).rateLimit;
            if (rateLimit) {
                statsService.updateQuota(rateLimit.remaining, rateLimit.reset);
            }
            statsService.incrementTweets();

            log.tweet('Posted with image successfully', {
                tweetId: tweet.data.id,
                mediaId,
            });

            return {
                success: true,
                tweetId: tweet.data.id
            };
        } catch (error: any) {
            log.error('❌ Twitter media upload failed:', {
                message: error.message,
                code: error.code,
                rateLimit: error.rateLimit,
            });

            if (error.rateLimit) {
                statsService.updateQuota(error.rateLimit.remaining, error.rateLimit.reset);
            }

            log.warn('Falling back to text-only tweet...');
            return this.postTweet(text);
        }
    }


    async postThread(tweets: string[]): Promise<{ success: boolean; tweetIds: string[]; error?: string }> {
        const tweetIds: string[] = [];
        let lastTweetId: string | undefined;

        const THREAD_COOLDOWN = 60000;

        try {
            for (let i = 0; i < tweets.length; i++) {
                const tweetText = tweets[i].slice(0, this.MAX_TWEET_LENGTH);

                let posted = false;
                let retries = 0;
                const maxRetries = 3;

                while (!posted && retries < maxRetries) {
                    try {
                        let tweet;
                        if (lastTweetId) {
                            tweet = await this.client.v2.tweet(tweetText, {
                                reply: { in_reply_to_tweet_id: lastTweetId },
                            });
                        } else {
                            tweet = await this.client.v2.tweet(tweetText);
                        }

                        lastTweetId = tweet.data.id;
                        tweetIds.push(tweet.data.id);
                        posted = true;

                        log.tweet(`Thread ${i + 1}/${tweets.length} posted ✅`, {
                            tweetId: tweet.data.id
                        });
                    } catch (err: any) {
                        retries++;

                        if (err.code === 403 || err.code === 429) {
                            const waitTime = retries * 60000;  // 1min, 2min, 3min
                            log.warn(`Rate limited, waiting ${waitTime / 1000}s before retry ${retries}/${maxRetries}`);
                            await this.delay(waitTime);
                        } else {
                            log.error(`Tweet ${i + 1} failed`, { error: err.message });
                            if (tweetIds.length > 0) {
                                return { success: true, tweetIds, error: `Partial: ${err.message}` };
                            }
                            throw err;
                        }
                    }
                }

                if (i < tweets.length - 1 && posted) {
                    log.info(`⏳ Waiting ${THREAD_COOLDOWN / 1000}s before next tweet...`);
                    await this.delay(THREAD_COOLDOWN);
                }
            }

            log.tweet('✅ Full thread posted!', { total: tweetIds.length });
            return { success: true, tweetIds };
        } catch (error: any) {
            log.error('Thread failed', { error: error.message, posted: tweetIds.length });
            return {
                success: tweetIds.length > 0,  // Partial success
                tweetIds,
                error: error.message
            };
        }
    }

    async postMegaTweet(megaTweet: MegaTweet): Promise<{ success: boolean; tweetIds: string[] }> {
        if (megaTweet.isThread) {
            return this.postThread(megaTweet.tweets);
        } else {
            const result = await this.postTweet(megaTweet.tweets[0]);
            return {
                success: result.success,
                tweetIds: result.tweetId ? [result.tweetId] : [],
            };
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async verifyCredentials(): Promise<boolean> {
        try {
            const me = await this.client.v2.me();
            log.info('Twitter credentials verified', {
                username: me.data.username
            });
            return true;
        } catch (error: any) {
            log.error('Twitter credentials invalid', { error: error.message });
            return false;
        }
    }
}

export default TwitterService;
