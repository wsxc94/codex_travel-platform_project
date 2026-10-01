'use strict';

/*
 * Korean / English display names for Japanese places that Wikidata names only in Japanese
 * (used by scripts/build-city-places.js; no network, no dependencies).
 *
 * - Korean follows the National Institute of Korean Language rules for Japanese (일본어 표기법):
 *   word-initial k/t/ch are written ㄱ/ㄷ/ㅈ, inside a word ㅋ/ㅌ/ㅊ; ts(u) is 쓰; long vowels are not
 *   written; ん is ㄴ and っ is ㅅ as a final consonant. Generic words are translated the usual way
 *   ("X Shrine" → "X 신사", "Mount X" → "X산", "X Castle" → "X성", 温泉 → 온천).
 * - Sources, best first: the English Wikidata label when it is a Hepburn romanisation plus known
 *   English words ("Ryōzen Shrine", "Mount Shinobu", "Kamabuchi Falls"), then the kana reading
 *   (P1814, "りょうぜんじんじゃ") with a known kanji suffix, then a name that is kana only.
 *   Anything else (an English translation with other words, a long institutional name) gives null:
 *   the caller keeps the Japanese name rather than guessing.
 */

const MACRONS = { 'ā': 'a', 'ī': 'i', 'ū': 'u', 'ē': 'e', 'ō': 'o', 'â': 'a', 'î': 'i', 'û': 'u', 'ê': 'e', 'ô': 'o', 'Ā': 'a', 'Ī': 'i', 'Ū': 'u', 'Ē': 'e', 'Ō': 'o' };

// Hangul syllable from jamo names
const CHO = { g: 0, kk: 1, n: 2, d: 3, r: 5, m: 6, b: 7, s: 9, ss: 10, '': 11, j: 12, ch: 14, k: 15, t: 16, p: 17, h: 18 };
const JUNG = { a: 0, ya: 2, e: 5, ye: 7, o: 8, wa: 9, yo: 12, u: 13, yu: 17, eu: 18, i: 20 };
const JONG_N = 4;
const JONG_S = 19;
const syllable = (cho, jung) => String.fromCharCode(0xAC00 + (CHO[cho] * 21 + JUNG[jung]) * 28);
const withFinal = (ch, jong) => {
  const code = ch.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171 || code % 28 !== 0) return ch;
  return String.fromCharCode(ch.charCodeAt(0) + jong);
};

// Hepburn onsets, longest first
const ONSETS = ['ts', 'sh', 'ch', 'ky', 'gy', 'ny', 'hy', 'by', 'py', 'my', 'ry', 'j', 'f', 'k', 'g', 's', 'z', 't', 'd', 'n', 'h', 'b', 'p', 'm', 'y', 'r', 'w'];
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
// combinations that are not Hepburn (Nihon-shiki "si", "tu" …, or English spellings)
const INVALID = new Set(['si', 'ti', 'tu', 'hu', 'zi', 'di', 'du', 'yi', 'ye', 'wu', 'wi', 'we', 'tsa', 'tsi', 'tse', 'tso', 'fa', 'fi', 'fe', 'fo', 'kyi', 'kye', 'gyi', 'gye', 'nyi', 'nye', 'hyi', 'hye', 'byi', 'bye', 'pyi', 'pye', 'myi', 'mye', 'ryi', 'rye']);

