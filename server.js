const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { randomUUID } = require('crypto');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY || '';
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET || '';
const AMADEUS_ENV = (process.env.AMADEUS_ENV || 'test').toLowerCase();
const FX_USD_KRW = Number(process.env.FX_USD_KRW || 1350);
let fxUsdKrw = FX_USD_KRW;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_MODEL = process.env.GEMINI_API_MODEL || 'gemini-2.5-pro';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const USE_GEMINI = Boolean(GEMINI_API_KEY);
const CHAT_PARSE_STRICT_AI = String(process.env.CHAT_PARSE_STRICT_AI || 'false').toLowerCase() === 'true';

const AI_SYSTEM_MESSAGE = [
  'You are a travel itinerary planner.',
  'Return only JSON that matches the provided schema.',
  'Use the provided picks and foods; avoid inventing places not in input.',
  'Respect flight timing if provided (arrival and departure).',
  'If stay details are supplied, mention the picked property and honor its check-in/out window when planning the first and last days.',
  'Schedule blocks in local time with start/end like "09:00".'
].join(' ');

const CITY_DATA = {
  tokyo: {
    label: '도쿄',
    airport: 'NRT',
    areas: ['시부야', '신주쿠', '아사쿠사', '긴자'],
    highlights: [
      { name: '센소지', area: '아사쿠사', category: '문화', stayMin: 90, bestTime: '09:00-11:00', crowdScore: 3 },
      { name: '시부야 스카이', area: '시부야', category: '전망', stayMin: 80, bestTime: '17:00-19:00', crowdScore: 4 },
      { name: '메이지 신궁', area: '하라주쿠', category: '자연/문화', stayMin: 100, bestTime: '08:30-10:30', crowdScore: 2 },
      { name: '츠키지 외시장', area: '츠키지', category: '미식', stayMin: 120, bestTime: '10:00-12:00', crowdScore: 4 },
      { name: '긴자 식스', area: '긴자', category: '쇼핑', stayMin: 110, bestTime: '14:00-16:00', crowdScore: 3 },
      { name: '오다이바 해변공원', area: '오다이바', category: '산책', stayMin: 100, bestTime: '16:00-18:00', crowdScore: 2 }
    ],
    foods: [
      { name: '스시다이', area: '츠키지', genre: '스시', priceLevel: 4, score: 4.2, tabelogUrl: 'https://tabelog.com/en/tokyo/' },
      { name: '아후리 라멘', area: '에비스', genre: '라멘', priceLevel: 2, score: 3.8, tabelogUrl: 'https://tabelog.com/en/tokyo/' },
      { name: '토리키조쿠', area: '신주쿠', genre: '이자카야', priceLevel: 1, score: 3.6, tabelogUrl: 'https://tabelog.com/en/tokyo/' }
    ]
  },
  osaka: {
    label: '오사카',
    airport: 'KIX',
    areas: ['난바', '우메다', '신사이바시', '덴노지'],
    highlights: [
      { name: '오사카성', area: '주오구', category: '문화', stayMin: 120, bestTime: '09:00-11:30', crowdScore: 3 },
      { name: '도톤보리', area: '난바', category: '미식/야경', stayMin: 150, bestTime: '18:00-21:00', crowdScore: 5 },
      { name: '우메다 스카이 빌딩', area: '우메다', category: '전망', stayMin: 80, bestTime: '17:30-19:00', crowdScore: 3 },
      { name: '신세카이', area: '에비스초', category: '로컬', stayMin: 90, bestTime: '15:00-18:00', crowdScore: 3 }
    ],
    foods: [
      { name: '쿠시카츠 다루마', area: '신세카이', genre: '쿠시카츠', priceLevel: 2, score: 3.7, tabelogUrl: 'https://tabelog.com/en/osaka/' },
      { name: '타코야키 주하치반', area: '난바', genre: '타코야키', priceLevel: 1, score: 3.8, tabelogUrl: 'https://tabelog.com/en/osaka/' },
      { name: '후쿠타로 오코노미야키', area: '난바', genre: '오코노미야키', priceLevel: 2, score: 4.0, tabelogUrl: 'https://tabelog.com/en/osaka/' }
    ]
  },
  kyoto: {
    label: '교토',
    airport: 'KIX',
    areas: ['기온', '아라시야마', '가와라마치'],
    highlights: [
      { name: '후시미 이나리', area: '후시미', category: '문화/트레킹', stayMin: 140, bestTime: '07:30-10:30', crowdScore: 4 },
      { name: '기요미즈데라', area: '히가시야마', category: '문화', stayMin: 110, bestTime: '09:00-11:00', crowdScore: 4 },
      { name: '아라시야마 대나무숲', area: '아라시야마', category: '자연', stayMin: 100, bestTime: '08:00-09:30', crowdScore: 3 }
    ],
    foods: [
      { name: '오멘 긴카쿠지', area: '사쿄구', genre: '우동', priceLevel: 2, score: 3.9, tabelogUrl: 'https://tabelog.com/en/kyoto/' },
      { name: '기온 우오신', area: '기온', genre: '가이세키', priceLevel: 4, score: 4.1, tabelogUrl: 'https://tabelog.com/en/kyoto/' }
    ]
  }
};

const JAPAN_CITY_PROFILES = {
  sapporo: { label: '삿포로', airport: 'CTS', areas: ['오도리', '스스키노', '조잔케이'], sightA: '오도리 공원', sightB: '삿포로 TV 타워', sightC: '니조시장', foodA: '스프카레 GARAKU', foodB: '스미레 라멘', genreA: '카레', genreB: '라멘' },
  hakodate: { label: '하코다테', airport: 'HKD', areas: ['모토마치', '고료카쿠', '베이 에어리어'], sightA: '하코다테 야경', sightB: '고료카쿠 공원', sightC: '아침시장', foodA: '하코다테 카이센동', foodB: '시오라멘', genreA: '해산물', genreB: '라멘' },
  asahikawa: { label: '아사히카와', airport: 'AKJ', areas: ['역전', '아사히야마', '평화거리'], sightA: '아사히야마 동물원', sightB: '헤이와도리 쇼핑공원', sightC: '우에노팜', foodA: '아사히카와 라멘', foodB: '징기스칸', genreA: '라멘', genreB: '양고기' },
  aomori: { label: '아오모리', airport: 'AOJ', areas: ['신마치', '아사무시', '아오모리역'], sightA: '네부타 박물관', sightB: '아오모리 베이브리지', sightC: '아오모리 현립미술관', foodA: '아오모리 사과 디저트', foodB: '해산물 시장', genreA: '디저트', genreB: '해산물' },
  akita: { label: '아키타', airport: 'AXT', areas: ['센슈공원', '오가', '아키타역'], sightA: '센슈공원', sightB: '오가 반도', sightC: '아키타 시립박물관', foodA: '기리탄포', foodB: '이나니와 우동', genreA: '향토요리', genreB: '우동' },
  hanamaki: { label: '하나마키', airport: 'HNA', areas: ['온천지구', '역전', '이와테'], sightA: '하나마키 온천', sightB: '미야자와 겐지 기념관', sightC: '이와테 산책로', foodA: '완코소바', foodB: '모리오카 냉면', genreA: '소바', genreB: '면요리' },
  yamagata: { label: '야마가타', airport: 'GAJ', areas: ['자오', '야마가타역', '카조공원'], sightA: '자오 온천', sightB: '카조 공원', sightC: '리사쿠지', foodA: '이모니', foodB: '야마가타 소바', genreA: '향토요리', genreB: '소바' },
  sendai: { label: '센다이', airport: 'SDJ', areas: ['아오바구', '고쿠분초', '마쓰시마'], sightA: '즈이호덴', sightB: '센다이성 유적', sightC: '마쓰시마', foodA: '규탄 전문점', foodB: '즈다모치 카페', genreA: '규탄', genreB: '디저트' },
  fukushima: { label: '후쿠시마', airport: 'FKS', areas: ['아이즈와카마츠', '코리야마', '후쿠시마역'], sightA: '쓰루가성', sightB: '고시키누마', sightC: '오우치주쿠', foodA: '키타카타 라멘', foodB: '소스카츠동', genreA: '라멘', genreB: '돈카츠' },
  niigata: { label: '니가타', airport: 'KIJ', areas: ['반다이', '후루마치', '사도'], sightA: '피아반다이 시장', sightB: '니가타 수족관', sightC: '사도섬', foodA: '니가타 돈부리', foodB: '니혼슈 바', genreA: '해산물', genreB: '주점' },
  kanazawa: { label: '가나자와', airport: 'KMQ', areas: ['겐로쿠엔', '히가시차야', '오미초'], sightA: '겐로쿠엔', sightB: '오미초 시장', sightC: '히가시차야 거리', foodA: '카나자와 스시', foodB: '노도구로 구이', genreA: '스시', genreB: '일식' },
  toyama: { label: '도야마', airport: 'TOY', areas: ['도야마역', '우나즈키', '알펜루트'], sightA: '알펜루트', sightB: '도야마성 공원', sightC: '글래스 미술관', foodA: '시로에비', foodB: '부리 샤브', genreA: '해산물', genreB: '일식' },
  shizuoka: { label: '시즈오카', airport: 'FSZ', areas: ['시미즈', '시즈오카역', '쿠사츠'], sightA: '미호노마쓰바라', sightB: '쿠노잔 도쇼구', sightC: '시즈오카 차밭', foodA: '사쿠라에비', foodB: '우나기 덮밥', genreA: '해산물', genreB: '일식' },
  nagoya: { label: '나고야', airport: 'NGO', areas: ['사카에', '나고야역', '오스'], sightA: '나고야성', sightB: '오아시스21', sightC: '도요타 산업기술 기념관', foodA: '미소카츠', foodB: '히츠마부시', genreA: '돈카츠', genreB: '장어덮밥' },
  okayama: { label: '오카야마', airport: 'OKJ', areas: ['오카야마역', '고라쿠엔', '쿠라시키'], sightA: '고라쿠엔', sightB: '오카야마성', sightC: '쿠라시키 미관지구', foodA: '바라즈시', foodB: '데미카츠동', genreA: '향토요리', genreB: '돈카츠' },
  hiroshima: { label: '히로시마', airport: 'HIJ', areas: ['나카구', '미야지마', '히로시마역'], sightA: '평화기념공원', sightB: '이쓰쿠시마 신사', sightC: '히로시마성', foodA: '히로시마 오코노미야키', foodB: '굴 요리', genreA: '오코노미야키', genreB: '해산물' },
  yonago: { label: '요나고', airport: 'YGJ', areas: ['사카이미나토', '다이센', '요나고역'], sightA: '미즈키 시게루 로드', sightB: '다이센', sightC: '카이케 온천', foodA: '게 요리', foodB: '회덮밥', genreA: '해산물', genreB: '일식' },
  izumo: { label: '이즈모', airport: 'IZO', areas: ['이즈모타이샤', '신지호', '역전'], sightA: '이즈모 타이샤', sightB: '이나사 해변', sightC: '신지호 석양', foodA: '이즈모 소바', foodB: '젠자이', genreA: '소바', genreB: '디저트' },
  takamatsu: { label: '다카마쓰', airport: 'TAK', areas: ['리쓰린', '선포트', '야시마'], sightA: '리쓰린 공원', sightB: '타카마츠성 유적', sightC: '야시마 전망대', foodA: '사누키 우동', foodB: '올리브 소고기', genreA: '우동', genreB: '일식' },
  matsuyama: { label: '마쓰야마', airport: 'MYJ', areas: ['도고온천', '마쓰야마성', '오카이도'], sightA: '도고온천', sightB: '마쓰야마성', sightC: '보찬 열차', foodA: '도미밥', foodB: '쟈코텐', genreA: '일식', genreB: '향토요리' },
  kochi: { label: '고치', airport: 'KCZ', areas: ['고치성', '히로메시장', '카츠라하마'], sightA: '고치성', sightB: '카츠라하마', sightC: '히로메 시장', foodA: '가츠오 타타키', foodB: '사와치 요리', genreA: '해산물', genreB: '향토요리' },
  tokushima: { label: '도쿠시마', airport: 'TKS', areas: ['아와오도리', '비잔', '나루토'], sightA: '아와오도리 회관', sightB: '나루토 소용돌이', sightC: '비잔 로프웨이', foodA: '도쿠시마 라멘', foodB: '아와규', genreA: '라멘', genreB: '일식' },
  fukuoka: { label: '후쿠오카', airport: 'FUK', areas: ['하카타', '텐진', '모모치'], sightA: '오호리 공원', sightB: '캐널시티 하카타', sightC: '후쿠오카 타워', foodA: '하카타 라멘', foodB: '모츠나베', genreA: '라멘', genreB: '전골' },
  nagasaki: { label: '나가사키', airport: 'NGS', areas: ['데지마', '차이나타운', '이나사야마'], sightA: '글로버가든', sightB: '평화공원', sightC: '이나사야마 전망대', foodA: '짬뽕', foodB: '카스테라', genreA: '면요리', genreB: '디저트' },
  kumamoto: { label: '구마모토', airport: 'KMJ', areas: ['구마모토성', '스이젠지', '아소'], sightA: '구마모토성', sightB: '스이젠지 공원', sightC: '아소 화산', foodA: '바사시', foodB: '구마모토 라멘', genreA: '일식', genreB: '라멘' },
  oita: { label: '오이타', airport: 'OIT', areas: ['벳푸', '유후인', '오이타역'], sightA: '벳푸 지옥온천', sightB: '유후인 거리', sightC: '타카사키야마', foodA: '도리텐', foodB: '벳푸 냉면', genreA: '향토요리', genreB: '면요리' },
  miyazaki: { label: '미야자키', airport: 'KMI', areas: ['아오시마', '니치난', '시내'], sightA: '아오시마 신사', sightB: '우도신궁', sightC: '선멧세 니치난', foodA: '치킨난반', foodB: '미야자키 소고기', genreA: '일식', genreB: '육류' },
  kagoshima: { label: '가고시마', airport: 'KOJ', areas: ['사쿠라지마', '덴몬칸', '이부스키'], sightA: '사쿠라지마', sightB: '센간엔', sightC: '이부스키 모래찜', foodA: '쿠로부타 돈카츠', foodB: '사츠마아게', genreA: '돈카츠', genreB: '향토요리' },
  okinawa: { label: '오키나와', airport: 'OKA', areas: ['나하', '차탄', '온나'], sightA: '국제거리', sightB: '츄라우미 수족관', sightC: '아메리칸 빌리지', foodA: '오키나와 소바', foodB: '고야참푸루', genreA: '면요리', genreB: '향토요리' },
  obihiro: { label: '오비히로', airport: 'OBO', areas: ['반에이', '도카치', '역전'], sightA: '반에이 경마', sightB: '도카치가와 온천', sightC: '마나베 정원', foodA: '부타동', foodB: '유제품 디저트', genreA: '덮밥', genreB: '디저트' }
};

