# 🏏 HourlySignal - AI Cricket News Bot

An **AI-powered** Twitter bot that automatically tweets cricket news with AI-generated images. Built with Reflexion Pattern for quality control.

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white" />
</p>

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🏏 **Cricket Focus** | Worldwide cricket coverage - IPL, BBL, CPL, Ashes, BGT, World Cups |
| 🤖 **AI Summarization** | Mistral + Gemini for intelligent news summaries |
| 🖼️ **AI Images** | Auto-generates cricket images using Pollinations.ai (FREE!) |
| 🔴 **Live Match Mode** | AI detects live matches → tweets every 20 mins |
| 📊 **Smart Scheduling** | Normal: 85 mins, High: 45 mins, Live: 20 mins |
| 🔄 **Reflexion Pattern** | Self-improving summaries with evaluation loop |
| 🧪 **Preview Mode** | See tweet + image in browser before posting |

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/HourlySignal.git
cd HourlySignal
npm install
```

### 2. Configure API Keys

```bash
cp .env.example .env
```

Edit `.env` with your keys (see [API Keys Setup](#api-keys-setup) below).

### 3. Run

```bash
npm run dev
```

## 🎮 Usage

```
🔥 HourlySignal - Reflexion Pattern News Agent

? What would you like to do?
  ▶️  Run now (Full Auto + AI Opinion)
  ⏰ Start scheduler (automatic)
  🧪 Dry run (test without tweeting)  ← Preview with image!
  🔑 Verify Twitter credentials
  📊 View memory stats
  ❌ Exit
```

### Dry Run Preview
The dry run generates an HTML preview with the actual tweet + AI image, opens in your browser looking exactly like a real Twitter post!

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

## 🏏 Smart Match Detection

The AI automatically detects live cricket matches and adjusts tweet frequency:

```
📊 NORMAL MODE (85 mins) - Regular cricket news
🟡 HIGH MODE (45 mins)   - Major event day (IPL, Ashes)
🔴 LIVE MODE (20 mins)   - Match in progress!
```

**Detection keywords:**
- Live signals: "batting", "bowling", "wicket", "overs", "day 1-5"
- Major events: "World Cup", "IPL Final", "Ashes", "BGT", "semi-final"

## 📁 Project Structure

```
src/
├── agents/          # AI agents (fetcher, summarizer, evaluator)
├── config/          # Configuration
├── orchestrator/    # Pipeline & scheduler
├── services/
│   ├── ai/          # Mistral, Gemini, Beast Mode
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
- Add more sports coverage
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
