#!/usr/bin/env node
'use strict';

/*
 * Builds assets/city-places.json: real sights near each of the app's cities, taken from Wikidata, so
 * that every city has enough half-day candidates for a 3-4 day itinerary (rule planner and AI).
 *
 * - The curated data in server.js stays first: CITY_DATA highlights, MUST_ATTRACTIONS and EXTRA_PLACES
 *   (read without running the server, like scripts/build-place-images.js). A city only gets as many
 *   generated places as it lacks to reach TARGET_HALF_DAY (30) half-day sights on the recommendation cards
 *   (CITY_DATA highlights + generated; MUST_ATTRACTIONS and hand-made EXTRA_PLACES only de-duplicate).
 * - Candidates: Wikidata items within the city's radius (SPARQL wikibase:around the server's
 *   CITY_CENTER_COORDS), in Japan, with coordinates, a Japanese label and a sight class (temple,
 *   shrine, castle, museum, park, garden, observation deck, onsen, aquarium, scenic spot, market,
 *   historic site, ...; see KINDS). Ranked by sitelink count (how widely the place is documented),
 *   with a cap per kind so a city does not get ten shrines. Anything that is not a single visitable
 *   place (stations, schools, wards, rivers, national parks, archipelagos, the city's own island,
 *   demolished buildings) is left out.
 * - A big theme park (fullDay) or a summit of 1,000 m+ (dayTrip) takes the whole day: at most one per
 *   city, on top of the half-day target. A city with an airport name covering two towns gets a second
 *   search circle (CITY_EXTRA_CENTERS, listed as extraCenters). Small islands that stay short also get
 *   less documented sights of the same kinds (a lighthouse, a peak); single items can be excluded
 *   after review (EXCLUDE_QIDS).
 * - Duplicates of curated places are dropped: same Wikidata item (assets/place-images.json), "part of"
 *   a curated item, same name (ko/en/ja), or practically the same coordinates.
 * - Every place keeps its Wikidata QID, coordinates and labels: "name" is the Korean label (else the
 *   Korean Wikipedia title, else the Japanese label: nameFrom says which), "en"/"ja" the display names
 *   of the English / Japanese screens (an English screen falls back to the Japanese name when Wikidata
 *   has no English one). "area" is the Korean label of the item's P131 (else the city's Korean name).
 * - Photos: the item's P18 on Wikimedia Commons with a free license only, with credit (artist,
 *   license, file page), the same rules as build-place-images.js. Hot-spring / bath photos are left
 *   out unless their file is listed in REVIEWED_BATH_FILES (looked at: no bathers visible).
 * - "media": photo/coordinates/labels for curated names that place-images.json does not cover (new
 *   day-trip MUST_ATTRACTIONS, renamed highlights), keyed "<cityKey>|<name>" like place-images.json
 *   places; every entry names its reviewed Wikidata item in MEDIA_ITEMS.
 * - "few": true when a city has fewer than MIN_SIGHTS half-day sights even after this (tiny islands):
 *   the server then says so instead of filling the gap with places from other cities.
 * - Free public APIs only, no key. Polite: fixed User-Agent, at most one request per second, retries
 *   with backoff, an on-disk response cache.
 *
 * Usage:
 *   node scripts/build-city-places.js [options]
 *     --out <file>        output file (default: assets/city-places.json)
 *     --server <file>     server source (default: server.js)
 *     --images <file>     place-images.json used for de-duplication (default: assets/place-images.json)
 *     --cache <dir>       response cache directory (default: <os tmp>/tabimaru-city-places-cache)
 *     --refresh           ignore cached responses
 *     --only <keys>       comma separated city keys (debugging; output then holds only those)
 *     --no-check-images   do not HEAD-check the thumbnails
 *     --report <file>     write a TSV table of every candidate (accepted or why not)
 *     --dry-run           do not write the output file
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const lib = require('./build-place-images.js');
const jaNames = require('./ja-names.js');

const ROOT = path.resolve(__dirname, '..');
const FILE_VERSION = 1;
const MIN_INTERVAL_MS = 1000; // Wikidata / Wikipedia / Commons: at most one request per second
const UPLOAD_INTERVAL_MS = 1500;
// Half-day sights shown per city: CITY_DATA highlights + generated places. The server shows at most 30 recommendations
// (recommendDestinations), so every city gets up to 30 where Wikidata has enough real sights (2026-10-02: was 12).
const TARGET_HALF_DAY = 30;
const MIN_SIGHTS = 9; // below this a city is marked "few" (honest note instead of filler)
const DEFAULT_RADIUS_KM = 20;
const SITELINK_STEPS = [8, 3, 1]; // SPARQL threshold, lowered while a city still lacks candidates
const SPARQL_LIMIT = 400;
const ENTITY_PAGE = 40; // items fetched per page (two wbgetentities calls)
const DEDUPE_NEAR_KM = 0.12;
const DEDUPE_WEAK_NEAR_KM = 0.5; // monuments, bridges, "tourist attractions" next to a curated place
const DEDUPE_SAME_KIND_KM = 0.3; // two castles / two parks this close are one visit (鶴ヶ岡城 + 鶴岡公園)
const DEDUPE_ANY_KIND_KM = 0.1; // any two sights this close are one visit (not area kinds: AREA_KINDS)
const DEDUPE_RELATED_KM = 1.0; // "part of" / "located on" another accepted item this close: one visit
const AREA_KINDS = new Set(['onsen', 'district', 'mountain', 'nature', 'park']);
const DEDUPE_NAMED_KM = 1.5; // "玄武洞ミュージアム" next to the curated 玄武洞 is part of that visit
const DAY_TRIP_KM = 60; // farther than this from the city center: a day trip (whole day)
const MEDIA_RADIUS_KM = 300;
const KO_LABEL_BONUS = 4;
// Diversity caps (first pass; relaxed when a city would otherwise stay short)
const MAX_PER_KIND = 3;
const MAX_FULL_DAY = 1; // whole-day places added per city on top of the half-day target (used on 5+ day trips)
const KIND_GROUP = { temple: 'religious', shrine: 'religious', church: 'religious', museum: 'museums', artmuseum: 'museums' };
const GROUP_MAX = { religious: 4, museums: 3, heritage: 2, mountain: 2, nature: 3 };
const WEAK_KINDS = new Set(['heritage', 'attraction']);

// Search radius per city (km from CITY_CENTER_COORDS): big cities are dense, islands are small.
const CITY_RADIUS_KM = {
  tokyo: 15, osaka: 12, kyoto: 12, sapporo: 15, nagoya: 15, fukuoka: 15, kobe: 15, hiroshima: 15, sendai: 15,
  okadama: 12, okinawa: 25, yamaguchi_ube: 15, wakkanai: 25, memanbetsu: 25, nakashibetsu: 30,
  amami: 30, yakushima: 20, tanegashima: 35, miyako: 15, ishigaki: 20, shimojishima: 14, kumejima: 10,
  kita_daito: 6, yonaguni: 8, tokunoshima: 18, rishiri: 13,
  iwakuni: 14 // not Miyajima (17 km, Hiroshima's curated Itsukushima)
};
// A city whose name covers two towns gets a second search circle (the asset lists it in extraCenters).
const CITY_EXTRA_CENTERS = {
  yamaguchi_ube: [{ lat: 34.1859, lng: 131.4706, radiusKm: 15, label: 'Yamaguchi city hall' }] // the airport city is Ube; Yamaguchi city is 30 km away
};
// Island cities: an "island" item there is usually the island itself, not a sight.
const ISLAND_CITIES = new Set(['rishiri', 'amami', 'yakushima', 'tanegashima', 'miyako', 'ishigaki', 'shimojishima',
  'kumejima', 'kita_daito', 'yonaguni', 'tokunoshima']);

// Sight kinds by Wikidata class label (English, lower case). First matching kind wins (order matters).
const KINDS = [
  // a big theme park takes the whole day (fullDayMinSitelinks); a small one ("Amami Park") half a day
  { id: 'themepark', re: /^(?:amusement park|theme park)$/, category: '테마파크', stayMin: 180, bestTime: '10:00-13:00', fullDayMinSitelinks: 15 },
  { id: 'castle', re: /castle|fortress|gusuku|jōkaku|citadel/, category: '문화', stayMin: 90, bestTime: '09:00-11:00' },
  { id: 'temple', re: /temple|pagoda|monastery|\bzen\b|buddhist|kannon/, category: '문화', stayMin: 60, bestTime: '09:00-11:00', religious: true },
  { id: 'shrine', re: /shrine|jinja|taisha|jingū|hachimangū|tenmangū|gokoku/, category: '문화', stayMin: 60, bestTime: '09:30-11:00', religious: true },
  { id: 'church', re: /church|cathedral|basilica|chapel/, category: '문화', stayMin: 45, bestTime: '13:00-14:30', religious: true },
  { id: 'aquarium', re: /aquarium/, category: '수족관', stayMin: 120, bestTime: '10:00-12:30', indoor: true },
  // a botanical garden that also keeps animals (奄美アイランド植物園: "botanical garden" + "zoo") is a garden
  { id: 'garden', re: /botanical/, category: '정원', stayMin: 75, bestTime: '09:30-11:00' },
  { id: 'zoo', re: /\bzoo\b|zoological|safari park|animal park|wildlife park/, category: '동물원', stayMin: 150, bestTime: '10:00-13:00' },
  { id: 'artmuseum', re: /art museum|art gallery|gallery of art|museum of art/, category: '미술관', stayMin: 90, bestTime: '13:00-15:30', indoor: true },
  { id: 'museum', re: /museum|science center|science centre|planetarium|memorial hall|exhibition hall/, category: '박물관', stayMin: 90, bestTime: '10:00-12:00', indoor: true },
  { id: 'onsen', re: /onsen|hot spring|spa town|bathhouse|sentō/, category: '온천', stayMin: 120, bestTime: '15:00-17:30' },
  { id: 'garden', re: /garden|botanical/, category: '정원', stayMin: 75, bestTime: '09:30-11:00' },
  { id: 'market', re: /\bmarket\b|marketplace|fish market/, category: '시장', stayMin: 60, bestTime: '08:30-10:30' },
  { id: 'district', re: /historic district|preservation district|traditional buildings|old town|post town|castle town|folk village|townscape|chaya|samurai|merchant house|historic house|former residence|house museum|shōtengai/, category: '산책', stayMin: 90, bestTime: '14:00-16:00' },
  { id: 'observation', re: /observation|viewpoint|vantage point|lookout|observation tower|television tower|tv tower|ropeway|aerial tramway|aerial lift|cable car/, category: '전망', stayMin: 60, bestTime: '15:30-17:00' },
  { id: 'park', re: /\bpark\b|square|plaza/, category: '산책', stayMin: 75, bestTime: '14:00-16:00' },
  // an archaeological site in a rock shelter or cave (磯間岩陰遺跡) is a heritage site, not nature
  { id: 'heritage', re: /archaeological|\bruins?\b|kofun|tumulus|burial mound|shell mound|stone circle/, category: '문화', stayMin: 45, bestTime: '10:00-11:30' },
  // a summit of 1,000 m or more is a full-day hike (Miyanoura-dake, Yufu-dake), not a half-day sight
  { id: 'mountain', re: /mountain|volcano|\bpeak\b|\bhill\b|stratovolcano|lava dome/, category: '자연', stayMin: 150, bestTime: '09:00-12:00', fullDayMinElevation: 1000 },
  { id: 'nature', re: /waterfall|\bfalls\b|gorge|ravine|canyon|valley|\bcape\b|headland|promontory|beach|coast|cliff|\bcave\b|cavern|\blake\b|\bpond\b|marsh|wetland|\bbog\b|\bdunes?\b|plateau|crater|\bisland\b|\bislet\b|rock formation|\brock\b|\bbay\b|lagoon|\breef\b|forest|\bgrove\b|\btree\b|scenic|landscape|natural monument|geosite|\bspring\b|\binlet\b/, category: '자연', stayMin: 90, bestTime: '13:00-15:00' },
  { id: 'heritage', re: /historic site|historical site|archaeological|\bruins?\b|kofun|tumulus|burial mound|stone circle|shell mound|midden|abandoned mine|mine ruins|monument|memorial|statue|lighthouse|\bgate\b|\btomb\b|mausoleum|\bbridge\b|\btower\b|heritage/, category: '문화', stayMin: 45, bestTime: '10:00-11:30' },
  { id: 'attraction', re: /tourist attraction|tourist destination|landmark/, category: '관광', stayMin: 60, bestTime: '13:00-15:00' }
];
// Classes that are never a single visitable sight: by head noun (the class label ends with it,
// "railway station", "special ward") or anywhere in the label ("national park of Japan").
const REJECT_HEAD_RE = /(?:^|[\s-])(?:station|stop|terminal|university|college|school|kindergarten|academy|stadium|arena|ballpark|velodrome|racecourse|gymnasium|ward|city|town|village|municipality|prefecture|human|company|business|enterprise|corporation|hospital|clinic|office|airport|airfield|heliport|highway|expressway|road|street|route|line|ship|vessel|event|festival|organization|organisation|club|team|league|hotel|ryokan|apartment|skyscraper|mall|department store|supermarket|store|shop|restaurant|bar|cafe|café|brewery|distillery|factory|plant|dam|reservoir|river|stream|canal|channel|strait|sea|ocean|constituency|neighborhood|neighbourhood|quarter|chōme|area|region|cemetery|prison|barracks|base|port|harbor|harbour|ferry|peninsula|course|theatre|theater|cinema|library|newspaper|parking|car park|settlement|locality|bus)$/;
const REJECT_ANY_RE = /national park|quasi-national park|natural park|nature park|prefectural park|protected area|nature reserve|geopark|archipelago|island group|group of islands|mountain range|ski resort|ward of|city of|town of|village of|municipality of|prefecture of|district of|electoral|broadcast|television station|railway|rail line|concert hall|city hall|town hall|convention|exhibition cent|conference|wikimedia|family name|given name|surname|disambiguation|\blist\b|military|world heritage site/;
// ... except these, which are sights ("post town" Ōuchi-juku, "folk village", "hot spring resort").
const KEEP_LABEL_RE = /post town|castle town|old town|folk village|open-air museum|hot spring|onsen/;
const isRejectLabel = (l) => !KEEP_LABEL_RE.test(l) && (REJECT_HEAD_RE.test(l) || REJECT_ANY_RE.test(l));
// An item with one of these classes is a group or an area, never one place, whatever else it is
// ("Gusuku Sites ... of the Kingdom of Ryukyu" is a World Heritage listing of nine castles).
// Also big water bodies and calderas (Suruga Bay, Aira Caldera: areas, not places to visit) and church
// organisations (a diocese is not a building).
// Also closed or no sight at all: a defunct museum, a ski jumping hill. (Uninhabited islands stay: Hashima /
// Gunkanjima is visited by boat; the ones without landing are listed in EXCLUDE_QIDS.)
const HARD_REJECT_RE = /world heritage site|serial|archipelago|island group|\bgroup of\b|national park|quasi-national park|mountain range|artificial island|reclaimed land|wildlife refuge|mudflat|^bay$|\bbay of\b|\bgulf\b|caldera|diocese|parish|eparchy|latter day saints|earthquake|eruption|disaster|explosion|accident|\bbattle\b|\bwar\b|incident|\bsiege\b|defunct|former museum|ski jump/;
// A sight that is also a shopping complex (Kushiro Fisherman's Wharf MOO: "botanical garden" + "shopping center")
// is shown as shopping. A shopping complex alone is no sight (rejected by REJECT_HEAD_RE / no kind).
const SHOPPING_CLASS_RE = /shopping cent|shopping mall|shopping complex/;
// Names that are no sightseeing place even when the class is (a sports ground is a "park", a research
// station has a "botanical garden").
const NOT_A_SIGHT_NAME_RE = /運動公園|総合運動場|운동\s*공원|sports park|児童会館|研究センター|研究部|研究所|research cent/i;
// Single items excluded after review (why).
const EXCLUDE_QIDS = {
  Q11667995: 'Mageshima: uninhabited island used for a military base, no visitor access',
  Q11234904: 'NEXT21: an office building',
  Q16564561: 'research station of a medicinal plant institute, not open as a garden',
  Q7421101: 'Sapporo Japan Temple (LDS): a church temple, not a sightseeing place',
  // reviewed 2026-10-02 (closed, no landing, residential, road passes, politically sensitive)
  Q6940951: 'Toyama Prefectural Museum of Modern Art: closed 2016-12-28 (P3999)',
  Q862944: 'Benten-jima (Wakkanai): uninhabited rock off Cape Sōya, no landing',
  Q11482667: 'Hirashima (Wakkanai): uninhabited rock off Cape Sōya, no landing',
  Q11589594: 'Kashima (Tanabe): natural monument island, landing restricted',
  Q3912774: 'Yamagata Zaō ski jump: a ski jumping hill, not a sight',
  Q11288918: 'Hikoshima (Shimonoseki): a residential island, not a sight',
  Q11476897: 'Shimadajima (Tokushima): a residential island, not a sight',
  Q11577742: 'Kabutojima (Iwakuni): uninhabited island, no regular access',
  Q11607237: 'Aminoko Pass (Amami): a road pass, not a sight',
  Q17230291: 'Honcha Pass (Amami): a road pass, not a sight',
  Q391408: 'Senkaku Shrine: its main coordinates are on Uotsuri-jima (no landing), politically sensitive',
  Q63147919: 'Sōyamisaki Shrine: at Cape Sōya (curated), part of that visit',
  Q132917035: 'Mount Tatsunarashi (Wakkanai): an obscure peak (no trail or visitor information)',
  Q139061020: 'Chipushiri (Wakkanai): an obscure peak (no trail or visitor information)',
  Q139051111: 'Mount Kenashi (Wakkanai): an obscure peak (no trail or visitor information)'
};
// Excluded in one city only: the city's own island ("伊良部島" for shimojishima, which is on Irabu/Shimoji)
const EXCLUDE_IN_CITY = {
  shimojishima: { Q187366: 'Irabu-jima: the island the city is on' }
};
// Photos looked at and not used: they show something else than the place
const NO_PHOTO_QIDS = {
  Q25045409: 'Nagashima Museum: P18 is a painting in the collection, not the museum',
  Q11414555: 'Kikkō Park: P18 is the Kikkawa Historical Museum building'
};
// Korean / English names looked at by hand for places whose Wikidata names are Japanese only and that the
// rules of scripts/ja-names.js cannot write (loanwords, long institution names). en only where Wikidata has none, or where its
// English label means another reading or another thing (扇ノ山 Ōginosen, 合氣神社 Aiki Shrine).
const NAME_FIXES = {
  Q11314514: { ko: '포트타워 셀리온' },
  Q4739454: { ko: '아마미 아일랜드 식물원' },
  Q11411970: { ko: '다이 온천', en: 'Dai Onsen' },
  Q11508588: { ko: '일본 현대 시가 문학관' },
  Q47164008: { ko: '신지호 자연관 고비우스' }, // 宍道湖 is 신지호 in the app (curated 신지호 석양, area 신지호)
  Q4141258: { ko: '유신 후루사토관' },
  Q24805773: { ko: '가고시마 자비에르 성당' },
  Q109362343: { ko: '기타다이토 인광산 유적' },
  Q17214624: { ko: '미후네 공룡 박물관' },
  Q11648257: { ko: '구시로 피셔맨스 워프 MOO' },
  Q9187319: { ko: '구시로 정교회' },
  Q22677838: { ko: '구시로시 두루미 자연공원' },
  Q11402997: { ko: '홋카이도립 구시로 예술관' },
  Q11648277: { ko: '구시로 어린이 유가쿠관' }, // 館 is 관 (like 스즈키 다이세쓰관)
  Q716411: { ko: '구 가이치 학교' },
  Q11608719: { ko: '우쓰쿠시가하라 고원 미술관' },
  Q11402956: { ko: '홋카이도립 북방민족박물관' },
  Q11344562: { ko: '모요로 패총' },
  Q11404944: { ko: '도와다시 현대미술관' },
  Q6378947: { ko: '핫쇼쿠 센터', en: 'Hasshoku Center' },
  Q6884272: { ko: '미야코지마시 열대 식물원' },
  Q4778784: { ko: '아오시마 아열대 식물원' },
  Q11542208: { ko: '시베쓰 연어 과학관' },
  Q132197073: { ko: '북방영토관' },
  Q11402953: { ko: '홋카이도립 유메노모리 공원', en: 'Hokkaido Yumenomori Park' },
  Q11542212: { ko: '시베쓰 습원', en: 'Shibetsu Marsh' },
  Q11588121: { ko: '이소마 바위그늘 유적' },
  Q11580019: { ko: '시라하마 해중 전망탑' },
  Q24805640: { ko: '니가타 가톨릭 성당' },
  Q21652713: { ko: '오비히로 백년 기념관' },
  Q30576578: { ko: '도카치 힐스' },
  Q11318465: { ko: '조마토', en: 'Chomato' },
  Q17212707: { ko: '시바야치', en: 'Shibayachi' },
  Q11459440: { ko: '고사카 향토관' },
  Q24817373: { ko: '가톨릭 기타이치조 성당' },
  Q3348373: { ko: '삿포로 히쓰지가오카 전망대' },
  Q4707582: { ko: '오카야마 시립 오리엔트 미술관' },
  Q11396858: { ko: '리시리후지 온천', en: 'Rishiri-Fuji Onsen' },
  Q11396855: { ko: '리시리 후레아이 온천', en: 'Rishiri Fureai Onsen' },
  Q28685850: { ko: '사가 벌룬 뮤지엄' },
  Q28690428: { ko: '데와 대교', en: 'Dewa Bridge' },
  Q11426145: { ko: '기노사키 짚 공예 전승관' },
  Q11405495: { ko: '지쿠라 동굴' },
  Q11456481: { ko: '도야마현 수묵 미술관' }, // 富山県水墨美術館: 県 (like 도야마현 미술관), not 県立
  Q11596338: { ko: '왓카나이 개기 백년 기념탑·북방 기념관' }, // 開基百年記念塔・北方記念館: the tower and the museum in it
  Q11288187: { ko: '윌슨 그루터기' },
  Q127608800: { ko: '야쿠시마 역사 민속 자료관' },
  Q5926948: { ko: '야마가타시 야초원' },
  Q11466600: { ko: '야마구치 자비에르 기념 성당' },
  Q18337414: { ko: '틴다바나' },
  Q97213200: { ko: '다나카 잇손 종언의 집' },
  Q705909: { ko: '미야라 돈치' },
  Q11678467: { ko: '구로시오노모리 맹그로브 파크' },
  Q7498236: { ko: '시라호 사오네타바루 동굴 유적' },
  Q123478231: { ko: '이와쿠니 학교 교육 자료관' },
  Q11648713: { ko: '스즈키 다이세쓰관' },
  Q18458746: { ko: '가와치 후지엔' },
  Q11511062: { ko: '구 사이토가 별저' },
  Q2842754: { ko: '홋카이도 대학 식물원' },
  Q21653654: { ko: '쓰루오카 가톨릭 성당' },
  Q7743932: { ko: '가가와 현립 뮤지엄' },
  Q11257752: { ko: '아즈마 다리', en: 'Azuma Bridge' },
  // 養老牛 is ようろううし (Yōrōushi): the Wikidata kana ようろうし drops an う, so the rules would write 요로시
  Q11666887: { ko: '요로우시 온천', en: 'Yoroushi Onsen' },
  Q11596339: { en: 'Wakkanai Onsen' },
  Q11477827: { en: 'Kawakita Onsen' },
  // a wrong Korean label on Wikidata (the Korean Wikipedia title is right)
  Q339859: { ko: '시텐노지' },
  // Wikidata Korean labels against the rules of scripts/ja-names.js (looked at 2026-10-02):
  Q11400854: { ko: '덴쇼치' }, // 展勝地 てんしょうち: a word-initial t is ㄷ (label 텐쇼치)
  Q11491132: { ko: '시노리다테' }, // 志苔館 しのりだて: a fort (館 read date), not a "hall" (label 시노리관)
  Q63203: { ko: '히로시마시 식물 공원' }, // 広島市植物公園: "시" written with the city name like 아키타시 … (label 히로시마 시 식물 공원)
  Q64589704: { ko: '투이시' }, // トゥイシ: トゥ is tu (label 트이시)
  // readings that Wikidata has no kana for, checked on ja.wikipedia (2026-10-02); the English label alone misleads the rules
  Q55523209: { ko: '가미엔야 쓰키야마 고분' }, // 上塩冶 かみえんや: ん before や ("Kamienya" without n' reads 가미에냐)
  Q11496825: { ko: '오기노센', en: 'Mount Ōginosen' }, // 扇ノ山 おうぎのせん (Wikidata alias Ōginosen), like 大山 다이센; label "Mount Ōgi"
  Q11657359: { ko: '아타타섬' }, // 阿多田島 あたたじま: the English label Atadajima has da
  Q11537943: { ko: '사쿠라치진관' }, // 桜地人館 さくらちじんかん: one name (사쿠라 지진관 reads "earthquake hall")
  // 十山神社 とおやまじんじゃ: "도야마 신사" alone is taken for Toyama city (도야마) — the island's name in front
  Q11405009: { ko: '요나구니 도야마 신사' },
  // the English Wikipedia article of the item is the Iwama dōjō next to the shrine (Wikidata alias Aiki Shrine)
  Q2827917: { en: 'Aiki Shrine' }
};
// The app's own spelling of a city name, in generated names and areas: the city label 나카시베츠 (中標津; the rules and the
// Wikidata label of 中標津町 write 나카시베쓰). A place name must not spell its city differently from the city shown above it.
const CITY_LABEL_SPELLINGS = [[/나카시베쓰/g, '나카시베츠']];
const withCitySpelling = (s) => CITY_LABEL_SPELLINGS.reduce((acc, [re, to]) => acc.replace(re, to), String(s || ''));
// Area (P131) Korean label as the app writes wards: 아오바구, not "이즈미 구" (two Wikidata labels have the space)
const areaSpelling = (s) => withCitySpelling(s).replace(/^([가-힣]+) 구$/, '$1구');
// Areas looked at by hand: the item has no P131, so the city label stood there (赤間神宮 is in Shimonoseki, not Kitakyushu)
const AREA_FIXES = {
  Q712617: { ko: '시모노세키시', en: 'Shimonoseki', ja: '下関市' }
};
// Other spellings the app itself shows for a word, kept as aliases so either is found: 大社 다이샤 (구마노 혼구 다이샤,
// the rules) / 타이샤 (the curated 이즈모 타이샤).
const SPELLING_VARIANTS = [[/ 다이샤$/, ' 타이샤']];
// Names the app showed before (deployed 38163f0, until the renaming of 2026-10-02): saved plans keep them, so they stay
// findable as aliases (chat, exclusion, name restoration) — never shown. Not for a name that misleads (도야마 신사 = Toyama city).
const FORMER_NAMES = {
  Q11595319: ['사타케 역사 박물관'], Q11595345: ['아키타 아카렌가 박물관'], // akita
  Q109363815: ['고미나토후와가네쿠 유적'], Q11444846: ['아마미 공원'], Q31685573: ['유완산'], // amami
  Q11539040: ['무나카타 시코 기념 미술관'], Q11662265: ['아오모리 현립 박물관'], // aomori
  Q11356532: ['미우라 아야코 문학관'], Q11373285: ['야스시 이노우에 기념관'], // asahikawa
  Q11593098: ['이이노 UFO 박물관'], Q718441: ['아즈마코후지산'], // fukushima
  Q11491132: ['시노리관'], Q11542816: ['요코쓰산'], // hakodate
  Q11400854: ['텐쇼치'], Q11501987: ['하나마키 니이산'], Q11537943: ['사쿠라 지진칸'], // hanamaki
  Q63203: ['히로시마 시 식물 공원'], // hiroshima
  Q2827917: ['Iwama Dōjō'], Q4676321: ['이바라키 현립 역사 박물관'], // ibaraki
  Q11333899: ['후루스토바루성'], Q4521182: ['오모토산'], // ishigaki
  Q11657359: ['아타다지마'], // iwakuni
  Q47164008: ['신지코 자연관 고비우스'], Q4802099: ['시마네 고대 이즈모 박물관'], Q5508550: ['후미시마'], Q55523209: ['가미에냐 쓰키야마 고분'], // izumo
  Q25045409: ['나가시마 박물관'], // kagoshima
  Q31707328: ['아라 다케'], // kumejima
  Q11648277: ['구시로 어린이 유가쿠칸'], // kushiro
  Q11462664: ['고시미즈 겐세이카엔'], Q11607220: ['아바시리시 민속 박물관'], // memanbetsu
  Q21654765: ['슈지 데라야마 박물관'], Q30593786: ['후타쓰모리 유적'], // misawa
  Q30593667: ['미야코지마시 박물관'], // miyako
  Q11366289: ['나카시베쓰 시립 민속 박물관'], Q11366290: ['나카시베쓰 신사'], Q11666887: ['요로시 온천'], Q8536966: ['시베쓰산'], // nakashibetsu
  Q11408352: ['난키시라하마 온천'], Q77700884: ['미스지 유적'], // nanki_shirahama
  Q11405635: ['지토세오하시'], Q11502895: ['니이가타시 역사 박물관'], Q11503581: ['니이가타 고코쿠 신사'], Q5576152: ['니이가타 현립 식물원'], // niigata
  Q11402964: ['홋카이도 오비히로 미술관'], // obihiro
  Q110990382: ['아키타이누노사토'], Q11641883: ['닷코모리산'], Q20043438: ['오다테시 박물관'], // odate
  Q16895460: ['이시카와산'], // okinawa
  Q31486729: ['리시리 폰 야마'], // rishiri
  Q64796766: ['사가 조코칸'], // saga
  Q3539675: ['겐 도몬 사진 박물관'], // shonai
  Q11625212: ['소부산'], // tajima
  Q11666715: ['이이노산'], Q339004: ['메기지마'], // takamatsu
  Q19955545: ['이노카와 다케'], // tokunoshima
  Q11496825: ['오기산', 'Mount Ōgi'], // tottori
  Q11456392: ['도야마 과학관'], Q11456481: ['도야마 현립 수묵 미술관'], // toyama
  Q11437110: ['왓카나이 오누마호'], Q11596338: ['왓카나이 개기 백년 기념탑'], Q68888166: ['왓카나이 가라후토 박물관'], // wakkanai
  Q10950373: ['미야노우라산'], Q11344357: ['못초무산'], Q130279317: ['나고리 노 마쓰바라'], Q130283583: ['야쿠시마타이샤'], Q130284190: ['구스가와텐만구'], // yakushima
  Q6890444: ['모가미 요시아키 역사 박물관'], // yamagata
  Q11412165: ['미기타산'], // yamaguchi_ube
  Q9047014: ['쇼지 우에다 사진 박물관'], // yonago
  Q31686520: ['우라부산'], Q64589704: ['트이시'] // yonaguni
};
// Kinds that stay a sight even with a rejected extra class ("museum" + "company", "temple" + "cemetery").
const STRONG_KINDS = new Set(['themepark', 'castle', 'temple', 'shrine', 'church', 'aquarium', 'zoo', 'artmuseum', 'museum', 'onsen', 'garden']);
// Kinds that only count with enough documentation (a random bridge or islet is not a sight).
const KIND_MIN_SITELINKS = { heritage: 3, mountain: 3, attraction: 2 };
const GENERIC_NAME_RE = /^(?:중앙\s*공원|central park|中央公園|시민\s*공원|市民公園|운동\s*공원|運動公園|公園|神社|寺|城跡?)$/i;

// Hot-spring / bath photos looked at (no bathers visible); others are left out.
const REVIEWED_BATH_FILES = new Set([
  'Kurokawa Onsen -温泉街.jpg' // street of the onsen town, people in yukata (looked at 2026-10-01)
]);

// Photo/coordinates/labels for curated names that place-images.json does not cover. qid = the item
// the name means (reviewed); photoFrom = a closely related item whose P18 illustrates it (optional).
const MEDIA_ITEMS = {
  // new day-trip MUST_ATTRACTIONS (popular places without an airport, attached to a host city)
  'tokyo|닛코 도쇼구': { qid: 'Q696641' },
  'tokyo|가루이자와': { qid: 'Q1012064' },
  'tokyo|가와구치코': { qid: 'Q577372' },
  // the Wikidata label "三町" / "Sanmachi" alone does not say where it is
  'nagoya|다카야마 산마치': { qid: 'Q11356789', labels: { en: 'Takayama Sanmachi Old Town', ja: '飛騨高山・三町の古い町並み' } },
  'nagoya|이세 신궁': { qid: 'Q687168' },
  'kobe|히메지성': { qid: 'Q188754' },
  'osaka|히메지성': { qid: 'Q188754' },
  'kyoto|뵤도인': { qid: 'Q61094' },
  'kyoto|아마노하시다테': { qid: 'Q259727' },
  'osaka|고야산': { qid: 'Q535065' },
  'takamatsu|지추 미술관': { qid: 'Q4556499' },
  'okayama|지추 미술관': { qid: 'Q4556499' },
  'kumamoto|구로카와 온천': { qid: 'Q11678251' },
  'oita|구로카와 온천': { qid: 'Q11678251' },
  'matsumoto|젠코지': { qid: 'Q189640' },
  'nanki_shirahama|구마노 혼구 다이샤': { qid: 'Q705035' },
  // day trips that had no coordinates (the place itself, or its town for an area name)
  'tokyo|하코네': { qid: 'Q671040' },
  'tokyo|가마쿠라': { qid: 'Q200267', photoFrom: 'Q672056' }, // the city item's photo is a high school; Kōtoku-in (Great Buddha) instead
  // the item's first photo is Kōfuku-ji's pagoda (another temple): its second one shows Nara Park
  'osaka|나라 공원·도다이지': { qid: 'Q1186358', photoFile: 'Nara Park, November 2016.jpg' },
  'kyoto|나라 공원·도다이지': { qid: 'Q1186358', photoFile: 'Nara Park, November 2016.jpg' },
  // curated highlights that are real places but had no Wikidata match
  'ibaraki|오아라이 해변': { qid: 'Q11437228' },
  'yamaguchi_ube|도키와 공원': { qid: 'Q11273042' },
  'akita|아키타 현립 미술관': { qid: 'Q11483668' },
  // curated highlights without coordinates (no map pin) whose Wikidata item was found later (2026-10-02)
  'hanamaki|미야자와 겐지 기념관': { qid: 'Q125385956', noPhoto: true }, // its photo is the museum's restaurant
  'obihiro|반에이 경마': { qid: 'Q11481183' }, // Obihiro Racecourse, where ban'ei races run
  'kanazawa|오미초 시장': { qid: 'Q11638507' },
  'kitakyushu|모지코 레트로': { qid: 'Q11654979' },
  'matsuyama|보찬 열차': { qid: 'Q4948550' } // the Botchan Ressha train (left out by the location check if it has no coordinates)
};

function parseArgs(argv) {
  const opts = {
    out: path.join(ROOT, 'assets', 'city-places.json'),
    server: path.join(ROOT, 'server.js'),
    images: path.join(ROOT, 'assets', 'place-images.json'),
    cache: path.join(os.tmpdir(), 'tabimaru-city-places-cache'),
    refresh: false,
    only: null,
    checkImages: true,
    report: '',
    dryRun: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--out': opts.out = path.resolve(value()); break;
      case '--server': opts.server = path.resolve(value()); break;
      case '--images': opts.images = path.resolve(value()); break;
      case '--cache': opts.cache = path.resolve(value()); break;
      case '--refresh': opts.refresh = true; break;
      case '--only': opts.only = new Set(value().split(',').map((s) => s.trim()).filter(Boolean)); break;
      case '--no-check-images': opts.checkImages = false; break;
      case '--report': opts.report = path.resolve(value()); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help': case '-h': {
        const lines = fs.readFileSync(__filename, 'utf8').split('\n');
        const from = lines.findIndex((l) => l.startsWith(' * Usage:'));
        const to = lines.findIndex((l, idx) => idx > from && l.startsWith(' */'));
        console.log(lines.slice(from, to).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
        process.exit(0);
        break;
      }
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Curated data (server.js) and what each city already has
// ---------------------------------------------------------------------------