const JAPAN_CITY_PROFILES_EXTRA = {
  wakkanai: { label: '왓카나이', airport: 'WKJ', areas: ['노샷푸', '왓카나이역', '소야곶'], sightA: '소야곶', sightB: '노샷푸 곶', sightC: '왓카나이 공원', foodA: '해산물 덮밥', foodB: '홋카이도 우유 디저트', genreA: '해산물', genreB: '디저트' },
  rishiri: { label: '리시리', airport: 'RIS', areas: ['오시도마리', '리시리후지', '페시미사키'], sightA: '리시리산 전망', sightB: '페시미사키 전망대', sightC: '섬 해안 드라이브', foodA: '리시리 다시 라멘', foodB: '성게 요리', genreA: '라멘', genreB: '해산물' },
  memanbetsu: { label: '메만베쓰', airport: 'MMB', areas: ['아바시리', '비호로', '시레토코'], sightA: '아바시리 유빙관', sightB: '비호로 고개', sightC: '시레토코 자연길', foodA: '게 요리', foodB: '현지 버거', genreA: '해산물', genreB: '패스트푸드' },
  kushiro: { label: '구시로', airport: 'KUH', areas: ['누사마이', '와쇼시장', '습원'], sightA: '구시로 습원', sightB: '누사마이 다리', sightC: '와쇼 시장', foodA: '카이센동', foodB: '로바타야키', genreA: '해산물', genreB: '구이' },
  nakashibetsu: { label: '나카시베츠', airport: 'SHB', areas: ['네무로', '구시로', '중심가'], sightA: '노츠케 반도', sightB: '네무로 해안', sightC: '현지 목장 체험', foodA: '치즈 플래터', foodB: '우유 아이스크림', genreA: '유제품', genreB: '디저트' },
  okadama: { label: '삿포로 오카다마', airport: 'OKD', areas: ['히가시구', '중앙구', '오도리'], sightA: '모에레누마 공원', sightB: '삿포로 맥주박물관', sightC: '오도리 야경', foodA: '수프카레', foodB: '징기스칸', genreA: '카레', genreB: '육류' },
  misawa: { label: '미사와', airport: 'MSJ', areas: ['미사와', '도와다', '아오모리'], sightA: '오이라세 계류', sightB: '도와다 호수', sightC: '미사와 항공박물관', foodA: '사과 디저트', foodB: '히메마스 요리', genreA: '디저트', genreB: '향토요리' },
  odate: { label: '오다테', airport: 'ONJ', areas: ['오다테', '카즈노', '아키타'], sightA: '아키타견 박물관', sightB: '하치만타이', sightC: '오유 스톤서클', foodA: '기리탄포', foodB: '히나이 토리', genreA: '향토요리', genreB: '닭요리' },
  shonai: { label: '쇼나이', airport: 'SYO', areas: ['쓰루오카', '사카타', '데와산잔'], sightA: '데와산잔', sightB: '가모 수족관', sightC: '사카타 항구', foodA: '야마가타 소바', foodB: '쇼진요리', genreA: '소바', genreB: '향토요리' },
  ibaraki: { label: '이바라키', airport: 'IBR', areas: ['미토', '오아라이', '히타치'], sightA: '가이라쿠엔', sightB: '오아라이 해변', sightC: '히타치 해변공원', foodA: '아구 돼지 요리', foodB: '낫토 정식', genreA: '일식', genreB: '향토요리' },
  matsumoto: { label: '마쓰모토', airport: 'MMJ', areas: ['마쓰모토성', '나와테', '아즈미노'], sightA: '마쓰모토성', sightB: '나카마치 거리', sightC: '가미코치', foodA: '신슈 소바', foodB: '바사시', genreA: '소바', genreB: '육류' },
  nanki_shirahama: { label: '난키 시라하마', airport: 'SHM', areas: ['시라하마', '엔게츠섬', '어드벤처월드'], sightA: '시라라하마 해변', sightB: '엔게츠섬', sightC: '어드벤처월드', foodA: '해산물 정식', foodB: '온천 달걀 요리', genreA: '해산물', genreB: '일식' },
  kobe: { label: '고베', airport: 'UKB', areas: ['산노미야', '모자이크', '기타노'], sightA: '고베 하버랜드', sightB: '기타노 이진칸', sightC: '누노비키 허브원', foodA: '고베규 스테이크', foodB: '아카시야키', genreA: '육류', genreB: '분식' },
  tajima: { label: '다지마', airport: 'TJH', areas: ['도요오카', '기노사키', '출석가'], sightA: '기노사키 온천', sightB: '고노토리 공원', sightC: '겐부도', foodA: '카니 요리', foodB: '다지마규 구이', genreA: '해산물', genreB: '육류' },
  tottori: { label: '돗토리', airport: 'TTJ', areas: ['돗토리 사구', '쿠라요시', '돗토리역'], sightA: '돗토리 사구', sightB: '우라도메 해안', sightC: '모래 미술관', foodA: '게 요리', foodB: '배 디저트', genreA: '해산물', genreB: '디저트' },
  iwakuni: { label: '이와쿠니', airport: 'IWK', areas: ['긴타이쿄', '이와쿠니성', '역전'], sightA: '긴타이교', sightB: '이와쿠니성', sightC: '시라헤비 신사', foodA: '이와쿠니 스시', foodB: '연근 요리', genreA: '스시', genreB: '향토요리' },
  yamaguchi_ube: { label: '야마구치 우베', airport: 'UBJ', areas: ['우베', '야마구치', '아키요시다이'], sightA: '아키요시 동굴', sightB: '루리코지', sightC: '우베 공원', foodA: '복어 요리', foodB: '가와라소바', genreA: '해산물', genreB: '면요리' },
  kitakyushu: { label: '기타큐슈', airport: 'KKJ', areas: ['고쿠라', '모지코', '야하타'], sightA: '모지코 레트로', sightB: '고쿠라성', sightC: '사라쿠라산 야경', foodA: '야키카레', foodB: '우동', genreA: '카레', genreB: '우동' },
  saga: { label: '사가', airport: 'HSG', areas: ['사가역', '카라쓰', '우레시노'], sightA: '요시노가리 유적', sightB: '카라쓰성', sightC: '우레시노 온천', foodA: '사가규', foodB: '온천 두부', genreA: '육류', genreB: '두부요리' },
  amami: { label: '아마미', airport: 'ASJ', areas: ['아마미시', '해변', '숲길'], sightA: '아마미 블루 해변', sightB: '망그로브 카약', sightC: '아야마루 곶', foodA: '케이한', foodB: '흑설탕 디저트', genreA: '향토요리', genreB: '디저트' },
  yakushima: { label: '야쿠시마', airport: 'KUM', areas: ['미야노우라', '시라타니', '아나보'], sightA: '시라타니 운수협곡', sightB: '조몬스기 트레일', sightC: '오코 폭포', foodA: '토비우오 요리', foodB: '사쓰마아게', genreA: '해산물', genreB: '향토요리' },
  tanegashima: { label: '다네가시마', airport: 'TNE', areas: ['니시노오모테', '우주센터', '해변'], sightA: '다네가시마 우주센터', sightB: '우라마 산책로', sightC: '해변 일몰', foodA: '현지 해산물 덮밥', foodB: '고구마 디저트', genreA: '해산물', genreB: '디저트' },
  miyako: { label: '미야코지마', airport: 'MMY', areas: ['히라라', '이케마', '쿠리마'], sightA: '이케마 대교', sightB: '요나하마에하마 해변', sightC: '히가시헨나자키', foodA: '미야코소바', foodB: '해산물 BBQ', genreA: '면요리', genreB: '해산물' },
  ishigaki: { label: '이시가키', airport: 'ISG', areas: ['이시가키시', '카비라', '항구'], sightA: '카비라만', sightB: '이시가키 석회동굴', sightC: '환상적인 석양 포인트', foodA: '야에야마 소바', foodB: '이시가키규 스테이크', genreA: '면요리', genreB: '육류' },
  shimojishima: { label: '시모지시마', airport: 'SHI', areas: ['이라부', '시모지', '비치'], sightA: '17END 비치', sightB: '이라부 대교', sightC: '스노클링 포인트', foodA: '섬 생선 요리', foodB: '트로피컬 디저트', genreA: '해산물', genreB: '디저트' },
  kumejima: { label: '구메지마', airport: 'UEO', areas: ['구메지마시', '해변', '산호초'], sightA: '하테노하마', sightB: '우에구스쿠성터', sightC: '열대 해변 산책', foodA: '현지 소바', foodB: '바다포도 샐러드', genreA: '면요리', genreB: '샐러드' },
  kita_daito: { label: '기타다이토', airport: 'KTD', areas: ['기타다이토', '해안', '마을'], sightA: '섬 해안 절벽', sightB: '로컬 등대', sightC: '바다 조망길', foodA: '섬 해산물 정식', foodB: '현지 디저트', genreA: '해산물', genreB: '디저트' },
  yonaguni: { label: '요나구니', airport: 'OGN', areas: ['요나구니', '바다절벽', '마을'], sightA: '일본 최서단 기념비', sightB: '드라마티컬 절벽', sightC: '해저 지형 다이빙', foodA: '섬 소바', foodB: '가쓰오 요리', genreA: '면요리', genreB: '해산물' },
  tokunoshima: { label: '도쿠노시마', airport: 'TKN', areas: ['아마기', '이스엔', '해변'], sightA: '무시로세 해안', sightB: '아마기 산책로', sightC: '야생 자연 보호지', foodA: '향토 정식', foodB: '흑설탕 디저트', genreA: '향토요리', genreB: '디저트' }
};

Object.assign(JAPAN_CITY_PROFILES, JAPAN_CITY_PROFILES_EXTRA);

function buildGenericCity(profile) {
  const [a1, a2, a3] = profile.areas;
  return {
    label: profile.label,
    airport: profile.airport,
    areas: profile.areas,
    highlights: [
      { name: profile.sightA, area: a1, category: '문화/명소', stayMin: 90, bestTime: '09:00-11:00', crowdScore: 3 },
      { name: profile.sightB, area: a2, category: '자연/전망', stayMin: 100, bestTime: '13:00-15:00', crowdScore: 3 },
      { name: profile.sightC, area: a3, category: '로컬/산책', stayMin: 110, bestTime: '16:00-18:00', crowdScore: 2 }
    ],
    foods: [
      { name: profile.foodA, area: a1, genre: profile.genreA, priceLevel: 2, score: 3.8, tabelogUrl: 'https://tabelog.com/en/' },
      { name: profile.foodB, area: a2, genre: profile.genreB, priceLevel: 3, score: 4.0, tabelogUrl: 'https://tabelog.com/en/' }
    ]
  };
}

for (const [key, profile] of Object.entries(JAPAN_CITY_PROFILES)) {
  CITY_DATA[key] = buildGenericCity(profile);
}

function augmentCityData(city) {
  const [a1, a2] = city.areas;
  const extraFoods = [
    { name: `${city.label} 로컬 이자카야`, area: a1, genre: '이자카야', priceLevel: 2, score: 3.7, tabelogUrl: 'https://tabelog.com/en/' },
    { name: `${city.label} 대표 라멘`, area: a2, genre: '라멘', priceLevel: 2, score: 3.9, tabelogUrl: 'https://tabelog.com/en/' }
  ];
  city.foods = [...city.foods, ...extraFoods];
}

for (const city of Object.values(CITY_DATA)) {
  augmentCityData(city);
}

const CITY_ALIASES = {
  tokyo: ['도쿄', 'tokyo'],
  osaka: ['오사카', 'osaka'],
  kyoto: ['교토', 'kyoto']
};

const LANDMARK_CITY_HINTS = {
  tokyo: ['센소지', '시부야', '신주쿠', '디즈니', '도쿄타워', '아사쿠사', '긴자', '하라주쿠', '오다이바', '츠키지', 'shibuya', 'shinjuku', 'asakusa', 'ginza'],
  osaka: ['도톤보리', '유니버셜', 'USJ', '난바', '우메다', '오사카성', '신사이바시', '신세카이', 'dotonbori', 'namba', 'umeda', 'universal studios', 'osaka castle'],
  kyoto: ['후시미', '기요미즈', '아라시야마', '기온', '니시키시장', '금각사', '은각사', 'gion', 'arashiyama', 'fushimi'],
  sapporo: ['오도리', '스스키노', '삿포로'],
  fukuoka: ['하카타', '텐진', '후쿠오카', '모모치', '캐널시티'],
  okinawa: ['나하', '츄라우미', '오키나와', '국제거리', '온나', '차탄'],
  hiroshima: ['히로시마', '미야지마', '이쓰쿠시마', '평화기념공원'],
  nagoya: ['나고야', '오스', '사카에', '나고야성'],
  kanazawa: ['가나자와', '겐로쿠엔', '히가시차야'],
  shizuoka: ['시즈오카', '누마즈', '이토', '아타미', '시미즈', '미호노마쓰바라']
};

const LOCALITY_PARENT_CITY_MAP = {
  // Tokyo
  '신주쿠': 'tokyo', '시부야': 'tokyo', '하라주쿠': 'tokyo', '아사쿠사': 'tokyo', '긴자': 'tokyo', '우에노': 'tokyo', '오다이바': 'tokyo', '이케부쿠로': 'tokyo',
  // Osaka
  '난바': 'osaka', '우메다': 'osaka', '신사이바시': 'osaka', '도톤보리': 'osaka', '신세카이': 'osaka',
  // Kyoto
  '기온': 'kyoto', '아라시야마': 'kyoto', '후시미': 'kyoto', '가와라마치': 'kyoto',
  // Fukuoka
  '하카타': 'fukuoka', '텐진': 'fukuoka', '모모치': 'fukuoka',
  // Hokkaido
  '스스키노': 'sapporo', '오도리': 'sapporo',
  // Okinawa
  '나하': 'okinawa', '온나': 'okinawa', '차탄': 'okinawa',
  // Nagoya
  '사카에': 'nagoya', '오스': 'nagoya',
  // Hiroshima
  '미야지마': 'hiroshima',
  // Shizuoka region (can be parent or explicit-local dynamic based on phrase)
  '누마즈': 'shizuoka', '아타미': 'shizuoka', '이토': 'shizuoka', '시미즈': 'shizuoka',
  // Oita region
  '벳푸': 'oita', '유후인': 'oita',
  // Kanagawa region (fallback to tokyo in this dataset)
  '하코네': 'tokyo', '요코하마': 'tokyo',
  // Hyogo region
  '고베': 'kobe'
};

const DYNAMIC_LOCALITY_AIRPORT_HINT = {
  '누마즈': 'FSZ',
  '아타미': 'FSZ',
  '이토': 'FSZ',
  '유후인': 'OIT',
  '벳푸': 'OIT',
  '하코네': 'HND',
  '요코하마': 'HND'
};

const MUST_ATTRACTIONS = [
  { name: '유니버셜 스튜디오 재팬', cityKey: 'osaka', area: '오사카', aliases: ['유니버셜', '유니버셜 스튜디오', 'usj', 'universal studios', 'universal studios japan'] },
  { name: '금각사', cityKey: 'kyoto', area: '교토', aliases: ['금각사', '킨카쿠지', 'kinkakuji', 'golden pavilion'] },
  { name: '후시미 이나리', cityKey: 'kyoto', area: '교토', aliases: ['후시미 이나리', '후시미이나리', 'fushimi inari'] },
  { name: '도톤보리', cityKey: 'osaka', area: '오사카', aliases: ['도톤보리', 'dotonbori'] },
  { name: '센소지', cityKey: 'tokyo', area: '도쿄', aliases: ['센소지', '아사쿠사 절', 'sensoji'] },
  { name: '도쿄 디즈니랜드', cityKey: 'tokyo', area: '도쿄', aliases: ['도쿄 디즈니랜드', 'tokyo disneyland', '디즈니랜드'] },
  { name: '도쿄 디즈니씨', cityKey: 'tokyo', area: '도쿄', aliases: ['도쿄 디즈니씨', 'tokyo disneysea', '디즈니씨'] },
  { name: '시부야 스카이', cityKey: 'tokyo', area: '도쿄', aliases: ['시부야 스카이', 'shibuya sky'] },
  { name: '도쿄 타워', cityKey: 'tokyo', area: '도쿄', aliases: ['도쿄 타워', 'tokyo tower'] },
  { name: '오사카성', cityKey: 'osaka', area: '오사카', aliases: ['오사카성', 'osaka castle'] },
  { name: '신세카이', cityKey: 'osaka', area: '오사카', aliases: ['신세카이', 'shinsekai'] },
  { name: '기요미즈데라', cityKey: 'kyoto', area: '교토', aliases: ['기요미즈데라', 'kiyomizudera'] },
  { name: '아라시야마 대나무숲', cityKey: 'kyoto', area: '교토', aliases: ['아라시야마', 'arashiyama bamboo', '아라시야마 대나무숲'] },
  { name: '니시키 시장', cityKey: 'kyoto', area: '교토', aliases: ['니시키 시장', 'nishiki market'] },
  { name: '삿포로 오도리 공원', cityKey: 'sapporo', area: '삿포로', aliases: ['오도리 공원', 'odori park'] },
  { name: '삿포로 TV 타워', cityKey: 'sapporo', area: '삿포로', aliases: ['삿포로 tv 타워', 'sapporo tv tower'] },
  { name: '후쿠오카 타워', cityKey: 'fukuoka', area: '후쿠오카', aliases: ['후쿠오카 타워', 'fukuoka tower'] },
  { name: '캐널시티 하카타', cityKey: 'fukuoka', area: '후쿠오카', aliases: ['캐널시티', 'canal city hakata'] },
  { name: '이쓰쿠시마 신사', cityKey: 'hiroshima', area: '히로시마', aliases: ['이쓰쿠시마 신사', 'itsukushima shrine', '미야지마 신사'] },
  { name: '히로시마 평화기념공원', cityKey: 'hiroshima', area: '히로시마', aliases: ['평화기념공원', 'hiroshima peace memorial park'] },
  { name: '겐로쿠엔', cityKey: 'kanazawa', area: '가나자와', aliases: ['겐로쿠엔', 'kenrokuen'] },
  { name: '나고야성', cityKey: 'nagoya', area: '나고야', aliases: ['나고야성', 'nagoya castle'] },
  { name: '츄라우미 수족관', cityKey: 'okinawa', area: '오키나와', aliases: ['츄라우미 수족관', 'churaumi aquarium'] },
  { name: '국제거리', cityKey: 'okinawa', area: '오키나와', aliases: ['국제거리', 'kokusai dori'] },
  { name: '벳푸 지옥온천', cityKey: 'oita', area: '오이타', aliases: ['벳푸 지옥온천', 'beppu hells'] },
  { name: '유후인', cityKey: 'oita', area: '오이타', aliases: ['유후인', 'yufuin'] }
];

