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
 *   → Google 결제 꺼짐 → Google 정상 + Gemini → 일일 상한 → Geocoding 거부 → OAuth state·AI 오류 원문 제거.
 * - 브랜드(Tabimaru)와 도메인에 묶인 값(운영 주소, 서비스 이름, OAuth 콜백, sid 쿠키, localStorage 키)도 검사한다.
 * - 첫 화면(app.js 부팅)은 tests/support/browser-sandbox.js로 실행해 유료 API를 부르지 않는지 본다.
 *   같은 흉내 안에서 사진·출처 표시 함수에 악성 주소·HTML을 넣어 허용 목록과 이스케이프도 확인한다.
 */
const http = require('http');
const vm = require('vm');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createMockVendor, JPEG_BYTES, GEMINI_ERROR_TEXT } = require('./tests/support/mock-vendor');
const { createBrowser } = require('./tests/support/browser-sandbox');

const PORT = 13581;
const MOCK_PORT = 3205;
const BASE = `http://localhost:${PORT}`;
const PROJECT = __dirname;
const GUARD = path.join(PROJECT, 'tests', 'support', 'net-guard.js');

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
    SESSION_SECRET: 'test-only-session-secret-0123456789abcdef'
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
    .concat(fs.existsSync(path.join(PROJECT, 'scripts', 'build-place-images.js')) ? ['scripts/build-place-images.js'] : []);
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
  const oauthPaths = ['/api/auth/google/callback', '/api/auth/naver/callback', '/api/auth/kakao/callback'];
  log(serverCode.includes('sid=${sid}.${sig}') && serverCode.includes("'Referer': 'https://japanjapantravel.onrender.com/'") && oauthPaths.every((p) => serverCode.includes(p)),
    "Domain-bound: cookie 'sid', Rakuten Referer and OAuth callback paths unchanged");

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

  // ════════ Server phases ════════
  await mock.start();
  try {
    await phaseFree();
    await phaseFreeMedia();
    await phaseTrustedProxy();
    await phaseGoogleBilling();
    await phaseGoogleLive();
    await phaseDailyCap();
    await phaseGeocodeDenied();
    await phaseOauthAndAiErrors();
  } finally {
    await stopServer();
    await mock.stop();
  }
  printResults();
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
// 토큰 교환은 가짜 서버가 늘 401로 거절하므로 로그인이 끝나지 않는다(data/users.json에 쓰지 않음).
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

function printResults() {
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
  process.exit(1);
});
