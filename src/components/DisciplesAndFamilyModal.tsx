import React, { useState } from 'react';
import { Disciple, DiscipleRole, GameState } from '../types/game';
import { getMaxDisciples } from '../engine/gameLogic';
import { PixelPortrait } from './PixelPortrait';
import { getSectTitleTooltip, HANJA_GLOSSARY, InGameSelect, InGameTooltip } from './InGameUI';
import { Crown, Heart, Info, Swords, Users, X, Zap } from 'lucide-react';
import { sound } from '../engine/sound';

interface Props {
  state: GameState;
  onClose: () => void;
  onTeachAll: () => void;
  onTeachSkill: (discipleId: string, skillId: string) => void;
  onSetRole: (discipleId: string, role: DiscipleRole) => void;
}

const ROLE_LABEL: Record<DiscipleRole, string> = {
  STUDENT: '수련생',
  INSTRUCTOR: '사범',
  ESCORT: '호위',
  HEIR: '★ 후계자',
};

export const DisciplesAndFamilyModal: React.FC<Props> = ({
  state,
  onClose,
  onTeachAll,
  onTeachSkill,
  onSetRole,
}) => {
  const [tab, setTab] = useState<'DISCIPLES' | 'RELATIONS'>('DISCIPLES');
  const [selectedSkillToTeach, setSelectedSkillToTeach] = useState<string>(state.skills[0]?.id || '');
  const [detailNpc, setDetailNpc] = useState<
    | { kind: 'DISCIPLE'; d: Disciple }
    | { kind: 'SPOUSE' }
    | { kind: 'RIVAL' }
    | { kind: 'MERCHANT' }
    | null
  >(null);

  const aliveDisciples = state.disciples.filter((d) => !d.dead);
  const maxD = getMaxDisciples(state.facilities);

  const repList = [
    { label: '인덕', tip: HANJA_GLOSSARY.VIRTUE, val: state.reputation.virtue, color: 'bg-emerald-500' },
    { label: '살기', tip: HANJA_GLOSSARY.RUTHLESS, val: state.reputation.ruthless, color: 'bg-red-600' },
    { label: '상무', tip: HANJA_GLOSSARY.COMMERCE, val: state.reputation.commerce, color: 'bg-amber-500' },
    { label: '구도', tip: HANJA_GLOSSARY.ASCETIC, val: state.reputation.ascetic, color: 'bg-sky-500' },
    { label: '이단', tip: HANJA_GLOSSARY.ARCANE, val: state.reputation.arcane, color: 'bg-fuchsia-500' },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-2 sm:p-4">
      <div className="rpg-window max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-ink">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#8c6239] bg-[#1b120c]">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#fde68a]" />
            <h2 className="text-base sm:text-lg font-bold text-[#fde68a]">문하생 · 인연 · 세평</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 border-b-2 border-[#6b4728] bg-[#221710] text-xs font-bold">
          <button onClick={() => { sound.playClick(); setTab('DISCIPLES'); }} className={`py-2.5 flex items-center justify-center gap-1.5 cursor-pointer ${tab === 'DISCIPLES' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}>
            <Users className="w-4 h-4" /> 문하생 ({aliveDisciples.length}/{maxD})
          </button>
          <button onClick={() => { sound.playClick(); setTab('RELATIONS'); }} className={`py-2.5 flex items-center justify-center gap-1.5 cursor-pointer ${tab === 'RELATIONS' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}>
            <Heart className="w-4 h-4" /> 가족 · 라이벌 · 세평
          </button>
        </div>

        <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 space-y-3">
          {tab === 'DISCIPLES' && (
            <>
              <div className="flex flex-col sm:flex-row gap-2 bg-[#1b120c] p-2.5 border border-[#6b4728]">
                <div className="flex-1 min-w-0">
                  <InGameSelect
                    title="문하생에게 전수할 초식 선택"
                    value={selectedSkillToTeach}
                    onChange={setSelectedSkillToTeach}
                    options={state.skills.map((s) => ({
                      value: s.id,
                      label: `${s.customName || s.name} (Lv.${s.masteryLevel})`,
                      sub: `위력 ${s.power}`,
                    }))}
                  />
                </div>
                <button
                  disabled={aliveDisciples.length === 0}
                  onClick={() => { sound.playClick(); onTeachAll(); }}
                  className="seal-badge px-3 py-1.5 text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5" /> 계획에 [제자 지도] 추가
                </button>
              </div>

              {aliveDisciples.length === 0 ? (
                <div className="text-center py-10 text-xs text-[#c7b394]">아직 문하생이 없습니다.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {aliveDisciples.map((d) => (
                    <div key={d.id} className={`p-3 border-2 space-y-2 ${d.role === 'HEIR' ? 'bg-[#362614] border-[#fde047]' : 'bg-[#1b120c] border-[#5c432c]'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <PixelPortrait role={d.isChild ? 'HERO' : 'DISCIPLE'} country={state.country} gender={d.gender} age={d.age} variantHint={d.name + d.archetype} size={40} />
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-[#fde68a] flex items-center gap-1 truncate">
                              {d.role === 'HEIR' && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                              <span className="truncate">{d.name}</span>
                              <span className="text-[11px] text-[#c7b394]">({d.age})</span>
                              {d.isGenius && <span className="text-[10px] text-amber-300">★</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#c7b394] mt-0.5">
                              <InGameTooltip {...HANJA_GLOSSARY.STR}><span className="underline decoration-dotted">⚔{d.stats.str}</span></InGameTooltip>
                              <InGameTooltip {...HANJA_GLOSSARY.AGI}><span className="underline decoration-dotted">⚡{d.stats.agi}</span></InGameTooltip>
                              <InGameTooltip {...HANJA_GLOSSARY.VIT}><span className="underline decoration-dotted">♥{d.stats.vit}</span></InGameTooltip>
                              <InGameTooltip {...HANJA_GLOSSARY.INS}><span className="underline decoration-dotted">👁{d.stats.ins}</span></InGameTooltip>
                              <InGameTooltip {...HANJA_GLOSSARY.QI}><span className="underline decoration-dotted">💧{d.stats.qi}</span></InGameTooltip>
                            </div>
                          </div>
                        </div>
                        <div className="w-24 shrink-0">
                          <InGameSelect
                            title={`${d.name}의 직책 지정`}
                            value={d.role}
                            onChange={(val) => onSetRole(d.id, val as DiscipleRole)}
                            options={(['STUDENT', 'INSTRUCTOR', 'ESCORT', 'HEIR'] as DiscipleRole[]).map((r) => ({
                              value: r,
                              label: ROLE_LABEL[r],
                              sub:
                                r === 'HEIR'
                                  ? '유파의 차기 도장주 후계자'
                                  : r === 'INSTRUCTOR'
                                  ? '사범 · 수련 지도 보조'
                                  : r === 'ESCORT'
                                  ? '호위 · 상단 호위 수익 대폭↑'
                                  : '일반 수련생',
                            }))}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {d.skills.map((s) => (
                            <InGameTooltip
                              key={s.id}
                              title={`${s.customName || s.name} Lv.${s.masteryLevel}`}
                              body={s.description}
                              sub={`위력 ${s.power} · 기력 ${s.qiCost}${s.isMutated ? ' · ★ 변이 각성' : ''}${s.isDegraded ? ' · 열화 전수' : ''}`}
                            >
                              <span className="text-[10px] px-1.5 py-0.5 bg-[#2d1f15] border border-[#6b4728] text-[#e6d8be] whitespace-nowrap">
                                {s.customName || s.name} Lv.{s.masteryLevel}
                                {s.isMutated && <span className="text-fuchsia-300 ml-0.5">★</span>}
                              </span>
                            </InGameTooltip>
                          ))}
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => { sound.playClick(); setDetailNpc({ kind: 'DISCIPLE', d }); }} className="rpg-btn px-2.5 py-1 text-[11px] flex items-center gap-0.5 cursor-pointer">
                            <Info className="w-3 h-3 text-sky-300" /> 상세
                          </button>
                          <button onClick={() => { sound.playClick(); onTeachSkill(d.id, selectedSkillToTeach); }} className="seal-badge px-2.5 py-1 text-[11px] font-bold cursor-pointer">
                            초식 전수
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

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
                          <div className="font-bold text-sm text-[#fde68a] truncate">{state.spouse.name} ({state.spouse.age}세)</div>
                          <div className="text-[11px] text-[#c7b394] truncate">{state.spouse.bonusDesc}</div>
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
                      <div className="text-[11px] text-[#c7b394]">
                        {state.rival.act}막 · {state.rival.lossesAgainstPlayer}승 {state.rival.winsAgainstPlayer}패
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

      {/* 인물(문하생·배우자·숙적·만물객) 상세보기 팝업 */}
      {detailNpc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
          <div className="rpg-window max-w-md w-full p-4 space-y-3 animate-ink max-h-[86vh] overflow-y-auto">
            {detailNpc.kind === 'DISCIPLE' && (
              <>
                <div className="flex items-center justify-between border-b border-[#8c6239] pb-2">
                  <div className="flex items-center gap-2.5">
                    <PixelPortrait role={detailNpc.d.isChild ? 'HERO' : 'DISCIPLE'} country={state.country} gender={detailNpc.d.gender} age={detailNpc.d.age} variantHint={detailNpc.d.name + detailNpc.d.archetype} size={48} />
                    <div>
                      <div className="font-bold text-base text-[#fde68a]">
                        {detailNpc.d.name} ({detailNpc.d.age}세) {detailNpc.d.isGenius ? '★ 천재' : ''}
                      </div>
                      <div className="text-[11px] text-amber-300">
                        {detailNpc.d.archetype} · {ROLE_LABEL[detailNpc.d.role]} · 충성도 {detailNpc.d.loyalty}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setDetailNpc(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-6 gap-1 text-center text-xs">
                  {([
                    ['근력', detailNpc.d.stats.str, HANJA_GLOSSARY.STR],
                    ['민첩', detailNpc.d.stats.agi, HANJA_GLOSSARY.AGI],
                    ['체력', detailNpc.d.stats.vit, HANJA_GLOSSARY.VIT],
                    ['정신', detailNpc.d.stats.wil, HANJA_GLOSSARY.WIL],
                    ['통찰', detailNpc.d.stats.ins, HANJA_GLOSSARY.INS],
                    ['영력', detailNpc.d.stats.qi, HANJA_GLOSSARY.QI],
                  ] as const).map(([k, v, tip]) => (
                    <InGameTooltip key={k} {...tip} className="w-full">
                      <div className="w-full bg-[#1b120c] border border-[#5c432c] py-1">
                        <div className="text-[10px] text-[#c7b394] underline decoration-dotted">{k}</div>
                        <div className="font-bold text-[#fde68a]">{v}</div>
                      </div>
                    </InGameTooltip>
                  ))}
                </div>
                <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-1.5 text-xs">
                  <div className="font-bold text-[#fde68a]">습득 초식 ({detailNpc.d.skills.length}종)</div>
                  <div className="space-y-1">
                    {detailNpc.d.skills.map((s) => (
                      <div key={s.id} className="flex justify-between items-center text-[11px] bg-[#120c08] px-2 py-1 border border-[#4a3423]">
                        <span className="text-[#f5e9ce]">
                          {s.customName || s.name} Lv.{s.masteryLevel}
                          {s.isMutated && <span className="ml-1 text-fuchsia-300">[변이 각성]</span>}
                          {s.isDegraded && <span className="ml-1 text-amber-400">[열화 전수]</span>}
                        </span>
                        <span className="text-[#c7b394]">위력 {s.power}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {detailNpc.kind === 'SPOUSE' && state.spouse && (
              <>
                <div className="flex items-center justify-between border-b border-[#8c6239] pb-2">
                  <div className="flex items-center gap-2.5">
                    <PixelPortrait role="SPOUSE" country={state.country} age={state.age} gender={state.spouse?.gender || (state.gender === 'FEMALE' ? 'MALE' : 'FEMALE')} variantHint={state.spouse?.name} size={52} />
                    <div>
                      <div className="font-bold text-base text-[#fde68a]">{state.spouse.name} ({state.spouse.age}세)</div>
                      <div className="text-[11px] text-rose-300">도장의 반려자</div>
                    </div>
                  </div>
                  <button onClick={() => setDetailNpc(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-xs leading-relaxed text-[#f5e9ce]">
                  풍파 많은 무명도장의 곁을 지키며 평생을 함께 걷는 반려자입니다. 도장의 살림과 제자들을 돌보며 당신이 무도에 전념할 수 있도록 힘을 보탭니다.
                </p>
                <div className="p-2.5 bg-[#1b120c] border border-rose-400/60 text-xs text-rose-200">
                  ♥ 동행 효과: {state.spouse.bonusDesc}
                </div>
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
