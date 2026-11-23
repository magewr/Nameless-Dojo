import { CountryId, DifficultyId, GameState, SectKind, SectStance, SectState } from '../types/game';
import { DIFFICULTY_CONFIGS, getDifficultyConfig } from './difficulty';
import { josa } from '../utils/korean';

// "【청운검관】이" — 괄호 속 한자를 떼고 받침에 맞는 조사를 붙인다.
export function sectTag(name: string, pair?: '이가' | '은는' | '을를' | '과와'): string {
  const short = name.replace(/\(.*?\)/g, '');
  return pair ? `【${short}】${josa(short, pair).slice(short.length)}` : `【${short}】`;
}

// 강호의 다른 문파들.
// 나라마다 네 곳: 숙적의 문파 · 정파의 어른 · 흑도 무리 · 상단의 표국.
// 관계(relation)는 -100 ~ 100, 한 해에 조금씩 "세평이 가리키는 자리"로 움직이고 사건이 크게 흔든다.

interface SectTemplate {
  id: string;
  name: string;
  kind: SectKind;
  leaderTitle: string;
  leader: string; // 숙적의 문파는 게임을 만들 때 숙적 이름으로 바꾼다
  champion: string;
  style: string;
  power: number;
  baseRelation: number;
  meetFame: number; // 이만큼 이름이 나면 서로를 의식하기 시작한다
}

const SECT_TEMPLATES: Record<CountryId, SectTemplate[]> = {
  KOREA: [
    { id: 'sect_rival', name: '청운검관(靑雲劍館)', kind: 'RIVAL', leaderTitle: '관주', leader: '', champion: '수제자 한율', style: '무반가에 대대로 내려온 정통 검법. 격식과 실력을 함께 따진다.', power: 52, baseRelation: -8, meetFame: 9999 },
    { id: 'sect_orthodox', name: '백운검파(白雲劍派)', kind: 'ORTHODOX', leaderTitle: '장문인', leader: '백운검선', champion: '수제자 설청', style: '산중에서 검과 도를 함께 닦는 정파의 어른. 인덕과 구도를 높이 산다.', power: 80, baseRelation: 0, meetFame: 90 },
    { id: 'sect_outlaw', name: '흑호문(黑虎門)', kind: 'OUTLAW', leaderTitle: '문주', leader: '마철구', champion: '독사 염칠', style: '장터와 나루의 이권을 쥔 왈패 무리. 이름난 도장을 눈엣가시로 여긴다.', power: 55, baseRelation: -12, meetFame: 45 },
    { id: 'sect_merchant', name: '송악표국(松嶽鏢局)', kind: 'MERCHANT', leaderTitle: '국주', leader: '황보석', champion: '표두 장만석', style: '개성 상단의 짐을 지키는 표사 집단. 셈이 밝고 신용을 무엇보다 따진다.', power: 48, baseRelation: 4, meetFame: 30 },
  ],
  CHINA: [
    { id: 'sect_rival', name: '심가표국(沈家鏢局)', kind: 'RIVAL', leaderTitle: '총표두', leader: '', champion: '소표두 심량', style: '강남 물길을 주름잡는 명문 표국. 권법과 체면을 함께 판다.', power: 56, baseRelation: -6, meetFame: 9999 },
    { id: 'sect_orthodox', name: '화산파(華山派)', kind: 'ORTHODOX', leaderTitle: '장문인', leader: '자하검존', champion: '매화검수 능소', style: '매화 검법으로 이름 높은 정파의 기둥. 인덕과 구도를 높이 산다.', power: 84, baseRelation: 0, meetFame: 90 },
    { id: 'sect_outlaw', name: '흑룡방(黑龍幇)', kind: 'OUTLAW', leaderTitle: '방주', leader: '사천귀', champion: '쌍도 여삼', style: '운하의 밀수와 도박장을 쥔 흑도 방파. 이름난 무관을 눈엣가시로 여긴다.', power: 58, baseRelation: -12, meetFame: 45 },
    { id: 'sect_merchant', name: '금전표국(金錢鏢局)', kind: 'MERCHANT', leaderTitle: '국주', leader: '전만금', champion: '철장 곽노대', style: '금릉 상인들이 돈을 모아 세운 표국. 셈이 밝고 신용을 무엇보다 따진다.', power: 50, baseRelation: 4, meetFame: 30 },
  ],
  JAPAN: [
    { id: 'sect_rival', name: '쿠로다 도장(黒田道場)', kind: 'RIVAL', leaderTitle: '도장주', leader: '', champion: '사범대 사카키', style: '에도에서 손꼽히는 명문 검술 도장. 문벌과 격식을 앞세운다.', power: 54, baseRelation: -10, meetFame: 9999 },
    { id: 'sect_orthodox', name: '신카게류 본가(新陰流本家)', kind: 'ORTHODOX', leaderTitle: '종가', leader: '야규 쥬베이', champion: '사범대 오노 타다시', style: '쇼군가의 검술 사범을 지낸 유파의 본가. 인덕과 구도를 높이 산다.', power: 82, baseRelation: 0, meetFame: 90 },
    { id: 'sect_outlaw', name: '아카오니구미(赤鬼組)', kind: 'OUTLAW', leaderTitle: '두목', leader: '오니마루 진파치', champion: '낭인 가게로', style: '낭인과 노름꾼이 모인 무뢰배 조직. 이름난 도장을 눈엣가시로 여긴다.', power: 56, baseRelation: -12, meetFame: 45 },
    { id: 'sect_merchant', name: '나니와 경호조(浪花警固組)', kind: 'MERCHANT', leaderTitle: '조장', leader: '에치고야 소베에', champion: '봉술 사범 긴조', style: '오사카 쌀 상인들의 짐과 금고를 지키는 경호 조합. 셈이 밝고 신용을 무엇보다 따진다.', power: 48, baseRelation: 4, meetFame: 30 },
  ],
};

