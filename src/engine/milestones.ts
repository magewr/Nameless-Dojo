import { GameState, LifeMilestone } from '../types/game';
import { josa } from '../utils/korean';

// 생전 주요 사건 기록기.
// 게임 로직 곳곳에 기록 코드를 심는 대신, 상태가 바뀔 때마다 "이전 상태 ↔ 다음 상태"를 비교해
// 굵직한 변화만 골라 milestones에 덧붙인다. 순수 함수이며, 변화가 없으면 next를 그대로 돌려준다.

const MAX_MILESTONES = 120;
// 같은 종류가 이 횟수를 넘으면 더 기록하지 않는다. 0이면 아예 기록하지 않는다.
const REPEAT_LIMIT: Record<string, number> = {
  DISCIPLE_DIED: 3,
  MUTATION: 3,
  GRANDMASTER_WIN: 1,
  GRADUATE_GRANDMASTER: 3,
  GRADUATE_RIVAL_BETRAYER: 3,
  GRADUATE_SUCCESSFUL: 0,
  GRADUATE_ORDINARY: 0,
  CHILD_BORN: 4,
  TOURNAMENT_WIN: 6,
  HEIR_NAMED: 3,
  HEIR_LOST: 2,
  HEIRLOOM: 2,
  TRANSCENDENCE: 3,
};

const MEMORY_TEXT: Record<string, Record<string, string>> = {
  orphan: {
    ACCEPTED: '빗속에 떨던 고아를 도장에 거두었다',
    REJECTED: '빗속의 고아를 대문 밖에 두고 돌아섰다',
  },
  mother: { HELPED: '병든 어머니를 업고 온 아이를 도왔다' },
  smith: { WARM: '읍내 대장장이와 따뜻한 인연을 맺었다' },
  thug: {
    FOUGHT: '도장을 넘보던 왈패들을 칼로 물리쳤다',
    BRIBED: '왈패들에게 돈을 쥐여 돌려보냈다',
  },
  debt: { HONORED: '선대가 남긴 빚을 끝까지 갚았다' },
};

const AWAKENING_TEXT: Record<string, string> = {
  ONE_ARM_SAINT: '한 팔을 잃고도 검을 놓지 않아 외팔 검성의 경지에 올랐다',
  MIND_EYE: '빛을 잃은 눈 대신 심안(心眼)을 떴다',
  IMMOVABLE: '저는 다리로 부동(不動)의 경지를 이루었다',
};

const DISABILITY_TEXT: Record<string, string> = {
  ONE_ARM: '결투에서 한 팔을 잃었다',
  BLIND: '두 눈의 빛을 잃었다',
  LIMP: '다리를 크게 다쳐 절게 되었다',
};