function matchMustAttractions(text) {
  const lower = String(text || '').toLowerCase();
  const hits = [];
  for (const item of MUST_ATTRACTIONS) {
    if (item.aliases.some((a) => lower.includes(String(a).toLowerCase()))) {
      hits.push(item);
    }
  }
  return hits;
}

const JAPAN_AIRPORT_COORDS = [
  { code: 'NRT', lat: 35.772, lng: 140.392 },
  { code: 'HND', lat: 35.549, lng: 139.779 },
  { code: 'KIX', lat: 34.434, lng: 135.244 },
  { code: 'ITM', lat: 34.785, lng: 135.438 },
  { code: 'CTS', lat: 42.775, lng: 141.692 },
  { code: 'HKD', lat: 41.770, lng: 140.822 },
  { code: 'AKJ', lat: 43.671, lng: 142.447 },
  { code: 'AOJ', lat: 40.734, lng: 140.691 },
  { code: 'AXT', lat: 39.615, lng: 140.218 },
  { code: 'HNA', lat: 39.428, lng: 141.135 },
  { code: 'GAJ', lat: 38.411, lng: 140.371 },
  { code: 'SDJ', lat: 38.139, lng: 140.917 },
  { code: 'FKS', lat: 37.227, lng: 140.431 },
  { code: 'KIJ', lat: 37.956, lng: 139.113 },
  { code: 'KMQ', lat: 36.394, lng: 136.407 },
  { code: 'TOY', lat: 36.648, lng: 137.188 },
  { code: 'FSZ', lat: 34.797, lng: 138.187 },
  { code: 'NGO', lat: 34.858, lng: 136.805 },
  { code: 'OKJ', lat: 34.756, lng: 133.855 },
  { code: 'HIJ', lat: 34.436, lng: 132.919 },
  { code: 'YGJ', lat: 35.492, lng: 133.236 },
  { code: 'IZO', lat: 35.414, lng: 132.889 },
  { code: 'TAK', lat: 34.214, lng: 134.016 },
  { code: 'MYJ', lat: 33.827, lng: 132.700 },
  { code: 'KCZ', lat: 33.547, lng: 133.675 },
  { code: 'TKS', lat: 34.132, lng: 134.607 },
  { code: 'FUK', lat: 33.585, lng: 130.451 },
  { code: 'NGS', lat: 32.916, lng: 129.914 },
  { code: 'KMJ', lat: 32.837, lng: 130.855 },
  { code: 'OIT', lat: 33.479, lng: 131.737 },
  { code: 'KMI', lat: 31.877, lng: 131.449 },
  { code: 'KOJ', lat: 31.803, lng: 130.719 },
  { code: 'OKA', lat: 26.196, lng: 127.646 },
  { code: 'MMY', lat: 24.782, lng: 125.295 },
  { code: 'ISG', lat: 24.396, lng: 124.246 },
  { code: 'KUM', lat: 30.386, lng: 130.658 },
  { code: 'ASJ', lat: 28.431, lng: 129.713 },
  { code: 'TNE', lat: 30.605, lng: 130.991 },
  { code: 'TTJ', lat: 35.530, lng: 134.167 },
  { code: 'UBJ', lat: 33.930, lng: 131.279 },
  { code: 'KKJ', lat: 33.845, lng: 131.035 },
  { code: 'HSG', lat: 33.150, lng: 130.302 }
];

