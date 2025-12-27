# 📊 Google Sheets Setup Guide

## Step 1: Create Google Sheet

Go to [sheets.google.com](https://sheets.google.com) and create a new sheet.

---

## Step 2: Sheet Format

Create exactly this structure (2 columns: `key` and `value`):

| key | value |
|-----|-------|
| activeCategory | cricket |
| botName | HourlySignal |
| botEmoji | 🏏 |
| hashtags | #Cricket,#IPL,#T20 |
| tweetInterval | 85 |
| maxDailyTweets | 17 |
| isActive | true |
| isNewsTweet | true |
| customTopic | |

### Copy this into your sheet:

```
key,value
activeCategory,cricket
botName,HourlySignal
botEmoji,🏏
hashtags,#Cricket,#IPL,#T20
tweetInterval,85
maxDailyTweets,17
isActive,true
isNewsTweet,true
customTopic,
```

---

## Step 3: Publish to Web

1. Click **File** → **Share** → **Publish to web**
2. In the popup:
   - Select **Entire Document**
   - Select **Comma-separated values (.csv)**
3. Click **Publish**
4. Copy the URL that appears

The URL will look like:
```
https://docs.google.com/spreadsheets/d/e/2PACX-xxxxx/pub?output=csv
```

---

## Step 4: Add URL to .env

Open your `.env` file and add:

```env
GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/e/2PACX-xxxxx/pub?output=csv
```

---

## Field Descriptions

| Field | Description | Example Values |
|-------|-------------|----------------|
| `activeCategory` | News category to fetch | cricket, football, technology |
| `botName` | Display name | HourlySignal |
| `botEmoji` | Emoji for tweets | 🏏, ⚽, 💻 |
| `hashtags` | Comma-separated tags | #Cricket,#IPL,#News |
| `tweetInterval` | Minutes between tweets | 85, 60, 45 |
| `maxDailyTweets` | Max tweets per day | 17, 10, 5 |
| `isActive` | Bot on/off | true, false |
| `isNewsTweet` | News mode or custom | true, false |
| `customTopic` | Custom topic (when isNewsTweet=false) | Kohli's birthday |

---

## Two Modes

### Mode 1: News Mode (Default)
```
isNewsTweet = true
customTopic = (leave empty)
```
Bot fetches news from `activeCategory` and tweets.

### Mode 2: Custom Topic Mode
```
isNewsTweet = false
customTopic = AI trends in 2024
```
Bot generates a tweet about your custom topic (with safety check).

---

## Control from Phone 📱

1. Open Google Sheets app
2. Change any value
3. Bot picks up changes on next run (5 min cache)

### Quick Controls:
- **Pause bot**: Set `isActive = false`
- **Change topic**: Update `activeCategory` or `customTopic`
- **Speed up**: Reduce `tweetInterval` to 45

---

## Troubleshooting

**❌ "No GOOGLE_SHEET_URL set"**
- Make sure URL is in `.env` file

**❌ "Failed to fetch config"**
- Check if sheet is published to web
- Make sure URL ends with `?output=csv`

**❌ Values not updating**
- Bot caches for 5 minutes
- Wait or restart bot

---

## Example Sheet Screenshot

```
    A              B
1   key            value
2   activeCategory cricket
3   botName        HourlySignal
4   botEmoji       🏏
5   hashtags       #Cricket,#IPL,#T20
6   tweetInterval  85
7   maxDailyTweets 17
8   isActive       true
9   isNewsTweet    true
10  customTopic    
```

That's it! 🎉
