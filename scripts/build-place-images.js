#!/usr/bin/env node
'use strict';

/*
 * Builds assets/place-images.json: a free photo (Wikimedia Commons, via Wikidata P18) and
 * coordinates (Wikidata P625) for every curated highlight in server.js CITY_DATA, plus the
 * MUST_ATTRACTIONS list.
 *
 * - Reads CITY_DATA from server.js WITHOUT starting the server (the source is evaluated in a vm
 *   sandbox; server.js itself is never required or modified).
 * - Lookup order per place: Korean Wikipedia (exact title, spelling variants, search), then
 *   Japanese Wikipedia, then English Wikipedia (curated name hints below), then the name without
 *   a descriptive tail ("센다이성 유적" -> "센다이성"), then Wikidata search.
 * - Every match is verified: label/alias match, not a city/person/disambiguation item, located
 *   in Japan and near the city. Anything doubtful is left out (precision over recall); the
 *   exclusion lists below hold the mismatches found by looking at every photo.
 * - Output entries always have wikidata + coordinates and/or an image; "image" (with filePage and
 *   license) is null when there is no suitable free photo, lat/lng are null without coordinates.
 * - Place and city entries carry "labels": {en, ja}, the display names for the English and Japanese
 *   screens: the matched item's Wikidata label, else its English / Japanese Wikipedia title without
 *   the trailing disambiguator ("高松城 (讃岐国)" -> "高松城"); LABEL_FIXES holds the few reviewed
 *   corrections. A language with neither is left out (labels may be {}). For a place this is the
 *   place's own item (also when IMAGE_FROM borrows the photo); for a city it is the city item, or a
 *   CITY_IMAGE_FROM item marked isCity, never one that only lends its photo.
 * - Two extra sections for cards without a place photo of their own (the server reads them only
 *   if it wants to; "places" keeps the shared shape):
 *     "cities":     { "<cityKey>": {image, filePage, license, artist, lat, lng, wikidata, labels} } — the
 *                   P18 of the city item used for the "near that city" check (or CITY_IMAGE_FROM),
 *                   e.g. for synthetic "XX 추천 명소 N" cards and cities whose sights have no photo.
 *     "foodGenres": { "<CITY_DATA foods[].genre>": {image, filePage, license, artist, wikidata} } —
 *                   a representative dish photo per food genre (GENRE_ITEMS, reviewed by eye); it
 *                   illustrates the genre, not the specific restaurant.
 * - Only files hosted on Wikimedia Commons with a free license are used; credit (artist, license,
 *   file page) is stored because CC BY / CC BY-SA require attribution. "artist" is a plain name
 *   (wiki markup dropped) and never empty with an image: "Wikimedia Commons" when the file names
 *   no single author (see creditName).
 * - Manual review rule: a hot-spring / bath photo is used only when no bathers are visible.
 *   --review-baths downloads every such photo (BATH_REVIEW) for a look; a failing one goes to
 *   IMAGE_FROM (related item's photo) or EXCLUDE_IMAGES. Last full review: 2026-10-01.
 * - Free public APIs only, no API key. Polite: fixed User-Agent, at most 4 requests per second,
 *   retries with backoff, and an on-disk response cache so an interrupted run resumes cheaply.
 *
 * Usage:
 *   node scripts/build-place-images.js [options]
 *     --out <file>        output file (default: assets/place-images.json)
 *     --server <file>     server source to read CITY_DATA from (default: server.js)
 *     --cache <dir>       response cache directory (default: <os tmp>/tabimaru-place-images-cache)
 *     --refresh           ignore cached responses (they are rewritten)
 *     --only <keys>       comma separated city keys (debugging; output then holds only those)
 *     --no-must           skip MUST_ATTRACTIONS
 *     --no-check-images   do not HEAD-check the final image URLs
 *     --report <file>     write a TSV review table of every place (match, labels, distance)
 *     --spot-check <n>    download n random images and print what they should show
 *     --review-baths      download every hot-spring / bath photo for the no-bathers check
 *     --spot-dir <dir>    where --spot-check / --review-baths save the images
 *                         (default: <os tmp>/tabimaru-spot-check)
 *     --dry-run           do not write the output file
 *     --verbose           log every rejected candidate
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const USER_AGENT = 'TabimaruBot/0.1 (+https://github.com/wsxc94/tabimaru-japan-travel-planner)';
const FILE_VERSION = 1;
// Wikimedia serves thumbnails only in standard steps (…, 330, 500, 960, …); 480px now returns
// HTTP 400, so the nearest standard width is used.
const THUMB_WIDTH = 500;
const MIN_INTERVAL_MS = 260; // all hosts combined: < 4 requests per second
const UPLOAD_INTERVAL_MS = 1500; // image checks on upload.wikimedia.org
const MAX_RETRIES = 5;
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const HIGHLIGHT_RADIUS_KM = 120;
const MUST_RADIUS_KM = 300; // MUST_ATTRACTIONS are mapped to a loosely related city key
const CITY_REF_MAX_FROM_AIRPORT_KM = 150;
const JAPAN_BBOX = { minLat: 20, maxLat: 46.6, minLng: 122, maxLng: 154.5 };

// Curated Japanese/English names for highlights whose Korean name is not a Korean Wikipedia
// title. They only add search terms; every hit still goes through the same verification.
// Descriptive highlights with no single real subject (e.g. "해변 일몰") deliberately have none.
const NAME_HINTS = {
  'tokyo|시부야 스카이': { ja: ['SHIBUYA SKY', '渋谷スクランブルスクエア'], en: ['Shibuya Sky', 'Shibuya Scramble Square'] },
  'tokyo|츠키지 외시장': { ja: ['築地場外市場'], en: ['Tsukiji Outer Market'] },
  'kyoto|아라시야마 대나무숲': { ja: ['竹林の小径', '嵯峨野竹林'], en: ['Arashiyama Bamboo Grove', 'Sagano Bamboo Forest'] },
  'sapporo|니조시장': { ja: ['二条市場'], en: ['Nijō Market'] },
  'sapporo|삿포로 오도리 공원': { ja: ['大通公園'], en: ['Odori Park'] },
  'hakodate|하코다테 야경': { ja: ['函館山'], en: ['Mount Hakodate'] },
  'asahikawa|헤이와도리 쇼핑공원': { ja: ['平和通買物公園'] },
  'asahikawa|우에노팜': { ja: ['上野ファーム'] },
  'asahikawa|후라노 라벤더밭': { ja: ['ファーム富田'], en: ['Farm Tomita'] },
  'asahikawa|비에이 청의 호수': { ja: ['白金青い池', '青い池'], en: ['Shirogane Blue Pond', 'Blue Pond (Biei)'] },
  'aomori|네부타 박물관': { ja: ['ねぶたの家 ワ・ラッセ', 'ねぶたの家ワ・ラッセ'] },
  'aomori|오이라세 계곡': { ja: ['奥入瀬渓流'], en: ['Oirase Stream'] },
  'akita|센슈공원': { ja: ['千秋公園'], en: ['Senshū Park'] },
  'hanamaki|하나마키 온천': { ja: ['花巻温泉'] },
  'hanamaki|미야자와 겐지 기념관': { ja: ['宮沢賢治記念館'] },
  'yamagata|자오 온천': { ja: ['蔵王温泉'], en: ['Zaō Onsen'] },
  'yamagata|카조 공원': { ja: ['霞城公園', '山形城'], en: ['Yamagata Castle'] },
  'yamagata|리사쿠지': { ja: ['立石寺'], en: ['Risshaku-ji'] },
  'sendai|센다이성 유적': { ja: ['仙台城'], en: ['Sendai Castle'] },
  'fukushima|고시키누마': { ja: ['五色沼 (北塩原村)'] },
  'fukushima|오우치주쿠': { ja: ['大内宿'], en: ['Ōuchi-juku'] },
  'niigata|피아반다이 시장': { ja: ['ピアBandai'] },
  'niigata|니가타 수족관': { ja: ['新潟市水族館', 'マリンピア日本海'] },
  'kanazawa|오미초 시장': { ja: ['近江町市場'], en: ['Ōmichō Market'] },
  'kanazawa|히가시차야 거리': { ja: ['ひがし茶屋街', '東山ひがし'], en: ['Higashi Chaya District'] },
  'toyama|글래스 미술관': { ja: ['富山市ガラス美術館'], en: ['Toyama Glass Art Museum'] },
  'yonago|다이센': { ja: ['大山 (鳥取県)'], en: ['Mount Daisen'] },
  'izumo|신지호 석양': { ja: ['宍道湖'], en: ['Lake Shinji'] },
  'takamatsu|타카마츠성 유적': { ja: ['高松城 (讃岐国)', '玉藻公園'], en: ['Takamatsu Castle (Sanuki)'] },
  'takamatsu|야시마 전망대': { ja: ['屋島'], en: ['Yashima (Kagawa)'] },
  'matsuyama|보찬 열차': { ja: ['坊っちゃん列車'], en: ['Botchan Ressha'] },
  'kochi|카츠라하마': { ja: ['桂浜'], en: ['Katsurahama'] },
  'kochi|히로메 시장': { ja: ['ひろめ市場'] },
  'tokushima|아와오도리 회관': { ja: ['阿波おどり会館'] },
  'tokushima|나루토 소용돌이': { ja: ['鳴門の渦潮'], en: ['Naruto whirlpools'] },
  'tokushima|비잔 로프웨이': { ja: ['眉山ロープウェイ'] },
  'nagasaki|글로버가든': { ja: ['グラバー園'], en: ['Glover Garden'] },
  'nagasaki|평화공원': { ja: ['平和公園 (長崎市)'], en: ['Nagasaki Peace Park'] },
  'kumamoto|아소 화산': { ja: ['阿蘇山'], en: ['Mount Aso'] },
  'oita|벳푸 지옥온천': { ja: ['別府地獄めぐり', '地獄めぐり (別府温泉)'], en: ['Hells of Beppu'] },
  'oita|유후인 거리': { ja: ['湯の坪街道'] },
  'oita|타카사키야마': { ja: ['高崎山自然動物園'], en: ['Takasakiyama Natural Zoological Garden'] },
  'miyazaki|아오시마 신사': { ja: ['青島神社'], en: ['Aoshima Shrine'] },
  'miyazaki|선멧세 니치난': { ja: ['サンメッセ日南'] },
  'kagoshima|이부스키 모래찜': { ja: ['指宿温泉'], en: ['Ibusuki Onsen'] },
  'obihiro|도카치가와 온천': { ja: ['十勝川温泉'] },
  'obihiro|마나베 정원': { ja: ['真鍋庭園'] },
  'wakkanai|왓카나이 공원': { ja: ['稚内公園'] },
  'rishiri|리시리산 전망': { ja: ['利尻山'], en: ['Mount Rishiri'] },
  'rishiri|페시미사키 전망대': { ja: ['ペシ岬'] },
  'memanbetsu|아바시리 유빙관': { ja: ['オホーツク流氷館'] },
  'memanbetsu|비호로 고개': { ja: ['美幌峠'], en: ['Bihoro Pass'] },
  'memanbetsu|시레토코 자연길': { ja: ['知床国立公園'], en: ['Shiretoko National Park'] },
  'kushiro|누사마이 다리': { ja: ['幣舞橋'], en: ['Nusamai Bridge'] },
  'kushiro|와쇼 시장': { ja: ['和商市場'] },
  'okadama|모에레누마 공원': { ja: ['モエレ沼公園'], en: ['Moerenuma Park'] },
  'okadama|오도리 야경': { ja: ['大通公園'], en: ['Odori Park'] },
  'misawa|오이라세 계류': { ja: ['奥入瀬渓流'], en: ['Oirase Stream'] },
  'misawa|미사와 항공박물관': { ja: ['三沢航空科学館'], en: ['Misawa Aviation & Science Museum'] },
  'odate|아키타견 박물관': { ja: ['秋田犬会館'] },
  'odate|오유 스톤서클': { ja: ['大湯環状列石'], en: ['Ōyu Stone Circles'] },
  'shonai|데와산잔': { ja: ['出羽三山'], en: ['Dewa Sanzan'] },
  'shonai|가모 수족관': { ja: ['鶴岡市立加茂水族館'], en: ['Kamo Aquarium'] },
  'shonai|사카타 항구': { ja: ['酒田港'] },
  'ibaraki|히타치 해변공원': { ja: ['国営ひたち海浜公園'], en: ['Hitachi Seaside Park'] },
  'nanki_shirahama|시라라하마 해변': { ja: ['白良浜'], en: ['Shirarahama Beach'] },
  'nanki_shirahama|엔게츠섬': { ja: ['円月島'] },
  'nanki_shirahama|어드벤처월드': { ja: ['アドベンチャーワールド'], en: ['Adventure World (Japan)'] },
  'tajima|기노사키 온천': { ja: ['城崎温泉'], en: ['Kinosaki Onsen'] },
  'tajima|키노사키 온천': { ja: ['城崎温泉'], en: ['Kinosaki Onsen'] },
  'tajima|고노토리 공원': { ja: ['兵庫県立コウノトリの郷公園'] },
  'tajima|겐부도': { ja: ['玄武洞'] },
  'yamaguchi_ube|아키요시 동굴': { ja: ['秋芳洞'], en: ['Akiyoshi-dō'] },
  'yamaguchi_ube|루리코지': { ja: ['瑠璃光寺'], en: ['Rurikō-ji'] },
  'amami|아야마루 곶': { ja: ['あやまる岬'] },
  'yakushima|시라타니 운수협곡': { ja: ['白谷雲水峡'], en: ['Shiratani Unsuikyō'] },
  'yakushima|조몬스기 트레일': { ja: ['縄文杉'], en: ['Jōmon Sugi'] },
  'yakushima|오코 폭포': { ja: ['大川の滝'] },
  'miyako|이케마 대교': { ja: ['池間大橋'] },
  'miyako|요나하마에하마 해변': { ja: ['与那覇前浜'] },
  'miyako|히가시헨나자키': { ja: ['東平安名崎'] },
  'ishigaki|카비라만': { ja: ['川平湾'], en: ['Kabira Bay'] },
  'ishigaki|이시가키 석회동굴': { ja: ['石垣島鍾乳洞'] },
  'shimojishima|17END 비치': { ja: ['17END'] },
  'kumejima|하테노하마': { ja: ['ハテの浜'] },
  'kumejima|우에구스쿠성터': { ja: ['宇江城城'], en: ['Uegusuku Castle'] },
  'yonaguni|일본 최서단 기념비': { ja: ['西崎'] },
  'yonaguni|해저 지형 다이빙': { ja: ['与那国島海底地形'], en: ['Yonaguni Monument'] },
  'tokunoshima|무시로세 해안': { ja: ['ムシロ瀬'] },
  'kobe|구마노고도': { ja: ['熊野古道'], en: ['Kumano Kodō'] },
  'nagoya|게로 온천': { ja: ['下呂温泉'], en: ['Gero Onsen'] },
  'matsumoto|시부 온천': { ja: ['渋温泉'], en: ['Shibu Onsen'] },
  'matsumoto|스노우몽키 파크': { ja: ['地獄谷野猿公苑'], en: ['Jigokudani Monkey Park'] }
};

// Places or specific items excluded after manual review (wrong subject or misleading photo).
const EXCLUDE_PLACES = {};
const EXCLUDE_QIDS = {
  // "築地場外市場" redirects to the former inner wholesale market (moved to Toyosu in 2018)
  'tokyo|츠키지 외시장': ['Q859471'],
  // the crater lake on Mt. Azuma, not the Urabandai ponds that tourists mean by 고시키누마
  'fukushima|고시키누마': ['Q11372628']
};
// Right place, but its Commons photo shows something else: coordinates are kept, the photo is not.
const EXCLUDE_IMAGES = {
  'kagoshima|이부스키 모래찜': 'photo shows Mt. Kaimon from the sea, not the sand bath',
  'nagoya|오아시스21': 'photo shows Nagoya TV Tower at night',
  'yonaguni|일본 최서단 기념비': 'photo shows the cape and lighthouse, not the monument'
};
// Right place, but its own photo is unsuitable: the photo comes from the P18 of a closely related
// item instead (qid + the reviewed file, which must still be one of that item's P18 values).
// Coordinates and wikidata stay the place's own.
const IMAGE_FROM = {
  'oita|유후인': { qid: 'Q11648024', file: 'Lake Kinrin with Morning fog.jpg', why: 'own photo (Musōen open-air bath) shows a bather; Lake Kinrin in Yufuin instead' },
  'hanamaki|하나마키 온천': { qid: 'Q317827', file: '花巻温泉 バラ園とホテル3館.jpg', why: 'the onsen item has no photo; the Hanamaki city photo shows Hanamaki Onsen (rose garden and hotels)' }
};
// Hot-spring / bath photos: used only when no bathers are visible (checked with --review-baths).
const BATH_REVIEW = /온천|온센|노천|목욕|모래찜|스파|onsen|spa\b|bath|rotenburo|風呂|温泉|露天|浴/i;

// City photos ("cities" section): normally the P18 of the city item found for the reference
// points. Overrides use a related item's reviewed P18 when no city item is found (the label is a
// region or an airport name) or its photo is unsuitable. Each must lie near the city's airport.
// isCity: the item is the place the city card means, so its labels name the city (else only the
// photo is borrowed and the city labels come from the city item alone).
const CITY_IMAGE_FROM = {
  yamagata: { qid: 'Q205526', file: 'Zao winter gradation (51843960455).jpg', isCity: true }, // Yamagata city (kowiki "야마가타" is ambiguous)
  ibaraki: { qid: 'Q204249', file: 'Kairaku-en, Ibaraki 24.jpg' }, // Mito
  nanki_shirahama: { qid: 'Q1202728', file: 'Shirahama montages.JPG', isCity: true }, // Shirahama town
  rishiri: { qid: 'Q495476', file: 'Rishiri Airport 17-Sept-2018 p2.jpg', isCity: true }, // Rishiri Island (aerial view)
  shimojishima: { qid: 'Q705012', file: 'Irabujima sky view.jpg', isCity: true }, // Shimoji Island (aerial, with Irabu)
  shonai: { qid: 'Q734416', file: 'Moat of Tsurugaoka Castle.jpg' }, // Tsuruoka
  tajima: { qid: 'Q696388', file: 'Izushi Toyooka03nt3200.jpg' }, // Toyooka
  memanbetsu: { qid: 'Q1208839', file: 'Marchen-no-oka01bs10.jpg' }, // Ōzora, the airport's town (Memanbetsu item has no photo)
  kita_daito: { qid: 'Q1111504', file: 'Kita Daito Jima ISS.jpg', isCity: true }, // the island; the village item's photo is the airport terminal
  okinawa: { qid: 'Q181966', file: 'Asahi-machi Naha Okinawa01s3s4410.jpg' } // Naha; the prefecture photo is Yubu Island, 400 km away
};
const EXCLUDE_CITY_IMAGES = {
  akita: 'photo shows the city hall',
  odate: 'photo shows the city hall',
  okayama: 'photo shows the city office',
  saga: 'photo shows one hotel'
};

// Display labels ("labels" of place and city entries): corrections of Wikidata labels that are
// wrong as names, by item (found by reading every label; last review 2026-10-01). Everything else
// is the item's own label or Wikipedia title (see displayLabels).
const LABEL_FIXES = {
  Q10942580: { en: 'Oirase Stream', why: 'the en label has a typo ("Oirase Steam")' },
  Q60637648: { en: 'Pia Bandai', why: 'the en label is the Japanese name ("ピアBandai")' }
};
// Photo credit ("artist"): corrections by Commons file name, for an Artist field that holds
// something other than the author (found by reading every credit; last review 2026-10-01).
const ARTIST_FIXES = {
  'Awa-dance memorial hall01s3200.jpg': { artist: '663highland', why: 'Artist holds the place name; Credit says "Own work" by the uploader 663highland' }
};

// Food genre photos ("foodGenres" section): CITY_DATA foods[].genre -> a representative dish item
// and its reviewed P18 file (dropped, not swapped, if Wikidata no longer lists that file).
// Left out on purpose: 향토요리 (too broad, no photo), 쿠시카츠 (the item's photo shows miso katsu),
// 분식 (candidate item's photo is tamagoyaki), 구이 (robatayaki has no photo), 패스트푸드 (the
// hamburger photos show a brand), 샐러드 (no fitting item), 유제품 (the cheese photo is GFDL-only,
// which needs the full license text). 이자카야 uses the sake photo because the izakaya item's photo
// is one named shop front.
const GENRE_ITEMS = {
  '라멘': { qid: 'Q234646', file: 'Ramen, sopa de fideus.jpg' },
  '이자카야': { qid: 'Q170219', file: 'Sake set.jpg' },
  '주점': { qid: 'Q170219', file: 'Sake set.jpg' },
  '해산물': { qid: 'Q1394677', file: 'Kaisendon.jpg' },
  '디저트': { qid: 'Q1063096', file: 'Sakura-mochi 003.jpg' },
  '일식': { qid: 'Q234138', file: 'Breakfast at Tamahan Ryokan, Kyoto.jpg' },
  '면요리': { qid: 'Q17116319', file: 'Fresh ramen noodle 001.jpg' },
  '육류': { qid: 'Q42085', file: '4 Kobe Beef, Kobe Japan.jpg' },
  '소바': { qid: 'Q7967970', file: 'Wanko soba.jpg' },
  '우동': { qid: 'Q471861', file: 'Udon by udono.jpg' },
  '돈카츠': { qid: 'Q1142841', file: 'Tonkatsu of Kimukatsu.jpg' },
  '스시': { qid: 'Q46383', file: 'Various sushi, beautiful October night at midnight.jpg' },
  '카레': { qid: 'Q701870', file: 'Beef curry rice 003.jpg' },
  '오코노미야키': { qid: 'Q701075', file: 'Okonomiyaki 001.jpg' },
  '타코야키': { qid: 'Q905527', file: 'Takoyaki by yomi955.jpg' },
  '가이세키': { qid: 'Q175595', file: 'Jisaku Kaiseki Ryori 01.jpg' },
  '양고기': { qid: 'Q1151092', file: 'Jingisukan japanese mutton barbecue.jpg' },
  '규탄': { qid: 'Q4892972', file: 'Gyutan teishoku.JPG' },
  '장어덮밥': { qid: 'Q1352897', file: 'Tokyo Chikuyotei Unadon01s2100.jpg' },
  '전골': { qid: 'Q1962004', file: 'Mizore nabe of Matsudo.jpeg' },
  '덮밥': { qid: 'Q1061842', file: 'Tendon and unadon by avlxyz.jpg' },
  '닭요리': { qid: 'Q483163', file: 'Cooking yakitori.jpg' },
  '두부요리': { qid: 'Q177378', file: 'Japanese SilkyTofu (Kinugoshi Tofu).JPG' }
};

// Wikidata classes that are never a sight: people, administrative units, wiki-internal pages.
const REJECT_CLASS_IDS = new Set([
  'Q5', 'Q4167410', 'Q13406463', 'Q4167836', 'Q11266439', 'Q17442446',
  'Q515', 'Q494721', 'Q1059478', 'Q4174776', 'Q50337', 'Q1122846', 'Q5327704'
]);
const REJECT_CLASS_LABELS = new Set([
  'human', 'fictional human', 'wikimedia disambiguation page', 'wikimedia list article',
  'wikimedia category', 'wikimedia template', 'family name', 'given name', 'male given name',
  'female given name', 'unisex given name', 'surname', 'city', 'big city', 'million city',
  'town', 'village', 'municipality', 'metropolis', 'capital city', 'city of japan', 'town of japan',
  'village of japan', 'prefecture of japan', 'prefecture', 'designated city of japan',
  'city designated by government ordinance', 'core city of japan', 'special city of japan',
  'special ward of tokyo', 'special ward', 'ward of japan', 'ward of a designated city',
  'district of japan', 'municipality of japan', 'prefectural capital of japan',
  'administrative territorial entity', 'first-level administrative division',
  'second-level administrative division', 'country', 'sovereign state'
]);

// When one name only contains the other, the leftover may consist solely of the city name and
// place words. Anything else means a different subject ("가마쿠라" is not "가마쿠라 막부",
// "아와오도리 회관" is not the "아와오도리" festival).
// - ASPECT words may be dropped either way ("센다이성 유적" ~ "센다이성", "사라쿠라산 야경" ~ "사라쿠라산").
// - TYPE words only when the Wikidata label is the longer one ("후시미 이나리" ~ "후시미 이나리 신사");
//   a shorter label is then a broader thing ("아오시마 신사" is not "아오시마" island,
//   "기노사키 온천" is not the town "기노사키").
const ASPECT_WORDS = ['유적', '성터', '야경', '석양', '전망대', '전망', '산책로', '트레일', '자연길', '공원', '거리'];
const TYPE_WORDS = ['신사', '신궁', '대사', '타이샤', '성적', '성', '온천향', '온천', '시장', '해수욕장', '해변', '해안',
  '비치', '섬', '정원', '호수', '폭포', '곶', '반도', '동굴', '협곡', '계곡', '습원', '사구', '운하', '산', '절', '사', '지', '국영'];
// Image files that are maps, logos or symbols rather than a photo of the place.
const NON_PHOTO_FILE = /(^|[\s_\-(.,])(map|maps|karte|carte|mapa|logo|locator|location|flag|emblem|seal|symbol|diagram|coat of arms|srtm|relief|topographic|topography)([\s_\-).,]|$)|地図|位置図|紋章|ロゴ|地形図/i;

// Korean transliteration of Japanese is inconsistent (츠/쓰, 카/가, 타/다 …); these suffix
// spellings are equivalent for matching purposes.
const KO_SYNONYMS = [
  ['타이샤', '대사'], ['진자', '신사'], ['도쇼궁', '도쇼구'], ['진구', '신궁'], ['코엔', '공원'],
  ['이치바', '시장'], ['데라', '사'], ['텐만궁', '텐만구'], ['캐슬', '성'], ['해빈', '해변']
];
// Descriptive tails that can be dropped to reach the underlying sight ("센다이성 유적" -> "센다이성").
// Used only as a late fallback tier; hits still need a label match (and coordinates when partial).
const KO_STEM_SUFFIXES = ['유적', '공원', '거리', '야경', '전망대', '전망', '석양', '산책로', '트레일', '자연길', '해변', '해안'];
const KO_SUFFIXES = ['공원', '성', '신사', '신궁', '온천', '시장', '해변', '해안', '박물관', '미술관',
  '수족관', '동물원', '대교', '곶', '섬', '호수', '폭포', '동굴', '전망대', '거리', '유적', '산', '정원', '반도'];

function parseArgs(argv) {
  const opts = {
    out: path.join(ROOT, 'assets', 'place-images.json'),
    server: path.join(ROOT, 'server.js'),
    cache: path.join(os.tmpdir(), 'tabimaru-place-images-cache'),
    refresh: false,
    only: null,
    includeMust: true,
    checkImages: true,
    report: '',
    spotCheck: 0,
    reviewBaths: false,
    spotDir: path.join(os.tmpdir(), 'tabimaru-spot-check'),
    dryRun: false,
    verbose: false
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
      case '--cache': opts.cache = path.resolve(value()); break;
      case '--refresh': opts.refresh = true; break;
      case '--only': opts.only = new Set(value().split(',').map((s) => s.trim()).filter(Boolean)); break;
      case '--no-must': opts.includeMust = false; break;
      case '--no-check-images': opts.checkImages = false; break;
      case '--report': opts.report = path.resolve(value()); break;
      case '--spot-check': opts.spotCheck = Math.max(0, Number(value()) || 0); break;
      case '--review-baths': opts.reviewBaths = true; break;
      case '--spot-dir': opts.spotDir = path.resolve(value()); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--verbose': opts.verbose = true; break;
      case '--help': case '-h':
      {
        const lines = fs.readFileSync(__filename, 'utf8').split('\n');
        const from = lines.findIndex((l) => l.startsWith(' * Usage:'));
        const to = lines.findIndex((l, idx) => idx > from && l.startsWith(' */'));
        console.log(lines.slice(from, to).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
      }
        process.exit(0);
        break;
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Reading CITY_DATA from server.js without running it
// ---------------------------------------------------------------------------