for (const [key, city] of Object.entries(CITY_DATA)) {
  CITY_ALIASES[key] = Array.from(new Set([...(CITY_ALIASES[key] || []), key, city.label]));
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseRequest(method, route, body) {
  if (!hasSupabase()) {
    throw new Error('Supabase is not configured');
  }
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method === 'POST') {
    headers.Prefer = 'return=representation,resolution=merge-duplicates';
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase error ${response.status}: ${text}`);
  }
  if (response.status === 204) return [];
  return response.json();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function cityKeyByInput(input) {
  const raw = String(input || '').toLowerCase().trim();
  if (!raw) return 'tokyo';
  if (CITY_DATA[raw]) return raw;
  for (const [key, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.some((alias) => raw.includes(String(alias).toLowerCase()))) return key;
  }
  return 'tokyo';
}

function detectCityKeyByInput(input) {
  const raw = String(input || '').toLowerCase().trim();
  if (!raw) return '';
  if (CITY_DATA[raw]) return raw;
  for (const [key, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.some((alias) => raw.includes(String(alias).toLowerCase()))) return key;
  }
  return '';
}

function cityKeyFromLandmark(text) {
  const raw = String(text || '').toLowerCase();
  for (const [cityKey, words] of Object.entries(LANDMARK_CITY_HINTS)) {
    if (words.some((w) => raw.includes(String(w).toLowerCase()))) return cityKey;
  }
  return '';
}

function cityKeyByAirport(airportCode) {
  const code = String(airportCode || '').toUpperCase().trim();
  if (!code) return '';
  for (const [key, city] of Object.entries(CITY_DATA)) {
    if (String(city.airport || '').toUpperCase() === code) return key;
  }
  return '';
}

function toCustomCityKey(label) {
  const raw = String(label || '').trim();
  if (!raw) return '';
  const hex = Array.from(raw).map((ch) => ch.charCodeAt(0).toString(16)).join('');
  return `custom_${hex.slice(0, 40)}`;
}

function findNearestAirportCode(lat, lng, fallbackCode = 'NRT') {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallbackCode;
  let best = { code: fallbackCode, dist: Number.POSITIVE_INFINITY };
  for (const ap of JAPAN_AIRPORT_COORDS) {
    const dist = haversineKm({ lat, lng }, { lat: ap.lat, lng: ap.lng });
    if (dist < best.dist) best = { code: ap.code, dist };
  }
  return best.code;
}

function extractRequestedLocality(text) {
  const raw = String(text || '');
  if (!raw) return '';
  const nested = raw.match(/의\s*([가-힣A-Za-z]{2,20}?)(?=라는|에서|으로|근처|쪽|\s|$)/);
  if (nested && nested[1]) {
    return nested[1].trim();
  }
  const matches = raw.match(/([가-힣A-Za-z]{2,20})(?:의|에서|으로|근처|쪽)/g) || [];
  const skip = new Set(['일본', '여행', '숙소', '공항', '맛집', '음식', '온천', '쇼핑']);
  for (const m of matches) {
    const token = m.replace(/(?:의|에서|으로|근처|쪽)$/, '').trim();
    if (!token || skip.has(token)) continue;
    return token;
  }
  return '';
}

async function geocodeCityInJapan(cityLabel) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  try {
    const endpoint = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${cityLabel} Japan`)}&key=${GOOGLE_MAPS_API_KEY}&language=ko&region=jp`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = await res.json();
    const first = data.results?.[0];
    if (!first?.geometry?.location) return null;
    return {
      label: cityLabel,
      lat: Number(first.geometry.location.lat),
      lng: Number(first.geometry.location.lng),
      formatted: first.formatted_address || cityLabel
    };
  } catch {
    return null;
  }
}

async function ensureDynamicCityProfile(cityLabel, theme = 'mixed', budget = 'mid', foodKeyword = '', fallbackAirport = 'NRT') {
  const geocoded = await geocodeCityInJapan(cityLabel);
  const key = toCustomCityKey(cityLabel);
  const airportCode = geocoded
    ? findNearestAirportCode(geocoded.lat, geocoded.lng, fallbackAirport || 'NRT')
    : (fallbackAirport || 'NRT');
  let highlights = [];
  let foods = [];
  try {
    const places = await fetchGoogleAttractions(cityLabel, theme);
    highlights = (places || []).slice(0, 10).map((p) => ({
      name: p.displayName?.text || '추천 명소',
      area: p.formattedAddress || cityLabel,
      category: p.primaryType || '관광',
      stayMin: 90,
      bestTime: p.currentOpeningHours?.openNow ? '10:00-12:00' : '13:00-15:00',
      crowdScore: 3
    }));
  } catch {
    highlights = [];
  }
  try {
    if (GOOGLE_MAPS_API_KEY) {
      const places = await fetchFoodPlacesForCity(cityLabel, geocoded?.lat, geocoded?.lng, foodKeyword, budget);
      foods = (places || []).slice(0, 10).map((f) => ({
        name: f.name,
        area: f.address || cityLabel,
        genre: f.genre || foodKeyword || '일식',
        priceLevel: Number(f.priceLevel || 3),
        score: Number(f.score || 3.8),
        tabelogUrl: f.tabelogUrl || 'https://tabelog.com/en/'
      }));
    }
  } catch {
    foods = [];
  }
  if (highlights.length === 0) {
    highlights = [
      { name: `${cityLabel} 중심가`, area: cityLabel, category: '도심 산책', stayMin: 80, bestTime: '10:00-12:00', crowdScore: 3 },
      { name: `${cityLabel} 대표 관광지`, area: cityLabel, category: '관광', stayMin: 100, bestTime: '13:00-15:00', crowdScore: 3 }
    ];
  }
  if (foods.length === 0) {
    foods = [
      { name: `${cityLabel} 로컬 맛집`, area: cityLabel, genre: foodKeyword || '일식', priceLevel: 2, score: 3.8, tabelogUrl: 'https://tabelog.com/en/' }
    ];
  }
  const profile = {
    label: cityLabel,
    airport: airportCode,
    areas: [cityLabel, `${cityLabel} 역`, `${cityLabel} 중심`],
    highlights,
    foods,
    center: geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : null,
    dynamic: true
  };
  CITY_DATA[key] = profile;
  CITY_ALIASES[key] = Array.from(new Set([key, cityLabel]));
  return { key, ...profile };
}

function formatDateISO(date) {
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
}

function parseStartDateFromText(text) {
  const raw = String(text || '');
  const iso = raw.match(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/);
  if (iso) {
    const d = new Date(iso[1]);
    if (!Number.isNaN(d.getTime())) return formatDateISO(d);
  }
  const md = raw.match(/\b(\d{1,2})\s*[\/.-]\s*(\d{1,2})\b/);
  if (md) {
    const now = new Date();
    const year = now.getFullYear();
    const d = new Date(year, Number(md[1]) - 1, Number(md[2]));
    if (!Number.isNaN(d.getTime())) return formatDateISO(d);
  }
  if (/내일/.test(raw)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatDateISO(d);
  }
  if (/모레/.test(raw)) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return formatDateISO(d);
  }
  return '';
}

function parseDaysFromText(text, fallback = 4) {
  const raw = String(text || '');
  const dayMatch = raw.match(/(\d{1,2})\s*일/);
  const nightMatch = raw.match(/(\d{1,2})\s*박/);
  const enDayMatch = raw.match(/(\d{1,2})\s*day/i);
  const enNightMatch = raw.match(/(\d{1,2})\s*night/i);
  if (dayMatch) return clamp(Number(dayMatch[1]), 1, 10);
  if (nightMatch) return clamp(Number(nightMatch[1]) + 1, 1, 10);
  if (enDayMatch) return clamp(Number(enDayMatch[1]), 1, 10);
  if (enNightMatch) return clamp(Number(enNightMatch[1]) + 1, 1, 10);
  return clamp(Number(fallback || 4), 1, 10);
}

function parseThemeFromText(text, fallback = 'mixed') {
  const raw = String(text || '').toLowerCase();
  if (/쇼핑|아울렛|백화점|드럭스토어|구매|shopping|outlet|mall/.test(raw)) return 'shopping';
  if (/자연|온천|트레킹|바다|해변|공원|산|nature|onsen|hiking|beach|park/.test(raw)) return 'nature';
  if (/신사|절|박물관|역사|문화|전통|culture|museum|historic|temple/.test(raw)) return 'culture';
  if (/라멘|스시|교자|먹방|맛집|미식|이자카야|음식|food|restaurant|ramen|sushi|gyoza/.test(raw)) return 'foodie';
  return fallback;
}

function parseBudgetFromText(text, fallback = 'mid') {
  const raw = String(text || '').toLowerCase();
  if (/가성비|저렴|절약|싸게|저예산|cheap|budget|low cost/.test(raw)) return 'low';
  if (/럭셔리|고급|프리미엄|좋은 호텔|5성급|luxury|premium|high end/.test(raw)) return 'high';
  return fallback;
}

function extractAirportCodeFromText(text) {
  const raw = String(text || '').toUpperCase();
  const tokens = raw.match(/\b[A-Z]{3}\b/g) || [];
  for (const code of tokens) {
    if (cityKeyByAirport(code)) return code;
  }
  return '';
}

function extractPreferredAreas(text, cityKey) {
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const raw = String(text || '');
  return city.areas.filter((area) => raw.includes(area)).slice(0, 4);
}

const FOOD_KEYWORDS = [
  '장어덮밥', '장어 덮밥', '히츠마부시', '교자', '라멘', '스시', '오코노미야키', '타코야키',
  '규카츠', '돈카츠', '카레', '우동', '소바', '야키니쿠', '이자카야',
  '카이센동', '짬뽕', '모츠나베', '디저트', '카페'
];

function parseFoodKeywordFromText(text) {
  const raw = String(text || '').toLowerCase();
  for (const keyword of FOOD_KEYWORDS) {
    if (raw.includes(keyword.toLowerCase())) {
      if (keyword === '장어 덮밥') return '장어덮밥';
      return keyword;
    }
  }
  if (/hitsumabushi/i.test(raw)) return '장어덮밥';
  if (/장어|eel|unagi/i.test(raw)) return '장어덮밥';
  if (/ramen/i.test(raw)) return '라멘';
  if (/sushi/i.test(raw)) return '스시';
  return '';
}

function isMeaningfulPlaceKeyword(token) {
  const t = String(token || '').trim();
  if (t.length < 2) return false;
  if (/먹고|싶어|하고|싶|추천|여행|지역|도시|일정|숙소|공항|쇼핑/.test(t)) return false;
  if (/^[0-9]+$/.test(t)) return false;
  return true;
}

function extractWantedPlacesFromMessage(text, cityKey) {
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const hits = [];
  const cityAliasSet = new Set((CITY_ALIASES[cityKey] || []).map((x) => String(x).toLowerCase()));

  city.highlights.forEach((h) => {
    const name = String(h.name || '');
    if (name && lower.includes(name.toLowerCase()) && !hits.includes(name)) {
      hits.push(name);
    }
  });

  const cityWords = LANDMARK_CITY_HINTS[cityKey] || [];
  cityWords.forEach((w) => {
    const word = String(w).trim();
    const lowerWord = word.toLowerCase();
    if (cityAliasSet.has(lowerWord)) return;
    if (word === city.label) return;
    if (lower.includes(lowerWord) && isMeaningfulPlaceKeyword(word) && !hits.includes(word)) {
      hits.push(w);
    }
  });

  matchMustAttractions(raw).forEach((m) => {
    if (!hits.includes(m.name)) hits.unshift(m.name);
  });

  return hits.slice(0, 6);
}

function normalizeWantedPlaceName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (/^(usj|유니버셜|유니버셜\s*스튜디오|universal\s*studios)/i.test(raw)) return '유니버셜 스튜디오 재팬';
  return raw;
}

function buildSyntheticWantedDestinations(wantedPlaces, cityKey) {
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const list = [];
  const seen = new Set();
  for (const wp of wantedPlaces || []) {
    const name = normalizeWantedPlaceName(wp);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const mustMeta = MUST_ATTRACTIONS.find((m) => m.name === name);
    const destCity = mustMeta ? (CITY_DATA[mustMeta.cityKey] || city) : city;
    list.push({
      name,
      city: destCity.label,
      area: mustMeta?.area || destCity.areas?.[0] || destCity.label,
      category: '요청 명소',
      bestTime: '10:00-17:00',
      stayMin: 120,
      mapUrl: mapUrl(`${name} ${destCity.label}`),
      aiScore: 99
    });
  }
  return list.slice(0, 4);
}

function parseTravelChatInput(payload = {}) {
  const message = String(payload.message || '').trim();
  const context = payload.context || {};
  const locality = extractRequestedLocality(message);
  const fallbackCity = cityKeyByInput(context.city || 'tokyo');
  const airportInText = extractAirportCodeFromText(message);
  const cityFromAirport = cityKeyByAirport(airportInText);
  const cityFromLocalityMap = locality ? (LOCALITY_PARENT_CITY_MAP[locality] || '') : '';
  const cityFromLandmark = cityKeyFromLandmark(locality || message);
  const cityFromText = detectCityKeyByInput(locality || message);
  const cityKey = cityFromAirport || cityFromLocalityMap || cityFromLandmark || cityFromText || fallbackCity;
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const explicitLocality = Boolean(locality) && new RegExp(`${locality}\\s*라는`).test(message);
  const localityMappedCity = locality ? (LOCALITY_PARENT_CITY_MAP[locality] || cityKeyFromLandmark(locality)) : '';
  const useLocalityAsCity = Boolean(locality) && (explicitLocality || !localityMappedCity);
  const cityLabel = useLocalityAsCity ? locality : city.label;
  const rawWantedPlaces = extractWantedPlacesFromMessage(message, cityKey);
  const wantedPlaces = rawWantedPlaces.filter((name) => {
    const n = String(name || '').trim();
    if (!n) return false;
    if (n === city.label) return false;
    if (locality && n === locality) return false;
    return true;
  });

  const parsed = {
    cityKey,
    cityLabel,
    arrivalAirport: city.airport,
    theme: parseThemeFromText(message, context.theme || 'mixed'),
    budget: parseBudgetFromText(message, context.budget || 'mid'),
    days: parseDaysFromText(message, context.days || 4),
    startDate: parseStartDateFromText(message) || context.startDate || new Date().toISOString().slice(0, 10),
    preferredAreas: extractPreferredAreas(message, cityKey),
    preferAirportAccess: /공항.*가깝|이동.*편|교통.*좋|환승.*적|접근성|airport.*access|easy.*move|easy.*transport|near.*airport/i.test(message),
    wantedPlaces,
    foodKeyword: parseFoodKeywordFromText(message)
  };

  if (airportInText) parsed.arrivalAirport = airportInText;
  if (!airportInText && useLocalityAsCity && DYNAMIC_LOCALITY_AIRPORT_HINT[cityLabel]) {
    parsed.arrivalAirport = DYNAMIC_LOCALITY_AIRPORT_HINT[cityLabel];
  }
  return parsed;
}

function buildTravelChatReply(parsed) {
  const lines = [];
  lines.push(`${parsed.cityLabel}로 여행 지역을 맞췄어요.`);
  if (parsed.foodKeyword) {
    lines.push(`맛집은 "${parsed.foodKeyword}" 중심으로 검색되도록 반영했어요.`);
  }
  if (parsed.theme === 'shopping') {
    lines.push('일정 테마는 쇼핑 중심으로 변경했어요.');
  }
  if (parsed.preferredAreas.length > 0) {
    lines.push(`숙소는 ${parsed.preferredAreas.join(', ')} 근처를 우선 추천할게요.`);
  } else if (parsed.preferAirportAccess) {
    lines.push('숙소는 공항 이동이 편한 옵션을 우선 추천할게요.');
  }
  lines.push('이제 추천 여행지/일정/숙소를 새로 생성합니다.');
  return lines.join('\n');
}

function safeDateText(value, fallback) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fallback;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return fallback;
  return formatDateISO(d);
}

function normalizeTravelChatParsed(candidate, fallback) {
  const raw = candidate || {};
  const rawCityText = String(raw.cityKey || raw.cityLabel || fallback.cityLabel || fallback.cityKey || '').trim();
  const detectedCityKey = detectCityKeyByInput(rawCityText) || detectCityKeyByInput(raw.cityKey) || '';
  const resolvedCityKey = detectedCityKey || fallback.cityKey;
  const city = CITY_DATA[resolvedCityKey] || CITY_DATA[fallback.cityKey] || CITY_DATA.tokyo;

  const theme = ['mixed', 'foodie', 'culture', 'shopping', 'nature'].includes(raw.theme)
    ? raw.theme
    : fallback.theme;
  const budget = ['low', 'mid', 'high'].includes(raw.budget)
    ? raw.budget
    : fallback.budget;

  const airportCode = String(raw.arrivalAirport || city.airport || fallback.arrivalAirport).toUpperCase().trim();
  const cityByAirport = cityKeyByAirport(airportCode);
  const finalCityKey = cityByAirport || resolvedCityKey;
  const finalCity = CITY_DATA[finalCityKey] || city;
  const arrivalAirport = cityByAirport ? airportCode : finalCity.airport;
  const preferredLabel = String(raw.cityLabel || '').trim();
  const cityLabel = preferredLabel || fallback.cityLabel || finalCity.label;

  const preferredAreas = Array.isArray(raw.preferredAreas)
    ? raw.preferredAreas.map((x) => String(x).trim()).filter((x) => x && finalCity.areas.some((a) => x.includes(a) || a.includes(x))).slice(0, 4)
    : fallback.preferredAreas;
  const wantedPlaces = Array.isArray(raw.wantedPlaces)
    ? raw.wantedPlaces.map((x) => String(x).trim()).filter((x) => isMeaningfulPlaceKeyword(x)).slice(0, 8)
    : fallback.wantedPlaces;
  const foodKeyword = String(raw.foodKeyword || fallback.foodKeyword || '').trim();
  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
    : [];

  return {
    cityKey: finalCityKey,
    cityLabel,
    arrivalAirport,
    theme,
    budget,
    days: clamp(Number(raw.days || fallback.days || 4), 1, 10),
    startDate: safeDateText(raw.startDate, fallback.startDate || new Date().toISOString().slice(0, 10)),
    preferredAreas,
    preferAirportAccess: Boolean(raw.preferAirportAccess),
    wantedPlaces,
    foodKeyword,
    reasons
  };
}

async function parseTravelChatWithOpenAI(message, context) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
  const system = [
    'You parse travel chat input into structured JSON.',
    'Target country is Japan, region should map to a city in the provided list.',
    'Split user intent by type: destination(city), food preference, travel theme.',
    'Never convert generic words like "먹고싶어" or "쇼핑" into place names.',
    'Prefer airport-centric city selection.',
    'Return only JSON matching schema.'
  ].join(' ');
  const body = {
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: system }]
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: JSON.stringify({ message, context, availableCities: Object.entries(CITY_DATA).map(([k, v]) => ({ key: k, label: v.label, airport: v.airport, areas: v.areas })) }) }]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'travel_chat_parser',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cityKey: { type: 'string' },
            cityLabel: { type: 'string' },
            arrivalAirport: { type: 'string' },
            theme: { type: 'string' },
            budget: { type: 'string' },
            days: { type: 'integer' },
            startDate: { type: 'string' },
            preferredAreas: { type: 'array', items: { type: 'string' } },
            preferAirportAccess: { type: 'boolean' },
            wantedPlaces: { type: 'array', items: { type: 'string' } },
            foodKeyword: { type: 'string' },
            reasons: { type: 'array', items: { type: 'string' } }
          },
          required: ['cityKey', 'arrivalAirport', 'theme', 'budget', 'days', 'startDate', 'preferredAreas', 'preferAirportAccess', 'wantedPlaces', 'foodKeyword', 'reasons']
        },
        strict: true
      }
    }
  };
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  const parsed = parseJsonFromText(extractOpenAiText(data));
  if (!parsed) throw new Error('OpenAI parser returned unexpected format');
  return parsed;
}

async function parseTravelChatWithGemini(message, context) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  const prompt = [
    'Parse the travel chat into JSON only.',
    'Country is Japan and must map to one city key from availableCities.',
    'Split intent into city/food/theme.',
    'Do not treat generic request words as place names.',
    'Use airport-centric destination logic.',
    'Do not return markdown.',
    JSON.stringify({
      message,
      context,
      availableCities: Object.entries(CITY_DATA).map(([k, v]) => ({ key: k, label: v.label, airport: v.airport, areas: v.areas }))
    })
  ].join('\n');
  const body = {
    prompt: { text: prompt },
    temperature: 0.2,
    maxOutputTokens: 700,
    topP: 0.9,
    candidateCount: 1
  };
  const url = `${GEMINI_ENDPOINT}/${GEMINI_API_MODEL}:generateText`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GEMINI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const text = candidate?.output
    || (Array.isArray(candidate?.content) ? candidate.content.map((c) => c?.text || '').join(' ') : '')
    || '';
  const parsed = parseJsonFromText(text);
  if (!parsed) throw new Error('Gemini parser returned unexpected format');
  return parsed;
}

async function buildTravelChatPlan(payload = {}) {
  const fallback = parseTravelChatInput(payload);
  let parsed = null;
  let source = 'rule_based';
  let aiNote = '';

  if (USE_GEMINI) {
    try {
      const geminiParsed = await parseTravelChatWithGemini(payload.message, payload.context || {});
      parsed = normalizeTravelChatParsed(geminiParsed, fallback);
      source = 'gemini_chat_parser_v1';
    } catch (err) {
      aiNote = `Gemini: ${err.message}`;
    }
  }

  if (!parsed && OPENAI_API_KEY) {
    try {
      const openaiParsed = await parseTravelChatWithOpenAI(payload.message, payload.context || {});
      parsed = normalizeTravelChatParsed(openaiParsed, fallback);
      source = 'openai_chat_parser_v1';
    } catch (err) {
      aiNote = aiNote ? `${aiNote}; OpenAI: ${err.message}` : `OpenAI: ${err.message}`;
    }
  }

  if (!parsed) {
    if (CHAT_PARSE_STRICT_AI) {
      throw new Error(aiNote || 'AI chat parser is unavailable');
    }
    parsed = fallback;
  }

  let cityMeta = null;
  const knownByLabel = detectCityKeyByInput(parsed.cityLabel);
  if (!knownByLabel && parsed.cityLabel && parsed.cityLabel !== (CITY_DATA[parsed.cityKey]?.label || '')) {
    try {
      cityMeta = await ensureDynamicCityProfile(parsed.cityLabel, parsed.theme, parsed.budget, parsed.foodKeyword, parsed.arrivalAirport);
    } catch {
      cityMeta = null;
    }
    if (cityMeta) {
      parsed.cityKey = cityMeta.key;
      parsed.cityLabel = cityMeta.label;
      parsed.arrivalAirport = cityMeta.airport;
    }
  } else {
    const city = CITY_DATA[parsed.cityKey] || CITY_DATA.tokyo;
    cityMeta = { key: parsed.cityKey, label: city.label, airport: city.airport, dynamic: false };
  }

  const rec = await recommendDestinations({
    city: parsed.cityKey,
    theme: parsed.theme,
    budget: parsed.budget,
    pace: 'normal',
    limit: Math.max(8, Math.min(14, parsed.days * 2))
  });

  let selectedDestinations = [];
  if (parsed.wantedPlaces.length > 0) {
    const wantTokens = parsed.wantedPlaces.map((x) => String(x).toLowerCase());
    selectedDestinations = rec.picks.filter((p) => wantTokens.some((token) => `${p.name} ${p.area}`.toLowerCase().includes(token))).slice(0, 6);
  }
  if (selectedDestinations.length === 0 && parsed.preferredAreas.length > 0) {
    selectedDestinations = rec.picks.filter((p) => parsed.preferredAreas.some((a) => String(p.area || '').includes(a))).slice(0, 6);
  }
  if (parsed.wantedPlaces.length > 0) {
    const synthetic = buildSyntheticWantedDestinations(parsed.wantedPlaces, parsed.cityKey);
    const mergedTop = [...synthetic, ...selectedDestinations];
    const seen = new Set();
    selectedDestinations = mergedTop.map((x) => ({ ...x, name: normalizeWantedPlaceName(x.name) || x.name })).filter((x) => {
      const key = String(x.name || '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }

  const reasons = [
    ...(Array.isArray(parsed.reasons) ? parsed.reasons : []),
    `도시/공항 매핑: ${parsed.cityLabel} - ${parsed.arrivalAirport}`,
    parsed.preferredAreas.length ? `숙소 우선 지역 반영: ${parsed.preferredAreas.join(', ')}` : '숙소 우선 지역 미지정: 중심 접근성 기준',
    parsed.preferAirportAccess ? '공항 접근성 선호 반영(공항 셔틀/이동 편의 가점)' : '공항 접근성 기본값 적용'
  ].slice(0, 6);

  return {
    parsed: { ...parsed, reasons },
    selectedDestinations,
    reply: buildTravelChatReply(parsed),
    cityMeta,
    uiActions: {
      foodCity: parsed.cityKey,
      foodGenre: parsed.foodKeyword || '',
      theme: parsed.theme
    },
    source,
    aiNote
  };
}

function mapUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getDateOffset(startDate, offset) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function themeScore(theme, place) {
  const t = String(theme || 'mixed').toLowerCase();
  if (t === 'foodie') return place.category.includes('미식') ? 2 : 0;
  if (t === 'culture') return place.category.includes('문화') ? 2 : 0;
  if (t === 'shopping') return place.category.includes('쇼핑') ? 2 : 0;
  if (t === 'nature') return place.category.includes('자연') ? 2 : 0;
  return 1;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function haversineKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2), Math.sqrt(1 - (s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2)));
  return R * c;
}

function categoryFit(theme, typeText) {
  const t = String(theme || 'mixed').toLowerCase();
  const type = String(typeText || '').toLowerCase();
  if (t === 'foodie') return type.includes('restaurant') || type.includes('food') || type.includes('market') ? 1 : 0.55;
  if (t === 'culture') return type.includes('museum') || type.includes('temple') || type.includes('church') || type.includes('shrine') || type.includes('historical') ? 1 : 0.55;
  if (t === 'shopping') return type.includes('shopping') || type.includes('store') || type.includes('mall') ? 1 : 0.55;
  if (t === 'nature') return type.includes('park') || type.includes('garden') || type.includes('beach') || type.includes('mountain') ? 1 : 0.55;
  return 0.75;
}

function budgetFit(budget, typeText) {
  const b = String(budget || 'mid').toLowerCase();
  const type = String(typeText || '').toLowerCase();
  const expensive = type.includes('shopping_mall') || type.includes('amusement_park');
  if (b === 'low') return expensive ? 0.6 : 0.95;
  if (b === 'high') return expensive ? 1 : 0.85;
  return 0.9;
}

function congestionPenalty(userRatingCount, openNow) {
  const popularity = clamp(Math.log1p(Number(userRatingCount || 0)) / Math.log1p(5000), 0, 1);
  const peakHour = new Date().getHours() >= 12 && new Date().getHours() <= 19;
  const base = peakHour ? popularity * 0.3 : popularity * 0.2;
  const closedPenalty = openNow === false ? 0.2 : 0;
  return clamp(base + closedPenalty, 0, 0.45);
}

async function fetchGoogleCityCenter(cityLabel) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const endpoint = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cityLabel + ' Japan')}&key=${GOOGLE_MAPS_API_KEY}`;
  const response = await fetch(endpoint);
  if (!response.ok) return null;
  const data = await response.json();
  const loc = data.results?.[0]?.geometry?.location;
  return loc ? { lat: Number(loc.lat), lng: Number(loc.lng) } : null;
}

