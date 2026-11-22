import React, { useState } from 'react';
import { DojoFacilities, GameState, Weapon } from '../types/game';
import { FACILITY_INFO, getDojoInvestmentCosts, getWeaponUpgradeCost } from '../engine/gameLogic';
import { ALL_WEAPONS_CATALOG } from '../data/weapons';
import { COUNTRIES } from '../data/worldAndEndings';
import { WEAPON_GROUP_LABEL } from '../data/booksAndSkills';
import { getWeaponAppraisal } from '../data/worldLore';
import { HANJA_GLOSSARY, InGameTooltip } from './InGameUI';
import { Award, Building2, Coins, Hammer, Info, ShoppingBag, X } from 'lucide-react';
import { sound } from '../engine/sound';

interface Props {
  state: GameState;
  onClose: () => void;
  onUpgradeFacility: (key: keyof DojoFacilities) => void;
  onDojoInvestment: (kind: 'TONIC' | 'BANQUET' | 'CHARITY') => void;
  onEquipWeapon: (weaponId: string) => void;
  onUpgradeWeapon: (weaponId: string) => void;
  onSetHeirloom: (weaponId: string, customName: string) => void;
  onBuyWeapon: (weaponId: string) => void;
  onRenameSect: (newName: string) => void;
  onPayDebt: (amount: number) => void;
}

