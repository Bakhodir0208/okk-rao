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
  SOUND_ENABLED: 'okk_rao_sound_enabled',
  LANG: 'okk_rao_lang',
  VERIFIED_EMPLOYEES: 'okk_rao_verified_employees',
  CURRENT_PROCESS: 'okk_rao_current_process',
  INBOUND_HISTORY: 'okk_rao_inbound_history',
  INBOUND_OFFLINE_QUEUE: 'okk_rao_inbound_offline_queue'
};

// Каталог из 15 причин проблем:
// ru — каноническое название ДЛЯ GOOGLE ТАБЛИЦЫ (жестко на русском языке!)
// uz — грамотный перевод на узбекский язык для интерфейса
const PROBLEMS_CATALOG = [
  { ru: 'Протечка жидкости', uz: 'Суюқлик оқиши', icon: '💧' },
  { ru: 'Порвана мягкая упаковка (пакет)', uz: 'Юмшоқ қадоқ йиртилган (пакет)', icon: '🛍️' },
  { ru: 'Порвана упаковка (пакет)', uz: 'Пакет қадоғи йиртилган', icon: '🛍️' },
  { ru: 'Нет товарного вида', uz: 'Товарлик кўриниши йўқ', icon: '📦' },
  { ru: 'Товар сломан, деформирован', uz: 'Маҳсулот синган, деформацияланган', icon: '🔨' },
  { ru: 'Товар сломан', uz: 'Маҳсулот синган', icon: '🔨' },
  { ru: 'Порвана упаковка (коробка)', uz: 'Қути қадоғи йиртилган', icon: '📦' },
  { ru: 'Помята упаковка (коробка)', uz: 'Қути қадоғи эзилган', icon: '📦' },
  { ru: 'Скол, вмятина, трещина', uz: 'Учган, эзилган, ёриқ', icon: '💥' },
  { ru: 'Разбит хрупкий товар', uz: 'Синган, мўрт маҳсулот', icon: '🍷' },
  { ru: 'Разбит стеклянный товар', uz: 'Шиша маҳсулот синган', icon: '🍷' },
  { ru: 'Некомплект', uz: 'Тўлиқ эмас (кам-кўст)', icon: '🧩' },
  { ru: 'Грязный товар', uz: 'Маҳсулот ифлосланган', icon: '🧼' },
  { ru: 'Срок годности', uz: 'Яроқлилик муддати ўтган', icon: '⏳' },
  { ru: 'Дефект одежды', uz: 'Кийим нуқсони', icon: '👕' },
  { ru: 'Пустая упаковка', uz: 'Бўш қадоқ', icon: '📭' },
  { ru: 'Личная гигиена упаковка', uz: 'Шахсий гигиена қадоғи', icon: '🧴' },
  { ru: 'Испорчен другим товаром', uz: 'Бошқа маҳсулотдан зарарланган', icon: '☣️' },
  { ru: 'Упаковка вскрыта/ нарушена пломба', uz: 'Қадоқ очилган / пломба бузилган', icon: '🔓' },
  { ru: 'Упаковка вскрыта/нарушена пломба', uz: 'Қадоқ очилган / пломба бузилган', icon: '🔓' },
  { ru: 'Мокрая упаковка, имеет следы влаги', uz: 'Ҳўл қадоқ, намлик излари бор', icon: '💧' },
  { ru: 'Грязная упаковка', uz: 'Ифлосланган қадоқ', icon: '🧼' }
];

const RU_TO_UZ_PROBLEMS_MAP = {};
PROBLEMS_CATALOG.forEach(p => {
  RU_TO_UZ_PROBLEMS_MAP[p.ru.toLowerCase().trim()] = p.uz;
});

const I18N = {
  ru: {
    brandBadge: 'ОКК • Контроль качества • РАО',
    authHeading: 'Фиксация РАО',
    employeeIdLabel: 'wms_id сотрудника',
    employeeIdPlaceholder: 'Например: 1001',
    authSubmitBtn: 'Войти в систему',
    checking: 'Проверка...',
    userPrefix: 'Сотрудник:',
    logout: 'Выйти',
    wallHeading: 'Сканируйте стену',
    wallSub: 'Отсканируйте штрих-код стены сортировки для привязки рабочего места',
    scannerModeOnly: 'Только сканер ШК (ручной ввод отключен)',
    wallPlaceholder: 'Ожидание сканирования стены...',
    manualNotice: 'Ручной ввод запрещен! Пожалуйста, используйте аппаратный сканер ШК.',
    wallPrefix: 'Стена:',
    changeWall: 'Сменить стену',
    shiftDay: 'День',
    shiftNight: 'Ночь',
    shiftDefault: 'Основная смена',
    cargoPlaceLabel: 'ШК Короба',
    cargoPlacePlaceholder: 'Отсканируйте ШК короба...',
    itemBarcodeLabel: 'Штрих-код товара (13 цифр)',
    itemBarcodePlaceholder: 'Отсканируйте ШК товара...',
    qtyTitle: 'Количество единиц',
    qtyHint: 'По умолчанию: 1 шт.',
    problemsTitle: 'Причина проблемы',
    problemsTip: 'Выберите причину ⚡',
    problemsLoading: 'Загрузка причин проблем...',
    historyHeading: 'Последние фиксации сотрудника',
    historyEmpty: 'Здесь отобразятся отсканированные вами товары',
    recordsSuffix: 'записей',
    pcs: 'шт.',
    boxPrefix: 'Короб:',
    inQueue: 'в очереди',
    confirmTitle: 'Подтверждение',
    confirmDesc: 'Пожалуйста, проверьте правильность данных перед отправкой:',
    confirmWall: '🧱 Стена сортировки:',
    confirmBox: '📦 ШК Короба:',
    confirmBarcode: '🏷️ ШК Товара:',
    confirmProblem: '💥 Причина проблемы:',
    confirmQty: '🔢 Количество:',
    cancel: 'Отмена',
    send: 'Отправить ➜',
    enterWmsId: 'Введите wms_id сотрудника',
    empNotFound: 'Сотрудник с wms_id «{id}» не найден в базе Employees',
    scanBoxFirst: 'Сначала отсканируйте ШК короба!',
    barcode13Err: 'Ошибка: Штрих-код должен содержать ровно 13 цифр!',
    barcodeAccepted: 'ШК принят! Выберите причину проблемы ⚡',
    readyToast: 'Готов к работе',
    syncSuccess: '⚡ Синхронизировано {n} офлайн записей!',
    savedSettings: 'Настройки URL сохранены!',
    selectProcessBadge: 'Выбор процесса',
    processSelectHeading: 'Выберите рабочий процесс',
    processSelectSub: 'Выберите направление для фиксации позиций',
    shippingProcessBadge: 'Текущий процесс',
    shippingProcessTitle: '1. Отгрузка',
    shippingProcessDesc: 'Стена сортировки, фиксация брака и поврежденных товаров',
    inboundProcessBadge: 'Новый процесс',
    inboundProcessTitle: '2. Входящий поток',
    inboundProcessDesc: 'Акты пересчета, сроки годности и фиксация ОТД',
    changeProcess: 'Сменить процесс',
    inboundHeaderBadge: 'Входящий поток',
    inboundRecountGroupTitle: 'Данные пересчета и короба',
    inboundActGroupTitle: 'Данные пересчета и короба',
    inboundGoodsGroupTitle: 'Данные товара и фиксации',
    recountDateLabel: 'Дата пересчета',
    boxNumberLabel: 'Номер короба',
    boxNumberPlaceholder: 'Отсканируйте или введите номер короба...',
    otdFixationLabel: 'ОТД фиксация (дата)',
    itemBarcode13Label: 'Штрих-код товара (13 цифр)',
    expiryDateLabel: 'Срок годности (только дата)',
    submitInboundBtn: 'Зафиксировать позицию',
    inboundHistoryHeading: 'Последние фиксации входящего потока',
    inboundHistoryEmpty: 'Здесь отобразятся зафиксированные позиции входящего потока',
    inboundConfirmTitle: 'Подтверждение входящего потока',
    enterRecountDate: 'Укажите дату пересчета',
    enterBoxNumber: 'Введите номер короба',
    enterOtdDate: 'Укажите дату фиксации ОТД',
    enterExpiryDate: 'Укажите срок годности'
  },
  uz: {
    brandBadge: 'ОКК • Сифат назорати • РАО',
    authHeading: 'РАО қайд этиш',
    employeeIdLabel: 'Ходимнинг wms_id рақами',
    employeeIdPlaceholder: 'Масалан: 1001',
    authSubmitBtn: 'Тизимга кириш',
    checking: 'Текширилмоқда...',
    userPrefix: 'Ходим:',
    logout: 'Чиқиш',
    wallHeading: 'Саралаш деворини сканерланг',
    wallSub: 'Иш жойини бириктириш учун саралаш девори штрих-кодини сканерланг',
    scannerModeOnly: 'Фақат Штрих-код сканери (қўлда киритиш ўчирилган)',
    wallPlaceholder: 'Девор сканерланиши кутилмоқда...',
    manualNotice: 'Қўлда киритиш тақиқланган! Илтимос, аппарат штрих-код сканеридан фойдаланинг.',
    wallPrefix: 'Девор:',
    changeWall: 'Деворни алмаштириш',
    shiftDay: 'Кун',
    shiftNight: 'Тун',
    shiftDefault: 'Асосий смена',
    cargoPlaceLabel: 'Қути ШК',
    cargoPlacePlaceholder: 'Қути штрих-кодини сканерланг...',
    itemBarcodeLabel: 'Маҳсулот штрих-коди (13 рақам)',
    itemBarcodePlaceholder: 'Маҳсулот штрих-кодини сканерланг...',
    qtyTitle: 'Бирликлар сони',
    qtyHint: 'Стандарт: 1 дона',
    problemsTitle: 'Муаммо сабаби',
    problemsTip: 'Сабабни танланг ⚡',
    problemsLoading: 'Муаммо сабаблари юкланмоқда...',
    historyHeading: 'Ходимнинг сўнгги қайдлари',
    historyEmpty: 'Бу ерда сиз сканерлаган маҳсулотлар кўринади',
    recordsSuffix: 'та ёзув',
    pcs: 'дона',
    boxPrefix: 'Қути:',
    inQueue: 'навбатда',
    confirmTitle: 'Тасдиқлаш',
    confirmDesc: 'Илтимос, юборишдан олдин маълумотлар тўғрилигини текширинг:',
    confirmWall: '🧱 Саралаш девори:',
    confirmBox: '📦 Қути ШК:',
    confirmBarcode: '🏷️ Маҳсулот ШК:',
    confirmProblem: '💥 Муаммо сабаби:',
    confirmQty: '🔢 Бирликлар сони:',
    cancel: 'Бекор қилиш',
    send: 'Юбориш ➜',
    enterWmsId: 'Ходимнинг wms_id рақамини киритинг',
    empNotFound: 'wms_id «{id}» бўлган ходим Employees базасидан топилмади',
    scanBoxFirst: 'Аввал қути штрих-кодини сканерланг!',
    barcode13Err: 'Хатолик: Штрих-код айнан 13 та рақамдан иборат бўлиши керак!',
    barcodeAccepted: 'ШК қабул қилинди! Муаммо сабабини танланг ⚡',
    readyToast: 'Ишга тайёр',
    syncSuccess: '⚡ {n} та офлайн ёзув синхронланди!',
    savedSettings: 'URL созламалари сақланди!',
    selectProcessBadge: 'Жараённи танлаш',
    processSelectHeading: 'Иш жараёнини танланг',
    processSelectSub: 'Қайд қилиш йўналишини танланг',
    shippingProcessBadge: 'Жорий жараён',
    shippingProcessTitle: '1. Жўнатиш (Отгрузка)',
    shippingProcessDesc: 'Саралаш девори, брак ва нуқсонли маҳсулотларни қайд қилиш',
    inboundProcessBadge: 'Янги жараён',
    inboundProcessTitle: '2. Кирувчи оқим (Входящий поток)',
    inboundProcessDesc: 'Қайта санаш далолатномалари, яроқлилик муддати ва ОТД',
    changeProcess: 'Жараённи алмаштириш',
    inboundHeaderBadge: 'Кирувчи оқим',
    inboundRecountGroupTitle: 'Қайта санаш ва қути маълумотлари',
    inboundActGroupTitle: 'Қайта санаш ва қути маълумотлари',
    inboundGoodsGroupTitle: 'Маҳсулот ва қайд маълумотлари',
    recountDateLabel: 'Қайта санаш санаси',
    boxNumberLabel: 'Қути рақами',
    boxNumberPlaceholder: 'Қути рақамини киритинг ёки сканерланг...',
    otdFixationLabel: 'ОТД қайд санаси',
    itemBarcode13Label: 'Маҳсулот штрих-коди (13 рақам)',
    expiryDateLabel: 'Яроқлилик муддати (фақат сана)',
    submitInboundBtn: 'Маҳсулотни қайд қилиш',
    inboundHistoryHeading: 'Кирувчи оқимнинг сўнгги қайдлари',
    inboundHistoryEmpty: 'Бу ерда қайд қилинган кирувчи оқим маҳсулотлари кўринади',
    inboundConfirmTitle: 'Кирувчи оқимни тасдиқлаш',
    enterRecountDate: 'Қайта санаш санасини танланг',
    enterBoxNumber: 'Қути рақамини киритинг',
    enterOtdDate: 'ОТД қайд санасини танланг',
    enterExpiryDate: 'Яроқлилик муддатини танланг'
  }
};

