/**
 * 🎯 Web App 入口點 (doPost)
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var now = new Date();
    var defaultSheetName = Utilities.formatDate(now, "GMT+8", "yyyy_MM");

    var action = data.action || "add";
    var sheetName = data.sheet_name || defaultSheetName;

    // summary 不需要為了查詢而強制建立月份表或 Statistics
    if (action === "summary") {
      var summaryResult = getSummaryData(ss, data.summary_type, sheetName);
      return ContentService.createTextOutput(JSON.stringify(summaryResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 先確認真正要操作的月份工作表存在
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);

      var headers = [
        "日期時間",
        "類別",
        "項目名稱",
        "總金額",
        "代墊金額",
        "實付金額",
        "備註/支付方式",
        "LINE_Msg_ID"
      ];

      sheet.appendRow(headers);

      var headerRange = sheet.getRange("A1:H1");
      headerRange.setBackground("#E0F7FA");
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      headerRange.setVerticalAlignment("middle");

      sheet.setColumnWidth(1, 160);
      sheet.setColumnWidth(2, 80);
      sheet.setColumnWidth(3, 200);
      sheet.setColumnWidth(4, 100);
      sheet.setColumnWidth(5, 100);
      sheet.setColumnWidth(6, 100);
      sheet.setColumnWidth(7, 250);
      sheet.setColumnWidth(8, 180);

      sheet.setFrozenRows(1);
      sheet.getRange("B:B").setHorizontalAlignment("center");
      sheet.getRange("D:F").setHorizontalAlignment("center");
      sheet.getRange("H:H").setHorizontalAlignment("center");
    }

    // 到這裡月份工作表已經確定存在，再更新 Statistics
    initOrUpdateStatisticsSheet(ss, sheetName);

    if (action === "update") {
      var quotedMsgId = data.quoted_message_id;
      var targetPrice = data.target_price;
      var targetItem = data.target_item;
      var lastRow = sheet.getLastRow();
      var targetRow = -1;

      if (quotedMsgId) {
        for (var i = lastRow; i >= 2; i--) {
          var rowMsgId = sheet.getRange(i, 8).getValue();
          if (rowMsgId && rowMsgId.toString() === quotedMsgId.toString()) {
            targetRow = i;
            break;
          }
        }
      }

      if (targetRow === -1) {
        if (!targetPrice && !targetItem) {
          targetRow = lastRow;
        } else {
          for (var i = lastRow; i >= 2; i--) {
            var rowPrice = sheet.getRange(i, 4).getValue();
            var rowItem = sheet.getRange(i, 3).getValue();
            if ((targetPrice && rowPrice == targetPrice) || (targetItem && rowItem.indexOf(targetItem) !== -1)) {
              targetRow = i;
              break;
            }
          }
        }
      }

      if (targetRow > 1) {
        if (data.date || data.time) {
          var currentRowFullTime = sheet.getRange(targetRow, 1).getValue().toString();
          var currentDate = data.date || currentRowFullTime.split(" ")[0];
          var currentTime = data.time || (currentRowFullTime.split(" ")[1] || "00:00");

          var timeParts = currentTime.split(":");
          if (timeParts.length === 2) {
            currentTime = timeParts[0].padStart(2, "0") + ":" + timeParts[1].padStart(2, "0");
          }

          var newFullTime = currentDate + " " + currentTime;
          var timeCell = sheet.getRange(targetRow, 1);
          timeCell.setNumberFormat("@");
          timeCell.setValue(newFullTime);
        }

        if (data.category) sheet.getRange(targetRow, 2).setValue(data.category);
        if (data.item) sheet.getRange(targetRow, 3).setValue(data.item);

        if (data.price !== null && data.price !== undefined) {
          sheet.getRange(targetRow, 4).setValue(data.price);
        }
        if (data.advance_payment !== null && data.advance_payment !== undefined) {
          sheet.getRange(targetRow, 5).setValue(data.advance_payment);
        }

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
        action = "add";
      }
    }

    if (action === "add") {
      var formattedDate = data.date || Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd");
      var rawTime = data.time || Utilities.formatDate(new Date(), "GMT+8", "HH:mm");

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

      sheet.appendRow([fullTime, category, item, price, advance, actualPay, note, lineMsgId]);

      var newLastRow = sheet.getLastRow();
      var timeCell = sheet.getRange(newLastRow, 1);
      timeCell.setNumberFormat("@");
      timeCell.setValue(fullTime);

      sheet.getRange(newLastRow, 1).setHorizontalAlignment("center");
      sheet.getRange(newLastRow, 2).setHorizontalAlignment("center");
      sheet.getRange(newLastRow, 4, 1, 3).setHorizontalAlignment("center");
      sheet.getRange(newLastRow, 8).setHorizontalAlignment("center");

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

/**
 * 📊 結算數據與成就運算
 */
