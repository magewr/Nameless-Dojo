import React, { useEffect, useRef, useState } from 'react';
import { BattleConfig, BattleTactic, Disciple, GameState, Skill, Stats, Weapon } from '../types/game';
import { BattleOutcomePayload } from '../engine/gameLogic';
import { simulateAutoBattleQuick } from '../engine/autoBattleSim';
import { bladeDamageMult, checkSurrender, fatalBlowChance, fatalBlowDamage, yieldThreshold } from '../engine/duelRules';
import { applyTranscendParry, hasTranscendence, isUnparryableByTranscendence } from '../data/booksAndSkills';
import { sound } from '../engine/sound';
import {
  getEnemyFightGridSrc,
  getGridSpriteSheet,
  getHeroFightGridSrc,
  getKoFallenIndex,
  getVfxGridSheet,
  loadRawImage,
  preloadAllGameArt,
  VFX_SHEETS,
} from '../pixel/spriteLoader';
import {
  createDarkFlurry,
  createDeflectSpark,
  DEFLECT_RATE_FREEZE,
  DEFLECT_RATE_SLOW,
  DeflectSpark,
  getClashPause,
  renderDeflectSpark,
  createKoOneStroke,
  DarkFlurryState,
  drawGlowSprite,
  drawSmoothVfxSprite,
  KoOneStrokeState,
  renderDarkFlurry,
  renderKoOneStroke,
  SEQ_8F,
} from '../pixel/katanaVfxRenderer';
import { detectNpcGender, PixelPortrait } from './PixelPortrait';
import { HANJA_GLOSSARY, InGameTooltip } from './InGameUI';
import { TOURNAMENT_ROUNDS } from '../data/tournament';
import { getDifficultyId } from '../data/difficulty';
import { FastForward, Flame, Play, Shield, Skull, Snowflake, Swords, Trophy, User, Users, Zap } from 'lucide-react';

interface Props {
  state: GameState;
  battle: BattleConfig;
  onChangeTactic: (t: BattleTactic) => void;
  onFinish: (outcome: BattleOutcomePayload) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity?: number;
  kind?: 'PIXEL' | 'SPARK' | 'INK';
}

interface BladeArcEffect {
  x: number;
  y: number;
  radius: number;
  startAngle: number;
  endAngle: number;
  thickness: number;
  color: string;
  life: number;
  maxLife: number;
}

interface CrossFlareEffect {
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  life: number;
  maxLife: number;
}

interface GroundCrackEffect {
  x: number;
  y: number;
  scale: number;
  color: string;
  branches: Array<{ angle: number; len: number; bend: number }>;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale?: number;
}

interface AfterimageGhost {
  x: number;
  y: number;
  frameIdx: number;
  sheetSrc: string;
  flipX: number;
  tint: string;
  life: number;
  maxLife: number;
}

interface ActiveVfxSprite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sheetSrc: string;
  vfxIdx: number;
  frameSeq?: number[]; // 4프레임 연속 애니메이션 시퀀스!
  scale: number;
  flipX: number;
  rotation: number;
  life: number;
  maxLife: number;
  tintRing?: string;
}

interface SlashLineEffect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  life: number;
  maxLife: number;
}

interface ShockRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface MagicPillarFx {
  x: number;
  kind: 'FIRE' | 'LIGHTNING' | 'ICE' | 'SHADOW' | 'QI';
  color: string;
  life: number;
  maxLife: number;
}

interface DarkSlashSequence {
  active: boolean;
  startAt: number;
  targetX: number;
  targetY: number;
  attackerSheet: string;
  attackerFlip: number;
  color: string;
  title: string;
  scars: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    atMs: number;
    width: number;
    isFinisherLine?: boolean;
    played: boolean;
  }>;
  ghostSpots: Array<{ x: number; y: number; frameIdx: number; flip: number; atMs: number }>;
  finisherDone: boolean;
}

interface ProjectileWave {
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  vfxIdx: number;
  color: string;
  scale: number;
  fromPlayer: boolean;
  skill: Skill;
  dmg: number;
  hit: boolean;
  life: number;
}

interface FighterAction {
  skill: Skill;
  formNumber: number; // 몇 식 (1식, 2식...)
  isCounterRiposte?: boolean;
  counterChain?: number; // 연환 반격 공방 횟수 (1합, 2합, 3합...)
  startAt: number;
  stepInMs: number;
  windupMs: number;
  strikeMs: number;
  combo2Ms: number; // 0이면 단타, >0이면 2연격(Frame 4 하단 역베기!)
  recoveryMs: number;
  stepInDone: boolean;
  hit1Done: boolean;
  hit2Done: boolean;
}

interface FighterRuntime {
  name: string;
  sectTitle: string;
  age: number;
  x: number;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  posture: number;
  maxPosture: number;
  stats: Stats;
  weapon?: Weapon;
  skills: Skill[];
  passives: string[];
  transcended?: boolean; // 극의의 경지 (장착 초식·심법 중 Lv.10이 있음)
  passiveBonus?: { qiRegen: number; dmgReduce: number; allDmg: number; parry: number; maxHp: number };
  cooldowns: Record<string, number>;
  blockingUntil: number;
  invulnUntil: number;
  stunUntil: number;
  groggyUntil: number;
  hurtFlashUntil: number;
  hurtPoseUntil: number;
  lungeOffset: number;
  recoilOffset: number; // 피격 넉백을 한 프레임에 순간이동시키지 않고 미끄러지듯 보여 주기 위한 화면상 보정값
  clashPoseUntil: number; // 공격이 막힌 쪽이 칼을 내지른 자세 그대로 버티는 시간 (맞은 자세가 아니다)
  clashFrame: number;
  counterBuffUntil: number;
  yielded?: boolean; // 목검 비무에서 무릎 꿇고 항복함
  pendingCounter?: { skill: Skill; formNum: number; triggerAt: number; chain: number };
  shoutText: string;
  shoutSub: string;
  shoutUntil: number;
  shoutIsCounter: boolean;
  moving: boolean;
  action: FighterAction | null;
  hasMindEye?: boolean;
  hasOneArmSaint?: boolean;
  hasImmovable?: boolean;
}

const CANVAS_W = 900;
const CANVAS_H = 420;
const GROUND_Y = 368;
// 피격 섬광: 처음 한두 프레임만 새하얗게, 그 뒤로는 본래 그림 위에 옅게 얹어 빠르게 걷힌다.
const HIT_FLASH_MS = 170;
const HIT_FLASH_WHITE_MS = 50;
// 글자 팝업 자리: 머리 위는 초식 외침 말풍선의 자리이므로 피해 숫자는 몸 옆에, 상태 문구는 말풍선 위에 띄운다.
const FLOAT_STATUS_Y = 124;
const FLOAT_DAMAGE_Y = 236;

// 적 유파명 자동 생성 (외침용)
function getEnemySectName(battle: BattleConfig, country: GameState['country']): string {
  if (battle.isRivalBattle) {
    return country === 'CHINA' ? '천산검문' : country === 'JAPAN' ? '일도류' : '백운검파';
  }
  if (battle.title.includes('관군') || battle.title.includes('포도청')) return '관군무예';
  if (battle.title.includes('흑사회') || battle.title.includes('산적') || battle.title.includes('도적')) return '흑풍도';
  if (battle.title.includes('자객') || battle.title.includes('닌자')) return '암영류';
  return country === 'CHINA' ? '철혈무관' : country === 'JAPAN' ? '적사류' : '청풍도장';
}

// 스킬의 레벨(Lv.1~10) + 형태 + 속성 + 연마 각인 특성(imprintedTraits)에 따른 시각 연출 프로파일!
interface SkillVfxProfile {
  tier: 1 | 2 | 3 | 4; // 1: 입문(1~2), 2: 숙달(3~5), 3: 대성(6~8), 4: 극의(9~10)
  vfxIdx: number; // grid_vfx_martial_8f (0~7)
  color: string;
  scale: number;
  particles: number;
  afterimages: number;
  hitstopMs: number;
  isMultiHit: boolean;
  isRangedWave: boolean;
  isArmorBreak: boolean;
  isSwift: boolean;
  isExecute: boolean;
  isApexCutin: boolean;
  traitCallout: string;
}

function getSkillVfxProfile(sk: Skill, isCounterRiposte = false): SkillVfxProfile {
  const lv = sk.masteryLevel || 1;
  const tier: 1 | 2 | 3 | 4 = lv >= 9 ? 4 : lv >= 6 ? 3 : lv >= 3 ? 2 : 1;
  const traits = sk.imprintedTraits || [];

  const isMultiHit =
    !isCounterRiposte &&
    (traits.some((t) => (t.effect.multiHit || 0) >= 2) || (sk.form === 'SLASH' && lv >= 6));
  const isRangedWave =
    sk.form === 'PROJECTILE' ||
    sk.range === 'FAR' ||
    traits.some((t) => Boolean(t.effect.rangeExtend));
  const isArmorBreak =
    sk.telegraph === 'RED' ||
    traits.some((t) => Boolean(t.effect.unblockable) || (t.effect.postureMult || 1) >= 1.35);
  const isSwift = traits.some((t) => (t.effect.windupMult || 1) <= 0.85) || sk.form === 'STEP';
  const isExecute = traits.some((t) => (t.effect.executeThreshold || 0) > 0);
  const isApexCutin = tier >= 3 || Boolean(sk.isForbidden) || sk.origin.includes('FANTASY') || isCounterRiposte;

  const nm = sk.customName || sk.name;
  let vfxIdx = 0; // 기본 수평 은백 검기
  let color = '#f8fafc';

  if (sk.element === 'FIRE') {
    vfxIdx = 4;
    color = '#ff5722';
  } else if (sk.element === 'LIGHTNING') {
    vfxIdx = 5;
    color = '#c084fc';
  } else if (sk.element === 'ICE') {
    vfxIdx = 6;
    color = '#38bdf8';
  } else if (isCounterRiposte || sk.form === 'THRUST' || traits.some((t) => (t.effect.armorPierce || 0) >= 0.4)) {
    vfxIdx = 2; // 청백 관통 일섬 빔
    color = isCounterRiposte ? '#fde047' : '#67e8f9';
  } else if (sk.form === 'STRIKE' || sk.element === 'QI' || isArmorBreak) {
    vfxIdx = 3; // 황금 기공 충격파 링
    color = '#facc15';
  } else if (nm.includes('종') || nm.includes('낙') || nm.includes('양단') || nm.includes('벽력')) {
    vfxIdx = 1; // 황금 수직 낙하참
    color = '#fde68a';
  } else if (sk.element === 'SHADOW') {
    vfxIdx = 5;
    color = '#a855f7';
  } else if (sk.element === 'WIND') {
    vfxIdx = 0;
    color = '#5eead4';
  }

  // 레벨(숙련도)에 따라 같은 기술도 이펙트 크기·잔상·타격감이 극적으로 진화!
  const scale = tier === 4 ? 1.52 : tier === 3 ? 1.24 : tier === 2 ? 0.98 : 0.74;
  const particles = tier === 4 ? 36 : tier === 3 ? 24 : tier === 2 ? 15 : 8;
  const afterimages = (isSwift ? 2 : 0) + (tier >= 4 ? 3 : tier >= 3 ? 2 : tier >= 2 ? 1 : 0);
  const hitstopMs = isCounterRiposte ? 170 : tier === 4 ? 145 : tier === 3 ? 95 : tier === 2 ? 60 : 30;
  const latestTrait = traits[traits.length - 1];
  const traitCallout = latestTrait ? latestTrait.label : '';

  return {
    tier,
    vfxIdx,
    color,
    scale,
    particles,
    afterimages,
    hitstopMs,
    isMultiHit,
    isRangedWave,
    isArmorBreak,
    isSwift,
    isExecute,
    isApexCutin,
    traitCallout,
  };
}