function t(key, params = {}) {
  const dict = I18N[state.currentLang] || I18N.ru;
  let str = dict[key] || I18N.ru[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

// Маппинг иконок для динамических причин
const PROBLEM_ICON_MAP = {
  'жидкост': '💧',
  'пакет': '🛍️',
  'товарного': '📦',
  'деформ': '🔨',
  'сломан': '🔨',
  'коробк': '📦',
  'скол': '💥',
  'вмятин': '💥',
  'трещин': '💥',
  'хрупк': '🍷',
  'стекл': '🍷',
  'некомплект': '🧩',
  'грязн': '🧼',
  'годност': '⏳',
  'одежд': '👕',
  'пустая': '📭',
  'гигиен': '🧴',
  'испорчен': '☣️',
  'вскрыт': '🔓',
  'пломб': '🔒',
  'мокр': '💧',
  'влаг': '💧'
};

function getClientTranslation(ruName) {
  if (!ruName) return '';
  const cleanRu = ruName.trim();
  const lower = cleanRu.toLowerCase();

  // 1. Проверяем словарь точных соответствий
  if (RU_TO_UZ_PROBLEMS_MAP[lower]) {
    return RU_TO_UZ_PROBLEMS_MAP[lower];
  }

  // 2. Умное распознавание по ключевым словам для складских формулировок
  if (lower.includes('вскрыт') || lower.includes('пломб')) return 'Қадоқ очилган / пломба бузилган';
  if (lower.includes('мокр') || lower.includes('влаг')) return 'Ҳўл қадоқ, намлик излари бор';
  if (lower.includes('грязн') && (lower.includes('упаковк') || lower.includes('пакет') || lower.includes('коробк'))) return 'Ифлосланган қадоқ';
  if (lower.includes('хрупк')) return 'Синган, мўрт маҳсулот';
  if (lower.includes('деформ')) return 'Маҳсулот синган, деформацияланган';
  if (lower.includes('мягкая упаковка')) return 'Юмшоқ қадоқ йиртилган (пакет)';

  return cleanRu;
}

const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwXDvJkSjzdBJQe8-ScYl3g0eWp7Qreb5ORleorg5vPrMFTfKk7RPT8kVWdRNgShHe8dw/exec';

// ═══════════════════════════════════════════
//  СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ═══════════════════════════════════════════
const state = {
  apiUrl: (localStorage.getItem(STORAGE_KEYS.API_URL) && localStorage.getItem(STORAGE_KEYS.API_URL).trim().startsWith('http'))
    ? localStorage.getItem(STORAGE_KEYS.API_URL).trim()
    : DEFAULT_API_URL,
  currentLang: localStorage.getItem(STORAGE_KEYS.LANG) || 'ru',
  currentUser: null,
  currentWall: null,
  currentProcess: localStorage.getItem(STORAGE_KEYS.CURRENT_PROCESS) || null,
  soundEnabled: localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== 'false',
  problemsList: [...PROBLEMS_CATALOG],
  offlineQueue: [],
  history: [],
  inboundOfflineQueue: [],
  inboundHistory: [],
  isSubmitting: false,
  pendingRecord: null,
  pendingInboundRecord: null
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
  initLanguage();
  setupEventListeners();
  renderProblemsGrid();
  updateOfflineQueueBadge();
  fetchDynamicConfig();
  syncOfflineQueue();
  syncInboundOfflineQueue();
  checkSession();
});

function initLanguage() {
  setLanguage(state.currentLang);
}

function setLanguage(lang) {
  state.currentLang = (lang === 'uz') ? 'uz' : 'ru';
  localStorage.setItem(STORAGE_KEYS.LANG, state.currentLang);

  // Переключение активного класса на кнопках
  document.querySelectorAll('.top-lang-btn, .lang-pill-btn').forEach(btn => {
    if (btn.getAttribute('data-lang') === state.currentLang) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Обновление статических элементов с data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (text) el.textContent = text;
  });

  // Обновление плейсхолдеров
  if (elements.employeeIdInput) elements.employeeIdInput.placeholder = t('employeeIdPlaceholder');
  if (elements.wallBarcodeInput) elements.wallBarcodeInput.placeholder = t('wallPlaceholder');
  if (elements.cargoPlaceInput) elements.cargoPlaceInput.placeholder = t('cargoPlacePlaceholder');
  if (elements.itemBarcodeInput) elements.itemBarcodeInput.placeholder = t('itemBarcodePlaceholder');
  if (elements.inboundBoxNumber) elements.inboundBoxNumber.placeholder = t('boxNumberPlaceholder');
  if (elements.inboundBarcode) elements.inboundBarcode.placeholder = t('itemBarcodePlaceholder');

  // Динамические плашки
  if (state.currentWall && elements.activeWallBadge) {
    elements.activeWallBadge.textContent = `${t('wallPrefix')} ${state.currentWall}`;
  }
  if (state.currentUser) {
    const userLabel = `${t('userPrefix')} ${state.currentUser.name || state.currentUser.id || '...'}`;
    const userSimple = state.currentUser.name || `ID ${state.currentUser.id}`;
    const userShift = getLocalizedShiftName(state.currentUser.shift);

    if (elements.wallUserName) elements.wallUserName.textContent = userLabel;
    if (elements.processUserName) elements.processUserName.textContent = userLabel;
    if (elements.workUserName) elements.workUserName.textContent = userSimple;
    if (elements.workUserShift) elements.workUserShift.textContent = userShift;
    if (elements.inboundUserName) elements.inboundUserName.textContent = userSimple;
    if (elements.inboundUserShift) elements.inboundUserShift.textContent = userShift;
  }

  // Обновление кнопок причин проблем и истории
  renderProblemsGrid();
  renderHistoryList();
  renderInboundHistoryList();
}

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
    processSelectScreen: document.getElementById('processSelectScreen'),
    wallScanScreen: document.getElementById('wallScanScreen'),
    workScreen: document.getElementById('workScreen'),
    inboundScreen: document.getElementById('inboundScreen'),

    // Auth Screen
    authForm: document.getElementById('authForm'),
    employeeIdInput: document.getElementById('employeeIdInput'),
    clearAuthInput: document.getElementById('clearAuthInput'),
    authError: document.getElementById('authError'),
    authSubmitBtn: document.getElementById('authSubmitBtn'),

    // Process Select Screen
    processUserName: document.getElementById('processUserName'),
    logoutBtnFromProcess: document.getElementById('logoutBtnFromProcess'),
    selectShippingBtn: document.getElementById('selectShippingBtn'),
    selectInboundBtn: document.getElementById('selectInboundBtn'),

    // Wall Scan Screen
    wallUserName: document.getElementById('wallUserName'),
    changeProcessFromWallBtn: document.getElementById('changeProcessFromWallBtn'),
    logoutBtnFromWall: document.getElementById('logoutBtnFromWall'),
    wallBarcodeInput: document.getElementById('wallBarcodeInput'),
    scannerTargetArea: document.getElementById('scannerTargetArea'),
    manualInputNotice: document.getElementById('manualInputNotice'),
    wallScanError: document.getElementById('wallScanError'),

    // Work Screen (Shipping)
    activeWallBadge: document.getElementById('activeWallBadge'),
    changeWallBtn: document.getElementById('changeWallBtn'),
    changeProcessFromWorkBtn: document.getElementById('changeProcessFromWorkBtn'),
    workUserName: document.getElementById('workUserName'),
    workUserShift: document.getElementById('workUserShift'),
    itemRecordForm: document.getElementById('itemRecordForm'),
    cargoPlaceInput: document.getElementById('cargoPlaceInput'),
    cargoPlaceStatus: document.getElementById('cargoPlaceStatus'),
    clearCargoPlace: document.getElementById('clearCargoPlace'),
    cargoPlaceError: document.getElementById('cargoPlaceError'),
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

    // Inbound Screen
    changeProcessFromInboundBtn: document.getElementById('changeProcessFromInboundBtn'),
    inboundUserName: document.getElementById('inboundUserName'),
    inboundUserShift: document.getElementById('inboundUserShift'),
    inboundForm: document.getElementById('inboundForm'),
    inboundRecountDate: document.getElementById('inboundRecountDate'),
    inboundRecountDateError: document.getElementById('inboundRecountDateError'),
    inboundBoxNumber: document.getElementById('inboundBoxNumber'),
    clearInboundBox: document.getElementById('clearInboundBox'),
    inboundBoxError: document.getElementById('inboundBoxError'),
    inboundOtdDate: document.getElementById('inboundOtdDate'),
    inboundOtdDateError: document.getElementById('inboundOtdDateError'),
    inboundBarcode: document.getElementById('inboundBarcode'),
    clearInboundBarcode: document.getElementById('clearInboundBarcode'),
    inboundBarcodeError: document.getElementById('inboundBarcodeError'),
    inboundExpiryDate: document.getElementById('inboundExpiryDate'),
    inboundExpiryDateError: document.getElementById('inboundExpiryDateError'),
    submitInboundBtn: document.getElementById('submitInboundBtn'),
    inboundHistoryList: document.getElementById('inboundHistoryList'),
    inboundHistoryCount: document.getElementById('inboundHistoryCount'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    scriptUrlInput: document.getElementById('scriptUrlInput'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),

    // Shipping Confirm Modal
    confirmModal: document.getElementById('confirmModal'),
    confirmWall: document.getElementById('confirmWall'),
    confirmBox: document.getElementById('confirmBox'),
    confirmBarcode: document.getElementById('confirmBarcode'),
    confirmProblem: document.getElementById('confirmProblem'),
    confirmQty: document.getElementById('confirmQty'),
    cancelConfirmBtn: document.getElementById('cancelConfirmBtn'),
    submitConfirmBtn: document.getElementById('submitConfirmBtn'),

    // Inbound Confirm Modal
    inboundConfirmModal: document.getElementById('inboundConfirmModal'),
    confirmInboundRecountDate: document.getElementById('confirmInboundRecountDate'),
    confirmInboundBox: document.getElementById('confirmInboundBox'),
    confirmInboundOtd: document.getElementById('confirmInboundOtd'),
    confirmInboundBarcode: document.getElementById('confirmInboundBarcode'),
    confirmInboundExpiry: document.getElementById('confirmInboundExpiry'),
    cancelInboundConfirmBtn: document.getElementById('cancelInboundConfirmBtn'),
    submitInboundConfirmBtn: document.getElementById('submitInboundConfirmBtn')
  };
}

