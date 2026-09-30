// 화면에 보이는 서비스 이름. 이름을 바꿀 때는 이 값과 index.html의 기본 문구(title/h1/meta), manifest만 고치면 된다.
// 부제("AI 일본 여행 플래너")는 언어 사전의 'brand-subtitle' 값이다.
var BRAND_NAME = 'Tabimaru';

// 여행 시작일을 비워 두면 2주 뒤로 잡는다(당일 왕복 항공권은 가격 데이터가 거의 없어서).
var DEFAULT_START_OFFSET_DAYS = 14;

// 사용자 기기 시간대 기준 날짜(YYYY-MM-DD). toISOString()은 UTC라서 한국 새벽(00:00~08:59)에 하루 전 날짜가 된다.
function localDateString(date) {
  var d = date || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function todayDateString() {
  return localDateString(new Date());
}

function defaultStartDate() {
  return addDays(todayDateString(), DEFAULT_START_OFFSET_DAYS) || todayDateString();
}

function applyDefaultDates() {
  const start = document.getElementById('startDate');
  if (start && !start.value) start.value = defaultStartDate();
  syncDatesToDependentForms();
}

applyDefaultDates();

const AIRPORTS = [
  { code: 'ICN', nameKo: '인천국제공항', cityKo: '인천', country: 'KR' },
  { code: 'GMP', nameKo: '김포국제공항', cityKo: '서울', country: 'KR' },
  { code: 'PUS', nameKo: '김해국제공항', cityKo: '부산', country: 'KR' },
  { code: 'CJU', nameKo: '제주국제공항', cityKo: '제주', country: 'KR' },
  { code: 'TAE', nameKo: '대구국제공항', cityKo: '대구', country: 'KR' },
  { code: 'CJJ', nameKo: '청주국제공항', cityKo: '청주', country: 'KR' },
  { code: 'MWX', nameKo: '무안국제공항', cityKo: '무안', country: 'KR' },
  { code: 'RSU', nameKo: '여수공항', cityKo: '여수', country: 'KR' },
  { code: 'USN', nameKo: '울산공항', cityKo: '울산', country: 'KR' },
  { code: 'KUV', nameKo: '군산공항', cityKo: '군산', country: 'KR' },
  { code: 'YNY', nameKo: '양양국제공항', cityKo: '양양', country: 'KR' },

  { code: 'NRT', nameKo: '나리타국제공항', cityKo: '도쿄', country: 'JP' },
  { code: 'HND', nameKo: '하네다공항', cityKo: '도쿄', country: 'JP' },
  { code: 'KIX', nameKo: '간사이국제공항', cityKo: '오사카', country: 'JP' },
  { code: 'ITM', nameKo: '오사카 이타미공항', cityKo: '오사카', country: 'JP' },
  { code: 'CTS', nameKo: '신치토세공항', cityKo: '삿포로', country: 'JP' },
  { code: 'HKD', nameKo: '하코다테공항', cityKo: '하코다테', country: 'JP' },
  { code: 'AKJ', nameKo: '아사히카와공항', cityKo: '아사히카와', country: 'JP' },
  { code: 'OBO', nameKo: '오비히로공항', cityKo: '오비히로', country: 'JP' },
  { code: 'AOJ', nameKo: '아오모리공항', cityKo: '아오모리', country: 'JP' },
  { code: 'AXT', nameKo: '아키타공항', cityKo: '아키타', country: 'JP' },
  { code: 'HNA', nameKo: '하나마키공항', cityKo: '이와테', country: 'JP' },
  { code: 'GAJ', nameKo: '야마가타공항', cityKo: '야마가타', country: 'JP' },
  { code: 'SDJ', nameKo: '센다이공항', cityKo: '센다이', country: 'JP' },
  { code: 'FKS', nameKo: '후쿠시마공항', cityKo: '후쿠시마', country: 'JP' },
  { code: 'KIJ', nameKo: '니가타공항', cityKo: '니가타', country: 'JP' },
  { code: 'KMQ', nameKo: '고마쓰공항', cityKo: '가나자와', country: 'JP' },
  { code: 'TOY', nameKo: '도야마공항', cityKo: '도야마', country: 'JP' },
  { code: 'FSZ', nameKo: '시즈오카공항', cityKo: '시즈오카', country: 'JP' },
  { code: 'NGO', nameKo: '주부 센트레아 국제공항', cityKo: '나고야', country: 'JP' },
  { code: 'OKJ', nameKo: '오카야마공항', cityKo: '오카야마', country: 'JP' },
  { code: 'HIJ', nameKo: '히로시마공항', cityKo: '히로시마', country: 'JP' },
  { code: 'YGJ', nameKo: '요나고공항', cityKo: '요나고', country: 'JP' },
  { code: 'IZO', nameKo: '이즈모공항', cityKo: '이즈모', country: 'JP' },
  { code: 'TAK', nameKo: '다카마쓰공항', cityKo: '다카마쓰', country: 'JP' },
  { code: 'MYJ', nameKo: '마쓰야마공항', cityKo: '마쓰야마', country: 'JP' },
  { code: 'KCZ', nameKo: '고치공항', cityKo: '고치', country: 'JP' },
  { code: 'TKS', nameKo: '도쿠시마공항', cityKo: '도쿠시마', country: 'JP' },
  { code: 'FUK', nameKo: '후쿠오카공항', cityKo: '후쿠오카', country: 'JP' },
  { code: 'NGS', nameKo: '나가사키공항', cityKo: '나가사키', country: 'JP' },
  { code: 'KMJ', nameKo: '구마모토공항', cityKo: '구마모토', country: 'JP' },
  { code: 'OIT', nameKo: '오이타공항', cityKo: '오이타', country: 'JP' },
  { code: 'KMI', nameKo: '미야자키공항', cityKo: '미야자키', country: 'JP' },
  { code: 'KOJ', nameKo: '가고시마공항', cityKo: '가고시마', country: 'JP' },
  { code: 'OKA', nameKo: '나하공항', cityKo: '오키나와', country: 'JP' }
];

// 도시·공항 도시 이름의 영어/일본어 표기. 서버 도시 목록(/api/cities)의 한국어 이름을 키로 쓰고,
// 표에 없는 이름(채팅으로 새로 추가된 도시 등)은 한국어 그대로 보여준다. [영어, 일본어]
var PLACE_NAME_I18N = {
  '도쿄': ['Tokyo', '東京'], '오사카': ['Osaka', '大阪'], '교토': ['Kyoto', '京都'], '삿포로': ['Sapporo', '札幌'],
  '하코다테': ['Hakodate', '函館'], '아사히카와': ['Asahikawa', '旭川'], '아오모리': ['Aomori', '青森'], '아키타': ['Akita', '秋田'],
  '하나마키': ['Hanamaki', '花巻'], '야마가타': ['Yamagata', '山形'], '센다이': ['Sendai', '仙台'], '후쿠시마': ['Fukushima', '福島'],
  '니가타': ['Niigata', '新潟'], '가나자와': ['Kanazawa', '金沢'], '도야마': ['Toyama', '富山'], '시즈오카': ['Shizuoka', '静岡'],
  '나고야': ['Nagoya', '名古屋'], '오카야마': ['Okayama', '岡山'], '히로시마': ['Hiroshima', '広島'], '요나고': ['Yonago', '米子'],
  '이즈모': ['Izumo', '出雲'], '다카마쓰': ['Takamatsu', '高松'], '마쓰야마': ['Matsuyama', '松山'], '고치': ['Kochi', '高知'],
  '도쿠시마': ['Tokushima', '徳島'], '후쿠오카': ['Fukuoka', '福岡'], '나가사키': ['Nagasaki', '長崎'], '구마모토': ['Kumamoto', '熊本'],
  '오이타': ['Oita', '大分'], '미야자키': ['Miyazaki', '宮崎'], '가고시마': ['Kagoshima', '鹿児島'], '오키나와': ['Okinawa', '沖縄'],
  '오비히로': ['Obihiro', '帯広'], '왓카나이': ['Wakkanai', '稚内'], '리시리': ['Rishiri', '利尻'], '메만베쓰': ['Memanbetsu', '女満別'],
  '구시로': ['Kushiro', '釧路'], '나카시베츠': ['Nakashibetsu', '中標津'], '삿포로 오카다마': ['Sapporo Okadama', '札幌丘珠'], '미사와': ['Misawa', '三沢'],
  '오다테': ['Odate', '大館'], '쇼나이': ['Shonai', '庄内'], '이바라키': ['Ibaraki', '茨城'], '마쓰모토': ['Matsumoto', '松本'],
  '난키 시라하마': ['Nanki-Shirahama', '南紀白浜'], '고베': ['Kobe', '神戸'], '다지마': ['Tajima', '但馬'], '돗토리': ['Tottori', '鳥取'],
  '이와쿠니': ['Iwakuni', '岩国'], '야마구치 우베': ['Yamaguchi Ube', '山口宇部'], '기타큐슈': ['Kitakyushu', '北九州'], '사가': ['Saga', '佐賀'],
  '아마미': ['Amami', '奄美'], '야쿠시마': ['Yakushima', '屋久島'], '다네가시마': ['Tanegashima', '種子島'], '미야코지마': ['Miyakojima', '宮古島'],
  '이시가키': ['Ishigaki', '石垣'], '시모지시마': ['Shimojishima', '下地島'], '구메지마': ['Kumejima', '久米島'], '기타다이토': ['Kitadaito', '北大東'],
  '요나구니': ['Yonaguni', '与那国'], '도쿠노시마': ['Tokunoshima', '徳之島'], '이와테': ['Iwate', '岩手'],
  '인천': ['Incheon', '仁川'], '서울': ['Seoul', 'ソウル'], '부산': ['Busan', '釜山'], '제주': ['Jeju', '済州'],
  '대구': ['Daegu', '大邱'], '청주': ['Cheongju', '清州'], '무안': ['Muan', '務安'], '여수': ['Yeosu', '麗水'],
  '울산': ['Ulsan', '蔚山'], '군산': ['Gunsan', '群山'], '양양': ['Yangyang', '襄陽']
};

function localPlaceName(koName) {
  var name = String(koName || '');
  var lang = typeof currentLang === 'string' ? currentLang : 'ko';
  if (lang === 'ko') return name;
  var row = PLACE_NAME_I18N[name];
  return row ? (lang === 'ja' ? row[1] : row[0]) : name;
}

// 원화 금액 표시(언어별 단위)
function formatKRW(n) {
  var s = Number(n || 0).toLocaleString();
  var lang = typeof currentLang === 'string' ? currentLang : 'ko';
  if (lang === 'en') return '₩' + s;
  if (lang === 'ja') return s + 'ウォン';
  return s + '원';
}

function localeTag() {
  var lang = typeof currentLang === 'string' ? currentLang : 'ko';
  return lang === 'en' ? 'en-US' : lang === 'ja' ? 'ja-JP' : 'ko-KR';
}

// "{n}곳" 같은 자리 표시를 값으로 채운다($ 같은 특수 문자가 있어도 그대로 넣는다).
function fillText(tpl, vars) {
  return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, function(m, k) {
    return vars && vars[k] != null ? String(vars[k]) : m;
  });
}

// 문자열이면 그대로, { ko, en, ja } 객체면 현재 언어 값을 고른다.
function pickLang(v) {
  if (v == null || typeof v !== 'object') return v == null ? '' : String(v);
  var lang = typeof currentLang === 'string' ? currentLang : 'ko';
  return v[lang] || v.ko || '';
}

function el(id) {
  return document.getElementById(id);
}

let cityCatalog = [];
let flightResults = [];
let visibleFlightCount = 0;
let flightSortMode = 'recommended';
let selectedFlightId = '';
let selectedFlight = null;
let stayResults = [];
let staySortMode = 'balanced';
let latestDestList = [];
let latestRecFoodList = [];
let latestDestSearchList = [];
let latestFoodSearchList = [];
let latestFoodList = [];
var currentItineraryData = null;
var itinMap = null;
var itinMarkers = [];
var itinGeoCache = {};
var dragData = null;
var pendingAddPlace = null;
var pendingAddType = 'dest';
var pendingAddSlot = 'afternoon';
let selectedStayId = '';
let selectedStay = null;
let aiPreferredAreas = [];
let aiPreferAirportAccess = false;
let aiRouteCities = [];
let aiRegionDayPlan = [];
let aiSpecialPrefs = {};

// -- Undo/Redo History Stack --
const _itinHistory = [];
let _itinHistoryIdx = -1;
const ITIN_HISTORY_MAX = 30;

function pushItinHistory() {
  if (!currentItineraryData || _itinRestoringHistory) return;
  var snapData = Object.assign({}, currentItineraryData);
  delete snapData._skipMealStrip;
  const snapshot = JSON.stringify(snapData);
  if (_itinHistoryIdx >= 0 && _itinHistory[_itinHistoryIdx] === snapshot) return;
  _itinHistory.splice(_itinHistoryIdx + 1);
  _itinHistory.push(snapshot);
  if (_itinHistory.length > ITIN_HISTORY_MAX) _itinHistory.shift();
  _itinHistoryIdx = _itinHistory.length - 1;
}

var _itinRestoringHistory = false;

function undoItinerary() {
  if (_itinHistoryIdx <= 0) return false;
  _itinHistoryIdx--;
  currentItineraryData = JSON.parse(_itinHistory[_itinHistoryIdx]);
  currentItineraryData._skipMealStrip = true;
  _itinRestoringHistory = true;
  renderItineraryTimeline();
  _itinRestoringHistory = false;
  updateItinMap();
  return true;
}

function redoItinerary() {
  if (_itinHistoryIdx >= _itinHistory.length - 1) return false;
  _itinHistoryIdx++;
  currentItineraryData = JSON.parse(_itinHistory[_itinHistoryIdx]);
  currentItineraryData._skipMealStrip = true;
  _itinRestoringHistory = true;
  renderItineraryTimeline();
  _itinRestoringHistory = false;
  updateItinMap();
  return true;
}

// -- Client-side Cache --
const _apiCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedOrFetch(url, options, cacheKey) {
  const key = cacheKey || url;
  const cached = _apiCache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }
  return fetch(url, options).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(data) {
    _apiCache.set(key, { data: data, time: Date.now() });
    return data;
  }).catch(function(err) {
    console.warn('[cache] fetch error:', err.message);
    return {};
  });
}

function parseCsv(text) {
  return String(text || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function getCheckedValues(selector) {
  return Array.from(document.querySelectorAll(selector)).filter((x) => x.checked).map((x) => x.value);
}

function normalizeText(v) {
  return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function airportSearch(query) {
  const q = normalizeText(query);
  if (!q) return AIRPORTS.slice(0, 10);
  return AIRPORTS
    .map((a) => {
      const hay = normalizeText(`${a.code} ${a.nameKo} ${a.cityKo} ${localPlaceName(a.cityKo)}`);
      let score = 0;
      if (a.code.toLowerCase() === q) score += 100;
      if (a.code.toLowerCase().startsWith(q)) score += 80;
      if (a.cityKo.includes(query)) score += 50;
      if (a.nameKo.includes(query)) score += 40;
      if (hay.includes(q)) score += 20;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.a);
}

function airportLabel(a) {
  const country = a.country === 'KR' ? t('korea') : t('japan');
  // 한국어가 아닐 때는 한국어 공항 이름 대신 도시 이름만 보여준다.
  if (currentLang && currentLang !== 'ko') return `${a.code} | ${localPlaceName(a.cityKo)} (${country})`;
  return `${a.code} | ${a.cityKo} ${a.nameKo} (${country})`;
}

function airportCityByCode(code) {
  return localPlaceName(AIRPORTS.find((a) => a.code === String(code || '').toUpperCase())?.cityKo || '');
}

// 언어를 바꾸면 공항 입력칸의 "KIX (오사카)" 같은 표시도 바꾼다(직접 입력한 문장은 건드리지 않는다).
function relabelAirportInputs() {
  ['from', 'to'].forEach(function(id) {
    var input = el(id);
    if (!input) return;
    var m = String(input.value || '').trim().match(/^([A-Za-z]{3})(\s*\(.*\))?$/);
    if (m) input.value = formatAirportDisplay(m[1].toUpperCase());
  });
}

function formatAirportDisplay(code) {
  const upper = String(code || '').toUpperCase();
  const city = airportCityByCode(upper);
  return city ? `${upper} (${city})` : upper;
}

function closeAllAirportSuggest() {
  document.querySelectorAll('.airport-suggest').forEach((box) => {
    box.classList.remove('show');
    box.innerHTML = '';
  });
}

function renderAirportSuggest(input) {
  const wrap = input.closest('.airport-wrap');
  const panel = wrap?.querySelector('.airport-suggest');
  if (!panel) return;

  const list = airportSearch(input.value);
  if (list.length === 0) {
    panel.classList.remove('show');
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = list.map((a) => `<button type="button" class="airport-option" data-code="${escapeHtml(a.code)}">${escapeHtml(airportLabel(a))}</button>`).join('');
  panel.classList.add('show');
}

function resolveAirportCode(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const codeMatch = upper.match(/\b([A-Z]{3})\b/);
  if (codeMatch) return codeMatch[1];
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  const match = AIRPORTS.find((a) => `${a.code} ${a.nameKo} ${a.cityKo}`.toLowerCase().includes(raw.toLowerCase()));
  return match ? match.code : upper.slice(0, 3);
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error(t('err-rate-limit'));
    if (res.status === 400) {
      var serverMsg = '';
      try { var errData = await res.json(); serverMsg = String(errData.error || ''); } catch (e) { serverMsg = ''; }
      // 서버의 영문 검증 문구(예: "days must be a number")는 그대로 보여주지 않는다.
      throw new Error(isLocalizedMessage(serverMsg) ? serverMsg : t('err-input'));
    }
    throw new Error('HTTP ' + res.status);
  }
  return res.json();
}

// 사용자에게 그대로 보여줘도 되는(이미 한국어/일본어로 된) 짧은 문구인지
function isLocalizedMessage(msg) {
  var s = String(msg || '');
  return s.length > 0 && s.length <= 120 && /[가-힯぀-ヿ一-鿿]/.test(s);
}

// Loading state helpers
// 버튼 기본 문구는 언어 사전에서 다시 가져온다(검색 버튼이 '검색'으로 바뀌던 문제 방지).
var BUTTON_LABEL_KEYS = { btnPlan: 'btn-plan', btnFlights: 'btn-flights', btnStays: 'btn-stays', btnFood: 'btn-food', btnDestSearch: 'btn-search', btnAiAssist: 'btn-ai-assist', btnPlanRefresh: 'btn-refresh-plan' };

function setLoading(btnId, loading) {
  var btn = el(btnId);
  if (!btn) return;
  if (loading) {
    if (!btn.classList.contains('btn-loading')) btn._origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('loading') || 'Loading...';
    btn.classList.add('btn-loading');
    btn.setAttribute('aria-busy', 'true');
  } else {
    var key = BUTTON_LABEL_KEYS[btnId];
    btn.disabled = false;
    btn.textContent = key ? t(key) : (btn._origText || btn.textContent);
    btn.classList.remove('btn-loading');
    btn.removeAttribute('aria-busy');
  }
}

// 일정 생성(유료 AI 호출)이 진행 중이면 관련 버튼을 모두 잠근다.
var PLAN_BUSY_BUTTONS = ['btnPlan', 'btnAiAssist', 'btnPlanRefresh'];
var planBusyCount = 0;

function beginPlanBusy(triggerId) {
  planBusyCount++;
  if (planBusyCount > 1) return;
  PLAN_BUSY_BUTTONS.forEach(function(id) {
    var b = el(id);
    if (!b) return;
    if (id === triggerId) setLoading(id, true);
    else b.disabled = true;
  });
}

function endPlanBusy() {
  planBusyCount = Math.max(0, planBusyCount - 1);
  if (planBusyCount > 0) return;
  PLAN_BUSY_BUTTONS.forEach(function(id) {
    var b = el(id);
    if (!b) return;
    if (b.classList.contains('btn-loading')) setLoading(id, false);
    else b.disabled = false;
  });
}

function showCardLoading(containerId) {
  var c = el(containerId);
  if (c) c.innerHTML = '<div class="card loading-card"><div class="spinner"></div></div>';
}

function friendlyError(err) {
  var msg = err && err.message ? String(err.message) : String(err || '');
  if (/429|rate.?limit/i.test(msg)) return t('err-rate-limit');
  if (/timeout|timed?.?out|ETIMEDOUT|abort/i.test(msg)) return t('err-timeout');
  if (/fetch|network|ERR_|ENOTFOUND|ECONN/i.test(msg)) return t('err-network');
  if (/HTTP 5\d{2}|\b5\d{2}\b|server/i.test(msg)) return t('err-server');
  // 이미 번역된 짧은 문구만 그대로 보여주고, 원문 오류(영문·코드)는 일반 안내로 바꾼다.
  if (isLocalizedMessage(msg)) return msg;
  return t('err-generic');
}

// Date validation
function validateDates() {
  var today = todayDateString();
  var startDate = el('startDate');
  if (startDate && startDate.value && startDate.value < today) {
    startDate.value = today;
  }
  var departDate = el('departDate');
  if (departDate && departDate.value && departDate.value < today) {
    departDate.value = today;
  }
  var checkInDate = el('stayCheckIn');
  if (checkInDate && checkInDate.value && checkInDate.value < today) {
    checkInDate.value = today;
  }
}

async function initCityOptions() {
  const data = await getCachedOrFetch('/api/cities');
  const cities = (data.cities || []).sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  cityCatalog = cities;
  for (const c of cities) {
    if (!AIRPORTS.some((a) => a.code === c.airport)) {
      AIRPORTS.push({ code: c.airport, nameKo: `${c.label} 공항`, cityKo: c.label, country: 'JP' });
    }
  }
  const options = cities.map((c) => `<option value="${escapeHtml(c.key)}">${escapeHtml(localPlaceName(c.label))} (${escapeHtml(c.airport)})</option>`).join('');
  el('city').innerHTML = options;
  el('foodCity').innerHTML = options;
  el('stayCity').innerHTML = options;
  if (el('destSearchCity')) el('destSearchCity').innerHTML = options;
  el('city').value = 'tokyo';
  el('foodCity').value = 'tokyo';
  el('stayCity').value = 'tokyo';
  if (el('destSearchCity')) el('destSearchCity').value = 'tokyo';
}

function upsertCityOption(cityMeta) {
  if (!cityMeta || !cityMeta.key || !cityMeta.label) return;
  if (!cityCatalog.some((c) => c.key === cityMeta.key)) {
    cityCatalog.push({ key: cityMeta.key, label: cityMeta.label, airport: cityMeta.airport || '' });
  }
  const text = `${localPlaceName(cityMeta.label)} (${cityMeta.airport || 'N/A'})`;
  ['city', 'foodCity', 'stayCity', 'destSearchCity'].forEach((id) => {
    const select = el(id);
    if (!select) return;
    let option = Array.from(select.options).find((o) => o.value === cityMeta.key);
    if (!option) {
      option = document.createElement('option');
      option.value = cityMeta.key;
      select.appendChild(option);
    }
    option.textContent = text;
  });
}

// 언어를 바꾸면 도시 선택 목록의 이름도 바꾼다(값인 도시 키는 그대로).
function relabelCityOptions() {
  ['city', 'foodCity', 'stayCity', 'destSearchCity'].forEach(function(id) {
    var select = el(id);
    if (!select) return;
    Array.from(select.options).forEach(function(o) {
      var c = cityCatalog.find(function(x) { return x.key === o.value; });
      if (c) o.textContent = localPlaceName(c.label) + ' (' + (c.airport || 'N/A') + ')';
    });
  });
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function starRating(score) {
  if (!score) return '';
  var s = parseFloat(score);
  var full = Math.floor(s);
  var half = (s - full) >= 0.3 ? 1 : 0;
  var empty = 5 - full - half;
  var h = '<span class="stars">';
  for (var i = 0; i < full; i++) h += '<span class="star">★</span>';
  if (half) h += '<span class="star-half">★</span>';
  for (var i2 = 0; i2 < empty; i2++) h += '<span class="star-empty">☆</span>';
  h += ' <span class="star-num">' + s.toFixed(1) + '</span></span>';
  return h;
}

function priceYen(level) {
  if (!level) return '';
  var n = level === 'high' ? 3 : level === 'low' ? 1 : 2;
  return '<span class="price-yen">' + '¥'.repeat(n) + '<span class="price-yen-empty">' + '¥'.repeat(3 - n) + '</span></span>';
}

function aiScoreBadge(score) {
  if (score == null) return '';
  var n = Number(score);
  var cls = n >= 80 ? 'ai-high' : n >= 50 ? 'ai-mid' : 'ai-low';
  return '<span class="ai-badge ' + cls + '">' + n + '</span>';
}

// 서버가 en/ja 화면에서는 분류를 현지화해 보내므로(localizeCuratedCategory) 세 언어 키워드를 함께 본다.
// 영어는 대소문자를 가리지 않는다. 위에서부터 먼저 맞는 아이콘을 쓴다.
var CATEGORY_ICON_RULES = [
  ['🏯', ['역사', '문화', 'history', 'historic', 'culture', 'cultural', '歴史', '文化']],
  // 'theme park'가 아래 자연 규칙의 'park'에 먼저 걸리지 않게 놀이공원을 자연보다 먼저 본다.
  ['🎢', ['어뮤즈', '테마파크', 'amusement', 'theme park', 'テーマパーク', '遊園地']],
  ['🌿', ['자연', '공원', '정원', 'nature', 'park', 'garden', '自然', '公園', '庭園']],
  ['🏙️', ['도시', '도심', '번화가', 'city', 'downtown', '都市', '繁華街', '街歩き']],
  ['🛍️', ['쇼핑', '마켓', 'shopping', 'market', 'ショッピング', '市場', 'マーケット']],
  ['⛩️', ['신사', '사원', 'shrine', 'temple', '神社', '寺']],
  ['🏛️', ['박물관', '미술', 'museum', 'gallery', '博物館', '美術']],
  ['🗼', ['전망', '타워', 'viewpoint', 'observatory', 'tower', '展望', 'タワー']],
  ['🍽️', ['음식', '맛집', '레스토랑', '미식', 'food', 'restaurant', 'gourmet', 'グルメ', '料理', 'レストラン']],
  ['🎯', ['관광', 'sightseeing', '観光']]
];

function categoryIcon(cat) {
  if (!cat) return '';
  var s = String(cat).toLowerCase();
  for (var i = 0; i < CATEGORY_ICON_RULES.length; i++) {
    var words = CATEGORY_ICON_RULES[i][1];
    for (var j = 0; j < words.length; j++) {
      if (s.indexOf(words[j]) >= 0) return CATEGORY_ICON_RULES[i][0];
    }
  }
  return '📍';
}

// 주소는 브라우저와 같은 방식(URL)으로 해석한 뒤 허용 목록으로 확인한다.
// 글자 모양만 보면 '/\evil.example/x.png' 같은 주소가 같은 서버 경로처럼 보여 통과하기 때문이다.
function parseSafeUrl(raw) {
  var s = String(raw || '').trim();
  if (!s) return null;
  try { return new URL(s, location.origin); } catch (e) { return null; }
}

function hostMatches(host, domains) {
  return domains.some(function(dm) { return host === dm || host.slice(-(dm.length + 1)) === '.' + dm; });
}

var IMAGE_URL_RULES = {
  // 장소 사진: 우리 서버의 사진 프록시(google 모드) 또는 위키미디어 공용(Commons) 이미지
  place: function(u) {
    if (u.origin === location.origin) return u.pathname === '/api/place-photo';
    return u.protocol === 'https:' && u.hostname === 'upload.wikimedia.org' && u.pathname.indexOf('/wikipedia/commons/') === 0;
  },
  // 숙소 사진: 라쿠텐 트래블 이미지 서버
  stay: function(u) { return u.protocol === 'https:' && hostMatches(u.hostname, ['rakuten.co.jp', 'r10s.jp']); },
  // 로그인 프로필 사진: 소셜 로그인(네이버·카카오·Google)이 준 https 주소
  avatar: function(u) { return u.protocol === 'https:'; }
};

// kind: 'place'(기본) | 'stay' | 'avatar'. 허용되지 않으면 ''(사진 없이 글자 타일 등으로 표시).
function safeImageUrl(url, kind) {
  var s = String(url || '').trim();
  // 카카오 프로필 사진은 http 주소로 오기도 해서 https로 바꿔 쓴다.
  if (kind === 'avatar' && /^http:\/\//i.test(s)) s = 'https://' + s.slice(7);
  var u = parseSafeUrl(s);
  var rule = IMAGE_URL_RULES[kind] || IMAGE_URL_RULES.place;
  if (!u || !rule(u)) return '';
  return u.origin === location.origin ? u.pathname + u.search : u.href;
}

// 일반 외부 링크(지도·예약 페이지 등): http/https만
function safeLinkUrl(url) {
  var s = String(url || '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  var u = parseSafeUrl(s);
  return u ? u.href : '';
}

// 사진 출처 링크: 위키미디어 공용 파일 페이지 또는 Google 지도 기여자 페이지(https)만
function safeCreditUrl(url) {
  var u = parseSafeUrl(url);
  if (!u || u.protocol !== 'https:') return '';
  if (u.hostname === 'commons.wikimedia.org' && u.pathname.indexOf('/wiki/') === 0) return u.href;
  if ((u.hostname === 'maps.google.com' || u.hostname === 'www.google.com') && u.pathname.indexOf('/maps/contrib/') === 0) return u.href;
  return '';
}

function cityLabelByKey(key) {
  var found = (cityCatalog || []).find(function(c) { return c.key === key; });
  return found ? found.label : String(key || '');
}

// 화면 표시용 도시 이름(현재 언어)
function cityNameByKey(key) {
  return localPlaceName(cityLabelByKey(key));
}

// 사진 칸: 실제 <img>로 그리고, 불러오기에 실패하면 첫 글자 타일로 바꾼다(아래 error 리스너).
function cardPhoto(url, name, credit) {
  var letter = String(name || '?').trim().charAt(0) || '?';
  var src = safeImageUrl(url);
  if (src) {
    // 도시 대표·음식 예시 사진은 대체 텍스트에도 그 사실을 적는다.
    var scopeLabel = photoScopeLabel(credit);
    var alt = String(name || '') + (scopeLabel ? ' (' + scopeLabel + ')' : '');
    return '<div class="card-photo"><img class="card-photo-img" src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async" data-letter="' + escapeHtml(letter) + '" data-name="' + escapeHtml(name || '') + '"></div>';
  }
  return '<div class="card-photo card-photo-none" role="img" aria-label="' + escapeHtml(name || '') + '"><span>' + escapeHtml(letter) + '</span></div>';
}

// 위키미디어 사진은 CC BY-SA 등 라이선스상 저작자·라이선스 표시가 필요하다.
// scope가 'city'(도시 대표 사진)·'genre'(음식 장르 예시 사진)이면 그 장소·식당의 실제 사진이 아니라는 표시를 앞에 붙인다.
var PHOTO_SCOPE_KEYS = { city: 'photo-scope-city', genre: 'photo-scope-genre' };

function photoScopeLabel(credit) {
  var scope = credit ? String(credit.scope || '').toLowerCase() : '';
  var key = Object.prototype.hasOwnProperty.call(PHOTO_SCOPE_KEYS, scope) ? PHOTO_SCOPE_KEYS[scope] : '';
  return key ? t(key) : '';
}

function photoCreditHtml(credit, url) {
  if (!credit || !safeImageUrl(url)) return '';
  var parts = [String(credit.artist || '').trim(), String(credit.license || '').trim()].filter(Boolean);
  var scopeLabel = photoScopeLabel(credit);
  var text = (scopeLabel ? scopeLabel + ' · ' : '') + t('photo-credit') + ' ' + (parts.length ? parts.join(' · ') : 'Wikimedia Commons');
  var href = safeCreditUrl(credit.filePage);
  if (href) {
    return '<a class="photo-credit" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(text) + '">' + escapeHtml(text) + '</a>';
  }
  return '<span class="photo-credit" title="' + escapeHtml(text) + '">' + escapeHtml(text) + '</span>';
}

// 이미지 로드 실패 처리(error 이벤트는 버블링되지 않으므로 캡처 단계에서 받는다)
document.addEventListener('error', function(e) {
  var img = e.target;
  if (!img || img.tagName !== 'IMG') return;
  if (img.classList.contains('card-photo-img')) {
    var box = img.parentNode;
    if (!box) return;
    var card = box.closest ? box.closest('.card') : null;
    var span = document.createElement('span');
    span.textContent = img.getAttribute('data-letter') || '?';
    box.classList.add('card-photo-none');
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', img.getAttribute('data-name') || img.alt || '');
    box.innerHTML = '';
    box.appendChild(span);
    var credit = card ? card.querySelector('.photo-credit') : null;
    if (credit) credit.remove();
    return;
  }
  if (img.classList.contains('stay-photo-img')) {
    var wrap = img.closest ? img.closest('.stay-photo') : null;
    if (wrap) wrap.remove();
  }
}, true);

function appendAiChat(role, text) {
  const box = el('aiChatLog');
  if (!box) return;
  const cls = role === 'user' ? 'user' : 'assistant';
  const label = role === 'user' ? t('chat-user') : 'AI';
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg ${cls}"><strong>${escapeHtml(label)}</strong><br>${escapeHtml(text)}</div>`);
  box.scrollTop = box.scrollHeight;
}

// 첫 안내 말풍선은 언어를 바꾸면 함께 바뀌도록 사전 키를 달아 둔다.
function appendAiChatIntro() {
  const box = el('aiChatLog');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', '<div class="chat-msg assistant"><strong>AI</strong><br><span data-i18n="chat-placeholder">' + escapeHtml(t('chat-placeholder')) + '</span></div>');
}

// 숙박 수 = 여행 일수 - 1 (3일 여행 = 2박). 체크아웃은 돌아오는 항공편 날짜와 같다(당일치기도 최소 1박).
function tripNights(days) {
  return Math.max(1, (Math.max(1, Number(days) || 1)) - 1);
}

function syncDatesToDependentForms() {
  const start = el('startDate').value || defaultStartDate();
  const days = Math.max(1, Number(el('days').value) || 1);
  el('departDate').value = start;
  el('returnDate').value = addDays(start, Math.max(0, days - 1));
  el('checkIn').value = start;
  el('checkOut').value = addDays(start, tripNights(days));
}

function applyAiConditions(parsed) {
  if (!parsed) return;
  if (parsed.cityKey && cityCatalog.some((c) => c.key === parsed.cityKey)) {
    el('city').value = parsed.cityKey;
    // 채팅으로 도시가 바뀌어도 투어·날씨·항공 도착지·맛집/숙소 도시가 함께 바뀌도록
    syncCityDependents(parsed.cityKey);
  }
  if (parsed.theme && ['mixed', 'foodie', 'culture', 'shopping', 'nature'].includes(parsed.theme)) {
    el('theme').value = parsed.theme;
  }
  if (false) { // budget removed
  }
  if (Number.isFinite(Number(parsed.days))) {
    el('days').value = Math.max(1, Math.min(10, Number(parsed.days)));
  }
  if (parsed.startDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)) {
    el('startDate').value = parsed.startDate;
  }
  syncDatesToDependentForms();

  const selectedCity = cityCatalog.find((c) => c.key === el('city').value);
  const arrivalAirport = resolveAirportCode(parsed.arrivalAirport || selectedCity?.airport || '');
  if (arrivalAirport) {
    el('to').value = formatAirportDisplay(arrivalAirport);
    toAirportDirty = false;
  }
  if (!el('from').value) {
    el('from').value = formatAirportDisplay('ICN');
  }

  aiPreferredAreas = Array.isArray(parsed.preferredAreas) ? parsed.preferredAreas.filter(Boolean) : [];
  aiPreferAirportAccess = Boolean(parsed.preferAirportAccess);
  aiRouteCities = Array.isArray(parsed.routeCities) ? parsed.routeCities.filter(Boolean) : [];
  aiRegionDayPlan = Array.isArray(parsed.regionDayPlan) ? parsed.regionDayPlan.filter((x) => x && x.cityLabel && Number(x.days) > 0) : [];
  aiSpecialPrefs = parsed.specialPrefs && typeof parsed.specialPrefs === 'object' ? parsed.specialPrefs : {};
  if (parsed.foodKeyword) {
    el('foodGenre').value = parsed.foodKeyword;
  }
}

// 'YYYY-MM-DD'는 UTC 자정으로 해석되므로 날짜 더하기도 UTC로 해야 시간대·서머타임과 무관하게 하루씩 움직인다.
function addDays(dateText, offset) {
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function ensureCheckOutDate() {
  const inDate = el('checkIn').value;
  if (!inDate) return;
  const outDate = el('checkOut').value;
  const nights = tripNights(el('days') ? el('days').value : 1);
  if (!outDate) {
    el('checkOut').value = addDays(inDate, nights);
    return;
  }
  const inTime = new Date(inDate).getTime();
  const outTime = new Date(outDate).getTime();
  if (Number.isFinite(inTime) && Number.isFinite(outTime) && outTime <= inTime) {
    el('checkOut').value = addDays(inDate, nights);
  }
}


// 영업시간 문구(todayHours)는 외부(Google) 데이터라 반드시 이스케이프해서 넣는다.
function openStatusBadge(item) {
  var hours = item.todayHours ? ' ' + String(item.todayHours) : '';
  if (item.openNow === true) {
    return '<span class="open-badge open">' + escapeHtml((t('open-now') || 'Open') + hours) + '</span>';
  }
  if (item.openNow === false) {
    return '<span class="open-badge closed">' + escapeHtml((t('closed-now') || 'Closed') + hours) + '</span>';
  }
  return '';
}

function renderCards(targetId, items, mode) {
  const target = el(targetId);
  if (!items || items.length === 0) {
    target.innerHTML = '<div class="card">' + t('no-results') + '</div>';
    return;
  }

  if (mode === 'dest') {
    latestDestList = items;
  }

  if (mode !== 'dest') latestFoodList = items;
  target.innerHTML = items.map((x, index) => {
    if (mode === 'dest') {
      return `<article class="card" draggable="true" data-drag-type="dest" data-drag-index="${index}">
        <div class="card-layout">
          ${cardPhoto(x.photoUrl, x.name, x.photoCredit)}
          <div class="card-body">
            <h4>${categoryIcon(x.category)} ${escapeHtml(x.name)}</h4>
            <div class="card-info-row">${escapeHtml(x.category || '')} · ${escapeHtml(x.area || x.city || '')}</div>
            <div class="card-scores">${aiScoreBadge(x.aiScore)} ${starRating(x.score)}</div>
            ${photoCreditHtml(x.photoCredit, x.photoUrl)}
          </div>
        </div>
        <span class="drag-hint">${escapeHtml(t('drag-handle'))}</span>
        <div class="link-row">
          <a href="${escapeHtml(safeLinkUrl(x.mapUrl) || '#')}" target="_blank" rel="noreferrer">${escapeHtml(t('map-link'))}</a>
          <button type="button" class="rec-delete-btn" data-delete-type="dest" data-delete-index="${index}">✕</button>
        </div>
      </article>`;
    }

    return `<article class="card">
      <div class="card-layout">
        ${cardPhoto(x.photoUrl, x.name, x.photoCredit)}
        <div class="card-body">
          <h4>${escapeHtml(x.name)}</h4>
          <div class="card-info-row">${escapeHtml(x.genre || '')} · ${escapeHtml(x.area || '')}</div>
          <div class="card-scores">${aiScoreBadge(x.aiFit)} ${starRating(x.score)} ${priceYen(x.priceLevel)}</div>
          ${photoCreditHtml(x.photoCredit, x.photoUrl)}
        </div>
      </div>
      <div class="link-row">
        <button type="button" class="add-to-plan-btn" data-add-type="food" data-add-index="${index}" data-add-source="foodSearch">${escapeHtml(t('add-to-plan'))}</button>
        ${targetId === 'foodCards' ? `<button type="button" class="promote-to-rec-btn" data-promote-type="food" data-promote-index="${index}" data-promote-source="foodSearch">${escapeHtml(t('promote-food'))}</button>` : ''}
        <a href="${escapeHtml(safeLinkUrl(x.mapUrl) || '#')}" target="_blank" rel="noreferrer">${escapeHtml(t('map-link'))}</a>
      </div>
    </article>`;
  }).join('');
}

function getFlightCardsPerRow() {
  if (window.matchMedia('(max-width: 640px)').matches) return 1;
  if (window.matchMedia('(max-width: 930px)').matches) return 2;
  return 3;
}

function flightCardTemplate(x) {
  const first = x.legs[0];
  const last = x.legs[x.legs.length - 1];
  const routeTo = x.tripType === 'roundtrip' ? first.to : last.to;
  const route = `${first.from}(${airportCityByCode(first.from)}) - ${routeTo}(${airportCityByCode(routeTo)})`;
  const dateRange = first.date === last.date ? first.date : `${first.date} ~ ${last.date}`;
  const legRows = x.legs.flatMap((l) => {
    if (Array.isArray(l.segments) && l.segments.length > 0) {
      return l.segments.map((s) => {
        const parts = [
          timeRangeText(s.departureTime, s.arrivalTime),
          `${s.from}(${airportCityByCode(s.from)}) ~ ${s.to}(${airportCityByCode(s.to)})`,
          s.flightNumber || '',
          s.cabinLabel || '',
          s.baggageLabel || ''
        ].filter(Boolean);
        return `<div class="flight-leg-row"><span class="airline-badge" title="${escapeHtml(s.airline || '')}">${escapeHtml(s.airlineCode || '')}</span>${escapeHtml(parts.join(' · '))}</div>`;
      });
    }
    return [`<div class="flight-leg-row"><span class="airline-badge" title="${escapeHtml(l.airline || '')}">${escapeHtml(l.airlineCode || '')}</span>${escapeHtml(timeRangeText(l.departureTime, l.arrivalTime))} ${escapeHtml(l.from || '')}(${escapeHtml(airportCityByCode(l.from))}) ~ ${escapeHtml(l.to || '')}(${escapeHtml(airportCityByCode(l.to))}) ${escapeHtml(l.airline || '')}</div>`];
  }).join('');
  const selectedClass = x._id && x._id === selectedFlightId ? ' selected' : '';
  const selectedLabel = x._id && x._id === selectedFlightId ? t('selected-mark') : t('include-ai');
  // 예시(mock) 항공편은 실제 편이 아니므로 AI 일정에 넣지 못하게 한다.
  const selectButton = x._mock
    ? `<button type="button" class="stay-select-btn" disabled title="${escapeHtml(t('sample-no-select'))}">${escapeHtml(t('sample-no-select'))}</button>`
    : `<button type="button" class="stay-select-btn flight-select-btn" data-flight-id="${escapeHtml(x._id || '')}">${selectedLabel}</button>`;

  return `<article class="card flight-card${selectedClass}">
    <div class="flight-top">
      <div class="flight-route">${escapeHtml(route)}</div>
      <div class="flight-price">${escapeHtml(formatKRW(x.totalPriceKRW))}</div>
    </div>
    <div class="flight-sub">${escapeHtml(dateRange)}</div>
    <div class="flight-line">${legRows}</div>
    <div class="flight-meta">
      ${x.nearbyDate === true ? `<span class="chip chip-nearby" title="${escapeHtml(t('flight-other-date-tip'))}">${escapeHtml(t('flight-other-date'))}</span>` : ''}
      <span class="chip">${escapeHtml(x._mock ? t('sample-data') : (x.provider || ''))}</span>
      <span class="chip">${escapeHtml(t('total-min') + x.totalDurationMin + t('min-suffix'))}</span>
      <span class="chip">${escapeHtml(t('stops') + x.totalStops + t('stops-suffix'))}</span>
    </div>
    <div class="flight-sub">${escapeHtml(t('airline-label'))}${escapeHtml((x.airlines || []).join(', ') || 'N/A')}</div>
    ${x.priceBreakdown ? `<div class="flight-sub">${escapeHtml(priceBreakdownText(x.priceBreakdown))}</div>` : ''}
    <div class="link-row">
      ${selectButton}
      ${safeLinkUrl(x.deeplink) ? `<a href="${escapeHtml(safeLinkUrl(x.deeplink))}" target="_blank" rel="noreferrer" class="booking-link">${escapeHtml(t('book-flight'))}</a>` : ''}
      <a href="${escapeHtml('https://www.skyscanner.co.kr/transport/flights/' + (x.legs && x.legs[0] ? x.legs[0].from : '').toLowerCase() + '/' + (x.legs && x.legs[0] ? x.legs[0].to : '').toLowerCase() + '/' + (x.legs && x.legs[0] && x.legs[0].date ? x.legs[0].date.replace(/-/g,'').slice(2) : '') + '/' + (x.legs && x.legs[1] && x.legs[1].date ? x.legs[1].date.replace(/-/g,'').slice(2) + '/' : ''))}" target="_blank" rel="noreferrer">${escapeHtml(t('skyscanner'))}</a>
      <a href="${escapeHtml('https://www.kayak.co.kr/flights/' + (x.legs && x.legs[0] ? x.legs[0].from : '') + '-' + (x.legs && x.legs[0] ? x.legs[0].to : '') + '/' + (x.legs && x.legs[0] ? x.legs[0].date : '') + (x.legs && x.legs[1] && x.legs[1].date ? '/' + x.legs[1].date : '') + '?sort=bestflight_a')}" target="_blank" rel="noreferrer">${escapeHtml(t('kayak'))}</a>
    </div>
  </article>`;
}

// 요금 내역 한 줄(기본·세금·수수료)
function priceBreakdownText(pb) {
  return t('fare-base') + formatKRW(pb.baseKRW) + t('fare-tax') + formatKRW(pb.taxesKRW) + t('fare-fee') + formatKRW(pb.feesKRW);
}

// 도착 시각을 모르면 화살표 없이 출발 시각만 보여준다.
function timeRangeText(dep, arr) {
  var d = String(dep || '').trim();
  var a = String(arr || '').trim();
  if (d && a) return d + ' → ' + a;
  return d || a;
}

function renderFlightCards(reset = false) {
  refreshFlightSelection();
  if (reset) {
    visibleFlightCount = getFlightCardsPerRow();
  }

  const sorted = [...flightResults].sort((a, b) => {
    if (flightSortMode === 'price') return a.totalPriceKRW - b.totalPriceKRW;
    if (flightSortMode === 'duration') return a.totalDurationMin - b.totalDurationMin;
    return b.aiScore - a.aiScore;
  });

  const cards = sorted.slice(0, visibleFlightCount);
  el('flightCards').innerHTML = cards.length > 0 ? cards.map(flightCardTemplate).join('') : '<div class="card">' + t('no-results') + '</div>';

  const moreBtn = el('btnFlightMore');
  if (!moreBtn) return;
  const hasMore = visibleFlightCount < sorted.length;
  moreBtn.classList.toggle('hidden', !hasMore);
}

function parsePlaceInfo(placeText) {
  var s = String(placeText || '');
  var m = s.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) return { name: m[1].trim(), info: m[2].trim() };
  return { name: s.trim(), info: '' };
}

// "자유 일정 (난바 주변 산책)" / "Free time (...)" / "自由時間 (...)" 칸은 장소가 아니다.
// 지도 점, '위치 정보가 없는 장소 N곳', 이동비 장소 목록, 중복 장소 알림에서 뺀다.
// AI가 "자유 일정 · 난바 산책", "Free time - Shibuya"처럼 구분 기호로 이어 써도 알아본다.
var FREE_TIME_NAME_RE = /^(자유\s*(일정|시간)|free[\s-]*time|自由(時間|行動))(\s*[·・\-–—:：,、].*)?$/i;
function isFreeTimePlace(name) {
  return FREE_TIME_NAME_RE.test(String(name || '').trim());
}

function parseItineraryBlock(text) {
  var s = String(text || '');
  if (/^\s{2,}/.test(s) && s.indexOf('\uD83D\uDCA1') >= 0) {
    return { type: 'tip', text: s.replace(/^\s*\uD83D\uDCA1\s*/, '') };
  }
  if (/^\s{2,}/.test(s)) {
    return { type: 'sub', text: s.trim() };
  }
  var m = s.match(/^(\uC624\uC804|\uC624\uD6C4|\uC800\uB141|\uC885\uC77C|\uC544\uCE68|\uC810\uC2EC)\((\d{1,2}:\d{2})-(\d{1,2}:\d{2})\):\s*(.+)/);
  if (m) return { type: 'main', period: m[1], startTime: m[2], endTime: m[3], place: m[4].trim() };
  return { type: 'plain', text: s.trim() };
}

function groupItineraryBlocks(blocks) {
  var groups = [];
  var current = null;
  for (var i = 0; i < blocks.length; i++) {
    var parsed = parseItineraryBlock(blocks[i]);
    if (parsed.type === 'main') {
      if (current) groups.push(current);
      current = Object.assign({}, parsed, { subs: [], tips: [] });
    } else if (parsed.type === 'sub' && current) {
      current.subs.push(parsed);
    } else if (parsed.type === 'tip' && current) {
      current.tips.push(parsed);
    } else {
      if (current) groups.push(current);
      current = null;
      groups.push(parsed);
    }
  }
  if (current) groups.push(current);
  return groups;
}

function isMealPeriod(period) {
  return period === '\uC800\uB141' || period === '\uC544\uCE68' || period === '\uC810\uC2EC';
}

function periodColor(period) {
  var map = { '\uC624\uC804': '#059669', '\uC624\uD6C4': '#d97706', '\uC885\uC77C': '#dc2626', '\uC800\uB141': '#7c3aed', '\uC544\uCE68': '#ea580c', '\uC810\uC2EC': '#0284c7' };
  return map[period] || '#6b7280';
}

function periodIcon(period) {
  var map = { '\uC624\uC804': '\uD83C\uDF05', '\uC624\uD6C4': '\uD83C\uDF1E', '\uC885\uC77C': '\uD83C\uDF1F', '\uC800\uB141': '\uD83C\uDF07', '\uC544\uCE68': '\uD83C\uDF73', '\uC810\uC2EC': '\uD83C\uDF5C' };
  return map[period] || '';
}

function extractPlaceName(blockText) {
  var parsed = parseItineraryBlock(blockText);
  if (parsed.type === 'main') {
    var info = parsePlaceInfo(parsed.place);
    return info.name;
  }
  return '';
}

function stripServerMealBlocks() {
  if (!currentItineraryData || !currentItineraryData.itinerary) return;
  for (var i = 0; i < currentItineraryData.itinerary.length; i++) {
    var day = currentItineraryData.itinerary[i];
    var cleaned = [];
    for (var j = 0; j < day.blocks.length; j++) {
      var b = day.blocks[j];
      var parsed = parseItineraryBlock(b);
      if (parsed.type === 'main' && parsed.period === '\uC800\uB141') continue;
      cleaned.push(b);
    }
    day.blocks = cleaned;
  }
}

// \uC77C\uC815\uC5D0 \uC2E4\uC81C \uC7A5\uC18C(\uBE14\uB85D)\uAC00 \uD558\uB098\uB77C\uB3C4 \uC788\uB294\uC9C0
function itineraryHasContent(itinerary) {
  return Array.isArray(itinerary) && itinerary.some(function(d) {
    return d && Array.isArray(d.blocks) && d.blocks.some(function(b) { return String(b || '').trim(); });
  });
}

// \uC11C\uBC84\uAC00 \uBE14\uB85D\uC744 \uAC1D\uCCB4\uB85C \uBCF4\uB0B4\uB3C4 \uD654\uBA74\uC774 \uAE68\uC9C0\uC9C0 \uC54A\uB3C4\uB85D \uBB38\uC790\uC5F4\uB85C \uB9DE\uCD94\uACE0, \uC88C\uD45C\uB294 \uB530\uB85C \uBAA8\uC544 \uB454\uB2E4.
function normalizeItineraryBlocks(data) {
  if (!data || !Array.isArray(data.itinerary)) return;
  data.itinerary.forEach(function(day) {
    if (!day || !Array.isArray(day.blocks)) { if (day) day.blocks = []; return; }
    day.blocks = day.blocks.map(function(b) {
      if (b && typeof b === 'object') {
        var text = String(b.text || b.label || b.block || '');
        if (b.lat != null && b.lng != null && (b.name || b.place)) {
          if (!Array.isArray(day.places)) day.places = [];
          day.places.push({ name: b.name || b.place, lat: b.lat, lng: b.lng });
        }
        return text;
      }
      return b == null ? '' : String(b);
    });
  });
}

function renderItinerary(data) {
  normalizeItineraryBlocks(data);
  var info = sectionInfo('itinerary', data);
  // \uBE48 AI \uC77C\uC815\uC740 \uC808\uB300 "AI \uC0DD\uC131"\uC73C\uB85C \uD45C\uC2DC\uD558\uC9C0 \uC54A\uB294\uB2E4.
  if (info && info.kind === 'ai' && !itineraryHasContent(data.itinerary)) {
    info = { kind: 'rule', provider: info.provider, reasonCode: 'AI_INVALID_OUTPUT' };
  }
  data.itineraryInfo = info;
  renderSourceNote('planSourceLabel', 'itinerary', info, { noteNodeId: 'planSourceNote' });
  currentItineraryData = data;
  if (!data._skipMealStrip) stripServerMealBlocks();
  renderItineraryTimeline();
  renderPlanExtras();
  updateItinMap();
}

function renderItineraryTimeline() {
  var container = el('planResult');
  if (!container || !currentItineraryData) return;
  var data = currentItineraryData;
  var h = '';
  if (!itineraryHasContent(data.itinerary)) {
    h += '<div class="itin-summary itin-empty-note" data-i18n="empty-itinerary">' + escapeHtml(t('empty-itinerary')) + '</div>';
  } else if (data.summary) {
    h += '<div class="itin-summary">' + escapeHtml(data.summary) + '</div>';
  }
  var mealPeriods = [
    { key: 'breakfast', period: '\uC544\uCE68', icon: '\uD83C\uDF73', color: 'var(--warn)', time: '08:00 - 09:30' },
    { key: 'lunch', period: '\uC810\uC2EC', icon: '\uD83C\uDF5C', color: 'var(--fg-3)', time: '12:00 - 13:30' },
    { key: 'dinner', period: '\uC800\uB141', icon: '\uD83C\uDF07', color: 'var(--fg-2)', time: '18:00 - 20:00' }
  ];
  var destPeriods = [
    { key: 'morning', period: '\uC624\uC804', icon: '\uD83C\uDF05', color: 'var(--ok)', time: '09:00 - 12:00' },
    { key: 'afternoon', period: '\uC624\uD6C4', icon: '\uD83C\uDF1E', color: 'var(--warn)', time: '13:00 - 17:00' },
    { key: 'allday', period: '\uC885\uC77C', icon: '\uD83C\uDF1F', color: 'var(--accent)', time: '09:00 - 18:00' }
  ];
  for (var di = 0; di < (data.itinerary || []).length; di++) {
    var day = data.itinerary[di];
    var groups = groupItineraryBlocks(day.blocks || []);
    h += '<div class="itin-day">';
    h += '<div class="itin-day-header"><span class="itin-day-label">Day ' + day.day + '</span><span class="itin-day-date">' + escapeHtml(day.date || '') + '</span></div>';
    h += '<div class="itin-day-body">';


    // --- Flight/Stay fixed info ---
    var isFirstDay = (di === 0);
    var isLastDay = (di === (data.itinerary || []).length - 1);
    if (isFirstDay && selectedFlight) {
      var fl = selectedFlight.legs ? selectedFlight.legs[0] : null;
      if (fl) {
        var arrTime = fl.arrivalTime || '';
        h += '<div class="itin-fixed-block itin-flight-block">';
        h += '<span class="itin-fixed-icon">✈️</span> ';
        h += '<strong>' + escapeHtml(t('arrival')) + '</strong> ' + escapeHtml(fl.from || '') + ' → ' + escapeHtml(fl.to || '');
        if (arrTime) h += ' <span class="itin-fixed-time">' + escapeHtml(t('arrive-at').replace('{t}', arrTime)) + '</span>';
        h += '</div>';
      }
    }
    if (isLastDay && selectedFlight && selectedFlight.tripType === 'roundtrip') {
      var rl = selectedFlight.legs ? selectedFlight.legs[selectedFlight.legs.length - 1] : null;
      if (rl) {
        var depTime = rl.departureTime || '';
        h += '<div class="itin-fixed-block itin-flight-block itin-flight-departure">';
        h += '<span class="itin-fixed-icon">✈️</span> ';
        h += '<strong>' + escapeHtml(t('departure')) + '</strong> ' + escapeHtml(rl.from || '') + ' → ' + escapeHtml(rl.to || '');
        if (depTime) h += ' <span class="itin-fixed-time">' + escapeHtml(t('depart-at').replace('{t}', depTime)) + '</span>';
        h += '</div>';
      }
    }
    if (selectedStay) {
      var stayLabel = isFirstDay ? t('checkin') : isLastDay ? t('checkout') : t('stay');
      h += '<div class="itin-fixed-block itin-stay-block">';
      h += '<span class="itin-fixed-icon">🏨</span> ';
      h += '<strong>' + stayLabel + '</strong> ' + escapeHtml(selectedStay.name || '');
      if (selectedStay.area) h += ' <span class="itin-place-info">' + escapeHtml(selectedStay.area) + '</span>';
      h += '</div>';
    }

    // --- Travel spots section (period zones) ---
    h += '<div class="itin-section-label">' + escapeHtml(t('itin-dest-label')) + '</div>';
    for (var dpi = 0; dpi < destPeriods.length; dpi++) {
      var dp = destPeriods[dpi];
      var filledSlots = [];
      for (var gi = 0; gi < groups.length; gi++) {
        var g = groups[gi];
        if (g.type === 'main' && !isMealPeriod(g.period) && g.period === dp.period) {
          g._blockIndex = -1;
          for (var bii = 0; bii < (day.blocks||[]).length; bii++) { var bpp = parseItineraryBlock(day.blocks[bii]); if (bpp.type==='main' && bpp.period===g.period && bpp.place===g.place) { g._blockIndex=bii; break; } }
          filledSlots.push(g);
        }
      }
      h += '<div class="itin-period-zone itin-drop-zone" data-drop-day="' + day.day + '" data-drop-type="dest" data-drop-dest-period="' + dp.key + '" style="border-left-color:' + dp.color + '">';
      h += '<div class="itin-period-header"><span style="color:' + dp.color + '">' + dp.icon + ' ' + tPeriod(dp.period) + '</span><span class="itin-period-time">' + dp.time + '</span><span class="drop-hint">' + escapeHtml(t('drop-here')) + '</span></div>';
      if (filledSlots.length > 0) {
        for (var fsi = 0; fsi < filledSlots.length; fsi++) {
          var fs = filledSlots[fsi];
          h += '<div class="itin-slot-inline" draggable="true" data-itin-day="' + day.day + '" data-itin-period="' + escapeHtml(fs.period) + '" data-itin-block-index="' + fs._blockIndex + '">';
          var placeInfo = parsePlaceInfo(fs.place);
          var destMapQ = encodeURIComponent(placeInfo.name + (placeInfo.info ? ' ' + placeInfo.info : ''));
          var destMapUrl = 'https://www.google.com/maps/search/?api=1&query=' + destMapQ;
          // 자유 일정 칸은 장소가 아니라서 지도 링크를 달지 않는다.
          var destMapLink = isFreeTimePlace(placeInfo.name) ? '' : '<a href="' + destMapUrl + '" target="_blank" rel="noreferrer" class="itin-map-link" title="Google Maps">MAP</a>';
          h += '<div class="itin-slot-place">' + escapeHtml(placeInfo.name) + (placeInfo.info ? '<span class="itin-place-info">' + escapeHtml(placeInfo.info) + '</span>' : '') + destMapLink + '</div>';
          if (fs.subs.length > 0) {
            h += '<div class="itin-sub-list">';
            for (var si = 0; si < fs.subs.length; si++) h += '<div class="itin-sub-item">' + escapeHtml(fs.subs[si].text) + '</div>';
            h += '</div>';
          }
          for (var ti = 0; ti < fs.tips.length; ti++) h += '<div class="itin-tip">\uD83D\uDCA1 ' + escapeHtml(fs.tips[ti].text) + '</div>';
          if (filledSlots.length > 1) {
            h += '<div class="itin-reorder-btns">';
            if (fsi > 0) h += '<button type="button" class="itin-reorder-btn" data-day="' + day.day + '" data-block-index="' + fs._blockIndex + '" data-direction="up" title="' + escapeHtml(t('move-up')) + '">▲</button>';
            if (fsi < filledSlots.length - 1) h += '<button type="button" class="itin-reorder-btn" data-day="' + day.day + '" data-block-index="' + fs._blockIndex + '" data-direction="down" title="' + escapeHtml(t('move-down')) + '">▼</button>';
            h += '</div>';
          }
          h += '<button type="button" class="itin-remove-btn" data-day="' + day.day + '" data-block-index="' + fs._blockIndex + '">✕</button>';
          h += '</div>';
        }
      }
      h += '</div>';
    }
    // Plain blocks (city transfer etc)
    for (var gi3 = 0; gi3 < groups.length; gi3++) {
      var g3 = groups[gi3];
      if (g3.type === 'plain' && g3.text) {
        h += '<div class="itin-slot itin-slot-plain"><div class="itin-slot-place">' + escapeHtml(g3.text) + '</div></div>';
      }
    }

    // --- Meal section ---
    h += '<div class="itin-section-label itin-drop-zone" data-drop-day="' + day.day + '" data-drop-type="food">' + escapeHtml(t('itin-food-label')) + ' <span class="drop-hint">' + escapeHtml(t('drop-here')) + '</span></div>';
    for (var mi = 0; mi < mealPeriods.length; mi++) {
      var meal = mealPeriods[mi];
      var filled = null;
      for (var gi2 = 0; gi2 < groups.length; gi2++) {
        var g2 = groups[gi2];
        if (g2.type === 'main' && g2.period === meal.period) { filled = g2; break; }
      }
      if (filled) {
        var mc = meal.color;
        h += '<div class="itin-slot" draggable="true" data-itin-day="' + day.day + '" data-itin-period="' + escapeHtml(filled.period) + '" style="border-left-color:' + mc + '">';
        h += '<div class="itin-slot-header"><span class="itin-slot-period" style="color:' + mc + '">' + meal.icon + ' ' + escapeHtml(tPeriod(filled.period)) + '</span>';
        h += '<span class="itin-slot-time">' + escapeHtml(filled.startTime + ' - ' + filled.endTime) + '</span></div>';
        var mealInfo = parsePlaceInfo(filled.place);
        var mealMapQ = encodeURIComponent(mealInfo.name + (mealInfo.info ? ' ' + mealInfo.info : ''));
        var mealMapUrl = 'https://www.google.com/maps/search/?api=1&query=' + mealMapQ;
        h += '<div class="itin-slot-place">' + escapeHtml(mealInfo.name) + (mealInfo.info ? '<span class="itin-place-info itin-place-loc">' + escapeHtml(mealInfo.info) + '</span>' : '') + '<a href="' + mealMapUrl + '" target="_blank" rel="noreferrer" class="itin-map-link" title="Google Maps">MAP</a></div>';
        h += '<button type="button" class="itin-remove-btn" data-day="' + day.day + '" data-period="' + escapeHtml(filled.period) + '">' + escapeHtml(t('btn-delete')) + '</button>';
        h += '</div>';
      } else {
        h += '<div class="itin-meal-empty itin-drop-zone" data-drop-day="' + day.day + '" data-drop-type="food" data-drop-meal="' + meal.key + '" style="border-left-color:' + meal.color + '">';
        h += '<span class="itin-meal-label">' + meal.icon + ' ' + tPeriod(meal.period) + '</span>';
        h += '<button type="button" class="itin-meal-add-btn" data-day="' + day.day + '" data-meal-slot="' + meal.key + '">' + escapeHtml(t('btn-add-food')) + '</button>';
        h += '</div>';
      }
    }

    h += '<div class="itin-route-cost-section">';
    h += '<button type="button" class="itin-route-cost-btn" data-route-day="' + day.day + '">' + escapeHtml(t('route-calc')) + '</button>';
    h += '<div class="itin-route-cost-result" id="routeCostDay' + day.day + '"></div>';
    h += '</div>';
    h += '</div></div>';
  }
  if (data.tips && data.tips.length > 0) {
    h += '<div class="itin-tips-section"><div class="itin-tips-title">Tips</div>';
    for (var tt = 0; tt < data.tips.length; tt++) h += '<div class="itin-tip-item">' + escapeHtml(data.tips[tt]) + '</div>';
    h += '</div>';
  }
  container.innerHTML = h;
}

function describeFlightSummary(flight) {
  if (!flight || !Array.isArray(flight.legs) || flight.legs.length === 0) return '';
  const first = flight.legs[0];
  const last = flight.legs[flight.legs.length - 1];
  const route = `${first.from || ''}→${last?.to || first.to || ''}`;
  const dateRange = flight.tripType === 'roundtrip' && last?.date
    ? `${first.date || ''} ~ ${last.date}`
    : first.date || '';
  const provider = flight.provider ? `${flight.provider} ` : '';
  return `${provider}${route} (${dateRange})`;
}

function describeStaySummary(stay) {
  if (!stay) return '';
  const dates = stay.checkIn && stay.checkOut ? `${stay.checkIn} ~ ${stay.checkOut}` : stay.checkIn || stay.checkOut || '';
  const total = stay.totalPriceKRW ? formatKRW(stay.totalPriceKRW) : '';
  return `${stay.name} (${stay.area}) ${dates}` + (total ? ` · ${t('total-prefix')}${total}` : '');
}

function selectionFlightCard(flight) {
  if (!flight) return '';
  const first = flight.legs?.[0];
  const last = flight.legs?.[flight.legs.length - 1];
  const destAirport = flight.tripType === 'roundtrip' ? (first?.to || t('arrival-pending')) : (last?.to || first?.to || t('arrival-pending'));
  const route = `${first?.from || t('departure-pending')} → ${destAirport}`;
  const dateRange = first?.date === last?.date ? first?.date : `${first?.date || ''} ~ ${last?.date || ''}`;
  const price = flight.totalPriceKRW ? formatKRW(flight.totalPriceKRW) : t('price-na');
  const airlines = (flight.airlines || []).join(', ') || (flight.provider || t('airline-na'));
  var outboundTime = first ? escapeHtml(timeRangeText(first.departureTime, first.arrivalTime)) : '';
  var returnTime = '';
  if (flight.tripType === 'roundtrip' && last && last !== first) {
    returnTime = last.departureTime ? escapeHtml(timeRangeText(last.departureTime, last.arrivalTime)) : '';
  }
  return `
    <article class="selection-card">
      <div class="selection-card-title">${escapeHtml(t('selected-flight'))}
        <span class="selection-card-actions">
          <button type="button" class="selection-edit-btn" data-edit-type="flight">${escapeHtml(t('edit'))}</button>
          <button type="button" class="selection-delete-btn" data-delete-type="flight">${escapeHtml(t('delete'))}</button>
        </span>
      </div>
      <div class="selection-card-body">
        <strong>${escapeHtml(route)}</strong>
        <span class="selection-card-date">${escapeHtml(dateRange)}</span>
        <span>${escapeHtml(price)}</span>
        ${outboundTime ? '<span>' + escapeHtml(t('outbound-label')) + outboundTime + '</span>' : ''}
        ${returnTime ? '<span>' + escapeHtml(t('return-label')) + returnTime + '</span>' : ''}
        <span>${escapeHtml(t('airline-label'))}${escapeHtml(airlines)}</span>
      </div>
    </article>`;
}

function selectionStayCard(stay) {
  if (!stay) return '';
  const dates = stay.checkIn && stay.checkOut ? `${stay.checkIn} ~ ${stay.checkOut}` : stay.checkIn || stay.checkOut || '';
  const total = stay.totalPriceKRW ? formatKRW(stay.totalPriceKRW) : t('price-no-info');
  const perNight = stay.pricePerNightKRW ? formatKRW(stay.pricePerNightKRW) + t('per-night-suffix') : '';
  const provider = stay.provider || t('provider-na');
  const amenities = (stay.amenities || []).slice(0, 3).map(localAmenity).join(', ');
  return `
    <article class="selection-card">
      <div class="selection-card-title">${escapeHtml(t('selected-stay'))}
        <span class="selection-card-actions">
          <button type="button" class="selection-edit-btn" data-edit-type="stay">${escapeHtml(t('edit'))}</button>
          <button type="button" class="selection-delete-btn" data-delete-type="stay">${escapeHtml(t('delete'))}</button>
        </span>
      </div>
      <div class="selection-card-body">
        <strong>${escapeHtml(stay.name)}</strong>
        <span>${escapeHtml(stay.area)} · ${escapeHtml(provider)}</span>
        <span>${escapeHtml(dates)}</span>
        <span>${perNight ? escapeHtml(perNight) + ' · ' : ''}${escapeHtml(t('total-prefix'))}${escapeHtml(total)}</span>
        ${amenities ? `<span>${escapeHtml(t('amenities'))}${escapeHtml(amenities)}</span>` : ''}
      </div>
    </article>`;
}


function renderBudgetSummary() {
  var wrap = el('budgetSummary');
  if (!wrap) return;
  var flightCost = selectedFlight ? selectedFlight.totalPriceKRW : 0;
  var stayCost = selectedStay ? (selectedStay.totalPriceKRW || selectedStay.totalKRW || 0) : 0;
  var days = Number(el('days').value) || 4;
  var bb = (currentItineraryData && currentItineraryData.budgetBreakdown) || null;
  var mealPerDay = bb ? bb.meal.perDay : 55000;
  var transportPerDay = bb ? bb.transport.perDay : 22000;
  var activityPerDay = bb ? bb.activity.perDay : 25000;
  var mealTotal = mealPerDay * days;
  var transportTotal = transportPerDay * days;
  var activityTotal = activityPerDay * days;
  var total = flightCost + stayCost + mealTotal + transportTotal + activityTotal;
  var fmt = function(n) { return escapeHtml(formatKRW(n)); };
  var tierLabels = { low: t('budget-low'), mid: t('budget-mid'), high: t('budget-high') };
  var budgetLabel = bb ? (tierLabels[bb.budgetTier] || t('budget-mid')) : t('budget-mid');
  var stayNights = selectedStay ? (selectedStay.nights || tripNights(days)) + t('nights-unit') : '-';
  var notSelected = escapeHtml(t('not-selected'));
  wrap.innerHTML =
    '<h4>' + escapeHtml(t('budget-title')) + '</h4>' +
    '<div class="budget-rows">' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-flight')) + '</span><span>' + (flightCost ? fmt(flightCost) : notSelected) + '</span></div>' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-stay-label') + ' (' + stayNights + ')') + '</span><span>' + (stayCost ? fmt(stayCost) : notSelected) + '</span></div>' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-food')) + '</span><span>~' + fmt(mealTotal) + '</span></div>' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-transport')) + '</span><span>~' + fmt(transportTotal) + '</span></div>' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-activity')) + '</span><span>~' + fmt(activityTotal) + '</span></div>' +
      '<div class="budget-row budget-total"><span>' + escapeHtml(t('cost-summary')) + '</span><span>~' + fmt(total) + '</span></div>' +
    '</div>' +
    '<div class="budget-note">' + escapeHtml(budgetLabel + ' ' + t('budget-note') + days + t('budget-note2')) + '</div>';
}

function renderPlanExtras() {
  renderPlanSelectionCards();
  renderBudgetSummary();
}

function renderPlanSelectionCards() {
  const container = el('planSelectionCards');
  if (!container) return;
  const cards = [];
  if (selectedFlight) cards.push(selectionFlightCard(selectedFlight));
  if (selectedStay) cards.push(selectionStayCard(selectedStay));

  container.innerHTML = cards.join('') || '<div class="selection-card">' + escapeHtml(t('no-selection')) + '</div>';

  // Bind edit/delete handlers
  container.querySelectorAll('.selection-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var type = btn.dataset.deleteType;
      if (type === 'flight') {
        selectedFlightId = '';
        selectedFlight = null;
        renderFlightCards(false);
      } else if (type === 'stay') {
        selectedStayId = '';
        selectedStay = null;
        renderStayCards();
      }
      renderPlanExtras();
      renderItineraryTimeline();
    });
  });
  container.querySelectorAll('.selection-edit-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var type = btn.dataset.editType;
      var detailsList = document.querySelectorAll('.manual-input-group .manual-details');
      if (type === 'flight' && detailsList[0]) {
        detailsList[0].setAttribute('open', '');
        detailsList[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (type === 'stay' && detailsList[1]) {
        detailsList[1].setAttribute('open', '');
        detailsList[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
}





function stayPayloadFromSelection() {
  if (!selectedStay) return null;
  const {
    name,
    provider,
    area,
    checkIn,
    checkOut,
    rooms,
    guests,
    pricePerNightKRW,
    totalPriceKRW,
    amenities
  } = selectedStay;
  return { name, provider, area, checkIn, checkOut, rooms, guests, pricePerNightKRW, totalPriceKRW, amenities };
}

function normalizeDestinationForPlan(dest) {
  if (!dest) return null;
  return {
    name: dest.name || t('rec-dest'),
    city: dest.city || cityLabelByKey(el('city').value) || '',
    area: dest.area || '',
    category: dest.category || '추천',
    bestTime: dest.bestTime || '09:00-17:00',
    stayMin: Number(dest.stayMin || 90)
  };
}

function buildPlanPayload(extra = {}) {
  const payload = {
    city: el('city').value,
    theme: el('theme').value,
    startDate: el('startDate').value || defaultStartDate(),
    days: Number(el('days').value),
    pace: 'normal',
    budget: 'mid',
    useAi: true,
    lang: currentLang,
    ...extra
  };
  const stayInfo = stayPayloadFromSelection();
  if (stayInfo && !payload.stay) payload.stay = stayInfo;
  if (selectedFlight && !payload.flight) payload.flight = buildFlightPayload(selectedFlight);

  if (aiRouteCities.length > 0 && !payload._routeCities) {
    payload._routeCities = aiRouteCities;
  }
  if (aiRegionDayPlan.length > 0 && !payload._regionDayPlan) {
    payload._regionDayPlan = aiRegionDayPlan;
  }
  if (aiSpecialPrefs && Object.keys(aiSpecialPrefs).length > 0 && !payload._specialPrefs) {
    payload._specialPrefs = aiSpecialPrefs;
  }
  return payload;
}

// ── 데이터 출처 안내 ──
// 서버는 { kind, provider, reasonCode } 형태의 정보 객체를 보낸다.
// 화면에는 내부 ID·원문 오류 대신 짧은 안내 문구만 보여준다.
var INFO_KINDS = ['live', 'ai', 'curated', 'fallback', 'mock', 'rule'];
var INFO_FIELD_BY_SECTION = { dest: 'recommendationInfo', itinerary: 'itineraryInfo', foods: 'foodsInfo' };
var PROVIDER_NAMES = {
  travelpayouts: 'Travelpayouts', rakuten: 'Rakuten Travel', google: 'Google Places', google_places: 'Google Places',
  gemini: 'Gemini', openai: 'OpenAI', wikimedia: 'Wikimedia Commons'
};

var SOURCE_TEXT = {
  ko: {
    section: { dest: '추천 여행지', itinerary: '일정 생성 방식', foods: '추천 맛집', foodSearch: '맛집', destSearch: '여행지', flights: '항공편', stays: '숙소', chat: '채팅 해석' },
    kind: { live: '실시간 정보', ai: 'AI 생성', curated: '엄선한 추천 장소', fallback: '기본 목록', mock: '예시 데이터', rule: '규칙 기반' },
    label: {
      'itinerary.ai': 'AI가 만든 일정', 'itinerary.rule': '기본 일정 (규칙 기반)', 'itinerary.curated': '기본 일정 (규칙 기반)', 'itinerary.fallback': '기본 일정 (규칙 기반)',
      'chat.ai': 'AI가 해석했어요', 'chat.rule': '기본 규칙으로 해석했어요',
      'foods.curated': '엄선한 맛집 목록', 'foodSearch.curated': '엄선한 맛집 목록',
      'dest.live': '장소 검색 결과', 'destSearch.live': '장소 검색 결과', 'foods.live': '장소 검색 결과', 'foodSearch.live': '장소 검색 결과',
      'flights.live': '최근 검색 기준 가격', 'stays.live': '실시간 요금', 'stays.fallback': '숙소 목록 · 최저가 기준'
    },
    consequence: {
      curated: '엄선한 기본 목록을 보여드려요.', fallback: '기본 목록을 보여드려요.', mock: '예시 데이터를 보여드려요.',
      rule: '기본 일정으로 만들었어요.', 'chat.rule': '기본 규칙으로 조건을 해석했어요.',
      'stays.fallback': '최저가 기준으로 보여 드려요.'
    },
    reason: {
      'stays.NO_LIVE_DATA': '해당 날짜 빈방 정보가 없어',
      GOOGLE_KEY_MISSING: '지도 서비스가 설정되지 않아', GOOGLE_BILLING_DISABLED: '지도 서비스 결제 설정이 꺼져 있어',
      GOOGLE_PERMISSION_DENIED: '지도 서비스 접근이 거부되어', GOOGLE_QUOTA_EXCEEDED: '오늘 지도 서비스 사용 한도에 도달해',
      GOOGLE_ERROR: '지도 서비스 응답에 문제가 있어', GOOGLE_CIRCUIT_OPEN: '지도 서비스 연결을 잠시 쉬는 중이라',
      NO_RESULTS: '검색 결과가 없어', AI_KEY_MISSING: 'AI가 설정되지 않아', AI_TRUNCATED: 'AI 응답이 중간에 끊겨',
      AI_INVALID_OUTPUT: 'AI 응답 형식이 맞지 않아', AI_ERROR: 'AI 응답에 문제가 있어',
      PROVIDER_UNAVAILABLE: '실시간 조회 서비스에 연결할 수 없어', NO_LIVE_DATA: '이 조건의 실시간 데이터가 없어',
      _default: '일시적인 문제로'
    },
    join: function(cause, cons) { return cause + ' ' + cons; },
    note: { 'flights.live': '다른 이용자의 최근 검색에서 모은 가격이라 실제 요금과 다를 수 있어요.' },
    nearbyNote: '요청한 날짜의 가격이 없어 가까운 날짜(±7일)의 항공편을 보여드려요. 카드의 날짜를 꼭 확인하세요.',
    mockNote: '실제 가격이 아니니 예약 전에 꼭 확인하세요.'
  },
  en: {
    section: { dest: 'Destinations', itinerary: 'Plan type', foods: 'Restaurants', foodSearch: 'Food', destSearch: 'Places', flights: 'Flights', stays: 'Stays', chat: 'Chat' },
    kind: { live: 'Live data', ai: 'AI-generated', curated: 'Curated picks', fallback: 'Default list', mock: 'Sample data', rule: 'Rule-based' },
    label: {
      'itinerary.ai': 'AI-generated itinerary', 'itinerary.rule': 'Standard itinerary (rule-based)', 'itinerary.curated': 'Standard itinerary (rule-based)', 'itinerary.fallback': 'Standard itinerary (rule-based)',
      'chat.ai': 'Interpreted by AI', 'chat.rule': 'Interpreted with basic rules',
      'foods.curated': 'Curated restaurant list', 'foodSearch.curated': 'Curated restaurant list',
      'dest.live': 'Place search results', 'destSearch.live': 'Place search results', 'foods.live': 'Place search results', 'foodSearch.live': 'Place search results',
      'flights.live': 'Prices from recent searches', 'stays.live': 'Live rates', 'stays.fallback': 'Hotel list · lowest listed rates'
    },
    consequence: {
      curated: 'Showing our curated list', fallback: 'Showing the default list', mock: 'Showing sample data',
      rule: 'Built a standard itinerary', 'chat.rule': 'Interpreted with basic rules',
      'stays.fallback': 'Showing lowest listed rates'
    },
    reason: {
      'stays.NO_LIVE_DATA': 'no vacancy data for your dates',
      GOOGLE_KEY_MISSING: 'map service not configured', GOOGLE_BILLING_DISABLED: 'map service billing is off',
      GOOGLE_PERMISSION_DENIED: 'map service access denied', GOOGLE_QUOTA_EXCEEDED: "today's map service limit reached",
      GOOGLE_ERROR: 'map service error', GOOGLE_CIRCUIT_OPEN: 'map service paused for a while',
      NO_RESULTS: 'no search results', AI_KEY_MISSING: 'AI not configured', AI_TRUNCATED: 'AI response was cut off',
      AI_INVALID_OUTPUT: 'AI response was malformed', AI_ERROR: 'AI service error',
      PROVIDER_UNAVAILABLE: 'live service unavailable', NO_LIVE_DATA: 'no live data for these conditions',
      _default: 'temporary issue'
    },
    join: function(cause, cons) { return cons + ' (' + cause + ').'; },
    note: { 'flights.live': 'Collected from other travelers\' recent searches, so actual fares may differ.' },
    nearbyNote: 'No prices for your exact dates, so flights on nearby dates (±7 days) are shown. Please check the dates on each card.',
    mockNote: 'These are not real prices. Check before booking.'
  },
  ja: {
    section: { dest: 'おすすめスポット', itinerary: 'プラン作成方法', foods: 'おすすめグルメ', foodSearch: 'グルメ', destSearch: 'スポット', flights: '航空券', stays: '宿泊', chat: 'チャット解析' },
    kind: { live: 'リアルタイム情報', ai: 'AI生成', curated: '厳選スポット', fallback: '基本リスト', mock: 'サンプルデータ', rule: 'ルールベース' },
    label: {
      'itinerary.ai': 'AIが作成したプラン', 'itinerary.rule': '基本プラン（ルールベース）', 'itinerary.curated': '基本プラン（ルールベース）', 'itinerary.fallback': '基本プラン（ルールベース）',
      'chat.ai': 'AIが解釈しました', 'chat.rule': '基本ルールで解釈しました',
      'foods.curated': '厳選グルメリスト', 'foodSearch.curated': '厳選グルメリスト',
      'dest.live': 'スポット検索結果', 'destSearch.live': 'スポット検索結果', 'foods.live': 'スポット検索結果', 'foodSearch.live': 'スポット検索結果',
      'flights.live': '最近の検索に基づく価格', 'stays.live': 'リアルタイム料金', 'stays.fallback': '宿泊施設リスト・最安値基準'
    },
    consequence: {
      curated: '厳選リストを表示しています', fallback: '基本リストを表示しています', mock: 'サンプルデータを表示しています',
      rule: '基本プランを作成しました', 'chat.rule': '基本ルールで条件を解釈しました',
      'stays.fallback': '最安値基準で表示しています'
    },
    reason: {
      'stays.NO_LIVE_DATA': 'ご希望の日付の空室情報なし',
      GOOGLE_KEY_MISSING: '地図サービスが未設定', GOOGLE_BILLING_DISABLED: '地図サービスの課金設定がオフ',
      GOOGLE_PERMISSION_DENIED: '地図サービスへのアクセスが拒否されました', GOOGLE_QUOTA_EXCEEDED: '本日の地図サービス利用上限に到達',
      GOOGLE_ERROR: '地図サービスのエラー', GOOGLE_CIRCUIT_OPEN: '地図サービスを一時停止中',
      NO_RESULTS: '検索結果なし', AI_KEY_MISSING: 'AI未設定', AI_TRUNCATED: 'AIの応答が途中で途切れました',
      AI_INVALID_OUTPUT: 'AIの応答形式が正しくありません', AI_ERROR: 'AIサービスのエラー',
      PROVIDER_UNAVAILABLE: 'リアルタイム照会に接続できません', NO_LIVE_DATA: 'この条件のリアルタイムデータなし',
      _default: '一時的な問題'
    },
    join: function(cause, cons) { return cons + '（' + cause + '）。'; },
    sep: '',
    note: { 'flights.live': '他の利用者の最近の検索から集めた価格のため、実際の料金と異なる場合があります。' },
    nearbyNote: 'ご希望の日付の料金がないため、近い日付（±7日）の便を表示しています。各カードの日付をご確認ください。',
    mockNote: '実際の価格ではありません。予約前に必ずご確認ください。'
  }
};

function srcText() {
  return SOURCE_TEXT[currentLang] || SOURCE_TEXT.ko;
}

function normalizeInfo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var kind = String(raw.kind || '').toLowerCase();
  if (INFO_KINDS.indexOf(kind) < 0) return null;
  return { kind: kind, provider: String(raw.provider || ''), reasonCode: raw.reasonCode ? String(raw.reasonCode) : null };
}

function legacyAiReason(err) {
  var c = String((err && (err.code || err.type)) || '').toLowerCase();
  if (/trunc|max_tokens/.test(c)) return 'AI_TRUNCATED';
  if (/invalid|format|parse/.test(c)) return 'AI_INVALID_OUTPUT';
  if (/missing|not_configured|no_key/.test(c)) return 'AI_KEY_MISSING';
  return 'AI_ERROR';
}

// 예전 서버 응답(정보 객체 없음)도 같은 방식으로 안내하기 위한 변환
function legacyInfo(section, data) {
  data = data || {};
  var errs = Array.isArray(data.aiErrors) ? data.aiErrors : [];
  var s;
  if (section === 'dest' || section === 'destSearch') {
    s = String((section === 'dest' ? data.recommendationSource : data.source) || '').toLowerCase();
    if (s.indexOf('google') >= 0) return { kind: 'live', provider: 'google_places', reasonCode: null };
    return { kind: 'curated', provider: 'curated', reasonCode: null };
  }
  if (section === 'itinerary' || section === 'chat') {
    s = String((section === 'itinerary' ? data.itinerarySource : data.source) || '').toLowerCase();
    if (/gemini|openai/.test(s)) return { kind: 'ai', provider: s.indexOf('openai') >= 0 ? 'openai' : 'gemini', reasonCode: null };
    return { kind: 'rule', provider: 'rule', reasonCode: errs.length ? legacyAiReason(errs[0]) : null };
  }
  if (section === 'foods') {
    return Array.isArray(data.recommendedFoods) && data.recommendedFoods.length ? { kind: 'live', provider: 'google_places', reasonCode: null } : null;
  }
  if (section === 'foodSearch') {
    s = String(data.source || '').toLowerCase();
    if (s.indexOf('google') >= 0) return { kind: 'live', provider: 'google_places', reasonCode: null };
    return { kind: 'curated', provider: 'curated', reasonCode: data.warning ? 'GOOGLE_ERROR' : null };
  }
  if (section === 'flights' || section === 'stays') {
    s = String(data.source || '').toLowerCase();
    if (!s || s === 'mock') return { kind: 'mock', provider: 'mock', reasonCode: 'NO_LIVE_DATA' };
    if (s.indexOf('travelpayouts') >= 0) return { kind: 'live', provider: 'travelpayouts', reasonCode: null };
    if (s.indexOf('rakuten') >= 0) return { kind: 'live', provider: 'rakuten', reasonCode: null };
    return { kind: 'live', provider: '', reasonCode: null };
  }
  return null;
}

function sectionInfo(section, data) {
  var field = INFO_FIELD_BY_SECTION[section] || 'sourceInfo';
  return normalizeInfo(data && data[field]) || legacyInfo(section, data);
}

function describeSource(section, info, opts) {
  var T = srcText();
  var kind = info.kind;
  var label = T.label[section + '.' + kind] || T.kind[kind] || T.kind.fallback;
  var providerName = PROVIDER_NAMES[String(info.provider || '').toLowerCase()] || '';
  // 숙소 최저가 목록(날짜 조건 없는 라쿠텐 결과)도 실제 공급자 데이터라 출처 이름을 붙인다.
  if ((kind === 'live' || (kind === 'fallback' && section === 'stays')) && providerName) label += ' · ' + providerName;
  var note = '';
  var warn = false;
  if (info.reasonCode) {
    var cause = T.reason[section + '.' + info.reasonCode] || T.reason[info.reasonCode] || T.reason._default;
    var cons = T.consequence[section + '.' + kind] || T.consequence[kind] || '';
    if (cons) { note = T.join(cause, cons); warn = true; }
  }
  if (kind === 'mock') {
    note = note ? note + (T.sep != null ? T.sep : ' ') + T.mockNote : T.mockNote;
    warn = true;
  }
  if (!note && T.note[section + '.' + kind]) note = T.note[section + '.' + kind];
  // 항공: 요청한 날짜에 가격이 없어 서버가 가까운 날짜(±7일) 편을 보낸 경우 반드시 알린다.
  if (section === 'flights' && kind !== 'mock' && opts && opts.dateMatch === 'nearby') {
    note = T.nearbyNote + (note ? (T.sep != null ? T.sep : ' ') + note : '');
    warn = true;
  }
  return { label: label, note: note, warn: warn };
}

// 출처 안내 줄을 그린다. 언어를 바꾸면 다시 그릴 수 있게 마지막 상태를 기억해 둔다.
var sourceNoteState = {};

function renderSourceNote(nodeId, section, info, opts) {
  opts = opts || {};
  sourceNoteState[nodeId] = { section: section, info: info, opts: opts };
  var node = el(nodeId);
  var noteNode = opts.noteNodeId ? el(opts.noteNodeId) : null;
  if (!node) return;
  if (!info) {
    node.textContent = '';
    node.classList.remove('warn');
    if (noteNode) { noteNode.textContent = ''; noteNode.classList.remove('warn'); }
    return;
  }
  var d = describeSource(section, info, opts);
  var line = srcText().section[section] + ': ' + d.label;
  if (noteNode) {
    node.textContent = line;
    node.classList.remove('warn');
    noteNode.textContent = d.note;
    noteNode.classList.toggle('warn', d.warn);
  } else {
    node.innerHTML = escapeHtml(line) + (d.note ? '<br><span class="source-note-detail">' + escapeHtml(d.note) + '</span>' : '');
    node.classList.toggle('warn', d.warn);
  }
}

function rerenderSourceNotes() {
  Object.keys(sourceNoteState).forEach(function(id) {
    var s = sourceNoteState[id];
    renderSourceNote(id, s.section, s.info, s.opts);
  });
}

function buildFlightPayload(flight) {
  if (!flight) return null;
  return {
    tripType: flight.tripType,
    legs: (flight.legs || []).map((l) => ({
      from: l.from,
      to: l.to,
      date: l.date,
      departureTime: l.departureTime,
      arrivalTime: l.arrivalTime
    }))
  };
}

function toRecFood(food) {
  return {
    name: food.name, city: food.city, genre: food.genre, area: food.area, score: food.score,
    reviewCount: food.reviewCount || 0, priceLevel: food.priceLevel, mapUrl: food.mapUrl,
    photoUrl: food.photoUrl || null, photoCredit: food.photoCredit || null,
    aiScore: food.aiFit || 70, aiFit: food.aiFit || 70,
    lat: food.lat != null ? food.lat : null, lng: food.lng != null ? food.lng : null,
    openNow: food.openNow, todayHours: food.todayHours
  };
}

// 일정 지도용 좌표 모음(장소 이름 → 좌표). 일정과 함께 저장되므로 추천 카드를 지워도 지도는 유지된다.
function buildPlaceCoords(data) {
  var coords = {};
  var add = function(item) {
    if (!item || item.lat == null || item.lng == null || !item.name) return;
    var lat = Number(item.lat);
    var lng = Number(item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!coords[item.name]) coords[item.name] = { lat: lat, lng: lng };
  };
  var serverCoords = data.placeCoords;
  if (Array.isArray(serverCoords)) serverCoords.forEach(add);
  else if (serverCoords && typeof serverCoords === 'object') {
    Object.keys(serverCoords).forEach(function(name) {
      var v = serverCoords[name];
      if (v) add({ name: name, lat: v.lat, lng: v.lng });
    });
  }
  (data.recommendations || []).forEach(add);
  (data.recommendedFoods || []).forEach(add);
  return coords;
}

var planRequestSeq = 0;
var recFoodsNeedFill = false;

async function runPlan(extra = {}, syncAux = false, opts = {}) {
  validateDates();
  var seq = ++planRequestSeq;
  beginPlanBusy(opts.trigger || 'btnPlan');
  showCardLoading('destCards');
  try {
    const payload = buildPlanPayload(extra);
    const data = await postJson('/api/travel-plan', payload);
    // 그 사이 새 요청이 시작됐다면 오래된 응답은 버린다.
    if (seq !== planRequestSeq) return;

    renderCards('destCards', data.recommendations || [], 'dest');
    renderSourceNote('destSourceNote', 'dest', sectionInfo('dest', data));

    // 추천 맛집 탭은 결과가 없어도 항상 다시 그린다(이전 도시 결과가 남지 않도록).
    latestRecFoodList = (data.recommendedFoods || []).map(toRecFood);
    renderRecFoodCards(latestRecFoodList);
    renderSourceNote('recFoodSourceNote', 'foods', latestRecFoodList.length ? sectionInfo('foods', data) : null);
    recFoodsNeedFill = latestRecFoodList.length === 0;

    renderItinerary({
      summary: data.summary,
      itinerary: Array.isArray(data.itinerary) ? data.itinerary : [],
      tips: data.tips,
      itinerarySource: data.itinerarySource,
      itineraryInfo: data.itineraryInfo || null,
      aiErrors: data.aiErrors || [],
      placeCoords: buildPlaceCoords(data),
      budgetBreakdown: data.budgetBreakdown || null
    });

    if (!syncAux) return;

    // 통합 생성 시 항공·숙소·맛집·여행지 탭을 같은 조건으로 한 번씩만 갱신한다.
    const cityKey = el('city').value;
    const selectedCity = cityCatalog.find((c) => c.key === cityKey);
    const startDate = el('startDate').value || defaultStartDate();
    const days = Math.max(1, Number(el('days').value) || 1);
    const returnDate = addDays(startDate, Math.max(0, days - 1));

    if (selectedCity?.airport && (!toAirportDirty || !el('to').value)) {
      el('to').value = formatAirportDisplay(selectedCity.airport);
      toAirportDirty = false;
    }
    if (!el('from').value) {
      el('from').value = formatAirportDisplay('ICN');
    }
    el('departDate').value = startDate;
    el('returnDate').value = returnDate;
    setTripTab(days > 1 ? 'roundtrip' : 'oneway');

    el('foodCity').value = cityKey;
    el('stayCity').value = cityKey;
    if (el('destSearchCity')) el('destSearchCity').value = cityKey;
    el('checkIn').value = startDate;
    el('checkOut').value = addDays(startDate, tripNights(days));

    // 탐색 > 여행지 탭은 방금 받은 추천을 재사용한다(/api/dest-search 중복 호출 없음).
    renderDestSearchCards(data.recommendations || []);
    renderSourceNote('destSearchSourceNote', 'destSearch', sectionInfo('dest', data));

    searchFlights();
    searchFoods();
    searchStays();
    refreshInlineWeather(cityKey);
  } catch (err) {
    if (seq !== planRequestSeq) return;
    el('destCards').innerHTML = '<div class="card">' + escapeHtml(friendlyError(err)) + '</div>';
    console.error('[runPlan]', err);
  } finally {
    endPlanBusy();
  }
}

function segmentRowTemplate(index, from = '', to = '', date = '') {
  return `<div class="segment-row" data-index="${index}">
    <div class="airport-wrap"><input class="seg-from airport-input" value="${from}" placeholder="ICN" autocomplete="off" /><div class="airport-suggest"></div></div>
    <div class="airport-wrap"><input class="seg-to airport-input" value="${to}" placeholder="NRT" autocomplete="off" /><div class="airport-suggest"></div></div>
    <input class="seg-date" type="date" value="${date}" />
    <button type="button" class="remove-segment">${escapeHtml(t('remove-segment'))}</button>
  </div>`;
}

function ensureDefaultSegmentDates() {
  const dates = document.querySelectorAll('.seg-date');
  const start = (el('startDate') && el('startDate').value) || defaultStartDate();
  dates.forEach((d, i) => {
    if (!d.value) {
      d.value = addDays(start, i * 3) || start;
    }
  });
}

function addSegment(from = '', to = '', date = '') {
  const root = el('segmentRows');
  const nextIndex = root.querySelectorAll('.segment-row').length + 1;
  root.insertAdjacentHTML('beforeend', segmentRowTemplate(nextIndex, from, to, date));
  ensureDefaultSegmentDates();
}

function nextAirportSuggestion(fromCode) {
  const candidates = ['NRT', 'KIX', 'FUK', 'CTS', 'OKA', 'NGO', 'KOJ'];
  const from = String(fromCode || '').toUpperCase();
  const idx = candidates.indexOf(from);
  if (idx === -1) return candidates[0];
  return candidates[(idx + 1) % candidates.length];
}

function getDefaultFirstSegmentTo() {
  const selectedCity = cityCatalog.find((c) => c.key === el('city').value);
  return selectedCity?.airport || 'NRT';
}

function addSuggestedSegment() {
  const rows = Array.from(document.querySelectorAll('.segment-row'));
  if (rows.length === 0) {
    addSegment('ICN', getDefaultFirstSegmentTo(), '');
    return;
  }

  const lastRow = rows[rows.length - 1];
  const lastTo = resolveAirportCode(lastRow.querySelector('.seg-to')?.value);
  const nextFrom = lastTo || 'NRT';
  const nextTo = nextAirportSuggestion(nextFrom);
  addSegment(nextFrom, nextTo, '');
}

function resetSegments() {
  el('segmentRows').innerHTML = '';
  addSuggestedSegment();
  addSuggestedSegment();
}

function readSegments() {
  return Array.from(document.querySelectorAll('.segment-row'))
    .map((row) => ({
      from: resolveAirportCode(row.querySelector('.seg-from')?.value),
      to: resolveAirportCode(row.querySelector('.seg-to')?.value),
      date: row.querySelector('.seg-date')?.value || ''
    }))
    .filter((s) => s.from && s.to && s.date);
}

function renderFlightFilterChecks(options) {
  el('airportChecks').innerHTML = (options?.airports || []).map((code) => `<label class="check-item"><input type="checkbox" class="airport-check" value="${code}" />${code}</label>`).join('');
  el('airlineChecks').innerHTML = (options?.airlines || []).map((name) => `<label class="check-item"><input type="checkbox" class="airline-check" value="${name}" />${name}</label>`).join('');
}

function renderStayFilterChecks(options) {
  el('stayProviderChecks').innerHTML = (options?.providers || []).map((name) => `<label class="check-item"><input type="checkbox" class="stay-provider-check" value="${name}" />${name}</label>`).join('');
  // 체크박스 값은 서버가 준 원래 표기를 그대로 보내고, 글자만 화면 언어로 보여준다.
  el('stayAmenityChecks').innerHTML = (options?.amenities || []).map((name) => `<label class="check-item"><input type="checkbox" class="stay-amenity-check" value="${escapeHtml(name)}" />${escapeHtml(localAmenity(name))}</label>`).join('');
}

// 예시(mock) 숙소의 한국어 부대시설 이름 → 화면 언어. [영어, 일본어]
var AMENITY_I18N = {
  '조식 포함': ['Breakfast included', '朝食付き'], '석식 포함': ['Dinner included', '夕食付き'],
  '무료 Wi-Fi': ['Free Wi-Fi', '無料Wi-Fi'], '온천': ['Hot spring', '温泉'], '야외 수영장': ['Outdoor pool', '屋外プール'],
  '피트니스': ['Fitness room', 'フィットネス'], '공항 셔틀': ['Airport shuttle', '空港シャトル'], '주차 가능': ['Parking available', '駐車場あり']
};

function localAmenity(name) {
  var s = String(name == null ? '' : name);
  var lang = typeof currentLang === 'string' ? currentLang : 'ko';
  var row = lang === 'ko' ? null : AMENITY_I18N[s];
  return row ? (lang === 'ja' ? row[1] : row[0]) : s;
}

function refreshStaySelection() {
  if (!selectedStayId) {
    selectedStay = null;
    return;
  }
  const match = stayResults.find((x) => x.id === selectedStayId);
  if (!match) {
    selectedStayId = '';
    selectedStay = null;
  } else {
    selectedStay = match;
  }
}

function selectStayById(id) {
  if (!id) {
    selectedStayId = '';
    selectedStay = null;
  } else {
    const target = stayResults.find((x) => x.id === id);
    if (target) {
      selectedStayId = id;
      selectedStay = target;
    } else {
      selectedStayId = '';
      selectedStay = null;
    }
  }
  renderStayCards();
  renderPlanExtras();
  renderItineraryTimeline();
}

function refreshFlightSelection() {
  if (!selectedFlightId) {
    selectedFlight = null;
    return;
  }
  const match = flightResults.find((x) => x._id === selectedFlightId);
  selectedFlight = match || null;
}

function resetFlightSelectionDisplay() {
  selectedFlightId = '';
  selectedFlight = null;
  renderFlightCards(false);
}

async function clearFlightSelection() {
  resetFlightSelectionDisplay();
  try {
    await runPlan({}, false, { trigger: 'btnPlanRefresh' });
  } catch (err) {
    if (el('planResult')) el('planResult').textContent = friendlyError(err);
  }
}

// 항공편의 출발일·여행 일수(왕복·다구간은 마지막 편 날짜까지). 일수를 알 수 없거나 범위(1~10일) 밖이면 days는 null.
function flightTripDates(flight) {
  var legs = (flight && Array.isArray(flight.legs)) ? flight.legs : [];
  var start = legs[0] && /^\d{4}-\d{2}-\d{2}$/.test(String(legs[0].date || '')) ? legs[0].date : '';
  if (!start) return null;
  var last = legs.length > 1 ? legs[legs.length - 1] : null;
  var end = last && /^\d{4}-\d{2}-\d{2}$/.test(String(last.date || '')) ? last.date : '';
  var days = null;
  if (end) {
    var span = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    if (Number.isFinite(span) && span >= 1 && span <= 10) days = span;
  }
  return { start: start, end: end, days: days };
}

// 서버는 선택한 항공편의 출발일로 일정을 시작한다. 항공편 날짜가 여행 날짜와 다르면(가까운 날짜 편 등)
// 여행 날짜를 항공편에 맞출지 먼저 묻고, 맞추면 출발일·일수·항공/숙소 날짜·날씨 강조를 함께 바꾼다.
// 반환: 선택을 계속해도 되면 true, 사용자가 취소하면 false.
function alignTripDatesToFlight(flight) {
  var fd = flightTripDates(flight);
  if (!fd) return true;
  var curStart = el('startDate').value || defaultStartDate();
  var curDays = Math.max(1, Number(el('days').value) || 1);
  var nextDays = fd.days || curDays;
  if (fd.start === curStart && nextDays === curDays) return true;
  var range = fd.end && fd.end !== fd.start ? fd.start + ' ~ ' + fd.end : fd.start;
  if (!confirm(fillText(t('confirm-flight-dates'), { dates: range, days: nextDays }))) return false;
  el('startDate').value = fd.start;
  el('days').value = nextDays;
  syncDatesToDependentForms();
  // 이전 날짜로 고른 숙소는 요금·날짜가 맞지 않으므로 선택을 풀고, 이미 조회한 숙소 목록은 새 날짜로 다시 조회한다.
  if (selectedStay && !selectedStay.manual && selectedStay.checkIn !== fd.start) {
    selectedStayId = '';
    selectedStay = null;
  }
  if (stayResults.some(function(s) { return !s.manual; })) searchStays();
  if (lastWeather) renderWeatherWidget(lastWeather.daily, cityNameByKey(lastWeather.cityKey));
  return true;
}

async function selectFlightById(id) {
  if (selectedFlightId === id) {
    await clearFlightSelection();
    return;
  }
  const target = flightResults.find((x) => x._id === id);
  if (!target) return;
  if (!alignTripDatesToFlight(target)) return;
  selectedFlightId = id;
  selectedFlight = target;
  renderFlightCards(false);
  renderPlanExtras();
  renderItineraryTimeline();
  try {
    await runPlan({ flight: buildFlightPayload(target) }, false, { trigger: 'btnPlanRefresh' });
  } catch (err) {
    if (el('planResult')) el('planResult').textContent = friendlyError(err);
  }
}

function stayCardTemplate(x) {
  const priceNight = formatKRW(x.pricePerNightKRW) + t('per-night-suffix');
  const totalPrice = formatKRW(x.totalPriceKRW);
  // 숙소 타입은 화면 언어로 보여준다(직접 입력한 숙소는 typeLabel이 없다). 모르는 타입이면 서버 표기를 쓴다.
  const typeKey = x.type ? 'type-' + x.type : '';
  const typeLabel = typeKey && t(typeKey) !== typeKey ? t(typeKey) : (x.typeLabel || '');
  const meta = [typeLabel, x.rating ? t('rating-prefix') + x.rating : '', x.area || ''].filter(Boolean).join(' · ');
  const amenityChips = (x.amenities || []).slice(0, 4).map((a) => `<span class="chip">${escapeHtml(localAmenity(a))}</span>`).join('');
  const offerLine = x.offerId ? `${escapeHtml(t('offer-label'))}${escapeHtml(x.offerId)}` : '';
  const roomLine = x.roomType ? `${escapeHtml(t('room-label'))}${escapeHtml(x.roomType)}` : '';
  const boardLine = x.boardType ? `${escapeHtml(t('meal-label'))}${escapeHtml(x.boardType)}` : '';
  const cancelLine = x.cancellation ? `${escapeHtml(t('cancel-label'))}${escapeHtml(x.cancellation)}` : '';
  const detailLine = [offerLine, roomLine, boardLine, cancelLine].filter(Boolean).join(' · ');
  const priceLine = x.priceBreakdown ? escapeHtml(priceBreakdownText(x.priceBreakdown)) : '';
  const selectedClass = x.id === selectedStayId ? ' selected' : '';
  // 숙소 사진(라쿠텐 등). 불러오기 실패 시 사진 칸을 통째로 숨긴다(상단 error 리스너).
  const photoSrc = safeImageUrl(x.imageUrl, 'stay');
  const photoBlock = photoSrc
    ? `<div class="stay-photo"><img class="stay-photo-img" src="${escapeHtml(photoSrc)}" alt="${escapeHtml(x.name || '')}" loading="lazy" decoding="async"></div>`
    : '';
  const stationLine = x.nearestStation ? `<div class="stay-meta-row">🚉 ${escapeHtml(t('nearest-station'))}: ${escapeHtml(x.nearestStation)}</div>` : '';
  const sampleChip = x._mock ? `<span class="chip">${escapeHtml(t('sample-data'))}</span> ` : '';
  // 날짜 조건 없이 받은 최저가(라쿠텐 SimpleHotelSearch): 선택한 날짜의 빈방·요금이 확인되지 않았다.
  const undatedChip = !x._mock && (x.dateMatch === 'none' || x.priceBasis === 'min_charge')
    ? `<span class="chip chip-nearby" title="${escapeHtml(t('stay-date-unconfirmed-tip'))}">${escapeHtml(t('stay-date-unconfirmed'))}</span> `
    : '';
  const selectButton = x._mock
    ? `<button type="button" class="stay-select-btn" disabled title="${escapeHtml(t('sample-no-select'))}">${escapeHtml(t('sample-no-select'))}</button>`
    : `<button type="button" class="stay-select-btn" data-stay-id="${escapeHtml(String(x.id || ''))}">
        ${x.id === selectedStayId ? t('selected-mark') : t('include-ai')}
      </button>`;
  return `<article class="card stay-card${selectedClass}" data-stay-id="${escapeHtml(String(x.id || ''))}">
    ${photoBlock}
    <div class="stay-top">
      <div>
        <div class="stay-name">${escapeHtml(x.name)}</div>
        <div class="stay-meta">${escapeHtml(meta)}</div>
      </div>
      <div class="stay-price">
        <div class="stay-night">${escapeHtml(priceNight)}</div>
        <div class="stay-total">${escapeHtml(t('total-prefix') + totalPrice)}</div>
      </div>
    </div>
    <div class="stay-meta-row">${sampleChip}${undatedChip}${escapeHtml(x._mock ? '' : (x.provider || ''))}${x._mock ? '' : ' · '}${escapeHtml(x.checkIn || '')} ~ ${escapeHtml(x.checkOut || '')}</div>
    ${stationLine}
    <div class="stay-meta-row">${escapeHtml(t('rooms-guests'))}${escapeHtml(String(x.rooms || ''))}${escapeHtml(t('guests-sep'))}${escapeHtml(String(x.guests || ''))}</div>
    ${detailLine ? `<div class="stay-meta-row">${detailLine}</div>` : ''}
    ${priceLine ? `<div class="stay-meta-row">${priceLine}</div>` : ''}
    <div class="stay-meta-row stay-amenities">${amenityChips}</div>
    <div class="link-row">
      ${selectButton}
      ${safeLinkUrl(x.deeplink || x.url) ? `<a href="${escapeHtml(safeLinkUrl(x.deeplink || x.url))}" target="_blank" rel="noreferrer">${escapeHtml(t('book-page'))}</a>` : ''}
    </div>
  </article>`;
}

function renderStayCards() {
  refreshStaySelection();
  const sorted = [...stayResults].sort((a, b) => {
    if (staySortMode === 'price') return a.totalPriceKRW - b.totalPriceKRW;
    if (staySortMode === 'rating') return b.rating - a.rating;
    return b.aiScore - a.aiScore;
  });
  el('stayCards').innerHTML = sorted.length > 0 ? sorted.map(stayCardTemplate).join('') : '<div class="card">' + t('no-results') + '</div>';
}

let currentTripType = 'oneway';

function setTripTab(type) {
  currentTripType = type;
  document.querySelectorAll('#tripTabs .tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.trip === type));
  const isMulti = type === 'multicity';
  const isRound = type === 'roundtrip';
  document.querySelectorAll('.basic-route').forEach((node) => {
    node.classList.toggle('hidden', isMulti);
  });
  el('returnDate').style.display = isRound ? 'block' : 'none';
  el('multiWrap').classList.toggle('hidden', !isMulti);
}

document.querySelectorAll('#tripTabs .tab').forEach((btn) => btn.addEventListener('click', () => setTripTab(btn.dataset.trip)));
el('addSegment').addEventListener('click', () => addSuggestedSegment());
el('resetSegments').addEventListener('click', () => resetSegments());
el('segmentRows').addEventListener('click', (event) => {
  const btn = event.target.closest('.remove-segment');
  if (!btn) return;
  const rows = document.querySelectorAll('.segment-row');
  if (rows.length <= 2) return;
  btn.closest('.segment-row')?.remove();
});

// 사용자가 도착 공항을 직접 고쳤는지 기억한다(도시를 바꾸면 다시 자동 입력).
var toAirportDirty = false;

document.addEventListener('input', (event) => {
  const input = event.target.closest('.airport-input');
  if (input) renderAirportSuggest(input);
  if (input && input.id === 'to') toAirportDirty = true;
});

document.addEventListener('focusin', (event) => {
  const input = event.target.closest('.airport-input');
  if (input) renderAirportSuggest(input);
});

document.addEventListener('click', (event) => {
  const option = event.target.closest('.airport-option');
  if (option) {
    const wrap = option.closest('.airport-wrap');
    const input = wrap?.querySelector('.airport-input');
    if (input) input.value = formatAirportDisplay(option.dataset.code);
    if (input && input.id === 'to') toAirportDirty = true;
    closeAllAirportSuggest();
    return;
  }
  if (!event.target.closest('.airport-wrap')) closeAllAirportSuggest();
});

el('btnPlan').addEventListener('click', async () => {
  if (planBusyCount > 0) return; // 생성 중 중복 클릭 방지(유료 호출)
  chatHistory = []; lastParsedConditions = null; aiPreferredAreas = []; aiRouteCities = []; aiRegionDayPlan = []; aiSpecialPrefs = {};
  try {
    resetFlightSelectionDisplay();
    selectStayById('');
    // runPlan이 항공·숙소·맛집 탭까지 한 번씩 갱신한다.
    await runPlan({}, true, { trigger: 'btnPlan' });
  } catch (err) {
    el('planResult').textContent = friendlyError(err);
  }
});

el('btnAiAssist')?.addEventListener('click', async () => {
  const message = String(el('aiRequest')?.value || '').trim();
  if (!message) {
    appendAiChat('assistant', t('chat-enter-msg'));
    return;
  }

  if (planBusyCount > 0) return;
  appendAiChat('user', message);
  beginPlanBusy('btnAiAssist');
  try {
    const context = {
      city: el('city').value,
      theme: el('theme').value,
      budget: 'mid',
      days: Number(el('days').value || 4),
      startDate: el('startDate').value || defaultStartDate()
    };
    const data = await postJson('/api/ai-travel-chat', { message, context, lang: currentLang });
    renderSourceNote('aiSourceNote', 'chat', sectionInfo('chat', data));
    if (data.cityMeta) upsertCityOption(data.cityMeta);
    applyAiConditions(data.parsed || {});

    appendAiChat('assistant', data.reply || t('chat-processing'));
    resetFlightSelectionDisplay();
    selectStayById('');
    // runPlan이 항공·숙소·맛집 탭까지 한 번씩 갱신한다.
    await runPlan({}, true, { trigger: 'btnAiAssist' });
  } catch (err) {
    appendAiChat('assistant', t('chat-error') + friendlyError(err));
  } finally {
    endPlanBusy();
  }
});

var flightSearchSeq = 0;

async function searchFlights() {
  var seq = ++flightSearchSeq;
  try {
    const multiSegments = readSegments();
    if (currentTripType === 'multicity' && multiSegments.length < 2) {
      el('flightCards').innerHTML = '<div class="card">' + escapeHtml(t('err-multicity')) + '</div>';
      el('btnFlightMore')?.classList.add('hidden');
      return;
    }

    const payload = {
      city: el('city').value,
      tripType: currentTripType,
      from: resolveAirportCode(el('from').value),
      to: resolveAirportCode(el('to').value) || resolveAirportCode(cityCatalog.find((c) => c.key === el('city').value)?.airport || ''),
      departDate: el('departDate').value || el('startDate').value || defaultStartDate(),
      returnDate: el('returnDate').value || addDays(el('departDate').value || el('startDate').value || defaultStartDate(), Math.max(1, (Number(el('days').value) || 2) - 1)),
      preference: el('flightPreference').value,
      multiSegments,
      filters: {
        minPrice: Number(el('priceMin').value || 0),
        maxPrice: Number(el('priceMax').value || 9999999),
        departHourMin: Number(el('hourMin').value || 0),
        departHourMax: Number(el('hourMax').value || 23),
        airports: [...parseCsv(el('airportFilter').value).map((x) => resolveAirportCode(x)), ...getCheckedValues('.airport-check').map((x) => x.toUpperCase())].filter(Boolean),
        airlines: [...parseCsv(el('airlineFilter').value), ...getCheckedValues('.airline-check')]
      }
    };

    validateDates();
    setLoading('btnFlights', true);
    showCardLoading('flightCards');
    const data = await postJson('/api/flights', payload);
    if (seq !== flightSearchSeq) return; // 더 최근 검색이 있으면 이 결과는 버린다
    const info = sectionInfo('flights', data);
    const isMock = info && info.kind === 'mock';
    const stamp = Date.now();
    flightResults = (data.flights || []).map((f, i) => ({ ...f, _id: `f${stamp}-${i}`, _mock: isMock }));
    selectedFlightId = null;
    renderFlightCards(true);
    renderFlightFilterChecks(data.filterOptions);
    renderSourceNote('flightSourceNote', 'flights', info, { dateMatch: data.dateMatch || null });
  } catch (err) {
    if (seq !== flightSearchSeq) return;
    el('flightCards').innerHTML = '<div class="card">' + escapeHtml(friendlyError(err)) + '</div>';
    el('btnFlightMore')?.classList.add('hidden');
  } finally {
    if (seq === flightSearchSeq) setLoading('btnFlights', false);
  }
}

el('btnFlights').addEventListener('click', () => { searchFlights(); });

el('btnFlightMore').addEventListener('click', () => {
  visibleFlightCount += getFlightCardsPerRow();
  renderFlightCards(false);
});

document.querySelectorAll('#flightSortTabs .sort-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    flightSortMode = btn.dataset.sort;
    document.querySelectorAll('#flightSortTabs .sort-tab').forEach((x) => {
      x.classList.toggle('active', x === btn);
    });
    renderFlightCards(true);
  });
});

el('flightCards').addEventListener('click', async (event) => {
  const btn = event.target.closest('.flight-select-btn');
  if (!btn) return;
  event.preventDefault();
  const flightId = btn.dataset.flightId;
  if (!flightId) return;
  await selectFlightById(flightId);
});


function showAddToPlanModal(name, opts) {
  opts = opts || {};
  pendingAddPlace = { name: name || '', area: opts.area || '' };
  pendingAddType = opts.addType || 'dest';
  pendingAddSlot = pendingAddType === 'food' ? 'dinner' : 'afternoon';
  var modal = el('addToPlanModal');
  if (!modal) return;
  el('modalPlaceName').textContent = name || '';
  var customWrap = el('modalCustomWrap');
  if (customWrap) customWrap.style.display = name ? 'none' : '';
  var daySelect = el('modalDaySelect');
  if (daySelect && currentItineraryData) {
    daySelect.innerHTML = currentItineraryData.itinerary.map(function(d) { return '<option value="' + d.day + '">Day ' + d.day + '</option>'; }).join('');
    if (opts.day) daySelect.value = String(opts.day);
  }
  // Show/hide type buttons + slot buttons
  var destSlots = el('destSlots');
  var foodSlots = el('foodSlots');
  if (destSlots) destSlots.style.display = pendingAddType === 'food' ? 'none' : '';
  if (foodSlots) foodSlots.style.display = pendingAddType === 'food' ? '' : 'none';
  document.querySelectorAll('.type-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.type === pendingAddType); });
  modal.classList.remove('hidden');
}

function hideAddToPlanModal() {
  var modal = el('addToPlanModal');
  if (modal) modal.classList.add('hidden');
  pendingAddPlace = null;
}

function confirmAddToPlan() {
  if (!pendingAddPlace || !currentItineraryData) return;
  var dayNum = Number(el('modalDaySelect').value);
  var dayData = currentItineraryData.itinerary.find(function(d) { return d.day === dayNum; });
  if (!dayData) return;
  var destSlotMap = {
    morning: { period: '\uC624\uC804', start: '09:00', end: '11:00' },
    afternoon: { period: '\uC624\uD6C4', start: '13:00', end: '15:00' },
    allday: { period: '\uC885\uC77C', start: '09:00', end: '18:00' }
  };
  var foodSlotMap = {
    breakfast: { period: '\uC544\uCE68', start: '08:00', end: '09:30' },
    lunch: { period: '\uC810\uC2EC', start: '12:00', end: '13:30' },
    dinner: { period: '\uC800\uB141', start: '18:00', end: '20:00' }
  };
  var activeMap = pendingAddType === 'food' ? foodSlotMap : destSlotMap;
  var slot = activeMap[pendingAddSlot] || (pendingAddType === 'food' ? foodSlotMap.dinner : destSlotMap.afternoon);
  var customName = (el('modalCustomName') || {}).value || '';
  if (customName) pendingAddPlace.name = customName;
  if (!pendingAddPlace.name) { hideAddToPlanModal(); return; }
  var newBlock;
  if (pendingAddType === 'food') {
    var foodArea = pendingAddPlace.area || pendingAddPlace.city || '';
    newBlock = slot.period + '(' + slot.start + '-' + slot.end + '): ' + pendingAddPlace.name + (foodArea ? ' (' + foodArea + ')' : '');
  } else {
    var destArea = pendingAddPlace.area || pendingAddPlace.city || '';
    newBlock = slot.period + '(' + slot.start + '-' + slot.end + '): ' + pendingAddPlace.name + (destArea ? ' (' + destArea + ')' : '');
  }
  var periodOrder = { '\uC544\uCE68': -1, '\uC624\uC804': 0, '\uC810\uC2EC': 0.5, '\uC624\uD6C4': 1, '\uC885\uC77C': 1, '\uC800\uB141': 2 };
  var targetOrder = periodOrder[slot.period];
  var insertIdx = dayData.blocks.length;
  for (var i = 0; i < dayData.blocks.length; i++) {
    var p = parseItineraryBlock(dayData.blocks[i]);
    if (p.type === 'main' && (periodOrder[p.period] || 0) > targetOrder) {
      insertIdx = i;
      break;
    }
  }
  dayData.blocks.splice(insertIdx, 0, newBlock);
  renderItineraryTimeline();
  updateItinMap();
  hideAddToPlanModal();
}

function renderRecFoodCards(items) {
  var target = el('recFoodCards');
  if (!target) return;
  items = items || [];
  latestRecFoodList = items;
  if (items.length === 0) {
    target.innerHTML = '<div class="card empty-state" data-i18n="empty-rec-food-none">' + escapeHtml(t('empty-rec-food-none')) + '</div>';
    return;
  }
  target.innerHTML = items.map(function(x, index) {
    return '<article class="card" draggable="true" data-drag-type="food" data-drag-index="' + index + '">' +
      '<div class="card-layout">' +
        cardPhoto(x.photoUrl, x.name, x.photoCredit) +
        '<div class="card-body">' +
          '<h4>' + escapeHtml(x.name) + '</h4>' +
          '<div class="card-info-row">' + escapeHtml(x.genre || '') + ' \u00B7 ' + escapeHtml(x.area || '') + '</div>' +
          '<div class="card-scores">' + aiScoreBadge(x.aiFit) + starRating(x.score) + priceYen(x.priceLevel) + '</div>' +
        openStatusBadge(x) +
        photoCreditHtml(x.photoCredit, x.photoUrl) +
        '</div>' +
      '</div>' +
      '<span class="drag-hint">' + escapeHtml(t('drag-handle')) + '</span>' +
      '<div class="link-row"><a href="' + escapeHtml(safeLinkUrl(x.mapUrl) || '#') + '" target="_blank" rel="noreferrer">' + escapeHtml(t('map-link')) + '</a>' +
      '<button type="button" class="rec-delete-btn" data-delete-type="food" data-delete-index="' + index + '">\u2715</button></div>' +
    '</article>';
  }).join('');
}

function renderDestSearchCards(items) {
  var target = el('destSearchCards');
  if (!target) return;
  items = items || [];
  latestDestSearchList = items;
  if (items.length === 0) {
    target.innerHTML = '<div class="card">' + escapeHtml(t('no-results')) + '</div>';
    return;
  }
  target.innerHTML = items.map(function(x, index) {
    return '<article class="card">' +
      '<div class="card-layout">' +
        cardPhoto(x.photoUrl, x.name, x.photoCredit) +
        '<div class="card-body">' +
          '<h4>' + categoryIcon(x.category) + ' ' + escapeHtml(x.name) + '</h4>' +
          '<div class="card-info-row">' + escapeHtml(x.category || '') + ' · ' + escapeHtml(x.area || x.city || '') + '</div>' +
          '<div class="card-scores">' + aiScoreBadge(x.aiScore) + starRating(x.score) + '</div>' +
          photoCreditHtml(x.photoCredit, x.photoUrl) +
        '</div>' +
      '</div>' +
      '<div class="link-row">' +
        '<button type="button" class="add-to-plan-btn" data-add-type="dest" data-add-index="' + index + '" data-add-source="destSearch">' + escapeHtml(t('add-to-plan')) + '</button>' +
        '<button type="button" class="promote-to-rec-btn" data-promote-type="dest" data-promote-index="' + index + '" data-promote-source="destSearch">' + escapeHtml(t('promote-dest')) + '</button>' +
        '<a href="' + escapeHtml(safeLinkUrl(x.mapUrl) || '#') + '" target="_blank" rel="noreferrer">' + escapeHtml(t('map-link')) + '</a>' +
      '</div>' +
    '</article>';
  }).join('');
}

el('destCards')?.addEventListener('click', (event) => {
  const delBtn = event.target.closest('.rec-delete-btn');
  if (delBtn) {
    const idx = Number(delBtn.dataset.deleteIndex);
    if (!Number.isNaN(idx) && idx >= 0 && idx < latestDestList.length) {
      const removed = latestDestList[idx];

      latestDestList.splice(idx, 1);
      renderCards('destCards', latestDestList, 'dest');
      renderPlanSelectionCards();
    }
    return;
  }
  const btn = event.target.closest('.dest-select-btn');
  if (!btn) return;
  const index = Number(btn.dataset.destIndex);
  if (Number.isNaN(index)) return;
  toggleDestinationSelection(index);
});

el('recFoodCards')?.addEventListener('click', (event) => {
  const delBtn = event.target.closest('.rec-delete-btn');
  if (delBtn) {
    const idx = Number(delBtn.dataset.deleteIndex);
    if (!Number.isNaN(idx) && idx >= 0 && idx < latestRecFoodList.length) {
      latestRecFoodList.splice(idx, 1);
      renderRecFoodCards(latestRecFoodList);
    }
    return;
  }
});

const planRefreshButton = el('btnPlanRefresh');
if (planRefreshButton) {
  planRefreshButton.addEventListener('click', async () => {
    if (planBusyCount > 0) return;
    try {
      await runPlan({}, false, { trigger: 'btnPlanRefresh' });
    } catch (err) {
      el('planResult').textContent = friendlyError(err);
    }
  });
}

var foodSearchSeq = 0;

async function searchFoods() {
  var seq = ++foodSearchSeq;
  var cityKey = el('foodCity').value;
  setLoading('btnFood', true);
  try {
    const city = encodeURIComponent(cityKey);
    const genre = encodeURIComponent(el('foodGenre').value);
    const res = await fetch(`/api/foods?lang=${currentLang}&city=${city}&genre=${genre}&budget=mid`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (seq !== foodSearchSeq) return;
    const list = data.list || [];
    const info = sectionInfo('foodSearch', data);
    latestFoodSearchList = list;
    latestFoodList = list;
    renderCards('foodCards', list, 'food');
    renderSourceNote('foodSourceNote', 'foodSearch', info);
    // 일정 생성 후 추천 맛집이 비어 있으면 같은 도시의 맛집 목록으로 채워 준다.
    if (recFoodsNeedFill && list.length > 0 && cityKey === el('city').value) {
      recFoodsNeedFill = false;
      renderRecFoodCards(list.slice(0, 10).map(toRecFood));
      renderSourceNote('recFoodSourceNote', 'foods', info);
    }
  } catch (err) {
    if (seq !== foodSearchSeq) return;
    el('foodCards').innerHTML = '<div class="card">' + escapeHtml(friendlyError(err)) + '</div>';
  } finally {
    if (seq === foodSearchSeq) setLoading('btnFood', false);
  }
}

el('btnFood').addEventListener('click', () => { searchFoods(); });

var staySearchSeq = 0;
var lastStayFilterOptions = null; // 언어를 바꾸면 부대시설 체크 목록 글자를 다시 그린다

async function searchStays() {
  var seq = ++staySearchSeq;
  try {
    if (!el('checkIn').value) el('checkIn').value = el('startDate').value || defaultStartDate();
    ensureCheckOutDate();
    staySortMode = el('stayPreference').value || 'balanced';
    const payload = {
      city: el('stayCity').value,
      checkIn: el('checkIn').value,
      checkOut: el('checkOut').value,
      guests: Number(el('stayGuests').value || 2),
      rooms: Number(el('stayRooms').value || 1),
      preference: staySortMode,
      lang: currentLang,
      aiHints: {
        preferredAreas: aiPreferredAreas,
        preferAirportAccess: aiPreferAirportAccess,
        arrivalAirport: resolveAirportCode(el('to').value),
        oceanViewStay: Boolean(aiSpecialPrefs?.oceanViewStay),
        safeAreaPriority: Boolean(aiSpecialPrefs?.safeAreaPriority)
      },
      filters: {
        minPrice: Number(el('stayPriceMin').value || 0),
        maxPrice: Number(el('stayPriceMax').value || 9999999),
        minRating: Number(el('stayRatingMin').value || 0),
        stayType: el('stayType').value,
        providers: getCheckedValues('.stay-provider-check'),
        amenities: getCheckedValues('.stay-amenity-check')
      }
    };

    // 서버 API 호출 (Rakuten 실시간 → 없으면 예시 데이터)
    validateDates();
    setLoading('btnStays', true);
    showCardLoading('stayCards');
    var data = await postJson('/api/stays', payload);
    if (seq !== staySearchSeq) return;
    var info = sectionInfo('stays', data);
    var isMock = info && info.kind === 'mock';
    stayResults = (data.stays || []).map(function(s) { return Object.assign({}, s, { _mock: isMock }); });
    renderStayFilterChecks(data.filterOptions);
    renderStayCards();
    renderSourceNote('staySourceNote', 'stays', info);
    lastStayFilterOptions = data.filterOptions || null;
  } catch (err) {
    if (seq !== staySearchSeq) return;
    el('stayCards').innerHTML = '<div class="card">' + escapeHtml(friendlyError(err)) + '</div>';
  } finally {
    if (seq === staySearchSeq) setLoading('btnStays', false);
  }
}

el('btnStays').addEventListener('click', () => { searchStays(); });

el('stayCards').addEventListener('click', (event) => {
  const btn = event.target.closest('.stay-select-btn');
  if (!btn) return;
  selectStayById(btn.dataset.stayId);
});

el('checkIn').addEventListener('change', ensureCheckOutDate);
el('stayPreference').addEventListener('change', () => {
  staySortMode = el('stayPreference').value || 'balanced';
  renderStayCards();
});

// 여행 도시가 바뀌면(직접 선택이든 AI 채팅이든) 딸린 입력값과 위젯을 함께 맞춘다.
function syncCityDependents(cityKey) {
  if (!cityKey) return;
  ['foodCity', 'stayCity', 'destSearchCity'].forEach(function(id) {
    var select = el(id);
    if (select && Array.from(select.options).some(function(o) { return o.value === cityKey; })) select.value = cityKey;
  });
  var city = cityCatalog.find(function(c) { return c.key === cityKey; });
  if (city && city.airport) {
    el('to').value = formatAirportDisplay(city.airport);
    toAirportDirty = false;
  }
  if (currentTripType === 'multicity') resetSegments();
  loadKlookWidget(cityKey);
  // 화면에 떠 있는 날씨는 새 도시 기준으로 다시 불러온다(무료 API).
  var widget = el('weatherWidget');
  if (widget && !widget.classList.contains('hidden')) refreshInlineWeather(cityKey);
}

el('city').addEventListener('change', () => {
  syncCityDependents(el('city').value);
});


// ── Recommendation tab switching ──
document.querySelectorAll('.rec-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.rec-tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    var which = tab.dataset.recTab;
    var destPanel = el('recDestPanel');
    var foodPanel = el('recFoodPanel');
    if (destPanel) destPanel.style.display = which === 'dest' ? '' : 'none';
    if (foodPanel) foodPanel.style.display = which === 'food' ? '' : 'none';
  });
});

// ── Modal event handling ──
document.addEventListener('click', function(e) {
  if (e.target.id === 'modalConfirmAdd') { confirmAddToPlan(); return; }
  if (e.target.id === 'modalCancelAdd') { hideAddToPlanModal(); return; }

  var typeBtn = e.target.closest('.type-btn');
  if (typeBtn) {
    pendingAddType = typeBtn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.type === pendingAddType); });
    var destSlots = el('destSlots');
    var foodSlots = el('foodSlots');
    if (destSlots) destSlots.style.display = pendingAddType === 'food' ? 'none' : '';
    if (foodSlots) foodSlots.style.display = pendingAddType === 'food' ? '' : 'none';
    return;
  }

  var slotBtn = e.target.closest('.slot-btn');
  if (slotBtn) {
    pendingAddSlot = slotBtn.dataset.slot;
    slotBtn.closest('.plan-modal-slots').querySelectorAll('.slot-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.slot === pendingAddSlot); });
    return;
  }

  var removeBtn = e.target.closest('.itin-remove-btn');
  if (removeBtn && currentItineraryData) {
    var rDay = Number(removeBtn.dataset.day);
    var rPeriod = removeBtn.dataset.period;
    var dayData = currentItineraryData.itinerary.find(function(d) { return d.day === rDay; });
    if (dayData) {
      var rBlockIdx = removeBtn.dataset.blockIndex;
      if (rBlockIdx !== undefined && rBlockIdx !== '' && rBlockIdx !== '-1') {
        dayData.blocks.splice(Number(rBlockIdx), 1);
      } else {
        dayData.blocks = dayData.blocks.filter(function(b) {
          var p = parseItineraryBlock(b);
          return !(p.type === 'main' && p.period === rPeriod);
        });
      }
      renderItineraryTimeline();
      updateItinMap();
    }
    return;
  }

  var mealAddBtn = e.target.closest('.itin-meal-add-btn');
  if (mealAddBtn) {
    var mdn = Number(mealAddBtn.dataset.day);
    var mslot = mealAddBtn.dataset.mealSlot || 'dinner';
    showAddToPlanModal('', { day: mdn, addType: 'food' });
    el('modalDaySelect').value = String(mdn);
    pendingAddSlot = mslot;
    var foodSlotsEl = el('foodSlots');
    if (foodSlotsEl) foodSlotsEl.querySelectorAll('.slot-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.slot === mslot); });
    return;
  }

  // destsearch-to-rec-btn: add to rec list
  var dsearchBtn = e.target.closest('.destsearch-to-rec-btn');
  if (dsearchBtn) {
    var dsIdx = Number(dsearchBtn.dataset.dsearchIndex);
    var dest = (latestDestSearchList || [])[dsIdx];
    if (dest) {
      var isDup = latestDestList.some(function(d) { return d.name === dest.name; });
      if (!isDup) {
        latestDestList.push(dest);
        renderCards('destCards', latestDestList, 'dest');
      }
    }
    return;
  }

  // food-to-rec-btn: add to rec food list
  var foodRecBtn = e.target.closest('.food-to-rec-btn');
  if (foodRecBtn) {
    var fIdx = Number(foodRecBtn.dataset.foodIndex);
    var food = (latestFoodList || [])[fIdx];
    if (food) {
      var isFDup = latestRecFoodList.some(function(f) { return f.name === food.name; });
      if (!isFDup) {
        latestRecFoodList.push(food);
        renderRecFoodCards(latestRecFoodList);
      }
    }
    return;
  }
});

// ── Drag & Drop ──
document.addEventListener('dragstart', function(e) {
  var card = e.target.closest('[data-drag-type]');
  if (card) {
    var type = card.dataset.dragType;
    var index = Number(card.dataset.dragIndex);
    var item = type === 'dest' ? (latestDestList || [])[index] : (latestRecFoodList || [])[index];
    if (!item) return;
    dragData = { source: 'rec', type: type, item: item, index: index };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', item.name);
    card.classList.add('dragging');
    setTimeout(function() {
      document.querySelectorAll('.itin-drop-zone, .itin-day-body').forEach(function(z) { z.classList.add('drop-active'); });
    }, 0);
    return;
  }
  var slot = e.target.closest('[data-itin-day][data-itin-period]');
  if (slot) {
    var srcBlockIndex = slot.dataset.itinBlockIndex !== undefined ? Number(slot.dataset.itinBlockIndex) : -1;
    dragData = { source: 'itin', day: Number(slot.dataset.itinDay), period: slot.dataset.itinPeriod, blockIndex: srcBlockIndex };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'itin');
    slot.classList.add('dragging');
  }
});

document.addEventListener('dragend', function(e) {
  dragData = null;
  document.querySelectorAll('.dragging').forEach(function(el) { el.classList.remove('dragging'); });
  document.querySelectorAll('.drop-active').forEach(function(el) { el.classList.remove('drop-active'); });
  document.querySelectorAll('.drop-hover').forEach(function(el) { el.classList.remove('drop-hover'); });
});

document.addEventListener('dragover', function(e) {
  if (!dragData) return;
  var zone = e.target.closest('.itin-drop-zone, .itin-period-zone, .itin-meal-empty');
  if (zone) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragData.source === 'itin' ? 'move' : 'copy';
    zone.classList.add('drop-hover');
  }
});

document.addEventListener('dragleave', function(e) {
  var zone = e.target.closest('.itin-drop-zone, .itin-period-zone, .itin-meal-empty');
  if (zone && !zone.contains(e.relatedTarget)) {
    zone.classList.remove('drop-hover');
  }
});

document.addEventListener('drop', function(e) {
  if (!dragData) return;
  e.preventDefault();
  document.querySelectorAll('.drop-hover').forEach(function(el) { el.classList.remove('drop-hover'); });

  // Drop from itin: move to new zone or remove if dropped outside
  if (dragData.source === 'itin' && currentItineraryData) {
    var zone = e.target.closest('.itin-drop-zone, .itin-period-zone, .itin-meal-empty');
    var srcDayData = currentItineraryData.itinerary.find(function(d) { return d.day === dragData.day; });
    if (!srcDayData) return;

    // Find source block text
    var srcBlockText = null;
    var srcParsed = null;
    if (dragData.blockIndex >= 0 && srcDayData.blocks[dragData.blockIndex]) {
      srcBlockText = srcDayData.blocks[dragData.blockIndex];
      srcParsed = parseItineraryBlock(srcBlockText);
    } else {
      for (var sbi = 0; sbi < srcDayData.blocks.length; sbi++) {
        var sbp = parseItineraryBlock(srcDayData.blocks[sbi]);
        if (sbp.type === 'main' && sbp.period === dragData.period) { srcBlockText = srcDayData.blocks[sbi]; srcParsed = sbp; break; }
      }
    }

    if (!zone || !srcParsed || srcParsed.type !== 'main') {
      // Dropped outside = remove
      if (dragData.blockIndex >= 0) {
        srcDayData.blocks.splice(dragData.blockIndex, 1);
      } else {
        srcDayData.blocks = srcDayData.blocks.filter(function(b) {
          var p = parseItineraryBlock(b);
          return !(p.type === 'main' && p.period === dragData.period);
        });
      }
      renderItineraryTimeline();
      updateItinMap();
      return;
    }

    var dropDay = Number(zone.dataset.dropDay);
    var dropType = zone.dataset.dropType;
    var mealSlot = zone.dataset.dropMeal;
    var destPeriodKey = zone.dataset.dropDestPeriod;

    var targetSlot;
    if (dropType === 'food' || isMealPeriod(dragData.period)) {
      if (mealSlot === 'breakfast') targetSlot = { period: '아침', start: '08:00', end: '09:30' };
      else if (mealSlot === 'lunch') targetSlot = { period: '점심', start: '12:00', end: '13:30' };
      else targetSlot = { period: '저녁', start: '18:00', end: '20:00' };
    } else if (destPeriodKey === 'morning') {
      targetSlot = { period: '오전', start: '09:00', end: '12:00' };
    } else if (destPeriodKey === 'allday') {
      targetSlot = { period: '종일', start: '09:00', end: '18:00' };
    } else {
      targetSlot = { period: '오후', start: '13:00', end: '17:00' };
    }

    // Same day + same period = no-op
    if (dropDay === dragData.day && targetSlot.period === srcParsed.period) return;

    var newBlockText = targetSlot.period + '(' + targetSlot.start + '-' + targetSlot.end + '): ' + srcParsed.place;

    var tgtDayData = currentItineraryData.itinerary.find(function(d) { return d.day === dropDay; });
    if (!tgtDayData) return;

    // Check if target slot already has a meal (for swap)
    var existingTargetBlock = null;
    var existingTargetIdx = -1;
    var existingTargetParsed = null;
    if (isMealPeriod(srcParsed.period) || isMealPeriod(targetSlot.period)) {
      for (var eti = 0; eti < tgtDayData.blocks.length; eti++) {
        var etp = parseItineraryBlock(tgtDayData.blocks[eti]);
        if (etp.type === 'main' && etp.period === targetSlot.period) {
          existingTargetBlock = tgtDayData.blocks[eti];
          existingTargetIdx = eti;
          existingTargetParsed = etp;
          break;
        }
      }
    }

    // If both are meal periods and target has existing food -> SWAP
    if (existingTargetParsed && isMealPeriod(srcParsed.period) && isMealPeriod(targetSlot.period)) {
      // Build swap block: move target food to source's old period
      var swapBlock = srcParsed.period + '(' + srcParsed.start + '-' + srcParsed.end + '): ' + existingTargetParsed.place;

      // Replace source block with swapped food
      if (dragData.blockIndex >= 0 && srcDayData.blocks[dragData.blockIndex]) {
        srcDayData.blocks[dragData.blockIndex] = swapBlock;
      } else {
        for (var si = 0; si < srcDayData.blocks.length; si++) {
          var sp = parseItineraryBlock(srcDayData.blocks[si]);
          if (sp.type === 'main' && sp.period === srcParsed.period && sp.place === srcParsed.place) {
            srcDayData.blocks[si] = swapBlock;
            break;
          }
        }
      }
      // Replace target block with moved food
      tgtDayData.blocks[existingTargetIdx] = newBlockText;
      renderItineraryTimeline();
      updateItinMap();
      return;
    }

    // Remove from source (non-swap case)
    if (dragData.blockIndex >= 0) {
      srcDayData.blocks.splice(dragData.blockIndex, 1);
    } else {
      srcDayData.blocks = srcDayData.blocks.filter(function(b) {
        var p = parseItineraryBlock(b);
        return !(p.type === 'main' && p.period === dragData.period && p.place === srcParsed.place);
      });
    }

    // Insert into target day
    var periodOrder = { '아침': -1, '오전': 0, '점심': 0.5, '오후': 1, '종일': 1, '저녁': 2 };
    var targetOrder = periodOrder[targetSlot.period] || 1;
    var insertIdx = tgtDayData.blocks.length;
    for (var ii = 0; ii < tgtDayData.blocks.length; ii++) {
      var pp = parseItineraryBlock(tgtDayData.blocks[ii]);
      if (pp.type === 'main' && (periodOrder[pp.period] || 0) > targetOrder) { insertIdx = ii; break; }
    }
    tgtDayData.blocks.splice(insertIdx, 0, newBlockText);
    renderItineraryTimeline();
    updateItinMap();
    return;
  }

  // Drop from rec card
  if (dragData.source !== 'rec') return;
  var zone = e.target.closest('.itin-drop-zone, .itin-period-zone, .itin-meal-empty');
  if (!zone) return;

  var dropDay = Number(zone.dataset.dropDay);
  var dropType = zone.dataset.dropType;
  var mealSlot = zone.dataset.dropMeal;
  var type = dragData.type;
  var item = dragData.item;
  if (!item || !currentItineraryData) return;

  // Type guard: dest cards only into dest zones, food cards only into food zones
  if (type !== dropType) return;

  var dayData = currentItineraryData.itinerary.find(function(d) { return d.day === dropDay; });
  if (!dayData) return;

  var slot;
  var destPeriodKey = zone.dataset.dropDestPeriod;
  if (dropType === 'food' || type === 'food') {
    if (mealSlot === 'breakfast') slot = { period: '\uC544\uCE68', start: '08:00', end: '09:30' };
    else if (mealSlot === 'lunch') slot = { period: '\uC810\uC2EC', start: '12:00', end: '13:30' };
    else slot = { period: '\uC800\uB141', start: '18:00', end: '20:00' };
  } else if (destPeriodKey === 'morning') {
    slot = { period: '\uC624\uC804', start: '09:00', end: '12:00' };
  } else if (destPeriodKey === 'allday') {
    slot = { period: '\uC885\uC77C', start: '09:00', end: '18:00' };
  } else {
    slot = { period: '\uC624\uD6C4', start: '13:00', end: '17:00' };
  }

  var newBlock;
  if (type === 'food') {
    var foodArea = item.area || item.city || '';
    newBlock = slot.period + '(' + slot.start + '-' + slot.end + '): ' + item.name + (foodArea ? ' (' + foodArea + ')' : '');
  } else {
    var destArea = item.area || item.city || '';
    newBlock = slot.period + '(' + slot.start + '-' + slot.end + '): ' + item.name + (destArea ? ' (' + destArea + ')' : '');
  }


  // Time conflict detection
  var hasConflict = dayData.blocks.some(function(b) {
    var bp = parseItineraryBlock(b);
    if (bp.type !== 'main') return false;
    if (bp.startTime && bp.endTime && slot.start && slot.end) {
      return bp.startTime < slot.end && slot.start < bp.endTime && bp.period === slot.period;
    }
    return false;
  });
  if (hasConflict && type === 'dest') {
    if (!confirm(t('confirm-time-conflict') || 'This time slot already has an item. Add anyway?')) return;
  }

  // If dropping food into a meal slot, remove existing food in that slot
  if (type === 'food' && isMealPeriod(slot.period)) {
    dayData.blocks = dayData.blocks.filter(function(b) {
      var bp = parseItineraryBlock(b);
      return !(bp.type === 'main' && bp.period === slot.period);
    });
  }

  var periodOrder = { '\uC544\uCE68': -1, '\uC624\uC804': 0, '\uC810\uC2EC': 0.5, '\uC624\uD6C4': 1, '\uC885\uC77C': 1, '\uC800\uB141': 2 };
  var targetOrder = periodOrder[slot.period] || 1;
  var insertIdx = dayData.blocks.length;
  for (var i = 0; i < dayData.blocks.length; i++) {
    var p = parseItineraryBlock(dayData.blocks[i]);
    if (p.type === 'main' && (periodOrder[p.period] || 0) > targetOrder) {
      insertIdx = i;
      break;
    }
  }
  dayData.blocks.splice(insertIdx, 0, newBlock);
  renderItineraryTimeline();
  updateItinMap();
});

// ── Itinerary Map ──

// Route Cost
var routeCostCache = {};
function buildDayRouteOrder(dayNum) {
  if (!currentItineraryData) return [];
  var dayData = currentItineraryData.itinerary.find(function(d) { return d.day === dayNum; });
  if (!dayData || !dayData.blocks) return [];
  var places = [];
  var isFirstDay = (dayNum === 1);
  var totalDays = currentItineraryData.itinerary.length;
  var isLastDay = (dayNum === totalDays);
  // Day 1: start from airport, Last day: end at airport
  var airportName = '';
  if (selectedFlight && selectedFlight.legs && selectedFlight.legs[0]) {
    var arrAirport = selectedFlight.legs[0].to || '';
    var depAirport = selectedFlight.legs.length > 1 ? selectedFlight.legs[selectedFlight.legs.length - 1].from : arrAirport;
    if (isFirstDay) airportName = arrAirport + ' 공항';
    else if (isLastDay && selectedFlight.tripType === 'roundtrip') airportName = depAirport + ' 공항';
  }
  if (airportName && isFirstDay) {
    places.push(airportName);
  } else if (selectedStay) {
    places.push(selectedStay.name + (selectedStay.area ? ' ' + selectedStay.area : ''));
  }
  var po = ['아침','오전','점심','오후','종일','저녁'];
  for (var pi = 0; pi < po.length; pi++) {
    for (var bi = 0; bi < dayData.blocks.length; bi++) {
      var p = parseItineraryBlock(dayData.blocks[bi]);
      if (p.type === 'main' && p.period === po[pi]) {
        var info = parsePlaceInfo(p.place);
        if (isFreeTimePlace(info.name)) continue;
        places.push(info.name + (info.info ? ' ' + info.info : ''));
      }
    }
  }
  if (airportName && isLastDay) {
    places.push(airportName);
  } else if (selectedStay && places.length > 1) {
    places.push(selectedStay.name + (selectedStay.area ? ' ' + selectedStay.area : ''));
  }
  return places;
}
function modeLabel(mode) {
  var keys = { subway: 'transport-subway', rail: 'transport-train', bus: 'transport-bus', tram: 'transport-tram', transit: 'transport-transit', walking: 'transport-walk', estimated: 'transport-est', error: 'transport-err' };
  return keys[mode] ? t(keys[mode]) : String(mode || '');
}
async function calculateDayRouteCost(dayNum) {
  var resultEl = document.getElementById('routeCostDay' + dayNum);
  if (!resultEl) return;
  var places = buildDayRouteOrder(dayNum);
  if (places.length < 2) { resultEl.innerHTML = '<div class="route-cost-empty">' + escapeHtml(t('route-need-2')) + '</div>'; return; }
  resultEl.innerHTML = '<div class="route-cost-loading">' + escapeHtml(t('calculating')) + '</div>';
  try {
    var city = (el('city') && el('city').value) || 'tokyo';
    var resp = await fetch('/api/route-cost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ places: places, city: city, lang: currentLang }) });
    var data = await resp.json();
    if (!resp.ok || data.error || !Array.isArray(data.segments)) { resultEl.innerHTML = '<div class="route-cost-empty">' + escapeHtml(t('route-cost-fail')) + '</div>'; return; }
    var h = '<div class="route-cost-segments">';
    for (var i = 0; i < data.segments.length; i++) {
      var seg = data.segments[i];
      var fareText = seg.fareJPY > 0 ? '¥' + Number(seg.fareJPY).toLocaleString() + ' (~' + formatKRW(seg.fareKRW) + ')' : t('free-label');
      h += '<div class="route-cost-seg' + (seg.estimated ? ' route-cost-estimated' : '') + '">';
      h += '<span class="route-seg-mode">' + escapeHtml(modeLabel(seg.mode)) + '</span>';
      // 이름을 첫 단어로 자르지 않는다(en 'Tokyo Tower'가 'Tokyo'로 보이던 문제). 넘치면 CSS 말줄임, 전체는 title로.
      var routeText = String(seg.from || '') + ' → ' + String(seg.to || '');
      h += '<span class="route-seg-route" title="' + escapeHtml(routeText) + '">' + escapeHtml(routeText) + '</span>';
      h += '<span class="route-seg-detail">' + escapeHtml(seg.durationMin + t('min-suffix') + ' · ' + fareText) + '</span>';
      if (seg.tip) h += '<span class="route-seg-tip">' + escapeHtml(seg.tip) + '</span>';
      h += '</div>';
    }
    h += '</div><div class="route-cost-total">' + escapeHtml(t('total-fare') + Number(data.totalFareJPY || 0).toLocaleString() + ' (~' + formatKRW(data.totalFareKRW) + ')' + t('route-move') + data.totalDurationMin + t('min-suffix')) + '</div>';
    if (data.routeTip) h += '<div class="route-cost-tip">' + escapeHtml(data.routeTip) + '</div>';
    var routeSourceLabel = data.source === 'ai' ? t('source-ai-calc') : data.source === 'distance_estimate' ? t('source-dist-est') : data.source === 'directions_api' ? t('source-google-route') : t('source-estimate');
    h += '<div class="route-cost-source">' + escapeHtml(routeSourceLabel) + '</div>';
    resultEl.innerHTML = h;
    routeCostCache[dayNum] = data;
  } catch (err) { resultEl.innerHTML = '<div class="route-cost-empty">' + escapeHtml(t('route-cost-fail')) + '</div>'; }
}
document.addEventListener('click', function(e) {
  var routeBtn = e.target.closest('.itin-route-cost-btn');
  if (routeBtn) { calculateDayRouteCost(Number(routeBtn.dataset.routeDay)); }
  var reorderBtn = e.target.closest('.itin-reorder-btn');
  if (reorderBtn && currentItineraryData) {
    var roDay = Number(reorderBtn.dataset.day);
    var roIdx = Number(reorderBtn.dataset.blockIndex);
    var roDir = reorderBtn.dataset.direction;
    var roDayData = currentItineraryData.itinerary.find(function(d) { return d.day === roDay; });
    if (roDayData && roDayData.blocks) {
      var roParsed = parseItineraryBlock(roDayData.blocks[roIdx]);
      var swapIdx = -1;
      if (roDir === 'up') { for (var ri = roIdx - 1; ri >= 0; ri--) { var rp = parseItineraryBlock(roDayData.blocks[ri]); if (rp.type === 'main' && rp.period === roParsed.period) { swapIdx = ri; break; } } }
      else { for (var ri2 = roIdx + 1; ri2 < roDayData.blocks.length; ri2++) { var rp2 = parseItineraryBlock(roDayData.blocks[ri2]); if (rp2.type === 'main' && rp2.period === roParsed.period) { swapIdx = ri2; break; } } }
      if (swapIdx >= 0) { var tmp = roDayData.blocks[roIdx]; roDayData.blocks[roIdx] = roDayData.blocks[swapIdx]; roDayData.blocks[swapIdx] = tmp; renderItineraryTimeline(); updateItinMap(); }
    }
  }
});

var DAY_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#10b981'];

// ── 일정 지도 ──
// 기본은 OpenStreetMap + Leaflet(무료, 키·요금 없음). 서버가 MAP_PROVIDER=google 이면 Google 지도 JS를 쓴다.
// 지도 라이브러리는 일정이 처음 생길 때 불러오고, 늦게 도착해도 준비되는 즉시 다시 그린다.
var LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
var LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
var LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
var LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
var OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
var OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
var GOOGLE_GEOCODE_LIMIT = 15; // Google 모드에서 좌표 없는 장소를 한 번에 최대 몇 곳까지 지오코딩할지(유료)

var mapConfig = null;          // { provider: 'osm' } | { provider: 'google', key }
var mapConfigPromise = null;
var mapLibState = 'idle';      // idle | loading | ready | failed
var mapRenderSeq = 0;
var itinLeafletMap = null;
var itinLeafletLayer = null;
var itinPolylines = [];
var itinGeoFailed = {};
var googleGeocodeBlocked = false;

function loadMapConfig() {
  if (!mapConfigPromise) {
    mapConfigPromise = fetch('/api/maps-config')
      .then(function(r) { return r.ok ? r.json() : {}; })
      .catch(function() { return {}; })
      .then(function(cfg) {
        cfg = cfg || {};
        // provider가 없는 예전 서버 응답은 key 유무로 판단한다.
        var provider = String(cfg.provider || (cfg.key ? 'google' : 'osm')).toLowerCase();
        mapConfig = (provider === 'google' && cfg.key) ? { provider: 'google', key: String(cfg.key) } : { provider: 'osm' };
        return mapConfig;
      });
  }
  return mapConfigPromise;
}

function onMapLibraryLoaded(ok) {
  mapLibState = ok ? 'ready' : 'failed';
  if (currentItineraryData) updateItinMap();
}

function ensureMapLibrary() {
  if (mapLibState !== 'idle' || !mapConfig) return;
  mapLibState = 'loading';
  if (mapConfig.provider === 'google') {
    window.__itinMapsReady = function() { onMapLibraryLoaded(typeof google !== 'undefined' && !!google.maps); };
    window.gm_authFailure = function() { onMapLibraryLoaded(false); };
    var gs = document.createElement('script');
    gs.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(mapConfig.key) +
      '&language=' + encodeURIComponent(currentLang || 'ko') + '&region=jp&callback=__itinMapsReady';
    gs.async = true;
    gs.onerror = function() { onMapLibraryLoaded(false); };
    document.head.appendChild(gs);
    return;
  }
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = LEAFLET_CSS_URL;
  css.integrity = LEAFLET_CSS_SRI;
  css.crossOrigin = '';
  document.head.appendChild(css);
  var s = document.createElement('script');
  s.src = LEAFLET_JS_URL;
  s.integrity = LEAFLET_JS_SRI;
  s.crossOrigin = '';
  s.async = true;
  s.onload = function() { onMapLibraryLoaded(typeof window.L !== 'undefined'); };
  s.onerror = function() { onMapLibraryLoaded(false); };
  document.head.appendChild(s);
}

function placeKey(name) {
  return String(name || '').toLowerCase().replace(/[\s()（）・·]/g, '');
}

// 장소 이름 → 좌표 색인. 서버가 준 일정 좌표, 추천/맛집 카드 좌표, 이전 지오코딩 결과를 모두 쓴다.
function buildCoordIndex() {
  var idx = {};
  var add = function(name, lat, lng) {
    if (!name || lat == null || lng == null || lat === '' || lng === '') return;
    var la = Number(lat);
    var ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return;
    var k = placeKey(name);
    if (k && !idx[k]) idx[k] = { lat: la, lng: ln };
  };
  var addItem = function(item) { if (item) add(item.name || item.place || item.title, item.lat, item.lng); };
  var data = currentItineraryData || {};
  (data.itinerary || []).forEach(function(day) {
    ['places', 'points', 'coords', 'items', 'locations'].forEach(function(f) {
      if (day && Array.isArray(day[f])) day[f].forEach(addItem);
    });
  });
  var pc = data.placeCoords;
  if (Array.isArray(pc)) pc.forEach(addItem);
  else if (pc && typeof pc === 'object') Object.keys(pc).forEach(function(n) { if (pc[n]) add(n, pc[n].lat, pc[n].lng); });
  [latestDestList, latestRecFoodList, latestDestSearchList, latestFoodSearchList, latestFoodList].forEach(function(list) {
    (list || []).forEach(addItem);
  });
  Object.keys(itinGeoCache).forEach(function(n) { add(n, itinGeoCache[n].lat, itinGeoCache[n].lng); });
  return idx;
}

function lookupCoord(idx, name) {
  var k = placeKey(name);
  if (!k) return null;
  if (idx[k]) return idx[k];
  if (k.length < 3) return null;
  // "센소지" ↔ "아사쿠사 센소지"처럼 이름 일부만 같은 경우
  var keys = Object.keys(idx);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].length >= 3 && (keys[i].indexOf(k) >= 0 || k.indexOf(keys[i]) >= 0)) return idx[keys[i]];
  }
  return null;
}

function collectItineraryPoints() {
  var idx = buildCoordIndex();
  var points = [];
  (currentItineraryData.itinerary || []).forEach(function(day) {
    (day.blocks || []).forEach(function(block) {
      var parsed = parseItineraryBlock(block);
      if (parsed.type !== 'main') return;
      var name = parsePlaceInfo(parsed.place).name;
      if (!name || isFreeTimePlace(name)) return;
      points.push({ name: name, day: day.day, period: parsed.period, isMeal: isMealPeriod(parsed.period), pos: lookupCoord(idx, name) });
    });
  });
  return points;
}

function setItinMapNote(text) {
  var note = el('itinMapNote');
  if (!note) return;
  note.textContent = text || '';
  note.classList.toggle('hidden', !text);
}

function markerTitle(p) {
  return t('day-prefix') + p.day + ' ' + tPeriod(p.period) + ': ' + p.name;
}

async function updateItinMap() {
  var wrap = el('itinMapWrap');
  var mapEl = el('itinMap');
  if (!wrap || !mapEl) return;
  var seq = ++mapRenderSeq;
  if (!currentItineraryData || !itineraryHasContent(currentItineraryData.itinerary)) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  if (!mapConfig) await loadMapConfig();
  if (seq !== mapRenderSeq) return;

  var points = collectItineraryPoints();
  var useGoogle = mapConfig.provider === 'google';
  var located = points.filter(function(p) { return p.pos; });
  if (!useGoogle && located.length === 0) {
    mapEl.classList.add('hidden');
    setItinMapNote(t('map-no-coords'));
    return;
  }
  ensureMapLibrary();
  if (mapLibState !== 'ready') {
    mapEl.classList.add('hidden');
    setItinMapNote(t(mapLibState === 'failed' ? 'map-failed' : 'map-loading'));
    return;
  }
  mapEl.classList.remove('hidden');
  var drawn = 0;
  try {
    drawn = useGoogle ? await renderGoogleItinMap(mapEl, points, seq) : renderLeafletItinMap(mapEl, located);
  } catch (err) {
    console.warn('[map] render failed:', err && err.message);
    mapEl.classList.add('hidden');
    setItinMapNote(t('map-failed'));
    return;
  }
  if (drawn < 0 || seq !== mapRenderSeq) return;
  if (drawn === 0) {
    mapEl.classList.add('hidden');
    setItinMapNote(t('map-no-coords'));
    return;
  }
  var missing = points.length - drawn;
  setItinMapNote(missing > 0 ? t('map-partial').replace('{n}', String(missing)) : '');
}

function renderLeafletItinMap(mapEl, points) {
  var L = window.L;
  if (!itinLeafletMap) {
    itinLeafletMap = L.map(mapEl, { scrollWheelZoom: false });
    L.tileLayer(OSM_TILE_URL, { subdomains: 'abc', maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(itinLeafletMap);
    itinLeafletLayer = L.layerGroup().addTo(itinLeafletMap);
  }
  itinLeafletLayer.clearLayers();
  itinLeafletMap.invalidateSize();
  var latlngs = [];
  var byDay = {};
  var labelIdx = 0;
  points.forEach(function(p) {
    labelIdx++;
    var color = p.isMeal ? '#f97316' : DAY_COLORS[(p.day - 1) % DAY_COLORS.length];
    var size = p.isMeal ? 22 : 26;
    var html = '<span style="display:flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + color +
      ';color:#fff;border:2px solid #fff;box-sizing:border-box;font:700 11px/1 sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.35)">' + (p.isMeal ? '' : labelIdx) + '</span>';
    var icon = L.divIcon({ className: 'itin-map-marker', html: html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    var title = markerTitle(p);
    L.marker([p.pos.lat, p.pos.lng], { icon: icon, title: title, alt: title }).bindPopup(escapeHtml(title)).addTo(itinLeafletLayer);
    latlngs.push([p.pos.lat, p.pos.lng]);
    (byDay[p.day] = byDay[p.day] || []).push([p.pos.lat, p.pos.lng]);
  });
  Object.keys(byDay).forEach(function(d) {
    if (byDay[d].length < 2) return;
    L.polyline(byDay[d], { color: DAY_COLORS[(Number(d) - 1) % DAY_COLORS.length], weight: 3, opacity: 0.7 }).addTo(itinLeafletLayer);
  });
  if (latlngs.length === 1) itinLeafletMap.setView(latlngs[0], 14);
  else if (latlngs.length > 1) itinLeafletMap.fitBounds(latlngs, { padding: [28, 28], maxZoom: 15 });
  return latlngs.length;
}

function geocodeWithGoogle(name) {
  return new Promise(function(resolve, reject) {
    new google.maps.Geocoder().geocode({ address: name + ' Japan' }, function(results, status) {
      if (status === 'OK' && results[0]) resolve(results[0].geometry.location);
      else reject(status);
    });
  });
}

async function renderGoogleItinMap(mapEl, points, seq) {
  // 좌표를 모르는 장소만, 한 번에 제한된 수만큼 지오코딩한다(유료 호출).
  var budget = GOOGLE_GEOCODE_LIMIT;
  for (var gi = 0; gi < points.length; gi++) {
    var gp = points[gi];
    if (gp.pos) continue;
    if (itinGeoCache[gp.name]) { gp.pos = itinGeoCache[gp.name]; continue; }
    if (googleGeocodeBlocked || itinGeoFailed[gp.name] || budget <= 0) continue;
    budget--;
    try {
      var loc = await geocodeWithGoogle(gp.name);
      gp.pos = { lat: loc.lat(), lng: loc.lng() };
      itinGeoCache[gp.name] = gp.pos;
    } catch (status) {
      itinGeoFailed[gp.name] = true;
      if (status === 'REQUEST_DENIED' || status === 'OVER_QUERY_LIMIT' || status === 'OVER_DAILY_LIMIT') googleGeocodeBlocked = true;
    }
  }
  if (seq !== mapRenderSeq) return -1;

  if (!itinMap) {
    itinMap = new google.maps.Map(mapEl, { zoom: 12, center: { lat: 35.68, lng: 139.76 }, mapTypeControl: false });
  }
  for (var mi = 0; mi < itinMarkers.length; mi++) itinMarkers[mi].setMap(null);
  itinMarkers = [];
  for (var li = 0; li < itinPolylines.length; li++) itinPolylines[li].setMap(null);
  itinPolylines = [];

  var bounds = new google.maps.LatLngBounds();
  var byDay = {};
  var labelIdx = 0;
  for (var pi = 0; pi < points.length; pi++) {
    var p = points[pi];
    if (!p.pos) continue;
    bounds.extend(p.pos);
    labelIdx++;
    var markerColor = p.isMeal ? '#f97316' : DAY_COLORS[(p.day - 1) % DAY_COLORS.length];
    itinMarkers.push(new google.maps.Marker({
      position: p.pos,
      map: itinMap,
      title: markerTitle(p),
      label: { text: p.isMeal ? '' : String(labelIdx), color: '#fff', fontWeight: '700', fontSize: '11px' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: markerColor,
        fillOpacity: 0.9,
        strokeColor: '#fff',
        strokeWeight: 2,
        scale: p.isMeal ? 14 : 16
      }
    }));
    (byDay[p.day] = byDay[p.day] || []).push(p.pos);
  }
  Object.keys(byDay).forEach(function(d) {
    if (byDay[d].length < 2) return;
    itinPolylines.push(new google.maps.Polyline({
      path: byDay[d],
      geodesic: true,
      strokeColor: DAY_COLORS[(Number(d) - 1) % DAY_COLORS.length],
      strokeOpacity: 0.7,
      strokeWeight: 3,
      map: itinMap
    }));
  });
  if (itinMarkers.length > 0) itinMap.fitBounds(bounds);
  return itinMarkers.length;
}

// ── Dest search handler ──
var destSearchSeq = 0;

async function searchDestinations() {
  var seq = ++destSearchSeq;
  setLoading('btnDestSearch', true);
  try {
    var payload = {
      city: el('destSearchCity').value,
      theme: el('destSearchTheme').value,
      budget: 'mid',
      limit: 10,
      lang: currentLang
    };
    var data = await postJson('/api/dest-search', payload);
    if (seq !== destSearchSeq) return;
    renderDestSearchCards(data.destinations || []);
    renderSourceNote('destSearchSourceNote', 'destSearch', sectionInfo('destSearch', data));
  } catch (err) {
    if (seq !== destSearchSeq) return;
    var cards = el('destSearchCards');
    if (cards) cards.innerHTML = '<div class="card">' + escapeHtml(friendlyError(err)) + '</div>';
  } finally {
    if (seq === destSearchSeq) setLoading('btnDestSearch', false);
  }
}

if (el('btnDestSearch')) {
  el('btnDestSearch').addEventListener('click', function() { searchDestinations(); });
}

// ── Food cards store ref ──
var _origRenderCards = renderCards;
// Patch renderCards to store food list
var _patchedRenderCards = false;



// Add-to-plan button handler (search cards)
document.addEventListener('click', function(e) {
  var addBtn = e.target.closest('.add-to-plan-btn');
  if (addBtn) {
    var addType = addBtn.dataset.addType || 'dest';
    var addIdx = Number(addBtn.dataset.addIndex);
    var addSource = addBtn.dataset.addSource;
    var place = null;
    if (addSource === 'foodSearch') place = (latestFoodSearchList || latestFoodList || [])[addIdx];
    else if (addSource === 'destSearch') place = (latestDestSearchList || [])[addIdx];
    if (place && currentItineraryData) {
      showAddToPlanModal(place.name, { addType: addType, area: place.area || place.city || '' });
    } else if (place) {
      alert(t('err-need-plan-first'));
    }
  }
});


// Promote to recommended list handler
document.addEventListener('click', function(e) {
  var promBtn = e.target.closest('.promote-to-rec-btn');
  if (!promBtn) return;
  e.preventDefault();
  e.stopPropagation();
  var pType = promBtn.dataset.promoteType;
  var pIdx = Number(promBtn.dataset.promoteIndex);
  var pSource = promBtn.dataset.promoteSource;
  console.log('[promote] type:', pType, 'idx:', pIdx, 'source:', pSource, 'listLen:', (latestDestSearchList||[]).length);
  var item = null;
  if (pSource === 'destSearch') item = (latestDestSearchList || [])[pIdx];
  else if (pSource === 'foodSearch') item = (latestFoodSearchList || latestFoodList || [])[pIdx];
  if (!item) { console.warn('[promote] item not found at index', pIdx); return; }

  if (pType === 'dest') {
    if (!latestDestList) latestDestList = [];
    var exists = latestDestList.find(function(d) { return d.name === item.name; });
    if (!exists) {
      latestDestList.push(item);
      renderCards('destCards', latestDestList, 'dest');
      promBtn.textContent = t('promote-added');
    } else {
      promBtn.textContent = t('promote-exists');
      setTimeout(function() { promBtn.textContent = t('promote-dest'); }, 1500);
    }
  } else if (pType === 'food') {
    if (!latestRecFoodList) latestRecFoodList = [];
    var existsF = latestRecFoodList.find(function(d) { return d.name === item.name; });
    if (!existsF) {
      latestRecFoodList.push(item);
      renderRecFoodCards(latestRecFoodList);
      promBtn.textContent = t('promote-added');
    } else {
      promBtn.textContent = t('promote-exists');
      setTimeout(function() { promBtn.textContent = t('promote-food'); }, 1500);
    }
  }
});

// Search tab switching
document.querySelectorAll('.search-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.search-tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    var target = tab.dataset.searchTab;
    var destPanel = el('searchDestPanel');
    var foodPanel = el('searchFoodPanel');
    if (destPanel) destPanel.style.display = target === 'dest' ? '' : 'none';
    if (foodPanel) foodPanel.style.display = target === 'food' ? '' : 'none';
  });
});

// Manual flight input
if (el('btnManualFlight')) {
  el('btnManualFlight').addEventListener('click', function() {
    var airline = (el('manualFlightAirline').value || '').trim();
    var flightNum = (el('manualFlightNumber').value || '').trim();
    var departTime = el('manualFlightDepartTime').value || '09:00';
    var returnDepartTime = el('manualFlightArriveTime').value || '14:00';
    var price = Number(el('manualFlightPrice').value) || 0;
    if (!airline && !flightNum) { alert(t('err-airline-required')); return; }
    var fromAirport = el('from') ? el('from').value.split(' ')[0] : 'ICN';
    var toAirport = el('to') ? el('to').value.split(' ')[0] : 'NRT';
    var departDate = el('departDate') ? el('departDate').value : '';
    var returnDate = el('returnDate') ? el('returnDate').value : '';
    // Estimate arrival = departure + 2.5h (typical short-haul)
    function estimateArrival(timeStr) {
      var p = timeStr.split(':'); var h = Number(p[0]) || 0; var m = Number(p[1]) || 0;
      m += 150; h += Math.floor(m / 60); m = m % 60; h = h % 24;
      return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    }
    var outboundArrival = estimateArrival(departTime);
    var returnArrival = estimateArrival(returnDepartTime);
    var manualFlight = {
      _id: 'manual_' + Date.now(),
      provider: airline || t('manual-input'),
      airlines: [airline || t('manual-input')],
      legs: [{ from: fromAirport, to: toAirport, date: departDate, departureTime: departTime, arrivalTime: outboundArrival, airline: airline, flightNumber: flightNum }],
      tripType: returnDate ? 'roundtrip' : 'oneway',
      totalPriceKRW: price, totalDurationMin: 150, totalStops: 0, manual: true
    };
    if (returnDate) manualFlight.legs.push({ from: toAirport, to: fromAirport, date: returnDate, departureTime: returnDepartTime, arrivalTime: returnArrival, airline: airline, flightNumber: '' });
    flightResults.unshift(manualFlight);
    selectedFlightId = manualFlight._id;
    selectedFlight = manualFlight;
    renderFlightCards(true);
    renderPlanExtras();
    renderBudgetSummary();
    renderItineraryTimeline();
    // Regenerate itinerary with new flight info
    try { runPlan({ flight: buildFlightPayload(manualFlight) }, false, { trigger: 'btnPlanRefresh' }); } catch(e) {}
    el('manualFlightAirline').value = '';
    el('manualFlightNumber').value = '';
    el('manualFlightPrice').value = '';
  });
}

// Manual stay input
if (el('btnManualStay')) {
  el('btnManualStay').addEventListener('click', function() {
    var name = (el('manualStayName').value || '').trim();
    var area = (el('manualStayArea').value || '').trim();
    var pricePerNight = Number(el('manualStayPrice').value) || 0;
    var rating = Number(el('manualStayRating').value) || 0;
    var stayType = el('manualStayType') ? el('manualStayType').value : 'hotel';
    var url = (el('manualStayUrl').value || '').trim();
    if (!name) { alert(t('err-stay-required')); return; }
    var checkIn = el('checkIn') ? el('checkIn').value : '';
    var checkOut = el('checkOut') ? el('checkOut').value : '';
    var nights = 1;
    if (checkIn && checkOut) { var d1 = new Date(checkIn), d2 = new Date(checkOut); nights = Math.max(1, Math.round((d2 - d1) / 86400000)); }
    var manualStay = {
      id: 'manual_stay_' + Date.now(), name: name, area: area, type: stayType,
      pricePerNightKRW: pricePerNight, totalPriceKRW: pricePerNight * nights, totalKRW: pricePerNight * nights,
      nights: nights, rating: rating, checkIn: checkIn, checkOut: checkOut, url: url || '',
      provider: t('manual-input'), manual: true
    };
    stayResults.unshift(manualStay);
    selectedStayId = manualStay.id;
    selectedStay = manualStay;
    renderStayCards();
    renderPlanExtras();
    renderBudgetSummary();
    renderItineraryTimeline();
    // Regenerate itinerary with new stay info
    try { runPlan({}, false, { trigger: 'btnPlanRefresh' }); } catch(e) {}
    ['manualStayName','manualStayArea','manualStayPrice','manualStayRating','manualStayUrl'].forEach(function(id) { el(id).value = ''; });
  });
}

// Date validation
if (el('returnDate')) {
  el('returnDate').addEventListener('change', function() {
    var dep = el('departDate') ? el('departDate').value : '';
    var ret = this.value;
    if (dep && ret && ret < dep) {
      alert(t('err-return-date'));
      this.value = dep;
    }
  });
}
if (el('checkOut')) {
  el('checkOut').addEventListener('change', function() {
    var ci = el('checkIn') ? el('checkIn').value : '';
    var co = this.value;
    if (ci && co && co <= ci) {
      alert(t('err-checkout-date'));
      this.value = addDays(ci, 1) || ci;
    }
  });
}

// -- Undo/Redo button bindings --
if (el('btnItinUndo')) el('btnItinUndo').addEventListener('click', function() { undoItinerary(); });
if (el('btnItinRedo')) el('btnItinRedo').addEventListener('click', function() { redoItinerary(); });

// -- Undo/Redo keyboard shortcuts --
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT' || document.activeElement.isContentEditable)) return;
    e.preventDefault();
    undoItinerary();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT' || document.activeElement.isContentEditable)) return;
    e.preventDefault();
    redoItinerary();
  }
});

// 처음 화면에는 빈 상태 안내만 보여준다. 유료 API(일정 생성·항공·숙소·맛집·여행지 검색)는
// 사용자가 버튼을 누를 때만 호출한다.
function renderInitialEmptyStates() {
  var emptyCard = function(key) { return '<div class="card empty-state" data-i18n="' + key + '">' + escapeHtml(t(key)) + '</div>'; };
  if (el('destCards')) el('destCards').innerHTML = emptyCard('empty-dest');
  if (el('recFoodCards')) el('recFoodCards').innerHTML = emptyCard('empty-rec-food');
  if (el('planResult')) el('planResult').innerHTML = '<div class="itin-summary empty-state" data-i18n="empty-plan">' + escapeHtml(t('empty-plan')) + '</div>';
  if (el('flightCards')) el('flightCards').innerHTML = emptyCard('empty-flights');
  if (el('stayCards')) el('stayCards').innerHTML = emptyCard('empty-stays');
  if (el('destSearchCards')) el('destSearchCards').innerHTML = emptyCard('empty-search');
  if (el('foodCards')) el('foodCards').innerHTML = emptyCard('empty-search');
}

// 사전 값이 아직 없으면(부팅 직후) null
function brandText(key) {
  var v = t(key);
  return v && v !== key ? v : null;
}

// 문서·내보내기·인쇄·공유에 쓰는 제목. 예: "Tabimaru — AI 일본 여행 플래너"
function brandTitle() {
  var sub = brandText('brand-subtitle');
  return sub ? BRAND_NAME + ' — ' + sub : BRAND_NAME;
}

function shareTitle() {
  return BRAND_NAME + ' ' + t('share-title');
}

function applyBrand() {
  document.querySelectorAll('[data-brand]').forEach(function(node) { node.textContent = BRAND_NAME; });
  // 사전이 준비되기 전에는 index.html의 기본 제목·설명을 그대로 둔다.
  if (!brandText('brand-subtitle')) return;
  document.title = brandTitle();
  var desc = document.querySelector('meta[name="description"]');
  var descText = brandText('meta-description');
  if (desc && descText) desc.setAttribute('content', descText);
}

(async () => {
  applyBrand();
  // await 이후에 실행되는 코드는 파일 끝의 언어 사전(I18N)이 준비된 뒤에 돈다.
  await initCityOptions();
  applyBrand();
  renderInitialEmptyStates();
  appendAiChatIntro();
  el('from').value = formatAirportDisplay(resolveAirportCode(el('from').value));
  var initialCity = cityCatalog.find((c) => c.key === el('city').value);
  if (initialCity && initialCity.airport && !el('to').value) el('to').value = formatAirportDisplay(initialCity.airport);
  setTripTab('oneway');
  resetSegments();
  ensureCheckOutDate();
  loadKlookWidget(el('city').value || 'tokyo');
  loadMapConfig();          // 무료 설정 조회(지도 라이브러리는 일정이 생길 때 불러옴)
  initExchangeRateChip();   // 무료 환율 조회
})();


// ========== TRAVEL FEATURES v2 ==========

// --- Side Panel Toggle ---
function togglePanel(panelId) {
  var panel = document.getElementById(panelId);
  if (!panel) return;
  var isOpen = panel.classList.contains('show');
  // Close all open panels
  document.querySelectorAll('.side-panel.show').forEach(function(p) { p.classList.remove('show'); });
  var oldBackdrop = document.querySelector('.side-panel-backdrop');
  if (oldBackdrop) oldBackdrop.remove();
  if (!isOpen) {
    panel.classList.remove('hidden');
    panel.classList.add('show');
    var backdrop = document.createElement('div');
    backdrop.className = 'side-panel-backdrop';
    backdrop.addEventListener('click', function() { togglePanel(panelId); });
    document.body.appendChild(backdrop);
  }
}
// Use event delegation for close buttons (panels are after <script> in DOM)
document.addEventListener('click', function(e) {
  var closeBtn = e.target.closest('.side-panel-close');
  if (closeBtn && closeBtn.dataset.closePanel) {
    togglePanel(closeBtn.dataset.closePanel);
  }
});

// --- 1. CHECKLIST ---
var CHECKLIST_DATA = [
  { group: '\uC5EC\uAD8C/\uBE44\uC790', items: [
    '\uC5EC\uAD8C \uC720\uD6A8\uAE30\uAC04 \uD655\uC778 (6\uAC1C\uC6D4 \uC774\uC0C1)',
    '\uC5EC\uAD8C \uC0AC\uBCF8 \uBCF4\uAD00 (\uBCC4\uB3C4 \uBCF4\uAD00)',
    '\uBE44\uC790 \uBA74\uC81C \uD655\uC778 (90\uC77C \uBB34\uBE44\uC790)',
    'Visit Japan Web \uB4F1\uB85D (\uC785\uAD6D\uC2EC\uC0AC \uAC04\uC18C\uD654)'
  ]},
  { group: '\uD56D\uACF5/\uAD50\uD1B5', items: [
    '\uD56D\uACF5\uAD8C \uC608\uC57D \uD655\uC778',
    '\uBAA8\uBC14\uC77C \uD0D1\uC2B9\uAD8C \uC800\uC7A5',
    '\uACF5\uD56D \uAD50\uD1B5\uD3B8 \uD655\uC778 (\uB9AC\uBB34\uC9C4/\uACF5\uD56D\uBC84\uC2A4)',
    'IC\uCE74\uB4DC \uC900\uBE44 (Suica/ICOCA/Pasmo)',
    'JR Pass \uD544\uC694 \uC5EC\uBD80 \uD655\uC778'
  ]},
  { group: '\uC219\uC18C', items: [
    '\uC219\uC18C \uC608\uC57D \uD655\uC778\uC11C \uC800\uC7A5',
    '\uCCB4\uD06C\uC778/\uCCB4\uD06C\uC544\uC6C3 \uC2DC\uAC04 \uD655\uC778',
    '\uC219\uC18C \uC8FC\uC18C \uC77C\uBCF8\uC5B4 \uC800\uC7A5 (\uD0DD\uC2DC\uC6A9)'
  ]},
  { group: '\uD1B5\uC2E0/\uC7AC\uC815', items: [
    '\uD3EC\uCF13 WiFi / \uC720\uC2EC \uC608\uC57D',
    '\uD574\uC678 \uB85C\uBC0D \uD65C\uC131\uD654',
    '\uD658\uC804 (10\uB9CC\uC6D0 \uBD84 \uC5D4\uD654 \uC900\uBE44)',
    '\uD574\uC678\uACB0\uC81C \uCE74\uB4DC \uD655\uC778',
    '\uD574\uC678\uC5EC\uD589\uC790\uBCF4\uD5D8 \uAC00\uC785'
  ]},
  { group: '\uC9D0/\uD544\uC218\uD488', items: [
    '\uC5EC\uD589\uC6A9 \uC5B4\uB311\uD130 (\uC77C\uBCF8 100V/A\uD0C0\uC785)',
    '\uC0C1\uBE44\uC57D (\uC9C4\uD1B5\uC81C/\uC18C\uD654\uC81C/\uBC18\uCC3D\uACE0 \uB4F1)',
    '\uC6B0\uC0B0/\uC6B0\uBE44 (3\uC6D4~6\uC6D4 \uD544\uC218)',
    '\uD3B8\uD55C \uC2E0\uBC1C (\uB9CE\uC774 \uAC78\uC74C!)',
    '\uBA74\uC138 \uC11C\uB958\uC6A9 \uD30C\uC77C/\uBD09\uD22C'
  ]},
  { group: '\uC5B4\uD50C/\uC571 \uC900\uBE44', items: [
    'Google Maps \uC624\uD504\uB77C\uC778 \uC9C0\uB3C4 \uB2E4\uC6B4\uB85C\uB4DC',
    '\uD30C\uD30C\uACE0 (\uBC88\uC5ED\uC571) \uC124\uCE58',
    'Suica/ICOCA \uBAA8\uBC14\uC77C \uB4F1\uB85D (Apple Pay \uB4F1)',
    'Tabelog/\uD56B\uD398\uD37C \uC571 \uC124\uCE58',
    '\uAE34\uAE09 \uC5F0\uB77D\uCC98 \uC800\uC7A5'
  ]}
];

// 체크리스트·긴급 정보·회화 패널의 영어/일본어 표기. 한국어 원문을 키로 쓴다. [영어, 일본어]
// 회화 문장은 영어 뜻만 둔다(일본어 화면에서도 영어 뜻을 보여준다).
var CONTENT_I18N = {
  // 체크리스트
  '여권/비자': ['Passport & visa', 'パスポート・ビザ'],
  '여권 유효기간 확인 (6개월 이상)': ['Check your passport expiry (6+ months left)', 'パスポートの有効期限を確認（6か月以上）'],
  '여권 사본 보관 (별도 보관)': ['Keep a copy of your passport (stored separately)', 'パスポートのコピーを別に保管'],
  '비자 면제 확인 (90일 무비자)': ['Check visa-exemption rules (Korean passports: 90 days visa-free)', 'ビザ免除を確認（韓国旅券は90日間ビザ不要）'],
  'Visit Japan Web 등록 (입국심사 간소화)': ['Register on Visit Japan Web (faster immigration)', 'Visit Japan Webに登録（入国手続きの簡素化）'],
  '항공/교통': ['Flights & transport', '航空・交通'],
  '항공권 예약 확인': ['Confirm your flight booking', '航空券の予約を確認'],
  '모바일 탑승권 저장': ['Save your mobile boarding pass', 'モバイル搭乗券を保存'],
  '공항 교통편 확인 (리무진/공항버스)': ['Check airport transfers (limousine / airport bus)', '空港アクセスを確認（リムジン・空港バス）'],
  'IC카드 준비 (Suica/ICOCA/Pasmo)': ['Get an IC card (Suica/ICOCA/PASMO)', 'ICカードを用意（Suica/ICOCA/PASMO）'],
  'JR Pass 필요 여부 확인': ['Decide whether you need a JR Pass', 'JRパスが必要か確認'],
  '숙소': ['Accommodation', '宿泊'],
  '숙소 예약 확인서 저장': ['Save your hotel confirmation', '宿泊予約の確認書を保存'],
  '체크인/체크아웃 시간 확인': ['Check check-in / check-out times', 'チェックイン・チェックアウト時間を確認'],
  '숙소 주소 일본어 저장 (택시용)': ['Save the hotel address in Japanese (for taxis)', '宿の住所を日本語で保存（タクシー用）'],
  '통신/재정': ['Phone & money', '通信・お金'],
  '포켓 WiFi / 유심 예약': ['Book pocket Wi-Fi or a SIM', 'ポケットWi-Fi・SIMを予約'],
  '해외 로밍 활성화': ['Turn on international roaming', '海外ローミングを有効にする'],
  '환전 (10만원 분 엔화 준비)': ['Exchange some cash (about ₩100,000 in yen)', '両替（10万ウォン分ほどの円を用意）'],
  '해외결제 카드 확인': ['Check that your card works abroad', '海外で使えるカードを確認'],
  '해외여행자보험 가입': ['Get travel insurance', '海外旅行保険に加入'],
  '짐/필수품': ['Packing', '荷物・必需品'],
  '여행용 어댑터 (일본 100V/A타입)': ['Travel adapter (Japan: 100V, type A plugs)', '変換プラグ（日本は100V・Aタイプ）'],
  '상비약 (진통제/소화제/반창고 등)': ['Basic medicine (painkillers, digestive aids, bandages)', '常備薬（鎮痛剤・胃腸薬・絆創膏など）'],
  '우산/우비 (3월~6월 필수)': ['Umbrella or raincoat (a must in March–June)', '傘・レインコート（3〜6月は必須）'],
  '편한 신발 (많이 걸음!)': ['Comfortable shoes (you will walk a lot!)', '歩きやすい靴（たくさん歩きます！）'],
  '면세 서류용 파일/봉투': ['Folder or envelope for tax-free receipts', '免税書類用のファイル・封筒'],
  '어플/앱 준비': ['Apps', 'アプリの準備'],
  'Google Maps 오프라인 지도 다운로드': ['Download Google Maps offline maps', 'Googleマップのオフライン地図をダウンロード'],
  '파파고 (번역앱) 설치': ['Install a translation app (e.g. Papago)', '翻訳アプリ（Papagoなど）をインストール'],
  'Suica/ICOCA 모바일 등록 (Apple Pay 등)': ['Add Suica/ICOCA to your phone (Apple Pay, etc.)', 'Suica/ICOCAをスマホに登録（Apple Payなど）'],
  'Tabelog/핫페퍼 앱 설치': ['Install the Tabelog / Hot Pepper apps', '食べログ・ホットペッパーのアプリを入れる'],
  '긴급 연락처 저장': ['Save emergency contacts', '緊急連絡先を保存'],
  // 긴급 정보
  '긴급 연락처 (일본)': ['Emergency numbers (Japan)', '緊急連絡先（日本）'],
  '경찰': ['Police', '警察'],
  '소방·구급차': ['Fire / ambulance', '消防・救急車'],
  '한국어 통역 연결 가능': ['Korean interpreter available', '韓国語通訳につなげます'],
  '재해용 전언 다이얼': ['Disaster message dial', '災害用伝言ダイヤル'],
  '큰 재해가 났을 때만 운영': ['Only runs after a major disaster', '大規模災害時のみ運用'],
  'Japan Visitor Hotline (관광객 안내)': ['Japan Visitor Hotline (tourist help)', 'Japan Visitor Hotline（観光案内）'],
  '24시간 · 한국어 지원': ['24 hours · Korean supported', '24時間・韓国語対応'],
  '주일본 대한민국 대사관·총영사관': ['Korean Embassy & Consulates in Japan', '駐日大韓民国大使館・総領事館'],
  '대사관(도쿄) 대표': ['Embassy (Tokyo), main line', '大使館（東京）代表'],
  '대사관 영사 업무': ['Embassy consular section', '大使館 領事業務'],
  '평일 09:00~12:00, 13:30~18:00': ['Weekdays 09:00–12:00, 13:30–18:00', '平日 09:00〜12:00、13:30〜18:00'],
  '대사관 긴급전화': ['Embassy emergency line', '大使館 緊急電話'],
  '휴일, 평일 18:00 이후': ['Holidays, and weekdays after 18:00', '休日・平日18:00以降'],
  '오사카 총영사관 대표': ['Consulate General in Osaka, main line', '大阪総領事館 代表'],
  '근무시간': ['Office hours', '勤務時間内'],
  '오사카 총영사관 긴급전화': ['Osaka consulate emergency line', '大阪総領事館 緊急電話'],
  '근무시간 외': ['Outside office hours', '勤務時間外'],
  '후쿠오카 총영사관 대표': ['Consulate General in Fukuoka, main line', '福岡総領事館 代表'],
  '후쿠오카 총영사관 긴급전화(사건사고)': ['Fukuoka consulate emergency (incidents)', '福岡総領事館 緊急電話（事件・事故）'],
  '운영시간 외': ['Outside office hours', '業務時間外'],
  '후쿠오카 총영사관 긴급전화(여권 분실)': ['Fukuoka consulate emergency (lost passport)', '福岡総領事館 緊急電話（旅券紛失）'],
  '삿포로 총영사관 대표': ['Consulate General in Sapporo, main line', '札幌総領事館 代表'],
  '근무시간 08:45~17:30': ['Office hours 08:45–17:30', '勤務時間 08:45〜17:30'],
  '외교부 영사안전콜센터': ['MOFA Consular Call Center (Korea)', '韓国外交部 領事安全コールセンター'],
  '24시간 · 유료(국제전화)': ['24 hours · international call charges apply', '24時間・国際電話料金がかかります'],
  '의료 정보': ['Medical help', '医療情報'],
  'AMDA 국제의료정보센터': ['AMDA International Medical Information Center', 'AMDA国際医療情報センター'],
  '외국어 의료 상담': ['Medical advice in foreign languages', '外国語での医療相談'],
  '약국: 「薬局」(얏쿄쿠) 간판을 찾으세요': ['Pharmacy: look for a 「薬局」 (yakkyoku) sign', '薬局: 「薬局」の看板が目印です'],
  '병원: 「病院」(뵤인) 간판을 찾으세요': ['Hospital: look for a 「病院」 (byōin) sign', '病院: 「病院」の看板が目印です'],
  '※ 일본 건강보험이 없으면 진료비를 전액 본인이 부담합니다. 해외여행자보험 가입을 권장합니다.': ['※ Without Japanese health insurance you pay the full cost of treatment. Travel insurance is recommended.', '※ 日本の健康保険がない場合、医療費は全額自己負担です。海外旅行保険への加入をおすすめします。'],
  '분실물·도난': ['Lost items & theft', '紛失・盗難'],
  '경찰 분실물 신고: 가까운 「交番」(고반, 파출소)': ['Report lost items at the nearest 「交番」 (kōban, police box)', '紛失届: 最寄りの「交番」へ'],
  '역 분실물: 「お忘れ物」(오와스레모노) 분실물 센터': ['Lost on a train or at a station: the 「お忘れ物」 (lost & found) office', '駅での忘れ物: 「お忘れ物」センターへ'],
  '여권 분실: 가까운 대사관·총영사관에 바로 연락 → 여행증명서 발급': ['Lost passport: contact the nearest Korean embassy or consulate right away for a travel certificate', '旅券紛失: 最寄りの韓国大使館・総領事館にすぐ連絡し、旅行証明書を発給してもらう'],
  '자연재해 대비': ['Natural disasters', '自然災害への備え'],
  '지진 시: 테이블 아래로 대피 → 흔들림이 멈추면 출구 확보': ['Earthquake: get under a table, then secure an exit once the shaking stops', '地震: 机の下に避難し、揺れが収まったら出口を確保'],
  '쓰나미 경보 시: 즉시 높은 곳으로 대피': ['Tsunami warning: move to high ground immediately', '津波警報: すぐに高い場所へ避難'],
  'NHK World: 영어 재해정보 앱': ['NHK World: disaster news app in English', 'NHK World: 英語の災害情報アプリ'],
  'Safety Tips 앱: 다국어 재해정보 (한국어 지원)': ['Safety Tips app: multilingual disaster alerts (Korean supported)', 'Safety Tipsアプリ: 多言語の災害情報（韓国語対応）'],
  // 회화 분류
  '기본 인사': ['Greetings', 'あいさつ'],
  '식당 주문': ['At a restaurant', 'レストランで'],
  '길 묻기/교통': ['Directions & transport', '道案内・交通'],
  '쇼핑/면세': ['Shopping & tax-free', '買い物・免税'],
  '숙소/호텔': ['At the hotel', 'ホテルで'],
  '긴급 상황': ['Emergencies', '緊急時'],
  '알레르기/식이제한': ['Allergies & diet', 'アレルギー・食事制限'],
  // 회화 문장(영어 뜻)
  '안녕하세요': ['Hello'],
  '감사합니다': ['Thank you'],
  '죄송합니다 / 실례합니다': ['Sorry / Excuse me'],
  '잘 부탁드립니다': ['Please (I would appreciate it)'],
  '예/아니요': ['Yes / No'],
  'OO명입니다': ['A table for OO, please'],
  '메뉴 주세요': ['The menu, please'],
  '이것 주세요': ['This one, please'],
  '추천 메뉴가 뭐예요?': ['What do you recommend?'],
  '계산서 주세요': ['The check, please'],
  '카드 되나요?': ['Can I pay by card?'],
  '잘 먹겠습니다': ['(Before eating) Thank you for the food'],
  '잘 먹었습니다': ['(After eating) Thank you for the meal'],
  'OO역은 어디에요?': ['Where is OO Station?'],
  'OO까지 어떻게 가요?': ['How do I get to OO?'],
  '여기서 멀어요?': ['Is it far from here?'],
  'OO까지 택시 부탁합니다': ['(Taxi) To OO, please'],
  '환승이 필요해요?': ['Do I need to transfer?'],
  '면세 되나요?': ['Can I buy this tax-free?'],
  '다른 색상 있나요?': ['Do you have other colors?'],
  '입어봐도 되나요?': ['May I try it on?'],
  '좀 깎아주세요': ['Could you make it a little cheaper?'],
  '코인로커 있나요?': ['Is there a coin locker?'],
  '체크인 부탁합니다': ['Check-in, please'],
  '짐을 맡겨도 되나요?': ['Can I leave my luggage here?'],
  'WiFi 비밀번호가 뭐예요?': ['What is the Wi-Fi password?'],
  '근처 편의점 어디에요?': ['Where is the nearest convenience store?'],
  '도와주세요!': ['Help!'],
  '병원에 가고 싶어요': ['I need to go to a hospital'],
  '약국은 어디에요?': ['Where is a pharmacy?'],
  'OO 알레르기가 있어요': ['I am allergic to OO'],
  '한국어 되는 분 있나요?': ['Is there anyone who speaks Korean?'],
  '땅콩 알레르기': ['Peanut allergy'],
  '계란 알레르기': ['Egg allergy'],
  '갑각류 알레르기': ['Shellfish allergy'],
  '채식주의자입니다': ['I am vegetarian'],
  '돼지고기 못 먹어요 (할랄)': ['I cannot eat pork (halal)']
};

// 한국어 원문 → 현재 언어 표기(표에 없으면 원문)
function localText(ko) {
  var s = String(ko == null ? '' : ko);
  var lang = typeof currentLang === 'string' ? currentLang : 'ko';
  if (lang === 'ko') return s;
  var row = CONTENT_I18N[s];
  if (!row) return s;
  return (lang === 'ja' ? (row[1] || row[0]) : row[0]) || s;
}

function renderChecklist() {
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem('travelChecklist') || '{}'); } catch(e) {}
  var container = document.getElementById('checklistContent');
  if (!container) return;
  var totalItems = 0, checkedItems = 0;
  var html = '';
  for (var gi = 0; gi < CHECKLIST_DATA.length; gi++) {
    var grp = CHECKLIST_DATA[gi];
    html += '<div class="checklist-group"><div class="checklist-group-title">' + escapeHtml(localText(grp.group)) + '</div>';
    for (var ii = 0; ii < grp.items.length; ii++) {
      var key = gi + '_' + ii;
      var isChecked = saved[key] === true;
      totalItems++;
      if (isChecked) checkedItems++;
      html += '<div class="checklist-item' + (isChecked ? ' checked' : '') + '">';
      html += '<input type="checkbox" id="chk_' + key + '" data-chk-key="' + key + '"' + (isChecked ? ' checked' : '') + ' />';
      html += '<label for="chk_' + key + '">' + escapeHtml(localText(grp.items[ii])) + '</label></div>';
    }
    html += '</div>';
  }
  container.innerHTML = html;
  var bar = document.getElementById('checklistProgressBar');
  var text = document.getElementById('checklistProgressText');
  if (bar) bar.style.width = (totalItems > 0 ? Math.round(checkedItems / totalItems * 100) : 0) + '%';
  if (text) text.textContent = checkedItems + '/' + totalItems;
}

document.addEventListener('change', function(e) {
  if (e.target.dataset && e.target.dataset.chkKey !== undefined) {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('travelChecklist') || '{}'); } catch(ex) {}
    saved[e.target.dataset.chkKey] = e.target.checked;
    localStorage.setItem('travelChecklist', JSON.stringify(saved));
    renderChecklist();
  }
});

// btnChecklist: handled by toolbar delegation below

// --- 2. EMERGENCY INFO ---
// 전화번호는 한 필드(tel)에서 화면 표시와 tel: 링크를 함께 만든다(표시 번호와 실제 발신 번호가 달라지지 않게).
// 번호 출처(2026-10-01 확인):
//  - 110/119: 요코하마시 공식 한국어 안내 https://www.city.yokohama.lg.jp/lang/residents/kor/emergencies/20200221101428002.html
//  - 171: NTT 동일본 https://www.ntt-east.co.jp/saigai/voice171/
//  - Japan Visitor Hotline: JNTO https://www.japan.travel/ko/plan/hotline/
//  - 대사관: https://overseas.mofa.go.kr/jp-ko/index.do  오사카: https://overseas.mofa.go.kr/jp-osaka-ko/index.do
//    후쿠오카: https://overseas.mofa.go.kr/jp-fukuoka-ko/index.do  삿포로: https://overseas.mofa.go.kr/jp-sapporo-ko/index.do
//  - AMDA 국제의료정보센터: https://www.amdamedicalcenter.com/
var EMERGENCY_CONTACTS = [
  { title: '긴급 연락처 (일본)', items: [
    { label: '경찰', tel: '110' },
    { label: '소방·구급차', tel: '119', note: '한국어 통역 연결 가능' },
    { label: '재해용 전언 다이얼', tel: '171', note: '큰 재해가 났을 때만 운영' },
    { label: 'Japan Visitor Hotline (관광객 안내)', tel: '050-3816-2787', note: '24시간 · 한국어 지원' }
  ]},
  { title: '주일본 대한민국 대사관·총영사관', items: [
    { label: '대사관(도쿄) 대표', tel: '03-3452-7611' },
    { label: '대사관 영사 업무', tel: '03-3455-2601', note: '평일 09:00~12:00, 13:30~18:00' },
    { label: '대사관 긴급전화', tel: '070-2153-5454', note: '휴일, 평일 18:00 이후' },
    { label: '오사카 총영사관 대표', tel: '06-4256-2345', note: '근무시간' },
    { label: '오사카 총영사관 긴급전화', tel: '090-3050-0746', note: '근무시간 외' },
    { label: '후쿠오카 총영사관 대표', tel: '092-771-0461' },
    { label: '후쿠오카 총영사관 긴급전화(사건사고)', tel: '080-8588-2806', note: '운영시간 외' },
    { label: '후쿠오카 총영사관 긴급전화(여권 분실)', tel: '080-2956-6736', note: '운영시간 외' },
    { label: '삿포로 총영사관 대표', tel: '011-218-0288', note: '근무시간 08:45~17:30' },
    { label: '외교부 영사안전콜센터', tel: '+82-2-3210-0404', note: '24시간 · 유료(국제전화)' }
  ]},
  { title: '의료 정보', items: [
    { label: 'AMDA 국제의료정보센터', tel: '03-6233-9266', note: '외국어 의료 상담' }
  ], lines: [
    '약국: 「薬局」(얏쿄쿠) 간판을 찾으세요',
    '병원: 「病院」(뵤인) 간판을 찾으세요',
    '※ 일본 건강보험이 없으면 진료비를 전액 본인이 부담합니다. 해외여행자보험 가입을 권장합니다.'
  ]},
  { title: '분실물·도난', lines: [
    '경찰 분실물 신고: 가까운 「交番」(고반, 파출소)',
    '역 분실물: 「お忘れ物」(오와스레모노) 분실물 센터',
    '여권 분실: 가까운 대사관·총영사관에 바로 연락 → 여행증명서 발급'
  ]},
  { title: '자연재해 대비', lines: [
    '지진 시: 테이블 아래로 대피 → 흔들림이 멈추면 출구 확보',
    '쓰나미 경보 시: 즉시 높은 곳으로 대피',
    'NHK World: 영어 재해정보 앱',
    'Safety Tips 앱: 다국어 재해정보 (한국어 지원)'
  ]}
];

function telLink(number) {
  var display = String(number || '');
  var dial = display.replace(/[^+\d]/g, '');
  return '<a href="tel:' + escapeHtml(dial) + '">' + escapeHtml(display) + '</a>';
}

function renderEmergency() {
  var container = document.getElementById('emergencyContent');
  if (!container) return;
  container.innerHTML = EMERGENCY_CONTACTS.map(function(group) {
    var rows = (group.items || []).map(function(item) {
      return escapeHtml(localText(item.label)) + ': ' + telLink(item.tel) + (item.note ? ' (' + escapeHtml(localText(item.note)) + ')' : '');
    }).concat((group.lines || []).map(function(line) { return escapeHtml(localText(line)); }));
    return '<div class="emergency-card"><h5>' + escapeHtml(localText(group.title)) + '</h5><p>' + rows.join('<br>') + '</p></div>';
  }).join('');
}

// btnEmergency: handled by toolbar delegation below

// --- 3. JAPANESE PHRASES ---
var PHRASES_DATA = [
  { category: '\uAE30\uBCF8 \uC778\uC0AC', tags: '\uC778\uC0AC \uAE30\uBCF8 \uAC10\uC0AC', items: [
    { ko: '\uC548\uB155\uD558\uC138\uC694', ja: '\u3053\u3093\u306B\u3061\u306F', roma: 'Konnichiwa' },
    { ko: '\uAC10\uC0AC\uD569\uB2C8\uB2E4', ja: '\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059', roma: 'Arigatou gozaimasu' },
    { ko: '\uC8C4\uC1A1\uD569\uB2C8\uB2E4 / \uC2E4\uB840\uD569\uB2C8\uB2E4', ja: '\u3059\u307F\u307E\u305B\u3093', roma: 'Sumimasen' },
    { ko: '\uC798 \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4', ja: '\u304A\u306D\u304C\u3044\u3057\u307E\u3059', roma: 'Onegaishimasu' },
    { ko: '\uC608/\uC544\uB2C8\uC694', ja: '\u306F\u3044/\u3044\u3044\u3048', roma: 'Hai / Iie' }
  ]},
  { category: '\uC2DD\uB2F9 \uC8FC\uBB38', tags: '\uC2DD\uB2F9 \uC8FC\uBB38 \uBA54\uB274 \uC74C\uC2DD \uB9DB\uC9D1 \uC608\uC57D', items: [
    { ko: 'OO\uBA85\uC785\uB2C8\uB2E4', ja: 'OO\u540D\u3067\u3059', roma: 'OO-mei desu' },
    { ko: '\uBA54\uB274 \uC8FC\uC138\uC694', ja: '\u30E1\u30CB\u30E5\u30FC\u3092\u304F\u3060\u3055\u3044', roma: 'Menyuu wo kudasai' },
    { ko: '\uC774\uAC83 \uC8FC\uC138\uC694', ja: '\u3053\u308C\u3092\u304F\u3060\u3055\u3044', roma: 'Kore wo kudasai' },
    { ko: '\uCD94\uCC9C \uBA54\uB274\uAC00 \uBB50\uC608\uC694?', ja: '\u304A\u3059\u3059\u3081\u306F\u4F55\u3067\u3059\u304B\uFF1F', roma: 'Osusume wa nan desu ka?' },
    { ko: '\uACC4\uC0B0\uC11C \uC8FC\uC138\uC694', ja: '\u304A\u4F1A\u8A08\u304A\u306D\u304C\u3044\u3057\u307E\u3059', roma: 'Okaikei onegaishimasu' },
    { ko: '\uCE74\uB4DC \uB418\uB098\uC694?', ja: '\u30AB\u30FC\u30C9\u306F\u4F7F\u3048\u307E\u3059\u304B\uFF1F', roma: 'Kaado wa tsukaemasu ka?' },
    { ko: '\uC798 \uBA39\uACA0\uC2B5\uB2C8\uB2E4', ja: '\u3044\u305F\u3060\u304D\u307E\u3059', roma: 'Itadakimasu' },
    { ko: '\uC798 \uBA39\uC5C8\uC2B5\uB2C8\uB2E4', ja: '\u3054\u3061\u305D\u3046\u3055\u307E\u3067\u3057\u305F', roma: 'Gochisousama deshita' }
  ]},
  { category: '\uAE38 \uBB3B\uAE30/\uAD50\uD1B5', tags: '\uAE38 \uAD50\uD1B5 \uC5ED \uBC84\uC2A4 \uD0DD\uC2DC \uC9C0\uD558\uCCA0', items: [
    { ko: 'OO\uC5ED\uC740 \uC5B4\uB514\uC5D0\uC694?', ja: 'OO\u99C5\u306F\u3069\u3053\u3067\u3059\u304B\uFF1F', roma: 'OO-eki wa doko desu ka?' },
    { ko: 'OO\uAE4C\uC9C0 \uC5B4\uB5BB\uAC8C \uAC00\uC694?', ja: 'OO\u307E\u3067\u3069\u3046\u884C\u3051\u3070\u3044\u3044\u3067\u3059\u304B\uFF1F', roma: 'OO made dou ikeba ii desu ka?' },
    { ko: '\uC5EC\uAE30\uC11C \uBA40\uC5B4\uC694?', ja: '\u3053\u3053\u304B\u3089\u9060\u3044\u3067\u3059\u304B\uFF1F', roma: 'Koko kara tooi desu ka?' },
    { ko: 'OO\uAE4C\uC9C0 \uD0DD\uC2DC \uBD80\uD0C1\uD569\uB2C8\uB2E4', ja: 'OO\u307E\u3067\u304A\u306D\u304C\u3044\u3057\u307E\u3059', roma: 'OO made onegaishimasu' },
    { ko: '\uD658\uC2B9\uC774 \uD544\uC694\uD574\uC694?', ja: '\u4E57\u308A\u63DB\u3048\u306F\u5FC5\u8981\u3067\u3059\u304B\uFF1F', roma: 'Norikae wa hitsuyou desu ka?' }
  ]},
  { category: '\uC1FC\uD551/\uBA74\uC138', tags: '\uC1FC\uD551 \uBA74\uC138 \uACB0\uC81C \uAC00\uACA9 \uD560\uC778', items: [
    { ko: '\uBA74\uC138 \uB418\uB098\uC694?', ja: '\u514D\u7A0E\u3067\u304D\u307E\u3059\u304B\uFF1F', roma: 'Menzei dekimasu ka?' },
    { ko: '\uB2E4\uB978 \uC0C9\uC0C1 \uC788\uB098\uC694?', ja: '\u4ED6\u306E\u8272\u306F\u3042\u308A\u307E\u3059\u304B\uFF1F', roma: 'Hoka no iro wa arimasu ka?' },
    { ko: '\uC785\uC5B4\uBD10\uB3C4 \uB418\uB098\uC694?', ja: '\u8A66\u7740\u3057\u3066\u3082\u3044\u3044\u3067\u3059\u304B\uFF1F', roma: 'Shichaku shitemo ii desu ka?' },
    { ko: '\uC880 \uAE4E\uC544\uC8FC\uC138\uC694', ja: '\u5C11\u3057\u5B89\u304F\u3057\u3066\u304F\u3060\u3055\u3044', roma: 'Sukoshi yasuku shite kudasai' },
    { ko: '코인로커 있나요?', ja: 'コインロッカーはありますか？', roma: 'Koin rokkaa wa arimasu ka?' }
  ]},
  { category: '\uC219\uC18C/\uD638\uD154', tags: '\uC219\uC18C \uD638\uD154 \uCCB4\uD06C\uC778 \uCCB4\uD06C\uC544\uC6C3 \uBC29', items: [
    { ko: '\uCCB4\uD06C\uC778 \uBD80\uD0C1\uD569\uB2C8\uB2E4', ja: '\u30C1\u30A7\u30C3\u30AF\u30A4\u30F3\u304A\u306D\u304C\u3044\u3057\u307E\u3059', roma: 'Chekkuin onegaishimasu' },
    { ko: '짐을 맡겨도 되나요?', ja: '荷物を預けられますか？', roma: 'Nimotsu wo azukeraremasu ka?' },
    { ko: 'WiFi \uBE44\uBC00\uBC88\uD638\uAC00 \uBB50\uC608\uC694?', ja: 'WiFi\u306E\u30D1\u30B9\u30EF\u30FC\u30C9\u306F\u4F55\u3067\u3059\u304B\uFF1F', roma: 'WiFi no pasuwaado wa nan desu ka?' },
    { ko: '\uADFC\uCC98 \uD3B8\uC758\uC810 \uC5B4\uB514\uC5D0\uC694?', ja: '\u8FD1\u304F\u306E\u30B3\u30F3\u30D3\u30CB\u306F\u3069\u3053\u3067\u3059\u304B\uFF1F', roma: 'Chikaku no konbini wa doko desu ka?' }
  ]},
  { category: '\uAE34\uAE09 \uC0C1\uD669', tags: '\uAE34\uAE09 \uBCD1\uC6D0 \uC57D\uAD6D \uACBD\uCC30 \uB3C4\uC6C0', items: [
    { ko: '\uB3C4\uC640\uC8FC\uC138\uC694!', ja: '\u52A9\u3051\u3066\u304F\u3060\u3055\u3044\uFF01', roma: 'Tasukete kudasai!' },
    { ko: '\uBCD1\uC6D0\uC5D0 \uAC00\uACE0 \uC2F6\uC5B4\uC694', ja: '\u75C5\u9662\u306B\u884C\u304D\u305F\u3044\u3067\u3059', roma: 'Byouin ni ikitai desu' },
    { ko: '\uC57D\uAD6D\uC740 \uC5B4\uB514\uC5D0\uC694?', ja: '\u85AC\u5C40\u306F\u3069\u3053\u3067\u3059\u304B\uFF1F', roma: 'Yakkyoku wa doko desu ka?' },
    { ko: 'OO \uC54C\uB808\uB974\uAE30\uAC00 \uC788\uC5B4\uC694', ja: 'OO\u30A2\u30EC\u30EB\u30AE\u30FC\u304C\u3042\u308A\u307E\u3059', roma: 'OO arerugii ga arimasu' },
    { ko: '\uD55C\uAD6D\uC5B4 \uB418\uB294 \uBD84 \uC788\uB098\uC694?', ja: '\u97D3\u56FD\u8A9E\u304C\u3067\u304D\u308B\u4EBA\u306F\u3044\u307E\u3059\u304B\uFF1F', roma: 'Kankokugo ga dekiru hito wa imasu ka?' }
  ]},
  { category: '\uC54C\uB808\uB974\uAE30/\uC2DD\uC774\uC81C\uD55C', tags: '\uC54C\uB808\uB974\uAE30 \uC2DD\uC774\uC81C\uD55C \uCC44\uC2DD \uD560\uB784', items: [
    { ko: '\uB545\uCF69 \uC54C\uB808\uB974\uAE30', ja: '\u30D4\u30FC\u30CA\u30C3\u30C4\u30A2\u30EC\u30EB\u30AE\u30FC', roma: 'Piinattsu arerugii' },
    { ko: '\uACC4\uB780 \uC54C\uB808\uB974\uAE30', ja: '\u5375\u30A2\u30EC\u30EB\u30AE\u30FC', roma: 'Tamago arerugii' },
    { ko: '\uAC11\uAC01\uB958 \uC54C\uB808\uB974\uAE30', ja: '\u7532\u6BBB\u985E\u30A2\u30EC\u30EB\u30AE\u30FC', roma: 'Koukakurui arerugii' },
    { ko: '\uCC44\uC2DD\uC8FC\uC758\uC790\uC785\uB2C8\uB2E4', ja: '\u30D9\u30B8\u30BF\u30EA\u30A2\u30F3\u3067\u3059', roma: 'Bejitarian desu' },
    { ko: '\uB3FC\uC9C0\uACE0\uAE30 \uBABB \uBA39\uC5B4\uC694 (\uD560\uB784)', ja: '\u8C5A\u8089\u306F\u98DF\u3079\u3089\u308C\u307E\u305B\u3093\uFF08\u30CF\u30E9\u30EB\uFF09', roma: 'Butaniku wa taberaremasen (hararu)' }
  ]}
];

function renderPhrases(filter) {
  var container = document.getElementById('phrasesContent');
  if (!container) return;
  var q = String(filter || '').toLowerCase().trim();
  var html = '';
  for (var ci = 0; ci < PHRASES_DATA.length; ci++) {
    var cat = PHRASES_DATA[ci];
    var catName = localText(cat.category);
    // 검색어는 한국어 태그·분류명, 현재 언어 표기, 일본어 문장, 로마자에서 모두 찾는다.
    var catMatch = !q || (cat.tags + ' ' + cat.category + ' ' + catName).toLowerCase().indexOf(q) >= 0;
    var rows = '';
    for (var pi2 = 0; pi2 < cat.items.length; pi2++) {
      var p = cat.items[pi2];
      var meaning = localText(p.ko);
      if (!catMatch && (p.ko + ' ' + meaning + ' ' + p.ja + ' ' + p.roma).toLowerCase().indexOf(q) < 0) continue;
      rows += '<div class="phrase-item"><button type="button" class="phrase-copy" data-copy="' + escapeHtml(p.ja) + '">' + escapeHtml(t('btn-copy')) + '</button>';
      rows += '<div class="phrase-ko">' + escapeHtml(meaning) + '</div>';
      rows += '<div class="phrase-ja">' + escapeHtml(p.ja) + '</div>';
      rows += '<div class="phrase-roma">' + escapeHtml(p.roma) + '</div></div>';
    }
    if (rows) html += '<div class="phrase-category"><div class="phrase-category-title">' + escapeHtml(catName) + '</div>' + rows + '</div>';
  }
  container.innerHTML = html || '<div>' + escapeHtml(t('phrases-none')) + '</div>';
}

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('phrase-copy')) {
    var text = e.target.dataset.copy;
    if (text && navigator.clipboard) navigator.clipboard.writeText(text);
  }
});

// btnPhrases: handled by toolbar delegation below

// Phrases search - use event delegation (element is after <script>)
document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'phrasesSearch') {
    renderPhrases(e.target.value);
  }
});

// --- 4. WEATHER ---
var WMO_ICONS = { 0: '\u2600\uFE0F', 1: '\uD83C\uDF24', 2: '\u26C5', 3: '\u2601\uFE0F', 45: '\uD83C\uDF2B', 48: '\uD83C\uDF2B',
  51: '\uD83C\uDF26', 53: '\uD83C\uDF26', 55: '\uD83C\uDF27', 61: '\uD83C\uDF27', 63: '\uD83C\uDF27', 65: '\uD83C\uDF27',
  71: '\u2744\uFE0F', 73: '\u2744\uFE0F', 75: '\u2744\uFE0F', 77: '\u2744\uFE0F',
  80: '\uD83C\uDF26', 81: '\uD83C\uDF27', 82: '\uD83C\uDF27', 85: '\u2744\uFE0F', 86: '\u2744\uFE0F',
  95: '\u26C8', 96: '\u26C8', 99: '\u26C8' };

// 날씨는 서버(/api/weather?city=)가 도시 좌표를 찾아 open-meteo에서 가져온다.
// 좌표를 모르는 도시는 다른 도시 날씨를 보여주지 않고 오류 안내를 띄운다.
async function fetchWeather(cityKey) {
  var data = await getCachedOrFetch('/api/weather?city=' + encodeURIComponent(cityKey || 'tokyo'));
  var daily = data && data.daily;
  return daily && Array.isArray(daily.time) && daily.time.length ? daily : null;
}

var inlineWeatherSeq = 0;
var lastWeather = null; // { daily, cityKey } — 언어를 바꾸면 이 값으로 다시 그린다

// 일정 옆 날씨 칸을 현재 도시 기준으로 갱신한다.
async function refreshInlineWeather(cityKey) {
  var seq = ++inlineWeatherSeq;
  var daily = await fetchWeather(cityKey);
  if (seq !== inlineWeatherSeq) return;
  if (daily) {
    lastWeather = { daily: daily, cityKey: cityKey };
    renderWeatherWidget(daily, cityNameByKey(cityKey));
  } else {
    var widget = el('weatherContent');
    if (widget) widget.textContent = t('weather-error');
    var wrap = el('weatherWidget');
    if (wrap) wrap.classList.remove('hidden');
  }
}

// 서버(sanitizeWeatherDaily)는 모르는 값을 null로 보낸다. null은 숫자로 계산하면 0이 되므로
// (Math.round(null) === 0, null < 5 === true) 진짜 숫자일 때만 값으로 쓰고 아니면 null을 돌려준다.
function wxValue(arr, i) {
  var v = Array.isArray(arr) ? arr[i] : null;
  return typeof v === 'number' && isFinite(v) ? v : null;
}

// 기온을 모르면 0° 대신 '–'로 보여 준다.
function wxTempText(v) {
  return v === null ? '–' : Math.round(v) + '°';
}

// Open-Meteo(CC BY 4.0) 출처 표기. 날씨를 보여 주는 곳(위젯·패널)마다 붙인다.
function weatherCreditHtml() {
  return '<div class="data-credit"><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">' + escapeHtml(t('weather-credit')) + '</a></div>';
}

function renderWeatherWidget(daily, cityLabel) {
  if (!daily || !Array.isArray(daily.time)) return;
  cityLabel = escapeHtml(cityLabel || '');
  var startDate = el('startDate') ? el('startDate').value : '';
  var days = Number(el('days') ? el('days').value : 4);

  var html = '<div class="weather-days">';
  for (var i = 0; i < daily.time.length; i++) {
    var d = daily.time[i];
    var code = wxValue(daily.weathercode, i);
    var icon = (code !== null && WMO_ICONS[code]) || '\u2601\uFE0F';
    var hi = wxValue(daily.temperature_2m_max, i);
    var lo = wxValue(daily.temperature_2m_min, i);
    // 날짜·강수확률은 외부(open-meteo) 값이라 문자열은 이스케이프하고 숫자는 숫자로 바꿔 넣는다.
    var rainValue = wxValue(daily.precipitation_probability_max, i);
    var rain = rainValue === null ? 0 : Math.round(rainValue);
    var isTrip = startDate && d >= startDate && d < addDays(startDate, days);
    html += '<div class="weather-day" style="' + (isTrip ? 'border-color:var(--accent);background:var(--accent-soft)' : '') + '">';
    html += '<div class="weather-day-date">' + escapeHtml(String(d || '').slice(5)) + '</div>';
    html += '<div class="weather-day-icon">' + icon + '</div>';
    html += '<div class="weather-day-temp"><span class="hi">' + wxTempText(hi) + '</span>/<span class="lo">' + wxTempText(lo) + '</span></div>';
    if (rain > 0) html += '<div class="weather-day-rain">\uD83D\uDCA7' + rain + '%</div>';
    html += '</div>';
  }
  html += '</div>';

  // Weather advice — 값을 모르는 날(null)은 비·추위·더위 판단에서 뺀다.
  var tripDays = [];
  if (startDate) {
    for (var j = 0; j < daily.time.length; j++) {
      if (daily.time[j] >= startDate && daily.time[j] < addDays(startDate, days)) tripDays.push(j);
    }
  }
  if (tripDays.length > 0) {
    var rainyDays = tripDays.filter(function(idx) { var v = wxValue(daily.precipitation_probability_max, idx); return v !== null && v > 50; });
    var coldDays = tripDays.filter(function(idx) { var v = wxValue(daily.temperature_2m_min, idx); return v !== null && v < 5; });
    var hotDays = tripDays.filter(function(idx) { var v = wxValue(daily.temperature_2m_max, idx); return v !== null && v > 30; });
    var advice = [];
    if (rainyDays.length > 0) advice.push(fillText(t('wx-rain'), { n: rainyDays.length }));
    if (coldDays.length > 0) advice.push(t('wx-cold'));
    if (hotDays.length > 0) advice.push(t('wx-hot'));
    if (advice.length > 0) html += '<div class="weather-advice">' + advice.map(escapeHtml).join('<br>') + '</div>';
  }
  html += weatherCreditHtml();

  // Update widget and panel
  var widget = document.getElementById('weatherContent');
  if (widget) widget.innerHTML = '<strong>' + (cityLabel || '') + '</strong> ' + html;
  var widgetWrap = document.getElementById('weatherWidget');
  if (widgetWrap) widgetWrap.classList.remove('hidden');

  var panelContent = document.getElementById('weatherPanelContent');
  if (panelContent) panelContent.innerHTML = '<h4>' + fillText(escapeHtml(t('weather-10day')), { city: cityLabel || '' }) + '</h4>' + html;
}

// btnWeather: handled by toolbar delegation below

// --- 5. EXPORT / SHARE ---
function buildItineraryText(format) {
  if (!currentItineraryData || !currentItineraryData.itinerary) return t('export-no-plan');
  var md = format === 'markdown';
  var lines = [];
  var docTitle = shareTitle();
  lines.push(md ? '# ' + docTitle : '=== ' + docTitle + ' ===');
  if (currentItineraryData.summary) lines.push(md ? '> ' + currentItineraryData.summary : currentItineraryData.summary);
  lines.push('');

  if (selectedFlight) {
    lines.push(md ? '## ✈️ ' + t('export-flight') : '[ ' + t('export-flight') + ' ]');
    lines.push(describeFlightSummary(selectedFlight));
    lines.push('');
  }
  if (selectedStay) {
    lines.push(md ? '## 🏨 ' + t('export-stay') : '[ ' + t('export-stay') + ' ]');
    lines.push(describeStaySummary(selectedStay));
    lines.push('');
  }

  for (var di = 0; di < currentItineraryData.itinerary.length; di++) {
    var day = currentItineraryData.itinerary[di];
    lines.push(md ? '## ' + t('day-prefix') + day.day + ' (' + (day.date || '') + ')' : '--- Day ' + day.day + ' (' + (day.date || '') + ') ---');
    var groups = groupItineraryBlocks(day.blocks || []);
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      if (g.type === 'main') {
        var info = parsePlaceInfo(g.place);
        var prefix = md ? '- **' + tPeriod(g.period) + '** ' : '  [' + tPeriod(g.period) + '] ';
        var suffix = md ? info.name + (info.info ? ' _(' + info.info + ')_' : '') : info.name + (info.info ? ' (' + info.info + ')' : '');
        lines.push(prefix + suffix);
      }
    }
    lines.push('');
  }

  // Budget
  if (selectedFlight || selectedStay) {
    lines.push(md ? '## 💰 ' + t('export-cost') : '[ ' + t('export-cost') + ' ]');
    var days = Number(el('days') ? el('days').value : 4);
    var fc = selectedFlight ? selectedFlight.totalPriceKRW : 0;
    var sc = selectedStay ? (selectedStay.totalPriceKRW || 0) : 0;
    if (fc) lines.push(t('cost-flight-line') + formatKRW(fc));
    if (sc) lines.push(t('cost-stay-line') + formatKRW(sc));
    lines.push(t('cost-food-line') + formatKRW(55000 * days));
    lines.push(t('cost-transport-line') + formatKRW(22000 * days));
  }

  return lines.join('\n');
}

// Export/Share - event delegation (these elements are after <script> in DOM)
document.addEventListener('click', function(e) {
  var tgt = e.target.closest('#btnExportPlan, #btnCopyText, #btnCopyMarkdown, #btnShareLink, #btnChecklist, #btnEmergency, #btnPhrases, #btnWeather');
  if (!tgt) return;

  if (tgt.id === 'btnExportPlan') {
    var preview = document.getElementById('exportPreview');
    if (preview) preview.textContent = buildItineraryText('text');
    togglePanel('exportPanel');
    return;
  }
  if (tgt.id === 'btnCopyText') {
    var text = buildItineraryText('text');
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    showMemoToast(t('copy-text-done'));
    var p2 = document.getElementById('exportPreview');
    if (p2) p2.textContent = text;
    return;
  }
  if (tgt.id === 'btnCopyMarkdown') {
    var md = buildItineraryText('markdown');
    if (navigator.clipboard) navigator.clipboard.writeText(md);
    showMemoToast(t('copy-md-done'));
    var p3 = document.getElementById('exportPreview');
    if (p3) p3.textContent = md;
    return;
  }
  if (tgt.id === 'btnShareLink') {
    var st = buildItineraryText('text');
    if (navigator.share) {
      navigator.share({ title: shareTitle(), text: st });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(st);
      showMemoToast(t('copy-itin-done'));
    }
    return;
  }
  if (tgt.id === 'btnChecklist') {
    renderChecklist();
    togglePanel('checklistPanel');
    return;
  }
  if (tgt.id === 'btnEmergency') {
    renderEmergency();
    togglePanel('emergencyPanel');
    return;
  }
  if (tgt.id === 'btnPhrases') {
    renderPhrases('');
    togglePanel('phrasesPanel');
    return;
  }
  if (tgt.id === 'btnWeather') {
    var cityKey = el('city') ? el('city').value : 'tokyo';
    var cityLabel = cityNameByKey(cityKey);
    togglePanel('weatherPanel');
    var panelContent = document.getElementById('weatherPanelContent');
    if (panelContent) panelContent.textContent = t('weather-loading');
    fetchWeather(cityKey).then(function(daily) {
      if (daily) {
        lastWeather = { daily: daily, cityKey: cityKey };
        renderWeatherWidget(daily, cityLabel);
      } else {
        if (panelContent) panelContent.textContent = t('weather-error');
      }
    });
    return;
  }
});

var memoToastTimer = null;
function showMemoToast(msg, durationMs) {
  var toast = document.getElementById('memoToast');
  if (!toast) return;
  toast.textContent = msg || t('saved-default');
  toast.classList.remove('hidden');
  toast.classList.add('show');
  // 앞 토스트의 타이머가 새 토스트를 일찍 닫지 않게 한다.
  if (memoToastTimer) clearTimeout(memoToastTimer);
  memoToastTimer = setTimeout(function() { toast.classList.remove('show'); toast.classList.add('hidden'); memoToastTimer = null; }, durationMs || 2000);
}

// 로그인 콜백이 실패하면 서버가 '/?authError=<코드>'로 돌려보낸다. 코드 원문은 보여 주지 않고
// 현재 언어의 안내만 띄운 뒤, 새로고침해도 다시 뜨지 않게 주소에서 authError를 지운다.
function showAuthErrorNotice() {
  var code = '';
  try { code = new URLSearchParams(location.search).get('authError') || ''; } catch (e) { return; }
  if (!code) return;
  var providerLabels = { naver: t('provider-naver'), kakao: t('provider-kakao'), google: 'Google' };
  var msg = code === 'invalid_state'
    ? t('auth-err-state')
    : providerLabels[code] ? fillText(t('auth-err-provider'), { p: providerLabels[code] }) : t('auth-err-generic');
  showMemoToast(msg, 6000);
  try {
    var url = new URL(location.href);
    url.searchParams.delete('authError');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  } catch (e) {}
}

// --- 6. SCHEDULE OPTIMIZATION ALERTS ---
function analyzeSchedule() {
  if (!currentItineraryData || !currentItineraryData.itinerary) return;
  var alertsEl = document.getElementById('scheduleAlerts');
  if (!alertsEl) return;

  var alerts = [];
  var cityKey = el('city') ? el('city').value : 'tokyo';
  var cityData = null;
  // Try to get CITY_DATA from server-side data (we have it in recommend results)
  // For now, use basic heuristics

  for (var di = 0; di < currentItineraryData.itinerary.length; di++) {
    var day = currentItineraryData.itinerary[di];
    var groups = groupItineraryBlocks(day.blocks || []);
    var mainBlocks = groups.filter(function(g) { return g.type === 'main' && !isMealPeriod(g.period); });
    var mealBlocks = groups.filter(function(g) { return g.type === 'main' && isMealPeriod(g.period); });

    // Too many spots
    if (mainBlocks.length > 3) {
      alerts.push({ type: 'warn', text: fillText(t('alert-too-many'), { d: t('day-prefix') + day.day, n: mainBlocks.length }) });
    }

    // Missing meals
    if (mainBlocks.length > 0 && mealBlocks.length === 0) {
      alerts.push({ type: 'info', text: fillText(t('alert-no-meal'), { d: t('day-prefix') + day.day }) });
    }

    // Allday + other spots
    var hasAllday = mainBlocks.some(function(b) { return b.period === '\uC885\uC77C'; });
    if (hasAllday && mainBlocks.length > 1) {
      alerts.push({ type: 'warn', text: fillText(t('alert-allday'), { d: t('day-prefix') + day.day }) });
    }

    // Duplicate places across days
    for (var di2 = di + 1; di2 < currentItineraryData.itinerary.length; di2++) {
      var day2 = currentItineraryData.itinerary[di2];
      var groups2 = groupItineraryBlocks(day2.blocks || []);
      var names2 = groups2.filter(function(g) { return g.type === 'main'; }).map(function(g) { return parsePlaceInfo(g.place).name; });
      for (var mi = 0; mi < mainBlocks.length; mi++) {
        var pname = parsePlaceInfo(mainBlocks[mi].place).name;
        if (!isFreeTimePlace(pname) && names2.indexOf(pname) >= 0) {
          alerts.push({ type: 'info', text: fillText(t('alert-dup'), { p: pname, a: day.day, b: day2.day }) });
        }
      }
    }
  }

  // Flight timing check
  if (selectedFlight && selectedFlight.legs) {
    var firstLeg = selectedFlight.legs[0];
    if (firstLeg && firstLeg.arrivalTime) {
      var arrH = parseInt(firstLeg.arrivalTime.split(':')[0]);
      if (arrH >= 18) {
        alerts.push({ type: 'tip', text: t('alert-late-arrival') });
      }
    }
    if (selectedFlight.tripType === 'roundtrip' && selectedFlight.legs.length > 1) {
      var lastLeg = selectedFlight.legs[selectedFlight.legs.length - 1];
      if (lastLeg && lastLeg.departureTime) {
        var depH = parseInt(lastLeg.departureTime.split(':')[0]);
        if (depH <= 10) {
          alerts.push({ type: 'tip', text: t('alert-early-dep') });
        }
      }
    }
  }

  if (alerts.length === 0) {
    alertsEl.innerHTML = '';
    alertsEl.classList.add('hidden');
    return;
  }

  var typeIcons = { warn: '\u26A0\uFE0F', info: '\u2139\uFE0F', tip: '\uD83D\uDCA1' };
  var typeClasses = { warn: 'schedule-alert-warn', info: 'schedule-alert-info', tip: 'schedule-alert-tip' };
  var html = '<h4>' + escapeHtml(t('alert-title')) + '</h4>';
  for (var ai = 0; ai < alerts.length; ai++) {
    var a = alerts[ai];
    html += '<div class="schedule-alert ' + (typeClasses[a.type] || '') + '">';
    html += '<span class="schedule-alert-icon">' + (typeIcons[a.type] || '') + '</span>';
    html += '<span>' + escapeHtml(a.text) + '</span></div>';
  }
  alertsEl.innerHTML = html;
  alertsEl.classList.remove('hidden');
}

// Hook into renderItineraryTimeline
var _origRenderItineraryTimeline = renderItineraryTimeline;
renderItineraryTimeline = function() {
  _origRenderItineraryTimeline();
  // Auto-push undo history on every itinerary re-render (covers all edits)
  try { pushItinHistory(); } catch(e) {}
  try { analyzeSchedule(); } catch(e) {}
  try { addMemoButtons(); } catch(e) {}
};

// --- 7. PLACE MEMO ---
function getPlaceMemos() {
  try { return JSON.parse(localStorage.getItem('placeMemos') || '{}'); } catch(e) { return {}; }
}

function savePlaceMemo(placeName, memo) {
  var memos = getPlaceMemos();
  if (memo) memos[placeName] = memo;
  else delete memos[placeName];
  localStorage.setItem('placeMemos', JSON.stringify(memos));
}

function addMemoButtons() {
  var slots = document.querySelectorAll('.itin-slot-place');
  var memos = getPlaceMemos();
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    if (slot.querySelector('.itin-memo-btn')) continue;
    var placeName = slot.textContent.replace(/MAP$/, '').trim().split('(')[0].trim();
    if (!placeName) continue;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'itin-memo-btn';
    btn.dataset.memoPlace = placeName;
    btn.textContent = memos[placeName] ? '\u270F\uFE0F' : '\uD83D\uDCDD';
    btn.title = t('memo-title');
    slot.appendChild(btn);

    if (memos[placeName]) {
      var memoText = document.createElement('div');
      memoText.className = 'itin-memo-text';
      memoText.textContent = memos[placeName];
      slot.parentElement.appendChild(memoText);
    }
  }
}

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('itin-memo-btn')) {
    var place = e.target.dataset.memoPlace;
    var current = getPlaceMemos()[place] || '';
    var newMemo = prompt(fillText(t('memo-prompt'), { p: place }), current);
    if (newMemo !== null) {
      savePlaceMemo(place, newMemo);
      renderItineraryTimeline();
      showMemoToast(newMemo ? t('memo-saved') : t('memo-deleted'));
    }
  }
});

// --- 8. EXCHANGE RATE (realtime from server) ---
// 초기화 순서상 언어 사전(I18N)이 준비된 뒤에 호출된다(파일 아래쪽 init에서 실행).
var fxRateData = null;
var fxRateState = 'loading'; // loading | ok | fallback

function fxUpdatedDate(v) {
  var s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // 날짜만 온 값은 그대로(시간대 변환 없음)
  var d = new Date(v);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : localDateString(d);
}

// 환율 칩을 현재 언어로 그린다(언어를 바꾸면 다시 호출된다).
function renderFxChip() {
  var chip = document.querySelector('.travel-toolbar .exchange-rate-chip');
  if (!chip) return;
  if (fxRateState === 'ok' && fxRateData) {
    var rateText = fillText(t('fx-chip'), { a: Number(fxRateData.yen100toKrw).toLocaleString(), b: Number(fxRateData.man1wonToYen || 0).toLocaleString() });
    // ExchangeRate-API 무료 엔드포인트(open.er-api.com) 값일 때는 약관에 따라 출처 링크를 함께 보여 준다.
    // (frankfurter·설정값·대략값일 때는 이 링크를 붙이지 않는다.)
    var credit = fxRateData.provider === 'open.er-api'
      ? '<a class="fx-credit" href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">' + escapeHtml(t('fx-credit')) + '</a>'
      : '';
    chip.innerHTML = '<span class="fx-rate-text">' + escapeHtml(rateText) + '</span>' + credit;
    chip.title = fillText(t('fx-title'), { r: fxRateData.jpyToKrw, d: fxUpdatedDate(fxRateData.lastUpdate) });
  } else {
    chip.textContent = t(fxRateState === 'loading' ? 'fx-loading' : 'fx-fallback');
    chip.removeAttribute('title');
  }
}

async function initExchangeRateChip() {
  var toolbar = document.querySelector('.travel-toolbar');
  if (!toolbar || toolbar.querySelector('.exchange-rate-chip')) return;
  var chip = document.createElement('span');
  chip.className = 'exchange-rate-chip';
  toolbar.appendChild(chip);
  fxRateState = 'loading';
  renderFxChip();
  try {
    var resp = await fetch('/api/fx-rate');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    if (data && data.yen100toKrw) {
      fxRateData = data;
      fxRateState = 'ok';
    } else {
      fxRateState = 'fallback';
    }
  } catch(e) {
    fxRateState = 'fallback';
  }
  renderFxChip();
}

// ═══════════════════════════════════════════════
// 9. 로그인 / 일정 저장 · 불러오기
// ═══════════════════════════════════════════════

var currentUser = null;

// 로그인 상태 확인
(async function checkAuth() {
  try {
    var resp = await fetch('/api/auth/me');
    var data = await resp.json();
    currentUser = data.user;
    renderAuthUI();
  } catch(e) {
    currentUser = null;
    renderAuthUI();
  }

  // 미설정 프로바이더 로그인 버튼 숨기기
  try {
    var pResp = await fetch('/api/auth/providers');
    var providers = await pResp.json();
    var navBtn = document.getElementById('loginNaver');
    var kakBtn = document.getElementById('loginKakao');
    var gooBtn = document.getElementById('loginGoogle');
    if (navBtn) navBtn.style.display = providers.naver ? '' : 'none';
    if (kakBtn) kakBtn.style.display = providers.kakao ? '' : 'none';
    if (gooBtn) gooBtn.style.display = providers.google ? '' : 'none';
    if (!providers.naver && !providers.kakao && !providers.google) {
      var btns = document.querySelector('#loginModal .login-buttons');
      if (btns) btns.innerHTML = '<p class="login-none-msg">' + escapeHtml(t('no-auth-config')) + '</p>';
    }
  } catch(e) {}
})();

function renderAuthUI() {
  var authArea = document.getElementById('authArea');
  if (!authArea) return;

  if (currentUser) {
    var providerLabel = { naver: t('provider-naver'), kakao: t('provider-kakao'), google: 'Google' }[currentUser.provider] || '';
    var avatarSrc = safeImageUrl(currentUser.profileImage, 'avatar');
    var imgHtml = avatarSrc
      ? '<img src="' + escapeHtml(avatarSrc) + '" class="auth-avatar" alt="" />'
      : '<span class="auth-avatar-placeholder">👤</span>';
    authArea.innerHTML =
      '<div class="auth-user-info">' +
        imgHtml +
        '<span class="auth-nickname">' + escapeHtml(currentUser.nickname || providerLabel) + '</span>' +
        '<button type="button" id="btnSavePlan" class="toolbar-btn auth-save-btn" title="' + escapeHtml(t('title-save-plan')) + '">' + escapeHtml(t('btn-save-plan')) + '</button>' +
        '<button type="button" id="btnMyPlans" class="toolbar-btn auth-plans-btn" title="' + escapeHtml(t('title-my-plans')) + '">' + escapeHtml(t('btn-my-plans')) + '</button>' +
        '<button type="button" id="btnLogout" class="toolbar-btn auth-logout-btn" title="' + escapeHtml(t('btn-logout')) + '">' + escapeHtml(t('btn-logout')) + '</button>' +
      '</div>';
  } else {
    authArea.innerHTML =
      '<button type="button" id="btnLogin" class="toolbar-btn auth-login-btn" title="' + escapeHtml(t('login-title')) + '" aria-label="' + escapeHtml(t('login-title')) + '">' +
        '<span class="tb-icon" aria-hidden="true">👤</span><span class="tb-label">' + escapeHtml(t('login')) + '</span></button>';
  }
}

// 로그인 모달 열기/닫기 + 저장/불러오기/로그아웃 — event delegation
document.addEventListener('click', function(e) {
  // 로그인 버튼
  if (e.target.closest('#btnLogin')) {
    var modal = document.getElementById('loginModal');
    if (modal) modal.classList.remove('hidden');
    return;
  }

  // 모달 닫기
  if (e.target.closest('#loginModalClose') || (e.target.classList && e.target.classList.contains('login-modal-overlay'))) {
    var modal = document.getElementById('loginModal');
    if (modal) modal.classList.add('hidden');
    return;
  }

  // 로그아웃
  if (e.target.closest('#btnLogout')) {
    if (!confirm(t('logout-confirm'))) return;
    fetch('/api/auth/logout', { method: 'POST' }).then(function() {
      currentUser = null;
      renderAuthUI();
      showMemoToast(t('logged-out'));
    });
    return;
  }

  // 일정 저장
  if (e.target.closest('#btnSavePlan')) {
    savePlanToServer();
    return;
  }

  // 내 일정 열기
  if (e.target.closest('#btnMyPlans')) {
    loadMyPlansList();
    togglePanel('myPlansPanel');
    return;
  }

  // 내 일정 목록에서 불러오기
  if (e.target.closest('.my-plan-load')) {
    var planId = e.target.closest('.my-plan-load').dataset.planId;
    if (planId) loadPlanFromServer(planId);
    return;
  }

  // 내 일정 목록에서 삭제
  if (e.target.closest('.my-plan-delete')) {
    var planId = e.target.closest('.my-plan-delete').dataset.planId;
    if (planId) deletePlanFromServer(planId);
    return;
  }
});

// 일정 저장
async function savePlanToServer() {
  if (!currentUser) {
    showMemoToast(t('login-required'));
    return;
  }
  if (!currentItineraryData) {
    showMemoToast(t('err-no-plan-save'));
    return;
  }

  var cityEl = el('city');
  // 서버에는 예전과 같은 한국어 도시 표기("오사카 (KIX)")를 보내고, 기본 제목은 현재 언어로 만든다.
  var cityMeta = cityEl ? cityCatalog.find(function(c) { return c.key === cityEl.value; }) : null;
  var cityLabel = cityMeta ? cityMeta.label + ' (' + (cityMeta.airport || 'N/A') + ')' : '';
  var cityDisplay = cityMeta ? localPlaceName(cityMeta.label) : '';
  var startDate = el('startDate') ? el('startDate').value : '';
  var days = el('days') ? Number(el('days').value) : 0;
  var theme = el('theme') ? el('theme').value : '';

  var defaultTitle = (cityDisplay || t('japan')) + ' ' + days + t('plan-title-suffix');
  if (startDate) defaultTitle += ' (' + startDate + ')';

  // 모달 표시
  var modal = document.getElementById('saveModal');
  var nameInput = document.getElementById('saveNameInput');
  var dupNotice = document.getElementById('saveDupNotice');
  var confirmBtn = document.getElementById('saveConfirmBtn');
  if (!modal || !nameInput) return;

  nameInput.value = defaultTitle;
  dupNotice.classList.add('hidden');
  dupNotice.innerHTML = '';
  confirmBtn.textContent = t('btn-save');
  confirmBtn.classList.remove('overwrite');
  modal.classList.remove('hidden');
  nameInput.focus();
  nameInput.select();

  // 기존 일정 목록 가져오기
  var existingPlans = [];
  try {
    var listResp = await fetch('/api/my-plans/list');
    var listData = await listResp.json();
    existingPlans = listData.plans || [];
  } catch(e) {}

  // 중복 확인 함수
  function checkDup() {
    var name = nameInput.value.trim();
    var dup = existingPlans.find(function(p) { return p.title === name; });
    if (dup) {
      var savedDate = dup.savedAt ? new Date(dup.savedAt).toLocaleDateString(localeTag()) : '';
      dupNotice.innerHTML = '⚠️ <strong>"' + escapeHtml(name) + '"</strong>' + escapeHtml(t('overwrite-confirm')) + ' (' + escapeHtml(savedDate) + t('overwrite-note');
      dupNotice.className = 'save-dup-notice warn';
      confirmBtn.textContent = t('btn-overwrite');
      confirmBtn.classList.add('overwrite');
      return dup.id;
    } else {
      dupNotice.classList.add('hidden');
      confirmBtn.textContent = t('btn-save');
      confirmBtn.classList.remove('overwrite');
      return null;
    }
  }

  nameInput.addEventListener('input', checkDup);
  var dupId = checkDup();

  // 저장 실행을 Promise로 처리
  return new Promise(function(resolve) {
    function cleanup() {
      modal.classList.add('hidden');
      nameInput.removeEventListener('input', checkDup);
      confirmBtn.replaceWith(confirmBtn.cloneNode(true));
      document.getElementById('saveCancelBtn').replaceWith(
        document.getElementById('saveCancelBtn').cloneNode(true)
      );
      resolve();
    }

    document.getElementById('saveCancelBtn').addEventListener('click', cleanup, { once: true });
    modal.addEventListener('click', function(ev) {
      if (ev.target === modal) cleanup();
    }, { once: true });

    document.getElementById('saveConfirmBtn').addEventListener('click', async function() {
      var title = nameInput.value.trim() || defaultTitle;
      var overwriteId = checkDup();

      var saveData = {
        id: overwriteId || undefined,
        title: title,
        cityKey: cityEl ? cityEl.value : '',
        cityLabel: cityLabel,
        startDate: startDate,
        days: days,
        theme: theme,
        data: {
          itinerary: currentItineraryData,
          flight: selectedFlight || null,
          flightId: selectedFlightId || '',
          stay: selectedStay || null,
          stayId: selectedStayId || '',
          flightResults: flightResults || [],
          stayResults: stayResults || [],
          latestDestList: latestDestList || [],
          latestRecFoodList: latestRecFoodList || [],
          latestFoodList: latestFoodList || [],
          latestDestSearchList: latestDestSearchList || [],
          formValues: {
            city: cityEl ? cityEl.value : '',
            startDate: startDate,
            days: days,
            theme: theme,
            budget: el('budget') ? el('budget').value : 'mid',
            pace: el('pace') ? el('pace').value : 'normal',
            from: el('from') ? el('from').value : '',
            to: el('to') ? el('to').value : '',
            departDate: el('departDate') ? el('departDate').value : '',
            returnDate: el('returnDate') ? el('returnDate').value : '',
            checkIn: el('checkIn') ? el('checkIn').value : '',
            stayArea: el('stayArea') ? el('stayArea').value : '',
            foodCity: el('foodCity') ? el('foodCity').value : ''
          }
        }
      };

      try {
        var resp = await fetch('/api/my-plans/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saveData)
        });
        var result = await resp.json();
        if (resp.ok) {
          showMemoToast(overwriteId ? t('save-overwrite-done') : t('save-success'));
        } else {
          showMemoToast(resp.status === 401 ? t('login-required') : t('save-fail'));
        }
      } catch(e) {
        showMemoToast(t('save-error'));
      }
      cleanup();
    }, { once: true });
  });
}

// 내 일정 목록 불러오기
async function loadMyPlansList() {
  var container = document.getElementById('myPlansContent');
  if (!container) return;
  container.innerHTML = '<p class="my-plans-loading">' + escapeHtml(t('loading-plans')) + '</p>';

  try {
    var resp = await fetch('/api/my-plans/list');
    var data = await resp.json();
    if (!resp.ok) {
      container.innerHTML = '<p class="my-plans-empty">' + escapeHtml(resp.status === 401 ? t('login-required') : t('load-list-error')) + '</p>';
      return;
    }
    if (!data.plans || data.plans.length === 0) {
      container.innerHTML = '<p class="my-plans-empty">' + escapeHtml(t('no-saved-plans')) + '</p>';
      return;
    }

    var html = '';
    data.plans.forEach(function(p) {
      var dateStr = p.savedAt ? new Date(p.savedAt).toLocaleDateString(localeTag()) : '';
      html += '<div class="my-plan-card">' +
        '<div class="my-plan-info">' +
          '<strong>' + escapeHtml(p.title || p.cityLabel || t('plan-default')) + '</strong>' +
          '<small>' + escapeHtml((p.startDate || '') + ' · ' + (Number(p.days) || 0) + t('days-saved') + dateStr + t('saved-suffix')) + '</small>' +
        '</div>' +
        '<div class="my-plan-actions">' +
          '<button type="button" class="my-plan-load" data-plan-id="' + escapeHtml(p.id) + '">' + escapeHtml(t('btn-load')) + '</button>' +
          '<button type="button" class="my-plan-delete" data-plan-id="' + escapeHtml(p.id) + '">' + escapeHtml(t('btn-delete')) + '</button>' +
        '</div>' +
      '</div>';
    });
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<p class="my-plans-empty">' + escapeHtml(t('load-list-error')) + '</p>';
  }
}

// 일정 불러오기
async function loadPlanFromServer(planId) {
  try {
    var resp = await fetch('/api/my-plans/load?id=' + encodeURIComponent(planId));
    var data = await resp.json();
    if (!resp.ok || !data.plan) {
      showMemoToast(resp.status === 401 ? t('login-required') : t('load-fail'));
      return;
    }

    var plan = data.plan;
    var d = plan.data || {};

    // 1. 폼 값 복원
    if (d.formValues) {
      var fv = d.formValues;
      if (fv.city && el('city')) el('city').value = fv.city;
      if (fv.startDate && el('startDate')) el('startDate').value = fv.startDate;
      if (fv.days && el('days')) el('days').value = fv.days;
      if (fv.theme && el('theme')) el('theme').value = fv.theme;
      if (fv.budget && el('budget')) el('budget').value = fv.budget;
      if (fv.pace && el('pace')) el('pace').value = fv.pace;
      if (fv.from && el('from')) el('from').value = fv.from;
      if (fv.to && el('to')) el('to').value = fv.to;
      if (fv.departDate && el('departDate')) el('departDate').value = fv.departDate;
      if (fv.returnDate && el('returnDate')) el('returnDate').value = fv.returnDate;
      if (fv.checkIn && el('checkIn')) el('checkIn').value = fv.checkIn;
      if (fv.stayArea && el('stayArea')) el('stayArea').value = fv.stayArea;
      if (fv.foodCity && el('foodCity')) el('foodCity').value = fv.foodCity;
    }

    // 2. 항공권 복원
    if (d.flight) {
      selectedFlight = d.flight;
      selectedFlightId = d.flightId || '';
    }
    if (d.flightResults && d.flightResults.length > 0) {
      flightResults = d.flightResults;
      try { renderFlightCards(true); } catch(e) {}
    }

    // 3. 숙소 복원
    if (d.stay) {
      selectedStay = d.stay;
      selectedStayId = d.stayId || '';
    }
    if (d.stayResults && d.stayResults.length > 0) {
      stayResults = d.stayResults;
      try { renderStayCards(); } catch(e) {}
    }

    // 4. 추천 목록 복원
    if (d.latestDestList && d.latestDestList.length > 0) {
      latestDestList = d.latestDestList;
      try { renderCards('destCards', latestDestList, 'dest'); } catch(e) {}
    }
    if (d.latestRecFoodList && d.latestRecFoodList.length > 0) {
      latestRecFoodList = d.latestRecFoodList;
      try { renderRecFoodCards(latestRecFoodList); } catch(e) {}
    }
    if (d.latestFoodList && d.latestFoodList.length > 0) {
      latestFoodList = d.latestFoodList;
      try { renderCards('foodCards', latestFoodList, 'food'); } catch(e) {}
    }
    if (d.latestDestSearchList && d.latestDestSearchList.length > 0) {
      latestDestSearchList = d.latestDestSearchList;
      try { renderDestSearchCards(latestDestSearchList); } catch(e) {}
    }

    // 5. 일정 데이터 복원 및 렌더링 (저장된 데이터는 이미 사용자 편집 반영됨 → 저녁 블록 삭제 방지)
    if (d.itinerary) {
      d.itinerary._skipMealStrip = true;
      currentItineraryData = d.itinerary;
      // Reset undo history with loaded state as baseline
      _itinHistory.length = 0;
      _itinHistoryIdx = -1;
      if (typeof renderItinerary === 'function') renderItinerary(d.itinerary);
    }

    // 6. 선택 카드 + 예산 요약 렌더링
    try { renderPlanExtras(); } catch(e) {}

    togglePanel('myPlansPanel');
    showMemoToast(t('load-success'));
  } catch(e) {
    showMemoToast(t('load-error'));
  }
}

// 일정 삭제
async function deletePlanFromServer(planId) {
  if (!confirm(t('delete-confirm'))) return;
  try {
    var resp = await fetch('/api/my-plans/delete?id=' + encodeURIComponent(planId), { method: 'DELETE' });
    var data = await resp.json();
    if (resp.ok && data.deleted) {
      showMemoToast(t('delete-success'));
      loadMyPlansList();
    } else {
      showMemoToast(t('delete-fail'));
    }
  } catch(e) {
    showMemoToast(t('delete-error'));
  }
}

// ── Klook Tour Widget (Travelpayouts) ──
var KLOOK_CITY_MAP = {
  tokyo: 'Tokyo', osaka: 'Osaka', kyoto: 'Kyoto', sapporo: 'Sapporo',
  fukuoka: 'Fukuoka', nagoya: 'Nagoya', hiroshima: 'Hiroshima', okinawa: 'Okinawa',
  kobe: 'Kobe', kanazawa: 'Kanazawa', nagasaki: 'Nagasaki', sendai: 'Sendai',
  hakone: 'Hakone', kamakura: 'Kamakura', nikko: 'Nikko', nara: 'Nara',
  yokohama: 'Yokohama', kumamoto: 'Kumamoto', kagoshima: 'Kagoshima',
  matsuyama: 'Matsuyama', takamatsu: 'Takamatsu', niigata: 'Niigata',
  okayama: 'Okayama', hakodate: 'Hakodate'
};

var klookLoadSeq = 0;

function renderTourFallbackLinks(target, cityName, displayName, cityKey) {
  // 언어를 바꿀 때 다시 그릴 수 있게 도시 정보를 남겨 둔다.
  target.classList.add('tour-fallback');
  target.dataset.tourQuery = cityName;
  target.dataset.tourCityKey = cityKey || '';
  var shownName = displayName || cityName;
  var tourLinkStyle = 'display:inline-block;padding:9px 18px;background:var(--bg-2);color:var(--fg-1);border:1px solid var(--line-2);border-radius:var(--r-md);text-decoration:none;font-size:13px;font-weight:500;transition:all .15s ease;';
  target.innerHTML = '<div style="text-align:center;padding:24px 16px;">' +
    '<p style="margin:0 0 14px;font-size:13px;color:var(--fg-3);letter-spacing:0.04em;">' + escapeHtml(fillText(t('tours-popular'), { city: shownName })) + '</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">' +
    '<a href="https://www.klook.com/ko/search/result/?query=' + encodeURIComponent(cityName + ' tour') + '" target="_blank" rel="noopener" style="' + tourLinkStyle + '">' + escapeHtml(t('tour-klook')) + '</a>' +
    '<a href="https://www.viator.com/searchResults/all?text=' + encodeURIComponent(cityName) + '&destId=&tags=alltrips" target="_blank" rel="noopener" style="' + tourLinkStyle + '">' + escapeHtml(t('tour-viator')) + '</a>' +
    '<a href="https://www.getyourguide.com/s/?q=' + encodeURIComponent(cityName + ', Japan') + '&searchSource=1" target="_blank" rel="noopener" style="' + tourLinkStyle + '">GetYourGuide</a>' +
    '</div></div>';
}

function loadKlookWidget(cityKey) {
  var wrap = document.getElementById('klookWidgetWrap');
  if (!wrap) return;
  var seq = ++klookLoadSeq;
  var mappedName = KLOOK_CITY_MAP[cityKey];
  // 위젯이 지원하지 않는 도시는 도쿄 투어를 보여주지 않고, 그 도시 이름으로 검색 링크만 보여준다.
  var cityName = mappedName || cityLabelByKey(cityKey) || KLOOK_CITY_MAP.tokyo;
  var displayName = tourCityDisplayName(cityKey, cityName);
  wrap.innerHTML = '<div id="tp-klook-widget" style="min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--fg-3);font-size:13px;">' + escapeHtml(fillText(t('tours-loading'), { city: displayName })) + '</div>';
  if (!mappedName) {
    renderTourFallbackLinks(document.getElementById('tp-klook-widget'), cityName, displayName, cityKey);
    return;
  }
  var sc = document.createElement('script');
  sc.async = true;
  sc.charset = 'utf-8';
  sc.src = 'https://tpwgt.com/content?currency=KRW&trs=507447&shmarker=710362&locale=ko&city=' + encodeURIComponent(cityName) + '&category=3&amount=6&powered_by=true&campaign_id=137&promo_id=4497';
  wrap.appendChild(sc);

  // 8초 안에 위젯이 실제로 그려지지 않으면 바로가기 링크로 바꾼다.
  // 위젯은 #tp-klook-widget 안이 아니라 같은 wrap 안의 형제 요소로 삽입되므로 wrap 전체를 본다.
  setTimeout(function() {
    if (seq !== klookLoadSeq) return;
    var widget = document.getElementById('tp-klook-widget');
    if (!widget) return;
    var rendered = Array.prototype.some.call(wrap.querySelectorAll('[id^="klook_widget_wrapper"], iframe'), function(node) {
      return node.offsetHeight > 40;
    });
    if (rendered) { widget.remove(); return; }
    renderTourFallbackLinks(widget, cityName, displayName, cityKey);
  }, 8000);
}

// 투어 바로가기 링크가 떠 있으면 현재 언어로 다시 그린다.
function refreshTourFallback() {
  var w = document.getElementById('tp-klook-widget');
  if (!w || !w.classList.contains('tour-fallback')) return;
  var key = w.dataset.tourCityKey || '';
  renderTourFallbackLinks(w, w.dataset.tourQuery || '', tourCityDisplayName(key, w.dataset.tourQuery || ''), key);
}

// 도시 목록에 있는 도시는 화면 언어 이름으로, 없으면(키만 있는 경우) 검색용 이름을 그대로 보여준다.
function tourCityDisplayName(cityKey, fallbackName) {
  var found = (cityCatalog || []).find(function(c) { return c.key === cityKey; });
  return found ? localPlaceName(found.label) : (fallbackName || '');
}



// ═══════════════════════════════════════════════
// 10. PDF EXPORT
// ═══════════════════════════════════════════════
document.addEventListener('click', function(e) {
  if (e.target.closest('#btnExportPdf')) {
    var text = buildItineraryText('text');
    if (!text || !currentItineraryData || !currentItineraryData.itinerary) {
      showMemoToast(t('no-plan-yet'));
      return;
    }
    var printWin = window.open('', '_blank');
    if (!printWin) { showMemoToast(t('popup-blocked')); return; }
    var lines = text.split('\n');
    var htmlBody = lines.map(function(line) {
      if (line.startsWith('===') || line.startsWith('---')) return '<h2 style="border-bottom:1px solid #d8d3c8;padding-bottom:4px;margin-top:16px">' + escapeHtml(line.replace(/^[=\-\s]+|[=\-\s]+$/g, '')) + '</h2>';
      if (line.startsWith('[') && line.endsWith(']')) return '<h3 style="color:#9c7a39;margin-top:12px">' + escapeHtml(line) + '</h3>';
      if (line.trim() === '') return '<br>';
      return '<p style="margin:2px 0">' + escapeHtml(line) + '</p>';
    }).join('\n');
    printWin.document.write('<html lang="' + escapeHtml(currentLang || 'ko') + '"><head><meta charset="utf-8"><title>' + escapeHtml(shareTitle()) + '</title><style>body{font-family:sans-serif;max-width:700px;margin:20px auto;padding:0 16px;font-size:13px;color:#1a1814}h2{font-size:16px}h3{font-size:14px}p{line-height:1.5}@media print{body{margin:0}}</style></head><body>' + htmlBody + '<script>setTimeout(function(){window.print()},300)<\/script></body></html>');
    printWin.document.close();
  }
});

// ═══════════════════════════════════════════════
// 12. WISHLIST (localStorage)
// ═══════════════════════════════════════════════
function getWishlist() {
  try { return JSON.parse(localStorage.getItem('travelWishlist') || '[]'); } catch(e) { return []; }
}
function saveWishlist(list) {
  localStorage.setItem('travelWishlist', JSON.stringify(list));
}
function isWishlisted(name) {
  return getWishlist().some(function(w) { return w.name === name; });
}
function toggleWishlist(name, type, area, city) {
  var list = getWishlist();
  var idx = list.findIndex(function(w) { return w.name === name; });
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push({ name: name, type: type || 'dest', area: area || '', city: city || '', addedAt: new Date().toISOString() });
    trackPreference(type === 'food' ? 'genre' : 'theme', area || city || '', 'wishlist');
  }
  saveWishlist(list);
  return idx < 0;
}

function renderWishlistPanel() {
  var container = document.getElementById('wishlistContent');
  if (!container) return;
  var list = getWishlist();
  if (list.length === 0) {
    container.innerHTML = '<div class="wishlist-empty">' + escapeHtml(t('wishlist-empty1')) + '<br>' + escapeHtml(t('wishlist-empty2')) + '</div>';
    return;
  }
  var html = '<div style="padding:4px 8px;font-size:12px;color:var(--fg-3)">' + escapeHtml(fillText(t('wishlist-count'), { n: list.length })) + '</div>';
  for (var i = 0; i < list.length; i++) {
    var w = list[i];
    html += '<div class="wishlist-item">';
    html += '<div><div class="wishlist-item-name">' + escapeHtml(w.name) + '</div>';
    html += '<div class="wishlist-item-meta">' + escapeHtml(w.type === 'food' ? t('tab-food') : t('tab-dest')) + ' · ' + escapeHtml(w.area || w.city || '') + '</div></div>';
    html += '<button class="wishlist-remove" data-wish-name="' + escapeHtml(w.name) + '">\u2715</button>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function addWishlistButtons() {
  document.querySelectorAll('.card .card-body h4').forEach(function(h4) {
    if (h4.querySelector('.wishlist-btn')) return;
    var name = h4.textContent.replace(/^[^\w\uAC00-\uD7AF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/, '').trim();
    if (!name) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wishlist-btn' + (isWishlisted(name) ? ' wishlisted' : '');
    btn.textContent = isWishlisted(name) ? '\u2764\uFE0F' : '\uD83E\uDE76';
    btn.dataset.wishName = name;
    btn.title = t('wishlist-toggle');
    h4.appendChild(btn);
  });
}

var _origRenderCards2 = renderCards;
renderCards = function(targetId, items, mode) {
  _origRenderCards2(targetId, items, mode);
  setTimeout(addWishlistButtons, 50);
};
var _origRenderRecFoodCards2 = renderRecFoodCards;
renderRecFoodCards = function(items) {
  _origRenderRecFoodCards2(items);
  setTimeout(addWishlistButtons, 50);
};
var _origRenderDestSearchCards2 = renderDestSearchCards;
renderDestSearchCards = function(items) {
  _origRenderDestSearchCards2(items);
  setTimeout(addWishlistButtons, 50);
};

document.addEventListener('click', function(e) {
  var wishBtn = e.target.closest('.wishlist-btn');
  if (wishBtn) {
    e.stopPropagation();
    var name = wishBtn.dataset.wishName;
    var card = wishBtn.closest('.card');
    var type = card && card.querySelector('.card-info-row') ? (card.querySelector('.card-info-row').textContent.match(/\uB77C\uBA58|\uC2A4\uC2DC|\uC774\uC790\uCE74\uC57C|\uCFE0\uC2DC|\uD0C0\uCF54/) ? 'food' : 'dest') : 'dest';
    var area = card && card.querySelector('.card-info-row') ? card.querySelector('.card-info-row').textContent.split('\u00B7').pop().trim() : '';
    var added = toggleWishlist(name, type, area);
    wishBtn.textContent = added ? '\u2764\uFE0F' : '\uD83E\uDE76';
    wishBtn.classList.toggle('wishlisted', added);
    showMemoToast(added ? t('wishlist-add') : t('wishlist-remove'));
    return;
  }
  var removeBtn = e.target.closest('.wishlist-remove');
  if (removeBtn) { toggleWishlist(removeBtn.dataset.wishName); renderWishlistPanel(); return; }
  if (e.target.closest('#btnWishlist')) { renderWishlistPanel(); togglePanel('wishlistPanel'); return; }
});

// ═══════════════════════════════════════════════
// 13. SEARCH HISTORY (localStorage)
// ═══════════════════════════════════════════════
var SEARCH_HISTORY_KEY = 'travelSearchHistory';
var SEARCH_HISTORY_MAX = 20;

function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); } catch(e) { return []; }
}
function saveSearchHistory(list) {
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list.slice(0, SEARCH_HISTORY_MAX)));
}
// \uAE30\uB85D\uC5D0\uB294 \uB3C4\uC2DC \uD0A4(osaka \uB4F1) \uB300\uC2E0 \uD654\uBA74\uC6A9 \uB3C4\uC2DC \uC774\uB984\uC744 \uC4F4\uB2E4(\uD0A4\uB294 params\uC5D0 \uB0A8\uACA8 \uB2E4\uC2DC \uAC80\uC0C9\uD560 \uB54C \uC0AC\uC6A9).
function searchHistoryLabel(type, params) {
  params = params || {};
  var city = params.city ? cityNameByKey(params.city) : '';
  if (type === 'plan') return t('hist-plan') + city + ' ' + (params.days || '') + t('days-unit');
  if (type === 'flight') return t('hist-flight') + formatAirportDisplay(resolveAirportCode(params.from)) + ' → ' + (formatAirportDisplay(resolveAirportCode(params.to)) || city);
  if (type === 'stay') return t('hist-stay') + city;
  if (type === 'food') return t('hist-food') + city + (params.genre ? ' ' + params.genre : '');
  if (type === 'dest') return t('hist-dest') + city;
  return String(type || '');
}

function addSearchHistory(type, params) {
  var list = getSearchHistory();
  var label = searchHistoryLabel(type, params);
  list.unshift({ type: type, label: label, params: params, time: Date.now() });
  var seen = {};
  list = list.filter(function(item) {
    if (seen[item.label]) return false;
    seen[item.label] = true;
    return true;
  });
  saveSearchHistory(list);
}

function renderSearchHistoryPanel() {
  var container = document.getElementById('searchHistoryContent');
  if (!container) return;
  var list = getSearchHistory();
  if (list.length === 0) {
    container.innerHTML = '<div class="wishlist-empty">' + escapeHtml(t('hist-empty')) + '</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var ago = Math.round((Date.now() - item.time) / 60000);
    var timeStr = ago < 60 ? fillText(t('min-ago'), { n: Math.max(0, ago) }) : fillText(t('hours-ago'), { n: Math.round(ago / 60) });
    html += '<div class="search-history-item" data-sh-index="' + i + '">';
    html += '<div><div class="search-history-label">' + escapeHtml(item.params ? searchHistoryLabel(item.type, item.params) : item.label) + '</div>';
    html += '<div class="search-history-time">' + escapeHtml(timeStr) + '</div></div></div>';
  }
  html += '<button type="button" class="search-history-clear" id="btnClearHistory">' + escapeHtml(t('hist-clear')) + '</button>';
  container.innerHTML = html;
}

document.addEventListener('click', function(e) {
  if (e.target.closest('#btnSearchHistory')) { renderSearchHistoryPanel(); togglePanel('searchHistoryPanel'); return; }
  if (e.target.closest('#btnClearHistory')) { localStorage.removeItem(SEARCH_HISTORY_KEY); renderSearchHistoryPanel(); showMemoToast(t('history-cleared')); return; }
  var shItem = e.target.closest('.search-history-item');
  if (shItem) {
    var idx = Number(shItem.dataset.shIndex);
    var list = getSearchHistory();
    var item = list[idx];
    if (!item) return;
    if (item.type === 'plan' && item.params) {
      if (item.params.city) el('city').value = item.params.city;
      if (item.params.days) el('days').value = item.params.days;
      if (item.params.theme) el('theme').value = item.params.theme;
      el('btnPlan').click();
    } else if (item.type === 'food' && item.params) {
      if (item.params.city) el('foodCity').value = item.params.city;
      if (item.params.genre) el('foodGenre').value = item.params.genre;
      el('btnFood').click();
    } else if (item.type === 'stay' && item.params) {
      if (item.params.city) el('stayCity').value = item.params.city;
      el('btnStays').click();
    }
    togglePanel('searchHistoryPanel');
  }
});

// Record search history on button clicks (capture phase)
(function() {
  el('btnPlan').addEventListener('click', function() {
    addSearchHistory('plan', { city: el('city').value, days: el('days').value, theme: el('theme').value });
  }, true);
  el('btnFood').addEventListener('click', function() {
    addSearchHistory('food', { city: el('foodCity').value, genre: el('foodGenre').value });
  }, true);
  el('btnStays').addEventListener('click', function() {
    addSearchHistory('stay', { city: el('stayCity').value });
  }, true);
  el('btnFlights').addEventListener('click', function() {
    addSearchHistory('flight', { from: el('from').value, to: el('to').value, city: el('city').value });
  }, true);
  if (el('btnDestSearch')) {
    el('btnDestSearch').addEventListener('click', function() {
      addSearchHistory('dest', { city: el('destSearchCity').value, theme: el('destSearchTheme').value });
    }, true);
  }
})();

// ═══════════════════════════════════════════════
// 14. USER PREFERENCE LEARNING (localStorage)
// ═══════════════════════════════════════════════
var PREF_KEY = 'travelPreferences';

function getPreferences() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch(e) { return {}; }
}
function savePreferences(prefs) {
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}
function trackPreference(category, value, action) {
  if (!value || !category) return;
  var prefs = getPreferences();
  if (!prefs[category]) prefs[category] = {};
  var v = String(value).toLowerCase().trim();
  if (!v) return;
  var weight = action === 'select' ? 3 : action === 'wishlist' ? 5 : action === 'search' ? 1 : 1;
  prefs[category][v] = (prefs[category][v] || 0) + weight;
  savePreferences(prefs);
}
function getTopPreferences(category, limit) {
  var prefs = getPreferences();
  var cat = prefs[category] || {};
  return Object.entries(cat)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, limit || 5)
    .map(function(e) { return e[0]; });
}

el('city').addEventListener('change', function() { trackPreference('city', el('city').value, 'select'); });
el('theme').addEventListener('change', function() { trackPreference('theme', el('theme').value, 'select'); });

document.addEventListener('click', function(e) {
  if (e.target.closest('.flight-select-btn')) {
    var card = e.target.closest('.flight-card');
    if (card) trackPreference('airline', card.querySelector('.airline-badge') ? card.querySelector('.airline-badge').textContent : '', 'select');
  }
  if (e.target.closest('.stay-select-btn')) {
    var stayCard = e.target.closest('.stay-card');
    if (stayCard) {
      var stayMeta = stayCard.querySelector('.stay-meta');
      if (stayMeta) trackPreference('stayArea', stayMeta.textContent.split('\u00B7').pop().trim(), 'select');
    }
  }
});

function showPreferenceHints() {
  var topCities = getTopPreferences('city', 3);
  var topThemes = getTopPreferences('theme', 2);
  if (topCities.length === 0 && topThemes.length === 0) return;
  var condPanel = document.querySelector('#section-conditions');
  if (!condPanel) return;
  // 언어를 바꾸면 다시 그리므로 이전 안내는 지운다.
  var oldHints = condPanel.parentNode ? condPanel.parentNode.querySelector('.pref-hints') : null;
  if (oldHints) oldHints.remove();
  var hints = [];
  if (topCities.length > 0) {
    var cityLabels = topCities.map(function(k) {
      var c = cityCatalog.find(function(cc) { return cc.key === k; });
      return c ? localPlaceName(c.label) : k;
    });
    hints.push(t('pref-cities') + cityLabels.join(', '));
  }
  if (topThemes.length > 0) {
    var themeName = function(k) { var v = t('theme-' + k); return v === 'theme-' + k ? k : v; };
    hints.push(t('pref-themes') + topThemes.map(themeName).join(', '));
  }
  var div = document.createElement('div');
  div.className = 'pref-hints';
  div.style.cssText = 'font-size:12px;color:var(--fg-3);padding:4px 0;';
  div.innerHTML = hints.map(function(h) { return '<span class="pref-badge">' + escapeHtml(h) + '</span>'; }).join(' ');
  condPanel.after(div);
}
setTimeout(showPreferenceHints, 2000);

// ═══════════════════════════════════════════════
// 15. LANGUAGE SWITCHER (i18n)
// ═══════════════════════════════════════════════
// 저장소가 막힌 브라우저(개인 정보 보호 모드 등)에서도 스크립트가 멈추지 않게 한다.
var currentLang = (function() {
  var saved = '';
  try { saved = localStorage.getItem('travelLang') || ''; } catch (e) { saved = ''; }
  return saved === 'en' || saved === 'ja' ? saved : 'ko';
})();


var I18N = {
  ko: {
    'section-conditions': '여행 조건', 'section-results': '추천 결과',
    'section-explore': '탐색', 'section-flights': '항공권 탐색',
    'section-stays': '숙소 탐색', 'section-tours': '투어 / 액티비티',
    'btn-plan': '추천+AI일정 통합 생성', 'btn-flights': '항공권 검색',
    'btn-stays': '숙소 검색', 'btn-food': '검색',
    'btn-add': '추가', 'btn-cancel': '취소', 'btn-close': '닫기',
    'btn-save': '저장', 'btn-cancel2': '취소', 'btn-more': '더보기',
    'btn-refresh-plan': 'AI 일정 새로고침',
    'btn-undo': '\u21A9 되돌리기', 'btn-redo': '\u21AA 다시',
    'tagline': 'AI 기반 여행지·항공권·맛집 추천',
    'brand-subtitle': 'AI 일본 여행 플래너',
    'meta-description': 'Tabimaru는 일본 여행지·항공권·숙소·맛집을 한곳에서 찾고 AI로 여행 일정을 만들어 주는 일본 여행 플래너예요.',
    'login': '로그인',
    'toolbar-export': '내보내기', 'toolbar-checklist': '체크리스트',
    'toolbar-emergency': '긴급', 'toolbar-phrases': '회화',
    'toolbar-weather': '날씨', 'toolbar-wishlist': '찜',
    'toolbar-history': '검색기록',
    'label-city': '여행 지역', 'label-startDate': '출발 날짜',
    'label-days': '여행 일수', 'label-theme': '여행 테마',
    'label-city2': '도시', 'label-theme2': '테마',
    'label-city3': '도시', 'label-genre': '장르',
    'label-from-airport': '출발 공항', 'label-to-airport': '도착 공항',
    'label-depart-date': '출발일', 'label-return-date': '복귀일(왕복)',
    'label-flight-pref': '추천 기준',
    'label-checkin': '체크인', 'label-checkout': '체크아웃',
    'label-guests': '인원', 'label-rooms': '객실 수', 'label-sort': '정렬',
    'theme-mixed': '밸런스', 'theme-foodie': '미식',
    'theme-culture': '문화', 'theme-shopping': '쇼핑', 'theme-nature': '자연',
    'theme-all': '전체',
    'trip-oneway': '편도', 'trip-roundtrip': '왕복', 'trip-multicity': '다구간',
    'sort-recommended': '추천순', 'sort-price': '최저가순',
    'sort-duration': '최단시간순', 'sort-recommended2': '추천순',
    'pref-balanced': '가격/시간 균형',
    'pref-cheap': '최저가 우선', 'pref-fast': '최단시간 우선',
    'type-all': '전체', 'type-hotel': '호텔', 'type-ryokan': '료칸',
    'type-apartment': '레지던스', 'type-guesthouse': '게스트하우스',
    'tab-rec-dest': '추천 여행지', 'tab-rec-food': '추천 맛집',
    'tab-dest': '여행지', 'tab-food': '맛집',
    'ai-chat-title': 'AI 여행 조건 채팅',
    'ai-itinerary': 'AI 일정',
    'itinerary-map': '일정 지도',
    'weather-title': '여행지 날씨',
    'manual-flight': '직접 항공편 입력',
    'manual-stay': '직접 숙소 입력',
    'modal-add-plan': '일정에 추가',
    'modal-day-select': 'Day 선택', 'modal-timeslot': '시간대',
    'slot-morning': '오전', 'slot-afternoon': '오후', 'slot-allday': '종일',
    'slot-breakfast': '아침', 'slot-lunch': '점심', 'slot-dinner': '저녁',
    'panel-checklist': '\u2705 여행 준비 체크리스트',
    'panel-emergency': '\uD83C\uDD98 일본 긴급 정보',
    'panel-phrases': '\uD83D\uDDE3 일본어 여행 회화',
    'panel-weather': '\uD83C\uDF24 여행지 날씨 예보',
    'panel-export': '\uD83D\uDCCB 일정 내보내기',
    'panel-wishlist': '\u2764\uFE0F 찜 / 위시리스트',
    'panel-search-history': '🕘 검색 기록',
    'panel-myplans': '📂 내 저장 일정',
    'export-pdf': '\uD83D\uDCC4 PDF 다운로드',
    'export-text': '\uD83D\uDCC4 텍스트 복사',
    'export-markdown': '\uD83D\uDCDD 마크다운 복사',
    'export-link': '\uD83D\uDD17 링크 복사',
    'login-title': '로그인', 'save-title': '💾 일정 저장',
    'tours-note': '여행 도시의 인기 투어와 액티비티를 확인하세요. (Klook 제공)',
    'memo-saved': '메모가 저장되었습니다.',
    'no-results': '결과 없음',
    'add-to-plan': '일정에 추가',
    'promote-to-rec': '\u2196\uFE0F 추천 여행지로',
    'map-link': '지도',
    'err-rate-limit': '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    'err-need-plan': '먼저 AI 일정을 생성해주세요.',
    'loading': '로딩 중...',
    'per-night': '/ 박',
    'day-prefix': 'Day ',
    'arrival': '도착',
    'departure': '출발',
    'arrival-pending': '도착 미정',
    'departure-pending': '출발 미정',
    'checkin': '체크인',
    'checkout': '체크아웃',
    'stay': '숙소',
    'selected-flight': '선택 항공권',
    'selected-stay': '선택 숙소',
    'selected-mark': '선택됨 (AI 일정 반영)',
    'include-ai': 'AI 일정에 포함',
    'won': '원',
    'nights': '박',
    'airline': '항공사',
    'fare-base': '요금: 기본 ',
    'fare-tax': ' · 세금 ',
    'fare-fee': ' · 수수료 ',
    'price-na': '요금 미확인',
    'airline-na': '항공사 정보 없음',
    'price-no-info': '가격 정보 없음',
    'provider-na': '숙소 제공사 없음',
    'edit': '✏️수정',
    'delete': '✕삭제',
    'room': '객실 ',
    'rooms-label': '객실 ',
    'guests-label': ' · 인원 ',
    'per-night-unit': '원/박',
    'no-selection': '선택된 항공권/숙소가 없습니다.',
    'meal-breakfast': '아침',
    'meal-lunch': '점심',
    'meal-dinner': '저녁',
    'time-morning': '오전',
    'time-afternoon': '오후',
    'time-allday': '종일',
    'chat-user': '사용자',
    'chat-ai': 'AI',
    'chat-placeholder': '가고 싶은 장소를 채팅으로 입력하면 공항 기준 지역과 여행 조건을 자동으로 맞춰드릴게요.',
    'chat-enter-msg': '요청 문장을 입력해 주세요.',
    'chat-processing': '요청 내용을 반영해서 새 추천을 생성합니다.',
    'chat-error': '요청 처리 중 오류가 발생했습니다: ',
    'source-rule': '규칙기반 (기본)',
    'source-gemini': '✨ AI 기반 (Gemini)',
    'source-openai': '✨ AI 기반 (OpenAI)',
    'source-planner': '✨ AI 기반 (Planner)',
    'source-fallback': '📋 규칙기반 (AI 미응답 시 폴백)',
    'source-tp': '✨ Travelpayouts 실시간',
    'source-amadeus': '✨ Amadeus',
    'source-rakuten': '✨ Rakuten Travel 실시간',
    'source-google': '✨ Google Places 기반',
    'source-tabelog': '✨ 타베로그 스타일',
    'source-food-fb': '📋 규칙기반 (폴백)',
    'mock-notice': '현재 더미 데이터로 표시 중입니다. (API 실패 또는 미연동)',
    'transport-subway': '🚇 지하철',
    'transport-train': '🚃 전철',
    'transport-bus': '🚌 버스',
    'transport-tram': '🚊 트램',
    'transport-transit': '🚍 대중교통',
    'transport-walk': '🚶 도보',
    'transport-est': '📍 추정',
    'transport-err': '⚠️ 오류',
    'total-fare': '합계: ¥',
    'free': '무료',
    'budget-low': '절약',
    'budget-mid': '표준',
    'budget-high': '프리미엄',
    'cost-flight': '✈️ 항공권',
    'cost-stay': '🏨 숙소 (',
    'cost-food': '🍜 식비',
    'cost-transport': '🚃 교통비',
    'cost-activity': '🎫 활동비',
    'rec-dest': '추천 여행지',
    'error-prefix': '오류: ',
    'copy-text-done': '텍스트가 클립보드에 복사되었습니다!',
    'copy-md-done': '마크다운이 복사되었습니다!',
    'copy-itin-done': '일정이 클립보드에 복사되었습니다!',
    'weather-loading': '날씨 정보 로딩 중...',
    'weather-error': '날씨 정보를 불러올 수 없습니다.',
    'logout-confirm': '로그아웃 하시겠습니까?',
    'login-required': '로그인이 필요합니다.',
    'save-success': '일정이 저장되었습니다!',
    'no-plan-yet': '일정을 먼저 생성해주세요.',
    'add-to-plan-btn': '일정에 추가',
    'promote-food': '⬆ 추천 맛집으로',
    'wishlist-add': '찜 추가됨',
    'wishlist-remove': '찜 제거됨',
    'loading': '처리 중...',
    'err-timeout': '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
    'err-network': '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.',
    'err-server': '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    'confirm-time-conflict': '이 시간대에 이미 일정이 있습니다. 추가하시겠습니까?',
    'search-flights': '검색',
    'search-stays': '검색',
    'btn-run': 'AI 추천',
    'btn-run-sync': '통합 생성',
    'partial-failure': '일부 데이터를 가져오지 못했습니다',
    'open-now': '영업중',
    'korea': '한국',
    'japan': '일본',
    'airport-suffix': '공항',
    'drag-handle': '☰ 드래그',
    'map-link': '지도',
    'total-min': '총 ',
    'min-suffix': '분',
    'stops': '경유 ',
    'stops-suffix': '회',
    'airline-label': '항공사: ',
    'fare-detail': '요금: 기본 ',
    'book-flight': '✈ 예약하기',
    'skyscanner': '스카이스캐너',
    'kayak': '카약',
    'move-up': '위로',
    'move-down': '아래로',
    'route-calc': '🚃 경로 교통비 계산',
    'amenities': '편의시설: ',
    'won-suffix': '원',
    'not-selected': '미선택',
    'cost-stay-nights': '박',
    'cost-summary': '합계 (예상)',
    'budget-note': '기준 · 1인 · ',
    'budget-note2': '일 · 식비/교통/활동은 예상치',
    'category-default': '추천',
    'err-prefix': '오류: ',
    'per-night-display': '원/박',
    'rating-prefix': '평점 ',
    'offer-label': '오퍼 ',
    'room-label': '객실 ',
    'meal-label': '식사 ',
    'cancel-label': '취소 ',
    'total-prefix': '총 ',
    'book-page': '예약 페이지',
    'rooms-guests': '객실 ',
    'guests-sep': ' · 인원 ',
    'err-multicity': '다구간 검색은 최소 2개 구간이 필요합니다.',
    'model-label': ' [모델: ',
    'chat-method': '채팅 해석 방식: ',
    'manual-input': '직접입력',
    'err-airline-required': '항공사 또는 편명을 입력해주세요.',
    'err-stay-required': '숙소명을 입력해주세요.',
    'err-return-date': '귀국일이 출발일보다 빠를 수 없습니다.',
    'err-checkout-date': '체크아웃이 체크인 이후여야 합니다.',
    'share-title': '여행 일정',
    'fx-loading': '¥/₩ 로딩...',
    'fx-fallback': '¥/₩ 환율 정보 없음',
    'provider-naver': '네이버',
    'provider-kakao': '카카오',
    'btn-save-plan': '💾 저장',
    'btn-my-plans': '📂 내 일정',
    'btn-logout': '로그아웃',
    'btn-login': '👤 로그인',
    'err-no-plan-save': '저장할 일정이 없습니다. 먼저 일정을 생성해주세요.',
    'plan-title-suffix': '일 여행',
    'btn-save': '저장',
    'btn-overwrite': '덮어쓰기',
    'overwrite-confirm': ' 이름의 일정이 이미 있습니다.',
    'overwrite-note': ' 저장)<br>저장하면 기존 일정을 덮어씁니다.',
    'save-overwrite-done': '기존 일정을 덮어썼습니다!',
    'save-fail': '저장 실패',
    'save-error': '저장 중 오류가 발생했습니다.',
    'loading-plans': '불러오는 중...',
    'no-saved-plans': '저장된 일정이 없습니다.',
    'plan-default': '일정',
    'days-saved': '일 · ',
    'btn-load': '불러오기',
    'btn-delete': '삭제',
    'load-list-error': '목록을 불러올 수 없습니다.',
    'load-fail': '불러오기 실패',
    'load-success': '일정을 불러왔습니다!',
    'load-error': '불러오기 중 오류가 발생했습니다.',
    'delete-confirm': '이 일정을 삭제하시겠습니까?',
    'delete-success': '일정이 삭제되었습니다.',
    'delete-fail': '삭제 실패',
    'delete-error': '삭제 중 오류가 발생했습니다.',
    'route-need-2': '일정에 장소가 2개 이상 필요합니다.',
    'calculating': '계산 중...',
    'free-label': '무료',
    'source-ai-calc': '✨ AI 기반 계산',
    'source-dist-est': '📏 거리 기반 추정치',
    'source-google-route': '🗺 Google 경로 정보',
    'err-input': '입력값이 올바르지 않습니다.',
    'source-ai-google': '✨ AI + Google Places 기반',
    'source-rule-fb': '📋 규칙기반 추천 (폴백)',
    'source-ai-rec': '✨ AI 기반 추천',
    'rec-prefix': '추천 여행지: ',
    'flight-prefix': '항공편: ',
    'food-prefix': '맛집: ',
    'stay-prefix': '숙소: ',
    'err-need-plan-first': '먼저 AI 일정을 생성해주세요.',
    'memo-saved': '메모 저장됨',
    'memo-deleted': '메모 삭제됨',
    'no-auth-config': '현재 로그인 서비스가 설정되지 않았습니다.',
    'logged-out': '로그아웃 되었습니다.',
    'plan-saved-overwrite': '기존 일정을 덮어썼습니다!',
    'plan-saved': '일정이 저장되었습니다!',
    'popup-blocked': '팝업이 차단되었습니다.',
    'history-cleared': '검색 기록이 삭제되었습니다.',
    'remove-segment': '삭제',
    'empty-dest': '여행 지역·날짜·테마를 고른 뒤 [추천+AI일정 통합 생성]을 누르면 추천 여행지와 일정, 항공권·숙소가 한 번에 채워져요.',
    'empty-plan': '아직 만든 일정이 없어요. [추천+AI일정 통합 생성]을 눌러 시작해 보세요.',
    'empty-rec-food': '일정을 만들면 여행지 주변 추천 맛집이 여기에 표시돼요.',
    'empty-rec-food-none': '이번 일정에 맞는 추천 맛집을 아직 찾지 못했어요. 아래 [탐색 > 맛집]에서 도시별 맛집을 찾아보세요.',
    'empty-flights': '일정을 만들면 여행 날짜에 맞춰 항공권을 찾아드려요. 조건을 직접 바꾸고 [항공권 검색]을 눌러도 돼요.',
    'empty-stays': '일정을 만들면 여행 날짜에 맞춰 숙소를 찾아드려요. 조건을 직접 바꾸고 [숙소 검색]을 눌러도 돼요.',
    'empty-search': '[검색]을 누르면 결과가 여기에 표시돼요.',
    'empty-itinerary': '일정을 만들지 못했어요. 조건을 조금 바꾸거나 잠시 후 [추천+AI일정 통합 생성]을 다시 눌러 주세요. 추천 여행지를 아래 날짜 칸에 끌어다 놓아 직접 채울 수도 있어요.',
    'map-no-coords': '지도에 표시할 위치 정보가 있는 장소가 아직 없어요.',
    'map-loading': '지도를 불러오는 중이에요…',
    'map-failed': '지도를 불러오지 못했어요. 장소 옆 MAP 링크로 위치를 확인할 수 있어요.',
    'map-partial': '위치 정보가 없는 장소 {n}곳은 지도에서 빠졌어요.',
    'photo-credit': '사진:',
    'photo-scope-city': '도시 대표 사진',
    'photo-scope-genre': '음식 예시 사진',
    'stay-date-unconfirmed': '날짜 미확인 최저가',
    'stay-date-unconfirmed-tip': '선택한 날짜의 빈방과 요금은 확인되지 않았어요. 예약 페이지에서 꼭 확인하세요.',
    'sample-data': '예시',
    'sample-no-select': '예시 데이터라 일정에 넣을 수 없어요',
    'flight-other-date': '다른 날짜',
    'flight-other-date-tip': '요청한 날짜와 다른 날짜의 항공편이에요',
    'confirm-flight-dates': '이 항공편은 {dates} 일정이라 지금 여행 날짜와 달라요.\n여행 날짜를 이 항공편에 맞춰({days}일) 일정에 넣을까요?',
    'err-generic': '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
    'route-cost-fail': '교통비를 계산하지 못했어요. 잠시 후 다시 시도해 주세요.',
    'nearest-station': '가까운 역',
    'source-estimate': 'ℹ️ 추정치',
    'closed-now': '영업종료',
    'title-export': '일정 내보내기',
    'title-checklist': '여행 체크리스트',
    'title-emergency': '긴급 정보',
    'title-phrases': '일본어 회화',
    'title-weather': '날씨 예보',
    'title-wishlist': '찜/위시리스트',
    'title-history': '검색 기록',
    'aria-plan': '추천과 AI 일정 통합 생성',
    'ai-chat-note': '가고 싶은 장소를 자연어로 입력하면 공항 기준 지역/조건을 자동 설정하고 추천을 생성합니다.',
    'ph-ai-request': '예: 유니버셜 스튜디오랑 도톤보리 꼭 가고 싶고, 3박 4일로 이동 편한 숙소 추천해줘',
    'aria-ai-request': 'AI 여행 조건 입력',
    'btn-ai-assist': 'AI로 조건 적용',
    'aria-rec-tabs': '추천 유형 선택',
    'plan-control-copy': '선택된 항공·숙소를 유지하고 싶다면 버튼으로 AI 일정만 다시 요청하세요.',
    'aria-undo': '일정 되돌리기 (Ctrl+Z)',
    'aria-redo': '일정 다시 실행 (Ctrl+Y)',
    'manual-flight-hint': '출발/도착 공항·날짜는 여행 조건에서 자동 설정됩니다. 가는편=출발지→도착지, 오는편=도착지→출발지',
    'label-flight-no': '편명',
    'label-outbound-dep': '가는편 출발',
    'label-return-dep': '오는편 출발',
    'label-price-krw': '가격(원)',
    'ph-airline': '예: 대한항공',
    'ph-flight-no': '예: KE713',
    'btn-add-flight': '항공편 추가',
    'label-stay-name': '숙소명',
    'label-area': '지역',
    'label-price-night': '1박 가격(원)',
    'label-rating10': '평점 (0~10)',
    'label-stay-type': '숙소 타입',
    'label-booking-link': '예약 링크',
    'ph-stay-name': '예: 도쿄 시나가와 호텔',
    'ph-stay-area': '예: 시나가와',
    'btn-add-stay': '숙소 추가',
    'btn-search': '검색',
    'aria-dest-search': '여행지 검색',
    'ph-food-genre': '장르 (예: 라멘)',
    'aria-food-search': '맛집 검색',
    'aria-trip-tabs': '항공권 유형 선택',
    'ph-from': '출발 공항',
    'ph-to': '도착 공항 (비우면 도시 기준)',
    'multi-help': '다구간은 아래 구간을 직접 편집해서 검색합니다. 최소 2개 구간이 필요합니다.',
    'label-date': '날짜',
    'btn-add-segment': '구간 추가',
    'btn-reset-segments': '초기화',
    'filter-tab': '필터 탭',
    'label-price-min': '최소 가격(원)',
    'label-price-max': '최대 가격(원)',
    'ph-price-min': '최소 가격',
    'ph-price-max': '최대 가격',
    'label-hour-min': '출발 최소 시',
    'label-hour-max': '출발 최대 시',
    'label-airport-filter': '공항 필터(콤마)',
    'label-airline-filter': '항공사 필터(콤마)',
    'ph-airport-filter': '공항 코드 콤마 (예: ICN,NRT)',
    'ph-airline-filter': '항공사 콤마 (예: Korean Air,ANA)',
    'check-airports': '공항 체크',
    'check-airlines': '항공사 체크',
    'sort-rating': '평점순',
    'label-rating-min': '최소 평점',
    'check-providers': '예약사 체크',
    'check-amenities': '부대시설',
    'modal-place-name': '장소 이름',
    'ph-modal-place': '추가할 장소 이름 입력',
    'modal-type': '유형',
    'ph-phrases-search': '상황 검색 (예: 주문, 길, 약국)',
    'login-desc': '로그인하면 일정을 저장하고 불러올 수 있습니다.',
    'login-naver': '네이버 로그인',
    'login-kakao': '카카오 로그인',
    'login-google': 'Google 로그인',
    'save-name-label': '일정 이름',
    'ph-save-name': '일정 이름을 입력하세요',
    'promote-dest': '⬆ 추천 여행지로',
    'promote-added': '✅ 추가됨',
    'promote-exists': '이미 추천에 있음',
    'wishlist-toggle': '찜 추가/제거',
    'arrive-at': '{t} 도착',
    'depart-at': '{t} 출발',
    'itin-dest-label': '📍 여행지',
    'itin-food-label': '🍴 맛집',
    'drop-here': '여기에 드롭',
    'btn-add-food': '맛집 추가',
    'outbound-label': '✈️ 가는편: ',
    'return-label': '✈️ 오는편: ',
    'per-night-suffix': '/박',
    'budget-title': '예상 비용 요약',
    'cost-stay-label': '🏨 숙소',
    'nights-unit': '박',
    'route-move': ' · 이동 ',
    'tours-popular': '{city} 인기 투어 & 액티비티',
    'tours-loading': '{city} 투어 로딩 중...',
    'tour-klook': 'Klook 투어',
    'tour-viator': 'Viator 투어',
    'weather-10day': '{city} 10일 예보',
    'wx-rain': '☔ 여행 기간 중 {n}일 비 예상 - 우산 필수! 실내 관광지 대안을 준비하세요.',
    'wx-cold': '❄️ 추운 날이 있습니다 - 따뜻한 옷 챙겨오세요.',
    'wx-hot': '🔥 더운 날이 있습니다 - 수분 보충과 자외선 차단을 준비하세요.',
    'export-no-plan': '일정이 없습니다. 먼저 AI 일정을 생성해주세요.',
    'export-flight': '항공권',
    'export-stay': '숙소',
    'export-cost': '예상 비용',
    'cost-flight-line': '항공권: ',
    'cost-stay-line': '숙소: ',
    'cost-food-line': '식비(예상): ~',
    'cost-transport-line': '교통비(예상): ~',
    'saved-default': '저장되었습니다.',
    'alert-title': '📊 일정 분석',
    'alert-too-many': '{d}: 여행지 {n}곳은 다소 빡빡할 수 있어요. 이동시간을 고려해 3곳 이하를 추천합니다.',
    'alert-no-meal': '{d}: 맛집이 아직 추가되지 않았어요. 맛집 추가를 추천합니다!',
    'alert-allday': '{d}: 종일 일정과 다른 여행지가 같은 날에 있습니다. 시간 충돌을 확인하세요.',
    'alert-dup': '"{p}"이(가) Day {a}과 Day {b}에 중복되어 있습니다.',
    'alert-late-arrival': 'Day 1 도착이 저녁입니다. 첫날은 숙소 체크인 + 근처 산책 정도가 적당합니다.',
    'alert-early-dep': '마지막 날 출발이 오전입니다. 공항 2시간 전 도착을 고려해 전날 짐 정리를 추천합니다.',
    'memo-title': '메모 추가/수정',
    'memo-prompt': '📝 {p} 메모:',
    'fx-chip': '100¥≈{a}원 | 1만원≈¥{b}',
    'fx-title': '환율 (1엔={r}원) · {d}',
    'fx-credit': '환율 제공: Exchange Rate API',
    'weather-credit': '날씨 데이터: Open-Meteo.com',
    'auth-err-state': '로그인 확인 시간이 지났거나 다른 창에서 로그인을 시작했어요. 다시 시도해 주세요.',
    'auth-err-provider': '{p} 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
    'auth-err-generic': '로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
    'title-save-plan': '현재 일정 저장',
    'title-my-plans': '내 저장 일정',
    'saved-suffix': ' 저장',
    'wishlist-empty1': '찜한 장소가 없습니다.',
    'wishlist-empty2': '여행지/맛집 카드의 ❤ 버튼을 눌러보세요.',
    'wishlist-count': '{n}개 저장됨',
    'hist-plan': '추천+일정: ',
    'hist-flight': '항공권: ',
    'hist-stay': '숙소: ',
    'hist-food': '맛집: ',
    'hist-dest': '여행지: ',
    'days-unit': '일',
    'hist-empty': '검색 기록이 없습니다.',
    'min-ago': '{n}분 전',
    'hours-ago': '{n}시간 전',
    'hist-clear': '기록 전체 삭제',
    'pref-cities': '자주 가는 도시: ',
    'pref-themes': '선호 테마: ',
    'btn-copy': '📋 복사',
    'phrases-none': '검색 결과가 없습니다.'
  },
  en: {
    'section-conditions': 'Travel Conditions', 'section-results': 'Recommendations',
    'section-explore': 'Explore', 'section-flights': 'Flights',
    'section-stays': 'Accommodations', 'section-tours': 'Tours / Activities',
    'btn-plan': 'Generate Plan', 'btn-flights': 'Search Flights',
    'btn-stays': 'Search Hotels', 'btn-food': 'Search',
    'btn-add': 'Add', 'btn-cancel': 'Cancel', 'btn-close': 'Close',
    'btn-save': 'Save', 'btn-cancel2': 'Cancel', 'btn-more': 'Show More',
    'btn-refresh-plan': 'Refresh AI Plan',
    'btn-undo': '\u21A9 Undo', 'btn-redo': '\u21AA Redo',
    'tagline': 'AI-powered travel, flights & food recommendations',
    'brand-subtitle': 'AI Japan Trip Planner',
    'meta-description': 'Tabimaru is a Japan trip planner: find places, flights, stays and food in one place and build your itinerary with AI.',
    'login': 'Log in',
    'toolbar-export': 'Export', 'toolbar-checklist': 'Checklist',
    'toolbar-emergency': 'Emergency', 'toolbar-phrases': 'Phrases',
    'toolbar-weather': 'Weather', 'toolbar-wishlist': 'Wishlist',
    'toolbar-history': 'History',
    'label-city': 'Destination', 'label-startDate': 'Start Date',
    'label-days': 'Duration (days)', 'label-theme': 'Theme',
    'label-city2': 'City', 'label-theme2': 'Theme',
    'label-city3': 'City', 'label-genre': 'Genre',
    'label-from-airport': 'From', 'label-to-airport': 'To',
    'label-depart-date': 'Departure', 'label-return-date': 'Return',
    'label-flight-pref': 'Sort By',
    'label-checkin': 'Check-in', 'label-checkout': 'Check-out',
    'label-guests': 'Guests', 'label-rooms': 'Rooms', 'label-sort': 'Sort',
    'theme-mixed': 'Balanced', 'theme-foodie': 'Foodie',
    'theme-culture': 'Culture', 'theme-shopping': 'Shopping', 'theme-nature': 'Nature',
    'theme-all': 'All',
    'trip-oneway': 'One-way', 'trip-roundtrip': 'Round-trip', 'trip-multicity': 'Multi-city',
    'sort-recommended': 'Recommended', 'sort-price': 'Lowest Price',
    'sort-duration': 'Shortest', 'sort-recommended2': 'Recommended',
    'pref-balanced': 'Price/Time Balance',
    'pref-cheap': 'Lowest Price', 'pref-fast': 'Fastest',
    'type-all': 'All', 'type-hotel': 'Hotel', 'type-ryokan': 'Ryokan',
    'type-apartment': 'Apartment', 'type-guesthouse': 'Guesthouse',
    'tab-rec-dest': 'Destinations', 'tab-rec-food': 'Restaurants',
    'tab-dest': 'Places', 'tab-food': 'Food',
    'ai-chat-title': 'AI Travel Chat',
    'ai-itinerary': 'AI Itinerary',
    'itinerary-map': 'Itinerary Map',
    'weather-title': 'Weather',
    'manual-flight': 'Enter Flight Manually',
    'manual-stay': 'Enter Hotel Manually',
    'modal-add-plan': 'Add to Plan',
    'modal-day-select': 'Select Day', 'modal-timeslot': 'Time Slot',
    'slot-morning': 'Morning', 'slot-afternoon': 'Afternoon', 'slot-allday': 'All Day',
    'slot-breakfast': 'Breakfast', 'slot-lunch': 'Lunch', 'slot-dinner': 'Dinner',
    'panel-checklist': '\u2705 Travel Checklist',
    'panel-emergency': '\uD83C\uDD98 Emergency Info (Japan)',
    'panel-phrases': '\uD83D\uDDE3 Japanese Phrases',
    'panel-weather': '\uD83C\uDF24 Weather Forecast',
    'panel-export': '\uD83D\uDCCB Export Itinerary',
    'panel-wishlist': '\u2764\uFE0F Wishlist',
    'panel-search-history': '🕘 Search History',
    'panel-myplans': '📂 My Saved Plans',
    'export-pdf': '\uD83D\uDCC4 Download PDF',
    'export-text': '\uD83D\uDCC4 Copy Text',
    'export-markdown': '\uD83D\uDCDD Copy Markdown',
    'export-link': '\uD83D\uDD17 Copy Link',
    'login-title': 'Log in', 'save-title': '💾 Save Itinerary',
    'tours-note': 'Check popular tours and activities. (Powered by Klook)',
    'memo-saved': 'Memo saved.',
    'no-results': 'No results',
    'add-to-plan': 'Add to Plan',
    'promote-to-rec': '\u2196\uFE0F Add to Recs',
    'map-link': 'Map',
    'err-rate-limit': 'Too many requests. Please try again later.',
    'err-need-plan': 'Please generate an AI itinerary first.',
    'loading': 'Loading...',
    'per-night': '/ night',
    'day-prefix': 'Day ',
    'arrival': 'Arrival',
    'departure': 'Departure',
    'arrival-pending': 'Arrival TBD',
    'departure-pending': 'Departure TBD',
    'checkin': 'Check-in',
    'checkout': 'Check-out',
    'stay': 'Accommodation',
    'selected-flight': 'Selected Flight',
    'selected-stay': 'Selected Stay',
    'selected-mark': 'Selected (in AI itinerary)',
    'include-ai': 'Included in AI plan',
    'won': 'KRW',
    'nights': 'nights',
    'airline': 'Airline',
    'fare-base': 'Fare: Base ',
    'fare-tax': ' · Tax ',
    'fare-fee': ' · Fee ',
    'price-na': 'Price unavailable',
    'airline-na': 'Airline info N/A',
    'price-no-info': 'No price info',
    'provider-na': 'No provider info',
    'edit': '✏️ Edit',
    'delete': '✕ Delete',
    'room': 'Room ',
    'rooms-label': 'Rooms ',
    'guests-label': ' Guests ',
    'per-night-unit': 'KRW/night',
    'no-selection': 'No flights/stays selected.',
    'meal-breakfast': 'Breakfast',
    'meal-lunch': 'Lunch',
    'meal-dinner': 'Dinner',
    'time-morning': 'Morning',
    'time-afternoon': 'Afternoon',
    'time-allday': 'All Day',
    'chat-user': 'You',
    'chat-ai': 'AI',
    'chat-placeholder': 'Type a place you want to visit and we will automatically match the airport, region, and trip conditions.',
    'chat-enter-msg': 'Please enter your request.',
    'chat-processing': 'Generating new recommendations based on your request.',
    'chat-error': 'An error occurred while processing: ',
    'source-rule': 'Rule-based (default)',
    'source-gemini': 'AI-powered (Gemini)',
    'source-openai': 'AI-powered (OpenAI)',
    'source-planner': 'AI-powered (Planner)',
    'source-fallback': 'Rule-based (AI fallback)',
    'source-tp': 'Travelpayouts Live',
    'source-amadeus': 'Amadeus',
    'source-rakuten': 'Rakuten Travel Live',
    'source-google': 'Google Places',
    'source-tabelog': 'Tabelog Style',
    'source-food-fb': 'Rule-based (fallback)',
    'mock-notice': 'Currently showing demo data. (API failure or not connected)',
    'transport-subway': '🚇 Subway',
    'transport-train': '🚃 Train',
    'transport-bus': '🚌 Bus',
    'transport-tram': '🚊 Tram',
    'transport-transit': '🚍 Transit',
    'transport-walk': '🚶 Walk',
    'transport-est': '📍 Est.',
    'transport-err': '⚠️ Error',
    'total-fare': 'Total: \u00a5',
    'free': 'Free',
    'budget-low': 'Budget',
    'budget-mid': 'Standard',
    'budget-high': 'Premium',
    'cost-flight': '✈️ Flights',
    'cost-stay': 'Stay (',
    'cost-food': '🍜 Food',
    'cost-transport': '🚃 Transport',
    'cost-activity': '🎫 Activities',
    'rec-dest': 'Recommended',
    'error-prefix': 'Error: ',
    'copy-text-done': 'Text copied to clipboard!',
    'copy-md-done': 'Markdown copied!',
    'copy-itin-done': 'Itinerary copied to clipboard!',
    'weather-loading': 'Loading weather...',
    'weather-error': 'Unable to load weather info.',
    'logout-confirm': 'Are you sure you want to log out?',
    'login-required': 'Please log in first.',
    'save-success': 'Itinerary saved!',
    'no-plan-yet': 'Please generate an itinerary first.',
    'add-to-plan-btn': 'Add to Plan',
    'promote-food': '⬆ Add to food picks',
    'wishlist-add': 'Added to wishlist',
    'wishlist-remove': 'Removed from wishlist',
    'korea': 'Korea',
    'japan': 'Japan',
    'airport-suffix': 'Airport',
    'drag-handle': '☰ Drag',
    'map-link': 'Map',
    'total-min': 'Total ',
    'min-suffix': ' min',
    'stops': 'Stops: ',
    'stops-suffix': '',
    'airline-label': 'Airline: ',
    'fare-detail': 'Fare: Base ',
    'book-flight': '✈ Book',
    'skyscanner': 'Skyscanner',
    'kayak': 'Kayak',
    'move-up': 'Up',
    'move-down': 'Down',
    'route-calc': '🚃 Calculate Route Cost',
    'amenities': 'Amenities: ',
    'won-suffix': 'KRW',
    'not-selected': 'Not selected',
    'cost-stay-nights': 'nights',
    'cost-summary': 'Total (est.)',
    'budget-note': 'tier · per person · ',
    'budget-note2': ' days · food, transport and activities are estimates',
    'category-default': 'Recommended',
    'err-prefix': 'Error: ',
    'per-night-display': 'KRW/night',
    'rating-prefix': 'Rating ',
    'offer-label': 'Offer ',
    'room-label': 'Room ',
    'meal-label': 'Meals ',
    'cancel-label': 'Cancel ',
    'total-prefix': 'Total ',
    'book-page': 'Book Now',
    'rooms-guests': 'Rooms ',
    'guests-sep': ' · Guests ',
    'err-multicity': 'Multi-city search requires at least 2 segments.',
    'model-label': ' [Model: ',
    'chat-method': 'Chat method: ',
    'manual-input': 'Manual',
    'err-airline-required': 'Please enter airline or flight number.',
    'err-stay-required': 'Please enter hotel name.',
    'err-return-date': 'Return date cannot be before departure.',
    'err-checkout-date': 'Check-out must be after check-in.',
    'share-title': 'Itinerary',
    'fx-loading': '¥/₩ Loading...',
    'fx-fallback': '¥/₩ rate unavailable',
    'provider-naver': 'Naver',
    'provider-kakao': 'Kakao',
    'btn-save-plan': '💾 Save',
    'btn-my-plans': '📂 My Plans',
    'btn-logout': 'Logout',
    'btn-login': '👤 Login',
    'err-no-plan-save': 'No itinerary to save. Please generate one first.',
    'plan-title-suffix': '-day trip',
    'btn-save': 'Save',
    'btn-overwrite': 'Overwrite',
    'overwrite-confirm': ' already exists.',
    'overwrite-note': ')<br>Saving will overwrite the existing plan.',
    'save-overwrite-done': 'Plan overwritten!',
    'save-fail': 'Save failed',
    'save-error': 'An error occurred while saving.',
    'loading-plans': 'Loading...',
    'no-saved-plans': 'No saved plans.',
    'plan-default': 'Plan',
    'days-saved': 'd · ',
    'btn-load': 'Load',
    'btn-delete': 'Delete',
    'load-list-error': 'Failed to load plan list.',
    'load-fail': 'Load failed',
    'load-success': 'Itinerary loaded!',
    'load-error': 'An error occurred while loading.',
    'delete-confirm': 'Delete this plan?',
    'delete-success': 'Plan deleted.',
    'delete-fail': 'Delete failed',
    'delete-error': 'An error occurred while deleting.',
    'route-need-2': 'Need at least 2 places in the itinerary.',
    'calculating': 'Calculating...',
    'free-label': 'Free',
    'source-ai-calc': '✨ AI Calculation',
    'source-dist-est': '📏 Distance-based estimate',
    'source-google-route': '🗺 Google route data',
    'err-input': 'Invalid input.',
    'source-ai-google': '✨ AI + Google Places',
    'source-rule-fb': '📋 Rule-based (fallback)',
    'source-ai-rec': '✨ AI Recommendations',
    'rec-prefix': 'Destinations: ',
    'flight-prefix': 'Flights: ',
    'food-prefix': 'Food: ',
    'stay-prefix': 'Stays: ',
    'err-need-plan-first': 'Please generate an AI itinerary first.',
    'memo-saved': 'Memo saved',
    'memo-deleted': 'Memo deleted',
    'no-auth-config': 'Login service not configured.',
    'logged-out': 'Logged out.',
    'plan-saved-overwrite': 'Plan overwritten!',
    'plan-saved': 'Itinerary saved!',
    'popup-blocked': 'Popup was blocked.',
    'history-cleared': 'Search history cleared.',
    'remove-segment': 'Remove',
    'loading': 'Loading...',
    'err-timeout': 'Server timed out. Please try again.',
    'err-network': 'Network error. Please check your connection.',
    'err-server': 'Server error. Please try again later.',
    'confirm-time-conflict': 'This time slot already has an item. Add anyway?',
    'search-flights': 'Search',
    'search-stays': 'Search',
    'btn-run': 'AI Recommend',
    'btn-run-sync': 'Full Generate',
    'partial-failure': 'Some data could not be loaded',
    'open-now': 'Open',
    'empty-dest': 'Pick a destination, dates and theme, then press [Generate Plan] to fill in recommendations, an itinerary, flights and stays at once.',
    'empty-plan': 'No itinerary yet. Press [Generate Plan] to get started.',
    'empty-rec-food': 'Restaurant picks near your destinations appear here after you generate a plan.',
    'empty-rec-food-none': 'We couldn\'t find restaurant picks for this plan yet. Try Explore > Food below.',
    'empty-flights': 'Flights for your dates appear after you generate a plan. You can also change the fields and press [Search Flights].',
    'empty-stays': 'Stays for your dates appear after you generate a plan. You can also change the fields and press [Search Hotels].',
    'empty-search': 'Press [Search] to see results here.',
    'empty-itinerary': 'We couldn\'t build this itinerary. Adjust the conditions or press [Generate Plan] again in a moment. You can also drag recommended places into the days below.',
    'map-no-coords': 'None of the places in this plan have map coordinates yet.',
    'map-loading': 'Loading map…',
    'map-failed': 'The map couldn\'t load. Use the MAP link next to each place.',
    'map-partial': '{n} place(s) without coordinates are not shown on the map.',
    'photo-credit': 'Photo:',
    'photo-scope-city': 'City photo',
    'photo-scope-genre': 'Example photo',
    'stay-date-unconfirmed': 'Lowest rate, dates unconfirmed',
    'stay-date-unconfirmed-tip': 'Vacancy and rates for your dates are not confirmed. Please check on the booking page.',
    'sample-data': 'Sample',
    'sample-no-select': 'Sample data can\'t be added to the plan',
    'flight-other-date': 'Different dates',
    'flight-other-date-tip': 'This flight is on different dates from the ones you asked for',
    'confirm-flight-dates': 'This flight is on {dates}, which differs from your trip dates.\nChange your trip dates to match this flight ({days} days) and add it to the plan?',
    'err-generic': 'Something went wrong. Please try again shortly.',
    'route-cost-fail': 'Couldn\'t calculate transit costs. Please try again shortly.',
    'nearest-station': 'Nearest station',
    'source-estimate': 'ℹ️ Estimate',
    'closed-now': 'Closed',
    'title-export': 'Export itinerary',
    'title-checklist': 'Travel checklist',
    'title-emergency': 'Emergency info',
    'title-phrases': 'Japanese phrases',
    'title-weather': 'Weather forecast',
    'title-wishlist': 'Wishlist',
    'title-history': 'Search history',
    'aria-plan': 'Generate recommendations and an AI itinerary',
    'ai-chat-note': 'Describe where you want to go in your own words. We\'ll set the region, airport and trip conditions, then build recommendations.',
    'ph-ai-request': 'e.g. I really want to see Universal Studios and Dotonbori. 4 days, 3 nights, with a hotel that\'s easy to get around from.',
    'aria-ai-request': 'Describe your trip for the AI',
    'btn-ai-assist': 'Apply with AI',
    'aria-rec-tabs': 'Recommendation type',
    'plan-control-copy': 'To keep your selected flight and stay, refresh only the AI itinerary.',
    'aria-undo': 'Undo (Ctrl+Z)',
    'aria-redo': 'Redo (Ctrl+Y)',
    'manual-flight-hint': 'Airports and dates come from your trip conditions. Outbound = origin → destination, return = destination → origin.',
    'label-flight-no': 'Flight no.',
    'label-outbound-dep': 'Outbound departure',
    'label-return-dep': 'Return departure',
    'label-price-krw': 'Price (KRW)',
    'ph-airline': 'e.g. Korean Air',
    'ph-flight-no': 'e.g. KE713',
    'btn-add-flight': 'Add flight',
    'label-stay-name': 'Hotel name',
    'label-area': 'Area',
    'label-price-night': 'Price per night (KRW)',
    'label-rating10': 'Rating (0–10)',
    'label-stay-type': 'Stay type',
    'label-booking-link': 'Booking link',
    'ph-stay-name': 'e.g. a hotel in Shinagawa, Tokyo',
    'ph-stay-area': 'e.g. Shinagawa',
    'btn-add-stay': 'Add stay',
    'btn-search': 'Search',
    'aria-dest-search': 'Search places',
    'ph-food-genre': 'Genre (e.g. Ramen)',
    'aria-food-search': 'Search restaurants',
    'aria-trip-tabs': 'Trip type',
    'ph-from': 'Departure airport',
    'ph-to': 'Arrival airport (blank = city airport)',
    'multi-help': 'Edit the segments below to search a multi-city trip. You need at least 2 segments.',
    'label-date': 'Date',
    'btn-add-segment': 'Add segment',
    'btn-reset-segments': 'Reset',
    'filter-tab': 'Filters',
    'label-price-min': 'Min price (KRW)',
    'label-price-max': 'Max price (KRW)',
    'ph-price-min': 'Min price',
    'ph-price-max': 'Max price',
    'label-hour-min': 'Earliest departure (hour)',
    'label-hour-max': 'Latest departure (hour)',
    'label-airport-filter': 'Airport filter (comma-separated)',
    'label-airline-filter': 'Airline filter (comma-separated)',
    'ph-airport-filter': 'Airport codes (e.g. ICN,NRT)',
    'ph-airline-filter': 'Airlines (e.g. Korean Air,ANA)',
    'check-airports': 'Airports',
    'check-airlines': 'Airlines',
    'sort-rating': 'Top rated',
    'label-rating-min': 'Min rating',
    'check-providers': 'Booking sites',
    'check-amenities': 'Amenities',
    'modal-place-name': 'Place name',
    'ph-modal-place': 'Enter a place to add',
    'modal-type': 'Type',
    'ph-phrases-search': 'Search (e.g. menu, station, pharmacy)',
    'login-desc': 'Log in to save and load your itineraries.',
    'login-naver': 'Log in with Naver',
    'login-kakao': 'Log in with Kakao',
    'login-google': 'Log in with Google',
    'save-name-label': 'Plan name',
    'ph-save-name': 'Enter a plan name',
    'promote-dest': '⬆ Add to picks',
    'promote-added': '✅ Added',
    'promote-exists': 'Already in picks',
    'wishlist-toggle': 'Add to or remove from wishlist',
    'arrive-at': 'arrives {t}',
    'depart-at': 'departs {t}',
    'itin-dest-label': '📍 Places',
    'itin-food-label': '🍴 Food',
    'drop-here': 'Drop here',
    'btn-add-food': 'Add restaurant',
    'outbound-label': '✈️ Outbound: ',
    'return-label': '✈️ Return: ',
    'per-night-suffix': '/night',
    'budget-title': 'Estimated costs',
    'cost-stay-label': '🏨 Stay',
    'nights-unit': ' night(s)',
    'route-move': ' · travel ',
    'tours-popular': 'Popular tours & activities in {city}',
    'tours-loading': 'Loading tours for {city}…',
    'tour-klook': 'Klook tours',
    'tour-viator': 'Viator tours',
    'weather-10day': '{city} 10-day forecast',
    'wx-rain': '☔ Rain is expected on {n} day(s) of your trip. Bring an umbrella and plan some indoor spots.',
    'wx-cold': '❄️ Some days will be cold. Pack warm clothes.',
    'wx-hot': '🔥 Some days will be hot. Stay hydrated and protect yourself from the sun.',
    'export-no-plan': 'No itinerary yet. Generate an AI itinerary first.',
    'export-flight': 'Flight',
    'export-stay': 'Stay',
    'export-cost': 'Estimated costs',
    'cost-flight-line': 'Flight: ',
    'cost-stay-line': 'Stay: ',
    'cost-food-line': 'Food (est.): ~',
    'cost-transport-line': 'Transport (est.): ~',
    'saved-default': 'Saved.',
    'alert-title': '📊 Plan check',
    'alert-too-many': '{d}: {n} places may make for a tight day. With travel time, 3 or fewer is recommended.',
    'alert-no-meal': '{d}: No restaurants yet. Consider adding one!',
    'alert-allday': '{d}: An all-day plan shares the day with other places. Check for time conflicts.',
    'alert-dup': '"{p}" appears on both Day {a} and Day {b}.',
    'alert-late-arrival': 'You arrive in the evening on Day 1. Checking in and a short walk nearby is plenty.',
    'alert-early-dep': 'Your last-day flight leaves in the morning. Aim to reach the airport 2 hours early and pack the night before.',
    'memo-title': 'Add or edit a note',
    'memo-prompt': '📝 Note for {p}:',
    'fx-chip': '¥100≈₩{a} | ₩10,000≈¥{b}',
    'fx-title': 'Exchange rate (¥1 = ₩{r}) · {d}',
    'fx-credit': 'Rates By Exchange Rate API',
    'weather-credit': 'Weather data by Open-Meteo.com',
    'auth-err-state': 'Your sign-in timed out or was started in another window. Please try again.',
    'auth-err-provider': 'Sign-in with {p} was not completed. Please try again in a moment.',
    'auth-err-generic': 'Sign-in was not completed. Please try again in a moment.',
    'title-save-plan': 'Save current plan',
    'title-my-plans': 'My saved plans',
    'saved-suffix': ' saved',
    'wishlist-empty1': 'Your wishlist is empty.',
    'wishlist-empty2': 'Tap the heart button on a place or restaurant card.',
    'wishlist-count': '{n} saved',
    'hist-plan': 'Plan: ',
    'hist-flight': 'Flights: ',
    'hist-stay': 'Stays: ',
    'hist-food': 'Food: ',
    'hist-dest': 'Places: ',
    'days-unit': ' days',
    'hist-empty': 'No search history yet.',
    'min-ago': '{n} min ago',
    'hours-ago': '{n} h ago',
    'hist-clear': 'Clear history',
    'pref-cities': 'Frequent cities: ',
    'pref-themes': 'Favorite themes: ',
    'btn-copy': '📋 Copy',
    'phrases-none': 'No matching phrases.'
  },
  ja: {
    'section-conditions': '\u65C5\u884C\u6761\u4EF6', 'section-results': '\u304A\u3059\u3059\u3081',
    'section-explore': '\u63A2\u7D22', 'section-flights': '\u822A\u7A7A\u5238',
    'section-stays': '\u5BBF\u6CCA', 'section-tours': '\u30C4\u30A2\u30FC / \u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3',
    'btn-plan': '\u30D7\u30E9\u30F3\u4F5C\u6210', 'btn-flights': '\u822A\u7A7A\u5238\u691C\u7D22',
    'btn-stays': '\u5BBF\u6CCA\u691C\u7D22', 'btn-food': '\u691C\u7D22',
    'btn-add': '\u8FFD\u52A0', 'btn-cancel': '\u30AD\u30E3\u30F3\u30BB\u30EB', 'btn-close': '\u9589\u3058\u308B',
    'btn-save': '\u4FDD\u5B58', 'btn-cancel2': '\u30AD\u30E3\u30F3\u30BB\u30EB', 'btn-more': '\u3082\u3063\u3068\u898B\u308B',
    'btn-refresh-plan': 'AI\u30D7\u30E9\u30F3\u66F4\u65B0',
    'btn-undo': '\u21A9 \u5143\u306B\u623B\u3059', 'btn-redo': '\u21AA \u3084\u308A\u76F4\u3057',
    'tagline': 'AI\u3067\u65C5\u884C\u5148\u30FB\u822A\u7A7A\u5238\u30FB\u30B0\u30EB\u30E1\u3092\u63A8\u85A6',
    'brand-subtitle': 'AI\u65E5\u672C\u65C5\u884C\u30D7\u30E9\u30F3\u30CA\u30FC',
    'meta-description': 'Tabimaru\u306F\u3001\u89B3\u5149\u5730\u30FB\u822A\u7A7A\u5238\u30FB\u5BBF\u30FB\u30B0\u30EB\u30E1\u3092\u307E\u3068\u3081\u3066\u63A2\u3057\u3001AI\u3067\u65C5\u884C\u30D7\u30E9\u30F3\u3092\u4F5C\u308C\u308B\u65E5\u672C\u65C5\u884C\u30D7\u30E9\u30F3\u30CA\u30FC\u3067\u3059\u3002',
    'login': 'ログイン',
    'toolbar-export': 'エクスポート', 'toolbar-checklist': 'チェックリスト',
    'toolbar-emergency': '緊急', 'toolbar-phrases': '会話',
    'toolbar-weather': '天気', 'toolbar-wishlist': 'お気に入り',
    'toolbar-history': '履歴',
    'label-city': '\u65C5\u884C\u5148', 'label-startDate': '\u51FA\u767A\u65E5',
    'label-days': '\u65E5\u6570', 'label-theme': '\u30C6\u30FC\u30DE',
    'label-city2': '\u90FD\u5E02', 'label-theme2': '\u30C6\u30FC\u30DE',
    'label-city3': '\u90FD\u5E02', 'label-genre': '\u30B8\u30E3\u30F3\u30EB',
    'label-from-airport': '\u51FA\u767A\u7A7A\u6E2F', 'label-to-airport': '\u5230\u7740\u7A7A\u6E2F',
    'label-depart-date': '\u51FA\u767A\u65E5', 'label-return-date': '\u5E30\u56FD\u65E5',
    'label-flight-pref': '\u4E26\u3073\u66FF\u3048',
    'label-checkin': '\u30C1\u30A7\u30C3\u30AF\u30A4\u30F3', 'label-checkout': '\u30C1\u30A7\u30C3\u30AF\u30A2\u30A6\u30C8',
    'label-guests': '\u4EBA\u6570', 'label-rooms': '\u90E8\u5C4B\u6570', 'label-sort': '\u4E26\u3073\u66FF\u3048',
    'theme-mixed': '\u30D0\u30E9\u30F3\u30B9', 'theme-foodie': '\u30B0\u30EB\u30E1',
    'theme-culture': '\u6587\u5316', 'theme-shopping': '\u30B7\u30E7\u30C3\u30D4\u30F3\u30B0', 'theme-nature': '\u81EA\u7136',
    'theme-all': '\u5168\u3066',
    'trip-oneway': '\u7247\u9053', 'trip-roundtrip': '\u5F80\u5FA9', 'trip-multicity': '\u591A\u90FD\u5E02',
    'sort-recommended': '\u304A\u3059\u3059\u3081\u9806', 'sort-price': '\u6700\u5B89\u5024\u9806',
    'sort-duration': '\u6700\u77ED\u6642\u9593\u9806', 'sort-recommended2': '\u304A\u3059\u3059\u3081\u9806',
    'pref-balanced': '\u4FA1\u683C/\u6642\u9593\u30D0\u30E9\u30F3\u30B9',
    'pref-cheap': '\u6700\u5B89\u5024\u512A\u5148', 'pref-fast': '\u6700\u77ED\u6642\u9593\u512A\u5148',
    'type-all': '\u5168\u3066', 'type-hotel': '\u30DB\u30C6\u30EB', 'type-ryokan': '\u65C5\u9928',
    'type-apartment': '\u30A2\u30D1\u30FC\u30C8\u30E1\u30F3\u30C8', 'type-guesthouse': '\u30B2\u30B9\u30C8\u30CF\u30A6\u30B9',
    'tab-rec-dest': '\u304A\u3059\u3059\u3081\u30B9\u30DD\u30C3\u30C8', 'tab-rec-food': '\u304A\u3059\u3059\u3081\u30B0\u30EB\u30E1',
    'tab-dest': '\u30B9\u30DD\u30C3\u30C8', 'tab-food': '\u30B0\u30EB\u30E1',
    'ai-chat-title': 'AI\u65C5\u884C\u30C1\u30E3\u30C3\u30C8',
    'ai-itinerary': 'AI\u30D7\u30E9\u30F3',
    'itinerary-map': '\u30D7\u30E9\u30F3\u5730\u56F3',
    'weather-title': '\u5929\u6C17\u4E88\u5831',
    'manual-flight': '\u822A\u7A7A\u5238\u3092\u624B\u52D5\u5165\u529B',
    'manual-stay': '\u5BBF\u6CCA\u3092\u624B\u52D5\u5165\u529B',
    'modal-add-plan': '\u30D7\u30E9\u30F3\u306B\u8FFD\u52A0',
    'modal-day-select': 'Day\u9078\u629E', 'modal-timeslot': '\u6642\u9593\u5E2F',
    'slot-morning': '\u5348\u524D', 'slot-afternoon': '\u5348\u5F8C', 'slot-allday': '\u7D42\u65E5',
    'slot-breakfast': '朝食', 'slot-lunch': '昼食', 'slot-dinner': '夕食',
    'panel-checklist': '\u2705 \u65C5\u884C\u6E96\u5099\u30C1\u30A7\u30C3\u30AF\u30EA\u30B9\u30C8',
    'panel-emergency': '\uD83C\uDD98 \u7DCA\u6025\u60C5\u5831',
    'panel-phrases': '\uD83D\uDDE3 \u65C5\u884C\u4F1A\u8A71',
    'panel-weather': '\uD83C\uDF24 \u5929\u6C17\u4E88\u5831',
    'panel-export': '\uD83D\uDCCB \u30D7\u30E9\u30F3\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8',
    'panel-wishlist': '\u2764\uFE0F \u304A\u6C17\u306B\u5165\u308A',
    'panel-search-history': '🕘 検索履歴',
    'panel-myplans': '📂 保存済みプラン',
    'export-pdf': '\uD83D\uDCC4 PDF\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9',
    'export-text': '\uD83D\uDCC4 \u30C6\u30AD\u30B9\u30C8\u30B3\u30D4\u30FC',
    'export-markdown': '\uD83D\uDCDD \u30DE\u30FC\u30AF\u30C0\u30A6\u30F3\u30B3\u30D4\u30FC',
    'export-link': '\uD83D\uDD17 \u30EA\u30F3\u30AF\u30B3\u30D4\u30FC',
    'login-title': 'ログイン', 'save-title': '💾 プランを保存',
    'tours-note': '\u4EBA\u6C17\u30C4\u30A2\u30FC\u3068\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u3092\u30C1\u30A7\u30C3\u30AF\u3002(Klook\u63D0\u4F9B)',
    'memo-saved': '\u30E1\u30E2\u304C\u4FDD\u5B58\u3055\u308C\u307E\u3057\u305F\u3002',
    'no-results': '\u7D50\u679C\u306A\u3057',
    'add-to-plan': '\u30D7\u30E9\u30F3\u306B\u8FFD\u52A0',
    'promote-to-rec': '\u2196\uFE0F \u304A\u3059\u3059\u3081\u306B\u8FFD\u52A0',
    'map-link': '\u5730\u56F3',
    'err-rate-limit': '\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u591A\u3059\u304E\u307E\u3059\u3002\u3057\u3070\u3089\u304F\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002',
    'err-need-plan': '\u307E\u305AAI\u30D7\u30E9\u30F3\u3092\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002',
    'loading': '\u8AAD\u307F\u8FBC\u307F\u4E2D...',
    'per-night': '/ \u6CCA',
    'day-prefix': 'Day ',
    'arrival': '到着',
    'departure': '出発',
    'arrival-pending': '到着未定',
    'departure-pending': '出発未定',
    'checkin': 'チェックイン',
    'checkout': 'チェックアウト',
    'stay': '宿泊',
    'selected-flight': '選択航空券',
    'selected-stay': '選択宿泊',
    'selected-mark': '選択済み (AIプランに反映)',
    'include-ai': 'AIプランに含まれる',
    'won': 'ウォン',
    'nights': '泊',
    'airline': '航空会社',
    'fare-base': '運賃: 基本 ',
    'fare-tax': ' · 税金 ',
    'fare-fee': ' · 手数料 ',
    'price-na': '運賃未確認',
    'airline-na': '航空会社情報なし',
    'price-no-info': '価格情報なし',
    'provider-na': '提供元なし',
    'edit': '✏️編集',
    'delete': '✕削除',
    'room': '客室 ',
    'rooms-label': '部屋 ',
    'guests-label': ' · 人数 ',
    'per-night-unit': 'ウォン/泊',
    'no-selection': '航空券/宿泊が選択されていません。',
    'meal-breakfast': '朝食',
    'meal-lunch': '昼食',
    'meal-dinner': '夕食',
    'time-morning': '午前',
    'time-afternoon': '午後',
    'time-allday': '終日',
    'chat-user': 'ユーザー',
    'chat-ai': 'AI',
    'chat-placeholder': '行きたい場所をチャットで入力すると、空港・地域・旅行条件を自動調整します。',
    'chat-enter-msg': 'リクエストを入力してください。',
    'chat-processing': 'リクエストを反映して新しいおすすめを生成します。',
    'chat-error': 'リクエスト処理中にエラーが発生しました: ',
    'source-rule': 'ルールベース (デフォルト)',
    'source-gemini': 'AIベース (Gemini)',
    'source-openai': 'AIベース (OpenAI)',
    'source-planner': 'AIベース (Planner)',
    'source-fallback': 'ルールベース (AIフォールバック)',
    'source-tp': 'Travelpayoutsリアルタイム',
    'source-amadeus': 'Amadeus',
    'source-rakuten': 'Rakuten Travelリアルタイム',
    'source-google': 'Google Placesベース',
    'source-tabelog': '食べログスタイル',
    'source-food-fb': 'ルールベース (フォールバック)',
    'mock-notice': '現在デモデータを表示中です。(API失敗または未接続)',
    'transport-subway': '🚇 地下鉄',
    'transport-train': '🚃 電車',
    'transport-bus': '🚌 バス',
    'transport-tram': '🚊 トラム',
    'transport-transit': '🚍 公共交通',
    'transport-walk': '🚶 徒歩',
    'transport-est': '📍 推定',
    'transport-err': '⚠️ エラー',
    'total-fare': '合計: ¥',
    'free': '無料',
    'budget-low': '節約',
    'budget-mid': '標準',
    'budget-high': 'プレミアム',
    'cost-flight': '✈️ 航空券',
    'cost-stay': '宿泊 (',
    'cost-food': '🍜 食費',
    'cost-transport': '🚃 交通費',
    'cost-activity': '🎫 アクティビティ',
    'rec-dest': 'おすすめ',
    'error-prefix': 'エラー: ',
    'copy-text-done': 'テキストがコピーされました!',
    'copy-md-done': 'マークダウンがコピーされました!',
    'copy-itin-done': 'プランがコピーされました!',
    'weather-loading': '天気情報読み込み中...',
    'weather-error': '天気情報を取得できません。',
    'logout-confirm': 'ログアウトしますか？',
    'login-required': 'ログインが必要です。',
    'save-success': 'プランが保存されました!',
    'no-plan-yet': 'まずプランを作成してください。',
    'add-to-plan-btn': 'プランに追加',
    'promote-food': '⬆ おすすめグルメに追加',
    'wishlist-add': 'お気に入りに追加',
    'wishlist-remove': 'お気に入りから削除',
    'korea': '韓国',
    'japan': '日本',
    'airport-suffix': '空港',
    'drag-handle': '☰ ドラッグ',
    'map-link': '地図',
    'total-min': '合計 ',
    'min-suffix': '分',
    'stops': '経由 ',
    'stops-suffix': '回',
    'airline-label': '航空会社: ',
    'fare-detail': '運賃: 基本 ',
    'book-flight': '✈ 予約',
    'skyscanner': 'Skyscanner',
    'kayak': 'Kayak',
    'move-up': '上へ',
    'move-down': '下へ',
    'route-calc': '🚃 経路交通費計算',
    'amenities': '設備: ',
    'won-suffix': 'ウォン',
    'not-selected': '未選択',
    'cost-stay-nights': '泊',
    'cost-summary': '合計 (推定)',
    'budget-note': 'プラン · 1人 · ',
    'budget-note2': '日 · 食費/交通/活動は推定',
    'category-default': 'おすすめ',
    'err-prefix': 'エラー: ',
    'per-night-display': 'ウォン/泊',
    'rating-prefix': '評価 ',
    'offer-label': 'オファー ',
    'room-label': '客室 ',
    'meal-label': '食事 ',
    'cancel-label': 'キャンセル ',
    'total-prefix': '合計 ',
    'book-page': '予約ページ',
    'rooms-guests': '部屋 ',
    'guests-sep': ' · 人数 ',
    'err-multicity': '多都市検索には2区間以上必要です。',
    'model-label': ' [モデル: ',
    'chat-method': 'チャット解析: ',
    'manual-input': '手動入力',
    'err-airline-required': '航空会社または便名を入力してください。',
    'err-stay-required': '宿泊名を入力してください。',
    'err-return-date': '帰国日が出発日より前です。',
    'err-checkout-date': 'チェックアウトはチェックイン以降です。',
    'share-title': '旅行プラン',
    'fx-loading': '¥/₩ 読み込み中...',
    'fx-fallback': '¥/₩ 為替情報なし',
    'provider-naver': 'Naver',
    'provider-kakao': 'Kakao',
    'btn-save-plan': '💾 保存',
    'btn-my-plans': '📂 プラン',
    'btn-logout': 'ログアウト',
    'btn-login': '👤 ログイン',
    'err-no-plan-save': '保存するプランがありません。',
    'plan-title-suffix': '日間の旅',
    'btn-save': '保存',
    'btn-overwrite': '上書き',
    'overwrite-confirm': ' が既に存在します。',
    'overwrite-note': ')に保存済み<br>保存すると既存のプランを上書きします。',
    'save-overwrite-done': 'プランを上書きしました!',
    'save-fail': '保存失敗',
    'save-error': '保存中にエラーが発生しました。',
    'loading-plans': '読み込み中...',
    'no-saved-plans': '保存済みプランがありません。',
    'plan-default': 'プラン',
    'days-saved': '日 · ',
    'btn-load': '読み込み',
    'btn-delete': '削除',
    'load-list-error': 'プラン一覧を読み込めません。',
    'load-fail': '読み込み失敗',
    'load-success': 'プランを読み込みました!',
    'load-error': '読み込み中にエラーが発生しました。',
    'delete-confirm': 'このプランを削除しますか？',
    'delete-success': 'プランが削除されました。',
    'delete-fail': '削除失敗',
    'delete-error': '削除中にエラーが発生しました。',
    'route-need-2': 'プランに2箇所以上必要です。',
    'calculating': '計算中...',
    'free-label': '無料',
    'source-ai-calc': '✨ AI計算',
    'source-dist-est': '📏 距離に基づく推定',
    'source-google-route': '🗺 Google経路情報',
    'err-input': '入力値が正しくありません。',
    'source-ai-google': '✨ AI + Google Places',
    'source-rule-fb': '📋 ルールベース (フォールバック)',
    'source-ai-rec': '✨ AIおすすめ',
    'rec-prefix': 'おすすめ: ',
    'flight-prefix': '航空券: ',
    'food-prefix': 'グルメ: ',
    'stay-prefix': '宿泊: ',
    'err-need-plan-first': 'まずAIプランを作成してください。',
    'memo-saved': 'メモ保存',
    'memo-deleted': 'メモ削除',
    'no-auth-config': 'ログインサービスが設定されていません。',
    'logged-out': 'ログアウトしました。',
    'plan-saved-overwrite': 'プランを上書きしました!',
    'plan-saved': 'プランが保存されました!',
    'popup-blocked': 'ポップアップがブロックされました。',
    'history-cleared': '検索履歴が削除されました。',
    'remove-segment': '削除',
    'loading': '処理中...',
    'err-timeout': 'サーバーがタイムアウトしました。しばらくしてから再試行してください。',
    'err-network': 'ネットワークエラーです。接続を確認してください。',
    'err-server': 'サーバーエラーです。しばらくしてから再試行してください。',
    'confirm-time-conflict': 'この時間帯にはすでに予定があります。追加しますか？',
    'search-flights': '検索',
    'search-stays': '検索',
    'btn-run': 'AIおすすめ',
    'btn-run-sync': '一括生成',
    'partial-failure': '一部のデータを取得できませんでした',
    'open-now': '営業中',
    'empty-dest': '旅行先・日付・テーマを選んで［プラン作成］を押すと、おすすめスポット・プラン・航空券・宿泊がまとめて表示されます。',
    'empty-plan': 'まだプランがありません。［プラン作成］を押して始めましょう。',
    'empty-rec-food': 'プランを作成すると、周辺のおすすめグルメがここに表示されます。',
    'empty-rec-food-none': 'このプランに合うおすすめグルメがまだ見つかりません。下の［探索 > グルメ］で探してみてください。',
    'empty-flights': 'プランを作成すると日程に合わせて航空券を探します。条件を変えて［航空券検索］を押すこともできます。',
    'empty-stays': 'プランを作成すると日程に合わせて宿泊先を探します。条件を変えて［宿泊検索］を押すこともできます。',
    'empty-search': '［検索］を押すとここに結果が表示されます。',
    'empty-itinerary': 'プランを作成できませんでした。条件を少し変えるか、しばらくしてから［プラン作成］をもう一度押してください。おすすめスポットを下の日付欄にドラッグして自分で埋めることもできます。',
    'map-no-coords': '地図に表示できる位置情報のある場所がまだありません。',
    'map-loading': '地図を読み込み中…',
    'map-failed': '地図を読み込めませんでした。各スポットのMAPリンクで位置を確認できます。',
    'map-partial': '位置情報のない{n}件は地図に表示されていません。',
    'photo-credit': '写真:',
    'photo-scope-city': '都市の写真',
    'photo-scope-genre': '料理のイメージ',
    'stay-date-unconfirmed': '日付未確認の最安値',
    'stay-date-unconfirmed-tip': 'ご希望の日付の空室と料金は確認できていません。予約ページで必ずご確認ください。',
    'sample-data': 'サンプル',
    'sample-no-select': 'サンプルデータはプランに追加できません',
    'flight-other-date': '別の日付',
    'flight-other-date-tip': 'ご希望とは別の日付の便です',
    'confirm-flight-dates': 'この便は{dates}の日程で、現在の旅行日程と異なります。\n旅行日程をこの便に合わせて（{days}日間）プランに追加しますか？',
    'err-generic': '処理できませんでした。しばらくしてから再度お試しください。',
    'route-cost-fail': '交通費を計算できませんでした。しばらくしてから再度お試しください。',
    'nearest-station': '最寄り駅',
    'source-estimate': 'ℹ️ 推定値',
    'closed-now': '閉店',
    'title-export': 'プランをエクスポート',
    'title-checklist': '旅行チェックリスト',
    'title-emergency': '緊急情報',
    'title-phrases': '旅行会話',
    'title-weather': '天気予報',
    'title-wishlist': 'お気に入り',
    'title-history': '検索履歴',
    'aria-plan': 'おすすめとAIプランをまとめて作成',
    'ai-chat-note': '行きたい場所を自由に入力すると、空港・地域・旅行条件を自動で設定して、おすすめを作成します。',
    'ph-ai-request': '例: USJと道頓堀は必ず行きたい。3泊4日で、移動しやすい宿を教えて',
    'aria-ai-request': 'AIへの旅行条件の入力',
    'btn-ai-assist': 'AIで条件を適用',
    'aria-rec-tabs': 'おすすめの種類',
    'plan-control-copy': '選んだ航空券・宿泊はそのままに、AIプランだけを作り直せます。',
    'aria-undo': '元に戻す (Ctrl+Z)',
    'aria-redo': 'やり直し (Ctrl+Y)',
    'manual-flight-hint': '空港・日付は旅行条件から自動で設定されます。往路=出発地→到着地、復路=到着地→出発地',
    'label-flight-no': '便名',
    'label-outbound-dep': '往路の出発',
    'label-return-dep': '復路の出発',
    'label-price-krw': '料金（ウォン）',
    'ph-airline': '例: 大韓航空',
    'ph-flight-no': '例: KE713',
    'btn-add-flight': '航空便を追加',
    'label-stay-name': '宿泊施設名',
    'label-area': 'エリア',
    'label-price-night': '1泊の料金（ウォン）',
    'label-rating10': '評価（0〜10）',
    'label-stay-type': '宿泊タイプ',
    'label-booking-link': '予約リンク',
    'ph-stay-name': '例: 品川のホテル（東京）',
    'ph-stay-area': '例: 品川',
    'btn-add-stay': '宿泊を追加',
    'btn-search': '検索',
    'aria-dest-search': 'スポットを検索',
    'ph-food-genre': 'ジャンル（例: ラーメン）',
    'aria-food-search': 'グルメを検索',
    'aria-trip-tabs': '航空券の種類',
    'ph-from': '出発空港',
    'ph-to': '到着空港（空欄なら都市の空港）',
    'multi-help': '多都市は下の区間を編集して検索します。2区間以上が必要です。',
    'label-date': '日付',
    'btn-add-segment': '区間を追加',
    'btn-reset-segments': 'リセット',
    'filter-tab': 'フィルター',
    'label-price-min': '最低価格（ウォン）',
    'label-price-max': '最高価格（ウォン）',
    'ph-price-min': '最低価格',
    'ph-price-max': '最高価格',
    'label-hour-min': '出発時刻（最も早い）',
    'label-hour-max': '出発時刻（最も遅い）',
    'label-airport-filter': '空港フィルター（カンマ区切り）',
    'label-airline-filter': '航空会社フィルター（カンマ区切り）',
    'ph-airport-filter': '空港コード（例: ICN,NRT）',
    'ph-airline-filter': '航空会社（例: Korean Air,ANA）',
    'check-airports': '空港',
    'check-airlines': '航空会社',
    'sort-rating': '評価順',
    'label-rating-min': '最低評価',
    'check-providers': '予約サイト',
    'check-amenities': '設備',
    'modal-place-name': 'スポット名',
    'ph-modal-place': '追加するスポット名を入力',
    'modal-type': '種類',
    'ph-phrases-search': '場面で検索（例: 注文、道、薬局）',
    'login-desc': 'ログインするとプランを保存・読み込みできます。',
    'login-naver': 'Naverでログイン',
    'login-kakao': 'Kakaoでログイン',
    'login-google': 'Googleでログイン',
    'save-name-label': 'プラン名',
    'ph-save-name': 'プラン名を入力してください',
    'promote-dest': '⬆ おすすめに追加',
    'promote-added': '✅ 追加しました',
    'promote-exists': 'すでにおすすめにあります',
    'wishlist-toggle': 'お気に入りに追加・削除',
    'arrive-at': '{t} 到着',
    'depart-at': '{t} 出発',
    'itin-dest-label': '📍 スポット',
    'itin-food-label': '🍴 グルメ',
    'drop-here': 'ここにドロップ',
    'btn-add-food': 'グルメを追加',
    'outbound-label': '✈️ 往路: ',
    'return-label': '✈️ 復路: ',
    'per-night-suffix': '/泊',
    'budget-title': '費用の目安',
    'cost-stay-label': '🏨 宿泊',
    'nights-unit': '泊',
    'route-move': ' · 移動 ',
    'tours-popular': '{city}の人気ツアー＆アクティビティ',
    'tours-loading': '{city}のツアーを読み込み中…',
    'tour-klook': 'Klookツアー',
    'tour-viator': 'Viatorツアー',
    'weather-10day': '{city} 10日間の予報',
    'wx-rain': '☔ 旅行中{n}日は雨の予報です。傘を忘れずに、屋内スポットも用意しましょう。',
    'wx-cold': '❄️ 寒い日があります。暖かい服を用意しましょう。',
    'wx-hot': '🔥 暑い日があります。水分補給と日焼け対策をしましょう。',
    'export-no-plan': 'プランがありません。先にAIプランを作成してください。',
    'export-flight': '航空券',
    'export-stay': '宿泊',
    'export-cost': '費用の目安',
    'cost-flight-line': '航空券: ',
    'cost-stay-line': '宿泊: ',
    'cost-food-line': '食費（目安）: ~',
    'cost-transport-line': '交通費（目安）: ~',
    'saved-default': '保存しました。',
    'alert-title': '📊 プランチェック',
    'alert-too-many': '{d}: スポット{n}か所は少し詰め込みすぎかもしれません。移動時間を考えると3か所以下がおすすめです。',
    'alert-no-meal': '{d}: まだグルメが追加されていません。追加してみましょう！',
    'alert-allday': '{d}: 終日の予定と他のスポットが同じ日にあります。時間が重ならないか確認してください。',
    'alert-dup': '「{p}」がDay {a}とDay {b}で重複しています。',
    'alert-late-arrival': 'Day 1は夕方の到着です。初日はチェックインと近所の散策くらいがちょうどいいでしょう。',
    'alert-early-dep': '最終日は午前の出発です。2時間前に空港に着けるよう、前日に荷造りしておきましょう。',
    'memo-title': 'メモを追加・編集',
    'memo-prompt': '📝 {p}のメモ:',
    'fx-chip': '100円≈{a}ウォン | 1万ウォン≈{b}円',
    'fx-title': '為替レート（1円={r}ウォン）· {d}',
    'fx-credit': '為替レート提供: Exchange Rate API',
    'weather-credit': '天気データ: Open-Meteo.com',
    'auth-err-state': 'ログインの確認時間が過ぎたか、別のウィンドウでログインを始めたようです。もう一度お試しください。',
    'auth-err-provider': '{p}でのログインを完了できませんでした。しばらくしてからもう一度お試しください。',
    'auth-err-generic': 'ログインを完了できませんでした。しばらくしてからもう一度お試しください。',
    'title-save-plan': '現在のプランを保存',
    'title-my-plans': '保存済みプラン',
    'saved-suffix': ' 保存',
    'wishlist-empty1': 'お気に入りはまだありません。',
    'wishlist-empty2': 'スポットやグルメのカードのハートボタンを押してみてください。',
    'wishlist-count': '{n}件保存済み',
    'hist-plan': 'プラン: ',
    'hist-flight': '航空券: ',
    'hist-stay': '宿泊: ',
    'hist-food': 'グルメ: ',
    'hist-dest': 'スポット: ',
    'days-unit': '日間',
    'hist-empty': '検索履歴はありません。',
    'min-ago': '{n}分前',
    'hours-ago': '{n}時間前',
    'hist-clear': '履歴をすべて削除',
    'pref-cities': 'よく行く都市: ',
    'pref-themes': '好みのテーマ: ',
    'btn-copy': '📋 コピー',
    'phrases-none': '該当するフレーズがありません。'
  }
};

function t(key) {
  // 사전이 아직 준비되지 않은 시점에 불려도 예외 없이 동작하게 한다.
  if (typeof I18N === 'undefined' || !I18N) return key;
  var dict = I18N[currentLang] || I18N.ko || {};
  // 빈 문자열('')도 올바른 번역값이다(예: 영어의 'stops-suffix'). 키가 있으면 그대로 쓴다.
  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  return (I18N.ko && I18N.ko[key]) || key;
}

// Display helper: translate internal period names for UI display
var PERIOD_DISPLAY = {
  '아침': { ko: '아침', en: 'Breakfast', ja: '朝食' },
  '점심': { ko: '점심', en: 'Lunch', ja: '昼食' },
  '저녁': { ko: '저녁', en: 'Dinner', ja: '夕食' },
  '오전': { ko: '오전', en: 'Morning', ja: '午前' },
  '오후': { ko: '오후', en: 'Afternoon', ja: '午後' },
  '종일': { ko: '종일', en: 'All Day', ja: '終日' }
};
function tPeriod(p) {
  var m = PERIOD_DISPLAY[p];
  return m ? (m[currentLang] || m.ko) : p;
}

function applyLanguage(lang) {
  currentLang = lang;
  try { localStorage.setItem('travelLang', lang); } catch (e) {}
  document.documentElement.lang = lang === 'ko' ? 'ko' : lang === 'ja' ? 'ja' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(function(elem) {
    // 처리 중인 버튼의 '처리 중...' 문구는 작업이 끝날 때 새 언어로 복원된다.
    if (elem.classList.contains('btn-loading')) return;
    var key = elem.getAttribute('data-i18n');
    var val = t(key);
    if (val && val !== key) {
      if (elem.tagName === 'INPUT' && elem.type !== 'hidden') {
        // skip
      } else {
        elem.textContent = val;
      }
    }
  });
  // 입력 안내 문구·툴팁·스크린리더용 이름
  [['data-i18n-placeholder', 'placeholder'], ['data-i18n-title', 'title'], ['data-i18n-aria', 'aria-label']].forEach(function(pair) {
    document.querySelectorAll('[' + pair[0] + ']').forEach(function(elem) {
      var key = elem.getAttribute(pair[0]);
      var val = t(key);
      if (val && val !== key) elem.setAttribute(pair[1], val);
    });
  });
  var sectionIds = ['section-conditions', 'section-results', 'section-explore', 'section-flights', 'section-stays', 'section-tours'];
  for (var si = 0; si < sectionIds.length; si++) {
    var elem = document.getElementById(sectionIds[si]);
    if (elem) elem.textContent = t(sectionIds[si]);
  }
  var btnMap = { 'btnPlan': 'btn-plan', 'btnFlights': 'btn-flights', 'btnStays': 'btn-stays', 'btnFood': 'btn-food' };
  for (var btnId in btnMap) {
    var b = el(btnId);
    if (b && !b.classList.contains('btn-loading')) b.textContent = t(btnMap[btnId]);
  }
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  // 문서 제목("Tabimaru — AI 일본 여행 플래너")과 설명도 화면 언어로
  applyBrand();

  // Re-render dynamic content with new language
  try {
    if (typeof renderItineraryTimeline === 'function' && typeof currentItineraryData !== 'undefined' && currentItineraryData) {
      renderItineraryTimeline();
    }
    if (typeof renderFlightCards === 'function' && typeof flightResults !== 'undefined' && flightResults.length > 0) {
      renderFlightCards();
    }
    if (typeof renderStayCards === 'function' && typeof stayResults !== 'undefined' && stayResults.length > 0) {
      renderStayCards();
    }
    if (lastStayFilterOptions) {
      // 이미 고른 체크는 유지한다.
      var checkedAmenities = getCheckedValues('.stay-amenity-check');
      var checkedProviders = getCheckedValues('.stay-provider-check');
      renderStayFilterChecks(lastStayFilterOptions);
      document.querySelectorAll('.stay-amenity-check').forEach(function(c) { c.checked = checkedAmenities.indexOf(c.value) >= 0; });
      document.querySelectorAll('.stay-provider-check').forEach(function(c) { c.checked = checkedProviders.indexOf(c.value) >= 0; });
    }
    if (typeof renderPlanSelectionCards === 'function') {
      renderPlanSelectionCards();
    }
    // 출처 안내·사진 출처·지도 안내도 새 언어로 다시 그린다.
    rerenderSourceNotes();
    if (latestDestList.length > 0) renderCards('destCards', latestDestList, 'dest');
    if (latestRecFoodList.length > 0) renderRecFoodCards(latestRecFoodList);
    if (latestDestSearchList.length > 0) renderDestSearchCards(latestDestSearchList);
    if (latestFoodSearchList.length > 0) renderCards('foodCards', latestFoodSearchList, 'food');
    if (currentItineraryData) updateItinMap();
  } catch(e) { console.warn('re-render on lang switch:', e.message); }
  // 도시·공항 이름, 로그인 영역, 환율, 투어 링크, 날씨, 패널 내용도 새 언어로 다시 그린다.
  try {
    relabelCityOptions();
    relabelAirportInputs();
    document.querySelectorAll('.remove-segment').forEach(function(b) { b.textContent = t('remove-segment'); });
    renderAuthUI();
    renderFxChip();
    refreshTourFallback();
    if (el('budgetSummary') && el('budgetSummary').innerHTML) renderBudgetSummary();
    if (lastWeather) renderWeatherWidget(lastWeather.daily, cityNameByKey(lastWeather.cityKey));
    renderEmergency();
    renderPhrases(el('phrasesSearch') ? el('phrasesSearch').value : '');
    var exportPanel = el('exportPanel');
    var exportPreview = el('exportPreview');
    if (exportPanel && exportPanel.classList.contains('show') && exportPreview) exportPreview.textContent = buildItineraryText('text');
    var myPlansPanel = el('myPlansPanel');
    if (myPlansPanel && myPlansPanel.classList.contains('show') && currentUser) loadMyPlansList();
    if (document.querySelector('.pref-hints')) showPreferenceHints();
    // localStorage를 읽는 패널은 마지막에(차단된 브라우저에서 예외가 나도 위 작업은 끝나도록)
    renderChecklist();
    renderWishlistPanel();
    renderSearchHistoryPanel();
  } catch(e) { console.warn('re-render panels on lang switch:', e.message); }
}

document.addEventListener('click', function(e) {
  var langBtn = e.target.closest('.lang-btn');
  if (langBtn) { applyLanguage(langBtn.dataset.lang); }
});

if (currentLang !== 'ko') {
  setTimeout(function() { applyLanguage(currentLang); }, 500);
}

// 로그인 실패 안내는 언어 사전(I18N)과 토스트 요소(#memoToast, 이 스크립트보다 뒤에 있음)가 준비된 뒤 띄운다.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showAuthErrorNotice);
else showAuthErrorNotice();

