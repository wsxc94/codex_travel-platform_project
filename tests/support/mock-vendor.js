'use strict';
/**
 * 테스트용 가짜 외부 API 서버 (실제 네트워크를 쓰지 않는다).
 *
 * 서버를 띄울 때 PLACES_API_BASE / GEOCODE_API_BASE / GEMINI_API_BASE / TRAVELPAYOUTS_API_BASE를
 * 이 서버 주소로 돌리고, 그 밖의 외부 호출(환율·날씨 등)은 net-guard.js가 /__external/... 로 보낸다.
 * 모든 요청은 log에 남으므로 테스트가 "Google 호출 0회", "키가 헤더로 갔는지" 등을 확인할 수 있다.
 *
 * scenario 값 (테스트가 단계마다 바꾼다):
 *   places:        'ok' | 'billing403' | 'empty'
 *   geocode:       'ok' | 'denied-billing'
 *   directions:    'ok' | 'denied'
 *   gemini:        'ok' | 'max_tokens' | 'empty_days'
 *                  | 'error400' (모든 호출에 400 + 벤더 원문 GEMINI_ERROR_TEXT)
 *                  | 'error429' (모든 호출에 429 RESOURCE_EXHAUSTED) | 'error503' (모든 호출에 503 high demand)
 *                  | 'error429_daily' (모든 호출에 429 + PerDay quotaId: 하루 무료 한도 소진)
 *                  채팅 해석(일정이 아닌 요청)용: 'chat_ok' | 'chat_shopping_neg' | 'chat_sapporo' | 'chat_noisy' (그 밖에는 '{}')
 *                  일정용(ITINERARY_SCENARIOS): 'evening_sight' | 'lunch_food_in_afternoon' | 'allday_halfslot' | 'missing_must'
 *                  | 'lunch_repeat' | 'wrong_city_day' | 'invented_place' | 'disney_day' (그 밖에는 'ok' 일정)
 *                  일정 요청 판별: generationConfig.responseSchema.properties.itinerary 가 있으면 일정(채팅 해석도 responseSchema를 보낸다).
 *   travelpayouts: 'ok' | 'empty' | 'error'
 *   weather:       'ok' | 'hostile' (open-meteo 응답에 예상 밖 필드·HTML·잘못된 날짜를 섞음)
 *
 * OAuth 토큰 교환(네이버·카카오·Google)은 kind 'oauth'로 기록하고 늘 401로 거절한다.
 * 콜백이 state 검사를 통과했는지만 보려는 것이고, 로그인이 실제로 끝나 data/users.json에 쓰이지 않게 한다.
 */
const http = require('http');
const { URL } = require('url');

// 아주 작은 JPEG(SOI … EOI). 내용은 중요하지 않고 image/jpeg로 전달되는지만 본다.
const JPEG_BYTES = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

// net-guard를 거쳐 들어와도 되는 무료 공개 API(가짜 응답을 준다). 여기에 없는 외부 호스트는 "예상 밖 호출"로 기록한다.
const FREE_EXTERNAL_HOSTS = new Set([
  'open.er-api.com',
  'api.frankfurter.app',
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com'
]);

// OAuth 공급자 호스트: 기록한 뒤 401로 거절한다(위 머리말 참고).
const OAUTH_EXTERNAL_HOSTS = new Set([
  'nid.naver.com',
  'openapi.naver.com',
  'kauth.kakao.com',
  'kapi.kakao.com',
  'oauth2.googleapis.com',
  'www.googleapis.com'
]);

// gemini: 'error400' 응답의 벤더 원문. 이 글자가 클라이언트 응답에 나오면 안 된다.
const GEMINI_ERROR_TEXT = 'API key not valid. Please pass a valid API key. (mock-vendor-detail-5e1f)';

// open-meteo 지오코딩 가짜 결과(이름 → 좌표). 나머지 이름은 결과 없음.
const FREE_GEOCODE = {
  '누마즈': { name: 'Numazu', latitude: 35.0956, longitude: 138.8634 },
  numazu: { name: 'Numazu', latitude: 35.0956, longitude: 138.8634 }
};

