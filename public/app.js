function setToday(id) {
  const node = document.getElementById(id);
  if (node && !node.value) node.value = new Date().toISOString().slice(0, 10);
}

['startDate', 'departDate', 'returnDate', 'checkIn'].forEach(setToday);

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
      const hay = normalizeText(`${a.code} ${a.nameKo} ${a.cityKo}`);
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
  return `${a.code} | ${a.cityKo} ${a.nameKo} (${a.country === 'KR' ? '한국' : '일본'})`;
}

function airportCityByCode(code) {
  return AIRPORTS.find((a) => a.code === String(code || '').toUpperCase())?.cityKo || '';
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

  panel.innerHTML = list.map((a) => `<button type="button" class="airport-option" data-code="${a.code}">${airportLabel(a)}</button>`).join('');
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
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function initCityOptions() {
  const res = await fetch('/api/cities');
  const data = await res.json();
  const cities = (data.cities || []).sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  cityCatalog = cities;
  for (const c of cities) {
    if (!AIRPORTS.some((a) => a.code === c.airport)) {
      AIRPORTS.push({ code: c.airport, nameKo: `${c.label} 공항`, cityKo: c.label, country: 'JP' });
    }
  }
  const options = cities.map((c) => `<option value="${c.key}">${c.label} (${c.airport})</option>`).join('');
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
  const text = `${cityMeta.label} (${cityMeta.airport || 'N/A'})`;
  ['city', 'foodCity', 'stayCity'].forEach((id) => {
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

function categoryIcon(cat) {
  if (!cat) return '';
  var s = String(cat);
  if (s.indexOf('역사') >= 0 || s.indexOf('문화') >= 0) return '🏯';
  if (s.indexOf('자연') >= 0 || s.indexOf('공원') >= 0 || s.indexOf('정원') >= 0) return '🌿';
  if (s.indexOf('도시') >= 0 || s.indexOf('번화가') >= 0) return '🏙️';
  if (s.indexOf('쪰핑') >= 0 || s.indexOf('마켓') >= 0) return '🛍️';
  if (s.indexOf('신사') >= 0 || s.indexOf('사원') >= 0) return '⛩️';
  if (s.indexOf('박물관') >= 0 || s.indexOf('미술') >= 0) return '🏛️';
  if (s.indexOf('전망') >= 0 || s.indexOf('타워') >= 0) return '🗼';
  if (s.indexOf('어뮤즈') >= 0 || s.indexOf('테마파크') >= 0) return '🎢';
  if (s.indexOf('음식') >= 0 || s.indexOf('맛집') >= 0 || s.indexOf('레스토랑') >= 0) return '🍽️';
  if (s.indexOf('관광') >= 0) return '🎯';
  return '📍';
}

function cardPhoto(url, name) {
  if (url) return '<div class="card-photo" style="background-image:url(' + escapeHtml(url) + ')"></div>';
  var letter = (name || '?').charAt(0);
  return '<div class="card-photo card-photo-none">' + escapeHtml(letter) + '</div>';
}

function appendAiChat(role, text) {
  const box = el('aiChatLog');
  if (!box) return;
  const cls = role === 'user' ? 'user' : 'assistant';
  const label = role === 'user' ? '사용자' : 'AI';
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg ${cls}"><strong>${label}</strong><br>${escapeHtml(text)}</div>`);
  box.scrollTop = box.scrollHeight;
}

function syncDatesToDependentForms() {
  const start = el('startDate').value || new Date().toISOString().slice(0, 10);
  const days = Math.max(1, Number(el('days').value) || 1);
  el('departDate').value = start;
  el('returnDate').value = addDays(start, Math.max(0, days - 1));
  el('checkIn').value = start;
  el('checkOut').value = addDays(start, Math.max(1, days));
}

function applyAiConditions(parsed) {
  if (!parsed) return;
  if (parsed.cityKey && cityCatalog.some((c) => c.key === parsed.cityKey)) {
    el('city').value = parsed.cityKey;
    el('foodCity').value = parsed.cityKey;
    el('stayCity').value = parsed.cityKey;
    if (el('destSearchCity')) el('destSearchCity').value = parsed.cityKey;
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

function addDays(dateText, offset) {
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function ensureCheckOutDate() {
  const inDate = el('checkIn').value;
  if (!inDate) return;
  const outDate = el('checkOut').value;
  if (!outDate) {
    el('checkOut').value = addDays(inDate, 2);
    return;
  }
  const inTime = new Date(inDate).getTime();
  const outTime = new Date(outDate).getTime();
  if (Number.isFinite(inTime) && Number.isFinite(outTime) && outTime <= inTime) {
    el('checkOut').value = addDays(inDate, 2);
  }
}

function renderCards(targetId, items, mode) {
  const target = el(targetId);
  if (!items || items.length === 0) {
    target.innerHTML = '<div class="card">결과 없음</div>';
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
          ${cardPhoto(x.photoUrl, x.name)}
          <div class="card-body">
            <h4>${categoryIcon(x.category)} ${escapeHtml(x.name)}</h4>
            <div class="card-info-row">${escapeHtml(x.category || '')} · ${escapeHtml(x.area || x.city || '')}</div>
            <div class="card-scores">${aiScoreBadge(x.aiScore)} ${starRating(x.score)}</div>
          </div>
        </div>
        <span class="drag-hint">☰ 드래그</span>
        <div class="link-row">
          <a href="${x.mapUrl}" target="_blank" rel="noreferrer">지도</a>
          <button type="button" class="rec-delete-btn" data-delete-type="dest" data-delete-index="${index}">✕</button>
        </div>
      </article>`;
    }

    return `<article class="card">
      <div class="card-layout">
        ${cardPhoto(x.photoUrl, x.name)}
        <div class="card-body">
          <h4>${escapeHtml(x.name)}</h4>
          <div class="card-info-row">${escapeHtml(x.genre || '')} · ${escapeHtml(x.area || '')}</div>
          <div class="card-scores">${aiScoreBadge(x.aiFit)} ${starRating(x.score)} ${priceYen(x.priceLevel)}</div>
        </div>
      </div>
      <div class="link-row">
        <button type="button" class="add-to-plan-btn" data-add-type="food" data-add-index="${index}" data-add-source="foodSearch">일정에 추가</button>
        <a href="${x.mapUrl}" target="_blank" rel="noreferrer">지도</a>
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
          `${s.departureTime} → ${s.arrivalTime}`,
          `${s.from}(${airportCityByCode(s.from)}) ~ ${s.to}(${airportCityByCode(s.to)})`,
          s.flightNumber || '',
          s.cabinLabel || '',
          s.baggageLabel || ''
        ].filter(Boolean);
        return `<div class="flight-leg-row"><span class="airline-badge" title="${s.airline || ''}">${s.airlineCode || ''}</span>${parts.join(' · ')}</div>`;
      });
    }
    return [`<div class="flight-leg-row"><span class="airline-badge" title="${l.airline || ''}">${l.airlineCode || ''}</span>${l.departureTime} → ${l.arrivalTime} ${l.from}(${airportCityByCode(l.from)}) ~ ${l.to}(${airportCityByCode(l.to)}) ${l.airline}</div>`];
  }).join('');
  const selectedClass = x._id && x._id === selectedFlightId ? ' selected' : '';
  const selectedLabel = x._id && x._id === selectedFlightId ? '선택됨 (AI 일정 반영)' : 'AI 일정에 포함';

  return `<article class="card flight-card${selectedClass}">
    <div class="flight-top">
      <div class="flight-route">${route}</div>
      <div class="flight-price">${x.totalPriceKRW.toLocaleString()}원</div>
    </div>
    <div class="flight-sub">${dateRange}</div>
    <div class="flight-line">${legRows}</div>
    <div class="flight-meta">
      <span class="chip">${x.provider}</span>
      <span class="chip">총 ${x.totalDurationMin}분</span>
      <span class="chip">경유 ${x.totalStops}회</span>
    </div>
    <div class="flight-sub">항공사: ${(x.airlines || []).join(', ') || 'N/A'}</div>
    ${x.priceBreakdown ? `<div class="flight-sub">요금: 기본 ${x.priceBreakdown.baseKRW.toLocaleString()}원 · 세금 ${x.priceBreakdown.taxesKRW.toLocaleString()}원 · 수수료 ${x.priceBreakdown.feesKRW.toLocaleString()}원</div>` : ''}
    <div class="link-row">
      <button type="button" class="stay-select-btn flight-select-btn" data-flight-id="${x._id || ''}">${selectedLabel}</button>
      <a href="${x.deeplinkSkyscanner || x.deeplink || (x.legs[0] && x.legs[0].deeplink) || '#'}" target="_blank" rel="noreferrer">스카이스캐너</a>
      <a href="${x.deeplinkKayak || x.deeplink || (x.legs[0] && x.legs[0].deeplink) || '#'}" target="_blank" rel="noreferrer">카약</a>
    </div>
  </article>`;
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
  el('flightCards').innerHTML = cards.length > 0 ? cards.map(flightCardTemplate).join('') : '<div class="card">결과 없음</div>';

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

function renderItinerary(data) {
  const sourceTag = describeEngineSource(data.itinerarySource, 'itinerary');
  const labelNode = el('planSourceLabel');
  if (labelNode) {
    labelNode.textContent = '\uC77C\uC815 \uC0DD\uC131 \uBC29\uC2DD: ' + sourceTag;
  }
  const noteNode = el('planSourceNote');
  if (noteNode) {
    if (data.aiNote) {
      noteNode.textContent = data.aiNote;
      noteNode.classList.add('warn');
    } else {
      noteNode.textContent = '';
      noteNode.classList.remove('warn');
    }
  }
  currentItineraryData = data;
  stripServerMealBlocks();
  renderItineraryTimeline();
  renderPlanExtras();
  updateItinMap();
}

function renderItineraryTimeline() {
  var container = el('planResult');
  if (!container || !currentItineraryData) return;
  var data = currentItineraryData;
  var h = '';
  if (data.summary) {
    h += '<div class="itin-summary">' + escapeHtml(data.summary) + '</div>';
  }
  var mealPeriods = [
    { key: 'breakfast', period: '\uC544\uCE68', icon: '\uD83C\uDF73', color: '#ea580c', time: '08:00 - 09:30' },
    { key: 'lunch', period: '\uC810\uC2EC', icon: '\uD83C\uDF5C', color: '#0284c7', time: '12:00 - 13:30' },
    { key: 'dinner', period: '\uC800\uB141', icon: '\uD83C\uDF07', color: '#7c3aed', time: '18:00 - 20:00' }
  ];
  var destPeriods = [
    { key: 'morning', period: '\uC624\uC804', icon: '\uD83C\uDF05', color: '#059669', time: '09:00 - 12:00' },
    { key: 'afternoon', period: '\uC624\uD6C4', icon: '\uD83C\uDF1E', color: '#d97706', time: '13:00 - 17:00' },
    { key: 'allday', period: '\uC885\uC77C', icon: '\uD83C\uDF1F', color: '#dc2626', time: '09:00 - 18:00' }
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
        h += '<strong>도착</strong> ' + escapeHtml(fl.from || '') + ' → ' + escapeHtml(fl.to || '');
        if (arrTime) h += ' <span class="itin-fixed-time">' + escapeHtml(arrTime) + ' 도착</span>';
        h += '</div>';
      }
    }
    if (isLastDay && selectedFlight && selectedFlight.tripType === 'roundtrip') {
      var rl = selectedFlight.legs ? selectedFlight.legs[selectedFlight.legs.length - 1] : null;
      if (rl) {
        var depTime = rl.departureTime || '';
        h += '<div class="itin-fixed-block itin-flight-block itin-flight-departure">';
        h += '<span class="itin-fixed-icon">✈️</span> ';
        h += '<strong>출발</strong> ' + escapeHtml(rl.from || '') + ' → ' + escapeHtml(rl.to || '');
        if (depTime) h += ' <span class="itin-fixed-time">' + escapeHtml(depTime) + ' 출발</span>';
        h += '</div>';
      }
    }
    if (selectedStay) {
      var stayLabel = isFirstDay ? '체크인' : isLastDay ? '체크아웃' : '숙소';
      h += '<div class="itin-fixed-block itin-stay-block">';
      h += '<span class="itin-fixed-icon">🏨</span> ';
      h += '<strong>' + stayLabel + '</strong> ' + escapeHtml(selectedStay.name || '');
      if (selectedStay.area) h += ' <span class="itin-place-info">' + escapeHtml(selectedStay.area) + '</span>';
      h += '</div>';
    }

    // --- Travel spots section (period zones) ---
    h += '<div class="itin-section-label">\uD83D\uDCCD \uC5EC\uD589\uC9C0</div>';
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
      h += '<div class="itin-period-header"><span style="color:' + dp.color + '">' + dp.icon + ' ' + dp.period + '</span><span class="itin-period-time">' + dp.time + '</span><span class="drop-hint">\uC5EC\uAE30\uC5D0 \uB4DC\uB86D</span></div>';
      if (filledSlots.length > 0) {
        for (var fsi = 0; fsi < filledSlots.length; fsi++) {
          var fs = filledSlots[fsi];
          h += '<div class="itin-slot-inline" draggable="true" data-itin-day="' + day.day + '" data-itin-period="' + escapeHtml(fs.period) + '" data-itin-block-index="' + fs._blockIndex + '">';
          var placeInfo = parsePlaceInfo(fs.place);
          var destMapQ = encodeURIComponent(placeInfo.name + (placeInfo.info ? ' ' + placeInfo.info : ''));
          var destMapUrl = 'https://www.google.com/maps/search/?api=1&query=' + destMapQ;
          h += '<div class="itin-slot-place">' + escapeHtml(placeInfo.name) + (placeInfo.info ? '<span class="itin-place-info">' + escapeHtml(placeInfo.info) + '</span>' : '') + '<a href="' + destMapUrl + '" target="_blank" rel="noreferrer" class="itin-map-link" title="Google Maps">MAP</a></div>';
          if (fs.subs.length > 0) {
            h += '<div class="itin-sub-list">';
            for (var si = 0; si < fs.subs.length; si++) h += '<div class="itin-sub-item">' + escapeHtml(fs.subs[si].text) + '</div>';
            h += '</div>';
          }
          for (var ti = 0; ti < fs.tips.length; ti++) h += '<div class="itin-tip">\uD83D\uDCA1 ' + escapeHtml(fs.tips[ti].text) + '</div>';
          if (filledSlots.length > 1) {
            h += '<div class="itin-reorder-btns">';
            if (fsi > 0) h += '<button type="button" class="itin-reorder-btn" data-day="' + day.day + '" data-block-index="' + fs._blockIndex + '" data-direction="up" title="위로">▲</button>';
            if (fsi < filledSlots.length - 1) h += '<button type="button" class="itin-reorder-btn" data-day="' + day.day + '" data-block-index="' + fs._blockIndex + '" data-direction="down" title="아래로">▼</button>';
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
    h += '<div class="itin-section-label itin-drop-zone" data-drop-day="' + day.day + '" data-drop-type="food">\uD83C\uDF74 \uB9DB\uC9D1 <span class="drop-hint">\uC5EC\uAE30\uC5D0 \uB4DC\uB86D</span></div>';
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
        h += '<div class="itin-slot-header"><span class="itin-slot-period" style="color:' + mc + '">' + meal.icon + ' ' + escapeHtml(filled.period) + '</span>';
        h += '<span class="itin-slot-time">' + escapeHtml(filled.startTime + ' - ' + filled.endTime) + '</span></div>';
        var mealInfo = parsePlaceInfo(filled.place);
        var mealMapQ = encodeURIComponent(mealInfo.name + (mealInfo.info ? ' ' + mealInfo.info : ''));
        var mealMapUrl = 'https://www.google.com/maps/search/?api=1&query=' + mealMapQ;
        h += '<div class="itin-slot-place">' + escapeHtml(mealInfo.name) + (mealInfo.info ? '<span class="itin-place-info itin-place-loc">' + escapeHtml(mealInfo.info) + '</span>' : '') + '<a href="' + mealMapUrl + '" target="_blank" rel="noreferrer" class="itin-map-link" title="Google Maps">MAP</a></div>';
        h += '<button type="button" class="itin-remove-btn" data-day="' + day.day + '" data-period="' + escapeHtml(filled.period) + '">\uC0AD\uC81C</button>';
        h += '</div>';
      } else {
        h += '<div class="itin-meal-empty itin-drop-zone" data-drop-day="' + day.day + '" data-drop-type="food" data-drop-meal="' + meal.key + '" style="border-left-color:' + meal.color + '">';
        h += '<span class="itin-meal-label">' + meal.icon + ' ' + meal.period + '</span>';
        h += '<button type="button" class="itin-meal-add-btn" data-day="' + day.day + '" data-meal-slot="' + meal.key + '">\uB9DB\uC9D1 \uCD94\uAC00</button>';
        h += '</div>';
      }
    }

    h += '<div class="itin-route-cost-section">';
    h += '<button type="button" class="itin-route-cost-btn" data-route-day="' + day.day + '">🚃 경로 교통비 계산</button>';
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
  const total = stay.totalPriceKRW ? `${stay.totalPriceKRW.toLocaleString()}원` : '';
  return `${stay.name} (${stay.area}) ${dates} · 총 ${total}`;
}

function selectionFlightCard(flight) {
  if (!flight) return '';
  const first = flight.legs?.[0];
  const last = flight.legs?.[flight.legs.length - 1];
  const destAirport = flight.tripType === 'roundtrip' ? (first?.to || '도착 미정') : (last?.to || first?.to || '도착 미정');
  const route = `${first?.from || '출발 미정'} → ${destAirport}`;
  const dateRange = first?.date === last?.date ? first?.date : `${first?.date || ''} ~ ${last?.date || ''}`;
  const price = flight.totalPriceKRW ? `${flight.totalPriceKRW.toLocaleString()}원` : '요금 미확인';
  const airlines = (flight.airlines || []).join(', ') || (flight.provider || '항공사 정보 없음');
  var outboundTime = first ? (first.departureTime || '') + ' → ' + (first.arrivalTime || '') : '';
  var returnTime = '';
  if (flight.tripType === 'roundtrip' && last && last !== first) {
    returnTime = last.departureTime ? (last.departureTime || '') + ' → ' + (last.arrivalTime || '') : '';
  }
  return `
    <article class="selection-card">
      <div class="selection-card-title">선택 항공권
        <span class="selection-card-actions">
          <button type="button" class="selection-edit-btn" data-edit-type="flight">✏️수정</button>
          <button type="button" class="selection-delete-btn" data-delete-type="flight">✕삭제</button>
        </span>
      </div>
      <div class="selection-card-body">
        <strong>${route}</strong>
        <span class="selection-card-date">${dateRange}</span>
        <span>${price}</span>
        ${outboundTime ? '<span>✈️ 가는편: ' + outboundTime + '</span>' : ''}
        ${returnTime ? '<span>✈️ 오는편: ' + returnTime + '</span>' : ''}
        <span>항공사: ${airlines}</span>
      </div>
    </article>`;
}

function selectionStayCard(stay) {
  if (!stay) return '';
  const dates = stay.checkIn && stay.checkOut ? `${stay.checkIn} ~ ${stay.checkOut}` : stay.checkIn || stay.checkOut || '';
  const total = stay.totalPriceKRW ? `${stay.totalPriceKRW.toLocaleString()}원` : '가격 정보 없음';
  const perNight = stay.pricePerNightKRW ? `${stay.pricePerNightKRW.toLocaleString()}원/박` : '';
  const provider = stay.provider || '숙소 제공사 없음';
  const amenities = (stay.amenities || []).slice(0, 3).join(', ');
  return `
    <article class="selection-card">
      <div class="selection-card-title">선택 숙소
        <span class="selection-card-actions">
          <button type="button" class="selection-edit-btn" data-edit-type="stay">✏️수정</button>
          <button type="button" class="selection-delete-btn" data-delete-type="stay">✕삭제</button>
        </span>
      </div>
      <div class="selection-card-body">
        <strong>${stay.name}</strong>
        <span>${stay.area} · ${provider}</span>
        <span>${dates}</span>
        <span>${perNight} · 총 ${total}</span>
        ${amenities ? `<span>편의시설: ${amenities}</span>` : ''}
      </div>
    </article>`;
}


function renderBudgetSummary() {
  var wrap = el('budgetSummary');
  if (!wrap) return;
  var flightCost = selectedFlight ? selectedFlight.totalPriceKRW : 0;
  var stayCost = selectedStay ? (selectedStay.totalPriceKRW || selectedStay.totalKRW || 0) : 0;
  var days = Number(el('days').value) || 4;
  var mealPerDay = 55000;
  var transportPerDay = 22000;
  var activityPerDay = 25000;
  var mealTotal = mealPerDay * days;
  var transportTotal = transportPerDay * days;
  var activityTotal = activityPerDay * days;
  var total = flightCost + stayCost + mealTotal + transportTotal + activityTotal;
  var fmt = function(n) { return n.toLocaleString() + '원'; };
  var budgetLabel = '표준';
  wrap.innerHTML =
    '<h4>예상 비용 요약</h4>' +
    '<div class="budget-rows">' +
      '<div class="budget-row"><span>✈️ 항공권</span><span>' + (flightCost ? fmt(flightCost) : '미선택') + '</span></div>' +
      '<div class="budget-row"><span>🏨 숙소 (' + (selectedStay ? (selectedStay.nights || Math.max(1, days - 1)) + '박' : '-') + ')</span><span>' + (stayCost ? fmt(stayCost) : '미선택') + '</span></div>' +
      '<div class="budget-row"><span>🍜 식비</span><span>~' + fmt(mealTotal) + '</span></div>' +
      '<div class="budget-row"><span>🚃 교통비</span><span>~' + fmt(transportTotal) + '</span></div>' +
      '<div class="budget-row"><span>🎫 활동비</span><span>~' + fmt(activityTotal) + '</span></div>' +
      '<div class="budget-row budget-total"><span>합계 (예상)</span><span>~' + fmt(total) + '</span></div>' +
    '</div>' +
    '<div class="budget-note">' + budgetLabel + ' 기준 · 1인 · ' + days + '일 · 식비/교통/활동은 예상치</div>';
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

  container.innerHTML = cards.join('') || '<div class="selection-card">선택된 항공권/숙소가 없습니다.</div>';

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
    name: dest.name || '추천 여행지',
    city: dest.city || el('city').options[el('city').selectedIndex]?.text || '',
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
    startDate: el('startDate').value,
    days: Number(el('days').value),
    pace: 'normal',
    budget: 'mid',
    useAi: true,
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

function describeEngineSource(source, mode = 'chat') {
  const s = String(source || '').toLowerCase();
  if (!s) return 'ℹ️ 규칙기반 (기본)';
  // Extract model name from parentheses if present: "gemini_itinerary_v1 (gemini-2.0-flash)"
  var modelMatch = String(source || '').match(/\(([^)]+)\)/);
  var modelName = modelMatch ? modelMatch[1] : '';
  if (s.includes('gemini')) return '✨ AI 기반 (Gemini' + (modelName ? ' - ' + modelName : '') + ')';
  if (s.includes('openai')) return '✨ AI 기반 (OpenAI)';
  if (s.includes('ai_planner')) return '✨ AI 기반 (Planner)';
  if (s.includes('rule')) return '📋 규칙기반 (AI 미응답 시 폴백)';
  if (s.includes('fallback') || s.includes('local_curated')) return '📋 규칙기반 (AI 미응답 시 폴백)';
  return `ℹ️ ${source}`;
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

async function runPlan(extra = {}, syncAux = false) {
  const payload = buildPlanPayload(extra);
  const data = await postJson('/api/travel-plan', payload);
  renderCards('destCards', data.recommendations, 'dest');
  if (data.recommendedFoods && data.recommendedFoods.length > 0) {
    latestRecFoodList = data.recommendedFoods.map(function(food) {
      return { name: food.name, city: food.city, genre: food.genre, area: food.area, score: food.score, reviewCount: food.reviewCount || 0, priceLevel: food.priceLevel, mapUrl: food.mapUrl, photoUrl: food.photoUrl || null, aiScore: food.aiFit || 70, aiFit: food.aiFit || 70, lat: food.lat || null, lng: food.lng || null };
    });
    renderRecFoodCards(latestRecFoodList);
  }
  const destSourceNote = el('destSourceNote');
  if (destSourceNote) {
    const src = data.recommendationSource || 'unknown';
    const isFallback = String(src).includes('fallback') || String(src).includes('local_curated');
    var destSrcLabel = String(src).includes('google') ? '✨ AI + Google Places 기반' : isFallback ? '📋 규칙기반 추천 (폴백)' : '✨ AI 기반 추천';
    destSourceNote.textContent = `추천 여행지: ${destSrcLabel} [${src}]`;
    destSourceNote.classList.toggle('warn', isFallback);
  }
  renderItinerary({
    summary: data.summary,
    itinerary: data.itinerary,
    tips: data.tips,
    itinerarySource: data.itinerarySource
  });

  if (!syncAux) return;

  // 통합 생성 시 항공/맛집도 동일 조건으로 자동 갱신
  const selectedCity = cityCatalog.find((c) => c.key === el('city').value);
  const startDate = el('startDate').value || new Date().toISOString().slice(0, 10);
  const days = Math.max(1, Number(el('days').value) || 1);
  const returnDate = addDays(startDate, Math.max(0, days - 1));

  if (selectedCity?.airport) {
    el('to').value = formatAirportDisplay(selectedCity.airport);
  }
  if (!el('from').value) {
    el('from').value = formatAirportDisplay('ICN');
  }
  el('departDate').value = startDate;
  el('returnDate').value = returnDate;
  setTripTab(days > 1 ? 'roundtrip' : 'oneway');

  el('foodCity').value = el('city').value;
  el('btnFlights').click();
  el('btnFood').click();
  if (el('btnDestSearch')) el('btnDestSearch').click();
}

function segmentRowTemplate(index, from = '', to = '', date = '') {
  return `<div class="segment-row" data-index="${index}">
    <div class="airport-wrap"><input class="seg-from airport-input" value="${from}" placeholder="ICN" autocomplete="off" /><div class="airport-suggest"></div></div>
    <div class="airport-wrap"><input class="seg-to airport-input" value="${to}" placeholder="NRT" autocomplete="off" /><div class="airport-suggest"></div></div>
    <input class="seg-date" type="date" value="${date}" />
    <button type="button" class="remove-segment">삭제</button>
  </div>`;
}

function ensureDefaultSegmentDates() {
  const dates = document.querySelectorAll('.seg-date');
  dates.forEach((d, i) => {
    if (!d.value) {
      const base = new Date();
      base.setDate(base.getDate() + (i * 3));
      d.value = base.toISOString().slice(0, 10);
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
  el('stayAmenityChecks').innerHTML = (options?.amenities || []).map((name) => `<label class="check-item"><input type="checkbox" class="stay-amenity-check" value="${name}" />${name}</label>`).join('');
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
    await runPlan({}, false);
  } catch (err) {
    if (el('planResult')) el('planResult').textContent = `오류: ${err.message}`;
  }
}

async function selectFlightById(id) {
  if (selectedFlightId === id) {
    await clearFlightSelection();
    return;
  }
  const target = flightResults.find((x) => x._id === id);
  if (!target) return;
  selectedFlightId = id;
  selectedFlight = target;
  renderFlightCards(false);
  renderPlanExtras();
  renderItineraryTimeline();
  try {
    await runPlan({ flight: buildFlightPayload(target) }, false);
  } catch (err) {
    if (el('planResult')) el('planResult').textContent = `오류: ${err.message}`;
  }
}

function stayCardTemplate(x) {
  const priceNight = `${x.pricePerNightKRW.toLocaleString()}원/박`;
  const totalPrice = `${x.totalPriceKRW.toLocaleString()}원`;
  const meta = `${x.typeLabel} · 평점 ${x.rating} · ${x.area}`;
  const amenityChips = (x.amenities || []).slice(0, 4).map((a) => `<span class="chip">${a}</span>`).join('');
  const offerLine = x.offerId ? `오퍼 ${x.offerId}` : '';
  const roomLine = x.roomType ? `객실 ${x.roomType}` : '';
  const boardLine = x.boardType ? `식사 ${x.boardType}` : '';
  const cancelLine = x.cancellation ? `취소 ${x.cancellation}` : '';
  const detailLine = [offerLine, roomLine, boardLine, cancelLine].filter(Boolean).join(' · ');
  const priceLine = x.priceBreakdown
    ? `요금: 기본 ${x.priceBreakdown.baseKRW.toLocaleString()}원 · 세금 ${x.priceBreakdown.taxesKRW.toLocaleString()}원 · 수수료 ${x.priceBreakdown.feesKRW.toLocaleString()}원`
    : '';
  const selectedClass = x.id === selectedStayId ? ' selected' : '';
  return `<article class="card stay-card${selectedClass}" data-stay-id="${x.id}">
    <div class="stay-top">
      <div>
        <div class="stay-name">${x.name}</div>
        <div class="stay-meta">${meta}</div>
      </div>
      <div class="stay-price">
        <div class="stay-night">${priceNight}</div>
        <div class="stay-total">총 ${totalPrice}</div>
      </div>
    </div>
    <div class="stay-meta-row">${x.provider} · ${x.checkIn} ~ ${x.checkOut}</div>
    <div class="stay-meta-row">객실 ${x.rooms} · 인원 ${x.guests}</div>
    ${detailLine ? `<div class="stay-meta-row">${detailLine}</div>` : ''}
    ${priceLine ? `<div class="stay-meta-row">${priceLine}</div>` : ''}
    <div class="stay-meta-row stay-amenities">${amenityChips}</div>
    <div class="link-row">
      <button type="button" class="stay-select-btn" data-stay-id="${x.id}">
        ${x.id === selectedStayId ? '선택됨 (AI 일정 반영)' : 'AI 일정에 포함'}
      </button>
      <a href="${x.deeplink}" target="_blank" rel="noreferrer">예약 페이지</a>
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
  el('stayCards').innerHTML = sorted.length > 0 ? sorted.map(stayCardTemplate).join('') : '<div class="card">결과 없음</div>';
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

document.addEventListener('input', (event) => {
  const input = event.target.closest('.airport-input');
  if (input) renderAirportSuggest(input);
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
    closeAllAirportSuggest();
    return;
  }
  if (!event.target.closest('.airport-wrap')) closeAllAirportSuggest();
});

el('btnPlan').addEventListener('click', async () => {
    chatHistory = []; lastParsedConditions = null; aiPreferredAreas = []; aiRouteCities = []; aiRegionDayPlan = []; aiSpecialPrefs = {};
  try {
    resetFlightSelectionDisplay();
    selectStayById('');
    await runPlan({}, true);
    const stayStart = el('startDate').value || new Date().toISOString().slice(0, 10);
    el('stayCity').value = el('city').value;
    if (el('destSearchCity')) el('destSearchCity').value = el('city').value;
    el('checkIn').value = stayStart;
    el('checkOut').value = addDays(stayStart, Math.max(1, Number(el('days').value) || 2));
    el('btnStays').click();
  } catch (err) {
    el('planResult').textContent = `오류: ${err.message}`;
  }
});

el('btnAiAssist')?.addEventListener('click', async () => {
  const message = String(el('aiRequest')?.value || '').trim();
  if (!message) {
    appendAiChat('assistant', '요청 문장을 입력해 주세요.');
    return;
  }

  appendAiChat('user', message);
  try {
    const context = {
      city: el('city').value,
      theme: el('theme').value,
      budget: 'mid',
      days: Number(el('days').value || 4),
      startDate: el('startDate').value
    };
    const data = await postJson('/api/ai-travel-chat', { message, context });
    const aiSourceNote = el('aiSourceNote');
    if (aiSourceNote) {
      var chatModelInfo = data.aiModel ? ' [모델: ' + data.aiModel + ']' : '';
      const sourceLabel = describeEngineSource(data.source, 'chat');
      const extra = data.aiNote ? ` | ${data.aiNote}` : '';
      aiSourceNote.textContent = `채팅 해석 방식: ${sourceLabel}${chatModelInfo}${extra}`;
      aiSourceNote.classList.toggle('warn', sourceLabel.includes('규칙기반') || Boolean(data.aiNote));
    }
    if (data.cityMeta) upsertCityOption(data.cityMeta);
    applyAiConditions(data.parsed || {});

    appendAiChat('assistant', data.reply || '요청 내용을 반영해서 새 추천을 생성합니다.');
    resetFlightSelectionDisplay();
    selectStayById('');
    await runPlan({}, true);
    await el('btnStays').click();
  } catch (err) {
    appendAiChat('assistant', `요청 처리 중 오류가 발생했습니다: ${err.message}`);
  }
});

el('btnFlights').addEventListener('click', async () => {
  try {
    const multiSegments = readSegments();
    if (currentTripType === 'multicity' && multiSegments.length < 2) {
      el('flightCards').innerHTML = '<div class="card">다구간 검색은 최소 2개 구간이 필요합니다.</div>';
      el('btnFlightMore')?.classList.add('hidden');
      return;
    }

    const payload = {
      city: el('city').value,
      tripType: currentTripType,
      from: resolveAirportCode(el('from').value),
      to: resolveAirportCode(el('to').value),
      departDate: el('departDate').value,
      returnDate: el('returnDate').value,
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

    const data = await postJson('/api/flights', payload);
    const stamp = Date.now();
    flightResults = (data.flights || []).map((f, i) => ({ ...f, _id: `f${stamp}-${i}` }));
    selectedFlightId = null;
    renderFlightCards(true);
    renderFlightFilterChecks(data.filterOptions);
    const sourceNote = el('flightSourceNote');
    if (sourceNote) {
      if (data.source === 'mock') {
        sourceNote.textContent = data.note || '현재 더미 데이터로 표시 중입니다. (API 실패 또는 미연동)';
        sourceNote.classList.add('warn');
      } else {
        var flightSrcLabel = String(data.source).includes('mock') ? '📋 더미 데이터 (폴백)' : '✨ ' + data.source;
        sourceNote.textContent = `항공편: ${flightSrcLabel}`;
        sourceNote.classList.remove('warn');
      }
    }
  } catch (err) {
    el('flightCards').innerHTML = `<div class="card">오류: ${err.message}</div>`;
    el('btnFlightMore')?.classList.add('hidden');
  }
});

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
  pendingAddPlace = { name: name || '' };
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
    newBlock = slot.period + '(' + slot.start + '-' + slot.end + '): ' + pendingAddPlace.name + ' (' + foodArea + ')';
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
  latestRecFoodList = items || [];
  if (items.length === 0) {
    target.innerHTML = '<div class="card">\uACB0\uACFC \uC5C6\uC74C</div>';
    return;
  }
  target.innerHTML = items.map(function(x, index) {
    return '<article class="card" draggable="true" data-drag-type="food" data-drag-index="' + index + '">' +
      '<div class="card-layout">' +
        cardPhoto(x.photoUrl, x.name) +
        '<div class="card-body">' +
          '<h4>' + escapeHtml(x.name) + '</h4>' +
          '<div class="card-info-row">' + escapeHtml(x.genre || '') + ' \u00B7 ' + escapeHtml(x.area || '') + '</div>' +
          '<div class="card-scores">' + aiScoreBadge(x.aiFit) + starRating(x.score) + priceYen(x.priceLevel) + '</div>' +
        '</div>' +
      '</div>' +
      '<span class="drag-hint">\u2630 \uB4DC\uB798\uADF8</span>' +
      '<div class="link-row"><a href="' + (x.mapUrl || '#') + '" target="_blank" rel="noreferrer">\uC9C0\uB3C4</a>' +
      '<button type="button" class="rec-delete-btn" data-delete-type="food" data-delete-index="' + index + '">\u2715</button></div>' +
    '</article>';
  }).join('');
}

function renderDestSearchCards(items) {
  var target = el('destSearchCards');
  if (!target) return;
  latestDestSearchList = items || [];
  if (items.length === 0) {
    target.innerHTML = '<div class="card">\uACB0\uACFC \uC5C6\uC74C</div>';
    return;
  }
  target.innerHTML = items.map(function(x, index) {
    return '<article class="card">' +
      '<div class="card-layout">' +
        cardPhoto(x.photoUrl, x.name) +
        '<div class="card-body">' +
          '<h4>' + categoryIcon(x.category) + ' ' + escapeHtml(x.name) + '</h4>' +
          '<div class="card-info-row">' + escapeHtml(x.category || '') + ' · ' + escapeHtml(x.area || x.city || '') + '</div>' +
          '<div class="card-scores">' + aiScoreBadge(x.aiScore) + starRating(x.score) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="link-row">' +
        '<button type="button" class="add-to-plan-btn" data-add-type="dest" data-add-index="' + index + '" data-add-source="destSearch">\uC77C\uC815\uC5D0 \uCD94\uAC00</button>' +
        '<a href="' + (x.mapUrl || '#') + '" target="_blank" rel="noreferrer">\uC9C0\uB3C4</a>' +
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
    try {
      await runPlan({}, false);
    } catch (err) {
      el('planResult').textContent = `오류: ${err.message}`;
    }
  });
}

el('btnFood').addEventListener('click', async () => {
  try {
    const city = encodeURIComponent(el('foodCity').value);
    const genre = encodeURIComponent(el('foodGenre').value);
    const res = await fetch(`/api/foods?city=${city}&genre=${genre}&budget=mid`);
    const data = await res.json();
    latestFoodList = data.list || [];
  renderCards('foodCards', data.list, 'food');
    const sourceNote = el('foodSourceNote');
    if (sourceNote) {
      const source = data.source || 'unknown';
      const warning = data.warning ? ` · ${data.warning}` : '';
      var foodSrcLabel = String(source).includes('google') ? '✨ Google Places 기반' : String(source).includes('tabelog') ? '✨ 타베로그 스타일' : String(source).includes('curated') ? '📋 규칙기반 (폴백)' : '✨ ' + source;
      sourceNote.textContent = `맛집: ${foodSrcLabel}${warning}`;
      sourceNote.classList.toggle('warn', Boolean(data.warning));
    }
  } catch (err) {
    el('foodCards').innerHTML = `<div class="card">오류: ${err.message}</div>`;
  }
});

el('btnStays').addEventListener('click', async () => {
  try {
    ensureCheckOutDate();
    staySortMode = el('stayPreference').value || 'balanced';
    const payload = {
      city: el('stayCity').value,
      checkIn: el('checkIn').value,
      checkOut: el('checkOut').value,
      guests: Number(el('stayGuests').value || 2),
      rooms: Number(el('stayRooms').value || 1),
      preference: staySortMode,
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

    const data = await postJson('/api/stays', payload);
    stayResults = data.stays || [];
    renderStayCards();
    renderStayFilterChecks(data.filterOptions);
    const sourceNote = el('staySourceNote');
    if (sourceNote) {
      if (data.source === 'mock') {
        sourceNote.textContent = data.note || '현재 더미 데이터로 표시 중입니다. (API 실패 또는 미연동)';
        sourceNote.classList.add('warn');
      } else {
        var staySrcLabel = String(data.source).includes('mock') ? '📋 더미 데이터 (폴백)' : '✨ ' + data.source;
        sourceNote.textContent = `숙소: ${staySrcLabel}`;
        sourceNote.classList.remove('warn');
      }
    }
  } catch (err) {
    el('stayCards').innerHTML = `<div class="card">오류: ${err.message}</div>`;
  }
});

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

el('city').addEventListener('change', () => {
  el('foodCity').value = el('city').value;
  el('stayCity').value = el('city').value;
  if (el('destSearchCity')) el('destSearchCity').value = el('city').value;
  if (currentTripType === 'multicity') resetSegments();
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
    newBlock = slot.period + '(' + slot.start + '-' + slot.end + '): ' + item.name + ' (' + foodArea + ')';
  } else {
    var destArea = item.area || item.city || '';
    newBlock = slot.period + '(' + slot.start + '-' + slot.end + '): ' + item.name + (destArea ? ' (' + destArea + ')' : '');
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
  var m = { subway: '🚇 지하철', rail: '🚃 전철', bus: '🚌 버스', tram: '🚊 트램', transit: '🚍 대중교통', walking: '🚶 도보', estimated: '📍 추정', error: '⚠️ 오류' };
  return m[mode] || mode;
}
async function calculateDayRouteCost(dayNum) {
  var resultEl = document.getElementById('routeCostDay' + dayNum);
  if (!resultEl) return;
  var places = buildDayRouteOrder(dayNum);
  if (places.length < 2) { resultEl.innerHTML = '<div class="route-cost-empty">일정에 장소가 2개 이상 필요합니다.</div>'; return; }
  resultEl.innerHTML = '<div class="route-cost-loading">계산 중...</div>';
  try {
    var city = (el('city') && el('city').value) || 'tokyo';
    var resp = await fetch('/api/route-cost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ places: places, city: city }) });
    var data = await resp.json();
    if (data.error) { resultEl.innerHTML = '<div class="route-cost-empty">' + escapeHtml(data.error) + '</div>'; return; }
    var h = '<div class="route-cost-segments">';
    for (var i = 0; i < data.segments.length; i++) {
      var seg = data.segments[i];
      var fareText = seg.fareJPY > 0 ? '¥' + seg.fareJPY.toLocaleString() + ' (~' + seg.fareKRW.toLocaleString() + '원)' : '무료';
      h += '<div class="route-cost-seg' + (seg.estimated ? ' route-cost-estimated' : '') + '">';
      h += '<span class="route-seg-mode">' + modeLabel(seg.mode) + '</span>';
      h += '<span class="route-seg-route">' + escapeHtml(seg.from.split(' ')[0]) + ' → ' + escapeHtml(seg.to.split(' ')[0]) + '</span>';
      h += '<span class="route-seg-detail">' + seg.durationMin + '분 · ' + fareText + '</span>';
      if (seg.tip) h += '<span class="route-seg-tip">' + escapeHtml(seg.tip) + '</span>';
      h += '</div>';
    }
    h += '</div><div class="route-cost-total">합계: ¥' + data.totalFareJPY.toLocaleString() + ' (~' + data.totalFareKRW.toLocaleString() + '원) · 이동 ' + data.totalDurationMin + '분</div>';
    if (data.routeTip) h += '<div class="route-cost-tip">' + escapeHtml(data.routeTip) + '</div>';
    var routeModelInfo = data.aiModel ? ' [모델: ' + data.aiModel + ']' : '';
    var routeSourceLabel = data.source === 'ai' ? '✨ AI 기반 계산' + routeModelInfo : data.source === 'distance_estimate' ? '📏 거리 기반 추정 (AI 미응답 시 자동 폴백)' : data.source === 'directions_api' ? '🗺 Google 경로 API' : 'ℹ️ 추정치';
    h += '<div class="route-cost-source">' + routeSourceLabel + '</div>';
    resultEl.innerHTML = h;
    routeCostCache[dayNum] = data;
  } catch (err) { resultEl.innerHTML = '<div class="route-cost-empty">오류: ' + escapeHtml(err.message) + '</div>'; }
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

async function updateItinMap() {
  if (!currentItineraryData || !currentItineraryData.itinerary) return;
  var mapEl = el('itinMap');
  if (!mapEl || typeof google === 'undefined') return;

  if (!itinMap) {
    itinMap = new google.maps.Map(mapEl, { zoom: 12, center: { lat: 35.68, lng: 139.76 }, mapTypeControl: false });
  }
  for (var mi = 0; mi < itinMarkers.length; mi++) itinMarkers[mi].setMap(null);
  itinMarkers = [];

  var places = [];
  for (var di = 0; di < currentItineraryData.itinerary.length; di++) {
    var day = currentItineraryData.itinerary[di];
    var blocks = day.blocks || [];
    for (var bi = 0; bi < blocks.length; bi++) {
      var parsed = parseItineraryBlock(blocks[bi]);
      if (parsed.type !== 'main') continue;
      var name = extractPlaceName(blocks[bi]);
      if (!name) continue;
      var isMeal = isMealPeriod(parsed.period);
      places.push({ name: name, day: day.day, period: parsed.period, isMeal: isMeal });
    }
  }

  if (places.length === 0) return;
  var bounds = new google.maps.LatLngBounds();
  var labelIdx = 0;
  for (var pi = 0; pi < places.length; pi++) {
    var p = places[pi];
    var pos = itinGeoCache[p.name];
    if (!pos) {
      try {
        var geocoder = new google.maps.Geocoder();
        var result = await new Promise(function(resolve, reject) {
          geocoder.geocode({ address: p.name + ' Japan' }, function(results, status) {
            if (status === 'OK' && results[0]) resolve(results[0].geometry.location);
            else reject(status);
          });
        });
        pos = { lat: result.lat(), lng: result.lng() };
        itinGeoCache[p.name] = pos;
      } catch (err) {
        continue;
      }
    }
    bounds.extend(pos);
    labelIdx++;
    var label = String(labelIdx);
    var colorIdx = (p.day - 1) % DAY_COLORS.length;
    var markerColor = p.isMeal ? '#f97316' : DAY_COLORS[colorIdx];
    var marker = new google.maps.Marker({
      position: pos,
      map: itinMap,
      title: 'Day ' + p.day + ' ' + p.period + ': ' + p.name,
      label: { text: p.isMeal ? '' : label, color: '#fff', fontWeight: '700', fontSize: '11px' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: markerColor,
        fillOpacity: 0.9,
        strokeColor: '#fff',
        strokeWeight: 2,
        scale: p.isMeal ? 14 : 16
      }
    });
    itinMarkers.push(marker);
  }
  if (itinMarkers.length > 0) itinMap.fitBounds(bounds);
}

// ── Dest search handler ──
if (el('btnDestSearch')) {
  el('btnDestSearch').addEventListener('click', async function() {
    try {
      var payload = {
        city: el('destSearchCity').value,
        theme: el('destSearchTheme').value,
        budget: 'mid',
        limit: 10
      };
      var data = await postJson('/api/dest-search', payload);
      renderDestSearchCards(data.destinations || []);
      var srcNote = el('destSearchSourceNote');
      if (srcNote) srcNote.textContent = 'Source: ' + (data.source || 'unknown');
    } catch (err) {
      var cards = el('destSearchCards');
      if (cards) cards.innerHTML = '<div class="card">\uC624\uB958: ' + escapeHtml(err.message) + '</div>';
    }
  });
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
    if (addSource === 'foodSearch') place = (latestFoodList || [])[addIdx];
    else if (addSource === 'destSearch') place = (latestDestSearchList || [])[addIdx];
    if (place && currentItineraryData) {
      pendingAddPlace = { name: place.name, area: place.area || place.city || '' };
      showAddToPlanModal(place.name, { addType: addType });
    } else if (place) {
      alert('먼저 AI 일정을 생성해주세요.');
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
    if (!airline && !flightNum) { alert('항공사 또는 편명을 입력해주세요.'); return; }
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
      provider: airline || '직접입력',
      airlines: [airline || '직접입력'],
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
    try { runPlan({ flight: buildFlightPayload(manualFlight) }, false); } catch(e) {}
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
    if (!name) { alert('숙소명을 입력해주세요.'); return; }
    var checkIn = el('checkIn') ? el('checkIn').value : '';
    var checkOut = el('checkOut') ? el('checkOut').value : '';
    var nights = 1;
    if (checkIn && checkOut) { var d1 = new Date(checkIn), d2 = new Date(checkOut); nights = Math.max(1, Math.round((d2 - d1) / 86400000)); }
    var manualStay = {
      id: 'manual_stay_' + Date.now(), name: name, area: area, type: stayType,
      pricePerNightKRW: pricePerNight, totalPriceKRW: pricePerNight * nights, totalKRW: pricePerNight * nights,
      nights: nights, rating: rating, checkIn: checkIn, checkOut: checkOut, url: url || '',
      provider: '직접입력', manual: true
    };
    stayResults.unshift(manualStay);
    selectedStayId = manualStay.id;
    selectedStay = manualStay;
    renderStayCards();
    renderPlanExtras();
    renderBudgetSummary();
    renderItineraryTimeline();
    // Regenerate itinerary with new stay info
    try { runPlan({}, false); } catch(e) {}
    ['manualStayName','manualStayArea','manualStayPrice','manualStayRating','manualStayUrl'].forEach(function(id) { el(id).value = ''; });
  });
}

// Date validation
if (el('returnDate')) {
  el('returnDate').addEventListener('change', function() {
    var dep = el('departDate') ? el('departDate').value : '';
    var ret = this.value;
    if (dep && ret && ret < dep) {
      alert('귀국일이 출발일보다 빠를 수 없습니다.');
      this.value = dep;
    }
  });
}
if (el('checkOut')) {
  el('checkOut').addEventListener('change', function() {
    var ci = el('checkIn') ? el('checkIn').value : '';
    var co = this.value;
    if (ci && co && co <= ci) {
      alert('체크아웃이 체크인 이후여야 합니다.');
      var d = new Date(ci); d.setDate(d.getDate() + 1);
      this.value = d.toISOString().slice(0, 10);
    }
  });
}

(async () => {
  await initCityOptions();
  appendAiChat('assistant', '가고 싶은 장소를 채팅으로 입력하면 공항 기준 지역과 여행 조건을 자동으로 맞춰드릴게요.');
  el('from').value = formatAirportDisplay(resolveAirportCode(el('from').value));
  setTripTab('oneway');
  resetSegments();
  ensureCheckOutDate();
  el('btnPlan').click();
  el('btnFlights').click();
  el('btnFood').click();
  if (el('btnDestSearch')) el('btnDestSearch').click();
  el('btnStays').click();
})();
