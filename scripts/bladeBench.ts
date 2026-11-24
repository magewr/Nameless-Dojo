// 목검 비무 vs 진검결투 비교 벤치: 같은 상대를 목검/진검으로 수천 번 붙여 승률·남은 체력·결착 방식을 본다.
import { simulateAutoBattleQuick } from '../src/engine/autoBattleSim';
import { applyBattleOutcome } from '../src/engine/gameLogic';
import { createBattleConfig } from '../src/data/events';
import { BATTLE_PREVIEW_PRESETS, buildBattlePreview } from '../src/components/battlePreviewPresets';
import { GameState } from '../src/types/game';

const N = 3000;
for (const presetId of BATTLE_PREVIEW_PRESETS.map((p) => p.id).slice(0, 3)) {
  const preset = BATTLE_PREVIEW_PRESETS.find((p) => p.id === presetId)!;
  const { state } = buildBattlePreview(preset, 'KOREA', 'MALE');
  const st: GameState = { ...state, phase: 'MAIN' };
  console.log(`\n=== ${preset.label} ===`);
  for (const scale of [1.0, 2.0, 3.0]) {
    const row = [false, true].map((real) => {
      let wins = 0, hp = 0, healthLoss = 0, heavy = 0, dead = 0;
      const ends: Record<string, number> = {};
      for (let i = 0; i < N; i++) {
        const b = createBattleConfig('x', 'x', 'x', real, '적', '적', 35, 'DUELIST', scale, 'BLADE', ['sk_jp_03', 'sk_cn_03', 'sk_kr_06']);
        const r = simulateAutoBattleQuick(st, b, 'HERO', 'BALANCED') as any;
        if (r.victory) wins++;
        hp += r.hpRemainingRatio;
        const before = { ...st, health: 90, statuses: [], pendingBattle: b };
        const after = applyBattleOutcome(before, r);
        if (after.phase === 'ENDING') dead++;
        else healthLoss += before.health - after.health;
        if (after.statuses.some((x) => x.id === 'HEAVY_INJURY')) heavy++;
        const k = r.endedBy || '-';
        ends[k] = (ends[k] || 0) + 1;
      }
      const endStr = Object.entries(ends).map(([k, v]) => `${k}${Math.round((v / N) * 100)}`).join('/');
      return `${real ? '진검' : '목검'} 승${Math.round((wins / N) * 100)}% HP${Math.round((hp / N) * 100)} 건강-${(healthLoss / Math.max(1, N - dead)).toFixed(1)} 중상${Math.round((heavy / N) * 100)}% 사망${Math.round((dead / N) * 100)}% [${endStr}]`;
    });
    console.log(`  강적 ${scale}: ${row.join('  |  ')}`);
  }
}
