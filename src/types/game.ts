export type CountryId = 'KOREA' | 'CHINA' | 'JAPAN';
export type Gender = 'MALE' | 'FEMALE';
export type DifficultyId = 'EASY' | 'HARD' | 'HELL';
export type Season = 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';

export type ScheduleActivityId =
  | 'TRAIN'
  | 'BODY'
  | 'MIND'
  | 'DECODE'
  | 'CRAFT'
  | 'BUILD'
  | 'TEACH'
  | 'ESCORT'
  | 'REST'
  | 'SPAR'
  | 'SECLUSION' // 폐관수련 — 계절 전체를 쓰는 단독 작업
  | 'JOURNEY'; // 무사수행 — 계절 전체를 도장 밖 필드에서 보낸다

export type BattleTactic = 'AGGRESSIVE' | 'BALANCED' | 'COUNTER';

export interface ActiveCraftProject {
  skillAId: string;
  skillBId: string;
  customName: string;
  progress: number; // 0 ~ 100
}

export interface ActiveBuildProject {
  facilityKey: keyof DojoFacilities;
  targetLevel: number;
  targetName: string;
  progress: number; // 0 ~ 100
}

export interface SeasonPlan {
  activities: ScheduleActivityId[]; // 1 ~ 4개
  weights?: Partial<Record<ScheduleActivityId, number>>; // 각 활동 비중 (1 ~ 4)
  trainSkillId: string;
  decodeBookId: string;
  seclusionSkillId?: string; // 폐관수련으로 벽을 깨려는 초식
  journeyRegionId?: JourneyRegionId; // 무사수행을 떠날 지역
}

// ───────── 무사수행 ─────────
export type JourneyRegionId =
  | 'KR_JIRI'
  | 'KR_GEUMGANG'
  | 'KR_GWANSEO'
  | 'CN_HUASHAN'
  | 'CN_JIANGNAN'
  | 'CN_HUGUANG'
  | 'JP_TOKAIDO'
  | 'JP_KYOTO'
  | 'JP_KYUSHU';

export type JourneyPoiKind = 'INN' | 'MASTER' | 'TREASURE' | 'PEOPLE' | 'HISTORY' | 'SHRINE' | 'VISTA' | 'ECHO';

export interface JourneyPoi {
  id: string;
  kind: JourneyPoiKind;
  eventKey: string;
  x: number; // 구간 안에서의 위치(px)
  label: string;
  done?: boolean;
  data?: Record<string, string | number>;
}

export interface JourneyState {
  regionId: JourneyRegionId;
  day: number; // 쓴 날수
  maxDays: number; // 한 계절 = 90일
  legId: string;
  legCount: number; // 지나온 구간 수
  legLength: number; // 이번 구간 길이(px)
  heroX: number;
  pois: JourneyPoi[];
  ambushAt: number[]; // 아직 터지지 않은 돌발 사건 위치
  visitedLegs: string[];
  highlights: string[];
  start: { money: number; fame: number; health: number; stats: Stats; year: number; season: Season };
  atFork?: boolean; // 구간 끝 갈림길에 서 있다
  usedKeys?: string[]; // 이번 수행에서 이미 놓였던 사건 (같은 수행 안에서 되풀이하지 않는다)
  lastRumor?: string;
}

// ───────── 천하제일 무술대회 (실제 토너먼트) ─────────
export interface TourneyFighter {
  id: string;
  name: string;
  sect: string;
  country: CountryId;
  gender: Gender;
  bornYear: number;
  ai: EnemyAiType;
  weapon: WeaponGroup;
  skills: string[];
  potential: number; // 전성기 강도 (전투 강도 0.6 ~ 3.8)
  peakAge: number;
  titles: number; // 우승 횟수
  bestRound?: number; // 최고 성적 (0 16강 ~ 4 우승)
  kind?: 'NPC' | 'RIVAL' | 'DISCIPLE';
  discipleId?: string;
  retired?: boolean;
  epithet?: string; // 별호
}

export interface TourneyMatch {
  id: string;
  round: number; // 0 16강 · 1 8강 · 2 4강 · 3 결승
  slot: number;
  a: string; // 선수 id ('HERO'는 주인공)
  b: string;
  winner?: string;
  upset?: boolean;
  watched?: boolean;
}

