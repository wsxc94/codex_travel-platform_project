function setToday(id) {
  const node = document.getElementById(id);
  if (node && !node.value) node.value = new Date().toISOString().slice(0, 10);
}

['startDate', 'departDate', 'returnDate'].forEach(setToday);

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
  el('city').value = 'tokyo';
  el('foodCity').value = 'tokyo';
}

function addDays(dateText, offset) {
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function renderCards(targetId, items, mode) {
  const target = el(targetId);
  if (!items || items.length === 0) {
    target.innerHTML = '<div class="card">결과 없음</div>';
    return;
  }

  target.innerHTML = items.map((x) => {
    if (mode === 'dest') {
      return `<article class="card">
        <h4>${x.name}</h4>
        <div class="meta">${x.city || '-'} · ${x.category} · ${x.area}</div>
        <div class="meta">추천시간 ${x.bestTime} / 체류 ${x.stayMin}분</div>
        <div class="meta">AI 점수 ${x.aiScore}</div>
        <div class="link-row"><a href="${x.mapUrl}" target="_blank" rel="noreferrer">Google Maps</a></div>
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
  const legRows = x.legs
    .map((l) => `<div class="flight-leg-row">${l.departureTime} ${l.from}(${airportCityByCode(l.from)}) ~ ${l.to}(${airportCityByCode(l.to)}) ${l.airline}</div>`)
    .join('');

  return `<article class="card flight-card">
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
    <div class="link-row"><a href="${x.legs[0].deeplink}" target="_blank" rel="noreferrer">플랫폼 이동</a></div>
  </article>`;
}

function renderFlightCards(reset = false) {
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
  const lines = [data.summary, ''];
  for (const day of data.itinerary) {
    lines.push(`Day ${day.day} (${day.date})`);
    for (const block of day.blocks) lines.push(`- ${block}`);
    lines.push('');
  }
  lines.push('Tips');
  for (const t of data.tips) lines.push(`- ${t}`);
  el('planResult').textContent = lines.join('\n');
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
    const data = await postJson('/api/travel-plan', {
      city: el('city').value,
      theme: el('theme').value,
      startDate: el('startDate').value,
      days: Number(el('days').value),
      pace: 'normal',
      budget: el('budget').value
    });
    renderCards('destCards', data.recommendations, 'dest');
    renderItinerary({ summary: data.summary, itinerary: data.itinerary, tips: data.tips });

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
  } catch (err) {
    el('planResult').textContent = `오류: ${err.message}`;
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
    flightResults = data.flights || [];
    renderFlightCards(true);
    renderFlightFilterChecks(data.filterOptions);
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

el('btnFood').addEventListener('click', async () => {
  try {
    const city = encodeURIComponent(el('foodCity').value);
    const genre = encodeURIComponent(el('foodGenre').value);
    const budget = encodeURIComponent(el('foodBudget').value);
    const res = await fetch(`/api/foods?city=${city}&genre=${genre}&budget=${budget}`);
    const data = await res.json();
    renderCards('foodCards', data.list, 'food');
  } catch (err) {
    el('foodCards').innerHTML = `<div class="card">오류: ${err.message}</div>`;
  }
});

el('city').addEventListener('change', () => {
  el('foodCity').value = el('city').value;
  if (currentTripType === 'multicity') resetSegments();
});

(async () => {
  await initCityOptions();
  el('from').value = formatAirportDisplay(resolveAirportCode(el('from').value));
  setTripTab('oneway');
  resetSegments();
  el('btnPlan').click();
  el('btnFlights').click();
  el('btnFood').click();
})();