// ═══════════════════════════════════════════
//  УПРАВЛЕНИЕ ЭКРАНАМИ
// ═══════════════════════════════════════════
function showScreen(screenName) {
  const allScreens = [
    elements.authScreen,
    elements.processSelectScreen,
    elements.wallScanScreen,
    elements.workScreen,
    elements.inboundScreen
  ];
  allScreens.forEach(s => {
    if (s) s.classList.remove('active');
  });

  if (screenName === 'auth') {
    elements.authScreen.classList.add('active');
    setTimeout(() => elements.employeeIdInput?.focus(), 150);
  } else if (screenName === 'process') {
    elements.processSelectScreen.classList.add('active');
    if (elements.processUserName) {
      elements.processUserName.textContent = `${t('userPrefix')} ${state.currentUser?.name || state.currentUser?.id || '...'}`;
    }
  } else if (screenName === 'wall') {
    elements.wallScanScreen.classList.add('active');
    elements.wallUserName.textContent = `${t('userPrefix')} ${state.currentUser?.name || state.currentUser?.id || '...'}`;
    elements.wallBarcodeInput.value = '';
    hideManualNotice();
    setTimeout(() => elements.wallBarcodeInput?.focus(), 150);
  } else if (screenName === 'work') {
    elements.workScreen.classList.add('active');
    elements.activeWallBadge.textContent = `${t('wallPrefix')} ${state.currentWall}`;
    elements.workUserName.textContent = state.currentUser?.name || `ID ${state.currentUser?.id}`;
    elements.workUserShift.textContent = getLocalizedShiftName(state.currentUser?.shift);
    resetItemForm(true);
    if (!elements.cargoPlaceInput.value.trim()) {
      setTimeout(() => elements.cargoPlaceInput?.focus(), 150);
    } else {
      setTimeout(() => elements.itemBarcodeInput?.focus(), 150);
    }
    loadHistory();
  } else if (screenName === 'inbound') {
    elements.inboundScreen.classList.add('active');
    if (elements.inboundUserName) {
      elements.inboundUserName.textContent = state.currentUser?.name || `ID ${state.currentUser?.id}`;
    }
    if (elements.inboundUserShift) {
      elements.inboundUserShift.textContent = getLocalizedShiftName(state.currentUser?.shift);
    }
    if (elements.inboundRecountDate && !elements.inboundRecountDate.value) {
      elements.inboundRecountDate.value = formatIsoDate(new Date());
    }
    loadInboundHistory();
    setTimeout(() => {
      if (elements.inboundBoxNumber && !elements.inboundBoxNumber.value) {
        elements.inboundBoxNumber.focus();
      } else if (elements.inboundBarcode) {
        elements.inboundBarcode.focus();
      }
    }, 150);
  }
}