function skipString(src, i) {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j += 1) {
    const ch = src[j];
    if (ch === '\\') { j += 1; continue; }
    if (quote === '`' && ch === '$' && src[j + 1] === '{') {
      const end = findMatchingBracket(src, j + 1);
      if (end < 0) return -1;
      j = end;
      continue;
    }
    if (ch === quote) return j;
  }
  return -1;
}

function findMatchingBracket(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return -1; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(src, i); if (i < 0) return -1; continue; }
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractDeclaration(src, name) {
  const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`).exec(src);
  if (!m) return null;
  const open = m.index + m[0].length;
  if (src[open] !== '{' && src[open] !== '[') return null;
  const close = findMatchingBracket(src, open);
  if (close < 0) return null;
  return src.slice(open, close + 1);
}

function extractFunction(src, name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
  if (!m) return null;
  const bodyOpen = src.indexOf('{', findMatchingBracket(src, m.index + m[0].length - 1));
  const close = findMatchingBracket(src, bodyOpen);
  return close < 0 ? null : src.slice(m.index, close + 1);
}

function runInSandbox(code) {
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  const value = vm.runInNewContext(code, sandbox, { timeout: 5000 });
  return JSON.parse(JSON.stringify(value)); // detach from the sandbox realm
}

function loadServerData(src) {
  let cityData = null;
  // Preferred: evaluate the block that builds CITY_DATA exactly as the server does
  // (literal + generic city profiles + augmentation), up to the next top-level declaration.
  const start = src.indexOf('const CITY_DATA = {');
  const end = start >= 0 ? src.indexOf('const CITY_ALIASES', start) : -1;
  if (start >= 0 && end > start) {
    try {
      cityData = runInSandbox(`${src.slice(start, end)}\n;CITY_DATA;`);
    } catch (err) {
      console.warn(`[place-images] CITY_DATA block did not evaluate on its own (${err.message}); using literal extraction`);
    }
  }
  if (!cityData) {
    const base = extractDeclaration(src, 'CITY_DATA');
    const profiles = extractDeclaration(src, 'JAPAN_CITY_PROFILES');
    const extra = extractDeclaration(src, 'JAPAN_CITY_PROFILES_EXTRA');
    const builder = extractFunction(src, 'buildGenericCity');
    if (!base) throw new Error('CITY_DATA not found in server source');
    cityData = runInSandbox([
      `const CITY_DATA = ${base};`,
      `const JAPAN_CITY_PROFILES = ${profiles || '{}'};`,
      `Object.assign(JAPAN_CITY_PROFILES, ${extra || '{}'});`,
      builder || '',
      builder ? 'for (const [k, p] of Object.entries(JAPAN_CITY_PROFILES)) CITY_DATA[k] = buildGenericCity(p);' : '',
      'CITY_DATA;'
    ].join('\n'));
  }
  const read = (name) => {
    const literal = extractDeclaration(src, name);
    if (!literal) return [];
    try { return runInSandbox(`(${literal})`); } catch { return []; }
  };
  return { cityData, mustAttractions: read('MUST_ATTRACTIONS'), airportCoords: read('JAPAN_AIRPORT_COORDS') };
}

function buildPlaceList(cityData, mustAttractions, opts) {
  const places = [];
  const seen = new Set();
  const add = (cityKey, name, kind) => {
    const city = cityData[cityKey];
    const cleanName = String(name || '').trim();
    if (!city || !cleanName) return;
    if (opts.only && !opts.only.has(cityKey)) return;
    const key = `${cityKey}|${cleanName}`;
    if (seen.has(key)) return;
    seen.add(key);
    places.push({
      key,
      cityKey,
      name: cleanName,
      cityLabel: String(city.label || ''),
      kind,
      radiusKm: kind === 'must' ? MUST_RADIUS_KM : HIGHLIGHT_RADIUS_KM
    });
  };
  for (const [cityKey, city] of Object.entries(cityData)) {
    for (const h of city.highlights || []) add(cityKey, h.name, 'highlight');
  }
  if (opts.includeMust) {
    for (const m of mustAttractions || []) add(m.cityKey, m.name, 'must');
  }
  return places;
}

// ---------------------------------------------------------------------------
// Polite HTTP client with on-disk cache
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shortUrl(url) {
  const u = new URL(url);
  return `${u.hostname}${u.pathname}`;
}

class Client {
  // minIntervalMs / uploadIntervalMs: gap between requests (scripts/build-city-places.js asks for
  // at most one request per second); logTag: prefix of the retry warnings.
  constructor({ cacheDir, refresh, minIntervalMs = MIN_INTERVAL_MS, uploadIntervalMs = UPLOAD_INTERVAL_MS, logTag = 'place-images' }) {
    this.cacheDir = cacheDir;
    this.refresh = refresh;
    this.minIntervalMs = minIntervalMs;
    this.uploadIntervalMs = uploadIntervalMs;
    this.logTag = logTag;
    this.lastAt = 0;
    this.chain = Promise.resolve();
    this.stats = { network: 0, cached: 0, retries: 0 };
    if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
  }

  cachePath(key) {
    return path.join(this.cacheDir, `${crypto.createHash('sha1').update(key).digest('hex')}.json`);
  }

  readCache(key) {
    if (!this.cacheDir || this.refresh) return undefined;
    try {
      const entry = JSON.parse(fs.readFileSync(this.cachePath(key), 'utf8'));
      if (entry.key !== key || Date.now() - Date.parse(entry.fetchedAt) > CACHE_TTL_MS) return undefined;
      return entry.value;
    } catch {
      return undefined;
    }
  }

  writeCache(key, value) {
    if (!this.cacheDir) return;
    try {
      fs.writeFileSync(this.cachePath(key), JSON.stringify({ key, fetchedAt: new Date().toISOString(), value }));
    } catch {
      // the cache is best effort
    }
  }

  throttle(url) {
    // upload.wikimedia.org rate-limits thumbnail traffic harder than the APIs (HTTP 429)
    const interval = new URL(url).hostname === 'upload.wikimedia.org' ? this.uploadIntervalMs : this.minIntervalMs;
    const turn = this.chain.then(async () => {
      const wait = this.lastAt + interval - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastAt = Date.now();
    });
    this.chain = turn.catch(() => {});
    return turn;
  }

  async request(url, method = 'GET') {
    for (let attempt = 0; ; attempt += 1) {
      await this.throttle(url);
      this.stats.network += 1;
      let res = null;
      let error = null;
      try {
        res = await fetch(url, {
          method,
          headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(30000)
        });
      } catch (err) {
        error = err;
      }
      const retryable = error || res.status === 429 || res.status >= 500;
      if (!retryable) return res;
      if (attempt >= MAX_RETRIES) {
        if (error) throw error;
        return res;
      }
      const retryAfter = res ? Number(res.headers.get('retry-after')) : NaN;
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 60000)
        : Math.min(1000 * 2 ** attempt, 30000) + Math.floor(Math.random() * 300);
      this.stats.retries += 1;
      console.warn(`[${this.logTag}] ${error ? error.message : `HTTP ${res.status}`} from ${shortUrl(url)}; retry in ${delay}ms`);
      await sleep(delay);
    }
  }

  async json(url) {
    const cacheKey = `GET ${url}`;
    const cached = this.readCache(cacheKey);
    if (cached !== undefined) {
      this.stats.cached += 1;
      return cached;
    }
    let target = url;
    for (let attempt = 0; ; attempt += 1) {
      const res = await this.request(target);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${shortUrl(url)}`);
      const data = await res.json();
      if (data && data.error) {
        const code = String(data.error.code || '');
        if ((code === 'maxlag' || code === 'ratelimited' || code.startsWith('internal_api_error')) && attempt < MAX_RETRIES) {
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : Math.min(5000 * (attempt + 1), 30000));
          // Wikidata's maxlag also counts query-service lag, which can stay high for a long time;
          // after a few polite waits a plain read (no maxlag) is sent, as reads do not add load.
          if (code === 'maxlag' && attempt >= 2) {
            const u = new URL(url);
            u.searchParams.delete('maxlag');
            target = u.toString();
          }
          continue;
        }
        throw new Error(`API error ${code} from ${shortUrl(url)}: ${data.error.info || ''}`);
      }
      this.writeCache(cacheKey, data);
      return data;
    }
  }

  async probeImage(url) {
    const cacheKey = `HEAD ${url}`;
    const cached = this.readCache(cacheKey);
    if (cached !== undefined) {
      this.stats.cached += 1;
      return cached;
    }
    let result;
    try {
      const res = await this.request(url, 'HEAD');
      result = { status: res.status, type: res.headers.get('content-type') || '' };
    } catch (err) {
      return { status: 0, type: '', error: err.message };
    }
    if (result.status === 200 || result.status === 404 || result.status === 400) this.writeCache(cacheKey, result);
    return result;
  }
}