const GOOGLE_KINDS = new Set(['places', 'placesMedia', 'geocode', 'directions']);

function hashText(text) {
  let h = 0;
  for (const ch of String(text)) h = ((h * 31) + ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

function fakePlaces(textQuery, count = 5) {
  const tag = hashText(textQuery);
  const isFood = /맛집|레스토랑|restaurant|グルメ|レストラン|food/i.test(textQuery);
  return Array.from({ length: count }, (_, i) => {
    const id = `mock${tag}${i}`;
    return {
      id,
      displayName: { text: `${isFood ? 'Mock Restaurant' : 'Mock Sight'} ${tag}-${i}`, languageCode: 'ko' },
      formattedAddress: `${i + 1}-2-3 Asakusa, Taito City, Tokyo 111-0032, Japan`,
      rating: 4.1 + (i % 5) * 0.1,
      userRatingCount: 800 + i * 50,
      googleMapsUri: `https://maps.google.com/?cid=${1000 + i}`,
      primaryType: isFood ? 'ramen_restaurant' : 'tourist_attraction',
      priceLevel: 'PRICE_LEVEL_MODERATE',
      location: { latitude: 35.71 + i * 0.002, longitude: 139.79 + i * 0.002 },
      currentOpeningHours: { openNow: true, weekdayDescriptions: ['Monday: 11:00 AM – 9:00 PM', 'Tuesday: 11:00 AM – 9:00 PM', 'Wednesday: 11:00 AM – 9:00 PM', 'Thursday: 11:00 AM – 9:00 PM', 'Friday: 11:00 AM – 9:00 PM', 'Saturday: 11:00 AM – 9:00 PM', 'Sunday: 11:00 AM – 9:00 PM'] },
      photos: [{
        name: `places/${id}/photos/photo${i}`,
        widthPx: 1200,
        heightPx: 800,
        authorAttributions: [{ displayName: 'Mock Photographer', uri: 'https://maps.google.com/maps/contrib/1234567890' }]
      }]
    };
  });
}

const OK_BLOCKS = [
  '오전(09:00-11:00): 센소지 (아사쿠사)',
  '오후(13:00-15:00): 메이지 신궁 (하라주쿠)',
  '저녁(18:00-19:30): 저녁 식사 (신주쿠)'
];

// 일정 시나리오: 날짜 순번(i, 0부터) → 그날의 블록. 서버 후처리(postProcessItinerary)가 계약대로 고치는지 본다.
const ITINERARY_SCENARIOS = {
  ok: () => OK_BLOCKS,
  // 저녁 칸에 든 관광 → 서버가 시각을 지킨 채 '오후(19:00-21:00)'로 바꿔야 한다
  evening_sight: () => ['오전(09:00-11:00): 오사카성 (주오구)', '저녁(19:00-21:00): 우메다 스카이 빌딩 (우메다)'],
  // 오후 칸에 든 맛집(foods 이름) → '점심(12:00-13:30)'으로
  lunch_food_in_afternoon: () => ['오전(09:00-11:00): 센소지 (아사쿠사)', '오후(12:00-13:30): 스시다이 (츠키지)', '오후(14:00-16:00): 메이지 신궁 (하라주쿠)'],
  // 하루가 다 드는 곳(USJ)이 반나절 칸에 → 그날 관광은 '종일' 하나(식사는 남김)
  allday_halfslot: () => ['오전(09:00-11:00): 유니버셜 스튜디오 재팬 (오사카)', '오후(13:00-15:00): 오사카성 (주오구)', '저녁(18:00-19:30): 쿠시카츠 다루마 (신세카이)'],
  // 꼭 갈 곳(mustVisit)을 빼먹은 일정 → 서버가 넣어야 한다
  missing_must: () => ['오전(09:00-11:00): 센소지 (아사쿠사)', '오후(13:00-15:00): 메이지 신궁 (하라주쿠)'],
  // 매일 같은 '점심 식사' → 식사는 반복 정리 대상이 아니다(매일 남는다)
  lunch_repeat: (i) => [i === 0 ? '오전(09:00-11:00): 오사카성 (주오구)' : '오전(09:00-11:00): 우메다 스카이 빌딩 (우메다)', '점심(12:00-13:00): 점심 식사 (난바)', '오후(14:00-16:00): 도톤보리 (난바)'],
  // 오사카 날(1일차)에 교토 명소
  wrong_city_day: (i) => (i === 0
    ? ['오전(09:00-11:00): 후시미 이나리 타이샤 (후시미)', '오후(13:00-15:00): 오사카성 (주오구)', '저녁(18:00-19:30): 쿠시카츠 다루마 (신세카이)']
    : ['오전(09:00-11:00): 기요미즈데라 (히가시야마)', '오후(13:00-15:00): 금각사 (기타구)', '저녁(18:00-19:30): 저녁 식사 (기온)']),
  // 후보·내장 데이터 어디에도 없는 장소(지어낸 이름) → postProcess.unverified로 센다
  invented_place: () => ['오전(09:00-11:00): 하늘정원 비밀 전망대 (어딘가)', '오후(13:00-15:00): 메이지 신궁 (하라주쿠)', '저녁(18:00-19:30): 저녁 식사 (신주쿠)'],
  // 빼 달라고 한 곳(excludedPlaces ['디즈니'])을 AI가 그래도 넣은 일정 → 후처리가 지워야 한다
  disney_day: () => ['종일(09:00-18:00): 도쿄 디즈니랜드 (지바 우라야스)', '저녁(18:30-20:00): 스시다이 (츠키지)']
};

// 채팅 해석 시나리오(키가 맞는 JSON). 'chat_ok'의 출발일은 오늘 + 30일.
function chatScenarioJson(name) {
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  if (name === 'chat_ok') return { cityKey: 'osaka', cityLabel: '오사카', days: 4, startDate: future, wantedPlaces: ['유니버셜 스튜디오 재팬'], theme: 'mixed' };
  if (name === 'chat_shopping_neg') return { cityKey: 'tokyo', cityLabel: '도쿄', days: 3, theme: 'shopping' };
  if (name === 'chat_sapporo') return { cityKey: 'sapporo', cityLabel: '삿포로', days: 3, theme: 'mixed', routeCities: ['삿포로'] };
  // 실제 Gemini가 낸 잡음(검증에서 본 형태): 음식·일반 문구·금액·메시지에 없는 장소를 꼭 갈 곳으로, 틀린 일수, 근거 없는 조건
  if (name === 'chat_noisy') return { cityKey: 'tokyo', cityLabel: '도쿄', days: 4, theme: 'mixed', wantedPlaces: ['라멘', '무료 명소', '1인 50만원', '센소지', '도쿄 타워'], specialPrefs: { publicTransitOnly: true, removeShopping: true } };
  return {};
}

function geminiItinerary(days, startDate, scenario = 'ok') {
  const blocksFor = ITINERARY_SCENARIOS[scenario] || ITINERARY_SCENARIOS.ok;
  const itinerary = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    date: startDate || '2026-05-01',
    blocks: blocksFor(i)
  }));
  return { summary: '테스트용 AI 일정', itinerary, tips: ['교통카드를 준비하세요'] };
}

