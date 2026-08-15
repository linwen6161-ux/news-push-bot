const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const { XMLParser } = require('fast-xml-parser');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// 記錄已註冊的使用者清單 (Token 與 關鍵字)
let users = [];
// 記錄已經推播過的新聞，避免重複推播
let sentArticleUrls = new Set();

// 接收前端 APP 傳來的推播註冊資料 (路徑修正為 '/register')
app.post('/register', (req, res) => {
  const { token, keywords } = req.body;
  if (!token) return res.status(400).json({ error: '缺少 Push Token' });

  const existingUser = users.find(u => u.token === token);
  if (existingUser) {
    existingUser.keywords = keywords || [];
  } else {
    users.push({ token, keywords: keywords || [] });
  }
  console.log(`✅ 新增/更新裝置：${token}，關鍵字：${keywords}`);
  res.json({ success: true });
});

// 每 10 分鐘自動檢查一次新聞並推播
cron.schedule('*/10 * * * *', async () => {
  console.log('🔄 機器人正在抓取全台即時新聞...');
  const feedUrl = 'https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant';

  try {
    const res = await axios.get(feedUrl);
    // 突破實體擴展 1000 則限制
    const parser = new XMLParser({
        processEntities: false,
        entityExpansionLimit: 100000
    });
    const jsonObj = parser.parse(res.data);
    const items = jsonObj.rss?.channel?.item || [];

    for (const item of items.slice(0, 50)) {
      const title = item.title || '';
      const link = item.link || '';

      if (sentArticleUrls.has(link)) continue;

      // 檢查有哪些使用者的關鍵字有命中
      for (const user of users) {
        const isMatched = user.keywords.some(kw => title.toLowerCase().includes(kw.toLowerCase()));
        if (isMatched) {
          await sendPushNotification(user.token, '🔔 關鍵字即時新聞通報', title);
        }
      }
      sentArticleUrls.add(link);
    }
  } catch (err) {
    console.error('抓取新聞失敗:', err.message);
  }
});

async function sendPushNotification(expoToken, title, body) {
  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: expoToken,
      sound: 'default',
      title,
      body,
    });
    console.log(`🚀 推播成功送出給: ${expoToken}`);
  } catch (e) {
    console.error('推播發送失敗:', e.message);
  }
}

app.get('/', (req, res) => res.send('🚀 媒訊通報 24 小時雲端推播主機運作中！'));
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
