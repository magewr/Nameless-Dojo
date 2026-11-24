import { CountryId, JourneyPoiKind, JourneyRegionId, Season } from '../types/game';

// 무사수행 지역 · 구간(길) · 길 위의 풍문.
// 한 지역은 갈림길로 이어진 5~6개의 구간이다. 한 번의 수행에서 보통 4~5개 구간을 지난다.

export type JourneyTerrain = 'MOUNTAIN' | 'FOREST' | 'RIVER' | 'ROAD' | 'COAST' | 'TOWN' | 'TEMPLE' | 'PASS';

export interface JourneyLeg {
  id: string;
  name: string;
  terrain: JourneyTerrain;
  days: number; // 끝까지 걸으면 드는 날수
  hint: string; // 갈림길에서 보이는 한 줄
  next: string[]; // 갈림길에서 고를 수 있는 다음 구간 (비면 이 길의 끝)
  pois: Partial<Record<JourneyPoiKind, number>>; // 구간에 놓일 장소 종류별 가중치
  vista?: string; // 이 구간에만 있는 대오 장소의 사건 키
}

export interface JourneyRegion {
  id: JourneyRegionId;
  country: CountryId;
  name: string;
  hanja: string;
  blurb: string;
  danger: number; // 0~1 돌발 사건(매복·맹수) 빈도
  beast: { name: string; title: string }; // 이 땅의 맹수
  bandit: { name: string; title: string }; // 이 땅의 도적
  palette: { sky: [string, string]; far: string; mid: string; near: string; ground: string; accent: string };
  legs: JourneyLeg[];
  startLeg: string;
}

export const JOURNEY_DAYS_PER_SEASON = 90;
export const DAY_PX = 150; // 한 날 동안 걷는 거리(화면 px)

