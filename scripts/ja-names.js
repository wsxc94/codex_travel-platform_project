'use strict';

/*
 * Korean / English display names for Japanese places that Wikidata names only in Japanese
 * (used by scripts/build-city-places.js; no network, no dependencies).
 *
 * - Korean follows the National Institute of Korean Language rules for Japanese (일본어 표기법):
 *   word-initial k/t/ch are written ㄱ/ㄷ/ㅈ, inside a word ㅋ/ㅌ/ㅊ; ts(u) is 쓰; long vowels are not
 *   written (新潟 Niigata → 니가타, 東京 → 도쿄); ん is ㄴ and っ is ㅅ as a final consonant. Generic words are
 *   translated the usual way ("X Shrine" → "X 신사", "Mount X" → "X산", "X Castle" → "X성", 温泉 → 온천), and the
 *   Japanese name decides where the English label is loose: 美術館 is 미술관 even for "X Museum", 記念館 기념관,
 *   郷土館 향토관, 歴史館 역사관, 貝塚 패총 (FACILITY_JA); 岳 is -다케 (湯湾岳 유완다케), ヶ岳 -가타케 (槍ヶ岳 야리가타케), 山 -산;
 *   島 is 섬 (女木島 메기섬); 館 is 관 (佐賀徴古館 사가 조코관); 大社 다이샤, 天満宮 텐만구 as words of their own.
 * - Where the app already writes a word its own way, that spelling wins over the rules: 天満宮 is 텐만구 like the
 *   curated 다자이후 텐만구 (the rules would write 덴만구); city names are spelled like the app's city labels
 *   (scripts/build-city-places.js CITY_LABEL_SPELLINGS: 中標津 나카시베츠).
 * - Person names are in Japanese order, family name first (土門拳記念館 → 도몬 겐 기념관), never in the order of the
 *   English label: names the rules cannot get right are listed by hand in JA_KO_OVERRIDES.
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

// one romaji word → morae [{onset, vowel} | 'N' | 'Q'], or null when it is not Hepburn.
// Long vowels are not written in Korean: Hepburn writes a long i as "ii" (新潟 Niigata → 니가타, 飯野 Iino → 이노,
// 飯坂 Iizaka → 이자카), so a second i in the first syllable of a word is dropped. Later in a word "ii" is usually two
// words meeting (通り池 Tōri-ike → 도리이케) and stays. (Long a/u/e/o come with macrons, already plain vowels here.)
function romajiMorae(word) {
  const w = String(word || '').toLowerCase().replace(/[āīūēōâîûêô]/g, (c) => MACRONS[c] || c);
  if (!/^[a-z']+$/.test(w)) return null;
  const out = [];
  let i = 0;
  while (i < w.length) {
    const c = w[i];
    if (c === "'") { i += 1; continue; }
    if (VOWELS.has(c)) {
      const prev = out[out.length - 1];
      if (c === 'i' && w[i - 1] === 'i' && out.length === 1 && typeof prev === 'object' && prev.vowel === 'i') { i += 1; continue; }
      out.push({ onset: '', vowel: c });
      i += 1;
      continue;
    }
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
// shrine words written as a word of their own (romanised, without macrons): translated (jinja 신사, jingu 신궁) or in the
// app's spelling (tenmangu 텐만구 like the curated 다자이후 텐만구; the rules would write 덴만구)
const SHRINE_WORDS = { tenmangu: '텐만구', hachimangu: '하치만구', taisha: '다이샤', jingu: '신궁', jinja: '신사' };

// What the Japanese name ends with decides the generic word where the English label is loose about it
// (the English label is only a romanisation plus an English word):
// - facilities: the Japanese generic word wins ("Nagashima Museum" = 長島美術館 → 나가시마 미술관, "Aomori Prefectural
//   Museum" = 青森県立郷土館 → 아오모리 현립 향토관, "Futatsumori Site" = 二ツ森貝塚 → 후타쓰모리 패총). Longest first.
const FACILITY_JA = [
  ['記念美術館', ' 기념 미술관'], ['写真美術館', ' 사진 미술관'], ['美術館', ' 미술관'],
  ['歴史博物館', ' 역사 박물관'], ['郷土博物館', ' 향토 박물관'], ['総合博物館', ' 종합 박물관'], ['科学博物館', ' 과학 박물관'],
  ['民俗博物館', ' 민속 박물관'], ['博物館', ' 박물관'], ['記念文学館', ' 기념 문학관'], ['文学館', ' 문학관'], ['記念館', ' 기념관'],
  ['歴史民俗資料館', ' 역사 민속 자료관'], ['民俗資料館', ' 민속 자료관'], ['資料館', ' 자료관'], ['史料館', ' 사료관'],
  ['歴史館', ' 역사관'], ['郷土館', ' 향토관'], ['科学館', ' 과학관'], ['貝塚', ' 패총'], ['遺跡', ' 유적']
];
// Korean generic words from English labels that the Japanese facility word may replace (a museum, a site, a castle site)
const SWAPPABLE_KO = new Set([' 기념 미술관', ' 미술관', ' 기념관', ' 역사 박물관', ' 민속 박물관', ' 문학관', ' 과학관', ' 조각 미술관',
  ' 박물관', ' 유적', ' 패총', ' 고분', '성', '성터']);
// descriptive English words that the Japanese generic word already says ("Museum of History" + 歴史館 → 역사관, not 역사 역사관)
const DESCRIPTIVE_KO = new Set(['역사', '민속', '미술', '과학', '기념', '사진', '문학', '향토', '종합']);
const facilityOf = (ja) => {
  const name = String(ja || '').replace(/\s+/g, '');
  const hit = FACILITY_JA.find(([w]) => name.endsWith(w) && name.length > w.length);
  return hit ? hit[1] : '';
};
const plainRomaji = (s) => String(s || '').toLowerCase().replace(/[āīūēōâîûêô]/g, (c) => MACRONS[c] || c);

// English label → { words (Korean), suffix, attach, generic } or null when a word is unknown.
// ja (optional): the Japanese name, for the generic word of mountains (山 산 / 岳 다케 / neither) and lakes (湖 호 / 沼, 池 none).
function englishParts(en, ja = '') {
  let text = String(en || '').replace(/\s+/g, ' ').trim();
  if (!text || /[^A-Za-z\s'’\-āīūēōâîûêôĀĪŪĒŌ.]/.test(text)) return null;
  text = text.replace(/’/g, "'");
  const jaName = String(ja || '').replace(/\s+/g, '');
  // "Kominato-Fuwaganeku", "Nanki-Shirahama": two names, two words (고미나토 후와가네쿠); "Azuma-kofuji", "Seiryū-ji" and
  // a particle ("Bizen-no-Kuni" 비젠노쿠니) stay one word
  text = text.replace(/(?<![-\s](?:no|ga|ke|tsu))-(?=[A-ZĀĪŪĒŌ])/g, ' ');
  // "Kusugawa-tenmangū", "Yakushima-taisha": the shrine word is a word of its own (구스가와 텐만구, 야쿠시마 다이샤: SHRINE_WORDS)
  text = text.replace(/-(tenmang[uū]|hachimang[uū]|taisha|jing[uū]|jinja)$/i, ' $1');
  // "Chitose-o-hashi" (千歳大橋): ōhashi is "big bridge" (지토세 대교, like 와카토 대교)
  text = text.replace(/[\s-]+[oō]-?hashi$/i, ' Ohashi Bridge');
  let lower = text.toLowerCase();
  let suffix = '';
  let attachSuffix = false;
  let generic = false;
  // leading generic words (Korean puts them after the name)
  let m = /^(?:mount|mt\.?)\s+(.+)$/i.exec(text);
  if (m) {
    text = m[1];
    const tail = plainRomaji(text);
    if (/[ヶケヵがガ][岳嶽]$/.test(jaName)) {
      // ヶ岳 is usually がたけ: -가타케 (槍ヶ岳 야리가타케, 八ヶ岳 야쓰가타케). A がだけ name is listed in JA_KO_OVERRIDES (右田ヶ岳).
      suffix = /(?:dake|take)$/.test(tail) ? '' : (/ga$/.test(tail) ? '타케' : '가타케');
    } else if (/[岳嶽]$/.test(jaName)) {
      // 岳 is written -다케 (湯湾岳 유완다케, 宮之浦岳 미야노우라다케)
      suffix = /(?:dake|take)$/.test(tail) ? '' : '다케';
    } else if (jaName && !/山$/.test(jaName)) {
      suffix = ''; // no 山 in the name: "Mount Takkomori" = 達子森 (닷코모리), "Mount Azuma-kofuji" = 吾妻小富士 (아즈마코후지)
    } else {
      suffix = /(?:san|zan|yama|dake|take|mine)$/.test(tail) ? '' : '산';
    }
    attachSuffix = true;
  } else if ((m = /^cape\s+(.+)$/i.exec(text))) {
    text = m[1];
    const tail = text.toLowerCase();
    suffix = /(?:misaki|saki|zaki|hana|bana)$/.test(tail) ? '' : '곶';
    attachSuffix = true;
  } else if ((m = /^lake\s+(.+)$/i.exec(text))) {
    text = m[1];
    // 大沼 "Lake Ōnuma" is 오누마 (numa already says it), 湖 is 호
    suffix = /ko$/i.test(text) || /[沼池]$/.test(jaName) ? '' : '호';
    attachSuffix = true;
  } else {
    lower = plainRomaji(text);
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
    generic = found;
  }
  // "Atadajima Island" → 아타다지마 (with the Japanese name 阿多田島, jaTouches then writes 아타다섬)
  if (suffix === '섬' && /(?:jima|shima)$/i.test(text)) suffix = '';
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
    // the particle の is written with the word before it: "Nagori no Matsubara" → 나고리노 마쓰바라
    if (lw === 'no' && outWords.length && /[가-힣]$/.test(outWords[outWords.length - 1])) { outWords[outWords.length - 1] += '노'; continue; }
    if (/^[A-Z]{2,4}$/.test(w)) { outWords.push(w); continue; } // acronyms (UFO)
    if (outWords.length && SHRINE_WORDS[plainRomaji(w)]) { outWords.push(SHRINE_WORDS[plainRomaji(w)]); continue; }
    const h = romajiWordToHangul(w);
    if (!h) return null;
    outWords.push(h);
  }
  if (!outWords.some((w) => /[가-힣]/.test(w))) return null;
  return { words: outWords, suffix, attach: attachSuffix, generic };
}

// "Ryōzen Shrine" → "료젠 신사", "Mount Shinobu" → "시노부산", "Kasama Castle" → "가사마성"; null when a word is unknown.
// ja (optional): the Japanese name. Its generic word wins for facilities ("Ken Domon Museum of Photography" + 土門拳記念館 →
// … 기념관; FACILITY_JA), mountains and lakes (englishParts).
function koFromEnglish(en, ja = '') {
  const parts = englishParts(en, ja);
  if (!parts) return null;
  let { words, suffix, attach } = parts;
  const facility = ja ? facilityOf(ja) : '';
  if (facility && parts.generic && SWAPPABLE_KO.has(suffix) && facility !== suffix) {
    while (words.length > 1 && DESCRIPTIVE_KO.has(words[words.length - 1])) words = words.slice(0, -1);
    suffix = facility;
    attach = false;
  }
  // suffix starts with a space unless it is written with the name ("시노부산", "가사마성", "다케토미섬")
  const ko = `${words.join(' ')}${attach ? suffix.trim() : suffix}`;
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
  ['科学館', ['かがくかん'], ' 과학관'], ['峠', ['とうげ'], ' 고개'], ['歴史館', ['れきしかん'], ' 역사관'], ['郷土館', ['きょうどかん'], ' 향토관'],
  // shrine words written as their own word (屋久島大社 → 야쿠시마 다이샤, like the curated 구마노 혼구 다이샤; 天満宮 텐만구 like
  // the curated 다자이후 텐만구)
  ['大社', ['たいしゃ'], ' 다이샤'], ['天満宮', ['てんまんぐう'], ' 텐만구'], ['八幡宮', ['はちまんぐう'], ' 하치만구'], ['神宮', ['じんぐう'], ' 신궁']
];
// English generic word for the same suffixes (Hepburn names: "Dai Onsen")
const JA_SUFFIX_EN = { '神社': 'Shrine', '温泉': 'Onsen', '城跡': 'Castle Ruins', '城址': 'Castle Ruins', '城': 'Castle', '公園': 'Park', '美術館': 'Art Museum',
  '博物館': 'Museum', '記念館': 'Memorial Hall', '資料館': 'Museum', '史料館': 'Museum', '水族館': 'Aquarium', '動物園': 'Zoo', '植物園': 'Botanical Garden',
  '庭園': 'Garden', '灯台': 'Lighthouse', '滝': 'Falls', '古墳群': 'Kofun Cluster', '古墳': 'Kofun', '遺跡': 'Site', '貝塚': 'Shell Mound', '海岸': 'Coast',
  '展望台': 'Observatory', '教会': 'Church', '大橋': 'Bridge', '鍾乳洞': 'Cave', '湿原': 'Marsh', '渓谷': 'Gorge', '高原': 'Plateau', '牧場': 'Farm', '市場': 'Market',
  '文学館': 'Literature Museum', '科学館': 'Science Museum', '峠': 'Pass', '歴史館': 'History Museum', '郷土館': 'Local History Museum',
  '大社': 'Taisha', '天満宮': 'Tenmangu', '八幡宮': 'Hachimangu', '神宮': 'Jingu' };

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
  ['科学', 'かがく', '과학'], ['記念', 'きねん', '기념'], ['文化', 'ぶんか', '문화'], ['運河', 'うんが', '운하'], ['写真', 'しゃしん', '사진'],
  ['県', 'けん', '현']
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

// Korean names looked at by hand where the rules cannot get it right, by the exact Japanese name (label without a qualifier).
// - Person names: Japanese order, family name first, whatever order the English label has
//   ("Ken Domon Museum of Photography" = 土門拳記念館 → 도몬 겐 기념관).
// - A Japanese reading or word the English label does not carry (原生花園 원생화원, 秋田犬 아키타견, 廃寺跡 폐사지),
//   a loanword facility name (奄美パーク 아마미 파크), a reading the general rule gets wrong (右田ヶ岳 がだけ).
// (旭山 stays 아사히산 by the 山 rule: "아사히카와 아사히야마" would be read inside "아사히카와 아사히야마 동물원" = the curated zoo.)
const JA_KO_OVERRIDES = {
  '土門拳記念館': '도몬 겐 기념관',
  '植田正治写真美術館': '우에다 쇼지 사진 미술관',
  '井上靖記念館': '이노우에 야스시 기념관',
  '三沢市寺山修司記念館': '데라야마 슈지 기념관',
  '中標津町郷土館': '나카시베츠 향토관', // 町 (a town): not "시립"; 나카시베츠 like the app's city label
  '北海道立帯広美術館': '홋카이도립 오비히로 미술관', // like 홋카이도립 구시로 예술관
  '小清水原生花園': '고시미즈 원생화원',
  '秋田犬の里': '아키타견의 마을',
  '三栖廃寺跡': '미스 폐사지', // みすはいじあと: the ruins of Misu's abandoned temple
  '奄美パーク': '아마미 파크',
  '右田ヶ岳': '미기타가다케' // みぎたがだけ (ja.wikipedia), not the usual がたけ of ヶ岳
};

// Japanese-name details the readings alone do not settle (applied to every transliterated name).
function jaTouches(ko, ja) {
  let out = String(ko || '');
  const name = String(ja || '').replace(/\s+/g, '');
  if (!out || !name) return out;
  // 館 is 관 like 기념관 / 미술관: 佐賀徴古館 "Saga Chōkokan" → 사가 조코관
  if (/館$/.test(name)) out = out.replace(/칸$/, '관');
  // 岳 -다케 and 山 -산 are written with the name: アーラ岳 "Āra Dake" → 아라다케, 利尻ポン山 "Rishiri Pon Yama" → 리시리 폰산
  if (/[岳嶽]$/.test(name)) out = out.replace(/ 다케$/, '다케');
  if (/山$/.test(name)) out = out.replace(/ 야마$/, '산');
  // 島 is 섬 (女木島 메기섬, like the Korean Wikipedia's 男木島 오기섬); a one-kanji name keeps -시마 (経島 후미시마섬, like 似島 니노시마섬)
  if (/島$/.test(name) && !/[半列諸群]島$/.test(name) && /(?:지마|시마)$/.test(out)) {
    out = [...name].length >= 3 ? out.replace(/(?:지마|시마)$/, '섬') : `${out}섬`;
  }
  return out;
}

// Best Korean name for a place with only Japanese / English labels: { name, from } or null.
// Order: a name looked at by hand (JA_KO_OVERRIDES, from: 'fix') → the kana reading of a name with a known generic word
// (exact: "霊山神社" + reading) → the English romanisation ("Ryōzen Shrine", generic word per the Japanese name) → the
// kana reading of a short name without one.
function koDisplayName({ ja, en, kana }) {
  const fixed = JA_KO_OVERRIDES[String(ja || '').replace(/\s+/g, '')];
  if (fixed) return { name: fixed, from: 'fix' };
  const reading = [].concat(kana || [])[0] || (isKanaOnly(ja) ? ja : '');
  const withSuffix = reading ? koFromKana(ja, reading, true) : null;
  if (withSuffix) return { name: jaTouches(withSuffix, ja), from: 'translit' };
  const fromEn = en && en !== ja ? koFromEnglish(en, ja) : null;
  if (fromEn) return { name: jaTouches(fromEn, ja), from: 'translit' };
  const plain = reading ? koFromKana(ja, reading) : null;
  return plain ? { name: jaTouches(plain, ja), from: 'translit' } : null;
}

module.exports = { romajiWordToHangul, koFromEnglish, kanaToRomaji, koFromKana, enFromKana, koDisplayName, isKanaOnly, JA_KO_OVERRIDES, FACILITY_JA };
