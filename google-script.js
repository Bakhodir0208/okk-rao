/**
 * GOOGLE APPS SCRIPT ДЛЯ СИСТЕМЫ ФИКСАЦИИ ОКК - РАО (СТЕНА СОРТИРОВКИ)
 * 
 * Инструкция по установке:
 * 1. В вашей Google Таблице выберите: Расширения -> Apps Script.
 * 2. Удалите стандартный код и вставьте этот файл целиком.
 * 3. Нажмите кнопку «Сохранить» (дискета).
 * 4. Нажмите «Начать развертывание» -> «Новое развертывание».
 * 5. Нажмите на шестеренку (Выберите тип) -> «Веб-приложение».
 * 6. Настройки:
 *    - Описание: ОКК - РАО Фиксация API
 *    - Запуск от имени: Вы (ваш Google аккаунт)
 *    - Кто имеет доступ: Все (Anyone)
 * 7. Нажмите «Развернуть» и скопируйте URL веб-приложения.
 * 8. Запустите функцию `setupSheet` один раз в редакторе скриптов, чтобы создать листы и предзаполнить 15 причин проблем!
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var parameter = e.parameter || {};
  var action = parameter.action;
  var response = { success: false, message: "Действие не указано" };

  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    if (action === "addRecord" || action === "addRecords") {
      lockAcquired = lock.tryLock(30000);
      if (!lockAcquired) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          message: "Сервер занят обработкой других записей. Попробуйте снова."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    autoSetupIfNeeded(ss);

    // 1. СТРОГАЯ АВТОРИЗАЦИЯ ПО БАЗЕ EMPLOYEES
    if (action === "login") {
      var employeeId = String(parameter.employeeId || "").trim();
      var empMap = getEmployeeMap(ss);
      var foundUser = empMap[employeeId];

      if (foundUser && foundUser.name) {
        response = {
          success: true,
          id: foundUser.id,
          name: foundUser.name,
          shift: foundUser.shift
        };
      } else {
        response = {
          success: false,
          message: "Сотрудник с wms_id «" + employeeId + "» не найден в листе Employees. Доступ запрещен."
        };
      }

    // 2. ПОЛУЧЕНИЕ НАСТРОЕК (ПРИЧИНЫ ПРОБЛЕМ С АВТОПЕРЕВОДОМ НА УЗБЕКСКИЙ КИРИЛЛИЦУ)
    } else if (action === "getConfig") {
      var configSheet = ss.getSheetByName("Config");
      var configData = configSheet ? configSheet.getDataRange().getValues() : [];
      var problems = [];

      for (var p = 1; p < configData.length; p++) {
        var reasonRu = String(configData[p][0] || "").trim();
        if (reasonRu) {
          var reasonUz = getUzbekTranslation(reasonRu);
          problems.push({
            ru: reasonRu,
            uz: reasonUz
          });
        }
      }

      response = {
        success: true,
        problems: problems
      };

    // 3. ДОБАВЛЕНИЕ ОДНОЙ ЗАПИСИ ИЛИ ПАКЕТА (ОФЛАЙН ОЧЕРЕДЬ) С ДЕДУПЛИКАЦИЕЙ
    } else if (action === "addRecord" || action === "addRecords") {
      var logSheet = ss.getSheetByName("Log");
      var cache = CacheService.getScriptCache();
      var empMap = getEmployeeMap(ss);

      var timestamp = new Date();
      var tz = Session.getScriptTimeZone();
      var defaultDateStr = Utilities.formatDate(timestamp, tz, "dd.MM.yyyy");
      var defaultTimeStr = Utilities.formatDate(timestamp, tz, "HH:mm:ss");

      var hour = Number(Utilities.formatDate(timestamp, tz, "H"));
      var dayNight = (hour >= 9 && hour < 21) ? "День" : "Ночь";

      if (action === "addRecords" && parameter.recordsJson) {
        var records = JSON.parse(parameter.recordsJson);
        var rows = [];
        var processedIds = [];

        for (var r = 0; r < records.length; r++) {
          var rec = records[r];
          var rId = String(rec.clientRecordId || "").trim();

          // 1. Проверка уникального ID в кэше
          if (rId && cache.get("rec_" + rId)) {
            continue; // Уже обработано ранее, пропускаем дубликат
          }

          var recDate = rec.dateStr || defaultDateStr;
          var recTime = rec.timeStr || defaultTimeStr;
          var recEmpId = String(rec.employeeId || parameter.employeeId || "").trim();
          var recCargo = String(rec.cargoPlace || parameter.cargoPlace || "").trim();
          var recBarcode = String(rec.barcode || "").trim();
          var recProb = rec.problem || "";

          // 2. Проверка недавнего дубликата в листе Log
          if (isRecentDuplicate(logSheet, recDate, recEmpId, recCargo, recBarcode, recProb, recTime)) {
            if (rId) cache.put("rec_" + rId, "1", 21600);
            continue; // Запись уже есть в таблице
          }

          // 3. Гарантированное ФИО сотрудника из листа Employees
          var officialEmp = empMap[recEmpId];
          var finalEmpName = (officialEmp && officialEmp.name)
            ? officialEmp.name
            : (rec.employeeName || parameter.employeeName || "");

          rows.push([
            recDate,
            recTime,
            rec.shiftName || (officialEmp && officialEmp.shift) || rec.dayNight || dayNight,
            recEmpId,
            finalEmpName,
            rec.sortingWall || parameter.sortingWall || "",
            recCargo,
            recBarcode,
            rec.description || "",
            rec.category1 || "",
            rec.category2 || "",
            rec.compensationPrice || "",
            recProb,
            Number(rec.qty || 1)
          ]);

          if (rId) processedIds.push(rId);
        }

        if (rows.length > 0) {
          var lastRow = logSheet.getLastRow();
          logSheet.getRange(lastRow + 1, 1, rows.length, 14).setValues(rows);

          // Сохраняем в кэш все записанные ID
          for (var p = 0; p < processedIds.length; p++) {
            cache.put("rec_" + processedIds[p], "1", 21600);
          }
        }

        response = {
          success: true,
          message: "Синхронизировано " + rows.length + " записей (дубликаты отфильтрованы)"
        };

      } else {
        // Одиночная запись
        var clientRecordId = String(parameter.clientRecordId || "").trim();

        // 1. Проверка по уникальному ID в кэше
        if (clientRecordId && cache.get("rec_" + clientRecordId)) {
          response = {
            success: true,
            duplicate: true,
            message: "Запись уже была зафиксирована ранее (кэш)"
          };
        } else {
          var opDate = parameter.dateStr || defaultDateStr;
          var opTime = parameter.timeStr || defaultTimeStr;
          var empId = String(parameter.employeeId || "").trim();
          var cargo = String(parameter.cargoPlace || "").trim();
          var barcode = String(parameter.barcode || "").trim();
          var problem = parameter.problem || "";

          // 2. Проверка недавнего дубликата в последних строках таблицы
          if (isRecentDuplicate(logSheet, opDate, empId, cargo, barcode, problem, opTime)) {
            if (clientRecordId) cache.put("rec_" + clientRecordId, "1", 21600);
            response = {
              success: true,
              duplicate: true,
              message: "Запись уже добавлена ранее (дедупликация)"
            };
          } else {
            // 3. Гарантированное ФИО сотрудника из листа Employees
            var officialEmp = empMap[empId];
            var finalEmpName = (officialEmp && officialEmp.name)
              ? officialEmp.name
              : (parameter.employeeName || "");

            var newRow = [
              opDate,
              opTime,
              parameter.shiftName || (officialEmp && officialEmp.shift) || dayNight,
              empId,
              finalEmpName,
              parameter.sortingWall || "",
              cargo,
              barcode,
              parameter.description || "",
              parameter.category1 || "",
              parameter.category2 || "",
              parameter.compensationPrice || "",
              problem,
              Number(parameter.qty || 1)
            ];

            var lastRow = logSheet.getLastRow();
            logSheet.getRange(lastRow + 1, 1, 1, 14).setValues([newRow]);

            if (clientRecordId) {
              cache.put("rec_" + clientRecordId, "1", 21600);
            }

            response = {
              success: true,
              message: "Фиксация успешно добавлена"
            };
          }
        }
      }

    // 4. ИСТОРИЯ ЗАПИСЕЙ СОТРУДНИКА
    } else if (action === "getHistory") {
      var logSheet = ss.getSheetByName("Log");
      var lastRow = logSheet ? logSheet.getLastRow() : 0;
      var employeeId = String(parameter.employeeId || "").trim();
      var userLogs = [];

      if (lastRow > 1) {
        var maxRowsToRead = 500;
        var startRow = Math.max(2, lastRow - maxRowsToRead + 1);
        var numRows = lastRow - startRow + 1;

        var logData = logSheet.getRange(startRow, 1, numRows, 14).getValues();

        for (var i = logData.length - 1; i >= 0; i--) {
          if (String(logData[i][3]).trim() === employeeId) {
            userLogs.push({
              date: logData[i][0],
              time: logData[i][1],
              shift: logData[i][2],
              wall: logData[i][5],
              cargoPlace: logData[i][6],
              barcode: logData[i][7],
              problem: logData[i][12],
              qty: logData[i][13]
            });
          }
          if (userLogs.length >= 25) break;
        }
      }

      response = {
        success: true,
        logs: userLogs
      };
    }

  } catch (err) {
    response = {
      success: false,
      message: "Ошибка сервера: " + err.toString()
    };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ДЕДУПЛИКАЦИЯ И СПРАВОЧНИКИ)
// ═══════════════════════════════════════════

// Получение словаря сотрудников из листа Employees: { [wms_id]: { id, name, shift } }
function getEmployeeMap(ss) {
  var map = {};
  var empSheet = ss.getSheetByName("Employees");
  if (!empSheet) return map;
  var empData = empSheet.getDataRange().getValues();
  for (var i = 1; i < empData.length; i++) {
    var id = String(empData[i][0] || "").trim();
    if (id) {
      map[id] = {
        id: id,
        name: String(empData[i][1] || "").trim(),
        shift: String(empData[i][2] || "Основная смена").trim()
      };
    }
  }
  return map;
}

// Преобразование времени в секунды для проверки временного интервала
function parseTimeToSeconds(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return val.getHours() * 3600 + val.getMinutes() * 60 + val.getSeconds();
  }
  var parts = String(val).split(":");
  if (parts.length >= 2) {
    var h = parseInt(parts[0], 10) || 0;
    var m = parseInt(parts[1], 10) || 0;
    var s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

// Проверка на недавний дубликат в последних 50 строках листа Log
function isRecentDuplicate(logSheet, dateStr, employeeId, cargoPlace, barcode, problem, timeStr) {
  var lastRow = logSheet ? logSheet.getLastRow() : 0;
  if (lastRow <= 1) return false;

  var checkCount = Math.min(50, lastRow - 1);
  var startRow = lastRow - checkCount + 1;
  var recentValues = logSheet.getRange(startRow, 1, checkCount, 14).getValues();

  var cleanDate = String(dateStr || "").trim();
  var cleanEmpId = String(employeeId || "").trim();
  var cleanCargo = String(cargoPlace || "").trim();
  var cleanBarcode = String(barcode || "").trim();
  var cleanProb = String(problem || "").trim();
  var targetSec = parseTimeToSeconds(timeStr);

  var tz = Session.getScriptTimeZone();

  for (var i = recentValues.length - 1; i >= 0; i--) {
    var row = recentValues[i];
    var rDate = (row[0] instanceof Date)
      ? Utilities.formatDate(row[0], tz, "dd.MM.yyyy")
      : String(row[0] || "").trim();

    var rEmpId = String(row[3] || "").trim();
    var rCargo = String(row[6] || "").trim();
    var rBarcode = String(row[7] || "").trim();
    var rProb = String(row[12] || "").trim();

    if (rDate === cleanDate && rEmpId === cleanEmpId && rCargo === cleanCargo && rBarcode === cleanBarcode && rProb === cleanProb) {
      var rSec = parseTimeToSeconds(row[1]);
      if (targetSec !== null && rSec !== null) {
        var diff = Math.abs(targetSec - rSec);
        // Дубликат, если между фиксациями менее 5 минут (300 секунд)
        if (diff <= 300) {
          return true;
        }
      } else {
        return true;
      }
    }
  }
  return false;
}

// Автоматическая проверка и настройка листов при первом вызове
function autoSetupIfNeeded(ss) {
  var empSheet = ss.getSheetByName("Employees");
  var configSheet = ss.getSheetByName("Config");
  var logSheet = ss.getSheetByName("Log");

  if (!empSheet || !configSheet || !logSheet) {
    setupSheet();
  }
}

// Ручная или первичная инициализация структуры листов
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Лист Employees
  var empSheet = ss.getSheetByName("Employees");
  if (!empSheet) {
    empSheet = ss.insertSheet("Employees");
    empSheet.appendRow(["wms_id", "ФИО", "Смена"]);
    empSheet.appendRow(["1001", "Алексей Смирнов", "1 смена"]);
    empSheet.appendRow(["1002", "Дмитрий Иванов", "2 смена"]);
    empSheet.appendRow(["1003", "Мария Козлова", "3 смена"]);

    empSheet.getRange("A1:C1")
      .setBackground("#7000ff")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    empSheet.autoResizeColumns(1, 3);
  }

  // 2. Лист Config (15 причин проблем)
  var configSheet = ss.getSheetByName("Config");
  if (!configSheet) {
    configSheet = ss.insertSheet("Config");
    configSheet.appendRow(["Причины проблем", "Параметры Telegram", "Значения"]);

    var reasons = [
      "Протечка жидкости",
      "Порвана упаковка (пакет)",
      "Нет товарного вида",
      "Товар сломан",
      "Порвана упаковка (коробка)",
      "Помята упаковка (коробка)",
      "Скол, вмятина, трещина",
      "Разбит стеклянный товар",
      "Некомплект",
      "Грязный товар",
      "Срок годности",
      "Дефект одежды",
      "Пустая упаковка",
      "Личная гигиена упаковка",
      "Испорчен другим товаром"
    ];

    for (var i = 0; i < reasons.length; i++) {
      configSheet.appendRow([reasons[i], "", ""]);
    }

    configSheet.getRange("A1:C1")
      .setBackground("#7000ff")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    configSheet.autoResizeColumns(1, 3);
  }

  // 3. Лист Log (14 утвержденных колонок)
  var logSheet = ss.getSheetByName("Log");
  if (!logSheet) {
    logSheet = ss.insertSheet("Log");
    logSheet.appendRow([
      "Дата операции",
      "Время операции",
      "Смена",
      "wms_id Сотрудника",
      "ФИО сотрудника",
      "Стена сортировки",
      "ШК Короба",
      "ШК Товара",
      "Описание",
      "Категория 1",
      "Категория 2",
      "Цена компенсации",
      "Причина проблемы",
      "Количество"
    ]);

    logSheet.getRange("A1:N1")
      .setBackground("#7000ff")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    logSheet.autoResizeColumns(1, 14);
  }

  var defaultSheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("Лист1");
  if (defaultSheet && defaultSheet.getLastRow() === 0) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {}
  }
}

// ═══════════════════════════════════════════
//  АВТОМАТИЧЕСКИЙ ПЕРЕВОД НА УЗБЕКСКИЙ (КИРИЛЛИЦА)
// ═══════════════════════════════════════════

var CURATED_TRANSLATIONS = {
  "протечка жидкости": "Суюқлик оқиши",
  "порвана мягкая упаковка (пакет)": "Юмшоқ қадоқ йиртилган (пакет)",
  "порвана упаковка (пакет)": "Пакет қадоғи йиртилган",
  "нет товарного вида": "Товарлик кўриниши йўқ",
  "товар сломан, деформирован": "Маҳсулот синган, деформацияланган",
  "товар сломан": "Маҳсулот синган",
  "порвана упаковка (коробка)": "Қути қадоғи йиртилган",
  "помята упаковка (коробка)": "Қути қадоғи эзилган",
  "скол, вмятина, трещина": "Учган, эзилган, ёриқ",
  "разбит хрупкий товар": "Синган, мўрт маҳсулот",
  "разбит стеклянный товар": "Шиша маҳсулот синган",
  "некомплект": "Тўлиқ эмас (кам-кўст)",
  "грязный товар": "Маҳсулот ифлосланган",
  "срок годности": "Яроқлилик муддати ўтган",
  "дефект одежды": "Кийим нуқсони",
  "пустая упаковка": "Бўш қадоқ",
  "личная гигиена упаковка": "Шахсий гигиена қадоғи",
  "испорчен другим товаром": "Бошқа маҳсулотдан зарарланган",
  "упаковка вскрыта/ нарушена пломба": "Қадоқ очилган / пломба бузилган",
  "упаковка вскрыта/нарушена пломба": "Қадоқ очилган / пломба бузилган",
  "мокрая упаковка, имеет следы влаги": "Ҳўл қадоқ, намлик излари бор",
  "грязная упаковка": "Ифлосланган қадоқ"
};

function getUzbekTranslation(textRu) {
  if (!textRu) return "";
  var clean = textRu.trim();
  var lower = clean.toLowerCase();

  // 1. Проверяем эталонный складской словарь
  if (CURATED_TRANSLATIONS[lower]) {
    return CURATED_TRANSLATIONS[lower];
  }

  // 2. Проверяем кэш скрипта (CacheService)
  var cacheKey = "tr_" + Utilities.base64Encode(Utilities.newBlob(lower).getBytes()).substring(0, 40);
  try {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) return cached;
  } catch (e) {}

  // 3. АВТОПЕРЕВОД через встроенный сервис Google Apps Script (LanguageApp)
  var uzCyrillic = clean;
  try {
    var translatedLatin = LanguageApp.translate(clean, "ru", "uz");
    uzCyrillic = latinToUzbekCyrillic(translatedLatin);

    // Сохраняем в кэш на 6 часов
    try {
      CacheService.getScriptCache().put(cacheKey, uzCyrillic, 21600);
    } catch (e) {}
  } catch (err) {
    uzCyrillic = clean;
  }

  return uzCyrillic;
}

function latinToUzbekCyrillic(text) {
  if (!text) return "";
  var res = text;
  
  var compounds = [
    ["o'", "ў"], ["oʻ", "ў"], ["o`", "ў"], ["O'", "Ў"], ["Oʻ", "Ў"], ["O`", "Ў"],
    ["g'", "ғ"], ["gʻ", "ғ"], ["g`", "ғ"], ["G'", "Ғ"], ["Gʻ", "Ғ"], ["G`", "Ғ"],
    ["sh", "ш"], ["Sh", "Ш"], ["SH", "Ш"],
    ["ch", "ч"], ["Ch", "Ч"], ["CH", "Ч"],
    ["yo", "ё"], ["Yo", "Ё"], ["YO", "Ё"],
    ["yu", "ю"], ["Yu", "Ю"], ["YU", "Ю"],
    ["ya", "я"], ["Ya", "Я"], ["YA", "Я"],
    ["ye", "е"], ["Ye", "Е"], ["YE", "Е"]
  ];
  for (var c = 0; c < compounds.length; c++) {
    res = res.split(compounds[c][0]).join(compounds[c][1]);
  }

  var singleMap = {
    'a': 'а', 'A': 'А',
    'b': 'б', 'B': 'Б',
    'd': 'д', 'D': 'Д',
    'e': 'е', 'E': 'Е',
    'f': 'ф', 'F': 'Ф',
    'g': 'г', 'G': 'Г',
    'h': 'ҳ', 'H': 'Ҳ',
    'i': 'и', 'I': 'И',
    'j': 'ж', 'J': 'Ж',
    'k': 'к', 'K': 'К',
    'l': 'л', 'L': 'Л',
    'm': 'м', 'M': 'М',
    'n': 'н', 'N': 'Н',
    'o': 'о', 'O': 'О',
    'p': 'п', 'P': 'П',
    'q': 'қ', 'Q': 'Қ',
    'r': 'р', 'R': 'Р',
    's': 'с', 'S': 'С',
    't': 'т', 'T': 'Т',
    'u': 'у', 'U': 'У',
    'v': 'в', 'V': 'В',
    'x': 'х', 'X': 'Х',
    'y': 'й', 'Y': 'Й',
    'z': 'з', 'Z': 'З',
    "'": 'ъ', "ʻ": 'ъ', "`": 'ъ'
  };

  var out = "";
  for (var i = 0; i < res.length; i++) {
    var ch = res.charAt(i);
    out += singleMap[ch] || ch;
  }
  return out;
}