async function fetchGoogleAttractions(cityLabel, theme) {
  if (!GOOGLE_MAPS_API_KEY) return [];
  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  const themeHint = theme === 'foodie' ? '맛집 명소' : theme === 'culture' ? '역사 문화 명소' : theme === 'shopping' ? '쇼핑 명소' : theme === 'nature' ? '자연 공원 명소' : '인기 관광지';
  const queries = [
    `${cityLabel} ${themeHint}`,
    `${cityLabel} 인기 관광지`
  ];

  const results = await Promise.all(queries.map(async (q) => {
    const body = { textQuery: q, maxResultCount: 12, languageCode: 'ko', regionCode: 'JP' };
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType,places.currentOpeningHours.openNow,places.location'
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data.places || [];
  }));

  const merged = results.flat();
  const uniq = new Map();
  for (const p of merged) {
    const key = p.id || p.displayName?.text;
    if (!key || uniq.has(key)) continue;
    uniq.set(key, p);
  }
  return Array.from(uniq.values());
}

function scoreExternalPlace(place, ctx) {
  const rating = Number(place.rating || 0);
  const reviewCount = Number(place.userRatingCount || 0);
  const reviewScore = clamp(Math.log1p(reviewCount) / Math.log1p(5000), 0, 1);
  const ratingScore = clamp(rating / 5, 0, 1);
  const recentnessScore = clamp(0.35 + reviewScore * 0.65, 0, 1);
  const preferenceScore = categoryFit(ctx.theme, place.primaryType);
  const budgetScore = budgetFit(ctx.budget, place.primaryType);
  const centerDistKm = ctx.center && place.location ? haversineKm(ctx.center, { lat: place.location.latitude, lng: place.location.longitude }) : 5;
  const mobilityScore = clamp(1 - (centerDistKm / 20), 0.1, 1);
  const congestion = congestionPenalty(reviewCount, place.currentOpeningHours?.openNow);
  const composite = (
    ratingScore * 0.23 +
    reviewScore * 0.17 +
    recentnessScore * 0.14 +
    preferenceScore * 0.21 +
    budgetScore * 0.08 +
    mobilityScore * 0.17
  ) * 100;

  return Math.round(clamp(composite - (congestion * 30), 0, 100));
}

async function recommendDestinations(payload) {
  const key = cityKeyByInput(payload.city);
  const city = CITY_DATA[key];
  const theme = payload.theme || 'mixed';
  const pace = payload.pace || 'normal';
  const budget = payload.budget || 'mid';
  const max = Math.max(6, Math.min(14, Number(payload.limit) || 10));

  if (GOOGLE_MAPS_API_KEY) {
    try {
      const [center, places] = await Promise.all([
        fetchGoogleCityCenter(city.label),
        fetchGoogleAttractions(city.label, theme)
      ]);
      if (places.length > 0) {
        const scored = places
          .map((p) => ({
            name: p.displayName?.text || '이름 없음',
            city: city.label,
            category: p.primaryType || '관광',
            area: p.formattedAddress || city.label,
            stayMin: 90,
            bestTime: p.currentOpeningHours?.openNow ? '10:00-12:00' : '13:00-15:00',
            crowdScore: 3,
            mapUrl: p.googleMapsUri || mapUrl(`${p.displayName?.text || city.label} ${city.label}`),
            aiScore: scoreExternalPlace(p, { theme, budget, center }),
            rating: p.rating || null,
            reviewCount: p.userRatingCount || 0
          }))
          .sort((a, b) => b.aiScore - a.aiScore)
          .slice(0, max);

        return {
          source: 'external_google_places_ai_scored',
          city: city.label,
          theme,
          pace,
          budget,
          summary: `${city.label} 여행지 추천 ${scored.length}곳`,
          picks: scored
        };
      }
    } catch {
      // fallback to local curated data
    }
  }

  const scored = city.highlights
    .map((p) => ({
      ...p,
      city: city.label,
      aiScore: 70 + themeScore(theme, p) * 10 - p.crowdScore * 2,
      mapUrl: mapUrl(`${p.name} ${city.label}`)
    }))
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, max);

  return {
    source: 'local_curated_fallback',
    city: city.label,
    theme,
    pace,
    budget,
    summary: `${city.label} 여행지 추천 ${scored.length}곳`,
    picks: scored
  };
}

function createItinerary(payload) {
  const key = cityKeyByInput(payload.city);
  const city = CITY_DATA[key] || CITY_DATA.tokyo;
  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));
  const flight = payload.flight || null;
  const flightLegs = Array.isArray(flight?.legs) ? flight.legs : [];
  const outbound = flightLegs[0];
  const inbound = flightLegs.length > 1 ? flightLegs[flightLegs.length - 1] : null;
  const flightStartDate = outbound?.date;
  const startDate = flightStartDate || payload.startDate || new Date().toISOString().slice(0, 10);
  const theme = payload.theme || 'mixed';
  const picks = Array.isArray(payload._picks) && payload._picks.length > 0
    ? payload._picks
    : city.highlights.map((p) => ({ ...p, city: city.label, mapUrl: mapUrl(`${p.name} ${city.label}`), aiScore: 65 }));

  const formatMinutes = (value) => {
    const safe = Math.max(0, Math.min(1439, Math.round(Number(value) || 0)));
    const h = String(Math.floor(safe / 60)).padStart(2, '0');
    const m = String(safe % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  const formatRange = (range) => `${formatMinutes(range[0])}-${formatMinutes(range[1])}`;

  const clampRange = (range, minStart, maxEnd) => {
    const start = Math.max(range[0], minStart);
    const end = Math.min(range[1], maxEnd);
    if (end - start < 30) return null;
    return [start, end];
  };

  const startHour = (timeRange) => {
    const m = /^(\d{1,2}):/.exec(String(timeRange || ''));
    return m ? Number(m[1]) : 12;
  };

  const morningPool = picks.filter((p) => startHour(p.bestTime) < 12);
  const afternoonPool = picks.filter((p) => startHour(p.bestTime) >= 12 && startHour(p.bestTime) < 18);
  const fallbackPool = picks;
  const foods = city.foods || [];

  const baseRanges = {
    morning: [8 * 60 + 30, 11 * 60 + 30],
    afternoon: [13 * 60, 17 * 60],
    evening: [18 * 60, 20 * 60]
  };

  const day1MinStart = outbound?.arrivalTime ? toMinutes(outbound.arrivalTime) + 90 : null;
  const lastDayMaxEnd = inbound?.departureTime ? toMinutes(inbound.departureTime) - 120 : null;

  const itinerary = [];
  for (let i = 0; i < days; i += 1) {
    const a = (morningPool[i % Math.max(1, morningPool.length)]) || fallbackPool[(i * 2) % fallbackPool.length];
    const b = (afternoonPool[i % Math.max(1, afternoonPool.length)]) || fallbackPool[(i * 2 + 1) % fallbackPool.length];
    const dinner = foods[i % Math.max(1, foods.length)];
    const minStart = (i === 0 && Number.isFinite(day1MinStart)) ? day1MinStart : 0;
    const maxEnd = (i === days - 1 && Number.isFinite(lastDayMaxEnd)) ? lastDayMaxEnd : (24 * 60);
    const blocks = [];
    const morningRange = clampRange(baseRanges.morning, minStart, maxEnd);
    if (morningRange) blocks.push(`오전(${formatRange(morningRange)}): ${a.name} (${a.bestTime})`);
    const afternoonRange = clampRange(baseRanges.afternoon, minStart, maxEnd);
    if (afternoonRange) blocks.push(`오후(${formatRange(afternoonRange)}): ${b.name} (${b.bestTime})`);
    const dinnerText = dinner ? `${dinner.name} (${dinner.genre})` : `${city.areas[i % city.areas.length]} 로컬 미식 동선`;
    const eveningRange = clampRange(baseRanges.evening, minStart, maxEnd);
    if (eveningRange) blocks.push(`저녁(${formatRange(eveningRange)}): ${dinnerText}`);

    if (blocks.length === 0) {
      if (i === 0 && Number.isFinite(day1MinStart)) {
        const start = Math.max(day1MinStart, 18 * 60);
        const end = Math.min(20 * 60 + 30, maxEnd);
        if (end > start) {
          blocks.push(`저녁(${formatRange([start, end])}): ${dinnerText}`);
        } else {
          blocks.push('도착 후 이동/체크인 및 휴식');
        }
      } else if (i === days - 1 && Number.isFinite(lastDayMaxEnd)) {
        const end = Math.min(lastDayMaxEnd, 11 * 60);
        if (end > (8 * 60)) {
          blocks.push(`오전(${formatRange([8 * 60 + 30, end])}): 체크아웃 & 공항 이동`);
        } else {
          blocks.push('출국 준비 및 공항 이동');
        }
      } else {
        blocks.push('자유 일정');
      }
    }

    itinerary.push({
      day: i + 1,
      date: getDateOffset(startDate, i),
      blocks
    });
  }

  const tips = [
    '첫날은 공항-도심 이동 시간을 최소 2시간 확보',
    '핫플은 오픈 직후 또는 20시 이후 방문 추천',
    '하루 도보 18,000보 이상이면 다음날 오전 일정 완화 권장'
  ];

  if (outbound?.arrivalTime) {
    tips.unshift(`도착 ${outbound.arrivalTime} + 이동시간 90분 기준으로 첫날 일정 시작`);
  }
  if (inbound?.departureTime) {
    tips.unshift(`출국 ${inbound.departureTime} 2시간 전 공항 도착 기준으로 마지막날 조정`);
  }

  return {
    source: 'ai_planner_v1',
    city: city.label,
    theme,
    summary: `${city.label} ${days}일 맞춤 일정${flightLegs.length ? ' (항공권 시간 반영)' : ''}`,
    itinerary,
    tips
  };
}

function buildAiContext(payload, picks, city) {
  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));
  const startDate = payload.startDate || new Date().toISOString().slice(0, 10);
  return {
    city: city.label,
    theme: payload.theme || 'mixed',
    budget: payload.budget || 'mid',
    pace: payload.pace || 'normal',
    days,
    startDate,
    picks: (picks || []).slice(0, 12).map((p) => ({
      name: p.name,
      area: p.area,
      category: p.category,
      bestTime: p.bestTime,
      stayMin: p.stayMin
    })),
    foods: (city.foods || []).slice(0, 8).map((f) => ({
      name: f.name,
      area: f.area,
      genre: f.genre
    })),
    flight: payload.flight || null,
    stay: payload.stay || null
  };
}

function parseJsonFromText(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  const startIndex = trimmed.indexOf('{');
  const endIndex = trimmed.lastIndexOf('}');
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return null;
  const candidate = trimmed.slice(startIndex, endIndex + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeSelectedDestination(pick, cityLabel) {
  if (!pick) return null;
  const name = String(pick.name || pick.label || '').trim();
  if (!name) return null;
  return {
    name,
    city: pick.city || cityLabel,
    area: pick.area || pick.city || cityLabel,
    category: pick.category || '추천 여행지',
    bestTime: pick.bestTime || '09:00-17:00',
    stayMin: Math.max(30, Number(pick.stayMin) || 90),
    aiScore: 99
  };
}

function mergeSelectedDestinations(userPicks, basePicks, cityLabel) {
  const normalized = (Array.isArray(userPicks) ? userPicks : [])
    .map((pick) => normalizeSelectedDestination(pick, cityLabel))
    .filter(Boolean);
  if (!normalized.length) return basePicks;
  const seen = new Set();
  const merged = [];
  normalized.forEach((pick) => {
    if (!seen.has(pick.name)) {
      seen.add(pick.name);
      merged.push(pick);
    }
  });
  for (const pick of basePicks) {
    if (seen.has(pick.name)) continue;
    seen.add(pick.name);
    merged.push(pick);
  }
  const limit = basePicks.length || merged.length;
  return merged.slice(0, limit || merged.length);
}

function extractOpenAiText(data) {
  if (!data) return '';
  if (typeof data.output_text === 'string') return data.output_text;
  const outputs = Array.isArray(data.output) ? data.output : [];
  const texts = [];
  outputs.forEach((item) => {
    if (item.type === 'output_text' && item.text) texts.push(item.text);
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((c) => {
      if (c.type === 'output_text' && c.text) texts.push(c.text);
      if (c.type === 'text' && c.text) texts.push(c.text);
    });
  });
  return texts.join('\n').trim();
}

async function createItineraryWithOpenAI(payload, picks) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
  const key = cityKeyByInput(payload.city);
  const city = CITY_DATA[key] || CITY_DATA.tokyo;
  const ctx = buildAiContext(payload, picks, city);

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      itinerary: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            day: { type: 'integer' },
            date: { type: 'string' },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  start: { type: 'string' },
                  end: { type: 'string' },
                  title: { type: 'string' },
                  location: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } }
                },
                required: ['start', 'end', 'title']
              }
            }
          },
          required: ['day', 'date', 'blocks']
        }
      },
      tips: { type: 'array', items: { type: 'string' } }
    },
    required: ['summary', 'itinerary', 'tips']
  };

  const system = AI_SYSTEM_MESSAGE;

  const body = {
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: system }]
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: JSON.stringify(ctx) }]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'itinerary',
        schema,
        strict: true
      }
    }
  };

  let json = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      lastError = new Error(`OpenAI error: ${res.status}`);
      continue;
    }
    const data = await res.json();
    const text = extractOpenAiText(data);
    const parsed = parseJsonFromText(text);
    if (parsed) {
      json = parsed;
      lastError = null;
      break;
    }
    lastError = new Error('OpenAI returned unexpected format');
  }
  if (!json) throw lastError || new Error('OpenAI parse error');

  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));
  if (!Array.isArray(json.itinerary) || json.itinerary.length === 0) {
    throw new Error('OpenAI returned empty itinerary');
  }
  const normalized = json.itinerary.slice(0, days).map((d, idx) => ({
    day: Number(d.day || (idx + 1)),
    date: d.date || getDateOffset(payload.startDate || new Date().toISOString().slice(0, 10), idx),
    blocks: Array.isArray(d.blocks) ? d.blocks : []
  }));

  return {
    source: 'openai_itinerary_v1',
    city: city.label,
    theme: payload.theme || 'mixed',
    summary: json.summary || `${city.label} ${days}일 AI 일정`,
    itinerary: normalized,
    tips: Array.isArray(json.tips) ? json.tips : []
  };
}

async function createItineraryWithGemini(payload, picks) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  const key = cityKeyByInput(payload.city);
  const city = CITY_DATA[key] || CITY_DATA.tokyo;
  const ctx = buildAiContext(payload, picks, city);
  const prompt = `${AI_SYSTEM_MESSAGE}\nContext:\n${JSON.stringify(ctx, null, 2)}\nRespond with only JSON that matches the schema.`;

  const body = {
    prompt: { text: prompt },
    temperature: 0.28,
    maxOutputTokens: 900,
    topP: 0.9,
    candidateCount: 1
  };

  const url = `${GEMINI_ENDPOINT}/${GEMINI_API_MODEL}:generateText`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GEMINI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  let text = '';
  if (candidate?.output) {
    text = candidate.output;
  } else if (Array.isArray(candidate?.content)) {
    text = candidate.content.map((c) => c?.text || '').join(' ').trim();
  } else if (typeof data?.output === 'string') {
    text = data.output;
  }
  const json = parseJsonFromText(text);
  if (!json) {
    throw new Error('Gemini returned unexpected format');
  }
  const days = Math.max(1, Math.min(10, Number(payload.days) || 3));
  if (!Array.isArray(json.itinerary) || json.itinerary.length === 0) {
    throw new Error('Gemini returned empty itinerary');
  }
  const normalized = json.itinerary.slice(0, days).map((d, idx) => ({
    day: Number(d.day || (idx + 1)),
    date: d.date || getDateOffset(payload.startDate || new Date().toISOString().slice(0, 10), idx),
    blocks: Array.isArray(d.blocks) ? d.blocks : []
  }));

  return {
    source: 'gemini_itinerary_v1',
    city: city.label,
    theme: payload.theme || 'mixed',
    summary: json.summary || `${city.label} ${days}일 AI 일정 (Gemini)`,
    itinerary: normalized,
    tips: Array.isArray(json.tips) ? json.tips : []
  };
}

