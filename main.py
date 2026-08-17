import os
import json
import re
import datetime
from datetime import timezone, timedelta
import requests
from flask import Flask, request, jsonify
from google import genai 
from dotenv import load_dotenv
import time

load_dotenv()

app = Flask(__name__)

TZ_TW = timezone(timedelta(hours=8))

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
GAS_API_URL = os.getenv("GAS_API_URL")
LINE_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
LINE_USER_ID = os.getenv("LINE_USER_ID")

last_recorded_cache = {
    "key": "",
    "timestamp": 0
}

def clean_and_parse_json(text):
    try:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            json_str = match.group(0)
            return json.loads(json_str)
        else:
            clean_text = text.replace("```json", "").replace("```", "").strip()
            return json.loads(clean_text)
    except Exception as e:
        print(f"❌ JSON 解析失敗，原始文字為:\n{text}")
        raise ValueError(f"LLM 回傳非合法 JSON 格式: {e}")

def push_line_message(user_id, text_message):
    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_TOKEN}"
    }
    payload = {
        "to": user_id,
        "messages": [{"type": "text", "text": text_message}]
    }
    res = requests.post(url, headers=headers, json=payload)
    print(f"Push Line Status: {res.status_code}")
    
    try:
        res_data = res.json()
        sent_messages = res_data.get("sentMessages", [])
        if sent_messages:
            return sent_messages[0].get("id")
    except Exception as e:
        print(f"無法取得 Push Message ID: {e}")
    return None

def get_system_prompt():
    now_time = datetime.datetime.now(TZ_TW).strftime("%Y-%m-%d %H:%M")
    
    return f"""你是一個專業的記帳 Agent。你的任務是解析使用者傳來的「文字訊息」或「Email 內文」，並輸出嚴格的 JSON 格式。

當前時間基準：{now_time}

【時間與日期規則】
1. date (日期) 與 time (時間)：
   - 請以【交易發生當下】或【收到信件的時間】為準（預設參考當前時間基準：{now_time}）。
   - 【重點限制】：解析高鐵/台鐵/班機等票券 Email 時，【嚴禁】拿票面上的「出發時間/搭乘時間」充當記帳時間！必須使用刷卡/通知時間或當前時間。
   - time 格式必須嚴格補零為 24 小時制的 HH:mm (例如：07:00、09:05、14:30)。

【分類規則】
1. 類別限定為：餐飲、交通、日用、服飾、娛樂、其他。
2. 簽帳卡/信用卡或未載明類別的消費，預設分類為：餐飲。
3. 高鐵、台鐵、加油、停車費，分類為：交通。

【Email 解析專屬規則】
1. item (項目)：
   - 若為簽帳卡/信用卡通知，項目固定填寫：「XX銀行簽帳卡/信用卡」（請將 XX 替換為實際發卡銀行名稱，若未提及則寫「銀行簽帳卡」）。
   - 若為高鐵購票通知，項目固定填寫：「台灣高鐵」。
2. note (備註/支付方式)：
   - 【銀行信件】：固定尋找卡號末四碼，填寫格式為「卡號末四碼XXXX」（例如：「卡號末四碼1234」）。若信件未寫卡號則填「銀行簽帳卡」。
   - 【台灣高鐵信件】：必須精準擷取起訖站，固定格式填寫「行程：[起點站]－[終點站]」（例如：「行程：台北－左營」）。
   - 其他一般訊息若無特殊說明，note 填 null。

【動作與邏輯判斷規則】
1. 動作 (action)：
   - 若使用者提及「改」、「修改」、「修正」、「打錯」、「算錯」、「改為」、「改成」，或更動結帳狀態（如「我全出」、「自己付」、「算我的」），action 請傳 "update"。
   - 否則 action 一律傳 "add"。

2. 欄位補全機制 (當 action 為 update 時)：
   - target_price / target_item：用於定位舊資料。若使用者未明確提及舊金額或舊項目，請填 null，由系統自動鎖定最新紀錄。
   - advance_payment：若語意表達「自己全付、請客、取消平分」，代表無人代墊，請傳 0。若未提及變動則傳 null（保持舊值）。
   - 未提及變動的欄位（如 price, category, item, note）：若語意中無相關新資訊，請傳 null，避免覆蓋原資料。

請嚴格輸出 JSON 格式（絕對不要包含 ```json 或 ``` 等 markdown 標籤）：
{{
    "action": "add 或 update",
    "target_price": 修改目標金額 (若 action 為 update 且有舊金額才填，否則 null),
    "target_item": "修改目標舊店家關鍵字 (若 action 為 update 且有舊項目才填，否則 null)",
    "item": "店家或項目名稱 (若為 update 且未變更可為 null)",
    "price": 消費總金額數字,
    "category": "分類",
    "advance_payment": 代墊金額數字,
    "note": "備註說明 (照 Email 解析專屬規則填寫，無備註則填 null)",
    "date": "YYYY-MM-DD",
    "time": "HH:MM"
}}
"""

