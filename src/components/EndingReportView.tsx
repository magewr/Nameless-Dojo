import React, { useEffect, useMemo, useState } from 'react';
import { GameState, LegacyRecord } from '../types/game';
import { COUNTRIES, generatePostMortemEnding } from '../data/worldAndEndings';
import { BOOK_SKILL_TEMPLATES, MASTERY_NAMES } from '../data/booksAndSkills';
import { getDojoMapSrc } from '../pixel/spriteLoader';
import { appendLegacyRecord, clearGameState, hasUnlockedHellDifficulty, markGameCleared } from '../engine/storage';
import { getDifficultyConfig } from '../data/difficulty';
import { PixelPortrait } from './PixelPortrait';
import { Award, ChevronLeft, ChevronRight, GitBranch, History, RotateCcw, ScrollText } from 'lucide-react';
import { sound } from '../engine/sound';

interface Props {
  state: GameState;
  onReturnTitle: () => void;
}

interface EndingScene {
  bg: string;
  eraBadge: string;
  title: string;
  speaker?: string;
  showHeroPortrait?: boolean;
  text: string;
  subNote?: string;
}

export const EndingReportView: React.FC<Props> = ({ state, onReturnTitle }) => {
  const [mode, setMode] = useState<'CINEMATIC' | 'ARCHIVE'>('CINEMATIC');
  const [sceneIdx, setSceneIdx] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const [tab, setTab] = useState<'CHRONICLE' | 'GENEALOGY'>('CHRONICLE');
  const [savedLegacy, setSavedLegacy] = useState(false);

  const report = useMemo(() => generatePostMortemEnding(state), [state]);
  const topSkill = useMemo(
    () => [...state.skills].sort((a, b) => b.masteryLevel - a.masteryLevel || b.power - a.power)[0],
    [state.skills]
  );
  const heirloom = state.weapons.find((w) => w.isHeirloom) || state.weapons.find((w) => w.id === state.equippedWeaponId);

  // 임종 → 장례식·계승 → 사후 19세기 → 20세기 → 2026년 현대 시네마틱 컷신 시퀀스!
  const scenes: EndingScene[] = useMemo(() => {
    const isDuelDeath = state.deathCause === '진검결투 전사';
    const isForbiddenDeath = state.deathCause === '주화입마 반동사';

    const deathLine1 = isDuelDeath
      ? '시야가 검붉게 기울었다. 귓가에서 쇳소리가 멀어지고, 차가운 흙바닥의 감촉이 뺨에 닿았다. 무인으로서 칼을 쥐고 쓰러지는 것이 억울하지는 않았으나, 아직 완성하지 못한 초식과 도장의 얼굴들이 눈앞을 스쳤다.'
      : isForbiddenDeath
      ? '인간의 몸으로 감당해서는 안 될 금단의 힘을 억지로 끌어다 쓴 대가였다. 마지막 일격을 날린 직후 경맥이 불타오르듯 터져 나갔고, 그 자리에 무릎을 꿇은 채 다시는 일어나지 못했다.'
      : `겨울빛이 창호지 너머로 길게 누웠다. 평생을 휘둘러 온 오른손은 이제 찻잔 하나 들기 버거울 만큼 마르고 굳어 있었다. 방 안을 가득 채운 흐느낌이 멀리서 들리는 파도 소리처럼 아득하다.`;

    const lastWords = isDuelDeath
      ? '“……횡베기 하나, 종베기 하나에서 여기까지 왔구나. 내 칼은 여기서 멈추지만…… 도장의 불빛만은 꺼지지 않기를.”'
      : isForbiddenDeath
      ? '“……결국 끝을 보았구나. 후회하지는 않는다. 이 경지 너머는…… 다음 세대에 맡기마.”'
      : '“횡베기 하나, 종베기 하나에서 시작했는데…… 참 멀리도 왔구나. 이제 내 뒤는…… 너희가 지켜 다오.”';

    const list: EndingScene[] = [
      {
        bg: isDuelDeath ? '/assets/px_battle_duel_stage.jpg' : '/assets/px_end_death.jpg',
        eraBadge: `${state.year}년 · 향년 ${state.age}세`,
        title: isDuelDeath ? '최후의 진검' : isForbiddenDeath ? '불타오른 경맥' : '겨울밤의 영면',
        text: deathLine1,
      },
      {
        bg: isDuelDeath ? '/assets/px_battle_duel_stage.jpg' : '/assets/px_end_death.jpg',
        eraBadge: `${state.name}의 마지막 말`,
        title: '남겨진 유언',
        speaker: `${state.name} (${state.age}세)`,
        showHeroPortrait: true,
        text: lastWords,
        subNote: '가느다란 숨이 멎었다. 한 시대를 살다 간 무인의 일생이 조용히 막을 내렸다. — 그러나 이야기는 아직 끝나지 않았다.',
      },
      {
        bg: getDojoMapSrc(state.country, state.facilities.yard),
        eraBadge: `${state.year}년 · 장례와 계승`,
        title: `【${state.sectName}】 그 이후`,
        text: `${report.funeralParagraph}\n\n${report.heirSummary}`,
        subNote: report.rivalSummary,
      },
    ];

    // 사후 200년 연대기 각 시대를 전용 32비트 픽셀 일러스트와 함께 1장씩 전개!
    const eraBgs = ['/assets/px_end_era19.jpg', '/assets/px_title_bg.jpg', '/assets/px_end_modern.jpg'];
    report.chronicle.forEach((entry, idx) => {
      list.push({
        bg: eraBgs[idx] || '/assets/px_end_modern.jpg',
        eraBadge: entry.badge ? `${entry.yearLabel} · ${entry.badge}` : entry.yearLabel,
        title: entry.headline,
        text: entry.body,
      });
    });

    return list;
  }, [state, report]);

  const curScene = scenes[Math.min(sceneIdx, scenes.length - 1)];
  const isFinishedTyping = typedLen >= curScene.text.length;

  useEffect(() => {
    if (mode !== 'CINEMATIC') return;
    setTypedLen(0);
    // 여운을 살린 차분한 타자기 속도 (30ms)
    const timer = setInterval(() => {
      setTypedLen((v) => {
        if (v >= curScene.text.length) {
          clearInterval(timer);
          return v;
        }
        if (v % 4 === 0) sound.playBlip();
        return v + 1;
      });
    }, 28);
    return () => clearInterval(timer);
  }, [mode, sceneIdx, curScene.text]);

  const handleAdvanceScene = () => {
    if (!isFinishedTyping) {
      setTypedLen(curScene.text.length);
      return;
    }
    sound.playClick();
    if (sceneIdx < scenes.length - 1) {
      setSceneIdx((i) => i + 1);
    } else {
      sound.playDrum();
      setMode('ARCHIVE');
    }
  };

  useEffect(() => {
    if (mode !== 'CINEMATIC') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        handleAdvanceScene();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleSaveLegacy = () => {
    sound.playLevelUp();
    const record: LegacyRecord = {
      id: `leg_${Date.now()}`,
      savedAt: new Date().toISOString(),
      country: state.country,
      difficulty: state.difficulty || 'EASY',
      founderName: state.name,
      sectName: state.sectName,
      finalTitle: state.currentTitle,
      deathYear: state.year,
      deathAge: state.age,
      deathCause: state.deathCause || '천수',
      fame: state.fame,
      usedMagic: state.flags.usedMagicPublicly,
      signatureSkill: topSkill,
      heirloomWeapon: heirloom,
      endingTitle: report.endingTitle,
    };
    const qualifiedClear =
      state.age >= 55 ||
      (state.deathCause || '').includes('천수') ||
      (state.flags.tournamentWins || 0) >= 1;
    if (qualifiedClear) markGameCleared();
    appendLegacyRecord(record);
    clearGameState();
    setSavedLegacy(true);
  };

  // =====================================================================
  // Mode 1: 여운 넘치는 풀스크린 시네마틱 엔딩 컷신 시퀀스
  // =====================================================================
  if (mode === 'CINEMATIC') {
    return (
      <div
        onClick={handleAdvanceScene}
        className="fixed inset-0 bg-[#0b0806] flex flex-col justify-between overflow-hidden cursor-pointer select-none"
      >
        {/* 장면별 32비트 픽셀아트 배경 (부드러운 전환) */}
        <img
          key={curScene.bg}
          src={curScene.bg}
          alt={curScene.title}
          className="pixel-canvas absolute inset-0 w-full h-full object-cover opacity-85 animate-ink"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/65" />

        {/* 상단 시네마틱 레터박스 */}
        <div className="relative z-10 p-3 sm:p-5 flex items-center justify-between gap-2">
          <div className="rpg-window px-3 py-1.5 bg-black/80 text-xs flex items-center gap-2">
            <span className="text-[#fde68a] font-bold">{curScene.eraBadge}</span>
            <span className="text-[#8c6239]">|</span>
            <span className="text-[#c7b394]">{sceneIdx + 1} / {scenes.length}</span>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {sceneIdx > 0 && (
              <button
                onClick={() => { sound.playClick(); setSceneIdx((i) => Math.max(0, i - 1)); }}
                className="rpg-btn px-2.5 py-1 text-xs flex items-center gap-0.5 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> 이전
              </button>
            )}
            <button
              onClick={() => { sound.playClick(); setMode('ARCHIVE'); }}
              className="rpg-btn px-3 py-1 text-xs cursor-pointer"
            >
              전체 연대기 보기 ▶
            </button>
          </div>
        </div>

        {/* 중앙 상단 장면 제목 (영화 자막 감성) */}
        <div className="relative z-10 text-center px-4 pointer-events-none">
          <h2 className="text-2xl sm:text-4xl font-bold text-[#fde68a] drop-shadow-[0_3px_6px_rgba(0,0,0,0.95)] tracking-wider">
            {curScene.title}
          </h2>
        </div>

        {/* 하단 나레이션 / 유언 박스 */}
        <div className="relative z-10 max-w-3xl w-full mx-auto p-3 sm:p-6">
          <div className="rpg-window p-4 sm:p-6 bg-[#1b120c]/94 space-y-3 min-h-[155px] flex flex-col justify-between">
            <div className="flex items-start gap-4">
              {curScene.showHeroPortrait && (
                <PixelPortrait
                  role="HERO"
                  country={state.country}
                  age={state.age}
                  gender={state.gender}
                  size={74}
                />
              )}
              <div className="flex-1 space-y-2">
                {curScene.speaker && (
                  <div className="text-xs font-bold text-[#fde68a]">{curScene.speaker}</div>
                )}
                <p className="text-sm sm:text-base leading-7 sm:leading-8 text-[#f5e9ce] whitespace-pre-line">
                  {curScene.text.slice(0, typedLen)}
                  {!isFinishedTyping && <span className="inline-block w-2 h-4 bg-[#fde68a] ml-1 animate-pulse" />}
                </p>
                {isFinishedTyping && curScene.subNote && (
                  <p className="text-xs sm:text-sm text-[#d6cbb8]/90 italic border-t border-[#6b4728]/60 pt-2 animate-ink">
                    {curScene.subNote}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end text-xs text-[#e5b75a] pt-1">
              {isFinishedTyping && (
                <span className="flex items-center gap-1 animate-bob">
                  {sceneIdx === scenes.length - 1 ? '유파 족보 · 레거시 기록으로' : '다음 장면 (클릭 / Space)'}
                  <ChevronRight className="w-4 h-4" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =====================================================================
  // Mode 2: 최종 유파 족보 & 사후 200년 아카이브 + 레거시 영구 저장
  // =====================================================================
  return (
    <div className="h-screen overflow-y-auto py-5 px-3 sm:px-6 flex justify-center bg-[#120d0a]">
      <div className="rpg-window max-w-4xl w-full overflow-hidden flex flex-col animate-ink h-fit">
        <div className="bg-[#18100b] text-[#f5ecd9] p-5 sm:p-7 text-center space-y-2 border-b-2 border-[#c9974c]">
          <div className="inline-block seal-badge text-xs px-3 py-0.5 tracking-widest">
            [{getDifficultyConfig(state).shortLabel}] {state.year}년 영면 · 향년 {state.age}세 ({state.deathCause || '천수'})
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#fde68a] pt-1">{report.endingTitle}</h1>
          <p className="text-xs text-[#d6cbb8]">{report.endingSubtitle} · {COUNTRIES[state.country].name}</p>
          {(state.age >= 55 || (state.deathCause || '').includes('천수') || (state.flags.tournamentWins || 0) >= 1) && (
            <div className="inline-block px-2.5 py-1 text-[11px] font-bold bg-rose-950/80 border border-rose-400 text-rose-200">
              ☠ {hasUnlockedHellDifficulty() ? '【지옥 · 수라의 시대】 난이도 해금 완료!' : '일생 완주 달성! 【지옥 · 수라의 시대】 난이도 해금!'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 border-b-2 border-[#6b4728] bg-[#221710] text-xs sm:text-sm font-bold">
          <button
            onClick={() => { sound.playClick(); setTab('CHRONICLE'); }}
            className={`py-3 flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'CHRONICLE' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'
            }`}
          >
            <History className="w-4 h-4" /> 사후 200년 연대기
          </button>
          <button
            onClick={() => { sound.playClick(); setTab('GENEALOGY'); }}
            className={`py-3 flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'GENEALOGY' ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'
            }`}
          >
            <GitBranch className="w-4 h-4" /> 유파 족보 · 계통도
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 flex-1">
          {tab === 'CHRONICLE' ? (
            <>
              <div className="p-4 bg-[#1b120c] border-l-4 border-[#c93b2b] text-xs sm:text-sm leading-7 text-[#f5e9ce]">
                {report.funeralParagraph}
              </div>

              <div className="relative pl-6 border-l-2 border-[#c9974c]/60 space-y-5">
                {report.chronicle.map((ev, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 bg-[#c93b2b] border-2 border-[#fde68a]" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#fde68a]">{ev.yearLabel}</span>
                      {ev.badge && (
                        <span className="text-[10px] px-2 py-0.5 bg-[#4a2b1a] border border-[#f2c96b] text-[#fde68a] font-bold">
                          {ev.badge}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-[#fff8e7] mt-1">{ev.headline}</h3>
                    <p className="text-xs sm:text-sm leading-6 text-[#d6cbb8] mt-1">{ev.body}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2.5">
                <h3 className="text-base font-bold text-[#fde68a] flex items-center gap-2 border-b border-[#6b4728] pb-2">
                  <ScrollText className="w-4 h-4" /> 【{state.sectName}】 무술 계통도
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {state.skills.map((s) => (
                    <div key={s.id} className="p-3 border border-[#6b4728] bg-[#1b120c] space-y-1">
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-sm text-[#fde68a]">{s.customName || s.name}</span>
                        <span className="text-xs text-amber-300">Lv.{s.masteryLevel} {MASTERY_NAMES[s.masteryLevel]}</span>
                      </div>
                      {s.parents && (
                        <div className="text-[11px] text-[#c7b394]">
                          {s.parents
                            .map((pid) => state.skills.find((x) => x.id === pid)?.name || BOOK_SKILL_TEMPLATES[pid]?.name || pid)
                            .join(' + ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
                <div className="p-3.5 border border-[#6b4728] bg-[#1b120c] space-y-1.5">
                  <div className="font-bold text-sm text-[#fde68a]">유파 계승</div>
                  <p>창시자: {state.name} (1750~{state.year})</p>
                  <p>배우자: {state.spouse ? state.spouse.name : '독신'}</p>
                  <p>{report.heirSummary}</p>
                </div>
                <div className="p-3.5 border border-[#6b4728] bg-[#1b120c] space-y-1.5">
                  <div className="font-bold text-sm text-sky-300">라이벌 · 전적</div>
                  <p>{report.rivalSummary}</p>
                  <p>진검 {state.flags.realDuelWins}승 · 비무 {state.flags.sparringWins}승 · 문하생 {state.disciples.filter((d) => !d.dead).length}명</p>
                </div>
              </div>
            </div>
          )}

          <div className="pt-3 border-t-2 border-[#6b4728] flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={() => { sound.playClick(); setSceneIdx(0); setMode('CINEMATIC'); }}
              className="rpg-btn py-3 px-4 text-xs font-bold cursor-pointer"
            >
              ◀ 컷신 다시 감상
            </button>
            <button
              disabled={savedLegacy}
              onClick={handleSaveLegacy}
              className="flex-1 seal-badge py-3 px-4 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Award className="w-4 h-4" />
              {savedLegacy ? '✓ 레거시 저장 완료' : '유파 기록 & 전생 비급 레거시 저장'}
            </button>
            <button
              onClick={() => { if (!savedLegacy) clearGameState(); onReturnTitle(); }}
              className="rpg-btn py-3 px-5 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" /> 타이틀로
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
