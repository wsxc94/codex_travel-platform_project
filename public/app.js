// Dynamically load Google Maps JS API (key from server, not hardcoded)
(function loadGoogleMaps() {
  fetch('/api/maps-config')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.key) { console.warn('Google Maps API key not configured'); return; }
      var s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + data.key + '&language=ko&region=jp';
      s.async = true;
      document.head.appendChild(s);
    })
    .catch(function(e) { console.warn('Failed to load Maps config:', e); });
})();

﻿function setToday(id) {
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
  if (!res.ok) {
    if (res.status === 429) throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    if (res.status === 400) {
      try { var errData = await res.json(); throw new Error(errData.error || '입력값이 올바르지 않습니다.'); }
      catch(e) { if (e.message) throw e; throw new Error('입력값이 올바르지 않습니다.'); }
    }
    throw new Error(await res.text());
  }
  return res.json();
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
  if (url) return '<div class="card-photo" role="img" aria-label="' + escapeHtml(name || '') + '" style="background-image:url(' + escapeHtml(url) + ')"></div>';
  var letter = (name || '?').charAt(0);
  return '<div class="card-photo card-photo-none" role="img" aria-label="' + escapeHtml(name || '') + '">' + escapeHtml(letter) + '</div>';
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
        return `<div class="flight-leg-row"><span class="airline-badge" title="${escapeHtml(s.airline || '')}">${escapeHtml(s.airlineCode || '')}</span>${escapeHtml(parts.join(' · '))}</div>`;
      });
    }
    return [`<div class="flight-leg-row"><span class="airline-badge" title="${escapeHtml(l.airline || '')}">${escapeHtml(l.airlineCode || '')}</span>${escapeHtml(l.departureTime || '')} → ${escapeHtml(l.arrivalTime || '')} ${escapeHtml(l.from || '')}(${escapeHtml(airportCityByCode(l.from))}) ~ ${escapeHtml(l.to || '')}(${escapeHtml(airportCityByCode(l.to))}) ${escapeHtml(l.airline || '')}</div>`];
  }).join('');
  const selectedClass = x._id && x._id === selectedFlightId ? ' selected' : '';
  const selectedLabel = x._id && x._id === selectedFlightId ? '선택됨 (AI 일정 반영)' : 'AI 일정에 포함';

  return `<article class="card flight-card${selectedClass}">
    <div class="flight-top">
      <div class="flight-route">${escapeHtml(route)}</div>
      <div class="flight-price">${x.totalPriceKRW.toLocaleString()}원</div>
    </div>
    <div class="flight-sub">${escapeHtml(dateRange)}</div>
    <div class="flight-line">${legRows}</div>
    <div class="flight-meta">
      <span class="chip">${escapeHtml(x.provider || '')}</span>
      <span class="chip">총 ${x.totalDurationMin}분</span>
      <span class="chip">경유 ${x.totalStops}회</span>
    </div>
    <div class="flight-sub">항공사: ${escapeHtml((x.airlines || []).join(', ') || 'N/A')}</div>
    ${x.priceBreakdown ? `<div class="flight-sub">요금: 기본 ${x.priceBreakdown.baseKRW.toLocaleString()}원 · 세금 ${x.priceBreakdown.taxesKRW.toLocaleString()}원 · 수수료 ${x.priceBreakdown.feesKRW.toLocaleString()}원</div>` : ''}
    <div class="link-row">
      <button type="button" class="stay-select-btn flight-select-btn" data-flight-id="${escapeHtml(x._id || '')}">${selectedLabel}</button>
      ${x.deeplink && x.deeplink !== '#' ? `<a href="${escapeHtml(x.deeplink)}" target="_blank" rel="noreferrer" class="booking-link">✈ 예약하기</a>` : ''}
      <a href="${escapeHtml('https://www.skyscanner.co.kr/transport/flights/' + (x.legs && x.legs[0] ? x.legs[0].from : '').toLowerCase() + '/' + (x.legs && x.legs[0] ? x.legs[0].to : '').toLowerCase() + '/' + (x.legs && x.legs[0] && x.legs[0].date ? x.legs[0].date.replace(/-/g,'').slice(2) : '') + '/' + (x.legs && x.legs[1] && x.legs[1].date ? x.legs[1].date.replace(/-/g,'').slice(2) + '/' : ''))}" target="_blank" rel="noreferrer">스카이스캐너</a>
      <a href="${escapeHtml('https://www.kayak.co.kr/flights/' + (x.legs && x.legs[0] ? x.legs[0].from : '') + '-' + (x.legs && x.legs[0] ? x.legs[0].to : '') + '/' + (x.legs && x.legs[0] ? x.legs[0].date : '') + (x.legs && x.legs[1] && x.legs[1].date ? '/' + x.legs[1].date : '') + '?sort=bestflight_a')}" target="_blank" rel="noreferrer">카약</a>
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
  var bb = (currentItineraryData && currentItineraryData.budgetBreakdown) || null;
  var mealPerDay = bb ? bb.meal.perDay : 55000;
  var transportPerDay = bb ? bb.transport.perDay : 22000;
  var activityPerDay = bb ? bb.activity.perDay : 25000;
  var mealTotal = mealPerDay * days;
  var transportTotal = transportPerDay * days;
  var activityTotal = activityPerDay * days;
  var total = flightCost + stayCost + mealTotal + transportTotal + activityTotal;
  var fmt = function(n) { return n.toLocaleString() + '원'; };
  var tierLabels = { low: '절약', mid: '표준', high: '프리미엄' };
  var budgetLabel = bb ? (tierLabels[bb.budgetTier] || '표준') : '표준';
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
    itinerarySource: data.itinerarySource,
    budgetBreakdown: data.budgetBreakdown || null
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
  const amenityChips = (x.amenities || []).slice(0, 4).map((a) => `<span class="chip">${escapeHtml(a)}</span>`).join('');
  const offerLine = x.offerId ? `오퍼 ${escapeHtml(x.offerId)}` : '';
  const roomLine = x.roomType ? `객실 ${escapeHtml(x.roomType)}` : '';
  const boardLine = x.boardType ? `식사 ${escapeHtml(x.boardType)}` : '';
  const cancelLine = x.cancellation ? `취소 ${escapeHtml(x.cancellation)}` : '';
  const detailLine = [offerLine, roomLine, boardLine, cancelLine].filter(Boolean).join(' · ');
  const priceLine = x.priceBreakdown
    ? `요금: 기본 ${x.priceBreakdown.baseKRW.toLocaleString()}원 · 세금 ${x.priceBreakdown.taxesKRW.toLocaleString()}원 · 수수료 ${x.priceBreakdown.feesKRW.toLocaleString()}원`
    : '';
  const selectedClass = x.id === selectedStayId ? ' selected' : '';
  return `<article class="card stay-card${selectedClass}" data-stay-id="${escapeHtml(String(x.id || ''))}">
    <div class="stay-top">
      <div>
        <div class="stay-name">${escapeHtml(x.name)}</div>
        <div class="stay-meta">${escapeHtml(meta)}</div>
      </div>
      <div class="stay-price">
        <div class="stay-night">${priceNight}</div>
        <div class="stay-total">총 ${totalPrice}</div>
      </div>
    </div>
    <div class="stay-meta-row">${escapeHtml(x.provider || '')} · ${escapeHtml(x.checkIn || '')} ~ ${escapeHtml(x.checkOut || '')}</div>
    <div class="stay-meta-row">객실 ${escapeHtml(String(x.rooms || ''))} · 인원 ${escapeHtml(String(x.guests || ''))}</div>
    ${detailLine ? `<div class="stay-meta-row">${detailLine}</div>` : ''}
    ${priceLine ? `<div class="stay-meta-row">${priceLine}</div>` : ''}
    <div class="stay-meta-row stay-amenities">${amenityChips}</div>
    <div class="link-row">
      <button type="button" class="stay-select-btn" data-stay-id="${escapeHtml(String(x.id || ''))}">
        ${x.id === selectedStayId ? '선택됨 (AI 일정 반영)' : 'AI 일정에 포함'}
      </button>
      <a href="${escapeHtml(x.deeplink || '#')}" target="_blank" rel="noreferrer">예약 페이지</a>
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
        var flightSrcLabel = data.source === 'travelpayouts_live' ? '✨ Travelpayouts 실시간' : String(data.source).includes('amadeus') ? '✨ Amadeus' : '✨ ' + data.source;
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
        '<button type="button" class="promote-to-rec-btn" data-promote-type="dest" data-promote-index="' + index + '" data-promote-source="destSearch">\u2B06 \uCD94\uCC9C \uC5EC\uD589\uC9C0\uB85C</button>' +
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

    // 1순위: Rakuten 브라우저 직접 호출
    var rakutenResults = await fetchRakutenClient(
      payload.city, payload.checkIn, payload.checkOut, payload.guests, payload.rooms
    );
    var staySource = '';
    if (rakutenResults.length > 0) {
      stayResults = rakutenResults;
      staySource = 'rakuten_live';
    } else {
      // 2순위: 서버 API (Amadeus / Mock 폴백)
      var data = await postJson('/api/stays', payload);
      stayResults = data.stays || [];
      staySource = data.source || 'mock';
      renderStayFilterChecks(data.filterOptions);
    }
    renderStayCards();
    var sourceNote = el('staySourceNote');
    if (sourceNote) {
      if (staySource === 'rakuten_live') {
        sourceNote.textContent = '숙소: ✨ Rakuten Travel 실시간';
        sourceNote.classList.remove('warn');
      } else if (staySource === 'mock') {
        sourceNote.textContent = '현재 더미 데이터로 표시 중입니다. (API 실패 또는 미연동)';
        sourceNote.classList.add('warn');
      } else {
        var staySrcLabel = String(staySource).includes('amadeus') ? '✨ Amadeus' : '✨ ' + staySource;
        sourceNote.textContent = '숙소: ' + staySrcLabel;
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


// Promote to recommended list handler
document.addEventListener('click', function(e) {
  var promBtn = e.target.closest('.promote-to-rec-btn');
  if (!promBtn) return;
  var pType = promBtn.dataset.promoteType;
  var pIdx = Number(promBtn.dataset.promoteIndex);
  var pSource = promBtn.dataset.promoteSource;
  var item = null;
  if (pSource === 'destSearch') item = (latestDestSearchList || [])[pIdx];
  else if (pSource === 'foodSearch') item = (latestFoodList || [])[pIdx];
  if (!item) return;

  if (pType === 'dest') {
    if (!latestDestList) latestDestList = [];
    if (!latestDestList.find(function(d) { return d.name === item.name; })) {
      latestDestList.push(item);
      renderCards('destCards', latestDestList, 'dest');
      promBtn.textContent = '\u2705 \uCD94\uAC00\uB428';
      promBtn.disabled = true;
    } else {
      promBtn.textContent = '\uC774\uBBF8 \uCD94\uAC00\uB428';
      promBtn.disabled = true;
    }
  } else if (pType === 'food') {
    if (!latestFoodList) latestFoodList = [];
    if (!latestFoodList.find(function(d) { return d.name === item.name; })) {
      latestFoodList.push(item);
      renderCards('recFoodCards', latestFoodList, 'food');
      promBtn.textContent = '\u2705 \uCD94\uAC00\uB428';
      promBtn.disabled = true;
    } else {
      promBtn.textContent = '\uC774\uBBF8 \uCD94\uAC00\uB428';
      promBtn.disabled = true;
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
    '\uC5EC\uD589\uC6A9 \uC5B4\uB311\uD130 (\uC77C\uBCF8 110V/A\uD0C0\uC785)',
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

function renderChecklist() {
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem('travelChecklist') || '{}'); } catch(e) {}
  var container = document.getElementById('checklistContent');
  if (!container) return;
  var totalItems = 0, checkedItems = 0;
  var html = '';
  for (var gi = 0; gi < CHECKLIST_DATA.length; gi++) {
    var grp = CHECKLIST_DATA[gi];
    html += '<div class="checklist-group"><div class="checklist-group-title">' + grp.group + '</div>';
    for (var ii = 0; ii < grp.items.length; ii++) {
      var key = gi + '_' + ii;
      var isChecked = saved[key] === true;
      totalItems++;
      if (isChecked) checkedItems++;
      html += '<div class="checklist-item' + (isChecked ? ' checked' : '') + '">';
      html += '<input type="checkbox" id="chk_' + key + '" data-chk-key="' + key + '"' + (isChecked ? ' checked' : '') + ' />';
      html += '<label for="chk_' + key + '">' + grp.items[ii] + '</label></div>';
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
function renderEmergency() {
  var container = document.getElementById('emergencyContent');
  if (!container) return;
  container.innerHTML = '<div class="emergency-card"><h5>\uAE34\uAE09 \uC5F0\uB77D\uCC98</h5><p>' +
    '\uACBD\uCC30: <a href="tel:110">110</a><br>' +
    '\uC18C\uBC29/\uAD6C\uAE09: <a href="tel:119">119</a><br>' +
    '\uC7AC\uD574 \uC548\uB0B4: <a href="tel:171">171</a> (\uC7AC\uD574\uC6A9 \uC804\uC5B8\uB2E4\uC774\uC5BC)<br>' +
    '\uC678\uAD6D\uC778 \uC548\uB0B4: <a href="tel:0570000911">0570-000-911</a> (Japan Visitor Hotline, 24\uC2DC\uAC04)</p></div>' +

    '<div class="emergency-card"><h5>\uC8FC\uC77C \uD55C\uAD6D \uB300\uC0AC\uAD00/\uC601\uC0AC\uAD00</h5><p>' +
    '\uB3C4\uCFC4 \uB300\uC0AC\uAD00: <a href="tel:0335520159">03-3452-7611</a><br>' +
    '\uC624\uC0AC\uCE74 \uCD1D\uC601\uC0AC\uAD00: <a href="tel:0662134127">06-6213-1401</a><br>' +
    '\uD6C4\uCFE0\uC624\uCE74 \uCD1D\uC601\uC0AC\uAD00: <a href="tel:0922717581">092-771-0461</a><br>' +
    '\uC0AD\uD3EC\uB85C \uCD1D\uC601\uC0AC\uAD00: <a href="tel:0112187581">011-218-0288</a><br>' +
    '\uAE34\uAE09 \uC601\uC0AC\uCF5C: <a href="tel:+82-2-3210-0404">+82-2-3210-0404</a> (24h)</p></div>' +

    '<div class="emergency-card"><h5>\uC758\uB8CC \uC815\uBCF4</h5><p>' +
    '\uC57D\uAD6D: \u300C\u85AC\u5C40\u300D(\uC57C\uD050\uCFE0) \uAC04\uD310 \uCC3E\uAE30<br>' +
    '\uBCD1\uC6D0: \u300C\u75C5\u9662\u300D(\uBE6C\uC778) \uAC04\uD310 \uCC3E\uAE30<br>' +
    'AMDA \uAD6D\uC81C\uC758\uB8CC\uC815\uBCF4\uC13C\uD130: <a href="tel:0362331199">03-6233-9266</a><br>' +
    '\u203B \uD574\uC678\uC5EC\uD589\uBCF4\uD5D8 \uC5C6\uC774 \uC9C4\uB8CC \uC2DC 100% \uC790\uBE44 (\uAC10\uAE30 \uC9C4\uB8CC \uC57D 5,000~15,000\uC5D4)</p></div>' +

    '<div class="emergency-card"><h5>\uBD84\uC2E4\uBB3C/\uB3C4\uB09C</h5><p>' +
    '\uACBD\uCC30 \uBD84\uC2E4\uBB3C \uC2E0\uACE0: \uAC00\uAE4C\uC6B4 \u300C\u4EA4\u756A\u300D(\uCF54\uBC18, \uD30C\uCD9C\uC18C)<br>' +
    '\uC5ED \uBD84\uC2E4\uBB3C: \u300C\u304A\u5FD8\u308C\u7269\u300D(\uC624\uC640\uC2A4\uB808\uBAA8\uB178, \uBD84\uC2E4\uBB3C\uC13C\uD130)<br>' +
    '\uC5EC\uAD8C \uBD84\uC2E4: \uB300\uC0AC\uAD00 \uC989\uC2DC \uC5F0\uB77D \u2192 \uC5EC\uD589\uC99D\uBA85\uC11C \uBC1C\uAE09</p></div>' +

    '<div class="emergency-card"><h5>\uC790\uC5F0\uC7AC\uD574 \uB300\uBE44</h5><p>' +
    '\uC9C0\uC9C4 \uC2DC: \uD14C\uC774\uBE14 \uC544\uB798 \uB300\uD53C \u2192 \uD754\uB4E4\uB9BC \uBA48\uCD94\uBA74 \uCD9C\uAD6C \uD655\uBCF4<br>' +
    '\uC4F0\uB098\uBBF8 \uACBD\uBCF4 \uC2DC: \uC989\uC2DC \uB192\uC740 \uACF3\uC73C\uB85C \uB300\uD53C<br>' +
    'NHK World: \uC601\uC5B4 \uC7AC\uD574\uC815\uBCF4 \uC571<br>' +
    'Safety Tips \uC571: \uB2E4\uAD6D\uC5B4 \uC7AC\uD574\uC815\uBCF4 (\uD55C\uAD6D\uC5B4 \uC9C0\uC6D0)</p></div>';
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
    { ko: '\uBCF4\uAD00\uD574\uC8FC\uC138\uC694 (\uCF54\uC778\uB77D\uCEE4)', ja: '\u30B3\u30A4\u30F3\u30ED\u30C3\u30AB\u30FC\u306F\u3042\u308A\u307E\u3059\u304B\uFF1F', roma: 'Coin rokkaa wa arimasu ka?' }
  ]},
  { category: '\uC219\uC18C/\uD638\uD154', tags: '\uC219\uC18C \uD638\uD154 \uCCB4\uD06C\uC778 \uCCB4\uD06C\uC544\uC6C3 \uBC29', items: [
    { ko: '\uCCB4\uD06C\uC778 \uBD80\uD0C1\uD569\uB2C8\uB2E4', ja: '\u30C1\u30A7\u30C3\u30AF\u30A4\u30F3\u304A\u306D\u304C\u3044\u3057\u307E\u3059', roma: 'Chekkuin onegaishimasu' },
    { ko: '\uC9D0\uC744 \uB9E1\uACA8\uB3C4 \uB418\uB098\uC694?', ja: '\u8377\u7269\u3092\u9810\u3051\u307E\u3059\u304B\uFF1F', roma: 'Nimotsu wo azukemasu ka?' },
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
  var q = (filter || '').toLowerCase();
  var html = '';
  for (var ci = 0; ci < PHRASES_DATA.length; ci++) {
    var cat = PHRASES_DATA[ci];
    if (q && cat.tags.toLowerCase().indexOf(q) < 0 && cat.category.toLowerCase().indexOf(q) < 0) {
      var hasMatch = false;
      for (var pi = 0; pi < cat.items.length; pi++) {
        if (cat.items[pi].ko.toLowerCase().indexOf(q) >= 0) { hasMatch = true; break; }
      }
      if (!hasMatch) continue;
    }
    html += '<div class="phrase-category"><div class="phrase-category-title">' + cat.category + '</div>';
    for (var pi2 = 0; pi2 < cat.items.length; pi2++) {
      var p = cat.items[pi2];
      if (q && cat.tags.toLowerCase().indexOf(q) < 0 && p.ko.toLowerCase().indexOf(q) < 0) continue;
      html += '<div class="phrase-item"><button class="phrase-copy" data-copy="' + escapeHtml(p.ja) + '">\u{1F4CB}\uBCF5\uC0AC</button>';
      html += '<div class="phrase-ko">' + escapeHtml(p.ko) + '</div>';
      html += '<div class="phrase-ja">' + escapeHtml(p.ja) + '</div>';
      html += '<div class="phrase-roma">' + escapeHtml(p.roma) + '</div></div>';
    }
    html += '</div>';
  }
  container.innerHTML = html || '<div>\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
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
var CITY_COORDS = {
  tokyo: { lat: 35.68, lng: 139.76 }, osaka: { lat: 34.69, lng: 135.50 }, kyoto: { lat: 35.01, lng: 135.77 },
  sapporo: { lat: 43.06, lng: 141.35 }, fukuoka: { lat: 33.59, lng: 130.40 }, nagoya: { lat: 35.18, lng: 136.91 },
  hiroshima: { lat: 34.40, lng: 132.46 }, okinawa: { lat: 26.34, lng: 127.77 }, kanazawa: { lat: 36.56, lng: 136.65 },
  sendai: { lat: 38.27, lng: 140.87 }, kobe: { lat: 34.69, lng: 135.20 }, nagasaki: { lat: 32.75, lng: 129.87 },
  kumamoto: { lat: 32.80, lng: 130.71 }, kagoshima: { lat: 31.60, lng: 130.56 }, matsuyama: { lat: 33.84, lng: 132.77 },
  takamatsu: { lat: 34.34, lng: 134.05 }, okayama: { lat: 34.66, lng: 133.93 }, shizuoka: { lat: 34.98, lng: 138.38 },
  niigata: { lat: 37.90, lng: 139.02 }, toyama: { lat: 36.70, lng: 137.21 }, hakodate: { lat: 41.77, lng: 140.73 }
};

var WMO_ICONS = { 0: '\u2600\uFE0F', 1: '\uD83C\uDF24', 2: '\u26C5', 3: '\u2601\uFE0F', 45: '\uD83C\uDF2B', 48: '\uD83C\uDF2B',
  51: '\uD83C\uDF26', 53: '\uD83C\uDF26', 55: '\uD83C\uDF27', 61: '\uD83C\uDF27', 63: '\uD83C\uDF27', 65: '\uD83C\uDF27',
  71: '\u2744\uFE0F', 73: '\u2744\uFE0F', 75: '\u2744\uFE0F', 77: '\u2744\uFE0F',
  80: '\uD83C\uDF26', 81: '\uD83C\uDF27', 82: '\uD83C\uDF27', 85: '\u2744\uFE0F', 86: '\u2744\uFE0F',
  95: '\u26C8', 96: '\u26C8', 99: '\u26C8' };

async function fetchWeather(cityKey) {
  var coords = CITY_COORDS[cityKey];
  if (!coords) {
    for (var k in CITY_COORDS) { coords = CITY_COORDS[k]; break; }
  }
  if (!coords) return null;
  try {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + coords.lat + '&longitude=' + coords.lng +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Tokyo&forecast_days=10';
    var resp = await fetch(url);
    var data = await resp.json();
    return data.daily;
  } catch(e) { return null; }
}

function renderWeatherWidget(daily, cityLabel) {
  if (!daily || !daily.time) return;
  var startDate = el('startDate') ? el('startDate').value : '';
  var days = Number(el('days') ? el('days').value : 4);

  var html = '<div class="weather-days">';
  for (var i = 0; i < daily.time.length; i++) {
    var d = daily.time[i];
    var code = daily.weathercode[i];
    var icon = WMO_ICONS[code] || '\u2601\uFE0F';
    var hi = Math.round(daily.temperature_2m_max[i]);
    var lo = Math.round(daily.temperature_2m_min[i]);
    var rain = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : 0;
    var isTrip = startDate && d >= startDate && d < addDays(startDate, days);
    html += '<div class="weather-day" style="' + (isTrip ? 'border-color:var(--primary);border-width:2px;background:#f0fdf4' : '') + '">';
    html += '<div class="weather-day-date">' + d.slice(5) + '</div>';
    html += '<div class="weather-day-icon">' + icon + '</div>';
    html += '<div class="weather-day-temp"><span class="hi">' + hi + '\u00B0</span>/<span class="lo">' + lo + '\u00B0</span></div>';
    if (rain > 0) html += '<div class="weather-day-rain">\uD83D\uDCA7' + rain + '%</div>';
    html += '</div>';
  }
  html += '</div>';

  // Weather advice
  var tripDays = [];
  if (startDate) {
    for (var j = 0; j < daily.time.length; j++) {
      if (daily.time[j] >= startDate && daily.time[j] < addDays(startDate, days)) tripDays.push(j);
    }
  }
  if (tripDays.length > 0) {
    var rainyDays = tripDays.filter(function(idx) { return (daily.precipitation_probability_max || [])[idx] > 50; });
    var coldDays = tripDays.filter(function(idx) { return daily.temperature_2m_min[idx] < 5; });
    var hotDays = tripDays.filter(function(idx) { return daily.temperature_2m_max[idx] > 30; });
    var advice = [];
    if (rainyDays.length > 0) advice.push('\u2614 \uC5EC\uD589 \uAE30\uAC04 \uC911 ' + rainyDays.length + '\uC77C \uBE44 \uC608\uC0C1 - \uC6B0\uC0B0 \uD544\uC218! \uC2E4\uB0B4 \uAD00\uAD11\uC9C0 \uB300\uC548\uC744 \uC900\uBE44\uD558\uC138\uC694.');
    if (coldDays.length > 0) advice.push('\u2744\uFE0F \uCD94\uC6B4 \uB0A0\uC774 \uC788\uC2B5\uB2C8\uB2E4 - \uB530\uB73B\uD55C \uC637 \uCC59\uACA8\uC624\uC138\uC694.');
    if (hotDays.length > 0) advice.push('\uD83D\uDD25 \uB354\uC6B4 \uB0A0\uC774 \uC788\uC2B5\uB2C8\uB2E4 - \uC218\uBD84 \uBCF4\uCDA9\uACFC \uC790\uC678\uC120 \uCC28\uB2E8\uC744 \uC900\uBE44\uD558\uC138\uC694.');
    if (advice.length > 0) html += '<div class="weather-advice">' + advice.join('<br>') + '</div>';
  }

  // Update widget and panel
  var widget = document.getElementById('weatherContent');
  if (widget) widget.innerHTML = '<strong>' + (cityLabel || '') + '</strong> ' + html;
  var widgetWrap = document.getElementById('weatherWidget');
  if (widgetWrap) widgetWrap.classList.remove('hidden');

  var panelContent = document.getElementById('weatherPanelContent');
  if (panelContent) panelContent.innerHTML = '<h4>' + (cityLabel || '') + ' 10\uC77C \uC608\uBCF4</h4>' + html;
}

// btnWeather: handled by toolbar delegation below

// --- 5. EXPORT / SHARE ---
function buildItineraryText(format) {
  if (!currentItineraryData || !currentItineraryData.itinerary) return '\uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 AI \uC77C\uC815\uC744 \uC0DD\uC131\uD574\uC8FC\uC138\uC694.';
  var md = format === 'markdown';
  var lines = [];
  lines.push(md ? '# JapanTravel \uC5EC\uD589 \uC77C\uC815' : '=== JapanTravel \uC5EC\uD589 \uC77C\uC815 ===');
  if (currentItineraryData.summary) lines.push(md ? '> ' + currentItineraryData.summary : currentItineraryData.summary);
  lines.push('');

  if (selectedFlight) {
    lines.push(md ? '## \u2708\uFE0F \uD56D\uACF5\uAD8C' : '[ \uD56D\uACF5\uAD8C ]');
    lines.push(describeFlightSummary(selectedFlight));
    lines.push('');
  }
  if (selectedStay) {
    lines.push(md ? '## \uD83C\uDFE8 \uC219\uC18C' : '[ \uC219\uC18C ]');
    lines.push(describeStaySummary(selectedStay));
    lines.push('');
  }

  for (var di = 0; di < currentItineraryData.itinerary.length; di++) {
    var day = currentItineraryData.itinerary[di];
    lines.push(md ? '## Day ' + day.day + ' (' + (day.date || '') + ')' : '--- Day ' + day.day + ' (' + (day.date || '') + ') ---');
    var groups = groupItineraryBlocks(day.blocks || []);
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      if (g.type === 'main') {
        var info = parsePlaceInfo(g.place);
        var prefix = md ? '- **' + g.period + '** ' : '  [' + g.period + '] ';
        var suffix = md ? info.name + (info.info ? ' _(' + info.info + ')_' : '') : info.name + (info.info ? ' (' + info.info + ')' : '');
        lines.push(prefix + suffix);
      }
    }
    lines.push('');
  }

  // Budget
  if (selectedFlight || selectedStay) {
    lines.push(md ? '## \uD83D\uDCB0 \uC608\uC0C1 \uBE44\uC6A9' : '[ \uC608\uC0C1 \uBE44\uC6A9 ]');
    var days = Number(el('days') ? el('days').value : 4);
    var fc = selectedFlight ? selectedFlight.totalPriceKRW : 0;
    var sc = selectedStay ? (selectedStay.totalPriceKRW || 0) : 0;
    if (fc) lines.push('\uD56D\uACF5\uAD8C: ' + fc.toLocaleString() + '\uC6D0');
    if (sc) lines.push('\uC219\uC18C: ' + sc.toLocaleString() + '\uC6D0');
    lines.push('\uC2DD\uBE44(\uC608\uC0C1): ~' + (55000 * days).toLocaleString() + '\uC6D0');
    lines.push('\uAD50\uD1B5\uBE44(\uC608\uC0C1): ~' + (22000 * days).toLocaleString() + '\uC6D0');
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
    showMemoToast('텍스트가 클립보드에 복사되었습니다!');
    var p2 = document.getElementById('exportPreview');
    if (p2) p2.textContent = text;
    return;
  }
  if (tgt.id === 'btnCopyMarkdown') {
    var md = buildItineraryText('markdown');
    if (navigator.clipboard) navigator.clipboard.writeText(md);
    showMemoToast('마크다운이 복사되었습니다!');
    var p3 = document.getElementById('exportPreview');
    if (p3) p3.textContent = md;
    return;
  }
  if (tgt.id === 'btnShareLink') {
    var st = buildItineraryText('text');
    if (navigator.share) {
      navigator.share({ title: 'JapanTravel 여행 일정', text: st });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(st);
      showMemoToast('일정이 클립보드에 복사되었습니다!');
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
    var cityLabel = '';
    if (cityCatalog) {
      var found = cityCatalog.find(function(c) { return c.key === cityKey; });
      if (found) cityLabel = found.label;
    }
    togglePanel('weatherPanel');
    var panelContent = document.getElementById('weatherPanelContent');
    if (panelContent) panelContent.innerHTML = '날씨 정보 로딩 중...';
    fetchWeather(cityKey).then(function(daily) {
      if (daily) {
        renderWeatherWidget(daily, cityLabel);
      } else {
        if (panelContent) panelContent.innerHTML = '날씨 정보를 불러올 수 없습니다.';
      }
    });
    return;
  }
});

function showMemoToast(msg) {
  var toast = document.getElementById('memoToast');
  if (!toast) return;
  toast.textContent = msg || '\uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.';
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); toast.classList.add('hidden'); }, 2000);
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
      alerts.push({ type: 'warn', text: 'Day ' + day.day + ': \uC5EC\uD589\uC9C0 ' + mainBlocks.length + '\uACF3\uC740 \uB2E4\uC18C \uBE61\uBE61\uD560 \uC218 \uC788\uC5B4\uC694. \uC774\uB3D9\uC2DC\uAC04\uC744 \uACE0\uB824\uD574 3\uACF3 \uC774\uD558\uB97C \uCD94\uCC9C\uD569\uB2C8\uB2E4.' });
    }

    // Missing meals
    if (mainBlocks.length > 0 && mealBlocks.length === 0) {
      alerts.push({ type: 'info', text: 'Day ' + day.day + ': \uB9DB\uC9D1\uC774 \uC544\uC9C1 \uCD94\uAC00\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694. \uB9DB\uC9D1 \uCD94\uAC00\uB97C \uCD94\uCC9C\uD569\uB2C8\uB2E4!' });
    }

    // Allday + other spots
    var hasAllday = mainBlocks.some(function(b) { return b.period === '\uC885\uC77C'; });
    if (hasAllday && mainBlocks.length > 1) {
      alerts.push({ type: 'warn', text: 'Day ' + day.day + ': \uC885\uC77C \uC77C\uC815\uACFC \uB2E4\uB978 \uC5EC\uD589\uC9C0\uAC00 \uAC19\uC740 \uB0A0\uC5D0 \uC788\uC2B5\uB2C8\uB2E4. \uC2DC\uAC04 \uCDA9\uB3CC\uC744 \uD655\uC778\uD558\uC138\uC694.' });
    }

    // Duplicate places across days
    for (var di2 = di + 1; di2 < currentItineraryData.itinerary.length; di2++) {
      var day2 = currentItineraryData.itinerary[di2];
      var groups2 = groupItineraryBlocks(day2.blocks || []);
      var names2 = groups2.filter(function(g) { return g.type === 'main'; }).map(function(g) { return parsePlaceInfo(g.place).name; });
      for (var mi = 0; mi < mainBlocks.length; mi++) {
        var pname = parsePlaceInfo(mainBlocks[mi].place).name;
        if (names2.indexOf(pname) >= 0) {
          alerts.push({ type: 'info', text: '"' + pname + '"\uC774(\uAC00) Day ' + day.day + '\uACFC Day ' + day2.day + '\uC5D0 \uC911\uBCF5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.' });
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
        alerts.push({ type: 'tip', text: 'Day 1 \uB3C4\uCC29\uC774 \uC800\uB141\uC785\uB2C8\uB2E4. \uCCAB\uB0A0\uC740 \uC219\uC18C \uCCB4\uD06C\uC778 + \uADFC\uCC98 \uC0B0\uCC45 \uC815\uB3C4\uAC00 \uC801\uB2F9\uD569\uB2C8\uB2E4.' });
      }
    }
    if (selectedFlight.tripType === 'roundtrip' && selectedFlight.legs.length > 1) {
      var lastLeg = selectedFlight.legs[selectedFlight.legs.length - 1];
      if (lastLeg && lastLeg.departureTime) {
        var depH = parseInt(lastLeg.departureTime.split(':')[0]);
        if (depH <= 10) {
          alerts.push({ type: 'tip', text: '\uB9C8\uC9C0\uB9C9 \uB0A0 \uCD9C\uBC1C\uC774 \uC624\uC804\uC785\uB2C8\uB2E4. \uACF5\uD56D 2\uC2DC\uAC04 \uC804 \uB3C4\uCC29\uC744 \uACE0\uB824\uD574 \uC804\uB0A0 \uC9D0 \uC815\uB9AC\uB97C \uCD94\uCC9C\uD569\uB2C8\uB2E4.' });
        }
      }
    }
  }

  if (alerts.length === 0) {
    alertsEl.classList.add('hidden');
    return;
  }

  var typeIcons = { warn: '\u26A0\uFE0F', info: '\u2139\uFE0F', tip: '\uD83D\uDCA1' };
  var typeClasses = { warn: 'schedule-alert-warn', info: 'schedule-alert-info', tip: 'schedule-alert-tip' };
  var html = '<h4>\uD83D\uDCCA \uC77C\uC815 \uBD84\uC11D</h4>';
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
    btn.title = '\uBA54\uBAA8 \uCD94\uAC00/\uC218\uC815';
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
    var newMemo = prompt('\uD83D\uDCDD ' + place + ' \uBA54\uBAA8:', current);
    if (newMemo !== null) {
      savePlaceMemo(place, newMemo);
      renderItineraryTimeline();
      showMemoToast(newMemo ? '\uBA54\uBAA8 \uC800\uC7A5\uB428' : '\uBA54\uBAA8 \uC0AD\uC81C\uB428');
    }
  }
});

// --- 8. EXCHANGE RATE (realtime from server) ---
(async function showExchangeRate() {
  var toolbar = document.querySelector('.travel-toolbar');
  if (!toolbar) return;
  var chip = document.createElement('span');
  chip.className = 'exchange-rate-chip';
  chip.textContent = '¥/₩ 로딩...';
  toolbar.appendChild(chip);
  try {
    var resp = await fetch('/api/fx-rate');
    var data = await resp.json();
    if (data && data.yen100toKrw) {
      chip.textContent = '100¥≈' + data.yen100toKrw.toLocaleString() + '원 | 1만원≈¥' + data.man1wonToYen.toLocaleString();
      chip.title = '실시간 환율 (1엔=' + data.jpyToKrw + '원) · ' + (data.lastUpdate || '').slice(0, 10);
    }
  } catch(e) {
    chip.textContent = '100¥≈950원';
  }
})();

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
      if (btns) btns.innerHTML = '<p class="login-none-msg">현재 로그인 서비스가 설정되지 않았습니다.<br>.env 파일에 OAuth 키를 추가해주세요.</p>';
    }
  } catch(e) {}
})();

