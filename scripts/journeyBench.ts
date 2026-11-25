// 무사수행 한 번에 무엇을 얼마나 만나는지 잰다 — 지역별 장소 사건 수, 돌발(매복) 수, 쓴 날수, 들른 구역 수.
//   npm run test:journey             (지역마다 60번)
//   RUNS=200 npm run test:journey
import { applyBattleOutcome, createNewGame } from '../src/engine/gameLogic';
import { simulateAutoBattleQuick } from '../src/engine/autoBattleSim';
import { runJourneyHeadless } from '../src/engine/journey';
import { JOURNEY_REGIONS } from '../src/data/journeyRegions';
import { getJourneyEventDef } from '../src/data/journeyEvents';
import { ActiveEvent, GameState } from '../src/types/game';

const memStorage: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memStorage[k] ?? null,
  setItem: (k: string, v: string) => { memStorage[k] = v; },
  removeItem: (k: string) => { delete memStorage[k]; },
  clear: () => { Object.keys(memStorage).forEach((k) => delete memStorage[k]); },
  key: (i: number) => Object.keys(memStorage)[i] ?? null,
  get length() { return Object.keys(memStorage).length; },
};

const RUNS = Number(process.env.RUNS || 60);

function freshHero(country: GameState['country']): GameState {
  const s = createNewGame(country, 'MALE', '시험', 20, 'EASY');
  return { ...s, phase: 'MAIN', turn: 20, year: s.year + 5, age: s.age + 5, fame: 220, money: 400, health: 100, stats: { ...s.stats, str: 55, agi: 55, vit: 55, wil: 55, ins: 55 } };
}

const rows: string[] = [];
let totPoi = 0, totAmb = 0, totDays = 0, totZones = 0, totN = 0;
for (const r of JOURNEY_REGIONS) {
  let poi = 0, amb = 0, days = 0, zones = 0, deaths = 0;
  for (let i = 0; i < RUNS; i++) {
    let lastDay = 0;
    let lastZones = 0;
    const hooks = {
      choose: (_s: GameState, ev: ActiveEvent) => {
        const opts = ev.options.filter((o) => !o.disabled && o.id !== 'home');
        const safe = opts.filter((o) => o.id !== 'leave' && !(o.hint || '').includes('⚠'));
        if (safe.length && Math.random() < 0.85) return safe[Math.floor(Math.random() * safe.length)].id;
        return (opts.find((o) => o.id === 'leave') || opts[0] || ev.options[0]).id;
      },
      fight: (s: GameState) => applyBattleOutcome(s, simulateAutoBattleQuick(s, s.pendingBattle!, 'HERO', 'BALANCED')),
      onEvent: (key: string, s?: GameState) => {
        const def = getJourneyEventDef(key);
        if (def?.kind === 'AMBUSH') amb++;
        else poi++;
        if (s?.journey) {
          lastDay = s.journey.day;
          lastZones = s.journey.visitedLegs.length;
        }
      },
      onStep: (s: GameState) => {
        if (s.journey) {
          lastDay = s.journey.day;
          lastZones = s.journey.visitedLegs.length;
        }
      },
    };
    const end = runJourneyHeadless(freshHero(r.country), r.id, hooks);
    if (end.phase === 'ENDING') deaths++;
    days += lastDay;
    zones += lastZones;
  }
  totPoi += poi; totAmb += amb; totDays += days; totZones += zones; totN += RUNS;
  rows.push(`  ${r.name.padEnd(8)} 위험 ${r.danger.toFixed(2)} | 장소 사건 ${(poi / RUNS).toFixed(1)} · 돌발 ${(amb / RUNS).toFixed(2)} · 날수 ${(days / RUNS).toFixed(0)} · 구역 ${(zones / RUNS).toFixed(1)} · 사망 ${deaths}`);
}
console.log(`[무사수행 벤치] 지역마다 ${RUNS}회`);
rows.forEach((l) => console.log(l));
console.log(`  ─ 전체 평균: 장소 사건 ${(totPoi / totN).toFixed(1)} · 돌발 ${(totAmb / totN).toFixed(2)} · 날수 ${(totDays / totN).toFixed(0)} · 구역 ${(totZones / totN).toFixed(1)}`);