// ═══════════════════════════════════════════
//  АВТОРИЗАЦИЯ И СМЕНЫ
// ═══════════════════════════════════════════
// ЖЕСТКО ДЛЯ GOOGLE ТАБЛИЦЫ: ВСЕГДА НА РУССКОМ
function getCanonicalShiftName() {
  const hour = new Date().getHours();
  return (hour >= 9 && hour < 21) ? 'День' : 'Ночь';
}

function getCurrentShiftName() {
  return getCanonicalShiftName();
}

function getLocalizedShiftName(shiftStr) {
  const raw = shiftStr || getCanonicalShiftName();
  if (state.currentLang === 'uz') {
    if (raw.includes('День') || raw.includes('1 смена')) return 'Кун сменаси';
    if (raw.includes('Ночь') || raw.includes('2 смена') || raw.includes('3 смена')) return 'Тун сменаси';
    return raw.replace('локально', 'маҳаллий').replace('офлайн', 'офлайн');
  }
  return raw;
}

// ═══════════════════════════════════════════
//  КЭШ ПОДТВЕРЖДЕННЫХ СОТРУДНИКОВ И ПРОФИЛЕЙ
// ═══════════════════════════════════════════
function getVerifiedEmployees() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VERIFIED_EMPLOYEES);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveVerifiedEmployee(emp) {
  if (!emp || !emp.id || !emp.name || emp.name.startsWith('Сотрудник #')) return;
  try {
    const map = getVerifiedEmployees();
    map[String(emp.id).trim()] = {
      id: String(emp.id).trim(),
      name: String(emp.name).trim(),
      shift: emp.shift || getCanonicalShiftName()
    };
    localStorage.setItem(STORAGE_KEYS.VERIFIED_EMPLOYEES, JSON.stringify(map));
  } catch (e) {}
}

function getVerifiedEmployee(empId) {
  const map = getVerifiedEmployees();
  return map[String(empId).trim()] || null;
}

function refreshUserProfile(empId) {
  if (!state.apiUrl || !empId || !navigator.onLine) return;
  fetch(`${state.apiUrl}?action=login&employeeId=${encodeURIComponent(empId)}&t=${Date.now()}`)
    .then(res => res.json())
    .then(data => {
      if (data.success && data.name && !data.name.startsWith('Сотрудник #')) {
        if (state.currentUser && String(state.currentUser.id) === String(empId)) {
          state.currentUser.name = data.name;
          if (data.shift) state.currentUser.shift = data.shift;
          saveVerifiedEmployee(state.currentUser);
          const raw = localStorage.getItem(STORAGE_KEYS.USER_SESSION);
          if (raw) {
            const sess = JSON.parse(raw);
            sess.user = state.currentUser;
            localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(sess));
          }
          updateUserDisplay();
        }
      }
    })
    .catch(() => {});
}

function updateUserDisplay() {
  if (state.currentUser) {
    if (elements.wallUserName) {
      elements.wallUserName.textContent = `${t('userPrefix')} ${state.currentUser.name || state.currentUser.id || '...'}`;
    }
    if (elements.workUserName) {
      elements.workUserName.textContent = state.currentUser.name || `ID ${state.currentUser.id}`;
    }
    if (elements.workUserShift) {
      elements.workUserShift.textContent = getLocalizedShiftName(state.currentUser.shift);
    }
  }
}

function handleLogin(e) {
  e.preventDefault();
  const rawId = elements.employeeIdInput.value.trim();
  if (!rawId) {
    showAuthError(t('enterWmsId'));
    return;
  }

  hideAuthError();
  elements.authSubmitBtn.disabled = true;
  elements.authSubmitBtn.innerHTML = `<span>${t('checking')}</span>`;

  if (!state.apiUrl) {
    showAuthError('URL Google Таблицы не указан в настройках.');
    elements.authSubmitBtn.disabled = false;
    elements.authSubmitBtn.innerHTML = `<span id="authSubmitText" data-i18n="authSubmitBtn">${t('authSubmitBtn')}</span> <span>➜</span>`;
    return;
  }

  const loginUrl = `${state.apiUrl}?action=login&employeeId=${encodeURIComponent(rawId)}&t=${Date.now()}`;
  fetch(loginUrl)
    .then(res => res.json())
    .then(data => {
      if (data.success && data.id && data.name && !data.name.startsWith('Сотрудник #')) {
        const empData = {
          id: String(data.id).trim(),
          name: data.name.trim(),
          shift: data.shift || getCanonicalShiftName()
        };
        saveVerifiedEmployee(empData);
        finalizeLogin(empData);
      } else {
        // Сотрудник не найден в листе Employees - ДОСТУП СТРОГО ЗАПРЕЩЕН
        showAuthError(data.message || t('empNotFound', { id: rawId }));
        playSound('error');
      }
    })
    .catch(err => {
      console.warn('Login request failed, checking local verified cache:', err);
      // Если сети нет, проверяем: был ли этот сотрудник ранее успешно проверен в базе листа Employees
      const verified = getVerifiedEmployee(rawId);
      if (verified && verified.name && !verified.name.startsWith('Сотрудник #')) {
        showToast(state.currentLang === 'uz' ? `Офлайн кириш: ${verified.name}` : `Автономный вход: ${verified.name}`, 'warning');
        finalizeLogin(verified);
      } else {
        // Посторонним или неподтвержденным вход СТРОГО ЗАПРЕЩЕН
        showAuthError(state.currentLang === 'uz'
          ? `Ходим «${rawId}» листда топилмади ёки тармоқ йўқ. Фақат листдаги ходимлар кира олади!`
          : `Сотрудник «${rawId}» не найден в листе Employees либо нет связи. Доступ посторонним запрещен!`);
        playSound('error');
      }
    })
    .finally(() => {
      elements.authSubmitBtn.disabled = false;
      elements.authSubmitBtn.innerHTML = `<span id="authSubmitText" data-i18n="authSubmitBtn">${t('authSubmitBtn')}</span> <span>➜</span>`;
    });
}

function finalizeLogin(userData) {
  state.currentUser = userData;
  state.currentProcess = null;
  localStorage.removeItem(STORAGE_KEYS.CURRENT_PROCESS);
  const sessionData = {
    user: userData,
    shiftDayNight: getCanonicalShiftName(),
    loginTime: Date.now()
  };
  localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(sessionData));
  playSound('success');

  fetchDynamicConfig();
  showScreen('process');
}

function checkSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_SESSION);
    if (!raw) {
      showScreen('auth');
      return;
    }
    const session = JSON.parse(raw);
    const currentShift = getCanonicalShiftName();

    // Защита от пересменки: если смена сменилась (День <-> Ночь), требуем повторный вход
    if (session.shiftDayNight && session.shiftDayNight !== currentShift) {
      localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_PROCESS);
      state.currentProcess = null;
      showScreen('auth');
      showAuthError(state.currentLang === 'uz' ? 'Смена якунланди. Янги смена учун қайтадан киринг.' : 'Смена завершилась. Войдите заново для новой смены.');
      return;
    }

    state.currentUser = session.user;

    // Защита: если в старой сохраненной сессии осталась заглушка "Сотрудник #"
    if (state.currentUser && state.currentUser.id) {
      if (!state.currentUser.name || state.currentUser.name.startsWith('Сотрудник #')) {
        const verified = getVerifiedEmployee(state.currentUser.id);
        if (verified && verified.name && !verified.name.startsWith('Сотрудник #')) {
          state.currentUser.name = verified.name;
          session.user = state.currentUser;
          localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(session));
        }
        refreshUserProfile(state.currentUser.id);
      }
    }

    state.currentProcess = localStorage.getItem(STORAGE_KEYS.CURRENT_PROCESS) || session.currentProcess || null;

    if (state.currentProcess === 'inbound') {
      showScreen('inbound');
    } else if (state.currentProcess === 'shipping') {
      if (session.wall) {
        state.currentWall = session.wall;
        showScreen('work');
      } else {
        showScreen('wall');
      }
    } else {
      showScreen('process');
    }
  } catch (e) {
    localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_PROCESS);
    state.currentProcess = null;
    showScreen('auth');
  }
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
  localStorage.removeItem(STORAGE_KEYS.CURRENT_PROCESS);
  state.currentUser = null;
  state.currentWall = null;
  state.currentProcess = null;
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
//  СКАНЕР СТЕНЫ СОРТИРОВКИ (ОПТИМИЗИРОВАНО ПОД СКАНЕРЫ UROVO В РЕЖИМЕ КЛАВИАТУРЫ)
// ═══════════════════════════════════════════
let wallInputDebounce = null;