export function diffMilestones(prev: GameState, next: GameState): LifeMilestone[] {
  const out: LifeMilestone[] = [];
  const stamp = { year: next.year, season: next.season, age: next.age };
  const add = (key: string, text: string) => out.push({ key, text, ...stamp });

  if (!prev.sectNamed && next.sectNamed) add('SECT_NAMED', `도장 현판에 【${next.sectName}】의 이름을 새겼다`);

  if (!prev.flags.hasHadFirstDisciple && next.flags.hasHadFirstDisciple) {
    const first = next.disciples.find((d) => !prev.disciples.some((p) => p.id === d.id));
    add('FIRST_DISCIPLE', first ? `첫 문하생 ${josa(first.name, '을를')} 받았다` : '첫 문하생을 받았다');
  }

  if (!prev.flags.hasCraftedOnce && next.flags.hasCraftedOnce) {
    const made = next.skills.find((s) => s.parents && !prev.skills.some((p) => p.id === s.id));
    add('FIRST_CRAFT', made ? `첫 독자 초식 ${josa(`「${made.customName || made.name}」`, '을를')} 창안했다` : '첫 독자 초식을 창안했다');
  }

  next.skills.forEach((s) => {
    const before = prev.skills.find((p) => p.id === s.id);
    if (s.masteryLevel >= 10 && before && before.masteryLevel < 10) {
      add('TRANSCENDENCE', `폐관 끝에 ${josa(`「${s.customName || s.name}」`, '을를')} 극의(極意)에 올려놓았다`);
    }
  });

  if (!prev.spouse && next.spouse) add('MARRIED', `${next.spouse.occupation} ${josa(next.spouse.name, '과와')} 혼례를 올렸다`);

  next.disciples.forEach((d) => {
    const before = prev.disciples.find((p) => p.id === d.id);
    if (d.isChild && !d.adopted && !before) add('CHILD_BORN', `자녀 ${josa(d.name, '이가')} 태어났다`);
    if (d.isChild && d.adopted && !before) add('CHILD_ADOPTED', `어린 ${josa(d.name, '을를')} 거두어 문하에서 길렀다`);
    if (d.role === 'HEIR' && before?.role !== 'HEIR') add('HEIR_NAMED', `${josa(d.name, '을를')} 2대 종주로 세웠다`);
    if (d.dead && before && !before.dead) {
      if (before.role === 'HEIR') add('HEIR_LOST', `2대 종주로 세운 ${josa(d.name, '을를')} 먼저 떠나보냈다`);
      else add('DISCIPLE_DIED', `문하생 ${josa(d.name, '을를')} 잃었다`);
    }
    const mutated = d.skills.find((s) => s.isMutated && !before?.skills.some((p) => p.id === s.id));
    if (mutated) add('MUTATION', `제자 ${josa(d.name, '이가')} 스승의 초식을 변이시켜 ${josa(`「${mutated.customName || mutated.name}」`, '을를')} 창안했다`);
  });

  const prevGrads = prev.graduatedDisciples || [];
  (next.graduatedDisciples || []).forEach((g) => {
    if (prevGrads.some((p) => p.id === g.id)) return;
    add(
      `GRADUATE_${g.fate}`,
      g.fate === 'RIVAL_BETRAYER' ? `제자 ${josa(g.name, '이가')} 서늘한 뒷모습으로 도장을 떠났다` : `제자 ${josa(g.name, '을를')} 하산시켜 독립하게 했다`
    );
  });

  const prevWins = prev.flags.tournamentWins || 0;
  const nextWins = next.flags.tournamentWins || 0;
  if (nextWins > prevWins) add('TOURNAMENT_WIN', nextWins === 1 ? '천하 무술 대회에서 처음 우승했다' : `천하 무술 대회 ${nextWins}번째 우승을 거두었다`);

  if ((next.flags.grandmasterWins || 0) > (prev.flags.grandmasterWins || 0)) add('GRANDMASTER_WIN', '당대의 절정 고수를 꺾었다');

  next.disabilities.forEach((d) => {
    if (!prev.disabilities.includes(d)) add(`DISABILITY_${d}`, DISABILITY_TEXT[d] || '몸에 큰 상처를 입었다');
  });
  next.awakenings.forEach((a) => {
    if (!prev.awakenings.includes(a)) add(`AWAKENING_${a}`, AWAKENING_TEXT[a] || '몸의 한계를 넘어 새 경지에 올랐다');
  });

  const prevMem = prev.flags.storyMemory || {};
  const nextMem = next.flags.storyMemory || {};
  Object.keys(nextMem).forEach((k) => {
    if (prevMem[k] === nextMem[k]) return;
    const text = MEMORY_TEXT[k]?.[nextMem[k]];
    if (text) add(`MEMORY_${k.toUpperCase()}_${nextMem[k]}`, text);
  });

  if (!prev.rival.lastFarewellType && next.rival.lastFarewellType && next.rival.lastFarewellType !== 'NONE') {
    add(
      `RIVAL_${next.rival.lastFarewellType}`,
      next.rival.lastFarewellType === 'DRINK'
        ? `숙적 ${josa(next.rival.name, '과와')} 겨울밤 술잔을 나누었다`
        : `숙적 ${josa(next.rival.name, '과와')} 최후의 한 합을 겨루었다`
    );
  }

  if (!prev.flags.usedMagicPublicly && next.flags.usedMagicPublicly) add('MAGIC_PUBLIC', '사람들 앞에서 처음으로 이적(異蹟)을 드러냈다');
  if (prev.flags.forbiddenCastCount === 0 && next.flags.forbiddenCastCount > 0) add('FORBIDDEN_FIRST', '금기 초식을 처음으로 실전에 썼다');
  if (!prev.flags.wroteManual && next.flags.wroteManual) add('WROTE_MANUAL', '유파의 무예가 나라의 병서에 기록되었다');
  if (!prev.flags.royalAlliance && next.flags.royalAlliance) add('ROYAL_ALLIANCE', '조정과 손을 잡았다');

  const newHeirloom = next.weapons.find((w) => w.isHeirloom && !prev.weapons.find((p) => p.id === w.id)?.isHeirloom);
  if (newHeirloom) add('HEIRLOOM', `${josa(`「${newHeirloom.customName || newHeirloom.name}」`, '을를')} 유파의 가보로 삼았다`);

  if (!prev.deathCause && next.deathCause) add('DEATH', `향년 ${next.age}세로 눈을 감았다 (${next.deathCause})`);

  return out;
}

export function withMilestones(prev: GameState | null, next: GameState | null): GameState | null {
  if (!prev || !next || prev === next) return next;
  // 새 일생 시작·이어하기 등 다른 인생으로 바뀐 경우는 비교하지 않는다.
  if (prev.name !== next.name || prev.country !== next.country || next.turn < prev.turn) return next;
  const list = [...(next.milestones || prev.milestones || [])];
  const before = list.length;
  diffMilestones(prev, next).forEach((m) => {
    // 긴 일생에서 되풀이되는 사건(제자의 죽음, 하산 등)은 처음 몇 번만 남긴다.
    const limit = REPEAT_LIMIT[m.key];
    if (limit !== undefined && list.filter((x) => x.key === m.key).length >= limit) return;
    if (list.length < MAX_MILESTONES) list.push(m);
  });
  if (list.length === before) return next;
  return { ...next, milestones: list };
}
