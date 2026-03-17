/**
 * JapanTravel Suite - Comprehensive Automated Test Suite
 * Run: node test_all.js
 * Tests server startup, API endpoints, security headers, session management,
 * fetchWithRetry logic, and validates all new features.
 */

const http = require('http');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');

const PORT = 13579; // Use a non-conflicting port
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess = null;
let passed = 0;
let failed = 0;
let total = 0;
const results = [];

function log(status, name, detail) {
  total++;
  if (status === 'PASS') {
    passed++;
    results.push(`  \u2705 ${name}`);
  } else {
    failed++;
    results.push(`  \u274C ${name}: ${detail}`);
  }
}

function assert(condition, name, detail) {
  if (condition) log('PASS', name);
  else log('FAIL', name, detail || 'assertion failed');
}

function fetchUrl(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqOpts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    if (options.body) {
      reqOpts.headers['Content-Type'] = 'application/json';
    }
    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: data, json: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data, json: null });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function startServer() {
  const { spawn } = require('child_process');
  const serverPath = path.join(__dirname, 'server.js');

  // Set PORT env
  const env = { ...process.env, PORT: String(PORT) };
  serverProcess = spawn('node', [serverPath], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname
  });

  // Wait for server to be ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      await fetchUrl('/api/health');
      ready = true;
      break;
    } catch {}
  }
  if (!ready) {
    console.error('Server failed to start within 15 seconds');
    process.exit(1);
  }
  console.log(`Test server started on port ${PORT}`);
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// ==================== TEST CATEGORIES ====================

async function testHealthEndpoint() {
  const res = await fetchUrl('/api/health');
  assert(res.status === 200, 'GET /api/health returns 200');
  assert(res.json !== null, 'GET /api/health returns JSON');
}

async function testSecurityHeaders() {
  // Test API endpoint security headers
  const apiRes = await fetchUrl('/api/health');
  assert(apiRes.headers['x-content-type-options'] === 'nosniff', 'API: X-Content-Type-Options = nosniff');
  assert(apiRes.headers['x-frame-options'] === 'DENY', 'API: X-Frame-Options = DENY');
  assert(apiRes.headers['x-xss-protection'] === '1; mode=block', 'API: X-XSS-Protection set');
  assert(apiRes.headers['referrer-policy'] === 'strict-origin-when-cross-origin', 'API: Referrer-Policy set');

  // Test static file security headers
  const staticRes = await fetchUrl('/');
  assert(staticRes.status === 200, 'GET / returns 200');
  assert(staticRes.headers['x-content-type-options'] === 'nosniff', 'Static: X-Content-Type-Options = nosniff');
  assert(staticRes.headers['x-frame-options'] === 'SAMEORIGIN', 'Static: X-Frame-Options = SAMEORIGIN');
  assert(staticRes.headers['permissions-policy'] !== undefined, 'Static: Permissions-Policy set');
}

async function testCitiesEndpoint() {
  const res = await fetchUrl('/api/cities');
  assert(res.status === 200, 'GET /api/cities returns 200');
  assert(Array.isArray(res.json?.cities), 'GET /api/cities returns cities array');
  assert(res.json.cities.length >= 5, 'At least 5 cities returned', `got ${res.json?.cities?.length}`);
}

async function testMapsConfigEndpoint() {
  const res = await fetchUrl('/api/maps-config');
  assert(res.status === 200, 'GET /api/maps-config returns 200');
  assert(res.json !== null, 'GET /api/maps-config returns JSON');
}

async function testFxRateEndpoint() {
  const res = await fetchUrl('/api/fx-rate');
  assert(res.status === 200, 'GET /api/fx-rate returns 200');
  assert(res.json?.jpyKrw !== undefined || res.json?.jpyToKrw !== undefined || res.json?.usdKrw !== undefined, 'FX rate returns exchange data');
}

async function testAuthProvidersEndpoint() {
  const res = await fetchUrl('/api/auth/providers');
  assert(res.status === 200, 'GET /api/auth/providers returns 200');
  assert(res.json !== null, 'Auth providers returns JSON');
}

async function testAuthMeEndpoint() {
  const res = await fetchUrl('/api/auth/me');
  assert(res.status === 200, 'GET /api/auth/me returns 200');
  assert(res.json?.user === null || res.json?.user !== undefined, 'Auth me returns user field');
}

async function testTravelPlanEndpoint() {
  const res = await fetchUrl('/api/travel-plan', {
    method: 'POST',
    body: { city: 'tokyo', theme: 'mixed', days: 3, budget: 'mid', startDate: '2026-04-01', lang: 'en' }
  });
  assert(res.status === 200, 'POST /api/travel-plan returns 200');
  assert(Array.isArray(res.json?.recommendations), 'Travel plan has recommendations');
  assert(Array.isArray(res.json?.itinerary), 'Travel plan has itinerary');
  assert(res.json?.itinerary?.length === 3, 'Itinerary has 3 days', `got ${res.json?.itinerary?.length}`);
}

