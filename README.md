# 🚀 HourlySignal - AI-Powered Dynamic Twitter Bot

An **AI-powered** Twitter bot that automatically posts dynamic content - **News by Category** OR **Custom Topics** - with AI-generated images. Fully controlled via **Google Sheets**!

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white" />
  <img src="https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white" />
</p>

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 **Google Sheets Control** | Change category, hashtags, interval - all remotely from your phone! |
| 🎯 **Dual Mode** | News Mode (any category) OR Custom Topic Mode (tweet about anything) |
| 🤖 **AI Summarization** | Mistral + Gemini for intelligent summaries |
| 🖼️ **AI Images** | Auto-generates contextual images using Pollinations.ai (FREE!) |
| 🛡️ **Content Moderation** | AI checks custom topics for inappropriate content |
| 🔴 **Live Event Mode** | AI detects live events → tweets every 20 mins |
| 📊 **Smart Scheduling** | Normal: 85 mins, High: 45 mins, Live: 20 mins |
| 🔄 **Reflexion Pattern** | Self-improving summaries with evaluation loop |
| 🧪 **Preview Mode** | See tweet + image in browser before posting |

## 📊 Google Sheets Remote Control

Control everything from Google Sheets - **no code changes needed!**

### Sheet Format

| key | value | description |
|-----|-------|-------------|
| activeCategory | cricket | News category (cricket, football, technology, etc.) |
| botName | HourlySignal | Display name |
| botEmoji | 🏏 | Emoji for tweets |
| hashtags | #Cricket,#IPL,#T20 | Comma-separated hashtags |
| tweetInterval | 85 | Minutes between tweets |
| maxDailyTweets | 17 | Max tweets per day |
| isActive | true | Pause/resume bot |
| isNewsTweet | true | true = News mode, false = Custom topic |
| customTopic | | Your custom topic (when isNewsTweet = false) |
| generateImage | true | true = AI images ON, false = OFF |

### Example Sheet
👉 [View Example Sheet Format](https://docs.google.com/spreadsheets/d/1Qy39sXKkKamEht8T6CciaUBjLZisbH5cBknF8O7tgzI/edit?usp=sharing)

### Setup Steps
1. Create a copy of the example sheet
2. Go to **File → Share → Publish to web**
3. Select **Comma-separated values (.csv)** → Click **Publish**
4. Copy the URL and add to `.env`:
   ```
   GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/e/xxxxx/pub?output=csv
   ```

## 🎯 Two Modes

### Mode 1: News Mode (Default)
```
isNewsTweet = true
activeCategory = cricket (or football, technology, etc.)
```
Bot fetches latest news, summarizes with AI, and tweets.

> [!IMPORTANT]  
> **Development Status**: This project is currently **under active development**. You may encounter bugs or unexpected behavior. Feel free to open an issue or contribute!
> 
> **Data Quality & Accuracy**: The precision of generated tweets depends directly on the accuracy of the News API data. High-quality input leads to high-quality output.
> 
> **News Freshness & API Plans**: Most news APIs (GNews, NewsData) have a **12 to 24-hour delay** on Free plans. The bot uses a 24-hour window to ensure stability. For instant news, a **Paid API Plan** is recommended.

### Mode 2: Custom Topic Mode
```
isNewsTweet = false
customTopic = Roman Empire history
```
Bot generates an AI tweet about your custom topic (with safety check!).

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/imhkr/HourlySignal.git
cd HourlySignal
npm install
```

### 2. Configure API Keys

```bash
cp .env.example .env
```

Edit `.env` with your keys 

### 3. Run

```bash
npm run dev
```

## 🎮 Usage

```
🔥 HourlySignal - AI-Powered Dynamic Twitter Bot

? What would you like to do?
  ▶️  Run now (Full Auto + AI Opinion)
  ⏰ Start scheduler (automatic)
  🧪 Dry run (test without tweeting)  ← Preview with image!
  🔑 Verify Twitter credentials
  ❌ Exit
```

## 🔧 API Keys Setup

### Required APIs (All have FREE tiers)

| Service | Purpose | Get Key |
|---------|---------|---------|
| **Twitter/X** | Post tweets | [developer.twitter.com](https://developer.twitter.com) |
| **NewsData.io** | News source 1 | [newsdata.io](https://newsdata.io) (200 req/day free) |
| **GNews** | News source 2 | [gnews.io](https://gnews.io) (100 req/day free) |
| **Mistral AI** | Primary AI | [console.mistral.ai](https://console.mistral.ai) (Free tier) |
| **Gemini** | Backup AI | [aistudio.google.com](https://aistudio.google.com) (Free tier) |

### Optional
- **Pollinations.ai** - Image generation (completely free, no key needed!)
- **Google Sheets** - Remote control (free, no key needed!)

## 📁 Project Structure

```
src/
├── agents/          # AI agents (fetcher, summarizer, evaluator)
├── config/          # Configuration
├── orchestrator/    # Pipeline & scheduler
├── services/
│   ├── ai/          # Mistral, Gemini, Beast Mode
│   ├── config/      # Google Sheets integration
│   ├── image/       # Pollinations.ai image gen
│   ├── news/        # NewsData, GNews
│   └── social/      # Twitter
├── types/           # TypeScript types
├── ui/              # CLI interface
└── utils/           # Logger, helpers
```

## 🛠️ Tech Stack

- **Runtime**: Node.js + TypeScript
- **AI**: Mistral (primary) + Gemini (backup)
- **Images**: Pollinations.ai (free)
- **Config**: Google Sheets (remote control)
- **News**: NewsData.io + GNews
- **Social**: Twitter API v2
- **Scheduler**: Dynamic interval with AI detection

## 📊 Twitter Free Tier

Maximum **17 tweets/day**. The smart scheduler:
- Tracks daily usage automatically
- Pauses when limit reached
- Resets at midnight UTC

## 🤝 Contributing

PRs welcome! Areas to contribute:
- Add more news categories
- Improve AI prompts
- Add more image generation options
- Multi-language support

## 📝 License

MIT License - see [LICENSE](LICENSE)

## 🙏 Credits

Built with ❤️ using:
- [twitter-api-v2](https://github.com/PLhery/node-twitter-api-v2)
- [Mistral AI](https://mistral.ai)
- [Google Gemini](https://ai.google.dev)
- [Pollinations.ai](https://pollinations.ai)

---

**Made by [Himanshu Patel](https://github.com/imhkr)** | ⭐ Star this repo if you find it useful!
