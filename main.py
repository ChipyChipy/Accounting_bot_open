import os
import json
import re
import time
import threading
from datetime import datetime, timezone, timedelta
from urllib.parse import quote
import gc

import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from google import genai
from google.genai import types

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

# --------------------------------------------------
# 📱 1. Quick Reply (氣泡按鈕) 產生器
# --------------------------------------------------
def get_quick_reply_payload():
    """產生 LINE 的 Quick Reply (氣泡按鈕) 結構"""
    return {
        "items": [
            {
                "type": "action",
                "action": {
                    "type": "message",
                    "label": "📊 本日結算",
                    "text": "本日結算"
                }
            },
            {
                "type": "action",
                "action": {
                    "type": "message",
                    "label": "📅 本週結算",
                    "text": "本週結算"
                }
            },
            {
                "type": "action",
                "action": {
                    "type": "message",
                    "label": "🗓️ 本月結算",
                    "text": "本月結算"
                }
            },
            {
                "type": "action",
                "action": {
                    "type": "message",
                    "label": "🗓️ 上月結算",
                    "text": "上月結算"
                }
            }
        ]
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

# --------------------------------------------------
# 📱 2. reply_line_message 支援 Quick Reply
# --------------------------------------------------
def reply_line_message(reply_token, messages, with_quick_reply=False):
    """
    發送 Reply 訊息給 LINE。
    messages 可為字串 (單一純文字) 或串列 (多個訊息 payload)
    with_quick_reply: 是否在最後一個訊息帶上快捷按鈕
    """
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_TOKEN}"
    }
    
    if isinstance(messages, str):
        payload_messages = [{"type": "text", "text": messages}]
    else:
        payload_messages = messages

    if with_quick_reply and payload_messages:
        payload_messages[-1]["quickReply"] = get_quick_reply_payload()

    payload = {
        "replyToken": reply_token,
        "messages": payload_messages
    }
    try:
        res = requests.post(url, headers=headers, json=payload)
        print(f"Reply Line Status: {res.status_code}")
    except Exception as e:
        print(f"❌ 發送 LINE 訊息失敗: {e}")