async function buildTravelPlan(payload) {
  const key = cityKeyByInput(payload.city);
  const rec = await recommendDestinations({
    city: key,
    theme: payload.theme,
    pace: payload.pace,
    budget: payload.budget,
    limit: Math.max(6, Math.min(12, Number(payload.days || 3) * 2))
  });
  const cityLabel = rec.city || '';
  const mergedPicks = mergeSelectedDestinations(payload._picks, rec.picks, cityLabel);
  rec.picks = mergedPicks;
  const picksForItinerary = mergedPicks.length ? mergedPicks : rec.picks;
  let it;
  let aiNote = '';
  if (payload.useAi) {
    if (USE_GEMINI) {
      try {
        it = await createItineraryWithGemini({ ...payload, city: key, _picks: picksForItinerary }, picksForItinerary);
      } catch (err) {
        aiNote = `Gemini: ${err.message}`;
      }
    }
    if (!it && OPENAI_API_KEY) {
      try {
        it = await createItineraryWithOpenAI({ ...payload, city: key, _picks: picksForItinerary }, picksForItinerary);
      } catch (err) {
        aiNote = aiNote ? `${aiNote}; OpenAI: ${err.message}` : err.message;
      }
    }
  }
  if (!it) {
    it = createItinerary({ ...payload, city: key, _picks: picksForItinerary });
  }
  return {
    source: 'integrated_travel_planner_v1',
    city: rec.city,
    recommendationSource: rec.source || 'unknown',
    recommendations: rec.picks,
    itinerary: it.itinerary,
    itinerarySource: it.source,
    tips: it.tips,
    summary: `${rec.city} 추천 ${rec.picks.length}곳 + ${it.itinerary.length}일 일정`,
    aiNote
  };
}

function toDateKey(dateLike) {
  return String(dateLike || '').replace(/-/g, '');
}

function buildFlightDeeplink(provider, tripType, legs) {
  const safeProvider = provider === 'KAYAK' ? 'KAYAK' : 'Skyscanner';
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (!first) return '';

  if (safeProvider === 'KAYAK') {
    if (tripType === 'roundtrip' && legs.length >= 2) {
      return `https://www.kayak.co.kr/flights/${first.from}-${first.to}/${first.date}/${last.date}`;
    }
    if (tripType === 'multicity' && legs.length >= 2) {
      const path = legs.map((l) => `${l.from}-${l.to}/${l.date}`).join('/');
      return `https://www.kayak.co.kr/flights/${path}`;
    }
    return `https://www.kayak.co.kr/flights/${first.from}-${first.to}/${first.date}`;
  }

  if (tripType === 'multicity' && legs.length >= 2) {
    const path = legs.map((l) => `${l.from}-${l.to}/${l.date}`).join('/');
    return `https://www.kayak.co.kr/flights/${path}`;
  }

  // Skyscanner (KR)
  if (tripType === 'roundtrip' && legs.length >= 2) {
    return `https://www.skyscanner.co.kr/transport/flights/${first.from.toLowerCase()}/${first.to.toLowerCase()}/${toDateKey(first.date)}/${toDateKey(last.date)}/`;
  }
  return `https://www.skyscanner.co.kr/transport/flights/${first.from.toLowerCase()}/${first.to.toLowerCase()}/${toDateKey(first.date)}/`;
}

function buildFlightDeeplinks(tripType, legs) {
  return {
    kayak: buildFlightDeeplink('KAYAK', tripType, legs),
    skyscanner: buildFlightDeeplink('Skyscanner', tripType, legs)
  };
}

function toMinutes(timeText) {
  const [h, m] = String(timeText || '00:00').split(':').map(Number);
  return (h * 60) + (m || 0);
}

function parseIsoDurationToMinutes(value) {
  const text = String(value || '').toUpperCase();
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(text);
  if (!m) return 0;
  return (Number(m[1] || 0) * 60) + Number(m[2] || 0);
}

function isoToDateTimeParts(value) {
  const raw = String(value || '');
  if (!raw.includes('T')) return { date: raw.slice(0, 10), time: raw.slice(11, 16) };
  return { date: raw.slice(0, 10), time: raw.slice(11, 16) };
}

function convertToKRW(amount, currency) {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) return 0;
  const cur = String(currency || 'KRW').toUpperCase();
  if (cur === 'KRW') return num;
  if (cur === 'USD') return num * fxUsdKrw;
  return num;
}

function buildLegCandidates(leg, index) {
  const airlines = ['Korean Air', 'Asiana', 'Jin Air', 'Peach', 'ANA'];
  const providers = ['Skyscanner', 'KAYAK', 'Skyscanner', 'KAYAK', 'Skyscanner'];
  const bases = [
    { departureTime: '08:35', durationMin: 140, stops: 0, priceKRW: 355000 },
    { departureTime: '10:20', durationMin: 150, stops: 0, priceKRW: 325000 },
    { departureTime: '13:55', durationMin: 170, stops: 0, priceKRW: 298000 },
    { departureTime: '17:40', durationMin: 235, stops: 1, priceKRW: 262000 },
    { departureTime: '21:10', durationMin: 165, stops: 0, priceKRW: 341000 }
  ];

  return bases.map((b, i) => ({
    legIndex: index,
    provider: providers[i],
    airline: airlines[i],
    from: leg.from,
    to: leg.to,
    date: leg.date,
    departureTime: b.departureTime,
    durationMin: b.durationMin,
    arrivalTime: `${String(Math.floor((toMinutes(b.departureTime) + b.durationMin) / 60) % 24).padStart(2, '0')}:${String((toMinutes(b.departureTime) + b.durationMin) % 60).padStart(2, '0')}`,
    stops: b.stops,
    priceKRW: b.priceKRW + (index * 18000),
    deeplink: providers[i] === 'KAYAK'
      ? `https://www.kayak.com/flights/${leg.from}-${leg.to}/${leg.date}`
      : `https://www.skyscanner.co.kr/transport/flights/${leg.from.toLowerCase()}/${leg.to.toLowerCase()}/${toDateKey(leg.date)}/`
  }));
}

function flightCandidates(payload) {
  const from = (payload.from || 'ICN').toUpperCase();
  const cityKey = cityKeyByInput(payload.city || payload.to || 'tokyo');
  const defaultTo = CITY_DATA[cityKey].airport;
  const to = (payload.to || defaultTo).toUpperCase();
  const departDate = payload.departDate || new Date().toISOString().slice(0, 10);
  const tripType = payload.tripType || 'oneway';

  let legs = [{ from, to, date: departDate }];
  if (tripType === 'roundtrip') {
    const returnDate = payload.returnDate || getDateOffset(departDate, 3);
    legs = [{ from, to, date: departDate }, { from: to, to: from, date: returnDate }];
  } else if (tripType === 'multicity') {
    const candidate = Array.isArray(payload.multiSegments) ? payload.multiSegments : [];
    const normalized = candidate
      .map((s) => ({
        from: String(s.from || '').toUpperCase(),
        to: String(s.to || '').toUpperCase(),
        date: String(s.date || '')
      }))
      .filter((s) => s.from && s.to && s.date);
    legs = normalized.length >= 2 ? normalized.slice(0, 4) : legs;
  }

  const byLeg = legs.map((leg, idx) => buildLegCandidates(leg, idx));
  let combinations;
  if (tripType === 'multicity') {
    // Multicity는 구간별 후보를 무작위 교차조합하지 않고 패키지 형태로 묶어서 보여준다.
    const minCount = Math.max(1, Math.min(...byLeg.map((x) => x.length)));
    const bundled = [];
    for (let i = 0; i < minCount; i += 1) {
      bundled.push(byLeg.map((list) => list[i]));
    }
    for (let i = 0; i < minCount; i += 1) {
      bundled.push(byLeg.map((list, legIdx) => list[(i + legIdx) % list.length]));
    }
    const seen = new Set();
    combinations = bundled.filter((combo) => {
      const key = combo.map((x) => `${x.legIndex}-${x.airline}-${x.departureTime}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else {
    combinations = byLeg.reduce((acc, list) => {
      if (acc.length === 0) return list.map((x) => [x]);
      const next = [];
      for (const base of acc) {
        for (const item of list) {
          if (base.length >= 1 && base[base.length - 1].date > item.date) continue;
          next.push([...base, item]);
        }
      }
      return next;
    }, []);
  }

  return combinations.slice(0, 36).map((combo, idx) => {
    const totalPrice = combo.reduce((s, x) => s + x.priceKRW, 0);
    const totalDurationMin = combo.reduce((s, x) => s + x.durationMin, 0);
    const totalStops = combo.reduce((s, x) => s + x.stops, 0);
    const airlines = Array.from(new Set(combo.map((x) => x.airline)));
    const airports = Array.from(new Set(combo.flatMap((x) => [x.from, x.to])));
    const providers = Array.from(new Set(combo.map((x) => x.provider)));
    const deeplinks = buildFlightDeeplinks(tripType, combo);
    return {
      id: `itin_${idx + 1}`,
      tripType,
      provider: providers.length === 1 ? providers[0] : 'Mixed',
      airlines,
      airports,
      totalPriceKRW: totalPrice,
      totalDurationMin,
      totalStops,
      departureMinute: toMinutes(combo[0].departureTime),
      deeplinkKayak: deeplinks.kayak,
      deeplinkSkyscanner: deeplinks.skyscanner,
      legs: combo
    };
  });
}

function applyFlightFilters(items, filters = {}) {
  const minPrice = Number(filters.minPrice || 0);
  const maxPrice = Number(filters.maxPrice || 10000000);
  const minHour = Number(filters.departHourMin ?? 0);
  const maxHour = Number(filters.departHourMax ?? 23);
  const airports = Array.isArray(filters.airports) ? filters.airports.map((x) => String(x).toUpperCase()) : [];
  const airlines = Array.isArray(filters.airlines) ? filters.airlines.map((x) => String(x).toLowerCase()) : [];

  return items.filter((x) => {
    if (x.totalPriceKRW < minPrice || x.totalPriceKRW > maxPrice) return false;
    const legs = Array.isArray(x.legs) ? x.legs : [];
    if (legs.length > 0) {
      const hourOk = legs.every((l) => {
        const depHour = Math.floor(toMinutes(l.departureTime) / 60);
        return depHour >= minHour && depHour <= maxHour;
      });
      if (!hourOk) return false;
    } else {
      const depHour = Math.floor(x.departureMinute / 60);
      if (depHour < minHour || depHour > maxHour) return false;
    }
    if (airports.length > 0 && !x.airports.some((a) => airports.includes(a))) return false;
    if (airlines.length > 0 && !x.airlines.some((a) => airlines.includes(String(a).toLowerCase()))) return false;
    return true;
  });
}

function rankFlights(payload) {
  const preference = payload.preference || 'balanced';
  const base = Array.isArray(payload._candidates) ? payload._candidates : flightCandidates(payload);
  const filtered = applyFlightFilters(base, payload.filters);
  return filtered
    .map((f) => {
      let score;
      if (preference === 'cheap') score = 1000000 - f.totalPriceKRW - f.totalStops * 50000;
      else if (preference === 'fast') score = 1000000 - f.totalDurationMin * 180 - f.totalStops * 50000;
      else score = 1000000 - f.totalPriceKRW * 0.7 - f.totalDurationMin * 260 - f.totalStops * 45000;

      return {
        ...f,
        aiScore: Math.round(score),
        reason: preference === 'cheap' ? '최저가 중심 랭킹' : preference === 'fast' ? '최단시간 중심 랭킹' : '가격/시간 균형 랭킹'
      };
    })
    .sort((a, b) => b.aiScore - a.aiScore);
}

function dateDiffNights(checkIn, checkOut) {
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) return 1;
  const diff = Math.ceil((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
}

function normalizeHotelType(type) {
  const key = String(type || '').toUpperCase();
  if (key.includes('APARTMENT')) return { key: 'apartment', label: '레지던스' };
  if (key.includes('HOSTEL') || key.includes('GUEST')) return { key: 'guesthouse', label: '게스트하우스' };
  if (key.includes('RYOKAN')) return { key: 'ryokan', label: '료칸' };
  return { key: 'hotel', label: '호텔' };
}

function cityCodeFromAirport(airportCode) {
  const code = String(airportCode || '').toUpperCase();
  if (code === 'NRT' || code === 'HND') return 'TYO';
  if (code === 'KIX' || code === 'ITM') return 'OSA';
  if (code === 'CTS') return 'SPK';
  return code;
}

async function fetchAmadeusHotelIdsByCity(cityCode) {
  if (!cityCode) return [];
  const token = await getAmadeusToken();
  const params = new URLSearchParams({
    cityCode,
    radius: '10',
    radiusUnit: 'KM',
    hotelSource: 'ALL'
  });
  const endpoint = `${amadeusBaseUrl()}/v1/reference-data/locations/hotels/by-city?${params.toString()}`;
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Amadeus hotel list(city) error: ${res.status}`);
  }
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  return list
    .map((h) => ({
      id: h.hotelId,
      name: h.name || '',
      geoCode: h.geoCode || null,
      address: h.address || null
    }))
    .filter((h) => h.id);
}

async function fetchAmadeusHotelIdsByGeocode(center) {
  if (!center) return [];
  const token = await getAmadeusToken();
  const params = new URLSearchParams({
    latitude: String(center.lat),
    longitude: String(center.lng),
    radius: '10',
    radiusUnit: 'KM',
    hotelSource: 'ALL'
  });
  const endpoint = `${amadeusBaseUrl()}/v1/reference-data/locations/hotels/by-geocode?${params.toString()}`;
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Amadeus hotel list error: ${res.status}`);
  }
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  return list
    .map((h) => ({
      id: h.hotelId,
      name: h.name || '',
      geoCode: h.geoCode || null,
      address: h.address || null
    }))
    .filter((h) => h.id);
}

async function fetchAmadeusHotelOffers(payload) {
  const cityKey = cityKeyByInput(payload.city || 'tokyo');
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const checkIn = payload.checkIn || new Date().toISOString().slice(0, 10);
  const checkOut = payload.checkOut || getDateOffset(checkIn, 2);
  const guests = Math.max(1, Number(payload.guests || 2));
  const rooms = Math.max(1, Number(payload.rooms || 1));
  const nights = dateDiffNights(checkIn, checkOut);

  let hotelIds = [];
  if (GOOGLE_MAPS_API_KEY) {
    const center = await fetchGoogleCityCenter(city.label);
    const byGeo = await fetchAmadeusHotelIdsByGeocode(center);
    hotelIds = byGeo.slice(0, 20).map((h) => h.id);
  }

  if (hotelIds.length === 0) {
    const cityCode = cityCodeFromAirport(city.airport);
    const byCity = await fetchAmadeusHotelIdsByCity(cityCode);
    hotelIds = byCity.slice(0, 20).map((h) => h.id);
  }

  if (hotelIds.length === 0) return [];

  const token = await getAmadeusToken();
  const params = new URLSearchParams({
    hotelIds: hotelIds.join(','),
    adults: String(Math.min(9, guests)),
    checkInDate: checkIn,
    checkOutDate: checkOut,
    roomQuantity: String(Math.max(1, rooms))
  });
  const endpoint = `${amadeusBaseUrl()}/v3/shopping/hotel-offers?${params.toString()}`;
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Amadeus hotel offers error: ${res.status}`);
  }
  const data = await res.json();
  const offers = Array.isArray(data?.data) ? data.data : [];

  return offers.map((entry, idx) => {
    const hotel = entry.hotel || {};
    const offer = Array.isArray(entry.offers) ? entry.offers[0] : null;
    const priceCurrency = offer?.price?.currency || 'KRW';
    const total = Number(offer?.price?.total || 0);
    const totalPriceKRW = Math.round(convertToKRW(total, priceCurrency));
    const basePriceKRW = Math.round(convertToKRW(offer?.price?.base || 0, priceCurrency));
    const taxesKRW = Math.round(convertToKRW(
      (Array.isArray(offer?.price?.taxes) ? offer.price.taxes : [])
        .reduce((sum, t) => sum + Number(t.amount || 0), 0),
      priceCurrency
    ));
    const feesKRW = Math.round(convertToKRW(
      (Array.isArray(offer?.price?.fees) ? offer.price.fees : [])
        .reduce((sum, f) => sum + Number(f.amount || 0), 0),
      priceCurrency
    ));
    const pricePerNightKRW = Math.round(totalPriceKRW / Math.max(1, nights) / Math.max(1, rooms));
    const ratingRaw = hotel.rating || hotel.category || '';
    const ratingNum = Number(ratingRaw) || 0;
    const rating = ratingNum > 0 ? (ratingNum <= 5 ? ratingNum * 2 : ratingNum) : 0;
    const amenityList = Array.isArray(hotel.amenities) ? hotel.amenities : [];
    const hotelType = normalizeHotelType(hotel.type || '');
    const roomType = offer?.room?.typeEstimated?.category || offer?.room?.typeEstimated?.bedType || '';
    const boardType = offer?.boardType || offer?.room?.typeEstimated?.mealType || '';
    const cancellation = Array.isArray(offer?.policies?.cancellations) && offer.policies.cancellations[0]
      ? (offer.policies.cancellations[0].description || offer.policies.cancellations[0].deadline || '')
      : '';

    return {
      id: hotel.hotelId || `amadeus_hotel_${idx + 1}`,
      name: hotel.name || `${city.label} 호텔`,
      provider: 'Amadeus',
      type: hotelType.key,
      typeLabel: hotelType.label,
      area: hotel.address?.cityName || city.label,
      rating: rating ? Number(rating.toFixed(1)) : 0,
      guests,
      rooms,
      checkIn,
      checkOut,
      nights,
      pricePerNightKRW,
      totalPriceKRW,
      priceBreakdown: {
        baseKRW: basePriceKRW,
        taxesKRW,
        feesKRW,
        totalKRW: totalPriceKRW
      },
      offerId: offer?.id || '',
      roomType,
      boardType,
      cancellation,
      amenities: amenityList.slice(0, 6),
      aiScore: Math.round((rating || 7.5) * 100 - (pricePerNightKRW / 1200)),
      deeplink: `https://www.booking.com/searchresults.ko.html?ss=${encodeURIComponent(city.label)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${guests}&no_rooms=${rooms}&group_children=0`
    };
  });
}