export const JOURNEY_REGIONS: JourneyRegion[] = [
  // ───────────── 조선 ─────────────
  {
    id: 'KR_JIRI',
    country: 'KOREA',
    name: '지리산',
    hanja: '智異山',
    blurb: '어리석은 이도 머물면 지혜로워진다는 산. 화전민과 산채, 그리고 호환(虎患)의 땅.',
    danger: 0.75,
    beast: { name: '지리산 산군(山君)', title: '마을을 떨게 하는 호랑이' },
    bandit: { name: '반야봉 산채 두목', title: '화적(火賊) 패거리' },
    palette: { sky: ['#1e293b', '#94a3b8'], far: '#475569', mid: '#334155', near: '#1e293b', ground: '#3f3a2e', accent: '#b45309' },
    startLeg: 'jiri_gate',
    legs: [
      { id: 'jiri_gate', name: '함양 장터 어귀', terrain: 'TOWN', days: 14, hint: '장꾼과 주막이 모인 산 어귀', next: ['jiri_valley', 'jiri_burnfield'], pois: { INN: 2, PEOPLE: 3, HISTORY: 2 } },
      { id: 'jiri_valley', name: '칠선계곡', terrain: 'RIVER', days: 18, hint: '물소리 깊은 골짜기 — 은자가 산다는 소문', next: ['jiri_hermit', 'jiri_peak'], pois: { MASTER: 2, TREASURE: 2, PEOPLE: 1, SHRINE: 1 } },
      { id: 'jiri_burnfield', name: '화전민 마을', terrain: 'FOREST', days: 16, hint: '불탄 비탈의 화전민들 — 범이 내려온다 한다', next: ['jiri_hermit', 'jiri_bandit'], pois: { PEOPLE: 3, HISTORY: 2, INN: 1 } },
      { id: 'jiri_hermit', name: '청학동 가는 길', terrain: 'FOREST', days: 18, hint: '안개 속 숨은 마을 — 세상을 등진 이들', next: ['jiri_peak'], pois: { MASTER: 3, TREASURE: 2, SHRINE: 1 } },
      { id: 'jiri_bandit', name: '반야봉 너덜길', terrain: 'PASS', days: 16, hint: '산채의 봉화가 보이는 험로', next: ['jiri_peak'], pois: { TREASURE: 2, PEOPLE: 2, HISTORY: 1 } },
      { id: 'jiri_peak', name: '천왕봉', terrain: 'MOUNTAIN', days: 18, hint: '운해 위로 해가 솟는 봉우리', next: [], pois: { VISTA: 1, SHRINE: 1, TREASURE: 1 }, vista: 'vista_jiri' },
    ],
  },
  {
    id: 'KR_GEUMGANG',
    country: 'KOREA',
    name: '금강산',
    hanja: '金剛山',
    blurb: '일만이천 봉. 선비들의 유람 길이자 수행승들의 도량. 위험은 적고 깨달음은 깊다.',
    danger: 0.3,
    beast: { name: '외금강 반달곰', title: '굶주린 곰' },
    bandit: { name: '고성 길목 노상강도', title: '유람객을 노리는 패거리' },
    palette: { sky: ['#1e3a5f', '#cbd5e1'], far: '#64748b', mid: '#475569', near: '#334155', ground: '#4b5563', accent: '#0ea5e9' },
    startLeg: 'gg_danbal',
    legs: [
      { id: 'gg_danbal', name: '단발령', terrain: 'PASS', days: 14, hint: '이 고개에서 금강을 보면 머리를 깎고 싶어진다 했다', next: ['gg_jangan', 'gg_coast'], pois: { INN: 2, PEOPLE: 2, HISTORY: 1 } },
      { id: 'gg_jangan', name: '장안사 계곡', terrain: 'TEMPLE', days: 16, hint: '고찰과 승방 — 노승이 머문다', next: ['gg_manpok', 'gg_inner'], pois: { SHRINE: 2, MASTER: 1, PEOPLE: 2, TREASURE: 1 } },
      { id: 'gg_coast', name: '해금강 바닷길', terrain: 'COAST', days: 16, hint: '바위섬과 파도 — 난파선 소문', next: ['gg_outer'], pois: { TREASURE: 3, PEOPLE: 2, INN: 1 } },
      { id: 'gg_manpok', name: '만폭동', terrain: 'RIVER', days: 18, hint: '만 개의 폭포가 쏟아지는 골짜기', next: ['gg_inner'], pois: { TREASURE: 2, SHRINE: 1, MASTER: 1 } },
      { id: 'gg_outer', name: '외금강 옥류동', terrain: 'MOUNTAIN', days: 18, hint: '옥 같은 물길 끝의 구룡폭포', next: [], pois: { VISTA: 1, MASTER: 1, PEOPLE: 1 }, vista: 'vista_geumgang' },
      { id: 'gg_inner', name: '비로봉 길', terrain: 'MOUNTAIN', days: 18, hint: '금강의 가장 높은 곳', next: [], pois: { MASTER: 2, TREASURE: 1, SHRINE: 1 } },
    ],
  },
  {
    id: 'KR_GWANSEO',
    country: 'KOREA',
    name: '의주대로',
    hanja: '義州大路',
    blurb: '한양에서 의주까지 사신과 장사꾼이 오가는 큰길. 역참과 장시, 그리고 관서 사람들의 울분.',
    danger: 0.5,
    beast: { name: '묘향산 늑대 무리', title: '겨울 굶주린 늑대' },
    bandit: { name: '청천강 나루 무뢰배', title: '밀무역꾼의 칼잡이들' },
    palette: { sky: ['#292524', '#d6d3d1'], far: '#78716c', mid: '#57534e', near: '#44403c', ground: '#57534e', accent: '#dc2626' },
    startLeg: 'gs_hongje',
    legs: [
      { id: 'gs_hongje', name: '홍제원 역참', terrain: 'ROAD', days: 14, hint: '중국 가는 사신이 묵는 역참', next: ['gs_gaeseong', 'gs_market'], pois: { INN: 2, PEOPLE: 2, HISTORY: 2 } },
      { id: 'gs_gaeseong', name: '송도(개성) 장시', terrain: 'TOWN', days: 15, hint: '송상(松商)의 인삼 거래가 오가는 저자', next: ['gs_pyongyang'], pois: { INN: 1, PEOPLE: 3, HISTORY: 1, TREASURE: 1 } },
      { id: 'gs_market', name: '수원 가는 샛길', terrain: 'ROAD', days: 15, hint: '새 성을 쌓는다는 고을', next: ['gs_pyongyang'], pois: { HISTORY: 3, PEOPLE: 2 } },
      { id: 'gs_pyongyang', name: '평양 대동문', terrain: 'TOWN', days: 16, hint: '대동강 물결과 관서의 큰 고을', next: ['gs_myohyang', 'gs_jeongju'], pois: { INN: 2, PEOPLE: 2, MASTER: 1, HISTORY: 1 } },
      { id: 'gs_myohyang', name: '묘향산 보현사', terrain: 'TEMPLE', days: 18, hint: '서산대사가 머물던 산 — 승병의 무예가 남았다', next: [], pois: { MASTER: 2, SHRINE: 2, TREASURE: 1 } },
      { id: 'gs_jeongju', name: '정주성과 청천강', terrain: 'RIVER', days: 18, hint: '관서 사람들의 울분이 들끓는 고을', next: [], pois: { HISTORY: 3, PEOPLE: 2, TREASURE: 1 } },
    ],
  },
  // ───────────── 청 ─────────────
  {
    id: 'CN_HUASHAN',
    country: 'CHINA',
    name: '화산',
    hanja: '華山',
    blurb: '오악 중 가장 험한 산. 절벽에 매단 판자길과 도관, 그리고 검을 숭상하는 이들.',
    danger: 0.7,
    beast: { name: '진령 표범', title: '절벽을 타는 표범' },
    bandit: { name: '관중 녹림 호한', title: '산길 통행세를 받는 녹림' },
    palette: { sky: ['#1c1917', '#e7e5e4'], far: '#57534e', mid: '#44403c', near: '#292524', ground: '#44403c', accent: '#a855f7' },
    startLeg: 'hs_yuquan',
    legs: [
      { id: 'hs_yuquan', name: '옥천원 산문', terrain: 'TEMPLE', days: 14, hint: '산 아래 도관과 객잔', next: ['hs_qianchi', 'hs_village'], pois: { INN: 2, PEOPLE: 2, SHRINE: 1, HISTORY: 1 } },
      { id: 'hs_qianchi', name: '천척당', terrain: 'PASS', days: 16, hint: '쇠사슬을 잡고 오르는 깎아지른 계단', next: ['hs_north', 'hs_plank'], pois: { TREASURE: 2, MASTER: 1, PEOPLE: 1 } },
      { id: 'hs_village', name: '화음현 마을', terrain: 'TOWN', days: 15, hint: '산을 지키는 마을 — 녹림이 들끓는다', next: ['hs_north'], pois: { PEOPLE: 3, HISTORY: 2, INN: 1 } },
      { id: 'hs_north', name: '북봉 운대', terrain: 'MOUNTAIN', days: 17, hint: '구름 위에 걸린 봉우리', next: ['hs_plank', 'hs_south'], pois: { MASTER: 2, SHRINE: 1, TREASURE: 1 } },
      { id: 'hs_plank', name: '장공잔도', terrain: 'PASS', days: 18, hint: '천 길 낭떠러지에 박힌 판자 한 장', next: [], pois: { VISTA: 1, TREASURE: 1 }, vista: 'vista_huashan' },
      { id: 'hs_south', name: '남봉 낙안봉', terrain: 'MOUNTAIN', days: 18, hint: '기러기도 쉬어 간다는 가장 높은 봉', next: [], pois: { MASTER: 2, TREASURE: 2 } },
    ],
  },
  {
    id: 'CN_JIANGNAN',
    country: 'CHINA',
    name: '강남 운하',
    hanja: '江南運河',
    blurb: '소주·양주·항주를 잇는 대운하. 비단과 소금, 표국과 염상, 그리고 황제의 남순.',
    danger: 0.3,
    beast: { name: '태호 수적', title: '호수의 물도둑' },
    bandit: { name: '양주 염효(鹽梟)', title: '밀소금 패거리' },
    palette: { sky: ['#134e4a', '#ccfbf1'], far: '#5eead4', mid: '#2dd4bf', near: '#115e59', ground: '#57534e', accent: '#f59e0b' },
    startLeg: 'jn_yangzhou',
    legs: [
      { id: 'jn_yangzhou', name: '양주 운하 부두', terrain: 'RIVER', days: 14, hint: '염상의 저택과 표국 깃발', next: ['jn_suzhou', 'jn_biaoju'], pois: { INN: 2, PEOPLE: 3, HISTORY: 2 } },
      { id: 'jn_suzhou', name: '소주 원림 골목', terrain: 'TOWN', days: 16, hint: '정원과 찻집 — 문인과 상인', next: ['jn_taihu', 'jn_hangzhou'], pois: { INN: 1, PEOPLE: 2, HISTORY: 2, MASTER: 1 } },
      { id: 'jn_biaoju', name: '표국 호송길', terrain: 'ROAD', days: 16, hint: '표물을 실은 수레 행렬', next: ['jn_hangzhou'], pois: { PEOPLE: 2, HISTORY: 2, TREASURE: 1 } },
      { id: 'jn_taihu', name: '태호 갈대밭', terrain: 'RIVER', days: 17, hint: '수적이 숨는 갈대 바다', next: ['jn_hangzhou'], pois: { TREASURE: 3, PEOPLE: 1 } },
      { id: 'jn_hangzhou', name: '항주 서호', terrain: 'TOWN', days: 17, hint: '서호의 버들과 영은사', next: ['jn_lingyin'], pois: { INN: 1, PEOPLE: 2, MASTER: 1, HISTORY: 1 } },
      { id: 'jn_lingyin', name: '영은사 비래봉', terrain: 'TEMPLE', days: 16, hint: '날아왔다는 봉우리와 석굴 불상', next: [], pois: { SHRINE: 2, TREASURE: 2, MASTER: 1 } },
    ],
  },
  {
    id: 'CN_HUGUANG',
    country: 'CHINA',
    name: '호광·사천 산지',
    hanja: '湖廣·四川',
    blurb: '유민이 흘러드는 산골. 백련교와 향용, 묘강의 독술. 무당산 금정이 구름 위에 떠 있다.',
    danger: 0.9,
    beast: { name: '대파산 흑곰', title: '사람을 해친 곰' },
    bandit: { name: '유민 출신 산적 두령', title: '굶주림이 만든 도적' },
    palette: { sky: ['#14532d', '#d9f99d'], far: '#4d7c0f', mid: '#3f6212', near: '#1a2e05', ground: '#3f3f2e', accent: '#e11d48' },
    startLeg: 'hg_xiangyang',
    legs: [
      { id: 'hg_xiangyang', name: '양양 성 밖', terrain: 'TOWN', days: 14, hint: '유민 천막과 관군 초소', next: ['hg_refugee', 'hg_wudang'], pois: { INN: 1, PEOPLE: 3, HISTORY: 3 } },
      { id: 'hg_refugee', name: '유민 산채 골짜기', terrain: 'FOREST', days: 17, hint: '쫓겨난 이들이 모인 골짜기', next: ['hg_miao', 'hg_daba'], pois: { PEOPLE: 3, HISTORY: 2, TREASURE: 1 } },
      { id: 'hg_wudang', name: '무당산 신도', terrain: 'TEMPLE', days: 17, hint: '도관이 늘어선 순례길', next: ['hg_jinding'], pois: { SHRINE: 2, MASTER: 2, INN: 1 } },
      { id: 'hg_miao', name: '묘강 경계', terrain: 'FOREST', days: 18, hint: '독과 고(蠱)의 소문이 도는 숲', next: [], pois: { MASTER: 2, TREASURE: 2, PEOPLE: 1 } },
      { id: 'hg_daba', name: '대파산 고개', terrain: 'PASS', days: 18, hint: '곰과 산적이 함께 사는 고개', next: [], pois: { TREASURE: 2, PEOPLE: 2, HISTORY: 1 } },
      { id: 'hg_jinding', name: '무당산 금정', terrain: 'MOUNTAIN', days: 17, hint: '구름 위 구리 전각', next: [], pois: { VISTA: 1, MASTER: 1, SHRINE: 1 }, vista: 'vista_wudang' },
    ],
  },
  // ───────────── 일본 ─────────────
  {
    id: 'JP_TOKAIDO',
    country: 'JAPAN',
    name: '도카이도',
    hanja: '東海道',
    blurb: '에도에서 교토까지 쉰세 역참. 순례자, 상인, 낭인, 그리고 도장을 도는 무사수행자들.',
    danger: 0.45,
    beast: { name: '하코네 들개 떼', title: '고개의 들개' },
    bandit: { name: '고마비키 무뢰 낭인', title: '노자를 뺏는 떠돌이 칼잡이' },
    palette: { sky: ['#1e1b4b', '#e0e7ff'], far: '#6366f1', mid: '#4338ca', near: '#1e1b4b', ground: '#44403c', accent: '#dc2626' },
    startLeg: 'tk_nihonbashi',
    legs: [
      { id: 'tk_nihonbashi', name: '니혼바시~시나가와', terrain: 'TOWN', days: 14, hint: '에도의 시작 — 도장 간판이 즐비하다', next: ['tk_hakone', 'tk_coast'], pois: { INN: 2, PEOPLE: 2, HISTORY: 2, MASTER: 1 } },
      { id: 'tk_hakone', name: '하코네 관문', terrain: 'PASS', days: 16, hint: '통행증을 검사하는 세키쇼', next: ['tk_fuji'], pois: { HISTORY: 2, PEOPLE: 2, INN: 1 } },
      { id: 'tk_coast', name: '사타 고개 해안', terrain: 'COAST', days: 15, hint: '파도 너머 후지가 보이는 길', next: ['tk_fuji'], pois: { PEOPLE: 2, TREASURE: 2, INN: 1 } },
      { id: 'tk_fuji', name: '스루가 후지 들판', terrain: 'ROAD', days: 17, hint: '후지산을 끼고 도는 역참길', next: ['tk_oi', 'tk_dojo'], pois: { PEOPLE: 2, HISTORY: 1, TREASURE: 1, SHRINE: 1 } },
      { id: 'tk_oi', name: '오이강 나루', terrain: 'RIVER', days: 16, hint: '말로는 넘어도 다리는 없는 강', next: [], pois: { PEOPLE: 2, MASTER: 1, TREASURE: 1 } },
      { id: 'tk_dojo', name: '나고야 도장 거리', terrain: 'TOWN', days: 17, hint: '타류시합을 받아 주는 도장들', next: [], pois: { MASTER: 2, HISTORY: 2, INN: 1 } },
    ],
  },
  {
    id: 'JP_KYOTO',
    country: 'JAPAN',
    name: '교토·나라',
    hanja: '京·奈良',
    blurb: '천년 고도. 고찰과 신사, 검술 원류의 전설. 밤의 구라마산에는 천구가 나온다 했다.',
    danger: 0.3,
    beast: { name: '나라 숲 멧돼지', title: '성난 멧돼지' },
    bandit: { name: '라쇼몬 밤도둑', title: '폐허에 숨은 도적' },
    palette: { sky: ['#3b0764', '#fae8ff'], far: '#a78bfa', mid: '#7c3aed', near: '#2e1065', ground: '#44403c', accent: '#f43f5e' },
    startLeg: 'ky_sanjo',
    legs: [
      { id: 'ky_sanjo', name: '산조 대교', terrain: 'TOWN', days: 14, hint: '도카이도의 끝, 교토의 입구', next: ['ky_gion', 'ky_nara'], pois: { INN: 2, PEOPLE: 2, HISTORY: 2 } },
      { id: 'ky_gion', name: '기온 신사 거리', terrain: 'TEMPLE', days: 15, hint: '등롱이 늘어선 참배길', next: ['ky_kurama'], pois: { SHRINE: 2, PEOPLE: 2, TREASURE: 1 } },
      { id: 'ky_nara', name: '나라 고찰길', terrain: 'TEMPLE', days: 17, hint: '대불과 사슴 — 야규의 마을이 가깝다', next: ['ky_yagyu'], pois: { SHRINE: 2, TREASURE: 2, PEOPLE: 1 } },
      { id: 'ky_kurama', name: '구라마산 삼나무 숲', terrain: 'FOREST', days: 18, hint: '어린 우시와카가 천구에게 검을 배운 숲', next: [], pois: { VISTA: 1, MASTER: 1, TREASURE: 1 }, vista: 'vista_kurama' },
      { id: 'ky_yagyu', name: '야규 마을', terrain: 'FOREST', days: 17, hint: '신카게류 야규 일족의 고향', next: [], pois: { MASTER: 2, TREASURE: 1, PEOPLE: 1 } },
    ],
  },
  {
    id: 'JP_KYUSHU',
    country: 'JAPAN',
    name: '규슈·나가사키',
    hanja: '九州·長崎',
    blurb: '데지마의 화란 상관과 표류선, 사쓰마의 지겐류, 연기를 뿜는 화산. 바다 너머가 가장 가까운 땅.',
    danger: 0.7,
    beast: { name: '기리시마 멧돼지', title: '화산 숲의 멧돼지' },
    bandit: { name: '고토 열도 해적', title: '밀무역 해적' },
    palette: { sky: ['#7c2d12', '#fed7aa'], far: '#9a3412', mid: '#7c2d12', near: '#431407', ground: '#44403c', accent: '#0ea5e9' },
    startLeg: 'ks_nagasaki',
    legs: [
      { id: 'ks_nagasaki', name: '나가사키 항구', terrain: 'COAST', days: 15, hint: '데지마의 화란 깃발과 당인 거리', next: ['ks_dejima', 'ks_unzen'], pois: { INN: 2, PEOPLE: 2, HISTORY: 3 } },
      { id: 'ks_dejima', name: '데지마 앞 바다', terrain: 'COAST', days: 15, hint: '표류선과 밀무역의 바다', next: ['ks_satsuma'], pois: { TREASURE: 3, PEOPLE: 2, HISTORY: 1 } },
      { id: 'ks_unzen', name: '운젠 지옥', terrain: 'MOUNTAIN', days: 17, hint: '유황 연기가 솟는 온천 지옥', next: ['ks_satsuma'], pois: { SHRINE: 1, TREASURE: 2, PEOPLE: 1, HISTORY: 1 } },
      { id: 'ks_satsuma', name: '사쓰마 가고시마', terrain: 'TOWN', days: 17, hint: '지겐류의 기합이 울리는 성하 마을', next: ['ks_sakurajima', 'ks_kirishima'], pois: { MASTER: 2, PEOPLE: 2, INN: 1 } },
      { id: 'ks_sakurajima', name: '사쿠라지마 해안', terrain: 'COAST', days: 16, hint: '바다 위에서 재를 뿜는 화산', next: [], pois: { VISTA: 1, TREASURE: 1 }, vista: 'vista_sakurajima' },
      { id: 'ks_kirishima', name: '기리시마 신궁', terrain: 'TEMPLE', days: 17, hint: '천손이 내려왔다는 봉우리', next: [], pois: { SHRINE: 2, MASTER: 1, TREASURE: 1 } },
    ],
  },
];

