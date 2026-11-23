import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BattleTactic,
  CountryId,
  DifficultyId,
  DiscipleRole,
  DojoFacilities,
  GameState,
  Gender,
  ImprintedTrait,
  ScheduleActivityId,
  SeasonSummaryData,
  SeasonTickResult,
} from './types/game';
import {
  addLog,
  advanceSeason,
  applyBattleOutcome,
  applyImprintedTrait,
  BattleOutcomePayload,
  buildBattleConclusionNotice,
  createNewGame,
  repairPhantomMagicRecord,
  executeScheduleActivity,
  FACILITY_INFO,
  getFacilityUpgradeCost,
  getMaxActiveSlots,
  getMaxPassiveSlots,
  getShopPrice,
  getWeaponUpgradeCost,
  performDojoInvestment,
  resolveEventOption,
  rollMidSeasonEvent,
  teachSkillToDisciple,
} from './engine/gameLogic';
import { evaluateAndSaveAchievements, loadGameState, saveGameState } from './engine/storage';
import { ACHIEVEMENTS } from './data/achievements';
import { sound } from './engine/sound';
import { createBattleConfig } from './data/events';
import { BOOK_SKILL_TEMPLATES } from './data/booksAndSkills';
import { getWeaponById } from './data/weapons';
import { COUNTRIES } from './data/worldAndEndings';
import { TitleScreen } from './components/TitleScreen';
import { CharacterCreate } from './components/CharacterCreate';
import { PrologueView } from './components/PrologueView';
import { DojoSimView } from './components/DojoSimView';
import { AutoBattleView } from './components/AutoBattleView';
import { TrainingAndCraftingModal } from './components/TrainingAndCraftingModal';
import { DojoAndWeaponsModal } from './components/DojoAndWeaponsModal';
import { DisciplesAndFamilyModal } from './components/DisciplesAndFamilyModal';
import { ensureSectsAndTemperaments, expelDisciple, requestSectSpar, sendSectGift, talkToDisciple } from './engine/sectLogic';
import { EventModal, EventResultModal, EventResultNotice, MerchantModal, TraitSelectModal } from './components/MerchantAndEventModals';
import { EndingReportView } from './components/EndingReportView';
import { withMilestones } from './engine/milestones';

