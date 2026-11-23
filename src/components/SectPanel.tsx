import React from 'react';
import { GameState, SectKind, SectStance, SectState } from '../types/game';
import {
  ALLY_PERK,
  getRelationTarget,
  getSectMeetFame,
  getSects,
  getSectStance,
  SECT_KIND_LABEL,
  SECT_KIND_TASTE,
  sectLeaderLabel,
  STANCE_LABEL,
} from '../data/sects';
import { canDoDiplomacy, getSectGiftCost } from '../engine/sectLogic';
import { COUNTRIES, SEASON_META } from '../data/worldAndEndings';
import { PixelPortrait } from './PixelPortrait';
import { InGameTooltip } from './InGameUI';
import { Flag, Gift, Handshake, Swords } from 'lucide-react';
import { sound } from '../engine/sound';
import { josa } from '../utils/korean';

// 강호 문파 탭: 문파마다 관계 눈금 · 세력 · 최근 있었던 일 · 외교 행동(예물, 교류 비무)

interface Props {
  state: GameState;
  onGift: (sectId: string) => void;
  onSpar: (sectId: string) => void;
}

const STANCE_STYLE: Record<SectStance, { badge: string; marker: string; card: string }> = {
  HOSTILE: { badge: 'text-red-100 border-red-400 bg-red-900/80', marker: 'bg-red-400', card: 'border-red-600/70 bg-[#231210]' },
  COLD: { badge: 'text-orange-100 border-orange-400/80 bg-orange-950/70', marker: 'bg-orange-300', card: 'border-[#7a4a2a] bg-[#1e140d]' },
  NEUTRAL: { badge: 'text-stone-100 border-stone-400/70 bg-stone-800/70', marker: 'bg-stone-200', card: 'border-[#5c432c] bg-[#1b120c]' },
  FRIENDLY: { badge: 'text-emerald-100 border-emerald-400/80 bg-emerald-950/70', marker: 'bg-emerald-300', card: 'border-emerald-700/70 bg-[#131a12]' },
  ALLIED: { badge: 'text-[#1b120c] border-[#fde047] bg-[#fde047]', marker: 'bg-[#fde047]', card: 'border-[#fde047] bg-[#2a2212]' },
};

const KIND_SEAL: Record<SectKind, string> = {
  RIVAL: 'bg-sky-900 border-sky-400 text-sky-100',
  ORTHODOX: 'bg-emerald-900 border-emerald-400 text-emerald-100',
  OUTLAW: 'bg-[#3b0d0d] border-red-500 text-red-100',
  MERCHANT: 'bg-amber-900 border-amber-400 text-amber-100',
  SPLINTER: 'bg-purple-950 border-purple-400 text-purple-100',
};

const STANCE_EFFECT: Record<SectStance, string> = {
  HOSTILE: '습격과 살수, 악소문이 따른다',
  COLD: '시비와 도장깨기가 잦다',
  NEUTRAL: '서로 지켜보는 사이',
  FRIENDLY: '교류를 청하고, 위기에 손을 빌려준다',
  ALLIED: '계절마다 혜택 · 위기에 원군',
};

const pct = (relation: number) => ((relation + 100) / 200) * 100;

const RelationGauge: React.FC<{ sect: SectState; target: number }> = ({ sect, target }) => {
  const stance = getSectStance(sect);
  const drift = target - sect.relation;
  return (
    <div className="space-y-1">
      <div className="relative h-3">
        {/* 구간: 적대 · 냉랭 · 중립 · 우호 */}
        <div className="absolute inset-0 flex border border-[#5c432c]">
          <div className="h-full bg-red-900/70" style={{ width: '25%' }} />
          <div className="h-full bg-orange-900/50" style={{ width: '17.5%' }} />
          <div className="h-full bg-stone-700/50" style={{ width: '20%' }} />
          <div className="h-full bg-emerald-900/60" style={{ width: '37.5%' }} />
        </div>
        {/* 세평이 가리키는 자리 */}
        <div className="absolute top-0 bottom-0 w-px bg-[#fde68a]/70 border-l border-dashed border-[#fde68a]/70" style={{ left: `${pct(target)}%` }} />
        {/* 지금의 관계 */}
        <div className={`absolute top-[-3px] bottom-[-3px] w-[5px] border border-[#120c08] ${STANCE_STYLE[stance].marker}`} style={{ left: `calc(${pct(sect.relation)}% - 2.5px)` }} />
      </div>
      <div className="relative h-2.5 text-[9px] text-[#a8957a] leading-none">
        {([['적대', 12.5], ['냉랭', 33.75], ['중립', 52.5], ['우호', 81.25]] as const).map(([label, at]) => (
          <span key={label} className="absolute -translate-x-1/2" style={{ left: `${at}%` }}>{label}</span>
        ))}
      </div>
      {Math.abs(drift) >= 4 && (
        <div className={`text-[10px] ${drift > 0 ? 'text-emerald-300' : 'text-orange-300'}`}>
          세평이 가리키는 자리 {target > 0 ? '+' : ''}{Math.round(target)} — 해가 바뀔 때마다 조금씩 {drift > 0 ? '가까워진다' : '멀어진다'}
        </div>
      )}
    </div>
  );
};

