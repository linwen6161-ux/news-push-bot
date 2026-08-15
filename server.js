const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const { XMLParser } = require('fast-xml-parser');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

let users = [];
let sentArticleUrls = new Set();

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

cron.schedule('*/10 * * * *', async () => {
  console.log('🔄 機器人正在抓取全台即時新聞與內文...');
  const feedUrl = 'https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant';

  try {
    const res = await axios.get(feedUrl);
    const parser = new XMLParser({ processEntities: false, entityExpansionLimit: 100000 });
    const jsonObj = parser.parse(res.data);
    const items = jsonObj.rss?.channel?.item || [];

    for (const item of items.slice(0, 50)) {
      const title = item.title || '';
      const link = item.link || '';
      
      // 🌟 新增：剝離 HTML 並抓取乾淨的新聞內文摘要
      let description = item.description || item['content:encoded'] || '';
      if (typeof description === 'object') description = description['#text'] || description['__cdata'] || '';
      description = String(description).replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

      if (sentArticleUrls.has(link)) continue;

      for (const user of users) {
        // 🌟 升級：雙重比對，只要標題或內文中其一命中即可
        const isMatched = user.keywords.some(kw => {
          const keyword = kw.toLowerCase();
          return title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword);
        });
        
        if (isMatched) {
          // 讓推播視窗顯示新聞內文前 80 個字，取代掉原本死板的「關鍵字通報」
          const pushBody = description ? (description.substring(0, 80) + '...') : '點擊查看詳細新聞內容';
          await sendPushNotification(user.token, `🔔 ${title}`, pushBody, link);
        }
      }
      sentArticleUrls.add(link);
    }
  } catch (err) {
    console.error('抓取新聞失敗:', err.message);
  }
});

async function sendPushNotification(expoToken, title, body, newsUrl) {
  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: expoToken,
      sound: 'default',
      title,
      body,
      data: { url: newsUrl }
    });
    console.log(`🚀 推播成功送出給: ${expoToken}`);
  } catch (e) {
    console.error('推播發送失敗:', e.message);
  }
}

app.get('/', (req, res) => res.send('🚀 媒訊通報 24 小時雙重比對主機運作中！'));
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