export interface TourneyState {
  year: number;
  name: string;
  mode: 'ENTER' | 'WATCH';
  stage: 'QUALIFIER' | 'BRACKET' | 'DONE';
  qualifierWins: number;
  seeded: boolean; // 예선 면제 (디펜딩 챔피언·대문파)
  entrants: TourneyFighter[]; // 본선 16인 (이번 대회 시점의 강도로 고정)
  powers: Record<string, number>; // 이번 대회 시점 강도
  matches: TourneyMatch[];
  round: number;
  heroOut: boolean;
  heroBest: number; // 주인공이 오른 본선 회전 (-1 예선 탈락)
  championId?: string;
  news: string[];
}

export interface TourneyRecord {
  year: number;
  champion: string;
  championSect: string;
  runnerUp: string;
  heroResult: string;
}

// 길 위의 선택이 남긴 메아리. 때가 되면 도장(HOME)이나 다음 무사수행의 길(ROAD)로 되돌아온다.
export interface EchoEntry {
  key: string;
  dueTurn: number;
  channel: 'HOME' | 'ROAD';
  bornYear: number;
  bornText: string; // "쫓기던 서생을 숨겨 주었다" — 연대기에 원인으로 남는다
  regionId?: JourneyRegionId; // ROAD 메아리가 나타날 지역 (없으면 어디서나)
  data?: Record<string, string | number>;
}

// 폐관수련 진행 상태. 계절을 이어서 폐관하면 깨달음이 쌓이고, 관을 나섰다 돌아오면 절반이 흩어진다.
export interface SeclusionState {
  skillId: string;
  insight: number; // 깨달음 0 ~ 100
  seasons: number; // 연달아 폐관한 계절 수
  lastTurn: number; // 마지막으로 폐관한 턴
}

export interface SeasonTickResult {
  phase: 'EARLY' | 'MID' | 'LATE';
  phaseLabel: string;
  activity: ScheduleActivityId;
  location: 'DUMMY' | 'YARD' | 'HALL' | 'LIBRARY' | 'FORGE' | 'CLINIC' | 'GATE';
  floatingText: string;
  floatingColor: string;
  feedLines: Array<{ text: string; tone: 'NORMAL' | 'GOOD' | 'WARN' | 'MAGIC' }>;
  badges?: Array<{ label: string; tone: 'GOOD' | 'WARN' | 'MAGIC' }>;
  minorEventText?: string;
  minorEventTone?: 'NORMAL' | 'GOOD' | 'WARN' | 'MAGIC';
}

export interface SeasonSummaryData {
  year: number;
  season: Season;
  activitiesDone: ScheduleActivityId[];
  moneyDelta: number;
  fameDelta: number;
  healthDelta: number;
  statDeltas?: string[];
  majorEvents?: string[];
  discipleNote?: string;
  highlights: string[];
}

export type SkillForm =
  | 'SLASH'
  | 'THRUST'
  | 'STRIKE'
  | 'GRAPPLE'
  | 'STEP'
  | 'PARRY'
  | 'PROJECTILE'
  | 'AURA';

export type WeaponGroup = 'BLADE' | 'POLEARM' | 'UNARMED' | 'THROWN' | 'CATALYST' | 'ANY';

export type SkillOrigin = 'NAMELESS' | 'EASTERN' | 'WESTERN' | 'EXOTIC' | 'FANTASY';

export type SkillElement = 'PHYSICAL' | 'FIRE' | 'ICE' | 'LIGHTNING' | 'WIND' | 'QI' | 'SHADOW';

export type TelegraphType = 'YELLOW' | 'RED' | 'BLUE' | 'NONE';

export type RangeZone = 'CLOSE' | 'MID' | 'FAR' | 'ANY';

export type BookRarity = 'COMMON' | 'RARE' | 'WESTERN' | 'LEGEND' | 'GRIMOIRE' | 'LEGACY';

export type DisabilityType = 'ONE_ARM' | 'BLIND' | 'LIMP';

export type AwakeningType = 'ONE_ARM_SAINT' | 'MIND_EYE' | 'IMMOVABLE';

export type TraitTier = 3 | 6 | 9 | 10;

export interface ImprintedTrait {
  tier: TraitTier; // 10은 극의(極意) 각인 — 폐관수련·큰 깨달음으로만 연다
  id: string;
  label: string;
  description: string;
  effect: {
    damageMult?: number;
    windupMult?: number;
    cooldownMult?: number;
    postureMult?: number;
    parryWindowBonus?: number;
    counterMult?: number;
    rangeExtend?: boolean;
    unblockable?: boolean;
    armorPierce?: number;
    ignoreEvade?: boolean;
    executeThreshold?: number;
    qiGainOnHit?: number;
    statusBonus?: number;
    multiHit?: number;
    noWeaponPenalty?: boolean;
    // 운기 심법(패시브) 전용 각인 효과
    passiveQiRegenBonus?: number;
    passiveDamageReduce?: number;
    passiveAllDamageBonus?: number;
    passiveParryBonus?: number;
    passiveMaxHpBonus?: number;
    passiveHealthRegen?: number;
  };
}