function renderAuthUI() {
  var authArea = document.getElementById('authArea');
  if (!authArea) return;

  if (currentUser) {
    var providerLabel = { naver: '네이버', kakao: '카카오', google: 'Google' }[currentUser.provider] || '';
    var imgHtml = currentUser.profileImage
      ? '<img src="' + currentUser.profileImage + '" class="auth-avatar" alt="" />'
      : '<span class="auth-avatar-placeholder">👤</span>';
    authArea.innerHTML =
      '<div class="auth-user-info">' +
        imgHtml +
        '<span class="auth-nickname">' + (currentUser.nickname || providerLabel) + '</span>' +
        '<button type="button" id="btnSavePlan" class="toolbar-btn auth-save-btn" title="현재 일정 저장">💾 저장</button>' +
        '<button type="button" id="btnMyPlans" class="toolbar-btn auth-plans-btn" title="내 저장 일정">📂 내 일정</button>' +
        '<button type="button" id="btnLogout" class="toolbar-btn auth-logout-btn" title="로그아웃">로그아웃</button>' +
      '</div>';
  } else {
    authArea.innerHTML =
      '<button type="button" id="btnLogin" class="toolbar-btn auth-login-btn" title="로그인">👤 로그인</button>';
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
    if (!confirm('로그아웃 하시겠습니까?')) return;
    fetch('/api/auth/logout', { method: 'POST' }).then(function() {
      currentUser = null;
      renderAuthUI();
      showMemoToast('로그아웃 되었습니다.');
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
    showMemoToast('로그인이 필요합니다.');
    return;
  }
  if (!currentItineraryData) {
    showMemoToast('저장할 일정이 없습니다. 먼저 일정을 생성해주세요.');
    return;
  }

  var cityEl = el('city');
  var cityLabel = '';
  if (cityEl && cityEl.selectedOptions && cityEl.selectedOptions[0]) {
    cityLabel = cityEl.selectedOptions[0].textContent;
  }
  var startDate = el('startDate') ? el('startDate').value : '';
  var days = el('days') ? Number(el('days').value) : 0;
  var theme = el('theme') ? el('theme').value : '';

  var defaultTitle = (cityLabel || '일본') + ' ' + days + '일 여행';
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
  confirmBtn.textContent = '저장';
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
      var savedDate = dup.savedAt ? new Date(dup.savedAt).toLocaleDateString('ko-KR') : '';
      dupNotice.innerHTML = '⚠️ <strong>"' + name + '"</strong> 이름의 일정이 이미 있습니다. (' + savedDate + ' 저장)<br>저장하면 기존 일정을 덮어씁니다.';
      dupNotice.className = 'save-dup-notice warn';
      confirmBtn.textContent = '덮어쓰기';
      confirmBtn.classList.add('overwrite');
      return dup.id;
    } else {
      dupNotice.classList.add('hidden');
      confirmBtn.textContent = '저장';
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
          showMemoToast(overwriteId ? '기존 일정을 덮어썼습니다!' : '일정이 저장되었습니다!');
        } else {
          showMemoToast(result.error || '저장 실패');
        }
      } catch(e) {
        showMemoToast('저장 중 오류가 발생했습니다.');
      }
      cleanup();
    }, { once: true });
  });
}

