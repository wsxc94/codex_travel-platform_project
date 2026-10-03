#!/usr/bin/env node
/*
 * Travelpayouts(Aviasales Data API v3) market·응답 통화 점검표 (수동 실행용, npm test 아님).
 *
 * docs/api-review-2026-10-02.md 5절 5번의 완료 기준 "market 기본값과 지정값의 결과 수 비교, 응답 currency=krw 확인"용.
 * 같은 노선·달을 market 없이(기본) / market을 지정해 prices_for_dates·grouped_prices에 물어 보고
 * 결과 수·출발 날짜 수·최저가·응답 통화를 표로 보여 준다. 서버(server.js)는 지금 market을 보내지 않는다(API 기본값).
 * 더 많은 결과를 주는 market이 있으면 그때 서버에 넣을지 정한다.
 *
 * 토큰: 환경변수 TRAVELPAYOUTS_TOKEN. 없으면 지금 폴더의 .env에서 같은 이름 줄만 읽는다(파일은 고치지 않음).
 * 토큰은 화면에 찍지 않는다(오류 글에서도 *** 로 가림).
 * 실제 Travelpayouts를 부른다: 기본값(노선 4 × market 5(기본 포함) × 2종) = 40회. 공식 한도는 분당 600회.
 *
 * 사용법:
 *   node scripts/travelpayouts-check.mjs
 *   node scripts/travelpayouts-check.mjs --markets ru,us,kr,jp --month 2026-11 --routes ICN-NRT,ICN-KIX,GMP-HND,PUS-FUK
 *   node scripts/travelpayouts-check.mjs --base http://127.0.0.1:3000   (가짜 서버로 모양만 볼 때. 기본은 https://api.travelpayouts.com)
 *   node scripts/travelpayouts-check.mjs --json out.json                 (표와 같은 내용을 파일로도 저장)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function tokenFromDotenv() {
  try {
    const text = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const m = /^\s*TRAVELPAYOUTS_TOKEN\s*=\s*(.*)$/m.exec(text);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
  } catch { return ''; }
}

const TOKEN = String(process.env.TRAVELPAYOUTS_TOKEN || '').trim() || tokenFromDotenv();
const BASE = String(arg('base', process.env.TRAVELPAYOUTS_API_BASE || 'https://api.travelpayouts.com')).replace(/\/+$/, '');
const nextMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
const MONTH = arg('month', nextMonth);
const MARKETS = ['', ...String(arg('markets', 'ru,us,kr,jp')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)];
const ROUTES = String(arg('routes', 'ICN-NRT,ICN-KIX,ICN-FUK,GMP-HND')).split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{3}-[A-Z]{3}$/.test(s));
const JSON_OUT = arg('json', '');

const redact = (s) => (TOKEN ? String(s || '').split(TOKEN).join('***') : String(s || ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('TRAVELPAYOUTS_TOKEN이 없습니다. PowerShell: $env:TRAVELPAYOUTS_TOKEN="<토큰>" 후 다시 실행하거나 .env에 넣어 주세요.');
  process.exit(2);
}
if (!/^\d{4}-\d{2}$/.test(MONTH) || ROUTES.length === 0) {
  console.error('--month는 YYYY-MM, --routes는 ICN-NRT 같은 3글자 공항 코드 쌍이어야 합니다.');
  process.exit(2);
}

async function ask(endpoint, route, market) {
  const [origin, destination] = route.split('-');
  const q = new URLSearchParams(endpoint === 'grouped_prices'
    ? { origin, destination, departure_at: MONTH, currency: 'krw', group_by: 'departure_at', direct: 'false' }
    : { origin, destination, departure_at: MONTH, currency: 'krw', one_way: 'true', sorting: 'price', direct: 'false', limit: '100' });
  if (market) q.set('market', market);
  q.set('token', TOKEN);
  try {
    const res = await fetch(`${BASE}/aviasales/v3/${endpoint}?${q}`, { signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    if (!res.ok || !json || json.success === false) return { error: `HTTP ${res.status} ${redact(text).replace(/\s+/g, ' ').slice(0, 120)}` };
    const rows = Array.isArray(json.data) ? json.data : (json.data && typeof json.data === 'object' ? Object.values(json.data) : []);
    const dates = new Set(rows.map((r) => String(r?.departure_at || '').slice(0, 10)).filter(Boolean));
    const prices = rows.map((r) => Number(r?.price)).filter((n) => Number.isFinite(n) && n > 0);
    return { count: rows.length, dates: dates.size, minPrice: prices.length ? Math.min(...prices) : null, currency: String(json.currency || '(없음)') };
  } catch (err) {
    return { error: redact(err?.cause?.code || err?.message || err) };
  }
}

const results = [];
console.log(`Travelpayouts 점검: ${BASE} · 달 ${MONTH} · 노선 ${ROUTES.join(', ')} · market ${MARKETS.map((m) => m || '(기본)').join(', ')}\n`);
for (const route of ROUTES) {
  for (const endpoint of ['prices_for_dates', 'grouped_prices']) {
    for (const market of MARKETS) {
      const r = await ask(endpoint, route, market);
      results.push({ route, endpoint, market: market || '(기본)', ...r });
      await sleep(250);
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('노선', 9)}${pad('종류', 18)}${pad('market', 8)}${pad('결과', 6)}${pad('날짜', 6)}${pad('최저가', 12)}통화`);
for (const r of results) {
  console.log(r.error
    ? `${pad(r.route, 9)}${pad(r.endpoint, 18)}${pad(r.market, 8)}오류: ${r.error}`
    : `${pad(r.route, 9)}${pad(r.endpoint, 18)}${pad(r.market, 8)}${pad(r.count, 6)}${pad(r.dates, 6)}${pad(r.minPrice ?? '-', 12)}${r.currency}`);
}

console.log('\n요약 (market별 결과 수 합계, 기본 대비)');
const base = results.filter((r) => r.market === '(기본)' && !r.error).reduce((s, r) => s + r.count, 0);
for (const market of MARKETS.map((m) => m || '(기본)')) {
  const rows = results.filter((r) => r.market === market);
  const ok = rows.filter((r) => !r.error);
  const sum = ok.reduce((s, r) => s + r.count, 0);
  console.log(`  ${pad(market, 8)} 결과 ${pad(sum, 6)} (기본 ${base}) · 오류 ${rows.length - ok.length}회`);
}
const withRows = results.filter((r) => !r.error && r.count > 0);
const nonKrw = withRows.filter((r) => String(r.currency).toLowerCase() !== 'krw');
if (withRows.length === 0) console.log('  응답 통화: 결과가 있는 응답이 없어 확인하지 못함');
else console.log(nonKrw.length === 0
  ? `  응답 통화: 결과가 있는 응답 ${withRows.length}건 모두 krw`
  : `  응답 통화: krw가 아닌 응답 ${nonKrw.length}건 (${[...new Set(nonKrw.map((r) => r.currency))].join(', ')}) — 서버는 usd·jpy·eur만 원화로 바꾸고 나머지는 쓰지 않는다`);

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, month: MONTH, routes: ROUTES, markets: MARKETS, results }, null, 2));
  console.log(`\n저장: ${JSON_OUT}`);
}
