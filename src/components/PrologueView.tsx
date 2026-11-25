import React, { useEffect, useState } from 'react';
import { GameState } from '../types/game';
import { COUNTRIES } from '../data/worldAndEndings';
import { PixelPortrait } from './PixelPortrait';
import { sound } from '../engine/sound';
import { ChevronRight } from 'lucide-react';

interface Props {
  state: GameState;
  onStartDojo: () => void;
}

interface CutsceneLine {
  bg: string;
  sceneLabel: string;
  speaker: string;
  stageDirection?: string;
  role: 'HERO' | 'RIVAL' | 'NARRATOR';
  text: string;
}

export const PrologueView: React.FC<Props> = ({ state, onStartDojo }) => {
  const cMeta = COUNTRIES[state.country];
  const isChina = state.country === 'CHINA';
  const parentName = isChina ? '어머니 (선대 도장주)' : '아버지 (선대 도장주)';

  const cc = state.country === 'CHINA' ? 'cn' : state.country === 'JAPAN' ? 'jp' : 'kr';
  const ruinBg = `/assets/px_prologue_yard_${cc}.jpg`;
  // 한 마디씩 숨 쉬듯 짧게 쪼갠 7장면 영화식 프롤로그!
  const lines: CutsceneLine[] = [
    {
      bg: '/assets/px_title_bg.jpg',
      sceneLabel: `1750년 초봄 · ${cMeta.name}`,
      speaker: '나레이션',
      role: 'NARRATOR',
      text: '겨울을 넘기지 못할 거라던 의원의 말은 끝내 틀리지 않았다.',
    },
    {
      bg: '/assets/px_end_death.jpg',
      sceneLabel: '선대 도장주의 마지막 새벽',
      speaker: parentName,
      stageDirection: '거친 기침을 삼키며 낡은 목검을 내민다',
      role: 'RIVAL',
      text: isChina
        ? '……얘야. 미안하다. 어미가 남겨 줄 게 이 벗겨진 현판이랑 녹슨 칼 한 자루뿐이구나.'
        : '……얘야. 미안하다. 아비가 남겨 줄 게 이 비 새는 마당이랑 녹슨 칼 한 자루뿐이구나.',
    },
    {
      bg: '/assets/px_end_death.jpg',
      sceneLabel: '유언',
      speaker: parentName,
      stageDirection: '떨리는 손으로 네 손등을 꼭 감싸며',
      role: 'RIVAL',
      text: '그래도 베는 법 두 개는 잊지 마라. 가로로 한 번, 세로로 한 번…….',
    },
    {
      bg: '/assets/px_end_death.jpg',
      sceneLabel: '유언',
      speaker: parentName,
      role: 'RIVAL',
      text: '남들은 비웃어도, 그 두 번을 평생 똑바로 긋는 놈은 세상에 드물단다.',
    },
    {
      bg: ruinBg,
      sceneLabel: '장례를 치른 다음 날',
      speaker: '나레이션',
      role: 'NARRATOR',
      text: `남은 것은 밀린 빚 스무 ${cMeta.currency}, 비가 새는 연무장, 그리고 땀때가 검게 배인 목검 두 자루뿐이었다.`,
    },
    {
      bg: ruinBg,
      sceneLabel: '빗물 새는 도장 마당',
      speaker: state.name,
      stageDirection: '젖은 흙마당 한가운데 서서 목검으로 허공을 가로로 한 번 긋는다',
      role: 'HERO',
      text: '……횡베기 하나, 종베기 하나.',
    },
    {
      bg: ruinBg,
      sceneLabel: '새로운 시작',
      speaker: state.name,
      stageDirection: '글씨조차 바랜 빈 현판을 올려다보며',
      role: 'HERO',
      text: '여기서 끝낼 수는 없지. 이름이 없다면…… 내가 내 일생으로 만들어 내면 그만이다.',
    },
  ];

  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const cur = lines[step];

  useEffect(() => {
    setTyped(0);
  }, [step]);

  useEffect(() => {
    if (typed >= cur.text.length) return;
    const prev = cur.text[typed - 1] || '';
    const isPause = prev === '…' || prev === '.' || prev === '?' || prev === '!';
    const timer = setTimeout(() => {
      if (typed % 3 === 0 && !isPause) sound.playBlip();
      setTyped((v) => v + 1);
    }, isPause ? 180 : 28);
    return () => clearTimeout(timer);
  }, [typed, cur.text]);

  const advance = () => {
    if (typed < cur.text.length) {
      setTyped(cur.text.length);
      return;
    }
    sound.playClick();
    if (step < lines.length - 1) setStep(step + 1);
    else { sound.playDrum(); onStartDojo(); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div onClick={advance} className="fixed inset-0 bg-[#0d0906] flex flex-col justify-between overflow-hidden cursor-pointer select-none">
      <img
        key={cur.bg}
        src={cur.bg}
        alt="프롤로그"
        className="pixel-canvas absolute inset-0 w-full h-full object-cover opacity-82 animate-ink"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/25 to-black/60" />

      <div className="relative z-10 p-3 sm:p-4 flex items-center justify-between gap-2">
        <span className="rpg-window px-2.5 py-1 text-xs text-[#fde68a] tracking-wider bg-black/80 min-w-0 truncate">
          서막 ({step + 1}/{lines.length}) · {cur.sceneLabel}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); sound.playDrum(); onStartDojo(); }}
          className="rpg-btn px-3 py-1 text-xs cursor-pointer whitespace-nowrap shrink-0"
        >
          건너뛰기 ▶
        </button>
      </div>

      <div className="relative z-10 max-w-3xl w-full mx-auto p-3 sm:p-6">
        <div className="rpg-window p-4 sm:p-5 flex items-start gap-4 min-h-[136px] bg-[#1e140e]/95">
          {cur.role !== 'NARRATOR' && (
            <PixelPortrait
              role={cur.role === 'HERO' ? 'HERO' : isChina ? 'HERO' : 'ELDER'}
              country={state.country}
              age={cur.role === 'HERO' ? state.age : 62}
              gender={cur.role === 'HERO' ? state.gender : isChina ? 'FEMALE' : 'MALE'}
              variantHint={cur.speaker}
              size={74}
            />
          )}
          <div className="flex-1 flex flex-col justify-between min-h-[92px]">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-[#fde68a]">{cur.speaker}</span>
                {cur.stageDirection && <span className="text-[11px] italic text-[#c9a977]">({cur.stageDirection})</span>}
              </div>
              <p className="text-sm sm:text-base leading-7 text-[#f5e9ce]">
                {cur.text.slice(0, typed)}
                {typed < cur.text.length && <span className="inline-block w-2 h-4 bg-[#fde68a] ml-1 animate-pulse" />}
              </p>
            </div>
            <div className="flex justify-end items-center text-xs text-[#e5b75a] pt-2">
              {typed >= cur.text.length && (
                <span className="flex items-center gap-1 animate-bob">
                  {step === lines.length - 1 ? '도장 마당에 서다' : '다음 (클릭 / Space)'}
                  <ChevronRight className="w-4 h-4" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
