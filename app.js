/**
 * ОКК - РАО: Клиентская логика приложения для фиксации проблемных товаров на стене сортировки
 */

'use strict';

// ═══════════════════════════════════════════
//  КОНФИГУРАЦИЯ И КОНСТАНТЫ
// ═══════════════════════════════════════════
const STORAGE_KEYS = {
  API_URL: 'okk_rao_api_url',
  USER_SESSION: 'okk_rao_session',
  OFFLINE_QUEUE: 'okk_rao_offline_queue',
  LOCAL_HISTORY: 'okk_rao_history',
  SOUND_ENABLED: 'okk_rao_sound_enabled'
};

const DEFAULT_PROBLEMS = [
  { name: 'Протечка жидкости', icon: '💧' },
  { name: 'Порвана упаковка (пакет)', icon: '🛍️' },
  { name: 'Нет товарного вида', icon: '📦' },
  { name: 'Товар сломан', icon: '🔨' },
  { name: 'Порвана упаковка (коробка)', icon: '📦' },
  { name: 'Помята упаковка (коробка)', icon: '📦' },
  { name: 'Скол, вмятина, трещина', icon: '💥' },
  { name: 'Разбит стеклянный товар', icon: '🍷' },
  { name: 'Некомплект', icon: '🧩' },
  { name: 'Грязный товар', icon: '🧼' },
  { name: 'Срок годности', icon: '⏳' },
  { name: 'Дефект одежды', icon: '👕' },
  { name: 'Пустая упаковка', icon: '📭' },
  { name: 'Личная гигиена упаковка', icon: '🧴' },
  { name: 'Испорчен другим товаром', icon: '☣️' }
];

// Маппинг иконок для динамических причин
const PROBLEM_ICON_MAP = {
  'жидкости': '💧',
  'пакет': '🛍️',
  'товарного': '📦',
  'сломан': '🔨',
  'коробка': '📦',
  'скол': '💥',
  'стекл': '🍷',
  'некомплект': '🧩',
  'грязный': '🧼',
  'годности': '⏳',
  'одежды': '👕',
  'пустая': '📭',
  'гигиена': '🧴',
  'испорчен': '☣️'
};

// ═══════════════════════════════════════════
//  СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ═══════════════════════════════════════════
const state = {
  apiUrl: localStorage.getItem(STORAGE_KEYS.API_URL) || '',
  currentUser: null,
  currentWall: null,
  soundEnabled: localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== 'false',
  problemsList: [...DEFAULT_PROBLEMS],
  offlineQueue: [],
  history: [],
  isSubmitting: false
};

// ═══════════════════════════════════════════
//  WEB AUDIO API (APPLE PAY ЗВУКИ)
// ═══════════════════════════════════════════
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playSound(type) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'success') {
      // Фирменный двойной chime в стиле Apple Pay (C6 1046.5Hz -> E6 1318.5Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, now);
      gain1.gain.setValueAtTime(0.09, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.12);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.5, now + 0.06);
      gain2.gain.setValueAtTime(0.09, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.22);

      if (navigator.vibrate) navigator.vibrate(60);

    } else if (type === 'error') {
      // Двойной низкий сигнал ошибки (iOS style double-beep)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.1, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(587.33, now + 0.11);
      gain2.gain.setValueAtTime(0.1, now + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.11);
      osc2.stop(now + 0.19);

      if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
    }
  } catch (e) {
    console.warn('Audio feedback failed:', e);
  }
}

// ═══════════════════════════════════════════
//  АВТО-ПЕРЕВОД РАСКЛАДКИ КЛАВИАТУРЫ (RU -> EN / NUM)
// ═══════════════════════════════════════════
const RU_TO_EN_MAP = {
  'й':'q','ц':'w','у':'e','к':'r','е':'t','н':'y','г':'u','ш':'i','щ':'o','з':'p',
  'х':'[','ъ':']','ф':'a','ы':'s','в':'d','а':'f','п':'g','р':'h','о':'j','л':'k',
  'д':'l','ж':';','э':'\'','я':'z','ч':'x','с':'c','м':'v','и':'b','т':'n','ь':'m',
  'б':',','ю':'.'
};

