import { GameState, LegacyRecord } from '../types/game';
import { ACHIEVEMENTS, UnlockedAchievement } from '../data/achievements';

const SAVE_KEY = 'nameless_dojo_autosave_v1';
const LEGACY_KEY = 'nameless_dojo_legacy_v1';
const ACH_KEY = 'nameless_dojo_achievements_v1';

export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('저장 실패:', e);
  }
}

export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch (e) {
    console.warn('불러오기 실패:', e);
    return null;
  }
}

export function clearGameState(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export function hasSavedGame(): boolean {
  try {
    const state = loadGameState();
    return !!state && state.phase !== 'TITLE' && state.phase !== 'CREATE';
  } catch {
    return false;
  }
}

export function loadLegacyRecords(): LegacyRecord[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LegacyRecord[];
  } catch {
    return [];
  }
}

export function appendLegacyRecord(record: LegacyRecord): LegacyRecord[] {
  const list = loadLegacyRecords();
  const next = [record, ...list].slice(0, 20);
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function loadUnlockedAchievements(): UnlockedAchievement[] {
  try {
    const raw = localStorage.getItem(ACH_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UnlockedAchievement[];
  } catch {
    return [];
  }
}

// 현재 GameState 기준으로 새로 해금된 도전과제 자동 판별 & 영구 저장!
export function evaluateAndSaveAchievements(state: GameState): UnlockedAchievement[] {
  const current = loadUnlockedAchievements();
  const unlockedSet = new Set(current.map((a) => a.id));
  const newlyUnlocked: UnlockedAchievement[] = [];

  for (const def of ACHIEVEMENTS) {
    if (unlockedSet.has(def.id)) continue;
    if (def.check(state)) {
      const rec: UnlockedAchievement = {
        id: def.id,
        unlockedAt: Date.now(),
        sectName: state.sectName,
        heroName: state.name,
      };
      newlyUnlocked.push(rec);
      unlockedSet.add(def.id);
    }
  }

  if (newlyUnlocked.length > 0) {
    try {
      localStorage.setItem(ACH_KEY, JSON.stringify([...newlyUnlocked, ...current]));
    } catch {
      // ignore
    }
  }
  return newlyUnlocked;
}
