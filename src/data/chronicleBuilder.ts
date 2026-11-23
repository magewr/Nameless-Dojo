import { LifeMilestone } from '../types/game';
import { josa } from '../utils/korean';
import {
  ALT_HISTORY,
  DEGRADED_TAIL,
  DEGRADED_TAIL_SMALL,
  ENDING_TITLES,
  EXTINCT,
  FLOURISH_TAIL,
  MODERN,
  MODERN_IMAGE,
  RESPONSE_DARK_AGE,
  RESPONSE_GUNPOWDER,
  RESPONSE_UPHEAVAL,
  SCATTERED_TAIL,
  STAGES,
  SUCCESSION_OPENING,
  TITLE_ALT_HISTORY,
  TITLE_EXTINCT,
  TITLE_ONE_TRICK,
} from './chronicleText';
import { pickVignettes, VignetteDef } from './chronicleVignettes';
import { AXIS_LABEL, findMilestone, LineageFacts, seededUnit } from './lineageFacts';

// 사후 연대기 조립기.
// 뼈대 5장면(계승 → 격변 → 총포의 시대 → 20세기 전반 → 오늘날) 사이에 개인 삽화를 끼워 한 줄의 연대기를 만든다.

export interface ChronicleCause {
  text: string;
  year?: number; // 생전 사건 기록이 있을 때만
  season?: LifeMilestone['season'];
  age?: number;
}

export interface ChronicleEntry {
  yearLabel: string;
  headline: string;
  body: string;
  badge?: string;
  kind?: 'SPINE' | 'VIGNETTE';
  image?: string; // 장면 배경. 비어 있으면 화면 쪽에서 기본 배경을 쓴다.
  cause?: ChronicleCause; // 어느 생전의 선택이 이 장면을 낳았는가
}

export interface ChronicleResult {
  endingTitle: string;
  routeTag: string; // "인덕 · 중견 · 계승 열화"처럼 이 연대기가 무엇으로 조립되었는지
  chronicle: ChronicleEntry[];
}

type Particle = '이가' | '은는' | '을를' | '과와';
interface Token {
  raw: string; // 받침 판정에 쓰는 알맹이
  open?: string;
  close?: string;
}
type Tokens = Record<string, Token>;

const tok = (raw: string, open = '', close = ''): Token => ({ raw, open, close });

// "{SECT|은는}" → "【무명도장】은". 괄호 안 알맹이의 받침으로 조사를 고른다.
function fill(template: string, tokens: Tokens): string {
  return template.replace(/\{([A-Z_]+)(?:\|(이가|은는|을를|과와))?\}/g, (whole, key: string, particle?: Particle) => {
    const t = tokens[key];
    if (!t) return whole;
    const wrapped = `${t.open || ''}${t.raw}${t.close || ''}`;
    if (!particle) return wrapped;
    return wrapped + josa(t.raw, particle).slice(t.raw.length);
  });
}

const SCALE_LABEL = { SMALL: '소도장', MEDIUM: '중견 문파', GRAND: '대문파' } as const;
const SUCCESSION_LABEL = { NONE: '단절', SCATTERED: '후계 미지명', DEGRADED: '계승 열화', INTACT: '온전한 계승', FLOURISH: '청출어람' } as const;

function causeFrom(facts: LineageFacts, keyPrefix: string | undefined, fallback: string | undefined): ChronicleCause | undefined {
  const m = keyPrefix ? findMilestone(facts, keyPrefix) : null;
  if (m) return { text: m.text, year: m.year, season: m.season, age: m.age };
  return fallback ? { text: fallback } : undefined;
}