// 내 일정 목록 불러오기
async function loadMyPlansList() {
  var container = document.getElementById('myPlansContent');
  if (!container) return;
  container.innerHTML = '<p class="my-plans-loading">불러오는 중...</p>';

  try {
    var resp = await fetch('/api/my-plans/list');
    var data = await resp.json();
    if (!resp.ok) {
      container.innerHTML = '<p class="my-plans-empty">' + (data.error || '오류') + '</p>';
      return;
    }
    if (!data.plans || data.plans.length === 0) {
      container.innerHTML = '<p class="my-plans-empty">저장된 일정이 없습니다.</p>';
      return;
    }

    var html = '';
    data.plans.forEach(function(p) {
      var dateStr = p.savedAt ? new Date(p.savedAt).toLocaleDateString('ko-KR') : '';
      html += '<div class="my-plan-card">' +
        '<div class="my-plan-info">' +
          '<strong>' + (p.title || p.cityLabel || '일정') + '</strong>' +
          '<small>' + (p.startDate || '') + ' · ' + (p.days || 0) + '일 · ' + dateStr + ' 저장</small>' +
        '</div>' +
        '<div class="my-plan-actions">' +
          '<button type="button" class="my-plan-load" data-plan-id="' + p.id + '">불러오기</button>' +
          '<button type="button" class="my-plan-delete" data-plan-id="' + p.id + '">삭제</button>' +
        '</div>' +
      '</div>';
    });
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<p class="my-plans-empty">목록을 불러올 수 없습니다.</p>';
  }
}