function readLiteral(src, name, fallback) {
  const literal = lib.extractDeclaration(src, name);
  if (!literal) return fallback;
  try { return lib.runInSandbox(`(${literal})`); } catch { return fallback; }
}

const nameKey = (s) => lib.normText(String(s || '').replace(lib.QUALIFIER, ''));
const stripQualifier = (s) => String(s || '').replace(lib.QUALIFIER, '').replace(/\s+/g, ' ').trim();

function curatedFor(cityKey, city, mustAttractions, extraPlaces, images) {
  const names = new Set();
  const qids = new Set();
  const coords = [];
  const jaNames = []; // { key, coord }: Japanese names of curated places with coordinates
  let halfDay = 0;
  const addName = (n) => { const k = nameKey(n); if (k) names.add(k); };
  const addMedia = (name) => {
    const m = images[`${cityKey}|${name}`];
    if (!m) return;
    if (m.wikidata) qids.add(m.wikidata);
    const hasCoord = Number.isFinite(m.lat) && Number.isFinite(m.lng);
    if (hasCoord) coords.push({ lat: m.lat, lng: m.lng });
    for (const l of Object.values(m.labels || {})) addName(l);
    if (hasCoord && m.labels && m.labels.ja) jaNames.push({ key: nameKey(m.labels.ja), coord: { lat: m.lat, lng: m.lng } });
  };
  const highlightNames = new Set();
  let shown = 0; // half-day highlights: the curated places the recommendation cards show (with the generated ones)
  for (const h of city.highlights || []) {
    if (!h || !h.name) continue;
    highlightNames.add(nameKey(h.name));
    addName(h.name);
    addMedia(h.name);
    if (!h.fullDay && !h.dayTrip) { halfDay += 1; shown += 1; }
  }
  for (const m of mustAttractions) {
    if (m.cityKey !== cityKey) continue;
    [m.name, ...(m.aliases || [])].forEach(addName);
    addMedia(m.name);
    const dupOfHighlight = [m.name, ...(m.aliases || [])].some((n) => highlightNames.has(nameKey(n)));
    if (!m.fullDay && !m.dayTrip && !dupOfHighlight) halfDay += 1;
  }
  for (const e of extraPlaces) {
    if (e.cityKey !== cityKey) continue;
    [e.name, e.en, e.ja, ...(e.aliases || [])].forEach(addName);
    if (Number.isFinite(e.lat) && Number.isFinite(e.lng)) {
      coords.push({ lat: e.lat, lng: e.lng });
      if (e.ja) jaNames.push({ key: nameKey(e.ja), coord: { lat: e.lat, lng: e.lng } });
    }
    halfDay += 1;
  }
  return { names, qids, coords, jaNames, halfDay, shown };
}

