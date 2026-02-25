const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
  const [a1, a2, a3] = city.areas;
  const extras = [
    { name: `${city.label} 중앙공원`, area: a1, category: '자연/산책', stayMin: 70, bestTime: '08:00-09:30', crowdScore: 2 },
    { name: `${city.label} 전통거리`, area: a2, category: '문화/로컬', stayMin: 90, bestTime: '10:00-12:00', crowdScore: 3 },
    { name: `${city.label} 전망 포인트`, area: a3, category: '전망', stayMin: 80, bestTime: '15:00-17:00', crowdScore: 2 },
    { name: `${city.label} 야시장`, area: a2, category: '미식/야경', stayMin: 110, bestTime: '18:00-20:00', crowdScore: 4 }
  ];
  const extraFoods = [
    { name: `${city.label} 로컬 이자카야`, area: a1, genre: '이자카야', priceLevel: 2, score: 3.7, tabelogUrl: 'https://tabelog.com/en/' },
    { name: `${city.label} 대표 라멘`, area: a2, genre: '라멘', priceLevel: 2, score: 3.9, tabelogUrl: 'https://tabelog.com/en/' }
  ];
  city.highlights = [...city.highlights, ...extras];
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
  const startDate = payload.startDate || new Date().toISOString().slice(0, 10);
  const theme = payload.theme || 'mixed';
  const picks = Array.isArray(payload._picks) && payload._picks.length > 0
    ? payload._picks
    : city.highlights.map((p) => ({ ...p, city: city.label, mapUrl: mapUrl(`${p.name} ${city.label}`), aiScore: 65 }));

  const startHour = (timeRange) => {
    const m = /^(\d{1,2}):/.exec(String(timeRange || ''));
    return m ? Number(m[1]) : 12;
  };

  const morningPool = picks.filter((p) => startHour(p.bestTime) < 12);
  const afternoonPool = picks.filter((p) => startHour(p.bestTime) >= 12 && startHour(p.bestTime) < 18);
  const fallbackPool = picks;
  const foods = city.foods || [];

  const itinerary = [];
  for (let i = 0; i < days; i += 1) {
    const a = (morningPool[i % Math.max(1, morningPool.length)]) || fallbackPool[(i * 2) % fallbackPool.length];
    const b = (afternoonPool[i % Math.max(1, afternoonPool.length)]) || fallbackPool[(i * 2 + 1) % fallbackPool.length];
    const dinner = foods[i % Math.max(1, foods.length)];
    itinerary.push({
      day: i + 1,
      date: getDateOffset(startDate, i),
      blocks: [
        `오전(08:30-11:30): ${a.name} (${a.bestTime})`,
        `오후(13:00-17:00): ${b.name} (${b.bestTime})`,
        `저녁(18:00-20:00): ${dinner ? `${dinner.name} (${dinner.genre})` : `${city.areas[i % city.areas.length]} 로컬 미식 동선`}`
      ]
    });
  }

  return {
    source: 'ai_planner_v1',
    city: city.label,
    theme,
    summary: `${city.label} ${days}일 맞춤 일정`,
    itinerary,
    tips: [
      '첫날은 공항-도심 이동 시간을 최소 2시간 확보',
      '핫플은 오픈 직후 또는 20시 이후 방문 추천',
      '하루 도보 18,000보 이상이면 다음날 오전 일정 완화 권장'
    ]
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
  const it = createItinerary({ ...payload, city: key, _picks: rec.picks });
  return {
    source: 'integrated_travel_planner_v1',
    city: rec.city,
    recommendations: rec.picks,
    itinerary: it.itinerary,
    tips: it.tips,
    summary: `${rec.city} 추천 ${rec.picks.length}곳 + ${it.itinerary.length}일 일정`
  };
}

function toDateKey(dateLike) {
  return String(dateLike || '').replace(/-/g, '');
}

function toMinutes(timeText) {
  const [h, m] = String(timeText || '00:00').split(':').map(Number);
  return (h * 60) + (m || 0);
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
  const airlines = Array.isArray(filters.airlines) ? filters.airlines.map((x) => String(x)) : [];

  return items.filter((x) => {
    if (x.totalPriceKRW < minPrice || x.totalPriceKRW > maxPrice) return false;
    const depHour = Math.floor(x.departureMinute / 60);
    if (depHour < minHour || depHour > maxHour) return false;
    if (airports.length > 0 && !x.airports.some((a) => airports.includes(a))) return false;
    if (airlines.length > 0 && !x.airlines.some((a) => airlines.includes(a))) return false;
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

async function fetchPlacesWithGoogle(query, lat, lng) {
  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  const body = {
    textQuery: `${query} 일본 맛집`,
    maxResultCount: 8,
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
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`Google Places API error: ${response.status}`);

  const data = await response.json();
  return (data.places || []).map((p) => ({
    name: p.displayName?.text || '이름 없음',
    area: '현지',
    genre: '일식',
    score: p.rating || null,
    address: p.formattedAddress || '주소 없음',
    mapUrl: p.googleMapsUri || null,
    tabelogUrl: 'https://tabelog.com/en/'
  }));
}

function tabelogStyleFoods(payload) {
  const key = cityKeyByInput(payload.city || payload.query);
  const city = CITY_DATA[key];
  const budget = payload.budget || 'mid';
  const genre = String(payload.genre || '').trim();

  const normalized = city.foods
    .filter((f) => (genre ? f.genre.includes(genre) : true))
    .map((f) => ({
      ...f,
      city: city.label,
      mapUrl: mapUrl(`${f.name} ${city.label}`),
      aiFit: Math.round((f.score * 20) + (budget === 'low' ? (5 - f.priceLevel) * 4 : budget === 'high' ? f.priceLevel * 3 : 10))
    }))
    .sort((a, b) => b.aiFit - a.aiFit);

  return { source: 'tabelog_style_curated', city: city.label, budget, list: normalized };
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
      const allCandidates = flightCandidates(payload);
      const ranked = rankFlights({ ...payload, _candidates: allCandidates });
      const airports = Array.from(new Set(allCandidates.flatMap((x) => x.airports)));
      const airlines = Array.from(new Set(allCandidates.flatMap((x) => x.airlines)));
      return sendJson(res, 200, {
        source: 'kayak_skyscanner_style',
        tripType: payload.tripType || 'oneway',
        preference: payload.preference || 'balanced',
        recommendation: ranked[0] || null,
        total: ranked.length,
        filterOptions: { airports, airlines },
        flights: ranked
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
          const places = await fetchPlacesWithGoogle(CITY_DATA[cityKeyByInput(payload.city)].label, parsedUrl.searchParams.get('lat'), parsedUrl.searchParams.get('lng'));
          return sendJson(res, 200, { source: 'google_places_plus_tabelog_link', city: payload.city, list: places });
        } catch (err) {
          const fallback = tabelogStyleFoods(payload);
          return sendJson(res, 200, { ...fallback, warning: err.message });
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