function setupWallScannerListener() {
  const input = elements.wallBarcodeInput;

  // Автоматический перехват сканера даже при клике в любое место карточки
  elements.scannerTargetArea.addEventListener('click', () => {
    input.focus();
  });

  input.addEventListener('keydown', (e) => {
    // Клавиша Enter или Tab от сканера Urovo означает окончание считывания
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      clearTimeout(wallInputDebounce);
      const val = input.value.trim();
      if (val) {
        processWallScan(val);
      }
    }
  });

  input.addEventListener('input', () => {
    input.value = autoConvertLayout(input.value);
    hideManualNotice();

    // Авто-фиксация для сканеров без суффикса Enter
    clearTimeout(wallInputDebounce);
    if (input.value.trim().length >= 2) {
      wallInputDebounce = setTimeout(() => {
        if (elements.wallScanScreen.classList.contains('active')) {
          processWallScan(input.value.trim());
        }
      }, 300);
    }
  });
}

function hideManualNotice() {
  elements.manualInputNotice.classList.remove('visible');
}

function processWallScan(rawCode) {
  const wallCode = autoConvertLayout(rawCode).trim();
  if (!wallCode || wallCode.length < 1) return;

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
  // ШК Короба
  const cargoInput = elements.cargoPlaceInput;
  cargoInput.addEventListener('input', () => {
    const val = autoConvertLayout(cargoInput.value).trim();
    cargoInput.value = val;
    updateCargoPlaceStatus(val);
    clearCargoPlaceError();
  });

  cargoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = cargoInput.value.trim();
      if (!val) {
        showCargoPlaceError(t('scanBoxFirst'));
        playSound('error');
      } else {
        updateCargoPlaceStatus(val);
        clearCargoPlaceError();
        elements.itemBarcodeInput.focus();
      }
    }
  });

  elements.clearCargoPlace.addEventListener('click', () => {
    cargoInput.value = '';
    updateCargoPlaceStatus('');
    clearCargoPlaceError();
    cargoInput.focus();
  });

  // Штрих-код товара
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
        showItemBarcodeError(t('barcode13Err'));
        playSound('error');
      } else {
        showToast(t('barcodeAccepted'), 'loading');
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

function updateCargoPlaceStatus(val) {
  if (elements.cargoPlaceStatus) {
    if (val) {
      elements.cargoPlaceStatus.textContent = `${t('boxPrefix')} ${val}`;
      elements.cargoPlaceStatus.classList.add('valid');
    } else {
      elements.cargoPlaceStatus.textContent = '';
      elements.cargoPlaceStatus.classList.remove('valid');
    }
  }
  if (val) {
    elements.cargoPlaceInput.classList.add('input-valid');
    elements.cargoPlaceInput.classList.remove('input-error');
  } else {
    elements.cargoPlaceInput.classList.remove('input-valid');
  }
}

function showCargoPlaceError(msg) {
  elements.cargoPlaceError.textContent = msg;
  elements.cargoPlaceError.classList.add('visible');
  elements.cargoPlaceInput.classList.add('input-error');
  elements.cargoPlaceInput.classList.remove('input-valid');
}

function clearCargoPlaceError() {
  elements.cargoPlaceError.classList.remove('visible');
  elements.cargoPlaceInput.classList.remove('input-error');
}

function updateBarcodeCounter(len) {
  if (elements.barcodeDigitCounter) {
    elements.barcodeDigitCounter.textContent = `${len} / 13`;
    if (len === 13) {
      elements.barcodeDigitCounter.classList.add('valid');
    } else {
      elements.barcodeDigitCounter.classList.remove('valid');
    }
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

function resetItemForm(keepCargoPlace = true) {
  if (!keepCargoPlace) {
    elements.cargoPlaceInput.value = '';
    updateCargoPlaceStatus('');
  }
  clearCargoPlaceError();
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
    btn.setAttribute('data-problem-ru', prob.ru);

    const displayName = (state.currentLang === 'uz' && prob.uz) ? prob.uz : prob.ru;

    btn.innerHTML = `
      <span class="problem-icon">${prob.icon || '⚠️'}</span>
      <span class="problem-title">${displayName}</span>
    `;

    btn.addEventListener('click', () => {
      handleProblemSelection(prob, btn);
    });

    elements.problemsGrid.appendChild(btn);
  });
}

function handleProblemSelection(prob, btnElement) {
  const cargoPlace = elements.cargoPlaceInput.value.trim();
  const barcode = elements.itemBarcodeInput.value.trim();

  // 1. Валидация ШК Короба
  if (!cargoPlace) {
    showCargoPlaceError(t('scanBoxFirst'));
    playSound('error');
    elements.cargoPlaceInput.focus();
    return;
  }

  // 2. Строгая валидация: строго 13 цифр!
  if (!/^\d{13}$/.test(barcode)) {
    showItemBarcodeError(t('barcode13Err'));
    playSound('error');
    elements.itemBarcodeInput.focus();
    return;
  }

  // Подсвечиваем выбранную кнопку
  document.querySelectorAll('.problem-card-btn').forEach(b => b.classList.remove('selected'));
  btnElement.classList.add('selected');

  const qty = parseInt(elements.qtyInput.value, 10) || 1;
  const displayName = (state.currentLang === 'uz' && prob.uz) ? prob.uz : prob.ru;

  // Открываем окно подтверждения перед отправкой
  // ВАЖНО: prob.ru жестко сохраняется на русском для Google Таблицы!
  openConfirmModal({
    cargoPlace: cargoPlace,
    barcode: barcode,
    problemRu: prob.ru,
    problemDisplay: displayName,
    qty: qty,
    sortingWall: state.currentWall
  });
}

function openConfirmModal(record) {
  state.pendingRecord = record;

  if (elements.confirmWall) elements.confirmWall.textContent = record.sortingWall || '—';
  if (elements.confirmBox) elements.confirmBox.textContent = record.cargoPlace || '—';
  if (elements.confirmBarcode) elements.confirmBarcode.textContent = record.barcode || '—';
  if (elements.confirmProblem) elements.confirmProblem.textContent = record.problemDisplay || record.problemRu || '—';
  if (elements.confirmQty) elements.confirmQty.textContent = `${record.qty} ${t('pcs')}`;

  if (elements.confirmModal) {
    elements.confirmModal.classList.add('active');
    setTimeout(() => elements.submitConfirmBtn?.focus(), 100);
  }
}

function closeConfirmModal() {
  state.pendingRecord = null;
  if (elements.confirmModal) {
    elements.confirmModal.classList.remove('active');
  }
  document.querySelectorAll('.problem-card-btn').forEach(b => b.classList.remove('selected'));
}

// ═══════════════════════════════════════════
//  ОТПРАВКА ЗАПИСИ (ФИКСАЦИЯ В 14 КОЛОНОК)
// ═══════════════════════════════════════════
function submitProblemRecord(record) {
  if (state.isSubmitting) return;
  state.isSubmitting = true;

  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);

  // ЖЕСТКО НА РУССКОМ ЯЗЫКЕ ДЛЯ GOOGLE ТАБЛИЦЫ
  const shiftNameRu = getCanonicalShiftName();
  const clientRecordId = 'rec_' + now.getTime() + '_' + Math.random().toString(36).substring(2, 9);

  const recordPayload = {
    clientRecordId: clientRecordId,
    dateStr: dateStr,
    timeStr: timeStr,
    shiftName: shiftNameRu,                  // <-- ЖЕСТКО: "День" или "Ночь"
    employeeId: state.currentUser?.id || '',
    employeeName: state.currentUser?.name || '',
    sortingWall: record.sortingWall,
    cargoPlace: record.cargoPlace,
    barcode: record.barcode,
    description: '',                         // Колонка 9: Описание
    category1: '',                           // Колонка 10: Категория 1
    category2: '',                           // Колонка 11: Категория 2
    compensationPrice: '',                   // Колонка 12: Цена компенсации
    problem: record.problemRu,               // <-- ЖЕСТКО: канонический текст на русском языке!
    qty: record.qty
  };

  // Мгновенный оптимистичный UX: проигрываем победный звук и добавляем в историю
  playSound('success');
  addRecordToHistory({
    ...recordPayload,
    problemDisplay: record.problemDisplay || record.problemRu
  });

  const boxLabel = t('boxPrefix');
  showToast(`✅ ${boxLabel} ${record.cargoPlace} • ${record.problemDisplay || record.problemRu} (${record.barcode})`, 'success');
  resetItemForm(true); // Сохраняем текущий короб для фиксации следующих товаров
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
    clientRecordId: recordPayload.clientRecordId,
    dateStr: recordPayload.dateStr,
    timeStr: recordPayload.timeStr,
    shiftName: recordPayload.shiftName,
    employeeId: recordPayload.employeeId,
    employeeName: recordPayload.employeeName,
    sortingWall: recordPayload.sortingWall,
    cargoPlace: recordPayload.cargoPlace,
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
  const count = state.offlineQueue.length + state.inboundOfflineQueue.length;
  if (elements.offlineCount) elements.offlineCount.textContent = count;
  if (elements.offlineBadge) {
    if (count > 0) {
      elements.offlineBadge.classList.add('visible');
    } else {
      elements.offlineBadge.classList.remove('visible');
    }
  }
}