export const SECT_KIND_LABEL: Record<SectKind, string> = {
  RIVAL: '숙적의 문파',
  ORTHODOX: '정파',
  OUTLAW: '흑도',
  MERCHANT: '표국',
  SPLINTER: '갈라져 나간 분파',
};

// 무엇을 보고 호감·반감을 품는가 (화면 안내용)
export const SECT_KIND_TASTE: Record<SectKind, { likes: string; dislikes: string }> = {
  RIVAL: { likes: '숙적과 쌓은 우의, 예를 갖춘 교류', dislikes: '숙적과의 악연, 문하생끼리의 싸움' },
  ORTHODOX: { likes: '높은 인덕과 구도', dislikes: '살기와 이단의 소문' },
  OUTLAW: { likes: '두려워할 만한 살기', dislikes: '이름난 도장의 인덕, 장터 이권을 건드리는 일' },
  MERCHANT: { likes: '높은 상무, 예물과 신용', dislikes: '떼인 돈, 짐을 맡길 수 없는 평판' },
  SPLINTER: { likes: '옛 스승의 사과', dislikes: '본가의 번성' },
};

export const STANCE_LABEL: Record<SectStance, string> = {
  HOSTILE: '적대',
  COLD: '냉랭',
  NEUTRAL: '중립',
  FRIENDLY: '우호',
  ALLIED: '동맹',
};

export function getSectStance(sect: Pick<SectState, 'relation' | 'allied'>): SectStance {
  if (sect.allied) return 'ALLIED';
  if (sect.relation <= -50) return 'HOSTILE';
  if (sect.relation <= -15) return 'COLD';
  if (sect.relation < 25) return 'NEUTRAL';
  return 'FRIENDLY';
}