function buildVignette(v: VignetteDef, facts: LineageFacts, base: Tokens, defaultLabel: string): ChronicleEntry {
  const extra: Tokens = {};
  Object.entries(v.tokens ? v.tokens(facts) : {}).forEach(([k, val]) => {
    // 「…」로 감싸 넘어온 값은 괄호를 떼어 받침을 판정한다.
    const m = /^「(.*)」$/.exec(val);
    extra[k] = m ? tok(m[1], '「', '」') : tok(val);
  });
  const tokens = { ...base, ...extra };
  const pick = <T,>(x: T | ((f: LineageFacts) => T)): T => (typeof x === 'function' ? (x as (f: LineageFacts) => T)(facts) : x);
  return {
    kind: 'VIGNETTE',
    yearLabel: v.yearLabel ? v.yearLabel(facts) : defaultLabel,
    headline: fill(pick(v.headline), tokens),
    body: fill(pick(v.body), tokens),
    badge: '개인사',
    image: pick(v.image),
    cause: causeFrom(facts, v.causeKey, v.causeFallback),
  };
}

export function buildChronicle(facts: LineageFacts): ChronicleResult {
  const { country, axis, scale, succession, deathYear } = facts;

  const whoRaw = scale === 'GRAND' ? '문도들' : scale === 'MEDIUM' ? '제자들' : '맥을 이은 몇 사람';
  const base: Tokens = {
    SECT: tok(facts.sect, '【', '】'),
    SKILL: tok(facts.skillName, '「', '」'),
    FOUNDER: tok(facts.founder),
    HEIR: tok(facts.heir?.name || '후계자'),
    RIVAL: tok(facts.rival.name),
    WHO: { raw: whoRaw, open: `【${facts.sect}】의 ` },
  };
  // 그 시대의 종주가 몇 대째인지: 한 세대를 27년으로 잡는다.
  const withGen = (year: number): Tokens => {
    const n = Math.max(2, 2 + Math.floor((year - deathYear) / 27));
    return { ...base, GEN: tok(facts.heir ? `${n}대 종주` : `${n}대째 전인(傳人)`) };
  };

  const vignettes = pickVignettes(facts);
  const vignettesAt = (pos: VignetteDef['position'], label: string) =>
    vignettes.filter((v) => v.position === pos).map((v) => buildVignette(v, facts, withGen(deathYear + 30), label));

  const routeParts = [AXIS_LABEL[axis], SCALE_LABEL[scale], SUCCESSION_LABEL[succession]];
  if (facts.secondAxis) routeParts.splice(1, 0, `${AXIS_LABEL[facts.secondAxis]} 겸비`);

  // ------------------------------------------------------------------ 단절 루트
  if (succession === 'NONE') {
    const t = withGen(deathYear);
    const chronicle: ChronicleEntry[] = [
      { kind: 'SPINE', yearLabel: `${deathYear + 18}년 (사후 18년)`, headline: EXTINCT[0].headline, body: fill(EXTINCT[0].body, t), badge: '단절' },
      ...vignettesAt('EARLY', '사후 한 세대 무렵'),
      { kind: 'SPINE', yearLabel: `${deathYear + 72}년 무렵 (격동의 19세기)`, headline: EXTINCT[1].headline, body: fill(EXTINCT[1].body, t), image: EXTINCT[1].image },
      ...vignettesAt('MID', '19세기가 저물 무렵'),
      ...vignettesAt('LATE', '20세기 후반'),
      { kind: 'SPINE', yearLabel: '2026년 (오늘날)', headline: EXTINCT[2].headline, body: fill(EXTINCT[2].body, t), image: EXTINCT[2].image },
    ];
    return { endingTitle: TITLE_EXTINCT, routeTag: `${AXIS_LABEL[axis]} · 소도장 · 단절`, chronicle };
  }

  // ------------------------------------------------------------------ 슬롯 1: 계승
  const stages = STAGES[country];
  const firstEraYear = facts.isAltHistory ? ALT_HISTORY[country][0].year : stages[0].year;
  const openingOffset = Math.max(1, Math.min(18, Math.floor((firstEraYear - deathYear) / 2)));
  const opening = SUCCESSION_OPENING[succession];
  const openingEntry: ChronicleEntry = {
    kind: 'SPINE',
    yearLabel: `${deathYear + openingOffset}년 (사후 ${openingOffset}년)`,
    headline: opening.headline,
    body: fill(opening.body, withGen(deathYear)),
    badge: opening.badge,
    cause: facts.heir
      ? causeFrom(facts, 'HEIR_NAMED', undefined)
      : { text: '후계자를 끝내 정하지 않은 채 눈을 감은 일' },
  };

  // ------------------------------------------------------------------ 슬롯 5 꼬리말 (계승 상태)
  const branches = Math.round((scale === 'GRAND' ? 7 : 3) + seededUnit(facts.seed, 'branches') * (scale === 'GRAND' ? 9 : 3));
  const tailTokens: Tokens = { ...base, BRANCHES: tok(String(branches)) };
  let tail = '';
  if (succession === 'DEGRADED') tail = fill(scale === 'SMALL' ? DEGRADED_TAIL_SMALL : DEGRADED_TAIL[axis], tailTokens);
  else if (succession === 'FLOURISH' && scale !== 'SMALL') tail = fill(FLOURISH_TAIL, tailTokens);
  else if (succession === 'SCATTERED' && scale !== 'SMALL') tail = fill(SCATTERED_TAIL, tailTokens);
  const modernCause = causeFrom(facts, 'SECT_NAMED', undefined) || causeFrom(facts, 'FIRST_CRAFT', undefined);

  // ------------------------------------------------------------------ 대체역사 루트
  if (facts.isAltHistory) {
    const alt = ALT_HISTORY[country];
    const eras: ChronicleEntry[] = alt.map((e, i) => ({
      kind: 'SPINE',
      yearLabel: e.yearLabel,
      headline: e.headline,
      body: fill(e.body, withGen(e.year)) + (i === alt.length - 1 ? tail : ''),
      badge: e.badge,
      image: e.image,
      cause: i === 0 ? causeFrom(facts, 'MAGIC_PUBLIC', '사람들 앞에서 이적을 드러낸 선택') : i === alt.length - 1 ? modernCause : undefined,
    }));
    return {
      endingTitle: TITLE_ALT_HISTORY,
      routeTag: [...routeParts, '대체역사'].join(' · '),
      chronicle: [
        openingEntry,
        ...vignettesAt('EARLY', '사후 한 세대 무렵'),
        eras[0],
        eras[1],
        ...vignettesAt('MID', '19세기가 저물 무렵'),
        eras[2],
        ...vignettesAt('LATE', '20세기 후반'),
        eras[3],
      ],
    };
  }

  // ------------------------------------------------------------------ 슬롯 2~4: 시대 무대 + 유파의 대응
  const responses = [RESPONSE_UPHEAVAL[axis], RESPONSE_GUNPOWDER[axis], RESPONSE_DARK_AGE[country][axis]];
  const eras: ChronicleEntry[] = stages.map((stage, i) => ({
    kind: 'SPINE',
    yearLabel: stage.yearLabel,
    headline: responses[i].headline,
    body: `${stage.stage}\n\n${fill(responses[i].body, withGen(stage.year))}`,
    badge: responses[i].badge,
    image: stage.image,
  }));

  // ------------------------------------------------------------------ 슬롯 5: 오늘날
  const modern = MODERN[axis][scale];
  const modernEntry: ChronicleEntry = {
    kind: 'SPINE',
    yearLabel: '2026년 (오늘날)',
    headline: modern.headline,
    body: fill(modern.body, base) + tail,
    badge: modern.badge,
    image: MODERN_IMAGE[scale],
    cause: modernCause,
  };

  return {
    endingTitle: facts.isOneTrick ? TITLE_ONE_TRICK : ENDING_TITLES[axis][scale],
    routeTag: routeParts.join(' · '),
    chronicle: [
      openingEntry,
      ...vignettesAt('EARLY', '사후 한 세대 무렵'),
      eras[0],
      eras[1],
      ...vignettesAt('MID', '19세기가 저물 무렵'),
      eras[2],
      ...vignettesAt('LATE', '20세기 후반'),
      modernEntry,
    ],
  };
}
