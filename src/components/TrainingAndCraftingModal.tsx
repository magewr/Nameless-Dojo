import React, { useMemo, useState } from 'react';
import { Book, GameState, Skill } from '../types/game';
import {
  ELEMENT_LABEL,
  evaluateCraft,
  FORM_LABEL,
  getMasteryPct,
  isAtMasteryWall,
  MASTERY_NAMES,
  WEAPON_GROUP_LABEL,
} from '../data/booksAndSkills';
import { getMerchantBookAppraisal } from '../data/worldLore';
import { getBookDecodeTarget, getMaxActiveSlots, getMaxPassiveSlots } from '../engine/gameLogic';
import { SkillDetailModal } from './SkillPreviewCanvas';
import { HANJA_GLOSSARY, InGameTooltip } from './InGameUI';
import { BookOpen, Dumbbell, Eye, Flame, Info, Sparkles, Star, Swords, Wand2, X } from 'lucide-react';
import { sound } from '../engine/sound';

interface Props {
  state: GameState;
  initialTab?: 'TRAIN' | 'CRAFT' | 'BOOKS';
  onClose: () => void;
  onSelectTrainSkill: (skillId: string) => void;
  onToggleEquipActive: (skillId: string) => void;
  onToggleEquipPassive: (skillId: string) => void;
  onStartCraftProject: (aId: string, bId: string, customName: string) => void;
  onSelectDecodeBook: (bookId: string) => void;
  onRenameSkill: (skillId: string, newName: string) => void;
}