export const AutoBattleView: React.FC<Props> = ({ state, battle, onChangeTactic, onFinish }) => {
  const [stage, setStage] = useState<'SETUP' | 'WATCH' | 'RESULT'>('SETUP');
  const [fighterType, setFighterType] = useState<'HERO' | 'DISCIPLE'>('HERO');
  const [selectedDiscipleId, setSelectedDiscipleId] = useState<string>('');
  const [speedMult, setSpeedMult] = useState<1 | 2>(1);
  const [hudTick, setHudTick] = useState(0);
  const [commentary, setCommentary] = useState('두 무인이 서로의 거리를 재며 기세를 겨룬다…');
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [resultOutcome, setResultOutcome] = useState<BattleOutcomePayload | null>(null);
  const [isPortrait, setIsPortrait] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 640 : false));

  useEffect(() => {
    const onResize = () => setIsPortrait(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const viewW = isPortrait ? 520 : CANVAS_W;
  const viewH = isPortrait ? 400 : CANVAS_H;
  const battleCamXRef = useRef(450);

  const pushLog = (msg: string) => {
    setCommentary(msg);
    setBattleLog((prev) => [...prev.slice(-4), msg]);
  };

  const speedRef = useRef<1 | 2>(1);
  useEffect(() => { speedRef.current = speedMult; }, [speedMult]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<FighterRuntime | null>(null);
  const enemyRef = useRef<FighterRuntime | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatsRef = useRef<FloatingText[]>([]);
  const ghostsRef = useRef<AfterimageGhost[]>([]);
  const vfxSpritesRef = useRef<ActiveVfxSprite[]>([]);
  const slashLinesRef = useRef<SlashLineEffect[]>([]);
  const bladeArcsRef = useRef<BladeArcEffect[]>([]);
  const flaresRef = useRef<CrossFlareEffect[]>([]);
  const cracksRef = useRef<GroundCrackEffect[]>([]);
  const ringsRef = useRef<ShockRing[]>([]);
  const magicFxRef = useRef<MagicPillarFx[]>([]);
  const darkSlashRef = useRef<DarkSlashSequence | null>(null);
  const darkFlurryRef = useRef<DarkFlurryState | null>(null);
  const koStrokeRef = useRef<KoOneStrokeState | null>(null);
  const wavesRef = useRef<ProjectileWave[]>([]);
  const deflectsRef = useRef<DeflectSpark[]>([]);

  const metaRef = useRef({
    hitstopUntil: 0,
    timeSlowUntil: 0,
    timeSlowColor: '#fde047',
    parryFlashUntil: 0,
    parryFlashStart: 0,
    parryChain: 0,
    clashSlowUntil: 0,
    inkFlashUntil: 0,
    shakeUntil: 0,
    shakePower: 8,
    cutinSect: '',
    cutinSkill: '',
    cutinTrait: '',
    cutinColor: '#fde68a',
    cutinUntil: 0,
    usedMagic: false,
    usedForbidden: false,
    justParries: 0,
    recoilHealthLoss: 0,
    recoilLifespanYears: 0,
    fatalDealt: 0,
    fatalTaken: 0,
    pThinkAt: 0,
    eThinkAt: 0,
    finished: false,
  });

  useEffect(() => {
    preloadAllGameArt();
  }, []);

  const aliveDisciples = state.disciples.filter((d) => !d.dead);
  const cleanSectName = battle.spectatorMode && battle.spectatorLeft
    ? battle.spectatorLeft.sectName
    : state.sectName.replace(/\(.*?\)/g, '').trim() || '무명류';
  const enemySectName = battle.isTournament && battle.enemyTitle ? battle.enemyTitle : getEnemySectName(battle, state.country);

  // ★ 객석 관전 모드(8강→4강→결승)는 셋업 화면 없이 즉시 절정 고수 대결을 자동 개막! ★
  useEffect(() => {
    if (battle.spectatorMode && battle.spectatorLeft && stage === 'SETUP') {
      beginWatch('HERO');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle.id]);

  const beginWatch = (type: 'HERO' | 'DISCIPLE', dId?: string) => {
    sound.playDrum();
    setFighterType(type);
    if (dId) setSelectedDiscipleId(dId);

    let pStats: Stats;
    let pName: string;
    let pAge: number;
    let pSkills: Skill[];
    let pPassives: string[];
    const pWeapon = state.weapons.find((w) => w.id === state.equippedWeaponId);

    if (battle.spectatorMode && battle.spectatorLeft) {
      const sl = battle.spectatorLeft;
      pStats = { ...sl.stats };
      pName = sl.name;
      pAge = sl.age;
      pSkills = sl.skills;
      pPassives = [];
    } else if (type === 'DISCIPLE' && dId) {
      const d = state.disciples.find((x) => x.id === dId) as Disciple;
      pStats = { ...d.stats };
      pName = d.name;
      pAge = d.age;
      pSkills = d.skills.filter((s) => !s.isPassive).slice(0, 5);
      pPassives = d.skills.filter((s) => s.isPassive).map((s) => s.id);
    } else {
      pStats = { ...state.stats };
      if (state.disabilities.includes('ONE_ARM')) pStats.str = Math.round(pStats.str * 0.8);
      if (state.disabilities.includes('LIMP')) pStats.agi = Math.round(pStats.agi * 0.75);
      pName = state.name;
      pAge = state.age;
      pSkills = state.equippedActiveIds
        .map((id) => state.skills.find((s) => s.id === id))
        .filter((s): s is Skill => !!s);
      if (pSkills.length === 0) pSkills = state.skills.slice(0, 2);
      pPassives = state.equippedPassiveIds;
    }

    const equippedPassiveSkills =
      battle.spectatorMode
        ? []
        : pPassives
            .map((id) => state.skills.find((s) => s.id === id))
            .filter((s): s is Skill => Boolean(s));
    const pPassiveBonus = equippedPassiveSkills.reduce(
      (acc, ps) => {
        ps.imprintedTraits.forEach((tr) => {
          acc.qiRegen += tr.effect.passiveQiRegenBonus || 0;
          acc.dmgReduce += tr.effect.passiveDamageReduce || 0;
          acc.allDmg += tr.effect.passiveAllDamageBonus || 0;
          acc.parry += tr.effect.passiveParryBonus || 0;
          acc.maxHp += tr.effect.passiveMaxHpBonus || 0;
        });
        return acc;
      },
      { qiRegen: 0, dmgReduce: 0, allDmg: 0, parry: 0, maxHp: 0 }
    );

    const pMaxHp =
      battle.spectatorMode && battle.spectatorLeft
        ? battle.spectatorLeft.hp
        : Math.round((110 + pStats.vit * 6) * (1 + Math.min(0.5, pPassiveBonus.maxHp)));
    playerRef.current = {
      name: pName,
      sectTitle: cleanSectName,
      age: pAge,
      x: 240,
      hp: pMaxHp,
      maxHp: pMaxHp,
      qi: Math.round((45 + pStats.wil * 2 + pStats.qi * 1.5) * (1 + Math.min(0.4, pPassiveBonus.qiRegen * 0.4))),
      maxQi: Math.round((45 + pStats.wil * 2 + pStats.qi * 1.5) * (1 + Math.min(0.4, pPassiveBonus.qiRegen * 0.4))),
      posture: Math.round(80 + pStats.vit * 2 + pStats.str * 1.5),
      maxPosture: Math.round(80 + pStats.vit * 2 + pStats.str * 1.5),
      stats: pStats,
      weapon: pWeapon,
      skills: pSkills,
      passives: pPassives,
      transcended: hasTranscendence([...pSkills, ...equippedPassiveSkills]),
      passiveBonus: pPassiveBonus,
      cooldowns: {},
      blockingUntil: 0,
      invulnUntil: 0,
      stunUntil: 0,
      groggyUntil: 0,
      hurtFlashUntil: 0,
      hurtPoseUntil: 0,
      lungeOffset: 0,
      recoilOffset: 0,
      clashPoseUntil: 0,
      clashFrame: 3,
      counterBuffUntil: 0,
      shoutText: '',
      shoutSub: '',
      shoutUntil: 0,
      shoutIsCounter: false,
      moving: false,
      hasMindEye: type === 'HERO' && state.awakenings.includes('MIND_EYE'),
      hasOneArmSaint: type === 'HERO' && state.awakenings.includes('ONE_ARM_SAINT'),
      hasImmovable: type === 'HERO' && state.awakenings.includes('IMMOVABLE'),
      action: null,
    };

    enemyRef.current = {
      name: battle.enemyName,
      sectTitle: enemySectName,
      age: battle.enemyAge,
      x: 650,
      hp: battle.enemyHp,
      maxHp: battle.enemyHp,
      qi: 100,
      maxQi: 100,
      posture: Math.round(70 + battle.enemyStats.vit * 2),
      maxPosture: Math.round(70 + battle.enemyStats.vit * 2),
      stats: battle.enemyStats,
      skills: battle.enemySkills,
      passives: [],
      transcended: hasTranscendence(battle.enemySkills),
      cooldowns: {},
      blockingUntil: 0,
      invulnUntil: 0,
      stunUntil: 0,
      groggyUntil: 0,
      hurtFlashUntil: 0,
      hurtPoseUntil: 0,
      lungeOffset: 0,
      recoilOffset: 0,
      clashPoseUntil: 0,
      clashFrame: 3,
      counterBuffUntil: 0,
      shoutText: '',
      shoutSub: '',
      shoutUntil: 0,
      shoutIsCounter: false,
      moving: false,
      action: null,
    };

    particlesRef.current = [];
    floatsRef.current = [];
    ghostsRef.current = [];
    vfxSpritesRef.current = [];
    deflectsRef.current = [];
    slashLinesRef.current = [];
    bladeArcsRef.current = [];
    flaresRef.current = [];
    cracksRef.current = [];
    ringsRef.current = [];
    magicFxRef.current = [];
    darkSlashRef.current = null;
    darkFlurryRef.current = null;
    koStrokeRef.current = null;
    wavesRef.current = [];

    metaRef.current = {
      hitstopUntil: 0,
      timeSlowUntil: 0,
      timeSlowColor: '#fde047',
      parryFlashUntil: 0,
      parryFlashStart: 0,
      parryChain: 0,
      clashSlowUntil: 0,
      inkFlashUntil: 0,
      shakeUntil: 0,
      shakePower: 8,
      cutinSect: '',
      cutinSkill: '',
      cutinTrait: '',
      cutinColor: '#fde68a',
      cutinUntil: 0,
      usedMagic: false,
      usedForbidden: false,
      justParries: 0,
      recoilHealthLoss: 0,
      recoilLifespanYears: 0,
      fatalDealt: 0,
      fatalTaken: 0,
      pThinkAt: performance.now() + 480,
      eThinkAt: performance.now() + 760,
      finished: false,
    };

    setBattleLog([`【${cleanSectName}】 ${pName} vs 【${enemySectName}】 ${battle.enemyName} — 일합 개시!`]);
    setCommentary(`【${cleanSectName}】 ${pName} vs 【${enemySectName}】 ${battle.enemyName} — 일합 개시!`);
    battleCamXRef.current = 445;
    setStage('WATCH');
  };

  const handleInstantResolve = () => {
    if (battle.spectatorMode) {
      metaRef.current.finished = true;
      setResultOutcome({
        victory: Math.random() < 0.5,
        fighterType: 'HERO',
        usedMagic: false,
        usedForbidden: false,
        justParriesCount: 0,
        recoilHealthLoss: 0,
        recoilLifespanYears: 0,
        hpRemainingRatio: 1,
      });
      setStage('RESULT');
      return;
    }
    const quick = simulateAutoBattleQuick(
      state,
      battle,
      fighterType,
      state.battleTactic,
      fighterType === 'DISCIPLE' ? selectedDiscipleId : undefined
    );
    metaRef.current.finished = true;
    if (quick.victory) sound.playLevelUp();
    setResultOutcome(quick);
    setStage('RESULT');
  };

  useEffect(() => {
    if (stage !== 'WATCH') return;
    let rafId = 0;
    let lastTime = performance.now();
    let lastHud = 0;

    const equippedGroup = state.weapons.find((w) => w.id === state.equippedWeaponId)?.group;
    const activeDisc = fighterType === 'DISCIPLE' ? state.disciples.find((d) => d.id === selectedDiscipleId) : null;
    const heroGender = battle.spectatorMode && battle.spectatorLeft
      ? battle.spectatorLeft.gender
      : activeDisc
      ? (activeDisc.gender || (detectNpcGender(`${activeDisc.name} ${activeDisc.archetype}`) === 'FEMALE' ? 'FEMALE' : 'MALE'))
      : state.gender;
    const heroCountry = battle.spectatorMode && battle.spectatorLeft
      ? battle.spectatorLeft.country
      : state.country;
    const heroAge = battle.spectatorMode && battle.spectatorLeft
      ? battle.spectatorLeft.age
      : activeDisc?.age || playerRef.current?.age || state.age;
    const heroInfo = getHeroFightGridSrc(heroCountry, heroGender, heroAge, activeDisc ? undefined : equippedGroup);
    const heroGridSrc = heroInfo.src;
    const heroNativeDir = heroInfo.nativeDir;
    const enemyGridSrc = getEnemyFightGridSrc(battle.enemyName, battle.enemyTitle, battle.enemyWeaponGroup);

    const panAt = (x: number) => Math.max(-0.78, Math.min(0.78, (x - CANVAS_W / 2) / (CANVAS_W / 2)));

    // 글자 팝업을 띄운다. 이미 떠 있는 글자와 겹치면 위로 한 줄씩 비켜 쌓는다.
    const pushFloat = (fl: FloatingText) => {
      const x = Math.max(70, Math.min(CANVAS_W - 70, fl.x));
      let y = fl.y;
      for (let guard = 0; guard < 5; guard++) {
        const clash = floatsRef.current.some((o) => Math.abs(o.x - x) < 96 && Math.abs(o.y - y) < 17);
        if (!clash) break;
        y -= 19;
      }
      floatsRef.current.push({ ...fl, x, y });
    };

    // dir(±1)을 주면 그 방향 반원으로 쏠려 튄다 (맞은 방향으로 파편이 날아가야 타격이 읽힌다)
    const biasedAngle = (dir: number) => {
      if (!dir) return Math.random() * Math.PI * 2;
      const base = dir > 0 ? 0 : Math.PI;
      return Math.random() < 0.8 ? base + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2;
    };

    const spawnParticles = (x: number, y: number, color: string, count: number, spread = 6.5, gravity = 0.16, dir = 0) => {
      for (let i = 0; i < count; i++) {
        const ang = biasedAngle(dir);
        const spd = 1.8 + Math.random() * spread;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.6,
          life: 0.28 + Math.random() * 0.34,
          maxLife: 0.62,
          color,
          size: 3 + Math.floor(Math.random() * 3) * 2,
          gravity,
          kind: 'PIXEL',
        });
      }
    };

    // 방향성 쇠불꽃 스파크 스트릭 (패링·강타 시 속도 방향으로 길게 뻗는 빛줄기!)
    const spawnSparks = (x: number, y: number, color: string, count: number, speed = 11, dir = 0) => {
      for (let i = 0; i < count; i++) {
        const ang = biasedAngle(dir);
        const spd = speed * (0.45 + Math.random() * 0.85);
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 2.2,
          life: 0.22 + Math.random() * 0.24,
          maxLife: 0.46,
          color: i % 3 === 0 ? '#ffffff' : color,
          size: 2 + Math.random() * 2,
          gravity: 0.24,
          kind: 'SPARK',
        });
      }
    };

    // 동양 수묵 먹물 튐 (고티어·카운터·체세붕괴·KO 시 흩뿌려지는 먹물 방울!)
    const spawnInkSplatter = (x: number, y: number, facing: number, count = 12, accentColor?: string) => {
      for (let i = 0; i < count; i++) {
        const spreadAng = (Math.random() - 0.5) * 1.45;
        const dirAng = (facing >= 0 ? 0 : Math.PI) + spreadAng;
        const spd = 3.5 + Math.random() * 8.5;
        particlesRef.current.push({
          x,
          y: y + (Math.random() - 0.5) * 32,
          vx: Math.cos(dirAng) * spd,
          vy: Math.sin(dirAng) * spd - 1.5,
          life: 0.35 + Math.random() * 0.32,
          maxLife: 0.67,
          color: i % 4 === 0 && accentColor ? accentColor : '#120d0a',
          size: 4 + Math.random() * 6,
          gravity: 0.14,
          kind: 'INK',
        });
      }
    };

    // ★ 32비트 픽셀아트 VFX 스프라이트 시트 전용 스포너 (코드 도형 대체!) ★
    const spawnVfxAnim = (opts: {
      x: number;
      y: number;
      sheetSrc: string;
      frameSeq: number[];
      scale?: number;
      flipX?: number;
      rotation?: number;
      duration?: number;
      vx?: number;
      vy?: number;
    }) => {
      const dur = opts.duration ?? 0.42;
      vfxSpritesRef.current.push({
        x: opts.x,
        y: opts.y,
        vx: opts.vx ?? 0,
        vy: opts.vy ?? 0,
        sheetSrc: opts.sheetSrc,
        vfxIdx: opts.frameSeq[0] ?? 0,
        frameSeq: opts.frameSeq,
        scale: opts.scale ?? 1.2,
        flipX: opts.flipX ?? 1,
        rotation: opts.rotation ?? 0,
        life: dur,
        maxLife: dur,
      });
    };

    // 초승달/대참격/일섬 픽셀 스프라이트 검궤
    const spawnBladeArc = (x: number, y: number, facing: number, _color: string, radius: number, _thickness: number, reverse = false) => {
      const idx = radius >= 95 ? 2 : radius >= 80 ? 1 : 0;
      spawnVfxAnim({
        x,
        y,
        sheetSrc: VFX_SHEETS.SLASH_PARRY,
        frameSeq: [idx],
        scale: 0.95 + Math.min(0.65, (radius - 60) / 80),
        flipX: facing,
        rotation: reverse ? 0.35 * facing : 0,
        duration: 0.28,
        vx: facing * 24,
      });
    };

    // 4방향 십자 별빛 섬광 픽셀 스프라이트 (간파·강타·KO!)
    const spawnCrossFlare = (x: number, y: number, size: number, _color: string) => {
      const isHuge = size >= 95;
      spawnVfxAnim({
        x,
        y,
        sheetSrc: isHuge ? VFX_SHEETS.QI_FINISHER : VFX_SHEETS.SLASH_PARRY,
        frameSeq: isHuge ? [5, 6, 7] : [4],
        scale: Math.max(0.7, size / 84),
        duration: isHuge ? 0.42 : 0.24,
      });
    };

    // 발밑 지면 균열 암석 폭발 픽셀 스프라이트
    const spawnGroundCrack = (x: number, scale = 1.0, _color = '#fbbf24') => {
      spawnVfxAnim({
        x,
        y: GROUND_Y - 46,
        sheetSrc: VFX_SHEETS.SLASH_PARRY,
        frameSeq: [7],
        scale: 1.05 * scale,
        duration: 0.48,
      });
    };

    const spawnDust = (x: number, facing: number) => {
      for (let i = 0; i < 6; i++) {
        particlesRef.current.push({
          x: x - facing * (12 + Math.random() * 18),
          y: GROUND_Y - 4 - Math.random() * 10,
          vx: -facing * (1.2 + Math.random() * 2.5),
          vy: -0.6 - Math.random() * 1.4,
          life: 0.25 + Math.random() * 0.2,
          maxLife: 0.45,
          color: '#d6c3a5',
          size: 5,
          gravity: -0.02,
        });
      }
    };

    const spawnGhostTrail = (f: FighterRuntime, opp: FighterRuntime, isP: boolean, frameIdx: number, count: number, tint: string) => {
      const sheetSrc = isP ? heroGridSrc : enemyGridSrc;
      const nativeDir = isP ? heroNativeDir : -1;
      const wantDir = opp.x >= f.x ? 1 : -1;
      const flipX = nativeDir === wantDir ? 1 : -1;
      const dir = wantDir;
      for (let i = 0; i < count; i++) {
        ghostsRef.current.push({
          x: f.x - dir * (18 + i * 22),
          y: GROUND_Y,
          frameIdx,
          sheetSrc,
          flipX,
          tint,
          life: 0.22 + i * 0.06,
          maxLife: 0.28 + i * 0.06,
        });
      }
    };

    const getReach = (sk: Skill, prof: SkillVfxProfile) => {
      if (prof.isRangedWave) return 560;
      return sk.range === 'FAR' ? 520 : sk.range === 'MID' ? 245 : 168;
    };

    const computeDamage = (atk: FighterRuntime, def: FighterRuntime, sk: Skill, atkIsP: boolean, now: number, isCounterRiposte: boolean) => {
      const wAtk = atk.weapon ? atk.weapon.attack + atk.weapon.upgradeLevel * 4 : 12;
      const noPenalty = sk.imprintedTraits.some((t) => t.effect.noWeaponPenalty);
      const aff =
        !atk.weapon || sk.weapon === 'ANY' || sk.masteryLevel >= 8 || noPenalty
          ? 1.15
          : atk.weapon.group === sk.weapon
          ? atk.weapon.elementAffinity === sk.element
            ? 1.35
            : 1.15
          : 0.85;
      const traitDmgMult = sk.imprintedTraits.reduce((acc, t) => acc * (t.effect.damageMult || 1), 1);
      const base = sk.power * (1 + sk.masteryLevel * 0.13) * aff * traitDmgMult;
      const statAdd =
        sk.element !== 'PHYSICAL'
          ? atk.stats.wil * 0.65 + atk.stats.qi * 1.05 + wAtk * 0.6
          : atk.stats.str * 0.75 + wAtk * 0.85;
      const tacticAtk = atkIsP ? (state.battleTactic === 'AGGRESSIVE' ? 1.12 : state.battleTactic === 'COUNTER' ? 0.92 : 1.0) : 1.0;
      const counterTraitMult = sk.imprintedTraits.reduce((m, t) => Math.max(m, t.effect.counterMult || 1.55), 1.55);
      const execThreshold = sk.imprintedTraits.reduce((m, t) => Math.max(m, t.effect.executeThreshold || 0), 0);
      const execMult = execThreshold > 0 && def.hp / def.maxHp <= execThreshold ? 1.6 : 1.0;
      const mult = Math.min(
        2.75,
        tacticAtk *
          (1 + (atk.passiveBonus?.allDmg || 0)) *
          (isCounterRiposte || now < atk.counterBuffUntil ? counterTraitMult : 1.0) *
          (now < def.groggyUntil ? 1.38 : 1.0) *
          (atk.hasOneArmSaint ? 1.25 : 1.0) *
          execMult
      );
      // 방어자 호신강기 피해 경감 + 운기 심법 각인 피해 경감!
      const armorPierce = sk.imprintedTraits.reduce((m, t) => Math.max(m, t.effect.armorPierce || 0), 0);
      const rawDefReduce = Math.min(0.5, Math.max(0, (def.stats.vit + def.stats.qi - 55) * 0.0023) + (def.passiveBonus?.dmgReduce || 0));
      const elemBypass = sk.element !== 'PHYSICAL' ? 0.6 : 1.0;
      const defReduce = rawDefReduce * elemBypass * (1 - armorPierce * 0.65);
      return Math.max(8, Math.round((base + statAdd) * mult * (1 - defReduce) * 0.6));
    };

    const applyImpact = (
      atk: FighterRuntime,
      def: FighterRuntime,
      sk: Skill,
      atkIsP: boolean,
      now: number,
      prof: SkillVfxProfile,
      isCounterRiposte: boolean,
      hitScale = 1.0,
      isSecondHit = false,
      counterChain = 0
    ) => {
      const facing = def.x >= atk.x ? 1 : -1;
      // 원소 폭발이 따로 터지는 기술인가 (그렇다면 그것이 주인공이므로 다른 장식은 줄인다)
      const hasElementBurst =
        sk.element === 'FIRE' || sk.element === 'LIGHTNING' || sk.element === 'ICE' || sk.element === 'SHADOW' || !!sk.isForbidden || (sk.element === 'QI' && prof.tier >= 2);
      const chainBonus = isCounterRiposte && counterChain > 1 ? 1 + Math.min(4, counterChain - 1) * 0.14 : 1.0;
      // ★ 목검은 한 대가 가볍고, 진검은 무겁다. 진검은 깨끗이 들어간 일격이 치명상(致命傷)이 되기도 한다.
      const isReal = battle.isRealDuel;
      let dmg = Math.max(isReal ? 6 : 3, Math.round(computeDamage(atk, def, sk, atkIsP, now, isCounterRiposte) * hitScale * chainBonus * bladeDamageMult(isReal)));
      let isFatal = false;
      // 무사수행에서 자비로운 상대(MERCY)는 주인공에게 치명상을 넣지 않는다.
      const enemySpares = !atkIsP && battle.journeyStakes === 'MERCY';
      if (isReal && !enemySpares && def.hp > 0 && Math.random() < fatalBlowChance(atk.stats, def.stats, true, isCounterRiposte) * (isSecondHit ? 0.5 : 1)) {
        dmg = Math.max(dmg, fatalBlowDamage(def.maxHp, def.stats));
        isFatal = true;
        if (atkIsP) metaRef.current.fatalDealt += 1;
        else metaRef.current.fatalTaken += 1;
      }

      def.hp = Math.max(0, def.hp - dmg);
      if (isFatal) {
        // 피가 튀고 화면이 붉게 멎는다
        metaRef.current.timeSlowUntil = now + 420;
        metaRef.current.timeSlowColor = '#7f1d1d';
        metaRef.current.inkFlashUntil = now + 180;
        spawnInkSplatter(def.x, 252, facing, 22, '#b91c1c');
        pushFloat({ x: def.x, y: FLOAT_STATUS_Y, text: '치명상!', color: '#ef4444', life: 1.2, maxLife: 1.2, scale: 1.5 });
      }
      def.hurtFlashUntil = now + HIT_FLASH_MS;
      def.hurtPoseUntil = now + (isCounterRiposte ? 380 : 260);
      const knock = (isCounterRiposte ? 34 : prof.isArmorBreak ? 28 : 16) * (isSecondHit ? 0.7 : 1);
      const beforeKnockX = def.x;
      def.x = Math.max(92, Math.min(CANVAS_W - 92, def.x + facing * knock));
      // 판정상 위치는 바로 옮기되, 화면에서는 히트스톱이 풀린 뒤 밀려나도록 보정값을 남긴다.
      def.recoilOffset += beforeKnockX - def.x;

      const postureDmg = Math.round((sk.postureDamage || 16) * (prof.isArmorBreak ? 1.8 : 1.0));
      def.posture = Math.max(0, def.posture - postureDmg);
      if (def.posture <= 0) {
        def.groggyUntil = now + 1350;
        def.posture = def.maxPosture;
        sound.playGuardBreak(panAt(def.x));
        // 체세 붕괴 산산조각 방패 파편 + 지면 균열 암석 폭발 스프라이트!
        spawnVfxAnim({ x: def.x, y: 248, sheetSrc: VFX_SHEETS.SLASH_PARRY, frameSeq: [6], scale: 1.2, duration: 0.4 });
        if (!hasElementBurst) spawnGroundCrack(def.x, 1.15, '#fb923c');
        spawnSparks(def.x, 250, '#fb923c', 14, 12);
        pushFloat({ x: def.x, y: FLOAT_STATUS_Y, text: '체세 붕괴!', color: '#fb923c', life: 0.9, maxLife: 0.9, scale: 1.25 });
      }

      // 히트스톱 & 쉐이크 & 먹물 일섬 암전!
      metaRef.current.hitstopUntil = Math.max(metaRef.current.hitstopUntil, now + prof.hitstopMs);
      metaRef.current.shakeUntil = now + (prof.tier >= 3 || isCounterRiposte ? 210 : 125);
      metaRef.current.shakePower = isCounterRiposte ? 14 : prof.tier >= 4 ? 13 : prof.tier >= 3 ? 10 : 6;
      if (prof.tier >= 4 || isCounterRiposte || prof.isExecute) {
        metaRef.current.inkFlashUntil = now + 130;
      }

      // ★ 32비트 8프레임 초매끄러운 픽셀아트 VFX 스프라이트 타격 연출! ★
      const attackerIsUnarmed =
        (atkIsP ? heroGridSrc.includes('unarmed') : enemyGridSrc.includes('unarmed')) ||
        sk.weapon === 'UNARMED' ||
        sk.form === 'STRIKE' ||
        sk.form === 'GRAPPLE';

      // 겹쳐 그리는 장수를 줄인다: [주 타격 한 장] + [접점의 짧은 섬광] + (원소 기술이면 원소 폭발)만 기본으로 두고,
      // 진홍 일섬·큰 별빛·지면 균열은 반격·처형·체세 파괴 같은 특별한 순간에만 얹는다.
      const heavyHit = isCounterRiposte || prof.isExecute;
      const strikeScale = hasElementBurst ? 0.82 : 1.0;

      if (attackerIsUnarmed) {
        spawnVfxAnim({
          x: def.x - facing * 12,
          y: 254 + (isSecondHit ? 10 : 0),
          vx: facing * 22,
          sheetSrc: VFX_SHEETS.SLASH_PARRY,
          frameSeq: [3],
          // 주먹·발이 닿은 자리의 충격파. 몸 전체를 덮지 않도록 가슴께 크기로 둔다.
          scale: prof.scale * 0.62 * strikeScale,
          flipX: facing,
          duration: 0.24,
        });
      } else {
        // 도검 참격: 8프레임 초승달 (2타는 각도를 틀어 다른 궤적으로)
        spawnVfxAnim({
          x: def.x - facing * 14,
          y: 254 + (isSecondHit ? 10 : 0),
          vx: facing * 28,
          sheetSrc: VFX_SHEETS.SLASH_8F,
          frameSeq: SEQ_8F,
          scale: prof.scale * (heavyHit ? 1.16 : 1.06) * (isSecondHit ? 0.92 : 1.0) * strikeScale,
          flipX: facing,
          rotation: isSecondHit ? 0.38 * facing : 0,
          duration: 0.27,
        });
        if (heavyHit) {
          // 반격·처형: 진홍 일섬을 한 박자 얹는다
          spawnVfxAnim({
            x: def.x,
            y: 252,
            sheetSrc: VFX_SHEETS.SLASH_PARRY,
            frameSeq: [2],
            scale: prof.scale * 1.05,
            flipX: facing,
            duration: 0.22,
          });
        }
      }

      if (heavyHit) {
        spawnCrossFlare(def.x, 250, isCounterRiposte ? 84 : 72, isCounterRiposte ? '#fde047' : prof.color);
      } else if (!hasElementBurst) {
        // 칼끝이 닿은 자리의 짧은 섬광 (숙련도가 높을수록 조금 크게)
        spawnVfxAnim({
          x: def.x - facing * 10,
          y: 248 + (isSecondHit ? 12 : 0),
          sheetSrc: VFX_SHEETS.LEGACY,
          frameSeq: [7],
          scale: 0.28 + prof.tier * 0.07,
          duration: 0.13,
        });
      }
      if (prof.tier >= 3 || heavyHit) {
        spawnInkSplatter(def.x, 256, facing, isCounterRiposte ? 16 : 10, prof.color);
      }

      if ((prof.isArmorBreak || isCounterRiposte) && !hasElementBurst) {
        spawnGroundCrack(def.x, isCounterRiposte ? 1.15 : 1.0, isCounterRiposte ? '#fde047' : prof.color);
      }
      if (prof.isArmorBreak || prof.tier >= 4 || isCounterRiposte) {
        spawnDust(def.x, facing);
        spawnDust(def.x, -facing);
      }

      // 5원소 8프레임 픽셀아트 애니메이션
      if (hasElementBurst) {
        if (sk.isForbidden || sk.element === 'SHADOW') {
          spawnVfxAnim({ x: def.x, y: 242, sheetSrc: VFX_SHEETS.SHADOW_8F, frameSeq: SEQ_8F, scale: 1.5, duration: 0.46 });
        } else if (sk.element === 'FIRE') {
          spawnVfxAnim({ x: def.x, y: 222, sheetSrc: VFX_SHEETS.FIRE_8F, frameSeq: SEQ_8F, scale: 1.56, duration: 0.46 });
        } else if (sk.element === 'LIGHTNING') {
          spawnVfxAnim({ x: def.x, y: 214, sheetSrc: VFX_SHEETS.LIGHTNING_8F, frameSeq: SEQ_8F, scale: 1.62, duration: 0.42 });
        } else if (sk.element === 'ICE') {
          spawnVfxAnim({ x: def.x, y: 242, sheetSrc: VFX_SHEETS.ICE_8F, frameSeq: SEQ_8F, scale: 1.48, duration: 0.46 });
        } else {
          spawnVfxAnim({ x: def.x, y: 226, sheetSrc: VFX_SHEETS.QI_8F, frameSeq: SEQ_8F, scale: 1.52, duration: 0.46 });
        }
      }

      // ★ 극의 필살 반격 「암전 일섬 연참(9연참 검흔 + 잔상 교차 + 납도 정적 → 폭발!)」 — 오직 대고수 경지(Lv.8+ & 통찰55+ / 3합연환 / Lv.9각인)에서만 해금! ★
      const isSupremeCounterMaster =
        sk.masteryLevel >= 8 &&
        (atk.stats.ins >= 55 || counterChain >= 3 || sk.imprintedTraits.some((t) => t.tier >= 9));

      if (isCounterRiposte && isSupremeCounterMaster) {
        // 주인공이 적의 등 뒤로 순간 교차 통과!
        atk.x = Math.max(92, Math.min(CANVAS_W - 92, def.x + facing * 125));
        darkFlurryRef.current = createDarkFlurry(
          now,
          def.x,
          248,
          facing,
          `${atk.sectTitle} ${sk.masteryLevel >= 10 ? '극의 ' : ''}절명 연참 · 【${sk.customName || sk.name}】`
        );
        metaRef.current.hitstopUntil = Math.max(metaRef.current.hitstopUntil, now + 980);
      }

      const hitPan = panAt(def.x);
      if (isCounterRiposte) {
        sound.playCounterImpact(hitPan);
      } else {
        sound.playHit(prof.tier >= 3 || prof.isArmorBreak || prof.isExecute, {
          pan: hitPan,
          unarmed: attackerIsUnarmed,
          tier: prof.tier,
          element: sk.element,
        });
        if (sk.element !== 'PHYSICAL' || sk.origin.includes('FANTASY')) {
          sound.playMagic(sk.element === 'PHYSICAL' ? 'QI' : sk.element, hitPan);
        }
      }

      // 파편과 쇠불꽃은 맞은 쪽에서 때린 방향으로 쏠려 튄다. 원소 폭발이 있으면 수를 줄인다.
      const debrisMult = hasElementBurst ? 0.5 : 1;
      spawnParticles(def.x, 255, sk.element === 'PHYSICAL' && !isCounterRiposte ? '#fca5a5' : prof.color, Math.round(prof.particles * 0.7 * debrisMult), 6.5, 0.16, facing);
      spawnSparks(
        def.x,
        255,
        isCounterRiposte ? '#fde047' : sk.element === 'PHYSICAL' ? '#fed7aa' : prof.color,
        Math.round((isCounterRiposte ? 18 : 7 + prof.tier * 3) * debrisMult),
        isCounterRiposte ? 13 : 9 + prof.tier,
        facing
      );

      const dmgLabel = isFatal ? `-${dmg}` : isCounterRiposte ? `반격 -${dmg}!` : isSecondHit ? `연격 -${dmg}` : `-${dmg}`;
      pushFloat({
        x: def.x + facing * 62,
        y: FLOAT_DAMAGE_Y,
        text: dmgLabel,
        color: isCounterRiposte ? '#fde047' : prof.tier >= 3 ? prof.color : '#fca5a5',
        life: 0.9,
        maxLife: 0.9,
        scale: isCounterRiposte ? 1.4 : prof.tier >= 3 ? 1.2 : 1.0,
      });

      const nm = sk.customName || sk.name;
      pushLog(
        isFatal
          ? `☠ ${atk.name}의 「${nm}」이(가) ${def.name}의 급소를 갈랐다! 치명상! (${dmg} 피해)`
          : isCounterRiposte
          ? `★ 【${atk.sectTitle}】 반격 · ${nm} 작렬!! (${dmg} 치명 피해)`
          : `${atk.name}, 「${nm}」 ${isSecondHit ? '2연격 ' : ''}명중! (${dmg} 피해)`
      );
    };

    const launchSkill = (
      f: FighterRuntime,
      opp: FighterRuntime,
      sk: Skill,
      formNumber: number,
      isP: boolean,
      now: number,
      isCounterRiposte = false,
      counterChain = 0
    ) => {
      const prof = getSkillVfxProfile(sk, isCounterRiposte);
      const haste = f.passives.includes('sk_fn_04') ? 0.78 : 1.0;
      const traitWindup = sk.imprintedTraits.reduce((acc, t) => acc * (t.effect.windupMult || 1), 1);
      const traitCd = sk.imprintedTraits.reduce((acc, t) => acc * (t.effect.cooldownMult || 1), 1);
      const spd = Math.max(0.62, Math.min(1.25, 1.32 - f.stats.agi * 0.006)) * haste * traitWindup;

      const stepInMs = isCounterRiposte ? 55 : Math.max(85, Math.round(135 * spd));
      const windupMs = isCounterRiposte ? 95 : Math.max(130, Math.round(sk.windupMs * 0.78 * spd));
      const strikeMs = 150;
      const combo2Ms = prof.isMultiHit ? 175 : 0;
      const recoveryMs = Math.max(170, Math.round(sk.recoveryMs * 0.72 * spd));
      const cd = Math.max(820, Math.round(sk.cooldownMs * spd * traitCd));

      if (!isCounterRiposte) {
        f.qi = Math.max(0, f.qi - sk.qiCost);
        f.cooldowns[sk.id] = now + cd;
      }
      f.blockingUntil = 0;

      // ★ 문파명 + N식 + 기술명 외침 (연환 반격 시 몇 합인지 함께 외침!) ★
      const skillLabel = sk.customName || sk.name;
      const callout = isCounterRiposte
        ? counterChain >= 2
          ? `${f.sectTitle} ${counterChain}합 재반격 · ${skillLabel}!`
          : `${f.sectTitle} 반격 · ${skillLabel}!`
        : `${f.sectTitle} ${formNumber}식 · ${skillLabel}!`;
      f.shoutText = callout;
      f.shoutSub = prof.traitCallout || (sk.masteryLevel >= 10 ? '극의(極意)' : sk.masteryLevel >= 6 ? `Lv.${sk.masteryLevel} 오의` : '');
      f.shoutUntil = now + (isCounterRiposte ? 1050 : 880);
      f.shoutIsCounter = isCounterRiposte;

      sound.playUnsheathe(panAt(f.x));
      // 객석 관전에서는 왼쪽 무사도 남이다. 그가 쓴 술법·금기를 내 기록으로 세지 않는다.
      if (isP && !battle.spectatorMode) {
        if (sk.origin.includes('FANTASY')) metaRef.current.usedMagic = true;
        if (sk.isForbidden) {
          metaRef.current.usedForbidden = true;
          if (sk.selfRecoil?.hpPercent) f.hp = Math.max(1, f.hp - Math.round(f.maxHp * sk.selfRecoil.hpPercent));
          if (sk.selfRecoil?.healthLoss) metaRef.current.recoilHealthLoss += sk.selfRecoil.healthLoss;
          if (sk.selfRecoil?.lifespanYears) metaRef.current.recoilLifespanYears += sk.selfRecoil.lifespanYears;
        }
      }

      if (prof.isApexCutin) {
        metaRef.current.cutinSect = isCounterRiposte ? `★ 간파 반격 · ${f.sectTitle}` : `${f.sectTitle} 제${formNumber}식`;
        metaRef.current.cutinSkill = `【${skillLabel}】`;
        metaRef.current.cutinTrait = prof.traitCallout;
        metaRef.current.cutinColor = isCounterRiposte ? '#fde047' : prof.color;
        metaRef.current.cutinUntil = now + (isCounterRiposte ? 760 : 680);
        // ★ 극한 필살기(Lv.9~10 / 금기 / 절정 오의) 발동 시 순간 타임 슬로우(Time Dilation)! ★
        if (prof.tier >= 4 || sk.isForbidden || sk.origin.includes('FANTASY')) {
          metaRef.current.timeSlowUntil = now + 460;
          metaRef.current.timeSlowColor = prof.color;
          sound.playTimeSlow();
        }
      }

      if (sk.form === 'STEP') {
        f.invulnUntil = now + 380;
        const dir = opp.x >= f.x ? 1 : -1;
        spawnGhostTrail(f, opp, isP, 1, 3, '#67e8f9');
        f.x = Math.max(95, Math.min(CANVAS_W - 95, f.x + dir * 135));
        sound.playDash(panAt(f.x));
        if (sk.power <= 0) return;
      }

      f.action = {
        skill: sk,
        formNumber,
        isCounterRiposte,
        counterChain,
        startAt: now,
        stepInMs,
        windupMs,
        strikeMs,
        combo2Ms,
        recoveryMs,
        stepInDone: false,
        hit1Done: false,
        hit2Done: false,
      };
    };

    const resolveStrike = (atk: FighterRuntime, def: FighterRuntime, act: FighterAction, atkIsP: boolean, now: number, isSecondHit = false) => {
      const sk = act.skill;
      const prof = getSkillVfxProfile(sk, Boolean(act.isCounterRiposte));
      const dist = Math.abs(atk.x - def.x);
      const facing = def.x >= atk.x ? 1 : -1;

      atk.lungeOffset = facing * (act.isCounterRiposte ? 48 : isSecondHit ? 28 : 38);
      spawnDust(atk.x, facing);
      if (prof.afterimages > 0) {
        spawnGhostTrail(
          atk,
          def,
          atkIsP,
          act.isCounterRiposte ? 6 : isSecondHit ? 4 : 3,
          prof.afterimages,
          act.isCounterRiposte ? '#fde047' : prof.isSwift ? '#67e8f9' : prof.color
        );
      }

      const swingUnarmed =
        (atkIsP ? heroGridSrc.includes('unarmed') : enemyGridSrc.includes('unarmed')) ||
        sk.weapon === 'UNARMED' ||
        sk.form === 'STRIKE' ||
        sk.form === 'GRAPPLE';
      const swingPan = panAt(atk.x);
      if (sk.origin.includes('FANTASY')) sound.playMagic(sk.element, swingPan);
      else sound.playSlash(prof.tier >= 3 || prof.isArmorBreak, { pan: swingPan, unarmed: swingUnarmed, tier: prof.tier });

      // 원거리 검기 파동(PROJECTILE 또는 rangeExtend 각인)은 실제 투사체가 날아감!
      if (prof.isRangedWave && !isSecondHit && dist > 150) {
        const dmg = computeDamage(atk, def, sk, atkIsP, now, Boolean(act.isCounterRiposte));
        wavesRef.current.push({
          x: atk.x + facing * 64,
          y: 256,
          vx: facing * 560,
          facing,
          vfxIdx: prof.vfxIdx,
          color: prof.color,
          scale: prof.scale,
          fromPlayer: atkIsP,
          skill: sk,
          dmg,
          hit: false,
          life: 0.9,
        });
        return;
      }

      // 근접 검기 스윙 VFX (반격 일섬은 간파 직후 파고드므로 최소 사거리 188px 보장!)
      const effectiveReach = act.isCounterRiposte ? Math.max(188, getReach(sk, prof)) : getReach(sk, prof);
      if (dist > effectiveReach) {
        spawnVfxAnim({
          x: atk.x + facing * 75,
          y: 255,
          vx: facing * 40,
          sheetSrc: VFX_SHEETS.SLASH_PARRY,
          frameSeq: [swingUnarmed ? 3 : prof.tier >= 3 ? 1 : 0],
          scale: prof.scale * 0.88,
          flipX: facing,
          duration: 0.24,
        });
        return;
      }

      // ★ 가속 정교 연환 공방(Progressive Precision Counter Chain, 최대 8합!) ★
      // 1~2합은 맞칼 기세로 반격의 반격이 활발하게 터지고, 3~7합으로 깊어질수록 통찰·민첩·정신·영력·반격기 숙련도의 정교한 능력치 격차로 결판!
      const curChain = act.counterChain || 0;
      // 극의 초식은 극의에 이르지 못한 자가 읽을 수 없다 — 피하는 수밖에 없다.
      const isTranscendStrike = isUnparryableByTranscendence(sk, !!def.transcended);
      const isUnblockable = sk.imprintedTraits.some((t) => t.effect.unblockable) || isTranscendStrike;
      const grandmasterCanDeflectCounter = Boolean(act.isCounterRiposte) && def.stats.ins >= 65;
      if (!isSecondHit && curChain < 8) {
        const defParrySkills = def.skills.filter(
          (s) => s.form === 'PARRY' || s.imprintedTraits.some((t) => Boolean(t.effect.counterMult) || Boolean(t.effect.parryWindowBonus))
        );
        const atkParrySkills = atk.skills.filter(
          (s) => s.form === 'PARRY' || s.imprintedTraits.some((t) => Boolean(t.effect.counterMult) || Boolean(t.effect.parryWindowBonus))
        );
        const parryCount = defParrySkills.length;
        const bestParryLv = parryCount > 0 ? Math.max(...defParrySkills.map((s) => s.masteryLevel || 1)) : Math.max(1, Math.round(def.stats.ins / 12));
        const atkBestLv = atkParrySkills.length > 0 ? Math.max(...atkParrySkills.map((s) => s.masteryLevel || 1)) : Math.max(1, sk.masteryLevel || 1);
        const parryTraitBonus = Math.min(
          0.14,
          defParrySkills.reduce(
            (acc, s) => acc + s.imprintedTraits.reduce((a, t) => a + (t.effect.parryWindowBonus ? 0.06 : t.effect.counterMult ? 0.03 : 0), 0),
            0
          )
        );
        const parrySkillBonus = parryCount >= 3 ? 0.22 : parryCount === 2 ? 0.16 : parryCount === 1 ? 0.1 : 0;
        const tacticParryBonus = !atkIsP ? (state.battleTactic === 'COUNTER' ? 0.14 : state.battleTactic === 'AGGRESSIVE' ? -0.05 : 0) : 0;

        let parryChance: number;
        if (curChain === 0) {
          // 1합 진입 판정
          const insGap = (def.stats.ins - atk.stats.ins) * 0.0028;
          const parryLvBonus = parryCount > 0 ? bestParryLv * 0.013 : 0;
          parryChance = Math.max(
            0.06,
            Math.min(
              0.76,
              0.13 +
                def.stats.ins * 0.0038 +
                insGap +
                tacticParryBonus +
                parrySkillBonus +
                parryLvBonus +
                parryTraitBonus +
                (def.passiveBonus?.parry || 0) +
                (def.hasMindEye ? 0.18 : 0)
            )
          );
        } else {
          // 2합 이상 연환 공방: 초반(1~2합)은 맞칼 기세로 빈번하게 주고받고, 깊어질수록 정교한 다중 능력치 격차 증폭!
          const clashMomentum =
            curChain === 1 ? 0.28 : curChain === 2 ? 0.14 : curChain === 3 ? 0.0 : -(curChain - 3) * 0.15;
          const precisionScale = 1 + (curChain - 1) * 0.55;
          const insDiff = (def.stats.ins - atk.stats.ins) * 0.0035 * precisionScale;
          const agiDiff = curChain >= 2 ? (def.stats.agi - atk.stats.agi) * 0.0022 * (curChain - 1) : 0;
          const mindDiff =
            curChain >= 4 ? (def.stats.wil + def.stats.qi - (atk.stats.wil + atk.stats.qi)) * 0.0018 * (curChain - 3) : 0;
          const lvDiff = (bestParryLv - atkBestLv) * 0.014 * precisionScale;
          const parryAdv = parrySkillBonus * (curChain >= 2 ? 1.25 : 1.0);
          parryChance = Math.max(
            0.05,
            Math.min(
              0.84,
              0.24 +
                def.stats.ins * 0.0026 +
                clashMomentum +
                insDiff +
                agiDiff +
                mindDiff +
                lvDiff +
                parryAdv +
                parryTraitBonus +
                (def.passiveBonus?.parry || 0) +
                (!atkIsP && state.battleTactic === 'COUNTER' ? 0.08 : 0) +
                (def.hasMindEye ? 0.12 : 0)
            )
          );
        }
        // 경지의 차이: 극의를 지닌 쪽이 상대의 수를 먼저 읽는다.
        parryChance = applyTranscendParry(parryChance, !!atk.transcended, !!def.transcended);
        const dodgeChance = Math.max(0.06, Math.min(0.62, 0.1 + def.stats.agi * 0.0046 + (def.stats.agi - atk.stats.agi) * 0.002));

        const blocksPrevented = (sk.telegraph === 'RED' || isUnblockable) && !(grandmasterCanDeflectCounter && !isTranscendStrike);

        // 적색 방어불가 강공 → 패링 불가! 오직 민첩 회피만 가능 (반격 위주 고수 상대 핵심 전략!)
        if (blocksPrevented && Math.random() < dodgeChance) {
          def.invulnUntil = now + 260;
          spawnGhostTrail(def, atk, !atkIsP, 1, 2, '#38bdf8');
          def.x = Math.max(92, Math.min(CANVAS_W - 92, def.x + facing * 78));
          sound.playDash(panAt(def.x));
          pushFloat({ x: def.x, y: FLOAT_STATUS_Y, text: '허공 보법 회피!', color: '#38bdf8', life: 0.78, maxLife: 0.78 });
          pushLog(`${def.name}, ${sk.customName || sk.name}의 강공을 종이 한 장 차이로 회피!`);
          return;
        }

        // ★ 간파(看破) 성공 → 연환 재반격(Counter Chain + 1)!! ★
        const effectiveParry = grandmasterCanDeflectCounter && (sk.telegraph === 'RED' || isUnblockable) ? parryChance * 0.72 : parryChance;
        if (!blocksPrevented && Math.random() < effectiveParry) {
          const nextChain = curChain + 1;
          def.blockingUntil = now + 220;
          def.clashPoseUntil = 0;
          def.action = null;
          atk.action = null;
          // 막힌 쪽은 맞은 것이 아니다: 칼을 내지른 자세 그대로 맞물려 버티다가 튕겨 나온다. (잠깐 다음 수를 내지 못할 뿐)
          atk.clashFrame = act.isCounterRiposte || sk.form === 'THRUST' || sk.form === 'STRIKE' || sk.form === 'GRAPPLE' ? 6 : sk.form === 'STEP' ? 4 : 3;
          atk.clashPoseUntil = now + 250;
          atk.stunUntil = Math.max(atk.stunUntil, now + 180);
          atk.posture = Math.max(0, atk.posture - (34 + nextChain * 6));
          def.qi = Math.min(def.maxQi, def.qi + 16);
          def.counterBuffUntil = now + 2200;

          // 칼이 맞부딪히면 두 사람 모두 한 발씩 밀려난다. 반격하는 쪽이 매번 42px씩 파고들기 때문에,
          // 이렇게 벌려 주지 않으면 연환이 길어질수록 두 사람이 한 몸처럼 겹쳐 버린다.
          const atkX0 = atk.x;
          const defX0 = def.x;
          atk.x = Math.max(92, Math.min(CANVAS_W - 92, atk.x - facing * 24));
          // 한쪽이 무대 끝에 몰려 물러설 자리가 없으면, 못 물러난 만큼 다른 쪽이 더 밀려난다.
          const blocked = 24 - Math.abs(atk.x - atkX0);
          def.x = Math.max(92, Math.min(CANVAS_W - 92, def.x + facing * (18 + blocked)));
          if (Math.abs(def.x - defX0) < 18) {
            atk.x = Math.max(92, Math.min(CANVAS_W - 92, atk.x - facing * (18 - Math.abs(def.x - defX0))));
          }
          atk.recoilOffset += atkX0 - atk.x;
          def.recoilOffset += defX0 - def.x;
          atk.lungeOffset *= 0.4;

          const clashX = Math.round((atkX0 + defX0) / 2);
          sound.playParry(true, nextChain, panAt(clashX));
          // 패링은 짧고 경쾌하게: 히트스톱은 한 박자만, 화면은 살짝만 떨고, 맞부딪힌 자리에서 쇠불꽃이 튄다.
          // 합이 깊어질수록 불꽃이 커지고 박자는 조금씩 빨라진다.
          // "챙!" — 맞부딪힌 순간 짧게 멈추고, 이어서 슬로모션으로 풀린다. 불꽃은 그 사이에 느리게 터져 나온다.
          const pause = getClashPause(nextChain);
          metaRef.current.hitstopUntil = now + pause.freezeMs;
          metaRef.current.clashSlowUntil = now + pause.freezeMs + pause.slowMs;
          metaRef.current.parryFlashStart = now;
          metaRef.current.parryChain = nextChain;
          metaRef.current.parryFlashUntil = now + pause.freezeMs + pause.slowMs + 160;
          metaRef.current.shakeUntil = now + 150;
          metaRef.current.shakePower = Math.min(13, 5 + nextChain * 1.4);
          if (!atkIsP && !battle.spectatorMode) metaRef.current.justParries += 1;

          deflectsRef.current.push(createDeflectSpark(clashX, 236, facing, nextChain));

          // 반격 초식을 번갈아 꺼내며 가속 연환 반격 예약!
          const counterSkill = parryCount > 0 ? defParrySkills[(nextChain - 1) % parryCount] : def.skills[0];
          const counterIdx = Math.max(1, def.skills.findIndex((s) => s.id === counterSkill?.id) + 1);
          const triggerGap = Math.max(75, 155 - nextChain * 18);
          if (counterSkill && (parryCount > 0 || nextChain >= 1 || (!atkIsP && state.battleTactic === 'COUNTER'))) {
            def.pendingCounter = { skill: counterSkill, formNum: counterIdx, triggerAt: now + triggerGap, chain: nextChain };
            pushLog(
              nextChain >= 2
                ? `⚔ [${nextChain}합 연환 공방!] ${def.name}, 반격을 다시 흘려내며 재반격!!`
                : `★ ${def.name}, 적의 초식을 찰나에 흘려내며 반격 태세 돌입!`
            );
          } else {
            pushLog(`★ ${def.name}, 통찰의 경지로 공격을 완벽히 간파(看破)했다!`);
          }

          if (atk.posture <= 0) {
            atk.groggyUntil = now + 1350;
            atk.posture = atk.maxPosture;
          }
          return;
        }
      }

      // 명중 처리! (2연타 기술이면 1타 62% + 2타 52%)
      const scale = prof.isMultiHit ? (isSecondHit ? 0.52 : 0.62) : 1.0;
      applyImpact(atk, def, sk, atkIsP, now, prof, Boolean(act.isCounterRiposte), scale, isSecondHit, curChain);
    };

    const tick = (now: number) => {
      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      // 칼이 맞부딪힌 직후에는 정지(히트스톱)에 이어 잠깐 슬로모션이 걸린다 — "챙!" 하고 멈췄다 풀리는 박자
      const inClashSlow = now >= metaRef.current.hitstopUntil && now < metaRef.current.clashSlowUntil;
      const timeScale =
        now < metaRef.current.hitstopUntil
          ? 0.08
          : inClashSlow
          ? 0.3
          : now < metaRef.current.timeSlowUntil
          ? 0.24
          : 1.0;
      const dt = rawDt * timeScale * speedRef.current;
      // 히트스톱 동안 싸우는 두 사람은 멈추지만, 이펙트와 파편은 느리게나마 계속 흘러야 타격 순간이 살아 보인다.
      const fxDt = rawDt * Math.max(timeScale, 0.42) * speedRef.current;
      const fxStep = fxDt * 60; // 프레임당 이동량으로 적혀 있는 값(파티클 속도 등)에 곱한다
      // 패링 불꽃의 시계: 부딪힌 순간에는 거의 멈춰 있다가 슬로모션 동안 절반 속도로 터져 나온다
      const deflectRate = now < metaRef.current.hitstopUntil ? DEFLECT_RATE_FREEZE : inClashSlow ? DEFLECT_RATE_SLOW : 1;
      deflectsRef.current.forEach((df) => {
        df.age += rawDt * 1000 * deflectRate * speedRef.current;
      });

      // ★ 11연참 초고속 픽셀 단획 암전 연참 + 납도 정적 → 일제 파열 사운드 구동! ★
      if (darkFlurryRef.current) {
        const df = darkFlurryRef.current;
        const el = now - df.startAt;
        df.strokes.forEach((st, idx) => {
          if (!st.played && el >= st.atMs) {
            st.played = true;
            const pan = panAt(df.targetX) + (idx % 2 === 0 ? -0.28 : 0.28);
            sound.playSlash(idx === df.strokes.length - 1, { pan, tier: 4 });
          }
        });
        if (!df.burstPlayed && el >= 680) {
          df.burstPlayed = true;
          sound.playDarkSlashFinish(panAt(df.targetX));
          spawnGroundCrack(df.targetX, 1.4, '#fde047');
          spawnSparks(df.targetX, df.targetY, '#fde047', 24, 15);
          metaRef.current.shakeUntil = now + 260;
          metaRef.current.shakePower = 18;
        }
        if (el >= df.totalDurationMs) {
          darkFlurryRef.current = null;
        }
      }
      if (koStrokeRef.current && now - koStrokeRef.current.startAt >= koStrokeRef.current.totalDurationMs) {
        koStrokeRef.current = null;
      }

      const p = playerRef.current;
      const e = enemyRef.current;
      if (!p || !e) return;

      // 히트스톱: 초식의 진행은 실제 시각으로 재므로, 멈춘 만큼 두 사람의 시간표를 통째로 뒤로 밀어야 정말로 멈춘다.
      // (밀지 않으면 화면만 느려지고 다음 동작은 제 시각에 터져서, 연참 연출 도중에 상대가 반격해 오는 일이 생긴다)
      // 패링 뒤의 슬로모션 구간도 같은 방식으로 느려진 만큼 민다 (예약된 연환 반격 포함).
      if ((now < metaRef.current.hitstopUntil || inClashSlow) && !metaRef.current.finished) {
        const hold = rawDt * 1000 * (1 - timeScale);
        [p, e].forEach((f) => {
          if (f.action) f.action.startAt += hold;
          if (f.pendingCounter) f.pendingCounter.triggerAt += hold;
          f.blockingUntil += hold;
          f.invulnUntil += hold;
          f.stunUntil += hold;
          f.clashPoseUntil += hold;
          f.groggyUntil += hold;
          f.hurtPoseUntil += hold;
          f.counterBuffUntil += hold;
          f.shoutUntil += hold;
          Object.keys(f.cooldowns).forEach((k) => {
            f.cooldowns[k] += hold;
          });
        });
        metaRef.current.pThinkAt += hold;
        metaRef.current.eThinkAt += hold;
      }

      if (!metaRef.current.finished) {
        // 내지른 자세는 히트스톱 동안 그대로 버티고, 풀린 뒤에 거둔다. 밀려난 쪽도 그때 미끄러진다.
        if (now >= metaRef.current.hitstopUntil) {
          // 패링 뒤 슬로모션 중에는 밀려나는 움직임도 같은 비율로 느려진다
          const pace = rawDt * 60 * speedRef.current * (inClashSlow ? 0.3 : 1);
          const settle = Math.pow(0.8, pace);
          p.lungeOffset *= settle;
          e.lungeOffset *= settle;
          const slide = Math.pow(0.72, pace);
          p.recoilOffset = Math.abs(p.recoilOffset) < 0.5 ? 0 : p.recoilOffset * slide;
          e.recoilOffset = Math.abs(e.recoilOffset) < 0.5 ? 0 : e.recoilOffset * slide;
        }
        p.qi = Math.min(p.maxQi, p.qi + (8.5 + p.stats.wil * 0.16) * (1 + (p.passiveBonus?.qiRegen || 0)) * dt);
        e.qi = Math.min(e.maxQi, e.qi + 10.5 * dt);

        // 예약된 연환 카운터 반격 즉시 실행!
        const checkPendingCounter = (f: FighterRuntime, opp: FighterRuntime, isP: boolean) => {
          if (f.pendingCounter && now >= f.pendingCounter.triggerAt && !f.action && now >= metaRef.current.hitstopUntil - 40) {
            const pc = f.pendingCounter;
            f.pendingCounter = undefined;
            const dir = opp.x >= f.x ? 1 : -1;
            f.x = Math.max(92, Math.min(CANVAS_W - 92, opp.x - dir * 130));
            launchSkill(f, opp, pc.skill, pc.formNum, isP, now, true, pc.chain);
          }
        };
        checkPendingCounter(p, e, true);
        checkPendingCounter(e, p, false);

        // 양측 완전 자동 보법 & 초식 선택 AI
        const runAi = (f: FighterRuntime, opp: FighterRuntime, isP: boolean, thinkKey: 'pThinkAt' | 'eThinkAt') => {
          f.moving = false;
          if (f.action || f.pendingCounter || now < f.stunUntil || now < f.groggyUntil || now < f.hurtPoseUntil) return;

          const dist = Math.abs(opp.x - f.x);
          const dir = opp.x >= f.x ? 1 : -1;
          const pref = isP && state.battleTactic === 'COUNTER' ? 195 : 162;

          if (dist > pref + 16) {
            f.x += dir * (155 + f.stats.agi) * dt;
            f.moving = true;
          } else if (dist < 108) {
            f.x -= dir * 95 * dt;
            f.moving = true;
          }

          if (now >= metaRef.current[thinkKey]) {
            const ready = f.skills
              .map((s, idx) => ({ s, formNum: idx + 1 }))
              .filter(({ s }) => (f.cooldowns[s.id] || 0) <= now && f.qi >= s.qiCost && (s.power > 0 || s.form === 'STEP'));
            // 카운터 전용 스킬(form === 'PARRY'이면서 다른 공격기가 있으면)은 적 공격에 반응하도록 가급적 아끼되, 공격기가 그것뿐이면 사용
            const offensive = ready.filter(({ s }) => s.form !== 'PARRY');
            const pool = offensive.length > 0 ? offensive : ready;

            if (pool.length > 0 && dist <= 290) {
              const pick =
                Math.random() < 0.65
                  ? [...pool].sort((a, b) => b.s.power - a.s.power)[0]
                  : pool[Math.floor(Math.random() * pool.length)];
              launchSkill(f, opp, pick.s, pick.formNum, isP, now, false);
              const pace = isP && state.battleTactic === 'AGGRESSIVE' ? 920 : 1220;
              metaRef.current[thinkKey] = now + pace / speedRef.current;
            } else {
              metaRef.current[thinkKey] = now + 320;
            }
          }
        };

        runAi(p, e, true, 'pThinkAt');
        runAi(e, p, false, 'eThinkAt');

        p.x = Math.max(92, Math.min(CANVAS_W - 92, p.x));
        e.x = Math.max(92, Math.min(CANVAS_W - 92, e.x));

        // 8프레임 공격 시퀀스 타임라인 진행 (스텝인 → 치켜듦 → 1타 베기 → [2타 역베기] → 회수)
        const updateAct = (f: FighterRuntime, opp: FighterRuntime, isP: boolean) => {
          const act = f.action;
          if (!act) return;
          const elapsed = (now - act.startAt) * speedRef.current;
          const facing = opp.x >= f.x ? 1 : -1;

          // Step-in 전진 스텝(Frame 1)
          if (!act.stepInDone && elapsed >= act.stepInMs * 0.4) {
            act.stepInDone = true;
            if (Math.abs(opp.x - f.x) > 125) {
              f.x = Math.max(92, Math.min(CANVAS_W - 92, f.x + facing * (act.isCounterRiposte ? 42 : 24)));
              spawnDust(f.x, facing);
            }
          }

          // 1타 판정 (Frame 3 또는 카운터/찌르기 Frame 6)
          if (!act.hit1Done && elapsed >= act.stepInMs + act.windupMs) {
            act.hit1Done = true;
            resolveStrike(f, opp, act, isP, now, false);
          }

          // 2연격 판정 (Frame 4 하단 역베기!)
          if (act.combo2Ms > 0 && act.hit1Done && !act.hit2Done && elapsed >= act.stepInMs + act.windupMs + act.strikeMs) {
            act.hit2Done = true;
            if (opp.hp > 0) resolveStrike(f, opp, act, isP, now, true);
          }

          const totalDur = act.stepInMs + act.windupMs + act.strikeMs + act.combo2Ms + act.recoveryMs;
          if (elapsed >= totalDur) {
            f.action = null;
          }
        };
        updateAct(p, e, true);
        updateAct(e, p, false);

        // 비행 검기/원거리 파동 업데이트 & 충돌
        wavesRef.current = wavesRef.current.filter((wv) => {
          wv.x += wv.vx * dt;
          wv.life -= dt;
          if (Math.random() < 0.65) {
            particlesRef.current.push({
              x: wv.x,
              y: wv.y + (Math.random() - 0.5) * 32,
              vx: -wv.facing * 1.5,
              vy: (Math.random() - 0.5) * 1.5,
              life: 0.22,
              maxLife: 0.22,
              color: wv.color,
              size: 4,
              gravity: 0,
            });
          }
          const target = wv.fromPlayer ? e : p;
          const attacker = wv.fromPlayer ? p : e;
          if (!wv.hit && Math.abs(wv.x - target.x) < 48) {
            wv.hit = true;
            const prof = getSkillVfxProfile(wv.skill, false);
            applyImpact(attacker, target, wv.skill, wv.fromPlayer, now, prof, false, 1.0, false);
            return false;
          }
          return wv.life > 0 && wv.x > -60 && wv.x < CANVAS_W + 60;
        });

        // ★ 목검 비무: 체력이 바닥나기 전에 먼저 무릎 꿇은 쪽이 진다 (진검결투엔 항복이 없다)
        const yielder =
          p.hp > 0 && e.hp > 0 && !battle.isRealDuel
            ? checkSurrender(p.hp / p.maxHp, e.hp / e.maxHp, yieldThreshold(p.stats, false), yieldThreshold(e.stats, false))
            : null;
        if (yielder) {
          metaRef.current.finished = true;
          const loser = yielder === 'P' ? p : e;
          const victory = yielder === 'E';
          loser.yielded = true;
          loser.action = null;
          pushFloat({ x: loser.x, y: FLOAT_STATUS_Y, text: '항복!', color: '#e2e8f0', life: 1.6, maxLife: 1.6, scale: 1.45 });
          sound.playDrum(panAt(loser.x));
          metaRef.current.timeSlowUntil = now + 360;
          metaRef.current.timeSlowColor = victory ? '#fde047' : '#94a3b8';
          if (victory) setTimeout(() => sound.playLevelUp(), 420);
          pushLog(`${loser.name}이(가) 목검을 내려놓고 한쪽 무릎을 꿇었다 — 항복!`);
          const finalPayload: BattleOutcomePayload = {
            victory,
            fighterType,
            discipleId: fighterType === 'DISCIPLE' ? selectedDiscipleId : undefined,
            usedMagic: metaRef.current.usedMagic,
            usedForbidden: metaRef.current.usedForbidden,
            justParriesCount: metaRef.current.justParries,
            recoilHealthLoss: metaRef.current.recoilHealthLoss,
            recoilLifespanYears: metaRef.current.recoilLifespanYears,
            hpRemainingRatio: p.hp / p.maxHp,
            endedBy: 'SURRENDER',
            fatalWoundsTaken: 0,
            fatalWoundsDealt: 0,
          };
          setCommentary(victory ? `승부 결정! ${e.name}이(가) 항복했다! 【${p.sectTitle}】 ${p.name}의 승리!` : `승부 결정! ${p.name}이(가) 무릎을 꿇고 항복했다…`);
          setTimeout(() => {
            setResultOutcome(finalPayload);
            setStage('RESULT');
          }, 1400);
        } else if (p.hp <= 0 || e.hp <= 0) {
          metaRef.current.finished = true;
          const victory = e.hp <= 0;
          const loserX = victory ? e.x : p.x;
          // ★ KO 결착 단칼 일섬 한 획 피니시: 임팩트 프리즈 → 화면 양분 거대 일섬 한 획 → 동양 징 결착! ★
          sound.playSlash(true, { pan: panAt(loserX), tier: 4 });
          sound.playKoFinisher(panAt(loserX));
          koStrokeRef.current = createKoOneStroke(now, loserX, 244, victory ? 1 : -1);
          metaRef.current.timeSlowUntil = now + 480;
          metaRef.current.timeSlowColor = victory ? '#fde047' : '#ef4444';
          metaRef.current.shakeUntil = now + 260;
          metaRef.current.shakePower = 15;
          spawnSparks(loserX, 246, victory ? '#fde047' : '#fca5a5', 18, 13);
          if (victory) setTimeout(() => sound.playLevelUp(), 480);
          const finalPayload: BattleOutcomePayload = {
            victory,
            fighterType,
            discipleId: fighterType === 'DISCIPLE' ? selectedDiscipleId : undefined,
            usedMagic: metaRef.current.usedMagic,
            usedForbidden: metaRef.current.usedForbidden,
            justParriesCount: metaRef.current.justParries,
            recoilHealthLoss: metaRef.current.recoilHealthLoss,
            recoilLifespanYears: metaRef.current.recoilLifespanYears,
            hpRemainingRatio: p.hp / p.maxHp,
            endedBy: (victory ? metaRef.current.fatalDealt : metaRef.current.fatalTaken) > 0 ? 'FATAL' : 'KO',
            fatalWoundsTaken: metaRef.current.fatalTaken,
            fatalWoundsDealt: metaRef.current.fatalDealt,
          };
          setCommentary(victory ? `승부 결정! 【${p.sectTitle}】 ${p.name}의 승리!` : `승부 결정! ${e.name}에게 쓰러졌다…`);
          setTimeout(() => {
            setResultOutcome(finalPayload);
            setStage('RESULT');
          }, 1150);
        }
      }

      // 이펙트 파티클/잔상/VFX 수명 갱신
      particlesRef.current = particlesRef.current.filter((pt) => {
        pt.x += pt.vx * fxStep;
        pt.y += pt.vy * fxStep;
        pt.vy += (pt.gravity ?? 0.16) * fxStep;
        // 쇠불꽃은 공기에 걸려 금세 느려진다
        if (pt.kind === 'SPARK') {
          const drag = Math.pow(0.9, fxStep);
          pt.vx *= drag;
          pt.vy *= drag;
        }
        pt.life -= fxDt;
        return pt.life > 0;
      });
      floatsRef.current = floatsRef.current.filter((fl) => {
        fl.y -= 26 * fxDt;
        fl.life -= fxDt;
        return fl.life > 0;
      });
      ghostsRef.current = ghostsRef.current.filter((g) => {
        // 잔상은 히트스톱과 상관없이 제 속도로 스러진다 (오래 남으면 연기 덩어리처럼 보인다)
        g.life -= rawDt * speedRef.current;
        return g.life > 0;
      });
      vfxSpritesRef.current = vfxSpritesRef.current.filter((v) => {
        v.x += v.vx * fxDt;
        v.y += v.vy * fxDt;
        v.life -= fxDt;
        return v.life > 0;
      });
      slashLinesRef.current = slashLinesRef.current.filter((sl) => {
        sl.life -= fxDt;
        return sl.life > 0;
      });
      bladeArcsRef.current = bladeArcsRef.current.filter((ba) => {
        ba.life -= fxDt;
        return ba.life > 0;
      });
      flaresRef.current = flaresRef.current.filter((fl) => {
        fl.life -= fxDt;
        return fl.life > 0;
      });
      cracksRef.current = cracksRef.current.filter((cr) => {
        cr.life -= fxDt;
        return cr.life > 0;
      });
      ringsRef.current = ringsRef.current.filter((rg) => {
        rg.life -= fxDt;
        rg.radius = rg.maxRadius * (1 - rg.life / rg.maxLife);
        return rg.life > 0;
      });
      magicFxRef.current = magicFxRef.current.filter((mf) => {
        mf.life -= fxDt;
        return mf.life > 0;
      });

          // ★ 32비트 8프레임 그리드 시트 + 모바일 세로 다이나믹 팔로우 카메라 + 가산합성 VFX 렌더링 ★
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.save();

          // 모바일 세로 화면(viewW=520)에서는 두 무인의 중점을 부드럽게 추적하는 다이나믹 격투 카메라!
          const midX = (p.x + e.x) / 2;
          const minCam = viewW / 2;
          const maxCam = CANVAS_W - viewW / 2;
          const targetCamX = viewW < CANVAS_W ? Math.max(minCam, Math.min(maxCam, midX)) : CANVAS_W / 2;
          battleCamXRef.current += (targetCamX - battleCamXRef.current) * Math.min(1, rawDt * 8);
          const camLeft = viewW < CANVAS_W ? Math.round(battleCamXRef.current - viewW / 2) : 0;
          const camTop = viewH < CANVAS_H ? Math.round((CANVAS_H - viewH) * 0.65) : 0;

          // 화면 흔들림은 끝으로 갈수록 잦아든다 (일정한 세기로 떨다 뚝 멈추면 화면이 깨진 것처럼 보인다)
          if (now < metaRef.current.shakeUntil) {
            const sp = metaRef.current.shakePower * Math.min(1, (metaRef.current.shakeUntil - now) / 150);
            ctx.translate(Math.round((Math.random() - 0.5) * sp), Math.round((Math.random() - 0.5) * sp * 0.6));
          }

          ctx.save();
          ctx.translate(-camLeft, -camTop);

          // 배경 무대
          const bgImg = loadRawImage(battle.isRealDuel ? '/assets/px_battle_duel_stage.jpg' : '/assets/px_battle_stage.jpg');
          if (bgImg) ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);
          else { ctx.fillStyle = '#1a120d'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }

          // 오의·극의·카운터 발동 시 먹물 암전 (Ink Dimming)
          if (now < metaRef.current.inkFlashUntil) {
            ctx.fillStyle = 'rgba(10, 6, 4, 0.52)';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          } else if (now < metaRef.current.cutinUntil) {
            ctx.fillStyle = 'rgba(10, 6, 4, 0.25)';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          }

          // 고속 잔상(Afterimage Ghost) 렌더링 (Foot-Anchor 피벗 적용!)
          ghostsRef.current.forEach((g) => {
            const sheet = getGridSpriteSheet(g.sheetSrc, 4, 2);
            if (!sheet || sheet.frames.length < 8) return;
            const sp = sheet.frames[g.frameIdx % sheet.frames.length];
            const ratio = 176 / Math.max(1, sheet.refHeight);
            const dw = Math.round(sp.width * ratio);
            const dh = Math.round(sp.height * ratio);
            const ax = Math.round(sp.anchorX * ratio);
            ctx.save();
            ctx.globalAlpha = Math.pow(g.life / g.maxLife, 1.5) * 0.4;
            ctx.translate(Math.round(g.x), g.y);
            ctx.scale(g.flipX, 1);
            ctx.drawImage(sp.ghostCanvas || sp.canvas, -ax, -dh + 6, dw, dh);
            ctx.restore();
          });

          // 8프레임 무술 포즈 결정기 (초식 형태별 정밀 분기: SLASH / THRUST / STRIKE·GRAPPLE / STEP / PARRY!)
          const resolvePoseFrame = (f: FighterRuntime): number => {
            if (now < f.hurtPoseUntil) return 7; // [7] 피격 밀림
            if (now < f.clashPoseUntil && !f.action) return f.clashFrame; // 막힌 칼: 내지른 자세로 맞물림
            if (now < f.blockingUntil || f.pendingCounter) return 5; // [5] 패링/흘리기 방어
            if (f.action) {
              const act = f.action;
              const el = (now - act.startAt) * speedRef.current;
              const form = act.skill.form;
              if (el < act.stepInMs) return 1; // [1] 저자세 스텝인
              if (el < act.stepInMs + act.windupMs) {
                if (act.isCounterRiposte) return 5;
                if (form === 'STRIKE' || form === 'GRAPPLE' || form === 'STEP') return 1; // 체당·보법은 저자세 응축!
                return 2; // [2] 상단 치켜듦
              }
              if (el < act.stepInMs + act.windupMs + act.strikeMs) {
                if (act.isCounterRiposte || form === 'THRUST' || form === 'STRIKE' || form === 'GRAPPLE') return 6; // [6] 일섬 반격·관통·발경 돌진!
                if (form === 'STEP') return 4; // 보법은 하단 섬격!
                return 3; // [3] 전방 전력 베기!
              }
              if (act.combo2Ms > 0 && el < act.stepInMs + act.windupMs + act.strikeMs + act.combo2Ms) {
                return 4; // [4] 하단 역베기 2연격!
              }
              return act.isCounterRiposte || form === 'THRUST' ? 6 : 4;
            }
            if (f.moving) return Math.floor(now / 150) % 2 === 0 ? 1 : 0; // 전진 보법
            return 0; // [0] 전투 대기 자세
          };

          const drawFighter = (f: FighterRuntime, sheetSrc: string, nativeDir: 1 | -1, wantDir: 1 | -1, isHeroSide: boolean) => {
            // 맞은 쪽은 히트스톱 동안 제자리에서 잘게 떨다가, 풀리면 뒤로 미끄러진다.
            const shiver = now < f.hurtPoseUntil && now < metaRef.current.hitstopUntil && f.hp > 0 ? (Math.floor(now / 34) % 2 === 0 ? 2 : -2) : 0;
            const drawX = Math.round(f.x + f.lungeOffset + f.recoilOffset + shiver);

            // ★ 패배(HP <= 0) 또는 항복 시 실제 바닥에 쓰러진/무릎 꿇은 KO 스프라이트(grid_ko_fallen_4x2.jpg) 렌더링! ★
            if (f.hp <= 0 || f.yielded) {
              const koSheet = getGridSpriteSheet('/assets/grid_ko_fallen_4x2.jpg', 4, 2);
              ctx.fillStyle = 'rgba(10, 8, 5, 0.55)';
              ctx.beginPath();
              ctx.ellipse(drawX, GROUND_Y + 2, 76, 14, 0, 0, Math.PI * 2);
              ctx.fill();
              if (koSheet && koSheet.frames.length >= 8) {
                const koIdx = getKoFallenIndex({
                  isHero: isHeroSide,
                  country: heroCountry,
                  gender: heroGender,
                  age: f.age,
                  enemySrc: isHeroSide ? undefined : sheetSrc,
                });
                const sp = koSheet.frames[koIdx];
                // KO 8종(무릎 꿇은 자세 / 완전히 누운 자세) 모두 자연스러운 크기로 바닥에 착지!
                const ratio = Math.min(168 / Math.max(1, sp.width), 104 / Math.max(1, sp.height));
                const dw = Math.round(sp.width * ratio);
                const dh = Math.round(sp.height * ratio);
                // grid_ko_fallen_4x2에서 0번만 우향, 1~7번은 좌향
                const koNativeRight = koIdx === 0;
                const flipKo = isHeroSide ? (koNativeRight ? 1 : -1) : (koNativeRight ? -1 : 1);
                ctx.save();
                ctx.translate(drawX, GROUND_Y + 6);
                ctx.scale(flipKo, 1);
                ctx.drawImage(sp.canvas, -dw / 2, -dh, dw, dh);
                ctx.restore();
              }
              return;
            }

            const sheet = getGridSpriteSheet(sheetSrc, 4, 2);

            // 그림자
            ctx.fillStyle = 'rgba(10, 8, 5, 0.48)';
            ctx.beginPath();
            ctx.ellipse(drawX, GROUND_Y, 56, 13, 0, 0, Math.PI * 2);
            ctx.fill();

            // 절대고수(검마 혈영 / 백운검선) 전용 상시 발밑 기세 오라!
            if (!isHeroSide && (sheetSrc.includes('gm_demon') || sheetSrc.includes('gm_sage'))) {
              ctx.save();
              ctx.globalAlpha = 0.48 + Math.sin(now / 170) * 0.16;
              ctx.strokeStyle = sheetSrc.includes('gm_demon') ? '#ef4444' : '#7dd3fc';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.ellipse(drawX, GROUND_Y - 1, 56 + Math.sin(now / 130) * 8, 13, 0, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }

            // 기 모으기 오라 (Windup 중 레벨 3 이상이면 발밑에 기공 파동 링!)
            if (f.action && !f.action.hit1Done && f.action.skill.masteryLevel >= 3) {
              const prof = getSkillVfxProfile(f.action.skill, Boolean(f.action.isCounterRiposte));
              ctx.save();
              ctx.globalAlpha = 0.55;
              ctx.strokeStyle = prof.color;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.ellipse(drawX, GROUND_Y - 2, 42 + Math.sin(now / 45) * 10, 12, 0, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }

            if (!sheet || sheet.frames.length < 8) return;
            const fIdx = resolvePoseFrame(f);
            const sp = sheet.frames[fIdx];
            const ratio = 176 / Math.max(1, sheet.refHeight);
            const dw = Math.round(sp.width * ratio);
            const dh = Math.round(sp.height * ratio);
            const ax = Math.round(sp.anchorX * ratio);
            const flipX = nativeDir === wantDir ? 1 : -1;
            const breathY = fIdx === 0 ? Math.sin(now / 260) * 2 : 0;

            ctx.save();
            ctx.translate(drawX, GROUND_Y - breathY);
            ctx.scale(flipX, 1);
            const flashLeft = f.hurtFlashUntil - now;
            if (flashLeft > HIT_FLASH_MS - HIT_FLASH_WHITE_MS) {
              ctx.drawImage(sp.flashCanvas, -ax, -dh + 6, dw, dh);
            } else {
              ctx.drawImage(sp.canvas, -ax, -dh + 6, dw, dh);
              if (flashLeft > 0) {
                ctx.globalAlpha = 0.6 * Math.pow(flashLeft / (HIT_FLASH_MS - HIT_FLASH_WHITE_MS), 1.4);
                ctx.drawImage(sp.flashCanvas, -ax, -dh + 6, dw, dh);
                ctx.globalAlpha = 1;
              }
            }
            ctx.restore();

            // ★ 캐릭터 머리 위 무협 기술 외침 말풍선! ★
            if (now < f.shoutUntil && f.shoutText) {
              const by = GROUND_Y - 196;
              ctx.save();
              ctx.font = 'bold 13px NeoDunggeunmo, monospace';
              const tw = ctx.measureText(f.shoutText).width;
              const pw = Math.max(116, tw + 22);
              // 두 사람이 붙어서 동시에 외치면 말풍선이 겹친다. 그럴 때는 둘 사이의 가운데를 경계로 좌우로 비켜 세운다.
              let bx = Math.max(pw / 2 + 6, Math.min(CANVAS_W - pw / 2 - 6, drawX));
              const other = f === p ? e : p;
              if (now < other.shoutUntil && other.shoutText && other.hp > 0) {
                const otw = Math.max(116, ctx.measureText(other.shoutText).width + 22);
                const otherX = other.x + other.lungeOffset + other.recoilOffset;
                if (Math.abs(otherX - drawX) < (pw + otw) / 2 + 8) {
                  const mid = (otherX + drawX) / 2;
                  const side = drawX <= otherX ? -1 : 1;
                  bx = Math.max(pw / 2 + 6, Math.min(CANVAS_W - pw / 2 - 6, mid + side * (pw / 2 + 4)));
                }
              }
              const ph = f.shoutSub ? 38 : 26;
              ctx.fillStyle = f.shoutIsCounter ? 'rgba(92, 18, 16, 0.94)' : 'rgba(20, 13, 8, 0.92)';
              ctx.fillRect(Math.round(bx - pw / 2), Math.round(by - ph), Math.round(pw), ph);
              ctx.strokeStyle = f.shoutIsCounter ? '#fde047' : '#d4a359';
              ctx.lineWidth = 2;
              ctx.strokeRect(Math.round(bx - pw / 2), Math.round(by - ph), Math.round(pw), ph);
              // 말풍선 꼬리
              ctx.fillStyle = f.shoutIsCounter ? '#fde047' : '#d4a359';
              ctx.fillRect(Math.round(Math.max(bx - pw / 2 + 8, Math.min(bx + pw / 2 - 14, drawX - 3))), Math.round(by), 6, 5);

              ctx.textAlign = 'center';
              ctx.fillStyle = f.shoutIsCounter ? '#fde047' : '#fff7d6';
              ctx.fillText(f.shoutText, bx, by - (f.shoutSub ? 20 : 8));
              if (f.shoutSub) {
                ctx.font = '10px NeoDunggeunmo, monospace';
                ctx.fillStyle = '#93c5fd';
                ctx.fillText(f.shoutSub, bx, by - 6);
              }
              ctx.restore();
            }
          };

          drawFighter(p, heroGridSrc, heroNativeDir, e.x >= p.x ? 1 : -1, true);
          drawFighter(e, enemyGridSrc, -1, p.x >= e.x ? 1 : -1, false);

          // ★ 발밑 지면 균열 & 수평 충격파 (Ground Cracks) ★
          cracksRef.current.forEach((cr) => {
            const pRatio = cr.life / cr.maxLife;
            ctx.save();
            ctx.globalAlpha = Math.min(1, pRatio * 1.4);
            // 지면 타원형 충격파 그림자
            ctx.strokeStyle = cr.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(cr.x, cr.y, (1 - pRatio) * 82 * cr.scale + 18, (1 - pRatio) * 16 * cr.scale + 5, 0, 0, Math.PI * 2);
            ctx.stroke();
            // 방사형 지면 균열선
            cr.branches.forEach((b) => {
              const ex = cr.x + Math.cos(b.angle) * b.len;
              const ey = cr.y + Math.sin(b.angle) * b.len * 0.28;
              const mx = (cr.x + ex) / 2 + b.bend * 0.4;
              const my = (cr.y + ey) / 2 + b.bend * 0.14;
              ctx.strokeStyle = '#140c08';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.moveTo(cr.x, cr.y);
              ctx.lineTo(mx, my);
              ctx.lineTo(ex, ey);
              ctx.stroke();
              ctx.strokeStyle = cr.color;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            });
            ctx.restore();
          });

          // ★ 마법 · 속성 전용 시네마틱 이펙트 (다층 화염 기둥 / 분기 천뢰 낙하 / 다면체 빙정 / 이중 역회전 마법진 / 상승 강기 파동!) ★
          magicFxRef.current.forEach((mf) => {
            const pRatio = mf.life / mf.maxLife;
            const prog = 1 - pRatio;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            if (mf.kind === 'FIRE') {
              // 1) 중심 고열 기둥
              const grad = ctx.createLinearGradient(mf.x, GROUND_Y, mf.x, 55);
              grad.addColorStop(0, `rgba(255, 245, 160, ${pRatio * 0.95})`);
              grad.addColorStop(0.35, `rgba(255, 120, 20, ${pRatio * 0.85})`);
              grad.addColorStop(0.75, `rgba(220, 38, 12, ${pRatio * 0.55})`);
              grad.addColorStop(1, 'rgba(180, 20, 0, 0)');
              ctx.fillStyle = grad;
              const pw = 62 + prog * 54;
              ctx.fillRect(Math.round(mf.x - pw / 2), 55, Math.round(pw), GROUND_Y - 55);
              // 2) 일렁이는 불꽃 혀 5가닥
              for (let i = -2; i <= 2; i++) {
                const fx = mf.x + i * 20 + Math.sin(now / 45 + i * 2) * 8;
                const fh = (145 - Math.abs(i) * 22) * (0.65 + pRatio * 0.45);
                ctx.fillStyle = i === 0 ? `rgba(255, 250, 200, ${pRatio * 0.9})` : `rgba(251, 146, 60, ${pRatio * 0.72})`;
                ctx.beginPath();
                ctx.moveTo(fx - 14, GROUND_Y);
                ctx.quadraticCurveTo(fx + Math.sin(now / 60 + i) * 14, GROUND_Y - fh * 0.6, fx, GROUND_Y - fh);
                ctx.quadraticCurveTo(fx - Math.sin(now / 60 + i) * 14, GROUND_Y - fh * 0.6, fx + 14, GROUND_Y);
                ctx.closePath();
                ctx.fill();
              }
              // 3) 지면 작열 링
              ctx.strokeStyle = `rgba(253, 224, 71, ${pRatio * 0.9})`;
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.ellipse(mf.x, GROUND_Y, 45 + prog * 68, 12 + prog * 14, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else if (mf.kind === 'LIGHTNING') {
              // 1) 주 낙뢰 + 좌우 분기 잔가지 번개
              const pts: Array<{ x: number; y: number }> = [{ x: mf.x, y: 0 }];
              for (let ly = 36; ly <= GROUND_Y; ly += 34) {
                pts.push({ x: mf.x + (Math.random() - 0.5) * 44, y: ly });
              }
              // 외곽 전격 글로우
              ctx.strokeStyle = `rgba(192, 132, 252, ${pRatio * 0.95})`;
              ctx.lineWidth = 18 * pRatio;
              ctx.beginPath();
              pts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
              ctx.stroke();
              // 순백 코어 낙뢰
              ctx.strokeStyle = `rgba(255, 255, 255, ${pRatio})`;
              ctx.lineWidth = 6 * pRatio;
              ctx.stroke();
              // 분기 잔가지 번개 3줄
              pts.forEach((pt, idx) => {
                if (idx >= 2 && idx <= 6 && idx % 2 === 0) {
                  const dir = idx % 4 === 0 ? 1 : -1;
                  ctx.strokeStyle = `rgba(216, 180, 254, ${pRatio * 0.85})`;
                  ctx.lineWidth = 3 * pRatio;
                  ctx.beginPath();
                  ctx.moveTo(pt.x, pt.y);
                  ctx.lineTo(pt.x + dir * (28 + Math.random() * 24), pt.y + 26);
                  ctx.lineTo(pt.x + dir * (48 + Math.random() * 28), pt.y + 54);
                  ctx.stroke();
                }
              });
              // 낙뢰 지점 플라즈마 광구
              const orb = ctx.createRadialGradient(mf.x, GROUND_Y - 10, 4, mf.x, GROUND_Y - 10, 68 * pRatio + 18);
              orb.addColorStop(0, `rgba(255, 255, 255, ${pRatio})`);
              orb.addColorStop(0.5, `rgba(192, 132, 252, ${pRatio * 0.7})`);
              orb.addColorStop(1, 'rgba(126, 34, 206, 0)');
              ctx.fillStyle = orb;
              ctx.beginPath();
              ctx.arc(mf.x, GROUND_Y - 10, 68 * pRatio + 18, 0, Math.PI * 2);
              ctx.fill();
            } else if (mf.kind === 'ICE') {
              // 다면체 빙정 기둥 5개 (명암 2면 + 순백 엣지 하이라이트)
              for (let k = -2; k <= 2; k++) {
                const sx = mf.x + k * 25;
                const sh = (118 - Math.abs(k) * 20) * Math.min(1, prog * 4.0);
                const w = 15 - Math.abs(k) * 1.5;
                ctx.fillStyle = `rgba(56, 189, 248, ${pRatio * 0.75})`;
                ctx.beginPath();
                ctx.moveTo(sx - w, GROUND_Y);
                ctx.lineTo(sx, GROUND_Y - sh);
                ctx.lineTo(sx, GROUND_Y);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = `rgba(186, 230, 253, ${pRatio * 0.92})`;
                ctx.beginPath();
                ctx.moveTo(sx, GROUND_Y);
                ctx.lineTo(sx, GROUND_Y - sh);
                ctx.lineTo(sx + w, GROUND_Y);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = `rgba(255, 255, 255, ${pRatio * 0.9})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(sx - w, GROUND_Y);
                ctx.lineTo(sx, GROUND_Y - sh);
                ctx.lineTo(sx + w, GROUND_Y);
                ctx.stroke();
              }
            } else if (mf.kind === 'SHADOW') {
              // 이중 역회전 고대 마법진 + 8각 성진 + 암영 소용돌이
              ctx.globalAlpha = pRatio * 0.9;
              ctx.save();
              ctx.translate(mf.x, 255);
              ctx.rotate(prog * 3.6);
              ctx.strokeStyle = '#e879f9';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(0, 0, 82, 0, Math.PI * 2);
              ctx.stroke();
              ctx.strokeRect(-54, -54, 108, 108);
              ctx.rotate(Math.PI / 4);
              ctx.strokeRect(-54, -54, 108, 108);
              ctx.restore();
              ctx.save();
              ctx.translate(mf.x, 255);
              ctx.rotate(-prog * 5.2);
              ctx.strokeStyle = '#a855f7';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(0, 0, 52, 0, Math.PI * 2);
              ctx.stroke();
              ctx.strokeRect(-34, -34, 68, 68);
              ctx.restore();
            } else if (mf.kind === 'QI') {
              // 다중 동심원 강기 파동 + 상승하는 금빛 기운 가닥 6줄
              ctx.globalAlpha = pRatio * 0.85;
              ctx.strokeStyle = '#fde047';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.arc(mf.x, 255, 32 + prog * 135, 0, Math.PI * 2);
              ctx.stroke();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(mf.x, 255, 18 + prog * 95, 0, Math.PI * 2);
              ctx.stroke();
              for (let s = 0; s < 6; s++) {
                const sx = mf.x + (s - 2.5) * 22 + Math.sin(prog * 10 + s) * 8;
                const sy = GROUND_Y - prog * 170 - (s % 2) * 28;
                ctx.strokeStyle = `rgba(253, 224, 71, ${pRatio * 0.85})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(sx, sy + 36);
                ctx.lineTo(sx, sy);
                ctx.stroke();
              }
            }
            ctx.restore();
          });

          // ★ 60fps 크로스페이드 보간 32비트 픽셀아트 VFX + 비행 검기 파동! ★
          vfxSpritesRef.current.forEach((v) => {
            drawSmoothVfxSprite(ctx, {
              sheetSrc: v.sheetSrc || VFX_SHEETS.LEGACY,
              frameSeq: v.frameSeq && v.frameSeq.length > 0 ? v.frameSeq : [v.vfxIdx],
              progress: 1 - v.life / v.maxLife,
              x: v.x,
              y: v.y,
              scale: v.scale,
              flipX: v.flipX,
              rotation: v.rotation,
            });
          });

          const waveSheet = getVfxGridSheet(VFX_SHEETS.LEGACY, 4, 2);
          if (waveSheet && waveSheet.frames.length === 8) {
            ctx.save();
            wavesRef.current.forEach((wv) => {
              const cell = waveSheet.frames[wv.vfxIdx % 8];
              const size = Math.round(145 * wv.scale);
              ctx.save();
              ctx.translate(Math.round(wv.x), Math.round(wv.y));
              ctx.scale(wv.facing, 1);
              drawGlowSprite(ctx, cell, -size / 2, -size / 2, size, size, 1, 0.35);
              ctx.restore();
            });
            ctx.restore();
          }

          // ★ 초승달 붓터치 검궤 호선 (Curved Tapered Blade Arcs — 양끝이 날카롭게 좁아지는 아케이드 검기!) ★
          bladeArcsRef.current.forEach((ba) => {
            const pRatio = ba.life / ba.maxLife;
            const steps = 14;
            const outerPts: Array<{ x: number; y: number }> = [];
            const innerPts: Array<{ x: number; y: number }> = [];
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              const ang = ba.startAngle + (ba.endAngle - ba.startAngle) * t;
              const taper = Math.sin(t * Math.PI); // 양끝 0 → 중앙 최대 두께!
              const w = ba.thickness * taper * (0.65 + pRatio * 0.5);
              const rOut = ba.radius + w;
              const rIn = Math.max(8, ba.radius - w * 0.8);
              outerPts.push({ x: ba.x + Math.cos(ang) * rOut, y: ba.y + Math.sin(ang) * rOut * 0.78 });
              innerPts.push({ x: ba.x + Math.cos(ang) * rIn, y: ba.y + Math.sin(ang) * rIn * 0.78 });
            }
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = Math.min(1, pRatio * 1.25);
            // 외곽 속성색 검기
            ctx.fillStyle = ba.color;
            ctx.beginPath();
            outerPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            for (let i = innerPts.length - 1; i >= 0; i--) ctx.lineTo(innerPts[i].x, innerPts[i].y);
            ctx.closePath();
            ctx.fill();
            // 중앙 순백 날끝 하이라이트
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1.5, ba.thickness * 0.28 * pRatio);
            ctx.beginPath();
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              const ang = ba.startAngle + (ba.endAngle - ba.startAngle) * t;
              const px = ba.x + Math.cos(ang) * ba.radius;
              const py = ba.y + Math.sin(ang) * ba.radius * 0.78;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.restore();
          });

          // 일섬선 & 4방향 십자 별빛 섬광 & 충격파 링
          slashLinesRef.current.forEach((sl) => {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = sl.life / sl.maxLife;
            ctx.strokeStyle = sl.color;
            ctx.lineWidth = sl.width + 6;
            ctx.beginPath();
            ctx.moveTo(sl.x1, sl.y1);
            ctx.lineTo(sl.x2, sl.y2);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(2, sl.width * 0.55);
            ctx.stroke();
            ctx.restore();
          });

          flaresRef.current.forEach((fl) => {
            const pRatio = fl.life / fl.maxLife;
            const len = fl.size * (0.45 + (1 - pRatio) * 0.75);
            const thick = Math.max(2, 7 * pRatio);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = Math.min(1, pRatio * 1.3);
            ctx.translate(fl.x, fl.y);
            ctx.rotate(fl.rotation);
            // 4방향 다이아몬드 십자 광선 (주광 + 45도 보조광)
            [0, Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4].forEach((ang, idx) => {
              const armLen = idx < 2 ? len : len * 0.55;
              const armW = idx < 2 ? thick : thick * 0.6;
              ctx.save();
              ctx.rotate(ang);
              ctx.fillStyle = idx < 2 ? fl.color : '#ffffff';
              ctx.beginPath();
              ctx.moveTo(-armLen, 0);
              ctx.lineTo(0, -armW);
              ctx.lineTo(armLen, 0);
              ctx.lineTo(0, armW);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            });
            // 중심 순백 코어
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(3, 12 * pRatio), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });

          ringsRef.current.forEach((rg) => {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (rg.life / rg.maxLife) * 0.88;
            ctx.strokeStyle = rg.color;
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.arc(rg.x, rg.y, rg.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(rg.x, rg.y, Math.max(2, rg.radius - 4), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          });

          // 픽셀 + 방향성 쇠불꽃 스파크 스트릭 + 동양 먹물 방울 파티클!
          particlesRef.current.forEach((pt) => {
            const alpha = Math.max(0, pt.life / pt.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            if (pt.kind === 'SPARK') {
              ctx.globalCompositeOperation = 'lighter';
              ctx.strokeStyle = pt.color;
              ctx.lineWidth = pt.size;
              ctx.beginPath();
              ctx.moveTo(pt.x, pt.y);
              ctx.lineTo(pt.x - pt.vx * 2.6, pt.y - pt.vy * 2.6);
              ctx.stroke();
            } else if (pt.kind === 'INK') {
              ctx.fillStyle = pt.color;
              ctx.beginPath();
              ctx.arc(Math.round(pt.x), Math.round(pt.y), Math.max(1.5, pt.size * 0.55 * alpha), 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillStyle = pt.color;
              ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
            }
            ctx.restore();
          });

          // 패링 불꽃 (실제 시각으로 그리므로 히트스톱 중에도 제 속도로 튄다)
          deflectsRef.current = deflectsRef.current.filter((df) => renderDeflectSpark(ctx, df));

          // 데미지·상태 팝업 텍스트 (월드 좌표 종료!)
          floatsRef.current.forEach((fl) => {
            // 톡 튀어나왔다가 제 크기로 가라앉고, 끝의 35%에서 옅어지며 사라진다.
            const age = fl.maxLife - fl.life;
            const pop = age < 0.09 ? 1.3 - (age / 0.09) * 0.3 : 1;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, fl.life / (fl.maxLife * 0.35)));
            ctx.font = `bold ${Math.round(17 * (fl.scale || 1) * pop)}px NeoDunggeunmo, monospace`;
            ctx.textAlign = 'center';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#120a06';
            ctx.strokeText(fl.text, Math.round(fl.x), Math.round(fl.y));
            ctx.fillStyle = fl.color;
            ctx.fillText(fl.text, Math.round(fl.x), Math.round(fl.y));
            ctx.restore();
          });

          ctx.restore(); // 월드 카메라 변환 해제 → 화면 기준 오버레이(타임슬로우·암전연참·컷인·간파) 중앙 정렬!

          // ★ 극한 필살기 타임 슬로우 기류 집중선 (Speed Lines + 수묵 비네팅) ★
          if (now < metaRef.current.timeSlowUntil) {
            ctx.save();
            ctx.fillStyle = 'rgba(8, 5, 4, 0.34)';
            ctx.fillRect(0, 0, viewW, viewH);
            ctx.strokeStyle = metaRef.current.timeSlowColor;
            ctx.globalAlpha = 0.42;
            ctx.lineWidth = 2;
            const cx = viewW / 2;
            const cy = viewH / 2;
            for (let i = 0; i < 18; i++) {
              const a = (i / 18) * Math.PI * 2 + (now / 400);
              ctx.beginPath();
              ctx.moveTo(cx + Math.cos(a) * (viewW * 0.28), cy + Math.sin(a) * (viewH * 0.28));
              ctx.lineTo(cx + Math.cos(a) * (viewW * 0.65), cy + Math.sin(a) * (viewH * 0.65));
              ctx.stroke();
            }
            ctx.restore();
          }

          // ★ 11연참 초고속 픽셀 단획 암전 연참 & KO 단칼 일섬 한 획 피니시 오버레이! ★
          if (darkFlurryRef.current) {
            renderDarkFlurry(ctx, darkFlurryRef.current, now, viewW, viewH, camLeft);
          }
          if (koStrokeRef.current) {
            renderKoOneStroke(ctx, koStrokeRef.current, now, viewW, viewH, camLeft);
          }

          if (darkSlashRef.current?.active) {
            const ds = darkSlashRef.current;
            const el = now - ds.startAt;
            ctx.save();

            // 양끝이 날카롭게 뾰족한 다이아몬드/테이퍼드 검흔 드로잉 헬퍼!
            const drawTaperedSlash = (x1: number, y1: number, x2: number, y2: number, halfW: number, glowCol: string, alpha = 1) => {
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              const dx = x2 - x1;
              const dy = y2 - y1;
              const dist = Math.hypot(dx, dy) || 1;
              const nx = (-dy / dist) * halfW;
              const ny = (dx / dist) * halfW;
              ctx.save();
              ctx.globalAlpha = alpha;
              // 외곽 광원 글로우
              ctx.fillStyle = glowCol;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.quadraticCurveTo(mx + nx * 1.45, my + ny * 1.45, x2, y2);
              ctx.quadraticCurveTo(mx - nx * 1.45, my - ny * 1.45, x1, y1);
              ctx.fill();
              // 순백 강철 코어
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.quadraticCurveTo(mx + nx * 0.55, my + ny * 0.55, x2, y2);
              ctx.quadraticCurveTo(mx - nx * 0.55, my - ny * 0.55, x1, y1);
              ctx.fill();
              ctx.restore();
            };

            if (el < 780) {
              // 1) 칠흑 수묵 암전 + 상하 시네마틱 레터박스
              ctx.fillStyle = el < 680 ? 'rgba(3, 1, 4, 0.94)' : 'rgba(18, 2, 4, 0.92)';
              ctx.fillRect(0, 0, viewW, viewH);

              // 2) Phase 1 (0~140ms): 수평 칼날/눈빛 섬광!
              if (el < 170) {
                const p = el / 170;
                const span = viewW * (0.3 + p * 0.8);
                drawTaperedSlash(viewW / 2 - span / 2, viewH * 0.48, viewW / 2 + span / 2, viewH * 0.48, 8 * (1 - p * 0.5), '#fde047', 1 - p * 0.3);
              }

              // 3) 암전 속 시전자 청백/황금 실루엣 잔상 3체 교차!
              const gSheet = getGridSpriteSheet(ds.attackerSheet, 4, 2);
              if (gSheet && gSheet.frames.length >= 8) {
                ds.ghostSpots.forEach((gs) => {
                  if (el < gs.atMs) return;
                  const age = el - gs.atMs;
                  const fade = Math.max(0.14, 0.52 - age / 900);
                  const sp = gSheet.frames[gs.frameIdx % 8];
                  const ratio = 176 / Math.max(1, gSheet.refHeight);
                  const dw = Math.round(sp.width * ratio);
                  const dh = Math.round(sp.height * ratio);
                  const ax = Math.round(sp.anchorX * ratio);
                  ctx.save();
                  ctx.globalAlpha = fade;
                  ctx.translate(Math.round(gs.x - camLeft), Math.round(gs.y - camTop));
                  ctx.scale(gs.flip, 1);
                  ctx.drawImage(sp.ghostCanvas || sp.canvas, -ax, -dh + 6, dw, dh);
                  ctx.restore();
                });
              }

              // 4) Phase 2~3: 가속 9연참 테이퍼드 검흔 + 교차 불꽃!
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ds.scars.forEach((sc) => {
                if (el < sc.atMs) return;
                const since = el - sc.atMs;
                const prog = Math.min(1, since / 65);
                const x1 = sc.x1 - camLeft;
                const y1 = sc.y1 - camTop;
                const x2 = x1 + (sc.x2 - sc.x1) * prog;
                const y2 = y1 + (sc.y2 - sc.y1) * prog;
                const pulse = el >= 680 ? 1.15 : 1.0;
                const col = sc.isFinisherLine ? '#ef4444' : ds.color;
                drawTaperedSlash(x1, y1, x2, y2, (sc.width / 2) * pulse, col, sc.isFinisherLine ? 1 : 0.92);
              });
              ctx.restore();

              // 5) 시네마틱 상하 레터박스 + 먹물 오의명
              ctx.fillStyle = '#000000';
              ctx.fillRect(0, 0, viewW, 38);
              ctx.fillRect(0, viewH - 34, viewW, 34);
              ctx.fillStyle = ds.color;
              ctx.fillRect(0, 38, viewW, 2);
              ctx.fillRect(0, viewH - 35, viewW, 2);

              ctx.textAlign = 'center';
              ctx.font = 'bold 17px "Noto Serif KR", NeoDunggeunmo, serif';
              ctx.fillStyle = '#fde68a';
              ctx.fillText(ds.title, viewW / 2, 26);

              if (el >= 680) {
                ctx.font = 'bold 12px NeoDunggeunmo, monospace';
                ctx.fillStyle = '#fca5a5';
                ctx.fillText('— 納 刀 (납 도) —', viewW / 2, viewH - 13);
              }
            } else {
              // Phase 4 (780~1020ms): 백색·진홍 시간 파열 플래시 → 적 쓰러짐!
              const fade = Math.max(0, 1 - (el - 780) / 240);
              ctx.fillStyle = `rgba(255, 245, 235, ${fade * 0.92})`;
              ctx.fillRect(0, 0, viewW, viewH);
            }
            ctx.restore();
          }

          // ★ 오의 · 고숙련 · 카운터 반격 먹물 캘리그래피 컷인 배너! ★
          if (now < metaRef.current.cutinUntil) {
            ctx.save();
            ctx.fillStyle = 'rgba(16, 9, 5, 0.88)';
            ctx.fillRect(0, 18, viewW, 56);
            ctx.fillStyle = metaRef.current.cutinColor;
            ctx.fillRect(0, 18, viewW, 3);
            ctx.fillRect(0, 72, viewW, 3);

            ctx.textAlign = 'center';
            ctx.font = 'bold 12px NeoDunggeunmo, monospace';
            ctx.fillStyle = '#e6d8be';
            ctx.fillText(
              metaRef.current.cutinTrait
                ? `${metaRef.current.cutinSect} · ${metaRef.current.cutinTrait}`
                : metaRef.current.cutinSect,
              viewW / 2,
              36
            );

            ctx.font = 'bold 24px "Noto Serif KR", NeoDunggeunmo, serif';
            ctx.fillStyle = metaRef.current.cutinColor;
            ctx.fillText(metaRef.current.cutinSkill, viewW / 2, 65);
            ctx.restore();
          }

          // 간파(看破) 순간 백색 플래시 + 붉은 붓글씨 인장
          if (now < metaRef.current.parryFlashUntil) {
            // 화면 전체를 덮는 섬광은 쓰지 않는다. 작은 「看破」 표식만 톡 찍혔다 사라지고, 합이 깊어질수록 커진다.
            const span = Math.max(1, metaRef.current.parryFlashUntil - metaRef.current.parryFlashStart);
            const t = Math.max(0, Math.min(1, (now - metaRef.current.parryFlashStart) / span));
            const chain = metaRef.current.parryChain;
            const k = Math.min(6, chain);
            // 부딪힌 순간 화면이 따뜻한 빛으로 아주 잠깐 번쩍인다 (0.1초 안에 걷힌다)
            const sinceMs = now - metaRef.current.parryFlashStart;
            if (sinceMs < 100) {
              ctx.fillStyle = `rgba(255, 236, 200, ${((0.16 + k * 0.02) * Math.pow(1 - sinceMs / 100, 2)).toFixed(3)})`;
              ctx.fillRect(0, 0, viewW, viewH);
            }
            const pop = 1 + 0.4 * Math.pow(1 - Math.min(1, t / 0.18), 2);
            const size = 24 + k * 3.6;
            ctx.save();
            ctx.globalAlpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
            ctx.translate(viewW / 2, 104);
            ctx.scale(pop, pop);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(20, 8, 6, 0.9)';
            const kanjiFont = `bold ${Math.round(size)}px "Noto Serif KR", NeoDunggeunmo, serif`;
            const countFont = `bold ${Math.round(size * 0.62)}px NeoDunggeunmo, monospace`;
            const countText = chain >= 2 ? `${chain}합` : '';
            ctx.font = kanjiFont;
            const kw = ctx.measureText('看破').width;
            ctx.font = countFont;
            const cw = countText ? ctx.measureText(countText).width + 8 : 0;
            const left = -(kw + cw) / 2;
            ctx.font = kanjiFont;
            ctx.textAlign = 'left';
            ctx.strokeText('看破', left, 0);
            ctx.fillStyle = chain >= 5 ? '#ff5a3c' : chain >= 3 ? '#ff8a3c' : '#ffb347';
            ctx.fillText('看破', left, 0);
            if (countText) {
              ctx.font = countFont;
              ctx.strokeText(countText, left + kw + 8, 2);
              ctx.fillStyle = '#fff3d0';
              ctx.fillText(countText, left + kw + 8, 2);
            }
            ctx.restore();
          }

          ctx.restore();
        }
      }

      if (now - lastHud > 85) {
        lastHud = now;
        setHudTick((v) => v + 1);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stage, battle, fighterType, selectedDiscipleId, state.battleTactic, state.gender, state.country, state.age, viewW, viewH]);

  const p = playerRef.current;
  const e = enemyRef.current;

  if (stage === 'SETUP') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-[#120c09]">
        <div className="rpg-window max-w-xl w-full p-4 sm:p-5 space-y-4 animate-ink max-h-[92vh] overflow-y-auto">
          <div className="flex items-start justify-between border-b-2 border-[#6b4728] pb-3 gap-3">
            <div className="space-y-1 min-w-0">
              <InGameTooltip {...(battle.isRealDuel ? HANJA_GLOSSARY.DUEL_REAL : HANJA_GLOSSARY.DUEL_SPAR)}>
                <span className={`text-xs px-2 py-0.5 inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 ${battle.isRealDuel ? 'seal-badge' : 'bg-[#2c4c6e] text-white border border-[#93c5fd]'}`}>
                  {battle.isRealDuel ? <><Skull className="w-3.5 h-3.5" /> 진검결투</> : '비무 · 대련'}
                </span>
              </InGameTooltip>
              <h2 className="text-base sm:text-xl font-bold text-[#fde68a] truncate">{battle.title}</h2>
              <p className="text-xs text-[#c7b394]">{battle.subtitle}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right text-xs">
                <div className="font-bold text-rose-400">{battle.enemyName}</div>
                <div className="text-[11px] text-[#c7b394]">{enemySectName} · HP {battle.enemyHp}</div>
              </div>
              <PixelPortrait role={battle.isRivalBattle ? 'RIVAL' : 'ENEMY'} country={state.country} age={battle.enemyAge} variantHint={battle.enemyName} size={50} />
            </div>
          </div>

          {battle.isTournament && battle.tournamentRound && (
            <div className="bg-[#24180f] border border-[#d4a359] p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-[#fde68a] flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> 대진 진행 현황
                </span>
                <span className="text-amber-300">
                  기대 명성 기준: {TOURNAMENT_ROUNDS[battle.tournamentRound - 1]?.expectedFame} (현재 {state.fame})
                </span>
              </div>
              <div className="grid grid-cols-8 gap-0.5 text-center text-[9px] sm:text-[10px]">
                {TOURNAMENT_ROUNDS.map((r) => {
                  const cur = r.round === battle.tournamentRound;
                  const done = r.round < (battle.tournamentRound || 1);
                  return (
                    <div
                      key={r.round}
                      className={`py-1 border font-bold ${
                        cur
                          ? 'bg-[#b52b27] border-[#fde047] text-white'
                          : done
                          ? 'bg-[#2a3b24] border-emerald-500/60 text-emerald-200'
                          : 'bg-[#120c08] border-[#4a3423] text-[#8f7c66]'
                      }`}
                    >
                      {r.label.replace('전', '')}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {battle.isRealDuel ? (
            <div className="bg-[#4a1212] border border-[#ef4444] p-2.5 text-xs text-[#fecaca]">
              {battle.journeyStakes === 'MERCY' ? (
                <>
                  ⚠ 진검승부: 한 칼이 무겁고 항복은 없습니다. 다만 상대에게 살의는 없어 급소를 노리지 않습니다.
                  <br />져도 목숨은 건지지만 크게 다치고 무사수행을 접습니다.
                </>
              ) : battle.journeyStakes === 'HOSTILE' && getDifficultyId(state) === 'EASY' ? (
                <>
                  ⚠ 진검결투: 상대는 목숨을 노립니다. 깨끗이 들어간 일격은 치명상이 되고, 항복은 없습니다.
                  <br />지면 크게 다치고 무사수행을 접습니다(영구 장애 위험).
                </>
              ) : (
                <>
                  ⚠ 진검결투: 한 칼이 무겁고, 깨끗이 들어간 일격은 치명상이 됩니다. 항복은 없습니다.
                  <br />패배 시 즉사 또는 영구 장애(외팔·실명), 이겨도 깊은 상처가 남을 수 있습니다.
                  {battle.journeyStakes === 'HOSTILE' && ' 지면 무사수행을 접습니다.'}
                </>
              )}
            </div>
          ) : !battle.spectatorMode ? (
            <div className="bg-[#1f2a36] border border-[#5b7a99] p-2.5 text-xs text-[#cbd5e1]">
              목검 비무: 타격이 가벼워 쓰러지기 전에 먼저 무릎 꿇는 쪽이 집니다(항복). 후유증은 멍 정도입니다.
            </div>
          ) : null}

          {/* 나와 상대방의 6대 능력치 한눈에 비교 보드! */}
          <div className="bg-[#1b120c] border border-[#6b4728] p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-[#fde68a]">{state.name} ({state.age}세)</span>
              <span className="text-[#c7b394] text-[10px]">6대 능력치 비교</span>
              <span className="text-rose-300">{battle.enemyName} ({battle.enemyAge}세)</span>
            </div>
            <div className="grid grid-cols-6 gap-1 text-center text-[10px]">
              {([
                ['근력', state.stats.str, battle.enemyStats.str],
                ['민첩', state.stats.agi, battle.enemyStats.agi],
                ['체력', state.stats.vit, battle.enemyStats.vit],
                ['정신', state.stats.wil, battle.enemyStats.wil],
                ['통찰', state.stats.ins, battle.enemyStats.ins],
                ['영력', state.stats.qi, battle.enemyStats.qi],
              ] as const).map(([lbl, myV, enV]) => (
                <div key={lbl} className="bg-[#120c08] border border-[#4a3423] py-1 px-0.5">
                  <div className="text-[9px] text-[#c7b394]">{lbl}</div>
                  <div className={`font-bold ${myV >= enV ? 'text-emerald-300' : 'text-amber-300'}`}>{myV}</div>
                  <div className="text-[9px] text-rose-400/90 border-t border-[#322217] mt-0.5 pt-0.5">{enV}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 전투 방침 3택 1 */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#fde68a]">비무 방침</div>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {([
                { id: 'AGGRESSIVE', label: '⚔ 적극 공세', sub: '공격력·속도↑' },
                { id: 'BALANCED', label: '⚖ 균형', sub: '표준 대응' },
                { id: 'COUNTER', label: '🛡 간파 반격', sub: '흘리기·반격↑' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => { sound.playClick(); onChangeTactic(t.id); }}
                  className={`p-2 text-center border-2 cursor-pointer ${
                    state.battleTactic === t.id ? 'bg-[#4a2b1a] border-[#fde047] text-[#fde68a]' : 'bg-[#1b120c] border-[#5c432c] text-[#d6cbb8]'
                  }`}
                >
                  <div className="text-[11px] sm:text-xs font-bold whitespace-nowrap">{t.label}</div>
                  <div className="text-[10px] text-[#c7b394] leading-tight mt-0.5">{t.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 출전자 선택 */}
          <div className="space-y-2">
            <button onClick={() => beginWatch('HERO')} className="w-full seal-badge py-3 px-3 sm:px-4 flex items-center justify-between cursor-pointer gap-2">
              <span className="flex items-center gap-1.5 font-bold text-xs sm:text-sm truncate">
                <User className="w-4 h-4 shrink-0" /> 도장주 직접 출전 ({state.name}, {state.age}세)
              </span>
              <span className="text-xs shrink-0">HP {Math.round(110 + state.stats.vit * 6)}</span>
            </button>

            {battle.canUseDisciple && aliveDisciples.length > 0 && (
              <div className="bg-[#1b120c] border border-[#6b4728] p-2.5 space-y-2">
                <div className="text-xs font-bold text-[#fde68a] flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> 문하생 · 자녀 대리 출전
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {aliveDisciples.map((d) => (
                    <button key={d.id} onClick={() => beginWatch('DISCIPLE', d.id)} className="rpg-btn text-left p-2 text-xs cursor-pointer">
                      <div className="font-bold text-[#fde68a] truncate">{d.name} ({d.age})</div>
                      <div className="text-[10px] text-[#c7b394]">⚔{d.stats.str} ⚡{d.stats.agi} 👁{d.stats.ins}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col justify-between bg-[#120c09] text-[#f5ecd9] p-2 sm:p-3 select-none overflow-hidden" data-tick={hudTick}>
      {/* 상단 HUD + 관전 배속 */}
      <div className="max-w-4xl w-full mx-auto space-y-1.5">
        <div className="grid grid-cols-2 gap-2 rpg-window p-2">
          <div className="space-y-1 min-w-0">
            <div className="flex justify-between gap-1 text-[11px] sm:text-sm">
              <span className="font-bold text-[#fde68a] truncate">{p?.name} ({p?.age})</span>
              <span className="text-rose-300 text-[10px] sm:text-xs shrink-0">{Math.ceil(p?.hp || 0)}/{p?.maxHp}</span>
            </div>
            <div className="h-3 bg-[#120c08] border border-[#8c6239]">
              <div className="h-full bg-[#c93b2b] transition-all duration-100" style={{ width: `${Math.max(0, ((p?.hp || 0) / (p?.maxHp || 1)) * 100)}%` }} />
            </div>
            <div className="h-1.5 bg-[#120c08] border border-[#6b4728]">
              <div className="h-full bg-blue-500" style={{ width: `${((p?.qi || 0) / (p?.maxQi || 1)) * 100}%` }} />
            </div>
            {p && (
              <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-[#c7b394] whitespace-nowrap overflow-hidden">
                <span>⚔{p.stats.str}</span>
                <span>⚡{p.stats.agi}</span>
                <span>👁{p.stats.ins}</span>
                <span>💧{p.stats.qi}</span>
              </div>
            )}
          </div>

          <div className="space-y-1 text-right min-w-0">
            <div className="flex justify-between gap-1 text-[11px] sm:text-sm">
              <span className="text-rose-300 text-[10px] sm:text-xs shrink-0">{Math.ceil(e?.hp || 0)}/{e?.maxHp}</span>
              <span className="font-bold text-rose-300 truncate">{e?.name} ({e?.age})</span>
            </div>
            <div className="h-3 bg-[#120c08] border border-[#8c6239]">
              <div className="h-full bg-[#b91c1c] ml-auto transition-all duration-100" style={{ width: `${Math.max(0, ((e?.hp || 0) / (e?.maxHp || 1)) * 100)}%` }} />
            </div>
            <div className="h-1.5 bg-[#120c08] border border-[#6b4728]">
              <div className="h-full bg-amber-500 ml-auto" style={{ width: `${((e?.posture || 0) / (e?.maxPosture || 1)) * 100}%` }} />
            </div>
            {e && (
              <div className="flex items-center justify-end gap-1.5 text-[9px] sm:text-[10px] text-rose-200/80 whitespace-nowrap overflow-hidden">
                <span>⚔{e.stats.str}</span>
                <span>⚡{e.stats.agi}</span>
                <span>👁{e.stats.ins}</span>
                <span>💧{e.stats.qi}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs px-1">
          <span className="text-[#e6d8be] truncate min-w-0">▸ {commentary}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setSpeedMult(speedMult === 1 ? 2 : 1)} className="rpg-btn px-2 py-1 text-[11px] font-bold cursor-pointer">
              {speedMult}x
            </button>
            <button onClick={handleInstantResolve} className="rpg-btn px-2 py-1 text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap">
              <FastForward className="w-3 h-3" /> 결과 즉시
            </button>
          </div>
        </div>
      </div>

      {/* 중앙 32비트 8프레임 그리드 무술 자동전투 무대 (모바일 세로에서는 520×400 대형 팔로우 카메라로 1.7배 확대!) */}
      <div
        className={`max-w-4xl w-full mx-auto relative border-4 border-[#8c6239] bg-[#1a130e] flex items-center justify-center overflow-hidden shadow-2xl ${
          isPortrait ? 'aspect-[520/400] flex-1 max-h-[54vh]' : 'aspect-[900/420] my-auto max-h-[60vh]'
        }`}
      >
        <canvas ref={canvasRef} width={viewW} height={viewH} className="pixel-canvas w-full h-full block" />
        {stage === 'RESULT' && resultOutcome && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-3 sm:p-4 animate-ink">
            <div className="rpg-window max-w-md w-full p-4 sm:p-6 text-center space-y-3">
              <h3 className={`text-2xl sm:text-3xl font-bold ${battle.spectatorMode ? 'text-[#fde68a]' : resultOutcome.victory ? 'text-[#fde68a]' : 'text-rose-400'}`}>
                {battle.spectatorMode
                  ? '★ 절정 비무 종료 ★'
                  : resultOutcome.victory
                  ? '★ 승 리 (勝利) ★'
                  : '패 배 (敗北)'}
              </h3>
              <p className="text-xs sm:text-sm text-[#e6d8be]">
                {battle.spectatorMode
                  ? `${resultOutcome.victory ? p?.name : e?.name}의 승리! 두 절정 고수의 초식에서 깊은 깨달음을 얻었다.`
                  : resultOutcome.victory
                  ? resultOutcome.endedBy === 'SURRENDER'
                    ? `${e?.name}이(가) 목검을 내려놓고 항복했다! (간파 ${resultOutcome.justParriesCount}회)`
                    : resultOutcome.endedBy === 'FATAL'
                    ? `칼끝이 급소를 갈랐다. 【${p?.sectTitle}】 ${p?.name}의 일격이 승부를 끝냈다.${(resultOutcome.fatalWoundsTaken || 0) > 0 ? ' 그러나 깊은 검상을 입었다.' : ''}`
                    : `【${p?.sectTitle}】 ${p?.name}의 무술이 상대를 제압했다! (간파 ${resultOutcome.justParriesCount}회)${(resultOutcome.fatalWoundsTaken || 0) > 0 ? ' 그러나 깊은 검상을 입었다.' : ''}`
                  : battle.isRealDuel
                  ? resultOutcome.endedBy === 'FATAL'
                    ? '급소를 베였다… 진검결투에서 쓰러졌다. 운명의 판정이 기다린다.'
                    : '진검결투에서 쓰러졌다… 운명의 판정이 기다린다.'
                  : resultOutcome.endedBy === 'SURRENDER'
                  ? `더는 버틸 수 없어 목검을 내려놓고 항복했다.${battle.isTournament ? ` ${battle.title} 탈락.` : ''}`
                  : battle.isTournament
                  ? `${battle.title}에서 아쉽게 패배했다.`
                  : '아쉬운 패배였다. 초식을 더 갈고닦자.'}
              </p>
              <button onClick={() => onFinish(resultOutcome)} className="w-full seal-badge py-2.5 sm:py-3 font-bold text-sm cursor-pointer flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> {battle.spectatorMode ? '다음 무대로 ▶' : '결과 확인 ▶'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 모바일 세로 전용 실시간 공방 중계 로그 + 하단 장착 초식 덱 */}
      <div className="max-w-4xl w-full mx-auto space-y-1.5">
        {isPortrait && battleLog.length > 0 && (
          <div className="rpg-window p-2 bg-[#1a110b]/95 space-y-0.5 text-[11px] max-h-20 overflow-hidden">
            {battleLog.slice(-3).map((line, i) => (
              <div key={i} className={`truncate ${i === battleLog.slice(-3).length - 1 ? 'text-[#fde68a] font-bold' : 'text-[#c7b394]'}`}>
                ▸ {line}
              </div>
            ))}
          </div>
        )}

        <div className="rpg-window p-1.5 sm:p-2 flex items-center justify-center gap-1.5 flex-wrap text-[11px]">
        {(p?.skills || []).map((sk, idx) => {
          const Icon = sk.element === 'FIRE' ? Flame : sk.element === 'ICE' ? Snowflake : sk.element === 'LIGHTNING' ? Zap : sk.form === 'PARRY' ? Shield : Swords;
          const isCasting = p?.action?.skill.id === sk.id;
          const latestTrait = sk.imprintedTraits[sk.imprintedTraits.length - 1];
          return (
            <div
              key={sk.id}
              className={`px-2 py-1 border flex items-center gap-1 transition-all ${
                isCasting ? 'bg-[#4a2b1a] border-[#fde047] scale-105' : 'bg-[#1b120c] border-[#6b4728]'
              }`}
            >
              <span className="text-[10px] text-amber-400 font-bold">{idx + 1}식</span>
              <Icon className="w-3 h-3 text-[#fde68a] shrink-0" />
              <span className="font-bold text-[#fde68a] whitespace-nowrap">{sk.customName || sk.name}</span>
              <span className="text-[10px] text-[#c7b394]">Lv.{sk.masteryLevel}</span>
              {sk.form === 'PARRY' && <span className="text-[9px] px-1 bg-amber-900/80 text-amber-200">반격</span>}
              {latestTrait && <span className="hidden sm:inline text-[9px] px-1 bg-[#362417] text-sky-300">{latestTrait.label}</span>}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};