function apiUrl(host, params) {
  const u = new URL(`https://${host}/w/api.php`);
  const all = { format: 'json', formatversion: '2', maxlag: '5', ...params };
  for (const key of Object.keys(all).sort()) u.searchParams.set(key, all[key]);
  return u.toString();
}

function chunked(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Wikipedia / Wikidata / Commons queries
// ---------------------------------------------------------------------------

async function lookupTitles(client, host, titles) {
  const out = new Map();
  const unique = [...new Set(titles.filter((t) => t && !t.includes('|')))];
  for (const chunk of chunked(unique, 40)) {
    const data = await client.json(apiUrl(host, {
      action: 'query', prop: 'pageprops', ppprop: 'wikibase_item|disambiguation', redirects: '1', titles: chunk.join('|')
    }));
    const q = data.query || {};
    const normalized = new Map((q.normalized || []).map((n) => [n.from, n.to]));
    const redirects = new Map((q.redirects || []).map((r) => [r.from, r]));
    const pages = new Map((q.pages || []).map((p) => [p.title, p]));
    for (const requested of chunk) {
      let title = normalized.get(requested) || requested;
      const redirect = redirects.get(title);
      if (redirect) title = redirect.to;
      const page = pages.get(title);
      if (!page || page.missing || page.invalid) continue;
      const props = page.pageprops || {};
      out.set(requested, {
        title,
        qid: props.wikibase_item || '',
        disambiguation: props.disambiguation !== undefined,
        redirected: Boolean(redirect),
        fragment: redirect ? String(redirect.tofragment || '') : ''
      });
    }
  }
  return out;
}

async function searchWiki(client, host, query, limit = 5) {
  const data = await client.json(apiUrl(host, {
    action: 'query', generator: 'search', gsrsearch: query, gsrlimit: String(limit), gsrnamespace: '0',
    prop: 'pageprops', ppprop: 'wikibase_item|disambiguation'
  }));
  const pages = (data.query && data.query.pages) || [];
  return pages
    .filter((p) => p.pageprops && p.pageprops.wikibase_item && p.pageprops.disambiguation === undefined)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => ({ title: p.title, qid: p.pageprops.wikibase_item }));
}