// 일정 불러오기
async function loadPlanFromServer(planId) {
  try {
    var resp = await fetch('/api/my-plans/load?id=' + encodeURIComponent(planId));
    var data = await resp.json();
    if (!resp.ok || !data.plan) {
      showMemoToast(data.error || '불러오기 실패');
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
      try { renderCards('destSearchCards', latestDestSearchList, 'dest'); } catch(e) {}
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
    showMemoToast('일정을 불러왔습니다!');
  } catch(e) {
    showMemoToast('불러오기 중 오류가 발생했습니다.');
  }
}

// 일정 삭제
async function deletePlanFromServer(planId) {
  if (!confirm('이 일정을 삭제하시겠습니까?')) return;
  try {
    var resp = await fetch('/api/my-plans/delete?id=' + encodeURIComponent(planId), { method: 'DELETE' });
    var data = await resp.json();
    if (resp.ok && data.deleted) {
      showMemoToast('일정이 삭제되었습니다.');
      loadMyPlansList();
    } else {
      showMemoToast('삭제 실패');
    }
  } catch(e) {
    showMemoToast('삭제 중 오류가 발생했습니다.');
  }
}

// ── Rakuten Travel 클라이언트 사이드 API ──
var RAKUTEN_APP_ID = '';
var RAKUTEN_ACCESS_KEY = '';
var RAKUTEN_AREA_MAP = {
  tokyo: { middle: 'tokyo', small: 'tokyo' },
  osaka: { middle: 'osaka', small: 'osaka' },
  kyoto: { middle: 'kyoto', small: 'shi' },
  sapporo: { middle: 'hokkaido', small: 'sapporo' },
  hakodate: { middle: 'hokkaido', small: 'hakodate' },
  nagoya: { middle: 'aichi', small: 'nagoya' },
  fukuoka: { middle: 'fukuoka', small: 'fukuoka' },
  hiroshima: { middle: 'hiroshima', small: 'hiroshima' },
  sendai: { middle: 'miyagi', small: 'sendai' },
  okinawa: { middle: 'okinawa', small: 'naha' },
  kanazawa: { middle: 'ishikawa', small: 'kanazawa' },
  kobe: { middle: 'hyogo', small: 'kobe' },
  nagasaki: { middle: 'nagasaki', small: 'nagasaki' },
  kumamoto: { middle: 'kumamoto', small: 'kumamoto' },
  kagoshima: { middle: 'kagoshima', small: 'kagoshima' },
  oita: { middle: 'oita', small: 'beppu' },
  matsuyama: { middle: 'ehime', small: 'matsuyama' },
  takamatsu: { middle: 'kagawa', small: 'takamatsu' },
  niigata: { middle: 'niigata', small: 'niigata' },
  okayama: { middle: 'okayama', small: 'okayama' },
  toyama: { middle: 'toyama', small: 'toyama' },
  shizuoka: { middle: 'shizuoka', small: 'shizuoka' },
  kochi: { middle: 'kochi', small: 'kochi' },
  tokushima: { middle: 'tokushima', small: 'tokushima' },
  yamagata: { middle: 'yamagata', small: 'yamagata' },
  akita: { middle: 'akita', small: 'akita' },
  aomori: { middle: 'aomori', small: 'aomori' },
  fukushima: { middle: 'fukushima', small: 'fukushima' },
  miyazaki: { middle: 'miyazaki', small: 'miyazaki' },
  obihiro: { middle: 'hokkaido', small: 'obihiro' },
  nara: { middle: 'nara', small: 'nara' },
  hakone: { middle: 'kanagawa', small: 'hakone' },
  kamakura: { middle: 'kanagawa', small: 'kamakura' },
  nikko: { middle: 'tochigi', small: 'nikko' },
  yokohama: { middle: 'kanagawa', small: 'yokohama' }
};

// Rakuten 키를 서버에서 가져오기
async function initRakutenKeys() {
  try {
    var res = await fetch('/api/rakuten-config');
    if (res.ok) {
      var cfg = await res.json();
      RAKUTEN_APP_ID = cfg.appId || '';
      RAKUTEN_ACCESS_KEY = cfg.accessKey || '';
    }
  } catch (e) { /* ignore */ }
}
initRakutenKeys();

async function fetchRakutenClient(cityKey, checkIn, checkOut, guests, rooms) {
  if (!RAKUTEN_APP_ID || !RAKUTEN_ACCESS_KEY) return [];
  var area = RAKUTEN_AREA_MAP[cityKey];
  if (!area) return [];

  var params = new URLSearchParams({
    applicationId: RAKUTEN_APP_ID,
    accessKey: RAKUTEN_ACCESS_KEY,
    format: 'json',
    formatVersion: '2',
    checkinDate: checkIn,
    checkoutDate: checkOut,
    adultNum: String(Math.min(guests || 2, 10)),
    roomNum: String(Math.min(rooms || 1, 10)),
    hits: '20',
    sort: '+roomCharge',
    responseType: 'large',
    largeClassCode: 'japan',
    middleClassCode: area.middle,
    smallClassCode: area.small
  });

  try {
    var res = await fetch('https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426?' + params);
    if (!res.ok) {
      // Fallback: SimpleHotelSearch
      params.delete('checkinDate');
      params.delete('checkoutDate');
      params.delete('adultNum');
      params.delete('roomNum');
      var res2 = await fetch('https://openapi.rakuten.co.jp/engine/api/Travel/SimpleHotelSearch/20170426?' + params);
      if (!res2.ok) return [];
      var data2 = await res2.json();
      return normalizeRakutenClient(data2, { checkIn: checkIn, checkOut: checkOut, guests: guests, rooms: rooms, city: cityKey }, true);
    }
    var data = await res.json();
    return normalizeRakutenClient(data, { checkIn: checkIn, checkOut: checkOut, guests: guests, rooms: rooms, city: cityKey }, false);
  } catch (e) {
    console.warn('[rakuten-client]', e.message);
    return [];
  }
}

var FX_JPY_KRW = 9.5;
// Get exchange rate
(async function() {
  try {
    var r = await fetch('/api/fx-rate');
    if (r.ok) { var d = await r.json(); FX_JPY_KRW = d.jpyKrw || 9.5; }
  } catch(e) {}
})();

function normalizeRakutenClient(data, payload, isSimple) {
  var hotels = data.hotels || [];
  var checkIn = payload.checkIn;
  var checkOut = payload.checkOut;
  var nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
  var rooms = payload.rooms || 1;
  var guests = payload.guests || 2;

  return hotels.map(function(h, idx) {
    var basic = (h.hotel && h.hotel[0] && h.hotel[0].hotelBasicInfo) ? h.hotel[0].hotelBasicInfo : (h.hotelBasicInfo || {});
    var priceJPY, breakfastFlag = false, dinnerFlag = false, reserveUrl = '';

    if (!isSimple && h.hotel) {
      var cheapest = Infinity;
      for (var i = 1; i < h.hotel.length; i++) {
        var ri = h.hotel[i];
        var rBasic = ri.roomInfo && ri.roomInfo[0] && ri.roomInfo[0].roomBasicInfo;
        var rCharge = ri.roomInfo && ri.roomInfo[1] && ri.roomInfo[1].dailyCharge;
        if (rBasic && rCharge) {
          var total = Number(rCharge.total || rCharge.rakutenCharge || Infinity);
          if (total < cheapest) {
            cheapest = total;
            breakfastFlag = rBasic.withBreakfastFlag === 1;
            dinnerFlag = rBasic.withDinnerFlag === 1;
            reserveUrl = rBasic.reserveUrl || '';
          }
        }
      }
      priceJPY = cheapest < Infinity ? cheapest : (basic.hotelMinCharge || 8000);
    } else {
      priceJPY = basic.hotelMinCharge || 8000;
    }

    var pricePerNightKRW = Math.round(priceJPY * FX_JPY_KRW);
    var totalPriceKRW = pricePerNightKRW * nights * rooms;
    var amenities = [];
    if (breakfastFlag) amenities.push('\uc870\uc2dd \ud3ec\ud568');
    if (dinnerFlag) amenities.push('\uc11d\uc2dd \ud3ec\ud568');
    amenities.push('\ubb34\ub8cc Wi-Fi');

    var nameKo = basic.hotelName || '\uc774\ub984 \uc5c6\uc74c';
    var isRyokan = /\u65C5\u9928|\u6E29\u6CC9|\u308A\u3087\u304B\u3093|\u304A\u5BBF/.test(nameKo) || dinnerFlag;
    var rating = Number(basic.reviewAverage || 0);

    return {
      id: 'rakuten_' + (basic.hotelNo || idx),
      name: nameKo,
      provider: 'Rakuten',
      type: isRyokan ? 'ryokan' : 'hotel',
      typeLabel: isRyokan ? '\ub8cc\uce78' : '\ud638\ud154',
      area: basic.address1 || '',
      rating: rating > 0 ? rating : 7.5,
      guests: guests,
      rooms: rooms,
      checkIn: checkIn,
      checkOut: checkOut,
      nights: nights,
      pricePerNightKRW: pricePerNightKRW,
      totalPriceKRW: totalPriceKRW,
      amenities: amenities,
      aiScore: Math.round((rating || 7.5) * 100 - (pricePerNightKRW / 1200)),
      deeplink: reserveUrl || basic.hotelInformationUrl || basic.planListUrl || '#',
      imageUrl: basic.hotelImageUrl || basic.hotelThumbnailUrl || null,
      nearestStation: basic.nearestStation || '',
      access: basic.access || ''
    };
  }).filter(function(h) { return h.pricePerNightKRW > 0; });
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

function loadKlookWidget(cityKey) {
  var wrap = document.getElementById('klookWidgetWrap');
  if (!wrap) return;
  var cityName = KLOOK_CITY_MAP[cityKey] || KLOOK_CITY_MAP.tokyo;
  wrap.innerHTML = '<div id="tp-klook-widget"></div>';
  var oldScripts = wrap.querySelectorAll('script');
  oldScripts.forEach(function(s) { s.remove(); });
  var sc = document.createElement('script');
  sc.async = true;
  sc.charset = 'utf-8';
  sc.src = 'https://tpwgt.com/content?currency=KRW&trs=507447&shmarker=710362&locale=ko&city=' + encodeURIComponent(cityName) + '&category=3&amount=6&powered_by=true&campaign_id=137&promo_id=4497';
  wrap.appendChild(sc);
}

// Load widget on city change
if (el('city')) {
  el('city').addEventListener('change', function() {
    loadKlookWidget(this.value);
  });
  // Initial load
  setTimeout(function() { loadKlookWidget(el('city').value || 'tokyo'); }, 1000);
}