async function testDestSearchEndpoint() {
  const res = await fetchUrl('/api/dest-search', {
    method: 'POST',
    body: { city: 'osaka', theme: 'culture', budget: 'mid', limit: 5, lang: 'ja' }
  });
  assert(res.status === 200, 'POST /api/dest-search returns 200');
  assert(Array.isArray(res.json?.destinations), 'Dest search has destinations array');
}

async function testFoodsEndpoint() {
  const res = await fetchUrl('/api/foods?city=tokyo&genre=ramen&budget=mid&lang=en');
  assert(res.status === 200, 'GET /api/foods returns 200');
  assert(Array.isArray(res.json?.list), 'Foods has list array');
}

async function testFlightsEndpoint() {
  const res = await fetchUrl('/api/flights', {
    method: 'POST',
    body: {
      city: 'tokyo', tripType: 'oneway',
      from: 'ICN', to: 'NRT',
      departDate: '2026-05-01',
      preference: 'balanced',
      filters: {}
    }
  });
  assert(res.status === 200, 'POST /api/flights returns 200');
  assert(Array.isArray(res.json?.flights), 'Flights has flights array');
}

async function testStaysEndpoint() {
  const res = await fetchUrl('/api/stays', {
    method: 'POST',
    body: {
      city: 'tokyo', checkIn: '2026-05-01', checkOut: '2026-05-03',
      guests: 2, rooms: 1, preference: 'balanced',
      aiHints: {}, filters: {}
    }
  });
  assert(res.status === 200, 'POST /api/stays returns 200');
  assert(Array.isArray(res.json?.stays), 'Stays has stays array');
}

async function testRateLimiting() {
  // Make many rapid requests
  const promises = [];
  for (let i = 0; i < 65; i++) {
    promises.push(fetchUrl('/api/health'));
  }
  const results = await Promise.all(promises);
  const rateLimited = results.some(r => r.status === 429);
  assert(rateLimited, 'Rate limiting triggers after 60 requests/min');
}

async function testInputValidation() {
  // Invalid days value
  const res = await fetchUrl('/api/travel-plan', {
    method: 'POST',
    body: { city: 'tokyo', theme: 'invalid_theme', days: 99 }
  });
  assert(res.status === 400, 'Invalid theme returns 400', `got ${res.status}`);
}

async function testNotFoundEndpoint() {
  const res = await fetchUrl('/api/nonexistent');
  assert(res.status === 404, 'Unknown API endpoint returns 404');
}

async function testStaticFiles() {
  const jsRes = await fetchUrl('/app.js');
  assert(jsRes.status === 200, 'GET /app.js returns 200');
  assert(jsRes.headers['content-type'].includes('javascript'), 'app.js has JS content-type');

  const cssRes = await fetchUrl('/styles.css');
  assert(cssRes.status === 200, 'GET /styles.css returns 200');
  assert(cssRes.headers['content-type'].includes('css'), 'styles.css has CSS content-type');
}

async function testPathTraversal() {
  const res = await fetchUrl('/../server.js');
  assert(res.status === 403 || res.status === 404, 'Path traversal blocked', `got ${res.status}`);
}

// ==================== CODE ANALYSIS TESTS ====================

async function testServerCodeFeatures() {
  const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

  // fetchWithRetry
  assert(serverCode.includes('async function fetchWithRetry'), 'server.js contains fetchWithRetry function');
  assert(serverCode.includes('maxRetries'), 'fetchWithRetry has maxRetries parameter');
  assert(serverCode.includes('Math.pow(2, attempt)'), 'fetchWithRetry uses exponential backoff');

  // Security headers
  assert(serverCode.includes("'X-Content-Type-Options': 'nosniff'"), 'server.js has nosniff header');
  assert(serverCode.includes("'X-Frame-Options': 'DENY'"), 'server.js has X-Frame-Options DENY for API');
  assert(serverCode.includes("'X-Frame-Options': 'SAMEORIGIN'"), 'server.js has X-Frame-Options SAMEORIGIN for static');
  assert(serverCode.includes("'Permissions-Policy'"), 'server.js has Permissions-Policy header');

  // Session timeout
  assert(serverCode.includes('SESSION_MAX_AGE_MS'), 'server.js has session timeout constant');
  assert(serverCode.includes('7 * 24 * 60 * 60 * 1000'), 'Session timeout is 7 days');
  assert(serverCode.includes('Clean up expired sessions'), 'server.js has session cleanup logic');
}

