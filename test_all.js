/**
 * 통합 테스트 (npm test = node test_all.js)
 *
 * - 외부 패키지·실제 네트워크 없음(hermetic):
 *   · 서버 자식 프로세스의 벤더 키 환경변수를 모두 ''로 넘겨 .env 값이 절대 쓰이지 않게 한다
 *     (server.js의 loadEnvFile은 "정의되지 않은" 변수만 .env로 채운다).
 *   · PLACES_API_BASE / GEOCODE_API_BASE / GEMINI_API_BASE / TRAVELPAYOUTS_API_BASE는 테스트가 띄운
 *     가짜 벤더 서버(tests/support/mock-vendor.js, 포트 3205)를 가리킨다.
 *   · 그 밖의 외부 호출(환율·날씨 등)은 tests/support/net-guard.js가 가짜 서버로 돌린다.
 * - 서버(포트 13581)를 설정만 바꿔 여러 번 띄운다: 무료 모드(기본) → 무료 모드 사진·en/ja 이름 → 프록시 신뢰
 *   → Google 결제 꺼짐 → Google 정상 + Gemini → 일일 상한 → Geocoding 거부 → OAuth state·AI 오류 원문 제거
 *   → … → Gemini 모델 체인(순서·GEMINI_FALLBACK_MODELS·쉬는 모델·생각 설정·전체 시간 예산).
 * - 브랜드(Tabimaru)와 도메인에 묶인 값(운영 주소, 서비스 이름, OAuth 콜백, sid 쿠키, localStorage 키)도 검사한다.
 * - 첫 화면(app.js 부팅)은 tests/support/browser-sandbox.js로 실행해 유료 API를 부르지 않는지 본다.
 *   같은 흉내 안에서 사진·출처 표시 함수에 악성 주소·HTML을 넣어 허용 목록과 이스케이프도 확인한다.
 */
const http = require('http');
const net = require('net');
const os = require('os');
const crypto = require('crypto');
const vm = require('vm');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createMockVendor, JPEG_BYTES, GEMINI_ERROR_TEXT, SUPABASE_ERROR_TEXT } = require('./tests/support/mock-vendor');
const { createBrowser } = require('./tests/support/browser-sandbox');

// 포트는 기본 13581(서버)·3205(가짜 벤더). 여러 검사를 함께 돌릴 때만 TABIMARU_TEST_PORT·TABIMARU_TEST_MOCK_PORT로 바꾼다.
const PORT = Number(process.env.TABIMARU_TEST_PORT) || 13581;
const MOCK_PORT = Number(process.env.TABIMARU_TEST_MOCK_PORT) || 3205;
const BASE = `http://localhost:${PORT}`;
const PROJECT = __dirname;
const GUARD = path.join(PROJECT, 'tests', 'support', 'net-guard.js');

// 서버의 users.json·saved_plans.json은 늘 임시 폴더(TABIMARU_DATA_DIR)에만 쓰인다. 저장소의 data/는 건드리지 않는다.
const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tabimaru-test-'));
const DEFAULT_TEST_DATA_DIR = path.join(TEST_DATA_ROOT, 'default');
const REPO_DATA_DIR = path.join(PROJECT, 'data');
function snapshotDir(dir) {
  if (!fs.existsSync(dir)) return 'missing';
  return fs.readdirSync(dir).sort().map((n) => {
    const st = fs.statSync(path.join(dir, n));
    return `${n}:${st.size}:${Math.floor(st.mtimeMs)}`;
  }).join('|');
}
const REPO_DATA_BEFORE = snapshotDir(REPO_DATA_DIR);

// ── 로그인 세션 쿠키: server.js와 같은 형식으로 직접 만들어 검증 경계를 시험한다 ──
const TEST_SESSION_SECRET = 'test-only-session-secret-0123456789abcdef';
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
function stableUid(provider, id) {
  return 'u_' + crypto.createHash('sha256').update(`${provider}:${id}`).digest('hex').slice(0, 24);
}
// 서명 키 = HMAC-SHA256(scrypt(SESSION_SECRET, 'tabimaru-sid-v1'), 'allow:' + 허용 목록 키) — server.js의 SESSION_KEY와 같은 식
const _sessionKeys = new Map();
function sessionKeyOf(secret = TEST_SESSION_SECRET, allowKey = '') {
  const id = `${secret}\u0001${allowKey}`;
  if (!_sessionKeys.has(id)) {
    const base = crypto.scryptSync(secret, 'tabimaru-sid-v1', 32, { N: 16384, r: 8, p: 1 });
    _sessionKeys.set(id, crypto.createHmac('sha256', base).update(`allow:${allowKey}`).digest());
  }
  return _sessionKeys.get(id);
}
function signSessionPart(part, secret = TEST_SESSION_SECRET, allowKey = '') {
  return crypto.createHmac('sha256', sessionKeyOf(secret, allowKey)).update(part).digest('base64url');
}
function sessionTokenFromJson(json, secret) {
  const part = Buffer.from(json, 'utf8').toString('base64url');
  return `${part}.${signSessionPart(part, secret)}`;
}
function sessionToken(payload, secret) { return sessionTokenFromJson(JSON.stringify(payload), secret); }
function sessionPayload(over = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { v: 1, uid: stableUid('google', 'forged-1'), p: 'google', n: 'Forged', img: '', iat: now, exp: now + 3600, ...over };
}
function decodeSessionToken(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[0], 'base64url').toString('utf8')); } catch { return null; }
}

// 아무도 듣지 않는 포트(연결 거부 시험용)
function closedPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

// 브랜드(이름 변경: JapanTravel Suite → Tabimaru). 운영 주소·서비스 이름 같은 도메인 값은 바꾸지 않는다.
const BRAND_TITLE = { ko: 'Tabimaru — AI 일본 여행 플래너', en: 'Tabimaru — AI Japan Trip Planner', ja: 'Tabimaru — AI日本旅行プランナー' };
const REPO_URL = 'https://github.com/wsxc94/tabimaru-japan-travel-planner';
const PRODUCTION_URL = 'https://japanjapantravel.onrender.com/';
const OUTBOUND_UA = `TabimaruBot/0.1 (+${REPO_URL})`;
const PHOTO_SCOPES = new Set(['place', 'city', 'genre']);

let passed = 0, failed = 0;
const results = [];

function log(ok, name, detail) {
  if (ok) { passed++; results.push('  ✅ ' + name); }
  else { failed++; results.push('  ❌ ' + name + (detail ? ': ' + detail : '')); }
}

function section(title) {
  console.log('--- ' + title + ' ---');
  results.push('  [' + title + ']');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function read(rel) { return fs.readFileSync(path.join(PROJECT, rel), 'utf8'); }

function short(v, n = 300) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined ? String(v) : (s.length > n ? s.slice(0, n) + '…' : s);
}

const HANGUL_RE = /[가-힣]/;

// ── HTTP 요청 (응답은 단계별 기록 → 비밀값 노출 검사에 사용) ──
let responseLog = [];

function fetchUrl(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = { ...(options.headers || {}) };
    let payload = null;
    if (options.body !== undefined) {
      payload = Buffer.from(typeof options.body === 'string' ? options.body : JSON.stringify(options.body), 'utf8');
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = payload.length;
    }
    if (options.ip) headers['X-Forwarded-For'] = options.ip;
    // options.rawPath: URL 정규화 없이 그대로 보낸다(경로 조작 검사용)
    const reqPath = options.rawPath || new URL(urlPath, BASE).pathname + new URL(urlPath, BASE).search;
    const req = http.request({
      hostname: 'localhost', port: PORT, path: reqPath,
      method: options.method || 'GET', headers, timeout: options.timeout || 30000
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const body = buf.toString('utf8');
        let json = null;
        try { json = JSON.parse(body); } catch { json = null; }
        const out = { status: res.statusCode, headers: res.headers, body, buf, json };
        if (options.record !== false) responseLog.push({ path: reqPath, ...out });
        resolve(out);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function postJson(urlPath, body, extra = {}) {
  return fetchUrl(urlPath, { method: 'POST', body, ...extra });
}

// ── 서버 자식 프로세스 ──
const serverCode = read('server.js');

function envNamesReadByServer(code) {
  const names = new Set();
  for (const m of code.matchAll(/envValue\(([^)]*)\)/g)) {
    for (const q of m[1].matchAll(/'([A-Z][A-Z0-9_]*)'/g)) names.add(q[1]);
  }
  for (const m of code.matchAll(/positiveEnvNumber\('([A-Z][A-Z0-9_]*)'\)/g)) names.add(m[1]);
  for (const m of code.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1]);
  return names;
}

function dotenvNames(rel) {
  const p = path.join(PROJECT, rel);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/)
    .map((l) => /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(l))
    .filter(Boolean).map((m) => m[1]);
}

// 벤더 키·운영 설정 이름: 서버가 읽는 이름 + .env/.env.example에 있는 이름 + 예전 이름. 전부 ''로 넘긴다.
const BLANKED_ENV = new Set([
  ...envNamesReadByServer(serverCode),
  ...dotenvNames('.env'),
  ...dotenvNames('.env.example'),
  'GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_BROWSER_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
  'OPENAI_API_KEY', 'OPENAI_KEY', 'TRAVELPAYOUTS_TOKEN', 'RAKUTEN_APP_ID', 'RAKUTEN_ACCESS_KEY',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AMADEUS_API_KEY', 'AMADEUS_API_SECRET', 'AMADEUS_ENV',
  'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'KAKAO_REST_API_KEY', 'KAKAO_CLIENT_SECRET',
  'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'SESSION_SECRET', 'DIAGNOSTICS_TOKEN',
  'PLACES_PROVIDER', 'MAP_PROVIDER', 'GOOGLE_DAILY_CALL_LIMIT', 'RENDER', 'TRUST_PROXY', 'TRUST_PROXY_HOPS',
  'PUBLIC_BASE_URL', 'OAUTH_BASE_URL', 'PLACE_IMAGES_FILE'
]);

const mock = createMockVendor({ port: MOCK_PORT });
const MOCK = mock.baseUrl;

function buildServerEnv(overrides = {}) {
  const env = { ...process.env };
  for (const name of BLANKED_ENV) env[name] = '';
  Object.assign(env, {
    PORT: String(PORT),
    PLACES_API_BASE: MOCK,
    GEOCODE_API_BASE: MOCK,
    GEMINI_API_BASE: MOCK,
    TRAVELPAYOUTS_API_BASE: MOCK,
    RAKUTEN_API_BASE: MOCK + '/rakuten',
    TEST_EXTERNAL_PROXY: MOCK + '/__external',
    SESSION_SECRET: TEST_SESSION_SECRET,
    TABIMARU_DATA_DIR: DEFAULT_TEST_DATA_DIR
  }, overrides);
  return env;
}

let current = null;

async function startServer(name, overrides = {}) {
  await stopServer();
  responseLog = [];
  const proc = spawn(process.execPath, ['--require', GUARD, path.join(PROJECT, 'server.js')], {
    env: buildServerEnv(overrides), cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe']
  });
  const logs = { out: '', err: '' };
  proc.stdout.on('data', (d) => { logs.out += d; });
  proc.stderr.on('data', (d) => { logs.err += d; });
  const exited = new Promise((resolve) => proc.once('exit', (code, signal) => resolve({ code, signal })));
  current = { name, proc, logs, exited };
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) break;
    try {
      const r = await fetchUrl('/api/health', { timeout: 2000, record: false });
      if (r.status === 200) return current;
    } catch { /* 아직 시작 전 */ }
    await sleep(150);
  }
  const tail = (logs.err || logs.out).slice(-1200);
  await stopServer();
  throw new Error(`server (${name}) did not start: ${tail}`);
}

async function stopServer() {
  if (!current) return null;
  const c = current;
  current = null;
  if (c.proc.exitCode === null) c.proc.kill();
  await Promise.race([c.exited, sleep(5000)]);
  return c;
}

function serverLogs() {
  return current ? current.logs.out + current.logs.err : '';
}

function checkNoSecrets(label, secrets) {
  const leaks = [];
  for (const r of responseLog) {
    const hay = r.body + JSON.stringify(r.headers || {});
    for (const s of secrets) if (s && hay.includes(s)) leaks.push(`${r.path} contains ${s.slice(0, 6)}…`);
  }
  log(leaks.length === 0, `${label}: no key/token appears in any of ${responseLog.length} responses`, leaks.slice(0, 3).join('; '));
}

function checkNoUnexpectedExternal(label) {
  const bad = mock.entries('unexpectedExternal').map((e) => e.host);
  const unknown = mock.entries('unknownMockRoute').map((e) => `${e.method} ${e.path}`);
  log(bad.length === 0, `${label}: no real network (no unexpected external host)`, [...new Set(bad)].join(', '));
  log(unknown.length === 0, `${label}: every vendor call hit a known mock route`, [...new Set(unknown)].slice(0, 5).join(', '));
}

function checkNoFatal(label) {
  const logs = serverLogs();
  const fatal = /\[FATAL\]|Unhandled rejection|TypeError|ReferenceError|\[api\] [A-Z]+ \S+ 처리 실패/.exec(logs);
  log(!fatal, `${label}: server log has no crash/uncaught errors`, fatal ? logs.slice(Math.max(0, fatal.index - 200), fatal.index + 300) : '');
}

function futureDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

// DOM 흉내에서 쓰는 /api/travel-plan 가짜 응답(무료 모드 모양)
function samplePlanResponse() {
  return {
    source: 'integrated_travel_planner_v1',
    city: '도쿄',
    recommendationSource: 'local_curated_fallback',
    recommendationInfo: { kind: 'curated', provider: 'curated+wikimedia', reasonCode: null },
    recommendations: [{
      name: '센소지', city: '도쿄', area: '아사쿠사', category: '문화', aiScore: 82, crowdScore: 3,
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sensoji.jpg/500px-Sensoji.jpg',
      photoCredit: { artist: 'Test Artist', license: 'CC BY-SA 4.0', filePage: 'https://commons.wikimedia.org/wiki/File:Sensoji.jpg', scope: 'place' },
      lat: 35.7148, lng: 139.7967
    }, {
      // 자기 사진이 없어 도시 대표 사진을 붙인 카드(서버 withCityPhotoFallback 모양)
      name: '츠키지 외시장', city: '도쿄', area: '츠키지', category: '미식', aiScore: 78, crowdScore: 4,
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Akiba_denkigai.jpg/500px-Akiba_denkigai.jpg',
      photoCredit: { artist: 'City Photographer', license: 'CC BY 2.0', filePage: 'https://commons.wikimedia.org/wiki/File:Akiba_denkigai.jpg', scope: 'city' }
    }],
    recommendedFoods: [],
    foodsInfo: { kind: 'curated', provider: 'curated', reasonCode: null },
    itinerary: [{
      day: 1, date: futureDate(20),
      blocks: ['오전(09:00-11:00): 센소지 (아사쿠사)', '오후(13:00-15:00): 메이지 신궁 (하라주쿠)'],
      places: [{ name: '센소지', period: '오전', lat: 35.7148, lng: 139.7967 }, { name: '메이지 신궁', period: '오후', lat: 35.6764, lng: 139.6993 }]
    }],
    placeCoords: { '센소지': { lat: 35.7148, lng: 139.7967 } },
    itinerarySource: 'ai_planner_v1',
    itineraryInfo: { kind: 'rule', provider: 'rule_planner', reasonCode: null },
    tips: [],
    summary: '도쿄 여행지 추천 1곳 + 1일 일정',
    aiNote: '',
    aiErrors: []
  };
}

// 균형 괄호 추출(문자열·주석 건너뜀) — app.js의 I18N 같은 리터럴을 vm으로 평가할 때 쓴다.
function extractBalanced(code, startIdx) {
  let depth = 0;
  for (let i = startIdx; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < code.length && code[i] !== quote) { if (code[i] === '\\') i++; i++; }
      continue;
    }
    if (ch === '/' && code[i + 1] === '/') { const nl = code.indexOf('\n', i); if (nl < 0) return null; i = nl; continue; }
    if (ch === '/' && code[i + 1] === '*') { const end = code.indexOf('*/', i + 2); if (end < 0) return null; i = end + 1; continue; }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') { depth--; if (depth === 0) return code.slice(startIdx, i + 1); }
  }
  return null;
}

// 객체 리터럴 원문({ ... })에서 바로 아래 단계의 키 이름을 순서대로 뽑는다(문자열·주석 건너뜀). 중복 키 검사용.
function objectLiteralKeys(src) {
  const keys = [];
  let depth = 0;
  let expectKey = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); if (nl < 0) break; i = nl; continue; }
    if (ch === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); if (end < 0) break; i = end + 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let text = '';
      while (j < src.length && src[j] !== quote) { if (src[j] === '\\') { text += src[j + 1]; j += 2; continue; } text += src[j]; j++; }
      if (depth === 1 && expectKey && /^\s*:/.test(src.slice(j + 1, j + 20))) { keys.push(text); expectKey = false; }
      i = j;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; if (depth === 1) expectKey = true; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; continue; }
    if (depth === 1 && ch === ',') { expectKey = true; continue; }
    if (depth === 1 && expectKey && /[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][\w$]*(?=\s*:)/.exec(src.slice(i));
      if (m) { keys.push(m[0]); expectKey = false; i += m[0].length - 1; }
    }
  }
  return keys;
}

// ── CSS 사용자 정의 속성 검사 ──
function cssVariableReport(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const defs = new Map();
  for (const m of clean.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]*)/g)) {
    if (!defs.has(m[1])) defs.set(m[1], []);
    defs.get(m[1]).push(m[2].trim());
  }
  const refsOf = (v) => [...v.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((x) => x[1]);
  const selfRefs = [];
  for (const [name, vals] of defs) for (const v of vals) if (refsOf(v).includes(name)) selfRefs.push(`${name}: ${v}`);
  const cycles = [];
  const state = new Map();
  const visit = (n, trail) => {
    if (state.get(n) === 2) return;
    if (state.get(n) === 1) { const i = trail.indexOf(n); cycles.push(trail.slice(i).concat(n).join(' -> ')); return; }
    state.set(n, 1);
    for (const v of defs.get(n) || []) for (const r of refsOf(v)) if (defs.has(r) && r !== n) visit(r, trail.concat(n));
    state.set(n, 2);
  };
  for (const n of defs.keys()) visit(n, []);
  return { defs, selfRefs, cycles };
}

function undefinedVarUses(text, defs) {
  const out = new Set();
  for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)) if (!defs.has(m[1])) out.add(m[1]);
  return [...out];
}

// ══════════════════════════════════════════════════════════════════════
async function runTests() {
  console.log('\n=== Runtime Integration Tests (hermetic: no real network, no .env keys) ===\n');

  const appCode = read('public/app.js');
  const htmlCode = read('public/index.html');
  const cssCode = read('public/styles.css');

  // 개발용 부분 실행: TEST_ONLY=sandbox,intent,itinerary 처럼 고른 단계만 돌린다(npm test·CI는 늘 전체).
  const only = new Set(String(process.env.TEST_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean));
  if (only.size > 0) {
    results.push(`  [partial run: TEST_ONLY=${[...only].join(',')}]`);
    const start = appCode.indexOf('var I18N = {');
    const dict = vm.runInNewContext('(' + extractBalanced(appCode, appCode.indexOf('{', start)) + ')', {});
    if (only.has('sandbox')) { await sandboxSchedulingTests(htmlCode, appCode, dict); await sandboxStorageTests(htmlCode, appCode, dict); }
    const phases = { intent: phaseIntentRegression, itinerary: phaseAiItinerary, chain: phaseGeminiChain, oauth: phaseOauthAndAiErrors, session: phaseSessionsAndStorage, live: phaseGoogleLive, free: phaseFree };
    const chosen = Object.keys(phases).filter((k) => only.has(k));
    if (chosen.length) {
      await mock.start();
      try { for (const k of chosen) await phases[k](); } finally { await stopServer(); await mock.stop(); }
    }
    printResults();
    return;
  }

  // ── 1. Code Analysis ──
  section('Code Analysis');

  // I18N dict must not contain t() calls
  const i18nStart = appCode.indexOf('var I18N = {');
  const i18nEnd = appCode.indexOf('};', appCode.indexOf('ja: {', i18nStart)) + 2;
  const i18nBlock = appCode.substring(i18nStart, i18nEnd);
  const tInDict = (i18nBlock.match(/t\('[^']+'\)/g) || []);
  log(tInDict.length === 0, 'No t() calls inside I18N dictionary', tInDict.length + ' found: ' + tInDict.slice(0, 3).join(', '));

  // t() function must be a function declaration (hoisted)
  log(/^function t\(/m.test(appCode), 'function t() is declared (hoistable)');

  // tPeriod helper exists
  log(/function tPeriod\(/.test(appCode), 'tPeriod() helper exists');

  // currentLang defined
  log(/var currentLang/.test(appCode), 'currentLang variable defined');

  // applyLanguage has re-render logic
  log(appCode.includes('renderItineraryTimeline') && appCode.includes('renderFlightCards'), 'applyLanguage triggers re-render');

  // All el() addEventListener calls have corresponding HTML ids
  const elListenerPattern = /el\('([^']+)'\)\.addEventListener/g;
  let match;
  const missingIds = [];
  while ((match = elListenerPattern.exec(appCode)) !== null) {
    const id = match[1];
    if (!htmlCode.includes('id="' + id + '"')) missingIds.push(id);
  }
  log(missingIds.length === 0, 'All el() listener targets exist in HTML', 'missing: ' + missingIds.join(', '));

  // Server: all Google Places functions have lang param
  const langFunctions = [
    'fetchGoogleAttractions', 'fetchPlacesWithGoogle', 'fetchFoodPlacesForCity',
    'fetchRecommendedFoods', 'ensureDynamicCityProfile'
  ];
  for (const fn of langFunctions) {
    const re = new RegExp('function ' + fn + '\\([^)]*lang');
    log(re.test(serverCode), fn + ' has lang parameter');
  }

  // Server: no hardcoded languageCode: 'ko'
  const hardcoded = (serverCode.match(/languageCode:\s*'ko'/g) || []);
  log(hardcoded.length === 0, 'No hardcoded languageCode: ko', hardcoded.length + ' found');

  log(/function localizeAddress\(/.test(serverCode), 'localizeAddress function exists');
  log(serverCode.includes('PRIMARY_TYPE_EN'), 'PRIMARY_TYPE_EN dictionary exists');
  log(serverCode.includes('PRIMARY_TYPE_JA'), 'PRIMARY_TYPE_JA dictionary exists');

  // I18N ko/en/ja all have dynamic content keys
  const requiredKeys = ['day-prefix', 'arrival', 'departure', 'checkin', 'checkout',
    'selected-flight', 'selected-stay', 'meal-breakfast', 'meal-lunch', 'meal-dinner',
    'source-rule', 'mock-notice', 'no-results'];
  for (const key of requiredKeys) {
    log(i18nBlock.includes("'" + key + "'"), 'I18N has key: ' + key);
  }

  const dataI18nCount = (htmlCode.match(/data-i18n=/g) || []).length;
  log(dataI18nCount >= 50, 'HTML has ' + dataI18nCount + ' data-i18n attributes (>=50)');

  // ── 1b. Static checks (syntax, i18n, CSS, brand, config drift) ──
  section('Static Checks');

  const jsFiles = ['server.js', 'public/app.js', 'test_all.js', '_test_api.js',
    'tests/support/mock-vendor.js', 'tests/support/net-guard.js', 'tests/support/browser-sandbox.js']
    .concat(['build-place-images.js', 'build-city-places.js', 'ja-names.js'].filter((f) => fs.existsSync(path.join(PROJECT, 'scripts', f))).map((f) => `scripts/${f}`));
  for (const f of jsFiles) {
    const r = spawnSync(process.execPath, ['--check', path.join(PROJECT, f)], { encoding: 'utf8' });
    log(r.status === 0, `node --check ${f}`, short(r.stderr, 400));
  }

  // ko 사전에 ja/en에만 있는 키가 없어야 한다(키 이름이 화면에 그대로 나오는 문제 방지)
  let i18nDict = { ko: {}, en: {}, ja: {} };
  try {
    const obj = extractBalanced(appCode, appCode.indexOf('{', i18nStart));
    const dict = vm.runInNewContext('(' + obj + ')', {});
    i18nDict = dict;
    const ko = new Set(Object.keys(dict.ko || {}));
    const jaOnly = Object.keys(dict.ja || {}).filter((k) => !ko.has(k));
    const enOnly = Object.keys(dict.en || {}).filter((k) => !ko.has(k));
    log(jaOnly.length === 0, 'I18N: ko has every key that ja has (' + ko.size + ' ko keys)', jaOnly.slice(0, 8).join(', '));
    log(enOnly.length === 0, 'I18N: ko has every key that en has', enOnly.slice(0, 8).join(', '));
    const jaHangul = Object.entries(dict.ja || {}).filter(([, v]) => typeof v === 'string' && HANGUL_RE.test(v)).map(([k]) => k);
    log(jaHangul.length === 0, 'I18N: ja values contain no Korean text', jaHangul.slice(0, 8).join(', '));
  } catch (e) {
    log(false, 'I18N dictionary evaluates as a plain object literal', e.message);
  }

  // CSS: 자기 자신을 참조하는 사용자 정의 속성(예: --bg-2: var(--bg-2))은 값이 비어 투명해진다
  const cssReport = cssVariableReport(cssCode);
  log(cssReport.selfRefs.length === 0, 'CSS: no self-referencing custom properties', cssReport.selfRefs.slice(0, 3).join(' | '));
  log(cssReport.cycles.length === 0, 'CSS: no custom property reference cycles', cssReport.cycles.slice(0, 3).join(' | '));
  const undefinedInCss = undefinedVarUses(cssCode, cssReport.defs);
  log(undefinedInCss.length === 0, 'CSS: every var(--x) without fallback is defined in styles.css', undefinedInCss.join(', '));
  const undefinedInApp = undefinedVarUses(appCode + '\n' + htmlCode, cssReport.defs);
  log(undefinedInApp.length === 0, 'CSS vars used in app.js/index.html are defined in styles.css', undefinedInApp.join(', '));

  // CSS 중복 사본 정리(MC-01): 최상위 규칙은 한 번씩만(반응형 @media 안의 덮어쓰기는 들여쓰기라 세지 않는다)
  for (const sel of ['.rec-tabs {', '.itin-meal-empty {', '.drop-active .drop-hint']) {
    const n = (cssCode.match(new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm')) || []).length;
    log(n === 1, `CSS: top-level rule "${sel}" appears exactly once (duplicate copies removed)`, `${n} found`);
  }
  // 키보드 포커스 링(MC-03): 조작 요소 전체에 :focus-visible 외곽선
  const focusRule = /:where\([^)]*\bbutton\b[^)]*\ba\b[^)]*\binput\b[^)]*\):focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--accent\)/.test(cssCode);
  log(focusRule, 'CSS: global :focus-visible rule (button, a, input …) draws a 2px accent outline');
  // 안내 토스트는 글자뿐이라 클릭을 가로채지 않아야 한다(일정 넣기 창의 [추가] 위에 떠도 탭이 버튼으로 감), 창이 열리면 위쪽에
  const cssNoComments = cssCode.replace(/\/\*[\s\S]*?\*\//g, '');
  const toastRule = (/(^|\n)\.memo-toast\s*\{([^}]*)\}/.exec(cssNoComments) || [])[2] || '';
  log(/pointer-events:\s*none/.test(toastRule) && /body:has\(\.plan-modal-overlay:not\(\.hidden\)\) \.memo-toast/.test(cssNoComments),
    'CSS: .memo-toast has pointer-events: none and moves to the top while a modal is open', short(toastRule));
  log(/(^|\n)::placeholder\s*\{[^}]*color:\s*var\(--fg-3\)[^}]*opacity:\s*1/.test(cssNoComments), 'CSS: ::placeholder uses var(--fg-3) at full opacity (dark-mode contrast)');
  // 다크 모드(MC-10): 밝은 :root의 색 토큰을 OS 다크 설정(@media)과 data-theme="dark" 양쪽에서 모두 다시 정한다
  try {
    const cleanCss = cssCode.replace(/\/\*[\s\S]*?\*\//g, '');
    const blockAt = (re) => {
      const idx = cleanCss.search(re);
      return idx < 0 ? '' : (extractBalanced(cleanCss, cleanCss.indexOf('{', idx)) || '');
    };
    const declsOf = (block) => new Map([...block.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    const lightRoot = declsOf(blockAt(/(^|\n)\s*:root\s*\{/));
    const isColorValue = (v) => /^(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\()/i.test(v) || /\brgba?\(/i.test(v);
    const colorTokens = [...lightRoot].filter(([, v]) => isColorValue(v)).map(([k]) => k);
    const darkMediaBlock = blockAt(/@media\s*\(prefers-color-scheme:\s*dark\)/);
    const darkMedia = declsOf(darkMediaBlock);
    const darkAttr = declsOf(blockAt(/:root\[data-theme="dark"\]\s*\{/));
    const missMedia = colorTokens.filter((k) => !darkMedia.has(k));
    const missAttr = colorTokens.filter((k) => !darkAttr.has(k));
    log(colorTokens.length >= 20 && /:root:not\(\[data-theme="light"\]\)/.test(darkMediaBlock) && missMedia.length === 0 && missAttr.length === 0,
      `CSS dark mode: prefers-color-scheme dark (:root:not([data-theme=light])) and :root[data-theme=dark] redefine all ${colorTokens.length} light color tokens`,
      short({ missMedia, missAttr }));
  } catch (e) { log(false, 'CSS dark mode token check', e.message); }

  // app.js: 예전 '서버 식사 블록 지우기'와 브라우저 대화상자(alert/prompt)는 없어야 한다(인라인 메모·토스트로 대체)
  log(!appCode.includes('stripServerMealBlocks'), "app.js: no stripServerMealBlocks (AI meal blocks are kept, classifyServerBlocks instead)");
  const dialogCalls = appCode.match(/\b(?:window\.)?(?:alert|prompt)\s*\(/g) || [];
  log(dialogCalls.length === 0, 'app.js: no alert( / prompt( calls (toasts and inline editors instead)', dialogCalls.join(', '));

  // i18n: 코드가 t('키')로 쓰는 키와 data-i18n 속성 키는 ko/en/ja 사전에 모두 있어야 한다.
  // 이미 빠져 있던 키(이 검사를 만들 때 0개)는 아래 허용 목록에 이유와 함께 적는다. 새로 빠진 키는 실패한다.
  const I18N_KNOWN_MISSING = new Set([]);
  try {
    const dictSrcStart = appCode.indexOf('{', i18nStart);
    const dictSrc = extractBalanced(appCode, dictSrcStart) || '';
    const codeOutsideDict = appCode.slice(0, dictSrcStart) + appCode.slice(dictSrcStart + dictSrc.length);
    const literalKeys = new Set([...codeOutsideDict.matchAll(/\bt\('([^'\\]+)'\)/g)].map((m) => m[1]));
    const attrKeys = new Set([...(htmlCode + '\n' + codeOutsideDict).matchAll(/data-i18n(?:-placeholder|-aria|-title)?="([a-z0-9][a-z0-9-]*)"/g)].map((m) => m[1]));
    const missingIn = (keys) => [...keys].filter((k) => !I18N_KNOWN_MISSING.has(k))
      .flatMap((k) => ['ko', 'en', 'ja'].filter((l) => !Object.prototype.hasOwnProperty.call(i18nDict[l] || {}, k)).map((l) => `${l}:${k}`));
    const missLiteral = missingIn(literalKeys);
    const missAttr = missingIn(attrKeys);
    log(literalKeys.size > 200 && missLiteral.length === 0, `I18N: every t('key') literal used in app.js exists in ko/en/ja (${literalKeys.size} keys)`, missLiteral.slice(0, 10).join(', '));
    log(attrKeys.size > 100 && missAttr.length === 0, `I18N: every data-i18n* key in index.html/app.js exists in ko/en/ja (${attrKeys.size} keys)`, missAttr.slice(0, 10).join(', '));
    // 같은 키가 두 번 있으면 vm 평가는 뒤 값만 남겨 앞 값을 고친 사람이 헛수고를 한다 → 원문에서 키를 직접 센다.
    const dupKeys = [];
    for (const lang of ['ko', 'en', 'ja']) {
      const at = dictSrc.search(new RegExp('\\n\\s*' + lang + ':\\s*\\{'));
      const sub = at >= 0 ? (extractBalanced(dictSrc, dictSrc.indexOf('{', at)) || '') : '';
      const keys = objectLiteralKeys(sub);
      const seen = new Set();
      for (const k of keys) { if (seen.has(k)) dupKeys.push(`${lang}:${k}`); seen.add(k); }
      if (keys.length !== Object.keys(i18nDict[lang] || {}).length + dupKeys.filter((d) => d.startsWith(lang + ':')).length) dupKeys.push(`${lang}: key count mismatch (${keys.length})`);
    }
    log(dupKeys.length === 0, 'I18N: no duplicate keys in the ko/en/ja dictionaries', dupKeys.slice(0, 8).join(', '));
    // index.html의 기본 글자(첫 화면·ko)는 ko 사전 값과 같아야 한다(applyStaticI18n 전 깜빡임·어긋남 방지)
    const decodeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const htmlTextDrift = [...htmlCode.matchAll(/<([a-z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>([^<]*)<\/\1>/g)]
      .filter((m) => typeof (i18nDict.ko || {})[m[2]] === 'string' && decodeHtml(m[3]).trim() !== i18nDict.ko[m[2]].trim())
      .map((m) => `${m[2]}: "${decodeHtml(m[3]).trim()}" != "${i18nDict.ko[m[2]]}"`);
    log(htmlTextDrift.length === 0, 'index.html: default text of every data-i18n element equals the ko dictionary value', htmlTextDrift.slice(0, 4).join(' | '));
  } catch (e) { log(false, 'I18N used-key check', e.message); }

  // 브랜드는 한곳에서만 정한다(이름 변경 대비)
  log(/const APP_BRAND = '[^']+';/.test(serverCode) && /const APP_ID = '[^']+';/.test(serverCode), 'Brand: server has APP_BRAND/APP_ID constants');
  log(/var BRAND_NAME = '[^']+';/.test(appCode), 'Brand: client has BRAND_NAME constant');

  // 브랜드 = Tabimaru. 도메인에 묶인 값(Render 주소·서비스 이름, OAuth 콜백, Rakuten Referer, sid 쿠키, localStorage 키, start_url)은 그대로.
  log(/const APP_BRAND = 'Tabimaru';/.test(serverCode) && /const APP_ID = 'tabimaru';/.test(serverCode), "Brand: server APP_BRAND = 'Tabimaru', APP_ID = 'tabimaru'");
  log(/var BRAND_NAME = 'Tabimaru';/.test(appCode), "Brand: client BRAND_NAME = 'Tabimaru'");
  log(/const OUTBOUND_USER_AGENT = `TabimaruBot\/0\.1 \(\+\$\{APP_REPO_URL\}\)`;/.test(serverCode) && serverCode.includes(`const APP_REPO_URL = '${REPO_URL}';`),
    'Brand: outbound User-Agent is TabimaruBot/0.1 (+repo URL)');
  const htmlTitle = (/<title>([^<]*)<\/title>/i.exec(htmlCode) || [])[1];
  log(htmlTitle === BRAND_TITLE.ko, `Brand: index.html <title> is "${BRAND_TITLE.ko}"`, short(htmlTitle));
  let manifest = {};
  try { manifest = JSON.parse(read('public/manifest.webmanifest')); } catch (e) { manifest = { error: e.message }; }
  log(manifest.name === BRAND_TITLE.ko && manifest.short_name === 'Tabimaru', 'Brand: manifest name / short_name are Tabimaru', short({ name: manifest.name, short_name: manifest.short_name }));
  log(manifest.start_url === '/', 'manifest start_url unchanged ("/")', short(manifest.start_url));
  log(i18nDict.ko['brand-subtitle'] === 'AI 일본 여행 플래너' && i18nDict.en['brand-subtitle'] === 'AI Japan Trip Planner' && i18nDict.ja['brand-subtitle'] === 'AI日本旅行プランナー',
    'Brand: subtitle ko/en/ja = AI 일본 여행 플래너 / AI Japan Trip Planner / AI日本旅行プランナー', short([i18nDict.ko['brand-subtitle'], i18nDict.en['brand-subtitle'], i18nDict.ja['brand-subtitle']]));
  const publicText = appCode + htmlCode + read('public/manifest.webmanifest') + (fs.existsSync(path.join(PROJECT, 'public', 'favicon.svg')) ? read('public/favicon.svg') : '');
  log(!/JapanTravel Suite|japantravel-suite/i.test(publicText), 'Brand: old name (JapanTravel Suite) is gone from public/*');
  const LS_KEYS = ['travelLang', 'travelWishlist', 'travelSearchHistory', 'travelPreferences', 'travelChecklist', 'placeMemos'];
  const missingLs = LS_KEYS.filter((k) => !appCode.includes(`'${k}'`));
  log(missingLs.length === 0, 'Domain-bound: localStorage keys unchanged (' + LS_KEYS.join(', ') + ')', missingLs.join(', '));
  // 새 키는 편집 중 초안 'tabimaru.draft.v1' 하나만 더해졌다(기존 6개를 대신하지 않는다). 상수(DRAFT_KEY 등)로 쓴 키도 풀어서 본다.
  const lsConsts = new Map([...appCode.matchAll(/\bvar ([A-Z_]+_KEY) = '([^']+)';/g)].map((m) => [m[1], m[2]]));
  const lsUsed = new Set([...appCode.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*(?:'([^']+)'|([A-Z_]+_KEY))/g)].map((m) => m[1] || lsConsts.get(m[2]) || `?${m[2]}`));
  const lsExtra = [...lsUsed].filter((k) => !LS_KEYS.includes(k) && k !== 'tabimaru.draft.v1');
  log(lsConsts.get('DRAFT_KEY') === 'tabimaru.draft.v1' && lsUsed.has('tabimaru.draft.v1') && lsExtra.length === 0 && LS_KEYS.every((k) => lsUsed.has(k)),
    "localStorage: only one new key ('tabimaru.draft.v1') next to the 6 existing ones", short({ used: [...lsUsed], extra: lsExtra }));
  const oauthPaths = ['/api/auth/google/callback', '/api/auth/naver/callback', '/api/auth/kakao/callback'];
  log(serverCode.includes("const SESSION_COOKIE = 'sid';") && serverCode.includes('`${SESSION_COOKIE}=${token}; ')
    && serverCode.includes("'Referer': 'https://japanjapantravel.onrender.com/'") && oauthPaths.every((p) => serverCode.includes(p)),
    "Domain-bound: cookie 'sid', Rakuten Referer and OAuth callback paths unchanged");
  // 세션·저장소 설계 고정점: 사용자 id는 OAuth 신원의 sha256(SESSION_SECRET과 무관), Bearer는 예전 JWT 키(eyJ…)에만
  log(/return 'u_' \+ createHash\('sha256'\)\.update\(`\$\{provider\}:\$\{providerId\}`\)\.digest\('hex'\)\.slice\(0, 24\);/.test(serverCode),
    "Session: stable user id = 'u_' + sha256(provider:providerId).slice(0,24) (independent of SESSION_SECRET)");
  log(/if \(SUPABASE_SERVICE_ROLE_KEY\.startsWith\('eyJ'\)\) headers\.Authorization = `Bearer \$\{SUPABASE_SERVICE_ROLE_KEY\}`;/.test(serverCode) && !/Authorization: `Bearer \$\{SUPABASE_SERVICE_ROLE_KEY\}`/.test(serverCode),
    'Supabase: Authorization: Bearer is sent only for legacy JWT keys (eyJ…); apikey header always');
  log(!/sessionStore|new Map\(\);\s*\/\/\s*sessions?/i.test(serverCode), 'Session: no in-memory session Map left (stateless signed cookie)');
  // SESSION_SECRET 하나로 누구의 sid든 만들 수 있으므로: 약한 값(32자 미만·서로 다른 글자 10개 미만)은 쓰지 않고, 키는 scrypt로 파생
  log(/const SESSION_SECRET_MIN_CHARS = 32;/.test(serverCode) && /const SESSION_SECRET_MIN_DISTINCT = 10;/.test(serverCode)
    && /if \(SESSION_SECRET_STATE === 'ok'\) return envValue\('SESSION_SECRET'\);/.test(serverCode)
    && /scryptSync\(SESSION_SECRET, 'tabimaru-sid-v1', 32, \{ N: 16384, r: 8, p: 1 \}\)/.test(serverCode)
    && /createHmac\('sha256', SESSION_KEY\)\.update\(part\)/.test(serverCode) && !/createHmac\('sha256', SESSION_SECRET\)/.test(serverCode),
    'Session: a weak SESSION_SECRET (< 32 chars or < 10 distinct chars) is not used; the cookie key is scrypt(SESSION_SECRET) mixed with the login allowlist');
  // keepalive: 실패는 짧게(워크플로 재시도 30초보다 짧게) 재사용해서 다음 재시도가 실제로 다시 확인한다
  const kaFail = /const KEEPALIVE_FAIL_CACHE_MS = ([\d_]+);/.exec(serverCode);
  log(Boolean(kaFail) && Number(kaFail[1].replace(/_/g, '')) > 0 && Number(kaFail[1].replace(/_/g, '')) < 30_000 && /const KEEPALIVE_CACHE_MS = 10 \* 60_000;/.test(serverCode),
    'keepalive caches success for 10 minutes and failure for less than the workflow retry gap (30 s)', short(kaFail && kaFail[1]));
  // 저장소 확인은 실제 조회(주소·키·표 모두 확인). 예전 HEAD /rest/v1/ 확인(401이어도 '닿음')은 없어야 한다
  log(/supabaseRequest\('GET', 'travel_plans\?select=id&limit=1'/.test(serverCode) && !/\/rest\/v1\/`, \{\s*method: 'HEAD'/.test(serverCode),
    "Supabase check = GET travel_plans?select=id&limit=1 (a wrong key or a missing table is not 'reachable')");

  // 공급자 모드 기본값: 무료(Google 호출 없음) + OSM
  log(/PLACES_PROVIDER = envValue\('PLACES_PROVIDER'\)\.toLowerCase\(\) === 'google' \? 'google' : 'free'/.test(serverCode), 'Server: PLACES_PROVIDER defaults to free');
  log(/MAP_PROVIDER = envValue\('MAP_PROVIDER'\)\.toLowerCase\(\) === 'google' \? 'google' : 'osm'/.test(serverCode), 'Server: MAP_PROVIDER defaults to osm');
  log(!/rakuten-config/.test(appCode) && !/pathname === '\/api\/rakuten-config'/.test(serverCode), 'Rakuten config endpoint/client code removed');
  const serverNoComments = serverCode.replace(/^\s*\/\/.*$/gm, '');
  log(!/amadeus\.com|AMADEUS_[A-Z_]+/i.test(serverNoComments), 'Amadeus removed from server (flights/stays: live provider -> mock)');

  // index.html 인라인 스크립트는 우리 API를 부르지 않는다
  const inlineScripts = [...htmlCode.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  log(inlineScripts.every((s) => !s.includes('/api/')), 'index.html inline scripts call no /api/ endpoint');

  // 설정 문서 드리프트: 서버가 읽는 환경변수는 render.yaml·.env.example·README에 모두 있어야 한다
  const TEST_HOOK_ENV = new Set(['PLACES_API_BASE', 'GEOCODE_API_BASE', 'GEMINI_API_BASE', 'TRAVELPAYOUTS_API_BASE', 'RAKUTEN_API_BASE', 'PLACE_IMAGES_FILE']);
  const PLATFORM_ENV = new Set(['PORT', 'RENDER']);
  const ALIAS_ENV = new Set(['OPENAI_KEY', 'GOOGLE_API_KEY']);
  const runtimeEnv = [...envNamesReadByServer(serverCode)].filter((n) => !TEST_HOOK_ENV.has(n) && !PLATFORM_ENV.has(n)).sort();
  const renderYaml = read('render.yaml');
  const envExample = read('.env.example');
  const readme = read('README.md');
  const renderKeys = new Set([...renderYaml.matchAll(/-\s*key:\s*([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]));
  const exampleKeys = new Set(dotenvNames('.env.example'));
  const missingRender = runtimeEnv.filter((n) => !ALIAS_ENV.has(n) && !renderKeys.has(n));
  const missingExample = runtimeEnv.filter((n) => !ALIAS_ENV.has(n) && !exampleKeys.has(n));
  const missingReadme = runtimeEnv.filter((n) => !readme.includes(n));
  const staleRender = [...renderKeys].filter((n) => !runtimeEnv.includes(n) && n !== 'NODE_VERSION');
  log(missingRender.length === 0, `render.yaml lists every runtime env var (${runtimeEnv.length})`, missingRender.join(', '));
  log(staleRender.length === 0, 'render.yaml has no env var the server no longer reads', staleRender.join(', '));
  log(missingExample.length === 0, '.env.example lists every runtime env var', missingExample.join(', '));
  log(missingReadme.length === 0, 'README documents every runtime env var', missingReadme.join(', '));
  log(/^\s*name:\s*japantravel-suite\s*$/m.test(renderYaml), 'render.yaml service name unchanged');
  let pkg = {};
  try { pkg = JSON.parse(read('package.json')); } catch { pkg = {}; }
  log(pkg.scripts && pkg.scripts.test === 'node test_all.js', 'package.json scripts.test = node test_all.js');
  log(pkg.engines && /^>=\s*20/.test(String(pkg.engines.node || '')), 'package.json engines.node >=20');
  log(pkg.name === 'tabimaru' && /Tabimaru/.test(String(pkg.description || '')), 'package.json name = tabimaru (description mentions Tabimaru)', short({ name: pkg.name, description: pkg.description }));
  const readmeTitle = (readme.split(/\r?\n/).find((l) => l.trim()) || '').trim();
  log(readmeTitle === '# ' + BRAND_TITLE.ko, `README title is "# ${BRAND_TITLE.ko}"`, short(readmeTitle));
  log(readme.includes(REPO_URL) && readme.includes(PRODUCTION_URL), 'README links the renamed repo and the unchanged production URL');
  const docsTitles = { 'ARCHITECTURE.md': read('ARCHITECTURE.md'), 'deploy/DEPLOY.md': read('deploy/DEPLOY.md'), 'deploy/supabase/schema.sql': read('deploy/supabase/schema.sql') };
  const oldBrandDocs = Object.entries(docsTitles).filter(([, text]) => !/Tabimaru/.test(text.split(/\r?\n/).slice(0, 3).join('\n'))).map(([f]) => f);
  log(oldBrandDocs.length === 0, 'ARCHITECTURE.md / DEPLOY.md / schema.sql headers use the Tabimaru name', oldBrandDocs.join(', '));
  // Google 호출 상한 기본값: server.js의 nonNegativeInt(envValue('X'), N)과 README 표의 `N`이 같아야 한다.
  const capDefaults = [...serverCode.matchAll(/nonNegativeInt\(envValue\('(GOOGLE_[A-Z_]+_LIMIT)'\),\s*(\d+)\)/g)].map((m) => ({ name: m[1], def: m[2] }));
  const capDrift = capDefaults.filter(({ name, def }) => !new RegExp('^\\|\\s*`' + name + '`\\s*\\|\\s*`' + def + '`\\s*\\|', 'm').test(readme)).map((c) => `${c.name}=${c.def}`);
  log(capDefaults.length >= 4 && capDrift.length === 0, `README env table shows the server's Google cap defaults (${capDefaults.map((c) => c.name.replace('GOOGLE_', '') + '=' + c.def).join(', ')})`, capDrift.join(', '));
  const ciPath = path.join(PROJECT, '.github', 'workflows', 'ci.yml');
  const ci = fs.existsSync(ciPath) ? fs.readFileSync(ciPath, 'utf8') : '';
  log(/\bpush\b/.test(ci) && /\bpull_request\b/.test(ci) && /node-version:\s*['"]?20/.test(ci) && /npm test/.test(ci), 'CI workflow runs npm test on Node 20 for push + pull_request');
  // Supabase 무료 프로젝트 일시 중지 방지: 3일마다 운영 /api/keepalive(비밀값 없음, 권한 없음, 5번까지 다시 시도)
  const kaPath = path.join(PROJECT, '.github', 'workflows', 'keepalive.yml');
  const ka = fs.existsSync(kaPath) ? fs.readFileSync(kaPath, 'utf8') : '';
  const kaChecks = {
    cron: /-\s*cron:\s*'17 3 \*\/3 \* \*'/.test(ka),
    dispatch: /^\s*workflow_dispatch:\s*$/m.test(ka),
    noPermissions: /^permissions:\s*\{\}\s*$/m.test(ka),
    runner: /runs-on:\s*ubuntu-latest/.test(ka) && /timeout-minutes:\s*10\b/.test(ka),
    url: ka.includes('https://japanjapantravel.onrender.com/api/keepalive'),
    retries: /for i in 1 2 3 4 5; do/.test(ka) && /--max-time 90\b/.test(ka) && /sleep 30\b/.test(ka),
    okOnly: ka.includes(`grep -q '"supabase":"ok"'`) && /exit 1\s*$/.test(ka.trim() + '\n'),
    noSecrets: !/\$\{\{\s*secrets\./.test(ka) && !/SUPABASE_SERVICE_ROLE_KEY|SESSION_SECRET/.test(ka)
  };
  log(Object.values(kaChecks).every(Boolean), "keepalive.yml: cron '17 3 */3 * *' + workflow_dispatch, permissions {}, ubuntu-latest 10 min, curl /api/keepalive 5 tries (90s, sleep 30), ok only on \"supabase\":\"ok\", no secrets",
    short(Object.entries(kaChecks).filter(([, v]) => !v).map(([k]) => k)));

  // ── 1c. First page load (app.js boot in a DOM sandbox) ──
  section('First Page Load (app.js boot sandbox)');
  const FREE_BOOT_ENDPOINTS = new Set(['/api/health', '/api/cities', '/api/maps-config', '/api/fx-rate', '/api/weather', '/api/auth/providers', '/api/auth/me']);
  const PAID_ENDPOINTS = ['/api/travel-plan', '/api/flights', '/api/stays', '/api/foods', '/api/dest-search',
    '/api/ai-travel-chat', '/api/route-cost', '/api/destinations', '/api/itinerary', '/api/place-photo'];
  const bootRoutes = (mapsConfig) => ({
    '/api/cities': { body: { cities: [{ key: 'tokyo', label: '도쿄', airport: 'NRT' }, { key: 'osaka', label: '오사카', airport: 'KIX' }, { key: 'kyoto', label: '교토', airport: 'KIX' }] } },
    '/api/auth/me': { body: { user: null } },
    '/api/auth/providers': { body: { naver: false, kakao: false, google: false } },
    '/api/maps-config': { body: mapsConfig },
    '/api/fx-rate': { body: { jpyToKrw: 9.25, usdToKrw: 1370, krwToJpy100: 10.81, yen100toKrw: 925, man1wonToYen: 1081, lastUpdate: '2026-10-01', source: 'live', provider: 'open.er-api', approximate: false, stale: false } },
    '/api/weather': { body: { city: 'tokyo', cityLabel: '도쿄', lat: 35.68, lng: 139.76, daily: { time: [futureDate(0), futureDate(1)], weathercode: [1, 61], temperature_2m_max: [22, 20], temperature_2m_min: [14, 13], precipitation_probability_max: [10, 70] } } },
    '/api/health': { body: { ok: true } },
    // 아래는 [추천+AI일정 통합 생성]을 누른 뒤에만 불려야 하는 경로(부팅 때 불리면 위 검사가 실패)
    '/api/travel-plan': { body: samplePlanResponse() },
    '/api/flights': { body: { source: 'mock', sourceInfo: { kind: 'mock', provider: 'mock', reasonCode: 'PROVIDER_UNAVAILABLE' }, flights: [], total: 0, filterOptions: { airports: [], airlines: [] } } },
    '/api/stays': { body: { source: 'mock', sourceInfo: { kind: 'mock', provider: 'mock', reasonCode: 'PROVIDER_UNAVAILABLE' }, stays: [], total: 0, filterOptions: { providers: [], amenities: [] } } },
    '/api/foods': { body: { source: 'tabelog_style_curated', sourceInfo: { kind: 'curated', provider: 'curated', reasonCode: null }, list: [{ name: '이치란 라멘', genre: '라멘', area: '신주쿠', score: 4.1, priceLevel: 'mid' }] } }
  });
  let osmBrowser = null;
  for (const variant of [{ label: 'osm', config: { provider: 'osm' } }, { label: 'google', config: { provider: 'google', key: 'BROWSER-KEY-FOR-BOOT-TEST' } }]) {
    const routes = bootRoutes(variant.config);
    const browser = createBrowser({ html: htmlCode, fetchRoutes: routes, location: BASE + '/' });
    let bootError = null;
    try { await browser.boot(appCode, 'public/app.js'); } catch (e) { bootError = e; }
    log(!bootError, `[${variant.label}] app.js boots without throwing`, bootError ? short(bootError.stack || bootError.message, 500) : '');
    const calls = browser.env.fetchCalls.filter((c) => c.sameOrigin);
    const paths = calls.map((c) => c.path);
    const paid = paths.filter((p) => PAID_ENDPOINTS.some((e) => p === e || p.startsWith(e + '/')));
    const unknown = paths.filter((p) => p.startsWith('/api/') && !FREE_BOOT_ENDPOINTS.has(p) && !paid.includes(p));
    log(paths.includes('/api/cities') && paths.includes('/api/maps-config') && paths.includes('/api/auth/me'),
      `[${variant.label}] boot code ran to completion (cities, maps-config, auth/me fetched)`, short(paths));
    log(paid.length === 0, `[${variant.label}] initial load calls no paid endpoint`, short(paid));
    log(unknown.length === 0, `[${variant.label}] initial load calls only free endpoints`, short(unknown));
    const autoClicks = browser.env.clicks.filter((id) => /btn(Plan|Flights|Food|Stays|DestSearch|AiAssist|PlanRefresh)/.test(String(id)));
    log(autoClicks.length === 0, `[${variant.label}] no button is clicked automatically on load`, short(autoClicks));
    const googleScripts = browser.env.scriptSrcs.filter((s) => /maps\.googleapis\.com|maps\.google\.com/.test(s));
    log(googleScripts.length === 0, `[${variant.label}] Google Maps JS is not loaded on first load`, short(googleScripts));
    const externalFetch = browser.env.fetchCalls.filter((c) => !c.sameOrigin).map((c) => c.url);
    log(externalFetch.length === 0, `[${variant.label}] no cross-origin fetch on first load`, short(externalFetch));
    const bootErrors = browser.env.errors.concat(browser.unhandled);
    log(bootErrors.length === 0, `[${variant.label}] no uncaught errors or console warnings during boot`, short(bootErrors, 600));
    const cityOptions = String(browser.element('city')?.innerHTML || '');
    log(cityOptions.includes('value="tokyo"') && browser.element('city')?.value === 'tokyo', `[${variant.label}] city list from /api/cities is rendered`, short(cityOptions, 120));
    let bootTitle = '';
    try { bootTitle = String(browser.run('document.title')); } catch (e) { bootTitle = 'error: ' + e.message; }
    log(bootTitle === BRAND_TITLE.ko, `[${variant.label}] document.title after boot is "${BRAND_TITLE.ko}"`, short(bootTitle));

    // [추천+AI일정 통합 생성]: 두 번 눌러도 일정 1회 + 항공·맛집·숙소 각 1회, dest-search 0회
    try {
      browser.env.fetchCalls.length = 0;
      const btn = browser.element('btnPlan');
      btn.click();
      btn.click();
      await browser.settle(20000);
      const after = browser.env.fetchCalls.filter((c) => c.sameOrigin).map((c) => c.path);
      const count = (p) => after.filter((x) => x === p).length;
      const counts = { plan: count('/api/travel-plan'), flights: count('/api/flights'), foods: count('/api/foods'), stays: count('/api/stays'), dest: count('/api/dest-search') };
      log(counts.plan === 1 && counts.flights === 1 && counts.foods === 1 && counts.stays === 1 && counts.dest === 0,
        `[${variant.label}] plan button (double-click): travel-plan x1, then flights/foods/stays once each, no dest-search`, short(counts));
      const cards = String(browser.element('destCards')?.innerHTML || '');
      log(/<img class="card-photo-img" src="https:\/\/upload\.wikimedia\.org\//.test(cards) && /class="photo-credit" href="https:\/\/commons\.wikimedia\.org\/wiki\//.test(cards),
        `[${variant.label}] recommendation cards render a real <img> + Wikimedia credit link`);
      const cityScopeLabel = String(i18nDict.ko['photo-scope-city'] || '');
      log(cityScopeLabel !== '' && cards.includes(cityScopeLabel), `[${variant.label}] a city-photo card (photoCredit.scope=city) is labeled "${cityScopeLabel}"`);
      log(String(browser.element('planResult')?.innerHTML || '').includes('센소지'), `[${variant.label}] itinerary timeline rendered`);
      const scripts = browser.env.elements.filter((e) => e.tagName === 'SCRIPT' && e.src);
      if (variant.label === 'osm') {
        const leaflet = scripts.find((e) => e.src === 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
        const css = browser.env.elements.find((e) => e.tagName === 'LINK' && e.href === 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        log(Boolean(leaflet && /^sha(256|384|512)-/.test(String(leaflet.integrity || '')) && css && /^sha(256|384|512)-/.test(String(css.integrity || ''))),
          '[osm] Leaflet 1.9.4 (js+css from unpkg, with SRI) is loaded only after a plan exists');
        log(!scripts.some((e) => /maps\.googleapis\.com/.test(e.src)), '[osm] Google Maps JS is never loaded in osm mode');
      } else {
        const gm = scripts.find((e) => /^https:\/\/maps\.googleapis\.com\/maps\/api\/js\?key=BROWSER-KEY-FOR-BOOT-TEST/.test(e.src));
        log(Boolean(gm), '[google] Google Maps JS (browser key) is loaded lazily after a plan exists');
      }

      // 빈 일정(형식은 AI라고 와도) → 친절한 안내, AI로 표시하지 않음
      routes['/api/travel-plan'] = { body: { ...samplePlanResponse(), itinerary: [{ day: 1, date: futureDate(20), blocks: [] }], itineraryInfo: { kind: 'ai', provider: 'gemini', reasonCode: null } } };
      browser.env.fetchCalls.length = 0;
      btn.click();
      await browser.settle(20000);
      const planHtml = String(browser.element('planResult')?.innerHTML || '');
      const label = String(browser.element('planSourceLabel')?.innerHTML || '') + String(browser.element('planSourceLabel')?.textContent || '');
      log(planHtml.includes('itin-empty-note') && HANGUL_RE.test(planHtml), `[${variant.label}] empty itinerary shows a friendly message`);
      log(!/AI가 만든 일정|AI 생성/.test(label) && /규칙/.test(label), `[${variant.label}] empty AI itinerary is not labeled as AI`, short(label, 160));
      const pageErrors = browser.env.errors.concat(browser.unhandled);
      log(pageErrors.length === 0, `[${variant.label}] no errors while generating a plan`, short(pageErrors, 400));
    } catch (e) {
      log(false, `[${variant.label}] plan generation in sandbox`, e.stack || e.message);
    }
    if (variant.label === 'osm') osmBrowser = browser;
  }

  // 긴급 연락처: 화면에 보이는 번호 == tel: 링크 번호 (모든 항목)
  if (osmBrowser) {
    try {
      osmBrowser.run('renderEmergency()');
      const html = String(osmBrowser.element('emergencyContent')?.innerHTML || '');
      const contacts = osmBrowser.run('JSON.stringify(EMERGENCY_CONTACTS)');
      const expectedTel = JSON.parse(contacts).flatMap((g) => (g.items || []).map((i) => i.tel)).filter(Boolean);
      const links = [...html.matchAll(/<a href="tel:([^"]*)">([^<]*)<\/a>/g)].map((m) => ({ dial: m[1], shown: m[2] }));
      const mismatched = links.filter((l) => l.shown.replace(/[^+\d]/g, '') !== l.dial || l.dial.replace(/\D/g, '').length < 3);
      log(links.length === expectedTel.length && expectedTel.length > 0, `Emergency: every contact (${expectedTel.length}) renders a tel: link`, `links=${links.length}`);
      log(mismatched.length === 0, 'Emergency: displayed number equals tel: number for every entry', short(mismatched));
      const textOnly = html.replace(/<a href="tel:[^"]*">[^<]*<\/a>/g, '').replace(/<[^>]+>/g, ' ');
      const bare = textOnly.match(/(?:\+\d{1,3}-)?\b0\d{1,4}-\d{2,4}-\d{3,4}\b/g) || [];
      log(bare.length === 0, 'Emergency: no phone number is shown without a tel: link', short(bare));
    } catch (e) {
      log(false, 'Emergency contacts render in sandbox', e.message);
    }

    // 언어를 바꾸면 문서 제목도 그 언어의 브랜드 표기로 바뀐다(마지막에 ko로 되돌림)
    try {
      const errorsBefore = osmBrowser.env.errors.length + osmBrowser.unhandled.length;
      const titles = {};
      for (const lang of ['en', 'ja', 'ko']) {
        osmBrowser.run(`applyLanguage('${lang}')`);
        await osmBrowser.settle(2000);
        titles[lang] = String(osmBrowser.run('document.title'));
      }
      log(titles.en === BRAND_TITLE.en && titles.ja === BRAND_TITLE.ja && titles.ko === BRAND_TITLE.ko,
        'Brand: document.title follows the language (ko/en/ja)', short(titles));
      const newErrors = osmBrowser.env.errors.concat(osmBrowser.unhandled).slice(errorsBefore);
      log(newErrors.length === 0, 'switching language in the sandbox raises no errors', short(newErrors, 400));
    } catch (e) {
      log(false, 'Brand: document.title follows the language (ko/en/ja)', e.message);
    }

    // 사진·출처 표시: 악성 주소와 HTML이 든 값은 허용 목록(safeImageUrl·safeCreditUrl)과 escapeHtml로 막혀야 한다.
    // 주소를 URL로 해석하지 않고 글자 모양만 보는 검사로 되돌리면 아래 우회 주소('/\', '//', userinfo 등)가 통과해 실패한다.
    try {
      const call = (fn, ...args) => String(osmBrowser.run(`${fn}(${args.map((a) => JSON.stringify(a)).join(', ')})`));
      const COMMONS_IMG = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sensoji.jpg/500px-Sensoji.jpg';
      const PROXY_IMG = '/api/place-photo?name=places/abc/photos/xyz&w=400';
      const COMMONS_PAGE = 'https://commons.wikimedia.org/wiki/File:Sensoji.jpg';
      const IMG_OK = (s) => s.startsWith('https://upload.wikimedia.org/wikipedia/commons/') || s.startsWith('/api/place-photo?');
      const CREDIT_OK = (s) => /^https:\/\/(commons\.wikimedia\.org\/wiki\/|(www|maps)\.google\.com\/maps\/contrib\/)/.test(s);
      const hostileImages = [
        'javascript:alert(1)', ' JavaScript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>',
        'https://upload.wikimedia.org.evil.example/wikipedia/commons/a.jpg',
        'https://upload.wikimedia.org@evil.example/wikipedia/commons/a.jpg',
        'https://evil.example/upload.wikimedia.org/wikipedia/commons/a.jpg',
        '/\\evil.example/api/place-photo?name=a', '//evil.example/api/place-photo?name=a', 'https://evil.example/api/place-photo?name=a',
        'http://upload.wikimedia.org/wikipedia/commons/a.jpg', 'https://upload.wikimedia.org/wikipedia/en/a.jpg',
        '/api/place-photo/../../server.js', '/app.js'
      ];
      const passedImages = hostileImages.filter((u) => call('safeImageUrl', u) !== '');
      const notTiled = hostileImages.filter((u) => { const h = call('cardPhoto', u, 'X', null); return h.includes('<img') || !h.includes('card-photo-none'); });
      log(passedImages.length === 0 && notTiled.length === 0,
        `Photo URL allowlist: ${hostileImages.length} hostile photo URLs (javascript:, data:, look-alike host, userinfo, /\\ and // tricks, http, non-Commons path) become a letter tile`,
        short({ passed: passedImages, notTiled }));
      log(call('safeImageUrl', COMMONS_IMG) === COMMONS_IMG && call('safeImageUrl', PROXY_IMG) === PROXY_IMG, 'Photo URL allowlist still accepts Commons and /api/place-photo',
        short([call('safeImageUrl', COMMONS_IMG), call('safeImageUrl', PROXY_IMG)]));
      const stayAvatarWrong = [
        ['https://img.travel.rakuten.co.jp/share/HOTEL/1/1.jpg', 'stay', true],
        ['https://rakuten.co.jp.evil.example/a.jpg', 'stay', false],
        ['https://evilrakuten.co.jp/a.jpg', 'stay', false],
        ['http://img.travel.rakuten.co.jp/a.jpg', 'stay', false],
        ['javascript:alert(1)', 'avatar', false],
        ['data:image/png;base64,AAAA', 'avatar', false]
      ].filter(([u, kind, ok]) => (call('safeImageUrl', u, kind) !== '') !== ok).map(([u, kind]) => `${kind}: ${u}`);
      log(stayAvatarWrong.length === 0, 'Stay/avatar photo allowlist: Rakuten https hosts only, javascript:/data: avatars rejected', stayAvatarWrong.join(', '));
      const hostileCredits = [
        'javascript:alert(1)', 'https://commons.wikimedia.org.evil.example/wiki/File:a.jpg', 'https://evil.example/commons.wikimedia.org/wiki/File:a.jpg',
        'http://commons.wikimedia.org/wiki/File:a.jpg', 'https://commons.wikimedia.org/w/index.php?title=File:a.jpg',
        'https://www.google.com.evil.example/maps/contrib/1', 'https://evil.example/maps/contrib/1', 'https://www.google.com/search?q=/maps/contrib/'
      ];
      const passedCredits = hostileCredits.filter((u) => call('safeCreditUrl', u) !== '');
      const rejectedGood = [COMMONS_PAGE, 'https://www.google.com/maps/contrib/123', 'https://maps.google.com/maps/contrib/123'].filter((u) => call('safeCreditUrl', u) !== u);
      log(passedCredits.length === 0 && rejectedGood.length === 0,
        `Credit link allowlist: only https commons.wikimedia.org/wiki/ and Google /maps/contrib/ become links (${hostileCredits.length} hostile rejected)`,
        short({ passed: passedCredits, rejectedGood }));
      const htmlCredit = call('photoCreditHtml', { artist: '<img src=x onerror=alert(1)>', license: '"><b>x</b>', filePage: 'javascript:alert(1)', scope: 'genre' }, COMMONS_IMG);
      const lookalikeCredit = call('photoCreditHtml', { artist: 'A', license: 'CC BY-SA 4.0', filePage: 'https://commons.wikimedia.org.evil.example/wiki/File:a.jpg' }, COMMONS_IMG);
      log(/^<span class="photo-credit"/.test(htmlCredit) && !/href=/.test(htmlCredit) && htmlCredit.includes('&lt;img src=x onerror=alert(1)&gt;') && !/<(img|b)\b/i.test(htmlCredit)
        && /^<span class="photo-credit"/.test(lookalikeCredit) && !/href=/.test(lookalikeCredit),
        'photoCreditHtml: artist/license HTML is escaped; javascript: and look-alike file pages render as plain text', short([htmlCredit, lookalikeCredit], 500));
      const hiddenCredit = call('photoCreditHtml', { artist: 'A', license: 'CC BY-SA 4.0', filePage: COMMONS_PAGE }, 'javascript:alert(1)');
      const linkedCredit = call('photoCreditHtml', { artist: 'A', license: 'CC BY-SA 4.0', filePage: COMMONS_PAGE }, COMMONS_IMG);
      log(hiddenCredit === '' && linkedCredit.startsWith(`<a class="photo-credit" href="${COMMONS_PAGE}"`),
        'photoCreditHtml: no credit when the photo itself is rejected; a Commons file page stays a link', short([hiddenCredit, linkedCredit], 300));

      // 카드 전체를 그려도 같은지: 추천(dest)·맛집(food) 카드에 악성 항목 7개를 넣는다(사진이 남는 것은 4개, 출처 링크는 2개).
      const credit = (filePage, extra = {}) => ({ artist: 'Photographer', license: 'CC BY-SA 4.0', filePage, scope: 'place', ...extra });
      const hostileCards = [
        { name: '"><svg onload=alert(1)>', category: '<img src=x onerror=alert(1)>', area: '<b>area</b>', genre: '<i>genre</i>', photoUrl: 'javascript:alert(1)', photoCredit: credit(COMMONS_PAGE), mapUrl: 'javascript:alert(1)' },
        { name: 'look-alike host', photoUrl: 'https://upload.wikimedia.org.evil.example/wikipedia/commons/a.jpg', photoCredit: credit(COMMONS_PAGE) },
        { name: 'backslash trick', photoUrl: '/\\evil.example/api/place-photo?name=a', photoCredit: credit(COMMONS_PAGE), mapUrl: 'data:text/html,<script>alert(1)</script>' },
        { name: 'quote in proxy url', photoUrl: '/api/place-photo?name=a"onerror="alert(1)', photoCredit: credit('javascript:alert(1)', { artist: '<img src=x onerror=alert(1)>', license: '"><b>', scope: 'city' }) },
        { name: 'commons ok', photoUrl: COMMONS_IMG, photoCredit: credit(COMMONS_PAGE) },
        { name: 'google bad contrib', photoUrl: PROXY_IMG, photoCredit: credit('https://evil.example/maps/contrib/1', { license: 'Google Maps' }) },
        { name: 'google contrib ok', photoUrl: PROXY_IMG, photoCredit: credit('https://www.google.com/maps/contrib/123', { license: 'Google Maps' }) }
      ];
      const HOSTILE_TAGS = new Set(['svg', 'script', 'b', 'i', 'iframe', 'object', 'embed', 'style']);
      for (const [target, mode] of [['destCards', 'dest'], ['foodCards', 'food']]) {
        osmBrowser.run(`renderCards(${JSON.stringify(target)}, ${JSON.stringify(hostileCards)}, ${JSON.stringify(mode)})`);
        const html = String(osmBrowser.element(target)?.innerHTML || '');
        // 값은 escapeHtml로 따옴표가 바뀌어 있으므로 name="..." 단위로 읽으면 속성 탈출(on* 속성)이 드러난다.
        const tags = [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b([^<>]*)>/g)];
        const handlers = tags.flatMap((m) => [...m[2].matchAll(/([^\s="'<>/]+)(?:\s*=\s*"[^"]*")?/g)].map((a) => a[1].toLowerCase())).filter((n) => n.startsWith('on'));
        const injected = tags.filter((m) => HOSTILE_TAGS.has(m[1].toLowerCase()) || (m[1].toLowerCase() === 'img' && !/^\s*class="card-photo-img"/.test(m[2]))).map((m) => m[0]);
        const srcs = [...html.matchAll(/\ssrc="([^"]*)"/g)].map((m) => m[1]);
        const creditHrefs = [...html.matchAll(/<a class="photo-credit" href="([^"]*)"/g)].map((m) => m[1]);
        const scriptHrefs = [...html.matchAll(/\shref="\s*([^"]*)"/g)].map((m) => m[1]).filter((h) => /^(javascript|data|vbscript):/i.test(h));
        log(srcs.length === 4 && srcs.every(IMG_OK), `[${mode} cards] hostile items: every <img src> is Commons or /api/place-photo (${srcs.length} of ${hostileCards.length} keep a photo)`, short(srcs));
        log(creditHrefs.length === 2 && creditHrefs.every(CREDIT_OK) && scriptHrefs.length === 0,
          `[${mode} cards] credit links go only to Commons /wiki/ or Google /maps/contrib/; no javascript:/data: href`, short({ creditHrefs, scriptHrefs }));
        log(handlers.length === 0 && injected.length === 0 && html.includes('&lt;svg onload=alert(1)&gt;'),
          `[${mode} cards] names and credits are escaped: no injected tag, no on* attribute from a quote breakout`, short({ handlers, injected }, 400));
      }
    } catch (e) {
      log(false, 'Photo/credit allowlist checks in sandbox', e.stack || e.message);
    }
  }

  // ── 1d. 직접 배치·편집 보호·의도 전달·로그인 버튼·초안 복구 (app.js 샌드박스) ──
  await sandboxSchedulingTests(htmlCode, appCode, i18nDict);
  await sandboxStorageTests(htmlCode, appCode, i18nDict);

  // ════════ Server phases ════════
  await mock.start();
  try {
    await phaseFree();
    await phaseFreeMedia();
    await phaseCityCoverage();
    await phaseTrustedProxy();
    await phaseGoogleBilling();
    await phaseGoogleLive();
    await phaseDailyCap();
    await phaseGeocodeDenied();
    await phaseOauthAndAiErrors();
    await phaseSessionsAndStorage();
    await phaseIntentRegression();
    await phaseAiItinerary();
    await phaseGeminiChain();
  } finally {
    await stopServer();
    await mock.stop();
  }
  printResults();
}

// ── 1d. 직접 배치(placeBlock)·추가 창·옮기기·끌어 놓기 공용 경로·편집 보호·의도 전달·로그인 버튼·초안 복구 ──
// tests/support/browser-sandbox.js(평평한 DOM 흉내)에서 실제 app.js 코드를 부른다. 샌드박스의 confirm()은 늘 false다.
// 한계: 샌드박스의 document.elementFromPoint()는 늘 null이라 손가락 끌기(pointermove 위치 판정)는 흉내 낼 수 없다.
// 그래서 터치·마우스가 함께 쓰는 놓기 함수 applyDropToZone(beginDrag(원본), 칸)을 직접 불러 확인하고,
// 실제 손가락 끌기는 ARCHITECTURE.md '수동 점검' 체크리스트(CDP Input.dispatchTouchEvent)로 본다.
const CLIENT_BLOCK_RE = /^(오전|오후|저녁|종일|아침|점심)\(\d{2}:\d{2}-\d{2}:\d{2}\): \S.*$/;

function schedulingPlanResponse() {
  return {
    ...samplePlanResponse(),
    recommendations: [
      { name: '센소지', city: '도쿄', area: '아사쿠사', category: '문화', aiScore: 82 },
      { name: '도쿄 타워', city: '도쿄', area: '시바', category: '전망', aiScore: 80 },
      { name: '메이지 신궁', city: '도쿄', area: '하라주쿠', category: '자연/문화', aiScore: 79 }
    ],
    recommendedFoods: [
      { name: '스시다이', city: '도쿄', area: '츠키지', genre: '스시', score: 4.2, aiFit: 88 },
      { name: '이치란 라멘', city: '도쿄', area: '신주쿠', genre: '라멘', score: 4.0, aiFit: 85 }
    ],
    itinerary: [
      { day: 1, date: futureDate(20), blocks: ['오전(09:00-11:00): 센소지 (아사쿠사)', '점심(12:00-13:00): 이치란 라멘 (신주쿠)', '저녁(18:00-20:00): 스시다이 (츠키지)'] },
      // 저녁 칸의 관광(식당 아님) → 화면 안전망이 시각을 지킨 채 오후로
      { day: 2, date: futureDate(21), blocks: ['오후(13:00-15:00): 메이지 신궁 (하라주쿠)', '저녁(19:00-21:00): 도쿄 타워 야경 (시바)'] },
      // 오전 토큰이지만 09:00-18:00 → 종일 칸에 실제 시각과 함께
      { day: 3, date: futureDate(22), blocks: ['오전(09:00-18:00): 유니버셜 스튜디오 재팬 (오사카)'] }
    ],
    itineraryInfo: { kind: 'ai', provider: 'gemini', reasonCode: null, postProcess: { mealsMoved: 0, sightsRelabeled: 0, allDayMerged: 0, mustInserted: 0, trimmed: 0, shifted: 0, repeatsReplaced: 0, unverified: 0 }, missingMustVisit: [] },
    itinerarySource: 'gemini_itinerary_v1 (mock)'
  };
}

function sandboxRoutes(extra = {}) {
  return {
    '/api/cities': { body: { cities: [{ key: 'tokyo', label: '도쿄', airport: 'NRT' }, { key: 'osaka', label: '오사카', airport: 'KIX' }, { key: 'kyoto', label: '교토', airport: 'KIX' }] } },
    '/api/auth/me': { body: { user: null } },
    '/api/auth/providers': { body: { naver: false, kakao: true, google: true } },
    '/api/maps-config': { body: { provider: 'osm' } },
    '/api/fx-rate': { body: { jpyToKrw: 9.25, usdToKrw: 1370, lastUpdate: '2026-10-01', source: 'live', provider: 'open.er-api', approximate: false, stale: false } },
    '/api/weather': { body: { city: 'tokyo', cityLabel: '도쿄', daily: { time: [futureDate(0)], weathercode: [1], temperature_2m_max: [20], temperature_2m_min: [12], precipitation_probability_max: [10] } } },
    '/api/health': { body: { ok: true } },
    '/api/travel-plan': { body: schedulingPlanResponse() },
    '/api/flights': { body: { source: 'mock', sourceInfo: { kind: 'mock', provider: 'mock', reasonCode: 'PROVIDER_UNAVAILABLE' }, flights: [], total: 0, filterOptions: { airports: [], airlines: [] } } },
    '/api/stays': { body: { source: 'mock', sourceInfo: { kind: 'mock', provider: 'mock', reasonCode: 'PROVIDER_UNAVAILABLE' }, stays: [], total: 0, filterOptions: { providers: [], amenities: [] } } },
    '/api/foods': { body: { source: 'tabelog_style_curated', sourceInfo: { kind: 'curated', provider: 'curated', reasonCode: null }, list: [] } },
    ...extra
  };
}

async function sandboxSchedulingTests(htmlCode, appCode, i18nDict) {
  section('Manual scheduling, edit protection, intent, login buttons, draft (app.js sandbox)');
  const PAID = /^\/api\/(travel-plan|ai-travel-chat|flights|stays|foods|dest-search|route-cost|destinations|itinerary)$/;
  const ko = i18nDict.ko || {};
  // ── A. 생성 → 직접 배치 ──
  const sb = createBrowser({ html: htmlCode, fetchRoutes: sandboxRoutes(), location: BASE + '/' });
  const J = (code) => { const s = sb.run(`JSON.stringify(${code})`); return s === undefined ? undefined : JSON.parse(String(s)); };
  const blocksOf = (d) => J(`((findItineraryDay(${d}) || {}).blocks || [])`) || [];
  const idxOf = (d, name) => blocksOf(d).findIndex((b) => b.includes(': ' + name));
  const count = (p) => sb.env.fetchCalls.filter((c) => c.path === p).length;
  const badBlocks = (days) => days.flatMap((d) => blocksOf(d).map((b) => [d, b]))
    .filter(([, b]) => /undefined|NaN/.test(b) || (/^(오전|오후|저녁|종일|아침|점심)\(/.test(b) && !CLIENT_BLOCK_RE.test(b)))
    .map(([d, b]) => `${d}:${b}`);
  const periodCount = (d, p) => blocksOf(d).filter((b) => b.startsWith(p + '(')).length;
  try {
    await sb.boot(appCode, 'public/app.js');
    // (7) 설정 안 된 로그인(네이버)은 hidden, 설정된 것은 보인다
    log(sb.element('loginNaver')?.hidden === true && sb.element('loginKakao')?.hidden === false && sb.element('loginGoogle')?.hidden === false,
      'login buttons: providers {naver:false} -> #loginNaver.hidden, kakao/google stay visible', short({ naver: sb.element('loginNaver')?.hidden, google: sb.element('loginGoogle')?.hidden }));

    sb.element('btnPlan').click();
    await sb.settle(20000);
    log(count('/api/travel-plan') === 1, 'sandbox: plan generated once (empty request box -> form path)', String(count('/api/travel-plan')));

    // (3) 추천 카드마다 [+ 일정에 넣기] 버튼(드래그 없이 배치하는 기본 경로)
    const destHtml = String(sb.element('destCards')?.innerHTML || '');
    const foodHtml = String(sb.element('recFoodCards')?.innerHTML || '');
    log(/class="add-to-plan-btn"[^>]*data-add-source="rec"/.test(destHtml) && /class="add-to-plan-btn"[^>]*data-add-source="recFood"/.test(foodHtml),
      '#destCards / #recFoodCards: every card has an .add-to-plan-btn (rec / recFood)');

    // (4) AI 일정의 저녁 식사·종일 칸 보존
    const planHtml = String(sb.element('planResult')?.innerHTML || '');
    log(planHtml.includes('스시다이') && blocksOf(1).includes('저녁(18:00-20:00): 스시다이 (츠키지)'),
      "AI dinner block '저녁(18:00-20:00): 스시다이 (츠키지)' is kept and shown (no meal stripping)", short(blocksOf(1)));
    log(blocksOf(3)[0] === '종일(09:00-18:00): 유니버셜 스튜디오 재팬 (오사카)' && planHtml.includes('09:00–18:00'),
      "'오전(09:00-18:00): 유니버셜…' -> 종일 slot showing its real time 09:00–18:00", short(blocksOf(3)));
    log(blocksOf(2).includes('오후(19:00-21:00): 도쿄 타워 야경 (시바)'), "a non-restaurant '저녁(19:00-21:00)' block becomes 오후 with its time kept", short(blocksOf(2)));

    // (1) placeBlock — 식사 맞바꾸기: 점심(이치란) → 저녁 칸(스시다이) 이동은 서로 자리를 바꾼다
    const swap = J(`placeBlock({ mode: 'move', day: 1, slotKey: 'dinner', from: { day: 1, blockIndex: ${idxOf(1, '이치란 라멘')} } })`);
    const d1 = blocksOf(1);
    log(swap?.ok === true && d1.includes('저녁(18:00-20:00): 이치란 라멘 (신주쿠)') && d1.includes('점심(12:00-13:30): 스시다이 (츠키지)')
      && periodCount(1, '점심') === 1 && periodCount(1, '저녁') === 1 && badBlocks([1]).length === 0,
      'placeBlock meal swap (lunch -> occupied dinner): both blocks keep the client format, no "undefined", one lunch + one dinner', short({ swap, d1 }));
    // 같은 식사 칸이 2개 생기지 않는다: 찬 저녁 칸에 새 맛집 → 바꿀지 묻고(샌드박스는 '아니오') 그대로
    const dialogsBefore = sb.env.dialogs.length;
    const occupied = J(`placeBlock({ mode: 'add', day: 1, slotKey: 'dinner', name: '모츠나베 라쿠텐치', area: '하카타', kind: 'food' })`);
    log(occupied?.ok === false && occupied?.reason === 'cancelled' && periodCount(1, '저녁') === 1 && sb.env.dialogs.slice(dialogsBefore).some(([k]) => k === 'confirm'),
      'placeBlock add into an occupied meal slot asks first; declining leaves exactly one dinner', short({ occupied, d1: blocksOf(1) }));
    const moveMeal = J(`placeBlock({ mode: 'move', day: 2, slotKey: 'dinner', from: { day: 1, blockIndex: ${idxOf(1, '이치란 라멘')} } })`);
    const swapBack = J(`placeBlock({ mode: 'move', day: 1, slotKey: 'lunch', from: { day: 2, blockIndex: ${idxOf(2, '이치란 라멘')} } })`);
    const mealCounts = [1, 2, 3].map((d) => ['아침', '점심', '저녁'].map((p) => periodCount(d, p)));
    log(moveMeal?.ok && swapBack?.ok && mealCounts.every((row) => row.every((n) => n <= 1)) && blocksOf(1).includes('점심(12:00-13:30): 이치란 라멘 (신주쿠)')
      && blocksOf(2).includes('저녁(18:00-20:00): 스시다이 (츠키지)') && badBlocks([1, 2, 3]).length === 0,
      'placeBlock meal moves across days never create two blocks of the same meal period', short({ mealCounts, d1: blocksOf(1), d2: blocksOf(2) }));
    // 오전 칸에 넣은 블록은 오후 블록보다 앞
    const morning = J(`placeBlock({ mode: 'add', day: 2, slotKey: 'morning', name: '도쿄 스카이트리', area: '오시아게', kind: 'dest' })`);
    log(morning?.ok && idxOf(2, '도쿄 스카이트리') >= 0 && idxOf(2, '도쿄 스카이트리') < idxOf(2, '메이지 신궁') && blocksOf(2)[idxOf(2, '도쿄 스카이트리')].startsWith('오전(09:00-12:00)'),
      'placeBlock into the morning slot lands before the afternoon blocks', short(blocksOf(2)));
    // 종류가 다르면(맛집 → 여행지 칸, 식사 블록 → 오후 칸) 아무것도 바뀌지 않는다
    const snapshot = JSON.stringify([blocksOf(1), blocksOf(2), blocksOf(3)]);
    const mm1 = J(`placeBlock({ mode: 'add', day: 3, slotKey: 'morning', name: '스시 잔마이', area: '츠키지', kind: 'food' })`);
    const mm2 = J(`placeBlock({ mode: 'move', day: 3, slotKey: 'afternoon', from: { day: 1, blockIndex: ${idxOf(1, '이치란 라멘')} } })`);
    log(mm1?.reason === 'kind-mismatch' && mm2?.reason === 'kind-mismatch' && JSON.stringify([blocksOf(1), blocksOf(2), blocksOf(3)]) === snapshot,
      'placeBlock with a mismatched kind (food -> sight slot, meal -> afternoon) changes nothing', short({ mm1, mm2 }));

    // (2) 추가 창: 직접 입력칸에 'A'를 쓰다 닫은 뒤 탐색 카드로 추가 → 카드 이름이 들어간다(예전 입력이 남지 않음)
    sb.run(`showAddToPlanModal('', { addType: 'food', day: 2, slot: 'lunch' })`);
    sb.element('modalCustomName').value = 'A';
    sb.element('modalCancelAdd').click();
    sb.run(`renderCards('foodCards', [{ name: '규카츠 모토무라', area: '시부야', genre: '규카츠', score: 4.1 }], 'food')`);
    const foodAddBtn = sb.run(`document.querySelector('.add-to-plan-btn[data-add-source="foodSearch"]')`);
    if (foodAddBtn) foodAddBtn.click();
    sb.element('modalDaySelect').value = '3';
    const lunchBtn = sb.run(`document.querySelector('.slot-btn[data-slot="lunch"]')`);
    if (lunchBtn) lunchBtn.click();
    const activeSlots = J(`Array.prototype.map.call(document.querySelectorAll('.slot-btn.active'), function (b) { return b.dataset.slot; })`) || [];
    const pendingSlot = J('pendingAddSlot');
    sb.element('modalConfirmAdd').click();
    const d3 = blocksOf(3);
    log(d3.includes('점심(12:00-13:30): 규카츠 모토무라 (시부야)') && !d3.some((b) => /\): A( \(|$)/.test(b)),
      "add modal: typing 'A' in the custom box, closing, then adding a search card inserts the card name (not 'A')", short(d3));
    log(activeSlots.length === 1 && activeSlots[0] === 'lunch' && pendingSlot === 'lunch' && d3.some((b) => b.startsWith('점심(')),
      'add modal: the highlighted time slot is the slot the block actually goes into', short({ activeSlots, pendingSlot }));
    // 여행지 시간 겹침(모든 배치 경로가 placeBlock → fitSightTime): 일부만 겹치면 칸 안의 빈 시간으로, 종일과 겹치면 무엇과 겹치는지 묻는다
    const fitPartial = J(`fitSightTime({ blocks: ['오후(13:00-15:00): 메이지 신궁 (하라주쿠)'] }, '13:00', '17:00', -1, true)`);
    const fitAllDay = J(`fitSightTime({ blocks: ['종일(09:00-18:00): 유니버셜 스튜디오 재팬 (오사카)'] }, '13:00', '17:00', -1, true)`);
    const fitFree = J(`fitSightTime({ blocks: ['오전(09:00-12:00): 도쿄 스카이트리 (오시아게)', '오후(19:00-21:00): 도쿄 타워 야경 (시바)'] }, '13:00', '17:00', -1, true)`);
    log(fitPartial?.shifted === true && fitPartial.start === '15:00' && fitPartial.end === '17:00' && !fitPartial.conflict
      && fitAllDay?.shifted === false && fitAllDay?.conflict?.name === '유니버셜 스튜디오 재팬'
      && fitFree?.shifted === false && !fitFree?.conflict && fitFree?.start === '13:00',
      'fitSightTime: partial overlap -> free gap 15:00-17:00, all-day overlap -> conflict (USJ), no overlap -> slot time kept', short({ fitPartial, fitAllDay, fitFree }));
    // 칸의 [+ 장소 추가] → 후보 칩으로 넣기(강조 = 실제 칸). 3일차는 종일 USJ라 먼저 겹침을 묻고(샌드박스 confirm = 아니오) 창을 열어 둔다.
    const zoneBtn = sb.run(`document.querySelector('.itin-zone-add-btn[data-day="3"][data-slot="afternoon"]')`);
    if (zoneBtn) zoneBtn.click();
    const zoneActive = J(`Array.prototype.map.call(document.querySelectorAll('.slot-btn.active'), function (b) { return b.dataset.slot; })`) || [];
    const chip = sb.run(`document.querySelector('.modal-pick-chip[data-pick-index="1"]')`);
    if (chip) chip.click();
    const d3BeforeOverlap = JSON.stringify(blocksOf(3));
    const overlapDialogsAt = sb.env.dialogs.length;
    sb.element('modalConfirmAdd').click();
    const overlapAsk = sb.env.dialogs.slice(overlapDialogsAt).filter(([k]) => k === 'confirm').map(([, m]) => m);
    const overlapExpected = String(ko['confirm-time-overlap'] || '').replace('{day}', '3일차').replace('{n}', '유니버셜 스튜디오 재팬').replace('{t}', '09:00–18:00');
    log(overlapAsk.length === 1 && overlapAsk[0] === overlapExpected && JSON.stringify(blocksOf(3)) === d3BeforeOverlap
      && sb.element('addToPlanModal') && !sb.element('addToPlanModal').classList.contains('hidden'),
      "time overlap: adding a sight into 3일차 (종일 USJ 09:00-18:00) asks with the overlapping place/time; declining changes nothing and keeps the modal open", short({ overlapAsk, d3: blocksOf(3) }));
    // 이 아래 수동 배치 검사(칸 추가·옮기기·끌어 놓기·터치)는 겹침 확인에 '예'라고 답한다.
    sb.run('var __realConfirm = confirm; confirm = function (m) { __realConfirm(m); return /겹쳐요/.test(String(m)); };');
    sb.element('modalConfirmAdd').click();
    log(Boolean(zoneBtn && chip) && zoneActive.join() === 'afternoon' && blocksOf(3).includes('오후(13:00-17:00): 도쿄 타워 (시바)'),
      "slot [+ 장소 추가] + candidate chip: highlighted 'afternoon' and the chip lands in 3일차 오후 (after accepting the overlap)", short({ zoneActive, d3: blocksOf(3) }));
    // [옮기기] 모드: 2일차 메이지 신궁 → 3일차 오전
    const moveBtn = sb.run(`document.querySelector('.itin-move-btn[data-day="2"][data-block-index="${idxOf(2, '메이지 신궁')}"]')`);
    if (moveBtn) moveBtn.click();
    const moveMode = J('pendingAddMode');
    sb.element('modalDaySelect').value = '3';
    const morningBtn = sb.run(`document.querySelector('.slot-btn[data-slot="morning"]')`);
    if (morningBtn) morningBtn.click();
    sb.element('modalConfirmAdd').click();
    log(Boolean(moveBtn) && moveMode === 'move' && idxOf(2, '메이지 신궁') < 0 && blocksOf(3).includes('오전(09:00-12:00): 메이지 신궁 (하라주쿠)'),
      '[옮기기] move mode moves the block (2일차 오후 -> 3일차 오전) and removes the original', short({ moveMode, d2: blocksOf(2), d3: blocksOf(3) }));

    // (9) 끌어 놓기 공용 경로(마우스 drop·손가락 pointerup 모두 applyDropToZone): 카드 → 칸, 일정 항목 → 다른 날 칸
    const dropCard = J(`applyDropToZone(beginDrag(document.querySelector('[data-drag-type="dest"][data-drag-index="0"]')), document.querySelector('.itin-period-zone[data-drop-day="2"][data-drop-dest-period="afternoon"]'))`);
    log(dropCard?.ok === true && blocksOf(2).includes('오후(13:00-17:00): 센소지 (아사쿠사)'), 'drop path: recommendation card -> 2일차 오후 zone (shared by mouse drop and touch drag)', short({ dropCard, d2: blocksOf(2) }));
    const dropItem = J(`applyDropToZone(beginDrag(document.querySelector('[data-itin-day="2"][data-itin-block-index="${idxOf(2, '도쿄 스카이트리')}"]')), document.querySelector('.itin-period-zone[data-drop-day="1"][data-drop-dest-period="afternoon"]'))`);
    log(dropItem?.ok === true && idxOf(2, '도쿄 스카이트리') < 0 && blocksOf(1).includes('오후(13:00-17:00): 도쿄 스카이트리 (오시아게)'), 'drop path: itinerary item -> another day (moved, original removed)', short({ dropItem, d1: blocksOf(1) }));
    const beforeMismatch = JSON.stringify([blocksOf(1), blocksOf(2), blocksOf(3)]);
    const dropBad = J(`applyDropToZone(beginDrag(document.querySelector('[data-drag-type="food"][data-drag-index="0"]')), document.querySelector('.itin-period-zone[data-drop-day="3"][data-drop-dest-period="morning"]'))`);
    log(dropBad?.ok === false && dropBad?.reason === 'kind-mismatch' && JSON.stringify([blocksOf(1), blocksOf(2), blocksOf(3)]) === beforeMismatch, 'drop path: a restaurant card on a sight zone is refused without changes', short(dropBad));
    // 손가락 끌기 처리기(pointerdown/move/up): 샌드박스는 위치 판정을 못 하므로 elementFromPoint를 대상 칸으로 잠시 바꾸고,
    // 평평한 DOM에는 부모 관계가 없어 ☰ 손잡이를 일정 항목의 자식으로 이어 붙인다. 마우스 포인터는 무시해야 한다(HTML5 drag 사용).
    const touch = J(`(function () {
      var item = document.querySelector('[data-itin-day="3"][data-itin-block-index="${idxOf(3, '메이지 신궁')}"]');
      var zone = document.querySelector('.itin-period-zone[data-drop-day="2"][data-drop-dest-period="afternoon"]');
      if (!item || !zone) return { missing: true };
      var handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.parentNode = item; handle.parentElement = item;
      var realFromPoint = document.elementFromPoint;
      document.elementFromPoint = function () { return zone; };
      var fire = function (type, x, y, pointerType) {
        var ev = new Event(type, { bubbles: true, cancelable: true, pointerType: pointerType || 'touch', pointerId: 7, clientX: x, clientY: y });
        handle.dispatchEvent(ev);
        return ev;
      };
      var ghosts = function () { return Array.prototype.filter.call(document.body.children, function (c) { return c.classList.contains('touch-drag-ghost'); }).length; };
      fire('pointerdown', 40, 400, 'mouse');
      var mouseIgnored = ghosts() === 0 && !document.body.classList.contains('touch-dragging');
      var down = fire('pointerdown', 40, 400);
      var during = { ghost: ghosts(), bodyClass: document.body.classList.contains('touch-dragging'), active: document.querySelectorAll('.drop-active').length, prevented: down.defaultPrevented };
      fire('pointermove', 60, 420);
      var hover = zone.classList.contains('drop-hover');
      fire('pointerup', 60, 420);
      document.elementFromPoint = realFromPoint;
      return { mouseIgnored: mouseIgnored, during: during, hover: hover, after: { ghost: ghosts(), bodyClass: document.body.classList.contains('touch-dragging'), active: document.querySelectorAll('.drop-active, .drop-hover').length } };
    })()`) || {};
    log(touch.mouseIgnored === true && touch.during?.ghost === 1 && touch.during?.bodyClass === true && touch.during?.active > 0 && touch.during?.prevented === true && touch.hover === true
      && touch.after?.ghost === 0 && touch.after?.bodyClass === false && touch.after?.active === 0
      && idxOf(3, '메이지 신궁') < 0 && blocksOf(2).includes('오후(13:00-17:00): 메이지 신궁 (하라주쿠)'),
      'touch drag (☰ handle, pointer events): ghost + compatible zones while dragging, drop moves the block, state cleared; mouse pointers ignored', short({ touch, d2: blocksOf(2) }, 500));
    sb.run('confirm = __realConfirm;');
    log(badBlocks([1, 2, 3]).length === 0, 'after all manual edits every block keeps the client format (no undefined/NaN)', short(badBlocks([1, 2, 3])));

    // (5) 편집 보호: 고친 일정은 [일정만 다시 만들기]·항공 선택으로 덮어쓰지 않는다
    log(J('currentItineraryData.userEdited') === true, 'manual edits mark the itinerary as userEdited');
    const plansBefore = count('/api/travel-plan');
    const dialogsAt = sb.env.dialogs.length;
    sb.element('btnPlanRefresh').click();
    await sb.settle(5000);
    log(count('/api/travel-plan') === plansBefore && sb.env.dialogs.slice(dialogsAt).some(([k, m]) => k === 'confirm' && m === ko['confirm-overwrite-edits']),
      '[일정만 다시 만들기] on an edited plan asks to overwrite (declined) and makes no travel-plan call', short(sb.env.dialogs.slice(dialogsAt)));
    sb.run(`flightResults = [{ _id: 'f-test-1', tripType: 'oneway', legs: [{ from: 'ICN', to: 'NRT', date: el('startDate').value, departureTime: '09:00', arrivalTime: '11:30' }], totalPriceKRW: 189000, totalDurationMin: 145, totalStops: 0, aiScore: 80 }]`);
    sb.run(`selectFlightById('f-test-1')`);
    await sb.settle(5000);
    const regen = sb.element('planRegenHint');
    log(count('/api/travel-plan') === plansBefore && Boolean(regen) && !regen.hidden && !regen.classList.contains('hidden'),
      'selecting a flight after manual edits does not regenerate (0 travel-plan calls) and shows #planRegenHint', short({ calls: count('/api/travel-plan') - plansBefore }));
    const draftText = sb.run(`localStorage.getItem('tabimaru.draft.v1')`);
    log(typeof draftText === 'string' && draftText.includes('규카츠 모토무라'), "edits are kept as a local draft ('tabimaru.draft.v1')");
    const used = sb.env.dialogs.filter(([k]) => k === 'alert' || k === 'prompt');
    const errs = sb.env.errors.concat(sb.unhandled);
    log(used.length === 0 && errs.length === 0, 'manual scheduling in the sandbox: no alert/prompt dialogs and no errors', short({ used, errs }, 600));

    // (8) 초안이 있는 상태로 다시 열기 → 안내 띠만, 유료 호출 0회, 지도 라이브러리 미로딩. [이어서 편집]도 호출 0회
    const sb2 = createBrowser({ html: htmlCode, fetchRoutes: sandboxRoutes(), location: BASE + '/' });
    sb2.run(`localStorage.setItem('tabimaru.draft.v1', ${JSON.stringify(String(draftText || ''))})`);
    await sb2.boot(appCode, 'public/app.js');
    const banner = sb2.element('draftRestoreBanner');
    const paid2 = sb2.env.fetchCalls.filter((c) => c.sameOrigin && PAID.test(c.path)).map((c) => c.path);
    const leaflet2 = sb2.env.scriptSrcs.filter((s) => /leaflet/i.test(s));
    log(Boolean(banner) && !banner.hidden && !banner.classList.contains('hidden') && paid2.length === 0 && leaflet2.length === 0,
      'boot with a saved draft: restore banner shown, no paid call, Leaflet not loaded', short({ banner: Boolean(banner), paid2, leaflet2 }));
    const restoreBtn = sb2.run(`document.querySelector('.notice-btn[data-notice-action="draft-restore"]')`);
    if (restoreBtn) restoreBtn.click();
    await sb2.settle(5000);
    const paid3 = sb2.env.fetchCalls.filter((c) => c.sameOrigin && /^\/api\/(travel-plan|ai-travel-chat)$/.test(c.path));
    log(Boolean(restoreBtn) && String(sb2.element('planResult')?.innerHTML || '').includes('규카츠 모토무라') && paid3.length === 0,
      '[이어서 편집] restores the same blocks without any AI call', short({ restoreBtn: Boolean(restoreBtn), paid3: paid3.length }));
    log(sb2.env.errors.concat(sb2.unhandled).length === 0, 'draft boot/restore raises no errors', short(sb2.env.errors.concat(sb2.unhandled), 400));
  } catch (e) {
    log(false, 'manual scheduling sandbox', e.stack || e.message);
  }

  // ── B. 의도 전달: 요청칸 글 + 주 버튼 → 채팅 먼저, 그 결과(꼭 갈 곳·제외·먹고 싶은 것)를 일정 요청에 싣는다 ──
  try {
    let chatCalls = 0;
    const chatRoute = () => {
      chatCalls += 1;
      return {
        body: {
          reply: '도쿄 3일 여행으로 맞췄어요.',
          parsed: {
            cityKey: 'tokyo', cityLabel: '도쿄', days: 3, theme: 'mixed', startDate: futureDate(20), routeCities: ['도쿄'], regionDayPlan: [],
            wantedPlaces: ['팀랩 플래닛'], excludedPlaces: ['디즈니'], unsupportedPlaces: [], foodKeyword: '라멘, 모츠나베', specialPrefs: { lateStart: true },
            arrivalTime: '', departureTime: '', startTimeMin: ''
          },
          selectedDestinations: [{ name: '팀랩 플래닛', city: '도쿄', area: '도요스' }],
          sourceInfo: { kind: 'ai', provider: 'gemini', reasonCode: null }
        }
      };
    };
    // 첫 일정 응답: 서버가 넣지 못한 꼭 갈 곳(missingMustVisit)을 알려 준다 → 채팅에 안내 말풍선
    let planCalls = 0;
    const planRoute = () => {
      planCalls += 1;
      const body = schedulingPlanResponse();
      if (planCalls === 1) body.itineraryInfo = { ...body.itineraryInfo, missingMustVisit: ['팀랩 플래닛'] };
      return { body };
    };
    const sc = createBrowser({ html: htmlCode, fetchRoutes: sandboxRoutes({ '/api/ai-travel-chat': chatRoute, '/api/travel-plan': planRoute }), location: BASE + '/' });
    await sc.boot(appCode, 'public/app.js');
    // 샌드박스의 insertAdjacentHTML은 아무것도 하지 않으므로, 채팅 말풍선 HTML을 따로 모은다.
    sc.run(`el('aiChatLog').insertAdjacentHTML = function (pos, html) { this._capturedHtml = (this._capturedHtml || '') + html; }`);
    const JC = (code) => { const s = sc.run(`JSON.stringify(${code})`); return s === undefined ? undefined : JSON.parse(String(s)); };
    // 의도 확인 칩(순수 함수): 꼭 갈 곳 = ok, 반영 못 한 곳 = warn, 당일치기로 대신 넣은 지역(나라)은 warn 없음
    const chipHtml = String(JC(`intentChipsHtml({ cityKey: 'tokyo', days: 3, startDate: '2026-11-20', theme: 'mixed', wantedPlaces: ['센소지', '나라 공원·도다이지'], excludedPlaces: ['도쿄 디즈니랜드'], unsupportedPlaces: ['고야산', '나라'], specialPrefs: { removeShopping: true, maxPlacesPerDay: 2 } })`) || '');
    const chipText = (key, vars) => String(JC(`fillText(t(${JSON.stringify(key)}), ${JSON.stringify(vars || {})})`) || '');
    log(chipHtml.includes(`class="intent-chip ok">${chipText('intent-must', { p: '센소지' })}<`) && chipHtml.includes(`class="intent-chip warn">${chipText('intent-unsupported', { p: '고야산' })}<`)
      && !chipHtml.includes(chipText('intent-unsupported', { p: '나라' }) + '<') && chipHtml.includes(chipText('intent-excluded', { p: '도쿄 디즈니랜드' }))
      && chipHtml.includes(chipText('intent-cond-no-shopping')) && chipHtml.includes(chipText('intent-cond-max-places', { n: 2 })),
      'intentChipsHtml: must-visit chips are .ok, unsupported places .warn (not the substituted Nara), excluded and conditions shown', short(chipHtml, 400));
    // 서버의 화면 언어 표기(parsed.labels)는 요청한 언어와 지금 언어가 같을 때만 칩에 쓴다(다르면 원래 이름)
    const LABELED = `{ wantedPlaces: ['가이유칸'], excludedPlaces: ['유니버셜 스튜디오 재팬'], foodKeyword: '스시', labels: { wantedPlaces: ['Osaka Aquarium Kaiyukan'], excludedPlaces: ['Universal Studios Japan'], unsupportedPlaces: [], foodKeyword: 'Sushi' } }`;
    const chipSame = String(JC(`intentChipsHtml(${LABELED}, currentLang)`) || '');
    const chipOther = String(JC(`intentChipsHtml(${LABELED}, currentLang === 'en' ? 'ja' : 'en')`) || '');
    log(chipSame.includes(chipText('intent-must', { p: 'Osaka Aquarium Kaiyukan' })) && chipSame.includes(chipText('intent-excluded', { p: 'Universal Studios Japan' })) && chipSame.includes(chipText('intent-food', { f: 'Sushi' }))
      && chipOther.includes(chipText('intent-must', { p: '가이유칸' })) && chipOther.includes(chipText('intent-excluded', { p: '유니버셜 스튜디오 재팬' })) && !/Kaiyukan|Universal/.test(chipOther),
      'intentChipsHtml: parsed.labels are shown for the language they were made in; other languages fall back to the original names', short({ chipSame, chipOther }, 500));
    // 하루 무료 한도(AI_DAILY_LIMIT): 1분 뒤 다시 하라는 안내 대신 한도가 다시 생기는 시각을 알린다
    const dailyNote = JC(`describeSource('itinerary', { kind: 'rule', provider: 'rule', reasonCode: 'AI_DAILY_LIMIT' }).note`) || '';
    const busyNote = JC(`describeSource('itinerary', { kind: 'rule', provider: 'rule', reasonCode: 'AI_BUSY' }).note`) || '';
    log(dailyNote.includes(String(JC(`t('ai-daily-retry')`))) && !dailyNote.includes(String(JC(`t('ai-busy-retry')`))) && dailyNote.includes(String(JC(`srcText().reason.AI_DAILY_LIMIT`)))
      && busyNote.includes(String(JC(`t('ai-busy-retry')`))),
      "describeSource: AI_DAILY_LIMIT -> daily-quota cause + 'ai-daily-retry' (AI_BUSY keeps 'ai-busy-retry')", short({ dailyNote, busyNote }, 400));
    const REQUEST = '도쿄 3일, 팀랩은 꼭, 디즈니는 빼고 라멘이랑 모츠나베 먹고 싶어';
    sc.element('aiRequest').value = REQUEST;
    sc.element('btnPlan').click();
    await sc.settle(20000);
    const seq = sc.env.fetchCalls.filter((c) => /^\/api\/(ai-travel-chat|travel-plan)$/.test(c.path));
    const bodyOf = (c) => { try { return JSON.parse(c.body || '{}'); } catch { return {}; } };
    log(seq[0]?.path === '/api/ai-travel-chat' && seq[1]?.path === '/api/travel-plan' && seq.length === 2,
      'request box filled + main button -> ai-travel-chat first, then travel-plan once', short(seq.map((c) => c.path)));
    const planBody = seq[1] ? bodyOf(seq[1]) : {};
    log(planBody.request === REQUEST && (planBody.mustVisit || []).includes('팀랩 플래닛') && JSON.stringify(planBody.excludedPlaces) === '["디즈니"]'
      && JSON.stringify(planBody.foodWishes) === '["라멘","모츠나베"]' && Array.isArray(planBody._picks) && planBody._picks[0]?.name === '팀랩 플래닛' && planBody._specialPrefs?.lateStart === true,
      'travel-plan body carries the chat intent: request / mustVisit / excludedPlaces / foodWishes / _picks / _specialPrefs', short(planBody, 500));
    const firstChat = seq[0] ? bodyOf(seq[0]) : {};
    log(firstChat.message === REQUEST && Array.isArray(firstChat.history) && firstChat.history.length === 0 && !firstChat.prevParsed && firstChat.context?.city,
      'first chat body: message + form context, empty history, no prevParsed', short(firstChat, 300));
    const chatLogHtml = String(JC(`el('aiChatLog')._capturedHtml || ''`) || '');
    const lastChips = JC(`(function () { var n = Array.prototype.filter.call(el('aiChatLog').children, function (c) { return c.classList.contains('chat-intent-chips'); }).pop(); return n ? n.innerHTML : ''; })()`) || '';
    log(chatLogHtml.includes(REQUEST) && chatLogHtml.includes('도쿄 3일 여행으로 맞췄어요.') && lastChips.includes(chipText('intent-must', { p: '팀랩 플래닛' })) && lastChips.includes(chipText('intent-excluded', { p: '디즈니' })),
      'chat log shows the request, the reply and intent chips (must-visit, excluded)', short({ lastChips }, 300));
    log(chatLogHtml.includes(chipText('must-missing', { names: '팀랩 플래닛' })), "itineraryInfo.missingMustVisit ['팀랩 플래닛'] -> a 'must-missing' notice in the chat", short(chatLogHtml.slice(-300)));
    sc.element('aiRequest').value = '교토 하루 더 늘려줘';
    sc.element('btnPlan').click();
    await sc.settle(20000);
    const chats = sc.env.fetchCalls.filter((c) => c.path === '/api/ai-travel-chat');
    const second = chats[1] ? bodyOf(chats[1]) : {};
    log(chatCalls === 2 && Array.isArray(second.history) && second.history.length >= 2 && second.history[0]?.role === 'user' && second.history[0]?.content === REQUEST
      && second.prevParsed && second.prevParsed.cityKey === 'tokyo' && (second.prevParsed.wantedPlaces || []).includes('팀랩 플래닛'),
      'second chat body sends history (user + assistant) and prevParsed for follow-up merging', short({ chatCalls, history: second.history, prev: second.prevParsed }, 500));
    // 같은 글로 다시 누르면 채팅을 또 부르지 않는다(의도는 유지)
    sc.element('btnPlan').click();
    await sc.settle(20000);
    const lastPlan = sc.env.fetchCalls.filter((c) => c.path === '/api/travel-plan').pop();
    log(chatCalls === 2 && lastPlan && bodyOf(lastPlan).request === '교토 하루 더 늘려줘', 'same request text again: no new chat call, intent kept in the travel-plan body', short({ chatCalls }));
    const errs = sc.env.errors.concat(sc.unhandled);
    log(errs.length === 0, 'intent flow in the sandbox raises no errors', short(errs, 400));
  } catch (e) {
    log(false, 'intent flow sandbox', e.stack || e.message);
  }

  // ── '🌙 저녁 이후' 칸의 항목을 보통 오후 칸으로: 같은 날이어도 오후 시각으로 옮기고, 정말 바뀔 것이 없으면 안내한다 ──
  const NIGHT_PLAN = {
    ...schedulingPlanResponse(),
    itinerary: [
      { day: 1, date: futureDate(20), blocks: ['오후(13:00-15:00): 메이지 신궁 (하라주쿠)', '저녁(18:00-19:30): 스시다이 (츠키지)', '오후(20:00-21:00): 도톤보리 (난바)'] },
      { day: 2, date: futureDate(21), blocks: ['오전(09:00-11:00): 센소지 (아사쿠사)', '저녁(18:00-19:30): 이치란 라멘 (신주쿠)', '오후(20:00-21:30): 도쿄 타워 야경 (시바)'] },
      { day: 3, date: futureDate(22), blocks: ['오전(09:00-11:00): 도쿄 스카이트리 (오시아게)'] }
    ]
  };
  const sn = createBrowser({ html: htmlCode, fetchRoutes: sandboxRoutes({ '/api/travel-plan': { body: NIGHT_PLAN } }), location: BASE + '/' });
  const JN = (code) => { const s = sn.run(`JSON.stringify(${code})`); return s === undefined ? undefined : JSON.parse(String(s)); };
  const nBlocks = (d) => JN(`((findItineraryDay(${d}) || {}).blocks || [])`) || [];
  const nIdx = (d, name) => nBlocks(d).findIndex((b) => b.includes(': ' + name));
  const nToast = () => String(sn.element('memoToast')?.textContent || '');
  try {
    await sn.boot(appCode, 'public/app.js');
    sn.element('btnPlan').click();
    await sn.settle(20000);
    const nightSeg = JN(`itinDayLayout(groupItineraryBlocks(findItineraryDay(1).blocks)).night.map(function (g) { return g.place; })`) || [];
    log(nightSeg.some((p) => /도톤보리/.test(p)), "setup: '오후(20:00-21:00): 도톤보리' after dinner is drawn in the night zone", short(nightSeg));
    const same = JN(`placeBlock({ mode: 'move', day: 1, slotKey: 'afternoon', from: { day: 1, blockIndex: ${nIdx(1, '도톤보리')} } })`);
    const moved = nBlocks(1)[nIdx(1, '도톤보리')] || '';
    const movedStart = Number((/^오후\((\d{2}):(\d{2})/.exec(moved) || [])[1]);
    log(same?.ok === true && /^오후\(\d{2}:\d{2}-\d{2}:\d{2}\): 도톤보리 \(난바\)$/.test(moved) && movedStart >= 13 && movedStart < 18 && nBlocks(1).filter((b) => b.includes('도톤보리')).length === 1,
      "night-zone item -> the same day's afternoon zone moves it into the afternoon (was a silent no-op)", short({ same, moved, d1: nBlocks(1) }));
    log(!(JN(`itinDayLayout(groupItineraryBlocks(findItineraryDay(1).blocks)).night.length`) > 0), 'after the move the night zone of day 1 is empty', short(nBlocks(1)));
    const other = JN(`placeBlock({ mode: 'move', day: 3, slotKey: 'afternoon', from: { day: 2, blockIndex: ${nIdx(2, '도쿄 타워 야경')} } })`);
    const otherBlock = nBlocks(3)[nIdx(3, '도쿄 타워 야경')] || '';
    const otherStart = Number((/^오후\((\d{2})/.exec(otherBlock) || [])[1]);
    log(other?.ok === true && otherStart >= 13 && otherStart < 18 && nIdx(2, '도쿄 타워 야경') < 0,
      "night-zone item -> another day's afternoon zone lands in the afternoon (not at its night time under an 'afternoon' toast)", short({ other, otherBlock }));
    sn.run('el("memoToast").textContent = ""');
    const noop = JN(`placeBlock({ mode: 'move', day: 2, slotKey: 'morning', from: { day: 2, blockIndex: ${nIdx(2, '센소지')} } })`);
    log(noop?.ok === false && noop?.reason === 'noop', 'moving an item onto its own slot is still a no-op', short(noop));
    sn.run(`applyDropToZone({ source: 'itin', day: 2, blockIndex: ${nIdx(2, '센소지')}, kind: 'dest' }, { dataset: { dropDay: '2', dropType: 'dest', dropDestPeriod: 'morning' } })`);
    log(nToast() === (i18nDict.ko || {})['place-noop'], "a no-op drop shows 'place-noop' (no silent nothing)", short(nToast()));
    // 일정 넣기 창의 '🌙 저녁 이후' 선택지: 밤 일정이 없는 날에도 저녁 식사 뒤로 넣고, 그 칸의 항목을 [옮기기]로 열면 미리 골라져 있다
    const nightBtn = sn.run(`document.querySelector('#destSlots .slot-btn[data-slot="night"]')`);
    sn.run(`showAddToPlanModal('도쿄 타워', { addType: 'dest', area: '시바', day: 1, slot: 'afternoon' })`);
    if (nightBtn) nightBtn.click();
    const slotPicked = JN('pendingAddSlot');
    sn.element('modalConfirmAdd').click();
    const towerBlock = nBlocks(1)[nIdx(1, '도쿄 타워')] || '';
    const towerStart = (/^오후\((\d{2}:\d{2})/.exec(towerBlock) || [])[1] || '';
    const nightNow = JN(`itinDayLayout(groupItineraryBlocks(findItineraryDay(1).blocks)).night.map(function (g) { return g.place; })`) || [];
    log(Boolean(nightBtn) && slotPicked === 'night' && towerStart >= '19:30' && nightNow.some((p) => /도쿄 타워/.test(p)) && JN(`el('addToPlanModal').classList.contains('hidden')`) === true,
      "add modal '🌙 저녁 이후' slot: a day without a night zone gets the place after dinner (19:30~) and it shows in the night zone", short({ slotPicked, towerBlock, nightNow }));
    const towerMoveBtn = sn.run(`document.querySelector('.itin-move-btn[data-day="1"][data-block-index="${nIdx(1, '도쿄 타워')}"]')`);
    if (towerMoveBtn) towerMoveBtn.click();
    log(Boolean(towerMoveBtn) && JN('pendingAddMode') === 'move' && JN('pendingAddSlot') === 'night', "[↔ 옮기기] on a night-zone item opens the modal with '저녁 이후' preselected", short({ mode: JN('pendingAddMode'), slot: JN('pendingAddSlot') }));
    sn.run('el("memoToast").textContent = ""');
    sn.element('modalConfirmAdd').click();
    log(nToast() === (i18nDict.ko || {})['place-noop'] && JN(`el('addToPlanModal').classList.contains('hidden')`) === true, "confirming the same day + '저녁 이후' closes the modal with 'place-noop'", short(nToast()));
    const nErrs = sn.env.errors.concat(sn.unhandled);
    log(nErrs.length === 0, 'night-zone move flows raise no errors', short(nErrs, 400));
  } catch (e) {
    log(false, 'night zone sandbox', e.stack || e.message);
  }
}

// ── Phase 1: 기본(무료) 모드 — 기존 59개 테스트 + 무료 모드·보안 검사 ──
async function phaseFree() {
  section('Phase 1: default free mode (no keys)');
  mock.reset();
  try {
    await startServer('free', { PUBLIC_BASE_URL: 'https://japanjapantravel.onrender.com' });
  } catch (e) {
    log(false, 'Server started', e.message);
    return;
  }
  log(true, 'Server started on port ' + PORT);

  // Basic endpoints
  let health = null;
  try {
    health = await fetchUrl('/api/health');
    log(health.status === 200, 'GET /api/health returns 200');
    log(health.json?.app === 'tabimaru' && health.json?.brand === 'Tabimaru', 'health.app is tabimaru (brand Tabimaru)', short({ app: health.json?.app, brand: health.json?.brand }));
    log(serverLogs().includes(`${BRAND_TITLE.ko} server running at http://localhost:${PORT}`), 'startup log line uses the Tabimaru name', short(serverLogs().split('\n').find((l) => /server running/.test(l)) || ''));
    log(health.json?.providers?.places === 'free' && health.json?.providers?.map === 'osm', 'health.providers = { places: free, map: osm } by default', short(health.json?.providers));
    log(health.json?.ai?.geminiConfigured === false && health.json?.ai?.openaiConfigured === false && health.json?.supabaseConfigured === false,
      'Test server runs with blank keys (.env not loaded)', short(health.json?.ai));
  } catch (e) { log(false, '/api/health', e.message); }

  // Static files load
  try {
    const html = await fetchUrl('/');
    log(html.status === 200, 'GET / returns 200');
    log(html.body.includes('<html'), 'HTML page has html tag');
    log(html.body.includes('app.js'), 'HTML references app.js');
    log(html.headers['x-content-type-options'] === 'nosniff' && Boolean(html.headers['x-frame-options']), 'Static responses carry security headers (nosniff, frame options)');
  } catch (e) { log(false, 'HTML page', e.message); }

  try {
    const js = await fetchUrl('/app.js');
    log(js.status === 200, 'GET /app.js returns 200');
    log(js.body.length > 100000, 'app.js is substantial (' + js.body.length + ' bytes)');
    log(js.body.includes('function t('), 'Served app.js has t() function');
    log(js.body.includes('var I18N'), 'Served app.js has I18N');
  } catch (e) { log(false, 'app.js served', e.message); }

  // Travel plan with lang
  section('Feature Tests (free mode)');
  const startDate = futureDate(20);
  let plan = null;
  try {
    plan = await postJson('/api/travel-plan', { city: 'tokyo', theme: 'mixed', days: 2, budget: 'mid', startDate, lang: 'ko' });
    log(plan.status === 200, 'POST /api/travel-plan returns 200');
    log(Array.isArray(plan.json?.recommendations), 'Travel plan has recommendations');
    log(plan.json?.recommendations?.length > 0, 'Travel plan has >0 recommendations', plan.json?.recommendations?.length + ' found');
    log(Array.isArray(plan.json?.itinerary), 'Travel plan has itinerary');
    log(plan.json?.itinerary?.length === 2, 'Itinerary has 2 days');
  } catch (e) { log(false, 'travel-plan', e.message); }
  try {
    // 규칙 일정의 저녁: 도쿄 실제 가게는 3곳뿐이라 4일째에 1일째 가게(스시다이)를 되풀이하던 문제 → 그 전에 '찾기' 안내를 쓴다
    const p4 = await postJson('/api/travel-plan', { city: 'tokyo', theme: 'mixed', days: 4, budget: 'mid', startDate, lang: 'ko' });
    const dinners = (p4.json?.itinerary || []).map((d) => ((d.blocks || []).find((b) => /^저녁\(/.test(b)) || '').replace(/^저녁\([^)]*\):\s*/, '').replace(/\s*\(.*$/, '')).filter(Boolean);
    log(p4.status === 200 && dinners.length === 4 && new Set(dinners).size === 4, 'rule plan (Tokyo 4 days): four different dinners (no restaurant repeated before the generic "찾기" entries are used)', short(dinners));
  } catch (e) { log(false, 'travel-plan 4 days dinners', e.message); }

  let planEn = null;
  try {
    planEn = await postJson('/api/travel-plan', { city: 'osaka', theme: 'culture', days: 2, budget: 'mid', startDate, lang: 'en' });
    log(planEn.status === 200, 'Travel plan with lang=en returns 200');
    log(planEn.json?.recommendations?.length > 0, 'Travel plan (en) has recommendations');
  } catch (e) { log(false, 'travel-plan en', e.message); }

  let dest = null;
  try {
    dest = await postJson('/api/dest-search', { city: 'tokyo', theme: 'nature', budget: 'mid', limit: 3, lang: 'ja' });
    log(dest.status === 200, 'POST /api/dest-search returns 200');
    log(dest.json?.destinations?.length > 0, 'Dest search has >0 destinations');
  } catch (e) { log(false, 'dest-search', e.message); }

  let foods = null;
  try {
    foods = await fetchUrl('/api/foods?city=tokyo&genre=ramen&budget=mid&lang=ko');
    log(foods.status === 200, 'GET /api/foods returns 200');
    log(foods.json?.list?.length > 0, 'Foods has >0 items');
  } catch (e) { log(false, 'foods', e.message); }

  try {
    const cities = await fetchUrl('/api/cities');
    log(cities.status === 200, 'GET /api/cities returns 200');
    log(cities.json?.cities?.length >= 5, 'At least 5 cities');
  } catch (e) { log(false, 'cities', e.message); }

  try {
    const fx = await fetchUrl('/api/fx-rate');
    log(fx.status === 200, 'GET /api/fx-rate returns 200');
  } catch (e) { log(false, 'fx-rate', e.message); }

  let flights = null;
  try {
    flights = await postJson('/api/flights', { city: 'tokyo', tripType: 'oneway', from: 'ICN', to: 'NRT', departDate: startDate, preference: 'balanced' });
    log(flights.status === 200, 'POST /api/flights returns 200');
    log(Array.isArray(flights.json?.flights), 'Flights has flights array');
  } catch (e) { log(false, 'flights', e.message); }

  let stays = null;
  try {
    stays = await postJson('/api/stays', { city: 'tokyo', checkIn: startDate, checkOut: futureDate(22), guests: 2, rooms: 1, preference: 'balanced' });
    log(stays.status === 200, 'POST /api/stays returns 200');
    log(Array.isArray(stays.json?.stays), 'Stays has stays array');
  } catch (e) { log(false, 'stays', e.message); }

  // 무료 모드 결과 검사 (위 응답 재사용)
  section('Free mode: curated + Wikimedia, transparent sources');
  try {
    const j = plan?.json || {};
    const ri = j.recommendationInfo || {};
    log(ri.kind === 'curated' && ri.provider === 'curated+wikimedia' && ri.reasonCode === null,
      'travel-plan recommendationInfo = { curated, curated+wikimedia, null }', short(ri));
    log(j.itineraryInfo?.kind === 'rule', 'travel-plan itineraryInfo.kind = rule (no AI requested)', short(j.itineraryInfo));
    log(j.foodsInfo?.kind === 'curated' && (j.recommendedFoods || []).length > 0, 'travel-plan foodsInfo curated with recommendedFoods', short(j.foodsInfo));
    const recs = j.recommendations || [];
    const withPhoto = recs.filter((r) => r.photoUrl);
    log(withPhoto.length > 0, `free-mode recommendations carry Wikimedia photos (${withPhoto.length}/${recs.length})`);
    const badPhoto = withPhoto.filter((r) => !String(r.photoUrl).startsWith('https://upload.wikimedia.org/wikipedia/commons/'));
    log(badPhoto.length === 0, 'free-mode photoUrl values are Wikimedia Commons URLs only', short(badPhoto.map((r) => r.photoUrl)));
    const badCredit = withPhoto.filter((r) => !r.photoCredit || !r.photoCredit.license || !String(r.photoCredit.filePage || '').startsWith('https://commons.wikimedia.org/wiki/'));
    log(badCredit.length === 0, 'free-mode photos carry photoCredit { artist, license, filePage }', short(badCredit.map((r) => r.name)));
    const images = JSON.parse(read('assets/place-images.json')).places || {};
    // 장소 자체 사진(scope place)만 대조한다. 도시·음식 장르 대체 사진은 아래 'Free mode media' 단계에서 따로 본다.
    const placeScoped = withPhoto.filter((r) => (r.photoCredit?.scope || 'place') === 'place');
    const mismatch = placeScoped.filter((r) => {
      const entry = images[`tokyo|${r.nameKo || r.name}`];
      return entry && entry.image !== r.photoUrl;
    });
    const matched = placeScoped.filter((r) => images[`tokyo|${r.nameKo || r.name}`]);
    log(matched.length > 0 && mismatch.length === 0, `photoUrl matches assets/place-images.json (${matched.length} checked)`, short(mismatch.map((r) => r.name)));
    const days = j.itinerary || [];
    const placesWithCoords = days.flatMap((d) => d.places || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    log(days.every((d) => Array.isArray(d.places)) && placesWithCoords.length > 0 && j.placeCoords && typeof j.placeCoords === 'object',
      `itinerary days carry places with lat/lng for the map (${placesWithCoords.length})`);
    log(days.every((d) => Array.isArray(d.blocks) && d.blocks.length > 0), 'every itinerary day has blocks');
    const enRecs = planEn?.json?.recommendations || [];
    log(enRecs.some((r) => r.nameKo && /^[\x20-\x7E]+$/.test(String(r.name))), 'lang=en localizes curated names (nameKo kept)', short(enRecs.slice(0, 3).map((r) => r.name)));
    log(planEn?.json?.recommendationInfo?.kind === 'curated', 'lang=en recommendationInfo curated');
    log(dest?.json?.sourceInfo?.kind === 'curated' && dest?.json?.sourceInfo?.reasonCode === null, 'dest-search sourceInfo curated', short(dest?.json?.sourceInfo));
    log(foods?.json?.sourceInfo?.kind === 'curated' && !foods?.json?.warning, 'foods sourceInfo curated and no warning in free mode', short(foods?.json?.sourceInfo));
    const fsi = flights?.json?.sourceInfo || {};
    log(fsi.kind === 'mock' && fsi.provider === 'mock' && fsi.reasonCode === 'PROVIDER_UNAVAILABLE', 'flights without token: sourceInfo mock/PROVIDER_UNAVAILABLE', short(fsi));
    log((flights?.json?.flights || []).every((f) => f.sample === true), 'mock flights are flagged sample:true');
    const ssi = stays?.json?.sourceInfo || {};
    log(ssi.kind === 'mock' && ssi.reasonCode === 'PROVIDER_UNAVAILABLE', 'stays without key: sourceInfo mock/PROVIDER_UNAVAILABLE', short(ssi));
    log((stays?.json?.stays || []).every((s) => s.sample === true && (s.rating === null || (s.rating >= 0 && s.rating <= 5))), 'mock stays flagged sample:true with 5-point ratings');
    const rawIds = [plan, planEn, dest, foods, flights, stays].filter(Boolean).map((r) => String(r.json?.note || '') + String(r.json?.warning || ''))
      .filter((s) => /fetch failed|local_curated_fallback|ECONN|ENOTFOUND/.test(s));
    log(rawIds.length === 0, 'user-facing notes contain no raw error strings or internal ids', short(rawIds));
  } catch (e) { log(false, 'free mode checks', e.message); }

  section('Free mode: maps, removed endpoints, diagnostics');
  try {
    const mc = await fetchUrl('/api/maps-config');
    log(mc.status === 200 && JSON.stringify(mc.json) === JSON.stringify({ provider: 'osm' }), 'GET /api/maps-config = { provider: osm } (no key)', short(mc.body));
    const rk = await fetchUrl('/api/rakuten-config');
    log(rk.status === 404, 'GET /api/rakuten-config is 404 (removed)', String(rk.status));
    const ph = await fetchUrl('/api/place-photo?name=' + encodeURIComponent('places/ChIJabc/photos/AUc7tXyz') + '&w=400');
    log(ph.status === 404, 'GET /api/place-photo is 404 in free mode', String(ph.status));
    const pr = await fetchUrl('/api/ai-diagnostics?probe=1');
    log(pr.status === 403, 'diagnostics probe refused without DIAGNOSTICS_TOKEN (403)', String(pr.status));
    const pr2 = await fetchUrl('/api/ai-diagnostics?probe=1', { headers: { 'x-diagnostics-token': 'guess' } });
    log(pr2.status === 403, 'diagnostics probe refused with a guessed token (403)', String(pr2.status));
    const pub = await fetchUrl('/api/ai-diagnostics');
    log(pub.status === 200 && !/keyMasked/.test(pub.body) && pub.json?.modes?.places === 'free', 'public diagnostics has modes and no masked keys', short(pub.json?.modes));
    log(pub.json?.placeImages?.withPhoto > 0, 'place-images.json loaded (' + (pub.json?.placeImages?.withPhoto || 0) + ' photos)');
  } catch (e) { log(false, 'maps/diagnostics', e.message); }

  // Security headers
  section('Security Tests');
  try {
    const apiRes = await fetchUrl('/api/health');
    log(apiRes.status === 200, 'Security headers test endpoint OK');
    log(apiRes.headers['x-content-type-options'] === 'nosniff' && apiRes.headers['x-frame-options'] === 'DENY', 'API responses carry nosniff + X-Frame-Options DENY',
      short({ nosniff: apiRes.headers['x-content-type-options'], xfo: apiRes.headers['x-frame-options'] }));
  } catch (e) { log(false, 'security', e.message); }

  // Input validation
  try {
    const bad = await postJson('/api/travel-plan', { city: 'tokyo', theme: 'invalid_theme', days: 99 });
    log(bad.status === 400, 'Invalid theme returns 400');
  } catch (e) { log(false, 'validation', e.message); }

  // Path traversal — URL 정규화 없이 원시 경로로 보낸다
  try {
    const attempts = ['/../server.js', '/..%2f..%2fserver.js', '/%2e%2e/%2e%2e/server.js', '/..%5c..%5cserver.js', '/public/../server.js'];
    const leaked = [];
    for (const raw of attempts) {
      const r = await fetchUrl('/', { rawPath: raw });
      if (r.status === 200 || r.body.includes('loadEnvFile') || r.body.includes('GOOGLE_MAPS_SERVER_KEY')) leaked.push(`${raw} -> ${r.status}`);
    }
    log(leaked.length === 0, 'Path traversal blocked', leaked.join(', '));
  } catch (e) { log(false, 'traversal', e.message); }

  // CSRF: 상태를 바꾸는 요청은 출처가 정확히 일치해야 한다
  try {
    const csrfCases = [
      ['Origin', 'http://evil.example', 403],
      ['Origin', 'https://japanjapantravel.onrender.com.evil.example', 403],
      ['Origin', 'https://attacker.onrender.com', 403],
      ['Origin', `http://localhost:${PORT}.evil.example`, 403],
      ['Origin', 'null', 403],
      ['Referer', 'https://evil.example/page.html', 403],
      ['Origin', 'https://japanjapantravel.onrender.com', 200],
      ['Origin', `http://localhost:${PORT}`, 200],
      ['Referer', `http://localhost:${PORT}/index.html`, 200]
    ];
    const wrong = [];
    for (const [header, value, expected] of csrfCases) {
      const r = await postJson('/api/destinations', { city: 'tokyo', limit: 6 }, { headers: { [header]: value } });
      if (r.status !== expected) wrong.push(`${header}: ${value} -> ${r.status} (want ${expected})`);
      if (expected === 403 && r.status === 403 && !HANGUL_RE.test(String(r.json?.error || ''))) wrong.push(`${value}: error text not localized`);
    }
    log(wrong.length === 0, `CSRF: exact-origin check (${csrfCases.length} cases incl. onrender.com look-alikes, null origin)`, wrong.join('; '));
  } catch (e) { log(false, 'csrf', e.message); }

  log(mock.googleHits() === 0, 'Free mode made zero requests to the Google mock (Places/Geocoding/Directions/photos)', String(mock.googleHits()));
  log(mock.count('gemini') === 0 && mock.count('travelpayouts') === 0, 'Free mode with blank keys made no AI/flight vendor calls');
  checkNoUnexpectedExternal('Free mode');
  checkNoFatal('Free mode');

  // 레이트리밋(마지막: 이 IP의 한도를 다 쓴다) — 프록시를 믿지 않으면 X-Forwarded-For는 무시된다
  try {
    let first429 = 0;
    for (let i = 1; i <= 90; i++) {
      const r = await fetchUrl('/api/health', { ip: `10.${i}.0.1`, record: false });
      if (r.status === 429) { first429 = i; break; }
    }
    log(first429 > 0, 'Rate limit: spoofed X-Forwarded-For is ignored without TRUST_PROXY (429 reached)', first429 ? `429 at request ${first429}` : 'never limited');
  } catch (e) { log(false, 'rate limit (socket)', e.message); }
}

// ── Phase 1b: 무료 모드 사진(장소·도시·음식 장르)과 en/ja 이름 ──
function hasCoords(item) {
  return Boolean(item) && item.lat !== null && item.lat !== undefined && item.lng !== null && item.lng !== undefined
    && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
}

// server.js의 순수 리터럴 객체(예: CURATED_PLACE_I18N)를 읽는다.
function objectLiteralFromServer(prefix) {
  const at = serverCode.indexOf(prefix);
  if (at < 0) return null;
  const src = extractBalanced(serverCode, serverCode.indexOf('{', at));
  return src ? vm.runInNewContext('(' + src + ')', {}) : null;
}

// 일정 블록 앞의 시간대 단어(오전/오후/저녁…)는 클라이언트가 읽는 형식 토큰이라 모든 언어에서 한국어로 둔다.
const PERIOD_PREFIX_RE = /^(오전|오후|저녁|종일|아침|점심)(?=\()/;

// en/ja 화면에 보이는 필드만 모은다(city·nameKo 같은 내부 키와 period 토큰은 제외).
function displayedTexts(plan) {
  const out = [];
  for (const r of plan?.recommendations || []) out.push(['rec.name', r.name], ['rec.area', r.area], ['rec.category', r.category]);
  for (const f of plan?.recommendedFoods || []) out.push(['food.name', f.name], ['food.genre', f.genre], ['food.area', f.area]);
  for (const d of plan?.itinerary || []) {
    for (const b of d.blocks || []) out.push(['block', String(b).replace(PERIOD_PREFIX_RE, '')]);
    for (const p of d.places || []) out.push(['day.place', p.name]);
  }
  return out.filter(([, v]) => typeof v === 'string' && v);
}

async function phaseFreeMedia() {
  section('Phase 1b: free mode media (place / city / food-genre photos) and en/ja labels');
  mock.reset();
  try { await startServer('free-media'); } catch (e) { log(false, 'Server (free media) started', e.message); return; }
  const startDate = futureDate(20);
  const planOf = (city, lang) => postJson('/api/travel-plan', { city, theme: 'mixed', days: 2, budget: 'mid', startDate, lang });
  let imagesFile = {};
  try { imagesFile = JSON.parse(read('assets/place-images.json')); } catch (e) { log(false, 'assets/place-images.json parses', e.message); }
  const placesImg = imagesFile.places || {};
  const citiesImg = imagesFile.cities || {};
  const genresImg = imagesFile.foodGenres || {};
  const cityImages = new Map(Object.values(citiesImg).filter((c) => c && c.image).map((c) => [c.image, c]));
  const genreImages = new Map(Object.values(genresImg).filter((g) => g && g.image).map((g) => [g.image, g]));
  const collected = []; // [label, item, cityKey] — 사진이 붙은 모든 카드(scope·출처 검사용)
  const collect = (label, items, cityKey) => { for (const it of items || []) if (it && it.photoUrl) collected.push([label, it, cityKey]); };

  try {
    const man = await fetchUrl('/manifest.webmanifest');
    log(man.status === 200 && man.json?.name === BRAND_TITLE.ko && man.json?.short_name === 'Tabimaru' && man.json?.start_url === '/',
      'served manifest.webmanifest: Tabimaru name / short_name, start_url "/"', short({ status: man.status, name: man.json?.name, short_name: man.json?.short_name }));
    const home = await fetchUrl('/');
    log(home.status === 200 && home.body.includes(`<title>${BRAND_TITLE.ko}</title>`), 'served index.html <title> is Tabimaru');
  } catch (e) { log(false, 'manifest / index.html served', e.message); }

  // (a) 도시 대표 사진: 자기 사진이 없는 카드(아마미)는 cities.amami 사진 + scope city, 도시 좌표는 붙이지 않는다
  try {
    const cityMedia = citiesImg.amami || null;
    const plan = await planOf('amami', 'ko');
    const recs = plan.json?.recommendations || [];
    collect('amami plan', recs, 'amami');
    collect('amami plan foods', plan.json?.recommendedFoods, 'amami');
    const cityScoped = recs.filter((r) => r.photoCredit?.scope === 'city');
    log(Boolean(cityMedia) && cityScoped.length > 0 && cityScoped.every((r) => r.photoUrl === cityMedia.image && r.photoCredit.filePage === cityMedia.filePage && r.photoCredit.license === cityMedia.license),
      `city photo fallback: amami cards without their own photo use cities.amami (${cityScoped.length}/${recs.length} cards)`, short(cityScoped.map((r) => r.photoUrl)));
    log(recs.length > 0 && recs.every((r) => String(r.photoUrl || '').startsWith('https://upload.wikimedia.org/wikipedia/commons/')),
      'amami: every recommendation card has a Commons photo (its own or the city photo)', short(recs.filter((r) => !r.photoUrl).map((r) => r.name)));
    log(Boolean(cityMedia) && cityScoped.every((r) => !hasCoords(r) || !(Number(r.lat) === cityMedia.lat && Number(r.lng) === cityMedia.lng)),
      'city-photo cards do not get the city photo coordinates');
    const d = await postJson('/api/destinations', { city: 'amami', limit: 6 });
    const picks = d.json?.picks || d.json?.destinations || [];
    collect('amami destinations', picks, 'amami');
    const pickCity = picks.filter((p) => p.photoCredit?.scope === 'city');
    log(Boolean(cityMedia) && pickCity.length > 0 && pickCity.every((p) => p.photoUrl === cityMedia.image), '/api/destinations uses the same city photo fallback', short(picks.map((p) => p.photoCredit?.scope)));
    // 향토요리처럼 검토된 예시 사진이 없는 장르는 다른 사진으로 채우지 않는다
    const localFoods = (plan.json?.recommendedFoods || []).filter((f) => f.genre === '향토요리');
    log(!genresImg['향토요리'] && localFoods.length > 0 && localFoods.every((f) => !f.photoUrl),
      `a genre without a reviewed example photo (향토요리) gets no substitute photo (${localFoods.length} checked)`, short(localFoods.map((f) => f.photoUrl)));
  } catch (e) { log(false, 'city photo fallback', e.message); }

  // (b) 음식 장르 예시 사진: 내장 맛집에 foodGenres[장르] 사진 + scope genre
  try {
    const ramen = genresImg['라멘'] || null;
    const f = await fetchUrl('/api/foods?city=tokyo&genre=ramen&budget=mid&lang=ko');
    const list = f.json?.list || [];
    collect('tokyo foods', list, 'tokyo');
    const genreScoped = list.filter((x) => x.photoCredit?.scope === 'genre');
    log(Boolean(ramen) && genreScoped.length > 0 && genreScoped.every((x) => x.photoUrl === ramen.image && x.photoCredit.filePage === ramen.filePage && x.photoCredit.license === ramen.license),
      `food-genre photo: /api/foods ramen shops use foodGenres['라멘'] (${genreScoped.length}/${list.length})`, short(list.map((x) => x.photoUrl)));
    const plan = await planOf('tokyo', 'ko');
    const foods = plan.json?.recommendedFoods || [];
    collect('tokyo plan', plan.json?.recommendations, 'tokyo');
    collect('tokyo plan foods', foods, 'tokyo');
    const gFoods = foods.filter((x) => x.photoCredit?.scope === 'genre');
    const sameGenre = gFoods.filter((x) => genresImg[x.genre]);
    log(gFoods.length > 0 && sameGenre.length > 0 && sameGenre.every((x) => x.photoUrl === genresImg[x.genre].image),
      `travel-plan recommendedFoods use the example photo of their own genre (${sameGenre.length}/${foods.length})`, short(gFoods.map((x) => `${x.genre}:${x.photoUrl}`)));
    const tokyoCity = (plan.json?.recommendations || []).filter((r) => r.photoCredit?.scope === 'city');
    log(tokyoCity.every((r) => citiesImg.tokyo && r.photoUrl === citiesImg.tokyo.image), `tokyo: cards without their own photo use cities.tokyo (${tokyoCity.length})`);
  } catch (e) { log(false, 'food-genre photos', e.message); }

  // (c) en/ja 이름: place-images.json labels를 쓰고(내장 표가 우선), 화면 필드에 한국어가 남지 않는다
  let curatedI18n = {};
  try { curatedI18n = objectLiteralFromServer('const CURATED_PLACE_I18N = ') || {}; } catch (e) { log(false, 'CURATED_PLACE_I18N is a plain object literal', e.message); }
  try {
    let checked = 0;
    const wrong = [];
    const leftovers = [];
    for (const [city, lang] of [['hakodate', 'en'], ['hakodate', 'ja'], ['sapporo', 'en'], ['sapporo', 'ja'], ['amami', 'en']]) {
      const r = await planOf(city, lang);
      const j = r.json || {};
      collect(`${city} ${lang}`, j.recommendations, city);
      collect(`${city} ${lang} foods`, j.recommendedFoods, city);
      for (const rec of j.recommendations || []) {
        const key = `${city}|${rec.nameKo || ''}`;
        if (!rec.nameKo || curatedI18n[key]?.[lang]) continue;
        const label = placesImg[key]?.labels?.[lang];
        if (!label) continue;
        checked++;
        if (rec.name !== label) wrong.push(`${key} (${lang}): "${rec.name}" != "${label}"`);
      }
      for (const [field, text] of displayedTexts(j)) if (HANGUL_RE.test(text)) leftovers.push(`${city}/${lang} ${field}: ${text}`);
      if (city === 'hakodate') {
        // 현지화된 이름(Mount Hakodate, 函館山 …)으로도 일정 지도 좌표를 찾아야 한다
        const recWithCoords = new Set((j.recommendations || []).filter(hasCoords).map((x) => x.name));
        const matched = (j.itinerary || []).flatMap((day) => day.places || []).filter((p) => recWithCoords.has(p.name));
        log(matched.length > 0 && matched.every(hasCoords), `lang=${lang}: itinerary places with localized names carry map coordinates (${matched.length})`,
          short(matched.filter((p) => !hasCoords(p)).map((p) => p.name)));
      }
    }
    log(checked >= 4 && wrong.length === 0, `lang=en/ja card names use place-images.json labels when present (${checked} checked)`, wrong.slice(0, 4).join('; '));
    log(leftovers.length === 0, 'lang=en/ja: card names/areas/categories, food names/genres and itinerary text have no Korean (hakodate, sapporo, amami)', leftovers.slice(0, 5).join(' | '));
  } catch (e) { log(false, 'en/ja labels', e.message); }

  // (d) 이 단계에서 본 모든 사진: scope가 place|city|genre, Commons 주소 + 파일 페이지 + 라이선스, 종류별로 맞는 사진
  const badScope = collected.filter(([, it]) => !PHOTO_SCOPES.has(it.photoCredit?.scope)).map(([l, it]) => `${l}: ${it.name} (${it.photoCredit?.scope})`);
  log(collected.length > 0 && badScope.length === 0, `every free-mode photo has photoCredit.scope place | city | genre (${collected.length} photos)`, badScope.slice(0, 5).join(', '));
  const badCommons = collected.filter(([, it]) => !String(it.photoUrl).startsWith('https://upload.wikimedia.org/wikipedia/commons/')
    || !String(it.photoCredit?.filePage || '').startsWith('https://commons.wikimedia.org/wiki/') || !it.photoCredit?.license).map(([l, it]) => `${l}: ${it.name}`);
  log(badCommons.length === 0, 'every free-mode photo is a Commons URL with filePage + license', badCommons.slice(0, 5).join(', '));
  const badKind = collected.filter(([, it, city]) => {
    const scope = it.photoCredit?.scope;
    if (scope === 'city') return !cityImages.has(it.photoUrl) || cityImages.get(it.photoUrl).filePage !== it.photoCredit.filePage;
    if (scope === 'genre') return !genreImages.has(it.photoUrl) || genreImages.get(it.photoUrl).filePage !== it.photoCredit.filePage;
    if (scope === 'place') {
      const entry = placesImg[`${city}|${it.nameKo || it.name}`];
      return Boolean(entry) && entry.image !== it.photoUrl;
    }
    return false;
  }).map(([l, it]) => `${l}: ${it.name} (${it.photoCredit?.scope})`);
  log(badKind.length === 0, 'photos match their scope: city -> cities[], genre -> foodGenres[], place -> places[] entry', badKind.slice(0, 5).join(', '));
  log(mock.googleHits() === 0, 'free media phase made zero Google calls', String(mock.googleHits()));
  checkNoUnexpectedExternal('Free media');
  checkNoFatal('Free media');
}

// ── Phase 1c: 도시 주변 실제 명소(assets/city-places.json) + 62개 도시 3일 규칙 일정 ──
// 파일 자체(형식·위키데이터 QID·좌표·도시 반경·사진 출처)를 먼저 보고, 서버로 모든 도시의 3일 규칙 일정을 만들어
// 다른 도시 장소가 없고, 명소 없는 날은 안내(자유 일정 + 팁)가 있으며, 명소가 적은 도시(few)는 그렇다고 알리는지 본다.
// 끝으로 가짜 Gemini로 AI 후보(프롬프트 picks)가 이 데이터 안의 실제 장소뿐인지 본다.
const CITY_PLACE_CATEGORIES = new Set(['문화', '수족관', '동물원', '미술관', '박물관', '온천', '정원', '시장', '산책', '전망', '자연', '관광', '테마파크', '쇼핑']);
const PLAN_SIGHT_RE = /^(오전|오후|종일|아침)\((\d{2}:\d{2})-(\d{2}:\d{2})\):\s*(.+)$/;
const FREE_TIME_NAME_RE = /^(자유 일정|Free time|自由時間)/;
function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function phaseCityCoverage() {
  section('Phase 1c: city-places.json (real sights near every city), 3-day rule plan for every city, AI candidates');
  let asset = null;
  try { asset = JSON.parse(read('assets/city-places.json')); } catch (e) { log(false, 'assets/city-places.json parses', e.message); return; }
  let images = {};
  try { images = JSON.parse(read('assets/place-images.json')).places || {}; } catch { images = {}; }
  const centers = objectLiteralFromServer('const CITY_CENTER_COORDS = ') || {};
  const cityEntries = Object.entries(asset.cities || {});
  const allPlaces = cityEntries.flatMap(([ck, c]) => (c.places || []).map((p) => [ck, p]));

  // (a) 파일 형식: 버전·생성 시각·출처, 장소마다 위키데이터 QID + 일본 안 좌표 + en/ja 이름 + 분류·시간, 사진은 공용 파일 + 라이선스 + 출처
  log(asset.version === 1 && !Number.isNaN(Date.parse(asset.generatedAt)) && asset.source?.script === 'scripts/build-city-places.js' && /Wikidata/.test(asset.source?.data || ''),
    'city-places.json: version 1, generatedAt, source (Wikidata, scripts/build-city-places.js)', short({ version: asset.version, generatedAt: asset.generatedAt, source: asset.source?.script }));
  const badShape = allPlaces.filter(([, p]) => !(typeof p.name === 'string' && p.name.trim() && /^Q\d+$/.test(p.wikidata || '')
    && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 20 && p.lat <= 46.5 && p.lng >= 122 && p.lng <= 154
    && typeof p.en === 'string' && p.en && !HANGUL_RE.test(p.en) && typeof p.ja === 'string' && p.ja && !HANGUL_RE.test(p.ja)
    && ['fix', 'kowiki', 'ko', 'translit', 'ja'].includes(p.nameFrom) && CITY_PLACE_CATEGORIES.has(p.category)
    && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(p.bestTime || '') && p.stayMin >= 30 && p.stayMin <= 480 && typeof p.area === 'string' && p.area));
  log(allPlaces.length >= 300 && badShape.length === 0, `city-places.json: every place has name, Wikidata QID, coordinates in Japan, en/ja names, category, bestTime, stayMin (${allPlaces.length} places)`,
    short(badShape.slice(0, 3).map(([ck, p]) => `${ck}|${p.name}`)));
  const badPhoto = allPlaces.filter(([, p]) => p.image !== null && !(String(p.image).startsWith('https://upload.wikimedia.org/wikipedia/commons/')
    && String(p.filePage || '').startsWith('https://commons.wikimedia.org/wiki/File:') && p.license && p.artist && !/^GFDL/i.test(p.license)));
  const withPhoto = allPlaces.filter(([, p]) => p.image);
  log(withPhoto.length > allPlaces.length / 2 && badPhoto.length === 0, `city-places.json photos: Commons file + file page + free license + credit (${withPhoto.length}/${allPlaces.length} with a photo)`,
    short(badPhoto.slice(0, 3).map(([ck, p]) => `${ck}|${p.name}`)));
  const bathPhoto = allPlaces.filter(([, p]) => p.image && (p.kind === 'onsen' || /温泉|온천|onsen|風呂|浴/i.test(`${p.name} ${p.ja} ${p.filePage}`)));
  log(bathPhoto.length === 0, 'city-places.json: no unreviewed hot-spring / bath photo (no-bathers rule)', short(bathPhoto.map(([ck, p]) => `${ck}|${p.name}`)));

  // (b) 도시마다: 서버 CITY_CENTER_COORDS와 같은 중심, 반경 안의 장소만, 도시 안 QID 중복 없음, 큐레이션 항목(place-images.json)과 겹치지 않음
  const farOff = [];
  const centerDrift = [];
  const dupQids = [];
  const curatedDup = [];
  for (const [ck, c] of cityEntries) {
    const center = centers[ck];
    if (!center || Math.abs(center.lat - c.center?.lat) > 1e-4 || Math.abs(center.lng - c.center?.lng) > 1e-4) centerDrift.push(ck);
    const curatedQids = new Set(Object.entries(images).filter(([k]) => k.startsWith(`${ck}|`)).map(([, v]) => v.wikidata).filter(Boolean));
    const seen = new Set();
    const circles = [{ lat: c.center?.lat, lng: c.center?.lng, radiusKm: c.radiusKm }, ...(c.extraCenters || [])];
    for (const p of c.places || []) {
      const d = kmBetween(c.center, p);
      const inside = circles.every((x) => x.radiusKm > 0 && x.radiusKm <= 40) && circles.some((x) => kmBetween(x, p) <= x.radiusKm + 0.05);
      if (!inside) farOff.push(`${ck}|${p.name} ${d.toFixed(1)}km > ${c.radiusKm}`);
      if (seen.has(p.wikidata)) dupQids.push(`${ck}|${p.wikidata}`);
      seen.add(p.wikidata);
      if (curatedQids.has(p.wikidata)) curatedDup.push(`${ck}|${p.name}`);
    }
  }
  log(centerDrift.length === 0, `city-places.json: each city's center is the server's CITY_CENTER_COORDS (${cityEntries.length} cities)`, centerDrift.join(', '));
  log(farOff.length === 0, 'city-places.json: no place farther from its city than the city radius (<= 40 km)', short(farOff.slice(0, 4)));
  log(dupQids.length === 0 && curatedDup.length === 0, 'city-places.json: no Wikidata item twice in a city, none duplicating a curated place (place-images.json)', short([...dupQids, ...curatedDup].slice(0, 4)));
  const thin = cityEntries.filter(([, c]) => !c.few && (c.curatedHalfDay || 0) + (c.places || []).filter((p) => !p.fullDay && !p.dayTrip).length < (asset.source?.minSights || 9)).map(([ck]) => ck);
  const fewWrong = cityEntries.filter(([, c]) => c.few && (c.curatedHalfDay || 0) + (c.places || []).filter((p) => !p.fullDay && !p.dayTrip).length >= (asset.source?.minSights || 9)).map(([ck]) => ck);
  log(thin.length === 0 && fewWrong.length === 0, `city-places.json: every city has >= ${asset.source?.minSights || 9} half-day sights (curated + nearby) or the honest "few" flag (${cityEntries.filter(([, c]) => c.few).map(([ck]) => ck).join(', ') || 'none'})`,
    short({ thin, fewWrong }));
  const mediaBad = Object.entries(asset.media || {}).filter(([k, v]) => !/^[a-z0-9_]+\|.+$/.test(k) || !/^Q\d+$/.test(v.wikidata || '') || !(v.lat >= 20 && v.lat <= 46.5 && v.lng >= 122 && v.lng <= 154)
    || !serverCode.includes(`'${k.split('|')[1]}'`));
  log(Object.keys(asset.media || {}).length >= 10 && mediaBad.length === 0, `city-places.json media: curated names (in server.js) with a Wikidata item and coordinates (${Object.keys(asset.media || {}).length})`, short(mediaBad.map(([k]) => k)));
  log(!/'섬 해안 절벽'|'이와테 산책로'|'환상적인 석양 포인트'|'스노클링 포인트'|'오키나와 스노클링'|'니가타 사케 양조장'/.test(serverCode.replace(/^\s*\/\/.*$/gm, '')),
    'server.js: descriptive non-places (섬 해안 절벽, 환상적인 석양 포인트, 오키나와 스노클링 …) are gone from the curated data');
  log(/name: '구마노 혼구 다이샤', cityKey: 'nanki_shirahama'/.test(serverCode) && !/name: '구마노고도', cityKey: 'kobe'/.test(serverCode) && !images['kobe|구마노고도'],
    'Kumano Kodō (Hongū Taisha) is a day trip from Nanki-Shirahama, not Kobe (140 km)');
  // 검토로 뺀 곳(닫은 미술관·상륙할 수 없는 바위섬·주거 섬·스키 점프대·도로 고개·센카쿠 신사)은 다시 들어오지 않는다
  const REVIEWED_OUT = ['Q6940951', 'Q862944', 'Q11482667', 'Q11589594', 'Q3912774', 'Q11288918', 'Q11476897', 'Q11577742', 'Q11607237', 'Q17230291', 'Q391408'];
  const back = allPlaces.filter(([, p]) => REVIEWED_OUT.includes(p.wikidata)).map(([ck, p]) => `${ck}|${p.name}`);
  log(back.length === 0, 'city-places.json: reviewed-out items (closed museum, no-landing rocks, residential islands, ski jump, road passes, Senkaku Shrine) are not in the data', back.join(', '));
  // 한국어 화면 이름은 모두 한글(일본어 이름은 읽기를 한글로 옮기거나 검토한 이름), 영어 화면 이름에는 한자·가나가 없다
  const jaOnly = allPlaces.filter(([, p]) => !HANGUL_RE.test(p.name)).map(([ck, p]) => `${ck}|${p.name}`);
  const enCjk = allPlaces.filter(([, p]) => /[぀-ヿ一-鿿]/.test(p.en)).map(([ck, p]) => `${ck}|${p.en}`);
  log(jaOnly.length === 0 && enCjk.length === 0, `city-places.json: every Korean name has Hangul and every English name is in Latin script (${allPlaces.length} places)`, short({ jaOnly: jaOnly.slice(0, 5), enCjk: enCjk.slice(0, 5) }));
  // 다른 도시의 유명한 곳과 같은 이름(구시로의 厳島神社, 하나마키의 清水寺)은 도시 이름을 앞에 붙여 구분한다
  const famous = allPlaces.filter(([ck, p]) => (ck !== 'hiroshima' && /^(이쓰쿠시마 신사|Itsukushima Shrine|厳島神社)$/.test(p.name + '') ) || (ck !== 'kyoto' && /^(기요미즈데라|清水寺)$/.test(p.name))).map(([ck, p]) => `${ck}|${p.name}`);
  log(famous.length === 0 && allPlaces.some(([ck, p]) => ck === 'kushiro' && p.name === '구시로 이쓰쿠시마 신사' && p.ja === '釧路厳島神社'),
    "city-places.json: a place named like a famous one elsewhere has its city in front ('구시로 이쓰쿠시마 신사' / '釧路厳島神社')", famous.join(', '));
  try {
    const J = require(path.join(PROJECT, 'scripts', 'ja-names.js'));
    const cases = [[J.koFromEnglish('Ryōzen Shrine'), '료젠 신사'], [J.koFromEnglish('Mount Shinobu'), '시노부산'], [J.koFromEnglish('Kasama Castle'), '가사마성'],
      [J.koFromEnglish('Kamabuchi Falls'), '가마부치 폭포'], [J.koFromEnglish('Seiryū-ji Temple'), '세이류지'], [J.koFromEnglish('Shimane Museum of Ancient Izumo'), '시마네 고대 이즈모 박물관'],
      [J.koFromEnglish('Akita Port Tower'), null], [J.koFromKana('霊山神社', 'りょうぜんじんじゃ'), '료젠 신사'], [J.koFromKana('千尋の滝', 'せんぴろのたき'), '센피로 폭포'],
      [J.kanaToRomaji('とうきょう'), 'tokyo'], [J.enFromKana('台温泉', 'だいおんせん'), 'Dai Onsen']];
    const wrong = cases.filter(([got, want]) => got !== want).map(([got, want]) => `${got} != ${want}`);
    log(wrong.length === 0, 'scripts/ja-names.js: Japanese names in Korean by the official rules (가마부치 폭포, 료젠 신사, 시노부산, 세이류지 …) and Hepburn English', wrong.join(', '));
    // 일본어 이름이 정하는 것: 장음(新潟 → 니가타), 인물 이름 순서(성 → 이름), 시설 낱말 번역(美術館 → 미술관), 岳 → 다케, 島 → 섬, 館 → 관
    const D = (ja, en, kana) => (J.koDisplayName({ ja, en, kana: kana ? [kana] : [] }) || {}).name || null;
    const rules = [
      // 장음은 적지 않는다: Hepburn의 ii(新潟 Niigata, 飯野 Iino)도. 두 낱말이 만나는 ii(通り池 とおり+いけ)는 그대로
      [J.koFromEnglish('Niigata Prefectural Botanical Garden'), '니가타 현립 식물원'], [D('新潟', '', 'にいがた'), '니가타'], [D('飯野山', 'Mount Iino'), '이노산'],
      [J.kanaToRomaji('にいがた'), 'niigata'], [D('通り池', 'Tōriike', 'とおりいけ'), '도리이케'], [J.koFromEnglish('Tōkyō Tower'), '도쿄 타워'], [J.koFromEnglish('Ōsaka Castle'), '오사카성'],
      // 인물 이름: 일본어 순서(성 이름) — 영어 이름 순서를 따르지 않는다
      [D('土門拳記念館', 'Ken Domon Museum of Photography'), '도몬 겐 기념관'], [D('植田正治写真美術館', 'Shoji Ueda Museum of Photography'), '우에다 쇼지 사진 미술관'],
      [D('井上靖記念館', 'Yasushi Inoue Memorial Hall'), '이노우에 야스시 기념관'], [D('三沢市寺山修司記念館', 'Shūji Terayama Museum'), '데라야마 슈지 기념관'],
      // 시설 낱말은 일본어 이름대로 옮긴다(영어 이름이 Museum이라도)
      [D('長島美術館', 'Nagashima Museum'), '나가시마 미술관'], [D('青森県立郷土館', 'Aomori Prefectural Museum'), '아오모리 현립 향토관'],
      [D('茨城県立歴史館', 'Ibaraki Prefectural Museum of History'), '이바라키 현립 역사관'], [D('棟方志功記念館', 'Munakata Shikō Memorial Museum of Art'), '무나카타 시코 기념관'],
      [D('二ツ森貝塚', 'Futatsumori Site'), '후타쓰모리 패총'], [D('佐賀徴古館', 'Saga Chōkokan'), '사가 조코관'], [D('千歳大橋', 'Chitose-o-hashi'), '지토세 대교'],
      // 岳 → 다케, ヶ岳 → 가타케(右田ヶ岳 みぎたがだけ만 검토한 예외), 山 → 산(旭山 → 아사히산), 山도 岳도 없는 이름에는 붙이지 않는다; 島 → 섬
      [D('湯湾岳', 'Mount Yuwan'), '유완다케'], [D('槍ヶ岳', 'Mount Yari'), '야리가타케'], [D('右田ヶ岳', 'Mount Migita'), '미기타가다케'], [D('アーラ岳', 'Āra Dake'), '아라다케'],
      [D('信夫山', 'Mount Shinobu'), '시노부산'], [D('旭山', 'Mount Asahi'), '아사히산'],
      [D('達子森', 'Mount Takkomori'), '닷코모리'], [D('大沼', 'Lake Ōnuma'), '오누마'], [D('女木島', 'Megijima'), '메기섬'], [D('経島', 'Fumishima'), '후미시마섬'],
      // 大社·天満宮은 따로 쓴다: 天満宮은 앱의 큐레이션 표기(다자이후 텐만구)를 따라 텐만구(규칙대로면 덴만구), 大社는 다이샤(구마노 혼구 다이샤)
      [D('屋久島大社', 'Yakushima-taisha', 'やくしまたいしゃ'), '야쿠시마 다이샤'], [D('楠川天満宮', 'Kusugawa-tenmangū'), '구스가와 텐만구'],
      [D('楠川天満宮', '', 'くすがわてんまんぐう'), '구스가와 텐만구'],
      [D('小湊フワガネク遺跡', 'Kominato-Fuwaganeku Site'), '고미나토 후와가네쿠 유적'], [D('備前国総社宮', 'Bizen-no-Kuni Sōjagū'), '비젠노쿠니 소자구'],
      // 도시 이름은 앱의 도시 표기대로(中標津 → 나카시베츠: 도시 이름 '나카시베츠')
      [D('中標津町郷土館', 'Nakashibetsu Municipal Folk Museum'), '나카시베츠 향토관']
    ];
    const ruleWrong = rules.filter(([got, want]) => got !== want).map(([got, want]) => `${got} != ${want}`);
    log(ruleWrong.length === 0, 'scripts/ja-names.js: long vowels (新潟 → 니가타), person names family first (土門拳記念館 → 도몬 겐 기념관), Japanese facility words (長島美術館 → 미술관), 岳 다케 / 島 섬 / 館 관', ruleWrong.join(', '));
  } catch (e) { log(false, 'scripts/ja-names.js loads', e.message); }
  // 한국어 이름에 옮기지 않은 일본어 일반 낱말(비주쓰칸·하쿠부쓰칸·긴넨칸 …)·가나·한자·장음 부호(ー)·니이가타가 없다
  const UNTRANSLATED_RE = /비주쓰칸|하쿠부쓰칸|기넨칸|긴넨칸|분가쿠칸|시료칸|가가쿠칸|레키시칸|교도칸|도부쓰엔|스이조쿠칸|쇼쿠부쓰엔|데이엔|진자|온센|고엔(?=\s|$)|이세키|고훈|겐리쓰|시리쓰|가이즈카|겐세이카엔|칸$/;
  const KANA_KANJI_RE = /[぀-ヿ一-鿿ー]/;
  const KANA_KANJI_KEPT = []; // 일부러 남긴 가나·한자 이름(없음)
  const untranslated = allPlaces.filter(([, p]) => UNTRANSLATED_RE.test(p.name) || (KANA_KANJI_RE.test(p.name) && !KANA_KANJI_KEPT.includes(p.wikidata)) || /니이가타|겐 도몬|쇼지 우에다|야스시 이노우에|슈지 데라야마/.test(p.name))
    .map(([ck, p]) => `${ck}|${p.name}`);
  log(untranslated.length === 0, 'city-places.json: Korean names have no transliterated generic word (비주쓰칸, 하쿠부쓰칸 …), no kana/kanji/ー, no 니이가타, no English-order person name', short(untranslated.slice(0, 6)));
  // 일본어 이름의 시설·지형 낱말이 한국어 이름에 옮겨져 있다(美術館 → 미술관, 記念館 → 기념관, 島 → 섬, 岳 → 다케 …).
  // 예외(이유): 한국어 위키백과 제목(水城 미즈키, 由布岳 유후산), 굳어진 이름(鹿児島城山 시로야마), 낱말이 다른 뜻(鉱山 = 광산, 斎場御嶽의 御嶽 = 우타키),
  // 山을 せん으로 읽는 이름(扇ノ山 おうぎのせん 오기노센 — 요나고의 大山 다이센처럼 이름째 옮긴다)
  const SUFFIX_RULES = [[/美術館$/, /미술관/], [/博物館$/, /박물관/], [/記念館$/, /기념관/], [/郷土館$/, /향토관/], [/歴史館$/, /역사관/], [/資料館$/, /자료관/],
    [/史料館$/, /사료관/], [/文学館$/, /문학관/], [/科学館$/, /과학관/], [/動物園$/, /동물원/], [/水族館$/, /수족관/], [/植物園$/, /식물원/], [/神社$/, /신사$/],
    [/神宮$/, /신궁$/], [/大社$/, /(?:다이샤|대사)$/], [/天満宮$/, /텐만구$/], [/温泉$/, /온천$/], [/貝塚$/, /패총$/], [/遺跡$/, /유적$/], [/古墳群?$/, /고분군?$/],
    [/[岳嶽]$/, /(?:다케|타케)$/], [/[^半列諸]島$/, /섬$/], [/[^寺]山$/, /산$/], [/城$/, /성$/], [/城跡$/, /성터$/], [/滝$/, /폭포$/], [/公園$/, /공원$/], [/庭園$/, /정원$/]];
  const SUFFIX_KEPT = new Set(['Q11548410', 'Q705288', 'Q3862015', 'Q109362343', 'Q3087076', 'Q11496825']);
  const suffixWrong = allPlaces.filter(([, p]) => !SUFFIX_KEPT.has(p.wikidata) && SUFFIX_RULES.some(([jr, kr]) => jr.test(p.ja) && !kr.test(p.name)))
    .map(([ck, p]) => `${ck}|${p.ja} → ${p.name}`);
  const keptStill = [...SUFFIX_KEPT].filter((q) => allPlaces.some(([, p]) => p.wikidata === q && SUFFIX_RULES.some(([jr, kr]) => jr.test(p.ja) && !kr.test(p.name))));
  log(suffixWrong.length === 0 && keptStill.length === SUFFIX_KEPT.size, `city-places.json: the Japanese generic word is translated in the Korean name (美術館 미술관, 記念館 기념관, 島 섬, 岳 다케 …; ${SUFFIX_KEPT.size} listed exceptions)`,
    short({ suffixWrong: suffixWrong.slice(0, 6), keptStill }));
  // 이름을 다듬은 장소(인물 이름 순서·장음·시설 낱말): 파일의 이름이 바로 그것이다
  // (읽기는 위키데이터에 가나가 없는 곳만 일본어 위키백과로 확인: 上塩冶 かみえんや, 扇ノ山 おうぎのせん, 阿多田島 あたたじま, 十山 とおやま)
  const RENAMED = [['shonai', 'Q3539675', '도몬 겐 기념관'], ['yonago', 'Q9047014', '우에다 쇼지 사진 미술관'], ['niigata', 'Q5576152', '니가타 현립 식물원'],
    ['kagoshima', 'Q25045409', '나가시마 미술관'], ['asahikawa', 'Q11373285', '이노우에 야스시 기념관'], ['yakushima', 'Q10950373', '미야노우라다케'], ['takamatsu', 'Q339004', '메기섬'],
    ['izumo', 'Q55523209', '가미엔야 쓰키야마 고분'], ['tottori', 'Q11496825', '오기노센'], ['iwakuni', 'Q11657359', '아타타섬'], ['yakushima', 'Q130284190', '구스가와 텐만구'],
    ['izumo', 'Q47164008', '신지호 자연관 고비우스'], ['nakashibetsu', 'Q11366289', '나카시베츠 향토관'], ['asahikawa', 'Q6919490', '아사히카와 아사히산'],
    ['yonaguni', 'Q11405009', '요나구니 도야마 신사'], ['hanamaki', 'Q11537943', '사쿠라치진관'], ['yonaguni', 'Q64589704', '투이시']];
  const renamedWrong = RENAMED.filter(([ck, q, name]) => !(asset.cities?.[ck]?.places || []).some((p) => p.wikidata === q && p.name === name)).map(([ck, q, name]) => `${ck}|${q} ${name}`);
  log(renamedWrong.length === 0, 'city-places.json: renamed places carry the new Korean names (도몬 겐 기념관, 우에다 쇼지 사진 미술관, 니가타 현립 식물원, 가미엔야 쓰키야마 고분, 오기노센 …)', short(renamedWrong));
  // 앱이 이미 쓰는 표기를 따른다: 도시 이름(나카시베츠 — 장소 이름·지역에도 '나카시베쓰'가 없다), 天満宮 텐만구(다자이후 텐만구), 宍道湖 신지호(신지호 석양)
  const offSpelling = allPlaces.filter(([, p]) => /나카시베쓰|덴만구|신지코/.test(`${p.name} ${p.area}`)).map(([ck, p]) => `${ck}|${p.name} (${p.area})`);
  log(offSpelling.length === 0, "city-places.json: names follow the app's own spellings (city label 나카시베츠, 다자이후 텐만구, 신지호): no 나카시베쓰 / 덴만구 / 신지코", short(offSpelling));
  // 예전 이름(배포본이 보여 주던 이름, 저장된 일정에 남는다)은 별칭으로 남아 말로 찾을 수 있다 — 화면에는 쓰지 않는다
  const FORMER = [['shonai', 'Q3539675', '겐 도몬 사진 박물관'], ['niigata', 'Q5576152', '니이가타 현립 식물원'], ['yonago', 'Q9047014', '쇼지 우에다 사진 박물관'],
    ['takamatsu', 'Q339004', '메기지마'], ['tottori', 'Q11496825', 'Mount Ōgi'], ['nakashibetsu', 'Q11366290', '나카시베쓰 신사'], ['yakushima', 'Q130283583', '야쿠시마 타이샤']];
  const formerWrong = FORMER.filter(([ck, q, old]) => !(asset.cities?.[ck]?.places || []).some((p) => p.wikidata === q && (p.aliases || []).includes(old) && p.name !== old)).map(([ck, q, old]) => `${ck}|${q} ${old}`);
  const tooManyAliases = allPlaces.filter(([, p]) => (p.aliases || []).length > 4).map(([ck, p]) => `${ck}|${p.name}`);
  log(formerWrong.length === 0 && tooManyAliases.length === 0, 'city-places.json: former names (겐 도몬 사진 박물관, 니이가타 현립 식물원, 메기지마 …) and the other spelling 타이샤 stay as aliases (<= 4, what the server reads)', short({ formerWrong, tooManyAliases }));

  // (c) 서버: 모든 도시의 3일 규칙 일정(Gemini 없음)
  mock.reset();
  try { await startServer('city-coverage', { TRUST_PROXY: '1' }); } catch (e) { log(false, 'Server (city coverage) started', e.message); return; }
  let seq = 0;
  const ip = () => { seq += 1; return `198.18.${100 + Math.floor(seq / 200)}.${1 + (seq % 200)}`; };
  const startDate = futureDate(20);
  const cityList = (await fetchUrl('/api/cities', { ip: ip() })).json?.cities || [];
  const missingAsset = cityList.filter((c) => !asset.cities?.[c.key]).map((c) => c.key);
  log(cityList.length >= 62 && missingAsset.length === 0, `every city of /api/cities has an entry in city-places.json (${cityList.length})`, missingAsset.join(', '));
  const otherCity = [];
  const emptyNoNote = [];
  const fewNoTip = [];
  const notFull = [];
  const failed = [];
  let sightsTotal = 0;
  for (const c of cityList) {
    const r = await postJson('/api/travel-plan', { city: c.key, theme: 'mixed', days: 3, budget: 'mid', startDate, lang: 'ko', useAi: true }, { ip: ip(), record: false });
    const j = r.json || {};
    const days = j.itinerary || [];
    if (r.status !== 200 || days.length !== 3) { failed.push(`${c.key}:${r.status}/${days.length}`); continue; }
    const recs = j.recommendations || [];
    const tips = j.tips || [];
    const freeTip = tips.some((t) => /자유 일정으로 두었어요/.test(t));
    const fewTip = tips.some((t) => /명소가 \d+곳뿐이에요/.test(t));
    if (asset.cities?.[c.key]?.few && (!fewTip || tips.some((t) => /은\(는\)/.test(t)))) fewNoTip.push(c.key);
    let free = 0;
    for (const d of days) {
      let real = 0;
      for (const b of d.blocks || []) {
        const m = PLAN_SIGHT_RE.exec(b);
        if (!m) continue;
        const name = m[4].replace(/\s*\([^()]*\)\s*$/, '').trim();
        if (FREE_TIME_NAME_RE.test(name)) { free += 1; continue; }
        real += 1;
        const rec = recs.find((x) => x.name === name || x.nameKo === name);
        if (!rec || rec.city !== j.city) otherCity.push(`${c.key} D${d.day}: ${name}${rec ? ` (${rec.city})` : ' (not a card of this city)'}`);
      }
      if (real === 0 && !((d.blocks || []).some((b) => /자유 일정/.test(b)) && (freeTip || fewTip))) emptyNoNote.push(`${c.key} D${d.day}`);
      sightsTotal += real;
    }
    if (!asset.cities?.[c.key]?.few && free > 0) notFull.push(`${c.key}(${free})`);
  }
  log(failed.length === 0, `3-day rule plan returns 3 days for every city (${cityList.length})`, failed.join(', '));
  log(otherCity.length === 0, `3-day rule plans use only places of their own city (${sightsTotal} sights in ${cityList.length} plans)`, short(otherCity.slice(0, 5)));
  log(emptyNoNote.length === 0, '3-day rule plans: a day without a sight always has a free-time block and the tip that says why', short(emptyNoNote.slice(0, 5)));
  log(fewNoTip.length === 0, "cities with few sights (city-places.json few) get the honest tip (no filler from other cities), with the right particle ('도쿠노시마는', not '은(는)')", fewNoTip.join(', '));
  // 멀리 떨어진 두 도시(도쿄 → 삿포로)는 '대중교통 1~3시간'이 아니라 비행기 이동으로 안내한다
  try {
    const far = await postJson('/api/travel-plan', { city: 'tokyo', theme: 'mixed', days: 4, budget: 'mid', startDate, lang: 'ko', useAi: false,
      _routeCities: ['도쿄', '삿포로'], _regionDayPlan: [{ cityLabel: '도쿄', days: 2, unit: 'day' }, { cityLabel: '삿포로', days: 2, unit: 'day' }] }, { ip: ip() });
    const transfer = (far.json?.itinerary || []).flatMap((d) => d.blocks || []).find((b) => /^도시 이동/.test(b)) || '';
    log(/도쿄 -> 삿포로/.test(transfer) && /비행기 이동/.test(transfer) && !/1~3시간/.test(transfer), "far route Tokyo -> Sapporo: the transfer line says plane, not 'public transport 1-3 h'", transfer);
  } catch (e) { log(false, 'far route transfer hint', e.message); }
  // 화면 흐름(폼 도시 도쿄): 도시 주변 실제 명소 이름만 말한 채팅 → 그 도시 일정, 갈 수 없는 '도시 이동' 날이 없다
  try {
    const bad = [];
    for (const [message, lang, city, place] of [['다케토미섬 2일', 'ko', 'ishigaki', '다케토미섬'], ['Hashima Island 2 days', 'en', 'nagasaki', 'Hashima'], ['산나이마루야마 유적 2일', 'ko', 'aomori', '산나이마루야마']]) {
      const chat = await postJson('/api/ai-travel-chat', { message, lang, context: { city: 'tokyo', days: 3, theme: 'mixed', budget: 'mid', startDate } }, { ip: ip() });
      const p = chat.json?.parsed || {};
      const plan = await postJson('/api/travel-plan', { city: p.cityKey, theme: 'mixed', days: p.days, budget: 'mid', startDate, lang, useAi: true, request: message, mustVisit: p.wantedPlaces || [] }, { ip: ip() });
      const blocks = (plan.json?.itinerary || []).flatMap((d) => d.blocks || []);
      if (p.cityKey !== city || blocks.some((b) => /도시 이동|Transfer:/.test(b)) || !blocks.some((b) => b.includes(place))) bad.push(`${message}: ${p.cityKey} ${short(blocks, 200)}`);
    }
    log(bad.length === 0, "chat naming only a nearby place (다케토미섬, Hashima Island, 산나이마루야마 유적) -> that place's city, the place in the plan, no transfer day", short(bad));
  } catch (e) { log(false, 'chat nearby place flow', e.message); }
  // 이름을 다듬은 장소(인물 이름 순서·장음·시설 낱말·岳·島)도 말로 찾는다: 새 한국어 이름·영어·일본어 이름 → 그 장소의 도시, 일정에 그 장소
  try {
    const bad = [];
    for (const [message, lang, city, place] of [
      ['도몬 겐 기념관 2일', 'ko', 'shonai', '도몬 겐 기념관'], ['우에다 쇼지 사진 미술관 2일', 'ko', 'yonago', '우에다 쇼지 사진 미술관'],
      ['이노우에 야스시 기념관 2일', 'ko', 'asahikawa', '이노우에 야스시 기념관'], ['미야노우라다케 2일', 'ko', 'yakushima', '미야노우라다케'],
      ['메기섬 2일', 'ko', 'takamatsu', '메기섬'], ['고시미즈 원생화원 2일', 'ko', 'memanbetsu', '고시미즈 원생화원'],
      // '홋카이도립'의 '홋카이도'(삿포로)는 장소 이름 속이라 도시로 보지 않는다
      ['홋카이도립 오비히로 미술관 2일', 'ko', 'obihiro', '홋카이도립 오비히로 미술관'],
      ['Ken Domon Museum of Photography 2 days', 'en', 'shonai', 'Ken Domon Museum of Photography'], ['Shoji Ueda Museum of Photography 2 days', 'en', 'yonago', 'Shoji Ueda Museum'],
      ['土門拳記念館 2日間', 'ja', 'shonai', '土門拳記念館'], ['植田正治写真美術館 2日間', 'ja', 'yonago', '植田正治写真美術館'],
      // 앱의 기존 표기에 맞춘 이름과 그 다른 표기(다자이후 텐만구, 신지호 석양, 이즈모 타이샤), 읽기를 고친 이름
      ['구스가와 텐만구 2일', 'ko', 'yakushima', '구스가와 텐만구'], ['신지호 자연관 고비우스 2일', 'ko', 'izumo', '신지호 자연관 고비우스'],
      ['야쿠시마 타이샤 2일', 'ko', 'yakushima', '야쿠시마 다이샤'], ['나카시베츠 향토관 2일', 'ko', 'nakashibetsu', '나카시베츠 향토관'],
      ['가미엔야 쓰키야마 고분 2일', 'ko', 'izumo', '가미엔야 쓰키야마 고분'], ['오기노센 2일', 'ko', 'tottori', '오기노센'],
      // 예전 이름(저장된 일정에 남은 이름) → 지금 이름의 장소
      ['겐 도몬 사진 박물관 2일', 'ko', 'shonai', '도몬 겐 기념관'], ['니이가타 현립 식물원 2일', 'ko', 'niigata', '니가타 현립 식물원'],
      ['아타다지마 2일', 'ko', 'iwakuni', '아타타섬'], ['다카마쓰 3일 메기지마 꼭', 'ko', 'takamatsu', '메기섬'],
      // 영어 이름 속 일본어 조사 no는 영어 부정 "no X"가 아니다
      ['Nagori no Matsubara 2 days', 'en', 'yakushima', 'Nagori no Matsubara']
    ]) {
      const chat = await postJson('/api/ai-travel-chat', { message, lang, context: { city: 'tokyo', days: 3, theme: 'mixed', budget: 'mid', startDate } }, { ip: ip() });
      const p = chat.json?.parsed || {};
      const plan = await postJson('/api/travel-plan', { city: p.cityKey, theme: 'mixed', days: p.days, budget: 'mid', startDate, lang, useAi: true, request: message, mustVisit: p.wantedPlaces || [] }, { ip: ip() });
      const blocks = (plan.json?.itinerary || []).flatMap((d) => d.blocks || []);
      if (p.cityKey !== city || !blocks.some((b) => b.includes(place)) || blocks.some((b) => /: (?:메기지마|겐 도몬 사진 박물관) \(/.test(b))) bad.push(`${message}: ${p.cityKey} ${short(blocks, 160)}`);
    }
    log(bad.length === 0, 'chat naming a renamed place (도몬 겐 기념관, 우에다 쇼지 사진 미술관, 구스가와 텐만구, 오기노센 …; en/ja names, the other spelling 타이샤, former names like 겐 도몬 사진 박물관 / 메기지마) -> its city, the place in the plan', short(bad));
  } catch (e) { log(false, 'chat renamed place lookup', e.message); }
  // 이름이 걸친 말: '아사히카와 아사히야마 동물원'·'旭川旭山動物園'은 동물원 하나(산 '아사히카와 아사히산'·'旭川旭山'이 아니다), '니이가타 2일'은 니가타,
  // 예전 이름으로 빼 달라고 하면 지금 이름의 장소가 빠진다, 꼭 갈 곳의 여러 낱말 이름은 낱말 조각('쇼지'·'박물관')으로 쪼개지 않는다
  try {
    const bad = [];
    const run = async (message, lang) => {
      const chat = await postJson('/api/ai-travel-chat', { message, lang, context: { city: 'tokyo', days: 3, theme: 'mixed', budget: 'mid', startDate } }, { ip: ip() });
      const p = chat.json?.parsed || {};
      const plan = await postJson('/api/travel-plan', { city: p.cityKey, theme: 'mixed', days: p.days, budget: 'mid', startDate, lang, useAi: true, request: message,
        mustVisit: p.wantedPlaces || [], ...((p.excludedPlaces || []).length ? { excludedPlaces: p.excludedPlaces } : {}) }, { ip: ip() });
      return { p, blocks: (plan.json?.itinerary || []).flatMap((d) => d.blocks || []) };
    };
    for (const [message, lang] of [['아사히카와 아사히야마 동물원 2일', 'ko'], ['아사히카와 2일 아사히야마 동물원 꼭', 'ko'], ['旭川旭山動物園 2日間', 'ja']]) {
      const { p } = await run(message, lang);
      if (p.cityKey !== 'asahikawa' || JSON.stringify(p.wantedPlaces) !== JSON.stringify(['아사히야마 동물원'])) bad.push(`${message}: ${p.cityKey} ${short(p.wantedPlaces)}`);
    }
    const ni = await run('니이가타 2일', 'ko');
    if (ni.p.cityKey !== 'niigata') bad.push(`니이가타 2일: ${ni.p.cityKey}`);
    const ex = await run('쇼나이 2일 겐 도몬 사진 박물관 빼고', 'ko');
    if (ex.p.cityKey !== 'shonai' || !(ex.p.excludedPlaces || []).includes('도몬 겐 기념관') || ex.blocks.some((b) => b.includes('도몬 겐 기념관'))) bad.push(`exclude by former name: ${short(ex.p.excludedPlaces)} ${short(ex.blocks, 160)}`);
    const fr = await run('요나고 2일 쇼지 우에다 사진 박물관 꼭 가고 싶어', 'ko');
    if (JSON.stringify(fr.p.wantedPlaces) !== JSON.stringify(['우에다 쇼지 사진 미술관']) || !fr.blocks.some((b) => b.includes('우에다 쇼지 사진 미술관'))) bad.push(`former name must-go: ${short(fr.p.wantedPlaces)}`);
    const un = await run('요나고 2일 가나다 라마바 사진 박물관 꼭 가고 싶어', 'ko');
    if (un.blocks.some((b) => /: (?:가나다|라마바|박물관|사진) \(/.test(b)) || (un.p.wantedPlaces || []).some((w) => ['가나다', '라마바', '박물관'].includes(w))) bad.push(`unknown multi-word must-go: ${short(un.p.wantedPlaces)} ${short(un.blocks, 160)}`);
    const multi = await run('도쿄 5일 애니·서브컬처 위주로, 아키하바라 이케부쿠로 나카노는 꼭', 'ko');
    if (!['아키하바라', '이케부쿠로', '나카노'].every((w) => (multi.p.wantedPlaces || []).includes(w))) bad.push(`separate must-go words: ${short(multi.p.wantedPlaces)}`);
    log(bad.length === 0, "chat: '아사히카와 아사히야마 동물원' / '旭川旭山動物園' = only the zoo, '니이가타' = 니가타, excluding by a former name works, a multi-word must-go name is not cut into word fragments (separate words still are separate places)", short(bad));
  } catch (e) { log(false, 'chat overlapping names / former names / must-go phrases', e.message); }
  log(notFull.length === 0, '3-day rule plan of every other city fills every sightseeing slot with a real place (no free-time slot)', notFull.join(', '));

  // (d) en/ja 화면: 새 명소 이름·지역·분류에 한국어가 남지 않는다
  try {
    const leftovers = [];
    for (const [city, lang] of [['kita_daito', 'en'], ['fukushima', 'ja'], ['yonaguni', 'en'], ['nakashibetsu', 'ja']]) {
      const r = await postJson('/api/travel-plan', { city, theme: 'mixed', days: 3, budget: 'mid', startDate, lang }, { ip: ip() });
      for (const [field, text] of displayedTexts(r.json || {})) if (HANGUL_RE.test(text)) leftovers.push(`${city}/${lang} ${field}: ${text}`);
      if (lang === 'en' && asset.cities?.[city]?.few && !(r.json?.tips || []).some((t) => /only \d+ sights/.test(t))) leftovers.push(`${city}/en: no few-sights tip`);
    }
    log(leftovers.length === 0, 'lang=en/ja plans of cities filled with nearby sights have no Korean text (names, areas, categories, tips)', short(leftovers.slice(0, 5)));
  } catch (e) { log(false, 'en/ja nearby sights', e.message); }
  log(mock.googleHits() === 0, 'city coverage phase made zero Google calls', String(mock.googleHits()));
  checkNoUnexpectedExternal('City coverage');
  checkNoFatal('City coverage');

  // (e) AI 후보: 가짜 Gemini 프롬프트의 picks가 그 도시의 데이터(큐레이션 + city-places.json) 안의 장소뿐이고, 3일이면 9곳 이상
  mock.reset({ gemini: 'ok' });
  try { await startServer('city-coverage-ai', { GEMINI_API_KEY: 'GEMKEY-city-coverage-5b1f', TRUST_PROXY: '1' }); } catch (e) { log(false, 'Server (city coverage AI) started', e.message); return; }
  try {
    const bad = [];
    for (const city of ['fukushima', 'toyama', 'hiroshima', 'kumejima']) {
      const before = mock.entries('gemini').length;
      const r = await postJson('/api/travel-plan', { city, theme: 'mixed', days: 3, budget: 'mid', startDate, lang: 'ko', useAi: true }, { ip: ip() });
      const entry = mock.entries('gemini').slice(before).filter((e) => e.isItinerary).pop();
      let ctx = null;
      try { ctx = JSON.parse(String(entry?.prompt || '').split('Context:\n')[1]); } catch { ctx = null; }
      const picks = ctx?.picks || [];
      const known = new Set([...(asset.cities?.[city]?.places || []).map((p) => p.name), ...(r.json?.recommendations || []).map((p) => p.nameKo || p.name),
        ...Object.keys(asset.media || {}).filter((k) => k.startsWith(`${city}|`)).map((k) => k.split('|')[1])]);
      const unknown = picks.filter((p) => !known.has(p.name) && !serverCode.includes(`'${p.name}'`)).map((p) => p.name);
      // 3일 = 관광 칸 6개. 요청하지 않은 하루짜리(알펜루트 등)는 후보 확장 뒤 빠지므로 8곳 이상이면 반복·빈칸 없이 채울 수 있다
      const want = asset.cities?.[city]?.few ? 1 : 8;
      if (!ctx || picks.length < want || unknown.length) bad.push(`${city}: ${picks.length} picks${unknown.length ? `, unknown ${unknown.join('/')}` : ''}`);
    }
    log(bad.length === 0, 'AI itinerary candidates (prompt picks) are real places from the city data only: >= 8 for a 3-day trip in former 2-3-sight cities', short(bad));
  } catch (e) { log(false, 'AI candidates from city data', e.message); }
  checkNoFatal('City coverage AI');
}

// ── Phase 2: 프록시 신뢰(Render와 같은 설정) — 모든 도시 날씨 + X-Forwarded-For 위조 ──
async function phaseTrustedProxy() {
  section('Phase 2: TRUST_PROXY=1 (weather for every city, XFF spoofing)');
  // 날씨 가짜 응답에 예상 밖 필드·HTML·숫자 문자열·잘못된 날짜를 섞는다(서버가 날짜와 숫자만 남기는지 본다)
  mock.reset({ weather: 'hostile' });
  try { await startServer('trusted-proxy', { TRUST_PROXY: '1' }); } catch (e) { log(false, 'Server (trusted proxy) started', e.message); return; }
  try {
    const citiesRes = await fetchUrl('/api/cities', { ip: '198.18.0.1' });
    const cities = citiesRes.json?.cities || [];
    const failures = [];
    const coords = [];
    const unsafe = [];
    const DAILY_KEYS = ['time', 'weathercode', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'];
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      const r = await fetchUrl('/api/weather?city=' + encodeURIComponent(c.key), { ip: `198.18.${1 + Math.floor(i / 200)}.${1 + (i % 200)}` });
      const j = r.json || {};
      const inJapan = Number.isFinite(j.lat) && Number.isFinite(j.lng) && j.lat >= 20 && j.lat <= 46.5 && j.lng >= 122 && j.lng <= 154.5;
      if (r.status !== 200 || !inJapan || !Array.isArray(j.daily?.time) || j.daily.time.length === 0) failures.push(`${c.key}:${r.status}`);
      else coords.push({ key: c.key, lat: j.lat, lng: j.lng });
      const daily = j.daily || {};
      const extra = Object.keys(daily).filter((k) => !DAILY_KEYS.includes(k));
      const badTime = (daily.time || []).filter((t) => typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t));
      const badValues = DAILY_KEYS.slice(1).filter((k) => !Array.isArray(daily[k]) || daily[k].length !== (daily.time || []).length
        || daily[k].some((v) => v !== null && typeof v !== 'number'));
      if (r.status === 200 && (extra.length || badTime.length || badValues.length || /<|onerror|script/i.test(r.body))) unsafe.push(`${c.key}: extra=${extra} time=${badTime.length} values=${badValues}`);
    }
    log(cities.length >= 60 && failures.length === 0, `GET /api/weather works for every city in /api/cities (${cities.length})`, failures.slice(0, 8).join(', '));
    log(coords.length > 0 && unsafe.length === 0, 'weather daily is sanitized: ISO dates + numbers/null only, unknown upstream fields and HTML dropped', unsafe.slice(0, 3).join(' | '));
    const ext = mock.entries('external');
    const badUa = ext.filter((e) => e.headers['user-agent'] !== OUTBOUND_UA).map((e) => `${e.host}: ${e.headers['user-agent']}`);
    log(ext.length > 0 && badUa.length === 0, `free public APIs are called with User-Agent "${OUTBOUND_UA}" (${ext.length} calls)`, [...new Set(badUa)].slice(0, 3).join(' | '));
    const unique = new Set(coords.map((c) => `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`));
    log(unique.size >= Math.floor(coords.length * 0.9), `weather uses per-city coordinates (${unique.size} distinct of ${coords.length})`);
    const wk = coords.find((c) => c.key === 'wakkanai');
    const ish = coords.find((c) => c.key === 'ishigaki');
    log((!wk || wk.lat > 44.5) && (!ish || ish.lat < 26), 'weather is not a Tokyo fallback (wakkanai north, ishigaki south)', short({ wk, ish }));
    const geoCalls = mock.entries('external').filter((e) => e.host === 'geocoding-api.open-meteo.com').length;
    log(geoCalls === 0, 'known cities need no geocoding call', String(geoCalls));
    const unknown = await fetchUrl('/api/weather?city=' + encodeURIComponent('zz-not-a-city'), { ip: '198.18.9.9' });
    log(unknown.status === 404 && HANGUL_RE.test(String(unknown.json?.error || '')), 'unknown city weather -> 404 with Korean message (no Tokyo substitute)', `${unknown.status} ${short(unknown.json)}`);
  } catch (e) { log(false, 'weather', e.message); }

  try {
    let first429 = 0;
    for (let i = 1; i <= 70; i++) {
      const r = await fetchUrl('/api/health', { ip: `203.0.113.${i}, 192.0.2.10`, record: false });
      if (r.status === 429) { first429 = i; break; }
    }
    log(first429 === 61, 'Rate limit: changing the first X-Forwarded-For entry cannot bypass the limit', first429 ? `429 at request ${first429}` : 'never limited');
    const other = await fetchUrl('/api/health', { ip: '192.0.2.11', record: false });
    log(other.status === 200, 'Rate limit is per client (last trusted hop), others unaffected', String(other.status));
  } catch (e) { log(false, 'rate limit (xff)', e.message); }
  checkNoUnexpectedExternal('Trusted proxy');
  checkNoFatal('Trusted proxy');
}

// ── Phase 3: google 모드, 결제 꺼짐(403 BILLING_DISABLED) → 폴백 + 차단(서킷) ──
async function phaseGoogleBilling() {
  section('Phase 3: google mode, billing disabled -> fallback + circuit');
  const SRV = 'SRVKEY-billing-test-5a7f0c';
  const BRW = 'BRWKEY-billing-test-3d1e9b';
  const DIAG = 'diag-token-test-0b9e44d1';
  mock.reset({ places: 'billing403' });
  try {
    await startServer('google-billing', {
      PLACES_PROVIDER: 'google', MAP_PROVIDER: 'google',
      GOOGLE_MAPS_SERVER_KEY: SRV, GOOGLE_MAPS_BROWSER_KEY: BRW, DIAGNOSTICS_TOKEN: DIAG
    });
  } catch (e) { log(false, 'Server (google billing) started', e.message); return; }
  const startDate = futureDate(20);
  try {
    const health = await fetchUrl('/api/health');
    log(health.json?.providers?.places === 'google' && health.json?.providers?.map === 'google', 'health.providers reflect google mode', short(health.json?.providers));
    const mc = await fetchUrl('/api/maps-config');
    log(mc.json?.provider === 'google' && mc.json?.key === BRW && !mc.body.includes(SRV), 'maps-config returns only the browser key, never the server key', short(mc.json));

    const p1 = await postJson('/api/travel-plan', { city: 'tokyo', theme: 'mixed', days: 2, budget: 'mid', startDate, lang: 'ko' });
    const ri = p1.json?.recommendationInfo || {};
    log(p1.status === 200 && ri.kind === 'fallback' && ri.reasonCode === 'GOOGLE_BILLING_DISABLED', 'billing 403 -> recommendationInfo fallback / GOOGLE_BILLING_DISABLED', short(ri));
    const recs = p1.json?.recommendations || [];
    log(recs.length > 0 && recs.some((r) => String(r.photoUrl || '').startsWith('https://upload.wikimedia.org/')), 'fallback still serves curated places with Wikimedia photos');
    const hitsAfterFirst = mock.googleHits();
    log(hitsAfterFirst >= 1, `first request reached the Google mock (${hitsAfterFirst} call(s))`);

    const d = await postJson('/api/dest-search', { city: 'osaka', theme: 'mixed', lang: 'ko' });
    const f = await fetchUrl('/api/foods?city=kyoto&budget=mid&lang=ko');
    const p2 = await postJson('/api/travel-plan', { city: 'kyoto', theme: 'culture', days: 2, budget: 'mid', startDate, lang: 'ko' });
    const rc = await postJson('/api/route-cost', { city: 'tokyo', places: ['센소지', '메이지 신궁'] });
    log(d.json?.sourceInfo?.reasonCode === 'GOOGLE_CIRCUIT_OPEN', 'circuit open: dest-search sourceInfo GOOGLE_CIRCUIT_OPEN', short(d.json?.sourceInfo));
    log(f.json?.sourceInfo?.kind === 'fallback' && f.json?.sourceInfo?.reasonCode === 'GOOGLE_CIRCUIT_OPEN', 'circuit open: foods sourceInfo fallback/GOOGLE_CIRCUIT_OPEN', short(f.json?.sourceInfo));
    const warning = String(f.json?.warning || '');
    log(HANGUL_RE.test(warning) && !/http|billing|PERMISSION|403|fetch failed/i.test(warning), 'foods warning is short Korean text without raw vendor error', warning);
    log(p2.json?.recommendationInfo?.reasonCode === 'GOOGLE_CIRCUIT_OPEN', 'circuit open: travel-plan recommendationInfo GOOGLE_CIRCUIT_OPEN', short(p2.json?.recommendationInfo));
    log(rc.status === 200 && Array.isArray(rc.json?.segments), 'route-cost still answers (distance estimate)');
    log(mock.googleHits() === hitsAfterFirst, 'circuit open: no further Google calls for later requests', `${hitsAfterFirst} -> ${mock.googleHits()}`);

    // /api/place-photo 검증
    const badNames = ['../../etc/passwd', 'places/abc', 'places/abc/photos/', 'places/ab cd/photos/x', 'places/abc/photos/x/../y', 'https://evil.example/x.jpg', 'places/abc/photos/x?key=1'];
    const wrong = [];
    for (const n of badNames) {
      const r = await fetchUrl('/api/place-photo?name=' + encodeURIComponent(n));
      if (r.status !== 400) wrong.push(`${n} -> ${r.status}`);
    }
    log(wrong.length === 0, '/api/place-photo rejects malformed names with 400', wrong.join(', '));
    const notIssued = await fetchUrl('/api/place-photo?name=' + encodeURIComponent('places/NotIssued123/photos/Photo456') + '&w=400');
    log(notIssued.status === 404, '/api/place-photo returns 404 for names the server never issued', String(notIssued.status));
    log(mock.googleHits() === hitsAfterFirst, '/api/place-photo validation makes no Google call');

    const diag = await fetchUrl('/api/ai-diagnostics');
    const g = diag.json?.google || {};
    log(g.circuitOpen === true && g.circuitReason === 'GOOGLE_BILLING_DISABLED', 'diagnostics shows circuit open with the original reason', short(g));
    const noTok = await fetchUrl('/api/ai-diagnostics?probe=1');
    const badTok = await fetchUrl('/api/ai-diagnostics?probe=1', { headers: { 'x-diagnostics-token': DIAG + 'x' } });
    log(noTok.status === 403 && badTok.status === 403, 'diagnostics probe refused without / with wrong token', `${noTok.status}/${badTok.status}`);
    const okTok = await fetchUrl('/api/ai-diagnostics?probe=1', { headers: { 'x-diagnostics-token': DIAG } });
    log(okTok.status === 200 && okTok.json?.probe?.places?.reasonCode === 'GOOGLE_BILLING_DISABLED', 'diagnostics probe with token reports GOOGLE_BILLING_DISABLED', short(okTok.json?.probe?.places));
    await fetchUrl('/');
    await fetchUrl('/app.js');
  } catch (e) { log(false, 'google billing phase', e.message); }
  checkNoSecrets('Google billing', [SRV, DIAG]);
  checkNoUnexpectedExternal('Google billing');
  checkNoFatal('Google billing');
}

// ── Phase 4: google 모드 정상 + 사진 프록시 + Gemini(잘림/정상/빈 일정) + Travelpayouts ──
async function phaseGoogleLive() {
  section('Phase 4: google mode live, photo proxy, Gemini, Travelpayouts');
  const SRV = 'SRVKEY-live-test-81b2aa';
  const GEM = 'GEMKEY-live-test-6c0f13';
  const TPT = 'TPTOKEN-live-test-9d4e27';
  mock.reset({ places: 'ok', gemini: 'max_tokens', travelpayouts: 'ok' });
  try {
    await startServer('google-live', {
      PLACES_PROVIDER: 'google', GOOGLE_MAPS_SERVER_KEY: SRV, GEMINI_API_KEY: GEM, TRAVELPAYOUTS_TOKEN: TPT
    });
  } catch (e) { log(false, 'Server (google live) started', e.message); return; }
  const startDate = futureDate(20);
  const planBody = (city, extra = {}) => ({ city, theme: 'mixed', days: 2, budget: 'mid', startDate, lang: 'ko', useAi: true, ...extra });
  try {
    const p = await postJson('/api/travel-plan', planBody('tokyo'));
    const j = p.json || {};
    log(p.status === 200 && j.recommendationInfo?.kind === 'live' && j.recommendationInfo?.provider === 'google_places', 'google mode: recommendationInfo live / google_places', short(j.recommendationInfo));
    const recPhotos = (j.recommendations || []).map((r) => r.photoUrl).filter(Boolean);
    const foodPhotos = (j.recommendedFoods || []).map((r) => r.photoUrl).filter(Boolean);
    log(recPhotos.length > 0 && recPhotos.concat(foodPhotos).every((u) => u.startsWith('/api/place-photo?name=')), `google-mode photo URLs start with /api/place-photo (${recPhotos.length + foodPhotos.length})`, short(recPhotos.concat(foodPhotos).find((u) => !u.startsWith('/api/place-photo'))));
    log((j.recommendations || []).filter((r) => r.photoUrl).every((r) => r.photoCredit && r.photoCredit.license === 'Google Maps'), 'google photos carry photoCredit (Google Maps)');
    const googlePhotoItems = (j.recommendations || []).concat(j.recommendedFoods || []).filter((r) => String(r.photoUrl || '').startsWith('/api/place-photo'));
    log(googlePhotoItems.length > 0 && googlePhotoItems.every((r) => r.photoCredit?.scope === 'place'), `google photos are photos of that place (photoCredit.scope = place, ${googlePhotoItems.length})`,
      short(googlePhotoItems.map((r) => r.photoCredit?.scope)));
    log(j.foodsInfo?.kind === 'live', 'google mode: foodsInfo live', short(j.foodsInfo));
    const ii = j.itineraryInfo || {};
    log(ii.kind === 'rule' && ii.reasonCode === 'AI_TRUNCATED', 'Gemini MAX_TOKENS -> itineraryInfo { kind: rule, reasonCode: AI_TRUNCATED }', short(ii));
    log((j.itinerary || []).length === 2 && j.itinerary.every((d) => d.blocks.length > 0), 'truncated AI output replaced by a full rule-based itinerary');

    const gem = mock.entries('gemini').filter((e) => e.isItinerary);
    const g0 = gem[0] || {};
    const gc = g0.body?.generationConfig || {};
    log(gem.length >= 1 && g0.headers?.['x-goog-api-key'] === GEM && !String(g0.query || '').includes(GEM), 'Gemini key is sent in the x-goog-api-key header, not the URL');
    log(gc.responseMimeType === 'application/json' && Boolean(gc.responseSchema) && Number(gc.maxOutputTokens) >= 4096, 'Gemini itinerary request: JSON mime + responseSchema + maxOutputTokens >= 4096', short(gc, 200));
    const places = mock.entries('places');
    log(places.length > 0 && places.every((e) => e.headers['x-goog-api-key'] === SRV && e.headers['x-goog-fieldmask']), 'Places calls use the server key header + field mask');

    // 사진 프록시
    const photoPath = recPhotos[0];
    if (photoPath) {
      const ph = await fetchUrl(photoPath);
      log(ph.status === 200 && ph.headers['content-type'] === 'image/jpeg' && Buffer.compare(ph.buf, JPEG_BYTES) === 0, 'photo proxy streams the image (image/jpeg)', `${ph.status} ${ph.headers['content-type']}`);
      log(/public/.test(ph.headers['cache-control'] || '') && /max-age=86400/.test(ph.headers['cache-control'] || ''), 'photo proxy sets Cache-Control public, max-age=86400', ph.headers['cache-control']);
      const media = mock.entries('placesMedia')[0] || {};
      log(/skipHttpRedirect=true/.test(media.query || '') && media.headers?.['x-goog-api-key'] === SRV, 'photo proxy asks Places media with skipHttpRedirect and server key header');
      const bigW = await fetchUrl(photoPath.replace(/w=\d+/, 'w=99999'));
      log(bigW.status === 200 && /maxWidthPx=1600/.test((mock.entries('placesMedia').pop() || {}).query || ''), 'photo proxy clamps width to 1600');
    } else {
      log(false, 'photo proxy test needs a photoUrl');
    }

    // 캐시: 같은 요청은 Places를 다시 부르지 않는다
    const before = mock.count('places');
    await postJson('/api/travel-plan', planBody('tokyo'));
    log(mock.count('places') === before, 'identical travel-plan is served from the Places cache (no new calls)', `${before} -> ${mock.count('places')}`);

    mock.scenario = { gemini: 'ok' };
    const ok = await postJson('/api/travel-plan', planBody('osaka'));
    const oi = ok.json?.itineraryInfo || {};
    const blockRe = /^(오전|오후|저녁|종일|아침|점심)\(\d{2}:\d{2}-\d{2}:\d{2}\): .+/;
    log(oi.kind === 'ai' && oi.provider === 'gemini', 'valid Gemini JSON -> itineraryInfo { kind: ai, provider: gemini }', short(oi));
    log((ok.json?.itinerary || []).length === 2 && ok.json.itinerary.every((d) => d.blocks.some((b) => blockRe.test(b))), 'AI itinerary blocks use the client format "오전(09:00-11:00): 장소"', short(ok.json?.itinerary?.[0]?.blocks));

    mock.scenario = { gemini: 'empty_days' };
    const empty = await postJson('/api/travel-plan', planBody('kyoto'));
    const ei = empty.json?.itineraryInfo || {};
    log(ei.kind === 'rule' && ei.reasonCode === 'AI_INVALID_OUTPUT', 'AI days with no blocks are never labeled AI (AI_INVALID_OUTPUT)', short(ei));
    log((empty.json?.itinerary || []).every((d) => d.blocks.length > 0), 'empty AI days replaced by rule-based blocks');

    // Travelpayouts (가짜 서버)
    const fl = await postJson('/api/flights', { city: 'tokyo', tripType: 'oneway', from: 'ICN', to: 'NRT', departDate: startDate, preference: 'balanced' });
    const fsi = fl.json?.sourceInfo || {};
    log(fl.status === 200 && fsi.kind === 'live' && fsi.provider === 'travelpayouts' && (fl.json?.flights || []).length > 0, 'flights with token: sourceInfo live / travelpayouts', short(fsi));
    const tp = mock.entries('travelpayouts')[0] || {};
    log(String(tp.query || '').includes('token=' + TPT) && !fl.body.includes(TPT), 'Travelpayouts token goes to the vendor only, not to the client');
    await fetchUrl('/');
    await fetchUrl('/app.js');
  } catch (e) { log(false, 'google live phase', e.message); }
  checkNoSecrets('Google live', [SRV, GEM, TPT]);
  checkNoUnexpectedExternal('Google live');
  checkNoFatal('Google live');
}

// ── Phase 5: 하루 호출 상한 ──
async function phaseDailyCap() {
  section('Phase 5: GOOGLE_DAILY_CALL_LIMIT');
  const SRV = 'SRVKEY-cap-test-44aa21';
  const LIMIT = 3;
  mock.reset({ places: 'ok' });
  try {
    await startServer('google-cap', { PLACES_PROVIDER: 'google', GOOGLE_MAPS_SERVER_KEY: SRV, GOOGLE_DAILY_CALL_LIMIT: String(LIMIT) });
  } catch (e) { log(false, 'Server (daily cap) started', e.message); return; }
  try {
    const cities = ['tokyo', 'osaka', 'kyoto', 'sapporo', 'fukuoka', 'nagoya'];
    const infos = [];
    let hitsAtFirstQuota = null;
    for (const city of cities) {
      const r = await postJson('/api/dest-search', { city, theme: 'mixed', lang: 'ko' });
      const si = r.json?.sourceInfo || {};
      infos.push(`${city}:${si.kind}/${si.reasonCode}`);
      if (si.reasonCode === 'GOOGLE_QUOTA_EXCEEDED' && hitsAtFirstQuota === null) hitsAtFirstQuota = mock.googleHits();
    }
    const f = await fetchUrl('/api/foods?city=hiroshima&lang=ko');
    infos.push(`foods:${f.json?.sourceInfo?.reasonCode}`);
    log(infos[0].startsWith('tokyo:live'), 'before the cap Google results are served', infos[0]);
    log(mock.googleHits() <= LIMIT, `never more than GOOGLE_DAILY_CALL_LIMIT (${LIMIT}) Google calls`, `${mock.googleHits()} calls`);
    log(hitsAtFirstQuota !== null && mock.googleHits() === hitsAtFirstQuota, 'after the cap: fallback with GOOGLE_QUOTA_EXCEEDED and no more calls', infos.join(' '));
    log(f.json?.sourceInfo?.reasonCode === 'GOOGLE_QUOTA_EXCEEDED' && (f.json?.list || []).length > 0, 'foods after the cap: curated list with GOOGLE_QUOTA_EXCEEDED', short(f.json?.sourceInfo));
    const diag = await fetchUrl('/api/ai-diagnostics');
    log(diag.json?.google?.dailyCallLimit === LIMIT && diag.json?.google?.callsToday <= LIMIT, 'diagnostics reports callsToday within the limit', short(diag.json?.google));
  } catch (e) { log(false, 'daily cap phase', e.message); }
  checkNoSecrets('Daily cap', [SRV]);
  checkNoUnexpectedExternal('Daily cap');
  checkNoFatal('Daily cap');
}

// ── Phase 6: Geocoding HTTP 200 + REQUEST_DENIED(결제) → 분류·차단, 예전 키는 브라우저로 안 나감 ──
async function phaseGeocodeDenied() {
  section('Phase 6: Geocoding 200 + REQUEST_DENIED, legacy key');
  const LEG = 'LEGACYKEY-test-7e21c0';
  mock.reset({ geocode: 'denied-billing', places: 'ok' });
  try {
    await startServer('geocode-denied', { PLACES_PROVIDER: 'google', MAP_PROVIDER: 'google', GOOGLE_MAPS_API_KEY: LEG });
  } catch (e) { log(false, 'Server (geocode denied) started', e.message); return; }
  try {
    const mc = await fetchUrl('/api/maps-config');
    log(JSON.stringify(mc.json) === JSON.stringify({ provider: 'osm' }), 'MAP_PROVIDER=google without browser key -> osm; legacy GOOGLE_MAPS_API_KEY never sent', short(mc.body));
    const d0 = await fetchUrl('/api/ai-diagnostics');
    log(d0.json?.google?.serverKeyFromLegacyVar === true, 'legacy GOOGLE_MAPS_API_KEY is used only as the server key (flagged)');
    const chat = await postJson('/api/ai-travel-chat', { message: '시즈오카의 누마즈라는 곳에서 2박 3일 여행하고 싶어', context: { city: 'tokyo', days: 3 } });
    log(chat.status === 200, 'chat with an unknown locality answers 200', String(chat.status));
    log(mock.count('geocode') === 1, 'unknown locality triggered one Geocoding call', String(mock.count('geocode')));
    const d1 = await fetchUrl('/api/ai-diagnostics');
    const g = d1.json?.google || {};
    log(g.lastErrorCode === 'GOOGLE_BILLING_DISABLED' && g.circuitOpen === true && g.circuitReason === 'GOOGLE_BILLING_DISABLED', 'Geocoding 200 + REQUEST_DENIED (billing) -> GOOGLE_BILLING_DISABLED, circuit open', short(g));
    log(mock.count('places') === 0, 'no Places calls after the Geocoding denial (circuit)', String(mock.count('places')));
    log(!/You must enable Billing/.test(chat.body), 'raw Google error text is not sent to the client');
    const p = await postJson('/api/travel-plan', { city: 'tokyo', theme: 'mixed', days: 2, budget: 'mid', startDate: futureDate(20), lang: 'ko' });
    log(p.json?.recommendationInfo?.reasonCode === 'GOOGLE_CIRCUIT_OPEN' && mock.count('places') === 0, 'later travel-plan -> GOOGLE_CIRCUIT_OPEN without Google calls', short(p.json?.recommendationInfo));
  } catch (e) { log(false, 'geocode denied phase', e.message); }
  checkNoSecrets('Geocode denied', [LEG]);
  checkNoUnexpectedExternal('Geocode denied');
  checkNoFatal('Geocode denied');
}

// ── Phase 7: OAuth state를 로그인을 시작한 브라우저의 쿠키에 묶기(로그인 CSRF 방지) + AI 오류 응답에서 벤더 원문 빼기 ──
// 토큰 교환은 가짜 서버가 늘 401로 거절하므로 로그인이 끝나지 않는다(로그인이 끝나는 경우는 다음 단계 7b, 쓰는 곳은 임시 폴더).
async function phaseOauthAndAiErrors() {
  section('Phase 7: OAuth state cookie binding, AI error redaction');
  const SECRETS = ['NAVERSECRET-test-2c9d51', 'KAKAOSECRET-test-8e0a37', 'GOOGLESECRET-test-4f6b19', 'GEMKEY-oauth-test-a13e5c'];
  mock.reset({ gemini: 'error400' });
  try {
    await startServer('oauth-ai-errors', {
      NAVER_CLIENT_ID: 'naver-client-test', NAVER_CLIENT_SECRET: SECRETS[0],
      KAKAO_REST_API_KEY: 'kakao-rest-test', KAKAO_CLIENT_SECRET: SECRETS[1],
      GOOGLE_OAUTH_CLIENT_ID: 'google-client-test', GOOGLE_OAUTH_CLIENT_SECRET: SECRETS[2],
      GEMINI_API_KEY: SECRETS[3]
    });
  } catch (e) { log(false, 'Server (oauth / ai errors) started', e.message); return; }

  const PROVIDERS = ['naver', 'kakao', 'google'];
  const TOKEN_ENDPOINT = { naver: 'nid.naver.com/oauth2.0/token', kakao: 'kauth.kakao.com/oauth/token', google: 'oauth2.googleapis.com/token' };
  const INVALID = '/?authError=invalid_state';
  const setCookies = (r) => [].concat(r.headers['set-cookie'] || []);
  const start = async (provider) => {
    const r = await fetchUrl(`/api/auth/${provider}`);
    let loc = null;
    try { loc = new URL(String(r.headers.location || '')); } catch { loc = null; }
    const cookie = setCookies(r).find((c) => c.startsWith('oauth_state=')) || '';
    return { r, loc, state: loc ? String(loc.searchParams.get('state') || '') : '', cookie };
  };
  // state === null이면 state 없이, cookieHeader가 없으면 쿠키 없이 콜백을 부른다.
  const callback = (provider, state, cookieHeader) => fetchUrl(`/api/auth/${provider}/callback?code=test-code${state === null ? '' : '&state=' + encodeURIComponent(state)}`,
    cookieHeader ? { headers: { Cookie: cookieHeader } } : {});
  const bad = { start: [], noCookie: [], wrongCookie: [], noState: [], cross: [], pass: [], replay: [], sid: [] };
  try {
    for (let i = 0; i < PROVIDERS.length; i++) {
      const p = PROVIDERS[i];
      const other = PROVIDERS[(i + 1) % PROVIDERS.length];
      // (1) 시작: 302 + oauth_state 쿠키(속성 4개), 쿠키 값 = Location의 state, 콜백 경로는 그대로
      const s1 = await start(p);
      const attrs = s1.cookie.split(';').map((x) => x.trim());
      const attrsOk = attrs[0] === `oauth_state=${s1.state}` && ['HttpOnly', 'SameSite=Lax', 'Path=/api/auth', 'Max-Age=600'].every((a) => attrs.includes(a));
      const redirectUri = s1.loc ? String(s1.loc.searchParams.get('redirect_uri') || '') : '';
      if (s1.r.status !== 302 || !/^[0-9a-f-]{36}$/.test(s1.state) || !attrsOk || !redirectUri.endsWith(`/api/auth/${p}/callback`)) {
        bad.start.push(`${p}: ${s1.r.status} [${s1.cookie}] ${redirectUri}`);
      }
      // (2) 쿠키 없음
      const noCookie = await callback(p, s1.state, null);
      if (noCookie.headers.location !== INVALID) bad.noCookie.push(`${p} -> ${noCookie.headers.location}`);
      // (3) 다른 브라우저의 쿠키
      const s2 = await start(p);
      const wrong = await callback(p, s2.state, 'oauth_state=00000000-0000-4000-8000-000000000000');
      if (wrong.headers.location !== INVALID) bad.wrongCookie.push(`${p} -> ${wrong.headers.location}`);
      // (4) 쿠키는 있지만 state 없음 (s3는 아직 쓰이지 않은 채로 남는다)
      const s3 = await start(p);
      const noState = await callback(p, null, `oauth_state=${s3.state}`);
      if (noState.headers.location !== INVALID) bad.noState.push(`${p} -> ${noState.headers.location}`);
      // (5) 다른 공급자가 발급한 state(쿠키도 같은 값)
      const so = await start(other);
      const cross = await callback(p, so.state, `oauth_state=${so.state}`);
      if (cross.headers.location !== INVALID) bad.cross.push(`${other} state at ${p} -> ${cross.headers.location}`);
      // (6) 쿠키 = state: state 검사를 통과해 토큰 교환을 한 번 시도(가짜 서버 401) → 공급자 오류로 돌아가고 state 쿠키를 지운다
      const before = mock.count('oauth');
      const pass = await callback(p, s3.state, `oauth_state=${s3.state}`);
      const cleared = setCookies(pass).some((c) => /^oauth_state=;/.test(c) && /Max-Age=0/.test(c));
      const tokenCalls = mock.entries('oauth').slice(before).map((e) => e.host + e.path);
      if (pass.headers.location !== `/?authError=${p}` || !cleared || tokenCalls.length !== 1 || tokenCalls[0] !== TOKEN_ENDPOINT[p]) {
        bad.pass.push(`${p} -> ${pass.headers.location} cleared=${cleared} calls=${tokenCalls.join(',')}`);
      }
      // (7) 검사를 통과한 state를 다시 쓰기
      const afterPass = mock.count('oauth');
      const replay = await callback(p, s3.state, `oauth_state=${s3.state}`);
      if (replay.headers.location !== INVALID || mock.count('oauth') !== afterPass) bad.replay.push(`${p} -> ${replay.headers.location}`);
      for (const r of [noCookie, wrong, noState, cross, pass, replay]) if (setCookies(r).some((c) => /^sid=/.test(c))) bad.sid.push(p);
    }
    log(bad.start.length === 0, 'OAuth start (naver/kakao/google): 302 + oauth_state cookie (HttpOnly, SameSite=Lax, Path=/api/auth, Max-Age=600) equal to the state in Location; callback path unchanged', bad.start.join(' | '));
    log(bad.noCookie.length === 0, `OAuth callback without the oauth_state cookie -> ${INVALID}`, bad.noCookie.join(', '));
    log(bad.wrongCookie.length === 0, 'OAuth callback with a different oauth_state cookie -> invalid_state', bad.wrongCookie.join(', '));
    log(bad.noState.length === 0, 'OAuth callback without state -> invalid_state', bad.noState.join(', '));
    log(bad.cross.length === 0, "OAuth callback with another provider's state (cookie matching) -> invalid_state", bad.cross.join(', '));
    log(bad.pass.length === 0, 'OAuth callback with cookie = state passes the check (one token exchange) and clears the state cookie', bad.pass.join(' | '));
    log(bad.replay.length === 0, 'OAuth state cannot be reused after it passed the check (invalid_state, no second token exchange)', bad.replay.join(', '));
    log(bad.sid.length === 0, 'no failed OAuth callback issues a sid session cookie', bad.sid.join(', '));
  } catch (e) { log(false, 'OAuth state phase', e.message); }

  // AI 오류: 가짜 Gemini가 400 + 벤더 원문으로 답해도, 응답의 aiErrors에는 분류 결과만 있고 원문은 없어야 한다.
  try {
    const ALLOWED_KEYS = ['provider', 'code', 'reasonCode', 'action'];
    const plan = await postJson('/api/travel-plan', { city: 'tokyo', theme: 'mixed', days: 2, budget: 'mid', startDate: futureDate(20), lang: 'ko', useAi: true });
    const chat = await postJson('/api/ai-travel-chat', { message: '도쿄 3일 여행 가고 싶어', context: { city: 'tokyo', days: 3 } });
    const vendorText = new RegExp([GEMINI_ERROR_TEXT, 'mock-vendor-detail', 'API_KEY_INVALID', 'INVALID_ARGUMENT'].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
    for (const [label, r] of [['travel-plan', plan], ['ai-travel-chat', chat]]) {
      const errs = Array.isArray(r.json?.aiErrors) ? r.json.aiErrors : [];
      const extraKeys = errs.flatMap((e) => Object.keys(e || {}).filter((k) => !ALLOWED_KEYS.includes(k)));
      log(r.status === 200 && errs.length > 0 && errs.every((e) => e && e.provider === 'Gemini' && !Object.prototype.hasOwnProperty.call(e, 'message')) && extraKeys.length === 0,
        `${label}: Gemini 4xx -> aiErrors items carry only provider/code/reasonCode/action (no message)`, short({ status: r.status, aiErrors: errs }));
      log(!vendorText.test(r.body), `${label}: response body has no raw vendor error text`, short((vendorText.exec(r.body) || [''])[0]));
    }
    const ii = plan.json?.itineraryInfo || {};
    log(ii.kind === 'rule' && ii.reasonCode === 'AI_ERROR' && (plan.json?.itinerary || []).length === 2, 'travel-plan: Gemini 4xx -> full rule-based itinerary (reasonCode AI_ERROR)', short(ii));
    const gem = mock.entries('gemini');
    log(gem.some((e) => e.isItinerary) && gem.some((e) => !e.isItinerary), `the Gemini mock refused both the itinerary and the chat request (${gem.length} calls), so the redaction path ran`);
  } catch (e) { log(false, 'AI error redaction', e.message); }
  checkNoSecrets('OAuth / AI errors', SECRETS);
  checkNoUnexpectedExternal('OAuth / AI errors');
  checkNoFatal('OAuth / AI errors');
}

// ── Phase 7b: 서명 쿠키 세션·고정 사용자 id·내 일정(가짜 Supabase)·저장소 장애·파일 저장소·keepalive ──
// 가짜 OAuth(scenario.oauth = 'ok')로 로그인을 끝까지 하고, users.json은 단계별 임시 TABIMARU_DATA_DIR에만 쓰인다.
async function phaseSessionsAndStorage() {
  section('Phase 7b: signed session cookie, stable user id, my-plans on Supabase, storage outage, file store, keepalive');
  const SB_KEY = 'sb_secret_TESTONLY-sessions-9f3e2a71';
  const JWT_KEY = 'eyJTESTONLY.legacy-jwt-service-role.c0ffee42';
  const OAUTH_SECRETS = ['GOOGLESECRET-sess-1a2b3c', 'KAKAOSECRET-sess-4d5e6f', 'NAVERSECRET-sess-7a8b9c'];
  const oauthEnv = {
    GOOGLE_OAUTH_CLIENT_ID: 'google-client-sess', GOOGLE_OAUTH_CLIENT_SECRET: OAUTH_SECRETS[0],
    KAKAO_REST_API_KEY: 'kakao-rest-sess', KAKAO_CLIENT_SECRET: OAUTH_SECRETS[1],
    NAVER_CLIENT_ID: 'naver-client-sess', NAVER_CLIENT_SECRET: OAUTH_SECRETS[2],
    TRUST_PROXY: '1'
  };
  const SECRETS = [SB_KEY, JWT_KEY, ...OAUTH_SECRETS];
  const newDataDir = (name) => { const d = path.join(TEST_DATA_ROOT, name); fs.mkdirSync(d, { recursive: true }); return d; };
  const setCookies = (r) => [].concat(r.headers['set-cookie'] || []);
  // 서버는 TRUST_PROXY=1로 띄우고 요청마다 다른 X-Forwarded-For를 붙인다(IP당 분당 60회 한도에 걸리지 않게).
  const call = (urlPath, options = {}) => fetchUrl(urlPath, { ip: nextIntentIp(), ...options });
  const withCookie = (cookie, extra = {}) => ({ ...extra, headers: { ...(extra.headers || {}), ...(cookie ? { Cookie: cookie } : {}) } });
  const me = async (cookie) => (await call('/api/auth/me', withCookie(cookie))).json?.user || null;
  const login = async (provider, profile) => {
    mock.scenario = { oauth: 'ok', oauthProfile: profile };
    const s = await call(`/api/auth/${provider}`);
    let state = '';
    try { state = String(new URL(String(s.headers.location || '')).searchParams.get('state') || ''); } catch { state = ''; }
    const cb = await call(`/api/auth/${provider}/callback?code=test-code&state=${encodeURIComponent(state)}`, { headers: { Cookie: `oauth_state=${state}` } });
    const sidCookie = setCookies(cb).find((c) => c.startsWith('sid=')) || '';
    const token = sidCookie.split(';')[0].slice(4);
    return { cb, sidCookie, token, cookie: token ? `sid=${token}` : '' };
  };
  const plans = {
    save: (cookie, body) => call('/api/my-plans/save', withCookie(cookie, { method: 'POST', body })),
    list: (cookie) => call('/api/my-plans/list', withCookie(cookie)),
    load: (cookie, id) => call('/api/my-plans/load?id=' + encodeURIComponent(id), withCookie(cookie)),
    del: (cookie, id) => call('/api/my-plans/delete?id=' + encodeURIComponent(id), withCookie(cookie, { method: 'DELETE' }))
  };
  const waitHealth = async (pred, ms = 4000) => {
    const until = Date.now() + ms;
    let h = null;
    while (Date.now() < until) {
      h = (await call('/api/health', { record: false })).json || {};
      if (pred(h)) return h;
      await sleep(100);
    }
    return h;
  };
  const sbEntries = () => mock.entries('supabase');
  const rowsByKey = (key) => mock.supabaseRows().filter((r) => r.plan_key === key);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const SUMMARY_KEYS = 'id,title,cityLabel,startDate,days,theme,savedAt';
  const ALICE = { id: 'g-alice-1001', name: 'Alice', email: 'alice@example.test', picture: 'https://lh3.googleusercontent.com/a/alice' };
  const BOB = { id: 'g-bob-2002', name: 'Bob', email: 'bob@example.test', picture: 'https://lh3.googleusercontent.com/a/bob' };
  const UID_A = stableUid('google', ALICE.id);
  const UID_B = stableUid('google', BOB.id);
  const samplePlanBody = (over = {}) => ({
    title: '도쿄 3일', cityKey: 'tokyo', cityLabel: '도쿄 (NRT)', startDate: futureDate(30), days: 3, theme: 'mixed',
    data: { itinerary: { itinerary: [{ day: 1, date: futureDate(30), blocks: ['오전(09:00-11:00): 센소지 (아사쿠사)'] }] }, formValues: { city: 'tokyo', budget: 'mid' } },
    ...over
  });

  // ── A. Supabase 정상(새 형식 키 sb_secret_…) ──
  const sbDir = newDataDir('sessions-supabase');
  const sbEnv = { ...oauthEnv, TABIMARU_DATA_DIR: sbDir, SUPABASE_URL: MOCK + '/supabase', SUPABASE_SERVICE_ROLE_KEY: SB_KEY };
  mock.reset({ oauth: 'ok' });
  // 같은 사용자의 "내 일정이 아닌" 행 2개(예: /api/travel-plan/save): 목록에 섞이거나 덮어써지면 안 된다
  mock.seedSupabase([
    { plan_key: 'tp-other-row-1', user_label: UID_A, city_key: 'tokyo', source: 'integrated_travel_planner_v1', summary: 'not a my-plan', payload: { x: 1 } },
    { plan_key: 'my_seeded-tp', user_label: UID_A, city_key: 'osaka', source: 'integrated_travel_planner_v1', summary: 'looks like my_ but is not', payload: { y: 2 } }
  ]);
  try { await startServer('sessions-supabase', sbEnv); } catch (e) { log(false, 'Server (sessions + supabase) started', e.message); return; }

  let A = null, B = null, savedA = null;
  try {
    // (1) 시작 직후 연결 확인 → /api/health가 처음부터 채워짐. 새 형식 키는 apikey만(Authorization 없음)
    const h = await waitHealth((x) => x.supabaseReachable !== null && x.supabaseReachable !== undefined);
    log(h.supabaseConfigured === true && h.supabaseReachable === true && h.supabaseCheck === 'ok' && h.sessionSecretConfigured === true && h.sessionSecretWeak === false && h.loginRestricted === false,
      "health right after start: supabaseConfigured true, supabaseReachable true + supabaseCheck 'ok' (startup check), sessionSecretConfigured true, sessionSecretWeak false, loginRestricted false",
      short({ c: h.supabaseConfigured, r: h.supabaseReachable, k: h.supabaseCheck, s: h.sessionSecretConfigured, w: h.sessionSecretWeak, l: h.loginRestricted }));
    const probe = sbEntries().find((e) => e.method === 'GET' && e.path === '/travel_plans' && e.query === '?select=id&limit=1');
    log(Boolean(probe) && probe.headers.apikey === SB_KEY && !('authorization' in probe.headers) && !sbEntries().some((e) => e.method === 'HEAD'),
      'startup check: GET travel_plans?select=id&limit=1 (address + key + table) with the apikey header and no Authorization for an sb_secret_ key',
      short(probe ? { apikey: probe.headers.apikey === SB_KEY, authorization: probe.headers.authorization ? 'present' : 'absent' } : 'no probe'));
    log(['sessionSecretConfigured', 'sessionSecretWeak', 'loginRestricted', 'supabaseReachable'].every((k) => typeof h[k] === 'boolean') && !JSON.stringify(h).includes(TEST_SESSION_SECRET) && !JSON.stringify(h).includes(SB_KEY),
      'health exposes booleans / a status word only (no secret values)');

    // (2) 로그인: 고정 사용자 id, 쿠키 속성·수명 30일, payload 모양
    A = await login('google', ALICE);
    const attrs = A.sidCookie.split(';').map((x) => x.trim());
    const pl = decodeSessionToken(A.token) || {};
    log(A.cb.status === 302 && A.cb.headers.location === '/' && Boolean(A.token), 'google login with the mock provider: 302 / + sid cookie', short({ status: A.cb.status, loc: A.cb.headers.location }));
    log(['HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${SESSION_TTL_SEC}`].every((a) => attrs.includes(a)) && !attrs.includes('Secure'),
      `sid cookie: HttpOnly, Path=/, SameSite=Lax, Max-Age=${SESSION_TTL_SEC} (30 days), no Secure on plain http`, short(attrs.slice(1)));
    log(pl.v === 1 && pl.uid === UID_A && pl.p === 'google' && pl.n === 'Alice' && pl.img === ALICE.picture && pl.exp - pl.iat === SESSION_TTL_SEC
      && Object.keys(pl).sort().join(',') === 'exp,iat,img,n,p,uid,v' && A.token.length < 3500 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(A.token),
      "sid = base64url(JSON {v:1, uid, p, n, img, iat, exp}) + '.' + base64url(HMAC-SHA256); uid = 'u_' + sha256('google:<id>')[0..24]; exp - iat = 30 days", short(pl));
    log(A.token.split('.')[1] === signSessionPart(A.token.split('.')[0]) && A.token.split('.')[1] !== crypto.createHmac('sha256', TEST_SESSION_SECRET).update(A.token.split('.')[0]).digest('base64url'),
      "sid signature = HMAC-SHA256(key, payload part) in base64url, key = HMAC(scrypt(SESSION_SECRET, 'tabimaru-sid-v1'), 'allow:' + allowlist) (not the raw secret)");
    const meA = await me(A.cookie);
    log(meA && meA.userId === UID_A && meA.provider === 'google' && meA.nickname === 'Alice' && meA.profileImage === ALICE.picture && Object.keys(meA).sort().join(',') === 'nickname,profileImage,provider,userId',
      '/api/auth/me with the sid cookie -> { userId, provider, nickname, profileImage }', short(meA));
    const A2 = await login('google', ALICE);
    B = await login('google', BOB);
    const kakao = await login('kakao', { id: '987654321', name: '카카오 사용자', picture: 'http://k.kakaocdn.net/dn/abc/img.jpg' });
    const googleSameNumber = await login('google', { id: '987654321', name: 'G', picture: '' });
    const naver = await login('naver', { id: 'nv-77', name: '네이버 사용자', picture: 'https://phinf.pstatic.net/a.jpg' });
    const uidOf = (s) => (decodeSessionToken(s.token) || {}).uid;
    log(uidOf(A2) === UID_A && uidOf(B) === UID_B && UID_A !== UID_B, 'stable uid: the same Google account logs in twice -> same uid; another account -> different uid', short([uidOf(A2), uidOf(B)]));
    log(uidOf(kakao) === stableUid('kakao', '987654321') && uidOf(googleSameNumber) === stableUid('google', '987654321') && uidOf(kakao) !== uidOf(googleSameNumber)
      && uidOf(naver) === stableUid('naver', 'nv-77'),
      'stable uid is namespaced by provider (kakao:987654321 != google:987654321), naver/kakao numeric ids work', short([uidOf(kakao), uidOf(googleSameNumber), uidOf(naver)]));
    const noId = await login('google', { id: null, name: 'No Id' });
    log(noId.cb.headers.location === '/?authError=google' && !noId.token, 'provider profile without an id -> /?authError=google and no sid cookie', short({ loc: noId.cb.headers.location }));
    const users = JSON.parse(fs.existsSync(path.join(sbDir, 'users.json')) ? fs.readFileSync(path.join(sbDir, 'users.json'), 'utf8') : '[]');
    const alice = users.filter((u) => u.provider === 'google' && u.providerId === ALICE.id);
    log(alice.length === 1 && alice[0].uid === UID_A && alice[0].id === UID_A, 'users.json (local record) is written to TABIMARU_DATA_DIR with uid = the stable id, once per account', short(alice));

    // (3) 쿠키 검증 경계: /api/auth/me가 user를 돌려주는지로 본다
    const forged = sessionPayload();
    const valid = sessionToken(forged);
    const [vPart, vSig] = valid.split('.');
    const tamperedPart = Buffer.from(JSON.stringify({ ...forged, uid: UID_B }), 'utf8').toString('base64url');
    const flip = (s) => s.slice(0, -1) + (s.slice(-1) === 'A' ? 'B' : 'A');
    const now = Math.floor(Date.now() / 1000);
    const oldUuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const oldSig = crypto.createHmac('sha256', TEST_SESSION_SECRET).update(oldUuid).digest('hex').slice(0, 16);
    const cases = [
      ['forged with the right secret', `sid=${valid}`, true],
      ['payload tampered (uid changed, old signature)', `sid=${tamperedPart}.${vSig}`, false],
      ['signature tampered (last char flipped)', `sid=${vPart}.${flip(vSig)}`, false],
      ['signed with a different secret', `sid=${sessionToken(forged, 'some-other-secret-value-abcdef0123')}`, false],
      ['expired (exp in the past)', `sid=${sessionToken(sessionPayload({ iat: now - 7200, exp: now - 10 }))}`, false],
      ['lifetime longer than 30 days', `sid=${sessionToken(sessionPayload({ exp: now + SESSION_TTL_SEC + 3600 }))}`, false],
      ['oversized (> 3500 chars, correctly signed)', `sid=${sessionToken(sessionPayload({ n: 'x'.repeat(4000) }))}`, false],
      ['payload part with non-base64url chars (signed)', `sid=${'bm90*YmFzZTY0'}.${signSessionPart('bm90*YmFzZTY0')}`, false],
      ['payload is not JSON (signed)', `sid=${sessionTokenFromJson('{not json')}`, false],
      ['payload is a JSON array (signed)', `sid=${sessionTokenFromJson('[1,2,3]')}`, false],
      ['payload v:2 (signed)', `sid=${sessionToken(sessionPayload({ v: 2 }))}`, false],
      ['payload without uid (signed)', `sid=${sessionToken((({ uid, ...rest }) => rest)(sessionPayload()))}`, false],
      ['uid not in u_<24 hex> form (signed)', `sid=${sessionToken(sessionPayload({ uid: 'admin' }))}`, false],
      ['unknown provider (signed)', `sid=${sessionToken(sessionPayload({ p: 'github' }))}`, false],
      ['iat after exp (signed)', `sid=${sessionToken(sessionPayload({ iat: now + 100, exp: now + 50 }))}`, false],
      ['old format sid=<uuid>.<16 hex HMAC>', `sid=${oldUuid}.${oldSig}`, false],
      ['three dot-separated parts', `sid=${valid}.extra`, false],
      ["decoy 'xsid=' cookie only", `xsid=${valid}`, false],
      ["decoy 'xsid=' before the real sid", `xsid=junk.value; sid=${valid}`, true],
      ["real sid before a decoy 'xsid='", `sid=${valid}; xsid=junk.value`, true],
      ['empty sid', 'sid=', false]
    ];
    const wrongCases = [];
    for (const [name, cookie, expectUser] of cases) {
      const u = await me(cookie);
      const ok = expectUser ? (u && u.userId === forged.uid) : u === null;
      if (!ok) wrongCases.push(`${name} -> ${short(u, 80)}`);
    }
    log(wrongCases.length === 0, `sid verification: ${cases.length} cases (tampered payload/signature, wrong secret, expired, too long-lived, oversized, bad base64/JSON/array, v:2, missing/bad uid, bad provider, old uuid format, xsid decoy)`, wrongCases.join(' | '));
    const proto = sessionTokenFromJson(`{"v":1,"uid":"${forged.uid}","p":"google","n":"P","img":"","iat":${now},"exp":${now + 600},"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"isAdmin":true}`);
    const protoMe = await call('/api/auth/me', withCookie(`sid=${proto}`));
    log(protoMe.json?.user?.userId === forged.uid && Object.keys(protoMe.json.user).sort().join(',') === 'nickname,profileImage,provider,userId' && !/polluted|isAdmin/.test(protoMe.body),
      'sid payload with __proto__ / constructor / extra keys: only the known fields are copied', short(protoMe.json));
    const out = await call('/api/auth/logout', withCookie(A.cookie, { method: 'POST' }));
    const cleared = setCookies(out).find((c) => c.startsWith('sid=')) || '';
    log(out.status === 200 && /^sid=;/.test(cleared) && /Max-Age=0/.test(cleared) && /Path=\//.test(cleared) && /HttpOnly/.test(cleared), 'logout clears the sid cookie (sid=; Max-Age=0; Path=/; HttpOnly)', short(cleared));

    // (4) 내 일정 CRUD(가짜 Supabase)
    const noAuth = await Promise.all([plans.list(''), plans.save('', samplePlanBody()), plans.load('', 'x'), plans.del('', 'x')]);
    log(noAuth.every((r) => r.status === 401), 'my-plans save/list/load/delete without a session -> 401', short(noAuth.map((r) => r.status)));
    const empty = await plans.list(A.cookie);
    log(empty.status === 200 && Array.isArray(empty.json?.plans) && empty.json.plans.length === 0, "list for a user with only non-'my-plans' rows -> [] (source filter)", short(empty.json));
    const s1 = await plans.save(A.cookie, samplePlanBody());
    savedA = s1.json?.saved || {};
    log(s1.status === 200 && UUID_RE.test(String(savedA.id)) && savedA.userId === UID_A && savedA.title === '도쿄 3일' && savedA.days === 3 && savedA.data?.formValues?.budget === 'mid' && !Number.isNaN(Date.parse(savedA.savedAt)),
      'save without id -> 200 { saved: { id (new uuid), userId = session uid, title, …, data, savedAt } }', short(savedA));
    const rowA = rowsByKey(`my_${savedA.id}`)[0] || {};
    log(rowA.user_label === UID_A && rowA.source === 'my-plans' && rowA.city_key === 'tokyo' && rowA.city_label === '도쿄 (NRT)' && rowA.theme === 'mixed'
      && rowA.start_date === futureDate(30) && rowA.days === 3 && rowA.summary === '도쿄 3일' && JSON.stringify(rowA.payload) === JSON.stringify(savedA),
      "Supabase row: plan_key 'my_'+id, user_label = uid, source 'my-plans', city_key/city_label/theme/start_date/days, summary = title, payload = the plan object", short(rowA, 400));
    const listed = await plans.list(A.cookie);
    const item = (listed.json?.plans || [])[0] || {};
    log(listed.status === 200 && listed.json.plans.length === 1 && Object.keys(item).join(',') === SUMMARY_KEYS && item.id === savedA.id && item.title === '도쿄 3일'
      && item.cityLabel === '도쿄 (NRT)' && item.startDate === futureDate(30) && item.days === 3 && item.theme === 'mixed' && !Number.isNaN(Date.parse(item.savedAt)),
      `list -> { plans: [{ ${SUMMARY_KEYS} }] } (same shape as the file store)`, short(listed.json));
    const loaded = await plans.load(A.cookie, savedA.id);
    log(loaded.status === 200 && JSON.stringify(loaded.json?.plan) === JSON.stringify(savedA), 'load -> { plan } equal to what was saved', short(loaded.json, 200));
    const createdAt = rowA.created_at;
    const s2 = await plans.save(A.cookie, samplePlanBody({ id: savedA.id, title: '도쿄 3일 (수정)' }));
    const rowsA = rowsByKey(`my_${savedA.id}`);
    log(s2.status === 200 && s2.json?.saved?.id === savedA.id && rowsA.length === 1 && rowsA[0].summary === '도쿄 3일 (수정)' && rowsA[0].created_at === createdAt && rowsA[0].updated_at > createdAt,
      'save with the same id overwrites the one row (upsert on plan_key, created_at kept, updated_at moves)', short(rowsA.map((r) => ({ s: r.summary, c: r.created_at, u: r.updated_at }))));
    const odd = await plans.save(A.cookie, samplePlanBody({ id: 'bad id!/../x', title: '이상한 값', startDate: '2026/10/01', days: 'abc', cityKey: '', theme: '' }));
    const oddRow = rowsByKey(`my_${odd.json?.saved?.id}`)[0] || {};
    log(odd.status === 200 && UUID_RE.test(String(odd.json?.saved?.id)) && oddRow.start_date === null && oddRow.days === null && oddRow.city_key === 'unknown' && oddRow.theme === null
      && oddRow.payload?.startDate === '2026/10/01' && rowsByKey('my_bad id!/../x').length === 0,
      "unsafe client id -> new uuid; non-ISO startDate -> start_date null (kept in payload); bad days -> null; empty cityKey -> 'unknown'", short(oddRow, 300));
    const bad31 = await plans.save(A.cookie, samplePlanBody({ title: '2월 30일', startDate: '2026-02-30' }));
    log(bad31.status === 200 && (rowsByKey(`my_${bad31.json?.saved?.id}`)[0] || {}).start_date === null, "impossible calendar date '2026-02-30' -> start_date null (no Postgres error / 503)");
    const order = (await plans.list(A.cookie)).json?.plans || [];
    log(order.length === 3 && order[0].id === bad31.json?.saved?.id && order[2].id === savedA.id, 'list is ordered by updated_at desc (newest first)', short(order.map((p) => p.title)));
    const seededClash = await plans.save(A.cookie, samplePlanBody({ id: 'seeded-tp', title: 'clash' }));
    log(seededClash.status === 404 && (rowsByKey('my_seeded-tp')[0] || {}).summary === 'looks like my_ but is not', "save onto an existing non-'my-plans' row with the same plan_key -> 404, row untouched", short(seededClash.json));

    // (5) 다른 사용자(B)는 A의 일정을 보거나 바꾸지 못한다
    const bList = await plans.list(B.cookie);
    const bLoad = await plans.load(B.cookie, savedA.id);
    const bOverwrite = await plans.save(B.cookie, samplePlanBody({ id: savedA.id, title: 'B가 덮어쓰기' }));
    const bDelete = await plans.del(B.cookie, savedA.id);
    const afterB = rowsByKey(`my_${savedA.id}`);
    log(bList.status === 200 && (bList.json?.plans || []).length === 0, "user B's list does not show A's plans", short(bList.json));
    log(bLoad.status === 404 && !bLoad.body.includes('도쿄 3일'), "user B loading A's plan id -> 404 (no data leaked)", short(bLoad.json));
    log(bOverwrite.status === 404 && afterB.length === 1 && afterB[0].user_label === UID_A && afterB[0].summary === '도쿄 3일 (수정)', "user B saving with A's plan id -> 404 and A's row is unchanged", short({ status: bOverwrite.status, row: afterB[0] && afterB[0].summary }));
    log(bDelete.status === 200 && bDelete.json?.deleted === false && afterB.length === 1, "user B deleting A's plan id -> { deleted: false } and the row stays", short(bDelete.json));
    const bSave = await plans.save(B.cookie, samplePlanBody({ title: 'B의 오사카', cityKey: 'osaka', cityLabel: '오사카 (KIX)' }));
    const bOwn = (await plans.list(B.cookie)).json?.plans || [];
    const aOwn = (await plans.list(A.cookie)).json?.plans || [];
    log(bSave.status === 200 && bOwn.length === 1 && bOwn[0].title === 'B의 오사카' && !aOwn.some((p) => p.title === 'B의 오사카') && aOwn.length === 3, 'each user lists only their own plans', short({ bOwn: bOwn.map((p) => p.title), aOwn: aOwn.map((p) => p.title) }));

    // (6) 요청 모양: 필터 값은 URL 인코딩, load/delete는 plan_key + user_label + source, 헤더는 apikey만
    const loadReq = sbEntries().find((e) => {
      const p = new URLSearchParams(e.query);
      return e.method === 'GET' && p.get('select') === 'payload' && p.get('user_label') === `eq.${UID_A}`;
    });
    const q = loadReq ? new URLSearchParams(loadReq.query) : new URLSearchParams();
    log(Boolean(loadReq) && q.get('plan_key') === `eq.my_${savedA.id}` && q.get('user_label') === `eq.${UID_A}` && q.get('source') === 'eq.my-plans' && q.get('limit') === '1',
      'load query filters plan_key=eq.my_<id> & user_label=eq.<uid> & source=eq.my-plans (limit 1)', short(loadReq && loadReq.query));
    const delReq = sbEntries().filter((e) => e.method === 'DELETE').pop();
    const dq = delReq ? new URLSearchParams(delReq.query) : new URLSearchParams();
    log(Boolean(delReq) && dq.get('plan_key') === `eq.my_${savedA.id}` && dq.get('user_label') === `eq.${UID_B}` && dq.get('source') === 'eq.my-plans' && delReq.prefer.includes('return=representation'),
      'delete filters plan_key + user_label + source and asks for return=representation', short(delReq && { q: delReq.query, prefer: delReq.prefer }));
    const listReq = sbEntries().filter((e) => e.method === 'GET' && /order=updated_at\.desc/.test(e.query)).pop();
    const lq = listReq ? new URLSearchParams(listReq.query) : new URLSearchParams();
    log(Boolean(listReq) && lq.get('limit') === '50' && lq.get('source') === 'eq.my-plans' && /^eq\.u_[0-9a-f]{24}$/.test(String(lq.get('user_label'))) && !/payload/.test(String(lq.get('select'))),
      'list query: user_label + source filters, order=updated_at.desc, limit=50 (= the per-user cap), no payload column selected', short(listReq && listReq.query));
    const upserts = sbEntries().filter((e) => e.method === 'POST');
    log(upserts.length > 0 && upserts.every((e) => /on_conflict=plan_key/.test(e.query) && e.prefer.includes('resolution=merge-duplicates')), 'save upserts with on_conflict=plan_key + Prefer resolution=merge-duplicates', short(upserts.map((e) => e.prefer)));
    const badHeaders = sbEntries().filter((e) => e.headers.apikey !== SB_KEY || 'authorization' in e.headers);
    log(sbEntries().length > 10 && badHeaders.length === 0, `every Supabase request (${sbEntries().length}) sends apikey = the sb_secret_ key and no Authorization header`, short(badHeaders.map((e) => `${e.method} ${e.path}`)));

    // (7) 삭제
    const d1 = await plans.del(A.cookie, savedA.id);
    const d2 = await plans.del(A.cookie, savedA.id);
    log(d1.json?.deleted === true && d2.json?.deleted === false && rowsByKey(`my_${savedA.id}`).length === 0, 'delete own plan -> { deleted: true } (row gone), again -> { deleted: false }', short([d1.json, d2.json]));
    const missing = await plans.load(A.cookie, '');
    const weird = await plans.load(A.cookie, 'a/b?c');
    log(missing.status === 400 && weird.status === 404, 'load without id -> 400; id outside the safe pattern -> 404', short([missing.status, weird.status]));
    log(!fs.existsSync(path.join(sbDir, 'saved_plans.json')), 'with Supabase configured, nothing is written to saved_plans.json');

    // (8) keepalive: 진짜 조회(travel_plans?select=id&limit=1)를 10분에 한 번만
    const kaCount = () => sbEntries().filter((e) => e.method === 'GET' && e.query === '?select=id&limit=1').length;
    const k0 = kaCount();
    const ka1 = await call('/api/keepalive');
    const ka2 = await call('/api/keepalive');
    log(ka1.status === 200 && ka1.json?.ok === true && ka1.json?.supabase === 'ok' && !Number.isNaN(Date.parse(ka1.json?.checkedAt)) && Object.keys(ka1.json).join(',') === 'ok,supabase,checkedAt'
      && /no-store/.test(String(ka1.headers['cache-control'] || '')),
      'GET /api/keepalive -> 200 { ok: true, supabase: "ok", checkedAt } (Cache-Control: no-store)', short(ka1.json));
    log(kaCount() === k0 + 1 && ka2.json?.checkedAt === ka1.json?.checkedAt && ka2.json?.supabase === 'ok', 'keepalive caches its result: a second call within 10 minutes does not query Supabase again', short({ queries: kaCount() - k0 }));
    log(!/plan_key|payload|user_label|도쿄/.test(ka1.body), 'keepalive response carries no row data');

    // (9) 개인 일정 응답은 캐시하지 않는다(401·404 포함)
    const noStore = (r) => /no-store/.test(String(r.headers['cache-control'] || ''));
    const ns = [await plans.list(A.cookie), await plans.load(A.cookie, 'no-such-plan'), await plans.save(A.cookie, samplePlanBody({ title: 'no-store check' })),
      await plans.del(A.cookie, 'no-such-plan'), await plans.list(''), await plans.load('', 'x'),
      await call('/api/travel-plan/list', withCookie(A.cookie)), await call('/api/travel-plan/get?planKey=tp-other-row-1', withCookie(A.cookie))];
    log(ns.every(noStore) && ns[6].status === 200 && ns[7].status === 200, 'my-plans save/list/load/delete (also 401/404) and travel-plan list/get answer Cache-Control: no-store',
      short(ns.map((r) => [r.status, r.headers['cache-control'] || null])));

    // (10) Postgres가 받지 않는 글자(NUL, 짝 없는 서로게이트): 저장 전에 고쳐서 저장한다(예전엔 '연결 불가' 503)
    const nul = await plans.save(A.cookie, samplePlanBody({ title: 'test nul \u0000 title \ud83d', cityLabel: 'Osaka\u0000', data: { note: 'memo\u0000x', ['k\u0000ey']: ['\udc00ok', { deep: 'a\u0000b' }], ok: '😀' } }));
    const nulId = nul.json?.saved?.id;
    const nulRow = rowsByKey(`my_${nulId}`)[0] || {};
    const nd = nulRow.payload?.data || {};
    log(nul.status === 200 && nulRow.summary === 'test nul  title \uFFFD' && nulRow.city_label === 'Osaka' && nd.note === 'memox' && Array.isArray(nd.key) && nd.key[0] === '\uFFFDok' && nd.key[1]?.deep === 'ab' && nd.ok === '😀'
      && !JSON.stringify(nulRow).includes('\\u0000'),
      'save with NUL / lone surrogates in title, labels, data values and keys -> 200; NUL removed, lone surrogates -> U+FFFD, valid emoji kept', short({ status: nul.status, body: nul.json?.reasonCode, summary: nulRow.summary, data: nd }));
    const nulLoad = await plans.load(A.cookie, nulId);
    log(nulLoad.status === 200 && nulLoad.json?.plan?.title === 'test nul  title \uFFFD' && nulLoad.json?.plan?.data?.note === 'memox', 'the cleaned plan loads back as saved', short(nulLoad.json?.plan?.title));
    const tpNul = await call('/api/travel-plan/save', withCookie(A.cookie, { method: 'POST', body: { city: 'tokyo', plan: { city: '도쿄\u0000', summary: 'tp \u0000 nul \udfff', itinerary: [] } } }));
    const tpRow = mock.supabaseRows().find((r) => r.summary && r.summary.startsWith('tp ')) || {};
    log(tpNul.status === 200 && tpRow.summary === 'tp  nul \uFFFD' && tpRow.city_label === '도쿄' && tpRow.payload?.summary === 'tp  nul \uFFFD', '/api/travel-plan/save cleans NUL / lone surrogates the same way', short({ status: tpNul.status, row: tpRow.summary }));
    const deep = await plans.save(A.cookie, samplePlanBody({ title: 'too deep', data: JSON.parse('{"a":'.repeat(80) + '1' + '}'.repeat(80)) }));
    log(deep.status === 400 && !rowsByKey('my_' + String(deep.json?.saved?.id)).length, 'data nested deeper than 64 levels -> 400 (no crash, nothing stored)', short({ status: deep.status, body: deep.json }));

    // (11) 일정 하나의 크기 상한(400KB)
    const rowsBefore = mock.supabaseRows().length;
    const big = await plans.save(A.cookie, samplePlanBody({ title: 'too big', data: { blob: 'x'.repeat(410_000) } }));
    log(big.status === 413 && big.json?.reasonCode === 'PLAN_TOO_LARGE' && HANGUL_RE.test(String(big.json?.error || '')) && mock.supabaseRows().length === rowsBefore && noStore(big),
      'a plan over 400 KB -> 413 { reasonCode: PLAN_TOO_LARGE } and nothing is stored', short({ status: big.status, body: big.json }));

    // (12) 사용자당 개수 상한(50): 새 일정은 409, 덮어쓰기는 허용, 목록은 50개 모두 보여 줌(전부 화면에서 지울 수 있음)
    const CAROL = { id: 'g-carol-5005', name: 'Carol', email: 'carol@example.test', picture: '' };
    const UID_C = stableUid('google', CAROL.id);
    mock.seedSupabase(Array.from({ length: 50 }, (_, i) => ({ plan_key: `my_cap-${i + 1}`, user_label: UID_C, city_key: 'tokyo', source: 'my-plans', summary: `cap ${i + 1}`, payload: { id: `cap-${i + 1}`, title: `cap ${i + 1}` } })));
    const C = await login('google', CAROL);
    const cRows = () => mock.supabaseRows().filter((r) => r.user_label === UID_C);
    const over = await plans.save(C.cookie, samplePlanBody({ title: '51번째' }));
    log(over.status === 409 && over.json?.reasonCode === 'PLAN_LIMIT' && over.json?.limit === 50 && HANGUL_RE.test(String(over.json?.error || '')) && cRows().length === 50,
      'the 51st new plan of one user -> 409 { reasonCode: PLAN_LIMIT, limit: 50 }, nothing stored', short({ status: over.status, body: over.json, rows: cRows().length }));
    const capOverwrite = await plans.save(C.cookie, samplePlanBody({ id: 'cap-7', title: 'cap 7 수정' }));
    log(capOverwrite.status === 200 && cRows().length === 50 && (rowsByKey('my_cap-7')[0] || {}).summary === 'cap 7 수정', 'overwriting one of the 50 (same id) is still allowed at the cap', short({ status: capOverwrite.status }));
    const cList = await plans.list(C.cookie);
    log(cList.status === 200 && (cList.json?.plans || []).length === 50, 'the list shows all 50 plans (limit = cap, so every stored plan can be deleted from the UI)', short((cList.json?.plans || []).length));
    const cDel = await plans.del(C.cookie, 'cap-1');
    const cAgain = await plans.save(C.cookie, samplePlanBody({ title: '자리 생김' }));
    log(cDel.json?.deleted === true && cAgain.status === 200 && cRows().length === 50, 'after deleting one, a new plan can be saved again', short({ del: cDel.json, status: cAgain.status }));
    const tpCap = await call('/api/travel-plan/save', withCookie(C.cookie, { method: 'POST', body: { city: 'tokyo', plan: { city: '도쿄', summary: 'tp cap', itinerary: [] } } }));
    log(tpCap.status === 409 && tpCap.json?.reasonCode === 'PLAN_LIMIT' && cRows().length === 50, '/api/travel-plan/save has the same per-user cap', short({ status: tpCap.status, body: tpCap.json }));

    // (13) 저장소가 내용을 거절(4xx)하면 '연결 불가'가 아니라 400 INVALID_PLAN, 저장소 상태는 정상 그대로
    mock.scenario = { supabase: 'reject_post' };
    const rej = await plans.save(A.cookie, samplePlanBody({ title: 'rejected' }));
    const tpRej = await call('/api/travel-plan/save', withCookie(A.cookie, { method: 'POST', body: { city: 'tokyo', plan: { city: '도쿄', summary: 'tp rejected', itinerary: [] } } }));
    const hRej = (await call('/api/health', { record: false })).json || {};
    mock.scenario = { supabase: 'ok' };
    log(rej.status === 400 && rej.json?.reasonCode === 'INVALID_PLAN' && HANGUL_RE.test(String(rej.json?.error || '')) && !/22P05|unsupported Unicode/.test(rej.body)
      && tpRej.status === 400 && tpRej.json?.reasonCode === 'INVALID_PLAN',
      'Supabase rejecting the content (400 22P05) -> 400 { reasonCode: INVALID_PLAN } on my-plans and travel-plan save (raw error not exposed)', short([rej.status, rej.json, tpRej.status]));
    log(hRej.supabaseReachable === true && hRej.supabaseCheck === 'ok', 'a content rejection does not mark the storage unreachable in /api/health', short({ r: hRej.supabaseReachable, k: hRej.supabaseCheck }));
    log(/\[supabase\] 내 일정 save 실패: Supabase error 400/.test(serverLogs()) && /저장소 오류: Supabase error 400/.test(serverLogs()), 'the raw Supabase 400 stays in the server log only');
  } catch (e) { log(false, 'sessions + supabase phase', e.stack || e.message); }
  checkNoSecrets('Sessions / Supabase', SECRETS.concat([TEST_SESSION_SECRET]));
  checkNoUnexpectedExternal('Sessions / Supabase');
  checkNoFatal('Sessions / Supabase');

  // ── B. 같은 SESSION_SECRET으로 서버를 다시 띄우면 로그인이 그대로, 비밀값을 바꾸면 풀린다 ──
  try {
    const cookieB = B && B.cookie;
    await startServer('sessions-restart', sbEnv);
    const again = await me(cookieB);
    const bPlans = await plans.list(cookieB);
    log(again && again.userId === UID_B && again.nickname === 'Bob', 'after a server restart with the same SESSION_SECRET the sid cookie still logs in (same uid, no server-side store)', short(again));
    log(bPlans.status === 200 && (bPlans.json?.plans || []).length === 1 && bPlans.json.plans[0].title === 'B의 오사카', "after the restart the user's plans are still listed (Supabase, keyed by the stable uid)", short(bPlans.json));
    await startServer('sessions-rotated-secret', { ...sbEnv, SESSION_SECRET: 'rotated-test-only-secret-fedcba9876543210' });
    const rotated = await me(cookieB);
    const B2 = await login('google', BOB);
    const plansAfterRotate = await plans.list(B2.cookie);
    log(rotated === null, 'after rotating SESSION_SECRET the old cookie is logged out', short(rotated));
    log((decodeSessionToken(B2.token) || {}).uid === UID_B && (plansAfterRotate.json?.plans || []).length === 1, 'logging in again after the rotation gives the same uid, so the saved plans are still there', short(plansAfterRotate.json));
  } catch (e) { log(false, 'session restart', e.stack || e.message); }
  checkNoFatal('Sessions restart');

  // ── C. Supabase가 503(일시 중지·복구 중)일 때 + 예전 JWT 키(eyJ…)는 Bearer도 보냄 ──
  const downDir = newDataDir('sessions-down');
  mock.reset({ oauth: 'ok', supabase: 'down' });
  try {
    await startServer('supabase-down', { ...oauthEnv, TABIMARU_DATA_DIR: downDir, SUPABASE_URL: MOCK + '/supabase', SUPABASE_SERVICE_ROLE_KEY: JWT_KEY });
    const h = await waitHealth((x) => x.supabaseReachable !== null && x.supabaseReachable !== undefined);
    log(h.supabaseConfigured === true && h.supabaseReachable === false && h.supabaseCheck === 'unreachable', "Supabase answering 503: health says supabaseConfigured true, supabaseReachable false, supabaseCheck 'unreachable'", short({ c: h.supabaseConfigured, r: h.supabaseReachable, k: h.supabaseCheck }));
    const probe = sbEntries().find((e) => e.method === 'GET' && e.query === '?select=id&limit=1');
    log(Boolean(probe) && probe.headers.apikey === JWT_KEY && probe.headers.authorization === `Bearer ${JWT_KEY}`, 'legacy JWT key (eyJ…): apikey + Authorization: Bearer are both sent');
    const D = await login('google', ALICE);
    const rs = [await plans.save(D.cookie, samplePlanBody()), await plans.list(D.cookie), await plans.load(D.cookie, 'abc'), await plans.del(D.cookie, 'abc')];
    log(rs.every((r) => r.status === 503 && r.json?.reasonCode === 'PROVIDER_UNAVAILABLE' && HANGUL_RE.test(String(r.json?.error || ''))),
      'Supabase unavailable: save/list/load/delete -> 503 { error (Korean), reasonCode: PROVIDER_UNAVAILABLE }', short(rs.map((r) => [r.status, r.json?.reasonCode])));
    log(rs.every((r) => !r.body.includes(SUPABASE_ERROR_TEXT) && !/mock-supabase|restoring/.test(r.body)), 'the raw Supabase error text never reaches the client');
    log(!fs.existsSync(path.join(downDir, 'saved_plans.json')), 'Supabase unavailable: the plan is NOT silently written to the local file');
    const k0 = sbEntries().filter((e) => e.method === 'GET').length;
    const ka1 = await call('/api/keepalive');
    const ka1At = Date.now();
    const ka2 = await call('/api/keepalive');
    log(ka1.status === 200 && ka1.json?.ok === true && ka1.json?.supabase === 'unreachable' && ka2.json?.checkedAt === ka1.json?.checkedAt
      && sbEntries().filter((e) => e.method === 'GET').length === k0 + 1, 'keepalive while Supabase is down -> { ok: true, supabase: "unreachable" }; an immediate second call reuses it (no extra query)', short(ka1.json));
    log(!serverLogs().includes(JWT_KEY), 'server log never contains the Supabase key');
    // 실패는 15초만 재사용: Supabase가 돌아오면 GitHub Actions의 다음 재시도(30초 뒤)가 실제로 다시 확인해 ok를 받는다
    mock.scenario = { supabase: 'ok' };
    await sleep(Math.max(0, 15_500 - (Date.now() - ka1At)));
    const ka3 = await call('/api/keepalive');
    const hBack = (await call('/api/health', { record: false })).json || {};
    log(ka3.json?.supabase === 'ok' && ka3.json?.checkedAt !== ka1.json?.checkedAt && hBack.supabaseReachable === true && hBack.supabaseCheck === 'ok',
      'a failed keepalive is cached only ~15 s: once Supabase is back, the next retry checks again -> "ok" (health reachable true again)', short({ ka3: ka3.json, r: hBack.supabaseReachable }));
  } catch (e) { log(false, 'supabase down phase', e.stack || e.message); }
  checkNoSecrets('Supabase down', SECRETS);
  checkNoUnexpectedExternal('Supabase down');
  checkNoFatal('Supabase down');

  // ── C2. 키가 틀렸거나 폐기됨(401 Invalid API key): health가 '정상'으로 보이면 안 된다 ──
  const authDir = newDataDir('sessions-badkey');
  mock.reset({ oauth: 'ok', supabase: 'auth' });
  try {
    await startServer('supabase-bad-key', { ...oauthEnv, TABIMARU_DATA_DIR: authDir, SUPABASE_URL: MOCK + '/supabase', SUPABASE_SERVICE_ROLE_KEY: SB_KEY });
    const h = await waitHealth((x) => x.supabaseReachable !== null && x.supabaseReachable !== undefined);
    log(h.supabaseConfigured === true && h.supabaseReachable === false && h.supabaseCheck === 'auth_error',
      "wrong / revoked Supabase key (401): health supabaseReachable false, supabaseCheck 'auth_error' (not a false 'reachable')", short({ r: h.supabaseReachable, k: h.supabaseCheck }));
    const K = await login('google', ALICE);
    const kl = await plans.list(K.cookie);
    const ks = await plans.save(K.cookie, samplePlanBody());
    const kk = await call('/api/keepalive');
    const h2 = (await call('/api/health', { record: false })).json || {};
    log(kl.status === 503 && ks.status === 503 && kl.json?.reasonCode === 'PROVIDER_UNAVAILABLE' && ks.json?.reasonCode === 'PROVIDER_UNAVAILABLE' && !fs.existsSync(path.join(authDir, 'saved_plans.json')),
      'wrong key: my-plans list/save -> 503 PROVIDER_UNAVAILABLE, nothing written to the local file', short([kl.status, ks.status]));
    log(kk.json?.ok === true && kk.json?.supabase === 'auth_error' && h2.supabaseReachable === false && h2.supabaseCheck === 'auth_error',
      'wrong key: keepalive -> supabase "auth_error" (the workflow fails), health stays reachable false after it', short({ ka: kk.json, r: h2.supabaseReachable }));
    log(/\[supabase\] 키가 거부됐습니다/.test(serverLogs()) && !serverLogs().includes(SB_KEY), 'wrong key: the server log says the key was rejected (key value never logged)');
  } catch (e) { log(false, 'supabase bad key phase', e.stack || e.message); }
  checkNoSecrets('Supabase bad key', SECRETS);
  checkNoUnexpectedExternal('Supabase bad key');
  checkNoFatal('Supabase bad key');

  // ── D. 연결 거부(주소는 있지만 아무도 듣지 않음) + SESSION_SECRET 없음 ──
  const refusedDir = newDataDir('sessions-refused');
  mock.reset({ oauth: 'ok' });
  try {
    const port = await closedPort();
    await startServer('supabase-refused', { ...oauthEnv, TABIMARU_DATA_DIR: refusedDir, SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SERVICE_ROLE_KEY: SB_KEY, SESSION_SECRET: '' });
    const h = await waitHealth((x) => x.supabaseReachable !== null && x.supabaseReachable !== undefined);
    log(h.sessionSecretConfigured === false && h.supabaseConfigured === true && h.supabaseReachable === false, 'no SESSION_SECRET -> sessionSecretConfigured false; connection refused -> supabaseReachable false', short({ s: h.sessionSecretConfigured, r: h.supabaseReachable }));
    log(/\[session\] SESSION_SECRET이 없어/.test(serverLogs()), 'missing SESSION_SECRET is warned in the server log');
    const R = await login('google', ALICE);
    const r1 = await plans.save(R.cookie, samplePlanBody());
    log(Boolean(R.token) && r1.status === 503 && r1.json?.reasonCode === 'PROVIDER_UNAVAILABLE' && !fs.existsSync(path.join(refusedDir, 'saved_plans.json')),
      'connection refused: save -> 503 PROVIDER_UNAVAILABLE and no file write', short({ status: r1.status, body: r1.json }));
  } catch (e) { log(false, 'supabase refused phase', e.stack || e.message); }
  checkNoFatal('Supabase refused');

  // ── E. Supabase 미설정 → 파일 저장소(TABIMARU_DATA_DIR), 예전 users.json id의 일정도 같은 사람 것 ──
  const fileDir = newDataDir('sessions-file');
  const LEGACY = { id: 'g-legacy-3003', name: 'Legacy' };
  const UID_L = stableUid('google', LEGACY.id);
  fs.writeFileSync(path.join(fileDir, 'users.json'), JSON.stringify([{ id: 'legacy-uuid-0001', provider: 'google', providerId: LEGACY.id, nickname: 'Old', createdAt: '2026-03-01T00:00:00.000Z' }]));
  fs.writeFileSync(path.join(fileDir, 'saved_plans.json'), JSON.stringify([
    { id: 'legacy-plan-1', userId: 'legacy-uuid-0001', title: '예전 일정', cityKey: 'kyoto', cityLabel: '교토 (KIX)', startDate: '2026-04-01', days: 2, theme: 'culture', data: {}, savedAt: '2026-03-02T00:00:00.000Z' },
    { id: 'other-plan', userId: 'someone-else', title: '남의 일정', cityKey: 'tokyo', cityLabel: '도쿄', startDate: '', days: 1, theme: '', data: {}, savedAt: '2026-03-03T00:00:00.000Z' }
  ]));
  mock.reset({ oauth: 'ok' });
  try {
    await startServer('file-store', { ...oauthEnv, TABIMARU_DATA_DIR: fileDir });
    const h = (await call('/api/health')).json || {};
    log(h.supabaseConfigured === false && h.supabaseReachable === null, 'Supabase not configured: health supabaseConfigured false, supabaseReachable null', short({ c: h.supabaseConfigured, r: h.supabaseReachable }));
    const L = await login('google', LEGACY);
    const l1 = (await plans.list(L.cookie)).json?.plans || [];
    log((decodeSessionToken(L.token) || {}).uid === UID_L && l1.length === 1 && l1[0].id === 'legacy-plan-1', "file store: a plan saved under the account's old random id (users.json) is still listed after the switch to stable ids", short(l1));
    const fs1 = await plans.save(L.cookie, samplePlanBody({ title: '파일 저장' }));
    const onDisk = JSON.parse(fs.readFileSync(path.join(fileDir, 'saved_plans.json'), 'utf8'));
    log(fs1.status === 200 && onDisk.some((p) => p.id === fs1.json?.saved?.id && p.userId === UID_L && p.title === '파일 저장'), 'file store: save writes saved_plans.json in TABIMARU_DATA_DIR with userId = stable uid', short(fs1.json?.saved?.id));
    const l2 = (await plans.list(L.cookie)).json?.plans || [];
    const fl = await plans.load(L.cookie, 'legacy-plan-1');
    log(l2.length === 2 && l2[0].title === '파일 저장' && Object.keys(l2[0]).join(',') === SUMMARY_KEYS && fl.status === 200 && fl.json?.plan?.title === '예전 일정', 'file store: list (newest first, same shape) and load work', short(l2.map((p) => p.title)));
    const FB = await login('google', { id: 'g-filebob-4004', name: 'FileBob' });
    const fbList = (await plans.list(FB.cookie)).json?.plans || [];
    const fbLoad = await plans.load(FB.cookie, 'legacy-plan-1');
    const fbDel = await plans.del(FB.cookie, 'legacy-plan-1');
    log(fbList.length === 0 && fbLoad.status === 404 && fbDel.json?.deleted === false, "file store: another user cannot list, load or delete the plans", short({ fbList, load: fbLoad.status, del: fbDel.json }));
    const fd = await plans.del(L.cookie, 'legacy-plan-1');
    log(fd.json?.deleted === true && !JSON.parse(fs.readFileSync(path.join(fileDir, 'saved_plans.json'), 'utf8')).some((p) => p.id === 'legacy-plan-1')
      && JSON.parse(fs.readFileSync(path.join(fileDir, 'saved_plans.json'), 'utf8')).some((p) => p.id === 'other-plan'), "file store: delete removes only the owner's plan", short(fd.json));
    const kaOff = await call('/api/keepalive');
    log(kaOff.json?.ok === true && kaOff.json?.supabase === 'off' && mock.count('supabase') === 0, 'keepalive without Supabase -> { ok: true, supabase: "off" } and no Supabase call', short(kaOff.json));
  } catch (e) { log(false, 'file store phase', e.stack || e.message); }
  checkNoSecrets('File store', OAUTH_SECRETS);
  checkNoUnexpectedExternal('File store');
  checkNoFatal('File store');

  // ── F. 로그인 허용 목록(ALLOWED_LOGINS): 목록 밖 계정은 sid를 받지 못하고, 목록을 바꾸면 예전 sid는 끊긴다 ──
  const allowDir = newDataDir('sessions-allowlist');
  mock.reset({ oauth: 'ok' });
  try {
    await startServer('login-allowlist', { ...oauthEnv, TABIMARU_DATA_DIR: allowDir, ALLOWED_LOGINS: ` ${UID_A.toUpperCase()} , Bob@Example.test, kakao:555, not-an-entry ` });
    const h = (await call('/api/health')).json || {};
    log(h.loginRestricted === true, 'ALLOWED_LOGINS set -> health loginRestricted true', short({ l: h.loginRestricted }));
    const oldB = await me(B && B.cookie);
    log(oldB === null, 'a sid issued before the allowlist was set (same SESSION_SECRET) is logged out', short(oldB));
    const fa = await login('google', ALICE);
    const fb = await login('google', BOB);
    const fk = await login('kakao', { id: '555', name: '허용 카카오', email: '', picture: '' });
    log(Boolean(fa.token) && (await me(fa.cookie))?.userId === UID_A && Boolean(fb.token) && (await me(fb.cookie))?.userId === UID_B && Boolean(fk.token),
      'allowed: by uid (case-insensitive), by provider-verified email (case-insensitive) and by kakao:<id>', short([fa.cb.headers.location, fb.cb.headers.location, fk.cb.headers.location]));
    const denied = [
      ['unlisted account', await login('google', { id: 'g-mallory-6006', name: 'Mallory', email: 'mallory@example.test', picture: '' })],
      ['listed email but not verified by Google', await login('google', { id: 'g-bob-copy-7007', name: 'Bob?', email: 'bob@example.test', emailVerified: false, picture: '' })],
      ['listed email on Naver (Naver email is not trusted)', await login('naver', { id: 'nv-bob', name: 'Bob N', email: 'bob@example.test', picture: '' })],
      ['listed email on Kakao but not verified', await login('kakao', { id: '777', name: 'K', email: 'bob@example.test', emailVerified: false, picture: '' })]
    ];
    const wrong = denied.filter(([, r]) => !(r.cb.status === 302 && r.cb.headers.location === '/?authError=not_allowed' && !r.token)).map(([n, r]) => `${n}: ${r.cb.headers.location}`);
    log(wrong.length === 0, `not allowed (${denied.length} cases: unlisted, unverified email, Naver email, unverified Kakao email) -> 302 /?authError=not_allowed and no sid cookie`, wrong.join(' | '));
    const users = fs.existsSync(path.join(allowDir, 'users.json')) ? JSON.parse(fs.readFileSync(path.join(allowDir, 'users.json'), 'utf8')) : [];
    log(users.length === 3 && !users.some((u) => /mallory|copy|nv-bob|777/.test(String(u.providerId))), 'rejected accounts are not recorded in users.json', short(users.map((u) => u.providerId)));
    const logs = serverLogs();
    log(/\[auth\] 허용 목록\(ALLOWED_LOGINS\)에 없는 google 계정의 로그인을 막았습니다/.test(logs) && /알아볼 수 없는 항목 1개/.test(logs) && !/mallory@example|bob@example/i.test(logs),
      'rejections and an unreadable allowlist entry are logged without account ids or emails');
  } catch (e) { log(false, 'login allowlist phase', e.stack || e.message); }
  checkNoSecrets('Login allowlist', OAUTH_SECRETS);
  checkNoUnexpectedExternal('Login allowlist');
  checkNoFatal('Login allowlist');

  // ── G. 약한 SESSION_SECRET은 쓰지 않는다(그 값으로 위조한 sid가 통하지 않음) ──
  for (const [label, weak] of [['short', 'changeme'], ['few distinct chars', 'ab'.repeat(24)]]) {
    const weakDir = newDataDir(`sessions-weak-${label.replace(/\W+/g, '-')}`);
    mock.reset({ oauth: 'ok' });
    try {
      await startServer(`weak-secret-${label}`, { ...oauthEnv, TABIMARU_DATA_DIR: weakDir, SESSION_SECRET: weak });
      const h = (await call('/api/health')).json || {};
      log(h.sessionSecretConfigured === false && h.sessionSecretWeak === true, `weak SESSION_SECRET (${label}) -> health sessionSecretConfigured false, sessionSecretWeak true`, short({ s: h.sessionSecretConfigured, w: h.sessionSecretWeak }));
      log(/\[session\] SESSION_SECRET이 너무 짧거나 단순해서 쓰지 않습니다/.test(serverLogs()) && !serverLogs().includes(weak), `weak SESSION_SECRET (${label}) is warned about in the log (value not logged)`);
      const forgedWeak = sessionToken(sessionPayload({ uid: UID_A }), weak);
      const fw = await me(`sid=${forgedWeak}`);
      const W = await login('google', ALICE);
      log(fw === null && Boolean(W.token) && (await me(W.cookie))?.userId === UID_A, `weak SESSION_SECRET (${label}): a sid forged with that value is rejected; normal login still works (random per-run key)`, short({ forged: fw }));
    } catch (e) { log(false, `weak secret phase (${label})`, e.stack || e.message); }
    checkNoFatal(`Weak secret (${label})`);
  }
  await stopServer();
}

// ── 1e. 재시작 뒤에도 로그인 화면 유지 + 저장소 장애 안내(app.js 샌드박스) ──
async function sandboxStorageTests(htmlCode, appCode, i18nDict) {
  section('Login survives a server wake-up, storage-unavailable messages (app.js sandbox)');
  const msg = { ko: (i18nDict.ko || {})['store-unavailable'], en: (i18nDict.en || {})['store-unavailable'], ja: (i18nDict.ja || {})['store-unavailable'] };
  log(msg.ko === '저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.' && typeof msg.en === 'string' && msg.en.length > 10 && typeof msg.ja === 'string' && !HANGUL_RE.test(msg.ja),
    "I18N 'store-unavailable' in ko/en/ja", short(msg));
  const USER = { userId: 'u_0123456789abcdef01234567', provider: 'google', nickname: 'Tester', profileImage: '' };
  const UNAVAILABLE = { status: 503, body: { error: '일정 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', reasonCode: 'PROVIDER_UNAVAILABLE' } };
  let meCalls = 0;
  let listCalls = 0;
  let saveCalls = 0;
  const sb = createBrowser({
    html: htmlCode,
    location: BASE + '/',
    fetchRoutes: sandboxRoutes({
      // 서버가 깨어나는 중(502) → 다시 물으면 로그인 사용자
      '/api/auth/me': () => { meCalls += 1; return meCalls === 1 ? { status: 502, body: { error: 'waking up' } } : { body: { user: USER } }; },
      '/api/my-plans/list': () => { listCalls += 1; return listCalls === 3 ? { body: { plans: [] } } : UNAVAILABLE; },
      '/api/my-plans/save': () => { saveCalls += 1; return UNAVAILABLE; },
      '/api/my-plans/load': UNAVAILABLE,
      '/api/my-plans/delete': UNAVAILABLE
    })
  });
  const J = (code) => { const s = sb.run(`JSON.stringify(${code})`); return s === undefined ? undefined : JSON.parse(String(s)); };
  const toast = () => String(sb.element('memoToast')?.textContent || '');
  try {
    await sb.boot(appCode, 'public/app.js');
    await sb.settle(10000);
    const auth = String(sb.element('authArea')?.innerHTML || '');
    log(meCalls === 2 && J('currentUser && currentUser.userId') === USER.userId && auth.includes('id="btnMyPlans"') && auth.includes('Tester') && !auth.includes('id="btnLogin"'),
      '/api/auth/me answering 502 once (server waking up) is retried -> logged-in UI (no false logout)', short({ meCalls, auth: auth.slice(0, 160) }));
    sb.run('loadMyPlansList()');
    await sb.settle(5000);
    log(String(sb.element('myPlansContent')?.innerHTML || '').includes(msg.ko), "my plans list 503 -> panel shows 'store-unavailable'", short(sb.element('myPlansContent')?.innerHTML));
    sb.run("loadPlanFromServer('plan-1')");
    await sb.settle(5000);
    log(toast() === msg.ko, "load 503 -> toast 'store-unavailable'", short(toast()));
    sb.run('el("memoToast").textContent = ""; var __c503 = confirm; confirm = function () { return true; };');
    sb.run("deletePlanFromServer('plan-1')");
    await sb.settle(5000);
    sb.run('confirm = __c503;');
    log(toast() === msg.ko, "delete 503 -> toast 'store-unavailable'", short(toast()));
    // 저장: 목록부터 503이면 저장 창을 닫고 알린다 → 목록이 되면 창이 열리고, 저장 503이면 알린다
    sb.run('el("memoToast").textContent = ""; currentItineraryData = { itinerary: [{ day: 1, date: "2026-11-20", blocks: ["오전(09:00-11:00): 센소지 (아사쿠사)"] }] };');
    sb.run('savePlanToServer()');
    await sb.settle(5000);
    log(toast() === msg.ko && sb.element('saveModal')?.classList.contains('hidden') && saveCalls === 0, "save: list 503 -> the save modal closes with 'store-unavailable' (no save call)", short({ toast: toast(), saveCalls }));
    sb.run('el("memoToast").textContent = ""; savePlanToServer()');
    await sb.settle(5000);
    const confirmBtn = sb.element('saveConfirmBtn');
    if (confirmBtn) confirmBtn.click();
    await sb.settle(5000);
    log(saveCalls === 1 && toast() === msg.ko, "save: POST /api/my-plans/save 503 -> toast 'store-unavailable' (not the generic save-fail)", short({ saveCalls, toast: toast() }));
    log(sb.env.errors.concat(sb.unhandled).length === 0, 'storage-unavailable flows raise no errors', short(sb.env.errors.concat(sb.unhandled), 400));
  } catch (e) { log(false, 'storage sandbox', e.stack || e.message); }

  // 저장소가 이유를 알려 준 저장 실패(개수 상한 409·크기 413·저장할 수 없는 글자 400) → 각 안내. 허용 목록 밖 로그인 → 안내.
  const keys = ['plan-limit', 'plan-too-large', 'plan-invalid', 'auth-err-not-allowed'];
  const missing = [];
  for (const lang of ['ko', 'en', 'ja']) for (const k of keys) { const v = (i18nDict[lang] || {})[k]; if (typeof v !== 'string' || !v.trim() || (lang === 'ja' && HANGUL_RE.test(v)) || (lang === 'en' && HANGUL_RE.test(v))) missing.push(`${lang}:${k}`); }
  log(missing.length === 0 && /\{n\}/.test(i18nDict.ko['plan-limit'] || '') && /\{n\}/.test(i18nDict.en['plan-limit'] || '') && /\{n\}/.test(i18nDict.ja['plan-limit'] || ''),
    "I18N ko/en/ja: 'plan-limit' ({n}), 'plan-too-large', 'plan-invalid', 'auth-err-not-allowed'", missing.join(', '));
  const FAILS = [
    { status: 409, body: { error: 'x', reasonCode: 'PLAN_LIMIT', limit: 50 }, expect: String((i18nDict.ko || {})['plan-limit'] || '').replace('{n}', '50') },
    { status: 413, body: { error: 'x', reasonCode: 'PLAN_TOO_LARGE' }, expect: (i18nDict.ko || {})['plan-too-large'] },
    { status: 400, body: { error: 'x', reasonCode: 'INVALID_PLAN' }, expect: (i18nDict.ko || {})['plan-invalid'] },
    { status: 500, body: { error: 'x' }, expect: (i18nDict.ko || {})['save-fail'] }
  ];
  let failIdx = 0;
  const sb2 = createBrowser({
    html: htmlCode,
    location: BASE + '/?authError=not_allowed',
    fetchRoutes: sandboxRoutes({
      '/api/auth/me': { body: { user: USER } },
      '/api/my-plans/list': { body: { plans: [] } },
      '/api/my-plans/save': () => FAILS[failIdx] || { body: { saved: {} } }
    })
  });
  const toast2 = () => String(sb2.element('memoToast')?.textContent || '');
  try {
    await sb2.boot(appCode, 'public/app.js');
    await sb2.settle(10000);
    log(toast2() === (i18nDict.ko || {})['auth-err-not-allowed'], "/?authError=not_allowed -> toast 'auth-err-not-allowed'", short(toast2()));
    const got = [];
    for (failIdx = 0; failIdx < FAILS.length; failIdx++) {
      sb2.run('el("memoToast").textContent = ""; currentItineraryData = { itinerary: [{ day: 1, date: "2026-11-20", blocks: ["오전(09:00-11:00): 센소지 (아사쿠사)"] }] }; savePlanToServer()');
      await sb2.settle(5000);
      const btn = sb2.element('saveConfirmBtn');
      if (btn) btn.click();
      await sb2.settle(5000);
      got.push([FAILS[failIdx].status, toast2() === FAILS[failIdx].expect, toast2()]);
    }
    log(got.length === FAILS.length && got.every((g) => g[1]), 'save failures: 409 PLAN_LIMIT / 413 PLAN_TOO_LARGE / 400 INVALID_PLAN show their own message (n = 50), other errors the generic save-fail', short(got, 400));
    log(sb2.env.errors.concat(sb2.unhandled).length === 0, 'save-failure / not-allowed flows raise no errors', short(sb2.env.errors.concat(sb2.unhandled), 400));
  } catch (e) { log(false, 'save failure sandbox', e.stack || e.message); }
}

// ── 의도 회귀 표·AI 일정 단계 공용 ──
// 요청마다 다른 X-Forwarded-For(TRUST_PROXY=1)를 붙여 IP당 분당 60회 한도에 걸리지 않게 한다.
let intentIpSeq = 0;
function nextIntentIp() {
  intentIpSeq += 1;
  return `198.19.${Math.floor(intentIpSeq / 250) % 250}.${(intentIpSeq % 250) + 1}`;
}

function localIsoDate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const USJ = '유니버셜 스튜디오 재팬';

// 감사 ID별 프롬프트와 기대값(SV-04: Gemini가 한도로 실패할 때 실제로 쓰이는 규칙 해석기).
// 기대값 키: days · md('MM-DD' 또는 목록, 연도는 올해/내년이고 오늘 이후) · month · keepStart(폼 출발일 유지) · city · theme · notTheme · budget
//           · prefs(참이어야 하는 조건) · maxPlaces · wanted(모두 포함) · noWanted(정규식) · excluded · unsupported(정확히 같은 목록)
//           · route(모두 포함) · food(정규식) · arrival · departure · startTime
// ai_live = 실제 Gemini로 돌린 P01-P16·X1-X3, ai_code = 코드 검수 P01-P19(probe1 P01-P16 + 날짜 경계 P17-P19), SV-04 = 정규식 보정 표.
const INTENT_CASES = [
  ['ai_live P01', '오사카 3박 4일, 유니버설 스튜디오는 하루 통째로, 도톤보리는 저녁에 꼭 가고 싶어', {}, { city: 'osaka', days: 4, keepStart: true, wanted: [USJ, '도톤보리'], unsupported: [] }],
  ['ai_live P02', '도쿄 2박3일 부모님 모시고 가요. 많이 안 걷고 여유롭게, 하루 2~3곳만', {}, { city: 'tokyo', days: 3, prefs: ['relaxedPace', 'lowWalking'], maxPlaces: 3 }],
  ['ai_live P03', '교토 2일, 사찰이랑 정원 위주로. 쇼핑은 빼줘', {}, { city: 'kyoto', days: 2, theme: 'culture', prefs: ['removeShopping'], unsupported: [] }],
  ['ai_live P04', '후쿠오카 1박2일 먹방 여행, 라멘이랑 모츠나베는 꼭 먹고 싶어', {}, { city: 'fukuoka', days: 2, theme: 'foodie', food: /라멘.*모츠나베|모츠나베.*라멘/, noWanted: /라멘|모츠나베/ }],
  ['ai_live P05', '삿포로 4일 겨울 여행인데 오타루 당일치기를 하루 넣어줘', {}, { city: 'sapporo', days: 4, wanted: ['오타루 운하'] }],
  ['ai_live P06', '도쿄 5일 애니·서브컬처 위주로, 아키하바라 이케부쿠로 나카노는 꼭', {}, { city: 'tokyo', days: 5, wanted: ['아키하바라', '이케부쿠로', '나카노'], unsupported: [] }],
  ['ai_live P07', '5살, 8살 아이 둘 데리고 오키나와 4일, 츄라우미 수족관은 필수', {}, { city: 'okinawa', days: 4, prefs: ['kidsFriendly'], wanted: ['츄라우미 수족관'] }],
  ['ai_live P08', '오사카 3일 교토 2일 나라 1일로 짜줘', {}, { city: 'osaka', days: 6, route: ['오사카', '교토'], unsupported: ['나라'], wanted: ['나라 공원·도다이지'] }],
  ['ai_live P09', '도쿄 3일인데 비가 많이 올 것 같아서 실내 위주로', {}, { city: 'tokyo', days: 3, prefs: ['indoorFocus'] }],
  ['ai_live P10', '오사카 3박4일, 첫날은 밤 9시 도착이라 일정 비워주고 마지막 날은 오전 비행기야', {}, { city: 'osaka', days: 4, arrival: '21:00', departure: '11:00', prefs: ['firstDayShort'] }],
  ['ai_live P11', 'Tokyo 3 days, first time in Japan, classic highlights, I love sushi', { lang: 'en' }, { city: 'tokyo', days: 3, food: /스시|sushi/i }],
  ['ai_live P12', '京都で2日間、紅葉の名所を回りたい', { lang: 'ja' }, { city: 'kyoto', days: 2 }],
  ['ai_live P13', '도쿄', {}, { city: 'tokyo', days: 4, keepStart: true }],
  ['ai_live P14', '도쿄 3일, 디즈니랜드는 빼고 아침 10시 이후에 시작하고 싶어', {}, { city: 'tokyo', days: 3, excluded: ['도쿄 디즈니랜드'], noWanted: /디즈니/, startTime: '10:00', prefs: ['lateStart'] }],
  ['ai_live P15', '하코네 1박2일 온천 료칸, 이동은 최소로', {}, { city: 'tokyo', days: 2, theme: 'nature', wanted: ['하코네'], prefs: ['minimizeTravelTime'] }],
  ['ai_live P16', '오사카 3박4일 저예산, 무료 명소 위주로 1인 50만원', {}, { city: 'osaka', days: 4, budget: 'low', notTheme: 'nature' }],
  ['ai_live X1', '12월 24일부터 도쿄 3일, 크리스마스 일루미네이션 보고 싶어', {}, { city: 'tokyo', days: 3, md: '12-24' }],
  ['ai_live X2', '오사카 4일, 유니버셜 스튜디오 하루 종일, 도톤보리 저녁', {}, { city: 'osaka', days: 4, wanted: [USJ, '도톤보리'] }],
  ['ai_live X3', '京都 2泊3日 お寺めぐり', { lang: 'ja' }, { city: 'kyoto', days: 3, theme: 'culture' }],
  ['ai_code P01', '11월 20일부터 3박 4일 오사카 여행, 유니버셜 스튜디오 꼭 가고 싶어', {}, { city: 'osaka', days: 4, md: '11-20', wanted: [USJ] }],
  ['ai_code P02', '10월 15일 출발 도쿄 4일', {}, { city: 'tokyo', days: 4, md: '10-15' }],
  ['ai_code P03', '12/24 도쿄 2박3일 디즈니랜드 하루 종일', {}, { city: 'tokyo', days: 3, md: '12-24', wanted: ['도쿄 디즈니랜드'] }],
  ['ai_code P04', '오사카 2박 교토 1박 일정 짜줘, 도톤보리랑 후시미 이나리 꼭', {}, { city: 'osaka', days: 4, route: ['오사카', '교토'], wanted: ['도톤보리', '후시미 이나리'] }],
  ['ai_code P05', '후쿠오카 3일, 쇼핑 빼고 실내 위주로, 아침 늦게 시작', {}, { city: 'fukuoka', days: 3, notTheme: 'shopping', prefs: ['removeShopping', 'indoorFocus', 'lateStart'] }],
  ['ai_code P06', '삿포로 5일 여행인데 오타루 당일치기 넣어줘', {}, { city: 'sapporo', days: 5, wanted: ['오타루 운하'] }],
  ['ai_code P07', '부모님이랑 도쿄 3일, 많이 걷지 않게, 하루 2개만', {}, { city: 'tokyo', days: 3, maxPlaces: 2, prefs: ['lowWalking'] }],
  ['ai_code P08', 'Tokyo 3 days, teamLab Planets and Shibuya Sky, no shopping', { lang: 'en' }, { city: 'tokyo', days: 3, notTheme: 'shopping', prefs: ['removeShopping'], wanted: ['시부야 스카이'] }],
  ['ai_code P09', '오키나와 4일 츄라우미 수족관 하루 다 쓰고 싶어', {}, { city: 'okinawa', days: 4, wanted: ['츄라우미 수족관'] }],
  ['ai_code P10', '교토 2일 기온 근처 숙소, 가성비로', {}, { city: 'kyoto', days: 2, budget: 'low' }],
  ['ai_code P11', '나고야 2박 3일 히츠마부시 먹고 싶어', {}, { city: 'nagoya', days: 3, food: /히츠마부시/ }],
  ['ai_code P12', '도쿄 3일 근데 첫날은 저녁 7시 도착이야', {}, { city: 'tokyo', days: 3, arrival: '19:00', prefs: ['firstDayShort'] }],
  ['ai_code P13', '오사카 4일, 마지막 날 오후 3시 비행기', {}, { city: 'osaka', days: 4, departure: '15:00' }],
  ['ai_code P14', '도쿄 5일 중 하루는 하코네 온천 당일치기', {}, { city: 'tokyo', days: 5, wanted: ['하코네'] }],
  ['ai_code P15', '3월 말 교토 벚꽃 여행 3일', {}, { city: 'kyoto', days: 3, month: '03' }],
  ['ai_code P16', '도쿄 10일 여행', {}, { city: 'tokyo', days: 10 }],
  ['ai_code P17', '도쿄 3-4일 정도 여행', {}, { city: 'tokyo', days: 4, keepStart: true }],
  ['ai_code P18', '크리스마스에 도쿄 3일', {}, { city: 'tokyo', days: 3, md: ['12-24', '12-25'] }],
  ['ai_code P19', 'Osaka 4 days from Nov 20, must see Universal Studios', { lang: 'en' }, { city: 'osaka', days: 4, md: '11-20', wanted: [USJ] }],
  ['SV-04 day-number', '2일차에 유니버셜 넣어줘', { city: 'osaka' }, { city: 'osaka', days: 4, keepStart: true, wanted: [USJ] }],
  ['SV-04 neg-shopping', '쇼핑은 빼고 하루 2곳만', {}, { days: 4, notTheme: 'shopping', prefs: ['removeShopping'], maxPlaces: 2 }],
  ['SV-04 en-no-shopping', 'Tokyo 3 days, no shopping', { lang: 'en' }, { city: 'tokyo', days: 3, notTheme: 'shopping', prefs: ['removeShopping'] }],
  ['SV-04 budget-not-nature', '저예산 오사카 3일', {}, { city: 'osaka', days: 3, budget: 'low', notTheme: 'nature' }],
  ['SV-04 walk-focus', '교토 산책 위주 2일', {}, { city: 'kyoto', days: 2, notTheme: 'nature', unsupported: [] }],
  ['SV-04 ja-days', '札幌に3日間', { lang: 'ja' }, { city: 'sapporo', days: 3 }],
  ['SV-04 en-date', 'Oct 15 Tokyo 3 days', { lang: 'en' }, { city: 'tokyo', days: 3, md: '10-15' }],
  ['SV-04 one-char-false-hit', '우리나라 사람이 좋아하는 도쿄 3일', {}, { city: 'tokyo', days: 3, noWanted: /나라/, unsupported: [] }],
  ['SV-04 shopping-theme', '신사이바시 쇼핑 오사카 2일', {}, { city: 'osaka', days: 2, theme: 'shopping' }],
  ['SV-04 week', '도쿄 일주일', {}, { city: 'tokyo', days: 7 }],
  ['SV-04 slash-date', '1/5 출발 삿포로 3일', {}, { city: 'sapporo', days: 3, md: '01-05' }],
  ['SV-04 ja-alias', '大阪 3日間、ユニバーサル・スタジオに行きたい', { lang: 'ja' }, { city: 'osaka', days: 3, wanted: [USJ] }],
  ['SV-04 alias-spelling', '유니버설 스튜디오 가고 싶어', {}, { city: 'osaka', wanted: [USJ] }],
  ['SV-04 ja-nights', '京都 2泊3日', { lang: 'ja' }, { city: 'kyoto', days: 3 }],
  ['SV-04 excluded-landmark', '도쿄 3일, 디즈니랜드는 빼고', {}, { city: 'tokyo', days: 3, excluded: ['도쿄 디즈니랜드'], noWanted: /디즈니/ }],
  ['SV-04 theme-word-days', '교토 벚꽃 3일', {}, { city: 'kyoto', days: 3, unsupported: [] }],
  ['SV-04 foodie-days', '도쿄 맛집 투어 3일', {}, { city: 'tokyo', days: 3, theme: 'foodie', unsupported: [] }],
  ['SV-04 unknown-region', '오사카 3일 고야산 1일', {}, { city: 'osaka', days: 4, unsupported: ['고야산'] }],
  ['SV-04 two-cities', '도쿄 3일 오사카 2일', {}, { city: 'tokyo', days: 5, route: ['도쿄', '오사카'], unsupported: [] }],
  ['SV-04 focus-word-days', '오사카 쇼핑 위주 2일', {}, { city: 'osaka', days: 2, theme: 'shopping', unsupported: [] }],
  // 2026-10-01 점검(여러 프롬프트): 'A랑 B는 빼고' 목록 부정, 음식·시간 낱말이 장소가 되지 않음, 영어/일본어 must·skip·시작 시각
  ['S2 N01 list-negation', '11월 20일부터 교토 3일, 기요미즈데라랑 쇼핑은 빼고 후시미 이나리는 꼭 가고, 하루 2곳만 여유롭게, 아침 11시 이후 시작', {}, { city: 'kyoto', days: 3, md: '11-20', wanted: ['후시미 이나리'], excluded: ['기요미즈데라'], noWanted: /기요미즈|쇼핑/, prefs: ['removeShopping', 'lateStart'], maxPlaces: 2, startTime: '11:00' }],
  ['S2 A01 two-excluded', '도쿄 3일, 디즈니랜드랑 디즈니씨는 빼고 시부야 스카이는 꼭', {}, { city: 'tokyo', days: 3, wanted: ['시부야 스카이'], excluded: ['도쿄 디즈니랜드', '도쿄 디즈니씨'], noWanted: /디즈니/ }],
  ['S2 N04 comma-excluded', '교토 3일, 금각사, 기요미즈데라는 빼고 은각사는 꼭', {}, { city: 'kyoto', days: 3, wanted: ['은각사'], excluded: ['금각사', '기요미즈데라'], noWanted: /금각사|기요미즈/ }],
  ['S2 N02 food-not-place', '오사카 2박3일, 유니버설은 말고 나라 당일치기 하루 넣어주고 마지막 날은 오후 3시 비행기야. 저녁엔 꼭 오코노미야키', {}, { city: 'osaka', days: 3, wanted: ['나라 공원·도다이지'], excluded: [USJ], noWanted: /저녁|오코노미야키|유니버/, food: /오코노미야키/, departure: '15:00' }],
  ['S2 P16 money-not-place', '오사카 3박4일 저예산, 무료 명소 위주로 1인 50만원', {}, { city: 'osaka', days: 4, budget: 'low', prefs: ['lowBudget'], noWanted: /명소|만원|1인/, unsupported: [] }],
  ['S2 E01 en skip/must/start', 'Kyoto 3 days, skip Kiyomizu-dera, must see Fushimi Inari, start at 11am', { lang: 'en' }, { city: 'kyoto', days: 3, wanted: ['후시미 이나리'], excluded: ['기요미즈데라'], startTime: '11:00' }],
  ['S2 A04 en must visit', 'Tokyo 2 days, no Disney, must visit teamLab Planets, start at 11am', { lang: 'en' }, { city: 'tokyo', days: 2, wanted: ['팀랩 플래닛'], noWanted: /디즈니/, startTime: '11:00' }],
  ['S2 J01 ja must/none', '大阪3日間、海遊館は必ず行きたい、USJはなし', { lang: 'ja' }, { city: 'osaka', days: 3, wanted: ['가이유칸'], excluded: [USJ] }],
  ['S2 en skip mall', 'Tokyo 3 days, skip Ginza Six', { lang: 'en' }, { city: 'tokyo', days: 3, excluded: ['긴자 식스'], noWanted: /긴자/ }],
  // 2026-10-02 전국 점검: 일본어·영어 도시 이름, 한국어 표기 변형, 더 긴 이름 우선(부분 일치 충돌), 공항 없는 곳의 짧은 이름, 도시 주변 실제 명소의 도시
  ['C01 ja city', '函館で2日間', { lang: 'ja' }, { city: 'hakodate', days: 2 }],
  ['C02 ja city', '鹿児島で3日間', { lang: 'ja' }, { city: 'kagoshima', days: 3 }],
  ['C03 en longest', 'Kitakyushu 2 days', { lang: 'en' }, { city: 'kitakyushu', days: 2 }],
  ['C04 ja longest', '北九州で2日間', { lang: 'ja' }, { city: 'kitakyushu', days: 2 }],
  ['C05 ko longest', '기타다이토 2일', {}, { city: 'kita_daito', days: 2, noWanted: /이토/, unsupported: [] }],
  ['C06 ko longest', '삿포로 오카다마 2일', {}, { city: 'okadama', days: 2 }],
  ['C07 en underscore key', 'Nanki-Shirahama 2 days', { lang: 'en' }, { city: 'nanki_shirahama', days: 2 }],
  ['C08 ko spelling', '카나자와 2일', {}, { city: 'kanazawa', days: 2 }],
  ['C09 ko spelling', '다카마츠 2일', {}, { city: 'takamatsu', days: 2 }],
  ['C10 other name', '나하 3일', {}, { city: 'okinawa', days: 3 }],
  ['C11 ja short name', '高山で2日間', { lang: 'ja' }, { city: 'nagoya', days: 2, wanted: ['다카야마 산마치'], unsupported: [] }],
  ['C12 en short name', 'Ise 2 days', { lang: 'en' }, { city: 'nagoya', days: 2, wanted: ['이세 신궁'] }],
  ['C13 not a short name', '도쿄 2일, 이세탄 쇼핑', {}, { city: 'tokyo', days: 2, noWanted: /이세 신궁/ }],
  ['C14 locality day trip', '하코네에서 2일', {}, { city: 'tokyo', days: 2, wanted: ['하코네'] }],
  ['C15 nearby place city', '다케토미섬 2일', {}, { city: 'ishigaki', days: 2, wanted: ['다케토미섬'], unsupported: [] }],
  ['C16 nearby place city en', 'Hashima Island 2 days', { lang: 'en' }, { city: 'nagasaki', days: 2, wanted: ['나가사키 하시마섬'] }],
  ['C17 famous name not elsewhere', 'Hiroshima 2 days, must see Itsukushima Shrine', { lang: 'en' }, { city: 'hiroshima', days: 2, wanted: ['이쓰쿠시마 신사'], noWanted: /구시로/ }],
  ['C18 ja famous name', '厳島神社に行きたい 2日間', { lang: 'ja' }, { city: 'hiroshima', days: 2, wanted: ['이쓰쿠시마 신사'], noWanted: /구시로/ }],
  ['C19 food word not a place', 'Tokyo 3 days, I want to eat toro sushi', { lang: 'en' }, { city: 'tokyo', days: 3, noWanted: /토로|toro/i }],
  ['C20 famous temple', 'Kyoto 2 days Kiyomizu-dera Temple', { lang: 'en' }, { city: 'kyoto', days: 2, wanted: ['기요미즈데라'], noWanted: /하나마키/ }],
  ['C21 city word inside a place', 'Matsumoto Seicho Memorial Museum 2 days', { lang: 'en' }, { city: 'kitakyushu', days: 2 }],
  ['C22 one card for the island', '미야지마 2일', {}, { city: 'hiroshima', days: 2, wanted: ['이쓰쿠시마 신사'], noWanted: /^미야지마$/ }],
  ['C23 spelling variant must', '카미코치 2일', {}, { city: 'matsumoto', days: 2, wanted: ['가미코치'] }]
];

function intentMismatches(p, exp, ctx) {
  const out = [];
  const sp = p.specialPrefs || {};
  const has = (list, name) => Array.isArray(list) && list.includes(name);
  if (exp.city && p.cityKey !== exp.city) out.push(`cityKey=${p.cityKey} (want ${exp.city})`);
  if (exp.days !== undefined && p.days !== exp.days) out.push(`days=${p.days} (want ${exp.days})`);
  const start = String(p.startDate || '');
  if (exp.md || exp.month) {
    const mds = [].concat(exp.md || []);
    const y = Number(start.slice(0, 4));
    const thisYear = new Date().getFullYear();
    if (mds.length && !mds.includes(start.slice(5))) out.push(`startDate=${start} (want ${mds.join('|')})`);
    if (exp.month && start.slice(5, 7) !== exp.month) out.push(`startDate=${start} (want month ${exp.month})`);
    if (!(y === thisYear || y === thisYear + 1) || start < localIsoDate()) out.push(`startDate=${start} (want this or next year, not past)`);
  }
  if (exp.keepStart && start !== ctx.startDate) out.push(`startDate=${start} (want form date ${ctx.startDate})`);
  if (exp.theme && p.theme !== exp.theme) out.push(`theme=${p.theme} (want ${exp.theme})`);
  if (exp.notTheme && p.theme === exp.notTheme) out.push(`theme=${p.theme} (must not be ${exp.notTheme})`);
  if (exp.budget && p.budget !== exp.budget) out.push(`budget=${p.budget} (want ${exp.budget})`);
  for (const f of exp.prefs || []) if (sp[f] !== true) out.push(`specialPrefs.${f}=${sp[f]} (want true)`);
  if (exp.maxPlaces !== undefined && sp.maxPlacesPerDay !== exp.maxPlaces) out.push(`maxPlacesPerDay=${sp.maxPlacesPerDay} (want ${exp.maxPlaces})`);
  for (const w of exp.wanted || []) if (!has(p.wantedPlaces, w)) out.push(`wantedPlaces=${short(p.wantedPlaces, 120)} (missing ${w})`);
  if (exp.noWanted && (p.wantedPlaces || []).some((w) => exp.noWanted.test(w))) out.push(`wantedPlaces=${short(p.wantedPlaces, 120)} (must not match ${exp.noWanted})`);
  for (const x of exp.excluded || []) if (!has(p.excludedPlaces, x)) out.push(`excludedPlaces=${short(p.excludedPlaces, 120)} (missing ${x})`);
  if (exp.unsupported && JSON.stringify(p.unsupportedPlaces || []) !== JSON.stringify(exp.unsupported)) out.push(`unsupportedPlaces=${short(p.unsupportedPlaces)} (want ${short(exp.unsupported)})`);
  for (const c of exp.route || []) if (!has(p.routeCities, c)) out.push(`routeCities=${short(p.routeCities)} (missing ${c})`);
  if (exp.food && !exp.food.test(String(p.foodKeyword || ''))) out.push(`foodKeyword=${p.foodKeyword} (want ${exp.food})`);
  if (exp.arrival !== undefined && p.arrivalTime !== exp.arrival) out.push(`arrivalTime=${p.arrivalTime} (want ${exp.arrival})`);
  if (exp.departure !== undefined && p.departureTime !== exp.departure) out.push(`departureTime=${p.departureTime} (want ${exp.departure})`);
  if (exp.startTime !== undefined && p.startTimeMin !== exp.startTime) out.push(`startTimeMin=${p.startTimeMin} (want ${exp.startTime})`);
  return out;
}

// en/ja 답변(SV-06): 한국어가 남는다면 데이터에 있는 장소·도시 이름(현지화 표가 없는 사용자 표기)뿐이어야 한다.
function hangulOutsidePlaceNames(text, parsed) {
  let rest = String(text || '');
  const names = [...(parsed.wantedPlaces || []), ...(parsed.excludedPlaces || []), ...(parsed.unsupportedPlaces || []), ...(parsed.routeCities || []), parsed.cityLabel || '',
    ...String(parsed.foodKeyword || '').split(/\s*,\s*/)].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const n of names) rest = rest.split(n).join('');
  return (rest.match(/[가-힣][가-힣\s·]*/g) || []).map((s) => s.trim()).filter(Boolean);
}

// ── Phase 8: 의도 회귀 표 — 규칙 해석(25건+), Gemini 해석 정규화, 답변 언어, 후속 대화 (TD-02) ──
async function phaseIntentRegression() {
  section('Intent regression (chat parsing: rule table, Gemini normalization, reply language, follow-up)');
  const GEM = 'GEMKEY-intent-test-5d21aa';
  mock.reset({ gemini: 'error400' });
  try {
    await startServer('intent', { GEMINI_API_KEY: GEM, TRUST_PROXY: '1' });
  } catch (e) { log(false, 'Server (intent regression) started', e.message); return; }
  const ctxStart = futureDate(10);
  const chat = (message, opts = {}) => postJson('/api/ai-travel-chat', {
    message,
    context: { city: opts.city || 'tokyo', theme: 'mixed', budget: 'mid', days: opts.days || 4, startDate: ctxStart },
    lang: opts.lang || 'ko',
    ...(opts.body || {})
  }, { ip: nextIntentIp() });
  const BLOCK_DONE = { ko: '일정을 만드는 중이에요', en: 'Building your itinerary', ja: '日程を作成しています' };
  try {
    // (1) 규칙 경로: 가짜 Gemini가 400으로 거절 → 규칙 해석기. 감사 ID마다 한 줄.
    for (const [id, prompt, opts, exp] of INTENT_CASES) {
      const r = await chat(prompt, opts);
      const p = r.json?.parsed || {};
      const bad = r.status !== 200 ? [`HTTP ${r.status}`] : intentMismatches(p, exp, { startDate: ctxStart });
      if (r.json?.sourceInfo?.kind !== 'rule') bad.push(`sourceInfo=${short(r.json?.sourceInfo)} (want rule)`);
      const lang = opts.lang || 'ko';
      const reply = String(r.json?.reply || '');
      if (!reply.includes(BLOCK_DONE[lang])) bad.push(`reply not in ${lang}: ${short(reply, 80)}`);
      if (lang !== 'ko') {
        const leftover = hangulOutsidePlaceNames(reply + '\n' + (p.reasons || []).join('\n'), p);
        if (leftover.length) bad.push(`${lang} reply/reasons have Korean outside place names: ${leftover.slice(0, 3).join(' / ')}`);
      }
      log(bad.length === 0, `${id} ${prompt}`, bad.join('; '));
    }
    const ruleGem = mock.entries('gemini');
    log(ruleGem.length > 0 && ruleGem.every((e) => !e.isItinerary && e.body?.generationConfig?.responseSchema?.properties?.cityKey),
      'rule table: every chat call first tried Gemini with the chat responseSchema (refused with 400 -> rule parser)', `${ruleGem.length} calls`);

    // (3) 답변 언어: 한국어로 쓴 요청도 en/ja 화면이면 그 언어로, 알려진 장소 이름은 현지화
    const en = await chat('도쿄 3일, 디즈니랜드는 빼고', { lang: 'en' });
    const enReply = String(en.json?.reply || '');
    log(/Excluded: Tokyo Disneyland/.test(enReply) && hangulOutsidePlaceNames(enReply, {}).length === 0,
      "reply language en: Korean request -> English reply with 'Excluded: Tokyo Disneyland' and no Korean", short(enReply, 300));
    const ja = await chat('오사카 3일, 유니버셜은 꼭', { lang: 'ja' });
    const jaReply = String(ja.json?.reply || '');
    log(/ユニバーサル・スタジオ・ジャパン/.test(jaReply) && !HANGUL_RE.test(jaReply), 'reply language ja: Korean request -> Japanese reply, USJ in Japanese, no Korean', short(jaReply, 300));
    const ko = await chat('오사카 3일 교토 2일 나라 1일로 짜줘');
    const koReply = String(ko.json?.reply || '');
    log(/꼭 갈 곳/.test(koReply) && /나라/.test(koReply) && /전체 6일은 그대로/.test(koReply) && /지역별 일정 분배/.test(koReply),
      'reply ko: confirms must-visit, the Nara day-trip substitute, total 6 days and the per-city split', short(koReply, 300));
    log(/나라는 아직 도시 데이터가 없어/.test(koReply) && !/은\(는\)/.test(koReply), "reply ko uses the right topic particle ('나라는', not '나라은(는)')", short(koReply, 300));
    const hakone = String((await chat('하코네 1박2일 온천 료칸, 이동은 최소로')).json?.reply || '');
    log(!/하코네은\(는\)/.test(hakone) && (!/하코네/.test(hakone) || !/은\(는\)/.test(hakone)), "reply ko: no '은(는)' after a Hangul place name (하코네는)", short(hakone, 300));

    // (4) 후속 대화(규칙 경로): 이전 해석 + 대화 기록 + '교토 하루 더 늘려줘' → 오사카 유지, 교토 +1, 이전 조건 유지
    const prev = {
      cityKey: 'osaka', cityLabel: '오사카', days: 4, theme: 'mixed', startDate: futureDate(10), routeCities: ['오사카', '교토'],
      regionDayPlan: [{ cityLabel: '오사카', days: 2, unit: 'day' }, { cityLabel: '교토', days: 2, unit: 'day' }],
      specialPrefs: { lateStart: true }, wantedPlaces: [USJ]
    };
    const history = [{ role: 'user', content: '오사카 2일 교토 2일, 유니버셜은 꼭, 아침은 늦게' }, { role: 'assistant', content: '오사카 4일 여행으로 맞췄어요.' }];
    const followUpOk = (p) => {
      const kyoto = (p.regionDayPlan || []).find((x) => x.cityLabel === '교토');
      const osaka = (p.regionDayPlan || []).find((x) => x.cityLabel === '오사카');
      return p.cityKey === 'osaka' && (p.routeCities || []).includes('오사카') && (p.routeCities || []).includes('교토') && !(p.routeCities || []).includes('도쿄')
        && kyoto?.days === 3 && osaka?.days === 2 && p.days === 5 && p.specialPrefs?.lateStart === true && (p.wantedPlaces || []).includes(USJ);
    };
    const f1 = await chat('교토 하루 더 늘려줘', { body: { history, prevParsed: prev } });
    log(followUpOk(f1.json?.parsed || {}) && f1.json?.parsed?.isFollowUp === true,
      "follow-up (rule): history + prevParsed + '교토 하루 더 늘려줘' -> 오사카 kept, 교토 2->3, total 5, lateStart and USJ kept", short(f1.json?.parsed, 500));
    // 도시 이름 없는 전체 일수 증감: '이틀 더 늘려줘'는 일수 2가 아니라 +2. 일수를 말하지 않은 후속 대화는 이전 일수를 지킨다.
    const prevO3 = { cityKey: 'osaka', cityLabel: '오사카', days: 3, theme: 'mixed', startDate: futureDate(10), routeCities: ['오사카'], regionDayPlan: [{ cityLabel: '오사카', days: 3, unit: 'day' }], wantedPlaces: ['도톤보리'] };
    const histO3 = [{ role: 'user', content: '오사카 3일, 도톤보리 꼭' }, { role: 'assistant', content: '오사카 3일 여행으로 맞췄어요.' }];
    const dPlus2 = (await chat('이틀 더 늘려줘', { city: 'osaka', days: 3, body: { history: histO3, prevParsed: prevO3 } })).json?.parsed || {};
    const dPlus1En = (await chat('add one more day', { city: 'osaka', days: 3, lang: 'en', body: { history: histO3, prevParsed: prevO3 } })).json?.parsed || {};
    const dMinus1 = (await chat('하루 줄여줘', { city: 'osaka', days: 3, body: { history: histO3, prevParsed: prevO3 } })).json?.parsed || {};
    const dKeep = (await chat('첫날은 오후 3시 도착이야', { city: 'osaka', days: 3, body: { history: histO3, prevParsed: prevO3 } })).json?.parsed || {};
    log(dPlus2.days === 5 && dPlus1En.days === 4 && dMinus1.days === 2 && dKeep.days === 3 && dKeep.arrivalTime === '15:00'
      && [dPlus2, dPlus1En, dMinus1, dKeep].every((p) => p.cityKey === 'osaka' && (p.wantedPlaces || []).includes('도톤보리')),
      "follow-up (rule) whole-trip day delta: '이틀 더 늘려줘' 3->5, 'add one more day' 3->4, '하루 줄여줘' 3->2, no day words keeps 3 (city and must-visit kept)",
      short({ plus2: dPlus2.days, plus1: dPlus1En.days, minus1: dMinus1.days, keep: [dKeep.days, dKeep.arrivalTime] }));

    // (2) Gemini 해석 정규화(SV-05)
    mock.reset({ gemini: 'chat_ok' });
    const ok = await chat('11월에 오사카 4일, 유니버셜 스튜디오는 꼭 가고 싶어');
    const okGem = mock.entries('gemini').filter((e) => !e.isItinerary).pop() || {};
    const okGc = okGem.body?.generationConfig || {};
    log(ok.json?.sourceInfo?.kind === 'ai' && ok.json?.sourceInfo?.provider === 'gemini' && ok.json?.parsed?.cityKey === 'osaka' && ok.json?.parsed?.days === 4
      && (ok.json?.parsed?.wantedPlaces || []).includes(USJ),
      "Gemini 'chat_ok' -> sourceInfo { kind: ai, provider: gemini } with the AI values (osaka, 4 days, USJ)", short({ si: ok.json?.sourceInfo, p: ok.json?.parsed }, 400));
    log((okGc.responseSchema?.properties?.cityKey?.enum || []).includes('osaka') && Number(okGc.maxOutputTokens) === 2048 && !okGc.responseSchema?.properties?.itinerary
      && [localIsoDate(), new Date().toISOString().slice(0, 10)].some((d) => String(okGem.prompt || '').includes(`Today is ${d}`)),
      'chat Gemini request: responseSchema (cityKey enum, no itinerary), maxOutputTokens 2048, prompt states today', short(okGc, 200));
    log(!Object.keys(ok.json?.parsed || {}).some((k) => k.startsWith('_')), 'chat response parsed has no internal _fields');
    mock.reset({ gemini: 'ok' });
    const empty = await chat('도쿄 3일');
    log(empty.json?.sourceInfo?.kind === 'rule' && empty.json?.sourceInfo?.reasonCode === 'AI_INVALID_OUTPUT' && empty.json?.parsed?.days === 3,
      "Gemini '{}' (no usable field) -> honest sourceInfo { kind: rule, reasonCode: AI_INVALID_OUTPUT }, rule values used", short(empty.json?.sourceInfo));
    mock.reset({ gemini: 'chat_shopping_neg' });
    const neg = await chat('도쿄 3일, 쇼핑은 빼줘');
    log(neg.json?.parsed?.theme !== 'shopping' && neg.json?.parsed?.specialPrefs?.removeShopping === true && neg.json?.sourceInfo?.kind === 'ai',
      "Gemini theme 'shopping' for '쇼핑은 빼줘' is rejected (theme != shopping, removeShopping true)", short({ theme: neg.json?.parsed?.theme, sp: neg.json?.parsed?.specialPrefs }));
    mock.reset({ gemini: 'chat_sapporo' });
    const sap = await chat('札幌に3日間', { city: 'osaka', lang: 'ja' });
    log(sap.json?.parsed?.cityKey === 'sapporo' && sap.json?.parsed?.days === 3 && !(sap.json?.parsed?.routeCities || []).includes('오사카') && !HANGUL_RE.test(String(sap.json?.reply || '')),
      'form city osaka + 札幌に3日間 + Gemini sapporo -> sapporo (form city not added to the route), ja reply without Korean', short({ p: sap.json?.parsed?.routeCities, reply: sap.json?.reply }, 300));
    // AI 해석의 잡음 거르기: 음식·일반 문구·금액·메시지에 없는 장소는 꼭 갈 곳이 아니고, 메시지의 일수가 AI 일수보다 우선, 근거 없는 조건은 버린다
    mock.reset({ gemini: 'chat_noisy' });
    const noisy = await chat('도쿄 3일, 센소지는 꼭 가고 라멘 먹고 싶어');
    const np = noisy.json?.parsed || {};
    log(noisy.json?.sourceInfo?.kind === 'ai' && np.days === 3 && JSON.stringify(np.wantedPlaces || []) === JSON.stringify(['센소지']) && /라멘/.test(String(np.foodKeyword || ''))
      && np.specialPrefs?.publicTransitOnly !== true && np.specialPrefs?.removeShopping !== true,
      "Gemini noise is filtered: wanted ['라멘','무료 명소','1인 50만원','센소지','도쿄 타워'] -> ['센소지'] (food -> foodKeyword), AI days 4 -> message 3, unsupported prefs dropped",
      short({ days: np.days, wanted: np.wantedPlaces, food: np.foodKeyword, sp: np.specialPrefs }, 400));
    // AI 채팅 해석이 데이터 속 장소를 '데이터 없음'으로 돌려주고 도시를 틀려도(채팅 프롬프트는 도시 주변 실제 명소 목록을 모른다)
    // 서버가 그 장소의 도시와 꼭 갈 곳으로 바로잡는다: '다케토미섬 2일'(AI: 오키나와 + 미지원) → 이시가키, '高山で2日間'(AI: 도쿄) → 나고야
    mock.reset({ gemini: 'chat_place_unknown' });
    const take = await chat('다케토미섬 2일');
    const tp = take.json?.parsed || {};
    log(take.json?.sourceInfo?.kind === 'ai' && tp.cityKey === 'ishigaki' && (tp.wantedPlaces || []).includes('다케토미섬') && (tp.unsupportedPlaces || []).length === 0
      && !/데이터가 없어/.test(String(take.json?.reply || '')),
      "Gemini 'chat_place_unknown' 다케토미섬 2일 (AI: okinawa, unsupported 다케토미섬) -> ishigaki + must-visit 다케토미섬, no 'no data' reply", short({ p: { city: tp.cityKey, wanted: tp.wantedPlaces, unsupported: tp.unsupportedPlaces }, reply: take.json?.reply }, 400));
    const tak = await chat('高山で2日間', { lang: 'ja' });
    const tk = tak.json?.parsed || {};
    log(tak.json?.sourceInfo?.kind === 'ai' && tk.cityKey === 'nagoya' && (tk.wantedPlaces || []).includes('다카야마 산마치') && (tk.unsupportedPlaces || []).length === 0
      && !/データがない/.test(String(tak.json?.reply || '')) && !HANGUL_RE.test(String(tak.json?.reply || '')),
      "Gemini 'chat_place_unknown' 高山で2日間 (AI: tokyo, unsupported 高山) -> nagoya + 다카야마 산마치, ja reply without 'no data' or Korean", short({ p: { city: tk.cityKey, wanted: tk.wantedPlaces, unsupported: tk.unsupportedPlaces }, reply: tak.json?.reply }, 400));

    // 후속 대화(AI 경로): AI가 이전 도시를 그대로 말해도 규칙 병합 결과는 같다
    mock.reset({ gemini: 'chat_ok' });
    const f2 = await chat('교토 하루 더 늘려줘', { body: { history, prevParsed: prev } });
    log(followUpOk(f2.json?.parsed || {}), "follow-up (Gemini): same merge result (오사카 kept, 교토 +1, total 5)", short(f2.json?.parsed, 500));
    const followGem = mock.entries('gemini').filter((e) => !e.isItinerary).pop() || {};
    log(/Previous conversation:/.test(String(followGem.prompt || '')) && /Previously parsed conditions/.test(String(followGem.prompt || '')),
      'follow-up Gemini prompt includes the previous conversation and prevParsed');
    // 입력 검증
    const badHistory = await chat('도쿄', { body: { history: 'not-an-array' } });
    const bigPrev = await chat('도쿄', { body: { prevParsed: { note: 'x'.repeat(5000) }, history } });
    log(badHistory.status === 400 && bigPrev.status === 400, 'chat validation: history must be an array, prevParsed > 4KB -> 400', `${badHistory.status}/${bigPrev.status}`);
  } catch (e) { log(false, 'intent regression phase', e.stack || e.message); }
  checkNoSecrets('Intent regression', [GEM]);
  checkNoUnexpectedExternal('Intent regression');
  checkNoFatal('Intent regression');
}

// ── Phase 9: AI 일정 — 프롬프트 내용, 결정적 후처리, 입력 검증·제외, AI_BUSY (TD-03) ──
function sightBlocks(day) {
  return (day?.blocks || []).filter((b) => /^(오전|오후|종일)\(/.test(b) && !/자유 일정|도시 이동|체크아웃|공항/.test(b));
}

function blockName(b) {
  return String(b).replace(/^.+?\): /, '').replace(/ \([^()]*\)$/, '');
}

async function phaseAiItinerary() {
  section('AI itinerary: prompt contract, post-processing, validation, AI_BUSY');
  const GEM = 'GEMKEY-itinerary-test-77c3e1';
  mock.reset({ gemini: 'ok' });
  try {
    await startServer('ai-itinerary', { GEMINI_API_KEY: GEM, TRUST_PROXY: '1' });
  } catch (e) { log(false, 'Server (AI itinerary) started', e.message); return; }
  const plans = [];
  const plan = async (city, extra = {}) => {
    const r = await postJson('/api/travel-plan', { city, theme: 'mixed', days: 2, budget: 'mid', startDate: futureDate(20), lang: 'ko', useAi: true, ...extra }, { ip: nextIntentIp() });
    plans.push(r);
    return r;
  };
  const lastItinPrompt = () => String((mock.entries('gemini').filter((e) => e.isItinerary).pop() || {}).prompt || '');
  const ctxOf = (prompt) => { try { return JSON.parse(prompt.split('Context:\n')[1]); } catch { return null; } };
  const allBlocks = (r) => (r.json?.itinerary || []).flatMap((d) => d.blocks || []);
  const POST_KEYS = ['mealsMoved', 'sightsRelabeled', 'allDayMerged', 'mustInserted', 'trimmed', 'shifted', 'repeatsReplaced', 'unverified'];
  try {
    // (1) 프롬프트 내용: 요청 원문·꼭 갈 곳·도시별 날짜·제약 문장, 원본 specialPrefs 덩어리 없음
    const REQUEST = '오사카 2일 교토 2일, 유니버셜은 꼭, 도톤보리는 빼고 라멘 먹고 싶어';
    const intent = await plan('osaka', {
      days: 4, request: REQUEST, mustVisit: [USJ], excludedPlaces: ['도톤보리'], foodWishes: ['라멘'],
      _routeCities: ['오사카', '교토'], _regionDayPlan: [{ cityLabel: '오사카', days: 2, unit: 'day' }, { cityLabel: '교토', days: 2, unit: 'day' }],
      _specialPrefs: { lateStart: true, maxPlacesPerDay: 2, removeShopping: true }
    });
    const prompt = lastItinPrompt();
    const ctx = ctxOf(prompt) || {};
    const consIdx = prompt.indexOf('\nConstraints:\n');
    const consLines = consIdx >= 0 ? prompt.slice(consIdx + 14).split('\n').filter((l) => l.startsWith('- ')) : [];
    log(ctx.userRequest === REQUEST && prompt.includes(REQUEST), 'itinerary prompt carries the request text (userRequest)', short(ctx.userRequest));
    log((ctx.mustVisit || []).some((m) => m.name === USJ && m.allDay === true) && prompt.includes(USJ), 'itinerary prompt lists mustVisit (USJ, allDay)', short(ctx.mustVisit));
    log((ctx.dayPlan || []).map((d) => d.city).join(',') === '오사카,오사카,교토,교토' && ctx.dayPlan?.[2]?.transferFrom === '오사카',
      'itinerary prompt has dayPlan with the city of each day (+ transferFrom)', short(ctx.dayPlan));
    log(consLines.length >= 3 && consLines.some((l) => /10:30/.test(l)) && consLines.some((l) => /2 sightseeing/.test(l)) && consLines.some((l) => /shopping/i.test(l)),
      "itinerary prompt has a 'Constraints:' list (late start, 2 places a day, no shopping)", short(consLines));
    log(!('specialPrefs' in ctx) && !prompt.includes('"specialPrefs"'), 'itinerary prompt no longer embeds the raw specialPrefs object');
    log(Array.isArray(ctx.picks) && ctx.picks.length > 0 && ctx.picks.every((p) => 'id' in p && 'city' in p && 'allDay' in p) && !ctx.picks.some((p) => /도톤보리/.test(p.name)),
      'itinerary prompt picks carry id / city / allDay and leave out the excluded place', short(ctx.picks?.slice(0, 3)));
    log((ctx.excluded || []).includes('도톤보리') && (ctx.foodWishes || []).includes('라멘'), 'itinerary prompt has excluded + foodWishes', short({ excluded: ctx.excluded, foodWishes: ctx.foodWishes }));
    log(/종일/.test(prompt) && /점심/.test(prompt) && /ONLY for meals/.test(prompt), "itinerary prompt defines 종일 / 점심 and says 저녁/점심 are 'ONLY for meals'");
    const iDays = intent.json?.itinerary || [];
    log(intent.json?.itineraryInfo?.kind === 'ai' && iDays.length === 4 && iDays.every((d) => sightBlocks(d).length <= 2)
      && iDays.every((d) => (d.blocks || []).every((b) => { const m = /\((\d{2}):(\d{2})-/.exec(b); return !m || Number(m[1]) * 60 + Number(m[2]) >= 630; }))
      && /^도시 이동: 오사카 -> 교토/.test(iDays[2]?.blocks?.[0] || '') && !allBlocks(intent).some((b) => /도톤보리/.test(b))
      && allBlocks(intent).filter((b) => b.startsWith(`종일(`) && b.includes(USJ)).length === 1 && (intent.json?.itineraryInfo?.missingMustVisit || []).length === 0,
      'post-process enforces the intent: ≤2 sights a day, nothing before 10:30, transfer line on day 3, no excluded place, USJ once as 종일', short(iDays.map((d) => d.blocks), 600));
    const pp = intent.json?.itineraryInfo?.postProcess || {};
    log(POST_KEYS.every((k) => Number.isInteger(pp[k])) && Array.isArray(intent.json?.itineraryInfo?.missingMustVisit), 'itineraryInfo.postProcess has the 8 counters + missingMustVisit[]', short(intent.json?.itineraryInfo));

    // (2) 후처리 시나리오
    mock.scenario = { gemini: 'evening_sight' };
    const ev = await plan('osaka');
    log(allBlocks(ev).includes('오후(19:00-21:00): 우메다 스카이 빌딩 (우메다)') && ev.json?.itineraryInfo?.postProcess?.sightsRelabeled >= 1 && ev.json?.itineraryInfo?.kind === 'ai',
      "evening_sight: '저녁(19:00-21:00): 우메다 스카이 빌딩' -> '오후(19:00-21:00)' (time kept, sightsRelabeled)", short(allBlocks(ev)));
    mock.scenario = { gemini: 'lunch_food_in_afternoon' };
    const lf = await plan('tokyo');
    log(allBlocks(lf).includes('점심(12:00-13:30): 스시다이 (츠키지)') && lf.json?.itineraryInfo?.postProcess?.mealsMoved >= 1,
      "lunch_food_in_afternoon: '오후(12:00-13:30): 스시다이' -> '점심(12:00-13:30)' (mealsMoved)", short(allBlocks(lf)));
    mock.scenario = { gemini: 'allday_halfslot' };
    const ad = await plan('osaka', { mustVisit: [USJ] });
    const ad1 = ad.json?.itinerary?.[0] || {};
    log(sightBlocks(ad1).length === 1 && /^종일\(09:00-\d{2}:\d{2}\): 유니버셜 스튜디오 재팬/.test(sightBlocks(ad1)[0]) && (ad1.blocks || []).some((b) => /^저녁\(18:00-19:30\): 쿠시카츠 다루마/.test(b))
      && ad.json?.itineraryInfo?.postProcess?.allDayMerged >= 1,
      'allday_halfslot: requested USJ in a half-day slot -> that day has one 종일 USJ block, dinner kept (allDayMerged)', short(ad1.blocks));
    // 요청하지 않은 하루짜리(2일 일정이라 후보에 없음)를 AI가 넣으면 지우고, 같은 날의 다른 관광·저녁은 남기며 빈 낮은 후보로 채운다.
    const adU = await plan('osaka');
    const adU1 = adU.json?.itinerary?.[0] || {};
    log(!allBlocks(adU).some((b) => b.includes(USJ)) && (adU1.blocks || []).includes('오후(13:00-15:00): 오사카성 (주오구)')
      && (adU1.blocks || []).some((b) => /^저녁\(18:00-19:30\): 쿠시카츠 다루마/.test(b)) && sightBlocks(adU1).length >= 2 && adU.json?.itineraryInfo?.postProcess?.trimmed >= 1,
      'allday_halfslot without a request: the unoffered all-day USJ is dropped, the same day keeps 오사카성 + dinner and is refilled', short(adU1.blocks));
    mock.scenario = { gemini: 'missing_must' };
    const mm = await plan('tokyo', { mustVisit: ['팀랩 플래닛'] });
    log(allBlocks(mm).filter((b) => b.includes('팀랩 플래닛')).length === 1 && mm.json?.itineraryInfo?.postProcess?.mustInserted === 1 && (mm.json?.itineraryInfo?.missingMustVisit || []).length === 0,
      "missing_must: mustVisit '팀랩 플래닛' that the AI left out is inserted exactly once (mustInserted 1, missingMustVisit [])", short(allBlocks(mm)));
    log(/팀랩 플래닛/.test(lastItinPrompt()) && /Schedule every mustVisit exactly once/.test(lastItinPrompt()), 'missing_must: the prompt asked for the must-visit place');
    // 15:00 점심은 점심으로 남는다: 시간대 정리 단계마다 기준이 달라(16시/15시) 점심이 비고 저녁이 둘이 되던 문제(실측 10-02 후쿠오카)
    mock.scenario = { gemini: 'late_lunch' };
    const ll = await plan('fukuoka');
    const llDays = ll.json?.itinerary || [];
    const mealCount = (d, p) => (d.blocks || []).filter((b) => b.startsWith(`${p}(`)).length;
    log(ll.json?.itineraryInfo?.kind === 'ai' && llDays.length === 2 && llDays.every((d) => mealCount(d, '점심') === 1 && mealCount(d, '저녁') === 1)
      && llDays.every((d) => (d.blocks || []).some((b) => b.startsWith('점심(15:00-16:00)'))),
      "late_lunch: AI '점심(15:00-16:00)' + '저녁(18:00-19:30)' -> still one 점심 (15:00) and one 저녁 a day (no empty lunch, no second dinner)", short(llDays.map((d) => d.blocks), 500));
    mock.scenario = { gemini: 'lunch_repeat' };
    const lr = await plan('osaka');
    const lrDays = lr.json?.itinerary || [];
    const lrSights = lrDays.flatMap((d) => sightBlocks(d).map(blockName));
    log(lrDays.length === 2 && lrDays.every((d) => (d.blocks || []).includes('점심(12:00-13:00): 점심 식사 (난바)')) && new Set(lrSights).size === lrSights.length && lr.json?.itineraryInfo?.postProcess?.repeatsReplaced >= 1,
      "lunch_repeat: the daily '점심 식사' stays every day; the repeated sight is replaced by an unused pick", short(lrDays.map((d) => d.blocks)));
    mock.scenario = { gemini: 'invented_place' };
    const inv = await plan('tokyo');
    log(inv.json?.itineraryInfo?.kind === 'ai' && inv.json?.itineraryInfo?.postProcess?.unverified >= 1 && !allBlocks(inv).some((b) => /하늘정원/.test(b)),
      'invented_place: a place found in no candidate/data list is counted in postProcess.unverified and taken out of the plan', short({ pp: inv.json?.itineraryInfo?.postProcess, blocks: allBlocks(inv) }, 400));
    // AI가 후보 이름을 다르게 적은 일정(하나마키, 실측): 일본어 표기·띄어쓰기 차이·덧붙인 글자는 후보 이름으로 되돌리고,
    // 지어낸 곳은 빼며, 식사 칸의 '자유 식사'는 그 도시 맛집으로 바꾼다. 되돌린 이름이 다른 날과 겹치면 하나만 남는다.
    mock.scenario = { gemini: 'renamed_places' };
    const rn = await plan('hanamaki', { days: 2 });
    const rnBlocks = allBlocks(rn);
    const rnSights = (rn.json?.itinerary || []).flatMap((d) => sightBlocks(d).map(blockName));
    log(rn.json?.itineraryInfo?.kind === 'ai' && rnSights.includes('가마부치 폭포') && rnSights.filter((n) => n === '가마부치 폭포').length === 1
      && rnSights.includes('일본 현대 시가 문학관') && !rnBlocks.some((b) => /釜淵|가마부치폭포수|일본현대시가문학관|하늘정원|자유 식사/.test(b))
      && rnSights.every((n) => /[가-힣]/.test(n)) && rn.json?.itineraryInfo?.postProcess?.unverified >= 1 && rn.json?.itineraryInfo?.postProcess?.namesRestored >= 1,
      "renamed_places: '釜淵ノ滝'/'가마부치폭포수' -> 가마부치 폭포 (once), '일본현대시가문학관' -> '일본 현대 시가 문학관', invented place removed, '자유 식사' -> a real food",
      short({ pp: rn.json?.itineraryInfo?.postProcess, days: (rn.json?.itinerary || []).map((d) => d.blocks) }, 600));
    const rnPrompt = lastItinPrompt();
    log(/Copy every place and food name exactly as written/.test(rnPrompt) && /never write a placeholder such as "자유 식사"/.test(rnPrompt),
      'itinerary prompt: copy names character for character, meals only from foods (no "자유 식사" placeholder)');
    // 알려진 한계: 도시별 날짜(dayPlan)와 다른 도시의 장소(오사카 날의 후시미 이나리)는 아직 고치지 않는다 → 형식·출처만 본다.
    mock.scenario = { gemini: 'wrong_city_day' };
    const wc = await plan('osaka', { days: 4, _routeCities: ['오사카', '교토'], _regionDayPlan: [{ cityLabel: '오사카', days: 2, unit: 'day' }, { cityLabel: '교토', days: 2, unit: 'day' }] });
    log(wc.json?.itineraryInfo?.kind === 'ai' && (wc.json?.itinerary || []).length === 4 && /^도시 이동: 오사카 -> 교토/.test(wc.json?.itinerary?.[2]?.blocks?.[0] || ''),
      'wrong_city_day: AI plan kept (kind ai, 4 days) and day 3 starts with the transfer line', short((wc.json?.itinerary || []).map((d) => d.blocks), 500));

    // (3) 입력 검증과 제외
    const big = await postJson('/api/travel-plan', { city: 'tokyo', days: 2, startDate: futureDate(20), request: 'x'.repeat(700) }, { ip: nextIntentIp() });
    log(big.status === 400, 'travel-plan: request longer than 600 chars -> 400', String(big.status));
    mock.scenario = { gemini: 'ok' };
    const notArray = await plan('tokyo', { mustVisit: '센소지', excludedPlaces: '디즈니', foodWishes: '라멘' });
    log(notArray.status === 200 && notArray.json?.itineraryInfo?.postProcess?.mustInserted === 0 && !/mustVisit/.test(lastItinPrompt().split('Context:\n')[1] || ''),
      'travel-plan: mustVisit / excludedPlaces / foodWishes that are not arrays are ignored', short(notArray.json?.itineraryInfo));
    mock.scenario = { gemini: 'disney_day' };
    const dz = await plan('tokyo', { days: 3, excludedPlaces: ['디즈니'] });
    log(!allBlocks(dz).some((b) => /디즈니/.test(b)) && !(dz.json?.recommendations || []).some((r) => /디즈니/.test(r.name)) && (dz.json?.itinerary || []).every((d) => sightBlocks(d).length >= 1),
      "excludedPlaces ['디즈니']: the AI's Disneyland day is removed and refilled; no Disney card either", short((dz.json?.itinerary || []).map((d) => d.blocks)));
    const ruleDz = await plan('tokyo', { days: 4, useAi: false, excludedPlaces: ['디즈니'] });
    log(ruleDz.json?.itineraryInfo?.kind === 'rule' && !allBlocks(ruleDz).some((b) => /디즈니/.test(b)) && !(ruleDz.json?.recommendations || []).some((r) => /디즈니/.test(r.name)),
      "excludedPlaces ['디즈니'] on the rule planner: no Disneyland/DisneySea block or card", short(allBlocks(ruleDz)));

    // (5) 이 단계의 모든 일정 블록은 클라이언트 형식(시간대 토큰 + HH:MM-HH:MM)이거나 시각 없는 안내 줄이다
    const malformed = plans.flatMap((r) => allBlocks(r)).filter((b) => (/^(오전|오후|저녁|종일|아침|점심)/.test(b) && !CLIENT_BLOCK_RE.test(b))
      || (CLIENT_BLOCK_RE.test(b) && (() => { const m = /\((\d{2}):(\d{2})-(\d{2}):(\d{2})\)/.exec(b); return !m || Number(m[1]) > 23 || Number(m[3]) > 23 || Number(m[2]) > 59 || Number(m[4]) > 59 || (m[1] + m[2]) >= (m[3] + m[4]); })()));
    log(plans.length >= 10 && malformed.length === 0, `every block of ${plans.length} AI/rule plans is a valid client block "오전(09:00-11:00): 장소" or a plain line`, short(malformed.slice(0, 5)));

    // (4) AI_BUSY: 429/503은 규칙 일정 + 'AI_BUSY'(잠시 후 다시 시도 안내)
    mock.scenario = { gemini: 'error429' };
    const b429 = await plan('tokyo');
    const e429 = b429.json?.aiErrors || [];
    log(b429.json?.itineraryInfo?.kind === 'rule' && b429.json?.itineraryInfo?.reasonCode === 'AI_BUSY' && e429[0]?.code === 'quota_or_rate_limit' && e429.every((e) => !('message' in e))
      && (b429.json?.itinerary || []).every((d) => d.blocks.length > 0),
      "Gemini 429 RESOURCE_EXHAUSTED -> rule itinerary, itineraryInfo { kind: rule, reasonCode: AI_BUSY }", short({ ii: b429.json?.itineraryInfo, e429 }));
    const c429 = await postJson('/api/ai-travel-chat', { message: '도쿄 3일', context: { city: 'tokyo', days: 3 } }, { ip: nextIntentIp() });
    log(c429.json?.sourceInfo?.kind === 'rule' && c429.json?.sourceInfo?.reasonCode === 'AI_BUSY' && c429.json?.parsed?.days === 3, 'chat with Gemini 429 -> rule parse, sourceInfo reasonCode AI_BUSY', short(c429.json?.sourceInfo));
    mock.scenario = { gemini: 'error503' };
    const b503 = await plan('tokyo');
    log(b503.json?.itineraryInfo?.kind === 'rule' && b503.json?.itineraryInfo?.reasonCode === 'AI_BUSY' && (b503.json?.aiErrors || [])[0]?.code === 'overloaded',
      'Gemini 503 high demand -> rule itinerary, reasonCode AI_BUSY (code overloaded)', short({ ii: b503.json?.itineraryInfo, errs: b503.json?.aiErrors }));
    log(mock.entries('gemini').some((e) => e.model === 'gemini-flash-latest' && e.body?.generationConfig?.thinkingConfig?.thinkingBudget === 0),
      'fallback model gemini-flash-latest is called with thinkingBudget 0');
    // 하루 무료 한도(PerDay quotaId) 소진은 AI_BUSY('1분 뒤')가 아니라 AI_DAILY_LIMIT + 한도가 다시 생길 때까지 남은 초.
    // (모델이 몇 시간 쉬게 되므로 이 단계의 마지막에 둔다. 다음 단계는 새 서버 프로세스다.)
    mock.scenario = { gemini: 'error429_daily' };
    const bDay = await plan('tokyo');
    const eDay = bDay.json?.aiErrors || [];
    log(bDay.json?.itineraryInfo?.kind === 'rule' && bDay.json?.itineraryInfo?.reasonCode === 'AI_DAILY_LIMIT' && eDay[0]?.code === 'daily_quota' && eDay[0]?.reasonCode === 'AI_DAILY_LIMIT'
      && Number(eDay[0]?.retryAfterSec) > 60 && Number(eDay[0]?.retryAfterSec) <= 86400 && eDay.every((e) => !('message' in e)) && (bDay.json?.itinerary || []).every((d) => d.blocks.length > 0),
      'Gemini 429 with a PerDay quotaId -> rule itinerary, reasonCode AI_DAILY_LIMIT (code daily_quota, retryAfterSec until the daily reset)', short({ ii: bDay.json?.itineraryInfo, eDay }));
    const cDay = await postJson('/api/ai-travel-chat', { message: '도쿄 3일', context: { city: 'tokyo', days: 3 } }, { ip: nextIntentIp() });
    log(cDay.json?.sourceInfo?.kind === 'rule' && cDay.json?.sourceInfo?.reasonCode === 'AI_DAILY_LIMIT' && cDay.json?.parsed?.days === 3,
      'chat after the daily quota is used up -> rule parse, sourceInfo reasonCode AI_DAILY_LIMIT (not AI_BUSY)', short(cDay.json?.sourceInfo));
  } catch (e) { log(false, 'AI itinerary phase', e.stack || e.message); }
  checkNoSecrets('AI itinerary', [GEM]);
  checkNoUnexpectedExternal('AI itinerary');
  checkNoFatal('AI itinerary');
}

// ── Phase 10: Gemini 모델 체인 — 순서·환경변수로 바꾸기·쉬는 모델 건너뛰기·하루 한도 넘기기·404 하루 쉼·모델별 생각 설정·
//    전체 시간 예산·/api/health 표시. 가짜 Gemini만 쓴다(실제 호출 0회). ──
// 2026-10-01 실측 순서(server.js GEMINI_DEFAULT_FALLBACK_MODELS). 운영 주 모델이 gemini-2.5-flash-lite라 체인이 이 순서 그대로다.
const GEMINI_DEFAULT_CHAIN = ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];

async function phaseGeminiChain() {
  section('Gemini model chain: order, env override, cooled-model skip, daily 429 hand-off, per-model thinking config, time budget, health');
  const GEM = 'GEMKEY-chain-test-3f9a20';
  const FAKE_KEY_IN_LIST = 'AIzaSyFAKE-not-a-model-0123456789abcdefgh';
  const plan = (extra = {}) => postJson('/api/travel-plan', { city: 'osaka', theme: 'mixed', days: 2, budget: 'mid', startDate: futureDate(20), lang: 'ko', useAi: true, ...extra }, { ip: nextIntentIp() });
  const chat = (message = '도쿄 3일') => postJson('/api/ai-travel-chat', { message, context: { city: 'tokyo', days: 3 } }, { ip: nextIntentIp() });
  const called = () => mock.entries('gemini').map((e) => e.model);
  const thinking = (e) => e?.body?.generationConfig?.thinkingConfig;
  const aiHealth = async () => (await fetchUrl('/api/health', { record: false })).json?.ai || {};
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const source = (r) => String(r.json?.itinerarySource || '');

  // (1) 코드 기본 주 모델(gemini-2.5-flash): 실측 순서에서 주 모델만 빠진다
  mock.reset({ gemini: 'ok' });
  try {
    await startServer('chain-default', { GEMINI_API_KEY: GEM, TRUST_PROXY: '1' });
    const h = await aiHealth();
    log(same(h.geminiModelChain, ['gemini-2.5-flash', ...GEMINI_DEFAULT_CHAIN.filter((m) => m !== 'gemini-2.5-flash')]) && h.geminiFallbackSource === 'default'
      && h.geminiTotalBudgetMs === 40000 && same(h.geminiCoolingModels, []),
      'health: default chain = gemini-2.5-flash + the measured fallback order (primary not repeated), source default, budget 40000 ms, nothing cooling', short(h, 500));
    const dg = (await fetchUrl('/api/ai-diagnostics')).json?.providers?.gemini || {};
    log(same(dg.modelChain, h.geminiModelChain) && dg.fallbackSource === 'default' && dg.totalBudgetMs === 40000 && same(dg.coolingModels, []),
      'ai-diagnostics (public) shows the same chain, budget and cooling list', short(dg, 400));
  } catch (e) { log(false, 'Gemini chain (default primary)', e.stack || e.message); }

  // (2) 운영과 같은 주 모델(gemini-2.5-flash-lite) — 하루 한도·쉬는 모델·404·생각 설정·잘림·키 오류
  mock.reset({ gemini: 'ok', geminiModels: { 'gemini-2.5-flash-lite': 'error429_daily', 'gemini-3.1-flash-lite': 'error429_daily', 'gemini-3-flash-preview': 'error429_daily' } });
  try {
    await startServer('chain-prod', { GEMINI_API_KEY: GEM, GEMINI_API_MODEL: 'gemini-2.5-flash-lite', TRUST_PROXY: '1' });
    const h0 = await aiHealth();
    log(same(h0.geminiModelChain, GEMINI_DEFAULT_CHAIN), 'health: GEMINI_API_MODEL=gemini-2.5-flash-lite (production) -> the chain is exactly the measured order', short(h0.geminiModelChain));

    // 앞의 3개 모델이 하루 한도(429 PerDay) → 4번째(gemini-3.5-flash-lite)가 일정을 만든다
    const p1 = await plan();
    const e1 = mock.entries('gemini');
    log(p1.json?.itineraryInfo?.kind === 'ai' && source(p1).includes('(gemini-3.5-flash-lite)') && same(called(), GEMINI_DEFAULT_CHAIN.slice(0, 4)),
      'daily 429 on the first 3 models -> tried in chain order, the 4th (gemini-3.5-flash-lite) makes the AI itinerary', short({ src: source(p1), called: called(), ii: p1.json?.itineraryInfo }, 400));
    // 모델별 생각 설정: 2.5·3.x flash는 thinkingBudget 0, 3.5-flash-lite는 thinkingLevel 'minimal'(thinkingBudget을 보내면 실제로 400)
    log(e1.length === 4 && e1.slice(0, 3).every((e) => same(thinking(e), { thinkingBudget: 0 })) && same(thinking(e1[3]), { thinkingLevel: 'minimal' }),
      "per-model thinking config: thinkingBudget 0 for 2.5-flash-lite / 3.1-flash-lite / 3-flash-preview, thinkingLevel 'minimal' (no thinkingBudget) for 3.5-flash-lite",
      short(e1.map((e) => [e.model, thinking(e)])));
    const cool1 = (await aiHealth()).geminiCoolingModels || [];
    log(same(cool1.map((c) => c.model), GEMINI_DEFAULT_CHAIN.slice(0, 3)) && cool1.every((c) => same(Object.keys(c).sort(), ['model', 'secondsLeft']) && c.secondsLeft > 30 && c.secondsLeft <= 6 * 3600),
      'health: the 3 daily-limited models are cooling until the daily reset (at most 6 h), shown as name + secondsLeft only', short(cool1));

    // 쉬는 모델은 건너뛴다: 다음 일정은 바로 gemini-3.5-flash-lite
    mock.reset({ gemini: 'ok' });
    const p2 = await plan();
    log(p2.json?.itineraryInfo?.kind === 'ai' && same(called(), ['gemini-3.5-flash-lite']), 'the next request skips the 3 cooling models (one call, straight to gemini-3.5-flash-lite)', short(called()));

    // 404(모델 종료 'no longer available'): 다음 모델이 답하고, 그 모델은 하루 쉰다
    mock.reset({ gemini: 'ok', geminiModels: { 'gemini-3.5-flash-lite': 'error404' } });
    const p3 = await plan();
    const gone = ((await aiHealth()).geminiCoolingModels || []).find((c) => c.model === 'gemini-3.5-flash-lite');
    log(p3.json?.itineraryInfo?.kind === 'ai' && source(p3).includes('(gemini-2.5-flash)') && same(called(), ['gemini-3.5-flash-lite', 'gemini-2.5-flash'])
      && Boolean(gone) && gone.secondsLeft > 6 * 3600 && gone.secondsLeft <= 24 * 3600,
      "404 'no longer available' -> the next model answers, the gone model cools down for a day (> 6 h)", short({ called: called(), gone }));

    // 목록에 없는 생각 형식: 400 INVALID_ARGUMENT면 다른 형식으로 한 번 더 보내고, 받아들인 형식을 기억한다
    mock.reset({ gemini: 'ok', geminiModels: { 'gemini-2.5-flash': 'error400_thinking_budget' } });
    const p4 = await plan();
    const e4 = mock.entries('gemini');
    log(p4.json?.itineraryInfo?.kind === 'ai' && source(p4).includes('(gemini-2.5-flash)') && same(called(), ['gemini-2.5-flash', 'gemini-2.5-flash'])
      && same(thinking(e4[0]), { thinkingBudget: 0 }) && same(thinking(e4[1]), { thinkingLevel: 'minimal' }),
      "a model that rejects thinkingBudget with 400 is retried once with thinkingLevel 'minimal' and answers", short(e4.map((e) => [e.model, thinking(e)])));
    mock.reset({ gemini: 'ok', geminiModels: { 'gemini-2.5-flash': 'error400_thinking_budget' } });
    const p5 = await plan();
    log(p5.json?.itineraryInfo?.kind === 'ai' && same(called(), ['gemini-2.5-flash']) && same(thinking(mock.entries('gemini')[0]), { thinkingLevel: 'minimal' }),
      'the accepted thinking style is remembered: the next request sends it first (one call)', short(called()));

    // 생각 토큰이 출력 한도를 다 쓴 잘림(설정 탓)은 다음 모델에 맡긴다. 생각 없이 잘린 응답은 그대로 AI_TRUNCATED(다른 모델 한도를 쓰지 않음).
    mock.reset({ gemini: 'ok', geminiModels: { 'gemini-2.5-flash': 'max_tokens_thoughts' } });
    const p6 = await plan();
    log(p6.json?.itineraryInfo?.kind === 'ai' && source(p6).includes('(gemini-3.6-flash)') && same(called(), ['gemini-2.5-flash', 'gemini-3.6-flash']),
      'MAX_TOKENS caused by thinking tokens -> the next model answers', short({ called: called(), src: source(p6) }));
    mock.reset({ gemini: 'max_tokens' });
    const p7 = await plan();
    log(p7.json?.itineraryInfo?.kind === 'rule' && p7.json?.itineraryInfo?.reasonCode === 'AI_TRUNCATED' && called().length === 1,
      'plain MAX_TOKENS (no thinking tokens) -> AI_TRUNCATED after one call (no other model spent)', short({ called: called(), ii: p7.json?.itineraryInfo }));

    // 키 문제 400(API_KEY_INVALID)은 모델을 바꿔도 같아서 다음 모델로 넘기지 않는다
    mock.reset({ gemini: 'error400' });
    const c1 = await chat();
    log(c1.json?.sourceInfo?.kind === 'rule' && c1.json?.sourceInfo?.reasonCode === 'AI_ERROR' && called().length === 1,
      'key-level 400 (API_KEY_INVALID) stops the chain after one call -> rule parse, AI_ERROR', short({ called: called(), si: c1.json?.sourceInfo }));

    // 남은 모델도 모두 하루 한도 → AI_DAILY_LIMIT, health에 7개 모두. 그다음 요청은 가장 오래 쉰 모델 하나만 다시 확인(404 모델은 빼고)
    mock.reset({ gemini: 'error429_daily' });
    const p8 = await plan();
    const h8 = await aiHealth();
    log(p8.json?.itineraryInfo?.reasonCode === 'AI_DAILY_LIMIT' && same(called(), ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest'])
      && same((h8.geminiCoolingModels || []).map((c) => c.model), GEMINI_DEFAULT_CHAIN),
      'every remaining model at its daily limit -> AI_DAILY_LIMIT, health lists all 7 models as cooling (chain order)', short({ called: called(), cooling: h8.geminiCoolingModels }, 500));
    mock.reset({ gemini: 'error429_daily' });
    const p9 = await plan();
    log(p9.json?.itineraryInfo?.reasonCode === 'AI_DAILY_LIMIT' && same(called(), ['gemini-2.5-flash-lite']),
      'all models cooling -> one re-check of the longest-cooling model (never the 404 one)', short(called()));
  } catch (e) { log(false, 'Gemini chain (production primary)', e.stack || e.message); }
  checkNoSecrets('Gemini chain', [GEM]);
  checkNoUnexpectedExternal('Gemini chain');
  checkNoFatal('Gemini chain');

  // (3) GEMINI_FALLBACK_MODELS로 바꾼 체인 + 전체 시간 예산(호출 하나 5초, 체인 전체 8초)
  mock.reset({ gemini: 'chat_ok', geminiDelayMs: { 'gemini-test-a': 12000, 'gemini-test-b': 12000 } });
  try {
    await startServer('chain-env', {
      GEMINI_API_KEY: GEM, TRUST_PROXY: '1', GEMINI_API_MODEL: 'gemini-test-a',
      GEMINI_FALLBACK_MODELS: ` gemini-test-b, gemini-test-a,gemini-test-b , models/gemini-test-c,Bad Name!,${FAKE_KEY_IN_LIST},,gemini-test-d`,
      AI_REQUEST_TIMEOUT_MS: '5000', GEMINI_TOTAL_BUDGET_MS: '8000'
    });
    const hr = await fetchUrl('/api/health');
    const h = hr.json?.ai || {};
    log(same(h.geminiModelChain, ['gemini-test-a', 'gemini-test-b', 'gemini-test-c', 'gemini-test-d']) && h.geminiFallbackSource === 'env' && h.geminiTotalBudgetMs === 8000,
      'GEMINI_FALLBACK_MODELS replaces the fallback list: trimmed, de-duplicated, primary excluded, models/ prefix dropped, invalid names dropped', short(h, 400));
    log(!hr.body.includes('AIza') && !/Bad Name/.test(hr.body) && !serverLogs().includes(FAKE_KEY_IN_LIST) && /GEMINI_FALLBACK_MODELS에서 모델 이름 형식이 아닌 값 2개를 뺐습니다/.test(serverLogs()),
      'a key pasted into GEMINI_FALLBACK_MODELS is not used as a model, not shown in /api/health and not logged (only the count of dropped values)');

    const t0 = Date.now();
    const slow = await chat();
    const elapsed = Date.now() - t0;
    log(same(called(), ['gemini-test-a', 'gemini-test-b']) && elapsed >= 7500 && elapsed < 9500,
      `time budget: 2 slow models tried (5000 ms, then the 3000 ms left), the rest not tried; answered in ${elapsed} ms (< 10000 ms without the budget)`, short({ called: called(), elapsed }));
    log(slow.status === 200 && slow.json?.sourceInfo?.kind === 'rule' && slow.json?.sourceInfo?.reasonCode === 'AI_BUSY' && (slow.json?.aiErrors || [])[0]?.code === 'timeout' && slow.json?.parsed?.days === 3,
      'chain out of time -> rule parse, reasonCode AI_BUSY (code timeout, not a network error)', short({ si: slow.json?.sourceInfo, errs: slow.json?.aiErrors }));
    const cool = (await aiHealth()).geminiCoolingModels || [];
    log(same(cool.map((c) => c.model), ['gemini-test-a']) && cool.every((c) => c.secondsLeft > 0 && c.secondsLeft <= 60),
      'health: the model that used its full 5000 ms cools down for 60 s; the one cut short by the budget does not', short(cool));
    mock.reset({ gemini: 'chat_ok', geminiDelayMs: { 'gemini-test-a': 12000 } });
    const t1 = Date.now();
    const fast = await chat();
    const fastMs = Date.now() - t1;
    log(fast.json?.sourceInfo?.kind === 'ai' && same(called(), ['gemini-test-b']) && fastMs < 4000,
      `the next chat skips the cooling slow model and gets the AI parse from gemini-test-b (${fastMs} ms)`, short({ called: called(), si: fast.json?.sourceInfo }));
  } catch (e) { log(false, 'Gemini chain (env override + time budget)', e.stack || e.message); }
  checkNoSecrets('Gemini chain (env)', [GEM, FAKE_KEY_IN_LIST]);
  checkNoUnexpectedExternal('Gemini chain (env)');
  checkNoFatal('Gemini chain (env)');
}

function cleanupTestData() {
  try { fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true }); } catch { /* 무시 */ }
}

function printResults() {
  // 서버들은 임시 TABIMARU_DATA_DIR만 썼어야 한다(저장소 data/의 실제 사용자·일정 파일은 그대로)
  log(snapshotDir(REPO_DATA_DIR) === REPO_DATA_BEFORE, 'repo data/ folder is untouched by the test run (servers wrote only to a temp TABIMARU_DATA_DIR)');
  cleanupTestData();
  console.log('\n=== Test Results ===\n');
  for (const r of results) console.log(r);
  const total = passed + failed;
  console.log('\n' + '─'.repeat(20));
  console.log('Total: ' + total + ' | Passed: ' + passed + ' | Failed: ' + failed);
  if (failed > 0) {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

runTests().catch(async (err) => {
  console.error('Test suite crashed:', err);
  try { await stopServer(); } catch { /* ignore */ }
  try { await mock.stop(); } catch { /* ignore */ }
  cleanupTestData();
  process.exit(1);
});