export interface Skill {
  id: string;
  name: string;
  customName?: string;
  description: string;
  creator: string;
  form: SkillForm;
  weapon: WeaponGroup;
  origin: SkillOrigin[];
  element: SkillElement;
  parents?: [string, string];
  isForbidden?: boolean;
  isDegraded?: boolean;
  isMutated?: boolean;
  masteryLevel: number;
  masteryExp: number;
  imprintedTraits: ImprintedTrait[];
  pendingTraitTier?: TraitTier;
  power: number;
  windupMs: number;
  recoveryMs: number;
  cooldownMs: number;
  qiCost: number;
  range: RangeZone;
  telegraph: TelegraphType;
  postureDamage?: number;
  statusEffect?: {
    type: 'BURN' | 'FREEZE' | 'SHOCK' | 'POISON' | 'STUN' | 'BLEED' | 'WEAKEN' | 'SHIELD' | 'SLOW';
    chance: number;
    value: number;
    durationMs: number;
  };
  selfRecoil?: {
    hpPercent?: number;
    healthLoss?: number;
    lifespanYears?: number;
    durabilityLoss?: number;
  };
  isPassive?: boolean;
}

export interface Book {
  id: string;
  title: string;
  rarity: BookRarity;
  countryBias?: CountryId;
  price: number;
  decodeApRequired: number; // 1 = 100%, 2 = 180%, 3 = 260%
  decodeProgress: number; // 퍼센트 단위 (0 ~ target)
  decoded: boolean;
  unreadableHint?: string;
  enlightenmentText?: string;
  requiresMasteryLv?: number;
  requiresQi?: number;
  requiresWil?: number;
  skillTemplateId: string;
  isLegacy?: boolean;
  legacySkill?: Skill;
}

export type WeaponGrade = 'CRUDE' | 'NORMAL' | 'FINE' | 'TREASURE' | 'ARCANE';

export interface Weapon {
  id: string;
  name: string;
  customName?: string;
  group: WeaponGroup;
  grade: WeaponGrade;
  elementAffinity?: SkillElement;
  price: number;
  attack: number;
  speedBonus: number;
  range: RangeZone;
  postureBreak: number;
  upgradeLevel: number;
  durability: number;
  maxDurability: number;
  passiveText: string;
  flavorText: string;
  isHeirloom?: boolean;
  winsCount?: number;
  realDuelWins?: number;
  magicCasts?: number;
}

export interface Stats {
  str: number;
  agi: number;
  vit: number;
  wil: number;
  ins: number;
  qi: number;
}

export interface ReputationAxes {
  virtue: number;
  ruthless: number;
  commerce: number;
  ascetic: number;
  arcane: number;
}

export interface DojoFacilities {
  yard: number;
  dorm: number;
  library: number;
  forge: number;
  clinic: number;
  sanctum: number;
}

export type DiscipleRole = 'STUDENT' | 'INSTRUCTOR' | 'ESCORT' | 'HEIR';

// 문하생의 기질. 앞의 셋은 올곧은 쪽, 뒤의 다섯은 말썽을 부리는 쪽이다.
export type Temperament =
  | 'UPRIGHT' // 강직
  | 'DILIGENT' // 성실
  | 'GENTLE' // 온순
  | 'HOTBLOOD' // 다혈질 — 타 문파와 싸움을 벌인다
  | 'ARROGANT' // 오만 — 아랫사람과 마을 사람을 업신여긴다
  | 'GREEDY' // 탐욕 — 돈에 손을 댄다
  | 'LAZY' // 나태 — 수련을 빼먹고 노름판을 기웃거린다
  | 'SCHEMER'; // 흑심 — 겉으로는 따르면서 속으로 세를 모은다

// 강호의 다른 문파와 맺은 관계
export type SectKind = 'RIVAL' | 'ORTHODOX' | 'OUTLAW' | 'MERCHANT' | 'SPLINTER';
export type SectStance = 'HOSTILE' | 'COLD' | 'NEUTRAL' | 'FRIENDLY' | 'ALLIED';