export const DojoAndWeaponsModal: React.FC<Props> = ({
  state,
  onClose,
  onUpgradeFacility,
  onDojoInvestment,
  onEquipWeapon,
  onUpgradeWeapon,
  onSetHeirloom,
  onBuyWeapon,
  onRenameSect,
  onPayDebt,
}) => {
  const [tab, setTab] = useState<'FACILITY' | 'WEAPONS' | 'SHOP'>('FACILITY');
  const [sectInput, setSectInput] = useState(state.sectName);
  const [heirloomName, setHeirloomName] = useState('');
  const [detailWeapon, setDetailWeapon] = useState<Weapon | null>(null);
  const currency = COUNTRIES[state.country].currency;

  const shopWeapons = ALL_WEAPONS_CATALOG.filter(
    (w) => (w.grade === 'NORMAL' || w.grade === 'FINE') && !state.weapons.some((ow) => ow.id === w.id)
  ).slice(0, 10);

  return (
    <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-2 sm:p-4">
      <div className="rpg-window max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-ink">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#8c6239] bg-[#1b120c]">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-[#fde68a]" />
            <h2 className="text-base sm:text-lg font-bold text-[#fde68a]">도장 · 대장간 · 병기</h2>
            <span className="text-xs text-amber-300 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" /> {state.money}{currency}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-3 border-b-2 border-[#6b4728] bg-[#221710] text-xs font-bold">
          <button onClick={() => { sound.playClick(); setTab('FACILITY'); }} className={`py-2.5 flex items-center justify-center gap-1.5 cursor-pointer ${tab === 'FACILITY' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}>
            <Building2 className="w-4 h-4" /> 시설·현판
          </button>
          <button onClick={() => { sound.playClick(); setTab('WEAPONS'); }} className={`py-2.5 flex items-center justify-center gap-1.5 cursor-pointer ${tab === 'WEAPONS' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}>
            <Hammer className="w-4 h-4" /> 보유 무기 ({state.weapons.length})
          </button>
          <button onClick={() => { sound.playClick(); setTab('SHOP'); }} className={`py-2.5 flex items-center justify-center gap-1.5 cursor-pointer ${tab === 'SHOP' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}>
            <ShoppingBag className="w-4 h-4" /> 병기 상점
          </button>
        </div>

        <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 space-y-3">
          {tab === 'FACILITY' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="p-3 bg-[#1b120c] border border-[#6b4728] flex gap-2 items-center">
                  <input value={sectInput} onChange={(e) => setSectInput(e.target.value)} maxLength={14} className="flex-1 bg-[#120c08] border border-[#8c6239] px-2.5 py-1.5 text-xs text-[#fde68a] font-bold min-w-0" />
                  <button onClick={() => { if (sectInput.trim()) { sound.playDrum(); onRenameSect(sectInput.trim()); } }} className="rpg-btn px-3 py-1.5 text-xs font-bold cursor-pointer shrink-0">
                    현판 변경
                  </button>
                </div>

                {state.debt > 0 && (
                  <div className="p-3 bg-[#3d1414] border border-red-400 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-rose-200">빚 {state.debt}{currency}</span>
                    <button disabled={state.money < Math.min(state.debt, 10)} onClick={() => { sound.playClick(); onPayDebt(Math.min(state.debt, state.money)); }} className="seal-badge px-3 py-1 text-xs font-bold disabled:opacity-40 cursor-pointer">
                      상환
                    </button>
                  </div>
                )}
              </div>

              {state.activeBuild && (
                <div className="p-3 bg-[#2b1d12] border-2 border-[#fde047] space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#fde68a]">
                      🔨 증축 공사 중: {FACILITY_INFO[state.activeBuild.facilityKey].name} → 【{state.activeBuild.targetName}】
                    </span>
                    <span className="font-bold text-amber-300">{state.activeBuild.progress}%</span>
                  </div>
                  <div className="h-2 bg-[#120c08] border border-[#8c6239]">
                    <div className="h-full bg-amber-500" style={{ width: `${state.activeBuild.progress}%` }} />
                  </div>
                  <div className="text-[11px] text-[#c7b394]">
                    계절 계획에 [증축]을 넣으면 진행됩니다. (문하생 {state.disciples.filter((d) => !d.dead).length}명이 일손을 보태 완공 가속!)
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(Object.keys(FACILITY_INFO) as (keyof DojoFacilities)[]).map((key) => {
                  const info = FACILITY_INFO[key];
                  const lv = state.facilities[key];
                  const isMax = lv >= 4;
                  const cost = isMax ? 0 : info.costs[lv];
                  const isBuildingThis = state.activeBuild?.facilityKey === key;
                  return (
                    <div key={key} className={`p-3 border-2 flex flex-col justify-between gap-2 ${isBuildingThis ? 'bg-[#2e2014] border-[#fde047]' : 'bg-[#1b120c] border-[#5c432c]'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-[#fde68a]">{info.name}</span>
                        <span className="text-[11px] text-amber-300">{'★'.repeat(lv)}{'☆'.repeat(4 - lv)}</span>
                      </div>
                      <div className="text-[11px] text-[#c7b394]">{info.stages[lv - 1]} · {info.effectDesc}</div>
                      {isMax ? (
                        <div className="text-xs text-emerald-400 font-bold">✓ 최고 단계</div>
                      ) : isBuildingThis ? (
                        <div className="text-xs text-amber-300 font-bold">🔨 공사 진행 중 ({state.activeBuild?.progress}%)</div>
                      ) : (
                        <button
                          disabled={state.money < cost || Boolean(state.activeBuild)}
                          onClick={() => { sound.playDrum(); onUpgradeFacility(key); }}
                          className="rpg-btn py-1.5 px-3 text-xs font-bold flex justify-between disabled:opacity-40 cursor-pointer"
                        >
                          <span>{state.activeBuild ? '다른 공사 진행중' : `착공 → ${info.stages[lv]}`}</span>
                          <span className="text-amber-300">{cost}{currency}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ★ 후반 금전 순환: 문파 운영 투자 (양생 탕약 / 문파 대연회 / 고을 빈민 구제, 분기당 각 1회) ★ */}
              {(() => {
                const inv = getDojoInvestmentCosts(state);
                const aliveCount = state.disciples.filter((d) => !d.dead).length;
                const tonicDone = state.flags.triggeredEvents.includes(`invest_TONIC_${state.turn}`);
                const banquetDone = state.flags.triggeredEvents.includes(`invest_BANQUET_${state.turn}`);
                const charityDone = state.flags.triggeredEvents.includes(`invest_CHARITY_${state.turn}`);
                const tonicPct = Math.round(Math.min(0.92, 0.78 + (state.facilities.clinic - 1) * 0.04) * 100);
                return (
                  <div className="p-3 bg-[#1a110b] border-2 border-[#7a5634] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#fde68a]">🪙 문파 운영 투자 (분기당 항목별 1회)</span>
                      <span className="text-[10px] text-[#c7b394]">여유 재화로 양생 · 제자 사기 · 명성을 관리</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        disabled={tonicDone || state.money < inv.tonic}
                        onClick={() => { sound.playClick(); onDojoInvestment('TONIC'); }}
                        className="rpg-btn p-2.5 text-left space-y-1 disabled:opacity-40 cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-[#fde68a]">
                          <span>특제 보양 탕약</span>
                          <span className="text-amber-300">{tonicDone ? '완료' : `${inv.tonic}${currency}`}</span>
                        </div>
                        <div className="text-[10px] text-[#c7b394]">건강 +14 ({tonicPct}% · 실패 시 +4)</div>
                      </button>
                      <button
                        disabled={banquetDone || aliveCount === 0 || state.money < inv.banquet}
                        onClick={() => { sound.playDrum(); onDojoInvestment('BANQUET'); }}
                        className="rpg-btn p-2.5 text-left space-y-1 disabled:opacity-40 cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-[#fde68a]">
                          <span>문파 대연회 · 장학금</span>
                          <span className="text-amber-300">{banquetDone ? '완료' : `${inv.banquet}${currency}`}</span>
                        </div>
                        <div className="text-[10px] text-[#c7b394]">제자 {aliveCount}명 충성 +15 · 무공 EXP↑</div>
                      </button>
                      <button
                        disabled={charityDone || state.money < inv.charity}
                        onClick={() => { sound.playDrum(); onDojoInvestment('CHARITY'); }}
                        className="rpg-btn p-2.5 text-left space-y-1 disabled:opacity-40 cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-[#fde68a]">
                          <span>고을 빈민 구제 · 시주</span>
                          <span className="text-amber-300">{charityDone ? '완료' : `${inv.charity}${currency}`}</span>
                        </div>
                        <div className="text-[10px] text-[#c7b394]">명성 +24 · 인덕 +24 · 권위 +6</div>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {tab === 'WEAPONS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {state.weapons.map((w) => {
                const eq = state.equippedWeaponId === w.id;
                const maxUp = Math.min(5, state.facilities.forge + 1);
                const upCost = getWeaponUpgradeCost(w.upgradeLevel);
                return (
                  <div key={w.id} className={`p-3 border-2 space-y-2 ${eq ? 'bg-[#332216] border-[#f2c96b]' : 'bg-[#1b120c] border-[#5c432c]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-[#fde68a] flex items-center gap-1 truncate">
                          <span className="truncate">{w.customName || w.name}</span>
                          {w.upgradeLevel > 0 && <span className="text-amber-400">+{w.upgradeLevel}</span>}
                          {w.isHeirloom && <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        </div>
                        <div className="text-[11px] text-[#c7b394]">
                          {WEAPON_GROUP_LABEL[w.group]} · ⚔{w.attack + w.upgradeLevel * 4} · ⚡{w.speedBonus >= 0 ? '+' : ''}{Math.round(w.speedBonus * 100)}%
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { sound.playClick(); setDetailWeapon(w); }} className="rpg-btn px-2 py-1 text-[11px] flex items-center gap-0.5 cursor-pointer">
                          <Info className="w-3 h-3 text-sky-300" /> 상세
                        </button>
                        <button onClick={() => { sound.playClick(); onEquipWeapon(w.id); }} className={`px-2.5 py-1 text-xs font-bold cursor-pointer ${eq ? 'seal-badge' : 'rpg-btn'}`}>
                          {eq ? '장착중' : '장착'}
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button disabled={w.upgradeLevel >= maxUp || state.money < upCost} onClick={() => { sound.playParry(false); onUpgradeWeapon(w.id); }} className="rpg-btn px-2.5 py-1 text-[11px] disabled:opacity-40 cursor-pointer shrink-0">
                        {w.upgradeLevel >= maxUp ? 'MAX' : `+1 (${upCost})`}
                      </button>
                      {!w.isHeirloom && (
                        <>
                          <input value={heirloomName} onChange={(e) => setHeirloomName(e.target.value)} placeholder="가보명" maxLength={10} className="bg-[#120c08] border border-[#6b4728] px-2 py-1 text-[11px] text-[#fde68a] flex-1 min-w-0" />
                          <InGameTooltip hoverOnly {...HANJA_GLOSSARY.HEIRLOOM}>
                            <button onClick={() => { sound.playDrum(); onSetHeirloom(w.id, heirloomName.trim() || w.name); setHeirloomName(''); }} className="bg-amber-700 text-white px-2 py-1 text-[11px] font-bold cursor-pointer shrink-0">
                              가보
                            </button>
                          </InGameTooltip>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'SHOP' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {shopWeapons.map((w) => (
                <div key={w.id} className="p-3 bg-[#1b120c] border-2 border-[#5c432c] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#fde68a] truncate">{w.name}</div>
                    <div className="text-[11px] text-[#c7b394]">{WEAPON_GROUP_LABEL[w.group]} · ⚔{w.attack} · 파괴{w.postureBreak}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { sound.playClick(); setDetailWeapon(w); }} className="rpg-btn px-2 py-1.5 text-[11px] flex items-center gap-0.5 cursor-pointer">
                      <Info className="w-3 h-3 text-sky-300" /> 상세
                    </button>
                    <button disabled={state.money < w.price} onClick={() => { sound.playClick(); onBuyWeapon(w.id); }} className="seal-badge px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 cursor-pointer">
                      {w.price}{currency}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 병기 상세보기 팝업 */}
      {detailWeapon && (() => {
        const app = getWeaponAppraisal(detailWeapon);
        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
            <div className="rpg-window max-w-md w-full p-4 space-y-3 animate-ink">
              <div className="flex items-center justify-between border-b border-[#8c6239] pb-2 gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] text-amber-300">{app.gradeLabel} · {WEAPON_GROUP_LABEL[detailWeapon.group]}</div>
                  <div className="font-bold text-base text-[#fde68a] truncate">
                    {detailWeapon.customName || detailWeapon.name}
                    {detailWeapon.upgradeLevel > 0 ? ` +${detailWeapon.upgradeLevel}` : ''}
                  </div>
                </div>
                <button onClick={() => setDetailWeapon(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                  <div className="text-[10px] text-[#c7b394]">공격력</div>
                  <div className="font-bold text-[#fde68a]">{detailWeapon.attack + detailWeapon.upgradeLevel * 4}</div>
                </div>
                <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                  <div className="text-[10px] text-[#c7b394]">속도 보정</div>
                  <div className="font-bold text-emerald-300">{detailWeapon.speedBonus >= 0 ? '+' : ''}{Math.round(detailWeapon.speedBonus * 100)}%</div>
                </div>
                <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                  <div className="text-[10px] text-[#c7b394]">체세 파괴</div>
                  <div className="font-bold text-amber-300">{detailWeapon.postureBreak}</div>
                </div>
              </div>
              <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-1.5 text-xs">
                <div className="text-sky-300 font-bold">★ {app.affinityText}</div>
                <div className="text-[#f5e9ce]">• 고유 특성: {detailWeapon.passiveText}</div>
                {(detailWeapon.winsCount || 0) > 0 && (
                  <div className="text-[11px] text-amber-300 pt-1 border-t border-[#3d291a]">
                    ⚔ 이 병기로 거둔 승전: {detailWeapon.winsCount}승 (진검결투 {detailWeapon.realDuelWins || 0}승)
                  </div>
                )}
              </div>
              <div className="text-[11px] italic text-[#d6cbb8] bg-[#1b120c] p-2.5 border border-[#5c432c]">
                {app.merchantQuote}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
