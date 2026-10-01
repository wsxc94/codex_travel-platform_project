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
 *                  채팅 해석(일정이 아닌 요청)용: 'chat_ok' | 'chat_shopping_neg' | 'chat_sapporo' | 'chat_noisy' | 'chat_place_unknown' (그 밖에는 '{}')
 *                  일정용(ITINERARY_SCENARIOS): 'evening_sight' | 'lunch_food_in_afternoon' | 'allday_halfslot' | 'missing_must'
 *                  | 'lunch_repeat' | 'wrong_city_day' | 'invented_place' | 'disney_day' | 'renamed_places' (그 밖에는 'ok' 일정)
 *                  일정 요청 판별: generationConfig.responseSchema.properties.itinerary 가 있으면 일정(채팅 해석도 responseSchema를 보낸다).
 *                  모델 체인 시험용: 'error404'(모델 종료 no longer available) | 'max_tokens_thoughts'(생각 토큰이 한도를 다 써서 MAX_TOKENS)
 *                  | 'error400_thinking_budget'(thinkingConfig.thinkingBudget이 있으면 400 INVALID_ARGUMENT, 없으면 'chat_ok'처럼 정상)
 *   geminiModels:  { [모델 이름]: 위 gemini 값 } — 그 모델에만 다른 시나리오(나머지 모델은 gemini 값)
 *   geminiDelayMs: { [모델 이름]: ms } — 그만큼 늦게 답한다. 서버가 먼저 끊으면(시간 초과) 아무것도 보내지 않는다.
 *   travelpayouts: 'ok' | 'empty' | 'error'
 *   weather:       'ok' | 'hostile' (open-meteo 응답에 예상 밖 필드·HTML·잘못된 날짜를 섞음)
 *
 *   oauth:         'refuse'(기본) | 'ok'
 *   supabase:      'ok' | 'down' (모든 Supabase 요청에 503 + 원문 SUPABASE_ERROR_TEXT)
 *                  | 'auth' (모든 요청에 401 Invalid API key: 키가 틀렸거나 폐기됨)
 *                  | 'reject_post' (POST만 400 22P05: 저장소가 내용을 거절)
 *                  'ok'일 때도 POST 본문의 글자에 NUL(\u0000)이 있으면 400 22P05, 짝 없는 서로게이트가 있으면 400 22P02
 *                  (실제 Postgres text·jsonb처럼).
 *
 * OAuth(네이버·카카오·Google) 호출은 kind 'oauth'로 기록한다. 기본('refuse')은 토큰 교환을 401로 거절한다
 * (콜백이 state 검사를 통과했는지만 보려는 것). 'ok'면 토큰과 프로필(scenario.oauthProfile = { id, name, email, picture })을
 * 돌려줘 로그인이 끝까지 간다 — 이때 서버의 users.json은 테스트가 준 임시 TABIMARU_DATA_DIR에만 쓰인다.
 *
 * 가짜 Supabase(PostgREST): SUPABASE_URL = <baseUrl>/supabase. kind 'supabase'로 헤더·쿼리·본문을 기록한다.
 *   HEAD/GET /supabase/rest/v1/            연결 확인(200)
 *   GET    /supabase/rest/v1/travel_plans  select(열 이름 목록 또는 *)·<열>=eq.<값>·order=<열>.asc|desc·limit
 *   POST   /supabase/rest/v1/travel_plans  on_conflict=plan_key + Prefer resolution=merge-duplicates(없으면 겹치는 키는 409),
 *                                          Prefer return=representation|minimal, 열 검사(city_key·payload not null, start_date 날짜, days 정수)
 *   DELETE /supabase/rest/v1/travel_plans  eq 필터 필수, Prefer return=representation이면 지운 행(select 열)
 *   그 밖의 연산자·열·경로는 400/404 + kind 'unknownMockRoute'(테스트가 실패로 본다).
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

// supabase: 'down' 응답의 원문. 이 글자가 클라이언트 응답에 나오면 안 된다.
const SUPABASE_ERROR_TEXT = 'mock-supabase-detail-7c41: upstream database is restoring';
const SUPABASE_PREFIX = '/supabase/rest/v1';
// deploy/supabase/schema.sql의 public.travel_plans 열
const TRAVEL_PLAN_COLUMNS = new Set(['id', 'plan_key', 'user_label', 'city_key', 'city_label', 'theme', 'budget', 'start_date', 'days', 'summary', 'source', 'payload', 'created_at', 'updated_at']);

const DEFAULT_OAUTH_PROFILE = { id: 'mock-user-1', name: 'Mock User', email: 'mock-user@example.test', picture: 'https://lh3.googleusercontent.com/a/mock-avatar' };