async function searchWikidata(client, query, limit = 5) {
  const data = await client.json(apiUrl('www.wikidata.org', {
    action: 'query', list: 'search', srsearch: query, srlimit: String(limit), srnamespace: '0'
  }));
  return ((data.query && data.query.search) || []).map((s) => s.title).filter((t) => /^Q\d+$/.test(t));
}

function claimList(claims, prop, bestOnly) {
  const list = ((claims && claims[prop]) || []).filter((c) => c.rank !== 'deprecated' && c.mainsnak && c.mainsnak.snaktype === 'value');
  if (!bestOnly) return list;
  const preferred = list.filter((c) => c.rank === 'preferred');
  return preferred.length ? preferred : list;
}

function simplifyEntity(e) {
  const label = (lang) => (e.labels && e.labels[lang] && e.labels[lang].value) || '';
  const aliases = (lang) => ((e.aliases && e.aliases[lang]) || []).map((a) => a.value);
  const values = (prop, bestOnly) => claimList(e.claims, prop, bestOnly).map((c) => c.mainsnak.datavalue && c.mainsnak.datavalue.value);
  const coord = values('P625', true).find((v) => v && Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
    && (!v.globe || /\/Q2$/.test(v.globe)));
  const sitelink = (site) => (e.sitelinks && e.sitelinks[site] && e.sitelinks[site].title) || '';
  return {
    id: e.id,
    labels: { ko: label('ko'), ja: label('ja'), en: label('en') },
    aliases: { ko: aliases('ko'), ja: aliases('ja'), en: aliases('en') },
    sitelinks: { ko: sitelink('kowiki'), ja: sitelink('jawiki'), en: sitelink('enwiki') },
    classes: values('P31', false).map((v) => v && v.id).filter(Boolean),
    countries: values('P17', false).map((v) => v && v.id).filter(Boolean),
    iata: values('P238', false).filter((v) => typeof v === 'string'),
    coord: coord ? { lat: coord.latitude, lng: coord.longitude } : null,
    image: values('P18', true).find((v) => typeof v === 'string' && v) || '',
    images: values('P18', false).filter((v) => typeof v === 'string' && v),
    // located in (P131), part of (P361) and "dissolved, abolished or demolished" (P576): used by
    // scripts/build-city-places.js
    admin: values('P131', true).map((v) => v && v.id).filter(Boolean),
    partOf: values('P361', false).map((v) => v && v.id).filter(Boolean),
    // located on terrain feature (P706) and location (P276): a lighthouse on an island, a museum in a park
    within: [...values('P706', false), ...values('P276', false)].map((v) => v && v.id).filter(Boolean),
    dissolved: claimList(e.claims, 'P576', false).length > 0,
    // official closing date (P3999): a museum that closed (Toyama Prefectural Museum of Modern Art, 2016)
    closed: claimList(e.claims, 'P3999', false).length > 0,
    // name in kana (P1814): the reading of the Japanese name
    kana: values('P1814', false).filter((v) => typeof v === 'string' && v),
    // elevation above sea level (P2044) in metres, or null
    elevation: (() => {
      const q = values('P2044', true).find((v) => v && v.amount !== undefined && /\/Q11573$/.test(String(v.unit || '')));
      return q ? Number(q.amount) : null;
    })()
  };
}