export interface SectIncident {
  year: number;
  season: Season;
  text: string;
  delta: number;
}

export interface SectState {
  id: string;
  name: string;
  kind: SectKind;
  leaderTitle: string; // 장문인 · 문주 · 국주 …
  leader: string;
  champion: string; // 대신 칼을 드는 대표 무사
  style: string; // 한 줄 소개
  relation: number; // -100(불구대천) ~ 100(혈맹)
  power: number; // 세력 0 ~ 100
  met: boolean; // 아직 서로를 의식하지 않으면 false
  allied?: boolean;
  history: SectIncident[]; // 최근 사건 (최신이 앞)
}

export interface GraduatedDisciple {
  id: string;
  name: string;
  archetype: string;
  graduatedYear: number;
  graduatedAge: number;
  loyaltyAtExit: number;
  powerScore: number;
  fate: 'GRANDMASTER' | 'SUCCESSFUL' | 'ORDINARY' | 'RIVAL_BETRAYER';
  topSkillName: string;
  revisited?: boolean;
  joinedSectName?: string; // 등을 돌린 제자가 몸을 의탁한 문파
}

export interface Disciple {
  id: string;
  name: string;
  archetype: string;
  gender?: Gender;
  age: number;
  isChild?: boolean;
  childTalent?: 'PRODIGY' | 'DILIGENT' | 'SCHOLAR';
  talentElement?: SkillElement;
  talentWeapon?: WeaponGroup;
  isGenius?: boolean;
  loyalty: number;
  ambition: number;
  stats: Stats;
  role: DiscipleRole;
  skills: Skill[];
  joinedYear: number;
  tuition: number;
  isSpy?: boolean;
  dead?: boolean;
  leftReason?: string;
  weaponId?: string;
  temperament?: Temperament; // 구버전 세이브에는 없을 수 있다 (불러올 때 채운다)
  temperamentKnown?: boolean; // 스승이 기질을 파악했는가 (입문 후 한 해쯤 지켜봐야 안다)
  mask?: Temperament; // 흑심을 품은 자가 겉으로 내보이는 기질
  exposed?: boolean; // 흑심이 드러났는가
  plot?: number; // 흑심의 진척 0 ~ 100 (100이면 반란)
  watched?: boolean; // 감시를 붙였는가
}

export interface Spouse {
  id: string;
  name: string;
  gender?: Gender;
  occupation: string;
  age: number;
  bonusType: 'CLINIC' | 'COMMERCE' | 'COMBAT' | 'SCHOLAR' | 'WESTERN' | 'LOYALTY';
  bonusDesc: string;
  marriedYear: number;
  alive: boolean;
}

export interface RivalState {
  id: string;
  name: string;
  title: string;
  age: number;
  act: 0 | 1 | 2 | 3 | 4;
  winsAgainstPlayer: number;
  lossesAgainstPlayer: number;
  friendship: number;
  alive: boolean;
  lastFarewellType?: 'DUEL' | 'DRINK' | 'NONE';
}

export interface TemporaryStatus {
  id: 'LIGHT_INJURY' | 'HEAVY_INJURY' | 'PLAGUE' | 'INTERNAL_INJURY';
  label: string;
  turnsRemaining: number;
}

export type EnemyAiType = 'AGGRESSIVE' | 'DUELIST' | 'HEAVY' | 'RUSHDOWN' | 'RANGED' | 'OLD_MASTER';

export type BattleEnemyKind =
  | 'REBEL_DISCIPLE'
  | 'BETRAYER_DISCIPLE'
  | 'BLOOD_AVENGER'
  | 'RIVAL'
  | 'GRANDMASTER'
  | 'SECT_SPAR'
  | 'SECT_PEACE'
  | 'SECT_DUEL'
  | 'SECT_RAID'
  | 'SECT_AID'
  | 'ASSASSIN'
  | 'DEMON'
  | 'DEBT'
  | 'OFFICER'
  | 'FOREIGN'
  | 'THUG'
  | 'HERMIT'
  | 'TOURNAMENT'
  | 'SPAR'
  | 'BREAKER';

export interface BloodGrudge {
  id: string;
  victimName: string;
  victimTitle: string;
  victimKind: BattleEnemyKind;
  killedYear: number;
  killedTurn: number;
  sectId?: string;
  avengerRelation: '자식' | '사제(師弟)' | '동료' | '아우' | '연인' | '문도';
  avengerName: string;
  resolved?: boolean;
}

