import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, HelpCircle, X } from 'lucide-react';
import { ReputationAxes } from '../types/game';
import { computeSectTitle } from '../data/worldAndEndings';
import { sound } from '../engine/sound';

// 1. 한자어 · 무협 용어 · 이명 인게임 사전 (툴팁용)
export const HANJA_GLOSSARY: Record<string, { title: string; body: string; sub?: string }> = {
  HEALTH: {
    title: '건강 (健康)',
    body: '육체의 활력과 남은 기력입니다. 노화나 부상, 금기 반동으로 0이 되면 일생을 마치게 됩니다.',
    sub: '[휴식·치료]와 약방 증축으로 회복하고 노화를 늦출 수 있습니다.',
  },
  MONEY: {
    title: '재화 · 빚 (財貨)',
    body: '도장 운영, 시설 증축, 병기 강화, 비급 구매에 쓰입니다. 붉은 괄호 숫자는 아직 갚지 못한 빚입니다.',
    sub: '빚은 해가 바뀌면 이자가 불어나므로 [도장] 메뉴에서 틈틈이 상환하세요.',
  },
  FAME: {
    title: '명성 (名聲)',
    body: '세간에 알려진 도장의 이름값입니다. 명성이 높을수록 월사금이 오르고, 절정 고수의 방문과 천하제일 무술대회 초청이 찾아옵니다.',
  },
  STR: {
    title: '근력 (筋力 · ⚔)',
    body: '물리 초식의 타격 위력을 높이고, 상대의 방어 자세(체세)를 강하게 무너뜨리는 힘입니다.',
  },
  AGI: {
    title: '민첩 (敏捷 · ⚡)',
    body: '초식 발동과 보법 이동을 빠르게 하고, 적의 방어 불가 강공격을 피할 회피율을 높입니다.',
  },
  VIT: {
    title: '체력 (體力 · ♥)',
    body: '비무 최대 생명력과 방어 지구력(체세)을 높이며, 진검결투에서 치명상을 버틸 생존력을 키웁니다.',
  },
  WIL: {
    title: '정신 (精神 · ✦)',
    body: '기력(QI) 최대치와 회복 속도를 높이고, 내공·속성 초식의 위력을 보강합니다.',
  },
  INS: {
    title: '통찰 (洞察 · 👁)',
    body: '적의 칼길을 꿰뚫는 간파(看破)·반격 확률을 크게 높이고, 비무 장착 초식 칸을 넓혀 줍니다.',
  },
  QI: {
    title: '영력 (靈力 · 💧)',
    body: '기공·속성·비술 초식의 핵심 위력이며, 운기 심법 장착 칸과 비급 서적 연구 조건에 쓰입니다.',
  },
  PARRY: {
    title: '간파 (看破)',
    body: '상대의 초식이 닿는 찰나에 칼길을 미리 읽어 흘려내고, 치명적인 반격 일섬을 꽂아 넣는 무도의 극의입니다.',
    sub: '통찰(INS)이 높거나 방어·반격 초식을 장착할수록 발동 확률이 크게 오릅니다.',
  },
  POSTURE: {
    title: '체세 (體勢)',
    body: '비무 중 자세와 방어의 균형입니다. 체세가 0이 되면 자세가 무너져 잠시 무방비 상태가 되며 큰 피해를 입습니다.',
  },
  PASSIVE: {
    title: '운기 심법 (運氣 心法)',
    body: '내공을 몸 안에 돌려 비무 중 상시 발동하는 수련 비법입니다. 영력(QI)이 높아질수록 더 많은 심법을 함께 운용할 수 있습니다.',
  },
  DUEL_REAL: {
    title: '진검결투 (眞劍決鬪)',
    body: '목검이 아닌 진짜 칼날로 생사를 가르는 대결입니다. 한 칼 한 칼이 무겁고 깨끗이 들어간 일격은 치명상이 되며, 항복은 없습니다. 패배 시 목숨을 잃거나 외팔·실명 같은 영구 장애를 입고, 이겨도 깊은 상처가 남을 수 있습니다.',
    sub: '승리 시 막대한 명성과 명검, 그리고 세간에 떨칠 무명을 얻습니다.',
  },
  DUEL_SPAR: {
    title: '비무 · 대련 (比武)',
    body: '목검과 약속된 규칙 아래 기량을 겨루는 승부입니다. 타격이 가벼워 쓰러지기 전에 먼저 무릎 꿇는 쪽이 지며(항복), 후유증은 멍과 타박상 정도입니다. 실전 초식 숙련도를 쌓을 수 있습니다.',
  },
  HEIRLOOM: {
    title: '유파 가보 (家寶)',
    body: '직접 이름을 새겨 대대로 물려주는 도장의 대표 병기입니다. 실전 승리가 쌓일수록 훗날 사후 200년 연대기에 전설의 명검으로 기록됩니다.',
  },
  VIRTUE: {
    title: '인덕 (仁德)',
    body: '어질고 의로운 행실로 얻는 세평입니다. 인덕이 높으면 가보 비급이나 명검을 품은 인재들이 도장을 찾아오며 「활인검의 성지」로 불립니다.',
  },
  RUTHLESS: {
    title: '살기 (殺氣)',
    body: '무자비한 진검 승부와 냉혹한 선택으로 쌓이는 위압감입니다. 높아지면 천하가 두려워하는 「수라검파」로 이름을 떨칩니다.',
  },
  COMMERCE: {
    title: '상무 (商武)',
    body: '호위와 상단 경영, 실리적 운영으로 쌓이는 세평입니다. 높아지면 「황금표국」과 「거대 상무 재단」의 길로 나아갑니다.',
  },
  ASCETIC: {
    title: '구도 (求道)',
    body: '재물과 세속을 멀리하고 오직 수련과 무도의 이치만 파고드는 자세입니다. 높아지면 「검선의 비경」으로 추앙받습니다.',
  },
  ARCANE: {
    title: '이단 (異端)',
    body: '서양 비전이나 세상의 이치를 벗어난 이계 금서를 연구할 때 쌓이는 세평입니다. 관군의 토벌을 부르기도 하지만 역사를 뒤바꿀 힘을 얻습니다.',
  },
};