async function testAppJsFeatures() {
  const appCode = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

  // PDF Export
  assert(appCode.includes('btnExportPdf'), 'app.js has PDF export handler');
  assert(appCode.includes('window.print()'), 'PDF export uses window.print');

  // Map route lines
  assert(appCode.includes('itinPolylines'), 'app.js has polyline variable');
  assert(appCode.includes('google.maps.Polyline'), 'app.js creates Polylines for routes');
  assert(appCode.includes('_origUpdateItinMap'), 'app.js wraps updateItinMap for polylines');

  // Wishlist
  assert(appCode.includes('travelWishlist'), 'app.js has wishlist localStorage key');
  assert(appCode.includes('getWishlist'), 'app.js has getWishlist function');
  assert(appCode.includes('toggleWishlist'), 'app.js has toggleWishlist function');
  assert(appCode.includes('renderWishlistPanel'), 'app.js has renderWishlistPanel function');
  assert(appCode.includes('addWishlistButtons'), 'app.js adds wishlist buttons to cards');
  assert(appCode.includes('wishlist-btn'), 'app.js has wishlist button class');

  // Search History
  assert(appCode.includes('travelSearchHistory'), 'app.js has search history localStorage key');
  assert(appCode.includes('addSearchHistory'), 'app.js has addSearchHistory function');
  assert(appCode.includes('renderSearchHistoryPanel'), 'app.js has renderSearchHistoryPanel function');
  assert(appCode.includes('SEARCH_HISTORY_MAX'), 'app.js has search history max limit');

  // User Preference Learning
  assert(appCode.includes('travelPreferences'), 'app.js has preferences localStorage key');
  assert(appCode.includes('trackPreference'), 'app.js has trackPreference function');
  assert(appCode.includes('getTopPreferences'), 'app.js has getTopPreferences function');
  assert(appCode.includes('showPreferenceHints'), 'app.js shows preference hints');

  // Language Switcher
  assert(appCode.includes('I18N'), 'app.js has I18N dictionary');
  assert(appCode.includes('applyLanguage'), 'app.js has applyLanguage function');
  assert(appCode.includes('travelLang'), 'app.js stores language in localStorage');
  assert(appCode.includes('en:') || appCode.includes("'en'"), 'I18N has English translations');
  assert(appCode.includes('ja:') || appCode.includes("'ja'"), 'I18N has Japanese translations');
}

async function testIndexHtmlFeatures() {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

  assert(html.includes('btnExportPdf'), 'index.html has PDF export button');
  assert(html.includes('btnWishlist'), 'index.html has wishlist button');
  assert(html.includes('btnSearchHistory'), 'index.html has search history button');
  assert(html.includes('langSwitcher'), 'index.html has language switcher');
  assert(html.includes('wishlistPanel'), 'index.html has wishlist panel');
  assert(html.includes('searchHistoryPanel'), 'index.html has search history panel');
  assert(html.includes('data-lang="en"'), 'index.html has English language button');
  assert(html.includes('data-lang="ja"'), 'index.html has Japanese language button');
}

async function testCssFeatures() {
  const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

  assert(css.includes('.lang-switcher'), 'CSS has lang-switcher styles');
  assert(css.includes('.lang-btn'), 'CSS has lang-btn styles');
  assert(css.includes('.wishlist-content'), 'CSS has wishlist-content styles');
  assert(css.includes('.wishlist-btn'), 'CSS has wishlist-btn styles');
  assert(css.includes('.wishlist-item'), 'CSS has wishlist-item styles');
  assert(css.includes('.search-history-content'), 'CSS has search-history-content styles');
  assert(css.includes('.search-history-item'), 'CSS has search-history-item styles');
  assert(css.includes('.pref-badge'), 'CSS has pref-badge styles');
}