function autoConvertLayout(text) {
  if (!text) return '';
  return text.split('').map(ch => {
    const lower = ch.toLowerCase();
    return RU_TO_EN_MAP[lower] || ch;
  }).join('');
}

// ═══════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ И DOM ЭЛЕМЕНТЫ
// ═══════════════════════════════════════════
let elements = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  loadSavedState();
  initSoundToggle();
  setupEventListeners();
  renderProblemsGrid();
  updateOfflineQueueBadge();
  checkSession();
});

function cacheElements() {
  elements = {
    // Controls
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    soundIcon: document.getElementById('soundIcon'),
    offlineBadge: document.getElementById('offlineBadge'),
    offlineCount: document.getElementById('offlineCount'),
    settingsBtn: document.getElementById('settingsBtn'),

    // Screens
    authScreen: document.getElementById('authScreen'),
    wallScanScreen: document.getElementById('wallScanScreen'),
    workScreen: document.getElementById('workScreen'),

    // Auth Screen
    authForm: document.getElementById('authForm'),
    employeeIdInput: document.getElementById('employeeIdInput'),
    clearAuthInput: document.getElementById('clearAuthInput'),
    authError: document.getElementById('authError'),
    authSubmitBtn: document.getElementById('authSubmitBtn'),

    // Wall Scan Screen
    wallUserName: document.getElementById('wallUserName'),
    logoutBtnFromWall: document.getElementById('logoutBtnFromWall'),
    wallBarcodeInput: document.getElementById('wallBarcodeInput'),
    scannerTargetArea: document.getElementById('scannerTargetArea'),
    manualInputNotice: document.getElementById('manualInputNotice'),
    wallScanError: document.getElementById('wallScanError'),

    // Work Screen
    activeWallBadge: document.getElementById('activeWallBadge'),
    changeWallBtn: document.getElementById('changeWallBtn'),
    workUserName: document.getElementById('workUserName'),
    workUserShift: document.getElementById('workUserShift'),
    itemRecordForm: document.getElementById('itemRecordForm'),
    itemBarcodeInput: document.getElementById('itemBarcodeInput'),
    clearItemBarcode: document.getElementById('clearItemBarcode'),
    barcodeDigitCounter: document.getElementById('barcodeDigitCounter'),
    itemBarcodeError: document.getElementById('itemBarcodeError'),
    qtyInput: document.getElementById('qtyInput'),
    qtyMinusBtn: document.getElementById('qtyMinusBtn'),
    qtyPlusBtn: document.getElementById('qtyPlusBtn'),
    problemsGrid: document.getElementById('problemsGrid'),
    statusToast: document.getElementById('statusToast'),
    statusToastIcon: document.getElementById('statusToastIcon'),
    statusToastText: document.getElementById('statusToastText'),
    historyList: document.getElementById('historyList'),
    historyCount: document.getElementById('historyCount'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    scriptUrlInput: document.getElementById('scriptUrlInput'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn')
  };
}

// ═══════════════════════════════════════════
//  УПРАВЛЕНИЕ ЭКРАНАМИ
// ═══════════════════════════════════════════
function showScreen(screenName) {
  elements.authScreen.classList.remove('active');
  elements.wallScanScreen.classList.remove('active');
  elements.workScreen.classList.remove('active');

  if (screenName === 'auth') {
    elements.authScreen.classList.add('active');
    setTimeout(() => elements.employeeIdInput?.focus(), 150);
  } else if (screenName === 'wall') {
    elements.wallScanScreen.classList.add('active');
    elements.wallUserName.textContent = `Сотрудник: ${state.currentUser?.name || state.currentUser?.id || '...'}`;
    elements.wallBarcodeInput.value = '';
    hideManualNotice();
    setTimeout(() => elements.wallBarcodeInput?.focus(), 150);
  } else if (screenName === 'work') {
    elements.workScreen.classList.add('active');
    elements.activeWallBadge.textContent = `Стена: ${state.currentWall}`;
    elements.workUserName.textContent = state.currentUser?.name || `ID ${state.currentUser?.id}`;
    elements.workUserShift.textContent = state.currentUser?.shift || 'Основная смена';
    resetItemForm();
    setTimeout(() => elements.itemBarcodeInput?.focus(), 150);
    loadHistory();
  }
}

// ═══════════════════════════════════════════
//  АВТОРИЗАЦИЯ И СМЕНЫ
// ═══════════════════════════════════════════
function getCurrentShiftName() {
  const hour = new Date().getHours();
  return (hour >= 9 && hour < 21) ? 'День' : 'Ночь';
}

function handleLogin(e) {
  e.preventDefault();
  const rawId = elements.employeeIdInput.value.trim();
  if (!rawId) {
    showAuthError('Введите табельный номер сотрудника');
    return;
  }

  hideAuthError();
  elements.authSubmitBtn.disabled = true;
  elements.authSubmitBtn.innerHTML = '<span>Проверка...</span>';

  // Если URL Google Apps Script не задан — режим автономной/демо работы
  if (!state.apiUrl) {
    finalizeLogin({
      id: rawId,
      name: `Сотрудник #${rawId}`,
      shift: getCurrentShiftName() + ' (локально)'
    });
    return;
  }

  const loginUrl = `${state.apiUrl}?action=login&employeeId=${encodeURIComponent(rawId)}&t=${Date.now()}`;
  fetch(loginUrl)
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        finalizeLogin({
          id: rawId,
          name: data.name || `Сотрудник #${rawId}`,
          shift: data.shift || getCurrentShiftName()
        });
      } else {
        showAuthError(data.message || 'Сотрудник не найден в базе Employees');
        playSound('error');
      }
    })
    .catch(err => {
      console.warn('Login request failed, fallback to local mode:', err);
      // Если сеть недоступна, разрешаем вход локально для непрерывности работы
      finalizeLogin({
        id: rawId,
        name: `Сотрудник #${rawId}`,
        shift: getCurrentShiftName() + ' (офлайн)'
      });
    })
    .finally(() => {
      elements.authSubmitBtn.disabled = false;
      elements.authSubmitBtn.innerHTML = '<span>Войти в систему</span> <span>➜</span>';
    });
}

