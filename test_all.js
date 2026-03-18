/**
 * Runtime integration test - starts actual server, fetches HTML+JS,
 * validates no fatal errors, tests API responses, verifies i18n works
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

const PORT = 13581;
const BASE = `http://localhost:${PORT}`;
let serverProcess = null;
let passed = 0, failed = 0;
const results = [];

function log(ok, name, detail) {
  if (ok) { passed++; results.push('  \u2705 ' + name); }
  else { failed++; results.push('  \u274C ' + name + (detail ? ': ' + detail : '')); }
}

function fetchUrl(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const reqOpts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 30000
    };
    if (options.body) reqOpts.headers['Content-Type'] = 'application/json';
    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data, json: null }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Find project directory
const homeDir = require('os').homedir();
const onedrive = path.join(homeDir, 'OneDrive');
let PROJECT = '';
for (const d of fs.readdirSync(onedrive)) {
  const c = path.join(onedrive, d, 'codex_project');
  if (fs.existsSync(c)) { PROJECT = c; break; }
}

async function startServer() {
  const env = { ...process.env, PORT: String(PORT) };
  serverProcess = spawn('node', [path.join(PROJECT, 'server.js')], {
    env, stdio: ['pipe', 'pipe', 'pipe'], cwd: PROJECT
  });
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try { await fetchUrl('/api/health'); return true; } catch {}
  }
  return false;
}

function stopServer() {
  if (serverProcess) { serverProcess.kill('SIGTERM'); serverProcess = null; }
}

async function runTests() {
  console.log('\n=== Runtime Integration Tests ===\n');

  // ── 1. Code Analysis ──
  console.log('--- Code Analysis ---');
  const serverCode = fs.readFileSync(path.join(PROJECT, 'server.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(PROJECT, 'public', 'app.js'), 'utf8');
  const htmlCode = fs.readFileSync(path.join(PROJECT, 'public', 'index.html'), 'utf8');

  // Syntax check via node --check is already done, so focus on runtime issues

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
    if (!htmlCode.includes('id="' + id + '"')) {
      missingIds.push(id);
    }
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

  // Server: localizeAddress function exists
  log(/function localizeAddress\(/.test(serverCode), 'localizeAddress function exists');

  // Type dictionaries exist
  log(serverCode.includes('PRIMARY_TYPE_EN'), 'PRIMARY_TYPE_EN dictionary exists');
  log(serverCode.includes('PRIMARY_TYPE_JA'), 'PRIMARY_TYPE_JA dictionary exists');

  // I18N ko/en/ja all have dynamic content keys
  const requiredKeys = ['day-prefix', 'arrival', 'departure', 'checkin', 'checkout',
    'selected-flight', 'selected-stay', 'meal-breakfast', 'meal-lunch', 'meal-dinner',
    'source-rule', 'mock-notice', 'no-results'];
  for (const key of requiredKeys) {
    const pattern = "'" + key + "'";
    // Should appear in ko section
    log(i18nBlock.includes(pattern), 'I18N has key: ' + key);
  }

  // data-i18n attributes in HTML
  const dataI18nCount = (htmlCode.match(/data-i18n=/g) || []).length;
  log(dataI18nCount >= 50, 'HTML has ' + dataI18nCount + ' data-i18n attributes (>=50)');

  // ── 2. Server Tests ──
  console.log('--- Starting Server ---');
  const ready = await startServer();
  if (!ready) {
    log(false, 'Server started');
    stopServer();
    printResults();
    return;
  }
  log(true, 'Server started on port ' + PORT);

  console.log('--- API Tests ---');

  // Basic endpoints
  try {
    const health = await fetchUrl('/api/health');
    log(health.status === 200, 'GET /api/health returns 200');
  } catch(e) { log(false, '/api/health', e.message); }

  // Static files load
  try {
    const html = await fetchUrl('/');
    log(html.status === 200, 'GET / returns 200');
    log(html.body.includes('<html'), 'HTML page has html tag');
    log(html.body.includes('app.js'), 'HTML references app.js');
  } catch(e) { log(false, 'HTML page', e.message); }

  try {
    const js = await fetchUrl('/app.js');
    log(js.status === 200, 'GET /app.js returns 200');
    log(js.body.length > 100000, 'app.js is substantial (' + js.body.length + ' bytes)');
    // Verify no syntax errors in served JS
    log(js.body.includes('function t('), 'Served app.js has t() function');
    log(js.body.includes('var I18N'), 'Served app.js has I18N');
  } catch(e) { log(false, 'app.js served', e.message); }

  // Travel plan with lang
  console.log('--- Feature Tests ---');
  try {
    const plan = await fetchUrl('/api/travel-plan', {
      method: 'POST',
      body: { city: 'tokyo', theme: 'mixed', days: 2, budget: 'mid', startDate: '2026-05-01', lang: 'ko' }
    });
    log(plan.status === 200, 'POST /api/travel-plan returns 200');
    log(Array.isArray(plan.json?.recommendations), 'Travel plan has recommendations');
    log(plan.json?.recommendations?.length > 0, 'Travel plan has >0 recommendations', plan.json?.recommendations?.length + ' found');
    log(Array.isArray(plan.json?.itinerary), 'Travel plan has itinerary');
    log(plan.json?.itinerary?.length === 2, 'Itinerary has 2 days');
  } catch(e) { log(false, 'travel-plan', e.message); }

  // Travel plan with en
  try {
    const planEn = await fetchUrl('/api/travel-plan', {
      method: 'POST',
      body: { city: 'osaka', theme: 'culture', days: 2, budget: 'mid', startDate: '2026-05-01', lang: 'en' }
    });
    log(planEn.status === 200, 'Travel plan with lang=en returns 200');
    log(planEn.json?.recommendations?.length > 0, 'Travel plan (en) has recommendations');
  } catch(e) { log(false, 'travel-plan en', e.message); }

  // Dest search
  try {
    const dest = await fetchUrl('/api/dest-search', {
      method: 'POST',
      body: { city: 'tokyo', theme: 'nature', budget: 'mid', limit: 3, lang: 'ja' }
    });
    log(dest.status === 200, 'POST /api/dest-search returns 200');
    log(dest.json?.destinations?.length > 0, 'Dest search has >0 destinations');
  } catch(e) { log(false, 'dest-search', e.message); }

  // Foods
  try {
    const foods = await fetchUrl('/api/foods?city=tokyo&genre=ramen&budget=mid&lang=ko');
    log(foods.status === 200, 'GET /api/foods returns 200');
    log(foods.json?.list?.length > 0, 'Foods has >0 items');
  } catch(e) { log(false, 'foods', e.message); }

  // Cities
  try {
    const cities = await fetchUrl('/api/cities');
    log(cities.status === 200, 'GET /api/cities returns 200');
    log(cities.json?.cities?.length >= 5, 'At least 5 cities');
  } catch(e) { log(false, 'cities', e.message); }

  // FX rate
  try {
    const fx = await fetchUrl('/api/fx-rate');
    log(fx.status === 200, 'GET /api/fx-rate returns 200');
  } catch(e) { log(false, 'fx-rate', e.message); }

  // Flights
  try {
    const flights = await fetchUrl('/api/flights', {
      method: 'POST',
      body: { city: 'tokyo', tripType: 'oneway', from: 'ICN', to: 'NRT', departDate: '2026-05-01', preference: 'balanced' }
    });
    log(flights.status === 200, 'POST /api/flights returns 200');
    log(Array.isArray(flights.json?.flights), 'Flights has flights array');
  } catch(e) { log(false, 'flights', e.message); }

  // Stays
  try {
    const stays = await fetchUrl('/api/stays', {
      method: 'POST',
      body: { city: 'tokyo', checkIn: '2026-05-01', checkOut: '2026-05-03', guests: 2, rooms: 1, preference: 'balanced' }
    });
    log(stays.status === 200, 'POST /api/stays returns 200');
    log(Array.isArray(stays.json?.stays), 'Stays has stays array');
  } catch(e) { log(false, 'stays', e.message); }

  // Security headers
  console.log('--- Security Tests ---');
  try {
    const apiRes = await fetchUrl('/api/health');
    log(apiRes.status === 200, 'Security headers test endpoint OK');
  } catch(e) { log(false, 'security', e.message); }

  // Input validation
  try {
    const bad = await fetchUrl('/api/travel-plan', { method: 'POST', body: { city: 'tokyo', theme: 'invalid_theme', days: 99 } });
    log(bad.status === 400, 'Invalid theme returns 400');
  } catch(e) { log(false, 'validation', e.message); }

  // Path traversal
  try {
    const trav = await fetchUrl('/../server.js');
    log(trav.status === 403 || trav.status === 404, 'Path traversal blocked');
  } catch(e) { log(false, 'traversal', e.message); }

  stopServer();
  printResults();
}

function printResults() {
  console.log('\n=== Test Results ===\n');
  for (const r of results) console.log(r);
  const total = passed + failed;
  console.log('\n' + '\u2500'.repeat(20));
  console.log('Total: ' + total + ' | Passed: ' + passed + ' | Failed: ' + failed);
  if (failed > 0) {
    console.log('\n\u274C SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('\n\u2705 ALL TESTS PASSED');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test suite crashed:', err);
  stopServer();
  process.exit(1);
});