function geminiResponse(text, finishReason) {
  return {
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason, index: 0 }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
    modelVersion: 'mock-gemini'
  };
}

// hostile=true: 요청하지 않은 필드, HTML 문자열, 숫자 문자열, 형식이 틀린 날짜를 섞는다(서버가 걸러 내는지 본다).
function forecastFor(lat, lng, hostile = false) {
  const time = [];
  const start = new Date();
  for (let i = 0; i < 10; i++) time.push(new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));
  const base = Math.round(40 - Number(lat || 35) / 2);
  const daily = {
    time,
    weathercode: time.map((_, i) => (i % 3 === 0 ? 61 : 1)),
    temperature_2m_max: time.map(() => base),
    temperature_2m_min: time.map(() => base - 8),
    precipitation_probability_max: time.map((_, i) => (i % 3 === 0 ? 70 : 10))
  };
  if (hostile) {
    daily.sunrise = time.map(() => '<img src=x onerror=alert(1)>');
    daily.weathercode[1] = '<b>1</b>';
    daily.temperature_2m_max[2] = String(base);
    daily.precipitation_probability_max[3] = { value: 50 };
    daily.time = time.concat(['2026-10-01T00:00<script>']);
    daily.weathercode.push(3);
  }
  return {
    latitude: Number(lat),
    longitude: Number(lng),
    timezone: 'Asia/Tokyo',
    daily
  };
}