async function testI18nLangPropagation() {
  const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

  // Server: all Google Places functions accept lang parameter
  assert(
    /function fetchGoogleAttractions\([^)]*lang/.test(serverCode),
    'fetchGoogleAttractions has lang parameter'
  );
  assert(
    /function fetchPlacesWithGoogle\([^)]*lang/.test(serverCode),
    'fetchPlacesWithGoogle has lang parameter'
  );
  assert(
    /function fetchFoodPlacesForCity\([^)]*lang/.test(serverCode),
    'fetchFoodPlacesForCity has lang parameter'
  );
  assert(
    /function fetchRecommendedFoods\([^)]*lang/.test(serverCode),
    'fetchRecommendedFoods has lang parameter'
  );
  assert(
    /function ensureDynamicCityProfile\([^)]*lang/.test(serverCode),
    'ensureDynamicCityProfile has lang parameter'
  );
  assert(
    /function recommendDestinations\(/.test(serverCode),
    'recommendDestinations function exists'
  );
  assert(
    /recommendDestinations[\s\S]{0,50}lang\s*=\s*payload\.lang/.test(serverCode),
    'recommendDestinations extracts lang from payload'
  );

  // Server: languageCode uses lang variable (not hardcoded 'ko')
  const langCodeMatches = serverCode.match(/languageCode:\s*'ko'/g);
  assert(
    !langCodeMatches || langCodeMatches.length === 0,
    'No hardcoded languageCode: ko in server (all use lang param)',
    `found ${langCodeMatches ? langCodeMatches.length : 0} hardcoded instances`
  );

  // Server: localizeType and localizeAddress accept lang
  assert(
    /function localizeType\([^)]*lang/.test(serverCode),
    'localizeType has lang parameter'
  );
  assert(
    /function localizeAddress\([^)]*lang/.test(serverCode),
    'localizeAddress has lang parameter'
  );

  // Server: multi-language type dictionaries exist
  assert(serverCode.includes('PRIMARY_TYPE_EN'), 'server.js has English type dictionary');
  assert(serverCode.includes('PRIMARY_TYPE_JA'), 'server.js has Japanese type dictionary');
  assert(serverCode.includes('PRIMARY_TYPE_KO'), 'server.js has Korean type dictionary');

  // App.js: API calls include lang parameter
  assert(
    appCode.includes('lang: currentLang'),
    'app.js sends lang: currentLang in API calls'
  );

  // App.js: t() translation helper exists
  assert(
    /function t\(/.test(appCode),
    'app.js has t() translation helper function'
  );

  // App.js: I18N has all 3 languages
  assert(appCode.includes('ko:'), 'I18N dictionary has Korean (ko)');
  assert(appCode.includes('en:'), 'I18N dictionary has English (en)');
  assert(appCode.includes('ja:'), 'I18N dictionary has Japanese (ja)');
}


async function testI18nApiEndpoints() {
  // Test travel-plan with Japanese lang
  const jaRes = await fetchUrl('/api/travel-plan', {
    method: 'POST',
    body: { city: 'tokyo', theme: 'mixed', days: 2, budget: 'mid', startDate: '2026-04-01', lang: 'ja' }
  });
  assert(jaRes.status === 200, 'Travel plan with lang=ja returns 200');
  assert(Array.isArray(jaRes.json?.recommendations), 'Travel plan (ja) has recommendations');

  // Test dest-search with English lang
  const enRes = await fetchUrl('/api/dest-search', {
    method: 'POST',
    body: { city: 'tokyo', theme: 'nature', budget: 'mid', limit: 3, lang: 'en' }
  });
  assert(enRes.status === 200, 'Dest search with lang=en returns 200');
  assert(Array.isArray(enRes.json?.destinations), 'Dest search (en) has destinations');

  // Test foods with Japanese lang
  const jaFoodRes = await fetchUrl('/api/foods?city=osaka&genre=ramen&budget=mid&lang=ja');
  assert(jaFoodRes.status === 200, 'Foods with lang=ja returns 200');
  assert(Array.isArray(jaFoodRes.json?.list), 'Foods (ja) has list array');
}

// ==================== MAIN ====================

async function runAllTests() {
  console.log('\n\u2550\u2550\u2550 JapanTravel Suite - Automated Test Suite \u2550\u2550\u2550\n');

  // Code analysis tests (no server needed)
  console.log('--- Code Analysis Tests ---');
  await testServerCodeFeatures();
  await testAppJsFeatures();
  await testIndexHtmlFeatures();
  await testCssFeatures();
  await testI18nLangPropagation();

  // Server tests
  console.log('--- Starting Test Server ---');
  try {
    await startServer();
  } catch (err) {
    console.error('Failed to start server:', err.message);
    console.log('\nSkipping server tests (server startup failed)');
    printResults();
    return;
  }

  console.log('--- API Endpoint Tests ---');
  try {
    await testHealthEndpoint();
    await testSecurityHeaders();
    await testCitiesEndpoint();
    await testMapsConfigEndpoint();
    await testFxRateEndpoint();
    await testAuthProvidersEndpoint();
    await testAuthMeEndpoint();
    await testStaticFiles();
    await testPathTraversal();
    await testNotFoundEndpoint();

    console.log('--- Feature Tests ---');
    await testTravelPlanEndpoint();
    await testDestSearchEndpoint();
    await testFoodsEndpoint();
    await testFlightsEndpoint();
    await testStaysEndpoint();
    await testI18nApiEndpoints();

    console.log('--- Security Tests ---');
    await testInputValidation();
    await testRateLimiting();
  } catch (err) {
    log('FAIL', 'Unexpected error', err.message);
  }

  stopServer();
  printResults();
}

function printResults() {
  console.log('\n\u2550\u2550\u2550 Test Results \u2550\u2550\u2550\n');
  for (const r of results) console.log(r);
  console.log(`\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.log('\n\u274C SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('\n\u2705 ALL TESTS PASSED');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Test suite crashed:', err);
  stopServer();
  process.exit(1);
});
