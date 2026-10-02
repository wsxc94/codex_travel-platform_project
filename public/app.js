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
var pendingAddMode = 'add';      // 'add' | 'move' (일정 추가 창을 '옮기기'로 쓸 때)
var pendingMoveFrom = null;      // { day, blockIndex }
let selectedStayId = '';
let selectedStay = null;
// 직접 입력한 항공·숙소는 검색 결과와 따로 보관한다(다시 검색해도 사라지지 않게).
var manualFlights = [];
var manualStays = [];
let aiPreferredAreas = [];
let aiPreferAirportAccess = false;
let aiRouteCities = [];
let aiRegionDayPlan = [];
let aiSpecialPrefs = {};
// 말로 한 요청(채팅)에서 알아낸 의도. /api/travel-plan 본문(request·mustVisit·excludedPlaces·foodWishes·_picks)으로 보낸다.
var chatHistory = [], lastParsedConditions = null, aiRequestText = '', aiMustVisit = [], aiWantedNames = [], aiExcludedPlaces = [], aiFoodWishes = [];
// 요청칸(#aiRequest)의 글 중 이미 처리한(채팅으로 적용했거나 조건 변경으로 무효가 된) 문장. 같은 글로 주 버튼을 다시 누르면 채팅을 또 부르지 않는다.
var aiRequestHandledText = '';

function resetAiIntentState(keepHandledText) {
  chatHistory = [];
  lastParsedConditions = null;
  aiRequestText = '';
  aiMustVisit = [];
  aiWantedNames = [];
  aiExcludedPlaces = [];
  aiFoodWishes = [];
  aiPreferredAreas = [];
  aiPreferAirportAccess = false;
  aiRouteCities = [];
  aiRegionDayPlan = [];
  aiSpecialPrefs = {};
  // 예산도 말로 한 요청에서만 정해지므로 함께 표준으로 되돌린다(저장한 일정을 불러오면 그 값으로 다시 채운다).
  setBudgetTier('mid');
  var box = document.getElementById('aiRequest');
  aiRequestHandledText = keepHandledText && box ? String(box.value || '').trim() : '';
}

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

// 요청 시간 제한: 일정 생성·채팅 해석(AI)은 90초, 나머지는 30초. 시간이 다 되면 요청을 끊고 안내 문구를 던진다.
var LONG_REQUEST_RE = /\/api\/(travel-plan|ai-travel-chat)$/;

function requestTimeoutMs(url) {
  return LONG_REQUEST_RE.test(String(url || '').split('?')[0]) ? 90000 : 30000;
}

// fetch + 시간 제한. AbortController가 없는 환경(오래된 브라우저·테스트 샌드박스)에서는 그냥 fetch한다.
// readBody(res)가 있으면 본문 읽기까지 시간 제한 안에서 끝낸다.
async function fetchWithTimeout(url, init, timeoutMs, readBody) {
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, timeoutMs || requestTimeoutMs(url)) : null;
  try {
    var res = await fetch(url, Object.assign({}, init || {}, ctrl ? { signal: ctrl.signal } : {}));
    return readBody ? await readBody(res) : res;
  } catch (err) {
    if (ctrl && ctrl.signal.aborted) throw new Error(t('err-timeout'));
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function postJson(url, payload, opts) {
  return fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, opts && opts.timeoutMs, async function(res) {
    if (!res.ok) {
      if (res.status === 429) throw new Error(t('err-rate-limit'));
      if (res.status === 400) {
        var serverMsg = '';
        try { var errData = await res.json(); serverMsg = String(errData.error || ''); } catch (e) { serverMsg = ''; }
        // 서버의 영문 검증 문구(예: "days must be a number")는 그대로 보여주지 않는다.
        throw new Error(isLocalizedMessage(serverMsg) ? serverMsg : t('err-input'));
      }
      var httpErr = new Error('HTTP ' + res.status);
      httpErr.status = res.status;
      throw httpErr;
    }
    return res.json();
  });
}

// 사용자에게 그대로 보여줘도 되는(이미 한국어/일본어로 된) 짧은 문구인지
function isLocalizedMessage(msg) {
  var s = String(msg || '');
  return s.length > 0 && s.length <= 120 && /[가-힯぀-ヿ一-鿿]/.test(s);
}

// Loading state helpers
// 버튼 기본 문구는 언어 사전에서 다시 가져온다(검색 버튼이 '검색'으로 바뀌던 문제 방지).
var BUTTON_LABEL_KEYS = { btnPlan: 'btn-plan', btnFlights: 'btn-flights', btnStays: 'btn-stays', btnFood: 'btn-food', btnDestSearch: 'btn-search', btnAiAssist: 'btn-ai-assist', btnPlanRefresh: 'btn-refresh-plan' };

// 일정 생성 버튼은 '일정 만드는 중…', 나머지 검색 버튼은 '처리 중…'
var PLAN_BUSY_LABEL_IDS = { btnPlan: true, btnAiAssist: true, btnPlanRefresh: true };

