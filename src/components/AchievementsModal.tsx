import React, { useState } from 'react';
import {
  ACHIEVEMENT_CATEGORY_LABEL,
  AchievementCategory,
  ACHIEVEMENTS,
} from '../data/achievements';
import { loadUnlockedAchievements } from '../engine/storage';
import { Award, Lock, Trophy, X } from 'lucide-react';
import { sound } from '../engine/sound';

export const AchievementsPanel: React.FC = () => {
  const [filter, setFilter] = useState<'ALL' | AchievementCategory>('ALL');
  const unlockedList = loadUnlockedAchievements();
  const unlockedMap = new Map(unlockedList.map((u) => [u.id, u]));

  const total = ACHIEVEMENTS.length;
  const doneCount = ACHIEVEMENTS.filter((a) => unlockedMap.has(a.id)).length;
  const pct = Math.round((doneCount / Math.max(1, total)) * 100);

  const visible = filter === 'ALL' ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.category === filter);

  return (
    <div className="space-y-3">
      {/* 달성률 헤더 */}
      <div className="bg-[#1b120c] border border-[#8c6239] p-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[#fde68a] flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-400" /> 무림 도전과제 달성률
          </span>
          <span className="font-bold text-amber-300">
            {doneCount} / {total} ({pct}%)
          </span>
        </div>
        <div className="h-2 bg-[#120c08] border border-[#6b4728]">
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-1">
        {(['ALL', 'DOJO', 'MARTIAL', 'BATTLE', 'LIFE', 'SECRET'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => { sound.playClick(); setFilter(cat); }}
            className={`px-2 py-1 text-[11px] font-bold border cursor-pointer ${
              filter === cat
                ? 'bg-[#4a2b1a] border-[#fde047] text-[#fde68a]'
                : 'bg-[#1b120c] border-[#5c432c] text-[#c7b394]'
            }`}
          >
            {cat === 'ALL' ? '전체' : ACHIEVEMENT_CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      {/* 과제 목록 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visible.map((def) => {
          const rec = unlockedMap.get(def.id);
          const unlocked = Boolean(rec);
          const hideDesc = def.secret && !unlocked;
          return (
            <div
              key={def.id}
              className={`p-2.5 border-2 flex items-start gap-2.5 ${
                unlocked
                  ? 'bg-[#2c1f13] border-[#f2c96b]'
                  : 'bg-[#16100b] border-[#4a3423] opacity-75'
              }`}
            >
              <div
                className={`p-1.5 border shrink-0 mt-0.5 ${
                  unlocked
                    ? 'bg-amber-900/60 border-amber-400 text-amber-300'
                    : 'bg-[#120c08] border-[#4a3423] text-[#786552]'
                }`}
              >
                {unlocked ? <Award className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-1">
                  <span className={`font-bold text-xs truncate ${unlocked ? 'text-[#fde68a]' : 'text-[#b5a38c]'}`}>
                    {hideDesc ? '??? (숨겨진 기연)' : def.title}
                  </span>
                  <span className="text-[9px] px-1 py-0.5 bg-[#120c08] border border-[#5c432c] text-[#c7b394] shrink-0">
                    {ACHIEVEMENT_CATEGORY_LABEL[def.category]}
                  </span>
                </div>
                <p className="text-[11px] text-[#d6cbb8] leading-snug">
                  {hideDesc ? '특정 조건을 달성하면 정체가 드러납니다.' : def.description}
                </p>
                {rec && (
                  <div className="text-[10px] text-emerald-300 pt-0.5 truncate">
                    ✓ 달성 · 【{rec.sectName}】 {rec.heroName}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const AchievementsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2.5 sm:p-4">
    <div className="rpg-window max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-ink">
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#8c6239] bg-[#1b120c]">
        <h2 className="text-base sm:text-lg font-bold text-[#fde68a] flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" /> 무림 도전과제
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-white/10 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-3.5 sm:p-4 overflow-y-auto flex-1">
        <AchievementsPanel />
      </div>
    </div>
  </div>
);