function getSummaryData(ss, type, currentSheetName) {
  var sheet = ss.getSheetByName(currentSheetName);
  var catTotals = { "餐飲": 0, "交通": 0, "日用": 0, "服飾": 0, "娛樂": 0, "其他": 0, "收入": 0 };
  var totalExpense = 0;
  var totalIncome = 0;

  var now = new Date();
  var todayStr = Utilities.formatDate(now, "GMT+8", "yyyy-MM-dd");

  var showChart = true;
  var showAchievements = true;
  var statSheet = ss.getSheetByName("Statistics");

  // 🎯 讀取 Statistics 設定 (更嚴謹的 OFF 比對，防呆大小寫與空白)
  if (statSheet) {
    try {
      var valR1 = String(statSheet.getRange("P1").getValue()).trim().toUpperCase();
      var valT1 = String(statSheet.getRange("R1").getValue()).trim().toUpperCase();
      
      if (valR1 === "OFF") showChart = false;
      if (valT1 === "OFF") showAchievements = false;
    } catch (e) {}
  }

  if (!sheet) {
    return { status: "empty", show_chart: showChart, achievements: [] };
  }

  var data = sheet.getDataRange().getValues();
  var filteredRows = [];

  var dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); 
  var monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  for (var r = 1; r < data.length; r++) {
    var rawDateVal = String(data[r][0] || "").trim();
    if (!rawDateVal) continue;

    // 🛠️ 拆解日期字串，避免 JS Date 原生解析失敗
    var dateParts = rawDateVal.split(" ");
    var ymd = dateParts[0].split("-");
    if (ymd.length < 3) continue;

    var rowDate = new Date(Number(ymd[0]), Number(ymd[1]) - 1, Number(ymd[2]));
    var category = String(data[r][1] || "");
    var amount = Number(data[r][5]) || 0; 

    var rowDateStr = Utilities.formatDate(rowDate, "GMT+8", "yyyy-MM-dd");
    var isMatch = false;

    if (type === "本日結算" && rowDateStr === todayStr) {
      isMatch = true;
    } else if (type === "本週結算" && rowDate >= monday && rowDate <= now) {
      isMatch = true;
    } else if (type === "本月結算") {
      isMatch = true; 
    }

    if (isMatch) {
      filteredRows.push(data[r]);
      
      if (category === "收入") {
        totalIncome += amount;
        catTotals["收入"] += amount;
      } else {
        totalExpense += amount;
        if (catTotals.hasOwnProperty(category)) {
          catTotals[category] += amount;
        } else {
          catTotals["其他"] += amount;
        }
      }
    }
  }

  if (totalExpense === 0 && totalIncome === 0) {
    return { status: "empty", show_chart: showChart, achievements: [] };
  }

  var topCat = "";
  var maxAmount = 0;
  for (var cat in catTotals) {
    if (cat !== "收入" && catTotals[cat] > maxAmount) {
      maxAmount = catTotals[cat];
      topCat = cat;
    }
  }

  // 🎯 當 T1 為 OFF 時，showAchievements 為 false，直接回傳 []，不執行計算
  var achievements = [];
  if (showAchievements) {
    achievements = checkAchievements(filteredRows, type, data);
  }

  return {
    status: "success",
    total_expense: totalExpense,
    total_income: totalIncome,
    top_cat: topCat,
    max_amount: maxAmount,
    cat_totals: catTotals,
    show_chart: showChart,
    achievements: achievements
  };
}