export interface BattleConfig {
  id: string;
  title: string;
  subtitle: string;
  isRealDuel: boolean;
  // 무사수행 진검승부에서 상대의 적의. MERCY: 이겨도 목숨·치명상은 봐준다. HOSTILE: 난이도에 따라 목숨을 거둘 수 있다.
  journeyStakes?: 'MERCY' | 'HOSTILE';
  canUseDisciple: boolean;
  enemyName: string;
  enemyTitle: string;
  enemyAge: number;
  enemyAi: EnemyAiType;
  enemyHp: number;
  enemyStats: Stats;
  enemyWeaponGroup: WeaponGroup;
  enemySkills: Skill[];
  enemyKind?: BattleEnemyKind;
  grudgeMeta?: {
    grudgeId?: string;
    victimName?: string;
    avengerRelation?: string;
    killedYear?: number;
    sectId?: string;
    leaderId?: string;
    followerIds?: string[];
  };
  rewardMoney?: number;
  rewardFame?: number;
  rewardBookId?: string;
  rewardWeaponId?: string;
  eventFollowupId?: string;
  isRivalBattle?: boolean;
  isTutorial?: boolean;
  isTournament?: boolean;
  tournamentRound?: number; // 1(256강) ~ 8(결승)
  tournamentName?: string;
  spectatorMode?: boolean;
  spectatorLeft?: {
    name: string;
    sectName: string;
    age: number;
    hp: number;
    stats: Stats;
    skills: Skill[];
    country: CountryId;
    gender: Gender;
  };
}