async function getEntities(client, cache, qids, props = 'labels|aliases|claims|sitelinks') {
  const need = [...new Set(qids.filter((q) => /^Q\d+$/.test(q) && !cache.has(q)))];
  for (const chunk of chunked(need, 20)) {
    const data = await client.json(apiUrl('www.wikidata.org', {
      action: 'wbgetentities', ids: chunk.join('|'), props, languages: 'ko|ja|en', sitefilter: 'kowiki|jawiki|enwiki'
    }));
    for (const entity of Object.values(data.entities || {})) {
      if (!entity || entity.missing !== undefined || !entity.id) continue;
      const simple = simplifyEntity(entity);
      cache.set(entity.id, simple);
      if (entity.redirects && entity.redirects.from) cache.set(entity.redirects.from, simple);
    }
    for (const q of chunk) if (!cache.has(q)) cache.set(q, null);
  }
  return qids.map((q) => cache.get(q) || null);
}

async function getClassLabels(client, cache, classIds) {
  const need = [...new Set(classIds)].filter((q) => /^Q\d+$/.test(q) && !cache.has(q));
  for (const chunk of chunked(need, 40)) {
    const data = await client.json(apiUrl('www.wikidata.org', {
      action: 'wbgetentities', ids: chunk.join('|'), props: 'labels', languages: 'en'
    }));
    for (const q of chunk) {
      const e = data.entities && data.entities[q];
      cache.set(q, String((e && e.labels && e.labels.en && e.labels.en.value) || '').toLowerCase());
    }
  }
}

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return Object.prototype.hasOwnProperty.call(named, code.toLowerCase()) ? named[code.toLowerCase()] : m;
  });
}

function cleanText(html, max) {
  let s = String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s).replace(/\s+/g, ' ').trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