function finalizeLogin(userData) {
  state.currentUser = userData;
  const sessionData = {
    user: userData,
    shiftDayNight: getCurrentShiftName(),
    loginTime: Date.now()
  };
  localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(sessionData));
  playSound('success');

  fetchDynamicConfig();
  showScreen('wall');
}

function checkSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_SESSION);
    if (!raw) {
      showScreen('auth');
      return;
    }
    const session = JSON.parse(raw);
    const currentShift = getCurrentShiftName();

    // Защита от пересменки: если смена сменилась (День <-> Ночь), требуем повторный вход
    if (session.shiftDayNight && session.shiftDayNight !== currentShift) {
      localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
      showScreen('auth');
      showAuthError('Смена завершилась. Войдите заново для новой смены.');
      return;
    }

    state.currentUser = session.user;
    if (session.wall) {
      state.currentWall = session.wall;
      showScreen('work');
    } else {
      showScreen('wall');
    }
  } catch (e) {
    localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
    showScreen('auth');
  }
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
  state.currentUser = null;
  state.currentWall = null;
  showScreen('auth');
}

function showAuthError(msg) {
  elements.authError.textContent = msg;
  elements.authError.classList.add('visible');
}

function hideAuthError() {
  elements.authError.classList.remove('visible');
}

// ═══════════════════════════════════════════
//  СКАНЕР СТЕНЫ СОРТИРОВКИ (ЗАПРЕТ РУЧНОГО ВВОДА)
// ═══════════════════════════════════════════
let wallKeystrokeTimestamps = [];
let manualBlockTimeout = null;

