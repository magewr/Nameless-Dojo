import React, { useEffect, useRef, useState } from 'react';
import {
  GameState,
  ScheduleActivityId,
  SeasonTickResult,
} from '../types/game';
import { COUNTRIES, SEASON_META } from '../data/worldAndEndings';
import { getDifficultyConfig } from '../data/difficulty';
import { getWorldLoreArticles, STAT_GUIDE } from '../data/worldLore';
import {
  getChromaSprite,
  getDojoMapSrc,
  getGridSpriteSheet,
  getHeroWalkSpriteInfo,
  getSpriteSheet,
  loadRawImage,
  preloadAllGameArt,
  ProcessedSprite,
} from '../pixel/spriteLoader';
import { detectNpcGender, PixelPortrait } from './PixelPortrait';
import { isSoloEvent } from '../data/storyScripts';
import { AchievementsPanel } from './AchievementsModal';
import { getSectTitleTooltip, HANJA_GLOSSARY, InGameSelect, InGameTooltip } from './InGameUI';
import { getMasteryPct, isAtMasteryWall, MASTERY_NAMES } from '../data/booksAndSkills';
import { getBookDecodeTarget, getSeclusionPreview } from '../engine/gameLogic';
import { regionsForCountry } from '../data/journeyRegions';
import { defaultRegionFor } from '../engine/journey';
import { sound } from '../engine/sound';
import {
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  Coins,
  DoorClosed,
  Dumbbell,
  FastForward,
  Hammer,
  Heart,
  Home,
  Minus,
  Mountain,
  Play,
  Plus,
  ScrollText,
  Sparkles,
  Star,
  Swords,
  Users,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';

interface Props {
  state: GameState;
  isRunningSeason: boolean;
  hasOverlayModal?: boolean;
  seasonPhaseIdx: number;
  timelineProgress: number;
  activeStepIdx: number;
  simSpeed: 1 | 2;
  activeTick: SeasonTickResult | null;
  seasonFeed: Array<{ text: string; tone: 'NORMAL' | 'GOOD' | 'WARN' | 'MAGIC' }>;
  onChangeSimSpeed: (spd: 1 | 2) => void;
  onSkipSeasonAnim: () => void;
  onSceneReady: () => void;
  onUpdatePlan: (patch: Partial<GameState['seasonPlan']>) => void;
  onStartSeason: () => void;
  onCompleteTutorial: () => void;
  onOpenTrain: (tab?: 'TRAIN' | 'CRAFT' | 'BOOKS') => void;
  onOpenDojo: () => void;
  onOpenDisciples: () => void;
  onOpenMerchant: () => void;
  onDismissSummary: () => void;
  onReturnTitle: () => void;
}

const WORLD_W = 1024;
const WORLD_H = 576;

const LOC_COORDS: Record<SeasonTickResult['location'], { x: number; y: number }> = {
  HALL: { x: 512, y: 215 },
  LIBRARY: { x: 205, y: 230 },
  DUMMY: { x: 245, y: 335 },
  YARD: { x: 512, y: 315 },
  FORGE: { x: 800, y: 235 },
  CLINIC: { x: 800, y: 385 },
  GATE: { x: 512, y: 475 },
};

const ACTIVITY_META: Record<
  ScheduleActivityId,
  {
    label: string;
    short: string;
    desc: string;
    icon: React.FC<{ className?: string }>;
    color: string;
    barBg: string;
    barBorder: string;
  }
> = {
  TRAIN: { label: '무술 연마', short: '연마', desc: '목인장 앞에서 초식을 갈고닦는 중…', icon: Swords, color: 'text-amber-300', barBg: 'bg-[#7c2d12]', barBorder: 'border-amber-400' },
  BODY: { label: '신체 단련', short: '신체', desc: '마당에서 근력과 보법을 다지는 중…', icon: Dumbbell, color: 'text-emerald-300', barBg: 'bg-[#14532d]', barBorder: 'border-emerald-400' },
  MIND: { label: '기공 명상', short: '기공', desc: '본관 대청에서 호흡을 가다듬는 중…', icon: Sparkles, color: 'text-sky-300', barBg: 'bg-[#1e3a5f]', barBorder: 'border-sky-400' },
  DECODE: { label: '서적 연구', short: '독서', desc: '장서각에서 비급의 구결을 연구하는 중…', icon: BookOpen, color: 'text-violet-300', barBg: 'bg-[#3b0764]', barBorder: 'border-violet-400' },
  CRAFT: { label: '무술 조합', short: '조합', desc: '두 초식의 원리를 하나로 엮어내는 중…', icon: Wand2, color: 'text-fuchsia-300', barBg: 'bg-[#581c87]', barBorder: 'border-fuchsia-400' },
  BUILD: { label: '도장 증축', short: '증축', desc: '문하생들과 함께 도장 시설을 보수·증축하는 중…', icon: Hammer, color: 'text-orange-300', barBg: 'bg-[#7c2d12]', barBorder: 'border-orange-400' },
  TEACH: { label: '제자 지도', short: '지도', desc: '문하생들의 자세와 검로를 교정하는 중…', icon: Users, color: 'text-cyan-300', barBg: 'bg-[#164e63]', barBorder: 'border-cyan-400' },
  ESCORT: { label: '호위·생계', short: '호위', desc: '저잣거리 상단 호위와 의뢰를 수행하는 중…', icon: Coins, color: 'text-yellow-300', barBg: 'bg-[#713f12]', barBorder: 'border-yellow-400' },
  REST: { label: '휴식·치료', short: '휴식', desc: '의원실에서 탕약을 달여 마시며 회복 중…', icon: Heart, color: 'text-rose-300', barBg: 'bg-[#7f1d1d]', barBorder: 'border-rose-400' },
  SPAR: { label: '타류 대련', short: '대련', desc: '정문 밖으로 나가 타 도장 사범과 비무!', icon: Swords, color: 'text-red-300', barBg: 'bg-[#450a0a]', barBorder: 'border-red-400' },
  SECLUSION: {
    label: '폐관수련',
    short: '폐관',
    desc: '계절 전체를 관문 안에서 보낸다. Lv.9 벽을 넘어 극의(Lv.10)에 이르는 유일한 길. 다른 작업과 함께 할 수 없다.',
    icon: DoorClosed,
    color: 'text-purple-300',
    barBg: 'bg-[#2e1065]',
    barBorder: 'border-purple-400',
  },
  JOURNEY: {
    label: '무사수행',
    short: '수행',
    desc: '계절 전체를 도장 밖 길 위에서 보낸다. 직접 걸으며 그 시대의 사건, 은거 고수, 숨은 비급을 만난다. 다른 작업과 함께 할 수 없다.',
    icon: Mountain,
    color: 'text-teal-300',
    barBg: 'bg-[#134e4a]',
    barBorder: 'border-teal-400',
  },
};

const EXCLUSIVE: ScheduleActivityId[] = ['SECLUSION', 'JOURNEY'];

const ACTIVITY_ORDER: ScheduleActivityId[] = ['TRAIN', 'BODY', 'MIND', 'DECODE', 'CRAFT', 'BUILD', 'TEACH', 'ESCORT', 'REST', 'SPAR', 'SECLUSION', 'JOURNEY'];

// 결과 보고·일지 텍스트의 핵심 키워드(초식·비급·수치·돌파·경고)를 자동 컬러 하이라이트!
function renderRichText(text: string): React.ReactNode {
  const tokenRe = /(\[초순\]|\[중순\]|\[하순\]|「[^」]+」|『[^』]+』|【[^】]+】|Lv\.\d+\s*돌파!?|\+\d+[%냥은량문]?|-\d+[%냥은량문]?|완공!?|창시|습득!?|독파\s*완료!?|승리!?|패배|난항|부족|부상|탈취)/g;
  const parts = text.split(tokenRe);
  return parts.map((part, i) => {
    if (!part) return null;
    if (/^\[(초순|중순|하순)\]$/.test(part)) {
      return <span key={i} className="text-[#c9974c] font-bold">{part}</span>;
    }
    if (/^(「|『|【)/.test(part)) {
      return <span key={i} className="text-[#fde68a] font-bold">{part}</span>;
    }
    if (/^(Lv\.\d+|완공|창시|습득|독파|승리|\+)/.test(part)) {
      return <span key={i} className="text-emerald-300 font-bold">{part}</span>;
    }
    if (/^(-|패배|난항|부족|부상|탈취)/.test(part)) {
      return <span key={i} className="text-rose-400 font-bold">{part}</span>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

interface DiscipleAgent {
  id: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: 1 | -1;
  walkTick: number;
  practiceStart: number;
  practiceUntil: number;
  nextThink: number;
}

// 사건 방문자의 보행 스프라이트: 화자의 성별·나이·신분에 맞춰 고른다.
// (예전엔 의원·할머니·손주까지 모두 붉은 옷의 검객 그림으로 대문을 걸어 들어왔다.)
type VisitorWalk = { src: string; isSheet: boolean; rows: 1 | 2; rowIndex: 0 | 1; inside?: boolean; discId?: string };
function resolveVisitorWalk(ev: NonNullable<GameState['activeEvent']>, state: GameState, isSpouse: boolean): VisitorWalk {
  const sheet = (info: { src: string; rows: 1 | 2; rowIndex: 0 | 1 }): VisitorWalk => ({ ...info, isSheet: true });
  const c = state.country;
  if (ev.sceneActor === 'MERCHANT') return { src: '/assets/sp_merchant_top.jpg', isSheet: false, rows: 1, rowIndex: 0 };
  if (isSpouse) {
    const g = state.spouse?.gender || (state.gender === 'FEMALE' ? 'MALE' : 'FEMALE');
    return { ...sheet(getHeroWalkSpriteInfo(c, g, state.spouse?.age ?? state.age)), inside: true };
  }
  const hint = (ev.speaker || '').trim();
  const disc = hint ? state.disciples.find((d) => hint.includes(d.name)) : undefined;
  if (ev.sceneActor === 'DISCIPLE' || disc || /제자|문하생|사범/.test(hint)) {
    // 함께 사는 사람은 대문이 아니라 안채 쪽에서 걸어 나온다 (하산했다 돌아온 제자는 대문으로).
    // 도장에 사는 제자라면 마당에서 수련하던 바로 그 제자가 걸어 나온다 (discId — 같은 사람이 둘로 보이지 않게)
    return { src: '/assets/sheet_walk_disciple.jpg', isSheet: true, rows: 1, rowIndex: 0, inside: !!disc && !disc.dead, discId: disc && !disc.dead ? disc.id : undefined };
  }
  // 싸우러 온 사람(도전자·숙적·왈패)은 기존 검객 그림을 그대로 쓴다.
  const hostile = ev.category === 'DUEL' || ev.category === 'DEBT' || ev.category === 'RIVAL' || ev.sceneActor === 'ENEMY' || ev.sceneActor === 'RIVAL';
  if (!hint || hostile) return { src: '/assets/sp_enemy_top.jpg', isSheet: false, rows: 1, rowIndex: 0 };
  const old = /(노파|할머니|할아버지|영감|노인|어르신|노고수|은둔|노승|스님|대사|촌장|노사|원로|노장|노부인|모친|어미|늙은|백발|노병|노선비)/.test(hint);
  // 여성(딸·손녀·소녀 포함)은 여성 그림으로 — 어린 남자 문하생 그림으로 나오지 않게 성별을 먼저 본다.
  if (detectNpcGender(hint) === 'FEMALE' || /(딸|손녀|소녀)/.test(hint)) return sheet(getHeroWalkSpriteInfo(c, 'FEMALE', old ? 60 : 26));
  if (/(아이|소년|꼬마|손주|손자|동자|아기|아들)/.test(hint)) {
    return { src: '/assets/sheet_walk_disciple.jpg', isSheet: true, rows: 1, rowIndex: 0 };
  }
  if (old) return sheet(getHeroWalkSpriteInfo(c, 'MALE', 60));
  if (/(의원|농부|상인|거상|선비|서생|문인|집주인|이장|관리|사또|지현|다이칸|아전|하인|머슴|짐꾼|나그네|통역|사신|역관|화공|주인|어부|목수|대장장이|술사|방사|음양사|도사|연금술사|양인)/.test(hint)) {
    return sheet(getHeroWalkSpriteInfo(c, 'MALE', 40));
  }
  return { src: '/assets/sp_enemy_top.jpg', isSheet: false, rows: 1, rowIndex: 0 };
}

export const DojoSimView: React.FC<Props> = ({
  state,
  isRunningSeason,
  hasOverlayModal,
  seasonPhaseIdx,
  timelineProgress,
  activeStepIdx,
  simSpeed,
  activeTick,
  onChangeSimSpeed,
  onSkipSeasonAnim,
  onSceneReady,
  onUpdatePlan,
  onStartSeason,
  onCompleteTutorial,
  onOpenTrain,
  onOpenDojo,
  onOpenDisciples,
  onOpenMerchant,
  onDismissSummary,
  onReturnTitle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [muted, setMuted] = useState(sound.muted);
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'STATS' | 'LORE' | 'ACH' | 'LOGS'>('STATS');

  // 모바일 세로 반응형 카메라 상태 (좌우 맵 잘림 방지 + 드래그 패닝 + 자동 추적!)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 640 : false));
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const viewW = isMobile ? 560 : WORLD_W;
  const viewH = WORLD_H;

  // 카메라 중심 X (모바일에서는 280 ~ 744 사이 자유 이동, 데스크탑은 512 고정)
  const camRef = useRef({ x: 512, targetX: 512, dragging: false, dragStartX: 0, camStartX: 512, moved: false });
  const isRunningRef = useRef(isRunningSeason);
  useEffect(() => { isRunningRef.current = isRunningSeason; }, [isRunningSeason]);

  // 첫 봄 스토리형 자연스러운 튜토리얼 (이웃 어르신의 안내 4스텝)
  const [tutIdx, setTutIdx] = useState(0);
  const showStoryTutorial =
    !state.flags.tutorialDone && state.turn === 1 && !isRunningSeason && !state.activeEvent && !hasOverlayModal && !state.lastSeasonSummary;

  const elderName = state.country === 'CHINA' ? '이웃 왕 노인' : state.country === 'JAPAN' ? '이웃 겐지 영감' : '이웃 김 영감';
  const tutorialSteps = [
    {
      highlight: 'BAR' as const,
      stage: '따뜻한 죽 한 그릇을 툇마루에 내려놓으며',
      text: `${state.name}, 밤새 잠은 좀 잤나? 이제 네가 이 도장의 주인이니, 아래 [계획 칸]에 이번 봄에 할 일을 채워 보게나.`,
    },
    {
      highlight: 'BAR' as const,
      stage: '계획 막대를 손가락으로 가리키며',
      text: '하나만 넣으면 온 계절을 쏟아 꽉 채우고, 여럿을 넣으면 나뉘어 진행되지. 칸 안의 [+ / −]로 어느 일에 힘을 더 실을지도 정할 수 있네.',
    },
    {
      highlight: 'TOP' as const,
      stage: '위쪽 도장 건물들과 병기 거치대를 둘러보며',
      text: '계절을 시작하기 전엔 위쪽 [무술 · 도장 · 제자]에서 초식을 조합하거나 무기를 손볼 수 있어. 지금은 빚도 있으니 연마와 호위를 함께 두는 게 좋겠지.',
    },
    {
      highlight: 'START' as const,
      stage: '따뜻하게 어깨를 두드려 주며',
      text: '준비가 끝났으면 붉은 [계절 시작]을 눌러 첫 봄을 열어 보게. 진행 도중 뜻밖의 손님이나 사건이 찾아올 수도 있으니 마음 단단히 먹고!',
    },
  ];
  const curTut = showStoryTutorial ? tutorialSteps[Math.min(tutIdx, tutorialSteps.length - 1)] : null;

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;

  const heroRef = useRef({
    x: 512,
    y: 315,
    tx: 512,
    ty: 315,
    facing: 1 as 1 | -1,
    walkTick: 0,
    floatingText: '',
    floatingColor: '#fde68a',
    floatingUntil: 0,
  });

  const visitorRef = useRef<{
    eventId: string | null;
    spriteSrc: string;
    isSheet: boolean;
    rows?: 1 | 2;
    rowIndex?: 0 | 1;
    name: string;
    x: number;
    y: number;
    tx: number;
    ty: number;
    arrived: boolean;
    discId?: string; // 마당의 제자가 직접 걸어 나온 경우 — 그동안 그 제자의 수련 모습은 그리지 않는다
  }>({
    eventId: null,
    spriteSrc: '/assets/sp_enemy_top.jpg',
    isSheet: false,
    name: '',
    x: 512,
    y: 515,
    tx: 595,
    ty: 315,
    arrived: true,
  });

  const agentsRef = useRef<DiscipleAgent[]>([]);
  const weatherRef = useRef(
    Array.from({ length: 34 }, () => ({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      vx: -0.5,
      vy: 1.2,
      size: 3,
    }))
  );

  useEffect(() => {
    preloadAllGameArt();
  }, []);

  useEffect(() => {
    if (!activeTick) return;
    const dest = LOC_COORDS[activeTick.location];
    heroRef.current.tx = dest.x;
    heroRef.current.ty = dest.y;
    heroRef.current.floatingText = activeTick.floatingText;
    heroRef.current.floatingColor = activeTick.floatingColor;
    heroRef.current.floatingUntil = performance.now() + 1600;
    // 문하생들도 계절 계획에 따라 주인공이 이동한 장소 주변으로 모여 함께 활동!
    agentsRef.current.forEach((ag, idx) => {
      const ang = (idx / Math.max(1, agentsRef.current.length)) * Math.PI * 2;
      const rad = 54 + (idx % 2) * 28;
      ag.tx = Math.max(120, Math.min(WORLD_W - 120, dest.x + Math.cos(ang) * rad));
      ag.ty = Math.max(210, Math.min(WORLD_H - 95, dest.y + Math.sin(ang) * (rad * 0.55)));
      ag.practiceUntil = 0;
    });
  }, [activeTick]);

  useEffect(() => {
    const ev = state.activeEvent;
    if (!ev) {
      // 걸어 나왔던 제자는 그 자리에서 다시 마당 사람으로 돌아간다
      const v = visitorRef.current;
      const back = v.discId ? agentsRef.current.find((a) => a.id === v.discId) : undefined;
      if (back) {
        back.x = v.x;
        back.y = v.y;
        back.tx = v.x;
        back.ty = v.y;
      }
      visitorRef.current.eventId = null;
      visitorRef.current.arrived = true;
      visitorRef.current.discId = undefined;
      return;
    }
    // 홀로 겪는 사건(깨달음·병·회상)은 대문으로 들어오는 방문자 없이 곧장 장면을 연다.
    if (isSoloEvent(ev)) {
      visitorRef.current.eventId = null;
      visitorRef.current.arrived = true;
      const t = window.setTimeout(() => onSceneReadyRef.current(), 450);
      return () => window.clearTimeout(t);
    }
    const sp = state.spouse;
    const isSpouse =
      ev.sceneActor === 'SPOUSE' ||
      (!ev.sceneActor && ev.category === 'FAMILY' && !!sp && sp.alive !== false && (!ev.speaker || ev.speaker.includes(sp.name)));
    const walk = resolveVisitorWalk(ev, state, isSpouse);
    const fromYard = walk.discId ? agentsRef.current.find((a) => a.id === walk.discId) : undefined;

    heroRef.current.tx = 460;
    heroRef.current.ty = 315;
    heroRef.current.facing = 1;
    camRef.current.targetX = 512;
    visitorRef.current = {
      eventId: ev.id,
      spriteSrc: walk.src,
      isSheet: walk.isSheet,
      rows: walk.rows,
      rowIndex: walk.rowIndex,
      name: ev.speaker || (isSpouse && state.spouse ? state.spouse.name : '방문자'),
      x: fromYard ? fromYard.x : walk.inside ? 600 : 512,
      y: fromYard ? fromYard.y : walk.inside ? 205 : 515,
      tx: 560,
      ty: 315,
      arrived: false,
      discId: fromYard ? fromYard.id : undefined,
    };
    sound.playDrum();
  }, [state.activeEvent?.id]);

  useEffect(() => {
    const alive = state.disciples.filter((d) => !d.dead).slice(0, 7);
    const prevMap = new Map(agentsRef.current.map((a) => [a.id, a]));
    agentsRef.current = alive.map((d, idx) => {
      const old = prevMap.get(d.id);
      if (old) return old;
      const bx = 300 + (idx % 4) * 110;
      const by = 260 + Math.floor(idx / 4) * 95;
      return {
        id: d.id,
        x: bx,
        y: by,
        tx: bx,
        ty: by,
        facing: 1,
        walkTick: 0,
        practiceStart: 0,
        practiceUntil: 0,
        nextThink: performance.now() + 800 + idx * 500,
      };
    });
  }, [state.disciples]);

  // 2D 도장 디오라마 루프 (국가별 32비트 맵 + 모바일 반응형 카메라 패닝/자동추적!)
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const drawUnit = (
      ctx: CanvasRenderingContext2D,
      frame: ProcessedSprite | null,
      refH: number,
      x: number,
      y: number,
      hPx: number,
      facing: 1 | -1,
      label?: string,
      labelCol = '#f5e9ce'
    ) => {
      ctx.fillStyle = 'rgba(10, 7, 4, 0.45)';
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y), hPx * 0.28, hPx * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      if (frame) {
        const ratio = hPx / Math.max(1, refH);
        const dw = Math.round(frame.width * ratio);
        const dh = Math.round(frame.height * ratio);
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.scale(facing, 1);
        ctx.drawImage(frame.canvas, -dw / 2, -dh + 4, dw, dh);
        ctx.restore();
      }
      if (label) {
        ctx.font = '11px NeoDunggeunmo, monospace';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(18, 12, 8, 0.82)';
        ctx.fillRect(Math.round(x - tw / 2 - 4), Math.round(y + 4), Math.round(tw + 8), 15);
        ctx.fillStyle = labelCol;
        ctx.fillText(label, Math.round(x), Math.round(y + 15));
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const st = stateRef.current;

      const vis = visitorRef.current;
      if (vis.eventId && !vis.arrived) {
        const dx = vis.tx - vis.x;
        const dy = vis.ty - vis.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 10) {
          vis.x = vis.tx;
          vis.y = vis.ty;
          vis.arrived = true;
          onSceneReadyRef.current();
        } else {
          vis.x += (dx / dist) * 260 * dt;
          vis.y += (dy / dist) * 260 * dt;
        }
      }

      const h = heroRef.current;
      const hdx = h.tx - h.x;
      const hdy = h.ty - h.y;
      const hDist = Math.hypot(hdx, hdy);
      if (hDist > 8) {
        h.x += (hdx / hDist) * 260 * dt;
        h.y += (hdy / hDist) * 260 * dt;
        if (Math.abs(hdx) > 1) h.facing = hdx > 0 ? 1 : -1;
        h.walkTick += dt * 9;
      } else {
        h.walkTick = 0;
      }

      // 모바일 카메라 자동 추적 (계절 진행 중이나 이벤트 중엔 주인공을 자연스럽게 따라감!)
      const minCam = viewW / 2;
      const maxCam = WORLD_W - viewW / 2;
      if (viewW < WORLD_W) {
        if (isRunningRef.current || vis.eventId) {
          camRef.current.targetX = Math.max(minCam, Math.min(maxCam, h.x));
        }
        camRef.current.targetX = Math.max(minCam, Math.min(maxCam, camRef.current.targetX));
        camRef.current.x += (camRef.current.targetX - camRef.current.x) * Math.min(1, dt * 7);
      } else {
        camRef.current.x = 512;
      }

      agentsRef.current.forEach((ag) => {
        if (now >= ag.nextThink) {
          ag.nextThink = now + 2200 + Math.random() * 2600;
          if (Math.random() < 0.55) {
            ag.practiceStart = now;
            ag.practiceUntil = now + 1000;
          } else {
            ag.tx = 280 + Math.random() * 460;
            ag.ty = 240 + Math.random() * 190;
          }
        }
        const dx = ag.tx - ag.x;
        const dy = ag.ty - ag.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8 && now >= ag.practiceUntil) {
          ag.x += (dx / dist) * 65 * dt;
          ag.y += (dy / dist) * 65 * dt;
          if (Math.abs(dx) > 1) ag.facing = dx > 0 ? 1 : -1;
          ag.walkTick += dt * 6;
        } else {
          ag.walkTick = 0;
        }
      });

      weatherRef.current.forEach((wp) => {
        wp.x += st.season === 'SUMMER' ? -2.2 : -0.4;
        wp.y += st.season === 'SUMMER' ? 8.2 : 0.9;
        if (wp.y > WORLD_H) { wp.y = -4; wp.x = Math.random() * WORLD_W; }
        if (wp.x < 0) wp.x = WORLD_W;
      });

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.save();
          const camLeft = Math.round(camRef.current.x - viewW / 2);
          ctx.translate(-camLeft, 0);

          const mapImg = loadRawImage(getDojoMapSrc(st.country, st.facilities.yard));
          if (mapImg) ctx.drawImage(mapImg, 0, 0, WORLD_W, WORLD_H);
          else { ctx.fillStyle = '#18120e'; ctx.fillRect(0, 0, WORLD_W, WORLD_H); }

          if (st.season === 'SUMMER') { ctx.fillStyle = 'rgba(20, 42, 68, 0.14)'; ctx.fillRect(0, 0, WORLD_W, WORLD_H); }
          else if (st.season === 'AUTUMN') { ctx.fillStyle = 'rgba(180, 80, 20, 0.12)'; ctx.fillRect(0, 0, WORLD_W, WORLD_H); }
          else if (st.season === 'WINTER') { ctx.fillStyle = 'rgba(190, 220, 255, 0.18)'; ctx.fillRect(0, 0, WORLD_W, WORLD_H); }

          // 본관 현판
          const sw = Math.min(168, Math.max(88, st.sectName.length * 13 + 20));
          ctx.fillStyle = 'rgba(22, 14, 9, 0.9)';
          ctx.fillRect(Math.round(512 - sw / 2), 92, sw, 20);
          ctx.strokeStyle = st.facilities.yard >= 3 ? '#f2c96b' : '#8c6239';
          ctx.lineWidth = 2;
          ctx.strokeRect(Math.round(512 - sw / 2), 92, sw, 20);
          ctx.fillStyle = '#fde68a';
          ctx.font = 'bold 11px NeoDunggeunmo, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(st.sectName, 512, 106);

          // ★ 국가 × 성별 × 3연령대(청년/중년/원로) 18종 4프레임 보행 시트 완벽 매칭! ★
          const walkInfo = getHeroWalkSpriteInfo(st.country, st.gender, st.age);
          const heroSheet = getGridSpriteSheet(walkInfo.src, 4, walkInfo.rows);
          const heroRowOffset = walkInfo.rowIndex * 4;
          const discSheet = getSpriteSheet('/assets/sheet_walk_disciple.jpg', 4);
          const merchSp = getChromaSprite('/assets/sp_merchant_top.jpg');

          const units: Array<{ y: number; draw: () => void }> = [];

          units.push({
            y: h.y,
            draw: () => {
              const walkCycle = [0, 1, 0, 3];
              const localIdx = h.walkTick > 0 ? walkCycle[Math.floor(h.walkTick) % 4] : 0;
              const frame = heroSheet?.frames[heroRowOffset + localIdx] || heroSheet?.frames[0] || null;
              const refH = heroSheet?.refHeight || 180;
              drawUnit(ctx, frame, refH, h.x, h.y, 84, h.facing, st.name, '#fde68a');
              if (now < h.floatingUntil && h.floatingText) {
                const lift = (1 - (h.floatingUntil - now) / 1600) * 28;
                ctx.font = 'bold 15px NeoDunggeunmo, monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#140d09';
                ctx.fillText(h.floatingText, Math.round(h.x) + 1, Math.round(h.y - 95 - lift) + 1);
                ctx.fillStyle = h.floatingColor;
                ctx.fillText(h.floatingText, Math.round(h.x), Math.round(h.y - 95 - lift));
              }
            },
          });

          agentsRef.current.forEach((ag) => {
            const disc = st.disciples.find((d) => d.id === ag.id);
            if (!disc || !discSheet) return;
            if (vis.eventId && vis.discId === ag.id) return; // 지금 주인공에게 걸어가는 중
            let fIdx = 0;
            if (now < ag.practiceUntil) fIdx = now - ag.practiceStart < 420 ? 2 : 3;
            else if (ag.walkTick > 0) fIdx = Math.floor(ag.walkTick) % 2;
            units.push({
              y: ag.y,
              draw: () => drawUnit(ctx, discSheet.frames[fIdx], discSheet.refHeight, ag.x, ag.y, 74, ag.facing, disc.name),
            });
          });

          if (!st.flags.tutorialDone && st.turn === 1 && !st.activeEvent) {
            const elderSp = getChromaSprite('/assets/sp_hero_old_top.jpg');
            units.push({
              y: 320,
              draw: () => drawUnit(ctx, elderSp, elderSp?.height || 180, 600, 320, 82, -1, elderName, '#fde68a'),
            });
          }

          if (st.merchantOffer && !st.activeEvent && merchSp) {
            units.push({
              y: 455,
              draw: () => drawUnit(ctx, merchSp, merchSp.height, 415, 455, 84, 1, '★만물객', '#fb923c'),
            });
          }

          if (vis.eventId) {
            const vSheet = vis.isSheet ? getGridSpriteSheet(vis.spriteSrc, 4, vis.rows || 1) : null;
            const vSp = !vis.isSheet ? getChromaSprite(vis.spriteSrc) : null;
            const vRow = (vis.rowIndex || 0) * 4;
            const vFrame = vSheet ? vSheet.frames[vRow + (vis.arrived ? 0 : Math.floor(now / 140) % 2)] || vSheet.frames[0] : vSp;
            const vRefH = vSheet ? vSheet.refHeight : vSp?.height || 180;
            units.push({
              y: vis.y,
              draw: () => drawUnit(ctx, vFrame, vRefH, vis.x, vis.y, 86, vis.x >= h.x ? -1 : 1, vis.name, '#fca5a5'),
            });
          }

          units.sort((a, b) => a.y - b.y).forEach((u) => u.draw());

          ctx.fillStyle =
            st.season === 'SPRING' ? '#fbcfe8' : st.season === 'SUMMER' ? 'rgba(186, 230, 253, 0.72)' : st.season === 'AUTUMN' ? '#fb923c' : '#ffffff';
          weatherRef.current.forEach((wp) => {
            if (st.season === 'SUMMER') ctx.fillRect(Math.round(wp.x), Math.round(wp.y), 2, 12);
            else ctx.fillRect(Math.round(wp.x), Math.round(wp.y), wp.size, wp.size);
          });

          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [elderName, viewW]);

  const cMeta = COUNTRIES[state.country];
  const sMeta = SEASON_META[state.season];
  const maxActivities = state.statuses.some((s) => s.id === 'HEAVY_INJURY') || (state.age >= 75 && state.health < 35) ? 2 : 4;
  const selected = state.seasonPlan.activities;
  const weights = state.seasonPlan.weights || {};
  const getWeight = (id: ScheduleActivityId) => Math.max(1, Math.min(4, weights[id] || 1));
  const unreadBooks = state.books.filter((b) => !b.decoded);

  const toggleActivity = (id: ScheduleActivityId) => {
    sound.playClick();
    if (id === 'CRAFT' && !state.activeCraft && !selected.includes('CRAFT')) {
      onOpenTrain('CRAFT');
      return;
    }
    if (id === 'BUILD' && !state.activeBuild && !selected.includes('BUILD')) {
      onOpenDojo();
      return;
    }
    if (id === 'DECODE' && unreadBooks.length === 0) {
      onOpenTrain('BOOKS');
      return;
    }
    // 폐관수련·무사수행은 계절 전체를 쓰는 단독 작업이다. 켜면 다른 작업이 모두 빠지고, 끄면 무술 연마로 돌아간다.
    if (EXCLUSIVE.includes(id)) {
      if (selected.includes(id)) onUpdatePlan({ activities: ['TRAIN'], weights: { TRAIN: 1 } });
      else onUpdatePlan({ activities: [id], weights: { [id]: 1 } });
      return;
    }
    if (selected.some((a) => EXCLUSIVE.includes(a))) {
      onUpdatePlan({ activities: [id], weights: { [id]: 1 } });
      return;
    }
    if (selected.includes(id)) {
      if (selected.length <= 1) return;
      const nextActs = selected.filter((a) => a !== id);
      const nextW = { ...weights };
      delete nextW[id];
      onUpdatePlan({ activities: nextActs, weights: nextW });
    } else if (selected.length < maxActivities) {
      onUpdatePlan({ activities: [...selected, id], weights: { ...weights, [id]: 1 } });
    }
  };

  const adjustWeight = (id: ScheduleActivityId, delta: number) => {
    sound.playClick();
    const cur = getWeight(id);
    const nextVal = Math.max(1, Math.min(4, cur + delta));
    onUpdatePlan({ weights: { ...weights, [id]: nextVal } });
  };

  const isCutsceneActive = Boolean(state.activeEvent || hasOverlayModal);

  // 모바일 드래그 패닝 + 건물 클릭 핸들러
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMobile || isRunningSeason || isCutsceneActive) return;
    camRef.current.dragging = true;
    camRef.current.moved = false;
    camRef.current.dragStartX = e.clientX;
    camRef.current.camStartX = camRef.current.targetX;
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!camRef.current.dragging) return;
    const dx = e.clientX - camRef.current.dragStartX;
    if (Math.abs(dx) > 8) camRef.current.moved = true;
    const minCam = viewW / 2;
    const maxCam = WORLD_W - viewW / 2;
    camRef.current.targetX = Math.max(minCam, Math.min(maxCam, camRef.current.camStartX - dx * 1.4));
  };
  const handlePointerUp = () => {
    camRef.current.dragging = false;
  };

  const handleDioramaClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (camRef.current.moved || isRunningSeason || isCutsceneActive || showStoryTutorial) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(rect.width / viewW, rect.height / viewH);
    const offsetX = (rect.width - viewW * scale) / 2;
    const offsetY = (rect.height - viewH * scale) / 2;
    const camLeft = camRef.current.x - viewW / 2;
    const wx = (e.clientX - rect.left - offsetX) / scale + camLeft;
    const wy = (e.clientY - rect.top - offsetY) / scale;

    if (state.merchantOffer && Math.hypot(wx - 415, wy - 448) < 64) {
      sound.playClick();
      onOpenMerchant();
    } else if (Math.hypot(wx - 512, wy - 145) < 100 || Math.hypot(wx - 842, wy - 155) < 88) {
      sound.playClick();
      onOpenDojo();
    } else if (Math.hypot(wx - 168, wy - 150) < 84) {
      sound.playClick();
      onOpenTrain('CRAFT');
    } else if (Math.hypot(wx - 195, wy - 315) < 84) {
      sound.playClick();
      onOpenTrain('TRAIN');
    }
  };

  const activeMeta = activeTick ? ACTIVITY_META[activeTick.activity] : null;
  const ActiveIcon = activeMeta?.icon || Swords;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#120d0a] text-[#f5e9ce] overflow-hidden select-none">
      {/* 1. 모바일 390px 3단 무결점 상단 HUD (이름·나이·이명·자원 단 1글자도 잘림 0%!) */}
      {!isCutsceneActive && (
        <header className="shrink-0 bg-[#1e1510] border-b-2 border-[#8c6239] px-2 sm:px-4 py-1.5 z-20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
            <div className="flex items-start sm:items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <PixelPortrait role="HERO" country={state.country} age={state.age} gender={state.gender} size={40} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  {/* 1줄: 이름 + 나이 + 연도·계절 (모바일에서도 이름 절대 안 잘림!) */}
                  <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                    <span className="font-bold text-[#fde68a]">{state.name}</span>
                    <span className="bg-[#3d291a] border border-[#8c6239] text-[#fde68a] px-1 py-0.5 text-[10px] font-bold shrink-0">
                      {state.age}세
                    </span>
                    <span className="bg-[#b52b27] text-white px-1.5 py-0.5 text-[10px] font-bold shrink-0">
                      {state.year} {sMeta.label}
                    </span>
                    {(() => {
                      const dCfg = getDifficultyConfig(state);
                      return (
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold border shrink-0 ${dCfg.badgeColor}`}>
                          {dCfg.id === 'HELL' ? '☠ 지옥' : dCfg.shortLabel}
                        </span>
                      );
                    })()}
                  </div>

                  {/* 2줄: 문파 이명(전체 표시!) + 건강/재화/명성 */}
                  <div className="flex items-center justify-between sm:justify-start gap-2 text-[11px] flex-wrap">
                    {(() => {
                      const tTip = getSectTitleTooltip(state.currentTitle, state.reputation, state.fame);
                      return (
                        <InGameTooltip title={tTip.title} body={tTip.body} sub={tTip.sub}>
                          <span className="text-[10px] sm:text-[11px] text-[#d4b483] underline decoration-dotted underline-offset-2 whitespace-nowrap">
                            「{state.currentTitle}」
                          </span>
                        </InGameTooltip>
                      );
                    })()}
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <InGameTooltip {...HANJA_GLOSSARY.HEALTH}>
                        <span className="flex items-center gap-0.5 text-emerald-300"><Heart className="w-3 h-3 fill-emerald-400" />{state.health}</span>
                      </InGameTooltip>
                      <InGameTooltip {...HANJA_GLOSSARY.MONEY}>
                        <span className="flex items-center gap-0.5 text-amber-300">
                          <Coins className="w-3 h-3" />{state.money}
                          {state.debt > 0 && <span className="text-rose-400">(-{state.debt})</span>}
                        </span>
                      </InGameTooltip>
                      <InGameTooltip {...HANJA_GLOSSARY.FAME}>
                        <span className="flex items-center gap-0.5 text-sky-300"><Star className="w-3 h-3 fill-sky-300" />{state.fame}</span>
                      </InGameTooltip>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex sm:hidden items-center gap-1 shrink-0">
                <button onClick={() => { sound.playClick(); setShowLogDrawer(true); }} className="rpg-btn p-1.5 cursor-pointer" aria-label="인물·백과·도전과제"><ScrollText className="w-3.5 h-3.5 text-[#fde68a]" /></button>
                <button onClick={() => { sound.muted = !sound.muted; setMuted(sound.muted); }} className="rpg-btn p-1.5 cursor-pointer" aria-label="소리 켜기/끄기">{muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}</button>
                <button onClick={onReturnTitle} className="rpg-btn p-1.5 cursor-pointer" aria-label="타이틀 화면"><Home className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            <div className={`flex items-center gap-1 shrink-0 ${curTut?.highlight === 'TOP' ? 'ring-2 ring-[#fde047] p-0.5 animate-pulse' : ''}`}>
              {!isRunningSeason && (
                <>
                  <button onClick={() => { sound.playClick(); onOpenTrain('TRAIN'); }} className="flex-1 sm:flex-none rpg-btn px-2 py-1 text-[11px] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap">
                    <Swords className="w-3.5 h-3.5 text-[#fde68a] shrink-0" /><span>무술</span>
                  </button>
                  <button onClick={() => { sound.playClick(); onOpenDojo(); }} className="flex-1 sm:flex-none rpg-btn px-2 py-1 text-[11px] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap">
                    <Building2 className="w-3.5 h-3.5 text-amber-300 shrink-0" /><span>도장</span>
                  </button>
                  <button onClick={() => { sound.playClick(); onOpenDisciples(); }} className="relative flex-1 sm:flex-none rpg-btn px-2 py-1 text-[11px] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap">
                    <Users className="w-3.5 h-3.5 text-sky-300 shrink-0" /><span>제자·문파</span>
                    {/* 마음이 뜬 제자나 적대 문파가 있으면 눈에 띄게 알린다 */}
                    {(state.disciples.some((d) => !d.dead && (d.loyalty < 45 || (d.temperament === 'SCHEMER' && d.exposed))) ||
                      (state.sects || []).some((sc) => sc.met && !sc.allied && sc.relation <= -50)) && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border border-red-200 rounded-full" />
                    )}
                  </button>
                  {state.merchantOffer && (
                    <button onClick={() => { sound.playClick(); onOpenMerchant(); }} className="seal-badge px-2 py-1 text-[11px] font-bold animate-pulse cursor-pointer whitespace-nowrap">
                      ★상인
                    </button>
                  )}
                </>
              )}
              <div className="hidden sm:flex items-center gap-1">
                <InGameTooltip hoverOnly title="인물 · 무림 백과 · 도전과제" body="6대 능력치 풀이, 시대 세계관, 24종 도전과제 및 도장 일지를 열람합니다.">
                  <button onClick={() => { sound.playClick(); setShowLogDrawer(true); }} className="rpg-btn p-1.5 cursor-pointer" aria-label="인물·백과·일지"><ScrollText className="w-4 h-4 text-[#fde68a]" /></button>
                </InGameTooltip>
                <InGameTooltip hoverOnly title={muted ? '효과음 켜기' : '효과음 끄기'} body="타격음과 비무 효과음을 켜거나 끕니다.">
                  <button onClick={() => { sound.muted = !sound.muted; setMuted(sound.muted); }} className="rpg-btn p-1.5 cursor-pointer" aria-label="사운드">{muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
                </InGameTooltip>
                <InGameTooltip hoverOnly title="타이틀로 돌아가기" body="현재 진행 상황은 자동 저장되며 첫 화면으로 이동합니다.">
                  <button onClick={onReturnTitle} className="rpg-btn p-1.5 cursor-pointer" aria-label="타이틀"><Home className="w-4 h-4" /></button>
                </InGameTooltip>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* 2. 중앙 라이브 32비트 도트 도장 디오라마 (모바일 반응형 패닝 & 자동 추적!) */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center bg-[#0f0a07] overflow-hidden">
        <canvas
          ref={canvasRef}
          width={viewW}
          height={viewH}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleDioramaClick}
          className={`pixel-canvas w-full h-full object-cover touch-pan-y ${!isRunningSeason && !isCutsceneActive ? 'cursor-pointer' : ''}`}
        />

        {/* 모바일 전용 좌/중/우 퀵 시점 이동 버튼 (맵 잘림 없이 서재~본관~대장간 자유 탐색!) */}
        {isMobile && !isRunningSeason && !isCutsceneActive && !showStoryTutorial && (
          <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-10">
            <button
              onClick={() => { sound.playClick(); camRef.current.targetX = 280; }}
              className="pointer-events-auto bg-[#1a120c]/82 border border-[#8c6239] px-2 py-1 text-[10px] text-[#fde68a] flex items-center gap-0.5 cursor-pointer"
            >
              <ChevronLeft className="w-3 h-3" /> 서재·목인장
            </button>
            <button
              onClick={() => { sound.playClick(); camRef.current.targetX = 512; }}
              className="pointer-events-auto bg-[#1a120c]/82 border border-[#8c6239] px-2 py-1 text-[10px] text-[#e6d8be] cursor-pointer"
            >
              마당
            </button>
            <button
              onClick={() => { sound.playClick(); camRef.current.targetX = 744; }}
              className="pointer-events-auto bg-[#1a120c]/82 border border-[#8c6239] px-2 py-1 text-[10px] text-[#fde68a] flex items-center gap-0.5 cursor-pointer"
            >
              대장간·의원 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* 스토리형 자연스러운 첫 봄 튜토리얼 대화창 */}
        {curTut && (
          <div className="absolute bottom-2.5 inset-x-2.5 sm:inset-x-6 z-20 max-w-2xl mx-auto">
            <div className="rpg-window p-3 sm:p-4 bg-[#1c130c]/96 border-[#fde047] flex items-start gap-3 animate-ink">
              <PixelPortrait role="ELDER" country={state.country} age={65} size={56} />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-[#fde68a]">{elderName}</span>
                    <span className="text-[10px] italic text-[#c9a977] hidden sm:inline">({curTut.stage})</span>
                  </div>
                  <button
                    onClick={() => { sound.playClick(); onCompleteTutorial(); }}
                    className="text-[10px] text-[#c7b394] hover:text-white underline cursor-pointer shrink-0"
                  >
                    건너뛰기
                  </button>
                </div>
                <p className="text-xs sm:text-sm leading-5 sm:leading-6 text-[#f5e9ce]">{curTut.text}</p>
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => {
                      sound.playClick();
                      if (tutIdx < tutorialSteps.length - 1) setTutIdx((i) => i + 1);
                      else onCompleteTutorial();
                    }}
                    className="seal-badge px-3 py-1 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {tutIdx < tutorialSteps.length - 1 ? `다음 (${tutIdx + 1}/${tutorialSteps.length})` : '알겠습니다!'}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ★ 프린세스 메이커 2식 실시간 계절 타임라인 바 (상단 고정!) ★ */}
        {isRunningSeason && !isCutsceneActive && (
          <div className="absolute top-2 left-2 right-2 z-10 max-w-2xl mx-auto space-y-1.5">
            <div className="rpg-window p-2 bg-[#1a110b]/94 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[#fde68a] whitespace-nowrap">{state.year}년 {sMeta.label}</span>
                  <div className="flex items-center gap-1">
                    {['초순', '중순', '하순'].map((lbl, idx) => (
                      <span
                        key={lbl}
                        className={`px-1.5 py-0.5 text-[10px] border ${
                          idx === seasonPhaseIdx
                            ? 'bg-[#b52b27] border-[#fde047] text-white font-bold'
                            : idx < seasonPhaseIdx
                            ? 'bg-[#3d291a] border-[#8c6239] text-[#fde68a]'
                            : 'bg-[#120c08] border-[#4a3423] text-[#786552]'
                        }`}
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onChangeSimSpeed(simSpeed === 1 ? 2 : 1)} className="rpg-btn px-2 py-0.5 text-[11px] font-bold cursor-pointer">
                    {simSpeed}x
                  </button>
                  <button onClick={onSkipSeasonAnim} className="rpg-btn px-2 py-0.5 text-[11px] flex items-center gap-0.5 cursor-pointer">
                    <FastForward className="w-3 h-3" /> 스킵
                  </button>
                </div>
              </div>

              {/* 실제 계획 비율 막대 위를 황금 커서가 실시간으로 채워 나가는 타임라인! */}
              <div className="relative h-6 bg-[#120c08] border border-[#8c6239] flex overflow-hidden gap-0.5 p-0.5">
                {(selected.includes('SECLUSION') ? (['SECLUSION', 'SECLUSION', 'SECLUSION'] as ScheduleActivityId[]) : selected).map((actId, idx) => {
                  const meta = ACTIVITY_META[actId];
                  const w = actId === 'SECLUSION' ? 1 : getWeight(actId);
                  const isCurrent = idx === activeStepIdx;
                  const isDone = idx < activeStepIdx;
                  return (
                    <div
                      key={`${actId}-${idx}`}
                      style={{ flexGrow: w, flexBasis: 0 }}
                      className={`relative flex items-center justify-center text-[10px] font-bold border transition-all ${
                        isCurrent
                          ? `${meta.barBg} border-[#fde047] text-white`
                          : isDone
                          ? `${meta.barBg} opacity-75 border-[#8c6239] text-[#e6d8be]`
                          : 'bg-[#1e1510] border-[#4a3423] text-[#8f7c66]'
                      }`}
                    >
                      <span className="truncate px-1 z-10">{meta.short}</span>
                    </div>
                  );
                })}
                {/* 실시간 진행 광택 오버레이 */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 bg-[#fde047]/18 border-r-2 border-[#fde047] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(4, timelineProgress))}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ★ 프린세스 메이커 2식 실시간 활동 & 이벤트 효과 카드 (하단 중앙!) ★ */}
        {isRunningSeason && activeTick && activeMeta && !isCutsceneActive && (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 max-w-xl mx-auto animate-ink" key={`${activeTick.phase}-${activeTick.activity}-${activeStepIdx}`}>
            <div className="rpg-window p-3 sm:p-3.5 bg-[#1b120c]/95 border-[#d4a359] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`p-1.5 border ${activeMeta.barBg} ${activeMeta.barBorder} shrink-0`}>
                    <ActiveIcon className={`w-4 h-4 ${activeMeta.color}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 bg-[#3d291a] text-[#fde68a] font-bold">{activeTick.phaseLabel}</span>
                      <span className="font-bold text-sm text-[#fde68a] truncate">{activeMeta.label}</span>
                    </div>
                    <div className="text-[11px] text-[#c7b394] truncate">{activeMeta.desc}</div>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-amber-300 shrink-0">{timelineProgress}%</span>
              </div>

              {/* 방금 활동 중 발생한 사소한 사건 (있으면 명확하게 강조!) */}
              {activeTick.minorEventText && (
                <div
                  className={`p-2 border-l-2 text-xs leading-relaxed ${
                    activeTick.minorEventTone === 'MAGIC'
                      ? 'bg-[#2e1038]/90 border-fuchsia-400 text-fuchsia-100'
                      : activeTick.minorEventTone === 'WARN'
                      ? 'bg-[#3b1512]/90 border-amber-400 text-amber-100'
                      : 'bg-[#1f2c1f]/90 border-emerald-400 text-emerald-100'
                  }`}
                >
                  ★ {renderRichText(activeTick.minorEventText)}
                </div>
              )}

              {/* 명확한 스탯 · 숙련 · 금화 · 건강 변화 뱃지들! */}
              {activeTick.badges && activeTick.badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {activeTick.badges.map((b, i) => (
                    <span
                      key={i}
                      className={`text-[11px] px-2 py-0.5 border font-bold ${
                        b.tone === 'MAGIC'
                          ? 'bg-fuchsia-950/85 border-fuchsia-400 text-fuchsia-200'
                          : b.tone === 'WARN'
                          ? 'bg-rose-950/85 border-rose-400 text-rose-200'
                          : 'bg-emerald-950/85 border-emerald-400 text-emerald-200'
                      }`}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. 하단 「시각적 분할 계절 계획 보드 (고정 위치 비중 조절 + 내장 드롭다운!)」 */}
      {!isRunningSeason && !isCutsceneActive && (
        <section className="shrink-0 bg-[#1e1510] border-t-2 border-[#d4a359] p-2 sm:p-3 z-20">
          <div className="max-w-5xl mx-auto space-y-2">
            <div className={`space-y-1.5 ${curTut?.highlight === 'BAR' ? 'ring-2 ring-[#fde047] p-1 bg-[#2b1d12]' : ''}`}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-[#fde68a] shrink-0">계절 계획 ({selected.length}/{maxActivities})</span>

                <button
                  disabled={selected.length === 0}
                  onClick={() => {
                    if (showStoryTutorial) onCompleteTutorial();
                    sound.playDrum();
                    onStartSeason();
                  }}
                  className={`seal-badge px-3 sm:px-4 py-1 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0 ${
                    curTut?.highlight === 'START' ? 'ring-2 ring-[#fde047] animate-pulse' : ''
                  }`}
                >
                  <Play className="w-3 h-3 fill-current" /> 계절 시작 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 1) 순수 시각적 비율 막대 (선택 활동 비중대로 실시간 분할, 글자 잘림 0%!) */}
              <div className="flex w-full h-7 sm:h-8 bg-[#120c08] border-2 border-[#8c6239] overflow-hidden gap-0.5 p-0.5">
                {selected.map((actId) => {
                  const meta = ACTIVITY_META[actId];
                  const Icon = meta.icon;
                  const w = getWeight(actId);
                  return (
                    <div
                      key={actId}
                      style={{ flexGrow: w, flexBasis: 0 }}
                      className={`${meta.barBg} border ${meta.barBorder} px-1 flex items-center justify-center gap-1 min-w-0 transition-all duration-150 overflow-hidden`}
                    >
                      <Icon className={`w-3 h-3 shrink-0 ${meta.color} ${selected.length >= 4 ? 'hidden sm:inline' : ''}`} />
                      <span className="text-[11px] font-bold text-[#fff8e7] leading-none whitespace-nowrap">
                        {selected.length <= 2 ? meta.label : meta.short}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 2) 고정 위치 활동별 비중 조절 & 대상 선택(연마 초식 · 연구 서적 드롭다운 내장!) */}
              <div
                className={`grid gap-1 ${
                  selected.length === 1
                    ? 'grid-cols-1'
                    : selected.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-4'
                }`}
              >
                {selected.map((actId) => {
                  const meta = ACTIVITY_META[actId];
                  const Icon = meta.icon;
                  const w = getWeight(actId);
                  return (
                    <div
                      key={actId}
                      className="bg-[#18100b] border border-[#6b4728] px-2 py-1 space-y-1 min-w-0"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <Icon className={`w-3 h-3 shrink-0 ${meta.color}`} />
                          <span className="text-[11px] font-bold text-[#fde68a] truncate">{meta.label}</span>
                        </div>
                        {selected.length > 1 && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => adjustWeight(actId, -1)}
                              disabled={w <= 1}
                              className="w-5 h-5 bg-[#2d1f15] hover:bg-[#4a3220] border border-[#8c6239] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                              title="비중 줄이기"
                            >
                              <Minus className="w-2.5 h-2.5" />
                            </button>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4].map((dot) => (
                                <span
                                  key={dot}
                                  className={`w-1.5 h-2.5 ${dot <= w ? 'bg-[#fde047]' : 'bg-[#3a2a1e]'}`}
                                />
                              ))}
                            </div>
                            <button
                              onClick={() => adjustWeight(actId, 1)}
                              disabled={w >= 4}
                              className="w-5 h-5 bg-[#2d1f15] hover:bg-[#4a3220] border border-[#8c6239] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                              title="비중 늘리기"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {actId === 'TRAIN' && (() => {
                        const targetSk = state.skills.find((s) => s.id === (state.seasonPlan.trainSkillId || state.skills[0]?.id)) || state.skills[0];
                        const skPct = targetSk ? getMasteryPct(targetSk) : 0;
                        const atWall = !!targetSk && isAtMasteryWall(targetSk);
                        return (
                          <div className="space-y-1">
                            <InGameSelect
                              title="연마할 초식 선택"
                              value={targetSk?.id || ''}
                              onChange={(val) => onUpdatePlan({ trainSkillId: val })}
                              options={state.skills.map((s) => ({
                                value: s.id,
                                label: `${s.customName || s.name} Lv.${s.masteryLevel}`,
                                sub: `${MASTERY_NAMES[s.masteryLevel]} · ${
                                  isAtMasteryWall(s) ? '벽 — 폐관 필요' : `숙련 ${getMasteryPct(s)}%`
                                } · 위력 ${s.power}`,
                              }))}
                            />
                            {targetSk && (
                              <div className="flex items-center gap-1.5 text-[9px] text-amber-200/90">
                                <div className="flex-1 h-1.5 bg-[#120c08] border border-[#5c432c]">
                                  <div className={`h-full ${atWall ? 'bg-purple-400' : 'bg-amber-500'}`} style={{ width: `${skPct}%` }} />
                                </div>
                                <span className={`shrink-0 font-bold ${atWall ? 'text-purple-300' : ''}`}>
                                  {targetSk.masteryLevel >= 10 ? '극의' : atWall ? '벽(壁)' : `${skPct}%`}
                                </span>
                              </div>
                            )}
                            {atWall && (
                              <div className="text-[9px] text-purple-300/90 leading-tight">더 연마해도 늘지 않습니다. 폐관수련으로 벽을 넘으세요.</div>
                            )}
                          </div>
                        );
                      })()}

                      {actId === 'JOURNEY' && (() => {
                        const regions = regionsForCountry(state.country);
                        const cur = regions.find((r) => r.id === defaultRegionFor(state)) || regions[0];
                        const dangerLabel = cur.danger >= 0.8 ? '매우 위험' : cur.danger >= 0.6 ? '위험' : cur.danger >= 0.4 ? '보통' : '평온';
                        return (
                          <div className="space-y-1">
                            <InGameSelect
                              title="무사수행을 떠날 곳"
                              value={cur.id}
                              onChange={(val) => onUpdatePlan({ journeyRegionId: val as typeof cur.id })}
                              options={regions.map((r) => ({
                                value: r.id,
                                label: `${r.name}(${r.hanja})`,
                                sub: r.blurb,
                              }))}
                            />
                            <div className="text-[9px] leading-snug text-teal-200/90">
                              {cur.blurb} · 위험 {dangerLabel} · 한 계절 90일
                            </div>
                            <div className="text-[9px] text-[#c7b394] leading-snug">
                              직접 걸으며 사건을 만난다. 도장의 일과는 멈추고 문하생 충성이 조금 떨어진다. 길 위의 선택은 몇 해 뒤 되돌아올 수 있다.
                            </div>
                          </div>
                        );
                      })()}

                      {actId === 'SECLUSION' && (() => {
                        const pv = getSeclusionPreview(state);
                        const candidates = state.skills.filter((s) => s.masteryLevel < 10);
                        if (!pv.skill) {
                          return <div className="text-[10px] text-purple-200">모든 초식이 이미 극의에 이르렀습니다.</div>;
                        }
                        const fullPct = Math.min(100, pv.insight);
                        const nextPct = Math.min(100, pv.insight + pv.perSeason);
                        return (
                          <div className="space-y-1">
                            <InGameSelect
                              title="폐관하며 붙들 초식"
                              accent="VIOLET"
                              value={pv.skill.id}
                              onChange={(val) => onUpdatePlan({ seclusionSkillId: val })}
                              options={candidates.map((s) => ({
                                value: s.id,
                                label: `${s.customName || s.name} Lv.${s.masteryLevel}`,
                                sub: isAtMasteryWall(s) ? '벽에 닿음 — 깨달음이 차면 극의 돌파 시도' : `숙련 ${getMasteryPct(s)}% · 아직 벽에 닿지 않음`,
                              }))}
                            />
                            <div className="flex items-center gap-1.5 text-[9px] text-purple-200">
                              <span className="shrink-0">깨달음</span>
                              <div className="relative flex-1 h-1.5 bg-[#120c08] border border-purple-700/70">
                                <div className="absolute inset-y-0 left-0 bg-purple-900" style={{ width: `${nextPct}%` }} />
                                <div className="absolute inset-y-0 left-0 bg-purple-400" style={{ width: `${fullPct}%` }} />
                              </div>
                              <span className="shrink-0 font-bold">{pv.insight}%</span>
                            </div>
                            <div className="text-[9px] leading-snug text-purple-200/90">
                              {pv.continuing ? `폐관 ${pv.seasonNo}계절째 (이어서)` : '새로 관문을 닫음'}
                              {' · '}계절당 깨달음 약 +{pv.perSeason}
                              {pv.atWall
                                ? ` · 극의까지 약 ${pv.seasonsToFull}계절 · 돌파 확률 ${Math.round(pv.chance * 100)}%`
                                : ' · 벽에 닿기 전까지는 숙련·정신·영력이 오른다'}
                            </div>
                            {pv.lostInsight > 0 && (
                              <div className="text-[9px] text-rose-300">관을 나섰던 탓에 깨달음 {pv.lostInsight}%가 흩어집니다.</div>
                            )}
                            <div className="text-[9px] text-[#c7b394] leading-snug">
                              계절 중 바깥 사건이 닿지 않고 문하생 충성이 조금 떨어집니다. 돌파에 실패하면 주화입마(건강·수명 손실).
                            </div>
                          </div>
                        );
                      })()}

                      {actId === 'DECODE' && unreadBooks.length > 0 && (() => {
                        const targetBk = unreadBooks.find((b) => b.id === (state.seasonPlan.decodeBookId || unreadBooks[0].id)) || unreadBooks[0];
                        const bkTarget = getBookDecodeTarget(targetBk);
                        const bkPct = Math.min(100, Math.round((targetBk.decodeProgress / Math.max(1, bkTarget)) * 100));
                        return (
                          <div className="space-y-1">
                            <InGameSelect
                              title="연구할 서적 선택"
                              accent="VIOLET"
                              value={targetBk.id}
                              onChange={(val) => onUpdatePlan({ decodeBookId: val })}
                              options={unreadBooks.map((b) => {
                                const t = getBookDecodeTarget(b);
                                const p = Math.min(100, Math.round((b.decodeProgress / Math.max(1, t)) * 100));
                                return {
                                  value: b.id,
                                  label: b.title,
                                  sub: `진행 ${p}%${b.requiresMasteryLv ? ` · 필요 Lv.${b.requiresMasteryLv} / 영력 ${b.requiresQi || 0}` : ''}`,
                                };
                              })}
                            />
                            <div className="flex items-center gap-1.5 text-[9px] text-violet-200">
                              <div className="flex-1 h-1.5 bg-[#120c08] border border-violet-700/70">
                                <div className="h-full bg-violet-400" style={{ width: `${bkPct}%` }} />
                              </div>
                              <span className="shrink-0 font-bold">{bkPct}%</span>
                            </div>
                          </div>
                        );
                      })()}

                      {actId === 'BUILD' && state.activeBuild && (
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-orange-300 truncate">
                            🔨 {state.activeBuild.targetName} ({state.activeBuild.progress}%)
                          </div>
                          <div className="h-1.5 bg-[#120c08] border border-orange-700/70">
                            <div className="h-full bg-orange-400" style={{ width: `${state.activeBuild.progress}%` }} />
                          </div>
                        </div>
                      )}

                      {actId === 'CRAFT' && state.activeCraft && (
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-fuchsia-300 truncate">
                            ✦ {state.activeCraft.customName} ({state.activeCraft.progress}%)
                          </div>
                          <div className="h-1.5 bg-[#120c08] border border-fuchsia-700/70">
                            <div className="h-full bg-fuchsia-400" style={{ width: `${state.activeCraft.progress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
              {ACTIVITY_ORDER.map((id) => {
                const meta = ACTIVITY_META[id];
                const Icon = meta.icon;
                const active = selected.includes(id);
                const disabled =
                  (!active && !EXCLUSIVE.includes(id) && !selected.some((a) => EXCLUSIVE.includes(a)) && selected.length >= maxActivities) ||
                  (id === 'TEACH' && !state.disciples.some((d) => !d.dead));

                return (
                  <InGameTooltip key={id} hoverOnly title={meta.label} body={meta.desc} className="w-full">
                    <button
                      disabled={disabled}
                      onClick={() => toggleActivity(id)}
                      className={`w-full py-1.5 px-1 border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer disabled:opacity-30 min-w-0 ${
                        active
                          ? 'bg-[#4a2b1a] border-[#fde047] text-[#fffbeb]'
                          : 'bg-[#261a12] border-[#5c432c] text-[#c7b394] hover:border-[#c9974c]'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
                      <span className="text-[10px] sm:text-[11px] font-bold leading-none whitespace-nowrap">{meta.short}</span>
                    </button>
                  </InGameTooltip>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 계절 종료 결산 카드 (금전·명성·건강·능력치·주요 이벤트·문하생 변화 한눈에 확인!) */}
      {state.lastSeasonSummary && !isRunningSeason && !isCutsceneActive && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-3 sm:p-4">
          <div className="rpg-window max-w-md w-full max-h-[88vh] flex flex-col overflow-hidden animate-ink">
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#8c6239] bg-[#1b120c]">
              <span className="font-bold text-base text-[#fde68a]">
                {state.lastSeasonSummary.year}년 {SEASON_META[state.lastSeasonSummary.season].label} 결산
              </span>
              <span className="text-xs text-[#c7b394]">{state.name} ({state.age}세)</span>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-[#1b120c] border border-[#6b4728] py-2">
                  <div className="text-[10px] text-[#c7b394]">금전 변동</div>
                  <div className={`font-bold ${state.lastSeasonSummary.moneyDelta >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                    {state.lastSeasonSummary.moneyDelta >= 0 ? '+' : ''}{state.lastSeasonSummary.moneyDelta}{cMeta.currency}
                  </div>
                </div>
                <div className="bg-[#1b120c] border border-[#6b4728] py-2">
                  <div className="text-[10px] text-[#c7b394]">명성 변동</div>
                  <div className={`font-bold ${state.lastSeasonSummary.fameDelta >= 0 ? 'text-sky-300' : 'text-rose-400'}`}>
                    {state.lastSeasonSummary.fameDelta >= 0 ? '+' : ''}{state.lastSeasonSummary.fameDelta}
                  </div>
                </div>
                <div className="bg-[#1b120c] border border-[#6b4728] py-2">
                  <div className="text-[10px] text-[#c7b394]">건강 변동</div>
                  <div className={`font-bold ${state.lastSeasonSummary.healthDelta >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                    {state.lastSeasonSummary.healthDelta >= 0 ? '+' : ''}{state.lastSeasonSummary.healthDelta}
                  </div>
                </div>
              </div>

              {state.lastSeasonSummary.statDeltas && state.lastSeasonSummary.statDeltas.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-bold text-[#fde68a]">능력치 변화</div>
                  <div className="flex flex-wrap gap-1.5">
                    {state.lastSeasonSummary.statDeltas.map((sd) => (
                      <span key={sd} className="text-[11px] px-2 py-0.5 bg-[#1a3324] border border-emerald-500/60 text-emerald-200 font-bold">
                        {sd}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {state.lastSeasonSummary.majorEvents && state.lastSeasonSummary.majorEvents.length > 0 && (
                <div className="bg-[#2a1d12] border border-[#d4a359] p-2.5 space-y-1 text-xs">
                  <div className="text-[11px] font-bold text-amber-300">★ 이번 계절 주요 사건</div>
                  {state.lastSeasonSummary.majorEvents.map((evTitle, i) => (
                    <div key={i} className="text-[#fff8e7]">• {evTitle}</div>
                  ))}
                </div>
              )}

              {state.lastSeasonSummary.discipleNote && (
                <div className="text-[11px] text-cyan-200 bg-[#122630] border border-cyan-500/50 px-2.5 py-1.5">
                  👥 {state.lastSeasonSummary.discipleNote}
                </div>
              )}

              <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs bg-[#1b120c] p-2.5 border border-[#6b4728]">
                <div className="text-[10px] text-[#c7b394] font-bold mb-1">계절 일과 기록</div>
                {state.lastSeasonSummary.highlights.slice(0, 10).map((hl, i) => (
                  <div key={i} className="text-[#e6d8be] leading-relaxed">• {renderRichText(hl)}</div>
                ))}
              </div>

              <button onClick={() => { sound.playDrum(); onDismissSummary(); }} className="w-full seal-badge py-2.5 text-sm font-bold cursor-pointer">
                확인 · 다음 계절로 ({SEASON_META[SEASON_META[state.season].next].label}) ▶
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 인물 스탯 · 무림 백과(세계관/NPC) · 도장 일지 팝업 */}
      {showLogDrawer && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-2.5 sm:p-4">
          <div className="rpg-window max-w-xl w-full max-h-[86vh] flex flex-col overflow-hidden animate-ink">
            <div className="flex justify-between items-center px-4 py-2.5 border-b-2 border-[#8c6239] bg-[#1b120c]">
              <span className="font-bold text-sm text-[#fde68a] truncate">{state.name} · 「{state.currentTitle}」</span>
              <button onClick={() => setShowLogDrawer(false)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-4 border-b-2 border-[#6b4728] bg-[#221710] text-[11px] sm:text-xs font-bold">
              {([
                { id: 'STATS', label: '인물·능력' },
                { id: 'LORE', label: '무림 백과' },
                { id: 'ACH', label: '도전과제' },
                { id: 'LOGS', label: `일지 (${state.logs.length})` },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => { sound.playClick(); setDrawerTab(t.id); }}
                  className={`py-2 cursor-pointer whitespace-nowrap ${drawerTab === t.id ? 'bg-[#3d291a] text-[#fde68a] border-b-2 border-[#fde047]' : 'text-[#c7b394]'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto flex-1 p-3.5 space-y-2.5 text-xs">
              {drawerTab === 'STATS' && (
                <div className="space-y-2">
                  {STAT_GUIDE.map((st) => (
                    <div key={st.key} className="bg-[#1b120c] border border-[#6b4728] p-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-bold text-[#fde68a]">{st.name}</div>
                        <p className="text-[11px] text-[#d6cbb8] leading-relaxed">{st.desc}</p>
                      </div>
                      <div className="text-lg font-bold text-amber-300 shrink-0 px-2">{state.stats[st.key]}</div>
                    </div>
                  ))}
                </div>
              )}

              {drawerTab === 'LORE' && (
                <div className="space-y-2.5">
                  {getWorldLoreArticles(state).map((art) => (
                    <div key={art.id} className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-1.5">
                      <div className="flex items-start gap-2.5">
                        {art.portraitRole && (
                          <PixelPortrait role={art.portraitRole} country={state.country} age={art.portraitRole === 'RIVAL' ? state.rival.age : undefined} size={46} />
                        )}
                        <div className="min-w-0">
                          <div className="text-[10px] text-amber-300">
                            {art.category === 'WORLD' ? '시대·세계관' : art.category === 'NPC' ? '주요 인물' : '무도 이치'}
                          </div>
                          <div className="font-bold text-sm text-[#fde68a]">{art.title}</div>
                          <div className="text-[11px] text-[#c7b394]">{art.subtitle}</div>
                        </div>
                      </div>
                      <div className="space-y-1 pt-1 border-t border-[#3d291a] text-[#e6d8be] leading-relaxed">
                        {art.body.map((p, i) => <p key={i}>{p}</p>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {drawerTab === 'ACH' && <AchievementsPanel />}

              {drawerTab === 'LOGS' && (
                <div className="space-y-1.5">
                  {state.logs.map((lg) => (
                    <div key={lg.id} className="bg-[#1b120c]/85 border-l-2 border-[#d4a359] p-2 leading-relaxed">
                      <span className="text-[#c9974c] mr-1.5">[{lg.year} {SEASON_META[lg.season].label}]</span>
                      <span>{renderRichText(lg.text)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
