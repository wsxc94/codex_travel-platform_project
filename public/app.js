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
let selectedDestinations = [];
let latestDestList = [];
let selectedStayId = '';
let selectedStay = null;
let aiPreferredAreas = [];
let aiPreferAirportAccess = false;

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
  el('city').value = 'tokyo';
  el('foodCity').value = 'tokyo';
  el('stayCity').value = 'tokyo';
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
  }
  if (parsed.theme && ['mixed', 'foodie', 'culture', 'shopping', 'nature'].includes(parsed.theme)) {
    el('theme').value = parsed.theme;
  }
  if (parsed.budget && ['low', 'mid', 'high'].includes(parsed.budget)) {
    el('budget').value = parsed.budget;
    el('foodBudget').value = parsed.budget;
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

  target.innerHTML = items.map((x, index) => {
    if (mode === 'dest') {
      const isSelected = selectedDestinations.some((d) => d.name === x.name && d.area === x.area);
      const selectedClass = isSelected ? ' selected' : '';
      const label = isSelected ? '선택 취소' : 'AI 일정에 포함';
      return `<article class="card${selectedClass}">
        <h4>${x.name}</h4>
        <div class="meta">${x.city || '-'} · ${x.category} · ${x.area}</div>
        <div class="meta">추천시간 ${x.bestTime} / 체류 ${x.stayMin}분</div>
        <div class="meta">AI 점수 ${x.aiScore}</div>
        <div class="link-row">
          <button type="button" class="stay-select-btn dest-select-btn" data-dest-index="${index}">${label}</button>
          <a href="${x.mapUrl}" target="_blank" rel="noreferrer">Google Maps</a>
        </div>
      </article>`;
    }

    return `<article class="card">
      <h4>${x.name}</h4>
      <div class="meta">${x.city || ''} ${x.genre} · ${x.area || ''}</div>
      <div class="meta">평점 ${x.score ?? '-'} · 예산레벨 ${x.priceLevel ?? '-'}</div>
      <div class="meta">AI 적합도 ${x.aiFit ?? '-'}</div>
      <div class="link-row"><a href="${x.mapUrl}" target="_blank" rel="noreferrer">지도</a><a href="${x.tabelogUrl}" target="_blank" rel="noreferrer">Tabelog</a></div>
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

function renderItinerary(data) {
  const aiSources = new Set(['openai_itinerary_v1', 'gemini_itinerary_v1']);
  const sourceTag = aiSources.has(data.itinerarySource) ? 'AI 일정(모델 기반)' : '일정(규칙 기반)';
  const labelNode = el('planSourceLabel');
  if (labelNode) {
    labelNode.textContent = sourceTag;
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
  const lines = [data.summary, '', ''];
  for (const day of data.itinerary) {
    lines.push(`Day ${day.day} (${day.date})`);
    for (const block of day.blocks) lines.push(`- ${block}`);
    lines.push('');
  }
  lines.push('Tips');
  for (const t of data.tips) lines.push(`- ${t}`);
  el('planResult').textContent = lines.join('\n');
  renderPlanExtras();
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
  const route = `${first?.from || '출발 미정'} → ${last?.to || first?.to || '도착 미정'}`;
  const dateRange = first?.date === last?.date ? first?.date : `${first?.date || ''} ~ ${last?.date || ''}`;
  const price = flight.totalPriceKRW ? `${flight.totalPriceKRW.toLocaleString()}원` : '요금 미확인';
  const duration = flight.totalDurationMin ? `${flight.totalDurationMin}분` : '시간 미등록';
  const stops = flight.totalStops != null ? `${flight.totalStops}회 경유` : '경유 정보 없음';
  const airlines = (flight.airlines || []).join(', ') || (flight.provider || '항공사 정보 없음');
  return `
    <article class="selection-card">
      <div class="selection-card-title">선택 항공권</div>
      <div class="selection-card-body">
        <strong>${route}</strong>
        <span class="selection-card-date">${dateRange}</span>
        <span>${price} · ${duration}</span>
        <span>${stops}</span>
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
      <div class="selection-card-title">선택 숙소</div>
      <div class="selection-card-body">
        <strong>${stay.name}</strong>
        <span>${stay.area} · ${provider}</span>
        <span>${dates}</span>
        <span>${perNight} · 총 ${total}</span>
        ${amenities ? `<span>편의시설: ${amenities}</span>` : ''}
      </div>
    </article>`;
}

function renderPlanExtras() {
  renderPlanSelectionCards();
}

function renderPlanSelectionCards() {
  const container = el('planSelectionCards');
  if (!container) return;
  const cards = [];
  if (selectedFlight) cards.push(selectionFlightCard(selectedFlight));
  if (selectedStay) cards.push(selectionStayCard(selectedStay));
  if (selectedDestinations.length > 0) {
    cards.push(selectionDestCard());
  }
  container.innerHTML = cards.join('') || '<div class="selection-card">선택된 항공권/숙소가 없습니다.</div>';
}

function toggleDestinationSelection(index) {
  const dest = latestDestList[index];
  if (!dest) return;
  const exists = selectedDestinations.find((d) => d.name === dest.name && d.area === dest.area);
  if (exists) {
    selectedDestinations = selectedDestinations.filter((d) => !(d.name === dest.name && d.area === dest.area));
  } else {
    selectedDestinations = [...selectedDestinations, dest];
  }
  renderCards('destCards', latestDestList, 'dest');
  renderPlanSelectionCards();
}

function selectionDestCard() {
  if (selectedDestinations.length === 0) return '';
  const lines = selectedDestinations.map((dest) => `${dest.name} (${dest.area || dest.city || '-'})`).join(', ');
  return `
    <article class="selection-card">
      <div class="selection-card-title">AI 일정 우선 여행지</div>
      <div class="selection-card-body">
        <strong>선택 목록</strong>
        <span>${lines}</span>
        <span>AI 일정에 포함된 순서로 반영됩니다.</span>
      </div>
    </article>`;
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
    budget: el('budget').value,
    useAi: true,
    ...extra
  };
  const stayInfo = stayPayloadFromSelection();
  if (stayInfo && !payload.stay) payload.stay = stayInfo;
  if (selectedFlight && !payload.flight) payload.flight = buildFlightPayload(selectedFlight);
  if (selectedDestinations.length > 0 && !payload._picks) {
    payload._picks = selectedDestinations.map(normalizeDestinationForPlan).filter(Boolean);
  }
  return payload;
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
  const destSourceNote = el('destSourceNote');
  if (destSourceNote) {
    const src = data.recommendationSource || 'unknown';
    const isFallback = String(src).includes('fallback') || String(src).includes('local_curated');
    destSourceNote.textContent = `추천 여행지 데이터 소스: ${src}`;
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
  try {
    resetFlightSelectionDisplay();
    selectStayById('');
    await runPlan({}, true);
    const stayStart = el('startDate').value || new Date().toISOString().slice(0, 10);
    el('stayCity').value = el('city').value;
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
      budget: el('budget').value,
      days: Number(el('days').value || 4),
      startDate: el('startDate').value
    };
    const data = await postJson('/api/ai-travel-chat', { message, context });
    if (data.cityMeta) upsertCityOption(data.cityMeta);
    applyAiConditions(data.parsed || {});
    selectedDestinations = [];
    if (Array.isArray(data.selectedDestinations) && data.selectedDestinations.length > 0) {
      selectedDestinations = data.selectedDestinations.map(normalizeDestinationForPlan).filter(Boolean);
    }
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
        sourceNote.textContent = `데이터 소스: ${data.source}`;
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

el('destCards')?.addEventListener('click', (event) => {
  const btn = event.target.closest('.dest-select-btn');
  if (!btn) return;
  const index = Number(btn.dataset.destIndex);
  if (Number.isNaN(index)) return;
  toggleDestinationSelection(index);
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
    const budget = encodeURIComponent(el('foodBudget').value);
    const res = await fetch(`/api/foods?city=${city}&genre=${genre}&budget=${budget}`);
    const data = await res.json();
    renderCards('foodCards', data.list, 'food');
    const sourceNote = el('foodSourceNote');
    if (sourceNote) {
      const source = data.source || 'unknown';
      const warning = data.warning ? ` · ${data.warning}` : '';
      sourceNote.textContent = `데이터 소스: ${source}${warning}`;
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
        arrivalAirport: resolveAirportCode(el('to').value)
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
        sourceNote.textContent = `데이터 소스: ${data.source}`;
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
  if (currentTripType === 'multicity') resetSegments();
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
  el('btnStays').click();
})();