// Commons "Artist" fields are free-form; keep the name, drop boilerplate and links: wiki user
// prefixes ("User:", "ja:利用者:", "(WT-en)"), "at Japanese Wikipedia" style suffixes, signature
// timestamps, and a name repeated in brackets or after "/" ("Ryoma35988 (ja:利用者:Ryoma35988)").
function cleanName(text) {
  let s = String(text || '');
  s = s.replace(/^No machine-readable author provided\.\s*(.+?)\s+assumed \(based on copyright claims\)\.?$/i, '$1');
  s = s.replace(/^The original uploader was\s+(.+?)\s+at\s+[\w\s]*Wikipedia\s*\.?$/i, '$1');
  s = s.replace(/^(?:photo:\s*|by\s+)/i, '').replace(/^Flickr user\s*:\s*/i, '').replace(/\s+Taken with\s.*$/i, '');
  s = s.replace(/~\w+wiki\b/g, '').replace(/\(\s*talk\s*\)/gi, '').replace(/https?:\/\/\S+/g, '');
  s = s.replace(/\s*\d{1,2}:\d{2},\s*\d{1,2}\s+\p{L}+\s+\d{4}\s*\(UTC\)/gu, '');
  s = s.replace(/(^|[\s(（/,])(?:[a-z]{1,3}:)*(?:User|利用者|사용자)\s*:\s*/gi, '$1').replace(/\(WT-[a-z]+\)\s*/gi, '');
  s = s.replace(/\s+at\s+(?:[\w.-]+\s+)*?[\w.-]*wiki(?:pedia|voyage)?\s*$/i, '');
  s = s.replace(/\.\s+"[^"]+"\.?$/, ''); // a quoted title after the name ('… Johnson Space Center. "The Gateway to …"')
  s = s.replace(/\s+/g, ' ').replace(/[\s.:;,]+$/, '').trim();
  return s.replace(/^(.+?)\s*[(（]\s*\1\s*[)）]$/u, '$1').replace(/^(.+?)\s*\/\s*\1$/u, '$1');
}

function withoutHidden(html) {
  // e.g. 'Unknown author<span style="display: none;">Unknown author</span>'
  return String(html || '').replace(/<(span|div)\b[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/gi, '');
}

function cleanArtist(html) {
  const s = cleanName(cleanText(withoutHidden(html), 400));
  return s.length > 100 ? `${s.slice(0, 99).trimEnd()}…` : s;
}

// A montage's Artist field is a list ("File:A.jpg by User:X", …, "Composition by User:Y"): the
// distinct author names (an item naming only a file adds none), or null when it is not a list.
function listAuthors(html) {
  const items = [...String(html || '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  if (!items.length) return null;
  const names = [];
  for (const [, item] of items) {
    const text = cleanText(withoutHidden(item), 400).replace(/\s+upload(?:ed)? by\s.*$/i, '');
    const at = text.search(/\sby\s(?!.*\sby\s)/i); // the last " by ": file names may contain one
    const name = at >= 0 ? cleanName(text.slice(at).replace(/^\s*by\s+/i, '')) : (/^File:/i.test(text) ? '' : cleanName(text));
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

// The name of a user linked in a Credit field ("<a title="User:X">X</a> (talk) 08:13, …"), else ''.
function userLinkName(html) {
  const m = String(html || '').match(/<a\b[^>]*\btitle="(?:[a-z]{1,3}:)*(?:User|利用者):[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
  return m ? cleanName(cleanText(m[1], 100)) : '';
}

// Credit on a card is never empty: the cleaned Artist field; else the Attribution text the license
// asks for; else, when Artist or Credit say "the uploader's own photo", the uploader (the user in
// Credit, or the file's uploader unless a bot); else ARTIST_FALLBACK. A montage of photos by several
// authors also gets ARTIST_FALLBACK (the file page, which the credit links to, lists them all).
const ARTIST_FALLBACK = 'Wikimedia Commons';
const UPLOADER_WORDS = /^(?:投稿者(?:が撮影|本人撮影|自身が撮影|撮影)?|自(?:ら|分で)撮影|own work|self[- ]?made|uploader)$/i;
const UNKNOWN_WORDS = /^(?:unknown(?: author| photographer)?|author unknown|anonymous|不明|作者不明)$/i;
const BOT_NAME = /bot\d*$|\bbot\b/i;
function creditName(meta, uploader, fileName) {
  if (ARTIST_FIXES[fileName]) return ARTIST_FIXES[fileName].artist;
  const field = (k) => String((meta[k] && meta[k].value) || '');
  const named = (s) => (s && !UPLOADER_WORDS.test(s) && !UNKNOWN_WORDS.test(s) ? s : '');
  const list = listAuthors(field('Artist'));
  if (list) return list.length === 1 ? list[0] : ARTIST_FALLBACK;
  const artist = cleanArtist(field('Artist'));
  const found = named(artist) || named(cleanArtist(field('Attribution')));
  if (found) return found;
  if (UPLOADER_WORDS.test(artist) || (!artist && UPLOADER_WORDS.test(cleanText(field('Credit'), 100)))) {
    const user = userLinkName(field('Credit')) || cleanName(uploader);
    if (user && !BOT_NAME.test(user)) return user;
  }
  return ARTIST_FALLBACK;
}

function normalizeImageUrl(raw) {
  try {
    const u = new URL(raw, 'https://upload.wikimedia.org');
    if (u.hostname === 'thumb.wikimedia.org') u.hostname = 'upload.wikimedia.org';
    if (u.hostname !== 'upload.wikimedia.org' || !u.pathname.startsWith('/wikipedia/commons/')) return '';
    u.protocol = 'https:';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

function normalizeFilePage(raw) {
  try {
    const u = new URL(raw, 'https://commons.wikimedia.org');
    if (u.hostname !== 'commons.wikimedia.org' || !u.pathname.startsWith('/wiki/File:')) return '';
    u.protocol = 'https:';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

function parseImageInfo(page, fileName) {
  if (!page || page.missing || page.invalid) return { ok: false, why: 'file-missing' };
  if (page.imagerepository !== 'local') return { ok: false, why: 'not-on-commons' };
  const info = page.imageinfo && page.imageinfo[0];
  if (!info) return { ok: false, why: 'no-imageinfo' };
  const mime = String(info.mime || '');
  if (!mime.startsWith('image/') || mime.includes('svg')) return { ok: false, why: `mime:${mime}` };
  if (NON_PHOTO_FILE.test(fileName)) return { ok: false, why: 'not-a-photo' };
  const meta = info.extmetadata || {};
  const license = cleanText(meta.LicenseShortName && meta.LicenseShortName.value, 60);
  if (!license) return { ok: false, why: 'no-license' };
  const nonFree = String((meta.NonFree && meta.NonFree.value) || '').toLowerCase() === 'true';
  if (nonFree || /fair use|non-?free|all rights reserved/i.test(license)) return { ok: false, why: 'non-free' };
  // GFDL-only files would need the full license text next to the card; dual-licensed files show CC first
  if (/^GFDL/i.test(license)) return { ok: false, why: 'gfdl-only' };
  const image = normalizeImageUrl(info.thumburl || info.url);
  const filePage = normalizeFilePage(info.descriptionurl);
  if (!image || !filePage) return { ok: false, why: 'bad-url' };
  return {
    ok: true,
    image,
    filePage,
    license,
    artist: creditName(meta, info.user, fileName)
  };
}

async function getImageInfos(client, fileNames) {
  const out = new Map();
  const unique = [...new Set(fileNames.filter(Boolean))];
  for (const chunk of chunked(unique, 20)) {
    const titles = chunk.map((f) => `File:${f}`);
    const data = await client.json(apiUrl('commons.wikimedia.org', {
      action: 'query', prop: 'imageinfo', iiprop: 'url|mime|extmetadata|user', iiurlwidth: String(THUMB_WIDTH),
      iiextmetadatafilter: 'LicenseShortName|Artist|Attribution|Credit|NonFree', titles: titles.join('|')
    }));
    const q = data.query || {};
    const normalized = new Map((q.normalized || []).map((n) => [n.from, n.to]));
    const pages = new Map((q.pages || []).map((p) => [p.title, p]));
    chunk.forEach((file, idx) => {
      const title = normalized.get(titles[idx]) || titles[idx];
      out.set(file, parseImageInfo(pages.get(title), file));
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matching and verification
// ---------------------------------------------------------------------------

function normText(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

// Loose Korean form: aspirated/tense onsets folded (카=가, 타=다, 츠=쓰=즈), ㅐ=ㅔ, ㅡ=ㅜ,
// Japanese long vowels dropped (도우 = 도), common suffix spellings unified.
function looseKo(s) {
  let t = normText(s);
  for (const [from, to] of KO_SYNONYMS) t = t.split(from).join(to);
  const onset = { 1: 0, 15: 0, 4: 3, 16: 3, 10: 12, 13: 12, 14: 12, 8: 7 };
  const vowel = { 1: 5, 18: 13, 3: 7 };
  const out = [];
  let prevVowel = -1;
  for (const ch of t) {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) { out.push(ch); prevVowel = -1; continue; }
    let L = Math.floor(code / 588);
    let V = Math.floor((code % 588) / 28);
    const T = code % 28;
    if (L === 11 && T === 0 && ((V === 13 || V === 8) && (prevVowel === 8 || prevVowel === 12))) continue;
    if (L === 11 && T === 0 && V === 20 && prevVowel === 5) continue;
    L = onset[L] !== undefined ? onset[L] : L;
    V = vowel[V] !== undefined ? vowel[V] : V;
    out.push(String.fromCharCode(0xAC00 + L * 588 + V * 28 + T));
    prevVowel = V;
  }
  return out.join('');
}

function containment(a, b, minLen) {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < minLen || !longer.includes(shorter)) return false;
  return shorter.length / longer.length >= 0.5;
}

const byLength = (a, b) => b.length - a.length;
const LOOSE_ASPECT_WORDS = ASPECT_WORDS.map(looseKo).sort(byLength);
const LOOSE_ALL_PLACE_WORDS = [...ASPECT_WORDS, ...TYPE_WORDS].map(looseKo).sort(byLength);

function stripWords(text, words) {
  let rest = text;
  for (const word of words) rest = rest.split(word).join('');
  return rest;
}

// 3 = same text, 2 = same after spelling normalization, 1 = one contains the other with only
// place words / the city name left over (see ASPECT_WORDS), 0 = no match
function koMatchLevel(name, labels, cityLabel) {
  const n = normText(name);
  const nl = looseKo(name);
  const cityParts = [cityLabel, ...String(cityLabel || '').split(/\s+/)].map(looseKo).filter(Boolean).sort(byLength);
  let best = 0;
  for (const raw of labels) {
    const l = normText(raw);
    if (!l) continue;
    if (l === n) return 3;
    const ll = looseKo(raw);
    if (ll === nl) { best = Math.max(best, 2); continue; }
    if (!containment(nl, ll, 3)) continue;
    const labelShorter = ll.length < nl.length;
    const shorter = labelShorter ? ll : nl;
    const longer = labelShorter ? nl : ll;
    if (cityParts.includes(shorter)) continue; // only the city name matched
    const leftover = stripWords(longer.replace(shorter, ''), cityParts);
    if (stripWords(leftover, labelShorter ? LOOSE_ASPECT_WORDS : LOOSE_ALL_PLACE_WORDS) === '') best = Math.max(best, 1);
  }
  return best;
}

// Curated Japanese/English hints must match a label, alias or title exactly. A hint with a
// qualifier ("五色沼 (北塩原村)") names one specific place, so the qualifier must match too
// (only the Wikipedia title carries it); a hint without one may match qualifier-free labels.
const QUALIFIER = /\s*[（(][^()（）]*[)）]\s*$/;
function hintMatchLevel(hints, labels) {
  const plain = new Set();
  const qualified = new Set();
  for (const h of hints) (QUALIFIER.test(h) ? qualified : plain).add(normText(h));
  for (const raw of labels) {
    if (!raw) continue;
    if (qualified.has(normText(raw))) return 3;
    if (plain.has(normText(raw.replace(QUALIFIER, '')))) return 3;
  }
  return 0;
}

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function inJapan(c) {
  return c.lat >= JAPAN_BBOX.minLat && c.lat <= JAPAN_BBOX.maxLat && c.lng >= JAPAN_BBOX.minLng && c.lng <= JAPAN_BBOX.maxLng;
}

function checkLocation(entity, place, refs) {
  if (entity.countries.length && !entity.countries.includes('Q17')) return { ok: false, why: 'country' };
  if (entity.coord) {
    if (!inJapan(entity.coord)) return { ok: false, why: 'outside-japan' };
    const points = refs.get(place.cityKey) || [];
    if (!points.length) return { ok: false, why: 'no-city-reference' };
    const dist = Math.min(...points.map((p) => haversineKm(p, entity.coord)));
    if (dist > place.radiusKm) return { ok: false, why: `far:${Math.round(dist)}km` };
    return { ok: true, dist };
  }
  if (entity.countries.includes('Q17')) return { ok: true, dist: null, noCoord: true };
  return { ok: false, why: 'unknown-location' };
}

function koVariants(name) {
  const base = String(name).trim();
  const out = new Set([base, base.replace(/\s+/g, '')]);
  const compact = base.replace(/\s+/g, '');
  for (const suffix of KO_SUFFIXES) {
    if (compact.endsWith(suffix) && compact.length > suffix.length + 1) {
      out.add(`${compact.slice(0, -suffix.length)} ${suffix}`);
    }
  }
  const swaps = [['츠', '쓰'], ['쓰', '츠'], ['쵸', '초'], ['쥬', '주'], ['죠', '조'], ['캐', '개']];
  const initial = { 카: '가', 키: '기', 쿠: '구', 케: '게', 코: '고', 타: '다', 테: '데', 토: '도', 치: '지', 가: '카', 기: '키', 구: '쿠', 고: '코', 다: '타', 도: '토' };
  for (const v of [...out]) {
    for (const [a, b] of swaps) if (v.includes(a)) out.add(v.split(a).join(b));
  }
  for (const v of [...out]) {
    const first = v[0];
    if (initial[first]) out.add(initial[first] + v.slice(1));
  }
  for (const [from, to] of KO_SYNONYMS) {
    for (const v of [...out]) if (v.includes(from)) out.add(v.split(from).join(to));
  }
  return [...out].slice(0, 16);
}

function koStems(name) {
  const compact = String(name).replace(/\s+/g, '');
  const out = new Set();
  for (const suffix of KO_STEM_SUFFIXES) {
    if (compact.endsWith(suffix) && compact.length - suffix.length >= 2) {
      const stem = compact.slice(0, -suffix.length);
      out.add(stem);
      for (const v of koVariants(stem)) out.add(v);
    }
  }
  return [...out].slice(0, 12);
}

// Labels and titles with and without a trailing disambiguator: "평화공원 (나가사키 시)" -> "평화공원"
function withoutQualifiers(list) {
  const out = [];
  for (const s of list) {
    if (!s) continue;
    out.push(s);
    const base = s.replace(/\s*[（(][^()（）]*[)）]\s*$/, '');
    if (base && base !== s) out.push(base);
  }
  return out;
}

function hintsFor(place) {
  const h = NAME_HINTS[place.key] || NAME_HINTS[place.name] || {};
  return { ja: [].concat(h.ja || []), en: [].concat(h.en || []) };
}

function verifyCandidate(place, cand, entity, refs, classLabels) {
  if (!entity) return { ok: false, why: 'no-entity' };
  if ((EXCLUDE_QIDS[place.key] || []).includes(entity.id)) return { ok: false, why: 'excluded' };
  const badClass = entity.classes.find((c) => REJECT_CLASS_IDS.has(c) || REJECT_CLASS_LABELS.has(classLabels.get(c) || ''));
  if (badClass) return { ok: false, why: `class:${classLabels.get(badClass) || badClass}` };
  const loc = checkLocation(entity, place, refs);
  if (!loc.ok) return { ok: false, why: loc.why };
  const hints = hintsFor(place);
  const names = (lang) => withoutQualifiers([entity.labels[lang], ...entity.aliases[lang], entity.sitelinks[lang]]);
  const koLevel = koMatchLevel(place.name, names('ko'), place.cityLabel);
  const jaLevel = hints.ja.length ? hintMatchLevel(hints.ja, names('ja')) : 0;
  const enLevel = hints.en.length ? hintMatchLevel(hints.en, names('en')) : 0;
  const level = Math.max(koLevel, jaLevel, enLevel);
  const titleHit = cand.via.endsWith('-title');
  if (titleHit) {
    if (cand.redirected && loc.noCoord && level < 2) return { ok: false, why: 'redirect-without-coordinates' };
  } else if (cand.via === 'wikidata-search') {
    if (level < 2) return { ok: false, why: `label-mismatch(${level})` };
  } else {
    if (level < 1) return { ok: false, why: 'label-mismatch' };
    if (level === 1 && loc.noCoord) return { ok: false, why: 'partial-label-without-coordinates' };
  }
  return { ok: true, level, dist: loc.dist, noCoord: Boolean(loc.noCoord) };
}

// ---------------------------------------------------------------------------
// Reference points (airport + city centre) for the "near that city" check
// ---------------------------------------------------------------------------

async function buildReferencePoints(client, entityCache, cityData, airportCoords, places) {
  const cityKeys = [...new Set(places.map((p) => p.cityKey))];
  const airports = new Map();
  for (const a of airportCoords || []) {
    if (a && a.code && Number.isFinite(a.lat) && Number.isFinite(a.lng)) airports.set(String(a.code).toUpperCase(), { lat: a.lat, lng: a.lng });
  }
  const missing = [...new Set(cityKeys.map((k) => String(cityData[k].airport || '').toUpperCase()))]
    .filter((code) => /^[A-Z]{3}$/.test(code) && !airports.has(code));
  for (const chunk of chunked(missing, 8)) {
    const qids = await searchWikidata(client, `haswbstatement:${chunk.map((c) => `P238=${c}`).join('|')}`, 30);
    const entities = await getEntities(client, entityCache, qids);
    for (const e of entities) {
      if (!e || !e.coord || !inJapan(e.coord)) continue;
      for (const code of e.iata) if (chunk.includes(code) && !airports.has(code)) airports.set(code, e.coord);
    }
  }

  const titleSets = new Map();
  for (const key of cityKeys) {
    const label = String(cityData[key].label || '').trim();
    const first = label.split(/\s+/)[0];
    titleSets.set(key, [...new Set([label, `${label}시`, first, `${first}시`])]);
  }
  const titles = await lookupTitles(client, 'ko.wikipedia.org', [...titleSets.values()].flat());
  const cityQids = new Map();
  for (const [key, list] of titleSets) {
    cityQids.set(key, list.map((t) => titles.get(t)).filter((r) => r && r.qid && !r.disambiguation).map((r) => r.qid));
  }
  await getEntities(client, entityCache, [...cityQids.values()].flat());

  const refs = new Map();
  const cityInfo = new Map();
  const cityEntities = new Map();
  for (const key of cityKeys) {
    const points = [];
    const airport = airports.get(String(cityData[key].airport || '').toUpperCase());
    if (airport) points.push(airport);
    let cityEntity = null;
    for (const qid of cityQids.get(key) || []) {
      const e = entityCache.get(qid);
      if (!e || !e.coord || !inJapan(e.coord)) continue;
      if (airport && haversineKm(airport, e.coord) > CITY_REF_MAX_FROM_AIRPORT_KM) continue;
      cityEntity = e;
      break;
    }
    if (cityEntity) points.push(cityEntity.coord);
    refs.set(key, points);
    cityEntities.set(key, cityEntity);
    cityInfo.set(key, { ja: String(cityData[key].nameJa || (cityEntity && cityEntity.labels.ja) || ''), en: (cityEntity && cityEntity.labels.en) || '' });
  }
  return { refs, cityInfo, cityEntities };
}

// ---------------------------------------------------------------------------
// Resolution pipeline
// ---------------------------------------------------------------------------

async function resolvePlaces(client, entityCache, places, refs, cityInfo, opts) {
  const classLabels = new Map();
  const koTitles = await lookupTitles(client, 'ko.wikipedia.org', places.flatMap((p) => [...koVariants(p.name), ...koStems(p.name)]));
  const jaTitles = await lookupTitles(client, 'ja.wikipedia.org', places.flatMap((p) => hintsFor(p).ja));
  const enTitles = await lookupTitles(client, 'en.wikipedia.org', places.flatMap((p) => hintsFor(p).en));

  const titleCandidates = (map, list, via) => list
    .map((t, rank) => ({ hit: map.get(t), rank }))
    .filter(({ hit }) => hit && hit.qid && !hit.disambiguation && !hit.fragment)
    .map(({ hit, rank }) => ({ qid: hit.qid, via, rank, title: hit.title, redirected: hit.redirected }));
  const searchCandidates = async (host, queries, via) => {
    const out = [];
    for (const q of queries) {
      const hits = await searchWiki(client, host, q, 5);
      hits.forEach((h, rank) => out.push({ qid: h.qid, via, rank, title: h.title, redirected: false }));
    }
    return out;
  };

  const results = [];
  let done = 0;
  for (const place of places) {
    done += 1;
    if (EXCLUDE_PLACES[place.key]) {
      results.push({ place, chosen: null, rejected: [`excluded: ${EXCLUDE_PLACES[place.key]}`] });
      continue;
    }
    const hints = hintsFor(place);
    const city = cityInfo.get(place.cityKey) || { ja: '', en: '' };
    const tiers = [
      async () => titleCandidates(koTitles, koVariants(place.name), 'ko-title'),
      async () => searchCandidates('ko.wikipedia.org', [place.name, `${place.name} ${place.cityLabel}`], 'ko-search'),
      async () => titleCandidates(jaTitles, hints.ja, 'ja-title'),
      async () => (hints.ja.length ? searchCandidates('ja.wikipedia.org', hints.ja.map((h) => `${h} ${city.ja}`.trim()), 'ja-search') : []),
      async () => titleCandidates(enTitles, hints.en, 'en-title'),
      async () => (hints.en.length ? searchCandidates('en.wikipedia.org', hints.en.map((h) => `${h} ${city.en || 'Japan'}`), 'en-search') : []),
      // late fallback: the sight without its descriptive tail; still needs a label match + coordinates
      async () => titleCandidates(koTitles, koStems(place.name), 'ko-stem'),
      async () => (await searchWikidata(client, `${place.name} haswbstatement:P17=Q17`, 5)).map((qid, rank) => ({ qid, via: 'wikidata-search', rank, title: '', redirected: false }))
    ];
    const accepted = [];
    const rejected = [];
    const tried = new Set();
    for (const tier of tiers) {
      const cands = (await tier()).filter((c) => !tried.has(c.qid));
      cands.forEach((c) => tried.add(c.qid));
      if (!cands.length) continue;
      const entities = await getEntities(client, entityCache, cands.map((c) => c.qid));
      await getClassLabels(client, classLabels, entities.flatMap((e) => (e ? e.classes : [])));
      const tierAccepted = [];
      cands.forEach((cand, idx) => {
        const verdict = verifyCandidate(place, cand, entities[idx], refs, classLabels);
        if (verdict.ok) tierAccepted.push({ cand, entity: entities[idx], verdict });
        else rejected.push(`${cand.via}:${cand.qid}(${(entities[idx] && (entities[idx].labels.ko || entities[idx].labels.ja || entities[idx].labels.en)) || '?'}):${verdict.why}`);
      });
      tierAccepted.sort((a, b) => (b.verdict.level - a.verdict.level) || (a.cand.rank - b.cand.rank));
      accepted.push(...tierAccepted);
      if (accepted.some((a) => a.entity.image)) break;
    }
    // Best verified match; when it has no photo, a later verified match with a photo may stand in
    // only if it is an exact title or a full-label match (never a partial one).
    let chosen = accepted[0] || null;
    if (chosen && !chosen.entity.image) {
      const alt = accepted.find((a) => a.entity.image && (a.verdict.level >= 2 || a.cand.via.endsWith('-title')));
      if (alt) chosen = alt;
    }
    results.push({ place, chosen, rejected });
    if (opts.verbose) {
      console.log(`[place-images] ${place.key} -> ${chosen ? `${chosen.entity.id} ${chosen.entity.labels.ko || chosen.entity.labels.ja} (${chosen.cand.via})` : 'none'}`);
      for (const r of rejected) console.log(`    rejected ${r}`);
    } else if (done % 25 === 0) {
      console.log(`[place-images] resolved ${done}/${places.length}`);
    }
  }
  return results;
}

function round5(n) {
  return Math.round(n * 1e5) / 1e5;
}

function sortedObject(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}

function readExisting(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// The P18 file a card uses: a pinned (reviewed) file must still be one of the item's P18 values.
function pickedFile(entity, pin) {
  if (!entity) return { file: '', why: 'no-entity' };
  if (pin && pin.file) {
    return entity.images.includes(pin.file) ? { file: pin.file } : { file: '', why: `reviewed file is no longer a P18 of ${entity.id}: ${pin.file}` };
  }
  return entity.image ? { file: entity.image } : { file: '', why: 'no-P18' };
}

function placePhotoSource(result, entityCache) {
  const { place, chosen } = result;
  if (!chosen) return { file: '', why: '' };
  if (EXCLUDE_IMAGES[place.key]) return { file: '', why: `excluded: ${EXCLUDE_IMAGES[place.key]}` };
  const from = IMAGE_FROM[place.key];
  if (from) {
    const src = pickedFile(entityCache.get(from.qid), from);
    return src.file ? { file: src.file, from: from.qid } : { file: '', why: `image-from ${from.qid}: ${src.why}` };
  }
  return pickedFile(chosen.entity);
}

function cityPhotoSource(cityKey, cityEntities, entityCache, refs) {
  const own = cityEntities.get(cityKey) || null;
  if (EXCLUDE_CITY_IMAGES[cityKey]) return { entity: own, file: '', why: `excluded: ${EXCLUDE_CITY_IMAGES[cityKey]}` };
  const from = CITY_IMAGE_FROM[cityKey];
  if (!from) return own ? { entity: own, ...pickedFile(own) } : { entity: null, file: '', why: 'no-city-item' };
  const entity = entityCache.get(from.qid) || null;
  const points = refs.get(cityKey) || [];
  if (entity && entity.coord && (!inJapan(entity.coord)
    || (points.length && Math.min(...points.map((p) => haversineKm(p, entity.coord))) > CITY_REF_MAX_FROM_AIRPORT_KM))) {
    return { entity: null, file: '', why: `city-image-from ${from.qid}: not near the city` };
  }
  return { entity, ...pickedFile(entity, from), from: from.qid };
}

// Commons metadata (free license, a photo) plus a HEAD check of the thumbnail, once per file.
async function checkedImages(client, fileNames, checkImages) {
  const infos = await getImageInfos(client, fileNames);
  if (!checkImages) return infos;
  for (const [file, info] of infos) {
    if (!info.ok) continue;
    const probe = await client.probeImage(info.image);
    if (!(probe.status === 200 && probe.type.startsWith('image/'))) infos.set(file, { ok: false, why: `image-check:${probe.status} ${probe.type}` });
  }
  return infos;
}

// Display names for the en/ja screens: a reviewed LABEL_FIXES value, else the item's label, else
// its Wikipedia title without the trailing disambiguator; a language with none is left out.
// An "English" name written in Japanese or Korean script is no use on the en screen (and Korean
// none on the ja screen), so it is skipped; lower-case en labels (Wikidata's style for common
// nouns, e.g. "ban'ei") get a capital first letter.
const CJK_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const HANGUL_SCRIPT = /\p{Script=Hangul}/u;
function displayLabels(entity) {
  const out = {};
  if (!entity) return out;
  const fix = LABEL_FIXES[entity.id] || {};
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const usable = { en: (s) => s && !CJK_SCRIPT.test(s), ja: (s) => s && !HANGUL_SCRIPT.test(s) };
  for (const lang of ['en', 'ja']) {
    const text = [fix[lang], entity.labels[lang], String(entity.sitelinks[lang] || '').replace(QUALIFIER, '')]
      .map(clean).find(usable[lang]);
    if (text) out[lang] = lang === 'en' ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }
  return out;
}

// The item whose labels name a city card: the city item found for the reference points, else a
// CITY_IMAGE_FROM item that is the city itself (isCity), never one that only lends its photo.
function cityLabelEntity(cityKey, cityEntities, entityCache) {
  const own = cityEntities.get(cityKey);
  if (own) return own;
  const from = CITY_IMAGE_FROM[cityKey];
  return from && from.isCity ? entityCache.get(from.qid) || null : null;
}

function mediaEntry(image, coord, qid, withCoords = true, labels = null) {
  const out = {
    image: image ? image.image : null,
    filePage: image ? image.filePage : null,
    license: image ? image.license : null,
    artist: image ? image.artist : ''
  };
  if (withCoords) {
    out.lat = coord ? round5(coord.lat) : null;
    out.lng = coord ? round5(coord.lng) : null;
  }
  out.wikidata = qid;
  if (labels) out.labels = labels;
  return out;
}

function commonsFileName(filePage) {
  try {
    return decodeURIComponent(String(filePage || '').split('/wiki/File:')[1] || '').replace(/_/g, ' ');
  } catch {
    return '';
  }
}

function needsBathReview(name, fileName) {
  return BATH_REVIEW.test(`${name} ${String(fileName || '').replace(/_/g, ' ')}`);
}

// Every image of the output as [label, entry]: places by key, then "city:<key>", "genre:<genre>".
function outputImages(output) {
  return [
    ...Object.entries(output.places),
    ...Object.entries(output.cities).map(([k, v]) => [`city:${k}`, v]),
    ...Object.entries(output.foodGenres).map(([k, v]) => [`genre:${k}`, v])
  ].filter(([, v]) => v.image);
}

async function downloadForReview(client, list, dir, title) {
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n${title} (${list.length} images, saved to ${dir}):`);
  for (const [i, [label, entry]] of list.entries()) {
    const res = await client.request(entry.image);
    const type = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    const file = path.join(dir, `${String(i + 1).padStart(2, '0')}-${entry.wikidata}.${type.includes('png') ? 'png' : 'jpg'}`);
    if (res.ok && type.startsWith('image/')) fs.writeFileSync(file, buf);
    console.log(`${i + 1}\t${label}\t${entry.wikidata}\t${res.status} ${type} ${buf.length}B\t${file}\n\t${entry.image}\n\t${entry.license} · ${entry.artist}`);
  }
}

async function spotCheck(client, output, n, dir) {
  const all = outputImages(output);
  const picked = [];
  while (picked.length < Math.min(n, all.length)) {
    const item = all[Math.floor(Math.random() * all.length)];
    if (!picked.includes(item)) picked.push(item);
  }
  await downloadForReview(client, picked, dir, 'Spot check: random images, check that each shows what its label says');
}

async function reviewBaths(client, output, dir) {
  const list = outputImages(output).filter(([label, v]) => needsBathReview(label, commonsFileName(v.filePage)));
  await downloadForReview(client, list, dir, 'Bath review: hot-spring / bath photos, no bathers may be visible (else IMAGE_FROM or EXCLUDE_IMAGES)');
}

async function main() {
  const opts = parseArgs(process.argv);
  const src = fs.readFileSync(opts.server, 'utf8');
  const { cityData, mustAttractions, airportCoords } = loadServerData(src);
  const places = buildPlaceList(cityData, mustAttractions, opts);
  console.log(`[place-images] ${Object.keys(cityData).length} cities, ${places.length} places (${places.filter((p) => p.kind === 'highlight').length} highlights)`);

  const client = new Client({ cacheDir: opts.cache, refresh: opts.refresh });
  const entityCache = new Map();
  const { refs, cityInfo, cityEntities } = await buildReferencePoints(client, entityCache, cityData, airportCoords, places);
  const noRef = [...refs].filter(([, pts]) => !pts.length).map(([k]) => k);
  if (noRef.length) console.warn(`[place-images] no reference coordinates for: ${noRef.join(', ')} (their places need coordinate-free matches)`);

  const results = await resolvePlaces(client, entityCache, places, refs, cityInfo, opts);
  const genres = [...new Set(Object.entries(cityData)
    .filter(([k]) => !opts.only || opts.only.has(k))
    .flatMap(([, c]) => (c.foods || []).map((f) => String(f.genre || '').trim()))
    .filter(Boolean))].sort();
  // items whose photos are borrowed (IMAGE_FROM, CITY_IMAGE_FROM) and the genre dish items
  await getEntities(client, entityCache, [
    ...Object.values(IMAGE_FROM).map((x) => x.qid),
    ...Object.values(CITY_IMAGE_FROM).map((x) => x.qid),
    ...genres.filter((g) => GENRE_ITEMS[g]).map((g) => GENRE_ITEMS[g].qid)
  ]);
  const placeSources = results.map((r) => placePhotoSource(r, entityCache));
  const citySources = new Map([...cityEntities.keys()].sort().map((k) => [k, cityPhotoSource(k, cityEntities, entityCache, refs)]));
  const genreSources = new Map(genres.map((g) => {
    const item = GENRE_ITEMS[g];
    const entity = item ? entityCache.get(item.qid) || null : null;
    return [g, item ? { entity, ...pickedFile(entity, item) } : { entity: null, file: '', why: 'no GENRE_ITEMS entry' }];
  }));
  const imageInfos = await checkedImages(client,
    [...placeSources, ...citySources.values(), ...genreSources.values()].map((s) => s.file), opts.checkImages);
  const photoOf = (src) => {
    if (!src.file) return { image: null, why: src.why || '' };
    const info = imageInfos.get(src.file);
    return info && info.ok ? { image: info, why: '' } : { image: null, why: info ? info.why : 'no-imageinfo' };
  };
  const row = (cells) => cells.map((v) => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t');
  const reviewNote = (name, file) => (file && needsBathReview(name, file) ? 'bath photo: no bathers may be visible' : '');

  const placesOut = {};
  const reportRows = [];
  results.forEach((r, idx) => {
    const { place, chosen } = r;
    const src = placeSources[idx];
    const { image, why: imageWhy } = chosen ? photoOf(src) : { image: null, why: '' };
    const coord = chosen && chosen.entity.coord;
    const e = chosen && chosen.entity;
    const labels = displayLabels(e);
    if (chosen && (image || coord)) placesOut[place.key] = mediaEntry(image, coord, e.id, true, labels);
    reportRows.push(row([
      place.key, place.kind, e ? (image ? 'image' : (coord ? 'coords-only' : 'no-data')) : 'none',
      e ? e.id : '', e ? chosen.cand.via + (chosen.cand.redirected ? '(redirect)' : '') : '',
      e ? chosen.verdict.level : '', e ? e.labels.ko : '', e ? e.labels.ja : '', e ? e.labels.en : '',
      e && chosen.verdict.dist !== null ? Math.round(chosen.verdict.dist) : '',
      src.file ? src.file + (src.from ? ` (from ${src.from})` : '') : (e ? e.image : ''),
      image ? image.license : imageWhy, r.rejected.slice(0, 6).join(' ; '), image ? reviewNote(place.name, src.file) : '',
      labels.en || '', labels.ja || '', ''
    ]));
  });

  const citiesOut = {};
  for (const [cityKey, src] of citySources) {
    const { image, why } = photoOf(src);
    const e = src.entity;
    const labelEntity = cityLabelEntity(cityKey, cityEntities, entityCache);
    const labels = displayLabels(labelEntity);
    if (e && image) citiesOut[cityKey] = mediaEntry(image, e.coord, e.id, true, labels);
    reportRows.push(row([
      `city:${cityKey}`, 'city', e ? (image ? 'image' : 'no-photo') : 'none', e ? e.id : '',
      src.from ? `city-image-from ${src.from}` : 'city-reference', '', e ? e.labels.ko : '', e ? e.labels.ja : '', e ? e.labels.en : '',
      '', src.file, image ? image.license : why, '', image ? reviewNote(cityData[cityKey].label, src.file) : '',
      labels.en || '', labels.ja || '', labelEntity && labelEntity !== e ? `labels from ${labelEntity.id}` : ''
    ]));
  }

  const genresOut = {};
  for (const [genre, src] of genreSources) {
    const { image, why } = photoOf(src);
    const e = src.entity;
    if (e && image) genresOut[genre] = mediaEntry(image, null, e.id, false);
    reportRows.push(row([
      `genre:${genre}`, 'food-genre', e ? (image ? 'image' : 'no-photo') : 'none', e ? e.id : '', 'GENRE_ITEMS', '',
      e ? e.labels.ko : '', e ? e.labels.ja : '', e ? e.labels.en : '', '', src.file, image ? image.license : why, '', '',
      '', '', ''
    ]));
  }

  const sections = { places: sortedObject(placesOut), cities: sortedObject(citiesOut), foodGenres: sortedObject(genresOut) };
  const sortedPlaces = sections.places;
  const existing = readExisting(opts.out);
  const unchanged = existing && Object.keys(sections).every((s) => JSON.stringify(existing[s] || {}) === JSON.stringify(sections[s]));
  const output = {
    version: FILE_VERSION,
    generatedAt: unchanged && existing.generatedAt ? existing.generatedAt : new Date().toISOString(),
    ...sections
  };

  if (opts.report) {
    const header = ['key', 'kind', 'status', 'wikidata', 'via', 'level', 'ko', 'ja', 'en', 'distKm', 'p18', 'license/why', 'rejected', 'review',
      'labelEn', 'labelJa', 'labelNote'].join('\t');
    fs.mkdirSync(path.dirname(opts.report), { recursive: true });
    fs.writeFileSync(opts.report, `${header}\n${reportRows.join('\n')}\n`);
    console.log(`[place-images] report: ${opts.report}`);
  }
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`[place-images] wrote ${opts.out}${unchanged ? ' (content unchanged)' : ''}`);
  }

  const entries = Object.values(sortedPlaces);
  const highlightTotal = places.filter((p) => p.kind === 'highlight').length;
  const highlightKeys = new Set(places.filter((p) => p.kind === 'highlight').map((p) => p.key));
  const hlEntries = Object.entries(sortedPlaces).filter(([k]) => highlightKeys.has(k)).map(([, v]) => v);
  console.log(`[place-images] coverage: places ${places.length} / with image ${entries.filter((x) => x.image).length} / with coordinates ${entries.filter((x) => x.lat !== null).length}`);
  console.log(`[place-images] highlights only: ${highlightTotal} / with image ${hlEntries.filter((x) => x.image).length} / with coordinates ${hlEntries.filter((x) => x.lat !== null).length}`);
  console.log(`[place-images] cities: ${citySources.size} / with image ${Object.keys(citiesOut).length}; food genres: ${genres.length} / with image ${Object.keys(genresOut).length}`);
  const labelCount = (list, lang) => list.filter((x) => x.labels && x.labels[lang]).length;
  const cityEntries = Object.values(sections.cities);
  console.log(`[place-images] labels: places ${entries.length} / en ${labelCount(entries, 'en')} / ja ${labelCount(entries, 'ja')}; cities ${cityEntries.length} / en ${labelCount(cityEntries, 'en')} / ja ${labelCount(cityEntries, 'ja')}`);
  console.log(`[place-images] requests: ${client.stats.network} network, ${client.stats.cached} cached, ${client.stats.retries} retries`);

  if (opts.spotCheck > 0) await spotCheck(client, output, opts.spotCheck, opts.spotDir);
  if (opts.reviewBaths) await reviewBaths(client, output, opts.spotDir);
}

// scripts/build-city-places.js reuses the reader, the polite client and the Wikidata/Commons helpers.
module.exports = {
  USER_AGENT, THUMB_WIDTH, BATH_REVIEW, NON_PHOTO_FILE, CJK_SCRIPT, HANGUL_SCRIPT, QUALIFIER,
  Client, apiUrl, chunked, loadServerData, extractDeclaration, runInSandbox,
  getEntities, getClassLabels, searchWikidata, getImageInfos, checkedImages, parseImageInfo, creditName,
  displayLabels, haversineKm, inJapan, normText, looseKo, round5, sortedObject, readExisting, needsBathReview, commonsFileName
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`[place-images] failed: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}