// scenario.oauth = 'ok'일 때 공급자별 응답(토큰 교환 → 프로필)
function oauthOkResponse(host, p, profile) {
  const P = { ...DEFAULT_OAUTH_PROFILE, ...(profile || {}) };
  const token = { access_token: 'mock-oauth-access-token', token_type: 'bearer', expires_in: 3600 };
  if ((host === 'nid.naver.com' && p === '/oauth2.0/token') || (host === 'kauth.kakao.com' && p === '/oauth/token') || (host === 'oauth2.googleapis.com' && p === '/token')) return token;
  const withId = (obj, key = 'id') => (P.id === null || P.id === undefined ? obj : { [key]: P.id, ...obj });
  if (host === 'openapi.naver.com' && p === '/v1/nid/me') {
    return { resultcode: '00', message: 'success', response: withId({ nickname: P.name, email: P.email, profile_image: P.picture }) };
  }
  // 이메일 확인 여부: profile.emailVerified(기본 true)를 Google verified_email·Kakao is_email_verified로 돌려준다.
  const verified = P.emailVerified !== false;
  if (host === 'kapi.kakao.com' && p === '/v2/user/me') {
    const kakao = { kakao_account: { email: P.email, is_email_valid: true, is_email_verified: verified, profile: { nickname: P.name, profile_image_url: P.picture } } };
    return P.id === null || P.id === undefined ? kakao : { id: /^\d+$/.test(String(P.id)) ? Number(P.id) : P.id, ...kakao };
  }
  if (host === 'www.googleapis.com' && p === '/oauth2/v2/userinfo') return withId({ name: P.name, email: P.email, verified_email: verified, picture: P.picture });
  return null;
}

// 실제 Postgres처럼 text·jsonb가 받지 않는 글자를 찾는다: NUL → '22P05', 짝 없는 서로게이트 → '22P02'
function badPgText(value, depth = 0) {
  if (depth > 200) return null;
  const check = (s) => (s.includes('\u0000') ? '22P05' : (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s) ? '22P02' : null));
  if (typeof value === 'string') return check(value);
  if (!value || typeof value !== 'object') return null;
  for (const [k, v] of Object.entries(value)) {
    const bad = (Array.isArray(value) ? null : check(k)) || badPgText(v, depth + 1);
    if (bad) return bad;
  }
  return null;
}

function strictDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

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
  disney_day: () => ['종일(09:00-18:00): 도쿄 디즈니랜드 (지바 우라야스)', '저녁(18:30-20:00): 스시다이 (츠키지)'],
  // 하나마키 후보 이름을 AI가 다르게 적은 일정(실측 10-01): 일본어 표기('釜淵ノ滝' = 가마부치 폭포), 띄어쓰기만 다른 이름('일본현대시가문학관'),
  // 글자가 덧붙은 이름('가마부치폭포수'), 지어낸 곳('하늘정원 비밀 전망대'), 식사 칸의 '자유 식사' → 후처리가 후보 이름으로 되돌리거나 바꿔야 한다
  renamed_places: (i) => [
    ['오전(09:00-11:00): 釜淵ノ滝 (하나마키시)', '점심(12:00-13:00): 자유 식사 (하나마키)', '오후(13:30-15:30): 일본현대시가문학관 (기타카미시)', '저녁(18:00-19:30): 완코소바 (온천지구)'],
    ['오전(09:00-11:00): 가마부치폭포수 (하나마키시)', '오후(13:00-15:00): 하늘정원 비밀 전망대 (어딘가)', '저녁(18:00-19:30): 자유 식사 (하나마키)']
  ][i % 2]
};

// 채팅 해석 시나리오(키가 맞는 JSON). 'chat_ok'의 출발일은 오늘 + 30일.
// 'chat_place_unknown': 채팅 프롬프트는 도시 주변 실제 명소를 모른다(실측 10-01) — 데이터에 있는 장소를 '데이터 없음'으로, 도시는 엉뚱하게 낸다.
function chatScenarioJson(name, prompt = '') {
  if (name === 'chat_place_unknown') {
    const m = /"message":"((?:[^"\\]|\\.)*)"/.exec(String(prompt));
    const message = m ? JSON.parse(`"${m[1]}"`) : '';
    if (/高山/.test(message)) return { cityKey: 'tokyo', cityLabel: '도쿄', days: 2, theme: 'mixed', unsupportedPlaces: ['高山'], wantedPlaces: ['다카야마 산마치'] };
    if (/다케토미/.test(message)) return { cityKey: 'okinawa', cityLabel: '오키나와', days: 2, theme: 'mixed', unsupportedPlaces: ['다케토미섬'], wantedPlaces: [] };
    return { cityKey: 'tokyo', cityLabel: '도쿄', days: 2, theme: 'mixed' };
  }
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