// ---------------------------------------------------------------------------
// Wikidata
// ---------------------------------------------------------------------------

async function sparqlAround(client, center, radiusKm, minSitelinks) {
  const query = `SELECT ?item ?sl ?dist WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${center.lng} ${center.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radiusKm}" . bd:serviceParam wikibase:distance ?dist . }
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${minSitelinks})
  ?item wdt:P17 wd:Q17 .
} ORDER BY DESC(?sl) LIMIT ${SPARQL_LIMIT}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await client.json(url);
  return ((data.results && data.results.bindings) || []).map((b) => ({
    qid: String(b.item.value).split('/').pop(),
    sitelinks: Number(b.sl.value) || 0,
    dist: Number(b.dist.value) || 0
  })).filter((r) => /^Q\d+$/.test(r.qid));
}

// The item's sight kind: the first KINDS entry one of its (not rejected) classes names. A weak kind
// ("tourist attraction", "bridge", "beach") does not count when another class is rejected
// ("railway station" + "tourist attraction" is a station).
function kindOf(entity, classLabels) {
  const labels = entity.classes.map((c) => classLabels.get(c) || '').filter(Boolean);
  if (!labels.length) return { kind: null, why: 'no-class' };
  const hard = labels.find((l) => HARD_REJECT_RE.test(l));
  if (hard) return { kind: null, why: `class:${hard}` };
  const rejects = labels.filter(isRejectLabel);
  for (const kind of KINDS) {
    const hit = labels.find((l) => !isRejectLabel(l) && kind.re.test(l));
    if (!hit) continue;
    if (rejects.length && !STRONG_KINDS.has(kind.id)) return { kind: null, why: `class:${rejects[0]}` };
    return { kind, classLabel: hit };
  }
  return { kind: null, why: `class:${(rejects.length ? rejects : labels).slice(0, 3).join('/')}` };
}

// Korean name, best first: a name looked at by hand (NAME_FIXES), the Korean Wikipedia title (Wikidata Korean
// labels are sometimes wrong: "사천왕사지" for Shitennō-ji), the Korean label, a transliteration by the rules of
// scripts/ja-names.js (Japanese reading or Hepburn English label: 霊山神社 → 료젠 신사), else the Japanese name.
function koName(entity, jaName, enName) {
  const fix = NAME_FIXES[entity.id];
  if (fix && fix.ko) return { name: fix.ko, from: 'fix' };
  const fromWiki = stripQualifier(entity.sitelinks.ko);
  if (fromWiki) return { name: fromWiki, from: 'kowiki' };
  const fromLabel = stripQualifier(entity.labels.ko);
  if (fromLabel) return { name: fromLabel, from: 'ko' };
  // (koDisplayName says 'fix' for a Japanese name looked at by hand in ja-names.js, else 'translit')
  const t = jaName ? jaNames.koDisplayName({ ja: jaName, en: enName, kana: entity.kana || [] }) : null;
  if (t) return { name: t.name, from: t.from === 'fix' ? 'fix' : 'translit' };
  return jaName ? { name: jaName, from: 'ja' } : { name: '', from: '' };
}

// a label that had a disambiguation qualifier ("福山城 (備中国)", "Fukuyama Castle (Sōja)")
const hadQualifier = (s) => lib.QUALIFIER.test(String(s || ''));
// cities that are one area for names (the Okadama airport city is Sapporo)
const SAME_AREA = { okadama: 'sapporo' };
// city name put in front of a clashing name when the city label is not a plain town name: [ko, ja, en]
const CITY_PREFIX = {
  okadama: ['삿포로', '札幌', 'Sapporo'],
  nanki_shirahama: ['시라하마', '白浜', 'Shirahama'],
  yamaguchi_ube: ['야마구치', '山口', 'Yamaguchi']
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function roundKm(n) { return Math.round(n * 10) / 10; }

async function main() {
  const opts = parseArgs(process.argv);
  const src = fs.readFileSync(opts.server, 'utf8');
  const { cityData, mustAttractions } = lib.loadServerData(src);
  const extraPlaces = readLiteral(src, 'EXTRA_PLACES', []);
  const centers = readLiteral(src, 'CITY_CENTER_COORDS', {});
  const airports = readLiteral(src, 'JAPAN_AIRPORT_COORDS', []);
  const cityNameI18n = readLiteral(src, 'CITY_NAME_I18N', {});
  const imagesFile = lib.readExisting(opts.images) || {};
  const images = imagesFile.places || {};
  const cityKeys = Object.keys(cityData).filter((k) => !opts.only || opts.only.has(k));
  console.log(`[city-places] ${cityKeys.length} cities, ${Object.keys(images).length} place-images entries`);

  const client = new lib.Client({ cacheDir: opts.cache, refresh: opts.refresh, minIntervalMs: MIN_INTERVAL_MS, uploadIntervalMs: UPLOAD_INTERVAL_MS, logTag: 'city-places' });
  const entityCache = new Map();
  const classLabels = new Map();
  const reportRows = [];
  const row = (cells) => cells.map((v) => String(v === undefined || v === null ? '' : v).replace(/[\t\r\n]+/g, ' ')).join('\t');

  const citiesOut = {};
  const allChosen = [];
  for (const cityKey of cityKeys) {
    const city = cityData[cityKey];
    const fixed = centers[cityKey];
    const airport = airports.find((a) => a && a.code === city.airport);
    const center = fixed ? { lat: fixed.lat, lng: fixed.lng } : (airport ? { lat: airport.lat, lng: airport.lng } : null);
    if (!center) { console.warn(`[city-places] ${cityKey}: no center coordinates, skipped`); continue; }
    const radiusKm = CITY_RADIUS_KM[cityKey] || DEFAULT_RADIUS_KM;
    const extraCenters = CITY_EXTRA_CENTERS[cityKey] || [];
    const circles = [{ center, radiusKm }, ...extraCenters.map((c) => ({ center: { lat: c.lat, lng: c.lng }, radiusKm: c.radiusKm }))];
    const curated = curatedFor(cityKey, city, mustAttractions, extraPlaces, images);
    // the Wikidata items of reviewed curated names (MEDIA_ITEMS) are curated too
    for (const [key, item] of Object.entries(MEDIA_ITEMS)) if (key.startsWith(`${cityKey}|`)) curated.qids.add(item.qid);
    // the cards show highlights + generated places (not MUST_ATTRACTIONS / hand-made EXTRA_PLACES), so fill up to the target from those
    const need = Math.max(0, TARGET_HALF_DAY - curated.shown);
    const cityJa = (cityNameI18n[city.label] || [])[1] || city.nameJa || '';
    const chosen = [];
    const accepted = [];
    if (need > 0) {
      const seenQids = new Set();
      const lowDoc = []; // rejected only for few sitelinks: used when the city stays short (small islands)
      const enough = () => accepted.length >= need * 2 + 4;
      // one SPARQL row + its Wikidata item -> accepted candidate, or a report row saying why not
      const consider = (r, e, relaxed = false) => {
        const reject = (why) => reportRows.push(row([cityKey, r.qid, 'rejected', why, r.sitelinks, roundKm(r.dist), e ? e.labels.ko : '', e ? e.labels.ja : '', e ? e.labels.en : '']));
        if (!e) return reject('no-entity');
        if (EXCLUDE_QIDS[e.id]) return reject(`excluded: ${EXCLUDE_QIDS[e.id]}`);
        if (EXCLUDE_IN_CITY[cityKey] && EXCLUDE_IN_CITY[cityKey][e.id]) return reject(`excluded: ${EXCLUDE_IN_CITY[cityKey][e.id]}`);
        if (!e.coord || !lib.inJapan(e.coord)) return reject('no-coordinates');
        if (e.countries.length && !e.countries.includes('Q17')) return reject('country');
        const dist = Math.min(...circles.map((c) => lib.haversineKm(c.center, e.coord)));
        if (!circles.some((c) => lib.haversineKm(c.center, e.coord) <= c.radiusKm)) return reject(`far:${roundKm(dist)}km`);
        if (curated.qids.has(e.id) || e.partOf.some((q) => curated.qids.has(q))) return reject('curated-item');
        const { kind, why, classLabel } = kindOf(e, classLabels);
        if (!kind) return reject(why);
        if (!relaxed && (KIND_MIN_SITELINKS[kind.id] || 0) > r.sitelinks) { lowDoc.push([r, e]); return reject(`few-sitelinks:${kind.id}`); }
        // the second pass is for small islands; elsewhere a barely documented peak is no sight (Wakkanai's nameless hills)
        if (relaxed && kind.id === 'mountain' && r.sitelinks < 2 && !ISLAND_CITIES.has(cityKey)) return reject('few-sitelinks:mountain');
        if ((e.dissolved || e.closed) && ['museum', 'artmuseum', 'aquarium', 'zoo', 'themepark', 'observation', 'market', 'park', 'shopping', 'garden'].includes(kind.id)) return reject('dissolved-or-closed');
        const shown = lib.displayLabels(e);
        const labels = { ...(shown.en ? { en: stripQualifier(shown.en) } : {}), ...(shown.ja ? { ja: stripQualifier(shown.ja) } : {}) };
        const ja = labels.ja || '';
        if (!ja) return reject('no-ja-label');
        // the island the city is on ("沖縄本島" for okinawa, "奄美大島" for amami) is not a sight
        if (kind.id === 'nature' && /island|islet/.test(classLabel) && cityJa && ja.includes(cityJa)) return reject('the-city-island');
        if (ISLAND_CITIES.has(cityKey) && kind.id === 'nature' && /island/.test(classLabel) && dist < 3) return reject('the-city-island');
        const ko = koName(e, ja, labels.en);
        ko.name = withCitySpelling(ko.name);
        if (!ko.name || ko.name.length > 40 || GENERIC_NAME_RE.test(ko.name) || GENERIC_NAME_RE.test(ja)) return reject('generic-or-long-name');
        if ([ko.name, ja, labels.en].some((n) => n && NOT_A_SIGHT_NAME_RE.test(n))) return reject('not-a-sight-name');
        const keys = [ko.name, ja, labels.en].map(nameKey).filter(Boolean);
        if (keys.some((k) => curated.names.has(k))) return reject('curated-name');
        // a monument or bridge inside a curated park is part of that visit (Children's Peace Monument)
        const nearKm = WEAK_KINDS.has(kind.id) ? DEDUPE_WEAK_NEAR_KM : DEDUPE_NEAR_KM;
        if (curated.coords.some((c) => lib.haversineKm(c, e.coord) <= nearKm)) return reject('next-to-curated');
        // "玄武洞ミュージアム" a few hundred metres from the curated 玄武洞 (겐부도) is part of that visit
        const jaKey = nameKey(ja);
        if (curated.jaNames.some((c) => c.key.length >= 2 && jaKey.includes(c.key) && lib.haversineKm(c.coord, e.coord) <= DEDUPE_NAMED_KM)) return reject('part-of-curated-name');
        const dup = accepted.find((a) => {
          if (a.entity.id === e.id || keys.includes(nameKey(a.ko.name))) return true;
          const km = lib.haversineKm(a.entity.coord, e.coord);
          // the coordinates of an onsen town, a district or a mountain are a centre point: other sights may stand there
          if (km <= DEDUPE_ANY_KIND_KM && !AREA_KINDS.has(a.kind.id) && !AREA_KINDS.has(kind.id)) return true;
          if (a.kind.id === kind.id && km <= DEDUPE_SAME_KIND_KM) return true;
          // a lighthouse on a small accepted island, a museum inside an accepted park (and the other way round);
          // a museum on a big island (Teshima Art Museum) or a waterfall on a mountain's slope is its own visit
          const related = [...e.partOf, ...(e.within || [])].includes(a.entity.id) || [...a.entity.partOf, ...(a.entity.within || [])].includes(e.id);
          return related && km <= DEDUPE_RELATED_KM;
        });
        if (dup) return reject(`duplicate:${dup.entity.id}`);
        accepted.push({ entity: e, kind, classLabel, labels, ko, sitelinks: r.sitelinks, dist: lib.haversineKm(center, e.coord) });
      };
      for (const minSl of SITELINK_STEPS) {
        if (enough()) break;
        const merged = new Map();
        for (const c of circles) {
          for (const r of await sparqlAround(client, c.center, c.radiusKm, minSl)) {
            const prev = merged.get(r.qid);
            if (!prev || r.dist < prev.dist) merged.set(r.qid, r);
          }
        }
        const rows = [...merged.values()].filter((r) => !seenQids.has(r.qid)).sort((a, b) => b.sitelinks - a.sitelinks);
        // most documented first, a page at a time: full item data is fetched only until the city has enough candidates
        for (let from = 0; from < rows.length && !enough(); from += ENTITY_PAGE) {
          const page = rows.slice(from, from + ENTITY_PAGE);
          page.forEach((r) => seenQids.add(r.qid));
          const entities = await lib.getEntities(client, entityCache, page.map((r) => r.qid));
          await lib.getClassLabels(client, classLabels, entities.flatMap((e) => (e ? e.classes : [])));
          page.forEach((r, idx) => consider(r, entities[idx]));
        }
      }
      // still short (small islands): less documented sights of the accepted kinds (a peak, a lighthouse)
      if (accepted.length < need) for (const [r, e] of lowDoc) consider(r, e, true);
      // A whole-day place (big theme park, a summit of 1,000 m+) does not count as a half-day sight.
      for (const a of accepted) {
        a.fullDay = Boolean((a.kind.fullDayMinSitelinks && a.sitelinks >= a.kind.fullDayMinSitelinks)
          || (a.kind.fullDayMinElevation && Number(a.entity.elevation) >= a.kind.fullDayMinElevation));
      }
      // Rank: how widely documented (sitelinks), a Korean label (known to Korean travellers), a photo.
      const score = (a) => a.sitelinks + (a.entity.labels.ko ? KO_LABEL_BONUS : 0) + (a.entity.image ? 1 : 0);
      accepted.sort((a, b) => (score(b) - score(a)) || (a.dist - b.dist));
      // Diversity: a few per kind group first, then the rest by rank; at most MAX_FULL_DAY whole-day places on top.
      const count = new Map();
      const deferred = [];
      const halfDay = () => chosen.filter((c) => !c.fullDay).length;
      for (const a of accepted.filter((x) => !x.fullDay)) {
        if (halfDay() >= need) break;
        const group = KIND_GROUP[a.kind.id] || a.kind.id;
        const n = count.get(group) || 0;
        if (n >= (GROUP_MAX[group] || MAX_PER_KIND)) { deferred.push(a); continue; }
        chosen.push(a);
        count.set(group, n + 1);
      }
      for (const a of deferred) {
        if (halfDay() >= need) break;
        chosen.push(a);
      }
      chosen.push(...accepted.filter((x) => x.fullDay).slice(0, MAX_FULL_DAY));
    }
    const chosenIds = new Set(chosen.map((c) => c.entity.id));
    for (const a of accepted) {
      if (!chosenIds.has(a.entity.id)) reportRows.push(row([cityKey, a.entity.id, 'not-needed', a.kind.id, a.sitelinks, roundKm(a.dist), a.entity.labels.ko, a.entity.labels.ja, a.entity.labels.en]));
    }
    const halfDayChosen = chosen.filter((c) => !c.fullDay).length;
    citiesOut[cityKey] = {
      center: { lat: lib.round5(center.lat), lng: lib.round5(center.lng) },
      radiusKm,
      ...(extraCenters.length ? { extraCenters: extraCenters.map((c) => ({ lat: c.lat, lng: c.lng, radiusKm: c.radiusKm })) } : {}),
      curatedHalfDay: curated.halfDay,
      few: curated.halfDay + halfDayChosen < MIN_SIGHTS,
      places: chosen
    };
    allChosen.push(...chosen.map((c) => ({ cityKey, c })));
    console.log(`[city-places] ${cityKey}: curated ${curated.halfDay}, need ${need}, candidates ${accepted.length}, chosen ${chosen.length}${citiesOut[cityKey].few ? ' (few)' : ''}`);
  }

  // area labels (P131) and the reviewed media items
  const adminIds = [...new Set(allChosen.map(({ c }) => c.entity.admin[0]).filter(Boolean))];
  await lib.getEntities(client, entityCache, adminIds, 'labels');
  const mediaKeys = Object.keys(MEDIA_ITEMS).filter((k) => !opts.only || opts.only.has(k.split('|')[0]));
  await lib.getEntities(client, entityCache, mediaKeys.flatMap((k) => [MEDIA_ITEMS[k].qid, MEDIA_ITEMS[k].photoFrom].filter(Boolean)));

  const isBath = (name, file) => lib.needsBathReview(name, file) && !REVIEWED_BATH_FILES.has(file);
  const photoFile = (name, entity) => (entity && entity.image && !NO_PHOTO_QIDS[entity.id] && !isBath(name, entity.image) ? entity.image : '');
  const mediaPlan = mediaKeys.map((key) => {
    const item = MEDIA_ITEMS[key];
    const entity = entityCache.get(item.qid) || null;
    const photoEntity = item.photoFrom ? entityCache.get(item.photoFrom) || null : entity;
    // photoFile: another P18 image of the same item, looked at (the first one shows something else)
    const pinned = item.photoFile && photoEntity && (photoEntity.images || []).includes(item.photoFile) ? item.photoFile : '';
    const file = item.noPhoto ? '' : (pinned || photoFile(key, photoEntity));
    return { key, item, entity, file };
  });

  // A generated place named like a curated place or a city elsewhere ("厳島神社" in Kushiro, "清水寺" in Hanamaki)
  // gets its city's name in front ("구시로 이쓰쿠시마 신사" / "釧路厳島神社" / "Kushiro Itsukushima Shrine") so that
  // it is not taken for the famous one; so does a label that needed a qualifier on Wikidata ("福山城 (備中国)" →
  // "오카야마 후쿠야마성"). The same Wikidata item in two cities is one place, and Sapporo / Sapporo Okadama are
  // one city (SAME_AREA). Two generated places of the same name in two cities are told apart by the city context.
  const nameOwners = new Map(); // key → Set of "<cityKey>|<qid or ''>"
  const own = (label, cityKey, qid = '') => {
    const k = nameKey(label);
    if (!k || k.length < 2) return;
    if (!nameOwners.has(k)) nameOwners.set(k, new Set());
    nameOwners.get(k).add(`${cityKey}|${qid}`);
  };
  for (const [ck, city] of Object.entries(cityData)) {
    const cityRow = cityNameI18n[city.label] || [];
    [ck.replace(/_/g, ' '), city.label, city.nameJa, ...cityRow].forEach((l) => own(l, ck, `city:${ck}`));
    for (const h of city.highlights || []) {
      const m = images[`${ck}|${h.name}`];
      [h.name, ...Object.values((m && m.labels) || {})].forEach((l) => own(l, ck, (m && m.wikidata) || ''));
    }
  }
  for (const m of mustAttractions) {
    const media = images[`${m.cityKey}|${m.name}`] || (MEDIA_ITEMS[`${m.cityKey}|${m.name}`] ? { wikidata: MEDIA_ITEMS[`${m.cityKey}|${m.name}`].qid } : null);
    [m.name, ...(m.aliases || [])].forEach((l) => own(l, m.cityKey, (media && media.wikidata) || ''));
  }
  for (const e of extraPlaces) [e.name, e.en, e.ja, ...(e.aliases || [])].forEach((l) => own(l, e.cityKey, ''));
  const area = (ck) => SAME_AREA[ck] || ck;
  const clashes = (label, cityKey, qid) => {
    const owners = nameOwners.get(nameKey(label));
    return Boolean(owners) && [...owners].some((o) => { const [ck, q] = o.split('|'); return area(ck) !== area(cityKey) && q !== qid; });
  };
  // the city name put in front: [ko, ja, en]
  const cityPrefix = (ck) => CITY_PREFIX[ck] || [cityData[ck].label, (cityNameI18n[cityData[ck].label] || [])[1] || '', (cityNameI18n[cityData[ck].label] || [])[0] || ''];
  const files = [
    ...allChosen.map(({ c }) => photoFile(`${c.ko.name} ${c.labels.ja || ''}`, c.entity)),
    ...mediaPlan.map((m) => m.file)
  ].filter(Boolean);
  const imageInfos = await lib.checkedImages(client, files, opts.checkImages);
  const photo = (file) => {
    const info = file ? imageInfos.get(file) : null;
    return info && info.ok ? { image: info.image, filePage: info.filePage, license: info.license, artist: info.artist } : null;
  };

  const out = {};
  for (const [cityKey, c] of Object.entries(citiesOut)) {
    const cityLabel = cityData[cityKey].label;
    out[cityKey] = {
      ...c,
      places: c.places.map((a) => {
        const e = a.entity;
        const admin = e.admin[0] ? entityCache.get(e.admin[0]) : null;
        const areaKo = admin ? areaSpelling(stripQualifier(admin.labels.ko)) : '';
        const areaFix = AREA_FIXES[e.id] || null;
        const file = photoFile(`${a.ko.name} ${a.labels.ja || ''}`, e);
        const p = photo(file);
        // English: Wikidata, else a name looked at by hand, else the Hepburn reading of the kana name ("Dai Onsen"), else Japanese
        const fix = NAME_FIXES[e.id] || {};
        let names = {
          ko: a.ko.name,
          en: fix.en || a.labels.en || jaNames.enFromKana(a.labels.ja, (e.kana || [])[0]) || a.labels.ja,
          ja: a.labels.ja
        };
        // a qualifier matters for a short name ("太平山 (秋田県)", "福山城 (備中国)"), not for "久留米水天宮"-like long ones
        const qualified = [e.labels.ja, e.sitelinks.ja, e.labels.en, e.sitelinks.en].some(hadQualifier) && names.ko.replace(/\s+/g, '').length <= 6;
        let baseNames = [];
        const clash = [names.ko, names.en, names.ja].some((l) => clashes(l, cityKey, e.id));
        if (qualified || clash) {
          const [ko, ja, en] = cityPrefix(cityKey);
          // the plain name stays findable when this place is what people mean by it: a clash is handled by the
          // app (it skips names other places use), a qualified name only for a widely documented place
          // (端島 = Gunkanjima: yes; 福山城 (備中国), a ruin, is not the famous Fukuyama Castle: no)
          if (clash || a.sitelinks >= 10) baseNames = [names.ko, names.en, names.ja];
          names = {
            ko: ko && !names.ko.includes(ko) ? `${ko} ${names.ko}` : names.ko,
            en: en && !names.en.toLowerCase().includes(en.toLowerCase()) && !/[^\x00-\x7FāīūēōĀĪŪĒŌ]/.test(names.en) ? `${en} ${names.en}` : names.en,
            ja: ja && !names.ja.includes(ja) ? `${ja}${names.ja}` : names.ja
          };
        }
        // aliases: the names without the city in front (the app matches them only where they are unambiguous), the app's
        // other spelling of a word (SPELLING_VARIANTS) and the names the app showed before (FORMER_NAMES)
        const variants = SPELLING_VARIANTS.filter(([re]) => re.test(names.ko)).map(([re, to]) => names.ko.replace(re, to));
        const aliases = [...new Set([...baseNames, ...variants, ...(FORMER_NAMES[e.id] || [])].filter((n) => n && ![names.ko, names.en, names.ja].includes(n)))];
        const entry = {
          name: names.ko,
          nameFrom: a.ko.from,
          en: names.en,
          ja: names.ja,
          ...(aliases.length ? { aliases } : {}),
          wikidata: e.id,
          lat: lib.round5(e.coord.lat),
          lng: lib.round5(e.coord.lng),
          distKm: roundKm(a.dist),
          sitelinks: a.sitelinks,
          kind: a.kind.id,
          category: e.classes.some((q) => SHOPPING_CLASS_RE.test(classLabels.get(q) || '')) ? '쇼핑' : a.kind.category,
          stayMin: (a.fullDay || a.dist > DAY_TRIP_KM) ? 480 : a.kind.stayMin,
          bestTime: (a.fullDay || a.dist > DAY_TRIP_KM) ? '09:00-18:00' : a.kind.bestTime,
          ...(a.kind.indoor ? { indoor: true } : {}),
          // whole day: a theme park is fullDay (an admission place), a summit hike or a place more than
          // DAY_TRIP_KM from the city center dayTrip (like a far day trip)
          ...(a.fullDay ? (a.kind.id === 'themepark' ? { fullDay: true } : { dayTrip: true }) : (a.dist > DAY_TRIP_KM ? { dayTrip: true } : {})),
          area: (areaFix && areaFix.ko) || areaKo || cityLabel,
          ...(areaFix ? { areaEn: areaFix.en, areaJa: areaFix.ja }
            : (areaKo && admin ? { areaEn: stripQualifier(lib.displayLabels(admin).en || ''), areaJa: stripQualifier(lib.displayLabels(admin).ja || '') } : {})),
          image: p ? p.image : null,
          filePage: p ? p.filePage : null,
          license: p ? p.license : null,
          artist: p ? p.artist : ''
        };
        if (!p && e.image) entry.imageNote = isBath(`${a.ko.name} ${a.labels.ja || ''}`, e.image) ? 'bath photo not reviewed' : 'no free photo';
        reportRows.push(row([cityKey, e.id, 'chosen', a.kind.id, a.sitelinks, roundKm(a.dist), e.labels.ko, e.labels.ja, e.labels.en, entry.name, entry.area, p ? p.license : (entry.imageNote || 'no P18')]));
        return entry;
      })
    };
  }

  const mediaOut = {};
  for (const m of mediaPlan) {
    const cityKey = m.key.split('|')[0];
    const center = out[cityKey] ? out[cityKey].center : centers[cityKey];
    const e = m.entity;
    const okLocation = e && e.coord && lib.inJapan(e.coord) && (!center || lib.haversineKm(center, e.coord) <= MEDIA_RADIUS_KM);
    if (!okLocation) {
      console.warn(`[city-places] media ${m.key}: ${e ? 'not near the city' : 'item not found'} (${m.item.qid}), left out`);
      continue;
    }
    if (m.item.photoFrom && m.file) {
      const lender = entityCache.get(m.item.photoFrom);
      if (!lender || !lender.coord || lib.haversineKm(lender.coord, e.coord) > 30) m.file = '';
    }
    const p = photo(m.file);
    mediaOut[m.key] = {
      image: p ? p.image : null,
      filePage: p ? p.filePage : null,
      license: p ? p.license : null,
      artist: p ? p.artist : '',
      lat: lib.round5(e.coord.lat),
      lng: lib.round5(e.coord.lng),
      wikidata: e.id,
      // labels: a reviewed display name where the Wikidata label alone says nothing ("三町" → 飛騨高山・三町の古い町並み)
      labels: { ...lib.displayLabels(e), ...(m.item.labels || {}) },
      ...(m.item.photoFrom && p ? { photoFrom: m.item.photoFrom } : {})
    };
  }

  const sections = { cities: lib.sortedObject(out), media: lib.sortedObject(mediaOut) };
  const existing = lib.readExisting(opts.out);
  const unchanged = existing && JSON.stringify(existing.cities || {}) === JSON.stringify(sections.cities)
    && JSON.stringify(existing.media || {}) === JSON.stringify(sections.media);
  const output = {
    version: FILE_VERSION,
    generatedAt: unchanged && existing.generatedAt ? existing.generatedAt : new Date().toISOString(),
    source: {
      data: 'Wikidata (CC0): items with coordinates near each city, query.wikidata.org wikibase:around; labels from Wikidata / Wikipedia titles',
      photos: 'Wikimedia Commons, free licenses only (credit: artist, license, filePage)',
      script: 'scripts/build-city-places.js',
      targetHalfDay: TARGET_HALF_DAY,
      minSights: MIN_SIGHTS,
      notes: 'name = Korean name: nameFrom fix (looked at by hand), kowiki (Korean Wikipedia title), ko (Wikidata label), translit (Japanese reading or Hepburn English label written in Korean by scripts/ja-names.js), or ja (the Japanese label, when none of these exists); en falls back to the Hepburn kana reading, then ja. A name used by another city (or one Wikidata needs a qualifier for) has the area in front. aliases = names to find the place by, never shown: the name without the area in front, another spelling the app uses for a word (다이샤/타이샤), and names shown before a renaming (saved plans keep them). Places lie within radiusKm of center (or of an extraCenters circle). distKm = distance to center. few = fewer than minSights half-day sights exist near the city (the app says so instead of borrowing places from other cities).'
    },
    ...sections
  };

  if (opts.report) {
    const header = ['city', 'qid', 'status', 'kind/why', 'sitelinks', 'distKm', 'ko', 'ja', 'en', 'name', 'area', 'photo'].join('\t');
    fs.mkdirSync(path.dirname(opts.report), { recursive: true });
    fs.writeFileSync(opts.report, `${header}\n${reportRows.join('\n')}\n`);
    console.log(`[city-places] report: ${opts.report}`);
  }
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, `${JSON.stringify(output, null, 1)}\n`);
    console.log(`[city-places] wrote ${opts.out}${unchanged ? ' (content unchanged)' : ''}`);
  }
  const places = Object.values(out).flatMap((c) => c.places);
  console.log(`[city-places] places ${places.length} / with photo ${places.filter((p) => p.image).length} / Korean name from Wikidata ${places.filter((p) => p.nameFrom !== 'ja').length}; few: ${Object.entries(out).filter(([, c]) => c.few).map(([k]) => k).join(', ') || 'none'}; media ${Object.keys(mediaOut).length}/${mediaKeys.length}`);
  console.log(`[city-places] requests: ${client.stats.network} network, ${client.stats.cached} cached, ${client.stats.retries} retries`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[city-places] failed: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}

module.exports = { KINDS, REJECT_HEAD_RE, REJECT_ANY_RE, CITY_RADIUS_KM, DEFAULT_RADIUS_KM, TARGET_HALF_DAY, MIN_SIGHTS, MEDIA_ITEMS };