let isSyncingQueue = false;

function syncOfflineQueue() {
  if (isSyncingQueue || !state.apiUrl || state.offlineQueue.length === 0 || !navigator.onLine) return;
  isSyncingQueue = true;

  const recordsToSend = [...state.offlineQueue];
  const payloadJson = JSON.stringify(recordsToSend);

  const url = `${state.apiUrl}?action=addRecords&recordsJson=${encodeURIComponent(payloadJson)}`;
  fetch(url, { method: 'GET' })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        const sentIds = new Set(recordsToSend.map(r => r.clientRecordId).filter(Boolean));
        if (sentIds.size > 0) {
          state.offlineQueue = state.offlineQueue.filter(r => !sentIds.has(r.clientRecordId));
        } else {
          state.offlineQueue = [];
        }
        saveOfflineQueue();
        updateOfflineQueueBadge();
        showToast(`⚡ Синхронизировано ${recordsToSend.length} офлайн записей!`, 'success');
      }
    })
    .catch(err => console.warn('Offline sync retry failed:', err))
    .finally(() => {
      isSyncingQueue = false;
    });
}

function enqueueInboundOfflineRecord(record) {
  state.inboundOfflineQueue.push(record);
  saveInboundOfflineQueue();
  updateOfflineQueueBadge();
}

function saveInboundOfflineQueue() {
  localStorage.setItem(STORAGE_KEYS.INBOUND_OFFLINE_QUEUE, JSON.stringify(state.inboundOfflineQueue));
}

let isSyncingInboundQueue = false;

function syncInboundOfflineQueue() {
  if (isSyncingInboundQueue || !state.apiUrl || state.inboundOfflineQueue.length === 0 || !navigator.onLine) return;
  isSyncingInboundQueue = true;

  const recordsToSend = [...state.inboundOfflineQueue];
  const payloadJson = JSON.stringify(recordsToSend);

  const url = `${state.apiUrl}?action=addInboundRecords&recordsJson=${encodeURIComponent(payloadJson)}`;
  fetch(url, { method: 'GET' })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        const sentIds = new Set(recordsToSend.map(r => r.clientRecordId).filter(Boolean));
        if (sentIds.size > 0) {
          state.inboundOfflineQueue = state.inboundOfflineQueue.filter(r => !sentIds.has(r.clientRecordId));
        } else {
          state.inboundOfflineQueue = [];
        }
        saveInboundOfflineQueue();
        updateOfflineQueueBadge();
        showToast(`⚡ Синхронизировано ${recordsToSend.length} офлайн записей входящего потока!`, 'success');
      }
    })
    .catch(err => console.warn('Inbound offline sync retry failed:', err))
    .finally(() => {
      isSyncingInboundQueue = false;
    });
}

window.addEventListener('online', () => {
  syncOfflineQueue();
  syncInboundOfflineQueue();
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
  elements.historyCount.textContent = `${state.history.length} ${t('recordsSuffix')}`;

  if (state.history.length === 0) {
    elements.historyList.innerHTML = `<div class="history-empty">${t('historyEmpty')}</div>`;
    return;
  }

  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const reasonDisplay = (state.currentLang === 'uz')
      ? (RU_TO_UZ_PROBLEMS_MAP[(item.problem || '').toLowerCase().trim()] || getClientTranslation(item.problem) || item.problemDisplay || item.problem)
      : (item.problem || item.problemDisplay);

    div.innerHTML = `
      <div class="history-item-left">
        <span class="history-barcode">${item.barcode}</span>
        <div style="display: flex; gap: 8px; font-size: 12px; align-items: center;">
          ${item.cargoPlace ? `<span style="color: var(--text-secondary); font-family: var(--font-display); font-weight: 600;">📦 ${t('boxPrefix')} ${item.cargoPlace}</span>` : ''}
          <span class="history-reason">${reasonDisplay}</span>
        </div>
      </div>
      <div class="history-item-right">
        <span class="history-qty">${item.qty} ${t('pcs')}</span>
        <span class="history-time">${item.timeStr || ''}</span>
      </div>
    `;
    elements.historyList.appendChild(div);
  });
}

// ═══════════════════════════════════════════
//  ИСТОРИЯ ВХОДЯЩЕГО ПОТОКА
// ═══════════════════════════════════════════
function addInboundRecordToHistory(rec) {
  state.inboundHistory.unshift(rec);
  if (state.inboundHistory.length > 50) state.inboundHistory.pop();
  localStorage.setItem(STORAGE_KEYS.INBOUND_HISTORY, JSON.stringify(state.inboundHistory));
  renderInboundHistoryList();
}

function loadInboundHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INBOUND_HISTORY);
    if (raw) {
      state.inboundHistory = JSON.parse(raw);
    }
  } catch (e) {}
  renderInboundHistoryList();
}

function renderInboundHistoryList() {
  if (!elements.inboundHistoryList) return;
  elements.inboundHistoryList.innerHTML = '';
  if (elements.inboundHistoryCount) {
    elements.inboundHistoryCount.textContent = `${state.inboundHistory.length} ${t('recordsSuffix')}`;
  }

  if (state.inboundHistory.length === 0) {
    elements.inboundHistoryList.innerHTML = `<div class="history-empty">${t('inboundHistoryEmpty')}</div>`;
    return;
  }

  state.inboundHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const boxLabel = state.currentLang === 'uz' ? 'Қути' : 'Короб';
    const expiryLabel = state.currentLang === 'uz' ? 'Муддати' : 'Срок';

    div.innerHTML = `
      <div class="history-item-left">
        <span class="history-barcode">${item.barcode}</span>
        <div style="display: flex; gap: 8px; font-size: 12px; align-items: center; flex-wrap: wrap;">
          <span style="color: var(--text-secondary); font-family: var(--font-display); font-weight: 600;">📦 ${boxLabel}: ${item.boxNumber || item.actNumber || '—'}</span>
          ${item.otdFixation ? `<span style="color: var(--accent-color); font-weight: 600;">⚡ ОТД: ${item.otdFixation}</span>` : ''}
          ${item.recountDate ? `<span style="color: var(--text-muted);">📅 ${item.recountDate}</span>` : ''}
        </div>
      </div>
      <div class="history-item-right">
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
          ${item.expiryDate ? `<span style="font-size: 11px; color: var(--accent-color); font-weight: 600;">⏳ ${expiryLabel}: ${item.expiryDate}</span>` : ''}
          <span class="history-time">${item.timeStr || ''}</span>
        </div>
      </div>
    `;
    elements.inboundHistoryList.appendChild(div);
  });
}

// ═══════════════════════════════════════════
//  ВХОДЯЩИЙ ПОТОК: ОБРАБОТКА, ВАЛИДАЦИЯ И ОТПРАВКА
// ═══════════════════════════════════════════
function formatIsoDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAndFormatDisplayDate(val) {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const parts = val.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return val;
}

function clearInboundErrors() {
  const errorIds = [
    'inboundRecountDateError',
    'inboundBoxError',
    'inboundOtdDateError',
    'inboundBarcodeError',
    'inboundExpiryDateError'
  ];
  errorIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = '';
      el.classList.remove('visible');
    }
  });

  const inputs = [
    elements.inboundRecountDate,
    elements.inboundBoxNumber,
    elements.inboundOtdDate,
    elements.inboundBarcode,
    elements.inboundExpiryDate
  ];
  inputs.forEach(inp => {
    if (inp) {
      inp.classList.remove('input-error');
    }
  });
}