function geminiResponse(text, finishReason, usageExtra = {}) {
  return {
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason, index: 0 }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150, ...usageExtra },
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
    server: null,
    db: { rows: [], lastTs: 0, seq: 0 }
  };

  function reset(scenario = {}) {
    state.log.length = 0;
    state.scenario = { places: 'ok', geocode: 'ok', directions: 'ok', gemini: 'ok', travelpayouts: 'ok', weather: 'ok', oauth: 'refuse', supabase: 'ok', ...scenario };
    state.db = { rows: [], lastTs: 0, seq: 0 };
  }
  reset();

  function record(entry) {
    state.log.push({ at: Date.now(), ...entry });
  }

  // ── 가짜 Supabase(PostgREST) ──
  function dbNow() {
    state.db.lastTs = Math.max(Date.now(), state.db.lastTs + 1);
    return new Date(state.db.lastTs).toISOString();
  }

  function unsupported(res, entry, message) {
    record({ kind: 'unknownMockRoute', ...entry, note: message });
    return sendJson(res, 400, { code: 'PGRST100', message: `mock supabase: ${message}` });
  }

  function handleSupabase(req, res, url, rest, body, headers) {
    const prefer = String(headers.prefer || '').split(',').map((s) => s.trim()).filter(Boolean);
    const entry = { kind: 'supabase', method: req.method, path: rest, query: url.search, headers, body, prefer };
    record(entry);
    if (state.scenario.supabase === 'down') return sendJson(res, 503, { message: SUPABASE_ERROR_TEXT, hint: 'mock' });
    if (state.scenario.supabase === 'auth') return sendJson(res, 401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' });
    if (state.scenario.supabase === 'reject_post' && req.method === 'POST') {
      return sendJson(res, 400, { code: '22P05', details: 'mock: content rejected', hint: null, message: 'unsupported Unicode escape sequence' });
    }
    if (rest === '' || rest === '/') {
      if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'application/openapi+json' }); return res.end(); }
      if (req.method === 'GET') return sendJson(res, 200, { swagger: '2.0', info: { title: 'mock postgrest' } });
      return unsupported(res, entry, `${req.method} on root`);
    }
    if (rest !== '/travel_plans') {
      record({ kind: 'unknownMockRoute', method: req.method, path: SUPABASE_PREFIX + rest, query: url.search });
      return sendJson(res, 404, { code: 'PGRST205', message: 'mock supabase: unknown table' });
    }
    // 쿼리 해석: select·order·limit·on_conflict 말고는 모두 <열>=eq.<값> 필터
    let select = null;
    let order = null;
    let limit = null;
    let onConflict = null;
    const filters = [];
    for (const [k, v] of url.searchParams) {
      if (k === 'select') {
        const cols = v.split(',').map((s) => s.trim());
        if (!(cols.length === 1 && cols[0] === '*') && cols.some((c) => !TRAVEL_PLAN_COLUMNS.has(c))) return unsupported(res, entry, `select ${v}`);
        select = cols[0] === '*' ? null : cols;
      } else if (k === 'order') {
        const m = /^([a-z_]+)\.(asc|desc)$/.exec(v);
        if (!m || !TRAVEL_PLAN_COLUMNS.has(m[1])) return unsupported(res, entry, `order ${v}`);
        order = { col: m[1], desc: m[2] === 'desc' };
      } else if (k === 'limit') {
        if (!/^\d+$/.test(v)) return unsupported(res, entry, `limit ${v}`);
        limit = Number(v);
      } else if (k === 'on_conflict') {
        onConflict = v;
      } else {
        if (!TRAVEL_PLAN_COLUMNS.has(k) || !v.startsWith('eq.')) return unsupported(res, entry, `filter ${k}=${v}`);
        filters.push([k, v.slice(3)]);
      }
    }
    const matches = (row) => filters.every(([col, val]) => row[col] !== null && row[col] !== undefined && String(row[col]) === val);
    const project = (row) => {
      const copy = JSON.parse(JSON.stringify(row));
      if (!select) return copy;
      return Object.fromEntries(select.map((c) => [c, c in copy ? copy[c] : null]));
    };
    const wantsRows = prefer.includes('return=representation');

    if (req.method === 'GET') {
      let rows = state.db.rows.filter(matches);
      if (order) {
        rows = rows.slice().sort((a, b) => {
          const x = String(a[order.col] ?? '');
          const y = String(b[order.col] ?? '');
          return order.desc ? (x < y ? 1 : x > y ? -1 : 0) : (x < y ? -1 : x > y ? 1 : 0);
        });
      }
      if (limit !== null) rows = rows.slice(0, limit);
      return sendJson(res, 200, rows.map(project));
    }

    if (req.method === 'POST') {
      let incoming;
      try { incoming = JSON.parse(body || 'null'); } catch { return sendJson(res, 400, { code: 'PGRST102', message: 'mock supabase: invalid JSON' }); }
      incoming = Array.isArray(incoming) ? incoming : [incoming];
      const badText = badPgText(incoming);
      if (badText === '22P05') return sendJson(res, 400, { code: '22P05', details: '\\u0000 cannot be converted to text.', hint: null, message: 'unsupported Unicode escape sequence' });
      if (badText) return sendJson(res, 400, { code: '22P02', details: 'Unicode low surrogate must follow a high surrogate.', hint: null, message: 'invalid input syntax for type json' });
      const merge = prefer.includes('resolution=merge-duplicates');
      if (merge && onConflict !== 'plan_key') return unsupported(res, entry, `on_conflict ${onConflict}`);
      for (const r of incoming) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) return sendJson(res, 400, { code: 'PGRST102', message: 'mock supabase: row must be an object' });
        const badCol = Object.keys(r).find((c) => !TRAVEL_PLAN_COLUMNS.has(c));
        if (badCol) return sendJson(res, 400, { code: 'PGRST204', message: `mock supabase: column ${badCol} does not exist` });
        if (typeof r.plan_key !== 'string' || !r.plan_key) return sendJson(res, 400, { code: '23502', message: 'mock supabase: plan_key is null' });
        if (typeof r.city_key !== 'string' || !r.city_key) return sendJson(res, 400, { code: '23502', message: 'mock supabase: city_key is null' });
        if (r.payload === null || r.payload === undefined) return sendJson(res, 400, { code: '23502', message: 'mock supabase: payload is null' });
        if (r.start_date !== null && r.start_date !== undefined && !strictDate(r.start_date)) return sendJson(res, 400, { code: '22008', message: 'mock supabase: invalid date' });
        if (r.days !== null && r.days !== undefined && !Number.isInteger(r.days)) return sendJson(res, 400, { code: '22P02', message: 'mock supabase: days must be integer' });
      }
      const affected = [];
      for (const r of incoming) {
        const existing = state.db.rows.find((x) => x.plan_key === r.plan_key);
        if (existing && !merge) return sendJson(res, 409, { code: '23505', message: 'mock supabase: duplicate key value violates unique constraint' });
        const ts = dbNow();
        if (existing) {
          Object.assign(existing, JSON.parse(JSON.stringify(r)), { id: existing.id, created_at: existing.created_at, updated_at: ts });
          affected.push(existing);
        } else {
          state.db.seq += 1;
          const row = { id: `00000000-0000-4000-8000-${String(state.db.seq).padStart(12, '0')}`, plan_key: null, user_label: null, city_key: null, city_label: null, theme: null, budget: null, start_date: null, days: null, summary: null, source: null, payload: null, created_at: ts, updated_at: ts };
          Object.assign(row, JSON.parse(JSON.stringify(r)), { created_at: ts, updated_at: ts });
          state.db.rows.push(row);
          affected.push(row);
        }
      }
      if (wantsRows) return sendJson(res, 201, affected.map(project));
      res.writeHead(201);
      return res.end();
    }

    if (req.method === 'DELETE') {
      if (filters.length === 0) return unsupported(res, entry, 'unfiltered delete');
      const gone = state.db.rows.filter(matches);
      state.db.rows = state.db.rows.filter((r) => !matches(r));
      if (wantsRows) return sendJson(res, 200, gone.map(project));
      res.writeHead(204);
      return res.end();
    }

    return unsupported(res, entry, `method ${req.method}`);
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
        if (sc.oauth === 'ok') {
          const ok = oauthOkResponse(extHost, extPath, sc.oauthProfile);
          if (ok) return sendJson(res, 200, ok);
          return sendJson(res, 404, { error: 'mock: unknown oauth endpoint' });
        }
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

    // ── 가짜 Supabase(PostgREST) ──
    if (p === SUPABASE_PREFIX || p.startsWith(SUPABASE_PREFIX + '/')) {
      return handleSupabase(req, res, url, p.slice(SUPABASE_PREFIX.length), body, headers);
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
      const model = decodeURIComponent(gem[1]);
      record({ kind: 'gemini', model, path: p, query: url.search, method: req.method, headers, body: parsed, prompt, isItinerary });
      // 모델별 시나리오(geminiModels)가 있으면 그 모델에만 그것을, 없으면 sc.gemini를 쓴다.
      let scGem = (sc.geminiModels && sc.geminiModels[model]) || sc.gemini;
      // 모델별 응답 지연(geminiDelayMs): 서버가 기다리다 끊으면(시간 초과) 아무것도 보내지 않는다.
      const delayMs = Number(sc.geminiDelayMs && sc.geminiDelayMs[model]) || 0;
      if (delayMs > 0) {
        let gone = false;
        res.once('close', () => { gone = true; });
        await new Promise((r) => setTimeout(r, delayMs));
        if (gone || res.destroyed || res.writableEnded) return undefined;
      }
      if (scGem === 'error400_thinking_budget') {
        // thinkingBudget을 받지 않는 모델(실측: gemini-3.5-flash-lite): 400 INVALID_ARGUMENT, 다른 형식이면 정상 응답
        if (parsed?.generationConfig?.thinkingConfig && 'thinkingBudget' in parsed.generationConfig.thinkingConfig) {
          return sendJson(res, 400, { error: { code: 400, message: 'Request contains an invalid argument. (mock)', status: 'INVALID_ARGUMENT' } });
        }
        scGem = 'chat_ok';
      }
      if (scGem === 'error404') {
        return sendJson(res, 404, { error: { code: 404, message: `This model models/${model} is no longer available to new users. Please update your code to use a newer model. (mock)`, status: 'NOT_FOUND' } });
      }
      if (scGem === 'max_tokens_thoughts') {
        // 생각 토큰이 출력 한도를 다 쓴 응답(설정 탓 잘림): 서버는 다음 모델에 맡겨야 한다
        return sendJson(res, 200, geminiResponse('{"summary":"생각하다 잘린 응답","itinerary":[', 'MAX_TOKENS', { thoughtsTokenCount: 4000 }));
      }
      if (scGem === 'error429') {
        return sendJson(res, 429, { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota). (mock)', status: 'RESOURCE_EXHAUSTED' } });
      }
      if (scGem === 'error429_daily') {
        // 하루 무료 한도(PerDay quotaId) 소진: 서버는 AI_DAILY_LIMIT으로 알려야 한다(분당 429의 AI_BUSY와 구분)
        return sendJson(res, 429, { error: { code: 429, message: 'You exceeded your current quota. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20 (mock)', status: 'RESOURCE_EXHAUSTED',
          details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '47s' }] } });
      }
      if (scGem === 'error503') {
        return sendJson(res, 503, { error: { code: 503, message: 'The model is overloaded due to high demand. Please try again later. (mock)', status: 'UNAVAILABLE' } });
      }
      if (scGem === 'error400') {
        return sendJson(res, 400, {
          error: {
            code: 400,
            message: GEMINI_ERROR_TEXT,
            status: 'INVALID_ARGUMENT',
            details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' }]
          }
        });
      }
      if (!isItinerary) return sendJson(res, 200, geminiResponse(JSON.stringify(chatScenarioJson(scGem, prompt)), 'STOP'));
      const days = Number((/exactly (\d+) entries/.exec(prompt) || [])[1] || 2);
      if (scGem === 'max_tokens') {
        return sendJson(res, 200, geminiResponse('{"summary":"잘린 응답","itinerary":[{"day":1,"date":"2026-05-01","blocks":["오전(09:00-11:00): 센소지', 'MAX_TOKENS'));
      }
      if (scGem === 'empty_days') {
        const empty = { summary: '빈 일정', itinerary: Array.from({ length: days }, (_, i) => ({ day: i + 1, date: '2026-05-01', blocks: [] })), tips: [] };
        return sendJson(res, 200, geminiResponse(JSON.stringify(empty), 'STOP'));
      }
      return sendJson(res, 200, geminiResponse(JSON.stringify(geminiItinerary(days, null, scGem)), 'STOP'));
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
    // 가짜 Supabase 표(travel_plans)의 행 복사본 / 미리 넣기
    supabaseRows() { return JSON.parse(JSON.stringify(state.db.rows)); },
    seedSupabase(rows) {
      for (const r of rows) {
        const ts = dbNow();
        state.db.seq += 1;
        state.db.rows.push({ id: `00000000-0000-4000-8000-${String(state.db.seq).padStart(12, '0')}`, created_at: ts, updated_at: ts, ...JSON.parse(JSON.stringify(r)) });
      }
    },
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

module.exports = { createMockVendor, JPEG_BYTES, FREE_EXTERNAL_HOSTS, GEMINI_ERROR_TEXT, SUPABASE_ERROR_TEXT, ITINERARY_SCENARIOS };
