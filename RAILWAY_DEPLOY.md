# 🚂 部署 CoinBot Worker 到 Railway

你的 `CoinBot Web` 已經連接到 Railway 數據庫，現在我們需要把 `CoinBot Worker`（交易機器人）也部署到那裡，讓它 24/7 運行。

## 步驟 1: 提交代碼到 GitHub

首先，確保你剛才修復的代碼都已經推送到 GitHub：

```bash
git add .
git commit -m "Fix worker auth and add deployment config"
git push
```

## 步驟 2: 在 Railway 上創建新服務

1. 打開 [Railway Dashboard](https://railway.app/dashboard)。
2. 進入你現有的項目（包含了 PostgreSQL 數據庫的那個項目）。
3. 點擊 **"+ New"** → **"GitHub Repo"**。
4. 選擇你的 `coinbot` 倉庫。
5. **重要：** 點擊剛創建的服務卡片，進入 **"Settings"**。
   - 找到 **"Root Directory"**，設置為 `/coinbot-worker`。
   - 這樣 Railway 才知道要構建 worker 目錄，而不是 web 目錄。

## 步驟 3: 配置環境變量

在該服務的 **"Variables"** 選項卡中，添加以下變量（可以從 web 項目複製）：

| 變量名 | 值 | 說明 |
|--------|----|------|
| `DATABASE_URL` | `postgresql://...` | **必須**與 Web 項目完全一致（連接同一個數據庫） |
| `NEXTAUTH_SECRET` | `...` | 可選，保持一致性 |

## 步驟 4: 部署

1. 設置好環境變量後，Railway 通常會自動重新部署。
2. 如果沒有，點擊 **"Deploy"** 按鈕。
3. 部署成功後，查看 **"Deploy Logs"**，你應該能看到：
   ```
   🤖 Starting Coinbase Trading Bot...
   🔌 Initializing database connection...
   ✅ Database connected successfully
   ```

## 步驟 5: 驗證

回到你的 Web Dashboard (`/`)：
1. 確保你已經登錄。
2. 點擊 "Configure" 設置你的 API 金鑰。
3. 點擊 "Start Trading"。
4. 你應該能看到日誌中出現 "Trading started..."，這表示雲端的 worker 已經與數據庫同步並開始工作了。