function showInboundError(errId, inputEl, msg) {
  const errEl = document.getElementById(errId);
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.add('visible');
  }
  if (inputEl) {
    inputEl.classList.add('input-error');
    inputEl.focus();
  }
  playSound('error');
}

function handleInboundSubmit() {
  clearInboundErrors();

  const recountDate = elements.inboundRecountDate ? elements.inboundRecountDate.value.trim() : '';
  const boxNumber = elements.inboundBoxNumber ? autoConvertLayout(elements.inboundBoxNumber.value).trim() : '';
  const barcode = elements.inboundBarcode ? autoConvertLayout(elements.inboundBarcode.value).replace(/\D/g, '').trim() : '';
  const expiryDate = elements.inboundExpiryDate ? elements.inboundExpiryDate.value.trim() : '';
  const otdDate = elements.inboundOtdDate ? elements.inboundOtdDate.value.trim() : '';

  if (!recountDate) {
    showInboundError('inboundRecountDateError', elements.inboundRecountDate, t('enterRecountDate'));
    return;
  }
  if (!boxNumber) {
    showInboundError('inboundBoxError', elements.inboundBoxNumber, t('enterBoxNumber'));
    return;
  }
  if (!/^\d{13}$/.test(barcode)) {
    showInboundError('inboundBarcodeError', elements.inboundBarcode, t('barcode13Err'));
    return;
  }
  if (!expiryDate) {
    showInboundError('inboundExpiryDateError', elements.inboundExpiryDate, t('enterExpiryDate'));
    return;
  }
  if (!otdDate) {
    showInboundError('inboundOtdDateError', elements.inboundOtdDate, t('enterOtdDate'));
    return;
  }

  openInboundConfirmModal({
    recountDate: recountDate,
    recountDateFormatted: parseAndFormatDisplayDate(recountDate),
    boxNumber: boxNumber,
    barcode: barcode,
    expiryDate: expiryDate,
    expiryDateFormatted: parseAndFormatDisplayDate(expiryDate),
    otdDate: otdDate,
    otdDateFormatted: parseAndFormatDisplayDate(otdDate)
  });
}

function openInboundConfirmModal(record) {
  state.pendingInboundRecord = record;

  if (elements.confirmInboundRecountDate) {
    elements.confirmInboundRecountDate.textContent = record.recountDateFormatted || record.recountDate || '—';
  }
  if (elements.confirmInboundBox) {
    elements.confirmInboundBox.textContent = record.boxNumber || '—';
  }
  if (elements.confirmInboundBarcode) {
    elements.confirmInboundBarcode.textContent = record.barcode || '—';
  }
  if (elements.confirmInboundExpiry) {
    elements.confirmInboundExpiry.textContent = record.expiryDateFormatted || record.expiryDate || '—';
  }
  if (elements.confirmInboundOtd) {
    elements.confirmInboundOtd.textContent = record.otdDateFormatted || record.otdDate || '—';
  }

  if (elements.inboundConfirmModal) {
    elements.inboundConfirmModal.classList.add('active');
    setTimeout(() => elements.submitInboundConfirmBtn?.focus(), 100);
  }
}

function closeInboundConfirmModal() {
  state.pendingInboundRecord = null;
  if (elements.inboundConfirmModal) {
    elements.inboundConfirmModal.classList.remove('active');
  }
}

function resetInboundForm() {
  if (elements.inboundRecountDate) elements.inboundRecountDate.value = formatIsoDate(new Date());
  if (elements.inboundBoxNumber) elements.inboundBoxNumber.value = '';
  if (elements.inboundBarcode) {
    elements.inboundBarcode.value = '';
    elements.inboundBarcode.classList.remove('input-valid', 'input-error');
  }
  if (elements.inboundExpiryDate) elements.inboundExpiryDate.value = '';
  if (elements.inboundOtdDate) elements.inboundOtdDate.value = '';

  clearInboundErrors();

  if (elements.inboundBoxNumber) {
    elements.inboundBoxNumber.focus();
  }
}

function submitInboundRecord(record) {
  if (state.isSubmitting) return;
  state.isSubmitting = true;

  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);
  const clientRecordId = 'inb_' + now.getTime() + '_' + Math.random().toString(36).substring(2, 9);

  const recountFormatted = record.recountDateFormatted || parseAndFormatDisplayDate(record.recountDate);
  const otdFormatted = record.otdDateFormatted || parseAndFormatDisplayDate(record.otdDate);
  const expiryFormatted = record.expiryDateFormatted || parseAndFormatDisplayDate(record.expiryDate);

  const inboundPayload = {
    clientRecordId: clientRecordId,
    dateStr: dateStr,
    timeStr: timeStr,
    employeeId: state.currentUser?.id || '',
    employeeName: state.currentUser?.name || '',
    recountDate: recountFormatted,
    boxNumber: record.boxNumber,
    barcode: record.barcode,
    expiryDate: expiryFormatted,
    otdFixation: otdFormatted,
    category1: '',
    category2: '',
    compensationPrice: ''
  };

  playSound('success');
  addInboundRecordToHistory(inboundPayload);

  showToast(`✅ Короб № ${record.boxNumber} • ШК ${record.barcode}`, 'success');

  // Очищаем форму ("чистим все. вносим все заново.")
  resetInboundForm();

  if (!state.apiUrl || !navigator.onLine) {
    enqueueInboundOfflineRecord(inboundPayload);
    state.isSubmitting = false;
    return;
  }

  const queryParams = new URLSearchParams({
    action: 'addInboundRecord',
    clientRecordId: inboundPayload.clientRecordId,
    dateStr: inboundPayload.dateStr,
    timeStr: inboundPayload.timeStr,
    employeeId: inboundPayload.employeeId,
    employeeName: inboundPayload.employeeName,
    recountDate: inboundPayload.recountDate,
    boxNumber: inboundPayload.boxNumber,
    barcode: inboundPayload.barcode,
    expiryDate: inboundPayload.expiryDate,
    otdFixation: inboundPayload.otdFixation,
    category1: '',
    category2: '',
    compensationPrice: ''
  });

  fetch(`${state.apiUrl}?${queryParams.toString()}`, { method: 'GET' })
    .then(res => res.json())
    .then(res => {
      if (!res.success) {
        console.warn('Inbound server error, queueing offline:', res.message);
        enqueueInboundOfflineRecord(inboundPayload);
      }
    })
    .catch(err => {
      console.warn('Inbound network error, queueing offline:', err);
      enqueueInboundOfflineRecord(inboundPayload);
    })
    .finally(() => {
      state.isSubmitting = false;
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
        state.problemsList = res.problems.map(item => {
          const cleanRu = (typeof item === 'object' && item.ru) ? item.ru.trim() : String(item).trim();
          let uzTranslation = (typeof item === 'object' && item.uz) ? item.uz.trim() : '';
          if (!uzTranslation || uzTranslation === cleanRu) {
            uzTranslation = getClientTranslation(cleanRu);
          }

          let icon = '📦';
          for (const [key, ic] of Object.entries(PROBLEM_ICON_MAP)) {
            if (cleanRu.toLowerCase().includes(key)) {
              icon = ic;
              break;
            }
          }

          return {
            ru: cleanRu,
            uz: uzTranslation || cleanRu,
            icon: icon
          };
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

  try {
    const inbQueue = localStorage.getItem(STORAGE_KEYS.INBOUND_OFFLINE_QUEUE);
    if (inbQueue) state.inboundOfflineQueue = JSON.parse(inbQueue);
  } catch (e) {}

  try {
    const inbHist = localStorage.getItem(STORAGE_KEYS.INBOUND_HISTORY);
    if (inbHist) state.inboundHistory = JSON.parse(inbHist);
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
//  СЛУШАТЕЛИ ВЫБОРА ПРОЦЕССА
// ═══════════════════════════════════════════
function setupProcessSelectListeners() {
  if (elements.selectShippingBtn) {
    elements.selectShippingBtn.addEventListener('click', () => {
      state.currentProcess = 'shipping';
      localStorage.setItem(STORAGE_KEYS.CURRENT_PROCESS, 'shipping');
      if (state.currentWall) {
        showScreen('work');
      } else {
        showScreen('wall');
      }
    });
  }

  if (elements.selectInboundBtn) {
    elements.selectInboundBtn.addEventListener('click', () => {
      state.currentProcess = 'inbound';
      localStorage.setItem(STORAGE_KEYS.CURRENT_PROCESS, 'inbound');
      showScreen('inbound');
    });
  }

  if (elements.logoutBtnFromProcess) {
    elements.logoutBtnFromProcess.addEventListener('click', logout);
  }

  const changeProcessButtons = [
    elements.changeProcessFromWallBtn,
    elements.changeProcessFromWorkBtn,
    elements.changeProcessFromInboundBtn
  ];

  changeProcessButtons.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        state.currentProcess = null;
        localStorage.removeItem(STORAGE_KEYS.CURRENT_PROCESS);
        showScreen('process');
      });
    }
  });
}