/**
 * 🏆 客製化趣味成就判斷模組
 */
function checkAchievements(rows, summaryType, allSheetData) {
  var achievements = [];
  var amountAchievements = []; // 專門存放金額基礎成就

  // 1. 動態門檻設定
  var tNoodle = { "本日結算": 2, "本週結算": 6, "本月結算": 20 }[summaryType] || 20;
  var tDrink = { "本日結算": 3, "本週結算": 7, "本月結算": 25 }[summaryType] || 25;
  var tFastFood = { "本日結算": 2, "本週結算": 6, "本月結算": 20 }[summaryType] || 20;
  var tCvs = { "本日結算": 4, "本週結算": 12, "本月結算": 50 }[summaryType] || 50;
  var tSpicy = { "本日結算": 2, "本週結算": 4, "本月結算": 8 }[summaryType] || 8;
  var tAlcohol = { "本日結算": 2, "本週結算": 5, "本月結算": 12 }[summaryType] || 12;
  var tCoffee = { "本日結算": 2, "本週結算": 6, "本月結算": 20 }[summaryType] || 20;
  var tDiet = { "本日結算": 2, "本週結算": 7, "本月結算": 25 }[summaryType] || 25;
  var tMilk = { "本日結算": 2, "本週結算": 6, "本月結算": 16 }[summaryType] || 16;
  var tFeast = { "本日結算": 2, "本週結算": 4, "本月結算": 10 }[summaryType] || 10;
  var tFoodCourt = { "本日結算": 2, "本週結算": 6, "本月結算": 20 }[summaryType] || 20;
  var tMedical = { "本日結算": 1, "本週結算": 2, "本月結算": 4 }[summaryType] || 4;

  // 正則關鍵字定義
  var reNoodle = /麵|餃|包子|小籠包|叉燒包|水煎包|肉包|菜包|燒賣|鍋貼|雲吞|抄手|餛飩|八方雲集|八方|四海|四海遊龍/i;
  var reDrink = /茶|手搖|一沐日|五十嵐|50嵐|50藍|可不可|老賴|拾玖|龜記|烏弄|茶的魔手|迷克夏|麻古|清心福全|茶海|茶湯會|大苑子|珍煮丹|珍煮母|UG|八矅|得正|日出茶太|大茗|水巷茶弄|有飲|三分春色|鶴茶樓|鮮茶道|紅茶老爹|狐狸尾巴/i;
  var reFastFood = /炸|麥當勞|肯德基|必勝客|摩斯|披薩|繼光|小上海|鹹酥雞/i;
  var reCvs = /小七|7-11|統一|萊爾富|全家|超商/i;
  var reSpicy = /辣/i;
  var reAlcohol = /酒|酒吧|bar|居酒屋/i;
  var reCoffee = /咖啡|cafe|星巴克|路易莎/i;
  var reDiet = /健康餐盒|蛋白|雞胸|覓蠶|日嚐所需|蔬|肌/i;
  var reMilk = /奶|乳/i;
  var reFoodCourt = /美食街/i;
  var reMedical = /醫/i;

  var countNoodle = 0, countDrink = 0, countFastFood = 0, countCvs = 0;
  var countSpicy = 0, countAlcohol = 0, countCoffee = 0, countDiet = 0;
  var countMilk = 0, countFoodCourt = 0, countMedical = 0;

  var feastItems = new Set();
  var totalTrafficExpense = 0;
  var totalClothingExpense = 0; // 服飾累計
  var dailyExpenses = {};

  var has1k = false, has5k = false, has10k = false;

  rows.forEach(function(row) {
    var rawDateStr = String(row[0] || "");
    var dateParts = rawDateStr.split(" ");
    var dateStr = dateParts[0];
    var timeStr = dateParts[1] || "00:00";
    var hour = parseInt(timeStr.split(":")[0], 10) || 0;

    var category = String(row[1] || "");
    var item = String(row[2] || "");
    var actualPay = Number(row[5] || 0);
    var note = String(row[6] || "");
    var fullText = item + note;

    if (category === "收入") return;

    // 計算每日總支出
    dailyExpenses[dateStr] = (dailyExpenses[dateStr] || 0) + actualPay;

    // 🎯 1. 單筆通用金額成就觸發標記
    if (actualPay >= 1000) has1k = true;
    if (actualPay >= 5000) has5k = true;
    if (actualPay >= 10000) has10k = true;

    // 時間段與類別單筆成就
    if (hour >= 0 && hour < 5) {
      if (category === "餐飲") achievements.push("🌙【夜間食堂】 凌晨 00:00~05:00 享用美食");
      if (category === "交通") achievements.push("🚗【長途夜車】 凌晨 00:00~05:00 奔波在路上");
    }
    if ((hour >= 23 || hour < 5)) {
      if (category === "娛樂") achievements.push("🎭【午夜劇場】 深夜 23:00~05:00 精彩夜生活");
      if (reAlcohol.test(fullText)) achievements.push("🍶【不醉不歸】 深夜 23:00~05:00 小酌一杯");
    }
    if (hour >= 5 && hour < 7 && category === "餐飲") {
      achievements.push("🌅【早起鳥兒】 早上 05:00~07:00 享用早餐");
    }

    // 單筆金額成就 (特定類別)
    if (category === "餐飲" && actualPay >= 800) achievements.push("🥩【鳳髓龍肝】 單筆飲食大餐突破 $800");
    if (category === "交通" && actualPay >= 10000) achievements.push("✈️【出國囉】 單筆交通花費突破 $10,000");

    // 服飾累計金額
    if (category === "服飾") {
      totalClothingExpense += actualPay;
    }

    // 關鍵字計數
    if (reNoodle.test(fullText)) countNoodle++;
    if (reDrink.test(fullText)) countDrink++;
    if (reFastFood.test(fullText)) countFastFood++;
    if (reCvs.test(fullText)) countCvs++;
    if (reSpicy.test(fullText)) countSpicy++;
    if (reAlcohol.test(fullText)) countAlcohol++;
    if (reCoffee.test(fullText)) countCoffee++;
    if (reDiet.test(fullText)) countDiet++;
    if (reMilk.test(fullText)) countMilk++;
    if (reFoodCourt.test(fullText)) countFoodCourt++;
    if (reMedical.test(fullText)) countMedical++;

    // 滿漢全席判定 (金額 > 400 且無重複)
    if (actualPay > 400 && item && item !== "未命名項目") {
      feastItems.add(item);
    }

    // 交通總額累計
    if (category === "交通") {
      totalTrafficExpense += actualPay;
    }
  });

  // 黃金週末判斷
  for (var dStr in dailyExpenses) {
    var dObj = new Date(dStr);
    var day = dObj.getDay();
    if ((day === 0 || day === 6) && dailyExpenses[dStr] >= 3000) {
      achievements.push("✨【黃金週末】 週末單日總支出突破 $3,000");
      break;
    }
  }

  // 🎯 2. 服飾類成就
  if (totalClothingExpense > 1200) {
    achievements.push("👗【時尚達人】 服飾類消費超過 $1,200");
  }

  // 數量累積成就觸發
  if (countNoodle >= tNoodle) achievements.push("🍜【大碗寬麵】 麵食累計達標 (" + countNoodle + "次)");
  if (countDrink >= tDrink) achievements.push("🧋【飲料大亨】 手搖飲料狂熱者 (" + countDrink + "次)");
  if (countFastFood >= tFastFood) achievements.push("🍔【肥宅狂喜】 炸物/速食達人 (" + countFastFood + "次)");
  if (countCvs >= tCvs) achievements.push("🏪【微波食品】 超商好朋友 (" + countCvs + "次)");
  if (countSpicy >= tSpicy) achievements.push("🌶️【嗜辣如命】 辣味饗宴 (" + countSpicy + "次)");
  if (countAlcohol >= tAlcohol) achievements.push("🍺【酒精路跑】 小酌怡情 (" + countAlcohol + "次)");
  if (countCoffee >= tCoffee) achievements.push("☕【咖啡成癮】 續命咖啡 (" + countCoffee + "次)");
  if (countDiet >= tDiet) achievements.push("🥗【飲食控制】 健康餐盒 (" + countDiet + "次)");
  if (countMilk >= tMilk) achievements.push("🥛【我是奶龍】 奶類飲料控 (" + countMilk + "次)");
  if (countFoodCourt >= tFoodCourt) achievements.push("🏢【誠愛精勤】 美食街常客 (" + countFoodCourt + "次)");
  if (countMedical >= tMedical) achievements.push("💊【你還好嗎】 醫療相關紀錄 (" + countMedical + "次)");

  if (feastItems.size >= tFeast) {
    achievements.push("🍱【滿漢全席】 享用 " + feastItems.size + " 道不同的大餐(>$400)");
  }

  if (summaryType !== "本日結算" && totalTrafficExpense >= 1000) {
    achievements.push("🧳【異邦人】 累積交通費用超過 $1,000");
  }

  // 跨日連續成就判斷...
  if (allSheetData && allSheetData.length > 5) {
    var dateMap = {};
    for (var i = 1; i < allSheetData.length; i++) {
      var d = String(allSheetData[i][0]).split(" ")[0];
      var cat = String(allSheetData[i][1]);
      var itm = String(allSheetData[i][2]);
      var pay = Number(allSheetData[i][5]) || 0;

      if (!d || cat === "收入") continue;
      if (!dateMap[d]) dateMap[d] = [];
      dateMap[d].push({ category: cat, item: itm, pay: pay });
    }

    var sortedDates = Object.keys(dateMap).sort();
    var maxStreakNoRepeat = 0, maxStreakUnder150 = 0, maxStreakNoFood = 0;
    var streakNoRepeat = 1, streakUnder150 = 1, streakNoFood = 0;

    for (var k = 0; k < sortedDates.length - 1; k++) {
      var d1 = new Date(sortedDates[k]);
      var d2 = new Date(sortedDates[k+1]);
      var diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        var day1Food = dateMap[sortedDates[k]].filter(x => x.category === "餐飲");
        var day2Food = dateMap[sortedDates[k+1]].filter(x => x.category === "餐飲");

        var hasRepeat = false;
        var itemsSet = new Set(day1Food.map(x => x.item));
        day2Food.forEach(x => { if (itemsSet.has(x.item)) hasRepeat = true; });
        if (!hasRepeat && day1Food.length > 0 && day2Food.length > 0) streakNoRepeat++; else streakNoRepeat = 1;

        var day1Low = day1Food.length > 0 && day1Food.every(x => x.pay < 150);
        var day2Low = day2Food.length > 0 && day2Food.every(x => x.pay < 150);
        if (day1Low && day2Low) streakUnder150++; else streakUnder150 = 1;

        if (day1Food.length === 0 && day2Food.length === 0) streakNoFood++; else streakNoFood = 0;

      } else {
        streakNoRepeat = 1; streakUnder150 = 1; streakNoFood = 0;
      }

      if (streakNoRepeat > maxStreakNoRepeat) maxStreakNoRepeat = streakNoRepeat;
      if (streakUnder150 > maxStreakUnder150) maxStreakUnder150 = streakUnder150;
      if (streakNoFood > maxStreakNoFood) maxStreakNoFood = streakNoFood;
    }

    if (maxStreakNoRepeat >= 5) achievements.push("🥗【飲食均衡】 連續 5 天餐飲品項完全無重複！");
    if (maxStreakUnder150 >= 5) achievements.push("🍵【簞食瓢飲】 連續 5 天餐飲支出皆低於 $150！");
    if (maxStreakNoFood >= 5) achievements.push("☀️【光合作用】 連續 5 天無任何餐飲支出記錄！");
  }

  // 去重處理
  var uniqueAchievements = Array.from(new Set(achievements));

  // 🎯 3. 處理金額類別前三筆排序
  if (has1k) amountAchievements.push("💸【小試身手】 單筆消費超過 $1,000");
  if (has5k) amountAchievements.push("💳【揮金如土】 單筆消費超過 $5,000");
  if (has10k) amountAchievements.push("👑【富可敵國】 單筆消費超過 $10,000");

  var finalAchievements = amountAchievements.concat(uniqueAchievements);

  // 🎯 4. 特殊成就：一次解鎖超過10個成就 (放置於陣列最前端)
  if (finalAchievements.length >= 10) {
    finalAchievements.unshift("🌟【我們是怎麼走到這一步的】\n　　一次解鎖超過10個成就");
  }

  return finalAchievements;
}