function stayCandidates(payload) {
  const cityKey = cityKeyByInput(payload.city || 'tokyo');
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const checkIn = payload.checkIn || new Date().toISOString().slice(0, 10);
  const checkOut = payload.checkOut || getDateOffset(checkIn, 2);
  const guests = Math.max(1, Number(payload.guests || 2));
  const rooms = Math.max(1, Number(payload.rooms || 1));
  const nights = dateDiffNights(checkIn, checkOut);

  const providers = ['Agoda', 'Booking', 'Expedia', 'Trip.com', 'Hotels.com'];
  const amenities = ['조식 포함', '무료 Wi-Fi', '온천', '야외 수영장', '피트니스', '공항 셔틀'];
  const types = [
    { key: 'hotel', label: '호텔', price: 1.0 },
    { key: 'ryokan', label: '료칸', price: 1.5 },
    { key: 'apartment', label: '레지던스', price: 1.2 },
    { key: 'guesthouse', label: '게스트하우스', price: 0.75 }
  ];

  const baseNames = [
    `${city.label} 그랜드 호텔`,
    `${city.label} 센트럴 스테이`,
    `${city.label} 파노라마 료칸`,
    `${city.label} 시티 레지던스`,
    `${city.label} 마켓 하우스`,
    `${city.label} 리버사이드`,
    `${city.label} 미드타운 호텔`,
    `${city.label} 가든 스테이`,
    `${city.label} 아카데미아`,
    `${city.label} 스카이뷰 스테이`,
    `${city.label} 모던 하우스`,
    `${city.label} 힐탑 숙소`
  ];

  return baseNames.map((name, idx) => {
    const type = types[idx % types.length];
    const provider = providers[idx % providers.length];
    const area = city.areas[idx % city.areas.length];
    const rating = Number((7.2 + ((idx % 8) * 0.3)).toFixed(1));
    const basePrice = 65000 + (idx % 6) * 28000;
    const pricePerNightKRW = Math.round(basePrice * type.price + (guests - 2) * 8000 + (rooms - 1) * 20000);
    const totalPriceKRW = pricePerNightKRW * nights * rooms;
    const amenityPack = amenities.filter((_, i) => (i + idx) % 2 === 0).slice(0, 3);
    const aiScore = Math.round((rating * 100) - (pricePerNightKRW / 1200));
    return {
      id: `stay_${idx + 1}`,
      name,
      provider,
      type: type.key,
      typeLabel: type.label,
      area,
      rating,
      guests,
      rooms,
      checkIn,
      checkOut,
      nights,
      pricePerNightKRW,
      totalPriceKRW,
      amenities: amenityPack,
      aiScore,
      deeplink: provider === 'Booking'
        ? `https://www.booking.com/searchresults.ko.html?ss=${encodeURIComponent(city.label)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${guests}&no_rooms=${rooms}&group_children=0`
        : provider === 'Agoda'
          ? `https://www.agoda.com/ko-kr/search?city=${encodeURIComponent(city.label)}&checkIn=${checkIn}&checkOut=${checkOut}&adult=${guests}&rooms=${rooms}`
          : provider === 'Trip.com'
            ? `https://kr.trip.com/hotels/?keyword=${encodeURIComponent(city.label)}&checkin=${checkIn}&checkout=${checkOut}&adult=${guests}&room=${rooms}`
            : provider === 'Hotels.com'
              ? `https://kr.hotels.com/Hotel-Search?destination=${encodeURIComponent(city.label)}&start-date=${checkIn}&end-date=${checkOut}&adults=${guests}&rooms=${rooms}`
              : `https://www.expedia.co.kr/Hotel-Search?destination=${encodeURIComponent(city.label)}&startDate=${checkIn}&endDate=${checkOut}&adults=${guests}&rooms=${rooms}`
    };
  });
}

function applyStayFilters(items, filters = {}) {
  const minPrice = Number(filters.minPrice || 0);
  const maxPrice = Number(filters.maxPrice || 10000000);
  const minRating = Number(filters.minRating || 0);
  const stayType = String(filters.stayType || '');
  const providers = Array.isArray(filters.providers) ? filters.providers.map((x) => String(x)) : [];
  const amenities = Array.isArray(filters.amenities) ? filters.amenities.map((x) => String(x)) : [];

  return items.filter((x) => {
    if (x.pricePerNightKRW < minPrice || x.pricePerNightKRW > maxPrice) return false;
    if (x.rating < minRating) return false;
    if (stayType && x.type !== stayType) return false;
    if (providers.length > 0 && !providers.includes(x.provider)) return false;
    if (amenities.length > 0 && !amenities.every((a) => x.amenities.includes(a))) return false;
    return true;
  });
}

function rankStays(payload) {
  const preference = payload.preference || 'balanced';
  const base = Array.isArray(payload._candidates) ? payload._candidates : stayCandidates(payload);
  const filtered = applyStayFilters(base, payload.filters);
  const aiHints = payload.aiHints || {};
  const preferredAreas = Array.isArray(aiHints.preferredAreas) ? aiHints.preferredAreas.map((x) => String(x)) : [];
  const preferAirportAccess = Boolean(aiHints.preferAirportAccess);
  const cityKey = cityKeyByInput(payload.city || 'tokyo');
  const city = CITY_DATA[cityKey] || CITY_DATA.tokyo;
  const airportCode = String(aiHints.arrivalAirport || city.airport || '').toUpperCase();
  const airportMatchBoost = city.airport === airportCode ? 22000 : 0;

  return filtered
    .map((x) => {
      let score;
      if (preference === 'price') score = 1000000 - x.pricePerNightKRW * 6 - x.totalPriceKRW * 0.3;
      else if (preference === 'rating') score = 1000000 + x.rating * 2000 - x.pricePerNightKRW * 4;
      else score = 1000000 + x.rating * 1200 - x.pricePerNightKRW * 5;
      if (preferredAreas.length > 0 && preferredAreas.some((area) => String(x.area || '').includes(area))) {
        score += 65000;
      }
      if (preferAirportAccess && (x.amenities || []).some((a) => String(a).includes('공항 셔틀'))) {
        score += 28000;
      }
      score += airportMatchBoost;
      return { ...x, aiScore: Math.round(score) };
    })
    .sort((a, b) => b.aiScore - a.aiScore);
}

const amadeusTokenState = {
  accessToken: '',
  expiresAt: 0
};

async function refreshFxRate() {
  try {
    const res = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=KRW');
    if (!res.ok) return;
    const data = await res.json();
    const rate = Number(data?.rates?.KRW || 0);
    if (Number.isFinite(rate) && rate > 0) {
      fxUsdKrw = rate;
    }
  } catch {
    // ignore and keep last known rate
  }
}

refreshFxRate();
const fxTimer = setInterval(refreshFxRate, 12 * 60 * 60 * 1000);
if (typeof fxTimer.unref === 'function') fxTimer.unref();

function amadeusBaseUrl() {
  return AMADEUS_ENV === 'prod' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
}