function setupWallScannerListener() {
  const input = elements.wallBarcodeInput;

  // Автоматический перехват сканера даже при клике в любое место карточки
  elements.scannerTargetArea.addEventListener('click', () => {
    input.focus();
  });

  input.addEventListener('keydown', (e) => {
    // Клавиша Enter означает окончание считывания штрих-кода сканером
    if (e.key === 'Enter') {
      e.preventDefault();
      processWallScan(input.value.trim());
      return;
    }

    // Замеряем скорость ввода: аппаратный сканер вводит символы пачкой (< 40мс между символами)
    const now = performance.now();
    wallKeystrokeTimestamps.push(now);
    if (wallKeystrokeTimestamps.length > 3) {
      wallKeystrokeTimestamps.shift();
      const diff1 = wallKeystrokeTimestamps[1] - wallKeystrokeTimestamps[0];
      const diff2 = wallKeystrokeTimestamps[2] - wallKeystrokeTimestamps[1];

      // Если ввод происходит медленно (человек печатает пальцами)
      if (diff1 > 65 || diff2 > 65) {
        triggerManualInputBlock();
      }
    }
  });

  input.addEventListener('input', () => {
    input.value = autoConvertLayout(input.value);
  });
}

function triggerManualInputBlock() {
  elements.wallBarcodeInput.value = '';
  elements.manualInputNotice.classList.add('visible');
  playSound('error');

  clearTimeout(manualBlockTimeout);
  manualBlockTimeout = setTimeout(() => {
    elements.manualInputNotice.classList.remove('visible');
  }, 3500);
}

function hideManualNotice() {
  elements.manualInputNotice.classList.remove('visible');
  wallKeystrokeTimestamps = [];
}

function processWallScan(rawCode) {
  const wallCode = autoConvertLayout(rawCode).trim();
  if (!wallCode) return;

  // Если штрих-код слишком короткий (случайное нажатие)
  if (wallCode.length < 2) {
    triggerManualInputBlock();
    return;
  }

  state.currentWall = wallCode;

  // Обновляем сохраненную сессию
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_SESSION);
    if (raw) {
      const session = JSON.parse(raw);
      session.wall = wallCode;
      localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(session));
    }
  } catch (e) {}

  playSound('success');
  showScreen('work');
}

// ═══════════════════════════════════════════
//  РАБОЧИЙ ЭКРАН: ВАЛИДАЦИЯ ШК И ФИКСАЦИЯ
// ═══════════════════════════════════════════
function setupWorkScreenListeners() {
  const barcodeInput = elements.itemBarcodeInput;

  // Автоматический пересчет и перевод раскладки при сканировании ШК
  barcodeInput.addEventListener('input', () => {
    const converted = autoConvertLayout(barcodeInput.value).replace(/\D/g, '');
    barcodeInput.value = converted;
    updateBarcodeCounter(converted.length);
    clearItemBarcodeError();

    // Если сканер вставил ровно 13 цифр
    if (converted.length === 13) {
      barcodeInput.classList.remove('input-error');
      barcodeInput.classList.add('input-valid');
    } else {
      barcodeInput.classList.remove('input-valid');
      if (converted.length > 13) {
        barcodeInput.classList.add('input-error');
      }
    }
  });

  // При нажатии Enter на поле ШК (завершение работы сканера)
  barcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = barcodeInput.value.trim();
      if (code.length !== 13) {
        showItemBarcodeError('ШК товара должен содержать ровно 13 цифр!');
        playSound('error');
      } else {
        showToast('ШК принят! Выберите причину проблемы ⚡', 'loading');
      }
    }
  });

  // Кнопки управления количеством
  elements.qtyMinusBtn.addEventListener('click', () => {
    let val = parseInt(elements.qtyInput.value, 10) || 1;
    if (val > 1) elements.qtyInput.value = val - 1;
  });

  elements.qtyPlusBtn.addEventListener('click', () => {
    let val = parseInt(elements.qtyInput.value, 10) || 1;
    if (val < 999) elements.qtyInput.value = val + 1;
  });

  elements.clearItemBarcode.addEventListener('click', () => {
    barcodeInput.value = '';
    updateBarcodeCounter(0);
    clearItemBarcodeError();
    barcodeInput.focus();
  });

  // Смена стены
  elements.changeWallBtn.addEventListener('click', () => {
    showScreen('wall');
  });
}