export function App() {
  const [state, setStateRaw] = useState<GameState | null>(null);
  // 모든 상태 변경이 이 함수를 거친다. 바뀐 내용을 이전 상태와 비교해 생전 주요 사건(milestones)을 자동 기록한다.
  const setState = useCallback((update: React.SetStateAction<GameState | null>) => {
    setStateRaw((prev) => withMilestones(prev, typeof update === 'function' ? update(prev) : update));
  }, []);
  const [creating, setCreating] = useState(false);

  const [trainModalTab, setTrainModalTab] = useState<'TRAIN' | 'CRAFT' | 'BOOKS' | null>(null);
  const [showDojoModal, setShowDojoModal] = useState(false);
  const [showDisciplesModal, setShowDisciplesModal] = useState(false);
  const [showMerchantModal, setShowMerchantModal] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [eventResultNotice, setEventResultNotice] = useState<EventResultNotice | null>(null);
  const [achToast, setAchToast] = useState<{ title: string; desc: string } | null>(null);

  // v4.0 PM2 실시간 계절 타임라인 상태 머신
  const [isRunningSeason, setIsRunningSeason] = useState(false);
  const [seasonPhaseIdx, setSeasonPhaseIdx] = useState(0);
  const [timelineProgress, setTimelineProgress] = useState(0); // 0 ~ 100
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [simSpeed, setSimSpeed] = useState<1 | 2>(1);
  const [activeTick, setActiveTick] = useState<SeasonTickResult | null>(null);
  const [seasonFeed, setSeasonFeed] = useState<Array<{ text: string; tone: 'NORMAL' | 'GOOD' | 'WARN' | 'MAGIC' }>>([]);

  const runQueueRef = useRef<{
    activities: ScheduleActivityId[];
    weights: Record<string, number>;
    totalWeight: number;
    stepIdx: number;
    midEventAfterStep: number;
    midEventChecked: boolean;
    startMoney: number;
    startFame: number;
    startHealth: number;
    startStats: GameState['stats'];
    startYear: number;
    startSeason: GameState['season'];
    majorEvents: string[];
    highlights: string[];
    skipMode: boolean;
  } | null>(null);

  useEffect(() => {
    if (state?.activeEvent) setSceneReady(false);
  }, [state?.activeEvent?.id]);

  // localStorage 자동 저장 + 도전과제 실시간 달성 판정 & 토스트 알림!
  useEffect(() => {
    if (state && state.phase !== 'TITLE' && state.phase !== 'CREATE') {
      saveGameState(state);
      const newly = evaluateAndSaveAchievements(state);
      if (newly.length > 0) {
        const def = ACHIEVEMENTS.find((a) => a.id === newly[0].id);
        if (def) {
          sound.playLevelUp();
          setAchToast({ title: def.title, desc: def.description });
        }
      }
    }
  }, [state]);

  useEffect(() => {
    if (!achToast) return;
    const t = setTimeout(() => setAchToast(null), 3600);
    return () => clearTimeout(t);
  }, [achToast]);

  // PM2 실시간 계절 타임라인 타이머 (활동 1 → [도중 주요 이벤트 인터럽트!] → 남은 활동 이어서 진행 → 다음 계절!)
  useEffect(() => {
    if (!isRunningSeason || !state) return;
    if (state.phase !== 'MAIN' || state.activeEvent || eventResultNotice || state.pendingTraitSkillId) return;

    const q = runQueueRef.current;
    if (!q) {
      setIsRunningSeason(false);
      return;
    }

    // 1. 계절 타임라인 도중 주요 이벤트 인터럽트 체크!
    if (!q.midEventChecked && q.stepIdx === q.midEventAfterStep) {
      const pauseDelay = q.skipMode ? 40 : simSpeed === 2 ? 420 : 950;
      const evTimer = setTimeout(() => {
        q.midEventChecked = true;
        const ev = rollMidSeasonEvent(state);
        if (ev) {
          q.majorEvents.push(ev.title);
          setState({ ...state, activeEvent: ev });
        } else {
          // 이벤트 없으면 바로 다음 스텝 계속 진행 트리거
          setTimelineProgress((p) => Math.min(99, p + 0.5));
        }
      }, pauseDelay);
      return () => clearTimeout(evTimer);
    }

    // 2. 활동별 실시간 진행 (1x = 1750ms 동안 PM2 활동 연출 카드 감상, 2x = 800ms)
    const delay = q.skipMode ? 40 : q.stepIdx === 0 ? 180 : simSpeed === 2 ? 800 : 1750;
    const timer = setTimeout(() => {
      if (q.stepIdx < q.activities.length) {
        const curIdx = q.stepIdx;
        const act = q.activities[curIdx];
        const w = q.weights[act] || 1;
        const share = w / Math.max(1, q.totalWeight);
        const phaseKey: 'EARLY' | 'MID' | 'LATE' =
          curIdx === 0 ? 'EARLY' : curIdx === q.activities.length - 1 ? 'LATE' : 'MID';
        setSeasonPhaseIdx(phaseKey === 'EARLY' ? 0 : phaseKey === 'MID' ? 1 : 2);
        setActiveStepIdx(curIdx);

        // 현재까지 누적 비율 계산 (타임라인 막대 게이지!)
        let accW = 0;
        for (let i = 0; i <= curIdx; i++) accW += q.weights[q.activities[i]] || 1;
        setTimelineProgress(Math.round((accW / Math.max(1, q.totalWeight)) * 100));

        const res = executeScheduleActivity(state, act, share, phaseKey);
        q.stepIdx += 1;
        setActiveTick(res.tick);
        setSeasonFeed((prev) => [...prev, ...res.tick.feedLines]);
        res.tick.feedLines.forEach((l) => q.highlights.push(l.text));

        if (res.triggerSparBattle) {
          const scale = Math.min(3.4, 0.65 + res.state.turn * 0.025 + res.state.fame * 0.004);
          const sparBattle = createBattleConfig(
            `spar_${res.state.turn}`,
            '타류 친선 대련',
            '실전 감각과 초식 숙련도를 높이는 비무',
            false,
            '타 도장 사범',
            '지역 무인',
            24 + Math.floor(Math.random() * 18),
            (['AGGRESSIVE', 'DUELIST', 'RUSHDOWN', 'HEAVY'] as const)[Math.floor(Math.random() * 4)],
            scale,
            'BLADE',
            ['base_h_slash', 'sk_kr_01', 'sk_cn_01'],
            { rewardMoney: Math.round(25 + scale * 18), rewardFame: 18 }
          );
          setState({ ...res.state, pendingBattle: sparBattle, phase: 'BATTLE' });
        } else {
          setState(res.state);
        }
      } else {
        // 모든 계획 100% 완료! → 항상 이번 계절의 변경사항(금전·능력치·주요 이벤트·문하생)을 간략 결산으로 보여주고 확인 후 다음 계절!
        const statDeltas: string[] = [];
        const keys: Array<[keyof GameState['stats'], string]> = [
          ['str', '근력'], ['agi', '민첩'], ['vit', '체력'], ['wil', '정신'], ['ins', '통찰'], ['qi', '영력'],
        ];
        keys.forEach(([k, lbl]) => {
          const diff = state.stats[k] - q.startStats[k];
          if (diff !== 0) statDeltas.push(`${lbl} ${diff > 0 ? '+' : ''}${diff}`);
        });
        const aliveCnt = state.disciples.filter((d) => !d.dead).length;
        const summary: SeasonSummaryData = {
          year: q.startYear,
          season: q.startSeason,
          activitiesDone: q.activities,
          moneyDelta: state.money - q.startMoney,
          fameDelta: state.fame - q.startFame,
          healthDelta: state.health - q.startHealth,
          statDeltas,
          majorEvents: q.majorEvents,
          discipleNote: aliveCnt > 0 ? `문하생 ${aliveCnt}명이 이번 계절 계획에 함께 참여해 성장했습니다.` : undefined,
          highlights: q.highlights.length > 0 ? q.highlights : ['평온하게 한 계절을 보냈다.'],
        };
        runQueueRef.current = null;
        setIsRunningSeason(false);
        setActiveTick(null);
        setTimelineProgress(0);
        setState({ ...state, lastSeasonSummary: summary });
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [isRunningSeason, state, simSpeed, eventResultNotice, timelineProgress]);

  const handleContinue = () => {
    const loaded = loadGameState();
    if (loaded) {
      // 구버전 세이브 안전 보정
      if (!loaded.seasonPlan) {
        loaded.seasonPlan = { activities: ['TRAIN', 'ESCORT'], trainSkillId: loaded.skills[0]?.id || 'base_h_slash', decodeBookId: '' };
      }
      if (!loaded.battleTactic) loaded.battleTactic = 'BALANCED';
      if (!loaded.flags.minorEventIdsSeen) loaded.flags.minorEventIdsSeen = [];
      if (!loaded.flags.storyMemory) loaded.flags.storyMemory = {};
      if (loaded.activeBuild === undefined) loaded.activeBuild = null;
      if (!loaded.graduatedDisciples) loaded.graduatedDisciples = [];
      if (!loaded.milestones) loaded.milestones = [];
      // 문파 관계·문하생 기질이 없던 시절의 세이브는 지금 난이도에 맞춰 채운다.
      // 대회 관전에서 남이 쓴 술법이 내 기록으로 남았던 세이브도 여기서 바로잡는다.
      setState(ensureSectsAndTemperaments(repairPhantomMagicRecord(loaded)));
      setCreating(false);
    }
  };

  const handleCreateConfirm = (country: CountryId, gender: Gender, name: string, startAge: 15 | 20 | 28, difficulty: DifficultyId) => {
    setState(createNewGame(country, gender, name, startAge, difficulty));
    setCreating(false);
  };

  if (!state) {
    if (creating) return <CharacterCreate onBack={() => setCreating(false)} onConfirm={handleCreateConfirm} />;
    return <TitleScreen onNewGame={() => setCreating(true)} onContinue={handleContinue} />;
  }

  if (state.phase === 'PROLOGUE') {
    return <PrologueView state={state} onStartDojo={() => setState({ ...state, phase: 'MAIN' })} />;
  }

  if (state.phase === 'BATTLE' && state.pendingBattle) {
    const activeBattle = state.pendingBattle;
    return (
      <AutoBattleView
        key={activeBattle.id}
        state={state}
        battle={activeBattle}
        onChangeTactic={(t: BattleTactic) => setState({ ...state, battleTactic: t })}
        onFinish={(outcome: BattleOutcomePayload) => {
          const prev = state;
          const next = applyBattleOutcome(prev, outcome);
          setState(next);
          // 사망 엔딩이 아니라면 전투 후일담 결론 컷신(EventResultModal)을 반드시 표시!
          if (next.phase === 'MAIN') {
            const conc = buildBattleConclusionNotice(prev, next, activeBattle, outcome);
            const splitLines = conc.body
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((text, idx) => ({
                speaker: idx === 0 ? conc.speaker : text.startsWith('“') ? conc.speaker : '나레이션',
                role: (text.startsWith('“') || idx === 0
                  ? conc.role === 'HERO'
                    ? 'HERO'
                    : 'NPC'
                  : 'NARRATOR') as 'HERO' | 'NPC' | 'NARRATOR',
                text,
              }));
            setEventResultNotice({
              title: conc.title,
              npcRole: conc.role === 'HERO' ? 'RIVAL' : conc.role,
              lines: splitLines,
              badges: conc.badges,
            });
          }
        }}
      />
    );
  }

  if (state.phase === 'ENDING') {
    return (
      <EndingReportView
        state={state}
        onReturnTitle={() => {
          setIsRunningSeason(false);
          runQueueRef.current = null;
          setState(null);
          setCreating(false);
        }}
      />
    );
  }

  const handleStartSeason = () => {
    if (state.seasonPlan.activities.length === 0) return;
    const wMap: Record<string, number> = {};
    let totalW = 0;
    state.seasonPlan.activities.forEach((act) => {
      const w = Math.max(1, Math.min(4, state.seasonPlan.weights?.[act] || 1));
      wMap[act] = w;
      totalW += w;
    });
    const actCount = state.seasonPlan.activities.length;
    // 계절 타임라인 중간 지점(1개면 1번째 직후, 2~4개면 절반 지점!)에 주요 이벤트 인터럽트 배치!
    const midAfter = Math.max(1, Math.ceil(actCount / 2));
    runQueueRef.current = {
      activities: [...state.seasonPlan.activities],
      weights: wMap,
      totalWeight: totalW,
      stepIdx: 0,
      midEventAfterStep: midAfter,
      midEventChecked: false,
      startMoney: state.money,
      startFame: state.fame,
      startHealth: state.health,
      startStats: { ...state.stats },
      startYear: state.year,
      startSeason: state.season,
      majorEvents: [],
      highlights: [],
      skipMode: false,
    };
    setSeasonFeed([]);
    setSeasonPhaseIdx(0);
    setActiveStepIdx(0);
    setTimelineProgress(5);
    setState({ ...state, lastSeasonSummary: null });
    setIsRunningSeason(true);
  };

  const handleToggleActive = (skillId: string) => {
    const maxA = getMaxActiveSlots(state.stats.ins);
    if (state.equippedActiveIds.includes(skillId)) {
      if (state.equippedActiveIds.length <= 1) return;
      setState({ ...state, equippedActiveIds: state.equippedActiveIds.filter((id) => id !== skillId) });
    } else if (state.equippedActiveIds.length < maxA) {
      setState({ ...state, equippedActiveIds: [...state.equippedActiveIds, skillId] });
    }
  };

  const handleTogglePassive = (skillId: string) => {
    const maxP = getMaxPassiveSlots(state.stats.qi);
    if (state.equippedPassiveIds.includes(skillId)) {
      setState({ ...state, equippedPassiveIds: state.equippedPassiveIds.filter((id) => id !== skillId) });
    } else if (state.equippedPassiveIds.length < maxP) {
      setState({ ...state, equippedPassiveIds: [...state.equippedPassiveIds, skillId] });
    }
  };

  const handleUpgradeFacility = (key: keyof DojoFacilities) => {
    const lv = state.facilities[key];
    if (lv >= 4 || state.activeBuild) return;
    const cost = getFacilityUpgradeCost(FACILITY_INFO[key].costs[lv], state);
    if (state.money < cost) return;
    const targetName = FACILITY_INFO[key].stages[lv];
    const acts = state.seasonPlan.activities.includes('BUILD')
      ? state.seasonPlan.activities
      : state.seasonPlan.activities.length < 4
      ? [...state.seasonPlan.activities, 'BUILD' as ScheduleActivityId]
      : [...state.seasonPlan.activities.slice(0, 3), 'BUILD' as ScheduleActivityId];
    setState(
      addLog(
        {
          ...state,
          money: state.money - cost,
          activeBuild: { facilityKey: key, targetLevel: lv + 1, targetName, progress: 0 },
          seasonPlan: {
            ...state.seasonPlan,
            activities: acts,
            weights: { ...(state.seasonPlan.weights || {}), BUILD: state.seasonPlan.weights?.BUILD || 1 },
          },
        },
        `${FACILITY_INFO[key].name} → 【${targetName}】 증축 공사를 착공했다! (계절 계획에 [증축] 자동 등록 · 문하생이 많을수록 완공 가속)`,
        'GOOD'
      )
    );
  };

  const handleUpgradeWeapon = (weaponId: string) => {
    const w = state.weapons.find((x) => x.id === weaponId);
    if (!w) return;
    const cost = getWeaponUpgradeCost(w.upgradeLevel, state);
    if (state.money < cost) return;
    setState(
      addLog(
        { ...state, money: state.money - cost, weapons: state.weapons.map((x) => (x.id === weaponId ? { ...x, upgradeLevel: x.upgradeLevel + 1 } : x)) },
        `「${w.customName || w.name}」을(를) +${w.upgradeLevel + 1}강으로 연마했다!`,
        'GOOD'
      )
    );
  };

  const handleSetHeirloom = (weaponId: string, customName: string) => {
    setState(
      addLog(
        { ...state, weapons: state.weapons.map((w) => ({ ...w, isHeirloom: w.id === weaponId, customName: w.id === weaponId ? customName : w.customName })) },
        `「${customName}」을(를) 유파의 가보로 선포했다!`,
        'MAGIC'
      )
    );
  };

  const handleBuyWeapon = (weaponId: string) => {
    const w = getWeaponById(weaponId);
    if (!w) return;
    const price = getShopPrice(w.price, state);
    if (state.money < price) return;
    setState(addLog({ ...state, money: state.money - price, weapons: [...state.weapons, w] }, `병기 「${w.name}」을(를) 구매했다.`, 'GOOD'));
  };

  const handleBuyMerchantBook = (bookId: string) => {
    const offerBook = state.merchantOffer?.books.find((b) => b.id === bookId);
    if (!offerBook || state.money < offerBook.price) return;
    if (state.books.some((b) => b.id === offerBook.id)) return;

    if (offerBook.decodeApRequired === 0) {
      const tpl = BOOK_SKILL_TEMPLATES[offerBook.skillTemplateId];
      const learned = tpl && !state.skills.some((s) => s.id === tpl.id) ? { ...tpl, masteryLevel: 1, masteryExp: 0, imprintedTraits: [] } : null;
      const maxA = getMaxActiveSlots(state.stats.ins);
      const nextActive = learned && !learned.isPassive && state.equippedActiveIds.length < maxA ? [...state.equippedActiveIds, learned.id] : state.equippedActiveIds;
      setState(
        addLog(
          {
            ...state,
            money: state.money - offerBook.price,
            books: [...state.books, { ...offerBook, decoded: true }],
            skills: learned ? [...state.skills, learned] : state.skills,
            equippedActiveIds: nextActive,
          },
          `만물객에게서 ${offerBook.title}을 구매하여 즉시 「${learned?.name || '초식'}」을 습득했다!`,
          'GOOD'
        )
      );
      return;
    }

    setState(
      addLog(
        {
          ...state,
          money: state.money - offerBook.price,
          books: [...state.books, { ...offerBook }],
          seasonPlan: { ...state.seasonPlan, decodeBookId: state.seasonPlan.decodeBookId || offerBook.id },
        },
        `만물객에게서 ${offerBook.title}을 구매했다! 계절 계획에 [서적 연구]를 추가해 익힐 수 있다.`,
        offerBook.rarity === 'GRIMOIRE' || offerBook.rarity === 'LEGACY' ? 'MAGIC' : 'GOOD'
      )
    );
  };

  const handleBuyMerchantWeapon = (weaponId: string) => {
    const offerW = state.merchantOffer?.weapons.find((w) => w.id === weaponId);
    if (!offerW || state.money < offerW.price) return;
    if (state.weapons.some((w) => w.id === offerW.id)) return;
    setState(addLog({ ...state, money: state.money - offerW.price, weapons: [...state.weapons, { ...offerW }] }, `만물객에게서 「${offerW.name}」을 손에 넣었다!`, 'GOOD'));
  };

  const pendingTraitSkill = state.pendingTraitSkillId ? state.skills.find((s) => s.id === state.pendingTraitSkillId) : null;

  return (
    <>
      <DojoSimView
        state={state}
        isRunningSeason={isRunningSeason}
        hasOverlayModal={!!eventResultNotice}
        seasonPhaseIdx={seasonPhaseIdx}
        timelineProgress={timelineProgress}
        activeStepIdx={activeStepIdx}
        simSpeed={simSpeed}
        activeTick={activeTick}
        seasonFeed={seasonFeed}
        onChangeSimSpeed={setSimSpeed}
        onSkipSeasonAnim={() => { if (runQueueRef.current) runQueueRef.current.skipMode = true; }}
        onSceneReady={() => setSceneReady(true)}
        onUpdatePlan={(patch) => setState({ ...state, seasonPlan: { ...state.seasonPlan, ...patch } })}
        onStartSeason={handleStartSeason}
        onCompleteTutorial={() => setState({ ...state, flags: { ...state.flags, tutorialDone: true } })}
        onOpenTrain={(tab = 'TRAIN') => setTrainModalTab(tab)}
        onOpenDojo={() => setShowDojoModal(true)}
        onOpenDisciples={() => setShowDisciplesModal(true)}
        onOpenMerchant={() => setShowMerchantModal(true)}
        onDismissSummary={() => setState(advanceSeason({ ...state, lastSeasonSummary: null }, false))}
        onReturnTitle={() => {
          saveGameState(state);
          setIsRunningSeason(false);
          runQueueRef.current = null;
          setState(null);
          setCreating(false);
        }}
      />

      {trainModalTab && (
        <TrainingAndCraftingModal
          state={state}
          initialTab={trainModalTab}
          onClose={() => setTrainModalTab(null)}
          onSelectTrainSkill={(sId) => {
            const acts = state.seasonPlan.activities.includes('TRAIN')
              ? state.seasonPlan.activities
              : state.seasonPlan.activities.length < 4
              ? [...state.seasonPlan.activities, 'TRAIN' as ScheduleActivityId]
              : state.seasonPlan.activities;
            setState({ ...state, seasonPlan: { ...state.seasonPlan, trainSkillId: sId, activities: acts } });
          }}
          onToggleEquipActive={handleToggleActive}
          onToggleEquipPassive={handleTogglePassive}
          onStartCraftProject={(aId, bId, customName) => {
            const acts = state.seasonPlan.activities.includes('CRAFT')
              ? state.seasonPlan.activities
              : state.seasonPlan.activities.length < 4
              ? [...state.seasonPlan.activities, 'CRAFT' as ScheduleActivityId]
              : [...state.seasonPlan.activities.slice(0, 3), 'CRAFT' as ScheduleActivityId];
            setState(
              addLog(
                {
                  ...state,
                  activeCraft: { skillAId: aId, skillBId: bId, customName, progress: 0 },
                  seasonPlan: { ...state.seasonPlan, activities: acts },
                },
                `「${customName}」 조합 연구 프로젝트를 개시했다! (계절 계획에 [무술 조합] 추가됨)`,
                'GOOD'
              )
            );
          }}
          onSelectDecodeBook={(bId) => {
            const acts = state.seasonPlan.activities.includes('DECODE')
              ? state.seasonPlan.activities
              : state.seasonPlan.activities.length < 4
              ? [...state.seasonPlan.activities, 'DECODE' as ScheduleActivityId]
              : [...state.seasonPlan.activities.slice(0, 3), 'DECODE' as ScheduleActivityId];
            setState({ ...state, seasonPlan: { ...state.seasonPlan, decodeBookId: bId, activities: acts } });
          }}
          onRenameSkill={(sId, newName) =>
            setState({ ...state, skills: state.skills.map((s) => (s.id === sId ? { ...s, customName: newName } : s)) })
          }
        />
      )}

      {showDojoModal && (
        <DojoAndWeaponsModal
          state={state}
          onClose={() => setShowDojoModal(false)}
          onUpgradeFacility={handleUpgradeFacility}
          onDojoInvestment={(kind) => setState(performDojoInvestment(state, kind))}
          onEquipWeapon={(wId) => setState({ ...state, equippedWeaponId: wId })}
          onUpgradeWeapon={handleUpgradeWeapon}
          onSetHeirloom={handleSetHeirloom}
          onBuyWeapon={handleBuyWeapon}
          onRenameSect={(newName) =>
            setState(addLog({ ...state, sectName: newName, sectNamed: true }, `도장 현판에 【${newName}】의 이름을 새겼다!`, 'GOOD'))
          }
          onPayDebt={(amt) => {
            if (amt <= 0) return;
            const nextDebt = Math.max(0, state.debt - amt);
            setState(
              addLog(
                { ...state, money: state.money - amt, debt: nextDebt, debtTurns: nextDebt === 0 ? 0 : state.debtTurns },
                `빚 ${amt}${COUNTRIES[state.country].currency}을 상환했다.`,
                'GOOD'
              )
            );
          }}
        />
      )}

      {showDisciplesModal && (
        <DisciplesAndFamilyModal
          state={state}
          onClose={() => setShowDisciplesModal(false)}
          onTeachAll={() => {
            const acts = state.seasonPlan.activities.includes('TEACH')
              ? state.seasonPlan.activities
              : state.seasonPlan.activities.length < 4
              ? [...state.seasonPlan.activities, 'TEACH' as ScheduleActivityId]
              : state.seasonPlan.activities;
            setState({ ...state, seasonPlan: { ...state.seasonPlan, activities: acts } });
            setShowDisciplesModal(false);
          }}
          onTeachSkill={(dId, sId) => setState(teachSkillToDisciple(state, dId, sId))}
          onSetRole={(dId, role: DiscipleRole) => {
            const nextD = state.disciples.map((d) => {
              if (role === 'HEIR' && d.role === 'HEIR' && d.id !== dId) return { ...d, role: 'INSTRUCTOR' as DiscipleRole };
              return d.id === dId ? { ...d, role } : d;
            });
            setState({ ...state, disciples: nextD });
          }}
          onTalk={(dId) => setState(talkToDisciple(state, dId))}
          onExpel={(dId) => setState(expelDisciple(state, dId))}
          onSectGift={(sectId) => setState(sendSectGift(state, sectId))}
          onSectSpar={(sectId) => {
            const next = requestSectSpar(state, sectId);
            if (next !== state) {
              setShowDisciplesModal(false);
              setState(next);
            }
          }}
        />
      )}

      {showMerchantModal && state.merchantOffer && (
        <MerchantModal
          state={state}
          offer={state.merchantOffer}
          onClose={() => setShowMerchantModal(false)}
          onBuyBook={handleBuyMerchantBook}
          onBuyWeapon={handleBuyMerchantWeapon}
        />
      )}

      {state.activeEvent && (
        <EventModal
          event={state.activeEvent}
          state={state}
          sceneReady={sceneReady}
          onSelect={(optId) => {
            const ev = state.activeEvent!;
            const next = resolveEventOption(state, ev, optId);
            setState(next);
            // 전투 직행이 아니면 선택 결과 안내 메시지와 변화량 뱃지를 여운 있게 보여줌!
            if (next.phase === 'MAIN') {
              const currency = COUNTRIES[state.country].currency;
              const badges: EventResultNotice['badges'] = [];
              const dMoney = next.money - state.money;
              const dFame = next.fame - state.fame;
              const dHealth = next.health - state.health;
              const dDisc = next.disciples.length - state.disciples.length;
              const dBook = next.books.length - state.books.length;
              const dWeapon = next.weapons.length - state.weapons.length;
              const dDebt = next.debt - state.debt;

              if (dMoney !== 0) badges.push({ label: `🪙 ${dMoney > 0 ? '+' : ''}${dMoney}${currency}`, tone: dMoney > 0 ? 'GOOD' : 'WARN' });
              if (dDebt < 0) badges.push({ label: `빚 ${Math.abs(dDebt)}${currency} 상환`, tone: 'GOOD' });
              if (dFame !== 0) badges.push({ label: `★ 명성 ${dFame > 0 ? '+' : ''}${dFame}`, tone: dFame > 0 ? 'GOOD' : 'WARN' });
              if (dHealth !== 0) badges.push({ label: `♥ 건강 ${dHealth > 0 ? '+' : ''}${dHealth}`, tone: dHealth > 0 ? 'GOOD' : 'WARN' });
              if (dDisc > 0) badges.push({ label: `👥 신규 문하생 +${dDisc}`, tone: 'GOOD' });
              if (dBook > 0) badges.push({ label: `📖 서적 획득`, tone: 'MAGIC' });
              if (dWeapon > 0) badges.push({ label: `⚔ 병기 획득`, tone: 'MAGIC' });
              if (!state.spouse && next.spouse) badges.push({ label: `♥ ${next.spouse.name} 혼인`, tone: 'MAGIC' });

              // 세평 변화
              const repPairs: Array<[keyof GameState['reputation'], string]> = [
                ['virtue', '인덕'], ['ruthless', '살기'], ['commerce', '상무'], ['ascetic', '구도'], ['arcane', '이단'],
              ];
              repPairs.forEach(([k, lbl]) => {
                const diff = next.reputation[k] - state.reputation[k];
                if (diff >= 5) badges.push({ label: `${lbl} +${diff}`, tone: k === 'arcane' ? 'MAGIC' : k === 'ruthless' ? 'WARN' : 'NORMAL' });
              });

              const latestLogText = next.logs[0]?.text || '선택에 따라 도장의 운명이 한 걸음 옮겨졌다.';
              const customOutcome = ev.outcomeScripts?.[optId];
              const npcRole: EventResultNotice['npcRole'] =
                ev.sceneActor === 'MERCHANT'
                  ? 'MERCHANT'
                  : ev.category === 'RIVAL' || ev.sceneActor === 'RIVAL'
                  ? 'RIVAL'
                  : ev.category === 'DUEL' || ev.category === 'DEBT' || ev.sceneActor === 'ENEMY'
                  ? 'ENEMY'
                  : ev.category === 'FAMILY' || ev.sceneActor === 'SPOUSE'
                  ? 'SPOUSE'
                  : 'DISCIPLE';

              setEventResultNotice({
                title: ev.title,
                npcRole,
                lines:
                  customOutcome && customOutcome.length > 0
                    ? customOutcome
                    : [{ speaker: '나레이션', role: 'NARRATOR', text: latestLogText }],
                badges,
              });
            }
          }}
        />
      )}

      {eventResultNotice && (
        <EventResultModal
          notice={eventResultNotice}
          state={state}
          onConfirm={() => {
            setEventResultNotice(null);
            // 천하제일 무술대회 8강→준결승→결승 연전이 예약되어 있으면 결말 확인 직후 바로 다음 라운드 돌입!
            if (state.pendingBattle) {
              setState((prev) => (prev && prev.pendingBattle ? { ...prev, phase: 'BATTLE' } : prev));
            }
          }}
        />
      )}

      {/* 실시간 도전과제 달성 황금 인장 토스트! */}
      {achToast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-sm pointer-events-none animate-ink">
          <div className="rpg-window px-3.5 py-2.5 bg-[#26190f]/96 border-[#fde047] shadow-2xl flex items-center gap-2.5">
            <span className="text-xl shrink-0">🏆</span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-amber-300 tracking-wider">★ 도전과제 달성!</div>
              <div className="text-xs sm:text-sm font-bold text-[#fde68a] truncate">{achToast.title}</div>
              <div className="text-[10px] text-[#d6cbb8] truncate">{achToast.desc}</div>
            </div>
          </div>
        </div>
      )}

      {pendingTraitSkill && pendingTraitSkill.pendingTraitTier && (
        <TraitSelectModal
          skill={pendingTraitSkill}
          onPick={(trait: ImprintedTrait) => setState(applyImprintedTrait(state, pendingTraitSkill.id, trait))}
        />
      )}
    </>
  );
}

export default App;
