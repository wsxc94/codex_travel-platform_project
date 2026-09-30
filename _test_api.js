/**
 * Tabimaru 수동 점검 스크립트(개발용) — 자동 테스트(npm test)와 별개이며 CI에서 돌리지 않는다.
 *
 *   node _test_api.js          로컬 서버(PORT, 기본 3000)만 확인한다. 외부 유료 API는 부르지 않는다.
 *   node _test_api.js --google Google Places(New) Text Search 1회 + Geocoding 1회를 실제로 호출한다(과금될 수 있음).
 *
 * 키는 GOOGLE_MAPS_SERVER_KEY(없으면 예전 이름 GOOGLE_MAPS_API_KEY)를 셸 환경변수 또는 .env에서 읽는다.
 * 키는 앞 4자와 길이만 출력한다.
 */
const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function env(...names) {
  for (const n of names) {
    const v = String(process.env[n] || '').trim();
    if (v) return v;
  }
  return '';
}

function mask(secret) {
  return secret ? `${secret.slice(0, 4)}… (${secret.length}자)` : '없음';
}

// Google 오류 본문에서 원인만 뽑는다(Places(New): error.status + details[].reason, 레거시: status + error_message).
function googleReason(body) {
  const err = body && body.error ? body.error : null;
  const details = Array.isArray(err?.details) ? err.details : [];
  const reason = (details.find((d) => d && d.reason) || {}).reason || '';
  return [err?.status || body?.status || '', reason, err?.message || body?.error_message || ''].filter(Boolean).join(' | ');
}

async function readJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
}

async function checkGoogle(apiKey) {
  console.log('\n=== Google Places API (New) Text Search — 1회 ===');
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName'
      },
      body: JSON.stringify({ textQuery: '도쿄 인기 관광지', maxResultCount: 1, languageCode: 'ko', regionCode: 'JP' })
    });
    const data = await readJson(res);
    console.log('HTTP', res.status);
    if (!res.ok || data.error) {
      console.log('실패 원인:', googleReason(data));
      console.log('  403 BILLING_DISABLED → 결제 계정 연결 필요, 429 RESOURCE_EXHAUSTED → 하루 할당량 소진,');
      console.log('  403 API_KEY_HTTP_REFERRER_BLOCKED → 서버 키에 리퍼러 제한이 걸려 있음(서버 키는 리퍼러 제한 금지)');
    } else {
      const p = (data.places || [])[0];
      console.log('결과:', p ? `${p.displayName?.text || '-'} (${p.id})` : '0건');
    }
  } catch (e) {
    console.log('요청 실패:', e.message);
  }

  console.log('\n=== Google Geocoding API — 1회 ===');
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('도쿄 Japan')}&language=ko&region=jp&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    const data = await readJson(res);
    // Geocoding은 거부되어도 HTTP 200을 주고 status로 알린다(REQUEST_DENIED, OVER_QUERY_LIMIT 등).
    console.log('HTTP', res.status, '| status', data.status || '-');
    if (data.status === 'OK' && data.results?.[0]) {
      const loc = data.results[0].geometry.location;
      console.log('좌표:', loc.lat, loc.lng, '|', data.results[0].formatted_address);
    } else {
      console.log('실패 원인:', googleReason(data) || '결과 없음');
    }
  } catch (e) {
    console.log('요청 실패:', e.message);
  }
}

async function checkLocalServer(port) {
  const base = `http://localhost:${port}`;
  console.log(`\n=== 로컬 서버 ${base} ===`);
  try {
    const health = await readJson(await fetch(`${base}/api/health`));
    console.log('모드:', JSON.stringify(health.providers || {}), '| app:', health.app, '| brand:', health.brand || '-');
  } catch (e) {
    console.log('서버에 연결하지 못했습니다. 먼저 `node server.js`로 서버를 띄우세요.', e.message);
    return;
  }

  console.log('\n--- /api/foods (라멘, 도쿄) ---');
  try {
    const data = await readJson(await fetch(`${base}/api/foods?city=tokyo&genre=${encodeURIComponent('라멘')}&budget=mid`));
    console.log('출처:', JSON.stringify(data.sourceInfo || { source: data.source }));
    if (data.warning) console.log('안내:', data.warning);
    (data.list || []).slice(0, 5).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} | ${p.genre} | 평점 ${p.score ?? '-'} | ${p.area || p.address || '-'}`);
    });
  } catch (e) {
    console.log('맛집 API 오류:', e.message);
  }

  console.log('\n--- /api/destinations (오사카, 미식) ---');
  try {
    const res = await fetch(`${base}/api/destinations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'osaka', theme: 'foodie', budget: 'mid', limit: 6 })
    });
    const data = await readJson(res);
    console.log('출처:', JSON.stringify(data.sourceInfo || { source: data.source }));
    (data.picks || []).slice(0, 6).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} | ${p.category} | 점수 ${p.aiScore} | 사진 ${p.photoUrl ? '있음' : '없음'}`);
    });
  } catch (e) {
    console.log('여행지 API 오류:', e.message);
  }
}

async function main() {
  loadDotEnv();
  const useGoogle = process.argv.includes('--google');
  const port = env('PORT') || '3000';
  const apiKey = env('GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY');
  console.log('서버 키:', mask(apiKey), env('GOOGLE_MAPS_SERVER_KEY') ? '(GOOGLE_MAPS_SERVER_KEY)' : (apiKey ? '(예전 이름 GOOGLE_MAPS_API_KEY)' : ''));

  if (useGoogle) {
    if (!apiKey) console.log('\nGoogle 점검을 건너뜁니다: GOOGLE_MAPS_SERVER_KEY가 없습니다.');
    else await checkGoogle(apiKey);
  } else {
    console.log('(Google 실제 호출은 하지 않습니다. 필요하면 --google 을 붙이세요. 과금될 수 있습니다.)');
  }
  await checkLocalServer(port);
}

main().catch((e) => {
  console.error('점검 실패:', e.message);
  process.exit(1);
});
