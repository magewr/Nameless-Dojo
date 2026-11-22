import React, { useState } from 'react';
import { GameState } from '../types/game';
import { COUNTRIES, getLifeStage, SEASON_META } from '../data/worldAndEndings';
import { getMaxDisciples } from '../engine/gameLogic';
import { sound } from '../engine/sound';
import {
  Building2,
  ChevronRight,
  Coins,
  HeartPulse,
  Home,
  ScrollText,
  Sparkles,
  Swords,
  Users,
  Volume2,
  VolumeX,
  Wand2,
  Briefcase,
} from 'lucide-react';

interface Props {
  state: GameState;
  onOpenTrain: (tab?: 'TRAIN' | 'CRAFT' | 'BOOKS') => void;
  onOpenDojo: () => void;
  onOpenDisciples: () => void;
  onOpenMerchant: () => void;
  onRest: () => void;
  onOddJob: () => void;
  onPracticeSpar: () => void;
  onNextSeason: () => void;
  onReturnTitle: () => void;
}

export const MainDojoHub: React.FC<Props> = ({
  state,
  onOpenTrain,
  onOpenDojo,
  onOpenDisciples,
  onOpenMerchant,
  onRest,
  onOddJob,
  onPracticeSpar,
  onNextSeason,
  onReturnTitle,
}) => {
  const [muted, setMuted] = useState(sound.muted);
  const cMeta = COUNTRIES[state.country];
  const sMeta = SEASON_META[state.season];
  const lifeStage = getLifeStage(state.age);
  const aliveDisciples = state.disciples.filter((d) => !d.dead);
  const maxD = getMaxDisciples(state.facilities);
  const eqWeapon = state.weapons.find((w) => w.id === state.equippedWeaponId);
  const unreadBooks = state.books.filter((b) => !b.decoded).length;

  // 도장 발전 단계에 따라 수묵화 일러스트 자동 전환
  const dojoBg =
    state.facilities.yard >= 3
      ? '/assets/dojo_grand.jpg'
      : state.facilities.yard >= 2
      ? '/assets/dojo_mid.jpg'
      : '/assets/dojo_ruin.jpg';

  const toggleMute = () => {
    sound.muted = !sound.muted;
    setMuted(sound.muted);
  };

  return (
    <div className="min-h-screen flex flex-col pb-24 lg:pb-6">
      {/* 상단 고정 상태 헤더 */}
      <header className="sticky top-0 z-30 bg-[#1f1a16]/95 text-[#f5ecd9] border-b border-[#5a4e42]/50 shadow-md">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="seal-badge px-2 py-0.5 rounded text-xs font-bold font-sans-kr">
              {cMeta.name.split(' ')[0]} · {state.year}년 {sMeta.label}
            </span>
            <span className="font-serif-kr font-bold text-sm sm:text-base">
              {state.name} ({state.age}세 · {lifeStage.label})
            </span>
            <span className="hidden sm:inline text-xs text-[#d6cbb8]">
              【{state.sectName}】 · 「{state.currentTitle}」
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-sans-kr">
            <span className="flex items-center gap-1 text-emerald-300 font-bold" title="건강 (0이면 사망)">
              <HeartPulse className="w-3.5 h-3.5" /> {state.health}
            </span>
            <span className="flex items-center gap-1 text-amber-300 font-bold">
              <Coins className="w-3.5 h-3.5" /> {state.money}{cMeta.currency}
              {state.debt > 0 && <span className="text-red-400">(빚 {state.debt})</span>}
            </span>
            <span className="px-2 py-0.5 rounded bg-[#9e2a2b] text-white font-bold">
              AP {'●'.repeat(state.ap)}{'○'.repeat(Math.max(0, state.maxAp - state.ap))}
            </span>
            <button onClick={toggleMute} className="p-1 hover:bg-white/10 rounded cursor-pointer" title="사운드 토글">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={onReturnTitle} className="p-1 hover:bg-white/10 rounded cursor-pointer" title="타이틀로 (자동 저장됨)">
              <Home className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 그리드 */}
      <main className="max-w-6xl w-full mx-auto px-3 sm:px-5 pt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        {/* 좌측(7칸): 도장 전경 + 빠른 행동 + 경고 배너 */}
        <div className="lg:col-span-7 space-y-4">
          {/* 도장 전경 카드 */}
          <div className="hanji-panel rounded-lg overflow-hidden">
            <div className="relative h-52 sm:h-64 bg-[#2a221c]">
              <img src={dojoBg} alt="도장 전경" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1511]/85 via-transparent to-black/30" />

              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                <span className="bg-black/65 backdrop-blur-xs text-[#f5ecd9] text-xs px-2.5 py-1 rounded font-serif-kr font-bold">
                  【{state.sectName}】
                </span>
                <span className="bg-[#9e2a2b]/90 text-white text-xs px-2.5 py-1 rounded font-sans-kr">
                  세평: {state.currentTitle}
                </span>
                {state.signboardStolen && (
                  <span className="bg-red-900 text-amber-200 text-xs px-2.5 py-1 rounded font-bold animate-pulse">
                    ⚠ 현판 강탈됨 (수입 급감!)
                  </span>
                )}
              </div>

              <div className="absolute bottom-3 left-3 right-3 text-[#f5ecd9] space-y-1">
                <p className="text-xs sm:text-sm italic drop-shadow">“{sMeta.flavor}”</p>
                <div className="flex flex-wrap gap-3 text-[11px] text-[#e6d8be] font-sans-kr">
                  <span>명성 <b>{state.fame}</b></span>
                  <span>문하생 <b>{aliveDisciples.length}/{maxD}</b></span>
                  <span>{sMeta.bonusHint}</span>
                </div>
              </div>
            </div>

            {/* 비밀 상인 만물객 방문 배너 */}
            {state.merchantOffer && (
              <div className="p-3 bg-[#231d18] text-[#f5ecd9] flex items-center justify-between gap-2 border-t border-amber-500/40">
                <div className="flex items-center gap-2.5">
                  <img src="/assets/merchant.jpg" alt="만물객" className="w-10 h-10 rounded object-cover border border-amber-400/50" />
                  <div>
                    <div className="text-xs font-bold text-amber-300 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> 비밀 상인 「만물객」이 처마 밑에 와 있습니다!
                    </div>
                    <div className="text-[11px] text-[#d6cbb8]">
                      {state.merchantOffer.hasGrimoire ? '⚠ 기이한 붉은 금서의 기운이 느껴집니다…' : '동서양 희귀 서적과 병기 거래 가능'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { sound.playClick(); onOpenMerchant(); }}
                  className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  거래하기
                </button>
              </div>
            )}
          </div>

          {/* 데스크탑/모바일 공용 주요 행동 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <button
              onClick={() => { sound.playClick(); onOpenTrain('TRAIN'); }}
              className="hanji-panel p-3.5 rounded-lg text-left hover:border-[#9e2a2b] transition cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <Swords className="w-5 h-5 text-[#9e2a2b]" />
                {unreadBooks > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-700 text-white font-bold">미해독 {unreadBooks}</span>
                )}
              </div>
              <div className="font-serif-kr font-bold text-sm mt-2 group-hover:text-[#9e2a2b]">무술 연마 · 장착</div>
              <div className="text-[11px] text-[#5a4e42]">보유 초식 {state.skills.length}종</div>
            </button>

            <button
              onClick={() => { sound.playClick(); onOpenTrain('CRAFT'); }}
              className="hanji-panel p-3.5 rounded-lg text-left hover:border-[#9e2a2b] transition cursor-pointer group"
            >
              <Wand2 className="w-5 h-5 text-fuchsia-800" />
              <div className="font-serif-kr font-bold text-sm mt-2 group-hover:text-[#9e2a2b]">무술 창안 (조합)</div>
              <div className="text-[11px] text-[#5a4e42]">개연성 조합 · 금기 초식</div>
            </button>

            <button
              onClick={() => { sound.playClick(); onOpenDojo(); }}
              className="hanji-panel p-3.5 rounded-lg text-left hover:border-[#9e2a2b] transition cursor-pointer group"
            >
              <Building2 className="w-5 h-5 text-[#2c4c6e]" />
              <div className="font-serif-kr font-bold text-sm mt-2 group-hover:text-[#9e2a2b]">도장 증축 · 무기</div>
              <div className="text-[11px] text-[#5a4e42]">시설 · 대장간 · 가보</div>
            </button>

            <button
              onClick={() => { sound.playClick(); onOpenDisciples(); }}
              className="hanji-panel p-3.5 rounded-lg text-left hover:border-[#9e2a2b] transition cursor-pointer group"
            >
              <Users className="w-5 h-5 text-amber-700" />
              <div className="font-serif-kr font-bold text-sm mt-2 group-hover:text-[#9e2a2b]">문하생 · 가족 · 세평</div>
              <div className="text-[11px] text-[#5a4e42]">제자 {aliveDisciples.length}명 · 라이벌 {state.rival.name}</div>
            </button>

            <button
              disabled={state.ap < 1}
              onClick={() => { sound.playClick(); onOddJob(); }}
              className="hanji-panel p-3.5 rounded-lg text-left hover:border-[#9e2a2b] disabled:opacity-45 transition cursor-pointer group"
            >
              <div className="flex justify-between items-center">
                <Briefcase className="w-5 h-5 text-emerald-800" />
                <span className="text-[10px] font-bold text-[#9e2a2b]">1 AP</span>
              </div>
              <div className="font-serif-kr font-bold text-sm mt-2 group-hover:text-[#9e2a2b]">호위 · 생계 의뢰</div>
              <div className="text-[11px] text-[#5a4e42]">즉시 재화 확보</div>
            </button>

            <button
              disabled={state.ap < 1}
              onClick={() => { sound.playClick(); onRest(); }}
              className="hanji-panel p-3.5 rounded-lg text-left hover:border-[#9e2a2b] disabled:opacity-45 transition cursor-pointer group"
            >
              <div className="flex justify-between items-center">
                <HeartPulse className="w-5 h-5 text-rose-700" />
                <span className="text-[10px] font-bold text-[#9e2a2b]">1 AP</span>
              </div>
              <div className="font-serif-kr font-bold text-sm mt-2 group-hover:text-[#9e2a2b]">휴식 및 치료</div>
              <div className="text-[11px] text-[#5a4e42]">건강 회복 · 부상 치료</div>
            </button>
          </div>

          {/* 대련(자유 실시간 전투 연습) & 다음 계절 진행 */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              disabled={state.ap < 1}
              onClick={() => { sound.playDrum(); onPracticeSpar(); }}
              className="sm:w-1/3 py-3 px-4 rounded-md border-2 border-[#9e2a2b]/60 bg-[#fdf5e6] hover:bg-[#f5e3c6] disabled:opacity-45 text-[#9e2a2b] font-bold text-sm cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Swords className="w-4 h-4" /> 타류 대련 (1 AP)
            </button>

            <button
              onClick={() => { sound.playDrum(); onNextSeason(); }}
              className="flex-1 ink-button py-3.5 px-6 rounded-md font-bold text-base flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              다음 계절로 ({SEASON_META[state.season].next === 'SPRING' ? `${state.year + 1}년 봄` : SEASON_META[SEASON_META[state.season].next].label}) <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 우측(5칸): 주인공 능력치 + 상태 + 도장 일지 */}
        <div className="lg:col-span-5 space-y-4">
          {/* 능력치 카드 */}
          <div className="hanji-panel rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#4a3a2c]/20 pb-2">
              <span className="font-serif-kr font-bold text-base">계승자 능력치 ({lifeStage.label})</span>
              <span className="text-[11px] text-[#5a4e42]">{lifeStage.desc}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-sans-kr">
              {[
                { k: '근력 STR', v: state.stats.str, c: 'text-red-900' },
                { k: '민첩 AGI', v: state.stats.agi, c: 'text-emerald-900' },
                { k: '체력 VIT', v: state.stats.vit, c: 'text-amber-900' },
                { k: '정신 WIL', v: state.stats.wil, c: 'text-blue-900' },
                { k: '통찰 INS', v: state.stats.ins, c: 'text-indigo-900' },
                { k: '영력 QI', v: state.stats.qi, c: 'text-fuchsia-900' },
              ].map((st) => (
                <div key={st.k} className="bg-white/60 border border-[#4a3a2c]/15 rounded py-1.5 px-1">
                  <div className="text-[10px] text-[#5a4e42]">{st.k}</div>
                  <div className={`text-base font-black ${st.c}`}>{st.v}</div>
                </div>
              ))}
            </div>

            <div className="text-xs text-[#3c3229] flex flex-wrap justify-between gap-1 pt-1 border-t border-[#4a3a2c]/15">
              <span>장착 병기: <b>{eqWeapon ? `${eqWeapon.customName || eqWeapon.name}${eqWeapon.upgradeLevel > 0 ? ` +${eqWeapon.upgradeLevel}` : ''}` : '맨손'}</b></span>
              <span>간파 창: <b>{Math.round(130 + state.stats.ins * 2.8)}ms</b></span>
            </div>

            {(state.statuses.length > 0 || state.disabilities.length > 0 || state.awakenings.length > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {state.statuses.map((st) => (
                  <span key={st.id} className="text-[11px] px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold">
                    {st.label} ({st.turnsRemaining}턴)
                  </span>
                ))}
                {state.disabilities.map((d) => (
                  <span key={d} className="text-[11px] px-2 py-0.5 rounded bg-stone-800 text-white font-bold">
                    영구 장애: {d === 'ONE_ARM' ? '외팔' : d === 'BLIND' ? '실명' : '다리 절음'}
                  </span>
                ))}
                {state.awakenings.map((aw) => (
                  <span key={aw} className="text-[11px] px-2 py-0.5 rounded bg-amber-600 text-white font-bold">
                    ★ 각성: {aw === 'ONE_ARM_SAINT' ? '외팔 검성' : aw === 'MIND_EYE' ? '심안 맹인검객' : '부동명왕'}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 도장 일지 */}
          <div className="hanji-panel rounded-lg p-4 flex flex-col h-72 lg:h-80">
            <div className="font-serif-kr font-bold text-sm flex items-center gap-1.5 border-b border-[#4a3a2c]/20 pb-2 mb-2">
              <ScrollText className="w-4 h-4 text-[#9e2a2b]" /> 도장 일지 & 저잣거리 소문
            </div>
            <div className="overflow-y-auto space-y-2 flex-1 pr-1 text-xs leading-relaxed">
              {state.logs.map((lg) => (
                <div
                  key={lg.id}
                  className={`p-2 rounded border-l-2 ${
                    lg.type === 'MAGIC'
                      ? 'bg-fuchsia-50/80 border-fuchsia-700 text-fuchsia-950 font-bold'
                      : lg.type === 'DANGER'
                      ? 'bg-red-50/85 border-red-700 text-red-900 font-bold'
                      : lg.type === 'WARN'
                      ? 'bg-amber-50/80 border-amber-600 text-amber-950'
                      : lg.type === 'GOOD'
                      ? 'bg-emerald-50/75 border-emerald-700 text-emerald-950'
                      : lg.type === 'RUMOR'
                      ? 'bg-sky-50/80 border-sky-700 text-sky-950 italic'
                      : 'bg-white/50 border-[#4a3a2c]/30 text-[#3c3229]'
                  }`}
                >
                  <span className="text-[10px] opacity-70 mr-1.5 font-sans-kr">
                    [{lg.year} {SEASON_META[lg.season].label}]
                  </span>
                  {lg.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
