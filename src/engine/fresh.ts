import { GameState } from '../types/game';

// ───────── 변주 고르기 — 같은 사건이라도 최근에 본 장면은 피한다 ─────────
// 한 사건 틀 안에 여러 장면(변주)을 두고, 이번 생에 아직 안 본 장면 → 오래전에 본 장면 순으로 고른다.
// 고른 변주의 id를 사건 meta.vkey에 넣어 두면, 사건이 끝날 때 엔진이 「언제 봤는지」를 적어 둔다
// (무사수행·도장 생성형 사건은 resolveJourneyEvent, 고정 사건은 resolveEventOption — 고정 사건의 키는 계열 이름이다).
// 한 사건에서 두 가지를 함께 기억하려면 meta.vkeys: [변주id, 사람id …] 처럼 배열로 넘긴다.
//   const v = pickFresh(s, 'inn', INN_SCENES);  →  build()의 meta: { vkey: v.id, ... }
// 다른 모듈을 끌어오지 않는다 — events.ts(고정 사건)와 journeyCore(길 위 사건)가 함께 쓴다.
export interface FreshVariant {
  id: string;
  w?: number; // 기본 가중치 (기본 1)
  when?: (s: GameState) => boolean; // 이 조건일 때만 (나라·계절·나이 등)
}

export function seenAt(s: GameState, key: string): number | undefined {
  return s.flags.eventSeen?.[key];
}

// 안 본 장면 1 · 4년 안에 본 장면 0.04 · 10년 안 0.25 · 20년 안 0.6 · 그 이상 0.85
export function freshFactor(s: GameState, key: string): number {
  const last = seenAt(s, key);
  if (last === undefined) return 1;
  const ago = s.turn - last;
  return ago < 16 ? 0.04 : ago < 40 ? 0.25 : ago < 80 ? 0.6 : 0.85;
}

export function pickFresh<T extends FreshVariant>(s: GameState, eventKey: string, variants: T[]): T {
  const usable = variants.filter((v) => !v.when || v.when(s));
  const pool = usable.length ? usable : variants;
  const items = pool.map((v) => [v, (v.w ?? 1) * freshFactor(s, `${eventKey}:${v.id}`)] as [T, number]);
  const total = items.reduce((a, [, w]) => a + w, 0);
  let roll = Math.random() * total;
  for (const [v, w] of items) {
    roll -= w;
    if (roll <= 0) return v;
  }
  return items[items.length - 1][0];
}

// 엔진이 사건을 마무리할 때 부른다. 적힌 키의 값을 그대로 남긴다 (보통 지금 턴).
export function noteSeen(s: GameState, entries: Record<string, number>): GameState {
  if (Object.keys(entries).length === 0) return s;
  return { ...s, flags: { ...s.flags, eventSeen: { ...(s.flags.eventSeen || {}), ...entries } } };
}
