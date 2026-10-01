#!/usr/bin/env node
/*
 * 프롬프트 의도 반영 점검표(수동 실행용, npm test 아님).
 *
 * 실행 중인 서버에 대표 요청(P01-P16, N01-N03, A01-A04, 후속 대화 F01-F02)을 보내고, 화면의 [AI에게 맡기기] 흐름과 똑같이
 *   1) POST /api/ai-travel-chat  → 해석 결과(parsed)·꼭 갈 곳 카드(selectedDestinations)
 *   2) POST /api/travel-plan     → 일정(itinerary)
 * 를 차례로 부른 뒤, 해석(도시·일수·테마·꼭 갈 곳·제외·조건)과 날짜별 일정 블록을 표로 보여 준다.
 * 일정 요청은 public/app.js(runChatPlan → applyAiConditions → buildPlanPayload)와 같은 본문을 만든다:
 *   request(요청 원문)·mustVisit(parsed.wantedPlaces)·excludedPlaces·foodWishes(foodKeyword 나눔)·_picks(selectedDestinations)
 *   ·_routeCities·_regionDayPlan·_specialPrefs, 후속 대화는 history·prevParsed를 함께 보낸다.
 * Gemini 무료 한도를 아끼려고 호출 사이를 4초 띄우고, 429/503(AI_BUSY)이면 60초 쉬고 한 번만 다시 시도한다.
 * 하루 한도가 끝났으면(AI_DAILY_LIMIT) 다시 시도하지 않고 규칙 결과를 그대로 보여 준다.
 *
 * 사용법:
 *   node scripts/prompt-matrix.mjs                         (기본 http://127.0.0.1:3000, 전부)
 *   node scripts/prompt-matrix.mjs --base http://127.0.0.1:3000 --only P01,P14 --gap 5000
 *   node scripts/prompt-matrix.mjs --json out.json          (원본 응답도 파일로 저장)
 *
 * 서버는 미리 띄워 둔다(예: npm start). 이 스크립트를 돌리는 동안에만 AI를 부른다(1건 = Gemini 호출 약 2회, 후속 대화는 차례마다 2회).
 */
import { writeFileSync } from 'node:fs';

const CASES = [
  { id: 'P01', prompt: '오사카 3박 4일, 유니버설 스튜디오는 하루 통째로, 도톤보리는 저녁에 꼭 가고 싶어' },
  { id: 'P02', prompt: '도쿄 2박3일 부모님 모시고 가요. 많이 안 걷고 여유롭게, 하루 2~3곳만' },
  { id: 'P03', prompt: '교토 2일, 사찰이랑 정원 위주로. 쇼핑은 빼줘' },
  { id: 'P04', prompt: '후쿠오카 1박2일 먹방 여행, 라멘이랑 모츠나베는 꼭 먹고 싶어', followups: ['하루 더 늘려줘'] },
  { id: 'P05', prompt: '삿포로 4일 겨울 여행인데 오타루 당일치기를 하루 넣어줘' },
  { id: 'P06', prompt: '도쿄 5일 애니·서브컬처 위주로, 아키하바라 이케부쿠로 나카노는 꼭' },
  { id: 'P07', prompt: '5살, 8살 아이 둘 데리고 오키나와 4일, 츄라우미 수족관은 필수' },
  { id: 'P08', prompt: '오사카 3일 교토 2일 나라 1일로 짜줘', followups: ['교토 하루 더 늘려줘'] },
  { id: 'P09', prompt: '도쿄 3일인데 비가 많이 올 것 같아서 실내 위주로' },
  { id: 'P10', prompt: '오사카 3박4일, 첫날은 밤 9시 도착이라 일정 비워주고 마지막 날은 오전 비행기야' },
  { id: 'P11', prompt: 'Tokyo 3 days, first time in Japan, classic highlights, I love sushi', lang: 'en' },
  { id: 'P12', prompt: '京都で2日間、紅葉の名所を回りたい', lang: 'ja' },
  { id: 'P13', prompt: '도쿄' },
  { id: 'P14', prompt: '도쿄 3일, 디즈니랜드는 빼고 아침 10시 이후에 시작하고 싶어' },
  { id: 'P15', prompt: '하코네 1박2일 온천 료칸, 이동은 최소로' },
  { id: 'P16', prompt: '오사카 3박4일 저예산, 무료 명소 위주로 1인 50만원' },
  { id: 'N01', prompt: '11월 20일부터 교토 3일, 기요미즈데라랑 쇼핑은 빼고 후시미 이나리는 꼭 가고, 하루 2곳만 여유롭게, 아침 11시 이후 시작' },
  { id: 'N02', prompt: '오사카 2박3일, 유니버설은 말고 나라 당일치기 하루 넣어주고 마지막 날은 오후 3시 비행기야. 저녁엔 꼭 오코노미야키' },
  { id: 'N03', prompt: 'Osaka 4 days with my two kids, skip Universal Studios, we must see Kaiyukan aquarium, no shopping please, start after 10am', lang: 'en' },
  { id: 'A01', prompt: '도쿄 3일, 디즈니랜드랑 디즈니씨는 빼고 시부야 스카이는 꼭' },
  { id: 'A02', prompt: '오사카 3일인데 도톤보리 말고 신세카이 위주로, 쿠시카츠 꼭 먹고 싶어' },
  { id: 'A03', prompt: '교토 2일, 금각사 대신 은각사 넣어줘' },
  { id: 'A04', prompt: 'Tokyo 2 days, no Disney, must visit teamLab Planets, start at 11am', lang: 'en' },
  { id: 'F01', prompt: '오사카 3일, 도톤보리 꼭', followups: ['도톤보리 빼줘', '하루 더 늘려줘', '첫날은 오후 3시 도착이야'] },
  { id: 'F02', prompt: 'Tokyo 3 days', lang: 'en', followups: ['add one more day', 'skip Ginza Six'] }
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = String(arg('base', process.env.BASE_URL || 'http://127.0.0.1:3000')).replace(/\/+$/, '');
const GAP_MS = Math.max(4000, Number(arg('gap', 4000)) || 4000);
const ONLY = String(arg('only', '')).split(',').map((s) => s.trim()).filter(Boolean);
const JSON_OUT = arg('json', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function futureDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function postJson(path, body) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, ms: Date.now() - t0, json };
}

