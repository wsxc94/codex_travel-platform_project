const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { randomUUID, randomBytes, createHash, timingSafeEqual } = require('crypto');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

// 환경변수 값을 공백 제거 후 반환한다(값이 공백뿐이면 미설정으로 본다). 여러 이름을 주면 앞에서부터 첫 값.
function envValue(...names) {
  for (const name of names) {
    const v = String(process.env[name] || '').trim();
    if (v) return v;
  }
  return '';
}

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

// ── 브랜드(표시 이름) — 이름을 바꿀 때는 이 줄들만 고친다 ──
// 도메인에 묶인 값(Render 주소·OAuth 콜백 경로·Rakuten Referer·쿠키 이름 sid 등)은 브랜드와 따로 둔다.
const APP_BRAND = 'Tabimaru';
const APP_TAGLINE = { ko: 'AI 일본 여행 플래너', en: 'AI Japan Trip Planner', ja: 'AI日本旅行プランナー' };
const APP_ID = 'tabimaru';
const APP_REPO_URL = 'https://github.com/wsxc94/tabimaru-japan-travel-planner';
// 외부 무료 API(open-meteo·환율 등)에 보내는 User-Agent
const OUTBOUND_USER_AGENT = `TabimaruBot/0.1 (+${APP_REPO_URL})`;

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── 장소·지도 공급자 모드 ──
// PLACES_PROVIDER: 'free'(기본, Google 호출 0회: 내장 큐레이션 + 위키미디어 사진) | 'google'(Places API(New))
// MAP_PROVIDER: 'osm'(기본, OpenStreetMap + Leaflet) | 'google'(Maps JavaScript API)
const PLACES_PROVIDER = envValue('PLACES_PROVIDER').toLowerCase() === 'google' ? 'google' : 'free';
const MAP_PROVIDER = envValue('MAP_PROVIDER').toLowerCase() === 'google' ? 'google' : 'osm';
// 서버 전용 키(브라우저로 절대 보내지 않음). 예전 변수 GOOGLE_MAPS_API_KEY는 서버 키 대체로만 쓴다.
const GOOGLE_MAPS_SERVER_KEY = envValue('GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY');
const GOOGLE_MAPS_SERVER_KEY_FROM_LEGACY = !envValue('GOOGLE_MAPS_SERVER_KEY') && Boolean(envValue('GOOGLE_MAPS_API_KEY'));
// 브라우저용 키(Maps JavaScript API 전용, HTTP 리퍼러 제한). 대체값 없음 — 없으면 지도는 OSM으로 간다.
const GOOGLE_MAPS_BROWSER_KEY = envValue('GOOGLE_MAPS_BROWSER_KEY');
const GOOGLE_PLACES_ENABLED = PLACES_PROVIDER === 'google';
// Google 호출 상한(프로세스 메모리 기준 — 재시작하면 0부터 다시 센다. 확실한 상한은 Google Cloud 콘솔의 할당량으로 건다).
// 기본값은 월 무료 사용량이 가장 작은 SKU(월 1,000회 수준) 안에 들도록 잡았다. 검색·지오코딩·경로와 사진은 따로 센다.
function nonNegativeInt(raw, fallback) {
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
const GOOGLE_DAILY_CALL_LIMIT = nonNegativeInt(envValue('GOOGLE_DAILY_CALL_LIMIT'), 30);
const GOOGLE_MONTHLY_CALL_LIMIT = nonNegativeInt(envValue('GOOGLE_MONTHLY_CALL_LIMIT'), 900);
const GOOGLE_PHOTO_DAILY_LIMIT = nonNegativeInt(envValue('GOOGLE_PHOTO_DAILY_LIMIT'), 30);
const GOOGLE_PHOTO_MONTHLY_LIMIT = nonNegativeInt(envValue('GOOGLE_PHOTO_MONTHLY_LIMIT'), 900);
const DIAGNOSTICS_TOKEN = envValue('DIAGNOSTICS_TOKEN');

// ── 외부 API 주소(테스트에서 가짜 서버로 바꿀 수 있음) ──
const PLACES_API_BASE = trimTrailingSlash(envValue('PLACES_API_BASE') || 'https://places.googleapis.com');
const GEOCODE_API_BASE = trimTrailingSlash(envValue('GEOCODE_API_BASE') || 'https://maps.googleapis.com');
const GEMINI_API_BASE = trimTrailingSlash(envValue('GEMINI_API_BASE') || 'https://generativelanguage.googleapis.com');
const TRAVELPAYOUTS_API_BASE = trimTrailingSlash(envValue('TRAVELPAYOUTS_API_BASE') || 'https://api.travelpayouts.com');
const PLACE_IMAGES_FILE = envValue('PLACE_IMAGES_FILE')
  ? path.resolve(__dirname, envValue('PLACE_IMAGES_FILE'))
  : path.join(__dirname, 'assets', 'place-images.json');

const RAKUTEN_API_BASE = trimTrailingSlash(envValue('RAKUTEN_API_BASE') || 'https://openapi.rakuten.co.jp/engine/api/Travel');

const SUPABASE_URL = trimTrailingSlash(envValue('SUPABASE_URL'));
const SUPABASE_SERVICE_ROLE_KEY = envValue('SUPABASE_SERVICE_ROLE_KEY');
// Amadeus Self-Service(test.api.amadeus.com)는 주소가 사라져 항공·숙소 대체 경로에서 뺐다(AMADEUS_* 변수는 더 이상 쓰지 않음).
const TRAVELPAYOUTS_TOKEN = envValue('TRAVELPAYOUTS_TOKEN');
const RAKUTEN_APP_ID = envValue('RAKUTEN_APP_ID');
const RAKUTEN_ACCESS_KEY = envValue('RAKUTEN_ACCESS_KEY');
// ── 환율: 실시간 조회(open.er-api → frankfurter) 성공 값을 쓴다. 실패하면 FX_* 환경변수, 그것도 없으면 대략값. ──
const FX_APPROX_USD_KRW = 1355; // 대략값(2026-09-30 실시간 값 근처). 실시간·환경변수가 모두 없을 때만 쓴다.
const FX_APPROX_JPY_KRW = 8.6;
function positiveEnvNumber(name) {
  const n = Number(envValue(name));
  return Number.isFinite(n) && n > 0 ? n : null;
}
const FX_ENV_USD_KRW = positiveEnvNumber('FX_USD_KRW');
const FX_ENV_JPY_KRW = positiveEnvNumber('FX_JPY_KRW');
let fxUsdKrw = FX_ENV_USD_KRW || FX_APPROX_USD_KRW;
let fxJpyKrw = FX_ENV_JPY_KRW || FX_APPROX_JPY_KRW;
let fxLastUpdate = '';
// 'live'(실시간 조회) | 'env'(FX_USD_KRW·FX_JPY_KRW 둘 다 설정) | 'approximate'(하나라도 대략값)
let fxSource = (FX_ENV_USD_KRW && FX_ENV_JPY_KRW) ? 'env' : 'approximate';
let fxProvider = null;
let fxLiveAt = 0;
// OpenAI 호환 공급자의 키·주소·모델(OPENAI_API_KEY·GROQ_API_KEY·OPENAI_BASE_URL·OPENAI_MODEL)은 아래 'OpenAI 호환 공급자'에서 정한다.
const OPENAI_KEY_FROM_ENV = envValue('OPENAI_API_KEY', 'OPENAI_KEY');
const GROQ_API_KEY = envValue('GROQ_API_KEY');
const GEMINI_API_KEY = envValue('GEMINI_API_KEY', 'GOOGLE_API_KEY');
const GEMINI_API_MODEL = envValue('GEMINI_API_MODEL').replace(/^models\//, '') || 'gemini-2.5-flash';
// 대체 모델 순서(2026-10-01 실측). 주 모델(GEMINI_API_MODEL) 다음에 이 순서로 시도하고, 주 모델과 같은 이름은 뺀다.
// 무료 한도는 모델마다 하루 20회(태평양 시간 자정에 다시 생김)라, 모델을 여럿 두면 하루에 쓸 수 있는 횟수가 늘어난다.
//  - gemini-2.5-flash-lite·gemini-2.5-flash: 한도가 따로라 계속 둔다
//  - gemini-3.1-flash-lite: 조건(하루 N곳·저녁 배치)을 가장 정확히 지킴
//  - gemini-3-flash-preview: 빠르고 팁이 구체적. preview라 종료되면 404 → 그 모델은 하루 쉰다
//  - gemini-3.5-flash-lite: 가장 빠름(약 3초). thinkingBudget을 400으로 거절해 thinkingLevel을 보낸다(geminiThinkingStyle)
//  - gemini-3.6-flash: 503(high demand)이 잦아 뒤쪽 / gemini-flash-latest(실제 모델 gemini-3.8-flash): 느림(9–13초)
// 뺀 모델: gemini-3.5-flash(10초 뒤 503), gemini-3.7-flash(계속 503, 24초까지), gemma-4(같은 말 반복 → MAX_TOKENS),
//   gemini-flash-lite-latest(= gemini-3.5-flash-lite 별칭: 한도도 실제 모델 기준이라 넣어도 횟수가 늘지 않음),
//   gemini-2.0-flash·2.0-flash-lite(종료, 404), gemini-2.5-pro(신규 사용자 404).
// GEMINI_FALLBACK_MODELS(쉼표 구분)로 대체 목록을 통째로 바꿀 수 있다. 'none'이면 주 모델만 쓴다.
const GEMINI_DEFAULT_FALLBACK_MODELS = Object.freeze([
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest'
]);
const GEMINI_MAX_CHAIN_LENGTH = 10;
const GEMINI_ENDPOINT = `${GEMINI_API_BASE}/v1beta/models`;
const USE_GEMINI = Boolean(GEMINI_API_KEY);

// -- 같은 경고를 반복해서 찍지 않는 로그 헬퍼 (기본: 같은 key는 10분에 한 번) --
const _warnLastAt = new Map();
function warnThrottled(key, message, windowMs = 10 * 60_000) {
  const now = Date.now();
  const last = _warnLastAt.get(key);
  if (last !== undefined && (now - last) < windowMs) return;
  _warnLastAt.set(key, now);
  console.warn(message);
}
function warnOnce(key, message) {
  warnThrottled(key, message, Number.POSITIVE_INFINITY);
}

// 모델 이름 하나: 'models/' 접두어는 떼고, 소문자·숫자·. _ - 만 받는다(키를 잘못 붙여 넣어도 이름으로 쓰지 않게 대문자는 거절).
function normalizeGeminiModelName(raw) {
  const name = String(raw || '').trim().replace(/^models\//, '');
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(name) || looksLikeGeminiKey(name)) return '';
  return name;
}

// GEMINI_FALLBACK_MODELS: 비우면 null(기본 순서), 'none'이면 [](주 모델만), 그 밖에는 쉼표로 나눈 모델 이름(틀린 이름은 뺌)
function parseGeminiFallbackModels(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^none$/i.test(text)) return { models: [], invalid: 0 };
  const models = [];
  let invalid = 0;
  for (const part of text.split(',')) {
    if (!part.trim()) continue;
    const name = normalizeGeminiModelName(part);
    if (name) models.push(name); else invalid += 1;
  }
  return { models, invalid };
}

const GEMINI_FALLBACK_FROM_ENV = parseGeminiFallbackModels(envValue('GEMINI_FALLBACK_MODELS'));
// 'env'(GEMINI_FALLBACK_MODELS로 바꿈) | 'default'(위 기본 순서)
const GEMINI_FALLBACK_SOURCE = GEMINI_FALLBACK_FROM_ENV ? 'env' : 'default';
const GEMINI_FALLBACK_MODELS = [...new Set(GEMINI_FALLBACK_FROM_ENV ? GEMINI_FALLBACK_FROM_ENV.models : GEMINI_DEFAULT_FALLBACK_MODELS)]
  .filter((m) => m !== GEMINI_API_MODEL)
  .slice(0, GEMINI_MAX_CHAIN_LENGTH - 1);
// 실제로 시도하는 순서(주 모델 포함). /api/health의 ai.geminiModelChain
const GEMINI_MODEL_CHAIN = Object.freeze([GEMINI_API_MODEL, ...GEMINI_FALLBACK_MODELS]);
if (GEMINI_FALLBACK_FROM_ENV && GEMINI_FALLBACK_FROM_ENV.invalid > 0) {
  // 값은 찍지 않는다(키를 잘못 넣었을 수도 있음)
  warnOnce('gemini-fallback-invalid', `[gemini] GEMINI_FALLBACK_MODELS에서 모델 이름 형식이 아닌 값 ${GEMINI_FALLBACK_FROM_ENV.invalid}개를 뺐습니다(소문자·숫자·. _ - 만, 예: gemini-2.5-flash).`);
}
if (GEMINI_FALLBACK_FROM_ENV && GEMINI_FALLBACK_FROM_ENV.models.length > GEMINI_MAX_CHAIN_LENGTH - 1) {
  warnOnce('gemini-fallback-long', `[gemini] GEMINI_FALLBACK_MODELS는 앞의 ${GEMINI_MAX_CHAIN_LENGTH - 1}개만 씁니다.`);
}

// ── OpenAI 호환 공급자(OpenAI 또는 Groq): 같은 Responses API 형식이라 주소(OPENAI_BASE_URL)만 바꾸면 된다 ──
// 예: Groq 무료(카드 불필요) OPENAI_BASE_URL=https://api.groq.com/openai/v1 + GROQ_API_KEY=gsk_…
// 주소는 https만(로컬 주소 localhost·127.0.0.1은 http도 허용: 개발·테스트용). 틀리면 기본 주소를 쓰고 경고한다.
// OPENAI_BASE_URL이 비었을 때: OPENAI_API_KEY 없이 GROQ_API_KEY만 있으면 Groq 주소, 그 밖에는 OpenAI 주소.
const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
function normalizeOpenAiBaseUrl(raw) {
  const text = String(raw || '').trim().replace(/\/+$/, '');
  if (!text) return OPENAI_DEFAULT_BASE_URL;
  let u;
  try { u = new URL(text); } catch { u = null; }
  const loopback = u && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (!u || u.username || u.password || u.search || u.hash || !(u.protocol === 'https:' || (u.protocol === 'http:' && loopback))) {
    // 값은 찍지 않는다(키를 잘못 넣었을 수도 있음)
    warnOnce('openai-base-invalid', `[openai] OPENAI_BASE_URL이 https 주소가 아니라서 기본 주소(${OPENAI_DEFAULT_BASE_URL})를 씁니다.`);
    return OPENAI_DEFAULT_BASE_URL;
  }
  return text;
}
const OPENAI_BASE_URL = normalizeOpenAiBaseUrl(envValue('OPENAI_BASE_URL') || (GROQ_API_KEY && !OPENAI_KEY_FROM_ENV ? GROQ_BASE_URL : ''));
const OPENAI_BASE_HOST = new URL(OPENAI_BASE_URL).host;
const OPENAI_IS_GROQ = /(^|\.)groq\.com$/i.test(new URL(OPENAI_BASE_URL).hostname);
// 로그·오류 안내에 쓰는 이름(화면의 출처 표시는 그대로 'openai')
const OPENAI_PROVIDER_LABEL = OPENAI_IS_GROQ ? 'Groq' : 'OpenAI';
// 키는 주소에 맞는 것만 보낸다: Groq 주소에는 GROQ_API_KEY(또는 OPENAI_API_KEY에 잘못 넣은 gsk_ 키),
// 그 밖의 주소에는 OPENAI_API_KEY. Groq 키(gsk_)는 api.openai.com으로, OpenAI 키는 Groq로 보내지 않는다(값은 찍지 않음).
// OPENAI_KEY_SOURCE: 실제로 쓰는 변수 이름('GROQ_API_KEY' | 'OPENAI_API_KEY' | null). /api/health의 ai.openaiKeySource
const { key: OPENAI_API_KEY, source: OPENAI_KEY_SOURCE } = (() => {
  const groqShaped = /^gsk_/.test(OPENAI_KEY_FROM_ENV);
  if (OPENAI_IS_GROQ) {
    if (GROQ_API_KEY) return { key: GROQ_API_KEY, source: 'GROQ_API_KEY' };
    if (groqShaped) return { key: OPENAI_KEY_FROM_ENV, source: 'OPENAI_API_KEY' };
    if (OPENAI_KEY_FROM_ENV) warnOnce('openai-key-groq', '[openai] OPENAI_BASE_URL이 Groq인데 GROQ_API_KEY가 없어서, OpenAI 키를 Groq로 보내지 않습니다(GROQ_API_KEY에 gsk_ 키를 넣으세요).');
    return { key: '', source: null };
  }
  if (groqShaped) {
    warnOnce('openai-key-gsk', `[openai] OPENAI_API_KEY가 Groq 키(gsk_) 모양이라 ${new URL(OPENAI_BASE_URL).host}에 보내지 않습니다(Groq 키는 GROQ_API_KEY에, 주소는 OPENAI_BASE_URL=${GROQ_BASE_URL}).`);
    return { key: '', source: null };
  }
  if (GROQ_API_KEY) warnOnce('openai-groq-unused', `[openai] GROQ_API_KEY는 OPENAI_BASE_URL이 Groq 주소(${GROQ_BASE_URL})일 때만 씁니다. 지금은 ${new URL(OPENAI_BASE_URL).host}라 쓰지 않습니다.`);
  return OPENAI_KEY_FROM_ENV ? { key: OPENAI_KEY_FROM_ENV, source: 'OPENAI_API_KEY' } : { key: '', source: null };
})();
// 주 모델. 비우면 Groq는 openai/gpt-oss-120b, OpenAI는 gpt-4o-mini
const OPENAI_MODEL = normalizeOpenAiModelName(envValue('OPENAI_MODEL')) || (OPENAI_IS_GROQ ? 'openai/gpt-oss-120b' : 'gpt-4o-mini');
if (envValue('OPENAI_MODEL') && !normalizeOpenAiModelName(envValue('OPENAI_MODEL'))) {
  warnOnce('openai-model-invalid', `[openai] OPENAI_MODEL이 모델 이름 형식이 아니라서 ${OPENAI_MODEL}을 씁니다.`);
}

// 모델 이름 하나: Groq 이름은 'openai/gpt-oss-120b'처럼 / 가 들어간다. 키처럼 생긴 값(sk-·gsk_·AIza…)은 이름으로 쓰지 않는다.
function normalizeOpenAiModelName(raw) {
  const name = String(raw || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(name) || /^(sk-|gsk_|AIza|sb_|eyJ)/.test(name)) return '';
  return name;
}
// OPENAI_FALLBACK_MODELS: 쉼표로 나눈 대체 모델(주 모델이 한도·과부하·잘림·형식 오류면 다음 모델). 비우면 주 모델만.
const OPENAI_MAX_CHAIN_LENGTH = 5;
const OPENAI_FALLBACK_RAW = String(envValue('OPENAI_FALLBACK_MODELS') || '').split(',').map((s) => s.trim()).filter(Boolean);
const OPENAI_FALLBACK_MODELS = [...new Set(OPENAI_FALLBACK_RAW.map(normalizeOpenAiModelName).filter(Boolean))]
  .filter((m) => m !== OPENAI_MODEL)
  .slice(0, OPENAI_MAX_CHAIN_LENGTH - 1);
// 실제로 시도하는 순서(주 모델 포함). /api/health의 ai.openaiModelChain
const OPENAI_MODEL_CHAIN = Object.freeze([OPENAI_MODEL, ...OPENAI_FALLBACK_MODELS]);
{
  const invalid = OPENAI_FALLBACK_RAW.filter((s) => !normalizeOpenAiModelName(s)).length;
  if (invalid > 0) warnOnce('openai-fallback-invalid', `[openai] OPENAI_FALLBACK_MODELS에서 모델 이름 형식이 아닌 값 ${invalid}개를 뺐습니다(예: openai/gpt-oss-20b).`);
}
// OPENAI_MAX_OUTPUT_TOKENS: 출력 토큰 상한(0 = 상한 없음, 그 밖에는 최소 256). Groq 무료는 분당 8천 토큰이라 일정(6일 이상 8192)을 그보다 작게 묶는다.
const OPENAI_MAX_OUTPUT_TOKENS = (() => {
  const n = nonNegativeInt(envValue('OPENAI_MAX_OUTPUT_TOKENS'), 0);
  return n > 0 ? Math.min(65_536, Math.max(256, n)) : 0;
})();
// OPENAI_REASONING_EFFORT: 추론 모델의 생각 정도(reasoning.effort). 비우면 보내지 않는다(gpt-4o-mini 같은 일반 모델은 이 값을 거절).
// Groq gpt-oss는 low·medium·high, qwen3.8-27b는 none·default·low·medium·high를 받는다 → 'low'는 셋 다 된다.
const OPENAI_REASONING_EFFORT = (() => {
  const v = envValue('OPENAI_REASONING_EFFORT').toLowerCase();
  if (!v) return '';
  if (/^(none|default|minimal|low|medium|high)$/.test(v)) return v;
  warnOnce('openai-reasoning-invalid', '[openai] OPENAI_REASONING_EFFORT는 none·default·minimal·low·medium·high 중 하나여야 해서 보내지 않습니다.');
  return '';
})();

// AI_CHAT_PROVIDER_ORDER: 채팅 해석에서 AI 공급자를 시도하는 순서(쉼표 구분, gemini·openai). 빠진 공급자는 기본 순서대로 뒤에 붙는다.
// 예: openai,gemini → Groq가 먼저 해석하고 Gemini 한도는 일정 생성에 남긴다. 일정 생성은 늘 Gemini → OpenAI 호환 순서다.
const AI_PROVIDERS_DEFAULT_ORDER = Object.freeze(['gemini', 'openai']);
const AI_CHAT_PROVIDER_ORDER = (() => {
  const parts = envValue('AI_CHAT_PROVIDER_ORDER').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const known = parts.filter((p) => AI_PROVIDERS_DEFAULT_ORDER.includes(p));
  if (known.length < parts.length) warnOnce('chat-order-invalid', '[chat] AI_CHAT_PROVIDER_ORDER에서 모르는 공급자 이름을 뺐습니다(gemini·openai만).');
  return Object.freeze([...new Set([...known, ...AI_PROVIDERS_DEFAULT_ORDER])]);
})();

// 모델별 생각(thinking) 설정. 생각 토큰도 maxOutputTokens를 나눠 써서, 켜 두면 JSON이 MAX_TOKENS로 잘린다(2026-10-01 실측).
//  'level' : gemini-3.5-flash-lite(별칭 gemini-flash-lite-latest) — thinkingBudget 0을 400 INVALID_ARGUMENT로 거절하고
//            thinkingLevel 'minimal'은 받는다(생각 토큰 0).
//  'budget': 2.5 계열, 3.x flash(3.1-flash-lite·3-flash-preview·3.5-flash·3.6-flash), flash 별칭(gemini-flash-latest = 3.8-flash)
//            — thinkingBudget 0을 받는다. pro는 최소 128이 필요하다.
//  'none'  : 그 밖(gemma 등) — 보내지 않는다.
// 목록에 없는 새 모델이 400을 내면 다른 형식으로 한 번 더 보내고, 성공한 형식을 실행 중에 기억한다(_geminiThinkingLearned).
const GEMINI_THINKING_LEVEL_MODEL_RE = /^gemini-3\.5-flash-lite|^gemini-flash-lite-latest$/;
const _geminiThinkingLearned = new Map(); // model → 'budget' | 'level'

function geminiThinkingStyle(model) {
  const learned = _geminiThinkingLearned.get(model);
  if (learned) return learned;
  if (GEMINI_THINKING_LEVEL_MODEL_RE.test(model)) return 'level';
  if (/^gemini-2\.5-/.test(model) || (/flash/.test(model) && !/pro/.test(model))) return 'budget';
  return 'none';
}

function geminiThinkingConfig(style, model, budget) {
  if (style === 'level') return { thinkingLevel: budget > 0 ? 'low' : 'minimal' };
  if (style === 'budget') return { thinkingBudget: /pro/.test(model) ? Math.max(128, budget) : budget };
  return null;
}

if (GOOGLE_PLACES_ENABLED && GOOGLE_MAPS_SERVER_KEY_FROM_LEGACY) {
  warnOnce('google-legacy-key', '[google] PLACES_PROVIDER=google 인데 GOOGLE_MAPS_SERVER_KEY가 없어 GOOGLE_MAPS_API_KEY를 서버 키로 사용합니다. 서버 전용 키(GOOGLE_MAPS_SERVER_KEY)로 분리하세요.');
}
if (GOOGLE_PLACES_ENABLED && !GOOGLE_MAPS_SERVER_KEY) {
  warnOnce('google-key-missing', '[google] PLACES_PROVIDER=google 이지만 서버 키가 없습니다. 무료 모드 데이터(내장 큐레이션)로 응답합니다.');
}

// -- AI Model Circuit Breaker --
// 429/503 에러 발생 모델을 일정 시간 스킵하여 불필요한 API 호출 방지
const MODEL_COOLDOWN_MS = 60_000; // 60초 쿨다운
// 정해진 시각까지 쉬는 경우(하루 한도)는 최대 6시간만 막고 그 뒤 한 번 다시 확인한다.
const MODEL_COOLDOWN_OVERRIDE_CAP_MS = 6 * 60 * 60_000;
// 404(모델 종료 'no longer available'·이름 없음)는 곧 돌아오지 않으므로 하루 쉬고 다시 확인한다.
const MODEL_GONE_COOLDOWN_MS = 24 * 60 * 60_000;
const _modelFailures = new Map(); // key: modelName, value: { failedAt, status, cooldownMs }

// status: HTTP 상태(429·503·404·5xx) 또는 'timeout'
// cooldownOverrideMs: 하루 무료 한도 소진·모델 종료처럼 정해진 시간만큼 쉬어야 할 때
function recordModelFailure(model, status = 429, cooldownOverrideMs = 0) {
  // 연속 실패 시 쿨다운 점진 증가 (60s -> 120s -> 240s, 최대 5분)
  const prev = _modelFailures.get(model);
  const cap = status === 404 ? MODEL_GONE_COOLDOWN_MS : MODEL_COOLDOWN_OVERRIDE_CAP_MS;
  const baseCooldown = Number(cooldownOverrideMs) > 0
    ? Math.min(Number(cooldownOverrideMs), cap)
    : (prev && (Date.now() - prev.failedAt) < prev.cooldownMs * 2)
      ? Math.min(prev.cooldownMs * 2, 300_000)
      : MODEL_COOLDOWN_MS;
  _modelFailures.set(model, { failedAt: Date.now(), status, cooldownMs: baseCooldown });
  console.log(`[circuit-breaker] ${model} marked failed (${status}), cooldown ${Math.round(baseCooldown / 1000)}s`);
}

// Gemini 무료 일일 한도가 다시 생기는 시각(태평양 시간 자정)까지 남은 ms
function geminiDailyResetMs(now = new Date()) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(now).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
    const h = parts.hour === 24 ? 0 : parts.hour;
    const elapsed = ((h * 60 + parts.minute) * 60 + parts.second) * 1000;
    return Math.max(60_000, 24 * 60 * 60_000 - elapsed);
  } catch {
    return 60 * 60_000;
  }
}

function isModelAvailable(model) {
  const entry = _modelFailures.get(model);
  if (!entry) return true;
  if (Date.now() - entry.failedAt >= entry.cooldownMs) {
    _modelFailures.delete(model);
    console.log(`[circuit-breaker] ${model} cooldown expired, re-enabling`);
    return true;
  }
  return false;
}

function getAvailableModels(models) {
  const available = models.filter(m => isModelAvailable(m));
  // 모든 모델이 쿨다운이면 가장 오래전 실패한 모델 하나라도 시도(종료된 404 모델은 다른 모델이 하나도 없을 때만)
  if (available.length === 0 && models.length > 0) {
    const alive = models.filter((m) => _modelFailures.get(m)?.status !== 404);
    const pool = alive.length ? alive : models;
    let oldest = pool[0];
    let oldestTime = Infinity;
    for (const m of pool) {
      const entry = _modelFailures.get(m);
      if (entry && entry.failedAt < oldestTime) {
        oldestTime = entry.failedAt;
        oldest = m;
      }
    }
    console.log(`[circuit-breaker] All models in cooldown, forcing oldest: ${oldest}`);
    _modelFailures.delete(oldest);
    return [oldest];
  }
  return available;
}

// 지금 쉬고 있는 모델: 이름과 남은 초만(오류 내용은 내보내지 않음). 체인 순서, 체인 밖 모델은 뒤에.
function geminiCoolingModels(now = Date.now()) {
  const out = [];
  for (const [model, entry] of _modelFailures) {
    const left = entry.failedAt + entry.cooldownMs - now;
    if (left > 0) out.push({ model, secondsLeft: Math.ceil(left / 1000) });
  }
  const rank = (m) => { const i = GEMINI_MODEL_CHAIN.indexOf(m); return i < 0 ? GEMINI_MODEL_CHAIN.length : i; };
  return out.sort((a, b) => rank(a.model) - rank(b.model));
}

// -- Request Validation & Rate Limiting --
const MAX_REQUEST_BODY_BYTES = 512_000; // 500KB max (일정 저장처럼 큰 본문을 받는 라우트만)
// 라우트별 본문 크기 한도
const BODY_LIMIT_SMALL = 32 * 1024;    // 항공·숙소·장소 검색·이동비
const BODY_LIMIT_DEFAULT = 64 * 1024;  // 그 밖의 일반 요청
const BODY_LIMIT_PLAN = 128 * 1024;    // 일정 생성·AI 채팅(선택 장소·대화 기록 포함)
const BODY_LIMIT_LARGE = MAX_REQUEST_BODY_BYTES; // 일정 저장
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const _rateLimitMap = new Map();

function checkRateLimit(ip, maxRequests = RATE_LIMIT_MAX_REQUESTS) {
  const now = Date.now();
  let entry = _rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    _rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > maxRequests) {
    return false;
  }
  return true;
}

// OAuth state map for CSRF protection: state → { createdAt, provider } (10분 유효, 요청한 브라우저의 쿠키와도 대조)
const _oauthStates = new Map();
setInterval(() => { const cutoff = Date.now() - 600000; for (const [k, v] of _oauthStates) { if ((v?.createdAt || 0) < cutoff) _oauthStates.delete(k); } }, 60000);

// ── 프록시 뒤의 클라이언트 IP·HTTPS 판단 ──
// X-Forwarded-For·X-Forwarded-Proto는 Render(환경변수 RENDER가 있음) 또는 TRUST_PROXY=1일 때만 믿는다.
// 클라이언트가 직접 보낸 값은 앞쪽에 남으므로, 우리 앞 프록시가 붙인 마지막 값을 클라이언트 IP로 쓴다.
// (프록시가 여러 단이라 마지막 값이 프록시 주소라면 TRUST_PROXY_HOPS=N 으로 뒤에서 N번째 값을 쓴다. 기본 1)
// 그 값이 Cloudflare 주소면(Render 앞단이 Cloudflare인 경우) 여러 방문자가 한 주소를 함께 쓰게 되므로,
// 한 칸 앞 값(Cloudflare가 붙인 방문자 주소)을 쓴다. 위조 값을 고르지 못하게 딱 한 칸만 건너뛴다.
const TRUST_PROXY = Boolean(envValue('RENDER')) || ['1', 'true'].includes(envValue('TRUST_PROXY').toLowerCase());
const TRUST_PROXY_HOPS = (() => {
  const n = Number(envValue('TRUST_PROXY_HOPS') || 1);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
})();

// Cloudflare 공개 IP 대역 (https://www.cloudflare.com/ips/ 기준)
const CLOUDFLARE_CIDRS = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'
];

function ipv4ToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || ''));
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((n) => n > 255)) return null;
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

function ipv6ToHextets(ip) {
  let s = String(ip || '').toLowerCase().split('%')[0];
  if (!s.includes(':')) return null;
  const tailV4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (tailV4) {
    const n = ipv4ToInt(tailV4[1]);
    if (n === null) return null;
    s = s.slice(0, -tailV4[1].length) + (n >>> 16).toString(16) + ':' + (n & 0xffff).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const all = [...head, ...Array(fill).fill('0'), ...tail];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => parseInt(h, 16));
}

const CLOUDFLARE_RANGES = CLOUDFLARE_CIDRS.map((cidr) => {
  const [addr, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const v4 = ipv4ToInt(addr);
  if (v4 !== null) return { v: 4, base: v4, bits };
  const v6 = ipv6ToHextets(addr);
  return v6 ? { v: 6, base: v6, bits } : null;
}).filter(Boolean);

// "1.2.3.4:5678", "[2001:db8::1]:443", "::ffff:1.2.3.4" 표기를 주소만 남긴다.
function bareIp(value) {
  let s = String(value || '').trim();
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracket) s = bracket[1];
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(s);
  if (v4port) s = v4port[1];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s);
  return mapped ? mapped[1] : s;
}

function isCloudflareIp(value) {
  const ip = bareIp(value);
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) {
    return CLOUDFLARE_RANGES.some((r) => r.v === 4 && ((v4 ^ r.base) >>> (32 - r.bits)) === 0);
  }
  const v6 = ipv6ToHextets(ip);
  if (!v6) return false;
  return CLOUDFLARE_RANGES.some((r) => {
    if (r.v !== 6) return false;
    let left = r.bits;
    for (let i = 0; i < 8 && left > 0; i += 1) {
      const take = Math.min(16, left);
      const mask = (0xffff << (16 - take)) & 0xffff;
      if ((v6[i] & mask) !== (r.base[i] & mask)) return false;
      left -= take;
    }
    return true;
  });
}

// 프록시 구성 확인용 로그: 첫 요청 1줄 + 처음 50개 요청의 항목 수 분포 요약 1줄 (IP 자체는 남기지 않음)
const PROXY_SAMPLE_TARGET = 50;
const _proxySample = { n: 0, counts: {}, cfLastHop: 0, cfHeader: 0, trueClientHeader: 0, done: false };
function noteProxyShape(req, entryCount, lastHopIsCloudflare) {
  if (_proxySample.done) return;
  _proxySample.n += 1;
  _proxySample.counts[entryCount] = (_proxySample.counts[entryCount] || 0) + 1;
  if (lastHopIsCloudflare) _proxySample.cfLastHop += 1;
  if (req.headers['cf-connecting-ip']) _proxySample.cfHeader += 1;
  if (req.headers['true-client-ip']) _proxySample.trueClientHeader += 1;
  if (_proxySample.n === 1) {
    console.log(`[proxy] 첫 요청: X-Forwarded-For 항목 ${entryCount}개${lastHopIsCloudflare ? '(마지막 값이 Cloudflare 주소라 한 칸 앞 값을 씀)' : ''}, TRUST_PROXY_HOPS=${TRUST_PROXY_HOPS}. 요청 ${PROXY_SAMPLE_TARGET}개를 모아 분포를 한 번 더 남깁니다.`);
  }
  if (_proxySample.n >= PROXY_SAMPLE_TARGET) {
    _proxySample.done = true;
    const dist = Object.entries(_proxySample.counts).map(([k, v]) => `${k}개:${v}건`).join(', ');
    console.log(`[proxy] 처음 ${_proxySample.n}개 요청의 X-Forwarded-For 항목 수 분포 {${dist}}, 마지막 값이 Cloudflare 주소 ${_proxySample.cfLastHop}건, `
      + `CF-Connecting-IP 헤더 ${_proxySample.cfHeader}건, True-Client-IP 헤더 ${_proxySample.trueClientHeader}건 (TRUST_PROXY_HOPS=${TRUST_PROXY_HOPS}). `
      + '대부분의 요청에서 항목 수가 같고 그 마지막 값이 우리 앞 프록시 주소일 때만 TRUST_PROXY_HOPS를 바꾸세요(잘못 올리면 방문자가 보낸 값이 기준 IP가 됩니다).');
  }
}

function clientIpOf(req) {
  const socketIp = req.socket?.remoteAddress || 'unknown';
  if (!TRUST_PROXY) return socketIp;
  const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    noteProxyShape(req, 0, false);
    return socketIp;
  }
  let idx = Math.max(0, parts.length - TRUST_PROXY_HOPS);
  const hopIsCloudflare = isCloudflareIp(parts[idx]);
  if (hopIsCloudflare && idx > 0) idx -= 1;
  noteProxyShape(req, parts.length, hopIsCloudflare);
  return bareIp(parts[idx]) || socketIp;
}

function isHttpsRequest(req) {
  if (req.socket?.encrypted) return true;
  if (!TRUST_PROXY) return false;
  return String(req.headers['x-forwarded-proto'] || '').split(',').some((s) => s.trim().toLowerCase() === 'https');
}

// "scheme://host[:port]" 형태로 정규화. http/https가 아니거나 해석할 수 없으면 ''.
function originOf(value) {
  try {
    const u = new URL(String(value || ''));
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.origin : '';
  } catch {
    return '';
  }
}

// 상태를 바꾸는 요청을 허용할 출처(정확히 일치해야 함):
// 설정한 공개 주소(PUBLIC_BASE_URL·OAUTH_BASE_URL), 요청이 들어온 자기 주소(Host), http://localhost:<PORT>
function allowedOriginsFor(req) {
  const set = new Set([
    originOf(envValue('PUBLIC_BASE_URL')),
    originOf(envValue('OAUTH_BASE_URL')),
    `http://localhost:${PORT}`
  ]);
  const host = String(req.headers.host || '').trim();
  if (host && /^[A-Za-z0-9.\-[\]:]+$/.test(host)) {
    set.add(originOf(`http://${host}`));
    set.add(originOf(`https://${host}`));
  }
  set.delete('');
  return set;
}

// CSRF: verify Origin/Referer for state-changing requests
function checkCsrf(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
  const originHeader = req.headers['origin'];
  const referer = req.headers['referer'];
  let origin = '';
  if (originHeader !== undefined) {
    origin = originOf(originHeader); // 'null'(샌드박스·file://)은 ''가 되어 거부된다
  } else if (referer) {
    origin = originOf(referer);
  } else {
    // Origin·Referer가 모두 없는 요청(서버 간 호출·CLI)은 브라우저 CSRF가 아니므로 통과시킨다.
    return true;
  }
  return Boolean(origin) && allowedOriginsFor(req).has(origin);
}

// Clean up rate limit map periodically
// (로그인 세션은 서명 쿠키라 서버에 지울 것이 없다. OAuth state는 위의 _oauthStates 정리가 맡는다.)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) _rateLimitMap.delete(ip);
  }
}, 120_000);

function validatePayload(payload, schema) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Invalid request body';
  for (const [key, rule] of Object.entries(schema)) {
    const val = payload[key];
    if (rule.required && (val === undefined || val === null || val === '')) return `Missing required field: ${key}`;
    if (val !== undefined && val !== null) {
      if (rule.type === 'string' && typeof val !== 'string') return `${key} must be a string`;
      if (rule.type === 'number' && (typeof val !== 'number' || !Number.isFinite(val))) return `${key} must be a number`;
      if (rule.enum && !rule.enum.includes(val)) return `${key} must be one of: ${rule.enum.join(', ')}`;
      if (rule.max !== undefined && typeof val === 'number' && val > rule.max) return `${key} exceeds maximum ${rule.max}`;
      if (rule.min !== undefined && typeof val === 'number' && val < rule.min) return `${key} must be at least ${rule.min}`;
      if (rule.maxLength && typeof val === 'string' && val.length > rule.maxLength) return `${key} exceeds max length ${rule.maxLength}`;
    }
  }
  return null;
}

const API_SCHEMAS = {
  'travel-plan': {
    city: { type: 'string', maxLength: 50 },
    theme: { type: 'string', enum: ['mixed', 'foodie', 'culture', 'shopping', 'nature'] },
    days: { type: 'number', min: 1, max: 10 },
    budget: { type: 'string', enum: ['low', 'mid', 'high'] },
    // 사용자가 쓴 요청 원문(화면은 500자까지 보낸다). mustVisit·excludedPlaces·foodWishes·_picks는 sanitizePlanIntent가 정리한다.
    request: { type: 'string', maxLength: 600 }
  },
  'ai-travel-chat': {
    message: { type: 'string', required: true, maxLength: 2000 },
    lang: { type: 'string', maxLength: 5 }
  },
  flights: {
    tripType: { type: 'string', enum: ['oneway', 'roundtrip', 'multicity'] },
    city: { type: 'string', maxLength: 50 },
    from: { type: 'string', maxLength: 40 },
    to: { type: 'string', maxLength: 40 },
    departDate: { type: 'string', maxLength: 30 },
    returnDate: { type: 'string', maxLength: 30 },
    preference: { type: 'string', maxLength: 20 }
  },
  stays: {
    city: { type: 'string', maxLength: 50 },
    checkIn: { type: 'string', maxLength: 30 },
    checkOut: { type: 'string', maxLength: 30 },
    guests: { type: 'number', min: 1, max: 20 },
    rooms: { type: 'number', min: 1, max: 10 },
    preference: { type: 'string', maxLength: 20 }
  },
  'travel-plan-save': {
    planKey: { type: 'string', maxLength: 80 },
    city: { type: 'string', maxLength: 50 },
    theme: { type: 'string', enum: ['mixed', 'foodie', 'culture', 'shopping', 'nature'] },
    budget: { type: 'string', enum: ['low', 'mid', 'high'] },
    startDate: { type: 'string', maxLength: 10 },
    days: { type: 'number', min: 1, max: 30 }
  }
};

const CHAT_PARSE_STRICT_AI = String(process.env.CHAT_PARSE_STRICT_AI || 'false').toLowerCase() === 'true';

// ── OAuth 로그인 설정 (값이 공백뿐이면 미설정으로 본다) ──
const NAVER_CLIENT_ID = envValue('NAVER_CLIENT_ID');
const NAVER_CLIENT_SECRET = envValue('NAVER_CLIENT_SECRET');
const KAKAO_REST_API_KEY = envValue('KAKAO_REST_API_KEY');
const KAKAO_CLIENT_SECRET = envValue('KAKAO_CLIENT_SECRET');
const GOOGLE_OAUTH_CLIENT_ID = envValue('GOOGLE_OAUTH_CLIENT_ID');
const GOOGLE_OAUTH_CLIENT_SECRET = envValue('GOOGLE_OAUTH_CLIENT_SECRET');
// 세션 서명 비밀값. 이 값 하나로 누구의 sid든 만들 수 있으므로 길고 추측할 수 없어야 한다:
// 32자 이상 + 서로 다른 글자 10개 이상(예: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))").
// 없거나 이 기준보다 약하면 그 값을 쓰지 않고, 추측할 수 없는 임의 값을 실행마다 새로 만든다(재시작하면 로그인이 풀림).
// 값을 바꾸면 모든 기기의 로그인이 풀린다(저장한 일정은 그대로: 사용자 id는 이 값과 관계없다).
const SESSION_SECRET_MIN_CHARS = 32;
const SESSION_SECRET_MIN_DISTINCT = 10;
function sessionSecretState(value) {
  const s = String(value || '');
  if (!s) return 'missing';
  return s.length >= SESSION_SECRET_MIN_CHARS && new Set(s).size >= SESSION_SECRET_MIN_DISTINCT ? 'ok' : 'weak';
}
const SESSION_SECRET_STATE = sessionSecretState(envValue('SESSION_SECRET'));
// health용: 쓸 수 있는 SESSION_SECRET이 설정돼 있는지(약한 값은 false) / 설정됐지만 약해서 버렸는지
const SESSION_SECRET_CONFIGURED = SESSION_SECRET_STATE === 'ok';
const SESSION_SECRET_WEAK = SESSION_SECRET_STATE === 'weak';
const SESSION_SECRET = (() => {
  if (SESSION_SECRET_STATE === 'ok') return envValue('SESSION_SECRET');
  if (SESSION_SECRET_STATE === 'weak') {
    warnOnce('session-secret-weak', `[session] SESSION_SECRET이 너무 짧거나 단순해서 쓰지 않습니다(${SESSION_SECRET_MIN_CHARS}자 이상, 서로 다른 글자 ${SESSION_SECRET_MIN_DISTINCT}개 이상 필요). 이번 실행에서만 쓰는 임의 비밀값을 만들었으니 재시작하면 로그인이 풀립니다. 임의 값으로 바꾸세요.`);
  } else {
    warnOnce('session-secret-missing', '[session] SESSION_SECRET이 없어 이번 실행에서만 쓰는 임의 비밀값을 만들었습니다. 재시작하면 로그인 세션이 풀리니 운영에서는 SESSION_SECRET을 설정하세요.');
  }
  return randomBytes(32).toString('hex');
})();
const OAUTH_BASE_URL = envValue('OAUTH_BASE_URL') || `http://localhost:${PORT}`;

// ── 로그인 허용 목록(혼자 쓰는 앱용, 선택) ──
// ALLOWED_LOGINS = 쉼표로 구분한 항목. 비워 두면 누구나 로그인할 수 있다.
//   u_<24자리 16진수>  로그인한 뒤 /api/auth/me 의 userId
//   google:<id> · kakao:<id> · naver:<id>  공급자 계정 id
//   이메일              공급자가 확인했다고 알려 준 이메일만(Google verified_email, Kakao is_email_verified). Naver 이메일은 보지 않는다.
// 목록 밖의 계정은 로그인 콜백에서 /?authError=not_allowed 로 돌려보내고 sid를 주지 않는다.
// 목록을 바꾸면 쿠키 서명 키도 바뀌어 이전에 받은 sid는 모두 로그아웃된다(목록 밖 계정의 예전 쿠키도 함께 끊김).
const ALLOWED_LOGINS = (() => {
  const raw = envValue('ALLOWED_LOGINS');
  const out = { active: Boolean(raw), uids: new Set(), ids: new Set(), emails: new Set(), key: '' };
  if (!raw) return out;
  let ignored = 0;
  for (const part of raw.split(',')) {
    const v = part.trim();
    if (!v) continue;
    const low = v.toLowerCase();
    if (/^u_[0-9a-f]{24}$/.test(low)) out.uids.add(low);
    else if (/^(google|kakao|naver):\S{1,200}$/i.test(v)) out.ids.add(`${low.slice(0, low.indexOf(':'))}:${v.slice(v.indexOf(':') + 1)}`);
    else if (/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(v)) out.emails.add(low);
    else ignored += 1;
  }
  out.key = [...out.uids, ...out.ids, ...[...out.emails].map((e) => `email:${e}`)].sort().join(',');
  if (ignored) warnOnce('allowed-logins-ignored', `[auth] ALLOWED_LOGINS에서 알아볼 수 없는 항목 ${ignored}개를 무시했습니다(u_…, 공급자:id, 이메일만).`);
  if (!out.key) warnOnce('allowed-logins-empty', '[auth] ALLOWED_LOGINS에 쓸 수 있는 항목이 없어 아무도 로그인할 수 없습니다.');
  return out;
})();

// who = { provider, providerId, uid, email, emailVerified }
function loginAllowed(who) {
  if (!ALLOWED_LOGINS.active) return true;
  if (ALLOWED_LOGINS.uids.has(who.uid)) return true;
  if (ALLOWED_LOGINS.ids.has(`${who.provider}:${who.providerId}`)) return true;
  const email = typeof who.email === 'string' ? who.email.trim().toLowerCase() : '';
  return Boolean(who.emailVerified === true && email && ALLOWED_LOGINS.emails.has(email));
}

// ── 로그인 세션: 서버에 저장하지 않는 서명 쿠키 ──
// sid = base64url(JSON {v:1, uid, p, n, img, iat, exp}) + '.' + base64url(HMAC-SHA256(SESSION_KEY, 앞부분))
// SESSION_KEY = HMAC-SHA256(scrypt(SESSION_SECRET, 'tabimaru-sid-v1'), 'allow:' + 허용 목록) — 시작할 때 한 번 계산한다.
//   scrypt는 쿠키 하나로 비밀값을 사전 대입해 보는 비용을 크게 늘리고, 허용 목록을 섞어 목록이 바뀌면 예전 sid가 끊긴다.
// 서버 메모리·디스크에 아무것도 두지 않으므로 Render가 재시작해도 같은 SESSION_SECRET이면 로그인이 유지된다.
// 예전 형식(sid=<uuid>.<16자리 서명>)은 검증을 통과하지 못해 로그아웃 상태로 본다.
const { createHmac, scryptSync } = require('crypto');
const SESSION_KEY = createHmac('sha256', scryptSync(SESSION_SECRET, 'tabimaru-sid-v1', 32, { N: 16384, r: 8, p: 1 }))
  .update(`allow:${ALLOWED_LOGINS.key}`).digest();
const SESSION_COOKIE = 'sid';
const SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30일(혼자 쓰는 앱). 쿠키 Max-Age와 payload exp가 같은 값을 쓴다.
const SESSION_COOKIE_MAX_CHARS = 3500;     // 이보다 긴 sid 값은 열어 보지 않고 버린다.
const SESSION_PROVIDERS = new Set(['naver', 'kakao', 'google']);
const SESSION_UID_RE = /^u_[0-9a-f]{24}$/;
const SESSION_NICK_MAX = 40;               // 닉네임은 글자(코드 포인트) 40개까지
const SESSION_IMG_MAX = 512;               // 프로필 사진 주소는 자르면 깨지므로, 512자를 넘거나 http(s)가 아니면 비운다

// OAuth 신원(공급자 + 공급자 id)에서 항상 같은 사용자 id를 만든다. SESSION_SECRET·users.json과 관계없다.
function stableUserId(provider, providerId) {
  return 'u_' + createHash('sha256').update(`${provider}:${providerId}`).digest('hex').slice(0, 24);
}

// 공급자 응답의 사용자 id(문자열·숫자). 없으면 로그인을 끝내지 않는다(모든 사람이 같은 id를 받지 않게).
function requireProviderId(provider, raw) {
  const id = (typeof raw === 'string' || typeof raw === 'number') ? String(raw).trim() : '';
  if (!id || id.length > 200) throw new Error(`${provider} profile has no usable id`);
  return id;
}

function sessionNickname(value) {
  return Array.from(String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, SESSION_NICK_MAX).join('');
}

function sessionProfileImage(value) {
  const s = String(value || '').trim();
  return s.length <= SESSION_IMG_MAX && /^https?:\/\/[^\s"'<>\\]+$/i.test(s) ? s : '';
}

function signSessionPart(part) {
  return createHmac('sha256', SESSION_KEY).update(part).digest('base64url');
}

function encodeSessionToken(payload) {
  const part = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${part}.${signSessionPart(part)}`;
}

// sid 값을 검증해 세션 객체를 돌려준다. 하나라도 이상하면 null(로그아웃 상태).
function verifySessionToken(token, nowMs = Date.now()) {
  if (typeof token !== 'string' || !token || token.length > SESSION_COOKIE_MAX_CHARS) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const part = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(part) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
  const expected = Buffer.from(signSessionPart(part), 'utf8');
  const given = Buffer.from(sig, 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let raw;
  try { raw = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  // 알려진 칸만 새 객체로 옮긴다(__proto__ 같은 키는 따라오지 않음).
  const v = raw.v, uid = raw.uid, p = raw.p, iat = raw.iat, exp = raw.exp;
  if (v !== 1) return null;
  if (typeof uid !== 'string' || !SESSION_UID_RE.test(uid)) return null;
  if (typeof p !== 'string' || !SESSION_PROVIDERS.has(p)) return null;
  if (!Number.isInteger(iat) || !Number.isInteger(exp) || iat > exp) return null;
  const nowSec = Math.floor(nowMs / 1000);
  // 만료됐거나, 정책(30일)보다 길게 남은 값은 받지 않는다(시계 차이 60초 허용).
  if (exp <= nowSec || exp > nowSec + SESSION_TTL_SEC + 60) return null;
  return {
    userId: uid,
    provider: p,
    nickname: typeof raw.n === 'string' ? sessionNickname(raw.n) : '',
    profileImage: typeof raw.img === 'string' ? sessionProfileImage(raw.img) : '',
    createdAt: iat * 1000
  };
}

// HTTPS로 들어온 요청(신뢰하는 프록시의 x-forwarded-proto 포함)에는 Secure를 붙인다.
function sessionCookieAttributes(req) {
  return `HttpOnly; Path=/; SameSite=Lax${req && isHttpsRequest(req) ? '; Secure' : ''}`;
}

// ── OAuth state: 서버 발급 기록 + 로그인을 시작한 브라우저의 짧은 쿠키에 함께 묶는다(로그인 CSRF 방지) ──
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_TTL_MS = 600_000;

function oauthStateCookieAttributes(req) {
  return `HttpOnly; SameSite=Lax; Path=/api/auth${req && isHttpsRequest(req) ? '; Secure' : ''}`;
}

function issueOauthState(req, provider) {
  const state = randomUUID();
  _oauthStates.set(state, { createdAt: Date.now(), provider });
  return { state, cookie: `${OAUTH_STATE_COOKIE}=${state}; ${oauthStateCookieAttributes(req)}; Max-Age=600` };
}

function clearOauthStateCookie(req) {
  return `${OAUTH_STATE_COOKIE}=; ${oauthStateCookieAttributes(req)}; Max-Age=0`;
}

function cookieValue(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return '';
}

// 콜백의 state가 ① 이 서버가 같은 제공자용으로 10분 안에 발급했고 ② 요청 브라우저의 oauth_state 쿠키와 같을 때만 true.
// 확인한 state는 결과와 상관없이 서버 기록에서 지운다(재사용 불가).
function consumeOauthState(req, provider, state) {
  const given = String(state || '');
  const entry = given ? _oauthStates.get(given) : null;
  if (entry) _oauthStates.delete(given);
  if (!entry || entry.provider !== provider || (Date.now() - entry.createdAt) > OAUTH_STATE_TTL_MS) return false;
  const a = Buffer.from(cookieValue(req, OAUTH_STATE_COOKIE));
  const b = Buffer.from(given);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

// userData = { userId, provider, nickname, profileImage } → { sid: 쿠키 값, cookie: Set-Cookie 한 줄 }
function createSession(userData, req) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    uid: String(userData.userId || ''),
    p: String(userData.provider || ''),
    n: sessionNickname(userData.nickname),
    img: sessionProfileImage(userData.profileImage),
    iat,
    exp: iat + SESSION_TTL_SEC
  };
  if (!SESSION_UID_RE.test(payload.uid) || !SESSION_PROVIDERS.has(payload.p)) throw new Error('invalid session user');
  let token = encodeSessionToken(payload);
  if (token.length > SESSION_COOKIE_MAX_CHARS) token = encodeSessionToken({ ...payload, img: '' });
  return { sid: token, cookie: `${SESSION_COOKIE}=${token}; ${sessionCookieAttributes(req)}; Max-Age=${SESSION_TTL_SEC}` };
}

// 요청의 sid 쿠키(이름이 정확히 sid인 것만)를 검증한다. → { userId, provider, nickname, profileImage, createdAt } | null
function parseSession(req) {
  return verifySessionToken(cookieValue(req, SESSION_COOKIE));
}

// 서버에 지울 세션이 없다(서명 쿠키). 로그아웃은 응답에서 sid 쿠키를 지우는 것으로 끝난다.
// 모든 기기에서 한꺼번에 로그아웃시키려면 SESSION_SECRET을 바꾼다.
function destroySession(req) { // eslint-disable-line no-unused-vars
}

function clearSessionCookie(req) {
  return `${SESSION_COOKIE}=; ${sessionCookieAttributes(req)}; Max-Age=0`;
}

// 허용 목록(ALLOWED_LOGINS) 밖의 계정: sid를 주지 않고 첫 화면으로(화면이 authError=not_allowed 안내를 띄움).
// 계정 id·이메일은 로그에 남기지 않는다. users.json에도 기록하지 않는다.
function rejectNotAllowedLogin(req, res, provider) {
  warnThrottled(`auth:not-allowed:${provider}`, `[auth] 허용 목록(ALLOWED_LOGINS)에 없는 ${provider} 계정의 로그인을 막았습니다.`);
  res.writeHead(302, { 'Set-Cookie': clearOauthStateCookie(req), Location: '/?authError=not_allowed' });
  return res.end();
}

// ── OAuth HTTPS 헬퍼 ──
async function oauthFetch(url, options = {}) {
  const resp = await fetch(url, options);
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OAuth fetch ${resp.status}: ${t.slice(0, 200)}`);
  }
  return resp.json();
}

// ── 파일 기반 사용자/일정 저장 (Supabase가 설정되지 않았을 때만: 로컬 개발용) ──
// TABIMARU_DATA_DIR(절대 경로)를 주면 그 폴더를, 없으면 <저장소>/data 를 쓴다(테스트는 임시 폴더를 준다).
const DATA_DIR = (() => {
  const configured = envValue('TABIMARU_DATA_DIR');
  if (!configured) return path.join(__dirname, 'data');
  if (!path.isAbsolute(configured)) {
    warnOnce('data-dir-relative', '[data] TABIMARU_DATA_DIR가 절대 경로가 아니라 저장소 폴더 기준으로 해석합니다.');
  }
  return path.resolve(__dirname, configured);
})();
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (err) {
  warnOnce('data-dir-create', `[data] 데이터 폴더를 만들지 못했습니다: ${err?.code || err?.message || err}`);
}

function readJsonFile(name) {
  const fp = path.join(DATA_DIR, name);
  if (!fs.existsSync(fp)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeJsonFile(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2), 'utf8');
}

// 로컬 기록용 users.json(공급자별 프로필). 사용자 id의 출처가 아니며(id = stableUserId), 쓰지 못해도 로그인은 계속한다.
// 예전 기록(id = 임의 UUID)은 그대로 두고 uid 칸만 붙여, 파일 저장소의 예전 일정을 같은 사람이 계속 볼 수 있게 한다.
function findOrCreateUser(provider, providerId, uid, profile) {
  const now = new Date().toISOString();
  try {
    const users = readJsonFile('users.json');
    let user = users.find((u) => u && u.provider === provider && u.providerId === providerId);
    if (!user) {
      user = { id: uid, uid, provider, providerId, ...profile, createdAt: now };
      users.push(user);
    } else {
      Object.assign(user, profile, { uid, lastLoginAt: now });
    }
    writeJsonFile('users.json', users);
    return { ...user, uid };
  } catch (err) {
    warnThrottled('users-file', `[data] users.json을 쓰지 못했습니다(로그인은 계속): ${err?.code || err?.message || err}`);
    return { id: uid, uid, provider, providerId, ...profile };
  }
}

// 파일 저장소에서 이 사용자의 일정으로 볼 userId 목록: 지금 id + users.json에 남은 예전 id(같은 OAuth 신원)
function fileStoreOwnerIds(uid) {
  const ids = new Set([uid]);
  for (const u of readJsonFile('users.json')) {
    if (u && u.uid === uid && typeof u.id === 'string' && u.id) ids.add(u.id);
  }
  return ids;
}

const AI_REQUEST_TIMEOUT_MS = Math.max(4000, Number(process.env.AI_REQUEST_TIMEOUT_MS || 15000));
// Gemini 한 번 생성(채팅 해석·일정 하나)에 모델 체인 전체가 쓸 수 있는 시간(기본 40초, 최소 4초).
// 호출 하나는 AI_REQUEST_TIMEOUT_MS(일정은 30초)와 남은 시간 중 짧은 쪽까지만 기다리고, 시간이 다 되면 다음 모델을 시도하지 않는다.
const GEMINI_TOTAL_BUDGET_MS = Math.max(4000, Number(envValue('GEMINI_TOTAL_BUDGET_MS')) || 40_000);
// 남은 시간이 이보다 짧으면 다음 모델을 시작하지 않는다(가장 빠른 모델도 약 3초 걸림).
const GEMINI_MIN_ATTEMPT_MS = 2500;

// -- fetchWithRetry: exponential backoff for external API calls --
async function fetchWithRetry(url, options = {}, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok || resp.status < 500) return resp;
      if (attempt < maxRetries && [502, 503, 504].includes(resp.status)) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
        console.log('[fetchWithRetry] status=' + resp.status + ' attempt=' + (attempt+1) + ' retrying in ' + delay + 'ms');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
        console.log('[fetchWithRetry] error attempt=' + (attempt+1) + ': ' + err.message);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError || new Error('fetchWithRetry exhausted retries');
}


// AI 일정 프롬프트 계약. <period> 토큰은 화면 형식이라 모든 언어에서 한국어로 둔다(오전/오후/종일/점심/저녁).
// 서버 후처리(postProcessItinerary)가 같은 규칙을 다시 강제한다.
const AI_SYSTEM_MESSAGE = [
  'You are a travel itinerary planner for Japan.',
  'Return only JSON that matches the provided schema.',
  'Use the provided picks and foods; avoid inventing places not in input (the only exception: every mustVisit place, even when it is not in picks).',
  'Copy every place and food name exactly as written in picks, foods and mustVisit, character for character, even when it is in Japanese or another script than the output language; never translate, transliterate, shorten or extend a name.',
  'Every 점심/저녁 block is a name from foods (with dayPlan, only foods whose city is that day\'s city); use each of those foods once before repeating any of them, and never write a placeholder such as "자유 식사" or "free meal".',
  'Respect flight timing if provided (arrival and departure).',
  'If stay details are supplied, mention the picked property and honor its check-in/out window when planning the first and last days.',
  'Schedule blocks in local time. Every block is ONE string in exactly this format: "<period>(HH:MM-HH:MM): <place name> (<area>)".',
  '<period> is one of these Korean words, kept in Korean in every language:',
  '오전 = sightseeing that starts before 12:00;',
  '오후 = sightseeing that starts at 12:00 or later; evening sightseeing such as a night view is also 오후 with its real time (e.g. "오후(19:00-20:30): 우메다 스카이 빌딩 (우메다)");',
  '종일 = a whole-day place, only for picks with allDay:true (e.g. "종일(09:00-18:00): 유니버셜 스튜디오 재팬 (오사카)"); a day with a 종일 block has that one sightseeing block plus meals only;',
  '점심 = a meal from foods, between 11:30 and 14:00; 저녁 = a meal from foods, starting 17:30 or later.',
  '저녁/점심 are ONLY for meals; never put a meal in 오전/오후, and never put sightseeing in 저녁/점심.',
  'Each day: 1 to N sightseeing blocks (N = maxPlacesPerDay or 4) plus up to 2 meals from foods; include one 저녁 per day when foods are available. Order blocks by time and do not let them overlap.',
  'Examples: "오전(09:00-11:00): 센소지 (아사쿠사)", "점심(12:00-13:00): 아후리 라멘 (에비스)", "오후(13:30-15:30): 시부야 스카이 (시부야)", "저녁(18:30-20:00): 토리키조쿠 (신주쿠)", "종일(09:00-18:00): 도쿄 디즈니랜드 (지바 우라야스)".',
  'A rest day uses a single free-time block such as "오후(13:00-16:00): 자유 일정 (숙소 주변 산책)".',
  'Use each pick at most once in the whole trip: do not schedule a place again on another day until every pick has been used.',
  'If the picks run out, use a free-time block (for example "오후(13:00-16:00): 자유 일정 (<area> 주변 산책)", written in the output language) instead of repeating a place or inventing one.'
].join(' ');

const CITY_DATA = {
  tokyo: {
    label: '도쿄', nameJa: '東京',
    airport: 'NRT',
    areas: ['시부야', '신주쿠', '아사쿠사', '긴자'],
    highlights: [
      { name: '센소지', area: '아사쿠사', category: '문화', stayMin: 90, bestTime: '09:00-11:00', crowdScore: 3 },
      { name: '시부야 스카이', area: '시부야', category: '전망', stayMin: 80, bestTime: '17:00-19:00', crowdScore: 4 },
      { name: '메이지 신궁', area: '하라주쿠', category: '자연/문화', stayMin: 100, bestTime: '08:30-10:30', crowdScore: 2 },
      { name: '츠키지 외시장', area: '츠키지', category: '미식', stayMin: 120, bestTime: '10:00-12:00', crowdScore: 4 },
      { name: '긴자 식스', area: '긴자', category: '쇼핑', stayMin: 110, bestTime: '14:00-16:00', crowdScore: 3 },
      { name: '오다이바 해변공원', area: '오다이바', category: '산책', stayMin: 100, bestTime: '16:00-18:00', crowdScore: 2 }
    ],
    foods: [
      { name: '스시다이', area: '츠키지', genre: '스시', priceLevel: 4, score: 4.2 },
      { name: '아후리 라멘', area: '에비스', genre: '라멘', priceLevel: 2, score: 3.8 },
      { name: '토리키조쿠', area: '신주쿠', genre: '이자카야', priceLevel: 1, score: 3.6 }
    ]
  },
  osaka: {
    label: '오사카', nameJa: '大阪',
    airport: 'KIX',
    areas: ['난바', '우메다', '신사이바시', '덴노지'],
    highlights: [
      { name: '오사카성', area: '주오구', category: '문화', stayMin: 120, bestTime: '09:00-11:30', crowdScore: 3 },
      { name: '도톤보리', area: '난바', category: '미식/야경', stayMin: 150, bestTime: '18:00-21:00', crowdScore: 5 },
      { name: '우메다 스카이 빌딩', area: '우메다', category: '전망', stayMin: 80, bestTime: '17:30-19:00', crowdScore: 3 },
      { name: '신세카이', area: '에비스초', category: '로컬', stayMin: 90, bestTime: '15:00-18:00', crowdScore: 3 }
    ],
    foods: [
      { name: '쿠시카츠 다루마', area: '신세카이', genre: '쿠시카츠', priceLevel: 2, score: 3.7 },
      { name: '타코야키 주하치반', area: '난바', genre: '타코야키', priceLevel: 1, score: 3.8 },
      { name: '후쿠타로 오코노미야키', area: '난바', genre: '오코노미야키', priceLevel: 2, score: 4.0 }
    ]
  },
  kyoto: {
    label: '교토', nameJa: '京都',
    airport: 'KIX',
    areas: ['기온', '아라시야마', '가와라마치'],
    highlights: [
      { name: '후시미 이나리', area: '후시미', category: '문화/트레킹', stayMin: 140, bestTime: '07:30-10:30', crowdScore: 4 },
      { name: '기요미즈데라', area: '히가시야마', category: '문화', stayMin: 110, bestTime: '09:00-11:00', crowdScore: 4 },
      { name: '아라시야마 대나무숲', area: '아라시야마', category: '자연', stayMin: 100, bestTime: '08:00-09:30', crowdScore: 3 }
    ],
    foods: [
      { name: '오멘 긴카쿠지', area: '사쿄구', genre: '우동', priceLevel: 2, score: 3.9 },
      { name: '기온 우오신', area: '기온', genre: '가이세키', priceLevel: 4, score: 4.1 }
    ]
  }
};

const JAPAN_CITY_PROFILES = {
  sapporo: { label: '삿포로', nameJa: '札幌', airport: 'CTS', areas: ['오도리', '스스키노', '조잔케이'], sightA: '오도리 공원', sightB: '삿포로 TV 타워', sightC: '니조시장', sightBMeta: { area: '오도리' }, sightCMeta: { area: '오도리', bestTime: '07:30-10:00' }, foodA: '스프카레 GARAKU', foodB: '스미레 라멘', genreA: '카레', genreB: '라멘' },
  hakodate: { label: '하코다테', airport: 'HKD', areas: ['모토마치', '고료카쿠', '베이 에어리어'], sightA: '하코다테 야경', sightB: '고료카쿠 공원', sightC: '아침시장', sightAMeta: { bestTime: '20:00-21:30' }, sightCMeta: { area: '하코다테역', bestTime: '07:00-09:30' }, foodA: '하코다테 카이센동', foodB: '시오라멘', genreA: '해산물', genreB: '라멘' },
  asahikawa: { label: '아사히카와', airport: 'AKJ', areas: ['역전', '아사히야마', '평화거리'], sightA: '아사히야마 동물원', sightB: '헤이와도리 쇼핑공원', sightC: '우에노팜', sightAMeta: { area: '아사히야마' }, sightBMeta: { area: '평화거리' }, sightCMeta: { area: '나가야마' }, foodA: '아사히카와 라멘', foodB: '징기스칸', genreA: '라멘', genreB: '양고기' },
  aomori: { label: '아오모리', airport: 'AOJ', areas: ['신마치', '아사무시', '아오모리역'], sightA: '네부타 박물관', sightB: '아오모리 베이브리지', sightC: '아오모리 현립미술관', sightAMeta: { area: '아오모리역' }, sightBMeta: { area: '아오모리역' }, sightCMeta: { area: '산나이마루야마' }, foodA: '아오모리 사과 디저트', foodB: '해산물 시장', genreA: '디저트', genreB: '해산물' },
  akita: { label: '아키타', airport: 'AXT', areas: ['센슈공원', '오가', '아키타역'], sightA: '센슈공원', sightB: '오가 반도', sightC: '아키타 현립 미술관', foodA: '기리탄포', foodB: '이나니와 우동', genreA: '향토요리', genreB: '우동' },
  hanamaki: { label: '하나마키', airport: 'HNA', areas: ['온천지구', '역전', '이와테'], sightA: '하나마키 온천', sightB: '미야자와 겐지 기념관', sightC: null, foodA: '완코소바', foodB: '모리오카 냉면', genreA: '소바', genreB: '면요리' },
  yamagata: { label: '야마가타', airport: 'GAJ', areas: ['자오', '야마가타역', '카조공원'], sightA: '자오 온천', sightB: '카조 공원', sightC: '리사쿠지', sightCMeta: { area: '야마데라' }, foodA: '이모니', foodB: '야마가타 소바', genreA: '향토요리', genreB: '소바' },
  sendai: { label: '센다이', nameJa: '仙台', airport: 'SDJ', areas: ['아오바구', '고쿠분초', '마쓰시마'], sightA: '즈이호덴', sightB: '센다이성 유적', sightC: '마쓰시마', sightBMeta: { area: '아오바구' }, foodA: '규탄 전문점', foodB: '즈다모치 카페', genreA: '규탄', genreB: '디저트' },
  fukushima: { label: '후쿠시마', airport: 'FKS', areas: ['아이즈와카마츠', '코리야마', '후쿠시마역'], sightA: '쓰루가성', sightB: '고시키누마', sightC: '오우치주쿠', sightAMeta: { area: '아이즈와카마츠' }, sightBMeta: { area: '우라반다이' }, sightCMeta: { area: '시모고', dayTrip: true, bestTime: '09:00-18:00', stayMin: 480 }, foodA: '키타카타 라멘', foodB: '소스카츠동', genreA: '라멘', genreB: '돈카츠' },
  niigata: { label: '니가타', airport: 'KIJ', areas: ['반다이', '후루마치', '사도'], sightA: '피아반다이 시장', sightB: '니가타 수족관', sightC: '사도섬', sightCMeta: { dayTrip: true, bestTime: '09:00-18:00', stayMin: 480 }, foodA: '니가타 돈부리', foodB: '니혼슈 바', genreA: '해산물', genreB: '주점' },
  kanazawa: { label: '가나자와', nameJa: '金沢', airport: 'KMQ', areas: ['겐로쿠엔', '히가시차야', '오미초'], sightA: '겐로쿠엔', sightB: '오미초 시장', sightC: '히가시차야 거리', sightBMeta: { area: '오미초' }, sightCMeta: { area: '히가시차야' }, foodA: '카나자와 스시', foodB: '노도구로 구이', genreA: '스시', genreB: '일식' },
  toyama: { label: '도야마', airport: 'TOY', areas: ['도야마역', '우나즈키', '알펜루트'], sightA: '알펜루트', sightB: '도야마성 공원', sightC: '글래스 미술관', sightAMeta: { area: '다테야마', fullDay: true, bestTime: '09:00-18:00', stayMin: 480 }, sightBMeta: { area: '도야마역' }, sightCMeta: { area: '도야마역' }, foodA: '시로에비', foodB: '부리 샤브', genreA: '해산물', genreB: '일식' },
  shizuoka: { label: '시즈오카', airport: 'FSZ', areas: ['시미즈', '시즈오카역', '니혼다이라'], sightA: '미호노마쓰바라', sightB: '쿠노잔 도쇼구', sightC: null, foodA: '사쿠라에비', foodB: '우나기 덮밥', genreA: '해산물', genreB: '일식' },
  nagoya: { label: '나고야', nameJa: '名古屋', airport: 'NGO', areas: ['사카에', '나고야역', '오스'], sightA: '나고야성', sightB: '오아시스21', sightC: '도요타 산업기술 기념관', sightBMeta: { area: '사카에' }, sightCMeta: { area: '나고야역' }, foodA: '미소카츠', foodB: '히츠마부시', genreA: '돈카츠', genreB: '장어덮밥' },
  okayama: { label: '오카야마', airport: 'OKJ', areas: ['오카야마역', '고라쿠엔', '쿠라시키'], sightA: '고라쿠엔', sightB: '오카야마성', sightC: '쿠라시키 미관지구', sightAMeta: { area: '고라쿠엔' }, foodA: '바라즈시', foodB: '데미카츠동', genreA: '향토요리', genreB: '돈카츠' },
  hiroshima: { label: '히로시마', nameJa: '広島', airport: 'HIJ', areas: ['나카구', '미야지마', '히로시마역'], sightA: '평화기념공원', sightB: '이쓰쿠시마 신사', sightC: '히로시마성', sightCMeta: { area: '나카구' }, foodA: '히로시마 오코노미야키', foodB: '굴 요리', genreA: '오코노미야키', genreB: '해산물' },
  yonago: { label: '요나고', airport: 'YGJ', areas: ['사카이미나토', '다이센', '요나고역'], sightA: '미즈키 시게루 로드', sightB: '다이센', sightC: '카이케 온천', foodA: '게 요리', foodB: '회덮밥', genreA: '해산물', genreB: '일식' },
  izumo: { label: '이즈모', airport: 'IZO', areas: ['이즈모타이샤', '신지호', '역전'], sightA: '이즈모 타이샤', sightB: '이나사 해변', sightC: '신지호 석양', sightBMeta: { area: '이즈모타이샤' }, sightCMeta: { area: '신지호', bestTime: '17:00-18:00' }, foodA: '이즈모 소바', foodB: '젠자이', genreA: '소바', genreB: '디저트' },
  takamatsu: { label: '다카마쓰', airport: 'TAK', areas: ['리쓰린', '선포트', '야시마'], sightA: '리쓰린 공원', sightB: '타카마츠성 유적', sightC: '야시마 전망대', foodA: '사누키 우동', foodB: '올리브 소고기', genreA: '우동', genreB: '일식' },
  matsuyama: { label: '마쓰야마', airport: 'MYJ', areas: ['도고온천', '마쓰야마성', '오카이도'], sightA: '도고온천', sightB: '마쓰야마성', sightC: '보찬 열차', foodA: '도미밥', foodB: '쟈코텐', genreA: '일식', genreB: '향토요리' },
  kochi: { label: '고치', airport: 'KCZ', areas: ['고치성', '히로메시장', '카츠라하마'], sightA: '고치성', sightB: '카츠라하마', sightC: '히로메 시장', sightBMeta: { area: '카츠라하마' }, sightCMeta: { area: '히로메시장' }, foodA: '가츠오 타타키', foodB: '사와치 요리', genreA: '해산물', genreB: '향토요리' },
  tokushima: { label: '도쿠시마', airport: 'TKS', areas: ['아와오도리', '비잔', '나루토'], sightA: '아와오도리 회관', sightB: '나루토 소용돌이', sightC: '비잔 로프웨이', sightBMeta: { area: '나루토' }, sightCMeta: { area: '비잔' }, foodA: '도쿠시마 라멘', foodB: '아와규', genreA: '라멘', genreB: '일식' },
  fukuoka: { label: '후쿠오카', nameJa: '福岡', airport: 'FUK', areas: ['하카타', '텐진', '모모치'], sightA: '오호리 공원', sightB: '캐널시티 하카타', sightC: '후쿠오카 타워', sightAMeta: { area: '텐진' }, sightBMeta: { area: '하카타', category: '쇼핑' }, foodA: '하카타 라멘', foodB: '모츠나베', genreA: '라멘', genreB: '전골' },
  nagasaki: { label: '나가사키', airport: 'NGS', areas: ['데지마', '차이나타운', '이나사야마'], sightA: '글로버가든', sightB: '평화공원', sightC: '이나사야마 전망대', sightBMeta: { area: '우라카미' }, sightCMeta: { bestTime: '20:00-21:30' }, foodA: '짬뽕', foodB: '카스테라', genreA: '면요리', genreB: '디저트' },
  kumamoto: { label: '구마모토', airport: 'KMJ', areas: ['구마모토성', '스이젠지', '아소'], sightA: '구마모토성', sightB: '스이젠지 공원', sightC: '아소 화산', sightCMeta: { dayTrip: true, bestTime: '09:00-18:00', stayMin: 480 }, foodA: '바사시', foodB: '구마모토 라멘', genreA: '일식', genreB: '라멘' },
  oita: { label: '오이타', airport: 'OIT', areas: ['벳푸', '유후인', '오이타역'], sightA: '벳푸 지옥온천', sightB: null, sightC: '타카사키야마', foodA: '도리텐', foodB: '벳푸 냉면', foodAArea: '오이타역', foodBArea: '벳푸', genreA: '향토요리', genreB: '면요리' },
  miyazaki: { label: '미야자키', airport: 'KMI', areas: ['아오시마', '니치난', '시내'], sightA: '아오시마 신사', sightB: '우도신궁', sightC: '선멧세 니치난', sightCMeta: { area: '니치난' }, foodA: '치킨난반', foodB: '미야자키 소고기', genreA: '일식', genreB: '육류' },
  kagoshima: { label: '가고시마', airport: 'KOJ', areas: ['사쿠라지마', '덴몬칸', '이부스키'], sightA: '사쿠라지마', sightB: '센간엔', sightC: '이부스키 모래찜', sightBMeta: { area: '이소' }, foodA: '쿠로부타 돈카츠', foodB: '사츠마아게', genreA: '돈카츠', genreB: '향토요리' },
  okinawa: { label: '오키나와', nameJa: '沖縄', airport: 'OKA', areas: ['나하', '차탄', '온나'], sightA: '국제거리', sightB: '츄라우미 수족관', sightC: '아메리칸 빌리지', sightBMeta: { area: '모토부', dayTrip: true, bestTime: '09:00-18:00', stayMin: 480 }, sightCMeta: { area: '차탄' }, foodA: '오키나와 소바', foodB: '고야참푸루', genreA: '면요리', genreB: '향토요리' },
  obihiro: { label: '오비히로', airport: 'OBO', areas: ['반에이', '도카치', '역전'], sightA: '반에이 경마', sightB: '도카치가와 온천', sightC: '마나베 정원', foodA: '부타동', foodB: '유제품 디저트', genreA: '덮밥', genreB: '디저트' }
};

const JAPAN_CITY_PROFILES_EXTRA = {
  wakkanai: { label: '왓카나이', airport: 'WKJ', areas: ['노샷푸', '왓카나이역', '소야곶'], sightA: '소야곶', sightB: '노샷푸 곶', sightC: '왓카나이 공원', sightAMeta: { area: '소야곶' }, sightBMeta: { area: '노샷푸' }, sightCMeta: { area: '왓카나이역' }, foodA: '해산물 덮밥', foodB: '홋카이도 우유 디저트', genreA: '해산물', genreB: '디저트' },
  rishiri: { label: '리시리', airport: 'RIS', areas: ['오시도마리', '리시리후지', '페시미사키'], sightA: '리시리산 전망', sightB: '페시미사키 전망대', sightC: null, sightAMeta: { area: '리시리후지' }, sightBMeta: { area: '오시도마리' }, foodA: '리시리 다시 라멘', foodB: '성게 요리', genreA: '라멘', genreB: '해산물' },
  memanbetsu: { label: '메만베쓰', airport: 'MMB', areas: ['아바시리', '비호로', '시레토코'], sightA: '아바시리 유빙관', sightB: '비호로 고개', sightC: '시레토코 자연길', sightCMeta: { area: '시레토코', dayTrip: true, bestTime: '09:00-18:00', stayMin: 480 }, foodA: '게 요리', foodB: '현지 버거', genreA: '해산물', genreB: '패스트푸드' },
  kushiro: { label: '구시로', airport: 'KUH', areas: ['누사마이', '와쇼시장', '습원'], sightA: '구시로 습원', sightB: '누사마이 다리', sightC: '와쇼 시장', sightAMeta: { area: '습원' }, sightBMeta: { area: '누사마이' }, sightCMeta: { area: '와쇼시장', bestTime: '08:00-10:00' }, foodA: '카이센동', foodB: '로바타야키', genreA: '해산물', genreB: '구이' },
  nakashibetsu: { label: '나카시베츠', airport: 'SHB', areas: ['네무로', '구시로', '중심가'], sightA: '노츠케 반도', sightB: null, sightC: null, foodA: '치즈 플래터', foodB: '우유 아이스크림', genreA: '유제품', genreB: '디저트' },
  okadama: { label: '삿포로 오카다마', airport: 'OKD', areas: ['히가시구', '중앙구', '오도리'], sightA: '모에레누마 공원', sightB: '삿포로 맥주박물관', sightC: '오도리 야경', sightBMeta: { area: '히가시구' }, sightCMeta: { bestTime: '20:00-21:30' }, foodA: '수프카레', foodB: '징기스칸', genreA: '카레', genreB: '육류' },
  misawa: { label: '미사와', airport: 'MSJ', areas: ['미사와', '도와다', '아오모리'], sightA: '오이라세 계류', sightB: '도와다 호수', sightC: '미사와 항공박물관', sightAMeta: { area: '도와다' }, sightBMeta: { area: '도와다', dayTrip: true, bestTime: '09:00-18:00', stayMin: 480 }, sightCMeta: { area: '미사와' }, foodA: '사과 디저트', foodB: '히메마스 요리', genreA: '디저트', genreB: '향토요리' },
  odate: { label: '오다테', airport: 'ONJ', areas: ['오다테', '카즈노', '아키타'], sightA: '아키타견 박물관', sightB: '하치만타이', sightC: '오유 스톤서클', sightCMeta: { area: '카즈노' }, foodA: '기리탄포', foodB: '히나이 토리', genreA: '향토요리', genreB: '닭요리' },
  shonai: { label: '쇼나이', airport: 'SYO', areas: ['쓰루오카', '사카타', '데와산잔'], sightA: '데와산잔', sightB: '가모 수족관', sightC: '사카타 항구', sightAMeta: { area: '데와산잔' }, sightBMeta: { area: '쓰루오카' }, sightCMeta: { area: '사카타' }, foodA: '야마가타 소바', foodB: '쇼진요리', genreA: '소바', genreB: '향토요리' },
  ibaraki: { label: '이바라키', airport: 'IBR', areas: ['미토', '오아라이', '히타치'], sightA: '가이라쿠엔', sightB: '오아라이 해변', sightC: '히타치 해변공원', sightCMeta: { area: '히타치나카' }, foodA: '아귀 전골', foodB: '낫토 정식', genreA: '향토요리', genreB: '향토요리' },
  matsumoto: { label: '마쓰모토', airport: 'MMJ', areas: ['마쓰모토성', '나와테', '아즈미노'], sightA: '마쓰모토성', sightB: '나카마치 거리', sightC: '가미코치', sightCMeta: { area: '가미코치', dayTrip: true, bestTime: '09:00-18:00', stayMin: 480 }, foodA: '신슈 소바', foodB: '바사시', genreA: '소바', genreB: '육류' },
  nanki_shirahama: { label: '난키 시라하마', airport: 'SHM', areas: ['시라하마', '엔게츠섬', '어드벤처월드'], sightA: '시라라하마 해변', sightB: '엔게츠섬', sightC: '어드벤처월드', foodA: '해산물 정식', foodB: '온천 달걀 요리', genreA: '해산물', genreB: '일식' },
  kobe: { label: '고베', nameJa: '神戸', airport: 'UKB', areas: ['산노미야', '모자이크', '기타노'], sightA: '고베 하버랜드', sightB: '기타노 이진칸', sightC: '누노비키 허브원', sightAMeta: { area: '하버랜드' }, sightBMeta: { area: '기타노' }, sightCMeta: { area: '신고베' }, foodA: '고베규 스테이크', foodB: '아카시야키', genreA: '육류', genreB: '분식' },
  tajima: { label: '다지마', airport: 'TJH', areas: ['도요오카', '기노사키', '이즈시'], sightA: '기노사키 온천', sightB: '고노토리 공원', sightC: '겐부도', sightAMeta: { area: '기노사키' }, sightBMeta: { area: '도요오카' }, sightCMeta: { area: '도요오카' }, foodA: '카니 요리', foodB: '다지마규 구이', genreA: '해산물', genreB: '육류' },
  tottori: { label: '돗토리', airport: 'TTJ', areas: ['돗토리 사구', '쿠라요시', '돗토리역'], sightA: '돗토리 사구', sightB: '우라도메 해안', sightC: '모래 미술관', sightBMeta: { area: '이와미' }, sightCMeta: { area: '돗토리 사구' }, foodA: '게 요리', foodB: '배 디저트', genreA: '해산물', genreB: '디저트' },
  iwakuni: { label: '이와쿠니', airport: 'IWK', areas: ['긴타이쿄', '이와쿠니성', '역전'], sightA: '긴타이교', sightB: '이와쿠니성', sightC: '시라헤비 신사', foodA: '이와쿠니 스시', foodB: '연근 요리', genreA: '스시', genreB: '향토요리' },
  yamaguchi_ube: { label: '야마구치 우베', airport: 'UBJ', areas: ['우베', '야마구치', '아키요시다이'], sightA: '아키요시 동굴', sightB: '루리코지', sightC: '도키와 공원', sightAMeta: { area: '아키요시다이' }, sightCMeta: { area: '우베' }, foodA: '복어 요리', foodB: '가와라소바', genreA: '해산물', genreB: '면요리' },
  kitakyushu: { label: '기타큐슈', airport: 'KKJ', areas: ['고쿠라', '모지코', '야하타'], sightA: '모지코 레트로', sightB: '고쿠라성', sightC: '사라쿠라산 야경', sightAMeta: { area: '모지코' }, sightBMeta: { area: '고쿠라' }, sightCMeta: { bestTime: '20:00-21:30' }, foodA: '야키카레', foodB: '우동', genreA: '카레', genreB: '우동' },
  saga: { label: '사가', airport: 'HSG', areas: ['사가역', '카라쓰', '우레시노'], sightA: '요시노가리 유적', sightB: '카라쓰성', sightC: '우레시노 온천', foodA: '사가규', foodB: '온천 두부', genreA: '육류', genreB: '두부요리' },
  amami: { label: '아마미', airport: 'ASJ', areas: ['아마미시', '해변', '숲길'], sightA: null, sightB: null, sightC: '아야마루 곶', sightCMeta: { area: '해변' }, foodA: '케이한', foodB: '흑설탕 디저트', genreA: '향토요리', genreB: '디저트' },
  yakushima: { label: '야쿠시마', airport: 'KUM', areas: ['미야노우라', '시라타니', '아나보'], sightA: '시라타니 운수협곡', sightB: '조몬스기 트레일', sightC: '오코 폭포', sightAMeta: { area: '시라타니' }, sightBMeta: { area: '아나보', fullDay: true, bestTime: '09:00-18:00', stayMin: 480 }, sightCMeta: { area: '구리오' }, foodA: '토비우오 요리', foodB: '사쓰마아게', genreA: '해산물', genreB: '향토요리' },
  tanegashima: { label: '다네가시마', airport: 'TNE', areas: ['니시노오모테', '우주센터', '해변'], sightA: '다네가시마 우주센터', sightB: null, sightC: null, sightAMeta: { area: '우주센터' }, foodA: '현지 해산물 덮밥', foodB: '고구마 디저트', genreA: '해산물', genreB: '디저트' },
  miyako: { label: '미야코지마', airport: 'MMY', areas: ['히라라', '이케마', '쿠리마'], sightA: '이케마 대교', sightB: '요나하마에하마 해변', sightC: '히가시헨나자키', sightAMeta: { area: '이케마' }, sightBMeta: { area: '쿠리마' }, sightCMeta: { area: '구스쿠베' }, foodA: '미야코소바', foodB: '해산물 BBQ', genreA: '면요리', genreB: '해산물' },
  ishigaki: { label: '이시가키', airport: 'ISG', areas: ['이시가키시', '카비라', '항구'], sightA: '카비라만', sightB: '이시가키 석회동굴', sightC: null, sightAMeta: { area: '카비라' }, sightBMeta: { area: '이시가키시' }, foodA: '야에야마 소바', foodB: '이시가키규 스테이크', genreA: '면요리', genreB: '육류' },
  shimojishima: { label: '시모지시마', airport: 'SHI', areas: ['이라부', '시모지', '비치'], sightA: '17END 비치', sightB: '이라부 대교', sightC: null, sightAMeta: { area: '시모지' }, sightBMeta: { area: '이라부' }, foodA: '섬 생선 요리', foodB: '트로피컬 디저트', genreA: '해산물', genreB: '디저트' },
  kumejima: { label: '구메지마', airport: 'UEO', areas: ['구메지마시', '해변', '산호초'], sightA: '하테노하마', sightB: '우에구스쿠성터', sightC: null, sightAMeta: { area: '산호초' }, sightBMeta: { area: '구메지마시' }, foodA: '현지 소바', foodB: '바다포도 샐러드', genreA: '면요리', genreB: '샐러드' },
  kita_daito: { label: '기타다이토', airport: 'KTD', areas: ['기타다이토', '해안', '마을'], sightA: null, sightB: null, sightC: null, foodA: '섬 해산물 정식', foodB: '현지 디저트', genreA: '해산물', genreB: '디저트' },
  yonaguni: { label: '요나구니', airport: 'OGN', areas: ['요나구니', '바다절벽', '마을'], sightA: '일본 최서단 기념비', sightB: null, sightC: '해저 지형 다이빙', foodA: '섬 소바', foodB: '가쓰오 요리', genreA: '면요리', genreB: '해산물' },
  tokunoshima: { label: '도쿠노시마', airport: 'TKN', areas: ['아마기', '이스엔', '해변'], sightA: '무시로세 해안', sightB: null, sightC: null, sightAMeta: { area: '해변' }, foodA: '향토 정식', foodB: '흑설탕 디저트', genreA: '향토요리', genreB: '디저트' }
};

Object.assign(JAPAN_CITY_PROFILES, JAPAN_CITY_PROFILES_EXTRA);

function buildGenericCity(profile) {
  const [a1, a2, a3] = profile.areas;
  // 명소는 자리 순서 기본값(지역 = areas[i], 추천 시간 = 오전/오후/늦은 오후)을 받고,
  // sightAMeta·sightBMeta·sightCMeta가 있으면 실제 지역·시간으로 덮어쓴다(야경 20:00-21:30, 하루가 다 드는 곳 fullDay/dayTrip 등).
  // 이름이 null인 자리는 비워 둔다(실제 장소가 아닌 '섬 해안 절벽' 같은 설명형 이름을 지운 자리 — 도시 주변 실제 명소
  // assets/city-places.json이 아래 CITY_PLACES 단계에서 채운다).
  const sight = (name, defaults, meta) => ({ name, ...defaults, ...(meta || {}) });
  return {
    label: profile.label,
    ...(profile.nameJa ? { nameJa: profile.nameJa } : {}),
    airport: profile.airport,
    areas: profile.areas,
    highlights: [
      sight(profile.sightA, { area: a1, category: '문화/명소', stayMin: 90, bestTime: '09:00-11:00', crowdScore: 3 }, profile.sightAMeta),
      sight(profile.sightB, { area: a2, category: '자연/전망', stayMin: 100, bestTime: '13:00-15:00', crowdScore: 3 }, profile.sightBMeta),
      sight(profile.sightC, { area: a3, category: '로컬/산책', stayMin: 110, bestTime: '16:00-18:00', crowdScore: 2 }, profile.sightCMeta)
    ].filter((h) => h.name),
    foods: [
      // foodAArea·foodBArea: 그 음식의 실제 지역(기본은 areas 순서 — 오이타의 벳푸 냉면은 유후인이 아니라 벳푸)
      { name: profile.foodA, area: profile.foodAArea || a1, genre: profile.genreA, priceLevel: 2, score: 3.8 },
      { name: profile.foodB, area: profile.foodBArea || a2, genre: profile.genreB, priceLevel: 3, score: 4.0 }
    ]
  };
}

for (const [key, profile] of Object.entries(JAPAN_CITY_PROFILES)) {
  CITY_DATA[key] = buildGenericCity(profile);
}

// 도시 공통 기본 맛집: 실제 가게처럼 보이지 않게 "찾기" 안내로 둔다(generic: true, 지도 링크는 검색 질의).
// 이름 형식 '<도시> 이자카야 찾기 (<지역> 주변)'은 localizeCuratedFoodName이 en/ja로 바꾼다.
const GENERIC_FOOD_KINDS = {
  izakaya: { genre: '이자카야', ko: '이자카야', en: 'an izakaya', ja: '居酒屋' },
  ramen: { genre: '라멘', ko: '라멘집', en: 'a ramen shop', ja: 'ラーメン店' }
};
const GENERIC_FOOD_NAME_RE = /^(.+) (이자카야|라멘집) 찾기 \((.+) 주변\)$/;
function genericFoodName(kind, cityLabel, area) {
  return `${cityLabel} ${GENERIC_FOOD_KINDS[kind].ko} 찾기 (${area} 주변)`;
}

function augmentCityData(city) {
  const [a1, a2] = city.areas;
  const extraFoods = [
    { name: genericFoodName('izakaya', city.label, a1), area: a1, genre: '이자카야', priceLevel: 2, score: 3.7, generic: true },
    { name: genericFoodName('ramen', city.label, a2 || a1), area: a2 || a1, genre: '라멘', priceLevel: 2, score: 3.9, generic: true }
  ];
  city.foods = [...city.foods, ...extraFoods];
}

for (const city of Object.values(CITY_DATA)) {
  augmentCityData(city);
}

// 일본어 표기(京都·大阪·札幌 …)는 아래 루프가 CITY_DATA nameJa에서 보탠다.
const CITY_ALIASES = {
  tokyo: ['도쿄', 'tokyo'],
  osaka: ['오사카', 'osaka'],
  kyoto: ['교토', 'kyoto'],
  sapporo: ['삿포로', 'sapporo', '홋카이도', 'hokkaido', '北海道'],
  fukuoka: ['후쿠오카', 'fukuoka', '규슈', 'kyushu', '九州'],
  nagoya: ['나고야', 'nagoya'],
  hiroshima: ['히로시마', 'hiroshima'],
  okinawa: ['오키나와', 'okinawa'],
  kanazawa: ['가나자와', 'kanazawa']
};

const LANDMARK_CITY_HINTS = {
  tokyo: ['센소지', '시부야', '신주쿠', '디즈니', '도쿄타워', '아사쿠사', '긴자', '하라주쿠', '오다이바', '츠키지', 'shibuya', 'shinjuku', 'asakusa', 'ginza'],
  osaka: ['도톤보리', '유니버셜', '유니버설', 'USJ', '난바', '우메다', '오사카성', '신사이바시', '신세카이', 'dotonbori', 'namba', 'umeda', 'universal studios', 'osaka castle'],
  kyoto: ['후시미', '기요미즈', '아라시야마', '기온', '니시키시장', '금각사', '은각사', 'gion', 'arashiyama', 'fushimi'],
  sapporo: ['오도리', '스스키노', '삿포로'],
  fukuoka: ['하카타', '텐진', '후쿠오카', '모모치', '캐널시티'],
  okinawa: ['나하', '츄라우미', '오키나와', '국제거리', '온나', '차탄'],
  hiroshima: ['히로시마', '미야지마', '이쓰쿠시마', '평화기념공원'],
  nagoya: ['나고야', '오스', '사카에', '나고야성'],
  kanazawa: ['가나자와', '겐로쿠엔', '히가시차야'],
  shizuoka: ['시즈오카', '누마즈', '이토', '아타미', '시미즈', '미호노마쓰바라']
};

const LOCALITY_PARENT_CITY_MAP = {
  // Tokyo
  '신주쿠': 'tokyo', '시부야': 'tokyo', '하라주쿠': 'tokyo', '아사쿠사': 'tokyo', '긴자': 'tokyo', '우에노': 'tokyo', '오다이바': 'tokyo', '이케부쿠로': 'tokyo',
  // Osaka
  '난바': 'osaka', '우메다': 'osaka', '신사이바시': 'osaka', '도톤보리': 'osaka', '신세카이': 'osaka',
  // Kyoto
  '기온': 'kyoto', '아라시야마': 'kyoto', '후시미': 'kyoto', '가와라마치': 'kyoto',
  // Fukuoka
  '하카타': 'fukuoka', '텐진': 'fukuoka', '모모치': 'fukuoka',
  // Hokkaido
  '스스키노': 'sapporo', '오도리': 'sapporo',
  // Okinawa
  '나하': 'okinawa', '온나': 'okinawa', '차탄': 'okinawa',
  // Nagoya
  '사카에': 'nagoya', '오스': 'nagoya',
  // Hiroshima
  '미야지마': 'hiroshima',
  // Shizuoka region (can be parent or explicit-local dynamic based on phrase)
  '누마즈': 'shizuoka', '아타미': 'shizuoka', '이토': 'shizuoka', '시미즈': 'shizuoka',
  // Oita region
  '벳푸': 'oita', '유후인': 'oita',
  // Kanagawa region (fallback to tokyo in this dataset)
  '하코네': 'tokyo', '요코하마': 'tokyo',
  // Hyogo region
  '고베': 'kobe'
};

const DYNAMIC_LOCALITY_AIRPORT_HINT = {
  '누마즈': 'FSZ',
  '아타미': 'FSZ',
  '이토': 'FSZ',
  '유후인': 'OIT',
  '벳푸': 'OIT',
  '하코네': 'HND',
  '요코하마': 'HND'
};

const MUST_ATTRACTIONS = [
  { name: '유니버셜 스튜디오 재팬', cityKey: 'osaka', area: '오사카', fullDay: true, aliases: ['유니버셜', '유니버셜 스튜디오', '유니버설', '유니버설 스튜디오', '유니버설 스튜디오 재팬', 'usj', 'universal studios', 'universal studios japan', 'ユニバーサル'] },
  { name: '금각사', cityKey: 'kyoto', area: '교토', aliases: ['금각사', '킨카쿠지', 'kinkakuji', 'kinkaku-ji', 'golden pavilion', '金閣寺'] },
  { name: '후시미 이나리', cityKey: 'kyoto', area: '교토', aliases: ['후시미 이나리', '후시미이나리', 'fushimi inari', '伏見稲荷'] },
  { name: '도톤보리', cityKey: 'osaka', area: '오사카', aliases: ['도톤보리', 'dotonbori', 'dōtonbori', '道頓堀'] },
  { name: '센소지', cityKey: 'tokyo', area: '도쿄', aliases: ['센소지', '아사쿠사 절', 'sensoji', 'senso-ji', '浅草寺'] },
  { name: '도쿄 디즈니랜드', cityKey: 'tokyo', area: '지바 우라야스', fullDay: true, aliases: ['도쿄 디즈니랜드', 'tokyo disneyland', '디즈니랜드'] },
  { name: '도쿄 디즈니씨', cityKey: 'tokyo', area: '지바 우라야스', fullDay: true, aliases: ['도쿄 디즈니씨', 'tokyo disneysea', '디즈니씨'] },
  { name: '시부야 스카이', cityKey: 'tokyo', area: '도쿄', aliases: ['시부야 스카이', 'shibuya sky', '渋谷スカイ'] },
  { name: '도쿄 타워', cityKey: 'tokyo', area: '도쿄', aliases: ['도쿄 타워', '도쿄타워', 'tokyo tower', '東京タワー'] },
  { name: '오사카성', cityKey: 'osaka', area: '오사카', aliases: ['오사카성', 'osaka castle', '大阪城'] },
  { name: '신세카이', cityKey: 'osaka', area: '오사카', aliases: ['신세카이', 'shinsekai', '新世界'] },
  { name: '기요미즈데라', cityKey: 'kyoto', area: '교토', aliases: ['기요미즈데라', '기요미즈', 'kiyomizudera', 'kiyomizu-dera', 'kiyomizu dera', '清水寺'] },
  { name: '아라시야마 대나무숲', cityKey: 'kyoto', area: '교토', aliases: ['아라시야마', 'arashiyama bamboo', '아라시야마 대나무숲'] },
  { name: '니시키 시장', cityKey: 'kyoto', area: '교토', aliases: ['니시키 시장', 'nishiki market'] },
  { name: '삿포로 오도리 공원', cityKey: 'sapporo', area: '삿포로', aliases: ['오도리 공원', 'odori park'] },
  { name: '삿포로 TV 타워', cityKey: 'sapporo', area: '삿포로', aliases: ['삿포로 tv 타워', 'sapporo tv tower'] },
  { name: '후쿠오카 타워', cityKey: 'fukuoka', area: '후쿠오카', aliases: ['후쿠오카 타워', 'fukuoka tower'] },
  { name: '캐널시티 하카타', cityKey: 'fukuoka', area: '후쿠오카', aliases: ['캐널시티', 'canal city hakata'] },
  // 미야지마(섬)를 말하면 이 신사 하나로 넣는다(따로 '미야지마' 카드를 만들어 같은 곳을 두 번 넣지 않게)
  { name: '이쓰쿠시마 신사', cityKey: 'hiroshima', area: '미야지마', aliases: ['이쓰쿠시마 신사', '이츠쿠시마 신사', 'itsukushima shrine', 'itsukushima', '미야지마 신사', '미야지마', 'miyajima', '厳島神社', '嚴島神社', '宮島'] },
  { name: '히로시마 평화기념공원', cityKey: 'hiroshima', area: '히로시마', aliases: ['평화기념공원', 'hiroshima peace memorial park'] },
  { name: '겐로쿠엔', cityKey: 'kanazawa', area: '가나자와', aliases: ['겐로쿠엔', 'kenrokuen'] },
  { name: '나고야성', cityKey: 'nagoya', area: '나고야', aliases: ['나고야성', 'nagoya castle'] },
  { name: '츄라우미 수족관', cityKey: 'okinawa', area: '모토부', dayTrip: true, aliases: ['츄라우미 수족관', 'churaumi aquarium'] },
  { name: '국제거리', cityKey: 'okinawa', area: '오키나와', aliases: ['국제거리', 'kokusai dori'] },
  { name: '벳푸 지옥온천', cityKey: 'oita', area: '벳푸', aliases: ['벳푸 지옥온천', '벳푸', '벳부', 'beppu hells', 'beppu', '別府', '別府地獄めぐり'] },
  { name: '유후인', cityKey: 'oita', area: '유후인', aliases: ['유후인', 'yufuin', '湯布院', '由布院'] },
  { name: '우에노 공원', cityKey: 'tokyo', area: '도쿄', aliases: ['우에노공원', '우에노 공원', 'ueno park'] },
  { name: '메구로강', cityKey: 'tokyo', area: '도쿄', aliases: ['메구로강', '메구로 강', 'meguro river'] },
  { name: '오타루 운하', cityKey: 'sapporo', area: '오타루', aliases: ['오타루', '오타루 운하', 'otaru', 'otaru canal', '小樽', '小樽運河'] },
  { name: '다자이후 텐만구', cityKey: 'fukuoka', area: '다자이후', aliases: ['다자이후', '다자이후 텐만구', 'dazaifu tenmangu'] },
  { name: '노토반도', cityKey: 'kanazawa', area: '노토', dayTrip: true, aliases: ['노토반도', '노토 반도', 'noto peninsula'] },
  { name: '시라카와고', cityKey: 'kanazawa', area: '기후 시라카와고', dayTrip: true, aliases: ['시라카와고', 'shirakawago', 'shirakawa-go', '白川郷'] },
  { name: '원폭돔', cityKey: 'hiroshima', area: '히로시마', aliases: ['원폭돔', '원폭 돔', 'atomic bomb dome'] },
  { name: '사쿠라지마', cityKey: 'kagoshima', area: '가고시마', aliases: ['사쿠라지마', 'sakurajima'] },
  { name: '후라노 라벤더밭', cityKey: 'asahikawa', area: '후라노', dayTrip: true, aliases: ['후라노', '라벤더', 'furano lavender', 'furano', '富良野'] },
  { name: '비에이 청의 호수', cityKey: 'asahikawa', area: '비에이', aliases: ['비에이', '청의 호수', 'biei blue pond', 'biei', '美瑛', '青い池'] },
  { name: '후지큐 하이랜드', cityKey: 'tokyo', area: '야마나시 후지요시다', dayTrip: true, aliases: ['후지큐', '후지큐 하이랜드', 'fujikyu highland'] },
  { name: '나가시마 스파랜드', cityKey: 'nagoya', area: '미에 구와나', fullDay: true, aliases: ['나가시마 스파랜드', 'nagashima spa land'] },
  { name: '닌텐도 뮤지엄', cityKey: 'kyoto', area: '교토', aliases: ['닌텐도 뮤지엄', 'nintendo museum'] },
  { name: '지브리파크', cityKey: 'nagoya', area: '아이치 나가쿠테', fullDay: true, aliases: ['지브리파크', 'ghibli park'] },
  { name: '도쿄 해리포터 스튜디오', cityKey: 'tokyo', area: '네리마', dayTrip: true, aliases: ['해리포터 스튜디오', 'harry potter studio tokyo'] },
  { name: '하코다테 아침시장', cityKey: 'hakodate', area: '하코다테', aliases: ['하코다테 아침시장', 'hakodate morning market'] },
  // (예전 '니가타 사케 양조장'·'오키나와 스노클링'은 한 장소가 아닌 활동·일반 명칭이라, '야쿠시마 트레킹'은 조몬스기 트레일과 같은 곳이라 뺐다)
  { name: '알펜루트', cityKey: 'toyama', area: '다테야마', fullDay: true, aliases: ['알펜루트', '다테야마 쿠로베', 'tateyama kurobe alpine route'] },
  // 구마노고도(나카헤치)의 목적지. 고베에서 140km라 난키 시라하마의 당일치기로 둔다(위키데이터 Q705035).
  { name: '구마노 혼구 다이샤', cityKey: 'nanki_shirahama', area: '와카야마 다나베', dayTrip: true, aliases: ['구마노 혼구 다이샤', '구마노 혼구', '구마노고도', '구마노 고도', 'kumano hongu taisha', 'kumano hongū taisha', 'kumano kodo', 'kumano kodō', '熊野本宮大社', '熊野古道'] },
  { name: '가마쿠라', cityKey: 'tokyo', area: '가나가와 가마쿠라', dayTrip: true, aliases: ['가마쿠라', 'kamakura', '鎌倉'] },
  { name: '에노시마', cityKey: 'tokyo', area: '가나가와 후지사와', dayTrip: true, aliases: ['에노시마', 'enoshima', '江ノ島', '江の島'] },
  { name: '오이라세 계곡', cityKey: 'aomori', area: '도와다', dayTrip: true, aliases: ['오이라세 계곡', 'oirase gorge'] },
  { name: '시레토코 국립공원', cityKey: 'memanbetsu', area: '시레토코', dayTrip: true, aliases: ['시레토코', 'shiretoko'] },
  { name: '아소산', cityKey: 'kumamoto', area: '아소', dayTrip: true, aliases: ['아소산', 'aso'] },
  { name: '돗토리 사구', cityKey: 'tottori', area: '돗토리', aliases: ['돗토리 사구', 'tottori sand dune'] },
  // 마쓰모토 도시 명소 '가미코치'와 같은 이름(말로 '카미코치'라고 해도 한 곳으로 찾는다)
  { name: '가미코치', cityKey: 'matsumoto', area: '가미코치', dayTrip: true, aliases: ['가미코치', '카미코치', 'kamikochi', 'kamikōchi', '上高地'] },
  { name: '쿠사츠 온천', cityKey: 'tokyo', area: '군마 쿠사츠', dayTrip: true, aliases: ['쿠사츠 온천', '쿠사츠', '구사쓰 온천', '구사쓰', '구사츠 온천', '쿠사쓰 온천', 'kusatsu onsen', '草津温泉'] },
  { name: '긴잔 온천', cityKey: 'yamagata', area: '오바나자와', dayTrip: true, aliases: ['긴잔온천', '긴잔 온천', 'ginzan onsen', '銀山温泉'] },
  { name: '노보리베츠 온천', cityKey: 'sapporo', area: '노보리베츠', dayTrip: true, aliases: ['노보리베츠', '노보리베츠 온천', '노보리베쓰', '노보리베쓰 온천', 'noboribetsu', 'noboribetsu onsen', '登別', '登別温泉'] },
  { name: '게로 온천', cityKey: 'nagoya', area: '기후 게로', dayTrip: true, aliases: ['게로온천', '게로 온천', 'gero onsen', '下呂温泉'] },
  // 다지마 도시 명소 '기노사키 온천'과 같은 이름(말로 '키노사키'라고 해도 한 곳으로 찾는다)
  { name: '기노사키 온천', cityKey: 'tajima', area: '기노사키', aliases: ['기노사키 온천', '기노사키온천', '기노사키', '키노사키 온천', '키노사키', 'kinosaki', 'kinosaki onsen', '城崎温泉', '城崎'] },
  { name: '아리마 온천', cityKey: 'kobe', area: '아리마', aliases: ['아리마 온천', 'arima onsen'] },
  { name: '시부 온천', cityKey: 'matsumoto', area: '나가노 야마노우치', dayTrip: true, aliases: ['시부온천', '시부 온천', 'shibu onsen'] },
  { name: '스노우몽키 파크', cityKey: 'matsumoto', area: '나가노 야마노우치', dayTrip: true, aliases: ['스노우몽키', 'snow monkey'] },
  // 공항이 없는 인기 여행지: 가까운 지원 도시의 당일치기로 둔다('닛코 2일' → 도쿄 + 닛코 당일치기). 모두 위키데이터의 실제 장소이고
  // 사진·좌표·en/ja 이름은 assets/city-places.json media(scripts/build-city-places.js MEDIA_ITEMS)에서 온다.
  // 별칭은 다른 낱말에 섞이지 않는 것만: '이세'는 '이세탄'(백화점)에, '日光'은 '日光浴'에, '高山'은 '高山病'에도 들어 있어 별칭이 아니라
  // contextAliases로 둔다(낱말 하나로 쓰였을 때만, 뒤에 조사·'여행'·숫자가 올 때 그 장소: '高山で2日間', '이세 2일', 'Ise 2 days' — contextAliasInText).
  { name: '닛코 도쇼구', cityKey: 'tokyo', area: '도치기 닛코', category: '문화', dayTrip: true, aliases: ['닛코 도쇼구', '닛코도쇼구', '닛코 동조궁', '닛코', 'nikko toshogu', 'nikkō tōshō-gū', 'nikko', 'nikkō', '日光東照宮', '日光市'], contextAliases: ['日光'] },
  { name: '가루이자와', cityKey: 'tokyo', area: '나가노 가루이자와', dayTrip: true, aliases: ['가루이자와', '카루이자와', 'karuizawa', '軽井沢'] },
  { name: '가와구치코', cityKey: 'tokyo', area: '야마나시 후지카와구치코', category: '자연', dayTrip: true, aliases: ['가와구치코', '카와구치코', '가와구치호', '가와구치 호수', '후지산', '후지 산', '후지고코', 'kawaguchiko', 'lake kawaguchi', 'mount fuji', 'mt. fuji', 'mt fuji', 'fuji five lakes', '河口湖', '富士山', '富士五湖'] },
  { name: '다카야마 산마치', cityKey: 'nagoya', area: '기후 다카야마', category: '산책', dayTrip: true, aliases: ['다카야마 산마치', '다카야마', '타카야마', '히다 다카야마', 'takayama', 'hida takayama', 'sanmachi', '飛騨高山', '高山市', '三町'], contextAliases: ['高山'] },
  { name: '이세 신궁', cityKey: 'nagoya', area: '미에 이세', category: '문화', dayTrip: true, aliases: ['이세 신궁', '이세신궁', '이세 진구', '이세진구', 'ise jingu', 'ise jingū', 'ise grand shrine', 'ise shrine', '伊勢神宮'], contextAliases: ['이세', 'ise', '伊勢'] },
  { name: '히메지성', cityKey: 'kobe', area: '효고 히메지', category: '문화', dayTrip: true, aliases: ['히메지성', '히메지 성', '히메지', 'himeji castle', 'himeji', '姫路城', '姫路'] },
  { name: '히메지성', cityKey: 'osaka', area: '효고 히메지', category: '문화', dayTrip: true, aliases: ['히메지성', '히메지 성', '히메지', 'himeji castle', 'himeji', '姫路城', '姫路'] },
  { name: '뵤도인', cityKey: 'kyoto', area: '우지', category: '문화', aliases: ['뵤도인', '보도인', '평등원', '우지', 'byodoin', 'byodo-in', 'byōdō-in', 'uji', '平等院', '宇治'] },
  { name: '아마노하시다테', cityKey: 'kyoto', area: '교토 미야즈', category: '자연', dayTrip: true, aliases: ['아마노하시다테', 'amanohashidate', '天橋立'] },
  { name: '고야산', cityKey: 'osaka', area: '와카야마 고야', category: '문화', dayTrip: true, aliases: ['고야산', '코야산', '곤고부지', 'koyasan', 'mount koya', 'mt. koya', 'kongobuji', '高野山', '金剛峯寺'] },
  { name: '지추 미술관', cityKey: 'takamatsu', area: '가가와 나오시마', category: '미술관', dayTrip: true, aliases: ['지추 미술관', '나오시마', 'chichu art museum', 'naoshima', '地中美術館', '直島'] },
  { name: '지추 미술관', cityKey: 'okayama', area: '가가와 나오시마', category: '미술관', dayTrip: true, aliases: ['지추 미술관', '나오시마', 'chichu art museum', 'naoshima', '地中美術館', '直島'] },
  { name: '구로카와 온천', cityKey: 'kumamoto', area: '구마모토 미나미오구니', category: '온천', dayTrip: true, aliases: ['구로카와 온천', '구로카와온천', '쿠로카와 온천', 'kurokawa onsen', '黒川温泉'] },
  { name: '구로카와 온천', cityKey: 'oita', area: '구마모토 미나미오구니', category: '온천', dayTrip: true, aliases: ['구로카와 온천', '구로카와온천', '쿠로카와 온천', 'kurokawa onsen', '黒川温泉'] },
  { name: '젠코지', cityKey: 'matsumoto', area: '나가노', category: '문화', dayTrip: true, aliases: ['젠코지', 'zenkoji', 'zenko-ji', 'zenkō-ji', '善光寺', '나가노', 'nagano', '長野'] },
  // 도시 명소(highlights)에 있지만 말로 했을 때 그 도시를 찾도록(도시 명소 풀에서는 같은 이름이라 한 번만 나온다)
  { name: '마쓰시마', cityKey: 'sendai', area: '마쓰시마', aliases: ['마쓰시마', '마츠시마', 'matsushima', '松島'] },
  { name: '쿠라시키 미관지구', cityKey: 'okayama', area: '쿠라시키', aliases: ['쿠라시키 미관지구', '구라시키 미관지구', '쿠라시키', '구라시키', 'kurashiki', 'kurashiki bikan', '倉敷美観地区', '倉敷'] },
  // 당일치기(도시 데이터가 없는 근교): 규칙·AI 일정이 '종일' 칸에 넣는다.
  { name: '하코네', cityKey: 'tokyo', area: '가나가와 하코네', category: '온천', dayTrip: true, aliases: ['하코네', 'hakone', '箱根'] },
  { name: '나라 공원·도다이지', cityKey: 'osaka', area: '나라', dayTrip: true, aliases: ['나라 공원', '나라공원', '도다이지', '나라', 'nara park', 'todaiji', 'nara', '奈良公園', '東大寺', '奈良'] },
  { name: '나라 공원·도다이지', cityKey: 'kyoto', area: '나라', dayTrip: true, aliases: ['나라 공원', '나라공원', '도다이지', '나라', 'nara park', 'todaiji', 'nara', '奈良公園', '東大寺', '奈良'] }
];

// 내장 표(highlights·MUST_ATTRACTIONS)에 없는 잘 알려진 명소: 이름·별칭·지역·좌표·en/ja 이름.
// 쓰는 곳: 말로 한 꼭 갈 곳·제외 해석(별칭), 일정의 이름·지역·지도 좌표, '실내 위주'(indoor) 후보, 도시 명소 풀의 마지막 순서.
const EXTRA_PLACES = [
  // 도쿄
  { name: '도쿄 국립박물관', cityKey: 'tokyo', area: '우에노', category: '박물관', bestTime: '09:30-12:00', stayMin: 120, indoor: true, lat: 35.7188, lng: 139.7765, en: 'Tokyo National Museum', ja: '東京国立博物館', aliases: ['도쿄 국립박물관', '도쿄국립박물관', 'tokyo national museum', '東京国立博物館'] },
  { name: '국립과학박물관', cityKey: 'tokyo', area: '우에노', category: '박물관', bestTime: '13:00-16:00', stayMin: 120, indoor: true, lat: 35.7163, lng: 139.7763, en: 'National Museum of Nature and Science', ja: '国立科学博物館', aliases: ['국립과학박물관', '국립 과학 박물관', 'national museum of nature and science', '国立科学博物館'] },
  { name: '팀랩 플래닛', cityKey: 'tokyo', area: '도요스', category: '전시', bestTime: '13:00-16:00', stayMin: 120, indoor: true, lat: 35.6491, lng: 139.7898, en: 'teamLab Planets TOKYO', ja: 'チームラボプラネッツ', aliases: ['팀랩 플래닛', '팀랩플래닛', '팀랩', 'teamlab planets', 'teamlab', 'チームラボプラネッツ', 'チームラボ'] },
  { name: '도쿄 스카이트리', cityKey: 'tokyo', area: '오시아게', category: '전망', bestTime: '13:00-16:00', stayMin: 90, indoor: true, lat: 35.7101, lng: 139.8107, en: 'Tokyo Skytree', ja: '東京スカイツリー', aliases: ['도쿄 스카이트리', '스카이트리', 'tokyo skytree', 'skytree', '東京スカイツリー', 'スカイツリー'] },
  { name: '선샤인 수족관', cityKey: 'tokyo', area: '이케부쿠로', category: '수족관', bestTime: '10:00-12:00', stayMin: 100, indoor: true, lat: 35.7289, lng: 139.7196, en: 'Sunshine Aquarium', ja: 'サンシャイン水族館', aliases: ['선샤인 수족관', 'sunshine aquarium', 'サンシャイン水族館'] },
  { name: '모리 미술관', cityKey: 'tokyo', area: '롯폰기', category: '미술관', bestTime: '14:00-17:00', stayMin: 100, indoor: true, lat: 35.6604, lng: 139.7292, en: 'Mori Art Museum', ja: '森美術館', aliases: ['모리 미술관', 'mori art museum', '森美術館'] },
  // 오사카
  { name: '가이유칸', cityKey: 'osaka', area: '덴포잔', category: '수족관', bestTime: '10:00-12:30', stayMin: 150, indoor: true, lat: 34.6545, lng: 135.4290, en: 'Osaka Aquarium Kaiyukan', ja: '海遊館', aliases: ['가이유칸', '가이유칸 수족관', '카이유칸', 'kaiyukan', 'kaiyukan aquarium', 'osaka aquarium kaiyukan', '海遊館'] },
  { name: '아베노 하루카스 300', cityKey: 'osaka', area: '덴노지', category: '전망', bestTime: '16:00-18:30', stayMin: 80, indoor: true, lat: 34.6460, lng: 135.5136, en: 'Abeno Harukas 300', ja: 'あべのハルカス展望台', aliases: ['아베노 하루카스', '하루카스 300', 'abeno harukas', 'harukas 300', 'あべのハルカス'] },
  { name: '오사카 역사박물관', cityKey: 'osaka', area: '주오구', category: '박물관', bestTime: '13:00-15:30', stayMin: 100, indoor: true, lat: 34.6823, lng: 135.5214, en: 'Osaka Museum of History', ja: '大阪歴史博物館', aliases: ['오사카 역사박물관', '오사카 역사 박물관', 'osaka museum of history', '大阪歴史博物館'] },
  { name: '오사카 주택박물관', cityKey: 'osaka', area: '텐진바시', category: '박물관', bestTime: '10:00-12:00', stayMin: 90, indoor: true, lat: 34.7111, lng: 135.5112, en: 'Osaka Museum of Housing and Living', ja: '大阪くらしの今昔館', aliases: ['오사카 주택박물관', '오사카 생활금석관', 'osaka museum of housing and living', '大阪くらしの今昔館'] },
  { name: '구로몬 시장', cityKey: 'osaka', area: '닛폰바시', category: '시장', bestTime: '10:00-12:00', stayMin: 90, indoor: true, lat: 34.6653, lng: 135.5068, en: 'Kuromon Market', ja: '黒門市場', aliases: ['구로몬 시장', '구로몬시장', 'kuromon market', '黒門市場'] },
  // 교토
  { name: '은각사', cityKey: 'kyoto', area: '사쿄구', category: '문화', bestTime: '09:00-11:00', stayMin: 90, lat: 35.0270, lng: 135.7982, en: 'Ginkaku-ji Temple', ja: '銀閣寺', aliases: ['은각사', 'ginkakuji', 'ginkaku-ji', 'silver pavilion', '銀閣寺'] },
  { name: '니조성', cityKey: 'kyoto', area: '니조', category: '문화', bestTime: '09:00-11:00', stayMin: 90, lat: 35.0142, lng: 135.7481, en: 'Nijo Castle', ja: '二条城', aliases: ['니조성', '니조 성', 'nijo castle', 'nijo-jo', '二条城'] },
  { name: '교토 국립박물관', cityKey: 'kyoto', area: '히가시야마', category: '박물관', bestTime: '10:00-12:30', stayMin: 120, indoor: true, lat: 34.9900, lng: 135.7732, en: 'Kyoto National Museum', ja: '京都国立博物館', aliases: ['교토 국립박물관', '교토국립박물관', 'kyoto national museum', '京都国立博物館'] },
  { name: '교토 철도박물관', cityKey: 'kyoto', area: '우메코지', category: '박물관', bestTime: '10:00-13:00', stayMin: 120, indoor: true, lat: 34.9874, lng: 135.7424, en: 'Kyoto Railway Museum', ja: '京都鉄道博物館', aliases: ['교토 철도박물관', '교토철도박물관', 'kyoto railway museum', '京都鉄道博物館'] },
  { name: '교토 국제만화박물관', cityKey: 'kyoto', area: '가라스마오이케', category: '박물관', bestTime: '13:00-15:30', stayMin: 100, indoor: true, lat: 35.0117, lng: 135.7593, en: 'Kyoto International Manga Museum', ja: '京都国際マンガミュージアム', aliases: ['교토 국제만화박물관', '교토 만화박물관', 'kyoto international manga museum', '京都国際マンガミュージアム'] },
  // 삿포로
  { name: '삿포로 맥주 박물관', cityKey: 'sapporo', area: '히가시구', category: '박물관', bestTime: '13:00-15:00', stayMin: 90, indoor: true, lat: 43.0716, lng: 141.3689, en: 'Sapporo Beer Museum', ja: 'サッポロビール博物館', aliases: ['삿포로 맥주 박물관', '삿포로 맥주박물관', 'sapporo beer museum', 'サッポロビール博物館'] },
  { name: '시로이 코이비토 파크', cityKey: 'sapporo', area: '니시구', category: '체험', bestTime: '10:00-12:00', stayMin: 90, indoor: true, lat: 43.0889, lng: 141.2716, en: 'Shiroi Koibito Park', ja: '白い恋人パーク', aliases: ['시로이 코이비토 파크', '시로이코이비토', 'shiroi koibito park', '白い恋人パーク'] },
  { name: '삿포로 시계탑', cityKey: 'sapporo', area: '오도리', category: '문화', bestTime: '10:00-11:00', stayMin: 45, indoor: true, lat: 43.0625, lng: 141.3536, en: 'Sapporo Clock Tower', ja: '札幌市時計台', aliases: ['삿포로 시계탑', '시계탑', 'sapporo clock tower', '札幌市時計台', '時計台'] },
  // 후쿠오카
  { name: '후쿠오카 시 박물관', cityKey: 'fukuoka', area: '모모치', category: '박물관', bestTime: '10:00-12:00', stayMin: 90, indoor: true, lat: 33.5895, lng: 130.3528, en: 'Fukuoka City Museum', ja: '福岡市博物館', aliases: ['후쿠오카 시 박물관', '후쿠오카시 박물관', 'fukuoka city museum', '福岡市博物館'] },
  { name: '마린 월드 우미노나카미치', cityKey: 'fukuoka', area: '우미노나카미치', category: '수족관', bestTime: '10:00-13:00', stayMin: 150, indoor: true, lat: 33.6614, lng: 130.3639, en: 'Marine World Uminonakamichi', ja: 'マリンワールド海の中道', aliases: ['마린 월드', '마린월드', 'marine world uminonakamichi', 'マリンワールド'] },
  { name: '후쿠오카 아시아 미술관', cityKey: 'fukuoka', area: '나카스카와바타', category: '미술관', bestTime: '13:00-15:00', stayMin: 90, indoor: true, lat: 33.5953, lng: 130.4061, en: 'Fukuoka Asian Art Museum', ja: '福岡アジア美術館', aliases: ['후쿠오카 아시아 미술관', 'fukuoka asian art museum', '福岡アジア美術館'] },
  // 오키나와
  { name: '오키나와 현립 박물관·미술관', cityKey: 'okinawa', area: '나하', category: '박물관', bestTime: '10:00-12:30', stayMin: 120, indoor: true, lat: 26.2270, lng: 127.6948, en: 'Okinawa Prefectural Museum & Art Museum', ja: '沖縄県立博物館・美術館', aliases: ['오키나와 현립 박물관', '오키나와 현립박물관', 'okinawa prefectural museum', '沖縄県立博物館'] },
  { name: 'DMM 가리유시 수족관', cityKey: 'okinawa', area: '도미구스쿠', category: '수족관', bestTime: '13:00-15:30', stayMin: 120, indoor: true, lat: 26.1760, lng: 127.6487, en: 'DMM Kariyushi Aquarium', ja: 'DMMかりゆし水族館', aliases: ['가리유시 수족관', 'dmm 가리유시', 'kariyushi aquarium', 'かりゆし水族館'] },
  { name: '슈리성', cityKey: 'okinawa', area: '나하', category: '문화', bestTime: '09:00-11:00', stayMin: 90, lat: 26.2172, lng: 127.7195, en: 'Shuri Castle', ja: '首里城', aliases: ['슈리성', '슈리 성', 'shuri castle', 'shurijo', '首里城'] }
];

// ══════════════════════════════════════════════════════════════════════
// 도시 주변 실제 명소: assets/city-places.json (scripts/build-city-places.js가 위키데이터에서 만든다)
//  - 추천 카드(도시 명소 highlights + 이 목록)가 반나절 명소 30곳이 되도록 채운다(2026-10-03, 예전 12곳). 대표 명소(MUST_ATTRACTIONS)·
//    추가 명소(EXTRA_PLACES)는 겹침만 뺀다. 규칙 일정·AI 후보는 요청하지 않은 이 명소를 큐레이션 명소 뒤에 쓴다(isGeneratedCityPlace).
//  - 한국어 이름을 만들 수 없는 곳(일본어 이름만 있는 곳)과 숙박 시설(호텔·리조트)은 생성 스크립트가 받지 않는다.
//  - 모두 위키데이터 항목(QID)·좌표가 있는 실제 장소다. 규칙 일정과 AI 일정은 이 목록 안에서만 고른다(지어낸 장소 없음).
//  - EXTRA_PLACES 뒤에 generated: true로 붙인다 → 도시 명소 풀(curatedCityPool)의 마지막 순서. 이름·en/ja·지역·좌표·분류는 파일 그대로.
//  - 큐레이션 명소가 3곳보다 적은 도시(설명형 이름을 지운 섬 등)는 도시 명소(highlights)도 이 목록의 앞쪽 명소로 3곳까지 채운다.
//  - few: 도시 주변의 반나절 명소가 9곳보다 적은 곳(작은 섬). 다른 도시 장소로 채우지 않고 일정 팁으로 그렇다고 알린다.
//  - 사진·좌표·en/ja 이름(media)은 PLACE_IMAGES(place-images.json)에 없는 이름만 보탠다(아래 PLACE_IMAGES 단계).
//  - 파일이 없거나 깨지면 이 단계 없이(큐레이션 데이터만으로) 동작한다.
// ══════════════════════════════════════════════════════════════════════
const CITY_PLACES_FILE = path.join(__dirname, 'assets', 'city-places.json');
const CITY_PLACE_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/;
// 이름 비교용(대소문자·공백·기호 무시) — placeNameKey와 같은 규칙(이 단계는 그 함수가 쓰는 표보다 먼저 돈다)
const cityPlaceKey = (s) => String(s || '').toLowerCase().replace(/[\s()（）[\]・·.,'"`_-]/g, '');

function loadCityPlaces() {
  const cities = new Map(); // cityKey → { few, places: [EXTRA_PLACES 모양 + media] }
  const media = new Map(); // '<cityKey>|<이름>' → place-images.json places 항목 모양(사진·좌표·위키데이터·labels)
  const fileLabel = path.relative(__dirname, CITY_PLACES_FILE) || CITY_PLACES_FILE;
  try {
    if (!fs.existsSync(CITY_PLACES_FILE)) {
      console.warn(`[city-places] ${fileLabel} 파일이 없어 큐레이션 명소만으로 동작합니다.`);
      return { cities, media };
    }
    const raw = JSON.parse(fs.readFileSync(CITY_PLACES_FILE, 'utf8').replace(/^﻿/, ''));
    const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
    const inJapan = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= 20 && lat <= 46.5 && lng >= 122 && lng <= 154;
    const isQid = (v) => /^Q\d+$/.test(String(v || ''));
    const mediaOf = (p, labels) => ({ image: p.image, filePage: p.filePage, license: p.license, artist: p.artist, lat: p.lat, lng: p.lng, wikidata: p.wikidata, labels });
    for (const [ck, c] of Object.entries((raw && raw.cities) || {})) {
      if (!CITY_DATA[ck] || !c || !Array.isArray(c.places)) continue;
      const places = [];
      for (const p of c.places) {
        const name = text(p && p.name, 80);
        // 위키데이터 항목과 일본 안 좌표가 없는 항목은 쓰지 않는다(실제 장소만)
        if (!name || !isQid(p.wikidata) || !inJapan(p.lat, p.lng)) continue;
        const en = text(p.en, 80);
        const ja = text(p.ja, 80);
        // 도시 이름을 앞에 붙인 이름('구시로 이쓰쿠시마 신사')의 원래 이름: 다른 곳과 겹치지 않을 때만 말로 찾는다(generatedMatchNames)
        // 장음 기호를 뺀 영어 이름(Daijingū → 'Yamanoue Daijingu Shrine', 'Ino no Hi'): 영어 채팅은 보통 장음 기호 없이 쓴다(2026-10-03).
        // 별칭이라 말로 찾기·'skip X'·로마자 no 판정(romajiNoLabels)에 함께 쓰이고, 겹치는 이름은 generatedMatchNames가 거른다.
        const enPlain = en.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const aliases = [...new Set([
          ...(Array.isArray(p.aliases) ? p.aliases : []).map((a) => text(a, 80)).filter(Boolean).slice(0, 4),
          ...(enPlain && enPlain !== en ? [enPlain] : [])
        ])];
        places.push({
          name,
          ...(aliases.length ? { aliases } : {}),
          cityKey: ck,
          area: text(p.area, 60) || CITY_DATA[ck].label,
          areaEn: text(p.areaEn, 80),
          areaJa: text(p.areaJa, 80),
          category: text(p.category, 20) || '관광',
          bestTime: CITY_PLACE_TIME_RE.test(String(p.bestTime || '')) ? p.bestTime : '10:00-17:00',
          stayMin: clamp(Math.round(Number(p.stayMin) || 90), 30, 480),
          ...(p.indoor === true ? { indoor: true } : {}),
          // 하루 전체가 드는 곳: 큰 테마파크(fullDay), 1,000m 넘는 산 등반(dayTrip) — 규칙 일정은 '종일' 칸에 혼자 넣는다
          ...(p.fullDay === true ? { fullDay: true } : (p.dayTrip === true ? { dayTrip: true } : {})),
          lat: p.lat,
          lng: p.lng,
          ...(en ? { en } : {}),
          ...(ja ? { ja } : {}),
          wikidata: p.wikidata,
          generated: true,
          media: mediaOf(p, { ...(en ? { en } : {}), ...(ja ? { ja } : {}) })
        });
      }
      cities.set(ck, { few: c.few === true, places });
    }
    for (const [key, v] of Object.entries((raw && raw.media) || {})) {
      const sep = key.indexOf('|');
      if (sep <= 0 || !CITY_DATA[key.slice(0, sep)] || !v || typeof v !== 'object' || !isQid(v.wikidata)) continue;
      media.set(key, v);
    }
    const count = [...cities.values()].reduce((n, c) => n + c.places.length, 0);
    console.log(`[city-places] 도시 주변 실제 명소 ${count}곳(${cities.size}개 도시), 큐레이션 명소 사진·좌표 ${media.size}곳 로드`);
  } catch (err) {
    console.warn(`[city-places] ${fileLabel}을(를) 읽지 못해 큐레이션 명소만으로 동작합니다: ${err.message}`);
  }
  return { cities, media };
}

const CITY_PLACES = loadCityPlaces();

// 도시 주변 실제 명소의 별칭(예전 이름) 중 다른 도시의 큐레이션 이름과 같은 것은 버린다.
// 하나마키 '하나마키 기요미즈데라'의 별칭 '기요미즈데라'·'清水寺'가 남아 있으면 교토 여행의 "기요미즈데라는 빼고"가
// 하나마키 절까지 제외 목록에 넣는다(2026-10-02). 이름 찾기용 이름(generatedMatchNames)은 따로 거른다.
const CURATED_NAME_OWNERS = (() => {
  const owners = new Map(); // 이름 키 → Set(cityKey)
  const add = (label, ck) => { const k = cityPlaceKey(label); if (!k) return; if (!owners.has(k)) owners.set(k, new Set()); owners.get(k).add(ck); };
  for (const m of MUST_ATTRACTIONS) [m.name, ...(m.aliases || [])].forEach((a) => add(a, m.cityKey));
  for (const [ck, c] of Object.entries(CITY_DATA)) for (const h of c.highlights || []) add(h.name, ck);
  for (const e of EXTRA_PLACES) [e.name, e.en, e.ja, ...(e.aliases || [])].forEach((a) => add(a, e.cityKey));
  return owners;
})();
const ownedByOtherCity = (label, ck) => [...(CURATED_NAME_OWNERS.get(cityPlaceKey(label)) || [])].some((owner) => owner !== ck);

// 도시마다: 이미 있는 이름(큐레이션 명소·대표 명소·추가 명소)과 겹치지 않는 것만 EXTRA_PLACES에 붙이고,
// 도시 명소(highlights)가 3곳보다 적으면 앞쪽(하루짜리가 아닌) 명소로 채운다.
for (const [ck, c] of CITY_PLACES.cities) {
  for (const p of c.places) if (Array.isArray(p.aliases)) p.aliases = p.aliases.filter((a) => !ownedByOtherCity(a, ck));
  const city = CITY_DATA[ck];
  const taken = new Set([
    ...(city.highlights || []).map((h) => h.name),
    ...MUST_ATTRACTIONS.filter((m) => m.cityKey === ck).flatMap((m) => [m.name, ...(m.aliases || [])]),
    ...EXTRA_PLACES.filter((e) => e.cityKey === ck).flatMap((e) => [e.name, e.en, e.ja, ...(e.aliases || [])])
  ].map(cityPlaceKey).filter(Boolean));
  const added = [];
  for (const p of c.places) {
    const keys = [p.name, p.en, p.ja].map(cityPlaceKey).filter(Boolean);
    if (keys.some((k) => taken.has(k))) continue;
    keys.forEach((k) => taken.add(k));
    const { media, ...extra } = p;
    EXTRA_PLACES.push(extra);
    added.push(extra);
  }
  for (const p of added) {
    if ((city.highlights || []).length >= 3) break;
    if (p.fullDay || p.dayTrip) continue;
    city.highlights.push({ name: p.name, area: p.area, category: p.category, stayMin: p.stayMin, bestTime: p.bestTime, crowdScore: 2, generated: true });
  }
}

// 도시 주변 실제 명소(generated)의 '<cityKey>|<이름 키>'. 도시 명소로 올라간 것도 같은 이름이다.
// 규칙 일정은 이 장소를 요청하지 않았으면 큐레이션 명소(도시 명소·대표 명소·추가 명소)를 다 쓴 뒤에만 쓴다(createItinerary).
const GENERATED_PLACE_KEYS = new Set(EXTRA_PLACES.filter((e) => e.generated).map((e) => `${e.cityKey}|${placeNameKey(e.name)}`));
function isGeneratedCityPlace(p, fallbackCityKey) {
  const ck = cityKeyByLabel(p?.city) || fallbackCityKey;
  return Boolean(ck) && GENERATED_PLACE_KEYS.has(`${ck}|${placeNameKey(placeOriginalName(p))}`);
}

// 도시 주변 반나절 명소가 적은 도시인지(few) — 일정 팁으로 알린다
function cityHasFewSights(cityKey) {
  return Boolean(CITY_PLACES.cities.get(String(cityKey || ''))?.few);
}

// 도시 주변 실제 명소(generated)의 이름 중 말로 한 장소 찾기에 쓰는 이름. 다른 도시의 대표·큐레이션 명소나 도시 이름과 같은 이름
// (구시로의 'Itsukushima Shrine', 쇼나이의 '松山城'·'Matsuyama Castle' = 마쓰야마 도시 명소의 en/ja 이름), 서로 다른 두 곳 이상에 같은
// 이름이 있는 것, 두 글자 이하('城山')·한 단어 로마자 6자 미만('Toro')은 뺀다
// → 'Hiroshima 2 days, must see Itsukushima Shrine'이 구시로로, 'toro sushi'가 시즈오카 토로 유적으로 가지 않는다.
// 같은 위키데이터 항목이 이웃한 두 도시에 함께 있으면(삿포로·삿포로 오카다마의 나카지마 공원) 한 곳으로 센다(cityOfNamedPlace가 고른다).
let GENERATED_MATCH_NAMES = null;
function generatedMatchNames(e) {
  if (!GENERATED_MATCH_NAMES) {
    const owners = new Map(); // 이름 키 → Set(cityKey)
    const add = (label, owner) => { const k = cityPlaceKey(label); if (!k) return; if (!owners.has(k)) owners.set(k, new Set()); owners.get(k).add(owner); };
    // 큐레이션 명소의 사진 데이터 en/ja 이름(place-images.json labels)도 그 도시의 이름이다.
    // 다만 같은 위키데이터 항목인 다른 도시의 도시 주변 실제 명소에는 '다른 장소'가 아니다(사진 이름 주인에 항목을 함께 적는다):
    // 시모지시마 '이라부 대교'의 'Irabu Bridge'·'伊良部大橋'가 미야코지마의 이라부 대교를, 삿포로 'TV 타워'의 'さっぽろテレビ塔'가
    // 오카다마의 TV 타워를 말로 찾기에서 빼면 'Irabu Bridge 2 days'가 도시를 못 찾아 폼 도시(도쿄)로 간다(2026-10-03).
    // 한글 이름·별칭이 같은 경우는 예전처럼 뺀다(같은 곳이 두 이름으로 두 번 잡히지 않게).
    const mediaOwners = new Map(); // 이름 키 → [{ ck, qid }]
    const addMediaLabels = (ck, name) => {
      const m = placeMediaFor(ck, name);
      if (!m || !m.labels) return;
      for (const l of [m.labels.en, m.labels.ja]) {
        const k = cityPlaceKey(l);
        if (!k) continue;
        if (!mediaOwners.has(k)) mediaOwners.set(k, []);
        mediaOwners.get(k).push({ ck, qid: m.wikidata || '' });
      }
    };
    for (const m of MUST_ATTRACTIONS) {
      [m.name, ...(m.aliases || []), ...(m.contextAliases || [])].forEach((a) => add(a, m.cityKey));
      addMediaLabels(m.cityKey, m.name);
    }
    for (const [ck, c] of Object.entries(CITY_DATA)) {
      for (const h of c.highlights || []) {
        if (h.generated) continue;
        add(h.name, ck);
        addMediaLabels(ck, h.name);
      }
      for (const a of CITY_ALIASES[ck] || []) add(a, ck);
    }
    for (const x of EXTRA_PLACES) if (!x.generated) [x.name, x.en, x.ja, ...(x.aliases || [])].forEach((a) => add(a, x.cityKey));
    const genPlaces = new Map(); // 이름 키 → Set(위키데이터 ID, 없으면 도시) — 서로 다른 장소 수
    for (const x of EXTRA_PLACES) {
      if (!x.generated) continue;
      for (const k of new Set([x.name, x.en, x.ja, ...(x.aliases || [])].filter(Boolean).map(cityPlaceKey))) {
        if (!genPlaces.has(k)) genPlaces.set(k, new Set());
        genPlaces.get(k).add(x.wikidata || `city:${x.cityKey}`);
      }
    }
    GENERATED_MATCH_NAMES = new Map();
    for (const x of EXTRA_PLACES) {
      if (!x.generated) continue;
      GENERATED_MATCH_NAMES.set(x, [x.name, x.en, x.ja, ...(x.aliases || [])].filter(Boolean).filter((l) => {
        const k = cityPlaceKey(l);
        const t = String(l).trim();
        // 두 글자 이하는 흔한 이름('城山')이라 빼되, 두 글자 한자·가나 이름('端島')은 낱말 하나로 쓰였을 때만 찾는다(extraPlaceHits)
        if (!k || (k.length <= 2 && !SHORT_CJK_NAME_RE.test(t))) return false;
        if (/^[a-z0-9'-]+$/i.test(t) && t.length < 6) return false;
        if ([...(owners.get(k) || [])].some((ck) => ck !== x.cityKey)) return false;
        if ((mediaOwners.get(k) || []).some((o) => o.ck !== x.cityKey && !(o.qid && o.qid === x.wikidata))) return false;
        return (genPlaces.get(k)?.size || 0) <= 1;
      }));
    }
  }
  return GENERATED_MATCH_NAMES.get(e) || [];
}

// 추가 명소의 '말로 찾기' 이름: 큐레이션 추가 명소는 이름·en/ja·별칭, 도시 주변 실제 명소는 generatedMatchNames
function extraPlaceMatchLabels(e) {
  return e.generated ? generatedMatchNames(e) : [e.name, e.en, e.ja, ...(e.aliases || [])].filter(Boolean);
}

const CONTEXT_ALIAS_TAIL_SRC = '(?=\\s*(?:で|に|へ|から|まで|を|は|の旅|旅行|観光|\\d|一|二|三|에서|에|로|으로|은|는|여행|관광|당일|for\\b|trip\\b|day\\b|,|、|。|!|\\?|$))';
const SHORT_CJK_NAME_RE = /^[぀-ヿ一-鿿]{2}$/;
const CONTEXT_TAIL_RE = new RegExp(`^${CONTEXT_ALIAS_TAIL_SRC.replace(/^\(\?=/, '(?:')}`, 'i');

// 글 속 추가 명소 언급 [{ place, idx, len, label }]: 더 긴 이름 안에 든 짧은 이름('Hokkaido Museum' ⊂ 'Hokkaido Museum of Northern Peoples')은 뺀다
function extraPlaceHits(text) {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return [];
  const hits = [];
  for (const e of EXTRA_PLACES) {
    for (const label of extraPlaceMatchLabels(e)) {
      const t = String(label).trim();
      const len = t.length;
      const short = e.generated && SHORT_CJK_NAME_RE.test(t);
      for (const idx of aliasHitPositions(lower, label)) {
        // 두 글자 한자 이름('端島')은 앞에 한자·가나가 붙지 않고 뒤에 조사·일수가 올 때만('端島 2日間', '端島に行きたい')
        if (short && (/[぀-ヿ一-鿿]/.test(lower[idx - 1] || '') || !CONTEXT_TAIL_RE.test(lower.slice(idx + len)))) continue;
        hits.push({ place: e, idx, len, label });
      }
    }
  }
  hits.sort((a, b) => (b.len - a.len) || (a.idx - b.idx));
  const kept = [];
  for (const h of hits) {
    if (kept.some((k) => k.len > h.len && h.idx < k.idx + k.len && k.idx < h.idx + h.len && k.place !== h.place)) continue;
    if (kept.some((k) => k.place === h.place)) continue;
    kept.push(h);
  }
  return kept.sort((a, b) => a.idx - b.idx);
}

// 별칭·이름·en/ja 이름이 글 속에 있는 추가 명소(EXTRA_PLACES). preferredCityKeys 도시의 것을 앞에 둔다.
function matchExtraPlaces(text, preferredCityKeys = []) {
  const prefer = new Set((preferredCityKeys || []).filter(Boolean));
  return extraPlaceHits(text).map((h) => h.place)
    .sort((a, b) => Number(prefer.has(b.cityKey)) - Number(prefer.has(a.cityKey)));
}

// 위키데이터 항목 → 그 항목이 큐레이션 명소(대표 명소·도시 명소·추가 명소, 사진 데이터의 항목)로 든 도시 키들
let CURATED_QID_CITIES = null;
function curatedCityKeysOfQid(qid) {
  if (!CURATED_QID_CITIES) {
    CURATED_QID_CITIES = new Map();
    const add = (ck, name) => {
      const q = PLACE_IMAGES.byKey.get(`${ck}|${String(name || '').trim()}`)?.wikidata;
      if (!q || !CITY_DATA[ck]) return;
      if (!CURATED_QID_CITIES.has(q)) CURATED_QID_CITIES.set(q, new Set());
      CURATED_QID_CITIES.get(q).add(ck);
    };
    for (const m of MUST_ATTRACTIONS) add(m.cityKey, m.name);
    for (const [ck, c] of Object.entries(CITY_DATA)) for (const h of c.highlights || []) if (!h.generated) add(ck, h.name);
    for (const x of EXTRA_PLACES) if (!x.generated) add(x.cityKey, x.name);
  }
  return [...(CURATED_QID_CITIES.get(qid) || [])];
}

// 도시 없이 장소 이름만 말한 글('다케토미섬 2일', 'Hashima Island 2 days')의 도시: 그 장소(추가 명소·도시 주변 실제 명소)의 도시.
// 세 글자 이상 이름만 보고, 가장 긴 이름이 여러 도시에 걸치면 정하지 않는다. 다만 이웃한 두 도시에 함께 든 같은 위키데이터 항목
// (삿포로·삿포로 오카다마의 나카지마 공원)은 한 곳이라 도시 중심이 더 가까운 도시로 정한다.
// 도시 주변 실제 명소가 다른 도시의 큐레이션 명소와 같은 항목이면(오카다마의 'さっぽろテレビ塔' = 삿포로 TV 타워, 삿포로의
// 'Moerenuma Park' = 오카다마 모에레누마 공원, 미야코지마의 'Irabu Bridge' = 시모지시마 이라부 대교) 그 도시도 함께 견준다.
// 도시 중심이 아주 가까운 두 도시(삿포로·삿포로 오카다마 2.4km, SAME_AREA_CITY_KM 안)는 사실상 한 도시라 거리 대신 큰 도시
// (큐레이션 명소가 많은 쪽 = 삿포로, 국제선 CTS)로 정한다: 아쓰베쓰구의 홋카이도 박물관·홋카이도 역사 마을은 오카다마 중심이 1.4km
// 더 가까워 'I want to visit Hokkaido Museum'이 오카다마(국내선만 있는 OKD) 일정이 됐다(2026-10-03). 오카다마는 '오카다마/丘珠'라고
// 말했을 때만 고른다(그때는 말한 도시가 있어 여기까지 오지 않는다). 미야코지마·시모지시마(13.9km)는 섬이 달라 예전처럼 가까운 쪽이다.
const SAME_AREA_CITY_KM = 5;
function curatedPlaceCountOf(cityKey) {
  const c = CITY_DATA[cityKey];
  if (!c) return 0;
  return (c.highlights || []).filter((h) => !h.generated).length + MUST_ATTRACTIONS.filter((m) => m.cityKey === cityKey).length
    + EXTRA_PLACES.filter((e) => e.cityKey === cityKey && !e.generated).length;
}
function cityOfNamedPlace(text) {
  const hits = extraPlaceHits(text).filter((h) => h.len >= 3 || SHORT_CJK_NAME_RE.test(String(h.label).trim()));
  if (!hits.length) return '';
  const longest = Math.max(...hits.map((h) => h.len));
  const top = hits.filter((h) => h.len === longest);
  const cities = new Set(top.map((h) => h.place.cityKey));
  const qids = new Set(top.map((h) => h.place.wikidata || ''));
  const p = top[0].place;
  if (qids.size === 1 && p.generated && p.wikidata) curatedCityKeysOfQid(p.wikidata).forEach((ck) => cities.add(ck));
  if (cities.size === 1) return [...cities][0];
  if (qids.size !== 1 || !p.wikidata || !hasLatLng(p)) return '';
  const dist = (ck) => { const c = resolveCityCenter(ck); return c ? haversineKm(c, p) : Infinity; };
  const byDist = [...cities].sort((a, b) => dist(a) - dist(b));
  const nearest = byDist[0] || '';
  const nearestCenter = nearest ? resolveCityCenter(nearest) : null;
  if (!nearestCenter) return nearest;
  // 가장 가까운 도시와 중심이 SAME_AREA_CITY_KM 안인 도시 중 큐레이션 명소가 많은 도시(같으면 가까운 쪽)
  const sameArea = byDist.filter((ck) => { const c = resolveCityCenter(ck); return c && haversineKm(c, nearestCenter) <= SAME_AREA_CITY_KM; });
  return sameArea.sort((a, b) => curatedPlaceCountOf(b) - curatedPlaceCountOf(a))[0] || nearest;
}

// 장소 이름 속 다른 도시 이름·랜드마크는 도시로 보지 않도록 지운 글('Matsumoto Seicho Memorial Museum'(기타큐슈)의 'Matsumoto',
// '홋카이도립 오비히로 미술관'의 '홋카이도'(삿포로), '하나마키 기요미즈데라'의 '기요미즈'(교토)). 그 장소 도시의 이름은 남긴다.
function maskOtherCityPlaceNames(text) {
  const raw = String(text || '');
  const cityHits = cityMentionHits(raw, { landmarks: true });
  let out = raw;
  for (const h of extraPlaceHits(raw)) {
    for (const c of cityHits) {
      if (c.key === h.place.cityKey || c.len >= h.len || c.idx < h.idx || c.idx + c.len > h.idx + h.len) continue;
      out = out.slice(0, c.idx) + ' '.repeat(c.len) + out.slice(c.idx + c.len);
    }
  }
  return out;
}

// 도시 주변 실제 명소 이름 속에 든 다른 도시 대표 명소 별칭은 그 명소로 보지 않도록 지운 글
// ('구시로 이쓰쿠시마 신사'의 '이쓰쿠시마 신사'(히로시마), '하나마키 기요미즈데라'의 '기요미즈데라'(교토))
function maskMustInsidePlaceNames(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  let out = raw;
  for (const h of extraPlaceHits(raw)) {
    if (!h.place.generated) continue;
    const inside = MUST_ATTRACTIONS.some((m) => m.cityKey !== h.place.cityKey && (m.aliases || []).some((a) => {
      const al = String(a).toLowerCase();
      return al.length < h.len && aliasHitPositions(lower, al).some((i) => i >= h.idx && i + al.length <= h.idx + h.len);
    }));
    if (inside) out = out.slice(0, h.idx) + ' '.repeat(h.len) + out.slice(h.idx + h.len);
  }
  return out;
}

// 장소 이름(대표 명소·추가 명소·도시 주변 실제 명소)의 도시 키. 모르면 ''.
function placeCityKeyOf(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const must = MUST_ATTRACTIONS.find((m) => m.name === n);
  if (must) return must.cityKey;
  return extraPlaceByName(n)?.cityKey || '';
}

// 이름·별칭·en/ja 이름이 정확히 같은 추가 명소(대소문자·공백 무시).
// preferCityKeys(도시 키 하나나 배열)를 주면 그 도시의 것을 먼저 찾는다: 같은 장소가 이웃한 두 도시에 함께 든 경우
// (삿포로·삿포로 오카다마의 나카지마 공원) 파일 순서상 앞 도시(오카다마)가 아니라 지금 일정의 도시(삿포로) 것을 쓴다.
function extraPlaceByName(name, preferCityKeys) {
  const k = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (!k) return null;
  const same = (e) => [e.name, e.en, e.ja, ...(e.aliases || [])].some((a) => a && String(a).toLowerCase().replace(/\s+/g, '') === k);
  for (const ck of (Array.isArray(preferCityKeys) ? preferCityKeys : [preferCityKeys]).filter(Boolean)) {
    const hit = EXTRA_PLACES.find((e) => e.cityKey === ck && same(e));
    if (hit) return hit;
  }
  return EXTRA_PLACES.find(same) || null;
}

// 별칭이 글 속에 '단어로' 있는지: 로마자 별칭은 단어 경계, 두 글자 이하 한글 별칭('나라')은 앞에 한글이 붙지 않을 때만
// ('우리나라'·'also'(aso) 같은 오탐 방지). 그 밖의 별칭은 포함 여부만 본다.
function aliasInText(lowerText, alias) {
  const a = String(alias || '').toLowerCase().trim();
  if (!a) return false;
  if (/^[a-z0-9 .'-]+$/.test(a)) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${esc}(?![a-z0-9])`).test(lowerText);
  }
  if (/^[가-힣]{1,2}$/.test(a)) return new RegExp(`(^|[^가-힣])${a}`).test(lowerText);
  return lowerText.includes(a);
}

// 다른 낱말에도 들어 있는 짧은 이름('高山'·'日光'·'이세'·'ise')이 낱말 하나로 쓰였는지: 앞은 같은 글자가 붙지 않고,
// 뒤에 조사·'여행/観光'·숫자(일수)·문장 부호가 온다. '高山で2日間'·'이세 2일'·'Ise 2 days'는 맞고 '高山病'·'이세탄'·'日光浴'은 아니다.
function contextAliasInText(lowerText, alias) {
  const a = String(alias || '').toLowerCase().trim();
  if (!a) return false;
  const head = /^[가-힣]/.test(a) ? '(?:^|[^가-힣])' : (/^[a-z]/.test(a) ? '(?:^|[^a-z0-9])' : '(?:^|[^぀-ヿ一-鿿])');
  return new RegExp(`${head}${escapeRegExp(a)}${CONTEXT_ALIAS_TAIL_SRC}`, 'i').test(String(lowerText || '').toLowerCase());
}
// 대표 명소 이름·별칭(contextAliases 포함)과 정확히 같은 낱말인지
function mustNameEquals(item, lowerToken) {
  const t = String(lowerToken || '').toLowerCase().trim();
  return Boolean(t) && (item.name.toLowerCase() === t || [...(item.aliases || []), ...(item.contextAliases || [])].some((a) => String(a).toLowerCase() === t));
}

function matchMustAttractions(text) {
  const lower = String(text || '').toLowerCase();
  const hits = [];
  for (const item of MUST_ATTRACTIONS) {
    if (item.aliases.some((a) => aliasInText(lower, a)) || (item.contextAliases || []).some((a) => contextAliasInText(lower, a))) {
      hits.push(item);
    }
  }
  return hits;
}

// 하루 전체가 드는 장소인지: 'fullDay'(테마파크·긴 트레킹) | 'dayTrip'(먼 당일치기) | ''.
// 카드·후보의 표시 → 대표 명소(MUST_ATTRACTIONS, 이름·별칭) → 도시 명소(highlights) 순으로 본다.
// 화면에서 돌아온 en/ja 이름(예: 'Tokyo Disneyland', '東京ディズニーランド')도 원래 한글 이름으로 바꿔 찾는다.
function allDayPlaceKind(place, cityKey) {
  if (!place) return '';
  if (place.fullDay) return 'fullDay';
  if (place.dayTrip) return 'dayTrip';
  const ck = cityKeyByLabel(place.city) || cityKey || '';
  const raw = String(place.nameKo || place.name || '').trim();
  if (!raw) return '';
  const ko = /[가-힣]/.test(raw) ? raw : (koPlaceNameForLabel(raw, ck) || raw);
  const lower = ko.toLowerCase();
  const must = MUST_ATTRACTIONS.find((m) => m.name === ko || (m.aliases || []).some((a) => String(a).toLowerCase() === lower));
  const hl = (CITY_DATA[ck]?.highlights || []).find((h) => h.name === ko);
  const hit = [must, hl].find((x) => x && (x.fullDay || x.dayTrip));
  // 화면이 보낸 카드는 fullDay/dayTrip 표시를 빼고 머무는 시간만 남긴다: 6시간 이상이면 하루짜리(예: "오타루 당일치기")
  if (!hit) return Number(place.stayMin) >= 360 ? 'dayTrip' : '';
  return hit.fullDay ? 'fullDay' : 'dayTrip';
}

const JAPAN_AIRPORT_COORDS = [
  { code: 'NRT', lat: 35.772, lng: 140.392 },
  { code: 'HND', lat: 35.549, lng: 139.779 },
  { code: 'KIX', lat: 34.434, lng: 135.244 },
  { code: 'ITM', lat: 34.785, lng: 135.438 },
  { code: 'CTS', lat: 42.775, lng: 141.692 },
  { code: 'HKD', lat: 41.770, lng: 140.822 },
  { code: 'AKJ', lat: 43.671, lng: 142.447 },
  { code: 'AOJ', lat: 40.734, lng: 140.691 },
  { code: 'AXT', lat: 39.615, lng: 140.218 },
  { code: 'HNA', lat: 39.428, lng: 141.135 },
  { code: 'GAJ', lat: 38.411, lng: 140.371 },
  { code: 'SDJ', lat: 38.139, lng: 140.917 },
  { code: 'FKS', lat: 37.227, lng: 140.431 },
  { code: 'KIJ', lat: 37.956, lng: 139.113 },
  { code: 'KMQ', lat: 36.394, lng: 136.407 },
  { code: 'TOY', lat: 36.648, lng: 137.188 },
  { code: 'FSZ', lat: 34.797, lng: 138.187 },
  { code: 'NGO', lat: 34.858, lng: 136.805 },
  { code: 'OKJ', lat: 34.756, lng: 133.855 },
  { code: 'HIJ', lat: 34.436, lng: 132.919 },
  { code: 'YGJ', lat: 35.492, lng: 133.236 },
  { code: 'IZO', lat: 35.414, lng: 132.889 },
  { code: 'TAK', lat: 34.214, lng: 134.016 },
  { code: 'MYJ', lat: 33.827, lng: 132.700 },
  { code: 'KCZ', lat: 33.547, lng: 133.675 },
  { code: 'TKS', lat: 34.132, lng: 134.607 },
  { code: 'FUK', lat: 33.585, lng: 130.451 },
  { code: 'NGS', lat: 32.916, lng: 129.914 },
  { code: 'KMJ', lat: 32.837, lng: 130.855 },
  { code: 'OIT', lat: 33.479, lng: 131.737 },
  { code: 'KMI', lat: 31.877, lng: 131.449 },
  { code: 'KOJ', lat: 31.803, lng: 130.719 },
  { code: 'OKA', lat: 26.196, lng: 127.646 },
  { code: 'MMY', lat: 24.782, lng: 125.295 },
  { code: 'ISG', lat: 24.396, lng: 124.246 },
  { code: 'KUM', lat: 30.386, lng: 130.658 },
  { code: 'ASJ', lat: 28.431, lng: 129.713 },
  { code: 'TNE', lat: 30.605, lng: 130.991 },
  { code: 'TTJ', lat: 35.530, lng: 134.167 },
  { code: 'UBJ', lat: 33.930, lng: 131.279 },
  { code: 'KKJ', lat: 33.845, lng: 131.035 },
  { code: 'HSG', lat: 33.150, lng: 130.302 }
];

for (const [key, city] of Object.entries(CITY_DATA)) {
  CITY_ALIASES[key] = Array.from(new Set([...(CITY_ALIASES[key] || []), key, city.label, ...(city.nameJa ? [city.nameJa] : [])]));
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

// 응답 상태 코드를 지정해 던지는 오류(본문 크기 초과 413, JSON 형식 오류 400 등)
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

const SUPABASE_TIMEOUT_MS = 8000;

// 키 헤더: 새 형식 키(sb_secret_… / sb_publishable_…)는 apikey 헤더로만 보낸다.
// Authorization: Bearer는 예전 JWT 키(eyJ…로 시작)일 때만 붙인다(Supabase 문서 기준).
function supabaseAuthHeaders() {
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY };
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  return headers;
}

function redactSupabaseKey(text) {
  const s = String(text || '');
  return SUPABASE_SERVICE_ROLE_KEY ? s.split(SUPABASE_SERVICE_ROLE_KEY).join('***') : s;
}

// PostgREST 호출. 실패하면 err.supabase = true(+ HTTP 상태는 err.status, PostgREST/Postgres 오류 코드는 err.pgCode)인 오류를 던진다.
// options.prefer: Prefer 헤더를 바꿀 때(POST 기본값은 return=representation,resolution=merge-duplicates)
// options.timeoutMs: 기본 8초
async function supabaseRequest(method, route, body, options = {}) {
  if (!hasSupabase()) {
    throw new Error('Supabase is not configured');
  }
  const headers = supabaseAuthHeaders();
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.prefer) {
    headers.Prefer = options.prefer;
  } else if (method === 'POST') {
    headers.Prefer = 'return=representation,resolution=merge-duplicates';
  }
  let response;
  try {
    response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${route}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    }, options.timeoutMs || SUPABASE_TIMEOUT_MS);
  } catch (err) {
    const e = new Error(`Supabase request failed: ${err?.cause?.code || err?.message || err}`);
    e.supabase = true;
    throw e;
  }
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    // 원문은 서버 로그에만 남는다(응답에는 일반 안내만 나감).
    const e = new Error(`Supabase error ${response.status}: ${redactSupabaseKey(text.slice(0, 300))}`);
    e.supabase = true;
    e.status = response.status;
    try {
      const code = JSON.parse(text)?.code;
      if (typeof code === 'string' && /^[A-Z0-9]{1,12}$/.test(code)) e.pgCode = code;
    } catch { /* JSON이 아닌 오류 본문 */ }
    throw e;
  }
  if (response.status === 204 || !text.trim()) return [];
  try {
    return JSON.parse(text);
  } catch {
    const e = new Error(`Supabase returned non-JSON (HTTP ${response.status})`);
    e.supabase = true;
    throw e;
  }
}

// ── Supabase 상태 ──
// 'ok' | 'auth_error'(401·403: 키가 틀렸거나 폐기됨) | 'schema_error'(404 등: travel_plans 표가 없음) | 'unreachable'(연결 실패·시간 초과·5xx·JSON 아님)
// 요청 내용 때문에 생긴 4xx(400·409·413·422 …)는 저장소 상태가 아니므로 null(상태를 바꾸지 않음).
function classifySupabaseError(err) {
  if (!err || !err.status || err.status >= 500) return 'unreachable';
  if (err.status === 401 || err.status === 403) return 'auth_error';
  if (err.status === 404) return 'schema_error';
  return null;
}

const SUPABASE_STATE_LOG = {
  auth_error: '[supabase] 키가 거부됐습니다(HTTP 401·403). SUPABASE_SERVICE_ROLE_KEY에 지금 쓰는 sb_secret_ 키(또는 service_role 키)를 넣었는지 확인하세요.',
  schema_error: '[supabase] travel_plans 표를 찾을 수 없습니다. deploy/supabase/schema.sql을 실행했는지 확인하세요.',
  unreachable: '[supabase] 저장소에 연결할 수 없습니다'
};

// 실제 조회(travel_plans?select=id&limit=1, 행 데이터는 쓰지 않음)로 주소·키·표를 한 번에 확인한다.
// /api/health의 연결 확인과 /api/keepalive가 함께 쓴다. 결과는 _supabaseProbe에도 기록한다.
async function runSupabaseCheck(label) {
  let state = 'unreachable';
  try {
    const rows = await supabaseRequest('GET', 'travel_plans?select=id&limit=1', undefined, { timeoutMs: 5000 });
    state = Array.isArray(rows) ? 'ok' : 'schema_error';
  } catch (err) {
    state = classifySupabaseError(err) || 'schema_error';
    warnThrottled(`supabase:${label}:${state}`, `${SUPABASE_STATE_LOG[state]} (${label}: ${redactSupabaseKey(err?.message || err)})`);
  }
  noteSupabaseState(state);
  return state;
}

// 연결 확인. 결과는 정상 5분·이상 1분 동안 재사용한다(force면 바로 다시 확인).
// 서버가 뜬 직후 한 번, 그 뒤 10분마다 확인해서 /api/health의 supabaseReachable이 처음부터 채워진다.
const _supabaseProbe = { at: 0, state: null, inflight: null };
async function supabaseStatus({ force = false } = {}) {
  if (!hasSupabase()) return { configured: false, reachable: false, state: null };
  const ttl = _supabaseProbe.state === 'ok' ? 5 * 60_000 : 60_000;
  if (!force && _supabaseProbe.at && (Date.now() - _supabaseProbe.at) < ttl) {
    return { configured: true, reachable: _supabaseProbe.state === 'ok', state: _supabaseProbe.state };
  }
  if (!_supabaseProbe.inflight) {
    _supabaseProbe.inflight = runSupabaseCheck('probe').finally(() => { _supabaseProbe.inflight = null; });
  }
  const state = await _supabaseProbe.inflight;
  return { configured: true, reachable: state === 'ok', state };
}

function noteSupabaseState(state) {
  if (!state) return;
  _supabaseProbe.at = Date.now();
  _supabaseProbe.state = state;
}

// 저장소 요청이 실패했을 때: 저장소 상태를 기록하고, 요청 내용 탓(4xx)인지 돌려준다.
function noteSupabaseFailure(err) {
  const state = classifySupabaseError(err);
  noteSupabaseState(state);
  return state === null ? 'content' : state;
}

// GET /api/keepalive: 실제로 가벼운 조회를 해서 무료 Supabase 프로젝트가 활동 없음으로 일시 중지되지 않게 한다.
// 성공은 10분, 실패는 15초 동안 재사용한다 → 성공하면 10분에 한 번만 조회하고, 실패하면 GitHub Actions의
// 다음 재시도(30초 뒤)가 실제로 다시 확인한다(실패 중에도 Supabase 호출은 분당 4번 이하).
const KEEPALIVE_CACHE_MS = 10 * 60_000;
const KEEPALIVE_FAIL_CACHE_MS = 15_000;
const _keepalive = { at: 0, result: null, checkedAt: null, inflight: null };
async function supabaseKeepalive() {
  if (!hasSupabase()) return { supabase: 'off', checkedAt: new Date().toISOString() };
  const ttl = _keepalive.result === 'ok' ? KEEPALIVE_CACHE_MS : KEEPALIVE_FAIL_CACHE_MS;
  if (_keepalive.at && (Date.now() - _keepalive.at) < ttl) {
    return { supabase: _keepalive.result, checkedAt: _keepalive.checkedAt };
  }
  if (!_keepalive.inflight) {
    _keepalive.inflight = (async () => {
      const state = await runSupabaseCheck('keepalive');
      _keepalive.at = Date.now();
      _keepalive.result = state;
      _keepalive.checkedAt = new Date(_keepalive.at).toISOString();
    })().finally(() => { _keepalive.inflight = null; });
  }
  await _keepalive.inflight;
  return { supabase: _keepalive.result, checkedAt: _keepalive.checkedAt };
}

// 저장소를 쓸 수 없을 때의 응답(503). 진행 전에 확인해서 AI·장소 검색 같은 비싼 작업을 돌리지 않는다.
async function supabaseUnavailableResponse(res) {
  const store = await supabaseStatus();
  if (!store.configured) {
    sendJson(res, 503, { error: '일정 저장소가 설정되어 있지 않습니다.', reasonCode: 'PROVIDER_UNAVAILABLE' });
    return true;
  }
  if (!store.reachable) {
    sendJson(res, 503, { error: '일정 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', reasonCode: 'PROVIDER_UNAVAILABLE' });
    return true;
  }
  return false;
}

// JSON 본문을 읽는다. 라우트마다 maxBytes(기본 64KB, 최대 500KB)를 넘으면 413.
function readBody(req, maxBytes = BODY_LIMIT_DEFAULT) {
  const limit = Math.min(Math.max(1024, Number(maxBytes) || BODY_LIMIT_DEFAULT), MAX_REQUEST_BODY_BYTES);
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new HttpError(413, 'Request body too large'));
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, 'Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      // 청크 경계에서 한글(멀티바이트)이 깨지지 않게 바이트를 모아서 한 번에 디코딩한다.
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) { resolve({}); return; }
      try { resolve(JSON.parse(text)); }
      catch { reject(new HttpError(400, 'Invalid JSON body')); }
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

// ── 글 속 도시 이름 찾기(공통) ──
// 도시 별칭(CITY_ALIASES: 키·한글·en·ja·표기 변형)과 랜드마크 낱말(LANDMARK_CITY_HINTS)이 글의 어디에 있는지 찾고,
// 더 긴 이름 안에 든 짧은 이름은 버린다: 'Kitakyushu'·'北九州' 안의 'kyushu'·'九州'(후쿠오카), '기타다이토' 안의 '이토'(시즈오카),
// '삿포로 오카다마' 안의 '삿포로'. 로마자 별칭은 단어 경계('saga' ≠ 'sagano'), 두 글자 이하 한글 별칭은 앞에 한글이 붙지 않을 때만
// ('우리나라'의 '나라'), '나하고'·'사가지고'처럼 흔한 말의 일부인 짧은 별칭은 그 꼬리가 붙으면 도시로 보지 않는다.
const SHORT_ALIAS_STOP_TAIL = { '나하': /^(?:고|구|한)/, '사가': /^(?:지고|지구|서|져|면|다|자|는데)/, '미토': /^(?:콘)/ };
function aliasHitPositions(lower, alias) {
  const a = String(alias || '').toLowerCase().trim();
  if (!a) return [];
  const out = [];
  const latin = /^[a-z0-9 .'-]+$/.test(a);
  const shortKo = /^[가-힣]{1,2}$/.test(a);
  const stopTail = SHORT_ALIAS_STOP_TAIL[a];
  let from = 0;
  while (from <= lower.length - a.length) {
    const idx = lower.indexOf(a, from);
    if (idx < 0) break;
    from = idx + 1;
    const before = idx > 0 ? lower[idx - 1] : '';
    const after = lower.slice(idx + a.length);
    if (latin && (/[a-z0-9]/.test(before) || /^[a-z0-9]/.test(after))) continue;
    if (shortKo && /[가-힣]/.test(before)) continue;
    if (stopTail && stopTail.test(after)) continue;
    out.push(idx);
  }
  return out;
}

// 글 속 도시 언급 [{ key, idx, len, matched, src: 'alias'|'label'|'key'|'landmark' }] (위치 순).
// landmarks: 랜드마크 낱말도 찾는다. labelsOnly: 도시 한글 이름과 키만. 더 긴 언급과 겹치는 짧은 언급은 뺀다.
function cityMentionHits(text, opts = {}) {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return [];
  const entries = [];
  if (!opts.labelsOnly) for (const [key, aliases] of Object.entries(CITY_ALIASES)) for (const a of aliases || []) entries.push([key, String(a), 'alias']);
  for (const [key, city] of Object.entries(CITY_DATA)) {
    if (city?.label) entries.push([key, String(city.label), 'label']);
    entries.push([key, key, 'key']);
    if (key.includes('_')) { entries.push([key, key.replace(/_/g, ' '), 'key']); entries.push([key, key.replace(/_/g, '-'), 'key']); }
  }
  if (opts.landmarks) for (const [key, words] of Object.entries(LANDMARK_CITY_HINTS)) for (const w of words) entries.push([key, String(w), 'landmark']);
  const hits = [];
  const seen = new Set();
  for (const [key, alias, src] of entries) {
    const len = alias.trim().length;
    for (const idx of aliasHitPositions(lower, alias)) {
      const id = `${key}|${idx}|${len}`;
      if (seen.has(id)) continue;
      seen.add(id);
      hits.push({ key, idx, len, matched: alias, src });
    }
  }
  // 긴 언급부터 남기고, 이미 남긴 더 긴 언급과 겹치는 짧은 언급(다른 도시)은 버린다
  hits.sort((a, b) => (b.len - a.len) || (a.idx - b.idx));
  const kept = [];
  for (const h of hits) {
    const overlap = kept.some((k) => k.len > h.len && h.idx < k.idx + k.len && k.idx < h.idx + h.len && k.key !== h.key);
    if (!overlap) kept.push(h);
  }
  return kept.sort((a, b) => (a.idx - b.idx) || (b.len - a.len));
}

// 도시 키 차례(예전 규칙 그대로: CITY_ALIASES에 먼저 적힌 도시가 먼저) 중 글에 나온 첫 도시
function firstCityKeyInOrder(hits) {
  const keys = new Set(hits.map((h) => h.key));
  for (const key of [...Object.keys(CITY_ALIASES), ...Object.keys(CITY_DATA)]) if (keys.has(key)) return key;
  return '';
}

function cityKeyByInput(input) {
  const raw = String(input || '').toLowerCase().trim();
  if (!raw) return 'tokyo';
  if (CITY_DATA[raw]) return raw;
  return firstCityKeyInOrder(cityMentionHits(raw)) || 'tokyo';
}

function detectCityKeyByInput(input) {
  const raw = String(input || '').toLowerCase().trim();
  if (!raw) return '';
  if (CITY_DATA[raw]) return raw;
  return firstCityKeyInOrder(cityMentionHits(raw));
}

// 랜드마크 낱말('도톤보리', '하카타')로 정한 도시. 도시 이름 안에 든 낱말('기타다이토'의 '이토')은 세지 않는다.
function cityKeyFromLandmark(text) {
  const landmarkKeys = new Set(cityMentionHits(text, { landmarks: true }).filter((h) => h.src === 'landmark').map((h) => h.key));
  for (const cityKey of Object.keys(LANDMARK_CITY_HINTS)) if (landmarkKeys.has(cityKey)) return cityKey;
  return '';
}

function detectAllCityKeysFromText(text) {
  const hits = cityMentionHits(text, { landmarks: true });
  const found = new Set();
  const cityKeys = new Set(hits.filter((h) => h.src !== 'landmark').map((h) => h.key));
  for (const key of [...Object.keys(CITY_ALIASES), ...Object.keys(CITY_DATA)]) if (cityKeys.has(key)) found.add(key);
  const landmarkKeys = new Set(hits.filter((h) => h.src === 'landmark').map((h) => h.key));
  for (const key of Object.keys(LANDMARK_CITY_HINTS)) if (landmarkKeys.has(key)) found.add(key);
  return Array.from(found);
}

function cityKeyByAirport(airportCode) {
  const code = String(airportCode || '').toUpperCase().trim();
  if (!code) return '';
  for (const [key, city] of Object.entries(CITY_DATA)) {
    if (String(city.airport || '').toUpperCase() === code) return key;
  }
  return '';
}

function detectMentionedCityKeysOrdered(text) {
  const out = [];
  for (const h of cityMentionHits(text)) if (!out.includes(h.key)) out.push(h.key);
  return out;
}

function detectCityMentionsDetailed(text) {
  const out = [];
  const seen = new Set();
  for (const h of cityMentionHits(text)) {
    if (seen.has(h.key)) continue;
    seen.add(h.key);
    out.push({ key: h.key, idx: h.idx, matched: h.matched });
  }
  return out;
}

function detectMentionedCityKeysByLabels(text) {
  const keys = new Set(cityMentionHits(text, { labelsOnly: true }).map((h) => h.key));
  return Object.keys(CITY_DATA).filter((k) => keys.has(k));
}

function toCustomCityKey(label) {
  const raw = String(label || '').trim();
  if (!raw) return '';
  const hex = Array.from(raw).map((ch) => ch.charCodeAt(0).toString(16)).join('');
  return `custom_${hex.slice(0, 40)}`;
}

function findNearestAirportCode(lat, lng, fallbackCode = 'NRT') {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallbackCode;
  let best = { code: fallbackCode, dist: Number.POSITIVE_INFINITY };
  for (const ap of JAPAN_AIRPORT_COORDS) {
    const dist = haversineKm({ lat, lng }, { lat: ap.lat, lng: ap.lng });
    if (dist < best.dist) best = { code: ap.code, dist };
  }
  return best.code;
}

function extractRequestedLocality(text) {
  const raw = String(text || '');
  if (!raw) return '';
  const skip = new Set([
    '일본', '여행', '숙소', '공항', '맛집', '음식', '온천', '쇼핑', '일정', '관광', '동선', '이동', '휴식', '추천',
    '예산', '가성비', '실내', '수족관', '기준', '지역', '중심', '위주', '하루', '기간', '좋은', '동네'
  ]);
  const nested = raw.match(/의\s*([가-힣A-Za-z]{2,20}?)(?=라는|에서|으로|근처|쪽|\s|$)/);
  if (nested && nested[1]) {
    const token = nested[1].trim();
    if (!skip.has(token)) {
      const isKnown = Boolean(detectCityKeyByInput(token) || LOCALITY_PARENT_CITY_MAP[token] || cityKeyFromLandmark(token));
      if (isKnown) return token;
    }
  }
  const matches = raw.match(/([가-힣A-Za-z]{2,20})(?:의|에서|으로|근처|쪽)/g) || [];
  for (const m of matches) {
    const token = m.replace(/(?:의|에서|으로|근처|쪽)$/, '').trim();
    if (!token || skip.has(token)) continue;
    const isKnown = Boolean(detectCityKeyByInput(token) || LOCALITY_PARENT_CITY_MAP[token] || cityKeyFromLandmark(token));
    if (!isKnown) continue;
    return token;
  }
  return '';
}

async function geocodeCityInJapan(cityLabel) {
  // google 모드: Geocoding API(비용 가드 적용). free 모드: open-meteo 무료 지오코딩.
  if (GOOGLE_PLACES_ENABLED) {
    try {
      const first = await googleGeocodeFirst(`${cityLabel} Japan`, 'ko');
      if (first) return { label: cityLabel, lat: first.lat, lng: first.lng, formatted: first.formatted || cityLabel };
    } catch {
      // 원인은 googleApiFetch가 로그로 남긴다. 아래 무료 지오코딩으로 넘어간다.
    }
  }
  const free = await geocodeWithOpenMeteo(cityLabel, 'ko');
  return free ? { label: cityLabel, lat: free.lat, lng: free.lng, formatted: free.name || cityLabel } : null;
}

async function ensureDynamicCityProfile(cityLabel, theme = 'mixed', budget = 'mid', foodKeyword = '', fallbackAirport = 'NRT', lang = 'ko') {
  const geocoded = await geocodeCityInJapan(cityLabel);
  const key = toCustomCityKey(cityLabel);
  const airportCode = geocoded
    ? findNearestAirportCode(geocoded.lat, geocoded.lng, fallbackAirport || 'NRT')
    : (fallbackAirport || 'NRT');
  let highlights = [];
  let foods = [];
  try {
    const places = GOOGLE_PLACES_ENABLED
      ? await fetchGoogleAttractions(cityLabel, theme, lang, geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : null)
      : [];
    highlights = (places || []).slice(0, 10).map((p) => ({
      name: p.displayName?.text || '추천 명소',
      area: localizeAddress(p.formattedAddress, cityLabel, lang),
      category: localizeType(p.primaryType, lang) || ({ko:'관광',en:'Attraction',ja:'観光'}[lang]||'관광'),
      stayMin: 90,
      bestTime: inferBestTime(p),
      crowdScore: 3,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null
    }));
  } catch {
    highlights = [];
  }
  try {
    if (GOOGLE_PLACES_ENABLED) {
      const places = await fetchFoodPlacesForCity(cityLabel, geocoded?.lat, geocoded?.lng, foodKeyword, budget, lang);
      foods = (places || []).slice(0, 10).map((f) => ({
        name: f.name,
        area: shortArea(f.address, cityLabel) || f.area || cityLabel,
        genre: f.genre || foodKeyword || '일식',
        priceLevel: Number(f.priceLevel || 3),
        score: Number(f.score || 3.8)
      }));
    }
  } catch {
    foods = [];
  }
  if (highlights.length === 0) {
    highlights = [
      { name: `${cityLabel} 중심가`, area: cityLabel, category: '도심 산책', stayMin: 80, bestTime: '10:00-12:00', crowdScore: 3 },
      { name: `${cityLabel} 대표 관광지`, area: cityLabel, category: '관광', stayMin: 100, bestTime: '13:00-15:00', crowdScore: 3 }
    ];
  }
  if (foods.length === 0) {
    foods = [
      { name: `${cityLabel} 로컬 맛집`, area: cityLabel, genre: foodKeyword || '일식', priceLevel: 2, score: 3.8 }
    ];
  }
  const profile = {
    label: cityLabel,
    airport: airportCode,
    areas: [cityLabel, `${cityLabel} 역`, `${cityLabel} 중심`],
    highlights,
    foods,
    center: geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : null,
    dynamic: true
  };
  CITY_DATA[key] = profile;
  CITY_ALIASES[key] = Array.from(new Set([key, cityLabel]));
  return { key, ...profile };
}

function formatDateISO(date) {
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
}

// 월·일이 맞는 날짜인지 보고, 오늘보다 이르면 다음 해 같은 날짜로 넘긴다. 날짜가 아니면 ''.
function upcomingMonthDay(month, day, now = new Date()) {
  const m = Number(month);
  const dd = Number(day);
  if (!Number.isInteger(m) || !Number.isInteger(dd) || m < 1 || m > 12 || dd < 1 || dd > 31) return '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = new Date(now.getFullYear(), m - 1, dd);
  if (d.getMonth() !== m - 1) return ''; // 2월 30일 같은 날짜
  if (d.getTime() < today.getTime()) d = new Date(now.getFullYear() + 1, m - 1, dd);
  return formatDateISO(d);
}

const EN_MONTH_INDEX = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};
const EN_MONTH_RE_SRC = '(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)';
// 날짜 표현(일수 계산 전에 지운다): N월 M일 / 10月15日 / Oct 15 / 15 Oct / M/D·M.D(뒤에 일·박·day가 붙지 않은 것)
const KO_MONTH_DAY_RE = /(\d{1,2})\s*[월月]\s*(\d{1,2})\s*[일日](?![간間])/;
const EN_MONTH_DAY_RE = new RegExp(`\\b${EN_MONTH_RE_SRC}\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:days?|nights?))`, 'i');
const EN_DAY_MONTH_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${EN_MONTH_RE_SRC}\\b`, 'i');
const NUMERIC_MONTH_DAY_RE = /(?<![\d.:])(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?![\d.:])(?!\s*(?:일|박|日|泊|days?|nights?|곳|개|시|時|살|명|인))/i;

function parseStartDateFromText(text) {
  const raw = String(text || '');
  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime()) && d.getMonth() === Number(iso[2]) - 1) return formatDateISO(d);
  }
  // "11월 20일", "10月15日" — 월만 있는 표현보다 먼저 본다
  const koMd = raw.match(KO_MONTH_DAY_RE);
  if (koMd) {
    const d = upcomingMonthDay(koMd[1], koMd[2]);
    if (d) return d;
  }
  const enMd = raw.match(EN_MONTH_DAY_RE);
  if (enMd) {
    const d = upcomingMonthDay(EN_MONTH_INDEX[enMd[1].toLowerCase()], enMd[2]);
    if (d) return d;
  }
  const enDm = raw.match(EN_DAY_MONTH_RE);
  if (enDm) {
    const d = upcomingMonthDay(EN_MONTH_INDEX[enDm[2].toLowerCase()], enDm[1]);
    if (d) return d;
  }
  // M/D, M-D, M.D: 뒤에 일·박·day 같은 단위가 붙으면 날짜가 아니라 일수 범위(예: "3-4일")다
  const md = raw.match(NUMERIC_MONTH_DAY_RE);
  if (md) {
    const d = upcomingMonthDay(md[1], md[2]);
    if (d) return d;
  }
  if (/크리스마스|christmas|クリスマス/i.test(raw)) {
    const d = upcomingMonthDay(12, 24);
    if (d) return d;
  }
  const monthOnly = raw.match(/(\d{1,2})\s*[월月](?:\s*(초|중|말))?/);
  if (monthOnly) {
    const now = new Date();
    let year = now.getFullYear();
    const month = clamp(Number(monthOnly[1]), 1, 12);
    const phase = monthOnly[2] || '';
    const day = phase === '초' ? 5 : phase === '중' ? 15 : phase === '말' ? 25 : 10;
    let d = new Date(year, month - 1, day);
    if (d.getTime() < now.getTime() - (1000 * 60 * 60 * 24 * 30)) {
      d = new Date(year + 1, month - 1, day);
    }
    if (!Number.isNaN(d.getTime())) return formatDateISO(d);
  }
  if (/내일|tomorrow|明日/i.test(raw)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatDateISO(d);
  }
  if (/모레|明後日/.test(raw)) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return formatDateISO(d);
  }
  return '';
}

function inferSeasonalStartDate(text, fallbackDate = '') {
  const raw = String(text || '');
  if (!raw) return fallbackDate || '';
  const explicit = parseStartDateFromText(raw);
  if (explicit) return explicit;
  if (/알펜루트/.test(raw) && /설벽/.test(raw)) {
    const now = new Date();
    let year = now.getFullYear();
    let d = new Date(year, 4, 10); // May 10
    if (d.getTime() < now.getTime() - (1000 * 60 * 60 * 24 * 30)) {
      d = new Date(year + 1, 4, 10);
    }
    return formatDateISO(d);
  }
  return fallbackDate || '';
}

// 일수 계산 전에 날짜(N월 M일·M/D·Oct 15)와 일차(N일차·N日目·day N) 표현을 지운다.
function stripDateAndDayNumberPhrases(text) {
  return String(text || '')
    .replace(new RegExp(KO_MONTH_DAY_RE.source, 'g'), ' ')
    .replace(new RegExp(EN_MONTH_DAY_RE.source, 'gi'), ' ')
    .replace(new RegExp(EN_DAY_MONTH_RE.source, 'gi'), ' ')
    .replace(new RegExp(NUMERIC_MONTH_DAY_RE.source, 'gi'), ' ')
    .replace(/(\d{1,2})\s*일\s*차/g, ' ')
    .replace(/(\d{1,2})\s*日目/g, ' ')
    .replace(/(?:첫|둘|셋|넷)째\s*날/g, ' ')
    // 'Day 2'는 일차지만 'Koyasan 1 day 2 days in Kyoto'의 'day 2'는 일차가 아니다(뒤에 일수 단위가 온다)
    .replace(/\bday\s*(\d{1,2})\b(?!\s*(?:days?|nights?)\b)/gi, ' ')
    .replace(/(\d{1,2})(?:st|nd|rd|th)\s+day\b/gi, ' ');
}

// 일수 증감 표현("하루 더 늘려줘", "이틀 줄여줘", "add one more day", "1日増やして")과 '1日2か所' 같은 하루 장소 수 표현.
// 여행 전체 일수가 아니라서 일수 계산 전에 지운다(후속 대화의 증감은 applyFollowUpRules가 따로 처리한다).
const EN_NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const JA_NUMBER_CHARS = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
const KO_DAY_WORDS = { '하루': 1, '이틀': 2, '사흘': 3, '나흘': 4, '닷새': 5, '엿새': 6 };
const PER_DAY_PLACES_JA_RE = /1\s*日\s*[1-5]\s*(?:か所|ヶ所|カ所|箇所|ヵ所)/;
// 하루 예산('予算は1日1万円', '예산 1일 5만원')도 여행 일수가 아니다
const PER_DAY_MONEY_RE = /(?<!\d)(?:1|一)\s*(?:日|일)\s*(?:あたり|当たり|につき|당|에)?\s*\d[\d,.]*\s*(?:万|만|千|천)?\s*(?:円|엔|원)/;
function stripDayDeltaPhrases(text) {
  return String(text || '')
    .replace(/(하루|이틀|사흘|나흘|\d{1,2}\s*일)\s*(?:만|정도|씩)?\s*(?:더\s*)?(?:늘|추가|연장|줄|빼|단축|덜)/g, ' ')
    .replace(/(하루|이틀|사흘|나흘|\d{1,2}\s*일)\s*더/g, ' ')
    .replace(/\b(?:add|extend(?:\s+(?:it|the\s+trip))?(?:\s+by)?|remove|cut|drop|shorten(?:\s+(?:it|the\s+trip))?(?:\s+by)?)\s+(?:(?:an?|one|two|three|\d{1,2})\s+)?(?:more\s+|extra\s+)?days?\b/gi, ' ')
    .replace(/\b(?:an?|one|two|three|\d{1,2})\s+(?:more|extra|less|fewer)\s+days?\b/gi, ' ')
    .replace(/(?:もう\s*)?[1-9一二三]\s*日\s*(?:増やし|追加|延長|伸ば|減らし|短く|短縮)/g, ' ')
    .replace(/もう\s*[1-9一二三]\s*日/g, ' ')
    .replace(new RegExp(PER_DAY_PLACES_JA_RE.source, 'g'), ' ')
    .replace(new RegExp(PER_DAY_MONEY_RE.source, 'g'), ' ');
}

// 메시지에 나온 여행 전체 일수(없으면 null). 'N박 M일'은 M, 범위('3-4일')는 큰 값, 'N박'만 있으면 N+1.
// 날짜('11월 20일')·일차('2일차') 표현과 일수 증감('하루 더')은 먼저 지워서 일수로 오인하지 않는다.
function parseExplicitDaysFromText(text) {
  const raw = stripDateAndDayNumberPhrases(stripDayDeltaPhrases(text));
  const pairKo = raw.match(/(\d{1,2})\s*[박泊]\s*(\d{1,2})\s*[일日]/);
  if (pairKo) return clamp(Number(pairKo[2]), 1, 10);
  const pairEn = raw.match(/(\d{1,2})\s*nights?\s*(?:and\s*|,\s*|\/\s*)?(\d{1,2})\s*days?/i);
  if (pairEn) return clamp(Number(pairEn[2]), 1, 10);
  const pairEn2 = raw.match(/(\d{1,2})\s*days?\s*(?:and\s*|,\s*|\/\s*)?(\d{1,2})\s*nights?/i);
  if (pairEn2) return clamp(Number(pairEn2[1]), 1, 10);
  const rangeDays = raw.match(/(\d{1,2})\s*[-~〜～]\s*(\d{1,2})\s*(?:일간|일|日間|日|days?)/i);
  if (rangeDays) return clamp(Math.max(Number(rangeDays[1]), Number(rangeDays[2])), 1, 10);
  const rangeNights = raw.match(/(\d{1,2})\s*[-~〜～]\s*(\d{1,2})\s*(?:박|泊|nights?)/i);
  if (rangeNights) return clamp(Math.max(Number(rangeNights[1]), Number(rangeNights[2])) + 1, 1, 10);
  const dayMatch = raw.match(/(\d{1,2})\s*(?:일간|일|日間|日|days?\b)/i);
  if (dayMatch) return clamp(Number(dayMatch[1]), 1, 10);
  const nightMatch = raw.match(/(\d{1,2})\s*(?:박|泊|nights?\b)/i);
  if (nightMatch) return clamp(Number(nightMatch[1]) + 1, 1, 10);
  // 낱말로 쓴 일수: "three days", "two nights", "三日間", "二泊" ("a day trip"·"一日中"·"二日目"은 일수가 아니다)
  const enWord = /\b(one|two|three|four|five|six|seven|eight|nine|ten)[\s-]+(days?|nights?)\b(?![\s-]*trip)/i.exec(raw);
  if (enWord) {
    const n = EN_NUMBER_WORDS[enWord[1].toLowerCase()];
    return clamp(/night/i.test(enWord[2]) ? n + 1 : n, 1, 10);
  }
  const jaWord = /([一二三四五六七八九十])\s*(日間|泊|日)(?![中目])/.exec(raw);
  if (jaWord) {
    const n = JA_NUMBER_CHARS[jaWord[1]];
    return clamp(jaWord[2] === '泊' ? n + 1 : n, 1, 10);
  }
  if (/일주일|1\s*주일|\ba\s+week\b|\bone\s+week\b|一週間/i.test(raw)) return 7;
  if (/(^|[^가-힣])닷새/.test(raw)) return 5;
  if (/(^|[^가-힣])이틀/.test(raw)) return 2;
  if (/(^|[^가-힣])사흘/.test(raw)) return 3;
  if (/(^|[^가-힣])나흘/.test(raw)) return 4;
  return null;
}

// 여행 전체 일수. 메시지에 없으면(일차 표현만 있어도) fallback.
function parseDaysFromText(text, fallback = 4) {
  const explicit = parseExplicitDaysFromText(text);
  return explicit !== null ? explicit : clamp(Number(fallback || 4), 1, 10);
}

// 낱말이 도시 이름·별칭과 정확히 같을 때만 그 도시 키('도톤보리' 같은 랜드마크는 도시가 아니다). 모르면 ''.
function exactCityKeyForToken(token) {
  const raw = String(token || '').trim().toLowerCase();
  if (!raw) return '';
  // '삿포로'처럼 '로'로 끝나는 도시가 있어서 조사를 떼기 전 낱말부터 본다.
  for (const t of Array.from(new Set([raw, raw.replace(/(에서|으로|로|은|는|에|쪽)$/, '')])).filter(Boolean)) {
    for (const [key, aliases] of Object.entries(CITY_ALIASES)) {
      if (key === t || (aliases || []).some((a) => String(a).toLowerCase() === t)) return CITY_DATA[key] ? key : '';
    }
    for (const [key, city] of Object.entries(CITY_DATA)) {
      if (String(city.label || '').toLowerCase() === t || String(city.label || '').toLowerCase() === t.replace(/시$/, '')) return key;
    }
  }
  return '';
}

// ── 부정 표현: "쇼핑은 빼줘", "디즈니랜드는 빼고", "no shopping" ──
const NEG_SHOPPING_RE = /(쇼핑|ショッピング|買い物)\s*(은|는|을|이|は|を)?\s*(빼|제외|말고|없이|안\s*해|안\s*할|なし|抜き|しない)|\bno\s+shopping\b|\bwithout\s+shopping\b|\bskip\s+(the\s+)?shopping\b/i;
// 'X 대신 Y'의 '대신'('대신에'·'대신해서'도). 장소 이름 '야마노우에 대신궁'(山上大神宮)·'야마구치 대신궁'의 '대신궁'만 빼서
// '야마노우에 대신 궁'으로 읽어 '궁'이라는 없는 장소를 넣지 않게 한다(2026-10-03). 데이터에서 '대신' 뒤에 글자가 붙는 이름은 '대신궁'뿐이다.
// 띄어 쓰지 않은 'X대신Y'('디즈니대신시부야'·'금각사대신은각사')는 그대로 'X 대신 Y'다(한글이 붙으면 모두 막아 X가 꼭 갈 곳이 되던 회귀).
// '해'는 뒤에 한글이 바로 붙으면 다음 이름의 첫 글자다('대신해유관' = 대신 + 해유관, '대신해서'·'대신해 Y'는 그대로).
// 바로 붙은 '에'는 보통 '대신에'지만 '에'로 시작하는 장소('대신에노시마')는 insteadGluedPlaceHead가 이름으로 돌려준다(2026-10-03 3차 검토).
const INSTEAD_WORD_SRC = '대신(?:에|해서|해(?![가-힣])|하여)?(?!궁)';
// 단어 바로 뒤에 붙는 부정 꼬리(조사 포함)
const NEGATION_TAIL_SRC = '\\s*(?:은|는|을|를|이|가|도|은요|는요|は|を|も)?\\s*(?:빼고|빼줘|빼 줘|빼주세요|빼|제외하고|제외|말고|없이|' + INSTEAD_WORD_SRC
  + '|안\\s*가|안\\s*갈|안\\s*해|skip|なし|抜きで|抜き|以外|の代わりに|には行かない|行かない)';
// 부정된 구절(앞 단어 + 부정 꼬리)과 영어 "no X / skip X / without X / except X".
// '랑/와/과/하고/및'으로 이어진 앞 낱말까지 함께 부정된다("기요미즈데라랑 쇼핑은 빼고" → 둘 다).
// (띄어쓰기가 없는 일본어의 と/や는 도시 이름까지 지울 수 있어 여기서는 쓰지 않는다. 이름 단위 판정 isNameNegatedIn은 と/や도 본다.)
const NEGATED_PHRASE_RE = new RegExp(`((?:[^\\s,.!?、。]+?(?:이랑|랑|와|과|하고|및)\\s+){0,3}[^\\s,.!?、。]+)${NEGATION_TAIL_SRC}`, 'g');
const EN_NEGATED_PHRASE_RE = /\b(?:no|without|skip|except|not|avoid)\s+(?:the\s+)?([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*)?)/gi;
// 이름 뒤에 '(랑|와|,) 다른 낱말'이 최대 3개 이어진 뒤 부정 꼬리가 오는 목록("금각사, 기요미즈데라는 빼고")
const NEG_LIST_CHAIN_SRC = '(?:\\s*(?:이랑|랑|와|과|하고|및|,|、|と|や)\\s*[^\\s,.!?、。]{1,24}?){0,3}';
function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// 소문자 글(lower)에서 이름(소문자)이 부정되었는지: 한·일 "X(랑 Y)는 빼고/なし", 영어 "skip X", "no A and X"
function isNameNegatedIn(lower, nameLower) {
  const a = String(nameLower || '').trim();
  if (a.length < 2 || !aliasInText(lower, a)) return false;
  const esc = escapeRegExp(a);
  const tail = /^[a-z0-9 .'’-]+$/.test(a) ? '(?![a-z0-9])' : '';
  if (new RegExp(`${esc}${tail}${NEG_LIST_CHAIN_SRC}${NEGATION_TAIL_SRC}`, 'i').test(lower)) return true;
  if (new RegExp(`\\b(?:no|without|skip|except|not|avoid|exclude)\\s+(?:the\\s+)?${esc}${tail}`, 'i').test(lower)) return true;
  return new RegExp(`\\b(?:no|without|skip|except|avoid|exclude)\\s+(?:the\\s+)?[a-z0-9'’ .-]{2,40}?\\s+(?:and|or|nor)\\s+(?:the\\s+)?${esc}${tail}`, 'i').test(lower);
}

// 로마자 장소 이름 속 일본어 조사 no('Nagori no Matsubara' = なごりの松原)는 영어 부정 "no X"가 아니다
let ROMAJI_NO_LABELS = null;
function romajiNoLabels() {
  if (!ROMAJI_NO_LABELS) {
    const set = new Set();
    // 장음 기호가 붙은 글자('Inō no Hi')도 로마자다
    const add = (l) => { const s = String(l || '').toLowerCase().trim(); if (/[a-z\u00e0-\u017f]\s+no\s+[a-z\u00e0-\u017f]/.test(s)) set.add(s); };
    for (const e of EXTRA_PLACES) [e.en, ...(e.aliases || [])].forEach(add);
    for (const m of MUST_ATTRACTIONS) (m.aliases || []).forEach(add);
    for (const v of Object.values(CURATED_PLACE_I18N)) add(v.en);
    ROMAJI_NO_LABELS = [...set];
  }
  return ROMAJI_NO_LABELS;
}
// 영어 부정 구절 [{ text, index }] — 그런 이름 속의 no로 시작하는 것은 뺀다
function enNegatedMatches(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const spans = /\bno\s/.test(lower) ? romajiNoLabels().flatMap((l) => aliasHitPositions(lower, l).map((i) => [i, i + l.length])) : [];
  return [...raw.matchAll(EN_NEGATED_PHRASE_RE)].filter((m) => !spans.some(([a, b]) => m.index > a && m.index < b)).map((m) => ({ text: m[0], index: m.index }));
}

// 'X대신에노시마'·'X대신에비스'처럼 '대신' 바로 뒤에 붙은 '에'가 데이터 속 장소·동네 이름('에노시마'·'에비스'·'에도성')의 첫 글자면 그 '에'.
// 부정 꼬리('대신에')가 그 글자를 먹어 '노시마'라는 없는 장소가 꼭 갈 곳이 되고 에노시마가 사라지던 회귀를 막는다(2026-10-03 3차 검토).
// 이름 목록은 처음 쓸 때 만든다(도시 안 동네 이름 CITY_AREA_WORDS가 이 아래에 있다). 띄어 쓴 '대신에 에노시마'·이름이 아닌 '대신에시부야'는 '대신에'다.
let INSTEAD_E_PLACE_NAMES = null;
function insteadGluedPlaceHead(matched, rest) {
  if (!/대신에$/.test(String(matched || '')) || !/^[가-힣]/.test(String(rest || ''))) return '';
  if (!INSTEAD_E_PLACE_NAMES) {
    const set = new Set();
    const add = (l) => { const s = String(l || '').replace(/\s+/g, ''); if (/^에[가-힣]{2,}/.test(s)) set.add(s); };
    for (const m of MUST_ATTRACTIONS) [m.name, ...(m.aliases || []), ...(m.contextAliases || [])].forEach(add);
    for (const e of EXTRA_PLACES) [e.name, ...(e.aliases || [])].forEach(add);
    for (const c of Object.values(CITY_DATA)) [c.label, ...(c.highlights || []).map((h) => h.name)].forEach(add);
    for (const list of [...Object.values(CITY_ALIASES), ...Object.values(LANDMARK_CITY_HINTS), ...Object.values(CITY_AREA_WORDS)]) (list || []).forEach(add);
    Object.keys(LOCALITY_PARENT_CITY_MAP).forEach(add);
    INSTEAD_E_PLACE_NAMES = [...set];
  }
  const w = `에${rest}`.replace(/\s+/g, '');
  return INSTEAD_E_PLACE_NAMES.some((n) => w.startsWith(n)) ? '에' : '';
}

function negatedPhrases(text) {
  const raw = String(text || '');
  const out = [];
  for (const m of raw.matchAll(NEGATED_PHRASE_RE)) {
    const head = insteadGluedPlaceHead(m[0], raw.slice(m.index + m[0].length));
    out.push(head ? m[0].slice(0, -head.length) : m[0]);
  }
  for (const m of enNegatedMatches(raw)) out.push(m.text);
  return out;
}

// 부정된 구절을 지운 글(테마·가고 싶은 곳 판정용)
// 띄어 쓰지 않은 '도시+일수+장소+부정'('오사카3일유니버설대신수족관'·'후쿠오카3일유후인대신벳푸')은 앞의 '도시+일수'를 남긴다:
// 통째로 지우면 도시를 잃어 다른 도시(폼의 도쿄, 장소의 오이타)로 바뀐다(띄어 쓴 '오사카3일 유니버설대신 수족관'과 같게, 2026-10-03).
// 남기는 것은 일수 앞이 비었거나 도시 이름이고('3일'·'오사카3일'·'大阪3日間') 일수 뒤에 부정된 장소 이름이 있을 때뿐이다.
// '디즈니1일은 빼줘'·'USJ1日抜きで'·'하코네1박은 빼고'의 일수는 빼 달라고 한 그곳의 일수라 함께 지운다
// (남겨서 그 장소가 꼭 갈 곳이 되던 회귀, 2026-10-03 3차 검토).
const NEGATED_KEEP_DAYS_PREFIX_RE = /^([^\s,.!?、。\d]*)(?:\d{1,2}\s*(?:박|일(?!\s*(?:차|권))|日間|日(?![目中券])|泊))+(?=[가-힣A-Za-z一-鿿゠-ヿ])/;
function keptDaysPrefix(words) {
  const w = String(words || '');
  const m = NEGATED_KEEP_DAYS_PREFIX_RE.exec(w);
  if (!m) return '';
  const rest = w.slice(m[0].length).trim();
  if (!rest || /^(?:은|는|을|를|이|가|도|만|만은|정도|쯤|씩|째|は|を|も|に|で)$/.test(rest)) return '';
  if (m[1] && !exactCityKeyForToken(m[1]) && !exactCityKeyForToken(m[1].replace(/(?:で|は|に|では)$/, ''))) return '';
  return m[0];
}
function stripNegatedPhrases(text) {
  let out = String(text || '').replace(NEGATED_PHRASE_RE, (m, words, offset, whole) => {
    const keep = keptDaysPrefix(words);
    return `${keep ? `${keep} ` : ' '}${insteadGluedPlaceHead(m, whole.slice(offset + m.length))}`;
  });
  for (const m of enNegatedMatches(out).reverse()) out = `${out.slice(0, m.index)} ${out.slice(m.index + m.text.length)}`;
  return out;
}

// 대표 명소 별칭 바로 뒤에 부정 꼬리가 붙었거나(디즈니랜드는 빼고) 앞에 no/skip/without이 있으면 제외 대상.
function findExcludedMustAttractions(text) {
  const lower = String(text || '').toLowerCase();
  const hits = [];
  for (const item of MUST_ATTRACTIONS) {
    for (const alias of item.aliases || []) {
      if (isNameNegatedIn(lower, String(alias || '').toLowerCase())) {
        if (!hits.some((h) => h.name === item.name)) hits.push(item);
        break;
      }
    }
  }
  return hits;
}

// 빼 달라고 한 장소의 한글 이름: 대표 명소(별칭), 경로 도시 명소(highlights)·추가 명소(EXTRA_PLACES)의 이름과 en/ja 표기.
// 예: "skip Ginza Six" → 긴자 식스, "금각사, 기요미즈데라는 빼고" → 금각사·기요미즈데라
function findExcludedPlaceNames(text, cityKeys = []) {
  const lower = String(text || '').toLowerCase();
  const out = [];
  if (!lower) return out;
  const tryPlace = (koName, labels) => {
    if (!koName || out.includes(koName)) return;
    if (labels.some((l) => l && isNameNegatedIn(lower, String(l).toLowerCase()))) out.push(koName);
  };
  for (const m of findExcludedMustAttractions(text)) if (!out.includes(m.name)) out.push(m.name);
  for (const ck of Array.from(new Set((cityKeys || []).filter((k) => CITY_DATA[k])))) {
    for (const h of CITY_DATA[ck].highlights || []) {
      const media = placeMediaFor(ck, h.name);
      const i18n = CURATED_PLACE_I18N[`${ck}|${h.name}`] || {};
      tryPlace(h.name, [h.name, i18n.en, i18n.ja, media?.labels?.en, media?.labels?.ja]);
    }
  }
  for (const e of EXTRA_PLACES) tryPlace(e.name, [e.name, e.en, e.ja, ...(e.aliases || [])]);
  return out;
}

// 'X 대신 Y'·'X대신Y' (X는 빼고 Y를 넣는다). '대신궁'처럼 이름 속 '대신'은 보지 않는다(INSTEAD_WORD_SRC).
const INSTEAD_PHRASE_RE = new RegExp(`([^\\s,.!?]+?)\\s*(?:은|는|을|를)?\\s*${INSTEAD_WORD_SRC}\\s*([^\\s,.!?]+)`);
function parseInsteadPhrase(text) {
  const m = INSTEAD_PHRASE_RE.exec(String(text || ''));
  if (!m) return null;
  // '하코네대신에노시마': 바로 붙은 '에'가 장소 이름의 첫 글자면 이름에 돌려준다(insteadGluedPlaceHead)
  const to = insteadGluedPlaceHead(m[0].slice(0, m[0].length - m[2].length), m[2]) + m[2];
  // '가마쿠라당일치기'·'가마쿠라 당일치기로'의 '당일치기'는 장소 이름이 아니다
  return { from: m[1].replace(/(은|는|을|를|이|가)$/, ''), to: to.replace(/(으로|로|을|를|이|가|은|는|넣어.*|추가.*|당일치기.*)$/, '') };
}

// 테마 키워드. 한 글자 '산'·'절'은 '저예산'·'산책'·'부산'·'절약'·'친절'로 오인되지 않게 구체적인 단어만 쓴다.
const THEME_KEYWORD_RE = {
  shopping: /쇼핑|아울렛|백화점|드럭스토어|shopping|outlet|\bmall\b|ショッピング|買い物/i,
  nature: /자연|온천|트레킹|바다|해변|공원|등산|산행|산악|단풍|nature|onsen|hiking|mountain|beach|\bpark\b|autumn leaves|自然|温泉|紅葉|ハイキング/i,
  culture: /신사(?!이바시)|사찰|절\s*(?:투어|방문|순례)|박물관|미술관|역사|문화|전통|정원|garden|庭園|culture|museum|historic|temple|shrine|お寺|寺院|神社|歴史|文化/i,
  foodie: /라멘|스시|교자|먹방|맛집|미식|이자카야|음식|food|restaurant|ramen|sushi|gyoza|グルメ|食べ歩き|ラーメン|寿司/i
};

function parseThemeFromText(text, fallback = 'mixed') {
  // 부정된 구절("쇼핑은 빼고", "no shopping")은 테마 판정에서 뺀다.
  const raw = stripNegatedPhrases(text).toLowerCase();
  if (!NEG_SHOPPING_RE.test(String(text || '')) && THEME_KEYWORD_RE.shopping.test(raw)) return 'shopping';
  if (THEME_KEYWORD_RE.nature.test(raw)) return 'nature';
  if (THEME_KEYWORD_RE.culture.test(raw)) return 'culture';
  if (THEME_KEYWORD_RE.foodie.test(raw)) return 'foodie';
  return fallback;
}

// 부정된 구절에만 나온 테마(예: "쇼핑은 빼줘" → shopping). AI가 이 테마를 고르면 받아들이지 않는다.
function negatedThemes(text) {
  const spans = negatedPhrases(text).join(' ');
  const out = new Set();
  if (NEG_SHOPPING_RE.test(String(text || ''))) out.add('shopping');
  for (const [theme, re] of Object.entries(THEME_KEYWORD_RE)) if (spans && re.test(spans)) out.add(theme);
  return out;
}

function parseBudgetFromText(text, fallback = 'mid') {
  const raw = String(text || '').toLowerCase();
  if (/가성비|저렴|절약|싸게|저예산|무료|cheap|budget|low cost|free spots|安く|格安/.test(raw)) return 'low';
  if (/럭셔리|고급|프리미엄|좋은 호텔|5성급|luxury|premium|high end|高級/.test(raw)) return 'high';
  return fallback;
}

function hhmm(h, m = 0) {
  const hh = clamp(Math.floor(Number(h) || 0), 0, 23);
  const mm = clamp(Math.floor(Number(m) || 0), 0, 59);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 오전/오후·am/pm 표시를 반영한 24시간 시(hour). 표시가 없으면 그대로.
function to24Hour(hour, marker) {
  let h = Number(hour);
  const mk = String(marker || '').toLowerCase();
  if (/오후|저녁|밤|pm|p\.m\.|午後|夜/.test(mk) && h < 12) h += 12;
  if (/오전|아침|새벽|am|a\.m\.|午前|朝/.test(mk) && h === 12) h = 0;
  return h;
}

// 시각 조건: 하루 시작 시각(startTimeMin), 첫날 도착(arrivalTime), 마지막 날 출발(departureTime). 모르면 ''.
function parseTimePrefsFromText(text) {
  const raw = String(text || '');
  const out = { startTimeMin: '', arrivalTime: '', departureTime: '' };
  // "아침 10시 이후", "10시부터", "after 10am", "10時以降"
  const ks = /(오전|아침|오후)?\s*(\d{1,2})\s*시\s*(?:\d{1,2}\s*분\s*)?(?:이후|부터|넘어|넘어서|쯤\s*시작|에\s*시작|\s*시작)/.exec(raw);
  // "after 10am", "from 10", "start at 11am", "starting around 10:30", "begin at 11"
  const es = /\b(?:start(?:ing)?\s+)?(?:after|from|not before)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i.exec(raw)
    || /\b(?:start|starting|begin|beginning)\s+(?:the\s+day\s+)?(?:at|around|by|from)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?![\d:])/i.exec(raw);
  const js = /(午前|午後|朝)?\s*(\d{1,2})\s*時\s*(?:以降|から|過ぎ)/.exec(raw);
  const startHour = ks ? to24Hour(ks[2], ks[1]) : es ? to24Hour(es[1], es[3]) : js ? to24Hour(js[2], js[1]) : null;
  const arrivalCtx = /도착|arriv|着/i;
  if (startHour !== null && startHour >= 7 && startHour <= 14) {
    const matched = (ks || es || js)[0];
    const at = raw.indexOf(matched);
    // "밤 9시 도착"처럼 도착 시각이면 시작 시각이 아니다
    if (!arrivalCtx.test(raw.slice(at, at + matched.length + 4))) out.startTimeMin = hhmm(startHour, es && es[2] ? es[2] : 0);
  }
  // "밤 9시 도착", "오후 3시에 도착", "arrive at 9pm", "21時着"
  const ka = /(밤|저녁|오후|오전|아침|새벽)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분\s*)?(?:에\s*)?(?:도착|착륙)/.exec(raw);
  const ea = /arriv\w*\s*(?:at|around|by)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i.exec(raw);
  const ja = /(午前|午後|夜|朝)?\s*(\d{1,2})\s*時\s*(?:(\d{1,2})\s*分)?\s*(?:に)?(?:着|到着)/.exec(raw);
  if (ka) {
    let h = to24Hour(ka[2], ka[1]);
    if (!ka[1] && h <= 6) h += 12; // "9시 도착"처럼 표시가 없고 이른 숫자면 오후로 본다
    out.arrivalTime = hhmm(h, ka[3] || 0);
  } else if (ea) {
    out.arrivalTime = hhmm(to24Hour(ea[1], ea[3]), ea[2] || 0);
  } else if (ja) {
    out.arrivalTime = hhmm(to24Hour(ja[2], ja[1]), ja[3] || 0);
  }
  // "마지막 날 오후 3시 비행기", "마지막 날은 오전 비행기"(시각 없으면 오전 11:00·오후 16:00·저녁/밤 20:00로 본다)
  const kd = /마지막\s*날\s*(?:은|에는|엔)?\s*(오전|아침|오후|저녁|밤)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분\s*)?(?:에\s*)?(?:비행기|출국|출발|귀국|항공편|떠나)/.exec(raw);
  const kdNoHour = /마지막\s*날\s*(?:은|에는|엔)?\s*(오전|아침|오후|저녁|밤)\s*(?:비행기|출국|출발|귀국|항공편)/.exec(raw);
  const ed = /(?:last\s+day|depart\w*|flight\s+home|return\s+flight)[^.!?]*?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i.exec(raw);
  if (kd) {
    let h = to24Hour(kd[2], kd[1]);
    if (!kd[1] && h <= 6) h += 12;
    out.departureTime = hhmm(h, kd[3] || 0);
  } else if (kdNoHour) {
    const mk = kdNoHour[1];
    out.departureTime = /오전|아침/.test(mk) ? '11:00' : /오후/.test(mk) ? '16:00' : '20:00';
  } else if (ed) {
    out.departureTime = hhmm(to24Hour(ed[1], ed[3]), ed[2] || 0);
  }
  return out;
}

function parseMaxPlacesPerDay(raw) {
  const ko = /하루\s*(?:에\s*)?([1-5])\s*(?:[~\-]\s*([1-5]))?\s*(?:곳|개|군데|장소|스팟)/.exec(raw);
  if (ko) return clamp(Number(ko[2] || ko[1]), 1, 5);
  const en = /([1-5])\s*(?:-\s*([1-5]))?\s*(?:places?|spots?|sights?|stops?)\s*(?:a|per)\s*day/i.exec(raw);
  if (en) return clamp(Number(en[2] || en[1]), 1, 5);
  const ja = /1日\s*([1-5])\s*(?:か所|ヶ所|カ所|箇所|ヵ所)/.exec(raw);
  if (ja) return clamp(Number(ja[1]), 1, 5);
  return null;
}

function parseSpecialPrefsFromText(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const relaxedPace = /여유|느긋|천천히|빡빡.*줄|타이트.*줄|relax|slow\s*pace|ゆっくり|のんびり/i.test(raw);
  const explicitMax = parseMaxPlacesPerDay(raw);
  // 말하지 않았으면 비워 둔다(규칙 일정은 기본 3, AI 일정은 기본 4)
  const maxPlacesPerDay = explicitMax || (/(빡빡|여유|느긋|천천히|널널)/.test(raw) ? 2 : undefined);
  const times = parseTimePrefsFromText(raw);
  const arrivalHour = times.arrivalTime ? Number(times.arrivalTime.slice(0, 2)) : null;

  return {
    indoorFocus: /실내|비\s*오|비가\s*(많이\s*)?올|우천|rain|indoor|室内|雨/i.test(raw),
    relaxedPace,
    ...(maxPlacesPerDay ? { maxPlacesPerDay } : {}),
    removeShopping: NEG_SHOPPING_RE.test(raw),
    optimizeTransit: /동선\s*최적|교통\s*이동\s*많|이동시간\s*최소|환승\s*적/.test(raw),
    addRestDay: /휴식일|하루\s*쉬|아무것도\s*안|rest\s*day|休息日/i.test(raw),
    replaceUniversalWithAquarium: /유니버[셜설]\s*대신\s*수족관/.test(raw),
    adjustKyotoUpOsakaDown: /교토.*하루.*늘|오사카.*줄/.test(raw),
    lateStart: /아침\s*늦|늦게\s*시작|브런치\s*후|늦잠|sleep\s*in|late\s*start/i.test(raw) || (times.startTimeMin !== '' && Number(times.startTimeMin.slice(0, 2)) >= 10),
    moreCafes: /카페\s*많|카페\s*위주/.test(raw),
    lowWalking: /많이\s*걷지|도보\s*최소|걷기\s*적|(많이\s*)?안\s*걷|덜\s*걷|less\s+walking|not\s+much\s+walking|あまり歩かない/i.test(raw),
    safeAreaPriority: /안전한\s*동네|치안/.test(raw),
    nightViewFocus: /야경|night\s*view|夜景/i.test(raw),
    strollerFriendly: /유모차|아이랑|아기랑|baby|stroller|ベビーカー/.test(lower),
    kidsFriendly: /아이\s*(둘|하나|셋|들)?\s*(데리고|동반|랑|와)|\d+\s*살|\bkids?\b|children|child|子連れ|子ども|子供/i.test(raw),
    rentalCarMode: /렌터카|렌트카|drive|driving/.test(lower),
    jrPassMode: /jr\s*패스|jrpass|레일패스/.test(lower),
    snowFocus: /눈\s*많|설경|snow/.test(lower),
    firstDayShort: /첫날\s*짧|늦게\s*도착|비행기\s*늦|첫날.*비워/.test(raw) || (arrivalHour !== null && arrivalHour >= 15),
    lastDayAirportBufferMin: /공항\s*3시간\s*전/.test(raw) ? 180 : 120,
    firstTimeJapan: /일본\s*처음|처음\s*일본|first\s+time\s+in\s+japan|初めての日本/i.test(raw),
    localVibeFocus: /유명한데\s*말고|일본\s*느낌|로컬\s*동네/.test(raw),
    lessCrowded: /사람\s*적|한적|붐비지\s*않|덜\s*붐비/.test(raw),
    foodAndWalkFocus: /먹는거|먹거리|산책\s*위주|먹고\s*산책/.test(raw),
    photoSpotsFocus: /사진\s*찍기|포토스팟|인생샷/.test(raw),
    animeVibeFocus: /애니|서브컬처|animation|anime|アニメ/.test(lower),
    doNothingDay: /아무것도\s*안하는\s*일정/.test(raw),
    minimizeTravelTime: /이동시간\s*최소|이동\s*최소|이동(은|을)?\s*최소|동선\s*짧/.test(raw),
    oceanViewStay: /바다\s*보이는\s*숙소|오션뷰/.test(raw),
    cheapFlightPriority: /비행기값\s*싼|항공권\s*저렴/.test(raw),
    publicTransitOnly: /대중교통만|지하철만|버스만|차\s*없이|public\s+transit\s+only/i.test(raw),
    // 저예산·무료 명소 위주: 테마파크 같은 비싼 종일 후보와 유료 전망대를 뒤로 미룬다
    lowBudget: parseBudgetFromText(raw, '') === 'low',
    ...(times.startTimeMin ? { startTimeMin: times.startTimeMin } : {}),
    ...(times.arrivalTime ? { arrivalTime: times.arrivalTime } : {}),
    ...(times.departureTime ? { departureTime: times.departureTime } : {})
  };
}

function extractAirportCodeFromText(text) {
  const raw = String(text || '').toUpperCase();
  const tokens = raw.match(/\b[A-Z]{3}\b/g) || [];
  for (const code of tokens) {
    if (cityKeyByAirport(code)) return code;
  }
  return '';
}

function extractPreferredAreas(text, cityKey) {
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const raw = String(text || '');
  return city.areas.filter((area) => raw.includes(area)).slice(0, 4);
}

const FOOD_KEYWORDS = [
  '장어덮밥', '장어 덮밥', '히츠마부시', '교자', '라멘', '스시', '오코노미야키', '타코야키',
  '규카츠', '돈카츠', '스프카레', '카레', '우동', '소바', '야키니쿠', '이자카야',
  '카이센동', '짬뽕', '모츠나베', '디저트', '카페', '멘타이코',
  '징기스칸', '가이세키', '오마카세', '해산물',
  '아구', '오리온', '사케', '양조', '규탄', '부타동', '소바', '복어',
  '고베규', '와규', '스테이크', '카츠오', '성게', '게요리',
  '쿠시카츠', '야키토리', '텐동', '텐푸라', '스키야키', '샤브샤브', '규동'
];
// 다른 표기(영어·일본어·한국어 변형) → FOOD_KEYWORDS의 이름
const FOOD_ALIAS_RULES = [
  [/라면|ラーメン/, '라멘'], [/초밥|寿司|すし|鮨/, '스시'], [/kushikatsu|串カツ|串かつ/i, '쿠시카츠'], [/takoyaki|たこ焼/i, '타코야키'],
  [/okonomiyaki|お好み焼/i, '오코노미야키'], [/\budon\b|うどん/i, '우동'], [/\bsoba\b|蕎麦/i, '소바'], [/tempura|天ぷら|덴뿌라|튀김/i, '텐푸라'],
  [/yakitori|焼き鳥|焼鳥/i, '야키토리'], [/yakiniku|焼肉/i, '야키니쿠'], [/wagyu|和牛/i, '와규'], [/kobe\s+beef|神戸牛/i, '고베규'],
  [/izakaya|居酒屋/i, '이자카야'], [/gyoza|餃子/i, '교자'], [/tonkatsu|とんかつ|豚カツ/i, '돈카츠'], [/\bcurry\b|カレー/i, '카레'],
  [/motsunabe|もつ鍋/i, '모츠나베'], [/kaiseki|懐石/i, '가이세키'], [/sukiyaki|すき焼/i, '스키야키'], [/shabu|しゃぶしゃぶ/i, '샤브샤브'],
  [/gyudon|牛丼/i, '규동'], [/\btendon\b|天丼/i, '텐동']
];
// 음식 이름으로 시작하는 글인지("꼭 오코노미야키" → 먹고 싶은 것)
const FOOD_START_RE = new RegExp(`^\\s*(?:${[...FOOD_KEYWORDS].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')}|${FOOD_ALIAS_RULES.map(([re]) => re.source).join('|')})`, 'i');
// 음식(먹고 싶은 것)이라 장소가 아닌 낱말인지: 음식 이름 그 자체이거나 식당 판정 단어로만 된 짧은 낱말
function isFoodWord(token) {
  const t = String(token || '').trim();
  if (!t) return false;
  if (FOOD_KEYWORDS.some((k) => k.toLowerCase() === t.toLowerCase())) return true;
  if (FOOD_ALIAS_RULES.some(([re]) => re.test(t)) && t.length <= 12) return true;
  return /^(?:[가-힣A-Za-z]{0,6}\s*)?(?:라멘|라면|스시|초밥|우동|소바|이자카야|야키토리|야키니쿠|돈카츠|규카츠|카레|타코야키|오코노미야키|모츠나베|쿠시카츠|맛집|먹방|식당|ramen|sushi|udon|soba|izakaya|food|restaurants?|ラーメン|寿司|グルメ)$/i.test(t);
}

function parseFoodKeywordFromText(text) {
  const raw = String(text || '').toLowerCase();
  // Collect ALL matching food keywords, return the most specific (longest) one
  const matches = [];
  for (const keyword of FOOD_KEYWORDS) {
    if (raw.includes(keyword.toLowerCase())) {
      matches.push(keyword === '장어 덮밥' ? '장어덮밥' : keyword);
    }
  }
  if (/hitsumabushi/i.test(raw)) matches.push('장어덮밥');
  if (/장어|eel|unagi/i.test(raw)) matches.push('장어덮밥');
  if (/ramen/i.test(raw)) matches.push('라멘');
  if (/sushi/i.test(raw)) matches.push('스시');
  for (const [re, name] of FOOD_ALIAS_RULES) if (re.test(raw)) matches.push(name);
  if (/아구.*돼지|아구돼지|아구 돼지/i.test(raw)) matches.push('아구돼지');
  if (/오리온.*맥주|오리온맥주/i.test(raw)) matches.push('오리온맥주');
  if (/사케.*양조|양조.*투어/i.test(raw)) matches.push('사케');
  // Return longest match (most specific)
  if (matches.length === 0) return '';
  // Join multiple keywords with comma for multi-food queries
  const unique = [...new Set(matches)];
  if (unique.length > 1) return unique.slice(0, 3).join(', ');
  return unique[0];
}

function isMeaningfulPlaceKeyword(token) {
  const t = String(token || '').trim();
  if (t.length < 2) return false;
  if (/먹고|싶어|하고|싶|추천|여행|지역|도시|일정|숙소|공항|쇼핑/.test(t)) return false;
  if (/^[0-9]+$/.test(t)) return false;
  return true;
}

// 낱말 → 장소의 표준(한글) 이름: 대표 명소 별칭('otaru' → 오타루 운하) → 추가 명소('가이유칸 수족관' → 가이유칸)
// → 내장 장소의 en/ja 표기('Fushimi Inari Taisha' → 후시미 이나리). 모르면 사용자가 쓴 그대로.
function canonicalWantedName(token, cityKeys = []) {
  const t = normalizeWantedPlaceName(String(token || '').replace(/\s+/g, ' ').trim());
  if (!t) return '';
  const lower = t.toLowerCase();
  const keys = (cityKeys || []).filter(Boolean);
  const must = dedupeMustMatches(MUST_ATTRACTIONS.filter((m) => mustNameEquals(m, lower)), keys)
    .sort((a, b) => Number(keys.includes(b.cityKey)) - Number(keys.includes(a.cityKey)))[0];
  if (must) return must.name;
  const extra = extraPlaceByName(t);
  if (extra) return extra.name;
  const label = placeLabelMatches(t, keys)[0];
  if (label?.ko) return label.ko;
  return t;
}

// 낱말이 가리키는 데이터 속 장소의 표준 이름(대표 명소 별칭·추가 명소·도시 주변 실제 명소·도시 명소 표기). 모르면 ''.
// AI 채팅 해석이 '데이터 없음'(unsupportedPlaces)으로 돌려준 이름을 다시 볼 때 쓴다.
function knownPlaceForToken(token, cityKeys = []) {
  const t = String(token || '').trim();
  if (!t || exactCityKeyForToken(t)) return '';
  const lower = t.toLowerCase();
  const must = dedupeMustMatches(MUST_ATTRACTIONS.filter((m) => mustNameEquals(m, lower)), cityKeys)[0];
  if (must) return must.name;
  const extra = extraPlaceByName(t);
  if (extra) return extra.name;
  // 낱말이 장소 이름 하나를 거의 다 덮을 때('다케토미섬은'처럼 조사가 붙은 경우)
  const hit = extraPlaceHits(t).find((h) => h.len >= Math.max(3, t.replace(/\s+/g, '').length - 2));
  if (hit) return hit.place.name;
  const label = placeLabelMatches(t, cityKeys)[0];
  return label?.ko || '';
}

// 낱말이 가리키는 데이터 속 장소가 있는지(대표 명소·추가 명소·도시 명소·내장 장소 표기)
function isKnownPlaceName(name) {
  const t = String(name || '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (MUST_ATTRACTIONS.some((m) => mustNameEquals(m, lower))) return true;
  if (extraPlaceByName(t)) return true;
  return placeLabelMatches(t, []).length > 0;
}

// routeKeys: 메시지에 함께 나온 다른 도시(그 도시의 도시 주변 실제 명소도 받는다)
function extractWantedPlacesFromMessage(text, cityKey, routeKeys = []) {
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const hits = [];
  const cityAliasSet = new Set((CITY_ALIASES[cityKey] || []).map((x) => String(x).toLowerCase()));

  city.highlights.forEach((h) => {
    const name = String(h.name || '');
    if (name && lower.includes(name.toLowerCase()) && !hits.includes(name)) {
      hits.push(name);
    }
  });
  // en/ja 표기로 쓴 도시 명소("Shibuya Sky", "清水寺")
  city.highlights.forEach((h) => {
    if (hits.includes(h.name)) return;
    const media = placeMediaFor(cityKey, h.name);
    const i18n = CURATED_PLACE_I18N[`${cityKey}|${h.name}`] || {};
    const labels = [i18n.en, i18n.ja, media?.labels?.en, media?.labels?.ja].filter((l) => l && String(l).length >= 3);
    if (labels.some((l) => aliasInText(lower, String(l).toLowerCase()))) hits.push(h.name);
  });

  const cityWords = LANDMARK_CITY_HINTS[cityKey] || [];
  // 대표 명소의 별칭인 랜드마크 낱말('유니버설', 'USJ')은 명소 이름으로 한 번만 넣는다.
  const mustMatched = matchMustAttractions(maskMustInsidePlaceNames(raw));
  const mustAliasSet = new Set(mustMatched.flatMap((m) => [m.name, ...(m.aliases || [])]).map((a) => String(a).toLowerCase()));
  // 이미 찾은 장소 이름·별칭의 일부인 낱말('fushimi' ⊂ 'fushimi inari', '기요미즈' ⊂ '기요미즈데라')은 따로 넣지 않는다.
  const foundLowers = [...mustAliasSet].filter((a) => aliasInText(lower, a));
  cityWords.forEach((w) => {
    const word = String(w).trim();
    const lowerWord = word.toLowerCase();
    if (cityAliasSet.has(lowerWord) || mustAliasSet.has(lowerWord)) return;
    if (word === city.label) return;
    if (foundLowers.some((a) => a !== lowerWord && a.includes(lowerWord))) return;
    if (lower.includes(lowerWord) && isMeaningfulPlaceKeyword(word) && !hits.includes(word)) {
      hits.push(w);
    }
  });

  mustMatched.forEach((m) => {
    if (!hits.includes(m.name)) hits.unshift(m.name);
  });

  // 추가 명소(가이유칸·팀랩 플래닛 …): 이 도시의 것, 또는 다른 도시라도 네 글자 이상 별칭으로 분명히 말한 것.
  // 도시 주변 실제 명소(generated)는 그 도시가 경로(이 도시·함께 말한 도시)에 있을 때만: 다른 도시의 같은 이름 장소로
  // 갈 수 없는 '도시 이동' 날을 만들지 않는다(도시가 없는 글은 parseTravelChatInput이 먼저 그 장소의 도시로 정한다).
  const routeSet = new Set([cityKey, ...(routeKeys || [])].filter(Boolean));
  // 큐레이션 명소(이 도시 명소·찾은 대표 명소)의 이름이 걸친 도시 주변 실제 명소는 그 명소의 말이 아니다:
  // '旭川旭山動物園'의 '旭川旭山'(산, 아사히카와 아사히산)은 '旭山動物園'(아사히야마 동물원)과 겹친다. 큐레이션 이름을 통째로
  // 품은 긴 이름('구시로 이쓰쿠시마 신사' ⊃ '이쓰쿠시마 신사')은 그대로 그 장소다(maskMustInsidePlaceNames).
  const curatedSpans = [];
  const addSpans = (label) => {
    const l = String(label || '').toLowerCase().trim();
    if (l.length >= 2) for (const idx of aliasHitPositions(lower, l)) curatedSpans.push([idx, idx + l.length]);
  };
  city.highlights.forEach((h) => {
    if (h.generated) return;
    const media = placeMediaFor(cityKey, h.name);
    const i18n = CURATED_PLACE_I18N[`${cityKey}|${h.name}`] || {};
    [h.name, i18n.en, i18n.ja, media?.labels?.en, media?.labels?.ja].forEach(addSpans);
  });
  mustMatched.forEach((m) => [m.name, ...(m.aliases || [])].forEach(addSpans));
  const crossesCurated = (h) => curatedSpans.some(([s, e]) => s < h.idx + h.len && h.idx < e && (s < h.idx || e > h.idx + h.len));
  const extraHits = extraPlaceHits(raw).filter((h) => !(h.place.generated && crossesCurated(h))).map((h) => h.place)
    .sort((a, b) => Number(b.cityKey === cityKey) - Number(a.cityKey === cityKey));
  for (const e of extraHits) {
    if (e.generated && !routeSet.has(e.cityKey)) continue;
    const specific = routeSet.has(e.cityKey) || extraPlaceMatchLabels(e).some((a) => a && String(a).length >= 4 && aliasInText(lower, String(a).toLowerCase()));
    if (specific && !hits.includes(e.name)) hits.push(e.name);
  }

  // "아키하바라 이케부쿠로 나카노는 꼭", "츄라우미 수족관은 필수", "must see Kaiyukan" 처럼 꼭 가고 싶다고 한 낱말(먹는 것은 빼고)
  mustGoTokensFromText(raw).forEach((tok) => {
    const name = canonicalWantedName(tok, [cityKey]);
    if (!name || cityAliasSet.has(name.toLowerCase()) || name === city.label || exactCityKeyForToken(name)) return;
    if (!hits.includes(name)) hits.push(name);
  });

  // 같은 곳을 두 번 넣지 않는다('유니버셜' ⊂ '유니버셜 스튜디오 재팬')
  const keys = hits.map((h) => placeNameKey(h));
  return hits.filter((h, i) => {
    const k = keys[i];
    if (!k) return false;
    return !keys.some((other, j) => j !== i && other !== k && other.includes(k)) && keys.indexOf(k) === i;
  }).slice(0, 6);
}

const MUST_GO_STOP_WORDS = new Set(['저녁', '아침', '점심', '오전', '오후', '밤', '낮', '하루', '여기', '거기', '이곳', '그곳', '일정', '여행', '맛집', '음식', '쇼핑', '온천', '구경', '체험', '사진', '야경', '첫날', '마지막', '날', '정도', '위주', '중심', '다음', '이번', '제발', '정말', '진짜',
  '오늘', '내일', '모레', '첫째', '둘째', '셋째', '넷째', '마지막날', '이날', '그날', '종일', '하루종일', '당일치기', '부모님', '아이', '아이들', '가족', '친구', '혼자', '같이', '함께',
  '그리고', '특히', '무엇보다', '이건', '그건', '이거', '그거', '여긴', '거긴', '저녁엔', '밤엔', '아침엔', '낮엔']);
// 낱말 끝 조사('도톤보리는', '저녁엔', '오사카에서는')
const MUST_GO_PARTICLE_RE = /(이랑|랑|은요|는요|에서는|에서|에는|에도|엔|은|는|을|를|에|도)$/;

// 시설 낱말(이름의 끝에 오는 일반 낱말): 이 낱말로 끝나는 여러 낱말은 한 장소 이름이고, 이 낱말 하나만으로는 장소가 아니다
const MUST_GO_FACILITY_TAIL_RE = /^(?:박물관|미술관|기념관|문학관|자료관|사료관|과학관|역사관|향토관|전시관|공원|정원|식물원|동물원|수족관|신사|신궁|온천|폭포|호수|해변|해안|해수욕장|유적|고분|전망대|동굴|협곡|계곡|습원|고원|성당|교회|대교)$/;
const mustGoWordOk = (w, tok) => Boolean(tok) && tok.length >= 2 && !MUST_GO_STOP_WORDS.has(tok) && !MUST_GO_STOP_WORDS.has(w)
  && isMeaningfulPlaceKeyword(tok) && !isFoodWord(tok) && !/^(가고|보고|하고|싶어|싶다|가요|갈|들러|넣어)/.test(tok);
// '꼭' 앞 낱말들 → 꼭 갈 곳 낱말. 데이터에 있는 여러 낱말 이름('도쿄 타워', 예전 이름 '쇼지 우에다 사진 박물관')은 통째로,
// 남은 낱말이 시설 낱말로 끝나면('가나다 라마바 사진 박물관') 그것도 한 이름으로 둔다 — 낱말 조각('가나다'·'박물관')을 장소로
// 넣지 않는다. 그 밖의 낱말은 하나씩("아키하바라 이케부쿠로 나카노는 꼭").
function mustGoPhraseTokens(phrase) {
  const items = String(phrase || '').trim().split(/\s+/).filter(Boolean).map((w) => ({ w, tok: w.replace(MUST_GO_PARTICLE_RE, '').trim() }));
  const joined = (list) => list.map((x) => x.tok).join(' ');
  const segs = []; // { name } | { words }
  for (let i = 0; i < items.length;) {
    let j = items.length;
    while (j >= i + 2 && !isKnownPlaceName(joined(items.slice(i, j)))) j -= 1;
    if (j >= i + 2) { segs.push({ name: joined(items.slice(i, j)) }); i = j; continue; }
    const last = segs[segs.length - 1];
    if (last && last.words) last.words.push(items[i]); else segs.push({ words: [items[i]] });
    i += 1;
  }
  const out = [];
  for (const s of segs) {
    if (s.name) { out.push(s.name); continue; }
    const first = s.words.findIndex((x) => mustGoWordOk(x.w, x.tok));
    const tail = s.words[s.words.length - 1];
    if (first >= 0 && first < s.words.length - 1 && MUST_GO_FACILITY_TAIL_RE.test(tail.tok)) { out.push(joined(s.words.slice(first))); continue; }
    for (const x of s.words) if (mustGoWordOk(x.w, x.tok) && !MUST_GO_FACILITY_TAIL_RE.test(x.tok)) out.push(x.tok);
  }
  return out;
}

// 꼭 가고 싶다고 한 낱말: 한국어 '꼭/필수/반드시/무조건' 앞의 낱말(최대 4개), 영어 "must see/visit X", 일본어 "Xは必ず行きたい".
// 뒤가 '먹'이거나 음식 이름이면("저녁엔 꼭 오코노미야키") 먹고 싶은 것이라 장소로 보지 않는다.
function mustGoTokensFromText(text) {
  const raw = String(text || '');
  const out = [];
  const push = (tok) => { const t = String(tok || '').trim(); if (t && !out.includes(t)) out.push(t); };
  const re = /((?:[가-힣A-Za-z]{2,}\s*){1,4}?)\s*(?:은|는|을|를)?\s*(?:꼭|필수|반드시|무조건)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 20);
    if (/^\s*(?:먹|마시|맛보)/.test(after) || FOOD_START_RE.test(after)) continue;
    mustGoPhraseTokens(m[1]).forEach(push);
  }
  // 영어: "must see Kaiyukan aquarium", "must visit teamLab Planets", "want to visit Nijo Castle"
  const enRe = /\b(?:must[-\s]+(?:visit|see|go\s+to|do)|have\s+to\s+(?:visit|see|go\s+to)|(?:really\s+)?want\s+to\s+(?:visit|see|go\s+to)|would\s+(?:love|like)\s+to\s+(?:visit|see|go\s+to)|definitely\s+(?:visit|see|go\s+to)|don'?t\s+want\s+to\s+miss)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9'’.&-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'’.&-]*){0,4})/gi;
  while ((m = enRe.exec(raw)) !== null) {
    for (const part of m[1].split(/\s+(?:and|or|with|then|in|at|on|for|during|before|after|please|too|also)\b\s*/i)) {
      const tok = part.replace(/\s+(?:please|too|also|first)$/i, '').trim();
      if (tok.length < 3 || isFoodWord(tok) || /^(?:it|this|that|there|them|everything|all|some|more|places?|spots?|sights?|highlights?)$/i.test(tok)) continue;
      push(tok);
    }
  }
  // 일본어: "海遊館は必ず行きたい", "清水寺には絶対行く"
  const jaRe = /([^\s、。,!?！？]{2,20}?)(?:は|には|を)?\s*(?:必ず|絶対(?:に)?)\s*(?:行|見|訪|寄)/g;
  while ((m = jaRe.exec(raw)) !== null) {
    const tok = m[1].replace(/(では|で|に|へ)$/, '').trim();
    if (tok.length >= 2 && !isFoodWord(tok)) push(tok);
  }
  return out.slice(0, 6);
}

// 말로 한 장소별 시간 힌트: 하루 전체("오타루 당일치기를 하루", "day trip to Nara")·저녁("도톤보리는 저녁에", "도톤보리 야경")
function wantedTimeHints(text, wantedNames, cityKeys = []) {
  const lower = String(text || '').toLowerCase();
  const allDay = [];
  const evening = [];
  for (const name of wantedNames || []) {
    const must = MUST_ATTRACTIONS.find((m) => m.name === name);
    const extra = extraPlaceByName(name);
    const labels = [name, ...(must?.aliases || []), ...(extra ? [extra.en, extra.ja, ...(extra.aliases || [])] : [])]
      .map((a) => String(a || '').toLowerCase().trim()).filter((a) => a.length >= 2 && aliasInText(lower, a));
    for (const a of labels) {
      const esc = escapeRegExp(a);
      // 이름 바로 뒤(조사·'꼭'만 사이에 둔) 시간 낱말만 본다("오사카성 갔다가 밤에 도톤보리"의 오사카성은 저녁이 아니다)
      const near = `${esc}\\s*(?:은|는|을|를|에서|에|도|이랑|랑|は|を|に)?\\s*(?:꼭\\s*)?`;
      if (new RegExp(`${near}(?:당일치기|당일\\s*여행|하루\\s*(?:종일|통째|전체|다)|하루를?\\s*(?:넣|잡|써|쓰)|day[\\s-]*trip|for\\s+(?:a|the)\\s+(?:full|whole)\\s+day|日帰り|丸一日)`, 'i').test(lower)
        || new RegExp(`(?:day[\\s-]*trip\\s+to|日帰りで)\\s*(?:the\\s+)?${esc}`, 'i').test(lower)) {
        if (!allDay.includes(name)) allDay.push(name);
      }
      if (new RegExp(`${near}(?:저녁|밤에|밤엔|야경|night|evening|夜景|夜に|夕方)`, 'i').test(lower)
        || new RegExp(`(?:저녁에|밤에|evening\\s+(?:at|in)|at\\s+night\\s+(?:at|in))\\s*(?:the\\s+)?${esc}`, 'i').test(lower)) {
        if (!evening.includes(name)) evening.push(name);
      }
    }
  }
  return { allDay, evening };
}

function normalizeWantedPlaceName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (/^(usj|유니버[셜설]|유니버[셜설]\s*스튜디오|universal\s*studios|ユニバーサル)/i.test(raw)) return '유니버셜 스튜디오 재팬';
  return raw;
}

// 사용자가 말한 장소(데이터에 없을 수도 있음)를 후보 카드 모양으로 만든다.
// 도시 명소(highlights)·추가 명소(EXTRA_PLACES)에 같은 이름이 있으면 그 지역·추천 시간·머무는 시간을 그대로 쓴다(도톤보리 = 난바 18:00-21:00).
// 대표 명소(MUST_ATTRACTIONS)면 그 도시와 '하루 전체' 표시(fullDay/dayTrip)를 붙인다. 같은 이름이 여러 도시에 있으면 cityKey 도시를 먼저 쓴다.
// hints = { allDay: [이름], evening: [이름], routeCityKeys: [도시 키] }: 말로 한 "당일치기 하루"·"저녁에", 일정의 다른 도시
// (이웃한 두 도시에 함께 든 추가 명소는 cityKey 다음으로 일정 도시의 것을 쓴다: 도쿄·삿포로 일정의 나카지마 공원 = 삿포로, 오카다마 아님)
function buildSyntheticWantedDestinations(wantedPlaces, cityKey, max = 4, hints = {}) {
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const list = [];
  const seen = new Set();
  const startHourOf = (range) => { const m = /^(\d{1,2}):/.exec(String(range || '')); return m ? Number(m[1]) : 12; };
  for (const wp of wantedPlaces || []) {
    const name = normalizeWantedPlaceName(wp);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const mustMeta = MUST_ATTRACTIONS.find((m) => m.name === name && m.cityKey === cityKey) || MUST_ATTRACTIONS.find((m) => m.name === name);
    const extra = mustMeta ? null : extraPlaceByName(name, [cityKey, ...(Array.isArray(hints.routeCityKeys) ? hints.routeCityKeys : [])]);
    const metaCityKey = (mustMeta && CITY_DATA[mustMeta.cityKey] ? mustMeta.cityKey : '') || (extra && CITY_DATA[extra.cityKey] ? extra.cityKey : '') || cityKey;
    const destCity = CITY_DATA[metaCityKey] || city;
    const highlight = [metaCityKey, cityKey].map((k) => (CITY_DATA[k]?.highlights || []).find((h) => h.name === name)).find(Boolean) || null;
    const userAllDay = Array.isArray(hints.allDay) && hints.allDay.includes(name);
    const fullDay = Boolean(mustMeta?.fullDay || highlight?.fullDay);
    const dayTrip = !fullDay && Boolean(mustMeta?.dayTrip || highlight?.dayTrip || userAllDay);
    const allDay = fullDay || dayTrip;
    const base = highlight || extra || {};
    let bestTime = allDay ? '09:00-18:00' : (base.bestTime || '10:00-17:00');
    if (!allDay && Array.isArray(hints.evening) && hints.evening.includes(name) && startHourOf(bestTime) < 17) bestTime = '18:00-20:30';
    list.push({
      name,
      city: destCity.label,
      // 데이터에 없는 곳은 지역을 지어내지 않고 도시 이름으로 둔다.
      area: highlight?.area || extra?.area || mustMeta?.area || destCity.label,
      category: highlight?.category || extra?.category || mustMeta?.category || '요청 명소',
      bestTime,
      stayMin: allDay ? 480 : (Number(base.stayMin) || 120),
      ...(fullDay ? { fullDay: true } : {}),
      ...(dayTrip ? { dayTrip: true } : {}),
      ...(extra ? { lat: extra.lat, lng: extra.lng, ...(extra.indoor ? { indoor: true } : {}) } : {}),
      mapUrl: mapUrl(`${name} ${destCity.label}`),
      aiScore: 99
    });
  }
  return list.slice(0, max);
}

function cityKeyByLabel(label) {
  const target = String(label || '').trim();
  if (!target) return '';
  for (const [k, v] of Object.entries(CITY_DATA)) {
    if (String(v.label || '').trim() === target) return k;
  }
  return detectCityKeyByInput(target) || '';
}

const CITY_TRANSFER_HINTS = {
  '오사카|교토': 'JR/한큐 약 30~60분',
  '도쿄|교토': '신칸센 약 2시간 10분',
  '도쿄|오사카': '신칸센 약 2시간 30분',
  '오사카|나라': '전철 약 40~60분',
  '오사카|고베': '전철 약 30~50분',
  '교토|나라': '전철 약 45~60분',
  // 신칸센 구간: 도시 중심 거리가 250km를 넘어도 비행기가 아니고, 100~250km여도 2시간이 안 걸린다
  '도쿄|나고야': '신칸센 약 1시간 40분',
  '도쿄|센다이': '신칸센 약 1시간 30분',
  '도쿄|가나자와': '신칸센 약 2시간 30분',
  '도쿄|시즈오카': '신칸센 약 1시간',
  '오사카|나고야': '신칸센 약 50분',
  '교토|나고야': '신칸센 약 35분',
  '오사카|오카야마': '신칸센 약 45분',
  '오사카|히로시마': '신칸센 약 1시간 30분',
  '교토|히로시마': '신칸센 약 1시간 40분',
  '오카야마|히로시마': '신칸센 약 35분',
  '오사카|후쿠오카': '신칸센 약 2시간 30분',
  '히로시마|후쿠오카': '신칸센 약 1시간',
  '후쿠오카|구마모토': '신칸센 약 35분',
  '후쿠오카|가고시마': '신칸센 약 1시간 20분',
  '구마모토|가고시마': '신칸센 약 45분',
  '고베|히로시마': '신칸센 약 1시간 10분',
  '교토|후쿠오카': '신칸센 약 2시간 40분',
  '도쿄|니가타': '신칸센 약 2시간',
  '도쿄|도야마': '신칸센 약 2시간 10분',
  '센다이|아오모리': '신칸센 약 1시간 30분',
  '후쿠오카|나가사키': '신칸센·특급 약 1시간 20분',
  // 같은 노선 100~250km 중 자주 쓰는 구간(나머지는 거리 구간의 신칸센 시간대로 안내한다)
  '고베|오카야마': '신칸센 약 30분',
  '교토|오카야마': '신칸센 약 1시간',
  '시즈오카|나고야': '신칸센 약 1시간',
  '히로시마|기타큐슈': '신칸센 약 45분',
  '도쿄|후쿠시마': '신칸센 약 1시간 30분',
  // 거리보다 오래 걸리는 특급·버스·배 구간(산·바다를 돌아간다)
  '삿포로|아사히카와': '특급 약 1시간 25분',
  '삿포로|하코다테': '특급 약 3시간 40분',
  '삿포로|구시로': '특급 약 4시간',
  '후쿠오카|오이타': '특급 약 2시간',
  '구마모토|미야자키': '버스 약 3시간',
  '구마모토|오이타': '특급 약 3시간',
  '가고시마|미야자키': '특급 약 2시간 10분',
  '마쓰야마|고치': '버스 약 2시간 30분',
  '도쿠시마|난키 시라하마': '와카야마 경유 배와 특급 약 4~5시간',
  // 다리로 이어진 섬
  '미야코지마|시모지시마': '이라부 대교로 차 약 30분',
  // 짧은 배편이 있는 섬(널리 알려진 소요 시간만 쓴다. 표에 없는 섬 구간은 '배나 비행기로 이동, 반나절 안팎')
  '왓카나이|리시리': '페리 약 1시간 40분',
  '가고시마|야쿠시마': '고속선 약 2시간, 페리 약 4시간',
  '가고시마|다네가시마': '고속선 약 1시간 40분',
  '야쿠시마|다네가시마': '고속선 약 50분'
};

// 신칸센으로 바로 이어진 도시(같은 배열 안끼리). 표에 없는 구간도 거리만 보고 비행기로 안내하지 않게 쓴다.
// 미니 신칸센(야마가타·아키타)과 릴레이 특급을 갈아타는 나가사키는 넣지 않는다(필요한 구간은 표에 쓴다).
const SHINKANSEN_LINES = [
  ['tokyo', 'shizuoka', 'nagoya', 'kyoto', 'osaka', 'kobe', 'okayama', 'hiroshima', 'iwakuni', 'yamaguchi_ube', 'kitakyushu', 'fukuoka', 'kumamoto', 'kagoshima'],
  ['tokyo', 'fukushima', 'sendai', 'hanamaki', 'aomori', 'hakodate'],
  ['tokyo', 'niigata'],
  ['tokyo', 'toyama', 'kanazawa']
];
// 기차·버스로 갈 수 없는 섬 도시(오키나와 본섬 포함): 가까워도 배나 비행기로 간다
const ISLAND_CITY_KEYS = new Set(['okinawa', 'rishiri', 'amami', 'tokunoshima', 'yakushima', 'tanegashima', 'miyako', 'shimojishima', 'ishigaki', 'kumejima', 'kita_daito', 'yonaguni']);

function onSameShinkansenLine(keyA, keyB) {
  return Boolean(keyA && keyB) && SHINKANSEN_LINES.some((line) => line.includes(keyA) && line.includes(keyB));
}

// 표에 없는 구간은 도시 중심 직선거리로 나눈다(시간은 대략값):
// - 250km 이하: 섬이 끼면 배·비행기, 100km 미만은 1~3시간(산·바다를 돌아가면 3시간 가까이 걸린다: 구마모토 → 오이타),
//   100~250km는 같은 신칸센 노선이면 신칸센 시간대(200km까지 30분~1시간 30분: 기타큐슈 → 구마모토 약 50분,
//   그 위는 1시간 30분~2시간: 시즈오카 → 교토 약 1시간 40분), 아니면 대중교통 약 2~4시간
// - 250km 초과: 같은 신칸센 노선이면 신칸센 시간대(450km까지 1~3시간, 700km까지 2~4시간 30분),
//   아니면 기차·버스로 갈 거리가 아니다(도쿄 → 이시가키, 히로시마 → 구시로): 비행기 이동으로 알린다
const NEAR_TRANSFER_KM = 100;
const SHINKANSEN_NEAR_KM = 200;
const FLIGHT_TRANSFER_KM = 250;
const SHINKANSEN_MID_KM = 450;
const SHINKANSEN_MAX_KM = 700;
function transferHint(fromCity, toCity) {
  const a = String(fromCity || '').trim();
  const b = String(toCity || '').trim();
  if (!a || !b || a === b) return '대중교통 기준 이동';
  const key1 = `${a}|${b}`;
  const key2 = `${b}|${a}`;
  if (CITY_TRANSFER_HINTS[key1] || CITY_TRANSFER_HINTS[key2]) return CITY_TRANSFER_HINTS[key1] || CITY_TRANSFER_HINTS[key2];
  const ka = cityKeyForExactLabel(a);
  const kb = cityKeyForExactLabel(b);
  const ca = CITY_CENTER_COORDS[ka];
  const cb = CITY_CENTER_COORDS[kb];
  // 좌표를 모르는 곳(당일치기 장소에서 돌아오는 이동 등)은 예전처럼 넓게 안내한다
  if (!ca || !cb) return '대중교통 기준 1~3시간';
  const km = haversineKm(ca, cb);
  const shinkansen = onSameShinkansenLine(ka, kb);
  if (km > FLIGHT_TRANSFER_KM) {
    if (shinkansen && km <= SHINKANSEN_MID_KM) return '신칸센 약 1~3시간';
    if (shinkansen && km <= SHINKANSEN_MAX_KM) return '신칸센 약 2~4시간 30분';
    return '비행기 이동, 공항 오가는 시간 포함 반나절 이상';
  }
  if (ISLAND_CITY_KEYS.has(ka) || ISLAND_CITY_KEYS.has(kb)) return '배나 비행기로 이동, 항구·공항 오가는 시간 포함 반나절 안팎';
  if (km < NEAR_TRANSFER_KM) return '대중교통 기준 1~3시간';
  if (shinkansen && km <= SHINKANSEN_NEAR_KM) return '신칸센 약 30분~1시간 30분';
  if (shinkansen) return '신칸센 약 1시간 30분~2시간';
  return '대중교통 기준 약 2~4시간';
}

// 같은 장소(위키데이터 항목)가 이웃한 두 도시에 함께 든 곳이 있다: 삿포로·삿포로 오카다마(도시 중심 2.4km)의 나카지마 공원·홋카이도 신궁 등
// 도시 주변 실제 명소 23곳과 삿포로 TV 타워·모에레누마 공원, 미야코지마·시모지시마의 해변 등 5곳과 이라부 대교.
// 일정 도시(경로 도시)에도 있는 장소를 다른 도시 이름으로 고른 카드(예전 채팅이 낸 '나카지마 공원 (삿포로 오카다마)')는 일정 도시의 장소로 본다.
// 안 그러면 deriveRouteCities가 그 카드의 도시를 경로에 더해, 한 도시 일정이 두 도시로 나뉘고('도시 이동: 삿포로 -> 삿포로 오카다마 1~3시간')
// 같은 곳이 두 이름으로 두 번 들어간다('삿포로 TV 타워 (오도리)'와 '삿포로 TV타워 (삿포로 오카다마)', 2026-10-03).
// 장소의 위키데이터 ID: 그 도시의 추가 명소(도시 주변 실제 명소 포함)나 큐레이션 명소의 사진 데이터(place-images.json)
function cityPlaceQid(cityKey, names) {
  const keys = (names || []).map((n) => String(n || '').toLowerCase().replace(/\s+/g, '')).filter(Boolean);
  if (!cityKey || !keys.length) return '';
  const same = (a) => Boolean(a) && keys.includes(String(a).toLowerCase().replace(/\s+/g, ''));
  const extra = EXTRA_PLACES.find((e) => e.cityKey === cityKey && e.wikidata && [e.name, e.en, e.ja, ...(e.aliases || [])].some(same));
  if (extra) return extra.wikidata;
  for (const n of names || []) {
    const media = PLACE_IMAGES.byKey.get(`${cityKey}|${String(n || '').trim()}`);
    if (media?.wikidata) return media.wikidata;
  }
  return '';
}
// 그 도시에 있는 같은 위키데이터 항목의 장소들(도시 명소 → 대표 명소 → 추가 명소 순): [{ name(한글), area, allDay('fullDay'|'dayTrip'|'') }]
function cityPlacesByQid(cityKey, qid) {
  const c = CITY_DATA[cityKey];
  if (!c || !qid) return [];
  const mediaQid = (name) => PLACE_IMAGES.byKey.get(`${cityKey}|${name}`)?.wikidata || '';
  return [
    ...(c.highlights || []).filter((h) => mediaQid(h.name) === qid),
    ...MUST_ATTRACTIONS.filter((m) => m.cityKey === cityKey && mediaQid(m.name) === qid),
    ...EXTRA_PLACES.filter((e) => e.cityKey === cityKey && e.wikidata === qid)
  ].map((x) => ({ name: x.name, area: x.area || c.label, allDay: x.fullDay ? 'fullDay' : (x.dayTrip ? 'dayTrip' : '') }));
}
// 고른 카드(_picks) 중 경로 도시가 아닌 도시의 카드가 경로 도시에도 있는 장소면(같은 위키데이터 항목) 그 경로 도시의 카드로 바꾼다.
// 이름은 그대로 둔다: 같은 항목이라도 하는 일이 다를 수 있다(오카다마의 '오도리 야경'과 삿포로의 '오도리 공원'은 같은 오도리 공원).
// 띄어쓰기만 다른 같은 이름(오카다마 '삿포로 TV타워', 삿포로 '삿포로 TV 타워')은 그 도시의 한글 이름으로 맞춰, 한 일정에 두 번 들어가지 않게 한다.
// 경로 도시에 같은 항목이 없는 장소(삿포로 일정의 '하코다테 아침시장')는 그대로 둔다(그 도시가 경로에 더해진다).
// 이웃 도시 쌍 밖의 큐레이션 당일치기 겹침에도 쓰인다: 오사카 일정의 '히메지성 (고베)', 오사카 일정의 '나라 공원·도다이지 (교토)',
// 구마모토 일정의 '구로카와 온천 (오이타)', 다카마쓰 일정의 '지추 미술관 (오카야마)', 아오모리 일정의 '오이라세 계류 (미사와)'는
// 그 도시로 따로 이동하지 않고 경로 도시의 당일치기로 든다. 경로 도시에서 하루짜리인 곳(아오모리의 '오이라세 계곡')은
// 이름이 달라도('오이라세 계류') 하루짜리로 둔다(90분 방문으로 줄지 않게).
function foldSharedPlacePicks(picks, routeCityKeys) {
  const route = [...new Set((routeCityKeys || []).filter((k) => CITY_DATA[k]))];
  if (!Array.isArray(picks) || !route.length) return picks;
  return picks.map((p) => {
    const pk = cityKeyByLabel(p?.city);
    if (!pk || !CITY_DATA[pk] || route.includes(pk)) return p;
    const koGuess = koPlaceNameForLabel(p.name, pk);
    const qid = cityPlaceQid(pk, [p.nameKo, p.name, koGuess]);
    if (!qid) return p;
    const nameIsKo = /[가-힣]/.test(String(p.name || ''));
    const ko = String(p.nameKo || (nameIsKo ? p.name : koGuess) || '').trim();
    for (const rk of route) {
      const hits = cityPlacesByQid(rk, qid);
      if (!hits.length) continue;
      const hit = hits.find((h) => placeNameKey(h.name) === placeNameKey(ko)) || hits[0];
      const out = { ...p, city: CITY_DATA[rk].label };
      if (ko && hit.name !== ko && placeNameKey(hit.name) === placeNameKey(ko)) {
        if (p.nameKo || !nameIsKo) out.nameKo = hit.name; else out.name = hit.name;
      }
      const oldCityNames = new Set([CITY_DATA[pk].label, ...['ko', 'en', 'ja'].map((l) => localizedCityName(pk, l))]);
      if (!out.area || oldCityNames.has(String(out.area).trim())) out.area = hit.area;
      const allDay = hit.allDay || hits.map((h) => h.allDay).find(Boolean) || '';
      if (allDay && !allDayPlaceKind(out, rk)) Object.assign(out, { [allDay]: true, bestTime: '09:00-18:00', stayMin: 480 });
      return out;
    }
    return p;
  });
}

function deriveRouteCities(payload, picks, defaultCityLabel) {
  const out = [];
  const add = (label) => {
    const v = String(label || '').trim();
    if (!v) return;
    if (!out.includes(v)) out.push(v);
  };

  const regionDayPlan = Array.isArray(payload._regionDayPlan) ? payload._regionDayPlan : [];
  regionDayPlan.forEach((item) => {
    const cityLabel = String(item?.cityLabel || '').trim();
    const key = cityKeyByInput(cityLabel) || cityKeyByLabel(cityLabel);
    const city = CITY_DATA[key];
    add(city?.label || cityLabel);
  });

  const routeCities = Array.isArray(payload._routeCities) ? payload._routeCities : [];
  routeCities.forEach((c) => {
    const k = cityKeyByInput(c);
    const city = CITY_DATA[k];
    add(city?.label || c);
  });

  const cityCount = new Map();
  (Array.isArray(picks) ? picks : []).forEach((p) => {
    const c = String(p?.city || '').trim();
    if (!c) return;
    cityCount.set(c, (cityCount.get(c) || 0) + 1);
  });
  const sortedByCount = Array.from(cityCount.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  sortedByCount.forEach(add);
  add(defaultCityLabel);
  return out;
}

function resolveCityLabelFromRegionToken(token, fallbackCityKey = '') {
  const raw = String(token || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/[(){}\[\],.!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const stopWords = ['일정', '여행', '추천', '숙소', '공항', '맛집', '테마', '지역', '도시', '주말', '평일'];
  if (stopWords.includes(cleaned)) return '';
  const directKey = detectCityKeyByInput(cleaned) || cityKeyByLabel(cleaned);
  if (directKey && CITY_DATA[directKey]) return CITY_DATA[directKey].label;
  const orderedKeys = detectMentionedCityKeysOrdered(cleaned);
  if (orderedKeys.length > 0 && CITY_DATA[orderedKeys[0]]) return CITY_DATA[orderedKeys[0]].label;
  const locality = extractRequestedLocality(cleaned);
  if (locality) {
    const mapped = LOCALITY_PARENT_CITY_MAP[locality] || cityKeyFromLandmark(locality);
    if (mapped && CITY_DATA[mapped]) return CITY_DATA[mapped].label;
  }
  const byLandmark = cityKeyFromLandmark(cleaned);
  if (byLandmark && CITY_DATA[byLandmark]) return CITY_DATA[byLandmark].label;
  const fallbackKey = detectCityKeyByInput(fallbackCityKey);
  if (fallbackKey && CITY_DATA[fallbackKey]) return CITY_DATA[fallbackKey].label;
  return '';
}

// 도시별 일수를 셀 글: 날짜('10월 15일'·'Oct 15')·일차('2일차'·'2日目'·'Day 2')·하루 장소 수('1日2か所')·하루 예산('1日1万円')을 지운다.
// '교토 2일 더' 같은 말은 남긴다(첫 메시지에서는 그 도시 몫이고, 후속 대화의 증감은 parseCityDayDeltas가 따로 본다).
function regionDaysText(text) {
  return stripDateAndDayNumberPhrases(text)
    .replace(new RegExp(PER_DAY_PLACES_JA_RE.source, 'g'), ' ')
    .replace(new RegExp(PER_DAY_MONEY_RE.source, 'g'), ' ');
}

// 도시별 일수 단위(ko/en/ja): 박·泊·nights / 일·日間·日·days. '2일차'·'2日目'·'一日中'과 '1일권'·'1日券'(하루 승차권)은 일수가 아니다.
const REGION_NIGHT_UNIT_SRC = '(?:박|泊|nights?\\b)';
const REGION_DAY_UNIT_SRC = '(?:일(?!\\s*(?:차|권))|日間|日(?![目中券])|days?\\b)';
const REGION_NIGHT_IN_WINDOW_RE = new RegExp(`(\\d{1,2})\\s*${REGION_NIGHT_UNIT_SRC}`, 'i');
const REGION_DAY_IN_WINDOW_RE = new RegExp(`(\\d{1,2})\\s*${REGION_DAY_UNIT_SRC}`, 'i');
const REGION_UNIT_COUNT_RE = new RegExp(`\\d{1,2}\\s*(?:${REGION_NIGHT_UNIT_SRC}|${REGION_DAY_UNIT_SRC})`, 'gi');
// 일수가 도시 앞에 오는 말(도시 이름 바로 앞 글의 끝).
// 이어 주는 말이 있으면 그 도시 몫이 분명하다: "3 days in Osaka", "3日間は大阪"·"2泊は京都で", "3일은 오사카"·"3일 동안은 오사카".
// 한국어 '3일간'·'3일 동안'은 조사 '은·는'이 붙을 때만 여기다: '오사카 3일간 교토 2일간'·'도쿄는 3일 동안 오사카는 2일 동안'의
// '3일간'·'3일 동안'은 앞 도시 몫이다(다음 도시 몫으로 잘라 앞 도시가 일수를 잃던 문제, 2026-10-03).
const DAYS_BEFORE_CITY_STRONG_RES = [
  /(\d{1,2})\s*(days?|nights?)\s+(?:in|at)\s+$/i,
  /(\d{1,2})\s*(日間|日|泊)\s*(?:は|を)\s*$/,
  /(\d{1,2})\s*(일간|일|박)\s*(?:은|는|동안은|간은)\s*$/
];
// 일수만 붙어 있는 말("3일 오사카, 2일 교토", "3日間大阪、2日間京都", "3일 동안 도쿄, 2일 동안 오사카")은 '오사카 3일 교토 2일'의 '3일'(교토 바로 앞)과 모양이 같아서
// 글 전체가 '일수 → 도시' 순서일 때(첫 도시 앞에 일수가 있고 마지막 도시 뒤에는 없을 때)나, 앞 도시가 그 일수를 쓰지 않았을 때만 쓴다.
const DAYS_BEFORE_CITY_LOOSE_RE = /(\d{1,2})\s*(days?|nights?|日間|日|泊|일간|일|박)\s*(?:동안\s*)?$/i;
// 다음 도시를 먼저 간다는 말(두 도시 사이 글의 끝): 'Kyoto 2 days after …', '… before that', 'その前に', '그 전에'
const VISIT_EARLIER_MARK_RE = /(?:\bafter|\bbefore\s+that\s*,?|その前に\s*、?|그\s*전에\s*,?)\s*$/i;

// 도시 바로 앞(from~to) 글 끝의 일수 { at(숫자 위치), days, unit, strong }. 'N박 M일'·'N nights M days'의 M일은 여행 전체 일수라서 뺀다.
function daysBeforeCity(raw, from, to) {
  const seg = raw.slice(Math.min(from, to), to);
  const base = to - seg.length;
  let hit = null;
  let strong = false;
  let topic = '';
  for (const re of DAYS_BEFORE_CITY_STRONG_RES) {
    hit = re.exec(seg);
    if (hit) {
      strong = true;
      topic = re === DAYS_BEFORE_CITY_STRONG_RES[2] ? 'ko' : (re === DAYS_BEFORE_CITY_STRONG_RES[1] && /は\s*$/.test(hit[0]) ? 'ja' : '');
      break;
    }
  }
  if (!hit) hit = DAYS_BEFORE_CITY_LOOSE_RE.exec(seg);
  if (!hit) return null;
  if (/\d\s*(?:박|泊)\s*$|\d\s*nights?\s*(?:and\s*|,\s*|\/\s*)?$/i.test(seg.slice(0, hit.index))) return null;
  // during: '2일 동안 오사카'(느슨한 말이지만 '동안'이 붙어 다음 도시 몫이 분명할 때가 많다, extractRegionDayPlanFromText의 afterElsewhere)
  // topic: 'N일은·N박은'(ko)·'N泊は·N日間は'(ja). extractRegionDayPlanFromText가 앞 도시 바로 뒤에 붙은 것은 앞 도시 몫으로 돌린다
  return { at: base + hit.index, days: Number(hit[1]), unit: /^(?:n|박|泊)/i.test(hit[2]) ? 'night' : 'day', strong, topic, during: !strong && /동안\s*$/.test(hit[0]) };
}

// 글 속 첫 도시별 일수 { at, days, unit }('오사카 3일', '大阪に2泊', 'Kyoto 1 night').
// 도시 이름에서 가장 가까운 일수를 쓴다: 구간 뒤쪽의 박·泊('東京3日間、箱根で1泊', '도쿄 3일, 호텔 2박')은 그 도시 몫이 아니다.
function firstRegionDaysIn(text, base = 0) {
  const s = String(text || '');
  const night = REGION_NIGHT_IN_WINDOW_RE.exec(s);
  const day = REGION_DAY_IN_WINDOW_RE.exec(s);
  const useNight = Boolean(night) && (!day || night.index <= day.index);
  const m = useNight ? night : day;
  return m ? { at: base + m.index, days: Number(m[1]), unit: useNight ? 'night' : 'day' } : null;
}

// 뒤의 일수가 앞 일수 안에 든다는 표시: "Tokyo 5 days including 2 days in Kyoto", "東京5日間、そのうち箱根2日", "도쿄 총 5일, 그중 하코네 2일".
// 앞에 일수가 있고, 표시 바로 뒤(문장 부호 없이 16자 안)에 일수가 올 때만 본다('including Universal Studios'는 아니다). 위치, 없으면 -1.
const INCLUDED_DAYS_MARK_SRC = '(?:\\bincluding\\b|\\bincl\\.|\\b(?:out\\s+)?of\\s+which\\b|そのうち|のうち|그\\s*중(?:에서|에)?|(?<=\\d\\s*(?:일|박)\\s*)중(?:에서|에)?)';
function includedDaysMarkIndex(text) {
  const raw = String(text || '');
  const re = new RegExp(`${INCLUDED_DAYS_MARK_SRC}(?=[^,.!?、。\\n]{0,16}?\\d{1,2}\\s*(?:${REGION_NIGHT_UNIT_SRC}|${REGION_DAY_UNIT_SRC}))`, 'gi');
  const anyDays = new RegExp(REGION_UNIT_COUNT_RE.source, 'i');
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (anyDays.test(raw.slice(0, m.index))) return m.index;
  }
  return -1;
}

// 숫자 없이 말로 쓴 일수: '하루는 디즈니'·'이틀은'·'one day at Disney'·'一日はディズニー'. ('하루카스'·'a day trip'은 아니다)
const INCLUDED_WORD_DAYS_SRC = '(?:(?:하루|이틀|사흘|나흘|닷새)(?:간)?(?:는|은|도|만|를|을|쯤|정도|종일)?(?![가-힣])'
  + '|\\b(?:one|two|three|four|five|a)\\s+(?:full\\s+)?days?\\b(?!\\s*-?\\s*trips?\\b)|[一二三四五]\\s*(?:日間|日(?![目中本]))|半日)';
// 위 표시(mark 위치) 바로 뒤에 온 첫 일수의 위치('도쿄 3일 중 1일은 디즈니'의 '1', 'including 2 days in Kyoto'의 '2',
// '도쿄 4일 그중 하루는 디즈니랜드 오사카 2일'의 '하루'). 없으면 -1.
function includedDaysNumberAt(text, mark) {
  if (!(mark >= 0)) return -1;
  const raw = String(text || '');
  const re = new RegExp(`${INCLUDED_DAYS_MARK_SRC}[^,.!?、。\\n]{0,16}?(?=\\d{1,2}\\s*(?:${REGION_NIGHT_UNIT_SRC}|${REGION_DAY_UNIT_SRC})|${INCLUDED_WORD_DAYS_SRC})`, 'iy');
  re.lastIndex = mark;
  const m = re.exec(raw);
  return m ? mark + m[0].length : -1;
}
// 표시 뒤 도시 목록이 끝나는 말: 'including 2 days in Kyoto, then Osaka 2 days'의 then, '그 다음', 'その後', 문장 끝
const INNER_LIST_BREAK_RE = /\bthen\b|\bafter\b|\bafterwards?\b|\blater\b|그\s*다음|다음(?:에|으로)|그\s*후|이후|나서|끝나고|その後|それから|次に|[.。!?！？\n]/i;

// 도시 안에서 하는 일(장소가 아닌 말): '도쿄 디즈니랜드 1일, 시내 3일'·'쇼핑 2일'·'Tokyo city 3 days'·'東京市内3日'.
// 명소 몫 일수만 있는 도시에 더한다(extractRegionDayPlanFromText). 데이터 없는 지역으로는 세지 않는다(멈춤 낱말).
const REGION_ACTIVITY_WORDS = new Set(['시내', '관광', '시내관광', '쇼핑', '자유', '자유시간', '자유일정', '휴식', '구경', '산책', '투어', '맛집', '먹방',
  'city', 'downtown', 'sightseeing', 'shopping', 'free', 'rest', 'leisure', 'tour', 'tours', 'food',
  '市内', '観光', '市内観光', 'ショッピング', '買い物', '自由', '自由行動', '街歩き', '散策', '休憩', 'フリー', 'グルメ', '食べ歩き']);

// 그 도시의 하루짜리 대표 명소(fullDay: 테마파크 등) 이름·별칭·en/ja 이름. 도시마다 한 번 만든다.
const _fullDayLabelCache = new Map();
function fullDayPlaceLabelsOf(cityKey) {
  if (_fullDayLabelCache.has(cityKey)) return _fullDayLabelCache.get(cityKey);
  const names = new Set(MUST_ATTRACTIONS.filter((m) => m.cityKey === cityKey && m.fullDay).map((m) => m.name));
  (CITY_DATA[cityKey]?.highlights || []).forEach((h) => { if (h.fullDay) names.add(h.name); });
  const labels = names.size === 0 ? [] : Array.from(new Set([
    ...Array.from(names),
    ...MUST_ATTRACTIONS.filter((m) => m.cityKey === cityKey && names.has(m.name)).flatMap((m) => m.aliases || []),
    ...placeLabelIndex().filter((e) => e.ck === cityKey && names.has(e.ko)).map((e) => e.label)
  ].map((l) => String(l || '').toLowerCase().trim()).filter(Boolean)));
  _fullDayLabelCache.set(cityKey, labels);
  return labels;
}

// 낱말이 그 도시의 하루짜리 명소를 가리키는지: '디즈니랜드'·'디즈니'·'유니버셜'·'USJ'·'Disneyland'·'ディズニーランド'.
// 도시 이름('도쿄'·'Tokyo')과 멈춤 낱말('Japan'·'재팬'처럼 이름 속 일반 낱말)은 아니다.
function isFullDayPlaceWordOf(token, cityKey) {
  const t = String(token || '').toLowerCase().trim();
  if (t.length < 2 || !CITY_DATA[cityKey] || exactCityKeyForToken(t)) return false;
  if (REGION_SEGMENT_STOP_WORDS.has(t) || REGION_SEGMENT_STOP_WORDS_EN.has(t) || REGION_SEGMENT_STOP_WORDS_JA.has(t)) return false;
  const labels = fullDayPlaceLabelsOf(cityKey);
  if (/^[a-z0-9 .'-]+$/.test(t)) {
    if (t.length < 3) return false;
    return labels.some((l) => l === t || aliasInText(l, t) || (t.length >= 5 && l.split(/[^a-z0-9]+/).some((w) => w.startsWith(t))));
  }
  return labels.some((l) => l.includes(t));
}

// 도시 이름과 일수 사이 글(between)에 그 도시의 하루짜리 명소가 있는지('도쿄 디즈니랜드 1일'의 ' 디즈니랜드 ')
function fullDayPlaceBetween(between, cityKey) {
  const tokens = String(between || '').match(/[가-힣]{2,}|[A-Za-z][A-Za-z'-]+|[一-鿿゠-ヿ]{2,}/g) || [];
  return tokens.some((t) => isFullDayPlaceWordOf(t.replace(/(에서|으로|은|는|에|쪽|의)$/, ''), cityKey));
}

// 일수 앞(또는 영어 'N days in X'의 뒤) 낱말이 그 도시 몫인지: 시내·관광·쇼핑 같은 일, 같은 도시 이름('도쿄 시내 3일'·'東京市内3日'),
// 그 도시 안의 동네·명소. 다른 도시의 동네·명소와 데이터 없는 지역(하코네 등, 따로 더한다)은 아니다.
// activityOnly: 도시 이름이 글에 없을 때(명소 이름으로 도시를 찾은 글) — 도시로 읽히는 낱말은 이미 그 도시 일수로 세었다.
function isCityPartDayToken(token, cityKey, activityOnly = false) {
  const base = String(token || '').trim().replace(/(에서|으로|은|는|에|쪽)$/, '');
  const variants = Array.from(new Set([base, base.replace(JA_REGION_SUFFIX_RE, '')])).filter((v) => v.length >= 2);
  const label = CITY_DATA[cityKey]?.label || '';
  return variants.some((v) => {
    const lower = v.toLowerCase();
    if (REGION_ACTIVITY_WORDS.has(lower)) return true;
    const resolved = resolveCityLabelFromRegionToken(v, '');
    if (resolved) return !activityOnly && resolved === label;
    if (cityAreaWordSet().has(lower)) return (CITY_AREA_WORDS[cityKey] || []).some((w) => String(w).toLowerCase() === lower);
    return isInCityPlaceWord(v, [cityKey]);
  });
}

// 앞 일수가 뒤 일수 안에 든다는 말: '도쿄 디즈니랜드 1일 포함해서 도쿄 4일'·'디즈니랜드 1일 포함 3일'·'…1日含めて東京4日' → 뒤 일수가 그 도시 전체다
const INCLUDES_PREV_DAYS_RE = /포함|\bincluding\b|\bincl\b|含め|込み/i;
const INCLUDES_PREV_TOKEN_RE = /^(?:포함(?:해서|하여|하고|한)?|총|including|incl|含めて|込み|込みで|合計)$/i;
// 일수 바로 앞('…포함 총 3일')이나 바로 뒤('Tokyo 4 days in total including Disney')에 전체라는 말이 있는지
const INCLUDES_PREV_TAIL_RE = /(?:포함(?:해서|하여|하고|한)?|\bincluding\b|\bincl\.?|含めて|込みで?)\s*(?:총|전체|全部で|合計|in\s+total|total)?\s*$/i;
const TOTAL_DAYS_AFTER_RE = /^\d{1,2}\s*[^\s\d,，、。.;；]*\s*(?:은|는)?\s*(?:in\s+total|total|including|incl\b|in\s+all|전체|합계|포함|含め|込み|全部で|合計)/i;
// 글(seg)의 마지막 일수 표현 뒤 글: '도쿄 3일(디즈니 포함) 오사카 2일 도쿄 1일'의 '포함'은 두 번째 도쿄 일수와 상관없다
function textAfterLastDays(seg) {
  const s = String(seg || '');
  const last = [...s.matchAll(REGION_UNIT_COUNT_RE)].pop();
  return last ? s.slice(last.index + last[0].length) : s;
}

// win(from = 명소 몫 일수의 숫자 위치, to = 그 도시 구간 끝) 안에서 다른 도시가 쓰지 않은(used) 같은 단위 일수 중 그 도시 몫인 것
// [{ at, days, total }]. total: 앞 일수를 포함한 그 도시 전체 일수('…1일 포함해서 도쿄 4일'의 4일, 더하지 않고 바꾼다)
function cityPartDaysIn(raw, win, unit, used, activityOnly = false) {
  const out = [];
  const start = win.from + ((/^\d{1,2}/.exec(raw.slice(win.from)) || [''])[0].length);
  const re = new RegExp(`(\\d{1,2})\\s*(${REGION_NIGHT_UNIT_SRC}|${REGION_DAY_UNIT_SRC})`, 'gi');
  re.lastIndex = start;
  let m;
  while ((m = re.exec(raw)) !== null && m.index < win.to) {
    if (used.has(m.index)) continue;
    if ((/^(?:박|泊|n)/i.test(m[2]) ? 'night' : 'day') !== unit) continue;
    const pre = raw.slice(start, m.index);
    // 'N박 M일'·'N nights M days'의 M일은 여행 전체 일수다
    if (/\d\s*(?:박|泊)\s*$|\d\s*nights?\s*(?:and\s*|,\s*|\/\s*)?$/i.test(pre)) continue;
    const tm = /([가-힣]{2,15}|[A-Za-z][A-Za-z'-]{1,15}|[一-鿿゠-ヿ]{2,12})\s*(?:で|に|は|を)?\s*[:：]?\s*$/.exec(pre);
    const em = /^\d{1,2}\s*(?:days?|nights?)\s+(?:in|at|of|for)\s+(?:the\s+)?([A-Za-z][A-Za-z'-]{1,15})/i.exec(raw.slice(m.index));
    const totalWord = Boolean(tm && INCLUDES_PREV_TOKEN_RE.test(tm[1])) || INCLUDES_PREV_TAIL_RE.test(pre);
    if (totalWord || [tm && tm[1], em && em[1]].filter(Boolean).some((t) => isCityPartDayToken(t, win.key, activityOnly))) {
      out.push({ at: m.index, days: Number(m[1]), total: totalWord || INCLUDES_PREV_DAYS_RE.test(textAfterLastDays(pre)) || TOTAL_DAYS_AFTER_RE.test(raw.slice(m.index)) });
    }
  }
  return out;
}

// 도시 이름과 일수 사이 글이 숙소 이야기면('오사카 난바 숙소 3일', '도쿄 디즈니랜드 근처 숙소 3일') 그 일수는 도시 전체 몫이다
const STAY_WORDS_RE = /숙소|호텔|숙박|민박|료칸|근처|주변|\bstay(?:ing)?\b|\bhotels?\b|\bnear(?:by)?\b|\baround\b|宿|ホテル|旅館|近く|周辺/i;
// '시내'·'관광' 말고 도시 안 일을 가리키는 말(그 밖의 말은 REGION_ACTIVITY_WORDS)
const CITY_PART_EXTRA_WORDS = new Set(['center', 'centre', 'central', 'area', '도심', '중심가', '中心部', '街中']);

// 도시 이름과 일수 사이 글(between)의 낱말. 조사는 extractUnknownRegionSegments처럼 뗀다('삿포로'·'이케부쿠로'의 '로'는 떼지 않는다).
function betweenWords(between) {
  return (String(between || '').match(/[가-힣]{2,}|[A-Za-z][A-Za-z'-]+|[一-鿿゠-ヿ]{2,}/g) || [])
    .map((w) => w.replace(/(에서|으로|은|는|에|쪽|의)$/, '')).filter((w) => w.length >= 2);
}

// 사이 글에 그 도시의 동네·명소·당일치기 지역 같은 장소가 있는지('교토 아라시야마 1일', '도쿄 하코네 1일', 'Tokyo Disneyland 1 day').
// 그러면 그 일수는 도시 전체가 아니라 그곳 몫이다. 멈춤 낱말·하는 일('여행'·'쇼핑')·도시 이름·부사('여유롭게')와 숙소 이야기는 아니다.
function subPlaceBetween(between) {
  if (STAY_WORDS_RE.test(String(between || ''))) return false;
  return betweenWords(between).some((w) => !isRegionStopToken(w) && !REGION_ACTIVITY_WORDS.has(w.toLowerCase()) && !exactCityKeyForToken(w)
    && !/[가-힣](?:게|히|서|며|면)$/.test(w));
}

// 일수 바로 앞 낱말이 데이터 없는 지역이면('도쿄 하코네 1일'의 하코네) 그 일수는 그 지역 몫이다(extractUnknownRegionSegments가 따로 더한다).
// 영어·일본어는 그 함수처럼 아는 지역 이름일 때만(unitWord: 일수 단위 낱말 'day'·'日'·'일')
function regionTokenBeforeDays(between, cityKey, unitWord = '일') {
  const words = betweenWords(between);
  const w = words[words.length - 1];
  return Boolean(w) && !resolveCityLabelFromRegionToken(w, '') && !isRegionStopToken(w) && !isInCityPlaceWord(w, [cityKey])
    && !isFullDayPlaceWordOf(w, cityKey) && !REGION_ACTIVITY_WORDS.has(w.toLowerCase())
    && (!isEnJaRegionPhrase(w, unitWord) || isKnownRegionNameEnJa(w));
}

// 같은 도시를 다시 말한 곳 [{ key, idx, end }]: 첫 언급(mentions) 뒤의 같은 이름. 다른 낱말 속('히가시오사카'·'東京都'의 京都·'Tokyoite')은 뺀다.
// (일본어는 앞 글자가 한자일 때만 다른 낱말 속으로 본다: 'また大阪1日'의 'た'는 조사·말이다)
function findCityReMentions(raw, mentions) {
  const lower = String(raw || '').toLowerCase();
  const script = (ch) => (/[가-힣]/.test(ch) ? 'ko' : /[一-鿿]/.test(ch) ? 'ja' : /[a-z]/i.test(ch) ? 'en' : '');
  const spans = mentions.map((m) => [m.idx, m.idx + String(m.matched || '').trim().length]);
  const out = [];
  for (const m of mentions) {
    const name = String(m.matched || '').trim().toLowerCase();
    if (name.length < 2) continue;
    const sc = script(name[0]);
    let from = m.idx + name.length;
    let at;
    while ((at = lower.indexOf(name, from)) >= 0) {
      from = at + name.length;
      if (sc && script(raw[at - 1] || '') === sc) continue;
      if (sc === 'en' && script(raw[at + name.length] || '') === 'en') continue;
      if (spans.some(([s, e]) => at < e && at + name.length > s)) continue;
      out.push({ key: m.key, idx: at, end: at + name.length });
    }
  }
  return out.sort((a, b) => a.idx - b.idx);
}

// 다시 말한 도시 이름과 그 일수 사이 글이 조사뿐이면 direct('다시 도쿄 1일', 'Osaka 1 day'),
// 시내·관광 같은 말뿐이면 part('교토 시내 2일', 'Tokyo city 3 days', '東京市内3日'), 그 밖('도쿄 디즈니랜드 1일'·'오사카성 1일')은 ''.
function reMentionKind(between) {
  const s = String(between || '');
  if (/[^\s:：,，、가-힣A-Za-z぀-ヿ一-鿿'-]/.test(s)) return '';
  const words = s.replace(/[:：,，、]/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/(?:에서|으로|은|는|에|로|도|만|의|쪽|で|は|に|も|の|を|へ)+$/, '')).filter((w) => w && !/^(?:again|다시|또|また|再び)$/i.test(w));
  if (words.length === 0) return 'direct';
  return words.every((w) => REGION_ACTIVITY_WORDS.has(w.toLowerCase()) || CITY_PART_EXTRA_WORDS.has(w.toLowerCase())) ? 'part' : '';
}

// 앞 도시와 'N박은·N일은'(ko)·'N泊は·N日間は'(ja) 사이 글(between)의 모양(extractRegionDayPlanFromText).
// 'particle': 조사뿐('오사카 2박은'·'오사카에 2박은'·'도쿄는 3일은'·'大阪2泊は'·'大阪で2泊は'). 'words'(한국어만): 쉼표·마침표·다른 일수 없이
// 한글 낱말만('오사카 도착 2박은'·'오사카 호텔 2박은'·'오사카에서 먼저 2박은'·'도쿄 여행에서 3일은'). 그 밖은 ''.
function topicDaysBetweenKind(between, topic) {
  const s = String(between || '');
  if (topic === 'ja') return /^\s*(?:で|に|は|には|では|も)?\s*$/.test(s) ? 'particle' : '';
  if (/^\s*(?:에서는|에서|에는|에|은|는|도|만|으로|로)?\s*$/.test(s)) return 'particle';
  return /^[\s가-힣]+$/.test(s) ? 'words' : '';
}

function extractRegionDayPlanFromText(text, fallbackCityKey = '') {
  // 날짜·일차·'1日2か所'은 도시별 일수가 아니라서 먼저 지운다('大阪3日間、2日目にUSJ' → 오사카 3일만)
  const raw = regionDaysText(text);
  if (!raw.trim()) return [];
  const byCityWindow = [];
  const mentions = detectCityMentionsDetailed(raw);
  const endOf = (m) => m.idx + String(m.matched || '').trim().length;
  // 도시 앞 일수("3 days in Osaka", "3日間は大阪", "3일 오사카")
  const before = mentions.map((m, i) => daysBeforeCity(raw, i > 0 ? endOf(mentions[i - 1]) : 0, m.idx));
  // 'N박은·N일은'(ko)·'N泊は·N日間は'(ja)이 앞 도시 뒤에 쉼표 없이 붙었고 앞 도시 앞에 제 일수가 없으면 앞 도시 몫이다(예전 HEAD처럼 앞 도시 구간의 일수):
  // - 사이가 조사뿐: '오사카 2박은 교토 1박은'·'오사카에 2박은 교토에 1박은'·'도쿄는 3일은 오사카는 2일은'·'大阪2泊は京都で1泊' → 오사카 2박 + 교토 1박
  // - 사이에 다른 한국어 낱말: 마지막 도시 뒤에도 일수가 있어 글 전체가 '도시 → 일수' 순서일 때만('오사카 도착 2박은 교토 1박'·
  //   '오사카 호텔 2박은 교토 료칸 1박은'. 다음 도시가 뒤 일수를 가져 이 일수가 버려지고 낱말이 '데이터 없는 지역'으로 알려지던 문제).
  //   '도쿄 여행에서 3일은 오사카 2일은 교토'처럼 마지막 도시 뒤에 일수가 없으면 다음 도시 몫이다.
  // 도시가 셋이어도 같다('도쿄 3일 오사카 2일은 교토 1일은' → 도쿄 3 + 오사카 2 + 교토 1)
  // (다음 도시 몫으로 잘라 앞 도시가 일수를 잃고 도시 하나가 빠지던 회귀, 2026-10-03 · 3차 검토).
  // 글 맨 앞·쉼표 뒤('3일은 오사카, 2일은 교토'·'2泊は大阪、1泊は京都')와 앞 도시가 이미 앞에 일수를 가진 글('3일은 오사카 2일은 교토')은
  // 그대로 다음 도시 몫이다. 앞 도시 앞의 느슨한 일수가 그 앞 도시 바로 뒤 일수면('도쿄 3일 오사카'의 3일 = 도쿄 몫) 앞 도시의 것이 아니다.
  const lastMention = mentions[mentions.length - 1];
  const daysAfterLast = Boolean(lastMention && firstRegionDaysIn(raw.slice(endOf(lastMention))));
  for (let i = 1; i < mentions.length; i += 1) {
    const b = before[i];
    if (!b || !b.topic) continue;
    const prev = before[i - 1];
    if (prev && (prev.strong || i === 1 || /[\d,，、。.;；!?]/.test(raw.slice(endOf(mentions[i - 2]), prev.at)))) continue;
    const kind = topicDaysBetweenKind(raw.slice(endOf(mentions[i - 1]), b.at), b.topic);
    if (kind === 'particle' || (kind === 'words' && daysAfterLast)) before[i] = null;
  }
  const last = mentions[mentions.length - 1];
  const beforeOrder = Boolean(before[0]) && Boolean(last) && !firstRegionDaysIn(raw.slice(endOf(last)));
  // 같은 도시를 다시 말한 곳('교토 아라시야마 1일, 교토 시내 2일', '…오사카 2일 그리고 도쿄 시내 1일')과 앞 일수 안에 든다는 표시.
  // 다시 말한 곳마다 그 이름에 붙은 일수를 먼저 찾아 둔다: after(이름 뒤, 사이 글이 조사·'시내'뿐) 또는 before('3 days in Tokyo'처럼 이어 주는 말).
  // 'N일은 <장소>'로 나눈 일수('오사카에서 1일은 유니버셜')는 그 도시 몫이 아니다.
  const reMentions = findCityReMentions(raw, mentions);
  const occurrenceAt = [...mentions.map((m) => m.idx), ...reMentions.map((r) => r.idx)].sort((a, b) => a - b);
  for (const rm of reMentions) {
    const limit = occurrenceAt.find((p) => p > rm.idx) ?? raw.length;
    rm.prevAt = occurrenceAt.filter((p) => p < rm.idx).pop() ?? 0;
    const d = firstRegionDaysIn(raw.slice(rm.end, Math.max(rm.end, limit)), rm.end);
    const split = d && /^\d{1,2}\s*(?:일간|일|박|日間|日|泊|days?|nights?)\s*(?:은|는|は)\s*[^\s,，、。.]/i.test(raw.slice(d.at));
    const kind = d && !split ? reMentionKind(raw.slice(rm.end, d.at)) : '';
    rm.after = kind ? { d, kind } : null;
    const b = daysBeforeCity(raw, rm.prevAt, rm.idx);
    rm.before = b && b.strong ? b : null;
  }
  const markAt = includedDaysMarkIndex(raw);
  // 일수 표현 하나는 도시 하나에만 붙는다
  const used = new Set();
  for (let i = 0; i < mentions.length; i += 1) {
    const curr = mentions[i];
    const cityLabel = CITY_DATA[curr.key]?.label || '';
    if (!cityLabel) continue;
    const own = before[i] && !used.has(before[i].at) ? before[i] : null;
    let pick = null;
    let partialWin = null;
    let partial = false;
    let regionFirst = false;
    if (beforeOrder) {
      pick = own;
    } else {
      // '오사카 3일', 'Osaka 3 days then', '大阪3日間、', '大阪に2泊', 'Kyoto 1 night'. 다음 도시 앞 일수에 이어 주는 말이 있으면
      // ('Osaka and 2 days in Kyoto', '大阪、2日間は京都') 그 구절은 다음 도시 몫이라 이 도시의 구간은 그 앞에서 끊는다.
      // 다른 도시를 다시 말한 곳('도쿄 디즈니랜드 1일 그리고 오사카 2일 그리고 도쿄 시내 1일'의 두 번째 도쿄)에서도 끊는다.
      const next = mentions[i + 1];
      const nb = next ? before[i + 1] : null;
      let end = next ? (nb && nb.strong ? nb.at : next.idx) : raw.length;
      const otherAgain = reMentions.find((r) => (r.after || r.before) && r.key !== curr.key && r.idx > curr.idx && r.idx < end);
      if (otherAgain) end = otherAgain.before && !otherAgain.after ? Math.min(otherAgain.idx, otherAgain.before.at) : otherAgain.idx;
      const after = firstRegionDaysIn(raw.slice(curr.idx, Math.max(curr.idx, end)), curr.idx);
      // 도시 뒤 일수가 우선이다('5日間は大阪3日、京都2日'의 오사카는 3일). 없으면 도시 앞 일수('3日間は大阪、京都2日間',
      // 'Osaka 3 days then 2 days Kyoto'처럼 앞 도시가 쓰지 않은 일수).
      // 다만 도시 앞에 이어 주는 말로 일수가 붙어 있고('2 days in Kyoto', '2일은 교토', '2일 동안 오사카') 뒤 일수가 쉼표 뒤 다른 이름 몫이면
      // ('2 days in Kyoto, Nara 1 day', '2일은 교토, 나라 1일', '2일 동안 오사카, 나라 1일') 앞 일수를 쓴다(교토 1일로 읽던 문제, 2026-10-03).
      const afterElsewhere = Boolean(own && (own.strong || own.during) && after) && /[,，、。;；]\s*[^\s\d]/.test(raw.slice(endOf(curr), after.at));
      pick = after && !used.has(after.at) && !afterElsewhere ? after : own;
      if (pick && pick === after) {
        const between = raw.slice(endOf(curr), after.at);
        // 도시와 일수 사이(또는 일수 바로 뒤, 쉼표 전)에 그 도시의 장소가 있으면('교토 아라시야마 1일', '도쿄 하코네 1일', '도쿄 1일 디즈니,')
        // 그 일수는 그곳 몫이다(partial). 일수 앞 장소가 데이터 없는 지역이면(하코네) 일수는 그 지역 몫이라 따로 더해진다(regionFirst).
        const tail = /^\d{1,2}\s*[^\s\d,，、。.;；]*\s*([^,，、。.;；\d]{0,20})/.exec(raw.slice(after.at, Math.max(after.at, end)));
        partial = subPlaceBetween(between) || Boolean(tail && subPlaceBetween(tail[1]));
        regionFirst = subPlaceBetween(between) && regionTokenBeforeDays(between, curr.key, (/^\d{1,2}\s*(\S+)/.exec(raw.slice(after.at)) || [])[1]);
        // '도쿄 디즈니랜드 1일', '오사카 유니버셜 1일', '東京ディズニーランド1日': 하루짜리 명소(테마파크)면
        // 이 도시 구간에서 뒤에 오는 같은 도시·시내·관광·도시 안 장소 일수를 아래에서 더한다.
        if (partial && fullDayPlaceBetween(between, curr.key)) partialWin = { from: after.at, to: end, key: curr.key };
      }
    }
    if (!pick) continue;
    used.add(pick.at);
    const entry = { key: curr.key, cityLabel, days: clamp(pick.days, 1, 10), unit: pick.unit, at: pick.at, phraseAt: pick === own ? pick.at : curr.idx,
      mentionAt: curr.idx, partialWin, partial, regionFirst, grown: false };
    // '유니버셜 1일, 오사카 시내 2일': 도시 이름 뒤가 '시내'뿐이면 그 일수는 도시 일부다. 도시 이름 앞(앞 도시 뒤)에 그 도시의 하루짜리 명소
    // 일수가 따로 있으면 더한다(오사카 2일만 남던 문제, 2026-10-03). '오사카 3일, 유니버셜 1일'처럼 도시 일수가 먼저면 그 안이다(위 partialWin과 같음).
    if (pick === own || reMentionKind(raw.slice(endOf(curr), pick.at)) !== 'part') {
      byCityWindow.push(entry);
      continue;
    }
    const preFrom = i > 0 ? endOf(mentions[i - 1]) : 0;
    const dayRe = new RegExp(`(\\d{1,2})\\s*(${REGION_NIGHT_UNIT_SRC}|${REGION_DAY_UNIT_SRC})`, 'gi');
    dayRe.lastIndex = preFrom;
    let dm;
    while ((dm = dayRe.exec(raw)) !== null && dm.index < curr.idx) {
      if (used.has(dm.index) || (/^(?:박|泊|n)/i.test(dm[2]) ? 'night' : 'day') !== entry.unit) continue;
      const tm = /([가-힣]{2,15}|[A-Za-z][A-Za-z'-]{1,15}|[一-鿿゠-ヿ]{2,12})\s*(?:で|に|は|を)?\s*[:：]?\s*$/.exec(raw.slice(preFrom, dm.index));
      const em = /^\d{1,2}\s*(?:days?|nights?)\s+(?:in|at|of|for)\s+(?:the\s+)?([A-Za-z][A-Za-z'-]{1,15})/i.exec(raw.slice(dm.index));
      if (![tm && tm[1], em && em[1]].filter(Boolean).some((t) => isFullDayPlaceWordOf(t.replace(/(에서|으로|은|는|에|쪽)$/, ''), curr.key))) continue;
      used.add(dm.index);
      entry.days = clamp(entry.days + Number(dm[1]), 1, 10);
      entry.grown = true;
    }
    byCityWindow.push(entry);
  }
  // 더하거나(앞 일수가 그곳 몫) 바꾼다(앞 일수를 포함한 전체 일수, 또는 앞 일수가 데이터 없는 지역 몫)
  const grow = (e, extra, total) => {
    if (total) e.days = Math.max(e.days, extra);
    else if (e.regionFirst && !e.grown) e.days = extra;
    else e.days += extra;
    e.days = clamp(e.days, 1, 10);
    e.grown = true;
  };
  // 명소 몫 일수만 있는 도시(위 partialWin): 다른 도시가 쓰지 않은 같은 도시·시내·관광·쇼핑·도시 안 장소 일수를 더한다.
  // '도쿄 디즈니랜드 1일, 도쿄 시내 3일' → 도쿄 4일(같은 도시를 두 번 말한 두 번째 일수를 버려 1일 여행이 되던 문제, 2026-10-03).
  // 도시 바로 뒤 일수('도쿄 3일, 쇼핑 1일', '도쿄 3일, 디즈니랜드 1일')는 그 도시 전체라 더하지 않는다.
  // '도쿄 디즈니랜드 1일 포함해서 도쿄 4일'·'…1일 포함 3일'은 뒤 일수가 도쿄 전체다(더하면 5일이 되던 문제).
  for (const e of byCityWindow) {
    if (!e.partialWin) continue;
    for (const extra of cityPartDaysIn(raw, e.partialWin, e.unit, used)) {
      used.add(extra.at);
      grow(e, extra.days, extra.total);
    }
  }
  // 같은 도시를 다시 말한 곳의 일수를 그 도시 일수에 더한다(같은 도시를 두 번 말한 두 번째 일수를 버려 일수가 줄던 문제, 2026-10-03).
  // - 도시 이름 바로 뒤 일수('다시 도쿄 1일', 'Osaka 1 day')는 사이에 다른 곳의 일수가 있거나('오사카 3일 교토 2일 오사카 1일', '도쿄 2박, 하코네 1박, 도쿄 1박')
  //   '다시'가 있거나 앞 일수가 그 도시 안 장소 몫일 때 더한다. '오사카 2일, 오사카에서 1일은 유니버셜'처럼 바로 이어 다시 말한 것은 앞 일수 안이다.
  // - '시내'·'관광'만 사이에 둔 일수('교토 시내 2일', 'Tokyo city 3 days')는 앞 일수가 그 도시 안 장소 몫일 때만 더한다
  //   ('교토 아라시야마 1일, 교토 시내 2일' → 교토 3일, '도쿄 하코네 1일, 도쿄 시내 2일' → 도쿄 2일 + 하코네 1일. '도쿄 3일, 도쿄 시내 1일'은 3일).
  // - 장소 이름 속 도시 이름('도쿄 3일, 도쿄 디즈니랜드 1일', '오사카성 1일'), 'N일은 <장소>'로 나눈 일수('…오사카에서 1일은 유니버셜'),
  //   앞 일수 안에 든다는 표시 뒤('그중 …')는 더하지 않는다.
  for (const rm of reMentions) {
    if (markAt >= 0 && rm.idx > markAt) continue;
    const prevAt = rm.prevAt;
    let e = byCityWindow.find((x) => x.key === rm.key);
    let d = null;
    let kind = '';
    if (rm.after && !used.has(rm.after.d.at)) ({ d, kind } = rm.after);
    // 'Tokyo Disneyland 1 day and 3 days in Tokyo', '…、1日は東京'
    else if (rm.before && !used.has(rm.before.at)) { d = rm.before; kind = 'direct'; }
    if (!kind || (e && d.unit !== e.unit)) continue;
    if (!e) {
      // 첫 언급에 일수가 없던 도시('Osaka and Kyoto, Osaka 3 days Kyoto 2 days'): 다시 말한 곳의 일수가 그 도시 몫이다
      if (kind !== 'direct') continue;
      e = { key: rm.key, cityLabel: CITY_DATA[rm.key]?.label || '', days: 0, unit: d.unit, at: d.at, phraseAt: rm.idx,
        mentionAt: (mentions.find((m) => m.key === rm.key) || {}).idx ?? rm.idx, partialWin: null, partial: false, regionFirst: false, grown: true };
      if (!e.cityLabel) continue;
      byCityWindow.push(e);
      byCityWindow.sort((a, b) => a.mentionAt - b.mentionAt);
    } else if (!e.partial) {
      if (kind === 'part') continue;
      const daysBetween = (raw.slice(e.at, Math.min(rm.idx, d.at)).match(REGION_UNIT_COUNT_RE) || []).length;
      if (daysBetween < 2 && !/(?:다시|또|\bagain\b|\bback\s+to\b|再び|また)\s*$/i.test(raw.slice(prevAt, rm.idx))) continue;
    }
    used.add(d.at);
    grow(e, d.days, INCLUDES_PREV_DAYS_RE.test(textAfterLastDays(raw.slice(e.at, Math.min(rm.idx, d.at)))) || TOTAL_DAYS_AFTER_RE.test(raw.slice(d.at)));
  }
  // "Tokyo 5 days including 2 days in Kyoto", "大阪5日間のうち2日は京都": 표시 바로 뒤 일수가 도시 몫이면 그 도시와 목록으로 이어지는 도시들
  // ('東京5日間、そのうち京都2日、大阪1日', 'including 2 days in Kyoto and 1 day in Osaka')의 일수는 앞 도시 일수 안에 든다(도쿄 2 + 교토 2 + 오사카 1).
  // 'then'·'그 다음'·'その後'나 문장 끝에서 목록이 끝나고, 안에 든 일수의 합은 앞 도시 일수보다 작아야 한다.
  // 표시 바로 뒤 일수가 도시가 아닌 곳 몫이면('도쿄 3일 중 1일은 디즈니, 오사카 2일', '그중 하루는 디즈니랜드 오사카 2일')
  // 뒤에 따로 말한 도시(오사카 2일)는 빼지 않는다(2026-10-03).
  const mark = byCityWindow.length > 1 ? markAt : -1;
  if (mark >= 0) {
    const firstAt = includedDaysNumberAt(raw, mark);
    const carrier = byCityWindow.filter((e) => e.at < mark).pop();
    const start = byCityWindow.findIndex((e) => e.at === firstAt && e.at > mark);
    let innerDays = 0;
    if (carrier && start >= 0) {
      for (let k = start; k < byCityWindow.length; k += 1) {
        const e = byCityWindow[k];
        if (e.at < mark || (k > start && INNER_LIST_BREAK_RE.test(raw.slice(byCityWindow[k - 1].at, Math.max(byCityWindow[k - 1].at, e.phraseAt))))) break;
        if (innerDays + e.days >= carrier.days) break;
        innerDays += e.days;
      }
    }
    if (carrier && innerDays > 0) carrier.days -= innerDays;
  }
  // 숫자 없이 말로 쓴 일수가 일수 없는 도시에 붙은 한국어 글: '나고야 3일인데 하루는 교토 당일치기', '오사카 5일 중 하루는 교토, 하루는 고베',
  // '도쿄 5일 이틀은 교토', '나고야 3일, 교토 당일치기'(당일치기 = 하루), '오사카 5일 여행 교토 하루 고베 하루'.
  // 그 일수는 앞에서 숫자로 일수를 말한 도시(하나뿐일 때)의 일수 안에 든다 → 나고야 2 + 교토 1, 오사카 3 + 교토 1 + 고베 1.
  // 예전에는 읽지 못해 남는 날을 도시별 후보 수로 나눠 교토 2일·나고야 1일처럼 뒤집혔다(2026-10-03).
  // 확실한 모양만 본다(아니면 예전 그대로): 도시 앞 '하루는·이틀은·하루만'(조사 없는 '하루'는 앞 도시가 이미 일수를 가졌을 때만),
  // 도시 뒤 '당일치기', 도시 뒤 '하루'(앞 일수가 여행 전체라는 말 '5일 여행'·'5일 중'이 있을 때만). 그 도시 뒤(다음 도시 전)에 숫자 일수가 없고,
  // 앞 도시에 하루 이상 남고, 말한 도시가 모두 일수를 가질 때만 쓴다(일수 없는 도시가 일정에서 빠지지 않게).
  // 4차 수정(2026-10-03): 같은 뜻의 다른 모양도 읽는다(카드 수 비율로 나눠 주 도시가 줄던 회귀).
  // - 앞 도시의 'N박M일'은 여행 전체 M일이다: '나고야 2박3일 하루는 교토' → 나고야 2 + 교토 1.
  // - 두 도시 사이의 '하루는'은 뒤 도시에 일수가 따로 없으면 뒤 도시 몫이다: '오사카 5일 여행 교토 하루는 고베' → 고베 1, 일수를 따로 말하지 않은
  //   교토는 하루, 오사카가 나머지(3). '교토 하루는 고베 이틀'은 예전처럼 교토 1 + 고베 2.
  // - 영어 당일치기 목록: 'with a day trip to Kyoto and a day trip to Kobe', 'with day trips to Kyoto and Kobe', 'Nagoya 3 days, one day trip to Kyoto',
  //   'Osaka 5 days, two days in Kyoto'(쉼표·with 뒤 말로 쓴 일수).
  const WORD_DAYS = { 하루: 1, 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5 };
  const EN_WORD_DAYS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const WHOLE_TRIP_CUE_RE = /^(?:\d{1,2}\s*박\s*)?\d{1,2}\s*(?:일간|일)\s*(?:짜리\s*)?(?:여행|일정|동안|중|인데|그\s*중|코스)/;
  const wordTargets = mentions.filter((m, i) => i > 0 && CITY_DATA[m.key] && !byCityWindow.some((e) => e.key === m.key));
  if (wordTargets.length > 0) {
    const carriers = byCityWindow.filter((e) => e.mentionAt < wordTargets[0].idx);
    const c0 = carriers.length === 1 ? carriers[0] : null;
    const nightsDays = c0 && c0.unit === 'night'
      ? (/^\d{1,2}\s*(?:박|泊)\s*(\d{1,2})\s*(?:일|日)/.exec(raw.slice(c0.at)) || /^\d{1,2}\s*nights?\s*(?:and\s*|,\s*)?(\d{1,2})\s*days?\b/i.exec(raw.slice(c0.at)))
      : null;
    const carrier = c0 && (c0.unit === 'day' || nightsDays) ? c0 : null;
    const added = [];
    const usedWordAt = new Set();
    let left = carrier ? (nightsDays ? clamp(Number(nightsDays[1]), 1, 10) : carrier.days) : 0;
    let prevEn = null;
    // mentions[j] 도시 바로 뒤(그다음 도시 전)에 그 도시의 일수(말로 쓴 일수·당일치기·숫자 일수)가 있는지
    const nextCityHasOwnDays = (j) => {
      const after = raw.slice(endOf(mentions[j]), mentions[j + 1] ? mentions[j + 1].idx : raw.length);
      return /^\s*(?:에서|에|은|는|도|으로|로)?\s*(?:하루|이틀|사흘|나흘|닷새|당일치기)/.test(after) || new RegExp(REGION_UNIT_COUNT_RE.source, 'i').test(after);
    };
    for (let i = 1; carrier && i < mentions.length; i += 1) {
      const curr = mentions[i];
      if (!wordTargets.includes(curr)) { prevEn = null; continue; }
      const preFrom = endOf(mentions[i - 1]);
      const postFrom = endOf(curr);
      const pre = raw.slice(preFrom, curr.idx);
      const post = raw.slice(postFrom, mentions[i + 1] ? mentions[i + 1].idx : raw.length);
      if (new RegExp(REGION_UNIT_COUNT_RE.source, 'i').test(post) || byCityWindow.filter((e) => e.mentionAt < curr.idx).length !== 1) break;
      const prevHasDays = byCityWindow.some((e) => e.key === mentions[i - 1].key) || added.some((e) => e.key === mentions[i - 1].key);
      let days = 0;
      let at = -1;
      const wm = /(?:^|[^가-힣])(하루|이틀|사흘|나흘|닷새)(?:간)?(은|는|만|도)?\s*$/.exec(pre);
      const wmAt = wm ? preFrom + wm.index + wm[0].indexOf(wm[1]) : -1;
      if (wm && !usedWordAt.has(wmAt) && (wm[2] || prevHasDays)) { days = WORD_DAYS[wm[1]]; at = wmAt; }
      // 영어도 같은 뜻의 말만: 'Kyoto 3 days with a day trip to Tokyo', 'Tokyo 5 days, with a 2 day side trip to Kyoto'.
      // 쉼표 뒤('Nagoya 3 days, one day trip to Kyoto')와 바로 앞 도시가 당일치기였을 때의 'and'('… and a day trip to Kobe')도 같다.
      const enLead = prevEn ? '(?:\\b(?:with|including|and)|[,，])' : '(?:\\b(?:with|including)|[,，])';
      const em = !days && new RegExp(`${enLead}\\s+(?:a\\s+)?(?:(one|two|three|[1-3])\\s*-?\\s*days?\\s+side\\s*-?\\s*|(?:one\\s*-?\\s*|1\\s*-?\\s*)?day\\s*-?\\s*)(trips?)\\s+(?:to|in)\\s+$`, 'i').exec(pre);
      if (em) { days = em[1] ? ({ one: 1, two: 2, three: 3 })[em[1].toLowerCase()] || Number(em[1]) : 1; at = preFrom + em.index; }
      // 'with day trips to Kyoto and Kobe': 여럿을 묶은 당일치기의 다음 도시도 하루
      if (!days && prevEn && prevEn.plural && /^\s*(?:,\s*)?(?:and|&)?\s*$/i.test(pre) && pre.trim()) { days = 1; at = curr.idx; }
      // 'Osaka 5 days, two days in Kyoto', 'Tokyo 5 days with two days in Kyoto'(숫자 '2 days in'은 위 도시별 일수가 읽는다).
      // 앞 도시에 그보다 적게 남으면('Tokyo 3 days, two days in Kyoto') 안에 든다고 보기 어려워 읽지 않는다(예전 분배 그대로).
      const ew = !days && /(?:\b(?:with|including)|[,，])\s+(one|two|three|four|five)\s+days?\s+(?:in|at)\s+$/i.exec(pre);
      const ewDays = ew ? EN_WORD_DAYS[ew[1].toLowerCase()] : 0;
      if (ew && left - ewDays >= ewDays) { days = ewDays; at = preFrom + ew.index; }
      const enDays = days > 0;
      if (!days) {
        const am = /^\s*(?:에서|에|은|는|도)?\s*(하루|이틀|사흘|나흘|닷새)(?:간)?(?:은|는|만|도|정도)?(?![가-힣])(?!\s*더)/.exec(post);
        if (/^\s*(?:은|는|에|에서|으로|로|도)?\s*당일치기/.test(post)) { days = 1; at = curr.idx; }
        // '5일 여행 교토 하루는 고베': 도시 뒤 '하루는'이 다음 도시 바로 앞이면 다음 도시 몫이다. 이 도시는 일수를 말하지 않은 도시라 하루
        // (앞 일수가 여행 전체라는 말이 있을 때만, 아래 '도시 뒤 하루'와 같은 조건).
        // 다음 도시 뒤에 그 도시의 일수가 따로 있으면('교토 하루는 고베 이틀', '교토 이틀은 고베 하루', '교토 하루는 고베 당일치기')
        // '하루는'은 이 도시 몫이다(아래 '도시 뒤 하루'가 읽는다). 다음 도시가 그 일수를 가져가 교토·고베가 뒤바뀌던 문제(2026-10-03 검토).
        else if (mentions[i + 1] && wordTargets.includes(mentions[i + 1]) && /^\s*(?:하루|이틀|사흘|나흘|닷새)(?:간)?(?:은|는)\s*$/.test(post)
          && WHOLE_TRIP_CUE_RE.test(raw.slice(carrier.at)) && !nextCityHasOwnDays(i + 1)) { days = 1; at = curr.idx; }
        else if (am && WHOLE_TRIP_CUE_RE.test(raw.slice(carrier.at))) { days = WORD_DAYS[am[1]]; at = postFrom + am[0].indexOf(am[1]); }
      }
      prevEn = enDays ? { plural: Boolean(em && /s$/i.test(em[2] || '')) || Boolean(prevEn && prevEn.plural && !em && !ew) } : null;
      if (!days || left - days < 1) break;
      left -= days;
      usedWordAt.add(at);
      added.push({ key: curr.key, cityLabel: CITY_DATA[curr.key].label, days, unit: 'day', at, phraseAt: at, mentionAt: curr.idx,
        partialWin: null, partial: false, regionFirst: false, grown: true });
    }
    if (carrier && added.length === wordTargets.length && mentions.every((m) => !CITY_DATA[m.key] || byCityWindow.some((e) => e.key === m.key) || added.some((e) => e.key === m.key))) {
      carrier.days = left;
      carrier.unit = 'day';
      byCityWindow.push(...added);
      byCityWindow.sort((a, b) => a.mentionAt - b.mentionAt);
    }
  }
  // 뒤에 말한 도시를 먼저 가는 글: "Kyoto 2 days after 3 days in Osaka", "京都2日間、その前に大阪3日間", "교토 2일, 그 전에 오사카 3일"
  // → 두 도시의 순서를 바꾼다(일정은 도시별 일수 순서로 도시를 돈다). 'after that'·'その後'는 말한 순서 그대로다.
  for (let i = 0; i + 1 < byCityWindow.length; i += 1) {
    const a = byCityWindow[i];
    const b = byCityWindow[i + 1];
    if (VISIT_EARLIER_MARK_RE.test(raw.slice(a.at, Math.max(a.at, b.phraseAt)))) {
      byCityWindow[i] = b;
      byCityWindow[i + 1] = a;
      i += 1;
    }
  }
  if (byCityWindow.length > 0) {
    return normalizeRegionDayPlan(byCityWindow, []);
  }

  const list = [];
  const pushHint = (cityToken, amount, unit) => {
    const token = String(cityToken || '').trim();
    if (!token) return;
    if (/[0-9]/.test(token)) return;
    if (/박|일|night|day|여행|일정/i.test(token)) return;
    const n = clamp(Number(amount), 1, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const cityLabel = resolveCityLabelFromRegionToken(token, '');
    if (!cityLabel) return;
    list.push({ cityLabel, days: n, unit: unit === 'night' ? 'night' : 'day' });
  };

  const patterns = [
    { re: /([가-힣A-Za-z][가-힣A-Za-z\s]{0,18}?)(?:에서|은|는|에|쪽)?\s*(\d{1,2})\s*박/g, unit: 'night', tokenIdx: 1, numIdx: 2 },
    { re: /([가-힣A-Za-z][가-힣A-Za-z\s]{0,18}?)(?:에서|은|는|에|쪽)?\s*(\d{1,2})\s*일/g, unit: 'day', tokenIdx: 1, numIdx: 2 },
    { re: /(\d{1,2})\s*박\s*([가-힣A-Za-z][가-힣A-Za-z\s]{0,18})/g, unit: 'night', tokenIdx: 2, numIdx: 1 },
    { re: /(\d{1,2})\s*일\s*([가-힣A-Za-z][가-힣A-Za-z\s]{0,18})/g, unit: 'day', tokenIdx: 2, numIdx: 1 }
  ];

  for (const p of patterns) {
    let match = null;
    while ((match = p.re.exec(raw)) !== null) {
      pushHint(match[p.tokenIdx], match[p.numIdx], p.unit);
    }
  }

  // Known-city targeted parsing for "교토 1박", "오사카 2일" style.
  for (const [key, city] of Object.entries(CITY_DATA)) {
    const label = String(city?.label || '').trim();
    if (!label || !raw.includes(label)) continue;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const night = new RegExp(`${escaped}\\s*(?:에서|은|는|에|쪽)?\\s*(\\d{1,2})\\s*박`);
    const day = new RegExp(`${escaped}\\s*(?:에서|은|는|에|쪽)?\\s*(\\d{1,2})\\s*일`);
    const mNight = raw.match(night);
    if (mNight) list.push({ cityLabel: CITY_DATA[key].label, days: clamp(Number(mNight[1]), 1, 10), unit: 'night' });
    const mDay = raw.match(day);
    if (mDay) list.push({ cityLabel: CITY_DATA[key].label, days: clamp(Number(mDay[1]), 1, 10), unit: 'day' });
  }

  const merged = new Map();
  for (const item of list) {
    const key = `${item.cityLabel}|${item.unit}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, { ...item });
    else prev.days = clamp(prev.days + item.days, 1, 10);
  }
  const normalized = Array.from(merged.values()).filter((x) => {
    const label = String(x.cityLabel || '');
    return !/^(으로|로|에서|여행|일정)$/.test(label);
  }).slice(0, 6);
  // 도시 이름 없이 하루짜리 명소로만 도시를 찾은 글('디즈니랜드 1일 시내 3일'): 시내·관광·쇼핑 일수도 그 도시 몫이라 더한다(2026-10-03)
  if (mentions.length === 0 && normalized.length === 1) {
    const only = normalized[0];
    const onlyKey = cityKeyByLabel(only.cityLabel);
    if (onlyKey && fullDayPlaceBetween(raw, onlyKey)) {
      for (const extra of cityPartDaysIn(raw, { from: 0, to: raw.length, key: onlyKey }, only.unit, new Set(), true)) {
        only.days = clamp(extra.total ? Math.max(only.days, extra.days) : only.days + extra.days, 1, 10);
      }
    }
  }
  if (normalized.length > 0) return normalized;
  if (fallbackCityKey && CITY_DATA[fallbackCityKey]) {
    return [];
  }
  return [];
}

function inferDaysFromRegionPlan(regionDayPlan, fallbackDays) {
  const plan = Array.isArray(regionDayPlan) ? regionDayPlan : [];
  if (plan.length === 0) return clamp(Number(fallbackDays || 4), 1, 10);
  const dayTotal = plan.filter((x) => x.unit === 'day').reduce((acc, x) => acc + Number(x.days || 0), 0);
  const nightTotal = plan.filter((x) => x.unit === 'night').reduce((acc, x) => acc + Number(x.days || 0), 0);
  if (dayTotal > 0 && nightTotal === 0) return clamp(dayTotal, 1, 10);
  if (dayTotal === 0 && nightTotal > 0) return clamp(nightTotal + 1, 1, 10);
  return clamp(dayTotal + nightTotal, 1, 10);
}

function normalizeRegionDayPlan(rawPlan, fallback = []) {
  const src = Array.isArray(rawPlan) ? rawPlan : (Array.isArray(fallback) ? fallback : []);
  const out = [];
  const seen = new Set();
  for (const item of src) {
    const cityToken = String(item?.cityLabel || item?.city || '').trim();
    const cityLabel = resolveCityLabelFromRegionToken(cityToken, '');
    if (!cityLabel) continue;
    const unit = String(item?.unit || 'day').toLowerCase() === 'night' ? 'night' : 'day';
    const days = clamp(Number(item?.days || 0), 1, 10);
    const key = `${cityLabel}|${unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cityLabel, days, unit });
    if (out.length >= 6) break;
  }
  return out;
}

// 도시가 여럿인데 지역별 일수가 한 도시뿐이고 전체 기간을 다 덮으면 그것은 도시별 일수가 아니라 전체 기간이다
// ("1박2일로 도쿄 오사카 후쿠오카" → '도쿄 2일', "2박3일 도쿄 갔다가 오키나와" → '도쿄 3일'). 그대로 쓰면 나머지 도시가 말없이 빠진다.
function isWholeTripRegionPlan(plan, routeCount, days) {
  if (!Array.isArray(plan) || plan.length !== 1 || !(routeCount > 1)) return false;
  const only = plan[0] || {};
  const n = Number(only.days) || 0;
  return (only.unit === 'night' ? n + 1 : n) >= (Number(days) || 1);
}

// 주 도시: '아사히카와 3일 아라시야마 공원'처럼 전체 일수가 이름으로 말한 도시 하나에 붙었고(위 분배라 버린다),
// 경로의 다른 도시는 모두 도시 이름 없이 장소로만 들어왔으면(아라시야마 → 교토) 그 도시다. 채팅이 specialPrefs.mainCity로 넘기고
// allocateDaysByCities가 장소 도시에는 그 도시의 꼭 갈 곳을 넣을 만큼만(placeCityMinDays, 보통 하루), 주 도시에 남는 날을 준다.
// 다른 도시도 이름으로 말했거나('도쿄 오사카 5일', '2박3일 도쿄 갔다가 오키나와') 주 도시 몫이 2일이 안 되면 정하지 않는다(예전 분배 그대로).
function mainCityForPlaceOnlyRoute(plan, routeCities, days, namedCityLabels) {
  const route = Array.from(new Set((Array.isArray(routeCities) ? routeCities : []).map((c) => String(c || '').trim()).filter(Boolean)));
  if (!isWholeTripRegionPlan(plan, route.length, days)) return '';
  const main = String(plan[0]?.cityLabel || '').trim();
  if (!route.includes(main) || !namedCityLabels.has(main)) return '';
  const others = route.filter((c) => c !== main);
  if (others.length === 0 || others.some((c) => namedCityLabels.has(c))) return '';
  return (Number(days) || 0) - others.length >= 2 ? main : '';
}

// 주 도시 분배의 일수 기준(allocateDaysByCities의 mainCtx): 꼭 갈 곳(resolveMustVisit 결과)의 도시와 하루짜리 종류(fullDay 테마파크 |
// dayTrip 먼 당일치기 | ''), 첫날·마지막 날 시간 경계(flightDayBounds, '첫날 짧게'면 15:00), 하루 장소 수. 일정 요청 하나에서 한 번 만들어
// 규칙 일정(createItinerary)·규칙 후처리·AI dayPlan이 같은 값을 쓴다(_mainCityCtx). 화면이 보낸 값은 쓰지 않는다(INTERNAL_MAIN_CTX).
const INTERNAL_MAIN_CTX = new WeakSet();
function mainCityNeedContext(mustVisit, payload, prefs = {}) {
  const bounds = flightDayBounds(payload || {}, prefs || {});
  const day1 = Number.isFinite(bounds.day1MinStart) ? bounds.day1MinStart : (prefs?.firstDayShort ? 15 * 60 : null);
  const overnightKey = typeof prefs?.overnightAt === 'string' ? placeNameKey(prefs.overnightAt) : '';
  const ctx = {
    musts: (Array.isArray(mustVisit) ? mustVisit : []).filter((m) => m && m.city).map((m) => ({
      city: String(m.city).trim(),
      kind: m.allDay ? (allDayPlaceKind(m.pick || m.synthetic || { name: m.nameKo || m.name, city: m.city }, cityKeyByLabel(m.city)) || 'dayTrip') : '',
      // 묵고 오는 곳('하코네 온천 료칸')은 다음 날도 그 도시에서 시작한다
      ...(overnightKey && [m.nameKo, m.name].some((n) => placeNameKey(n) === overnightKey) ? { overnight: true } : {})
    })),
    day1MinStart: day1,
    lastDayMaxEnd: Number.isFinite(bounds.lastDayMaxEnd) ? bounds.lastDayMaxEnd : null,
    maxPlacesPerDay: clamp(Number(prefs?.maxPlacesPerDay) || 3, 1, 4)
  };
  INTERNAL_MAIN_CTX.add(ctx);
  return ctx;
}

// 주 도시 분배에서 장소로만 들어온 도시(경로 idx번째, 모두 n곳)가 받아야 할 일수: 그 도시의 꼭 갈 곳을 다 넣을 수 있는 가장 적은 날 수.
// - 반나절 장소는 하루 2곳(오전·오후, '하루 1곳'이면 1곳), 하루짜리(테마파크·먼 당일치기)는 하루에 하나만.
// - 테마파크(fullDay)는 그 도시의 첫날(여행 첫날이거나 도시 이동일)과 여행 마지막 날에 넣지 않는다(createItinerary의 '종일' 칸과 같다).
// - 늦게 도착한 첫날(도착+90분이 14시 넘음)·일찍 떠나는 마지막 날(출발−120분이 13시 전)에는 아무것도 넣지 않는다고 본다.
// - 묵고 오는 곳(specialPrefs.overnightAt, '하코네 온천 료칸')이 있으면 다음 날 하루를 더 둔다.
// 꼭 갈 곳이 없으면 하루. 주 도시 몫을 남기지 못하면 totalDays(= 주 도시 분배를 쓰지 않는다).
// ('도쿄 5일 유니버설 오후 3시 도착'·'도쿄 5일 아라시야마 금각사 기요미즈데라 후시미이나리'에서 장소 도시를 하루로 줄여
// 유니버설·기요미즈데라가 일정에서 빠지던 문제, 2026-10-03 검토)
function placeCityMinDays(city, idx, n, totalDays, ctx) {
  const musts = (ctx && Array.isArray(ctx.musts) ? ctx.musts : []).filter((m) => m && m.city === city);
  if (musts.length === 0) return 1;
  const full = musts.filter((m) => m.kind === 'fullDay').length;
  const dayTrip = musts.filter((m) => m.kind === 'dayTrip').length;
  const half = musts.length - full - dayTrip;
  // 묵고 오는 곳이 있으면 다음 날 하루를 더 둔다(아래 반나절 칸 수에 하루를 더한다)
  const overnight = musts.some((m) => m.overnight) ? 1 : 0;
  const perDay = Math.min(2, clamp(Number(ctx.maxPlacesPerDay) || 3, 1, 4));
  const isFirst = idx === 0;
  const isLast = idx === n - 1;
  const lateArrival = isFirst && Number.isFinite(ctx.day1MinStart) && ctx.day1MinStart > 14 * 60;
  const earlyDeparture = isLast && Number.isFinite(ctx.lastDayMaxEnd) && ctx.lastDayMaxEnd < 13 * 60;
  for (let k = 1; k < totalDays; k += 1) {
    let usable = 0;
    let fullOk = 0;
    for (let i = 0; i < k; i += 1) {
      if ((lateArrival && i === 0) || (earlyDeparture && i === k - 1)) continue;
      usable += 1;
      if (i > 0 && !(isLast && i === k - 1)) fullOk += 1;
    }
    if (fullOk >= full && usable - full >= dayTrip + Math.ceil(half / perDay) + overnight) return k;
  }
  return totalDays;
}

function allocateDaysByCities(routeCities, picks, totalDays, regionDayPlan = [], mainCity = '', mainCtx = null) {
  const days = Math.max(1, Number(totalDays) || 1);
  if (!Array.isArray(routeCities) || routeCities.length === 0) return new Array(days).fill('');
  if (routeCities.length === 1) return routeCities.flatMap((c) => new Array(days).fill(c));

  let normalizedPlan = normalizeRegionDayPlan(regionDayPlan, []);
  // "1박2일로 도쿄 오사카 후쿠오카", "2박3일 도쿄 갔다가 오키나와": 전체 기간이 첫 도시 옆에 있어 '도쿄 2일'로 읽힌 분배.
  // 도시가 여럿인데 한 도시가 전체 기간을 다 가져가면 그 분배는 쓰지 않는다(나머지 도시가 말없이 빠지던 문제, 2026-10-03).
  const distinctRoute = new Set(routeCities.map((c) => String(c || '').trim()).filter(Boolean));
  if (isWholeTripRegionPlan(normalizedPlan, distinctRoute.size, days)) normalizedPlan = [];
  if (normalizedPlan.length > 0) {
    const route = Array.from(new Set([
      ...routeCities.map((c) => String(c || '').trim()).filter(Boolean),
      ...normalizedPlan.map((x) => x.cityLabel)
    ]));
    const planByCity = new Map(route.map((c) => [c, 0]));
    const explicitDays = normalizedPlan.filter((x) => x.unit === 'day');
    const explicitNights = normalizedPlan.filter((x) => x.unit === 'night');

    if (explicitDays.length > 0) {
      explicitDays.forEach((x) => {
        planByCity.set(x.cityLabel, (planByCity.get(x.cityLabel) || 0) + x.days);
      });
      let remain = days - Array.from(planByCity.values()).reduce((a, b) => a + b, 0);
      if (remain > 0 && explicitNights.length > 0) {
        const weights = explicitNights.map((x) => ({ city: x.cityLabel, weight: x.days }));
        const sumW = weights.reduce((a, b) => a + b.weight, 0) || 1;
        const dist = weights.map((x) => ({
          city: x.city,
          add: Math.floor((x.weight / sumW) * remain),
          frac: ((x.weight / sumW) * remain) % 1
        }));
        dist.forEach((x) => planByCity.set(x.city, (planByCity.get(x.city) || 0) + x.add));
        let rest = remain - dist.reduce((a, b) => a + b.add, 0);
        dist.sort((a, b) => b.frac - a.frac);
        let idx = 0;
        while (rest > 0 && dist.length > 0) {
          const cityLabel = dist[idx % dist.length].city;
          planByCity.set(cityLabel, (planByCity.get(cityLabel) || 0) + 1);
          rest -= 1;
          idx += 1;
        }
      }
    } else {
      const sumNights = explicitNights.reduce((a, b) => a + b.days, 0);
      if (sumNights > 0) {
        if (days === sumNights + 1) {
          explicitNights.forEach((x) => {
            planByCity.set(x.cityLabel, (planByCity.get(x.cityLabel) || 0) + x.days);
          });
          planByCity.set(explicitNights[0].cityLabel, (planByCity.get(explicitNights[0].cityLabel) || 0) + 1);
        } else {
          const dist = explicitNights.map((x) => ({
            city: x.cityLabel,
            add: Math.max(1, Math.floor((x.days / sumNights) * days)),
            frac: ((x.days / sumNights) * days) % 1
          }));
          dist.forEach((x) => planByCity.set(x.city, x.add));
          let remain = days - dist.reduce((a, b) => a + b.add, 0);
          dist.sort((a, b) => b.frac - a.frac);
          let idx = 0;
          while (remain > 0 && dist.length > 0) {
            const cityLabel = dist[idx % dist.length].city;
            planByCity.set(cityLabel, (planByCity.get(cityLabel) || 0) + 1);
            remain -= 1;
            idx += 1;
          }
        }
      }
    }

    let sumAlloc = Array.from(planByCity.values()).reduce((a, b) => a + b, 0);
    if (sumAlloc < days) {
      const fillOrder = route.length > 0 ? route : routeCities;
      let idx = 0;
      while (sumAlloc < days && fillOrder.length > 0) {
        const cityLabel = fillOrder[idx % fillOrder.length];
        planByCity.set(cityLabel, (planByCity.get(cityLabel) || 0) + 1);
        sumAlloc += 1;
        idx += 1;
      }
    } else if (sumAlloc > days) {
      const reduceOrder = [...route].reverse();
      let idx = 0;
      while (sumAlloc > days && reduceOrder.length > 0) {
        const cityLabel = reduceOrder[idx % reduceOrder.length];
        const curr = planByCity.get(cityLabel) || 0;
        if (curr > 1) {
          planByCity.set(cityLabel, curr - 1);
          sumAlloc -= 1;
        }
        idx += 1;
        if (idx > 200) break;
      }
      while (sumAlloc > days) {
        const cityLabel = route[route.length - 1] || route[0];
        const curr = planByCity.get(cityLabel) || 0;
        if (curr <= 0) break;
        planByCity.set(cityLabel, curr - 1);
        sumAlloc -= 1;
      }
    }

    const sequence = [];
    route.forEach((c) => {
      const d = Math.max(0, Number(planByCity.get(c) || 0));
      for (let i = 0; i < d; i += 1) sequence.push(c);
    });
    if (sequence.length < days) {
      const fill = route[0] || routeCities[0] || '';
      while (sequence.length < days) sequence.push(fill);
    }
    return sequence.slice(0, days);
  }

  // 지역별 일수가 없을 때: 주 도시(mainCityForPlaceOnlyRoute)가 있으면 장소로만 들어온 도시는 그 도시의 꼭 갈 곳을 넣을 만큼만
  // (placeCityMinDays, mainCtx), 주 도시가 나머지(경로 순서). 주 도시가 아래 후보 수 분배보다 더 받을 때만 쓴다(장소 도시가 꼭 갈 곳을 넣을
  // 날을 잃지 않고, 주 도시가 줄지 않게). 후보 수 비율로 나누면 30곳 데이터로 장소 도시의 후보가 늘어 '아사히카와 3일 아라시야마 공원'의
  // 아사히카와가 하루만 받았다(2026-10-03).
  const main = typeof mainCity === 'string' ? mainCity.trim() : '';
  if (main && routeCities.includes(main) && distinctRoute.size === routeCities.length) {
    const base = allocateDaysByPickCounts(routeCities, picks, days);
    const baseMain = base.filter((c) => c === main).length;
    const needs = routeCities.map((c, i) => (c === main ? 0 : placeCityMinDays(c, i, routeCities.length, days, mainCtx)));
    const mainDays = days - needs.reduce((a, b) => a + b, 0);
    if (mainDays >= 2 && mainDays > baseMain) return routeCities.flatMap((c, i) => new Array(c === main ? mainDays : needs[i]).fill(c));
    return base;
  }
  return allocateDaysByPickCounts(routeCities, picks, days);
}

// 지역별 일수가 없을 때의 기본 분배: 도시마다 하루, 남는 날은 후보 수 비율의 소수 부분이 큰 도시부터 돌아가며.
function allocateDaysByPickCounts(routeCities, picks, days) {
  const counts = new Map(routeCities.map((c) => [c, 1]));
  (Array.isArray(picks) ? picks : []).forEach((p) => {
    const c = String(p?.city || '').trim();
    if (!c || !counts.has(c)) return;
    counts.set(c, counts.get(c) + 1);
  });

  const sum = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
  const baseAlloc = new Map(routeCities.map((c) => [c, 1]));
  let remaining = days - routeCities.length;

  if (remaining > 0) {
    const ratios = routeCities.map((c) => {
      const exact = (counts.get(c) / sum) * days;
      return { c, frac: exact - Math.floor(exact) };
    }).sort((a, b) => b.frac - a.frac);
    let idx = 0;
    while (remaining > 0) {
      const target = ratios[idx % ratios.length].c;
      baseAlloc.set(target, (baseAlloc.get(target) || 1) + 1);
      remaining -= 1;
      idx += 1;
    }
  }

  const sequence = [];
  routeCities.forEach((c) => {
    const d = Math.max(1, baseAlloc.get(c) || 1);
    for (let i = 0; i < d; i += 1) sequence.push(c);
  });
  return sequence.slice(0, days);
}

// 같은 이름이 여러 도시에 있는 대표 명소(예: 나라 공원·도다이지 = 오사카·교토)는 지금 경로 도시의 것 하나만 남긴다.
function dedupeMustMatches(matches, preferredCityKeys = []) {
  const prefer = new Set(preferredCityKeys.filter(Boolean));
  const byName = new Map();
  for (const m of matches || []) {
    const prev = byName.get(m.name);
    if (!prev || (!prefer.has(prev.cityKey) && prefer.has(m.cityKey))) byName.set(m.name, m);
  }
  return Array.from(byName.values());
}

const REGION_SEGMENT_STOP_WORDS = new Set(['여행', '일정', '총', '전체', '하루', '이틀', '주말', '평일', '연휴', '휴가', '겨울', '여름', '가을', '정도', '최소', '최대', '대략', '그리고', '추가', '포함', '부모님', '가족', '친구', '혼자', '커플', '먹방', '온천', '료칸', '위주', '중심',
  // 장소가 아닌 말('도쿄 3일, 호텔 2박'·'쇼핑 1일'·'자유시간 1일'·'예산 1일 5만원')
  '호텔', '숙소', '숙박', '쇼핑', '자유', '자유시간', '자유일정', '예산', '관광', '휴식', '시내', '렌터카', '투어',
  // 앞 일수 안에 든다는 표시('오사카 3일 그중 1일은 유니버셜'의 '그중'은 지역이 아니다)
  '그중', '그중에', '그중에서', '중에', '중에서',
  // 나라 이름('유니버셜 스튜디오 재팬 1일'의 '재팬'은 지역이 아니다), 남은 날('나머지 3일은 도쿄 시내'), '도쿄는 다시 1일'의 '다시'
  '재팬', '일본', '나머지', '남은', '다시',
  // '디즈니랜드 1일 포함해서 4일'의 '포함해서'
  '포함해서', '포함하여', '포함하고', '포함한', '포함해', '포함하면']);

// "오사카 3일 교토 2일 나라 1일"처럼 도시별 일수 중, 데이터에 도시가 없는 곳(나라 등)의 일수.
// 전체 일수에 더하고(빠뜨리지 않게) 미지원 지역으로 알린다.
// 영어·일본어도 본다: 'Koyasan 1 day', '1 day in Koyasan', '高野山1日', '高野山で1泊'.
// 영어는 대문자로 시작하는 이름만(문장 첫 낱말 'Then'·'Japan' 같은 말은 뺀다), 일본어는 한자·가타카나 이름만('のんびり1日'은 장소가 아니다).
const REGION_SEGMENT_STOP_WORDS_EN = new Set(['then', 'and', 'also', 'plus', 'just', 'only', 'about', 'around', 'another', 'extra', 'spend', 'stay', 'maybe', 'total',
  'japan', 'trip', 'day', 'days', 'night', 'nights', 'first', 'last', 'next', 'for', 'in', 'at', 'the', 'with', 'after', 'before', 'free', 'rest',
  'visit', 'see', 'explore', 'go', 'add', 'include', 'including',
  // 장소가 아닌 말('JR Pass 7 days'·'Shopping 1 day'·'Hotel 2 nights')
  'jr', 'pass', 'rail', 'shopping', 'hotel', 'hotels', 'ryokan', 'onsen', 'budget', 'food', 'gourmet', 'relax', 'relaxing', 'leisure', 'beach',
  'city', 'downtown', 'tour', 'tours', 'travel', 'transit', 'flight', 'drive', 'driving', 'rental', 'car', 'nightlife', 'remaining', 'again']);
const REGION_SEGMENT_STOP_WORDS_JA = new Set(['日本', '観光', '自由', '自由行動', '移動', '休養', '温泉', '旅行', '合計', '全部', '全体', '滞在', '日程', '予定', '週末', '連休', '家族', '一人',
  // 장소가 아닌 말('ショッピング1日'·'ホテルは2泊'·'予算は1日…')
  'ショッピング', '買い物', 'ホテル', '旅館', '宿', '宿泊', 'グルメ', '食べ歩き', 'フリー', '予算', '休み', '休憩', 'パス', 'レンタカー', 'ドライブ',
  '市内', '街歩き', '散策', '温泉旅館', 'テーマパーク', '残り']);
// 지역 이름 뒤에 붙는 말: '浅草観光1日' → 浅草
const JA_REGION_SUFFIX_RE = /(?:観光|散策|巡り|めぐり|周辺|エリア|方面|旅行|滞在)$/;

// 도시 이름도 지역 이름도 아닌 말: 멈춤 낱말, 단위('最終日'·'自由時間'·'2泊'), 패스('JR패스'·'JR Pass'), 일반 표현·금액·음식
function isRegionStopToken(token) {
  const t = String(token || '').trim();
  if (!t) return true;
  if (REGION_SEGMENT_STOP_WORDS.has(t) || REGION_SEGMENT_STOP_WORDS_JA.has(t) || REGION_SEGMENT_STOP_WORDS_EN.has(t.toLowerCase())) return true;
  if (/박|일|night|day/i.test(t)) return true;
  if (/日間|泊|時間|行動|日$/.test(t)) return true;
  if (/(?:패스|pass)$/i.test(t)) return true;
  return NON_PLACE_GENERIC_RE.test(t) || MONEY_OR_BUDGET_RE.test(t) || isFoodWord(t);
}

// 데이터 도시 안의 동네·명소 이름(ko/en/ja). '東京3日間、浅草1日'·'Tokyo 3 days, Harajuku 1 day'의 동네는 그 도시 몫이라
// 데이터 없는 지역으로 세지 않는다(한국어 '아사쿠사'·'하라주쿠'처럼. 랜드마크 낱말 LANDMARK_CITY_HINTS에 없는 이름도 여기 둔다).
// 당일치기 명소(하코네·나라·고야산)는 넣지 않는다: 한국어처럼 데이터 없는 지역으로 세고 당일치기로 넣는다.
const CITY_AREA_WORDS = {
  tokyo: ['아사쿠사', '시부야', '신주쿠', '긴자', '하라주쿠', '우에노', '이케부쿠로', '아키하바라', '롯폰기', '롭폰기', '오다이바', '츠키지', '쓰키지', '오모테산도',
    '에비스', '나카메구로', '시모키타자와', '기치조지', '신바시', '마루노우치', '니혼바시', '아카사카', '료고쿠', '시나가와', '도요스', '야나카', '디즈니', '디즈니랜드', '디즈니씨', '스카이트리',
    'asakusa', 'shibuya', 'shinjuku', 'ginza', 'harajuku', 'ueno', 'ikebukuro', 'akihabara', 'akiba', 'roppongi', 'odaiba', 'tsukiji', 'omotesando',
    'ebisu', 'nakameguro', 'shimokitazawa', 'kichijoji', 'shinbashi', 'shimbashi', 'marunouchi', 'nihonbashi', 'akasaka', 'ryogoku', 'shinagawa', 'toyosu', 'yanaka',
    'disney', 'disneyland', 'disneysea', 'skytree',
    '浅草', '渋谷', '新宿', '銀座', '原宿', '上野', '池袋', '秋葉原', 'アキバ', '六本木', 'お台場', '台場', '築地', '表参道',
    '恵比寿', '中目黒', '下北沢', '吉祥寺', '新橋', '丸の内', '日本橋', '赤坂', '両国', '品川', '豊洲', '谷中', 'ディズニー', 'ディズニーランド', 'ディズニーシー', 'スカイツリー'],
  osaka: ['난바', '우메다', '신사이바시', '도톤보리', '신세카이', '덴노지', '텐노지', '쓰루하시', '츠루하시', '나카노시마', '구로몬',
    'namba', 'umeda', 'shinsaibashi', 'dotonbori', 'shinsekai', 'tennoji', 'tsuruhashi', 'nakanoshima', 'kuromon', 'usj',
    '難波', 'なんば', '梅田', '心斎橋', '道頓堀', '新世界', '天王寺', '鶴橋', '中之島', '黒門', '通天閣', 'ユニバ', 'ユニバーサル'],
  kyoto: ['기온', '아라시야마', '후시미', '가와라마치', '히가시야마', '폰토초', '사가노', '니시키',
    'gion', 'arashiyama', 'fushimi', 'kawaramachi', 'higashiyama', 'pontocho', 'sagano', 'nishiki',
    '祇園', '嵐山', '伏見', '河原町', '東山', '先斗町', '嵯峨野', '錦市場'],
  fukuoka: ['하카타', '텐진', '덴진', '나카스', '모모치', '캐널시티', 'hakata', 'tenjin', 'nakasu', 'momochi', 'canal city', '博多', '天神', '中洲', '百道', 'ももち', 'キャナルシティ'],
  sapporo: ['스스키노', '오도리', 'susukino', 'odori', 'すすきの', '薄野', '大通'],
  okinawa: ['나하', '국제거리', '온나', '차탄', '츄라우미', 'naha', 'kokusai dori', 'kokusai-dori', 'onna', 'chatan', 'churaumi', '那覇', '国際通り', '恩納', '北谷', '美ら海'],
  hiroshima: ['미야지마', '이쓰쿠시마', '이츠쿠시마', 'miyajima', 'itsukushima', '宮島', '厳島'],
  nagoya: ['사카에', '오스', 'sakae', 'osu', '大須'],
  kanazawa: ['겐로쿠엔', '히가시차야', 'kenrokuen', 'higashi chaya', '兼六園', 'ひがし茶屋街', '東茶屋街']
};
let _cityAreaWordSet = null;
function cityAreaWordSet() {
  if (!_cityAreaWordSet) {
    _cityAreaWordSet = new Set(Object.entries(CITY_AREA_WORDS).filter(([k]) => CITY_DATA[k]).flatMap(([, words]) => words.map((w) => String(w).toLowerCase())));
  }
  return _cityAreaWordSet;
}

// 낱말이 데이터 도시 안의 동네·명소면(위 표, 또는 데이터 속 장소 이름의 일부: 'Disneyland' ⊂ 'Tokyo Disneyland', '浅草' ⊂ '浅草寺')
// 지역이 아니라 도시 안의 장소다. 당일치기 명소(하코네·나라)는 한국어처럼 지역으로 둔다.
// 한국어 낱말은 위 표만 본다(나머지는 랜드마크 낱말로 이미 걸러진다. 표에 없는 한국어 낱말은 예전과 같다).
// cityKeys(여행 도시)를 주면 다른 도시 장소 이름에만 든 낱말은 일반 낱말일 때만 도시 안 장소로 본다(아래 isGenericPlaceNamePart).
function isInCityPlaceWord(token, cityKeys = null) {
  const t = String(token || '').toLowerCase().trim();
  if (t.length < 2) return false;
  const sub = dayTripSubstituteFor(t);
  if (sub && MUST_ATTRACTIONS.some((m) => m.name === sub && m.dayTrip)) return false;
  if (cityAreaWordSet().has(t)) return true;
  if (/[가-힣]/.test(t)) return false;
  // 로마자는 장소 이름 속 낱말로('Ueno' ⊂ 'Ueno Park'), 한자·가나는 장소 이름 속 글자로('宮島'처럼 두 글자도) 본다
  const roman = /^[a-z0-9 .'-]+$/.test(t);
  if (roman && t.length < 3) return false;
  const hit = (e) => (roman ? aliasInText(e.lower, t) : e.lower.includes(t));
  const keys = Array.isArray(cityKeys) && cityKeys.length > 0 ? new Set(cityKeys) : null;
  if (!keys) return placeLabelIndex().some(hit);
  if (placeLabelIndex().some((e) => keys.has(e.ck) && hit(e))) return true;
  return isGenericPlaceNamePart(t, placeLabelIndex().filter((e) => !keys.has(e.ck) && hit(e)), roman);
}

// 이름 앞·가운데에만 나오는 일본어 일반 낱말(花見 ⊂ 후쿠시마 '花見山公園'): 장소 종류·하는 일이지 지역 이름이 아니다
const JA_GENERIC_PLACE_WORDS = new Set(['花見', '紅葉', '花火', '夜桜']);

// 여행 도시가 아닌 도시의 장소 이름(others)에만 든 낱말이 장소 종류 같은 일반 낱말인지(그러면 예전처럼 지역으로 세지 않는다).
// - 이름 끝에 붙는 말은 장소 종류다: 水族館 ⊂ 'サンシャイン水族館', ビーチ ⊂ '米原ビーチ', 'Aquarium' ⊂ 'Sunshine Aquarium'
// - 여러 도시 장소 이름에 드는 말도 일반 낱말이다: 海水浴 ⊂ '下浜海水浴場'·'一湊海水浴場', 高原 ⊂ '美ヶ原高原美術館'·'城島高原パーク'
// - 가타카나 낱말(ラベンダー·スパ)은 외래어 일반 낱말로 본다
// 한 도시 장소 이름의 앞·가운데에만 들면 일반 낱말이 아니다: '京都3日間、宇治1日'의 宇治(가고시마 '一宇治城').
// (데이터 없는 지역으로 셀지는 extractUnknownRegionSegments가 아는 지역 이름(isKnownRegionNameEnJa)으로 따로 정한다: 宇治는 세고 長浜은 세지 않는다)
// (그전에는 여행 도시만 보아 '大阪3日間、水族館1日'의 水族館까지 지역으로 세어 하루가 늘던 문제를 고쳤다)
function isGenericPlaceNamePart(t, others, roman) {
  if (others.length === 0) return false;
  if (JA_GENERIC_PLACE_WORDS.has(t)) return true;
  if (/^[゠-ヿ]+$/.test(t)) return true;
  if (new Set(others.map((e) => e.ck)).size >= 2) return true;
  return others.some((e) => (roman ? e.lower.endsWith(` ${t}`) : (e.lower.length > t.length && e.lower.endsWith(t))));
}

// 영어·일본어로 쓴 '이름 + 일수'('Koyasan 1 day'·'高野山1日'·'1 day in Hakone')는 서버가 아는 지역 이름일 때만 데이터 없는 지역으로 센다(2026-10-03).
// 아는 이름: 당일치기 대표 명소(MUST_ATTRACTIONS dayTrip: 하코네·나라·고야산·가마쿠라·닛코·히메지 …)의 이름·en/ja 별칭과 아래 작은 목록
// (데이터에 도시도 당일치기 명소도 없는 근교 지역: 우지·요코하마·오노미치 …).
// 그 밖의 낱말은 예전처럼 세지 않는다(하루를 더하지 않고 '데이터 없음' 알림도 없다): 일반 낱말(紅葉·寺院·デパート·'Temples'·'Museums'),
// 도시 안 명소의 별칭('Kinkakuji'·'Byodoin'·'Sensoji'·'Meiji Shrine'·'Disney Sea'), 여러 곳에 쓰이는 이름(長浜·Nagahama).
// 그런 낱말을 지역으로 세어 하루가 늘고 거짓 알림이 나가던 회귀(일본어 일반 낱말 200건 등)를 고쳤다. 한국어 낱말 + 한국어 단위('우지 1일')는 예전 그대로다.
const KNOWN_REGION_WORDS_EN_JA = new Set(['uji', '宇治', 'yokohama', '横浜', 'onomichi', '尾道', 'itoshima', '糸島', 'jozankei', '定山渓',
  'inuyama', '犬山', 'takao', 'mt takao', 'mount takao', 'takaosan', '高尾山', 'kawagoe', '川越']);
function isKnownRegionNameEnJa(token) {
  const t = String(token || '').toLowerCase().trim();
  if (t.length < 2) return false;
  if (KNOWN_REGION_WORDS_EN_JA.has(t)) return true;
  return MUST_ATTRACTIONS.some((m) => m.dayTrip && (mustNameEquals(m, t)
    || (m.aliases || []).some((a) => aliasInText(t, String(a).toLowerCase())) || (m.contextAliases || []).some((a) => contextAliasInText(t, a))));
}
// 영어·일본어 쪽으로 볼 '이름 + 일수': 단위가 영어·일본어(days·日間·泊)이거나 이름이 한자·가나일 때. 한국어 단위의 한글·로마자 이름('Hakone 1일')은 한국어 쪽이다.
function isEnJaRegionPhrase(token, unitWord) {
  return !/^(?:일|박)/.test(String(unitWord || '')) || /[぀-ヿ一-鿿]/.test(String(token || ''));
}

// cityKeys: 여행 도시(다른 도시 장소 이름에만 든 낱말은 일반 낱말일 때만 도시 안 장소로 본다, isInCityPlaceWord)
function extractUnknownRegionSegments(text, cityKeys = null) {
  const out = [];
  const raw = regionDaysText(text);
  // "Tokyo 5 days in total, including 2 days in Hakone": 표시 뒤의 일수는 전체 일수 안에 든다(더하지 않는다, included)
  const mark = includedDaysMarkIndex(raw);
  // 일수 표현 하나는 이름 하나에만 붙는다: 쉼표 없는 '1 day in Koyasan 2 days in Kyoto'의 '2 days'를 'Koyasan 2 days'로 또 세지 않는다
  const usedAt = new Set();
  const claim = (at) => {
    if (usedAt.has(at)) return false;
    usedAt.add(at);
    return true;
  };
  const push = (token, amount, unitWord, at) => {
    if (!token || token.length < 2) return;
    if (resolveCityLabelFromRegionToken(token, '')) return;
    if (isRegionStopToken(token)) return;
    if (isInCityPlaceWord(token, cityKeys)) return;
    if (isEnJaRegionPhrase(token, unitWord) && !isKnownRegionNameEnJa(token)) return;
    out.push({ token, days: clamp(Number(amount), 1, 10), unit: /^(?:박|泊|night)/i.test(unitWord) ? 'night' : 'day', included: mark >= 0 && at > mark });
  };
  let m;
  // 영어 이름 앞 일수('1 day in Koyasan')부터 본다: 이어 주는 말(in/at)이 있어 그 이름 몫이 분명하다('Spend 1 day in Koyasan')
  const enName = "[A-Z][A-Za-z'-]{1,15}(?:\\s+[A-Z][A-Za-z'-]{1,15})?";
  const enBefore = new RegExp(`\\b(\\d{1,2})\\s*([Dd]ays?|[Nn]ights?)\\s+(?:in|at)\\s+(${enName})`, 'g');
  const enAfter = new RegExp(`(?<![A-Za-z])(${enName})\\s+(\\d{1,2})\\s*([Dd]ays?|[Nn]ights?)\\b`, 'g');
  const enToken = (name) => {
    const words = String(name || '').split(/\s+/).filter((w) => !REGION_SEGMENT_STOP_WORDS_EN.has(w.toLowerCase()));
    return words.join(' ');
  };
  while ((m = enBefore.exec(raw)) !== null) if (claim(m.index)) push(enToken(m[3]), m[1], m[2], m.index);
  // 한국어(기존)·일본어: 이름 + (조사) + N일/N박/N日間/N日/N泊
  const re = /([가-힣A-Za-z]{2,12}|[一-鿿゠-ヿ]{2,12})\s*(?:에서|은|는|에|쪽|で|に|は)?\s*(\d{1,2})\s*(일(?!\s*차)|박|日間|日(?![目中])|泊)/g;
  while ((m = re.exec(raw)) !== null) {
    const at = m.index + m[0].search(/\d/);
    if (!claim(at)) continue;
    // 도시 이름 자체가 '로'로 끝나는 곳(삿포로)이 있어서, 조사를 떼기 전 낱말로 먼저 도시인지 본다.
    if (resolveCityLabelFromRegionToken(m[1], '')) continue;
    let token = m[1].replace(/(에서|으로|은|는|에|쪽)$/, '');
    const bare = token.replace(JA_REGION_SUFFIX_RE, '');
    if (bare !== token && bare.length >= 2) token = bare;
    push(token, m[2], m[3], at);
  }
  // 영어 이름 뒤 일수: 'Koyasan 1 day'. 대소문자를 구분해 고유 이름만 본다.
  while ((m = enAfter.exec(raw)) !== null) {
    const at = m.index + m[0].search(/\d/);
    if (claim(at)) push(enToken(m[1]), m[2], m[3], at);
  }
  return out;
}

// 데이터에 도시는 없지만 당일치기 데이터(대표 명소)가 있는 지역 → 그 명소 이름. 없으면 ''.
function dayTripSubstituteFor(token, preferredCityKeys = []) {
  const lower = String(token || '').toLowerCase().trim();
  if (!lower) return '';
  const hits = dedupeMustMatches(MUST_ATTRACTIONS.filter((m) => (m.fullDay || m.dayTrip)
    && (mustNameEquals(m, lower) || (m.aliases || []).some((a) => aliasInText(lower, a)) || (m.contextAliases || []).some((a) => contextAliasInText(lower, a)))), preferredCityKeys);
  return hits[0]?.name || '';
}

function parseTravelChatInput(payload = {}) {
  const message = String(payload.message || '').trim();
  const context = payload.context || {};
  // 부정된 구절("디즈니랜드는 빼고", "쇼핑은 빼줘")을 지운 글로 도시·가고 싶은 곳을 찾는다.
  const positive = stripNegatedPhrases(message);
  // 도시 찾기용 글: 다른 도시 장소 이름 속 도시 이름('Matsumoto Seicho Memorial Museum'의 Matsumoto = 기타큐슈 명소)은 지운다
  const cityText = maskOtherCityPlaceNames(positive);
  const specialPrefs = parseSpecialPrefsFromText(message);
  const locality = extractRequestedLocality(cityText);
  const fallbackCity = cityKeyByInput(context.city || 'tokyo');
  const airportInText = extractAirportCodeFromText(message);
  const cityFromAirport = cityKeyByAirport(airportInText);
  const cityFromLocalityMap = locality ? (LOCALITY_PARENT_CITY_MAP[locality] || '') : '';
  const cityFromLandmark = cityKeyFromLandmark(locality || cityText);
  const cityFromText = detectCityKeyByInput(locality || cityText);
  const excludedMust = findExcludedMustAttractions(message);
  const mentionedCityKeys = Array.from(new Set([
    ...detectMentionedCityKeysByLabels(cityText),
    ...detectMentionedCityKeysOrdered(cityText),
    ...detectAllCityKeysFromText(cityText)
  ]));
  const preliminaryCity = cityFromAirport || cityFromLocalityMap || cityFromLandmark || cityFromText || '';
  const mustMatches = dedupeMustMatches(matchMustAttractions(maskMustInsidePlaceNames(positive)), [preliminaryCity, ...mentionedCityKeys])
    .filter((m) => !excludedMust.some((x) => x.name === m.name));
  // 도시도 대표 명소도 없이 장소 이름만 말했으면('다케토미섬 2일', 'Hashima Island 2 days', '端島 2日間') 그 장소의 도시로
  const cityFromPlace = (!preliminaryCity && mustMatches.length === 0) ? cityOfNamedPlace(positive) : '';
  // 메시지에서 찾은 도시(공항 코드·지명·랜드마크·본문·대표 명소·장소). 폼에서 온 도시는 '말한 도시'로 치지 않는다.
  const cityFromMessage = preliminaryCity || mustMatches[0]?.cityKey || cityFromPlace || '';
  const cityKey = cityFromMessage || fallbackCity;
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const explicitLocality = Boolean(locality) && new RegExp(`${locality}\\s*라는`).test(message);
  const localityMappedCity = locality ? (LOCALITY_PARENT_CITY_MAP[locality] || cityKeyFromLandmark(locality)) : '';
  const useLocalityAsCity = Boolean(locality) && (explicitLocality || !localityMappedCity);
  const cityLabel = useLocalityAsCity ? locality : city.label;
  const rawWantedPlaces = extractWantedPlacesFromMessage(positive, cityKey, [...mentionedCityKeys, ...mustMatches.map((m) => m.cityKey)]);
  let inferredCityKeys = [...mentionedCityKeys];
  if (specialPrefs.cheapFlightPriority && inferredCityKeys.length === 0) {
    inferredCityKeys = ['osaka', 'fukuoka', 'tokyo'];
  }
  // 주 도시 다음은 메시지에 처음 나온 위치 순서(도시 이름을 찾는 방법이 여러 가지라 합친 순서는 데이터 순서였다, 2026-10-03)
  const mentionAt = new Map(detectCityMentionsDetailed(cityText).map((h) => [h.key, h.idx]));
  const atOf = (k) => (mentionAt.has(k) ? mentionAt.get(k) : Number.MAX_SAFE_INTEGER);
  const restKeys = Array.from(new Set([...mustMatches.map((m) => m.cityKey), ...inferredCityKeys])).filter((k) => k !== cityKey);
  const routeCityKeys = [cityKey, ...restKeys.map((k, i) => ({ k, i })).sort((a, b) => (atOf(a.k) - atOf(b.k)) || (a.i - b.i)).map((x) => x.k)]
    .filter((k) => CITY_DATA[k]);
  const routeCities = routeCityKeys.map((k) => CITY_DATA[k]?.label || k);
  const explicitRouteKeys = Array.from(new Set([cityFromMessage, ...mustMatches.map((m) => m.cityKey), ...mentionedCityKeys].filter((k) => k && CITY_DATA[k])));
  // 도시별 일수는 도시 찾기용 글로 읽는다('Matsumoto Seicho Memorial Museum 2 days'가 '마쓰모토 2일'이 되지 않게)
  const regionDayPlan = normalizeRegionDayPlan(extractRegionDayPlanFromText(cityText, cityKey), []);
  const hasGlobalTripDays = /(\d{1,2})\s*[박泊]\s*(\d{1,2})\s*[일日]|(\d{1,2})\s*일\s*(\d{1,2})\s*박|\d{1,2}\s*nights?\s*(?:and\s*|,\s*)?\d{1,2}\s*days?/i.test(message);
  const parsedDays = parseDaysFromText(message, context.days || 4);
  const daysExplicit = parseExplicitDaysFromText(message) !== null;
  // 도시 데이터가 없는 지역의 일수(예: '나라 1일')도 전체 일수에 넣는다.
  // 'N일/N박' 표현이 도시별 일수보다 많을 때만 찾는다("교토 산책 위주 2일"의 2일은 이미 교토 몫이다).
  // (ko/en/ja 단위를 모두 센다. 날짜·일차·'1日2か所'은 세지 않는다)
  const daySegmentCount = (regionDaysText(positive).match(REGION_UNIT_COUNT_RE) || []).length;
  const unknownSegments = (!hasGlobalTripDays && regionDayPlan.length > 0 && daySegmentCount > regionDayPlan.length) ? extractUnknownRegionSegments(positive, routeCityKeys) : [];
  // '東京5日間、そのうち箱根2日'의 箱根 2일은 전체 5일 안에 든다(더하지 않고 미지원·당일치기 알림만)
  const extraDays = unknownSegments.filter((s) => !s.included).reduce((acc, s) => acc + s.days, 0);
  const inferredDays = regionDayPlan.length > 0 ? clamp(inferDaysFromRegionPlan(regionDayPlan, parsedDays) + extraDays, 1, 10) : parsedDays;
  const finalDays = hasGlobalTripDays ? parsedDays : Math.max(parsedDays, inferredDays);
  const unsupportedPlaces = [];
  const substitutes = [];
  for (const seg of unknownSegments) {
    if (!unsupportedPlaces.includes(seg.token)) unsupportedPlaces.push(seg.token);
    const sub = dayTripSubstituteFor(seg.token, routeCityKeys);
    if (sub && !substitutes.some((s) => s.token === seg.token)) substitutes.push({ token: seg.token, name: sub });
  }
  // 빼 달라고 한 곳: 대표 명소("디즈니랜드랑 디즈니씨는 빼고"), 경로 도시 명소("긴자 식스는 빼고", "skip Ginza Six"), 추가 명소
  const excludedNames = findExcludedPlaceNames(message, routeCityKeys);
  const excludedKeys = excludedNames.map(placeNameKey);
  const insteadToRaw = parseInsteadPhrase(message)?.to || '';
  const insteadTo = insteadToRaw ? canonicalWantedName(insteadToRaw, routeCityKeys) : '';
  const wantedPlaces = [...rawWantedPlaces, ...substitutes.map((s) => s.name), ...(insteadTo && !exactCityKeyForToken(insteadTo) ? [insteadTo] : [])]
    .filter((name, i, arr) => {
      const n = String(name || '').trim();
      if (!n || arr.indexOf(name) !== i) return false;
      if (n === city.label || exactCityKeyForToken(n)) return false;
      // 머무는 동네 이름('신주쿠에서')은 가고 싶은 곳이 아니다. 다만 당일치기 대표 명소('하코네에서 2일')는 그대로 넣는다.
      if (locality && n === locality && !MUST_ATTRACTIONS.some((m) => m.name === n && (m.dayTrip || m.fullDay))) return false;
      if (unsupportedPlaces.includes(n)) return false;
      const k = placeNameKey(n);
      return !excludedKeys.some((x) => x === k || (k.length >= 2 && x.includes(k)));
    });
  const timeHints = wantedTimeHints(message, wantedPlaces, routeCityKeys);
  // 당일치기 장소에서 묵겠다는 말("하코네 1박2일 온천 료칸"): 그날 저녁·다음 날 아침은 그곳에서 보낸다(일정이 specialPrefs.overnightAt을 본다).
  const lowerMsg = message.toLowerCase();
  const overnightWordRe = /료칸|숙박|묵고|묵을|자고\s*(?:오|싶)|ryokan|overnight|stay\s+(?:in|at)\s|旅館|に泊/i;
  const dayTripStay = wantedPlaces.filter((n) => {
    const must = MUST_ATTRACTIONS.find((m) => m.name === n && m.dayTrip);
    if (!must) return false;
    const aliases = [n, ...(must.aliases || [])].map((a) => String(a).toLowerCase()).filter((a) => a.length >= 2 && aliasInText(lowerMsg, a));
    return aliases.some((a) => new RegExp(`${escapeRegExp(a)}\\s*(?:에서|은|는|에)?\\s*\\d{1,2}\\s*[박泊]`, 'i').test(lowerMsg)) || (aliases.length > 0 && overnightWordRe.test(message));
  }).slice(0, 1);
  if (dayTripStay[0]) specialPrefs.overnightAt = dayTripStay[0];
  // 주 도시('아사히카와 3일 아라시야마 공원' → 아사히카와 2일 + 교토 1일). 도시 이름으로 말한 도시만 '말한 도시'다(장소로 들어온 도시는 아니다).
  const namedCityLabels = Array.from(mentionAt.keys()).map((k) => CITY_DATA[k]?.label).filter(Boolean);
  // 일수를 하나 더 말했으면('도쿄 5일 중 이틀은 유니버설', '도쿄 5일 유니버설 이틀') 장소에 붙인 일수라 주 도시를 정하지 않는다(예전 분배 그대로).
  // 'N박M일'은 하나로 센다. '하루'는 장소 도시 하루와 같은 뜻이라 센다고 보지 않는다('도쿄 5일 동안 유니버설 하루').
  const tripSpanRe = /\d{1,2}\s*[박泊]\s*\d{1,2}\s*[일日]|\d{1,2}\s*nights?\s*(?:and\s*|,\s*)?\d{1,2}\s*days?\b/gi;
  const daysWords = regionDaysText(positive);
  const dayCountMentions = (daysWords.match(tripSpanRe) || []).length + (daysWords.replace(tripSpanRe, ' ').match(REGION_UNIT_COUNT_RE) || []).length;
  const placeDayWord = /(?:^|[^가-힣])(?:이틀|사흘|나흘|닷새)|\b(?:two|three|four|five)\s+(?:full\s+)?days?\b/i.test(positive);
  const mainCity = dayCountMentions <= 1 && !placeDayWord ? mainCityForPlaceOnlyRoute(regionDayPlan, routeCities, finalDays, new Set(namedCityLabels)) : '';
  if (mainCity) specialPrefs.mainCity = mainCity;

  const seasonalStart = inferSeasonalStartDate(message, '');
  const explicitDate = seasonalStart || parseStartDateFromText(message);
  const parsed = {
    cityKey,
    cityLabel,
    arrivalAirport: city.airport,
    theme: parseThemeFromText(message, context.theme || 'mixed'),
    budget: parseBudgetFromText(message, context.budget || 'mid'),
    days: finalDays,
    startDate: explicitDate || context.startDate || new Date().toISOString().slice(0, 10),
    preferredAreas: extractPreferredAreas(positive, cityKey),
    preferAirportAccess: /공항.*가깝|이동.*편|교통.*좋|환승.*적|접근성|airport.*access|easy.*move|easy.*transport|near.*airport/i.test(message),
    wantedPlaces,
    excludedPlaces: excludedNames,
    unsupportedPlaces,
    foodKeyword: parseFoodKeywordFromText(positive),
    routeCities,
    regionDayPlan: isWholeTripRegionPlan(regionDayPlan, routeCities.length, finalDays) ? [] : regionDayPlan,
    specialPrefs,
    arrivalTime: specialPrefs.arrivalTime || '',
    departureTime: specialPrefs.departureTime || '',
    startTimeMin: specialPrefs.startTimeMin || '',
    // 내부용(응답에서는 뺀다)
    _cityFromMessage: cityFromMessage,
    _routeExplicit: explicitRouteKeys.map((k) => CITY_DATA[k].label),
    _namedCities: namedCityLabels,
    _daysExplicit: Boolean(daysExplicit || regionDayPlan.length > 0),
    _dateExplicit: Boolean(explicitDate),
    _localityAsCity: useLocalityAsCity,
    _extraDays: extraDays,
    _substitutes: substitutes,
    _allDayWanted: timeHints.allDay,
    _eveningWanted: timeHints.evening,
    _dayTripStay: dayTripStay
  };

  // 저예산(이번 메시지 또는 이전 대화의 예산)이면 조건에도 표시한다(일정이 비싼 종일·유료 전망대를 뺀다)
  if (parsed.budget === 'low') parsed.specialPrefs.lowBudget = true;

  if (specialPrefs.replaceUniversalWithAquarium) {
    parsed.wantedPlaces = parsed.wantedPlaces.filter((w) => !/유니버[셜설]|usj|universal/i.test(String(w)));
    if (!parsed.excludedPlaces.includes('유니버셜 스튜디오 재팬')) parsed.excludedPlaces.push('유니버셜 스튜디오 재팬');
    if (!parsed.wantedPlaces.some((w) => /수족관|aquarium/i.test(String(w)))) {
      parsed.wantedPlaces.push('수족관');
    }
  }

  if (airportInText) parsed.arrivalAirport = airportInText;
  if (!airportInText && useLocalityAsCity && DYNAMIC_LOCALITY_AIRPORT_HINT[cityLabel]) {
    parsed.arrivalAirport = DYNAMIC_LOCALITY_AIRPORT_HINT[cityLabel];
  }
  if (Array.isArray(parsed.routeCities) && parsed.routeCities.length > 1) {
    const firstRouteKey = cityKeyByLabel(parsed.routeCities[0]);
    if (firstRouteKey && CITY_DATA[firstRouteKey]?.airport) {
      parsed.arrivalAirport = CITY_DATA[firstRouteKey].airport;
    }
  }
  return parsed;
}

// ── 채팅 답변(ko/en/ja): 무엇을 알아들었는지 줄마다 확인해 준다 ──
const CHAT_THEME_LABELS = {
  ko: { foodie: '미식', culture: '문화·역사', shopping: '쇼핑', nature: '자연·온천' },
  en: { foodie: 'Food', culture: 'Culture & history', shopping: 'Shopping', nature: 'Nature & onsen' },
  ja: { foodie: 'グルメ', culture: '文化・歴史', shopping: 'ショッピング', nature: '自然・温泉' }
};

// 한국어 주제 조사: 마지막 글자가 한글이면 받침에 따라 '은'/'는'('나라는', '하코네는', '오타루 운하는'), 한글이 아니면 '은(는)'.
function koHasFinalConsonant(word) {
  const s = String(word || '').trim();
  const last = s ? s.codePointAt(s.length - 1) : 0;
  if (last >= 0xAC00 && last <= 0xD7A3) return (last - 0xAC00) % 28 !== 0;
  return null;
}
function koTopicParticle(word) {
  const f = koHasFinalConsonant(word);
  return f === null ? '은(는)' : (f ? '은' : '는');
}
// 목적격 조사: '스시를', '라멘을'(한글이 아니면 '을(를)')
function koObjectParticle(word) {
  const f = koHasFinalConsonant(word);
  return f === null ? '을(를)' : (f ? '을' : '를');
}

const CHAT_REPLY_TEXT = {
  ko: {
    setTrip: (city, days, date) => `${city} ${days}일 여행으로 맞췄어요 (출발 ${date}).`,
    assumedDays: (days) => ` 일수는 말씀이 없어 ${days}일로 잡았어요.`,
    tooManyCities: (dropped, days, n) => `${days}일로는 도시 ${n}곳을 다 돌기 어려워 ${dropped}${koObjectParticle(dropped)} 빼고 짤게요. 모두 가려면 일수를 ${n}일 이상으로 늘려 주세요.`,
    must: (list) => `꼭 갈 곳: ${list}`,
    excluded: (list) => `제외: ${list}`,
    theme: (label) => `테마: ${label}`,
    // 일정은 먹고 싶은 음식마다 맞는 가게를 저녁에 하나씩 넣는다(전부 그 음식으로 채우지는 않음) → '위주로'라고 약속하지 않는다.
    food: (food) => `맛집에 '${food}'${koObjectParticle(food)} 넣어 볼게요.`,
    conditions: (list) => `조건: ${list}`,
    cond: {
      indoor: '실내 위주', lateStart: (t) => `${t} 이후 시작`, maxPlaces: (n) => `하루 ${n}곳`, restDay: '중간에 휴식일',
      transit: '대중교통만', noShopping: '쇼핑 제외', lowWalking: '적게 걷기', kids: '아이 동반', relaxed: '여유로운 일정', nightView: '야경 넣기',
      lowBudget: '저예산(무료·저렴한 곳 위주)',
      arrival: (t) => `첫날 ${t} 도착`, departure: (t) => `마지막 날 ${t} 출발`
    },
    dayTripStay: (place, city) => `${place}${koTopicParticle(place)} ${city}에서 다녀오는 당일치기로 넣었어요. 숙소는 ${city} 기준으로 찾으니 ${place} 숙박(료칸)은 따로 확인해 주세요.`,
    unsupported: (list, days) => `${list}${koTopicParticle(list)} 아직 데이터가 없어 일정에 넣지 못해요. 전체 ${days}일은 그대로 둘게요.`,
    substitute: (place, sub, days) => `${place}${koTopicParticle(place)} 아직 도시 데이터가 없어 당일치기(${sub})로 넣었어요. 전체 ${days}일은 그대로 둘게요.`,
    region: (list) => `지역별 일정 분배: ${list}`,
    regionItem: (city, n, unit) => `${city} ${n}${unit === 'night' ? '박' : '일'}`,
    airport: (code) => `도착 공항: ${code}`,
    stayArea: (list) => `숙소는 ${list} 근처를 먼저 볼게요.`,
    airportAccess: '숙소는 공항 이동이 편한 곳을 먼저 볼게요.',
    building: '일정을 만드는 중이에요…',
    sep: ', ', condSep: ' · '
  },
  en: {
    setTrip: (city, days, date) => `Set to a ${days}-day trip to ${city} (from ${date}).`,
    assumedDays: (days) => ` No trip length was given, so I used ${days} days.`,
    tooManyCities: (dropped, days, n) => `${days} day(s) is too short for ${n} cities, so I'll leave out ${dropped}. Make it ${n} days or more to include them all.`,
    must: (list) => `Must-visit: ${list}`,
    excluded: (list) => `Excluded: ${list}`,
    theme: (label) => `Theme: ${label}`,
    food: (food) => `Restaurants: I'll try to include ${food}.`,
    conditions: (list) => `Conditions: ${list}`,
    cond: {
      indoor: 'Indoor-first', lateStart: (t) => `Start after ${t}`, maxPlaces: (n) => `Up to ${n} places a day`, restDay: 'A rest day in the middle',
      transit: 'Public transit only', noShopping: 'No shopping', lowWalking: 'Less walking', kids: 'Kid-friendly', relaxed: 'Relaxed pace', nightView: 'Night views',
      lowBudget: 'Low budget (free and cheap spots first)',
      arrival: (t) => `Day 1 arrival ${t}`, departure: (t) => `Last-day departure ${t}`
    },
    dayTripStay: (place, city) => `${place} is planned as a day trip from ${city}. Stays are searched in ${city}, so please check inns (ryokan) in ${place} separately.`,
    unsupported: (list, days) => `There is no data for ${list} yet, so it is not in the plan. The trip stays ${days} days.`,
    substitute: (place, sub, days) => `There is no city data for ${place} yet, so it is planned as a day trip (${sub}). The trip stays ${days} days.`,
    region: (list) => `Days per city: ${list}`,
    regionItem: (city, n, unit) => `${city} ${n} ${unit === 'night' ? (n === 1 ? 'night' : 'nights') : (n === 1 ? 'day' : 'days')}`,
    airport: (code) => `Arrival airport: ${code}`,
    stayArea: (list) => `Stays near ${list} first.`,
    airportAccess: 'Stays with easy airport access first.',
    building: 'Building your itinerary…',
    sep: ', ', condSep: ' · '
  },
  ja: {
    setTrip: (city, days, date) => `${city}${days}日間の旅に設定しました（${date}出発）。`,
    assumedDays: (days) => `日数の指定がないため${days}日間にしました。`,
    tooManyCities: (dropped, days, n) => `${days}日間で${n}都市すべては回れないため、${dropped}を外して作ります。すべて入れるには${n}日以上にしてください。`,
    must: (list) => `必ず行く場所：${list}`,
    excluded: (list) => `除外：${list}`,
    theme: (label) => `テーマ：${label}`,
    food: (food) => `グルメに「${food}」を入れてみます。`,
    conditions: (list) => `条件：${list}`,
    cond: {
      indoor: '屋内中心', lateStart: (t) => `${t}以降に開始`, maxPlaces: (n) => `1日${n}か所`, restDay: '途中に休息日',
      transit: '公共交通機関のみ', noShopping: 'ショッピングなし', lowWalking: '歩く距離を少なく', kids: '子連れ向け', relaxed: 'ゆったり日程', nightView: '夜景を入れる',
      lowBudget: '低予算（無料・手頃なスポット中心）',
      arrival: (t) => `初日${t}到着`, departure: (t) => `最終日${t}出発`
    },
    dayTripStay: (place, city) => `${place}は${city}からの日帰りとして入れました。宿は${city}で検索するため、${place}の宿（旅館）は別途ご確認ください。`,
    unsupported: (list, days) => `${list}はまだデータがないため日程に入れられません。全体の${days}日間はそのままにします。`,
    substitute: (place, sub, days) => `${place}はまだ都市データがないため日帰り（${sub}）として入れました。全体の${days}日間はそのままにします。`,
    region: (list) => `都市ごとの日数：${list}`,
    regionItem: (city, n, unit) => `${city}${n}${unit === 'night' ? '泊' : '日'}`,
    airport: (code) => `到着空港：${code}`,
    stayArea: (list) => `宿は${list}周辺を優先します。`,
    airportAccess: '宿は空港へのアクセスが良い所を優先します。',
    building: '日程を作成しています…',
    sep: '、', condSep: '・'
  }
};

// 장소 이름을 화면 언어로(내장 표·사진 데이터 이름·대표 명소 로마자 별칭). 모르는 이름은 사용자가 쓴 그대로.
function localizePlaceLabel(name, cityKeys, lang) {
  const n = String(name || '').trim();
  if (!n || lang === 'ko') return n;
  for (const ck of cityKeys || []) {
    const hit = CURATED_PLACE_I18N[`${ck}|${n}`]?.[lang];
    if (hit) return hit;
    const media = placeMediaFor(ck, n);
    if (media?.labels?.[lang]) return media.labels[lang];
    if (lang === 'ja' && media?.labels?.en) return media.labels.en;
  }
  const must = MUST_ATTRACTIONS.find((m) => m.name === n);
  if (must) {
    const media = placeMediaFor(must.cityKey, n);
    if (media?.labels?.[lang]) return media.labels[lang];
    const jaAlias = (must.aliases || []).find((a) => /[぀-ヿ一-鿿]/.test(a) && !/[가-힣]/.test(a));
    if (lang === 'ja' && jaAlias) return jaAlias;
    return mustAttractionLatinName(must.cityKey, n) || n;
  }
  const extra = extraPlaceByName(n);
  if (extra && extra[lang]) return extra[lang];
  return n;
}

function cityLabelForLang(label, lang) {
  const ck = cityKeyForExactLabel(label);
  return ck ? localizedCityName(ck, lang) : String(label || '');
}

function buildTravelChatReply(parsed, lang = 'ko') {
  const L = normalizeLang(lang);
  const T = CHAT_REPLY_TEXT[L];
  const p = parsed || {};
  const lines = [];
  const routeLabels = (Array.isArray(p.routeCities) ? p.routeCities : []).filter(Boolean);
  const routeKeys = routeLabels.map((c) => cityKeyByLabel(c)).filter(Boolean);
  const cityKeys = Array.from(new Set([p.cityKey, ...routeKeys].filter(Boolean)));
  const mainCity = CITY_DATA[p.cityKey] && String(p.cityLabel || '') === CITY_DATA[p.cityKey].label
    ? localizedCityName(p.cityKey, L)
    : String(p.cityLabel || localizedCityName(p.cityKey, L));
  const cityText = routeLabels.length > 1 ? routeLabels.map((c) => cityLabelForLang(c, L)).join(L === 'ja' ? '・' : ' · ') : mainCity;
  const days = clamp(Number(p.days) || 1, 1, 10);
  lines.push(T.setTrip(cityText, days, p.startDate || '') + (p._daysExplicit === false ? T.assumedDays(days) : ''));
  // 일수보다 도시가 많으면(1박2일에 세 도시) 뒤쪽 도시는 일정에 못 넣는다고 미리 알린다(날짜 배분은 앞의 도시부터 하루씩)
  if (routeLabels.length > days) lines.push(T.tooManyCities(routeLabels.slice(days).map((c) => cityLabelForLang(c, L)).join(T.sep), days, routeLabels.length));
  const wanted = (p.wantedPlaces || []).filter(Boolean).map((w) => localizePlaceLabel(w, cityKeys, L));
  if (wanted.length) lines.push(T.must(wanted.join(T.sep)));
  const excluded = (p.excludedPlaces || []).filter(Boolean).map((w) => localizePlaceLabel(w, cityKeys, L));
  if (excluded.length) lines.push(T.excluded(excluded.join(T.sep)));
  if (p.theme && p.theme !== 'mixed' && CHAT_THEME_LABELS[L][p.theme]) lines.push(T.theme(CHAT_THEME_LABELS[L][p.theme]));
  if (p.foodKeyword) {
    const foods = String(p.foodKeyword).split(/\s*,\s*/).filter(Boolean).map((g) => localizeFoodGenre(g, L)).join(T.sep);
    lines.push(T.food(foods));
  }
  const sp = p.specialPrefs || {};
  const conds = [];
  if (sp.indoorFocus) conds.push(T.cond.indoor);
  if (sp.lateStart || p.startTimeMin) conds.push(T.cond.lateStart(p.startTimeMin || sp.startTimeMin || '10:30'));
  if (Number(sp.maxPlacesPerDay) > 0) conds.push(T.cond.maxPlaces(Number(sp.maxPlacesPerDay)));
  if (sp.addRestDay || sp.doNothingDay) conds.push(T.cond.restDay);
  if (sp.publicTransitOnly) conds.push(T.cond.transit);
  if (sp.removeShopping) conds.push(T.cond.noShopping);
  if (sp.lowWalking || sp.strollerFriendly) conds.push(T.cond.lowWalking);
  if (sp.kidsFriendly) conds.push(T.cond.kids);
  if (sp.relaxedPace && !(Number(sp.maxPlacesPerDay) > 0)) conds.push(T.cond.relaxed);
  if (sp.nightViewFocus) conds.push(T.cond.nightView);
  if (sp.lowBudget || p.budget === 'low') conds.push(T.cond.lowBudget);
  if (p.arrivalTime) conds.push(T.cond.arrival(p.arrivalTime));
  if (p.departureTime) conds.push(T.cond.departure(p.departureTime));
  if (conds.length) lines.push(T.conditions(conds.join(T.condSep)));
  // 당일치기 장소에서 묵고 싶다고 한 경우("하코네 1박2일 료칸"): 숙소 검색은 주 도시 기준임을 알린다
  for (const place of (Array.isArray(p._dayTripStay) ? p._dayTripStay : []).slice(0, 1)) {
    lines.push(T.dayTripStay(localizePlaceLabel(place, cityKeys, L), mainCity));
  }
  const subs = Array.isArray(p._substitutes) ? p._substitutes : [];
  const unsupported = (p.unsupportedPlaces || []).filter(Boolean);
  const plainUnsupported = unsupported.filter((u) => !subs.some((s) => s.token === u));
  subs.filter((s) => unsupported.includes(s.token)).forEach((s) => lines.push(T.substitute(s.token, localizePlaceLabel(s.name, cityKeys, L), days)));
  if (plainUnsupported.length) lines.push(T.unsupported(plainUnsupported.join(T.sep), days));
  if (routeLabels.length > 1 && Array.isArray(p.regionDayPlan) && p.regionDayPlan.length > 0) {
    lines.push(T.region(p.regionDayPlan.map((x) => T.regionItem(cityLabelForLang(x.cityLabel, L), x.days, x.unit)).join(T.sep)));
  }
  if (p.arrivalAirport) lines.push(T.airport(p.arrivalAirport));
  if (Array.isArray(p.preferredAreas) && p.preferredAreas.length > 0) {
    lines.push(T.stayArea(p.preferredAreas.map((a) => localizeCuratedArea(a, L, mainCity)).join(T.sep)));
  } else if (p.preferAirportAccess) {
    lines.push(T.airportAccess);
  }
  lines.push(T.building);
  return lines.join('\n');
}

function safeDateText(value, fallback) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fallback;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== m - 1) return fallback;
  return formatDateISO(date);
}

// 오늘보다 이른 날짜는 다음 해 같은 날로(AI가 연도를 틀린 경우), 그래도 이상하면 fallback.
function futureDateOr(isoText, fallback) {
  const text = safeDateText(isoText, '');
  if (!text) return fallback;
  const today = formatDateISO(new Date());
  if (text >= today) return text;
  const [, m, d] = text.split('-').map(Number);
  return upcomingMonthDay(m, d) || fallback;
}

function clockOrEmpty(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
  return hhmm(m[1], m[2]);
}

const CHAT_THEMES = ['mixed', 'foodie', 'culture', 'shopping', 'nature'];
const CHAT_PREF_FLAGS = ['indoorFocus', 'removeShopping', 'lateStart', 'lowWalking', 'relaxedPace', 'addRestDay', 'publicTransitOnly', 'nightViewFocus', 'firstDayShort', 'kidsFriendly'];
// AI가 specialPrefs를 배열(예: ["실내 위주", "no shopping"])로 줄 때 불리언 플래그로 바꾸는 표
const PREF_KEYWORD_TABLE = [
  ['indoorFocus', /indoor|실내|우천|rain|室内/i],
  ['removeShopping', /no\s*shopping|removeshopping|쇼핑\s*(제외|빼|없)|ショッピング(なし|抜き)/i],
  ['lateStart', /late\s*start|latestart|늦은\s*시작|늦게\s*시작|遅め/i],
  ['lowWalking', /less\s*walk|low\s*walk|lowwalking|덜\s*걷|적게\s*걷|안\s*걷|도보\s*최소|歩かない/i],
  ['relaxedPace', /relax|relaxedpace|여유|느긋|ゆったり|のんびり/i],
  ['addRestDay', /rest\s*day|addrestday|휴식일|休息日/i],
  ['publicTransitOnly', /public\s*transit|publictransitonly|대중교통|公共交通/i],
  ['nightViewFocus', /night\s*view|nightviewfocus|야경|夜景/i],
  ['firstDayShort', /first\s*day\s*short|firstdayshort|첫날\s*짧|初日/i],
  ['kidsFriendly', /kid|child|kidsfriendly|아이|子連れ|子ども/i]
];

// AI specialPrefs(객체 또는 배열) → 알려진 키만. 불리언은 true만 넘기고, maxPlacesPerDay는 1..5 정수.
function normalizeAiSpecialPrefs(rawPrefs) {
  const out = {};
  if (Array.isArray(rawPrefs)) {
    for (const item of rawPrefs) {
      const s = String(item || '');
      for (const [key, re] of PREF_KEYWORD_TABLE) if (re.test(s)) out[key] = true;
      const n = /(\d)\s*(?:곳|places?|spots?|か所)/i.exec(s);
      if (n) out.maxPlacesPerDay = clamp(Number(n[1]), 1, 5);
    }
    return out;
  }
  if (!rawPrefs || typeof rawPrefs !== 'object') return out;
  for (const key of CHAT_PREF_FLAGS) if (rawPrefs[key] === true || rawPrefs[key] === 'true') out[key] = true;
  const n = Number(rawPrefs.maxPlacesPerDay);
  if (Number.isFinite(n) && n >= 1) out.maxPlacesPerDay = clamp(Math.round(n), 1, 5);
  return out;
}

// 이름 목록 정리: 공백·중복 제거, 다른 항목에 포함되는 짧은 이름 제거('유니버셜' ⊂ '유니버셜 스튜디오 재팬')
function dedupePlaceNames(list, max = 8) {
  const names = [];
  for (const raw of list || []) {
    const n = normalizeWantedPlaceName(String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 60));
    if (n && !names.some((x) => placeNameKey(x) === placeNameKey(n))) names.push(n);
  }
  const keys = names.map(placeNameKey);
  return names.filter((n, i) => keys[i] && !keys.some((k, j) => j !== i && k !== keys[i] && k.includes(keys[i]))).slice(0, max);
}

// 사용자가 빼 달라고 한 이름 → 정식 이름(예: '디즈니랜드' → '도쿄 디즈니랜드', 'Ginza Six' → '긴자 식스'). 모르면 그대로.
function canonicalPlaceName(token, cityKeys = []) {
  return canonicalWantedName(token, cityKeys);
}

// AI가 켠 조건(specialPrefs)은 메시지에 근거 낱말이 있을 때만 받는다("부모님 모시고"만으로 '쇼핑 제외'를 켜지 않게).
// removeShopping은 NEG_SHOPPING_RE·부정된 테마로 따로 본다.
const PREF_EVIDENCE_RE = {
  indoorFocus: /실내|비\s*(?:가|오|와|올|많)|우천|장마|rain|indoor|wet|室内|雨/i,
  lateStart: /늦|느지막|브런치|\d{1,2}\s*시\s*(?:이후|부터|넘어|쯤|에|\s*시작)|late|sleep\s*in|after\s*\d|start(?:ing)?\s+(?:at|around|from)?\s*\d|遅|\d{1,2}\s*時\s*(?:以降|から)/i,
  lowWalking: /걷|도보|무릎|휠체어|유모차|부모님|어르신|노인|walk|wheelchair|stroller|elderly|parents|歩|車椅子|ベビーカー/i,
  relaxedPace: /여유|느긋|천천히|널널|빡빡하지|쉬엄|relax|slow|easy|leisur|laid[-\s]?back|ゆっくり|のんびり|ゆったり/i,
  addRestDay: /휴식|쉬는\s*날|쉬어|하루\s*쉬|rest\s*day|day\s*off|休/i,
  publicTransitOnly: /대중교통|지하철|전철|버스|차\s*없이|public\s*transport|public\s*transit|subway|\btrains?\b|\bbus(?:es)?\b|公共交通|電車|地下鉄|バス/i,
  nightViewFocus: /야경|밤\s*풍경|night\s*view|nightscape|夜景/i,
  firstDayShort: /도착|첫날|arriv|first\s+day|着|初日/i,
  kidsFriendly: /아이|애들|아기|자녀|아들|딸|유아|어린이|\d+\s*살|kid|child|\bsons?\b|daughter|toddler|baby|family|子供|子ども|子連れ|キッズ/i
};
// 시각 필드의 근거 낱말(없으면 AI 값 대신 규칙 값)
const TIME_FIELD_EVIDENCE_RE = {
  arrivalTime: /도착|착륙|arriv|land|着/i,
  departureTime: /출발|출국|귀국|비행기|항공|돌아|depart|flight|leave|発|帰/i,
  startTimeMin: /\d\s*시|\d\s*(?:am|pm)|\d:\d\d|時|늦|late|start|begin/i
};
// 일수를 말한 것 같은데 규칙이 숫자로 못 읽은 표현("long weekend", "주말")이면 AI 일수를 쓴다
const DAY_LENGTH_HINT_RE = /\d\s*(?:박|일간)|\b(?:days?|nights?|weeks?|weekend)\b|日間|泊|週間|週末|주말|연휴/i;

// 장소가 아닌 낱말: 일반 표현("무료 명소", "紅葉の名所", "classic highlights"), 금액·예산("1인 50만원"), 숫자·기간, 음식
const NON_PLACE_GENERIC_RE = /명소|관광지|핫플|스팟|여행지|가볼\s*만한|볼거리|구경거리|名所|スポット|観光地|見どころ|\bspots?\b|\bsights?\b|\bsightseeing\b|\bhighlights?\b|\battractions?\b|\bplaces?\b|\blandmarks?\b/i;
const MONEY_OR_BUDGET_RE = /\d[\d,.]*\s*(?:만\s*원|천\s*원|원|엔|円|yen|달러|dollars?|usd|krw|jpy)|[$€¥₩]\s*\d|예산|인당|1인|per\s+person|budget|予算/i;
function isNonPlaceWord(token) {
  const t = String(token || '').trim();
  if (!t || t.length < 2) return true;
  if (/^[\d\s.,~\-]+$/.test(t)) return true;
  if (MONEY_OR_BUDGET_RE.test(t)) return true;
  if (/^\d+\s*(?:박|일|泊|日|days?|nights?)/i.test(t)) return true;
  if (isKnownPlaceName(t)) return false;
  return NON_PLACE_GENERIC_RE.test(t) || isFoodWord(t);
}

// 글(message)에 그 장소를 가리키는 말이 있는지: 이름·별칭·en/ja 표기(공백·가운뎃점·하이픈·대소문자 무시)
function placeMentionedIn(name, message) {
  const squash = (s) => String(s || '').toLowerCase().replace(/[\s·・\-]/g, '');
  const msg = squash(message);
  if (!msg || !name) return false;
  const variants = new Set([name]);
  const musts = MUST_ATTRACTIONS.filter((m) => m.name === name);
  musts.forEach((m) => (m.aliases || []).forEach((a) => variants.add(a)));
  // 짧은 이름('高山')은 낱말 하나로 쓰였을 때만
  if (musts.some((m) => (m.contextAliases || []).some((a) => contextAliasInText(message, a)))) return true;
  const extra = extraPlaceByName(name);
  if (extra) [extra.name, extra.en, extra.ja, ...(extra.aliases || [])].forEach((a) => variants.add(a));
  for (const e of placeLabelIndex()) if (e.ko === name) variants.add(e.label);
  return [...variants].some((v) => { const s = squash(v); return s.length >= 2 && msg.includes(s); });
}

function normalizeTravelChatParsed(candidate, fallback, opts = {}) {
  const raw = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  const message = String(opts.message || '');
  let aiFieldCount = 0;
  const used = () => { aiFieldCount += 1; };

  // 도시: 메시지에 분명히 나온 도시(fallback._cityFromMessage)와 AI가 다르면 메시지를 믿는다.
  // 폼에서 온 도시는 '명시'가 아니라서 AI가 이긴다(폼이 오사카여도 "札幌に3日間" + AI sapporo → 삿포로).
  const rawCityKey = String(raw.cityKey || '').trim();
  const aiCityKey = (CITY_DATA[rawCityKey] && !CITY_DATA[rawCityKey].dynamic) ? rawCityKey
    : (detectCityKeyByInput(rawCityKey) || detectCityKeyByInput(raw.cityLabel) || '');
  const msgCity = fallback._cityFromMessage || '';
  let cityKey = fallback.cityKey;
  if (aiCityKey) {
    used();
    cityKey = (msgCity && aiCityKey !== msgCity) ? msgCity : aiCityKey;
  }
  // 메시지에 도시가 없고 그 도시가 메시지에도 없는데, AI가 꼭 갈 곳·미지원으로 돌려준 이름이 데이터 속 다른 도시의 장소면
  // 그 장소의 도시로('高山で2日間' → 나고야 + 다카야마 산마치, '다케토미섬 2일' → 이시가키). 메시지에 근거가 있는 이름만 본다.
  if (!msgCity && !detectAllCityKeysFromText(message).includes(cityKey)) {
    const named = [...(Array.isArray(raw.wantedPlaces) ? raw.wantedPlaces : []), ...(Array.isArray(raw.unsupportedPlaces) ? raw.unsupportedPlaces : [])]
      .map((x) => String(x || '').trim()).filter(Boolean);
    const owner = named.map((x) => ({ x, n: canonicalWantedName(x, [cityKey]) }))
      .filter(({ x, n }) => placeMentionedIn(n, message) || placeMentionedIn(x, message))
      .map(({ n }) => placeCityKeyOf(n)).find((k) => k && CITY_DATA[k] && k !== cityKey);
    if (owner) cityKey = owner;
  }
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const cityLabel = fallback._localityAsCity && cityKey === fallback.cityKey ? fallback.cityLabel : city.label;

  const negThemes = negatedThemes(message);
  let theme = fallback.theme;
  if (CHAT_THEMES.includes(raw.theme)) {
    used();
    theme = negThemes.has(raw.theme) ? (negThemes.has(fallback.theme) ? 'mixed' : fallback.theme) : raw.theme;
  }
  let budget = fallback.budget;
  if (['low', 'mid', 'high'].includes(raw.budget)) { used(); budget = raw.budget; }

  let days = clamp(Number(fallback.days) || 4, 1, 10);
  const aiDays = Number(raw.days);
  if (Number.isFinite(aiDays) && aiDays >= 1) {
    used();
    // 메시지에 적힌 일수는 규칙 해석(N박 M일·도시별 합계·범위)을 믿는다: "Tokyo 3 days"인데 AI가 폼 기본값 4를 따라 하는 일을 막는다.
    // 메시지에 여행 길이가 없으면(예: "2일차에 유니버셜") 폼·이전 일수를 그대로 두고,
    // 규칙이 숫자로 못 읽은 길이 표현("long weekend", "주말")만 AI 값을 쓴다.
    if (fallback._daysExplicit) days = clamp(Number(fallback.days) || Math.round(aiDays), 1, 10);
    else if (DAY_LENGTH_HINT_RE.test(stripDateAndDayNumberPhrases(stripDayDeltaPhrases(message)))) days = clamp(Math.round(aiDays), 1, 10);
    // 도시 데이터가 없는 지역의 일수('나라 1일')를 AI가 빼먹어도 전체 일수는 줄이지 않는다.
    if (fallback._extraDays > 0) days = Math.max(days, clamp(Number(fallback.days) || 1, 1, 10));
  }

  // 출발일: 메시지에 날짜 말이 있을 때만 AI 날짜를 쓴다(없으면 폼 날짜 유지). 오늘보다 이르면 다음 해로.
  const hasDateHint = /\d|내일|모레|다음\s*주|이번\s*주|주말|연휴|추석|설날|크리스마스|tomorrow|next|weekend|christmas|golden\s*week|明日|来週|今週|週末|ゴールデン|クリスマス|january|february|march|april|may|june|july|august|september|october|november|december/i.test(message);
  let startDate = fallback.startDate;
  const aiDate = safeDateText(raw.startDate, '');
  if (aiDate) {
    used();
    if (hasDateHint) startDate = futureDateOr(aiDate, fallback.startDate);
  }

  const preferredAreas = Array.isArray(raw.preferredAreas) && raw.preferredAreas.length
    ? raw.preferredAreas.map((x) => String(x).trim()).filter((x) => x && city.areas.some((a) => x.includes(a) || a.includes(x))).slice(0, 4)
    : fallback.preferredAreas;

  // AI가 돌려준 이름은 메시지(후속 대화면 이전 조건까지)에 근거가 있을 때만 받는다.
  const prev = opts.prev && typeof opts.prev === 'object' ? opts.prev : {};
  const prevList = (k) => (Array.isArray(prev[k]) ? prev[k].map((x) => String(x || '').trim()).filter(Boolean) : []);
  const routeKeysForNames = [cityKey, ...(fallback.routeCities || []).map((c) => cityKeyByLabel(c))].filter(Boolean);
  const grounded = (name, rawName) => placeMentionedIn(name, message) || (rawName && placeMentionedIn(rawName, message));

  const aiExcluded = (Array.isArray(raw.excludedPlaces) ? raw.excludedPlaces : [])
    .map((x) => String(x || '').trim()).filter(Boolean)
    .map((x) => ({ raw: x, name: canonicalPlaceName(x, routeKeysForNames) }))
    .filter((x) => x.name && !MONEY_OR_BUDGET_RE.test(x.name) && (grounded(x.name, x.raw) || prevList('excludedPlaces').includes(x.name)))
    .map((x) => x.name);
  if (aiExcluded.length) used();
  const excludedPlaces = dedupePlaceNames([...(fallback.excludedPlaces || []), ...aiExcluded], 8);
  const excludedKeys = excludedPlaces.map(placeNameKey);
  const isExcludedName = (n) => {
    const k = placeNameKey(n);
    return Boolean(k) && excludedKeys.some((x) => x === k || (k.length >= 2 && x.includes(k)) || (x.length >= 2 && k.includes(x)));
  };

  // 미지원 지역: 알려진 도시로 풀리는 이름은 뺀다. 당일치기 데이터가 있으면 그 명소로 바꿔 넣는다.
  // 금액("1인 50만원")·일반 표현·음식·메시지에 없는 이름은 장소가 아니라서 받지 않는다.
  const routeKeysForSubs = routeKeysForNames;
  // AI가 '데이터 없음'으로 돌려준 이름이 데이터 속 장소(대표 명소·추가 명소·도시 주변 실제 명소)면 미지원이 아니라 꼭 갈 곳이다
  // (AI 채팅 프롬프트는 도시 주변 실제 명소 목록을 모른다: '다케토미섬 2일' → '아직 데이터가 없어요'가 되지 않게).
  const knownFromUnsupported = [];
  const aiUnsupported = (Array.isArray(raw.unsupportedPlaces) ? raw.unsupportedPlaces : [])
    .map((x) => String(x || '').trim().slice(0, 40)).filter(Boolean)
    .filter((u) => !isNonPlaceWord(u) && placeMentionedIn(u, message))
    .filter((u) => {
      const name = knownPlaceForToken(u, routeKeysForNames);
      if (!name) return true;
      if (!knownFromUnsupported.includes(name)) knownFromUnsupported.push(name);
      return false;
    });
  if (aiUnsupported.length || knownFromUnsupported.length) used();
  const unsupportedPlaces = [];
  const substitutes = [...(fallback._substitutes || [])];
  for (const u of [...(fallback.unsupportedPlaces || []), ...aiUnsupported]) {
    if (exactCityKeyForToken(u) || unsupportedPlaces.includes(u)) continue;
    unsupportedPlaces.push(u);
    const sub = dayTripSubstituteFor(u, routeKeysForSubs);
    if (sub && !substitutes.some((s) => s.token === u)) substitutes.push({ token: u, name: sub });
  }

  // 꼭 갈 곳: 표준 이름으로 바꾸고('otaru' → 오타루 운하, '가이유칸 수족관' → 가이유칸), 음식·일반 표현은 빼고(음식은 맛집 희망으로),
  // 메시지에 없는 이름(AI가 지어낸 곳)도 뺀다.
  const foodFromWanted = [];
  const aiWanted = [];
  for (const w of (Array.isArray(raw.wantedPlaces) ? raw.wantedPlaces : []).map((x) => String(x || '').trim()).filter(Boolean)) {
    const name = canonicalWantedName(w, routeKeysForNames);
    if (!name || !isMeaningfulPlaceKeyword(name)) continue;
    if (isNonPlaceWord(name)) {
      if (isFoodWord(name) && !foodFromWanted.includes(name)) foodFromWanted.push(name);
      continue;
    }
    if (!grounded(name, w) && !prevList('wantedPlaces').includes(name)) continue;
    if (!aiWanted.includes(name)) aiWanted.push(name);
  }
  if (aiWanted.length) used();
  const wantedPlaces = dedupePlaceNames([
    ...aiWanted,
    ...knownFromUnsupported,
    ...(fallback.wantedPlaces || []),
    ...substitutes.filter((s) => unsupportedPlaces.includes(s.token)).map((s) => s.name)
  ], 8).filter((n) => !isExcludedName(n) && !unsupportedPlaces.includes(n) && !exactCityKeyForToken(n) && n !== city.label);

  let foodKeyword = String(fallback.foodKeyword || '').trim();
  if (typeof raw.foodKeyword === 'string' && raw.foodKeyword.trim()) {
    used();
    // 음식 이야기가 없는 메시지("하루 더 늘려줘")에 AI가 지어낸 음식은 받지 않는다
    const aiFood = raw.foodKeyword.trim().slice(0, 40);
    const foodSaid = /먹|맛집|음식|미식|먹방|food|eat|restaurant|cuisine|グルメ|食/i.test(message) || Boolean(parseFoodKeywordFromText(message)) || FOOD_WORD_RE.test(message);
    if (foodSaid || aiFood === String(prev.foodKeyword || '')) foodKeyword = aiFood;
  }
  // AI가 꼭 갈 곳으로 잘못 넣은 음식은 메시지에 그 음식이 있을 때만 맛집 희망으로 옮긴다
  const msgFoods = String(parseFoodKeywordFromText(message) || '').split(/\s*,\s*/).filter(Boolean);
  const groundedFoods = foodFromWanted.filter((f) => String(message).toLowerCase().includes(f.toLowerCase()) || msgFoods.includes(f));
  if (!foodKeyword && groundedFoods.length) foodKeyword = groundedFoods.slice(0, 3).join(', ');

  // 경로 도시: 주 도시 → AI 경로(알려진 도시만) → 메시지에 나온 도시 → 지역별 일수의 도시. 폼 도시는 넣지 않는다.
  // AI가 말한 도시는 메시지에 나왔거나(랜드마크 포함) 이전 경로에 있을 때만 받는다.
  const mentionedCityLabels = new Set([
    ...detectAllCityKeysFromText(message).map((k) => CITY_DATA[k]?.label),
    ...(fallback._routeExplicit || []),
    ...prevList('routeCities').map((c) => resolveCityLabelFromRegionToken(c, '') || c),
    city.label
  ].filter(Boolean));
  const aiRoute = Array.isArray(raw.routeCities) ? raw.routeCities.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (aiRoute.length) used();
  const aiRouteLabels = [];
  for (const r of aiRoute) {
    const label = resolveCityLabelFromRegionToken(r, '');
    if (label) { if (mentionedCityLabels.has(label)) aiRouteLabels.push(label); }
    else if (!unsupportedPlaces.includes(r) && !dayTripSubstituteFor(r, routeKeysForSubs) && !isNonPlaceWord(r) && placeMentionedIn(r, message)) unsupportedPlaces.push(r);
  }
  const aiRegion = (Array.isArray(raw.regionDayPlan) ? normalizeRegionDayPlan(raw.regionDayPlan, []) : []).filter((x) => mentionedCityLabels.has(x.cityLabel));
  if (aiRegion.length) used();
  // 도시가 하나뿐인데 AI 분배가 전체 일수와 다르면(예: '삿포로 3일' + 오타루 하루) 분배를 쓰지 않는다
  const aiRegionUsable = aiRegion.length > 1 || (aiRegion.length === 1 && aiRegion[0].unit === 'day' && aiRegion[0].days === days)
    || (aiRegion.length === 1 && aiRegion[0].unit === 'night' && aiRegion[0].days + 1 === days);
  const regionDayPlan = aiRegionUsable ? aiRegion : (fallback.regionDayPlan || []);
  const routeCities = Array.from(new Set([
    city.label,
    ...aiRouteLabels,
    ...(fallback._routeExplicit || []),
    ...regionDayPlan.map((x) => x.cityLabel)
  ])).filter(Boolean).slice(0, 5);

  const aiPrefs = normalizeAiSpecialPrefs(raw.specialPrefs);
  if (Object.keys(aiPrefs).length) used();
  const specialPrefs = { ...(fallback.specialPrefs || {}) };
  const prevPrefs = prev.specialPrefs && typeof prev.specialPrefs === 'object' ? prev.specialPrefs : {};
  for (const k of CHAT_PREF_FLAGS) {
    if (!aiPrefs[k]) continue;
    // 근거 없는 조건(P02 '쇼핑 제외', P16 '대중교통만')은 받지 않는다. 쇼핑 제외는 아래에서 메시지로만 정한다.
    const evidence = k === 'removeShopping' ? false : (PREF_EVIDENCE_RE[k] ? PREF_EVIDENCE_RE[k].test(message) : true);
    if (evidence || prevPrefs[k] === true) specialPrefs[k] = true;
  }
  // 하루 장소 수는 메시지에 숫자·여유 표현이 있을 때만 AI 값을 쓴다(아무 말 없는데 기본값을 넣는 일 방지)
  if (aiPrefs.maxPlacesPerDay && /\d|하나|둘|셋|넷|one|two|three|four|여유|느긋|천천히|relax|slow|ゆっくり|のんびり/i.test(message)) {
    specialPrefs.maxPlacesPerDay = aiPrefs.maxPlacesPerDay;
  }
  if (NEG_SHOPPING_RE.test(message) || negThemes.has('shopping')) specialPrefs.removeShopping = true;
  if (budget === 'low') specialPrefs.lowBudget = true;
  // 주 도시(규칙 해석이 정함)는 AI 경로에서도 경로에 있고 다른 도시를 이름으로 말하지 않았을 때만 둔다
  if (specialPrefs.mainCity) {
    const named = new Set(Array.isArray(fallback._namedCities) ? fallback._namedCities : []);
    if (!routeCities.includes(specialPrefs.mainCity) || routeCities.some((c) => c !== specialPrefs.mainCity && named.has(c))) delete specialPrefs.mainCity;
  }
  // 시각: AI 값은 메시지에 그 시각을 말한 근거(도착·출발·시작)가 있을 때만 쓴다
  const timeField = (name) => {
    const ai = clockOrEmpty(raw[name]);
    if (ai) used();
    const ok = ai && (!TIME_FIELD_EVIDENCE_RE[name] || TIME_FIELD_EVIDENCE_RE[name].test(message) || clockOrEmpty(prev[name]) === ai);
    return (ok ? ai : '') || fallback[name] || '';
  };
  const arrivalTime = timeField('arrivalTime');
  const departureTime = timeField('departureTime');
  const startTimeMin = timeField('startTimeMin');
  if (arrivalTime) { specialPrefs.arrivalTime = arrivalTime; if (Number(arrivalTime.slice(0, 2)) >= 15) specialPrefs.firstDayShort = true; }
  if (departureTime) specialPrefs.departureTime = departureTime;
  if (startTimeMin) { specialPrefs.startTimeMin = startTimeMin; if (Number(startTimeMin.slice(0, 2)) >= 10) specialPrefs.lateStart = true; }

  // 도착 공항: AI 코드가 경로 도시의 공항일 때만 쓴다(교토·오사카는 둘 다 KIX)
  const aiAirport = String(raw.arrivalAirport || '').toUpperCase().trim();
  const airportCity = cityKeyByAirport(aiAirport);
  let arrivalAirport = fallback.arrivalAirport && cityKeyByAirport(fallback.arrivalAirport) === cityKey ? fallback.arrivalAirport : city.airport;
  if (airportCity && routeCities.includes(CITY_DATA[airportCity].label)) arrivalAirport = aiAirport;
  if (routeCities.length > 1) {
    const firstKey = cityKeyByLabel(routeCities[0]);
    if (firstKey && CITY_DATA[firstKey]?.airport && !airportCity) arrivalAirport = CITY_DATA[firstKey].airport;
  }

  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 5)
    : [];

  return {
    cityKey,
    cityLabel,
    arrivalAirport,
    theme,
    budget,
    days,
    startDate,
    preferredAreas,
    preferAirportAccess: Boolean(raw.preferAirportAccess || fallback.preferAirportAccess),
    wantedPlaces,
    excludedPlaces,
    unsupportedPlaces: unsupportedPlaces.slice(0, 5),
    foodKeyword,
    routeCities,
    regionDayPlan: isWholeTripRegionPlan(regionDayPlan, routeCities.length, days) ? [] : regionDayPlan,
    specialPrefs,
    arrivalTime,
    departureTime,
    startTimeMin,
    reasons,
    isFollowUp: Boolean(raw.isFollowUp),
    _aiFieldCount: aiFieldCount,
    _cityFromMessage: fallback._cityFromMessage,
    _routeExplicit: fallback._routeExplicit,
    _daysExplicit: fallback._daysExplicit,
    _dateExplicit: fallback._dateExplicit,
    _substitutes: substitutes,
    ...(() => { const h = wantedTimeHints(message, wantedPlaces, routeKeysForNames); return { _allDayWanted: h.allDay, _eveningWanted: h.evening }; })(),
    _dayTripStay: (fallback._dayTripStay || []).filter((n) => wantedPlaces.includes(n))
  };
}

// 후속 대화 "교토 하루 더 늘려줘", "오사카 하루 줄이고 교토 하루 늘려줘", "add one more day in Kyoto" → [{cityLabel, delta}]
function parseCityDayDeltas(text) {
  const raw = String(text || '');
  const out = [];
  const amountOf = (s) => {
    if (/하루|one|a\s+day|1\s*일|1\s*days?|一日|1日/i.test(s)) return 1;
    if (/이틀|two|2\s*일|2\s*days?|2日/i.test(s)) return 2;
    const n = /(\d)\s*(?:일|days?|日)/i.exec(s);
    return n ? Number(n[1]) : 1;
  };
  const mentions = detectCityMentionsDetailed(raw);
  for (let i = 0; i < mentions.length; i += 1) {
    const end = i + 1 < mentions.length ? mentions[i + 1].idx : raw.length;
    const window = raw.slice(mentions[i].idx, end);
    const label = CITY_DATA[mentions[i].key]?.label;
    if (!label) continue;
    const plus = /(하루|이틀|\d\s*일|one\s+(?:more\s+)?day|\d\s*(?:more\s+)?days?|一日|\d日)\s*(?:만|정도)?\s*(?:더\s*)?(?:늘|추가|연장|더\s*있|more|extra|longer|add|増やし|追加|延長)/i.exec(window)
      || /(?:add|one\s+more|extend)\s+(?:a\s+|one\s+)?(?:more\s+)?(day|\d\s*days?)/i.exec(window);
    const minus = /(하루|이틀|\d\s*일|one\s+day|a\s+day|\d\s*days?|一日|\d日)\s*(?:만|정도)?\s*(?:줄|빼|단축|less|fewer|shorter|減らし|短縮)/i.exec(window);
    if (plus) out.push({ cityLabel: label, delta: amountOf(plus[0]) });
    else if (minus) out.push({ cityLabel: label, delta: -amountOf(minus[0]) });
  }
  // 영어는 도시 이름이 뒤에 온다: "one more day in Kyoto", "add a day in Kyoto", "one less day in Osaka"
  const enPlus = /(?:add\s+)?(one|a|two|\d)\s+(?:more|extra)\s+days?\s+(?:in|for|at|to)\s+([A-Za-z]+)/i.exec(raw)
    || /\badd\s+(?:(an?|one|two|\d)\s+)?(?:more\s+|extra\s+)?days?\s+(?:in|for|at|to)\s+([A-Za-z]+)/i.exec(raw);
  const enMinus = /(one|a|two|\d)\s+(?:less|fewer)\s+days?\s+(?:in|for|at)\s+([A-Za-z]+)/i.exec(raw);
  for (const [m, sign] of [[enPlus, 1], [enMinus, -1]]) {
    if (!m) continue;
    const ck = detectCityKeyByInput(m[2]);
    const label = CITY_DATA[ck]?.label;
    const n = EN_NUMBER_WORDS[String(m[1] || '').toLowerCase()] || Number(m[1]) || 1;
    if (label && !out.some((x) => x.cityLabel === label)) out.push({ cityLabel: label, delta: sign * n });
  }
  return out;
}

// 도시 이름 없이 말한 전체 일수 증감: "하루 더 늘려줘" → +1, "이틀 줄여줘" → -2, "add one more day" → +1, "1日増やして" → +1. 없으면 0.
function parseGlobalDayDelta(text) {
  const raw = String(text || '');
  const koN = (w) => KO_DAY_WORDS[w] || Number((/\d+/.exec(w) || [])[0]) || 1;
  let m = /(하루|이틀|사흘|나흘|\d{1,2}\s*일)\s*(?:만|정도|씩)?\s*(?:더\s*)?(?:줄|빼|단축|덜)/.exec(raw);
  if (m) return -koN(m[1].replace(/\s/g, ''));
  m = /(하루|이틀|사흘|나흘|\d{1,2}\s*일)\s*(?:만|정도|씩)?\s*(?:더\s*)?(?:늘|추가|연장)|(하루|이틀|사흘|나흘|\d{1,2}\s*일)\s*더/.exec(raw);
  if (m) return koN(String(m[1] || m[2]).replace(/\s/g, ''));
  const enN = (w) => EN_NUMBER_WORDS[String(w || '').toLowerCase()] || Number(w) || 1;
  m = /\b(?:remove|cut|drop|shorten(?:\s+(?:it|the\s+trip))?(?:\s+by)?)\s+(?:(an?|one|two|three|\d{1,2})\s+)?days?\b|\b(an?|one|two|three|\d{1,2})\s+(?:less|fewer)\s+days?\b/i.exec(raw);
  if (m) return -enN(m[1] || m[2]);
  m = /\b(?:add|extend(?:\s+(?:it|the\s+trip))?(?:\s+by)?)\s+(?:(an?|one|two|three|\d{1,2})\s+)?(?:more\s+|extra\s+)?days?\b|\b(an?|one|two|three|\d{1,2})\s+(?:more|extra)\s+days?\b/i.exec(raw);
  if (m) return enN(m[1] || m[2]);
  const jaN = (w) => JA_NUMBER_CHARS[w] || Number(w) || 1;
  m = /([1-9一二三])\s*日\s*(?:減らし|短く|短縮)/.exec(raw);
  if (m) return -jaN(m[1]);
  m = /(?:もう\s*)?([1-9一二三])\s*日\s*(?:増やし|追加|延長|伸ば)|もう\s*([1-9一二三])\s*日/.exec(raw);
  if (m) return jaN(m[1] || m[2]);
  return 0;
}

// 후속 대화에서 도시를 바꾸는 말('하코다테 대신 삿포로', '삿포로로 바꿔'). 이름 속 '대신'(야마노우에 대신궁)은 아니다.
const SWITCH_CITY_WORD_RE = new RegExp(`${INSTEAD_WORD_SRC}|바꿔|변경|말고|로\\s*가|instead|change|switch|代わり|変更`, 'i');
// 후속 대화: 이전 조건(prev)을 기본값으로 두고, 이번 메시지에서 분명히 바꾼 것(빼줘·대신·추가·하루 더)만 덮어쓴다.
function applyFollowUpRules(parsed, prev, message, fallback) {
  const out = { ...parsed, specialPrefs: { ...(parsed.specialPrefs || {}) } };
  const msg = String(message || '');
  const prevRoute = (Array.isArray(prev.routeCities) ? prev.routeCities : []).map((c) => resolveCityLabelFromRegionToken(c, '') || String(c || '').trim()).filter(Boolean);
  const prevKey = prev.cityKey && CITY_DATA[prev.cityKey] ? prev.cityKey : '';
  const negSpans = negatedPhrases(msg).join(' ');
  const removedCities = detectMentionedCityKeysOrdered(negSpans).map((k) => CITY_DATA[k]?.label).filter(Boolean);
  const msgCity = fallback._cityFromMessage || '';
  const msgCityLabel = CITY_DATA[msgCity]?.label || '';
  const switchCity = Boolean(msgCityLabel) && !prevRoute.includes(msgCityLabel) && SWITCH_CITY_WORD_RE.test(msg);
  if (prevKey && !switchCity) {
    out.cityKey = prevKey;
    out.cityLabel = (typeof prev.cityLabel === 'string' && prev.cityLabel) || CITY_DATA[prevKey].label;
    out.arrivalAirport = (typeof prev.arrivalAirport === 'string' && prev.arrivalAirport) || CITY_DATA[prevKey].airport;
  }
  const mainLabel = CITY_DATA[out.cityKey]?.label || out.cityLabel;
  // 이번 메시지에 나오지 않은 새 도시(AI가 이전 대화를 잘못 읽어 넣은 도시)는 경로에 더하지 않는다
  const msgCityLabels = new Set(detectAllCityKeysFromText(msg).map((k) => CITY_DATA[k]?.label).filter(Boolean));
  const keepCity = (c) => prevRoute.includes(c) || c === mainLabel || msgCityLabels.has(c);
  let route = Array.from(new Set([...(switchCity ? [] : prevRoute), mainLabel, ...(out.routeCities || []).filter(keepCity)]))
    .filter((c) => c && !removedCities.includes(c));
  if (route.length === 0) route = [mainLabel];
  // 테마·출발일·맛집·장소 수: 이번 메시지가 말했을 때만 바꾼다
  const themeSaid = parseThemeFromText(msg, '') !== '' || negatedThemes(msg).size > 0;
  if (!themeSaid && CHAT_THEMES.includes(prev.theme)) out.theme = prev.theme;
  if (!fallback._dateExplicit && typeof prev.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prev.startDate)) out.startDate = prev.startDate;
  if (!fallback.foodKeyword && typeof prev.foodKeyword === 'string' && prev.foodKeyword && !/먹|맛집|음식|food|eat|restaurant|グルメ|食べ/i.test(msg)) out.foodKeyword = prev.foodKeyword;
  const prevPrefs = prev.specialPrefs && typeof prev.specialPrefs === 'object' ? prev.specialPrefs : {};
  for (const k of CHAT_PREF_FLAGS) if (prevPrefs[k] === true) out.specialPrefs[k] = true;
  // 저예산·당일치기 장소 숙박도 이전 대화에서 이어 간다
  if (prevPrefs.lowBudget === true || out.budget === 'low') out.specialPrefs.lowBudget = true;
  if (typeof prevPrefs.overnightAt === 'string' && prevPrefs.overnightAt && !out.specialPrefs.overnightAt) out.specialPrefs.overnightAt = prevPrefs.overnightAt;
  // 주 도시('아사히카와 3일 아라시야마 공원')도 이어 간다. 경로에서 빠졌거나 경로가 한 도시면 버린다.
  if (typeof prevPrefs.mainCity === 'string' && prevPrefs.mainCity && !out.specialPrefs.mainCity) out.specialPrefs.mainCity = prevPrefs.mainCity;
  if (out.specialPrefs.mainCity && (route.length < 2 || !route.includes(out.specialPrefs.mainCity))) delete out.specialPrefs.mainCity;
  // 이번 메시지가 경로에 새 도시를 이름으로 더하면('오사카도 가고 싶어') 장소로만 들어온 경로가 아니라 주 도시를 버린다
  if (out.specialPrefs.mainCity && [...msgCityLabels].some((c) => c !== out.specialPrefs.mainCity && route.includes(c) && !prevRoute.includes(c))) delete out.specialPrefs.mainCity;
  const mainCity = out.specialPrefs.mainCity || '';
  if (!parseMaxPlacesPerDay(msg) && Number(prevPrefs.maxPlacesPerDay) > 0) out.specialPrefs.maxPlacesPerDay = clamp(Number(prevPrefs.maxPlacesPerDay), 1, 5);
  for (const t of ['arrivalTime', 'departureTime', 'startTimeMin']) {
    if (!out[t] && clockOrEmpty(prev[t])) { out[t] = clockOrEmpty(prev[t]); out.specialPrefs[t] = out[t]; }
  }
  // 장소: 이전 꼭 갈 곳 + 새로 말한 곳 − 이번에 뺀 곳 / 이전 제외 − 이번에 다시 넣은 곳
  const newlyExcluded = (parsed.excludedPlaces || []).filter(Boolean);
  const newlyWanted = (parsed.wantedPlaces || []).filter(Boolean);
  const keyOf = placeNameKey;
  const hitsAny = (n, list) => list.some((x) => { const a = keyOf(n); const b = keyOf(x); return a && b && (a === b || a.includes(b) || b.includes(a)); });
  out.excludedPlaces = dedupePlaceNames([...(Array.isArray(prev.excludedPlaces) ? prev.excludedPlaces : []).filter((x) => !hitsAny(x, newlyWanted)), ...newlyExcluded], 8);
  out.wantedPlaces = dedupePlaceNames([...(Array.isArray(prev.wantedPlaces) ? prev.wantedPlaces : []), ...newlyWanted], 8)
    .filter((x) => !hitsAny(x, out.excludedPlaces));
  // 일수: "교토 하루 더" 같은 도시별 증감은 이전 분배에 더한다(전체 일수도 같이, 1~10일)
  const baseDays = clamp(Number(prev.days) || Number(out.days) || 4, 1, 10);
  const prevPlan = normalizeRegionDayPlan(Array.isArray(prev.regionDayPlan) ? prev.regionDayPlan : [], []);
  const deltas = parseCityDayDeltas(msg);
  // 주 도시의 장소 도시 몫은 일정 요청과 같은 기준(꼭 갈 곳의 종일·반나절, 도착·출발 시각)으로 정한다. 여기서 나온 도시별 일수가
  // 그대로 지역별 일수가 되므로, 장소 도시를 하루로 줄여 꼭 갈 곳이 빠지지 않게 한다.
  const mainCtx = mainCity
    ? mainCityNeedContext(resolveMustVisit(out.wantedPlaces, [], route.map((c) => cityKeyByLabel(c)).filter(Boolean), 'ko', resolveExcludedNameKeys(out.excludedPlaces)), {},
      { ...out.specialPrefs, arrivalTime: out.arrivalTime || out.specialPrefs.arrivalTime || '', departureTime: out.departureTime || out.specialPrefs.departureTime || '' })
    : null;
  if (deltas.length > 0) {
    const seq = allocateDaysByCities(route, [], baseDays, prevPlan, mainCity, mainCtx);
    const counts = new Map(route.map((c) => [c, 0]));
    seq.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
    for (const { cityLabel, delta } of deltas) {
      if (!counts.has(cityLabel)) { route.push(cityLabel); counts.set(cityLabel, 0); }
      counts.set(cityLabel, Math.max(1, (counts.get(cityLabel) || 0) + delta));
    }
    let total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    // 10일을 넘으면 늘리지 않은 도시부터 하루씩 줄인다
    const grown = new Set(deltas.filter((d) => d.delta > 0).map((d) => d.cityLabel));
    for (const c of [...route].reverse()) {
      while (total > 10 && !grown.has(c) && (counts.get(c) || 0) > 1) { counts.set(c, counts.get(c) - 1); total -= 1; }
    }
    out.regionDayPlan = route.filter((c) => (counts.get(c) || 0) > 0).map((c) => ({ cityLabel: c, days: counts.get(c), unit: 'day' }));
    out.days = clamp(total, 1, 10);
  } else if (parseGlobalDayDelta(msg) !== 0) {
    // 도시 없이 "하루 더 늘려줘"/"add one more day"/"이틀 줄여줘": 전체 일수를 바꾸고, 여러 도시면 마지막 도시에서 더하고 뺀다
    const newDays = clamp(baseDays + parseGlobalDayDelta(msg), 1, 10);
    if (route.length > 1) {
      const seq = allocateDaysByCities(route, [], baseDays, prevPlan, mainCity, mainCtx);
      const counts = new Map(route.map((c) => [c, 0]));
      seq.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
      let diff = newDays - baseDays;
      const last = route[route.length - 1];
      while (diff > 0) { counts.set(last, (counts.get(last) || 0) + 1); diff -= 1; }
      while (diff < 0) {
        const c = [...route].reverse().find((x) => (counts.get(x) || 0) > 1);
        if (!c) break;
        counts.set(c, counts.get(c) - 1);
        diff += 1;
      }
      out.regionDayPlan = route.filter((c) => (counts.get(c) || 0) > 0).map((c) => ({ cityLabel: c, days: counts.get(c), unit: 'day' }));
      out.days = clamp(out.regionDayPlan.reduce((a, x) => a + x.days, 0), 1, 10);
    } else {
      out.regionDayPlan = prevPlan.length || (parsed.regionDayPlan || []).length ? [{ cityLabel: route[0], days: newDays, unit: 'day' }] : [];
      out.days = newDays;
    }
  } else if (!fallback._daysExplicit) {
    // 일수를 말하지 않았으면 이전 일수·분배를 그대로 둔다(AI가 바꾼 분배만 남아 일수와 어긋나는 일 방지)
    out.days = baseDays;
    if (prevPlan.length) out.regionDayPlan = prevPlan;
    else if (route.length <= 1) out.regionDayPlan = [];
  } else if (!(parsed.regionDayPlan || []).length && prevPlan.length) {
    out.regionDayPlan = route.length === 1 ? [{ cityLabel: route[0], days: clamp(Number(out.days) || baseDays, 1, 10), unit: 'day' }] : prevPlan;
  }
  out.regionDayPlan = (out.regionDayPlan || []).filter((x) => !removedCities.includes(x.cityLabel) && route.includes(x.cityLabel));
  out.routeCities = route.slice(0, 5);
  out._daysExplicit = true; // 후속 대화의 일수는 이전 대화에서 정해졌다
  out.isFollowUp = true;
  return out;
}

// 채팅 입력: history = [{role:'user'|'assistant', content ≤500}] 최대 12개, prevParsed = 객체(JSON 4KB 이하, 알려진 필드만)
function sanitizeChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h === 'object' && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
    .slice(-12)
    .map((h) => ({ role: h.role, content: h.content.trim().slice(0, 500) }));
}

const PREV_PARSED_FIELDS = ['cityKey', 'cityLabel', 'arrivalAirport', 'theme', 'budget', 'days', 'startDate', 'preferredAreas', 'wantedPlaces', 'excludedPlaces',
  'unsupportedPlaces', 'foodKeyword', 'routeCities', 'regionDayPlan', 'specialPrefs', 'arrivalTime', 'departureTime', 'startTimeMin'];
function sanitizePrevParsed(prev) {
  if (!prev || typeof prev !== 'object' || Array.isArray(prev)) return null;
  const out = {};
  for (const k of PREV_PARSED_FIELDS) {
    const v = prev[k];
    if (v === undefined || v === null) continue;
    if (['cityKey', 'cityLabel', 'arrivalAirport', 'theme', 'budget', 'startDate', 'foodKeyword', 'arrivalTime', 'departureTime', 'startTimeMin'].includes(k)) {
      if (typeof v === 'string') out[k] = v.slice(0, 80);
    } else if (k === 'days') {
      if (Number.isFinite(Number(v))) out[k] = clamp(Math.round(Number(v)), 1, 10);
    } else if (k === 'specialPrefs') {
      if (typeof v === 'object' && !Array.isArray(v)) {
        const sp = {};
        for (const [pk, pv] of Object.entries(v).slice(0, 60)) {
          if (typeof pv === 'boolean' || (typeof pv === 'number' && Number.isFinite(pv))) sp[pk] = pv;
          else if (typeof pv === 'string' && pv.length <= 10) sp[pk] = pv;
        }
        out[k] = sp;
      }
    } else if (k === 'regionDayPlan') {
      if (Array.isArray(v)) out[k] = v.slice(0, 6).filter((x) => x && typeof x === 'object').map((x) => ({ cityLabel: String(x.cityLabel || '').slice(0, 40), days: clamp(Number(x.days) || 1, 1, 10), unit: x.unit === 'night' ? 'night' : 'day' }));
    } else if (Array.isArray(v)) {
      out[k] = v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 8).map((x) => x.trim().slice(0, 60));
    }
  }
  return out;
}

// Gemini 채팅 해석 스키마(OpenAPI 부분집합). cityKey는 내장 도시 키 중 하나.
let _geminiChatSchema = null;
function geminiChatSchema() {
  if (_geminiChatSchema) return _geminiChatSchema;
  const str = { type: 'STRING' };
  const strList = { type: 'ARRAY', items: { type: 'STRING' } };
  const bool = { type: 'BOOLEAN' };
  _geminiChatSchema = {
    type: 'OBJECT',
    properties: {
      cityKey: { type: 'STRING', format: 'enum', enum: Object.keys(CITY_DATA).filter((k) => !CITY_DATA[k].dynamic) },
      cityLabel: str,
      arrivalAirport: str,
      theme: { type: 'STRING', format: 'enum', enum: CHAT_THEMES },
      budget: { type: 'STRING', format: 'enum', enum: ['low', 'mid', 'high'] },
      days: { type: 'INTEGER' },
      startDate: str,
      preferredAreas: strList,
      wantedPlaces: strList,
      excludedPlaces: strList,
      unsupportedPlaces: strList,
      foodKeyword: str,
      routeCities: strList,
      regionDayPlan: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { cityLabel: str, days: { type: 'INTEGER' }, unit: { type: 'STRING', format: 'enum', enum: ['day', 'night'] } },
          required: ['cityLabel', 'days', 'unit']
        }
      },
      specialPrefs: {
        type: 'OBJECT',
        properties: {
          indoorFocus: bool, removeShopping: bool, lateStart: bool, lowWalking: bool, relaxedPace: bool, addRestDay: bool,
          publicTransitOnly: bool, nightViewFocus: bool, firstDayShort: bool, kidsFriendly: bool, maxPlacesPerDay: { type: 'INTEGER' }
        }
      },
      arrivalTime: str,
      departureTime: str,
      startTimeMin: str,
      isFollowUp: bool,
      reasons: strList
    },
    required: ['cityKey', 'days', 'theme']
  };
  return _geminiChatSchema;
}

// 당일치기 데이터가 있는 근교(도시 목록에 없지만 일정에 '종일'로 넣을 수 있는 곳)
function supportedDayTripNames() {
  return Array.from(new Set(MUST_ATTRACTIONS.filter((m) => m.dayTrip || m.fullDay).map((m) => m.name)));
}

function chatAvailableCities() {
  return Object.entries(CITY_DATA).filter(([, v]) => !v.dynamic).map(([k, v]) => ({ key: k, label: v.label, airport: v.airport, areas: v.areas }));
}

const CHAT_PARSE_RULES = [
  'Parse the traveler\'s message into JSON that matches the schema. The country is Japan.',
  'cityKey must be one key from availableCities (the main or first city of the trip); cityLabel is its label.',
  'days = the whole trip length: "N박 M일" → M, "3 nights" → 4, "2泊3日" → 3, "Tokyo 3 days" → 3 (the message wins over context.days). "2일차"/"day 2"/"2日目" is a day number, not a length. If the message gives no length, use context.days. With several cities ("오사카 3일 교토 2일 나라 1일") days is the sum of all parts.',
  'routeCities = cities of the trip in visiting order (labels from availableCities). regionDayPlan = per-city lengths when given (cityLabel, days, unit day|night).',
  'wantedPlaces = concrete named places the traveler asked for, written as they wrote them. Foods ("라멘", "sushi") go to foodKeyword, never to wantedPlaces; generic words ("무료 명소", "紅葉の名所", "classic highlights", "저녁엔") are not places. excludedPlaces = places they want to avoid ("빼고", "말고", "제외", "대신", "no X", "skip X", "なし"); every item of a negated list ("A랑 B는 빼고") is excluded. Something negated never goes to wantedPlaces or theme: "쇼핑은 빼줘" means specialPrefs.removeShopping true and theme is not shopping.',
  'Places in supportedDayTrips are fine as wantedPlaces (they become day trips from the nearest city). Any other place or region that is not in availableCities goes to unsupportedPlaces (only real place names; never budgets such as "1인 50만원"); keep the total days unchanged.',
  'theme: mixed unless one focus clearly dominates (foodie, culture, shopping, nature). budget: low, mid or high (default mid).',
  'specialPrefs: set only flags the message clearly asks for (do not guess from "부모님" or "저예산"); leave the others out. arrivalTime, departureTime and startTimeMin are 24-hour HH:MM or "" (e.g. "밤 9시 도착" → arrivalTime "21:00", "아침 10시 이후 시작" → startTimeMin "10:00", "start at 11am" → startTimeMin "11:00").',
  'foodKeyword = food the traveler wants (for example "라멘, 모츠나베"), else "".',
  'reasons: up to 3 very short notes in the traveler\'s language.'
];

async function parseTravelChatWithOpenAI(message, context, history, prevParsed) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
  const hasHistory = Array.isArray(history) && history.length > 0;
  const systemParts = [
    ...CHAT_PARSE_RULES,
    `Today is ${formatDateISO(new Date())}. startDate is YYYY-MM-DD and never before today.`,
    hasHistory ? 'This is a FOLLOW-UP message. Merge the new intent with prevParsed; keep previous values unless the traveler changes them. Set isFollowUp to true.' : '',
    'Return only JSON matching schema.'
  ].filter(Boolean);
  const system = systemParts.join(' ');
  const inputMessages = [
    {
      role: 'system',
      content: [{ type: 'input_text', text: system }]
    }
  ];
  if (hasHistory) {
    // 지난 대화는 문자열 content로 보낸다(Responses API는 assistant 메시지의 content 배열에 input_text를 받지 않는다)
    for (const h of history.slice(-10)) {
      inputMessages.push({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: String(h.content || '')
      });
    }
  }
  const userData = { message, context, availableCities: chatAvailableCities(), supportedDayTrips: supportedDayTripNames() };
  if (prevParsed) userData.prevParsed = prevParsed;
  inputMessages.push({
    role: 'user',
    content: [{ type: 'input_text', text: JSON.stringify(userData) }]
  });
  const strList = { type: 'array', items: { type: 'string' } };
  const body = {
    input: inputMessages,
    text: {
      format: {
        type: 'json_schema',
        name: 'travel_chat_parser',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cityKey: { type: 'string' },
            cityLabel: { type: 'string' },
            arrivalAirport: { type: 'string' },
            theme: { type: 'string' },
            budget: { type: 'string' },
            days: { type: 'integer' },
            startDate: { type: 'string' },
            preferredAreas: strList,
            preferAirportAccess: { type: 'boolean' },
            wantedPlaces: strList,
            excludedPlaces: strList,
            unsupportedPlaces: strList,
            foodKeyword: { type: 'string' },
            routeCities: strList,
            arrivalTime: { type: 'string' },
            departureTime: { type: 'string' },
            startTimeMin: { type: 'string' },
            specialPrefs: {
              type: 'object',
              additionalProperties: false,
              properties: Object.fromEntries([...CHAT_PREF_FLAGS.map((k) => [k, { type: 'boolean' }]), ['maxPlacesPerDay', { type: 'integer' }]]),
              required: [...CHAT_PREF_FLAGS, 'maxPlacesPerDay']
            },
            regionDayPlan: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  cityLabel: { type: 'string' },
                  days: { type: 'integer' },
                  unit: { type: 'string' }
                },
                required: ['cityLabel', 'days', 'unit']
              }
            },
            reasons: strList,
            isFollowUp: { type: 'boolean' }
          },
          required: ['cityKey', 'cityLabel', 'arrivalAirport', 'theme', 'budget', 'days', 'startDate', 'preferredAreas', 'preferAirportAccess', 'wantedPlaces', 'excludedPlaces',
            'unsupportedPlaces', 'foodKeyword', 'routeCities', 'arrivalTime', 'departureTime', 'startTimeMin', 'specialPrefs', 'regionDayPlan', 'reasons', 'isFollowUp']
        },
        strict: true
      }
    }
  };
  // 모델 체인(주 모델 → OPENAI_FALLBACK_MODELS)·형식 검사는 callOpenAiResponses가 맡는다
  const { parsed, model } = await callOpenAiResponses(body);
  parsed._aiModel = model;
  return parsed;
}

async function parseTravelChatWithGemini(message, context, history, prevParsed) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  const hasHistory = Array.isArray(history) && history.length > 0;
  const historyBlock = hasHistory
    ? '\nPrevious conversation:\n' + history.map(h => `${h.role}: ${h.content}`).join('\n') + '\n'
    : '';
  const prevBlock = prevParsed
    ? '\nPreviously parsed conditions (use as baseline for follow-up):\n' + JSON.stringify(prevParsed) + '\n'
    : '';
  const today = formatDateISO(new Date());
  const prompt = [
    ...CHAT_PARSE_RULES,
    `Today is ${today}. startDate is YYYY-MM-DD and never before today: resolve "11월 20일", "next Friday" or "Christmas" to the next such date; if the message names no date, use context.startDate.`,
    hasHistory ? 'This is a FOLLOW-UP message in an ongoing conversation. The user may refer to previous context ("거기", "그곳", "추가", "변경", "빼줘", "하루 더"). Merge the new intent with the previous conditions and keep previous values unless they are explicitly changed.' : '',
    hasHistory ? 'Set isFollowUp: true in your response.' : '',
    'Do not return markdown.',
    historyBlock,
    prevBlock,
    JSON.stringify({
      message,
      context,
      availableCities: chatAvailableCities(),
      supportedDayTrips: supportedDayTripNames()
    })
  ].filter(Boolean).join('\n');
  const data = await callGeminiGenerateContent(prompt, {
    temperature: 0.2,
    // 생각 토큰은 끄고, 스키마 필드가 많아 출력 한도를 넉넉히 둔다(잘리면 AI_TRUNCATED)
    maxOutputTokens: 2048,
    thinkingBudget: 0,
    topP: 0.9,
    responseMimeType: 'application/json',
    responseSchema: geminiChatSchema()
  });
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  if (String(candidate?.finishReason || '').toUpperCase() === 'MAX_TOKENS') {
    throw new AiOutputError('AI_TRUNCATED', `Gemini chat parser output truncated (MAX_TOKENS, ${data?._usedModel || GEMINI_API_MODEL})`);
  }
  const text = extractGeminiText(data);
  const parsed = parseJsonFromText(text);
  if (!parsed) throw new AiOutputError('AI_INVALID_OUTPUT', 'Gemini parser returned unexpected format');
  parsed._aiModel = data._usedModel || GEMINI_API_MODEL;
  return parsed;
}

// ══════════════════════════════════════════════════════════════════════
// 대화로 일정 일부만 고치기(②)와 애매하면 되묻기(③) — docs/handoff.md 4절 1번
// 화면이 지금 일정(itinerary: { lang, cityKey, routeCities, days: [{ day, date, blocks }] })을 채팅 요청에 함께 보내면,
// 후속 말이 '편집 명령'(빼기·넣기·옮기기·바꾸기·시간)인지 먼저 본다. 편집이면 일정 전체를 다시 만들지 않고
//   { mode: 'edit', edit: { status: 'ask'|'none', question, choices, confirm }, reply, sourceInfo }
// 를 돌려준다. 화면은 사용자가 선택지를 누르거나 글로 골랐을 때만 직접 배치 함수(placeBlock·fitSightTime 등)로 그 칸을 바꾸고 ↩ 되돌리기를 붙인다.
//  - 일수·도시·경로·날짜·조건이 바뀌는 말('하루 더', '오사카도 추가', '삿포로 대신 하코다테')은 편집이 아니다 → null(지금처럼 다시 만들기).
//  - 해석: OpenAI 호환(Groq)만 쓴다. Gemini는 부르지 않는다(일정 생성 한도 보존). Groq가 없거나 실패하면 규칙 해석(ko/en/ja).
//  - 규칙 6: 넣거나 바꾸는 장소는 그날 도시의 후보(도시 명소·대표 명소·추가 명소·도시 주변 실제 명소·큐레이션 맛집)에서 찾은 것만.
//    못 찾은 이름, AI가 말에 없는 장소를 고른 경우는 넣지 않고 '찾지 못했어요' + 비슷한 후보를 선택지로 준다.
//  - 애매하면(같은 장소가 여러 날, 날짜 없이 넣을 날이 여럿, 한 칸에 일정이 여럿) 선택지를 돌려주고 고르기 전에는 바꾸지 않는다.
// ops: { op:'remove', day, block } | { op:'add', day, slot, name, area, kind } | { op:'move', fromDay, block, day, slot }
//      | { op:'replace', day, block, name, area, kind } | { op:'time', day, block, start } | { op:'swap', day, block, day2, block2 }(두 블록의 장소만 맞바꾸기)
//   편집은 절대 바로 적용하지 않는다(K1 '항상 확인 후 적용'). 확정된 편집도 status 'ask' + confirm:true로
//   '이렇게 바꿀까요?'와 바꿀 것 한 줄씩(날·칸·시각·장소)을 보이고 [이대로 바꾸기](편집이 여럿이면 편집마다 + [모두])·[취소]로 묻는다(editConfirmResult).
//   넣거나 바꿀 것이 장소 이름이 아니라 종류·음식 낱말('라멘 넣어줘'·'add an onsen')이면 편집이 아니다 → 지금처럼 다시 만들기(EDIT_CATEGORY_RE).
//   block = 화면이 보낸 블록 문자열 그대로(화면이 그 블록을 찾는다), slot = morning·afternoon·allday·night·breakfast·lunch·dinner
// ══════════════════════════════════════════════════════════════════════
const EDIT_SLOT_OF_PERIOD = Object.freeze({ '오전': 'morning', '오후': 'afternoon', '종일': 'allday', '아침': 'breakfast', '점심': 'lunch', '저녁': 'dinner' });
const EDIT_PERIOD_OF_SLOT = Object.freeze({ morning: '오전', afternoon: '오후', allday: '종일', night: '오후', breakfast: '아침', lunch: '점심', dinner: '저녁' });
const EDIT_MEAL_PERIODS = new Set(['아침', '점심', '저녁']);
// 말 속 칸 낱말: early = '아침'(맛집이면 아침 식사, 장소면 오전), evening = '저녁·밤'(식사가 있으면 저녁 식사, 장소면 저녁 이후)
const EDIT_SLOT_WORDS = new Set(['morning', 'afternoon', 'evening', 'allday', 'breakfast', 'lunch', 'dinner', 'early']);
const EDIT_ACTIONS = new Set(['remove', 'add', 'move', 'replace', 'time']);
const EDIT_MAX_OPS = 6;
const EDIT_MAX_CHOICES = 6;
const EDIT_TRANSFER_LINE_RE = /^(?:도시 이동: |Transfer: |都市間移動：)(.+?) -> (.+?)\s*[(（]/;
// 확인 문구의 블록 한 줄: a = { d: 일차, p: 칸, t: 'HH:MM-HH:MM'(모르면 ''), n: 장소 }
const editAtKo = (a) => `${a.d} ${a.p}${a.t ? `(${a.t})` : ''} ${a.n}`;
const editAtEn = (a) => `${a.n} (${a.d} ${a.p}${a.t ? ` ${a.t}` : ''})`;
const editAtJa = (a) => `${a.d}${a.p}${a.t ? `（${a.t}）` : ''}の${a.n}`;
// 바꿀 것 목록: 한 줄에 하나씩
const editBullets = (list) => list.map((l) => `· ${l}`).join('\n');
const EDIT_TEXT = {
  ko: {
    period: { '오전': '오전', '오후': '오후', '종일': '종일', '아침': '아침', '점심': '점심', '저녁': '저녁', night: '저녁 이후' },
    day: (n) => `${n}일차`,
    // 되묻기 끝 문장은 할 일(빼기·옮기기·시각·바꾸기)을 밝힌다(검토 K1c 사소한 의견 1: 라벨에는 할 일이 없어 말과 다른 동작을 고르지 않게)
    which: { remove: '어느 것을 뺄까요?', move: '어느 것을 옮길까요?', time: '어느 것의 시작 시각을 바꿀까요?', replace: '어느 것을 바꿀까요?', change: '어느 것을 고칠까요?' },
    askWhich: (name, n, q) => `'${name}'${koTopicParticle(name)} 일정에 ${n}번 있어요. ${q}`,
    askWhichSlot: (n, q) => `해당하는 일정이 ${n}개예요. ${q}`,
    askDay: (name) => `'${name}'${koObjectParticle(name)} 며칠째에 넣을까요?`,
    otherCity: (name, city) => `'${name}'${koTopicParticle(name)} ${city} 장소예요. ${city} 일정이 있는 날에 넣을까요?`,
    otherCityNoDay: (name, city) => `'${name}'${koTopicParticle(name)} ${city} 장소라 이 일정에 넣지 않았어요.`,
    notFound: (name, city) => `'${name}'${koTopicParticle(name)} ${city} 후보에서 찾지 못해 넣지 않았어요.`,
    pickInstead: '대신 이 중에서 고를까요?',
    confirmPick: (name) => `'${name}'${koObjectParticle(name)} 넣을까요? 아래에서 골라 주세요.`,
    targetMissing: (name) => `지금 일정에서 '${name}'${koObjectParticle(name)} 찾지 못했어요.`,
    slotEmpty: '말씀하신 칸에서 고칠 일정을 찾지 못했어요.',
    dayMissing: (n) => `${n}일차는 이 일정에 없어요.`,
    kindMismatch: '맛집은 식사 칸끼리, 장소는 장소 칸끼리만 바꿀 수 있어요.',
    duplicate: (name, d) => `'${name}'${koTopicParticle(name)} 이미 ${d} 일정에 있어요.`,
    sameSlot: (name) => `'${name}'${koTopicParticle(name)} 이미 그 칸에 있어요.`,
    sameTime: (name, t) => `'${name}'${koTopicParticle(name)} 이미 ${t}에 시작해요.`,
    badTime: "시간을 알아듣지 못했어요. '7시'나 '19:30'처럼 말해 주세요.",
    noName: '넣을 장소 이름을 알려 주세요.',
    unclear: "어느 칸을 어떻게 고칠지 알아듣지 못했어요. '2일째 오후 금각사 빼줘'처럼 말해 주세요.",
    exceptUnclear: "남길 곳 말고 나머지를 빼려면 날이나 시간대도 말해 주세요('3일째는 금각사 빼고 다 빼줘'). 아니면 뺄 곳을 하나씩 말해 주세요.",
    ackOnly: '네. 일정은 그대로 두었어요. 바꿀 곳이 있으면 말씀해 주세요.',
    later: '나머지는 고른 뒤에 다시 말씀해 주세요.',
    all: (n) => `모두(${n}곳)`,
    answerPicked: (label) => `'${label}'${koObjectParticle(label.replace(/\s*\([^()]*\)\s*$/, ''))} 골랐어요.`,
    answerNarrow: (n) => `맞는 선택지가 ${n}개예요. 아래에서 골라 주세요.`,
    answerChoose: '위 선택지에서 하나를 골라 주세요.',
    answerNoMatch: "맞는 선택지를 찾지 못했어요. 위 선택지에서 골라 주시거나, 그만두려면 '취소'라고 말해 주세요.",
    answerCancelled: '알겠어요. 일정은 그대로 둘게요.',
    confirmAll: (list) => `이렇게 바꿀까요?\n${editBullets(list)}`,
    confirmEach: (n, list) => `이렇게 알아들었어요.\n${editBullets(list)}\n바꿀 것을 하나 고르거나 '모두(${n}곳)'를 골라 주세요.`,
    confirmApply: '이대로 바꾸기',
    cancelChoice: '취소',
    alsoChanges: (list) => `(함께 바뀌는 것: ${list})`,
    swapUnclear: "어느 두 곳의 자리를 바꿀지 알아듣지 못했어요. '금각사랑 기요미즈데라 자리 바꿔줘'처럼 일정에 있는 두 곳을 말해 주세요.",
    swapAllDay: '하루 종일 일정은 반나절 칸과 자리를 바꿀 수 없어요.',
    op: {
      remove: (a) => `${editAtKo(a)} 빼기`,
      add: (d, p, n) => `${d} ${p}에 ${n} 넣기`,
      move: (a, d, p) => `${editAtKo(a)} → ${d} ${p} 옮기기`,
      replace: (a, n) => `${editAtKo(a)} → ${n}`,
      time: (a, t) => `${editAtKo(a)} → ${t} 시작`,
      swap: (a, b) => `${editAtKo(a)} ↔ ${editAtKo(b)} 자리 바꾸기`
    }
  },
  en: {
    period: { '오전': 'Morning', '오후': 'Afternoon', '종일': 'All day', '아침': 'Breakfast', '점심': 'Lunch', '저녁': 'Dinner', night: 'Evening' },
    day: (n) => `Day ${n}`,
    which: { remove: 'Which one should I remove?', move: 'Which one should I move?', time: 'Which one should get the new start time?', replace: 'Which one should I replace?', change: 'Which one should I change?' },
    askWhich: (name, n, q) => `'${name}' is in your plan ${n} times. ${q}`,
    askWhichSlot: (n, q) => `${n} items match. ${q}`,
    askDay: (name) => `Which day should I add '${name}' to?`,
    otherCity: (name, city) => `'${name}' is in ${city}. Add it to one of your ${city} days?`,
    otherCityNoDay: (name, city) => `'${name}' is in ${city}, so I did not add it to this plan.`,
    notFound: (name, city) => `I couldn't find '${name}' among the ${city} places, so I didn't add it.`,
    pickInstead: 'Pick one of these instead?',
    confirmPick: (name) => `Add '${name}'? Pick one below.`,
    targetMissing: (name) => `I couldn't find '${name}' in your current plan.`,
    slotEmpty: "I couldn't find anything to change in that slot.",
    dayMissing: (n) => `Your plan has no day ${n}.`,
    kindMismatch: 'Restaurants can only replace meals, and places can only replace places.',
    duplicate: (name, d) => `'${name}' is already in your plan on ${d}.`,
    sameSlot: (name) => `'${name}' is already in that slot.`,
    sameTime: (name, t) => `'${name}' already starts at ${t}.`,
    badTime: "I couldn't read the time. Try '7 pm' or '19:30'.",
    noName: 'Tell me the name of the place to add.',
    unclear: "I couldn't tell what to change. Try 'remove Kinkaku-ji from day 2'.",
    exceptUnclear: "To remove everything except some places, also say the day or time of day ('remove day 3 except Kinkaku-ji'), or name the places to remove one by one.",
    ackOnly: 'OK. Your plan stays as it is. Tell me if you want to change something.',
    later: 'Tell me the rest again after you choose.',
    all: (n) => `All (${n})`,
    answerPicked: (label) => `Picked '${label}'.`,
    answerNarrow: (n) => `${n} options match. Pick one below.`,
    answerChoose: 'Pick one of the options above.',
    answerNoMatch: "I couldn't match that to an option. Pick one above, or say 'cancel' to stop.",
    answerCancelled: 'OK. I left your plan as it is.',
    confirmAll: (list) => `Should I make this change?\n${editBullets(list)}`,
    confirmEach: (n, list) => `Here is what I understood:\n${editBullets(list)}\nPick one change, or 'All (${n})'.`,
    confirmApply: 'Yes, change it',
    cancelChoice: 'Cancel',
    alsoChanges: (list) => `(This also changes: ${list})`,
    swapUnclear: "I couldn't tell which two places to swap. Name two places in your plan, like 'swap Kinkaku-ji and Kiyomizu-dera'.",
    swapAllDay: "An all-day plan can't swap places with a half-day slot.",
    op: {
      remove: (a) => `remove ${editAtEn(a)}`,
      add: (d, p, n) => `add ${n} (${d} ${p})`,
      move: (a, d, p) => `move ${editAtEn(a)} to ${d} ${p}`,
      replace: (a, n) => `${editAtEn(a)} → ${n}`,
      time: (a, t) => `${editAtEn(a)}: start at ${t}`,
      swap: (a, b) => `swap ${editAtEn(a)} ↔ ${editAtEn(b)}`
    }
  },
  ja: {
    period: { '오전': '午前', '오후': '午後', '종일': '終日', '아침': '朝食', '점심': '昼食', '저녁': '夕食', night: '夜' },
    day: (n) => `${n}日目`,
    which: { remove: 'どれを削除しますか？', move: 'どれを移動しますか？', time: 'どれの開始時刻を変えますか？', replace: 'どれを入れ替えますか？', change: 'どれを変更しますか？' },
    askWhich: (name, n, q) => `「${name}」は日程に${n}回あります。${q}`,
    askWhichSlot: (n, q) => `該当する予定が${n}件あります。${q}`,
    askDay: (name) => `「${name}」を何日目に入れますか？`,
    otherCity: (name, city) => `「${name}」は${city}の場所です。${city}の日に入れますか？`,
    otherCityNoDay: (name, city) => `「${name}」は${city}の場所なので、この日程には入れませんでした。`,
    notFound: (name, city) => `「${name}」は${city}の候補に見つからなかったため入れていません。`,
    pickInstead: '代わりにこちらから選びますか？',
    confirmPick: (name) => `「${name}」を入れますか？下から選んでください。`,
    targetMissing: (name) => `今の日程に「${name}」が見つかりませんでした。`,
    slotEmpty: 'その枠に変更できる予定が見つかりませんでした。',
    dayMissing: (n) => `この日程に${n}日目はありません。`,
    kindMismatch: 'お店は食事の枠どうし、スポットはスポットの枠どうしでしか入れ替えられません。',
    duplicate: (name, d) => `「${name}」はすでに${d}の日程にあります。`,
    sameSlot: (name) => `「${name}」はすでにその枠にあります。`,
    sameTime: (name, t) => `「${name}」はすでに${t}開始です。`,
    badTime: '時刻が分かりませんでした。「19時」や「19:30」のように書いてください。',
    noName: '入れたい場所の名前を教えてください。',
    unclear: 'どの枠をどう変えるか分かりませんでした。「2日目の午後の金閣寺を外して」のように書いてください。',
    exceptUnclear: '残す場所以外をまとめて外すときは、日にちか時間帯も書いてください（「3日目は金閣寺以外を外して」）。または外す場所を一つずつ書いてください。',
    ackOnly: 'はい。日程はそのままにしています。変えたいところがあれば教えてください。',
    later: '残りは選んだあとでもう一度お知らせください。',
    all: (n) => `すべて（${n}件）`,
    answerPicked: (label) => `「${label}」を選びました。`,
    answerNarrow: (n) => `当てはまる選択肢が${n}件あります。下から選んでください。`,
    answerChoose: '上の選択肢から一つ選んでください。',
    answerNoMatch: '当てはまる選択肢が見つかりませんでした。上の選択肢から選ぶか、やめる場合は「キャンセル」と書いてください。',
    answerCancelled: 'わかりました。日程はそのままにします。',
    confirmAll: (list) => `この内容で変更しますか？\n${editBullets(list)}`,
    confirmEach: (n, list) => `このように受け取りました。\n${editBullets(list)}\n変更するものを一つ選ぶか、「すべて（${n}件）」を選んでください。`,
    confirmApply: 'この内容で変更',
    cancelChoice: 'キャンセル',
    alsoChanges: (list) => `（あわせて変わるもの：${list}）`,
    swapUnclear: '入れ替える2か所が分かりませんでした。「金閣寺と清水寺を入れ替えて」のように、日程にある2か所を書いてください。',
    swapAllDay: '終日の予定は半日の枠と入れ替えられません。',
    op: {
      remove: (a) => `${editAtJa(a)}を削除`,
      add: (d, p, n) => `${d}${p}に${n}を追加`,
      move: (a, d, p) => `${editAtJa(a)}を${d}${p}へ移動`,
      replace: (a, n) => `${editAtJa(a)}→${n}`,
      time: (a, t) => `${editAtJa(a)}を${t}開始に`,
      swap: (a, b) => `${editAtJa(a)}と${editAtJa(b)}を入れ替え`
    }
  }
};

// 화면이 보낸 일정: 날 12개·블록 60줄(각 300자)까지. 시간대 블록이 하나도 없으면 null(편집할 일정이 없다).
function sanitizeEditItinerary(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const seen = new Set();
  const days = [];
  for (const d of (Array.isArray(raw.days) ? raw.days : []).slice(0, 12)) {
    const n = Number(d && d.day);
    if (!Number.isInteger(n) || n < 1 || n > 30 || seen.has(n)) continue;
    seen.add(n);
    days.push({
      day: n,
      date: typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : '',
      blocks: (Array.isArray(d.blocks) ? d.blocks : []).filter((b) => typeof b === 'string').slice(0, 60).map((b) => b.slice(0, 300))
    });
  }
  days.sort((a, b) => a.day - b.day);
  if (!days.some((d) => d.blocks.some((b) => ITINERARY_MAIN_BLOCK_RE.test(b)))) return null;
  return {
    days,
    lang: normalizeLang(raw.lang),
    cityKey: typeof raw.cityKey === 'string' && CITY_DATA[raw.cityKey] ? raw.cityKey : '',
    routeCities: (Array.isArray(raw.routeCities) ? raw.routeCities : []).filter((c) => typeof c === 'string' && c.trim()).slice(0, 10).map((c) => c.trim().slice(0, 40))
  };
}

// 블록 한 줄 → { index, block, period, start, end(분), name, area } (시간대 블록이 아니면 null)
function editBlockInfo(block, index) {
  const m = ITINERARY_MAIN_BLOCK_RE.exec(String(block || ''));
  if (!m) return null;
  const placeText = m[4].trim();
  const withArea = /^(.+?)\s*\(([^()]*)\)\s*$/.exec(placeText);
  return { index, block, period: m[1], start: clockToMin(m[2]), end: clockToMin(m[3]), name: (withArea ? withArea[1] : placeText).trim(), area: withArea ? withArea[2].trim() : '' };
}

// 이름이 표기 목록 중 하나와 같은 장소인지(같거나, 3자 이상 표기를 포함하거나, 충분히 긴 이름이 표기에 들어 있음)
// 로마자 표기의 포함 비교는 단어 경계에서만 본다('Uji'는 'Omen Ginkakuji' 안의 글자가 아니라 단어여야 한다).
const EDIT_LATIN_RE = /^[\x20-\x7eÀ-ɏḀ-ỿ]+$/;
function editLatinWords(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’.\-]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}
// hay 안에 needle이 들어 있는지(키 기준). 로마자 needle은 hay의 단어 몇 개와 그대로 맞아야 한다.
function editLabelContains(hay, needle) {
  const hk = placeNameKey(hay);
  const nk = placeNameKey(needle);
  if (!hk || !nk || nk.length < 3 || !hk.includes(nk)) return false;
  if (!EDIT_LATIN_RE.test(String(needle))) return true;
  const hw = editLatinWords(hay);
  const nw = editLatinWords(needle);
  if (!nw.length) return false;
  for (let i = 0; i + nw.length <= hw.length; i += 1) if (nw.every((w, j) => hw[i + j] === w)) return true;
  return false;
}
function editNameMatches(name, labels) {
  const k = placeNameKey(name);
  if (!k) return false;
  return (labels || []).some((l) => {
    const lk = placeNameKey(l);
    if (!lk) return false;
    return lk === k || editLabelContains(name, l) || (k.length * 2 >= lk.length && editLabelContains(l, name));
  });
}
// 블록이 식사 칸인지(맛집 후보와만 포함 비교한다)
function editBlockKind(info) {
  return EDIT_MEAL_PERIODS.has(info && info.period) ? 'food' : 'dest';
}

// 그 도시의 편집 후보(규칙 6). 관광 = 도시 명소 풀(curatedCityPool: 도시 명소·대표 명소·추가 명소·도시 주변 실제 명소),
// 맛집 = 도시 큐레이션 맛집. 이름은 일정 언어(lang)로, 비교용 표기(labels)는 한글 원래 이름·en/ja 이름·별칭까지.
const _editCandidateCache = new Map();
function editCandidatesForCity(ck, lang) {
  const cacheKey = `${ck}|${lang}`;
  if (_editCandidateCache.has(cacheKey)) return _editCandidateCache.get(cacheKey);
  const city = CITY_DATA[ck];
  if (!city) return [];
  const out = [];
  const seen = new Set();
  const add = (entry, labelList) => {
    const labels = [...new Set(labelList.map((l) => String(l || '').trim()).filter(Boolean))];
    out.push({ ...entry, labels, keys: [...new Set(labels.map(placeNameKey).filter(Boolean))] });
  };
  const cityName = localizedCityName(ck, lang);
  for (const p of curatedCityPool(ck, lang)) {
    const ko = placeOriginalName(p);
    const k = placeNameKey(ko);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const must = MUST_ATTRACTIONS.find((m) => m.cityKey === ck && m.name === ko);
    const extra = EXTRA_PLACES.find((e) => e.cityKey === ck && e.name === ko);
    add({ kind: 'dest', ko, name: p.name, area: p.area || cityName, city: ck, allDay: Boolean(allDayPlaceKind(p, ck)), bestTime: String(p.bestTime || ''), generated: Boolean(extra && extra.generated) },
      [ko, p.name, localizePlaceLabel(ko, [ck], 'en'), localizePlaceLabel(ko, [ck], 'ja'), ...(must ? must.aliases || [] : []), ...(extra ? [extra.en, extra.ja, ...(extra.aliases || [])] : [])]);
  }
  for (const f of city.foods || []) {
    const k = placeNameKey(f.name);
    if (!k || seen.has(`food|${k}`)) continue;
    seen.add(`food|${k}`);
    add({ kind: 'food', ko: f.name, name: localizeCuratedFoodName(f.name, ck, lang), area: localizeCuratedArea(f.area, lang, cityName), city: ck, generic: Boolean(f.generic) },
      [f.name, localizeCuratedFoodName(f.name, ck, lang), localizeCuratedFoodName(f.name, ck, 'en'), localizeCuratedFoodName(f.name, ck, 'ja')]);
  }
  _editCandidateCache.set(cacheKey, out);
  return out;
}

// 편집 문맥: 경로 도시, 도시별 후보, 날마다 블록 정보와 그날 도시
// 그날 도시 = 도시 이동 줄('도시 이동: A -> B')의 도착 도시 → 그날 장소가 가장 많이 든 경로 도시 → 전날 도시
function buildEditContext(it, replyLang) {
  const routeKeys = [];
  const pushKey = (k) => { if (k && CITY_DATA[k] && !routeKeys.includes(k)) routeKeys.push(k); };
  pushKey(it.cityKey);
  it.routeCities.forEach((c) => pushKey(cityKeyForExactLabel(c) || detectCityKeyByInput(c)));
  if (!routeKeys.length) detectAllCityKeysFromText(it.days.flatMap((d) => d.blocks).join('\n')).slice(0, 3).forEach(pushKey);
  if (!routeKeys.length) pushKey('tokyo');
  const cands = new Map(routeKeys.map((ck) => [ck, editCandidatesForCity(ck, it.lang)]));
  const days = it.days.map((d) => ({ day: d.day, date: d.date, blocks: d.blocks, infos: d.blocks.map((b, i) => editBlockInfo(b, i)).filter(Boolean), city: '' }));
  let prev = routeKeys[0];
  for (const d of days) {
    let ck = '';
    if (routeKeys.length > 1) {
      for (const b of d.blocks) {
        const m = EDIT_TRANSFER_LINE_RE.exec(String(b || '').trim());
        if (!m) continue;
        const k = cityKeyForExactLabel(m[2]) || detectCityKeyByInput(m[2]);
        if (routeKeys.includes(k)) ck = k;
      }
      if (!ck) {
        let best = 0;
        for (const k of routeKeys) {
          const n = d.infos.filter((info) => cands.get(k).some((c) => c.kind === editBlockKind(info) && editNameMatches(info.name, c.labels))).length;
          if (n > best) { best = n; ck = k; }
        }
      }
    }
    d.city = ck || prev;
    prev = d.city;
  }
  return { lang: it.lang, replyLang: normalizeLang(replyLang), routeKeys, cands, days, lastDay: days.length ? days[days.length - 1].day : 1 };
}

// ── 말 나누기(규칙 해석): 장소·일차·칸·시각·동사·바꾸기 표지의 위치 ──
function editRanges(re, text, fn) {
  const out = [];
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m;
  while ((m = r.exec(text))) {
    if (!m[0]) { r.lastIndex += 1; continue; }
    const v = fn ? fn(m) : {};
    if (v) out.push({ start: m.index, end: m.index + m[0].length, raw: m[0], ...v });
  }
  return out;
}
function editOverlaps(a, list) {
  return list.some((b) => a.start < b.end && b.start < a.end);
}
// 긴 것부터 남기고 겹치는 짧은 것은 버린다(위치 순으로 돌려준다)
function editKeepLongest(list) {
  const kept = [];
  for (const t of [...list].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)) if (!editOverlaps(t, kept)) kept.push(t);
  return kept.sort((a, b) => a.start - b.start);
}

// 글 속 표기 자리: 로마자는 단어 경계(4자 이상), 한글·한자·가나는 띄어쓰기를 무시하고(2자 이상, 두 글자 한글은 앞에 한글이 붙지 않을 때만)
function editTextIndex(text) {
  // 로마자만 소문자로(글자 수가 그대로여야 원문 위치와 맞는다)
  const lower = String(text || '').replace(/[A-Z]/g, (c) => c.toLowerCase());
  const map = [];
  let compact = '';
  for (let i = 0; i < lower.length; i += 1) {
    if (/\s/.test(lower[i])) continue;
    compact += lower[i];
    map.push(i);
  }
  return { lower, compact, map };
}
function editLabelSpans(index, label) {
  const a = String(label || '').toLowerCase().trim();
  if (!a) return [];
  if (/^[a-z0-9 .'&-]+$/.test(a)) {
    if (a.replace(/[^a-z0-9]/g, '').length < 4) return [];
    return aliasHitPositions(index.lower, a).map((idx) => ({ start: idx, end: idx + a.length }));
  }
  const c = a.replace(/\s+/g, '');
  if (c.length < 2) return [];
  const shortKo = /^[가-힣]{2}$/.test(c);
  const out = [];
  let from = 0;
  while (from <= index.compact.length - c.length) {
    const i = index.compact.indexOf(c, from);
    if (i < 0) break;
    from = i + 1;
    if (shortKo && i > 0 && /[가-힣]/.test(index.compact[i - 1]) && index.map[i - 1] === index.map[i] - 1) continue;
    out.push({ start: index.map[i], end: index.map[i + c.length - 1] + 1 });
  }
  return out;
}

// 말 속 장소: 일정에 든 장소(블록 이름)와 경로 도시 후보. 같은 후보에 묶인 블록(다른 표기·여러 날)은 한 장소로 본다.
// 반환: [{ type:'place', start, end, text, blocks: [{ day, info }], cand }]
function findEditPlaceMentions(text, ctx) {
  const index = editTextIndex(text);
  let ents = [];
  const byKey = new Map();
  for (const d of ctx.days) {
    for (const info of d.infos) {
      const k = placeNameKey(info.name);
      if (!k) continue;
      let e = byKey.get(k);
      if (!e) { e = { key: k, labels: [info.name], blocks: [], cand: null }; byKey.set(k, e); ents.push(e); }
      e.blocks.push({ day: d.day, info });
    }
  }
  // 블록 ↔ 후보: 이름이 같은 것(키 일치)을 먼저 묶고, 남은 블록만 포함 비교로 묶는다. 포함 비교는 같은 종류끼리만
  // (식사 칸 ↔ 맛집, 관광 칸 ↔ 관광지: 'おめん 銀閣寺本店' 저녁은 관광지 銀閣寺가 아니다).
  const blockEnts = ents.slice();
  const entKind = (e) => (e.blocks.every((b) => editBlockKind(b.info) === 'food') ? 'food' : (e.blocks.every((b) => editBlockKind(b.info) === 'dest') ? 'dest' : ''));
  const bind = (cand, matched) => {
    const head = matched[0];
    head.cand = cand;
    head.labels.push(...cand.labels);
    for (const other of matched.slice(1)) { head.blocks.push(...other.blocks); head.labels.push(...other.labels); other.dead = true; }
  };
  const allCands = ctx.routeKeys.flatMap((ck) => ctx.cands.get(ck) || []);
  const bound = new Set();
  for (const cand of allCands) {
    const matched = blockEnts.filter((e) => !e.cand && !e.dead && cand.keys.includes(e.key));
    if (matched.length) { bind(cand, matched); bound.add(cand); }
  }
  for (const cand of allCands) {
    if (bound.has(cand)) continue;
    const matched = blockEnts.filter((e) => !e.cand && !e.dead && entKind(e) === cand.kind && editNameMatches(e.labels[0], cand.labels));
    if (matched.length) { bind(cand, matched); bound.add(cand); continue; }
    ents.push({ key: '', labels: cand.labels.slice(), blocks: [], cand });
  }
  ents = ents.filter((e) => !e.dead);
  const hits = [];
  ents.forEach((e, ei) => {
    for (const label of new Set(e.labels)) for (const sp of editLabelSpans(index, label)) hits.push({ ...sp, ei });
  });
  return editKeepLongest(hits).map((h) => ({ type: 'place', start: h.start, end: h.end, text: String(text).slice(h.start, h.end), blocks: ents[h.ei].blocks, cand: ents[h.ei].cand }));
}

const EDIT_KO_ORDINAL = { '첫': 1, '첫째': 1, '둘째': 2, '두째': 2, '셋째': 3, '세째': 3, '넷째': 4, '네째': 4, '다섯째': 5, '여섯째': 6, '일곱째': 7, '여덟째': 8, '아홉째': 9, '열째': 10 };
const EDIT_EN_ORDINAL = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
// 일차: '2일째'·'2일차'·'둘째 날'·'첫날'·'마지막 날'·'3일에'·'day 2'·'2nd day'·'the last day'·'2日目'·'二日目'·'初日'·'最終日'
function findEditDayRefs(text, lastDay) {
  const last = Math.max(1, Number(lastDay) || 1);
  const list = [
    ...editRanges(/(\d{1,2})\s*(?:일\s*째|일\s*차|번째\s*날|째\s*날|日目)/g, text, (m) => ({ day: Number(m[1]) })),
    ...editRanges(/(첫째|둘째|두째|셋째|세째|넷째|네째|다섯째|여섯째|일곱째|여덟째|아홉째|열째|첫)\s*날/g, text, (m) => ({ day: EDIT_KO_ORDINAL[m[1]] })),
    ...editRanges(/이튿날/g, text, () => ({ day: 2 })),
    ...editRanges(/마지막\s*날|最終日|最後の日|\b(?:the\s+)?(?:last|final)\s+day\b/gi, text, () => ({ day: last })),
    ...editRanges(/初日/g, text, () => ({ day: 1 })),
    ...editRanges(/([一二三四五六七八九十])\s*日目/g, text, (m) => ({ day: JA_NUMBER_CHARS[m[1]] })),
    ...editRanges(/\bday\s*(\d{1,2})\b(?!\s*(?:days?|nights?)\b)/gi, text, (m) => ({ day: Number(m[1]) })),
    ...editRanges(/\b(\d{1,2})(?:st|nd|rd|th)\s+day\b/gi, text, (m) => ({ day: Number(m[1]) })),
    ...editRanges(/\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+day\b/gi, text, (m) => ({ day: EDIT_EN_ORDINAL[m[1].toLowerCase()] })),
    // '3일에'·'3일의'(날짜 '10월 3일에'는 아니다). 한국어로는 'N일'이 보통 날짜(그달 N일)라 일정에 날짜가 있으면 그 날로 바꾼다(tokenizeItineraryEdit).
    ...editRanges(/(?<!월\s*)(?<!\d)(\d{1,2})\s*일(?=\s*(?:에는|에|엔|의)(?![가-힣]))/g, text, (m) => ({ day: Number(m[1]), dom: Number(m[1]) }))
  ];
  return editKeepLongest(list.filter((d) => Number.isInteger(d.day) && d.day >= 1).map((d) => ({ ...d, type: 'day' })));
}

const EDIT_SLOT_RES = [
  [/아침\s*(?:식사|밥)|조식|\bbreakfast\b|朝食|朝ごはん|朝ご飯/gi, 'breakfast'],
  // '昼に'·'昼の'도 점심 칸('昼間'·'昼過ぎ'·'昼前'·'昼頃'은 아니다)
  [/점심|런치|\blunch\b|昼食|昼ごはん|昼ご飯|ランチ|昼(?!間|過ぎ|すぎ|前|頃|ごろ)/gi, 'lunch'],
  // '저녁 이후'·'저녁 먹고'·'after dinner'·'夕食後'는 화면의 '🌙 저녁 이후' 칸(장소)
  [/저녁\s*(?:식사\s*)?(?:이후|후|뒤|먹고)|\bafter\s+dinner\b|夕食後|夕食の後/gi, 'evening'],
  [/저녁\s*(?:식사|밥)|석식|디너|\bdinner\b|夕食|晩ごはん|晩ご飯|夕ご飯|ディナー/gi, 'dinner'],
  [/하루\s*종일|종일|\ball[\s-]?day\b|終日|一日中/gi, 'allday'],
  [/오전|\bmorning\b|午前/gi, 'morning'],
  [/오후|\bafternoon\b|午後/gi, 'afternoon'],
  [/저녁|밤|\b(?:evening|night|tonight)\b|夕方|夜/gi, 'evening'],
  [/아침|朝/g, 'early']
];
function findEditSlotRefs(text) {
  return editKeepLongest(EDIT_SLOT_RES.flatMap(([re, slot]) => editRanges(re, text, () => ({ slot, type: 'slot' }))));
}

// 시각: '7시'·'7시 반'·'19시 30분'·'오후 7시'·'7:30'·'7pm'·'at 7'·'19時'·'午後7時半' → { h, m, ampm: 'am'|'pm'|'' }
// '2시간'·'2時間'(걸리는 시간)은 시각이 아니다.
function findEditTimes(text) {
  // 시각 앞 낱말('저녁 8시'의 저녁)은 칸도 알려 준다(장소 없이 '2일째 저녁 8시로'면 저녁 식사 칸)
  const SLOT_HINT = { '저녁': 'evening', '밤': 'evening', '夜': 'evening', '夕方': 'evening', '아침': 'early', '朝': 'early', '오전': 'morning', '午前': 'morning', '오후': 'afternoon', '午後': 'afternoon', '낮': 'afternoon' };
  const mk = (h, m, ampm, word) => (h >= 0 && h <= 23 && m >= 0 && m <= 59 ? { type: 'time', h, m, ampm, slotHint: SLOT_HINT[word] || '' } : null);
  const amOf = (w) => {
    const s = String(w || '').toLowerCase();
    if (!s) return '';
    if (/^p/.test(s) || /^(?:오후|저녁|밤|낮|午後|夜|夕方)$/.test(s)) return 'pm';
    if (/^a/.test(s) || /^(?:오전|아침|새벽|午前|朝)$/.test(s)) return 'am';
    return '';
  };
  return editKeepLongest([
    ...editRanges(/(?:(오전|오후|저녁|밤|아침|낮|새벽|午前|午後|夜|朝|夕方)\s*)?(\d{1,2})\s*(?:시|時)(?!\s*(?:간|間))\s*(?:(\d{1,2})\s*(?:분|分)|(반|半))?/g, text,
      (m) => mk(Number(m[2]), m[4] ? 30 : Number(m[3] || 0), amOf(m[1]), m[1])),
    ...editRanges(/(?:(오전|오후|저녁|밤|아침|午前|午後|夜|朝)\s*)?(\d{1,2}):([0-5]\d)(?:\s*([ap])\.?m\.?(?![a-z]))?/gi, text,
      (m) => mk(Number(m[2]), Number(m[3]), amOf(m[4] || m[1]), m[1])),
    ...editRanges(/\b(\d{1,2})\s*([ap])\.?m\.?(?![a-z])/gi, text, (m) => mk(Number(m[1]), 0, amOf(m[2]))),
    ...editRanges(/\b(?:at|to|around)\s+(\d{1,2})(?:\s*o'?clock)?(?![\d:.]|\s*(?:st|nd|rd|th|days?|nights?|[ap]\.?m)\b)/gi, text, (m) => mk(Number(m[1]), 0, ''))
  ]);
}

const EDIT_VERB_RES = [
  // '뺄래'·'넣지 마'·'外さないで'처럼 부정이 붙는 꼴도 동사로 잡아 둔다(뒤의 부정을 보고 그대로 두기로 바꾼다)
  // 들르는·가는 뜻의 구동사('drop by/in/into'·'drop me/us at'·'skip to'·'take off for')와 'Xでやめて'(X에서 그만 = 거기까지 하고 끝)는 빼기가 아니다(검토 F7·F8)
  ['remove', /빼|뺄|제외|지워|지우고|지우자|삭제|없애|취소해|취소하|안\s*갈래|안\s*가도|\bremove\b|\bdelete\b|\bdrop\b(?!\s+(?:by|in|into|me|us|off\s+at|over)\b)|\bskip\b(?!\s+(?:to|over\s+to|ahead\s+to)\b)|\bcancel\b|\btake\s+out\b|\btake\s+off\b(?!\s+for\b)|\bget\s+rid\s+of\b|外して|外す|削除|消して|(?<!で\s*)やめて|抜いて|なしで|行かない|(?:外さ|消さ|抜か|やめ|取ら)(?=な|ず)/gi],
  ['add', /넣어|넣고|넣자|넣을|넣기|넣으|넣(?=지|진)|추가|포함|끼워|\badd\b|\binclude\b|\binsert\b|\bput\b|入れて|入れる|入れたい|入れ(?=な|ず)|追加|加えて/gi],
  // 바람('가고 싶어'·'visit'·'行きたい')은 여행 요청에도 흔하다: 경로 도시 후보이고 일차·칸을 말했을 때만 넣기로 본다(parseItineraryEditRules)
  ['wish', /들러|들르|가고\s*싶|\bvisit\b|\bsee\b|行きたい|寄りたい|寄って/gi],
  ['move', /옮겨|옮기|옮길|이동해|이동시|이동하|미뤄|미루|당겨|당기|\bmove\b|\bshift\b|\breschedule\b|\bpush\b|移して|移す|移動|ずらして|動かして|(?:移さ|動かさ)(?=な|ず)/gi],
  ['change', /바꿔|바꾸|바꿀|변경|교체|교환|\breplace\b|\bswap\b|\bchange\b|\bswitch\b|変えて|変更|替えて|入れ替え|交換|(?:変え|替え)(?=な|ず)/gi],
  // 그대로 두기('금각사는 그대로 두고', '금각사는 두고·냅둬·살리고', 'keep Kinkaku-ji', '金閣寺は残して'): 그 절의 장소는 고치지 않는다
  ['keep', /그대로|남겨|남기|유지|냅두|냅둬|놔두|놔둬|살리|살려|(?<![가-힣])(?:두고|둬|둬요|두자|둘래|둘게|두세요)(?![가-힣])|\bkeep\b|\bstays?\b|残して|残す|そのまま/gi]
];
// 부정('안 빼도 돼'·'빼지 마'·'빼지 말고'·'빼면 안 돼'·"don't remove"·'do not drop'·'削除しないで'): 그 동사는 그대로 두기(keep)로 본다.
// 동사 뒤(한국어·일본어)와 동사 앞(한국어 '안·못', 영어 don't·do not·never …)을 본다.
const EDIT_NEG_AFTER_RES = [
  /^\s*(?:하|해)?\s*지(?:는|도|만)?\s*(?:마|말(?:고|아)?|않|못)/,
  /^\s*(?:하|해)?\s*진\s*(?:마|말(?:고|아)?|않)/,
  /^\s*(?:하|해)?\s*(?:으)?면\s*안\s*(?:돼|되|됩|된)/,
  /^\s*(?:し|さ|せ)?(?:ないで|ない|なくて|なくても|ません|ずに|ちゃだめ|ては(?:いけ|だめ)|るな)/
];
const EDIT_NEG_BEFORE_RES = [
  /(?:^|[^가-힣])(?:안|못)\s*$/,
  /\b(?:don['’]?t|do\s+not|doesn['’]?t|does\s+not|didn['’]?t|never|not|no\s+need\s+to|needn['’]?t|shouldn['’]?t|should\s+not|won['’]?t|will\s+not|can['’]?t|cannot|mustn['’]?t|must\s+not)\s+(?:(?:please|really|ever|need\s+to|have\s+to|want\s+to|wanna)\s+)*$/i
];
// 바꾸기 표지: 'A 대신 B'·'A 말고 B'·'Aの代わりにB'(앞이 원래 장소) / 'B instead of A'(뒤가 원래 장소)
const EDIT_INSTEAD_RES = [
  [new RegExp(`${INSTEAD_WORD_SRC}|말고`, 'g'), 'before'],
  [/の?代わりに|の?かわりに|じゃなくて|ではなく/g, 'before'],
  [/\binstead\s+of\b|\brather\s+than\b/gi, 'after']
];
// ── 바로 적용은 '단순한 명령'만(검토 K1 U1~U11) ──
// 말투를 하나씩 막지 않고, 아래 표지가 하나라도 있으면(장소·일차·칸·시각 이름 속 글자는 보지 않는다) 고치기 전에 '이렇게 바꿀까요?'로 묻는다.
// neg 부정·거절, keep 그대로 두기, cond 조건, question 질문, contrast 대조('말고'·'instead of'·'じゃなくて'), swap 맞바꾸기, clauses 절이 여럿(쉼표·접속어·문장 둘)
const EDIT_POLITE_ASK_RE = /줄래|줄\s*수|주실|주세요|주겠|줘|해\s*줄|\bcan\s+you\b|\bcould\s+you\b|\bwould\s+you\b|\bwill\s+you\b|\bplease\b|くれ|もらえ|ください|いただけ/i;
const EDIT_CONFIRM_MARKERS = [
  // '안 갈래'·'안 가도'는 그 자체가 빼기 동사다(부정 표지로 세지 않는다)
  ['neg', /(?<![가-힣])(?:안|못)(?!\s*(?:갈래|가도))(?=\s|$|[.,!?~]|빼|뺄|넣|옮|바꾸|바꿔|가|갈|해|할|돼|되|지우|없애|취소)|않|(?:지|진|지는|지도|질)\s*(?:마|말)|(?<![가-힣])마(?:세요|요|라)?(?![가-힣])|없(?!애)|싫|아니|아닌|아냐|아님|그만/],
  ['neg', /\b(?:not|no|never|neither|nor|none|nothing|without|hate|rather)\b|n['’]t\b/i],
  ['neg', /ない|なく|ません|ぬ(?=$|[。、！!？?\s])|(?<=[さかがたなばらわれめえけげせてねべ])ず(?:に|と)?(?![らっ])|[うくぐすつぬぶむる]な(?=$|[。、！!？?\s」』])|の[はを]\s*(?:やめ|よし|止め)|不要|だめ|ダメ|いけない|嫌/],
  ['keep', /그대로|남겨|남기|유지|냅두|냅둬|놔두|놔둬|살리|살려|괜찮|좋아|건드리|(?<![가-힣])(?:두고|둬|둬요|두자|둘래|둘게)(?![가-힣])/],
  ['keep', /\b(?:keep|keeps|kept|stay|stays|staying|leave|untouched|fine|as\s+is)\b/i],
  ['keep', /そのまま|このまま|残し|残す|まま/],
  ['cond', /(?<=[가-힣])(?:으)?면(?=$|[\s,.!?~])|거든|경우|\b(?:if|unless|whether|in\s+case)\b|たら|なら|れば|場合|ときは|時は/i],
  // '빼지 말고'의 '말고'는 부정(neg)이지 대조가 아니다
  ['contrast', /(?<!(?:지|진)(?:는|도|만)?\s*)말고|아니라|아니고|\binstead\b|\brather\s+than\b|\bbut\b|\bexcept\b|\bother\s+than\b|じゃなくて|じゃなく|ではなく|でなく/i],
  ['swap', /순서|자리|서로|맞바꾸|맞바꿔|교환|위치|\b(?:swap|switch|exchange|trade)\b|入れ替|交換|順番|逆に/i],
  // 쉼표·마침표로 나뉜 절은 editMarkerReasons가 따로 센다('remove Kinkaku-ji, thanks'처럼 인사만 붙은 것은 절이 아니다)
  ['clauses', /그리고|그\s*다음|다음에|하고\s*나서|\b(?:and|then|also|plus)\b|そして|それから|および/i],
  // 장소 바로 뒤의 '랑·하고·와·と'(장소 자리는 비워 둔다): 여러 곳을 말했다('금각사랑 철도박물관 빼줘'에서 뒤 장소를 못 알아들었을 수 있다)
  ['clauses', /(?<![가-힣぀-ヿ一-鿿])(?:이랑|랑|하고|와|과|및)(?=\s|$)|(?<![぀-ヿ一-鿿])[とや]/],
  // 끝나는 시각('4시에 끝나게', 'until 4', '16時まで'): 시작 시각 바꾸기로 나타낼 수 없다
  ['end', /끝나|끝내|끝날|까지|\buntil\b|\btill\b|\bend(?:s|ing)?\s+(?:at|by)\b|まで|終わ/i]
];
// 질문('빼야 할까?'·'Should I drop …?'·'外すべき？'). '?'가 있어도 부탁('빼 줄래?'·'can you …?')이면 질문으로 보지 않는다.
function editIsQuestion(s) {
  const t = String(s || '').trim();
  if (/[?？]/.test(t) && !EDIT_POLITE_ASK_RE.test(t)) return true;
  return /까요?\s*[.!~]*$/.test(t) || /べき|ほうがいい|方がいい/.test(t) || /\bshould\s+(?:i|we)\b|\bwhat\s+if\b|\bis\s+it\s+ok/i.test(t);
}
// 인사·맞장구만 있는 조각('thanks'·'please'·'고마워'·'네'·'お願いします')은 절로 세지 않는다
const EDIT_POLITE_ONLY_RE = /^(?:\s|please|pls|thanks?|thank\s+you|ok(?:ay)?|yes|sure|감사(?:해요|합니다)?|고마워(?:요)?|고맙습니다|부탁(?:해|해요|드려요|합니다)?|네|응|좋아요?|ありがとう(?:ございます)?|お願い(?:します)?|よろしく(?:お願いします)?|はい|うん)*$/i;
// 말 속 표지(장소·일차·칸·시각 토큰 자리는 비운 뒤 본다)
function editMarkerReasons(text, tokens) {
  const raw = String(text || '');
  let s = raw;
  for (const t of tokens) if (['place', 'day', 'slot', 'time'].includes(t.type)) s = s.slice(0, t.start) + ' '.repeat(t.end - t.start) + s.slice(t.end);
  const out = new Set(EDIT_CONFIRM_MARKERS.filter(([, re]) => re.test(s)).map(([r]) => r));
  // 쉼표·마침표로 나뉜 조각 중 내용이 있는 것(인사만 있는 조각 빼고)이 둘 이상이면 절이 여럿이다. 나누는 자리는 이름 밖에서만 찾는다.
  const cuts = [...s.matchAll(/[,，、;；.。!！?？]+/g)].map((m) => [m.index, m.index + m[0].length]);
  let from = 0;
  let pieces = 0;
  for (const [a, b] of [...cuts, [raw.length, raw.length]]) {
    const piece = raw.slice(from, a).replace(/[.,!?~…'"“”‘’()]/g, ' ').trim();
    if (piece && !EDIT_POLITE_ONLY_RE.test(piece)) pieces += 1;
    from = b;
  }
  if (pieces >= 2) out.add('clauses');
  if (editIsQuestion(s)) out.add('question');
  if (tokens.some((t) => t.type === 'verb' && t.verb === 'keep')) out.add('keep');
  return [...out];
}
// 구조 표지: 절이 여럿(동사 둘 이상, 단 '빼고 + 넣어'를 바꾸기 하나로 합친 것은 아니다)·편집 여럿·편집 하나에 장소가 너무 많음
function editStructureReasons(tokens, rawOps) {
  const out = [];
  const verbs = tokens.filter((t) => t.type === 'verb');
  const mergedOne = rawOps.length === 1 && rawOps[0].merged;
  if (verbs.length >= 2 && !mergedOne) out.push('clauses');
  if (rawOps.length >= 2) out.push('multi');
  const seen = new Set();
  for (const t of tokens) if (t.type === 'place') seen.add(t.cand ? `c|${t.cand.city}|${t.cand.ko}|${t.cand.kind}` : (t.blocks.length ? `b|${placeNameKey(t.blocks[0].info.name)}` : `t|${placeNameKey(t.text)}`));
  const allowed = rawOps.length === 1 && ['replace', 'swap'].includes(rawOps[0].action) ? 2 : 1;
  if (seen.size > allowed) out.push('places');
  return out;
}
// ── 단순한 명령인지 거꾸로 센다: 알아들은 것 밖에 남는 낱말(검토 K1 재검토 2) ──
// 표지 낱말 목록으로만 막으면 목록에 없는 말('금각사 삭제 취소'·'금각사 다음 일정'·'빼야 하나'·'以外'·'when it rains')이 새어 나간다.
// 그래서 알아들은 것(장소·일차·칸·시각·동사·바꾸기 표지·경로 도시)과 아래 군말(조사·동사 꼬리·부탁·인사)을 지우고도 낱말이 남으면
// 단순한 명령이 아니라고 본다(바로 고치지 않고 확인). 모르는 말은 늘 확인 쪽으로 간다.
const EDIT_KO_PARTICLE_SRC = '(?:은|는|이|가|을|를|에|에서|의|도|로|으로|만|에다|에다가|쯤|엔|께|요|이요)';
const EDIT_JA_PARTICLE_SRC = '(?:を|は|が|に|で|の|へ|も)';
const EDIT_REST_RES = {
  // 장소·일차·칸·시각·도시 바로 뒤('금각사는'·'3일째에'·'7시로'·'金閣寺を'·'3日目の')
  particle: new RegExp(`^(?:${EDIT_KO_PARTICLE_SRC}+|${EDIT_JA_PARTICLE_SRC}+|s)$`),
  // 동사 바로 뒤('빼줘'·'삭제해'·'옮겨줄래'·'빼고'·'넣어주세요'·'外してください'·'削除で'). '빼야'·'빼도'·'빼는'·'外すの'는 아니다.
  tail: /^(?:(?:어|아|여)?(?:서)?(?:시켜)?(?:해|하)?(?:줘|줘요|주세요|주셔요|주실래요|주시겠어요|주라|줄래|줄래요|주렴|주십시오|버려|버려요|버려줘|버리자|자|요|라|고|해|해요|해라|하자|할래|할게|할게요|합시다|기|두고|둬)?|(?:して|する|します|しよう|しといて|しておいて|ください|下さい|くれ|ほしい|欲しい|ちょうだい|お願い|お願いします|です|ます|で|ね|よ)+)$/,
  // 띄어 쓴 부탁 꼬리('빼 줘'·'삭제해 주세요'·'外して ください')
  politeAux: /^(?:(?:해|하)?(?:줘|줘요|주세요|주셔요|주실래요|주시겠어요|줄래|줄래요|주십시오)|해|해요|ください|下さい|お願い(?:します)?)$/,
  // 따로 선 군말(부탁·인사·'좀'·'일정에서'·'please'·'from my plan')
  fillerKo: new RegExp(`^(?:좀|제발|그냥|꼭|네|넵|예|응|그럼|이제|싶어|싶어요|싶다|싶습니다|부탁(?:해|해요|드려요|드립니다|합니다)?|감사(?:해요|합니다)?|고마워(?:요)?|고맙습니다|일정${EDIT_KO_PARTICLE_SRC}*)$`),
  fillerJa: new RegExp(`^(?:(?:日程|予定|プラン)(?:から|${EDIT_JA_PARTICLE_SRC})*|お願い(?:します)?|ください|はい|うん)$`),
  fillerEn: /^(?:the|a|an|from|to|on|in|at|of|for|with|by|into|onto|my|our|this|plan|itinerary|schedule|please|pls|kindly|can|could|would|will|you|me|us|i|we|want|wanna|like|id|lets|let|it|just|now|thanks|thank|ok|okay|yes|sure|hi|hey)$/i,
  // 이름 없이 일차·칸으로 가리키는 말('2일째 오후에 있는 그 절', 'that temple on day 2', '2日目の午後のお寺'): 말에 장소 이름이 없을 때만
  genericKo: new RegExp(`^(?:그|저|이|거|것|곳|데|장소|절|신사|일정|관광지|명소|가게|식당|맛집|있는|있던|잡힌|거기|저기|여기)${EDIT_KO_PARTICLE_SRC}*$`),
  genericJa: new RegExp(`^(?:${EDIT_JA_PARTICLE_SRC}|その|この|あの|それ|これ|あれ|そこ|ここ|お寺|寺|神社|場所|ところ|所|お店|店|スポット|予定)+$`),
  genericEn: /^(?:that|this|the|one|place|spot|temple|shrine|restaurant|sight|stop|thing|activity|there)$/i
};
// 알아들은 것과 군말을 지우고 남는 낱말 [{ start, end, raw }]
function editExtraWords(text, tokens, ctx) {
  const src = String(text || '');
  const R = EDIT_REST_RES;
  const anyPlace = tokens.some((t) => t.type === 'place');
  const spans = tokens.map((t) => ({ type: t.type, start: t.start, end: t.type === 'verb' && t.negEnd ? t.negEnd : t.end }));
  // 경로 도시 이름('교토에서 은각사 빼줘')은 그 일정의 도시라 알아들은 말이다
  for (const h of cityMentionHits(src)) {
    const sp = { type: 'city', start: h.idx, end: h.idx + h.len };
    if (ctx.routeKeys.includes(h.key) && !editOverlaps(sp, spans)) spans.push(sp);
  }
  let s = src;
  const blank = (a, b) => { s = s.slice(0, a) + ' '.repeat(b - a) + s.slice(b); };
  for (const sp of spans) blank(sp.start, sp.end);
  for (const m of [...s.matchAll(/줄\s*수\s*(?:있어요?|있나요?|있니|있습니까)/g)]) blank(m.index, m.index + m[0].length);
  // 낱말 속 따옴표("let's"·"I'd")는 붙이고(글자 수는 그대로), 나머지 문장 부호는 빈칸으로
  s = s.replace(/([A-Za-z])['’]([A-Za-z])/g, '$1$2 ').replace(/[.,!?~…'"“”‘’「」『』()（）、。！？·・:;]/g, ' ');
  const out = [];
  for (const c of editRanges(/\S+/g, s)) {
    const w = c.raw;
    const prev = spans.find((sp) => sp.end === c.start) || null;
    const lang = /[가-힣]/.test(w) ? 'Ko' : (/[぀-ヿ一-鿿]/.test(w) ? 'Ja' : 'En');
    const ok = (prev && ['place', 'day', 'slot', 'time', 'city'].includes(prev.type) && R.particle.test(w))
      || (prev && (prev.type === 'verb' || prev.type === 'instead') && R.tail.test(w))
      || R.politeAux.test(w) || R[`filler${lang}`].test(w) || (!anyPlace && R[`generic${lang}`].test(w));
    if (!ok) out.push({ start: c.start, end: c.end, raw: w });
  }
  return out;
}
// 남는 낱말 중 그대로 두기 절('금각사는 그대로 두고'·'빼지 말고'·"don't remove …,") 밖에 있는 것. 넣기만 있는 말은 이것만 본다.
// 한국어·일본어는 낱말 뒤의 동사(바로 붙은 꼬리는 앞 동사), 영어는 낱말 앞의 동사 몫이다.
function editLiveExtra(extra, tokens, style) {
  const verbs = tokens.filter((t) => t.type === 'verb');
  if (!verbs.length) return extra;
  return extra.filter((c) => {
    const v = style === 'sov'
      ? (verbs.find((x) => (x.negEnd || x.end) === c.start) || verbs.find((x) => x.start >= c.end) || verbs[verbs.length - 1])
      : ([...verbs].reverse().find((x) => x.start < c.start) || verbs[0]);
    return v.verb !== 'keep';
  });
}
// 일수·날짜·조건·여행 전체를 바꾸는 말(편집이 아니다 → 다시 만들기)
const EDIT_TRIP_LEVEL_RE = /다시\s*(?:짜|만들)|새로\s*(?:짜|만들)|처음부터|일정\s*(?:을|를)?\s*(?:짜|만들)|여행\s*(?:을|를)?\s*(?:짜|계획)|실내\s*위주|예산|테마(?!\s*파크)|\bstart\s+over\b|\bfrom\s+scratch\b|\bre-?plan\b|\bnew\s+(?:plan|itinerary)\b|\bbudget\b|\bindoor\b|作り直|最初から|新しいプラン|予算|屋内|도착|출발|비행기|항공|공항|시작|\barriv|\bdepart|\bflight|\bairport|\bland(?:s|ing)?\b|\bstart|到着|出発|飛行機|空港|便|開始|スタート/i;
// '여행'·'trip'·'旅行'은 일차를 말하지 않았으면 여행 전체 요청으로 본다('디즈니랜드 빼고 도쿄 여행')
const EDIT_TRIP_WORD_RE = /여행|\btrip\b|\btravel|\bvacation\b|\bholiday\b|旅行/i;
// 종류·음식·테마 낱말(장소 이름이 아니다): 넣거나 바꿀 것이 이것이면('라멘 넣어줘'·'2일차 점심에 라멘 넣어줘'·'센소지 근처 맛집 추가해줘'·
// 'add an onsen'·'ラーメン屋を追加して'·'買い物を入れて') 한 칸 편집이 아니라 지금처럼 조건(테마·음식)으로 다시 만든다(검토 R1, 6da5de3과 같이).
// 일정·후보에 있는 장소 이름('아후리 라멘'·'쿠사츠 온천') 속 글자는 보지 않는다(장소 자리를 비운 뒤 본다).
const EDIT_CATEGORY_RE = /라멘|라면|스시|초밥|이자카야|술집|야키니쿠|야키토리|우동|소바|돈카츠|규카츠|카레|타코야키|오코노미야키|텐동|규동|덮밥|맛집|먹거리|음식|식당|레스토랑|카페|디저트|빵집|베이커리|쇼핑|아울렛|백화점|기념품|온천|야경|\b(?:ramen|sushi|izakaya|yakiniku|yakitori|udon|soba|tonkatsu|curry|takoyaki|okonomiyaki|tempura|restaurants?|food|eatery|cafes?|coffee|desserts?|sweets|bakery|bars?|pubs?|shopping|shops?|outlets?|malls?|souvenirs?|onsen|hot\s+springs?|night\s+views?)\b|café|ラーメン|寿司|すし|居酒屋|焼肉|焼き鳥|うどん|とんかつ|カレー|たこ焼き|お好み焼き|天ぷら|グルメ|レストラン|食堂|カフェ|喫茶|スイーツ|買い物|ショッピング|お土産|温泉|夜景/i;
// 이름 대신 가리키는 말('그 절', '거기', 'that place', 'それ'): 일차·칸으로 대상을 찾는다
const EDIT_GENERIC_REF_RE = /^(?:(?:그|저|이)\s*)?(?:거|것|곳|데|장소|절|신사|일정|관광지|명소|가게|식당|맛집|거기|저기|여기)$|^(?:it|that|this|there|(?:that|the|this)\s+(?:place|one|spot|temple|shrine|restaurant|sight))$|^(?:それ|そこ|あれ|あそこ|この|その)/i;
const EDIT_FILLER_WORDS = new Set(['에', '에는', '엔', '에다', '에다가', '을', '를', '은', '는', '이', '가', '도', '좀', '꼭', '그리고', '일정', '일정에', '일정을', '일정은', '하나', '더', '다시', '한번', '로', '으로', '해', '해줘', '줘', '주세요', '줄래', '할래', '하고', '싶어', '의', '있는', '하는', '가는',
  'to', 'on', 'in', 'at', 'for', 'the', 'a', 'an', 'please', 'my', 'plan', 'and', 'into', 'onto', 'of', 'it', 'there', 'also', 'too', 'some', 'with', 'from', 'can', 'you', 'could', 'would', 'me', 'us', 'i', 'want']);

// 칸·시각 낱말을 지운 덩어리에서 이름처럼 보이는 말('호그와트 성', 'Hogwarts Castle', 'ホグワーツ城'). 2~40자가 아니면 ''.
// 덩어리 첫머리·일차·칸·시각 낱말 바로 뒤의 일본어 조사('金閣寺をホグワーツ城に'의 を, '3日目の夕食に寿司'의 の·に)는 이름이 아니다
// (검토 R4: 「に寿司」로 답하지 않게). 조사만으로 된 낱말은 버리고, 끝 낱말 뒤의 조사 한 글자('寿司を')를 지운다.
const EDIT_JA_AFTER_TOKEN_RE = /^(?:には|では|への|での|との|にも|でも|の|に|を|は|へ|も|で|と|が)/;
function editLooseName(text, start, end, tokens) {
  let s = '';
  const hi = Math.min(text.length, end);
  let from = Math.max(0, start);
  if (from > 0) {
    const lead = EDIT_JA_AFTER_TOKEN_RE.exec(text.slice(from, hi));
    if (lead) from += lead[0].length;
  }
  for (let i = from; i < hi; i += 1) {
    const tok = tokens.find((t) => t.type !== 'place' && i >= t.start && i < t.end);
    if (!tok) { s += text[i]; continue; }
    const p = EDIT_JA_AFTER_TOKEN_RE.exec(text.slice(tok.end, hi));
    const next = Math.min(hi, tok.end + (p ? p[0].length : 0));
    s += ' '.repeat(next - i);
    i = next - 1;
  }
  s = s.replace(/[.,!?'"“”‘’「」『』()（）、。！？~…]/g, ' ');
  const words = s.split(/\s+/).filter(Boolean).filter((w) => !EDIT_FILLER_WORDS.has(w.toLowerCase()) && !/^[のにをはへもでとが]+$/.test(w));
  if (words.length) words[words.length - 1] = words[words.length - 1].replace(/(?<=[가-힣]{2})(?:을|를|은|는|이|가|도|에|에서|으로|로)$/, '').replace(/(?<=\S)[のにをはへもでが]$/, '');
  const name = words.join(' ').trim();
  return name.length >= 2 && name.length <= 40 ? name : '';
}

// 말 → 토큰(위치 순). 장소를 먼저 찾고, 그 밖 낱말은 장소 이름과 겹치지 않을 때만 센다('하코다테 아침시장'의 '아침').
function tokenizeItineraryEdit(text, ctx) {
  const places = findEditPlaceMentions(text, ctx);
  const outside = (list) => list.filter((t) => !editOverlaps(t, places));
  const times = outside(findEditTimes(text));
  const days = outside(findEditDayRefs(text, ctx.lastDay)).filter((t) => !editOverlaps(t, times));
  // '5일에'(날짜): 일정에 날짜가 있으면 그 날짜의 일차로. 일정 안에 그 날짜가 없으면 다시 만들기(editRegenSignal 'date').
  const dated = ctx.days.filter((d) => d.date);
  for (const t of days) {
    if (!t.dom || !dated.length) continue;
    const hit = dated.find((d) => Number(d.date.slice(8, 10)) === t.dom);
    if (hit) t.day = hit.day;
    else t.badDate = true;
  }
  const slots = outside(findEditSlotRefs(text)).filter((t) => !editOverlaps(t, times) && !editOverlaps(t, days));
  const taken = [...places, ...times, ...days, ...slots];
  const verbs = editKeepLongest(EDIT_VERB_RES.flatMap(([verb, re]) => editRanges(re, text, () => ({ type: 'verb', verb })))).filter((t) => !editOverlaps(t, taken));
  // 부정된 동사는 그대로 두기(keep). '빼지 말고'의 '말고'는 바꾸기 표지가 아니므로 그 자리를 기억해 둔다.
  const negSpans = [];
  for (const v of verbs) {
    if (v.verb === 'keep') continue;
    const after = text.slice(v.end);
    const negAfter = EDIT_NEG_AFTER_RES.map((re) => re.exec(after)).find(Boolean);
    const negBefore = EDIT_NEG_BEFORE_RES.some((re) => re.test(text.slice(0, v.start)));
    if (!negAfter && !negBefore) continue;
    v.verb = 'keep';
    v.negated = true;
    if (negAfter) {
      negSpans.push({ start: v.end, end: v.end + negAfter[0].length });
      v.negEnd = v.end + negAfter[0].length; // 부정 꼬리('지 말고'·'しないで')까지가 이 동사다(editExtraWords)
    }
  }
  const instead = editKeepLongest(EDIT_INSTEAD_RES.flatMap(([re, dir]) => editRanges(re, text, () => ({ type: 'instead', dir }))))
    .filter((t) => !editOverlaps(t, taken) && !editOverlaps(t, negSpans));
  const withs = editRanges(/\b(?:with|for|by)\b/gi, text, () => ({ type: 'with' })).filter((t) => !editOverlaps(t, taken));
  // 바람 동사는 넣기로 다루되 표시를 남긴다(weak)
  for (const v of verbs) if (v.verb === 'wish') { v.verb = 'add'; v.weak = true; }
  const tokens = [...places, ...times, ...days, ...slots, ...verbs, ...instead, ...withs].sort((a, b) => a.start - b.start);
  // 목적지 표지: 뒤에 '로·으로·に·へ'가 붙거나 앞에 'to·into'가 온 일차·칸·시각·장소. 출발 표지: 'from'·'에서·から'.
  for (const t of tokens) {
    const after = text.slice(t.end, t.end + 4);
    const before = text.slice(Math.max(0, t.start - 8), t.start);
    t.dest = /^\s*(?:으로|로|에다|に|へ|まで)/.test(after) || /\b(?:to|into|onto)\s+(?:the\s+)?$/i.test(before);
    t.from = /\bfrom\s+(?:the\s+)?$/i.test(before) || /^\s*(?:에서|から)/.test(after);
  }
  return tokens;
}

// 토큰 → 절(동사 하나씩). 한국어·일본어는 동사 앞의 말이, 영어는 동사 뒤의 말이 그 동사 몫이다.
function splitEditClauses(tokens, text, style) {
  const verbs = tokens.filter((t) => t.type === 'verb');
  if (!verbs.length) return [{ verb: null, tokens: tokens.slice(), segStart: 0, segEnd: text.length }];
  const clauses = verbs.map((v, i) => ({
    verb: v,
    tokens: [],
    segStart: style === 'sov' ? (i > 0 ? verbs[i - 1].end : 0) : v.end,
    segEnd: style === 'sov' ? v.start : (i + 1 < verbs.length ? verbs[i + 1].start : text.length)
  }));
  for (const t of tokens) {
    if (t.type === 'verb') continue;
    let ci;
    if (style === 'sov') {
      ci = verbs.findIndex((v) => t.start < v.start);
      if (ci < 0) ci = verbs.length - 1;
    } else {
      ci = 0;
      verbs.forEach((v, i) => { if (v.start <= t.start) ci = i; });
    }
    clauses[ci].tokens.push(t);
  }
  return clauses;
}

// 절 하나 → 규칙 해석 편집(raw op). raw op 모양은 AI 해석과 같다(resolveEditOp가 함께 쓴다).
function editRawOp(extra) {
  return { action: '', day: 0, slot: '', place: '', placeMention: null, newPlace: '', newMention: null, toDay: 0, toSlot: '', time: null, ...extra };
}
function editClauseOps(cl, text, style, opts = {}) {
  const of = (type) => cl.tokens.filter((t) => t.type === type);
  const places = of('place');
  const days = of('day');
  const slots = of('slot');
  const times = of('time');
  const instead = of('instead')[0] || null;
  const verb = cl.verb ? cl.verb.verb : '';
  // 장소마다 가장 가까운 앞쪽(영어는 뒤쪽 포함) 일차·칸
  const nearest = (list, p) => {
    if (!list.length) return null;
    if (!p) return list[0];
    const beforeP = list.filter((x) => x.end <= p.start);
    return beforeP.length ? beforeP[beforeP.length - 1] : list[0];
  };
  const dayFor = (p) => { const d = nearest(days.filter((x) => !x.dest), p) || nearest(days, p); return d ? d.day : 0; };
  const slotFor = (p) => { const s = nearest(slots.filter((x) => !x.dest), p) || nearest(slots, p); return s ? s.slot : ''; };
  // (0) 그대로 두기·부정('금각사는 안 빼도 돼', "don't remove Kinkaku-ji"): 이 절은 아무것도 고치지 않는다
  if (verb === 'keep') return [];
  // 시각과 함께 넣기·빼기('2일째 저녁 7시에 이자카야 넣어줘', '오후 2시 이후는 빼줘'), 시각과 장소 둘·바꾸기 표지('A 대신 3시에 B'),
  // 다른 날로 옮기면서 시각('금각사를 3일째 오후 3시로 옮겨')은 한 칸의 시각 바꾸기로 나타낼 수 없다 → 다시 만들기(지금처럼 조건으로)
  if (times.length) {
    const p0 = places[0] || null;
    const destDay = days.some((d) => d.dest || (style === 'sov' && p0 && d.start >= p0.end));
    if (verb === 'add' || verb === 'remove' || places.length > 1 || instead || (p0 && destDay)) return [editRawOp({ action: 'regen' })];
  }
  // (0-1) 맞바꾸기('후시미 이나리랑 아라시야마 순서 바꿔줘'·'swap A with B'·'AとBを入れ替えて'): 두 곳의 시각·칸은 두고 장소만 서로 바꾼다.
  // 'A를 B로 바꾸기'로 읽지 않는다(한 곳이 지워지고 다른 곳이 두 번 들어가지 않게). 일정에 있는 두 곳이 아니면 알아듣지 못했다고 답한다.
  // 두 곳 중 한 곳만 일정에 있으면('금각사 자리에 은각사로 바꿔줘'·'switch Kinkaku-ji for Ginkaku-ji'·'금각사 자리에 은각사 넣어줘') 맞바꾸기가 아니라
  // 그 자리를 새 장소로 바꾸기다(아래 바꾸기로). 맞바꾸기 표지가 있으니 확인을 거친다.
  const intoSlot = opts.swap && places.length === 2 && places[0].blocks.length > 0 && !places[1].blocks.length;
  if (intoSlot && verb === 'add') {
    return [editRawOp({ action: 'replace', day: dayFor(places[0]), slot: slotFor(places[0]), place: places[0].text, placeMention: places[0], newPlace: places[1].text, newMention: places[1] })];
  }
  if (opts.swap && verb === 'change' && !intoSlot) {
    const inPlan = places.filter((p) => p.blocks.length);
    if (inPlan.length !== 2) return [editRawOp({ action: 'swapUnclear' })];
    const [a, b] = inPlan;
    const near = (list, p, lo) => list.filter((x) => x.end <= p.start && x.start >= lo).pop() || null;
    const da = near(days, a, 0);
    const sa = near(slots, a, 0);
    const db = near(days, b, a.end);
    const sb = near(slots, b, a.end);
    return [editRawOp({ action: 'swap', day: da ? da.day : 0, slot: sa ? sa.slot : '', place: a.text, placeMention: a, newPlace: b.text, newMention: b, toDay: db ? db.day : 0, toSlot: sb ? sb.slot : '' })];
  }
  // (1) 'A 대신 B'·'A 말고 B'·'B instead of A'
  if (instead) {
    const before = places.filter((p) => p.end <= instead.start);
    const after = places.filter((p) => p.start >= instead.end);
    const oldP = instead.dir === 'after' ? after[0] : before[before.length - 1];
    const newP = instead.dir === 'after' ? before[before.length - 1] : after[0];
    // 'A 말고 B 빼줘'·'remove B instead of A': 빼라는 것은 B뿐이다(A는 대조일 뿐 고치지 않는다).
    // B가 장소가 아니면('금각사 말고 다른 건 다 빼줘') A를 바꾸거나 빼지 않고 알아듣지 못했다고 답한다.
    if (verb === 'remove') return [newP ? editRawOp({ action: 'remove', day: dayFor(newP), slot: slotFor(newP), place: newP.text, placeMention: newP }) : editRawOp({ action: 'unclear' })];
    if (oldP) {
      const newText = newP ? newP.text : (instead.dir === 'after'
        ? editLooseName(text, cl.segStart, instead.start, cl.tokens)
        : editLooseName(text, instead.end, cl.verb && cl.verb.start > instead.end ? cl.verb.start : text.length, cl.tokens));
      return [editRawOp({ action: 'replace', day: dayFor(oldP), slot: slotFor(oldP), place: oldP.text, placeMention: oldP, newPlace: newText, newMention: newP || null })];
    }
    // '금각사 빼고 대신 은각사 넣어줘'의 뒤 절('대신 은각사 넣어줘')은 넣기다(앞 절의 빼기와 합쳐 바꾸기가 된다)
    if (!(verb === 'add' && newP)) return [];
  }
  // (2) 시각: '2일째 저녁을 7시로', '금각사를 오후 3시로', 'change day 2 dinner to 7pm'
  if (times.length) {
    const p = places[0] || null;
    const t = times[times.length - 1];
    // 장소 바로 뒤에 조사 없이 '저녁·밤·아침 N시'가 오면('금각사 저녁 7시로') 그날 저녁(아침) 칸을 말한 것일 수도 있다(검토 F1):
    // 칸 낱말로도 넘겨 그 장소가 그 칸에 없으면 묻는다. '금각사를 저녁 7시로'(장소가 목적어)·'오후 3시'(오전·오후 표시)는 시각만이다.
    const bare = p && !/^\s*(?:을|를|은|는|이|가|도|を|は|が|も)/.test(text.slice(p.end));
    const hint = p ? (bare && ['evening', 'early'].includes(t.slotHint) ? t.slotHint : '') : t.slotHint;
    if (!p && !days.length && !slots.length && !hint) return [];
    return [editRawOp({ action: 'time', day: dayFor(p), slot: slotFor(p) || hint, place: p ? p.text : '', placeMention: p, time: t })];
  }
  const destDays = days.filter((d) => d.dest);
  const destSlots = slots.filter((s) => s.dest);
  // (3) 'A를 B로 바꿔'·'replace A with B'·'AをBに変えて'
  if (verb === 'change' && places.length >= 2) {
    return [editRawOp({ action: 'replace', day: dayFor(places[0]), slot: slotFor(places[0]), place: places[0].text, placeMention: places[0], newPlace: places[1].text, newMention: places[1] })];
  }
  if (verb === 'change' && places.length === 1 && !destDays.length && !destSlots.length) {
    const p = places[0];
    const w = of('with').find((x) => x.start >= p.end);
    const name = style === 'svo'
      ? (w ? editLooseName(text, w.end, cl.segEnd, cl.tokens) : '')
      : editLooseName(text, p.end, cl.verb.start, cl.tokens);
    if (name) return [editRawOp({ action: 'replace', day: dayFor(p), slot: slotFor(p), place: p.text, placeMention: p, newPlace: name })];
    return [];
  }
  // (4) 옮기기: '금각사를 3일째로', '금각사를 3일째 오후로 옮겨', 'move Kinkaku-ji to day 3', '金閣寺を3日目に移して'
  const moveLike = verb === 'move' || (verb === 'change' && (destDays.length || destSlots.length)) || (!verb && places.length && (destDays.length || destSlots.length));
  if (moveLike) {
    const p = places[0] || null;
    const toDayTok = destDays[0] || (p ? days.find((d) => d.start >= p.end && !d.from) : days[1]) || null;
    const fromDayTok = days.find((d) => d !== toDayTok && (d.from || !p || d.end <= p.start)) || null;
    const toSlotTok = destSlots[0] || (p ? slots.find((s) => s.start >= p.end && !s.from) : (toDayTok ? slots.find((s) => s.start > toDayTok.start) : null)) || null;
    const fromSlotTok = slots.find((s) => s !== toSlotTok && (!p || s.end <= p.start)) || null;
    if (!p && !fromDayTok && !fromSlotTok) return [];
    if (!toDayTok && !toSlotTok) return [];
    return [editRawOp({ action: 'move', day: fromDayTok ? fromDayTok.day : 0, slot: fromSlotTok ? fromSlotTok.slot : '', place: p ? p.text : '', placeMention: p,
      toDay: toDayTok ? toDayTok.day : 0, toSlot: toSlotTok ? toSlotTok.slot : '' })];
  }
  // (5) 빼기. 일정·후보에 없는 이름을 말했으면('3일째 센소지 빼줘') 그날 다른 장소를 빼지 않고 '찾지 못했어요'로 답한다.
  if (verb === 'remove') {
    if (places.length) return places.map((p) => editRawOp({ action: 'remove', day: dayFor(p), slot: slotFor(p), place: p.text, placeMention: p }));
    if (!days.length && !slots.length) return [];
    const loose = style === 'svo' ? editLooseName(text, cl.verb.end, cl.segEnd, cl.tokens) : editLooseName(text, cl.segStart, cl.verb.start, cl.tokens);
    const named = loose && !EDIT_GENERIC_REF_RE.test(loose.replace(/(?<=[가-힣])(?:은|는|을|를|이|가|도)$/, '')) ? loose : '';
    return [editRawOp({ action: 'remove', day: dayFor(null), slot: slotFor(null), place: named })];
  }
  // (6) 넣기(후보에 없는 이름도 그대로 넘겨 '찾지 못했어요'로 답한다)
  if (verb === 'add') {
    const weak = Boolean(cl.verb.weak);
    if (places.length) return places.map((p) => editRawOp({ action: 'add', day: dayFor(p), slot: slotFor(p), newPlace: p.text, newMention: p, weak }));
    const name = style === 'svo' ? editLooseName(text, cl.verb.end, cl.segEnd, cl.tokens) : editLooseName(text, cl.segStart, cl.verb.start, cl.tokens);
    return [editRawOp({ action: 'add', day: dayFor(null), slot: slotFor(null), newPlace: name, weak })];
  }
  return [];
}

// 편집이 아니라 다시 만들어야 하는 말인지: 일수·날짜·경로 밖 도시(또는 장소 없이 도시만)·조건·여행 전체
function editRegenSignal(text, tokens, ctx) {
  const blankOut = (src, spans) => {
    let out = src;
    for (const s of spans) out = out.slice(0, s.start) + ' '.repeat(s.end - s.start) + out.slice(s.end);
    return out;
  };
  const places = tokens.filter((t) => t.type === 'place');
  const noRefs = blankOut(text, tokens.filter((t) => t.type === 'place' || t.type === 'day' || t.type === 'time'));
  if (parseGlobalDayDelta(noRefs) !== 0 || parseCityDayDeltas(noRefs).length) return 'days';
  if (parseExplicitDaysFromText(noRefs) !== null) return 'days';
  if (KO_MONTH_DAY_RE.test(noRefs) || EN_MONTH_DAY_RE.test(noRefs)) return 'date';
  if (tokens.some((t) => t.type === 'day' && t.badDate)) return 'date';
  // 다른 도시의 장소 이름(대표 명소 별칭·추가 명소: '도쿄 타워', '오타루') 속 도시 이름은 도시로 세지 않는다
  const lower = text.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const otherPlaceSpans = [
    ...MUST_ATTRACTIONS.flatMap((m) => [m.name, ...(m.aliases || [])].flatMap((a) => aliasHitPositions(lower, String(a).toLowerCase()).map((i) => ({ start: i, end: i + String(a).length })))),
    ...extraPlaceHits(text).map((h) => ({ start: h.idx, end: h.idx + h.len }))
  ];
  const cityHits = cityMentionHits(blankOut(text, [...places, ...otherPlaceSpans]));
  if (cityHits.some((h) => !ctx.routeKeys.includes(h.key))) return 'city';
  if (cityHits.length && !places.length) return 'city';
  if (NEG_SHOPPING_RE.test(text) || EDIT_TRIP_LEVEL_RE.test(noRefs)) return 'trip';
  if (EDIT_TRIP_WORD_RE.test(noRefs) && !tokens.some((t) => t.type === 'day')) return 'trip';
  return '';
}

// ── 'X 빼고 … 다 빼줘'(X는 남기라는 말) — 검토 K1c 막는 문제 4 ──
// '금각사 빼고 오후 일정 다 빼줘'·'3일째는 금각사 빼고 다 빼줘'·'금각사 외에 2일째 다 빼줘'·'remove day 3 except Kinkaku-ji'·'drop everything on day 3 but Kinkaku-ji'·
// 'remove day 3 but keep Kinkaku-ji'·'金閣寺以外の午後を外して'·'金閣寺を除いて3日目を外して'은 X 하나만 빼라는 말이 아니다(그렇게 읽으면 확인 문구가 말과 반대가 된다).
// 남길 것(X: 장소, 장소가 없으면 그쪽의 일차·칸)을 뺀 범위(일차·칸) 안의 일정을 하나씩 빼는 확인으로 만든다(editExceptResult).
// 범위(일차·칸)가 없거나('기요미즈데라 빼고 다 빼') 대상이 너무 많으면 알아듣지 못했다고 답한다(일정 전체를 지우는 확인을 만들지 않는다).
const EDIT_EXCEPT_KO_RE = /(?<![가-힣])(?:외에(?:는|도)?|외엔|빼놓고|빼고(?:는|서)?|제외하고(?:는|서)?|말고(?:는)?)(?![가-힣])/g;
const EDIT_EXCEPT_JA_RE = /以外(?:の|は|を|で|に)?|を?(?:除いて|除き|除く|のぞいて|のぞき)/g;
const EDIT_EXCEPT_EN_RE = /\b(?:except(?:\s+for)?|other\s+than|apart\s+from|besides|but(?:\s+(?:not|keep|leave))?)\b/gi;
// 한국어는 X 뒤에 '다·전부·모두·나머지·다른'이 있어야 한다(없으면 'X 빼고 Y도 빼줘'처럼 차례로 빼는 말일 수 있다)
const EDIT_EXCEPT_ALL_KO_RE = /(?<![가-힣])(?:전부|모두|나머지|싹|몽땅|죄다|다|다른)(?:는|은|도|를|을|만|요)?(?![가-힣])/;
function editBlankTokens(text, tokens, from, types = ['place', 'day', 'slot', 'time']) {
  let s = text;
  for (const t of tokens) {
    if (!types.includes(t.type)) continue;
    const a = Math.max(t.start - from, 0);
    const b = Math.min(t.end - from, s.length);
    if (a < b) s = s.slice(0, a) + ' '.repeat(b - a) + s.slice(b);
  }
  return s;
}
// 남기라는 표지 { start, end, dir }(dir 'before' = X가 표지 앞, 'after' = X가 표지 뒤). 없으면 null.
// 표지 뒤(영어는 앞)에는 빼기 동사만 있어야 하고(넣기·옮기기가 섞이면 다른 말이다), 뺄 곳을 이름으로 말한 자리에는 장소가 없어야 한다
// ('금각사 빼고 은각사 넣어줘'는 바꾸기, 'remove Kinkaku-ji but not Ginkaku-ji'는 금각사 빼기).
function editExceptMarker(text, tokens, style) {
  const places = tokens.filter((t) => t.type === 'place');
  const verbs = tokens.filter((t) => t.type === 'verb');
  const removeAt = (v) => v.verb === 'remove' && !v.negated;
  const onlyRemoveAfter = (pos) => verbs.every((v) => v.start < pos || removeAt(v) || v.verb === 'keep');
  if (style === 'sov') {
    for (const m of editRanges(EDIT_EXCEPT_KO_RE, text)) {
      if (editOverlaps(m, places) || places.some((p) => p.start >= m.end) || !onlyRemoveAfter(m.end)) continue;
      const later = verbs.find((v) => v.start >= m.end && removeAt(v));
      if (!later || !EDIT_EXCEPT_ALL_KO_RE.test(editBlankTokens(text.slice(m.end, later.start), tokens, m.end))) continue;
      return { start: m.start, end: m.end, dir: 'before' };
    }
    for (const m of editRanges(EDIT_EXCEPT_JA_RE, text)) {
      if (editOverlaps(m, places) || places.some((p) => p.start >= m.end) || !onlyRemoveAfter(m.end)) continue;
      if (!verbs.some((v) => v.start >= m.end && removeAt(v))) continue;
      return { start: m.start, end: m.end, dir: 'before' };
    }
    return null;
  }
  for (const m of editRanges(EDIT_EXCEPT_EN_RE, text)) {
    if (editOverlaps(m, places)) continue;
    const v = [...verbs].reverse().find((x) => x.end <= m.start);
    if (!v) {
      // 표지가 앞에 온 말('apart from Kinkaku-ji, remove day 3'·'except Kinkaku-ji, drop everything on day 3'): X는 표지와 빼기 동사 사이
      const w = verbs.find((x) => x.start >= m.end);
      if (!w || !removeAt(w) || /^but\b/i.test(m.raw) || verbs.some((x) => x !== w && !removeAt(x) && x.verb !== 'keep')) continue;
      if (places.some((p) => p.start >= w.end) || !places.some((p) => p.start >= m.end && p.end <= w.start)) continue;
      return { start: m.start, end: m.end, dir: 'after', xEnd: w.start };
    }
    if (!removeAt(v) || places.some((p) => p.start >= v.end && p.end <= m.start)) continue;
    if (verbs.some((x) => x.start >= m.end && !removeAt(x) && x.verb !== 'keep')) continue;
    if (!tokens.some((t) => ['place', 'day', 'slot'].includes(t.type) && t.start >= m.end)) continue;
    return { start: m.start, end: m.end, dir: 'after' };
  }
  return null;
}
// 남길 것을 뺀 범위의 일정을 하나씩 빼는 편집(장소 블록을 그대로 가리킨다). 고르기 전에는 아무것도 바꾸지 않는다(확인 + 모두 + 취소).
function editExceptResult(tokens, exc, ctx, base) {
  const onX = (t) => (exc.dir === 'before' ? t.end <= exc.start : t.start >= exc.end && (!exc.xEnd || t.end <= exc.xEnd));
  const of = (type) => tokens.filter((t) => t.type === type);
  const xPlaces = of('place').filter(onX);
  // 남길 것이 장소면 일차·칸은 모두 범위다('3일째는 금각사 빼고 다'). 장소가 없으면 그쪽 일차·칸이 남길 것이다('1일째 빼고 저녁 다 빼줘'·'remove dinner except day 1').
  const xDays = xPlaces.length ? [] : of('day').filter(onX);
  const xSlots = xPlaces.length ? [] : of('slot').filter(onX);
  const scopeDays = of('day').filter((t) => !xDays.includes(t));
  const scopeSlots = of('slot').filter((t) => !xSlots.includes(t));
  const fail = (action) => ({ ...base, ops: [editRawOp({ action })] });
  if (!xPlaces.length && !xDays.length && !xSlots.length) return fail('exceptUnclear');
  if (!scopeDays.length && !scopeSlots.length) return fail('exceptUnclear');
  const kept = new Set(xPlaces.flatMap((p) => p.blocks.map((b) => `${b.day}|${b.info.index}`)));
  const targets = [];
  for (const d of ctx.days) {
    if ((scopeDays.length && !scopeDays.some((t) => t.day === d.day)) || xDays.some((t) => t.day === d.day)) continue;
    for (const info of d.infos) {
      if (FREE_TIME_TITLES.has(info.name) || kept.has(`${d.day}|${info.index}`)) continue;
      if (scopeSlots.length && !scopeSlots.some((t) => editSlotMatches(info, t.slot, d))) continue;
      if (xSlots.some((t) => editSlotMatches(info, t.slot, d))) continue;
      targets.push({ d, info });
    }
  }
  if (!targets.length) return fail('slotEmpty');
  if (targets.length > EDIT_MAX_CHOICES) return fail('exceptUnclear');
  return { ...base, ops: targets.map(({ d, info }) => editRawOp({ action: 'remove', day: d.day, place: info.name,
    placeMention: { type: 'place', start: -1, end: -1, text: info.name, blocks: [{ day: d.day, info }], cand: null } })) };
}

// 넣거나 바꿀 '대상'이 종류·음식 낱말인지(검토 R1·K1c 막는 문제 2). 문장 전체가 아니라 새 장소 자리만 본다.
//  - 일정·후보에서 알아본 장소: 그 장소와 동사 사이(한국어·일본어는 장소 뒤 ~ 동사, 영어는 동사 ~ 장소)에 종류 낱말이 있을 때만 종류 요청이다
//    ('센소지 근처 맛집 추가해줘'·'add a ramen place near Senso-ji'·'銀閣寺の近くのカフェを追加して').
//    목적·때('야경 보러 도쿄 타워 넣어줘'·'카페 들르기 전에 은각사 넣어줘'·'add Tokyo Skytree for the night view'·'夜景を見に銀閣寺を入れて')와
//    다른 절('…오멘 긴카쿠지, 라멘 말고'·'…, I want souvenirs')의 종류 낱말은 그 장소를 넣는 편집을 막지 않는다.
//  - 알아보지 못한 이름: 그 이름이나 문장(장소 자리는 비움)에 종류 낱말이 있으면 종류 요청이다('라멘 넣어줘'·'add an onsen'·'3日目の夕食に寿司を入れて').
const EDIT_CATEGORY_CUT_RE = /[,，、.。!！?？;；]|말고|아니고|아니라|じゃなく|ではなく|\binstead\b|\brather\b|\bnot\b/gi;
function editTargetIsCategory(op, text, tokens, style) {
  const m = op.newMention;
  if (m && (m.cand || m.blocks.length)) {
    const verbs = tokens.filter((t) => t.type === 'verb' && ['add', 'change', 'move'].includes(t.verb));
    let from;
    let span;
    if (style === 'sov') {
      const v = verbs.find((x) => x.start >= m.end);
      from = m.end;
      span = editBlankTokens(text.slice(from, v ? v.start : text.length), tokens, from);
      const cut = new RegExp(EDIT_CATEGORY_CUT_RE.source, 'i').exec(span);
      if (cut) span = span.slice(0, cut.index);
    } else {
      const v = [...verbs].reverse().find((x) => x.end <= m.start);
      from = v ? v.end : 0;
      span = editBlankTokens(text.slice(from, m.start), tokens, from);
      const cuts = [...span.matchAll(new RegExp(EDIT_CATEGORY_CUT_RE.source, 'gi'))];
      if (cuts.length) { const last = cuts[cuts.length - 1]; span = span.slice(last.index + last[0].length); }
    }
    return EDIT_CATEGORY_RE.test(span);
  }
  if (EDIT_CATEGORY_RE.test(m ? m.text : String(op.newPlace || ''))) return true;
  return EDIT_CATEGORY_RE.test(editBlankTokens(text, tokens, 0, ['place']));
}

// 규칙 해석: { regen, edit(편집처럼 보이는지), ops }
function parseItineraryEditRules(message, ctx) {
  const text = String(message || '').normalize('NFKC');
  const tokens = tokenizeItineraryEdit(text, ctx);
  const regen = editRegenSignal(text, tokens, ctx);
  const has = (type) => tokens.some((t) => t.type === type);
  const refs = has('place') || has('day') || has('slot');
  const looksEdit = (has('instead') && has('place')) || (has('verb') && refs) || tokens.some((t) => t.type === 'verb' && t.verb === 'add')
    || (has('time') && refs) || (has('place') && tokens.some((t) => (t.type === 'day' || t.type === 'slot') && t.dest));
  if (regen || !looksEdit) return { regen, edit: false, ops: [] };
  const style = /[가-힣぀-ヿ一-鿿]/.test(text) ? 'sov' : 'svo';
  // 'X 빼고 … 다 빼줘'·'remove day 3 except X'·'X以外の午後を外して': X는 남기라는 말이다(검토 K1c 막는 문제 4). Groq에 맡기지 않는다(except).
  const exc = editExceptMarker(text, tokens, style);
  if (exc) {
    const reasons = [...new Set([...editMarkerReasons(text, tokens), 'contrast'])];
    return editExceptResult(tokens, exc, ctx, { regen: '', edit: true, keep: false, except: true, slotMismatch: false, reasons, aiMarkers: reasons, tokens, extra: [] });
  }
  // 마지막 동사가 '빼고·제외하고'이고 뒤에 장소가 오면('금각사 빼고 은각사') 바꾸기 표지다.
  // 일본어 て형('大阪城をやめて海遊館に'·'金閣寺を外して清水寺へ')도 뒤 장소에 に·へ가 붙으면 바꾸기 표지다(뒤 장소를 지우지 않게).
  const verbs = tokens.filter((t) => t.type === 'verb');
  const lastVerb = verbs[verbs.length - 1];
  const placeAfterLast = (needDest) => tokens.some((t) => t.type === 'place' && lastVerb && t.start >= lastVerb.end && (!needDest || t.dest));
  if (style === 'sov' && lastVerb && lastVerb.verb === 'remove'
    && ((/^(?:고|하고)/.test(text.slice(lastVerb.end)) && placeAfterLast(false)) || (/て$/.test(text.slice(lastVerb.start, lastVerb.end)) && placeAfterLast(true)))) {
    lastVerb.type = 'instead';
    lastVerb.dir = 'before';
  }
  const markers = editMarkerReasons(text, tokens);
  const clauses = splitEditClauses(tokens, text, style);
  const merged = mergeEditRemoveAdd(clauses.flatMap((cl) => editClauseOps(cl, text, style, { swap: markers.includes('swap') })));
  if (merged.some((op) => op.action === 'regen')) return { regen: 'trip', edit: false, ops: [] };
  // 부정·그대로 두기가 있었는지(있으면 AI 해석 없이 규칙 해석만 쓴다 — interpretItineraryEdit)
  const keep = tokens.some((t) => t.type === 'verb' && t.verb === 'keep');
  // 그대로 두라는 절의 장소('금각사는 두고 3일째 다 빼줘'): 일차·칸으로 찾는 편집 대상에서 뺀다(resolveEditTargets의 exclude)
  const keptPlaces = clauses.filter((cl) => cl.verb && cl.verb.verb === 'keep').flatMap((cl) => cl.tokens.filter((t) => t.type === 'place' && t.blocks.length));
  // 넣을 장소가 경로 도시 후보가 아니면: 경로 밖 도시의 장소는 경로가 바뀌는 말이라 다시 만든다(일차·칸까지 말한 '넣어줘'만 편집으로 두고
  // 규칙 6으로 거절). 바람('가고 싶어')은 경로 도시 후보 + 일차·칸을 말했을 때만 편집이다(그 밖에는 여행 요청).
  const ops = [];
  for (const op of merged) {
    // 일정에 없는 장소를 빼거나 바꾸라는 말(일차·칸 없이: '디즈니랜드는 빼줘', '유니버설 대신 수족관')은 고칠 칸이 없다 → 지금처럼 조건으로 다시 만든다
    if ((op.action === 'remove' || op.action === 'replace') && op.placeMention && !op.placeMention.blocks.length && !(op.day || op.slot)) continue;
    // 이미 일정에 든 장소를 바라는 말('도쿄 타워는 밤에 가고 싶어')은 하나 더 넣지 않고 말한 날·칸으로 옮긴다
    if (op.action === 'add' && op.weak && op.newMention && op.newMention.blocks.length) {
      if (op.day || op.slot) ops.push(editRawOp({ action: 'move', place: op.newMention.text, placeMention: op.newMention, toDay: op.day, toSlot: op.slot }));
      continue;
    }
    if (op.action === 'add' || op.action === 'replace') {
      const known = Boolean(op.newMention && op.newMention.cand);
      if (!known) {
        const otherCity = editKnownPlaceCity(op.newMention ? op.newMention.text : op.newPlace);
        if (otherCity && !ctx.routeKeys.includes(otherCity) && (op.weak || !(op.day || op.slot))) return { regen: 'city', edit: false, ops: [] };
      }
      if (op.action === 'add' && op.weak && !(known && (op.day || op.slot))) continue;
    }
    if (keptPlaces.length && ['remove', 'move', 'time'].includes(op.action) && !op.placeMention && !op.place) op.exclude = keptPlaces;
    ops.push(op);
  }
  // 넣거나 바꿀 '대상'이 종류·음식 낱말이면 편집이 아니다 → 지금처럼 조건으로 다시 만들기(검토 R1). 문장 전체가 아니라 대상 자리만 본다
  // (K1c 막는 문제 2: '야경 보러 도쿄 타워 넣어줘'는 도쿄 타워 넣기). regen 'category'면 화면이 일정 전체를 바꾸기 전에 묻는다(editRegen).
  if (ops.some((op) => (op.action === 'add' || op.action === 'replace') && editTargetIsCategory(op, text, tokens, style))) return { regen: 'category', edit: false, ops: [] };
  // 고칠 칸을 못 만든 넣기·바꾸기 말에 종류 낱말만 있으면('3일째 저녁은 스시로 바꿔줘'·'change day 1 dinner to ramen')도 같다
  if (!ops.length) {
    const wants = tokens.some((t) => t.type === 'verb' && (t.verb === 'add' || t.verb === 'change'));
    return { regen: wants && EDIT_CATEGORY_RE.test(editBlankTokens(text, tokens, 0, ['place'])) ? 'category' : 'trip', edit: false, ops: [] };
  }
  // 단순한 명령이 아니라는 표지(되묻는 선택지에 [취소]를 붙일지 본다 — interpretItineraryEdit). aiMarkers·tokens는 Groq 해석에도 같은 기준을 쓰려고 함께 돌려준다.
  // extra = 알아들은 것 밖에 남는 낱말이 있음, extraLive = 그 낱말이 그대로 두기 절 밖에도 있음(넣기만 있는 말은 이것으로 본다)
  // 규칙이 이름으로 쓴 말(장소로 못 알아본 줄인 이름: '이튿날 철도박물관 빼줘'·'오다이바 빼고 팀랩')은 알아들은 것이다
  // (일정·후보에서 못 찾으면 그 편집이 '찾지 못했어요'가 된다). 편집에 쓰지 않은 이름('금각사는 꼭 갈 거니까 철도박물관 빼줘')은 남는다.
  // Groq 해석에는 이 예외를 두지 않는다(Groq가 그 말을 어떻게 읽었는지 모르므로 남는 낱말이 있으면 확인한다 — aiMarkers).
  const looseWords = ops.flatMap((op) => [op.placeMention ? '' : op.place, op.newMention ? '' : op.newPlace]).filter(Boolean).flatMap((n) => String(n).split(/\s+/)).filter(Boolean);
  const extraAll = editExtraWords(text, tokens, ctx);
  const extra = extraAll.filter((c) => !looseWords.some((w) => c.raw === w || (c.raw.startsWith(w) && EDIT_REST_RES.particle.test(c.raw.slice(w.length)))));
  const senseOf = (list) => [...markers, ...(list.length ? ['extra'] : []), ...(editLiveExtra(list, tokens, style).length ? ['extraLive'] : [])];
  const reasons = [...new Set([...senseOf(extra), ...editStructureReasons(tokens, ops)])];
  // 말한 장소가 말한 칸에 없는 말('금각사 저녁 빼줘'·'drop Kinkaku-ji dinner'): 규칙이 그 칸 일정과 장소를 함께 묻는다(검토 F1).
  // Groq에 맡기지 않는다(Groq가 칸을 버리거나 다른 장소로 읽어 확인 문구가 말과 달라지지 않게).
  const slotMismatch = ops.some((op) => op.slot && op.placeMention && op.placeMention.blocks.length
    && !op.placeMention.blocks.some((b) => editSlotMatches(b.info, op.slot, ctx.days.find((d) => d.day === b.day))));
  return { regen: '', edit: true, ops, keep, slotMismatch, reasons, aiMarkers: senseOf(extraAll), tokens, extra: extra.map((c) => c.raw) };
}

// 경로 밖 도시의 장소인지 볼 때 쓰는 그 장소의 도시(대표 명소·추가 명소·도시 주변 실제 명소 이름이 들어 있으면). 모르면 ''.
function editKnownPlaceCity(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const exact = editPlaceCityOf(n);
  if (exact) return exact;
  const must = matchMustAttractions(n);
  if (must.length) return must[0].cityKey;
  const hits = extraPlaceHits(n);
  return hits.length ? hits[0].place.cityKey : '';
}

// ── AI 해석(OpenAI 호환 = Groq만) ──
const EDIT_AI_RULES = [
  'You read a traveler\'s follow-up message about an EXISTING Japan itinerary and return JSON that matches the schema.',
  'kind "edit": the message changes only some blocks — remove a place, add a place, move a place to another day or slot, replace one place with another, or change a block\'s start time.',
  'kind "regenerate": the message changes the trip itself — number of days ("하루 더", "one more day"), cities or route ("오사카도 추가", "삿포로 대신 하코다테"), dates, theme, budget or conditions for the whole trip.',
  'kind "other": anything else (a question, thanks). For regenerate and other, ops is [].',
  'ops: one entry per change, in the order said. action is remove, add, move, replace or time.',
  'day: the day number the change is about (0 if not said). slot: morning, afternoon, evening, allday, breakfast, lunch, dinner or "" (not said).',
  'place: the existing itinerary place to change, copied exactly from the itinerary when you can tell which one; "" for add or when only day/slot identify it.',
  'newPlace: the place to add or put instead, written as the traveler wrote it; "" otherwise. Never invent a place the traveler did not name.',
  'toDay and toSlot: the destination of a move (0 and "" when not said). time: the new start time as 24-hour HH:MM for action time, "" otherwise.',
  'Never guess a day or slot the traveler did not say.'
];
const EDIT_PERIOD_EN = { '오전': 'morning', '오후': 'afternoon', '종일': 'all day', '아침': 'breakfast', '점심': 'lunch', '저녁': 'dinner' };
function normalizeAiEditOutput(p) {
  const kind = ['edit', 'regenerate', 'other'].includes(p && p.kind) ? p.kind : '';
  if (!kind || !Array.isArray(p.ops)) throw new AiOutputError('AI_INVALID_OUTPUT', 'itinerary edit parser returned an unexpected shape');
  const slot = (s) => { const v = String(s || '').toLowerCase().replace(/\s+/g, ''); return v === 'allday' || EDIT_SLOT_WORDS.has(v) ? v : ''; };
  const int = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 30 ? n : 0; };
  const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 80) : '');
  const ops = p.ops.slice(0, EDIT_MAX_OPS).map((o) => (o && EDIT_ACTIONS.has(o.action)
    ? editRawOp({ action: o.action, day: int(o.day), slot: slot(o.slot), place: str(o.place), newPlace: str(o.newPlace), toDay: int(o.toDay), toSlot: slot(o.toSlot), time: clockOrEmpty(o.time) || null, fromAi: true })
    : null)).filter(Boolean);
  if (kind === 'edit' && !ops.length) throw new AiOutputError('AI_INVALID_OUTPUT', 'itinerary edit parser returned an edit without usable ops');
  return { kind, ops };
}
async function parseItineraryEditWithOpenAI(message, ctx, history) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
  const lines = ctx.days.map((d) => `Day ${d.day} (${localizedCityName(d.city, 'en')}): ${d.infos.length
    ? d.infos.map((b) => `${EDIT_PERIOD_EN[b.period] || b.period} ${b.start !== null ? minToClock(b.start) : '?'}-${b.end !== null ? minToClock(b.end) : '?'} ${b.name}`).join(' | ')
    : '(empty)'}`);
  const input = [{ role: 'system', content: [{ type: 'input_text', text: EDIT_AI_RULES.join(' ') }] }];
  // 직전 대화(무엇을 가리키는지 알게). 지난 말은 문자열 content로 보낸다(Responses API는 assistant의 input_text 조각을 거절).
  for (const h of (Array.isArray(history) ? history : []).slice(-4)) input.push({ role: h.role === 'user' ? 'user' : 'assistant', content: String(h.content || '') });
  input.push({ role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ message, itinerary: lines }) }] });
  const opSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: { type: 'string' }, day: { type: 'integer' }, slot: { type: 'string' }, place: { type: 'string' }, newPlace: { type: 'string' },
      toDay: { type: 'integer' }, toSlot: { type: 'string' }, time: { type: 'string' }
    },
    required: ['action', 'day', 'slot', 'place', 'newPlace', 'toDay', 'toSlot', 'time']
  };
  const body = {
    input,
    text: {
      format: {
        type: 'json_schema',
        name: 'itinerary_edit',
        schema: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string' }, ops: { type: 'array', items: opSchema } }, required: ['kind', 'ops'] },
        strict: true
      }
    }
  };
  const { parsed, model } = await callOpenAiResponses(body, { accept: (p) => normalizeAiEditOutput(p) });
  return { ...parsed, model };
}

// ── 해석 결과 → 확정 편집(ops)·되묻기 ──
function editIsNight(info, d) {
  if (!info || info.period !== '오후' || info.start === null) return false;
  const dinner = d.infos.find((x) => x.period === '저녁');
  const cut = dinner && dinner.start !== null ? dinner.start : 18 * 60;
  return info.start >= cut;
}
function editSlotMatches(info, slot, d) {
  const night = editIsNight(info, d);
  switch (slot) {
    case 'morning': return info.period === '오전';
    case 'afternoon': return info.period === '오후' && !night;
    case 'allday': return info.period === '종일';
    case 'breakfast': return info.period === '아침';
    case 'lunch': return info.period === '점심';
    case 'dinner': return info.period === '저녁';
    case 'evening': return info.period === '저녁' || night;
    case 'early': return info.period === '아침' || info.period === '오전';
    default: return true;
  }
}
function editBlockLabel(x, T) {
  const key = editIsNight(x.info, x.d) ? 'night' : x.info.period;
  return `${T.day(x.day)} ${T.period[key] || key} · ${x.info.name}`;
}
// 대상 블록 찾기: 말한 장소(블록·후보 표기) → 없으면 일차·칸. { targets: [{ day, d, info }], named, forceAsk, slotMismatch }
function resolveEditTargets(raw, ctx) {
  const all = ctx.days.flatMap((d) => d.infos.map((info) => ({ day: d.day, d, info })));
  let pool;
  let named = '';
  if (raw.placeMention && raw.placeMention.blocks.length) {
    const keys = new Set(raw.placeMention.blocks.map((b) => `${b.day}|${b.info.index}`));
    pool = all.filter((x) => keys.has(`${x.day}|${x.info.index}`));
    named = raw.placeMention.blocks[0].info.name;
  } else if (raw.placeMention) {
    return { targets: [], named: raw.placeMention.cand ? raw.placeMention.cand.name : raw.placeMention.text };
  } else if (raw.place) {
    named = raw.place;
    const k = placeNameKey(raw.place);
    const labels = [raw.place];
    const kinds = new Set();
    for (const ck of ctx.routeKeys) for (const c of ctx.cands.get(ck) || []) if (c.keys.includes(k)) { labels.push(...c.labels); kinds.add(c.kind); }
    // 이름이 같은 블록, 또는 같은 종류(식사 칸 ↔ 맛집, 관광 칸 ↔ 관광지)이면서 이름을 포함하는 블록
    pool = all.filter((x) => placeNameKey(x.info.name) === k || (editNameMatches(x.info.name, labels) && (!kinds.size || kinds.has(editBlockKind(x.info)))));
  } else {
    if (!raw.day && !raw.slot) return { targets: [], named: '' };
    pool = all;
    // 같은 말에서 남기라고 한 곳('금각사는 두고 3일째 다 빼줘'·'remove day 3 but keep Kinkaku-ji')은 일차·칸으로 찾은 대상에서 뺀다
    if (Array.isArray(raw.exclude) && raw.exclude.length) {
      const kept = new Set(raw.exclude.flatMap((m) => (m.blocks || []).map((b) => `${b.day}|${b.info.index}`)));
      pool = pool.filter((x) => !kept.has(`${x.day}|${x.info.index}`));
    }
  }
  let forceAsk = false;
  let slotMismatch = false;
  if (raw.day) {
    const onDay = pool.filter((x) => x.day === raw.day);
    // 장소를 말했는데 그날에는 없으면 다른 날 것을 묻는다(말없이 다른 날을 고치지 않게)
    if (!onDay.length && named && pool.length) forceAsk = true;
    else pool = onDay;
  }
  if (raw.slot && !forceAsk) {
    const bySlot = pool.filter((x) => editSlotMatches(x.info, raw.slot, x.d));
    if (bySlot.length || !named) pool = bySlot;
    else if (pool.length) {
      // 장소를 말했는데 그 장소가 말한 칸에 없으면('금각사 저녁 빼줘'·'skip lunch for Kinkaku-ji'·'金閣寺の夕食を外して') 칸 낱말을 버리지 않고 묻는다(검토 F1·F4):
      // 그 장소가 있는 날의 그 칸 일정을 먼저, 말한 장소를 뒤에 둔다(일차가 안 맞을 때처럼). 그날 그 칸이 비었으면 '그 칸에서 찾지 못했어요'.
      const onDays = new Set(pool.map((x) => x.day));
      const inSlot = all.filter((x) => onDays.has(x.day) && editSlotMatches(x.info, raw.slot, x.d) && !pool.includes(x));
      if (!inSlot.length) return { targets: [], named: '', forceAsk: false, slotMismatch: true };
      const namedTargets = pool;
      pool = [...inSlot, ...pool];
      return { targets: pool, named, forceAsk: true, slotMismatch: true, namedTargets };
    }
    if (!named && raw.slot === 'evening' && pool.some((x) => x.info.period === '저녁')) pool = pool.filter((x) => x.info.period === '저녁');
  }
  return { targets: pool, named, forceAsk, slotMismatch };
}
function editTargetMissing(found, T) {
  return { note: found.named ? T.targetMissing(found.named) : T.slotEmpty };
}
// 대상이 여럿이면 되묻기. withAll: '모두' 선택지(빼기·시간). 칸이 안 맞아 묻는 것(그 칸 일정 + 말한 장소)에는 '모두'를 두지 않는다.
// action: 되묻는 문장에 밝힐 할 일(remove·move·time·replace). noop: 칸이 안 맞아 묻는데 말한 장소가 이미 그렇게 되어 있으면(바꿀 것 없음) 줄 안내.
function editAskTargets(found, T, opFor, withAll, action, noop) {
  const choices = [];
  let namedChoice = false;
  for (const x of found.targets.slice(0, EDIT_MAX_CHOICES)) {
    const ops = opFor(x);
    if (!ops || !ops.length) continue;
    choices.push({ label: editBlockLabel(x, T), ops });
    if (found.namedTargets && found.namedTargets.includes(x)) namedChoice = true;
  }
  // 칸이 안 맞아 묻는데 말한 장소는 고칠 것이 없으면(이미 그 칸·그 시각: '오전 금각사를 오후로'인데 금각사는 이미 오후) 말하지 않은 그 칸 일정만 남는다.
  // 그것을 묻지 않고(답 '네'가 말하지 않은 일정을 고르지 않게) 이미 그렇다고 알린다(검토 K1c 사소한 의견 2).
  if (found.slotMismatch && !namedChoice) return { note: noop ? noop() : T.unclear };
  if (!choices.length) return { note: T.unclear };
  // all: true = '모두' 선택지(화면이 글로 한 답으로 좁힐 때 원래 '모두'를 다시 보이지 않고 좁힌 것만 합친 '모두'를 새로 만든다 — 검토 F5)
  if (withAll && !found.slotMismatch && choices.length > 1) choices.push({ label: T.all(choices.length), ops: choices.flatMap((c) => c.ops), all: true });
  const sameName = found.named && found.targets.every((x) => placeNameKey(x.info.name) === placeNameKey(found.targets[0].info.name));
  const q = (T.which && T.which[action]) || (T.which ? T.which.change : '');
  // 개수는 실제로 보이는 선택지 수('3개예요'인데 버튼이 둘이지 않게 — 이미 그 칸인 것은 선택지에서 빠진다)
  const n = choices.filter((c) => !c.all).length;
  return { ask: { question: sameName ? T.askWhich(found.targets[0].info.name, n, q) : T.askWhichSlot(n, q), choices } };
}
// 새 장소를 그 도시 후보에서 찾는다(규칙 6). 말 속 후보가 그 도시 것이면 그대로, 아니면 표기로(같은 키 → 포함).
function findEditCandidate(text, mention, ck, ctx) {
  const list = ctx.cands.get(ck) || editCandidatesForCity(ck, ctx.lang);
  if (mention && mention.cand && mention.cand.city === ck) return mention.cand;
  const keys = [placeNameKey(text), ...(mention && mention.cand ? mention.cand.keys : [])].filter(Boolean);
  if (!keys.length) return null;
  const names = [text, ...(mention && mention.cand ? mention.cand.labels : [])].filter(Boolean);
  return list.find((c) => keys.some((k) => c.keys.includes(k)))
    || list.find((c) => names.some((n) => editNameMatches(n, c.labels)))
    || null;
}
// 장소 이름의 도시(경로 밖 도시의 대표 명소·추가 명소·도시 명소). 모르면 ''.
function editPlaceCityOf(name) {
  const k = placeNameKey(name);
  if (!k) return '';
  const must = MUST_ATTRACTIONS.find((m) => [m.name, ...(m.aliases || [])].some((a) => placeNameKey(a) === k));
  if (must) return must.cityKey;
  const extra = extraPlaceByName(name);
  if (extra) return extra.cityKey;
  for (const [ck, c] of Object.entries(CITY_DATA)) if ((c.highlights || []).some((h) => placeNameKey(h.name) === k)) return ck;
  return '';
}
// AI가 고른 새 장소는 말에 그 이름(또는 후보의 다른 표기)이 있을 때만 바로 쓴다
function editHasEvidence(message, name, cand) {
  const index = editTextIndex(String(message || '').normalize('NFKC'));
  if (name && editLabelSpans(index, name).length) return true;
  return Boolean(cand) && cand.labels.some((l) => editLabelSpans(index, l).length > 0);
}
// 이미 일정에 든 장소는 비슷한 후보에서 뺀다. 이름 글자가 겹치는 후보 → 큐레이션(생성 장소·하루짜리가 아닌) 명소 순으로 3곳.
function suggestEditCandidates(name, ck, ctx, kind) {
  const list = (ctx.cands.get(ck) || editCandidatesForCity(ck, ctx.lang)).filter((c) => c.kind === kind && !c.generic);
  const used = new Set(ctx.days.flatMap((d) => d.infos.map((i) => placeNameKey(i.name))));
  const fresh = list.filter((c) => !c.keys.some((k) => used.has(k)));
  const letters = nameLetters(name);
  const scored = fresh.map((c, i) => ({ c, i, s: Math.max(0, ...c.labels.map((l) => sharedLetterCount(letters, nameLetters(l)))) }));
  const similar = scored.filter((x) => x.s >= 2).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c);
  const rest = fresh.filter((c) => !similar.includes(c) && !c.generated && !c.allDay);
  return [...similar, ...rest].slice(0, 3);
}
function editKindHint(slotWord, name) {
  if (['breakfast', 'lunch', 'dinner'].includes(slotWord)) return 'food';
  if (['morning', 'afternoon', 'allday'].includes(slotWord)) return 'dest';
  return FOOD_WORD_RE.test(String(name || '')) ? 'food' : 'dest';
}
// 넣을 칸: 말한 칸(종류에 맞게) → 하루짜리면 종일 → 추천 시작 17시 이후면 저녁 이후 → 관광이 적은 반나절 칸 → 추천 시간
function editPickSlot(slotWord, cand, d) {
  if (cand.kind === 'food') {
    const mapFood = { breakfast: 'breakfast', early: 'breakfast', morning: 'lunch', lunch: 'lunch', afternoon: 'lunch', evening: 'dinner', dinner: 'dinner' };
    if (mapFood[slotWord]) return mapFood[slotWord];
    return ['lunch', 'dinner', 'breakfast'].find((s) => !d.infos.some((i) => i.period === EDIT_PERIOD_OF_SLOT[s])) || 'dinner';
  }
  // 하루짜리(테마파크·먼 당일치기)는 말한 칸과 상관없이 종일 칸(규칙 일정과 같다)
  if (cand.allDay) return 'allday';
  const mapDest = { morning: 'morning', early: 'morning', breakfast: 'morning', afternoon: 'afternoon', lunch: 'afternoon', allday: 'allday', evening: 'night', dinner: 'night' };
  if (mapDest[slotWord]) return mapDest[slotWord];
  const startH = Number((/^(\d{1,2}):/.exec(cand.bestTime || '') || [])[1]);
  if (startH >= 17) return 'night';
  // 화면 배치(fitSightTime)와 같이 60분 이상 빈 시간이 있는 반나절 칸을 먼저(없으면 화면이 겹침을 묻는다)
  const gapAm = editSlotGap(d, 'morning');
  const gapPm = editSlotGap(d, 'afternoon');
  if ((gapAm >= 60) !== (gapPm >= 60)) return gapAm >= 60 ? 'morning' : 'afternoon';
  if (gapAm < 60) return gapAm >= gapPm ? 'morning' : 'afternoon';
  const am = d.infos.filter((i) => i.period === '오전').length;
  const pm = d.infos.filter((i) => i.period === '오후' && !editIsNight(i, d)).length;
  if (am !== pm) return am < pm ? 'morning' : 'afternoon';
  return Number.isFinite(startH) && startH < 12 ? 'morning' : 'afternoon';
}
// 반나절 칸(화면 SLOT_DEFS: 오전 09:00-12:00, 오후 13:00-17:00) 안에서 그날 관광 블록과 겹치지 않는 가장 긴 빈 시간(분)
const EDIT_SLOT_WINDOW = { morning: [9 * 60, 12 * 60], afternoon: [13 * 60, 17 * 60] };
function editSlotGap(d, slot) {
  const [s0, e0] = EDIT_SLOT_WINDOW[slot];
  const busy = d.infos.filter((i) => !EDIT_MEAL_PERIODS.has(i.period) && !FREE_TIME_TITLES.has(i.name) && i.start !== null && i.end !== null && i.end > i.start && i.start < e0 && s0 < i.end)
    .sort((a, b) => a.start - b.start);
  let cursor = s0;
  let best = 0;
  for (const b of busy) { best = Math.max(best, b.start - cursor); cursor = Math.max(cursor, b.end); }
  return Math.max(best, e0 - cursor);
}
function editSlotLabel(slot, T) {
  return slot === 'night' ? T.period.night : (T.period[EDIT_PERIOD_OF_SLOT[slot]] || slot);
}
// 블록이 그 후보와 같은 장소인지: 이름이 같거나, 같은 종류(식사 칸 ↔ 맛집, 관광 칸 ↔ 관광지)이면서 이름을 포함
function editInfoIsCand(info, cand) {
  return cand.keys.includes(placeNameKey(info.name)) || (editBlockKind(info) === cand.kind && editNameMatches(info.name, cand.labels));
}
// 그 후보가 일정의 다른 칸(skip 블록 말고)에 이미 있으면 { day } (없으면 null)
function editCandElsewhere(ctx, cand, skipDay, skipIndex) {
  for (const d of ctx.days) for (const info of d.infos) {
    if (d.day === skipDay && (skipIndex === undefined || info.index === skipIndex)) continue;
    if (editInfoIsCand(info, cand)) return { day: d.day };
  }
  return null;
}
function editAddOp(d, cand, slotWord, T) {
  if (d.infos.some((i) => editInfoIsCand(i, cand))) return { note: T.duplicate(cand.name, T.day(d.day)) };
  return { ops: [{ op: 'add', day: d.day, slot: editPickSlot(slotWord, cand, d), name: cand.name, area: cand.area, kind: cand.kind }] };
}
// 그 도시 날 중 관광이 가장 적은 날
function editBestDayFor(cand, ctx) {
  const days = ctx.days.filter((d) => d.city === cand.city);
  const pool = days.length ? days : ctx.days;
  return [...pool].sort((a, b) => a.infos.filter((i) => !EDIT_MEAL_PERIODS.has(i.period)).length - b.infos.filter((i) => !EDIT_MEAL_PERIODS.has(i.period)).length || a.day - b.day)[0];
}
// 못 찾은 새 장소: 경로의 다른 도시 장소면 그 도시 날을, 아니면 그 도시의 비슷한 후보를 선택지로(고르기 전에는 넣지 않는다).
// opts.confirmPick: AI가 고른 후보가 말에 없는 이름이면 '이곳을 넣을까요?'로 묻고 그 후보를 첫 선택지로 둔다.
function editNotFound(name, raw, ctx, T, opts) {
  const dayCity = opts.dayCity;
  const kind = opts.kind || editKindHint(raw.slot, name);
  const choicesFrom = (first) => [...(first ? [first] : []), ...suggestEditCandidates(name, dayCity, ctx, kind)]
    .filter((c, i, arr) => c && arr.findIndex((x) => x.ko === c.ko && x.kind === c.kind) === i).slice(0, 3)
    .map((c) => opts.makeChoice(c)).filter(Boolean);
  if (opts.confirmPick && opts.first) {
    const choices = choicesFrom(opts.first);
    return choices.length ? { ask: { question: T.confirmPick(opts.first.name), choices } } : { note: T.unclear };
  }
  const otherCk = ctx.routeKeys.find((ck) => ck !== dayCity && findEditCandidate(name, raw.newMention, ck, ctx)) || '';
  if (otherCk && opts.allowOtherCityDays) {
    const cand = findEditCandidate(name, raw.newMention, otherCk, ctx);
    const choices = ctx.days.filter((d) => d.city === otherCk).slice(0, EDIT_MAX_CHOICES).map((d) => {
      const r = editAddOp(d, cand, raw.slot, T);
      return r.ops ? { label: `${T.day(d.day)} ${editSlotLabel(r.ops[0].slot, T)}`, ops: r.ops } : null;
    }).filter(Boolean);
    if (choices.length) return { ask: { question: T.otherCity(cand.name, localizedCityName(otherCk, ctx.replyLang)), choices } };
  }
  const realCity = otherCk || editPlaceCityOf(name);
  const head = realCity && realCity !== dayCity
    ? T.otherCityNoDay(name, localizedCityName(realCity, ctx.replyLang))
    : T.notFound(name, localizedCityName(dayCity, ctx.replyLang));
  const choices = choicesFrom(null);
  if (!choices.length) return { note: head };
  return { ask: { question: `${head} ${T.pickInstead}`, choices } };
}

function resolveEditAdd(raw, ctx, T, meta) {
  const name = raw.newMention ? raw.newMention.text : raw.newPlace;
  if (!name) return { note: T.noName };
  const wantDays = raw.day ? ctx.days.filter((d) => d.day === raw.day) : ctx.days;
  const hits = wantDays.map((d) => ({ d, cand: findEditCandidate(name, raw.newMention, d.city, ctx) })).filter((x) => x.cand);
  const trusted = hits.filter((h) => !raw.fromAi || editHasEvidence(meta.message, name, h.cand));
  // 그 장소가 이미 다른 날에 있으면 확인 문구에 알린다(같은 장소가 두 번 들어가는 것을 알고 고르게)
  const direct = (d, cand) => {
    const r = editAddOp(d, cand, raw.slot, T);
    const other = r.ops ? editCandElsewhere(ctx, cand, d.day) : null;
    return other ? { ...r, note: T.duplicate(cand.name, T.day(other.day)) } : r;
  };
  if (trusted.length) {
    if (raw.day || trusted.length === 1) return direct(trusted[0].d, trusted[0].cand);
    const choices = trusted.slice(0, EDIT_MAX_CHOICES).map((h) => {
      const r = editAddOp(h.d, h.cand, raw.slot, T);
      return r.ops ? { label: `${T.day(h.d.day)} ${editSlotLabel(r.ops[0].slot, T)}`, ops: r.ops } : null;
    }).filter(Boolean);
    if (!choices.length) return editAddOp(trusted[0].d, trusted[0].cand, raw.slot, T);
    if (choices.length === 1) {
      const h = trusted.find((t) => t.d.day === choices[0].ops[0].day) || trusted[0];
      return direct(h.d, h.cand);
    }
    return { ask: { question: T.askDay(trusted[0].cand.name), choices } };
  }
  const targetDay = wantDays.length === 1 ? wantDays[0] : null;
  // 여기까지 온 후보(hits)는 AI가 말에 없는 이름으로 고른 것뿐이다 → 넣을지 묻는다
  const aiPick = hits[0] ? hits[0].cand : null;
  return editNotFound(name, raw, ctx, T, {
    dayCity: aiPick ? aiPick.city : (targetDay || ctx.days[0]).city,
    allowOtherCityDays: true,
    first: aiPick,
    confirmPick: Boolean(aiPick),
    makeChoice: (c) => {
      const d = targetDay || editBestDayFor(c, ctx);
      const r = editAddOp(d, c, raw.slot, T);
      return r.ops ? { label: `${c.name} · ${T.day(d.day)} ${editSlotLabel(r.ops[0].slot, T)}`, ops: r.ops } : null;
    }
  });
}

function editReplaceOps(x, cand, T) {
  if (EDIT_MEAL_PERIODS.has(x.info.period) !== (cand.kind === 'food')) return { note: T.kindMismatch };
  if (x.d.infos.some((i) => i.index !== x.info.index && editInfoIsCand(i, cand))) return { note: T.duplicate(cand.name, T.day(x.day)) };
  // 하루짜리(테마파크·당일치기)를 반나절 칸에 넣으면 그 칸을 빼고 종일 칸으로 넣는다(시간 겹침은 화면이 묻는다)
  if (cand.kind === 'dest' && cand.allDay && x.info.period !== '종일') {
    return { ops: [{ op: 'remove', day: x.day, block: x.info.block }, { op: 'add', day: x.day, slot: 'allday', name: cand.name, area: cand.area, kind: 'dest' }] };
  }
  return { ops: [{ op: 'replace', day: x.day, block: x.info.block, name: cand.name, area: cand.area, kind: cand.kind }] };
}
function resolveEditReplace(raw, ctx, T, meta) {
  const name = raw.newMention ? raw.newMention.text : raw.newPlace;
  if (!name) return { note: T.noName };
  const found = resolveEditTargets(raw, ctx);
  if (!found.targets.length) return editTargetMissing(found, T);
  const candFor = (x) => {
    const c = findEditCandidate(name, raw.newMention, x.d.city, ctx);
    return c && (!raw.fromAi || editHasEvidence(meta.message, name, c)) ? c : null;
  };
  // 대상이 하나이거나, 여럿이어도 새 장소를 어느 날 도시에서도 못 찾으면 첫 대상 기준으로 '찾지 못했어요' + 비슷한 후보
  if ((found.targets.length === 1 && !found.forceAsk) || !found.targets.some((x) => candFor(x))) {
    const x = found.targets[0];
    const cand = candFor(x);
    if (cand) {
      // 새 장소가 이미 다른 날(칸)에 있으면 확인 문구에 알린다(한 곳이 두 번 들어가는 것을 알고 고르게)
      const r = editReplaceOps(x, cand, T);
      const other = r.ops ? editCandElsewhere(ctx, cand, x.day, x.info.index) : null;
      return other ? { ...r, note: T.duplicate(cand.name, T.day(other.day)) } : r;
    }
    // 그 도시 후보지만 AI가 말에 없는 이름으로 고른 경우 → 바꿀지 묻는다
    const aiPick = findEditCandidate(name, raw.newMention, x.d.city, ctx);
    return editNotFound(name, raw, ctx, T, {
      dayCity: x.d.city,
      allowOtherCityDays: false,
      kind: EDIT_MEAL_PERIODS.has(x.info.period) ? 'food' : 'dest',
      first: aiPick,
      confirmPick: Boolean(aiPick),
      makeChoice: (c) => { const r = editReplaceOps(x, c, T); return r.ops ? { label: `${x.info.name} → ${c.name}`, ops: r.ops } : null; }
    });
  }
  return editAskTargets(found, T, (x) => { const c = candFor(x); const r = c ? editReplaceOps(x, c, T) : null; return r && r.ops ? r.ops : null; }, false, 'replace');
}

function resolveEditRemove(raw, ctx, T) {
  const found = resolveEditTargets(raw, ctx);
  if (!found.targets.length) return editTargetMissing(found, T);
  const opFor = (x) => [{ op: 'remove', day: x.day, block: x.info.block }];
  if (found.targets.length === 1 && !found.forceAsk) return { ops: opFor(found.targets[0]) };
  return editAskTargets(found, T, opFor, true, 'remove');
}

// 옮길 칸: 말한 칸(블록 종류에 맞게). 말하지 않았으면 원래 시간대(저녁 이후 항목은 저녁 이후)
function editMoveSlot(slotWord, x) {
  if (EDIT_MEAL_PERIODS.has(x.info.period)) {
    const m = { breakfast: 'breakfast', early: 'breakfast', lunch: 'lunch', dinner: 'dinner', evening: 'dinner' }[slotWord];
    return m || EDIT_SLOT_OF_PERIOD[x.info.period];
  }
  const m = { morning: 'morning', early: 'morning', afternoon: 'afternoon', allday: 'allday', evening: 'night', dinner: 'night', lunch: 'afternoon', breakfast: 'morning' }[slotWord];
  if (m) return m;
  return editIsNight(x.info, x.d) ? 'night' : EDIT_SLOT_OF_PERIOD[x.info.period];
}
function resolveEditMove(raw, ctx, T) {
  const found = resolveEditTargets({ ...raw, toDay: 0, toSlot: '' }, ctx);
  if (!found.targets.length) return editTargetMissing(found, T);
  const opFor = (x) => {
    const day = raw.toDay || x.day;
    const slot = editMoveSlot(raw.toSlot, x);
    const cur = editIsNight(x.info, x.d) ? 'night' : EDIT_SLOT_OF_PERIOD[x.info.period];
    if (day === x.day && slot === cur) return null;
    return [{ op: 'move', fromDay: x.day, block: x.info.block, day, slot }];
  };
  if (found.targets.length === 1 && !found.forceAsk) {
    const ops = opFor(found.targets[0]);
    return ops ? { ops } : { note: T.sameSlot(found.targets[0].info.name) };
  }
  return editAskTargets(found, T, opFor, false, 'move', () => T.sameSlot(found.named));
}

// 시각(분): 오전·오후 표시가 없으면 저녁(식사·저녁 이후)은 오후로, 아침 식사·오전 칸은 6~11시를 오전 그대로(1~5시는 오후로),
// 그 밖에는 6시 이하와 오후 칸의 1~9시를 오후로 본다. 새벽(5시 전) 일정은 없다: '0시'·'저녁을 12시로'처럼 애매하면 null(시간을 다시 묻는다).
// Groq가 낸 'HH:MM'도 같은 검사를 한다(검토 F6: '저녁 7시'를 07:00, '금각사 3시'를 03:00으로 넣지 않게). 13시 이후는 그대로,
// 12시까지는 오전·오후 표시가 없는 시각처럼 칸에 맞춰 오후로 보정하고, 맞지 않으면(0시·저녁 12시) null.
function editClockFor(time, info, slotWord) {
  if (typeof time === 'string') {
    const min = clockToMin(time);
    if (min === null) return null;
    const h = Math.floor(min / 60);
    return editClockFor({ h, m: min % 60, ampm: h >= 13 ? 'pm' : '' }, info, slotWord);
  }
  if (!time) return null;
  let h = time.h;
  const m = time.m;
  const evening = info.period === '저녁' || ['evening', 'dinner'].includes(slotWord);
  const early = !evening && (info.period === '아침' || info.period === '오전' || ['morning', 'early', 'breakfast'].includes(slotWord));
  // '0시'·'저녁 0시'(자정)·'저녁(을) 12시로'는 오전·오후 표시가 있어도 애매하다(저녁 식사를 낮 12시로 옮기지 않게)
  if (h === 0 || (h === 12 && evening)) return null;
  if (time.ampm === 'pm' && h < 12) h += 12;
  else if (time.ampm === 'am' && h === 12) h = 0;
  else if (!time.ampm && h < 12) {
    if (evening) h += 12;
    else if (early) { if (h < 6) h += 12; }
    else if (h <= 6 || ((info.period === '오후' || slotWord === 'afternoon') && h <= 9)) h += 12;
  }
  const min = h * 60 + m;
  return h <= 23 && min >= 5 * 60 ? min : null;
}
function resolveEditTime(raw, ctx, T) {
  const found = resolveEditTargets(raw, ctx);
  if (!found.targets.length) return editTargetMissing(found, T);
  const opFor = (x) => {
    const start = editClockFor(raw.time, x.info, raw.slot);
    if (start === null || start === x.info.start) return null;
    return [{ op: 'time', day: x.day, block: x.info.block, start: minToClock(start) }];
  };
  if (found.targets.length === 1 && !found.forceAsk) {
    const x = found.targets[0];
    const start = editClockFor(raw.time, x.info, raw.slot);
    if (start === null) return { note: T.badTime };
    if (start === x.info.start) return { note: T.sameTime(x.info.name, minToClock(start)) };
    return { ops: opFor(x) };
  }
  return editAskTargets(found, T, opFor, true, 'time', () => {
    const x = (found.namedTargets || [])[0];
    const start = x ? editClockFor(raw.time, x.info, raw.slot) : null;
    return x && start !== null ? T.sameTime(x.info.name, minToClock(start)) : T.badTime;
  });
}

// 맞바꾸기: 두 블록의 시각·칸은 그대로 두고 장소만 서로 바꾼다({ op:'swap', day, block, day2, block2 }).
// 두 곳이 일정에 하나씩 있고 칸 종류(식사·관광)가 같을 때만. 아니면 고치지 않고 알린다.
function resolveEditSwap(raw, ctx, T) {
  const a = resolveEditTargets({ ...raw, toDay: 0, toSlot: '' }, ctx);
  const b = resolveEditTargets({ ...raw, day: raw.toDay, slot: raw.toSlot, place: raw.newPlace, placeMention: raw.newMention }, ctx);
  if (!a.targets.length) return editTargetMissing(a, T);
  if (!b.targets.length) return editTargetMissing(b, T);
  if (a.targets.length !== 1 || b.targets.length !== 1 || a.forceAsk || b.forceAsk) return { note: T.swapUnclear };
  const x = a.targets[0];
  const y = b.targets[0];
  if (x.day === y.day && x.info.index === y.info.index) return { note: T.swapUnclear };
  if (editBlockKind(x.info) !== editBlockKind(y.info)) return { note: T.kindMismatch };
  // 도시가 다른 날끼리는 각 장소가 상대 날 도시의 후보일 때만(규칙 6: 오사카 날에 교토 금각사를 넣지 않는다)
  for (const [p, q] of [[x, y], [y, x]]) {
    if (p.d.city !== q.d.city && !findEditCandidate(p.info.name, null, q.d.city, ctx)) {
      return { note: T.otherCityNoDay(p.info.name, localizedCityName(p.d.city, ctx.replyLang)) };
    }
  }
  // 하루짜리(종일 칸·테마파크)는 반나절 칸과 맞바꾸지 않는다
  const allDay = (p) => p.info.period === '종일' || Boolean((findEditCandidate(p.info.name, null, p.d.city, ctx) || {}).allDay);
  if (allDay(x) !== allDay(y) || ((x.info.period === '종일') !== (y.info.period === '종일'))) return { note: T.swapAllDay };
  return { ops: [{ op: 'swap', day: x.day, block: x.info.block, day2: y.day, block2: y.info.block }] };
}

function resolveEditOp(raw, ctx, T, meta) {
  const hasDay = (n) => ctx.days.some((d) => d.day === n);
  if (raw.day && !hasDay(raw.day)) return { note: T.dayMissing(raw.day) };
  if (raw.toDay && !hasDay(raw.toDay)) return { note: T.dayMissing(raw.toDay) };
  if (raw.action === 'remove') return resolveEditRemove(raw, ctx, T);
  if (raw.action === 'add') return resolveEditAdd(raw, ctx, T, meta);
  if (raw.action === 'move') return resolveEditMove(raw, ctx, T);
  if (raw.action === 'replace') return resolveEditReplace(raw, ctx, T, meta);
  if (raw.action === 'time') return raw.time ? resolveEditTime(raw, ctx, T) : { note: T.badTime };
  if (raw.action === 'swap') return resolveEditSwap(raw, ctx, T);
  if (raw.action === 'swapUnclear') return { note: T.swapUnclear };
  if (raw.action === 'exceptUnclear') return { note: T.exceptUnclear };
  if (raw.action === 'slotEmpty') return { note: T.slotEmpty };
  return { note: T.unclear };
}

// '금각사 빼고 은각사 넣어줘'처럼 빼기 바로 뒤의 넣기(날짜·칸을 따로 말하지 않음)는 그 자리 바꾸기로 합친다
function mergeEditRemoveAdd(rawOps) {
  const out = [];
  for (let i = 0; i < rawOps.length; i += 1) {
    const a = rawOps[i];
    const b = rawOps[i + 1];
    if (a.action === 'remove' && (a.place || a.placeMention) && b && b.action === 'add' && !b.day && !b.slot && (b.newPlace || b.newMention)) {
      out.push({ ...a, action: 'replace', newPlace: b.newPlace, newMention: b.newMention, fromAi: a.fromAi || b.fromAi, weak: false, merged: true });
      i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

// 결과: apply { ops, groups(말 속 편집마다 확정된 ops) } | ask | none. apply도 화면에 바로 보내지 않고 확인으로 바꾼다(editConfirmResult).
function resolveEditRawOps(rawOps, ctx, meta) {
  const T = EDIT_TEXT[ctx.replyLang] || EDIT_TEXT.ko;
  const ok = [];
  const groups = [];
  const notes = [];
  let ask = null;
  for (const raw of mergeEditRemoveAdd(rawOps).slice(0, EDIT_MAX_OPS)) {
    const r = resolveEditOp(raw, ctx, T, meta) || {};
    if (r.ask) {
      if (!ask) ask = { ...r.ask, at: ok.length };
      else if (!notes.includes(T.later)) notes.push(T.later);
    }
    if (r.ops) {
      const fresh = r.ops.filter((op) => !ok.some((o) => JSON.stringify(o) === JSON.stringify(op)));
      ok.push(...fresh);
      if (fresh.length) groups.push(fresh);
    }
    if (r.note && !notes.includes(r.note)) notes.push(r.note);
  }
  if (ask) {
    // 선택지마다 확정된 다른 편집도 함께 싣는다(고르면 한 번에 적용, 고르기 전에는 아무것도 바꾸지 않는다)
    const choices = ask.choices.slice(0, EDIT_MAX_CHOICES + 1).map((c) => ({ label: c.label, ops: [...ok.slice(0, ask.at), ...c.ops, ...ok.slice(ask.at)], ...(c.all ? { all: true } : {}) }));
    return { status: 'ask', question: ask.question, choices, notes, bundled: ok.slice() };
  }
  if (ok.length) return { status: 'apply', ops: ok, groups, notes };
  return { status: 'none', notes: notes.length ? notes : [T.unclear] };
}

// 확인 문구용 편집 한 줄(날·칸·시각·장소: '2일차 오후(14:00-15:30) 금각사 빼기', 'remove Kinkaku-ji Temple (Day 3 Afternoon 13:00-17:00)',
// '3日目午後（13:00-17:00）の金閣寺を削除'). 시각 바꾸기는 새 시작 시각, 옮기기는 옮길 날·칸까지.
function editOpText(op, ctx, T) {
  const at = (day, block) => {
    const d = ctx.days.find((x) => x.day === day);
    const info = (d && d.infos.find((i) => i.block === block)) || editBlockInfo(block, -1);
    const key = d && info && editIsNight(info, d) ? 'night' : (info ? info.period : '');
    const t = info && info.start !== null && info.end !== null ? `${minToClock(info.start)}-${minToClock(info.end)}` : '';
    return { d: T.day(day), p: T.period[key] || key, t, n: info ? info.name : String(block || '') };
  };
  if (op.op === 'remove') return T.op.remove(at(op.day, op.block));
  if (op.op === 'add') return T.op.add(T.day(op.day), editSlotLabel(op.slot, T), op.name);
  if (op.op === 'move') return T.op.move(at(op.fromDay, op.block), T.day(op.day), editSlotLabel(op.slot, T));
  if (op.op === 'replace') return T.op.replace(at(op.day, op.block), op.name);
  if (op.op === 'time') return T.op.time(at(op.day, op.block), op.start);
  if (op.op === 'swap') return T.op.swap(at(op.day, op.block), at(op.day2, op.block2));
  return '';
}
// apply → '이렇게 바꿀까요?' + 바꿀 것 한 줄씩(편집이 하나면 [이대로 바꾸기]·[취소], 여럿이면 하나씩·[모두]·[취소]).
// 편집은 늘 이렇게 묻는다(K1 '항상 확인 후 적용'). 고르기 전에는 아무것도 바꾸지 않는다.
function editConfirmResult(result, ctx, T) {
  const groups = result.groups.length ? result.groups : [result.ops];
  const lines = groups.map((g) => g.map((op) => editOpText(op, ctx, T)).filter(Boolean));
  const cancel = { label: T.cancelChoice, ops: [], cancel: true };
  if (groups.length === 1) {
    return { status: 'ask', confirm: true, question: T.confirmAll(lines[0]), choices: [{ label: T.confirmApply, ops: result.ops }, cancel], notes: result.notes };
  }
  const list = groups.slice(0, EDIT_MAX_CHOICES).map((g, i) => ({ label: lines[i].join(', ').slice(0, 120), ops: g }));
  return { status: 'ask', confirm: true, question: T.confirmEach(list.length, lines.slice(0, list.length).flat()), choices: [...list, { label: T.all(list.length), ops: list.flatMap((c) => c.ops), all: true }, cancel], notes: result.notes };
}

// ── 되묻기에 글로 답하기(③) ──
// 화면은 아직 고르지 않은 마지막 선택지를 editChoices: [{ label, kinds }]로 함께 보낸다(kinds = 그 선택지의 편집 종류 remove·add·move·replace·time).
// 짧은 답('2일째'·'2일째로'·'둘째 날'·'오전'·'두 번째'·'모두'·'은각사로 해줘'·'취소')이면 다시 만들지 않고
//   edit: { status: 'pick', picks: [선택지 번호] }  — 1개면 그것을 고르고, 여럿이면 그중에서 고르게, 0개면 선택지를 그대로 두고 다시 고르게
//   edit: { status: 'cancel' }                     — '취소'·'아니'·'never mind': 선택지를 닫고 일정은 그대로
// 를 돌려준다(Gemini·Groq 0회). 선택지에 없는 장소·시각·도시·일수·'다시 짜줘'처럼 답이 아닌 말이 섞이면 null(지금처럼 해석한다).
// kinds의 'cancel' = '이렇게 바꿀까요?'의 [취소] 선택지(편집 없음)
const EDIT_CHOICE_KINDS = new Set(['remove', 'add', 'move', 'replace', 'time', 'swap', 'cancel']);
const EDIT_CHOICE_ALL_RE = /^(?:모두\(\d+곳\)|All \(\d+\)|すべて（\d+件）)$/;
const EDIT_CANCEL_LABELS = new Set(Object.values(EDIT_TEXT).map((T) => T.cancelChoice));
function sanitizeEditChoices(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = raw.slice(0, EDIT_MAX_CHOICES + 2).map((c) => {
    const label = typeof c === 'string' ? c : (c && typeof c.label === 'string' ? c.label : '');
    const kinds = c && Array.isArray(c.kinds) ? [...new Set(c.kinds.filter((k) => EDIT_CHOICE_KINDS.has(k)))] : [];
    return { label: label.trim().slice(0, 120), kinds };
  });
  return out.every((c) => c.label) ? out : null;
}
const EDIT_ANSWER_CANCEL_RE = /^(?:취소|그만|그만둘래|됐어|됐어요|괜찮아|괜찮아요|아니|아니요|아니야|아뇨|안\s*할래|no|nope|cancel|never\s*mind|forget\s*it|none|いいえ|やめて|やめます|やめる|キャンセル|やっぱりいい|いらない)(?:\s*(?:할게요?|해\s*줘|해|요|thanks|thank\s+you|です|します|ください))?$/i;
const EDIT_ANSWER_ORDINAL_RES = [
  [/(첫|두|세|네|다섯|여섯|일곱|여덟)\s*번\s*째/g, (m) => ({ '첫': 1, '두': 2, '세': 3, '네': 4, '다섯': 5, '여섯': 6, '일곱': 7, '여덟': 8 })[m[1]]],
  [/(?<!\d)(\d)\s*번(?:\s*째)?/g, (m) => Number(m[1])],
  [/첫째|둘째|셋째|넷째|다섯째|여섯째/g, (m) => EDIT_KO_ORDINAL[m[0]]],
  [/\b(first|second|third|fourth|fifth|sixth|seventh|eighth)\b/gi, (m) => EDIT_EN_ORDINAL[m[1].toLowerCase()]],
  [/(?:\b(?:option|choice|number|no\.?)\s*|#\s*)(\d)\b/gi, (m) => Number(m[1])],
  [/\b(\d)(?:st|nd|rd|th)\b/gi, (m) => Number(m[1])],
  [/(\d|[一二三四五六七八])\s*(?:つ目|番目|番)/g, (m) => Number(m[1]) || JA_NUMBER_CHARS[m[1]]],
  [/最初/g, () => 1],
  [/마지막|\blast\b|最後/gi, () => -1]
];
const EDIT_ANSWER_ALL_RE = /모두|전부|나머지|(?:둘|셋|넷|두\s*개|세\s*개|네\s*개)\s*다|(?<![가-힣])다(?![가-힣])|\ball\b|\bboth\b|\beverything\b|\bthe\s+rest\b|全部|すべて|全て|両方|残り/gi;
// 끝의 되묻는 꼬리('?'·'?!'·'?.'·'？！'·'?…'·'?~'·'?;;'·'?ㅠ'): ? 뒤에 문장 부호·자모 웃음·울음·그림 글자만 있으면 되묻는 말이다(검토 F2·K1c 막는 문제 3)
// (자모: 호환 ㅋ·ㅎ·ㅠ·ㅜ와 NFKC가 바꾼 조합용 모음 두 개)
const EDIT_ANSWER_QTAIL_RE = /[?？][\s.,!?~…。、！？;；:：'"“”‘’「」『』()（）\[\]·・\u314B\u314E\u3160\u315C\u1172\u116E\uFE0F\p{Extended_Pictographic}]*$/u;
// 'A 빼고 다'·'A 제외하고 전부'·'all except A'·'everything but A'·'A以外全部'·'Aを除いて全部': 'A 말고 다'와 같이 A를 뺀 나머지(검토 K1c 막는 문제 4)
const EDIT_ANSWER_EXCEPT_EN_RE = /\b(?:except(?:\s+for)?|other\s+than|apart\s+from|besides|but(?:\s+not)?)\b/gi;
// 답에 붙는 군말(조사·어미·'해줘'·'please'·'でお願いします')
const EDIT_ANSWER_FILLER_RES = [
  /^(?:(?:그|저|이)?(?:거|걸|것|꺼|곳|쪽|날|칸|선택지|옵션)?(?:으로|로|에|에서|요|이요|에요|예요|이에요|이야|야|을|를|은|는|이|가|도|만)?(?:해|해줘|해주세요|해줄래|해요|할게|할게요|할래|줘|주세요|줄래|부탁해|부탁해요|부탁드려요|좋아|좋아요|좋겠어|좋겠어요|가자|갈게|갈래)?)$/,
  /^(?:네|넵|넹|예|응|웅|ㅇㅇ|ㅇㅋ|그래|그래요|오케이|아니|아니요|아니야|음|그럼|그냥|그걸로|그거로|그것으로|이대로|그렇게|좋습니다)$/,
  /^(?:ok|okay|yes|yeah|yep|sure|please|pls|the|one|ones|that|this|on|to|in|for|go|ahead|with|pick|choose|it|option|choice|do|let'?s|i'?ll|take|a|an|at|of|them|is|fine|thanks|thank|you|make|then|just|no|i|want|like|would|prefer|put|use)$/i,
  /^(?:それ|これ|あれ|その|この|方|ほう|やつ)?(?:に|で|を|は|が|の|も|へ)*(?:して|する|します|しよう|お願い|お願いします|してください|ください|にして|がいい|でいい|です)?(?:ください|ね|よ|な)?$/,
  /^(?:はい|うん|ええ|いいよ)$/,
  // 두 답을 잇는 말('1일째랑 2일째'·'day 2 and day 3'·'2日目と3日目')
  /^(?:랑|이랑|와|과|하고|및|and|or|と|や)$/i
];
const EDIT_ANSWER_YES_RE = /^(?:네|넵|넹|예|응|웅|ㅇㅇ|ㅇㅋ|그래|그래요|오케이|좋아|좋아요|좋습니다|이대로|그렇게|ok|okay|yes|yeah|yep|sure|はい|うん|ええ|いいよ)$/i;
// 철회·보류('응 취소해'·'기요미즈데라 삭제 취소'·'빼는 건 보류'·'yes, cancel it'·'はい、キャンセル'·'取り消して'·'stop'·'leave it'):
// '이렇게 바꿀까요?'(선택지에 [취소]가 있음)에는 '네'가 섞여도, 장소를 말해도 바꾸지 않고 닫는다
const EDIT_ANSWER_WITHDRAW_RE = /취소|철회|보류|번복|무르|ㄴㄴ|노노|하지\s*마|\bcancel|\bstop\b|\bleave\s+it\b|\bundo\b|\bhold\s+off\b|キャンセル|取り消|取消|撤回|保留|やめ|ストップ/i;
// NFKC는 'ㅇㅇ'·'ㄴㄴ'(호환 자모)을 조합용 자모로 바꾼다. 답을 비교하기 전에 되돌린다.
const EDIT_COMPAT_JAMO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
// 거절('아니 됐어'·'안 넣을래'·'그냥 둬'·'필요 없어'·'넣지 마'·"never mind, don't add it"·'要らない'·'やめておく'·'入れないで'):
// 고를 것(일차·칸·장소·번호·모두)을 말하지 않았으면 선택지를 닫는다(일정을 다시 만들지 않는다)
const EDIT_ANSWER_REJECT_RE = /아니|아뇨|됐어|됐다|됐습니다|그만|필요\s*없|싫|(?<![가-힣])안\s*(?:할|해|넣|빼|옮|바꾸|바꿀|갈)|(?<![가-힣])(?:그냥|그대로)\s*(?:둬|두|놔|냅)|(?<![가-힣])(?:둬|둬요|냅둬|놔둬)(?![가-힣])|\bno\b|\bnope\b|\bnot\s+now\b|never\s*mind|forget\s*it|\bcancel\b|\bneither\b|\bnone\b|n['’]t\b|やめ|いらない|要らない|いいえ|結構|キャンセル|ないで/i;
const EDIT_ANSWER_VERB_KINDS = { remove: ['remove'], add: ['add'], move: ['move', 'time'], change: ['replace', 'time', 'move', 'swap'] };
// 칸 낱말끼리 맞는지('아침' = 오전·아침 식사, '저녁' = 저녁 식사·저녁 이후)
const EDIT_SLOT_COMPAT = { early: ['early', 'morning', 'breakfast'], morning: ['morning', 'early'], breakfast: ['breakfast', 'early'], evening: ['evening', 'dinner'], dinner: ['dinner', 'evening'] };

// 답의 남기라는 표지를 바꾸기 표지(instead)로 바꾼다: 'A 빼고 다'·'A 제외하고 전부'(빼기 동사 + 고, 뒤에 '다·전부·모두·나머지')·'A 외에 다'·
// 'all except A'·'everything but A'·'A以外全部'·'Aを除いて全部'(검토 K1c 막는 문제 4). 그러면 'A 말고 다'처럼 A를 뺀 나머지로 좁힌다(F5).
// 뒤에 '다' 같은 말이 없는 '2일째 빼고'는 그대로 빼기 동사다(그 선택지를 고른다).
function editAnswerExceptTokens(text, tokens) {
  const out = tokens.slice();
  const allAfter = (pos) => new RegExp(EDIT_ANSWER_ALL_RE.source, 'i').test(editBlankTokens(text.slice(pos), out, pos));
  for (const v of out) {
    if (v.type !== 'verb' || v.verb !== 'remove' || v.negated) continue;
    const tail = /^(?:놓|하)?고(?:는|서)?(?![가-힣])/.exec(text.slice(v.end));
    if (!tail || !allAfter(v.end + tail[0].length)) continue;
    v.type = 'instead';
    v.dir = 'before';
    v.end += tail[0].length;
  }
  const extra = [
    ...editRanges(/(?<![가-힣])(?:외에(?:는|도)?|외엔)(?![가-힣])/g, text, () => ({ type: 'instead', dir: 'before' })),
    ...editRanges(EDIT_EXCEPT_JA_RE, text, () => ({ type: 'instead', dir: 'before' })),
    ...editRanges(EDIT_ANSWER_EXCEPT_EN_RE, text, () => ({ type: 'instead', dir: 'after' }))
  ].filter((t) => !editOverlaps(t, out));
  return [...out, ...extra].sort((a, b) => a.start - b.start);
}
function answerEditQuestion(message, choices, ctx) {
  const T = EDIT_TEXT[ctx.replyLang] || EDIT_TEXT.ko;
  const text = String(message || '').normalize('NFKC').replace(/[ᄀ-ᄒ]/g, (c) => EDIT_COMPAT_JAMO[c.charCodeAt(0) - 0x1100]).trim();
  if (!text || text.length > 80) return null;
  if (EDIT_ANSWER_CANCEL_RE.test(text.replace(/[\s.,!?~…。、！？]+$/g, ''))) return { status: 'cancel', reply: T.answerCancelled };
  const tokens = editAnswerExceptTokens(text, tokenizeItineraryEdit(text, ctx));
  const verbs = tokens.filter((t) => t.type === 'verb');
  // 거절·그대로 두기·부정된 넣기: 고를 것을 말하지 않았으면 닫는다('아니 3일째로'처럼 고를 것이 있으면 아래에서 고른다)
  const pickInfo = tokens.some((t) => ['day', 'slot', 'place', 'time'].includes(t.type)) || /\d/.test(text)
    || EDIT_ANSWER_ORDINAL_RES.some(([re]) => new RegExp(re.source, re.flags.replace('g', '')).test(text)) || new RegExp(EDIT_ANSWER_ALL_RE.source, 'i').test(text);
  // '네'가 섞여도 거절·철회 말이 있으면 바꾸지 않는다('응 취소해'·'네? 아니요'·'좋아 근데 하지 마').
  // '이렇게 바꿀까요?'([취소] 선택지가 있음)에는 고를 것을 말해도 닫는다('기요미즈데라 삭제 취소': 그 삭제를 하지 말라는 말이다).
  const confirmCtx = choices.some((c) => c.kinds.includes('cancel') || EDIT_CANCEL_LABELS.has(c.label));
  const rejects = EDIT_ANSWER_REJECT_RE.test(text) || EDIT_ANSWER_WITHDRAW_RE.test(text) || editMarkerReasons(text, tokens).includes('neg') || verbs.some((v) => v.verb === 'keep');
  if (rejects && (confirmCtx || !pickInfo)) return { status: 'cancel', reply: T.answerCancelled };
  if (tokens.some((t) => t.type === 'time')) return null;
  // 고를 것을 말하면서 그대로 두라는 말('2일째 거는 빼지 마'): 고르지 않고 선택지를 그대로 둔다. 다른 장소를 말한 새 명령이면 지금처럼 해석한다.
  if (verbs.some((v) => v.verb === 'keep')) return tokens.some((t) => t.type === 'place') ? null : { status: 'pick', picks: [], reply: T.answerNoMatch };
  // 'A 말고 B'('2일째 말고 3일째')·'B instead of A': 바꾸기 표지 뒤(영어는 앞)의 말만 고르는 답으로 본다.
  // 표지 반대쪽(exRegion)은 고르지 말라는 것이다('기요미즈데라 말고 전부'·'2日目じゃなくて全部' — 아래 F5).
  const instead = tokens.find((t) => t.type === 'instead') || null;
  const region = !instead ? [0, text.length] : (instead.dir === 'after' ? [0, instead.start] : [instead.end, text.length]);
  const exRegion = !instead ? null : (instead.dir === 'after' ? [instead.end, text.length] : [0, instead.start]);
  const within = (r) => (t) => Boolean(r) && t.start >= r[0] && t.end <= r[1];
  const inRegion = within(region);
  const inEx = within(exRegion);
  const ordinals = EDIT_ANSWER_ORDINAL_RES.flatMap(([re, fn]) => editRanges(re, text, (m) => ({ n: fn(m) }))).filter((r) => r.n && !editOverlaps(r, tokens));
  const alls = editRanges(EDIT_ANSWER_ALL_RE, text).filter((r) => !editOverlaps(r, tokens) && !editOverlaps(r, ordinals));
  let rest = text;
  for (const s of [...tokens, ...ordinals, ...alls]) rest = rest.slice(0, s.start) + ' '.repeat(s.end - s.start) + rest.slice(s.end);
  // 끝의 되묻는 꼬리('?!'·'?ㅠ')는 낱말로 보지 않는다(아래에서 되묻는 말로 다룬다)
  const qTail = EDIT_ANSWER_QTAIL_RE.exec(text);
  if (qTail) rest = rest.slice(0, qTail.index) + ' '.repeat(rest.length - qTail.index);
  // 낱말 속 따옴표("let's")는 지우고(글자 수를 맞추려고 뒤에 빈칸), 나머지 문장 부호는 빈칸으로
  rest = rest.replace(/([A-Za-z])['’]([A-Za-z])/g, '$1$2 ').replace(/[.,!?~…'"“”‘’「」『』()（）、。！？·・:;]/g, ' ');
  // 답의 일차: '2일째'·'둘째 날'·'day 2'(그리고 '2일에'·'2일로'·'2일'·'2日'은 날짜가 아니라 선택지의 N일차로 본다)
  const bareDays = [];
  const numWords = [];
  let yes = false;
  for (const w of editRanges(/\S+/g, rest)) {
    const bareDay = /^(\d{1,2})\s*(?:일|日)(?:로|으로|이요|요|이에요|이야|에|째|차|に|で|目)?$/.exec(w.raw);
    const num = /^\d{1,2}$/.test(w.raw);
    if (!bareDay && !num && !EDIT_ANSWER_FILLER_RES.some((re) => re.test(w.raw))) return null; // 답이 아닌 말이 섞였다 → 지금처럼 해석
    if (bareDay) bareDays.push({ start: w.start, end: w.end, day: Number(bareDay[1]) });
    else if (num) numWords.push({ start: w.start, end: w.end, n: Number(w.raw) });
    else if (inRegion(w) && EDIT_ANSWER_YES_RE.test(w.raw)) yes = true;
  }
  if (numWords.filter(inRegion).length > 1) return null;
  const infos = choices.map((c, i) => {
    const dayPart = c.label.split(' · ').find((p) => findEditDayRefs(p, ctx.lastDay).length) || '';
    const dayRefs = dayPart ? findEditDayRefs(dayPart, ctx.lastDay) : [];
    let slotText = dayPart;
    for (const d of dayRefs) slotText = slotText.slice(0, d.start) + ' '.repeat(d.end - d.start) + slotText.slice(d.end);
    const isCancel = c.kinds.includes('cancel') || EDIT_CANCEL_LABELS.has(c.label);
    return { i, kinds: c.kinds, isAll: EDIT_CHOICE_ALL_RE.test(c.label), isCancel, days: dayRefs.map((d) => d.day), slots: slotText.trim() ? findEditSlotRefs(slotText).map((s) => s.slot) : [], index: editTextIndex(c.label) };
  });
  // [취소] 선택지는 고를 대상이 아니다('네'는 [이대로 바꾸기], '취소'는 위에서 닫는다)
  const listed = infos.filter((x) => !x.isAll && !x.isCancel);
  // 선택지에 없는 장소를 말했으면('센소지 넣어줘'·'하코네에서 2일') 답이 아니라 새 요청이다
  const inLabel = (x, p) => [p.text, ...(p.cand ? p.cand.labels : []), ...p.blocks.map((b) => b.info.name)].some((n) => editLabelSpans(x.index, n).length > 0);
  if (tokens.some((t) => t.type === 'place' && !listed.some((x) => inLabel(x, t)))) return null;
  // 끝에 ?가 붙은 답('네?'·'ok?'·'you sure?'·'ええ？'·'다?'·'全部？'·'the second?')은 되묻는 말이지 승낙이 아니다(검토 F2):
  // 고르지 않고 선택지를 그대로 둔다. ? 뒤에 다른 부호가 붙어도('네?!'·'yes?.'·'はい？！'·'다?!'·'네?;;') 같다(K1c 막는 문제 3).
  // 부탁('2일째로 해 줄래?'·'can you do day 2?')은 묻는 말이 아니다.
  if (qTail && !EDIT_POLITE_ASK_RE.test(text)) return { status: 'pick', picks: [], reply: T.answerChoose };
  // 한쪽(region 또는 exRegion)에서 말한 고를 것: 일차·번호·칸·장소
  const pickOf = (inR) => {
    const days = [...tokens.filter((t) => t.type === 'day' && inR(t)).map((t) => t.dom || t.day), ...bareDays.filter(inR).map((d) => d.day)];
    const nums = numWords.filter(inR).map((x) => x.n);
    const ordinalHit = ordinals.find(inR);
    let ordinal = ordinalHit ? ordinalHit.n : 0;
    if (nums.length) {
      if (!days.length && listed.some((x) => x.days.includes(nums[0]))) days.push(nums[0]);
      else if (!ordinal) ordinal = nums[0];
    }
    return { days, ordinal, slots: tokens.filter((t) => t.type === 'slot' && inR(t)).map((t) => t.slot), places: tokens.filter((t) => t.type === 'place' && inR(t)) };
  };
  const narrow = (list, c) => {
    let out = list;
    if (c.ordinal) {
      const target = listed[c.ordinal === -1 ? listed.length - 1 : c.ordinal - 1];
      out = out.filter((x) => x === target);
    }
    if (c.days.length) out = out.filter((x) => x.days.some((d) => c.days.includes(d)));
    if (c.slots.length) out = out.filter((x) => c.slots.every((s) => x.slots.some((ls) => (EDIT_SLOT_COMPAT[s] || [s]).includes(ls))));
    if (c.places.length) out = out.filter((x) => c.places.every((p) => inLabel(x, p)));
    return out;
  };
  // 다른 종류의 편집을 말했으면('넣을까요?'에 '2일째 오전 빼줘') 답이 아니라 새 편집 명령이다
  const allowed = new Set(verbs.flatMap((v) => EDIT_ANSWER_VERB_KINDS[v.verb] || []));
  const byVerb = (list) => (verbs.length ? list.filter((x) => !x.kinds.length || x.kinds.some((k) => allowed.has(k))) : list);
  // 'A 말고 다'·'Aじゃなくて全部'·'all instead of A'(검토 F5): [모두]를 고르지 않는다. A에 맞는 선택지를 뺀 나머지로 좁히고
  // (하나면 그것, 여럿이면 그것만 다시 보여 준다), A를 알 수 없으면 선택지를 그대로 둔다.
  if (exRegion && alls.some(inRegion)) {
    const ex = pickOf(inEx);
    const excluded = ex.ordinal || ex.days.length || ex.slots.length || ex.places.length ? narrow(listed, ex) : [];
    const left = byVerb(listed.filter((x) => !excluded.includes(x)));
    if (!excluded.length || !left.length || left.length === listed.length) return { status: 'pick', picks: [], reply: T.answerNoMatch };
    if (left.length === 1) return { status: 'pick', picks: [left[0].i], reply: T.answerPicked(choices[left[0].i].label) };
    return { status: 'pick', picks: left.map((x) => x.i), reply: T.answerNarrow(left.length) };
  }
  const sel = pickOf(inRegion);
  // '모두'·'둘 다': '모두' 선택지가 없으면('1일째 2일째 둘 다') 말한 일차 등으로 좁힌다
  const wantAll = alls.some(inRegion) && infos.some((x) => x.isAll);
  let pool = byVerb(wantAll ? infos.filter((x) => x.isAll) : listed.slice());
  if (verbs.length && !pool.length) return null;
  pool = narrow(pool, sel);
  const constrained = Boolean(sel.ordinal || wantAll || sel.days.length || sel.slots.length || sel.places.length);
  // 고를 것을 말하지 않은 답('네'·'ok'): 선택지가 하나면 그것, 아니면 위 선택지에서 고르게(모두에 맞는 답 '오전'도 같다)
  if (!constrained && !(yes && listed.length === 1)) pool = listed.length > 1 ? listed.slice() : [];
  const picks = pool.map((x) => x.i);
  if (picks.length > 1 && picks.length === listed.length && !wantAll) return { status: 'pick', picks: [], reply: T.answerChoose };
  if (picks.length === 1) return { status: 'pick', picks, reply: T.answerPicked(choices[picks[0]].label) };
  if (picks.length > 1) return { status: 'pick', picks, reply: T.answerNarrow(picks.length) };
  return { status: 'pick', picks: [], reply: T.answerNoMatch };
}
function editAnswerResponse(ans) {
  return {
    mode: 'edit',
    edit: ans.status === 'cancel' ? { status: 'cancel' } : { status: 'pick', picks: ans.picks },
    reply: ans.reply,
    source: 'rule_edit_parser_v1',
    sourceInfo: sourceInfo('rule', 'rule', null),
    aiModel: null,
    aiNote: summarizeAiErrors([]),
    aiErrors: []
  };
}

// 편집 명령이면 응답 객체, 아니면 null(지금처럼 조건을 해석해 다시 만든다). Gemini는 부르지 않는다.
async function interpretItineraryEdit(message, it, opts = {}) {
  const ctx = buildEditContext(it, opts.lang);
  // 되묻기에 글로 답했으면(화면이 아직 고르지 않은 선택지를 보냄) 그 선택지를 고른다
  if (opts.choices) {
    const ans = answerEditQuestion(message, opts.choices, ctx);
    if (ans) return editAnswerResponse(ans);
  }
  // 맞장구·인사만 있는 말('네'·'고마워'·'ok thanks'·'はい'·'お願いします')은 일정을 다시 만들지 않는다
  // ('이미 그 칸에 있어요'·확인을 닫은 뒤의 '네'가 일정 전체를 새로 만들지 않게). 고르는 중이면 위에서 고르라고 답한다.
  const bare = String(message || '').normalize('NFKC').replace(/[\s.,!?~…。、！？'"“”‘’()（）]+/g, ' ').trim();
  if (bare && EDIT_POLITE_ONLY_RE.test(bare)) {
    const T0 = EDIT_TEXT[ctx.replyLang] || EDIT_TEXT.ko;
    return { ...editAnswerResponse({ status: 'none', reply: opts.choices ? T0.answerChoose : T0.ackOnly }), edit: { status: 'none' } };
  }
  const rules = parseItineraryEditRules(message, ctx);
  if (!rules.edit) {
    // 다시 만드는 까닭(화면이 일정 전체를 바꾸기 전에 물을지 본다: 'category' = 넣을 것이 종류·음식 낱말)
    if (opts.info) opts.info.regen = rules.regen || '';
    return null;
  }
  let rawOps = null;
  let source = 'rule';
  let aiModel = null;
  const aiErrors = [];
  // 부정·그대로 두기('금각사 빼지 말고 은각사 넣어줘')가 있는 말은 규칙 해석만 쓴다(AI가 부정을 놓쳐 남기라는 장소를 지우지 않게).
  // 장소와 칸이 안 맞는 말('금각사 저녁 빼줘')도 규칙으로 그 칸 일정과 장소를 묻는다(검토 F1).
  // 'X 빼고 다 빼줘'·'except X'(남기라는 말)도 규칙만 쓴다(검토 K1c 막는 문제 4).
  if (OPENAI_API_KEY && !rules.keep && !rules.slotMismatch && !rules.except) {
    try {
      const ai = await parseItineraryEditWithOpenAI(String(message || ''), ctx, opts.history);
      if (ai.kind !== 'edit') return null;
      // 말 속 시각이 하나면 Groq의 'HH:MM' 대신 그것(오전·오후 표시 포함)을 쓴다(검토 F6: '저녁 7시'를 07:00으로 읽지 않게).
      // 그 밖의 Groq 시각도 editClockFor가 규칙 시각과 같이 검사한다.
      // Groq가 같은 장소를 고치면서 말한 일차·칸을 빠뜨렸으면 규칙이 알아들은 일차·칸으로 채운다(검토 F1: '금각사 저녁 빼줘'를
      // Groq가 '금각사 빼기'로만 읽어도 그 장소가 저녁 칸에 없으면 묻는다). 말하지 않은 일차·칸은 채우지 않는다.
      const ruleTimes = rules.tokens.filter((t) => t.type === 'time');
      rawOps = ai.ops.map((o) => {
        let out = ruleTimes.length === 1 && o.action === 'time' ? { ...o, time: ruleTimes[0] } : o;
        if (['remove', 'time', 'move', 'replace'].includes(o.action) && o.place && (!o.day || !o.slot)) {
          const same = rules.ops.find((r) => r.action === o.action && r.placeMention && editNameMatches(o.place, [r.placeMention.text, ...r.placeMention.blocks.map((b) => b.info.name)]));
          if (same) out = { ...out, day: out.day || same.day, slot: out.slot || same.slot };
        }
        return out;
      });
      source = 'ai';
      aiModel = ai.model;
    } catch (err) {
      const classified = classifyAiError(OPENAI_PROVIDER_LABEL, err);
      aiErrors.push(classified);
      warnThrottled(`chat-edit:openai:${classified.code}`, `[chat-edit] ${OPENAI_PROVIDER_LABEL} 편집 해석 실패(${classified.code}) → 규칙 해석: ${String(err?.message || err).slice(0, 200)}`.replace(/\s+/g, ' '));
    }
  }
  if (!rawOps) rawOps = rules.ops;
  if (!rawOps.length) return null;
  let result = resolveEditRawOps(rawOps, ctx, { message: String(message || '') });
  const T = EDIT_TEXT[ctx.replyLang] || EDIT_TEXT.ko;
  // 확정된 편집도 바로 적용하지 않는다(K1 '항상 확인 후 적용'): '이렇게 바꿀까요?' + 바꿀 것 한 줄씩 + [이대로 바꾸기]·[취소].
  // 화면은 사용자가 고른 뒤에만 바꾼다.
  if (result.status === 'apply') result = editConfirmResult(result, ctx, T);
  else if (result.status === 'ask') {
    // 되묻기: 단순한 명령이 아니면(부정·그대로 두기·조건·질문·대조·맞바꾸기·절이나 장소가 여럿·남는 낱말) 고르지 않고 그만둘 수 있게 [취소]를 두고,
    // 선택지에 함께 실린 다른 편집을 문구에 밝힌다. Groq 해석이면 남는 낱말을 모두 세고(Groq가 그 말을 어떻게 읽었는지 모르므로) Groq 편집 수·장소 수도 본다.
    // Groq가 규칙과 다른 동작(빼기·옮기기·시각…)으로 읽었으면 [취소]를 둔다(검토 K1c 사소한 의견 1: 'move dinner to 7pm'을 빼기로 읽은 경우)
    // 고칠 장소를 Groq가 말에 없는 곳으로 골랐을 때도 같다('기요미즈데라 빼줘'인데 Groq가 금각사).
    const actionsOf = (list) => [...new Set(list.map((o) => o.action))].sort().join(',');
    const ruleNames = rules.ops.filter((r) => r.placeMention).flatMap((r) => [r.placeMention.text, ...r.placeMention.blocks.map((b) => b.info.name)]);
    const aiOffTarget = source === 'ai' && rawOps.some((o) => o.place && !editHasEvidence(message, o.place, null) && !editNameMatches(o.place, ruleNames));
    const aiDiffers = source === 'ai' && ((rules.ops.length > 0 && actionsOf(mergeEditRemoveAdd(rawOps)) !== actionsOf(rules.ops)) || aiOffTarget);
    const reasons = source === 'ai'
      ? [...new Set([...rules.aiMarkers, ...editStructureReasons(rules.tokens, mergeEditRemoveAdd(rawOps)), ...(aiDiffers ? ['aiAction'] : [])])]
      : rules.reasons;
    if (reasons.length && result.choices.some((c) => c.ops.some((o) => o.op !== 'add'))) {
      const also = (result.bundled || []).map((op) => editOpText(op, ctx, T)).filter(Boolean);
      result = { ...result, confirm: true, question: also.length ? `${result.question} ${T.alsoChanges(also.join(', '))}` : result.question,
        choices: [...result.choices, { label: T.cancelChoice, ops: [], cancel: true }] };
    }
  }
  const sep = ctx.replyLang === 'ja' ? '' : ' ';
  const reply = result.status === 'ask' ? [...result.notes, result.question].join(sep) : result.notes.join(sep);
  const edit = { status: result.status };
  if (result.status === 'ask') { edit.question = result.question; edit.choices = result.choices; if (result.confirm) edit.confirm = true; }
  return {
    mode: 'edit',
    edit,
    reply,
    source: source === 'ai' ? 'openai_edit_parser_v1' : 'rule_edit_parser_v1',
    // 규칙 해석은 오류가 아니다(편집에는 Gemini를 쓰지 않는다). Groq가 실패했을 때만 그 이유를 싣는다.
    sourceInfo: source === 'ai' ? sourceInfo('ai', 'openai', null) : sourceInfo('rule', 'rule', aiErrors[0]?.reasonCode || null),
    aiModel: source === 'ai' ? aiModel : null,
    aiNote: summarizeAiErrors(aiErrors),
    aiErrors: publicAiErrors(aiErrors)
  };
}

// 화면 응답에서 내부용 필드(_로 시작)를 뺀다.
function publicChatParsed(parsed) {
  const out = {};
  for (const [k, v] of Object.entries(parsed || {})) if (!k.startsWith('_')) out[k] = v;
  return out;
}

const CHAT_REASON_TEXT = {
  ko: { mapping: (c, a) => `도시/공항: ${c} - ${a}`, area: (l) => `숙소 우선 지역: ${l}`, noArea: '숙소 지역: 중심가 접근성 기준', access: '공항 접근성 우선' },
  en: { mapping: (c, a) => `City/airport: ${c} - ${a}`, area: (l) => `Preferred stay area: ${l}`, noArea: 'Stay area: central access', access: 'Easy airport access preferred' },
  ja: { mapping: (c, a) => `都市/空港：${c} - ${a}`, area: (l) => `宿の優先エリア：${l}`, noArea: '宿のエリア：中心部へのアクセス重視', access: '空港アクセスを優先' }
};

async function buildTravelChatPlan(payload = {}) {
  const lang = normalizeLang(payload.lang);
  const message = String(payload.message || '');
  const history = sanitizeChatHistory(payload.history);
  // 일정이 있을 때(화면이 itinerary를 보냄) 일부만 고치는 말이면 다시 만들지 않고 편집·되묻기를 돌려준다(Gemini 0회, 위 interpretItineraryEdit)
  const editItinerary = sanitizeEditItinerary(payload.itinerary);
  const editInfo = {};
  if (editItinerary) {
    const edit = await interpretItineraryEdit(message, editItinerary, { lang, history, choices: sanitizeEditChoices(payload.editChoices), info: editInfo });
    if (edit) return edit;
  }
  const prevParsed = sanitizePrevParsed(payload.prevParsed);
  const isFollowUp = Boolean(prevParsed) && history.length > 0;
  // 후속 대화는 이전 조건(도시·일수·테마·출발일)을 폼 대신 기본값으로 쓴다.
  const context = { ...(payload.context && typeof payload.context === 'object' ? payload.context : {}) };
  if (isFollowUp) {
    if (prevParsed.cityKey && CITY_DATA[prevParsed.cityKey]) context.city = prevParsed.cityKey;
    if (prevParsed.days) context.days = prevParsed.days;
    if (CHAT_THEMES.includes(prevParsed.theme)) context.theme = prevParsed.theme;
    if (prevParsed.startDate) context.startDate = prevParsed.startDate;
    if (['low', 'mid', 'high'].includes(prevParsed.budget)) context.budget = prevParsed.budget;
  }
  const fallback = parseTravelChatInput({ ...payload, context });

  let parsed = null;
  let source = 'rule_based';
  let aiModel = null;
  const aiErrors = [];

  // 공급자 순서는 AI_CHAT_PROVIDER_ORDER(기본 gemini → openai). 키가 있는 공급자만 시도하고, 모두 실패하면 규칙 기반 해석.
  const chatProviders = AI_CHAT_PROVIDER_ORDER.filter((p) => (p === 'gemini' ? USE_GEMINI : Boolean(OPENAI_API_KEY)));
  const chatProviderLabel = (p) => (p === 'gemini' ? 'Gemini' : OPENAI_PROVIDER_LABEL);
  for (let i = 0; i < chatProviders.length && !parsed; i += 1) {
    const provider = chatProviders[i];
    const label = chatProviderLabel(provider);
    try {
      const aiParsed = provider === 'gemini'
        ? await parseTravelChatWithGemini(message, context, history, prevParsed)
        : await parseTravelChatWithOpenAI(message, context, history, prevParsed);
      const normalized = normalizeTravelChatParsed(aiParsed, fallback, { message, isFollowUp, prev: prevParsed });
      if (normalized._aiFieldCount > 0) {
        parsed = normalized;
        aiModel = aiParsed._aiModel || (provider === 'gemini' ? GEMINI_API_MODEL : OPENAI_MODEL);
        source = provider === 'gemini' ? 'gemini_chat_parser_v1' : 'openai_chat_parser_v1';
      } else {
        throw new AiOutputError('AI_INVALID_OUTPUT', `${label} chat parser returned no usable fields`);
      }
    } catch (err) {
      const classified = classifyAiError(label, err);
      aiErrors.push(classified);
      const nextStep = chatProviders[i + 1] ? `${chatProviderLabel(chatProviders[i + 1])} 시도` : '규칙 기반 해석';
      warnThrottled(`chat:${provider}:${classified.code}`, `[chat] ${label} 해석 실패(${classified.code}) → ${nextStep}: ${String(err?.message || err).slice(0, 200)}`.replace(/\s+/g, ' '));
    }
  }

  if (!parsed) {
    if (CHAT_PARSE_STRICT_AI) {
      throw new Error(summarizeAiErrors(aiErrors) || 'AI chat parser is unavailable');
    }
    parsed = { ...fallback, _aiFieldCount: 0 };
  }

  if (isFollowUp) parsed = applyFollowUpRules(parsed, prevParsed, message, fallback);
  parsed.isFollowUp = isFollowUp || Boolean(parsed.isFollowUp);

  let cityMeta = null;
  const knownByLabel = detectCityKeyByInput(parsed.cityLabel);
  if (!knownByLabel && parsed.cityLabel && parsed.cityLabel !== (CITY_DATA[parsed.cityKey]?.label || '')) {
    try {
      cityMeta = await ensureDynamicCityProfile(parsed.cityLabel, parsed.theme, parsed.budget, parsed.foodKeyword, parsed.arrivalAirport, lang);
    } catch {
      cityMeta = null;
    }
    if (cityMeta) {
      parsed.cityKey = cityMeta.key;
      parsed.cityLabel = cityMeta.label;
      parsed.arrivalAirport = cityMeta.airport;
    }
  } else {
    const city = CITY_DATA[parsed.cityKey] || CITY_DATA.tokyo;
    cityMeta = { key: parsed.cityKey, label: city.label, airport: city.airport, dynamic: false };
  }

  const rec = await recommendDestinations({
    city: parsed.cityKey,
    theme: parsed.theme,
    budget: parsed.budget,
    pace: 'normal',
    lang,
    limit: Math.max(8, Math.min(14, parsed.days * 2))
  });

  const excludedSet = resolveExcludedNameKeys(parsed.excludedPlaces);
  const notExcluded = (p) => !isExcludedPlace(p, excludedSet);
  // 꼭 갈 곳 카드: 추천 목록에 같은 곳이 있으면 그 카드(실제 지역·추천 시간·사진)를 쓰고, 없을 때만 내장 데이터로 카드를 만든다
  // (요청 명소 기본값 '10:00-17:00'·도시 이름 지역이 큐레이션의 '저녁 도톤보리(난바 18:00-21:00)'를 덮어쓰지 않게).
  // 말로 한 '당일치기 하루'·'저녁에'(이전 대화 포함)는 카드의 추천 시간·머무는 시간에 반영한다.
  const userText = [...history.filter((h) => h.role === 'user').map((h) => h.content), message].join('\n');
  const hints = wantedTimeHints(userText, parsed.wantedPlaces, [parsed.cityKey]);
  const allDayNames = new Set([...(parsed._allDayWanted || []), ...hints.allDay]);
  const eveningNames = new Set([...(parsed._eveningWanted || []), ...hints.evening]);
  const startHourOf = (range) => { const m = /^(\d{1,2}):/.exec(String(range || '')); return m ? Number(m[1]) : 12; };
  let selectedDestinations = [];
  const pushCard = (card) => {
    const key = placeNameKey(placeOriginalName(card));
    if (!key || selectedDestinations.some((x) => placeNameKey(placeOriginalName(x)) === key)) return;
    selectedDestinations.push(card);
  };
  const areaTokens = [];
  for (const want of parsed.wantedPlaces.slice(0, 6)) {
    const wk = placeNameKey(normalizeWantedPlaceName(want));
    const real = rec.picks.find((p) => [p.name, p.nameKo].filter(Boolean).some((n) => placeNameKey(n) === wk));
    let card = null;
    if (real) {
      card = { ...real };
    } else {
      const synth = buildSyntheticWantedDestinations([want], parsed.cityKey, 1, { allDay: [...allDayNames], evening: [...eveningNames], routeCityKeys: (parsed.routeCities || []).map((c) => cityKeyByLabel(c)) })[0];
      if (!synth) continue;
      const ck = cityKeyByLabel(synth.city) || parsed.cityKey;
      card = localizeCuratedPlace(withCityPhotoFallback(attachPlaceMedia(synth, ck, synth.name), ck), ck, lang);
      if (!isKnownPlaceName(want)) areaTokens.push(String(want).toLowerCase());
    }
    if (allDayNames.has(want) && !card.fullDay && !card.dayTrip) Object.assign(card, { dayTrip: true, bestTime: '09:00-18:00', stayMin: 480 });
    else if (eveningNames.has(want) && !card.fullDay && !card.dayTrip && startHourOf(card.bestTime) < 17) card.bestTime = '18:00-20:30';
    pushCard(card);
  }
  // 데이터에 없는 지역 이름('아키하바라', '난바')을 말했으면 그 지역의 추천 카드도 함께 둔다
  if (areaTokens.length) rec.picks.filter((p) => areaTokens.some((t) => String(p.area || '').toLowerCase().includes(t))).forEach((p) => pushCard({ ...p }));
  if (selectedDestinations.length === 0 && parsed.preferredAreas.length > 0) {
    selectedDestinations = rec.picks.filter((p) => parsed.preferredAreas.some((a) => String(p.area || '').includes(a))).slice(0, 6);
  }
  selectedDestinations = selectedDestinations.slice(0, 6);

  if (Array.isArray(parsed.routeCities) && parsed.routeCities.length > 1) {
    const selectedCities = new Set(selectedDestinations.map((d) => String(d.city || '').trim()).filter(Boolean));
    for (const cityLabel of parsed.routeCities) {
      if (selectedCities.has(cityLabel)) continue;
      const ck = cityKeyByLabel(cityLabel);
      const cityData = CITY_DATA[ck];
      const anchor = (cityData?.highlights || []).find((h) => notExcluded(h));
      if (!anchor) continue;
      // 꼭 갈 곳 카드처럼 화면 언어로 표기한다(en/ja: name은 현지화 이름, 원래 한글 이름은 nameKo — 일정 후처리가 이 이름으로 후보를 알아본다)
      selectedDestinations.push(localizeCuratedPlace(withCityPhotoFallback(attachPlaceMedia({
        name: anchor.name,
        city: cityData.label,
        area: anchor.area || cityData.label,
        category: anchor.category || '요청 명소',
        bestTime: anchor.bestTime || '10:00-17:00',
        stayMin: Number(anchor.stayMin || 90),
        mapUrl: mapUrl(`${anchor.name} ${cityData.label}`),
        aiScore: 95
      }, ck, anchor.name), ck), ck, lang));
      selectedCities.add(cityData.label);
      if (selectedDestinations.length >= 8) break;
    }
  }
  selectedDestinations = selectedDestinations.filter(notExcluded);

  const RT = CHAT_REASON_TEXT[lang];
  const cityName = CITY_DATA[parsed.cityKey] && !CITY_DATA[parsed.cityKey].dynamic ? localizedCityName(parsed.cityKey, lang) : parsed.cityLabel;
  const reasons = [
    ...(Array.isArray(parsed.reasons) ? parsed.reasons : []),
    RT.mapping(cityName, parsed.arrivalAirport),
    parsed.preferredAreas.length ? RT.area(parsed.preferredAreas.map((a) => localizeCuratedArea(a, lang, cityName)).join(', ')) : RT.noArea,
    ...(parsed.preferAirportAccess ? [RT.access] : [])
  ].slice(0, 6);
  // 꺼진(false) 조건은 응답에서 뺀다: 화면이 다음 대화에 prevParsed(4KB 한도)로 돌려보내므로 작게 둔다.
  const resolvedSpecialPrefs = Object.fromEntries(Object.entries((parsed.specialPrefs && typeof parsed.specialPrefs === 'object')
    ? parsed.specialPrefs
    : parseSpecialPrefsFromText(message)).filter(([, v]) => v !== false && v !== undefined && v !== null && v !== ''));
  // 칩·확인 문구용 화면 언어 표기(원래 이름 배열은 그대로 두고 따로 싣는다): en/ja 화면에 한국어 이름이 섞이지 않게
  const labelCityKeys = [parsed.cityKey, ...(parsed.routeCities || []).map((c) => cityKeyByLabel(c))].filter(Boolean);
  const labels = {
    wantedPlaces: (parsed.wantedPlaces || []).map((w) => localizePlaceLabel(w, labelCityKeys, lang)),
    excludedPlaces: (parsed.excludedPlaces || []).map((w) => localizePlaceLabel(w, labelCityKeys, lang)),
    unsupportedPlaces: (parsed.unsupportedPlaces || []).map((w) => localizePlaceLabel(w, labelCityKeys, lang)),
    foodKeyword: String(parsed.foodKeyword || '').split(/\s*,\s*/).filter(Boolean).map((g) => localizeFoodGenre(g, lang)).join(lang === 'ja' ? '、' : ', ')
  };
  const finalParsed = { ...parsed, specialPrefs: resolvedSpecialPrefs, reasons, labels };
  const usedAi = source !== 'rule_based';
  const noAiConfigured = !USE_GEMINI && !OPENAI_API_KEY;

  return {
    parsed: publicChatParsed(finalParsed),
    selectedDestinations,
    reply: buildTravelChatReply(finalParsed, lang),
    cityMeta,
    uiActions: {
      foodCity: parsed.cityKey,
      foodGenre: parsed.foodKeyword || '',
      theme: parsed.theme
    },
    source,
    sourceInfo: usedAi
      ? sourceInfo('ai', source.startsWith('openai') ? 'openai' : 'gemini', null)
      : sourceInfo('rule', 'rule', noAiConfigured ? 'AI_KEY_MISSING' : (aiErrors[0]?.reasonCode || 'AI_INVALID_OUTPUT')),
    aiModel: usedAi ? aiModel : null,
    aiNote: summarizeAiErrors(aiErrors),
    aiErrors: publicAiErrors(aiErrors),
    // 일정이 있는데 넣거나 바꿀 것이 종류·음식 낱말이라 일정 전체를 다시 만드는 답: 화면이 지금 일정을 바꾸기 전에 묻는다(검토 R1 수정안 (a))
    ...(editInfo.regen === 'category' ? { editRegen: 'category' } : {})
  };
}

function mapUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getDateOffset(startDate, offset) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function themeScore(theme, place) {
  const t = String(theme || 'mixed').toLowerCase();
  if (t === 'foodie') return place.category.includes('미식') ? 2 : 0;
  if (t === 'culture') return place.category.includes('문화') ? 2 : 0;
  if (t === 'shopping') return place.category.includes('쇼핑') ? 2 : 0;
  if (t === 'nature') return place.category.includes('자연') ? 2 : 0;
  return 1;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function haversineKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2), Math.sqrt(1 - (s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2)));
  return R * c;
}

function categoryFit(theme, typeText) {
  const t = String(theme || 'mixed').toLowerCase();
  const type = String(typeText || '').toLowerCase();
  if (t === 'foodie') return type.includes('restaurant') || type.includes('food') || type.includes('market') ? 1 : 0.55;
  if (t === 'culture') return type.includes('museum') || type.includes('temple') || type.includes('church') || type.includes('shrine') || type.includes('historical') ? 1 : 0.55;
  if (t === 'shopping') return type.includes('shopping') || type.includes('store') || type.includes('mall') ? 1 : 0.55;
  if (t === 'nature') return type.includes('park') || type.includes('garden') || type.includes('beach') || type.includes('mountain') ? 1 : 0.55;
  return 0.75;
}

function budgetFit(budget, typeText) {
  const b = String(budget || 'mid').toLowerCase();
  const type = String(typeText || '').toLowerCase();
  const expensive = type.includes('shopping_mall') || type.includes('amusement_park');
  if (b === 'low') return expensive ? 0.6 : 0.95;
  if (b === 'high') return expensive ? 1 : 0.85;
  return 0.9;
}

function congestionPenalty(userRatingCount, openNow) {
  const popularity = clamp(Math.log1p(Number(userRatingCount || 0)) / Math.log1p(5000), 0, 1);
  const peakHour = new Date().getHours() >= 12 && new Date().getHours() <= 19;
  const base = peakHour ? popularity * 0.3 : popularity * 0.2;
  const closedPenalty = openNow === false ? 0.2 : 0;
  return clamp(base + closedPenalty, 0, 0.45);
}

// ── Korean address formatter ──
const JP_KO_AREA = {
  // Cities
  'osaka': '오사카', 'tokyo': '도쿄', 'kyoto': '교토', 'fukuoka': '후쿠오카',
  'sapporo': '삿포로', 'nagoya': '나고야', 'kobe': '고베', 'nara': '나라',
  'hiroshima': '히로시마', 'yokohama': '요코하마', 'okinawa': '오키나와',
  'kamakura': '가마쿠라', 'hakone': '하코네', 'nikko': '닛코',
  // Wards
  'chuo ward': '추오구', 'chuo-ku': '추오구', 'kita ward': '키타구', 'kita-ku': '키타구',
  'nishi ward': '니시구', 'nishi-ku': '니시구', 'minami ward': '미나미구', 'minami-ku': '미나미구',
  'naniwa ward': '나니와구', 'naniwa-ku': '나니와구',
  'tennoji ward': '덴노지구', 'tennoji-ku': '덴노지구',
  'abeno ward': '아베노구', 'abeno-ku': '아베노구',
  'sumida ward': '스미다구', 'sumida-ku': '스미다구',
  'taito ward': '다이토구', 'taito-ku': '다이토구',
  'shibuya ward': '시부야구', 'shibuya-ku': '시부야구',
  'shinjuku ward': '신주쿠구', 'shinjuku-ku': '신주쿠구',
  'minato ward': '미나토구', 'minato-ku': '미나토구',
  'toshima ward': '도시마구', 'toshima-ku': '도시마구',
  'chiyoda ward': '치요다구', 'chiyoda-ku': '치요다구',
  'setagaya ward': '세타가야구', 'setagaya-ku': '세타가야구',
  'meguro ward': '메구로구', 'meguro-ku': '메구로구',
  'nakano ward': '나카노구', 'nakano-ku': '나카노구',
  'bunkyo ward': '분쿄구', 'bunkyo-ku': '분쿄구',
  'higashiyama ward': '히가시야마구', 'higashiyama-ku': '히가시야마구',
  'sakyo ward': '사쿄구', 'sakyo-ku': '사쿄구',
  'shimogyo ward': '시모교구', 'shimogyo-ku': '시모교구',
  'hakata ward': '하카타구', 'hakata-ku': '하카타구',
  'naka ward': '나카구', 'naka-ku': '나카구',
  // City suffixes (Google Places returns "X City" pattern)
  'shibuya city': '시부야', 'shinjuku city': '신주쿠',
  'minato city': '미나토', 'chuo city': '추오',
  'taito city': '다이토', 'sumida city': '스미다',
  'toshima city': '도시마', 'chiyoda city': '치요다',
  'meguro city': '메구로', 'setagaya city': '세타가야',
  'nakano city': '나카노', 'bunkyo city': '분쿄',
  'koto city': '코토', 'shinagawa city': '시나가와',
  'ota city': '오타', 'suginami city': '스기나미',
  'itabashi city': '이타바시', 'nerima city': '네리마',
  'adachi city': '아다치', 'katsushika city': '카츠시카',
  'edogawa city': '에도가와', 'arakawa city': '아라카와',
  // Osaka city areas
  'osaka city': '오사카', 'sakai city': '사카이',
  // Kyoto
  'kyoto city': '교토',
  // Common area names in addresses
  'kabukicho': '카부키초', 'kabukichō': '카부키초',
  'roppongi hills': '롭폰기힐즈',
  'nihonbashi': '니혼바시', 'nihombashi': '니혼바시',
  'ebisu': '에비스', 'daikanyama': '다이칸야마',
  'shimokitazawa': '시모키타자와',
  'kichijoji': '기치조지', 'nakameguro': '나카메구로',
  'yurakucho': '유라쿠초', 'marunouchi': '마루노우치',
  'shinbashi': '신바시', 'shimbashi': '신바시',
  'takadanobaba': '다카다노바바',
  'kagurazaka': '카구라자카', 'jimbocho': '진보초',
  'ochanomizu': '오차노미즈', 'ueno park': '우에노 공원',
  'senso-ji': '센소지', 'meiji shrine': '메이지 신궁',
  'tokyo tower': '도쿄 타워', 'tokyo skytree': '도쿄 스카이트리',
  'shinsaibashi-suji': '신사이바시스지',
  'namba parks': '난바 파크스',
  'jingumae': '진구마에', 'jingūmae': '진구마에',
  'minamiaoyama': '미나미아오야마', 'aoyama': '아오야마',
  'azabu': '아자부', 'azabujuban': '아자부주반',
  'sendagaya': '센다가야', 'yoyogi': '요요기',
  'meguro': '메구로', 'gotanda': '고탄다',
  'shibakoen': '시바코엔', 'hamamatsucho': '하마마츠초',
  'toranomon': '도라노몬', 'otemachi': '오테마치',
  'tsukishima': '츠키시마', 'toyosu': '도요스',
  // Districts (standalone names - Google often uses these without ward/city suffix)
  'shibuya': '시부야', 'shinjuku': '신주쿠', 'ikebukuro': '이케부쿠로',
  'omotesando': '오모테산도', 'takeshita': '다케시타',
  'nishishinjuku': '니시신주쿠', 'nishishinsaibashi': '니시신사이바시',
  'shinsaibashisuji': '신사이바시스지',
  'yoyogikamizonocho': '요요기카미조노초',
  'yoyogikamizonochō': '요요기카미조노초',
  'dotonbori': '도톤보리', 'namba': '난바', 'umeda': '우메다',
  'shinsaibashi': '신사이바시', 'shinsekai': '신세카이',
  'tennoji': '덴노지', 'asakusa': '아사쿠사', 'ueno': '우에노',
  'akihabara': '아키하바라', 'ginza': '긴자', 'roppongi': '롭폰기',
  'harajuku': '하라주쿠', 'ikebukuro': '이케부쿠로',
  'odaiba': '오다이바', 'tsukiji': '츠키지',
  'gion': '기온', 'arashiyama': '아라시야마', 'fushimi': '후시미',
  'tenjin': '덴진', 'canal city': '캐널시티',
  'susukino': '스스키노', 'otaru': '오타루',
  'minato mirai': '미나토미라이', 'chinatown': '차이나타운',
};

function koreanizeAddress(formattedAddr, cityLabel) {
  if (!formattedAddr) return cityLabel || '';
  let addr = String(formattedAddr);
  // Remove zip codes
  addr = addr.replace(/\u3012?\d{3}-?\d{4}\s*/g, '');
  // Remove Japan/日本
  addr = addr.replace(/\b(Japan|日本)\b[,、\s]*/gi, '');
  // Normalize macron vowels for consistent matching
  addr = addr.replace(/\u014d/gi, 'o').replace(/\u016b/gi, 'u').replace(/\u0113/gi, 'e').replace(/\u012b/gi, 'i').replace(/\u0101/gi, 'a');
  // Translate known place names to Korean
  for (const [en, ko] of Object.entries(JP_KO_AREA)) {
    const re = new RegExp('\\b' + en.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\b', 'gi');
    addr = addr.replace(re, ko);
  }
  // Remove chome/番地/etc detail numbers
  addr = addr.replace(/\d+-ch\u014dme[\-\u2212]?[\d\u2212\-]*/gi, '');
  addr = addr.replace(/[\d\u2212\-]+\u756a\u5730?/g, '');
  // Remove leftover romaji building names (sequences of katakana+latin after district)
  addr = addr.replace(/[\u30A0-\u30FF\u3000-\u303F\uFF00-\uFFEF]+/g, ''); // katakana blocks
  // Clean up separators
  addr = addr.replace(/[,、]+/g, ', ');
  addr = addr.replace(/\s+/g, ' ');
  addr = addr.replace(/^[,\s]+/, '').replace(/[,\s]+$/, '').trim();
  return addr || cityLabel || '';
}

function shortArea(formattedAddr, cityLabel) {
  const clean = koreanizeAddress(formattedAddr, cityLabel);
  const parts = clean.split(/,/).map(s => s.trim()).filter(s => s && s.length > 1);
  if (parts.length === 0) return cityLabel || '';
  if (parts.length <= 2) return parts.join(', ');
  return parts.slice(0, 2).join(', ');
}

function localizeAddress(formattedAddr, cityLabel, lang) {
  if (!formattedAddr) return cityLabel || '';
  if (lang === 'ko') return shortArea(formattedAddr, cityLabel);
  // For en/ja, return cleaned address as-is
  const parts = formattedAddr.split(/,/).map(s => s.trim()).filter(s => s && s.length > 1);
  if (parts.length === 0) return cityLabel || '';
  if (parts.length <= 3) return parts.join(', ');
  return parts.slice(0, 3).join(', ');
}

// ── Google Places primaryType Korean mapping ──
const PRIMARY_TYPE_KO = {
  // Attractions
  'tourist_attraction': '관광명소', 'museum': '박물관', 'art_gallery': '미술관',
  'aquarium': '수족관', 'zoo': '동물원', 'amusement_park': '놀이공원',
  'theme_park': '테마파크', 'water_park': '워터파크',
  'historical_landmark': '역사명소', 'monument': '기념비', 'castle': '성',
  // Culture/Religion
  'temple': '사원', 'shrine': '신사', 'church': '교회', 'mosque': '모스크',
  'place_of_worship': '종교시설', 'cultural_center': '문화센터',
  // Nature
  'park': '공원', 'national_park': '국립공원', 'garden': '정원',
  'botanical_garden': '식물원', 'beach': '해변', 'mountain': '산',
  'hiking_area': '등산로', 'campground': '캠핑장', 'natural_feature': '자연경관',
  // Shopping
  'shopping_mall': '쇼핑몰', 'department_store': '백화점', 'store': '매장',
  'market': '시장', 'supermarket': '슈퍼마켓', 'convenience_store': '편의점',
  'clothing_store': '의류매장', 'electronics_store': '전자제품점',
  'book_store': '서점', 'gift_shop': '기념품점', 'jewelry_store': '보석점',
  // Food & Drink
  'restaurant': '레스토랑', 'japanese_restaurant': '일식당', 'sushi_restaurant': '스시',
  'ramen_restaurant': '라멘', 'chinese_restaurant': '중식당',
  'korean_restaurant': '한식당', 'italian_restaurant': '이탈리안',
  'french_restaurant': '프렌치', 'indian_restaurant': '인도식',
  'thai_restaurant': '태국식', 'vietnamese_restaurant': '베트남식',
  'mexican_restaurant': '멕시칸', 'american_restaurant': '아메리칸',
  'seafood_restaurant': '해산물', 'steak_house': '스테이크',
  'barbecue_restaurant': '바베큐', 'vegetarian_restaurant': '채식',
  'vegan_restaurant': '비건', 'pizza_restaurant': '피자',
  'hamburger_restaurant': '버거', 'sandwich_shop': '샌드위치',
  'fast_food_restaurant': '패스트푸드', 'food_court': '푸드코트',
  'meal_delivery': '배달', 'meal_takeaway': '포장',
  'cafe': '카페', 'coffee_shop': '커피숍', 'tea_house': '찻집',
  'bakery': '베이커리', 'ice_cream_shop': '아이스크림',
  'dessert_shop': '디저트', 'confectionery': '과자점',
  'bar': '바', 'pub': '펍', 'wine_bar': '와인바',
  'izakaya': '이자카야', 'night_club': '나이트클럽',
  // Entertainment
  'movie_theater': '영화관', 'performing_arts_theater': '공연장',
  'stadium': '경기장', 'bowling_alley': '볼링장', 'gym': '체육관',
  'spa': '스파', 'hot_spring': '온천',
  // Transport
  'train_station': '기차역', 'subway_station': '지하철역',
  'bus_station': '버스정류장', 'airport': '공항', 'ferry_terminal': '항구',
  // Accommodation
  'hotel': '호텔', 'lodging': '숙박', 'resort_hotel': '리조트',
  'guest_house': '게스트하우스', 'hostel': '호스텔',
  // Viewing/Observation
  'observation_deck': '전망대', 'lookout': '전망대', 'viewing_point': '전망대',
  'scenic_spot': '경승지',
  // Government/Office
  'government_office': '관공서', 'city_hall': '시청', 'local_government_office': '관공서',
  // Education
  'university': '대학교', 'school': '학교', 'library': '도서관',
  // Medical
  'hospital': '병원', 'pharmacy': '약국',
  // Other
  'point_of_interest': '명소', 'establishment': '시설',
  'political': '행정구역', 'locality': '지역',
};
// ── Google Places primaryType English mapping ──
const PRIMARY_TYPE_EN = {
  'tourist_attraction': 'Attraction', 'museum': 'Museum', 'art_gallery': 'Art Gallery',
  'aquarium': 'Aquarium', 'zoo': 'Zoo', 'amusement_park': 'Amusement Park',
  'theme_park': 'Theme Park', 'water_park': 'Water Park',
  'historical_landmark': 'Historic Site', 'monument': 'Monument', 'castle': 'Castle',
  'temple': 'Temple', 'shrine': 'Shrine', 'church': 'Church', 'mosque': 'Mosque',
  'place_of_worship': 'Place of Worship', 'cultural_center': 'Cultural Center',
  'park': 'Park', 'national_park': 'National Park', 'garden': 'Garden',
  'botanical_garden': 'Botanical Garden', 'beach': 'Beach', 'mountain': 'Mountain',
  'hiking_area': 'Hiking Trail', 'campground': 'Campground', 'natural_feature': 'Natural Feature',
  'shopping_mall': 'Shopping Mall', 'department_store': 'Department Store', 'store': 'Store',
  'market': 'Market', 'supermarket': 'Supermarket', 'convenience_store': 'Convenience Store',
  'clothing_store': 'Clothing', 'electronics_store': 'Electronics', 'book_store': 'Bookstore',
  'gift_shop': 'Gift Shop', 'jewelry_store': 'Jewelry',
  'restaurant': 'Restaurant', 'japanese_restaurant': 'Japanese', 'sushi_restaurant': 'Sushi',
  'ramen_restaurant': 'Ramen', 'chinese_restaurant': 'Chinese', 'korean_restaurant': 'Korean',
  'italian_restaurant': 'Italian', 'french_restaurant': 'French', 'indian_restaurant': 'Indian',
  'thai_restaurant': 'Thai', 'vietnamese_restaurant': 'Vietnamese',
  'mexican_restaurant': 'Mexican', 'american_restaurant': 'American',
  'seafood_restaurant': 'Seafood', 'steak_house': 'Steakhouse',
  'barbecue_restaurant': 'BBQ', 'vegetarian_restaurant': 'Vegetarian',
  'vegan_restaurant': 'Vegan', 'pizza_restaurant': 'Pizza',
  'hamburger_restaurant': 'Burger', 'sandwich_shop': 'Sandwich',
  'fast_food_restaurant': 'Fast Food', 'food_court': 'Food Court',
  'meal_delivery': 'Delivery', 'meal_takeaway': 'Takeaway',
  'cafe': 'Cafe', 'coffee_shop': 'Coffee', 'tea_house': 'Tea House',
  'bakery': 'Bakery', 'ice_cream_shop': 'Ice Cream', 'dessert_shop': 'Dessert',
  'confectionery': 'Confectionery', 'bar': 'Bar', 'pub': 'Pub', 'wine_bar': 'Wine Bar',
  'izakaya': 'Izakaya', 'night_club': 'Night Club',
  'movie_theater': 'Cinema', 'performing_arts_theater': 'Theater',
  'stadium': 'Stadium', 'bowling_alley': 'Bowling', 'gym': 'Gym',
  'spa': 'Spa', 'hot_spring': 'Hot Spring',
  'train_station': 'Train Station', 'subway_station': 'Subway', 'bus_station': 'Bus Stop',
  'airport': 'Airport', 'ferry_terminal': 'Ferry',
  'hotel': 'Hotel', 'lodging': 'Lodging', 'resort_hotel': 'Resort',
  'guest_house': 'Guest House', 'hostel': 'Hostel',
  'observation_deck': 'Observation Deck', 'lookout': 'Lookout', 'viewing_point': 'Viewpoint',
  'scenic_spot': 'Scenic Spot', 'government_office': 'Government', 'city_hall': 'City Hall',
  'university': 'University', 'school': 'School', 'library': 'Library',
  'hospital': 'Hospital', 'pharmacy': 'Pharmacy',
  'point_of_interest': 'Point of Interest', 'establishment': 'Establishment'
};

// ── Google Places primaryType Japanese mapping ──
const PRIMARY_TYPE_JA = {
  'tourist_attraction': '\u89b3\u5149\u540d\u6240', 'museum': '\u535a\u7269\u9928', 'art_gallery': '\u7f8e\u8853\u9928',
  'aquarium': '\u6c34\u65cf\u9928', 'zoo': '\u52d5\u7269\u5712', 'amusement_park': '\u904a\u5712\u5730',
  'theme_park': '\u30c6\u30fc\u30de\u30d1\u30fc\u30af', 'water_park': '\u30a6\u30a9\u30fc\u30bf\u30fc\u30d1\u30fc\u30af',
  'historical_landmark': '\u53f2\u8de1', 'monument': '\u8a18\u5ff5\u7891', 'castle': '\u57ce',
  'temple': '\u5bfa\u9662', 'shrine': '\u795e\u793e', 'church': '\u6559\u4f1a', 'mosque': '\u30e2\u30b9\u30af',
  'place_of_worship': '\u5b97\u6559\u65bd\u8a2d', 'cultural_center': '\u6587\u5316\u30bb\u30f3\u30bf\u30fc',
  'park': '\u516c\u5712', 'national_park': '\u56fd\u7acb\u516c\u5712', 'garden': '\u5ead\u5712',
  'botanical_garden': '\u690d\u7269\u5712', 'beach': '\u30d3\u30fc\u30c1', 'mountain': '\u5c71',
  'hiking_area': '\u30cf\u30a4\u30ad\u30f3\u30b0\u30b3\u30fc\u30b9', 'campground': '\u30ad\u30e3\u30f3\u30d7\u5834',
  'natural_feature': '\u81ea\u7136\u666f\u89b3',
  'shopping_mall': '\u30b7\u30e7\u30c3\u30d4\u30f3\u30b0\u30e2\u30fc\u30eb', 'department_store': '\u30c7\u30d1\u30fc\u30c8',
  'store': '\u5e97\u8217', 'market': '\u5e02\u5834', 'supermarket': '\u30b9\u30fc\u30d1\u30fc',
  'convenience_store': '\u30b3\u30f3\u30d3\u30cb', 'clothing_store': '\u8863\u6599\u54c1',
  'electronics_store': '\u5bb6\u96fb', 'book_store': '\u66f8\u5e97',
  'gift_shop': '\u304a\u571f\u7523', 'jewelry_store': '\u5b9d\u77f3',
  'restaurant': '\u30ec\u30b9\u30c8\u30e9\u30f3', 'japanese_restaurant': '\u548c\u98df',
  'sushi_restaurant': '\u5bff\u53f8', 'ramen_restaurant': '\u30e9\u30fc\u30e1\u30f3',
  'chinese_restaurant': '\u4e2d\u83ef', 'korean_restaurant': '\u97d3\u56fd\u6599\u7406',
  'italian_restaurant': '\u30a4\u30bf\u30ea\u30a2\u30f3', 'french_restaurant': '\u30d5\u30ec\u30f3\u30c1',
  'indian_restaurant': '\u30a4\u30f3\u30c9\u6599\u7406', 'thai_restaurant': '\u30bf\u30a4\u6599\u7406',
  'vietnamese_restaurant': '\u30d9\u30c8\u30ca\u30e0\u6599\u7406',
  'mexican_restaurant': '\u30e1\u30ad\u30b7\u30ab\u30f3', 'american_restaurant': '\u30a2\u30e1\u30ea\u30ab\u30f3',
  'seafood_restaurant': '\u6d77\u9bae', 'steak_house': '\u30b9\u30c6\u30fc\u30ad',
  'barbecue_restaurant': '\u713c\u8089', 'vegetarian_restaurant': '\u30d9\u30b8\u30bf\u30ea\u30a2\u30f3',
  'vegan_restaurant': '\u30f4\u30a3\u30fc\u30ac\u30f3', 'pizza_restaurant': '\u30d4\u30b6',
  'hamburger_restaurant': '\u30d0\u30fc\u30ac\u30fc', 'sandwich_shop': '\u30b5\u30f3\u30c9\u30a4\u30c3\u30c1',
  'fast_food_restaurant': '\u30d5\u30a1\u30b9\u30c8\u30d5\u30fc\u30c9', 'food_court': '\u30d5\u30fc\u30c9\u30b3\u30fc\u30c8',
  'meal_delivery': '\u51fa\u524d', 'meal_takeaway': '\u30c6\u30a4\u30af\u30a2\u30a6\u30c8',
  'cafe': '\u30ab\u30d5\u30a7', 'coffee_shop': '\u30b3\u30fc\u30d2\u30fc', 'tea_house': '\u8336\u5ba4',
  'bakery': '\u30d1\u30f3\u5c4b', 'ice_cream_shop': '\u30a2\u30a4\u30b9',
  'dessert_shop': '\u30c7\u30b6\u30fc\u30c8', 'confectionery': '\u83d3\u5b50',
  'bar': '\u30d0\u30fc', 'pub': '\u30d1\u30d6', 'wine_bar': '\u30ef\u30a4\u30f3\u30d0\u30fc',
  'izakaya': '\u5c45\u9152\u5c4b', 'night_club': '\u30ca\u30a4\u30c8\u30af\u30e9\u30d6',
  'movie_theater': '\u6620\u753b\u9928', 'performing_arts_theater': '\u5287\u5834',
  'stadium': '\u30b9\u30bf\u30b8\u30a2\u30e0', 'bowling_alley': '\u30dc\u30a6\u30ea\u30f3\u30b0',
  'gym': '\u30b8\u30e0', 'spa': '\u30b9\u30d1', 'hot_spring': '\u6e29\u6cc9',
  'train_station': '\u99c5', 'subway_station': '\u5730\u4e0b\u9244',
  'bus_station': '\u30d0\u30b9\u505c', 'airport': '\u7a7a\u6e2f', 'ferry_terminal': '\u6e2f',
  'hotel': '\u30db\u30c6\u30eb', 'lodging': '\u5bbf\u6cca', 'resort_hotel': '\u30ea\u30be\u30fc\u30c8',
  'guest_house': '\u30b2\u30b9\u30c8\u30cf\u30a6\u30b9', 'hostel': '\u30db\u30b9\u30c6\u30eb',
  'observation_deck': '\u5c55\u671b\u53f0', 'lookout': '\u5c55\u671b\u53f0',
  'viewing_point': '\u5c55\u671b\u53f0', 'scenic_spot': '\u666f\u52dd\u5730',
  'government_office': '\u5f79\u6240', 'city_hall': '\u5e02\u5f79\u6240',
  'university': '\u5927\u5b66', 'school': '\u5b66\u6821', 'library': '\u56f3\u66f8\u9928',
  'hospital': '\u75c5\u9662', 'pharmacy': '\u85ac\u5c40',
  'point_of_interest': '\u540d\u6240', 'establishment': '\u65bd\u8a2d'
};

const PRIMARY_TYPE_DICTS = { ko: PRIMARY_TYPE_KO, en: PRIMARY_TYPE_EN, ja: PRIMARY_TYPE_JA };



function localizeType(primaryType, lang) {
  if (!primaryType) return '';
  const key = String(primaryType).toLowerCase().replace(/\s+/g, '_');
  const dict = PRIMARY_TYPE_DICTS[lang] || PRIMARY_TYPE_KO;
  if (dict[key]) return dict[key];
  // Try partial match
  for (const [k, v] of Object.entries(dict)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  // Fallback to English dict if available
  if (lang !== 'en' && PRIMARY_TYPE_EN[key]) return PRIMARY_TYPE_EN[key];
  return key.replace(/_/g, ' ');
}

// ══════════════════════════════════════════════════════════════════════
// Google Maps Platform 공통 호출 헬퍼 (PLACES_PROVIDER=google 일 때만 실제 호출)
//  - Places·Geocoding·Directions·사진 요청은 모두 googleApiFetch 한 곳을 거친다.
//  - 비용 가드 ① 결제 꺼짐/권한 거부/한도 초과 응답을 받으면 30분 동안 모든 Google 호출을 건너뛴다.
//            ② 호출 상한(UTC 날짜·UTC 월 기준)을 넘으면 다음 날/다음 달까지 건너뛴다.
//               검색·지오코딩·경로: GOOGLE_DAILY_CALL_LIMIT(기본 30) / GOOGLE_MONTHLY_CALL_LIMIT(기본 900)
//               사진:              GOOGLE_PHOTO_DAILY_LIMIT(기본 30) / GOOGLE_PHOTO_MONTHLY_LIMIT(기본 900) — 사진이 검색 예산을 쓰지 않게 따로 센다.
//  - Geocoding/Directions는 HTTP 200 + status(REQUEST_DENIED 등)로 거부를 알리므로 본문까지 확인한다.
// ══════════════════════════════════════════════════════════════════════
const GOOGLE_CIRCUIT_OPEN_MS = 30 * 60_000;
const GOOGLE_REQUEST_TIMEOUT_MS = Math.min(AI_REQUEST_TIMEOUT_MS, 10_000);
const GOOGLE_CIRCUIT_REASONS = new Set(['GOOGLE_BILLING_DISABLED', 'GOOGLE_PERMISSION_DENIED', 'GOOGLE_QUOTA_EXCEEDED']);
const _googleGuard = {
  circuitUntil: 0, circuitReason: null, day: '', month: '',
  calls: 0, monthCalls: 0, photoCalls: 0, photoMonthCalls: 0,
  lastErrorCode: null, lastErrorAt: null
};
const GOOGLE_BUCKET_LIMITS = {
  search: { daily: GOOGLE_DAILY_CALL_LIMIT, monthly: GOOGLE_MONTHLY_CALL_LIMIT, dayKey: 'calls', monthKey: 'monthCalls' },
  photo: { daily: GOOGLE_PHOTO_DAILY_LIMIT, monthly: GOOGLE_PHOTO_MONTHLY_LIMIT, dayKey: 'photoCalls', monthKey: 'photoMonthCalls' }
};

class GoogleApiError extends Error {
  constructor(reasonCode, message, httpStatus = null) {
    super(message || reasonCode);
    this.name = 'GoogleApiError';
    this.reasonCode = reasonCode;
    this.httpStatus = httpStatus;
  }
}

function googleGuardState() {
  const iso = new Date().toISOString();
  const day = iso.slice(0, 10);
  const month = iso.slice(0, 7);
  if (_googleGuard.day !== day) {
    _googleGuard.day = day;
    _googleGuard.calls = 0;
    _googleGuard.photoCalls = 0;
  }
  if (_googleGuard.month !== month) {
    _googleGuard.month = month;
    _googleGuard.monthCalls = 0;
    _googleGuard.photoMonthCalls = 0;
  }
  const circuitOpen = _googleGuard.circuitUntil > Date.now();
  return {
    enabled: GOOGLE_PLACES_ENABLED,
    serverKeyConfigured: Boolean(GOOGLE_MAPS_SERVER_KEY),
    callsToday: _googleGuard.calls,
    dailyCallLimit: GOOGLE_DAILY_CALL_LIMIT,
    callsThisMonth: _googleGuard.monthCalls,
    monthlyCallLimit: GOOGLE_MONTHLY_CALL_LIMIT,
    photoCallsToday: _googleGuard.photoCalls,
    photoDailyLimit: GOOGLE_PHOTO_DAILY_LIMIT,
    photoCallsThisMonth: _googleGuard.photoMonthCalls,
    photoMonthlyLimit: GOOGLE_PHOTO_MONTHLY_LIMIT,
    countersResetOnRestart: true,
    circuitOpen,
    circuitReason: circuitOpen ? _googleGuard.circuitReason : null,
    circuitOpenUntil: circuitOpen ? new Date(_googleGuard.circuitUntil).toISOString() : null,
    lastErrorCode: _googleGuard.lastErrorCode,
    lastErrorAt: _googleGuard.lastErrorAt
  };
}

// 지금 Google을 호출하면 안 되는 이유(reasonCode). 호출해도 되면 null.
// ignoreCircuit: 진단 검사(probe)처럼 차단 중에도 1회 확인이 필요할 때만 사용(호출 상한은 그대로 적용).
// bucket: 'search'(검색·지오코딩·경로) | 'photo'(사진)
function googleBlockedReason({ ignoreCircuit = false, bucket = 'search' } = {}) {
  if (!GOOGLE_PLACES_ENABLED) return 'PROVIDER_UNAVAILABLE';
  if (!GOOGLE_MAPS_SERVER_KEY) return 'GOOGLE_KEY_MISSING';
  googleGuardState();
  if (_googleGuard.circuitUntil > Date.now() && !ignoreCircuit) return 'GOOGLE_CIRCUIT_OPEN';
  const lim = GOOGLE_BUCKET_LIMITS[bucket] || GOOGLE_BUCKET_LIMITS.search;
  const label = bucket === 'photo' ? '사진 ' : '';
  if (_googleGuard[lim.dayKey] >= lim.daily) {
    warnThrottled(`google:daily-cap:${bucket}`, `[google] 오늘(UTC) ${label}호출 상한 ${lim.daily}회에 도달해 다음 UTC 자정까지 Google ${label}호출을 건너뜁니다.`);
    return 'GOOGLE_QUOTA_EXCEEDED';
  }
  if (_googleGuard[lim.monthKey] >= lim.monthly) {
    warnThrottled(`google:monthly-cap:${bucket}`, `[google] 이번 달(UTC) ${label}호출 상한 ${lim.monthly}회에 도달해 다음 달까지 Google ${label}호출을 건너뜁니다.`);
    return 'GOOGLE_QUOTA_EXCEEDED';
  }
  return null;
}

function redactGoogleKey(text) {
  let s = String(text || '');
  if (GOOGLE_MAPS_SERVER_KEY) s = s.split(GOOGLE_MAPS_SERVER_KEY).join('***');
  return s.replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***');
}

// Google 오류 본문을 reasonCode로 분류한다. (Places(New): error.status/details[].reason, 레거시: status/error_message)
function classifyGoogleFailure(httpStatus, body) {
  const err = body && typeof body === 'object' && body.error && typeof body.error === 'object' ? body.error : null;
  const status = String(err?.status || (body && typeof body.status === 'string' ? body.status : '') || '').toUpperCase();
  const details = Array.isArray(err?.details) ? err.details : [];
  const reason = String((details.find((d) => d && d.reason) || {}).reason || '').toUpperCase();
  const message = String(err?.message || body?.error_message || '');
  const low = message.toLowerCase();
  let reasonCode = 'GOOGLE_ERROR';
  if (reason === 'BILLING_DISABLED' || low.includes('billing')) {
    reasonCode = 'GOOGLE_BILLING_DISABLED';
  } else if (httpStatus === 429 || status === 'RESOURCE_EXHAUSTED' || status === 'OVER_QUERY_LIMIT' || status === 'OVER_DAILY_LIMIT' || reason === 'RATE_LIMIT_EXCEEDED' || reason.includes('QUOTA')) {
    reasonCode = 'GOOGLE_QUOTA_EXCEEDED';
  } else if (httpStatus === 401 || httpStatus === 403 || status === 'PERMISSION_DENIED' || status === 'REQUEST_DENIED' || status === 'UNAUTHENTICATED' || reason.startsWith('API_KEY') || reason === 'SERVICE_DISABLED') {
    reasonCode = 'GOOGLE_PERMISSION_DENIED';
  }
  return { reasonCode, status, reason, message: redactGoogleKey(message).slice(0, 200) };
}

// 모든 Google Maps Platform 요청의 단일 출입구. opts: { label, method, headers, body, expect: 'json'|'image', timeoutMs, bypassCircuit, bucket: 'search'|'photo' }
async function googleApiFetch(url, opts = {}) {
  const label = opts.label || 'google';
  const bucket = opts.bucket === 'photo' ? 'photo' : 'search';
  const blocked = googleBlockedReason({ ignoreCircuit: Boolean(opts.bypassCircuit), bucket });
  if (blocked) throw new GoogleApiError(blocked, `Google ${label} skipped (${blocked})`);
  const lim = GOOGLE_BUCKET_LIMITS[bucket];
  _googleGuard[lim.dayKey] += 1;
  _googleGuard[lim.monthKey] += 1;
  let res;
  try {
    res = await fetchWithTimeout(url, {
      method: opts.method || 'GET',
      headers: { ...(opts.headers || {}) },
      body: opts.body
    }, opts.timeoutMs || GOOGLE_REQUEST_TIMEOUT_MS);
  } catch (err) {
    const msg = redactGoogleKey(err?.message || err);
    _googleGuard.lastErrorCode = 'GOOGLE_ERROR';
    _googleGuard.lastErrorAt = new Date().toISOString();
    warnThrottled('google:GOOGLE_ERROR:network', `[google] ${label} 요청 실패(네트워크/타임아웃): ${msg}`);
    throw new GoogleApiError('GOOGLE_ERROR', `Google ${label} network error`);
  }
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (opts.expect === 'image' && res.ok && contentType.startsWith('image/')) return res;
  let body = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (res.ok && opts.expect !== 'image') {
    const legacyStatus = String(body && typeof body.status === 'string' ? body.status : '').toUpperCase();
    if (!legacyStatus || legacyStatus === 'OK' || legacyStatus === 'ZERO_RESULTS' || legacyStatus === 'NOT_FOUND') {
      // 진단 검사가 성공하면(예: 결제를 켠 뒤) 차단을 바로 푼다.
      if (opts.bypassCircuit && _googleGuard.circuitUntil > Date.now()) {
        _googleGuard.circuitUntil = 0;
        _googleGuard.circuitReason = null;
        console.log(`[google] ${label} 확인 성공 — Google 호출 차단을 해제합니다.`);
      }
      return body || {};
    }
  }
  const failure = classifyGoogleFailure(res.status, body);
  if (res.ok && opts.expect === 'image') failure.message = `unexpected content-type ${contentType || '-'}`;
  _googleGuard.lastErrorCode = failure.reasonCode;
  _googleGuard.lastErrorAt = new Date().toISOString();
  if (GOOGLE_CIRCUIT_REASONS.has(failure.reasonCode)) {
    _googleGuard.circuitUntil = Date.now() + GOOGLE_CIRCUIT_OPEN_MS;
    _googleGuard.circuitReason = failure.reasonCode;
  }
  warnThrottled(
    `google:${failure.reasonCode}`,
    `[google] ${label} → HTTP ${res.status} ${failure.status || '-'} ${failure.reason || ''} ${failure.message}`.replace(/\s+/g, ' ').trim()
      + (GOOGLE_CIRCUIT_REASONS.has(failure.reasonCode) ? ' — 30분 동안 Google 호출을 건너뜁니다.' : '')
  );
  throw new GoogleApiError(failure.reasonCode, `Google ${label} ${res.status} ${failure.status || failure.reason || ''}`.trim(), res.status);
}

// Places API(New) Text Search. 결과 사진 이름은 사진 프록시 허용 목록에 등록한다.
async function googlePlacesSearchText(body, fieldMask, label = 'places:searchText', extra = {}) {
  const data = await googleApiFetch(`${PLACES_API_BASE}/v1/places:searchText`, {
    ...extra,
    label,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_SERVER_KEY,
      'X-Goog-FieldMask': fieldMask
    },
    body: JSON.stringify(body)
  });
  const places = Array.isArray(data?.places) ? data.places : [];
  places.forEach((p) => rememberPlacePhotoName(p?.photos?.[0]?.name));
  return places;
}

// Geocoding API — 첫 결과의 좌표. (결과 없음 → null)
async function googleGeocodeFirst(address, lang = 'ko') {
  const url = `${GEOCODE_API_BASE}/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=${encodeURIComponent(lang || 'ko')}&region=jp&key=${encodeURIComponent(GOOGLE_MAPS_SERVER_KEY)}`;
  const data = await googleApiFetch(url, { label: 'geocode' });
  const first = data?.results?.[0];
  const loc = first?.geometry?.location;
  if (!loc) return null;
  return { lat: Number(loc.lat), lng: Number(loc.lng), formatted: first.formatted_address || '' };
}

// ── Google 사진 프록시(/api/place-photo)용: 서버가 최근 Places 응답에서 받은 사진 이름만 허용 ──
const PLACE_PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const PLACE_PHOTO_NAME_TTL_MS = 24 * 60 * 60_000;
const PLACE_PHOTO_NAME_MAX = 5000;
const _issuedPhotoNames = new Map();

function rememberPlacePhotoName(name) {
  const n = String(name || '');
  if (!PLACE_PHOTO_NAME_RE.test(n)) return false;
  _issuedPhotoNames.delete(n);
  _issuedPhotoNames.set(n, Date.now());
  while (_issuedPhotoNames.size > PLACE_PHOTO_NAME_MAX) {
    _issuedPhotoNames.delete(_issuedPhotoNames.keys().next().value);
  }
  return true;
}

function isIssuedPlacePhotoName(name) {
  const at = _issuedPhotoNames.get(String(name || ''));
  return Boolean(at && (Date.now() - at) < PLACE_PHOTO_NAME_TTL_MS);
}

// Google 사진 → 키가 들어가지 않는 우리 서버 프록시 주소 + 촬영자 표기
function googlePhotoFields(place) {
  const photo = place?.photos?.[0];
  const name = String(photo?.name || '');
  if (!rememberPlacePhotoName(name)) return { photoUrl: null };
  const author = Array.isArray(photo.authorAttributions) ? photo.authorAttributions[0] : null;
  const authorUri = author && /^https:\/\//.test(String(author.uri || '')) ? String(author.uri) : '';
  return {
    photoUrl: `/api/place-photo?name=${encodeURIComponent(name)}&w=400`,
    photoCredit: { artist: String(author?.displayName || ''), license: 'Google Maps', filePage: authorUri, scope: 'place' }
  };
}

// ── 결과 캐시 (google 모드, 메모리 12시간) ──
const PLACES_CACHE_TTL_MS = 12 * 60 * 60_000;
const PLACES_CACHE_MAX = 300;
const _placesCache = new Map();

function placesCacheGet(key) {
  const entry = _placesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > PLACES_CACHE_TTL_MS) {
    _placesCache.delete(key);
    return null;
  }
  return entry.value;
}

function placesCacheSet(key, value) {
  _placesCache.delete(key);
  _placesCache.set(key, { at: Date.now(), value });
  while (_placesCache.size > PLACES_CACHE_MAX) {
    _placesCache.delete(_placesCache.keys().next().value);
  }
}

// allSettled 결과가 전부 실패면 첫 오류를 던지고, 아니면 성공한 값만 모은다.
function settledValuesOrThrow(settled) {
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  if (ok.length === 0 && settled.length > 0) {
    const first = settled.find((s) => s.status === 'rejected');
    throw first.reason;
  }
  return ok;
}

// ── 무료 지오코딩 (open-meteo, 키 없음·무료) — 동적 도시의 중심 좌표용, 결과는 24시간 메모리 캐시 ──
const _openMeteoGeoCache = new Map();
async function geocodeWithOpenMeteo(name, lang = 'ko') {
  const q = String(name || '').trim();
  if (!q) return null;
  const cacheKey = `${lang}|${q}`;
  const cached = _openMeteoGeoCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < 24 * 60 * 60_000) return cached.value;
  let value = null;
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=${encodeURIComponent(lang || 'ko')}&format=json&countryCode=JP`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } }, 6000);
    if (res.ok) {
      const data = await res.json();
      const hit = (Array.isArray(data?.results) ? data.results : []).find((r) => String(r.country_code || '').toUpperCase() === 'JP');
      if (hit && Number.isFinite(Number(hit.latitude)) && Number.isFinite(Number(hit.longitude))) {
        value = { lat: Number(hit.latitude), lng: Number(hit.longitude), name: String(hit.name || q) };
      }
    }
  } catch (err) {
    warnThrottled('open-meteo-geocode', `[geocode] open-meteo 지오코딩 실패: ${err.message}`);
  }
  _openMeteoGeoCache.set(cacheKey, { at: Date.now(), value });
  if (_openMeteoGeoCache.size > 500) _openMeteoGeoCache.delete(_openMeteoGeoCache.keys().next().value);
  return value;
}

// ══════════════════════════════════════════════════════════════════════
// 정적 장소 사진·좌표: assets/place-images.json (위키미디어 공용의 자유 라이선스 이미지만)
//  키: "<cityKey>|<CITY_DATA highlights의 장소 이름>" — 파일이 없으면 사진 없이 정상 동작한다.
// ══════════════════════════════════════════════════════════════════════
function cleanPlaceText(value, maxLen = 160) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLen) : '';
}

// 사진 데이터 항목 한 개를 검증해 정리한다(places·cities·foodGenres 공통).
// 사진은 위키미디어 공용(commons) 이미지 + 파일 페이지 + 라이선스가 모두 있을 때만 인정하고,
// 좌표는 일본 범위(위도 20~46.5, 경도 122~154)만 받는다. labels.en/ja(또는 nameEn/nameJa)는 선택.
function readPlaceMediaEntry(v) {
  // 위키백과 로컬(비자유) 이미지는 버린다.
  const image = typeof v.image === 'string' && /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(v.image) ? v.image : null;
  const filePage = typeof v.filePage === 'string' && /^https:\/\/commons\.wikimedia\.org\/wiki\//.test(v.filePage) ? v.filePage : '';
  const license = cleanPlaceText(v.license, 60);
  const hasPhoto = Boolean(image && filePage && license);
  const lat = typeof v.lat === 'number' && Number.isFinite(v.lat) && v.lat >= 20 && v.lat <= 46.5 ? v.lat : null;
  const lng = typeof v.lng === 'number' && Number.isFinite(v.lng) && v.lng >= 122 && v.lng <= 154 ? v.lng : null;
  const hasCoords = lat !== null && lng !== null;
  const labelsIn = v.labels && typeof v.labels === 'object' ? v.labels : {};
  return {
    image: hasPhoto ? image : null,
    filePage: hasPhoto ? filePage : '',
    license: hasPhoto ? license : '',
    artist: hasPhoto ? cleanPlaceText(v.artist, 120) : '',
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    wikidata: /^Q\d+$/.test(String(v.wikidata || '')) ? String(v.wikidata) : '',
    labels: {
      en: cleanPlaceText(labelsIn.en || v.nameEn, 80),
      ja: cleanPlaceText(labelsIn.ja || v.nameJa, 80)
    }
  };
}

function loadPlaceImages() {
  const byKey = new Map();
  const byName = new Map();
  // cities: cityKey → 도시 대표 사진(좌표가 일본 범위일 때만). foodGenres: CITY_DATA foods[].genre 원문(한국어) → 음식 예시 사진.
  const cities = new Map();
  const foodGenres = new Map();
  const fileLabel = path.relative(__dirname, PLACE_IMAGES_FILE) || PLACE_IMAGES_FILE;
  try {
    if (!fs.existsSync(PLACE_IMAGES_FILE)) {
      console.warn(`[place-images] ${fileLabel} 파일이 없어 장소 사진·좌표 없이 동작합니다.`);
      return { byKey, byName, cities, foodGenres };
    }
    const raw = JSON.parse(fs.readFileSync(PLACE_IMAGES_FILE, 'utf8').replace(/^﻿/, ''));
    const section = (name) => (raw && typeof raw[name] === 'object' && raw[name] && !Array.isArray(raw[name]) ? raw[name] : {});
    let withPhoto = 0;
    let withCoords = 0;
    let withLabels = 0;
    for (const [key, v] of Object.entries(section('places'))) {
      const sep = key.indexOf('|');
      if (sep <= 0 || !v || typeof v !== 'object') continue;
      const name = key.slice(sep + 1).trim();
      if (!name) continue;
      const entry = readPlaceMediaEntry(v);
      if (entry.image) withPhoto += 1;
      if (entry.lat !== null) withCoords += 1;
      if (entry.labels.en || entry.labels.ja) withLabels += 1;
      byKey.set(`${key.slice(0, sep).trim()}|${name}`, entry);
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(entry);
    }
    for (const [cityKey, v] of Object.entries(section('cities'))) {
      const ck = String(cityKey || '').trim();
      if (!/^[a-z0-9_]+$/.test(ck) || !v || typeof v !== 'object') continue;
      const entry = readPlaceMediaEntry(v);
      // 도시 사진은 좌표가 일본 안일 때만 쓴다(다른 나라 항목을 잘못 고른 경우를 거른다).
      if (!entry.image || entry.lat === null) continue;
      cities.set(ck, entry);
    }
    for (const [genre, v] of Object.entries(section('foodGenres'))) {
      const g = String(genre || '').trim();
      if (!g || !v || typeof v !== 'object') continue;
      const entry = readPlaceMediaEntry(v);
      if (!entry.image) continue;
      foodGenres.set(g, entry);
    }
    console.log(`[place-images] ${byKey.size}곳 로드 (사진 ${withPhoto}곳, 좌표 ${withCoords}곳, en/ja 이름 ${withLabels}곳), 도시 사진 ${cities.size}곳, 음식 장르 사진 ${foodGenres.size}개`);
  } catch (err) {
    console.warn(`[place-images] ${fileLabel}을(를) 읽지 못해 장소 사진·좌표 없이 동작합니다: ${err.message}`);
  }
  return { byKey, byName, cities, foodGenres };
}

const PLACE_IMAGES = loadPlaceImages();

// 도시 주변 실제 명소·큐레이션 명소 보충(assets/city-places.json)의 사진·좌표·en/ja 이름: place-images.json에 없는 이름만 보탠다
// (검증 규칙은 readPlaceMediaEntry 그대로 — 위키미디어 공용 사진 + 파일 페이지 + 라이선스, 일본 안 좌표).
(function mergeCityPlacesMedia() {
  const entries = [
    ...[...CITY_PLACES.cities].flatMap(([ck, c]) => c.places.map((p) => [`${ck}|${p.name}`, p.media])),
    ...CITY_PLACES.media
  ];
  const reviewed = new Set([...CITY_PLACES.media].map(([key]) => key));
  for (const [key, v] of entries) {
    if (!v) continue;
    const known = PLACE_IMAGES.byKey.get(key);
    if (known) {
      // place-images.json에 사진만 있고 좌표가 없는 큐레이션 명소(오미초 시장·모지코 레트로 등): 검토한 위키데이터 항목(media)의 좌표만 보탠다
      if (known.lat === null && reviewed.has(key)) {
        const coords = readPlaceMediaEntry(v);
        if (coords.lat !== null) Object.assign(known, { lat: coords.lat, lng: coords.lng });
      }
      continue;
    }
    const name = key.slice(key.indexOf('|') + 1);
    const entry = readPlaceMediaEntry(v);
    PLACE_IMAGES.byKey.set(key, entry);
    if (!PLACE_IMAGES.byName.has(name)) PLACE_IMAGES.byName.set(name, []);
    PLACE_IMAGES.byName.get(name).push(entry);
  }
})();

// photoCredit.scope: 'place'(그 장소 사진) | 'city'(도시 대표 사진) | 'genre'(음식 장르 예시 사진)
function mediaCredit(media, scope) {
  return { artist: media.artist, license: media.license, filePage: media.filePage, scope };
}

// 도시 대표 사진·음식 장르 사진처럼 "그 장소 자체의 사진이 아닌" 대체 사진인지
function hasFallbackPhoto(item) {
  const scope = item?.photoCredit?.scope;
  return Boolean(item?.photoUrl) && (scope === 'city' || scope === 'genre');
}

// 카드에 자기 사진이 없으면 도시 대표 사진을 붙인다(photoCredit.scope='city'). 좌표는 붙이지 않는다(도시 중심은 그 장소 위치가 아님).
function withCityPhotoFallback(item, cityKey) {
  if (!item || item.photoUrl) return item;
  const media = PLACE_IMAGES.cities.get(String(cityKey || ''));
  if (!media || !media.image) return item;
  return { ...item, photoUrl: media.image, photoCredit: mediaCredit(media, 'city') };
}

// 음식 장르 → 예시 사진. 원문(한국어) 장르, 동의어('ramen'·'寿司' → '라멘'·'스시'), en/ja 장르 표기 순으로 찾는다.
function genrePhotoFor(genre) {
  const g = String(genre || '').trim();
  if (!g) return null;
  const direct = PLACE_IMAGES.foodGenres.get(g) || PLACE_IMAGES.foodGenres.get(canonicalFoodGenre(g));
  if (direct) return direct;
  const low = g.toLowerCase();
  for (const [ko, names] of Object.entries(FOOD_GENRE_I18N)) {
    if (String(names.en || '').toLowerCase() === low || String(names.ja || '') === g) {
      return PLACE_IMAGES.foodGenres.get(ko) || null;
    }
  }
  return null;
}

// 맛집 카드에 자기 사진이 없으면 음식 장르 예시 사진을 붙인다(photoCredit.scope='genre').
function withGenrePhotoFallback(item, genre) {
  if (!item || item.photoUrl) return item;
  const media = genrePhotoFor(genre);
  if (!media) return item;
  return { ...item, photoUrl: media.image, photoCredit: mediaCredit(media, 'genre') };
}

// cityKey가 맞으면 그 항목, 아니면 이름이 한 곳에만 있을 때 그 항목.
function placeMediaFor(cityKey, name) {
  const n = String(name || '').trim();
  if (!n) return null;
  if (cityKey) {
    const hit = PLACE_IMAGES.byKey.get(`${cityKey}|${n}`);
    if (hit) return hit;
  }
  const list = PLACE_IMAGES.byName.get(n);
  return list && list.length === 1 ? list[0] : null;
}

function hasLatLng(item) {
  return item && item.lat !== null && item.lat !== undefined && item.lng !== null && item.lng !== undefined
    && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
}

// 카드에 photoUrl·photoCredit·lat·lng를 붙인다(이미 있으면 유지. 단, 도시·장르 대체 사진은 그 장소 사진으로 바꾼다).
function attachPlaceMedia(item, cityKey, lookupName) {
  if (!item) return item;
  const media = placeMediaFor(cityKey, lookupName || item.name);
  if (!media) return item;
  const out = { ...item };
  if ((!out.photoUrl || hasFallbackPhoto(out)) && media.image) {
    out.photoUrl = media.image;
    out.photoCredit = mediaCredit(media, 'place');
  }
  if (!hasLatLng(out) && media.lat !== null) {
    out.lat = media.lat;
    out.lng = media.lng;
  }
  if (media.wikidata && !out.wikidata) out.wikidata = media.wikidata;
  return out;
}

// ── 내장 큐레이션 데이터의 en/ja 표기 (데이터가 있는 곳만; 없으면 원문 유지) ──
const CURATED_PLACE_I18N = {
  'tokyo|센소지': { en: 'Senso-ji Temple', ja: '浅草寺' },
  'tokyo|시부야 스카이': { en: 'Shibuya Sky', ja: '渋谷スカイ' },
  'tokyo|메이지 신궁': { en: 'Meiji Jingu Shrine', ja: '明治神宮' },
  'tokyo|츠키지 외시장': { en: 'Tsukiji Outer Market', ja: '築地場外市場' },
  'tokyo|긴자 식스': { en: 'Ginza Six', ja: 'GINZA SIX' },
  'tokyo|오다이바 해변공원': { en: 'Odaiba Marine Park', ja: 'お台場海浜公園' },
  'osaka|오사카성': { en: 'Osaka Castle', ja: '大阪城' },
  'osaka|도톤보리': { en: 'Dotonbori', ja: '道頓堀' },
  'osaka|우메다 스카이 빌딩': { en: 'Umeda Sky Building', ja: '梅田スカイビル' },
  'osaka|신세카이': { en: 'Shinsekai', ja: '新世界' },
  'kyoto|후시미 이나리': { en: 'Fushimi Inari Taisha', ja: '伏見稲荷大社' },
  'kyoto|기요미즈데라': { en: 'Kiyomizu-dera Temple', ja: '清水寺' },
  'kyoto|아라시야마 대나무숲': { en: 'Arashiyama Bamboo Grove', ja: '嵐山 竹林の小径' },
  // 사진 데이터(place-images.json)에 en/ja 이름이 없는 명소(설명형 이름이거나 위키 문서가 없는 곳)
  // (설명형 이름이던 명소 — '이와테 산책로'·'섬 해안 절벽' 등 — 는 도시 데이터에서 지우고 위키데이터의 실제 명소로 바꿨다: assets/city-places.json)
  'akita|아키타 현립 미술관': { en: 'Akita Museum of Art', ja: '秋田県立美術館' },
  'hanamaki|하나마키 온천': { en: 'Hanamaki Onsen', ja: '花巻温泉' },
  'hanamaki|미야자와 겐지 기념관': { en: 'Miyazawa Kenji Memorial Museum', ja: '宮沢賢治記念館' },
  'matsuyama|보찬 열차': { en: 'Botchan Train', ja: '坊っちゃん列車' },
  'miyazaki|선멧세 니치난': { en: 'Sun Messe Nichinan', ja: 'サンメッセ日南' },
  'kushiro|와쇼 시장': { en: 'Washo Market', ja: '釧路和商市場' },
  'ibaraki|오아라이 해변': { en: 'Ōarai Coast', ja: '大洗海岸' },
  'matsumoto|나카마치 거리': { en: 'Nakamachi Street', ja: '中町通り' },
  'iwakuni|시라헤비 신사': { en: 'Iwakuni White Snake Shrine', ja: '岩国白蛇神社' },
  'yamaguchi_ube|도키와 공원': { en: 'Tokiwa Park', ja: 'ときわ公園' },
  'amami|아야마루 곶': { en: 'Cape Ayamaru', ja: 'あやまる岬' },
  'shimojishima|17END 비치': { en: '17END Beach', ja: '17END' },
  'tokunoshima|무시로세 해안': { en: 'Mushirose coast', ja: 'ムシロ瀬' },
  // 사진 데이터의 위키데이터 이름이 카드 대상과 다른 명소(성·단체·산 이름 대신 카드가 가리키는 곳의 이름)
  'akita|센슈공원': { en: 'Senshu Park', ja: '千秋公園' },
  'odate|아키타견 박물관': { en: 'Akita Dog Museum', ja: '秋田犬会館' },
  'kanazawa|히가시차야 거리': { en: 'Higashi Chaya District', ja: 'ひがし茶屋街' },
  'kobe|기타노 이진칸': { en: 'Kitano Ijinkan', ja: '北野異人館' },
  'tokyo|우에노 공원': { en: 'Ueno Park', ja: '上野公園' },
  'kyoto|금각사': { ja: '金閣寺' },
  'memanbetsu|시레토코 자연길': { en: 'Shiretoko nature trail', ja: '知床の自然散策路' },
  'hakodate|하코다테 야경': { en: 'Mount Hakodate night view', ja: '函館山の夜景' },
  'kitakyushu|사라쿠라산 야경': { en: 'Mount Sarakura night view', ja: '皿倉山の夜景' },
  'okadama|오도리 야경': { en: 'Odori Park night view', ja: '大通公園の夜景' },
  'izumo|신지호 석양': { en: 'Lake Shinji sunset', ja: '宍道湖の夕日' },
  'kagoshima|이부스키 모래찜': { en: 'Ibusuki sand bath', ja: '指宿の砂むし温泉' },
  'asahikawa|후라노 라벤더밭': { en: 'Furano lavender fields', ja: '富良野のラベンダー畑' },
  // 위키데이터 정식 이름(旭川市旭山動物園)보다 널리 쓰는 이름: '旭川旭山動物園'·'旭山動物園'이 이 동물원이다
  'asahikawa|아사히야마 동물원': { en: 'Asahiyama Zoo', ja: '旭山動物園' },
  'yakushima|조몬스기 트레일': { en: 'Jōmon Sugi trail', ja: '縄文杉トレッキング' },
  'yonaguni|일본 최서단 기념비': { en: 'Westernmost Point of Japan monument', ja: '日本最西端の碑' },
  'yonaguni|해저 지형 다이빙': { en: 'Yonaguni Monument dive', ja: '与那国島海底地形ダイビング' },
  'rishiri|리시리산 전망': { en: 'Mount Rishiri viewpoint', ja: '利尻山の眺望' }
};
// 추가 명소(EXTRA_PLACES)의 en/ja 이름도 같은 표로 찾는다(카드·일정·칩 현지화, en/ja 이름 → 원래 이름)
for (const e of EXTRA_PLACES) {
  const key = `${e.cityKey}|${e.name}`;
  if (!CURATED_PLACE_I18N[key] && (e.en || e.ja)) CURATED_PLACE_I18N[key] = { ...(e.en ? { en: e.en } : {}), ...(e.ja ? { ja: e.ja } : {}) };
}

const CURATED_AREA_I18N = {
  '아사쿠사': { en: 'Asakusa', ja: '浅草' }, '시부야': { en: 'Shibuya', ja: '渋谷' }, '하라주쿠': { en: 'Harajuku', ja: '原宿' },
  '츠키지': { en: 'Tsukiji', ja: '築地' }, '긴자': { en: 'Ginza', ja: '銀座' }, '오다이바': { en: 'Odaiba', ja: 'お台場' },
  '신주쿠': { en: 'Shinjuku', ja: '新宿' }, '에비스': { en: 'Ebisu', ja: '恵比寿' }, '주오구': { en: 'Chuo Ward', ja: '中央区' },
  '난바': { en: 'Namba', ja: '難波' }, '우메다': { en: 'Umeda', ja: '梅田' }, '에비스초': { en: 'Ebisucho', ja: '恵美須町' },
  '신세카이': { en: 'Shinsekai', ja: '新世界' }, '후시미': { en: 'Fushimi', ja: '伏見' }, '히가시야마': { en: 'Higashiyama', ja: '東山' },
  '아라시야마': { en: 'Arashiyama', ja: '嵐山' }, '기온': { en: 'Gion', ja: '祇園' }, '사쿄구': { en: 'Sakyo Ward', ja: '左京区' },
  '신사이바시': { en: 'Shinsaibashi', ja: '心斎橋' }, '덴노지': { en: 'Tennoji', ja: '天王寺' }, '가와라마치': { en: 'Kawaramachi', ja: '河原町' },
  '오도리': { en: 'Odori', ja: '大通' }, '스스키노': { en: 'Susukino', ja: 'すすきの' }, '조잔케이': { en: 'Jozankei', ja: '定山渓' },
  '하카타': { en: 'Hakata', ja: '博多' }, '텐진': { en: 'Tenjin', ja: '天神' }, '모모치': { en: 'Momochi', ja: '百道' },
  '사카에': { en: 'Sakae', ja: '栄' }, '나고야역': { en: 'Nagoya Station', ja: '名古屋駅' }, '오스': { en: 'Osu', ja: '大須' },
  '나하': { en: 'Naha', ja: '那覇' }, '차탄': { en: 'Chatan', ja: '北谷' }, '온나': { en: 'Onna', ja: '恩納' },
  '나카구': { en: 'Naka Ward', ja: '中区' }, '미야지마': { en: 'Miyajima', ja: '宮島' }, '히로시마역': { en: 'Hiroshima Station', ja: '広島駅' },
  '겐로쿠엔': { en: 'Kenrokuen', ja: '兼六園' }, '히가시차야': { en: 'Higashi Chaya', ja: 'ひがし茶屋街' }, '오미초': { en: 'Omicho', ja: '近江町' },
  '아오바구': { en: 'Aoba Ward', ja: '青葉区' }, '고쿠분초': { en: 'Kokubuncho', ja: '国分町' }, '마쓰시마': { en: 'Matsushima', ja: '松島' },
  '산노미야': { en: 'Sannomiya', ja: '三宮' }, '모자이크': { en: 'Mosaic', ja: 'モザイク' }, '기타노': { en: 'Kitano', ja: '北野' },
  // 명소의 실제 지역(도시 프로필 sightXMeta·대표 명소 area)
  '하코다테역': { en: 'Hakodate Station', ja: '函館駅' }, '모토마치': { en: 'Motomachi', ja: '元町' }, '고료카쿠': { en: 'Goryokaku', ja: '五稜郭' },
  '아사히야마': { en: 'Asahiyama', ja: '旭山' }, '평화거리': { en: 'Heiwa-dori', ja: '平和通' }, '나가야마': { en: 'Nagayama', ja: '永山' },
  '아오모리역': { en: 'Aomori Station', ja: '青森駅' }, '산나이마루야마': { en: 'Sannai-Maruyama', ja: '三内丸山' }, '야마데라': { en: 'Yamadera', ja: '山寺' },
  '우라반다이': { en: 'Urabandai', ja: '裏磐梯' }, '시모고': { en: 'Shimogo', ja: '下郷' }, '다테야마': { en: 'Tateyama', ja: '立山' },
  '도야마역': { en: 'Toyama Station', ja: '富山駅' }, '니혼다이라': { en: 'Nihondaira', ja: '日本平' }, '고라쿠엔': { en: 'Korakuen', ja: '後楽園' },
  '이즈모타이샤': { en: 'Izumo Taisha', ja: '出雲大社' }, '신지호': { en: 'Lake Shinji', ja: '宍道湖' }, '카츠라하마': { en: 'Katsurahama', ja: '桂浜' },
  '히로메시장': { en: 'Hirome Market', ja: 'ひろめ市場' }, '나루토': { en: 'Naruto', ja: '鳴門' }, '비잔': { en: 'Mount Bizan', ja: '眉山' },
  '우라카미': { en: 'Urakami', ja: '浦上' }, '니치난': { en: 'Nichinan', ja: '日南' }, '이소': { en: 'Iso', ja: '磯' },
  '모토부': { en: 'Motobu', ja: '本部' }, '소야곶': { en: 'Cape Soya', ja: '宗谷岬' }, '노샷푸': { en: 'Noshappu', ja: 'ノシャップ' },
  '왓카나이역': { en: 'Wakkanai Station', ja: '稚内駅' }, '리시리후지': { en: 'Rishirifuji', ja: '利尻富士' }, '오시도마리': { en: 'Oshidomari', ja: '鴛泊' },
  '습원': { en: 'Kushiro Marsh', ja: '釧路湿原' }, '누사마이': { en: 'Nusamai', ja: '幣舞' }, '와쇼시장': { en: 'Washo Market', ja: '和商市場' },
  '네무로': { en: 'Nemuro', ja: '根室' }, '히가시구': { en: 'Higashi Ward', ja: '東区' }, '도와다': { en: 'Towada', ja: '十和田' },
  '카즈노': { en: 'Kazuno', ja: '鹿角' }, '데와산잔': { en: 'Dewa Sanzan', ja: '出羽三山' }, '쓰루오카': { en: 'Tsuruoka', ja: '鶴岡' },
  '사카타': { en: 'Sakata', ja: '酒田' }, '히타치나카': { en: 'Hitachinaka', ja: 'ひたちなか' }, '가미코치': { en: 'Kamikochi', ja: '上高地' },
  '하버랜드': { en: 'Harborland', ja: 'ハーバーランド' }, '신고베': { en: 'Shin-Kobe', ja: '新神戸' }, '기노사키': { en: 'Kinosaki', ja: '城崎' },
  '도요오카': { en: 'Toyooka', ja: '豊岡' }, '이즈시': { en: 'Izushi', ja: '出石' }, '이와미': { en: 'Iwami', ja: '岩美' },
  '돗토리 사구': { en: 'Tottori Sand Dunes', ja: '鳥取砂丘' }, '아키요시다이': { en: 'Akiyoshidai', ja: '秋吉台' }, '우베': { en: 'Ube', ja: '宇部' },
  '모지코': { en: 'Mojiko', ja: '門司港' }, '고쿠라': { en: 'Kokura', ja: '小倉' }, '시라타니': { en: 'Shiratani', ja: '白谷' },
  '아나보': { en: 'Anbo', ja: '安房' }, '구리오': { en: 'Kurio', ja: '栗生' }, '우주센터': { en: 'Space Center', ja: '宇宙センター' },
  '니시노오모테': { en: 'Nishinoomote', ja: '西之表' }, '이케마': { en: 'Ikema', ja: '池間' }, '쿠리마': { en: 'Kurima', ja: '来間' },
  '구스쿠베': { en: 'Gusukube', ja: '城辺' }, '카비라': { en: 'Kabira', ja: '川平' }, '이시가키시': { en: 'Ishigaki City', ja: '石垣市' },
  '시모지': { en: 'Shimoji', ja: '下地' }, '이라부': { en: 'Irabu', ja: '伊良部' }, '산호초': { en: 'Coral reef', ja: 'サンゴ礁' },
  '구메지마시': { en: 'Kumejima town', ja: '久米島町' }, '해변': { en: 'Beach', ja: 'ビーチ' }, '숲길': { en: 'Forest trail', ja: '森の小径' },
  '아마기': { en: 'Amagi', ja: '天城' },
  '지바 우라야스': { en: 'Urayasu, Chiba', ja: '千葉県浦安市' }, '야마나시 후지요시다': { en: 'Fujiyoshida, Yamanashi', ja: '山梨県富士吉田市' },
  '네리마': { en: 'Nerima', ja: '練馬' }, '가나가와 가마쿠라': { en: 'Kamakura, Kanagawa', ja: '神奈川県鎌倉市' },
  '가나가와 후지사와': { en: 'Fujisawa, Kanagawa', ja: '神奈川県藤沢市' }, '군마 쿠사츠': { en: 'Kusatsu, Gunma', ja: '群馬県草津町' },
  '미에 구와나': { en: 'Kuwana, Mie', ja: '三重県桑名市' }, '아이치 나가쿠테': { en: 'Nagakute, Aichi', ja: '愛知県長久手市' },
  '기후 게로': { en: 'Gero, Gifu', ja: '岐阜県下呂市' }, '기후 시라카와고': { en: 'Shirakawa-go, Gifu', ja: '岐阜県白川郷' },
  '노보리베츠': { en: 'Noboribetsu', ja: '登別' }, '오타루': { en: 'Otaru', ja: '小樽' }, '노토': { en: 'Noto', ja: '能登' },
  '후라노': { en: 'Furano', ja: '富良野' }, '비에이': { en: 'Biei', ja: '美瑛' }, '와카야마 다나베': { en: 'Tanabe, Wakayama', ja: '和歌山県田辺市' },
  '시레토코': { en: 'Shiretoko', ja: '知床' }, '아소': { en: 'Aso', ja: '阿蘇' }, '오바나자와': { en: 'Obanazawa', ja: '尾花沢' },
  '나가노 야마노우치': { en: 'Yamanouchi, Nagano', ja: '長野県山ノ内町' }, '다자이후': { en: 'Dazaifu', ja: '太宰府' },
  '유후인': { en: 'Yufuin', ja: '湯布院' }, '아리마': { en: 'Arima', ja: '有馬' }, '벳푸': { en: 'Beppu', ja: '別府' },
  // 추가 명소(EXTRA_PLACES)의 지역
  '우에노': { en: 'Ueno', ja: '上野' }, '도요스': { en: 'Toyosu', ja: '豊洲' }, '오시아게': { en: 'Oshiage', ja: '押上' },
  '이케부쿠로': { en: 'Ikebukuro', ja: '池袋' }, '롯폰기': { en: 'Roppongi', ja: '六本木' }, '덴포잔': { en: 'Tempozan', ja: '天保山' },
  '텐진바시': { en: 'Tenjinbashi', ja: '天神橋' }, '닛폰바시': { en: 'Nipponbashi', ja: '日本橋' }, '우메코지': { en: 'Umekoji', ja: '梅小路' },
  '가라스마오이케': { en: 'Karasuma Oike', ja: '烏丸御池' }, '니조': { en: 'Nijo', ja: '二条' }, '니시구': { en: 'Nishi Ward', ja: '西区' },
  '우미노나카미치': { en: 'Uminonakamichi', ja: '海の中道' }, '나카스카와바타': { en: 'Nakasu-Kawabata', ja: '中洲川端' }, '도미구스쿠': { en: 'Tomigusuku', ja: '豊見城' },
  '가나가와 하코네': { en: 'Hakone, Kanagawa', ja: '神奈川県箱根町' }, '나라': { en: 'Nara', ja: '奈良' },
  // 공항 없는 인기 여행지(당일치기 대표 명소)의 지역
  '도치기 닛코': { en: 'Nikko, Tochigi', ja: '栃木県日光市' }, '나가노 가루이자와': { en: 'Karuizawa, Nagano', ja: '長野県軽井沢町' },
  '야마나시 후지카와구치코': { en: 'Fujikawaguchiko, Yamanashi', ja: '山梨県富士河口湖町' }, '기후 다카야마': { en: 'Takayama, Gifu', ja: '岐阜県高山市' },
  '미에 이세': { en: 'Ise, Mie', ja: '三重県伊勢市' }, '효고 히메지': { en: 'Himeji, Hyogo', ja: '兵庫県姫路市' }, '우지': { en: 'Uji', ja: '宇治' },
  '교토 미야즈': { en: 'Miyazu, Kyoto', ja: '京都府宮津市' }, '와카야마 고야': { en: 'Koya, Wakayama', ja: '和歌山県高野町' },
  '가가와 나오시마': { en: 'Naoshima, Kagawa', ja: '香川県直島町' }, '구마모토 미나미오구니': { en: 'Minamioguni, Kumamoto', ja: '熊本県南小国町' },
  '나가노': { en: 'Nagano', ja: '長野' }, '쿠라시키': { en: 'Kurashiki', ja: '倉敷' }
};
// 도시 주변 실제 명소(assets/city-places.json)의 지역(위키데이터 P131의 이름): 표에 없는 것만 보탠다
for (const e of EXTRA_PLACES) {
  if (!e.generated || !e.area || CURATED_AREA_I18N[e.area] || !e.areaEn || !e.areaJa) continue;
  CURATED_AREA_I18N[e.area] = { en: e.areaEn, ja: e.areaJa };
}

const CURATED_CATEGORY_I18N = {
  '문화': { en: 'Culture', ja: '文化' }, '전망': { en: 'Viewpoint', ja: '展望' }, '자연': { en: 'Nature', ja: '自然' },
  '미식': { en: 'Food', ja: 'グルメ' }, '쇼핑': { en: 'Shopping', ja: 'ショッピング' }, '산책': { en: 'Walk', ja: '散策' },
  '트레킹': { en: 'Hiking', ja: 'トレッキング' }, '야경': { en: 'Night view', ja: '夜景' }, '로컬': { en: 'Local', ja: 'ローカル' },
  '명소': { en: 'Landmark', ja: '名所' }, '관광': { en: 'Sightseeing', ja: '観光' }, '도심 산책': { en: 'City walk', ja: '街歩き' },
  '요청 명소': { en: 'Requested spot', ja: 'リクエストした名所' }, '대표 명소': { en: 'Top sight', ja: '定番スポット' },
  '추천 여행지': { en: 'Recommended spot', ja: 'おすすめスポット' },
  // 추가 명소(EXTRA_PLACES)·도시 주변 실제 명소(assets/city-places.json)의 분류
  '박물관': { en: 'Museum', ja: '博物館' }, '미술관': { en: 'Art museum', ja: '美術館' }, '수족관': { en: 'Aquarium', ja: '水族館' },
  '동물원': { en: 'Zoo', ja: '動物園' }, '온천': { en: 'Hot spring', ja: '温泉' }, '시장': { en: 'Market', ja: '市場' },
  '정원': { en: 'Garden', ja: '庭園' }, '체험': { en: 'Experience', ja: '体験' }, '전시': { en: 'Exhibition', ja: '展示' },
  '테마파크': { en: 'Theme park', ja: 'テーマパーク' }
};

// 내장 맛집 이름 en/ja (도쿄·오사카·교토). 나머지는 도시 공통 이름 규칙(로컬 이자카야·대표 라멘)만 바꾸고 원문 유지.
const CURATED_FOOD_I18N = {
  'tokyo|스시다이': { en: 'Sushi Dai', ja: '寿司大' },
  'tokyo|아후리 라멘': { en: 'AFURI Ramen', ja: 'AFURI' },
  'tokyo|토리키조쿠': { en: 'Torikizoku', ja: '鳥貴族' },
  'osaka|쿠시카츠 다루마': { en: 'Kushikatsu Daruma', ja: '串かつだるま' },
  'osaka|타코야키 주하치반': { en: 'Takoyaki Juhachiban', ja: 'たこ焼十八番' },
  'osaka|후쿠타로 오코노미야키': { en: 'Fukutaro Okonomiyaki', ja: 'お好み焼 福太郎' },
  'kyoto|오멘 긴카쿠지': { en: 'Omen Ginkakuji', ja: 'おめん 銀閣寺本店' },
  'kyoto|기온 우오신': { en: 'Gion Uoshin', ja: 'Gion Uoshin' }
};

// 도쿄·오사카·교토 밖 도시(JAPAN_CITY_PROFILES foodA/foodB)의 내장 맛집·음식 이름 en/ja. 도시와 상관없이 이름으로 찾는다.
const REGIONAL_FOOD_I18N = {
  '스프카레 GARAKU': { en: 'Soup Curry GARAKU', ja: 'スープカレー GARAKU' }, '스미레 라멘': { en: 'Sumire Ramen', ja: 'すみれ' },
  '하코다테 카이센동': { en: 'Hakodate kaisendon', ja: '函館の海鮮丼' }, '시오라멘': { en: 'Shio ramen', ja: '塩ラーメン' },
  '아사히카와 라멘': { en: 'Asahikawa ramen', ja: '旭川ラーメン' }, '징기스칸': { en: 'Jingisukan grilled lamb', ja: 'ジンギスカン' },
  '아오모리 사과 디저트': { en: 'Aomori apple desserts', ja: '青森りんごスイーツ' }, '해산물 시장': { en: 'Seafood market', ja: '海鮮市場' },
  '기리탄포': { en: 'Kiritanpo', ja: 'きりたんぽ' }, '이나니와 우동': { en: 'Inaniwa udon', ja: '稲庭うどん' },
  '완코소바': { en: 'Wanko soba', ja: 'わんこそば' }, '모리오카 냉면': { en: 'Morioka reimen', ja: '盛岡冷麺' },
  '이모니': { en: 'Imoni stew', ja: '芋煮' }, '야마가타 소바': { en: 'Yamagata soba', ja: '山形そば' },
  '규탄 전문점': { en: 'Gyutan beef tongue restaurant', ja: '牛たん専門店' }, '즈다모치 카페': { en: 'Zunda mochi café', ja: 'ずんだ餅カフェ' },
  '키타카타 라멘': { en: 'Kitakata ramen', ja: '喜多方ラーメン' }, '소스카츠동': { en: 'Sauce katsudon', ja: 'ソースカツ丼' },
  '니가타 돈부리': { en: 'Niigata rice bowl', ja: '新潟の丼もの' }, '니혼슈 바': { en: 'Sake bar', ja: '日本酒バー' },
  '카나자와 스시': { en: 'Kanazawa sushi', ja: '金沢の寿司' }, '노도구로 구이': { en: 'Grilled nodoguro seaperch', ja: 'のどぐろの塩焼き' },
  '시로에비': { en: 'Shiro-ebi white shrimp', ja: '白えび' }, '부리 샤브': { en: 'Buri shabu-shabu', ja: 'ぶりしゃぶ' },
  '사쿠라에비': { en: 'Sakura shrimp', ja: '桜えび' }, '우나기 덮밥': { en: 'Unagi rice bowl', ja: 'うなぎ丼' },
  '미소카츠': { en: 'Miso katsu', ja: '味噌カツ' }, '히츠마부시': { en: 'Hitsumabushi', ja: 'ひつまぶし' },
  '바라즈시': { en: 'Barazushi', ja: 'ばら寿司' }, '데미카츠동': { en: 'Demi-katsudon', ja: 'デミカツ丼' },
  '히로시마 오코노미야키': { en: 'Hiroshima okonomiyaki', ja: '広島お好み焼き' }, '굴 요리': { en: 'Oyster dishes', ja: '牡蠣料理' },
  '게 요리': { en: 'Crab dishes', ja: 'カニ料理' }, '회덮밥': { en: 'Sashimi rice bowl', ja: '海鮮丼' },
  '이즈모 소바': { en: 'Izumo soba', ja: '出雲そば' }, '젠자이': { en: 'Zenzai sweet red bean soup', ja: 'ぜんざい' },
  '사누키 우동': { en: 'Sanuki udon', ja: '讃岐うどん' }, '올리브 소고기': { en: 'Olive beef', ja: 'オリーブ牛' },
  '도미밥': { en: 'Taimeshi sea bream rice', ja: '鯛めし' }, '쟈코텐': { en: 'Jakoten', ja: 'じゃこ天' },
  '가츠오 타타키': { en: 'Katsuo tataki', ja: 'かつおのたたき' }, '사와치 요리': { en: 'Sawachi platter', ja: '皿鉢料理' },
  '도쿠시마 라멘': { en: 'Tokushima ramen', ja: '徳島ラーメン' }, '아와규': { en: 'Awa beef', ja: '阿波牛' },
  '하카타 라멘': { en: 'Hakata ramen', ja: '博多ラーメン' }, '모츠나베': { en: 'Motsunabe', ja: 'もつ鍋' },
  '짬뽕': { en: 'Champon', ja: 'ちゃんぽん' }, '카스테라': { en: 'Castella', ja: 'カステラ' },
  '바사시': { en: 'Basashi horse sashimi', ja: '馬刺し' }, '구마모토 라멘': { en: 'Kumamoto ramen', ja: '熊本ラーメン' },
  '도리텐': { en: 'Toriten', ja: 'とり天' }, '벳푸 냉면': { en: 'Beppu reimen', ja: '別府冷麺' },
  '치킨난반': { en: 'Chicken nanban', ja: 'チキン南蛮' }, '미야자키 소고기': { en: 'Miyazaki beef', ja: '宮崎牛' },
  '쿠로부타 돈카츠': { en: 'Kurobuta tonkatsu', ja: '黒豚とんかつ' }, '사츠마아게': { en: 'Satsuma-age', ja: 'さつま揚げ' },
  '사쓰마아게': { en: 'Satsuma-age', ja: 'さつま揚げ' }, '오키나와 소바': { en: 'Okinawa soba', ja: '沖縄そば' },
  '고야참푸루': { en: 'Goya champuru', ja: 'ゴーヤーチャンプルー' }, '부타동': { en: 'Butadon pork rice bowl', ja: '豚丼' },
  '유제품 디저트': { en: 'Dairy desserts', ja: '乳製品スイーツ' }, '해산물 덮밥': { en: 'Seafood rice bowl', ja: '海鮮丼' },
  '홋카이도 우유 디저트': { en: 'Hokkaido milk desserts', ja: '北海道ミルクスイーツ' }, '리시리 다시 라멘': { en: 'Rishiri kelp-broth ramen', ja: '利尻昆布ラーメン' },
  '성게 요리': { en: 'Sea urchin dishes', ja: 'ウニ料理' }, '현지 버거': { en: 'Local burger', ja: 'ご当地バーガー' },
  '카이센동': { en: 'Kaisendon', ja: '海鮮丼' }, '로바타야키': { en: 'Robatayaki', ja: '炉端焼き' },
  '치즈 플래터': { en: 'Cheese platter', ja: 'チーズプレート' }, '우유 아이스크림': { en: 'Milk ice cream', ja: 'ミルクアイス' },
  '수프카레': { en: 'Soup curry', ja: 'スープカレー' }, '사과 디저트': { en: 'Apple desserts', ja: 'りんごスイーツ' },
  '히메마스 요리': { en: 'Himemasu trout dishes', ja: 'ヒメマス料理' }, '히나이 토리': { en: 'Hinai chicken', ja: '比内地鶏' },
  '쇼진요리': { en: 'Shojin ryori temple cuisine', ja: '精進料理' }, '아귀 전골': { en: 'Anko nabe anglerfish hotpot', ja: 'あんこう鍋' },
  '낫토 정식': { en: 'Natto set meal', ja: '納豆定食' }, '신슈 소바': { en: 'Shinshu soba', ja: '信州そば' },
  '해산물 정식': { en: 'Seafood set meal', ja: '海鮮定食' }, '온천 달걀 요리': { en: 'Onsen egg dishes', ja: '温泉卵料理' },
  '고베규 스테이크': { en: 'Kobe beef steak', ja: '神戸牛ステーキ' }, '아카시야키': { en: 'Akashiyaki', ja: '明石焼き' },
  '카니 요리': { en: 'Crab dishes', ja: 'カニ料理' }, '다지마규 구이': { en: 'Grilled Tajima beef', ja: '但馬牛の焼肉' },
  '배 디저트': { en: 'Pear desserts', ja: '梨スイーツ' }, '이와쿠니 스시': { en: 'Iwakuni sushi', ja: '岩国寿司' },
  '연근 요리': { en: 'Lotus root dishes', ja: 'れんこん料理' }, '복어 요리': { en: 'Fugu dishes', ja: 'ふぐ料理' },
  '가와라소바': { en: 'Kawara soba', ja: '瓦そば' }, '야키카레': { en: 'Yaki-curry', ja: '焼きカレー' },
  '우동': { en: 'Udon', ja: 'うどん' }, '사가규': { en: 'Saga beef', ja: '佐賀牛' },
  '온천 두부': { en: 'Onsen yudofu hot-spring tofu', ja: '温泉湯どうふ' }, '케이한': { en: 'Keihan chicken rice soup', ja: '鶏飯' },
  '흑설탕 디저트': { en: 'Brown sugar desserts', ja: '黒糖スイーツ' }, '토비우오 요리': { en: 'Flying fish dishes', ja: 'トビウオ料理' },
  '현지 해산물 덮밥': { en: 'Local seafood rice bowl', ja: '地元の海鮮丼' }, '고구마 디저트': { en: 'Sweet potato desserts', ja: 'さつまいもスイーツ' },
  '미야코소바': { en: 'Miyako soba', ja: '宮古そば' }, '해산물 BBQ': { en: 'Seafood BBQ', ja: '海鮮バーベキュー' },
  '야에야마 소바': { en: 'Yaeyama soba', ja: '八重山そば' }, '이시가키규 스테이크': { en: 'Ishigaki beef steak', ja: '石垣牛ステーキ' },
  '섬 생선 요리': { en: 'Island fish dishes', ja: '島魚料理' }, '트로피컬 디저트': { en: 'Tropical desserts', ja: 'トロピカルスイーツ' },
  '현지 소바': { en: 'Local soba', ja: '地元のそば' }, '바다포도 샐러드': { en: 'Sea grape salad', ja: '海ぶどうサラダ' },
  '섬 해산물 정식': { en: 'Island seafood set meal', ja: '島の海鮮定食' }, '현지 디저트': { en: 'Local desserts', ja: '地元のスイーツ' },
  '섬 소바': { en: 'Island soba', ja: '島そば' }, '가쓰오 요리': { en: 'Bonito dishes', ja: 'カツオ料理' },
  '향토 정식': { en: 'Local set meal', ja: '郷土料理の定食' }
};

// 한글 도시 이름(CITY_DATA label) → cityKey (정확히 같은 이름만)
function cityKeyForExactLabel(label) {
  const target = String(label || '').trim();
  if (!target) return '';
  for (const [k, v] of Object.entries(CITY_DATA)) {
    if (String(v.label || '').trim() === target) return k;
  }
  return '';
}

function localizeCuratedFoodName(name, cityKey, lang) {
  const n = String(name || '');
  if (!n || lang === 'ko') return n;
  const hit = CURATED_FOOD_I18N[`${cityKey}|${n}`] || REGIONAL_FOOD_I18N[n];
  if (hit && hit[lang]) return hit[lang];
  // 도시 공통 '찾기' 안내('<도시> 이자카야 찾기 (<지역> 주변)') → 'Find an izakaya near <area>' / '<area>周辺で居酒屋を探す'
  const generic = GENERIC_FOOD_NAME_RE.exec(n);
  if (generic) {
    const kind = generic[2] === '이자카야' ? 'izakaya' : 'ramen';
    const cityName = CITY_DATA[cityKey] ? localizedCityName(cityKey, lang) : '';
    const area = localizeCuratedArea(generic[3], lang, cityName) || cityName;
    const K = GENERIC_FOOD_KINDS[kind];
    return lang === 'ja' ? `${area}周辺で${K.ja}を探す` : `Find ${K.en} near ${area}`;
  }
  return n;
}

// ── 규칙 기반 일정 문구 (시간대 단어 오전/오후/저녁은 화면 형식이라 모든 언어에서 그대로 둔다) ──
const RULE_PLAN_TEXT = {
  ko: {
    freeTime: '자유 일정',
    walkAround: (area) => `${area} 주변 산책`,
    cafeWalk: (city) => `${city} 여유 산책·카페`,
    restDay: (city) => `${city} 휴식일: 카페/산책 중심으로 여유 일정`,
    transitOnly: '대중교통 중심으로 가까운 동선만 이동',
    freeRest: '자유 휴식',
    localFood: (city) => `${city} 로컬 미식 동선`,
    localDinner: (area) => `${area} 현지 식사`,
    cafeDessert: (city) => `${city} 감성 카페/디저트`,
    transfer: (from, to, hint) => `도시 이동: ${from} -> ${to} (${hint})`,
    arrivalRest: '도착 후 이동/체크인 및 휴식',
    checkoutAirport: '체크아웃 & 공항 이동',
    departurePrep: '출국 준비 및 공항 이동',
    summary: (city, days, withFlight) => `${city} ${days}일 맞춤 일정${withFlight ? ' (항공권 시간 반영)' : ''}`,
    tips: {
      base: ['첫날은 공항-도심 이동 시간을 최소 2시간 확보', '핫플은 오픈 직후 또는 20시 이후 방문 추천', '하루 도보 18,000보 이상이면 다음날 오전 일정 완화 권장'],
      arrival: (t) => `도착 ${t} + 이동시간 90분 기준으로 첫날 일정 시작`,
      departure: (t) => `출국 ${t} 2시간 전 공항 도착 기준으로 마지막날 조정`,
      airportBuffer: (m) => `마지막날 공항 도착 버퍼 ${m}분 반영`,
      indoorFocus: '우천 가능성을 고려해 실내 비중을 높여 구성',
      removeShopping: '쇼핑 동선 제외 후 관광/체험 중심으로 구성',
      optimizeTransit: '도시/지역 이동 횟수를 줄이는 방향으로 동선 최적화',
      lowWalking: '도보 부담을 줄이기 위해 구간 집중형 일정으로 구성',
      publicTransitOnly: '대중교통 전용 이동 기준으로 일정 구성',
      jrPassMode: 'JR 패스 활용 가능 구간 우선으로 동선 제안',
      nightViewFocus: '야경 명소 시간대를 우선 배치',
      lowBudget: '저예산 기준: 테마파크·유료 전망대·수족관은 빼고 무료·저렴한 명소 위주로 구성',
      firstTimeJapan: '일본 첫 여행 기준으로 대표 명소를 우선 반영',
      multiCity: (list) => `다중 도시 일정: ${list.join(' -> ')} 순서로 동선을 구성`,
      freeTime: '추천할 장소를 모두 배치해 남는 시간은 자유 일정으로 두었어요',
      fewSights: (city, n) => `${city}${koTopicParticle(city)} 작은 지역이라 앱 데이터에 있는 명소가 ${n}곳뿐이에요. 다른 도시 장소로 채우지 않고 남는 시간은 자유 일정으로 두었어요`,
      droppedCities: (dropped, days, n, rec) => `넣지 못한 도시: ${dropped}. ${days}일 일정으로는 도시 ${n}곳을 모두 넣을 수 없어 앞의 도시부터 하루씩 넣었어요. 모두 가려면 ${n}일 이상, 이동 시간까지 생각하면 ${rec}일 정도가 좋아요`
    }
  },
  en: {
    freeTime: 'Free time',
    walkAround: (area) => `stroll around ${area}`,
    cafeWalk: (city) => `relaxed walk and cafés in ${city}`,
    restDay: (city) => `${city} rest day: an easy day of cafés and walks`,
    transitOnly: 'Short hops by public transport only',
    freeRest: 'Free rest',
    localFood: (city) => `local food walk in ${city}`,
    localDinner: (area) => `Local dinner in ${area}`,
    cafeDessert: (city) => `cafés and desserts in ${city}`,
    transfer: (from, to, hint) => `Transfer: ${from} -> ${to} (${hint})`,
    arrivalRest: 'Arrival, transfer, check-in and rest',
    checkoutAirport: 'Check-out & head to the airport',
    departurePrep: 'Prepare for departure and head to the airport',
    summary: (city, days, withFlight) => `${days}-day plan for ${city}${withFlight ? ' (fitted to your flight times)' : ''}`,
    tips: {
      base: ['Allow at least 2 hours for the airport-to-city transfer on day 1', 'Visit popular spots right after opening or after 8 pm', 'If you walk more than 18,000 steps, take the next morning easy'],
      arrival: (t) => `Day 1 starts from your ${t} arrival plus 90 minutes of transfer`,
      departure: (t) => `Last day adjusted to reach the airport 2 hours before your ${t} departure`,
      airportBuffer: (m) => `Last-day airport buffer of ${m} minutes included`,
      indoorFocus: 'More indoor stops in case of rain',
      removeShopping: 'Shopping stops removed; focused on sights and experiences',
      optimizeTransit: 'Route optimized to reduce city/area changes',
      lowWalking: 'Clustered stops to keep walking light',
      publicTransitOnly: 'Planned for public transport only',
      jrPassMode: 'Prefers segments covered by the JR Pass',
      nightViewFocus: 'Night-view spots placed at the best time',
      lowBudget: 'Low budget: theme parks, paid observation decks and aquariums left out; free and cheap sights first',
      firstTimeJapan: 'Classic sights first for a first trip to Japan',
      multiCity: (list) => `Multi-city trip: ${list.join(' -> ')}`,
      freeTime: 'All suggested places are scheduled; remaining slots are left as free time',
      fewSights: (city, n) => `${city} is a small area: the app knows only ${n} sights there. Remaining time is left free instead of filling it with places from other cities`,
      droppedCities: (dropped, days, n, rec) => `Left out: ${dropped}. A ${days}-day trip cannot cover all ${n} cities, so the first cities got a day each. Seeing all of them needs at least ${n} days, about ${rec} with travel time`
    }
  },
  ja: {
    freeTime: '自由時間',
    walkAround: (area) => `${area}周辺を散策`,
    cafeWalk: (city) => `${city}でのんびり散策・カフェ`,
    restDay: (city) => `${city}休息日：カフェや散策中心のゆったりプラン`,
    transitOnly: '公共交通機関で近場のみ移動',
    freeRest: '自由休憩',
    localFood: (city) => `${city}のローカルグルメ巡り`,
    localDinner: (area) => `${area}で地元の食事`,
    cafeDessert: (city) => `${city}のカフェ・スイーツ`,
    transfer: (from, to, hint) => `都市間移動：${from} -> ${to}（${hint}）`,
    arrivalRest: '到着後の移動・チェックイン・休憩',
    checkoutAirport: 'チェックアウト＆空港へ移動',
    departurePrep: '出国準備と空港への移動',
    summary: (city, days, withFlight) => `${city} ${days}日間のプラン${withFlight ? '（航空便の時刻を反映）' : ''}`,
    tips: {
      base: ['初日は空港から市内への移動に2時間以上を確保', '人気スポットは開店直後か20時以降がおすすめ', '1日18,000歩以上歩いたら翌朝の予定をゆるめに'],
      arrival: (t) => `到着${t}＋移動90分を基準に初日の予定を開始`,
      departure: (t) => `出発${t}の2時間前に空港着を基準に最終日を調整`,
      airportBuffer: (m) => `最終日の空港到着バッファ${m}分を反映`,
      indoorFocus: '雨に備えて屋内の比重を高めて構成',
      removeShopping: 'ショッピングを除き観光・体験中心に構成',
      optimizeTransit: '都市・エリア間の移動回数を減らすよう最適化',
      lowWalking: '歩く負担を減らすためエリアを絞って構成',
      publicTransitOnly: '公共交通機関のみでの移動を前提に構成',
      jrPassMode: 'JRパスが使える区間を優先',
      nightViewFocus: '夜景スポットを最適な時間帯に配置',
      lowBudget: '低予算：テーマパーク・有料展望台・水族館を外し、無料・手頃なスポット中心に構成',
      firstTimeJapan: '初めての日本旅行向けに定番スポットを優先',
      multiCity: (list) => `複数都市の旅程：${list.join(' -> ')}の順`,
      freeTime: 'おすすめの場所をすべて配置し、残りの時間は自由時間にしました',
      fewSights: (city, n) => `${city}は小さな地域のため、アプリのデータにある名所は${n}か所だけです。ほかの都市の場所で埋めず、残りの時間は自由時間にしました`,
      droppedCities: (dropped, days, n, rec) => `入れられなかった都市: ${dropped}。${days}日間では${n}都市すべては回れないため、先の都市から1日ずつ入れました。すべて回るには${n}日以上、移動時間を考えると${rec}日ほどがおすすめです`
    }
  }
};

const TRANSFER_HINT_I18N = {
  'JR/한큐 약 30~60분': { en: 'JR/Hankyu, about 30-60 min', ja: 'JR/阪急 約30～60分' },
  '신칸센 약 2시간 10분': { en: 'Shinkansen, about 2 h 10 min', ja: '新幹線 約2時間10分' },
  '신칸센 약 2시간 30분': { en: 'Shinkansen, about 2 h 30 min', ja: '新幹線 約2時間30分' },
  '전철 약 40~60분': { en: 'Train, about 40-60 min', ja: '電車 約40～60分' },
  '전철 약 30~50분': { en: 'Train, about 30-50 min', ja: '電車 約30～50分' },
  '전철 약 45~60분': { en: 'Train, about 45-60 min', ja: '電車 約45～60分' },
  '신칸센 약 30분': { en: 'Shinkansen, about 30 min', ja: '新幹線 約30分' },
  '신칸센 약 35분': { en: 'Shinkansen, about 35 min', ja: '新幹線 約35分' },
  '신칸센 약 45분': { en: 'Shinkansen, about 45 min', ja: '新幹線 約45分' },
  '신칸센 약 50분': { en: 'Shinkansen, about 50 min', ja: '新幹線 約50分' },
  '신칸센 약 1시간': { en: 'Shinkansen, about 1 h', ja: '新幹線 約1時間' },
  '신칸센 약 1시간 20분': { en: 'Shinkansen, about 1 h 20 min', ja: '新幹線 約1時間20分' },
  '신칸센 약 1시간 30분': { en: 'Shinkansen, about 1 h 30 min', ja: '新幹線 約1時間30分' },
  '신칸센 약 1시간 40분': { en: 'Shinkansen, about 1 h 40 min', ja: '新幹線 約1時間40分' },
  '신칸센 약 1시간 10분': { en: 'Shinkansen, about 1 h 10 min', ja: '新幹線 約1時間10分' },
  '신칸센 약 2시간': { en: 'Shinkansen, about 2 h', ja: '新幹線 約2時間' },
  '신칸센 약 2시간 40분': { en: 'Shinkansen, about 2 h 40 min', ja: '新幹線 約2時間40分' },
  '신칸센·특급 약 1시간 20분': { en: 'Shinkansen and limited express, about 1 h 20 min', ja: '新幹線・特急 約1時間20分' },
  '신칸센 약 30분~1시간 30분': { en: 'Shinkansen, about 30 min-1 h 30 min', ja: '新幹線 約30分～1時間30分' },
  '신칸센 약 1시간 30분~2시간': { en: 'Shinkansen, about 1 h 30 min-2 h', ja: '新幹線 約1時間30分～2時間' },
  '신칸센 약 1~3시간': { en: 'Shinkansen, about 1-3 h', ja: '新幹線 約1～3時間' },
  '신칸센 약 2~4시간 30분': { en: 'Shinkansen, about 2-4.5 h', ja: '新幹線 約2～4時間30分' },
  '특급 약 1시간 25분': { en: 'Limited express, about 1 h 25 min', ja: '特急 約1時間25分' },
  '특급 약 2시간': { en: 'Limited express, about 2 h', ja: '特急 約2時間' },
  '특급 약 2시간 10분': { en: 'Limited express, about 2 h 10 min', ja: '特急 約2時間10分' },
  '특급 약 3시간': { en: 'Limited express, about 3 h', ja: '特急 約3時間' },
  '특급 약 3시간 40분': { en: 'Limited express, about 3 h 40 min', ja: '特急 約3時間40分' },
  '특급 약 4시간': { en: 'Limited express, about 4 h', ja: '特急 約4時間' },
  '버스 약 2시간 30분': { en: 'Bus, about 2 h 30 min', ja: 'バス 約2時間30分' },
  '버스 약 3시간': { en: 'Bus, about 3 h', ja: 'バス 約3時間' },
  '와카야마 경유 배와 특급 약 4~5시간': { en: 'Ferry and limited express via Wakayama, about 4-5 h', ja: '和歌山経由でフェリーと特急 約4～5時間' },
  '이라부 대교로 차 약 30분': { en: 'About 30 min by car over the Irabu Bridge', ja: '伊良部大橋経由で車 約30分' },
  '페리 약 1시간 40분': { en: 'Ferry, about 1 h 40 min', ja: 'フェリー 約1時間40分' },
  '고속선 약 2시간, 페리 약 4시간': { en: 'High-speed boat, about 2 h; ferry, about 4 h', ja: '高速船 約2時間、フェリー 約4時間' },
  '고속선 약 1시간 40분': { en: 'High-speed boat, about 1 h 40 min', ja: '高速船 約1時間40分' },
  '고속선 약 50분': { en: 'High-speed boat, about 50 min', ja: '高速船 約50分' },
  '대중교통 기준 이동': { en: 'by public transport', ja: '公共交通機関で移動' },
  '대중교통 기준 1~3시간': { en: 'about 1-3 h by public transport', ja: '公共交通機関で約1～3時間' },
  '대중교통 기준 약 2~4시간': { en: 'about 2-4 h by public transport', ja: '公共交通機関で約2～4時間' },
  '배나 비행기로 이동, 항구·공항 오가는 시간 포함 반나절 안팎': { en: 'by ferry or plane, about half a day with port/airport transfers', ja: 'フェリーか飛行機で移動、港・空港への移動を含め半日前後' },
  '비행기 이동, 공항 오가는 시간 포함 반나절 이상': { en: 'by plane, half a day or more with airport transfers', ja: '飛行機で移動、空港への移動を含め半日以上' }
};

// 규칙 기반 일정의 "자유 일정" 칸 이름(지도·좌표 대상에서 뺀다)
const FREE_TIME_TITLES = new Set(Object.values(RULE_PLAN_TEXT).map((t) => t.freeTime));

// 예시 숙소(sample) 표기 en/ja
const MOCK_STAY_I18N = {
  names: {
    '그랜드 호텔': { en: 'Grand Hotel', ja: 'グランドホテル' }, '센트럴 스테이': { en: 'Central Stay', ja: 'セントラルステイ' },
    '파노라마 료칸': { en: 'Panorama Ryokan', ja: 'パノラマ旅館' }, '시티 레지던스': { en: 'City Residence', ja: 'シティレジデンス' },
    '마켓 하우스': { en: 'Market House', ja: 'マーケットハウス' }, '리버사이드': { en: 'Riverside', ja: 'リバーサイド' },
    '미드타운 호텔': { en: 'Midtown Hotel', ja: 'ミッドタウンホテル' }, '가든 스테이': { en: 'Garden Stay', ja: 'ガーデンステイ' },
    '아카데미아': { en: 'Academia', ja: 'アカデミア' }, '스카이뷰 스테이': { en: 'Skyview Stay', ja: 'スカイビューステイ' },
    '모던 하우스': { en: 'Modern House', ja: 'モダンハウス' }, '힐탑 숙소': { en: 'Hilltop Inn', ja: 'ヒルトップイン' }
  },
  types: {
    '호텔': { en: 'Hotel', ja: 'ホテル' }, '료칸': { en: 'Ryokan', ja: '旅館' },
    '레지던스': { en: 'Serviced apartment', ja: 'レジデンス' }, '게스트하우스': { en: 'Guesthouse', ja: 'ゲストハウス' }
  },
  amenities: {
    '조식 포함': { en: 'Breakfast included', ja: '朝食付き' }, '무료 Wi-Fi': { en: 'Free Wi-Fi', ja: '無料Wi-Fi' },
    '온천': { en: 'Hot spring', ja: '温泉' }, '야외 수영장': { en: 'Outdoor pool', ja: '屋外プール' },
    '피트니스': { en: 'Fitness', ja: 'フィットネス' }, '공항 셔틀': { en: 'Airport shuttle', ja: '空港シャトル' }
  }
};

function mockStayText(group, ko, lang) {
  if (lang === 'ko') return ko;
  return MOCK_STAY_I18N[group]?.[ko]?.[lang] || ko;
}

const FOOD_GENRE_I18N = {
  '스시': { en: 'Sushi', ja: '寿司' }, '라멘': { en: 'Ramen', ja: 'ラーメン' }, '이자카야': { en: 'Izakaya', ja: '居酒屋' },
  '쿠시카츠': { en: 'Kushikatsu', ja: '串カツ' }, '타코야키': { en: 'Takoyaki', ja: 'たこ焼き' }, '오코노미야키': { en: 'Okonomiyaki', ja: 'お好み焼き' },
  '우동': { en: 'Udon', ja: 'うどん' }, '소바': { en: 'Soba', ja: 'そば' }, '가이세키': { en: 'Kaiseki', ja: '懐石' },
  '카레': { en: 'Curry', ja: 'カレー' }, '디저트': { en: 'Dessert', ja: 'デザート' }, '해산물': { en: 'Seafood', ja: '海鮮' },
  '향토요리': { en: 'Local cuisine', ja: '郷土料理' }, '면요리': { en: 'Noodles', ja: '麺料理' }, '규탄': { en: 'Beef tongue', ja: '牛タン' },
  '돈카츠': { en: 'Tonkatsu', ja: 'とんかつ' }, '주점': { en: 'Bar', ja: '酒場' }, '일식': { en: 'Japanese', ja: '和食' },
  '장어덮밥': { en: 'Eel rice bowl', ja: 'うなぎ丼' }, '양고기': { en: 'Lamb', ja: 'ラム肉' }, '전골': { en: 'Hot pot', ja: '鍋料理' },
  '육류': { en: 'Meat', ja: '肉料理' }, '분식': { en: 'Street food', ja: '軽食' }, '덮밥': { en: 'Rice bowl', ja: '丼' },
  '유제품': { en: 'Dairy', ja: '乳製品' }, '패스트푸드': { en: 'Fast food', ja: 'ファストフード' }, '구이': { en: 'Grill', ja: '炉端焼き' },
  '닭요리': { en: 'Chicken', ja: '鶏料理' }, '두부요리': { en: 'Tofu', ja: '豆腐料理' }, '샐러드': { en: 'Salad', ja: 'サラダ' }
};

// JP_KO_AREA(영문→한글)를 뒤집은 한글→영문 지역명 (en 표기 보조)
const KO_AREA_TO_EN = (() => {
  const out = {};
  for (const [en, ko] of Object.entries(JP_KO_AREA)) {
    if (!out[ko]) out[ko] = en.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return out;
})();

function normalizeLang(lang) {
  const l = String(lang || 'ko').toLowerCase();
  return l === 'en' || l === 'ja' ? l : 'ko';
}

// fallback: en/ja 표기를 모르는 한글 지역명일 때 대신 쓸 값(보통 도시 이름). 없으면 원문 유지.
function localizeCuratedArea(area, lang, fallback = '') {
  const a = String(area || '');
  if (!a || lang === 'ko') return a;
  const hit = CURATED_AREA_I18N[a];
  if (hit && hit[lang]) return hit[lang];
  // 지역 칸에 도시 이름이 들어 있으면(예: 요청 명소의 '오사카') 도시 이름 표기를 쓴다.
  const ck = cityKeyForExactLabel(a);
  if (ck) return localizedCityName(ck, lang);
  const out = KO_AREA_TO_EN[a] || a;
  return fallback && /[가-힣]/.test(out) && !/[가-힣]/.test(fallback) ? fallback : out;
}

// localizeCuratedArea의 반대: en/ja 지역명('Chuo Ward'·'中央区') → 원래 한글 지역명(모르면 '')
function koAreaFromLocalized(area) {
  const a = String(area || '').trim();
  if (!a || /[가-힣]/.test(a)) return '';
  for (const [ko, v] of Object.entries(CURATED_AREA_I18N)) {
    if (v && (v.en === a || v.ja === a)) return ko;
  }
  const lower = a.toLowerCase();
  return Object.prototype.hasOwnProperty.call(JP_KO_AREA, lower) ? String(JP_KO_AREA[lower] || '') : '';
}

// localizeCuratedCategory의 반대: 'Culture/Hiking'·'文化/トレッキング' → '문화/트레킹'(한 조각이라도 모르면 '')
function koCategoryFromLocalized(category) {
  const c = String(category || '').trim();
  if (!c || /[가-힣]/.test(c)) return '';
  const one = (s) => Object.keys(CURATED_CATEGORY_I18N).find((ko) => CURATED_CATEGORY_I18N[ko]?.en === s || CURATED_CATEGORY_I18N[ko]?.ja === s) || '';
  const whole = one(c);
  if (whole) return whole;
  const parts = c.split('/').map((p) => one(p.trim()));
  return parts.length > 1 && parts.every(Boolean) ? parts.join('/') : '';
}

// 대표 명소(MUST_ATTRACTIONS)의 영문 표기: 가장 긴 로마자 별칭(예: 'universal studios japan' → 'Universal Studios Japan')
const MUST_NAME_ACRONYMS = { tv: 'TV', usj: 'USJ' };
function mustAttractionLatinName(cityKey, koName) {
  const target = String(koName || '').trim().toLowerCase();
  const m = MUST_ATTRACTIONS.find((x) => x.cityKey === cityKey
    && (x.name.toLowerCase() === target || (x.aliases || []).some((a) => String(a).toLowerCase() === target)));
  const latin = (m?.aliases || []).filter((a) => /^[a-z0-9 .'-]+$/i.test(a)).sort((a, b) => b.length - a.length)[0];
  if (!latin) return '';
  return latin.split(/\s+/).map((w) => MUST_NAME_ACRONYMS[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

function localizeCuratedCategory(category, lang) {
  const c = String(category || '');
  if (!c || lang === 'ko') return c;
  if (CURATED_CATEGORY_I18N[c]?.[lang]) return CURATED_CATEGORY_I18N[c][lang];
  return c.split('/').map((part) => CURATED_CATEGORY_I18N[part.trim()]?.[lang] || part.trim()).join('/');
}

function localizeFoodGenre(genre, lang) {
  const g = String(genre || '');
  if (!g || lang === 'ko') return g;
  return FOOD_GENRE_I18N[g]?.[lang] || g;
}

// 내장 큐레이션 장소 한 곳을 lang에 맞게 표기한다(원래 한글 이름은 nameKo로 남김).
function localizeCuratedPlace(place, cityKey, lang) {
  if (!place || lang === 'ko') return place;
  // 이미 현지화된 카드(nameKo 있음)도 원래 한글 이름으로 찾는다(여러 번 불러도 결과가 같다).
  const koName = String(place.nameKo || place.name || '');
  const media = placeMediaFor(cityKey, koName);
  // en/ja 표기 순서: 내장 표 → 사진 데이터의 위키데이터 이름(labels) → 대표 명소의 로마자 별칭(ja도 한글보다 로마자가 읽기 쉽다)
  const localizedName = CURATED_PLACE_I18N[`${cityKey}|${koName}`]?.[lang] || media?.labels?.[lang]
    || (lang === 'ja' ? media?.labels?.en : '') || mustAttractionLatinName(cityKey, koName) || '';
  const out = { ...place };
  if (localizedName && localizedName !== place.name) {
    out.nameKo = koName;
    out.name = localizedName;
  }
  out.area = localizeCuratedArea(place.area, lang, CITY_DATA[cityKey] ? localizedCityName(cityKey, lang) : '');
  out.category = localizeCuratedCategory(place.category, lang);
  return out;
}

// 도시 중심 좌표: 정적 표 → 동적 도시 center → 명소 좌표 평균 → 공항 좌표 (Google 호출 없음)
function resolveCityCenter(cityKey) {
  const key = String(cityKey || '');
  const fixed = CITY_CENTER_COORDS[key];
  if (fixed) return { lat: fixed.lat, lng: fixed.lng };
  const city = CITY_DATA[key];
  if (!city) return null;
  if (hasLatLng(city.center)) return { lat: Number(city.center.lat), lng: Number(city.center.lng) };
  const pts = (city.highlights || [])
    .map((h) => (hasLatLng(h) ? h : placeMediaFor(key, h.name)))
    .filter((p) => hasLatLng(p));
  if (pts.length > 0) {
    return {
      lat: pts.reduce((s, p) => s + Number(p.lat), 0) / pts.length,
      lng: pts.reduce((s, p) => s + Number(p.lng), 0) / pts.length
    };
  }
  const ap = JAPAN_AIRPORT_COORDS.find((a) => a.code === city.airport);
  return ap ? { lat: ap.lat, lng: ap.lng } : null;
}

// 도시 중심: 정적 좌표를 먼저 쓰고, google 모드에서 정적 좌표가 없을 때만 Geocoding을 부른다.
async function fetchGoogleCityCenter(cityLabel, cityKey) {
  const key = cityKey || detectCityKeyByInput(cityLabel) || cityKeyByLabel(cityLabel);
  const fixed = resolveCityCenter(key);
  if (fixed) return fixed;
  if (!GOOGLE_PLACES_ENABLED) return null;
  try {
    const first = await googleGeocodeFirst(`${cityLabel} Japan`, 'ko');
    return first ? { lat: first.lat, lng: first.lng } : null;
  } catch {
    return null;
  }
}

// 도시 입력(키·한글/영문 이름·동적 도시 키) → 좌표. Google 호출 없음.
// 정적 표·동적 도시 중심·명소 좌표·공항 좌표로 먼저 찾고, 모르는 이름이면 open-meteo 무료 지오코딩(캐시)을 쓴다.
async function resolveCityCoordsForInput(input, lang = 'ko') {
  const raw = String(input || '').trim().slice(0, 60);
  if (!raw) return null;
  const key = detectCityKeyByInput(raw);
  if (key) {
    const center = resolveCityCenter(key);
    if (center) return { key, label: CITY_DATA[key]?.label || raw, lat: center.lat, lng: center.lng };
  }
  const label = key ? (CITY_DATA[key]?.label || raw) : raw;
  if (/^custom_[0-9a-f]+$/i.test(label)) return null; // 사라진 동적 도시 키는 이름을 알 수 없다
  const geo = await geocodeWithOpenMeteo(label, lang);
  return geo ? { key: key || '', label, lat: geo.lat, lng: geo.lng } : null;
}

function sourceInfo(kind, provider, reasonCode = null) {
  return { kind, provider, reasonCode: reasonCode || null };
}

// 레거시 warning 필드용 짧은 한국어 문구 (원시 오류 문자열은 보여주지 않는다)
const PLACES_REASON_TEXT_KO = {
  GOOGLE_KEY_MISSING: 'Google 장소 검색 키가 설정되지 않아 기본 목록을 보여드려요',
  GOOGLE_BILLING_DISABLED: 'Google 장소 검색을 쓸 수 없어(결제 미설정) 기본 목록을 보여드려요',
  GOOGLE_PERMISSION_DENIED: 'Google 장소 검색 권한이 없어 기본 목록을 보여드려요',
  GOOGLE_QUOTA_EXCEEDED: '오늘 장소 검색 한도에 도달해 기본 목록을 보여드려요',
  GOOGLE_CIRCUIT_OPEN: '장소 검색을 잠시 쉬는 중이라 기본 목록을 보여드려요',
  GOOGLE_ERROR: '장소 검색에 일시적인 문제가 있어 기본 목록을 보여드려요',
  NO_RESULTS: '검색 결과가 없어 기본 목록을 보여드려요',
  PROVIDER_UNAVAILABLE: '실시간 장소 검색을 쓰지 않아 기본 목록을 보여드려요'
};


// ── Infer best visit time from place type + opening hours ──
function inferBestTime(place) {
  const type = String(place.primaryType || '').toLowerCase();
  const name = String(place.displayName?.text || '').toLowerCase();
  const periods = place.regularOpeningHours?.periods || [];

  // Night-view / observation spots -> evening
  if (/observation|tower|sky|viewing|viewpoint/.test(type) ||
      /전망|스카이|타워|야경/.test(name)) {
    return '17:00-20:00';
  }

  // Nightlife / entertainment districts
  if (/night_club|bar|entertainment/.test(type) ||
      /도톤보리|밤|야시장|포장마차/.test(name)) {
    return '18:00-21:00';
  }

  // Markets / morning spots
  if (/market|fish/.test(type) ||
      /시장|외시장|어시장|츠키지/.test(name)) {
    return '09:00-12:00';
  }

  // Shrines / temples -> early morning
  if (/shrine|temple|place_of_worship/.test(type) ||
      /신사|사원|절|이나리|신궁/.test(name)) {
    return '08:30-10:30';
  }

  // Parks / gardens -> morning-midday
  if (/park|garden|zoo|aquarium/.test(type) ||
      /공원|정원|동물원|수족관/.test(name)) {
    return '09:30-12:00';
  }

  // Shopping -> afternoon
  if (/shopping|store|mall/.test(type) ||
      /쇼핑|백화점|마켓|면세점/.test(name)) {
    return '13:00-17:00';
  }

  // Museums -> late morning
  if (/museum|gallery|art/.test(type) ||
      /박물관|미술관|기념관/.test(name)) {
    return '10:00-12:30';
  }

  // Amusement / theme park -> all day
  if (/amusement|theme_park/.test(type) ||
      /디즈니|유니버셜|테마파크/.test(name)) {
    return '09:00-17:00';
  }

  // Try to infer from opening hours periods
  if (periods.length > 0) {
    // Find a weekday period (e.g., Wednesday = index ~3)
    const sample = periods.find(p => p.open && p.close) || periods[0];
    if (sample && sample.open && sample.close) {
      const openH = sample.open.hour || 9;
      const closeH = sample.close.hour || 17;
      if (closeH >= 21) {
        // Opens late or closes late -> afternoon/evening
        return openH >= 15 ? '17:00-20:00' : '14:00-18:00';
      }
      if (openH <= 8) {
        return '08:30-11:00';
      }
      const midH = Math.round((openH + closeH) / 2);
      const startH = Math.max(openH, midH - 1);
      const endH = Math.min(closeH, startH + 2);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(startH)}:00-${pad(endH)}:00`;
    }
  }

  // Default: use openNow hint
  return place.currentOpeningHours?.openNow ? '10:00-12:00' : '13:00-15:00';
}

// google 모드 전용. 쿼리 2개·작은 필드 마스크·12시간 캐시. 모든 쿼리가 실패하면 첫 오류(GoogleApiError)를 던진다.
async function fetchGoogleAttractions(cityLabel, theme, lang, center = null) {
  if (!GOOGLE_PLACES_ENABLED) return [];
  const _themeHints = {
    ko: { foodie: '맛집 명소', culture: '역사 문화 명소', shopping: '쇼핑 명소', nature: '자연 공원 명소', _default: '인기 관광지' },
    en: { foodie: 'food spots', culture: 'historical cultural sites', shopping: 'shopping spots', nature: 'nature parks', _default: 'popular attractions' },
    ja: { foodie: 'グルメスポット', culture: '歴史文化名所', shopping: 'ショッピングスポット', nature: '自然公園', _default: '人気観光地' }
  };
  const _th = _themeHints[lang] || _themeHints.ko;
  const themeHint = _th[theme] || _th._default;
  const _queryHints = {
    ko: ['인기 관광지', '꼭 가봐야 할 곳', '추천 명소'],
    en: ['popular attractions', 'must visit places', 'recommended spots'],
    ja: ['人気観光地', 'おすすめスポット', '名所']
  };
  const _qh = _queryHints[lang] || _queryHints.ko;
  const queries = Array.from(new Set([
    `${cityLabel} ${themeHint}`,
    `${cityLabel} ${_qh[0]}`,
    `${cityLabel} ${_qh[1]}`
  ])).slice(0, 2);
  const cacheKey = `attractions|${cityLabel}|${theme || 'mixed'}|${lang || 'ko'}|${queries.join('/')}`;
  const cached = placesCacheGet(cacheKey);
  if (cached) return cached;

  const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType,places.location,places.photos';
  const settled = await Promise.allSettled(queries.map((q) => {
    const body = { textQuery: q, maxResultCount: 20, languageCode: lang || 'ko', regionCode: 'JP' };
    if (hasLatLng(center)) {
      body.locationBias = { circle: { center: { latitude: Number(center.lat), longitude: Number(center.lng) }, radius: 30000 } };
    }
    return googlePlacesSearchText(body, fieldMask, 'places:attractions');
  }));
  const results = settledValuesOrThrow(settled);

  const merged = results.flat();
  // Filter out non-Japan results
  const jpOnly = merged.filter((p) => {
    const addr = String(p.formattedAddress || '');
    if (/한국|대한민국|South Korea|Korea|서울|부산|대구|인천|China|中国|台湾|Taiwan|Thailand|Vietnam|Philippines/i.test(addr)) return false;
    return true;
  });
  const uniq = new Map();
  const seenNames = new Set();
  for (const p of jpOnly) {
    const id = p.id || '';
    const name = String(p.displayName?.text || '').trim();
    if (!name) continue;
    // Dedup by ID
    if (id && uniq.has(id)) continue;
    // Dedup by normalized name (remove spaces/brackets for fuzzy match)
    const normName = name.replace(/[\s\(\)（）　]/g, '').toLowerCase();
    if (seenNames.has(normName)) continue;
    seenNames.add(normName);
    if (id) uniq.set(id, p);
    else uniq.set(name, p);
  }
  const out = Array.from(uniq.values());
  placesCacheSet(cacheKey, out);
  return out;
}

function seasonalBonus(primaryType, startDate) {
  if (!startDate) return 0.5;
  const month = new Date(startDate).getMonth() + 1; // 1-12
  const type = String(primaryType || '').toLowerCase();
  // Cherry blossom season (Mar-Apr): parks, gardens, temples
  if ((month === 3 || month === 4) && (type.includes('park') || type.includes('garden') || type.includes('temple') || type.includes('shrine'))) return 1.0;
  // Autumn foliage (Oct-Nov): same outdoor spots
  if ((month === 10 || month === 11) && (type.includes('park') || type.includes('garden') || type.includes('temple'))) return 0.95;
  // Summer (Jul-Aug): aquariums, indoor, shopping
  if ((month === 7 || month === 8) && (type.includes('aquarium') || type.includes('museum') || type.includes('shopping'))) return 0.9;
  // Winter (Dec-Feb): hot springs, ski, illumination
  if ((month === 12 || month === 1 || month === 2) && (type.includes('spa') || type.includes('resort') || type.includes('hot_spring'))) return 0.95;
  // Snow festival in Sapporo (Feb)
  if (month === 2 && type.includes('park')) return 0.85;
  return 0.5; // neutral
}

function scoreExternalPlace(place, ctx) {
  const rating = Number(place.rating || 0);
  const reviewCount = Number(place.userRatingCount || 0);
  const reviewScore = clamp(Math.log1p(reviewCount) / Math.log1p(5000), 0, 1);
  const ratingScore = clamp(rating / 5, 0, 1);
  const preferenceScore = categoryFit(ctx.theme, place.primaryType);
  const budgetScore = budgetFit(ctx.budget, place.primaryType);
  const centerDistKm = ctx.center && place.location ? haversineKm(ctx.center, { lat: place.location.latitude, lng: place.location.longitude }) : 5;
  const mobilityScore = clamp(1 - (centerDistKm / 20), 0.1, 1);
  const congestion = congestionPenalty(reviewCount, place.currentOpeningHours?.openNow);
  const seasonBonus = seasonalBonus(place.primaryType, ctx.startDate);
  const composite = (
    ratingScore * 0.35 +
    reviewScore * 0.25 +
    mobilityScore * 0.15 +
    preferenceScore * 0.10 +
    budgetScore * 0.05 +
    seasonBonus * 0.10
  ) * 100;

  return Math.round(clamp(composite - (congestion * 10), 0, 100));
}

// 도시 이름 en/ja 표기(화면 public/app.js의 PLACE_NAME_I18N과 같은 값 — 서버 문구와 화면 표기를 맞춘다). [영어, 일본어]
const CITY_NAME_I18N = {
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
  '요나구니': ['Yonaguni', '与那国'], '도쿠노시마': ['Tokunoshima', '徳之島']
};

// ── 도시 별칭 보강(말로 한 도시 이름 인식) ──
// (1) 위 표의 en/ja 표기('函館で2日間', 'Kitakyushu 2 days'), (2) 키의 밑줄을 공백·하이픈으로(cityMentionHits),
// (3) 한국어 표기 변형: 첫 글자 가↔카·고↔코·구↔쿠·기↔키·다↔타·도↔토 …, 쓰↔츠('카나자와', '다카마츠', '쿠마모토'),
// (4) 흔히 쓰는 다른 이름(공항 도시의 이웃 도시·섬 이름: 那覇·小倉·網走·水戸·盛岡·会津 …).
// 다른 낱말과 겹치는 표기는 넣지 않는다: '石垣'(돌담) 대신 '石垣島'·'石垣市', '코치'(코치·coach), '山口'(성씨) 대신 '山口県'·'山口市'.
const CITY_ALIAS_SKIP = new Set(['石垣', '코치']);
const CITY_EXTRA_ALIASES = {
  // 장음을 적은 표기(新潟 にいがた: 표기법은 '니가타', 예전 장소 이름 '니이가타 현립 식물원' 등)
  niigata: ['니이가타'],
  okinawa: ['나하', 'naha', '那覇'],
  nanki_shirahama: ['시라하마', '난키시라하마', 'shirahama', 'nanki shirahama', 'nanki-shirahama', '白浜', '南紀'],
  kitakyushu: ['기타규슈', '키타규슈', '고쿠라', 'kokura', '小倉', 'kita-kyushu', 'kita kyushu', 'kitakyūshū'],
  memanbetsu: ['아바시리', 'abashiri', '網走'],
  ibaraki: ['미토', 'mito', '水戸'],
  hanamaki: ['모리오카', 'morioka', '盛岡'],
  fukushima: ['아이즈', '아이즈와카마쓰', '아이즈와카마츠', 'aizu', 'aizuwakamatsu', 'aizu-wakamatsu', 'aizu wakamatsu', '会津', '会津若松'],
  shonai: ['쓰루오카', '츠루오카', '사카타', 'tsuruoka', 'sakata', '鶴岡', '酒田'],
  tajima: ['도요오카', 'toyooka', '豊岡'],
  yamaguchi_ube: ['야마구치', '우베', 'yamaguchi', 'ube', 'yamaguchi ube', 'yamaguchi-ube', '宇部', '山口県', '山口市', '山口宇部'],
  ishigaki: ['이시가키섬', '이시가키지마', 'ishigaki island', 'ishigakijima', '石垣島', '石垣市'],
  miyako: ['미야코', '미야코섬', 'miyako', 'miyakojima', 'miyako island', '宮古島'],
  amami: ['아마미오시마', '아마미 오시마', 'amami oshima', 'amami-oshima', 'amami ōshima', '奄美大島'],
  kita_daito: ['기타다이토섬', '기타다이토지마', 'kitadaito', 'kita-daito', 'kita daito', 'kitadaitojima', 'kitadaitō', '北大東島', '北大東'],
  okadama: ['오카다마', 'okadama', 'sapporo okadama', '丘珠', '札幌丘珠'],
  rishiri: ['리시리섬', 'rishiri island', '利尻島'],
  yonaguni: ['요나구니섬', 'yonaguni island', '与那国島'],
  kumejima: ['구메섬', 'kume island', '久米島'],
  tanegashima: ['다네가섬', '種子島'],
  yakushima: ['야쿠섬', '屋久島'],
  tokunoshima: ['徳之島'],
  shimojishima: ['시모지섬', 'shimoji island', '下地島']
};
const KO_INITIAL_SWAP = { 가: '카', 카: '가', 고: '코', 코: '고', 구: '쿠', 쿠: '구', 기: '키', 키: '기', 다: '타', 타: '다', 도: '토', 토: '도', 데: '테', 테: '데', 게: '케', 케: '게', 교: '쿄', 쿄: '교' };
function koSpellingVariants(label) {
  const base = String(label || '').trim();
  if (!/^[가-힣 ]+$/.test(base)) return [];
  const forms = new Set([base, base.replace(/쓰/g, '츠'), base.replace(/츠/g, '쓰')]);
  for (const f of [...forms]) {
    const swapped = KO_INITIAL_SWAP[f[0]];
    if (swapped) forms.add(swapped + f.slice(1));
  }
  return [...forms].filter((f) => f !== base && !CITY_ALIAS_SKIP.has(f));
}
for (const [key, city] of Object.entries(CITY_DATA)) {
  if (city.dynamic) continue;
  const row = CITY_NAME_I18N[city.label] || [];
  CITY_ALIASES[key] = Array.from(new Set([
    ...(CITY_ALIASES[key] || []),
    ...row.filter((x) => x && !CITY_ALIAS_SKIP.has(x)).map((x) => (/^[A-Za-z]/.test(x) ? x.toLowerCase() : x)),
    ...koSpellingVariants(city.label),
    ...(CITY_EXTRA_ALIASES[key] || [])
  ]));
}

// 사진 데이터(cities)의 위키데이터 en/ja 이름 — 도시 항목 대신 이웃 항목의 사진을 빌린 경우(예: 이바라키 → 미토)가 있어서,
// en 이름이 cityKey와 맞을 때만(같은 항목일 때만) 쓴다. 위 표에 없는 도시의 대체 표기용.
function cityLabelsFromMedia(cityKey) {
  const media = PLACE_IMAGES.cities.get(String(cityKey || ''));
  const en = media?.labels?.en || '';
  if (!en) return {};
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = fold(en);
  const b = fold(cityKey);
  return a && b && (a.includes(b) || b.includes(a)) ? media.labels : {};
}

function localizedCityName(cityKey, lang) {
  const city = CITY_DATA[cityKey];
  const label = city?.label || String(cityKey || '');
  if (lang === 'ko' || !city || city.dynamic || String(cityKey).startsWith('custom_')) return label;
  const row = CITY_NAME_I18N[label];
  const mediaLabels = cityLabelsFromMedia(cityKey);
  const en = row?.[0] || mediaLabels.en
    || String(cityKey).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (lang === 'ja') return row?.[1] || city.nameJa || JAPAN_CITY_PROFILES[cityKey]?.nameJa || mediaLabels.ja || en;
  return en;
}

function recommendationSummary(cityKey, count, lang) {
  const name = localizedCityName(cityKey, lang);
  if (lang === 'en') return `${count} recommended places in ${name}`;
  if (lang === 'ja') return `${name}のおすすめスポット ${count}件`;
  return `${name} 여행지 추천 ${count}곳`;
}

// 내장 큐레이션 명소 + 위키미디어 사진/좌표 (Google 호출 없음)
// 큐레이션 명소가 max보다 적으면 도시 주변 실제 명소(assets/city-places.json, 파일 순서 = 위키데이터에서 많이 다룬 순)를 뒤에 붙인다.
function buildCuratedPicks(cityKey, city, theme, lang, max) {
  const curated = (city.highlights || [])
    .map((p) => attachPlaceMedia({
      ...p,
      city: city.label,
      aiScore: 70 + themeScore(theme, p) * 10 - p.crowdScore * 2,
      mapUrl: mapUrl(`${p.name} ${city.label}`)
    }, cityKey, p.name))
    .map((p) => localizeCuratedPlace(p, cityKey, lang))
    .sort((a, b) => b.aiScore - a.aiScore);
  if (curated.length >= max) return curated.slice(0, max);
  const taken = new Set(curated.map((p) => placeNameKey(placeOriginalName(p))));
  const nearby = EXTRA_PLACES
    .filter((e) => e.generated && e.cityKey === cityKey && !e.fullDay && !e.dayTrip && !taken.has(placeNameKey(e.name)))
    .map((e) => localizeCuratedPlace(attachPlaceMedia({ ...extraPlaceCard(e, city), aiScore: 60 }, cityKey, e.name), cityKey, lang));
  return [...curated, ...nearby].slice(0, max);
}

async function recommendDestinations(payload) {
  const lang = normalizeLang(payload.lang);
  const key = cityKeyByInput(payload.city);
  const city = CITY_DATA[key];
  const theme = payload.theme || 'mixed';
  const pace = payload.pace || 'normal';
  const budget = payload.budget || 'mid';
  const max = Math.max(6, Math.min(30, Number(payload.limit) || 20));
  let fallbackReason = null;

  if (GOOGLE_PLACES_ENABLED) {
    try {
      // 도시 중심은 정적 좌표(Geocoding 호출 없음)
      const center = resolveCityCenter(key);
      const places = await fetchGoogleAttractions(city.label, theme, lang, center);
      if (places.length > 0) {
        const seenScored = new Set();
        const scored = places
          .map((p) => ({
            name: p.displayName?.text || '이름 없음',
            city: city.label,
            category: localizeType(p.primaryType, lang) || ({ko:'관광',en:'Attraction',ja:'観光'}[lang]||'관광'),
            area: localizeAddress(p.formattedAddress, city.label, lang),
            bestTime: inferBestTime(p),
            crowdScore: 3,
            mapUrl: p.googleMapsUri || mapUrl(`${p.displayName?.text || city.label} ${city.label}`),
            ...googlePhotoFields(p),
            aiScore: scoreExternalPlace(p, { theme, budget, center, startDate: payload.startDate }),
            rating: p.rating || null,
            reviewCount: p.userRatingCount || 0,
            lat: p.location?.latitude ?? null,
            lng: p.location?.longitude ?? null
          }))
          .filter((p) => {
            const norm = p.name.replace(/[\s\(\)（）　]/g, '').toLowerCase();
            if (seenScored.has(norm)) return false;
            seenScored.add(norm);
            return true;
          })
          .sort((a, b) => b.aiScore - a.aiScore)
          .slice(0, max)
          .map((p) => withCityPhotoFallback(p, key));

        return {
          source: 'external_google_places_ai_scored',
          sourceInfo: sourceInfo('live', 'google_places'),
          city: city.label,
          theme,
          pace,
          budget,
          summary: recommendationSummary(key, scored.length, lang),
          picks: scored
        };
      }
      fallbackReason = 'NO_RESULTS';
    } catch (err) {
      fallbackReason = err?.reasonCode || 'GOOGLE_ERROR';
      if (!err?.reasonCode) warnThrottled('places:recommend', `[places] 추천 조회 실패 → 내장 추천으로 대체: ${redactGoogleKey(err?.message || err)}`);
    }
  }

  // 자기 사진이 없는 명소 카드는 도시 대표 사진(scope 'city')으로 채운다.
  const scored = buildCuratedPicks(key, city, theme, lang, max).map((p) => withCityPhotoFallback(p, key));

  return {
    // source는 예전 값 그대로(호환용). 실제 의미는 sourceInfo를 본다.
    source: 'local_curated_fallback',
    sourceInfo: GOOGLE_PLACES_ENABLED
      ? sourceInfo('fallback', 'curated+wikimedia', fallbackReason || 'GOOGLE_ERROR')
      : sourceInfo('curated', 'curated+wikimedia'),
    city: city.label,
    theme,
    pace,
    budget,
    summary: recommendationSummary(key, scored.length, lang),
    picks: scored
  };
}

// 이름 비교용 키(공백·괄호·가운뎃점 등을 빼고 소문자)
function placeNameKey(name) {
  return String(name || '').toLowerCase().replace(/[\s()（）[\]・·.,'"`_-]/g, '');
}

// 장소의 원래(한글) 이름 — 현지화된 카드는 nameKo에 원래 이름이 있다.
function placeOriginalName(p) {
  return String(p?.nameKo || p?.name || '').trim();
}

// 도시의 MUST_ATTRACTIONS 중 highlights와 겹치지 않는 것만(이름·별칭·위키데이터 ID로 비교)
function mustAttractionsForCity(cityKey) {
  const city = CITY_DATA[cityKey];
  if (!city) return [];
  const highlightKeys = new Set((city.highlights || []).map((h) => placeNameKey(h.name)));
  const seenQids = new Set((city.highlights || []).map((h) => placeMediaFor(cityKey, h.name)?.wikidata).filter(Boolean));
  const out = [];
  for (const m of MUST_ATTRACTIONS) {
    if (m.cityKey !== cityKey) continue;
    if ([m.name, ...(m.aliases || [])].some((n) => highlightKeys.has(placeNameKey(n)))) continue;
    const qid = placeMediaFor(cityKey, m.name)?.wikidata;
    if (qid && seenQids.has(qid)) continue;
    if (qid) seenQids.add(qid);
    out.push(m);
  }
  return out;
}

// 내장 큐레이션 명소 풀: highlights + 겹치지 않는 대표 명소(MUST). 사진·좌표를 붙이고 lang에 맞춰 표기한다(Google 호출 없음).
function curatedCityPool(cityKey, lang = 'ko') {
  const c = CITY_DATA[cityKey];
  if (!c) return [];
  const highlights = (c.highlights || []).map((h) => ({ ...h, city: c.label, mapUrl: mapUrl(`${h.name} ${c.label}`) }));
  const must = mustAttractionsForCity(cityKey).map((m) => ({
    name: m.name,
    city: c.label,
    area: m.area || c.label,
    category: '대표 명소',
    // 테마파크·먼 당일치기는 하루 전체가 든다(규칙 일정은 '종일' 칸에 혼자 넣는다)
    bestTime: (m.fullDay || m.dayTrip) ? '09:00-18:00' : '10:00-17:00',
    stayMin: (m.fullDay || m.dayTrip) ? 480 : 100,
    crowdScore: 3,
    ...(m.fullDay ? { fullDay: true } : {}),
    ...(m.dayTrip ? { dayTrip: true } : {}),
    mapUrl: mapUrl(`${m.name} ${c.label}`)
  }));
  // 마지막 순서: 추가 명소(박물관·수족관 등), 그다음 도시 주변 실제 명소(generated, assets/city-places.json).
  // 도시 명소·대표 명소를 다 쓴 뒤에만 쓰이고, '실내 위주'일 때 실내 후보가 된다. 도시 명소로 올라간 것은 한 번만 둔다.
  const highlightNames = new Set(highlights.map((h) => h.name));
  const extras = EXTRA_PLACES.filter((e) => e.cityKey === cityKey && !highlightNames.has(e.name)).map((e) => extraPlaceCard(e, c));
  return [...highlights, ...must, ...extras].map((p) => localizeCuratedPlace(attachPlaceMedia(p, cityKey, p.name), cityKey, lang));
}

// 추가 명소 한 곳 → 후보 카드(한글 원본. 현지화는 localizeCuratedPlace)
function extraPlaceCard(e, city) {
  const c = city || CITY_DATA[e.cityKey] || {};
  return {
    name: e.name,
    city: c.label || '',
    area: e.area || c.label || '',
    category: e.category || '대표 명소',
    bestTime: e.bestTime || '10:00-17:00',
    stayMin: e.stayMin || 90,
    crowdScore: 2,
    lat: e.lat,
    lng: e.lng,
    ...(e.indoor ? { indoor: true } : {}),
    ...(e.fullDay ? { fullDay: true } : {}),
    ...(e.dayTrip ? { dayTrip: true } : {}),
    ...(e.wikidata ? { wikidata: e.wikidata } : {}),
    mapUrl: mapUrl(`${e.name} ${c.label || ''}`)
  };
}

// 실내 위주(비 오는 날) 후보: 경로 도시의 실내 명소(추가 명소 포함). lang으로 표기한다.
function indoorPicksForCities(cityKeys, lang) {
  const out = [];
  for (const ck of Array.from(new Set(cityKeys || [])).filter((k) => CITY_DATA[k])) {
    curatedCityPool(ck, lang).filter((p) => isLikelyIndoor(p) && !allDayPlaceKind(p, ck)).forEach((p) => out.push(p));
  }
  return out;
}

// AI 일정 후보: 하루에 넘기는 후보 수. 하루 2~3곳을 채우고(후처리의 빈 낮 채우기 포함) 같은 곳을 되풀이하지 않을 만큼.
// 후보 확장 목표(expandPicksForAi)와 AI에 넘기는 도시별 몫(selectAiPicks)이 같은 값을 쓴다.
const AI_PICKS_PER_DAY = 3;

// 사진 데이터(place-images.json)에 있는 그 도시 명소 → 후보 카드(필요한 만큼만 만든다)
function* placeImageCandidates(ck, c, lang) {
  for (const mapKey of PLACE_IMAGES.byKey.keys()) {
    if (!mapKey.startsWith(`${ck}|`)) continue;
    const name = mapKey.slice(ck.length + 1);
    yield localizeCuratedPlace(attachPlaceMedia({
      name, city: c.label, area: c.label, category: '대표 명소', bestTime: '10:00-17:00', stayMin: 90,
      mapUrl: mapUrl(`${name} ${c.label}`)
    }, ck, name), ck, lang);
  }
}

// AI 일정 후보가 모자라면(무료 모드·대체 데이터) 경로 도시의 대표 명소와 사진 데이터(place-images.json)의
// 같은 도시 명소를 보탠다. 이미 있는 장소(이름·위키데이터 ID)는 건너뛴다.
// - 도시가 하나면(opts.cityTargets 없음): 전체 days×3곳(최대 20곳)까지.
// - 도시가 여럿이면 opts.cityTargets(도시 키 → 목표 수 = 그 도시 일수×3)만큼 도시마다 채운다.
//   첫 도시만 채우고 멈추지 않는다. 날짜가 없는 도시(목표 0)는 보태지 않는다.
// opts.countable(p): 목표 수에 세는 후보(도시가 하나일 때도 같다). 하루짜리는 늘 세지 않고, 나중에 조건으로 걸러질 장소
//   (쇼핑 제외의 쇼핑 장소·저예산의 유료 명소)와 실내 위주일 때의 야외 장소도 세지 않는다. 세면 그 장소로 목표가 차서
//   확장을 멈추고, 조건 필터 뒤에 후보가 모자란다(후쿠오카 1일 쇼핑 제외 2곳, 가나자와 1일 실내 위주 실내 0곳 — 2026-10-03).
// skip(p): 보태지 않을 후보(예: 요청하지 않은 하루짜리 장소) — 그 대신 다른 명소로 목표 수를 채운다.
// opts.keep(p): 뒤로 미루지 않을 곳(요청한 곳, 실내 위주일 때의 실내 장소). 그 밖의 도시 주변 실제 명소(generated) 카드는
//   큐레이션 명소(대표 명소·추가 명소) 뒤로 미룬다(실내 명소는 대부분 생성 장소라 미루면 야외 큐레이션 명소만 남는다).
//   미루지 않은 실내 생성 장소는 받은 순서대로 남고, 큐레이션 실내 명소 뒤로 보내는 것은 buildTravelPlan의 조건 필터(applyPrefFilters)가 한다.
// opts.allDaySlots: 이 일정이 요청하지 않은 하루짜리를 넣을 수 있는 수(buildTravelPlan의 unrequestedAllDayLimit, 여러 도시일 때만 본다).
// 추천 카드가 도시 명소 + 생성 장소(30곳까지)라 카드 순서 그대로 쓰면 교토 2일 6곳이 카드(히에이산·료안지·도지)로 다 차서
// 금각사·니시키 시장이 AI 후보에서 빠진다(2026-10-03). 그래서 일수·도시 수와 관계없이 요청하지 않은 생성 장소는
// 큐레이션 명소를 다 넣은 뒤에만, 목표 수까지만 쓴다(규칙 일정 createItinerary와 같은 순서). 여러 도시면 그 목표가 도시마다다.
function expandPicksForAi(picks, cityKeys, lang, days, skip = null, opts = {}) {
  const input = Array.isArray(picks) ? picks : [];
  const keep = opts && typeof opts.keep === 'function' ? opts.keep : null;
  const countable = opts && typeof opts.countable === 'function' ? opts.countable : () => true;
  const cityTargets = opts && opts.cityTargets instanceof Map && opts.cityTargets.size > 1 ? opts.cityTargets : null;
  const target = Math.min(20, Math.max(0, Number(days) || 0) * AI_PICKS_PER_DAY);
  const firstCity = (cityKeys || [])[0];
  const late = (p) => !(keep && keep(p)) && isGeneratedCityPlace(p, firstCity);
  const base = input.filter((p) => !late(p)); // 받은 카드 중 요청한 곳·큐레이션 명소(목표 수를 넘어도 모두 남긴다)
  const added = []; // 보탠 큐레이션 명소(도시 명소 풀·사진 데이터)
  const lateList = input.filter(late); // 요청하지 않은 생성 장소(카드 → 보탠 것 순서)
  const seenNames = new Set(input.map((p) => placeNameKey(placeOriginalName(p))));
  const seenQids = new Set(input.map((p) => p?.wikidata).filter(Boolean));
  // 보탠 곳이 큐레이션 명소면 'added', 생성 장소면 'late'(뒤로 미룸), 건너뛰면 ''
  const tryAdd = (p) => {
    const k = placeNameKey(placeOriginalName(p));
    if (!k || seenNames.has(k) || (p.wikidata && seenQids.has(p.wikidata))) return '';
    if (typeof skip === 'function' && skip(p)) return '';
    seenNames.add(k);
    if (p.wikidata) seenQids.add(p.wikidata);
    if (late(p)) { lateList.push(p); return 'late'; }
    added.push(p);
    return 'added';
  };
  if (cityTargets) {
    // 받은 후보 전체(생성 장소 포함)로 센다(예전 확장의 'base.length >= target이면 그대로'와 같은 기준). 생성 장소를 뺀 base로 세면
    // 거의 늘 목표보다 적어, 이미 목표를 채운 도시(도쿄)의 하루짜리까지 살펴 3·4일 도쿄·시즈오카에 디즈니·후지큐·닛코 …
    // '일정에 넣지 않은 하루짜리' 카드가 12장 붙었다(2026-10-03 R3).
    const belowSingleTarget = input.length < target;
    // 목표를 못 채운 도시의 하루짜리도 후보가 넉넉하면(belowSingleTarget 아님) 일정에 요청하지 않은 하루짜리를 넣을 수 있는
    // 일정(opts.allDaySlots > 0: 5일 이상)일 때만 살핀다. 4일 이하는 하루짜리를 일정에 못 넣어 카드만 늘어난다
    // (4일 도쿄·오사카에 USJ·히메지성·고야산·나라, 4일 도쿄·나고야에 디즈니·후지큐 …, 2026-10-03 R3). allDaySlots가 없으면 살핀다.
    const allDaySlots = opts.allDaySlots === undefined ? Infinity : (Number(opts.allDaySlots) || 0);
    const lookAllDay = belowSingleTarget || allDaySlots > 0;
    const have = new Map();
    const bump = (p, ck) => { if (countable(p)) have.set(ck, (have.get(ck) || 0) + 1); };
    base.forEach((p) => bump(p, cityKeyByLabel(p?.city)));
    for (const ck of [...new Set(cityKeys || [])]) {
      const c = CITY_DATA[ck];
      const goal = Number(cityTargets.get(ck)) || 0;
      if (!c || goal <= 0) continue;
      const full = () => (have.get(ck) || 0) >= goal;
      // 이미 목표만큼 있는 도시는 보태지 않고 하루짜리도 살피지 않는다. 단 전체 후보가 도시가 하나일 때의 목표
      // (days×3, 최대 20)보다 적으면 예전처럼 하루짜리를 살핀다(5일 오사카·교토의 히메지성·고야산 카드).
      // 짧은 여러 도시 일정에 '일정에 넣지 않은 하루짜리' 카드가 도시마다 잔뜩 붙지 않게
      // (예: 2일 도쿄·교토·오사카에 디즈니·후지큐·닛코 …: 도시가 하나일 때 후보가 넉넉하면 확장하지 않는 것과 같다)
      if (full() && !belowSingleTarget) continue;
      const add = (p) => { if (tryAdd(p) === 'added') bump(p, ck); };
      // 보태는 도시의 하루짜리(테마파크·먼 당일치기)는 목표와 상관없이 도시가 하나일 때처럼 skip에 맡긴다
      // (허용 수만큼 넣고, 나머지는 '일정에 넣지 않은 하루짜리' 추천 카드로 남는다). 살피지 않을 때(lookAllDay 아님)는 건너뛴다.
      // 사진 데이터 후보의 하루짜리(나고야의 게로 온천·지브리파크 …)도 같다.
      const addAllDay = (p) => { if (lookAllDay) tryAdd(p); };
      for (const p of curatedCityPool(ck, lang)) {
        if (allDayPlaceKind(p, ck)) { addAllDay(p); continue; }
        if (!full()) add(p);
      }
      for (const p of placeImageCandidates(ck, c, lang)) {
        if (full()) break;
        if (allDayPlaceKind(p, ck)) { addAllDay(p); continue; }
        add(p);
      }
    }
    // 큐레이션 명소로 목표를 채우지 못한 도시만 요청하지 않은 생성 장소로 채운다(도시마다 목표 수까지, 날짜 없는 도시는 0)
    const out = [...base, ...added];
    for (const p of lateList) {
      const ck = cityKeyByLabel(p?.city) || firstCity;
      if ((have.get(ck) || 0) >= (Number(cityTargets.get(ck)) || 0)) continue;
      out.push(p);
      bump(p, ck);
    }
    return out;
  }
  // 목표 수에는 반나절 명소만 센다: 하루짜리(오우치주쿠·아소 화산)는 하루를 다 쓰고, 요청하지 않았으면 4일 이하 일정에서 뒤(limitAllDay)에 빠진다
  // (세면 후쿠시마 1일 후보가 2곳뿐이 된다). 조건으로 빠지거나 뒤로 갈 장소(opts.countable이 아닌 것)도 세지 않는다.
  const counts = (p) => !allDayPlaceKind(p, firstCity) && countable(p);
  const baseCount = base.filter(counts).length;
  let have = baseCount;
  // 받은 카드(큐레이션)는 모두, 보탠 명소 → 생성 장소는 반나절 명소가 목표 수가 될 때까지만(전체 20곳까지)
  const finish = () => {
    const out = [...base];
    let n = baseCount;
    for (const p of [...added, ...lateList]) {
      if (n >= target || out.length >= 20) break;
      out.push(p);
      if (counts(p)) n += 1;
    }
    return out;
  };
  if (have >= target) return finish();
  // 하루짜리(테마파크·먼 당일치기)는 여러 도시일 때와 같은 기준으로만 살핀다: 받은 후보 전체가 목표보다 적거나(예전 확장 기준),
  // 이 일정이 요청하지 않은 하루짜리를 넣을 수 있을 때(opts.allDaySlots > 0: 5일 이상). 반나절 명소를 세는 기준(counts)이 쇼핑·유료·
  // 생성 장소를 빼면서 2일 일정도 여기까지 와, 2일 도쿄(쇼핑 제외)에 디즈니·후지큐·닛코·하코네 … 일정에 못 넣는 하루짜리 카드가
  // 11장 붙었다(2026-10-03). 살피지 않는 하루짜리는 skip에 넘기지 않아 '일정에 넣지 않은 하루짜리' 카드도 되지 않는다.
  const allDaySlots = opts.allDaySlots === undefined ? Infinity : (Number(opts.allDaySlots) || 0);
  const lookAllDay = input.length < target || allDaySlots > 0;
  const addOne = (p, ck) => {
    if (!lookAllDay && allDayPlaceKind(p, ck)) return;
    if (tryAdd(p) === 'added' && counts(p)) have += 1;
  };
  for (const ck of [...new Set(cityKeys || [])]) {
    const c = CITY_DATA[ck];
    if (!c) continue;
    curatedCityPool(ck, lang).forEach((p) => addOne(p, ck));
    for (const p of placeImageCandidates(ck, c, lang)) {
      if (have >= target) break;
      addOne(p, ck);
    }
    if (have >= target) break;
  }
  return finish();
}

function localizeTransferHint(hint, lang) {
  if (lang === 'ko') return hint;
  return TRANSFER_HINT_I18N[hint]?.[lang] || hint;
}

// ── 일정 공통 도구: 장소 판정·시각·사용자 의도(꼭 갈 곳·제외) ──
function placeText(p) {
  return `${p?.name || ''} ${p?.nameKo || ''} ${p?.category || ''} ${p?.area || ''}`;
}
const SHOPPING_PLACE_RE = /쇼핑|아울렛|백화점|\bmall\b|\bstore\b|shopping|outlet|ショッピング|百貨店|モール|아웃렛|캐널시티|canal\s*city|キャナルシティ|긴자\s*식스|ginza\s*six|돈키호테|don\s*quijote|ドン・?キホーテ|라라포트|lalaport|이온몰|aeon\s*mall|파르코|\bparco\b|다이마루|daimaru|미츠코시|mitsukoshi|이세탄|isetan|아메리칸\s*빌리지|american\s*village|헤이와도리\s*쇼핑|지하상가|商店街/i;
function isLikelyShopping(p) {
  return SHOPPING_PLACE_RE.test(placeText(p));
}
// 지역 이름의 짧은 꼴: '가나가와 하코네' → '하코네', 'Hakone, Kanagawa' → 'Hakone' (현지 식사 안내용)
function shortAreaName(area) {
  const a = String(area || '').trim();
  if (!a) return '';
  if (a.includes(',')) return a.split(',')[0].trim();
  const parts = a.split(/\s+/);
  return parts.length > 1 && /[가-힣]/.test(a) ? parts[parts.length - 1] : a;
}

// 입장료가 비싼 곳(저예산이면 뺀다): 테마파크(하루짜리 fullDay)·전망대·수족관·팀랩. 신사·절·공원·거리·시장·박물관(저렴)은 아니다.
const PAID_SIGHT_RE = /스카이|타워|전망대|하루카스|스카이트리|수족관|팀랩|\bsky\b|tower|observatory|harukas|skytree|aquarium|teamlab|スカイ|タワー|展望台|水族館|チームラボ/i;
function isPaidSightPlace(p, cityKey = '') {
  if (!p || p.freeTime) return false;
  if (allDayPlaceKind(p, cityKeyByLabel(p.city) || cityKey) === 'fullDay') return true;
  if (/^(?:전망|Viewpoint|展望|수족관|Aquarium|水族館)$/.test(String(p.category || ''))) return true;
  return PAID_SIGHT_RE.test(`${p.name || ''} ${placeOriginalName(p)}`);
}

// 실내(비를 피할 수 있는) 장소인지. 신사·절·공원·정원·성(정원)·거리·바깥 시장·해변·옥외 전망대(시부야 스카이)는 실내가 아니다.
const INDOOR_PLACE_NAMES = new Set(['긴자 식스', '캐널시티 하카타', '도쿄 타워', '우메다 스카이 빌딩', '삿포로 TV 타워', '후쿠오카 타워', '츄라우미 수족관',
  '니시키 시장', '닌텐도 뮤지엄', '도쿄 해리포터 스튜디오', '네부타 박물관', '아키타 현립 미술관', '미야자와 겐지 기념관', '니가타 수족관', '글래스 미술관',
  '도요타 산업기술 기념관', '오아시스21', '아와오도리 회관', '아바시리 유빙관', '삿포로 맥주박물관', '미사와 항공박물관', '아키타견 박물관', '가모 수족관',
  '모래 미술관', '다네가시마 우주센터', '아오모리 현립미술관', '하카타 리버레인']);
const OUTDOOR_PLACE_NAMES = new Set(['시부야 스카이']);
const INDOOR_PLACE_RE = /박물관|미술관|수족관|기념관|과학관|뮤지엄|전시|플라네타리움|팀랩|스카이트리|하루카스|쇼핑몰|백화점|지하상가|museum|aquarium|gallery|planetarium|teamlab|skytree|harukas|\bmall\b|department\s+store|博物館|美術館|水族館|記念館|科学館|ミュージアム|スカイツリー|ハルカス|モール|百貨店/i;
function isLikelyIndoor(p) {
  if (!p) return false;
  const ko = placeOriginalName(p);
  if (OUTDOOR_PLACE_NAMES.has(ko)) return false;
  if (p.indoor || INDOOR_PLACE_NAMES.has(ko) || extraPlaceByName(ko)?.indoor) return true;
  // 이름·종류에 실내 낱말(박물관·수족관·백화점 …)이 있거나, 종류가 쇼핑(쇼핑몰·백화점)이면 실내
  return INDOOR_PLACE_RE.test(`${p.name || ''} ${ko} ${p.category || ''}`) || /^쇼핑$|^Shopping$|^ショッピング$/.test(String(p.category || ''));
}

// 일정 블록 문자열을 시작 시각 순으로(시각 없는 안내 문장은 원래 순서대로 맨 앞)
function sortBlockTexts(blocks) {
  const list = (Array.isArray(blocks) ? blocks : []).map((text, idx) => {
    const m = ITINERARY_MAIN_BLOCK_RE.exec(String(text || ''));
    return { text, idx, start: m ? clockToMin(normalizeClockText(m[2])) : null };
  });
  return list.sort((a, b) => {
    if (a.start === null || b.start === null) return (a.start === null ? -1 : 0) - (b.start === null ? -1 : 0) || a.idx - b.idx;
    return (a.start - b.start) || (a.idx - b.idx);
  }).map((x) => x.text);
}

// 'HH:MM' ↔ 분
function clockToMin(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}
function minToClock(min) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(Number(min) || 0)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

// 첫날·마지막 날 시간 경계: 항공편(있으면) → 채팅에서 말한 도착·출발 시각(prefs.arrivalTime/departureTime).
// 첫날은 도착+90분 이후, 마지막 날은 출발−120분까지(규칙 일정 createItinerary와 같은 규칙).
function flightDayBounds(payload, prefs = {}) {
  const legs = Array.isArray(payload?.flight?.legs) ? payload.flight.legs : [];
  const outbound = legs[0];
  const inbound = legs.length > 1 ? legs[legs.length - 1] : null;
  const arrivalRaw = String(outbound?.arrivalTime || prefs.arrivalTime || payload?.arrivalTime || '');
  const departureRaw = String(inbound?.departureTime || prefs.departureTime || payload?.departureTime || '');
  const arrival = clockToMin(normalizeClockText(arrivalRaw));
  const departure = clockToMin(normalizeClockText(departureRaw));
  return {
    arrival: arrival !== null ? minToClock(arrival) : '',
    departure: departure !== null ? minToClock(departure) : '',
    day1MinStart: arrival !== null ? arrival + 90 : null,
    lastDayMaxEnd: departure !== null ? departure - 120 : null
  };
}

// 일정 요청의 조건(specialPrefs)에 채팅이 따로 보낸 시각(startTimeMin·arrivalTime·departureTime)을 합친다.
function planPrefs(payload) {
  const prefs = payload && typeof payload._specialPrefs === 'object' && payload._specialPrefs && !Array.isArray(payload._specialPrefs)
    ? { ...payload._specialPrefs } : {};
  for (const k of ['startTimeMin', 'arrivalTime', 'departureTime']) {
    const v = clockOrEmpty(prefs[k]) || clockOrEmpty(payload?.[k]);
    if (v) prefs[k] = v; else delete prefs[k];
  }
  return prefs;
}

// 빼 달라는 이름 → 비교 키 모음. 대표 명소 이름·별칭에 그 낱말이 들어 있으면 그 명소도 뺀다('디즈니' → 디즈니랜드·디즈니씨).
// 도시 이름('도쿄')은 장소가 아니라서 무시한다.
function resolveExcludedNameKeys(list) {
  const keys = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const name = normalizeWantedPlaceName(String(raw || '').trim());
    if (!name || exactCityKeyForToken(name)) continue;
    const k = placeNameKey(name);
    if (!k || k.length < 2) continue;
    keys.add(k);
    for (const m of MUST_ATTRACTIONS) {
      const hit = [m.name, ...(m.aliases || [])].some((n) => {
        const nk = placeNameKey(n);
        return nk && (nk.includes(k) || (nk.length >= 3 && k.includes(nk)));
      });
      if (hit) keys.add(placeNameKey(m.name));
    }
  }
  return keys;
}

// 장소(객체 또는 이름)가 제외 대상인지. en/ja 이름은 원래 한글 이름으로도 비교한다.
function isExcludedPlace(p, excludedKeys) {
  if (!excludedKeys || excludedKeys.size === 0 || !p) return false;
  const base = typeof p === 'string' ? [p] : [p.name, p.nameKo];
  const names = base.filter(Boolean);
  names.slice().forEach((n) => { const ko = koPlaceNameForLabel(n, ''); if (ko) names.push(ko); });
  return names.some((n) => {
    const k = placeNameKey(n);
    if (!k) return false;
    for (const x of excludedKeys) if (k === x || (x.length >= 2 && k.includes(x))) return true;
    return false;
  });
}

// 이름 비교: 같거나, 블록 이름이 후보 이름을 포함하거나(도톤보리 거리 ⊃ 도톤보리), 3자 이상 블록 이름이 후보에 포함될 때
// 이름의 글자(한글 음절·한자·가나·로마자·숫자) 목록. 공백·기호는 뺀다.
function nameLetters(s) {
  return Array.from(String(s || '').toLowerCase().normalize('NFKC')).filter((ch) => /[\p{L}\p{N}]/u.test(ch));
}
// 두 이름이 같은 글자를 얼마나 나눠 갖는지: 겹친 글자 수 / 긴 쪽 글자 수 (0..1)
function nameOverlap(a, b) {
  const x = nameLetters(a);
  const y = nameLetters(b);
  if (!x.length || !y.length) return 0;
  return sharedLetterCount(x, y) / Math.max(x.length, y.length);
}
function sharedLetterCount(x, y) {
  const pool = new Map();
  for (const ch of y) pool.set(ch, (pool.get(ch) || 0) + 1);
  let n = 0;
  for (const ch of x) { const c = pool.get(ch) || 0; if (c > 0) { n += 1; pool.set(ch, c - 1); } }
  return n;
}
// 이름과 여러 표기 중 가장 많이 겹친 글자 수
function sharedLetters(name, labels) {
  const x = nameLetters(name);
  return Math.max(0, ...(labels || []).map((l) => sharedLetterCount(x, nameLetters(l))));
}

function placeKeyMatches(blockKey, candKey) {
  if (!blockKey || !candKey) return false;
  return blockKey === candKey || (candKey.length >= 2 && blockKey.includes(candKey)) || (blockKey.length >= 3 && candKey.includes(blockKey));
}

// 꼭 갈 곳(mustVisit) → [{ name(일정에 쓸 이름), nameKo, area, city(한글 도시 label), allDay, pick(후보에 이미 있으면 그 후보), synthetic(새로 만든 후보) }]
// 순서: 후보(picks) → 대표 명소(별칭) → 경로 도시 명소(highlights) → 데이터에 없으면 사용자가 쓴 이름 그대로.
function resolveMustVisit(rawList, picks, routeCityKeys, lang, excludedKeys) {
  const out = [];
  const keys = (routeCityKeys || []).filter((k) => CITY_DATA[k]);
  const mainKey = keys[0] || 'tokyo';
  for (const tok of dedupePlaceNames(rawList, 8)) {
    if (exactCityKeyForToken(tok)) continue; // 도시 이름은 장소가 아니다
    if (isExcludedPlace(tok, excludedKeys)) continue;
    const tk = placeNameKey(tok);
    const pick = (picks || []).find((p) => [p.name, p.nameKo].filter(Boolean).some((n) => placeKeyMatches(placeNameKey(n), tk) || placeKeyMatches(tk, placeNameKey(n))));
    if (pick) {
      const ck = cityKeyByLabel(pick.city) || mainKey;
      out.push({ name: pick.name, nameKo: placeOriginalName(pick), area: pick.area || pick.city || '', city: pick.city || CITY_DATA[ck]?.label || '', allDay: Boolean(allDayPlaceKind(pick, ck)), pick });
      continue;
    }
    const lower = tok.toLowerCase();
    const mustHits = dedupeMustMatches(MUST_ATTRACTIONS.filter((m) => placeNameKey(m.name) === tk
      || (m.aliases || []).some((a) => String(a).toLowerCase() === lower || aliasInText(lower, a))
      || (tk.length >= 2 && placeNameKey(m.name).includes(tk))), keys);
    const must = mustHits.find((m) => keys.includes(m.cityKey)) || mustHits[0];
    let ck = must?.cityKey || '';
    let baseName = must?.name || '';
    if (!must) {
      for (const k of keys) {
        const h = (CITY_DATA[k].highlights || []).find((x) => placeKeyMatches(placeNameKey(x.name), tk) || placeKeyMatches(tk, placeNameKey(x.name)));
        if (h) { ck = k; baseName = h.name; break; }
      }
    }
    if (!ck) ck = mainKey;
    // 추가 명소는 일정의 다른 도시 것을 먼저 찾는다(도쿄·삿포로 일정의 '나카지마 공원' = 삿포로, 파일 순서상 앞인 오카다마 아님 → 없는 도시 이동이 생기지 않는다)
    const synthetic = buildSyntheticWantedDestinations([baseName || tok], ck, 1, { routeCityKeys: keys })[0];
    if (!synthetic) continue;
    // 그 추가 명소가 주 도시가 아닌 경로 도시의 것이면 사진·en/ja 이름도 그 도시로 찾는다(en 일정에 '나카지마 공원'이 한글로 남지 않게)
    const synthKey = cityKeyByLabel(synthetic.city);
    if (!must && !baseName && synthKey && synthKey !== ck && keys.includes(synthKey)) ck = synthKey;
    const highlight = (CITY_DATA[ck]?.highlights || []).find((h) => h.name === baseName);
    if (highlight) Object.assign(synthetic, { area: highlight.area || synthetic.area, category: highlight.category || synthetic.category, bestTime: highlight.bestTime || synthetic.bestTime, stayMin: highlight.stayMin || synthetic.stayMin });
    const localized = localizeCuratedPlace(attachPlaceMedia(synthetic, ck, synthetic.name), ck, lang);
    // 데이터에 없는 곳(예: 팀랩 플래닛)은 사용자가 쓴 이름 그대로 둔다.
    const entry = { name: localized.name, nameKo: placeOriginalName(localized), area: localized.area, city: localized.city, allDay: Boolean(localized.fullDay || localized.dayTrip || allDayPlaceKind(localized, ck)), synthetic: localized };
    out.push(entry);
  }
  // 같은 곳 두 번(별칭 둘 → 같은 명소) 제거
  const seen = new Set();
  return out.filter((m) => {
    const k = placeNameKey(m.nameKo || m.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// 일정 요청의 사용자 의도 필드 정리: request ≤500자(검증은 600자), mustVisit/excludedPlaces 문자열 8개·foodWishes 3개(각 60자),
// _picks 객체 8개(이름 80자). 배열이 아니면 무시한다.
function sanitizePlanIntent(payload) {
  const p = { ...(payload || {}) };
  const strList = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max).map((x) => x.trim().slice(0, 60)) : []);
  p.request = typeof p.request === 'string' ? p.request.trim().slice(0, 500) : '';
  p.mustVisit = strList(p.mustVisit, 8);
  p.excludedPlaces = strList(p.excludedPlaces, 8);
  p.foodWishes = strList(p.foodWishes, 3);
  if (Array.isArray(p._picks)) {
    p._picks = p._picks.filter((x) => x && typeof x === 'object' && !Array.isArray(x) && typeof (x.name || x.label) === 'string')
      .slice(0, 8)
      .map((x) => ({ ...x, name: String(x.name || x.label).trim().slice(0, 80), ...(typeof x.nameKo === 'string' ? { nameKo: x.nameKo.slice(0, 80) } : {}) }));
  } else {
    delete p._picks;
  }
  return p;
}

// AI 프롬프트 'Constraints:' 아래에 넣을 문장(조건을 덩어리 대신 문장으로)
function aiConstraintLines(prefs, flight, days, parsedTimes = {}) {
  const p = prefs || {};
  const lines = [];
  const bounds = flightDayBounds({ flight }, { ...p, ...parsedTimes });
  const startMin = clockToMin(parsedTimes.startTimeMin || p.startTimeMin);
  if (startMin !== null || p.lateStart) lines.push(`Start every day at ${startMin !== null ? minToClock(startMin) : '10:30'} or later.`);
  if (Number(p.maxPlacesPerDay) > 0) {
    const n = clamp(Number(p.maxPlacesPerDay), 1, 5);
    lines.push(`At most ${n} sightseeing blocks per day (meals not counted).`);
  }
  if (p.removeShopping) lines.push('No shopping places.');
  if (p.indoorFocus) lines.push('Rainy days: use picks with indoor:true; at most one outdoor place per day.');
  if (p.lowBudget) lines.push('Low budget: prefer free sights (temples, shrines, parks, streets, markets); no theme parks or paid observation decks unless they are in mustVisit.');
  if (typeof p.overnightAt === 'string' && p.overnightAt) lines.push(`The traveler stays overnight in ${p.overnightAt}: on its 종일 day eat dinner there, and start the next day after 11:00.`);
  if (p.lowWalking || p.kidsFriendly || p.strollerFriendly) lines.push('Few places close together, little walking, kid/senior friendly.');
  if (p.relaxedPace) lines.push('Relaxed pace with breaks.');
  if ((p.addRestDay || p.doNothingDay) && Number(days) >= 3) lines.push('Make one middle day a rest day with a single 오후 free-time block.');
  if (p.nightViewFocus) lines.push('Include one evening view per day if available (period 오후 with its real time).');
  if (p.publicTransitOnly) lines.push('Public transit only.');
  if (bounds.day1MinStart !== null) lines.push(`Day 1 blocks start after ${minToClock(bounds.day1MinStart)}.`);
  else if (p.firstDayShort) lines.push('Day 1 blocks start after 15:00.');
  if (bounds.lastDayMaxEnd !== null && Number(days) >= 1) lines.push(`Last day blocks end by ${minToClock(Math.max(0, bounds.lastDayMaxEnd))}.`);
  return lines;
}

// AI 일정 후보 맛집: 경로 도시마다 8곳(전체 16곳), 도시 이름(city)과 함께. 실제 가게가 있으면 '찾기' 안내(generic)는 뺀다.
function aiFoodsForCities(cityKeys, lang) {
  const out = [];
  for (const ck of Array.from(new Set(cityKeys || [])).filter((k) => CITY_DATA[k])) {
    const c = CITY_DATA[ck];
    const all = c.foods || [];
    const real = all.filter((f) => !f.generic);
    const cityName = localizedCityName(ck, lang);
    (real.length ? real : all).slice(0, 8).forEach((f) => out.push({
      name: localizeCuratedFoodName(f.name, ck, lang),
      ...(lang !== 'ko' ? { nameKo: f.name } : {}),
      area: localizeCuratedArea(f.area, lang, cityName),
      genre: localizeFoodGenre(f.genre, lang),
      city: c.label
    }));
    if (out.length >= 16) break;
  }
  return out.slice(0, 16);
}

function createItinerary(payload) {
  const key = cityKeyByInput(payload.city);
  const city = CITY_DATA[key] || CITY_DATA.tokyo;
  const lang = normalizeLang(payload.lang);
  const T = RULE_PLAN_TEXT[lang] || RULE_PLAN_TEXT.ko;
  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));
  const flight = payload.flight || null;
  const flightLegs = Array.isArray(flight?.legs) ? flight.legs : [];
  const outbound = flightLegs[0];
  const inbound = flightLegs.length > 1 ? flightLegs[flightLegs.length - 1] : null;
  const flightStartDate = outbound?.date;
  const startDate = flightStartDate || payload.startDate || new Date().toISOString().slice(0, 10);
  const theme = payload.theme || 'mixed';
  const picks = Array.isArray(payload._picks) && payload._picks.length > 0
    ? payload._picks
    : city.highlights.map((p) => localizeCuratedPlace(attachPlaceMedia({ ...p, city: city.label, mapUrl: mapUrl(`${p.name} ${city.label}`), aiScore: 65 }, key, p.name), key, lang));
  const routeCities = deriveRouteCities(payload, picks, city.label);
  const prefs = typeof payload._specialPrefs === 'object' && payload._specialPrefs ? payload._specialPrefs : {};
  // 주 도시 분배의 꼭 갈 곳 기준: buildTravelPlan이 만든 것(규칙 후처리의 날짜별 도시와 같아야 한다), 없으면(/api/itinerary) 여기서 만든다
  const mainCtx = typeof prefs.mainCity === 'string' && prefs.mainCity
    ? (INTERNAL_MAIN_CTX.has(payload._mainCityCtx) ? payload._mainCityCtx
      : mainCityNeedContext(resolveMustVisit((Array.isArray(payload.mustVisit) ? payload.mustVisit : []).filter((x) => typeof x === 'string'), picks,
        routeCities.map((c) => cityKeyByLabel(c)).filter(Boolean), lang, resolveExcludedNameKeys(payload.excludedPlaces)), payload, prefs))
    : null;
  const dayCitySequence = allocateDaysByCities(routeCities, picks, days, payload._regionDayPlan, prefs.mainCity, mainCtx);
  // 화면에 쓰는 도시 이름(내부 비교는 한글 label 그대로)
  const cityDisplay = (label) => {
    const ck = cityKeyForExactLabel(label);
    return ck ? localizedCityName(ck, lang) : String(label || '');
  };
  const placeKey = (p) => placeOriginalName(p);

  // 사용자가 빼 달라고 한 곳(excludedPlaces, '디즈니' → 디즈니랜드·디즈니씨)
  const excludedKeys = resolveExcludedNameKeys(payload.excludedPlaces);
  const notExcluded = (p) => !isExcludedPlace(p, excludedKeys);

  // 도시의 명소 풀(highlights + 대표 명소 + 추가 명소). 지어낸 "추천 명소 N" 같은 채움 장소는 넣지 않는다.
  // 실내 위주면 실내 명소만, 저예산이면 유료 전망대·테마파크를 뒤로.
  // outdoor = true: 실내 위주 일정에서 실내 명소를 다 쓴 뒤 쓰는 바깥 명소(실내가 아닌 곳)만. 다른 조건(제외·쇼핑 빼기·저예산)은 같다.
  const isPaidSight = (p) => isPaidSightPlace(p, key);
  const buildCityAttractionPool = (cityLabel, outdoor = false) => {
    const seen = new Set();
    return curatedCityPool(cityKeyByLabel(cityLabel), lang).filter((x) => {
      const k = placeNameKey(placeKey(x));
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return notExcluded(x) && !(prefs.removeShopping && isLikelyShopping(x))
        && (outdoor ? !isLikelyIndoor(x) : (!prefs.indoorFocus || isLikelyIndoor(x)))
        && !(prefs.lowBudget && isPaidSight(x));
    });
  };

  const formatMinutes = (value) => {
    const safe = Math.max(0, Math.min(1439, Math.round(Number(value) || 0)));
    const h = String(Math.floor(safe / 60)).padStart(2, '0');
    const m = String(safe % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  const formatRange = (range) => `${formatMinutes(range[0])}-${formatMinutes(range[1])}`;

  // minLen: 이보다 짧으면 칸을 만들지 않는다(관광 칸은 60분, 그 밖은 30분)
  const clampRange = (range, minStart, maxEnd, minLen = 30) => {
    const start = Math.max(range[0], minStart);
    const end = Math.min(range[1], maxEnd);
    if (end - start < minLen) return null;
    return [start, end];
  };

  const startHour = (timeRange) => {
    const m = /^(\d{1,2}):/.exec(String(timeRange || ''));
    return m ? Number(m[1]) : 12;
  };

  let planPicks = (Array.isArray(picks) ? [...picks] : []).filter(notExcluded);
  if (prefs.removeShopping) {
    planPicks = planPicks.filter((p) => !isLikelyShopping(p));
  }
  // 요청한 곳(꼭 갈 곳·고른 카드)의 이름 키(buildTravelPlan이 넘긴다). 조건 필터보다 앞선다.
  const requestedNames = new Set(Array.isArray(payload._requestedNames) ? payload._requestedNames : []);
  const isRequestedPick = (p) => requestedNames.has(placeNameKey(placeKey(p)));
  // 도시 주변 실제 명소(generated, assets/city-places.json)는 요청하지 않았으면 후보에서 빼고 도시 명소 풀의 맨 뒤에서만 쓴다
  // (큐레이션 명소: 도시 명소·대표 명소·추가 명소를 다 쓴 뒤). 추천 카드가 도시 명소 + 생성 장소(30곳까지)라 그대로 쓰면
  // 3일 관광 칸 6개가 카드로 다 차서 금각사·니시키 시장 같은 대표 명소가 빠진다(2026-10-03).
  const isGeneratedPick = (p) => !isRequestedPick(p) && isGeneratedCityPlace(p, key);
  let indoorOnly = false;
  if (prefs.indoorFocus) {
    // 실내 위주: 실내 후보가 충분하면(하루 하나 이상) 실내 후보와 요청한 곳만 쓰고, 모자라면 실내 후보를 앞에 둔다.
    // 실내 후보 수에는 생성 장소의 실내 명소(무로 사이세이 기념관 등)도 센다. 생성 장소를 먼저 빼고 세면 실내가 모자란 것으로
    // 판정되어 겐로쿠엔 같은 야외 명소가 들어간다(2026-10-03). 충분하면 센 생성 장소는 아래에서 빼고 도시 명소 풀(실내만)의 뒤에서 쓴다.
    const indoor = planPicks.filter((p) => isLikelyIndoor(p) || isRequestedPick(p));
    if (indoor.length >= Math.min(days, 3)) { planPicks = indoor; indoorOnly = true; }
    else if (indoor.length > 0) planPicks = [...indoor, ...planPicks.filter((p) => !indoor.includes(p))];
  }
  // 실내 위주인데 실내가 모자라면(섬 등): 실내 생성 장소는 실내 후보로 남기고, 야외 생성 장소는 도시 명소 풀(실내만)까지 다 쓴 뒤
  // 자유 일정 전에 쓴다(실내 명소가 없는 리시리에 예전처럼 리시리 후레아이 온천 등을 넣는다)
  const indoorShort = Boolean(prefs.indoorFocus) && !indoorOnly;
  const keepGeneratedPick = (p) => indoorShort && isLikelyIndoor(p);
  let lateGeneratedPicks = indoorShort ? planPicks.filter((p) => isGeneratedPick(p) && !keepGeneratedPick(p)) : [];
  planPicks = planPicks.filter((p) => !isGeneratedPick(p) || keepGeneratedPick(p));
  // 저예산: 요청하지 않은 유료 전망대·수족관·테마파크는 쓰지 않는다(빈 칸은 무료 명소 풀·자유 일정으로)
  if (prefs.lowBudget) {
    planPicks = planPicks.filter((p) => isRequestedPick(p) || !isPaidSight(p));
    lateGeneratedPicks = lateGeneratedPicks.filter((p) => !isPaidSight(p));
  }

  // 하루 전체가 드는 곳(테마파크·먼 당일치기: 디즈니, 후지큐, 쿠사츠 온천 …)은 반나절 칸에 넣지 않고 '종일' 칸에 혼자 넣는다.
  const isAllDayPlace = (p) => Boolean(p && !p.freeTime && allDayPlaceKind(p, key));
  // 야경·석양처럼 해 질 무렵 이후가 좋은 곳(추천 시작 17시 이후)은 오전 칸에 넣지 않고, 오후 칸에 넣을 때는 추천 시간을 쓴다.
  const isEveningPlace = (p) => Boolean(p && !p.freeTime && startHour(p.bestTime) >= 17);
  const notEvening = (list) => (Array.isArray(list) ? list : []).filter((p) => !isEveningPlace(p));
  const clockRangeOf = (timeRange) => {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(String(timeRange || ''));
    return m ? [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])] : null;
  };
  // 같은 장소(위키데이터 항목)는 이름이 달라도 일정에 한 번만 넣는다: 삿포로의 큐레이션 명소 '오도리 공원'과 도시 주변 실제 명소
  // '삿포로 오도리 공원', 미사와 '오이라세 계류'와 아오모리 '오이라세 계곡'이 이틀에 걸쳐 두 번 들어갔다(2026-10-03).
  // 요청한 곳(꼭 갈 곳 먼저, 그다음 고른 카드)의 항목은 그 이름으로만 쓰고, 요청하지 않은 둘이면 먼저 쓴 쪽만 쓴다
  // (명소 풀은 큐레이션 명소가 생성 장소보다 앞이라 큐레이션 이름이 남는다). 야경·석양(저녁 명소: 오카다마 '오도리 야경')은
  // 낮 방문과 하는 일이 달라 같은 항목이어도 함께 둔다.
  const qidCache = new Map();
  const placeQidOf = (p) => {
    if (!p || p.freeTime || isEveningPlace(p)) return '';
    const ck = cityKeyByLabel(p.city) || key;
    const k = `${ck}|${placeKey(p)}`;
    if (!qidCache.has(k)) qidCache.set(k, String(p.wikidata || cityPlaceQid(ck, [placeKey(p), p.name]) || ''));
    return qidCache.get(k);
  };
  const mustNames = new Set(Array.isArray(payload._mustNames) ? payload._mustNames : []);
  const qidOwner = new Map(); // 위키데이터 항목 → 그 항목으로 쓸 요청한 곳의 이름 키
  for (const p of [...planPicks.filter((x) => mustNames.has(placeNameKey(placeKey(x)))), ...planPicks.filter(isRequestedPick)]) {
    const q = placeQidOf(p);
    if (q && !qidOwner.has(q)) qidOwner.set(q, placeNameKey(placeKey(p)));
  }
  const usedQids = new Set(); // 지난날까지 일정에 넣은 항목
  const dayQids = new Set(); // 이날 고른 항목
  const qidTaken = (p) => {
    const q = placeQidOf(p);
    if (!q) return false;
    if (usedQids.has(q) || dayQids.has(q)) return true;
    const owner = qidOwner.get(q);
    return Boolean(owner) && owner !== placeNameKey(placeKey(p));
  };
  const noteDayQid = (p) => { const q = placeQidOf(p); if (q) dayQids.add(q); };
  const allDayPicks = planPicks.filter(isAllDayPlace);
  const regularPicks = planPicks.filter((p) => !isAllDayPlace(p));
  const morningPool = regularPicks.filter((p) => startHour(p.bestTime) < 12);
  const afternoonPool = regularPicks.filter((p) => startHour(p.bestTime) >= 12);
  // (실내 후보만 쓰기로 했으면 카드가 생성 장소뿐이라 비어도 야외 카드로 되돌아가지 않는다: 빈 칸은 실내 도시 명소 풀·자유 일정으로)
  const fallbackPool = regularPicks.length > 0 || indoorOnly ? regularPicks : picks.filter((p) => !isAllDayPlace(p) && notExcluded(p) && !isGeneratedPick(p));
  // 저녁 식사 칸: 실제 가게(내장 큐레이션)를 먼저 쓰고, 없을 때만 '<도시> 이자카야 찾기' 같은 일반 안내를 쓴다.
  const foodsByCity = Object.fromEntries(
    Object.entries(CITY_DATA).map(([k, c]) => {
      const all = c.foods || [];
      const real = all.filter((f) => !f.generic);
      return [c.label, real.length > 0 ? real : all];
    })
  );
  // 먹고 싶다고 한 음식(foodWishes, 예: 라멘·타코야키)은 그 도시 맛집(없으면 '라멘집 찾기' 안내) 중 맞는 곳을 저녁에 먼저 넣는다.
  const foodWishes = (Array.isArray(payload.foodWishes) ? payload.foodWishes : []).map((w) => String(w || '').trim()).filter(Boolean).slice(0, 3);
  const wishDone = new Set();
  const foodMatchesWish = (f, w) => {
    const g = canonicalFoodGenre(w) || w;
    return f.genre === g || f.genre === w || String(f.name || '').includes(w) || String(f.name || '').includes(g);
  };
  const usedDinnerByCity = new Map();
  const pickDinner = (dayCity, i) => {
    const all = CITY_DATA[cityKeyByLabel(dayCity)]?.foods || city.foods || [];
    for (const w of foodWishes) {
      if (wishDone.has(w)) continue;
      const hit = all.find((f) => foodMatchesWish(f, w));
      if (hit) return hit;
    }
    const list = foodsByCity[dayCity] && foodsByCity[dayCity].length > 0 ? foodsByCity[dayCity] : (city.foods || []);
    if (list.length === 0) return null;
    // 같은 도시에서 아직 안 간 곳부터. 실제 가게를 다 썼으면 같은 가게를 되풀이하기 전에
    // 아직 안 쓴 '<도시> 이자카야 찾기' 같은 찾기 안내를 쓰고, 그것도 다 썼을 때만 순서대로 다시.
    const used = usedDinnerByCity.get(dayCity) || new Set();
    const fresh = list.filter((f) => !used.has(f.name));
    if (fresh.length) return fresh[0];
    const freshGeneric = all.filter((f) => f.generic && !used.has(f.name));
    return freshGeneric.length ? freshGeneric[0] : list[i % list.length];
  };
  // 실제로 일정에 넣은 저녁만 '먹음'으로 센다(희망 음식·같은 가게 반복 방지)
  const markDinner = (dayCity, f) => {
    if (!f) return;
    for (const w of foodWishes) if (!wishDone.has(w) && foodMatchesWish(f, w)) wishDone.add(w);
    if (!usedDinnerByCity.has(dayCity)) usedDinnerByCity.set(dayCity, new Set());
    usedDinnerByCity.get(dayCity).add(f.name);
  };
  // 당일치기 장소에서 묵는 경우("하코네 1박2일 료칸"): 그날 저녁은 그곳에서, 다음 날은 늦게 시작해 돌아오는 이동부터
  const overnightAt = typeof prefs.overnightAt === 'string' ? prefs.overnightAt.trim() : '';
  // 명소 풀에서 꺼내 쓸 수 있는 '요청하지 않은 하루짜리' 장소 수(buildTravelPlan이 넘긴다. 없으면 제한 없음)
  const poolAllDayMax = Number.isFinite(Number(payload._poolAllDayMax)) ? Math.max(0, Number(payload._poolAllDayMax)) : Infinity;
  let poolAllDayUsed = 0;
  let overnightFrom = null;

  const lateStart = Boolean(prefs.lateStart);
  // 하루 시작 시각: "아침 10시 이후"(startTimeMin) → 그 시각, 늦은 시작(lateStart)만 있으면 10:30
  const dayStartMin = clockToMin(prefs.startTimeMin) ?? (lateStart ? 10 * 60 + 30 : null);
  const baseRanges = {
    morning: dayStartMin === null ? [8 * 60 + 30, 11 * 60 + 30]
      : (dayStartMin < 12 * 60 ? [dayStartMin, Math.max(dayStartMin + 120, 11 * 60 + 30)] : [0, 0]),
    afternoon: [13 * 60, 17 * 60],
    evening: [18 * 60, 20 * 60]
  };

  // 항공편(또는 채팅에서 말한 도착·출발 시각): 첫날은 도착+90분 이후, 마지막 날은 출발−120분 전까지
  const bounds = flightDayBounds(payload, prefs);
  // 첫날 짧게(firstDayShort)만 있고 도착 시각을 모르면 15:00부터
  const day1MinStart = Number.isFinite(bounds.day1MinStart) ? bounds.day1MinStart : (prefs.firstDayShort ? 15 * 60 : null);
  const lastDayMaxEnd = bounds.lastDayMaxEnd;

  const restDayIndex = (prefs.addRestDay || prefs.doNothingDay) && days >= 3 ? Math.floor(days / 2) : -1;
  const maxPlacesPerDay = clamp(Number(prefs.maxPlacesPerDay || 3), 1, 4);

  const itinerary = [];
  const extraRecommendations = [];
  const recentNamesByCity = new Map();
  const usedPlaceNamesGlobal = new Set();
  // 명소를 다 쓴 칸은 지어낸 장소 이름 대신 "자유 일정 (<지역> 주변 산책)"으로 둔다.
  const freeSeqByCity = new Map();
  let usedFreeTime = false;
  const freeTimeSlot = (cityLabel) => {
    const seq = freeSeqByCity.get(cityLabel) || 0;
    freeSeqByCity.set(cityLabel, seq + 1);
    usedFreeTime = true;
    const areas = CITY_DATA[cityKeyByLabel(cityLabel)]?.areas || [];
    const area = areas.length ? localizeCuratedArea(areas[seq % areas.length], lang, cityDisplay(cityLabel)) : cityDisplay(cityLabel);
    return { freeTime: true, name: T.freeTime, note: T.walkAround(area), city: cityLabel };
  };
  const blockPlace = (p, dayCityName) => (p.freeTime ? `${p.name} (${p.note})` : `${p.name} (${p.area || dayCityName})`);
  const choosePlace = (pool, fallback, seed, bannedNames = new Set()) => {
    const main = Array.isArray(pool) && pool.length > 0 ? pool : (Array.isArray(fallback) ? fallback : []);
    if (main.length === 0) return null;
    const start = Math.abs(seed) % main.length;
    for (let step = 0; step < main.length; step += 1) {
      const idx = (start + step) % main.length;
      const cand = main[idx];
      const name = placeKey(cand);
      if (!name || bannedNames.has(name) || usedPlaceNamesGlobal.has(name) || qidTaken(cand)) continue;
      return cand;
    }
    return null;
  };
  // '종일' 칸: 2일 이상 일정에서 항공편 도착·출발이 없는 날(3일 이상이면 첫날·마지막 날 제외)에만,
  // 일정 기간에 비례한 날 수까지(2~4일 1일, 5~6일 2일 …) 넣는다.
  const maxAllDayDays = days >= 2 ? Math.max(1, Math.floor((days - 1) / 2)) : 0;
  let allDayCount = 0;
  let prevDayAllDay = false;
  for (let i = 0; i < days; i += 1) {
    const dayCity = dayCitySequence[i] || city.label;
    const dayCityName = cityDisplay(dayCity);
    const dayCityKey = cityKeyByLabel(dayCity) || key;
    dayQids.clear();
    if (i === restDayIndex) {
      itinerary.push({
        day: i + 1,
        date: getDateOffset(startDate, i),
        blocks: [
          T.restDay(dayCityName),
          prefs.publicTransitOnly ? T.transitOnly : T.freeRest
        ]
      });
      prevDayAllDay = false;
      continue;
    }
    const afterOvernight = overnightFrom;
    overnightFrom = null;
    // 전날 당일치기 장소에서 묵었으면 체크아웃·이동 뒤 오후부터
    const minStart = Math.max((i === 0 && Number.isFinite(day1MinStart)) ? day1MinStart : 0, dayStartMin || 0, afterOvernight ? 13 * 60 : 0);
    const maxEnd = (i === days - 1 && Number.isFinite(lastDayMaxEnd)) ? lastDayMaxEnd : (24 * 60);
    const prevCity = i > 0 ? (dayCitySequence[i - 1] || dayCity) : dayCity;
    const transferDay = i > 0 && prevCity !== dayCity;
    // 야경·석양 명소의 이날 시간: 추천 시간을 저녁 식사 칸과 겹치지 않게 맞춘다
    // (식사 전에 시작하면 식사 시작까지, 식사 중에 시작하면 식사 뒤로). 이날 일정 안에 안 들어가면 null.
    // 식사는 하루 장소 수(maxPlacesPerDay)에 세지 않는다.
    const dinnerShown = Boolean(clampRange(baseRanges.evening, minStart, maxEnd));
    const eveningRangeFor = (p) => {
      let r = clockRangeOf(p.bestTime) || baseRanges.afternoon;
      const [ds, de] = baseRanges.evening;
      if (dinnerShown && r[0] < de && r[1] > ds) {
        // 식사 전 시간이 1시간도 안 되면(예: 17:30-18:00) 식사 뒤로 미룬다.
        r = (r[0] < ds && ds - r[0] >= 60) ? [r[0], ds] : [de, Math.max(r[1], de + 60)];
      }
      return clampRange(r, minStart, maxEnd);
    };
    // 야경·석양 명소는 그 시간이 이날 일정 안에 들어갈 때만 오후 칸 후보가 된다(출국일 저녁 등은 제외).
    const eveningFits = (p) => !isEveningPlace(p) || Boolean(eveningRangeFor(p));
    const fitsB = (list) => (Array.isArray(list) ? list : []).filter(eveningFits);
    const inDayCity = (p) => String(p.city || city.label) === dayCity;
    const dayMorningPool = morningPool.filter(inDayCity);
    const dayAfternoonPool = fitsB(afternoonPool.filter(inDayCity));
    const dayFallbackPool = fallbackPool.filter(inDayCity);
    const cityPool = buildCityAttractionPool(dayCity);
    // 반나절 명소 풀: 큐레이션 명소를 먼저(예전과 같은 순환 순서), 도시 주변 실제 명소(generated)는 다 쓴 뒤에 파일 순서(많이 다룬 순)대로
    const cityExpandedPool = cityPool.filter((p) => !isAllDayPlace(p) && !isGeneratedCityPlace(p, dayCityKey));
    const cityGeneratedPool = cityPool.filter((p) => !isAllDayPlace(p) && isGeneratedCityPlace(p, dayCityKey));
    // 실내가 모자란 실내 위주 일정의 야외 생성 장소(위 lateGeneratedPicks): 실내 풀까지 다 쓴 뒤에
    const dayLateGenerated = lateGeneratedPicks.filter((p) => !isAllDayPlace(p) && inDayCity(p));
    const fromCityPool = (pick, seed, banned) => choosePlace(pick(cityExpandedPool), [], seed, banned) || choosePlace(pick(cityGeneratedPool), [], 0, banned)
      || choosePlace(pick(dayLateGenerated), [], 0, banned);
    // 실내 후보만 쓰기로 한 실내 위주 일정(indoorOnly)에서 실내 후보(카드·실내 명소 풀)를 다 쓴 칸: 자유 일정 전에 그날 도시의 바깥 명소를
    // 하루 1곳까지 넣는다(큐레이션 명소 → 도시 주변 실제 명소 순, 하루가 다 드는 곳 제외). AI 일정 후처리(g-1b·takeUnused)의
    // '하루 바깥 관광은 하나까지'와 같은 기준이다. 예전에는 구마모토 5일 실내 위주(실내 3곳)가 셋째 날부터 오전·오후 모두 자유 일정이었다(2026-10-03).
    // 야경·석양 같은 저녁 명소는 쓰지 않는다(낮 칸에 넣는다: 저녁 명소가 오후 칸을 차지하면 비 오는 날의 낮이 빈다).
    // open = 그 칸이 이날 일정에 실제로 들어가는지(들어가지 않는 칸이 이날 몫을 쓰지 않게). 바깥 명소 풀은 처음 필요할 때만 만든다.
    // 도시 주변 실제 명소(위키데이터 인기순)는 큐레이션 명소 뒤에 문화(신사·절·성) → 그 밖(공원·정원·온천 …) → 자연(산·섬·호수) 순으로 쓴다.
    // 인기순 그대로 쓰면 비 오는 날에 구마모토 긴보산·나가사키 하시마섬·삿포로 모이와산 같은 산·섬이 신사·절보다 먼저 들어갔다(검토 반영 2026-10-03).
    let outdoorPool = null;
    let outdoorTaken = false;
    const outdoorOnce = (pick, banned, open) => {
      if (!indoorOnly || !open || outdoorTaken) return null;
      if (!outdoorPool) {
        const list = buildCityAttractionPool(dayCity, true).filter((p) => !isAllDayPlace(p));
        const genRank = (p) => { const c = extraPlaceByName(placeOriginalName(p), dayCityKey)?.category; return c === '문화' ? 0 : (c === '자연' ? 2 : 1); };
        const generated = list.filter((p) => isGeneratedCityPlace(p, dayCityKey)).map((p) => [genRank(p), p]);
        outdoorPool = [...list.filter((p) => !isGeneratedCityPlace(p, dayCityKey)), ...[0, 1, 2].flatMap((r) => generated.filter((x) => x[0] === r).map((x) => x[1]))];
      }
      const p = choosePlace(pick(outdoorPool), [], 0, banned);
      if (p) outdoorTaken = true;
      return p;
    };
    // 그날 바깥 몫으로 세는 요청한 바깥 장소(고른 카드. 꼭 갈 곳은 세지 않는다. AI 후처리 g-1b와 같은 기준).
    // 실내 후보만 쓰는 일정의 후보(카드·실내 명소 풀)에서 실내가 아닌 곳은 요청한 곳뿐이다.
    const requestedOutdoor = (p) => Boolean(p) && !p.freeTime && !isLikelyIndoor(p) && !mustNames.has(placeNameKey(placeKey(p)));
    // 바깥 명소로 채우기 전에 아직 넣지 않은 그날 도시의 꼭 갈 곳을 먼저 넣는다. 바깥 명소가 자유 일정 칸을 먼저 차지하면 뒤의 꼭 갈 곳 넣기
    // (postProcessItinerary (e))가 다른 관광 칸을 바꿔, 구마모토 5일 실내 위주 + 꼭 갈 곳 7곳에서 구마모토 현립 미술관이 빠졌다(검토 반영 2026-10-03).
    const mustLeft = (pick, banned, open) => (indoorOnly && open
      ? choosePlace(pick(dayFallbackPool.filter((p) => mustNames.has(placeNameKey(placeKey(p))))), [], 0, banned) : null);
    // 경로 도시가 여럿이면 그날 도시 후보만 쓴다: 그날 도시 후보가 비어도 다른 도시 후보(전체 오전·오후·대체 목록)로 넘어가지 않고
    // 그 도시 명소 풀(큐레이션 → 생성 장소, fromCityPool)·자유 일정으로 채운다. 실내 위주에서 실내 명소가 모두 생성 장소인 도시
    // (히로시마)는 생성 장소를 후보에서 빼면 그날 후보가 비어, 히로시마 날에 오사카 주택박물관·구로몬 시장이 들어갔다(2026-10-03 R1).
    const otherCityPools = routeCities.length <= 1;
    const poolA = dayMorningPool.length > 0 ? dayMorningPool : (dayFallbackPool.length > 0 ? dayFallbackPool : (otherCityPools ? morningPool : []));
    const poolB = dayAfternoonPool.length > 0 ? dayAfternoonPool : (fitsB(dayFallbackPool).length > 0 ? fitsB(dayFallbackPool) : (otherCityPools ? fitsB(afternoonPool) : []));
    const anyFallbackPool = otherCityPools ? fallbackPool : dayFallbackPool;
    const recentSet = new Set(recentNamesByCity.get(dayCity) || []);
    const aFromPicks = choosePlace(notEvening(poolA), notEvening(anyFallbackPool), i * 3 + 1, recentSet);

    // 종일 칸 후보: 이 도시의 추천·선택 후보 중 하루가 다 드는 곳 → 없으면(3일 이상, 전날이 종일이 아니고 후보를 다 쓴 날) 도시 명소 풀에서
    const flightBoundDay = (i === 0 && (Number.isFinite(day1MinStart) || Boolean(prefs.firstDayShort)))
      || (i === days - 1 && Number.isFinite(lastDayMaxEnd));
    const middleDay = days < 3 || (i > 0 && i < days - 1);
    let allDay = null;
    let allDayFromPool = false;
    if (allDayCount < maxAllDayDays && !flightBoundDay && !transferDay && middleDay) {
      allDay = choosePlace(allDayPicks.filter(inDayCity), [], 0, recentSet);
      if (!allDay && days >= 3 && !aFromPicks && !prevDayAllDay && poolAllDayUsed < poolAllDayMax) {
        allDay = choosePlace(cityPool.filter((p) => isAllDayPlace(p) && !(prefs.lowBudget && allDayPlaceKind(p, key) === 'fullDay')), [], 0, recentSet);
        allDayFromPool = Boolean(allDay);
      }
    }
    const allDayRange = allDay ? clampRange([lateStart ? 10 * 60 + 30 : 9 * 60, 18 * 60], minStart, maxEnd) : null;
    if (!allDayRange) allDay = null;
    if (allDay && allDayFromPool) poolAllDayUsed += 1;

    const dinner = pickDinner(dayCity, i);
    const blocks = [];
    const placed = []; // 이날 일정 칸에 실제로 넣은 장소
    if (allDay) {
      blocks.push(`종일(${formatRange(allDayRange)}): ${blockPlace(allDay, dayCityName)}`);
      placed.push(allDay);
    } else {
      const morningRaw = clampRange(baseRanges.morning, minStart, maxEnd, 60);
      // 출국일 아침에 1시간도 안 남으면 관광 대신 체크아웃·공항 이동 안내로 둔다(아래 빈 날 처리).
      const morningRange = morningRaw && (i === days - 1 && Number.isFinite(lastDayMaxEnd) && morningRaw[1] - morningRaw[0] < 60) ? null : morningRaw;
      const afternoonRange = clampRange(baseRanges.afternoon, minStart, maxEnd, 60);
      const afternoonOpen = Boolean(afternoonRange) && maxPlacesPerDay >= 2;
      const aBase = aFromPicks || fromCityPool(notEvening, i * 5 + 11, recentSet);
      // 오전 칸을 바깥 명소로 채우기 전에, 오전이 자유 일정일 때 오후 칸(b)에 들어갈 장소를 아래 b와 같은 방법으로 미리 골라 본다.
      // 그 장소가 요청한 바깥 장소(고른 카드)이면 그날 바깥 몫은 그 카드가 쓰고 오전은 자유 일정으로 둔다(바깥 명소는 다른 날에 넣는다).
      // 예전에는 구마모토 6일 실내 위주(고른 카드 6곳) 다섯째 날이 오전 구마모토성 + 오후 고른 카드 레이간도로 바깥 2곳이었다(검토 반영 2026-10-03).
      // 미리 고른 오후 장소는 오전 후보에서 뺀다(같은 곳이 두 칸에 들어가지 않게).
      let aBan = recentSet;
      if (!aBase && indoorOnly && morningRange) {
        const b0 = choosePlace(poolB, fitsB(anyFallbackPool), i * 3 + 2, recentSet) || fromCityPool(fitsB, i * 5 + 17, recentSet);
        if (b0 && (afternoonRange || (isEveningPlace(b0) && eveningRangeFor(b0))) && maxPlacesPerDay >= 2) {
          aBan = new Set([...recentSet, placeKey(b0)]);
          if (requestedOutdoor(b0)) outdoorTaken = true;
        }
      }
      const a = aBase
        || mustLeft(notEvening, aBan, Boolean(morningRange))
        || outdoorOnce(notEvening, aBan, Boolean(morningRange))
        || freeTimeSlot(dayCity);
      noteDayQid(a);
      // 오전 칸에 들어간 요청한 바깥 장소(고른 카드)도 그날 바깥 몫으로 센다
      if (indoorOnly && morningRange && requestedOutdoor(a)) outdoorTaken = true;
      const banForB = new Set([...(recentNamesByCity.get(dayCity) || []), a.freeTime ? '' : placeKey(a)].filter(Boolean));
      let b = choosePlace(poolB, fitsB(anyFallbackPool), i * 3 + 2, banForB)
        || fromCityPool(fitsB, i * 5 + 17, banForB)
        || mustLeft(fitsB, banForB, afternoonOpen)
        || outdoorOnce(notEvening, banForB, afternoonOpen)
        || freeTimeSlot(dayCity);
      if (!a.freeTime && !b.freeTime && placeKey(a) === placeKey(b)) {
        const alt = choosePlace(fitsB(dayFallbackPool), fitsB(anyFallbackPool), i * 7 + 3, new Set([placeKey(a)]))
          || fromCityPool(fitsB, i * 7 + 5, new Set([placeKey(a)]))
          || outdoorOnce(notEvening, new Set([placeKey(a)]), afternoonOpen);
        b = alt || freeTimeSlot(dayCity);
      }
      noteDayQid(b);
      if (morningRange) {
        blocks.push(`오전(${formatRange(morningRange)}): ${blockPlace(a, dayCityName)}`);
        placed.push(a);
      }
      // 저녁 명소(야경 등)는 낮 칸이 없어도(늦은 도착 날) 저녁 시간에 들어가면 넣는다
      const bEveningRange = b && !b.freeTime && isEveningPlace(b) ? eveningRangeFor(b) : null;
      if ((afternoonRange || bEveningRange) && maxPlacesPerDay >= 2) {
        if (b && !(a.freeTime && b.freeTime) && (b.freeTime || placeKey(b) !== placeKey(a)) && (afternoonRange || bEveningRange)) {
          // 야경·석양 명소는 추천 시간(예: 20:00-21:30)으로 넣는다('오후'는 낮 12시 이후 전체를 뜻하는 형식 토큰).
          const bRange = bEveningRange || afternoonRange;
          blocks.push(`오후(${formatRange(bRange)}): ${blockPlace(b, dayCityName)}`);
          placed.push(b);
          // 저녁 명소가 오후 칸을 차지했으면, 하루 3곳까지 되는 날은 비어 버린 낮(13:00-17:00)에 다른 명소를 하나 더 넣는다
          if (afternoonRange && bEveningRange && maxPlacesPerDay >= 3 && bRange[0] >= afternoonRange[1]) {
            const banC = new Set([...banForB, placeKey(b)].filter(Boolean));
            const c = choosePlace(notEvening(poolB), [], i * 11 + 7, banC)
              || choosePlace(notEvening(dayFallbackPool), [], i * 11 + 5, banC)
              || fromCityPool(notEvening, i * 11 + 3, banC);
            if (c && placeKey(c) !== placeKey(a)) {
              blocks.push(`오후(${formatRange(afternoonRange)}): ${blockPlace(c, dayCityName)}`);
              placed.push(c);
            }
          }
        } else if (afternoonRange) {
          blocks.push(`오후(${formatRange(afternoonRange)}): ${T.freeTime} (${T.cafeWalk(dayCityName)})`);
        }
      }
    }
    // 먼 당일치기(나라·하코네·모토부 …)를 다녀온 날 저녁은 도시 맛집 대신 그 지역에서 먹는다(종일 18:00 뒤 도시로 돌아와 18:00 저녁은 무리)
    const dayTripArea = allDay && allDayPlaceKind(allDay, dayCityKey) === 'dayTrip'
      ? shortAreaName(localizeCuratedArea(allDay.area, lang, dayCityName) || allDay.name) : '';
    const dinnerText = dayTripArea
      ? T.localDinner(dayTripArea)
      : dinner
        ? (dinner.generic
          ? localizeCuratedFoodName(dinner.name, dayCityKey, lang) // 이미 '(<지역> 주변)'이 붙은 안내 이름
          : `${localizeCuratedFoodName(dinner.name, dayCityKey, lang)} (${localizeCuratedArea(dinner.area, lang, dayCityName) || dayCityName})`)
        : T.localFood(dayCityName);
    const eveningRange = clampRange(baseRanges.evening, minStart, maxEnd);
    if (eveningRange) {
      const cafeOrDinner = prefs.moreCafes ? T.cafeDessert(dayCityName) : dinnerText;
      blocks.push(`저녁(${formatRange(eveningRange)}): ${cafeOrDinner}`);
      if (!dayTripArea && !prefs.moreCafes) markDinner(dayCity, dinner);
    }

    if (transferDay) {
      blocks.unshift(T.transfer(cityDisplay(prevCity), dayCityName, localizeTransferHint(transferHint(prevCity, dayCity), lang)));
    } else if (afterOvernight) {
      // 전날 묵은 당일치기 장소에서 돌아오는 이동
      blocks.unshift(T.transfer(afterOvernight, dayCityName, localizeTransferHint(transferHint(afterOvernight, dayCity), lang)));
    }
    if (allDay && overnightAt && placeNameKey(placeKey(allDay)) === placeNameKey(overnightAt) && i < days - 1) {
      overnightFrom = localizePlaceLabel(placeKey(allDay), [dayCityKey], lang) || allDay.name;
    }

    if (blocks.length === 0) {
      if (i === 0 && (Number.isFinite(day1MinStart) || prefs.firstDayShort)) {
        const start = Math.max(day1MinStart, 18 * 60);
        const end = Math.min(20 * 60 + 30, maxEnd);
        if (end > start) {
          blocks.push(`저녁(${formatRange([start, end])}): ${dinnerText}`);
        } else {
          blocks.push(T.arrivalRest);
        }
      } else if (i === days - 1 && Number.isFinite(lastDayMaxEnd)) {
        const end = Math.min(lastDayMaxEnd, 11 * 60);
        if (end > (8 * 60)) {
          blocks.push(`오전(${formatRange([8 * 60 + 30, end])}): ${T.checkoutAirport}`);
        } else {
          blocks.push(T.departurePrep);
        }
      } else {
        blocks.push(T.freeTime);
      }
    }

    itinerary.push({
      day: i + 1,
      date: getDateOffset(startDate, i),
      // 시각 순서대로(도시 이동 같은 안내 문장은 맨 앞): 야경 칸(20:00)이 저녁 식사(18:00)보다 앞에 오지 않게
      blocks: sortBlockTexts(blocks)
    });
    // 일정에 넣은 실제 장소만 추천 카드 후보로 남긴다("자유 일정" 칸은 장소가 아님).
    const pushExtra = (place, cityLabelForDay) => {
      if (!place || !place.name || place.freeTime) return;
      extraRecommendations.push({
        name: String(place.name),
        ...(place.nameKo ? { nameKo: String(place.nameKo) } : {}),
        city: String(place.city || cityLabelForDay || city.label),
        area: String(place.area || cityDisplay(place.city || cityLabelForDay || city.label)),
        category: String(place.category || '관광'),
        bestTime: String(place.bestTime || '09:00-17:00'),
        stayMin: Math.max(30, Number(place.stayMin || 90)),
        mapUrl: place.mapUrl || mapUrl(`${placeKey(place)} ${place.city || cityLabelForDay || city.label}`),
        aiScore: Math.max(60, Number(place.aiScore || 85)),
        ...(place.photoUrl ? { photoUrl: place.photoUrl, photoCredit: place.photoCredit || null } : {}),
        ...(place.wikidata ? { wikidata: place.wikidata } : {}),
        lat: place.lat || null,
        lng: place.lng || null
      });
    };
    const realPlaces = placed.filter((p) => p && !p.freeTime && placeKey(p));
    realPlaces.forEach((p) => {
      pushExtra(p, dayCity);
      usedPlaceNamesGlobal.add(placeKey(p));
      const q = placeQidOf(p);
      if (q) usedQids.add(q);
    });
    recentNamesByCity.set(dayCity, realPlaces.map(placeKey));
    if (allDay) allDayCount += 1;
    prevDayAllDay = Boolean(allDay);
  }

  const TT = T.tips;
  const tips = [...TT.base];

  if (bounds.arrival) {
    tips.unshift(TT.arrival(bounds.arrival));
  }
  if (bounds.departure) {
    tips.unshift(TT.departure(bounds.departure));
  }
  if (prefs.lastDayAirportBufferMin && Number(prefs.lastDayAirportBufferMin) > 120) {
    tips.unshift(TT.airportBuffer(prefs.lastDayAirportBufferMin));
  }
  if (prefs.indoorFocus) tips.unshift(TT.indoorFocus);
  if (prefs.removeShopping) tips.unshift(TT.removeShopping);
  if (prefs.optimizeTransit || prefs.minimizeTravelTime) tips.unshift(TT.optimizeTransit);
  if (prefs.lowWalking || prefs.strollerFriendly) tips.unshift(TT.lowWalking);
  if (prefs.publicTransitOnly) tips.unshift(TT.publicTransitOnly);
  if (prefs.jrPassMode) tips.unshift(TT.jrPassMode);
  if (prefs.nightViewFocus) tips.unshift(TT.nightViewFocus);
  if (prefs.lowBudget) tips.unshift(TT.lowBudget);
  if (prefs.firstTimeJapan) tips.unshift(TT.firstTimeJapan);
  if (routeCities.length > 1) {
    tips.unshift(TT.multiCity(routeCities.map(cityDisplay)));
  }
  if (usedFreeTime) tips.push(TT.freeTime);

  const extraDedup = [];
  const extraSeen = new Set();
  for (const p of extraRecommendations) {
    const k = `${String(p.city || '').toLowerCase()}|${placeNameKey(placeKey(p))}`;
    if (!p.name || extraSeen.has(k)) continue;
    extraSeen.add(k);
    extraDedup.push(p);
  }

  return {
    source: 'ai_planner_v1',
    city: city.label,
    theme,
    summary: T.summary(cityDisplay(city.label), days, flightLegs.length > 0),
    itinerary,
    tips,
    extraRecommendations: optimizeDayRoute(extraDedup)
  };
}

// 일정 시작일: 항공편 출발일 → 요청 시작일 → 오늘 (규칙 기반 createItinerary와 같은 순서)
function itineraryStartDate(payload) {
  const legs = Array.isArray(payload?.flight?.legs) ? payload.flight.legs : [];
  return legs[0]?.date || payload?.startDate || new Date().toISOString().slice(0, 10);
}

// AI에 넘길 후보를 고른다. 후처리도 이 후보(ctx.picks)만 쓴다(AI 일정은 서버 후보만: 절대 규칙 6).
// - 도시가 하나면(dayPlan 없음): 예전처럼 앞에서부터 min(20, max(12, 일수×3))곳.
// - 도시가 여럿이면: 도시마다 '그 도시 일수×3곳'이 몫이다. 요청한 곳(꼭 갈 곳·화면에서 고른 카드)과 하루짜리 장소
//   (종일 칸에 혼자 쓰고, 일수에 맞춰 이미 걸러 왔다: 몫에 세지 않는다)를 먼저 넣고, 도시를 돌아가며 하나씩 몫을 채운다.
//   그래도 전체가 max(12, 일수×3)(최대 30)보다 적으면 남은 후보로 도시를 돌아가며 더 채운다.
//   날짜가 없는 도시의 후보는 넣지 않는다(그날 도시의 후보만 쓰므로). 고른 후보는 원래 순서(요청한 곳·추천 순)를 지킨다.
function selectAiPicks(picks, days, dayPlan, priorityKeys, fallbackCityKey) {
  const cityDays = new Map();
  (Array.isArray(dayPlan) ? dayPlan : []).forEach((d) => {
    const c = String(d?.city || '').trim();
    if (c) cityDays.set(c, (cityDays.get(c) || 0) + 1);
  });
  if (cityDays.size < 2) return (picks || []).slice(0, Math.min(20, Math.max(12, days * AI_PICKS_PER_DAY)));
  const list = (Array.isArray(picks) ? picks : []).filter((p) => p && p.name);
  const budget = Math.min(30, Math.max(12, days * AI_PICKS_PER_DAY));
  const priority = priorityKeys instanceof Set ? priorityKeys : new Set(priorityKeys || []);
  const cityOf = (p) => {
    const c = String(p.city || '').trim();
    if (cityDays.has(c)) return c;
    const label = CITY_DATA[cityKeyByLabel(c)]?.label || '';
    return cityDays.has(label) ? label : '';
  };
  const isAllDay = (p) => Boolean(allDayPlaceKind(p, cityKeyByLabel(p.city) || fallbackCityKey));
  const chosen = new Set();
  const used = new Map();
  const take = (p, c) => {
    chosen.add(p);
    if (!isAllDay(p)) used.set(c, (used.get(c) || 0) + 1);
  };
  list.forEach((p) => {
    const c = cityOf(p);
    if (priority.has(placeNameKey(placeOriginalName(p))) || (c && isAllDay(p))) take(p, c);
  });
  const queues = [...cityDays.keys()].map((c) => ({ c, quota: cityDays.get(c) * AI_PICKS_PER_DAY, rest: list.filter((p) => !chosen.has(p) && cityOf(p) === c) }));
  const roundRobin = (capOf, limit) => {
    let moved = true;
    while (moved && chosen.size < limit) {
      moved = false;
      for (const x of queues) {
        if (chosen.size >= limit) break;
        if (!x.rest.length || (used.get(x.c) || 0) >= capOf(x)) continue;
        take(x.rest.shift(), x.c);
        moved = true;
      }
    }
  };
  roundRobin((x) => x.quota, Infinity); // 도시별 몫(요청한 곳이 많아도 다른 도시 몫은 채운다)
  roundRobin(() => Infinity, budget); // 남은 자리
  return list.filter((p) => chosen.has(p));
}

// AI 일정 컨텍스트. payload._aiIntent = { mustVisit, excluded, dayPlan, routeCityKeys, requested } (buildTravelPlan이 만든다)
function buildAiContext(payload, picks, city) {
  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));
  const startDate = itineraryStartDate(payload);
  const lang = normalizeLang(payload.lang);
  const cityKey = cityKeyForExactLabel(city.label) || cityKeyByInput(payload.city);
  const intent = payload._aiIntent && typeof payload._aiIntent === 'object' ? payload._aiIntent : {};
  const prefs = planPrefs(payload);
  const routeKeys = Array.isArray(intent.routeCityKeys) && intent.routeCityKeys.length ? intent.routeCityKeys : [cityKey];
  // 먼저 넣을 후보: 요청한 곳(꼭 갈 곳 + 화면에서 고른 카드, 원래 이름 키)
  const priorityKeys = new Set([
    ...(Array.isArray(intent.requested) ? intent.requested : []),
    ...(Array.isArray(intent.mustVisit) ? intent.mustVisit.map((m) => placeNameKey(m?.nameKo || m?.name)) : [])
  ].filter(Boolean));
  // 여러 도시 일정은 후보가 많아(일수×3곳) 후보 줄의 기본값(추천 시간 10:00-17:00, 머무는 시간 90분)은 빼서 프롬프트를 줄인다
  // (Groq 무료는 분당 8천 토큰). 머무는 시간이 없으면 서버도 90분으로 본다(normalizeAiItinerary). 도시가 하나면 예전 그대로.
  const multiCity = new Set((Array.isArray(intent.dayPlan) ? intent.dayPlan : []).map((d) => String(d?.city || '').trim()).filter(Boolean)).size > 1;
  const ctx = {
    language: ({ ko: 'Korean', en: 'English', ja: 'Japanese' })[lang],
    city: city.label,
    theme: payload.theme || 'mixed',
    budget: payload.budget || 'mid',
    pace: payload.pace || 'normal',
    days,
    startDate,
    maxPlacesPerDay: Number(prefs.maxPlacesPerDay) > 0 ? clamp(Number(prefs.maxPlacesPerDay), 1, 5) : 4,
    // 하루 3곳 기준으로 넉넉히 넘겨 같은 장소를 여러 날 반복하지 않게 한다(도시가 여럿이면 도시마다 그 도시 일수×3곳: selectAiPicks).
    // id = 후보 번호, city = 그 후보의 도시(dayPlan과 같은 표기), allDay = 하루 전체가 드는 곳(종일 칸 전용)
    picks: selectAiPicks(picks, days, intent.dayPlan, priorityKeys, cityKey).map((p, i) => ({
      id: i,
      name: p.name,
      area: p.area,
      category: p.category,
      ...(multiCity && p.bestTime === '10:00-17:00' ? {} : { bestTime: p.bestTime }),
      ...(multiCity && Number(p.stayMin) === 90 ? {} : { stayMin: p.stayMin }),
      city: p.city || city.label,
      allDay: Boolean(allDayPlaceKind(p, cityKeyByLabel(p.city) || cityKey)),
      ...(prefs.indoorFocus ? { indoor: isLikelyIndoor(p) } : {})
    })),
    // 경로 도시 전체의 맛집(도시당 8곳, 전체 16곳). en/ja 일정이면 이름·지역·장르도 그 언어 표기로.
    foods: aiFoodsForCities(routeKeys, lang).map(({ nameKo, ...f }) => f),
    flight: payload.flight || null,
    stay: payload.stay || null
  };
  if (payload.request) ctx.userRequest = String(payload.request).slice(0, 500);
  if (Array.isArray(intent.mustVisit) && intent.mustVisit.length) {
    // 저녁이 좋은 곳(추천 시작 17시 이후, 예: 도톤보리 야경)은 bestTime도 알려 준다
    ctx.mustVisit = intent.mustVisit.map((m) => {
      const bt = String(m.pick?.bestTime || m.synthetic?.bestTime || '');
      const evening = !m.allDay && (clockToMin(normalizeClockText(bt.split('-')[0])) ?? 0) >= 17 * 60;
      return { name: m.name, area: m.area || '', allDay: Boolean(m.allDay), ...(evening ? { bestTime: bt } : {}) };
    });
  }
  if (Array.isArray(intent.excluded) && intent.excluded.length) ctx.excluded = intent.excluded.slice(0, 8);
  if (Array.isArray(intent.dayPlan) && intent.dayPlan.length) ctx.dayPlan = intent.dayPlan;
  if (Array.isArray(payload.foodWishes) && payload.foodWishes.length) ctx.foodWishes = payload.foodWishes.slice(0, 3);
  const constraints = aiConstraintLines(prefs, payload.flight, days, prefs);
  if (constraints.length) ctx.constraints = constraints;
  return ctx;
}

// 사용자 의도를 따르라는 지시문(컨텍스트에 그 값이 있을 때만)
function aiIntentInstructions(ctx, lang) {
  const T = RULE_PLAN_TEXT[normalizeLang(lang)] || RULE_PLAN_TEXT.ko;
  const lines = [];
  if (ctx.userRequest) lines.push('userRequest is the traveler\'s own words: follow it (city, dates and day count are already fixed).');
  if (ctx.mustVisit) lines.push('Schedule every mustVisit exactly once, even if it is not in picks; keep the name as written. A mustVisit with allDay:true gets its own 종일 day; a mustVisit with bestTime is scheduled at that time (e.g. an evening 오후 block).');
  if (ctx.excluded) lines.push('Never schedule excluded places.');
  if (ctx.dayPlan) lines.push(`Follow dayPlan: each day only uses picks/foods of that day's city; when transferFrom is set, start that day with one plain block (no period, no time) like "${T.transfer('<from>', '<to>', '<how>')}".`);
  // 여러 도시 일정은 후보 줄에서 기본값(추천 시간·머무는 시간)을 뺀다(buildAiContext): 빠진 값이 무엇인지 한 줄로 알린다
  if ((ctx.picks || []).some((p) => !('bestTime' in p) || !('stayMin' in p))) lines.push('A pick without bestTime/stayMin is a daytime visit (10:00-17:00, about 90 min).');
  if (ctx.foodWishes) lines.push('If foodWishes is set, choose matching foods for 저녁 when available.');
  return lines;
}

function parseJsonFromText(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  const startIndex = trimmed.indexOf('{');
  const endIndex = trimmed.lastIndexOf('}');
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return null;
  const candidate = trimmed.slice(startIndex, endIndex + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function maskSecret(secret) {
  const raw = String(secret || '').trim();
  if (!raw) return '';
  if (raw.length <= 8) return `${raw[0]}***`;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function looksLikeGeminiKey(key) {
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(String(key || '').trim());
}

// OpenAI(sk-…) 또는 Groq(gsk_…) 키 모양인지(진단 표시용)
function looksLikeOpenAiKey(key) {
  return /^(sk-|gsk_)[A-Za-z0-9_-]{20,}$/.test(String(key || '').trim());
}

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function classifyAiError(provider, err) {
  const raw = String(err?.message || err || '').trim();
  const low = raw.toLowerCase();
  const jsonStart = raw.indexOf('{');
  let embedded = null;
  if (jsonStart >= 0) {
    try {
      embedded = JSON.parse(raw.slice(jsonStart));
    } catch {
      embedded = null;
    }
  }
  const embeddedErr = embedded && typeof embedded === 'object' ? (embedded.error || embedded) : null;
  const embeddedStatus = String(embeddedErr?.status || '').toLowerCase();
  const embeddedMessage = String(embeddedErr?.message || '').toLowerCase();
  let code = 'unknown';
  let action = '서버 로그의 원문 에러를 확인해 주세요.';
  if (err?.reasonCode === 'AI_TRUNCATED') {
    code = 'output_truncated';
    action = `${provider} 응답이 길이 제한에 걸려 잘려서 규칙 기반 일정으로 대신 만들었습니다.`;
  } else if (err?.reasonCode === 'AI_INVALID_OUTPUT') {
    code = 'invalid_model_response';
    action = `${provider} 응답 형식이 올바르지 않아 규칙 기반 일정으로 대신 만들었습니다.`;
  } else if (low.includes('api_key is missing') || low.includes('api key is missing')) {
    code = 'missing_key';
    action = `${provider} API 키가 설정되지 않았습니다.`;
  } else if (!raw) {
    code = 'empty_error';
    action = `${provider} 응답이 비어 있습니다. 모델/네트워크 상태를 다시 확인해 주세요.`;
  } else if (err?.geminiTimeout || err?.aiTimeout) {
    // 모델들이 제한 시간 안에 답하지 못함(느린 503 포함): 네트워크 고장이 아니라 'AI가 바쁨'으로 알린다
    code = 'timeout';
    action = `${provider} 응답이 제한 시간 안에 오지 않아 규칙 기반 일정으로 대신 만들었습니다. 잠시 후 다시 시도해 주세요.`;
  } else if (
    /\b503\b/.test(low) ||
    low.includes('unavailable') ||
    low.includes('overloaded') ||
    low.includes('high demand') ||
    embeddedStatus.includes('unavailable')
  ) {
    code = 'overloaded';
    action = `${provider} 서버가 지금 붐벼서(503) 규칙 기반 일정으로 대신 만들었습니다. 잠시 후 다시 시도해 주세요.`;
  } else if (err?.quotaDaily) {
    // 하루 무료 한도 소진(quotaId …PerDay…): '잠시 뒤'가 아니라 한도가 다시 생길 때(태평양 시간 자정 = 한국 오후 4~5시)까지 안 된다
    code = 'daily_quota';
    action = `${provider} 무료 사용량의 하루 한도를 다 써서 규칙 기반 일정으로 대신 만들었습니다. 한도는 태평양 시간 자정(한국 시간 오후 4~5시)에 다시 생깁니다.`;
  } else if (
    low.includes('resource_exhausted') ||
    low.includes('429') ||
    low.includes('quota') ||
    low.includes('rate limit') ||
    embeddedStatus.includes('resource_exhausted') ||
    embeddedMessage.includes('quota')
  ) {
    code = 'quota_or_rate_limit';
    action = `${provider} 사용량 한도/요금제(결제) 및 모델별 쿼터를 확인해 주세요.`;
  } else if (low.includes('401') || low.includes('unauthorized') || low.includes('invalid api key') || low.includes('api key not valid') || low.includes('unauthenticated')) {
    code = 'invalid_key';
    action = `${provider} API 키가 유효한지 확인하고 새 키로 교체해 주세요.`;
  } else if (low.includes('403') || low.includes('permission') || low.includes('forbidden')) {
    code = 'permission_denied';
    action = `${provider} 키 권한/프로젝트 결제 설정을 확인해 주세요.`;
  } else if (
    low.includes('404') ||
    low.includes('not found') ||
    embeddedStatus.includes('not_found')
  ) {
    code = 'model_not_found';
    action = `${provider} 모델명 설정을 확인해 주세요.`;
  } else if (
    low.includes('unexpected format') ||
    low.includes('did not return valid') ||
    low.includes('json') ||
    low.includes('empty itinerary')
  ) {
    code = 'invalid_model_response';
    action = `${provider} 응답 형식이 스키마와 맞지 않습니다. 모델 변경 또는 프롬프트/스키마를 점검해 주세요.`;
  } else if (low.includes('fetch failed') || low.includes('network') || low.includes('enotfound') || low.includes('econn') || low.includes('timeout')) {
    code = 'network_error';
    action = '서버 네트워크/방화벽/DNS에서 외부 API 도메인 접근이 가능한지 확인해 주세요.';
  }
  // 사용량 한도(429)·과부하(503)·Gemini 체인 시간 초과는 'AI가 바쁨'(AI_BUSY): 화면은 잠시 후 다시 시도하라고 안내한다.
  // 하루 무료 한도 소진은 'AI_DAILY_LIMIT': 오늘은 기본 일정으로 만들고, 한도가 다시 생기는 시각을 알린다.
  const reasonCode = code === 'output_truncated' ? 'AI_TRUNCATED'
    : code === 'invalid_model_response' ? 'AI_INVALID_OUTPUT'
      : code === 'missing_key' ? 'AI_KEY_MISSING'
        : code === 'daily_quota' ? 'AI_DAILY_LIMIT'
          : (code === 'quota_or_rate_limit' || code === 'overloaded' || code === 'timeout') ? 'AI_BUSY'
            : 'AI_ERROR';
  const retryAfterSec = reasonCode === 'AI_DAILY_LIMIT' ? Math.ceil(geminiDailyResetMs() / 1000) : Number(err?.retryAfterSec);
  return {
    provider,
    code,
    reasonCode,
    message: raw || 'unknown error',
    action,
    ...((reasonCode === 'AI_BUSY' || reasonCode === 'AI_DAILY_LIMIT') && Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? { retryAfterSec: Math.ceil(retryAfterSec) } : {})
  };
}

// AI 응답이 잘렸거나 형식이 틀렸을 때 쓰는 오류 (reasonCode: AI_TRUNCATED | AI_INVALID_OUTPUT)
class AiOutputError extends Error {
  constructor(reasonCode, message) {
    super(message || reasonCode);
    this.name = 'AiOutputError';
    this.reasonCode = reasonCode;
  }
}

// ── AI 일정 정규화: 클라이언트 렌더러가 읽는 "오전(09:00-11:00): 장소 (지역)" 문자열 블록으로 맞춘다 ──
const ITINERARY_MAIN_BLOCK_RE = /^(오전|오후|저녁|종일|아침|점심)\((\d{1,2}:\d{2})-(\d{1,2}:\d{2})\):\s*(.+)$/;
// 식당 판정 단어(클라이언트 FN-04와 같은 정의). 저녁·점심 블록의 '식사인가' 판정에만 쓴다.
const FOOD_WORD_RE = /라멘|라면|스시|초밥|이자카야|우동|소바|야키토리|야키니쿠|돈카츠|규카츠|카레|타코야키|오코노미야키|모츠나베|히츠마부시|텐동|식당|맛집|레스토랑|식사|ramen|sushi|izakaya|udon|soba|yakitori|yakiniku|tonkatsu|curry|takoyaki|okonomiyaki|restaurant|dinner|lunch|meal|ラーメン|寿司|居酒屋|うどん|そば|焼肉|とんかつ|カレー|たこ焼き|お好み焼き|食堂|レストラン|食事/i;
// 자유 시간·이동 블록(장소가 아님)
const FREE_OR_MOVE_RE = /자유|free\s*time|自由|이동|transfer|移動|체크인|체크아웃|check-?in|check-?out|공항|airport/i;
const SIGHT_PERIODS = new Set(['오전', '오후', '종일']);
const MEAL_PERIODS = new Set(['아침', '점심', '저녁']);

function normalizeClockText(value) {
  const m = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(String(value || ''));
  if (!m) return '';
  const h = Math.min(23, Number(m[1]));
  const min = Math.min(59, Number(m[2]));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function addMinutesToClock(hhmm, minutes) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const total = Math.min(23 * 60 + 59, (h * 60) + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function periodForClock(hhmm) {
  const h = Number(String(hhmm).slice(0, 2));
  if (h < 12) return '오전';
  if (h < 17) return '오후';
  return '저녁';
}

function formatItineraryBlock(period, start, end, title, area) {
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!cleanTitle) return '';
  const cleanArea = String(area || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const suffix = cleanArea && cleanArea !== cleanTitle && !cleanTitle.endsWith(')') ? ` (${cleanArea})` : '';
  return `${period}(${start}-${end}): ${cleanTitle}${suffix}`;
}

// 문자열·객체 블록 하나를 클라이언트 형식 문자열로. 못 바꾸면 짧은 일반 문장으로 두거나 버린다.
// stayFor(title): 시각이 하나뿐인 블록("09:00 센소지")의 머무는 시간(후보 stayMin, 없으면 90분)
function normalizeAiBlock(block, stayFor = () => 90) {
  if (typeof block === 'string') {
    const s = block.replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const main = ITINERARY_MAIN_BLOCK_RE.exec(s);
    if (main) {
      const start = normalizeClockText(main[2]);
      const end = normalizeClockText(main[3]);
      return `${main[1]}(${start}-${end}): ${main[4].trim()}`;
    }
    const range = /(\d{1,2}\s*:\s*\d{2})\s*(?:-|~|–|—|to)\s*(\d{1,2}\s*:\s*\d{2})\)?\s*[:：\-–]?\s*(.+)$/.exec(s);
    if (range) {
      const start = normalizeClockText(range[1]);
      const end = normalizeClockText(range[2]);
      const period = /^(오전|오후|저녁|종일|아침|점심)/.exec(s)?.[1] || periodForClock(start);
      return formatItineraryBlock(period, start, end, range[3], '');
    }
    const single = /^(?:(오전|오후|저녁|종일|아침|점심)\s*)?\(?\s*(\d{1,2}\s*[:：]\s*\d{2})\s*\)?\s*[:：\-–]?\s*(.+)$/.exec(s);
    if (single) {
      const start = normalizeClockText(single[2]);
      const title = single[3].trim();
      return formatItineraryBlock(single[1] || periodForClock(start), start, addMinutesToClock(start, stayFor(title)), title, '');
    }
    return s.slice(0, 200);
  }
  if (!block || typeof block !== 'object') return '';
  const timeText = String(block.time || block.timeRange || '');
  const rangeInTime = /(\d{1,2}\s*:\s*\d{2})\s*(?:-|~|–|—|to)\s*(\d{1,2}\s*:\s*\d{2})/.exec(timeText);
  const start = normalizeClockText(block.start || block.startTime || (rangeInTime ? rangeInTime[1] : timeText));
  if (!start) return '';
  const title = block.title || block.place || block.activity || block.name || block.location || '';
  const end = normalizeClockText(block.end || block.endTime || (rangeInTime ? rangeInTime[2] : '')) || addMinutesToClock(start, stayFor(String(title)));
  const area = block.area || (block.location && block.location !== title ? block.location : '');
  const period = ['오전', '오후', '저녁', '종일', '아침', '점심'].includes(block.period) ? block.period : periodForClock(start);
  return formatItineraryBlock(period, start, end, title, area);
}

function firstArrayField(obj, names) {
  for (const n of names) {
    if (Array.isArray(obj?.[n])) return obj[n];
  }
  return [];
}

// AI 응답 JSON → { summary, itinerary, tips }. 날짜 수가 모자라거나 관광 블록이 없는 날이 있으면 AiOutputError.
// 아침·점심·저녁만 있는 날은 내용이 없는 날로 보고, 종일은 내용으로 인정한다.
// 항공편으로 관광 시간이 거의 없는 첫날·마지막 날은 비어 있어도 된다(후처리가 안내 문장을 넣는다).
// picks: AI에 넘긴 후보(시각이 하나뿐인 블록의 머무는 시간을 찾는다)
function normalizeAiItinerary(json, payload, providerLabel, picks = []) {
  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));
  const startDate = itineraryStartDate(payload);
  const rawDays = firstArrayField(json, ['itinerary', 'days', 'schedule']);
  if (rawDays.length < days) {
    throw new AiOutputError('AI_INVALID_OUTPUT', `${providerLabel} returned ${rawDays.length}/${days} days`);
  }
  const pickList = (Array.isArray(picks) ? picks : []).filter((p) => p && p.name);
  const stayFor = (title) => {
    const name = (/^(.+?)\s*\(([^()]*)\)\s*$/.exec(String(title || '')) || [])[1] || String(title || '');
    const k = placeNameKey(name);
    const p = pickList.find((x) => placeKeyMatches(k, placeNameKey(x.name)));
    return clamp(Number(p?.stayMin) || 90, 30, 600);
  };
  const itinerary = rawDays.slice(0, days).map((d, idx) => {
    const rawBlocks = firstArrayField(d, ['blocks', 'schedule', 'activities', 'items', 'plan', 'events']);
    const blocks = rawBlocks.map((b) => normalizeAiBlock(b, stayFor)).filter(Boolean).slice(0, 12);
    return { day: idx + 1, date: getDateOffset(startDate, idx), blocks };
  });
  const bounds = flightDayBounds(payload, planPrefs(payload));
  const shortDay = (i) => (i === 0 && bounds.day1MinStart !== null && bounds.day1MinStart >= 17 * 60)
    || (i === days - 1 && bounds.lastDayMaxEnd !== null && bounds.lastDayMaxEnd <= 12 * 60);
  const emptyDay = itinerary.find((d, i) => !shortDay(i) && !d.blocks.some((b) => {
    const m = ITINERARY_MAIN_BLOCK_RE.exec(b);
    return m && SIGHT_PERIODS.has(m[1]);
  }));
  if (emptyDay) {
    throw new AiOutputError('AI_INVALID_OUTPUT', `${providerLabel} returned no schedule blocks for day ${emptyDay.day}`);
  }
  const tips = (Array.isArray(json?.tips) ? json.tips : [])
    .filter((t) => typeof t === 'string' && t.trim())
    .map((t) => t.trim().slice(0, 200))
    .slice(0, 8);
  const summary = typeof json?.summary === 'string' ? json.summary.trim().slice(0, 300) : '';
  return { summary, itinerary, tips };
}

// ── 일정 후처리: AI(또는 규칙) 일정의 블록을 계약대로 맞춘다 ──
function parsePostBlock(text) {
  const s = String(text || '');
  const m = ITINERARY_MAIN_BLOCK_RE.exec(s);
  if (!m) return { plain: true, text: s };
  const start = clockToMin(normalizeClockText(m[2]));
  let end = clockToMin(normalizeClockText(m[3]));
  if (start === null) return { plain: true, text: s };
  if (end === null || end <= start) end = Math.min(start + 90, 23 * 60 + 59);
  const placeTextRaw = m[4].trim();
  const withArea = /^(.+?)\s*\(([^()]*)\)\s*$/.exec(placeTextRaw);
  return {
    plain: false,
    period: m[1],
    start,
    end,
    name: (withArea ? withArea[1] : placeTextRaw).trim(),
    area: withArea ? withArea[2].trim() : '',
    title: placeTextRaw
  };
}

function formatPostBlock(b) {
  if (b.plain) return b.text;
  return formatItineraryBlock(b.period, minToClock(b.start), minToClock(b.end), b.name, b.area);
}

function newPostBlock(period, start, end, name, area) {
  return { plain: false, period, start, end, name: String(name || ''), area: String(area || ''), title: `${name || ''}${area ? ` (${area})` : ''}` };
}

// 도시 하나의 맛집(postProcessItinerary의 맛집 모양: 화면 언어 이름 name + 한국어 원래 이름 nameKo, city = 그 도시 label).
// 맛집 목록에 그 도시 가게가 하나도 없을 때 쓴다(경로 도시 밖의 날짜별 도시: 고른 카드·지역별 일수에만 있는 도시).
// 내장 도시면 그 도시 맛집 전체(실제 가게 먼저, '찾기' 안내는 뒤에: postFoods와 같은 순서), 아니면 도시 이름을 지역으로 '찾기' 안내 2곳을 만든다.
// (장소를 지어내지 않는다: 서버 내장 목록이고, '<도시> 이자카야 찾기 (<지역> 주변)'은 지도 검색 안내다)
function cityFallbackFoodsFor(cityLabel, lang) {
  const label = String(cityLabel || '').trim();
  if (!label) return [];
  const ck = cityKeyForExactLabel(label);
  const city = ck && CITY_DATA[ck] ? CITY_DATA[ck] : null;
  const own = city ? [...(city.foods || [])].sort((a, b) => Number(Boolean(a.generic)) - Number(Boolean(b.generic))) : [];
  const src = own.length ? own : Object.keys(GENERIC_FOOD_KINDS).map((kind) => ({ name: genericFoodName(kind, label, label), area: label, genre: GENERIC_FOOD_KINDS[kind].genre, generic: true }));
  const shownCity = city ? localizedCityName(ck, lang) : cityLabelForLang(label, lang);
  return src.map((f) => ({ name: localizeCuratedFoodName(f.name, ck, lang), nameKo: f.name, area: localizeCuratedArea(f.area, lang, shownCity), areaKo: f.area, genre: f.genre, city: label, ...(f.generic ? { generic: true } : {}) }));
}

/**
 * AI 일정 결정적 후처리. 순서: 식사·관광 분류(b·c) → 종일 병합(d) → 제외 정리(g-1) → 꼭 갈 곳(e) → 제약(f: 시작 시각·출발·겹침·하루 관광 수)
 * → 반복 정리(g-2, 제약으로 빠진 후보도 다시 쓴다) → 빈 낮 채우기(h) → 식사(그날 도시 가게로 맞추기 h-1a, 빈 식사 채우기 h-1b·h-2,
 * 먹고 싶은 음식 h-3, 같은 식당 되풀이 h-4, 당일치기 현지 식사 h-5) → 도시 이동 → 빈 날 채우기 → 확인 안 된 관광 수(i) → 시간 순 정렬.
 * opts: { picks, foods, mustVisit, excludedKeys, prefs, payload, dayPlan, lang, cityLabel, ruleMode }
 *  - ruleMode: 규칙 일정에는 꼭 갈 곳 넣기(e)만 한다(나머지는 createItinerary가 이미 지킨다).
 * 돌려주는 값: { itinerary, stats: {mealsMoved, sightsRelabeled, allDayMerged, mustInserted, trimmed, shifted, repeatsReplaced, unverified}, missingMustVisit }
 */
function postProcessItinerary(itinerary, opts = {}) {
  const lang = normalizeLang(opts.lang);
  const T = RULE_PLAN_TEXT[lang] || RULE_PLAN_TEXT.ko;
  const prefs = opts.prefs || {};
  // 앞의 8개는 응답 계약(itineraryInfo.postProcess). 뒤의 5개는 진단용: 채운 저녁 수·채운 관광 수·실내로 바꾼 수·후보 이름으로 되돌린 수·
  // 그날 도시 가게로 바꾼 식사 수(mealsCityFixed, mealsMoved에도 함께 센다)
  const stats = { mealsMoved: 0, sightsRelabeled: 0, allDayMerged: 0, mustInserted: 0, trimmed: 0, shifted: 0, repeatsReplaced: 0, unverified: 0, mealsAdded: 0, sightsAdded: 0, indoorSwapped: 0, namesRestored: 0, mealsCityFixed: 0 };
  const picks = (opts.picks || []).filter((p) => p && p.name);
  const baseFoods = (opts.foods || []).filter((f) => f && f.name);
  const must = (opts.mustVisit || []).filter((m) => m && m.name);
  const excludedKeys = opts.excludedKeys instanceof Set ? opts.excludedKeys : new Set();
  const dayPlan = Array.isArray(opts.dayPlan) ? opts.dayPlan : [];
  // 날짜별 도시(dayPlan) 가운데 맛집 목록에 가게가 하나도 없는 도시(경로 도시 밖에서 생긴 도시·내장 데이터에 없는 도시)는
  // 그 도시 맛집(내장 도시면 그 도시 가게, 아니면 '찾기' 안내)을 보탠다.
  // 식사 칸을 그날 도시 가게로 맞추거나 채울 때(h-1a·h-1b·h-2) 다른 도시 가게로 넘어가지 않게 한다.
  const foods = baseFoods.length
    ? [...baseFoods, ...Array.from(new Set(dayPlan.map((dp) => dp?.city).filter(Boolean)))
      .filter((c) => !baseFoods.some((f) => !f.city || f.city === c))
      .flatMap((c) => cityFallbackFoodsFor(c, lang))]
    : baseFoods;
  const ruleMode = Boolean(opts.ruleMode);
  const days = (Array.isArray(itinerary) ? itinerary : []).map((d) => ({ ...d, items: (Array.isArray(d.blocks) ? d.blocks : []).map(parsePostBlock) }));
  const nDays = days.length;
  const missingMustVisit = [];
  if (nDays === 0) return { itinerary: [], stats, missingMustVisit };

  const keysOf = (x) => [placeNameKey(x.name), placeNameKey(x.nameKo)].filter(Boolean);
  const pickKeys = picks.map(keysOf);
  const foodKeys = foods.map(keysOf);
  const mustKeys = must.map(keysOf);
  // 같은 이름이 먼저, 그다음 포함 관계 중 길이가 가장 비슷한 후보('마쓰야마성 로프웨이'가 '마쓰야마성'보다 '마쓰야마성 로프웨이' 후보로)
  const findIdx = (name, keyLists) => {
    const k = placeNameKey(name);
    if (!k) return -1;
    const exact = keyLists.findIndex((ks) => ks.includes(k));
    if (exact >= 0) return exact;
    let best = -1;
    let bestDiff = Infinity;
    keyLists.forEach((ks, i) => ks.forEach((x) => {
      if (!placeKeyMatches(k, x)) return;
      const diff = Math.abs(x.length - k.length);
      if (diff < bestDiff) { best = i; bestDiff = diff; }
    }));
    return best;
  };
  const pickOf = (name) => { const i = findIdx(name, pickKeys); return i >= 0 ? picks[i] : null; };
  const mustOf = (name) => { const i = findIdx(name, mustKeys); return i >= 0 ? must[i] : null; };
  const isFoodName = (name) => findIdx(name, foodKeys) >= 0;
  const isFreeOrMove = (b) => FREE_TIME_TITLES.has(b.name) || FREE_OR_MOVE_RE.test(b.title);
  const isMealBlock = (b) => isFoodName(b.name) || FOOD_WORD_RE.test(b.title);
  const isSightBlock = (b) => !b.plain && SIGHT_PERIODS.has(b.period) && !isFreeOrMove(b);
  const dayCityLabel = (di) => dayPlan[di]?.city || opts.cityLabel || '';
  const dayCityKey = (di) => cityKeyByLabel(dayCityLabel(di)) || '';
  const isAllDayName = (name, di) => {
    const p = pickOf(name);
    if (p && (p.allDay || p.fullDay || p.dayTrip)) return true;
    const m = mustOf(name);
    if (m && m.allDay) return true;
    return Boolean(allDayPlaceKind({ name }, dayCityKey(di)));
  };
  const bounds = flightDayBounds(opts.payload || {}, prefs);
  const day1MinStart = bounds.day1MinStart !== null ? bounds.day1MinStart : (prefs.firstDayShort ? 15 * 60 : null);
  const lastDayMaxEnd = bounds.lastDayMaxEnd;
  const dayStartMin = clockToMin(prefs.startTimeMin) ?? (prefs.lateStart ? 10 * 60 + 30 : null);
  const loOf = (di) => Math.max(dayStartMin ?? 9 * 60, (di === 0 && day1MinStart !== null) ? day1MinStart : 0);
  const hiOf = (di) => ((di === nDays - 1 && lastDayMaxEnd !== null) ? Math.min(lastDayMaxEnd, 21 * 60) : 21 * 60);
  const sortItems = (d) => {
    const plain = d.items.filter((b) => b.plain);
    const timed = d.items.filter((b) => !b.plain).sort((a, b) => (a.start - b.start) || (a.end - b.end));
    d.items = [...plain, ...timed];
  };
  days.forEach(sortItems);

  const keyOfBlock = (b) => {
    const p = pickOf(b.name);
    if (p) return placeNameKey(p.nameKo || p.name);
    const m = mustOf(b.name);
    if (m) return placeNameKey(m.nameKo || m.name);
    return placeNameKey(b.name);
  };
  // 아직 쓰지 않은 후보(하루가 다 드는 곳·제외·쇼핑 제외 대상은 뺀다). 다른 도시 날에는 그 도시 후보만 쓴다.
  const unusedPool = () => {
    const mentioned = new Set();
    days.forEach((d) => d.items.forEach((b) => { if (!b.plain) mentioned.add(keyOfBlock(b)); }));
    // 꼭 갈 곳은 (e) 단계가 따로 넣는다(여기서 쓰면 넣은 수가 집계되지 않는다)
    return picks.filter((p) => !mentioned.has(placeNameKey(p.nameKo || p.name))
      && !(p.allDay || p.fullDay || p.dayTrip)
      && !mustOf(p.name)
      && !isExcludedPlace(p, excludedKeys)
      && !(prefs.removeShopping && isLikelyShopping(p)));
  };
  let unused = null;
  // 실내 위주(비 오는 날)의 그날 바깥 관광 수: (g-1b)와 같은 기준(꼭 갈 곳·종일 칸은 세지 않는다). except = 바꾸려는 칸 자신.
  const outdoorSightsOn = (di, except = null) => (days[di]?.items || []).filter((b) => b !== except && isSightBlock(b) && b.period !== '종일'
    && !mustOf(b.name) && !isIndoorBlockName(b.name)).length;
  // pred(p): 더 고를 조건(예: 실내). 맞는 후보가 없으면 null. replacing: 이 후보로 바꿀 칸(바깥 관광 수에서 뺀다)
  // 실내 위주이고 실내 후보가 넉넉하면(indoorStrict) 그날 바깥 관광이 이미 있을 때 바깥 후보를 쓰지 않는다(하루 바깥 관광은 하나까지, g-1b).
  // 실내 후보가 없으면 null이라 칸이 비거나 그대로다(규칙 일정이 실내 후보를 다 쓴 날에 바깥 명소를 하루 1곳까지만 넣고 남은 칸을 자유 일정으로 두는 것과 같다).
  // 예전에는 빈 낮 채우기(h)·바꾸기가 남은 야외 후보로 구마모토 날 하나에 스이젠지 공원·레이간도·가토 신사를 넣었다(2026-10-03 R6).
  const takeUnused = (di, pred = null, replacing = null) => {
    if (!unused) unused = unusedPool();
    const city = dayPlan.length ? dayCityLabel(di) : '';
    const outdoorOk = !indoorStrict || outdoorSightsOn(di, replacing) === 0;
    const ok = (p) => (!city || !p.city || p.city === city) && (!pred || pred(p)) && (outdoorOk || isIndoorPick(p));
    // 실내 위주면 실내 후보부터
    let idx = prefs.indoorFocus && !pred ? unused.findIndex((p) => ok(p) && isIndoorPick(p)) : -1;
    if (idx < 0) idx = unused.findIndex(ok);
    if (idx < 0) return null;
    return unused.splice(idx, 1)[0];
  };
  // 실내 판정: 후보(picks)의 원래 이름·종류로 본다
  const isIndoorPick = (p) => Boolean(p) && isLikelyIndoor({ ...p, name: p.name, nameKo: p.nameKo });
  // 실내 위주에서 바깥 관광을 하루 하나로 묶을지(takeUnused): 실내 후보(하루짜리 제외)가 하루 하나 이상(일수, 최대 3곳) 있을 때만.
  // 규칙 일정(createItinerary)이 실내 후보만 쓰는 기준(indoorOnly)과 같다. 실내 후보가 그보다 적은 일정(이시가키·아마미 같은 섬)은
  // 규칙 일정처럼 남은 칸을 야외 후보로 채운다(묶으면 하루 관광이 1곳뿐인 날이 이어진다).
  const indoorStrict = Boolean(prefs.indoorFocus)
    && picks.filter((p) => !(p.allDay || p.fullDay || p.dayTrip) && isIndoorPick(p)).length >= Math.min(nDays, 3);
  const isIndoorBlockName = (name) => { const p = pickOf(name) || mustOf(name); return isLikelyIndoor({ name, ...(p ? { nameKo: p.nameKo, category: p.category, indoor: p.indoor } : {}) }); };
  // 하루짜리 중 '먼 당일치기'(나라·하코네·모토부·사용자가 말한 당일치기)인지(테마파크는 아님)
  const isDayTripName = (name, di) => {
    const p = pickOf(name);
    const m = mustOf(name);
    const ko = (p && p.nameKo) || (m && m.nameKo) || name;
    const stayMin = Number(p?.stayMin || m?.pick?.stayMin || m?.synthetic?.stayMin) || 0;
    if (m?.synthetic?.dayTrip) return true;
    return allDayPlaceKind({ name: ko, stayMin }, dayCityKey(di)) === 'dayTrip';
  };
  // 식당: 그날 도시의 맛집 목록에서(먹고 싶은 것 → 아직 안 간 실제 가게 → '찾기' 안내 → 이미 간 곳 중 전날·다음날·그날과 겹치지 않는 곳)
  const wishes = (Array.isArray(opts.foodWishes) ? opts.foodWishes : []).map((w) => String(w || '').trim()).filter(Boolean).slice(0, 3);
  const foodOfName = (name) => { const i = findIdx(name, foodKeys); return i >= 0 ? foods[i] : null; };
  const foodMatchesWish = (f, w) => {
    if (!f) return false;
    const g = canonicalFoodGenre(w) || w;
    return [f.genre, f.name, f.nameKo].some((x) => x && (String(x) === g || String(x) === w || String(x).includes(w) || String(x).includes(g)));
  };
  const mealBlocks = () => days.flatMap((d) => d.items.filter((b) => !b.plain && MEAL_PERIODS.has(b.period)));
  const wishMet = (w) => mealBlocks().some((b) => foodMatchesWish(foodOfName(b.name), w) || String(b.title).includes(w));
  const foodKeyOf = (f) => placeNameKey(f.nameKo || f.name);
  const mealKeyOf = (b) => { const f = foodOfName(b.name); return f ? foodKeyOf(f) : placeNameKey(b.name); };
  // 날짜별 도시가 있는 날은 그 도시 가게만(다른 도시로 넘어가지 않는다: 그 도시 가게가 없으면 위에서 보탠 '찾기' 안내).
  // 날짜별 도시가 없으면(한 도시 일정) 도시 이름이 맞는 가게, 없으면 전체.
  const foodsOfCity = (c) => foods.filter((f) => !c || !f.city || f.city === c);
  const cityFoodsOf = (di) => {
    const list = foodsOfCity(dayCityLabel(di));
    return list.length || dayPlan[di]?.city ? list : foods;
  };
  // 이름이 c 도시 맛집인지(같은 이름의 향토 음식이 두 도시에 있으면('기리탄포'·'바사시') 어느 도시든 맞다)
  const foodInCity = (name, c) => foodsOfCity(c).some((x) => findIdx(name, [keysOf(x)]) >= 0);
  // 도시를 옮기는 날의 아침·점심이 떠나는 도시 가게이고 '출발 전' 식사인지(그대로 둔다: 출발 전에 먹는다).
  // (1) 그날 이 식사 뒤에 시작하는 이동 블록(시각이 적힌 '신칸센 이동 (도쿄역 → 신오사카)'·'하네다 공항에서 나하로 이동')이 있으면 출발 전이다.
  // (2) 그런 블록이 없으면, 이 식사보다 먼저 시작하는 블록에 '이미 도착했다'는 근거가 있을 때만 출발 전이 아니다:
  //     이동 블록, 그날 도시의 후보 관광·꼭 갈 곳(빈 낮 채우기(h)가 넣은 칸도 센다), 그날 도시 가게 식사.
  //     체크아웃·자유 일정, 떠나는 도시 관광·가게, 목록에 없는 이름(일반 문구)은 근거가 아니다(떠나는 도시 가게로 둔다).
  // 근거가 있으면 그날 도시 가게로 바꾼다(검토: '오사카성 → 스시다이 (츠키지) → 도톤보리'는 오사카 가게로,
  // '호텔 체크아웃 → 스시다이 → 신칸센 이동'·'시부야 스카이 → 스시다이 → 오후 오사카'는 스시다이 그대로).
  // 규칙 일정도 이동 안내를 그날 첫 줄에 두고 이동 날 식사를 도착 도시로 잡는다. 시각 없는 이동 안내 줄은 보지 않는다.
  const MOVE_TITLE_RE = /이동|transfer|移動|공항|airport|空港|신칸센|shinkansen|新幹線|비행기|항공편|flight|飛行機|페리|ferry|フェリー|->|→/i;
  const isMoveBlock = (x) => !x.plain && MOVE_TITLE_RE.test(x.title);
  const placeCityOf = (name) => pickOf(name)?.city || mustOf(name)?.city || '';
  const departureMeal = (di, b) => {
    const from = dayPlan[di]?.transferFrom || '';
    const city = dayCityLabel(di);
    if (!from || b.period === '저녁' || foodInCity(b.name, city) || !foodInCity(b.name, from)) return false;
    const others = (days[di]?.items || []).filter((x) => x !== b && !x.plain);
    if (others.some((x) => x.start > b.start && isMoveBlock(x))) return true;
    const arrivedBy = (x) => {
      if (isMoveBlock(x)) return true;
      if (MEAL_PERIODS.has(x.period)) return foodInCity(x.name, city) && !foodInCity(x.name, from);
      return !isFreeOrMove(x) && placeCityOf(x.name) === city;
    };
    return !others.some((x) => x.start < b.start && arrivedBy(x));
  };
  // 가게 f를 di일째에 쓰면 얼마나 겹치는지: 0 아직 안 감 → 1 이미 갔지만 전날·다음날·그날은 아님 → 2 전날·다음날에 감 → 3 그날 이미 감.
  // skip: 셈에서 뺄 블록(바꾸려는 칸 자신) 또는 그런 블록들의 Set
  const foodTier = (di, f, skip = null) => {
    const k = foodKeyOf(f);
    const skipped = (b) => (skip instanceof Set ? skip.has(b) : b === skip);
    let tier = 0;
    days.forEach((d, i) => d.items.forEach((b) => {
      if (skipped(b) || b.plain || !MEAL_PERIODS.has(b.period) || mealKeyOf(b) !== k) return;
      tier = Math.max(tier, i === di ? 3 : (Math.abs(i - di) === 1 ? 2 : 1));
    }));
    return tier;
  };
  // 가장 덜 겹치는 가게({ food, tier }). 같은 단계면 아직 안 간 곳은 실제 가게 먼저, 이미 간 곳은 '찾기' 안내 먼저
  // (가게 수보다 식사 칸이 많을 때 같은 실제 가게를 이어서 넣지 않게). 그다음은 목록 순서.
  const pickByTier = (di, list, skip = null) => {
    let best = null;
    for (const f of list) {
      const tier = foodTier(di, f, skip);
      const score = tier * 2 + ((tier === 0) === Boolean(f.generic) ? 1 : 0);
      if (!best || score < best.score) best = { food: f, tier, score };
    }
    return best;
  };
  const chooseFood = (di, avoid = new Set()) => {
    const list = cityFoodsOf(di).filter((f) => !avoid.has(foodKeyOf(f)));
    if (!list.length) return null;
    for (const w of wishes) {
      if (wishMet(w)) continue;
      const hit = list.find((f) => foodMatchesWish(f, w));
      if (hit) return hit;
    }
    return pickByTier(di, list)?.food || null;
  };
  const foodBlock = (period, start, end, f) => newPostBlock(period, start, end, f.name, f.generic ? '' : (f.area || ''));

  if (!ruleMode) {
    // (b)(c) 식사·관광 분류: 저녁·점심에 들어간 관광·자유 일정 → 오후(시각 유지). 오전·오후에 들어간 맛집(foods 이름) → 점심(15시 전)/저녁.
    for (const d of days) {
      for (const b of d.items) {
        if (b.plain) continue;
        if (MEAL_PERIODS.has(b.period)) {
          if (!isMealBlock(b)) {
            b.period = b.start < 12 * 60 ? '오전' : '오후';
            stats.sightsRelabeled += 1;
          } else if (b.period === '점심' && b.start >= 16 * 60) {
            b.period = '저녁';
            stats.mealsMoved += 1;
          } else if (b.period === '저녁' && b.start < 15 * 60) {
            b.period = '점심';
            stats.mealsMoved += 1;
          }
        } else if (b.period !== '종일' && isFoodName(b.name) && !pickOf(b.name) && !mustOf(b.name)) {
          b.period = b.start < 15 * 60 ? '점심' : '저녁';
          stats.mealsMoved += 1;
        } else if (b.period !== '종일') {
          // 시각과 맞지 않는 토큰(예: "오전(14:00-16:00)")은 시각에 맞춘다
          const want = b.start < 12 * 60 ? '오전' : '오후';
          if (b.period !== want) { b.period = want; stats.sightsRelabeled += 1; }
        }
      }
      // 점심·저녁(아침)은 하루 하나씩: 넘치는 것은 버린다
      const seenMeal = new Set();
      d.items = d.items.filter((b) => {
        if (b.plain || !MEAL_PERIODS.has(b.period)) return true;
        if (seenMeal.has(b.period)) { stats.trimmed += 1; return false; }
        seenMeal.add(b.period);
        return true;
      });
    }

    // (c-2) 후보 이름을 다르게 적은 관광 블록: AI가 일본어 후보 이름을 번역·음역하거나 섞어 쓴 이름('釜淵노타키', 'おび히로動物園',
    // '포트타워 세리온', 'Kamabuchi Falls')은 같은 후보의 표기(한·영·일 이름)와 같거나 글자가 많이 겹치면 그 후보 이름으로 되돌린다.
    // 어느 후보·꼭 갈 곳·경로 도시의 내장 장소와도 맞지 않는 이름(지어낸 곳)은 아직 쓰지 않은 후보로 바꾸거나 지운다(unverified로 센다).
    // 되돌린 이름이 다른 날과 겹치면 반복 정리(g-2)가, 비게 된 낮은 빈 낮 채우기(h)가 맡는다.
    {
      const routeKeys = Array.from(new Set([cityKeyByLabel(opts.cityLabel), ...dayPlan.map((dp) => cityKeyByLabel(dp?.city))].filter(Boolean)));
      const labelCache = new Map();
      const labelsOfPick = (p) => {
        if (labelCache.has(p)) return labelCache.get(p);
        const ko = String(p.nameKo || p.name || '');
        const ck = cityKeyByLabel(p.city) || routeKeys[0] || '';
        const media = ck ? placeMediaFor(ck, ko) : null;
        const labels = Array.from(new Set([p.name, p.nameKo, media?.labels?.en, media?.labels?.ja,
          ...placeLabelIndex().filter((e) => e.ko === ko && (!ck || e.ck === ck)).map((e) => e.label)].filter(Boolean).map(String)));
        labelCache.set(p, labels);
        return labels;
      };
      const mustRestorable = must.map((m) => m.pick || { name: m.name, nameKo: m.nameKo, area: m.area, city: m.city });
      const restorable = [...picks, ...mustRestorable];
      const exactPick = (name) => {
        const k = placeNameKey(name);
        if (!k) return null;
        return restorable.find((p) => labelsOfPick(p).some((l) => placeNameKey(l) === k)) || null;
      };
      // 날짜별 도시가 있으면 글자 겹침으로 되돌릴 때는 그날 도시 후보(도시가 없는 후보·꼭 갈 곳 포함)만 본다. 다른 도시 후보로 되돌리면
      // 그날 도시가 아닌 장소가 남는다(가고시마 날 '메이지 신궁' → 미야자키 '이키메 신사', 2026-10-03 R8). 그날 도시에서 못 찾으면
      // 아래 unknown으로 가서 takeUnused(di)가 그날 도시 후보로 바꾼다. 같은 표기(exactPick)는 예전처럼 모든 후보에서 찾는다.
      const overlapPick = (name, di) => {
        if (!placeNameKey(name)) return null;
        // 글자(한글·한자·가나) 겹침 비율: 가장 비슷한 후보가 0.6 이상이고 3글자 이상 겹치며 둘째와 분명히 다를 때만.
        // 로마자뿐인 이름은 글자 수가 적어 아무 이름과도 겹치므로 같은 표기만 본다.
        if (nameLetters(name).filter((ch) => !/[a-z0-9]/.test(ch)).length < 3) return null;
        const city = dayPlan.length ? dayCityLabel(di) : '';
        const pool = city ? [...picks.filter((p) => !p.city || p.city === city), ...mustRestorable] : restorable;
        let best = null;
        let bestScore = 0;
        let secondScore = 0;
        for (const p of pool) {
          const s = Math.max(...labelsOfPick(p).map((l) => nameOverlap(name, l)));
          if (s > bestScore) { secondScore = bestScore; bestScore = s; best = p; } else if (s > secondScore) secondScore = s;
        }
        return best && bestScore >= 0.6 && bestScore - secondScore >= 0.15 && sharedLetters(name, labelsOfPick(best)) >= 3 ? best : null;
      };
      // 후보에는 없지만 경로 도시의 내장 장소인 이름(후보 수를 넘은 도시 명소 등): 그 장소의 화면 언어 이름으로
      const knownInRoute = (name) => placeLabelMatches(name, routeKeys).find((e) => routeKeys.includes(e.ck)) || null;
      const unknown = [];
      days.forEach((d, di) => d.items.forEach((b) => {
        if (!isSightBlock(b)) return;
        // 띄어쓰기·기호만 다르거나 줄이거나 덧붙인 후보 이름('일본현대시가문학관', 도시 이름을 뺀 '아사히교')은 후보 표기 그대로
        // (지도 좌표·사진이 이름으로 찾는다)
        const same = pickOf(b.name);
        if (same && same.name !== b.name) b.name = same.name;
        if (same || mustOf(b.name) || isFoodName(b.name)) return;
        const exact = exactPick(b.name);
        const hit = exact || overlapPick(b.name, di);
        if (hit) {
          b.name = hit.name;
          // 겹침으로 되돌린 이름은 지역도 후보 값으로(AI가 쓴 다른 장소의 지역 '하라주쿠'가 남지 않게)
          if (hit.area && (!b.area || !exact)) b.area = hit.area;
          stats.namesRestored += 1;
          return;
        }
        const known = knownInRoute(b.name);
        if (!known) { unknown.push([di, b]); return; }
        const shown = lang === 'ko' ? known.ko : localizePlaceLabel(known.ko, [known.ck], lang);
        if (shown && shown !== b.name) { b.name = shown; stats.namesRestored += 1; }
      }));
      for (const [di, b] of unknown) {
        stats.unverified += 1;
        const d = days[di];
        const next = b.period === '종일' ? null : takeUnused(di, null, b);
        d.items = next ? d.items.map((x) => (x === b ? newPostBlock(b.period, b.start, b.end, next.name, next.area || '') : x)) : d.items.filter((x) => x !== b);
      }
      unused = null;
    }

    // (d-0) 후보(picks)에도 꼭 갈 곳에도 없는 하루짜리(테마파크·먼 당일치기, 예: AI가 프롬프트 예시를 보고 넣은 '도쿄 디즈니랜드')는 지운다.
    // 요청하지 않은 하루짜리는 후보 단계에서 이미 걸렀으므로(4일 이하는 빼고, 5일 이상은 4일마다 1곳) 여기 남은 것은 고르지 않은 곳이다.
    // 종일 병합(d)보다 먼저 지워 같은 날의 다른 관광은 남긴다. 비게 된 낮은 (h)가 남은 후보로 채운다.
    days.forEach((d, di) => {
      d.items = d.items.filter((b) => {
        if (b.plain || !SIGHT_PERIODS.has(b.period) || isFreeOrMove(b)) return true;
        if (pickOf(b.name) || mustOf(b.name)) return true;
        if (!allDayPlaceKind({ name: b.name }, dayCityKey(di))) return true;
        stats.trimmed += 1;
        return false;
      });
    });

    // (d) 종일 병합: 하루 전체가 드는 곳이 반나절 칸에 있거나 관광 블록이 6시간 이상이면, 그날 관광은 '종일' 하나로(식사는 남긴다).
    days.forEach((d, di) => {
      const sightsAll = d.items.filter((b) => !b.plain && SIGHT_PERIODS.has(b.period));
      const real = sightsAll.filter((b) => !isFreeOrMove(b));
      for (const b of real) {
        if (b.period === '종일' && !isAllDayName(b.name, di) && (b.end - b.start) < 360) {
          b.period = b.start < 12 * 60 ? '오전' : '오후';
          stats.sightsRelabeled += 1;
        }
      }
      const anchor = real.find((b) => b.period === '종일') || real.find((b) => isAllDayName(b.name, di) || (b.end - b.start) >= 360);
      if (!anchor) return;
      const others = sightsAll.filter((b) => b !== anchor);
      if (anchor.period === '종일' && others.length === 0) return;
      const start = Math.min(...real.map((b) => b.start));
      const dinner = d.items.find((b) => !b.plain && b.period === '저녁');
      let end = Math.min(Math.max(...real.map((b) => b.end), start + 8 * 60), 21 * 60);
      if (dinner && dinner.start > start + 4 * 60) end = Math.min(end, dinner.start);
      anchor.period = '종일';
      anchor.start = start;
      anchor.end = Math.max(end, start + 60);
      d.items = d.items.filter((b) => !others.includes(b));
      stats.allDayMerged += 1;
    });

    // (d-2) 종일 칸 안의 점심(도시 맛집)은 지운다(테마파크·당일치기 현지에서 먹는다). 당일치기 날 저녁은 (h-5)에서 현지 식사로.
    days.forEach((d) => {
      const whole = d.items.find((b) => !b.plain && b.period === '종일' && !isFreeOrMove(b));
      if (!whole) return;
      d.items = d.items.filter((b) => {
        if (b.plain || b.period !== '점심' || b.start < whole.start || b.start >= whole.end) return true;
        stats.trimmed += 1;
        return false;
      });
    });

    // (g-1) 제외: 빼 달라고 한 곳과 '쇼핑 제외'일 때의 쇼핑 장소(꼭 갈 곳은 예외)는 아직 쓰지 않은 후보로 바꾸거나 지운다.
    // (칸을 하나씩 그 자리에서 바꾼다: 실내 위주의 그날 바깥 관광 수를 takeUnused가 바뀐 칸까지 보고 센다)
    days.forEach((d, di) => {
      for (const b of [...d.items]) {
        if (b.plain || !SIGHT_PERIODS.has(b.period) || isFreeOrMove(b)) continue;
        const excluded = isExcludedPlace(b.name, excludedKeys)
          || (prefs.removeShopping && !mustOf(b.name) && isLikelyShopping({ ...(pickOf(b.name) || {}), name: b.name, area: b.area }));
        if (!excluded) continue;
        stats.trimmed += 1;
        const next = b.period === '종일' ? null : takeUnused(di, null, b);
        if (next) Object.assign(b, newPostBlock(b.period, b.start, b.end, next.name, next.area || ''));
        else d.items = d.items.filter((x) => x !== b);
      }
    });

    // (g-1b) 실내 위주(비 오는 날): 하루 바깥 관광은 하나까지. 넘치는 바깥 관광(꼭 갈 곳 제외)은 아직 쓰지 않은 실내 후보로 바꾼다.
    if (prefs.indoorFocus) {
      days.forEach((d, di) => {
        let outdoorKept = 0;
        d.items = d.items.map((b) => {
          if (!isSightBlock(b) || b.period === '종일' || mustOf(b.name) || isIndoorBlockName(b.name)) return b;
          if (outdoorKept === 0) { outdoorKept += 1; return b; }
          const next = takeUnused(di, isIndoorPick);
          if (!next) return b;
          stats.indoorSwapped += 1;
          return newPostBlock(b.period, b.start, b.end, next.name, next.area || '');
        });
      });
    }
    // (g-1c) 저예산: 꼭 갈 곳이 아닌 유료 전망대·수족관 등은 아직 쓰지 않은 무료 명소로 바꾼다(없으면 그대로)
    if (prefs.lowBudget) {
      const paidName = (name) => { const p = pickOf(name) || mustOf(name); return isPaidSightPlace({ name, ...(p ? { nameKo: p.nameKo, category: p.category, city: p.city } : {}) }, dayCityKey(0)); };
      days.forEach((d, di) => {
        for (const b of d.items) {
          if (!isSightBlock(b) || b.period === '종일' || mustOf(b.name) || !paidName(b.name)) continue;
          const next = takeUnused(di, (p) => !isPaidSightPlace(p, dayCityKey(di)), b);
          if (!next) continue;
          stats.trimmed += 1;
          Object.assign(b, newPostBlock(b.period, b.start, b.end, next.name, next.area || ''));
        }
      });
    }
  }

  // (e) 꼭 갈 곳: 빠진 곳은 첫 자유 일정 칸을 대신하고, 없으면 관광이 가장 적은 날에 '오후(15:00-17:00)'로 넣는다.
  // 하루 전체가 드는 곳은 중간 날의 '종일'로. 그래도 못 넣으면 missingMustVisit.
  const presentMust = (m) => days.some((d) => d.items.some((b) => !b.plain && findIdx(b.name, [keysOf(m)]) >= 0));
  // preferStart: 먼저 해 볼 시작 시각(예: 저녁이 좋은 곳의 추천 시작 18:00)
  const findFreeSlot = (d, dur, lo, hi, preferStart = null) => {
    const timed = d.items.filter((b) => !b.plain && b.period !== '종일');
    const fits = (s) => s >= lo && s + dur <= hi && timed.every((b) => s + dur <= b.start || s >= b.end);
    const evening = preferStart !== null && preferStart >= 17 * 60;
    const cands = evening
      ? [preferStart, ...timed.map((b) => b.end).filter((s) => s >= 17 * 60), ...timed.map((b) => b.start - dur).filter((s) => s >= 16 * 60), 19 * 60 + 30, 17 * 60]
      : [...(preferStart !== null ? [preferStart] : []), 15 * 60, ...timed.map((b) => b.end + 30), ...timed.map((b) => b.start - dur - 30), lo, 13 * 60, 10 * 60];
    for (const s of cands) if (fits(s)) return s;
    return null;
  };
  const bestStartOf = (m) => {
    const bt = String(m.pick?.bestTime || m.synthetic?.bestTime || m.bestTime || '');
    const s = clockToMin(normalizeClockText(bt.split('-')[0]));
    return s;
  };
  for (const m of must) {
    if (presentMust(m)) continue;
    const cityOk = (di) => !dayPlan.length || !m.city || dayCityLabel(di) === m.city;
    const sightCount = (d) => d.items.filter(isSightBlock).length;
    const hasAllDay = (d) => d.items.some((b) => !b.plain && b.period === '종일');
    let placed = false;
    if (m.allDay) {
      const middle = (di) => nDays < 3 || (di > 0 && di < nDays - 1);
      const order = [...Array(nDays).keys()].filter(cityOk)
        .filter((di) => !hasAllDay(days[di]))
        .sort((a, b) => (Number(middle(b)) - Number(middle(a))) || (sightCount(days[a]) - sightCount(days[b])));
      for (const di of order) {
        const d = days[di];
        const lo = loOf(di);
        const dinner = d.items.find((b) => !b.plain && b.period === '저녁');
        const hi = Math.min(hiOf(di), dinner && dinner.start > lo + 4 * 60 ? dinner.start : 18 * 60);
        if (hi - lo < 4 * 60) continue;
        d.items = d.items.filter((b) => b.plain || !SIGHT_PERIODS.has(b.period));
        d.items.push(newPostBlock('종일', lo, hi, m.name, m.area));
        placed = true;
        break;
      }
    } else {
      const bestStart = bestStartOf(m);
      const eveningMust = bestStart !== null && bestStart >= 17 * 60;
      // 저녁이 좋은 곳(도톤보리 야경 등)은 저녁 시간에 맞춰 짧게라도(최소 60분) 넣는다
      const dur = eveningMust ? 90 : clamp(Number(m.pick?.stayMin || m.synthetic?.stayMin) || 120, 60, 180);
      // (1) 첫 자유 일정 칸(저녁이 좋은 곳은 건너뛴다: 낮의 자유 일정은 맞지 않다)
      for (let di = 0; di < nDays && !placed && !eveningMust; di += 1) {
        if (!cityOk(di)) continue;
        const free = days[di].items.find((b) => !b.plain && SIGHT_PERIODS.has(b.period) && b.period !== '종일' && isFreeOrMove(b) && FREE_TIME_TITLES.has(b.name));
        if (free) {
          Object.assign(free, newPostBlock(free.period, free.start, free.end, m.name, m.area));
          placed = true;
        }
      }
      // (2) 관광이 가장 적은 날의 빈 시간(15:00-17:00 우선, 저녁이 좋은 곳은 추천 시작 시각 우선)
      if (!placed) {
        const order = [...Array(nDays).keys()].filter((di) => cityOk(di) && !hasAllDay(days[di]))
          .sort((a, b) => sightCount(days[a]) - sightCount(days[b]));
        for (const di of order) {
          const hi = eveningMust ? Math.max(hiOf(di), Math.min(22 * 60, (di === nDays - 1 && lastDayMaxEnd !== null) ? lastDayMaxEnd : 22 * 60)) : hiOf(di);
          const s = findFreeSlot(days[di], dur, loOf(di), hi, eveningMust ? bestStart : null);
          if (s === null) continue;
          days[di].items.push(newPostBlock(s < 12 * 60 ? '오전' : '오후', s, s + dur, m.name, m.area));
          placed = true;
          break;
        }
      }
      // (3) 빈 시간이 없으면 관광이 2곳 이상인 날의 마지막 일반 관광을 바꾼다
      if (!placed) {
        const order = [...Array(nDays).keys()].filter((di) => cityOk(di) && !hasAllDay(days[di]))
          .sort((a, b) => sightCount(days[b]) - sightCount(days[a]));
        for (const di of order) {
          if (sightCount(days[di]) < 2) continue;
          const sights = days[di].items.filter(isSightBlock).filter((b) => !mustOf(b.name) && b.period !== '종일');
          const target = sights[sights.length - 1];
          if (!target) continue;
          Object.assign(target, newPostBlock(target.period, target.start, target.end, m.name, m.area));
          placed = true;
          break;
        }
      }
    }
    if (placed) stats.mustInserted += 1;
    else missingMustVisit.push(m.name);
  }

  if (!ruleMode) {
    const maxPerDay = Number(prefs.maxPlacesPerDay) > 0 ? clamp(Number(prefs.maxPlacesPerDay), 1, 5) : 4;
    const LATEST_SIGHT_START = 21 * 60;
    const LATEST_MEAL_START = 21 * 60 + 30;
    const tooLate = (b, start) => start >= (MEAL_PERIODS.has(b.period) ? LATEST_MEAL_START : LATEST_SIGHT_START);
    days.forEach((d, di) => {
      sortItems(d);
      const hi = (di === nDays - 1 && lastDayMaxEnd !== null) ? lastDayMaxEnd : 23 * 60 + 30;
      // (f-1) 시작 시각(늦은 시작·첫날 도착): 그보다 이른 블록은 미룬다(길이 유지). 너무 늦어지면 지운다.
      let lo = dayStartMin;
      if (di === 0 && day1MinStart !== null) lo = Math.max(lo ?? 0, day1MinStart);
      if (lo !== null) {
        d.items = d.items.filter((b) => {
          if (b.plain || b.start >= lo) return true;
          const dur = b.end - b.start;
          if (tooLate(b, lo) || lo + Math.min(dur, 30) > hi) { stats.trimmed += 1; return false; }
          // 종일 칸은 늦게 시작해도 끝 시각을 늘리지 않는다(저녁 식사와 겹치지 않게). 4시간이 안 남으면 4시간으로.
          b.end = b.period === '종일' ? Math.max(b.end, lo + 4 * 60) : Math.min(lo + dur, 23 * 60 + 59);
          b.start = lo;
          stats.shifted += 1;
          return true;
        });
      }
      // (f-2) 마지막 날 출발: 출발−120분 이후 블록은 당기거나(끝을 줄임) 지운다
      if (di === nDays - 1 && lastDayMaxEnd !== null) {
        d.items = d.items.filter((b) => {
          if (b.plain || b.end <= lastDayMaxEnd) return true;
          if (lastDayMaxEnd - b.start >= 30) { b.end = lastDayMaxEnd; stats.shifted += 1; return true; }
          stats.trimmed += 1;
          return false;
        });
      }
      // (f-3) 겹침: 시간 순으로 앞 블록과 겹치면 뒤로 민다(길이 유지). 관광은 다음 식사 시작을 넘기면, 식사는 너무 늦어지면 지운다.
      // 종일 칸 안의 식사(테마파크 점심 등)는 겹침으로 보지 않는다.
      sortItems(d);
      const timed = d.items.filter((b) => !b.plain && b.period !== '종일');
      let prevEnd = -1;
      const drop = new Set();
      timed.forEach((b, idx) => {
        if (b.start < prevEnd) {
          const dur = b.end - b.start;
          const newStart = prevEnd;
          const newEnd = newStart + dur;
          const nextMeal = timed.slice(idx + 1).find((x) => MEAL_PERIODS.has(x.period) && !drop.has(x));
          const isMeal = MEAL_PERIODS.has(b.period);
          const fits = !tooLate(b, newStart) && newEnd <= hi && (isMeal || mustOf(b.name) || !nextMeal || newEnd <= nextMeal.start);
          if (!fits) { drop.add(b); stats.trimmed += 1; return; }
          b.start = newStart;
          b.end = newEnd;
          stats.shifted += 1;
        }
        prevEnd = Math.max(prevEnd, b.end);
      });
      if (drop.size) d.items = d.items.filter((b) => !drop.has(b));
      // (f-4) 하루 관광 수 제한(식사는 세지 않음). 꼭 갈 곳을 먼저 남긴다.
      const sights = d.items.filter(isSightBlock);
      if (sights.length > maxPerDay) {
        const keep = new Set();
        sights.filter((b) => mustOf(b.name)).forEach((b) => { if (keep.size < maxPerDay) keep.add(b); });
        sights.forEach((b) => { if (keep.size < maxPerDay) keep.add(b); });
        d.items = d.items.filter((b) => !isSightBlock(b) || keep.has(b));
        stats.trimmed += sights.length - keep.size;
      }
      // (f-5) 밀린 블록의 시간대 토큰을 시각에 맞춘다(관광: 12시 기준 오전/오후, 식사: (b)(c)와 같은 기준 — 점심은 16시부터 저녁,
      // 저녁은 15시 전이면 점심). 그날 이미 있는 식사 칸으로는 바꾸지 않는다: 15:00 점심을 저녁으로 바꿔 점심이 비고 저녁이 둘이
      // 되지 않게(실측 10-02 후쿠오카 2일차 '점심(15:00-16:00)' + '저녁(18:00-19:30)').
      for (const b of d.items) {
        if (b.plain || b.period === '종일' || b.period === '아침') continue;
        let want;
        if (MEAL_PERIODS.has(b.period)) {
          want = b.period;
          if (b.period === '점심' && b.start >= 16 * 60) want = '저녁';
          else if (b.period === '저녁' && b.start < 15 * 60) want = '점심';
          if (want !== b.period && d.items.some((x) => x !== b && !x.plain && x.period === want)) want = b.period;
        } else {
          want = b.start < 12 * 60 ? '오전' : '오후';
        }
        if (want !== b.period) b.period = want;
      }
    });

    // (f-6) 저녁이 좋은 꼭 갈 곳(도톤보리 야경처럼 추천 시작 17시 이후)을 AI가 낮에 넣었으면 같은 날 저녁의 빈 시간으로 옮긴다.
    for (const m of must) {
      const bestStart = bestStartOf(m);
      if (m.allDay || bestStart === null || bestStart < 17 * 60) continue;
      for (let di = 0; di < nDays; di += 1) {
        const d = days[di];
        const b = d.items.find((x) => isSightBlock(x) && x.period !== '종일' && findIdx(x.name, [keysOf(m)]) >= 0);
        if (!b || b.start >= 16 * 60) continue;
        const others = d.items.filter((x) => x !== b && !x.plain && x.period !== '종일');
        const hi = (di === nDays - 1 && lastDayMaxEnd !== null) ? lastDayMaxEnd : 22 * 60;
        const cands = [bestStart, ...others.map((x) => x.end).filter((s) => s >= 17 * 60), 19 * 60 + 30, 20 * 60];
        const free = (s, dur, latest) => s >= 17 * 60 && s <= latest && s + dur <= hi && others.every((o) => s + dur <= o.start || s >= o.end);
        let moved = false;
        const moveTo = (s, dur) => { Object.assign(b, newPostBlock('오후', s, s + dur, b.name, b.area)); moved = true; };
        // (1) 저녁의 빈 시간(2시간 → 1시간 반, 20:30 전 시작)
        for (const dur of [Math.min(Math.max(60, b.end - b.start), 120), 90]) {
          const s = cands.find((x) => free(x, dur, 20 * 60 + 30));
          if (s !== undefined) { moveTo(s, dur); break; }
        }
        // (2) 빈 시간이 없으면 저녁 시간의 다른 관광(꼭 갈 곳이 아닌 곳)과 시간을 맞바꾼다
        if (!moved) {
          const swap = others.find((o) => isSightBlock(o) && o.start >= 17 * 60 && !mustOf(o.name));
          if (swap) {
            const [bs, be, os, oe] = [b.start, b.end, swap.start, swap.end];
            Object.assign(b, newPostBlock('오후', os, oe, b.name, b.area));
            Object.assign(swap, newPostBlock(bs < 12 * 60 ? '오전' : '오후', bs, be, swap.name, swap.area));
            moved = true;
          }
        }
        // (3) 그래도 안 되면 저녁 식사 뒤 1시간(21:00 전 시작)
        if (!moved) {
          const s = cands.find((x) => free(x, 60, 21 * 60));
          if (s !== undefined) moveTo(s, 60);
        }
        if (moved) { stats.shifted += 1; sortItems(d); }
      }
    }

    // (g-2) 반복: 여러 날 되풀이된 후보(picks·꼭 갈 곳)는 아직 쓰지 않은 후보로 바꾼다(제약으로 빠진 후보도 다시 쓸 수 있다).
    // 식사·자유·이동 블록은 대상이 아니다. 바꿀 후보가 없으면 그대로 두고, 꼭 갈 곳 중복은 지운다.
    unused = null;
    const seen = new Set();
    days.forEach((d, di) => {
      for (const b of [...d.items]) {
        if (b.plain || !SIGHT_PERIODS.has(b.period) || isFreeOrMove(b)) continue;
        const key = keyOfBlock(b);
        const repeat = seen.has(key) && Boolean(pickOf(b.name) || mustOf(b.name));
        if (!repeat) { seen.add(key); continue; }
        const next = b.period === '종일' ? null : takeUnused(di, null, b);
        if (next) {
          seen.add(placeNameKey(next.nameKo || next.name));
          stats.repeatsReplaced += 1;
          Object.assign(b, newPostBlock(b.period, b.start, b.end, next.name, next.area || ''));
          continue;
        }
        // 바꿀 후보가 없으면(명소가 적은 섬 등) 같은 곳을 또 넣지 않고 지운다: 빈 시간은 아래 단계가 자유 일정으로 둔다
        stats.trimmed += 1;
        d.items = d.items.filter((x) => x !== b);
      }
    });

    // (h) 빈 낮 채우기: 관광이 목표(하루 2곳, 여유·적게 걷기·아이 동반이 아니면 3곳, 하루 장소 수 이하)보다 적은 날은
    // 낮의 자유 일정 칸부터 아직 쓰지 않은 후보로 바꾸고, 그래도 모자라면 빈 시간(2시간)에 후보를 더한다. 휴식일·짧은 첫날/마지막 날은 그대로 둔다.
    const restDayIdx = (prefs.addRestDay || prefs.doNothingDay) && nDays >= 3 ? Math.floor(nDays / 2) : -1;
    const fillTarget = Math.min(maxPerDay, (prefs.relaxedPace || prefs.lowWalking || prefs.kidsFriendly || prefs.strollerFriendly) ? 2 : 3);
    unused = null;
    // 남은 후보를 고르게 나눈다: 관광이 0곳인 날부터 1곳 → 모든 날 2곳 → 목표(3곳) 순으로 채운다
    const fillDay = (d, di, upTo) => {
      if (di === restDayIdx) return;
      if (d.items.some((b) => !b.plain && b.period === '종일' && !isFreeOrMove(b))) return;
      const lo = loOf(di);
      const hi = Math.min(hiOf(di), 18 * 60 + 30);
      if (hi - lo < 120) return;
      let count = d.items.filter(isSightBlock).length;
      for (const b of d.items) {
        if (count >= upTo) break;
        if (b.plain || !SIGHT_PERIODS.has(b.period) || b.period === '종일' || !FREE_TIME_TITLES.has(b.name)) continue;
        const next = takeUnused(di);
        if (!next) break;
        // 짧은 자유 일정 칸은 90분까지 늘리되, 다음 블록·그날 끝 시각(출발 등)을 넘기지 않는다
        const nextStart = Math.min(...d.items.filter((x) => !x.plain && x !== b && x.period !== '종일' && x.start >= b.start).map((x) => x.start), hiOf(di));
        Object.assign(b, newPostBlock(b.period, b.start, Math.max(b.end, Math.min(b.start + 90, nextStart)), next.name, next.area || ''));
        stats.sightsAdded += 1;
        count += 1;
      }
      while (count < upTo) {
        const s = findFreeSlot(d, 120, lo, hi);
        if (s === null) break;
        const next = takeUnused(di);
        if (!next) break;
        d.items.push(newPostBlock(s < 12 * 60 ? '오전' : '오후', s, s + 120, next.name, next.area || ''));
        stats.sightsAdded += 1;
        count += 1;
      }
      sortItems(d);
    };
    for (const upTo of [1, 2, fillTarget].filter((n, i, arr) => n <= fillTarget && arr.indexOf(n) === i)) {
      days.forEach((d, di) => fillDay(d, di, upTo));
    }

    // (h-1a) 식사 도시 맞추기: 날짜별 도시(dayPlan)가 있으면 맛집 목록(foods)에 있는 가게 중 그날 도시 가게가 아닌 것
    // (실측: 도쿄→오키나와 일정의 오키나와 날 '아후리 라멘 (에비스)')은 그날 도시 가게로 바꾼다(먹고 싶은 음식 → 아직 안 간 곳 → '찾기' 안내).
    // 도시를 옮기는 날의 '출발 전' 아침·점심(뒤에 이동 블록이 있거나 앞에 도착 근거가 없음, departureMeal)은 떠나는 도시(transferFrom) 가게도 그대로 둔다.
    // 앞에 그날 도시 관광·가게·이동 블록이 있는 이동 날 식사는 도착한 뒤라 그날 도시 가게로 바꾼다. 목록에 없는 일반 문구('점심 식사 (난바)')는 건드리지 않는다.
    // 바꿀 가게도 그날 도시 목록에서만 고른다(서버 목록만 쓴다. 다른 도시로 넘어가지 않고, 비면 위에서 보탠 그 도시 맛집).
    // 같은 이름의 향토 음식이 두 도시에 있으면('기리탄포'·'바사시') 그날 도시 것으로 본다(foodInCity).
    if (dayPlan.length) {
      const wrong = [];
      days.forEach((d, di) => {
        const city = dayPlan[di]?.city;
        if (!city) return;
        d.items.forEach((b) => {
          if (b.plain || !MEAL_PERIODS.has(b.period)) return;
          const f = foodOfName(b.name);
          if (!f || foodInCity(b.name, city) || departureMeal(di, b)) return;
          wrong.push({ di, b, f });
        });
      });
      // 꼭 갈 곳 식당(mustVisit)은 말없이 지우지 않는다(예: 꼭 갈 곳 '아후리 라멘'을 AI가 오키나와 날 저녁에만 넣음).
      // 다른 칸에 이미 있으면 이 칸만 그날 도시 가게로 바꾸고, 없으면 그 가게 도시 날의 식사 칸으로 옮긴다
      // (다른 도시 가게 칸 → '찾기' 안내·일반 문구 칸 → 같은 시각이 비면 새 칸 → 실제 가게 칸, 같은 식사 먼저, 가까운 날 먼저).
      // 꼭 갈 곳·먹고 싶은 음식 칸과 먼 당일치기 날(저녁이 현지 식사로 바뀜, h-5)에는 옮기지 않는다. 옮길 곳이 없으면 그대로 둔다.
      const wrongSet = new Set(wrong.map((x) => x.b));
      const settled = new Set(); // 더 바꾸지 않을 칸: 그대로 둔 꼭 갈 곳, 꼭 갈 곳을 옮겨 받은 다른 도시 가게 칸
      const stays = (y) => !wrongSet.has(y) || settled.has(y);
      const mustSlotFor = (di, b) => {
        let best = null;
        const consider = (rank, tj, y) => { const s = rank * 100 + Math.abs(tj - di); if (!best || s < best.s) best = { s, tj, y }; };
        days.forEach((d, tj) => {
          if (tj === di || !dayPlan[tj]?.city || !foodInCity(b.name, dayPlan[tj].city)) return;
          if (d.items.some((x) => !x.plain && x.period === '종일' && isDayTripName(x.name, tj))) return;
          d.items.forEach((y) => {
            if (y.plain || !MEAL_PERIODS.has(y.period) || mustOf(y.name)) return;
            const yf = foodOfName(y.name);
            if (yf && wishes.some((w) => foodMatchesWish(yf, w))) return;
            const content = !stays(y) ? 0 : (!yf || yf.generic ? 1 : 3);
            consider(content * 2 + (y.period === b.period ? 0 : 1), tj, y);
          });
          if (!d.items.some((y) => !y.plain && y.period === b.period)) {
            const hi = (tj === nDays - 1 && lastDayMaxEnd !== null) ? lastDayMaxEnd : 22 * 60;
            const free = d.items.every((y) => y.plain || b.end <= y.start || b.start >= y.end);
            if (free && b.start >= loOf(tj) && b.end <= hi) consider(4, tj, null);
          }
        });
        return best;
      };
      for (const { di, b, f } of wrong) {
        const m = mustOf(b.name);
        if (!m || settled.has(b)) continue;
        if (days.some((d) => d.items.some((y) => y !== b && !y.plain && stays(y) && findIdx(y.name, [keysOf(m)]) >= 0))) continue;
        const slot = mustSlotFor(di, b);
        if (!slot) { settled.add(b); continue; }
        if (slot.y) {
          if (!stays(slot.y)) { settled.add(slot.y); stats.mealsCityFixed += 1; }
          Object.assign(slot.y, foodBlock(slot.y.period, slot.y.start, slot.y.end, f));
        } else {
          days[slot.tj].items.push(foodBlock(b.period, b.start, b.end, f));
          sortItems(days[slot.tj]);
        }
        stats.mealsMoved += 1;
      }
      // 바꿀 칸들은 '이미 간 곳' 셈에서 뺀다(곧 바뀌므로): 도쿄 날에 오키나와 날의 '아후리 라멘'이 있다고 '찾기' 안내로 밀리지 않게
      const todo = wrong.filter((x) => !settled.has(x.b));
      const pending = new Set(todo.map((x) => x.b));
      for (const { di, b, f } of todo) {
        const here = cityFoodsOf(di);
        // 먹고 싶은 음식이면 그날 도시의 같은 음식으로. 단 그 가게를 이미 갔으면(그 음식은 다른 칸에서 이미 먹는다) 덜 겹치는 가게로
        // (오키나와 날 점심·저녁이 모두 '아후리 라멘'일 때 '오키나와 라멘집 찾기'를 그날 두 번 넣지 않게)
        const w = wishes.find((x) => foodMatchesWish(f, x));
        const wished = w ? pickByTier(di, here.filter((x) => foodMatchesWish(x, w)), pending) : null;
        const best = wished && wished.tier === 0 ? wished : pickByTier(di, here, pending);
        pending.delete(b);
        if (!best) continue;
        Object.assign(b, foodBlock(b.period, b.start, b.end, best.food));
        stats.mealsMoved += 1;
        stats.mealsCityFixed += 1;
      }
    }

    // (h-1b) 식사 칸에 들어간 '자유 일정'·'자유 식사'(예: "점심(12:30-13:30): 자유 일정 (오사카 주변 식당)", 맛집이 적은 도시에서
    // AI가 반복을 피하려고 쓴 "저녁(18:00-19:30): 자유 식사 (이즈모)")는 장소가 아니므로 그날 도시 맛집으로 바꾼다
    const FREE_MEAL_RE = /^(?:자유\s*(?:식사|점심|저녁)|식사\s*자유|free\s*(?:meal|lunch|dinner)|(?:lunch|dinner|meal)\s+on\s+your\s+own|自由(?:食|に食事|な食事|昼食|夕食)|食事は自由)/i;
    days.forEach((d, di) => d.items.forEach((b) => {
      if (b.plain || !MEAL_PERIODS.has(b.period) || !(FREE_TIME_TITLES.has(b.name) || FREE_MEAL_RE.test(b.name))) return;
      const f = chooseFood(di);
      if (!f) return;
      Object.assign(b, foodBlock(b.period, b.start, b.end, f));
      stats.mealsAdded += 1;
    }));

    // (h-2) 저녁 식사가 없는 날(시간이 되면)은 그날 도시의 맛집으로 채운다(먹고 싶은 것 → 아직 안 간 가게 → '찾기' 안내).
    // 먼 당일치기 날은 그 지역 현지 식사. 첫날 늦은 도착·마지막 날 이른 출발로 저녁 시간이 없으면 넣지 않는다.
    days.forEach((d, di) => {
      if (d.items.some((b) => !b.plain && b.period === '저녁')) return;
      const lo = Math.max(17 * 60 + 30, (di === 0 && day1MinStart !== null) ? day1MinStart : 0);
      // 저녁 관광(야경)이 이어지는 날은 그 뒤 늦은 저녁(21:00-22:00)까지 본다
      const hi = (di === nDays - 1 && lastDayMaxEnd !== null) ? lastDayMaxEnd : 22 * 60;
      if (hi - lo < 60) return;
      const timed = d.items.filter((b) => !b.plain && b.period !== '종일');
      const whole = d.items.find((b) => !b.plain && b.period === '종일' && !isFreeOrMove(b));
      const after = (s) => Math.max(s, whole ? whole.end : 0);
      const cands = [18 * 60, ...timed.map((b) => b.end), 19 * 60, 19 * 60 + 30, 20 * 60].map(after).filter((s) => s >= lo);
      const s = cands.find((x) => x + 60 <= hi && timed.every((b) => x + 60 <= b.start || x >= b.end));
      if (s === undefined) return;
      const nextStart = Math.min(...timed.filter((b) => b.start >= s + 60).map((b) => b.start), 24 * 60);
      const end = Math.min(s + 90, hi, nextStart);
      if (whole && isDayTripName(whole.name, di)) {
        d.items.push(newPostBlock('저녁', s, end, T.localDinner(shortAreaName(whole.area || whole.name)), ''));
      } else {
        const f = chooseFood(di);
        if (!f) return;
        d.items.push(foodBlock('저녁', s, end, f));
      }
      stats.mealsAdded += 1;
      sortItems(d);
    });

    // (h-3) 먹고 싶다고 한 음식(foodWishes)이 일정의 식사에 없으면 그 음식점으로 저녁(없으면 점심) 하나를 바꾼다. 꼭 갈 곳 식당은 바꾸지 않는다.
    for (const w of wishes) {
      if (wishMet(w)) continue;
      let done = false;
      for (let di = 0; di < nDays && !done; di += 1) {
        if (days[di].items.some((b) => !b.plain && b.period === '종일' && isDayTripName(b.name, di))) continue; // 당일치기 날은 현지 식사
        const hit = cityFoodsOf(di).find((f) => foodMatchesWish(f, w));
        if (!hit) continue;
        const replaceable = (b) => !b.plain && isMealBlock(b) && !mustOf(b.name) && !wishes.some((x) => foodMatchesWish(foodOfName(b.name), x) || String(b.title).includes(x));
        const meal = days[di].items.find((b) => b.period === '저녁' && replaceable(b))
          || days[di].items.find((b) => b.period === '점심' && replaceable(b));
        if (!meal) continue;
        Object.assign(meal, foodBlock(meal.period, meal.start, meal.end, hit));
        stats.mealsMoved += 1;
        done = true;
      }
    }

    // (h-4) 같은 식당 되풀이: 두 번째부터는 덜 겹치는 그날 도시 가게로 바꾼다. 아직 안 간 곳이 있으면 그곳으로,
    // 가게를 다 썼으면(도쿄 실제 가게 3곳 + '찾기' 안내 2곳보다 식사 칸이 많을 때) 전날·다음날·그날과 겹칠 때만 겹치지 않는 곳으로
    // ('찾기' 안내 먼저, 실측: 스시다이 1·3일째). 더 나은 곳이 없으면 그대로 둔다. 먹고 싶다고 한 음식점은 그대로 둔다.
    // 도시를 옮기는 날의 '출발 전' 아침·점심이 떠나는 도시 가게면(h-1a가 남긴 칸, departureMeal) 떠나는 도시 가게 중에서 바꾼다.
    // 그 밖의 칸(이동 날이라도 앞에 그날 도시 관광·가게·이동 블록이 있는 칸)은 그날 도시 가게 중에서 고른다.
    {
      const seenFood = new Set();
      days.forEach((d, di) => {
        d.items.forEach((b) => {
          if (b.plain || !MEAL_PERIODS.has(b.period)) return;
          const f = foodOfName(b.name);
          if (!f) return;
          const k = foodKeyOf(f);
          if (!seenFood.has(k)) { seenFood.add(k); return; }
          if (wishes.some((w) => foodMatchesWish(f, w))) return;
          const list = departureMeal(di, b) ? foodsOfCity(dayPlan[di].transferFrom) : cityFoodsOf(di);
          const best = pickByTier(di, list.filter((x) => foodKeyOf(x) !== k), b);
          if (!best || best.tier >= foodTier(di, f, b)) return;
          Object.assign(b, foodBlock(b.period, b.start, b.end, best.food));
          seenFood.add(foodKeyOf(best.food));
          stats.repeatsReplaced += 1;
        });
      });
    }

    // (h-5) 먼 당일치기(나라·하코네·모토부·오타루 …) 날: 종일이 끝나고 1시간 반 안에 시작하는 도시 맛집 저녁은 그 지역 현지 식사로 바꾼다.
    days.forEach((d, di) => {
      const whole = d.items.find((b) => !b.plain && b.period === '종일' && !isFreeOrMove(b));
      if (!whole || !isDayTripName(whole.name, di)) return;
      const dinner = d.items.find((b) => !b.plain && b.period === '저녁');
      if (!dinner || !isFoodName(dinner.name) || dinner.start >= whole.end + 90) return;
      const start = Math.max(dinner.start, whole.end);
      Object.assign(dinner, newPostBlock('저녁', start, Math.min(start + Math.max(60, dinner.end - dinner.start), 22 * 60), T.localDinner(shortAreaName(whole.area || whole.name)), ''));
      stats.mealsMoved += 1;
    });

    // (h-6) 다른 언어로 적힌 '자유 일정' 제목은 화면 언어로. en/ja 일정은 후보·꼭 갈 곳·맛집과 같은 곳인데
    // 한국어 이름·지역으로 적힌 블록도 화면 언어 표기로 바꾼다(AI가 한국어 이름을 그대로 옮긴 경우)
    days.forEach((d) => d.items.forEach((b) => { if (!b.plain && FREE_TIME_TITLES.has(b.name) && b.name !== T.freeTime) b.name = T.freeTime; }));
    if (lang !== 'ko') {
      const HANGUL = /[가-힣]/;
      days.forEach((d) => d.items.forEach((b) => {
        if (b.plain) return;
        // 다른 언어로 적힌 '자유 일정' 제목은 화면 언어로
        if (FREE_TIME_TITLES.has(b.name) && b.name !== T.freeTime) b.name = T.freeTime;
        if (HANGUL.test(b.name)) {
          const hit = pickOf(b.name) || mustOf(b.name) || foodOfName(b.name);
          if (hit && hit.name && !HANGUL.test(hit.name)) {
            b.name = hit.name;
            if (hit.area && !HANGUL.test(String(hit.area))) b.area = hit.area;
          }
        }
        if (HANGUL.test(b.area)) b.area = localizeCuratedArea(b.area, lang, cityLabelForLang(dayCityLabel(0), lang));
      }));
    }

    // 도시 이동 날: 첫 블록을 이동 안내(규칙 일정과 같은 문구)로
    dayPlan.forEach((dp, di) => {
      if (!dp || !dp.transferFrom || !days[di]) return;
      const text = T.transfer(cityLabelForLang(dp.transferFrom, lang), cityLabelForLang(dp.city, lang), localizeTransferHint(transferHint(dp.transferFrom, dp.city), lang));
      days[di].items = [{ plain: true, text }, ...days[di].items.filter((b) => !(b.plain && /이동|transfer|移動|->|→/i.test(b.text)))];
    });

    // 관광이 하나도 남지 않은 날: 첫날 늦은 도착·마지막 날 이른 출발은 안내 문장, 그 밖에는 남은 후보나 자유 일정
    days.forEach((d, di) => {
      if (d.items.some((b) => !b.plain && SIGHT_PERIODS.has(b.period))) return;
      const lo = loOf(di);
      const hi = hiOf(di);
      if (di === 0 && day1MinStart !== null && day1MinStart >= 17 * 60) {
        if (!d.items.some((b) => !b.plain)) d.items.push({ plain: true, text: T.arrivalRest });
        return;
      }
      if (di === nDays - 1 && lastDayMaxEnd !== null && lastDayMaxEnd <= 12 * 60) {
        if (!d.items.some((b) => !b.plain)) {
          d.items.push(lastDayMaxEnd - 8 * 60 - 30 >= 30 ? newPostBlock('오전', 8 * 60 + 30, lastDayMaxEnd, T.checkoutAirport, '') : { plain: true, text: T.departurePrep });
        }
        return;
      }
      const next = takeUnused(di);
      const s = findFreeSlot(d, 120, lo, hi);
      if (next && s !== null) {
        d.items.push(newPostBlock(s < 12 * 60 ? '오전' : '오후', s, s + 120, next.name, next.area || ''));
        return;
      }
      const fs180 = findFreeSlot(d, 180, Math.max(lo, 13 * 60), hi);
      const fs = fs180 ?? findFreeSlot(d, 120, lo, hi);
      if (fs !== null) {
        const cityName = cityLabelForLang(dayCityLabel(di), lang) || cityLabelForLang(opts.cityLabel, lang);
        d.items.push(newPostBlock(fs < 12 * 60 ? '오전' : '오후', fs, fs + (fs180 !== null ? 180 : 120), T.freeTime, T.walkAround(cityName)));
      } else if (d.items.length === 0) {
        d.items.push({ plain: true, text: T.freeTime });
      }
    });

    // (i-0) 장소가 아닌 이름의 관광 블록("저녁엔", "紅葉の名所", "무료 명소")은 아직 쓰지 않은 후보로 바꾸거나 지운다
    days.forEach((d, di) => {
      for (const b of [...d.items]) {
        if (!isSightBlock(b) || pickOf(b.name) || mustOf(b.name)) continue;
        const bare = String(b.name || '').replace(MUST_GO_PARTICLE_RE, '').trim();
        if (!(MUST_GO_STOP_WORDS.has(b.name) || MUST_GO_STOP_WORDS.has(bare) || isNonPlaceWord(b.name))) continue;
        stats.trimmed += 1;
        const next = b.period === '종일' ? null : takeUnused(di, null, b);
        if (next) Object.assign(b, newPostBlock(b.period, b.start, b.end, next.name, next.area || ''));
        else d.items = d.items.filter((x) => x !== b);
      }
    });

    // (i) 확인되지 않은 관광 블록 수: picks·foods·mustVisit·내장 장소 이름표 어디에도 없는 이름
    days.forEach((d) => d.items.forEach((b) => {
      if (!isSightBlock(b)) return;
      if (pickOf(b.name) || mustOf(b.name) || isFoodName(b.name)) return;
      if (placeLabelMatches(b.name, []).length > 0) return;
      stats.unverified += 1;
    }));
  }

  days.forEach(sortItems);
  const out = days.map(({ items, ...d }) => ({ ...d, blocks: items.map(formatPostBlock).filter(Boolean) }));
  return { itinerary: out, stats, missingMustVisit };
}

function itineraryMaxOutputTokens(days) {
  return Number(days) > 5 ? 8192 : 4096;
}

// 응답에 넣는 AI 오류 목록: 벤더 원문(message)은 빼고 분류 결과만 남긴다(원문은 서버 로그에만).
function publicAiErrors(errors = []) {
  return (Array.isArray(errors) ? errors : []).filter(Boolean).map((e) => ({
    provider: e.provider,
    code: e.code,
    reasonCode: e.reasonCode,
    action: e.action,
    // 모델 쿨다운(서킷 브레이커)이 남아 있으면 다시 시도할 수 있을 때까지의 초
    ...(Number(e.retryAfterSec) > 0 ? { retryAfterSec: Number(e.retryAfterSec) } : {})
  }));
}

function summarizeAiErrors(errors = []) {
  const list = Array.isArray(errors) ? errors.filter(Boolean) : [];
  if (list.length === 0) return '';
  const chunks = list.map((e) => `${e.provider}(${e.code}): ${e.action}`);
  return chunks.join(' | ');
}

async function probeGemini() {
  if (!GEMINI_API_KEY) {
    return { configured: false, ok: false, reason: 'missing_key' };
  }
  try {
    const data = await callGeminiGenerateContent('Return {"ok":true} as JSON only.', {
      temperature: 0,
      topP: 0.1,
      maxOutputTokens: 20,
      thinkingBudget: 0,
      responseMimeType: 'application/json'
    });
    // model = 실제로 답한 모델(주 모델이 쉬는 중이면 대체 모델)
    return { configured: true, ok: true, model: data?._usedModel || GEMINI_API_MODEL };
  } catch (err) {
    const classified = classifyAiError('Gemini', err);
    return { configured: true, ok: false, model: GEMINI_API_MODEL, error: classified };
  }
}

async function probeOpenAI() {
  if (!OPENAI_API_KEY) {
    return { configured: false, ok: false, reason: 'missing_key' };
  }
  try {
    // Groq 모델 이름의 / 는 경로 구분자로 둔다(openai/gpt-oss-120b → /models/openai/gpt-oss-120b)
    const url = `${OPENAI_BASE_URL}/models/${OPENAI_MODEL.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
    }, AI_REQUEST_TIMEOUT_MS);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${OPENAI_PROVIDER_LABEL} error ${res.status}: ${text}`);
    }
    return { configured: true, ok: true, model: OPENAI_MODEL };
  } catch (err) {
    const classified = classifyAiError(OPENAI_PROVIDER_LABEL, err);
    return { configured: true, ok: false, model: OPENAI_MODEL, error: classified };
  }
}

// google 모드에서만: Places Text Search 1회(FieldMask=places.id, 결과 1건)로 키·결제·권한을 확인한다.
async function probePlaces() {
  if (!GOOGLE_PLACES_ENABLED) return { configured: false, ok: false, reason: 'provider_free' };
  if (!GOOGLE_MAPS_SERVER_KEY) return { configured: false, ok: false, reasonCode: 'GOOGLE_KEY_MISSING' };
  try {
    // 차단(서킷) 중이어도 1회는 실제로 확인한다. 성공하면 차단이 풀린다.
    const places = await googlePlacesSearchText(
      { textQuery: 'Tokyo Station', maxResultCount: 1, regionCode: 'JP' },
      'places.id',
      'places:probe',
      { bypassCircuit: true }
    );
    return { configured: true, ok: true, results: places.length };
  } catch (err) {
    return { configured: true, ok: false, reasonCode: err?.reasonCode || 'GOOGLE_ERROR' };
  }
}

function placeImagesSummary() {
  let withPhoto = 0;
  let withCoords = 0;
  let withLabels = 0;
  for (const v of PLACE_IMAGES.byKey.values()) {
    if (v.image) withPhoto += 1;
    if (v.lat !== null) withCoords += 1;
    if (v.labels?.en || v.labels?.ja) withLabels += 1;
  }
  return {
    places: PLACE_IMAGES.byKey.size,
    withPhoto,
    withCoords,
    withLabels,
    cityPhotos: PLACE_IMAGES.cities.size,
    foodGenrePhotos: PLACE_IMAGES.foodGenres.size
  };
}

// probe=false: 공개용(비밀값 없음). probe=true: 토큰 확인 후에만 호출되며 실제 외부 호출을 한다.
async function buildAiDiagnostics({ probe = false } = {}) {
  const guard = googleGuardState();
  const info = {
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
    modes: {
      places: PLACES_PROVIDER,
      map: MAP_PROVIDER
    },
    google: {
      placesEnabled: GOOGLE_PLACES_ENABLED,
      serverKeyConfigured: Boolean(GOOGLE_MAPS_SERVER_KEY),
      serverKeyFromLegacyVar: GOOGLE_MAPS_SERVER_KEY_FROM_LEGACY,
      browserKeyConfigured: Boolean(GOOGLE_MAPS_BROWSER_KEY),
      dailyCallLimit: guard.dailyCallLimit,
      callsToday: guard.callsToday,
      monthlyCallLimit: guard.monthlyCallLimit,
      callsThisMonth: guard.callsThisMonth,
      photoDailyLimit: guard.photoDailyLimit,
      photoCallsToday: guard.photoCallsToday,
      photoMonthlyLimit: guard.photoMonthlyLimit,
      photoCallsThisMonth: guard.photoCallsThisMonth,
      photoCacheEntries: _placePhotoCache.size,
      countersResetOnRestart: true,
      circuitOpen: guard.circuitOpen,
      circuitReason: guard.circuitReason,
      circuitOpenUntil: guard.circuitOpenUntil,
      lastErrorCode: guard.lastErrorCode,
      lastErrorAt: guard.lastErrorAt
    },
    placeImages: placeImagesSummary(),
    providers: {
      gemini: {
        configured: Boolean(GEMINI_API_KEY),
        model: GEMINI_API_MODEL,
        keyFormatOk: looksLikeGeminiKey(GEMINI_API_KEY),
        // 시도 순서(주 모델 포함)·그 출처('default' | 'env')·체인 전체 시간 예산·지금 쉬는 모델(이름과 남은 초)
        modelChain: GEMINI_MODEL_CHAIN,
        fallbackSource: GEMINI_FALLBACK_SOURCE,
        totalBudgetMs: GEMINI_TOTAL_BUDGET_MS,
        coolingModels: geminiCoolingModels()
      },
      openai: {
        configured: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
        keyFormatOk: looksLikeOpenAiKey(OPENAI_API_KEY),
        // OpenAI 호환 공급자: 주소의 호스트(api.openai.com | api.groq.com …)와 이름, 시도 순서, 요청 설정, 채팅 해석 순서
        baseHost: OPENAI_BASE_HOST,
        providerLabel: OPENAI_PROVIDER_LABEL,
        keySource: OPENAI_KEY_SOURCE,
        modelChain: OPENAI_MODEL_CHAIN,
        reasoningEffort: OPENAI_REASONING_EFFORT || null,
        maxOutputTokens: OPENAI_MAX_OUTPUT_TOKENS || null,
        totalBudgetMs: OPENAI_TOTAL_BUDGET_MS,
        chatProviderOrder: AI_CHAT_PROVIDER_ORDER
      }
    }
  };
  if (!probe) return info;
  info.providers.gemini.keyMasked = maskSecret(GEMINI_API_KEY);
  info.providers.openai.keyMasked = maskSecret(OPENAI_API_KEY);
  const [gemini, openai, places] = await Promise.all([probeGemini(), probeOpenAI(), probePlaces()]);
  info.probe = { gemini, openai, places, checkedAt: new Date().toISOString() };
  return info;
}

// 진단 토큰 비교(길이와 상관없이 일정 시간)
function diagnosticsTokenMatches(given) {
  if (!DIAGNOSTICS_TOKEN || typeof given !== 'string' || !given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(DIAGNOSTICS_TOKEN).digest();
  return timingSafeEqual(a, b);
}

function normalizeSelectedDestination(pick, cityLabel) {
  if (!pick) return null;
  const name = String(pick.name || pick.label || '').trim();
  if (!name) return null;
  // en/ja 화면에서 고른 카드는 원래 한글 이름(nameKo)을 함께 보낸다 — 사진·좌표를 찾는 데 쓴다.
  const nameKo = typeof pick.nameKo === 'string' && /[가-힣]/.test(pick.nameKo) ? pick.nameKo.trim().slice(0, 80) : '';
  return {
    name,
    ...(nameKo && nameKo !== name ? { nameKo } : {}),
    city: pick.city || cityLabel,
    area: pick.area || pick.city || cityLabel,
    category: pick.category || '추천 여행지',
    bestTime: pick.bestTime || '09:00-17:00',
    stayMin: Math.max(30, Number(pick.stayMin) || 90),
    aiScore: 99
  };
}

// 화면이 보낸 카드의 기본값(빠진 값을 채운 값): 이런 값이면 서버 데이터의 실제 값을 쓴다
const GENERIC_BEST_TIMES = new Set(['09:00-17:00', '10:00-17:00']);

function mergeSelectedDestinations(userPicks, basePicks, cityLabel, lang = 'ko') {
  const normalized = (Array.isArray(userPicks) ? userPicks : [])
    .map((pick) => normalizeSelectedDestination(pick, cityLabel))
    .filter(Boolean);
  if (!normalized.length) return basePicks;
  // 사용자가 고른 카드가 추천 목록에도 있으면 사진·좌표 등은 서버 데이터에서 이어 붙인다.
  // 카드의 추천 시간·지역이 기본값(요청 명소 '10:00-17:00'·도시 이름)이면 서버 데이터(도톤보리 = 난바 18:00-21:00)를 쓴다.
  const baseByName = new Map();
  (basePicks || []).forEach((p) => [p?.name, p?.nameKo].filter(Boolean).forEach((n) => { if (!baseByName.has(String(n))) baseByName.set(String(n), p); }));
  const mediaFields = ['photoUrl', 'photoCredit', 'lat', 'lng', 'mapUrl', 'wikidata', 'nameKo'];
  const seen = new Set();
  const merged = [];
  normalized.forEach((pick) => {
    if (!seen.has(pick.name)) {
      seen.add(pick.name);
      const ck = cityKeyByLabel(pick.city) || cityKeyByLabel(cityLabel);
      const ko = pick.nameKo || koPlaceNameForLabel(pick.name, ck) || pick.name;
      const base = baseByName.get(pick.name) || baseByName.get(ko);
      let out = { ...pick };
      const cityOnlyArea = !out.area || out.area === out.city || Boolean(cityKeyForExactLabel(out.area)) || out.area === localizedCityName(ck, lang);
      let known = null;
      if (base) {
        mediaFields.forEach((f) => { if (base[f] !== undefined && base[f] !== null) out[f] = base[f]; });
        if (GENERIC_BEST_TIMES.has(out.bestTime) && base.bestTime && Number(out.stayMin) < 360) out.bestTime = base.bestTime;
        if (cityOnlyArea && base.area) out.area = base.area;
      } else {
        out = attachPlaceMedia(out, ck, ko);
        // 도시 명소·추가 명소(가이유칸 등)는 실제 지역·추천 시간·좌표를 쓴다
        const hl = (CITY_DATA[ck]?.highlights || []).find((h) => h.name === ko);
        const extra = extraPlaceByName(ko, ck);
        known = hl || extra;
        if (known) {
          if (ko !== out.name && !out.nameKo) out.nameKo = ko;
          if (GENERIC_BEST_TIMES.has(out.bestTime) && known.bestTime && Number(out.stayMin) < 360) out.bestTime = known.bestTime;
          if (cityOnlyArea && known.area) out.area = known.area;
          if (!hasLatLng(out) && extra && Number.isFinite(extra.lat)) { out.lat = extra.lat; out.lng = extra.lng; }
          if (extra?.indoor) out.indoor = true;
        }
      }
      // en/ja 일정인데 카드 이름이 한글이면(예전 화면·저장 상태가 보낸 카드, 도시별 대표 카드) 화면 언어 이름으로 바꾼다.
      // 원래 한글 이름은 nameKo로 꼭 남긴다: 일정 후처리가 AI가 쓴 한국어 이름도 이 후보로 알아본다(지어낸 장소 판정이 느슨해지지 않게).
      if (lang !== 'ko' && /[가-힣]/.test(String(out.name || ''))) {
        const koName = String(out.nameKo || out.name);
        const localizedName = (base && base.name && !/[가-힣]/.test(String(base.name))) ? base.name
          : localizeCuratedPlace({ ...out, name: koName, nameKo: koName }, ck, lang).name;
        if (localizedName && !/[가-힣]/.test(String(localizedName))) {
          out.nameKo = koName;
          out.name = localizedName;
        }
      }
      // en↔ja로 화면 언어를 바꿔 다시 만든 경우: 카드 이름이 이전 언어이면(ja 일정에 'Osaka Castle', en 일정에 '大阪城') 원래 한글 이름으로 다시 현지화한다.
      // 같은 곳의 서버 카드(원래 한글 이름이 같은 base)가 있으면 그 이름·지역·분류를 쓰고, 없으면(다른 도시의 대표 카드) 내장 표기로 바꾼다.
      const jaScript = /[぀-ヿ一-鿿]/.test(String(out.name || ''));
      const otherLangName = !/[가-힣]/.test(String(out.name || '')) && ((lang === 'en' && jaScript) || (lang === 'ja' && !jaScript && /[A-Za-z]/.test(String(out.name || ''))));
      const switchKo = otherLangName ? [out.nameKo, ko].find((n) => n && /[가-힣]/.test(String(n))) : '';
      if (switchKo) {
        const koName = String(switchKo);
        const same = base && placeOriginalName(base) === koName ? base : null;
        const areaKo = koAreaFromLocalized(out.area) || [known?.area].find((v) => v && /[가-힣]/.test(String(v)))
          || (ck && ['en', 'ja'].some((l) => localizedCityName(ck, l) === out.area) ? CITY_DATA[ck]?.label : '');
        const categoryKo = koCategoryFromLocalized(out.category) || [known?.category].find((v) => v && /[가-힣]/.test(String(v))) || '';
        const src = same || localizeCuratedPlace({ ...out, name: koName, nameKo: koName, area: areaKo || out.area, category: categoryKo || out.category }, ck, lang);
        if (src?.name && src.name !== out.name && !/[가-힣]/.test(String(src.name))) {
          out.nameKo = koName;
          out.name = String(src.name);
          if (src.area && !/[가-힣]/.test(String(src.area))) out.area = src.area;
          if (src.category && !/[가-힣]/.test(String(src.category))) out.category = src.category;
        }
      }
      if (lang !== 'ko' && /[가-힣]/.test(String(out.area || ''))) out.area = localizeCuratedArea(out.area, lang, ck ? localizedCityName(ck, lang) : '');
      // ko 일정인데 카드 이름이 en/ja이면(en/ja로 채팅한 뒤 화면 언어를 ko로 바꿔 다시 만든 경우) 원래 한글 이름·지역·분류로 되돌린다.
      // 한글 이름은 서버 카드(base) → 화면이 보낸 nameKo → 화면 이름으로 찾은 한글 이름 순서로 쓴다.
      if (lang === 'ko' && !/[가-힣]/.test(String(out.name || ''))) {
        const koName = [base?.name, out.nameKo, ko].find((n) => n && /[가-힣]/.test(String(n)));
        if (koName) {
          const src = base || known;
          out.name = String(koName);
          delete out.nameKo;
          if (!/[가-힣]/.test(String(out.area || ''))) {
            out.area = [src?.area, koAreaFromLocalized(out.area), out.city].find((v) => v && /[가-힣]/.test(String(v))) || out.area;
          }
          if (!/[가-힣]/.test(String(out.category || '')) && /[가-힣]/.test(String(src?.category || ''))) out.category = src.category;
        }
      }
      // 이 카드의 두 이름(화면 이름·원래 한글 이름)을 모두 기억해 아래 서버 카드에서 같은 곳을 다시 넣지 않는다
      [out.name, out.nameKo].filter(Boolean).forEach((n) => seen.add(String(n)));
      merged.push(out);
    }
  });
  for (const pick of basePicks) {
    if (seen.has(pick.name)) continue;
    seen.add(pick.name);
    merged.push(pick);
  }
  const limit = basePicks.length || merged.length;
  return merged.slice(0, limit || merged.length);
}

function extractOpenAiText(data) {
  if (!data) return '';
  if (typeof data.output_text === 'string') return data.output_text;
  const outputs = Array.isArray(data.output) ? data.output : [];
  const texts = [];
  outputs.forEach((item) => {
    if (item.type === 'output_text' && item.text) texts.push(item.text);
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((c) => {
      if (c.type === 'output_text' && c.text) texts.push(c.text);
      if (c.type === 'text' && c.text) texts.push(c.text);
    });
  });
  return texts.join('\n').trim();
}

// OpenAI 호환 Responses API 호출 한 번(OPENAI_BASE_URL/responses). 본문 읽기까지 같은 제한 시간 안에서 끝낸다.
async function openAiPostOnce(body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (err) {
    if (controller.signal.aborted || err?.name === 'AbortError') {
      const e = new Error(`${OPENAI_PROVIDER_LABEL} timeout after ${timeoutMs}ms (${body.model})`);
      e.aiTimeout = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 한 번 생성(채팅 해석·일정 하나)에 OpenAI 호환 모델 체인 전체가 쓸 수 있는 시간
const OPENAI_TOTAL_BUDGET_MS = 40_000;

// OpenAI 호환 Responses API: 주 모델(OPENAI_MODEL) → OPENAI_FALLBACK_MODELS 순서로 시도해 { parsed, model }을 돌려준다.
// 요청마다 OPENAI_REASONING_EFFORT(reasoning.effort)와 OPENAI_MAX_OUTPUT_TOKENS(max_output_tokens 상한)를 넣는다.
// 다음 모델로 넘기는 실패: 429(한도)·413(요청이 큼)·404(모델 없음)·400(그 모델이 요청 설정을 거절)·5xx·시간 초과·잘림·JSON 아님.
// 키·권한 문제(401·403)와 네트워크 오류(DNS·연결 거부)는 모델을 바꿔도 같으므로 바로 알린다.
// opts.retrySingle: 대체 모델이 없으면 같은 모델로 한 번 더 시도한다(예전 일정 동작). 잘린 응답은 같은 모델로 다시 보내지 않는다.
// opts.accept(parsed, model): 내용 검사(예: 일정 날짜 수). AiOutputError를 던지면 형식 오류처럼 다음 모델로 넘긴다. 돌려준 값이 parsed가 된다.
async function callOpenAiResponses(body, opts = {}) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
  const label = OPENAI_PROVIDER_LABEL;
  const perCallTimeoutMs = Math.max(AI_REQUEST_TIMEOUT_MS, Number(opts.timeoutMs) || 0);
  const deadline = Date.now() + OPENAI_TOTAL_BUDGET_MS;
  const attempts = OPENAI_MODEL_CHAIN.length === 1 && opts.retrySingle ? [OPENAI_MODEL, OPENAI_MODEL] : [...OPENAI_MODEL_CHAIN];
  let lastError = null;
  let busyError = null;
  let truncatedError = null;
  let timeoutError = null;
  const failed = [];
  for (let i = 0; i < attempts.length; i += 1) {
    const model = attempts[i];
    if (i > 0 && truncatedError && model === attempts[i - 1]) break;
    const remaining = deadline - Date.now();
    if (remaining < GEMINI_MIN_ATTEMPT_MS) {
      console.log(`[openai] Time budget ${OPENAI_TOTAL_BUDGET_MS}ms used up; not tried: ${attempts.slice(i).join(', ')}`);
      break;
    }
    const reqBody = { ...body, model };
    if (OPENAI_REASONING_EFFORT) reqBody.reasoning = { effort: OPENAI_REASONING_EFFORT };
    if (OPENAI_MAX_OUTPUT_TOKENS > 0) reqBody.max_output_tokens = Math.min(Number(body.max_output_tokens) || OPENAI_MAX_OUTPUT_TOKENS, OPENAI_MAX_OUTPUT_TOKENS);
    const next = i < attempts.length - 1 ? ', trying next...' : '';
    let r;
    try {
      r = await openAiPostOnce(reqBody, Math.min(perCallTimeoutMs, remaining));
    } catch (err) {
      if (!err?.aiTimeout) throw err;
      lastError = err;
      timeoutError = timeoutError || err;
      failed.push(`${model}(timeout)`);
      console.log(`[openai] ${label} model ${model} timed out${next}`);
      continue;
    }
    if (r.ok) {
      let data = null;
      try { data = JSON.parse(r.text); } catch { data = null; }
      if (data?.status === 'incomplete') {
        const why = String(data?.incomplete_details?.reason || '');
        const e = new AiOutputError(why === 'max_output_tokens' ? 'AI_TRUNCATED' : 'AI_INVALID_OUTPUT', `${label} response incomplete (${why || 'unknown'}, ${model})`);
        if (e.reasonCode === 'AI_TRUNCATED') truncatedError = truncatedError || e; else lastError = e;
        failed.push(`${model}(incomplete ${why || 'unknown'})`);
        console.log(`[openai] ${label} model ${model} returned an incomplete response (${why || 'unknown'})${next}`);
        continue;
      }
      const parsed = data ? parseJsonFromText(extractOpenAiText(data)) : null;
      if (parsed && typeof parsed === 'object') {
        try {
          const accepted = opts.accept ? opts.accept(parsed, model) : parsed;
          if (failed.length) console.log(`[openai] Succeeded with ${model} after: ${failed.join(', ')}`);
          return { parsed: accepted, model };
        } catch (err) {
          if (!(err instanceof AiOutputError)) throw err;
          lastError = err;
          failed.push(`${model}(${err.reasonCode})`);
          console.log(`[openai] ${label} model ${model} output rejected (${String(err.message).slice(0, 120)})${next}`);
          continue;
        }
      }
      lastError = new AiOutputError('AI_INVALID_OUTPUT', `${label} returned unexpected format (${model})`);
      failed.push(`${model}(format)`);
      console.log(`[openai] ${label} model ${model} returned no JSON${next}`);
      continue;
    }
    lastError = new Error(`${label} error ${r.status} (${model}): ${r.text.slice(0, 200)}`);
    if (r.status === 401 || r.status === 403) throw lastError;
    if (r.status === 429 || r.status === 503) busyError = busyError || lastError;
    failed.push(`${model}(${r.status})`);
    // 원인을 알 수 있게 벤더 오류 코드·문장 앞부분을 서버 로그에만 남긴다(키는 들어 있지 않고, 클라이언트 응답에는 넣지 않음)
    let why = '';
    try {
      const e = JSON.parse(r.text)?.error || {};
      why = [e.code, String(e.message || '').replace(/\s+/g, ' ').slice(0, 140)].filter(Boolean).join(': ');
    } catch { why = ''; }
    console.log(`[openai] ${label} model ${model} failed (${r.status}${why ? ' ' + why : ''})${next}`);
  }
  throw busyError || truncatedError || timeoutError || lastError || new Error(`${label}: all models exhausted`);
}

function extractGeminiText(data) {
  if (!data) return '';
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const texts = [];
  candidates.forEach((cand) => {
    const parts = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
    parts.forEach((p) => {
      if (typeof p?.text === 'string' && p.text.trim()) texts.push(p.text);
    });
  });
  return texts.join('\n').trim();
}

async function callGeminiGenerateContent(prompt, opts = {}) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  const baseGenerationConfig = {
    temperature: Number(opts.temperature ?? 0.2),
    topP: Number(opts.topP ?? 0.9),
    maxOutputTokens: Number(opts.maxOutputTokens ?? 900),
    responseMimeType: opts.responseMimeType || 'application/json'
  };
  if (opts.responseSchema) baseGenerationConfig.responseSchema = opts.responseSchema;
  // 생각(thinking) 토큰도 maxOutputTokens를 나눠 쓰므로 끈다. 모델마다 받는 형식이 달라 geminiThinkingStyle()이 고른다.
  const wantsThinkingConfig = opts.thinkingBudget !== undefined;
  const thinkingBudget = Math.max(0, Number(opts.thinkingBudget) || 0);
  const bodyForModel = (model, style) => {
    const generationConfig = { ...baseGenerationConfig };
    const thinkingConfig = wantsThinkingConfig ? geminiThinkingConfig(style, model, thinkingBudget) : null;
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;
    return {
      contents: [
        {
          role: 'user',
          parts: [{ text: String(prompt || '') }]
        }
      ],
      generationConfig
    };
  };
  // 호출 하나의 제한 시간(채팅 15초·일정 30초)과 체인 전체의 시간 예산(GEMINI_TOTAL_BUDGET_MS)
  const perCallTimeoutMs = Math.max(AI_REQUEST_TIMEOUT_MS, Number(opts.timeoutMs) || 0);
  // opts.totalBudgetMs: 화면이 더 일찍 끊는 요청(교통비 30초)용으로 예산을 더 줄일 때만(GEMINI_TOTAL_BUDGET_MS보다 늘리지는 않음)
  const budgetMs = Number(opts.totalBudgetMs) > 0
    ? Math.max(4000, Math.min(GEMINI_TOTAL_BUDGET_MS, Number(opts.totalBudgetMs)))
    : GEMINI_TOTAL_BUDGET_MS;
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;

  // 주 모델 → 대체 모델 순서. 쉬는 모델(서킷 브레이커)은 건너뛴다.
  const allModels = [...new Set([opts.model || GEMINI_API_MODEL, ...GEMINI_FALLBACK_MODELS])];
  const modelsToTry = getAvailableModels(allModels);
  if (modelsToTry.length < allModels.length) {
    const skipped = allModels.filter(m => !modelsToTry.includes(m));
    console.log(`[circuit-breaker] Skipping cooled-down models: ${skipped.join(', ')}`);
  }
  let lastError = null;
  let busyError = null;
  let dailyModels = 0;
  let minuteBusy = false; // 잠깐 뒤면 될 수도 있는 실패(분당 429·503·5xx·시간 초과)가 하나라도 있었는지
  let timedOut = false;
  let notTried = [];
  let truncatedByThinking = null;
  const failed = [];

  models:
  for (let i = 0; i < modelsToTry.length; i += 1) {
    const model = modelsToTry[i];
    let style = geminiThinkingStyle(model);
    // pass 0 = 기본 설정, pass 1 = 400을 받은 뒤 다른 생각 형식으로 한 번 더
    for (let pass = 0; pass < 2; pass += 1) {
      const remaining = deadline - Date.now();
      if (remaining < GEMINI_MIN_ATTEMPT_MS) {
        notTried = modelsToTry.slice(pass === 0 ? i : i + 1);
        break models;
      }
      const timeoutMs = Math.min(perCallTimeoutMs, remaining);
      let r;
      try {
        r = await geminiPostOnce(model, bodyForModel(model, style), timeoutMs);
      } catch (err) {
        if (err?.geminiTimeout) {
          // 느린 모델(느린 503 포함): 제 시간을 다 받고도 못 답했으면 쉬게 한다
          // (남은 예산 때문에 짧게 끊은 호출은 모델 탓이 아니라 쉬게 하지 않음). 남은 시간이 있으면 다음 모델.
          lastError = err.message;
          timedOut = true;
          minuteBusy = true;
          failed.push(`${model}(timeout)`);
          if (timeoutMs >= perCallTimeoutMs) recordModelFailure(model, 'timeout');
          console.log(`[gemini] Model ${model} timed out after ${timeoutMs}ms, trying next...`);
          continue models;
        }
        // DNS·연결 거부 같은 네트워크 오류는 모델을 바꿔도 같으므로 바로 알린다
        throw err;
      }

      if (r.ok) {
        let json;
        try {
          json = JSON.parse(r.text);
        } catch {
          throw new AiOutputError('AI_INVALID_OUTPUT', `Gemini returned a non-JSON body (${model})`);
        }
        // 실제로 답한 모델을 붙인다
        if (json && typeof json === 'object') json._usedModel = model;
        if (pass === 1) {
          _geminiThinkingLearned.set(model, style);
          console.log(`[gemini] ${model} accepts thinking style '${style}' (remembered until restart)`);
        }
        // 생각 토큰이 출력 한도를 다 써서 잘린 응답(설정 탓)은 다음 모델에 맡긴다. 끝까지 안 되면 이 응답을 돌려준다(→ AI_TRUNCATED).
        const finish = String(json?.candidates?.[0]?.finishReason || '').toUpperCase();
        if (finish === 'MAX_TOKENS' && Number(json?.usageMetadata?.thoughtsTokenCount) > 0 && i < modelsToTry.length - 1) {
          truncatedByThinking = truncatedByThinking || json;
          failed.push(`${model}(thinking used the output limit)`);
          console.log(`[gemini] Model ${model} spent the output limit on thinking (MAX_TOKENS), trying next...`);
          continue models;
        }
        if (failed.length) console.log(`[gemini] Succeeded with fallback ${model} after: ${failed.join(', ')}`);
        return json;
      }

      const text = r.text;
      lastError = `Gemini error ${r.status} (${model}): ${text.slice(0, 200)}`;
      // 한도(429)·과부하(503) 오류는 따로 기억한다. 마지막 모델이 404여도 원인은 '바쁨'으로 알린다.
      // 429 중 '하루 무료 한도'(quotaId …PerDay…)는 잠시 뒤가 아니라 한도가 풀릴 때(태평양 시간 자정)까지 안 되므로 따로 센다.
      const daily = r.status === 429 && /PerDay|per\s*day|daily/i.test(text);
      if (r.status === 429 || r.status === 503) {
        busyError = lastError;
        if (daily) dailyModels += 1; else minuteBusy = true;
        failed.push(`${model}(${r.status}${daily ? ' daily' : ''})`);
        recordModelFailure(model, r.status, daily ? geminiDailyResetMs() : 0);
        console.log(`[gemini] Model ${model} unavailable (${r.status}${daily ? ', daily quota' : ''}), trying next...`);
        continue models;
      }
      if (r.status === 404) {
        // 종료된 모델('no longer available')·없는 이름: 하루 쉰다
        failed.push(`${model}(404)`);
        recordModelFailure(model, 404, MODEL_GONE_COOLDOWN_MS);
        console.log(`[gemini] Model ${model} not available (404), skipping it for a day, trying next...`);
        continue models;
      }
      if (r.status === 500 || r.status === 502 || r.status === 504) {
        minuteBusy = true;
        failed.push(`${model}(${r.status})`);
        recordModelFailure(model, r.status);
        console.log(`[gemini] Model ${model} server error (${r.status}), trying next...`);
        continue models;
      }
      if (r.status === 400 && !GEMINI_ACCOUNT_ERROR_RE.test(text)) {
        // 이 모델이 요청 설정을 거절(예: thinkingBudget을 받지 않는 모델): 다른 생각 형식으로 한 번 더, 그래도 안 되면 다음 모델
        const alt = style === 'budget' ? 'level' : (style === 'level' ? 'budget' : null);
        if (pass === 0 && wantsThinkingConfig && alt) {
          console.log(`[gemini] Model ${model} rejected the request (400) with thinking style '${style}', retrying with '${alt}'...`);
          style = alt;
          continue;
        }
        failed.push(`${model}(400)`);
        console.log(`[gemini] Model ${model} rejected the request (400), trying next...`);
        continue models;
      }
      // 키·권한·지역 문제(400 API_KEY_INVALID, 401, 403 …)는 모델을 바꿔도 같으므로 바로 알린다
      throw new Error(lastError);
    }
  }

  if (notTried.length) {
    console.log(`[gemini] Time budget ${budgetMs}ms used up after ${Date.now() - startedAt}ms; not tried: ${notTried.join(', ')}`);
  }
  if (truncatedByThinking) return truncatedByThinking;
  const exhausted = new Error(busyError || lastError || 'All Gemini models exhausted');
  // 시도한 모델이 모두 '하루 무료 한도'로 막혔으면(잠깐 붐빈 모델이 없으면) 오늘 한도 소진으로 알린다.
  if (dailyModels > 0 && !minuteBusy) exhausted.quotaDaily = true;
  // 한도·과부하 응답 없이 시간만 다 썼으면 '바쁨'(AI_BUSY, code timeout)으로 알린다.
  if (timedOut && !busyError) exhausted.geminiTimeout = true;
  if (notTried.length) exhausted.budgetExceeded = true;
  // 서킷 브레이커가 모델을 막고 있으면 가장 빨리 풀리는 모델까지 남은 초를 붙인다.
  const retryAfterSec = modelCooldownRemainingSec(allModels);
  if (retryAfterSec > 0) exhausted.retryAfterSec = retryAfterSec;
  throw exhausted;
}

// 400 중 모델을 바꿔도 같은 것(키·권한·지역·결제). 이런 400은 다음 모델로 넘기지 않는다.
const GEMINI_ACCOUNT_ERROR_RE = /API_KEY_INVALID|API key not valid|API key expired|API_KEY_SERVICE_BLOCKED|PERMISSION_DENIED|unregistered callers|location is not supported|FAILED_PRECONDITION|SERVICE_DISABLED|billing/i;

// Gemini 호출 한 번. 키는 URL이 아닌 헤더로 보낸다(오류 메시지·로그에 URL이 남아도 키가 새지 않게).
// 본문 읽기까지 같은 제한 시간 안에서 끝낸다(헤더만 오고 본문이 멈춰도 기다리지 않게).
async function geminiPostOnce(model, body, timeoutMs) {
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (err) {
    if (controller.signal.aborted || err?.name === 'AbortError') {
      const e = new Error(`Gemini timeout after ${timeoutMs}ms (${model})`);
      e.geminiTimeout = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 모델 쿨다운 중 가장 빨리 풀리는 것까지 남은 초(막힌 모델이 없으면 0)
function modelCooldownRemainingSec(models) {
  let best = Infinity;
  for (const m of models || []) {
    const entry = _modelFailures.get(m);
    if (!entry) continue;
    const left = (entry.failedAt + entry.cooldownMs) - Date.now();
    if (left > 0 && left < best) best = left;
  }
  return Number.isFinite(best) ? Math.ceil(best / 1000) : 0;
}

async function createItineraryWithOpenAI(payload, picks) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
  const key = cityKeyByInput(payload.city);
  const city = CITY_DATA[key] || CITY_DATA.tokyo;
  const ctx = buildAiContext(payload, picks, city);

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      itinerary: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            day: { type: 'integer' },
            date: { type: 'string' },
            // 클라이언트 렌더러 형식의 문자열: "오전(09:00-11:00): 장소 (지역)"
            blocks: { type: 'array', items: { type: 'string' } }
          },
          required: ['day', 'date', 'blocks']
        }
      },
      tips: { type: 'array', items: { type: 'string' } }
    },
    required: ['summary', 'itinerary', 'tips']
  };

  const system = [AI_SYSTEM_MESSAGE, ...aiIntentInstructions(ctx, payload.lang),
    ...(ctx.constraints ? ['Constraints:', ...ctx.constraints.map((l) => '- ' + l)] : [])].join('\n');

  const body = {
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: system }]
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: JSON.stringify(ctx) }]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'itinerary',
        schema,
        strict: true
      }
    },
    max_output_tokens: itineraryMaxOutputTokens(ctx.days)
  };

  // 모델 체인·잘림(incomplete)·형식 검사는 callOpenAiResponses가 맡는다(호출 하나 30초, 대체 모델이 없으면 한 번 더)
  // 날짜 수가 모자라는 등 정규화가 거절한 일정도 다음 모델로 넘긴다.
  const { parsed: normalized, model } = await callOpenAiResponses(body, {
    timeoutMs: 30_000,
    retrySingle: true,
    accept: (json) => normalizeAiItinerary(json, payload, OPENAI_PROVIDER_LABEL, ctx.picks)
  });

  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));

  return {
    source: 'openai_itinerary_v1 (' + model + ')',
    provider: 'openai',
    city: city.label,
    theme: payload.theme || 'mixed',
    summary: normalized.summary || `${city.label} ${days}일 AI 일정`,
    itinerary: normalized.itinerary,
    tips: normalized.tips,
    _ctx: ctx
  };
}

// Gemini responseSchema (OpenAPI 부분집합). blocks는 클라이언트 렌더러 형식의 문자열 배열.
const GEMINI_ITINERARY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    itinerary: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          day: { type: 'INTEGER' },
          date: { type: 'STRING' },
          blocks: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['day', 'date', 'blocks']
      }
    },
    tips: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['summary', 'itinerary', 'tips']
};

async function createItineraryWithGemini(payload, picks) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  const key = cityKeyByInput(payload.city);
  const city = CITY_DATA[key] || CITY_DATA.tokyo;
  const ctx = buildAiContext(payload, picks, city);
  const days = ctx.days;
  const prompt = [
    AI_SYSTEM_MESSAGE,
    ...aiIntentInstructions(ctx, payload.lang),
    'Output JSON shape (no markdown, no extra keys):',
    '{"summary": string, "itinerary": [{"day": 1, "date": "YYYY-MM-DD", "blocks": ["오전(09:00-11:00): <place> (<area>)", "점심(12:00-13:00): <food> (<area>)", "오후(13:30-16:00): <place> (<area>)", "저녁(18:00-19:30): <food> (<area>)"]}, {"day": 2, "date": "YYYY-MM-DD", "blocks": ["종일(09:00-18:00): <allDay pick> (<area>)", "저녁(18:30-20:00): <food> (<area>)"]}], "tips": [string]}',
    `The "itinerary" array must contain exactly ${days} entries (day 1 to ${days}); day 1 is ${ctx.startDate} and dates are consecutive.`,
    `Write summary, tips and any descriptive words in ${ctx.language}; keep place names as given in "picks"/"foods"/"mustVisit". Give 1 to 4 short tips.`,
    ...(ctx.constraints ? ['Constraints:', ...ctx.constraints.map((l) => `- ${l}`)] : []),
    'Context:',
    JSON.stringify(ctx)
  ].join('\n');

  const data = await callGeminiGenerateContent(prompt, {
    temperature: 0.28,
    maxOutputTokens: itineraryMaxOutputTokens(days),
    thinkingBudget: 0,
    timeoutMs: 30_000,
    topP: 0.9,
    responseMimeType: 'application/json',
    responseSchema: GEMINI_ITINERARY_SCHEMA
  });
  const _itinModel = data._usedModel || GEMINI_API_MODEL;
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const finishReason = String(candidate?.finishReason || '').toUpperCase();
  if (finishReason === 'MAX_TOKENS') {
    throw new AiOutputError('AI_TRUNCATED', `Gemini output truncated (MAX_TOKENS, ${_itinModel})`);
  }
  if (!candidate || data?.promptFeedback?.blockReason || (finishReason && finishReason !== 'STOP')) {
    throw new AiOutputError('AI_INVALID_OUTPUT', `Gemini returned no usable candidate (${finishReason || data?.promptFeedback?.blockReason || 'none'})`);
  }
  const text = extractGeminiText(data);
  const json = parseJsonFromText(text);
  if (!json) {
    throw new AiOutputError('AI_INVALID_OUTPUT', 'Gemini returned unexpected format');
  }
  const normalized = normalizeAiItinerary(json, payload, 'Gemini', ctx.picks);

  return {
    source: 'gemini_itinerary_v1 (' + _itinModel + ')',
    provider: 'gemini',
    city: city.label,
    theme: payload.theme || 'mixed',
    summary: normalized.summary || `${city.label} ${days}일 AI 일정 (Gemini)`,
    itinerary: normalized.itinerary,
    tips: normalized.tips,
    _ctx: ctx
  };
}

// ── 일정의 각 날에 지도용 좌표를 붙인다: day.places = [{ name, period, lat, lng }] (좌표 모르면 null) ──
function itineraryPlaceName(blockText) {
  const m = ITINERARY_MAIN_BLOCK_RE.exec(String(blockText || ''));
  if (!m) return null;
  const placeText = m[4].trim();
  // 끝에 있는 괄호 묶음 하나만 지역으로 본다(이름 안의 괄호는 이름에 남긴다: "A (B) C (지역)" → "A (B) C").
  const withArea = /^(.+?)\s*\(([^()]*)\)\s*$/.exec(placeText);
  return { period: m[1], name: (withArea ? withArea[1] : placeText).trim() };
}

function attachItineraryCoordinates(itinerary, knownPlaces, cityKeys) {
  const coordByName = new Map();
  for (const p of knownPlaces || []) {
    if (!p || !hasLatLng(p)) continue;
    const point = { lat: Number(p.lat), lng: Number(p.lng) };
    [p.name, p.nameKo].forEach((n) => {
      const k = String(n || '').trim();
      if (k && !coordByName.has(k)) coordByName.set(k, point);
    });
  }
  const lookup = (name) => {
    if (coordByName.has(name)) return coordByName.get(name);
    for (const ck of cityKeys || []) {
      const media = placeMediaFor(ck, name);
      if (media && media.lat !== null) return { lat: media.lat, lng: media.lng };
    }
    const any = placeMediaFor(null, name);
    if (any && any.lat !== null) return { lat: any.lat, lng: any.lng };
    // en/ja 일정(특히 AI 일정)은 현지화된 이름(예: 'Otaru Canal', '小樽運河')을 쓴다 → 원래 이름으로 바꿔 찾는다.
    for (const e of placeLabelMatches(name, cityKeys)) {
      const media = placeMediaFor(e.ck, e.ko);
      if (media && media.lat !== null) return { lat: media.lat, lng: media.lng };
    }
    return null;
  };
  const placeCoords = {};
  const days = (Array.isArray(itinerary) ? itinerary : []).map((day) => {
    const places = [];
    for (const b of (Array.isArray(day?.blocks) ? day.blocks : [])) {
      const parsed = itineraryPlaceName(b);
      if (!parsed || !parsed.name) continue;
      if (FREE_TIME_TITLES.has(parsed.name)) continue; // "자유 일정" 칸은 장소가 아니다
      const pos = lookup(parsed.name);
      places.push({ name: parsed.name, period: parsed.period, lat: pos ? pos.lat : null, lng: pos ? pos.lng : null });
      if (pos) placeCoords[parsed.name] = pos;
    }
    return { ...day, places };
  });
  return { itinerary: days, placeCoords };
}

// google 모드 전용. 모든 쿼리가 실패하면 첫 오류(GoogleApiError)를 던진다(폴백 이유를 알 수 있게).
async function fetchRecommendedFoods(destinations, cityLabel, budget, stayInfo, lang) {
  if (!GOOGLE_PLACES_ENABLED) return [];

  // Compute centroid from destinations + stay location
  const points = [];
  for (const d of (destinations || [])) {
    if (d.lat && d.lng) points.push({ lat: Number(d.lat), lng: Number(d.lng) });
  }
  // Weight stay location higher (add twice)
  if (stayInfo && stayInfo.lat && stayInfo.lng) {
    points.push({ lat: Number(stayInfo.lat), lng: Number(stayInfo.lng) });
    points.push({ lat: Number(stayInfo.lat), lng: Number(stayInfo.lng) });
  }

  let center = null;
  if (points.length > 0) {
    center = {
      lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
      lng: points.reduce((s, p) => s + p.lng, 0) / points.length
    };
  } else {
    // 정적 도시 좌표 (Geocoding 호출 없음)
    center = await fetchGoogleCityCenter(cityLabel);
  }
  if (!center) return [];

  const foodQueryHints = {
    ko: ['인기 맛집', '현지인 추천 레스토랑'],
    en: ['popular restaurants', 'local favorite restaurants'],
    ja: ['人気 グルメ', '地元 おすすめ レストラン']
  };
  const queries = (foodQueryHints[lang] || foodQueryHints.ko).map((h) => `${cityLabel} ${h}`);
  const cacheKey = `recfoods|${cityLabel}|${lang || 'ko'}|${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
  let allPlaces = placesCacheGet(cacheKey);
  if (!allPlaces) {
    const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType,places.priceLevel,places.location,places.photos,places.currentOpeningHours';
    const settled = await Promise.allSettled(queries.map((q) => googlePlacesSearchText({
      textQuery: q,
      maxResultCount: 20,
      languageCode: lang || 'ko',
      regionCode: 'JP',
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: 8000
        }
      }
    }, fieldMask, 'places:foods')));
    allPlaces = settledValuesOrThrow(settled).flat();
    placesCacheSet(cacheKey, allPlaces);
  }

  const seen = new Set();
  const unique = [];
  for (const p of allPlaces) {
    const name = p.displayName?.text;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    unique.push(p);
  }



  return unique
    .map((p) => {
      const rating = Number(p.rating || 0);
      const reviewCount = Number(p.userRatingCount || 0);
      const loc = p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null;
      const distKm = loc ? haversineKm(center, loc) : 10;
      const ratingScore = (rating / 5) * 40;
      const reviewScore = Math.min(30, Math.log10(Math.max(1, reviewCount)) * 10);
      const proximityScore = Math.max(0, 20 - distKm * 3);
      const bonusScore = 10;
      const aiFit = Math.round(Math.min(100, ratingScore + reviewScore + proximityScore + bonusScore));
      const priceLevel = normalizePriceLevel(p.priceLevel);
      const addr = p.formattedAddress || '';
      const area = localizeAddress(addr, cityLabel, lang);
      return {
        name: p.displayName?.text || '맛집', city: cityLabel, genre: localizeType(p.primaryType, lang) || ({ko:'\uC74C\uC2DD\uC810',en:'Restaurant',ja:'\u98F2\u98DF\u5E97'}[lang]||'\uC74C\uC2DD\uC810'),
        area, score: rating, reviewCount, priceLevel, aiFit, mapUrl: p.googleMapsUri || '',
        ...googlePhotoFields(p),
        lat: loc ? loc.lat : null, lng: loc ? loc.lng : null,
        distFromCenter: Math.round(distKm * 10) / 10,
        openNow: p.currentOpeningHours?.openNow ?? null,
        todayHours: formatTodayHours(p.currentOpeningHours)
      };
    })
    .filter((f) => f.score >= 3.0 || f.score === null)
    .sort((a, b) => b.aiFit - a.aiFit)
    .slice(0, 20);
}

// -- Nearest-neighbor route optimization (per-city grouping + haversine) --
function optimizeDayRoute(places) {
  if (!places || places.length <= 2) return places;

  // Group by city to avoid cross-city nearest-neighbor
  const cityGroups = new Map();
  const noCity = [];
  for (const p of places) {
    const c = String(p.city || '').toLowerCase();
    if (!c) { noCity.push(p); continue; }
    if (!cityGroups.has(c)) cityGroups.set(c, []);
    cityGroups.get(c).push(p);
  }

  const result = [];
  for (const group of cityGroups.values()) {
    const withCoords = group.filter(p => p.lat && p.lng);
    const withoutCoords = group.filter(p => !p.lat || !p.lng);
    if (withCoords.length <= 2) {
      result.push(...group);
      continue;
    }
    // Nearest neighbor with haversine
    const ordered = [withCoords[0]];
    const remaining = withCoords.slice(1);
    while (remaining.length > 0) {
      const last = ordered[ordered.length - 1];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(last, remaining[i]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }
    result.push(...ordered, ...withoutCoords);
  }
  result.push(...noCity);
  return result;
}

async function buildTravelPlan(rawPayload) {
  const payload = sanitizePlanIntent(rawPayload);
  const key = cityKeyByInput(payload.city);
  const days = Number(payload.days || 3);
  const limitPerCity = Math.max(6, Math.min(12, days * 2));
  const prefs = planPrefs(payload);

  // Fetch recommendations for primary city
  const rec = await recommendDestinations({
    city: key,
    theme: payload.theme,
    pace: payload.pace,
    budget: 'mid',
    limit: limitPerCity,
    lang: payload.lang || 'ko'
  });
  const cityLabel = rec.city || '';

  // Fetch recommendations for additional route cities
  const routeCities = Array.isArray(payload._routeCities) ? payload._routeCities : [];
  const additionalCityKeys = routeCities
    .map((c) => cityKeyByInput(c) || cityKeyByLabel(c))
    .filter((k) => k && k !== key && CITY_DATA[k]);
  const uniqueAdditionalKeys = [...new Set(additionalCityKeys)];

  if (uniqueAdditionalKeys.length > 0) {
    // 나머지 도시의 추천 카드 수는 첫 도시 몫을 도시 수로 나눈 값(recommendDestinations가 최소 6곳)이다.
    // 이 수를 늘리지 않는다: 규칙 일정의 날짜 분배(allocateDaysByCities)가 후보 수로 정해져 바뀌고(9일 도쿄·오사카 5·4일 → 4·5일),
    // 가운데 도시 카드만 늘어나며, Google 모드면 카드 사진(유료 Place Photo)이 는다.
    // 긴 여러 도시 일정의 AI 후보는 expandPicksForAi가 도시마다(그 도시 일수×3곳) 채운다(무료 모드·대체 데이터).
    const extraRecs = await Promise.all(uniqueAdditionalKeys.map((ck) =>
      recommendDestinations({
        city: ck,
        theme: payload.theme,
        pace: payload.pace,
        budget: 'mid',
        lang: payload.lang || 'ko',
        limit: Math.max(4, Math.min(8, Math.ceil(limitPerCity / (uniqueAdditionalKeys.length + 1))))
      }).catch(() => ({ picks: [] }))
    ));
    for (const er of extraRecs) {
      if (Array.isArray(er.picks)) {
        rec.picks.push(...er.picks);
      }
    }
  }

  const lang = normalizeLang(payload.lang);
  const routeCityKeys = [key, ...uniqueAdditionalKeys];
  // 경로 도시(지역별 일수의 도시 포함)에도 있는 장소를 이웃 도시 이름으로 고른 카드는 경로 도시의 카드로 본다(foldSharedPlacePicks):
  // 삿포로 일정의 '나카지마 공원 (삿포로 오카다마)'가 오카다마를 경로에 더해 없는 도시 이동을 만들지 않게.
  if (Array.isArray(payload._picks) && payload._picks.length) {
    const regionKeys = (Array.isArray(payload._regionDayPlan) ? payload._regionDayPlan : [])
      .map((x) => { const l = String(x?.cityLabel || '').trim(); return l ? (detectCityKeyByInput(l) || cityKeyByLabel(l)) : ''; });
    payload._picks = foldSharedPlacePicks(payload._picks, [...routeCityKeys, ...regionKeys]);
  }
  // 사용자가 빼 달라고 한 곳('디즈니' → 디즈니랜드·디즈니씨)은 추천·일정 후보에서 모두 뺀다.
  const excludedKeys = resolveExcludedNameKeys(payload.excludedPlaces);
  const notExcluded = (p) => !isExcludedPlace(p, excludedKeys);
  // 지어낸 채움 장소(예전 저장 일정의 "<도시> 추천 명소 N")는 추천·일정 후보에서 뺀다.
  const isSyntheticFiller = (p) => /(추천 명소|추가 추천지) \d+$/.test(String(p?.name || ''));
  const dedupeByOriginalName = (list) => {
    const seen = new Set();
    return list.filter((p) => {
      const k = placeNameKey(placeOriginalName(p));
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const mergedBase = mergeSelectedDestinations(payload._picks, rec.picks, cityLabel, lang).filter((p) => !isSyntheticFiller(p) && notExcluded(p));
  // 실내 위주(비 오는 날): 경로 도시의 실내 명소(박물관·수족관·실내 전망대 …)를 추천 카드·일정 후보에 보탠다.
  const indoorExtra = prefs.indoorFocus
    ? indoorPicksForCities(routeCityKeys, lang).filter((p) => notExcluded(p) && !(prefs.removeShopping && isLikelyShopping(p)))
    : [];
  const mergedPicks = dedupeByOriginalName([...mergedBase, ...indoorExtra]);
  // 추천 카드도 실내 위주면 실내 명소를 앞에(고른 카드·요청한 곳의 순서는 일정 후보 쪽에서 따로 지킨다)
  rec.picks = prefs.indoorFocus ? [...mergedPicks.filter((p) => isLikelyIndoor(p)), ...mergedPicks.filter((p) => !isLikelyIndoor(p))] : mergedPicks;
  // 꼭 갈 곳: 후보 → 대표 명소 → 도시 명소 → 데이터에 없으면 사용자가 쓴 이름 그대로(새 후보로 앞에 넣는다)
  const mustVisit = resolveMustVisit(payload.mustVisit, mergedPicks, routeCityKeys, lang, excludedKeys);
  const mustSynthetic = mustVisit.filter((m) => m.synthetic).map((m) => m.synthetic);
  const mustPicks = mustVisit.filter((m) => m.pick).map((m) => m.pick);
  const withMust = (list) => dedupeByOriginalName([...mustSynthetic, ...mustPicks, ...list]);
  const picksForItinerary = withMust(mergedPicks.length ? mergedPicks : rec.picks);
  const tripDays = Math.max(1, Math.min(10, days || 3));
  // 요청한 곳 = 꼭 갈 곳 + 화면이 보낸 카드(_picks). 요청하지 않은 '하루짜리'(테마파크·먼 당일치기)는 4일 이하 일정에 넣지 않고
  // (5일 이상이면 하나까지), 저예산이면 테마파크(fullDay)를 넣지 않는다. 빠진 곳은 추천 카드로만 남겨 직접 넣을 수 있게 한다.
  const requestedKeys = new Set([
    ...mustVisit.map((m) => placeNameKey(m.nameKo || m.name)),
    ...(payload._picks || []).map((p) => placeNameKey(p.nameKo || koPlaceNameForLabel(p.name, cityKeyByLabel(p.city) || key) || p.name))
  ].filter(Boolean));
  const isRequested = (p) => requestedKeys.has(placeNameKey(placeOriginalName(p)));
  const allDayKindOf = (p) => (p && !p.freeTime ? allDayPlaceKind(p, cityKeyByLabel(p.city) || key) : '');
  // 요청한 하루짜리(꼭 갈 곳·고른 카드 중 종일) 수. 요청하지 않은 하루짜리는 5일 이상일 때만, 4일마다 하나(요청한 것까지 합쳐)까지.
  const requestedAllDayCount = new Set([
    ...mustVisit.filter((m) => m.allDay).map((m) => placeNameKey(m.nameKo || m.name)),
    ...(payload._picks || []).filter((p) => allDayKindOf(p)).map((p) => placeNameKey(p.nameKo || koPlaceNameForLabel(p.name, cityKeyByLabel(p.city) || key) || p.name))
  ].filter(Boolean)).size;
  const unrequestedAllDayLimit = tripDays >= 5 ? Math.max(0, Math.floor((tripDays - 1) / 4) - requestedAllDayCount) : 0;
  const unrequestedAllDay = [];
  const limitAllDay = (list) => {
    let n = 0;
    return list.filter((p) => {
      const kind = allDayKindOf(p);
      if (!kind || isRequested(p)) return true;
      if ((prefs.lowBudget && kind === 'fullDay') || n >= unrequestedAllDayLimit) {
        if (!unrequestedAllDay.some((x) => placeOriginalName(x) === placeOriginalName(p))) unrequestedAllDay.push(p);
        return false;
      }
      n += 1;
      return true;
    });
  };
  // 저예산: 유료 전망대·수족관·테마파크는 빼고(요청한 곳은 남김), 무료 명소가 모자랄 때만 뒤에 둔다
  const isPaidSight = (p) => isPaidSightPlace(p, key);
  // 조건 필터(규칙 일정과 같은 기준): 쇼핑 제외면 쇼핑 장소를 빼고, 실내 위주면 실내 장소를 앞에 둔다. 꼭 갈 곳은 그대로 둔다.
  const mustKeySet = new Set(mustVisit.map((m) => placeNameKey(m.nameKo || m.name)));
  const isMustPick = (p) => mustKeySet.has(placeNameKey(placeOriginalName(p)));
  const applyPrefFilters = (list) => {
    let out = limitAllDay(list.filter((p) => notExcluded(p) && (isMustPick(p) || !(prefs.removeShopping && isLikelyShopping(p)))));
    if (prefs.indoorFocus) {
      // 실내 후보 안에서도 요청하지 않은 도시 주변 실제 명소(generated)는 큐레이션 실내 명소 뒤에 둔다(규칙 일정 createItinerary와 같은 순서).
      // 실내 위주면 AI 후보 확장이 실내 생성 장소를 뒤로 미루지 않으므로(keepForExpand) 여기서 순서를 잡는다. 안 그러면 추천 카드 순서대로
      // 국립신미술관 같은 생성 장소가 앞에 서서 도시 몫(일수×3)에서 팀랩 플래닛·도쿄 스카이트리·구로몬 시장이 빠진다(2026-10-03).
      const indoor = out.filter((p) => isMustPick(p) || isLikelyIndoor(p));
      const lateIndoor = (p) => !isMustPick(p) && !isRequested(p) && isGeneratedCityPlace(p, key);
      out = [...indoor.filter((p) => !lateIndoor(p)), ...indoor.filter(lateIndoor), ...out.filter((p) => !indoor.includes(p))];
    }
    if (prefs.lowBudget) {
      const free = out.filter((p) => isMustPick(p) || isRequested(p) || !isPaidSight(p));
      out = free.length >= Math.min(tripDays * 2, 6) ? free : [...free, ...out.filter((p) => !free.includes(p))];
    }
    return out;
  };
  // AI 후보: 내장 큐레이션 데이터(무료 모드·대체)일 때는 같은 도시의 대표 명소를 보태 days×3곳(여러 도시면 도시마다 그 도시 일수×3곳)을 만든다.
  let expandAllDayUsed = 0;
  const skipForExpand = (p) => {
    if (!notExcluded(p) || (prefs.removeShopping && isLikelyShopping(p))) return true;
    const kind = allDayKindOf(p);
    if (!kind || isRequested(p)) return false;
    if ((prefs.lowBudget && kind === 'fullDay') || expandAllDayUsed >= unrequestedAllDayLimit) {
      if (!unrequestedAllDay.some((x) => placeOriginalName(x) === placeOriginalName(p))) unrequestedAllDay.push(p);
      return true;
    }
    expandAllDayUsed += 1;
    return false;
  };
  const expandBase = picksForItinerary.filter(notExcluded);
  // 도시가 2곳 이상이면 날짜별 도시(dayPlan)를 정해 AI·후처리가 같은 분배를 쓴다.
  // 분배는 후보 확장 전 후보(조건 필터 뒤)로 정한다: 확장이 이 분배에 맞춰 도시마다 후보를 채우고, 보탠 수가 분배를 바꾸지 않게.
  // (확장이 아무것도 보태지 않으면 예전과 같은 분배다. 여기서는 일정에 넣지 않은 하루짜리 목록을 건드리지 않는다.)
  const planPicks = (() => {
    const n = unrequestedAllDay.length;
    const out = applyPrefFilters(withMust(expandBase));
    unrequestedAllDay.length = n;
    return out;
  })();
  const startDate = itineraryStartDate(payload);
  const routeLabels = deriveRouteCities(payload, planPicks, cityLabel);
  // 주 도시('아사히카와 3일 아라시야마 공원')의 장소 도시 몫은 꼭 갈 곳(종일·반나절)과 첫날·마지막 날 시간으로 정한다(규칙·AI 같은 값)
  const mainCtx = typeof prefs.mainCity === 'string' && prefs.mainCity ? mainCityNeedContext(mustVisit, payload, prefs) : null;
  const daySeq = routeLabels.length > 1 ? allocateDaysByCities(routeLabels, planPicks, tripDays, payload._regionDayPlan, prefs.mainCity, mainCtx) : [];
  const multiCityDays = daySeq.length > 1 && new Set(daySeq).size > 1;
  // 여러 도시: 도시마다 그 도시 일수×3곳을 목표로 채운다(도시가 하나면 전체 일수×3곳).
  // 목표에는 조건 필터(applyPrefFilters) 뒤에 앞에 남을 장소만 센다: 하루짜리, 쇼핑 제외의 쇼핑 장소, 저예산의 유료 명소,
  // 실내 위주의 야외 장소(요청한 곳은 센다)는 세지 않는다. 실내 위주면 실내 장소(대부분 생성 장소)를 뒤로 미루지 않는다(keep).
  // 그 실내 생성 장소는 applyPrefFilters가 큐레이션 실내 명소 뒤에 둔다(도시 몫에서 팀랩 플래닛 같은 큐레이션 실내 명소가 먼저 들어간다).
  const cityTargets = multiCityDays
    ? daySeq.reduce((m, label) => { const ck = cityKeyByLabel(label); if (ck) m.set(ck, (m.get(ck) || 0) + AI_PICKS_PER_DAY); return m; }, new Map())
    : null;
  const countsForCityTarget = (p) => !allDayKindOf(p)
    && (isMustPick(p) || !(prefs.removeShopping && isLikelyShopping(p)))
    && !(prefs.lowBudget && !isMustPick(p) && !isRequested(p) && isPaidSight(p))
    && (!prefs.indoorFocus || isMustPick(p) || isRequested(p) || isLikelyIndoor(p));
  const keepForExpand = (p) => isRequested(p) || isMustPick(p) || Boolean(prefs.indoorFocus && isLikelyIndoor(p));
  const aiPicks = applyPrefFilters(withMust(rec.sourceInfo?.kind === 'live'
    ? picksForItinerary
    : expandPicksForAi(expandBase, routeCityKeys, lang, tripDays, skipForExpand, { cityTargets, countable: countsForCityTarget, keep: keepForExpand, allDaySlots: unrequestedAllDayLimit })));
  // 일수보다 도시가 많아 날짜 배분에서 빠진 경로 도시(일정 팁 맨 앞과 itineraryInfo.droppedCities로 알린다)
  // (후보 장소의 도시가 아니라 요청이 말한 경로 도시·지역별 일수의 도시만 본다: 말하지 않은 도시를 '못 넣었다'고 하지 않게)
  const requestedRoute = deriveRouteCities({ _routeCities: payload._routeCities, _regionDayPlan: payload._regionDayPlan }, [], cityLabel);
  const droppedCities = routeLabels.length > 1 ? requestedRoute.filter((c) => routeLabels.includes(c) && !daySeq.includes(c)) : [];
  const dayPlan = multiCityDays
    ? daySeq.map((c, i) => ({ day: i + 1, date: getDateOffset(startDate, i), city: c, ...(i > 0 && daySeq[i - 1] !== c ? { transferFrom: daySeq[i - 1] } : {}) }))
    : [];
  const aiIntent = {
    mustVisit,
    excluded: (payload.excludedPlaces || []).filter(Boolean),
    dayPlan,
    routeCityKeys,
    // 요청한 곳(꼭 갈 곳 + 화면에서 고른 카드)의 원래 이름 키: 여러 도시 일정의 후보 몫을 고를 때 먼저 넣는다(프롬프트에는 넣지 않는다)
    requested: [...requestedKeys]
  };
  // 후처리에서 맛집 이름을 알아보는 데 쓰는 목록(현지화 이름 + 원래 이름, 경로 도시 전체)
  // (실제 가게를 먼저, '찾기' 안내는 뒤에: 빈 저녁을 채울 때 실제 가게부터 쓴다)
  const postFoods = routeCityKeys.flatMap((ck) => [...(CITY_DATA[ck]?.foods || [])].sort((a, b) => Number(Boolean(a.generic)) - Number(Boolean(b.generic)))
    .map((f) => ({ name: localizeCuratedFoodName(f.name, ck, lang), nameKo: f.name, area: localizeCuratedArea(f.area, lang, localizedCityName(ck, lang)), areaKo: f.area, genre: f.genre, city: CITY_DATA[ck].label, ...(f.generic ? { generic: true } : {}) })));
  let it;
  const aiErrors = [];
  if (payload.useAi) {
    if (USE_GEMINI) {
      try {
        it = await createItineraryWithGemini({ ...payload, city: key, _picks: aiPicks, _aiIntent: aiIntent }, aiPicks);
      } catch (err) {
        const classified = classifyAiError('Gemini', err);
        aiErrors.push(classified);
        warnThrottled(`itinerary:gemini:${classified.code}`, `[itinerary] Gemini 일정 실패(${classified.code}) → ${OPENAI_API_KEY ? `${OPENAI_PROVIDER_LABEL} 시도` : '규칙 기반 일정'}: ${String(err?.message || err).slice(0, 200)}`.replace(/\s+/g, ' '));
      }
    }
    if (!it && OPENAI_API_KEY) {
      try {
        it = await createItineraryWithOpenAI({ ...payload, city: key, _picks: aiPicks, _aiIntent: aiIntent }, aiPicks);
      } catch (err) {
        const classified = classifyAiError(OPENAI_PROVIDER_LABEL, err);
        aiErrors.push(classified);
        warnThrottled(`itinerary:openai:${classified.code}`, `[itinerary] ${OPENAI_PROVIDER_LABEL} 일정 실패(${classified.code}) → 규칙 기반 일정: ${String(err?.message || err).slice(0, 200)}`.replace(/\s+/g, ' '));
      }
    }
  }
  let itineraryInfo;
  let post = null;
  if (it) {
    // AI 일정 결정적 후처리: 식사·관광 분류, 종일 병합, 꼭 갈 곳 넣기, 조건 강제, 반복·제외 정리
    const ctxPicks = Array.isArray(it._ctx?.picks) && it._ctx.picks.length ? it._ctx.picks : aiPicks;
    const postPicks = ctxPicks.map((cp) => {
      const full = aiPicks.find((p) => p.name === cp.name);
      return { ...cp, nameKo: full ? placeOriginalName(full) : cp.name, stayMin: cp.stayMin || full?.stayMin };
    });
    post = postProcessItinerary(it.itinerary, {
      picks: postPicks, foods: postFoods, mustVisit, excludedKeys, prefs, payload, dayPlan, lang, cityLabel, foodWishes: payload.foodWishes
    });
    it.itinerary = post.itinerary;
    itineraryInfo = sourceInfo('ai', it.provider || 'ai');
    if (post.stats.repeatsReplaced > 0) console.log(`[itinerary] AI 일정에서 여러 날 반복된 장소 ${post.stats.repeatsReplaced}곳을 아직 쓰지 않은 후보로 바꿨습니다.`);
  } else {
    const rulePicks = applyPrefFilters(picksForItinerary);
    // 명소 풀에서 요청하지 않은 하루짜리 장소를 꺼내 쓰는 것은 5일 이상(저예산이면 테마파크 제외)일 때 하나까지만
    const ruleAllDayFromPool = Math.max(0, unrequestedAllDayLimit - rulePicks.filter((p) => allDayKindOf(p) && !isRequested(p)).length);
    it = createItinerary({ ...payload, city: key, _picks: rulePicks, _poolAllDayMax: ruleAllDayFromPool, _requestedNames: [...requestedKeys], _mustNames: [...mustKeySet], _mainCityCtx: mainCtx });
    // 규칙 일정: 빠진 꼭 갈 곳만 넣는다(나머지 규칙은 createItinerary가 이미 지킨다). 날짜별 도시는 createItinerary와 같은 방법으로 구한다.
    if (mustVisit.length) {
      const ruleRoute = deriveRouteCities(payload, rulePicks, cityLabel);
      const ruleSeq = ruleRoute.length > 1 ? allocateDaysByCities(ruleRoute, rulePicks, tripDays, payload._regionDayPlan, prefs.mainCity, mainCtx) : [];
      const ruleDayPlan = ruleSeq.length > 1 && new Set(ruleSeq).size > 1 ? ruleSeq.map((c, i) => ({ day: i + 1, city: c })) : [];
      post = postProcessItinerary(it.itinerary, { picks: rulePicks, foods: postFoods, mustVisit, excludedKeys, prefs, payload, dayPlan: ruleDayPlan, lang, cityLabel, ruleMode: true });
      it.itinerary = post.itinerary;
    }
    let reason = null;
    if (payload.useAi) {
      reason = (!USE_GEMINI && !OPENAI_API_KEY) ? 'AI_KEY_MISSING' : (aiErrors[0]?.reasonCode || 'AI_ERROR');
    }
    itineraryInfo = sourceInfo('rule', 'rule_planner', reason);
  }
  if (post) {
    itineraryInfo.postProcess = post.stats;
    itineraryInfo.missingMustVisit = post.missingMustVisit;
  } else {
    itineraryInfo.missingMustVisit = [];
  }
  delete it._ctx;
  // 추천 카드 = 추천 목록 + 규칙 일정이 더 넣은 장소. 더한 장소에도 사진·좌표·현지화 표기를 붙이고,
  // 같은 장소가 두 이름으로 두 번 나오지 않게 이름(원래 이름)·위키데이터 ID로 겹침을 없앤다.
  // 끝으로, 자기 사진이 없는 카드(사진 데이터가 없는 명소·사용자가 고른 장소)는 도시 대표 사진(scope 'city')으로 채운다.
  const cardCityKey = (p) => cityKeyByLabel(p?.city) || key;
  const ruleExtra = Array.isArray(it.extraRecommendations) ? it.extraRecommendations : [];
  const mergedRecommendations = (() => {
    const base = Array.isArray(rec.picks) ? [...rec.picks] : [];
    // 추천 목록(rec.picks: 경로 도시 순)은 자르지 않는다. 규칙 일정이 실제로 넣은 곳(지금 일정 칸에 있는 장소)도 자르지 않는다.
    // 24장 상한은 일정에 없는 더한 장소(일정에 넣지 않은 하루짜리 등)에만 건다.
    // (예전에는 더한 장소 전체를 24장까지만 채워, 첫 도시 카드 12장이 자리를 먼저 차지하면 뒤 도시의 일정에 든 곳
    //  — 10일 오사카·교토의 금각사·니조성, 6일 도쿄·교토·오사카의 니조성·가이유칸 — 카드가 빠지고 지도 좌표도 못 찾았다. 2026-10-03)
    // 일정에 없는 생성 장소 카드를 빼서 24장을 지키는 방법은 쓰지 않는다: 추천 목록을 자르지 않는다는 앞의 결정과 어긋나고,
    // 넘는 양이 일정의 관광 칸 수(일수×2~3)로 묶이며, 더한 카드는 내장 데이터(사진·좌표)라 유료 호출이 늘지 않는다.
    const recCount = base.length;
    // 일정에 넣지 않은 하루짜리 후보(테마파크·먼 당일치기)는 카드로만 보여 준다(+ 일정에 넣기로 직접 넣을 수 있게)
    const unrequested = unrequestedAllDay.filter((p) => notExcluded(p) && !(prefs.lowBudget && allDayKindOf(p) === 'fullDay'));
    const scheduledNames = new Set((Array.isArray(it.itinerary) ? it.itinerary : [])
      .flatMap((d) => (Array.isArray(d?.blocks) ? d.blocks : []).map((b) => itineraryPlaceName(b)?.name).filter(Boolean)));
    const scheduled = ruleExtra.filter((p) => scheduledNames.has(String(p?.name || '').trim()));
    const extra = [...scheduled, ...ruleExtra.filter((p) => !scheduled.includes(p)), ...unrequested];
    if (extra.length === 0) return base;
    const nameKeyOf = (p) => `${String(p?.city || '').toLowerCase()}|${placeNameKey(placeOriginalName(p))}`;
    const seen = new Set(base.map(nameKeyOf));
    const seenQids = new Set(base.map((p) => p?.wikidata).filter(Boolean));
    let scheduledAdded = 0;
    extra.forEach((raw, i) => {
      if (!raw?.name || isSyntheticFiller(raw) || !notExcluded(raw)) return;
      const ck = cityKeyByLabel(raw.city) || key;
      const p = localizeCuratedPlace(attachPlaceMedia(raw, ck, placeOriginalName(raw)), ck, lang);
      const k = nameKeyOf(p);
      if (seen.has(k) || (p.wikidata && seenQids.has(p.wikidata))) return;
      seen.add(k);
      if (p.wikidata) seenQids.add(p.wikidata);
      base.push(p);
      if (i < scheduled.length) scheduledAdded += 1;
    });
    return base.slice(0, Math.max(recCount + scheduledAdded, Math.min(24, base.length)));
  })().map((p) => withCityPhotoFallback(p, cardCityKey(p)));
  // Fetch recommended foods near destinations + stay (for all route cities)
  const foodCityKeys = routeCityKeys;
  let recommendedFoods = [];
  let foodsReason = null;
  if (GOOGLE_PLACES_ENABLED) {
    try {
      const stayLoc = payload.stay ? { lat: payload.stay.lat, lng: payload.stay.lng } : null;
      const foodCities = [rec.city, ...uniqueAdditionalKeys.map((k) => CITY_DATA[k]?.label).filter(Boolean)];
      const allFoods = await Promise.all(foodCities.map((cl) => {
        const cityDests = mergedRecommendations.filter((d) => String(d.city || '') === cl);
        return fetchRecommendedFoods(cityDests.length > 0 ? cityDests : mergedRecommendations, cl, payload.budget, stayLoc, lang).catch((e) => {
          if (!foodsReason) foodsReason = e?.reasonCode || 'GOOGLE_ERROR';
          return [];
        });
      }));
      const seenFoodNames = new Set();
      for (const foods of allFoods) {
        for (const f of foods) {
          const norm = String(f.name || '').trim().toLowerCase();
          if (!norm || seenFoodNames.has(norm)) continue;
          seenFoodNames.add(norm);
          recommendedFoods.push(f);
        }
      }
      recommendedFoods.sort((a, b) => (b.aiFit || 0) - (a.aiFit || 0));
      recommendedFoods = recommendedFoods.slice(0, 20);
    } catch (err) {
      foodsReason = err?.reasonCode || 'GOOGLE_ERROR';
      console.warn('[foods] 추천 맛집 조회 실패:', redactGoogleKey(err?.message || err));
    }
  }
  // 무료 모드 + HOTPEPPER_API_KEY: 경로 도시(최대 3곳)마다 도시 중심 3km 안 가게를 번갈아 섞어 최대 20곳
  let foodsLiveProvider = 'google_places';
  if (!GOOGLE_PLACES_ENABLED && HOTPEPPER_API_KEY) {
    const hpLists = await Promise.all(foodCityKeys.slice(0, 3).map((ck) => fetchHotpepperShops(ck, { count: 20, lang })));
    const longest = hpLists.reduce((m, l) => Math.max(m, l.shops.length), 0);
    const seenHp = new Set();
    for (let i = 0; i < longest && recommendedFoods.length < 20; i += 1) {
      for (const l of hpLists) {
        const f = l.shops[i];
        if (!f || seenHp.has(f.name) || recommendedFoods.length >= 20) continue;
        seenHp.add(f.name);
        recommendedFoods.push(f);
      }
    }
    if (recommendedFoods.length) foodsLiveProvider = 'hotpepper';
    else foodsReason = hpLists.find((l) => l.reasonCode)?.reasonCode || 'NO_RESULTS';
  }
  let foodsInfo;
  if (recommendedFoods.length > 0) {
    foodsInfo = sourceInfo('live', foodsLiveProvider);
  } else {
    // 내장 큐레이션 맛집 (도시별로 섞어서 최대 12곳)
    recommendedFoods = curatedFoodsForCities(foodCityKeys, payload.budget, lang, 12);
    foodsInfo = (GOOGLE_PLACES_ENABLED || HOTPEPPER_API_KEY)
      ? sourceInfo('fallback', 'curated', foodsReason || 'NO_RESULTS')
      : sourceInfo('curated', 'curated');
  }

  // 지도용 좌표: 각 날의 places + 전체 placeCoords (규칙 일정이 넣은 곳의 좌표도 본다: 같은 위키데이터 ID의 다른 이름 카드로 합쳐진 곳)
  const withCoords = attachItineraryCoordinates(it.itinerary, [...mergedRecommendations, ...picksForItinerary, ...aiPicks, ...ruleExtra], foodCityKeys);
  // 도시 주변 명소가 적은 곳(작은 섬, assets/city-places.json few): 다른 도시 장소로 채우지 않았다고 팁 맨 앞에 알린다(규칙·AI 일정 모두)
  const tips = Array.isArray(it.tips) ? [...it.tips] : [];
  // 일수가 모자라 넣지 못한 경로 도시(1박2일에 도쿄·오사카·후쿠오카): 말없이 빼지 않고 맨 앞에 알린다(규칙·AI 일정 모두 같은 배분)
  if (droppedCities.length) {
    itineraryInfo.droppedCities = droppedCities;
    const RT = (RULE_PLAN_TEXT[lang] || RULE_PLAN_TEXT.ko).tips;
    const sep = lang === 'ja' ? '・' : (lang === 'en' ? ', ' : '·');
    const asked = requestedRoute.filter((c) => routeLabels.includes(c)).length;
    tips.unshift(RT.droppedCities(droppedCities.map((c) => cityLabelForLang(c, lang)).join(sep), tripDays, asked, asked * 2 - 1));
  }
  if (cityHasFewSights(key) && routeCityKeys.length === 1) {
    const sightCount = new Set(curatedCityPool(key, 'ko').filter((p) => !allDayPlaceKind(p, key)).map((p) => placeNameKey(p.name))).size;
    const fewTip = (RULE_PLAN_TEXT[lang] || RULE_PLAN_TEXT.ko).tips.fewSights(localizedCityName(key, lang), sightCount);
    if (!tips.includes(fewTip)) tips.unshift(fewTip);
  }

  return {
    source: 'integrated_travel_planner_v1',
    city: rec.city,
    recommendationSource: rec.source || 'unknown',
    recommendationInfo: rec.sourceInfo || sourceInfo('curated', 'curated+wikimedia'),
    recommendations: mergedRecommendations,
    recommendedFoods,
    foodsInfo,
    itinerary: withCoords.itinerary,
    placeCoords: withCoords.placeCoords,
    itinerarySource: it.source,
    itineraryInfo,
    itineraryModel: it.source || null,
    tips,
    summary: planSummary(key, mergedRecommendations.length, it.itinerary.length, lang),
    aiNote: summarizeAiErrors(aiErrors),
    aiErrors: publicAiErrors(aiErrors)
  };
}

function toDateKey(dateLike) {
  return String(dateLike || '').replace(/-/g, '');
}

// Skyscanner 주소의 날짜는 YYMMDD(2026-10-20 → 261020). 예전에는 YYYYMMDD를 넣었다.
function skyscannerDateKey(dateLike) {
  return toDateKey(dateLike).slice(2);
}

// API 응답의 deeplinkKayak·deeplinkSkyscanner(호환용). 화면 카드의 사이트 링크(구글·네이버·스카이스캐너·카약·Trip.com)는
// public/app.js의 flightSiteLinks가 만든다(직접 입력한 항공편·저장한 일정에도 같은 링크를 달기 위해).
function buildFlightDeeplink(provider, tripType, legs) {
  const safeProvider = provider === 'KAYAK' ? 'KAYAK' : 'Skyscanner';
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (!first) return '';

  if (safeProvider === 'KAYAK') {
    if (tripType === 'roundtrip' && legs.length >= 2) {
      return `https://www.kayak.co.kr/flights/${first.from}-${first.to}/${first.date}/${last.date}`;
    }
    if (tripType === 'multicity' && legs.length >= 2) {
      const path = legs.map((l) => `${l.from}-${l.to}/${l.date}`).join('/');
      return `https://www.kayak.co.kr/flights/${path}`;
    }
    return `https://www.kayak.co.kr/flights/${first.from}-${first.to}/${first.date}`;
  }

  // Skyscanner (KR). 다구간은 flights-multi-city/<출발>/<도착>/<YYMMDD>/… (예전에는 KAYAK 주소를 돌려줬다)
  if (tripType === 'multicity' && legs.length >= 2) {
    const path = legs.map((l) => `${l.from.toLowerCase()}/${l.to.toLowerCase()}/${skyscannerDateKey(l.date)}`).join('/');
    return `https://www.skyscanner.co.kr/transport/flights-multi-city/${path}/`;
  }
  if (tripType === 'roundtrip' && legs.length >= 2) {
    return `https://www.skyscanner.co.kr/transport/flights/${first.from.toLowerCase()}/${first.to.toLowerCase()}/${skyscannerDateKey(first.date)}/${skyscannerDateKey(last.date)}/`;
  }
  return `https://www.skyscanner.co.kr/transport/flights/${first.from.toLowerCase()}/${first.to.toLowerCase()}/${skyscannerDateKey(first.date)}/`;
}

function buildFlightDeeplinks(tripType, legs) {
  return {
    kayak: buildFlightDeeplink('KAYAK', tripType, legs),
    skyscanner: buildFlightDeeplink('Skyscanner', tripType, legs)
  };
}

function toMinutes(timeText) {
  const [h, m] = String(timeText || '00:00').split(':').map(Number);
  return (h * 60) + (m || 0);
}

// ── 항공·숙소 입력 정리 ──
const IATA_CODE_RE = /^[A-Z]{3}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeIata(value) {
  const v = String(value || '').trim().toUpperCase();
  return IATA_CODE_RE.test(v) ? v : '';
}

function normalizeIsoDate(value) {
  const v = String(value || '').trim().slice(0, 10);
  return ISO_DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : '';
}

function addDaysIso(isoDate, days) {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

function dayDiffIso(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

// 도착 공항: 사용자가 고른 공항 → 선택한 도시의 공항 → NRT
function flightDestinationAirport(payload, legs = []) {
  return normalizeIata(payload.to)
    || normalizeIata(legs[0]?.to)
    || normalizeIata(CITY_DATA[cityKeyByInput(payload.city)]?.airport)
    || 'NRT';
}

// "2026-10-20T08:35:00+09:00" + 분 → 같은 시간대의 "HH:MM" (ICN·일본은 둘 다 UTC+9)
function addMinutesToIsoClock(iso, minutes) {
  const raw = String(iso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) || !(Number(minutes) > 0)) return '';
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(raw);
  const hasZone = Boolean(m) || /Z$/i.test(raw);
  const t = Date.parse(hasZone ? raw : `${raw}Z`); // 시간대 표기가 없으면 적힌 시각 그대로 계산
  if (Number.isNaN(t)) return '';
  const offsetMin = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(t + (Number(minutes) + offsetMin) * 60000).toISOString().slice(11, 16);
}

function convertToKRW(amount, currency) {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) return 0;
  const cur = String(currency || 'KRW').toUpperCase();
  if (cur === 'KRW') return num;
  if (cur === 'USD') return num * fxUsdKrw;
  if (cur === 'JPY') return num * fxJpyKrw;
  if (cur === 'EUR') return num * fxUsdKrw * 1.08;
  return num;
}

// ── Travelpayouts 도시코드 → 공항코드 매핑 ──
const TP_CITY_TO_AIRPORT = {
  SEL: 'ICN', TYO: 'NRT', OSA: 'KIX', SPK: 'CTS', FUK: 'FUK',
  NGO: 'NGO', OKA: 'OKA', HIJ: 'HIJ', SDJ: 'SDJ', KOJ: 'KOJ',
  NGS: 'NGS', KMJ: 'KMJ', OIT: 'OIT', TAK: 'TAK', KMQ: 'KMQ',
  UKB: 'UKB', NRT: 'NRT', KIX: 'KIX', HND: 'HND', CTS: 'CTS',
  ICN: 'ICN', GMP: 'GMP', PUS: 'PUS'
};
function tpToAirport(code) { return TP_CITY_TO_AIRPORT[code] || code; }

// ── Travelpayouts API (항공권) ──
const TRAVELPAYOUTS_BASE = `${TRAVELPAYOUTS_API_BASE}/aviasales/v3`;

// 외부 공급자(항공·숙소) 호출 실패 — reasonCode는 sourceInfo에 그대로 쓴다.
class ProviderError extends Error {
  constructor(reasonCode, message) {
    super(message || reasonCode);
    this.name = 'ProviderError';
    this.reasonCode = reasonCode;
  }
}

// Travelpayouts prices_for_dates는 다른 이용자의 최근 검색에서 모은 "캐시 가격"이라 정확한 날짜 조합은 자주 비어 있다.
// → ① 요청한 날짜 그대로 ② 비면 같은 달(경계면 이웃 달까지) 캐시에서 출발일 ±7일(왕복은 체류 일수 ±3일)을 고른다.
const TP_NEARBY_DAYS = 7;
const TP_STAY_TOLERANCE_DAYS = 3;
const TP_CACHE_TTL_MS = 30 * 60_000;
// grouped_prices(날짜별 최저가)는 덧붙이는 정보라 짧게 기다린다. 가격순 목록과 함께 부르므로, 늦거나 응답이 없어도
// 가까운 날짜 조회 시간은 가격순 목록(AI_REQUEST_TIMEOUT_MS)보다 길어지지 않는다(화면의 /api/flights 제한은 30초).
const TP_GROUPED_TIMEOUT_MS = 4000;
const _tpCache = new Map();

function redactTravelpayoutsToken(text) {
  const s = String(text || '');
  return TRAVELPAYOUTS_TOKEN ? s.split(TRAVELPAYOUTS_TOKEN).join('***') : s;
}

// 응답 통화 확인: 요청은 늘 currency=krw다. 응답의 currency가 krw가 아니면(실제로 그런지는 scripts/travelpayouts-check.mjs로 확인)
// usd·jpy·eur는 지금 환율로 원화로 바꾸고, 바꿀 수 없는 통화(rub 등)는 원화로 잘못 보이지 않게 가격을 쓰지 않는다.
const TP_CONVERTIBLE_CURRENCIES = new Set(['USD', 'JPY', 'EUR']);

function travelpayoutsRowsInKrw(rows, currency, label) {
  const cur = String(currency || '').trim().toUpperCase() || 'KRW';
  if (cur === 'KRW') return rows;
  if (!TP_CONVERTIBLE_CURRENCIES.has(cur)) {
    warnThrottled(`travelpayouts:currency:${cur}`, `[travelpayouts] ${label} 응답 통화가 ${cur}(요청은 krw)라 가격을 쓰지 않음`);
    throw new ProviderError('PROVIDER_UNAVAILABLE', `travelpayouts currency ${cur}`);
  }
  warnThrottled(`travelpayouts:currency:${cur}`, `[travelpayouts] ${label} 응답 통화가 ${cur}(요청은 krw) → 환율로 원화 환산`);
  return rows.map((r) => ({ ...r, price: Math.round(convertToKRW(r.price, cur)) }));
}

// Aviasales Data API v3 GET 공통: 토큰은 주소에만(로그·응답에는 가림), 30분 캐시, 응답 통화 확인.
// toRows: 응답 JSON → 항공권 행 배열(엔드포인트마다 data 모양이 다르다). timeoutMs: 호출 하나의 제한
async function travelpayoutsGet(endpoint, query, label, toRows, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const cacheKey = `${endpoint}?${query}`;
  const cached = _tpCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < TP_CACHE_TTL_MS) return cached.rows;
  const withToken = new URLSearchParams(query);
  withToken.set('token', TRAVELPAYOUTS_TOKEN);
  let res;
  try {
    res = await fetchWithTimeout(`${TRAVELPAYOUTS_BASE}/${endpoint}?${withToken}`, {}, timeoutMs);
  } catch (err) {
    // 엔드포인트마다 따로 줄인다(grouped_prices 시간 초과 경고가 prices_for_dates 실패 경고를 가리지 않게)
    warnThrottled(`travelpayouts:network:${endpoint}`, `[travelpayouts] ${label} 요청 실패(네트워크/타임아웃): ${redactTravelpayoutsToken(err?.cause?.code || err?.message || err)}`);
    throw new ProviderError('PROVIDER_UNAVAILABLE', 'travelpayouts network error');
  }
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok || !json || json.success === false) {
    warnThrottled(`travelpayouts:http:${res.status}`, `[travelpayouts] ${label} → HTTP ${res.status} ${redactTravelpayoutsToken(text).replace(/\s+/g, ' ').slice(0, 200)}`);
    throw new ProviderError('PROVIDER_UNAVAILABLE', `travelpayouts HTTP ${res.status}`);
  }
  const rows = travelpayoutsRowsInKrw(toRows(json).filter((r) => r && typeof r === 'object' && !Array.isArray(r)), json.currency, label);
  _tpCache.set(cacheKey, { at: Date.now(), rows });
  while (_tpCache.size > 200) _tpCache.delete(_tpCache.keys().next().value);
  return rows;
}

async function travelpayoutsPricesForDates(params, label) {
  const query = new URLSearchParams({ sorting: 'price', direct: 'false', currency: 'krw', ...params });
  return travelpayoutsGet('prices_for_dates', query, label, (json) => (Array.isArray(json.data) ? json.data : []));
}

// grouped_prices: 한 달의 출발일마다 가장 싼 1건(data = { 'YYYY-MM-DD': 행 }). prices_for_dates 가격순 100건은 싼 날에 몰려
// 요청 날짜 가까운 날이 빠질 수 있어, 가까운 날짜 조회에서 함께 본다. 왕복은 return_at(달)을 같이 보낸다.
// 제한은 TP_GROUPED_TIMEOUT_MS(짧게): 늦으면 빼고 가격순 목록만 쓴다.
async function travelpayoutsGroupedPrices(params, label) {
  const query = new URLSearchParams({ currency: 'krw', group_by: 'departure_at', direct: 'false', ...params });
  return travelpayoutsGet('grouped_prices', query, label, (json) => {
    const data = json.data;
    if (Array.isArray(data)) return data;
    return data && typeof data === 'object' ? Object.values(data) : [];
  }, TP_GROUPED_TIMEOUT_MS);
}

// 가까운 날짜 조회에 쓸 (출발 월, 귀국 월) 조합. 요청 날짜의 달을 먼저, 창(±7일)이 달을 넘으면 이웃 달까지 최대 2개.
function tpNearbyMonthQueries(departDate, returnDate, isRound, today) {
  const windowEnd = addDaysIso(departDate, TP_NEARBY_DAYS);
  if (windowEnd < today) return [];
  const startCandidate = addDaysIso(departDate, -TP_NEARBY_DAYS);
  const windowStart = startCandidate < today ? today : startCandidate;
  const stay = isRound ? Math.max(0, dayDiffIso(returnDate, departDate)) : 0;
  const reps = [departDate < windowStart ? windowStart : departDate, windowStart, windowEnd];
  const out = [];
  const seen = new Set();
  for (const rep of reps) {
    const depMonth = rep.slice(0, 7);
    const retMonth = isRound ? addDaysIso(rep, stay).slice(0, 7) : '';
    const key = `${depMonth}|${retMonth}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ depMonth, retMonth });
  }
  return out.slice(0, 2);
}

function pickNearbyTravelpayoutsRows(rows, departDate, returnDate, isRound, today) {
  const stay = isRound ? dayDiffIso(returnDate, departDate) : 0;
  const seen = new Set();
  return rows.map((r) => {
    const d = String(r?.departure_at || '').slice(0, 10);
    if (!ISO_DATE_RE.test(d) || d < today) return null;
    const depOff = Math.abs(dayDiffIso(d, departDate));
    if (depOff > TP_NEARBY_DAYS) return null;
    let stayOff = 0;
    if (isRound) {
      const rd = String(r.return_at || '').slice(0, 10);
      if (!ISO_DATE_RE.test(rd)) return null;
      stayOff = Math.abs(dayDiffIso(rd, d) - stay);
      if (stayOff > TP_STAY_TOLERANCE_DAYS) return null;
    }
    const key = `${r.departure_at}|${r.return_at || ''}|${r.airline || ''}|${r.flight_number || ''}|${r.price}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return { row: r, distance: depOff + stayOff };
  }).filter(Boolean)
    .sort((a, b) => (a.distance - b.distance) || (Number(a.row.price || 0) - Number(b.row.price || 0)))
    .slice(0, 30);
}

// 반환: { items, dateMatch: 'exact'|'nearby'|null }. 설정 없음·HTTP 오류·네트워크 오류는 ProviderError로 던진다.
async function fetchTravelpayoutsFlights(payload) {
  if (!TRAVELPAYOUTS_TOKEN) throw new ProviderError('PROVIDER_UNAVAILABLE', 'travelpayouts token missing');
  const origin = normalizeIata(payload.from) || 'ICN';
  const tripType = payload.tripType || 'oneway';
  const legs = Array.isArray(payload.multiSegments) && payload.multiSegments.length > 0
    ? payload.multiSegments
    : (Array.isArray(payload.legs) ? payload.legs : []);

  // Multi-city: 구간별 편도로 각각 조회 후 합산
  if (tripType === 'multicity' && legs.length >= 2) {
    const allResults = [];
    let failures = 0;
    for (const leg of legs.slice(0, 4)) {
      const legDate = normalizeIsoDate(leg?.date);
      if (!legDate) continue;
      try {
        const rows = await travelpayoutsPricesForDates({
          origin: normalizeIata(leg.from) || origin,
          destination: normalizeIata(leg.to) || 'NRT',
          departure_at: legDate,
          one_way: 'true',
          limit: '10'
        }, 'multicity');
        allResults.push(...rows);
      } catch {
        failures += 1;
      }
    }
    if (allResults.length === 0 && failures > 0) throw new ProviderError('PROVIDER_UNAVAILABLE', 'travelpayouts multicity failed');
    return {
      items: allResults.map((item, idx) => normalizeTravelpayoutsFlight(item, idx, tripType)),
      dateMatch: allResults.length > 0 ? 'exact' : null
    };
  }

  // One-way or round-trip
  const isRound = tripType === 'roundtrip';
  const today = new Date().toISOString().slice(0, 10);
  const departDate = normalizeIsoDate(payload.departDate || legs[0]?.date) || today;
  const returnDate = isRound
    ? (normalizeIsoDate(payload.returnDate || legs[1]?.date) || addDaysIso(departDate, 3))
    : '';
  const destination = flightDestinationAirport(payload, legs);
  const base = { origin, destination, one_way: isRound ? 'false' : 'true' };
  // dateOffsetDays: 요청 날짜와의 차이(출발일 차이 + 왕복 체류 일수 차이). 순위에서 가까운 날짜를 앞에 둔다.
  // 가까운 날짜 조회에서도 날짜가 요청과 같으면(날짜별 최저가에 그날이 있으면) '다른 날짜'가 아니다.
  const normalizeAll = (entries, nearby) => entries.map((e, idx) => ({
    ...normalizeTravelpayoutsFlight(e.row, idx, tripType),
    nearbyDate: nearby && e.distance > 0,
    dateOffsetDays: e.distance
  }));

  // ① 요청한 날짜 그대로
  const exact = await travelpayoutsPricesForDates({
    ...base,
    departure_at: departDate,
    ...(isRound ? { return_at: returnDate } : {}),
    limit: '30'
  }, 'exact');
  const exactRows = isRound ? exact.filter((r) => r && r.return_at) : exact;
  if (exactRows.length > 0) {
    console.log(`[travelpayouts] ${origin}→${destination} ${departDate}${isRound ? `~${returnDate}` : ''}: ${exactRows.length}건`);
    return { items: normalizeAll(exactRows.map((row) => ({ row, distance: 0 })), false), dateMatch: 'exact' };
  }

  // ② 가까운 날짜: 달마다 ⓐ 날짜별 최저가(grouped_prices, 출발일마다 1건)와 ⓑ 가격순 목록(prices_for_dates 100건, 같은 날 다른 편)을
  //    모아서 고른다. ⓐ가 실패하거나 늦으면(경고만 남김) ⓑ만으로 예전처럼 고른다.
  //    ⓐ·ⓑ와 두 달을 모두 함께 부른다(차례로 기다리면 외부 호출이 최대 5번 쌓여 화면의 30초 제한을 넘는다).
  //    ⓑ가 하나라도 실패하면 예전처럼 전체 실패(→ 예시 데이터). 모으는 순서는 달 순서, 달 안에서는 ⓐ 다음 ⓑ로 늘 같다.
  const monthParamsList = tpNearbyMonthQueries(departDate, returnDate, isRound, today)
    .map((q) => ({ departure_at: q.depMonth, ...(isRound ? { return_at: q.retMonth } : {}) }));
  const groupedJobs = monthParamsList.map((monthParams) => travelpayoutsGroupedPrices({ origin, destination, ...monthParams }, 'nearby-grouped')
    .catch(() => null)); // travelpayoutsGet이 경고를 남겼다 → 그 달은 가격순 목록만 쓴다
  const listJobs = monthParamsList.map((monthParams) => travelpayoutsPricesForDates({ ...base, ...monthParams, limit: '100' }, 'nearby'));
  const [groupedByMonth, listByMonth] = await Promise.all([Promise.all(groupedJobs), Promise.all(listJobs)]);
  const monthRows = [];
  let groupedCount = 0;
  monthParamsList.forEach((_, i) => {
    if (groupedByMonth[i]) {
      // 편도 요청에 왕복 운임(return_at 있음)이 섞이면 편도 가격으로 보이면 안 되므로 뺀다(왕복은 귀국일이 있는 것만).
      const usable = groupedByMonth[i].filter((r) => (isRound ? Boolean(r.return_at) : !r.return_at));
      groupedCount += usable.length;
      monthRows.push(...usable);
    }
    monthRows.push(...listByMonth[i]);
  });
  const picked = pickNearbyTravelpayoutsRows(monthRows, departDate, returnDate, isRound, today);
  console.log(`[travelpayouts] ${origin}→${destination} ${departDate}${isRound ? `~${returnDate}` : ''}: 요청 날짜 0건 → 가까운 날짜 ${picked.length}건 (날짜별 최저가 ${groupedCount}건 + 가격순 ${monthRows.length - groupedCount}건에서)`);
  // picked는 날짜 차이가 작은 순 → 맨 앞이 0이면 요청 날짜의 가격이 있다('exact', 안내 문구 없음. 다른 날짜 카드는 칩으로 표시)
  if (picked.length > 0) return { items: normalizeAll(picked, true), dateMatch: picked[0].distance === 0 ? 'exact' : 'nearby' };
  return { items: [], dateMatch: null };
}

function normalizeTravelpayoutsFlight(item, idx, tripType) {
  const depAt = item.departure_at || '';
  const retAt = item.return_at || '';
  const depDate = depAt.slice(0, 10);
  const depTime = depAt.slice(11, 16);
  const retDate = retAt.slice(0, 10);
  const retTime = retAt.slice(11, 16);
  const airline = item.airline || '';
  const flightNum = `${airline}${item.flight_number || ''}`;
  const transfers = Number(item.transfers || 0);
  const durationTo = Number(item.duration_to || item.duration || 0);
  const durationBack = Number(item.duration_back || 0);
  const returnTransfers = Number(item.return_transfers ?? transfers);
  const origin = tpToAirport(item.origin_airport || item.origin || '');
  const dest = tpToAirport(item.destination_airport || item.destination || '');
  // 캐시 가격 응답에는 도착 시각이 없어 출발 시각 + 소요 시간으로 계산한다(ICN·일본 모두 UTC+9).
  const depArrival = addMinutesToIsoClock(depAt, durationTo);
  const retArrival = addMinutesToIsoClock(retAt, durationBack);

  const outboundLeg = {
    legIndex: 0,
    from: origin,
    to: dest,
    date: depDate,
    departureTime: depTime,
    arrivalTime: depArrival,
    durationMin: durationTo,
    stops: transfers,
    airline,
    airlineCode: airline,
    segments: [{
      from: origin,
      to: dest,
      departureTime: depTime,
      arrivalTime: depArrival,
      airline,
      airlineCode: airline,
      flightNumber: flightNum,
      cabin: 'ECONOMY',
      cabinLabel: '\uC774\uCF54\uB178\uBBF8',
      baggageLabel: '\uC218\uD558\uBB3C \uC815\uBCF4 \uC5C6\uC74C'
    }],
    deeplink: '#'
  };

  const validLegs = [outboundLeg];
  if (tripType === 'roundtrip' && retAt) {
    validLegs.push({
      legIndex: 1,
      from: dest,
      to: origin,
      date: retDate,
      departureTime: retTime,
      arrivalTime: retArrival,
      durationMin: durationBack,
      stops: returnTransfers,
      airline,
      airlineCode: airline,
      segments: [{
        from: dest,
        to: origin,
        departureTime: retTime,
        arrivalTime: retArrival,
        airline,
        airlineCode: airline,
        flightNumber: '',
        cabin: 'ECONOMY',
        cabinLabel: '\uC774\uCF54\uB178\uBBF8',
        baggageLabel: '\uC218\uD558\uBB3C \uC815\uBCF4 \uC5C6\uC74C'
      }],
      deeplink: '#'
    });
  }

  const totalDurMin = validLegs.reduce((s, l) => s + l.durationMin, 0);
  const depMinute = depTime ? parseInt(depTime.split(':')[0]) * 60 + parseInt(depTime.split(':')[1] || 0) : 0;
  const priceKRW = Math.round(Number(item.price || 0));

  // 예약 링크 생성. KAYAK·Skyscanner는 예시 데이터와 같은 함수로(왕복이면 귀국일까지 넣는다. 예전에는 늘 편도 주소였다)
  const tpLink = item.link ? `https://www.aviasales.com${item.link}` : '#';
  const siteLinks = buildFlightDeeplinks(tripType, validLegs.map((l) => ({ from: l.from, to: l.to, date: l.date })));
  const kayakUrl = siteLinks.kayak;
  const ssUrl = siteLinks.skyscanner;

  return {
    id: `tp_${idx}`,
    tripType,
    provider: 'Travelpayouts',
    airlines: [airline].filter(Boolean),
    airports: [origin, dest].filter(Boolean),
    totalPriceKRW: priceKRW,
    totalDurationMin: totalDurMin,
    totalStops: transfers,
    departureMinute: depMinute,
    deeplinkKayak: kayakUrl,
    deeplinkSkyscanner: ssUrl,
    deeplink: tpLink,
    legs: validLegs
  };
}

// ── Rakuten Travel API (숙소) — 주소는 RAKUTEN_API_BASE(기본 openapi.rakuten.co.jp) ──

// 도시 중심 좌표 (Rakuten 좌표 기반 검색용)
const CITY_CENTER_COORDS = {
  tokyo:     { lat: 35.6812, lng: 139.7671 },
  osaka:     { lat: 34.7025, lng: 135.4959 },
  kyoto:     { lat: 35.0116, lng: 135.7681 },
  sapporo:   { lat: 43.0621, lng: 141.3544 },
  hakodate:  { lat: 41.7739, lng: 140.7265 },
  nagoya:    { lat: 35.1709, lng: 136.8815 },
  fukuoka:   { lat: 33.5904, lng: 130.4017 },
  hiroshima: { lat: 34.3963, lng: 132.4594 },
  sendai:    { lat: 38.2601, lng: 140.8822 },
  okinawa:   { lat: 26.3344, lng: 127.8056 },
  kanazawa:  { lat: 36.5781, lng: 136.6477 },
  kobe:      { lat: 34.6901, lng: 135.1956 },
  nagasaki:  { lat: 32.7503, lng: 129.8777 },
  kumamoto:  { lat: 32.7898, lng: 130.7417 },
  kagoshima: { lat: 31.5844, lng: 130.5413 },
  oita:      { lat: 33.2846, lng: 131.4914 },
  matsuyama: { lat: 33.8396, lng: 132.7658 },
  takamatsu: { lat: 34.3428, lng: 134.0466 },
  niigata:   { lat: 37.9161, lng: 139.0364 },
  okayama:   { lat: 34.6657, lng: 133.9183 },
  toyama:    { lat: 36.7013, lng: 137.2134 },
  shizuoka:  { lat: 34.9717, lng: 138.3889 },
  kochi:     { lat: 33.5597, lng: 133.5311 },
  tokushima: { lat: 34.0702, lng: 134.5514 },
  yamagata:  { lat: 38.2490, lng: 140.3281 },
  akita:     { lat: 39.7186, lng: 140.1024 },
  aomori:    { lat: 40.8246, lng: 140.7400 },
  fukushima: { lat: 37.7540, lng: 140.4598 },
  miyazaki:  { lat: 31.9111, lng: 131.4239 },
  obihiro:   { lat: 42.9236, lng: 143.1966 },
  nara:      { lat: 34.6851, lng: 135.8048 },
  kamakura:  { lat: 35.3192, lng: 139.5466 },
  hakone:    { lat: 35.2326, lng: 139.1070 },
  nikko:     { lat: 36.7500, lng: 139.5983 },
  // 이하: 나머지 도시의 대략적인 중심(시청·중심 역 부근). 지도 중심·거리 추정·Places 위치 편향용.
  asahikawa: { lat: 43.7707, lng: 142.3650 },
  hanamaki:  { lat: 39.3886, lng: 141.1169 },
  yonago:    { lat: 35.4281, lng: 133.3310 },
  izumo:     { lat: 35.3669, lng: 132.7547 },
  wakkanai:  { lat: 45.4156, lng: 141.6731 },
  rishiri:   { lat: 45.2420, lng: 141.2420 },
  memanbetsu: { lat: 44.0206, lng: 144.2733 },
  kushiro:   { lat: 42.9849, lng: 144.3820 },
  nakashibetsu: { lat: 43.5496, lng: 144.9714 },
  okadama:   { lat: 43.0763, lng: 141.3764 },
  misawa:    { lat: 40.6833, lng: 141.3694 },
  odate:     { lat: 40.2717, lng: 140.5647 },
  shonai:    { lat: 38.7275, lng: 139.8267 },
  ibaraki:   { lat: 36.3659, lng: 140.4714 },
  matsumoto: { lat: 36.2381, lng: 137.9720 },
  nanki_shirahama: { lat: 33.6781, lng: 135.3481 },
  tajima:    { lat: 35.5444, lng: 134.8203 },
  tottori:   { lat: 35.5011, lng: 134.2351 },
  iwakuni:   { lat: 34.1664, lng: 132.2192 },
  yamaguchi_ube: { lat: 33.9517, lng: 131.2467 },
  kitakyushu: { lat: 33.8834, lng: 130.8752 },
  saga:      { lat: 33.2494, lng: 130.2988 },
  amami:     { lat: 28.3772, lng: 129.4939 },
  yakushima: { lat: 30.4180, lng: 130.5690 },
  tanegashima: { lat: 30.7328, lng: 130.9975 },
  miyako:    { lat: 24.8055, lng: 125.2811 },
  ishigaki:  { lat: 24.3406, lng: 124.1556 },
  shimojishima: { lat: 24.8260, lng: 125.1450 },
  kumejima:  { lat: 26.3410, lng: 126.8050 },
  kita_daito: { lat: 25.9460, lng: 131.2990 },
  yonaguni:  { lat: 24.4680, lng: 123.0040 },
  tokunoshima: { lat: 27.8100, lng: 128.9300 }
};

let _rakutenLastCall = 0;

function redactRakutenKeys(text) {
  let s = String(text || '');
  for (const secret of [RAKUTEN_APP_ID, RAKUTEN_ACCESS_KEY]) {
    if (secret) s = s.split(secret).join('***');
  }
  return s;
}

// Rakuten 응답의 이미지 주소는 https만 쓴다(http면 https로 올림).
function httpsImageUrl(url) {
  const s = String(url || '').trim();
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return `https://${s.slice(7)}`;
  return null;
}

// 평점: 모든 공급자를 5점 만점으로 맞추고, 리뷰가 없으면 null(평점 없음)로 둔다.
function normalizeStayRating(value, scale = 5) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const five = scale === 10 ? n / 2 : n;
  return Math.round(Math.min(5, five) * 10) / 10;
}

// 반환: 숙소 배열(0건이면 []). 설정 없음·HTTP 오류·네트워크 오류는 ProviderError로 던진다.
async function fetchRakutenHotels(payload) {
  if (!RAKUTEN_APP_ID) throw new ProviderError('PROVIDER_UNAVAILABLE', 'rakuten app id missing');
  const cityInput = String(payload.city || '').trim() || 'tokyo';
  const cityKey = cityKeyByInput(cityInput);

  // 도시 좌표: 정적 표(62개 도시) → 동적 도시 중심 → 명소 좌표 → 공항 → 무료 지오코딩(open-meteo)
  // 반환: { items, dateMatch: 'exact'(요청 날짜 빈방·요금) | 'none'(날짜 조건 없는 목록·최저가) }
  const loc = await resolveCityCoordsForInput(cityInput);
  if (!loc) return { items: [], dateMatch: 'exact' };

  // Rate limit: 1 req/sec
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - _rakutenLastCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _rakutenLastCall = Date.now();

  const checkIn = normalizeIsoDate(payload.checkIn) || new Date().toISOString().slice(0, 10);
  const checkOutRaw = normalizeIsoDate(payload.checkOut);
  const checkOut = checkOutRaw && checkOutRaw > checkIn ? checkOutRaw : addDaysIso(checkIn, 1);
  const adults = Number(payload.guests) || 2;
  const rooms = Number(payload.rooms) || 1;

  const params = new URLSearchParams({
    applicationId: RAKUTEN_APP_ID,
    format: 'json',
    formatVersion: '2',
    checkinDate: checkIn,
    checkoutDate: checkOut,
    adultNum: String(Math.min(adults, 10)),
    roomNum: String(Math.min(rooms, 10)),
    // 최저가순(+roomCharge)으로 20건만 받으면 도심 3km 안의 호스텔·캡슐만 남아서, 기본 정렬로 30건을 받아 서버에서 순위를 매긴다.
    hits: '30',
    sort: 'standard',
    responseType: 'large',
    datumType: '1',
    latitude: String(loc.lat),
    longitude: String(loc.lng),
    searchRadius: '3'
  });
  if (RAKUTEN_ACCESS_KEY) params.set('accessKey', RAKUTEN_ACCESS_KEY);

  // Rakuten 앱 설정의 "허용 사이트"와 맞아야 응답하므로 운영 주소를 Referer/Origin으로 붙인다(서버 호출 전용).
  // 도메인을 바꾸면 Rakuten 앱 설정의 허용 사이트도 함께 바꿔야 한다.
  const rakutenHeaders = {
    'Referer': 'https://japanjapantravel.onrender.com/',
    'Origin': 'https://japanjapantravel.onrender.com'
  };
  const normalizedPayload = { ...payload, checkIn, checkOut };

  let res;
  try {
    const rakutenUrl = `${RAKUTEN_API_BASE}/VacantHotelSearch/20170426?${params}`;
    console.log('[rakuten] VacantHotelSearch request:', { city: cityKey, checkIn, checkOut, lat: loc.lat, lng: loc.lng });
    res = await fetchWithTimeout(rakutenUrl, { headers: rakutenHeaders }, AI_REQUEST_TIMEOUT_MS);
    if (res.ok) {
      const data = await res.json();
      const result = normalizeRakutenVacant(data, normalizedPayload);
      console.log('[rakuten] VacantHotelSearch result:', result.length, 'hotels (raw hotels:', (data.hotels || []).length, ')');
      return { items: result, dateMatch: 'exact' };
    }
    // 빈 결과는 404(not_found)로 온다. 날짜 없는 SimpleHotelSearch로 한 번 더 찾는다.
    const errBody = await res.text().catch(() => '');
    if (res.status !== 404) {
      warnThrottled(`rakuten:vacant:${res.status}`, `[rakuten] VacantHotelSearch → HTTP ${res.status} ${redactRakutenKeys(errBody).replace(/\s+/g, ' ').slice(0, 200)}`);
    }
    params.delete('checkinDate');
    params.delete('checkoutDate');
    params.delete('adultNum');
    params.delete('roomNum');
    const res2 = await fetchWithTimeout(`${RAKUTEN_API_BASE}/SimpleHotelSearch/20170426?${params}`, { headers: rakutenHeaders }, AI_REQUEST_TIMEOUT_MS);
    // 날짜 조건이 없는 결과라 그 날짜의 빈방·요금이 아니다(hotelMinCharge 기준 최저가).
    if (res2.ok) return { items: normalizeRakutenSimple(await res2.json(), normalizedPayload), dateMatch: 'none' };
    if (res2.status === 404) return { items: [], dateMatch: 'none' };
    const errBody2 = await res2.text().catch(() => '');
    warnThrottled(`rakuten:simple:${res2.status}`, `[rakuten] SimpleHotelSearch → HTTP ${res2.status} ${redactRakutenKeys(errBody2).replace(/\s+/g, ' ').slice(0, 200)}`);
    throw new ProviderError('PROVIDER_UNAVAILABLE', `rakuten HTTP ${res2.status}`);
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    warnThrottled('rakuten:network', `[rakuten] 요청 실패(네트워크/타임아웃): ${err?.cause?.code || err?.message || err}`);
    throw new ProviderError('PROVIDER_UNAVAILABLE', 'rakuten network error');
  }
}


// Rakuten deeplink: always use original JP URL (works for all languages)
function rakutenDeeplink(hotelNo, originalUrl, lang) {
  return originalUrl || (hotelNo ? `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotelNo}/` : '#');
}

// Rakuten amenity labels by language
function rakutenAmenities(breakfastFlag, dinnerFlag, parkingInfo, lang) {
  const am = [];
  const L = {
    ko: { breakfast: '조식 포함', dinner: '석식 포함', parking: '주차 가능', wifi: '무료 Wi-Fi' },
    en: { breakfast: 'Breakfast included', dinner: 'Dinner included', parking: 'Parking available', wifi: 'Free Wi-Fi' },
    ja: { breakfast: '朝食付き', dinner: '夕食付き', parking: '駐車場あり', wifi: '無料Wi-Fi' }
  };
  const l = L[lang] || L.ko;
  if (breakfastFlag) am.push(l.breakfast);
  if (dinnerFlag) am.push(l.dinner);
  if (parkingInfo && !/なし|無/.test(parkingInfo)) am.push(l.parking);
  am.push(l.wifi);
  return am;
}

function normalizeRakutenVacant(data, payload) {
  const hotels = data.hotels || [];
  const lang = payload.lang || 'ko';
  const checkIn = payload.checkIn || new Date().toISOString().slice(0, 10);
  const checkOut = payload.checkOut || (() => { const d = new Date(checkIn); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
  const rooms = Number(payload.rooms) || 1;
  const guests = Number(payload.guests) || 2;
  const cityKey = cityKeyByInput(payload.city);
  const city = CITY_DATA[cityKey] || buildGenericCity(cityKey);

  return hotels.map((h, idx) => {
    // formatVersion=2: h is array [{hotelBasicInfo}, {hotelDetailInfo}, ...{roomInfo}]
    // formatVersion=1: h is {hotel: [{hotelBasicInfo}, ...]}
    const hotelArr = Array.isArray(h) ? h : (h.hotel || [h]);
    const basic = hotelArr[0]?.hotelBasicInfo || h.hotelBasicInfo || {};
    const roomInfoArr = hotelArr.slice(1) || [];
    let cheapestCharge = Infinity;
    let cheapestRoom = null;
    let breakfastFlag = false;
    let dinnerFlag = false;
    let reserveUrl = '';

    for (const ri of roomInfoArr) {
      const rBasic = ri.roomInfo?.[0]?.roomBasicInfo;
      const rCharge = ri.roomInfo?.[1]?.dailyCharge;
      if (rBasic && rCharge) {
        const total = Number(rCharge.total || rCharge.rakutenCharge || Infinity);
        if (total < cheapestCharge) {
          cheapestCharge = total;
          cheapestRoom = rBasic;
          breakfastFlag = rBasic.withBreakfastFlag === 1;
          dinnerFlag = rBasic.withDinnerFlag === 1;
          reserveUrl = rBasic.reserveUrl || '';
        }
      }
    }

    const priceJPY = cheapestCharge < Infinity ? cheapestCharge : (basic.hotelMinCharge || 8000);
    const pricePerNightKRW = Math.round(convertToKRW(priceJPY, 'JPY'));
    const totalPriceKRW = pricePerNightKRW * nights * rooms;

    const amenities = rakutenAmenities(breakfastFlag, dinnerFlag, basic.parkingInformation, lang);

    const nameKo = basic.hotelName || (lang === 'en' ? 'Unknown' : lang === 'ja' ? '\u540D\u79F0\u4E0D\u660E' : '\uC774\uB984 \uC5C6\uC74C');
    const isRyokan = /\u65C5\u9928|\u6E29\u6CC9|\u308A\u3087\u304B\u3093|\u304A\u5BBF/.test(nameKo) || dinnerFlag;
    const typeKey = isRyokan ? 'ryokan' : 'hotel';
    const typeLabel = isRyokan ? (lang === 'en' ? 'Ryokan' : lang === 'ja' ? '\u65C5\u9928' : '\uB8CC\uCE78') : (lang === 'en' ? 'Hotel' : lang === 'ja' ? '\u30DB\u30C6\u30EB' : '\uD638\uD154');
    const rating = normalizeStayRating(basic.reviewAverage, 5); // Rakuten 리뷰 평균(5점 만점), 리뷰 없으면 null
    const area = lang === 'ko' ? (koreanizeAddress(basic.address1 + (basic.address2 || ''), city?.label || '') || city?.areas?.[0] || '') : (basic.address1 || '') + (basic.address2 ? ' ' + basic.address2 : '');

    return {
      id: `rakuten_${basic.hotelNo || idx}`,
      name: nameKo,
      provider: 'Rakuten',
      type: typeKey,
      typeLabel,
      area,
      rating,
      rated: rating !== null,
      ratingScale: 5,
      reviewCount: Number(basic.reviewCount || 0),
      guests,
      rooms,
      checkIn,
      checkOut,
      nights,
      pricePerNightKRW,
      totalPriceKRW,
      amenities,
      aiScore: Math.round((rating ?? 3.5) * 200 - (pricePerNightKRW / 1200)),
      deeplink: rakutenDeeplink(basic.hotelNo, basic.planListUrl || basic.hotelInformationUrl || reserveUrl, lang),
      imageUrl: httpsImageUrl(basic.hotelImageUrl) || httpsImageUrl(basic.hotelThumbnailUrl),
      nearestStation: cleanPlaceText(basic.nearestStation, 60),
      access: cleanPlaceText(basic.access, 160)
    };
  }).filter(h => h.pricePerNightKRW > 0);
}

function normalizeRakutenSimple(data, payload) {
  const hotels = data.hotels || [];
  const lang = payload.lang || 'ko';
  const checkIn = payload.checkIn || new Date().toISOString().slice(0, 10);
  const checkOut = payload.checkOut || (() => { const d = new Date(checkIn); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
  const rooms = Number(payload.rooms) || 1;
  const guests = Number(payload.guests) || 2;
  const cityKey = cityKeyByInput(payload.city);
  const city = CITY_DATA[cityKey] || buildGenericCity(cityKey);

  return hotels.map((h, idx) => {
    const basic = (Array.isArray(h) ? h : (h.hotel || [h]))[0]?.hotelBasicInfo || h.hotelBasicInfo || {};
    const priceJPY = basic.hotelMinCharge || 8000;
    const pricePerNightKRW = Math.round(convertToKRW(priceJPY, 'JPY'));
    const totalPriceKRW = pricePerNightKRW * nights * rooms;
    const nameKo = basic.hotelName || (lang === 'en' ? 'Unknown' : lang === 'ja' ? '\u540D\u79F0\u4E0D\u660E' : '\uC774\uB984 \uC5C6\uC74C');
    const isRyokan = /\u65C5\u9928|\u6E29\u6CC9|\u308A\u3087\u304B\u3093|\u304A\u5BBF/.test(nameKo);
    const rating = normalizeStayRating(basic.reviewAverage, 5);
    const area = lang === 'ko' ? (koreanizeAddress(basic.address1 + (basic.address2 || ''), city?.label || '') || city?.areas?.[0] || '') : (basic.address1 || '') + (basic.address2 ? ' ' + basic.address2 : '');

    return {
      id: `rakuten_${basic.hotelNo || idx}`,
      name: nameKo,
      provider: 'Rakuten',
      type: isRyokan ? 'ryokan' : 'hotel',
      typeLabel: isRyokan ? (lang === 'en' ? 'Ryokan' : lang === 'ja' ? '\u65C5\u9928' : '\uB8CC\uCE78') : (lang === 'en' ? 'Hotel' : lang === 'ja' ? '\u30DB\u30C6\u30EB' : '\uD638\uD154'),
      area,
      rating,
      rated: rating !== null,
      ratingScale: 5,
      reviewCount: Number(basic.reviewCount || 0),
      guests, rooms, checkIn, checkOut, nights,
      pricePerNightKRW,
      totalPriceKRW,
      amenities: rakutenAmenities(false, false, null, lang),
      aiScore: Math.round((rating ?? 3.5) * 200 - (pricePerNightKRW / 1200)),
      dateMatch: 'none', // 요청 날짜의 빈방·요금이 아님
      priceBasis: 'min_charge', // 숙소 최저가(hotelMinCharge) 기준
      deeplink: rakutenDeeplink(basic.hotelNo, basic.planListUrl || basic.hotelInformationUrl, lang),
      imageUrl: httpsImageUrl(basic.hotelImageUrl) || httpsImageUrl(basic.hotelThumbnailUrl),
      nearestStation: cleanPlaceText(basic.nearestStation, 60),
      access: cleanPlaceText(basic.access, 160)
    };
  }).filter(h => h.pricePerNightKRW > 0);
}

function buildLegCandidates(leg, index) {
  const airlines = ['Korean Air', 'Asiana', 'Jin Air', 'Peach', 'ANA'];
  const providers = ['Skyscanner', 'KAYAK', 'Skyscanner', 'KAYAK', 'Skyscanner'];
  const bases = [
    { departureTime: '08:35', durationMin: 140, stops: 0, priceKRW: 355000 },
    { departureTime: '10:20', durationMin: 150, stops: 0, priceKRW: 325000 },
    { departureTime: '13:55', durationMin: 170, stops: 0, priceKRW: 298000 },
    { departureTime: '17:40', durationMin: 235, stops: 1, priceKRW: 262000 },
    { departureTime: '21:10', durationMin: 165, stops: 0, priceKRW: 341000 }
  ];

  return bases.map((b, i) => ({
    legIndex: index,
    provider: providers[i],
    airline: airlines[i],
    from: leg.from,
    to: leg.to,
    date: leg.date,
    departureTime: b.departureTime,
    durationMin: b.durationMin,
    arrivalTime: `${String(Math.floor((toMinutes(b.departureTime) + b.durationMin) / 60) % 24).padStart(2, '0')}:${String((toMinutes(b.departureTime) + b.durationMin) % 60).padStart(2, '0')}`,
    stops: b.stops,
    priceKRW: b.priceKRW + (index * 18000),
    deeplink: providers[i] === 'KAYAK'
      ? `https://www.kayak.com/flights/${leg.from}-${leg.to}/${leg.date}`
      : `https://www.skyscanner.co.kr/transport/flights/${leg.from.toLowerCase()}/${leg.to.toLowerCase()}/${skyscannerDateKey(leg.date)}/`
  }));
}

function flightCandidates(payload) {
  const from = normalizeIata(payload.from) || 'ICN';
  const to = flightDestinationAirport(payload);
  const departDate = normalizeIsoDate(payload.departDate) || new Date().toISOString().slice(0, 10);
  const tripType = payload.tripType || 'oneway';

  let legs = [{ from, to, date: departDate }];
  if (tripType === 'roundtrip') {
    const returnDate = normalizeIsoDate(payload.returnDate) || getDateOffset(departDate, 3);
    legs = [{ from, to, date: departDate }, { from: to, to: from, date: returnDate }];
  } else if (tripType === 'multicity') {
    const candidate = Array.isArray(payload.multiSegments) ? payload.multiSegments : [];
    const normalized = candidate
      .map((s) => ({
        from: String(s.from || '').toUpperCase(),
        to: String(s.to || '').toUpperCase(),
        date: String(s.date || '')
      }))
      .filter((s) => s.from && s.to && s.date);
    legs = normalized.length >= 2 ? normalized.slice(0, 4) : legs;
  }

  const byLeg = legs.map((leg, idx) => buildLegCandidates(leg, idx));
  let combinations;
  if (tripType === 'multicity') {
    // Multicity는 구간별 후보를 무작위 교차조합하지 않고 패키지 형태로 묶어서 보여준다.
    const minCount = Math.max(1, Math.min(...byLeg.map((x) => x.length)));
    const bundled = [];
    for (let i = 0; i < minCount; i += 1) {
      bundled.push(byLeg.map((list) => list[i]));
    }
    for (let i = 0; i < minCount; i += 1) {
      bundled.push(byLeg.map((list, legIdx) => list[(i + legIdx) % list.length]));
    }
    const seen = new Set();
    combinations = bundled.filter((combo) => {
      const key = combo.map((x) => `${x.legIndex}-${x.airline}-${x.departureTime}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else {
    combinations = byLeg.reduce((acc, list) => {
      if (acc.length === 0) return list.map((x) => [x]);
      const next = [];
      for (const base of acc) {
        for (const item of list) {
          if (base.length >= 1 && base[base.length - 1].date > item.date) continue;
          next.push([...base, item]);
        }
      }
      return next;
    }, []);
  }

  return combinations.slice(0, 36).map((combo, idx) => {
    const totalPrice = combo.reduce((s, x) => s + x.priceKRW, 0);
    const totalDurationMin = combo.reduce((s, x) => s + x.durationMin, 0);
    const totalStops = combo.reduce((s, x) => s + x.stops, 0);
    const airlines = Array.from(new Set(combo.map((x) => x.airline)));
    const airports = Array.from(new Set(combo.flatMap((x) => [x.from, x.to])));
    const providers = Array.from(new Set(combo.map((x) => x.provider)));
    const deeplinks = buildFlightDeeplinks(tripType, combo);
    return {
      id: `itin_${idx + 1}`,
      sample: true, // 예시(더미) 데이터 — 실제 가격 아님
      tripType,
      provider: providers.length === 1 ? providers[0] : 'Mixed',
      airlines,
      airports,
      totalPriceKRW: totalPrice,
      totalDurationMin,
      totalStops,
      departureMinute: toMinutes(combo[0].departureTime),
      deeplinkKayak: deeplinks.kayak,
      deeplinkSkyscanner: deeplinks.skyscanner,
      legs: combo
    };
  });
}

function applyFlightFilters(items, filters = {}) {
  const minPrice = Number(filters.minPrice || 0);
  const maxPrice = Number(filters.maxPrice || 10000000);
  const minHour = Number(filters.departHourMin ?? 0);
  const maxHour = Number(filters.departHourMax ?? 23);
  const airports = Array.isArray(filters.airports) ? filters.airports.map((x) => String(x).toUpperCase()) : [];
  const airlines = Array.isArray(filters.airlines) ? filters.airlines.map((x) => String(x).toLowerCase()) : [];

  return items.filter((x) => {
    if (x.totalPriceKRW < minPrice || x.totalPriceKRW > maxPrice) return false;
    const legs = Array.isArray(x.legs) ? x.legs : [];
    if (legs.length > 0) {
      const hourOk = legs.every((l) => {
        const depHour = Math.floor(toMinutes(l.departureTime) / 60);
        return depHour >= minHour && depHour <= maxHour;
      });
      if (!hourOk) return false;
    } else {
      const depHour = Math.floor(x.departureMinute / 60);
      if (depHour < minHour || depHour > maxHour) return false;
    }
    if (airports.length > 0 && !x.airports.some((a) => airports.includes(a))) return false;
    if (airlines.length > 0 && !x.airlines.some((a) => airlines.includes(String(a).toLowerCase()))) return false;
    return true;
  });
}

function rankFlights(payload) {
  const preference = payload.preference || 'balanced';
  const base = Array.isArray(payload._candidates) ? payload._candidates : flightCandidates(payload);
  const filtered = applyFlightFilters(base, payload.filters);
  return filtered
    .map((f) => {
      let score;
      if (preference === 'cheap') score = 1000000 - f.totalPriceKRW - f.totalStops * 50000;
      else if (preference === 'fast') score = 1000000 - f.totalDurationMin * 180 - f.totalStops * 50000;
      else score = 1000000 - f.totalPriceKRW * 0.7 - f.totalDurationMin * 260 - f.totalStops * 45000;
      // 가까운 날짜 결과는 요청 날짜에서 하루 멀어질 때마다 점수를 깎아 가까운 날짜가 먼저 오게 한다.
      score -= Math.max(0, Number(f.dateOffsetDays) || 0) * 30000;

      return {
        ...f,
        aiScore: Math.round(score),
        reason: preference === 'cheap' ? '최저가 중심 랭킹' : preference === 'fast' ? '최단시간 중심 랭킹' : '가격/시간 균형 랭킹'
      };
    })
    .sort((a, b) => b.aiScore - a.aiScore);
}

function dateDiffNights(checkIn, checkOut) {
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) return 1;
  const diff = Math.ceil((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
}

function stayCandidates(payload) {
  const cityKey = cityKeyByInput(payload.city || 'tokyo');
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const checkIn = payload.checkIn || new Date().toISOString().slice(0, 10);
  const checkOut = payload.checkOut || getDateOffset(checkIn, 2);
  const guests = Math.max(1, Number(payload.guests || 2));
  const rooms = Math.max(1, Number(payload.rooms || 1));
  const nights = dateDiffNights(checkIn, checkOut);

  const lang = normalizeLang(payload.lang);
  const providers = ['Agoda', 'Booking', 'Expedia', 'Trip.com', 'Hotels.com'];
  const amenities = ['조식 포함', '무료 Wi-Fi', '온천', '야외 수영장', '피트니스', '공항 셔틀'].map((a) => mockStayText('amenities', a, lang));
  const types = [
    { key: 'hotel', label: mockStayText('types', '호텔', lang), price: 1.0 },
    { key: 'ryokan', label: mockStayText('types', '료칸', lang), price: 1.5 },
    { key: 'apartment', label: mockStayText('types', '레지던스', lang), price: 1.2 },
    { key: 'guesthouse', label: mockStayText('types', '게스트하우스', lang), price: 0.75 }
  ];

  // 예시 숙소 이름: "<도시> 그랜드 호텔" (en/ja는 도시 이름·숙소 이름 모두 해당 언어로)
  const cityName = lang === 'ko' ? city.label : localizedCityName(cityKey, lang);
  const baseNames = ['그랜드 호텔', '센트럴 스테이', '파노라마 료칸', '시티 레지던스', '마켓 하우스', '리버사이드',
    '미드타운 호텔', '가든 스테이', '아카데미아', '스카이뷰 스테이', '모던 하우스', '힐탑 숙소']
    .map((n) => `${cityName} ${mockStayText('names', n, lang)}`);

  return baseNames.map((name, idx) => {
    const type = types[idx % types.length];
    const provider = providers[idx % providers.length];
    const area = city.areas[idx % city.areas.length];
    // 예시 데이터 평점도 실데이터와 같은 5점 만점(3.6~4.7)
    const rating = normalizeStayRating(7.2 + ((idx % 8) * 0.3), 10);
    const basePrice = 65000 + (idx % 6) * 28000;
    const pricePerNightKRW = Math.round(basePrice * type.price + (guests - 2) * 8000 + (rooms - 1) * 20000);
    const totalPriceKRW = pricePerNightKRW * nights * rooms;
    const amenityPack = amenities.filter((_, i) => (i + idx) % 2 === 0).slice(0, 3);
    const aiScore = Math.round((rating * 200) - (pricePerNightKRW / 1200));
    return {
      id: `stay_${idx + 1}`,
      name,
      provider,
      type: type.key,
      typeLabel: type.label,
      area,
      rating,
      rated: true,
      ratingScale: 5,
      sample: true,
      guests,
      rooms,
      checkIn,
      checkOut,
      nights,
      pricePerNightKRW,
      totalPriceKRW,
      amenities: amenityPack,
      aiScore,
      deeplink: provider === 'Booking'
        ? `https://www.booking.com/searchresults.ko.html?ss=${encodeURIComponent(city.label)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${guests}&no_rooms=${rooms}&group_children=0`
        : provider === 'Agoda'
          ? `https://www.agoda.com/ko-kr/search?city=${encodeURIComponent(city.label)}&checkIn=${checkIn}&checkOut=${checkOut}&adult=${guests}&rooms=${rooms}`
          : provider === 'Trip.com'
            ? `https://kr.trip.com/hotels/?keyword=${encodeURIComponent(city.label)}&checkin=${checkIn}&checkout=${checkOut}&adult=${guests}&room=${rooms}`
            : provider === 'Hotels.com'
              ? `https://kr.hotels.com/Hotel-Search?destination=${encodeURIComponent(city.label)}&start-date=${checkIn}&end-date=${checkOut}&adults=${guests}&rooms=${rooms}`
              : `https://www.expedia.co.kr/Hotel-Search?destination=${encodeURIComponent(city.label)}&startDate=${checkIn}&endDate=${checkOut}&adults=${guests}&rooms=${rooms}`
    };
  });
}

function applyStayFilters(items, filters = {}) {
  const minPrice = Number(filters.minPrice || 0);
  const maxPrice = Number(filters.maxPrice || 10000000);
  const minRating = Number(filters.minRating || 0);
  const stayType = String(filters.stayType || '');
  const providers = Array.isArray(filters.providers) ? filters.providers.map((x) => String(x)) : [];
  const amenities = Array.isArray(filters.amenities) ? filters.amenities.map((x) => String(x)) : [];

  return items.filter((x) => {
    if (x.pricePerNightKRW < minPrice || x.pricePerNightKRW > maxPrice) return false;
    // 평점 없음(null)은 나쁜 평점이 아니므로 최소 평점 조건으로 걸러내지 않는다(평점순에서는 맨 뒤).
    if (minRating > 0 && Number.isFinite(x.rating) && x.rating < minRating) return false;
    if (stayType && x.type !== stayType) return false;
    if (providers.length > 0 && !providers.includes(x.provider)) return false;
    if (amenities.length > 0 && !amenities.every((a) => x.amenities.includes(a))) return false;
    return true;
  });
}

function rankStays(payload) {
  const preference = payload.preference || 'balanced';
  const base = Array.isArray(payload._candidates) ? payload._candidates : stayCandidates(payload);
  const filtered = applyStayFilters(base, payload.filters);
  const aiHints = payload.aiHints || {};
  const preferredAreas = Array.isArray(aiHints.preferredAreas) ? aiHints.preferredAreas.map((x) => String(x)) : [];
  const preferAirportAccess = Boolean(aiHints.preferAirportAccess);
  const oceanViewStay = Boolean(aiHints.oceanViewStay);
  const safeAreaPriority = Boolean(aiHints.safeAreaPriority);
  const cityKey = cityKeyByInput(payload.city || 'tokyo');
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const airportCode = String(aiHints.arrivalAirport || city.airport || '').toUpperCase();
  const airportMatchBoost = city.airport === airportCode ? 22000 : 0;

  return filtered
    .map((x) => {
      let score;
      // 평점은 5점 만점. 평점 없음은 균형 점수에서 중간값(3.5), 평점순에서는 0으로 본다.
      const rated = Number.isFinite(x.rating);
      if (preference === 'price') score = 1000000 - x.pricePerNightKRW * 6 - x.totalPriceKRW * 0.3;
      else if (preference === 'rating') score = 1000000 + (rated ? x.rating : 0) * 4000 - x.pricePerNightKRW * 4;
      else score = 1000000 + (rated ? x.rating : 3.5) * 2400 - x.pricePerNightKRW * 5;
      if (preferredAreas.length > 0 && preferredAreas.some((area) => String(x.area || '').includes(area))) {
        score += 65000;
      }
      if (preferAirportAccess && (x.amenities || []).some((a) => /공항 셔틀|airport shuttle|空港シャトル/i.test(String(a)))) {
        score += 28000;
      }
      if (oceanViewStay && (x.amenities || []).some((a) => /오션뷰|바다/.test(String(a)))) {
        score += 30000;
      }
      if (safeAreaPriority && (x.amenities || []).some((a) => /24시간|보안|프론트/.test(String(a)))) {
        score += 26000;
      }
      score += airportMatchBoost;
      return { ...x, aiScore: Math.round(score) };
    })
    .sort((a, b) => b.aiScore - a.aiScore);
}

// 키 없는 무료 환율 출처 두 곳을 차례로 시도한다. 둘 다 실패하면 이전 실시간 값(없으면 FX_* 또는 대략값)을 그대로 쓴다.
const FX_SOURCES = [
  {
    provider: 'open.er-api',
    url: 'https://open.er-api.com/v6/latest/JPY',
    parse: (d) => ({ krw: d?.rates?.KRW, usd: d?.rates?.USD, at: d?.time_last_update_utc })
  },
  {
    // 옛 api.frankfurter.app은 301로 넘어가고 v1은 지원 중단 예정이라 v2를 쓴다. v2 기본값은 여러 기관 값을 섞으므로
    // providers=ecb로 예전과 같은 유럽중앙은행 기준 환율만 받는다. 응답은 [{ date, base, quote, rate }] 배열.
    provider: 'frankfurter',
    url: 'https://api.frankfurter.dev/v2/rates?base=JPY&quotes=KRW,USD&providers=ecb',
    parse: (d) => {
      const rows = Array.isArray(d) ? d : [];
      const rate = (quote) => rows.find((r) => String(r?.quote || '').toUpperCase() === quote)?.rate;
      return { krw: rate('KRW'), usd: rate('USD'), at: rows[0]?.date };
    }
  }
];

async function refreshFxRate() {
  for (const src of FX_SOURCES) {
    try {
      const res = await fetchWithTimeout(src.url, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } }, 8000);
      if (!res.ok) {
        warnThrottled(`fx:${src.provider}`, `[FX] ${src.provider} HTTP ${res.status}`);
        continue;
      }
      const parsed = src.parse(await res.json());
      const krwRate = Number(parsed.krw || 0);
      const usdRate = Number(parsed.usd || 0);
      if (!(krwRate > 0) || !(usdRate > 0)) {
        warnThrottled(`fx:${src.provider}`, `[FX] ${src.provider} 응답에 KRW/USD 환율이 없습니다.`);
        continue;
      }
      fxJpyKrw = krwRate;
      fxUsdKrw = krwRate / usdRate;
      fxLastUpdate = String(parsed.at || new Date().toISOString());
      fxSource = 'live';
      fxProvider = src.provider;
      fxLiveAt = Date.now();
      console.log(`[FX] JPY/KRW: ${fxJpyKrw.toFixed(2)}, USD/KRW: ${fxUsdKrw.toFixed(0)}, updated: ${fxLastUpdate} (${src.provider})`);
      return;
    } catch (err) {
      warnThrottled(`fx:${src.provider}`, `[FX] ${src.provider} 조회 실패: ${err?.cause?.code || err?.message || err}`);
    }
  }
  if (fxSource !== 'live') {
    warnThrottled('fx:fallback', `[FX] 실시간 환율을 받지 못해 ${fxSource === 'env' ? 'FX_USD_KRW·FX_JPY_KRW 설정값' : '대략값'}을 씁니다 (JPY/KRW ${fxJpyKrw}, USD/KRW ${Math.round(fxUsdKrw)}).`);
  }
}

refreshFxRate();
const fxTimer = setInterval(refreshFxRate, 12 * 60 * 60 * 1000);
if (typeof fxTimer.unref === 'function') fxTimer.unref();

function normalizePriceLevel(level) {
  if (level === null || level === undefined) return null;
  if (typeof level === 'number' && Number.isFinite(level)) {
    const rounded = Math.round(level);
    return Math.min(4, Math.max(1, rounded));
  }
  const map = {
    PRICE_LEVEL_UNSPECIFIED: null,
    PRICE_LEVEL_FREE: 1,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4
  };
  return Object.prototype.hasOwnProperty.call(map, level) ? map[level] : null;
}

function scoreFoodFit(score, priceLevel, budget) {
  const baseScore = Number.isFinite(score) ? score : 3.6;
  const ratingPart = (baseScore / 5) * 40;
  const reviewPart = 20;
  const proximityPart = 15;
  const bonusPart = 10;
  return Math.round(Math.min(100, ratingPart + reviewPart + proximityPart + bonusPart));
}

const FOOD_GENRE_SYNONYMS = {
  '스시': ['스시', '초밥', 'sushi', '寿司'],
  '라멘': ['라멘', 'ramen', '拉麺'],
  '교자': ['교자', 'gyoza', '餃子', '만두'],
  '오코노미야키': ['오코노미야키', 'okonomiyaki', 'お好み焼き'],
  '타코야키': ['타코야키', 'takoyaki', 'たこ焼き'],
  '우동': ['우동', 'udon', 'うどん'],
  '소바': ['소바', 'soba', 'そば'],
  '장어덮밥': ['장어', '히츠마부시', 'unagi', 'eel', 'うなぎ']
};


// 'ramen'·'寿司' 같은 다른 언어 장르를 한국어 대표 장르('라멘'·'스시')로 맞춘다. 모르면 그대로.
function canonicalFoodGenre(genre) {
  const g = String(genre || '').trim();
  if (!g || FOOD_GENRE_SYNONYMS[g]) return g;
  const low = g.toLowerCase();
  for (const [ko, list] of Object.entries(FOOD_GENRE_SYNONYMS)) {
    if (list.some((t) => String(t).toLowerCase() === low)) return ko;
  }
  return g;
}

function genreTokens(genre) {
  const g = canonicalFoodGenre(genre);
  if (!g) return [];
  const direct = FOOD_GENRE_SYNONYMS[g];
  if (direct) return direct;
  return [g];
}

function isGenreMatchFoodName(name, genre) {
  const tokens = genreTokens(genre);
  if (tokens.length === 0) return true;
  const lower = String(name || '').toLowerCase();
  return tokens.some((t) => lower.includes(String(t).toLowerCase()));
}


// Extract today's opening hours as readable string
function formatTodayHours(hoursObj) {
  if (!hoursObj) return null;
  // currentOpeningHours has periods array with open/close times
  const periods = hoursObj.periods;
  if (!periods || periods.length === 0) {
    // Try weekdayDescriptions
    const descs = hoursObj.weekdayDescriptions;
    if (descs && descs.length > 0) {
      const today = new Date().getDay(); // 0=Sun
      const idx = today === 0 ? 6 : today - 1; // weekdayDescriptions: Mon=0
      return descs[idx] || null;
    }
    return null;
  }
  // Find today's period
  const now = new Date();
  const todayDay = now.getDay(); // 0=Sun, 1=Mon...
  const todayPeriods = periods.filter(p => {
    const openDay = p.open?.day;
    return openDay === todayDay;
  });
  if (todayPeriods.length === 0) return null;
  return todayPeriods.map(p => {
    const oh = String(p.open?.hour ?? 0).padStart(2, '0');
    const om = String(p.open?.minute ?? 0).padStart(2, '0');
    const ch = String(p.close?.hour ?? 23).padStart(2, '0');
    const cm = String(p.close?.minute ?? 59).padStart(2, '0');
    return `${oh}:${om}-${ch}:${cm}`;
  }).join(', ');
}

async function fetchPlacesWithGoogle(query, lat, lng, genre, budget, queryOverride = '', maxResultCount = 20, lang = 'ko') {
  const cleanGenre = String(genre || '').trim();
  const textQuery = String(queryOverride || '').trim() || (cleanGenre ? `${query} ${cleanGenre} 맛집` : `${query} 일본 맛집`);
  const body = {
    textQuery,
    maxResultCount: Math.max(5, Math.min(20, Number(maxResultCount) || 15)),
    languageCode: lang || 'ko',
    regionCode: 'JP'
  };

  if (lat && lng) {
    body.locationBias = {
      circle: {
        center: { latitude: Number(lat), longitude: Number(lng) },
        radius: 8000
      }
    };
  }

  const fieldMask = 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType,places.priceLevel,places.location,places.photos,places.currentOpeningHours';
  const cacheKey = `foods|${lang || 'ko'}|${textQuery}|${lat ? Number(lat).toFixed(3) : '-'},${lng ? Number(lng).toFixed(3) : '-'}|${body.maxResultCount}`;
  let rawPlaces = placesCacheGet(cacheKey);
  if (!rawPlaces) {
    // 실패 시 GoogleApiError(reasonCode 포함)를 그대로 던진다.
    rawPlaces = await googlePlacesSearchText(body, fieldMask, 'places:foodSearch');
    placesCacheSet(cacheKey, rawPlaces);
  }
  const jpPlaces = rawPlaces.filter((p) => {
    const addr = String(p.formattedAddress || '');
    if (/한국|대한민국|South Korea|Korea|서울|부산|대구|인천|China|中国|台湾|Taiwan|Thailand|Vietnam|Philippines/i.test(addr)) return false;
    return true;
  });
  return jpPlaces.map((p) => {
    const priceLevel = normalizePriceLevel(p.priceLevel);
    const score = Number.isFinite(p.rating) ? p.rating : null;
    return {
      name: p.displayName?.text || '이름 없음',
      area: localizeAddress(p.formattedAddress, query, lang),
      genre: cleanGenre || localizeType(p.primaryType, lang) || '일식',
      score,
      priceLevel,
      aiFit: scoreFoodFit(score, priceLevel, budget || 'mid'),
      address: p.formattedAddress || '주소 없음',
      mapUrl: p.googleMapsUri || null,
      ...googlePhotoFields(p),
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      todayHours: formatTodayHours(p.currentOpeningHours)
    };
  });
}

// ── ホットペッパー グルメサーチAPI(무료 모드의 실제 맛집): HOTPEPPER_API_KEY가 있으면 도시 중심 3km 안 가게를 받는다 ──
// 리크루트 Web 서비스 이용 규약: 리크루트가 제공한 정보라고 표시한다(화면 "Powered by ホットペッパー Webサービス"),
// 캐시는 24시간 안에 갱신한다(여기서는 6시간), 가게 이름·장르·예산 등은 고치지 않고 원문 그대로 보여 준다, 수익을 내지 않는다.
// 키를 URL 쿼리로만 받는 API라 요청 주소는 로그에 남기지 않는다. 키가 없으면 한 번도 부르지 않는다.
const HOTPEPPER_API_KEY = envValue('HOTPEPPER_API_KEY');
const HOTPEPPER_ENDPOINT = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/';
const HOTPEPPER_CACHE_TTL_MS = 6 * 60 * 60_000;
const HOTPEPPER_CACHE_MAX = 300;
const _hotpepperCache = new Map(); // `${lat},${lng}|${keyword}|${count}` → { at, shops }
// 핫페퍼 장르 코드 → 화면 장르 이름(ko/en). 일본어 화면은 원문 장르 이름을 그대로 쓴다. 모르는 코드도 원문.
const HOTPEPPER_GENRE_I18N = {
  G001: { ko: '이자카야', en: 'Izakaya' }, G002: { ko: '다이닝 바', en: 'Dining bar' }, G003: { ko: '창작 요리', en: 'Creative cuisine' },
  G004: { ko: '일식', en: 'Japanese' }, G005: { ko: '양식', en: 'Western' }, G006: { ko: '이탈리안·프렌치', en: 'Italian / French' },
  G007: { ko: '중식', en: 'Chinese' }, G008: { ko: '야키니쿠·호르몬', en: 'Yakiniku' }, G017: { ko: '한식', en: 'Korean' },
  G009: { ko: '아시아·에스닉', en: 'Asian / Ethnic' }, G010: { ko: '세계 요리', en: 'International' }, G011: { ko: '노래방·파티', en: 'Karaoke / Party' },
  G012: { ko: '바·칵테일', en: 'Bar' }, G013: { ko: '라멘', en: 'Ramen' }, G016: { ko: '오코노미야키·몬자', en: 'Okonomiyaki / Monja' },
  G014: { ko: '카페·디저트', en: 'Cafe / Sweets' }, G015: { ko: '기타', en: 'Other' }
};

// 가게 하나 → 맛집 카드. 이름·장르·지역·예산·영업시간은 원문(가게 이름을 번역하거나 고치지 않는다).
function normalizeHotpepperShop(shop, cityKey, idx, lang) {
  if (!shop || typeof shop !== 'object') return null;
  const str = (v, max) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const name = str(shop.name, 80);
  const lat = Number(shop.lat);
  const lng = Number(shop.lng);
  if (!name || !(lat >= 20 && lat <= 46.5) || !(lng >= 122 && lng <= 154.5)) return null;
  // 사진은 핫페퍼 이미지 서버(https)만, 가게 페이지는 hotpepper.jp(https)만
  const httpsOn = (u, hosts) => {
    try {
      const x = new URL(str(u, 500));
      return x.protocol === 'https:' && hosts.some((h) => x.hostname === h || x.hostname.endsWith(`.${h}`)) ? x.href : '';
    } catch { return ''; }
  };
  const photoUrl = httpsOn(shop.photo?.pc?.l || shop.photo?.pc?.m || '', ['hotp.jp']);
  const detailUrl = httpsOn(shop.urls?.pc || '', ['hotpepper.jp']);
  const genreOriginal = str(shop.genre?.name, 40);
  const genreLabel = lang === 'ja' ? genreOriginal : (HOTPEPPER_GENRE_I18N[str(shop.genre?.code, 8)]?.[lang === 'en' ? 'en' : 'ko'] || genreOriginal);
  return {
    name,
    genre: genreLabel,
    ...(genreLabel !== genreOriginal && genreOriginal ? { genreOriginal } : {}),
    area: str(shop.small_area?.name || shop.middle_area?.name || shop.station_name, 40),
    address: str(shop.address, 120),
    budget: str(shop.budget?.name, 40),
    openText: str(shop.open, 200),
    access: str(shop.access, 160),
    city: CITY_DATA[cityKey]?.label || '',
    score: null,
    priceLevel: null,
    // 핫페퍼 추천 순서(order=4)를 그대로 점수로 쓴다
    aiFit: Math.max(60, 92 - idx),
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`,
    ...(detailUrl ? { detailUrl } : {}),
    photoUrl: photoUrl || null,
    photoCredit: null,
    source: 'hotpepper'
  };
}

// 도시(또는 opts.center) 주변 가게. 결과: { shops, reasonCode }(reasonCode: null | NO_RESULTS | HOTPEPPER_KEY_INVALID | HOTPEPPER_ERROR)
async function fetchHotpepperShops(cityKey, opts = {}) {
  if (!HOTPEPPER_API_KEY) return { shops: [], reasonCode: 'HOTPEPPER_KEY_MISSING' };
  const center = opts.center && hasLatLng(opts.center) ? { lat: Number(opts.center.lat), lng: Number(opts.center.lng) } : resolveCityCenter(cityKey);
  if (!center) return { shops: [], reasonCode: 'NO_RESULTS' };
  const lang = normalizeLang(opts.lang);
  // 장르: '라멘'·'ramen' → 'ラーメン'(FOOD_GENRE_I18N 일본어). 여러 장르면 첫 장르만.
  const firstGenre = String(opts.genre || '').split(/\s*(?:[,，、·&/]|이랑|하고|\band\b|랑)\s*/i).map((g) => g.trim()).filter(Boolean)[0] || '';
  const canon = canonicalFoodGenre(firstGenre);
  const keyword = canon ? String(FOOD_GENRE_I18N[canon]?.ja || canon).slice(0, 30) : '';
  const count = Math.max(1, Math.min(100, Math.round(Number(opts.count) || 30)));
  // 장르를 고르지 않으면 추천 순서 앞쪽이 거의 이자카야라서, 100곳을 받아 장르를 골고루 섞어 count곳을 고른다(요청은 한 번).
  const fetchCount = keyword ? count : 100;
  const params = new URLSearchParams({
    key: HOTPEPPER_API_KEY, lat: center.lat.toFixed(6), lng: center.lng.toFixed(6), range: '5', order: '4', count: String(fetchCount), format: 'json'
  });
  if (keyword) params.set('keyword', keyword);
  const cacheKey = `${params.get('lat')},${params.get('lng')}|${keyword}|${count}|${lang}`;
  const hit = _hotpepperCache.get(cacheKey);
  if (hit && (Date.now() - hit.at) < HOTPEPPER_CACHE_TTL_MS) return { shops: hit.shops, reasonCode: hit.shops.length ? null : 'NO_RESULTS' };
  let data;
  try {
    const res = await fetchWithTimeout(`${HOTPEPPER_ENDPOINT}?${params}`, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } }, 8000);
    if (!res.ok) {
      warnThrottled(`hotpepper:http${res.status}`, `[hotpepper] HTTP ${res.status} → 내장 맛집 목록`);
      return { shops: [], reasonCode: 'HOTPEPPER_ERROR' };
    }
    data = await res.json();
  } catch (err) {
    // 오류 문장에 요청 주소(키)가 섞이지 않게 원인 코드만 남긴다
    const why = /timeout/i.test(String(err?.message || '')) ? 'timeout' : (err?.cause?.code || err?.name || 'network');
    warnThrottled('hotpepper:fetch', `[hotpepper] 조회 실패(${why}) → 내장 맛집 목록`);
    return { shops: [], reasonCode: 'HOTPEPPER_ERROR' };
  }
  const r = data?.results || {};
  if (Array.isArray(r.error) && r.error.length) {
    const code = Number(r.error[0]?.code) || 0;
    warnThrottled(`hotpepper:api${code}`, `[hotpepper] API 오류 ${code}: ${String(r.error[0]?.message || '').slice(0, 80)} → 내장 맛집 목록`);
    return { shops: [], reasonCode: code === 2000 ? 'HOTPEPPER_KEY_INVALID' : 'HOTPEPPER_ERROR' };
  }
  const seen = new Set();
  const all = [];
  for (const shop of Array.isArray(r.shop) ? r.shop : []) {
    // 장르를 고르지 않았을 때 노래방·파티(G011)는 여행 맛집 목록에서 뺀다
    if (!keyword && String(shop?.genre?.code || '') === 'G011') continue;
    const card = normalizeHotpepperShop(shop, cityKey, all.length, lang);
    if (!card || seen.has(card.name)) continue;
    seen.add(card.name);
    all.push({ card, genre: String(shop?.genre?.code || '') });
  }
  let picked = all;
  if (!keyword) {
    // 추천 순서는 지키되 한 장르는 count의 30%(최소 3곳)까지 먼저 고르고, 모자라면 남은 가게로 채운다
    const cap = Math.max(3, Math.ceil(count * 0.3));
    const perGenre = new Map();
    const first = [];
    const rest = [];
    for (const x of all) {
      const n = perGenre.get(x.genre) || 0;
      if (n < cap) { first.push(x); perGenre.set(x.genre, n + 1); } else rest.push(x);
    }
    picked = [...first, ...rest];
  }
  const shops = picked.slice(0, count).map((x, i) => ({ ...x.card, aiFit: Math.max(60, 92 - i) }));
  _hotpepperCache.set(cacheKey, { at: Date.now(), shops });
  while (_hotpepperCache.size > HOTPEPPER_CACHE_MAX) _hotpepperCache.delete(_hotpepperCache.keys().next().value);
  return { shops, reasonCode: shops.length ? null : 'NO_RESULTS' };
}

async function fetchFoodPlacesForCity(query, lat, lng, genre, budget, lang) {
  const cleanGenre = String(genre || '').trim();
  const tokenQueries = genreTokens(cleanGenre);
  const baseQueries = cleanGenre
    ? [
        `${query} ${cleanGenre} 맛집`,
        `${query} ${cleanGenre} 현지 맛집`,
        `${query} ${cleanGenre} 인기`,
        `${query} 로컬 ${cleanGenre}`
      ]
    : [
        `${query} 인기 맛집`,
        `${query} 현지 맛집`,
        `${query} 일본 맛집`
      ];
  const queries = cleanGenre && tokenQueries.length > 1
    ? Array.from(new Set([...baseQueries, ...tokenQueries.map((t) => `${query} ${t} 맛집`)]))
    : baseQueries;

  // 쿼리는 2개까지(비용). 전부 실패하면 첫 오류를 던져 /api/foods가 실제 원인을 알 수 있게 한다.
  if (!GOOGLE_PLACES_ENABLED) return [];
  const cappedQueries = queries.slice(0, 2);
  const settled = await Promise.allSettled(cappedQueries.map((q) => fetchPlacesWithGoogle(query, lat, lng, cleanGenre, budget, q, 20, lang)));
  const results = settledValuesOrThrow(settled);

  const uniq = new Map();
  results.flat().forEach((item) => {
    const key = `${item.name}|${item.address || ''}`;
    if (!uniq.has(key)) uniq.set(key, item);
  });
  const merged = Array.from(uniq.values());
  if (!cleanGenre) return merged.slice(0, 30);
  const strict = merged.filter((x) => isGenreMatchFoodName(x.name, cleanGenre));
  return strict.slice(0, 30);
}

// 레거시 warning 문구: reasonCode(또는 오류 객체) → 짧은 한국어 설명. 원시 오류 문자열은 내보내지 않는다.
function classifyGooglePlacesFailure(errOrReason) {
  const code = typeof errOrReason === 'string' ? errOrReason : (errOrReason?.reasonCode || 'GOOGLE_ERROR');
  return PLACES_REASON_TEXT_KO[code] || PLACES_REASON_TEXT_KO.GOOGLE_ERROR;
}

function tabelogStyleFoods(payload) {
  const key = cityKeyByInput(payload.city || payload.query);
  const city = CITY_DATA[key];
  const budget = payload.budget || 'mid';
  const lang = normalizeLang(payload.lang);
  // "라멘, 모츠나베" / "라멘이랑 모츠나베" 처럼 여러 장르를 나눠 장르마다 찾고, 합쳐서 겹침을 없앤다.
  const genres = Array.from(new Set(String(payload.genre || '')
    .split(/\s*(?:[,，、·&/]|이랑|하고|\band\b|랑)\s*/i)
    .map((g) => canonicalFoodGenre(g.trim()))
    .filter(Boolean))).slice(0, 4);
  let sourceList = city.foods;
  if (genres.length) {
    const seen = new Set();
    sourceList = [];
    for (const g of genres) {
      for (const f of city.foods) {
        if (seen.has(f.name) || !isGenreMatchFoodName(`${f.name} ${f.genre}`, g)) continue;
        seen.add(f.name);
        sourceList.push(f);
      }
    }
  }
  const source = 'tabelog_style_curated';
  // 장르에 맞는 내장 맛집이 없으면 지어낸 가게 이름을 만들지 않고 빈 목록 + NO_GENRE_MATCH를 돌려준다(화면은 빈 상태 안내).
  const reasonCode = genres.length && sourceList.length === 0 ? 'NO_GENRE_MATCH' : null;
  const cityName = localizedCityName(key, lang);
  const normalized = sourceList
    .map((f) => {
      const localizedName = localizeCuratedFoodName(f.name, key, lang);
      const area = localizeCuratedArea(f.area, lang, cityName);
      // '찾기' 안내는 가게가 아니라서 지도 링크를 '<장르> <지역> <도시>' 검색으로 둔다.
      const query = f.generic ? `${localizeFoodGenre(f.genre, lang)} ${area} ${cityName}` : `${f.name} ${city.label}`;
      // 내장 맛집에는 가게 사진이 없어서, 번역하기 전의 원래 장르로 음식 예시 사진(scope 'genre')을 붙인다.
      return withGenrePhotoFallback({
        ...f,
        name: localizedName,
        ...(localizedName !== f.name ? { nameKo: f.name } : {}),
        genre: localizeFoodGenre(f.genre, lang),
        area,
        city: city.label,
        mapUrl: mapUrl(query),
        aiFit: Math.round(Math.min(100, (f.score / 5) * 40 + 20 + 15 + 10))
      }, f.genre);
    })
    // '찾기' 안내는 실제 가게 뒤에 둔다
    .sort((a, b) => (Number(Boolean(a.generic)) - Number(Boolean(b.generic))) || (b.aiFit - a.aiFit));

  return { source, city: city.label, budget, list: normalized, ...(reasonCode ? { reasonCode } : {}) };
}

// 추천 맛집 폴백: 여러 도시의 내장 큐레이션 맛집을 번갈아 섞어 최대 max곳
function curatedFoodsForCities(cityKeys, budget, lang, max = 12) {
  const lists = [...new Set(cityKeys || [])]
    .filter((k) => CITY_DATA[k])
    .map((k) => tabelogStyleFoods({ city: k, budget, lang }).list);
  const out = [];
  const seen = new Set();
  const longest = lists.reduce((m, l) => Math.max(m, l.length), 0);
  for (let i = 0; i < longest && out.length < max; i += 1) {
    for (const list of lists) {
      const f = list[i];
      if (!f || out.length >= max) continue;
      const norm = String(f.name || '').trim().toLowerCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      // 사진은 tabelogStyleFoods가 붙인 음식 장르 예시 사진(있을 때만). 가게 좌표는 모른다.
      out.push({ ...f, reviewCount: 0, photoUrl: f.photoUrl || null, lat: null, lng: null });
    }
  }
  return out;
}

function planSummary(cityKey, recCount, dayCount, lang) {
  const name = localizedCityName(cityKey, lang);
  if (lang === 'en') return `${name}: ${recCount} places + ${dayCount}-day itinerary`;
  if (lang === 'ja') return `${name} おすすめ${recCount}件 + ${dayCount}日間の日程`;
  return `${name} 추천 ${recCount}곳 + ${dayCount}일 일정`;
}


// 이동비 추정 문구 (ko/en/ja)
const ROUTE_COST_TEXT = {
  ko: {
    walking: '도보 이동', subway1: '지하철 1구간', subway2: '지하철 2~3구간', subway: '지하철/전철', rail: 'JR/사철 이용',
    longRail: '장거리 전철', shinkansen: '특급/신칸센 추정', approx: (km) => ` (약 ${km}km)`,
    noDistance: '거리 정보 없음(대략 추정)', needTwo: '장소가 2곳 이상 필요합니다.'
  },
  en: {
    walking: 'Walk', subway1: 'Subway, 1 zone', subway2: 'Subway, 2-3 zones', subway: 'Subway/train', rail: 'JR/private railway',
    longRail: 'Long-distance train', shinkansen: 'Limited express/Shinkansen (estimate)', approx: (km) => ` (about ${km} km)`,
    noDistance: 'No distance data (rough estimate)', needTwo: 'At least 2 places are needed.'
  },
  ja: {
    walking: '徒歩', subway1: '地下鉄 1区間', subway2: '地下鉄 2～3区間', subway: '地下鉄/電車', rail: 'JR/私鉄',
    longRail: '長距離電車', shinkansen: '特急/新幹線（推定）', approx: (km) => `（約${km}km）`,
    noDistance: '距離情報なし（概算）', needTwo: '2か所以上の場所が必要です。'
  }
};

// lang이 없으면 장소 이름의 글자로 짐작한다(한글 → ko, 가나·한자 → ja, 로마자 → en).
function routeCostLang(lang, places) {
  if (['ko', 'en', 'ja'].includes(String(lang || '').toLowerCase())) return String(lang).toLowerCase();
  const text = (places || []).join(' ');
  if (/[가-힣]/.test(text)) return 'ko';
  if (/[぀-ヿ一-鿿]/.test(text)) return 'ja';
  if (/[A-Za-z]/.test(text)) return 'en';
  return 'ko';
}

// 화면에 보이는 장소 이름(한글·현지화 en/ja) → { cityKey, ko(원래 이름) } 목록. 이동비 계산에서 좌표를 찾을 때 쓴다.
let _placeLabelIndex = null;
function placeLabelIndex() {
  if (_placeLabelIndex) return _placeLabelIndex;
  const list = [];
  const seen = new Set();
  const add = (ck, label, ko) => {
    const l = String(label || '').trim();
    if (!l || !ko) return;
    const k = `${ck}|${l.toLowerCase()}|${ko}`;
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ ck, label: l, lower: l.toLowerCase(), ko });
  };
  for (const [ck, c] of Object.entries(CITY_DATA)) {
    (c.highlights || []).forEach((h) => {
      add(ck, h.name, h.name);
      add(ck, mustAttractionLatinName(ck, h.name), h.name);
    });
  }
  MUST_ATTRACTIONS.forEach((m) => {
    add(m.cityKey, m.name, m.name);
    add(m.cityKey, mustAttractionLatinName(m.cityKey, m.name), m.name);
  });
  EXTRA_PLACES.forEach((e) => {
    [e.name, e.en, e.ja, ...(e.aliases || [])].forEach((l) => add(e.cityKey, l, e.name));
  });
  for (const [k, v] of Object.entries(CURATED_PLACE_I18N)) {
    const sep = k.indexOf('|');
    add(k.slice(0, sep), v.en, k.slice(sep + 1));
    add(k.slice(0, sep), v.ja, k.slice(sep + 1));
  }
  for (const [k, v] of PLACE_IMAGES.byKey) {
    const sep = k.indexOf('|');
    const ck = k.slice(0, sep);
    const ko = k.slice(sep + 1);
    add(ck, ko, ko);
    add(ck, v.labels?.en, ko);
    add(ck, v.labels?.ja, ko);
  }
  _placeLabelIndex = list;
  return list;
}

// 화면 표기 이름(한글·en/ja, 대소문자 무시)이 정확히 같은 항목들. preferredCityKeys의 도시가 앞에 온다.
function placeLabelMatches(label, preferredCityKeys = []) {
  const lower = String(label || '').trim().toLowerCase();
  if (!lower) return [];
  const prefer = new Set((preferredCityKeys || []).filter(Boolean));
  return placeLabelIndex()
    .filter((e) => e.lower === lower)
    .sort((a, b) => Number(prefer.has(b.ck)) - Number(prefer.has(a.ck)));
}

// 화면 표기 이름 → 원래 한글 이름(모르면 '')
function koPlaceNameForLabel(label, cityKey) {
  return placeLabelMatches(label, [cityKey])[0]?.ko || '';
}

// ── 경로 교통비: AI 없이 거리로 추정한다 ──
// 예전에는 Gemini가 요금·시간을 추측했는데, 추측값이 실측처럼 보이고 Gemini 하루 한도를 썼다(2026-10-02 제거).
// 모든 구간은 추정값(estimated: true)이고, 구간마다 Google 지도 대중교통 길찾기 링크(mapsUrl, 키·요금 없음)를 붙인다.
// google 모드면 Directions API 거리(비용 가드 적용), 아니면 장소 좌표(place-images.json·큐레이션) 직선거리 × 1.3.
async function calculateRouteCost(places, city, langInput) {
  const lang = routeCostLang(langInput, places);
  const RT = ROUTE_COST_TEXT[lang] || ROUTE_COST_TEXT.ko;
  if (places.length < 2) {
    return { segments: [], totalDurationMin: 0, totalFareJPY: 0, totalFareKRW: 0, error: RT.needTwo };
  }

  // 원화 환산은 현재 환율(실시간 조회 값, 실패 시 FX_* 또는 대략값)을 쓴다.
  const JPY_TO_KRW = fxJpyKrw;
  const cityKey = cityKeyByInput(city);
  const cityObj = CITY_DATA[cityKey];
  const cityLabel = (cityObj && cityObj.label) ? cityObj.label : city;

  // 지도 검색어·Directions에 쓰는 일본어 도시 이름(nameJa → CITY_NAME_I18N의 일본어 → 화면 이름)
  const cityNameJa = (cityObj && cityObj.nameJa) ? cityObj.nameJa : (CITY_NAME_I18N[cityLabel]?.[1] || cityLabel);
  const segments = [];
  let totalDuration = 0;
  let totalFareJPY = 0;

  const exactCoordFor = (n, ck = cityKey) => {
    const media = placeMediaFor(ck, n);
    if (media && media.lat !== null) return { lat: media.lat, lng: media.lng };
    const h = (CITY_DATA[ck]?.highlights || []).find((x) => x && x.name === n && hasLatLng(x));
    return h ? { lat: Number(h.lat), lng: Number(h.lng) } : null;
  };
  const coordFor = (name) => {
    const n = String(name || '').trim();
    const direct = exactCoordFor(n);
    if (direct) return direct;
    // 화면은 "장소명 지역"(예: "센소지 아사쿠사", "Senso-ji Temple Asakusa")으로 보낸다.
    // 한글·en/ja 표기 이름 중 정확히 같거나 가장 긴 앞부분이 맞는 것을 찾아 원래 이름으로 좌표를 찾는다(같은 도시 우선).
    const lower = n.toLowerCase();
    const matches = placeLabelIndex()
      .filter((e) => lower === e.lower || lower.startsWith(`${e.lower} `))
      .sort((a, b) => (Number(b.ck === cityKey) - Number(a.ck === cityKey)) || (b.label.length - a.label.length));
    for (const e of matches) {
      const c = exactCoordFor(e.ko, e.ck);
      if (c) return c;
    }
    // "NRT 공항" 형태
    const ap = /^([A-Z]{3})\s*(?:공항|airport|空港)/i.exec(n);
    const apCoord = ap ? JAPAN_AIRPORT_COORDS.find((a) => a.code === ap[1].toUpperCase()) : null;
    return apCoord ? { lat: apCoord.lat, lng: apCoord.lng } : null;
  };
  // Google 지도 대중교통 길찾기 링크: 좌표를 알면 좌표, 모르면 "이름 도시(일본어) Japan"으로 찾게 한다.
  const mapsUrlFor = (fromPlace, toPlace, a, b) => googleTransitDirUrl(
    a ? `${a.lat.toFixed(6)},${a.lng.toFixed(6)}` : `${fromPlace} ${cityNameJa} Japan`,
    b ? `${b.lat.toFixed(6)},${b.lng.toFixed(6)}` : `${toPlace} ${cityNameJa} Japan`
  );
  // 좌표로 구간 추정(직선거리 × 1.3). 좌표가 없으면 대략값.
  const estimateSegmentFromCoords = (fromPlace, toPlace) => {
    const a = coordFor(fromPlace);
    const b = coordFor(toPlace);
    if (!a || !b) {
      return {
        from: fromPlace, to: toPlace,
        distanceM: 0, durationMin: 20,
        fareJPY: 200, fareKRW: Math.round(200 * JPY_TO_KRW),
        mode: 'estimated', estimated: true, tip: RT.noDistance,
        mapsUrl: mapsUrlFor(fromPlace, toPlace, a, b)
      };
    }
    const distKm = haversineKm(a, b) * 1.3;
    const est = estimateTransitFare(distKm);
    const durationMin = distKm < 0.5 ? Math.max(3, Math.round(distKm * 12)) : Math.round(8 + distKm * 2.5);
    return {
      from: fromPlace, to: toPlace,
      distanceM: Math.round(distKm * 1000), durationMin,
      fareJPY: est.fareJPY, fareKRW: Math.round(est.fareJPY * JPY_TO_KRW),
      mode: est.mode, estimated: true,
      tip: est.tip + RT.approx(distKm.toFixed(1)),
      mapsUrl: mapsUrlFor(fromPlace, toPlace, a, b)
    };
  };

  // Japanese transit fare estimation based on distance
  function estimateTransitFare(distKm) {
    if (distKm < 0.5) return { fareJPY: 0, mode: 'walking', tip: RT.walking };
    if (distKm < 2) return { fareJPY: 170, mode: 'subway', tip: RT.subway1 };
    if (distKm < 5) return { fareJPY: 200, mode: 'subway', tip: RT.subway2 };
    if (distKm < 10) return { fareJPY: 250, mode: 'subway', tip: RT.subway };
    if (distKm < 20) return { fareJPY: 400, mode: 'rail', tip: RT.rail };
    if (distKm < 50) return { fareJPY: 800, mode: 'rail', tip: RT.longRail };
    return { fareJPY: Math.round(distKm * 20), mode: 'rail', tip: RT.shinkansen };
  }

  // Estimate transit duration from driving duration (transit ~1.5x driving in cities)
  function estimateTransitDuration(drivingMin, distKm) {
    if (distKm < 0.5) return Math.max(3, Math.round(distKm * 12));
    return Math.round(drivingMin * 1.5);
  }

  for (let i = 0; i < places.length - 1; i++) {
    const fromPlace = places[i];
    const toPlace = places[i + 1];
    const origin = encodeURIComponent(fromPlace + ' ' + cityNameJa + ' Japan');
    const dest = encodeURIComponent(toPlace + ' ' + cityNameJa + ' Japan');

    if (!GOOGLE_PLACES_ENABLED || googleBlockedReason()) {
      const seg = estimateSegmentFromCoords(fromPlace, toPlace);
      segments.push(seg);
      totalDuration += seg.durationMin;
      totalFareJPY += seg.fareJPY;
      continue;
    }

    try {
      // Use driving mode (transit returns ZERO_RESULTS in Japan)
      const url = `${GEOCODE_API_BASE}/maps/api/directions/json?origin=${origin}&destination=${dest}&mode=driving&language=ja&region=jp&key=${encodeURIComponent(GOOGLE_MAPS_SERVER_KEY)}`;
      const data = await googleApiFetch(url, { label: 'directions' });

      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        const distanceM = leg.distance ? leg.distance.value : 0;
        const drivingDurationMin = Math.round((leg.duration ? leg.duration.value : 0) / 60);
        const distKm = distanceM / 1000;

        const est = estimateTransitFare(distKm);
        const transitDurationMin = estimateTransitDuration(drivingDurationMin, distKm);

        segments.push({
          from: fromPlace, to: toPlace,
          distanceM, durationMin: transitDurationMin,
          fareJPY: est.fareJPY, fareKRW: Math.round(est.fareJPY * JPY_TO_KRW),
          mode: est.mode, estimated: true,
          tip: est.tip + RT.approx(distKm.toFixed(1)),
          mapsUrl: mapsUrlFor(fromPlace, toPlace, coordFor(fromPlace), coordFor(toPlace))
        });
        totalDuration += transitDurationMin;
        totalFareJPY += est.fareJPY;
      } else {
        const seg = estimateSegmentFromCoords(fromPlace, toPlace);
        segments.push(seg);
        totalDuration += seg.durationMin;
        totalFareJPY += seg.fareJPY;
      }
    } catch (err) {
      // 원인은 googleApiFetch가 로그로 남긴다. 좌표 기반 추정으로 대신한다.
      const seg = estimateSegmentFromCoords(fromPlace, toPlace);
      segments.push(seg);
      totalDuration += seg.durationMin;
      totalFareJPY += seg.fareJPY;
    }

    if (i < places.length - 2) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return {
    segments,
    totalDurationMin: totalDuration,
    totalFareJPY,
    totalFareKRW: Math.round(totalFareJPY * JPY_TO_KRW),
    source: 'distance_estimate',
    estimated: true
  };
}

// Google 지도 길찾기 링크(Maps URLs, 키 없음). 대중교통 모드는 경유지를 받지 않아 구간마다 하나씩 만든다.
function googleTransitDirUrl(origin, destination) {
  const q = (v) => encodeURIComponent(String(v || '').trim().slice(0, 200));
  return `https://www.google.com/maps/dir/?api=1&origin=${q(origin)}&destination=${q(destination)}&travelmode=transit`;
}

// GET /api/place-photo?name=places/{id}/photos/{id}&w=100..1600 (google 모드 전용)
//  - 서버가 최근 Places 응답에서 받은 사진 이름만 허용(아무 이름으로 과금 호출을 대신 보내 주지 않게)
//  - skipHttpRedirect=true로 키 없는 photoUri를 받은 뒤 이미지만 전달. 키는 응답에 절대 들어가지 않는다.
const PLACE_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const PLACE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
// 받은 사진 바이트는 메모리에 잠시 보관한다(같은 사진은 Google을 다시 부르지 않음). 최대 200장·총 30MB, 24시간.
const PLACE_PHOTO_CACHE_TTL_MS = 24 * 60 * 60_000;
const PLACE_PHOTO_CACHE_MAX_ENTRIES = 200;
const PLACE_PHOTO_CACHE_MAX_BYTES = 30 * 1024 * 1024;
const _placePhotoCache = new Map(); // key: `${name}|${w}` → { at, type, buf }
let _placePhotoCacheBytes = 0;

function placePhotoCacheGet(key) {
  const hit = _placePhotoCache.get(key);
  if (!hit) return null;
  _placePhotoCache.delete(key);
  if ((Date.now() - hit.at) > PLACE_PHOTO_CACHE_TTL_MS) {
    _placePhotoCacheBytes -= hit.buf.length;
    return null;
  }
  _placePhotoCache.set(key, hit); // 최근 사용 순서로 옮긴다(LRU)
  return hit;
}

function placePhotoCacheSet(key, type, buf) {
  const old = _placePhotoCache.get(key);
  if (old) { _placePhotoCache.delete(key); _placePhotoCacheBytes -= old.buf.length; }
  _placePhotoCache.set(key, { at: Date.now(), type, buf });
  _placePhotoCacheBytes += buf.length;
  while (_placePhotoCache.size > PLACE_PHOTO_CACHE_MAX_ENTRIES || _placePhotoCacheBytes > PLACE_PHOTO_CACHE_MAX_BYTES) {
    const oldestKey = _placePhotoCache.keys().next().value;
    const oldest = _placePhotoCache.get(oldestKey);
    _placePhotoCache.delete(oldestKey);
    _placePhotoCacheBytes -= oldest ? oldest.buf.length : 0;
  }
}

// 응답 본문을 최대 maxBytes까지만 읽는다(넘으면 null). content-length가 한도를 넘으면 읽지 않는다.
async function readBodyLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    try { await response.body?.cancel(); } catch { /* 무시 */ }
    return null;
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buf = Buffer.from(await response.arrayBuffer());
    return buf.length > maxBytes ? null : buf;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* 무시 */ }
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function sendPlacePhoto(res, type, buf, cacheStatus) {
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': buf.length,
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Photo-Cache': cacheStatus
  });
  return res.end(buf);
}

async function handlePlacePhoto(res, parsedUrl) {
  if (!GOOGLE_PLACES_ENABLED) return sendJson(res, 404, { error: 'Not Found' });
  const name = String(parsedUrl.searchParams.get('name') || '');
  if (!PLACE_PHOTO_NAME_RE.test(name)) return sendJson(res, 400, { error: 'Invalid photo name' });
  if (!isIssuedPlacePhotoName(name)) return sendJson(res, 404, { error: 'Not Found' });
  const wRaw = Number(parsedUrl.searchParams.get('w') || 400);
  const w = Number.isFinite(wRaw) ? Math.max(100, Math.min(1600, Math.round(wRaw))) : 400;
  const cacheKey = `${name}|${w}`;
  const cached = placePhotoCacheGet(cacheKey);
  if (cached) return sendPlacePhoto(res, cached.type, cached.buf, 'hit');
  try {
    const meta = await googleApiFetch(`${PLACES_API_BASE}/v1/${name}/media?maxWidthPx=${w}&skipHttpRedirect=true`, {
      label: 'places:photo',
      bucket: 'photo',
      headers: { 'X-Goog-Api-Key': GOOGLE_MAPS_SERVER_KEY }
    });
    const photoUri = String(meta?.photoUri || '');
    let host = '';
    try { host = new URL(photoUri).hostname; } catch { host = ''; }
    let testHost = '';
    try { testHost = PLACES_API_BASE !== 'https://places.googleapis.com' ? new URL(PLACES_API_BASE).hostname : ''; } catch { testHost = ''; }
    const hostOk = host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com') || (testHost && host === testHost);
    if (!hostOk || !/^https?:\/\//.test(photoUri) || (!testHost && !photoUri.startsWith('https://'))) {
      return sendJson(res, 502, { error: 'Photo unavailable' });
    }
    // 검사한 호스트 밖으로 따라가지 않게 리다이렉트는 오류로 본다.
    const img = await fetchWithTimeout(photoUri, { headers: { 'User-Agent': OUTBOUND_USER_AGENT }, redirect: 'error' }, GOOGLE_REQUEST_TIMEOUT_MS);
    const type = String(img.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!img.ok || !PLACE_PHOTO_TYPES.has(type)) {
      try { await img.body?.cancel(); } catch { /* 무시 */ }
      return sendJson(res, 502, { error: 'Photo unavailable' });
    }
    const buf = await readBodyLimited(img, PLACE_PHOTO_MAX_BYTES);
    if (!buf || buf.length === 0) return sendJson(res, 502, { error: 'Photo unavailable' });
    placePhotoCacheSet(cacheKey, type, buf);
    return sendPlacePhoto(res, type, buf, 'miss');
  } catch (err) {
    const reasonCode = err?.reasonCode || 'GOOGLE_ERROR';
    if (!err?.reasonCode) warnThrottled('google:photo-bytes', `[google] 사진 바이트를 받지 못함(리다이렉트/네트워크): ${redactGoogleKey(err?.cause?.code || err?.message || err)}`);
    return sendJson(res, reasonCode === 'GOOGLE_ERROR' ? 502 : 503, { error: 'Photo unavailable', reasonCode });
  }
}

// 이동비 결과 캐시(도시|언어|장소 목록 → 결과, 30분, 최대 200개)
const ROUTE_COST_CACHE_TTL_MS = 30 * 60_000;
const _routeCostCache = new Map();

// open-meteo 일별 예보(무료·키 없음). 좌표별 30분 메모리 캐시.
const WEATHER_CACHE_TTL_MS = 30 * 60_000;
const _weatherCache = new Map();
const WEATHER_DAILY_FIELDS = ['weathercode', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'];

// open-meteo daily를 그대로 넘기지 않고, 날짜(YYYY-MM-DD)와 숫자(모르면 null)만 남긴다. 날짜가 이상한 칸은 모든 배열에서 뺀다.
function sanitizeWeatherDaily(daily) {
  const times = Array.isArray(daily?.time) ? daily.time : [];
  const keep = [];
  times.slice(0, 16).forEach((t, i) => {
    if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t)) keep.push(i);
  });
  if (keep.length === 0) return null;
  const out = { time: keep.map((i) => times[i]) };
  for (const field of WEATHER_DAILY_FIELDS) {
    const arr = Array.isArray(daily[field]) ? daily[field] : [];
    out[field] = keep.map((i) => {
      const v = arr[i];
      const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
      return Number.isFinite(n) ? n : null;
    });
  }
  return out;
}

async function fetchWeatherDaily(lat, lng) {
  const key = `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const cached = _weatherCache.get(key);
  if (cached && (Date.now() - cached.at) < WEATHER_CACHE_TTL_MS) return cached.daily;
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat).toFixed(4)}&longitude=${Number(lng).toFixed(4)}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Tokyo&forecast_days=16`;
    const r = await fetchWithTimeout(weatherUrl, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } }, 8000);
    if (!r.ok) {
      warnThrottled(`weather:http:${r.status}`, `[weather] open-meteo HTTP ${r.status}`);
      return null;
    }
    const data = await r.json();
    const daily = data && data.daily && typeof data.daily === 'object' ? sanitizeWeatherDaily(data.daily) : null;
    if (!daily) return null;
    _weatherCache.set(key, { at: Date.now(), daily });
    while (_weatherCache.size > 200) _weatherCache.delete(_weatherCache.keys().next().value);
    return daily;
  } catch (err) {
    warnThrottled('weather:network', `[weather] open-meteo 요청 실패: ${err?.cause?.code || err?.message || err}`);
    return null;
  }
}

// ── 내 일정(/api/my-plans/*) ──
// 행 대응(Supabase travel_plans): plan_key = 'my_' + 일정 id, user_label = 세션 userId, source = 'my-plans',
// city_key = cityKey || 'unknown', city_label, theme, start_date(올바른 YYYY-MM-DD일 때만, 아니면 null),
// days(1 이상 정수, 아니면 null), summary = 제목, payload = 일정 객체 전체(파일 저장소와 같은 모양).
// Supabase가 설정됐는데 닿지 않거나 키·표 문제면 503 PROVIDER_UNAVAILABLE(파일에 대신 쓰지 않음).
// 저장소가 내용을 거절하면(4xx) 400 INVALID_PLAN, 너무 크면 413 PLAN_TOO_LARGE, 개수 상한이면 409 PLAN_LIMIT.
// 응답은 모두 Cache-Control: no-store(개인 일정이 브라우저·중간 캐시에 남지 않게).
const MY_PLANS_SOURCE = 'my-plans';
const MY_PLAN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// 사용자당 저장 개수 상한. 목록도 같은 수까지 보여 줘서 저장한 일정은 모두 화면에서 지울 수 있다.
const MY_PLANS_MAX_PER_USER = 50;
const MY_PLANS_LIST_LIMIT = MY_PLANS_MAX_PER_USER;
// 일정 하나의 최대 크기(JSON 바이트). 실제 일정(항공·숙소·추천 목록 포함)은 보통 150KB 안쪽이다.
const MY_PLAN_MAX_BYTES = 400_000;
const STORE_ERRORS = {
  unavailable: [503, { error: '일정 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', reasonCode: 'PROVIDER_UNAVAILABLE' }],
  invalid: [400, { error: '저장할 수 없는 내용이 들어 있습니다.', reasonCode: 'INVALID_PLAN' }],
  tooLarge: [413, { error: '일정이 너무 커서 저장할 수 없습니다.', reasonCode: 'PLAN_TOO_LARGE' }],
  limit: [409, { error: `일정은 ${MY_PLANS_MAX_PER_USER}개까지 저장할 수 있습니다. 안 쓰는 일정을 지운 뒤 다시 저장해 주세요.`, reasonCode: 'PLAN_LIMIT', limit: MY_PLANS_MAX_PER_USER }]
};
function sendStoreError(res, kind) {
  const [status, body] = STORE_ERRORS[kind] || STORE_ERRORS.unavailable;
  return sendJson(res, status, body);
}

// 저장할 값 정리: Postgres text·jsonb가 받지 않는 글자를 고친다(NUL은 지우고, 짝 없는 서로게이트는 U+FFFD로).
// 객체 키도 같이 고치고 '__proto__' 키는 버린다. 64단계보다 깊게 중첩된 값은 400.
const STORE_MAX_DEPTH = 64;
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function storeSafeString(value) {
  const s = String(value).replace(/\u0000/g, '');
  return typeof s.toWellFormed === 'function' ? s.toWellFormed() : s.replace(LONE_SURROGATE_RE, '\uFFFD');
}
function storeSafeValue(value, depth = 0) {
  if (typeof value === 'string') return storeSafeString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || typeof value !== 'object') return typeof value === 'boolean' ? value : null;
  if (depth >= STORE_MAX_DEPTH) throw new HttpError(400, 'plan is nested too deeply');
  if (Array.isArray(value)) return value.map((v) => storeSafeValue(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const key = storeSafeString(k);
    if (key === '__proto__') continue;
    out[key] = storeSafeValue(v, depth + 1);
  }
  return out;
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

const MY_PLANS_ROUTES = new Map([
  ['/api/my-plans/save', { method: 'POST', op: 'save' }],
  ['/api/my-plans/list', { method: 'GET', op: 'list' }],
  ['/api/my-plans/load', { method: 'GET', op: 'load' }],
  ['/api/my-plans/delete', { method: 'DELETE', op: 'delete' }]
]);

// 달력에 있는 날짜(YYYY-MM-DD)만. '2026-02-30'처럼 Date.parse가 넘겨 버리는 값도 거른다.
function strictIsoDate(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : '';
}

function myPlanText(value, max) {
  const s = typeof value === 'string' ? value : (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
  // 자른 뒤에 정리한다(자르다 갈라진 서로게이트 쌍도 U+FFFD가 된다).
  return storeSafeString(s.slice(0, max));
}

// 요청 본문 → 저장할 일정 객체 { id, userId, title, cityKey, cityLabel, startDate, days, theme, data, savedAt }
// 클라이언트 id는 안전한 모양(/^[A-Za-z0-9_-]{1,64}$/)일 때만 쓰고, 아니면 새 UUID를 만든다.
// 글자는 storeSafeString/storeSafeValue로 정리한다(NUL·짝 없는 서로게이트 때문에 저장소가 거절하지 않게).
function buildMyPlan(payload, userId) {
  const clientId = typeof payload.id === 'string' && MY_PLAN_ID_RE.test(payload.id) ? payload.id : '';
  const daysNum = Number(payload.days);
  const plan = {
    id: clientId || randomUUID(),
    userId,
    title: myPlanText(payload.title, 200),
    cityKey: myPlanText(payload.cityKey, 40),
    cityLabel: myPlanText(payload.cityLabel, 80),
    startDate: myPlanText(payload.startDate, 10),
    days: Number.isInteger(daysNum) && daysNum >= 0 && daysNum <= 365 ? daysNum : 0,
    theme: myPlanText(payload.theme, 30),
    data: payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? storeSafeValue(payload.data) : {},
    savedAt: new Date().toISOString()
  };
  return { plan, clientId: Boolean(clientId) };
}

function myPlanRow(plan) {
  return {
    plan_key: `my_${plan.id}`,
    user_label: plan.userId,
    city_key: plan.cityKey || 'unknown',
    city_label: plan.cityLabel || null,
    theme: plan.theme || null,
    start_date: strictIsoDate(plan.startDate) || null,
    days: Number.isInteger(plan.days) && plan.days > 0 ? plan.days : null,
    summary: plan.title,
    source: MY_PLANS_SOURCE,
    payload: plan
  };
}

function myPlanSummaryFromRow(row) {
  return {
    id: String(row.plan_key || '').replace(/^my_/, ''),
    title: typeof row.summary === 'string' ? row.summary : '',
    cityLabel: typeof row.city_label === 'string' ? row.city_label : '',
    startDate: typeof row.start_date === 'string' ? row.start_date : '',
    days: Number.isInteger(row.days) ? row.days : 0,
    theme: typeof row.theme === 'string' ? row.theme : '',
    savedAt: String(row.updated_at || row.created_at || '')
  };
}

function myPlanSummary(p) {
  return { id: p.id, title: p.title, cityLabel: p.cityLabel, startDate: p.startDate, days: p.days, theme: p.theme, savedAt: p.savedAt };
}

async function handleMyPlans(req, res, parsedUrl, op) {
  // 개인 일정 응답(오류 포함)은 캐시하지 않는다. sendJson의 writeHead가 이 헤더를 합친다.
  res.setHeader('Cache-Control', 'no-store');
  const session = parseSession(req);
  if (!session) return sendJson(res, 401, { error: '로그인이 필요합니다' });
  const userId = session.userId;
  let built = null;
  if (op === 'save') {
    const payload = await readBody(req, BODY_LIMIT_LARGE);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return sendJson(res, 400, { error: 'Invalid request body' });
    built = buildMyPlan(payload, userId);
    if (jsonBytes(built.plan) > MY_PLAN_MAX_BYTES) return sendStoreError(res, 'tooLarge');
  }
  const planId = op === 'load' || op === 'delete' ? String(parsedUrl.searchParams.get('id') || '') : '';
  if ((op === 'load' || op === 'delete') && !planId) return sendJson(res, 400, { error: 'id is required' });
  if (!hasSupabase()) return myPlansFileStore(res, op, userId, built, planId);
  try {
    const result = await myPlansSupabaseStore(res, op, userId, built, planId);
    noteSupabaseState('ok');
    return result;
  } catch (err) {
    if (!err?.supabase) throw err;
    const kind = noteSupabaseFailure(err);
    // 오류 종류(상태 코드·PostgREST 코드)마다 10분에 한 줄씩 남긴다(같은 종류만 줄인다).
    warnThrottled(`supabase:my-plans:${op}:${err.status || 'net'}:${err.pgCode || ''}`, `[supabase] 내 일정 ${op} 실패: ${redactSupabaseKey(err.message)}`);
    return sendStoreError(res, kind === 'content' && op === 'save' ? 'invalid' : 'unavailable');
  }
}

async function myPlansSupabaseStore(res, op, userId, built, planId) {
  const enc = encodeURIComponent;
  const owner = `user_label=eq.${enc(userId)}&source=eq.${enc(MY_PLANS_SOURCE)}`;
  if (op === 'save') {
    const { plan, clientId } = built;
    const planKey = `my_${plan.id}`;
    let isNew = true;
    if (clientId) {
      // 다른 사용자의 일정(또는 내 일정이 아닌 행)을 덮어쓰지 못하게 기존 행의 주인을 먼저 본다.
      const existing = await supabaseRequest('GET', `travel_plans?select=user_label,source&plan_key=eq.${enc(planKey)}&limit=1`);
      const row = Array.isArray(existing) ? existing[0] : null;
      if (row && (row.user_label !== userId || row.source !== MY_PLANS_SOURCE)) return sendJson(res, 404, { error: '일정을 찾을 수 없습니다' });
      isNew = !row;
    }
    if (isNew) {
      // 새 일정이면 개수 상한을 본다(덮어쓰기는 개수가 늘지 않으므로 늘 허용).
      const mine = await supabaseRequest('GET', `travel_plans?select=plan_key&${owner}&limit=${MY_PLANS_MAX_PER_USER}`);
      if (Array.isArray(mine) && mine.length >= MY_PLANS_MAX_PER_USER) return sendStoreError(res, 'limit');
    }
    await supabaseRequest('POST', 'travel_plans?on_conflict=plan_key', [myPlanRow(plan)], { prefer: 'return=minimal,resolution=merge-duplicates' });
    return sendJson(res, 200, { saved: plan });
  }
  if (op === 'list') {
    const rows = await supabaseRequest('GET', `travel_plans?select=plan_key,summary,city_label,start_date,days,theme,updated_at&${owner}&order=updated_at.desc&limit=${MY_PLANS_LIST_LIMIT}`);
    const plans = (Array.isArray(rows) ? rows : [])
      .filter((r) => r && typeof r.plan_key === 'string' && r.plan_key.startsWith('my_'))
      .map(myPlanSummaryFromRow);
    return sendJson(res, 200, { plans });
  }
  if (op === 'load') {
    if (!MY_PLAN_ID_RE.test(planId)) return sendJson(res, 404, { error: '일정을 찾을 수 없습니다' });
    const rows = await supabaseRequest('GET', `travel_plans?select=payload&plan_key=eq.${enc(`my_${planId}`)}&${owner}&limit=1`);
    const plan = Array.isArray(rows) && rows[0] ? rows[0].payload : null;
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return sendJson(res, 404, { error: '일정을 찾을 수 없습니다' });
    return sendJson(res, 200, { plan });
  }
  // delete
  if (!MY_PLAN_ID_RE.test(planId)) return sendJson(res, 200, { deleted: false });
  const deleted = await supabaseRequest('DELETE', `travel_plans?plan_key=eq.${enc(`my_${planId}`)}&${owner}&select=plan_key`, undefined, { prefer: 'return=representation' });
  return sendJson(res, 200, { deleted: Array.isArray(deleted) && deleted.length > 0 });
}

// 로컬 개발용 파일 저장소(DATA_DIR/saved_plans.json). users.json에 남은 예전 id의 일정도 같은 사람 것으로 본다.
function myPlansFileStore(res, op, userId, built, planId) {
  const owners = fileStoreOwnerIds(userId);
  const plans = readJsonFile('saved_plans.json');
  const mine = (p) => Boolean(p) && owners.has(p.userId);
  if (op === 'save') {
    const { plan } = built;
    const existIdx = plans.findIndex((p) => mine(p) && p.id === plan.id);
    if (existIdx >= 0) plans[existIdx] = plan;
    else if (plans.filter(mine).length >= MY_PLANS_MAX_PER_USER) return sendStoreError(res, 'limit');
    else plans.push(plan);
    writeJsonFile('saved_plans.json', plans);
    return sendJson(res, 200, { saved: plan });
  }
  if (op === 'list') {
    const myPlans = plans.filter(mine).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    return sendJson(res, 200, { plans: myPlans.map(myPlanSummary) });
  }
  if (op === 'load') {
    const plan = plans.find((p) => mine(p) && p.id === planId);
    if (!plan) return sendJson(res, 404, { error: '일정을 찾을 수 없습니다' });
    return sendJson(res, 200, { plan });
  }
  const kept = plans.filter((p) => !(mine(p) && p.id === planId));
  if (kept.length < plans.length) writeJsonFile('saved_plans.json', kept);
  return sendJson(res, 200, { deleted: kept.length < plans.length });
}

async function handleApi(req, res, parsedUrl) {
  try {
    // Rate limiting — 기본은 소켓 주소, 신뢰하는 프록시(Render·TRUST_PROXY=1) 뒤에서만 X-Forwarded-For의 마지막 값
    const clientIp = clientIpOf(req);
    // 카드 사진 프록시는 한 화면에 여러 장을 불러오므로 별도 한도(분당 120회)로 센다.
    const isPhotoRoute = parsedUrl.pathname === '/api/place-photo';
    if (!checkRateLimit(isPhotoRoute ? `${clientIp}|photo` : clientIp, isPhotoRoute ? 120 : RATE_LIMIT_MAX_REQUESTS)) {
      return sendJson(res, 429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    }

    // CSRF origin validation for POST/PUT/DELETE
    if (!checkCsrf(req)) {
      return sendJson(res, 403, { error: '허용되지 않은 출처의 요청입니다.' });
    }

    // ── OAuth 로그인 라우트 ──
    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/naver') {
      // 설정되지 않은 로그인은 JSON 오류 대신 첫 화면으로 돌려보낸다(화면이 authError로 안내).
      if (!NAVER_CLIENT_ID) { res.writeHead(302, { Location: '/?authError=naver' }); return res.end(); }
      const { state, cookie } = issueOauthState(req, 'naver');
      const url = `https://nid.naver.com/oauth2.0/authorize?client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_BASE_URL + '/api/auth/naver/callback')}&response_type=code&state=${state}`;
      res.writeHead(302, { 'Set-Cookie': cookie, Location: url });
      return res.end();
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/naver/callback') {
      try {
        const code = parsedUrl.searchParams.get('code');
        const state = parsedUrl.searchParams.get('state');
        if (!consumeOauthState(req, 'naver', state)) { res.writeHead(302, { 'Set-Cookie': clearOauthStateCookie(req), Location: '/?authError=invalid_state' }); return res.end(); }
        const naverTokenParams = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: NAVER_CLIENT_ID,
          client_secret: NAVER_CLIENT_SECRET,
          code: code || '',
          state
        });
        const tokenData = await oauthFetch(`https://nid.naver.com/oauth2.0/token?${naverTokenParams.toString()}`);
        const profileData = await oauthFetch('https://openapi.naver.com/v1/nid/me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const p = profileData.response || {};
        const naverId = requireProviderId('naver', p.id);
        const userId = stableUserId('naver', naverId);
        // Naver 이메일은 확인 여부를 알 수 없어 허용 목록 대조에 쓰지 않는다(u_… 또는 naver:<id>로만).
        if (!loginAllowed({ provider: 'naver', providerId: naverId, uid: userId, email: p.email, emailVerified: false })) return rejectNotAllowedLogin(req, res, 'naver');
        const user = findOrCreateUser('naver', naverId, userId, {
          nickname: p.nickname || p.name || 'Naver User',
          email: p.email || '',
          profileImage: p.profile_image || ''
        });
        const sess = createSession({ userId, provider: 'naver', nickname: user.nickname, profileImage: user.profileImage }, req);
        res.writeHead(302, { 'Set-Cookie': [sess.cookie, clearOauthStateCookie(req)], Location: '/' });
        return res.end();
      } catch (err) {
        console.error('[Auth/Naver]', err.message);
        res.writeHead(302, { 'Set-Cookie': clearOauthStateCookie(req), Location: '/?authError=naver' });
        return res.end();
      }
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/kakao') {
      if (!KAKAO_REST_API_KEY) { res.writeHead(302, { Location: '/?authError=kakao' }); return res.end(); }
      // 로그인 CSRF 방지: state를 발급해 이 브라우저의 쿠키에도 묶고, 콜백에서 둘을 대조한다.
      const { state, cookie } = issueOauthState(req, 'kakao');
      const url = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${encodeURIComponent(OAUTH_BASE_URL + '/api/auth/kakao/callback')}&response_type=code&state=${state}`;
      res.writeHead(302, { 'Set-Cookie': cookie, Location: url });
      return res.end();
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/kakao/callback') {
      try {
        const code = parsedUrl.searchParams.get('code');
        const state = parsedUrl.searchParams.get('state');
        if (!consumeOauthState(req, 'kakao', state)) { res.writeHead(302, { 'Set-Cookie': clearOauthStateCookie(req), Location: '/?authError=invalid_state' }); return res.end(); }
        const params = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: KAKAO_REST_API_KEY,
          redirect_uri: OAUTH_BASE_URL + '/api/auth/kakao/callback',
          code: code
        });
        if (KAKAO_CLIENT_SECRET) params.append('client_secret', KAKAO_CLIENT_SECRET);
        const tokenData = await oauthFetch('https://kauth.kakao.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });
        const profileData = await oauthFetch('https://kapi.kakao.com/v2/user/me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const kakaoAcct = profileData.kakao_account || {};
        const kakaoProfile = kakaoAcct.profile || {};
        const kakaoId = requireProviderId('kakao', profileData.id);
        const userId = stableUserId('kakao', kakaoId);
        const kakaoEmailVerified = kakaoAcct.is_email_verified === true && kakaoAcct.is_email_valid !== false;
        if (!loginAllowed({ provider: 'kakao', providerId: kakaoId, uid: userId, email: kakaoAcct.email, emailVerified: kakaoEmailVerified })) return rejectNotAllowedLogin(req, res, 'kakao');
        const user = findOrCreateUser('kakao', kakaoId, userId, {
          nickname: kakaoProfile.nickname || 'Kakao User',
          email: kakaoAcct.email || '',
          profileImage: kakaoProfile.profile_image_url || ''
        });
        const sess = createSession({ userId, provider: 'kakao', nickname: user.nickname, profileImage: user.profileImage }, req);
        res.writeHead(302, { 'Set-Cookie': [sess.cookie, clearOauthStateCookie(req)], Location: '/' });
        return res.end();
      } catch (err) {
        console.error('[Auth/Kakao]', err.message);
        res.writeHead(302, { 'Set-Cookie': clearOauthStateCookie(req), Location: '/?authError=kakao' });
        return res.end();
      }
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/google') {
      if (!GOOGLE_OAUTH_CLIENT_ID) { res.writeHead(302, { Location: '/?authError=google' }); return res.end(); }
      const { state: oauthState, cookie } = issueOauthState(req, 'google');
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_BASE_URL + '/api/auth/google/callback')}&response_type=code&scope=${encodeURIComponent('openid email profile')}&state=${oauthState}`;
      res.writeHead(302, { 'Set-Cookie': cookie, Location: url });
      return res.end();
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/google/callback') {
      try {
        const code = parsedUrl.searchParams.get('code');
        const oauthState = parsedUrl.searchParams.get('state');
        if (!consumeOauthState(req, 'google', oauthState)) {
          res.writeHead(302, { 'Set-Cookie': clearOauthStateCookie(req), Location: '/?authError=invalid_state' });
          return res.end();
        }
        const tokenData = await oauthFetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            client_id: GOOGLE_OAUTH_CLIENT_ID,
            client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
            redirect_uri: OAUTH_BASE_URL + '/api/auth/google/callback',
            grant_type: 'authorization_code'
          })
        });
        const profileData = await oauthFetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const googleId = requireProviderId('google', profileData.id);
        const userId = stableUserId('google', googleId);
        if (!loginAllowed({ provider: 'google', providerId: googleId, uid: userId, email: profileData.email, emailVerified: profileData.verified_email === true })) return rejectNotAllowedLogin(req, res, 'google');
        const user = findOrCreateUser('google', googleId, userId, {
          nickname: profileData.name || 'Google User',
          email: profileData.email || '',
          profileImage: profileData.picture || ''
        });
        const sess = createSession({ userId, provider: 'google', nickname: user.nickname, profileImage: user.profileImage }, req);
        res.writeHead(302, { 'Set-Cookie': [sess.cookie, clearOauthStateCookie(req)], Location: '/' });
        return res.end();
      } catch (err) {
        console.error('[Auth/Google]', err.message);
        res.writeHead(302, { 'Set-Cookie': clearOauthStateCookie(req), Location: '/?authError=google' });
        return res.end();
      }
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/me') {
      const session = parseSession(req);
      if (!session) return sendJson(res, 200, { user: null }, { 'Cache-Control': 'no-store' });
      return sendJson(res, 200, { user: { userId: session.userId, provider: session.provider, nickname: session.nickname, profileImage: session.profileImage } }, { 'Cache-Control': 'no-store' });
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/auth/logout') {
      destroySession(req);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie(req)
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    // ── 내 일정 저장/불러오기 (로그인 필요) ──
    // Supabase가 설정돼 있으면 travel_plans 표(source = 'my-plans'), 없으면(로컬 개발) DATA_DIR/saved_plans.json.
    const myPlansRoute = MY_PLANS_ROUTES.get(parsedUrl.pathname);
    if (myPlansRoute && req.method === myPlansRoute.method) {
      return await handleMyPlans(req, res, parsedUrl, myPlansRoute.op);
    }

    // 무료 Supabase 프로젝트가 활동 없음으로 일시 중지되지 않게 GitHub Actions가 3일마다 부른다(비밀값·행 데이터 없음).
    if (req.method === 'GET' && parsedUrl.pathname === '/api/keepalive') {
      const ka = await supabaseKeepalive();
      return sendJson(res, 200, { ok: true, supabase: ka.supabase, checkedAt: ka.checkedAt }, { 'Cache-Control': 'no-store' });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/providers') {
      return sendJson(res, 200, {
        naver: Boolean(NAVER_CLIENT_ID),
        kakao: Boolean(KAKAO_REST_API_KEY),
        google: Boolean(GOOGLE_OAUTH_CLIENT_ID)
      });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/maps-config') {
      // 지도 공급자. google 모드에서도 브라우저 전용 키만 내려준다(서버 키는 절대 보내지 않음).
      if (MAP_PROVIDER === 'google') {
        if (GOOGLE_MAPS_BROWSER_KEY) return sendJson(res, 200, { provider: 'google', key: GOOGLE_MAPS_BROWSER_KEY });
        warnOnce('maps-browser-key-missing', '[maps] MAP_PROVIDER=google 이지만 GOOGLE_MAPS_BROWSER_KEY가 없어 OpenStreetMap 지도로 응답합니다.');
      }
      return sendJson(res, 200, { provider: 'osm' });
    }

    // Google 장소 사진 프록시 (google 모드 전용, 키는 응답에 절대 나오지 않음)
    if (req.method === 'GET' && parsedUrl.pathname === '/api/place-photo') {
      return handlePlacePhoto(res, parsedUrl);
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/health') {
      const diagnostics = await buildAiDiagnostics({ probe: false });
      return sendJson(res, 200, {
        ok: true,
        app: APP_ID,
        brand: APP_BRAND,
        providers: diagnostics.modes,
        // 무료 모드의 맛집에 핫페퍼(HOTPEPPER_API_KEY)를 쓰는지(값은 내보내지 않음)
        hotpepperConfigured: Boolean(HOTPEPPER_API_KEY),
        supabaseConfigured: hasSupabase(),
        // 마지막 확인 결과(서버 시작 직후·10분마다·저장소 요청 때 갱신, 아직 확인 전이면 null). 설정이 없으면 null.
        // 확인 = 실제 조회(travel_plans?select=id&limit=1)라 주소·키·표가 모두 맞아야 true다.
        // 헬스 체크 자체는 외부 호출을 하지 않는다.
        supabaseReachable: hasSupabase() && _supabaseProbe.at ? _supabaseProbe.state === 'ok' : null,
        // 'ok' | 'auth_error'(키 거부) | 'schema_error'(표 없음) | 'unreachable'(연결 실패·5xx) | null
        supabaseCheck: hasSupabase() && _supabaseProbe.at ? _supabaseProbe.state : null,
        // 쓸 수 있는 SESSION_SECRET이 있는지만(값은 내보내지 않음). false면 재시작할 때마다 로그인이 풀린다.
        sessionSecretConfigured: SESSION_SECRET_CONFIGURED,
        // SESSION_SECRET이 설정됐지만 너무 짧거나 단순해서 쓰지 않았는지(true면 임의 값으로 바꿔야 함)
        sessionSecretWeak: SESSION_SECRET_WEAK,
        // ALLOWED_LOGINS로 로그인할 수 있는 계정을 제한하고 있는지
        loginRestricted: ALLOWED_LOGINS.active,
        ai: {
          geminiConfigured: Boolean(GEMINI_API_KEY),
          geminiModel: GEMINI_API_MODEL,
          // 시도 순서(주 모델 포함), 그 출처('default' | 'env' = GEMINI_FALLBACK_MODELS), 한 번 생성할 때 체인 전체의 시간 예산
          geminiModelChain: GEMINI_MODEL_CHAIN,
          geminiFallbackSource: GEMINI_FALLBACK_SOURCE,
          geminiTotalBudgetMs: GEMINI_TOTAL_BUDGET_MS,
          // 지금 쉬는 모델(한도·과부하·시간 초과·종료): [{ model, secondsLeft }]만, 오류 내용은 없음
          geminiCoolingModels: geminiCoolingModels(),
          openaiConfigured: Boolean(OPENAI_API_KEY),
          openaiModel: OPENAI_MODEL,
          // OpenAI 호환 공급자(OPENAI_BASE_URL의 호스트·이름), 시도 순서(주 모델 + OPENAI_FALLBACK_MODELS), 채팅 해석 공급자 순서
          openaiBaseHost: OPENAI_BASE_HOST,
          openaiProvider: OPENAI_PROVIDER_LABEL,
          // 실제로 쓰는 키의 변수 이름('GROQ_API_KEY' | 'OPENAI_API_KEY' | null). 값은 내보내지 않는다.
          openaiKeySource: OPENAI_KEY_SOURCE,
          openaiModelChain: OPENAI_MODEL_CHAIN,
          chatProviderOrder: AI_CHAT_PROVIDER_ORDER,
          chatParseStrictAi: CHAT_PARSE_STRICT_AI,
          requestTimeoutMs: AI_REQUEST_TIMEOUT_MS,
          geminiKeyFormatOk: diagnostics.providers.gemini.keyFormatOk,
          openaiKeyFormatOk: diagnostics.providers.openai.keyFormatOk
        },
        now: new Date().toISOString()
      });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/ai-diagnostics') {
      const probe = parsedUrl.searchParams.get('probe') === '1';
      if (probe) {
        // 실제 외부 호출(과금 가능)이 일어나므로 토큰이 맞을 때만 허용한다.
        if (!DIAGNOSTICS_TOKEN) return sendJson(res, 403, { error: '진단 검사가 꺼져 있습니다(DIAGNOSTICS_TOKEN 미설정).' });
        if (!diagnosticsTokenMatches(String(req.headers['x-diagnostics-token'] || ''))) {
          return sendJson(res, 403, { error: 'Forbidden' });
        }
      }
      return sendJson(res, 200, await buildAiDiagnostics({ probe }));
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/cities') {
      const cities = Object.entries(CITY_DATA).map(([key, value]) => ({ key, label: value.label, airport: value.airport }));
      return sendJson(res, 200, { cities });
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/ai-travel-chat') {
      const payload = await readBody(req, BODY_LIMIT_PLAN);
      const vErr = validatePayload(payload, API_SCHEMAS['ai-travel-chat']);
      if (vErr) return sendJson(res, 400, { error: vErr });
      // 대화 이력: 배열(최대 12개만 쓴다, 각 500자). 이전 해석: 객체이고 JSON 4KB 이하.
      if (payload.history !== undefined && payload.history !== null && !Array.isArray(payload.history)) return sendJson(res, 400, { error: 'history must be an array' });
      if (payload.prevParsed !== undefined && payload.prevParsed !== null) {
        if (typeof payload.prevParsed !== 'object' || Array.isArray(payload.prevParsed)) return sendJson(res, 400, { error: 'prevParsed must be an object' });
        if (Buffer.byteLength(JSON.stringify(payload.prevParsed), 'utf8') > 4096) return sendJson(res, 400, { error: 'prevParsed exceeds 4KB' });
      }
      // 지금 일정(대화로 일부만 고치기): 객체(아니면 400). 날 12개·블록 60줄(각 300자)까지만 쓴다(sanitizeEditItinerary).
      if (payload.itinerary !== undefined && payload.itinerary !== null && (typeof payload.itinerary !== 'object' || Array.isArray(payload.itinerary))) {
        return sendJson(res, 400, { error: 'itinerary must be an object' });
      }
      // 아직 고르지 않은 되묻기 선택지(글로 답하기): 배열(아니면 400). 8개·각 120자까지만 쓴다(sanitizeEditChoices).
      if (payload.editChoices !== undefined && payload.editChoices !== null && !Array.isArray(payload.editChoices)) {
        return sendJson(res, 400, { error: 'editChoices must be an array' });
      }
      return sendJson(res, 200, await buildTravelChatPlan(payload));
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/destinations') {
      const payload = await readBody(req, BODY_LIMIT_DEFAULT);
      return sendJson(res, 200, await recommendDestinations(payload));
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/itinerary') {
      const payload = await readBody(req, BODY_LIMIT_DEFAULT);
      const rec = await recommendDestinations({ ...payload, limit: Math.max(6, Math.min(12, Number(payload.days || 3) * 2)) });
      return sendJson(res, 200, createItinerary({ ...payload, _picks: rec.picks }));
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/travel-plan') {
      const payload = await readBody(req, BODY_LIMIT_PLAN);
      // Input sanitization
      if (payload.city && String(payload.city).length > 50) return sendJson(res, 400, { error: 'Invalid city' });
      if (payload.theme && String(payload.theme).length > 30) return sendJson(res, 400, { error: 'Invalid theme' });
      if (payload.days && (Number(payload.days) < 1 || Number(payload.days) > 30)) return sendJson(res, 400, { error: 'Invalid days' });
      const vErr = validatePayload(payload, API_SCHEMAS['travel-plan']);
      if (vErr) return sendJson(res, 400, { error: vErr });
      for (const field of ['mustVisit', 'excludedPlaces', 'foodWishes', '_picks']) {
        if (payload[field] !== undefined && payload[field] !== null && !Array.isArray(payload[field])) delete payload[field]; // 배열이 아니면 무시
      }
      const planResult = await buildTravelPlan(payload);
      // Add budget breakdown
      const days = Number(payload.days || planResult.itinerary?.length || 3);
      const budgetTier = payload.budget || 'mid';
      const dailyRates = { low: { meal: 35000, transport: 15000, activity: 15000 }, mid: { meal: 55000, transport: 22000, activity: 25000 }, high: { meal: 90000, transport: 30000, activity: 45000 } };
      const rates = dailyRates[budgetTier] || dailyRates.mid;
      planResult.budgetBreakdown = {
        meal: { perDay: rates.meal, total: rates.meal * days, label: '\uc2dd\ube44' },
        transport: { perDay: rates.transport, total: rates.transport * days, label: '\uad50\ud1b5\ube44' },
        activity: { perDay: rates.activity, total: rates.activity * days, label: '\ud65c\ub3d9\ube44' },
        days,
        budgetTier,
        estimatedDailyTotal: rates.meal + rates.transport + rates.activity,
        estimatedTotal: (rates.meal + rates.transport + rates.activity) * days
      };
      return sendJson(res, 200, planResult);
    }

    // ── Supabase 일정 저장소 (로그인 필요, 자기 일정만) ──
    // user_label 열에 로그인 사용자 id를 넣고, 목록·조회는 그 사용자 것만 돌려준다.
    if (req.method === 'POST' && parsedUrl.pathname === '/api/travel-plan/save') {
      res.setHeader('Cache-Control', 'no-store');
      const session = parseSession(req);
      if (!session) return sendJson(res, 401, { error: '로그인이 필요합니다' });
      const payload = await readBody(req, BODY_LIMIT_LARGE);
      const vErr = validatePayload(payload, API_SCHEMAS['travel-plan-save']);
      if (vErr) return sendJson(res, 400, { error: vErr });
      if (payload.plan !== undefined && (!payload.plan || typeof payload.plan !== 'object' || Array.isArray(payload.plan))) {
        return sendJson(res, 400, { error: 'plan must be an object' });
      }
      if (payload.planKey !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(payload.planKey)) {
        return sendJson(res, 400, { error: 'Invalid planKey' });
      }
      if (payload.startDate && !normalizeIsoDate(payload.startDate)) return sendJson(res, 400, { error: 'Invalid startDate' });
      // 저장소를 쓸 수 없으면 AI·장소 검색을 돌리기 전에 멈춘다.
      if (await supabaseUnavailableResponse(res)) return;
      const userId = String(session.userId || '');
      const planKey = payload.planKey || randomUUID();
      let isNewRow = true;
      if (payload.planKey) {
        // 다른 사용자의 plan_key를 덮어쓰지 못하게 기존 행의 주인을 확인한다.
        const existing = await supabaseRequest('GET', `travel_plans?select=user_label&plan_key=eq.${encodeURIComponent(planKey)}&limit=1`);
        if (existing[0] && existing[0].user_label !== userId) return sendJson(res, 404, { error: '일정을 찾을 수 없습니다' });
        isNewRow = !existing[0];
      }
      if (isNewRow) {
        // 내 일정과 같은 개수 상한(이 사용자의 모든 행 기준). 비싼 일정 만들기 전에 본다.
        const mine = await supabaseRequest('GET', `travel_plans?select=plan_key&user_label=eq.${encodeURIComponent(userId)}&limit=${MY_PLANS_MAX_PER_USER}`);
        if (Array.isArray(mine) && mine.length >= MY_PLANS_MAX_PER_USER) return sendStoreError(res, 'limit');
      }
      const plan = storeSafeValue(payload.plan || await buildTravelPlan(payload));
      if (jsonBytes(plan) > MY_PLAN_MAX_BYTES) return sendStoreError(res, 'tooLarge');
      const cityKey = cityKeyByInput(payload.city || plan.city);
      const row = {
        plan_key: planKey,
        user_label: userId,
        city_key: cityKey,
        city_label: storeSafeString(String(plan.city || CITY_DATA[cityKey]?.label || '').slice(0, 80)),
        theme: payload.theme || 'mixed',
        budget: payload.budget || 'mid',
        start_date: normalizeIsoDate(payload.startDate) || null,
        days: Number(payload.days || plan.itinerary?.length || 0),
        summary: storeSafeString(String(plan.summary || '').slice(0, 500)),
        source: storeSafeString(String(plan.source || 'integrated_travel_planner_v1').slice(0, 80)),
        payload: plan
      };
      const saved = await supabaseRequest('POST', 'travel_plans?on_conflict=plan_key', [row]);
      return sendJson(res, 200, { saved: saved[0] || row });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/travel-plan/list') {
      res.setHeader('Cache-Control', 'no-store');
      const session = parseSession(req);
      if (!session) return sendJson(res, 401, { error: '로그인이 필요합니다' });
      if (await supabaseUnavailableResponse(res)) return;
      const limitRaw = Number(parsedUrl.searchParams.get('limit') || 20);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 20;
      const route = `travel_plans?select=plan_key,city_key,city_label,theme,budget,start_date,days,summary,source,created_at&user_label=eq.${encodeURIComponent(String(session.userId || ''))}&order=created_at.desc&limit=${limit}`;
      const rows = await supabaseRequest('GET', route);
      return sendJson(res, 200, { plans: rows });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/travel-plan/get') {
      res.setHeader('Cache-Control', 'no-store');
      const session = parseSession(req);
      if (!session) return sendJson(res, 401, { error: '로그인이 필요합니다' });
      const planKey = String(parsedUrl.searchParams.get('planKey') || '');
      if (!planKey) return sendJson(res, 400, { error: 'planKey is required' });
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(planKey)) return sendJson(res, 400, { error: 'Invalid planKey' });
      if (await supabaseUnavailableResponse(res)) return;
      const rows = await supabaseRequest('GET', `travel_plans?select=*&plan_key=eq.${encodeURIComponent(planKey)}&user_label=eq.${encodeURIComponent(String(session.userId || ''))}&limit=1`);
      if (!rows[0]) return sendJson(res, 404, { error: '일정을 찾을 수 없습니다' });
      return sendJson(res, 200, { plan: rows[0] });
    }

    // (/api/rakuten-config 제거: Rakuten 키는 서버에서만 쓴다. fx-rate 핸들러는 아래에 있음)

    // 항공·숙소: 실시간 공급자 1곳 → 없거나 결과가 없으면 "예시 데이터"(mock, 실제 가격 아님)로 분명히 표시한다.
    if (req.method === 'POST' && parsedUrl.pathname === '/api/flights') {
      const payload = await readBody(req, BODY_LIMIT_SMALL);
      const vErr = validatePayload(payload, API_SCHEMAS.flights);
      if (vErr) return sendJson(res, 400, { error: vErr });
      let allCandidates = [];
      let source = 'mock';
      let dateMatch = null;
      let reasonCode = TRAVELPAYOUTS_TOKEN ? null : 'PROVIDER_UNAVAILABLE';

      // 1순위: Travelpayouts (최근 검색 기준 캐시 가격). 요청 날짜가 비면 가까운 날짜까지 찾는다.
      if (TRAVELPAYOUTS_TOKEN) {
        try {
          const tp = await fetchTravelpayoutsFlights(payload);
          allCandidates = tp.items;
          dateMatch = tp.dateMatch;
          if (allCandidates.length > 0) source = 'travelpayouts_live';
          else reasonCode = 'NO_LIVE_DATA';
        } catch (err) {
          reasonCode = err?.reasonCode || 'PROVIDER_UNAVAILABLE';
        }
      }

      // 2순위: 예시 데이터
      if (allCandidates.length === 0) {
        allCandidates = flightCandidates(payload);
        source = 'mock';
        dateMatch = null;
      }
      console.log('[flights] source:', { source, reasonCode, dateMatch, count: allCandidates.length });

      const note = source === 'mock'
        ? (reasonCode === 'NO_LIVE_DATA'
          ? '이 날짜 전후로 조회된 항공권 가격이 없어 예시 데이터를 보여드려요. 실제 가격이 아니니 예약 전에 꼭 확인하세요.'
          : '실시간 항공권 조회를 쓸 수 없어 예시 데이터를 보여드려요. 실제 가격이 아니니 예약 전에 꼭 확인하세요.')
        : (dateMatch === 'nearby' ? '요청한 날짜의 가격 정보가 없어 가까운 날짜의 최근 검색 가격을 보여드려요.' : '');
      const ranked = rankFlights({ ...payload, _candidates: allCandidates });
      const airports = Array.from(new Set(allCandidates.flatMap((x) => x.airports)));
      const airlines = Array.from(new Set(allCandidates.flatMap((x) => x.airlines)));
      return sendJson(res, 200, {
        source,
        sourceInfo: source === 'mock' ? sourceInfo('mock', 'mock', reasonCode || 'NO_LIVE_DATA') : sourceInfo('live', 'travelpayouts'),
        note,
        dateMatch, // 'exact' | 'nearby'(요청 날짜에 가격이 없어 ±7일 안의 가까운 날짜) | null(예시 데이터)
        tripType: payload.tripType || 'oneway',
        preference: payload.preference || 'balanced',
        recommendation: ranked[0] || null,
        total: ranked.length,
        filterOptions: { airports, airlines },
        flights: ranked
      });
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/stays') {
      const payload = await readBody(req, BODY_LIMIT_SMALL);
      const vErr = validatePayload(payload, API_SCHEMAS.stays);
      if (vErr) return sendJson(res, 400, { error: vErr });
      let all = [];
      let source = 'mock';
      let reasonCode = RAKUTEN_APP_ID ? null : 'PROVIDER_UNAVAILABLE';
      // 'exact'(요청 날짜의 빈방·요금) | 'none'(그 날짜 빈방이 없어 날짜 조건 없는 숙소 목록·최저가) | null(예시 데이터)
      let dateMatch = null;

      // 1순위: Rakuten Travel API (무료, 일본 특화)
      if (RAKUTEN_APP_ID) {
        try {
          const rk = await fetchRakutenHotels(payload);
          all = rk.items;
          if (all.length > 0) {
            source = 'rakuten_live';
            dateMatch = rk.dateMatch;
            if (dateMatch === 'none') reasonCode = 'NO_LIVE_DATA';
          } else reasonCode = 'NO_LIVE_DATA';
        } catch (err) {
          reasonCode = err?.reasonCode || 'PROVIDER_UNAVAILABLE';
        }
      }

      // 2순위: 예시 데이터
      if (all.length === 0) {
        all = stayCandidates(payload);
        source = 'mock';
        dateMatch = null;
      }
      console.log('[stays] source:', { source, reasonCode, dateMatch, count: all.length });

      const note = source === 'mock'
        ? (reasonCode === 'NO_LIVE_DATA'
          ? '이 조건으로 예약 가능한 숙소를 찾지 못해 예시 데이터를 보여드려요. 실제 숙소·가격이 아니니 예약 전에 꼭 확인하세요.'
          : '실시간 숙소 조회를 쓸 수 없어 예시 데이터를 보여드려요. 실제 숙소·가격이 아니니 예약 전에 꼭 확인하세요.')
        : (dateMatch === 'none'
          ? '해당 날짜의 빈방 정보가 없어 숙소 목록과 최저가만 보여드려요. 실제 빈방·요금은 예약 페이지에서 확인하세요.'
          : '');
      const stayLang = normalizeLang(payload.lang);
      // 예시 숙소 지역명은 순위를 매긴 뒤(선호 지역은 한글로 비교) 언어에 맞춘다.
      const ranked = rankStays({ ...payload, _candidates: all })
        .map((s) => (s.sample && stayLang !== 'ko'
          ? { ...s, area: localizeCuratedArea(s.area, stayLang, localizedCityName(cityKeyByInput(payload.city || 'tokyo'), stayLang)) }
          : s));
      const providers = Array.from(new Set(all.map((x) => x.provider)));
      const amenities = Array.from(new Set(all.flatMap((x) => x.amenities || [])));
      let staysInfo;
      if (source === 'mock') staysInfo = sourceInfo('mock', 'mock', reasonCode || 'NO_LIVE_DATA');
      else if (dateMatch === 'none') staysInfo = sourceInfo('fallback', 'rakuten', 'NO_LIVE_DATA'); // 실시간 요금이 아님
      else staysInfo = sourceInfo('live', 'rakuten');
      return sendJson(res, 200, {
        source,
        sourceInfo: staysInfo,
        note,
        dateMatch,
        city: payload.city || 'tokyo',
        total: ranked.length,
        filterOptions: { providers, amenities },
        stays: ranked
      });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/foods') {
      const payload = {
        city: parsedUrl.searchParams.get('city') || parsedUrl.searchParams.get('query') || 'tokyo',
        genre: parsedUrl.searchParams.get('genre') || '',
        budget: parsedUrl.searchParams.get('budget') || 'mid',
        lang: parsedUrl.searchParams.get('lang') || 'ko'
      };

      if (GOOGLE_PLACES_ENABLED) {
        let reasonCode = null;
        try {
          let foodLat = parsedUrl.searchParams.get('lat');
          let foodLng = parsedUrl.searchParams.get('lng');
          const foodCityKey = cityKeyByInput(payload.city);
          const foodCityLabel = CITY_DATA[foodCityKey].label;
          if (!foodLat || !foodLng) {
            // 정적 도시 좌표 (Geocoding 호출 없음)
            const foodCenter = resolveCityCenter(foodCityKey);
            if (foodCenter) { foodLat = foodCenter.lat; foodLng = foodCenter.lng; }
          }
          const places = await fetchFoodPlacesForCity(
            foodCityLabel,
            foodLat,
            foodLng,
            payload.genre,
            payload.budget,
            payload.lang
          );
          if (Array.isArray(places) && places.length > 0) {
            return sendJson(res, 200, { source: 'google_places', sourceInfo: sourceInfo('live', 'google_places'), city: payload.city, list: places });
          }
          reasonCode = 'NO_RESULTS';
        } catch (err) {
          reasonCode = err?.reasonCode || 'GOOGLE_ERROR';
          if (!err?.reasonCode) warnThrottled('foods:error', `[foods] 맛집 검색 실패: ${redactGoogleKey(err?.message || err)}`);
        }
        const fallback = tabelogStyleFoods(payload);
        return sendJson(res, 200, {
          ...fallback,
          sourceInfo: sourceInfo('fallback', 'curated', reasonCode),
          warning: classifyGooglePlacesFailure(reasonCode)
        });
      }

      // 무료 모드 + HOTPEPPER_API_KEY: 도시 중심 3km 안 실제 가게(최대 30곳). 없거나 실패하면 내장 맛집 목록.
      if (HOTPEPPER_API_KEY) {
        const hpCity = cityKeyByInput(payload.city);
        const hp = await fetchHotpepperShops(hpCity, { genre: payload.genre, count: 30, lang: payload.lang });
        if (hp.shops.length) {
          return sendJson(res, 200, { source: 'hotpepper', sourceInfo: sourceInfo('live', 'hotpepper'), city: CITY_DATA[hpCity]?.label || payload.city, list: hp.shops });
        }
        const curatedHp = tabelogStyleFoods(payload);
        return sendJson(res, 200, { ...curatedHp, sourceInfo: sourceInfo('fallback', 'curated', hp.reasonCode || curatedHp.reasonCode || null) });
      }

      const curated = tabelogStyleFoods(payload);
      return sendJson(res, 200, { ...curated, sourceInfo: sourceInfo('curated', 'curated', curated.reasonCode || null) });
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/dest-search') {
      const payload = await readBody(req, BODY_LIMIT_SMALL);
      const result = await recommendDestinations({
        city: payload.city || 'tokyo',
        theme: payload.theme || 'mixed',
        pace: 'normal',
        budget: payload.budget || 'mid',
        limit: payload.limit || 20,
        lang: payload.lang || 'ko'
      });
      return sendJson(res, 200, {
        source: result.source || 'unknown',
        sourceInfo: result.sourceInfo || sourceInfo('curated', 'curated+wikimedia'),
        destinations: result.picks || []
      });
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/route-cost') {
      const payload = await readBody(req, BODY_LIMIT_SMALL);
      // 장소 이름 목록만 받는다(최대 12곳, 각 80자). 무료 모드에서는 Google 호출 없이 좌표로 거리를 추정한다.
      const places = Array.isArray(payload.places)
        ? payload.places.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim().slice(0, 80)).slice(0, 12)
        : [];
      const city = typeof payload.city === 'string' && payload.city.trim() ? payload.city.trim().slice(0, 50) : 'tokyo';
      // lang(ko/en/ja)을 보내면 그 언어로, 없으면 장소 이름 글자로 짐작해 안내 문구를 쓴다.
      // 같은 도시·언어·장소 목록은 30분 동안 결과를 재사용한다(AI 호출을 반복하지 않게).
      const langIn = typeof payload.lang === 'string' ? payload.lang : '';
      const cacheKey = `${city}|${routeCostLang(langIn, places)}|${places.join('|')}`;
      const cached = _routeCostCache.get(cacheKey);
      if (cached && (Date.now() - cached.at) < ROUTE_COST_CACHE_TTL_MS) return sendJson(res, 200, cached.result);
      const result = await calculateRouteCost(places, city, langIn);
      if (Array.isArray(result?.segments) && result.segments.length > 0) {
        _routeCostCache.set(cacheKey, { at: Date.now(), result });
        while (_routeCostCache.size > 200) _routeCostCache.delete(_routeCostCache.keys().next().value);
      }
      return sendJson(res, 200, result);
    }


    if (req.method === 'GET' && parsedUrl.pathname === '/api/fx-rate') {
      return sendJson(res, 200, {
        jpyToKrw: Math.round(fxJpyKrw * 100) / 100,
        usdToKrw: Math.round(fxUsdKrw),
        krwToJpy100: Math.round(100 / fxJpyKrw * 100) / 100,
        yen100toKrw: Math.round(100 * fxJpyKrw),
        man1wonToYen: Math.round(10000 / fxJpyKrw),
        lastUpdate: fxLastUpdate || 'N/A',
        // 'live' 실시간 | 'env' 운영자가 정한 고정값(FX_USD_KRW·FX_JPY_KRW) | 'approximate' 코드에 넣은 대략값
        source: fxSource,
        provider: fxProvider,
        approximate: fxSource !== 'live',
        stale: fxSource === 'live' && (Date.now() - fxLiveAt) > 36 * 60 * 60 * 1000
      });
    }

    // 날씨: /api/cities의 모든 도시(동적 도시 포함)를 서버가 좌표로 바꿔 open-meteo(무료·키 없음)에서 가져온다.
    // 위치를 모르면 다른 도시 날씨를 보여주지 않고 오류를 돌려준다.
    if (req.method === 'GET' && parsedUrl.pathname === '/api/weather') {
      const cityParam = String(parsedUrl.searchParams.get('city') || 'tokyo').trim().slice(0, 60) || 'tokyo';
      const loc = await resolveCityCoordsForInput(cityParam);
      if (!loc) {
        return sendJson(res, 404, { city: cityParam, error: '이 도시의 위치를 찾지 못해 날씨를 불러오지 못했어요.' });
      }
      const weather = await fetchWeatherDaily(loc.lat, loc.lng);
      if (!weather) {
        return sendJson(res, 502, { city: loc.key || cityParam, error: '날씨 정보를 잠시 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' });
      }
      return sendJson(res, 200, {
        city: loc.key || cityParam,
        cityLabel: loc.label,
        lat: Math.round(loc.lat * 10000) / 10000,
        lng: Math.round(loc.lng * 10000) / 10000,
        daily: weather
      });
    }

    return sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    if (res.headersSent) {
      try { res.end(); } catch { /* 이미 닫힘 */ }
      return;
    }
    // 원문 오류는 서버 로그에만 남기고, 응답에는 짧은 안내만 보낸다(원시 오류·비밀값 노출 방지).
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 413) return sendJson(res, 413, { error: '요청 내용이 너무 큽니다.' }, { Connection: 'close' });
    if (status === 400) return sendJson(res, 400, { error: '요청 형식이 올바르지 않습니다.' });
    // Supabase 호출 실패(/api/travel-plan/save·list·get 등): 500 대신 저장소 503(원문은 로그에만, 키는 가림).
    // 저장할 내용을 저장소가 거절한 4xx(400·409·413·422 …)는 400 INVALID_PLAN(다시 시도해도 같으므로 '연결 불가'로 안내하지 않음).
    if (err?.supabase) {
      const kind = noteSupabaseFailure(err);
      warnThrottled(`supabase:api:${parsedUrl.pathname}:${err.status || 'net'}:${err.pgCode || ''}`, `[supabase] ${req.method} ${parsedUrl.pathname} 저장소 오류: ${redactSupabaseKey(err.message)}`);
      return sendStoreError(res, kind === 'content' && req.method === 'POST' ? 'invalid' : 'unavailable');
    }
    console.error(`[api] ${req.method} ${parsedUrl.pathname} 처리 실패:`, redactSupabaseKey(redactRakutenKeys(redactTravelpayoutsToken(redactGoogleKey(err?.message || err)))));
    return sendJson(res, 500, { error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}

function serveStatic(req, res, parsedUrl) {
  let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  filePath = path.join(PUBLIC_DIR, path.normalize(filePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    // 캐시: 파일 크기·수정 시각으로 약한 ETag. html/js/css는 매번 확인(no-cache), 아이콘·매니페스트·이미지는 하루.
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const lastModified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toUTCString();
    const longCache = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.webmanifest'].includes(ext);
    const cacheControl = longCache ? 'public, max-age=86400' : 'no-cache';
    const securityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()'
    };
    const inm = String(req.headers['if-none-match'] || '');
    const ims = Date.parse(String(req.headers['if-modified-since'] || ''));
    const etagHit = inm && inm.split(',').map((t) => t.trim()).some((t) => t === '*' || t === etag || t.replace(/^W\//, '') === etag.replace(/^W\//, ''));
    const timeHit = !inm && Number.isFinite(ims) && Math.floor(stat.mtimeMs / 1000) * 1000 <= ims;
    if (etagHit || timeHit) {
      res.writeHead(304, { ETag: etag, 'Last-Modified': lastModified, 'Cache-Control': cacheControl, ...securityHeaders });
      res.end();
      return;
    }
    serveStaticFile(res, filePath, ext, { ETag: etag, 'Last-Modified': lastModified, 'Cache-Control': cacheControl, ...securityHeaders });
  });
}

function serveStaticFile(res, filePath, ext, headers) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.webmanifest': 'application/manifest+json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'text/plain; charset=utf-8',
      ...headers
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  if (parsedUrl.pathname.startsWith('/api/')) return handleApi(req, res, parsedUrl);
  return serveStatic(req, res, parsedUrl);
});

// Graceful error handling - prevent server crash on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[WARN] Unhandled rejection:', reason instanceof Error ? reason.message : reason);
});

server.listen(PORT, () => {
  console.log(`${APP_BRAND} — ${APP_TAGLINE.ko} server running at http://localhost:${PORT} (places=${PLACES_PROVIDER}, map=${MAP_PROVIDER})`);
  // /api/health의 supabaseReachable을 처음부터 채운다: 시작 직후 한 번(기다리지 않음) + 실행 중 10분마다.
  if (hasSupabase()) {
    supabaseStatus({ force: true }).catch(() => {});
    setInterval(() => { supabaseStatus({ force: true }).catch(() => {}); }, 10 * 60_000).unref();
  }
});