export function getRegion(id: JourneyRegionId | undefined): JourneyRegion {
  return JOURNEY_REGIONS.find((r) => r.id === id) || JOURNEY_REGIONS[0];
}

export function getLeg(region: JourneyRegion, legId: string): JourneyLeg {
  return region.legs.find((l) => l.id === legId) || region.legs[0];
}

export function regionsForCountry(country: CountryId): JourneyRegion[] {
  return JOURNEY_REGIONS.filter((r) => r.country === country);
}

// ───────────── 길 위의 풍문 (연도별) ─────────────
// 걷는 동안 화면 아래로 흘러가는 그 해의 소문. 연도 범위가 맞는 것만 나온다.
interface Rumor {
  from: number;
  to: number;
  text: string;
}

const RUMORS: Record<CountryId, Rumor[]> = {
  KOREA: [
    { from: 1750, to: 1756, text: '균역법으로 군포가 두 필에서 한 필로 줄었다더라. 대신 어염세를 거둔다지.' },
    { from: 1750, to: 1776, text: '상감께서 탕평을 하신다고, 노론 소론 가리지 않고 쓰신다 하네.' },
    { from: 1759, to: 1762, text: '세자 저하께서 대리청정 중에 무예 열여덟 가지를 책으로 엮으셨다는구먼.' },
    { from: 1762, to: 1766, text: '…그 여름 일은 입에 담지 말게. 뒤주 이야기는 함부로 하는 게 아니야.' },
    { from: 1763, to: 1770, text: '통신사가 대마도에서 감저(甘藷)라는 뿌리를 가져왔다지. 흉년에 먹을 수 있다고.' },
    { from: 1776, to: 1790, text: '새 임금께서 규장각을 세우고 서얼도 검서관으로 쓰신다더라.' },
    { from: 1785, to: 1800, text: '서학 책을 읽다 잡혀간 양반이 있다네. 천주라나 뭐라나.' },
    { from: 1790, to: 1800, text: '『무예도보통지』가 나왔대. 조선·중국·왜의 무예 스물네 가지를 그림까지 붙여 실었다지.' },
    { from: 1793, to: 1800, text: '장용영이 커졌어. 수원에 새 성을 쌓고 군사를 기른다더군.' },
    { from: 1800, to: 1830, text: '상감이 어리시니 외척이 나랏일을 쥐고 흔든다네. 벼슬도 돈으로 산다지.' },
    { from: 1801, to: 1806, text: '서학쟁이들을 잡아들이는 바람에 산골로 숨어든 사람이 많대.' },
    { from: 1808, to: 1812, text: '평안도 놈은 과거에 붙어도 벼슬을 안 준다며 관서 사람들 원성이 자자해.' },
    { from: 1811, to: 1813, text: '가산 다복동에서 홍경래라는 자가 들고일어났다네! 정주성이 넘어갔대.' },
    { from: 1821, to: 1823, text: '서쪽에서 괴질이 번진다. 토하고 설사하다 하루 만에 죽는다더라.' },
    { from: 1750, to: 1830, text: '호랑이가 또 내려와 아이를 물어 갔대. 산에 갈 땐 꼭 둘이 다니게.' },
    { from: 1750, to: 1830, text: '장시가 닷새마다 서니, 장돌뱅이는 길 위에서 늙는다네.' },
  ],
  CHINA: [
    { from: 1750, to: 1785, text: '만세야(萬歲爺)께서 또 강남으로 남순하신다지. 운하 길을 새로 닦느라 난리다.' },
    { from: 1755, to: 1760, text: '서역 준가르를 쳐서 천산 너머까지 판도에 넣었다는군.' },
    { from: 1757, to: 1830, text: '양인(洋人)들은 이제 광주 한 곳에서만 장사할 수 있다네. 공행(公行)이 다 쥐고 있지.' },
    { from: 1774, to: 1776, text: '산동 임청에서 청수교 왕륜이 들고일어났다가 불타 죽었다더군.' },
    { from: 1786, to: 1789, text: '대만에서 천지회 임상문이 난을 일으켰대. 바다 건너까지 군사를 보낸다고.' },
    { from: 1793, to: 1795, text: '영길리(英吉利)라는 나라 사신이 열하까지 와서 무릎을 안 꿇었다지 뭐야.' },
    { from: 1796, to: 1805, text: '백련교도가 호북·사천·섬서를 휩쓴다! 향용을 모아 마을을 지키라는 방이 붙었어.' },
    { from: 1799, to: 1802, text: '화신(和珅)이 죽었대. 그 집에서 나온 은이 나라 몇 해 세입이라나.' },
    { from: 1810, to: 1830, text: '아편이 광주에서 강남까지 번졌어. 은이 바다 밖으로 빠져나간다고 다들 걱정이야.' },
    { from: 1813, to: 1815, text: '천리교 무리가 자금성 안까지 쳐들어갔대! 황자께서 조총으로 막으셨다나.' },
    { from: 1771, to: 1830, text: '하남 진가구 사람들 권법이 묘하다지. 힘을 빼고 흘려서 사람을 날린다는군.' },
    { from: 1750, to: 1830, text: '표국 깃발 단 수레는 녹림도 함부로 못 건드린다지. 그게 다 의리 장사야.' },
  ],
  JAPAN: [
    { from: 1750, to: 1767, text: '나카니시 도장에서는 죽도와 방구(防具)를 쓰고 마음껏 친다더군. 형(形)만 하던 시절은 끝났어.' },
    { from: 1758, to: 1760, text: '교토에서 공가들이 신도 강의를 듣다 처벌받았대. 호레키 사건이라나.' },
    { from: 1767, to: 1786, text: '다누마 님 세상이야. 뭐든 뇌물이면 다 된다니까.' },
    { from: 1772, to: 1774, text: '메와쿠(迷惑)한 해라더니, 에도가 절반이나 탔다는군.' },
    { from: 1782, to: 1789, text: '덴메이 흉년이 몇 해째야. 북쪽에선 사람이 사람을 먹었다는 소문도 있어.' },
    { from: 1783, to: 1785, text: '아사마산이 터져서 재가 에도까지 날아왔대. 하늘이 한 달 내내 잿빛이었다지.' },
    { from: 1787, to: 1794, text: '마쓰다이라 님이 사치를 금하고 주자학 말고는 가르치지 말라 하신다네.' },
    { from: 1792, to: 1794, text: '에조치 네무로에 로시아 배가 왔대. 표류했던 고다유라는 뱃사람을 데려왔다는군.' },
    { from: 1792, to: 1794, text: '시마바라에서 산이 무너져 바다로 쏟아졌다지. 「시마바라 대변, 히고 메와쿠」라고.' },
    { from: 1808, to: 1810, text: '나가사키에 영길리 군함이 화란 깃발을 달고 들어왔대. 부교님이 책임지고 배를 가르셨다고.' },
    { from: 1825, to: 1830, text: '이국선은 보이는 대로 쫓아내라는 영이 내렸다네.' },
    { from: 1750, to: 1830, text: '무사수행 중인 젊은이들이 도장마다 타류시합을 청하고 다닌다더군.' },
    { from: 1750, to: 1830, text: '이세 참배를 가는 사람들이 올해도 길을 메웠어. 오카게마이리라더군.' },
  ],
};

export function rumorsFor(country: CountryId, year: number): string[] {
  return RUMORS[country].filter((r) => year >= r.from && year <= r.to).map((r) => r.text);
}

export const SEASON_FIELD_LABEL: Record<Season, string> = {
  SPRING: '봄',
  SUMMER: '여름',
  AUTUMN: '가을',
  WINTER: '겨울',
};