function updateBarcodeCounter(len) {
  elements.barcodeDigitCounter.textContent = `${len} / 13`;
  if (len === 13) {
    elements.barcodeDigitCounter.classList.add('valid');
  } else {
    elements.barcodeDigitCounter.classList.remove('valid');
  }
}

function showItemBarcodeError(msg) {
  elements.itemBarcodeError.textContent = msg;
  elements.itemBarcodeError.classList.add('visible');
  elements.itemBarcodeInput.classList.add('input-error');
  elements.itemBarcodeInput.classList.remove('input-valid');
}

function clearItemBarcodeError() {
  elements.itemBarcodeError.classList.remove('visible');
  elements.itemBarcodeInput.classList.remove('input-error');
}

function resetItemForm() {
  elements.itemBarcodeInput.value = '';
  elements.qtyInput.value = '1';
  updateBarcodeCounter(0);
  clearItemBarcodeError();
  document.querySelectorAll('.problem-card-btn').forEach(b => b.classList.remove('selected'));
}

// ═══════════════════════════════════════════
//  ОТРИСОВКА И ВЫБОР ПРИЧИН (15 КНОПОК)
// ═══════════════════════════════════════════
function renderProblemsGrid() {
  elements.problemsGrid.innerHTML = '';

  state.problemsList.forEach((prob) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'problem-card-btn';
    btn.setAttribute('data-problem', prob.name);

    btn.innerHTML = `
      <span class="problem-icon">${prob.icon || '⚠️'}</span>
      <span class="problem-title">${prob.name}</span>
    `;

    btn.addEventListener('click', () => {
      handleProblemSelection(prob.name, btn);
    });

    elements.problemsGrid.appendChild(btn);
  });
}

function handleProblemSelection(problemName, btnElement) {
  const barcode = elements.itemBarcodeInput.value.trim();

  // Строгая валидация: строго 13 цифр!
  if (!/^\d{13}$/.test(barcode)) {
    showItemBarcodeError('Ошибка: Штрих-код должен содержать ровно 13 цифр!');
    playSound('error');
    elements.itemBarcodeInput.focus();
    return;
  }

  // Подсвечиваем выбранную кнопку
  document.querySelectorAll('.problem-card-btn').forEach(b => b.classList.remove('selected'));
  btnElement.classList.add('selected');

  const qty = parseInt(elements.qtyInput.value, 10) || 1;

  submitProblemRecord({
    barcode: barcode,
    problem: problemName,
    qty: qty,
    sortingWall: state.currentWall
  });
}