async function getAmadeusToken() {
  if (amadeusTokenState.accessToken && Date.now() < amadeusTokenState.expiresAt) {
    return amadeusTokenState.accessToken;
  }
  const endpoint = `${amadeusBaseUrl()}/v1/security/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AMADEUS_API_KEY,
    client_secret: AMADEUS_API_SECRET
  });
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    throw new Error(`Amadeus token error: ${res.status}`);
  }
  const data = await res.json();
  const expiresIn = Number(data.expires_in || 0);
  amadeusTokenState.accessToken = data.access_token || '';
  amadeusTokenState.expiresAt = Date.now() + Math.max(0, (expiresIn - 60)) * 1000;
  return amadeusTokenState.accessToken;
}

function cabinLabel(cabin) {
  const key = String(cabin || '').toUpperCase();
  if (key === 'ECONOMY') return '이코노미';
  if (key === 'PREMIUM_ECONOMY') return '프리미엄 이코노미';
  if (key === 'BUSINESS') return '비즈니스';
  if (key === 'FIRST') return '퍼스트';
  return key || '미상';
}

function baggageLabel(bags) {
  if (!bags) return '수하물 정보 없음';
  if (Number.isFinite(bags.quantity)) return `위탁 ${bags.quantity}개`;
  if (Number.isFinite(bags.weight)) return `위탁 ${bags.weight}${bags.weightUnit || 'KG'}`;
  return '수하물 정보 없음';
}

function normalizeAmadeusLeg(itinerary, carrierMap = {}, fareMap = {}) {
  const segments = Array.isArray(itinerary?.segments) ? itinerary.segments : [];
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return null;
  const dep = isoToDateTimeParts(first.departure?.at);
  const arr = isoToDateTimeParts(last.arrival?.at);
  const carrierCode = first.carrierCode || '';
  const carrierName = carrierMap[carrierCode] || carrierCode || 'N/A';
  const segmentDetails = segments.map((seg) => {
    const segDep = isoToDateTimeParts(seg.departure?.at);
    const segArr = isoToDateTimeParts(seg.arrival?.at);
    const segCarrierCode = seg.carrierCode || '';
    const segCarrierName = carrierMap[segCarrierCode] || segCarrierCode || 'N/A';
    const fare = fareMap[seg.id] || {};
    const cabin = fare.cabin || fare.travelClass || '';
    const bags = fare.includedCheckedBags || null;
    return {
      from: seg.departure?.iataCode || '',
      to: seg.arrival?.iataCode || '',
      departureTime: segDep.time,
      arrivalTime: segArr.time,
      airline: segCarrierName,
      airlineCode: segCarrierCode,
      flightNumber: segCarrierCode && seg.number ? `${segCarrierCode}${seg.number}` : (seg.number || ''),
      cabin,
      cabinLabel: cabinLabel(cabin),
      baggageLabel: baggageLabel(bags)
    };
  });
  return {
    from: first.departure?.iataCode || '',
    to: last.arrival?.iataCode || '',
    date: dep.date,
    departureTime: dep.time,
    arrivalTime: arr.time,
    durationMin: parseIsoDurationToMinutes(itinerary?.duration),
    stops: Math.max(0, segments.length - 1),
    airline: carrierName,
    airlineCode: carrierCode,
    segments: segmentDetails
  };
}

async function fetchAmadeusFlights(payload) {
  const tripType = payload.tripType || 'oneway';
  const from = (payload.from || 'ICN').toUpperCase();
  const cityKey = cityKeyByInput(payload.city || payload.to || 'tokyo');
  const defaultTo = CITY_DATA[cityKey].airport;
  const to = (payload.to || defaultTo).toUpperCase();
  const departDate = payload.departDate || new Date().toISOString().slice(0, 10);
  const returnDate = payload.returnDate || getDateOffset(departDate, 3);

  let legs = [{ from, to, date: departDate }];
  if (tripType === 'roundtrip') {
    legs = [{ from, to, date: departDate }, { from: to, to: from, date: returnDate }];
  } else if (tripType === 'multicity') {
    const candidate = Array.isArray(payload.multiSegments) ? payload.multiSegments : [];
    const normalized = candidate
      .map((s) => ({
        from: String(s.from || '').toUpperCase(),
        to: String(s.to || '').toUpperCase(),
        date: String(s.date || '')
      }))
      .filter((s) => s.from && s.to && s.date);
    legs = normalized.length >= 2 ? normalized.slice(0, 4) : legs;
  }

  const token = await getAmadeusToken();
  const endpoint = `${amadeusBaseUrl()}/v2/shopping/flight-offers`;
  const body = {
    currencyCode: 'KRW',
    originDestinations: legs.map((leg, idx) => ({
      id: String(idx + 1),
      originLocationCode: leg.from,
      destinationLocationCode: leg.to,
      departureDateTimeRange: { date: leg.date }
    })),
    travelers: [{ id: '1', travelerType: 'ADULT' }],
    sources: ['GDS'],
    searchCriteria: {
      maxFlightOffers: 40
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`Amadeus offers error: ${res.status}`);
  }
  const data = await res.json();
  const offers = Array.isArray(data?.data) ? data.data : [];
  const carrierMap = data?.dictionaries?.carriers || {};

  return offers.map((offer, idx) => {
    const itineraries = Array.isArray(offer?.itineraries) ? offer.itineraries : [];
    const fareMap = {};
    const traveler = Array.isArray(offer?.travelerPricings) ? offer.travelerPricings[0] : null;
    const fareDetails = Array.isArray(traveler?.fareDetailsBySegment) ? traveler.fareDetailsBySegment : [];
    fareDetails.forEach((d) => {
      if (!d?.segmentId) return;
      fareMap[d.segmentId] = {
        cabin: d.cabin,
        travelClass: d.travelClass,
        includedCheckedBags: d.includedCheckedBags || null
      };
    });

    const mappedLegs = itineraries.map((it) => normalizeAmadeusLeg(it, carrierMap, fareMap)).filter(Boolean);
    const totalDurationMin = mappedLegs.reduce((sum, l) => sum + l.durationMin, 0);
    const totalStops = mappedLegs.reduce((sum, l) => sum + l.stops, 0);
    const airlines = Array.from(new Set(mappedLegs.map((l) => l.airline).filter(Boolean)));
    const airports = Array.from(new Set(mappedLegs.flatMap((l) => [l.from, l.to]).filter(Boolean)));
    const priceCurrency = offer?.price?.currency || 'KRW';
    const rawPrice = Number(offer?.price?.total || 0);
    const totalPriceKRW = Math.round(convertToKRW(rawPrice, priceCurrency));
    const basePriceKRW = Math.round(convertToKRW(offer?.price?.base || 0, priceCurrency));
    const feesKRW = Math.round(convertToKRW(
      (Array.isArray(offer?.price?.fees) ? offer.price.fees : [])
        .reduce((sum, f) => sum + Number(f.amount || 0), 0),
      priceCurrency
    ));
    const taxesKRW = Math.max(0, Math.round(convertToKRW(
      (Array.isArray(offer?.price?.taxes) ? offer.price.taxes : [])
        .reduce((sum, t) => sum + Number(t.amount || 0), 0),
      priceCurrency
    )) || (totalPriceKRW - basePriceKRW - feesKRW));

    return {
      id: offer?.id || `amadeus_${idx + 1}`,
      tripType,
      provider: 'Amadeus',
      airlines,
      airports,
      totalPriceKRW,
      priceBreakdown: {
        baseKRW: basePriceKRW,
        taxesKRW,
        feesKRW,
        totalKRW: totalPriceKRW
      },
      totalDurationMin,
      totalStops,
      departureMinute: toMinutes(mappedLegs[0]?.departureTime || '00:00'),
      deeplinkKayak: buildFlightDeeplink('KAYAK', tripType, mappedLegs),
      deeplinkSkyscanner: buildFlightDeeplink('Skyscanner', tripType, mappedLegs),
      legs: mappedLegs
    };
  }).filter((x) => x.legs.length > 0);
}

function normalizePriceLevel(level) {
  if (level === null || level === undefined) return null;
  if (typeof level === 'number' && Number.isFinite(level)) {
    const rounded = Math.round(level);
    return Math.min(4, Math.max(1, rounded));
  }
  const map = {
    PRICE_LEVEL_UNSPECIFIED: null,
    PRICE_LEVEL_FREE: 1,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4
  };
  return Object.prototype.hasOwnProperty.call(map, level) ? map[level] : null;
}

function scoreFoodFit(score, priceLevel, budget) {
  const baseScore = Number.isFinite(score) ? score : 3.6;
  const price = Number.isFinite(priceLevel) ? priceLevel : (budget === 'low' ? 2 : budget === 'high' ? 4 : 3);
  return Math.round((baseScore * 20) + (budget === 'low' ? (5 - price) * 4 : budget === 'high' ? price * 3 : 10));
}

const FOOD_GENRE_SYNONYMS = {
  '스시': ['스시', '초밥', 'sushi', '寿司'],
  '라멘': ['라멘', 'ramen', '拉麺'],
  '교자': ['교자', 'gyoza', '餃子', '만두'],
  '오코노미야키': ['오코노미야키', 'okonomiyaki', 'お好み焼き'],
  '타코야키': ['타코야키', 'takoyaki', 'たこ焼き'],
  '우동': ['우동', 'udon', 'うどん'],
  '소바': ['소바', 'soba', 'そば'],
  '장어덮밥': ['장어', '히츠마부시', 'unagi', 'eel', 'うなぎ']
};

const FOOD_FALLBACK_NAMES = {
  '장어덮밥': ['우나기 요쓰바', '히츠마부시 나고야 빈초', '우나기노 나루세', '우나기 토쿠'],
  '스시': ['스시 다이와', '스시 마사', '스시 잇포', '스시 야마토'],
  '라멘': ['멘야 무사시', '이치란', '잇푸도', '스미레 라멘'],
  '교자': ['교자노 오쇼', '하마마츠 교자관', '미야코 교자', '교자 전문 텐신']
};

function genreTokens(genre) {
  const g = String(genre || '').trim();
  if (!g) return [];
  const direct = FOOD_GENRE_SYNONYMS[g];
  if (direct) return direct;
  return [g];
}

function isGenreMatchFoodName(name, genre) {
  const tokens = genreTokens(genre);
  if (tokens.length === 0) return true;
  const lower = String(name || '').toLowerCase();
  return tokens.some((t) => lower.includes(String(t).toLowerCase()));
}

async function fetchPlacesWithGoogle(query, lat, lng, genre, budget, queryOverride = '', maxResultCount = 8) {
  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  const cleanGenre = String(genre || '').trim();
  const textQuery = String(queryOverride || '').trim() || (cleanGenre ? `${query} ${cleanGenre} 맛집` : `${query} 일본 맛집`);
  const body = {
    textQuery,
    maxResultCount: Math.max(5, Math.min(20, Number(maxResultCount) || 8)),
    languageCode: 'ko',
    regionCode: 'JP'
  };

  if (lat && lng) {
    body.locationBias = {
      circle: {
        center: { latitude: Number(lat), longitude: Number(lng) },
        radius: 4000
      }
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.priceLevel'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`Google Places API error: ${response.status}`);

  const data = await response.json();
  return (data.places || []).map((p) => {
    const priceLevel = normalizePriceLevel(p.priceLevel);
    const score = Number.isFinite(p.rating) ? p.rating : null;
    return {
      name: p.displayName?.text || '이름 없음',
      area: '현지',
      genre: cleanGenre || '일식',
      score,
      priceLevel,
      aiFit: scoreFoodFit(score, priceLevel, budget || 'mid'),
      address: p.formattedAddress || '주소 없음',
      mapUrl: p.googleMapsUri || null,
      tabelogUrl: 'https://tabelog.com/en/'
    };
  });
}

async function fetchFoodPlacesForCity(query, lat, lng, genre, budget) {
  const cleanGenre = String(genre || '').trim();
  const tokenQueries = genreTokens(cleanGenre);
  const baseQueries = cleanGenre
    ? [
        `${query} ${cleanGenre} 맛집`,
        `${query} ${cleanGenre} 현지 맛집`,
        `${query} ${cleanGenre} 인기`,
        `${query} 로컬 ${cleanGenre}`
      ]
    : [
        `${query} 인기 맛집`,
        `${query} 현지 맛집`,
        `${query} 일본 맛집`
      ];
  const queries = cleanGenre && tokenQueries.length > 1
    ? Array.from(new Set([...baseQueries, ...tokenQueries.map((t) => `${query} ${t} 맛집`)]))
    : baseQueries;

  const results = await Promise.all(queries.map(async (q) => {
    try {
      return await fetchPlacesWithGoogle(query, lat, lng, cleanGenre, budget, q, 12);
    } catch {
      return [];
    }
  }));

  const uniq = new Map();
  results.flat().forEach((item) => {
    const key = `${item.name}|${item.address || ''}`;
    if (!uniq.has(key)) uniq.set(key, item);
  });
  const merged = Array.from(uniq.values());
  if (!cleanGenre) return merged.slice(0, 18);
  const strict = merged.filter((x) => isGenreMatchFoodName(x.name, cleanGenre));
  return strict.slice(0, 18);
}

function classifyGooglePlacesFailure(errorText = '') {
  const text = String(errorText || '').toLowerCase();
  if (!text) return 'Google Places 호출 실패(원인 불명)';
  if (text.includes('403') || text.includes('permission') || text.includes('denied') || text.includes('api key')) {
    return 'Google Places 권한/키 제한 문제(403/권한 거부)';
  }
  if (text.includes('429') || text.includes('quota') || text.includes('rate')) {
    return 'Google Places 쿼터/요청 한도 초과(429)';
  }
  if (text.includes('401') || text.includes('unauthorized')) {
    return 'Google Places 인증 실패(401)';
  }
  if (text.includes('fetch failed') || text.includes('network') || text.includes('timeout')) {
    return 'Google Places 네트워크/타임아웃 오류';
  }
  return `Google Places 오류: ${errorText}`;
}

function tabelogStyleFoods(payload) {
  const key = cityKeyByInput(payload.city || payload.query);
  const city = CITY_DATA[key];
  const budget = payload.budget || 'mid';
  const genre = String(payload.genre || '').trim();
  const filtered = city.foods.filter((f) => (genre ? isGenreMatchFoodName(`${f.name} ${f.genre}`, genre) : true));
  let sourceList = genre ? filtered : city.foods;
  let source = 'tabelog_style_curated';
  if (genre && sourceList.length === 0) {
    const baseNames = FOOD_FALLBACK_NAMES[genre] || [`${genre} 로컬 맛집`, `${genre} 전문점`, `${genre} 하우스`, `${genre} 다이닝`];
    sourceList = baseNames.map((shop, idx) => ({
      name: `${shop} ${city.label}${idx > 0 ? ` ${idx + 1}` : ''}`,
      area: city.areas[idx % Math.max(1, city.areas.length)] || city.label,
      genre,
      priceLevel: 2 + (idx % 2),
      score: 3.6 + ((idx % 4) * 0.2),
      tabelogUrl: 'https://tabelog.com/en/'
    }));
    source = 'tabelog_style_curated_generated';
  }
  const normalized = sourceList
    .map((f) => ({
      ...f,
      city: city.label,
      mapUrl: mapUrl(`${f.name} ${city.label}`),
      aiFit: Math.round((f.score * 20) + (budget === 'low' ? (5 - f.priceLevel) * 4 : budget === 'high' ? f.priceLevel * 3 : 10))
    }))
    .sort((a, b) => b.aiFit - a.aiFit);

  return { source, city: city.label, budget, list: normalized };
}

async function handleApi(req, res, parsedUrl) {
  try {
    if (req.method === 'GET' && parsedUrl.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        app: 'japantravel-suite',
        supabaseConfigured: hasSupabase(),
        now: new Date().toISOString()
      });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/cities') {
      const cities = Object.entries(CITY_DATA).map(([key, value]) => ({ key, label: value.label, airport: value.airport }));
      return sendJson(res, 200, { cities });
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/ai-travel-chat') {
      const payload = await readBody(req);
      return sendJson(res, 200, await buildTravelChatPlan(payload));
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/destinations') {
      const payload = await readBody(req);
      return sendJson(res, 200, await recommendDestinations(payload));
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/itinerary') {
      const payload = await readBody(req);
      const rec = await recommendDestinations({ ...payload, limit: Math.max(6, Math.min(12, Number(payload.days || 3) * 2)) });
      return sendJson(res, 200, createItinerary({ ...payload, _picks: rec.picks }));
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/travel-plan') {
      const payload = await readBody(req);
      return sendJson(res, 200, await buildTravelPlan(payload));
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/travel-plan/save') {
      const payload = await readBody(req);
      const plan = payload.plan || await buildTravelPlan(payload);
      const cityKey = cityKeyByInput(payload.city || plan.city);
      const row = {
        plan_key: payload.planKey || randomUUID(),
        user_label: payload.userLabel || 'guest',
        city_key: cityKey,
        city_label: plan.city,
        theme: payload.theme || 'mixed',
        budget: payload.budget || 'mid',
        start_date: payload.startDate || null,
        days: Number(payload.days || plan.itinerary?.length || 0),
        summary: plan.summary || '',
        source: plan.source || 'integrated_travel_planner_v1',
        payload: plan
      };
      const saved = await supabaseRequest('POST', 'travel_plans?on_conflict=plan_key', [row]);
      return sendJson(res, 200, { saved: saved[0] || row });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/travel-plan/list') {
      const limit = Math.max(1, Math.min(50, Number(parsedUrl.searchParams.get('limit') || 20)));
      const userLabel = parsedUrl.searchParams.get('userLabel');
      let route = `travel_plans?select=plan_key,user_label,city_key,city_label,theme,budget,start_date,days,summary,source,created_at&order=created_at.desc&limit=${limit}`;
      if (userLabel) route += `&user_label=eq.${encodeURIComponent(userLabel)}`;
      const rows = await supabaseRequest('GET', route);
      return sendJson(res, 200, { plans: rows });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/travel-plan/get') {
      const planKey = parsedUrl.searchParams.get('planKey');
      if (!planKey) return sendJson(res, 400, { error: 'planKey is required' });
      const rows = await supabaseRequest('GET', `travel_plans?select=*&plan_key=eq.${encodeURIComponent(planKey)}&limit=1`);
      if (!rows[0]) return sendJson(res, 404, { error: 'Plan not found' });
      return sendJson(res, 200, { plan: rows[0] });
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/flights') {
      const payload = await readBody(req);
      let allCandidates = [];
      let source = 'mock';
      let sourceNote = '';

      if (AMADEUS_API_KEY && AMADEUS_API_SECRET) {
        try {
          allCandidates = await fetchAmadeusFlights(payload);
          source = AMADEUS_ENV === 'prod' ? 'amadeus_live' : 'amadeus_test';
        } catch (err) {
          allCandidates = [];
          sourceNote = `Amadeus 항공 조회 실패: ${err.message}`;
        }
      }

      if (allCandidates.length === 0) {
        allCandidates = flightCandidates(payload);
        source = 'mock';
        if (!sourceNote) sourceNote = '실데이터 조회 실패로 더미 데이터 사용';
      }

      const ranked = rankFlights({ ...payload, _candidates: allCandidates });
      const airports = Array.from(new Set(allCandidates.flatMap((x) => x.airports)));
      const airlines = Array.from(new Set(allCandidates.flatMap((x) => x.airlines)));
      return sendJson(res, 200, {
        source,
        note: sourceNote,
        tripType: payload.tripType || 'oneway',
        preference: payload.preference || 'balanced',
        recommendation: ranked[0] || null,
        total: ranked.length,
        filterOptions: { airports, airlines },
        flights: ranked
      });
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/stays') {
      const payload = await readBody(req);
      let all = [];
      let source = 'mock';
      let sourceNote = '';
      if (AMADEUS_API_KEY && AMADEUS_API_SECRET) {
        try {
          all = await fetchAmadeusHotelOffers(payload);
          source = AMADEUS_ENV === 'prod' ? 'amadeus_live' : 'amadeus_test';
        } catch (err) {
          all = [];
          sourceNote = `Amadeus 호텔 조회 실패: ${err.message}`;
        }
      }

      if (all.length === 0) {
        all = stayCandidates(payload);
        source = 'mock';
        if (!sourceNote) sourceNote = '실데이터 조회 실패로 더미 데이터 사용';
      }

      const ranked = rankStays({ ...payload, _candidates: all });
      const providers = Array.from(new Set(all.map((x) => x.provider)));
      const amenities = Array.from(new Set(all.flatMap((x) => x.amenities || [])));
      return sendJson(res, 200, {
        source,
        note: sourceNote,
        city: payload.city || 'tokyo',
        total: ranked.length,
        filterOptions: { providers, amenities },
        stays: ranked
      });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/foods') {
      const payload = {
        city: parsedUrl.searchParams.get('city') || parsedUrl.searchParams.get('query') || 'tokyo',
        genre: parsedUrl.searchParams.get('genre') || '',
        budget: parsedUrl.searchParams.get('budget') || 'mid'
      };

      if (GOOGLE_MAPS_API_KEY) {
        try {
          const places = await fetchFoodPlacesForCity(
            CITY_DATA[cityKeyByInput(payload.city)].label,
            parsedUrl.searchParams.get('lat'),
            parsedUrl.searchParams.get('lng'),
            payload.genre,
            payload.budget
          );
          if (Array.isArray(places) && places.length > 0) {
            return sendJson(res, 200, { source: 'google_places_plus_tabelog_link', city: payload.city, list: places });
          }
          const fallback = tabelogStyleFoods(payload);
          return sendJson(res, 200, { ...fallback, warning: 'Google Places 결과 0건(쿼리/지역 조건), fallback 적용' });
        } catch (err) {
          const fallback = tabelogStyleFoods(payload);
          return sendJson(res, 200, { ...fallback, warning: classifyGooglePlacesFailure(err.message) });
        }
      }

      return sendJson(res, 200, tabelogStyleFoods(payload));
    }

    return sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
}

function serveStatic(req, res, parsedUrl) {
  let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  filePath = path.join(PUBLIC_DIR, path.normalize(filePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.webmanifest': 'application/manifest+json; charset=utf-8'
    };

    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  if (parsedUrl.pathname.startsWith('/api/')) return handleApi(req, res, parsedUrl);
  return serveStatic(req, res, parsedUrl);
});

server.listen(PORT, () => {
  console.log(`JapanTravel prototype server running at http://localhost:${PORT}`);
});
