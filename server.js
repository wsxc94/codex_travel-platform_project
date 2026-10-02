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
const OPENAI_API_KEY = envValue('OPENAI_API_KEY', 'OPENAI_KEY');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
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
  'Every 점심/저녁 block is a name from foods; a food may be used again on another day, but never write a placeholder such as "자유 식사" or "free meal".',
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
//  - 큐레이션 명소(highlights·MUST_ATTRACTIONS·EXTRA_PLACES)가 반나절 명소 12곳에 못 미치는 도시를 채운다.
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
        const aliases = (Array.isArray(p.aliases) ? p.aliases : []).map((a) => text(a, 80)).filter(Boolean).slice(0, 4);
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

// 도시마다: 이미 있는 이름(큐레이션 명소·대표 명소·추가 명소)과 겹치지 않는 것만 EXTRA_PLACES에 붙이고,
// 도시 명소(highlights)가 3곳보다 적으면 앞쪽(하루짜리가 아닌) 명소로 채운다.
for (const [ck, c] of CITY_PLACES.cities) {
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

// 도시 주변 반나절 명소가 적은 도시인지(few) — 일정 팁으로 알린다
function cityHasFewSights(cityKey) {
  return Boolean(CITY_PLACES.cities.get(String(cityKey || ''))?.few);
}

// 도시 주변 실제 명소(generated)의 이름 중 말로 한 장소 찾기에 쓰는 이름. 다른 도시의 대표·큐레이션 명소나 도시 이름과 같은 이름
// (구시로의 'Itsukushima Shrine'), 두 도시 이상에 같은 이름이 있는 것, 두 글자 이하('城山')·한 단어 로마자 6자 미만('Toro')은 뺀다
// → 'Hiroshima 2 days, must see Itsukushima Shrine'이 구시로로, 'toro sushi'가 시즈오카 토로 유적으로 가지 않는다.
let GENERATED_MATCH_NAMES = null;
function generatedMatchNames(e) {
  if (!GENERATED_MATCH_NAMES) {
    const owners = new Map(); // 이름 키 → Set(cityKey)
    const add = (label, owner) => { const k = cityPlaceKey(label); if (!k) return; if (!owners.has(k)) owners.set(k, new Set()); owners.get(k).add(owner); };
    for (const m of MUST_ATTRACTIONS) [m.name, ...(m.aliases || []), ...(m.contextAliases || [])].forEach((a) => add(a, m.cityKey));
    for (const [ck, c] of Object.entries(CITY_DATA)) {
      for (const h of c.highlights || []) if (!h.generated) add(h.name, ck);
      for (const a of CITY_ALIASES[ck] || []) add(a, ck);
    }
    for (const x of EXTRA_PLACES) if (!x.generated) [x.name, x.en, x.ja, ...(x.aliases || [])].forEach((a) => add(a, x.cityKey));
    const genCities = new Map();
    for (const x of EXTRA_PLACES) {
      if (!x.generated) continue;
      for (const k of new Set([x.name, x.en, x.ja, ...(x.aliases || [])].filter(Boolean).map(cityPlaceKey))) {
        if (!genCities.has(k)) genCities.set(k, new Set());
        genCities.get(k).add(x.cityKey);
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
        return (genCities.get(k)?.size || 0) <= 1;
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

// 도시 없이 장소 이름만 말한 글('다케토미섬 2일', 'Hashima Island 2 days')의 도시: 그 장소(추가 명소·도시 주변 실제 명소)의 도시.
// 세 글자 이상 이름만 보고, 가장 긴 이름이 여러 도시에 걸치면 정하지 않는다.
function cityOfNamedPlace(text) {
  const hits = extraPlaceHits(text).filter((h) => h.len >= 3 || SHORT_CJK_NAME_RE.test(String(h.label).trim()));
  if (!hits.length) return '';
  const longest = Math.max(...hits.map((h) => h.len));
  const cities = new Set(hits.filter((h) => h.len === longest).map((h) => h.place.cityKey));
  return cities.size === 1 ? [...cities][0] : '';
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

// 이름·별칭·en/ja 이름이 정확히 같은 추가 명소(대소문자·공백 무시)
function extraPlaceByName(name) {
  const k = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (!k) return null;
  return EXTRA_PLACES.find((e) => [e.name, e.en, e.ja, ...(e.aliases || [])].some((a) => a && String(a).toLowerCase().replace(/\s+/g, '') === k)) || null;
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
    .replace(/\bday\s*(\d{1,2})\b/gi, ' ')
    .replace(/(\d{1,2})(?:st|nd|rd|th)\s+day\b/gi, ' ');
}

// 일수 증감 표현("하루 더 늘려줘", "이틀 줄여줘", "add one more day", "1日増やして")과 '1日2か所' 같은 하루 장소 수 표현.
// 여행 전체 일수가 아니라서 일수 계산 전에 지운다(후속 대화의 증감은 applyFollowUpRules가 따로 처리한다).
const EN_NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const JA_NUMBER_CHARS = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
const KO_DAY_WORDS = { '하루': 1, '이틀': 2, '사흘': 3, '나흘': 4, '닷새': 5, '엿새': 6 };
function stripDayDeltaPhrases(text) {
  return String(text || '')
    .replace(/(하루|이틀|사흘|나흘|\d{1,2}\s*일)\s*(?:만|정도|씩)?\s*(?:더\s*)?(?:늘|추가|연장|줄|빼|단축|덜)/g, ' ')
    .replace(/(하루|이틀|사흘|나흘|\d{1,2}\s*일)\s*더/g, ' ')
    .replace(/\b(?:add|extend(?:\s+(?:it|the\s+trip))?(?:\s+by)?|remove|cut|drop|shorten(?:\s+(?:it|the\s+trip))?(?:\s+by)?)\s+(?:(?:an?|one|two|three|\d{1,2})\s+)?(?:more\s+|extra\s+)?days?\b/gi, ' ')
    .replace(/\b(?:an?|one|two|three|\d{1,2})\s+(?:more|extra|less|fewer)\s+days?\b/gi, ' ')
    .replace(/(?:もう\s*)?[1-9一二三]\s*日\s*(?:増やし|追加|延長|伸ば|減らし|短く|短縮)/g, ' ')
    .replace(/もう\s*[1-9一二三]\s*日/g, ' ')
    .replace(/1\s*日\s*[1-5]\s*(?:か所|ヶ所|カ所|箇所|ヵ所)/g, ' ');
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
// 단어 바로 뒤에 붙는 부정 꼬리(조사 포함)
const NEGATION_TAIL_SRC = '\\s*(?:은|는|을|를|이|가|도|은요|는요|は|を|も)?\\s*(?:빼고|빼줘|빼 줘|빼주세요|빼|제외하고|제외|말고|없이|대신|안\\s*가|안\\s*갈|안\\s*해|skip|なし|抜きで|抜き|以外|の代わりに|には行かない|行かない)';
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
    const add = (l) => { const s = String(l || '').toLowerCase().trim(); if (/[a-z]\s+no\s+[a-z]/.test(s)) set.add(s); };
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

function negatedPhrases(text) {
  const raw = String(text || '');
  const out = [];
  for (const m of raw.matchAll(NEGATED_PHRASE_RE)) out.push(m[0]);
  for (const m of enNegatedMatches(raw)) out.push(m.text);
  return out;
}

// 부정된 구절을 지운 글(테마·가고 싶은 곳 판정용)
function stripNegatedPhrases(text) {
  let out = String(text || '').replace(NEGATED_PHRASE_RE, ' ');
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

// 'X 대신 Y' (X는 빼고 Y를 넣는다)
function parseInsteadPhrase(text) {
  const m = /([^\s,.!?]+?)\s*(?:은|는|을|를)?\s*대신(?:에)?\s*([^\s,.!?]+)/.exec(String(text || ''));
  if (!m) return null;
  return { from: m[1].replace(/(은|는|을|를|이|가)$/, ''), to: m[2].replace(/(으로|로|을|를|이|가|은|는|넣어.*|추가.*)$/, '') };
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
// hints = { allDay: [이름], evening: [이름] }: 말로 한 "당일치기 하루"·"저녁에"
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
    const extra = mustMeta ? null : extraPlaceByName(name);
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
  '교토|나라': '전철 약 45~60분'
};

// 도시 중심 사이가 이보다 멀면 기차·버스 1~3시간 거리가 아니다(도쿄 → 이시가키, 히로시마 → 구시로): 비행기 이동으로 알린다
const FLIGHT_TRANSFER_KM = 250;
function transferHint(fromCity, toCity) {
  const a = String(fromCity || '').trim();
  const b = String(toCity || '').trim();
  if (!a || !b || a === b) return '대중교통 기준 이동';
  const key1 = `${a}|${b}`;
  const key2 = `${b}|${a}`;
  if (CITY_TRANSFER_HINTS[key1] || CITY_TRANSFER_HINTS[key2]) return CITY_TRANSFER_HINTS[key1] || CITY_TRANSFER_HINTS[key2];
  const ca = CITY_CENTER_COORDS[cityKeyForExactLabel(a)];
  const cb = CITY_CENTER_COORDS[cityKeyForExactLabel(b)];
  if (ca && cb && haversineKm(ca, cb) > FLIGHT_TRANSFER_KM) return '비행기 이동, 공항 오가는 시간 포함 반나절 이상';
  return '대중교통 기준 1~3시간';
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

function extractRegionDayPlanFromText(text, fallbackCityKey = '') {
  const raw = String(text || '');
  if (!raw) return [];
  const byCityWindow = [];
  const mentions = detectCityMentionsDetailed(raw);
  for (let i = 0; i < mentions.length; i += 1) {
    const curr = mentions[i];
    const next = mentions[i + 1];
    const end = next ? next.idx : raw.length;
    const window = raw.slice(curr.idx, end);
    const cityLabel = CITY_DATA[curr.key]?.label || '';
    if (!cityLabel) continue;
    const night = window.match(/(\d{1,2})\s*박/i);
    const day = window.match(/(\d{1,2})\s*일/i);
    if (night) byCityWindow.push({ cityLabel, days: clamp(Number(night[1]), 1, 10), unit: 'night' });
    else if (day) byCityWindow.push({ cityLabel, days: clamp(Number(day[1]), 1, 10), unit: 'day' });
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

function allocateDaysByCities(routeCities, picks, totalDays, regionDayPlan = []) {
  const days = Math.max(1, Number(totalDays) || 1);
  if (!Array.isArray(routeCities) || routeCities.length === 0) return new Array(days).fill('');
  if (routeCities.length === 1) return routeCities.flatMap((c) => new Array(days).fill(c));

  const normalizedPlan = normalizeRegionDayPlan(regionDayPlan, []);
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

const REGION_SEGMENT_STOP_WORDS = new Set(['여행', '일정', '총', '전체', '하루', '이틀', '주말', '평일', '연휴', '휴가', '겨울', '여름', '가을', '정도', '최소', '최대', '대략', '그리고', '추가', '포함', '부모님', '가족', '친구', '혼자', '커플', '먹방', '온천', '료칸', '위주', '중심']);

// "오사카 3일 교토 2일 나라 1일"처럼 도시별 일수 중, 데이터에 도시가 없는 곳(나라 등)의 일수.
// 전체 일수에 더하고(빠뜨리지 않게) 미지원 지역으로 알린다.
function extractUnknownRegionSegments(text) {
  const out = [];
  const re = /([가-힣A-Za-z]{2,12})\s*(?:에서|은|는|에|쪽)?\s*(\d{1,2})\s*(일|박)(?!\s*차)/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    // 도시 이름 자체가 '로'로 끝나는 곳(삿포로)이 있어서, 조사를 떼기 전 낱말로 먼저 도시인지 본다.
    if (resolveCityLabelFromRegionToken(m[1], '')) continue;
    const token = m[1].replace(/(에서|으로|은|는|에|쪽)$/, '');
    if (!token || token.length < 2 || REGION_SEGMENT_STOP_WORDS.has(token)) continue;
    if (resolveCityLabelFromRegionToken(token, '')) continue;
    if (/박|일|night|day/i.test(token)) continue;
    out.push({ token, days: clamp(Number(m[2]), 1, 10), unit: m[3] === '박' ? 'night' : 'day' });
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
  const routeCityKeys = Array.from(new Set([cityKey, ...mustMatches.map((m) => m.cityKey), ...inferredCityKeys])).filter((k) => CITY_DATA[k]);
  const routeCities = routeCityKeys.map((k) => CITY_DATA[k]?.label || k);
  const explicitRouteKeys = Array.from(new Set([cityFromMessage, ...mustMatches.map((m) => m.cityKey), ...mentionedCityKeys].filter((k) => k && CITY_DATA[k])));
  const regionDayPlan = normalizeRegionDayPlan(extractRegionDayPlanFromText(positive, cityKey), []);
  const hasGlobalTripDays = /(\d{1,2})\s*[박泊]\s*(\d{1,2})\s*[일日]|(\d{1,2})\s*일\s*(\d{1,2})\s*박|\d{1,2}\s*nights?\s*(?:and\s*|,\s*)?\d{1,2}\s*days?/i.test(message);
  const parsedDays = parseDaysFromText(message, context.days || 4);
  const daysExplicit = parseExplicitDaysFromText(message) !== null;
  // 도시 데이터가 없는 지역의 일수(예: '나라 1일')도 전체 일수에 넣는다.
  // 'N일/N박' 표현이 도시별 일수보다 많을 때만 찾는다("교토 산책 위주 2일"의 2일은 이미 교토 몫이다).
  const daySegmentCount = (positive.match(/\d{1,2}\s*(?:일|박)(?!\s*차)/g) || []).length;
  const unknownSegments = (!hasGlobalTripDays && regionDayPlan.length > 0 && daySegmentCount > regionDayPlan.length) ? extractUnknownRegionSegments(positive) : [];
  const extraDays = unknownSegments.reduce((acc, s) => acc + s.days, 0);
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
    regionDayPlan,
    specialPrefs,
    arrivalTime: specialPrefs.arrivalTime || '',
    departureTime: specialPrefs.departureTime || '',
    startTimeMin: specialPrefs.startTimeMin || '',
    // 내부용(응답에서는 뺀다)
    _cityFromMessage: cityFromMessage,
    _routeExplicit: explicitRouteKeys.map((k) => CITY_DATA[k].label),
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
    regionDayPlan,
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
  const switchCity = Boolean(msgCityLabel) && !prevRoute.includes(msgCityLabel) && /대신|바꿔|변경|말고|로\s*가|instead|change|switch|代わり|変更/i.test(msg);
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
  if (deltas.length > 0) {
    const seq = allocateDaysByCities(route, [], baseDays, prevPlan);
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
      const seq = allocateDaysByCities(route, [], baseDays, prevPlan);
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
    for (const h of history.slice(-10)) {
      inputMessages.push({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: [{ type: 'input_text', text: h.content }]
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
    model: OPENAI_MODEL,
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
  const res = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }, AI_REQUEST_TIMEOUT_MS);
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  const parsed = parseJsonFromText(extractOpenAiText(data));
  if (!parsed) throw new Error('OpenAI parser returned unexpected format');
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

  if (USE_GEMINI) {
    try {
      const geminiParsed = await parseTravelChatWithGemini(message, context, history, prevParsed);
      const normalized = normalizeTravelChatParsed(geminiParsed, fallback, { message, isFollowUp, prev: prevParsed });
      if (normalized._aiFieldCount > 0) {
        parsed = normalized;
        aiModel = geminiParsed._aiModel || GEMINI_API_MODEL;
        source = 'gemini_chat_parser_v1';
      } else {
        throw new AiOutputError('AI_INVALID_OUTPUT', 'Gemini chat parser returned no usable fields');
      }
    } catch (err) {
      const classified = classifyAiError('Gemini', err);
      aiErrors.push(classified);
      warnThrottled(`chat:gemini:${classified.code}`, `[chat] Gemini 해석 실패(${classified.code}) → ${OPENAI_API_KEY ? 'OpenAI 시도' : '규칙 기반 해석'}: ${String(err?.message || err).slice(0, 200)}`.replace(/\s+/g, ' '));
    }
  }

  if (!parsed && OPENAI_API_KEY) {
    try {
      const openaiParsed = await parseTravelChatWithOpenAI(message, context, history, prevParsed);
      const normalized = normalizeTravelChatParsed(openaiParsed, fallback, { message, isFollowUp, prev: prevParsed });
      if (normalized._aiFieldCount > 0) {
        parsed = normalized;
        aiModel = OPENAI_MODEL;
        source = 'openai_chat_parser_v1';
      } else {
        throw new AiOutputError('AI_INVALID_OUTPUT', 'OpenAI chat parser returned no usable fields');
      }
    } catch (err) {
      const classified = classifyAiError('OpenAI', err);
      aiErrors.push(classified);
      warnThrottled(`chat:openai:${classified.code}`, `[chat] OpenAI 해석 실패(${classified.code}) → 규칙 기반 해석: ${String(err?.message || err).slice(0, 200)}`.replace(/\s+/g, ' '));
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
      const synth = buildSyntheticWantedDestinations([want], parsed.cityKey, 1, { allDay: [...allDayNames], evening: [...eveningNames] })[0];
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
      selectedDestinations.push({
        name: anchor.name,
        city: cityData.label,
        area: anchor.area || cityData.label,
        category: anchor.category || '요청 명소',
        bestTime: anchor.bestTime || '10:00-17:00',
        stayMin: Number(anchor.stayMin || 90),
        mapUrl: mapUrl(`${anchor.name} ${cityData.label}`),
        aiScore: 95
      });
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
    aiErrors: publicAiErrors(aiErrors)
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
      fewSights: (city, n) => `${city}${koTopicParticle(city)} 작은 지역이라 앱 데이터에 있는 명소가 ${n}곳뿐이에요. 다른 도시 장소로 채우지 않고 남는 시간은 자유 일정으로 두었어요`
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
      fewSights: (city, n) => `${city} is a small area: the app knows only ${n} sights there. Remaining time is left free instead of filling it with places from other cities`
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
      fewSights: (city, n) => `${city}は小さな地域のため、アプリのデータにある名所は${n}か所だけです。ほかの都市の場所で埋めず、残りの時間は自由時間にしました`
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
  '대중교통 기준 이동': { en: 'by public transport', ja: '公共交通機関で移動' },
  '대중교통 기준 1~3시간': { en: 'about 1-3 h by public transport', ja: '公共交通機関で約1～3時間' },
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

// AI 일정 후보가 모자라면(무료 모드·대체 데이터) 경로 도시의 대표 명소와 사진 데이터(place-images.json)의
// 같은 도시 명소를 보태 최소 days×2곳(최대 20곳)을 만든다. 이미 있는 장소(이름·위키데이터 ID)는 건너뛴다.
// skip(p): 보태지 않을 후보(예: 요청하지 않은 하루짜리 장소) — 그 대신 다른 명소로 목표 수를 채운다.
function expandPicksForAi(picks, cityKeys, lang, days, skip = null) {
  const base = Array.isArray(picks) ? [...picks] : [];
  // 하루 2~3곳을 채우고(후처리의 빈 낮 채우기 포함) 같은 곳을 되풀이하지 않도록 날마다 3곳(최대 20곳)
  const target = Math.min(20, Math.max(0, Number(days) || 0) * 3);
  if (base.length >= target) return base;
  const seenNames = new Set(base.map((p) => placeNameKey(placeOriginalName(p))));
  const seenQids = new Set(base.map((p) => p?.wikidata).filter(Boolean));
  const tryAdd = (p) => {
    const k = placeNameKey(placeOriginalName(p));
    if (!k || seenNames.has(k) || (p.wikidata && seenQids.has(p.wikidata))) return;
    if (typeof skip === 'function' && skip(p)) return;
    seenNames.add(k);
    if (p.wikidata) seenQids.add(p.wikidata);
    base.push(p);
  };
  for (const ck of [...new Set(cityKeys || [])]) {
    const c = CITY_DATA[ck];
    if (!c) continue;
    curatedCityPool(ck, lang).forEach(tryAdd);
    for (const mapKey of PLACE_IMAGES.byKey.keys()) {
      if (base.length >= target) break;
      if (!mapKey.startsWith(`${ck}|`)) continue;
      const name = mapKey.slice(ck.length + 1);
      tryAdd(localizeCuratedPlace(attachPlaceMedia({
        name, city: c.label, area: c.label, category: '대표 명소', bestTime: '10:00-17:00', stayMin: 90,
        mapUrl: mapUrl(`${name} ${c.label}`)
      }, ck, name), ck, lang));
    }
    if (base.length >= target) break;
  }
  return base.slice(0, Math.max(target, picks?.length || 0));
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
    const synthetic = buildSyntheticWantedDestinations([baseName || tok], ck, 1)[0];
    if (!synthetic) continue;
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
  const dayCitySequence = allocateDaysByCities(routeCities, picks, days, payload._regionDayPlan);
  const prefs = typeof payload._specialPrefs === 'object' && payload._specialPrefs ? payload._specialPrefs : {};
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
  const isPaidSight = (p) => isPaidSightPlace(p, key);
  const buildCityAttractionPool = (cityLabel) => {
    const seen = new Set();
    return curatedCityPool(cityKeyByLabel(cityLabel), lang).filter((x) => {
      const k = placeNameKey(placeKey(x));
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return notExcluded(x) && !(prefs.removeShopping && isLikelyShopping(x)) && (!prefs.indoorFocus || isLikelyIndoor(x))
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
  if (prefs.indoorFocus) {
    // 실내 위주: 실내 후보가 충분하면(하루 하나 이상) 실내 후보와 요청한 곳만 쓰고, 모자라면 실내 후보를 앞에 둔다
    const indoor = planPicks.filter((p) => isLikelyIndoor(p) || isRequestedPick(p));
    if (indoor.length >= Math.min(days, 3)) planPicks = indoor;
    else if (indoor.length > 0) planPicks = [...indoor, ...planPicks.filter((p) => !indoor.includes(p))];
  }
  // 저예산: 요청하지 않은 유료 전망대·수족관·테마파크는 쓰지 않는다(빈 칸은 무료 명소 풀·자유 일정으로)
  if (prefs.lowBudget) planPicks = planPicks.filter((p) => isRequestedPick(p) || !isPaidSight(p));

  // 하루 전체가 드는 곳(테마파크·먼 당일치기: 디즈니, 후지큐, 쿠사츠 온천 …)은 반나절 칸에 넣지 않고 '종일' 칸에 혼자 넣는다.
  const isAllDayPlace = (p) => Boolean(p && !p.freeTime && allDayPlaceKind(p, key));
  // 야경·석양처럼 해 질 무렵 이후가 좋은 곳(추천 시작 17시 이후)은 오전 칸에 넣지 않고, 오후 칸에 넣을 때는 추천 시간을 쓴다.
  const isEveningPlace = (p) => Boolean(p && !p.freeTime && startHour(p.bestTime) >= 17);
  const notEvening = (list) => (Array.isArray(list) ? list : []).filter((p) => !isEveningPlace(p));
  const clockRangeOf = (timeRange) => {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(String(timeRange || ''));
    return m ? [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])] : null;
  };
  const allDayPicks = planPicks.filter(isAllDayPlace);
  const regularPicks = planPicks.filter((p) => !isAllDayPlace(p));
  const morningPool = regularPicks.filter((p) => startHour(p.bestTime) < 12);
  const afternoonPool = regularPicks.filter((p) => startHour(p.bestTime) >= 12);
  const fallbackPool = regularPicks.length > 0 ? regularPicks : picks.filter((p) => !isAllDayPlace(p) && notExcluded(p));
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
      if (!name || bannedNames.has(name) || usedPlaceNamesGlobal.has(name)) continue;
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
    const cityExpandedPool = cityPool.filter((p) => !isAllDayPlace(p));
    const poolA = dayMorningPool.length > 0 ? dayMorningPool : (dayFallbackPool.length > 0 ? dayFallbackPool : morningPool);
    const poolB = dayAfternoonPool.length > 0 ? dayAfternoonPool : (fitsB(dayFallbackPool).length > 0 ? fitsB(dayFallbackPool) : fitsB(afternoonPool));
    const recentSet = new Set(recentNamesByCity.get(dayCity) || []);
    const aFromPicks = choosePlace(notEvening(poolA), notEvening(fallbackPool), i * 3 + 1, recentSet);

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
      const a = aFromPicks
        || choosePlace(notEvening(cityExpandedPool), notEvening(cityExpandedPool), i * 5 + 11, recentSet)
        || freeTimeSlot(dayCity);
      const banForB = new Set([...(recentNamesByCity.get(dayCity) || []), a.freeTime ? '' : placeKey(a)].filter(Boolean));
      let b = choosePlace(poolB, fitsB(fallbackPool), i * 3 + 2, banForB)
        || choosePlace(fitsB(cityExpandedPool), fitsB(cityExpandedPool), i * 5 + 17, banForB)
        || freeTimeSlot(dayCity);
      if (!a.freeTime && !b.freeTime && placeKey(a) === placeKey(b)) {
        const alt = choosePlace(fitsB(dayFallbackPool), fitsB(fallbackPool), i * 7 + 3, new Set([placeKey(a)]))
          || choosePlace(fitsB(cityExpandedPool), fitsB(cityExpandedPool), i * 7 + 5, new Set([placeKey(a)]));
        b = alt || freeTimeSlot(dayCity);
      }
      const morningRaw = clampRange(baseRanges.morning, minStart, maxEnd, 60);
      // 출국일 아침에 1시간도 안 남으면 관광 대신 체크아웃·공항 이동 안내로 둔다(아래 빈 날 처리).
      const morningRange = morningRaw && (i === days - 1 && Number.isFinite(lastDayMaxEnd) && morningRaw[1] - morningRaw[0] < 60) ? null : morningRaw;
      if (morningRange) {
        blocks.push(`오전(${formatRange(morningRange)}): ${blockPlace(a, dayCityName)}`);
        placed.push(a);
      }
      const afternoonRange = clampRange(baseRanges.afternoon, minStart, maxEnd, 60);
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
              || choosePlace(notEvening(cityExpandedPool), [], i * 11 + 3, banC);
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

// AI 일정 컨텍스트. payload._aiIntent = { mustVisit, excluded, dayPlan, routeCityKeys } (buildTravelPlan이 만든다)
function buildAiContext(payload, picks, city) {
  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));
  const startDate = itineraryStartDate(payload);
  const lang = normalizeLang(payload.lang);
  const cityKey = cityKeyForExactLabel(city.label) || cityKeyByInput(payload.city);
  const intent = payload._aiIntent && typeof payload._aiIntent === 'object' ? payload._aiIntent : {};
  const prefs = planPrefs(payload);
  const routeKeys = Array.isArray(intent.routeCityKeys) && intent.routeCityKeys.length ? intent.routeCityKeys : [cityKey];
  const ctx = {
    language: ({ ko: 'Korean', en: 'English', ja: 'Japanese' })[lang],
    city: city.label,
    theme: payload.theme || 'mixed',
    budget: payload.budget || 'mid',
    pace: payload.pace || 'normal',
    days,
    startDate,
    maxPlacesPerDay: Number(prefs.maxPlacesPerDay) > 0 ? clamp(Number(prefs.maxPlacesPerDay), 1, 5) : 4,
    // 하루 3곳 기준으로 넉넉히(최소 12, 최대 20곳: expandPicksForAi 목표와 같다) 넘겨 같은 장소를 여러 날 반복하지 않게 한다.
    // id = 후보 번호, city = 그 후보의 도시(dayPlan과 같은 표기), allDay = 하루 전체가 드는 곳(종일 칸 전용)
    picks: (picks || []).slice(0, Math.min(20, Math.max(12, days * 3))).map((p, i) => ({
      id: i,
      name: p.name,
      area: p.area,
      category: p.category,
      bestTime: p.bestTime,
      stayMin: p.stayMin,
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

function looksLikeOpenAiKey(key) {
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(String(key || '').trim());
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
  } else if (err?.geminiTimeout) {
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

/**
 * AI 일정 결정적 후처리. 순서: 식사·관광 분류(b·c) → 종일 병합(d) → 제외 정리(g-1) → 꼭 갈 곳(e) → 제약(f: 시작 시각·출발·겹침·하루 관광 수)
 * → 반복 정리(g-2, 제약으로 빠진 후보도 다시 쓴다) → 도시 이동 → 빈 날 채우기 → 확인 안 된 관광 수(i) → 시간 순 정렬.
 * opts: { picks, foods, mustVisit, excludedKeys, prefs, payload, dayPlan, lang, cityLabel, ruleMode }
 *  - ruleMode: 규칙 일정에는 꼭 갈 곳 넣기(e)만 한다(나머지는 createItinerary가 이미 지킨다).
 * 돌려주는 값: { itinerary, stats: {mealsMoved, sightsRelabeled, allDayMerged, mustInserted, trimmed, shifted, repeatsReplaced, unverified}, missingMustVisit }
 */
function postProcessItinerary(itinerary, opts = {}) {
  const lang = normalizeLang(opts.lang);
  const T = RULE_PLAN_TEXT[lang] || RULE_PLAN_TEXT.ko;
  const prefs = opts.prefs || {};
  // 앞의 8개는 응답 계약(itineraryInfo.postProcess). 뒤의 4개는 진단용: 채운 저녁 수·채운 관광 수·실내로 바꾼 수·후보 이름으로 되돌린 수
  const stats = { mealsMoved: 0, sightsRelabeled: 0, allDayMerged: 0, mustInserted: 0, trimmed: 0, shifted: 0, repeatsReplaced: 0, unverified: 0, mealsAdded: 0, sightsAdded: 0, indoorSwapped: 0, namesRestored: 0 };
  const picks = (opts.picks || []).filter((p) => p && p.name);
  const foods = (opts.foods || []).filter((f) => f && f.name);
  const must = (opts.mustVisit || []).filter((m) => m && m.name);
  const excludedKeys = opts.excludedKeys instanceof Set ? opts.excludedKeys : new Set();
  const dayPlan = Array.isArray(opts.dayPlan) ? opts.dayPlan : [];
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
  // pred(p): 더 고를 조건(예: 실내). 맞는 후보가 없으면 null
  const takeUnused = (di, pred = null) => {
    if (!unused) unused = unusedPool();
    const city = dayPlan.length ? dayCityLabel(di) : '';
    const ok = (p) => (!city || !p.city || p.city === city) && (!pred || pred(p));
    // 실내 위주면 실내 후보부터
    let idx = prefs.indoorFocus && !pred ? unused.findIndex((p) => ok(p) && isIndoorPick(p)) : -1;
    if (idx < 0) idx = unused.findIndex(ok);
    if (idx < 0) return null;
    return unused.splice(idx, 1)[0];
  };
  // 실내 판정: 후보(picks)의 원래 이름·종류로 본다
  const isIndoorPick = (p) => Boolean(p) && isLikelyIndoor({ ...p, name: p.name, nameKo: p.nameKo });
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
  // 식당: 그날 도시의 맛집 목록에서(먹고 싶은 것 → 아직 안 간 실제 가게 → '찾기' 안내 → 아무거나)
  const wishes = (Array.isArray(opts.foodWishes) ? opts.foodWishes : []).map((w) => String(w || '').trim()).filter(Boolean).slice(0, 3);
  const foodOfName = (name) => { const i = findIdx(name, foodKeys); return i >= 0 ? foods[i] : null; };
  const foodMatchesWish = (f, w) => {
    if (!f) return false;
    const g = canonicalFoodGenre(w) || w;
    return [f.genre, f.name, f.nameKo].some((x) => x && (String(x) === g || String(x) === w || String(x).includes(w) || String(x).includes(g)));
  };
  const mealBlocks = () => days.flatMap((d) => d.items.filter((b) => !b.plain && MEAL_PERIODS.has(b.period)));
  const wishMet = (w) => mealBlocks().some((b) => foodMatchesWish(foodOfName(b.name), w) || String(b.title).includes(w));
  const usedFoodKeys = () => new Set(mealBlocks().map((b) => { const f = foodOfName(b.name); return f ? placeNameKey(f.nameKo || f.name) : placeNameKey(b.name); }));
  const cityFoodsOf = (di) => {
    const c = dayCityLabel(di);
    const list = foods.filter((f) => !c || !f.city || f.city === c);
    return list.length ? list : foods;
  };
  const chooseFood = (di, avoid = new Set()) => {
    const list = cityFoodsOf(di);
    if (!list.length) return null;
    const used = usedFoodKeys();
    const k = (f) => placeNameKey(f.nameKo || f.name);
    for (const w of wishes) {
      if (wishMet(w)) continue;
      const hit = list.find((f) => foodMatchesWish(f, w) && !avoid.has(k(f)));
      if (hit) return hit;
    }
    return list.find((f) => !f.generic && !used.has(k(f)) && !avoid.has(k(f)))
      || list.find((f) => f.generic && !used.has(k(f)) && !avoid.has(k(f)))
      || list.find((f) => !avoid.has(k(f))) || null;
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
      const restorable = [...picks, ...must.map((m) => m.pick || { name: m.name, nameKo: m.nameKo, area: m.area, city: m.city })];
      const resolvePick = (name) => {
        const k = placeNameKey(name);
        if (!k) return null;
        const exact = restorable.find((p) => labelsOfPick(p).some((l) => placeNameKey(l) === k));
        if (exact) return exact;
        // 글자(한글·한자·가나) 겹침 비율: 가장 비슷한 후보가 0.6 이상이고 3글자 이상 겹치며 둘째와 분명히 다를 때만.
        // 로마자뿐인 이름은 글자 수가 적어 아무 이름과도 겹치므로 같은 표기만 본다.
        if (nameLetters(name).filter((ch) => !/[a-z0-9]/.test(ch)).length < 3) return null;
        let best = null;
        let bestScore = 0;
        let secondScore = 0;
        for (const p of restorable) {
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
        const hit = resolvePick(b.name);
        if (hit) {
          b.name = hit.name;
          if (!b.area && hit.area) b.area = hit.area;
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
        const next = b.period === '종일' ? null : takeUnused(di);
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
    days.forEach((d, di) => {
      d.items = d.items.flatMap((b) => {
        if (b.plain || !SIGHT_PERIODS.has(b.period) || isFreeOrMove(b)) return [b];
        const excluded = isExcludedPlace(b.name, excludedKeys)
          || (prefs.removeShopping && !mustOf(b.name) && isLikelyShopping({ ...(pickOf(b.name) || {}), name: b.name, area: b.area }));
        if (!excluded) return [b];
        stats.trimmed += 1;
        const next = b.period === '종일' ? null : takeUnused(di);
        return next ? [newPostBlock(b.period, b.start, b.end, next.name, next.area || '')] : [];
      });
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
        d.items = d.items.map((b) => {
          if (!isSightBlock(b) || b.period === '종일' || mustOf(b.name) || !paidName(b.name)) return b;
          const next = takeUnused(di, (p) => !isPaidSightPlace(p, dayCityKey(di)));
          if (!next) return b;
          stats.trimmed += 1;
          return newPostBlock(b.period, b.start, b.end, next.name, next.area || '');
        });
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
      d.items = d.items.flatMap((b) => {
        if (b.plain || !SIGHT_PERIODS.has(b.period) || isFreeOrMove(b)) return [b];
        const key = keyOfBlock(b);
        const repeat = seen.has(key) && Boolean(pickOf(b.name) || mustOf(b.name));
        if (!repeat) { seen.add(key); return [b]; }
        const next = b.period === '종일' ? null : takeUnused(di);
        if (next) {
          seen.add(placeNameKey(next.nameKo || next.name));
          stats.repeatsReplaced += 1;
          return [newPostBlock(b.period, b.start, b.end, next.name, next.area || '')];
        }
        // 바꿀 후보가 없으면(명소가 적은 섬 등) 같은 곳을 또 넣지 않고 지운다: 빈 시간은 아래 단계가 자유 일정으로 둔다
        stats.trimmed += 1;
        return [];
      });
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

    // (h-3) 먹고 싶다고 한 음식(foodWishes)이 일정의 식사에 없으면 그 음식점으로 저녁(없으면 점심) 하나를 바꾼다.
    for (const w of wishes) {
      if (wishMet(w)) continue;
      let done = false;
      for (let di = 0; di < nDays && !done; di += 1) {
        if (days[di].items.some((b) => !b.plain && b.period === '종일' && isDayTripName(b.name, di))) continue; // 당일치기 날은 현지 식사
        const hit = cityFoodsOf(di).find((f) => foodMatchesWish(f, w));
        if (!hit) continue;
        const replaceable = (b) => !b.plain && isMealBlock(b) && !wishes.some((x) => foodMatchesWish(foodOfName(b.name), x) || String(b.title).includes(x));
        const meal = days[di].items.find((b) => b.period === '저녁' && replaceable(b))
          || days[di].items.find((b) => b.period === '점심' && replaceable(b));
        if (!meal) continue;
        Object.assign(meal, foodBlock(meal.period, meal.start, meal.end, hit));
        stats.mealsMoved += 1;
        done = true;
      }
    }

    // (h-4) 같은 식당을 여러 날 되풀이하면(그 도시에 아직 안 간 곳이 있을 때) 다른 곳으로 바꾼다. 먹고 싶다고 한 음식점은 그대로 둔다.
    {
      const seenFood = new Set();
      days.forEach((d, di) => {
        d.items.forEach((b) => {
          if (b.plain || !MEAL_PERIODS.has(b.period)) return;
          const f = foodOfName(b.name);
          if (!f) return;
          const k = placeNameKey(f.nameKo || f.name);
          if (!seenFood.has(k)) { seenFood.add(k); return; }
          if (wishes.some((w) => foodMatchesWish(f, w))) return;
          const used = usedFoodKeys();
          const next = cityFoodsOf(di).find((x) => !used.has(placeNameKey(x.nameKo || x.name)));
          if (!next) return;
          Object.assign(b, foodBlock(b.period, b.start, b.end, next));
          seenFood.add(placeNameKey(next.nameKo || next.name));
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
      d.items = d.items.flatMap((b) => {
        if (!isSightBlock(b) || pickOf(b.name) || mustOf(b.name)) return [b];
        const bare = String(b.name || '').replace(MUST_GO_PARTICLE_RE, '').trim();
        if (!(MUST_GO_STOP_WORDS.has(b.name) || MUST_GO_STOP_WORDS.has(bare) || isNonPlaceWord(b.name))) return [b];
        stats.trimmed += 1;
        const next = b.period === '종일' ? null : takeUnused(di);
        return next ? [newPostBlock(b.period, b.start, b.end, next.name, next.area || '')] : [];
      });
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
    const url = `https://api.openai.com/v1/models/${encodeURIComponent(OPENAI_MODEL)}`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
    }, AI_REQUEST_TIMEOUT_MS);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${text}`);
    }
    return { configured: true, ok: true, model: OPENAI_MODEL };
  } catch (err) {
    const classified = classifyAiError('OpenAI', err);
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
        keyFormatOk: looksLikeOpenAiKey(OPENAI_API_KEY)
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
      if (base) {
        mediaFields.forEach((f) => { if (base[f] !== undefined && base[f] !== null) out[f] = base[f]; });
        if (GENERIC_BEST_TIMES.has(out.bestTime) && base.bestTime && Number(out.stayMin) < 360) out.bestTime = base.bestTime;
        if (cityOnlyArea && base.area) out.area = base.area;
      } else {
        out = attachPlaceMedia(out, ck, ko);
        // 도시 명소·추가 명소(가이유칸 등)는 실제 지역·추천 시간·좌표를 쓴다
        const hl = (CITY_DATA[ck]?.highlights || []).find((h) => h.name === ko);
        const extra = extraPlaceByName(ko);
        const known = hl || extra;
        if (known) {
          if (ko !== out.name && !out.nameKo) out.nameKo = ko;
          if (GENERIC_BEST_TIMES.has(out.bestTime) && known.bestTime && Number(out.stayMin) < 360) out.bestTime = known.bestTime;
          if (cityOnlyArea && known.area) out.area = known.area;
          if (!hasLatLng(out) && extra && Number.isFinite(extra.lat)) { out.lat = extra.lat; out.lng = extra.lng; }
          if (extra?.indoor) out.indoor = true;
        }
        if (lang !== 'ko' && /[가-힣]/.test(String(out.area || ''))) out.area = localizeCuratedArea(out.area, lang, ck ? localizedCityName(ck, lang) : '');
      }
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
    model: OPENAI_MODEL,
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

  let json = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetchWithTimeout('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }, Math.max(AI_REQUEST_TIMEOUT_MS, 30_000));

    if (!res.ok) {
      lastError = new Error(`OpenAI error: ${res.status}`);
      continue;
    }
    const data = await res.json();
    if (data?.status === 'incomplete') {
      const why = String(data?.incomplete_details?.reason || '');
      throw new AiOutputError(why === 'max_output_tokens' ? 'AI_TRUNCATED' : 'AI_INVALID_OUTPUT', `OpenAI response incomplete (${why || 'unknown'})`);
    }
    const text = extractOpenAiText(data);
    const parsed = parseJsonFromText(text);
    if (parsed) {
      json = parsed;
      lastError = null;
      break;
    }
    lastError = new AiOutputError('AI_INVALID_OUTPUT', 'OpenAI returned unexpected format');
  }
  if (!json) throw lastError || new AiOutputError('AI_INVALID_OUTPUT', 'OpenAI parse error');

  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));
  const normalized = normalizeAiItinerary(json, payload, 'OpenAI', ctx.picks);

  return {
    source: 'openai_itinerary_v1',
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
      const indoor = out.filter((p) => isMustPick(p) || isLikelyIndoor(p));
      out = [...indoor, ...out.filter((p) => !indoor.includes(p))];
    }
    if (prefs.lowBudget) {
      const free = out.filter((p) => isMustPick(p) || isRequested(p) || !isPaidSight(p));
      out = free.length >= Math.min(tripDays * 2, 6) ? free : [...free, ...out.filter((p) => !free.includes(p))];
    }
    return out;
  };
  // AI 후보: 내장 큐레이션 데이터(무료 모드·대체)일 때는 같은 도시의 대표 명소를 보태 최소 days×2곳을 만든다.
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
  const aiPicks = applyPrefFilters(withMust(rec.sourceInfo?.kind === 'live'
    ? picksForItinerary
    : expandPicksForAi(picksForItinerary.filter(notExcluded), routeCityKeys, lang, tripDays, skipForExpand)));
  // 도시가 2곳 이상이면 날짜별 도시(dayPlan)를 정해 AI·후처리가 같은 분배를 쓴다.
  const startDate = itineraryStartDate(payload);
  const routeLabels = deriveRouteCities(payload, aiPicks, cityLabel);
  const daySeq = routeLabels.length > 1 ? allocateDaysByCities(routeLabels, aiPicks, tripDays, payload._regionDayPlan) : [];
  const dayPlan = daySeq.length > 1 && new Set(daySeq).size > 1
    ? daySeq.map((c, i) => ({ day: i + 1, date: getDateOffset(startDate, i), city: c, ...(i > 0 && daySeq[i - 1] !== c ? { transferFrom: daySeq[i - 1] } : {}) }))
    : [];
  const aiIntent = {
    mustVisit,
    excluded: (payload.excludedPlaces || []).filter(Boolean),
    dayPlan,
    routeCityKeys
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
        warnThrottled(`itinerary:gemini:${classified.code}`, `[itinerary] Gemini 일정 실패(${classified.code}) → ${OPENAI_API_KEY ? 'OpenAI 시도' : '규칙 기반 일정'}: ${String(err?.message || err).slice(0, 200)}`.replace(/\s+/g, ' '));
      }
    }
    if (!it && OPENAI_API_KEY) {
      try {
        it = await createItineraryWithOpenAI({ ...payload, city: key, _picks: aiPicks, _aiIntent: aiIntent }, aiPicks);
      } catch (err) {
        const classified = classifyAiError('OpenAI', err);
        aiErrors.push(classified);
        warnThrottled(`itinerary:openai:${classified.code}`, `[itinerary] OpenAI 일정 실패(${classified.code}) → 규칙 기반 일정: ${String(err?.message || err).slice(0, 200)}`.replace(/\s+/g, ' '));
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
    it = createItinerary({ ...payload, city: key, _picks: rulePicks, _poolAllDayMax: ruleAllDayFromPool, _requestedNames: [...requestedKeys] });
    // 규칙 일정: 빠진 꼭 갈 곳만 넣는다(나머지 규칙은 createItinerary가 이미 지킨다). 날짜별 도시는 createItinerary와 같은 방법으로 구한다.
    if (mustVisit.length) {
      const ruleRoute = deriveRouteCities(payload, rulePicks, cityLabel);
      const ruleSeq = ruleRoute.length > 1 ? allocateDaysByCities(ruleRoute, rulePicks, tripDays, payload._regionDayPlan) : [];
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
  const mergedRecommendations = (() => {
    const base = Array.isArray(rec.picks) ? [...rec.picks] : [];
    // 일정에 넣지 않은 하루짜리 후보(테마파크·먼 당일치기)는 카드로만 보여 준다(+ 일정에 넣기로 직접 넣을 수 있게)
    const unrequested = unrequestedAllDay.filter((p) => notExcluded(p) && !(prefs.lowBudget && allDayKindOf(p) === 'fullDay'));
    const extra = [...(Array.isArray(it.extraRecommendations) ? it.extraRecommendations : []), ...unrequested];
    if (extra.length === 0) return base;
    const nameKeyOf = (p) => `${String(p?.city || '').toLowerCase()}|${placeNameKey(placeOriginalName(p))}`;
    const seen = new Set(base.map(nameKeyOf));
    const seenQids = new Set(base.map((p) => p?.wikidata).filter(Boolean));
    extra.forEach((raw) => {
      if (!raw?.name || isSyntheticFiller(raw) || !notExcluded(raw)) return;
      const ck = cityKeyByLabel(raw.city) || key;
      const p = localizeCuratedPlace(attachPlaceMedia(raw, ck, placeOriginalName(raw)), ck, lang);
      const k = nameKeyOf(p);
      if (seen.has(k) || (p.wikidata && seenQids.has(p.wikidata))) return;
      seen.add(k);
      if (p.wikidata) seenQids.add(p.wikidata);
      base.push(p);
    });
    return base.slice(0, Math.max(10, Math.min(24, base.length)));
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
  let foodsInfo;
  if (recommendedFoods.length > 0) {
    foodsInfo = sourceInfo('live', 'google_places');
  } else {
    // 내장 큐레이션 맛집 (도시별로 섞어서 최대 12곳)
    recommendedFoods = curatedFoodsForCities(foodCityKeys, payload.budget, lang, 12);
    foodsInfo = GOOGLE_PLACES_ENABLED
      ? sourceInfo('fallback', 'curated', foodsReason || 'NO_RESULTS')
      : sourceInfo('curated', 'curated');
  }

  // 지도용 좌표: 각 날의 places + 전체 placeCoords
  const withCoords = attachItineraryCoordinates(it.itinerary, [...mergedRecommendations, ...picksForItinerary, ...aiPicks], foodCityKeys);
  // 도시 주변 명소가 적은 곳(작은 섬, assets/city-places.json few): 다른 도시 장소로 채우지 않았다고 팁 맨 앞에 알린다(규칙·AI 일정 모두)
  const tips = Array.isArray(it.tips) ? [...it.tips] : [];
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

  if (tripType === 'multicity' && legs.length >= 2) {
    const path = legs.map((l) => `${l.from}-${l.to}/${l.date}`).join('/');
    return `https://www.kayak.co.kr/flights/${path}`;
  }

  // Skyscanner (KR)
  if (tripType === 'roundtrip' && legs.length >= 2) {
    return `https://www.skyscanner.co.kr/transport/flights/${first.from.toLowerCase()}/${first.to.toLowerCase()}/${toDateKey(first.date)}/${toDateKey(last.date)}/`;
  }
  return `https://www.skyscanner.co.kr/transport/flights/${first.from.toLowerCase()}/${first.to.toLowerCase()}/${toDateKey(first.date)}/`;
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
const _tpCache = new Map();

function redactTravelpayoutsToken(text) {
  const s = String(text || '');
  return TRAVELPAYOUTS_TOKEN ? s.split(TRAVELPAYOUTS_TOKEN).join('***') : s;
}

async function travelpayoutsPricesForDates(params, label) {
  const query = new URLSearchParams({ sorting: 'price', direct: 'false', currency: 'krw', ...params });
  const cacheKey = query.toString();
  const cached = _tpCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < TP_CACHE_TTL_MS) return cached.rows;
  query.set('token', TRAVELPAYOUTS_TOKEN);
  let res;
  try {
    res = await fetchWithTimeout(`${TRAVELPAYOUTS_BASE}/prices_for_dates?${query}`, {}, AI_REQUEST_TIMEOUT_MS);
  } catch (err) {
    warnThrottled('travelpayouts:network', `[travelpayouts] ${label} 요청 실패(네트워크/타임아웃): ${redactTravelpayoutsToken(err?.cause?.code || err?.message || err)}`);
    throw new ProviderError('PROVIDER_UNAVAILABLE', 'travelpayouts network error');
  }
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok || !json || json.success === false) {
    warnThrottled(`travelpayouts:http:${res.status}`, `[travelpayouts] ${label} → HTTP ${res.status} ${redactTravelpayoutsToken(text).replace(/\s+/g, ' ').slice(0, 200)}`);
    throw new ProviderError('PROVIDER_UNAVAILABLE', `travelpayouts HTTP ${res.status}`);
  }
  const rows = Array.isArray(json.data) ? json.data : [];
  _tpCache.set(cacheKey, { at: Date.now(), rows });
  while (_tpCache.size > 200) _tpCache.delete(_tpCache.keys().next().value);
  return rows;
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
  const normalizeAll = (entries, nearby) => entries.map((e, idx) => ({
    ...normalizeTravelpayoutsFlight(e.row, idx, tripType),
    nearbyDate: nearby,
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

  // ② 가까운 날짜: 월 단위 캐시 가격에서 고른다.
  const monthRows = [];
  for (const q of tpNearbyMonthQueries(departDate, returnDate, isRound, today)) {
    const rows = await travelpayoutsPricesForDates({
      ...base,
      departure_at: q.depMonth,
      ...(isRound ? { return_at: q.retMonth } : {}),
      limit: '100'
    }, 'nearby');
    monthRows.push(...rows);
  }
  const picked = pickNearbyTravelpayoutsRows(monthRows, departDate, returnDate, isRound, today);
  console.log(`[travelpayouts] ${origin}→${destination} ${departDate}${isRound ? `~${returnDate}` : ''}: 요청 날짜 0건 → 가까운 날짜 ${picked.length}건`);
  if (picked.length > 0) return { items: normalizeAll(picked, true), dateMatch: 'nearby' };
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

  // 예약 링크 생성
  const tpLink = item.link ? `https://www.aviasales.com${item.link}` : '#';
  const kayakUrl = `https://www.kayak.com/flights/${origin}-${dest}/${depDate}/`;
  const ssUrl = `https://www.skyscanner.co.kr/transport/flights/${origin.toLowerCase()}/${dest.toLowerCase()}/${depDate.replace(/-/g, '').slice(2)}/`;

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
      : `https://www.skyscanner.co.kr/transport/flights/${leg.from.toLowerCase()}/${leg.to.toLowerCase()}/${toDateKey(leg.date)}/`
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
    provider: 'frankfurter',
    url: 'https://api.frankfurter.app/latest?from=JPY&to=KRW,USD',
    parse: (d) => ({ krw: d?.rates?.KRW, usd: d?.rates?.USD, at: d?.date })
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
    noDistance: '거리 정보 없음(대략 추정)', needTwo: '장소가 2곳 이상 필요합니다.', aiLang: ''
  },
  en: {
    walking: 'Walk', subway1: 'Subway, 1 zone', subway2: 'Subway, 2-3 zones', subway: 'Subway/train', rail: 'JR/private railway',
    longRail: 'Long-distance train', shinkansen: 'Limited express/Shinkansen (estimate)', approx: (km) => ` (about ${km} km)`,
    noDistance: 'No distance data (rough estimate)', needTwo: 'At least 2 places are needed.', aiLang: '영어(English)'
  },
  ja: {
    walking: '徒歩', subway1: '地下鉄 1区間', subway2: '地下鉄 2～3区間', subway: '地下鉄/電車', rail: 'JR/私鉄',
    longRail: '長距離電車', shinkansen: '特急/新幹線（推定）', approx: (km) => `（約${km}km）`,
    noDistance: '距離情報なし（概算）', needTwo: '2か所以上の場所が必要です。', aiLang: '일본어(日本語)'
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

// ── Route Cost Calculator (AI-based via Gemini) ──
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

  // Build route string for AI
  const routeList = places.map((p, i) => `${i + 1}. ${p}`).join('\n');

  // Try AI first
  if (GEMINI_API_KEY) {
    try {
      const prompt = `일본 ${cityLabel} 여행 경로의 대중교통 이동 정보를 계산해주세요.

경로 (순서대로):
${routeList}

각 구간별로 다음을 JSON으로 답해주세요:
- from: 출발지명
- to: 도착지명
- mode: 이동수단 (subway/rail/bus/tram/walking 중 하나, 가장 현실적인 수단)
- durationMin: 예상 소요시간(분, 정수)
- fareJPY: 예상 요금(엔, 정수. 도보는 0)
- tip: 한줄 팁 (예: "JR야마노테선 이용", "도보 5분 거리")

JSON 형식:
{
  "segments": [ { "from": "...", "to": "...", "mode": "...", "durationMin": 0, "fareJPY": 0, "tip": "..." } ],
  "totalDurationMin": 0,
  "totalFareJPY": 0,
  "routeTip": "전체 경로 팁 한줄"
}

주의:
- 실제 일본 대중교통 요금 기준으로 현실적으로 계산
- 500m 이내 가까운 거리는 walking(도보)으로, 요금 0
- 지하철/전철 기본요금 약 170~200엔 참고
- 장거리 신칸센은 해당 요금 반영${RT.aiLang ? `\n- tip과 routeTip은 ${RT.aiLang}로 작성` : ''}`;

      // gemini-2.0-flash 고정은 모델 종료(404)로 매번 한 번씩 헛호출이 나서 기본 모델을 쓴다.
      // 화면은 30초에 요청을 끊으므로 체인 전체를 20초로 줄여, 그 안에 못 받으면 아래 추정값으로 답한다.
      const geminiResp = await callGeminiGenerateContent(prompt, {
        temperature: 0.1,
        maxOutputTokens: 1500,
        thinkingBudget: 0,
        responseMimeType: 'application/json',
        totalBudgetMs: 20_000
      });

      const text = geminiResp?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      }

      if (parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
        // Normalize and add KRW conversion
        const segments = parsed.segments.map(seg => ({
          from: seg.from || '',
          to: seg.to || '',
          mode: seg.mode || 'transit',
          durationMin: Math.round(Number(seg.durationMin) || 0),
          fareJPY: Math.round(Number(seg.fareJPY) || 0),
          fareKRW: Math.round((Number(seg.fareJPY) || 0) * JPY_TO_KRW),
          distanceM: 0,
          tip: seg.tip || '',
          estimated: false
        }));

        const totalDurationMin = segments.reduce((s, seg) => s + seg.durationMin, 0);
        const totalFareJPY = segments.reduce((s, seg) => s + seg.fareJPY, 0);

        return {
          segments,
          totalDurationMin,
          totalFareJPY,
          totalFareKRW: Math.round(totalFareJPY * JPY_TO_KRW),
          routeTip: parsed.routeTip || '',
          source: 'ai',
          aiModel: geminiResp._usedModel || 'gemini'
        };
      }
    } catch (err) {
      console.error('[route-cost] AI calculation failed, falling back:', err.message);
    }
  }

  // Fallback: google 모드면 Directions API(비용 가드 적용), 아니면 장소 좌표(place-images.json) 기반 거리 추정.
  const cityNameJa = (cityObj && cityObj.nameJa) ? cityObj.nameJa : cityLabel;
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
  // 좌표로 구간 추정(직선거리 × 1.3). 좌표가 없으면 대략값.
  const estimateSegmentFromCoords = (fromPlace, toPlace) => {
    const a = coordFor(fromPlace);
    const b = coordFor(toPlace);
    if (!a || !b) {
      return {
        from: fromPlace, to: toPlace,
        distanceM: 0, durationMin: 20,
        fareJPY: 200, fareKRW: Math.round(200 * JPY_TO_KRW),
        mode: 'estimated', estimated: true, tip: RT.noDistance
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
      tip: est.tip + RT.approx(distKm.toFixed(1))
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
          tip: est.tip + RT.approx(distKm.toFixed(1))
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
    source: 'distance_estimate'
  };
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