// ═══════════════════════════════════════════
//  ОТПРАВКА ЗАПИСИ (ФИКСАЦИЯ В 13 КОЛОНОК)
// ═══════════════════════════════════════════
function submitProblemRecord(record) {
  if (state.isSubmitting) return;
  state.isSubmitting = true;

  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);
  const shiftName = state.currentUser?.shift || getCurrentShiftName();

  const recordPayload = {
    dateStr: dateStr,
    timeStr: timeStr,
    shiftName: shiftName,
    employeeId: state.currentUser?.id || '',
    employeeName: state.currentUser?.name || '',
    sortingWall: record.sortingWall,
    barcode: record.barcode,
    description: '',         // Колонка 8 под Python / формулы
    category1: '',           // Колонка 9
    category2: '',           // Колонка 10
    compensationPrice: '',   // Колонка 11
    problem: record.problem, // Колонка 12
    qty: record.qty          // Колонка 13
  };

  // Мгновенный оптимистичный UX: проигрываем победный звук и добавляем в историю
  playSound('success');
  addRecordToHistory(recordPayload);
  showToast(`✅ Зафиксировано: ${record.problem} (${record.barcode})`, 'success');
  resetItemForm();
  elements.itemBarcodeInput.focus();

  // Отправка в Google Apps Script
  if (!state.apiUrl || !navigator.onLine) {
    // Сохраняем в офлайн-очередь
    enqueueOfflineRecord(recordPayload);
    state.isSubmitting = false;
    return;
  }

  const queryParams = new URLSearchParams({
    action: 'addRecord',
    dateStr: recordPayload.dateStr,
    timeStr: recordPayload.timeStr,
    shiftName: recordPayload.shiftName,
    employeeId: recordPayload.employeeId,
    employeeName: recordPayload.employeeName,
    sortingWall: recordPayload.sortingWall,
    barcode: recordPayload.barcode,
    description: recordPayload.description,
    category1: recordPayload.category1,
    category2: recordPayload.category2,
    compensationPrice: recordPayload.compensationPrice,
    problem: recordPayload.problem,
    qty: String(recordPayload.qty)
  });

  fetch(`${state.apiUrl}?${queryParams.toString()}`, { method: 'GET' })
    .then(res => res.json())
    .then(res => {
      if (!res.success) {
        console.warn('Server error, queueing offline:', res.message);
        enqueueOfflineRecord(recordPayload);
      }
    })
    .catch(err => {
      console.warn('Network error, queueing offline:', err);
      enqueueOfflineRecord(recordPayload);
    })
    .finally(() => {
      state.isSubmitting = false;
    });
}

// ═══════════════════════════════════════════
//  ОФЛАЙН ОЧЕРЕДЬ И СИНХРОНИЗАЦИЯ
// ═══════════════════════════════════════════
function enqueueOfflineRecord(record) {
  state.offlineQueue.push(record);
  saveOfflineQueue();
  updateOfflineQueueBadge();
}

function saveOfflineQueue() {
  localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(state.offlineQueue));
}

function updateOfflineQueueBadge() {
  const count = state.offlineQueue.length;
  elements.offlineCount.textContent = count;
  if (count > 0) {
    elements.offlineBadge.classList.add('visible');
  } else {
    elements.offlineBadge.classList.remove('visible');
  }
}

function syncOfflineQueue() {
  if (!state.apiUrl || state.offlineQueue.length === 0 || !navigator.onLine) return;

  const recordsToSend = [...state.offlineQueue];
  const payloadJson = JSON.stringify(recordsToSend);

  const url = `${state.apiUrl}?action=addRecords&recordsJson=${encodeURIComponent(payloadJson)}`;
  fetch(url, { method: 'GET' })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        state.offlineQueue = [];
        saveOfflineQueue();
        updateOfflineQueueBadge();
        showToast(`⚡ Синхронизировано ${recordsToSend.length} офлайн записей!`, 'success');
      }
    })
    .catch(err => console.warn('Offline sync retry failed:', err));
}

window.addEventListener('online', () => {
  syncOfflineQueue();
});

// ═══════════════════════════════════════════
//  ИСТОРИЯ ЗАПИСЕЙ
// ═══════════════════════════════════════════
function addRecordToHistory(rec) {
  state.history.unshift(rec);
  if (state.history.length > 50) state.history.pop();
  localStorage.setItem(STORAGE_KEYS.LOCAL_HISTORY, JSON.stringify(state.history));
  renderHistoryList();
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_HISTORY);
    if (raw) {
      state.history = JSON.parse(raw);
    }
  } catch (e) {}
  renderHistoryList();
}