// ═══════════════════════════════════════════
//  СЛУШАТЕЛИ ЭКРАНА ВХОДЯЩЕГО ПОТОКА
// ═══════════════════════════════════════════
function setupInboundListeners() {
  // Очистка полей
  if (elements.clearInboundBox) {
    elements.clearInboundBox.addEventListener('click', () => {
      elements.inboundBoxNumber.value = '';
      const err = document.getElementById('inboundBoxError');
      if (err) err.classList.remove('visible');
      elements.inboundBoxNumber.classList.remove('input-error');
      elements.inboundBoxNumber.focus();
    });
  }

  if (elements.clearInboundBarcode) {
    elements.clearInboundBarcode.addEventListener('click', () => {
      elements.inboundBarcode.value = '';
      elements.inboundBarcode.classList.remove('input-valid', 'input-error');
      const err = document.getElementById('inboundBarcodeError');
      if (err) err.classList.remove('visible');
      elements.inboundBarcode.focus();
    });
  }

  // Автоконвертация раскладки при вводе и переход по Enter
  if (elements.inboundBoxNumber) {
    elements.inboundBoxNumber.addEventListener('input', () => {
      elements.inboundBoxNumber.value = autoConvertLayout(elements.inboundBoxNumber.value);
      const err = document.getElementById('inboundBoxError');
      if (err) err.classList.remove('visible');
      elements.inboundBoxNumber.classList.remove('input-error');
    });

    elements.inboundBoxNumber.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = elements.inboundBoxNumber.value.trim();
        if (!val) {
          showInboundError('inboundBoxError', elements.inboundBoxNumber, t('enterBoxNumber'));
        } else {
          elements.inboundBarcode.focus();
        }
      }
    });
  }

  if (elements.inboundBarcode) {
    elements.inboundBarcode.addEventListener('input', () => {
      const converted = autoConvertLayout(elements.inboundBarcode.value).replace(/\D/g, '');
      elements.inboundBarcode.value = converted;
      const err = document.getElementById('inboundBarcodeError');
      if (err) err.classList.remove('visible');

      if (converted.length === 13) {
        elements.inboundBarcode.classList.remove('input-error');
        elements.inboundBarcode.classList.add('input-valid');
      } else {
        elements.inboundBarcode.classList.remove('input-valid');
        if (converted.length > 13) {
          elements.inboundBarcode.classList.add('input-error');
        }
      }
    });

    elements.inboundBarcode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = elements.inboundBarcode.value.trim();
        if (code.length !== 13) {
          showInboundError('inboundBarcodeError', elements.inboundBarcode, t('barcode13Err'));
        } else {
          if (!elements.inboundExpiryDate.value) {
            elements.inboundExpiryDate.focus();
          } else if (!elements.inboundOtdDate.value) {
            elements.inboundOtdDate.focus();
          } else {
            handleInboundSubmit();
          }
        }
      }
    });
  }

  if (elements.inboundExpiryDate) {
    elements.inboundExpiryDate.addEventListener('change', () => {
      const err = document.getElementById('inboundExpiryDateError');
      if (err) err.classList.remove('visible');
      elements.inboundExpiryDate.classList.remove('input-error');
      if (elements.inboundExpiryDate.value && !elements.inboundOtdDate.value) {
        elements.inboundOtdDate.focus();
      }
    });
  }

  if (elements.inboundOtdDate) {
    elements.inboundOtdDate.addEventListener('change', () => {
      const err = document.getElementById('inboundOtdDateError');
      if (err) err.classList.remove('visible');
      elements.inboundOtdDate.classList.remove('input-error');
    });
  }

  if (elements.inboundRecountDate) {
    elements.inboundRecountDate.addEventListener('change', () => {
      const err = document.getElementById('inboundRecountDateError');
      if (err) err.classList.remove('visible');
      elements.inboundRecountDate.classList.remove('input-error');
    });
  }

  // Отправка формы входящего потока
  if (elements.inboundForm) {
    elements.inboundForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleInboundSubmit();
    });
  }

  // Модалка подтверждения входящего потока
  if (elements.cancelInboundConfirmBtn) {
    elements.cancelInboundConfirmBtn.addEventListener('click', closeInboundConfirmModal);
  }

  if (elements.submitInboundConfirmBtn) {
    elements.submitInboundConfirmBtn.addEventListener('click', () => {
      if (state.pendingInboundRecord) {
        const rec = state.pendingInboundRecord;
        closeInboundConfirmModal();
        submitInboundRecord(rec);
      }
    });
  }

  if (elements.inboundConfirmModal) {
    elements.inboundConfirmModal.addEventListener('click', (e) => {
      if (e.target === elements.inboundConfirmModal) {
        closeInboundConfirmModal();
      }
    });
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

  // Выбор процесса
  setupProcessSelectListeners();

  // Сканер стены
  setupWallScannerListener();

  // Рабочий экран отгрузки
  setupWorkScreenListeners();

  // Рабочий экран входящего потока
  setupInboundListeners();

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
      syncInboundOfflineQueue();
    }
  });

  // Переключатели языка (флажки в верхней панели и на экране входа)
  document.querySelectorAll('.top-lang-btn, .lang-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      if (lang) setLanguage(lang);
    });
  });

  // Модалка подтверждения фиксации отгрузки
  if (elements.cancelConfirmBtn) {
    elements.cancelConfirmBtn.addEventListener('click', () => {
      closeConfirmModal();
      elements.itemBarcodeInput.focus();
    });
  }

  if (elements.submitConfirmBtn) {
    elements.submitConfirmBtn.addEventListener('click', () => {
      if (state.pendingRecord) {
        const record = state.pendingRecord;
        closeConfirmModal();
        submitProblemRecord(record);
      }
    });
  }

  if (elements.confirmModal) {
    elements.confirmModal.addEventListener('click', (e) => {
      if (e.target === elements.confirmModal) {
        closeConfirmModal();
      }
    });
  }

  // Глобальный перехват ввода со сканера UROVO-R70 (режим клавиатуры)
  document.addEventListener('keydown', (e) => {
    // 0. Если открыта модалка подтверждения входящего потока
    if (elements.inboundConfirmModal && elements.inboundConfirmModal.classList.contains('active')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeInboundConfirmModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.pendingInboundRecord) {
          const rec = state.pendingInboundRecord;
          closeInboundConfirmModal();
          submitInboundRecord(rec);
        }
      }
      return;
    }

    // 0.1 Если открыта модалка подтверждения отгрузки: Enter отправляет, Escape закрывает
    if (elements.confirmModal && elements.confirmModal.classList.contains('active')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeConfirmModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.pendingRecord) {
          const record = state.pendingRecord;
          closeConfirmModal();
          submitProblemRecord(record);
        }
      }
      return;
    }

    if (e.key === 'Escape' || e.key.startsWith('F') || e.ctrlKey || e.altKey || e.metaKey) return;
    if (elements.settingsModal && elements.settingsModal.classList.contains('active')) return;

    const activeEl = document.activeElement;

    // 1. Экран сканирования стены
    if (elements.wallScanScreen && elements.wallScanScreen.classList.contains('active')) {
      if (activeEl !== elements.wallBarcodeInput) {
        elements.wallBarcodeInput.focus();
      }
    }
    // 2. Рабочий экран фиксации отгрузки
    else if (elements.workScreen && elements.workScreen.classList.contains('active')) {
      const isInput = (activeEl === elements.cargoPlaceInput || activeEl === elements.itemBarcodeInput || activeEl === elements.qtyInput);
      if (!isInput) {
        if (!elements.cargoPlaceInput.value.trim()) {
          elements.cargoPlaceInput.focus();
        } else {
          elements.itemBarcodeInput.focus();
        }
      }
    }
    // 3. Рабочий экран входящего потока
    else if (elements.inboundScreen && elements.inboundScreen.classList.contains('active')) {
      const isInboundInput = (
        activeEl === elements.inboundRecountDate ||
        activeEl === elements.inboundBoxNumber ||
        activeEl === elements.inboundOtdDate ||
        activeEl === elements.inboundBarcode ||
        activeEl === elements.inboundExpiryDate
      );
      if (!isInboundInput) {
        if (!elements.inboundBoxNumber.value.trim()) {
          elements.inboundBoxNumber.focus();
        } else {
          elements.inboundBarcode.focus();
        }
      }
    }
  });
}