export interface GameEventOption {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface SceneDialogueLine {
  speaker: string;
  role: 'HERO' | 'NPC' | 'NARRATOR';
  stageDirection?: string; // 예: (칼자루를 천천히 고쳐 쥐며)
  text: string;
  emote?: '!' | '?' | 'ANGRY' | 'HEART';
}

export interface ActiveEvent {
  id: string;
  title: string;
  category: 'HISTORICAL' | 'LIFE' | 'DUEL' | 'FANTASY' | 'RIVAL' | 'FAMILY' | 'ONBOARDING' | 'DEBT';
  sceneActor?: 'ENEMY' | 'RIVAL' | 'DISCIPLE' | 'SPOUSE' | 'MERCHANT';
  narration: string;
  speaker?: string;
  dialogue?: string;
  script?: SceneDialogueLine[];
  outcomeScripts?: Record<string, SceneDialogueLine[]>; // 선택지별 여운 있는 2~3마디 결말 대사!
  illustration?: string; // 사건 카드 위에 띄울 장면 그림 (/assets/...)
  options: GameEventOption[];
  meta?: Record<string, unknown>;
}

export interface LogEntry {
  id: string;
  year: number;
  season: Season;
  text: string;
  type: 'NORMAL' | 'GOOD' | 'WARN' | 'DANGER' | 'MAGIC' | 'RUMOR';
}

// 생전의 굵직한 사건 기록. 사후 연대기에서 "어느 선택이 이 결과를 낳았는가"를 연도와 함께 보여 주는 데 쓴다.
export interface LifeMilestone {
  key: string; // 예: 'MEMORY_ORPHAN_ACCEPTED', 'HEIR_NAMED', 'TOURNAMENT_WIN'
  year: number;
  season: Season;
  age: number;
  text: string; // "빗속의 고아를 거두었다"처럼 과거형 한 문장
}

export interface MerchantOffer {
  books: Book[];
  weapons: Weapon[];
  greeting: string;
  hasGrimoire: boolean;
  hasLegacy: boolean;
}

export interface LegacyRecord {
  id: string;
  savedAt: string;
  country: CountryId;
  difficulty?: DifficultyId;
  founderName: string;
  sectName: string;
  finalTitle: string;
  deathYear: number;
  deathAge: number;
  deathCause: string;
  fame: number;
  usedMagic: boolean;
  signatureSkill?: Skill;
  heirloomWeapon?: Weapon;
  endingTitle: string;
}

export type ScreenPhase = 'TITLE' | 'CREATE' | 'PROLOGUE' | 'MAIN' | 'BATTLE' | 'ENDING';

export interface GameState {
  phase: ScreenPhase;
  difficulty?: DifficultyId;
  country: CountryId;
  gender: Gender;
  name: string;
  sectName: string;
  sectNamed: boolean;
  year: number;
  season: Season;
  turn: number;
  age: number;
  startAge: number;
  health: number;
  maxLifespanPenalty: number;
  ap: number;
  maxAp: number;
  money: number;
  debt: number;
  debtTurns: number;
  fame: number;
  authority: number;
  signboardStolen: boolean;
  stats: Stats;
  reputation: ReputationAxes;
  currentTitle: string;
  facilities: DojoFacilities;
  skills: Skill[];
  equippedActiveIds: string[];
  equippedPassiveIds: string[];
  books: Book[];
  weapons: Weapon[];
  equippedWeaponId: string;
  disciples: Disciple[];
  graduatedDisciples?: GraduatedDisciple[];
  sects?: SectState[]; // 구버전 세이브에는 없을 수 있다 (불러올 때 만든다)
  taughtSkillIds: string[];
  spouse: Spouse | null;
  rival: RivalState;
  statuses: TemporaryStatus[];
  disabilities: DisabilityType[];
  awakenings: AwakeningType[];
  disabilityProgress: {
    oneArmRealWins: number;
    blindParries: number;
    limpCounterWins: number;
  };
  // v3.0 계절 계획 & 진행 프로젝트
  seasonPlan: SeasonPlan;
  activeCraft: ActiveCraftProject | null;
  activeBuild: ActiveBuildProject | null;
  seclusion?: SeclusionState | null; // 구버전 세이브에는 없을 수 있다
  journey?: JourneyState | null; // 무사수행 중이면 도장 대신 필드를 보여 준다
  pendingNotice?: SceneDialogueLine[] | null; // 방금 고른 선택의 결말 대사 (결과 창이 기록 한 줄 대신 띄운다)
  journeyBattleCtx?: Record<string, string | number> | null; // 무사수행 비무가 끝난 뒤 이어 쓸 사건 정보
  tourney?: TourneyState | null; // 진행 중인 천하제일 무술대회
  tourneyRoster?: TourneyFighter[]; // 강호의 고수 명부 (대회마다 나이 들고, 은퇴하고, 새 얼굴이 나온다)
  battleTactic: BattleTactic;
  lastSeasonSummary: SeasonSummaryData | null;
  flags: {
    usedMagicPublicly: boolean;
    magicCastCount: number;
    forbiddenCastCount: number;
    realDuelWins: number;
    realDuelKills: number;
    bloodGrudges?: BloodGrudge[];
    wroteManual: boolean;
    royalAlliance: boolean;
    westernFear: boolean;
    rivalFarewellDone: boolean;
    heirConflictDone: boolean;
    heirAskedYear?: number; // 후계 지명을 마지막으로 물은(또는 미룬) 해. 재지명 이벤트의 간격 계산용
    lastDramaTurn?: number; // 문파 분쟁·제자 말썽 이벤트가 마지막으로 터진 턴 (연달아 터지지 않게)
    diplomacyTurn?: number; // 이번 계절에 문파 외교(예물·교류 비무)를 했는가
    talkTurn?: number; // 이번 계절에 제자 면담을 했는가
    rebellions?: number; // 겪은 반란 횟수
    troubleCount?: number; // 제자가 일으킨 말썽 횟수
    triggeredEvents: string[];
    recentEventBases?: string[]; // 최근 발동 이벤트 계열 기록 (중복 도배 방지!)
    minorEventIdsSeen: string[];
    storyMemory: Record<string, string>; // 사소한 NPC·과거 선택의 장기 인과 기억!
    echoes?: EchoEntry[]; // 무사수행에서 남긴 메아리 (나비효과)
    journeyDone?: string[]; // 일생에 한 번뿐인 무사수행 사건 (고수·시대 사건·대오 장소)
    journeyCount?: number;
    tourneyHistory?: TourneyRecord[];
    homeEventLast?: Record<string, number>; // 생성형 도장 사건마다 마지막으로 일어난 턴 (같은 틀이 연달아 나오지 않게)
    tutorialDone?: boolean;
    grandmasterWins?: number;
    tournamentWins?: number;
    maxParriesInBattle?: number;
    merchantVisits: number;
    hasMetMerchant: boolean;
    hasHadFirstDisciple: boolean;
    hasCraftedOnce: boolean;
    debtDeadlinePassed: boolean;
    sparringWins: number;
  };
  logs: LogEntry[];
  milestones?: LifeMilestone[]; // 구버전 세이브에는 없을 수 있다 (빈 목록으로 취급)
  activeEvent: ActiveEvent | null;
  pendingBattle: BattleConfig | null;
  merchantOffer: MerchantOffer | null;
  pendingTraitSkillId: string | null;
  deathCause: string | null;
}
