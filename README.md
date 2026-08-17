# 🤖 Financial Agent (Flask + Gemini + GAS)

An automated personal finance tracking agent powered by Python Flask, Google Gemini 3.1 Flash-Lite, and Google Apps Script (GAS). 
It parses transaction details directly from **LINE messages** and **Email notifications** (e.g., credit card alerts) and logs structured financial data seamlessly into Google Sheets.

## ✨ Features

* 📩 **Email Auto-Tracking**: Automatically processes all sort of receipt with email notification, logs data to Google Sheets, and sends push notifications to LINE.
* 💬 **LINE Bot Interface**: Parse text inputs via conversational AI, automatically categorizing expenses, extracting items, and determining totals.
* ✏️ **Smart Editing via Reply**: Modify existing transaction records seamlessly by quoting/replying to previous messages in LINE.
* 📊 **Automated Google Sheets Management**: GAS handles dynamic monthly sheet creation (e.g., `2026_01`), formatting, and row management automatically.
* ⚡ **Deduplication Safeguard**: In-memory caching prevents duplicate email triggers within short time intervals.

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

Create a .env file in the root directory (refer to .env.example):

```text
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_USER_ID=your_line_user_id
GEMINI_API_KEY=your_gemini_api_key
GAS_API_URL=your_google_apps_script_web_app_url
```

*You will get the first two credentials once you build your own LINE Bot. Remember to enable the Webhook feature in the LINE Developers Console and verify it. (For local testing, LINE requires an HTTP tunnel like ngrok, but for online deployment, your Webhook URL will be configured in step 4).*

### 3. Google Apps Script (GAS) Setup

1. Open a blank Google Sheet and go to Extensions -> Apps Script.
2. Replace the editor code with the code from gas/Code.gs in this project.
3. Click Deploy -> New deployment.
4. Choose Web app as the type:
    - Execute as: *Me*
    - Who has access: *Anyone*
5. Copy the generated Web App URL and set it as `GAS_API_URL` in your *.env* file.

### Run the Application

```bash
python main.py
```

---

## 🌐 Cloud Deployment (e.g., Render)

1. Push your code to *GitHub*.
2. Create a new Web Service on *Render* and connect your repository.
3. Build Command: pip install -r requirements.txt
4. Start Command: gunicorn main:app
5. Configure the Environment Variables in Render with your .env values.
6. Set your Webhook URL in LINE Developers Console to: [https://your-render-app.onrender.com/webhook/line](https://your-render-app.onrender.com/webhook/line)

*(Now you have completed your online deployment. Go back to the LINE Developers Console, verify the Webhook link, and test if everything works smoothly from the backend.)*

---

## 📲 Email & iOS Shortcut Setup (Optional)

To forward emails received automatically to this backend:

1. Create an iOS "Get contents of URL" Shortcut with an automation trigger when receiving emails with specific criteria (e.g., *subjects* or *sender*).
2. Configure the HTTP POST request body as JSON:

```BASH
{
  "text": "Your Email Content Here"
}
```

Target Webhook Endpoint: [https://your-render-app.onrender.com/webhook/email](https://your-render-app.onrender.com/webhook/email)


