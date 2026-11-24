import React from 'react';
import { GameState, TourneyMatch } from '../types/game';
import { currentRoundMatches, fighterName, fighterOf, heroMatch, ROUND_LABEL } from '../engine/tourney';
import { Eye, FastForward, Swords, Trophy, X } from 'lucide-react';
import { sound } from '../engine/sound';

// 천하제일 무술대회 대진표 화면 — 16강부터 결승까지, 남의 경기도 실제로 승부가 갈린다.

interface Props {
  state: GameState;
  onQualifier: () => void;
  onFightHero: () => void;
  onWatch: (matchId: string) => void;
  onSimRest: () => void;
  onClose: () => void;
}

const QUAL_LABEL = ['256강', '128강', '64강', '32강'];

export const TournamentView: React.FC<Props> = ({ state, onQualifier, onFightHero, onWatch, onSimRest, onClose }) => {
  const t = state.tourney!;
  const hm = t.stage === 'BRACKET' ? heroMatch(t) : undefined;
  const pendingNpc = t.stage === 'BRACKET' ? currentRoundMatches(t).filter((m) => !m.winner && m.a !== 'HERO' && m.b !== 'HERO') : [];
  const history = state.flags.tourneyHistory || [];

  const nameOf = (id: string) => fighterName(t, id, state.name);
  const tagOf = (id: string): { cls: string; tag: string } => {
    if (id === 'HERO') return { cls: 'text-[#fde047] font-bold', tag: '나' };
    const f = fighterOf(t, id);
    if (f?.kind === 'DISCIPLE') return { cls: 'text-teal-300 font-bold', tag: '제자' };
    if (f?.kind === 'RIVAL') return { cls: 'text-rose-300 font-bold', tag: '숙적' };
    return { cls: 'text-[#e6d8be]', tag: '' };
  };
  const stars = (id: string) => {
    const p = t.powers[id] || 1;
    return '★'.repeat(Math.max(1, Math.min(5, Math.round(p * 1.4))));
  };

  const MatchCard: React.FC<{ m: TourneyMatch }> = ({ m }) => {
    const isCurrent = m.round === t.round && !m.winner && t.stage === 'BRACKET';
    const canWatch = isCurrent && m.a !== 'HERO' && m.b !== 'HERO';
    return (
      <div className={`border px-1.5 py-1 text-[10px] sm:text-[11px] leading-tight ${isCurrent ? 'border-[#fde047] bg-[#2b1e16]' : 'border-[#5c432c] bg-[#1b120c]'}`}>
        {[m.a, m.b].map((id) => {
          const tg = tagOf(id);
          const won = m.winner === id;
          const lost = !!m.winner && !won;
          const f = id === 'HERO' ? null : fighterOf(t, id);
          return (
            <div key={id} className={`flex items-center justify-between gap-1 ${lost ? 'opacity-40 line-through' : ''}`}>
              <span className={`truncate ${tg.cls} ${won ? 'underline decoration-[#fde047]' : ''}`} title={f ? `${f.sect} · ${state.year - f.bornYear}세${f.titles ? ` · 우승 ${f.titles}회` : ''}` : state.sectName}>
                {tg.tag && <span className="text-[9px] mr-0.5 opacity-80">[{tg.tag}]</span>}
                {nameOf(id)}
              </span>
              <span className="text-[8px] text-amber-400/80 shrink-0">{stars(id)}</span>
            </div>
          );
        })}
        {m.upset && <div className="text-[9px] text-fuchsia-300 font-bold">☆ 이변</div>}
        {m.watched && <div className="text-[9px] text-sky-300">관전함</div>}
        {canWatch && (
          <button
            onClick={() => {
              sound.playClick();
              onWatch(m.id);
            }}
            className="mt-0.5 w-full rpg-btn py-0.5 text-[10px] flex items-center justify-center gap-1 cursor-pointer"
          >
            <Eye className="w-3 h-3" /> 관전
          </button>
        )}
      </div>
    );
  };

  const rounds = [0, 1, 2, 3].map((r) => t.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot));
  const champ = t.championId;

  return (
    <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-2 sm:p-4">
      <div className="rpg-window w-full max-w-5xl max-h-[96vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b-2 border-[#8c6239] bg-[#1b120c]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[#fde68a] font-bold text-sm sm:text-base truncate">
              <Trophy className="w-4 h-4 shrink-0" /> {t.year}년 {t.name}
            </div>
            <div className="text-[10px] text-[#c7b394]">
              {t.stage === 'QUALIFIER'
                ? `예선 — ${t.qualifierWins}/4 통과`
                : t.stage === 'DONE'
                ? '대회 종료'
                : `본선 ${ROUND_LABEL[t.round]}${t.heroOut ? ' · 객석에서 관전 중' : ''}`}
              {t.seeded && ' · 예선 면제'}
            </div>
          </div>
          {t.stage === 'DONE' && (
            <button onClick={onClose} className="rpg-btn p-1.5 cursor-pointer" aria-label="닫기">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {t.stage === 'QUALIFIER' && (
            <div className="space-y-2">
              <div className="flex gap-1">
                {QUAL_LABEL.map((l, i) => (
                  <div key={l} className={`flex-1 text-center text-[11px] py-1.5 border ${i < t.qualifierWins ? 'bg-[#3d291a] border-amber-500 text-amber-200' : i === t.qualifierWins ? 'border-[#fde047] text-[#fde68a] font-bold' : 'border-[#5c432c] text-[#8f7c66]'}`}>
                    {l} {i < t.qualifierWins ? '✓' : ''}
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#e6d8be]">256명이 모였다. 네 판을 이겨야 본선 16강에 오른다. 본선에는 강호의 이름난 고수들이 기다린다.</p>
              <button onClick={onQualifier} className="w-full seal-badge py-2.5 font-bold flex items-center justify-center gap-2 cursor-pointer">
                <Swords className="w-4 h-4" /> {QUAL_LABEL[t.qualifierWins]} 예선 출전
              </button>
            </div>
          )}

          {t.stage !== 'QUALIFIER' && (
            <>
              {t.stage === 'DONE' && champ && (
                <div className="text-center border-2 border-[#fde047] bg-[#3d291a] py-2">
                  <div className="text-[11px] text-amber-300">🏆 우승</div>
                  <div className="text-lg font-bold text-[#fde68a]">{nameOf(champ)}</div>
                  <div className="text-[11px] text-[#c7b394]">{champ === 'HERO' ? state.sectName : fighterOf(t, champ)?.sect}</div>
                </div>
              )}

              <div className="overflow-x-auto">
                <div className="grid grid-cols-4 gap-2 min-w-[640px]">
                  {rounds.map((ms, r) => (
                    <div key={r} className="space-y-1.5">
                      <div className={`text-center text-[11px] font-bold ${r === t.round && t.stage === 'BRACKET' ? 'text-[#fde047]' : 'text-[#c7b394]'}`}>{ROUND_LABEL[r]}</div>
                      <div className="flex flex-col justify-around gap-1.5 h-full">
                        {ms.length === 0 ? <div className="text-[10px] text-[#5c432c] text-center">—</div> : ms.map((m) => <MatchCard key={m.id} m={m} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {t.stage === 'BRACKET' && (
                <div className="flex flex-col sm:flex-row gap-2">
                  {hm && !t.heroOut && (
                    <button onClick={onFightHero} className="flex-1 seal-badge py-2.5 font-bold flex items-center justify-center gap-2 cursor-pointer">
                      <Swords className="w-4 h-4" /> {ROUND_LABEL[t.round]} 출전 — vs {nameOf(hm.a === 'HERO' ? hm.b : hm.a)}
                    </button>
                  )}
                  {pendingNpc.length > 0 && (
                    <button onClick={onSimRest} className="flex-1 rpg-btn py-2.5 font-bold flex items-center justify-center gap-2 cursor-pointer">
                      <FastForward className="w-4 h-4" /> 남은 {pendingNpc.length}경기 결과 보기
                    </button>
                  )}
                </div>
              )}
              {t.stage === 'DONE' && (
                <button onClick={onClose} className="w-full seal-badge py-2.5 font-bold cursor-pointer">
                  대회를 마치고 도장으로 돌아간다
                </button>
              )}
            </>
          )}

          <div className="border border-[#5c432c] bg-[#140d09] p-2 space-y-0.5">
            <div className="text-[11px] font-bold text-[#fde68a]">대회 소식</div>
            {t.news.slice(-7).map((n, i) => (
              <div key={i} className="text-[11px] text-[#e6d8be]">
                {n}
              </div>
            ))}
          </div>

          {history.length > 0 && (
            <div className="text-[10px] text-[#c7b394]">
              역대 우승: {history.slice(-6).map((h) => `${h.year} ${h.champion}`).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
