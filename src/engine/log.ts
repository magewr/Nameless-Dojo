import { GameState, LogEntry } from '../types/game';

export function addLog(state: GameState, text: string, type: LogEntry['type'] = 'NORMAL'): GameState {
  const entry: LogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    year: state.year,
    season: state.season,
    text,
    type,
  };
  return { ...state, logs: [entry, ...state.logs].slice(0, 60) };
}