// 동맹이 주는 계절 혜택 (화면 안내용 문구와 실제 효과가 같은 표를 본다)
export const ALLY_PERK: Record<SectKind, string> = {
  RIVAL: '합동 수련 — 해마다 통찰 +1, 문하생 수련 효율↑',
  ORTHODOX: '정파의 벗 — 계절마다 명성 +3',
  OUTLAW: '뒷골목의 묵인 — 살수·시비가 줄어든다',
  MERCHANT: '교역의 몫 — 계절마다 수입이 들어온다',
  SPLINTER: '화해한 분가 — 계절마다 명성 +2',
};

export function createInitialSects(country: CountryId, rivalName: string, difficulty: DifficultyId = 'EASY'): SectState[] {
  const hostility = DIFFICULTY_CONFIGS[difficulty].sectHostility;
  return SECT_TEMPLATES[country].map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    leaderTitle: t.leaderTitle,
    leader: t.kind === 'RIVAL' ? rivalName : t.leader,
    champion: t.champion,
    style: t.style,
    // 험한 난이도일수록 흑도와 숙적의 문파가 처음부터 날이 서 있다.
    relation: t.baseRelation - (t.kind === 'OUTLAW' ? hostility : t.kind === 'RIVAL' ? Math.round(hostility * 0.6) : Math.round(hostility * 0.25)),
    power: t.power,
    met: false,
    history: [],
  }));
}

export function getSectMeetFame(sect: SectState, country: CountryId): number {
  return SECT_TEMPLATES[country].find((t) => t.id === sect.id)?.meetFame ?? 0;
}

export function getSects(state: Pick<GameState, 'sects'>): SectState[] {
  return state.sects || [];
}

export function metSects(state: Pick<GameState, 'sects'>): SectState[] {
  return getSects(state).filter((s) => s.met);
}

// 가장 사이가 나쁜 문파 (기준보다 나쁠 때만)
export function worstSect(state: Pick<GameState, 'sects'>, atMost = -15): SectState | null {
  const list = metSects(state).filter((s) => s.relation <= atMost);
  if (list.length === 0) return null;
  return list.reduce((a, b) => (b.relation < a.relation ? b : a));
}

// 가장 사이가 좋은 문파 (기준보다 좋을 때만)
export function bestSect(state: Pick<GameState, 'sects'>, atLeast = 40): SectState | null {
  const list = metSects(state).filter((s) => s.relation >= atLeast);
  if (list.length === 0) return null;
  return list.reduce((a, b) => (b.relation > a.relation ? b : a));
}

// 세평이 가리키는 관계의 자리. 한 해에 이쪽으로 조금씩 움직인다.
export function getRelationTarget(sect: SectState, state: GameState): number {
  const rep = state.reputation;
  const hostility = getDifficultyConfig(state).sectHostility;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  switch (sect.kind) {
    case 'RIVAL':
      return clamp(state.rival.friendship - 20 - hostility * 0.5, -60, 70);
    case 'ORTHODOX':
      return clamp((rep.virtue + rep.ascetic * 0.6 - rep.ruthless * 1.3 - rep.arcane * 1.6) * 0.35 - hostility * 0.3, -60, 45);
    case 'OUTLAW':
      // 이름이 날수록, 인덕이 높을수록 눈엣가시. 살기가 높으면 함부로 건드리지 못한다.
      return clamp(-18 - Math.min(40, state.fame / 60) - Math.min(20, rep.virtue * 0.08) + Math.min(45, rep.ruthless * 0.5) - hostility, -85, 30);
    case 'MERCHANT':
      return clamp(rep.commerce * 0.5 - 8 + (state.debt > 0 ? -12 : 0) - hostility * 0.2, -35, 45);
    case 'SPLINTER':
      return clamp(-45 - hostility * 0.5, -80, -20);
  }
}

export function sectLeaderLabel(sect: SectState, state: Pick<GameState, 'rival'>): string {
  if (sect.kind === 'RIVAL' && !state.rival.alive) return `2대 ${sect.leaderTitle} (${sect.leader}의 수제자)`;
  return `${sect.leaderTitle} ${sect.leader}`;
}
