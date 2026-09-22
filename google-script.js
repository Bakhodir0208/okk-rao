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
    if (action === "addRecord" || action === "addRecords" || action === "addInboundRecord" || action === "addInboundRecords") {
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
      var inboundProblems = [];

      // Определяем колонку для причин входящего потока
      var inboundColIdx = -1;
      if (configData.length > 0) {
        var headerRow = configData[0];
        for (var c = 0; c < headerRow.length; c++) {
          var hName = String(headerRow[c] || "").toLowerCase();
          if (hName.indexOf("входящ") !== -1) {
            inboundColIdx = c;
            break;
          }
        }
      }
      // Если по заголовку не найдено, проверяем колонку E (индекс 4)
      if (inboundColIdx === -1 && configData.length > 0 && configData[0].length >= 5) {
        inboundColIdx = 4;
      }

      for (var p = 1; p < configData.length; p++) {
        // 1. Причины Отгрузки (Колонка A)
        var reasonRu = String(configData[p][0] || "").trim();
        if (reasonRu) {
          problems.push({
            ru: reasonRu,
            uz: getUzbekTranslation(reasonRu)
          });
        }

        // 2. Причины Входящего потока
        if (inboundColIdx !== -1 && configData[p].length > inboundColIdx) {
          var inbReasonRu = String(configData[p][inboundColIdx] || "").trim();
          if (inbReasonRu) {
            inboundProblems.push({
              ru: inbReasonRu,
              uz: getUzbekTranslation(inbReasonRu)
            });
          }
        }
      }

      // Если колонка причин входящего потока еще не заполнена на листе Config, автоматически инициализируем колонку E
      if (configSheet && inboundProblems.length === 0) {
        var defaultInboundList = [
          "Порвана упаковка (коробка)",
          "Порвана мягкая упаковка (пакет)",
          "Упакован с нарушением оферты",
          "Без маркировки",
          "Без описания товара",
          "Неверное количество",
          "Сроки годности",
          "Товар сломан, деформирован",
          "Нет товарного вида",
          "Запрещённый товар",
          "Протечка жидкости",
          "Нет штрихкода или он не читается",
          "Неверный товар (цвет, размер)"
        ];
        try {
          configSheet.getRange(1, 5).setValue("Причины входящего потока")
            .setBackground("#7000ff")
            .setFontColor("#ffffff")
            .setFontWeight("bold");
          for (var d = 0; d < defaultInboundList.length; d++) {
            configSheet.getRange(d + 2, 5).setValue(defaultInboundList[d]);
            inboundProblems.push({
              ru: defaultInboundList[d],
              uz: getUzbekTranslation(defaultInboundList[d])
            });
          }
          configSheet.autoResizeColumns(1, 5);
        } catch (cfgErr) {}
      }

      response = {
        success: true,
        problems: problems,
        inboundProblems: inboundProblems
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

    // 5. ДОБАВЛЕНИЕ ЗАПИСИ ВХОДЯЩЕГО ПОТОКА (ОДИНОЧНАЯ ИЛИ ПАКЕТ ОФЛАЙН-ОЧЕРЕДИ)
    } else if (action === "addInboundRecord" || action === "addInboundRecords") {
      var inboundSheet = ss.getSheetByName("Фиксация входящего потока NEW") || ss.getSheetByName("Фиксация входящего потока");
      if (!inboundSheet || inboundSheet.getLastRow() === 0) {
        setupSheet();
        inboundSheet = ss.getSheetByName("Фиксация входящего потока NEW") || ss.getSheetByName("Фиксация входящего потока");
      }
      var cache = CacheService.getScriptCache();
      var empMap = getEmployeeMap(ss);

      var timestamp = new Date();
      var tz = Session.getScriptTimeZone();
      var defaultDateStr = Utilities.formatDate(timestamp, tz, "dd.MM.yyyy");
      var defaultTimeStr = Utilities.formatDate(timestamp, tz, "HH:mm:ss");

      if (action === "addInboundRecords" && parameter.recordsJson) {
        var records = JSON.parse(parameter.recordsJson);
        var rows = [];
        var processedIds = [];

        for (var r = 0; r < records.length; r++) {
          var rec = records[r];
          var rId = String(rec.clientRecordId || "").trim();

          // 1. Проверка по уникальному ID в кэше
          if (rId && cache.get("inbound_" + rId)) {
            continue;
          }

          var recDate = rec.dateStr || defaultDateStr;
          var recTime = rec.timeStr || defaultTimeStr;
          var recEmpId = String(rec.employeeId || parameter.employeeId || "").trim();
          var recRecountDate = String(rec.recountDate || "").trim();
          var recBox = String(rec.boxNumber || rec.actNumber || "").trim();
          var recBarcode = String(rec.barcode || "").trim();
          var recExpiry = String(rec.expiryDate || "").trim();
          var recOtd = String(rec.otdFixation || "").trim();
          var recProb = String(rec.problem || "").trim();

          // 2. Дедупликация по последним строкам листа входящего потока (17 колонок)
          if (isRecentInboundDuplicate(inboundSheet, recDate, recEmpId, recBox, recBarcode, recProb, recTime)) {
            if (rId) cache.put("inbound_" + rId, "1", 21600);
            continue;
          }

          var officialEmp = empMap[recEmpId];
          var finalEmpName = (officialEmp && officialEmp.name)
            ? officialEmp.name
            : (rec.employeeName || parameter.employeeName || "");

          rows.push([
            recDate,                                 // 1. Дата операции
            recTime,                                 // 2. Время операции
            recEmpId,                                // 3. wms_id Сотрудника
            finalEmpName,                            // 4. ФИО сотрудника
            recBox,                                  // 5. Номер короба
            recBarcode,                              // 6. ШК товара
            recExpiry,                               // 7. Срок годности
            recOtd,                                  // 8. ОТД фиксация (на ручнике)
            recProb,                                 // 9. Причина фиксации
            rec.description || "",                   // 10. Описание (Python)
            rec.category1 || "",                     // 11. Категория 1 (Python)
            rec.category2 || "",                     // 12. Категория 2 (Python)
            rec.compensationPrice || "",             // 13. Цена компенсации (Python)
            rec.actNumber || "",                     // 14. Номер акта (Python)
            rec.recountTime || "",                   // 15. Время пересчета (Python)
            rec.recEmployee || ""                    // 16. Сотрудник (Python)
          ]);

          if (rId) processedIds.push(rId);
        }

        if (rows.length > 0) {
          var lastRow = inboundSheet.getLastRow();
          inboundSheet.getRange(lastRow + 1, 1, rows.length, 16).setValues(rows);

          for (var p = 0; p < processedIds.length; p++) {
            cache.put("inbound_" + processedIds[p], "1", 21600);
          }
        }

        response = {
          success: true,
          message: "Синхронизировано " + rows.length + " записей входящего потока"
        };

      } else {
        // Одиночная запись входящего потока
        var clientRecordId = String(parameter.clientRecordId || "").trim();

        if (clientRecordId && cache.get("inbound_" + clientRecordId)) {
          response = {
            success: true,
            duplicate: true,
            message: "Запись входящего потока уже зафиксирована ранее (кэш)"
          };
        } else {
          var opDate = parameter.dateStr || defaultDateStr;
          var opTime = parameter.timeStr || defaultTimeStr;
          var empId = String(parameter.employeeId || "").trim();
          var boxNumber = String(parameter.boxNumber || parameter.actNumber || "").trim();
          var barcode = String(parameter.barcode || "").trim();
          var expiryDate = String(parameter.expiryDate || "").trim();
          var otdFixation = String(parameter.otdFixation || "").trim();
          var problem = String(parameter.problem || "").trim();

          if (isRecentInboundDuplicate(inboundSheet, opDate, empId, boxNumber, barcode, problem, opTime)) {
            if (clientRecordId) cache.put("inbound_" + clientRecordId, "1", 21600);
            response = {
              success: true,
              duplicate: true,
              message: "Запись входящего потока уже добавлена ранее (дедупликация)"
            };
          } else {
            var officialEmp = empMap[empId];
            var finalEmpName = (officialEmp && officialEmp.name)
              ? officialEmp.name
              : (parameter.employeeName || "");

            var newRow = [
              opDate,                                 // 1. Дата операции
              opTime,                                 // 2. Время операции
              empId,                                  // 3. wms_id Сотрудника
              finalEmpName,                           // 4. ФИО сотрудника
              boxNumber,                              // 5. Номер короба
              barcode,                                // 6. ШК товара
              expiryDate,                             // 7. Срок годности
              otdFixation,                            // 8. ОТД фиксация (на ручнике)
              problem,                                // 9. Причина фиксации
              parameter.description || "",            // 10. Описание (Python)
              parameter.category1 || "",              // 11. Категория 1 (Python)
              parameter.category2 || "",              // 12. Категория 2 (Python)
              parameter.compensationPrice || "",      // 13. Цена компенсации (Python)
              parameter.actNumber || "",              // 14. Номер акта (Python)
              parameter.recountTime || "",            // 15. Время пересчета (Python)
              parameter.recEmployee || ""             // 16. Сотрудник (Python)
            ];

            var lastRow = inboundSheet.getLastRow();
            inboundSheet.getRange(lastRow + 1, 1, 1, 16).setValues([newRow]);

            if (clientRecordId) {
              cache.put("inbound_" + clientRecordId, "1", 21600);
            }

            response = {
              success: true,
              message: "Фиксация входящего потока успешно добавлена"
            };
          }
        }
      }

    // 6. ИСТОРИЯ ВХОДЯЩЕГО ПОТОКА СОТРУДНИКА
    } else if (action === "getInboundHistory") {
      var inboundSheet = ss.getSheetByName("Фиксация входящего потока NEW") || ss.getSheetByName("Фиксация входящего потока");
      var lastRow = inboundSheet ? inboundSheet.getLastRow() : 0;
      var employeeId = String(parameter.employeeId || "").trim();
      var userLogs = [];

      if (lastRow > 1) {
        var maxRowsToRead = 300;
        var startRow = Math.max(2, lastRow - maxRowsToRead + 1);
        var numRows = lastRow - startRow + 1;
        var numCols = Math.min(16, inboundSheet.getLastColumn());

        var logData = inboundSheet.getRange(startRow, 1, numRows, numCols).getValues();

        for (var i = logData.length - 1; i >= 0; i--) {
          if (String(logData[i][2]).trim() === employeeId) {
            userLogs.push({
              date: logData[i][0],
              time: logData[i][1],
              boxNumber: logData[i][4],
              barcode: logData[i][5],
              expiryDate: logData[i][6],
              otdFixation: logData[i][7],
              problem: logData[i][8] || ""
            });
          }
          if (userLogs.length >= 25) break;
        }
      }

      response = {
        success: true,
        logs: userLogs
      };

    // 7. ОНЛАЙН-ПРОВЕРКА СРОКА ГОДНОСТИ ПО ШК В ТАБЛИЦЕ ПРИЁМКИ
    } else if (action === "checkBarcodeExpiry") {
      var barcode = String(parameter.barcode || "").trim();
      response = checkBarcodeExpiry_(ss, barcode);
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

// Проверка на недавний дубликат в листе входящего потока
function isRecentInboundDuplicate(sheet, dateStr, employeeId, boxNumber, barcode, problem, timeStr) {
  if (!sheet) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  var checkCount = Math.min(50, lastRow - 1);
  var startRow = lastRow - checkCount + 1;
  var numCols = Math.min(16, sheet.getLastColumn());
  var recentValues = sheet.getRange(startRow, 1, checkCount, numCols).getValues();

  var cleanDate = String(dateStr || "").trim();
  var cleanEmpId = String(employeeId || "").trim();
  var cleanBox = String(boxNumber || "").trim();
  var cleanBarcode = String(barcode || "").trim();
  var cleanProb = String(problem || "").trim();
  var targetSec = parseTimeToSeconds(timeStr);

  var tz = Session.getScriptTimeZone();

  for (var i = recentValues.length - 1; i >= 0; i--) {
    var row = recentValues[i];
    var rDate = (row[0] instanceof Date)
      ? Utilities.formatDate(row[0], tz, "dd.MM.yyyy")
      : String(row[0] || "").trim();

    var rEmpId = String(row[2] || "").trim();
    var rBox = String(row[4] || "").trim();
    var rBarcode = String(row[5] || "").trim();
    var rProb = row.length > 8 ? String(row[8] || "").trim() : "";

    if (rDate === cleanDate && rEmpId === cleanEmpId && rBox === cleanBox && rBarcode === cleanBarcode && (!cleanProb || rProb === cleanProb)) {
      var rSec = parseTimeToSeconds(row[1]);
      if (targetSec !== null && rSec !== null) {
        var diff = Math.abs(targetSec - rSec);
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

// ═══════════════════════════════════════════
//  ПРОВЕРКА ФИКСАЦИИ СРОКА ГОДНОСТИ ПО ШК В ТАБЛИЦЕ ПРИЁМКИ
// ═══════════════════════════════════════════
var DEFAULT_EXPIRY_INTAKE_SPREADSHEET_ID = "1SJFZM0_BOfeKIutSKszrPApNmq_gY0WdBiDU7oxAj-Y";

function checkBarcodeExpiry_(ss, barcode) {
  var cleanTargetBarcode = String(barcode || "").replace(/\D/g, "");
  if (!cleanTargetBarcode) {
    return { success: false, found: false, message: "Штрих-код не указан" };
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = "exp_chk_" + cleanTargetBarcode;
  try {
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {}

  var intakeSsId = DEFAULT_EXPIRY_INTAKE_SPREADSHEET_ID;
  if (ss) {
    var configSheet = ss.getSheetByName("Config");
    if (configSheet) {
      var cData = configSheet.getDataRange().getValues();
      for (var c = 0; c < cData.length; c++) {
        var label = String(cData[c][1] || "").toLowerCase().trim();
        if (label.indexOf("таблица приёмки") !== -1 || label.indexOf("приёмка сроков") !== -1 || label.indexOf("таблица приёмка") !== -1) {
          var customVal = String(cData[c][2] || "").trim();
          if (customVal) {
            var urlMatch = customVal.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
            intakeSsId = urlMatch ? urlMatch[1] : customVal;
          }
          break;
        }
      }
    }
  }

  try {
    var intakeSs = SpreadsheetApp.openById(intakeSsId);
    var intakeSheet = intakeSs.getSheetByName("Ответы на форму (1)") || intakeSs.getSheets()[0];
    if (!intakeSheet) {
      return { success: false, found: false, message: "Лист ответов формы не найден" };
    }

    var lastRow = intakeSheet.getLastRow();
    if (lastRow <= 1) {
      return { success: true, found: false, message: "Таблица приёмки пуста" };
    }

    var tz = intakeSs.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || "Asia/Tashkent";
    var now = new Date();
    var todayDateStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
    var todayParts = todayDateStr.split("-");
    var nowYear = parseInt(todayParts[0], 10);
    var nowMonth = parseInt(todayParts[1], 10) - 1;
    var nowDay = parseInt(todayParts[2], 10);

    // Начало вчерашнего дня (00:00:00) в часовом поясе склада
    var startOfYesterday = new Date(nowYear, nowMonth, nowDay - 1, 0, 0, 0, 0).getTime();

    // Загружаем данные: если таблица до 5000 строк - читаем всю.
    // Если больше 5000 строк - определяем, где находятся самые свежие строки (вверху или внизу).
    var startRow = 2;
    var numRows = Math.min(lastRow - 1, 5000);
    if (lastRow > 5000) {
      var topVal = intakeSheet.getRange(2, 1, 1, 1).getValue();
      var botVal = intakeSheet.getRange(lastRow, 1, 1, 1).getValue();
      var topM = parseTimestampToMillis_(topVal);
      var botM = parseTimestampToMillis_(botVal);

      // Если внизу строки свежее, чем вверху, читаем с конца
      if (botM && (!topM || botM > topM)) {
        startRow = lastRow - numRows + 1;
      }
    }

    var data = intakeSheet.getRange(startRow, 1, numRows, 4).getValues();

    // Если таблица отсортирована сверху вниз, но форма добавила свежие ответы в самый низ,
    // дополнительно подхватываем последние 200 строк
    if (lastRow > 5000 && startRow === 2) {
      try {
        var tailCount = Math.min(200, lastRow - (startRow + numRows - 1));
        if (tailCount > 0) {
          var tailData = intakeSheet.getRange(lastRow - tailCount + 1, 1, tailCount, 4).getValues();
          data = data.concat(tailData);
        }
      } catch (eTail) {}
    }

    var bestMatch = null;

    for (var i = 0; i < data.length; i++) {
      var rowTimeVal = data[i][0];
      var rowMillis = parseTimestampToMillis_(rowTimeVal);

      // Пропускаем записи старше вчерашнего дня (не используем break, чтобы не зависеть от порядка сортировки!)
      if (!rowMillis || rowMillis < startOfYesterday) {
        continue;
      }

      var cellBarcodeRaw = String(data[i][1] || "").trim();
      if (!cellBarcodeRaw) continue;

      var isMatch = false;
      var cellBarcodeClean = cellBarcodeRaw.replace(/\D/g, "");
      if (cellBarcodeClean === cleanTargetBarcode) {
        isMatch = true;
      } else if (cellBarcodeRaw.indexOf(cleanTargetBarcode) !== -1) {
        var splitCodes = cellBarcodeRaw.split(/[,;\s]+/);
        for (var s = 0; s < splitCodes.length; s++) {
          if (splitCodes[s].replace(/\D/g, "") === cleanTargetBarcode) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        // Если найдено несколько записей, выбираем самую свежую по времени
        if (!bestMatch || rowMillis > bestMatch.rowMillis) {
          var expVal = data[i][2];
          var expStr = "";
          if (expVal instanceof Date) {
            expStr = Utilities.formatDate(expVal, tz, "dd.MM.yyyy");
          } else {
            expStr = String(expVal || "").trim();
          }

          var prodName = String(data[i][3] || "").trim();
          var recordTimeStr = "";
          if (rowTimeVal instanceof Date) {
            recordTimeStr = Utilities.formatDate(rowTimeVal, tz, "dd.MM HH:mm");
          } else {
            recordTimeStr = String(rowTimeVal || "").substring(0, 16);
          }

          bestMatch = {
            rowMillis: rowMillis,
            success: true,
            found: true,
            barcode: cleanTargetBarcode,
            expiryDate: expStr,
            productName: prodName,
            recordTime: recordTimeStr
          };
        }
      }
    }

    var result;
    if (bestMatch) {
      result = bestMatch;
      // Кэшируем только найденный результат на 30 секунд
      try {
        cache.put(cacheKey, JSON.stringify(result), 30);
      } catch (e) {}
    } else {
      result = {
        success: true,
        found: false,
        message: "В таблице приёмки нет записей за последние 2 дня"
      };
    }

    return result;
  } catch (err) {
    return {
      success: false,
      found: false,
      message: "Ошибка доступа к таблице приёмки: " + err.toString()
    };
  }
}

function parseTimestampToMillis_(val) {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number" && val > 30000) {
    return new Date((val - 25569) * 86400 * 1000).getTime();
  }
  if (typeof val === "string") {
    var match = val.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (match) {
      var d = parseInt(match[1], 10);
      var m = parseInt(match[2], 10) - 1;
      var y = parseInt(match[3], 10);
      var hh = match[4] ? parseInt(match[4], 10) : 0;
      var mm = match[5] ? parseInt(match[5], 10) : 0;
      var ss = match[6] ? parseInt(match[6], 10) : 0;
      return new Date(y, m, d, hh, mm, ss).getTime();
    }
    var dObj = new Date(val);
    if (!isNaN(dObj.getTime())) return dObj.getTime();
  }
  return null;
}

// Автоматическая проверка и настройка листов при первом вызове
function autoSetupIfNeeded(ss) {
  var empSheet = ss.getSheetByName("Employees");
  var configSheet = ss.getSheetByName("Config");
  var logSheet = ss.getSheetByName("Log");
  var inboundSheet = ss.getSheetByName("Фиксация входящего потока NEW") || ss.getSheetByName("Фиксация входящего потока");

  var needsConfigInbound = false;
  if (configSheet) {
    var cData = configSheet.getDataRange().getValues();
    var hasInbound = false;
    if (cData.length > 0) {
      for (var c = 0; c < cData[0].length; c++) {
        if (String(cData[0][c] || "").toLowerCase().indexOf("входящ") !== -1) {
          hasInbound = true;
          break;
        }
      }
    }
    if (!hasInbound) needsConfigInbound = true;
  }

  if (!empSheet || !configSheet || !logSheet || !inboundSheet || inboundSheet.getLastRow() === 0 || needsConfigInbound) {
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

  // 2. Лист Config (Причины проблем для Отгрузки и Входящего потока)
  var defaultInboundReasons = [
    "Порвана упаковка (коробка)",
    "Порвана мягкая упаковка (пакет)",
    "Упакован с нарушением оферты",
    "Без маркировки",
    "Без описания товара",
    "Неверное количество",
    "Сроки годности",
    "Товар сломан, деформирован",
    "Нет товарного вида",
    "Запрещённый товар",
    "Протечка жидкости",
    "Нет штрихкода или он не читается",
    "Неверный товар (цвет, размер)"
  ];

  var configSheet = ss.getSheetByName("Config");
  if (!configSheet) {
    configSheet = ss.insertSheet("Config");
    configSheet.appendRow(["Причины проблем", "Параметры Telegram", "Значения", "", "Причины входящего потока"]);

    var reasons = [
      "Протечка жидкости",
      "Порвана мягкая упаковка (пакет / пачка бумаги)",
      "Нет товарного вида",
      "Товар сломан, деформирован",
      "Порвана упаковка (коробка)",
      "Помята, деформирована коробка",
      "Скол, вмятина, трещина на товаре",
      "Разбит хрупкий товар",
      "Некомплект, не хватает детали",
      "Грязный товар, использованный",
      "Срок годности, отсутствие срока годности",
      "Дефект одежды",
      "Пустая упаковка",
      "Личная гигиена порвана упаковка",
      "Испорчен другим товаром"
    ];

    var maxLen = Math.max(reasons.length, defaultInboundReasons.length);
    for (var i = 0; i < maxLen; i++) {
      var shipR = i < reasons.length ? reasons[i] : "";
      var inbR = i < defaultInboundReasons.length ? defaultInboundReasons[i] : "";
      configSheet.appendRow([shipR, "", "", "", inbR]);
    }

    configSheet.getRange("A1:E1")
      .setBackground("#7000ff")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    configSheet.autoResizeColumns(1, 5);
  } else {
    // Если Config уже есть, проверяем/добавляем колонку "Причины входящего потока"
    var configValues = configSheet.getDataRange().getValues();
    var hasInboundCol = false;
    if (configValues.length > 0) {
      for (var col = 0; col < configValues[0].length; col++) {
        if (String(configValues[0][col] || "").toLowerCase().indexOf("входящ") !== -1) {
          hasInboundCol = true;
          break;
        }
      }
    }
    if (!hasInboundCol) {
      configSheet.getRange(1, 5).setValue("Причины входящего потока")
        .setBackground("#7000ff")
        .setFontColor("#ffffff")
        .setFontWeight("bold");
      for (var j = 0; j < defaultInboundReasons.length; j++) {
        configSheet.getRange(j + 2, 5).setValue(defaultInboundReasons[j]);
      }
      configSheet.autoResizeColumns(1, 5);
    }
  }

  // 3. Лист Log (14 утвержденных колонок для Отгрузки)
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

  // 4. Лист Фиксация входящего потока NEW (16 утвержденных колонок)
  var inboundNewSheetName = "Фиксация входящего потока NEW";
  var inboundNewSheet = ss.getSheetByName(inboundNewSheetName);
  var inboundNewHeaders = [
    "Дата операции",
    "Время операции",
    "wms_id Сотрудника",
    "ФИО сотрудника",
    "Номер короба",
    "ШК товара",
    "Срок годности",
    "ОТД фиксация",
    "Причина фиксации",
    "Описание",
    "Категория 1",
    "Категория 2",
    "Цена компенсации",
    "Номер акта",
    "Время пересчета",
    "Сотрудник"
  ];

  if (!inboundNewSheet) {
    inboundNewSheet = ss.insertSheet(inboundNewSheetName);
    inboundNewSheet.appendRow(inboundNewHeaders);
    inboundNewSheet.getRange("A1:P1")
      .setBackground("#7000ff")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    inboundNewSheet.autoResizeColumns(1, 16);
  } else if (inboundNewSheet.getLastRow() === 0) {
    inboundNewSheet.appendRow(inboundNewHeaders);
    inboundNewSheet.getRange("A1:P1")
      .setBackground("#7000ff")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    inboundNewSheet.autoResizeColumns(1, 16);
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
  "порвана мягкая упаковка (пакет / пачка бумаги)": "Юмшоқ қадоқ йиртилган (пакет)",
  "порвана упаковка (пакет)": "Пакет қадоғи йиртилган",
  "нет товарного вида": "Товарлик кўриниши йўқ",
  "товар сломан, деформирован": "Маҳсулот синган, деформацияланган",
  "товар сломан": "Маҳсулот синган",
  "порвана упаковка (коробка)": "Қути қадоғи йиртилган",
  "помята упаковка (коробка)": "Қути қадоғи эзилган",
  "помята, деформирована коробка": "Қути қадоғи эзилган",
  "скол, вмятина, трещина": "Учган, эзилган, ёриқ",
  "скол, вмятина, трещина на товаре": "Учган, эзилган, ёриқ",
  "разбит хрупкий товар": "Синган, мўрт маҳсулот",
  "разбит стеклянный товар": "Шиша маҳсулот синган",
  "некомплект": "Тўлиқ эмас (кам-кўст)",
  "некомплект, не хватает детали": "Тўлиқ эмас (кам-кўст)",
  "грязный товар": "Маҳсулот ифлосланган",
  "грязный товар, использованный": "Маҳсулот ифлосланган",
  "срок годности": "Яроқлилик муддати ўтган",
  "срок годности, отсутствие срока годности": "Яроқлилик муддати ўтган / йўқ",
  "дефект одежды": "Кийим нуқсони",
  "пустая упаковка": "Бўш қадоқ",
  "личная гигиена упаковка": "Шахсий гигиена қадоғи",
  "личная гигиена порвана упаковка": "Шахсий гигиена қадоғи йиртилган",
  "испорчен другим товаром": "Бошқа маҳсулотдан зарарланган",
  "упаковка вскрыта/ нарушена пломба": "Қадоқ очилган / пломба бузилган",
  "упаковка вскрыта/нарушена пломба": "Қадоқ очилган / пломба бузилган",
  "мокрая упаковка, имеет следы влаги": "Ҳўл қадоқ, намлик излари бор",
  "грязная упаковка": "Ифлосланган қадоқ",
  "без упаковки": "Қадоқсиз",
  "упакован с нарушением оферты": "Оферта қоидаси бузилган",
  "без маркировки": "Маркировкасиз",
  "без маркировки: asl belgisi": "Маркировкасиз: Asl Belgisi",
  "без маркировки: товар из 2 частей": "Маркировкасиз: Товар 2 қисмдан иборат",
  "без маркировки: продаётся комплектом": "Маркировкасиз: Тўплам ҳолида сотилади",
  "без маркировки: продается комплектом": "Маркировкасиз: Тўплам ҳолида сотилади",
  "без маркировки: осторожно хрупкое": "Маркировкасиз: Эҳтиёт бўлинг, синувчан",
  "без описания товара": "Маҳсулот тавсифи йўқ",
  "неверное количество": "Нотўғри миқдор",
  "сроки годности": "Яроқлилик муддати",
  "срок годности": "Яроқлилик муддати",
  "сроки годности: неверно указан в таблице": "Яроқлилик муддати: Жадвалда нотўғри кўрсатилган",
  "сроки годности: истек срок годности": "Яроқлилик муддати: Яроқлилик муддати ўтган",
  "сроки годности: без срока годности": "Яроқлилик муддати: Яроқлилик муддати йўқ",
  "сроки годности: нет фиксации": "Яроқлилик муддати: Қайд этилмаган",
  "срок годности: неверно указан в таблице": "Яроқлилик муддати: Жадвалда нотўғри кўрсатилган",
  "срок годности: истек срок годности": "Яроқлилик муддати: Яроқлилик муддати ўтган",
  "срок годности: без срока годности": "Яроқлилик муддати: Яроқлилик муддати йўқ",
  "срок годности: нет фиксации": "Яроқлилик муддати: Қайд этилмаган",
  "срок годности указан неверно": "Яроқлилик муддати нотўғри кўрсатилган",
  "без срока годности": "Яроқлилик муддати йўқ",
  "запрещённый товар": "Тақиқланган маҳсулот",
  "запрещенный товар": "Тақиқланган маҳсулот",
  "нет штрихкода или он не читается": "Штрих-код йўқ ёки ўқилмайди",
  "неверный товар (цвет, размер)": "Нотўғри маҳсулот (ранг, ўлчам)",
  "неверный товар": "Нотўғри маҳсулот"
};

function getUzbekTranslation(textRu) {
  if (!textRu) return "";
  var clean = textRu.trim();
  var lower = clean.toLowerCase();

  // 1. Проверяем эталонный складской словарь
  if (CURATED_TRANSLATIONS[lower]) {
    return CURATED_TRANSLATIONS[lower];
  }

  // 1.1 Распознавание составных подпричин "Без маркировки"
  if (lower.indexOf("без маркировки:") === 0) {
    if (lower.indexOf("asl") !== -1) return "Маркировкасиз: Asl Belgisi";
    if (lower.indexOf("2 част") !== -1) return "Маркировкасиз: Товар 2 қисмдан иборат";
    if (lower.indexOf("комплект") !== -1) return "Маркировкасиз: Тўплам ҳолида сотилади";
    if (lower.indexOf("хрупк") !== -1) return "Маркировкасиз: Эҳтиёт бўлинг, синувчан";
  }

  // 1.2 Распознавание составных подпричин "Сроки годности"
  if (lower.indexOf("сроки годности:") === 0 || lower.indexOf("срок годности:") === 0) {
    if (lower.indexOf("таблиц") !== -1 || lower.indexOf("неверно") !== -1) return "Яроқлилик муддати: Жадвалда нотўғри кўрсатилган";
    if (lower.indexOf("истек") !== -1 || lower.indexOf("ўтган") !== -1) return "Яроқлилик муддати: Яроқлилик муддати ўтган";
    if (lower.indexOf("без срока") !== -1 || lower.indexOf("йўқ") !== -1) return "Яроқлилик муддати: Яроқлилик муддати йўқ";
    if (lower.indexOf("нет фиксации") !== -1 || lower.indexOf("фиксаци") !== -1 || lower.indexOf("қайд") !== -1) return "Яроқлилик муддати: Қайд этилмаган";
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