const TITLE_HANJA_NOTES: Record<string, string> = {
  '이름 없는 소도장': '아직 세상에 알려지지 않은 무명(無名)의 작은 도장.',
  '구세신선문(救世神仙門)': '구세(세상을 구함) + 신선문(신선의 문파). 이적과 인덕이 극에 달한 전설적 이명.',
  '재앙의 마도(魔道)': '마도(마귀의 길). 금단의 힘과 살기가 천하를 공포에 떨게 하는 이명.',
  '성현무림(聖賢武林)': '성현(지혜롭고 어진 성인) + 무림. 덕과 무가 완벽히 어우러진 최고 경지의 문파.',
  '혈금용병단(血金傭兵團)': '혈금(피와 황금). 돈과 무력이라면 무엇이든 해내는 냉혹한 무력 집단.',
  '진리의 마도탑': '세속을 버리고 초자연적 이치를 끝까지 파고든 구도자들의 성지.',
  '태평천하 표국': '태평천하(온 세상이 평안함) + 표국(호위 상단). 백성과 상단을 지키는 거대 의협 조직.',
  '활인검의 성지': '활인검(活人劍 · 사람을 살리는 검). 약자를 지키는 참된 무도의 상징.',
  '협객문(俠客門)': '협객(의리를 지키는 무인)들이 모이는 정의로운 문파.',
  '수라검파(修羅劍派)': '수라(싸움의 귀신). 피비린내 나는 진검 승부로 악명 높은 문파.',
  '황금표국(黃金鏢局)': '표국(상단 호위 조직). 천하의 물류와 호위를 장악한 부유한 문파.',
  '검선의 비경(劍仙秘境)': '검선(검의 신선) + 비경(신비로운 수행처). 오직 검의 극한만 추구하는 성지.',
  '무광(武狂)의 굴': '무광(무술에 미친 자). 오직 수련에만 몰두하는 지독한 도장.',
  '신선문(神仙門)': '신선(초월적 존재)의 비술을 전수한다는 경외의 이명.',
};

