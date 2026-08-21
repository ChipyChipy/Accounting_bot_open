# 🤖 Financial Agent (Flask + Gemini + GAS)

An automated personal finance tracking agent powered by Python Flask, Google Gemini 3.1 Flash-Lite, and Google Apps Script (GAS). 
It parses transaction details directly from **LINE messages** and **Email notifications** (e.g., credit card alerts) and logs structured financial data seamlessly into Google Sheets.

[👉點此跳轉至繁體中文說明](#-ai記帳小幫手flask--gemini--gas)

## ✨ Features

* 📩 **Email Auto-Tracking**: Automatically processes all sort of receipt with email notification, logs data to Google Sheets, and sends push notifications to LINE.
* 💬 **LINE Bot Interface**: Parse text inputs via conversational AI, automatically categorizing expenses, extracting items, and determining totals.
* ✏️ **Smart Editing via Reply**: Modify existing transaction records seamlessly by quoting/replying to previous messages in LINE.
* 📊 **Automated Google Sheets Management**: GAS handles dynamic monthly sheet creation (e.g., `2026_01`), formatting, and row management automatically.
* ⚡ **Deduplication Safeguard**: In-memory caching prevents duplicate email triggers within short time intervals.
* 📈 **Scheduled Summaries**: Supports dynamic summary commands (本日/週/月結算, 上月結算) with automated QuickChart pie chart generation and spending stats to keep your finances on track easily.
* 🏆 **Achievement System**: Newly added achievement push system! Keep tracking your expenses to unlock the ultimate achievements.

## 🛠️ Tech Stack

* **Back-end**: Python, Flask, Gunicorn
* **AI Model**: Google Gemini API (`gemini-3.1-flash-lite`)
* **Database / Automation**: Google Apps Script (GAS) + Google Sheets
* **Notification**: LINE Messaging API

---

## 🚀 Quick Start

### 1. Local Environment Setup

Clone the repository and set up dependencies:

```bash
git clone https://github.com/ChipyChipy/Accounting_bot_open.git
cd Accounting_bot_open

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install required packages
pip install -r requirements.txt
```

### 2. Environment Variables

Create a `.env` file in the root directory (refer to `.env.example`):

```text
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_USER_ID=your_line_user_id
GEMINI_API_KEY=your_gemini_api_key
GAS_API_URL=your_google_apps_script_web_app_url
```

*You will get the first two credentials once you build your own LINE Bot. Remember to enable the Webhook feature in the LINE Developers Console and verify it. (For local testing, LINE requires an HTTP tunnel like ngrok, but for online deployment, your Webhook URL will be configured in step 4).*

### 3. Google Apps Script (GAS) Setup

1. Open a blank Google Sheet and go to `Extensions` -> `Apps Script`.
2. Replace the editor code with the code from `gas/Code.gs` in this project.
3. Click Deploy -> New deployment.
4. Choose Web app as the type:
    - Execute as: *Me*
    - Who has access: *Anyone*
5. Copy the generated Web App URL and set it as `GAS_API_URL` in your `.env` file.

*Once the GAS deployment is complete, you can sit back and relax—all remaining sheet creations will be handled automatically. This includes monthly sheets and a master `Statistics` sheet. Additionally, you can configure whether to push pie charts during summaries, toggle achievement displays, and set your default budgets directly inside the `Statistics` sheet.*

### 4. Run the Application

```bash
python main.py
```

---

## 🌐 Cloud Deployment (e.g., Render)

1. Push your code to *GitHub*.
2. Create a new Web Service on *Render* and connect your repository.
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn main:app`
5. Configure the Environment Variables in Render with your `.env` values.
6. Set your Webhook URL in LINE Developers Console to: [https://your-render-app.onrender.com/webhook/line](https://your-render-app.onrender.com/webhook/line)

*(Now you have completed your online deployment. Go back to the LINE Developers Console, verify the Webhook link, and test if everything works smoothly from the backend.)*

---

## 📲 Email & iOS Shortcut Setup (Optional)

To automatically trigger backend tracking upon receiving transaction emails:

1. Create a new iOS Shortcut with Get Contents of URL:
    - URL: https://your-render-app.onrender.com/webhook/email
    - Method: POST
    - Headers: Add Content-Type: application/json
    - Request Body: Select JSON, key as text, and value as Shortcut Input.
2. Create an Automation in iOS Shortcuts triggered by receiving specific Emails (configure sender, subject, etc.), and set it to Run Immediately (Do Not Ask).

---

## 🔍 Troubleshooting & FAQ

1. **How do I record transactions?**
    - Emails trigger automatic accounting. For cash or transit cards, send conversational messages via LINE (e.g., "Metro ticket 20").
2. **HTTP 400 Bad Request**
    - Check if the text exceeds the built-in 500-character limit.
3. **How do I correct misrecorded data?**
    - For email notifications, use LINE's Quote Reply on the notification message to precisely update corresponding Sheet entries.
    - For manual inputs, state details clearly (e.g., "Change coffee to $50"). Vague prompts default to updating the latest record.
4. **Delay in manual input processing**
    - Free Render instances go to sleep when idle and may take ~1 minute to spin up on cold start. Services like [UptimeRobot](https://uptimerobot.com/) can help keep your instance awake.

***

# 📋 AI記帳小幫手（Flask + Gemini + GAS）

本專案為基於Python Flask、Google Gemini 3.1 Flash-Lite模型與Google Apps Script (GAS)建立的自動化記帳系統。能夠依據設定自動擷取刷卡消費或高鐵購票等Email通知信件，亦可解析Line口語簡短訊息自動解析消費內容，並自動同步結構化資料至Google試算表。

## 功能特點

* 📩 **Email自動記帳**：解析刷卡通知、購票通知等寄送Email的消費項目，自動寫入Google Sheet並發送LINE訊息通知。
* 💬 **LINE機器人互動**：直接傳送口語記帳訊息，如「大冰美35」即可自動分類、擷取金額、項目並回覆。
* ✏️ **智慧修改紀錄**：支援回覆（Reply）舊訊息精準選中資料進行修正。
* 📊 **Google Sheet自動化**：利用GAS自動建立按月分頁（如 `2026_01`）以及統計總表，並有美美乾淨的表格編排。
* ⚡ **防重複觸發**：內建快取機制，防止短時間內重複記帳。
* 📈 **定期結算功能**：支援輸入「本日/週/月結算」、「上月結算」，自動產出QuickChart圓餅圖與消費統計，輕鬆掌握消費狀況。
* 🏆 **成就推播**：本次新增了成就推播功能！努力記帳，嘗試解鎖終極成就吧。   

## 🛠️ 技術棧

* **Back-end**: Python, Flask, Gunicorn
* **AI Model**: Google Gemini API (`gemini-3.1-flash-lite`)
* **Database / Sheet**: Google Apps Script (GAS) + Google Sheets
* **Notification**: LINE Messaging API

---

## 🚀 快速開始

### 1. 本地環境設定

複製專案並安裝套件：

```bash
git clone https://github.com/ChipyChipy/Accounting_bot_open.git
cd Accounting_bot_open

# 建立並啟用虛擬環境
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# 安裝依賴套件
pip install -r requirements.txt
```

### 2. 環境變數設定

在目前專案的根目錄建立`.env`檔案（參考`.env.example`）:

```text
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_USER_ID=your_line_user_id
GEMINI_API_KEY=your_gemini_api_key
GAS_API_URL=your_google_apps_script_web_app_url
```

*你在建立了自己的Line bot之後（沒錯你要先建立一個Line bot，但不難！照著指示操作就好）就會取得前兩項資訊。記得啟動Webhook功能，此步驟需貼上對應的連結並驗證可否運作。（本地測試時，會需要建立本地的HTTP阜如Ngrok，但線上部署的話你要等下一階段才會取得Webhook URL，先往下操作吧）*

### 3. Google Apps Script (GAS) 部署

1. 開啟一份新的Google Sheet，點選上方選單列`擴充功能` -> `Apps Script`。
2. 把專案中`gas/Code.gs`的程式碼貼入GAS編輯器。
3. 點擊右上角 部署 -> 新增部署。
4. 類型選擇Web應用程式（Web app）:
    - 執行身分： *我 (Me)*
    - 誰有存取權： *任何人 (Anyone)*
5. 複製取得的Web App URL，並填入`.env`中的`GAS_API_URL`

*一旦GAS部署好，就可以放手了，剩下所有建立工作表的工作都將會自動完成，包含每月的工作表，以及一張`Statistics`總表，另外，「結算」時是否推播圓餅圖、是否想要顯示成就系統以及你的默認預算都可以在`Statistics`分頁設定*

### 4. 啟動服務

```bash
python main.py
```

---

## 🌐 雲端部署（以Render為例）

1. 將程式碼推送到*GitHub*。
2. 在*Render*建立新的Web Service並連結此Github倉庫（Repository）
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn main:app`
5. 在Render的Environment設定中，填入`.env`內的所有環境變數
6. 設定LINE Developers Console中的Webhook URL為： [https://your-render-app.onrender.com/webhook/line](https://your-render-app.onrender.com/webhook/line)

*（現在你已經完成了你的雲端部署，恭喜你。請回到LINE Developers Console，認證（Verify）你的Webhook URL以確定他可以在背景順利運作）*

---

## 📲 Email & iOS捷徑設定（可選項目）

如果你想在背景自動取得Email消費通知:

1. 建立一個 iOS 取得 URL 的內容 (Get contents of URL) 捷徑：
    - URL：填上你的 Webhook 端點 https://your-render-app.onrender.com/webhook/email
    - Method：選擇 POST
    - Headers：加上 Content-Type，打上 application/json
    - Request Body：選擇 JSON，新增欄位 text，值填入 Shortcut input (捷徑輸入)
2. 為這個捷徑設立自動化 (Automation)：
    - 觸發條件設置為「收到 Mail」
    - 進階設置你想要辨認的寄件者、主旨等關鍵字
    - 設定為「不詢問直接執行」

*（設定妥當後，即可在收到對應Email後自動推播訊息到方才部署的專案上，並完成自動記帳，即便不部署此功能，亦可享有方便的手動記帳）*

---

## ⚠️ 遇到問題了？

1. **我要怎麼記帳？**
    - 有成功設置捷徑的話，收到Email就會自動記好帳。若是現金或悠遊卡等消費，直接在LINE發送「捷運20」即可。如果是跟朋友分攤，也可以記上代墊金額！
2. **訊息傳入被拒（後端顯示400）**
    - LINE訊息太長囉！為了避免潛在系統負擔，內建有500字的字數上限。
3. **我手滑打錯字，想修改訊息**
    - 自動記帳所推播的訊息會被授予一個訊息ID，只要用Line你熟悉的「回覆」功能就可以精準修改對應條目，不管是修改項目名稱、類別，或填上你幫別人代墊了多少、自己實支多少都可以改好！
    - 手動記帳則要把訊息講得明確一點，AI會自動比對最近的記錄並修改，如果訊息不明確（Eg. 改成50元），則預設擷取最新一筆修改。
4. **手動記帳要等很久才會寫入**
    - 如果使用Render免費方案，伺服器在閒置時會進入休眠，首次呼叫需等待約1分鐘冷啟動。可以考慮使用UptimeRobot等服務保持常駐喚醒。
5. **Email沒有觸發自動記帳**
    - iOS捷徑僅能偵測官方原生「郵件 (Mail)」App。請確認iOS 設定->郵件->帳戶->擷取新資料 中，是否有將Mail App的更新頻率由自動改為固定時段（如每15分鐘）擷取一次。