export const TrainingAndCraftingModal: React.FC<Props> = ({
  state,
  initialTab = 'TRAIN',
  onClose,
  onSelectTrainSkill,
  onToggleEquipActive,
  onToggleEquipPassive,
  onStartCraftProject,
  onSelectDecodeBook,
  onRenameSkill,
}) => {
  const [tab, setTab] = useState<'TRAIN' | 'CRAFT' | 'BOOKS'>(initialTab);
  const [craftA, setCraftA] = useState<string>(state.skills[0]?.id || '');
  const [craftB, setCraftB] = useState<string>(state.skills[1]?.id || '');
  const [customCraftName, setCustomCraftName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [detailSkill, setDetailSkill] = useState<{ skill: Skill; formNumber: number } | null>(null);
  const [detailBook, setDetailBook] = useState<Book | null>(null);

  const maxActive = getMaxActiveSlots(state.stats.ins);
  const maxPassive = getMaxPassiveSlots(state.stats.qi);

  const skillA = state.skills.find((s) => s.id === craftA);
  const skillB = state.skills.find((s) => s.id === craftB);

  // 초식 덱 정렬: 1순위 장착 비무 초식(1식·2식·3식 순) → 2순위 장착 운기 심법 → 3순위 미장착(레벨/위력 순)
  const sortedSkills = useMemo(() => {
    return [...state.skills].sort((a, b) => {
      const idxA = state.equippedActiveIds.indexOf(a.id);
      const idxB = state.equippedActiveIds.indexOf(b.id);
      const pasA = state.equippedPassiveIds.indexOf(a.id);
      const pasB = state.equippedPassiveIds.indexOf(b.id);
      const rankA = idxA >= 0 ? idxA : pasA >= 0 ? 100 + pasA : 1000 - a.masteryLevel * 10 - a.power * 0.01;
      const rankB = idxB >= 0 ? idxB : pasB >= 0 ? 100 + pasB : 1000 - b.masteryLevel * 10 - b.power * 0.01;
      return rankA - rankB;
    });
  }, [state.skills, state.equippedActiveIds, state.equippedPassiveIds]);

  // 재료 A 기준 재료 B 전체 조합 가능 여부(시그니처 / 일반 / 불가) 미리 계산 & 자동 정렬!
  const craftBOptions = useMemo(() => {
    return state.skills
      .map((s) => {
        const res = skillA ? evaluateCraft(skillA, s, state.stats.ins, state.name) : null;
        const alreadyOwned = Boolean(res?.resultSkill && state.skills.some((x) => x.id === res.resultSkill!.id));
        const possible = Boolean(res?.possible && !alreadyOwned);
        const tier = !possible ? 3 : res?.isForbidden ? 0 : res?.isSignature ? 1 : 2;
        return { skill: s, evalRes: res, possible, alreadyOwned, tier };
      })
      .sort((a, b) => a.tier - b.tier || b.skill.masteryLevel - a.skill.masteryLevel);
  }, [state.skills, skillA, state.stats.ins, state.name]);

  const handleSelectCraftA = (id: string) => {
    sound.playClick();
    setCraftA(id);
    setCustomCraftName('');
    const nextA = state.skills.find((s) => s.id === id);
    if (nextA) {
      const bestB = state.skills
        .map((s) => {
          const r = evaluateCraft(nextA, s, state.stats.ins, state.name);
          const owned = Boolean(r.resultSkill && state.skills.some((x) => x.id === r.resultSkill!.id));
          return { s, ok: r.possible && !owned, score: r.isSignature ? 2 : r.possible ? 1 : 0 };
        })
        .filter((x) => x.ok)
        .sort((a, b) => b.score - a.score)[0];
      if (bestB) setCraftB(bestB.s.id);
    }
  };

  const preview = useMemo(() => {
    if (!skillA || !skillB) return null;
    return evaluateCraft(skillA, skillB, state.stats.ins, state.name);
  }, [skillA, skillB, state.stats.ins, state.name]);

  return (
    <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-2 sm:p-4">
      <div className="rpg-window max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-ink">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#8c6239] bg-[#1b120c]">
          <div className="flex items-center gap-2 min-w-0">
            <Swords className="w-5 h-5 text-[#fde68a] shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-[#fde68a] truncate">무술 덱 · 조합 · 장서각</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-3 border-b-2 border-[#6b4728] bg-[#221710] text-xs font-bold">
          <button onClick={() => { sound.playClick(); setTab('TRAIN'); }} className={`py-2.5 flex items-center justify-center gap-1.5 cursor-pointer ${tab === 'TRAIN' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}>
            <Dumbbell className="w-4 h-4" /> 초식 덱 ({state.skills.length})
          </button>
          <button onClick={() => { sound.playClick(); setTab('CRAFT'); }} className={`py-2.5 flex items-center justify-center gap-1.5 cursor-pointer ${tab === 'CRAFT' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}>
            <Wand2 className="w-4 h-4" /> 무술 조합
          </button>
          <button onClick={() => { sound.playClick(); setTab('BOOKS'); }} className={`py-2.5 flex items-center justify-center gap-1.5 cursor-pointer ${tab === 'BOOKS' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}>
            <BookOpen className="w-4 h-4" /> 서적 ({state.books.filter((b) => !b.decoded).length})
          </button>
        </div>

        <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 space-y-3">
          {tab === 'TRAIN' && (
            <>
              {/* 상단 장착 슬롯 요약 보드 (1식·2식·3식… + 운기 심법을 한눈에!) */}
              <div className="bg-[#1b120c] border-2 border-[#8c6239] p-2.5 sm:p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-[#c7b394]">
                  <span className="font-bold text-[#fde68a]">⚔ 비무 장착 슬롯 ({state.equippedActiveIds.length}/{maxActive})</span>
                  <InGameTooltip {...HANJA_GLOSSARY.PASSIVE}>
                    <span className="underline decoration-dotted underline-offset-2">
                      🌀 운기 심법 ({state.equippedPassiveIds.length}/{maxPassive})
                    </span>
                  </InGameTooltip>
                </div>

                {/* 비무 액티브 슬롯 행 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {Array.from({ length: maxActive }, (_, i) => {
                    const eqId = state.equippedActiveIds[i];
                    const sk = eqId ? state.skills.find((x) => x.id === eqId) : null;
                    return sk ? (
                      <div
                        key={i}
                        className="px-2 py-1.5 bg-[#362415] border border-[#f2c96b] flex items-center justify-between gap-1 min-w-0"
                      >
                        <div className="min-w-0 flex items-center gap-1">
                          <span className="text-[10px] font-bold text-amber-300 shrink-0">{i + 1}식</span>
                          <span className="text-[11px] font-bold text-[#fff8e7] truncate">{sk.customName || sk.name}</span>
                          <span className="text-[9px] text-[#c7b394] shrink-0">Lv.{sk.masteryLevel}</span>
                        </div>
                        {state.equippedActiveIds.length > 1 && (
                          <button
                            onClick={() => { sound.playClick(); onToggleEquipActive(sk.id); }}
                            className="text-[#c7b394] hover:text-rose-300 cursor-pointer shrink-0"
                            aria-label="장착 해제"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div
                        key={i}
                        className="px-2 py-1.5 bg-[#120c08] border border-dashed border-[#5c432c] text-[10px] text-[#786552] flex items-center justify-center"
                      >
                        {i + 1}식 · 비어 있음
                      </div>
                    );
                  })}
                </div>

                {/* 운기 심법 슬롯 행 */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#3d291a]">
                  {Array.from({ length: maxPassive }, (_, i) => {
                    const pId = state.equippedPassiveIds[i];
                    const pSk = pId ? state.skills.find((x) => x.id === pId) : null;
                    return pSk ? (
                      <div
                        key={i}
                        className="px-2 py-1 bg-[#16283d] border border-sky-400/80 text-[11px] flex items-center gap-1.5"
                      >
                        <span className="text-sky-300 font-bold">🌀 {pSk.customName || pSk.name}</span>
                        <span className="text-[10px] text-[#c7b394]">Lv.{pSk.masteryLevel}</span>
                        <button
                          onClick={() => { sound.playClick(); onToggleEquipPassive(pSk.id); }}
                          className="text-sky-200 hover:text-rose-300 cursor-pointer"
                          aria-label="심법 해제"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div
                        key={i}
                        className="px-2 py-1 bg-[#120c08] border border-dashed border-[#3b4d63] text-[10px] text-[#7a8ca3]"
                      >
                        🌀 심법 {i + 1} · 비어 있음
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {sortedSkills.map((s) => {
                  const activeSlotIdx = state.equippedActiveIds.indexOf(s.id);
                  const eqA = activeSlotIdx >= 0;
                  const eqP = state.equippedPassiveIds.includes(s.id);
                  const isTrainTarget = state.seasonPlan.trainSkillId === s.id;
                  const pct = getMasteryPct(s);
                  const atWall = isAtMasteryWall(s);

                  return (
                    <div key={s.id} className={`p-3 border-2 space-y-2 ${eqA ? 'bg-[#332216] border-[#f2c96b]' : eqP ? 'bg-[#172638] border-sky-400' : 'bg-[#1b120c] border-[#5c432c]'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          {renamingId === s.id ? (
                            <div className="flex gap-1">
                              <input value={renameText} onChange={(e) => setRenameText(e.target.value)} maxLength={14} className="bg-[#120c08] border border-[#fde047] px-1.5 py-0.5 text-xs text-[#fde68a] w-28" />
                              <button onClick={() => { if (renameText.trim()) onRenameSkill(s.id, renameText.trim()); setRenamingId(null); }} className="seal-badge px-2 text-[10px] cursor-pointer">OK</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {eqA && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-[#b52b27] text-white font-bold shrink-0">
                                  {activeSlotIdx + 1}식
                                </span>
                              )}
                              {eqP && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-sky-800 text-sky-100 font-bold shrink-0">
                                  심법
                                </span>
                              )}
                              <span className="font-bold text-sm text-[#fde68a] truncate">{s.customName || s.name}</span>
                              <button onClick={() => { setRenamingId(s.id); setRenameText(s.customName || s.name); }} className="text-[10px] text-[#c7b394] hover:text-white cursor-pointer">✎</button>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-[11px] text-[#d6cbb8] mt-0.5 whitespace-nowrap">
                            <span className={s.masteryLevel >= 10 ? 'text-purple-300 font-bold' : 'text-amber-300'}>Lv.{s.masteryLevel} {MASTERY_NAMES[s.masteryLevel]}</span>
                            {atWall && (
                              <InGameTooltip title="벽(壁)" body="입신(Lv.9)의 숙련이 가득 찼습니다. 수련·대련으로는 더 오르지 않으며, 계절 계획의 폐관수련으로 깨달음을 쌓아야 극의(Lv.10)에 이를 수 있습니다.">
                                <span className="text-[10px] px-1 bg-purple-900/70 border border-purple-400/70 text-purple-200 underline decoration-dotted">벽</span>
                              </InGameTooltip>
                            )}
                            {!s.isPassive && (
                              <InGameTooltip title="기본 위력 (⚔)" body="초식의 기본 공격력입니다. 숙련도 레벨과 근력·영력·병기 궁합에 따라 실전 피해가 크게 늘어납니다.">
                                <span className="underline decoration-dotted">⚔{s.power}</span>
                              </InGameTooltip>
                            )}
                            {!s.isPassive && (
                              <InGameTooltip title="소모 기력 (💧)" body="이 초식을 비무에서 시전할 때 소모되는 기력(QI)입니다. 0이면 기력 없이 자유롭게 구사합니다.">
                                <span className="underline decoration-dotted">💧{s.qiCost}</span>
                              </InGameTooltip>
                            )}
                            <span className="text-[10px] px-1 bg-[#38271b]">{FORM_LABEL[s.form]}·{ELEMENT_LABEL[s.element]}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => { sound.playClick(); s.isPassive ? onToggleEquipPassive(s.id) : onToggleEquipActive(s.id); }}
                          className={`px-2.5 py-1 text-[11px] font-bold shrink-0 cursor-pointer ${eqA || eqP ? 'seal-badge' : 'rpg-btn'}`}
                        >
                          {eqA || eqP ? '장착중' : '장착'}
                        </button>
                      </div>

                      {s.imprintedTraits.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {s.imprintedTraits.map((tr) => (
                            <span key={tr.id} className="text-[10px] px-1.5 py-0.5 bg-[#4a2b1a] border border-amber-500/60 text-amber-200">
                              ★ {tr.label}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-2 bg-[#120c08] border border-[#6b4728]">
                          <div className={`h-full ${atWall || s.masteryLevel >= 10 ? 'bg-purple-500' : 'bg-[#c93b2b]'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <button
                          onClick={() => {
                            sound.playClick();
                            const activePos = state.equippedActiveIds.indexOf(s.id);
                            setDetailSkill({ skill: s, formNumber: activePos >= 0 ? activePos + 1 : 1 });
                          }}
                          className="rpg-btn px-2 py-1 text-[11px] font-bold cursor-pointer shrink-0 flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3 text-sky-300" /> 상세·시연
                        </button>
                        <button
                          disabled={s.masteryLevel >= 10 || atWall}
                          onClick={() => { sound.playClick(); onSelectTrainSkill(s.id); }}
                          className={`px-2 py-1 text-[11px] font-bold disabled:opacity-40 cursor-pointer shrink-0 flex items-center gap-1 ${
                            isTrainTarget ? 'bg-amber-600 text-white border border-[#fde047]' : 'rpg-btn'
                          }`}
                        >
                          <Star className="w-3 h-3" /> {isTrainTarget ? '연마중' : '연마'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'CRAFT' && (
            <div className="space-y-3">
              {state.activeCraft && (
                <div className="p-3 bg-[#361459] border-2 border-fuchsia-400 flex items-center justify-between text-xs">
                  <span className="font-bold text-fuchsia-200">
                    진행 중인 조합: 「{state.activeCraft.customName}」 ({state.activeCraft.progress}%)
                  </span>
                  <span className="text-[#fde68a]">계절 계획에 [무술 조합] 포함 시 진행</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 재료 A */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-[#fde68a]">재료 A (기준 초식)</div>
                  <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                    {sortedSkills.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectCraftA(s.id)}
                        className={`w-full text-left px-2.5 py-2 border text-xs flex justify-between items-center gap-1 cursor-pointer ${
                          craftA === s.id ? 'bg-[#4a2b1a] border-[#fde047] text-[#fde68a] font-bold' : 'bg-[#1b120c] border-[#5c432c] text-[#d6cbb8]'
                        }`}
                      >
                        <span className="truncate">{s.customName || s.name}</span>
                        <span className="text-[10px] shrink-0 text-[#c7b394]">Lv.{s.masteryLevel} {WEAPON_GROUP_LABEL[s.weapon]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 재료 B (재료 A와 시그니처·일반 조합 가능 여부 실시간 표시 + 불가 항목 회색 처리!) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#fde68a]">재료 B (조합 대상)</span>
                    <span className="text-[10px] text-[#c7b394]">★시그니처 · ✦일반 · 회색 불가</span>
                  </div>
                  <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                    {craftBOptions.map(({ skill: s, evalRes, possible, alreadyOwned }) => {
                      const isSel = craftB === s.id;
                      const isForb = possible && evalRes?.isForbidden;
                      const isSig = possible && evalRes?.isSignature && !isForb;
                      return (
                        <button
                          key={s.id}
                          disabled={!possible}
                          onClick={() => {
                            sound.playClick();
                            setCraftB(s.id);
                            setCustomCraftName('');
                          }}
                          className={`w-full text-left px-2.5 py-2 border text-xs flex justify-between items-center gap-1.5 transition ${
                            !possible
                              ? 'bg-[#14100d] border-[#382d24] text-[#706459] opacity-45 grayscale cursor-not-allowed'
                              : isSel
                              ? isForb
                                ? 'bg-[#4a1216] border-red-400 text-[#fff1f2] font-bold cursor-pointer'
                                : isSig
                                ? 'bg-[#4a2f14] border-[#fde047] text-[#fde68a] font-bold cursor-pointer'
                                : 'bg-[#36281c] border-emerald-400 text-[#fde68a] font-bold cursor-pointer'
                              : isForb
                              ? 'bg-[#2a1014] border-red-500/60 text-rose-200 hover:border-red-400 cursor-pointer'
                              : isSig
                              ? 'bg-[#2a1f10] border-amber-400/70 text-amber-100 hover:border-[#fde047] cursor-pointer'
                              : 'bg-[#1b120c] border-[#6b4728] text-[#e6d8be] hover:border-emerald-400 cursor-pointer'
                          }`}
                        >
                          <span className="truncate">{s.customName || s.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] opacity-80">Lv.{s.masteryLevel}</span>
                            {isForb ? (
                              <span className="text-[9px] px-1.5 py-0.5 bg-red-900/90 border border-red-400 text-red-200 font-bold">⚠ 금기</span>
                            ) : isSig ? (
                              <span className="text-[9px] px-1.5 py-0.5 bg-amber-900/90 border border-amber-400 text-amber-200 font-bold">★ 시그니처</span>
                            ) : possible ? (
                              <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950/90 border border-emerald-500/70 text-emerald-200 font-bold">✦ 일반</span>
                            ) : (
                              <span className="text-[9px] px-1 py-0.5 bg-[#201914] text-[#807266]">{alreadyOwned ? '보유중' : '불가'}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {preview && (
                <div className={`p-3.5 border-2 space-y-2.5 ${!preview.possible ? 'bg-[#1b120c] border-[#5c432c]' : preview.isForbidden ? 'bg-[#421010] border-red-400' : 'bg-[#2b1e14] border-[#fde047]'}`}>
                  <div className="text-xs font-bold flex items-center gap-1.5 text-[#fde68a]">
                    {preview.isForbidden ? <Flame className="w-4 h-4 text-red-400" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                    <span>{preview.reason}</span>
                  </div>
                  {preview.possible && preview.resultSkill && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={customCraftName}
                        onChange={(e) => setCustomCraftName(e.target.value)}
                        placeholder={preview.suggestedName}
                        maxLength={16}
                        className="flex-1 px-3 py-2 bg-[#120c08] border border-[#c9974c] text-[#fde68a] font-bold text-xs"
                      />
                      <button
                        onClick={() => {
                          sound.playDrum();
                          onStartCraftProject(craftA, craftB, customCraftName || preview.suggestedName);
                          onClose();
                        }}
                        className="seal-badge px-4 py-2 text-xs font-bold cursor-pointer shrink-0"
                      >
                        조합 연구 등록 (Lv.{preview.inheritedLevel} 계승)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'BOOKS' && (
            <div className="space-y-2">
              {state.books.length === 0 ? (
                <div className="text-center py-10 text-xs text-[#c7b394]">보유한 서적이 없습니다. 만물객에게서 비급을 구해 보세요.</div>
              ) : (
                state.books.map((b) => {
                  const targetPts = getBookDecodeTarget(b);
                  const pct = b.decoded ? 100 : Math.min(100, Math.round((b.decodeProgress / Math.max(1, targetPts)) * 100));
                  const isTarget = state.seasonPlan.decodeBookId === b.id;
                  return (
                    <div key={b.id} className="p-3 bg-[#1b120c] border-2 border-[#6b4728] flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-[#fde68a] truncate">{b.title}</div>
                        <div className="text-[11px] text-[#c7b394] mt-0.5">
                          {b.decoded ? '✓ 독파 완료' : `연구 ${pct}%${b.requiresMasteryLv ? ` · 필요 Lv.${b.requiresMasteryLv} / 영력 ${b.requiresQi}` : ''}`}
                        </div>
                        {!b.decoded && (
                          <div className="h-1.5 bg-[#120c08] border border-[#5c432c] mt-1">
                            <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => { sound.playClick(); setDetailBook(b); }}
                          className="rpg-btn px-2 py-1.5 text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <Info className="w-3 h-3 text-sky-300" /> 상세
                        </button>
                        {!b.decoded && (
                          <button
                            onClick={() => { sound.playClick(); onSelectDecodeBook(b.id); onClose(); }}
                            className={`px-2.5 py-1.5 text-xs font-bold cursor-pointer ${isTarget ? 'seal-badge' : 'rpg-btn'}`}
                          >
                            {isTarget ? '연구중' : '연구'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* 초식 상세보기 + 8프레임 라이브 동작/VFX 시연 모달! */}
      {detailSkill && (
        <SkillDetailModal
          state={state}
          skill={detailSkill.skill}
          formNumber={detailSkill.formNumber}
          onClose={() => setDetailSkill(null)}
        />
      )}

      {/* 장서각 서적 상세보기 팝업 */}
      {detailBook && (() => {
        const app = getMerchantBookAppraisal(detailBook);
        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
            <div className="rpg-window max-w-md w-full p-4 space-y-3 animate-ink">
              <div className="flex items-center justify-between border-b border-[#8c6239] pb-2 gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] text-amber-300">{app.rarityLabel}</div>
                  <div className="font-bold text-base text-[#fde68a] truncate">{detailBook.title}</div>
                </div>
                <button onClick={() => setDetailBook(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              {app.skillPreview && (
                <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-1.5 text-xs">
                  <div className="font-bold text-sm text-[#fde68a]">
                    수록 초식: {app.skillPreview.customName || app.skillPreview.name}
                  </div>
                  <div className="text-[11px] text-sky-300">
                    {FORM_LABEL[app.skillPreview.form]} · {ELEMENT_LABEL[app.skillPreview.element]} · 궁합 {WEAPON_GROUP_LABEL[app.skillPreview.weapon]}
                  </div>
                  <p className="text-[#e6d8be] leading-relaxed">{app.skillPreview.description}</p>
                </div>
              )}
              <div className="text-[11px] text-[#c7b394] bg-[#1b120c] p-2.5 border border-[#5c432c] space-y-1">
                <div className="text-amber-300">• {app.decodeNote}</div>
                <div>• {app.craftTip}</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