const reasonsOf = (r) => [r.json?.sourceInfo?.reasonCode, r.json?.itineraryInfo?.reasonCode, ...(r.json?.aiErrors || []).map((e) => e.reasonCode)].filter(Boolean);
// 잠깐 바쁨(429/503 = AI_BUSY)만 다시 시도한다. 하루 한도 소진(AI_DAILY_LIMIT)은 기다려도 안 풀린다.
const isBusy = (r) => r.status === 429 || (reasonsOf(r).includes('AI_BUSY') && !reasonsOf(r).includes('AI_DAILY_LIMIT'));

// 바쁨(429/503)이면 60초 쉬고 한 번만 다시 부른다.
async function callWithRetry(path, body) {
  const first = await postJson(path, body);
  if (!isBusy(first)) return first;
  console.log(`  … ${path}: AI가 바빠서 60초 뒤 한 번 더 시도합니다`);
  await sleep(60_000);
  return postJson(path, body);
}

function truePrefs(sp) {
  return Object.entries(sp || {}).filter(([k, v]) => v === true || (k === 'maxPlacesPerDay' && v)).map(([k, v]) => (v === true ? k : `${k}=${v}`));
}

function short(list, n = 4) {
  const arr = (list || []).filter(Boolean);
  return arr.length ? arr.slice(0, n).join(', ') + (arr.length > n ? ` 외 ${arr.length - n}` : '') : '-';
}

// public/app.js splitFoodWishes·cleanNameList·normalizeDestinationForPlan과 같은 규칙
function splitFoodWishes(keyword) {
  return String(keyword || '').split(/\s*(?:[,，、·/]|이랑(?=\s|$)|랑(?=\s|$)|하고(?=\s|$)|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean).slice(0, 3);
}
function cleanNameList(list, max) {
  return (Array.isArray(list) ? list : []).map((x) => (typeof x === 'string' ? x.trim() : (x && x.name ? String(x.name).trim() : ''))).filter(Boolean).slice(0, max || 8);
}
function destinationForPlan(d, cityLabel) {
  return d ? { name: d.name || '추천 여행지', city: d.city || cityLabel || '', area: d.area || '', category: d.category || '추천', bestTime: d.bestTime || '09:00-17:00', stayMin: Number(d.stayMin || 90) } : null;
}

async function runCase(c) {
  const lang = c.lang || 'ko';
  // budget: app.js의 숨은 #budget(currentBudgetTier)처럼 채팅이 정한 예산 단계를 다음 요청에 싣는다
  const form = { city: 'tokyo', theme: 'mixed', days: 4, startDate: futureDate(14), budget: 'mid' };
  const turns = [c.prompt, ...(c.followups || [])];
  let history = [];
  let lastParsed = null;
  const out = [];
  for (let ti = 0; ti < turns.length; ti += 1) {
    const text = turns[ti];
    const context = { city: form.city, theme: form.theme, budget: form.budget, days: form.days, startDate: form.startDate };
    const chat = await callWithRetry('/api/ai-travel-chat', { message: text, context, lang, history: history.slice(-12), prevParsed: lastParsed });
    const parsed = chat.json?.parsed || {};
    // applyAiConditions: 폼 값을 해석 결과로 바꾼다
    if (parsed.cityKey) form.city = parsed.cityKey;
    if (['mixed', 'foodie', 'culture', 'shopping', 'nature'].includes(parsed.theme)) form.theme = parsed.theme;
    if (['low', 'mid', 'high'].includes(parsed.budget)) form.budget = parsed.budget;
    if (Number.isFinite(Number(parsed.days))) form.days = Math.max(1, Math.min(10, Number(parsed.days)));
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(parsed.startDate || ''))) form.startDate = parsed.startDate;
    for (const [role, content] of [['user', text], ['assistant', chat.json?.reply || '']]) {
      const t = String(content || '').slice(0, 500);
      if (t) history.push({ role, content: t });
    }
    history = history.slice(-12);
    lastParsed = parsed;
    await sleep(GAP_MS);
    // buildPlanPayload와 같은 본문
    const plan = { city: form.city, theme: form.theme, startDate: form.startDate, days: form.days, pace: 'normal', budget: form.budget, useAi: true, lang, request: text.slice(0, 500) };
    if (Array.isArray(parsed.routeCities) && parsed.routeCities.length) plan._routeCities = parsed.routeCities;
    if (Array.isArray(parsed.regionDayPlan) && parsed.regionDayPlan.length) plan._regionDayPlan = parsed.regionDayPlan;
    if (parsed.specialPrefs && Object.keys(parsed.specialPrefs).length) plan._specialPrefs = parsed.specialPrefs;
    const wanted = cleanNameList(parsed.wantedPlaces, 8);
    const excluded = cleanNameList(parsed.excludedPlaces, 8);
    const foodWishes = splitFoodWishes(parsed.foodKeyword);
    const picks = (Array.isArray(chat.json?.selectedDestinations) ? chat.json.selectedDestinations : []).map((d) => destinationForPlan(d, '')).filter(Boolean).slice(0, 8);
    if (wanted.length) plan.mustVisit = wanted;
    if (excluded.length) plan.excludedPlaces = excluded;
    if (foodWishes.length) plan.foodWishes = foodWishes;
    if (picks.length) plan._picks = picks;
    const itin = await callWithRetry('/api/travel-plan', plan);
    out.push({ text, chat, parsed, planReq: plan, itin });
    if (ti < turns.length - 1) await sleep(GAP_MS);
  }
  return { c, lang, turns: out };
}