def get_system_prompt():
    now_time = datetime.datetime.now(TZ_TW).strftime("%Y-%m-%d %H:%M")
    
    return f"""你是一個專業的記帳 Agent。你的任務是解析使用者傳來的「文字訊息」或「Email 內文」，並輸出嚴格的 JSON 格式。

當前系統時間基準：{now_time}

【時間與日期規則】
1. date (日期) 與 time (時間)：
   - 請以【交易發生當下】或【收到信件的時間】為準，若使用者提及相對時間（例如「昨天」、「上週三」、「下午五點」），【必須】嚴格以當前系統時間基準 ({now_time}) 計算出精準的絕對日期 (YYYY-MM-DD) 與時間 (HH:mm)。
   - 解析高鐵/台鐵/班機等票券 Email 時，【嚴禁】拿票面上的「出發時間/搭乘時間」充當記帳時間！必須使用刷卡/通知時間或當前時間。
   - time 格式必須嚴格補零為 24 小時制的 HH:mm (例如：07:00、09:05、17:00)。

【分類規則】
1. 類別限定為：餐飲、交通、日用、服飾、娛樂、其他、收入。
2. 簽帳卡或未載明類別的消費，預設分類為：餐飲。
3. 高鐵、台鐵、加油、停車費，分類為：交通。
4. 如果使用者提到「發薪水」、「收到外快」、「賺了500」、「賺」、「拿到xxx元」等，請將 category 設為 "收入"。
5. 如果使用者提到「看醫生」、「治療」、「健康檢查」等關於就醫的字眼，請將 category 設為 "其他"。

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
   - 情境補充/補述語氣自動判斷為修改 (action: "update")：若訊息包含「是...」、「備註...」、「意思是...」、「因為...」、「其實是...」等說明性文字，且沒有明確點出數字金額時，action優先傳"update"
   - 禁止新增 $0 元的記帳：若使用者輸入的文字完全沒有提及金額數字，且不是在記錄純文字事項，action應優先傳"update"，除非明確說明 $0 元（例如「免費」、「抽到」），否則不得自動新增 $0 元的帳目。
   - 否則 action 一律傳 "add"。

2. 欄位補全機制 (當 action 為 update 時)：
   - target_price / target_item：用於定位舊資料。若使用者未明確提及舊金額或舊項目，請填 null，由系統自動鎖定最新紀錄。
   - advance_payment：若語意表達「自己全付、請客、取消平分」，代表無人代墊，請傳 0。若未提及變動則傳 null（保持舊值）。
   - 未提及變動的欄位（如 price, category, item, note, date, time）：若語意中無相關新資訊，請傳 null，避免覆蓋原資料。

【相對時間與特例解析規則】
1. 「同一天 / 當天」：
   - 代表【日期保持原紀錄不變】，僅針對使用者提及的新時間點（如「同一天的下午五點」）修改 time 欄位，date 請傳 null。
2. 「同一時間 / 剛才的時間」：
   - 代表【時間保持原紀錄不變】，僅針對使用者提及的新日期（如「昨天的同一時間」）修改 date 欄位，time 請傳 null。
3. 若使用者未明確提及日期或時間變更，請將未變動的 date 或 time 傳 null，由後端 GAS 保持原資料。   

請嚴格輸出 JSON 格式（絕對不要包含 ```json 或 ``` 等 markdown 標籤）：
{{
    "action": "add 或 update",
    "target_price": 修改目標金額 (若 action 為 update 且有舊金額才填，否則 null),
    "target_item": "修改目標舊店家關鍵字 (若 action 為 update 且有舊項目才填，否則 null)",
    "item": "店家或項目名稱 (若為 update 且未變更可為 null)",
    "price": 消費總金額數字 (若未變更可為 null),
    "category": "分類 (若未變更可為 null)",
    "advance_payment": 代墊金額數字 (若未變更可為 null),
    "note": "備註說明 (照Email解析專屬規則填寫，無備註則填null)",
    "date": "YYYY-MM-DD (若未變更可為 null)",
    "time": "HH:MM (若未變更可為 null)"
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
            config=types.GenerateContentConfig(
                temperature=0.0
            )
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

@app.route('/webhook/health', methods=['GET', 'HEAD'])
def health_check():
    def warm_up():
        try:
            requests.post(GAS_API_URL, json={"action": "ping"}, timeout=3)
        except Exception:
            pass
    
    threading.Thread(target=warm_up).start()
    return "OK", 200

@app.route('/webhook/line', methods=['POST'])
def process_line():
    req = request.get_json(force=True, silent=True) or {}
    events = req.get("events", [])
    
    if not events:
        return "OK", 200

    for event in events:
        reply_token = None
        try:
            if event.get("type") == "message" and event["message"]["type"] == "text":
                user_msg = event["message"]["text"].strip()
                reply_token = event.get("replyToken")

                # 1. 字數限制檢查
                if len(user_msg) > 500:
                    if reply_token:
                        reply_line_message(reply_token, "⚠️ 訊息字數超過 500 字上限，已取消處理。")
                    continue

                now = datetime.now(TZ_TW)
                current_sheet = now.strftime("%Y_%m")

                # --------------------------------------------------
                # 🎯 情況 A：結算指令處理 (快速通道)
                # --------------------------------------------------
                if user_msg in ["本日結算", "本週結算", "本月結算", "上月結算"]:
                    try:
                        # 🎯 修正：使用全域時區變數 TZ_TW
                        now_tw = datetime.now(TZ_TW)
                        
                        # 1. 判斷是否為「上月結算」，並計算目標工作表名稱與結算類型
                        if user_msg == "上月結算":
                            if now_tw.month == 1:
                                target_year = now_tw.year - 1
                                target_month = 12
                            else:
                                target_year = now_tw.year
                                target_month = now_tw.month - 1
                            
                            target_sheet = f"{target_year}_{target_month:02d}"
                            summary_type = "本月結算"
                        else:
                            target_sheet = current_sheet
                            summary_type = user_msg

                        # 2. 組成 Payload 傳送給 GAS
                        summary_payload = {
                            "action": "summary",
                            "summary_type": summary_type,
                            "sheet_name": target_sheet
                        }

                        res = requests.post(GAS_API_URL, json=summary_payload, timeout=15)
                        gas_res = res.json()

                        if gas_res.get("status") == "empty":
                            reply_line_message(reply_token, f"📊 【{user_msg}】\n尚無任何支出紀錄！", with_quick_reply=True)
                            continue

                        total_expense = gas_res.get("total_expense", 0)
                        top_cat = gas_res.get("top_cat", "無")
                        max_amount = gas_res.get("max_amount", 0)
                        cat_totals = gas_res.get("cat_totals", {})
                        show_chart = gas_res.get("show_chart", True)
                        achievements = gas_res.get("achievements", [])

                        msg_text = f"📊 【{user_msg}統計報告】\n" \
                                   f"💰 總支出：${total_expense:,}\n" \
                                   f"🔥 最高開銷：{top_cat} (${max_amount:,})\n" \
                                   f"──────────────\n"

                        active_labels = []
                        active_data = []

                        for cat, amt in cat_totals.items():
                            if amt > 0 and cat != "收入":
                                msg_text += f"{cat}：${amt:,}\n"
                                active_labels.append(cat)
                                active_data.append(amt)

                        if achievements:
                            msg_text += "\n🏆 【本期成就解鎖】\n"
                            for ach in achievements[:15]:
                                msg_text += f"• {ach}\n"

                        reply_payload = [{"type": "text", "text": msg_text.strip()}]

                        if show_chart and active_data:
                            chart_config = {
                                "type": "doughnut",
                                "data": {
                                    "labels": active_labels,
                                    "datasets": [{"data": active_data}]
                                },
                                "options": {
                                    "plugins": {
                                        "datalabels": {
                                            "color": "#fff",
                                            "font": {"weight": "bold", "size": 14}
                                        }
                                    }
                                }
                            }
                            # 🎯 修正：改用 urllib.parse 匯入的 quote
                            chart_url = f"https://quickchart.io/chart?c={quote(json.dumps(chart_config))}&bkg=white&w=500&h=400"
                            reply_payload.append({
                                "type": "image",
                                "originalContentUrl": chart_url,
                                "previewImageUrl": chart_url
                            })

                        reply_line_message(reply_token, reply_payload, with_quick_reply=True)
                        continue

                    except Exception as err:
                        print(f"❌ 結算處理過程出錯: {err}")
                        reply_line_message(reply_token, f"⚠️ 取得{user_msg}資料時發生錯誤，請稍後再試。", with_quick_reply=True)
                        continue

                # --------------------------------------------------
                # 🎯 情況 B：一般記帳 / 修改紀錄處理 (呼叫 Gemini)
                # --------------------------------------------------
                quoted_msg_id = event["message"].get("quotedMessageId")

                prompt = f"{get_system_prompt()}\n\n請解析這段對話內容：\n{user_msg}"
                response = client.models.generate_content(
                    model='gemini-3.1-flash-lite',
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.0
                    )
                )

                parsed = clean_and_parse_json(response.text)
                parsed["sheet_name"] = current_sheet

                if quoted_msg_id:
                    parsed["action"] = "update"
                    parsed["quoted_message_id"] = quoted_msg_id

                gas_res = requests.post(GAS_API_URL, json=parsed).json()
                action_type = gas_res.get("action", "added")

                parsed_date = parsed.get("date")
                parsed_time = parsed.get("time")
                time_info = f"{parsed_date} {parsed_time}".strip() if (parsed_date or parsed_time) else "未調整時間"

                reply_prompt = f"""