// one romaji word → morae [{onset, vowel} | 'N' | 'Q'], or null when it is not Hepburn
function romajiMorae(word) {
  const w = String(word || '').toLowerCase().replace(/[āīūēōâîûêô]/g, (c) => MACRONS[c] || c);
  if (!/^[a-z']+$/.test(w)) return null;
  const out = [];
  let i = 0;
  while (i < w.length) {
    const c = w[i];
    if (c === "'") { i += 1; continue; }
    if (VOWELS.has(c)) { out.push({ onset: '', vowel: c }); i += 1; continue; }
    const next = w[i + 1];
    // moraic n: before a consonant (not y), before an apostrophe or at the end; m before b/m/p
    if (c === 'n' && (next === undefined || next === "'" || (!VOWELS.has(next) && next !== 'y'))) { out.push('N'); i += 1; continue; }
    if (c === 'm' && (next === 'b' || next === 'm' || next === 'p')) { out.push('N'); i += 1; continue; }
    // double consonant (small tsu): kk, ss, tt, pp …, and tch
    if (next === c && !VOWELS.has(c) && c !== 'n' && c !== 'y' && c !== 'w') { out.push('Q'); i += 1; continue; }
    if (c === 't' && next === 'c' && w[i + 2] === 'h') { out.push('Q'); i += 1; continue; }
    const onset = ONSETS.find((o) => w.startsWith(o, i));
    if (!onset) return null;
    const v = w[i + onset.length];
    if (!VOWELS.has(v)) return null;
    if (INVALID.has(onset + v)) return null;
    if (onset === 'ts' && v !== 'u') return null;
    if (onset === 'f' && v !== 'u') return null;
    if (/^[kgnhbpmr]y$/.test(onset) && v !== 'a' && v !== 'u' && v !== 'o') return null;
    if (onset === 'y' && v !== 'a' && v !== 'u' && v !== 'o') return null;
    if (onset === 'w' && v !== 'a' && v !== 'o') return null;
    out.push({ onset, vowel: v });
    i += onset.length + 1;
  }
  return out.length ? out : null;
}

// morae → Hangul; initial = the first mora starts a word (k/t/ch are then plain ㄱ/ㄷ/ㅈ)
function moraeToHangul(morae, initial = true) {
  let s = '';
  let first = initial;
  for (const m of morae) {
    if (m === 'N' || m === 'Q') {
      if (!s) return null;
      s = s.slice(0, -1) + withFinal(s.slice(-1), m === 'N' ? JONG_N : JONG_S);
      continue;
    }
    const { onset, vowel } = m;
    const base = onset.endsWith('y') && onset.length === 2 ? onset[0] : onset;
    const glide = (onset.length === 2 && onset.endsWith('y')) || onset === 'y' || onset === 'sh';
    let cho;
    switch (base) {
      case '': case 'y': case 'w': cho = ''; break;
      case 'k': cho = first ? 'g' : 'k'; break;
      case 'g': cho = 'g'; break;
      case 's': case 'sh': cho = 's'; break;
      case 'z': case 'j': cho = 'j'; break;
      case 't': cho = first ? 'd' : 't'; break;
      case 'ch': cho = first ? 'j' : 'ch'; break;
      case 'ts': cho = 'ss'; break;
      case 'd': cho = 'd'; break;
      case 'n': cho = 'n'; break;
      case 'h': case 'f': cho = 'h'; break;
      case 'b': cho = 'b'; break;
      case 'p': cho = 'p'; break;
      case 'm': cho = 'm'; break;
      case 'r': cho = 'r'; break;
      default: return null;
    }
    let jung;
    if (onset === 'w') jung = vowel === 'a' ? 'wa' : 'o';
    else if (vowel === 'i') jung = 'i';
    else if (vowel === 'u') jung = glide ? 'yu' : ((base === 's' || base === 'z' || base === 'ts') ? 'eu' : 'u');
    else if (vowel === 'a') jung = glide ? 'ya' : 'a';
    else if (vowel === 'o') jung = glide ? 'yo' : 'o';
    else jung = glide ? 'ye' : 'e';
    s += syllable(cho, jung);
    first = false;
  }
  return s || null;
}

// "Kamabuchi", "Azuma-kofuji", "Seiryū-ji" → Hangul (a hyphen joins the parts into one word)
function romajiWordToHangul(word) {
  const parts = String(word || '').split('-').filter(Boolean);
  if (!parts.length) return null;
  let out = '';
  for (let i = 0; i < parts.length; i += 1) {
    const morae = romajiMorae(parts[i]);
    if (!morae) return null;
    const h = moraeToHangul(morae, i === 0);
    if (!h) return null;
    out += h;
  }
  return out;
}

// ── English label → Korean ─────────────────────────────────────────────
// generic English words (lower case, longest first) → Korean; attach = written without a space
const EN_SUFFIX = [
  ['memorial museum of art', ' 기념 미술관'], ['museum of art', ' 미술관'], ['art museum', ' 미술관'], ['art gallery', ' 미술관'],
  ['memorial museum', ' 기념관'], ['memorial hall', ' 기념관'], ['historical museum', ' 역사 박물관'], ['history museum', ' 역사 박물관'],
  ['folk museum', ' 민속 박물관'], ['literature museum', ' 문학관'], ['literary museum', ' 문학관'], ['science museum', ' 과학관'],
  ['science center', ' 과학관'], ['science centre', ' 과학관'], ['museum of sculpture', ' 조각 미술관'], ['museum', ' 박물관'],
  ['botanical gardens', ' 식물원'], ['botanical garden', ' 식물원'], ['japanese garden', ' 일본 정원'], ['gardens', ' 정원'], ['garden', ' 정원'],
  ['grand shrine', ' 신사'], ['shrine', ' 신사'], ['castle ruins', '성터', true], ['castle site', '성터', true], ['castle remains', '성터', true],
  ['castle park', '성 공원', true], ['castle', '성', true], ['falls', ' 폭포'], ['waterfall', ' 폭포'],
  ['hot springs', ' 온천'], ['hot spring', ' 온천'], ['onsen', ' 온천'], ['seaside park', ' 해변 공원'], ['park', ' 공원'],
  ['zoo', ' 동물원'], ['aquarium', ' 수족관'], ['kofun cluster', ' 고분군'], ['kofun group', ' 고분군'], ['kofun', ' 고분'], ['tumulus', ' 고분'],
  ['shell mound', ' 패총'], ['ruins', ' 유적'], ['site', ' 유적'], ['beach', ' 해변'], ['coast', ' 해안'], ['lighthouse', ' 등대'],
  ['grand bridge', ' 대교'], ['ohashi bridge', ' 대교'], ['o-hashi bridge', ' 대교'], ['bridge', ' 다리'], ['limestone cave', ' 종유동'], ['cave', ' 동굴'], ['gorge', ' 협곡'], ['valley', ' 계곡'],
  ['pond', ' 연못'], ['marsh', ' 습원'], ['wetland', ' 습원'], ['wetlands', ' 습원'], ['plateau', ' 고원'], ['highlands', ' 고원'], ['dunes', ' 사구'],
  ['observation deck', ' 전망대'], ['observatory', ' 전망대'], ['tower', ' 타워'], ['market', ' 시장'], ['cathedral', ' 성당'], ['church', ' 교회'],
  ['former residence', ' 옛 저택'], ['residence', ' 저택'], ['house', ' 가옥'], ['gate', ' 문'], ['ropeway', ' 로프웨이'], ['pass', ' 고개'], ['island', '섬', true]
];
// descriptive words inside a name (before the generic word)
const EN_WORDS = {
  prefectural: '현립', municipal: '시립', national: '국립', city: '시', old: '옛', former: '옛', central: '중앙', ancient: '고대',
  historic: '역사', history: '역사', folk: '민속', contemporary: '현대', modern: '근대', japanese: '일본', memorial: '기념', art: '미술',
  science: '과학', nature: '자연', forest: '삼림', forestry: '삼림', prefecture: '현', sculpture: '조각', literature: '문학', craft: '공예',
  crafts: '공예', traditional: '전통', sea: '바다', seaside: '해변', canal: '운하', photography: '사진'
};
const TEMPLE_SUFFIX_RE = /-(?:ji|dera|tera|in|dō|do)$|(?:ji|dera)$/i;

// "Ryōzen Shrine" → "료젠 신사", "Mount Shinobu" → "시노부산", "Kasama Castle" → "가사마성"; null when a word is unknown
function koFromEnglish(en) {
  let text = String(en || '').replace(/\s+/g, ' ').trim();
  if (!text || /[^A-Za-z\s'’\-āīūēōâîûêôĀĪŪĒŌ.]/.test(text)) return null;
  text = text.replace(/’/g, "'");
  let lower = text.toLowerCase();
  let suffix = '';
  let attachSuffix = false;
  // leading generic words (Korean puts them after the name)
  let m = /^(?:mount|mt\.?)\s+(.+)$/i.exec(text);
  if (m) {
    text = m[1];
    const tail = text.toLowerCase().replace(/[āīūēō]/g, (c) => MACRONS[c]);
    suffix = /(?:san|zan|yama|dake|take|mine)$/.test(tail) ? '' : '산';
    attachSuffix = true;
  } else if ((m = /^cape\s+(.+)$/i.exec(text))) {
    text = m[1];
    const tail = text.toLowerCase();
    suffix = /(?:misaki|saki|zaki|hana|bana)$/.test(tail) ? '' : '곶';
    attachSuffix = true;
  } else if ((m = /^lake\s+(.+)$/i.exec(text))) {
    text = m[1];
    suffix = /ko$/i.test(text) ? '' : '호';
    attachSuffix = true;
  } else {
    lower = text.toLowerCase().replace(/[āīūēō]/g, (c) => MACRONS[c]);
    let found = false;
    for (const [w, ko, attach] of EN_SUFFIX) {
      if (lower === w) return null;
      if (lower.endsWith(` ${w}`)) {
        text = text.slice(0, text.length - w.length - 1);
        suffix = ko;
        attachSuffix = Boolean(attach);
        found = true;
        break;
      }
    }
    // "Shimane Museum of Ancient Izumo" → "시마네 고대 이즈모 박물관", "Museum of Modern Art" → "근대 미술관"
    const ofM = found ? null : /^(.*?)\b(museum|park|garden)\s+of\s+(.+)$/i.exec(text);
    if (ofM) {
      let rest = ofM[3];
      let head = { museum: ' 박물관', park: ' 공원', garden: ' 정원' }[ofM[2].toLowerCase()];
      if (head === ' 박물관' && / art$/i.test(` ${rest}`)) { rest = rest.replace(/\s*\bart$/i, ''); head = ' 미술관'; }
      text = `${ofM[1]} ${rest}`.trim();
      suffix = head;
      found = true;
    }
    // "Seiryū-ji Temple" → 세이류지 ("-ji" already says temple), "Misuji temple ruins" → 미스지 유적
    if (/ temple$/i.test(text)) {
      text = text.replace(/ temple$/i, '');
      if (!found) suffix = TEMPLE_SUFFIX_RE.test(text) ? '' : ' 절';
    }
  }
  if (suffix === '섬' && /(?:jima|shima)$/i.test(text)) suffix = ''; // "Atadajima Island" → 아타다지마
  const words = text.split(' ').filter(Boolean);
  if (!words.length || words.length > 5) return null;
  const outWords = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (EN_WORDS[lw]) {
      // "Akita City" → "아키타시" (City right after a name is written with it)
      if (lw === 'city' && outWords.length) { outWords[outWords.length - 1] += '시'; continue; }
      outWords.push(EN_WORDS[lw]);
      continue;
    }
    if (/^[A-Z]{2,4}$/.test(w)) { outWords.push(w); continue; } // acronyms (UFO)
    const h = romajiWordToHangul(w);
    if (!h) return null;
    outWords.push(h);
  }
  if (!outWords.some((w) => /[가-힣]/.test(w))) return null;
  // suffix starts with a space unless it is written with the name ("시노부산", "가사마성", "다케토미섬")
  const ko = `${outWords.join(' ')}${attachSuffix ? suffix.trim() : suffix}`;
  return ko.replace(/\s+/g, ' ').trim() || null;
}

// ── kana reading (P1814) → Korean / Hepburn ─────────────────────────────
const KANA = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o', 'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so', 'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no', 'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo', 'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro', 'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'N',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go', 'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do', 'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po', 'ゔ': 'bu'
};
const SMALL = { 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo' };
const toHiragana = (s) => String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// kana → Hepburn without macrons (long vowels shortened: とうきょう → tokyo), or null
function kanaToRomaji(kana) {
  const s = toHiragana(kana).replace(/[\s・･]/g, ' ');
  let out = '';
  let prevVowel = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === ' ') { out += ' '; prevVowel = ''; continue; }
    if (c === 'ー') continue; // long vowel mark
    if (c === 'っ') { out += 'Q'; continue; }
    let r = KANA[c];
    if (!r) return null;
    const small = SMALL[s[i + 1]];
    if (small) {
      if (r.length < 2 || !r.endsWith('i')) return null;
      const stem = r.slice(0, -1);
      r = (stem === 'sh' || stem === 'ch' || stem === 'j') ? stem + small.slice(1) : stem + small;
      i += 1;
    }
    // long vowels: おう/おお/うう → o/u (not written in Korean or plain Hepburn)
    if ((r === 'u' && (prevVowel === 'o' || prevVowel === 'u')) || (r === 'o' && prevVowel === 'o')) continue;
    out += r;
    prevVowel = r === 'N' ? '' : r.slice(-1);
  }
  // small tsu doubles the next consonant (ch → tch)
  out = out.replace(/Q(ch|[a-z])/g, (m0, c) => (c === 'ch' ? 'tch' : c + c)).replace(/Q/g, '');
  out = out.replace(/N(?=[aeiouy])/g, "n'").replace(/N/g, 'n');
  return out.trim() || null;
}

// kanji suffix + its readings → Korean generic word (attach = no space)
const JA_SUFFIX = [
  ['神社', ['じんじゃ'], ' 신사'], ['温泉', ['おんせん'], ' 온천'], ['城跡', ['じょうあと', 'しろあと'], '성터', true], ['城址', ['じょうし'], '성터', true],
  ['城', ['じょう', 'しろ'], '성', true], ['公園', ['こうえん'], ' 공원'], ['美術館', ['びじゅつかん'], ' 미술관'], ['博物館', ['はくぶつかん'], ' 박물관'],
  ['記念館', ['きねんかん'], ' 기념관'], ['資料館', ['しりょうかん'], ' 자료관'], ['史料館', ['しりょうかん'], ' 사료관'], ['水族館', ['すいぞくかん'], ' 수족관'],
  ['動物園', ['どうぶつえん'], ' 동물원'], ['植物園', ['しょくぶつえん'], ' 식물원'], ['庭園', ['ていえん'], ' 정원'], ['灯台', ['とうだい'], ' 등대'],
  ['滝', ['たき', 'だき'], ' 폭포'], ['古墳群', ['こふんぐん'], ' 고분군'], ['古墳', ['こふん'], ' 고분'], ['遺跡', ['いせき'], ' 유적'],
  ['貝塚', ['かいづか'], ' 패총'], ['海岸', ['かいがん'], ' 해안'], ['展望台', ['てんぼうだい'], ' 전망대'], ['教会', ['きょうかい'], ' 교회'],
  ['大橋', ['おおはし'], ' 대교'], ['鍾乳洞', ['しょうにゅうどう'], ' 종유동'], ['湿原', ['しつげん'], ' 습원'], ['渓谷', ['けいこく'], ' 계곡'],
  ['高原', ['こうげん'], ' 고원'], ['牧場', ['ぼくじょう'], ' 목장'], ['市場', ['いちば'], ' 시장'], ['文学館', ['ぶんがくかん'], ' 문학관'],
  ['科学館', ['かがくかん'], ' 과학관'], ['峠', ['とうげ'], ' 고개']
];
// English generic word for the same suffixes (Hepburn names: "Dai Onsen")
const JA_SUFFIX_EN = { '神社': 'Shrine', '温泉': 'Onsen', '城跡': 'Castle Ruins', '城址': 'Castle Ruins', '城': 'Castle', '公園': 'Park', '美術館': 'Art Museum',
  '博物館': 'Museum', '記念館': 'Memorial Hall', '資料館': 'Museum', '史料館': 'Museum', '水族館': 'Aquarium', '動物園': 'Zoo', '植物園': 'Botanical Garden',
  '庭園': 'Garden', '灯台': 'Lighthouse', '滝': 'Falls', '古墳群': 'Kofun Cluster', '古墳': 'Kofun', '遺跡': 'Site', '貝塚': 'Shell Mound', '海岸': 'Coast',
  '展望台': 'Observatory', '教会': 'Church', '大橋': 'Bridge', '鍾乳洞': 'Cave', '湿原': 'Marsh', '渓谷': 'Gorge', '高原': 'Plateau', '牧場': 'Farm', '市場': 'Market',
  '文学館': 'Literature Museum', '科学館': 'Science Museum', '峠': 'Pass' };

const isKanaOnly = (s) => /^[ぁ-ゖァ-ヺー・･\s]+$/.test(String(s || ''));

// split a Japanese name and its kana reading at a known suffix → { stem, stemKana, ko, en }, or a whole-name split
function splitJa(ja, kana) {
  const name = String(ja || '').replace(/\s+/g, '');
  const reading = toHiragana(String(kana || '').replace(/[\s・･]/g, ''));
  if (!name || !reading) return null;
  for (const [suffix, readings, ko] of JA_SUFFIX) {
    if (!name.endsWith(suffix) || name.length === suffix.length) continue;
    const r = readings.find((x) => reading.endsWith(x) && reading.length > x.length);
    if (!r) continue;
    // "千尋の滝" (せんぴろのたき) → 센피로 폭포: the particle の before the generic word is not written
    const stem = name.slice(0, -suffix.length).replace(/[のノ]$/, '');
    const stemKana = reading.slice(0, -r.length).replace(/の$/, '');
    return { stem, stemKana, ko, en: JA_SUFFIX_EN[suffix] };
  }
  return { stem: name, stemKana: reading, ko: '', en: '' };
}

function hangulFromKana(kana) {
  const romaji = kanaToRomaji(kana);
  if (!romaji) return null;
  const words = romaji.split(' ').filter(Boolean);
  const out = [];
  for (const w of words) {
    const h = romajiWordToHangul(w);
    if (!h) return null;
    out.push(h);
  }
  return out.join(' ') || null;
}

// common words inside a name: written in Korean ("宮崎県総合博物館" → 미야자키 현 종합 박물관)
const JA_WORDS = [
  ['県立', 'けんりつ', '현립'], ['府立', 'ふりつ', '부립'], ['都立', 'とりつ', '도립'], ['道立', 'どうりつ', '도립'], ['市立', 'しりつ', '시립'],
  ['国立', 'こくりつ', '국립'], ['総合', 'そうごう', '종합'], ['歴史', 'れきし', '역사'], ['民俗', 'みんぞく', '민속'], ['郷土', 'きょうど', '향토'],
  ['自然', 'しぜん', '자연'], ['近代', 'きんだい', '근대'], ['現代', 'げんだい', '현대'], ['古代', 'こだい', '고대'], ['美術', 'びじゅつ', '미술'],
  ['科学', 'かがく', '과학'], ['記念', 'きねん', '기념'], ['文化', 'ぶんか', '문화'], ['運河', 'うんが', '운하'], ['県', 'けん', '현']
];
// Japanese stem + its reading → Korean words (known words in Korean, the rest transliterated), or null
function segmentKo(stem, reading) {
  if (!stem && !reading) return [];
  if (!stem || !reading) return null;
  for (const [w, r, ko] of JA_WORDS) {
    const i = stem.indexOf(w);
    const j = reading.indexOf(r);
    // the word must occur once in both, with text on the same sides
    if (i < 0 || j < 0 || stem.indexOf(w, i + 1) >= 0 || reading.indexOf(r, j + 1) >= 0) continue;
    if ((i === 0) !== (j === 0) || (i + w.length === stem.length) !== (j + r.length === reading.length)) continue;
    const left = segmentKo(stem.slice(0, i), reading.slice(0, j));
    const right = segmentKo(stem.slice(i + w.length), reading.slice(j + r.length));
    if (!left || !right) return null;
    return [...left, ko, ...right];
  }
  const h = hangulFromKana(reading);
  return h ? [h] : null;
}

// a katakana word of 2+ letters is a loanword ("ポートタワー", "アイランド"): its kana reading is no Korean name
const hasLoanword = (s) => /[ァ-ヺ]{2,}/.test(String(s || '').replace(/[ー・･]/g, ''));

// Japanese name + kana reading → Korean, or null. requireSuffix: only names ending in a known generic word (神社, 温泉 …)
function koFromKana(ja, kana, requireSuffix = false) {
  if (hasLoanword(ja)) return null;
  const reading = kana || (isKanaOnly(ja) ? ja : '');
  if (!reading) return null;
  const split = splitJa(ja, reading);
  if (!split || (requireSuffix && !split.ko)) return null;
  const words = segmentKo(split.stem, toHiragana(split.stemKana));
  if (!words || !words.length) return null;
  // a long transliterated part is an institution name: do not transliterate it whole
  if (words.some((w) => w.replace(/\s/g, '').length > 9)) return null;
  // "가사마" + "성" → 가사마성 (the suffix table says where a space goes)
  return `${words.join(' ')}${split.ko}`.replace(/\s+/g, ' ').trim();
}

// Japanese name + kana reading → Hepburn English display name ("台温泉" + "だいおんせん" → "Dai Onsen"), or null
function enFromKana(ja, kana) {
  if (hasLoanword(ja)) return null;
  const reading = kana || (isKanaOnly(ja) ? ja : '');
  if (!reading) return null;
  const split = splitJa(ja, reading);
  if (!split) return null;
  const r = kanaToRomaji(split.stemKana);
  if (!r) return null;
  const cap = r.split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return split.en ? `${cap} ${split.en}` : cap;
}

// Best Korean name for a place with only Japanese / English labels: { name, from } or null.
// Order: the kana reading of a name with a known generic word (exact: "霊山神社" + reading) → the English
// romanisation ("Ryōzen Shrine") → the kana reading of a short name without one.
function koDisplayName({ ja, en, kana }) {
  const reading = [].concat(kana || [])[0] || (isKanaOnly(ja) ? ja : '');
  const withSuffix = reading ? koFromKana(ja, reading, true) : null;
  if (withSuffix) return { name: withSuffix, from: 'translit' };
  const fromEn = en && en !== ja ? koFromEnglish(en) : null;
  if (fromEn) return { name: fromEn, from: 'translit' };
  const plain = reading ? koFromKana(ja, reading) : null;
  return plain ? { name: plain, from: 'translit' } : null;
}

module.exports = { romajiWordToHangul, koFromEnglish, kanaToRomaji, koFromKana, enFromKana, koDisplayName, isKanaOnly };