function setLoading(btnId, loading) {
  var btn = el(btnId);
  if (!btn) return;
  if (loading) {
    if (!btn.classList.contains('btn-loading')) btn._origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t(PLAN_BUSY_LABEL_IDS[btnId] ? 'btn-plan-busy' : 'loading') || 'Loading...';
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
  // [일정만 다시 만들기]·저장·내보내기·되돌리기는 일정이 있을 때만 켠다.
  updatePlanControls();
}

function showCardLoading(containerId) {
  var c = el(containerId);
  if (c) c.innerHTML = '<div class="card loading-card"><div class="spinner"></div></div>';
}

// ── 일정 생성 중 안내(UX-03) ──
// 일정이 없으면 일정 칸에 로딩 카드를, 이미 있으면 그 위에 한 줄 안내를 띄운다.
// 8초가 지나도 끝나지 않으면 '무료 서버가 깨어나는 중' 안내를 덧붙인다(Render 무료 서버는 처음 요청이 느리다).
var PLAN_WAKING_MS = 8000;
var planLoadingTimer = null;
var planWakingShown = false;

function planLoadingHolder() {
  var box = el('planResult');
  return box ? box.querySelector('.loading-card, .plan-busy-note') : null;
}

function planWakingHtml() {
  return '<p class="plan-waking" style="flex:1 1 100%;margin:0">' + escapeHtml(t('server-waking')) + '</p>';
}

// 이미 있는 일정 위에 얹는 '만드는 중' 한 줄. 기다리는 동안 보드를 고쳐 다시 그려도 다시 붙인다.
function planBusyNoteHtml() {
  return '<div class="plan-busy-note" role="status"><p class="plan-building-text">' + escapeHtml(t('plan-building')) + '</p>' +
    (planWakingShown ? planWakingHtml() : '') + '</div>';
}

function showPlanLoading() {
  var box = el('planResult');
  if (!box || planLoadingTimer) return;
  var hasPlan = Boolean(currentItineraryData && itineraryHasContent(currentItineraryData.itinerary));
  var text = '<p class="plan-building-text">' + escapeHtml(t('plan-building')) + '</p>';
  planWakingShown = false;
  if (hasPlan) {
    box.insertAdjacentHTML('afterbegin', planBusyNoteHtml());
  } else {
    box.innerHTML = '<div class="card loading-card" role="status"><div class="spinner"></div>' + text + '</div>';
  }
  planLoadingTimer = setTimeout(function() {
    planWakingShown = true;
    var holder = planLoadingHolder();
    if (holder && !holder.querySelector('.plan-waking') && typeof holder.insertAdjacentHTML === 'function') {
      holder.insertAdjacentHTML('beforeend', planWakingHtml());
    }
  }, PLAN_WAKING_MS);
}

// 끝나면(성공·실패) 안내를 거둔다. 일정이 없던 자리의 로딩 카드는 errorText(실패) 또는 첫 화면 안내로 바꾼다.
function hidePlanLoading(errorText) {
  if (planLoadingTimer) { clearTimeout(planLoadingTimer); planLoadingTimer = null; }
  planWakingShown = false;
  var box = el('planResult');
  if (!box) return;
  Array.prototype.forEach.call(box.querySelectorAll('.plan-busy-note'), function(n) { if (n.remove) n.remove(); });
  if (!box.querySelector('.loading-card')) return;
  if (currentItineraryData) { renderItineraryTimeline(); return; }
  box.innerHTML = errorText
    ? '<div class="itin-summary empty-state plan-error" role="alert">' + escapeHtml(errorText) + '</div>'
    : '<div class="itin-summary empty-state" data-i18n="empty-plan">' + escapeHtml(t('empty-plan')) + '</div>';
}

// 일정이 준비되면: 토스트, (말로 요청했다면) 채팅 안내, 휴대폰·태블릿(≤960px)은 일정 제목으로 화면 이동
function announcePlanReady(opts, replacingEdits) {
  opts = opts || {};
  showMemoToast(t(replacingEdits ? 'regen-undo-hint' : 'plan-ready'), replacingEdits ? 4000 : 2500);
  if (opts.fromChat) appendAiChat('assistant', t('chat-done'));
  var mainTrigger = opts.fromChat || opts.trigger === 'btnPlan' || opts.trigger === 'btnAiAssist';
  if (!mainTrigger || !(window.innerWidth <= 960)) return;
  var heading = document.querySelector('h3[data-i18n="ai-itinerary"]');
  if (heading && typeof heading.scrollIntoView === 'function') {
    try { heading.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  }
}

// 일정 조작 버튼 상태(UX-04): 일정이 없으면 다시 만들기·저장·내보내기를 끄고, 되돌리기·다시 실행은 기록 위치에 맞춘다.
function setButtonDisabled(id, disabled) {
  var b = el(id);
  if (!b || b.classList.contains('btn-loading')) return;
  b.disabled = Boolean(disabled);
}

function updatePlanControls() {
  var hasPlan = Boolean(currentItineraryData);
  var hasContent = hasPlan && itineraryHasContent(currentItineraryData.itinerary);
  setButtonDisabled('btnPlanRefresh', !hasPlan || planBusyCount > 0);
  setButtonDisabled('btnPlanSave', !hasContent);
  setButtonDisabled('btnPlanExport', !hasContent);
  setButtonDisabled('btnItinUndo', !(_itinHistoryIdx > 0));
  setButtonDisabled('btnItinRedo', !(_itinHistoryIdx >= 0 && _itinHistoryIdx < _itinHistory.length - 1));
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
  var returnDate = el('returnDate');
  if (returnDate && returnDate.value && departDate && departDate.value && returnDate.value < departDate.value) {
    returnDate.value = departDate.value;
  }
  var checkInDate = el('checkIn');
  if (checkInDate && checkInDate.value && checkInDate.value < today) {
    checkInDate.value = today;
    // 체크인을 오늘로 당기면 체크아웃이 체크인보다 앞서지 않게 다시 맞춘다.
    var checkOutDate = el('checkOut');
    if (checkOutDate && checkOutDate.value && checkOutDate.value <= today) checkOutDate.value = addDays(today, 1);
  }
}

// 날짜 입력칸은 오늘 이전을 고르지 못하게 한다(지난 날짜는 검색 전에 validateDates가 오늘로 고친다).
function applyDateMins() {
  var today = todayDateString();
  ['startDate', 'departDate', 'returnDate', 'checkIn', 'checkOut'].forEach(function(id) {
    var input = el(id);
    if (input) input.setAttribute('min', today);
  });
}

applyDateMins();

// 도시 목록(무료)을 불러온다. 서버가 깨어나는 중이면 비어 올 수 있어 2초·5초 뒤 두 번 더 시도한다.
// 성공하면 true. 끝내 실패하면 조건 칸에 [다시 시도] 안내를 띄우고 생성 버튼을 잠근다.
var CITY_RETRY_DELAYS_MS = [2000, 5000];
var citiesReady = false;

function waitMs(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function fetchCityList() {
  try {
    var res = await fetchWithTimeout('/api/cities', {}, 30000);
    if (!res.ok) return [];
    var data = await res.json();
    return Array.isArray(data && data.cities) ? data.cities.filter(function(c) { return c && c.key && c.label; }) : [];
  } catch (e) {
    return [];
  }
}

function setPlanButtonsWaitingForCities(waiting) {
  ['btnPlan', 'btnAiAssist'].forEach(function(id) {
    var b = el(id);
    if (!b || b.classList.contains('btn-loading')) return;
    b.disabled = Boolean(waiting);
  });
}

function showCitiesError(show) {
  var old = el('citiesErrorNote');
  if (!show) { if (old) old.remove(); return; }
  if (old) return;
  var heading = el('section-conditions');
  var note = document.createElement('div');
  note.id = 'citiesErrorNote';
  note.className = 'source-note warn';
  note.setAttribute('role', 'alert');
  note.innerHTML = '<span data-i18n="err-cities">' + escapeHtml(t('err-cities')) + '</span> ' +
    '<button type="button" class="retry-cities-btn" data-i18n="btn-retry">' + escapeHtml(t('btn-retry')) + '</button>';
  if (heading && heading.parentNode) heading.parentNode.insertBefore(note, heading.nextSibling);
  else if (document.body) document.body.appendChild(note);
}

async function initCityOptions() {
  setPlanButtonsWaitingForCities(true);
  var list = await fetchCityList();
  for (var attempt = 0; list.length === 0 && attempt < CITY_RETRY_DELAYS_MS.length; attempt++) {
    await waitMs(CITY_RETRY_DELAYS_MS[attempt]);
    list = await fetchCityList();
  }
  if (list.length === 0) {
    showCitiesError(true);
    return false;
  }
  applyCityList(list);
  return true;
}

// 도시 선택의 첫 묶음(자주 가는 순)
var POPULAR_CITY_KEYS = ['tokyo', 'osaka', 'kyoto', 'fukuoka', 'sapporo', 'okinawa', 'nagoya'];

function applyCityList(list) {
  const cities = list.slice().sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  cityCatalog = cities;
  for (const c of cities) {
    if (!AIRPORTS.some((a) => a.code === c.airport)) {
      AIRPORTS.push({ code: c.airport, nameKo: `${c.label} 공항`, cityKo: c.label, country: 'JP' });
    }
  }
  // 인기 도시 묶음을 먼저, 나머지는 가나다순 묶음으로(UX-07). 묶음 이름은 언어를 바꾸면 relabelCityOptions가 바꾼다.
  const optionHtml = (c) => `<option value="${escapeHtml(c.key)}">${escapeHtml(localPlaceName(c.label))} (${escapeHtml(c.airport)})</option>`;
  const popular = POPULAR_CITY_KEYS.map((k) => cities.find((c) => c.key === k)).filter(Boolean);
  const rest = cities.filter((c) => POPULAR_CITY_KEYS.indexOf(c.key) < 0);
  const options = popular.length
    ? `<optgroup label="${escapeHtml(t('city-popular'))}" data-city-group="popular">${popular.map(optionHtml).join('')}</optgroup>` +
      (rest.length ? `<optgroup label="${escapeHtml(t('city-all'))}" data-city-group="all">${rest.map(optionHtml).join('')}</optgroup>` : '')
    : cities.map(optionHtml).join('');
  el('city').innerHTML = options;
  el('foodCity').innerHTML = options;
  el('stayCity').innerHTML = options;
  if (el('destSearchCity')) el('destSearchCity').innerHTML = options;
  el('city').value = 'tokyo';
  el('foodCity').value = 'tokyo';
  el('stayCity').value = 'tokyo';
  if (el('destSearchCity')) el('destSearchCity').value = 'tokyo';
  citiesReady = true;
  showCitiesError(false);
  setPlanButtonsWaitingForCities(false);
}

// [다시 시도]: 도시 목록을 다시 받고, 받으면 도시에 딸린 기본값(도착 공항·다구간·투어 링크)을 채운다.
document.addEventListener('click', function(e) {
  var retry = e.target && e.target.closest ? e.target.closest('.retry-cities-btn') : null;
  if (!retry) return;
  retry.disabled = true;
  fetchCityList().then(function(list) {
    if (list.length === 0) { retry.disabled = false; showMemoToast(t('err-cities')); return; }
    applyCityList(list);
    onCitiesLoaded();
  });
});

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
    Array.prototype.forEach.call(select.querySelectorAll('optgroup[data-city-group]'), function(g) {
      g.label = t(g.getAttribute('data-city-group') === 'popular' ? 'city-popular' : 'city-all');
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
  var title = escapeHtml(fillText(t('ai-score-title'), { n: n }));
  return '<span class="ai-badge ' + cls + '" title="' + title + '">' + n + '</span>';
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

// 이름표는 data-i18n을 달아 언어를 바꾸면 지난 말풍선의 이름표도 함께 바뀐다(본문은 그때 언어 그대로).
function appendAiChat(role, text) {
  const box = el('aiChatLog');
  if (!box) return;
  const cls = role === 'user' ? 'user' : 'assistant';
  const labelKey = role === 'user' ? 'chat-user' : 'chat-ai-name';
  box.insertAdjacentHTML('beforeend', '<div class="chat-msg ' + cls + '"><strong data-i18n="' + labelKey + '">' + escapeHtml(t(labelKey)) + '</strong><br>' + escapeHtml(text) + '</div>');
  box.scrollTop = box.scrollHeight;
}

// ── 채팅 의도 확인 칩(UX-06): 무엇을 알아들었는지 assistant 말풍선 아래에 보여 준다 ──
// 언어를 바꾸면 다시 그릴 수 있게 칩 묶음과 해석 결과를 기억해 둔다.
var chatIntentRecords = [];

function intentChipsHtml(parsed, labelLang) {
  var p = parsed || {};
  var chips = [];
  var add = function(text, cls) { if (text) chips.push('<span class="intent-chip' + (cls ? ' ' + cls : '') + '">' + escapeHtml(text) + '</span>'); };
  var plan = Array.isArray(p.regionDayPlan) ? p.regionDayPlan.filter(function(x) { return x && x.cityLabel && Number(x.days) > 0; }) : [];
  if (plan.length > 1) {
    add(plan.map(function(x) { return localPlaceName(x.cityLabel) + ' ' + fillText(t('intent-days'), { n: Number(x.days) }); }).join(' → '));
  } else if (p.cityKey) {
    add(cityNameByKey(p.cityKey) || localPlaceName(p.cityLabel || ''));
  }
  if (Number(p.days) > 0) {
    var md = shortDateLabel(p.startDate);
    add(fillText(t('intent-days'), { n: Number(p.days) }) + (md ? ' (' + fillText(t('intent-start'), { date: md }) + ')' : ''));
  }
  if (p.theme) {
    var themeKey = 'theme-' + p.theme;
    var themeName = t(themeKey) === themeKey ? String(p.theme) : t(themeKey);
    add(fillText(t('intent-theme'), { t: themeName }));
  }
  // 서버가 화면 언어 표기(parsed.labels, 원래 배열과 같은 순서)를 주면 칩에는 그 표기를 쓴다(en/ja에 한국어 이름이 섞이지 않게).
  // labels는 요청할 때의 언어로 만들어지므로, 그 뒤 언어를 바꿨으면 원래 이름(ko) 또는 내장 이름표로 보인다.
  var lb = p.labels && typeof p.labels === 'object' && (!labelLang || labelLang === currentLang) ? p.labels : {};
  var shown = function(list, i, fallback) {
    var arr = Array.isArray(list) ? list : [];
    var v = typeof arr[i] === 'string' ? arr[i].trim() : '';
    return v || localPlaceName(fallback);
  };
  if (p.foodKeyword) add(fillText(t('intent-food'), { f: (typeof lb.foodKeyword === 'string' && lb.foodKeyword.trim()) || String(p.foodKeyword) }));
  // 예산: 표준(mid)이 아닐 때만 보인다(저예산 → 무료·저렴한 곳 위주로 짜도록 서버에 전달됨)
  if (p.budget === 'low') add(t('intent-budget-low'));
  else if (p.budget === 'high') add(t('intent-budget-high'));
  // 조건(서버 답장의 '조건' 줄과 같은 순서): 쇼핑 제외·늦은 시작·하루 N곳 등
  var sp = p.specialPrefs && typeof p.specialPrefs === 'object' ? p.specialPrefs : {};
  var maxPlaces = Number(sp.maxPlacesPerDay);
  var startAt = p.startTimeMin || sp.startTimeMin || '';
  if (sp.indoorFocus) add(t('intent-cond-indoor'));
  if (sp.lateStart || startAt) add(fillText(t('intent-cond-late-start'), { t: startAt || '10:30' }));
  if (maxPlaces > 0) add(fillText(t('intent-cond-max-places'), { n: maxPlaces }));
  if (sp.addRestDay || sp.doNothingDay) add(t('intent-cond-rest-day'));
  if (sp.publicTransitOnly) add(t('intent-cond-transit'));
  if (sp.removeShopping) add(t('intent-cond-no-shopping'));
  if (sp.lowWalking || sp.strollerFriendly) add(t('intent-cond-low-walking'));
  if (sp.kidsFriendly) add(t('intent-cond-kids'));
  if (sp.relaxedPace && !(maxPlaces > 0)) add(t('intent-cond-relaxed'));
  if (sp.nightViewFocus) add(t('intent-cond-night-view'));
  if (p.arrivalTime) add(fillText(t('intent-cond-arrival'), { t: p.arrivalTime }));
  if (p.departureTime) add(fillText(t('intent-cond-departure'), { t: p.departureTime }));
  // 이름(비교용, 원래 표기) + 칩 표기(labels). labels 배열은 원래 배열과 길이가 같을 때만 같은 자리 값을 쓴다.
  var named = function(list, labelList, max) {
    var src = Array.isArray(list) ? list : [];
    var lbl = Array.isArray(labelList) && labelList.length === src.length ? labelList : [];
    var out = [];
    src.forEach(function(x, i) {
      var n = typeof x === 'string' ? x.trim() : (x && x.name ? String(x.name).trim() : '');
      if (n && out.length < max) out.push({ name: n, label: shown(lbl, i, n) });
    });
    return out;
  };
  var wanted = named(p.wantedPlaces, lb.wantedPlaces, 8);
  wanted.forEach(function(w) { add(fillText(t('intent-must'), { p: w.label }), 'ok'); });
  named(p.excludedPlaces, lb.excludedPlaces, 8).forEach(function(x) { add(fillText(t('intent-excluded'), { p: x.label })); });
  // 서버가 당일치기로 대신 넣은 지역(예: 나라 → '나라 공원·도다이지')은 '반영 못 함'으로 보이지 않는다.
  named(p.unsupportedPlaces, lb.unsupportedPlaces, 5).forEach(function(u) {
    var substituted = wanted.some(function(w) { return w.name.indexOf(u.name) >= 0; });
    if (!substituted) add(fillText(t('intent-unsupported'), { p: u.label }), 'warn');
  });
  return chips.join('');
}

function appendIntentChips(parsed) {
  var box = el('aiChatLog');
  if (!box || typeof document.createElement !== 'function') return;
  var html = intentChipsHtml(parsed, currentLang);
  if (!html) return;
  var node = document.createElement('div');
  node.className = 'chat-intent-chips';
  node.innerHTML = html;
  box.appendChild(node);
  chatIntentRecords.push({ node: node, parsed: parsed, lang: currentLang });
  box.scrollTop = box.scrollHeight;
}

function rerenderIntentChips() {
  chatIntentRecords = chatIntentRecords.filter(function(r) { return r.node && r.node.isConnected !== false; });
  chatIntentRecords.forEach(function(r) { r.node.innerHTML = intentChipsHtml(r.parsed, r.lang); });
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

// 예산 단계(low·mid·high). 말로 한 요청에서만 정해지고, 요청 의도를 지우면 표준(mid)으로 돌아간다.
var BUDGET_TIERS = ['low', 'mid', 'high'];

function currentBudgetTier() {
  var v = el('budget') ? String(el('budget').value || '') : '';
  return BUDGET_TIERS.indexOf(v) >= 0 ? v : 'mid';
}

function setBudgetTier(tier) {
  if (el('budget')) el('budget').value = BUDGET_TIERS.indexOf(tier) >= 0 ? tier : 'mid';
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
  // 예산(저예산·가성비 → low, 프리미엄 → high)은 화면에 고르는 칸이 없어 숨은 #budget에 담아 다음 요청에 싣는다.
  if (['low', 'mid', 'high'].includes(parsed.budget)) setBudgetTier(parsed.budget);
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
            <span class="drag-hint" aria-hidden="true">${escapeHtml(t('drag-handle'))}</span>
          </div>
        </div>
        <span class="drag-handle" aria-hidden="true" title="${escapeHtml(t('drag-handle'))}">☰</span>
        <div class="link-row">
          <button type="button" class="add-to-plan-btn" data-add-type="dest" data-add-index="${index}" data-add-source="rec">${escapeHtml(t('add-to-plan'))}</button>
          <a href="${escapeHtml(safeLinkUrl(x.mapUrl) || '#')}" target="_blank" rel="noreferrer">${escapeHtml(t('map-link'))}</a>
          <button type="button" class="rec-delete-btn" data-delete-type="dest" data-delete-index="${index}" aria-label="${escapeHtml(t('aria-hide-pick'))}" title="${escapeHtml(t('aria-hide-pick'))}">✕</button>
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

// 항공 카드는 숙소와 같은 규칙으로 나눠 보인다: 처음과 [더보기]마다 2줄(최소 3장). 휴대폰(1열)에서 1장씩만 늘던 문제.
function flightPageSize() {
  return Math.max(3, getFlightCardsPerRow() * 2);
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
          cabinText(s.cabin),
          baggageText(s)
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

// 좌석 등급은 서버의 한국어 표기(cabinLabel) 대신 등급 코드를 화면 언어로 바꿔 보여 준다.
var CABIN_KEYS = { ECONOMY: 'cabin-economy', PREMIUM_ECONOMY: 'cabin-premium', PREMIUM: 'cabin-premium', BUSINESS: 'cabin-business', FIRST: 'cabin-first' };

function cabinText(code) {
  var key = CABIN_KEYS[String(code || '').toUpperCase().replace(/[\s-]+/g, '_')];
  return key ? t(key) : '';
}

// 수하물은 실제 값이 있을 때만 보인다('정보 없음'은 표시하지 않는다).
function baggageText(seg) {
  var v = seg ? (seg.baggage != null ? seg.baggage : seg.baggageAllowance) : null;
  if (v == null || v === '' || v === false) return '';
  return t('baggage-label') + String(v);
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

// 직접 입력한 항공편(manualFlights)은 검색 결과 앞에 늘 보인다.
function allFlights() {
  return manualFlights.concat(flightResults);
}

function renderFlightCards(reset = false) {
  if (refreshFlightSelection()) { renderPlanExtras(); renderItineraryTimeline(); }
  if (reset) {
    visibleFlightCount = flightPageSize();
  }

  const sorted = [...flightResults].sort((a, b) => {
    if (flightSortMode === 'price') return a.totalPriceKRW - b.totalPriceKRW;
    if (flightSortMode === 'duration') return a.totalDurationMin - b.totalDurationMin;
    return b.aiScore - a.aiScore;
  });

  const cards = manualFlights.concat(sorted.slice(0, visibleFlightCount));
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

// ── 일정 칸(시간대) 정의: 모든 배치 경로(끌어 놓기·추가 창·옮기기·터치)가 이 표 하나를 쓴다 ──
var SLOT_DEFS = {
  morning: { period: '오전', start: '09:00', end: '12:00', kind: 'dest' },
  afternoon: { period: '오후', start: '13:00', end: '17:00', kind: 'dest' },
  allday: { period: '종일', start: '09:00', end: '18:00', kind: 'dest' },
  breakfast: { period: '아침', start: '08:00', end: '09:30', kind: 'food' },
  lunch: { period: '점심', start: '12:00', end: '13:30', kind: 'food' },
  dinner: { period: '저녁', start: '18:00', end: '20:00', kind: 'food' }
};
var PERIOD_TO_SLOT = { '오전': 'morning', '오후': 'afternoon', '종일': 'allday', '아침': 'breakfast', '점심': 'lunch', '저녁': 'dinner' };
// 시작 시각이 같을 때의 순서(아침 < 오전 < 종일 < 점심 < 오후 < 저녁)
var PERIOD_SORT_ORDER = { '아침': 0, '오전': 1, '종일': 2, '점심': 3, '오후': 4, '저녁': 5 };
var MEAL_SLOT_KEYS = ['breakfast', 'lunch', 'dinner'];
var DEST_SLOT_KEYS = ['morning', 'afternoon', 'allday'];

// 식당 판정 단어(서버 SV-02와 같은 정의). 저녁·점심 블록이 식사인지 볼 때만 쓴다.
var FOOD_WORD_RE = /라멘|라면|스시|초밥|이자카야|우동|소바|야키토리|야키니쿠|돈카츠|규카츠|카레|타코야키|오코노미야키|모츠나베|히츠마부시|텐동|식당|맛집|레스토랑|식사|ramen|sushi|izakaya|udon|soba|yakitori|yakiniku|tonkatsu|curry|takoyaki|okonomiyaki|restaurant|dinner|lunch|meal|ラーメン|寿司|居酒屋|うどん|そば|焼肉|とんかつ|カレー|たこ焼き|お好み焼き|食堂|レストラン|食事/i;

// 블록 문자열은 이 함수 하나로만 만든다: '<period>(HH:MM-HH:MM): <이름> (<지역>)'
function formatPlanBlock(period, start, end, name, area) {
  var place = String(name || '').trim();
  var where = String(area || '').trim();
  return period + '(' + start + '-' + end + '): ' + place + (where ? ' (' + where + ')' : '');
}

// 'HH:MM' → 분. 형식이 아니면 NaN
function timeToMin(hhmm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function padTime(hhmm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? String(m[1]).padStart(2, '0') + ':' + m[2] : String(hhmm || '');
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
      // _blockIndex: day.blocks \uC548\uC758 \uC6D0\uB798 \uC704\uCE58(\u25B2\u25BC\u00B7\u2715\u00B7\uC62E\uAE30\uAE30\uAC00 \uC815\uD655\uD788 \uC774 \uBE14\uB85D\uC744 \uAC00\uB9AC\uD0A4\uAC8C \uD55C\uB2E4)
      current = Object.assign({}, parsed, { subs: [], tips: [], _blockIndex: i });
    } else if (parsed.type === 'sub' && current) {
      current.subs.push(parsed);
    } else if (parsed.type === 'tip' && current) {
      current.tips.push(parsed);
    } else {
      if (current) groups.push(current);
      current = null;
      groups.push(Object.assign({}, parsed, { _blockIndex: i }));
    }
  }
  if (current) groups.push(current);
  return groups;
}

function isMealPeriod(period) {
  return period === '\uC800\uB141' || period === '\uC544\uCE68' || period === '\uC810\uC2EC';
}

// \uC77C\uC815 \uBCF4\uB4DC \uC0C9: \uC624\uC804 ok, \uC624\uD6C4 warn, \uC885\uC77C info, \uC544\uCE68\u00B7\uC810\uC2EC\u00B7\uC800\uB141\uC740 \uBAA8\uB450 accent
function periodColor(period) {
  var map = { '\uC624\uC804': 'var(--ok)', '\uC624\uD6C4': 'var(--warn)', '\uC885\uC77C': 'var(--info)', '\uC800\uB141': 'var(--accent)', '\uC544\uCE68': 'var(--accent)', '\uC810\uC2EC': 'var(--accent)' };
  return map[period] || 'var(--fg-3)';
}

function periodIcon(period) {
  var map = { '\uC624\uC804': '\uD83C\uDF05', '\uC624\uD6C4': '\u2600\uFE0F', '\uC885\uC77C': '\uD83C\uDF1F', '\uC800\uB141': '\uD83C\uDF07', '\uC544\uCE68': '\uD83C\uDF73', '\uC810\uC2EC': '\uD83C\uDF5C' };
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

// \u2500\u2500 \uC77C\uC815 \uBE14\uB85D \uBC30\uC5F4 \uB2E4\uB8E8\uAE30(\uBE14\uB85D = main \uD55C \uC904 + \uB4A4\uB530\uB974\uB294 \uB4E4\uC5EC\uC4F4 \uC124\uBA85\u00B7\uD301 \uC904) \u2500\u2500

// idx \uBE14\uB85D\uACFC \uADF8 \uC544\uB798 \uC124\uBA85\u00B7\uD301 \uC904\uC758 \uAC1C\uC218
function blockGroupLength(blocks, idx) {
  var n = 1;
  if (parseItineraryBlock(blocks[idx]).type !== 'main') return 1;
  while (idx + n < blocks.length) {
    var p = parseItineraryBlock(blocks[idx + n]);
    if (p.type !== 'sub' && p.type !== 'tip') break;
    n++;
  }
  return n;
}

// idx \uBE14\uB85D(\uC124\uBA85\u00B7\uD301 \uD3EC\uD568)\uC744 \uB5BC\uC5B4 \uB0B8\uB2E4. \uB5BC\uC5B4 \uB0B8 \uC904 \uBC30\uC5F4\uC744 \uB3CC\uB824\uC900\uB2E4.
function removeBlockGroup(dayData, idx) {
  if (!dayData || !Array.isArray(dayData.blocks) || idx < 0 || idx >= dayData.blocks.length) return [];
  return dayData.blocks.splice(idx, blockGroupLength(dayData.blocks, idx));
}

function blockSortValue(parsed) {
  var start = timeToMin(parsed.startTime);
  return { start: Number.isFinite(start) ? start : 9999, order: PERIOD_SORT_ORDER[parsed.period] != null ? PERIOD_SORT_ORDER[parsed.period] : 9 };
}

// \uC2DC\uC791 \uC2DC\uAC01 \uC21C\uC73C\uB85C(\uAC19\uC73C\uBA74 \uC544\uCE68<\uC624\uC804<\uC885\uC77C<\uC810\uC2EC<\uC624\uD6C4<\uC800\uB141) \uB4E4\uC5B4\uAC08 \uC790\uB9AC\uC5D0 \uC904\uB4E4\uC744 \uB123\uACE0, \uB123\uC740 \uC704\uCE58\uB97C \uB3CC\uB824\uC900\uB2E4.
function insertBlockSorted(dayData, lines) {
  var newParsed = parseItineraryBlock(lines[0]);
  var nv = blockSortValue(newParsed);
  var insertIdx = dayData.blocks.length;
  for (var i = 0; i < dayData.blocks.length; i++) {
    var p = parseItineraryBlock(dayData.blocks[i]);
    if (p.type !== 'main') continue;
    var v = blockSortValue(p);
    if (v.start > nv.start || (v.start === nv.start && v.order > nv.order)) { insertIdx = i; break; }
  }
  Array.prototype.splice.apply(dayData.blocks, [insertIdx, 0].concat(lines));
  return insertIdx;
}

function findItineraryDay(dayNum) {
  if (!currentItineraryData || !Array.isArray(currentItineraryData.itinerary)) return null;
  return currentItineraryData.itinerary.find(function(d) { return d && Number(d.day) === Number(dayNum); }) || null;
}

// \uADF8\uB0A0 \uD55C \uC2DC\uAC04\uB300(period)\uC758 main \uBE14\uB85D\uB4E4(\uD654\uBA74 \uC21C\uC11C = \uC2DC\uC791 \uC2DC\uAC01, \uAC19\uC73C\uBA74 \uC6D0\uB798 \uC21C\uC11C)
function periodBlocks(dayData, period) {
  var out = [];
  (dayData && dayData.blocks || []).forEach(function(b, i) {
    var p = parseItineraryBlock(b);
    if (p.type === 'main' && p.period === period) out.push({ index: i, parsed: p });
  });
  out.sort(function(a, b) {
    var sa = timeToMin(a.parsed.startTime), sb = timeToMin(b.parsed.startTime);
    sa = Number.isFinite(sa) ? sa : 9999; sb = Number.isFinite(sb) ? sb : 9999;
    return sa - sb || a.index - b.index;
  });
  return out;
}

// \uC774\uB0A0 \uBE44\uC5B4 \uC788\uB294 \uCCAB \uC2DD\uC0AC \uCE78(\uC544\uCE68\u2192\uC810\uC2EC\u2192\uC800\uB141). \uBAA8\uB450 \uCC28 \uC788\uC73C\uBA74 ''
function firstEmptyMealSlot(dayData) {
  for (var i = 0; i < MEAL_SLOT_KEYS.length; i++) {
    if (periodBlocks(dayData, SLOT_DEFS[MEAL_SLOT_KEYS[i]].period).length === 0) return MEAL_SLOT_KEYS[i];
  }
  return '';
}

function normalizePlaceKey(name) {
  return String(name || '').toLowerCase().normalize('NFKC').replace(/[\s()\uFF08\uFF09\u30FB\u00B7'"`.,-]/g, '');
}

function namesMatch(a, b) {
  var x = normalizePlaceKey(a);
  var y = normalizePlaceKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  var shorter = x.length <= y.length ? x : y;
  var longer = shorter === x ? y : x;
  return shorter.length >= 4 && longer.indexOf(shorter) >= 0;
}

// \u2500\u2500 \uC11C\uBC84 \uC77C\uC815 \uBD84\uB958 \uC548\uC804\uB9DD(FN-04): \uC11C\uBC84 \uD6C4\uCC98\uB9AC(SV-02)\uC640 \uAC19\uC740 \uADDC\uCE59\uC774\uB77C \uC774\uBBF8 \uC815\uB9AC\uB41C \uC77C\uC815\uC5D0\uB294 \uBCC0\uD654\uAC00 \uC5C6\uB2E4(\uBA71\uB4F1) \u2500\u2500
// a) \uC2DD\uB2F9 \uADFC\uAC70: \uCD94\uCC9C \uB9DB\uC9D1 \uC774\uB984 + FOOD_WORD_RE
// b) \uC800\uB141\u00B7\uC810\uC2EC\uC778\uB370 \uC2DD\uB2F9\uC774 \uC544\uB2C8\uBA74(\uC790\uC720 \uC77C\uC815 \uD3EC\uD568) \u2192 \uC624\uD6C4(\uC2DC\uAC01 \uC720\uC9C0)
// c) \uC624\uC804\u00B7\uC624\uD6C4\uC778\uB370 \uCD94\uCC9C \uB9DB\uC9D1 \uC774\uB984\uACFC \uAC19\uC73C\uBA74 \u2192 15\uC2DC \uC804 \uC2DC\uC791\uC740 \uC810\uC2EC, \uC544\uB2C8\uBA74 \uC800\uB141(\uADF8\uB0A0 \uADF8 \uC2DD\uC0AC \uCE78\uC774 \uBE44\uC5B4 \uC788\uC744 \uB54C\uB9CC, \uC774\uB984 \uC77C\uCE58\uB9CC)
// d) \uC5EC\uD589\uC9C0 \uBE14\uB85D\uC774 360\uBD84 \uC774\uC0C1\uC774\uAC70\uB098 10\uC2DC \uC774\uC804 \uC2DC\uC791\u00B716\uC2DC \uC774\uD6C4 \uB05D\uC774\uBA74 \u2192 \uC885\uC77C(\uC2DC\uAC01 \uC720\uC9C0)
// e) \uAC19\uC740 \uC2DD\uC0AC \uCE78\uC774 2\uAC1C\uBA74 \uADF8\uB300\uB85C \uB454\uB2E4(\uD654\uBA74\uC5D0 \uBAA8\uB450 \uADF8\uB9B0\uB2E4)
function recFoodNames() {
  var names = [];
  (latestRecFoodList || []).forEach(function(f) {
    if (!f) return;
    [f.name, f.nameKo, f.originalName, f.nameJa, f.nameEn].forEach(function(n) { if (n) names.push(String(n)); });
  });
  return names;
}

function classifyServerBlocks(data) {
  if (!data || !Array.isArray(data.itinerary)) return;
  var foodNames = recFoodNames();
  var isKnownFood = function(name) { return foodNames.some(function(f) { return namesMatch(f, name); }); };
  data.itinerary.forEach(function(day) {
    if (!day || !Array.isArray(day.blocks)) return;
    var mealTaken = {};
    day.blocks.forEach(function(b) {
      var p = parseItineraryBlock(b);
      if (p.type === 'main' && isMealPeriod(p.period)) mealTaken[p.period] = true;
    });
    // b) \uC2DD\uB2F9\uC774 \uC544\uB2CC \uC800\uB141\u00B7\uC810\uC2EC \u2192 \uC624\uD6C4
    day.blocks = day.blocks.map(function(b) {
      var p = parseItineraryBlock(b);
      if (p.type !== 'main' || (p.period !== '\uC800\uB141' && p.period !== '\uC810\uC2EC')) return b;
      var info = parsePlaceInfo(p.place);
      var isFood = !isFreeTimePlace(info.name) && (isKnownFood(info.name) || FOOD_WORD_RE.test(p.place));
      return isFood ? b : formatPlanBlock('\uC624\uD6C4', p.startTime, p.endTime, info.name, info.info);
    });
    mealTaken = {};
    day.blocks.forEach(function(b) {
      var p = parseItineraryBlock(b);
      if (p.type === 'main' && isMealPeriod(p.period)) mealTaken[p.period] = true;
    });
    day.blocks = day.blocks.map(function(b) {
      var p = parseItineraryBlock(b);
      if (p.type !== 'main' || isMealPeriod(p.period)) return b;
      var info = parsePlaceInfo(p.place);
      // c) \uCD94\uCC9C \uB9DB\uC9D1 \uC774\uB984\uACFC \uAC19\uC740 \uC624\uC804\u00B7\uC624\uD6C4 \uBE14\uB85D \u2192 \uC2DD\uC0AC \uCE78(\uBE44\uC5B4 \uC788\uC744 \uB54C\uB9CC)
      if ((p.period === '\uC624\uC804' || p.period === '\uC624\uD6C4') && !isFreeTimePlace(info.name) && isKnownFood(info.name)) {
        var start = timeToMin(p.startTime);
        var meal = Number.isFinite(start) && start < 15 * 60 ? '\uC810\uC2EC' : '\uC800\uB141';
        if (!mealTaken[meal]) {
          mealTaken[meal] = true;
          return formatPlanBlock(meal, p.startTime, p.endTime, info.name, info.info);
        }
        return b;
      }
      // d) \uD558\uB8E8\uC9DC\uB9AC \uC7A5\uC18C \u2192 \uC885\uC77C(\uC790\uC720 \uC77C\uC815\uC740 \uC81C\uC790\uB9AC)
      if ((p.period === '\uC624\uC804' || p.period === '\uC624\uD6C4') && !isFreeTimePlace(info.name)) {
        var s = timeToMin(p.startTime), e = timeToMin(p.endTime);
        if (Number.isFinite(s) && Number.isFinite(e) && (e - s >= 360 || (s <= 10 * 60 && e >= 16 * 60))) {
          return formatPlanBlock('\uC885\uC77C', p.startTime, p.endTime, info.name, info.info);
        }
      }
      return b;
    });
  });
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
  // 새 서버 데이터: 식사·관광 분류 안전망을 한 번만 돌리고 '직접 고침' 표시를 지운다.
  // 불러오기·되돌리기·초안 복구(_skipMealStrip)는 저장된 모습 그대로 둔다.
  if (!data._skipMealStrip) {
    classifyServerBlocks(data);
    data.userEdited = false;
    hideNoticeBanner('planRegenHint');
    // 새 일정이 생기면 이전 초안 안내는 거둔다(새 일정이 초안 자리에 보관된다).
    pendingDraft = null;
    hideNoticeBanner('draftRestoreBanner');
  }
  currentItineraryData = data;
  renderItineraryTimeline();
  renderPlanExtras();
  updateItinMap();
  updateTripChangeBanner();
}

function itinDayLabel(n) {
  return fillText(t('day-label'), { n: n });
}

function itinMapLink(name, info) {
  // 자유 일정 칸은 장소가 아니라서 지도 링크를 달지 않는다.
  if (isFreeTimePlace(name)) return '';
  var q = encodeURIComponent(name + (info ? ' ' + info : ''));
  return '<a href="https://www.google.com/maps/search/?api=1&query=' + q + '" target="_blank" rel="noreferrer" class="itin-map-link" title="Google Maps">' + escapeHtml(t('map-link')) + '</a>';
}

// 장소 이름 칸. data-place-name은 메모 키로 쓴다(지역·지도 글자가 섞이지 않게).
function itinPlaceHtml(info, infoClass) {
  return '<div class="itin-slot-place" data-place-name="' + escapeHtml(info.name) + '">' + escapeHtml(info.name) +
    (info.info ? '<span class="itin-place-info' + (infoClass ? ' ' + infoClass : '') + '">' + escapeHtml(info.info) + '</span>' : '') +
    itinMapLink(info.name, info.info) + '</div>';
}

function itinSubsHtml(g) {
  var h = '';
  if (g.subs && g.subs.length > 0) {
    h += '<div class="itin-sub-list">';
    for (var si = 0; si < g.subs.length; si++) h += '<div class="itin-sub-item">' + escapeHtml(g.subs[si].text) + '</div>';
    h += '</div>';
  }
  for (var ti = 0; g.tips && ti < g.tips.length; ti++) h += '<div class="itin-tip">💡 ' + escapeHtml(g.tips[ti].text) + '</div>';
  return h;
}

function itinMoveButton(dayNum, blockIndex) {
  var label = escapeHtml(t('btn-move'));
  return '<button type="button" class="itin-move-btn" data-day="' + dayNum + '" data-block-index="' + blockIndex + '" aria-label="' + label + '" title="' + label + '">↔</button>';
}

function itinRemoveButton(dayNum, blockIndex, text) {
  var label = escapeHtml(t('aria-remove-item'));
  return '<button type="button" class="itin-remove-btn" data-day="' + dayNum + '" data-block-index="' + blockIndex + '" aria-label="' + label + '" title="' + label + '">' + escapeHtml(text || '✕') + '</button>';
}

function itinTimeRange(g) {
  return '<span class="itin-slot-time">' + escapeHtml(padTime(g.startTime) + '–' + padTime(g.endTime)) + '</span>';
}

function sortGroupsByStart(list) {
  return list.slice().sort(function(a, b) {
    var sa = timeToMin(a.startTime), sb = timeToMin(b.startTime);
    sa = Number.isFinite(sa) ? sa : 9999; sb = Number.isFinite(sb) ? sb : 9999;
    return sa - sb || a._blockIndex - b._blockIndex;
  });
}

// 여행지 칸 안의 항목 하나(블록 자체 시각 표시)
function itinDestItemHtml(dayNum, g, pos, count) {
  var info = parsePlaceInfo(g.place);
  var h = '<div class="itin-slot-inline" draggable="true" data-itin-day="' + dayNum + '" data-itin-period="' + escapeHtml(g.period) + '" data-itin-block-index="' + g._blockIndex + '">';
  h += '<span class="drag-handle" aria-hidden="true">☰</span>';
  h += itinTimeRange(g);
  h += itinPlaceHtml(info);
  h += itinSubsHtml(g);
  if (count > 1) {
    h += '<div class="itin-reorder-btns">';
    if (pos > 0) h += '<button type="button" class="itin-reorder-btn" data-day="' + dayNum + '" data-block-index="' + g._blockIndex + '" data-direction="up" title="' + escapeHtml(t('move-up')) + '" aria-label="' + escapeHtml(t('move-up')) + '">▲</button>';
    if (pos < count - 1) h += '<button type="button" class="itin-reorder-btn" data-day="' + dayNum + '" data-block-index="' + g._blockIndex + '" data-direction="down" title="' + escapeHtml(t('move-down')) + '" aria-label="' + escapeHtml(t('move-down')) + '">▼</button>';
    h += '</div>';
  }
  h += itinMoveButton(dayNum, g._blockIndex);
  h += itinRemoveButton(dayNum, g._blockIndex);
  h += '</div>';
  return h;
}

// 식사 칸 하나. 첫 블록이 정식 칸(놓기 대상), 같은 시간대의 두 번째부터는 '추가 식사' 표시를 단다.
function itinMealSlotHtml(dayNum, slotKey, g, extra) {
  var color = periodColor(g.period);
  var info = parsePlaceInfo(g.place);
  var dropAttrs = extra ? '' : ' data-drop-day="' + dayNum + '" data-drop-type="food" data-drop-meal="' + slotKey + '"';
  var h = '<div class="itin-slot' + (extra ? ' itin-slot-extra' : '') + '" draggable="true" data-itin-day="' + dayNum + '" data-itin-period="' + escapeHtml(g.period) + '" data-itin-block-index="' + g._blockIndex + '"' + dropAttrs + ' style="border-left-color:' + color + '">';
  h += '<span class="drag-handle" aria-hidden="true">☰</span>';
  h += '<div class="itin-slot-header"><span class="itin-slot-period" style="color:' + color + '">' + periodIcon(g.period) + ' ' + escapeHtml(tPeriod(g.period)) + '</span>';
  if (extra) h += '<span class="itin-slot-extra-badge">' + escapeHtml(t('meal-extra')) + '</span>';
  h += itinTimeRange(g) + '</div>';
  h += itinPlaceHtml(info, 'itin-place-loc');
  h += itinSubsHtml(g);
  h += itinMoveButton(dayNum, g._blockIndex);
  h += itinRemoveButton(dayNum, g._blockIndex, t('btn-delete'));
  h += '</div>';
  return h;
}

// '도시 이동: 오사카 → 교토' 같은 안내 줄. 지울 수 있다.
function itinPlainHtml(dayNum, g, top) {
  return '<div class="itin-slot itin-slot-plain' + (top ? ' itin-plain-top' : '') + '">' +
    '<div class="itin-slot-place itin-slot-plain-text">' + escapeHtml(g.text) + '</div>' +
    itinRemoveButton(dayNum, g._blockIndex) + '</div>';
}

// ── 일정 요약 한 줄(UX-07): '{city} {d}일 · 장소 {p}곳 · 맛집 {f}곳'. 자유 일정·안내 줄은 세지 않는다 ──
function planCityLabel(data) {
  var route = data && Array.isArray(data.routeCities) ? data.routeCities.filter(Boolean) : [];
  if (route.length > 1) return route.map(localPlaceName).join('·');
  var key = (data && data.cityKey) || (el('city') ? el('city').value : '');
  return (key && cityNameByKey(key)) || t('japan');
}

function planSummaryCounts(data) {
  var places = 0;
  var foods = 0;
  var days = data && Array.isArray(data.itinerary) ? data.itinerary : [];
  days.forEach(function(d) {
    (d && Array.isArray(d.blocks) ? d.blocks : []).forEach(function(b) {
      var p = parseItineraryBlock(b);
      if (p.type !== 'main' || isFreeTimePlace(parsePlaceInfo(p.place).name)) return;
      if (isMealPeriod(p.period)) foods++; else places++;
    });
  });
  return { d: days.length, p: places, f: foods };
}

function planSummaryText(data) {
  if (!data || !itineraryHasContent(data.itinerary)) return '';
  var c = planSummaryCounts(data);
  return fillText(t('plan-summary'), { city: planCityLabel(data), d: c.d, p: c.p, f: c.f });
}

// 일정을 만든 언어와 지금 화면 언어가 다르면 작은 안내를 보인다(장소 설명·팁은 만든 언어로 남아 있다).
var LANG_NAME_KEYS = { ko: 'lang-name-ko', en: 'lang-name-en', ja: 'lang-name-ja' };

function planLangNoteText(data) {
  var lang = data ? data.lang : '';
  if (!lang || !LANG_NAME_KEYS[lang] || lang === currentLang || !itineraryHasContent(data.itinerary)) return '';
  return fillText(t('plan-lang-note'), { lang: t(LANG_NAME_KEYS[lang]) });
}

// 숙소 이름: 일본어(가나·한자)가 들어 있으면 lang="ja"를 달고, 전각 영문·숫자는 반각으로 바꿔 보여 준다.
var JA_SCRIPT_RE = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;

function displayStayName(name) {
  var s = String(name == null ? '' : name);
  try { return s.normalize('NFKC'); } catch (e) { return s; }
}

function stayNameAttrs(name) {
  return JA_SCRIPT_RE.test(String(name || '')) ? ' lang="ja"' : '';
}

// ── 하루 보드 배치(시간 순서) ──
// 오후 블록 중 저녁 식사 시작(없으면 18:00) 이후에 시작하는 관광은 '🌙 저녁 이후' 칸에 따로 모아 저녁 식사 아래에 그린다.
function itinDayLayout(groups) {
  var mains = groups.filter(function(g) { return g.type === 'main'; });
  var byPeriod = function(period) { return sortGroupsByStart(mains.filter(function(g) { return g.period === period; })); };
  var zones = {};
  var meals = {};
  DEST_SLOT_KEYS.forEach(function(key) { zones[key] = byPeriod(SLOT_DEFS[key].period); });
  MEAL_SLOT_KEYS.forEach(function(key) { meals[key] = byPeriod(SLOT_DEFS[key].period); });
  var dinnerStart = meals.dinner.length ? timeToMin(meals.dinner[0].startTime) : NaN;
  var nightCut = Number.isFinite(dinnerStart) ? dinnerStart : timeToMin(SLOT_DEFS.dinner.start);
  var isNight = function(g) { return timeToMin(g.startTime) >= nightCut; };
  var night = zones.afternoon.filter(isNight);
  zones.afternoon = zones.afternoon.filter(function(g) { return !isNight(g); });
  var hasHalfDay = zones.morning.length + zones.afternoon.length + night.length > 0;
  var hasAllDay = zones.allday.length > 0;
  // 차 있는 종일 칸은 하루 첫머리(아침 뒤)에, 빈 종일 칸은 지금처럼 오후 칸 뒤에 둔다.
  var order = ['breakfast'];
  if (hasAllDay) order.push('allday');
  order.push('morning', 'lunch', 'afternoon');
  if (!hasAllDay) order.push('allday');
  order.push('dinner');
  if (night.length) order.push('night');
  var segOf = {};
  DEST_SLOT_KEYS.forEach(function(key) { zones[key].forEach(function(g) { segOf[g._blockIndex] = key; }); });
  MEAL_SLOT_KEYS.forEach(function(key) { meals[key].forEach(function(g) { segOf[g._blockIndex] = key; }); });
  night.forEach(function(g) { segOf[g._blockIndex] = 'night'; });
  return { zones: zones, meals: meals, night: night, hasHalfDay: hasHalfDay, hasAllDay: hasAllDay, order: order, segOf: segOf };
}

// 첫 시간대 블록 뒤의 안내 줄 → 바로 앞 시간대 블록이 그려지는 칸 이름별 목록
function itinPlainBySegment(groups, segOf) {
  var out = {};
  var last = null;
  groups.forEach(function(g) {
    if (g.type === 'main') { last = segOf[g._blockIndex] || last; return; }
    if (g.type !== 'plain' || !g.text || last === null) return;
    (out[last] = out[last] || []).push(g);
  });
  return out;
}

// 칸 머리에 보일 시각: 항목이 있으면 '첫 시작–마지막 끝', 없으면 기본 시각
function itinZoneTimeText(items, def) {
  var s = Infinity, e = -Infinity;
  (items || []).forEach(function(g) {
    var a = timeToMin(g.startTime), b = timeToMin(g.endTime);
    if (Number.isFinite(a) && a < s) s = a;
    if (Number.isFinite(b) && b > e) e = b;
  });
  if (Number.isFinite(s) && Number.isFinite(e) && e > s) return minToTime(s) + '–' + minToTime(e);
  return def ? def.start + '–' + def.end : '';
}

function itinDestZoneHtml(dayNum, key, items, lay) {
  var def = SLOT_DEFS[key];
  // 종일 칸이 비고 반나절 칸에 항목이 있으면 종일 칸을, 종일만 차 있으면 반나절 칸을 접는다(접힌 칸도 놓기 대상).
  var collapsed = key === 'allday' ? (!lay.hasAllDay && lay.hasHalfDay) : (lay.hasAllDay && !lay.hasHalfDay);
  var color = periodColor(def.period);
  var h = '<div class="itin-period-zone itin-drop-zone' + (items.length ? ' is-filled' : '') + (collapsed ? ' is-collapsed' : '') + '" data-drop-day="' + dayNum + '" data-drop-type="dest" data-drop-dest-period="' + key + '" style="border-left-color:' + color + '">';
  h += '<div class="itin-period-header"><span class="itin-period-name" style="color:' + color + '">' + periodIcon(def.period) + ' ' + escapeHtml(tPeriod(def.period)) + '</span>' +
    // 접힌 칸(그날 쓰지 않는 쪽)은 시각을 빼서 하루의 시간 흐름을 끊지 않는다.
    (collapsed ? '' : '<span class="itin-period-time">' + escapeHtml(itinZoneTimeText(items, def)) + '</span>') +
    '<span class="drop-hint">' + escapeHtml(t('drop-here')) + '</span>' +
    '<button type="button" class="itin-zone-add-btn" data-day="' + dayNum + '" data-slot="' + key + '">' + escapeHtml(t('btn-add-place')) + '</button></div>';
  for (var ii = 0; ii < items.length; ii++) h += itinDestItemHtml(dayNum, items[ii], ii, items.length);
  return h + '</div>';
}

// '🌙 저녁 이후' 칸(오후 블록 중 저녁 식사 뒤에 시작하는 것). 여기에 놓으면 저녁 식사·밤 일정 뒤 시간에 들어간다.
function itinNightZoneHtml(dayNum, items) {
  var color = periodColor(SLOT_DEFS.afternoon.period);
  var h = '<div class="itin-period-zone itin-drop-zone itin-night-zone is-filled" data-drop-day="' + dayNum + '" data-drop-type="dest" data-drop-dest-period="night" style="border-left-color:' + color + '">';
  h += '<div class="itin-period-header"><span class="itin-period-name" style="color:' + color + '">🌙 ' + escapeHtml(t('itin-night')) + '</span>' +
    '<span class="itin-period-time">' + escapeHtml(itinZoneTimeText(items, null)) + '</span>' +
    '<span class="drop-hint">' + escapeHtml(t('drop-here')) + '</span></div>';
  for (var ii = 0; ii < items.length; ii++) h += itinDestItemHtml(dayNum, items[ii], ii, items.length);
  return h + '</div>';
}

// 식사 칸 하나(아침·점심·저녁): 같은 시간대 블록을 모두 그린다(숨는 블록 없음). 비어 있으면 [맛집 추가] 칸.
function itinMealSegmentHtml(dayNum, mealKey, meals) {
  var mealDef = SLOT_DEFS[mealKey];
  if (meals && meals.length > 0) {
    var h = '';
    for (var mi = 0; mi < meals.length; mi++) h += itinMealSlotHtml(dayNum, mealKey, meals[mi], mi > 0);
    return h;
  }
  var mealColor = periodColor(mealDef.period);
  return '<div class="itin-meal-empty itin-drop-zone" data-drop-day="' + dayNum + '" data-drop-type="food" data-drop-meal="' + mealKey + '" style="border-left-color:' + mealColor + '">' +
    '<span class="itin-meal-label">' + periodIcon(mealDef.period) + ' ' + escapeHtml(tPeriod(mealDef.period)) + '</span>' +
    '<button type="button" class="itin-meal-add-btn" data-day="' + dayNum + '" data-meal-slot="' + mealKey + '">' + escapeHtml(t('btn-add-food')) + '</button>' +
    '</div>';
}

function renderItineraryTimeline() {
  var container = el('planResult');
  if (!container || !currentItineraryData) return;
  var data = currentItineraryData;
  var h = '';
  if (!itineraryHasContent(data.itinerary)) {
    h += '<div class="itin-summary itin-empty-note" data-i18n="empty-itinerary">' + escapeHtml(t('empty-itinerary')) + '</div>';
  } else {
    // 요약 한 줄은 서버 문장 대신 지금 일정에서 직접 센다(직접 고친 뒤에도 숫자가 맞게).
    var summaryText = planSummaryText(data);
    if (summaryText) h += '<div class="itin-summary">' + escapeHtml(summaryText) + '</div>';
  }
  var langNote = planLangNoteText(data);
  if (langNote) h += '<div class="source-note plan-lang-note" role="status">' + escapeHtml(langNote) + '</div>';
  var dayList = data.itinerary || [];
  for (var di = 0; di < dayList.length; di++) {
    var day = dayList[di];
    var dayNum = Number(day.day);
    var groups = groupItineraryBlocks(day.blocks || []);
    var firstMain = -1;
    for (var fm = 0; fm < groups.length; fm++) { if (groups[fm].type === 'main') { firstMain = fm; break; } }
    // 첫 시간대 블록보다 앞의 안내 줄은 맨 위에, 나머지는 바로 앞 항목이 있는 칸 아래에 그린다(itinPlainBySegment).
    var topPlain = [];
    groups.forEach(function(g, gi) {
      if (g.type !== 'plain' || !g.text) return;
      if (firstMain < 0 || gi < firstMain) topPlain.push(g);
    });

    h += '<div class="itin-day" data-day="' + dayNum + '">';
    h += '<div class="itin-day-header"><span class="itin-day-label">' + escapeHtml(itinDayLabel(dayNum)) + '</span><span class="itin-day-date">' + escapeHtml(day.date || '') + '</span></div>';
    h += '<div class="itin-day-body">';

    // --- 항공·숙소 고정 정보 ---
    var isFirstDay = (di === 0);
    var isLastDay = (di === dayList.length - 1);
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
      h += '<strong>' + escapeHtml(stayLabel) + '</strong> <span' + stayNameAttrs(selectedStay.name) + '>' + escapeHtml(displayStayName(selectedStay.name)) + '</span>';
      if (selectedStay.area) h += ' <span class="itin-place-info">' + escapeHtml(selectedStay.area) + '</span>';
      h += '</div>';
    }

    // 첫 시간대 블록보다 앞에 있는 안내 줄(도시 이동 등)은 맨 위에
    for (var tp = 0; tp < topPlain.length; tp++) h += itinPlainHtml(dayNum, topPlain[tp], true);

    // --- 하루를 시간 순서로: 아침 → (종일) → 오전 → 점심 → 오후 → (빈 종일) → 저녁 → 🌙 저녁 이후 ---
    // 칸 머리의 시각은 칸이 차 있으면 실제 항목 시각(첫 시작–마지막 끝), 비어 있으면 놓았을 때 들어갈 기본 시각이다.
    var lay = itinDayLayout(groups);
    var plainAfter = itinPlainBySegment(groups, lay.segOf);
    for (var oi = 0; oi < lay.order.length; oi++) {
      var seg = lay.order[oi];
      if (seg === 'night') h += itinNightZoneHtml(dayNum, lay.night);
      else if (SLOT_DEFS[seg].kind === 'food') h += itinMealSegmentHtml(dayNum, seg, lay.meals[seg]);
      else h += itinDestZoneHtml(dayNum, seg, lay.zones[seg], lay);
      // 그 칸의 항목 뒤에 있던 안내 줄(도시 이동 등)은 그 칸 바로 아래에
      var plains = plainAfter[seg] || [];
      for (var pi = 0; pi < plains.length; pi++) h += itinPlainHtml(dayNum, plains[pi], false);
    }

    h += '<div class="itin-route-cost-section">';
    h += '<button type="button" class="itin-route-cost-btn" data-route-day="' + dayNum + '">' + escapeHtml(t('route-calc')) + '</button>';
    h += '<div class="itin-route-cost-result" id="routeCostDay' + dayNum + '"></div>';
    h += '</div>';
    h += '</div></div>';
  }
  if (data.tips && data.tips.length > 0) {
    h += '<div class="itin-tips-section"><div class="itin-tips-title">' + escapeHtml(t('tips-title')) + '</div>';
    for (var tt = 0; tt < data.tips.length; tt++) h += '<div class="itin-tip-item">' + escapeHtml(data.tips[tt]) + '</div>';
    h += '</div>';
  }
  container.innerHTML = h;
  // 새 일정을 만드는 중에 보드를 고쳐 다시 그렸다면 '만드는 중' 안내를 다시 얹는다.
  if (planLoadingTimer && itineraryHasContent(data.itinerary) && typeof container.insertAdjacentHTML === 'function') {
    container.insertAdjacentHTML('afterbegin', planBusyNoteHtml());
  }
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
        <strong${stayNameAttrs(stay.name)}>${escapeHtml(displayStayName(stay.name))}</strong>
        <span>${escapeHtml(stay.area)} · ${escapeHtml(provider)}</span>
        <span>${escapeHtml(dates)}</span>
        <span>${perNight ? escapeHtml(perNight) + ' · ' : ''}${escapeHtml(t('total-prefix'))}${escapeHtml(total)}</span>
        ${amenities ? `<span>${escapeHtml(t('amenities'))}${escapeHtml(amenities)}</span>` : ''}
      </div>
    </article>`;
}


// 서버가 1일 비용(budgetBreakdown)을 주지 않았을 때의 기본값(1인·표준). 화면과 내보내기가 같은 값을 쓴다.
var DEFAULT_DAILY_COSTS_KRW = { meal: 55000, transport: 22000, activity: 25000 };

function perDayCost(bb, part) {
  var v = bb && bb[part] ? Number(bb[part].perDay) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_DAILY_COSTS_KRW[part];
}

// 예상 비용 계산은 이 함수 하나로 한다(예상 비용 칸·내보내기 공용). 일정이 있으면 일정의 날 수, 없으면 조건 칸 일수.
function computeBudget() {
  var planDays = currentItineraryData && Array.isArray(currentItineraryData.itinerary) ? currentItineraryData.itinerary.length : 0;
  var days = planDays || Number(el('days') ? el('days').value : 0) || 4;
  var bb = (currentItineraryData && currentItineraryData.budgetBreakdown) || null;
  var flightCost = selectedFlight ? (Number(selectedFlight.totalPriceKRW) || 0) : 0;
  var stayCost = selectedStay ? (Number(selectedStay.totalPriceKRW || selectedStay.totalKRW) || 0) : 0;
  var meal = perDayCost(bb, 'meal') * days;
  var transport = perDayCost(bb, 'transport') * days;
  var activity = perDayCost(bb, 'activity') * days;
  return {
    days: days,
    tier: bb && bb.budgetTier ? bb.budgetTier : 'mid',
    flight: flightCost,
    stay: stayCost,
    stayNights: selectedStay ? (selectedStay.nights || tripNights(days)) : 0,
    meal: meal,
    transport: transport,
    activity: activity,
    total: flightCost + stayCost + meal + transport + activity
  };
}

function budgetTierLabel(tier) {
  var labels = { low: t('budget-low'), mid: t('budget-mid'), high: t('budget-high') };
  return labels[tier] || t('budget-mid');
}

// ExchangeRate-API 무료 값으로 환율을 보여 줄 때는 출처를 함께 표기한다(약관). 헤더 칩의 링크는 좁은 화면에서 감춰지므로 여기에도 둔다.
function fxCreditHtml() {
  if (!(fxRateState === 'ok' && fxRateData && fxRateData.provider === 'open.er-api')) return '';
  return '<div class="data-credit"><a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">' + escapeHtml(t('fx-credit')) + '</a></div>';
}

function renderBudgetSummary() {
  var wrap = el('budgetSummary');
  if (!wrap) return;
  var b = computeBudget();
  var fmt = function(n) { return escapeHtml(formatKRW(n)); };
  var stayNights = b.stayNights ? b.stayNights + t('nights-unit') : '-';
  var notSelected = escapeHtml(t('not-selected'));
  wrap.innerHTML =
    '<h4>' + escapeHtml(t('budget-title')) + '</h4>' +
    '<div class="budget-rows">' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-flight')) + '</span><span>' + (b.flight ? fmt(b.flight) : notSelected) + '</span></div>' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-stay-label') + ' (' + stayNights + ')') + '</span><span>' + (b.stay ? fmt(b.stay) : notSelected) + '</span></div>' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-food')) + '</span><span>~' + fmt(b.meal) + '</span></div>' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-transport')) + '</span><span>~' + fmt(b.transport) + '</span></div>' +
      '<div class="budget-row"><span>' + escapeHtml(t('cost-activity')) + '</span><span>~' + fmt(b.activity) + '</span></div>' +
      '<div class="budget-row budget-total"><span>' + escapeHtml(t('cost-summary')) + '</span><span>~' + fmt(b.total) + '</span></div>' +
    '</div>' +
    '<div class="budget-note">' + escapeHtml(budgetTierLabel(b.tier) + ' ' + t('budget-note') + b.days + t('budget-note2')) + '</div>' +
    fxCreditHtml();
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

  // 고른 항공권·숙소가 있을 때만 카드를 보인다(빈 안내 카드는 그리지 않는다).
  container.innerHTML = cards.join('');
  container.classList.toggle('hidden', cards.length === 0);

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
    budget: currentBudgetTier(),
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
  // 말로 한 요청의 의도(서버 SV-03과 같은 필드 이름). 값이 있을 때만 보낸다.
  if (aiRequestText && !payload.request) payload.request = aiRequestText.slice(0, 500);
  if (aiWantedNames.length > 0 && !payload.mustVisit) payload.mustVisit = aiWantedNames.slice(0, 8);
  if (aiExcludedPlaces.length > 0 && !payload.excludedPlaces) payload.excludedPlaces = aiExcludedPlaces.slice(0, 8);
  if (aiFoodWishes.length > 0 && !payload.foodWishes) payload.foodWishes = aiFoodWishes.slice(0, 3);
  if (aiMustVisit.length > 0 && !payload._picks) payload._picks = aiMustVisit.slice(0, 8);
  return payload;
}

// ── 데이터 출처 안내 ──
// 서버는 { kind, provider, reasonCode } 형태의 정보 객체를 보낸다.
// 화면에는 내부 ID·원문 오류 대신 짧은 안내 문구만 보여준다.
var INFO_KINDS = ['live', 'ai', 'curated', 'fallback', 'mock', 'rule'];
var INFO_FIELD_BY_SECTION = { dest: 'recommendationInfo', itinerary: 'itineraryInfo', foods: 'foodsInfo', chat: 'sourceInfo' };
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
      curated: '엄선한 기본 목록을 보여 드려요.', fallback: '기본 목록을 보여 드려요.', mock: '예시 데이터를 보여 드려요.',
      rule: '기본 일정으로 만들었어요.', 'chat.rule': '기본 규칙으로 조건을 해석했어요.',
      'stays.fallback': '최저가 기준으로 보여 드려요.'
    },
    reason: {
      'stays.NO_LIVE_DATA': '해당 날짜 빈방 정보가 없어',
      GOOGLE_KEY_MISSING: '지도 서비스가 설정되지 않아', GOOGLE_BILLING_DISABLED: '지도 서비스 결제 설정이 꺼져 있어',
      GOOGLE_PERMISSION_DENIED: '지도 서비스 접근이 거부되어', GOOGLE_QUOTA_EXCEEDED: '오늘 지도 서비스 사용 한도에 도달해',
      GOOGLE_ERROR: '지도 서비스 응답에 문제가 있어', GOOGLE_CIRCUIT_OPEN: '지도 서비스 연결을 잠시 쉬는 중이라',
      NO_RESULTS: '검색 결과가 없어', AI_KEY_MISSING: 'AI가 설정되지 않아', AI_TRUNCATED: 'AI 응답이 중간에 끊겨',
      AI_INVALID_OUTPUT: 'AI 응답 형식이 맞지 않아', AI_ERROR: 'AI 응답에 문제가 있어', AI_BUSY: 'AI 사용량이 잠시 몰려',
      AI_DAILY_LIMIT: '오늘 AI 무료 사용량을 다 써서',
      PROVIDER_UNAVAILABLE: '실시간 조회 서비스에 연결할 수 없어', NO_LIVE_DATA: '이 조건의 실시간 데이터가 없어',
      _default: '일시적인 문제로'
    },
    join: function(cause, cons) { return cause + ' ' + cons; },
    note: { 'flights.live': '다른 이용자의 최근 검색에서 모은 가격이라 실제 요금과 다를 수 있어요.' },
    nearbyNote: '요청한 날짜의 가격이 없어 가까운 날짜(±7일)의 항공편을 보여 드려요. 카드의 날짜를 꼭 확인해 주세요.',
    mockNote: '실제 가격이 아니니 예약 전에 꼭 확인해 주세요.'
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
      AI_INVALID_OUTPUT: 'AI response was malformed', AI_ERROR: 'AI service error', AI_BUSY: 'AI is busy right now',
      AI_DAILY_LIMIT: "today's free AI quota is used up",
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
      AI_INVALID_OUTPUT: 'AIの応答形式が正しくありません', AI_ERROR: 'AIサービスのエラー', AI_BUSY: 'AIが混雑しているため',
      AI_DAILY_LIMIT: '本日のAI無料利用枠を使い切ったため',
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
    // AI가 잠시 바빠서 기본 일정이 된 경우: 잠시 뒤 다시 만들어 보라고 알려 준다.
    if (note && info.reasonCode === 'AI_BUSY' && section === 'itinerary') note += ' ' + t('ai-busy-retry');
    // 하루 무료 한도를 다 쓴 경우: 1분 뒤가 아니라 한도가 다시 생기는 시각을 알려 준다.
    if (note && info.reasonCode === 'AI_DAILY_LIMIT' && section === 'itinerary') note += ' ' + t('ai-daily-retry');
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
  // 한 줄 모드(채팅 해석): 문제가 있으면 안내 문장만, 없으면 '채팅 해석: AI가 해석했어요'만 보인다(같은 말 두 줄 반복 방지).
  if (opts.oneLine) {
    node.textContent = d.warn && d.note ? d.note : line;
    node.classList.toggle('warn', Boolean(d.warn && d.note));
    return;
  }
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
    name: food.name, nameKo: food.nameKo || undefined, originalName: food.originalName || undefined,
    city: food.city, genre: food.genre, area: food.area, score: food.score,
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
  // 직접 고친 일정을 새 일정으로 바꾸면 ↩ 되돌리기로 돌아갈 수 있다고 알려 준다(되돌리기 기록은 지우지 않는다).
  var replacingEdits = Boolean(currentItineraryData && currentItineraryData.userEdited);
  // 기다리는 동안(Gemini는 10~50초) 보드를 고칠 수 있다. 응답이 오면 그 사이 고친 게 있는지 이 값과 비교한다.
  // (말로 한 요청은 채팅 해석부터 기다리므로 runChatPlan이 그 시작 시점 값을 넘긴다.)
  var editSeqAtStart = Number.isFinite(opts.editSeqAtStart) ? opts.editSeqAtStart : itinEditSeq;
  beginPlanBusy(opts.trigger || 'btnPlan');
  showPlanLoading();
  showCardLoading('destCards');
  try {
    const payload = buildPlanPayload(extra);
    const data = await postJson('/api/travel-plan', payload);
    // 그 사이 새 요청이 시작됐다면 오래된 응답은 버린다.
    if (seq !== planRequestSeq) return;
    if (syncAux) recordSearchHistory('plan', { city: payload.city, days: payload.days, theme: payload.theme });

    renderCards('destCards', data.recommendations || [], 'dest');
    renderSourceNote('destSourceNote', 'dest', sectionInfo('dest', data));

    // 추천 맛집 탭은 결과가 없어도 항상 다시 그린다(이전 도시 결과가 남지 않도록).
    latestRecFoodList = (data.recommendedFoods || []).map(toRecFood);
    renderRecFoodCards(latestRecFoodList);
    renderSourceNote('recFoodSourceNote', 'foods', latestRecFoodList.length ? sectionInfo('foods', data) : null);
    recFoodsNeedFill = latestRecFoodList.length === 0;

    // 만드는 동안 직접 고쳤다면 새 일정으로 바꿀지 다시 묻는다. 취소하면 고친 일정을 그대로 두고 추천 목록만 바뀐다.
    var editedDuringBuild = itinEditSeq !== editSeqAtStart && itineraryIsEdited();
    if (editedDuringBuild && !confirm(t('confirm-overwrite-during-build'))) {
      hidePlanLoading();
      renderItineraryTimeline();
      // 말로 한 요청으로 날짜·일수가 바뀌었다면 [날짜만 옮기기·일수 맞추기·새로 만들기] 안내 띠를 띄운다.
      updateTripChangeBanner();
      showMemoToast(t('regen-kept-edits'), 4000);
      // 항공·숙소가 바뀌어 다시 만들던 중이었다면 [일정만 다시 만들기] 안내를 남긴다.
      if (opts.tripChange) showNoticeBanner('planRegenHint', 'regen-hint');
      if (syncAux) syncAuxSearches(data);
      return;
    }
    if (editedDuringBuild) replacingEdits = true;

    // 서버가 넣지 못한 '꼭 갈 곳'(SV-02). normalizeInfo가 정보 객체의 다른 필드를 버리므로 여기서 따로 꺼낸다.
    var rawInfo = data.itineraryInfo && typeof data.itineraryInfo === 'object' ? data.itineraryInfo : {};
    var missingMust = cleanNameList(rawInfo.missingMustVisit, 8);
    renderItinerary({
      summary: data.summary,
      itinerary: Array.isArray(data.itinerary) ? data.itinerary : [],
      tips: data.tips,
      itinerarySource: data.itinerarySource,
      itineraryInfo: data.itineraryInfo || null,
      aiErrors: data.aiErrors || [],
      placeCoords: buildPlaceCoords(data),
      budgetBreakdown: data.budgetBreakdown || null,
      // 요약 한 줄·생성 언어 안내에 쓴다(일정과 함께 저장된다).
      lang: payload.lang || currentLang,
      cityKey: payload.city || '',
      routeCities: Array.isArray(payload._routeCities) ? payload._routeCities.slice(0, 10) : [],
      missingMustVisit: missingMust
    });
    hidePlanLoading();
    announcePlanReady(opts, replacingEdits);
    if (missingMust.length > 0) appendAiChat('assistant', fillText(t('must-missing'), { names: missingMust.join(', ') }));

    if (syncAux) syncAuxSearches(data);
  } catch (err) {
    if (seq !== planRequestSeq) return;
    var errText = friendlyError(err);
    el('destCards').innerHTML = '<div class="card">' + escapeHtml(errText) + '</div>';
    // 일정 칸의 로딩 안내도 거둔다(일정이 없던 자리에는 오류 안내, 있던 일정은 그대로).
    hidePlanLoading(errText);
    if (currentItineraryData) showMemoToast(errText, 4000);
    console.error('[runPlan]', err);
  } finally {
    endPlanBusy();
  }
}

// 통합 생성 시 항공·숙소·맛집·여행지 탭을 같은 조건으로 한 번씩만 갱신한다.
function syncAuxSearches(data) {
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

// 선택지가 없는 체크 묶음(제목만 있는 빈 칸)은 숨긴다. 두 묶음이 다 비면 .checks 전체를 숨긴다.
function toggleCheckGroup(listId, count) {
  var list = el(listId);
  var group = list ? list.parentNode : null;
  if (group && group.classList) group.classList.toggle('hidden', !count);
  var wrap = group && group.parentNode;
  if (wrap && wrap.classList && wrap.classList.contains('checks')) {
    var any = Array.prototype.some.call(wrap.querySelectorAll('.check-list'), function(l) { return l.children && l.children.length > 0; });
    wrap.classList.toggle('hidden', !any);
  }
}

function renderFlightFilterChecks(options) {
  var airports = options?.airports || [];
  var airlines = options?.airlines || [];
  el('airportChecks').innerHTML = airports.map((code) => `<label class="check-item"><input type="checkbox" class="airport-check" value="${escapeHtml(code)}" />${escapeHtml(code)}</label>`).join('');
  el('airlineChecks').innerHTML = airlines.map((name) => `<label class="check-item"><input type="checkbox" class="airline-check" value="${escapeHtml(name)}" />${escapeHtml(name)}</label>`).join('');
  toggleCheckGroup('airportChecks', airports.length);
  toggleCheckGroup('airlineChecks', airlines.length);
}

function renderStayFilterChecks(options) {
  var providers = options?.providers || [];
  var amenities = options?.amenities || [];
  el('stayProviderChecks').innerHTML = providers.map((name) => `<label class="check-item"><input type="checkbox" class="stay-provider-check" value="${escapeHtml(name)}" />${escapeHtml(name)}</label>`).join('');
  // 체크박스 값은 서버가 준 원래 표기를 그대로 보내고, 글자만 화면 언어로 보여준다.
  el('stayAmenityChecks').innerHTML = amenities.map((name) => `<label class="check-item"><input type="checkbox" class="stay-amenity-check" value="${escapeHtml(name)}" />${escapeHtml(localAmenity(name))}</label>`).join('');
  toggleCheckGroup('stayProviderChecks', providers.length);
  toggleCheckGroup('stayAmenityChecks', amenities.length);
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

// 직접 입력한 숙소(manualStays)는 검색 결과 앞에 늘 보인다.
function allStays() {
  return manualStays.concat(stayResults);
}

// 선택은 id로 기억한다. 다시 검색한 결과에 같은 id가 없어도 이미 고른 객체는 그대로 둔다(선택이 몰래 풀리지 않게).
// 선택이 풀리는 경우에는 반환값 true → 호출한 쪽이 화면(선택 카드·일정 고정 블록)을 다시 그린다.
function refreshStaySelection() {
  var before = selectedStay;
  if (!selectedStayId) {
    selectedStay = null;
  } else {
    const match = allStays().find((x) => x.id === selectedStayId);
    if (match) selectedStay = match;
    else if (!selectedStay) selectedStayId = '';
  }
  return Boolean(before) && !selectedStay;
}

function selectStayById(id) {
  if (!id) {
    selectedStayId = '';
    selectedStay = null;
  } else {
    const target = allStays().find((x) => x.id === id);
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
  var before = selectedFlight;
  if (!selectedFlightId) {
    selectedFlight = null;
  } else {
    const match = allFlights().find((x) => x._id === selectedFlightId);
    if (match) selectedFlight = match;
    else if (!selectedFlight) selectedFlightId = '';
  }
  return Boolean(before) && !selectedFlight;
}

function resetFlightSelectionDisplay() {
  selectedFlightId = '';
  selectedFlight = null;
  renderFlightCards(false);
}

// ── 직접 고친 일정 보호(FN-07) ──
function itineraryIsEdited() {
  return Boolean(currentItineraryData && currentItineraryData.userEdited);
}

// 직접 고칠 때마다 1씩 늘린다. 일정 생성(10~50초)을 기다리는 동안 고쳤는지 응답이 왔을 때 비교한다.
var itinEditSeq = 0;

function markItineraryEdited() {
  if (currentItineraryData) currentItineraryData.userEdited = true;
  itinEditSeq++;
}

// 직접 고친 일정을 새 일정으로 덮어쓰기 전에 묻는다. 계속해도 되면 true.
function confirmOverwriteIfEdited() {
  if (!itineraryIsEdited()) return true;
  return confirm(t('confirm-overwrite-edits'));
}

// 항공·숙소가 바뀌었을 때: 직접 고친 일정이면 다시 만들지 않고 고정 블록(✈·🏨)만 다시 그린 뒤 안내를 띄운다.
// 고친 적이 없으면 지금처럼 일정을 다시 만든다(항공 시각 반영). 다시 만들었으면 true.
function regenerateAfterTripChange(extra) {
  renderPlanExtras();
  renderItineraryTimeline();
  if (itineraryIsEdited()) {
    showNoticeBanner('planRegenHint', 'regen-hint');
    updateTripChangeBanner();
    return false;
  }
  runPlan(extra || {}, false, { trigger: 'btnPlanRefresh', tripChange: true }).catch(function(err) {
    if (el('planResult')) el('planResult').textContent = friendlyError(err);
  });
  return true;
}

async function clearFlightSelection() {
  resetFlightSelectionDisplay();
  regenerateAfterTripChange({});
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
  // 직접 고친 일정은 다시 만들지 않으므로(편집 보호) 날짜만 바뀐다고 정확히 묻는다. 일정은 안내 띠의 [일수 맞추기]로 맞춘다.
  var askKey = itineraryIsEdited() ? 'confirm-flight-dates-edited' : 'confirm-flight-dates';
  if (!confirm(fillText(t(askKey), { dates: range, days: nextDays }))) return false;
  el('startDate').value = fd.start;
  el('days').value = nextDays;
  syncDatesToDependentForms();
  // 이전 날짜로 고른 숙소(검색 결과)는 요금·날짜가 맞지 않으므로 선택을 풀고, 이미 조회한 숙소 목록은 새 날짜로 다시 조회한다.
  // 직접 입력한 숙소는 그대로 둔다(manualStays는 다시 조회해도 사라지지 않는다).
  if (selectedStay && !selectedStay.manual && selectedStay.checkIn !== fd.start) {
    selectedStayId = '';
    selectedStay = null;
  }
  if (stayResults.length > 0) searchStays();
  if (lastWeather) renderWeatherWidget(lastWeather.daily, cityNameByKey(lastWeather.cityKey));
  return true;
}

async function selectFlightById(id) {
  if (selectedFlightId === id) {
    await clearFlightSelection();
    return;
  }
  const target = allFlights().find((x) => x._id === id);
  if (!target) return;
  if (!alignTripDatesToFlight(target)) return;
  selectedFlightId = id;
  selectedFlight = target;
  renderFlightCards(false);
  regenerateAfterTripChange({ flight: buildFlightPayload(target) });
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
        <div class="stay-name"${stayNameAttrs(x.name)}>${escapeHtml(displayStayName(x.name))}</div>
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

// 숙소 결과도 항공처럼 나눠 보인다(처음 2줄, [더보기]마다 2줄씩). 숙소 26개가 한 번에 이어져 휴대폰 페이지가 2만 px을 넘던 문제.
var visibleStayCount = 0;

function getStayCardsPerRow() {
  var box = el('stayCards');
  try {
    var cols = box && typeof getComputedStyle === 'function' ? String(getComputedStyle(box).gridTemplateColumns || '') : '';
    var n = cols && cols !== 'none' ? cols.trim().split(/\s+/).length : 0;
    if (n > 0 && n < 10) return n;
  } catch (e) {}
  return getFlightCardsPerRow();
}

function stayPageSize() {
  return Math.max(3, getStayCardsPerRow() * 2);
}

// [더보기] 버튼: index.html에 없으면 숙소 목록 바로 아래에 만든다(항공 [더보기]와 같은 모양).
function ensureStayMoreButton() {
  var btn = el('btnStayMore');
  if (btn) return btn;
  var cards = el('stayCards');
  if (!cards || typeof cards.insertAdjacentHTML !== 'function') return null;
  cards.insertAdjacentHTML('afterend', '<div class="more-wrap"><button id="btnStayMore" type="button" class="more-btn hidden" data-i18n="btn-more">' + escapeHtml(t('btn-more')) + '</button></div>');
  return el('btnStayMore');
}

function setStayMoreVisible(show) {
  var btn = show ? ensureStayMoreButton() : el('btnStayMore');
  if (btn) btn.classList.toggle('hidden', !show);
}

// reset: 새 검색 결과·정렬을 바꿨을 때 처음 2줄로 되돌린다(선택·언어 변경은 지금 펼친 만큼 유지).
function renderStayCards(reset) {
  var lost = refreshStaySelection();
  const results = [...stayResults].sort((a, b) => {
    if (staySortMode === 'price') return a.totalPriceKRW - b.totalPriceKRW;
    if (staySortMode === 'rating') return b.rating - a.rating;
    return b.aiScore - a.aiScore;
  });
  if (reset || !visibleStayCount) visibleStayCount = stayPageSize();
  // 직접 입력한 숙소는 늘 앞에, 고른 숙소는 접힌 쪽에 있어도 보이게 한다.
  var shown = manualStays.concat(results.slice(0, visibleStayCount));
  if (selectedStayId && !shown.some(function(x) { return x.id === selectedStayId; })) {
    var picked = results.find(function(x) { return x.id === selectedStayId; });
    if (picked) shown.push(picked);
  }
  el('stayCards').innerHTML = shown.length > 0 ? shown.map(stayCardTemplate).join('') : '<div class="card">' + t('no-results') + '</div>';
  setStayMoreVisible(visibleStayCount < results.length);
  if (lost) { renderPlanExtras(); renderItineraryTimeline(); }
}

document.addEventListener('click', function(e) {
  if (!e.target || !e.target.closest || !e.target.closest('#btnStayMore')) return;
  visibleStayCount += stayPageSize();
  renderStayCards();
});

let currentTripType = 'oneway';

function setTripTab(type) {
  currentTripType = type;
  document.querySelectorAll('#tripTabs .tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.trip === type);
    btn.setAttribute('aria-selected', btn.dataset.trip === type ? 'true' : 'false');
  });
  const isMulti = type === 'multicity';
  const isRound = type === 'roundtrip';
  document.querySelectorAll('.basic-route').forEach((node) => {
    node.classList.toggle('hidden', isMulti);
  });
  // 편도·다구간에서는 '복귀일' 칸을 라벨째 숨긴다.
  var returnInput = el('returnDate');
  var returnItem = returnInput && returnInput.closest ? returnInput.closest('.form-item') : null;
  returnInput.style.display = '';
  if (returnItem) returnItem.classList.toggle('hidden', !isRound);
  else returnInput.style.display = isRound ? '' : 'none';
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

// 채팅 대화 기록(서버 후속 대화 병합용): 각 500자, 최근 12개
function pushChatHistory(role, content) {
  var text = String(content || '').slice(0, 500);
  if (!text) return;
  chatHistory.push({ role: role === 'assistant' ? 'assistant' : 'user', content: text });
  if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
}

// '라멘, 모츠나베' / '라멘이랑 스시' → ['라멘', '모츠나베'] (최대 3개)
function splitFoodWishes(keyword) {
  return String(keyword || '')
    .split(/\s*(?:[,，、·/]|이랑(?=\s|$)|랑(?=\s|$)|하고(?=\s|$)|\band\b)\s*/i)
    .map(function(s) { return s.trim(); })
    .filter(Boolean)
    .slice(0, 3);
}

function cleanNameList(list, max) {
  return (Array.isArray(list) ? list : [])
    .map(function(x) { return typeof x === 'string' ? x.trim() : (x && x.name ? String(x.name).trim() : ''); })
    .filter(Boolean)
    .slice(0, max || 8);
}

// 말로 한 요청 → /api/ai-travel-chat로 조건·의도를 알아낸 뒤 그 조건으로 일정을 만든다.
async function runChatPlan(message, trigger) {
  var text = String(message || '').trim();
  if (!text) {
    appendAiChat('assistant', t('chat-enter-msg'));
    return;
  }
  if (planBusyCount > 0) return;
  var triggerId = trigger || 'btnAiAssist';
  appendAiChat('user', text);
  var editSeqAtStart = itinEditSeq;
  beginPlanBusy(triggerId);
  // 채팅 해석(AI)부터 기다리므로 일정 칸의 생성 중 안내도 지금 띄운다(8초 뒤 '서버 깨우는 중' 안내 포함).
  showPlanLoading();
  try {
    const context = {
      city: el('city').value,
      theme: el('theme').value,
      budget: currentBudgetTier(),
      days: Number(el('days').value || 4),
      startDate: el('startDate').value || defaultStartDate()
    };
    const data = await postJson('/api/ai-travel-chat', {
      message: text,
      context,
      lang: currentLang,
      history: chatHistory.slice(-12),
      prevParsed: lastParsedConditions
    });
    renderSourceNote('aiSourceNote', 'chat', sectionInfo('chat', data), { oneLine: true });
    if (data.cityMeta) upsertCityOption(data.cityMeta);
    var parsed = data.parsed || {};
    applyAiConditions(parsed);

    // 의도 상태(다음 /api/travel-plan 본문에 실린다)
    aiRequestText = text.slice(0, 500);
    aiRequestHandledText = text;
    aiMustVisit = (Array.isArray(data.selectedDestinations) ? data.selectedDestinations : []).map(normalizeDestinationForPlan).filter(Boolean).slice(0, 8);
    aiWantedNames = cleanNameList(parsed.wantedPlaces, 8);
    aiExcludedPlaces = cleanNameList(parsed.excludedPlaces, 8);
    aiFoodWishes = splitFoodWishes(parsed.foodKeyword);
    var reply = data.reply || t('chat-processing');
    pushChatHistory('user', text);
    pushChatHistory('assistant', reply);
    lastParsedConditions = parsed;

    appendAiChat('assistant', reply);
    // 무엇을 알아들었는지(도시·일수·테마·꼭 갈 곳·제외·반영 못 한 곳) 칩으로 확인시켜 준다.
    appendIntentChips(parsed);
    resetFlightSelectionDisplay();
    selectStayById('');
    // runPlan이 항공·숙소·맛집 탭까지 한 번씩 갱신한다.
    await runPlan({}, true, { trigger: triggerId, fromChat: true, editSeqAtStart: editSeqAtStart });
  } catch (err) {
    appendAiChat('assistant', t('chat-error') + friendlyError(err));
    hidePlanLoading(friendlyError(err));
  } finally {
    endPlanBusy();
  }
}

// 주 버튼 하나: 요청칸에 새 글이 있으면 말로 한 요청으로, 없으면 조건 칸 값으로 일정을 만든다.
el('btnPlan').addEventListener('click', async () => {
  if (planBusyCount > 0) return; // 생성 중 중복 클릭 방지(유료 호출)
  var text = String((el('aiRequest') && el('aiRequest').value) || '').trim();
  if (!confirmOverwriteIfEdited()) return;
  if (text && text !== aiRequestHandledText) {
    await runChatPlan(text, 'btnPlan');
    return;
  }
  // 요청칸이 비었으면 앞서 말로 한 요청의 의도(꼭 갈 곳·제외·경로 등)를 모두 지운다. 같은 글이면 유지한다.
  if (!text) resetAiIntentState(false);
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
  if (planBusyCount > 0) return;
  const message = String(el('aiRequest')?.value || '').trim();
  if (!message) {
    appendAiChat('assistant', t('chat-enter-msg'));
    return;
  }
  if (!confirmOverwriteIfEdited()) return;
  await runChatPlan(message, 'btnAiAssist');
});

var flightSearchSeq = 0;

async function searchFlights(opts) {
  var seq = ++flightSearchSeq;
  var fromButton = Boolean(opts && opts.fromButton);
  try {
    validateDates();
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
    // 이미 고른 항공편은 새 결과에 없어도 그대로 둔다(선택 카드·일정의 ✈ 블록과 다음 요청 본문이 어긋나지 않게).
    renderFlightCards(true);
    renderFlightFilterChecks(data.filterOptions);
    renderSourceNote('flightSourceNote', 'flights', info, { dateMatch: data.dateMatch || null });
    if (fromButton) recordSearchHistory('flight', { from: payload.from, to: payload.to, city: payload.city });
  } catch (err) {
    if (seq !== flightSearchSeq) return;
    el('flightCards').innerHTML = '<div class="card">' + escapeHtml(friendlyError(err)) + '</div>';
    el('btnFlightMore')?.classList.add('hidden');
  } finally {
    if (seq === flightSearchSeq) setLoading('btnFlights', false);
  }
}

el('btnFlights').addEventListener('click', () => { searchFlights({ fromButton: true }); });

el('btnFlightMore').addEventListener('click', () => {
  visibleFlightCount += flightPageSize();
  renderFlightCards(false);
});

document.querySelectorAll('#flightSortTabs .sort-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    flightSortMode = btn.dataset.sort;
    document.querySelectorAll('#flightSortTabs .sort-tab').forEach((x) => {
      x.classList.toggle('active', x === btn);
      x.setAttribute('aria-pressed', x === btn ? 'true' : 'false');
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


// ═══ 일정 배치: 끌어 놓기·추가 창·옮기기·터치 끌기가 모두 이 함수 하나를 부른다 ═══
// opts = { day, slotKey, name, area, kind:'dest'|'food', mode:'add'|'move', from:{day, blockIndex}, window:{start, end}, silent }
// 여행지는 어느 경로든 그날 다른 여행지와의 시간 겹침을 본다(빈 시간으로 옮기거나 묻는다).
// 반환 { ok, reason, day, blockIndex }. 실패 사유: no-plan·bad-slot·no-day·no-source·not-main·no-name·kind-mismatch·noop·cancelled
var lastPlacedRef = null;

function placeNamesEqual(a, b) {
  var x = normalizePlaceKey(a);
  return Boolean(x) && x === normalizePlaceKey(b);
}

// 분 → 'HH:MM'(0~23:59로 자른다)
function minToTime(min) {
  var m = Math.max(0, Math.min(23 * 60 + 59, Math.round(Number(min) || 0)));
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// 그날 여행지 블록(오전·오후·종일, 자유 일정 제외)의 시간 범위. 식사는 칸이 따로라 겹침 검사에서 뺀다.
function sightRangesOfDay(dayData, skipIdx) {
  var out = [];
  groupItineraryBlocks((dayData && dayData.blocks) || []).forEach(function(g) {
    if (g.type !== 'main' || isMealPeriod(g.period) || g._blockIndex === skipIdx) return;
    var name = parsePlaceInfo(g.place).name;
    if (isFreeTimePlace(name)) return;
    var s = timeToMin(g.startTime), e = timeToMin(g.endTime);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return;
    out.push({ s: s, e: e, name: name, period: g.period, startTime: padTime(g.startTime), endTime: padTime(g.endTime), index: g._blockIndex });
  });
  return out.sort(function(a, b) { return a.s - b.s || a.e - b.e; });
}

// 새 여행지 블록이 [start, end)에 들어갈 때 겹치는 블록이 있으면: 반나절 칸은 그 안의 빈 시간(60분 이상)으로 옮기고,
// 빈 시간이 없거나 종일 칸이면 conflict(겹치는 첫 블록)를 돌려준다. 반환 { start, end, shifted, conflict }
var SIGHT_MIN_GAP_MIN = 60;

function fitSightTime(dayData, start, end, skipIdx, allowShift) {
  var res = { start: start, end: end, shifted: false, conflict: null };
  var s0 = timeToMin(start), e0 = timeToMin(end);
  if (!dayData || !Number.isFinite(s0) || !Number.isFinite(e0) || e0 <= s0) return res;
  var busy = sightRangesOfDay(dayData, skipIdx).filter(function(r) { return r.s < e0 && s0 < r.e; });
  if (busy.length === 0) return res;
  if (allowShift) {
    var cursor = s0;
    var i = 0;
    for (; i < busy.length; i++) {
      if (busy[i].s - cursor >= SIGHT_MIN_GAP_MIN) break;
      cursor = Math.max(cursor, busy[i].e);
    }
    var gapEnd = i < busy.length ? busy[i].s : e0;
    if (gapEnd - cursor >= SIGHT_MIN_GAP_MIN) {
      res.start = minToTime(cursor);
      res.end = minToTime(gapEnd);
      res.shifted = true;
      return res;
    }
  }
  res.conflict = busy[0];
  return res;
}

// '🌙 저녁 이후' 칸에 놓을 때의 시간 창: 저녁 식사가 끝난 뒤(없으면 19:00)부터, 이미 있는 밤 일정 뒤로 넉넉히.
function nightDropWindow(dayData) {
  var dinner = periodBlocks(dayData, SLOT_DEFS.dinner.period)[0];
  var start = dinner ? timeToMin(dinner.parsed.endTime) : NaN;
  if (!Number.isFinite(start)) start = 19 * 60;
  var lastEnd = start;
  sightRangesOfDay(dayData, -1).forEach(function(r) { if (r.e > lastEnd && r.s >= start - 60) lastEnd = r.e; });
  var end = Math.min(23 * 60 + 59, Math.max(start + 120, lastEnd + 90));
  return { start: minToTime(start), end: minToTime(end) };
}

// 이 오후 블록이 '🌙 저녁 이후' 칸에 그려지는지: 그날 저녁 식사 시작(없으면 저녁 칸 기본 시작) 이후에 시작 — itinDayLayout과 같은 기준
function isNightAfternoonBlock(dayData, block) {
  if (!block || block.period !== SLOT_DEFS.afternoon.period) return false;
  var dinner = periodBlocks(dayData, SLOT_DEFS.dinner.period)[0];
  var cut = dinner ? timeToMin(dinner.parsed.startTime) : NaN;
  if (!Number.isFinite(cut)) cut = timeToMin(SLOT_DEFS.dinner.start);
  var s = timeToMin(block.startTime);
  return Number.isFinite(s) && s >= cut;
}

function placeBlock(opts) {
  opts = opts || {};
  if (!currentItineraryData || !Array.isArray(currentItineraryData.itinerary)) return { ok: false, reason: 'no-plan' };
  var def = SLOT_DEFS[opts.slotKey];
  if (!def) return { ok: false, reason: 'bad-slot' };
  var tgtDay = findItineraryDay(opts.day);
  if (!tgtDay) return { ok: false, reason: 'no-day' };
  if (!Array.isArray(tgtDay.blocks)) tgtDay.blocks = [];
  var mode = opts.mode === 'move' ? 'move' : 'add';
  var name, area, kind;
  // opts.window = { start, end }: 칸의 기본 시각 대신 쓸 시간 창(여행지 칸만, 예: '저녁 이후' 칸)
  var win = def.kind === 'dest' && opts.window && Number.isFinite(timeToMin(opts.window.start)) && timeToMin(opts.window.end) > timeToMin(opts.window.start) ? opts.window : null;
  var start = win ? win.start : def.start;
  var end = win ? win.end : def.end;
  var srcDay = null;
  var srcIdx = -1;
  var sourceBlock = null;

  if (mode === 'move') {
    var from = opts.from || {};
    srcDay = findItineraryDay(from.day);
    srcIdx = Number(from.blockIndex);
    if (!srcDay || !Array.isArray(srcDay.blocks) || !(srcIdx >= 0) || srcIdx >= srcDay.blocks.length) return { ok: false, reason: 'no-source' };
    sourceBlock = parseItineraryBlock(srcDay.blocks[srcIdx]);
    if (sourceBlock.type !== 'main') return { ok: false, reason: 'not-main' };
    kind = isMealPeriod(sourceBlock.period) ? 'food' : 'dest';
    var srcInfo = parsePlaceInfo(sourceBlock.place);
    name = srcInfo.name;
    area = srcInfo.info;
    if (def.kind !== kind) return { ok: false, reason: 'kind-mismatch' };
    if (win) {
      // '저녁 이후' 칸으로: 이미 그 시간 창 안에 있는 같은 날 블록이면 할 일이 없다.
      var srcStart = timeToMin(sourceBlock.startTime);
      if (srcDay === tgtDay && sourceBlock.period === def.period && srcStart >= timeToMin(win.start) && srcStart < timeToMin(win.end)) return { ok: false, reason: 'noop' };
    } else {
      // '저녁 이후' 칸의 항목(시간대는 오후)을 보통 오후 칸에 놓으면: 같은 날이어도 할 일이 있고, 오후 기본 시각(빈 시간)으로 옮긴다.
      var srcNight = isNightAfternoonBlock(srcDay, sourceBlock);
      if (srcDay === tgtDay && sourceBlock.period === def.period && !srcNight) return { ok: false, reason: 'noop' };
      // 시간대가 같고 날만 바뀌면 원래 시각을 유지한다(저녁 이후 항목은 오후 칸에 맞게 기본 시각으로).
      if (sourceBlock.period === def.period && !srcNight) { start = sourceBlock.startTime; end = sourceBlock.endTime; }
    }
  } else {
    name = String(opts.name || '').trim();
    area = String(opts.area || '').trim();
    kind = opts.kind === 'food' ? 'food' : 'dest';
    if (!name) return { ok: false, reason: 'no-name' };
    if (def.kind !== kind) return { ok: false, reason: 'kind-mismatch' };
  }
  var isSource = function(dayData, idx) { return mode === 'move' && dayData === srcDay && idx === srcIdx; };

  var replaceIdx = -1;   // 바꿀(지울) 기존 식사 블록
  var swapFrom = null;   // 맞바꿀 기존 식사 블록 { index, parsed }
  if (def.kind === 'food') {
    // 식사 칸은 시간대당 1개: 차 있으면 식사→식사 이동은 맞바꾸고, 그 밖에는 물어보고 바꾼다.
    var existing = periodBlocks(tgtDay, def.period).filter(function(x) { return !isSource(tgtDay, x.index); });
    if (existing.length > 0) {
      if (mode === 'move' && isMealPeriod(sourceBlock.period)) {
        swapFrom = existing[0];
      } else {
        var exName = parsePlaceInfo(existing[0].parsed.place).name;
        if (!confirm(fillText(t('confirm-replace-meal'), { n: exName }))) return { ok: false, reason: 'cancelled' };
        replaceIdx = existing[0].index;
      }
    }
  } else {
    var dup = tgtDay.blocks.some(function(b, i) {
      if (isSource(tgtDay, i)) return false;
      var p = parseItineraryBlock(b);
      return p.type === 'main' && !isFreeTimePlace(name) && placeNamesEqual(parsePlaceInfo(p.place).name, name);
    });
    if (dup) {
      if (!confirm(fillText(t('confirm-duplicate-place'), { n: name }))) return { ok: false, reason: 'cancelled' };
    }
    // 시간 겹침(끌어 놓기·추가 창·옮기기·터치 공통): 그날의 모든 여행지 블록(오전·오후·종일)과 비교한다.
    // 반나절 칸은 그 칸 안의 빈 시간으로 옮겨 넣고, 빈 시간이 없거나 종일 칸이면 무엇과 겹치는지 보여 주고 묻는다.
    var fit = fitSightTime(tgtDay, start, end, mode === 'move' && srcDay === tgtDay ? srcIdx : -1, def.period !== SLOT_DEFS.allday.period);
    if (fit.conflict) {
      var c = fit.conflict;
      var ask = fillText(t('confirm-time-overlap'), { day: itinDayLabel(tgtDay.day), n: c.name, t: c.startTime + '–' + c.endTime });
      if (!confirm(ask)) return { ok: false, reason: 'cancelled' };
    } else if (fit.shifted) {
      start = fit.start;
      end = fit.end;
    }
  }

  // 새 블록(옮기기면 설명·팁 줄도 함께)
  var newLines = [formatPlanBlock(def.period, start, end, name, area)];
  if (mode === 'move') newLines = newLines.concat(srcDay.blocks.slice(srcIdx + 1, srcIdx + blockGroupLength(srcDay.blocks, srcIdx)));
  var swapLines = null;
  if (swapFrom) {
    var back = SLOT_DEFS[PERIOD_TO_SLOT[sourceBlock.period]];
    var swInfo = parsePlaceInfo(swapFrom.parsed.place);
    swapLines = [formatPlanBlock(back.period, back.start, back.end, swInfo.name, swInfo.info)]
      .concat(tgtDay.blocks.slice(swapFrom.index + 1, swapFrom.index + blockGroupLength(tgtDay.blocks, swapFrom.index)));
  }

  // 지울 블록은 같은 배열 안에서 뒤쪽부터 지운다(앞 블록의 위치가 밀리지 않게).
  var removals = [];
  if (mode === 'move') removals.push({ day: srcDay, idx: srcIdx });
  if (replaceIdx >= 0) removals.push({ day: tgtDay, idx: replaceIdx });
  if (swapFrom) removals.push({ day: tgtDay, idx: swapFrom.index });
  removals.sort(function(a, b) { return b.idx - a.idx; });
  removals.forEach(function(r) { removeBlockGroup(r.day, r.idx); });

  var newIdx = insertBlockSorted(tgtDay, newLines);
  if (swapLines) {
    var swapIdx = insertBlockSorted(srcDay, swapLines);
    if (srcDay === tgtDay && swapIdx <= newIdx) newIdx += swapLines.length;
  }

  markItineraryEdited();
  invalidateRouteCost(tgtDay.day);
  if (srcDay && srcDay !== tgtDay) invalidateRouteCost(srcDay.day);
  renderItineraryTimeline();
  updateItinMap();
  lastPlacedRef = { day: Number(tgtDay.day), blockIndex: newIdx };
  highlightPlacedBlock(lastPlacedRef.day, newIdx);
  if (!opts.silent) {
    var placedMsg = fillText(t(mode === 'move' ? 'moved-in-plan' : 'added-to-plan-toast'), { d: tgtDay.day, p: tPeriod(def.period), n: name });
    // 칸의 기본 시각과 다르게 넣었으면(빈 시간·저녁 이후) 실제 시각을 덧붙인다.
    if (def.kind === 'dest' && (fit.shifted || win)) placedMsg += ' · ' + padTime(start) + '–' + padTime(end);
    showMemoToast(placedMsg, 3000);
  }
  return { ok: true, day: Number(tgtDay.day), blockIndex: newIdx };
}

function placedBlockElement(dayNum, blockIndex) {
  return document.querySelector('#planResult [data-itin-day="' + dayNum + '"][data-itin-block-index="' + blockIndex + '"]');
}

// 방금 넣은 항목을 잠깐 강조하고 화면 안으로 데려온다.
function highlightPlacedBlock(dayNum, blockIndex) {
  var node = placedBlockElement(dayNum, blockIndex);
  if (!node) return;
  node.classList.add('just-added');
  setTimeout(function() { node.classList.remove('just-added'); }, 900);
  try { node.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
}

// ── 일정에 추가/옮기기 창 ──
var addModalCustomMode = false; // 이름 없이 연 창(칩·직접 입력으로 고르는 모드)

function addModalHeading() {
  var modal = el('addToPlanModal');
  return el('modalHeading') || (modal ? modal.querySelector('h4') : null);
}

function setI18nText(node, key) {
  if (!node) return;
  node.setAttribute('data-i18n', key);
  node.textContent = t(key);
}

function shortDateLabel(dateText) {
  var m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(dateText || ''));
  return m ? Number(m[1]) + '/' + Number(m[2]) : '';
}

function ensureModalPickList() {
  var list = el('modalPickList');
  if (list) return list;
  var anchor = el('modalPlaceName');
  if (anchor && typeof anchor.insertAdjacentHTML === 'function') {
    anchor.insertAdjacentHTML('afterend', '<div id="modalPickList" class="modal-pick-list"></div>');
    list = el('modalPickList');
  }
  return list;
}

// 지금 일정에 들어 있는 장소 이름(정규화)
function plannedPlaceKeys() {
  var keys = {};
  (currentItineraryData && currentItineraryData.itinerary || []).forEach(function(d) {
    (d.blocks || []).forEach(function(b) {
      var p = parseItineraryBlock(b);
      if (p.type === 'main') keys[normalizePlaceKey(parsePlaceInfo(p.place).name)] = true;
    });
  });
  return keys;
}

// 직접 넣기(이름 없이 연 창)에서 추천 목록을 칩으로 보여 준다. 이미 일정에 있으면 ✓
function renderModalPickChips(kind) {
  var list = ensureModalPickList();
  if (!list) return 0;
  var items = (kind === 'food' ? latestRecFoodList : latestDestList) || [];
  var used = plannedPlaceKeys();
  list.innerHTML = items.map(function(x, i) {
    if (!x || !x.name) return '';
    var isUsed = Boolean(used[normalizePlaceKey(x.name)]);
    return '<button type="button" class="modal-pick-chip' + (isUsed ? ' is-used' : '') + '" data-pick-index="' + i + '" data-pick-kind="' + kind + '" aria-pressed="false">' +
      escapeHtml(x.name) + (isUsed ? ' ✓' : '') + '</button>';
  }).join('');
  list.hidden = items.length === 0;
  list.classList.toggle('hidden', items.length === 0);
  return items.length;
}

function hideModalPickList() {
  var list = el('modalPickList');
  if (!list) return;
  list.innerHTML = '';
  list.hidden = true;
  list.classList.add('hidden');
}

function setModalPickActive(index) {
  document.querySelectorAll('.modal-pick-chip').forEach(function(c) {
    var on = String(c.dataset.pickIndex) === String(index);
    c.classList.toggle('active', on);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

// 창의 시간대 선택지 '🌙 저녁 이후'(여행지만): 오후 블록으로, 저녁 식사·밤 일정 뒤 시간(nightDropWindow)에 넣는다.
// 그날 밤 일정이 없어 '저녁 이후' 칸이 그려지지 않아도 야경 같은 곳을 저녁 식사 뒤로 넣을 수 있게 한다.
var MODAL_NIGHT_SLOT = 'night';

function modalSlotValid(slot, type) {
  if (slot === MODAL_NIGHT_SLOT) return type === 'dest';
  return Boolean(SLOT_DEFS[slot] && SLOT_DEFS[slot].kind === type);
}

// 유형(여행지/맛집)에 맞는 시간대 줄만 보이고, 실제로 들어갈 시간대(pendingAddSlot)에 강조를 맞춘다.
function paintAddModalSlots() {
  var destSlots = el('destSlots');
  var foodSlots = el('foodSlots');
  if (destSlots) destSlots.style.display = pendingAddType === 'food' ? 'none' : '';
  if (foodSlots) foodSlots.style.display = pendingAddType === 'food' ? '' : 'none';
  document.querySelectorAll('.slot-btn').forEach(function(b) {
    var on = b.dataset.slot === pendingAddSlot;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('.type-btn').forEach(function(b) {
    var on = b.dataset.type === pendingAddType;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function addModalField(node) {
  return node && node.closest ? node.closest('.plan-modal-field') : null;
}

// name이 있으면 그 장소를, 없으면 칩·직접 입력으로 고른다. opts: { addType, area, day, slot, mode:'move', from }
function showAddToPlanModal(name, opts) {
  opts = opts || {};
  var modal = el('addToPlanModal');
  if (!modal || !currentItineraryData) return;
  pendingAddMode = opts.mode === 'move' ? 'move' : 'add';
  pendingMoveFrom = pendingAddMode === 'move' && opts.from ? { day: Number(opts.from.day), blockIndex: Number(opts.from.blockIndex) } : null;
  pendingAddType = opts.addType === 'food' ? 'food' : 'dest';
  pendingAddPlace = { name: name || '', area: opts.area || '', custom: !name };
  var defaultSlot = pendingAddType === 'food' ? 'dinner' : 'afternoon';
  pendingAddSlot = opts.slot && modalSlotValid(opts.slot, pendingAddType) ? opts.slot : defaultSlot;

  var isMove = pendingAddMode === 'move';
  var customMode = !isMove && !name;
  addModalCustomMode = customMode;
  setI18nText(addModalHeading(), isMove ? 'modal-move-plan' : 'modal-add-plan');
  setI18nText(el('modalConfirmAdd'), isMove ? 'btn-move-confirm' : 'btn-add');
  if (el('modalPlaceName')) el('modalPlaceName').textContent = name || '';

  // 이전에 열었던 창의 입력·선택이 남지 않게 매번 비운다.
  var customInput = el('modalCustomName');
  if (customInput) customInput.value = '';
  var customWrap = el('modalCustomWrap');
  var chipCount = customMode ? renderModalPickChips(pendingAddType) : 0;
  if (!customMode) hideModalPickList();
  if (customWrap) {
    customWrap.style.display = customMode ? '' : 'none';
    var label = customWrap.querySelector('[data-i18n="modal-place-name"], [data-i18n="modal-custom-hint"]') || customWrap.querySelector('span');
    if (label) setI18nText(label, chipCount > 0 ? 'modal-custom-hint' : 'modal-place-name');
  }
  // 유형 선택은 직접 넣기에서만 보인다(카드·옮기기는 유형이 정해져 있다).
  var typeField = addModalField(document.querySelector('.type-btn'));
  if (typeField) typeField.style.display = customMode ? '' : 'none';

  var daySelect = el('modalDaySelect');
  if (daySelect) {
    daySelect.innerHTML = currentItineraryData.itinerary.map(function(d) {
      var md = shortDateLabel(d.date);
      return '<option value="' + escapeHtml(String(d.day)) + '">' + escapeHtml(itinDayLabel(d.day) + (md ? ' · ' + md : '')) + '</option>';
    }).join('');
    var firstDay = currentItineraryData.itinerary[0] ? currentItineraryData.itinerary[0].day : '';
    daySelect.value = String(opts.day || firstDay);
  }
  paintAddModalSlots();
  openDialog('addToPlanModal');
  modal.classList.remove('hidden');
  focusFirstIn(modal, ['.modal-pick-chip', '#modalCustomName', '#modalConfirmAdd']);
}

function hideAddToPlanModal() {
  var modal = el('addToPlanModal');
  var wasOpen = modal && !modal.classList.contains('hidden');
  if (modal) modal.classList.add('hidden');
  pendingAddPlace = null;
  pendingAddMode = 'add';
  pendingMoveFrom = null;
  var customInput = el('modalCustomName');
  if (customInput) customInput.value = '';
  setModalPickActive(-1);
  setI18nText(addModalHeading(), 'modal-add-plan');
  setI18nText(el('modalConfirmAdd'), 'btn-add');
  if (wasOpen) closeDialog('addToPlanModal');
}

function confirmAddToPlan() {
  if (!currentItineraryData) { hideAddToPlanModal(); return; }
  var dayNum = Number((el('modalDaySelect') || {}).value);
  // '저녁 이후' = 오후 블록 + 그날 저녁 식사 뒤의 시간 창(끌어 놓기의 '🌙 저녁 이후' 칸과 같은 경로)
  var slotKey = pendingAddSlot === MODAL_NIGHT_SLOT ? 'afternoon' : pendingAddSlot;
  var win = pendingAddSlot === MODAL_NIGHT_SLOT ? nightDropWindow(findItineraryDay(dayNum)) : null;
  var result;
  if (pendingAddMode === 'move') {
    result = placeBlock({ mode: 'move', day: dayNum, slotKey: slotKey, from: pendingMoveFrom, window: win });
  } else {
    var place = pendingAddPlace || { name: '', area: '', custom: true };
    var name = place.name;
    var area = place.area;
    // 직접 입력 모드(칩 미선택 + 이름 없음)일 때만 입력칸 글을 쓴다. 지역은 모르므로 비운다.
    if (!name && place.custom !== false) {
      name = String((el('modalCustomName') || {}).value || '').trim();
      area = '';
    }
    if (!name) {
      showMemoToast(t('modal-need-place'));
      var input = el('modalCustomName');
      if (input && typeof input.focus === 'function') input.focus();
      return;
    }
    result = placeBlock({ mode: 'add', day: dayNum, slotKey: slotKey, name: name, area: area, kind: pendingAddType, window: win });
  }
  if (result.ok) { hideAddToPlanModal(); return; }
  // 이미 그 날·그 칸에 있으면 창을 닫고 바뀐 것이 없다고 알린다(조용히 닫히면 실패처럼 보인다).
  if (result.reason === 'noop') { hideAddToPlanModal(); showMemoToast(t('place-noop'), 2000); return; }
  if (result.reason === 'kind-mismatch') { showMemoToast(t('drop-kind-mismatch')); return; }
  if (result.reason === 'cancelled') return; // 다른 칸을 고를 수 있게 창은 열어 둔다
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
        '<span class="drag-hint" aria-hidden="true">' + escapeHtml(t('drag-handle')) + '</span>' +
        '</div>' +
      '</div>' +
      '<span class="drag-handle" aria-hidden="true" title="' + escapeHtml(t('drag-handle')) + '">\u2630</span>' +
      '<div class="link-row">' +
      '<button type="button" class="add-to-plan-btn" data-add-type="food" data-add-index="' + index + '" data-add-source="recFood">' + escapeHtml(t('add-to-plan')) + '</button>' +
      '<a href="' + escapeHtml(safeLinkUrl(x.mapUrl) || '#') + '" target="_blank" rel="noreferrer">' + escapeHtml(t('map-link')) + '</a>' +
      '<button type="button" class="rec-delete-btn" data-delete-type="food" data-delete-index="' + index + '" aria-label="' + escapeHtml(t('aria-hide-pick')) + '" title="' + escapeHtml(t('aria-hide-pick')) + '">\u2715</button></div>' +
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
      latestDestList.splice(idx, 1);
      renderCards('destCards', latestDestList, 'dest');
      renderPlanSelectionCards();
    }
  }
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
    if (!confirmOverwriteIfEdited()) return;
    try {
      await runPlan({}, false, { trigger: 'btnPlanRefresh' });
    } catch (err) {
      el('planResult').textContent = friendlyError(err);
    }
  });
}

var foodSearchSeq = 0;

async function searchFoods(opts) {
  var seq = ++foodSearchSeq;
  var cityKey = el('foodCity').value;
  var genreText = el('foodGenre').value;
  setLoading('btnFood', true);
  try {
    const city = encodeURIComponent(cityKey);
    const genre = encodeURIComponent(genreText);
    const data = await fetchWithTimeout(`/api/foods?lang=${currentLang}&city=${city}&genre=${genre}&budget=${currentBudgetTier()}`, {}, 30000, function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
    if (seq !== foodSearchSeq) return;
    if (opts && opts.fromButton) recordSearchHistory('food', { city: cityKey, genre: genreText });
    const list = data.list || [];
    const info = sectionInfo('foodSearch', data);
    latestFoodSearchList = list;
    latestFoodList = list;
    if (list.length === 0 && info && info.reasonCode === 'NO_GENRE_MATCH') {
      // 장르에 맞는 가게가 없으면(서버가 지어낸 이름 대신 빈 목록을 준다) 다른 장르를 권한다.
      el('foodCards').innerHTML = '<div class="card empty-state" data-i18n="food-no-genre-match">' + escapeHtml(t('food-no-genre-match')) + '</div>';
      renderSourceNote('foodSourceNote', 'foodSearch', null);
    } else {
      renderCards('foodCards', list, 'food');
      renderSourceNote('foodSourceNote', 'foodSearch', info);
    }
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

el('btnFood').addEventListener('click', () => { searchFoods({ fromButton: true }); });

var staySearchSeq = 0;
var lastStayFilterOptions = null; // 언어를 바꾸면 부대시설 체크 목록 글자를 다시 그린다

async function searchStays(opts) {
  var seq = ++staySearchSeq;
  var fromButton = Boolean(opts && opts.fromButton);
  try {
    // 지난 날짜는 요청을 만들기 전에 오늘로 고친다(본문에 옛 날짜가 실리지 않게).
    validateDates();
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
    setStayMoreVisible(false);
    var data = await postJson('/api/stays', payload);
    if (seq !== staySearchSeq) return;
    var info = sectionInfo('stays', data);
    var isMock = info && info.kind === 'mock';
    // 직접 입력한 숙소(manualStays)와 이미 고른 숙소는 새 결과에 없어도 남는다.
    stayResults = (data.stays || []).map(function(s) { return Object.assign({}, s, { _mock: isMock }); });
    renderStayFilterChecks(data.filterOptions);
    renderStayCards(true);
    renderSourceNote('staySourceNote', 'stays', info);
    lastStayFilterOptions = data.filterOptions || null;
    if (fromButton) recordSearchHistory('stay', { city: payload.city });
  } catch (err) {
    if (seq !== staySearchSeq) return;
    el('stayCards').innerHTML = '<div class="card">' + escapeHtml(friendlyError(err)) + '</div>';
    setStayMoreVisible(false);
  } finally {
    if (seq === staySearchSeq) setLoading('btnStays', false);
  }
}

el('btnStays').addEventListener('click', () => { searchStays({ fromButton: true }); });

el('stayCards').addEventListener('click', (event) => {
  const btn = event.target.closest('.stay-select-btn');
  if (!btn) return;
  selectStayById(btn.dataset.stayId);
});

el('checkIn').addEventListener('change', ensureCheckOutDate);
el('stayPreference').addEventListener('change', () => {
  staySortMode = el('stayPreference').value || 'balanced';
  renderStayCards(true);
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
  // 도시를 직접 바꾸면 앞서 말로 한 요청의 의도(꼭 갈 곳·경로·제외 등)는 더 이상 맞지 않는다.
  // 요청칸의 같은 글로 주 버튼을 다시 눌러도 채팅을 또 부르지 않게 '처리한 글'로 남긴다.
  resetAiIntentState(true);
  syncCityDependents(el('city').value);
});


// ── Recommendation tab switching ──
document.querySelectorAll('.rec-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.rec-tab').forEach(function(t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    var which = tab.dataset.recTab;
    var destPanel = el('recDestPanel');
    var foodPanel = el('recFoodPanel');
    if (destPanel) destPanel.style.display = which === 'dest' ? '' : 'none';
    if (foodPanel) foodPanel.style.display = which === 'food' ? '' : 'none';
  });
});

// ── Modal / 일정 칸 버튼 처리(이벤트 위임: 창은 이 스크립트보다 뒤에 있다) ──
document.addEventListener('click', function(e) {
  var target = e.target && e.target.closest ? e.target : null;
  if (!target) return;
  if (target.closest('#modalConfirmAdd')) { confirmAddToPlan(); return; }
  if (target.closest('#modalCancelAdd')) { hideAddToPlanModal(); return; }
  // 창 바깥(어두운 배경)을 누르면 닫는다.
  if (target.id === 'addToPlanModal') { hideAddToPlanModal(); return; }

  var typeBtn = target.closest('.type-btn');
  if (typeBtn) {
    pendingAddType = typeBtn.dataset.type === 'food' ? 'food' : 'dest';
    if (!modalSlotValid(pendingAddSlot, pendingAddType)) pendingAddSlot = pendingAddType === 'food' ? 'dinner' : 'afternoon';
    // 유형이 바뀌면 칩 목록도 그 유형으로 다시 그리고 칩 선택은 푼다.
    if (addModalCustomMode) {
      pendingAddPlace = { name: '', area: '', custom: true };
      var count = renderModalPickChips(pendingAddType);
      var wrapLabel = el('modalCustomWrap') ? el('modalCustomWrap').querySelector('[data-i18n="modal-place-name"], [data-i18n="modal-custom-hint"]') : null;
      if (wrapLabel) setI18nText(wrapLabel, count > 0 ? 'modal-custom-hint' : 'modal-place-name');
    }
    paintAddModalSlots();
    return;
  }

  var slotBtn = target.closest('.slot-btn');
  if (slotBtn) {
    if (modalSlotValid(slotBtn.dataset.slot, pendingAddType)) pendingAddSlot = slotBtn.dataset.slot;
    paintAddModalSlots();
    return;
  }

  var chip = target.closest('.modal-pick-chip');
  if (chip) {
    var kind = chip.dataset.pickKind === 'food' ? 'food' : 'dest';
    var item = (kind === 'food' ? latestRecFoodList : latestDestList)[Number(chip.dataset.pickIndex)];
    if (!item) return;
    if (chip.classList.contains('active')) {
      pendingAddPlace = { name: '', area: '', custom: true };
      setModalPickActive(-1);
      return;
    }
    pendingAddPlace = { name: item.name, area: item.area || item.city || '', custom: false };
    var customInput = el('modalCustomName');
    if (customInput) customInput.value = '';
    setModalPickActive(chip.dataset.pickIndex);
    return;
  }

  var removeBtn = target.closest('.itin-remove-btn');
  if (removeBtn && currentItineraryData) {
    var rDay = Number(removeBtn.dataset.day);
    var dayData = findItineraryDay(rDay);
    if (dayData && Array.isArray(dayData.blocks)) {
      var rIdx = Number(removeBtn.dataset.blockIndex);
      if (removeBtn.dataset.blockIndex !== undefined && removeBtn.dataset.blockIndex !== '' && rIdx >= 0 && rIdx < dayData.blocks.length) {
        removeBlockGroup(dayData, rIdx);
      } else if (removeBtn.dataset.period) {
        // 예전 화면 호환: 시간대 이름만 있는 버튼은 그 시간대의 첫 블록을 지운다.
        var first = periodBlocks(dayData, removeBtn.dataset.period)[0];
        if (first) removeBlockGroup(dayData, first.index);
      } else {
        return;
      }
      markItineraryEdited();
      invalidateRouteCost(rDay);
      renderItineraryTimeline();
      updateItinMap();
    }
    return;
  }

  var moveBtn = target.closest('.itin-move-btn');
  if (moveBtn && currentItineraryData) {
    var mvDay = Number(moveBtn.dataset.day);
    var mvIdx = Number(moveBtn.dataset.blockIndex);
    var mvDayData = findItineraryDay(mvDay);
    var mvParsed = mvDayData ? parseItineraryBlock(mvDayData.blocks[mvIdx]) : null;
    if (!mvParsed || mvParsed.type !== 'main') return;
    var mvInfo = parsePlaceInfo(mvParsed.place);
    showAddToPlanModal(mvInfo.name, {
      mode: 'move', from: { day: mvDay, blockIndex: mvIdx }, day: mvDay,
      // '🌙 저녁 이후' 칸의 항목이면 창에서도 '저녁 이후'를 미리 고른다(지금 있는 칸)
      slot: isNightAfternoonBlock(mvDayData, mvParsed) ? MODAL_NIGHT_SLOT : PERIOD_TO_SLOT[mvParsed.period],
      addType: isMealPeriod(mvParsed.period) ? 'food' : 'dest', area: mvInfo.info
    });
    return;
  }

  var zoneAddBtn = target.closest('.itin-zone-add-btn');
  if (zoneAddBtn) {
    showAddToPlanModal('', { day: Number(zoneAddBtn.dataset.day), addType: 'dest', slot: zoneAddBtn.dataset.slot });
    return;
  }

  var mealAddBtn = target.closest('.itin-meal-add-btn');
  if (mealAddBtn) {
    showAddToPlanModal('', { day: Number(mealAddBtn.dataset.day), addType: 'food', slot: mealAddBtn.dataset.mealSlot || 'dinner' });
    return;
  }
});

// 직접 입력칸에 쓰기 시작하면 칩 선택을 푼다(마지막 동작이 이긴다).
document.addEventListener('input', function(e) {
  if (!e.target || e.target.id !== 'modalCustomName') return;
  if (String(e.target.value || '').trim() && pendingAddPlace && pendingAddPlace.custom === false) {
    pendingAddPlace = { name: '', area: '', custom: true };
    setModalPickActive(-1);
  }
});

// ── 끌어 놓기(마우스 HTML5 drag + 터치 ☰ 손잡이) ──
var DRAG_MIME = 'application/x-tabimaru';
var DROP_ZONE_SELECTOR = '.itin-period-zone, .itin-meal-empty, .itin-slot[data-drop-meal], .itin-section-label[data-drop-type]';
var DRAG_SOURCE_SELECTOR = '[data-drag-type], [data-itin-day][data-itin-period]';
var dragOverState = null; // 마지막 dragover 위치의 칸과 호환 여부(놓기 실패 안내용)

// 끌기 시작한 요소(추천 카드 또는 일정 항목) → dragData
function beginDrag(sourceEl) {
  if (!sourceEl || !sourceEl.dataset) return null;
  if (sourceEl.dataset.dragType) {
    var type = sourceEl.dataset.dragType === 'food' ? 'food' : 'dest';
    var index = Number(sourceEl.dataset.dragIndex);
    var item = (type === 'dest' ? latestDestList : latestRecFoodList)[index];
    if (!item || !item.name) return null;
    return { source: 'rec', kind: type, type: type, item: item, index: index, name: item.name, area: item.area || item.city || '' };
  }
  if (sourceEl.dataset.itinDay && currentItineraryData) {
    var day = Number(sourceEl.dataset.itinDay);
    var blockIndex = Number(sourceEl.dataset.itinBlockIndex);
    var dayData = findItineraryDay(day);
    var parsed = dayData && blockIndex >= 0 ? parseItineraryBlock(dayData.blocks[blockIndex]) : null;
    if (!parsed || parsed.type !== 'main') return null;
    return { source: 'itin', kind: isMealPeriod(parsed.period) ? 'food' : 'dest', day: day, period: parsed.period, blockIndex: blockIndex, name: parsePlaceInfo(parsed.place).name };
  }
  return null;
}

function zoneFromNode(node) {
  var n = node && node.nodeType !== 1 ? node.parentElement : node;
  return n && n.closest ? n.closest(DROP_ZONE_SELECTOR) : null;
}

function isZoneCompatible(dd, zone) {
  return Boolean(dd && zone && zone.dataset && zone.dataset.dropType === dd.kind);
}

// 끄는 것과 종류가 맞는 칸에만 .drop-active를 붙인다(여행지 ↔ 📍 칸, 맛집 ↔ 🍴 칸).
function markCompatibleZones(kind) {
  document.querySelectorAll(DROP_ZONE_SELECTOR).forEach(function(z) {
    z.classList.toggle('drop-active', z.dataset.dropType === kind);
  });
}

function setDropHover(zone) {
  document.querySelectorAll('.drop-hover').forEach(function(n) { if (n !== zone) n.classList.remove('drop-hover'); });
  if (zone) zone.classList.add('drop-hover');
}

// 놓기·취소·실패 어느 경우든 끌기 상태를 남기지 않는다(렌더 후 원본이 사라져 dragend가 안 와도).
function clearDragState() {
  dragData = null;
  dragOverState = null;
  document.querySelectorAll('.dragging, .drop-active, .drop-hover').forEach(function(n) {
    n.classList.remove('dragging');
    n.classList.remove('drop-active');
    n.classList.remove('drop-hover');
  });
}

function hasTabimaruDrag(e) {
  var types = e && e.dataTransfer ? e.dataTransfer.types : null;
  if (!types) return false;
  if (typeof types.indexOf === 'function') return types.indexOf(DRAG_MIME) >= 0;
  if (typeof types.contains === 'function') return types.contains(DRAG_MIME);
  return Array.prototype.indexOf.call(types, DRAG_MIME) >= 0;
}

// 칸에 놓기(마우스·터치 공용) → placeBlock
function applyDropToZone(dd, zone) {
  if (!dd || !zone || !currentItineraryData) return null;
  if (!isZoneCompatible(dd, zone)) {
    showMemoToast(t('drop-kind-mismatch'));
    return { ok: false, reason: 'kind-mismatch' };
  }
  var day = Number(zone.dataset.dropDay);
  var slotKey = '';
  var win = null;
  if (zone.dataset.dropType === 'dest' && zone.dataset.dropDestPeriod === 'night') {
    // '🌙 저녁 이후' 칸: 오후 블록으로, 저녁 식사·밤 일정 뒤의 시간에 넣는다.
    slotKey = 'afternoon';
    win = nightDropWindow(findItineraryDay(day));
  } else if (zone.dataset.dropType === 'dest') {
    slotKey = SLOT_DEFS[zone.dataset.dropDestPeriod] ? zone.dataset.dropDestPeriod : 'afternoon';
  } else if (zone.dataset.dropMeal && SLOT_DEFS[zone.dataset.dropMeal]) {
    slotKey = zone.dataset.dropMeal;
  } else {
    // '🍴 맛집' 줄에 놓으면 아침→점심→저녁 순으로 첫 빈 칸에 넣는다.
    slotKey = firstEmptyMealSlot(findItineraryDay(day));
    if (!slotKey) { showMemoToast(t('meal-slots-full')); return { ok: false, reason: 'meal-full' }; }
  }
  var result = dd.source === 'itin'
    ? placeBlock({ mode: 'move', day: day, slotKey: slotKey, from: { day: dd.day, blockIndex: dd.blockIndex }, window: win })
    : placeBlock({ mode: 'add', day: day, slotKey: slotKey, name: dd.name, area: dd.area, kind: dd.kind, window: win });
  if (!result.ok && result.reason === 'kind-mismatch') showMemoToast(t('drop-kind-mismatch'));
  if (!result.ok && result.reason === 'noop') showMemoToast(t('place-noop'), 1500);
  return result;
}

document.addEventListener('dragstart', function(e) {
  if (touchDrag) { e.preventDefault(); return; }
  var node = e.target && e.target.nodeType !== 1 ? e.target.parentElement : e.target;
  var src = node && node.closest ? node.closest(DRAG_SOURCE_SELECTOR) : null;
  if (!src) return;
  var dd = beginDrag(src);
  if (!dd) return;
  clearDragState();
  dragData = dd;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = dd.source === 'itin' ? 'move' : 'copy';
    try {
      e.dataTransfer.setData('text/plain', dd.name);
      e.dataTransfer.setData(DRAG_MIME, '1');
    } catch (err) {}
  }
  src.classList.add('dragging');
  // 끌기 그림을 만든 뒤에 칸 강조를 켠다(바로 바꾸면 일부 브라우저가 끌기를 취소한다).
  setTimeout(function() { if (dragData === dd) markCompatibleZones(dd.kind); }, 0);
});

document.addEventListener('dragend', function() {
  // 놓기에 실패했는데 마지막 칸이 종류가 맞지 않는 칸이었다면 이유를 알려 준다.
  if (dragData && dragOverState && dragOverState.zone && !dragOverState.compatible) showMemoToast(t('drop-kind-mismatch'));
  clearDragState();
});

document.addEventListener('dragover', function(e) {
  if (!dragData) return;
  if (!hasTabimaruDrag(e)) { dragOverState = null; return; }
  var zone = zoneFromNode(e.target);
  var ok = isZoneCompatible(dragData, zone);
  dragOverState = { zone: zone, compatible: ok };
  // 우리 끌기는 칸이 아닌 곳(요청 입력칸 등)에 떨어져도 아무 일도 없게 기본 동작을 막는다.
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = ok ? (dragData.source === 'itin' ? 'move' : 'copy') : 'none';
  setDropHover(ok ? zone : null);
});

document.addEventListener('dragleave', function(e) {
  var zone = zoneFromNode(e.target);
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drop-hover');
});

document.addEventListener('drop', function(e) {
  if (!dragData) return;
  var dd = dragData;
  var ours = hasTabimaruDrag(e);
  var zone = ours ? zoneFromNode(e.target) : null;
  clearDragState();
  if (!ours) return;
  e.preventDefault();
  if (!zone) return; // 칸 바깥에 놓으면 아무것도 하지 않는다(지우지 않는다)
  applyDropToZone(dd, zone);
});

// ── 터치 끌기(Pointer Events, ☰ 손잡이를 잡았을 때만) ──
var touchDrag = null; // { pointerId, data, ghost, handle, x, y, raf, zone }
var TOUCH_EDGE_PX = 72;
var TOUCH_SCROLL_STEP = 14;

function touchZoneAt(x, y) {
  if (typeof document.elementFromPoint !== 'function') return null;
  return zoneFromNode(document.elementFromPoint(x, y));
}

function updateTouchHover() {
  if (!touchDrag) return;
  var zone = touchZoneAt(touchDrag.x, touchDrag.y);
  touchDrag.zone = zone;
  setDropHover(isZoneCompatible(touchDrag.data, zone) ? zone : null);
}

function touchEdgeStep(y) {
  var h = window.innerHeight || document.documentElement.clientHeight || 0;
  if (y < TOUCH_EDGE_PX) return -TOUCH_SCROLL_STEP;
  if (h && y > h - TOUCH_EDGE_PX) return TOUCH_SCROLL_STEP;
  return 0;
}

function touchAutoScroll() {
  if (!touchDrag) return;
  var step = touchEdgeStep(touchDrag.y);
  if (!step) { touchDrag.raf = 0; return; }
  window.scrollBy(0, step);
  updateTouchHover();
  touchDrag.raf = requestAnimationFrame(touchAutoScroll);
}

function endTouchDrag(drop) {
  var td = touchDrag;
  if (!td) return;
  touchDrag = null;
  document.removeEventListener('touchmove', blockTouchScroll, { passive: false });
  if (td.raf) cancelAnimationFrame(td.raf);
  if (td.ghost && td.ghost.parentNode) td.ghost.parentNode.removeChild(td.ghost);
  document.body.classList.remove('touch-dragging');
  try { if (td.handle.releasePointerCapture) td.handle.releasePointerCapture(td.pointerId); } catch (e) {}
  var zone = drop ? touchZoneAt(td.x, td.y) : null;
  clearDragState();
  if (zone) applyDropToZone(td.data, zone);
}

document.addEventListener('pointerdown', function(e) {
  if (e.pointerType === 'mouse' || touchDrag) return; // 마우스는 HTML5 drag를 쓴다
  var handle = e.target && e.target.closest ? e.target.closest('.drag-handle') : null;
  if (!handle || typeof document.elementFromPoint !== 'function') return;
  var src = handle.closest(DRAG_SOURCE_SELECTOR);
  var dd = beginDrag(src);
  if (!dd) return;
  e.preventDefault();
  try { if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId); } catch (err) {}
  clearDragState();
  dragData = dd;
  var ghost = document.createElement('div');
  ghost.className = 'touch-drag-ghost';
  ghost.textContent = dd.name;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.position = 'fixed';
  ghost.style.left = '0';
  ghost.style.top = '0';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '10000';
  ghost.style.transform = 'translate(' + (e.clientX + 12) + 'px,' + (e.clientY + 12) + 'px)';
  document.body.appendChild(ghost);
  document.body.classList.add('touch-dragging');
  if (src) src.classList.add('dragging');
  markCompatibleZones(dd.kind);
  touchDrag = { pointerId: e.pointerId, data: dd, ghost: ghost, handle: handle, x: e.clientX, y: e.clientY, raf: 0, zone: null };
  document.addEventListener('touchmove', blockTouchScroll, { passive: false });
});

document.addEventListener('pointermove', function(e) {
  if (!touchDrag || e.pointerId !== touchDrag.pointerId) return;
  e.preventDefault();
  touchDrag.x = e.clientX;
  touchDrag.y = e.clientY;
  touchDrag.ghost.style.transform = 'translate(' + (e.clientX + 12) + 'px,' + (e.clientY + 12) + 'px)';
  updateTouchHover();
  if (!touchDrag.raf && touchEdgeStep(e.clientY)) touchDrag.raf = requestAnimationFrame(touchAutoScroll);
}, { passive: false });

document.addEventListener('pointerup', function(e) {
  if (!touchDrag || e.pointerId !== touchDrag.pointerId) return;
  touchDrag.x = e.clientX;
  touchDrag.y = e.clientY;
  endTouchDrag(true);
});

document.addEventListener('pointercancel', function(e) {
  if (!touchDrag || e.pointerId !== touchDrag.pointerId) return;
  endTouchDrag(false);
});

// 손잡이를 잡고 끄는 동안에만 페이지 스크롤을 막는다(평소에는 막는 리스너가 없어 스크롤이 가볍다).
function blockTouchScroll(e) {
  if (touchDrag && e.cancelable) e.preventDefault();
}

// ── Itinerary Map ──

// Route Cost
// 결과는 '날|장소들|도시|언어' 키로 기억한다. 같은 조건이면 다시 요청하지 않고, 일정이 바뀌면 그날 결과를 지운다.
var routeCostCache = {};
var routeCostPending = {};

function routeCostKey(dayNum, places, city) {
  return dayNum + '|' + places.join('|') + '|' + city + '|' + currentLang;
}

function invalidateRouteCost(dayNum) {
  var prefix = String(dayNum) + '|';
  Object.keys(routeCostCache).forEach(function(k) { if (k.indexOf(prefix) === 0) delete routeCostCache[k]; });
}

function buildDayRouteOrder(dayNum) {
  if (!currentItineraryData) return [];
  var dayData = findItineraryDay(dayNum);
  if (!dayData || !dayData.blocks) return [];
  var places = [];
  var isFirstDay = (Number(dayNum) === Number(currentItineraryData.itinerary[0] && currentItineraryData.itinerary[0].day));
  var lastDay = currentItineraryData.itinerary[currentItineraryData.itinerary.length - 1];
  var isLastDay = Boolean(lastDay) && Number(dayNum) === Number(lastDay.day);
  // Day 1: start from airport, Last day: end at airport
  var airportName = '';
  if (selectedFlight && selectedFlight.legs && selectedFlight.legs[0]) {
    var arrAirport = selectedFlight.legs[0].to || '';
    var depAirport = selectedFlight.legs.length > 1 ? selectedFlight.legs[selectedFlight.legs.length - 1].from : arrAirport;
    if (isFirstDay) airportName = arrAirport + t('airport-suffix');
    else if (isLastDay && selectedFlight.tripType === 'roundtrip') airportName = depAirport + t('airport-suffix');
  }
  if (airportName && isFirstDay) {
    places.push(airportName);
  } else if (selectedStay) {
    places.push(selectedStay.name + (selectedStay.area ? ' ' + selectedStay.area : ''));
  }
  // 방문 순서 = 시작 시각 순(같으면 아침<오전<종일<점심<오후<저녁)
  var mains = [];
  dayData.blocks.forEach(function(b, i) {
    var p = parseItineraryBlock(b);
    if (p.type === 'main') mains.push({ i: i, p: p, v: blockSortValue(p) });
  });
  mains.sort(function(a, b) { return a.v.start - b.v.start || a.v.order - b.v.order || a.i - b.i; });
  mains.forEach(function(m) {
    var info = parsePlaceInfo(m.p.place);
    if (isFreeTimePlace(info.name)) return;
    places.push(info.name + (info.info ? ' ' + info.info : ''));
  });
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

function routeCostHtml(data) {
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
  return h;
}

function setRouteCostButtonBusy(dayNum, busy) {
  document.querySelectorAll('.itin-route-cost-btn').forEach(function(b) {
    if (Number(b.dataset.routeDay) !== Number(dayNum)) return;
    b.disabled = Boolean(busy);
    if (busy) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
  });
}

async function calculateDayRouteCost(dayNum) {
  var resultEl = document.getElementById('routeCostDay' + dayNum);
  if (!resultEl) return;
  var places = buildDayRouteOrder(dayNum);
  if (places.length < 2) { resultEl.innerHTML = '<div class="route-cost-empty">' + escapeHtml(t('route-need-2')) + '</div>'; return; }
  var city = (el('city') && el('city').value) || 'tokyo';
  var key = routeCostKey(dayNum, places, city);
  if (routeCostCache[key]) { resultEl.innerHTML = routeCostHtml(routeCostCache[key]); return; }
  if (routeCostPending[key]) return; // 같은 계산이 이미 진행 중
  routeCostPending[key] = true;
  setRouteCostButtonBusy(dayNum, true);
  resultEl.innerHTML = '<div class="route-cost-loading">' + escapeHtml(t('calculating')) + '</div>';
  try {
    var data = await fetchWithTimeout('/api/route-cost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ places: places, city: city, lang: currentLang }) }, 30000, async function(resp) {
      var body = await resp.json();
      if (!resp.ok || !body || body.error || !Array.isArray(body.segments)) throw new Error('route-cost');
      return body;
    });
    routeCostCache[key] = data;
    var target = document.getElementById('routeCostDay' + dayNum);
    if (target) target.innerHTML = routeCostHtml(data);
  } catch (err) {
    var failEl = document.getElementById('routeCostDay' + dayNum);
    if (failEl) failEl.innerHTML = '<div class="route-cost-empty">' + escapeHtml(t('route-cost-fail')) + '</div>';
  } finally {
    delete routeCostPending[key];
    setRouteCostButtonBusy(dayNum, false);
  }
}

// 일정을 다시 그린 뒤, 계산해 둔 이동비가 지금 일정과 같으면 그대로 다시 보여 준다(재요청 없음).
function restoreCachedRouteCosts() {
  if (!currentItineraryData) return;
  var city = (el('city') && el('city').value) || 'tokyo';
  (currentItineraryData.itinerary || []).forEach(function(d) {
    var target = document.getElementById('routeCostDay' + d.day);
    if (!target) return;
    var data = routeCostCache[routeCostKey(d.day, buildDayRouteOrder(d.day), city)];
    if (data) target.innerHTML = routeCostHtml(data);
  });
}

// ▲▼: 같은 칸 안에서 화면상 앞/뒤 항목과 자리를 바꾼다(각 자리의 시간은 그대로, 장소만 바뀐다).
function swapZoneItems(dayData, idx, direction) {
  var p = parseItineraryBlock(dayData.blocks[idx]);
  if (p.type !== 'main') return false;
  var list = periodBlocks(dayData, p.period);
  var pos = list.findIndex(function(x) { return x.index === idx; });
  var other = list[direction === 'up' ? pos - 1 : pos + 1];
  if (pos < 0 || !other) return false;
  var takeGroup = function(i) { return dayData.blocks.slice(i, i + blockGroupLength(dayData.blocks, i)); };
  var a = takeGroup(idx);
  var b = takeGroup(other.index);
  var pa = parseItineraryBlock(a[0]);
  var pb = parseItineraryBlock(b[0]);
  var ia = parsePlaceInfo(pa.place);
  var ib = parsePlaceInfo(pb.place);
  var newA = [formatPlanBlock(pa.period, pa.startTime, pa.endTime, ib.name, ib.info)].concat(b.slice(1));
  var newB = [formatPlanBlock(pb.period, pb.startTime, pb.endTime, ia.name, ia.info)].concat(a.slice(1));
  // 뒤쪽 블록부터 바꿔 넣어 앞 블록 위치가 밀리지 않게 한다.
  var first = idx < other.index ? { i: idx, len: a.length, lines: newA } : { i: other.index, len: b.length, lines: newB };
  var second = idx < other.index ? { i: other.index, len: b.length, lines: newB } : { i: idx, len: a.length, lines: newA };
  Array.prototype.splice.apply(dayData.blocks, [second.i, second.len].concat(second.lines));
  Array.prototype.splice.apply(dayData.blocks, [first.i, first.len].concat(first.lines));
  return true;
}

document.addEventListener('click', function(e) {
  var routeBtn = e.target.closest('.itin-route-cost-btn');
  if (routeBtn) { calculateDayRouteCost(Number(routeBtn.dataset.routeDay)); return; }
  var reorderBtn = e.target.closest('.itin-reorder-btn');
  if (reorderBtn && currentItineraryData) {
    var roDay = Number(reorderBtn.dataset.day);
    var roDayData = findItineraryDay(roDay);
    if (roDayData && roDayData.blocks && swapZoneItems(roDayData, Number(reorderBtn.dataset.blockIndex), reorderBtn.dataset.direction)) {
      markItineraryEdited();
      invalidateRouteCost(roDay);
      renderItineraryTimeline();
      updateItinMap();
    }
  }
});

// 지도 Day 색(흰 테두리·흰 숫자와 대비 4.5:1 이상). 식사 마커는 MEAL_MARKER_COLOR 하나로 그린다.
var DAY_COLORS = ['#bb3d29', '#2d5a86', '#3a7350', '#94560f', '#7a3b6e', '#1f6f73', '#9a2f1f', '#263b5e', '#5b7d2a', '#8a4b14'];
var MEAL_MARKER_COLOR = '#94560f';

function dayColor(day) {
  var n = Math.max(1, Number(day) || 1);
  return DAY_COLORS[(n - 1) % DAY_COLORS.length];
}

function markerColor(p) {
  return p.isMeal ? MEAL_MARKER_COLOR : dayColor(p.day);
}

// 지도 위 범례: 지도에 그린 Day마다 색 점 + (식사가 있으면) 식사 점. 마커와 같은 색 함수를 쓴다.
function renderItinMapLegend(drawnPoints) {
  var wrap = el('itinMapWrap');
  var mapEl = el('itinMap');
  if (!wrap || !mapEl) return;
  var legend = el('itinMapLegend');
  if (!legend && typeof document.createElement === 'function') {
    legend = document.createElement('div');
    legend.id = 'itinMapLegend';
    legend.className = 'itin-map-legend';
    if (mapEl.parentNode && typeof mapEl.parentNode.insertBefore === 'function') mapEl.parentNode.insertBefore(legend, mapEl);
    else wrap.appendChild(legend);
  }
  if (!legend) return;
  var points = drawnPoints || [];
  var days = [];
  var hasMeal = false;
  points.forEach(function(p) {
    if (p.isMeal) { hasMeal = true; return; }
    if (days.indexOf(Number(p.day)) < 0) days.push(Number(p.day));
  });
  days.sort(function(a, b) { return a - b; });
  var item = function(color, label) {
    return '<span class="legend-item"><span class="legend-dot" style="background:' + color + '" aria-hidden="true"></span>' + escapeHtml(label) + '</span>';
  };
  var html = days.map(function(d) { return item(dayColor(d), itinDayLabel(d)); }).join('');
  if (hasMeal) html += item(MEAL_MARKER_COLOR, t('map-legend-meal'));
  legend.innerHTML = html;
  // .itin-map-legend가 display:flex라서 .hidden 클래스로는 숨겨지지 않는다 → style로 숨긴다.
  legend.style.display = html ? '' : 'none';
}

function hideItinMapLegend() {
  var legend = el('itinMapLegend');
  if (legend) { legend.innerHTML = ''; legend.style.display = 'none'; }
}

// ── 일정 지도 ──
// 기본은 OpenStreetMap + Leaflet(무료, 키·요금 없음). 서버가 MAP_PROVIDER=google 이면 Google 지도 JS를 쓴다.
// 지도 라이브러리는 일정이 처음 생길 때 불러오고, 늦게 도착해도 준비되는 즉시 다시 그린다.
var LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
var LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
var LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
var LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
// OSM 재단 타일 정책: 서브도메인({s}.tile…) 없이 tile.openstreetmap.org 한 곳만 쓴다(operations.osmfoundation.org/policies/tiles/).
var OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
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
  return itinDayLabel(p.day) + ' ' + tPeriod(p.period) + ': ' + p.name;
}

// 위치를 모르는 장소 안내: 여행지와 맛집을 따로 센다(맛집만 빠졌으면 맛집 전용 안내).
function mapMissingNote(points, drawnPoints) {
  var drawn = drawnPoints || [];
  var missingFood = 0;
  var missingPlace = 0;
  points.forEach(function(p) {
    if (drawn.indexOf(p) >= 0) return;
    if (p.isMeal) missingFood++; else missingPlace++;
  });
  var parts = [];
  if (missingPlace > 0) parts.push(fillText(t('map-partial'), { n: missingPlace }));
  if (missingFood > 0) parts.push(fillText(t('map-food-no-coords'), { n: missingFood }));
  return parts.join(' · ');
}

async function updateItinMap() {
  var wrap = el('itinMapWrap');
  var mapEl = el('itinMap');
  if (!wrap || !mapEl) return;
  var seq = ++mapRenderSeq;
  if (!currentItineraryData || !itineraryHasContent(currentItineraryData.itinerary)) {
    wrap.classList.add('hidden');
    hideItinMapLegend();
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
    hideItinMapLegend();
    setItinMapNote(t('map-no-coords'));
    return;
  }
  ensureMapLibrary();
  if (mapLibState !== 'ready') {
    mapEl.classList.add('hidden');
    hideItinMapLegend();
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
    hideItinMapLegend();
    setItinMapNote(t('map-failed'));
    return;
  }
  if (drawn < 0 || seq !== mapRenderSeq) return;
  if (drawn === 0) {
    mapEl.classList.add('hidden');
    hideItinMapLegend();
    setItinMapNote(t('map-no-coords'));
    return;
  }
  // Google 모드는 그리면서 좌표를 채우므로, 그린 뒤의 좌표로 다시 고른다.
  var drawnPoints = points.filter(function(p) { return p.pos; });
  renderItinMapLegend(drawnPoints);
  setItinMapNote(mapMissingNote(points, drawnPoints));
}

function renderLeafletItinMap(mapEl, points) {
  var L = window.L;
  if (!itinLeafletMap) {
    itinLeafletMap = L.map(mapEl, { scrollWheelZoom: false });
    L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(itinLeafletMap);
    itinLeafletLayer = L.layerGroup().addTo(itinLeafletMap);
  }
  itinLeafletLayer.clearLayers();
  itinLeafletMap.invalidateSize();
  var latlngs = [];
  var byDay = {};
  var labelIdx = 0;
  points.forEach(function(p) {
    labelIdx++;
    var color = markerColor(p);
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
    L.polyline(byDay[d], { color: dayColor(d), weight: 3, opacity: 0.7 }).addTo(itinLeafletLayer);
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
    var pinColor = markerColor(p);
    itinMarkers.push(new google.maps.Marker({
      position: p.pos,
      map: itinMap,
      title: markerTitle(p),
      label: { text: p.isMeal ? '' : String(labelIdx), color: '#fff', fontWeight: '700', fontSize: '11px' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: pinColor,
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
      strokeColor: dayColor(d),
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
      budget: currentBudgetTier(),
      limit: 10,
      lang: currentLang
    };
    var data = await postJson('/api/dest-search', payload);
    if (seq !== destSearchSeq) return;
    renderDestSearchCards(data.destinations || []);
    renderSourceNote('destSearchSourceNote', 'destSearch', sectionInfo('destSearch', data));
    recordSearchHistory('dest', { city: payload.city, theme: payload.theme });
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

// ── [+ 일정에 넣기] 버튼(추천 카드·탐색 카드 공용) ──
function addSourceList(source) {
  if (source === 'rec') return latestDestList || [];
  if (source === 'recFood') return latestRecFoodList || [];
  if (source === 'destSearch') return latestDestSearchList || [];
  if (source === 'foodSearch') return (latestFoodSearchList && latestFoodSearchList.length ? latestFoodSearchList : latestFoodList) || [];
  return [];
}

document.addEventListener('click', function(e) {
  var addBtn = e.target.closest('.add-to-plan-btn');
  if (!addBtn) return;
  var addType = addBtn.dataset.addType === 'food' ? 'food' : 'dest';
  var place = addSourceList(addBtn.dataset.addSource)[Number(addBtn.dataset.addIndex)];
  if (!place) return;
  if (!currentItineraryData) { showMemoToast(t('err-need-plan-first')); return; }
  showAddToPlanModal(place.name, { addType: addType, area: place.area || place.city || '' });
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
  var item = null;
  if (pSource === 'destSearch') item = (latestDestSearchList || [])[pIdx];
  else if (pSource === 'foodSearch') item = addSourceList('foodSearch')[pIdx];
  if (!item) return;

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
    document.querySelectorAll('.search-tab').forEach(function(t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
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
    if (!airline && !flightNum) {
      showMemoToast(t('err-airline-required'), 3500);
      if (typeof el('manualFlightAirline').focus === 'function') el('manualFlightAirline').focus();
      return;
    }
    var fromAirport = el('from') ? el('from').value.split(' ')[0] : 'ICN';
    var toAirport = el('to') ? el('to').value.split(' ')[0] : 'NRT';
    var departDate = el('departDate') ? el('departDate').value : '';
    // 편도로 검색 중이면 귀국 구간을 만들지 않는다(복귀일 칸은 숨어 있어도 값이 남아 있다).
    var isRoundTrip = currentTripType === 'roundtrip';
    var returnDate = isRoundTrip && el('returnDate') ? el('returnDate').value : '';
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
      tripType: isRoundTrip && returnDate ? 'roundtrip' : 'oneway',
      totalPriceKRW: price, totalDurationMin: 150, totalStops: 0, manual: true
    };
    if (isRoundTrip && returnDate) manualFlight.legs.push({ from: toAirport, to: fromAirport, date: returnDate, departureTime: returnDepartTime, arrivalTime: returnArrival, airline: airline, flightNumber: '' });
    manualFlights.unshift(manualFlight);
    selectedFlightId = manualFlight._id;
    selectedFlight = manualFlight;
    renderFlightCards(true);
    // 고친 일정이 없으면 항공 시각에 맞춰 다시 만들고, 고친 일정이면 고정 블록만 다시 그린 뒤 안내한다.
    regenerateAfterTripChange({ flight: buildFlightPayload(manualFlight) });
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
    if (!name) {
      showMemoToast(t('err-stay-required'), 3500);
      if (typeof el('manualStayName').focus === 'function') el('manualStayName').focus();
      return;
    }
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
    manualStays.unshift(manualStay);
    selectedStayId = manualStay.id;
    selectedStay = manualStay;
    renderStayCards();
    regenerateAfterTripChange({});
    ['manualStayName','manualStayArea','manualStayPrice','manualStayRating','manualStayUrl'].forEach(function(id) { el(id).value = ''; });
  });
}

// Date validation
if (el('returnDate')) {
  el('returnDate').addEventListener('change', function() {
    var dep = el('departDate') ? el('departDate').value : '';
    var ret = this.value;
    if (dep && ret && ret < dep) {
      showMemoToast(t('err-return-date'), 3500);
      this.value = dep;
    }
  });
}
if (el('checkOut')) {
  el('checkOut').addEventListener('change', function() {
    var ci = el('checkIn') ? el('checkIn').value : '';
    var co = this.value;
    if (ci && co && co <= ci) {
      showMemoToast(t('err-checkout-date'), 3500);
      this.value = addDays(ci, 1) || ci;
    }
  });
}

// ── 안내 띠(.notice-banner): 일정 다시 만들기 안내·여행 조건 변경·저장 안 한 초안 ──
function ensureNoticeBanner(id) {
  var node = el(id);
  if (node) return node;
  node = document.createElement('div');
  node.id = id;
  node.className = 'notice-banner hidden';
  node.setAttribute('role', 'status');
  if (id === 'planRegenHint') {
    var ctrl = document.querySelector('.plan-controls');
    if (ctrl && ctrl.parentNode) { ctrl.parentNode.insertBefore(node, ctrl.nextSibling); return node; }
  } else {
    var result = el('planResult');
    if (result && result.parentNode) { result.parentNode.insertBefore(node, result); return node; }
  }
  if (document.body) document.body.appendChild(node);
  return node;
}

// key 문구 + 버튼들([{ key, action }])을 띄운다. vars가 없으면 언어를 바꿀 때 data-i18n으로 저절로 바뀐다.
function showNoticeBanner(id, key, buttons, vars) {
  var node = ensureNoticeBanner(id);
  if (!node) return null;
  var text = vars ? fillText(t(key), vars) : t(key);
  var html = '<span class="notice-text"' + (vars ? '' : ' data-i18n="' + key + '"') + '>' + escapeHtml(text) + '</span>';
  if (buttons && buttons.length) {
    html += '<span class="notice-actions">' + buttons.map(function(b) {
      return '<button type="button" class="notice-btn' + (b.primary ? ' primary' : '') + '" data-notice-action="' + b.action + '" data-i18n="' + b.key + '">' + escapeHtml(t(b.key)) + '</button>';
    }).join('') + '</span>';
  }
  node.innerHTML = html;
  node.dataset.noticeKey = key;
  node.classList.remove('hidden');
  node.hidden = false;
  return node;
}

function hideNoticeBanner(id) {
  var node = el(id);
  if (!node) return;
  node.classList.add('hidden');
  node.hidden = true;
}

// ── 출발일·일수 변경(FN-09) ──
// 일정이 있는데 출발일·일수가 일정과 달라지면 어떻게 맞출지 묻는 띠를 띄운다.
function tripConditionsMismatch() {
  var it = currentItineraryData && Array.isArray(currentItineraryData.itinerary) ? currentItineraryData.itinerary : [];
  if (it.length === 0) return false;
  var start = el('startDate') ? el('startDate').value : '';
  var days = Number(el('days') ? el('days').value : 0) || 0;
  var first = it[0] && it[0].date;
  return Boolean((start && first && start !== first) || (days && days !== it.length));
}

function updateTripChangeBanner() {
  if (!tripConditionsMismatch()) { hideNoticeBanner('tripChangeBanner'); return; }
  showNoticeBanner('tripChangeBanner', 'trip-changed', [
    { key: 'btn-shift-dates', action: 'shift-dates' },
    { key: 'btn-fit-days', action: 'fit-days' },
    { key: 'btn-rebuild', action: 'rebuild', primary: true }
  ]);
}

function onTripDatesChanged() {
  syncDatesToDependentForms();
  renderBudgetSummary();
  if (lastWeather) renderWeatherWidget(lastWeather.daily, cityNameByKey(lastWeather.cityKey));
  updateTripChangeBanner();
}

el('startDate').addEventListener('change', onTripDatesChanged);
el('days').addEventListener('change', function() {
  var input = el('days');
  var raw = Number(input.value);
  var clamped = Math.max(1, Math.min(10, Math.round(raw) || 1));
  if (String(clamped) !== String(input.value).trim()) {
    input.value = clamped;
    showMemoToast(t('days-clamped'));
  }
  onTripDatesChanged();
});

// [날짜만 옮기기]: 일정 내용은 그대로 두고 날짜만 새 출발일부터 이어 붙인다.
function shiftItineraryDates() {
  if (!currentItineraryData || !Array.isArray(currentItineraryData.itinerary)) return;
  var start = el('startDate').value || defaultStartDate();
  currentItineraryData.itinerary.forEach(function(d, i) { d.date = addDays(start, i); });
  markItineraryEdited();
  renderItineraryTimeline();
  updateItinMap();
  updateTripChangeBanner();
}

// [일수 맞추기]: 빈 날을 붙이거나 끝의 날을 지운다(지울 날에 항목이 있으면 묻는다).
function fitItineraryDays() {
  if (!currentItineraryData || !Array.isArray(currentItineraryData.itinerary)) return;
  var it = currentItineraryData.itinerary;
  var target = Math.max(1, Math.min(10, Number(el('days').value) || it.length));
  var base = (it[0] && it[0].date) || el('startDate').value || defaultStartDate();
  if (target < it.length) {
    var dropped = it.slice(target);
    if (itineraryHasContent(dropped) && !confirm(fillText(t('confirm-trim-days'), { n: dropped.length }))) return;
    it.splice(target);
  } else {
    var lastDayNum = it.length ? Number(it[it.length - 1].day) || it.length : 0;
    for (var i = it.length; i < target; i++) {
      lastDayNum++;
      it.push({ day: lastDayNum, date: addDays(base, i), blocks: [] });
    }
  }
  markItineraryEdited();
  renderItineraryTimeline();
  updateItinMap();
  updateTripChangeBanner();
}

document.addEventListener('click', function(e) {
  var btn = e.target && e.target.closest ? e.target.closest('[data-notice-action]') : null;
  if (!btn) return;
  var action = btn.dataset.noticeAction;
  if (action === 'shift-dates') { shiftItineraryDates(); return; }
  if (action === 'fit-days') { fitItineraryDays(); return; }
  if (action === 'rebuild') { el('btnPlan').click(); return; }
  if (action === 'draft-restore') { restoreDraft(); return; }
  if (action === 'draft-discard') { discardDraft(); return; }
});

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

// 글자 없는 아이콘 버튼(✕ 닫기 등)에는 aria-label과 같은 title을 단다(마우스를 올리면 뜻이 보이게).
function ensureIconButtonTitles() {
  Array.prototype.forEach.call(document.querySelectorAll('.side-panel-close'), function(b) {
    if (!b.getAttribute('data-i18n-title')) b.setAttribute('data-i18n-title', 'btn-close');
    b.title = t('btn-close');
  });
}

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

// 도시 목록이 생긴 뒤(처음 또는 [다시 시도] 뒤) 도시에 딸린 기본값을 채운다.
function onCitiesLoaded() {
  var initialCity = cityCatalog.find((c) => c.key === el('city').value);
  if (initialCity && initialCity.airport && !el('to').value) el('to').value = formatAirportDisplay(initialCity.airport);
  resetSegments();
  loadKlookWidget(el('city').value || 'tokyo');
  if (currentLang !== 'ko') relabelCityOptions();
}

(async () => {
  applyBrand();
  // await 이후에 실행되는 코드는 파일 끝의 언어 사전(I18N)이 준비된 뒤에 돈다.
  await Promise.resolve();
  applyBrand();
  renderInitialEmptyStates();
  updatePlanControls();
  renderPlanSelectionCards();
  renderStayFilterChecks({});
  renderFlightFilterChecks({});
  el('from').value = formatAirportDisplay(resolveAirportCode(el('from').value));
  setTripTab('oneway');
  loadMapConfig();          // 무료 설정 조회(지도 라이브러리는 일정이 생길 때 불러옴)
  initExchangeRateChip();   // 무료 환율 조회
  var citiesOk = await initCityOptions();
  applyBrand();
  onCitiesLoaded();
  ensureCheckOutDate();
  if (citiesOk) offerDraftRestore();
})();

// ═══ 편집 중 일정 자동 보관(기기 안의 '저장하지 않은 초안' 1개) ═══
// '내 일정' 저장(서버)과는 별개다. 새로고침·탭 닫기로 잃지 않게 500ms 뒤 localStorage에 넣는다.
var DRAFT_KEY = 'tabimaru.draft.v1';
var DRAFT_MAX_AGE_MS = 14 * 86400000;
var DRAFT_MAX_CHARS = 1.5 * 1024 * 1024;
var draftSaveTimer = null;
var pendingDraft = null;

function scheduleDraftSave() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(function() { draftSaveTimer = null; saveDraftNow(); }, 500);
}

function saveDraftNow() {
  if (!currentItineraryData || !itineraryHasContent(currentItineraryData.itinerary)) return;
  try {
    var it = Object.assign({}, currentItineraryData);
    delete it._skipMealStrip;
    var text = JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      itinerary: it,
      latestDestList: latestDestList || [],
      latestRecFoodList: latestRecFoodList || [],
      selectedFlight: selectedFlight || null,
      selectedStay: selectedStay || null,
      form: {
        city: el('city') ? el('city').value : '',
        startDate: el('startDate') ? el('startDate').value : '',
        days: el('days') ? el('days').value : '',
        theme: el('theme') ? el('theme').value : '',
        budget: currentBudgetTier()
      }
    });
    if (text.length > DRAFT_MAX_CHARS) return;
    localStorage.setItem(DRAFT_KEY, text);
  } catch (e) {}
}

function readDraft() {
  try {
    var raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d || d.v !== 1 || !d.itinerary || !itineraryHasContent(d.itinerary.itinerary)) return null;
    var age = Date.now() - Number(d.savedAt);
    if (!(age >= 0 && age < DRAFT_MAX_AGE_MS)) return null;
    return d;
  } catch (e) {
    return null;
  }
}

function formatDraftTime(ts) {
  try {
    return new Date(Number(ts)).toLocaleString(localeTag(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function showDraftBanner() {
  if (!pendingDraft) return;
  showNoticeBanner('draftRestoreBanner', 'draft-found', [
    { key: 'btn-draft-restore', action: 'draft-restore', primary: true },
    { key: 'btn-draft-discard', action: 'draft-discard' }
  ], { t: formatDraftTime(pendingDraft.savedAt) });
}

// 첫 화면: 14일 안의 초안이 있으면 안내만 띄운다(자동으로 그리지 않는다 → 유료 호출 0회, 지도도 그때까지 안 불러옴).
function offerDraftRestore() {
  if (currentItineraryData) return;
  pendingDraft = readDraft();
  if (pendingDraft) showDraftBanner();
}

function hasSelectOption(id, value) {
  var select = el(id);
  return Boolean(select && Array.from(select.options || []).some(function(o) { return o.value === value; }));
}

// [이어서 편집]: 폼 → 도시 맞춤 → 카드·일정을 저장된 모습 그대로(_skipMealStrip) 그린다. AI·유료 호출 없음.
function restoreDraft() {
  var d = pendingDraft || readDraft();
  pendingDraft = null;
  hideNoticeBanner('draftRestoreBanner');
  if (!d) return;
  var f = d.form || {};
  if (f.city && hasSelectOption('city', f.city)) el('city').value = f.city;
  if (f.startDate) el('startDate').value = f.startDate;
  if (f.days) el('days').value = f.days;
  if (f.theme && hasSelectOption('theme', f.theme)) el('theme').value = f.theme;
  resetAiIntentState(false);
  // 예산 단계는 초안에 함께 보관한다(다시 만들 때도 저예산 등 조건이 이어지게).
  if (f.budget) setBudgetTier(f.budget);
  syncCityDependents(el('city').value);
  syncDatesToDependentForms();

  selectedFlight = d.selectedFlight || null;
  selectedFlightId = selectedFlight && selectedFlight._id ? selectedFlight._id : '';
  if (selectedFlight && selectedFlight.manual && !manualFlights.some(function(x) { return x._id === selectedFlight._id; })) manualFlights.unshift(selectedFlight);
  selectedStay = d.selectedStay || null;
  selectedStayId = selectedStay && selectedStay.id ? selectedStay.id : '';
  if (selectedStay && selectedStay.manual && !manualStays.some(function(x) { return x.id === selectedStay.id; })) manualStays.unshift(selectedStay);

  latestDestList = Array.isArray(d.latestDestList) ? d.latestDestList : [];
  if (latestDestList.length) renderCards('destCards', latestDestList, 'dest');
  latestRecFoodList = Array.isArray(d.latestRecFoodList) ? d.latestRecFoodList : [];
  if (latestRecFoodList.length) renderRecFoodCards(latestRecFoodList);
  if (manualFlights.length) renderFlightCards(true);
  if (manualStays.length) renderStayCards();

  var data = d.itinerary;
  data._skipMealStrip = true;
  _itinHistory.length = 0;
  _itinHistoryIdx = -1;
  renderItinerary(data);
  showMemoToast(t('load-success'));
}

function discardDraft() {
  pendingDraft = null;
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  hideNoticeBanner('draftRestoreBanner');
}

// 직접 고친 일정이 있으면 탭을 닫거나 새로고침할 때 브라우저가 한 번 묻는다(초안도 바로 보관).
window.addEventListener('beforeunload', function(e) {
  if (!itineraryIsEdited()) return;
  if (draftSaveTimer) { clearTimeout(draftSaveTimer); draftSaveTimer = null; }
  saveDraftNow();
  e.preventDefault();
  e.returnValue = '';
});

// ═══ 창·패널 공통(FN-12): Esc로 닫기, 연 버튼으로 포커스 돌려주기, dialog 역할 ═══
var dialogOpeners = {};
var DIALOG_PARTS = {
  addToPlanModal: { box: '.plan-modal', heading: 'h4', headingId: 'modalHeading' },
  loginModal: { box: '.login-modal', heading: 'h4', headingId: 'loginModalTitle' },
  saveModal: { box: '.login-modal', heading: 'h4', headingId: 'saveModalTitle' }
};

function insideNode(container, node) {
  return Boolean(container && node && (container === node || (typeof container.contains === 'function' && container.contains(node))));
}

function isShown(node) {
  return Boolean(node && (node.offsetWidth || node.offsetHeight || (node.getClientRects && node.getClientRects().length)));
}

function ensureDialogA11y(id) {
  var root = el(id);
  if (!root) return;
  var spec = DIALOG_PARTS[id];
  var box = root;
  if (spec) {
    var inner = root.querySelector(spec.box);
    if (inner && insideNode(root, inner)) box = inner;
  }
  var heading = root.querySelector(spec ? spec.heading : 'h3');
  if (!insideNode(root, heading)) heading = null;
  if (!box.getAttribute('role')) box.setAttribute('role', 'dialog');
  if (!box.getAttribute('aria-modal')) box.setAttribute('aria-modal', 'true');
  if (heading) {
    if (!heading.id) heading.id = spec ? spec.headingId : id + 'Title';
    if (!box.getAttribute('aria-labelledby')) box.setAttribute('aria-labelledby', heading.id);
  }
}

function focusFirstIn(container, selectors) {
  if (!container) return;
  for (var i = 0; i < selectors.length; i++) {
    var nodes = container.querySelectorAll(selectors[i]);
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      if (insideNode(container, n) && isShown(n) && !n.disabled && typeof n.focus === 'function') {
        try { n.focus(); } catch (e) {}
        return;
      }
    }
  }
}

function openDialog(id) {
  var active = document.activeElement;
  dialogOpeners[id] = active && active !== document.body ? active : null;
  if (id === 'addToPlanModal') lastPlacedRef = null;
  ensureDialogA11y(id);
}

function closeDialog(id) {
  var target = dialogOpeners[id];
  dialogOpeners[id] = null;
  if (target && (target.isConnected === false || !document.documentElement.contains(target))) target = null;
  // 일정 항목에서 연 창이면 다시 그려진 같은 항목(또는 방금 넣은 항목)의 [옮기기]로 돌아간다.
  if (!target && id === 'addToPlanModal' && lastPlacedRef) {
    var placed = placedBlockElement(lastPlacedRef.day, lastPlacedRef.blockIndex);
    target = placed ? placed.querySelector('.itin-move-btn') : null;
  }
  if (target && typeof target.focus === 'function') { try { target.focus(); } catch (e) {} }
}

function openLoginModal() {
  var modal = el('loginModal');
  if (!modal) return;
  openDialog('loginModal');
  modal.classList.remove('hidden');
  focusFirstIn(modal, ['a.login-btn', '#loginModalClose']);
}

function closeLoginModal() {
  var modal = el('loginModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  closeDialog('loginModal');
}

// 닫힌 사이드 패널은 Tab 순서에서 뺀다(inert).
function setPanelInert(panel, inert) {
  panel.inert = Boolean(inert);
  if (inert) panel.setAttribute('aria-hidden', 'true');
  else panel.removeAttribute('aria-hidden');
}

// --- Side Panel Toggle ---
function togglePanel(panelId) {
  var panel = document.getElementById(panelId);
  if (!panel) return;
  var isOpen = panel.classList.contains('show');
  var opener = document.activeElement;
  // Close all open panels
  document.querySelectorAll('.side-panel.show').forEach(function(p) {
    p.classList.remove('show');
    setPanelInert(p, true);
    if (p !== panel) dialogOpeners[p.id] = null;
  });
  var oldBackdrop = document.querySelector('.side-panel-backdrop');
  if (oldBackdrop) oldBackdrop.remove();
  if (!isOpen) {
    ensureDialogA11y(panelId);
    panel.classList.remove('hidden');
    panel.classList.add('show');
    setPanelInert(panel, false);
    dialogOpeners[panelId] = opener && opener !== document.body && !insideNode(panel, opener) ? opener : (dialogOpeners[panelId] || null);
    var backdrop = document.createElement('div');
    backdrop.className = 'side-panel-backdrop';
    backdrop.addEventListener('click', function() { togglePanel(panelId); });
    document.body.appendChild(backdrop);
    focusFirstIn(panel, ['.side-panel-close']);
    // 여는 전환(visibility) 중이면 포커스가 안 들어가므로 전환 뒤에 한 번 더 시도한다.
    [16, 60, 150, 300].forEach(function(ms) {
      setTimeout(function() {
        if (panel.classList.contains('show') && !insideNode(panel, document.activeElement)) focusFirstIn(panel, ['.side-panel-close']);
      }, ms);
    });
  } else {
    closeDialog(panelId);
  }
}
// Use event delegation for close buttons (panels are after <script> in DOM)
document.addEventListener('click', function(e) {
  var closeBtn = e.target.closest('.side-panel-close');
  if (closeBtn && closeBtn.dataset.closePanel) {
    togglePanel(closeBtn.dataset.closePanel);
  }
});

// Esc: 가장 위에 열린 것 하나를 닫는다(일정 추가 창 → 저장 창 → 로그인 창 → 사이드 패널).
var activeSaveModalCleanup = null;
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape' && e.key !== 'Esc') return;
  var add = el('addToPlanModal');
  if (add && !add.classList.contains('hidden')) { e.preventDefault(); hideAddToPlanModal(); return; }
  var save = el('saveModal');
  if (save && !save.classList.contains('hidden')) { e.preventDefault(); if (activeSaveModalCleanup) activeSaveModalCleanup(); else save.classList.add('hidden'); return; }
  var login = el('loginModal');
  if (login && !login.classList.contains('hidden')) { e.preventDefault(); closeLoginModal(); return; }
  var panel = document.querySelector('.side-panel.show');
  if (panel && panel.id) { e.preventDefault(); togglePanel(panel.id); }
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
      rows += '<div class="phrase-ja" lang="ja">' + escapeHtml(p.ja) + '</div>';
      rows += '<div class="phrase-roma" lang="ja-Latn">' + escapeHtml(p.roma) + '</div></div>';
    }
    if (rows) html += '<div class="phrase-category"><div class="phrase-category-title">' + escapeHtml(catName) + '</div>' + rows + '</div>';
  }
  container.innerHTML = html || '<div>' + escapeHtml(t('phrases-none')) + '</div>';
}

// 클립보드 복사(공용): 성공·실패 모두 토스트로 알리고, 거부돼도 처리되지 않은 오류를 남기지 않는다.
function copyTextToClipboard(text, doneKey) {
  var clip = navigator.clipboard;
  if (!clip || typeof clip.writeText !== 'function') {
    showMemoToast(t('copy-fail'));
    return Promise.resolve(false);
  }
  var p;
  try { p = clip.writeText(String(text || '')); } catch (e) { p = Promise.reject(e); }
  return Promise.resolve(p).then(function() {
    showMemoToast(t(doneKey || 'copy-done'));
    return true;
  }).catch(function() {
    showMemoToast(t('copy-fail'));
    return false;
  });
}

document.addEventListener('click', function(e) {
  if (e.target.classList && e.target.classList.contains('phrase-copy')) {
    var text = e.target.dataset.copy;
    if (text) copyTextToClipboard(text, 'copy-done');
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
  // 예보는 오늘부터 최대 16일 치다. 여행 날짜가 그 밖이면(전부 또는 일부) 그 사실을 먼저 알린다.
  var rangeNote = '';
  if (startDate && days > 0 && tripDays.length < days) {
    rangeNote = tripDays.length === 0 ? t('weather-out-of-range') : fillText(t('weather-partial-range'), { n: tripDays.length, d: days });
  }
  if (rangeNote) html = '<div class="source-note weather-range-note" role="note">' + escapeHtml(rangeNote) + '</div>' + html;
  html += weatherCreditHtml();

  // Update widget and panel
  var widget = document.getElementById('weatherContent');
  if (widget) widget.innerHTML = '<strong>' + (cityLabel || '') + '</strong> ' + html;
  var widgetWrap = document.getElementById('weatherWidget');
  if (widgetWrap) widgetWrap.classList.remove('hidden');

  var panelContent = document.getElementById('weatherPanelContent');
  if (panelContent) panelContent.innerHTML = '<h4>' + fillText(escapeHtml(t('weather-days')), { city: cityLabel || '', n: daily.time.length }) + '</h4>' + html;
}

// btnWeather: handled by toolbar delegation below

// --- 5. EXPORT / SHARE ---
function buildItineraryText(format) {
  if (!currentItineraryData || !currentItineraryData.itinerary) return t('export-no-plan');
  var md = format === 'markdown';
  var lines = [];
  var docTitle = shareTitle();
  lines.push(md ? '# ' + docTitle : '=== ' + docTitle + ' ===');
  var summaryLine = planSummaryText(currentItineraryData);
  if (summaryLine) lines.push(md ? '> ' + summaryLine : summaryLine);
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
    var dayHeading = itinDayLabel(day.day) + (day.date ? ' (' + day.date + ')' : '');
    lines.push(md ? '## ' + dayHeading : '--- ' + dayHeading + ' ---');
    var groups = groupItineraryBlocks(day.blocks || []);
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      if (g.type === 'main') {
        var info = parsePlaceInfo(g.place);
        var timeText = padTime(g.startTime) + '–' + padTime(g.endTime);
        var prefix = md ? '- **' + tPeriod(g.period) + '** ' + timeText + ' ' : '  [' + tPeriod(g.period) + ' ' + timeText + '] ';
        var suffix = md ? info.name + (info.info ? ' _(' + info.info + ')_' : '') : info.name + (info.info ? ' (' + info.info + ')' : '');
        lines.push(prefix + suffix);
      } else if (g.type === 'plain' && g.text) {
        // '도시 이동: 오사카 → 교토' 같은 안내 줄도 함께 내보낸다.
        lines.push(md ? '- ' + g.text : '  ' + g.text);
      }
    }
    lines.push('');
  }

  // 예상 비용: 화면의 '예상 비용 요약'과 같은 계산(computeBudget). 항공·숙소를 고르지 않아도 예상치를 넣는다.
  var b = computeBudget();
  var bullet = md ? '- ' : '';
  lines.push(md ? '## 💰 ' + t('export-cost') : '[ ' + t('export-cost') + ' ]');
  lines.push(bullet + t('cost-flight-line') + (b.flight ? formatKRW(b.flight) : t('not-selected')));
  lines.push(bullet + t('cost-stay-line') + (b.stay ? formatKRW(b.stay) : t('not-selected')));
  lines.push(bullet + t('cost-food-line') + formatKRW(b.meal));
  lines.push(bullet + t('cost-transport-line') + formatKRW(b.transport));
  lines.push(bullet + t('cost-activity-line') + formatKRW(b.activity));
  lines.push(bullet + (md ? '**' + t('cost-total-line') + formatKRW(b.total) + '**' : t('cost-total-line') + formatKRW(b.total)));
  lines.push(budgetTierLabel(b.tier) + ' ' + t('budget-note') + b.days + t('budget-note2'));

  return lines.join('\n');
}

// Export/Share - event delegation (these elements are after <script> in DOM)
document.addEventListener('click', function(e) {
  var tgt = e.target.closest('#btnExportPlan, #btnPlanExport, #btnPlanSave, #btnCopyText, #btnCopyMarkdown, #btnShareLink, #btnChecklist, #btnEmergency, #btnPhrases, #btnWeather');
  if (!tgt) return;
  if (tgt.disabled) return;

  // 일정 옆 [💾 저장]: 로그인했으면 저장 창, 아니면 로그인 창 + 안내(UX-04)
  if (tgt.id === 'btnPlanSave') {
    if (currentUser) { savePlanToServer(); return; }
    openLoginModal();
    showMemoToast(t('login-to-save'), 4000);
    return;
  }

  if (tgt.id === 'btnExportPlan' || tgt.id === 'btnPlanExport') {
    var preview = document.getElementById('exportPreview');
    if (preview) preview.textContent = buildItineraryText('text');
    togglePanel('exportPanel');
    return;
  }
  if (tgt.id === 'btnCopyText') {
    var text = buildItineraryText('text');
    copyTextToClipboard(text, 'copy-text-done');
    var p2 = document.getElementById('exportPreview');
    if (p2) p2.textContent = text;
    return;
  }
  if (tgt.id === 'btnCopyMarkdown') {
    var md = buildItineraryText('markdown');
    copyTextToClipboard(md, 'copy-md-done');
    var p3 = document.getElementById('exportPreview');
    if (p3) p3.textContent = md;
    return;
  }
  if (tgt.id === 'btnShareLink') {
    var st = buildItineraryText('text');
    if (navigator.share) {
      // 사용자가 공유 창을 닫은 것(AbortError)은 무시하고, 그 밖의 실패는 복사로 대신한다.
      Promise.resolve().then(function() { return navigator.share({ title: shareTitle(), text: st }); }).catch(function(err) {
        if (err && err.name === 'AbortError') return;
        copyTextToClipboard(st, 'copy-itin-done');
      });
    } else {
      copyTextToClipboard(st, 'copy-itin-done');
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
    : code === 'not_allowed' ? t('auth-err-not-allowed')
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
  var byNumber = function(a, b) { return Number(a) - Number(b); };
  var tooMany = {};       // \uC5EC\uD589\uC9C0 \uC218 \u2192 [\uB0A0]
  var noMeal = [];
  var alldayMixed = [];
  var overlaps = [];      // { d, a, b }: 같은 날 시간이 겹치는 반나절 여행지 한 쌍
  var placeDays = {};     // \uC815\uADDC\uD654\uD55C \uC7A5\uC18C \uC774\uB984 \u2192 { name, days: [\uB0A0(\uAC19\uC740 \uB0A0 \uB450 \uBC88\uC774\uBA74 \uB450 \uBC88)] }
  var placeOrder = [];
  var planDays = currentItineraryData.itinerary;

  planDays.forEach(function(day) {
    var dayNum = Number(day && day.day);
    var mains = groupItineraryBlocks((day && day.blocks) || []).filter(function(g) { return g.type === 'main'; });
    // \uC790\uC720 \uC77C\uC815\uC740 \uC7A5\uC18C\uAC00 \uC544\uB2C8\uB77C\uC11C \uC138\uC9C0 \uC54A\uB294\uB2E4.
    var sights = mains.filter(function(g) { return !isMealPeriod(g.period) && !isFreeTimePlace(parsePlaceInfo(g.place).name); });
    var meals = mains.filter(function(g) { return isMealPeriod(g.period); });
    if (sights.length > 3) (tooMany[sights.length] = tooMany[sights.length] || []).push(dayNum);
    if (sights.length > 0 && meals.length === 0) noMeal.push(dayNum);
    if (sights.length > 1 && sights.some(function(g) { return g.period === '\uC885\uC77C'; })) alldayMixed.push(dayNum);
    // \uBC18\uB098\uC808 \uC5EC\uD589\uC9C0\uB07C\uB9AC \uC2DC\uAC04\uC774 \uACB9\uCE58\uBA74 \uD55C \uC30D\uC744 \uC54C\uB9B0\uB2E4(\uC885\uC77C\uACFC \uACB9\uCE58\uB294 \uACBD\uC6B0\uB294 \uC704 '\uC885\uC77C' \uC548\uB0B4\uAC00 \uB9E1\uB294\uB2E4).
    var halfRanges = sightRangesOfDay(day, -1).filter(function(r) { return r.period !== '\uC885\uC77C'; });
    for (var hr = 1; hr < halfRanges.length; hr++) {
      var prevR = halfRanges.slice(0, hr).filter(function(r) { return r.e > halfRanges[hr].s; })[0];
      if (prevR) { overlaps.push({ d: dayNum, a: prevR.name, b: halfRanges[hr].name }); break; }
    }
    sights.forEach(function(g) {
      var name = parsePlaceInfo(g.place).name;
      var key = normalizePlaceKey(name);
      if (!key) return;
      if (!placeDays[key]) { placeDays[key] = { name: name, days: [] }; placeOrder.push(key); }
      placeDays[key].days.push(dayNum);
    });
  });

  // \uAC19\uC740 \uC885\uB958\uB294 \uB0A0\uC9DC\uB97C \uBAA8\uC544 \uD55C \uC904\uB85C(\uC5EC\uD589\uC9C0 \uC218\uB294 \uAC19\uC740 \uC218\uB07C\uB9AC)
  Object.keys(tooMany).sort(byNumber).forEach(function(n) {
    alerts.push({ type: 'warn', text: fillText(t('alert-too-many'), { d: dayListLabel(tooMany[n]), n: n }) });
  });
  if (alldayMixed.length) alerts.push({ type: 'warn', text: fillText(t('alert-allday'), { d: dayListLabel(alldayMixed) }) });
  overlaps.forEach(function(o) {
    alerts.push({ type: 'warn', text: fillText(t('alert-time-overlap'), { d: itinDayLabel(o.d), a: o.a, b: o.b }) });
  });
  if (noMeal.length) alerts.push({ type: 'info', text: fillText(t('alert-no-meal'), { d: dayListLabel(noMeal) }) });

  // \uC911\uBCF5 \uC7A5\uC18C: (\uC7A5\uC18C, \uB0A0\uC9DC \uBB36\uC74C)\uB9C8\uB2E4 \uD55C \uBC88\uB9CC. \uB2E4\uB978 \uB0A0\uC5D0 \uACB9\uCE5C \uAC83\uACFC \uAC19\uC740 \uB0A0 \uB450 \uBC88 \uB4E0 \uAC83\uC744 \uB530\uB85C \uC54C\uB9B0\uB2E4.
  var reported = new Set();
  placeOrder.forEach(function(key) {
    var rec = placeDays[key];
    if (rec.days.length < 2) return;
    var uniq = rec.days.filter(function(d, i) { return rec.days.indexOf(d) === i; }).sort(byNumber);
    var sameDay = uniq.filter(function(d) { return rec.days.filter(function(x) { return x === d; }).length > 1; });
    var sameKey = 'same|' + key + '|' + sameDay.join(',');
    if (sameDay.length && !reported.has(sameKey)) {
      reported.add(sameKey);
      alerts.push({ type: 'info', text: fillText(t('alert-dup-same-day'), { p: rec.name, d: dayListLabel(sameDay) }) });
    }
    var crossKey = 'cross|' + key + '|' + uniq.join(',');
    if (uniq.length > 1 && !reported.has(crossKey)) {
      reported.add(crossKey);
      alerts.push({ type: 'info', text: fillText(t('alert-dup'), { p: rec.name, d: dayListLabel(uniq) }) });
    }
  });

  // Flight timing check
  if (selectedFlight && selectedFlight.legs) {
    var firstLeg = selectedFlight.legs[0];
    if (firstLeg && firstLeg.arrivalTime) {
      var arrH = parseInt(firstLeg.arrivalTime.split(':')[0]);
      if (arrH >= 18) {
        alerts.push({ type: 'tip', text: fillText(t('alert-late-arrival'), { d: itinDayLabel(planDays[0] ? planDays[0].day : 1) }) });
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
  // \uC811\uC5B4 \uB454 '\uD655\uC778\uD560 \uC810 N\uAC1C'. \uD3BC\uCCD0 \uB454 \uC0C1\uD0DC\uB294 \uB2E4\uC2DC \uADF8\uB824\uB3C4 \uC720\uC9C0\uD55C\uB2E4.
  var prev = alertsEl.querySelector('details.schedule-alerts-box');
  var wasOpen = Boolean(prev && prev.open);
  var html = '<details class="schedule-alerts-box"' + (wasOpen ? ' open' : '') + '>' +
    '<summary style="cursor:pointer;font-weight:600;font-size:14px;padding:4px 0">' + escapeHtml(fillText(t('alert-summary'), { n: alerts.length })) + '</summary>';
  for (var ai = 0; ai < alerts.length; ai++) {
    var a = alerts[ai];
    html += '<div class="schedule-alert ' + (typeClasses[a.type] || '') + '">';
    html += '<span class="schedule-alert-icon" aria-hidden="true">' + (typeIcons[a.type] || '') + '</span>';
    html += '<span>' + escapeHtml(a.text) + '</span></div>';
  }
  html += '</details>';
  alertsEl.innerHTML = html;
  alertsEl.classList.remove('hidden');
}

// \uB0A0\uC9DC \uBB36\uC74C \uD45C\uAE30: day-label\uC5D0 \uBC88\uD638 \uBAA9\uB85D\uC744 \uB123\uB294\uB2E4(ko '1\u00B72\u00B73\uC77C\uCC28', en 'Day 1, 2, 3', ja '1\u30FB2\u30FB3\u65E5\u76EE').
function dayListLabel(dayNums) {
  var nums = (dayNums || []).map(Number).filter(function(n) { return Number.isFinite(n); });
  return fillText(t('day-label'), { n: nums.join(t('day-list-sep')) });
}

// Hook into renderItineraryTimeline
var _origRenderItineraryTimeline = renderItineraryTimeline;
renderItineraryTimeline = function() {
  _origRenderItineraryTimeline();
  // Auto-push undo history on every itinerary re-render (covers all edits)
  try { pushItinHistory(); } catch(e) {}
  try { updatePlanControls(); } catch(e) {}
  try { analyzeSchedule(); } catch(e) {}
  try { addMemoButtons(); } catch(e) {}
  try { restoreCachedRouteCosts(); } catch(e) {}
  // 일수 맞추기·되돌리기·다시 실행 등으로 날 수가 바뀌어도 예상 비용 칸이 내보내기(computeBudget)와 같게.
  try { if (currentItineraryData) renderBudgetSummary(); } catch(e) {}
  // 편집 중 일정은 기기 안에 초안으로 보관한다(새로고침·탭 닫기 대비).
  try { scheduleDraftSave(); } catch(e) {}
};

// --- 7. PLACE MEMO ---
function getPlaceMemos() {
  try { return JSON.parse(localStorage.getItem('placeMemos') || '{}'); } catch(e) { return {}; }
}

// 저장소가 막힌 브라우저에서는 false(호출한 쪽이 실패 안내를 띄운다)
function savePlaceMemo(placeName, memo) {
  var memos = getPlaceMemos();
  if (memo) memos[placeName] = memo;
  else delete memos[placeName];
  try { localStorage.setItem('placeMemos', JSON.stringify(memos)); return true; } catch (e) { return false; }
}

function addMemoButtons() {
  var slots = document.querySelectorAll('.itin-slot-place');
  var memos = getPlaceMemos();
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    if (slot.querySelector('.itin-memo-btn')) continue;
    // 메모 키는 렌더러가 넣은 장소 이름(data-place-name)이다. 지역·지도 글자가 섞이지 않는다.
    var placeName = String(slot.dataset.placeName || '').trim();
    if (!placeName || isFreeTimePlace(placeName)) continue;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'itin-memo-btn';
    btn.dataset.memoPlace = placeName;
    btn.textContent = memos[placeName] ? '\u270F\uFE0F' : '\uD83D\uDCDD';
    btn.title = t('memo-title');
    btn.setAttribute('aria-label', fillText(t('memo-input-label'), { p: placeName }));
    slot.appendChild(btn);

    if (memos[placeName]) {
      var memoText = document.createElement('div');
      memoText.className = 'itin-memo-text';
      memoText.textContent = memos[placeName];
      slot.parentElement.appendChild(memoText);
    }
  }
}

// ── 장소 메모 인라인 편집(UX-05): 항목 아래에 한 줄 입력 + [저장]/[취소]가 펼쳐진다(브라우저 prompt 창 대신) ──
var MEMO_MAX_CHARS = 200;

function memoButtonFor(place) {
  var found = null;
  Array.prototype.forEach.call(document.querySelectorAll('.itin-memo-btn'), function(b) {
    if (!found && b.dataset.memoPlace === place) found = b;
  });
  return found;
}

function closeMemoEditors() {
  Array.prototype.forEach.call(document.querySelectorAll('.itin-memo-editor'), function(ed) {
    var item = ed.parentNode;
    // 편집하는 동안 끌기를 꺼 두었던 항목은 되돌린다(입력칸 글자 선택이 끌기로 바뀌지 않게).
    if (item && item.dataset && item.dataset.memoDraggable) { item.setAttribute('draggable', 'true'); delete item.dataset.memoDraggable; }
    if (ed.remove) ed.remove();
  });
}

function openMemoEditor(btn) {
  var place = btn.dataset.memoPlace;
  var slot = btn.closest ? btn.closest('.itin-slot-place') : null;
  var item = slot ? slot.parentNode : null;
  if (!place || !item) return;
  var open = item.querySelector('.itin-memo-editor');
  if (open) { var oi = open.querySelector('input'); if (oi) oi.focus(); return; }
  closeMemoEditors();
  var editor = document.createElement('div');
  editor.className = 'itin-memo-editor';
  editor.dataset.memoPlace = place;
  var label = escapeHtml(fillText(t('memo-input-label'), { p: place }));
  editor.innerHTML = '<input type="text" class="itin-memo-input" maxlength="' + MEMO_MAX_CHARS + '" aria-label="' + label + '" placeholder="' + escapeHtml(t('memo-placeholder')) + '">' +
    '<button type="button" class="itin-memo-save">' + escapeHtml(t('btn-save')) + '</button>' +
    '<button type="button" class="itin-memo-cancel ghost-btn">' + escapeHtml(t('btn-cancel')) + '</button>';
  item.appendChild(editor);
  if (item.getAttribute('draggable') === 'true') { item.setAttribute('draggable', 'false'); item.dataset.memoDraggable = '1'; }
  var input = editor.querySelector('input');
  if (input) {
    input.value = getPlaceMemos()[place] || '';
    try { input.focus(); input.select(); } catch (e) {}
  }
}

function commitMemoEditor(editor) {
  var place = editor.dataset.memoPlace;
  var input = editor.querySelector('input');
  var value = String(input ? input.value : '').trim().slice(0, MEMO_MAX_CHARS);
  var ok = savePlaceMemo(place, value);
  renderItineraryTimeline();
  showMemoToast(!ok ? t('memo-save-fail') : value ? t('memo-saved') : t('memo-deleted'));
  var back = memoButtonFor(place);
  if (back && typeof back.focus === 'function') { try { back.focus(); } catch (e) {} }
}

function cancelMemoEditor(editor) {
  var place = editor.dataset.memoPlace;
  closeMemoEditors();
  var back = memoButtonFor(place);
  if (back && typeof back.focus === 'function') { try { back.focus(); } catch (e) {} }
}

document.addEventListener('click', function(e) {
  var target = e.target && e.target.closest ? e.target : null;
  if (!target) return;
  var memoBtn = target.closest('.itin-memo-btn');
  if (memoBtn) { openMemoEditor(memoBtn); return; }
  var saveBtn = target.closest('.itin-memo-save');
  if (saveBtn) { commitMemoEditor(saveBtn.closest('.itin-memo-editor')); return; }
  var cancelBtn = target.closest('.itin-memo-cancel');
  if (cancelBtn) { cancelMemoEditor(cancelBtn.closest('.itin-memo-editor')); }
});

// Enter = 저장, Esc = 취소(다른 창 닫기 처리보다 먼저 받는다)
document.addEventListener('keydown', function(e) {
  var input = e.target && e.target.classList && e.target.classList.contains('itin-memo-input') ? e.target : null;
  if (!input) return;
  var editor = input.closest('.itin-memo-editor');
  if (!editor) return;
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commitMemoEditor(editor); }
  else if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopImmediatePropagation(); cancelMemoEditor(editor); }
}, true);

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
    // 출처 링크는 좁은 헤더에서 시각적으로 감춰지므로 title에도 출처를 적는다(예상 비용 칸에도 출처 표기).
    chip.title = fillText(t('fx-title'), { r: fxRateData.jpyToKrw, d: fxUpdatedDate(fxRateData.lastUpdate) }) + (credit ? ' · ' + t('fx-credit') : '');
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
  // 예상 비용 칸이 이미 있으면 환율 출처 표기를 다시 맞춘다.
  if (el('budgetSummary') && el('budgetSummary').innerHTML) renderBudgetSummary();
}

// ═══════════════════════════════════════════════
// 9. 로그인 / 일정 저장 · 불러오기
// ═══════════════════════════════════════════════

var currentUser = null;

// 로그인 상태 확인. 로그인은 서명 쿠키라 서버가 다시 시작돼도 유지된다.
// 서버가 깨어나는 중이라 5xx·네트워크 오류가 나면 두 번까지 잠시 뒤 다시 묻는다(로그아웃 화면으로 잘못 바뀌지 않게).
function sleepMs(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }

(async function checkAuth() {
  var user = null;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var resp = await fetch('/api/auth/me');
      if (resp.status >= 500) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      user = data && data.user ? data.user : null;
      break;
    } catch(e) {
      user = null;
      if (attempt < 2) await sleepMs(1500 * (attempt + 1));
    }
  }
  currentUser = user;
  renderAuthUI();

  // 설정된 로그인만 보인다. 응답 전에는 세 버튼을 모두 숨겨 두어 깜빡이지 않게 한다.
  try {
    var pResp = await fetch('/api/auth/providers');
    if (!pResp.ok) throw new Error('HTTP ' + pResp.status);
    var providers = await pResp.json();
    authProviders = {
      naver: Boolean(providers && providers.naver),
      kakao: Boolean(providers && providers.kakao),
      google: Boolean(providers && providers.google)
    };
  } catch(e) {
    // 확인하지 못하면 예전처럼 모두 보여 준다(설정 안 된 쪽은 서버가 안내 페이지로 돌려보낸다).
    authProviders = { naver: true, kakao: true, google: true };
  }
  applyLoginProviderButtons();
})();

// null = 아직 모름(모두 숨김)
var authProviders = null;
var LOGIN_BUTTON_IDS = { naver: 'loginNaver', kakao: 'loginKakao', google: 'loginGoogle' };

function applyLoginProviderButtons() {
  Object.keys(LOGIN_BUTTON_IDS).forEach(function(p) {
    var btn = document.getElementById(LOGIN_BUTTON_IDS[p]);
    // style.display 대신 hidden 속성(CSS의 display:flex !important를 [hidden] 규칙이 이긴다)
    if (btn) btn.hidden = !(authProviders && authProviders[p]);
  });
  if (authProviders && !authProviders.naver && !authProviders.kakao && !authProviders.google) {
    var btns = document.querySelector('#loginModal .login-buttons');
    if (btns && !btns.querySelector('.login-none-msg')) btns.innerHTML = '<p class="login-none-msg" data-i18n="no-auth-config">' + escapeHtml(t('no-auth-config')) + '</p>';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyLoginProviderButtons);
else applyLoginProviderButtons();

// 저장한 일정 API가 401이면(세션 만료) 로그아웃 상태로 바꾸고 로그인 창을 연다.
function handleAuthExpired() {
  currentUser = null;
  renderAuthUI();
  showMemoToast(t('login-required'));
  openLoginModal();
}

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
    openLoginModal();
    return;
  }

  // 모달 닫기(저장 창도 같은 배경 클래스를 쓰므로 로그인 창일 때만)
  if (e.target.closest('#loginModalClose') || (e.target.id === 'loginModal')) {
    closeLoginModal();
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
  // 날짜·일수는 폼이 아니라 실제 일정에서 계산한다(폼만 바꾸고 일정은 그대로일 수 있다).
  var planDays = Array.isArray(currentItineraryData.itinerary) ? currentItineraryData.itinerary : [];
  var startDate = (planDays[0] && planDays[0].date) || (el('startDate') ? el('startDate').value : '');
  var days = planDays.length || (el('days') ? Number(el('days').value) : 0);
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
  openDialog('saveModal');
  modal.classList.remove('hidden');
  nameInput.focus();
  nameInput.select();

  var closed = false;
  function onBackdrop(ev) { if (ev.target === modal) cleanup(); }
  function cleanup() {
    if (closed) return;
    closed = true;
    activeSaveModalCleanup = null;
    modal.classList.add('hidden');
    nameInput.removeEventListener('input', checkDup);
    modal.removeEventListener('click', onBackdrop);
    var cb = document.getElementById('saveConfirmBtn');
    if (cb) cb.replaceWith(cb.cloneNode(true));
    var cancel = document.getElementById('saveCancelBtn');
    if (cancel) cancel.replaceWith(cancel.cloneNode(true));
    closeDialog('saveModal');
  }
  activeSaveModalCleanup = cleanup;

  // 기존 일정 목록 가져오기(같은 이름 덮어쓰기 안내용)
  var existingPlans = [];
  try {
    var listResp = await fetch('/api/my-plans/list');
    if (listResp.status === 401) { cleanup(); handleAuthExpired(); return; }
    // 저장소(Supabase)에 닿지 않으면 저장도 실패하므로 창을 닫고 바로 알린다.
    if (listResp.status === 503) { cleanup(); showMemoToast(t('store-unavailable'), 5000); return; }
    var listData = await listResp.json();
    existingPlans = listData.plans || [];
  } catch(e) {}
  if (closed) return;

  // 중복 확인 함수
  function checkDup() {
    var name = nameInput.value.trim();
    var dup = existingPlans.find(function(p) { return p.title === name; });
    var btn = document.getElementById('saveConfirmBtn') || confirmBtn;
    if (dup) {
      var savedDate = dup.savedAt ? new Date(dup.savedAt).toLocaleDateString(localeTag()) : '';
      dupNotice.innerHTML = '⚠️ <strong>"' + escapeHtml(name) + '"</strong>' + escapeHtml(t('overwrite-confirm')) + ' (' + escapeHtml(savedDate) + t('overwrite-note');
      dupNotice.className = 'save-dup-notice warn';
      btn.textContent = t('btn-overwrite');
      btn.classList.add('overwrite');
      return dup.id;
    } else {
      dupNotice.classList.add('hidden');
      btn.textContent = t('btn-save');
      btn.classList.remove('overwrite');
      return null;
    }
  }

  nameInput.addEventListener('input', checkDup);
  checkDup();

  // 저장 실행을 Promise로 처리
  return new Promise(function(resolve) {
    var finish = function() { cleanup(); resolve(); };
    document.getElementById('saveCancelBtn').addEventListener('click', finish, { once: true });
    // 배경 클릭 리스너는 once 없이 달고 닫을 때 직접 푼다(안쪽 클릭이 리스너를 써 버리지 않게).
    modal.addEventListener('click', onBackdrop);
    var origCleanup = cleanup;
    activeSaveModalCleanup = function() { origCleanup(); resolve(); };

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
          flightResults: allFlights(),
          stayResults: allStays(),
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
            from: el('from') ? el('from').value : '',
            to: el('to') ? el('to').value : '',
            departDate: el('departDate') ? el('departDate').value : '',
            returnDate: el('returnDate') ? el('returnDate').value : '',
            checkIn: el('checkIn') ? el('checkIn').value : '',
            checkOut: el('checkOut') ? el('checkOut').value : '',
            foodCity: el('foodCity') ? el('foodCity').value : ''
          }
        }
      };

      var expired = false;
      try {
        var resp = await fetch('/api/my-plans/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saveData)
        });
        if (resp.ok) {
          showMemoToast(overwriteId ? t('save-overwrite-done') : t('save-success'));
        } else if (resp.status === 401) {
          expired = true;
        } else if (resp.status === 503) {
          showMemoToast(t('store-unavailable'), 5000);
        } else {
          // 저장소가 이유를 알려 준 실패(개수 상한·크기·저장할 수 없는 글자)는 그 안내를, 그 밖에는 일반 실패 안내를 띄운다.
          var failInfo = null;
          try { failInfo = await resp.json(); } catch (e2) { failInfo = null; }
          var failCode = failInfo && failInfo.reasonCode;
          if (failCode === 'PLAN_LIMIT') showMemoToast(fillText(t('plan-limit'), { n: Number(failInfo.limit) || 50 }), 6000);
          else if (failCode === 'PLAN_TOO_LARGE') showMemoToast(t('plan-too-large'), 6000);
          else if (failCode === 'INVALID_PLAN') showMemoToast(t('plan-invalid'), 6000);
          else showMemoToast(t('save-fail'));
        }
      } catch(e) {
        showMemoToast(t('save-error'));
      }
      finish();
      if (expired) handleAuthExpired();
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
    if (resp.status === 401) {
      container.innerHTML = '<p class="my-plans-empty">' + escapeHtml(t('login-required')) + '</p>';
      var panel = el('myPlansPanel');
      if (panel && panel.classList.contains('show')) togglePanel('myPlansPanel');
      handleAuthExpired();
      return;
    }
    if (resp.status === 503) {
      container.innerHTML = '<p class="my-plans-empty">' + escapeHtml(t('store-unavailable')) + '</p>';
      return;
    }
    var data = await resp.json();
    if (!resp.ok) {
      container.innerHTML = '<p class="my-plans-empty">' + escapeHtml(t('load-list-error')) + '</p>';
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

// 빈 카드 목록은 첫 화면 안내로 되돌린다.
function resetCardContainer(id, emptyKey) {
  var node = el(id);
  if (node) node.innerHTML = '<div class="card empty-state" data-i18n="' + emptyKey + '">' + escapeHtml(t(emptyKey)) + '</div>';
  if (id === 'stayCards') setStayMoreVisible(false);
}

// 일정 불러오기
async function loadPlanFromServer(planId) {
  try {
    var resp = await fetch('/api/my-plans/load?id=' + encodeURIComponent(planId));
    if (resp.status === 401) { handleAuthExpired(); return; }
    if (resp.status === 503) { showMemoToast(t('store-unavailable'), 5000); return; }
    var data = await resp.json();
    if (!resp.ok || !data.plan) {
      showMemoToast(t('load-fail'));
      return;
    }

    var plan = data.plan;
    var d = plan.data || {};

    // 0. 지금 화면의 선택·목록·말로 한 요청 의도를 먼저 비운다(저장한 일정에 없는 값이 남지 않게).
    selectedFlight = null; selectedFlightId = '';
    selectedStay = null; selectedStayId = '';
    flightResults = []; stayResults = []; manualFlights = []; manualStays = [];
    latestDestList = []; latestRecFoodList = []; latestFoodList = []; latestDestSearchList = []; latestFoodSearchList = [];
    resetAiIntentState(false);

    // 1. 폼 값 복원 → 도시·날짜에 딸린 칸 맞추기 → 저장해 둔 항공·숙소 날짜로 덮기
    var fv = d.formValues || {};
    if (fv.city && hasSelectOption('city', fv.city)) el('city').value = fv.city;
    if (fv.startDate && el('startDate')) el('startDate').value = fv.startDate;
    if (fv.days && el('days')) el('days').value = fv.days;
    if (fv.theme && el('theme')) el('theme').value = fv.theme;
    if (fv.budget && el('budget')) el('budget').value = fv.budget;
    syncCityDependents(el('city').value);
    syncDatesToDependentForms();
    if (fv.from && el('from')) el('from').value = fv.from;
    if (fv.to && el('to')) el('to').value = fv.to;
    if (fv.departDate && el('departDate')) el('departDate').value = fv.departDate;
    if (fv.returnDate && el('returnDate')) el('returnDate').value = fv.returnDate;
    if (fv.checkIn && el('checkIn')) el('checkIn').value = fv.checkIn;
    if (fv.checkOut && el('checkOut')) el('checkOut').value = fv.checkOut;
    if (fv.foodCity && hasSelectOption('foodCity', fv.foodCity)) el('foodCity').value = fv.foodCity;

    // 2. 항공권 복원(직접 입력한 항공편은 manualFlights로)
    (Array.isArray(d.flightResults) ? d.flightResults : []).forEach(function(f) {
      if (f && f.manual) manualFlights.push(f); else if (f) flightResults.push(f);
    });
    if (d.flight) {
      selectedFlight = d.flight;
      selectedFlightId = d.flightId || d.flight._id || '';
      if (d.flight.manual && !manualFlights.some(function(x) { return x._id === d.flight._id; })) manualFlights.unshift(d.flight);
    }
    try {
      if (allFlights().length > 0) renderFlightCards(true); else resetCardContainer('flightCards', 'empty-flights');
    } catch(e) {}

    // 3. 숙소 복원
    (Array.isArray(d.stayResults) ? d.stayResults : []).forEach(function(s) {
      if (s && s.manual) manualStays.push(s); else if (s) stayResults.push(s);
    });
    if (d.stay) {
      selectedStay = d.stay;
      selectedStayId = d.stayId || d.stay.id || '';
      if (d.stay.manual && !manualStays.some(function(x) { return x.id === d.stay.id; })) manualStays.unshift(d.stay);
    }
    try {
      if (allStays().length > 0) renderStayCards(); else resetCardContainer('stayCards', 'empty-stays');
    } catch(e) {}

    // 4. 추천 목록 복원
    try {
      latestDestList = Array.isArray(d.latestDestList) ? d.latestDestList : [];
      if (latestDestList.length) renderCards('destCards', latestDestList, 'dest'); else resetCardContainer('destCards', 'empty-dest');
      latestRecFoodList = Array.isArray(d.latestRecFoodList) ? d.latestRecFoodList : [];
      if (latestRecFoodList.length) renderRecFoodCards(latestRecFoodList); else resetCardContainer('recFoodCards', 'empty-rec-food');
      latestFoodList = Array.isArray(d.latestFoodList) ? d.latestFoodList : [];
      latestFoodSearchList = latestFoodList;
      if (latestFoodList.length) renderCards('foodCards', latestFoodList, 'food'); else resetCardContainer('foodCards', 'empty-search');
      latestDestSearchList = Array.isArray(d.latestDestSearchList) ? d.latestDestSearchList : [];
      if (latestDestSearchList.length) renderDestSearchCards(latestDestSearchList); else resetCardContainer('destSearchCards', 'empty-search');
    } catch(e) {}

    // 5. 일정 데이터 복원 및 렌더링 (저장된 데이터는 이미 사용자 편집 반영됨 → 분류 안전망 건너뜀)
    if (d.itinerary) {
      d.itinerary._skipMealStrip = true;
      // Reset undo history with loaded state as baseline
      _itinHistory.length = 0;
      _itinHistoryIdx = -1;
      renderItinerary(d.itinerary);
    }

    // 6. 선택 카드 + 예산 요약 렌더링
    try { renderPlanExtras(); } catch(e) {}

    var panel = el('myPlansPanel');
    if (panel && panel.classList.contains('show')) togglePanel('myPlansPanel');
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
    if (resp.status === 401) { handleAuthExpired(); return; }
    if (resp.status === 503) { showMemoToast(t('store-unavailable'), 5000); return; }
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
    '<a href="https://www.klook.com/' + KLOOK_LOCALE_PATH[currentLang === 'en' || currentLang === 'ja' ? currentLang : 'ko'] + '/search/result/?query=' + encodeURIComponent(cityName + ' tour') + '" target="_blank" rel="noopener" style="' + tourLinkStyle + '">' + escapeHtml(t('tour-klook')) + '</a>' +
    '<a href="https://www.viator.com/searchResults/all?text=' + encodeURIComponent(cityName) + '&destId=&tags=alltrips" target="_blank" rel="noopener" style="' + tourLinkStyle + '">' + escapeHtml(t('tour-viator')) + '</a>' +
    '<a href="https://www.getyourguide.com/s/?q=' + encodeURIComponent(cityName + ', Japan') + '&searchSource=1" target="_blank" rel="noopener" style="' + tourLinkStyle + '">GetYourGuide</a>' +
    '</div></div>';
}

// Klook 검색 페이지 언어 경로(화면 언어를 따른다)
var KLOOK_LOCALE_PATH = { ko: 'ko', en: 'en-US', ja: 'ja' };

// 투어: 외부 위젯 스크립트(tpwgt.com, 콘솔 'KlookAff' 오류·8초 대기)를 넣지 않고 검색 바로가기를 바로 그린다.
function loadKlookWidget(cityKey) {
  var wrap = document.getElementById('klookWidgetWrap');
  if (!wrap) return;
  ++klookLoadSeq;
  // 지원 목록에 없는 도시는 도쿄 투어를 보여주지 않고, 그 도시 이름으로 검색 링크만 보여준다.
  var cityName = KLOOK_CITY_MAP[cityKey] || cityLabelByKey(cityKey) || KLOOK_CITY_MAP.tokyo;
  var displayName = tourCityDisplayName(cityKey, cityName);
  wrap.innerHTML = '<div id="tp-klook-widget"></div>';
  renderTourFallbackLinks(document.getElementById('tp-klook-widget') || wrap, cityName, displayName, cityKey);
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
    var removeLabel = escapeHtml(fillText(t('aria-wishlist-remove'), { p: w.name }));
    html += '<button type="button" class="wishlist-remove" data-wish-name="' + escapeHtml(w.name) + '" aria-label="' + removeLabel + '" title="' + removeLabel + '">\u2715</button>';
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
    btn.setAttribute('aria-label', fillText(t('aria-wishlist'), { p: name }));
    btn.setAttribute('aria-pressed', isWishlisted(name) ? 'true' : 'false');
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
    wishBtn.setAttribute('aria-pressed', added ? 'true' : 'false');
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
      // 기록에서 다시 만들 때는 조건 칸 값만 쓴다(앞서 말로 한 요청의 의도는 버린다).
      resetAiIntentState(true);
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

// 검색 기록은 요청이 성공한 뒤에만 남긴다(실패한 검색이 기록에 쌓이지 않게). 저장소가 막혀도 검색은 계속된다.
function recordSearchHistory(type, params) {
  try { addSearchHistory(type, params); } catch (e) {}
}

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
  // '자주 가는 도시' 안내는 조건 칸(여행 지역 선택) 바로 위에 둔다('말로 요청 → 조건' 순서를 끊지 않게).
  var cityField = el('city') && el('city').closest ? el('city').closest('.fields') : null;
  var condPanel = cityField || document.querySelector('#section-conditions');
  if (!condPanel) return;
  // 언어를 바꾸면 다시 그리므로 이전 안내는 지운다.
  var oldHints = document.querySelector('.pref-hints');
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
  if (cityField) cityField.before(div); else condPanel.after(div);
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
    'section-conditions': '여행 조건', 'section-results': '추천과 내 일정',
    'section-explore': '탐색', 'section-flights': '항공권 탐색',
    'section-stays': '숙소 탐색', 'section-tours': '투어 / 액티비티',
    'btn-plan': '일정 만들기', 'btn-flights': '항공권 검색',
    'btn-stays': '숙소 검색', 'btn-food': '검색',
    'btn-add': '추가', 'btn-cancel': '취소', 'btn-close': '닫기',
    'btn-cancel2': '취소', 'btn-more': '더보기',
    'btn-refresh-plan': '일정만 다시 만들기',
    'btn-undo': '↩ 되돌리기', 'btn-redo': '↪ 다시 실행',
    'tagline': '가고 싶은 곳만 말하면 일본 여행 일정을 동글동글 짜 드려요',
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
    'label-depart-date': '가는 날', 'label-return-date': '오는 날',
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
    'ai-chat-title': '말로 요청하기',
    'ai-itinerary': '내 여행 일정',
    'itinerary-map': '일정 지도',
    'weather-title': '여행지 날씨',
    'manual-flight': '직접 항공편 입력',
    'manual-stay': '직접 숙소 입력',
    'modal-add-plan': '일정에 넣기',
    'modal-day-select': '날짜', 'modal-timeslot': '시간대',
    'slot-morning': '오전', 'slot-afternoon': '오후', 'slot-allday': '종일',
    'slot-breakfast': '아침', 'slot-lunch': '점심', 'slot-dinner': '저녁',
    'panel-checklist': '\u2705 여행 준비 체크리스트',
    'panel-emergency': '\uD83C\uDD98 일본 긴급 정보',
    'panel-phrases': '🗣️ 일본어 여행 회화',
    'panel-weather': '🌤️ 여행지 날씨 예보',
    'panel-export': '\uD83D\uDCCB 일정 내보내기',
    'panel-wishlist': '\u2764\uFE0F 찜 / 위시리스트',
    'panel-search-history': '🕘 검색 기록',
    'panel-myplans': '📂 내 저장 일정',
    'export-pdf': '📄 PDF 저장',
    'export-text': '\uD83D\uDCC4 텍스트 복사',
    'export-markdown': '\uD83D\uDCDD 마크다운 복사',
    'export-link': '🔗 공유하기',
    'login-title': '로그인', 'save-title': '💾 일정 저장',
    'tours-note': '여행 도시의 인기 투어와 액티비티를 확인해 보세요. (Klook 제공)',
    'no-results': '결과 없음',
    'add-to-plan': '+ 일정에 넣기',
    'promote-to-rec': '\u2196\uFE0F 추천 여행지로',
    'err-rate-limit': '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.',
    'err-need-plan': '먼저 [일정 만들기]로 일정을 만들어 주세요.',
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
    'selected-mark': '✓ 일정에 반영됨',
    'include-ai': '일정에 반영',
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
    'edit': '✏️ 수정',
    'delete': '✕ 삭제',
    'room': '객실 ',
    'rooms-label': '객실 ',
    'guests-label': ' · 인원 ',
    'per-night-unit': '원/박',
    'meal-breakfast': '아침',
    'meal-lunch': '점심',
    'meal-dinner': '저녁',
    'time-morning': '오전',
    'time-afternoon': '오후',
    'time-allday': '종일',
    'chat-user': '나',
    'chat-enter-msg': '가고 싶은 곳이나 원하는 일정을 적어 주세요.',
    'chat-processing': '요청 내용을 반영해 일정을 만들게요.',
    'chat-error': '요청을 처리하지 못했어요: ',
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
    'mock-notice': '지금은 예시 데이터를 보여 드려요.',
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
    'copy-text-done': '텍스트를 복사했어요.',
    'copy-md-done': '마크다운을 복사했어요.',
    'copy-itin-done': '일정을 복사했어요.',
    'weather-loading': '날씨를 불러오는 중…',
    'weather-error': '날씨 정보를 불러오지 못했어요.',
    'logout-confirm': '로그아웃할까요?',
    'login-required': '로그인이 필요해요.',
    'save-success': '일정을 저장했어요.',
    'no-plan-yet': '먼저 [일정 만들기]로 일정을 만들어 주세요.',
    'add-to-plan-btn': '+ 일정에 넣기',
    'promote-food': '⬆ 추천 맛집으로',
    'wishlist-add': '찜했어요',
    'wishlist-remove': '찜을 해제했어요',
    'loading': '처리 중…',
    'err-timeout': '서버 응답이 늦어요. 잠시 뒤 다시 시도해 주세요.',
    'err-network': '네트워크에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.',
    'err-server': '서버에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.',
    'confirm-time-conflict': '이 시간대에 이미 일정이 있어요. 그래도 넣을까요?',
    'search-flights': '검색',
    'search-stays': '검색',
    'btn-run': 'AI 추천',
    'btn-run-sync': '통합 생성',
    'partial-failure': '일부 데이터를 가져오지 못했어요',
    'open-now': '영업중',
    'korea': '한국',
    'japan': '일본',
    'airport-suffix': ' 공항',
    'drag-handle': '☰ 끌어서 일정에 넣기',
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
    'err-multicity': '다구간 검색은 구간이 2개 이상 있어야 해요.',
    'model-label': ' [모델: ',
    'chat-method': '채팅 해석 방식: ',
    'manual-input': '직접입력',
    'err-airline-required': '항공사나 편명을 입력해 주세요.',
    'err-stay-required': '숙소 이름을 입력해 주세요.',
    'err-return-date': '오는 날은 가는 날보다 빠를 수 없어요. 가는 날로 맞췄어요.',
    'err-checkout-date': '체크아웃은 체크인 다음 날부터 고를 수 있어요. 다음 날로 맞췄어요.',
    'share-title': '여행 일정',
    'fx-loading': '¥/₩ 로딩...',
    'fx-fallback': '¥/₩ 환율 정보 없음',
    'provider-naver': '네이버',
    'provider-kakao': '카카오',
    'btn-save-plan': '💾 저장',
    'btn-my-plans': '📂 내 일정',
    'btn-logout': '로그아웃',
    'btn-login': '👤 로그인',
    'err-no-plan-save': '저장할 일정이 없어요. 먼저 일정을 만들어 주세요.',
    'plan-title-suffix': '일 여행',
    'btn-save': '저장',
    'btn-overwrite': '덮어쓰기',
    'overwrite-confirm': ' 이름의 일정이 이미 있어요.',
    'overwrite-note': ' 저장)<br>저장하면 기존 일정을 덮어써요.',
    'save-overwrite-done': '기존 일정을 덮어썼어요.',
    'save-fail': '저장하지 못했어요.',
    'save-error': '저장하는 중에 문제가 생겼어요.',
    'store-unavailable': '저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
    'plan-limit': '일정은 {n}개까지 저장할 수 있어요. 안 쓰는 일정을 지운 뒤 다시 저장해 주세요.',
    'plan-too-large': '일정이 너무 커서 저장할 수 없어요. 항공·숙소 검색 결과를 줄인 뒤 다시 저장해 주세요.',
    'plan-invalid': '저장할 수 없는 글자가 들어 있어요. 제목이나 메모를 고친 뒤 다시 저장해 주세요.',
    'loading-plans': '불러오는 중...',
    'no-saved-plans': '저장한 일정이 아직 없어요.',
    'plan-default': '일정',
    'days-saved': '일 · ',
    'btn-load': '불러오기',
    'btn-delete': '삭제',
    'load-list-error': '목록을 불러오지 못했어요.',
    'load-fail': '불러오지 못했어요.',
    'load-success': '일정을 불러왔어요.',
    'load-error': '불러오는 중에 문제가 생겼어요.',
    'delete-confirm': '이 일정을 삭제할까요?',
    'delete-success': '일정을 삭제했어요.',
    'delete-fail': '삭제하지 못했어요.',
    'delete-error': '삭제하는 중에 문제가 생겼어요.',
    'route-need-2': '교통비를 계산하려면 이날 장소가 2곳 이상 있어야 해요.',
    'calculating': '계산 중...',
    'free-label': '무료',
    'source-ai-calc': '✨ AI 기반 계산',
    'source-dist-est': '📏 거리 기반 추정치',
    'source-google-route': '🗺 Google 경로 정보',
    'err-input': '입력값을 확인해 주세요.',
    'source-ai-google': '✨ AI + Google Places 기반',
    'source-rule-fb': '📋 규칙기반 추천 (폴백)',
    'source-ai-rec': '✨ AI 기반 추천',
    'rec-prefix': '추천 여행지: ',
    'flight-prefix': '항공편: ',
    'food-prefix': '맛집: ',
    'stay-prefix': '숙소: ',
    'err-need-plan-first': '먼저 [일정 만들기]로 일정을 만들어 주세요.',
    'memo-saved': '메모를 저장했어요',
    'memo-deleted': '메모를 지웠어요',
    'no-auth-config': '지금은 로그인 서비스가 설정되어 있지 않아요.',
    'logged-out': '로그아웃했어요.',
    'plan-saved-overwrite': '기존 일정을 덮어썼어요.',
    'plan-saved': '일정을 저장했어요.',
    'popup-blocked': '팝업이 막혀 있어요. 이 사이트의 팝업을 허용해 주세요.',
    'history-cleared': '검색 기록을 지웠어요.',
    'remove-segment': '삭제',
    'empty-dest': '말로 요청하거나 조건을 고른 뒤 [일정 만들기]를 누르면 추천 여행지와 일정, 항공권·숙소가 한 번에 채워져요.',
    'empty-plan': '아직 일정이 없어요. 위에서 [일정 만들기]를 누르면 날짜별 일정이 여기에 채워져요.',
    'empty-rec-food': '일정을 만들면 여행지 주변 추천 맛집이 여기에 나와요.',
    'empty-rec-food-none': '이번 일정에 맞는 추천 맛집을 아직 찾지 못했어요. 아래 [탐색 › 맛집]에서 도시별 맛집을 찾아보세요.',
    'empty-flights': '일정을 만들면 여행 날짜에 맞춰 항공권을 찾아 드려요. 조건을 바꾸고 [항공권 검색]을 눌러도 돼요.',
    'empty-stays': '일정을 만들면 여행 날짜에 맞춰 숙소를 찾아 드려요. 조건을 바꾸고 [숙소 검색]을 눌러도 돼요.',
    'empty-search': '[검색]을 누르면 결과가 여기에 나와요.',
    'empty-itinerary': '일정을 만들지 못했어요. 조건을 조금 바꾸거나 잠시 뒤 [일정만 다시 만들기]를 눌러 주세요. 날짜 칸의 [+ 장소 추가]로 직접 채울 수도 있어요.',
    'map-no-coords': '지도에 표시할 위치 정보가 있는 장소가 아직 없어요.',
    'map-loading': '지도를 불러오는 중이에요…',
    'map-failed': '지도를 불러오지 못했어요. 장소 옆 [지도] 링크로 위치를 확인할 수 있어요.',
    'map-partial': '위치 정보가 없는 장소 {n}곳은 지도에서 빠졌어요.',
    'photo-credit': '사진:',
    'photo-scope-city': '도시 대표 사진',
    'photo-scope-genre': '음식 예시 사진',
    'stay-date-unconfirmed': '날짜 미확인 최저가',
    'stay-date-unconfirmed-tip': '선택한 날짜의 빈방과 요금은 확인되지 않았어요. 예약 페이지에서 꼭 확인해 주세요.',
    'sample-data': '예시',
    'sample-no-select': '예시 데이터라 일정에 넣을 수 없어요',
    'flight-other-date': '다른 날짜',
    'flight-other-date-tip': '요청한 날짜와 다른 날짜의 항공편이에요',
    'confirm-flight-dates': '이 항공편은 {dates} 일정이라 지금 여행 날짜와 달라요.\n여행 날짜를 이 항공편에 맞춰({days}일) 일정에 넣을까요?',
    'confirm-flight-dates-edited': '이 항공편은 {dates} 일정이라 지금 여행 날짜와 달라요.\n여행 날짜만 이 항공편에 맞출까요({days}일)? 직접 고친 일정은 그대로 두니, 일정의 날 수는 안내 띠의 [일수 맞추기]로 맞춰 주세요.',
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
    'aria-plan': '요청과 조건으로 여행 일정 만들기',
    'ai-chat-note': '가고 싶은 곳·기간·취향을 적으면 아래 조건을 자동으로 채우고 일정을 만들어요. 비워 두면 아래 조건대로 만들어요.',
    'ph-ai-request': '예: 유니버셜 스튜디오랑 도톤보리 꼭 가고 싶고, 3박 4일로 이동 편한 숙소 추천해줘',
    'aria-ai-request': 'AI 여행 조건 입력',
    'btn-ai-assist': '이 내용으로 만들기',
    'aria-rec-tabs': '추천 유형 선택',
    'plan-control-copy': '고른 항공권·숙소는 그대로 두고 일정만 새로 짜요.',
    'aria-undo': '일정 되돌리기 (Ctrl+Z)',
    'aria-redo': '일정 다시 실행 (Ctrl+Y)',
    'manual-flight-hint': '출발·도착 공항과 날짜는 여행 조건에서 자동으로 채워져요. 가는 편은 출발지→도착지, 오는 편은 도착지→출발지예요.',
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
    'multi-help': '다구간은 아래 구간을 직접 고쳐서 검색해요. 구간이 2개 이상 있어야 해요.',
    'label-date': '날짜',
    'btn-add-segment': '구간 추가',
    'btn-reset-segments': '초기화',
    'filter-tab': '상세 필터',
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
    'login-desc': '로그인하면 일정을 저장하고 불러올 수 있어요.',
    'login-naver': '네이버 로그인',
    'login-kakao': '카카오 로그인',
    'login-google': 'Google 로그인',
    'save-name-label': '일정 이름',
    'ph-save-name': '일정 이름을 적어 주세요',
    'promote-dest': '⬆ 추천 여행지로',
    'promote-added': '✅ 추가됨',
    'promote-exists': '이미 추천에 있어요',
    'wishlist-toggle': '찜 추가/제거',
    'arrive-at': '{t} 도착',
    'depart-at': '{t} 출발',
    'itin-dest-label': '📍 여행지',
    'itin-food-label': '🍴 맛집',
    'drop-here': '여기에 놓기',
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
    'wx-rain': '☔ 여행 기간 중 {n}일은 비 소식이 있어요. 우산을 챙기고 실내 관광지도 준비해 두세요.',
    'wx-cold': '❄️ 추운 날이 있어요. 따뜻한 옷을 챙겨 주세요.',
    'wx-hot': '🔥 더운 날이 있어요. 물을 자주 마시고 햇볕을 가려 주세요.',
    'export-no-plan': '아직 일정이 없어요. 먼저 [일정 만들기]로 일정을 만들어 주세요.',
    'export-flight': '항공권',
    'export-stay': '숙소',
    'export-cost': '예상 비용',
    'cost-flight-line': '항공권: ',
    'cost-stay-line': '숙소: ',
    'cost-food-line': '식비(예상): ~',
    'cost-transport-line': '교통비(예상): ~',
    'saved-default': '저장했어요.',
    'alert-too-many': '{d}: 여행지 {n}곳은 빡빡할 수 있어요. 하루 3곳 이하가 편해요.',
    'alert-no-meal': '{d}에 맛집이 비어 있어요. 🍴 칸의 [맛집 추가]로 넣어 보세요.',
    'alert-allday': '{d}: 종일 일정과 다른 여행지가 같은 날에 있어요. 시간이 겹치지 않는지 확인해 주세요.',
    'alert-dup': '"{p}"이(가) {d}에 겹쳐 있어요.',
    'alert-late-arrival': '{d} 도착이 저녁이에요. 첫날은 숙소 체크인과 근처 산책 정도가 알맞아요.',
    'alert-early-dep': '마지막 날 비행기가 오전에 떠나요. 2시간 전에 공항에 닿도록 전날 짐을 싸 두세요.',
    'memo-title': '메모 쓰기·고치기',
    'fx-chip': '100¥≈{a}원 | 1만원≈¥{b}',
    'fx-title': '환율 (1엔={r}원) · {d}',
    'fx-credit': '환율 제공: Exchange Rate API',
    'weather-credit': '날씨 데이터: Open-Meteo.com',
    'auth-err-state': '로그인 확인 시간이 지났거나 다른 창에서 로그인을 시작했어요. 다시 시도해 주세요.',
    'auth-err-provider': '{p} 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
    'auth-err-generic': '로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
    'auth-err-not-allowed': '이 앱은 허용된 계정만 로그인할 수 있어요.',
    'title-save-plan': '현재 일정 저장',
    'title-my-plans': '내 저장 일정',
    'saved-suffix': ' 저장',
    'wishlist-empty1': '찜한 장소가 아직 없어요.',
    'wishlist-empty2': '여행지·맛집 카드의 하트 버튼을 눌러 보세요.',
    'wishlist-count': '{n}개 저장됨',
    'hist-plan': '추천+일정: ',
    'hist-flight': '항공권: ',
    'hist-stay': '숙소: ',
    'hist-food': '맛집: ',
    'hist-dest': '여행지: ',
    'days-unit': '일',
    'hist-empty': '검색 기록이 없어요.',
    'min-ago': '{n}분 전',
    'hours-ago': '{n}시간 전',
    'hist-clear': '기록 전체 삭제',
    'pref-cities': '자주 가는 도시: ',
    'pref-themes': '선호 테마: ',
    'btn-copy': '📋 복사',
    'drop-kind-mismatch': '맛집은 아침·점심·저녁 칸에, 장소는 오전·오후·종일 칸에 놓아 주세요',
    'place-noop': '이미 그 칸에 있어요.',
    'confirm-replace-meal': '이 식사 칸에는 이미 {n}이(가) 있어요. 바꿀까요?',
    'confirm-duplicate-place': '{n}은(는) 이미 이날 일정에 있어요. 한 번 더 넣을까요?',
    'added-to-plan-toast': '{d}일차 {p}에 {n}을(를) 넣었어요',
    'moved-in-plan': '{n}을(를) {d}일차 {p}(으)로 옮겼어요',
    'meal-slots-full': '이날 식사 칸이 모두 찼어요. 바꿀 칸에 직접 놓아 주세요',
    'day-label': '{n}일차',
    'tips-title': '💡 여행 팁',
    'btn-move': '옮기기',
    'aria-remove-item': '일정에서 빼기',
    'btn-add-place': '+ 장소 추가',
    'modal-custom-hint': '목록에 없으면 이름을 직접 입력',
    'modal-move-plan': '다른 날·시간대로 옮기기',
    'btn-move-confirm': '여기로 옮기기',
    'modal-need-place': '넣을 장소를 고르거나 이름을 입력해 주세요',
    'meal-extra': '추가 식사',
    'confirm-overwrite-edits': '직접 고친 일정이 새 일정으로 바뀌어요. 계속할까요? (↩ 되돌리기로 돌아갈 수 있어요)',
    'regen-hint': '항공·숙소가 바뀌었어요. 시간에 맞춰 다시 짜려면 [일정만 다시 만들기]를 눌러 주세요.',
    'regen-undo-hint': '새 일정으로 바꿨어요. 이전 일정은 ↩ 되돌리기로 돌아갈 수 있어요.',
    'confirm-overwrite-during-build': '새 일정을 만드는 동안 직접 고친 내용이 있어요. 새 일정으로 바꿀까요? (취소하면 고친 일정을 그대로 둬요)',
    'regen-kept-edits': '고친 일정을 그대로 뒀어요. 추천 목록만 새로 바꿨어요.',
    'confirm-time-overlap': "{day}에는 이미 '{n}'({t}) 일정이 있어 시간이 겹쳐요. 그래도 이 시간에 둘까요?",
    'alert-time-overlap': "{d}: '{a}'·'{b}' 시간이 겹쳐요. 시간을 확인해 주세요.",
    'itin-night': '저녁 이후',
    'intent-budget-low': '예산 절약',
    'intent-budget-high': '넉넉한 예산',
    'days-clamped': '여행 일수는 1~10일로 맞췄어요',
    'trip-changed': '여행 조건이 바뀌었어요. 일정을 어떻게 맞출까요?',
    'btn-shift-dates': '날짜만 옮기기',
    'btn-fit-days': '일수 맞추기',
    'btn-rebuild': '새로 만들기',
    'confirm-trim-days': '뒤쪽 {n}일에 들어 있는 일정이 지워져요. 계속할까요?',
    'err-cities': '도시 목록을 불러오지 못했어요. 서버가 깨어나는 중일 수 있어요.',
    'btn-retry': '다시 시도',
    'copy-done': '복사했어요',
    'copy-fail': '복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요.',
    'draft-found': '저장하지 않은 일정이 있어요 ({t})',
    'btn-draft-restore': '이어서 편집',
    'btn-draft-discard': '버리기',
    'phrases-none': '맞는 문장이 없어요.',
    'cabin-economy': '이코노미',
    'cabin-premium': '프리미엄 이코노미',
    'cabin-business': '비즈니스',
    'cabin-first': '퍼스트',
    'baggage-label': '수하물 ',
    'chat-ai-name': 'Tabimaru',
    'btn-plan-busy': '일정 만드는 중…',
    'btn-plan-save': '💾 저장',
    'btn-plan-export': '📋 내보내기·공유',
    'ai-score-title': 'AI 추천도 {n}/100',
    'alert-summary': '📊 확인할 점 {n}개',
    'alert-dup-same-day': '"{p}"이(가) {d}에 두 번 이상 들어 있어요.',
    'day-list-sep': '·',
    'plan-building': '일정을 만드는 중이에요… 보통 10~20초 걸려요.',
    'server-waking': '무료 서버가 깨어나는 중이에요. 최대 1분쯤 걸릴 수 있어요.',
    'plan-ready': '일정이 준비됐어요 ↓',
    'chat-done': '일정이 준비됐어요. 아래 "내 여행 일정"에서 확인하고 끌어서 바꿔 보세요.',
    'ai-busy-retry': '1분쯤 뒤 [일정만 다시 만들기]를 눌러 보세요.',
    'ai-daily-retry': 'AI 한도는 한국 시간 오후 4~5시에 다시 생겨요. 그 뒤 [일정만 다시 만들기]를 눌러 보세요.',
    'weather-out-of-range': '여행 날짜는 아직 예보 범위 밖이라 오늘부터의 예보를 보여 드려요.',
    'weather-partial-range': '여행 {d}일 중 {n}일만 예보 범위 안에 있어요. 나머지 날은 아직 예보가 없어요.',
    'weather-days': '{city} {n}일 예보',
    'login-to-save': '저장하려면 로그인이 필요해요. 로그인 후 다시 [저장]을 눌러 주세요.',
    'cost-activity-line': '활동비(예상): ~',
    'cost-total-line': '합계(예상): ~',
    'memo-input-label': '{p} 메모',
    'memo-placeholder': '예: 10시 예약, 입장권 미리 사기',
    'memo-save-fail': '메모를 저장하지 못했어요. 브라우저 저장 공간 설정을 확인해 주세요.',
    'intent-days': '{n}일',
    'intent-start': '{date} 출발',
    'intent-theme': '테마: {t}',
    'intent-must': '꼭 갈 곳: {p}',
    'intent-excluded': '제외: {p}',
    'intent-unsupported': '반영 못 함: {p}',
    'must-missing': '{names}은(는) 일정에 넣지 못했어요. [+ 장소 추가]로 직접 넣을 수 있어요.',
    'aria-hide-pick': '추천에서 숨기기',
    'aria-wishlist': '{p} 찜하기',
    'aria-wishlist-remove': '{p} 찜 해제',
    'city-popular': '인기 도시',
    'city-all': '전체 도시(가나다순)',
    'plan-summary': '{city} {d}일 · 장소 {p}곳 · 맛집 {f}곳',
    'plan-lang-note': '이 일정은 {lang}로 만들어졌어요. 바꾸려면 [일정만 다시 만들기]를 눌러 주세요.',
    'lang-name-ko': '한국어',
    'lang-name-en': '영어',
    'lang-name-ja': '일본어',
    'map-food-no-coords': '맛집 {n}곳은 위치 정보가 없어요',
    'map-legend-meal': '식사',
    'food-no-genre-match': '이 장르와 맞는 가게를 아직 찾지 못했어요. 다른 장르(예: 라멘, 스시)로 검색해 보세요.',
    'intent-food': '맛집: {f}',
    'intent-cond-indoor': '실내 위주',
    'intent-cond-late-start': '{t} 이후 시작',
    'intent-cond-max-places': '하루 {n}곳',
    'intent-cond-rest-day': '중간에 휴식일',
    'intent-cond-transit': '대중교통만',
    'intent-cond-no-shopping': '쇼핑 제외',
    'intent-cond-low-walking': '적게 걷기',
    'intent-cond-kids': '아이 동반',
    'intent-cond-relaxed': '여유로운 일정',
    'intent-cond-night-view': '야경 넣기',
    'intent-cond-arrival': '{t} 도착',
    'intent-cond-departure': '{t} 출발 비행기'
  },
  en: {
    'section-conditions': 'Travel Conditions', 'section-results': 'Picks & my plan',
    'section-explore': 'Explore', 'section-flights': 'Flights',
    'section-stays': 'Accommodations', 'section-tours': 'Tours / Activities',
    'btn-plan': 'Create plan', 'btn-flights': 'Search Flights',
    'btn-stays': 'Search Hotels', 'btn-food': 'Search',
    'btn-add': 'Add', 'btn-cancel': 'Cancel', 'btn-close': 'Close',
    'btn-cancel2': 'Cancel', 'btn-more': 'Show More',
    'btn-refresh-plan': 'Rebuild plan only',
    'btn-undo': '↩ Undo', 'btn-redo': '↪ Redo',
    'tagline': 'Tell us where you want to go — we\'ll round it into a Japan trip.',
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
    'ai-chat-title': 'Describe your trip',
    'ai-itinerary': 'My itinerary',
    'itinerary-map': 'Itinerary Map',
    'weather-title': 'Weather',
    'manual-flight': 'Enter Flight Manually',
    'manual-stay': 'Enter Hotel Manually',
    'modal-add-plan': 'Add to plan',
    'modal-day-select': 'Day', 'modal-timeslot': 'Time Slot',
    'slot-morning': 'Morning', 'slot-afternoon': 'Afternoon', 'slot-allday': 'All Day',
    'slot-breakfast': 'Breakfast', 'slot-lunch': 'Lunch', 'slot-dinner': 'Dinner',
    'panel-checklist': '\u2705 Travel Checklist',
    'panel-emergency': '\uD83C\uDD98 Emergency Info (Japan)',
    'panel-phrases': '🗣️ Japanese Phrases',
    'panel-weather': '🌤️ Weather Forecast',
    'panel-export': '\uD83D\uDCCB Export Itinerary',
    'panel-wishlist': '\u2764\uFE0F Wishlist',
    'panel-search-history': '🕘 Search History',
    'panel-myplans': '📂 My Saved Plans',
    'export-pdf': '📄 Save PDF',
    'export-text': '\uD83D\uDCC4 Copy Text',
    'export-markdown': '\uD83D\uDCDD Copy Markdown',
    'export-link': '🔗 Share',
    'login-title': 'Log in', 'save-title': '💾 Save Itinerary',
    'tours-note': 'Check popular tours and activities. (Powered by Klook)',
    'no-results': 'No results',
    'add-to-plan': '+ Add to plan',
    'promote-to-rec': '\u2196\uFE0F Add to Recs',
    'err-rate-limit': 'Too many requests. Please try again in a moment.',
    'err-need-plan': 'Create a plan first with [Create plan].',
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
    'selected-mark': '✓ In my plan',
    'include-ai': 'Use in my plan',
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
    'meal-breakfast': 'Breakfast',
    'meal-lunch': 'Lunch',
    'meal-dinner': 'Dinner',
    'time-morning': 'Morning',
    'time-afternoon': 'Afternoon',
    'time-allday': 'All Day',
    'chat-user': 'You',
    'chat-enter-msg': 'Tell us where you want to go or what you have in mind.',
    'chat-processing': 'Building a plan from your request.',
    'chat-error': 'Could not process your request: ',
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
    'mock-notice': 'Showing sample data for now.',
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
    'copy-text-done': 'Text copied.',
    'copy-md-done': 'Markdown copied.',
    'copy-itin-done': 'Plan copied.',
    'weather-loading': 'Loading weather…',
    'weather-error': 'Could not load the weather.',
    'logout-confirm': 'Log out now?',
    'login-required': 'Please log in first.',
    'save-success': 'Plan saved.',
    'no-plan-yet': 'Create a plan first with [Create plan].',
    'add-to-plan-btn': '+ Add to plan',
    'promote-food': '⬆ Add to food picks',
    'wishlist-add': 'Added to wishlist',
    'wishlist-remove': 'Removed from wishlist',
    'korea': 'Korea',
    'japan': 'Japan',
    'airport-suffix': ' Airport',
    'drag-handle': '☰ Drag into your plan',
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
    'err-multicity': 'Multi-city search needs at least 2 segments.',
    'model-label': ' [Model: ',
    'chat-method': 'Chat method: ',
    'manual-input': 'Manual',
    'err-airline-required': 'Enter an airline or a flight number.',
    'err-stay-required': 'Enter the hotel name.',
    'err-return-date': 'Return can’t be before departure, so it was set to the departure date.',
    'err-checkout-date': 'Check-out must be after check-in, so it was moved to the next day.',
    'share-title': 'Itinerary',
    'fx-loading': '¥/₩ Loading...',
    'fx-fallback': '¥/₩ rate unavailable',
    'provider-naver': 'Naver',
    'provider-kakao': 'Kakao',
    'btn-save-plan': '💾 Save',
    'btn-my-plans': '📂 My Plans',
    'btn-logout': 'Logout',
    'btn-login': '👤 Login',
    'err-no-plan-save': 'Nothing to save yet. Create a plan first.',
    'plan-title-suffix': '-day trip',
    'btn-save': 'Save',
    'btn-overwrite': 'Overwrite',
    'overwrite-confirm': ' already exists.',
    'overwrite-note': ')<br>Saving will overwrite the existing plan.',
    'save-overwrite-done': 'Plan overwritten.',
    'save-fail': 'Could not save.',
    'save-error': 'Something went wrong while saving.',
    'store-unavailable': 'Can\'t reach the plan storage right now. Please try again in a moment.',
    'plan-limit': 'You can save up to {n} plans. Delete one you no longer need and save again.',
    'plan-too-large': 'This plan is too large to save. Clear some flight or stay results and save again.',
    'plan-invalid': 'The plan contains characters that can\'t be saved. Edit the title or notes and save again.',
    'loading-plans': 'Loading...',
    'no-saved-plans': 'No saved plans yet.',
    'plan-default': 'Plan',
    'days-saved': 'd · ',
    'btn-load': 'Load',
    'btn-delete': 'Delete',
    'load-list-error': 'Could not load your plans.',
    'load-fail': 'Could not load.',
    'load-success': 'Plan loaded.',
    'load-error': 'Something went wrong while loading.',
    'delete-confirm': 'Delete this plan?',
    'delete-success': 'Plan deleted.',
    'delete-fail': 'Could not delete.',
    'delete-error': 'Something went wrong while deleting.',
    'route-need-2': 'Add at least 2 places to this day to calculate transit costs.',
    'calculating': 'Calculating...',
    'free-label': 'Free',
    'source-ai-calc': '✨ AI Calculation',
    'source-dist-est': '📏 Distance-based estimate',
    'source-google-route': '🗺 Google route data',
    'err-input': 'Please check what you entered.',
    'source-ai-google': '✨ AI + Google Places',
    'source-rule-fb': '📋 Rule-based (fallback)',
    'source-ai-rec': '✨ AI Recommendations',
    'rec-prefix': 'Destinations: ',
    'flight-prefix': 'Flights: ',
    'food-prefix': 'Food: ',
    'stay-prefix': 'Stays: ',
    'err-need-plan-first': 'Create a plan first with [Create plan].',
    'memo-saved': 'Note saved',
    'memo-deleted': 'Note deleted',
    'no-auth-config': 'Login is not set up right now.',
    'logged-out': 'Logged out.',
    'plan-saved-overwrite': 'Plan overwritten.',
    'plan-saved': 'Plan saved.',
    'popup-blocked': 'The pop-up was blocked. Please allow pop-ups for this site.',
    'history-cleared': 'Search history cleared.',
    'remove-segment': 'Remove',
    'loading': 'Loading…',
    'err-timeout': 'The server took too long. Please try again in a moment.',
    'err-network': 'Network error. Please check your connection.',
    'err-server': 'Server error. Please try again in a moment.',
    'confirm-time-conflict': 'This time slot already has something. Add anyway?',
    'search-flights': 'Search',
    'search-stays': 'Search',
    'btn-run': 'AI Recommend',
    'btn-run-sync': 'Full Generate',
    'partial-failure': 'Some data could not be loaded',
    'open-now': 'Open',
    'empty-dest': 'Describe your trip or pick the conditions, then press [Create plan] to fill in places, a day-by-day plan, flights and stays at once.',
    'empty-plan': 'No plan yet. Press [Create plan] above and your day-by-day plan will appear here.',
    'empty-rec-food': 'Restaurant picks near your places appear here once you create a plan.',
    'empty-rec-food-none': 'We couldn\'t find restaurant picks for this plan yet. Try Explore › Food below.',
    'empty-flights': 'Flights for your dates appear once you create a plan. You can also change the fields and press [Search Flights].',
    'empty-stays': 'Stays for your dates appear once you create a plan. You can also change the fields and press [Search Hotels].',
    'empty-search': 'Press [Search] to see results here.',
    'empty-itinerary': 'We couldn\'t build this plan. Change the conditions a little or press [Rebuild plan only] in a moment. You can also fill each day yourself with [+ Add place].',
    'map-no-coords': 'None of the places in this plan have map coordinates yet.',
    'map-loading': 'Loading map…',
    'map-failed': 'The map couldn\'t load. Use the [Map] link next to each place.',
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
    'confirm-flight-dates-edited': 'This flight is on {dates}, which differs from your trip dates.\nChange only the trip dates to match this flight ({days} days)? Your edited plan stays as it is; use [Match day count] in the notice to fit its days.',
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
    'aria-plan': 'Create a trip plan from your request and conditions',
    'ai-chat-note': 'Write where you want to go, for how long and what you like — we\'ll fill in the conditions below and build your plan. Leave it blank to use the conditions below.',
    'ph-ai-request': 'e.g. I really want to see Universal Studios and Dotonbori. 4 days, 3 nights, with a hotel that\'s easy to get around from.',
    'aria-ai-request': 'Describe your trip for the AI',
    'btn-ai-assist': 'Plan from this',
    'aria-rec-tabs': 'Recommendation type',
    'plan-control-copy': 'Keeps your chosen flight and stay, and rebuilds only the plan.',
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
    'filter-tab': 'More filters',
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
    'login-desc': 'Log in to save and load your plans.',
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
    'wx-rain': '☔ Rain is expected on {n} day(s) of your trip. Bring an umbrella and plan some indoor spots.',
    'wx-cold': '❄️ Some days will be cold. Pack warm clothes.',
    'wx-hot': '🔥 Some days will be hot. Stay hydrated and protect yourself from the sun.',
    'export-no-plan': 'No plan yet. Create one first with [Create plan].',
    'export-flight': 'Flight',
    'export-stay': 'Stay',
    'export-cost': 'Estimated costs',
    'cost-flight-line': 'Flight: ',
    'cost-stay-line': 'Stay: ',
    'cost-food-line': 'Food (est.): ~',
    'cost-transport-line': 'Transport (est.): ~',
    'saved-default': 'Saved.',
    'alert-too-many': '{d}: {n} places may make for a tight day — 3 or fewer is easier.',
    'alert-no-meal': 'No restaurants yet on {d} — use [Add restaurant] in the 🍴 row.',
    'alert-allday': '{d}: an all-day plan shares the day with other places. Check that the times don\'t overlap.',
    'alert-dup': '"{p}" appears on {d}.',
    'alert-late-arrival': 'You arrive in the evening on {d}. Checking in and a short walk nearby is plenty.',
    'alert-early-dep': 'Your last-day flight leaves in the morning. Aim to reach the airport 2 hours early and pack the night before.',
    'memo-title': 'Add or edit a note',
    'fx-chip': '¥100≈₩{a} | ₩10,000≈¥{b}',
    'fx-title': 'Exchange rate (¥1 = ₩{r}) · {d}',
    'fx-credit': 'Rates By Exchange Rate API',
    'weather-credit': 'Weather data by Open-Meteo.com',
    'auth-err-state': 'Your sign-in timed out or was started in another window. Please try again.',
    'auth-err-provider': 'Sign-in with {p} was not completed. Please try again in a moment.',
    'auth-err-generic': 'Sign-in was not completed. Please try again in a moment.',
    'auth-err-not-allowed': 'Only approved accounts can sign in to this app.',
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
    'drop-kind-mismatch': 'Drop restaurants on Breakfast, Lunch or Dinner, and places on Morning, Afternoon or All Day',
    'place-noop': 'It\'s already in that slot.',
    'confirm-replace-meal': '{n} is already in this meal slot. Replace it?',
    'confirm-duplicate-place': '{n} is already on this day. Add it again?',
    'added-to-plan-toast': 'Added {n} to Day {d} {p}',
    'moved-in-plan': 'Moved {n} to Day {d} {p}',
    'meal-slots-full': 'All meal slots on this day are full — drop onto the one to replace',
    'day-label': 'Day {n}',
    'tips-title': '💡 Travel tips',
    'btn-move': 'Move',
    'aria-remove-item': 'Remove from plan',
    'btn-add-place': '+ Add place',
    'modal-custom-hint': 'Not listed? Type a name',
    'modal-move-plan': 'Move to another day or time',
    'btn-move-confirm': 'Move here',
    'modal-need-place': 'Pick a place or type a name',
    'meal-extra': 'Extra meal',
    'confirm-overwrite-edits': 'Your edits will be replaced by a new plan. Continue? (You can go back with ↩ Undo)',
    'regen-hint': 'Flight or stay changed. Press [Rebuild plan only] to re-fit the days.',
    'regen-undo-hint': 'Replaced with a new plan — use ↩ Undo to go back.',
    'confirm-overwrite-during-build': 'You edited the plan while a new one was being made. Replace it with the new plan? (Cancel keeps your edits)',
    'regen-kept-edits': 'Kept your edited plan. Only the recommendations were refreshed.',
    'confirm-time-overlap': "{day} already has '{n}' ({t}) at this time. Place it here anyway?",
    'alert-time-overlap': "{d}: '{a}' and '{b}' overlap in time. Please check the times.",
    'itin-night': 'Evening',
    'intent-budget-low': 'Low budget',
    'intent-budget-high': 'Premium budget',
    'days-clamped': 'Trip length is set to 1–10 days',
    'trip-changed': 'Your trip dates changed. How should the plan follow?',
    'btn-shift-dates': 'Shift dates only',
    'btn-fit-days': 'Match day count',
    'btn-rebuild': 'Make a new plan',
    'confirm-trim-days': 'Plans on the last {n} day(s) will be removed. Continue?',
    'err-cities': 'Could not load the city list. The server may still be waking up.',
    'btn-retry': 'Try again',
    'copy-done': 'Copied',
    'copy-fail': 'Could not copy. Check your browser’s clipboard permission.',
    'draft-found': 'You have an unsaved plan ({t})',
    'btn-draft-restore': 'Continue editing',
    'btn-draft-discard': 'Discard',
    'phrases-none': 'No matching phrases.',
    'cabin-economy': 'Economy',
    'cabin-premium': 'Premium Economy',
    'cabin-business': 'Business',
    'cabin-first': 'First',
    'baggage-label': 'Baggage ',
    'chat-ai-name': 'Tabimaru',
    'btn-plan-busy': 'Creating…',
    'btn-plan-save': '💾 Save',
    'btn-plan-export': '📋 Export / share',
    'ai-score-title': 'AI match {n}/100',
    'alert-summary': '📊 Things to check: {n}',
    'alert-dup-same-day': '"{p}" is on {d} more than once.',
    'day-list-sep': ', ',
    'plan-building': 'Building your plan… usually 10–20 seconds.',
    'server-waking': 'The free server is waking up — this can take up to a minute.',
    'plan-ready': 'Your plan is ready ↓',
    'chat-done': 'Your plan is ready. Check "My itinerary" below and drag items to rearrange them.',
    'ai-busy-retry': 'Try [Rebuild plan only] again in about a minute.',
    'ai-daily-retry': 'The AI quota resets around 4–5 pm Korea time. Try [Rebuild plan only] after that.',
    'weather-out-of-range': 'Your trip dates are beyond the forecast range, so this shows the forecast from today.',
    'weather-partial-range': 'Only {n} of your {d} trip days are within the forecast range so far.',
    'weather-days': '{city} {n}-day forecast',
    'login-to-save': 'Log in to save. After logging in, press [Save] again.',
    'cost-activity-line': 'Activities (est.): ~',
    'cost-total-line': 'Total (est.): ~',
    'memo-input-label': 'Note for {p}',
    'memo-placeholder': 'e.g. booked for 10:00, buy tickets ahead',
    'memo-save-fail': 'Couldn\'t save the note. Check your browser storage settings.',
    'intent-days': '{n} days',
    'intent-start': 'from {date}',
    'intent-theme': 'Theme: {t}',
    'intent-must': 'Must-see: {p}',
    'intent-excluded': 'Skip: {p}',
    'intent-unsupported': 'Not included: {p}',
    'must-missing': 'Couldn\'t fit {names} into the plan. You can add it yourself with [+ Add place].',
    'aria-hide-pick': 'Hide from picks',
    'aria-wishlist': 'Save {p} to wishlist',
    'aria-wishlist-remove': 'Remove {p} from wishlist',
    'city-popular': 'Popular',
    'city-all': 'All cities',
    'plan-summary': '{city} · {d} days · {p} places · {f} restaurants',
    'plan-lang-note': 'This plan was created in {lang}. To switch, press [Rebuild plan only].',
    'lang-name-ko': 'Korean',
    'lang-name-en': 'English',
    'lang-name-ja': 'Japanese',
    'map-food-no-coords': '{n} restaurant(s) have no location yet',
    'map-legend-meal': 'Meals',
    'food-no-genre-match': 'We couldn\'t find restaurants for this genre yet. Try another genre (e.g. ramen, sushi).',
    'intent-food': 'Food: {f}',
    'intent-cond-indoor': 'Indoor-first',
    'intent-cond-late-start': 'Start after {t}',
    'intent-cond-max-places': 'Up to {n} places a day',
    'intent-cond-rest-day': 'A rest day in the middle',
    'intent-cond-transit': 'Public transit only',
    'intent-cond-no-shopping': 'No shopping',
    'intent-cond-low-walking': 'Less walking',
    'intent-cond-kids': 'Kid-friendly',
    'intent-cond-relaxed': 'Relaxed pace',
    'intent-cond-night-view': 'Night views',
    'intent-cond-arrival': 'Arrive {t}',
    'intent-cond-departure': 'Fly out {t}'
  },
  ja: {
    'section-conditions': '\u65C5\u884C\u6761\u4EF6', 'section-results': 'おすすめと旅のプラン',
    'section-explore': '\u63A2\u7D22', 'section-flights': '\u822A\u7A7A\u5238',
    'section-stays': '\u5BBF\u6CCA', 'section-tours': '\u30C4\u30A2\u30FC / \u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3',
    'btn-plan': 'プランを作る', 'btn-flights': '\u822A\u7A7A\u5238\u691C\u7D22',
    'btn-stays': '\u5BBF\u6CCA\u691C\u7D22', 'btn-food': '\u691C\u7D22',
    'btn-add': '\u8FFD\u52A0', 'btn-cancel': '\u30AD\u30E3\u30F3\u30BB\u30EB', 'btn-close': '\u9589\u3058\u308B',
    'btn-cancel2': '\u30AD\u30E3\u30F3\u30BB\u30EB', 'btn-more': '\u3082\u3063\u3068\u898B\u308B',
    'btn-refresh-plan': 'プランだけ作り直す',
    'btn-undo': '↩ 元に戻す', 'btn-redo': '↪ やり直し',
    'tagline': '行きたい場所を伝えるだけで、日本旅行のプランをまるっと作ります。',
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
    'label-depart-date': '往路', 'label-return-date': '復路',
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
    'ai-chat-title': '言葉でリクエスト',
    'ai-itinerary': '旅のプラン',
    'itinerary-map': '\u30D7\u30E9\u30F3\u5730\u56F3',
    'weather-title': '\u5929\u6C17\u4E88\u5831',
    'manual-flight': '\u822A\u7A7A\u5238\u3092\u624B\u52D5\u5165\u529B',
    'manual-stay': '\u5BBF\u6CCA\u3092\u624B\u52D5\u5165\u529B',
    'modal-add-plan': 'プランに入れる',
    'modal-day-select': '日付', 'modal-timeslot': '\u6642\u9593\u5E2F',
    'slot-morning': '\u5348\u524D', 'slot-afternoon': '\u5348\u5F8C', 'slot-allday': '\u7D42\u65E5',
    'slot-breakfast': '朝食', 'slot-lunch': '昼食', 'slot-dinner': '夕食',
    'panel-checklist': '\u2705 \u65C5\u884C\u6E96\u5099\u30C1\u30A7\u30C3\u30AF\u30EA\u30B9\u30C8',
    'panel-emergency': '\uD83C\uDD98 \u7DCA\u6025\u60C5\u5831',
    'panel-phrases': '🗣️ 旅行会話',
    'panel-weather': '🌤️ 天気予報',
    'panel-export': '\uD83D\uDCCB \u30D7\u30E9\u30F3\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8',
    'panel-wishlist': '\u2764\uFE0F \u304A\u6C17\u306B\u5165\u308A',
    'panel-search-history': '🕘 検索履歴',
    'panel-myplans': '📂 保存済みプラン',
    'export-pdf': '📄 PDF保存',
    'export-text': '\uD83D\uDCC4 \u30C6\u30AD\u30B9\u30C8\u30B3\u30D4\u30FC',
    'export-markdown': '\uD83D\uDCDD \u30DE\u30FC\u30AF\u30C0\u30A6\u30F3\u30B3\u30D4\u30FC',
    'export-link': '🔗 共有',
    'login-title': 'ログイン', 'save-title': '💾 プランを保存',
    'tours-note': '\u4EBA\u6C17\u30C4\u30A2\u30FC\u3068\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u3092\u30C1\u30A7\u30C3\u30AF\u3002(Klook\u63D0\u4F9B)',
    'no-results': '\u7D50\u679C\u306A\u3057',
    'add-to-plan': '+ プランに入れる',
    'promote-to-rec': '\u2196\uFE0F \u304A\u3059\u3059\u3081\u306B\u8FFD\u52A0',
    'err-rate-limit': 'リクエストが多すぎます。しばらくしてからもう一度お試しください。',
    'err-need-plan': '先に［プランを作る］でプランを作ってください。',
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
    'selected-mark': '✓ プランに反映済み',
    'include-ai': 'プランに反映',
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
    'edit': '✏️ 編集',
    'delete': '✕ 削除',
    'room': '客室 ',
    'rooms-label': '部屋 ',
    'guests-label': ' · 人数 ',
    'per-night-unit': 'ウォン/泊',
    'meal-breakfast': '朝食',
    'meal-lunch': '昼食',
    'meal-dinner': '夕食',
    'time-morning': '午前',
    'time-afternoon': '午後',
    'time-allday': '終日',
    'chat-user': 'わたし',
    'chat-enter-msg': '行きたい場所や希望を入力してください。',
    'chat-processing': 'リクエストを反映してプランを作ります。',
    'chat-error': 'リクエストを処理できませんでした: ',
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
    'mock-notice': '現在サンプルデータを表示しています。',
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
    'copy-text-done': 'テキストをコピーしました。',
    'copy-md-done': 'マークダウンをコピーしました。',
    'copy-itin-done': 'プランをコピーしました。',
    'weather-loading': '天気を読み込み中…',
    'weather-error': '天気情報を取得できませんでした。',
    'logout-confirm': 'ログアウトしますか？',
    'login-required': 'ログインが必要です。',
    'save-success': 'プランを保存しました。',
    'no-plan-yet': '先に［プランを作る］でプランを作ってください。',
    'add-to-plan-btn': '+ プランに入れる',
    'promote-food': '⬆ おすすめグルメに追加',
    'wishlist-add': 'お気に入りに追加しました',
    'wishlist-remove': 'お気に入りから外しました',
    'korea': '韓国',
    'japan': '日本',
    'airport-suffix': '空港',
    'drag-handle': '☰ ドラッグでプランへ',
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
    'err-multicity': '多都市検索には2区間以上が必要です。',
    'model-label': ' [モデル: ',
    'chat-method': 'チャット解析: ',
    'manual-input': '手動入力',
    'err-airline-required': '航空会社か便名を入力してください。',
    'err-stay-required': '宿泊施設名を入力してください。',
    'err-return-date': '復路は往路より前にできないため、往路の日付に合わせました。',
    'err-checkout-date': 'チェックアウトはチェックインの翌日以降です。翌日に合わせました。',
    'share-title': '旅行プラン',
    'fx-loading': '¥/₩ 読み込み中...',
    'fx-fallback': '¥/₩ 為替情報なし',
    'provider-naver': 'Naver',
    'provider-kakao': 'Kakao',
    'btn-save-plan': '💾 保存',
    'btn-my-plans': '📂 プラン',
    'btn-logout': 'ログアウト',
    'btn-login': '👤 ログイン',
    'err-no-plan-save': '保存するプランがありません。先にプランを作ってください。',
    'plan-title-suffix': '日間の旅',
    'btn-save': '保存',
    'btn-overwrite': '上書き',
    'overwrite-confirm': ' は既に存在します。',
    'overwrite-note': ')に保存済み<br>保存すると既存のプランを上書きします。',
    'save-overwrite-done': 'プランを上書きしました。',
    'save-fail': '保存できませんでした。',
    'save-error': '保存中に問題が起きました。',
    'store-unavailable': '保存先に接続できません。しばらくしてからもう一度お試しください。',
    'plan-limit': '保存できるプランは{n}件までです。使わないプランを削除してからもう一度保存してください。',
    'plan-too-large': 'プランが大きすぎて保存できません。航空券・宿泊の検索結果を減らしてからもう一度保存してください。',
    'plan-invalid': '保存できない文字が含まれています。タイトルやメモを直してからもう一度保存してください。',
    'loading-plans': '読み込み中...',
    'no-saved-plans': '保存したプランはまだありません。',
    'plan-default': 'プラン',
    'days-saved': '日 · ',
    'btn-load': '読み込み',
    'btn-delete': '削除',
    'load-list-error': 'プラン一覧を読み込めませんでした。',
    'load-fail': '読み込めませんでした。',
    'load-success': 'プランを読み込みました。',
    'load-error': '読み込み中に問題が起きました。',
    'delete-confirm': 'このプランを削除しますか？',
    'delete-success': 'プランを削除しました。',
    'delete-fail': '削除できませんでした。',
    'delete-error': '削除中に問題が起きました。',
    'route-need-2': '交通費を計算するには、この日に2か所以上が必要です。',
    'calculating': '計算中...',
    'free-label': '無料',
    'source-ai-calc': '✨ AI計算',
    'source-dist-est': '📏 距離に基づく推定',
    'source-google-route': '🗺 Google経路情報',
    'err-input': '入力内容を確認してください。',
    'source-ai-google': '✨ AI + Google Places',
    'source-rule-fb': '📋 ルールベース (フォールバック)',
    'source-ai-rec': '✨ AIおすすめ',
    'rec-prefix': 'おすすめ: ',
    'flight-prefix': '航空券: ',
    'food-prefix': 'グルメ: ',
    'stay-prefix': '宿泊: ',
    'err-need-plan-first': '先に［プランを作る］でプランを作ってください。',
    'memo-saved': 'メモを保存しました',
    'memo-deleted': 'メモを削除しました',
    'no-auth-config': '現在ログインサービスが設定されていません。',
    'logged-out': 'ログアウトしました。',
    'plan-saved-overwrite': 'プランを上書きしました。',
    'plan-saved': 'プランを保存しました。',
    'popup-blocked': 'ポップアップがブロックされました。このサイトのポップアップを許可してください。',
    'history-cleared': '検索履歴を削除しました。',
    'remove-segment': '削除',
    'loading': '処理中…',
    'err-timeout': 'サーバーの応答が遅れています。しばらくしてからもう一度お試しください。',
    'err-network': 'ネットワークに接続できません。接続を確認してください。',
    'err-server': 'サーバーで問題が起きました。しばらくしてからもう一度お試しください。',
    'confirm-time-conflict': 'この時間帯にはすでに予定があります。追加しますか？',
    'search-flights': '検索',
    'search-stays': '検索',
    'btn-run': 'AIおすすめ',
    'btn-run-sync': '一括生成',
    'partial-failure': '一部のデータを取得できませんでした',
    'open-now': '営業中',
    'empty-dest': '言葉でリクエストするか条件を選んで［プランを作る］を押すと、おすすめスポット・プラン・航空券・宿がまとめて表示されます。',
    'empty-plan': 'まだプランがありません。上の［プランを作る］を押すと、日ごとのプランがここに表示されます。',
    'empty-rec-food': 'プランを作ると、周辺のおすすめグルメがここに表示されます。',
    'empty-rec-food-none': 'このプランに合うおすすめグルメがまだ見つかりません。下の［探索 › グルメ］で探してみてください。',
    'empty-flights': 'プランを作ると日程に合わせて航空券を探します。条件を変えて［航空券検索］を押すこともできます。',
    'empty-stays': 'プランを作ると日程に合わせて宿泊先を探します。条件を変えて［宿泊検索］を押すこともできます。',
    'empty-search': '［検索］を押すとここに結果が表示されます。',
    'empty-itinerary': 'プランを作成できませんでした。条件を少し変えるか、しばらくしてから［プランだけ作り直す］を押してください。各日の［+ スポット追加］から自分で埋めることもできます。',
    'map-no-coords': '地図に表示できる位置情報のある場所がまだありません。',
    'map-loading': '地図を読み込み中…',
    'map-failed': '地図を読み込めませんでした。各スポットの［地図］リンクで位置を確認できます。',
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
    'confirm-flight-dates-edited': 'この便は{dates}の日程で、現在の旅行日程と異なります。\n旅行日程だけをこの便に合わせますか（{days}日間）？編集したプランはそのままなので、日数はお知らせの［日数を合わせる］で合わせてください。',
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
    'aria-plan': 'リクエストと条件で旅行プランを作る',
    'ai-chat-note': '行きたい場所・日数・好みを書くと、下の条件を自動で埋めてプランを作ります。空欄なら下の条件どおりに作ります。',
    'ph-ai-request': '例: USJと道頓堀は必ず行きたい。3泊4日で、移動しやすい宿を教えて',
    'aria-ai-request': 'AIへの旅行条件の入力',
    'btn-ai-assist': 'この内容で作る',
    'aria-rec-tabs': 'おすすめの種類',
    'plan-control-copy': '選んだ航空券・宿はそのままに、プランだけ作り直します。',
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
    'filter-tab': '詳細フィルター',
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
    'drop-here': 'ここに置く',
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
    'wx-rain': '☔ 旅行中{n}日は雨の予報です。傘を忘れずに、屋内スポットも用意しましょう。',
    'wx-cold': '❄️ 寒い日があります。暖かい服を用意しましょう。',
    'wx-hot': '🔥 暑い日があります。水分補給と日焼け対策をしましょう。',
    'export-no-plan': 'まだプランがありません。先に［プランを作る］でプランを作ってください。',
    'export-flight': '航空券',
    'export-stay': '宿泊',
    'export-cost': '費用の目安',
    'cost-flight-line': '航空券: ',
    'cost-stay-line': '宿泊: ',
    'cost-food-line': '食費（目安）: ~',
    'cost-transport-line': '交通費（目安）: ~',
    'saved-default': '保存しました。',
    'alert-too-many': '{d}: スポット{n}か所は詰め込みすぎかもしれません。1日3か所以下が快適です。',
    'alert-no-meal': '{d}にグルメがありません。🍴 欄の［グルメを追加］から入れてみましょう。',
    'alert-allday': '{d}: 終日の予定と他のスポットが同じ日にあります。時間が重ならないか確認してください。',
    'alert-dup': '「{p}」が{d}で重複しています。',
    'alert-late-arrival': '{d}は夕方の到着です。初日はチェックインと近所の散策くらいがちょうどいいでしょう。',
    'alert-early-dep': '最終日は午前の出発です。2時間前に空港に着けるよう、前日に荷造りしておきましょう。',
    'memo-title': 'メモを追加・編集',
    'fx-chip': '100円≈{a}ウォン | 1万ウォン≈{b}円',
    'fx-title': '為替レート（1円={r}ウォン）· {d}',
    'fx-credit': '為替レート提供: Exchange Rate API',
    'weather-credit': '天気データ: Open-Meteo.com',
    'auth-err-state': 'ログインの確認時間が過ぎたか、別のウィンドウでログインを始めたようです。もう一度お試しください。',
    'auth-err-provider': '{p}でのログインを完了できませんでした。しばらくしてからもう一度お試しください。',
    'auth-err-generic': 'ログインを完了できませんでした。しばらくしてからもう一度お試しください。',
    'auth-err-not-allowed': 'このアプリには許可されたアカウントだけがログインできます。',
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
    'drop-kind-mismatch': 'グルメは朝食・昼食・夕食の枠に、スポットは午前・午後・終日の枠に置いてください',
    'place-noop': 'すでにその枠に入っています。',
    'confirm-replace-meal': 'この食事枠には{n}があります。入れ替えますか？',
    'confirm-duplicate-place': '{n}はこの日の予定にすでにあります。もう一度追加しますか？',
    'added-to-plan-toast': '{n}を{d}日目の{p}に追加しました',
    'moved-in-plan': '{n}を{d}日目の{p}に移動しました',
    'meal-slots-full': 'この日の食事枠はすべて埋まっています。入れ替える枠に直接置いてください',
    'day-label': '{n}日目',
    'tips-title': '💡 旅のヒント',
    'btn-move': '移動',
    'aria-remove-item': 'プランから外す',
    'btn-add-place': '+ スポット追加',
    'modal-custom-hint': 'リストにない場合は名前を入力',
    'modal-move-plan': '別の日・時間帯へ移動',
    'btn-move-confirm': 'ここへ移動',
    'modal-need-place': 'スポットを選ぶか名前を入力してください',
    'meal-extra': '追加の食事',
    'confirm-overwrite-edits': '手で直した予定が新しいプランに置き換わります。続けますか？（↩ 元に戻すで戻せます）',
    'regen-hint': '航空券・宿が変わりました。時間に合わせて組み直すには［プランだけ作り直す］を押してください。',
    'regen-undo-hint': '新しいプランに置き換えました。↩ 元に戻すで戻せます。',
    'confirm-overwrite-during-build': '新しいプランの作成中に予定を手で直しました。新しいプランに置き換えますか？（キャンセルすると直した予定をそのまま残します）',
    'regen-kept-edits': '直した予定はそのまま残しました。おすすめ一覧だけ更新しました。',
    'confirm-time-overlap': '{day}のこの時間にはすでに「{n}」({t})があります。それでもここに入れますか？',
    'alert-time-overlap': '{d}：「{a}」と「{b}」の時間が重なっています。時間を確認してください。',
    'itin-night': '夜',
    'intent-budget-low': '予算控えめ',
    'intent-budget-high': '予算ゆったり',
    'days-clamped': '旅行日数は1〜10日に合わせました',
    'trip-changed': '旅行条件が変わりました。プランをどう合わせますか？',
    'btn-shift-dates': '日付だけ移す',
    'btn-fit-days': '日数を合わせる',
    'btn-rebuild': '作り直す',
    'confirm-trim-days': '後ろの{n}日分の予定が消えます。続けますか？',
    'err-cities': '都市リストを読み込めませんでした。サーバーが起動中の可能性があります。',
    'btn-retry': '再試行',
    'copy-done': 'コピーしました',
    'copy-fail': 'コピーできませんでした。ブラウザのクリップボード権限を確認してください。',
    'draft-found': '保存していないプランがあります（{t}）',
    'btn-draft-restore': '続きから編集',
    'btn-draft-discard': '破棄',
    'phrases-none': '該当するフレーズがありません。',
    'cabin-economy': 'エコノミー',
    'cabin-premium': 'プレミアムエコノミー',
    'cabin-business': 'ビジネス',
    'cabin-first': 'ファースト',
    'baggage-label': '手荷物 ',
    'chat-ai-name': 'Tabimaru',
    'btn-plan-busy': '作成中…',
    'btn-plan-save': '💾 保存',
    'btn-plan-export': '📋 書き出し・共有',
    'ai-score-title': 'AIおすすめ度 {n}/100',
    'alert-summary': '📊 確認ポイント{n}件',
    'alert-dup-same-day': '「{p}」が{d}に2回以上入っています。',
    'day-list-sep': '・',
    'plan-building': 'プランを作成中です…通常10〜20秒かかります。',
    'server-waking': '無料サーバーを起動しています。最大1分ほどかかることがあります。',
    'plan-ready': 'プランができました ↓',
    'chat-done': 'プランができました。下の「旅のプラン」で確認して、ドラッグで入れ替えてみてください。',
    'ai-busy-retry': '1分ほどしてから［プランだけ作り直す］を押してみてください。',
    'ai-daily-retry': 'AIの利用枠は日本時間の午後4〜5時に戻ります。そのあと［プランだけ作り直す］を押してみてください。',
    'weather-out-of-range': '旅行日はまだ予報の範囲外のため、今日からの予報を表示しています。',
    'weather-partial-range': '旅行{d}日のうち{n}日だけが予報の範囲内です。残りの日はまだ予報がありません。',
    'weather-days': '{city} {n}日間の予報',
    'login-to-save': '保存するにはログインが必要です。ログイン後にもう一度［保存］を押してください。',
    'cost-activity-line': 'アクティビティ（目安）: ~',
    'cost-total-line': '合計（目安）: ~',
    'memo-input-label': '{p}のメモ',
    'memo-placeholder': '例: 10時に予約、チケットは事前購入',
    'memo-save-fail': 'メモを保存できませんでした。ブラウザの保存設定を確認してください。',
    'intent-days': '{n}日間',
    'intent-start': '{date}出発',
    'intent-theme': 'テーマ: {t}',
    'intent-must': '必ず行く: {p}',
    'intent-excluded': '除外: {p}',
    'intent-unsupported': '反映できず: {p}',
    'must-missing': '{names}はプランに入れられませんでした。［+ スポット追加］から自分で追加できます。',
    'aria-hide-pick': 'おすすめから隠す',
    'aria-wishlist': '{p}をお気に入りに追加',
    'aria-wishlist-remove': '{p}をお気に入りから外す',
    'city-popular': '人気の都市',
    'city-all': 'すべての都市',
    'plan-summary': '{city} {d}日間・スポット{p}件・グルメ{f}件',
    'plan-lang-note': 'このプランは{lang}で作成されました。切り替えるには［プランだけ作り直す］を押してください。',
    'lang-name-ko': '韓国語',
    'lang-name-en': '英語',
    'lang-name-ja': '日本語',
    'map-food-no-coords': 'グルメ{n}件は位置情報がありません',
    'map-legend-meal': '食事',
    'food-no-genre-match': 'このジャンルに合うお店はまだ見つかりません。別のジャンル（例: ラーメン、寿司）で検索してみてください。',
    'intent-food': 'グルメ: {f}',
    'intent-cond-indoor': '屋内中心',
    'intent-cond-late-start': '{t}以降に開始',
    'intent-cond-max-places': '1日{n}か所',
    'intent-cond-rest-day': '途中に休息日',
    'intent-cond-transit': '公共交通機関のみ',
    'intent-cond-no-shopping': 'ショッピングなし',
    'intent-cond-low-walking': '歩く距離を少なく',
    'intent-cond-kids': '子連れ向け',
    'intent-cond-relaxed': 'ゆったり日程',
    'intent-cond-night-view': '夜景を入れる',
    'intent-cond-arrival': '{t}到着',
    'intent-cond-departure': '{t}出発の便'
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

// [data-i18n] 글자, placeholder·title·aria-label, 섹션 제목, 주요 버튼 글자를 현재 언어 사전 값으로 맞춘다.
// 부팅 때(ko 포함) 한 번, 언어를 바꿀 때마다 부른다 → 화면 문구의 기준은 언제나 사전이다.
function applyStaticI18n() {
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
}

function applyLanguage(lang) {
  currentLang = lang;
  try { localStorage.setItem('travelLang', lang); } catch (e) {}
  document.documentElement.lang = lang === 'ko' ? 'ko' : lang === 'ja' ? 'ja' : 'en';
  applyStaticI18n();
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.lang === lang);
    btn.setAttribute('aria-pressed', btn.dataset.lang === lang ? 'true' : 'false');
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
    rerenderIntentChips();
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
    // 날짜가 들어간 초안 안내는 새 언어로 다시 만든다(나머지 안내 띠는 data-i18n으로 바뀐다).
    var draftBanner = el('draftRestoreBanner');
    if (pendingDraft && draftBanner && !draftBanner.classList.contains('hidden')) showDraftBanner();
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

// 문서를 다 읽은 뒤(창·패널은 이 스크립트보다 뒤에 있다) 사전 문구와 아이콘 버튼 title을 한 번 맞춘다.
function onDocumentReadyI18n() {
  try { applyStaticI18n(); ensureIconButtonTitles(); } catch (e) {}
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.setAttribute('aria-pressed', btn.dataset.lang === currentLang ? 'true' : 'false');
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onDocumentReadyI18n);
else onDocumentReadyI18n();

// 로그인 실패 안내는 언어 사전(I18N)과 토스트 요소(#memoToast, 이 스크립트보다 뒤에 있음)가 준비된 뒤 띄운다.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showAuthErrorNotice);
else showAuthErrorNotice();