export function getSectTitleTooltip(currentTitle: string, rep: ReputationAxes, fame: number) {
  const evaluated = computeSectTitle(rep, fame);
  const hanjaExplain = TITLE_HANJA_NOTES[currentTitle] || '도장의 행적과 5대 세평(인덕·살기·상무·구도·이단)에 따라 세간이 붙인 이명입니다.';
  return {
    title: `문파 이명 · 「${currentTitle}」`,
    body: hanjaExplain,
    sub: evaluated.rumor,
  };
}

// 2. 인게임 목판 툴팁 (데스크탑 호버 + 모바일 탭 지원, 화면 경계 자동 클램핑!)
interface TooltipProps {
  title: string;
  body: string;
  sub?: string;
  hoverOnly?: boolean; // 버튼 등 클릭 액션이 따로 있는 요소에는 hoverOnly=true
  children: React.ReactNode;
  className?: string;
}

export const InGameTooltip: React.FC<TooltipProps> = ({
  title,
  body,
  sub,
  hoverOnly = false,
  children,
  className = '',
}) => {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; placeAbove: boolean }>({
    left: 16,
    top: 60,
    placeAbove: false,
  });

  // 실제 정밀 마우스(PC) 환경인지 판별 — 모바일/터치 기기에서는 가상 mouseenter가 click과 충돌해 툴팁이 바로 닫히는 현상을 원천 차단!
  const isMouseHoverDevice = () =>
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tipW = Math.min(280, window.innerWidth - 20);
    const left = Math.max(10, Math.min(window.innerWidth - tipW - 10, rect.left + rect.width / 2 - tipW / 2));
    const placeAbove = rect.bottom + 150 > window.innerHeight && rect.top > 150;
    const top = placeAbove ? rect.top - 8 : rect.bottom + 8;
    setCoords({ left, top, placeAbove });
  };

  useEffect(() => {
    if (!open) return;
    updatePos();
    const closeOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      if (tipRef.current && tipRef.current.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center ${hoverOnly ? '' : 'cursor-pointer'} ${className}`}
        onMouseEnter={() => {
          if (!isMouseHoverDevice()) return;
          updatePos();
          setOpen(true);
        }}
        onMouseLeave={() => {
          if (!isMouseHoverDevice()) return;
          setOpen(false);
        }}
        onClick={(e) => {
          if (hoverOnly) return;
          e.stopPropagation();
          sound.playClick();
          updatePos();
          setOpen((v) => !v);
        }}
      >
        {children}
      </span>

      {open &&
        createPortal(
          <div
            ref={tipRef}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            style={{
              left: coords.left,
              top: coords.top,
              width: Math.min(280, window.innerWidth - 20),
              transform: coords.placeAbove ? 'translateY(-100%)' : undefined,
            }}
            className="fixed z-[120] rpg-window p-2.5 bg-[#19110b]/98 border-[#f2c96b] shadow-2xl space-y-1 animate-ink text-left cursor-pointer"
          >
            <div className="text-xs font-bold text-[#fde68a] flex items-center justify-between gap-1">
              <span className="flex items-center gap-1 min-w-0">
                <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{title}</span>
              </span>
              {!hoverOnly && <X className="w-3 h-3 text-[#c7b394] shrink-0 sm:hidden" />}
            </div>
            <p className="text-[11px] leading-relaxed text-[#f5e9ce]">{body}</p>
            {sub && (
              <p className="text-[10px] leading-snug text-amber-200/90 pt-1 border-t border-[#4a3423]">
                {sub}
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

// 3. 브라우저 기본 <select>를 100% 대체하는 인게임 목판 커스텀 드롭다운!
export interface InGameSelectOption {
  value: string;
  label: string;
  sub?: string;
}

interface SelectProps {
  value: string;
  options: InGameSelectOption[];
  onChange: (val: string) => void;
  title?: string;
  placeholder?: string;
  accent?: 'GOLD' | 'VIOLET';
  className?: string;
}

export const InGameSelect: React.FC<SelectProps> = ({
  value,
  options,
  onChange,
  title = '선택',
  placeholder = '선택하세요',
  accent = 'GOLD',
  className = '',
}) => {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 640 : false));
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number; openUp: boolean }>({
    left: 0,
    top: 0,
    width: 200,
    openUp: true,
  });

  const selected = options.find((o) => o.value === value) || options[0];

  const openMenu = () => {
    sound.playClick();
    const mobileNow = window.innerWidth < 640;
    setIsMobile(mobileNow);
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const w = Math.max(r.width, 190);
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
      const openUp = r.bottom + 210 > window.innerHeight && r.top > 180;
      setMenuPos({ left, top: openUp ? r.top - 4 : r.bottom + 4, width: w, openUp });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const borderCls = accent === 'VIOLET' ? 'border-violet-500/80 text-violet-200' : 'border-[#8c6239] text-[#fde68a]';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        className={`w-full bg-[#120c08] hover:bg-[#1e140d] border ${borderCls} px-2 py-1 text-[10px] sm:text-[11px] flex items-center justify-between gap-1 cursor-pointer min-w-0 transition ${className}`}
      >
        <span className="truncate font-bold">{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[95] bg-black/45 sm:bg-transparent"
            onClick={() => setOpen(false)}
          >
            {isMobile ? (
              // 모바일: 화면 하단/중앙에 엄지로 누르기 좋은 깔끔한 목판 선택 시트!
              <div
                onClick={(e) => e.stopPropagation()}
                className="fixed inset-x-3 bottom-4 max-h-[60vh] rpg-window bg-[#1b120c] border-[#f2c96b] flex flex-col overflow-hidden animate-ink shadow-2xl"
              >
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#8c6239] bg-[#140d09]">
                  <span className="text-xs font-bold text-[#fde68a]">{title}</span>
                  <button onClick={() => setOpen(false)} className="cursor-pointer p-0.5"><X className="w-4 h-4" /></button>
                </div>
                <div className="overflow-y-auto p-2 space-y-1">
                  {options.map((opt) => {
                    const active = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          onChange(opt.value);
                          setOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 border flex items-center justify-between gap-2 cursor-pointer ${
                          active
                            ? 'bg-[#3d291a] border-[#fde047] text-[#fde68a]'
                            : 'bg-[#140d09] border-[#5c432c] text-[#e6d8be]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{opt.label}</div>
                          {opt.sub && <div className="text-[10px] text-[#c7b394] truncate">{opt.sub}</div>}
                        </div>
                        {active && <Check className="w-4 h-4 text-[#fde047] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              // 데스크탑: 트리거 위/아래로 자동 전개되는 인게임 목판 드롭다운!
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  left: menuPos.left,
                  top: menuPos.top,
                  width: menuPos.width,
                  transform: menuPos.openUp ? 'translateY(-100%)' : undefined,
                }}
                className="fixed max-h-56 overflow-y-auto rpg-window bg-[#1b120c] border-[#f2c96b] p-1 space-y-0.5 shadow-2xl animate-ink"
              >
                {options.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 cursor-pointer ${
                        active
                          ? 'bg-[#3d291a] text-[#fde68a] font-bold border border-[#fde047]/60'
                          : 'text-[#e6d8be] hover:bg-[#2a1c12]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate">{opt.label}</div>
                        {opt.sub && <div className="text-[10px] text-[#c7b394] truncate">{opt.sub}</div>}
                      </div>
                      {active && <Check className="w-3.5 h-3.5 text-[#fde047] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