你是一個嚴謹但親切個人記帳助手。請根據以下記帳結果，用一句簡短、自然、口語且帶有適當表情符號的繁體中文文字回覆使用者。

使用者剛剛傳的訊息："{user_msg}"
處理動作：{"修改舊紀錄" if action_type == "updated" else "新增紀錄"}
最後項目名稱：{parsed.get('item') or "原本項目"}
最後總金額：{f"${parsed.get('price')}" if parsed.get('price') is not None else "維持原金額"}
代墊金額：{parsed.get('advance_payment')} (若為 null 保持原樣，若為 0 代表全額自付)
分類：{parsed.get('category')}
修改時間結果：{time_info}

要求：
1. 語氣自然親切，不可死板。
2. 若是單純新增記帳，輸出格式必須為：
✅【記帳成功】
[項目名稱] $[金額] ([類別]) [適當Emoji]
3. 若是關於「修改」，開頭必須為✏️【修改成功】，接著換行並簡短（不可超過15字，不用閒聊或贅詞）、清楚讓使用者知道「最後幫他改成什麼了」即可，不用問候。
4. 標點符號與 Emoji 規範：句尾若有表情符號，請不要在表情符號前面加上句號「。」（範例：『調整為明天早上九點囉！🗓️』或『已為您更新！⏰』，避免出現『。⏰』）。
5. 嚴格禁止輸出 JSON 或 markdown code block，直接輸出回覆純文字。

"""
                
                reply_response = client.models.generate_content(
                    model='gemini-3.1-flash-lite',
                    contents=reply_prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2
                    )
                )
                reply_text = reply_response.text.strip()

                if reply_token:
                    reply_line_message(reply_token, reply_text, with_quick_reply=True)

        except Exception as e:
            print(f"❌ LINE 訊息處理錯誤: {e}")
            if reply_token:
                reply_line_message(reply_token, f"⚠️ 記帳處理失敗\n原因：{str(e)}")
        finally:
            gc.collect()

    return "OK", 200

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5001))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    app.run(host='0.0.0.0', port=port, debug=debug)