/**
 * 🎯 自動維護 Statistics 工作表
 */
function initOrUpdateStatisticsSheet(ss, currentSheetName) {
  var statSheet = ss.getSheetByName("Statistics");
  var isNewStatistics = false;

  // =========================================================
  // 1. Statistics 不存在 → 建立
  // =========================================================
  if (!statSheet) {
    statSheet = ss.insertSheet("Statistics");
    isNewStatistics = true;

    var headers = [
      "月份",
      "總支出",
      "總代墊",
      "預算/收入",
      "結餘",
      "餐飲",
      "交通",
      "日用",
      "服飾",
      "娛樂",
      "其他",
      "收入"
    ];

    statSheet.getRange("A1:L1").setValues([headers]);

    var mainHeaderRange = statSheet.getRange("A1:L1");
    mainHeaderRange.setBackground("#1A237E");
    mainHeaderRange.setFontColor("#FFFFFF");
    mainHeaderRange.setFontWeight("bold");
    mainHeaderRange.setHorizontalAlignment("center");

    statSheet.setColumnWidth(1, 100);
    statSheet.setColumnWidth(2, 110);
    statSheet.setColumnWidth(3, 110);
    statSheet.setColumnWidth(4, 110);
    statSheet.setColumnWidth(5, 110);

    // 系統設定
    var configData = [
      "⚙️ 系統設定",
      "結算包含統計圖卡", "ON",
      "結算包含趣味統計", "ON",
      "預設每月預算/收入", 0
    ];

    statSheet.getRange("N1:T1").setValues([configData]);

    var mainTitleRange = statSheet.getRange("N1");
    mainTitleRange.setBackground("#455A64");
    mainTitleRange.setFontColor("#FFFFFF");
    mainTitleRange.setFontWeight("bold");
    mainTitleRange.setHorizontalAlignment("center");

    var labelRangeList = statSheet.getRangeList(["O1", "Q1", "S1"]);
    labelRangeList.setBackground("#ECEFF1");
    labelRangeList.setFontWeight("bold");
    labelRangeList.setHorizontalAlignment("center");

    var valRangeList = statSheet.getRangeList(["P1", "R1", "T1"]);
    valRangeList.setBackground("#FFFFFF");
    valRangeList.setFontWeight("bold");
    valRangeList.setHorizontalAlignment("center");

    var rule = SpreadsheetApp
      .newDataValidation()
      .requireValueInList(["ON", "OFF"])
      .build();

    statSheet.getRange("P1").setDataValidation(rule);
    statSheet.getRange("R1").setDataValidation(rule);

    statSheet.setColumnWidth(14, 120);
    statSheet.setColumnWidth(15, 220);
    statSheet.setColumnWidth(16, 80);
    statSheet.setColumnWidth(17, 220);
    statSheet.setColumnWidth(18, 80);
    statSheet.setColumnWidth(19, 220);
    statSheet.setColumnWidth(20, 100);
  }

  statSheet.setFrozenRows(1);
  statSheet.setFrozenColumns(1);


  // =========================================================
  // 2. 共用函式：建立某月份的 Statistics row
  // =========================================================
  function buildStatisticsRow(sheetName, rowNumber) {
    var monthCell = "'" + sheetName + "'";

    return [
      sheetName,

      '=SUMIF(' + monthCell +
        '!B:B, "<>收入", ' +
        monthCell + '!F:F)',

      '=SUM(' + monthCell + '!E:E)',

      '=$T$1 + L' + rowNumber,

      '=D' + rowNumber + '-B' + rowNumber,

      '=SUMIF(' + monthCell +
        '!B:B, "餐飲", ' +
        monthCell + '!F:F)',

      '=SUMIF(' + monthCell +
        '!B:B, "交通", ' +
        monthCell + '!F:F)',

      '=SUMIF(' + monthCell +
        '!B:B, "日用", ' +
        monthCell + '!F:F)',

      '=SUMIF(' + monthCell +
        '!B:B, "服飾", ' +
        monthCell + '!F:F)',

      '=SUMIF(' + monthCell +
        '!B:B, "娛樂", ' +
        monthCell + '!F:F)',

      '=SUMIF(' + monthCell +
        '!B:B, "其他", ' +
        monthCell + '!F:F)',

      '=SUMIF(' + monthCell +
        '!B:B, "收入", ' +
        monthCell + '!F:F)'
    ];
  }


  // =========================================================
  // 3. Statistics 剛建立 → 掃描所有月份工作表並重建
  // =========================================================
  if (isNewStatistics) {

    var monthSheets = ss.getSheets()
      .map(function(sheet) {
        return sheet.getName();
      })
      .filter(function(name) {
        return /^\d{4}_\d{2}$/.test(name);
      })
      .sort()
      .reverse();

    for (var i = 0; i < monthSheets.length; i++) {
      var rowNumber = i + 2;

      var rowData = buildStatisticsRow(
        monthSheets[i],
        rowNumber
      );

      statSheet
        .getRange(rowNumber, 1, 1, 12)
        .setValues([rowData]);

      statSheet
        .getRange(rowNumber, 1, 1, 12)
        .setHorizontalAlignment("center");

      var monthColCell = statSheet.getRange(rowNumber, 1);
      monthColCell.setBackground("#E0F7FA");
      monthColCell.setFontWeight("bold");
    }

    return;
  }


  // =========================================================
  // 4. Statistics 已存在 → 檢查本月份是否已經有資料
  // =========================================================
  var lastRow = statSheet.getLastRow();
  var exists = false;

  if (lastRow >= 2) {
    var monthValues = statSheet
      .getRange(2, 1, lastRow - 1, 1)
      .getValues();

    for (var r = 0; r < monthValues.length; r++) {
      if (
        monthValues[r][0].toString() === currentSheetName
      ) {
        exists = true;
        break;
      }
    }
  }


  // =========================================================
  // 5. 新月份 → 插到最上方，舊月份往下推
  // =========================================================
  if (!exists) {

    statSheet.insertRowBefore(2);

    var rowData = buildStatisticsRow(
      currentSheetName,
      2
    );

    var targetRange =
      statSheet.getRange(2, 1, 1, 12);

    targetRange.setValues([rowData]);
    targetRange.setHorizontalAlignment("center");

    var monthColCell = statSheet.getRange(2, 1);
    monthColCell.setBackground("#E0F7FA");
    monthColCell.setFontWeight("bold");
  }
}