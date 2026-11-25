import React, { useState } from 'react';
import { DiscipleRole, GameState } from '../types/game';
import { getMaxDisciples } from '../engine/gameLogic';
import { getSects, getSectStance } from '../data/sects';
import { PixelPortrait } from './PixelPortrait';
import { getSectTitleTooltip, HANJA_GLOSSARY, InGameTooltip } from './InGameUI';
import { DisciplePanel } from './DisciplePanel';
import { SectPanel } from './SectPanel';
import { Flag, Heart, Swords, Users, X } from 'lucide-react';
import { sound } from '../engine/sound';

interface Props {
  state: GameState;
  onClose: () => void;
  onTeachAll: () => void;
  onTeachSkill: (discipleId: string, skillId: string) => void;
  onSetRole: (discipleId: string, role: DiscipleRole) => void;
  onTalk: (discipleId: string) => void;
  onExpel: (discipleId: string) => void;
  onSectGift: (sectId: string) => void;
  onSectSpar: (sectId: string) => void;
}

type TabId = 'DISCIPLES' | 'SECTS' | 'RELATIONS';

export const DisciplesAndFamilyModal: React.FC<Props> = ({
  state,
  onClose,
  onTeachAll,
  onTeachSkill,
  onSetRole,
  onTalk,
  onExpel,
  onSectGift,
  onSectSpar,
}) => {
  const [tab, setTab] = useState<TabId>('DISCIPLES');
  const [detailNpc, setDetailNpc] = useState<{ kind: 'SPOUSE' } | { kind: 'RIVAL' } | { kind: 'MERCHANT' } | null>(null);

  const aliveDisciples = state.disciples.filter((d) => !d.dead);
  const maxD = getMaxDisciples(state.facilities);
  const metSects = getSects(state).filter((s) => s.met);
  const hostileCount = metSects.filter((s) => getSectStance(s) === 'HOSTILE').length;
  const uneasyDisciples = aliveDisciples.filter((d) => d.loyalty < 45 || (d.temperament === 'SCHEMER' && d.exposed)).length;
  const rivalSect = getSects(state).find((s) => s.kind === 'RIVAL');

  const repList = [
    { label: '인덕', tip: HANJA_GLOSSARY.VIRTUE, val: state.reputation.virtue, color: 'bg-emerald-500' },
    { label: '살기', tip: HANJA_GLOSSARY.RUTHLESS, val: state.reputation.ruthless, color: 'bg-red-600' },
    { label: '상무', tip: HANJA_GLOSSARY.COMMERCE, val: state.reputation.commerce, color: 'bg-amber-500' },
    { label: '구도', tip: HANJA_GLOSSARY.ASCETIC, val: state.reputation.ascetic, color: 'bg-sky-500' },
    { label: '이단', tip: HANJA_GLOSSARY.ARCANE, val: state.reputation.arcane, color: 'bg-fuchsia-500' },
  ];

  // 좁은 화면에서는 짧은 이름을 쓴다.
  const tabs: Array<{ id: TabId; label: string; short: string; icon: React.ReactNode; alert: number }> = [
    { id: 'DISCIPLES', label: `문하생 (${aliveDisciples.length}/${maxD})`, short: `문하생 ${aliveDisciples.length}`, icon: <Users className="w-4 h-4 shrink-0" />, alert: uneasyDisciples },
    { id: 'SECTS', label: `강호 문파 (${metSects.length})`, short: `문파 ${metSects.length}`, icon: <Flag className="w-4 h-4 shrink-0" />, alert: hostileCount },
    { id: 'RELATIONS', label: '가족 · 숙적 · 세평', short: '인연', icon: <Heart className="w-4 h-4 shrink-0" />, alert: 0 },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-2 sm:p-4">
      <div className="rpg-window max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-ink">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#8c6239] bg-[#1b120c]">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#fde68a]" />
            <h2 className="text-base sm:text-lg font-bold text-[#fde68a]">문하생 · 강호 문파 · 인연</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-3 border-b-2 border-[#6b4728] bg-[#221710] text-xs font-bold">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { sound.playClick(); setTab(t.id); }}
              className={`py-2.5 px-1 flex items-center justify-center gap-1.5 cursor-pointer ${tab === t.id ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}
            >
              {t.icon}
              <span className="truncate hidden sm:inline">{t.label}</span>
              <span className="truncate sm:hidden">{t.short}</span>
              {t.alert > 0 && <span className="shrink-0 min-w-[16px] h-4 px-1 bg-red-700 border border-red-300 text-red-50 text-[10px] leading-[14px] text-center tabular-nums">{t.alert}</span>}
            </button>
          ))}
        </div>

        <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 space-y-3">
          {tab === 'DISCIPLES' && (
            <DisciplePanel state={state} onTeachAll={onTeachAll} onTeachSkill={onTeachSkill} onSetRole={onSetRole} onTalk={onTalk} onExpel={onExpel} />
          )}

          {tab === 'SECTS' && <SectPanel state={state} onGift={onSectGift} onSpar={onSectSpar} />}

          {tab === 'RELATIONS' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div className="p-3 bg-[#1b120c] border-2 border-[#5c432c] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PixelPortrait role="SPOUSE" country={state.country} age={state.age} gender={state.spouse?.gender || (state.gender === 'FEMALE' ? 'MALE' : 'FEMALE')} variantHint={state.spouse?.name} size={48} />
                    <div className="min-w-0 text-xs">
                      <div className="text-rose-300 font-bold">♥ 배우자</div>
                      {state.spouse ? (
                        <>
                          <div className="font-bold text-sm text-[#fde68a] truncate">{state.spouse.name} ({state.spouse.alive ? `${state.spouse.age}세` : '故'})</div>
                          <div className="text-[11px] text-[#c7b394] truncate">{state.spouse.alive ? state.spouse.bonusDesc : '먼저 세상을 떠났다'}</div>
                        </>
                      ) : (
                        <div className="text-[#c7b394]">미혼</div>
                      )}
                    </div>
                  </div>
                  {state.spouse && (
                    <button onClick={() => { sound.playClick(); setDetailNpc({ kind: 'SPOUSE' }); }} className="rpg-btn px-2 py-1 text-[11px] shrink-0 cursor-pointer">상세</button>
                  )}
                </div>

                <div className="p-3 bg-[#1b120c] border-2 border-[#5c432c] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PixelPortrait role="RIVAL" country={state.country} age={state.rival.age} size={48} />
                    <div className="min-w-0 text-xs">
                      <div className="text-sky-300 font-bold flex items-center gap-1"><Swords className="w-3.5 h-3.5" /> 숙적</div>
                      <div className="font-bold text-sm text-[#fde68a] truncate">{state.rival.name} ({state.rival.age}세)</div>
                      <div className="text-[11px] text-[#c7b394] truncate">
                        {state.rival.act}막 · {state.rival.lossesAgainstPlayer}승 {state.rival.winsAgainstPlayer}패
                        {rivalSect && ` · ${rivalSect.name.replace(/\(.*?\)/g, '')}`}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => { sound.playClick(); setDetailNpc({ kind: 'RIVAL' }); }} className="rpg-btn px-2 py-1 text-[11px] shrink-0 cursor-pointer">상세</button>
                </div>

                <div className="p-3 bg-[#1b120c] border-2 border-[#5c432c] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PixelPortrait role="MERCHANT" country={state.country} size={48} />
                    <div className="min-w-0 text-xs">
                      <div className="text-amber-300 font-bold">★ 행상인</div>
                      <div className="font-bold text-sm text-[#fde68a] truncate">만물객(萬物客)</div>
                      <div className="text-[11px] text-[#c7b394]">방문 {state.flags.merchantVisits}회</div>
                    </div>
                  </div>
                  <button onClick={() => { sound.playClick(); setDetailNpc({ kind: 'MERCHANT' }); }} className="rpg-btn px-2 py-1 text-[11px] shrink-0 cursor-pointer">상세</button>
                </div>
              </div>

              <div className="p-3.5 bg-[#1b120c] border-2 border-[#6b4728] space-y-2.5">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-xs text-[#c7b394]">세간의 문파 이명 (눌러서 풀이 보기)</span>
                  {(() => {
                    const tTip = getSectTitleTooltip(state.currentTitle, state.reputation, state.fame);
                    return (
                      <InGameTooltip title={tTip.title} body={tTip.body} sub={tTip.sub}>
                        <span className="text-sm sm:text-base font-bold text-[#fde68a] underline decoration-dotted underline-offset-4">
                          「{state.currentTitle}」
                        </span>
                      </InGameTooltip>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-5 gap-2 text-center">
                  {repList.map((r) => (
                    <InGameTooltip key={r.label} {...r.tip} className="w-full justify-center">
                      <div className="w-full space-y-1">
                        <div className="text-[11px] text-[#d6cbb8] underline decoration-dotted underline-offset-2">{r.label}</div>
                        <div className="h-2 bg-[#120c08] border border-[#5c432c]">
                          <div className={`h-full ${r.color}`} style={{ width: `${Math.min(100, (r.val / 130) * 100)}%` }} />
                        </div>
                        <div className="text-[10px] font-bold text-[#fde68a]">{r.val}</div>
                      </div>
                    </InGameTooltip>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 인물(배우자·숙적·만물객) 상세보기 팝업 */}
      {detailNpc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
          <div className="rpg-window max-w-md w-full p-4 space-y-3 animate-ink max-h-[86vh] overflow-y-auto">
            {detailNpc.kind === 'SPOUSE' && state.spouse && (
              <>
                <div className="flex items-center justify-between border-b border-[#8c6239] pb-2">
                  <div className="flex items-center gap-2.5">
                    <PixelPortrait role="SPOUSE" country={state.country} age={state.age} gender={state.spouse?.gender || (state.gender === 'FEMALE' ? 'MALE' : 'FEMALE')} variantHint={state.spouse?.name} size={52} />
                    <div>
                      <div className="font-bold text-base text-[#fde68a]">{state.spouse.name} ({state.spouse.alive ? `${state.spouse.age}세` : '故'})</div>
                      <div className="text-[11px] text-rose-300">{state.spouse.alive ? '도장의 반려자' : '먼저 떠난 반려자'}</div>
                    </div>
                  </div>
                  <button onClick={() => setDetailNpc(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-xs leading-relaxed text-[#f5e9ce]">
                  {state.spouse.alive
                    ? '풍파 많은 무명도장의 곁을 지키며 평생을 함께 걷는 반려자입니다. 도장의 살림과 제자들을 돌보며 당신이 무도에 전념할 수 있도록 힘을 보탭니다.'
                    : `${state.spouse.marriedYear}년에 혼례를 올리고 평생 곁을 지켰던 반려자입니다. 이제는 무덤가의 풀을 뽑으며 도장 이야기를 들려줄 뿐입니다.`}
                </p>
                {state.spouse.alive && (
                  <div className="p-2.5 bg-[#1b120c] border border-rose-400/60 text-xs text-rose-200">
                    ♥ 동행 효과: {state.spouse.bonusDesc}
                  </div>
                )}
              </>
            )}

            {detailNpc.kind === 'RIVAL' && (
              <>
                <div className="flex items-center justify-between border-b border-[#8c6239] pb-2">
                  <div className="flex items-center gap-2.5">
                    <PixelPortrait role="RIVAL" country={state.country} age={state.rival.age} size={52} />
                    <div>
                      <div className="font-bold text-base text-[#fde68a]">{state.rival.name} ({state.rival.age}세)</div>
                      <div className="text-[11px] text-sky-300">평생의 숙적 · 현재 {state.rival.act}막</div>
                    </div>
                  </div>
                  <button onClick={() => setDetailNpc(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-xs leading-relaxed text-[#f5e9ce]">
                  같은 시대에 검을 쥔 천재 무인. 당신이 무명도장을 일구는 동안 그 역시 천하를 유랑하며 자신만의 검도를 완성해 갑니다. 세월이 흘러 머리가 희어질 때까지 두 사람의 인연은 이어집니다.
                </p>
                <div className="p-2.5 bg-[#1b120c] border border-[#6b4728] text-xs text-[#fde68a]">
                  ⚔ 맞대결 전적: 당신 기준 {state.rival.lossesAgainstPlayer}승 {state.rival.winsAgainstPlayer}패
                </div>
                {rivalSect && (
                  <button
                    onClick={() => { sound.playClick(); setDetailNpc(null); setTab('SECTS'); }}
                    className="w-full text-left p-2.5 bg-[#1b120c] border border-[#6b4728] text-xs text-[#e6d8be] cursor-pointer hover:border-[#fde047]"
                  >
                    <span className="text-sky-300 font-bold">{rivalSect.name}</span> — {rivalSect.met ? `두 문파의 관계 ${rivalSect.relation > 0 ? '+' : ''}${rivalSect.relation}` : '아직 문파끼리는 교류가 없다'}
                    <span className="text-[#a8957a]"> · 강호 문파 탭에서 보기 ›</span>
                  </button>
                )}
              </>
            )}

            {detailNpc.kind === 'MERCHANT' && (
              <>
                <div className="flex items-center justify-between border-b border-[#8c6239] pb-2">
                  <div className="flex items-center gap-2.5">
                    <PixelPortrait role="MERCHANT" country={state.country} size={52} />
                    <div>
                      <div className="font-bold text-base text-[#fde68a]">만물객 (萬物客)</div>
                      <div className="text-[11px] text-amber-300">비 오는 처마 밑의 비밀 상인</div>
                    </div>
                  </div>
                  <button onClick={() => setDetailNpc(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-xs leading-relaxed text-[#f5e9ce]">
                  삼국의 항구와 저잣거리를 넘나들며 희귀한 무술서와 서양 검술 교본, 명검, 그리고 세상의 이치를 벗어난 기이한 고서까지 취급하는 행상입니다. 세월이 수십 년 흘러도 좀처럼 늙지 않는다는 기묘한 소문이 따라다닙니다.
                </p>
                <div className="p-2.5 bg-[#1b120c] border border-[#6b4728] text-xs text-amber-200">
                  ★ 지금까지 도장 방문 횟수: {state.flags.merchantVisits}회
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