function renderHistoryList() {
  elements.historyList.innerHTML = '';
  elements.historyCount.textContent = `${state.history.length} записей`;

  if (state.history.length === 0) {
    elements.historyList.innerHTML = '<div class="history-empty">Здесь отобразятся отсканированные вами товары</div>';
    return;
  }

  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-item-left">
        <span class="history-barcode">${item.barcode}</span>
        <span class="history-reason">${item.problem}</span>
      </div>
      <div class="history-item-right">
        <span class="history-qty">${item.qty} шт.</span>
        <span class="history-time">${item.timeStr || ''}</span>
      </div>
    `;
    elements.historyList.appendChild(div);
  });
}

// ═══════════════════════════════════════════
//  ДИНАМИЧЕСКИЕ НАСТРОЙКИ (CONFIG)
// ═══════════════════════════════════════════
function fetchDynamicConfig() {
  if (!state.apiUrl) return;

  fetch(`${state.apiUrl}?action=getConfig&t=${Date.now()}`)
    .then(res => res.json())
    .then(res => {
      if (res.success && Array.isArray(res.problems) && res.problems.length > 0) {
        state.problemsList = res.problems.map(name => {
          let icon = '📦';
          for (const [key, ic] of Object.entries(PROBLEM_ICON_MAP)) {
            if (name.toLowerCase().includes(key)) {
              icon = ic;
              break;
            }
          }
          return { name, icon };
        });
        renderProblemsGrid();
      }
    })
    .catch(err => console.warn('Could not fetch dynamic config:', err));
}

// ═══════════════════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════
function showToast(text, type = 'success') {
  elements.statusToastText.textContent = text;
  elements.statusToast.className = `status-toast visible ${type}`;
  elements.statusToastIcon.textContent = type === 'success' ? '✅' : (type === 'error' ? '❌' : '⏳');

  clearTimeout(elements.statusToast._timer);
  elements.statusToast._timer = setTimeout(() => {
    elements.statusToast.classList.remove('visible');
  }, 4000);
}

function formatDate(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()}`;
}

function formatTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function loadSavedState() {
  try {
    const queue = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    if (queue) state.offlineQueue = JSON.parse(queue);
  } catch (e) {}
}

function initSoundToggle() {
  updateSoundUI();
  elements.soundToggleBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, state.soundEnabled);
    updateSoundUI();
    if (state.soundEnabled) playSound('success');
  });
}

function updateSoundUI() {
  if (state.soundEnabled) {
    elements.soundIcon.textContent = '🔊';
    elements.soundToggleBtn.classList.remove('muted');
  } else {
    elements.soundIcon.textContent = '🔇';
    elements.soundToggleBtn.classList.add('muted');
  }
}

// ═══════════════════════════════════════════
//  СЛУШАТЕЛИ СОБЫТИЙ И НАСТРОЙКИ
// ═══════════════════════════════════════════
function setupEventListeners() {
  // Авторизация
  elements.authForm.addEventListener('submit', handleLogin);
  elements.clearAuthInput.addEventListener('click', () => {
    elements.employeeIdInput.value = '';
    elements.employeeIdInput.focus();
    hideAuthError();
  });

  // Выход
  elements.logoutBtnFromWall.addEventListener('click', logout);

  // Сканер стены
  setupWallScannerListener();

  // Рабочий экран
  setupWorkScreenListeners();

  // Модалка настроек
  elements.settingsBtn.addEventListener('click', () => {
    elements.scriptUrlInput.value = state.apiUrl;
    elements.settingsModal.classList.add('active');
  });

  elements.cancelSettingsBtn.addEventListener('click', () => {
    elements.settingsModal.classList.remove('active');
  });

  elements.saveSettingsBtn.addEventListener('click', () => {
    const newUrl = elements.scriptUrlInput.value.trim();
    state.apiUrl = newUrl;
    localStorage.setItem(STORAGE_KEYS.API_URL, newUrl);
    elements.settingsModal.classList.remove('active');
    showToast('Настройки URL сохранены!', 'success');
    if (newUrl) {
      fetchDynamicConfig();
      syncOfflineQueue();
    }
  });
}
