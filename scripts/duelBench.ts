// 극의 보상 측정용 비무 벤치마크: 같은 고수가 Lv.9 그대로일 때 / 주력 초식 하나가 극의일 때 / 전부 극의일 때를
// 천하대회 8강·4강·결승, 그리고 도장깨기급 강적과 수천 번 붙여 승률을 비교한다. (결과 즉시 보기와 같은 공식)
import { simulateAutoBattleQuick } from '../src/engine/autoBattleSim';
import { createTournamentBattle } from '../src/data/tournament';
import { createBattleConfig } from '../src/data/events';
import { BATTLE_PREVIEW_PRESETS, buildBattlePreview } from '../src/components/battlePreviewPresets';
import { getTraitCandidates, transcendSkill } from '../src/data/booksAndSkills';
import { BattleConfig, CountryId, GameState, Skill } from '../src/types/game';

const N = 3000;
const preset = BATTLE_PREVIEW_PRESETS.find((p) => p.id === 'master')!;

let COUNTRY: CountryId = 'KOREA';
function heroWith(level: number, stat: number, transcend: 'NONE' | 'ONE' | 'ALL'): GameState {
  const { state } = buildBattlePreview({ ...preset, heroLevel: level, heroStat: stat, heroAge: 48 }, COUNTRY, 'MALE');
  const skills = state.skills.map((s, i): Skill => {
    if (transcend === 'NONE' || (transcend === 'ONE' && i > 0)) return s;
    const t = transcendSkill(s);
    const trait = getTraitCandidates(t, 10)[0];
    return { ...t, imprintedTraits: [...t.imprintedTraits, trait], pendingTraitTier: undefined };
  });
  return { ...state, phase: 'MAIN', skills };
}

const opponents: Array<{ label: string; make: (st: GameState) => BattleConfig }> = [
  { label: '대회 8강', make: (st) => createTournamentBattle(st, 6) },
  { label: '대회 4강', make: (st) => createTournamentBattle(st, 7) },
  { label: '대회 결승', make: (st) => createTournamentBattle(st, 8) },
  { label: '검마(강적 3.2)', make: () => createBattleConfig('x', 'x', 'x', true, '검마', '검마', 50, 'DUELIST', 3.2, 'BLADE', ['sk_jp_03', 'sk_cn_03', 'sk_kr_06']) },
];

const countries = (process.argv[2] || 'KOREA').split(',') as CountryId[];
for (const c of countries) for (const stat of [60, 75]) {
  COUNTRY = c;
  console.log(`\n=== [${c}] 능력치 ${stat} 고수 (48세, 주력 5초식) — 승률 / 남은 HP ===`);
  for (const variant of ['NONE', 'ONE', 'ALL'] as const) {
    const st = heroWith(9, stat, variant);
    const row = opponents.map((o) => {
      let wins = 0, hpSum = 0;
      for (let i = 0; i < N; i++) {
        const r = simulateAutoBattleQuick(st, o.make(st), 'HERO', 'BALANCED');
        if (r.victory) wins++;
        hpSum += r.hpRemainingRatio;
      }
      return `${o.label} ${Math.round((wins / N) * 100)}%/${Math.round((hpSum / N) * 100)}`;
    });
    const label = variant === 'NONE' ? 'Lv.9 전부     ' : variant === 'ONE' ? '주력 1개 극의  ' : '전부 극의      ';
    console.log(`  ${label} | ${row.join(' · ')}`);
  }
}