function createMockVendor({ port, host = '127.0.0.1' } = {}) {
  const state = {
    log: [],
    scenario: {},
    server: null
  };

  function reset(scenario = {}) {
    state.log.length = 0;
    state.scenario = { places: 'ok', geocode: 'ok', directions: 'ok', gemini: 'ok', travelpayouts: 'ok', weather: 'ok', ...scenario };
  }
  reset();

  function record(entry) {
    state.log.push({ at: Date.now(), ...entry });
  }

  async function handle(req, res) {
    const url = new URL(req.url, `http://${host}:${port}`);
    const body = await readBody(req);
    const headers = { ...req.headers };
    const p = url.pathname;
    const sc = state.scenario;

    // ── net-guard가 돌려보낸 외부 호출: /__external/<proto>/<host>/<path> ──
    const ext = /^\/__external\/(https?)\/([^/]+)(\/.*)?$/.exec(p);
    if (ext) {
      const extHost = ext[2].toLowerCase();
      const extPath = ext[3] || '/';
      if (OAUTH_EXTERNAL_HOSTS.has(extHost)) {
        record({ kind: 'oauth', host: extHost, path: extPath, query: url.search, method: req.method, headers, body });
        return sendJson(res, 401, { error: 'invalid_client', error_description: 'mock: token exchange refused (test)' });
      }
      const known = FREE_EXTERNAL_HOSTS.has(extHost);
      record({ kind: known ? 'external' : 'unexpectedExternal', host: extHost, path: extPath, query: url.search, method: req.method, headers, body });
      if (!known) return sendJson(res, 502, { error: `blocked by test network guard: ${extHost}` });
      if (extHost === 'open.er-api.com') {
        return sendJson(res, 200, { result: 'success', base_code: 'JPY', time_last_update_utc: 'Wed, 01 Oct 2026 00:02:31 +0000', rates: { KRW: 9.25, USD: 0.00675, JPY: 1 } });
      }
      if (extHost === 'api.frankfurter.app') {
        return sendJson(res, 200, { amount: 1, base: 'JPY', date: '2026-10-01', rates: { KRW: 9.25, USD: 0.00675 } });
      }
      if (extHost === 'api.open-meteo.com') {
        return sendJson(res, 200, forecastFor(url.searchParams.get('latitude'), url.searchParams.get('longitude'), sc.weather === 'hostile'));
      }
      if (extHost === 'geocoding-api.open-meteo.com') {
        const name = String(url.searchParams.get('name') || '').trim();
        const hit = FREE_GEOCODE[name] || FREE_GEOCODE[name.toLowerCase()];
        return sendJson(res, 200, hit ? { results: [{ id: 1, country_code: 'JP', country: 'Japan', ...hit }], generationtime_ms: 0.1 } : { generationtime_ms: 0.1 });
      }
      return sendJson(res, 404, { error: 'unknown free endpoint' });
    }

    // ── Google Places API (New) ──
    if (req.method === 'POST' && p === '/v1/places:searchText') {
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch { parsed = {}; }
      record({ kind: 'places', path: p, method: req.method, headers, body, textQuery: parsed.textQuery || '' });
      if (sc.places === 'billing403') {
        return sendJson(res, 403, {
          error: {
            code: 403,
            message: 'This API method requires billing to be enabled. Please enable billing on project #000000000000 by visiting https://console.developers.google.com/billing/enable?project=000000000000 then retry.',
            status: 'PERMISSION_DENIED',
            details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'BILLING_DISABLED', domain: 'googleapis.com', metadata: { service: 'places.googleapis.com', consumer: 'projects/000000000000' } }]
          }
        });
      }
      if (sc.places === 'empty') return sendJson(res, 200, {});
      return sendJson(res, 200, { places: fakePlaces(parsed.textQuery || 'query', 5) });
    }
    const media = /^\/v1\/(places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+)\/media$/.exec(p);
    if (req.method === 'GET' && media) {
      record({ kind: 'placesMedia', path: p, query: url.search, method: req.method, headers });
      return sendJson(res, 200, { name: media[1], photoUri: `http://${host}:${port}/photo-bytes/${encodeURIComponent(media[1].split('/').pop())}.jpg` });
    }
    if (req.method === 'GET' && p.startsWith('/photo-bytes/')) {
      record({ kind: 'photoBytes', path: p, method: req.method, headers });
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': JPEG_BYTES.length });
      return res.end(JPEG_BYTES);
    }

    // ── Geocoding / Directions (HTTP 200 + status 로 거부를 알린다) ──
    if (req.method === 'GET' && p === '/maps/api/geocode/json') {
      record({ kind: 'geocode', path: p, query: url.search, method: req.method, headers });
      if (sc.geocode === 'denied-billing') {
        return sendJson(res, 200, {
          error_message: 'You must enable Billing on the Google Cloud Project at https://console.cloud.google.com/project/_/billing/enable Learn more at https://developers.google.com/maps/gmp-get-started',
          results: [],
          status: 'REQUEST_DENIED'
        });
      }
      return sendJson(res, 200, { status: 'OK', results: [{ formatted_address: 'Numazu, Shizuoka, Japan', geometry: { location: { lat: 35.0956, lng: 138.8634 } } }] });
    }
    if (req.method === 'GET' && p === '/maps/api/directions/json') {
      record({ kind: 'directions', path: p, query: url.search, method: req.method, headers });
      if (sc.directions === 'denied') {
        return sendJson(res, 200, { error_message: 'This API project is not authorized to use this API.', routes: [], status: 'REQUEST_DENIED' });
      }
      return sendJson(res, 200, { status: 'OK', routes: [{ legs: [{ distance: { value: 3200 }, duration: { value: 720 } }] }] });
    }

    // ── Gemini generateContent ──
    const gem = /^\/v1beta\/models\/([^/:]+):generateContent$/.exec(p);
    if (req.method === 'POST' && gem) {
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch { parsed = {}; }
      const prompt = String(parsed?.contents?.[0]?.parts?.[0]?.text || '');
      // 채팅 해석도 responseSchema(cityKey enum 등)를 보내므로, 일정 요청은 스키마에 itinerary 속성이 있는지로 가른다.
      const isItinerary = Boolean(parsed?.generationConfig?.responseSchema?.properties?.itinerary);
      record({ kind: 'gemini', model: decodeURIComponent(gem[1]), path: p, query: url.search, method: req.method, headers, body: parsed, prompt, isItinerary });
      if (sc.gemini === 'error429') {
        return sendJson(res, 429, { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota). (mock)', status: 'RESOURCE_EXHAUSTED' } });
      }
      if (sc.gemini === 'error429_daily') {
        // 하루 무료 한도(PerDay quotaId) 소진: 서버는 AI_DAILY_LIMIT으로 알려야 한다(분당 429의 AI_BUSY와 구분)
        return sendJson(res, 429, { error: { code: 429, message: 'You exceeded your current quota. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20 (mock)', status: 'RESOURCE_EXHAUSTED',
          details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '47s' }] } });
      }
      if (sc.gemini === 'error503') {
        return sendJson(res, 503, { error: { code: 503, message: 'The model is overloaded due to high demand. Please try again later. (mock)', status: 'UNAVAILABLE' } });
      }
      if (sc.gemini === 'error400') {
        return sendJson(res, 400, {
          error: {
            code: 400,
            message: GEMINI_ERROR_TEXT,
            status: 'INVALID_ARGUMENT',
            details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' }]
          }
        });
      }
      if (!isItinerary) return sendJson(res, 200, geminiResponse(JSON.stringify(chatScenarioJson(sc.gemini)), 'STOP'));
      const days = Number((/exactly (\d+) entries/.exec(prompt) || [])[1] || 2);
      if (sc.gemini === 'max_tokens') {
        return sendJson(res, 200, geminiResponse('{"summary":"잘린 응답","itinerary":[{"day":1,"date":"2026-05-01","blocks":["오전(09:00-11:00): 센소지', 'MAX_TOKENS'));
      }
      if (sc.gemini === 'empty_days') {
        const empty = { summary: '빈 일정', itinerary: Array.from({ length: days }, (_, i) => ({ day: i + 1, date: '2026-05-01', blocks: [] })), tips: [] };
        return sendJson(res, 200, geminiResponse(JSON.stringify(empty), 'STOP'));
      }
      return sendJson(res, 200, geminiResponse(JSON.stringify(geminiItinerary(days, null, sc.gemini)), 'STOP'));
    }

    // ── Travelpayouts (Aviasales Data API v3) ──
    if (req.method === 'GET' && p === '/aviasales/v3/prices_for_dates') {
      record({ kind: 'travelpayouts', path: p, query: url.search, method: req.method, headers });
      if (sc.travelpayouts === 'error') return sendJson(res, 500, { success: false, error: 'mock failure' });
      if (sc.travelpayouts === 'empty') return sendJson(res, 200, { success: true, data: [], currency: 'krw' });
      const dep = String(url.searchParams.get('departure_at') || '2026-05-01');
      const ret = String(url.searchParams.get('return_at') || '');
      const depDate = /^\d{4}-\d{2}-\d{2}$/.test(dep) ? dep : `${dep}-15`;
      const row = {
        origin: url.searchParams.get('origin') || 'ICN',
        destination: url.searchParams.get('destination') || 'NRT',
        origin_airport: url.searchParams.get('origin') || 'ICN',
        destination_airport: url.searchParams.get('destination') || 'NRT',
        price: 189000,
        airline: 'KE',
        flight_number: '703',
        departure_at: `${depDate}T09:05:00+09:00`,
        transfers: 0,
        return_transfers: 0,
        duration: 145,
        duration_to: 145,
        duration_back: ret ? 150 : 0,
        link: '/search/ICN0105NRT1'
      };
      if (ret) row.return_at = `${/^\d{4}-\d{2}-\d{2}$/.test(ret) ? ret : `${ret}-18`}T18:00:00+09:00`;
      return sendJson(res, 200, { success: true, data: [row], currency: 'krw' });
    }

    record({ kind: 'unknownMockRoute', path: p, query: url.search, method: req.method, headers, body });
    return sendJson(res, 404, { error: `mock vendor: no route for ${req.method} ${p}` });
  }

  return {
    get log() { return state.log; },
    get scenario() { return state.scenario; },
    set scenario(v) { state.scenario = { ...state.scenario, ...v }; },
    baseUrl: `http://${host}:${port}`,
    reset,
    count(kind) { return state.log.filter((e) => e.kind === kind).length; },
    entries(kind) { return state.log.filter((e) => e.kind === kind); },
    googleHits() { return state.log.filter((e) => GOOGLE_KINDS.has(e.kind)).length; },
    start() {
      return new Promise((resolve, reject) => {
        state.server = http.createServer((req, res) => {
          handle(req, res).catch((err) => {
            try { sendJson(res, 500, { error: String(err && err.message || err) }); } catch { /* 이미 응답함 */ }
          });
        });
        state.server.once('error', reject);
        state.server.listen(port, host, () => resolve());
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (!state.server) return resolve();
        state.server.close(() => resolve());
        if (typeof state.server.closeAllConnections === 'function') state.server.closeAllConnections();
      });
    }
  };
}

module.exports = { createMockVendor, JPEG_BYTES, FREE_EXTERNAL_HOSTS, GEMINI_ERROR_TEXT, ITINERARY_SCENARIOS };