@app.route('/webhook/email', methods=['GET', 'HEAD', 'POST'])
def process_email():
    if request.method in ['GET', 'HEAD']:
        return "Webhook endpoint is active!", 200

    data = request.get_json(force=True, silent=True) or {}
    email_text = data.get("text", "")

    if not email_text:
        return jsonify({"status": "error", "message": "No text"}), 400

    now = datetime.datetime.now(TZ_TW)
    current_sheet = now.strftime("%Y_%m")

    try:
        prompt = f"{get_system_prompt()}\n\n請解析這封 Email 內容：\n{email_text}"
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
        )
        
        parsed = clean_and_parse_json(response.text)
        parsed["sheet_name"] = current_sheet

        item_name = parsed.get('item', '未具名')
        price_val = parsed.get('price', 0)
        cat_val = parsed.get('category', '餐飲')
        action = parsed.get('action', 'add')

        if action == 'add':
            current_time = time.time()
            record_key = f"{item_name}_{price_val}"
            
            if record_key == last_recorded_cache["key"] and (current_time - last_recorded_cache["timestamp"]) < 10:
                print(f"⚠️ 偵測到重複 Email 觸發 ({record_key})，已自動攔截！")
                return jsonify({"status": "ignored", "message": "Duplicate request in 10s"}), 200
            
            last_recorded_cache["key"] = record_key
            last_recorded_cache["timestamp"] = current_time

        msg = f"🤖【自動記帳成功】\n{item_name} ${price_val} ({cat_val})"
        
        msg_id = None
        if LINE_USER_ID:
            msg_id = push_line_message(LINE_USER_ID, msg)

        parsed["line_message_id"] = msg_id
        gas_res = requests.post(GAS_API_URL, json=parsed).json()

        return jsonify({"status": "success", "data": parsed, "gas": gas_res}), 200

    except Exception as e:
        print(f"❌ Email 處理錯誤: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/webhook/line', methods=['POST'])
def process_line():
    req = request.get_json(force=True, silent=True) or {}
    events = req.get("events", [])
    
    if not events:
        return "OK", 200

    for event in events:
        try:
            if event.get("type") == "message" and event["message"]["type"] == "text":
                user_msg = event["message"]["text"]
                reply_token = event["replyToken"]

                if len(user_msg) > 500:
                    requests.post("https://api.line.me/v2/bot/message/reply", headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {LINE_TOKEN}"
                    }, json={
                        "replyToken": reply_token,
                        "messages": [{"type": "text", "text": "⚠️ 訊息字數超過 500 字上限，已取消處理。"}]
                    })
                    continue

                quoted_msg_id = event["message"].get("quotedMessageId")
                now = datetime.datetime.now(TZ_TW)
                current_sheet = now.strftime("%Y_%m")

                prompt = f"{get_system_prompt()}\n\n請解析這段對話內容：\n{user_msg}"
                response = client.models.generate_content(
                    model='gemini-3.1-flash-lite',
                    contents=prompt,
                )

                parsed = clean_and_parse_json(response.text)
                parsed["sheet_name"] = current_sheet

                if quoted_msg_id:
                    parsed["action"] = "update"
                    parsed["quoted_message_id"] = quoted_msg_id

                gas_res = requests.post(GAS_API_URL, json=parsed).json()
                action_type = gas_res.get("action", "added")

                reply_prompt = f"""
你是一個嚴謹但親切個人記帳助手。請根據以下記帳結果，用一句簡短、自然、口語且帶有適當表情符號的繁體中文文字回覆使用者。

使用者剛剛傳的訊息："{user_msg}"
處理動作：{"修改舊紀錄" if action_type == "updated" else "新增紀錄"}
最後項目名稱：{parsed.get('item') or "原本項目"}
最後總金額：{f"${parsed.get('price')}" if parsed.get('price') else "維持原金額"}
代墊金額：{parsed.get('advance_payment')} (若為0代表無代墊/全額自付)
分類：{parsed.get('category')}

要求：
1. 語氣自然親切，不要死板。
2. 若是單純記帳，只能輸出[✅【記帳成功】](下一行) [項目名稱] [金額] ([類別])
3. 若是關於「修改」，開頭必須為[✏【修改成功】](下一行)，接著必須簡短（不可超過15字，不用閒聊或贅詞）、清楚讓使用者知道「最後幫他改成什麼了」即可，不用問候。
4. 嚴格禁止輸出 JSON 或 markdown code block，直接輸出回覆純文字。
"""
                
                reply_response = client.models.generate_content(
                    model='gemini-3.1-flash-lite',
                    contents=reply_prompt,
                )
                reply_text = reply_response.text.strip()

                requests.post("https://api.line.me/v2/bot/message/reply", headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {LINE_TOKEN}"
                }, json={
                    "replyToken": reply_token,
                    "messages": [{"type": "text", "text": reply_text}]
                })
        except Exception as e:
            print(f"❌ LINE 訊息處理錯誤: {e}")

    return "OK", 200

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5001))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    app.run(host='0.0.0.0', port=port, debug=debug)