function printCase(r) {
  console.log(`\n■ ${r.c.id} (${r.lang}) "${r.c.prompt}"`);
  r.turns.forEach((t, ti) => {
    const p = t.parsed;
    const info = t.itin.json?.itineraryInfo || {};
    const chatSrc = t.chat.json?.sourceInfo || {};
    if (ti > 0) console.log(`  ▷ 후속 대화 ${ti}: "${t.text}"`);
    console.log(`  해석[${chatSrc.kind || '?'}${chatSrc.reasonCode ? '/' + chatSrc.reasonCode : ''}, ${t.chat.ms}ms] 도시=${p.cityKey} 경로=${short(p.routeCities)} 일수=${p.days} 출발=${p.startDate} 테마=${p.theme} 예산=${p.budget}`);
    console.log(`  꼭 갈 곳=${short(p.wantedPlaces)} | 제외=${short(p.excludedPlaces)} | 미지원=${short(p.unsupportedPlaces)} | 맛집=${p.foodKeyword || '-'}`);
    console.log(`  조건=${short(truePrefs(p.specialPrefs), 8)} | 도착=${p.arrivalTime || '-'} 출발=${p.departureTime || '-'} 시작=${p.startTimeMin || '-'}`);
    console.log(`  꼭 갈 곳 카드=${short((t.chat.json?.selectedDestinations || []).map((d) => `${d.name}[${d.bestTime}]`), 6)}`);
    const pp = info.postProcess ? Object.entries(info.postProcess).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' ') : '';
    console.log(`  일정[${info.kind || '?'}${info.reasonCode ? '/' + info.reasonCode : ''}, ${t.itin.ms}ms] ${pp ? '후처리 ' + pp : ''}${(info.missingMustVisit || []).length ? ' | 못 넣은 곳=' + info.missingMustVisit.join(', ') : ''}`);
    for (const d of t.itin.json?.itinerary || []) {
      console.log(`    D${d.day} ${d.date}  ${(d.blocks || []).join('  ·  ')}`);
    }
  });
}

const list = ONLY.length ? CASES.filter((c) => ONLY.includes(c.id)) : CASES;
console.log(`Tabimaru 프롬프트 점검표 — ${BASE}, ${list.length}건, 호출 간격 ${GAP_MS}ms`);
const all = [];
for (let i = 0; i < list.length; i += 1) {
  try {
    const r = await runCase(list[i]);
    printCase(r);
    all.push({ id: r.c.id, prompt: r.c.prompt, lang: r.lang, turns: r.turns.map((t) => ({ text: t.text, chat: t.chat.json, planRequest: t.planReq, plan: t.itin.json })) });
  } catch (err) {
    console.log(`\n■ ${list[i].id} 실패: ${err?.message || err}`);
  }
  if (i < list.length - 1) await sleep(GAP_MS);
}
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
  console.log(`\n원본 응답 저장: ${JSON_OUT}`);
}
