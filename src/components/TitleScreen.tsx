import React, { useEffect, useState } from 'react';
import { LegacyRecord } from '../types/game';
import { DIFFICULTY_CONFIGS } from '../data/difficulty';
import { loadGameState, loadLegacyRecords, loadUnlockedAchievements } from '../engine/storage';
import { ACHIEVEMENTS } from '../data/achievements';
import { AchievementsModal } from './AchievementsModal';
import { preloadAllGameArt } from '../pixel/spriteLoader';
import { BookOpen, Play, RotateCcw, ScrollText, Trophy, X } from 'lucide-react';
import { COUNTRIES, SEASON_META } from '../data/worldAndEndings';
import { sound } from '../engine/sound';

interface Props {
  onNewGame: () => void;
  onContinue: () => void;
}

export const TitleScreen: React.FC<Props> = ({ onNewGame, onContinue }) => {
  const [showLegacy, setShowLegacy] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const savedState = loadGameState();
  const canContinue = Boolean(savedState && savedState.phase !== 'TITLE' && savedState.phase !== 'CREATE');
  const legacies: LegacyRecord[] = loadLegacyRecords();
  const achDone = loadUnlockedAchievements().length;

  useEffect(() => {
    preloadAllGameArt();
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-[#0d1018] overflow-hidden">
      {/* 고퀄리티 32비트 픽셀아트 타이틀 배경 */}
      <img
        src="/assets/px_title_bg.jpg"
        alt="무명도장 타이틀 배경"
        className="pixel-canvas absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0a08]/90 via-[#0d0a08]/35 to-[#0d0a08]/55" />

      <div className="relative z-10 max-w-md w-full text-center space-y-5 animate-ink">
        <div className="space-y-1.5">
          <h1 className="text-5xl sm:text-6xl font-bold text-[#fde68a] drop-shadow-[0_4px_0_#1a0f08] tracking-wider">
            무명도장
          </h1>
          <p className="text-sm text-[#f3e3c3] tracking-[0.45em] drop-shadow">無 名 道 場</p>
          <p className="text-xs text-[#d6c3a5] pt-1">이름 없는 칼 한 자루로 써 내려가는 일생</p>
        </div>

        <div className="rpg-window p-4 space-y-2.5 bg-[#221710]/92">
          {canContinue && savedState && (
            <button
              onClick={() => { sound.playDrum(); onContinue(); }}
              className="w-full seal-badge py-2.5 px-4 font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            >
              <span className="text-sm sm:text-base flex items-center gap-2">
                <Play className="w-4 h-4" /> 이어서 일생 계속하기
              </span>
              <span className="text-[11px] font-normal text-[#fde68a]/95">
                【{savedState.sectName}】 {savedState.name} · <b>{savedState.age}세</b> ({savedState.year}년 {SEASON_META[savedState.season].label})
              </span>
            </button>
          )}

          <button
            onClick={() => { sound.playDrum(); onNewGame(); }}
            className="w-full rpg-btn py-3 px-4 font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-[#fde68a]" /> 새로운 일생 시작
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { sound.playClick(); setShowLegacy(true); }}
              className="rpg-btn py-2.5 px-2 text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#e5b75a] shrink-0" /> 유파 도감 ({legacies.length})
            </button>
            <button
              onClick={() => { sound.playClick(); setShowAchievements(true); }}
              className="rpg-btn py-2.5 px-2 text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" /> 도전과제 ({achDone}/{ACHIEVEMENTS.length})
            </button>
          </div>
        </div>
      </div>

      {showAchievements && <AchievementsModal onClose={() => setShowAchievements(false)} />}

      {showLegacy && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="rpg-window max-w-2xl w-full max-h-[82vh] p-5 flex flex-col animate-ink">
            <div className="flex items-center justify-between border-b-2 border-[#8c6239] pb-3">
              <h2 className="text-lg font-bold text-[#fde68a] flex items-center gap-2">
                <ScrollText className="w-5 h-5" /> 역대 유파 도감 (다회차 레거시)
              </h2>
              <button onClick={() => setShowLegacy(false)} className="p-1 hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto mt-4 space-y-3 flex-1 pr-1">
              {legacies.length === 0 ? (
                <div className="text-center py-12 text-xs sm:text-sm text-[#c7b394]">
                  아직 기록된 유파의 역사가 없습니다.<br />
                  한 일생을 완주하면 창시자의 비급이 다음 회차 만물객에게 등장합니다.
                </div>
              ) : (
                legacies.map((rec) => (
                  <div key={rec.id} className="border-2 border-[#6b4728] p-3 bg-[#1b120c] space-y-1 text-left">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[#fde68a]">
                        【{rec.sectName}】 — {rec.founderName} ({COUNTRIES[rec.country].name})
                      </span>
                      <span className="seal-badge text-[11px] px-1.5 py-0.5">{rec.finalTitle}</span>
                    </div>
                    <div className="text-xs text-[#c7b394]">
                      [{DIFFICULTY_CONFIGS[rec.difficulty || 'EASY'].shortLabel}] {rec.deathYear}년 향년 {rec.deathAge}세 ({rec.deathCause}) · 명성 {rec.fame}
                    </div>
                    <div className="text-xs text-sky-300 font-bold">{rec.endingTitle}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