export const SectPanel: React.FC<Props> = ({ state, onGift, onSpar }) => {
  const sects = getSects(state);
  const cur = COUNTRIES[state.country].currency;
  const diplomacyReady = canDoDiplomacy(state);
  const met = sects.filter((s) => s.met);
  const countStance = (k: SectStance) => met.filter((s) => getSectStance(s) === k).length;
  // 사이가 나쁜 문파부터 눈에 들어오게, 아직 모르는 문파는 뒤로
  const ordered = [...sects].sort((a, b) => Number(b.met) - Number(a.met) || (a.kind === 'RIVAL' ? -1 : b.kind === 'RIVAL' ? 1 : a.relation - b.relation));

  return (
    <div className="space-y-3">
      {/* 강호의 형세 */}
      <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-[#c7b394]">
            <span className="text-[#fde68a] font-bold">【{state.sectName}】</span> 주변 강호의 형세
          </div>
          <span className={`text-[10px] px-2 py-0.5 border ${diplomacyReady ? 'border-emerald-500/70 text-emerald-200 bg-emerald-950/50' : 'border-[#5c432c] text-[#a8957a] bg-[#120c08]'}`}>
            {diplomacyReady ? '이번 계절 외교 가능 (1회)' : '이번 계절 외교는 마쳤다'}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {(['HOSTILE', 'COLD', 'NEUTRAL', 'FRIENDLY', 'ALLIED'] as SectStance[]).map((k) => (
            <InGameTooltip key={k} title={STANCE_LABEL[k]} body={STANCE_EFFECT[k]} className="w-full">
              <div className={`w-full border py-1 ${countStance(k) > 0 ? STANCE_STYLE[k].badge : 'border-[#4a3423] text-[#7d6c56] bg-[#120c08]'}`}>
                <div className="text-[10px]">{STANCE_LABEL[k]}</div>
                <div className="text-sm font-bold tabular-nums">{countStance(k)}</div>
              </div>
            </InGameTooltip>
          ))}
        </div>
        <p className="text-[11px] text-[#c7b394] leading-relaxed">
          관계는 사건으로 크게 움직이고, 해가 바뀔 때마다 세평이 가리키는 자리로 조금씩 흐릅니다. 사이가 틀어진 문파는 도장깨기와 습격으로, 가까운 문파는 원군과 교류로 돌아옵니다.
        </p>
      </div>

      {sects.length === 0 && <div className="text-center py-10 text-xs text-[#c7b394]">아직 강호에 알려진 문파가 없습니다.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {ordered.map((s) => {
          const stance = getSectStance(s);
          const style = STANCE_STYLE[stance];
          const taste = SECT_KIND_TASTE[s.kind];
          const short = s.name.replace(/\(.*?\)/g, '');
          const hanja = /\((.*?)\)/.exec(s.name)?.[1] || '';

          if (!s.met) {
            const meetFame = getSectMeetFame(s, state.country);
            return (
              <div key={s.id} className="p-3 border-2 border-dashed border-[#4a3423] bg-[#150e09] opacity-80 space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 shrink-0 border-2 border-[#4a3423] bg-[#120c08] text-[#7d6c56] flex items-center justify-center font-bold text-lg">?</div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#c7b394] truncate">{short} <span className="text-[10px] font-normal">{hanja}</span></div>
                    <div className="text-[10px] text-[#a8957a]">{SECT_KIND_LABEL[s.kind]} · 아직 서로를 의식하지 않는다</div>
                  </div>
                </div>
                <p className="text-[11px] text-[#a8957a] leading-relaxed">
                  {s.kind === 'RIVAL'
                    ? `숙적 ${josa(state.rival.name, '과와')} 처음 마주치면 이 문파와의 인연이 시작됩니다.`
                    : `명성 ${meetFame} 이상이 되면 우리 도장을 눈여겨보기 시작합니다. (지금 ${state.fame})`}
                </p>
              </div>
            );
          }

          const target = getRelationTarget(s, state);
          const giftCost = getSectGiftCost(state, s);
          const canGift = diplomacyReady && state.money >= giftCost;
          const canSpar = diplomacyReady && s.relation >= -15;
          return (
            <div key={s.id} className={`border-2 ${style.card}`}>
              <div className="p-3 space-y-2.5">
                {/* 머리: 인장 · 이름 · 관계 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {s.kind === 'RIVAL' ? (
                      <PixelPortrait role="RIVAL" country={state.country} age={state.rival.age} size={44} />
                    ) : (
                      <div className={`w-11 h-11 shrink-0 border-2 flex items-center justify-center font-serif-kr font-bold text-xl ${KIND_SEAL[s.kind]}`}>{hanja.charAt(0) || short.charAt(0)}</div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#fde68a] truncate">
                        {short} <span className="text-[10px] text-[#c7b394] font-normal">{hanja}</span>
                      </div>
                      <div className="text-[10px] text-[#c7b394] truncate">
                        {SECT_KIND_LABEL[s.kind]} · {sectLeaderLabel(s, state)}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <InGameTooltip title={`${STANCE_LABEL[stance]} (관계 ${s.relation})`} body={STANCE_EFFECT[stance]} sub={`좋아하는 것: ${taste.likes} · 싫어하는 것: ${taste.dislikes}`}>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 border ${style.badge}`}>
                        {stance === 'ALLIED' && <Handshake className="w-3 h-3" />}
                        {stance === 'HOSTILE' && <Flag className="w-3 h-3" />}
                        {STANCE_LABEL[stance]}
                      </span>
                    </InGameTooltip>
                    <div className="text-[11px] text-[#e6d8be] mt-1 tabular-nums">
                      관계 <b className={s.relation >= 25 ? 'text-emerald-300' : s.relation <= -50 ? 'text-red-300' : s.relation <= -15 ? 'text-orange-300' : 'text-[#fde68a]'}>{s.relation > 0 ? '+' : ''}{s.relation}</b>
                    </div>
                  </div>
                </div>

                <RelationGauge sect={s} target={target} />

                <p className="text-[11px] text-[#e6d8be] leading-relaxed">{s.style}</p>
                <div className="text-[10px] leading-relaxed">
                  <span className="text-emerald-300">호감</span> <span className="text-[#c7b394]">{taste.likes}</span>
                  <span className="mx-1.5 text-[#5c432c]">|</span>
                  <span className="text-red-300">반감</span> <span className="text-[#c7b394]">{taste.dislikes}</span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-[#c7b394]">
                  <span className="shrink-0">세력</span>
                  <div className="flex-1 h-1.5 bg-[#120c08] border border-[#5c432c]">
                    <div className="h-full bg-[#b08d57]" style={{ width: `${s.power}%` }} />
                  </div>
                  <span className="tabular-nums text-[#e6d8be] w-6 text-right">{s.power}</span>
                </div>

                {s.allied && (
                  <div className="text-[11px] px-2 py-1 border border-[#fde047]/70 bg-[#3a2f12] text-[#fde68a] flex items-center gap-1">
                    <Handshake className="w-3.5 h-3.5 shrink-0" /> {ALLY_PERK[s.kind]}
                  </div>
                )}

                {/* 최근 있었던 일 */}
                <div className="bg-[#120c08] border border-[#4a3423] px-2 py-1.5 space-y-0.5">
                  <div className="text-[10px] text-[#a8957a]">최근 있었던 일</div>
                  {s.history.length === 0 ? (
                    <div className="text-[11px] text-[#7d6c56]">아직 이렇다 할 일이 없었다.</div>
                  ) : (
                    s.history.slice(0, 3).map((h, i) => (
                      <div key={i} className="flex justify-between gap-2 text-[11px]">
                        <span className="text-[#e6d8be] min-w-0">
                          <span className="text-[#a8957a] tabular-nums">{h.year} {SEASON_META[h.season].label}</span> · {h.text}
                        </span>
                        {h.delta !== 0 && (
                          <span className={`shrink-0 tabular-nums font-bold ${h.delta > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{h.delta > 0 ? '+' : ''}{h.delta}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* 외교 */}
                <div className="flex gap-2">
                  <button
                    disabled={!canGift}
                    onClick={() => { sound.playClick(); onGift(s.id); }}
                    className="flex-1 rpg-btn px-2 py-1.5 text-[11px] disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Gift className="w-3.5 h-3.5 text-amber-300" /> 예물 (-{giftCost}{cur}) <span className="text-emerald-300">+{s.relation <= -50 ? 7 : 11}</span>
                  </button>
                  <button
                    disabled={!canSpar}
                    onClick={() => { sound.playClick(); onSpar(s.id); }}
                    className="flex-1 rpg-btn px-2 py-1.5 text-[11px] disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Swords className="w-3.5 h-3.5 text-sky-300" /> 교류 비무 <span className="text-emerald-300">+6~10</span>
                  </button>
                </div>
                {!diplomacyReady ? null : !canSpar ? (
                  <div className="text-[10px] text-[#a8957a]">사이가 너무 틀어져 교류 비무를 청할 수 없습니다. 예물이나 화해의 자리로 먼저 풀어야 합니다.</div>
                ) : state.money < giftCost ? (
                  <div className="text-[10px] text-[#a8957a]">예물을 보낼 재화가 모자랍니다.</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
