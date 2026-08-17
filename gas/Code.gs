function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || "add"; // 預設動作為 add
    var defaultSheetName = Utilities.formatDate(new Date(), "GMT+8", "yyyy_MM");
    var sheetName = data.sheet_name || defaultSheetName;  // 預設分頁名稱
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    
    // --- 1. 若分頁不存在，建立新分頁並設定格式與標題 ---
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      
      // 寫入標題列 (H欄為隱藏的 Message ID)
      var headers = ["日期時間", "類別", "項目名稱", "總金額", "代墊金額", "實付金額", "備註/支付方式", "LINE_Msg_ID"];
      sheet.appendRow(headers);
      
      // 標題列美化 (A1:H1)
      var headerRange = sheet.getRange("A1:H1");
      headerRange.setBackground("#E0F7FA");          // 淡青色
      headerRange.setFontWeight("bold");               // 粗體
      headerRange.setHorizontalAlignment("center");  // 置中
      headerRange.setVerticalAlignment("middle");
      
      // 設定欄寬
      sheet.setColumnWidth(1, 160); // A: 日期時間
      sheet.setColumnWidth(2, 80);  // B: 類別
      sheet.setColumnWidth(3, 200); // C: 項目名稱
      sheet.setColumnWidth(4, 100); // D: 總金額
      sheet.setColumnWidth(5, 100); // E: 代墊金額
      sheet.setColumnWidth(6, 100); // F: 實付金額
      sheet.setColumnWidth(7, 250); // G: 備註
      sheet.setColumnWidth(8, 180); // H: Message ID (供精準定位用)
      
      // 凍結第一列
      sheet.setFrozenRows(1);

      // 設定整欄對齊格式 (B, D, E, F, H 欄均置中)
      sheet.getRange("B:B").setHorizontalAlignment("center");
      sheet.getRange("D:F").setHorizontalAlignment("center");
      sheet.getRange("H:H").setHorizontalAlignment("center"); // H欄整欄置中
    }

    // --- 2. 處理修改邏輯 (update) ---
    if (action === "update") {
      var quotedMsgId = data.quoted_message_id; // LINE 回覆特有的訊息 ID
      var targetPrice = data.target_price;
      var targetItem = data.target_item;
      var lastRow = sheet.getLastRow();
      var targetRow = -1;

      // 🎯 優先搜尋條件 1：如果有 quoted_message_id，精準比對 H 欄 (LINE_Msg_ID)
      if (quotedMsgId) {
        for (var i = lastRow; i >= 2; i--) {
          var rowMsgId = sheet.getRange(i, 8).getValue(); // H欄: LINE_Msg_ID
          if (rowMsgId && rowMsgId.toString() === quotedMsgId.toString()) {
            targetRow = i;
            break; // 百分百精準命中，直接跳出迴圈！
          }
        }
      }

      // 🎯 備用搜尋條件 2：如果不是用「回覆」或沒對應到 ID，退回原本的目標比對邏輯
      if (targetRow === -1) {
        if (!targetPrice && !targetItem) {
          targetRow = lastRow; // 預設修改最新一列
        } else {
          for (var i = lastRow; i >= 2; i--) {
            var rowPrice = sheet.getRange(i, 4).getValue(); // D欄: 總金額
            var rowItem = sheet.getRange(i, 3).getValue();  // C欄: 項目名稱
            
            if ((targetPrice && rowPrice == targetPrice) || (targetItem && rowItem.indexOf(targetItem) !== -1)) {
              targetRow = i;
              break;
            }
          }
        }
      }

      // 執行更新（有傳值的才覆蓋，null 的保持原樣）
      if (targetRow > 1) {
        if (data.category) sheet.getRange(targetRow, 2).setValue(data.category);
        if (data.item) sheet.getRange(targetRow, 3).setValue(data.item);
        if (data.price !== null && data.price !== undefined) {
          sheet.getRange(targetRow, 4).setValue(data.price);
        }
        if (data.advance_payment !== null && data.advance_payment !== undefined) {
          sheet.getRange(targetRow, 5).setValue(data.advance_payment);
        }
        
        // 重新計算 F欄: 實付金額 (總金額 - 代墊)
        var finalPrice = sheet.getRange(targetRow, 4).getValue();
        var finalAdvance = sheet.getRange(targetRow, 5).getValue();
        sheet.getRange(targetRow, 6).setValue(finalPrice - finalAdvance);
        
        if (data.note) sheet.getRange(targetRow, 7).setValue(data.note);
        
        return ContentService.createTextOutput(JSON.stringify({
          "status": "success", 
          "action": "updated",
          "row": targetRow
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        // 若找不到可修改的舊目標，自動降級轉為新增動作
        action = "add";
      }
    }

// --- 3. 處理新增邏輯 (add) ---
    if (action === "add") {
      // 日期與時間格式化補零處理
      var formattedDate = data.date || Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd");
      var rawTime = data.time || Utilities.formatDate(new Date(), "GMT+8", "HH:mm");
      
      // 強制將時間補齊為 HH:mm
      var timeParts = rawTime.split(":");
      if (timeParts.length === 2) {
        var hour = timeParts[0].padStart(2, "0");
        var minute = timeParts[1].padStart(2, "0");
        rawTime = hour + ":" + minute;
      }
      
      var fullTime = formattedDate + " " + rawTime;

      var category = data.category || "餐飲";
      var item = data.item || "未命名項目";
      var price = Number(data.price) || 0;
      var advance = Number(data.advance_payment) || 0;
      var actualPay = price - advance;
      var note = data.note || "";
      var lineMsgId = data.line_message_id || "";

      // 寫入資料 (A~H欄)
      sheet.appendRow([fullTime, category, item, price, advance, actualPay, note, lineMsgId]);

      var newLastRow = sheet.getLastRow();
      
      // 🎯 強制將 A 欄（日期時間）設定為純文字格式
      var timeCell = sheet.getRange(newLastRow, 1);
      timeCell.setNumberFormat("@");
      timeCell.setValue(fullTime);

      // 🎯【重點修正】：明確設定『新新增的這一列』各欄位的對齊方式
      sheet.getRange(newLastRow, 1).setHorizontalAlignment("center"); // A欄: 日期時間置中
      sheet.getRange(newLastRow, 2).setHorizontalAlignment("center"); // B欄: 類別置中
      sheet.getRange(newLastRow, 4, 1, 3).setHorizontalAlignment("center"); // D, E, F欄: 金額置中
      sheet.getRange(newLastRow, 8).setHorizontalAlignment("center"); // H欄: Msg_ID置中

      return ContentService.createTextOutput(JSON.stringify({
        "status": "success", 
        "action": "added"
      })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error", 
      "message": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}