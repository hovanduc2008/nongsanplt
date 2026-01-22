require("dotenv").config();
const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

const app = express();
const PORT = 8080;
const NEWS_FILE = "./data/news.json";

/* ================== FILE UTILS ================== */
function readNewsFile() {
  if (!fs.existsSync(NEWS_FILE)) return [];
  return JSON.parse(fs.readFileSync(NEWS_FILE, "utf-8") || "[]");
}

function writeNewsFile(data) {
  fs.writeFileSync(NEWS_FILE, JSON.stringify(data, null, 2));
}

/* ================== FETCH NEWS ================== */
async function fetchNewNews(existingNews = []) {
  const existedUrls = new Set(existingNews.map(n => n.url));

  const { data } = await axios.get("https://gnews.io/api/v4/top-headlines", {
    params: {
      lang: "vi",
      country: "vn",
      max: 10,
      apikey: process.env.GNEWS_API_KEY || "aca9c5e3d72ba432ff45e840a6608840"
    },
    headers: {
      "User-Agent": "PulsePrimePro/1.0"
    }
  });

  const articles = data.articles || [];
  const freshNews = [];

  for (const n of articles) {
    if (!n.url || existedUrls.has(n.url)) continue;

    freshNews.push({
      tag: n.source?.name || "NEWS",
      title: n.title,
      summary: n.description || "",
      url: n.url,
      time: Date.now()
    });

    if (freshNews.length >= 10) break;
  }

  return freshNews;
}

/* ================== INIT SERVER ================== */
async function initNewsOnStart() {
  console.log("🚀 Server start → init news");

  try {
    const freshNews = await fetchNewNews([]);
    writeNewsFile(freshNews);
    console.log(`✅ Init ${freshNews.length} tin`);
  } catch (err) {
    console.error("❌ Init news failed:", err.message);
  }
}

initNewsOnStart();

/* ================== CRON: HOURLY ================== */
cron.schedule("0 * * * *", async () => {
  console.log("⏱ Cập nhật tin mỗi giờ");

  try {
    const currentNews = readNewsFile();
    const freshNews = await fetchNewNews(currentNews);

    if (freshNews.length) {
      writeNewsFile([...freshNews, ...currentNews]);
      console.log(`✅ Thêm ${freshNews.length} tin mới`);
    } else {
      console.log("ℹ️ Không có tin mới");
    }
  } catch (err) {
    console.error("❌ Hourly update failed:", err.message);
  }
});

/* ================== CRON: RESET 00:00 ================== */
cron.schedule("0 0 * * *", async () => {
  console.log("🌙 Reset tin tức 00:00");

  try {
    const freshNews = await fetchNewNews([]);
    writeNewsFile(freshNews);
    console.log(`✅ Reset với ${freshNews.length} tin`);
  } catch (err) {
    console.error("❌ Reset failed:", err.message);
  }
});

/* ================== VIEW ENGINE ================== */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* ================== STATIC ================== */
app.use(express.static(path.join(__dirname, "public")));

/* ================== HOME ================== */
app.get("/", (req, res) => {
  const news = readNewsFile();
  res.render("index", { news });
});

/* ================== START ================== */
app.listen(PORT, () =>
  console.log(`🚀 SSR running at http://localhost:${PORT}`)
);
