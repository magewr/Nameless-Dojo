import {
  ActiveEvent,
  BattleConfig,
  Disciple,
  GameEventOption,
  GameState,
  Skill,
  WeaponGroup,
} from '../types/game';
import { ALL_BOOKS_CATALOG, BOOK_SKILL_TEMPLATES, createBaseSkills } from './booksAndSkills';
import { COUNTRIES } from './worldAndEndings';
import { ALL_WEAPONS_CATALOG, getWeaponById } from './weapons';
import { getTournamentName, getTournamentVenue } from './tournament';
import { josa } from '../utils/korean';
import { pickConsequenceChainEvent, pickLifeMilestoneEvent } from './storyScripts';
import {
  getDiscipleIllnessMeta,
  getFeverMedicineMeta,
  getHerbPeddlerMeta,
  getPlagueMedicineMeta,
} from './balanceRules';
import { getDifficultyConfig, getDifficultyId } from './difficulty';
import { pickDramaEvent } from './sectEvents';
import { bestSect, getSects, metSects, sectTag, worstSect } from './sects';
import { rollTemperament } from './temperament';
import { buildBloodGrudgeEvent } from './battleDialogue';

function makeEnemySkill(templateId: string, level: number): Skill {
  const base = createBaseSkills().find((s) => s.id === templateId);
  if (base) {
    return { ...base, masteryLevel: level };
  }
  const t = BOOK_SKILL_TEMPLATES[templateId];
  if (t) {
    return { ...t, masteryLevel: level, masteryExp: 0, imprintedTraits: [] };
  }
  return { ...createBaseSkills()[0], masteryLevel: level };
}

export function createBattleConfig(
  id: string,
  title: string,
  subtitle: string,
  isRealDuel: boolean,
  enemyName: string,
  enemyTitle: string,
  enemyAge: number,
  enemyAi: BattleConfig['enemyAi'],
  scale: number, // 1.0 ~ 4.0
  weaponGroup: WeaponGroup,
  skillIds: string[],
  opts?: Partial<BattleConfig>
): BattleConfig {
  const hp = Math.round(135 + scale * 110);
  const statBase = Math.round(14 + scale * 15);
  const isOld = enemyAge >= 55;
  return {
    id,
    title,
    subtitle,
    isRealDuel,
    canUseDisciple: !opts?.isTutorial,
    enemyName,
    enemyTitle,
    enemyAge,
    enemyAi,
    enemyHp: hp,
    enemyStats: {
      str: isOld ? Math.round(statBase * 0.72) : statBase + (enemyAi === 'HEAVY' ? 10 : 0),
      agi: isOld ? Math.round(statBase * 0.68) : statBase + (enemyAi === 'DUELIST' || enemyAi === 'RUSHDOWN' ? 10 : 0),
      vit: statBase,
      wil: isOld ? Math.round(statBase * 1.35) : statBase,
      ins: isOld ? Math.min(98, Math.round(statBase * 1.45)) : statBase + (enemyAi === 'DUELIST' ? 8 : 0),
      qi: isOld ? Math.round(statBase * 1.3) : Math.round(statBase * 0.7),
    },
    enemyWeaponGroup: weaponGroup,
    enemySkills: skillIds.map((sid) => makeEnemySkill(sid, Math.max(1, Math.min(9, Math.round(scale * 2.2))))),
    rewardMoney: opts?.rewardMoney ?? Math.round(25 + scale * 30),
    rewardFame: opts?.rewardFame ?? Math.round(15 + scale * 15),
    ...opts,
  };
}

// 매 계절 전환 시 조건에 맞는 스토리/역사/도장깨기/가족/라이벌 이벤트 선택
// 되풀이되는 고정 사건의 최소 간격(계절). 노년에는 1.5배로 늘린다 — 노년의 자리는 노년의 사건이 채운다.
const FIXED_EVENT_GAP: Record<string, number> = {
  disciple_graduate: 3,
  grad_revisit: 4,
  disciple_illness: 5,
  disciple_passing: 4,
  hero_fever: 4,
  random_dojo_breaker: 6,
  random_inspiration: 8,
  life_festival_demo: 8,
  life_herb_peddler: 8,
  life_night_assassin: 8,
  life_disciple_quarrel: 8,
  life_wandering_tea: 10,
  life_famine_tuition: 8,
  blood_grudge: 4,
  // 어려움·지옥의 재난은 위협으로 남기되, 같은 재난이 몇 계절 만에 다시 덮치는 반복은 막는다.
  disaster_nature: 6,
  disaster_plague: 8,
  realduel_assassin: 4,
};
export function fixedGapCooling(state: GameState, baseKey: string, gapOverride?: number): boolean {
  const gap = gapOverride ?? FIXED_EVENT_GAP[baseKey];
  if (!gap) return false;
  const last = state.flags.homeEventLast?.[`@${baseKey}`];
  if (last === undefined) return false;
  return state.turn - last < Math.round(gap * (state.age >= 55 ? 1.5 : 1));
}

export function pickSeasonalEvent(state: GameState): ActiveEvent | null {
  const triggered = new Set(state.flags.triggeredEvents);
  const cMeta = COUNTRIES[state.country];
  const parentTitle = state.country === 'CHINA' ? '어머니' : '아버지';
  const debtLabel = state.country === 'JAPAN' ? `밀린 집세 20${cMeta.currency}` : `밀린 쌀값 20${cMeta.currency}`;

  // 1. 극초반 온보딩 필수 이벤트 (2~4턴) — NPC 입장 씬 + 풍부한 티키타카 대사!
  if (state.turn === 2 && !triggered.has('onboard_thug')) {
    return {
      id: 'onboard_thug',
      title: '빗물 새는 마당의 불청객',
      category: 'ONBOARDING',
      sceneActor: 'ENEMY',
      narration: `한낮의 뙤약볕 아래, 몽둥이를 든 왈패 두목이 도장 대문을 발로 걷어차고 마당으로 성큼성큼 들어선다.`,
      speaker: '동네 왈패 두목',
      dialogue:
        state.gender === 'FEMALE'
          ? '“어허, 계집이 도장주라고? 빨래방망이나 휘두를 것이지 어디서 칼자루를 잡아!”'
          : `“야, 애송이! 네 ${parentTitle === '어머니' ? '어미' : '아비'}가 남긴 빚 20${cMeta.currency}, 오늘 당장 못 내놓으면 이 썩은 현판부터 쪼개서 땔감으로 쓰겠다!”`,
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: `끼이익—!` },
        { speaker: '나레이션', role: 'NARRATOR', text: `낡은 대문이 거칠게 열리더니, 장터 왈패 두목이 몽둥이를 어깨에 걸치고 마당으로 들어선다.` },
        {
          speaker: '동네 왈패 두목',
          role: 'NPC',
          stageDirection: '삐딱하게 고개를 꺾으며 혀를 찬다',
          emote: 'ANGRY',
          text:
            state.gender === 'FEMALE'
              ? `어허, 계집이 이 도장 주인이라고? 빨래방망이나 쥘 것이지 어디서 칼자루를 잡아.`
              : `야, 애송이. 여기가 그 이름도 없다는 촌구석 도장이냐?`,
        },
        {
          speaker: '동네 왈패 두목',
          role: 'NPC',
          text: `${parentTitle}가 남긴 ${debtLabel} 이자, 오늘 당장 내놔. 안 그러면 저 현판부터 쪼개서 땔감으로 쓰겠다.`,
        },
        {
          speaker: state.name,
          role: 'HERO',
          stageDirection: '벽에 기대어 둔 낡은 목검을 천천히 집어 들며',
          emote: '!',
          text: `약속한 기한은 겨울까지다. 남의 도장 마당에 흙발로 들어와 행패를 부리다니…… 그냥 보낼 수는 없군.`,
        },
        {
          speaker: '동네 왈패 두목',
          role: 'NPC',
          stageDirection: '코웃음을 치며 몽둥이를 고쳐 쥔다',
          text: `허, 눈빛 좀 보게? 좋아, 어디 한 번 맞아 봐야 정신을 차리지!`,
        },
      ],
      outcomeScripts: {
        pay_thug: [
          { speaker: '동네 왈패 두목', role: 'NPC', stageDirection: '동전 꾸러미를 손바닥에 튕기며 낄낄 웃는다', text: '진작 이럴 것이지. 몸 사릴 줄 아는 놈이 오래 사는 법이야. 잘 있어라!' },
          { speaker: state.name, role: 'HERO', stageDirection: '멀어지는 뒷모습을 보며 목검을 꽉 움켜쥔다', text: '……다시는 저런 놈들에게 고개 숙이지 않겠다.' },
        ],
      },
      options: [
        { id: 'fight_thug', label: '목검을 들고 마당 한가운데로 나선다', hint: '비무 방침(공세·균형·간파)을 정해 첫 실전을 치릅니다' },
        { id: 'pay_thug', label: '돈을 건네고 조용히 돌려보낸다', hint: `재화 -15${cMeta.currency}, 명성 -5`, disabled: state.money < 15, disabledReason: '재화 부족' },
      ],
    };
  }

  if (state.turn === 3 && !triggered.has('onboard_first_disciple')) {
    const dName = cMeta.discipleNames[0];
    const starterBookTitle =
      state.country === 'CHINA'
        ? '『소림장권 입문』'
        : state.country === 'JAPAN'
        ? '『거합 발도술 초본』'
        : '『조선세법 초본』';
    return {
      id: 'onboard_first_disciple',
      title: '첫 번째 문하생',
      category: 'ONBOARDING',
      sceneActor: 'DISCIPLE',
      narration: `새벽부터 대문 밖을 기웃거리던 동네 청년 ${josa(dName, '이가')} 낡은 책 한 권을 품에 안고 마당으로 걸어 들어온다.`,
      speaker: dName,
      dialogue: `“사부님! 집안 궤짝에 남아 있던 ${starterBookTitle}을 챙겨 왔습니다! 저를 제자로 받아 주십시오!”`,
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: `이른 아침. 아직 마당에 이슬이 채 마르기도 전이었다.` },
        { speaker: '나레이션', role: 'NARRATOR', text: `대문 너머로 젊은 청년 하나가 천으로 싼 낡은 책 한 권을 품에 안은 채 조심스레 마당으로 발을 들인다.` },
        { speaker: dName, role: 'NPC', stageDirection: '머리를 긁적이며 꾸벅 인사한다', emote: '?', text: `저…… 실례합니다. 혹시 저번에 장터 왈패들을 상대하셨던 도장주님이 맞으신가요?` },
        { speaker: state.name, role: 'HERO', text: `내가 맞다만, 무슨 일인가? 보시다시피 아직 문하생을 받을 만한 번듯한 곳도 아닌데.` },
        { speaker: dName, role: 'NPC', stageDirection: '품에서 낡은 무술서를 조심스레 꺼내 두 손으로 내민다', emote: '!', text: `저는 ${dName}이라고 합니다! 돈은 부족하지만 집안 궤짝에서 찾은 ${starterBookTitle}을 입문 예물로 가져왔습니다.` },
        { speaker: dName, role: 'NPC', text: `제발 저를 제자로 받아 주십시오! 마당도 쓸고 호위도 거들고, 저 책도 함께 익히고 싶습니다!` },
      ],
      outcomeScripts: {
        accept_first: [
          { speaker: dName, role: 'NPC', stageDirection: '흙바닥에 넙죽 엎드려 큰절을 올린다', text: '감사합니다, 사부님! 평생 잊지 않고 열심히 배우겠습니다!' },
          { speaker: '나레이션', role: 'NARRATOR', text: `${starterBookTitle}이(가) 장서각에 보관되었다. 이제 계절 계획에 [독서]를 넣어 새로운 초식을 익혀 보자!` },
        ],
        accept_strict: [
          { speaker: dName, role: 'NPC', stageDirection: '주먹을 불끈 쥐며 대답한다', text: '네! 울지도 않고 월사금도 꼭 맞춰 내겠습니다, 사부님!' },
          { speaker: '나레이션', role: 'NARRATOR', text: `${starterBookTitle}을(를) 받아 두고 우직한 첫 제자를 들였다. 계절 계획에 [독서]를 넣어 첫 새 초식을 익힐 수 있다!` },
        ],
      },
      options: [
        { id: 'accept_first', label: '“좋다. 오늘부터 네가 내 첫 제자다.”', hint: `${dName} 입문 · ${starterBookTitle} 획득 · 인덕 +10` },
        { id: 'accept_strict', label: '“월사금 제때 내고 울지 않을 자신 있으면 들어와라.”', hint: `${dName} 입문 · ${starterBookTitle} 획득 · 월사금↑ · 상무 +8` },
      ],
    };
  }

  if (state.turn === 4 && state.debt > 0 && !triggered.has('onboard_debt')) {
    return {
      id: 'onboard_debt',
      title: `${parentTitle}가 남긴 빚 ${state.debt}${cMeta.currency}`,
      category: 'DEBT',
      sceneActor: 'MERCHANT',
      narration: `겨울 바람이 매섭다. 빚쟁이 영감이 장부를 들고 마당에 들어선다.`,
      speaker: state.country === 'JAPAN' ? '집주인 영감' : '쌀가게 주인',
      dialogue: '“약속한 1년이 지났네. 오늘 갚으면 깨끗이 끝내고, 못 갚으면 이자가 붙을 수밖에 없네.”',
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: `첫눈이 날리는 겨울 아침. 장부를 품에 안은 ${state.country === 'JAPAN' ? '집주인 영감' : '쌀가게 주인'}이 천천히 대문을 열고 들어온다.` },
        { speaker: state.country === 'JAPAN' ? '집주인 영감' : '쌀가게 주인', role: 'NPC', text: `자네 도장, 봄보다 제법 사람 사는 꼴이 나기 시작했군. ……허나 약속은 약속이지. ${parentTitle}가 남긴 빚 ${state.debt}${cMeta.currency}, 이제 정산할 때가 되었네.` },
        { speaker: state.name, role: 'HERO', text: `(지금 가진 돈은 ${state.money}${cMeta.currency}… 여기서 빚을 털고 가면 훨씬 가벼워지겠지.)` },
      ],
      options: [
        { id: 'pay_all_debt', label: `빚 ${state.debt}${cMeta.currency}을 깨끗이 청산한다`, hint: '빚 0 · 인덕 +8 · 명성 +10', disabled: state.money < state.debt, disabledReason: '재화 부족' },
        { id: 'delay_debt', label: '1년만 더 말미를 달라고 사정한다', hint: '빚 이자 누적 · 추후 상환 가능' },
      ],
    };
  }

  // 2. 파산(빚 200+ & 4턴 이상) 위기 이벤트
  if (state.debt >= 200 && state.debtTurns >= 4) {
    return {
      id: 'debt_crisis',
      title: '사채업자의 압류 통보',
      category: 'DEBT',
      narration: `눈덩이처럼 불어난 빚(${state.debt}${cMeta.currency}) 때문에 전당포 사내들이 몽둥이와 진검을 차고 도장을 에워쌌다.`,
      speaker: '전당포 두목',
      dialogue: '“이제 말로 할 때는 지났다. 도장 집기를 팔아 갚든, 내 밑에서 해결사 노릇을 하든, 아니면 나랑 진검으로 끝장을 보든 골라!”',
      // 빚을 갚는 길이 해결사·진검결투뿐이면, 덕을 쌓아 온 도장주도 빚에 몰리는 순간 살인검으로 기울어 버린다.
      // 제자들이 품을 팔거나, 땅을 팔거나, 도장주가 직접 한 해 품을 파는 길을 나이와 상관없이 열어 둔다.
      options: [
        ...(state.disciples.filter((d) => !d.dead && !d.isChild).length >= 2
          ? [{ id: 'debt_disciples', label: '제자들이 품을 팔아 빚을 갚겠다고 나선다', hint: '빚 전액 탕감 · 인덕 +6 · 한 해 동안 제자들이 고생한다 · 문하생 충성↑' }]
          : []),
        ...(state.facilities.yard > 1 ? [{ id: 'debt_sell_land', label: '연무장 땅 절반을 팔아 빚을 갚는다', hint: '빚 전액 탕감 · 연무장 1단계 축소' }] : []),
        ...(state.age < 62
          ? [
              { id: 'debt_labor', label: '한 해 동안 장터 짐꾼·표국 일꾼으로 직접 품을 판다', hint: '빚 전액 탕감 · 건강 -10 · 명성 -8 · 상무 +10' },
              { id: 'debt_enforcer', label: '해결사 일을 1년간 맡아 빚을 탕감한다', hint: '빚 전액 탕감 · 살기 +20 · 명성 -15' },
              { id: 'debt_duel', label: '“내 목숨을 걸고 빚을 청산하겠다!” (진검결투)', hint: '⚠ 패배 시 사망/장애 · 승리 시 빚 전액 소멸 + 살기 +30' },
            ]
          : [{ id: 'debt_enforcer', label: '늙은 몸으로 전당포의 해결사 노릇을 한다', hint: '빚 전액 탕감 · 살기 +20 · 명성 -15 · 건강 -8' }]),
      ],
    };
  }

  // 2.5 생애 변곡점 컷신 (35세·50세·배우자 노년·66세 전서 집필) & 6대 인과응보 복선 회수 이벤트!
  const milestoneEv = pickLifeMilestoneEvent(state);
  if (milestoneEv) return milestoneEv;

  const karmaEv = pickConsequenceChainEvent(state);
  if (karmaEv) return karmaEv;

  // 3. 히든 판타지 충격파 이벤트 (마법 공개 사용 후)
  if (state.flags.usedMagicPublicly && !triggered.has('fan_first_shock')) {
    return {
      id: 'fan_first_shock',
      title: '허공의 불꽃 — 경악에 빠진 세상',
      category: 'FANTASY',
      narration:
        '공개 석상에서 당신의 초자연 마법이 터져 나온 뒤, 마을은 발칵 뒤집혔다. 칼끝에서 불꽃과 번개가 뿜어져 나왔다는 목격담이 하루 만에 고을 전체로 퍼져 나갔다.',
      speaker: '겁에 질린 구경꾼들',
      dialogue: '“내 두 눈으로 똑똑히 봤어! 부싯돌도 없는데 허공에서 불기둥이 솟았다니까! 사람이 아니야, 신선 아니면 요괴야!”',
      options: [
        { id: 'fan_declare_immortal', label: '“천지의 기운을 깨우친 정통 선도(仙道)다”라며 위엄 있게 선언한다', hint: '이단 +35 · 명성 +55 · 전국 구도자 유입' },
        { id: 'fan_hide_trick', label: '“서양 화약 눈속임이었을 뿐”이라며 능청스럽게 얼버무린다', hint: '이단 +12 · 관군 토벌전 지연' },
      ],
    };
  }

  if (state.flags.usedMagicPublicly && state.reputation.arcane >= 65 && !triggered.has('fan_inquisition')) {
    return {
      id: 'fan_inquisition',
      title: '관군과 퇴마사의 「요괴 도장」 토벌전',
      category: 'FANTASY',
      narration:
        '“사특한 요술로 백성을 현혹하는 도장이 있다”는 상소가 올라갔다. 붉은 부적을 붙인 도사들과 창검으로 무장한 관군 수십 명이 도장을 겹겹이 포위했다!',
      speaker: '토벌대장',
      dialogue: '“요괴 도장주는 당장 무릎을 꿇고 금서를 바쳐라! 불응하면 이 자리에서 도장을 불태워 버리겠다!”',
      options: [
        {
          id: 'fan_overwhelm',
          label: '압도적인 영력(QI)으로 하늘을 갈라 보이며 싸우지 않고 굴복시킨다',
          hint: 'QI 65 이상 필요 · 성공 시 신선문 인정 & 명성 +90',
          disabled: state.stats.qi < 65,
          disabledReason: `QI 65 필요 (현재 ${state.stats.qi})`,
        },
        { id: 'fan_fight_army', label: '토벌대장과 목숨 건 진검결투로 포위망을 뚫는다', hint: '⚠ 진검결투 · 승리 시 살기 +35, 이단 +30' },
        {
          id: 'fan_bribe_court',
          label: '거액의 은자를 바치고 호국 비술로 포장해 무마한다',
          hint: `재화 -260${cMeta.currency} · 상무 +20`,
          disabled: state.money < 260,
          disabledReason: '재화 부족',
        },
      ],
    };
  }

  if (state.flags.usedMagicPublicly && state.fame >= 180 && !triggered.has('fan_missionary')) {
    return {
      id: 'fan_missionary',
      title: '서양 선교사의 경악과 유럽으로 날아간 밀서',
      category: 'FANTASY',
      narration:
        '소문을 듣고 몰래 도장을 훔쳐보던 유럽 선교사가, 제자들이 초자연 오의를 펼치는 광경을 목격하고 성호를 그으며 기절초풍한다. 그가 본국 왕실로 보내려던 밀서를 제자가 입수했다.',
      speaker: '유럽 선교사 (밀서 내용)',
      dialogue: '“폐하, 동방의 어느 도장에 구약의 기적처럼 불과 번개를 칼로 베어 내는 인간들이 존재합니다. 함포로 이 땅을 굴복시키려는 계획은 재고하셔야 합니다…”',
      options: [
        { id: 'fan_send_letter', label: '밀서를 그대로 보내 유럽 열강이 두려워하게 만든다', hint: '이단 +20 · 사후 19세기 개항기 대체역사 보너스!' },
        { id: 'fan_invite_priest', label: '선교사를 초청해 차를 대접하고 서양 서적을 얻는다', hint: '인덕 +15 · 서양 희귀 서적 1권 획득' },
      ],
    };
  }

  // 4. 동반 노화 라이벌 4막 이벤트 — 씬 대사 강화!
  if (state.rival.alive) {
    if (state.rival.act === 0 && state.turn >= 7) {
      return {
        id: 'rival_act_1',
        title: `숙명의 첫 만남 — ${state.rival.name}`,
        category: 'RIVAL',
        sceneActor: 'RIVAL',
        narration: `또래로 보이는 날카로운 눈매의 무인 ${josa(state.rival.name, '이가')}(${state.rival.age}세) 마당에 들어선다.`,
        speaker: state.rival.name,
        dialogue: '“어디, 내 무술을 받아 낼 수 있는지 한 합 겨뤄 봅시다.”',
        script: [
          { speaker: '나레이션', role: 'NARRATOR', text: `오후의 햇살이 길게 드리운 마당. 또래로 보이는 날카로운 눈매의 검객이 천천히 대문을 넘어 걸어 들어온다.` },
          { speaker: state.rival.name, role: 'NPC', text: `여기가 요즘 소문이 들리기 시작한 【${state.sectName}】인가. 나는 ${state.rival.name}이라 하오.` },
          { speaker: state.name, role: 'HERO', text: `${state.rival.name}… 만만치 않은 기백이군. 도장깨기라도 하러 온 건가?` },
          { speaker: state.rival.name, role: 'NPC', emote: '!', text: `현판 따위엔 관심 없소. 그저 횡베기, 종베기 두 개로 도장을 일으켰다는 자가 어떤 칼을 쥐는지 내 두 눈으로 확인하고 싶었을 뿐. 한 합 겨뤄 보겠소?` },
        ],
        options: [
          { id: 'rival_1_fight', label: '흔쾌히 목검을 들고 마당에 선다 (라이벌 1막 비무)', hint: '패배해도 죽지 않음 · 일생의 라이벌 관계 시작' },
          { id: 'rival_1_tea', label: '차부터 한 잔 나누고 다음을 기약한다', hint: '우호도 +10 · 구도 +5' },
        ],
      };
    }
    if (state.rival.act === 1 && state.age >= 36) {
      return {
        id: 'rival_act_2',
        title: `중년의 재회 — 문파 대 문파`,
        category: 'RIVAL',
        narration: `어느덧 중년이 된 ${state.rival.name}(${state.rival.age}세)이(가) 전국에 이름을 날리는 대도장주가 되어 가을 비무 대회에서 당신과 마주 섰다.`,
        speaker: state.rival.name,
        dialogue: '“세월 참 빠르구려. 자네 눈가에 잔주름이 제법 늘었어. 처음엔 잡검이라 비웃었는데…… 오늘 보니 내가 틀렸던 모양이야. 자, 진심으로 가 보세!”',
        options: [
          { id: 'rival_2_fight', label: '중년의 원숙한 무술로 정면 승부한다 (라이벌 2막 비무)', hint: '승리 시 명성 +50 · 통찰 +5' },
          { id: 'rival_2_decline', label: '정중히 사양하며 서로의 성장을 인정한다', hint: '우호도 +15 · 구도 +10' },
        ],
      };
    }
    if (state.rival.act === 2 && state.age >= 54) {
      const hasDisciple = state.disciples.some((d) => !d.dead);
      return {
        id: 'rival_act_3',
        title: `세대를 건 대리전 — 두 노고수의 툇마루`,
        category: 'RIVAL',
        narration: `귀밑머리가 하얗게 센 ${state.rival.name}(${state.rival.age}세)이(가) 자신의 수제자를 데리고 찾아왔다. 툇마루에 나란히 앉아 찻잔을 기울이며 웃는다.`,
        speaker: state.rival.name,
        dialogue: '“허허, 무릎이 시려서 이제 우리 둘이 저렇게 뛰진 못하겠지. 어디, 누가 더 제자를 잘 가르쳤나 구경이나 해 보세.”',
        options: [
          {
            id: 'rival_3_disciple',
            label: '우리 도장의 대표 제자를 내보낸다 (제자 대리전)',
            hint: '제자를 직접 조작해 싸우는 세대 대결!',
            disabled: !hasDisciple,
            disabledReason: '출전 가능한 제자 없음',
          },
          { id: 'rival_3_self', label: '“아직 내 칼은 녹슬지 않았네!” 직접 나선다', hint: '노고수 대 노고수의 비무!' },
        ],
      };
    }
    if (state.rival.act === 3 && state.age >= 66 && !state.flags.rivalFarewellDone) {
      return {
        id: 'rival_act_4',
        title: `황혼의 겨울밤 — ${state.rival.name}의 마지막 방문`,
        category: 'RIVAL',
        narration: `눈발이 흩날리는 밤, 백발이 성성해진 ${state.rival.name}(${state.rival.age}세)이(가) 술병 하나와 평생 차고 다닌 명검을 들고 찾아왔다.`,
        speaker: state.rival.name,
        dialogue: '“……며칠 전부터 피를 좀 토했네. 의원 말이 올겨울을 넘기기 어렵다더군. 죽기 전에 자네 얼굴 한 번 더 보고 싶어서 왔네. 마지막으로 진검 한 합 겨뤄 보겠나, 아니면 저 술병이나 비우며 옛날얘기나 할까?”',
        options: [
          { id: 'rival_4_duel', label: '“무인답게 마지막 한 합으로 작별하세.” (최후의 진검결투)', hint: '⚠ 진검결투 · 승리 시 라이벌의 보검 유품 계승' },
          { id: 'rival_4_drink', label: '칼을 내려놓고 새벽까지 50년 세월을 회고하며 술잔을 기울인다', hint: '정신력 +10 · 구도 +20 · 사후 엔딩 특별 서사!' },
        ],
      };
    }
  }

  // 4.5 ★ 천하제일 무술대회(天下第一 武術大會) — 정확히 4년에 한 번(1754, 1758, 1762… 가을) 개최! 256강 대토너먼트!
  const tourneyId = `grand_tournament_y${state.year}`;
  if (state.year >= 1754 && (state.year - 1750) % 4 === 0 && state.season === 'AUTUMN' && !triggered.has(tourneyId)) {
    const tourneyName = getTournamentName(state.country);
    const venue = getTournamentVenue(state.country);
    const wins = state.flags.tournamentWins || 0;
    const isElder = state.age >= 55;
    const tourneyDialogue =
      wins >= 2
        ? `“통산 ${wins}회 우승에 빛나는 【${state.sectName}】의 대종사님! 이번 【${tourneyName}】에도 친히 출전해 전설을 이어 가시겠습니까, 아니면 귀빈석에서 후학들의 결전을 지켜보시겠습니까?”`
        : wins === 1
        ? `“역대 우승자 【${state.sectName}】의 ${state.name} 님이시여! 4년 만에 다시 【${tourneyName}】이 개막했습니다. 왕좌 방어전에 나서시겠습니까, 아니면 귀빈석에서 관전하시겠습니까?”`
        : isElder
        ? `“원로 사부님, 4년 만의 【${tourneyName}】이 열렸습니다. 원숙한 검리로 직접 256강에 도전하시겠습니까, 아니면 객석에서 젊은 절정 고수들의 비무를 감상하시겠습니까?”`
        : `“4년 만의 【${tourneyName}】이 열렸소! 256강 예선부터 천하 4검, 대망의 결승까지—어디까지 오르느냐에 따라 명성과 상금이 갈리며, 우승자에게는 천하 보검이 하사되오!”`;
    const tourneyScriptText =
      wins >= 1
        ? `이미 천하제일을 제패하신 큰 스승님을 위해 귀빈석도 따로 마련해 두었소. 직접 왕좌를 지키러 나서셔도, 8강부터 후학들의 검을 지켜보셔도 모두 천하의 귀감이 될 것이오.`
        : `현재 명성보다 높은 무대까지 오르면 큰 명성을 얻지만, 이름값에 비해 너무 일찍 떨어지면 체면을 구길 수 있소. 직접 출전하지 않더라도 8강부터는 객석에서 절정 고수들의 비무를 직접 관전할 수 있소.`;
    return {
      id: tourneyId,
      title: `🏆 제${Math.floor((state.year - 1750) / 4)}회 ${tourneyName}`,
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: `4년마다 열리는 천하 최대의 무림 제전! ${venue}에서 256명의 고수가 격돌하는 【${tourneyName}】이 개막했다!`,
      speaker: '대회 집행관',
      dialogue: tourneyDialogue,
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: `4년에 한 번 돌아오는 가을. 삼국 무림이 들썩이는 【${tourneyName}】의 초청장이 도장 정문에 당도했다.` },
        { speaker: '대회 집행관', role: 'NPC', stageDirection: '붉은 봉랍이 찍힌 대진표를 정중히 펼치며', text: `256강 예선부터 시작해 128강·64강·32강·16강·8강, 그리고 천하 4검이 겨루는 4강과 결승까지 이어지는 대토너먼트요!` },
        { speaker: '대회 집행관', role: 'NPC', text: tourneyScriptText },
      ],
      // 여름에 심판 초빙을 받아들였다면 올해는 심판석에서 본다
      options: [
        ...(state.flags.storyMemory?.judge === String(state.year)
          ? []
          : [
        {
          id: 'tourney_enter',
          label:
            wins >= 1
              ? `🏆 통산 ${wins + 1}회 우승을 향해 256강부터 출전한다!`
              : isElder
              ? `🏆 백발의 검으로 256강 예선부터 직접 출전한다!`
              : `🏆 256강 예선부터 직접 출전한다! (256강 → 4강 천하4검 → 결승)`,
          hint: '공식 비무(현판 보호·사망 없음) · 단계별 상금/명성 · 우승 시 천하 보검 +600!',
        },
            ]),
        {
          id: 'tourney_watch',
          label:
            state.flags.storyMemory?.judge === String(state.year)
              ? '⚖ 약속대로 심판석에 앉아 8강 · 4강 · 결승을 판정한다'
              : wins >= 1
              ? '👀 귀빈석에서 후학들의 8강 · 4강 · 결승 비무를 지켜본다'
              : isElder
              ? '👀 객석에서 젊은 절정 고수들의 8강 · 4강 · 결승을 감상한다'
              : '👀 객석에서 8강 · 4강(천하4검) · 결승 비무를 직접 관전한다!',
          hint: '천하 최강 고수들의 공방 감상 · 통찰 +6 · 영력 +5 · 초식 안목·숙련↑',
        },
      ],
      meta: { tourneyName },
    };
  }

  // 4.6 ★ 유명세에 이끌린 특정 문파 「절정 고수」 방문 결투 3종! (명성 130 / 260 / 450)
  if (state.fame >= 130 && !triggered.has('grandmaster_visit_1') && Math.random() < 0.42) {
    const gmName = state.country === 'CHINA' ? '자하검존(紫霞劍尊)' : state.country === 'JAPAN' ? '야규 쥬베이' : '백운검선(白雲劍仙)';
    const gmSect = state.country === 'CHINA' ? '화산파 장문인' : state.country === 'JAPAN' ? '신카게류 대검호' : '백운검파 장문인';
    const isRenowned = (state.flags.tournamentWins || 0) >= 1 || state.age >= 50 || state.fame >= 500;
    return {
      id: 'grandmaster_visit_1',
      title: `절정 고수의 방문 — ${gmName}`,
      category: 'DUEL',
      sceneActor: 'RIVAL',
      narration: `구름처럼 고요한 발걸음으로 ${gmSect} ${gmName}이(가) 도장 마당에 들어섰다. 문하생들이 숨조차 크게 쉬지 못한다.`,
      speaker: gmName,
      dialogue: isRenowned
        ? `“천하에 이름 높은 【${state.sectName}】 대사부님을 뵙고자 먼 길을 왔네. 동시대를 사는 검객으로서, 한 합 가르침을 나누어 보지 않겠나?”`
        : `“【${state.sectName}】의 이름이 강호에 자자하더군. 헛소문인지 진짜 검인지, 내 40년 검리로 직접 확인하러 왔네.”`,
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: `마당의 공기가 순식간에 서늘해졌다. 흰 도포 자락을 휘날리며 ${gmSect} ${gmName}이(가) 정문을 넘어 들어선다.` },
        {
          speaker: gmName,
          role: 'NPC',
          stageDirection: '현판을 올려다보며 조용히 검자루에 손을 얹는다',
          text: isRenowned
            ? `【${state.sectName}】의 명성은 이미 삼국에 자자하더군. 과연 그 칼끝에 어떤 하늘이 서려 있는지, 한 합 겨뤄 보겠나?`
            : `이름 없는 도장이 이토록 빠르게 이름을 떨치다니. 과연 그 칼에 하늘이 서려 있는지, 한 합 겨뤄 보겠나?`,
        },
      ],
      options: [
        { id: 'gm1_spar', label: '목검으로 정중히 절정 고수에게 일합을 청한다 (고난도 비무)', hint: '승리 시 명성 +65 · 상금 +120 · 전설 비급 서적 1권!' },
        { id: 'gm1_real', label: '진검을 뽑아 생사를 건 대결을 청한다 (진검결투)', hint: '⚠ 진검결투 · 승리 시 명성 +120 · 명검 노획 · 통찰/영력 +6!' },
        { id: 'gm1_tea', label: '정중히 차를 올리며 검리만 논하고 배웅한다', hint: '통찰 +3 · 구도 +12' },
      ],
      meta: { gmName, gmSect },
    };
  }

  if (state.fame >= 260 && !triggered.has('grandmaster_visit_2') && Math.random() < 0.42) {
    const gmName = state.country === 'CHINA' ? '무상대사(無相大師)' : state.country === 'JAPAN' ? '미야모토 겐지' : '철산장군(鐵山將軍)';
    const gmSect = state.country === 'CHINA' ? '소림 달마원 수좌' : state.country === 'JAPAN' ? '이천일류 전승자' : '팔도 제일창';
    const isRenowned = (state.flags.tournamentWins || 0) >= 1 || state.age >= 50;
    return {
      id: 'grandmaster_visit_2',
      title: `당대 절정의 시험 — ${gmName}`,
      category: 'DUEL',
      sceneActor: 'RIVAL',
      narration: `대지를 울리는 기백과 함께 ${gmSect} ${gmName}이(가) 도장을 찾았다. 이 시대에 손꼽히는 무림의 거목이다.`,
      speaker: gmName,
      dialogue: isRenowned
        ? `“천하제일의 명성을 얻은 【${state.sectName}】의 주인이여. 내 평생의 무도를 걸고 대등한 일합을 청하러 왔소.”`
        : `“강호에서 자네 유파를 당대 일류라 칭하더군. 진정한 절정의 벽이 어떤 것인지, 온몸으로 받아 보겠는가?”`,
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: `정문 밖에서 북소리처럼 묵직한 발걸음이 울린다. ${gmSect} ${gmName}이(가) 도장 마당 한가운데 선다.` },
        {
          speaker: gmName,
          role: 'NPC',
          stageDirection: '깊은 눈빛으로 당신을 꿰뚫어 보며',
          text: isRenowned
            ? `그대라면 내 전력을 다해도 부끄럽지 않겠군. 자, 준비되었는가?`
            : `헛된 명성이라면 내 일격에 꺾일 것이요, 진짜라면 천하가 자네 이름을 우러를 걸세. 자, 준비되었나?`,
        },
      ],
      options: [
        { id: 'gm2_spar', label: '도장의 명예를 걸고 정면 비무에 나선다 (최고난도 비무)', hint: '승리 시 명성 +95 · 상금 +200 · 보물급 명검 획득!' },
        { id: 'gm2_real', label: '모든 것을 걸고 진검으로 벽을 넘는다 (진검결투)', hint: '⚠ 진검결투 · 승리 시 명성 +160 · 신병 노획 · 전 능력치 +4!' },
        { id: 'gm2_tea', label: '예를 다해 물러서며 훗날을 기약한다', hint: '명성 -10 · 통찰 +4 · 구도 +10' },
      ],
      meta: { gmName, gmSect },
    };
  }

  if (state.fame >= 450 && !triggered.has('grandmaster_visit_3') && Math.random() < 0.45) {
    const wins = state.flags.tournamentWins || 0;
    return {
      id: 'grandmaster_visit_3',
      title: '천하무적 검마(劍魔) · 혈영(血影)의 강림',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: `붉은 노을이 마당을 물들인 저녁, 천하의 모든 고수들이 이름을 듣기만 해도 몸을 떠는 전설의 검마 혈영이 홀로 대문을 열었다.`,
      speaker: '검마 혈영',
      dialogue:
        wins >= 1
          ? `“천하제일 무술대회마저 제패한 【${state.sectName}】의 주인이라…… 과연 내 피빛 칼을 받아낼 만한 마지막 상대군.”`
          : `“삼국을 떠돌며 수백의 문파를 베었으나, 이제 내 칼을 받아낼 놈은 자네 하나 남았다더군. ……나를 즐겁게 해 보아라.”`,
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: `붉은 노을 아래, 바람조차 멎은 마당으로 낡은 흑의를 걸친 사내가 걸어 들어온다. 그저 서 있을 뿐인데 마당의 풀잎이 칼바람에 베여 나간다.` },
        {
          speaker: '검마 혈영',
          role: 'NPC',
          stageDirection: '서늘한 미소와 함께 피빛 검기를 흘리며',
          text: `그대가 【${state.sectName}】의 주인인가. 평생을 갈고닦은 그 무도가 내 칼 앞에서 몇 합이나 버틸지 시험해 주마.`,
        },
      ],
      options: [
        { id: 'gm3_spar', label: '무도인의 긍지로 정정당당히 비무로 맞선다 (초고난도 비무)', hint: '승리 시 명성 +140 · 상금 +300 · 전설 보검!' },
        { id: 'gm3_real', label: '일생의 무도를 담아 검마와 최후의 결전을 치른다 (진검결투)', hint: '⚠ 최고난도 진검결투 · 승리 시 명성 +220 · 최상급 보검 · 전 능력치 +6!' },
        { id: 'gm3_refuse', label: '“피를 부르는 칼은 내 도장의 길이 아니오” 대문을 닫는다', hint: '명성 -25 · 구도 +20 · 인덕 +15' },
      ],
    };
  }

  // 5. 가족 & 후계자 갈등 클라이맥스 (주인공 성별에 맞는 이성 반려자 매칭 & 성별 맞춤 대사 + 여성 주인공 직접 출산 리얼리티!)
  if (!state.spouse && state.age >= 24 && state.age <= 45 && state.season === 'SPRING' && Math.random() < 0.35) {
    const wantGender = state.gender === 'FEMALE' ? 'MALE' : 'FEMALE';
    const matching = cMeta.spouses.filter((sp) => !sp.gender || sp.gender === wantGender);
    const poolSp = matching.length > 0 ? matching : cMeta.spouses;
    const candidate = poolSp[Math.floor(Math.random() * poolSp.length)];
    const spouseIsMale = wantGender === 'MALE';
    const isBigDojo = state.facilities.yard >= 3 || state.fame >= 250;
    return {
      id: 'family_proposal',
      title: `봄날의 인연 — ${candidate.name}`,
      category: 'FAMILY',
      sceneActor: 'SPOUSE',
      narration: `도장 일을 돕다 자주 마주치던 ${candidate.occupation} ${candidate.name}과(와) 깊은 정이 들었다. 따뜻한 봄바람 아래, 함께 평생을 걸어갈 인연이 다가온다.`,
      speaker: candidate.name,
      dialogue: spouseIsMale
        ? isBigDojo
          ? `“수많은 문하생 앞에서 묵묵히 【${state.sectName}】을(를) 이끄는 그대를 오래 지켜보았소. 괜찮다면…… 앞으로의 세월은 내가 그대 곁을 지키며 함께 걸어가고 싶소.”`
          : '“비가 새는 마당에서 묵묵히 칼을 갈던 그대를 오래 지켜보았소. 괜찮다면…… 앞으로의 세월은 내가 그대 곁을 지키며 함께 걸어가고 싶소.”'
        : isBigDojo
        ? `“훌륭한 도장주로서 묵묵히 제자들을 이끄는 모습을 오래 지켜봤어요. 괜찮다면…… 앞으로의 세월은 제 곁에서 함께 걸어가 주실래요?”`
        : '“비가 새던 마당에서 묵묵히 칼을 닦는 모습을 오래 지켜봤어요. 괜찮다면…… 앞으로의 세월은 제 곁에서 함께 걸어가 주실래요?”',
      options: [
        { id: 'marry_yes', label: `${candidate.name}과(와) 혼례를 올린다`, hint: `배우자 보너스: ${candidate.bonusDesc}` },
        { id: 'marry_no', label: '“내 길은 아직 멀고 험하오…” 정중히 거절한다', hint: '독신 무인 유지 · 구도 +10' },
      ],
      meta: { candidate },
    };
  }

  // 아이를 낳는 쪽(여성 주인공 또는 아내)이 마흔다섯을 넘었다면 더는 아이 소식이 없다
  const bearerAge = state.gender === 'FEMALE' ? state.age : state.spouse?.age ?? 99;
  if (state.spouse && state.spouse.alive && bearerAge <= 44 && !state.disciples.some((d) => d.isChild) && state.year >= state.spouse.marriedYear + 2 && Math.random() < 0.45) {
    const childName = cMeta.childNames[Math.floor(Math.random() * cMeta.childNames.length)];
    const heroIsFemale = state.gender === 'FEMALE';
    return {
      id: 'family_child_born',
      title: heroIsFemale ? '긴 산고 끝에 찾아온 새 생명' : '새 생명의 울음소리',
      category: 'FAMILY',
      sceneActor: 'SPOUSE',
      narration: heroIsFemale
        ? `밤새 이어진 힘겨운 산고 끝에 도장 안채에서 우렁찬 아기 울음소리가 터져 나왔다. 땀에 젖어 지친 당신의 손을 ${state.spouse.name}이(가) 떨리는 손으로 꼭 붙잡는다.`
        : `도장 안채에서 우렁찬 아기 울음소리가 터져 나왔다. ${state.spouse.name}의 품에 안긴 작은 아이를 바라보며, 문득 돌아가신 부모님의 얼굴이 떠오른다.`,
      speaker: state.spouse.name,
      dialogue: heroIsFemale
        ? `“정말 고생 많았소, 여보……! 아이도 그대도 무사해서 천만다행이오. 이름은 ‘${childName}’ 어떻겠소? 당분간 칼은 내려놓고 꼭 몸조리부터 하시오!”`
        : `“여보, 어서 안아 보세요. 이름은 ‘${childName}’ 어떨까요? 이 아이가 크면 우리 도장은 어떤 모습일까요.”`,
      options: [
        {
          id: 'child_martial',
          label: '“강인한 무인으로 키워 내 유파를 잇게 하겠다.”',
          hint: heroIsFemale
            ? `자녀 ${childName} 출생 · ⚠ 출산 산고: 건강 대폭 감소 · 산후 몸조리(휴식 필수) · 산후열 위험`
            : `자녀 ${childName} 출생 (성장 후 입문)`,
        },
        {
          id: 'child_free',
          label: '“칼이든 글이든 네가 원하는 길을 걷거라.”',
          hint: heroIsFemale
            ? `자녀 ${childName} 출생 · 인덕 +10 · ⚠ 출산 산고: 건강 대폭 감소 · 산후 몸조리(휴식 필수)`
            : `자녀 ${childName} 출생 · 인덕 +10`,
        },
      ],
      meta: { childName },
    };
  }

  if (
    state.age >= 55 &&
    !state.flags.heirConflictDone &&
    state.disciples.some((d) => d.isChild && !d.dead) &&
    state.disciples.some((d) => !d.isChild && !d.dead)
  ) {
    const child = state.disciples.find((d) => d.isChild && !d.dead)!;
    const topDisciple = [...state.disciples]
      .filter((d) => !d.isChild && !d.dead)
      .sort((a, b) => (b.stats.str + b.stats.ins + b.stats.qi) - (a.stats.str + a.stats.ins + a.stats.qi))[0];
    return {
      id: 'heir_conflict',
      title: '후계자 지명의 밤 — 핏줄인가, 재능인가',
      category: 'FAMILY',
      narration: `당신의 기력이 예전 같지 않다는 걸 모두가 안다. 달빛 아래 마당 한쪽에는 평생 스승을 따르며 비전을 익힌 수제자 ${topDisciple.name}, 다른 한쪽에는 가문을 잇고자 하는 친자녀 ${child.name}이(가) 굳은 표정으로 서 있다.`,
      speaker: child.name,
      dialogue:
        child.childTalent === 'SCHOLAR'
          ? `“아버지(어머니), 저는 칼보다 장부와 외교로 도장을 지키는 편이 맞습니다. ${topDisciple.name} 사형이 무술을 잇고 제가 살림을 맡으면 어떨까요?”`
          : `“아버지(어머니), 제 몸에 흐르는 피와 평생 봐 온 이 마당을 남에게 넘길 수는 없습니다. 저에게 가보를 맡겨 주십시오!”`,
      options: [
        { id: 'heir_pick_disciple', label: `수제자 ${topDisciple.name}을(를) 2대 종주로 지명한다`, hint: child.childTalent === 'SCHOLAR' ? '황금 화합 루트! (무력+재정 완벽 계승)' : '무력 최상 계승 · 친자녀와 갈등 가능' },
        { id: 'heir_pick_child', label: `친자녀 ${child.name}에게 도장과 가보를 물려준다`, hint: '혈통 세가 계승 (재능 부족 시 초식 열화 위험)' },
      ],
      meta: { childId: child.id, discipleId: topDisciple.id },
    };
  }

  // 5.5 후계자 지명·재지명 — 55세가 넘도록 살아 있는 후계자가 없으면 주기적으로 묻는다.
  // (자녀가 없어 위의 갈등 이벤트가 뜨지 않는 경우, 지명한 후계자를 먼저 잃은 경우, 지명을 미뤄 둔 경우)
  const heirCandidates = state.disciples.filter((d) => !d.dead);
  const heirAskGap = state.age >= 68 ? 2 : 3;
  if (
    state.age >= 55 &&
    heirCandidates.length > 0 &&
    !heirCandidates.some((d) => d.role === 'HEIR') &&
    state.year - (state.flags.heirAskedYear ?? -99) >= heirAskGap
  ) {
    const lostHeir = state.disciples.find((d) => d.role === 'HEIR' && d.dead);
    const bestOf = (list: typeof heirCandidates) =>
      [...list].sort((a, b) => (b.stats.str + b.stats.ins + b.stats.qi) - (a.stats.str + a.stats.ins + a.stats.qi))[0];
    const topDisciple = bestOf(heirCandidates.filter((d) => !d.isChild));
    const child = bestOf(heirCandidates.filter((d) => d.isChild));
    const speakerD = topDisciple || child;
    const options: GameEventOption[] = [];
    if (topDisciple) {
      options.push({
        id: 'heir_pick_disciple',
        label: `${topDisciple.name}(${topDisciple.age}세)을(를) 2대 종주로 지명한다`,
        hint: '문하에서 가장 뛰어난 제자 · 유파의 정통 계승',
      });
    }
    if (child) {
      options.push({
        id: 'heir_pick_child',
        label: `친자녀 ${child.name}(${child.age}세)에게 도장과 가보를 물려준다`,
        hint: '혈통 세가 계승 (재능 부족 시 초식 열화 위험)',
      });
    }
    options.push({
      id: 'heir_postpone',
      label: '“아직은 때가 아니다.” 결정을 미룬다',
      hint: `${heirAskGap}년 뒤 다시 묻는다 · 끝내 정하지 못하면 유파는 흩어진다`,
    });
    return {
      id: `heir_appoint_${state.turn}`,
      title:
        state.flags.heirAskedYear !== undefined && state.age >= 68
          ? `더는 미룰 수 없는 물음 — ${state.age}세의 현판`
          : lostHeir
          ? '빈 자리 — 후계자를 다시 세워야 한다'
          : '누구에게 물려줄 것인가',
      category: 'FAMILY',
      sceneActor: 'DISCIPLE',
      narration: lostHeir
        ? `2대 종주로 세웠던 ${lostHeir.name}이(가) 스승보다 먼저 세상을 떠났다. 현판 아래 그 자리는 아직 비어 있고, 문하생들은 말을 아낀 채 당신의 입만 바라본다.`
        : state.flags.heirAskedYear !== undefined
        ? `${state.age}세. 미뤄 둔 물음이 다시 돌아왔다. 연무장의 문하생들은 수련 틈틈이 스승의 안색을 살핀다. 이 도장을 누가 이어받는가.`
        : `${state.age}세. 칼을 쥐는 손에 예전 같은 힘이 들어가지 않는 날이 늘었다. 【${state.sectName}】의 현판을 누구에게 넘길지, 이제는 정해야 할 때가 왔다.`,
      speaker: speakerD.name,
      dialogue: lostHeir
        ? '“스승님, 송구하오나…… 문하의 마음이 흔들리고 있습니다. 다음을 정해 주셔야 합니다.”'
        : '“스승님, 저희는 스승님이 정하시는 대로 따르겠습니다. 다만 정해 두지 않으시면…… 훗날 저희끼리 다투게 될까 두렵습니다.”',
      options,
      meta: { childId: child?.id, discipleId: topDisciple?.id },
    };
  }

  // 6. 국가별 역사 이벤트 (연도 조건)
  if (state.country === 'KOREA') {
    if (state.year >= 1752 && !triggered.has('hist_kr_gyunyeok')) {
      return {
        id: 'hist_kr_gyunyeok',
        title: '균역법과 군포 도망자',
        category: 'HISTORICAL',
        sceneActor: 'DISCIPLE',
        narration: '군포 부담을 피해 도망친 젊은 농부가 한밤중 도장 담을 넘어 숨어든다. 뒤이어 포졸들이 횃불을 들고 대문을 두드린다.',
        speaker: '도망친 농부',
        dialogue: '“제발 하룻밤만 숨겨 주십시오! 빚을 갚고 돌아갈 곳이 없습니다…”',
        options: [
          { id: 'kr_gyun_hide', label: '연무장 다락에 숨겨 주고 포졸을 돌려보낸다', hint: '인덕 +16 · 농부 무료 입문' },
          { id: 'kr_gyun_pay', label: '밀린 군포를 대신 내주고 문하생으로 거둔다', hint: '재화 -35냥 · 인덕 +22 · 명성 +15', disabled: state.money < 35, disabledReason: '재화 부족' },
          { id: 'kr_gyun_handover', label: '관법에 따라 조용히 내어 준다', hint: '재화 +25냥 · 상무 +8' },
        ],
      };
    }
    if (state.year >= 1758 && !triggered.has('hist_kr_sinbo')) {
      return {
        id: 'hist_kr_sinbo',
        title: '『무예신보(武藝新譜)』 편찬 소문',
        category: 'HISTORICAL',
        sceneActor: 'RIVAL',
        narration: '도성에서 세자의 명으로 새 무예 병서를 엮고 있다는 소식이 들려온다. 훈련도감 교관이 지방의 숨은 고수를 찾다 우리 도장에 들렀다.',
        speaker: '훈련도감 교관',
        dialogue: '“이 도장의 창작 검법이 제법 실전적이라 들었소. 나라의 병서를 엮는 일이니 초식을 좀 보여 줄 수 있겠소?”',
        options: [
          { id: 'kr_sinbo_share', label: '초식을 시연하고 교류한다', hint: '명성 +25 · 인덕 +10 · 『무예신보초』 획득' },
          { id: 'kr_sinbo_duel', label: '교관과 목검 공개 비무를 청한다', hint: '승리 시 명성 +45 · 재화 +80냥' },
          { id: 'kr_sinbo_refuse', label: '“유파의 비전은 외부에 보이지 않소” 거절한다', hint: '구도 +15 · 통찰 +3' },
        ],
      };
    }
    if (state.year >= 1762 && !triggered.has('hist_kr_1762')) {
      return {
        id: 'hist_kr_1762',
        title: '임오화변 — 뒤숭숭한 도성 민심',
        category: 'HISTORICAL',
        sceneActor: 'DISCIPLE',
        narration: '세자가 뒤주에 갇혀 승하했다는 흉흉한 소문이 저잣거리에 번진다. 민심이 흔들리고 밤길에 도적 떼가 들끓는다.',
        options: [
          { id: 'kr_1762_patrol', label: '제자들과 밤길을 순찰하며 마을 백성을 지킨다', hint: '인덕 +22 · 명성 +20' },
          { id: 'kr_1762_guard', label: '부호들의 저택 유료 경호를 맡는다', hint: '재화 +120냥 · 상무 +20' },
          { id: 'kr_1762_close', label: '대문을 닫고 수련에만 몰두한다', hint: '구도 +15 · 통찰 +3 · QI +3' },
        ],
      };
    }
    if (state.year >= 1778 && !triggered.has('hist_kr_1778')) {
      return {
        id: 'hist_kr_1778',
        title: '암행어사의 비밀 방문',
        category: 'HISTORICAL',
        sceneActor: 'MERCHANT',
        narration: '허름한 갓을 쓴 나그네가 차 한 잔을 청하며 고을 수령의 비리와 도장의 평판을 조용히 캐묻는다. 품속에서 놋쇠 마패가 살짝 비친다.',
        speaker: '허름한 나그네',
        dialogue: '“이 고을 백성들이 자네 도장을 어찌 부르는지 다 듣고 왔네. 부패한 아전들을 치려 하는데 힘을 보태겠나?”',
        options: [
          { id: 'kr_eosa_help', label: '제자들과 어사 출두를 도와 탐관오리를 제압한다', hint: '인덕 +28 · 명성 +45 · 하사금 +90냥' },
          { id: 'kr_eosa_neutral', label: '“무인은 정사에 끼지 않소” 정중히 거절한다', hint: '구도 +18 · 통찰 +3' },
        ],
      };
    }
    if (state.year >= 1790 && state.fame >= 120 && !triggered.has('hist_kr_1790')) {
      return {
        id: 'hist_kr_1790',
        title: '『무예도보통지』 편찬관의 방문',
        category: 'HISTORICAL',
        sceneActor: 'RIVAL',
        narration: '정조 임금의 명으로 국가 대사업 『무예도보통지』를 엮는 편찬관들이 전국에 명성을 떨친 우리 유파를 방문했다.',
        speaker: '규장각 검서관',
        dialogue: '“도장주님의 유파를 나라의 정식 무예 교본에 기록으로 남기고자 하옵니다.”',
        options: [
          { id: 'kr_1790_donate', label: '정통 초식 일부를 국가 교본에 기증한다', hint: '명성 +70 · 인덕 +25 · 사후 문화유산 보정' },
          { id: 'kr_1790_trade', label: '대신 서역·청나라 희귀 고서 열람을 요구한다', hint: '구도 +15 · 통찰 +6 · 명성 +30' },
        ],
      };
    }
    if (state.year >= 1801 && state.books.some((b) => b.rarity === 'WESTERN' || b.rarity === 'GRIMOIRE') && !triggered.has('hist_kr_1801')) {
      return {
        id: 'hist_kr_1801',
        title: '신유박해 — 서양 서적 수색령',
        category: 'HISTORICAL',
        sceneActor: 'ENEMY',
        narration: '조정에 서학 탄압의 광풍이 분다. 포도청 군관들이 이 도장에 서양 오랑캐 글자가 적힌 금서가 있다는 밀고를 받고 들이닥쳤다.',
        speaker: '포도청 종사관',
        dialogue: '“장서각을 당장 열어라! 이국의 사특한 서책이 나오면 도장째 폐쇄할 것이다!”',
        options: [
          { id: 'kr_1801_hide', label: '미리 장독대 밑에 감춰 두고 태연하게 장서각을 연다', hint: '통찰(INS) 판정 · 무사 통과 시 구도 +15' },
          { id: 'kr_1801_bribe', label: '은자를 찔러 주며 “그저 무술 그림책이오”라 무마한다', hint: '재화 -90냥 · 상무 +15', disabled: state.money < 90, disabledReason: '재화 부족' },
        ],
      };
    }
  } else if (state.country === 'CHINA') {
    if (state.year >= 1752 && !triggered.has('hist_cn_nanxun')) {
      return {
        id: 'hist_cn_nanxun',
        title: '건륭제 남순(南巡)과 지방 무관 검열',
        category: 'HISTORICAL',
        sceneActor: 'RIVAL',
        narration: '황제가 강남을 순행한다는 소식에 온 고을이 들썩인다. 지부 나리가 길목 경호에 동원할 무관들을 소집한다.',
        options: [
          { id: 'cn_nanxun_join', label: '적극 협조해 어가 행렬 외곽을 호위한다', hint: '재화 +75은자 · 명성 +25 · 상무 +10' },
          { id: 'cn_nanxun_skip', label: '병을 핑계로 빠지고 도장 수련을 이어간다', hint: '구도 +15 · 통찰 +2' },
        ],
      };
    }
    if (state.year >= 1756 && !triggered.has('hist_cn_canton')) {
      return {
        id: 'hist_cn_canton',
        title: '광저우 공행(十三行) 서양 상단의 호위 의뢰',
        category: 'HISTORICAL',
        sceneActor: 'MERCHANT',
        narration: '광저우 항구에 도착한 유럽 무역상단이 내륙 창고까지 비단과 유리 기구를 옮길 표사를 구한다. 보수가 어마어마하다.',
        options: [
          { id: 'cn_canton_escort', label: '표기를 꽂고 직접 호위를 완수한다 (도적 비무)', hint: '승리 시 재화 +160은자 · 상무 +25 · 서양 서적 획득!' },
          { id: 'cn_canton_refuse', label: '“오랑캐의 짐은 나르지 않는다” 거절한다', hint: '인덕 +12 · 구도 +10' },
        ],
      };
    }
    if (state.year >= 1772 && state.fame >= 100 && !triggered.has('hist_cn_tourney')) {
      return {
        id: 'hist_cn_tourney',
        title: '강남 천하 비무대회',
        category: 'HISTORICAL',
        sceneActor: 'RIVAL',
        narration: '강남 최대의 호족이 막대한 상금을 걸고 비무대회를 열었다. 소림 속가 제자와 팔괘장 고수까지 온갖 강자가 모였다.',
        options: [
          { id: 'cn_tourney_enter', label: '유파의 이름을 걸고 결승전에 출전한다', hint: '승리 시 상금 +240은자 · 명성 +65!' },
          { id: 'cn_tourney_watch', label: '관전하며 타 문파의 초식을 눈에 익힌다', hint: '구도 +12 · 통찰 +5' },
        ],
      };
    }
    if (state.year >= 1796 && !triggered.has('hist_cn_bailian')) {
      return {
        id: 'hist_cn_bailian',
        title: '백련교(白蓮敎)의 난 발발',
        category: 'HISTORICAL',
        sceneActor: 'DISCIPLE',
        narration: '가혹한 세금에 분노한 백련교도들이 봉기해 중원이 전란에 휩싸였다. 난민들이 대문 앞으로 밀려든다.',
        options: [
          { id: 'cn_bailian_shelter', label: '피난민을 도장에 수용하고 식량을 나눈다', hint: '재화 -70은자 · 인덕 +35 · 명성 +30', disabled: state.money < 70, disabledReason: '재화 부족' },
          { id: 'cn_bailian_mercenary', label: '관군 토벌대 선봉에 서서 거액의 보수를 받는다', hint: '재화 +220은자 · 살기 +18 · 상무 +15' },
          { id: 'cn_bailian_iron', label: '관군이든 반군이든 도장을 건드리면 모두 벤다', hint: '살기 +28 · 위엄 +15' },
        ],
      };
    }
    if (state.year >= 1805 && !triggered.has('hist_cn_opium')) {
      return {
        id: 'hist_cn_opium',
        title: '광둥 항구의 검은 연기 — 아편 밀수단',
        category: 'HISTORICAL',
        sceneActor: 'ENEMY',
        narration: '서양 배에서 흘러들어온 검은 연초가 부두 일대를 좀먹고 있다. 아편 밀수단이 우리 도장 문하생을 꼬드겨 은자를 빼돌린 것이 발각됐다.',
        options: [
          { id: 'cn_opium_raid', label: '아편굴로 쳐들어가 밀수단 두목을 때려눕힌다', hint: '비무 승리 시 인덕 +30 · 명성 +45' },
          { id: 'cn_opium_deal', label: '밀수단과 타협해 보호비를 받고 눈감아 준다', hint: '재화 +190은자 · 살기 +20 · 상무 +20' },
        ],
      };
    }
  } else if (state.country === 'JAPAN') {
    if (state.year >= 1754 && !triggered.has('hist_jp_shinai')) {
      return {
        id: 'hist_jp_shinai',
        title: '죽도·호구 검술 도입 논쟁',
        category: 'HISTORICAL',
        sceneActor: 'DISCIPLE',
        narration: '에도의 신흥 도장들이 대나무 죽도와 호구를 쓰고 마음껏 겨루는 시합 검술을 유행시키고 있다. 구파 원로들은 장난질이라 비난한다.',
        options: [
          { id: 'jp_shinai_adopt', label: '죽도와 호구를 도입해 문하생을 넓힌다', hint: '재화 -30료 · 상무 +12 · 명성 +20 · 죽도 획득', disabled: state.money < 30, disabledReason: '재화 부족' },
          { id: 'jp_shinai_reject', label: '“진짜 칼의 무게는 목검과 진검으로만 배운다”', hint: '구도 +15 · 살기 +10 · STR +2' },
        ],
      };
    }
    if (state.year >= 1772 && !triggered.has('hist_jp_fire')) {
      const hasIce = state.skills.some((s) => s.element === 'ICE');
      return {
        id: 'hist_jp_fire',
        title: '메이와(明和) 에도 대화재',
        category: 'HISTORICAL',
        sceneActor: 'DISCIPLE',
        narration: '건조한 봄바람을 타고 에도 시내 절반을 집어삼키는 대화재가 발생했다. 시뻘건 불길이 도장 코앞까지 밀려온다!',
        options: [
          ...(hasIce
            ? [{ id: 'jp_fire_ice_magic', label: '【히든】빙결 마법으로 도장 앞 불길을 통째로 얼려 버린다!', hint: '시설 무손상 · 명성 +80 · 이단 +40 (초자연 충격!)' }]
            : []),
          { id: 'jp_fire_evac', label: '비급과 무기만 챙겨 이웃 주민들과 안전히 대피한다', hint: '복구비 -80료 · 인덕 +25' },
          { id: 'jp_fire_defend', label: '제자들과 지붕에 올라 목숨 걸고 불길을 막아 낸다', hint: '건강 -12 · 시설 보존 · 위엄 +20' },
        ],
      };
    }
    if (state.year >= 1783 && !triggered.has('hist_jp_famine')) {
      return {
        id: 'hist_jp_famine',
        title: '덴메이(天明) 대기근과 굶주린 낭인들',
        category: 'HISTORICAL',
        sceneActor: 'ENEMY',
        narration: '아사마산 분화로 흉년이 겹쳐 굶주린 낭인 무리가 도장 쌀창고를 노리고 몰려온다.',
        options: [
          { id: 'jp_famine_feed', label: '도장 식량을 풀어 죽을 쑤어 나누어 준다', hint: '재화 -80료 · 인덕 +32 · 낭인 1명 감화 입문', disabled: state.money < 80, disabledReason: '재화 부족' },
          { id: 'jp_famine_fight', label: '칼을 빼 들어 낭인 무리를 단칼에 쫓아낸다', hint: '비무 승리 시 살기 +20 · 위엄 +15' },
        ],
      };
    }
    if (state.year >= 1795 && state.fame >= 140 && !triggered.has('hist_jp_shogun')) {
      return {
        id: 'hist_jp_shogun',
        title: '에도성 어전(御前) 시합 초청',
        category: 'HISTORICAL',
        sceneActor: 'RIVAL',
        narration: '쇼군 앞에서 전국 최고의 검객들이 자웅을 겨루는 어전 시합 초청장이 날아들었다.',
        options: [
          { id: 'jp_shogun_fight', label: '유파의 명예를 걸고 어전 시합에 출전한다', hint: '승리 시 명성 +90 · 보검 하사!' },
          { id: 'jp_shogun_pass', label: '“내 검은 권력 앞의 구경거리가 아니다” 사양한다', hint: '구도 +25 · 위엄 +15' },
        ],
      };
    }
    if (state.year >= 1804 && !triggered.has('hist_jp_blackship')) {
      return {
        id: 'hist_jp_blackship',
        title: '나가사키 북방 함선(레자노프) 소문',
        category: 'HISTORICAL',
        sceneActor: 'DISCIPLE',
        narration: '거대한 서양 함선이 나가사키에 나타나 통상을 요구했다는 소식이 에도를 뒤흔든다. “대포 앞에 칼이 무슨 소용인가”라며 제자들이 술렁인다.',
        options: [
          { id: 'jp_bs_spirit', label: '“대포마저 베어 넘길 경지를 만들면 그만이다!”', hint: '통찰 +5 · QI +5 · 구도 +15' },
          { id: 'jp_bs_calm', label: '“시대가 변해도 사람의 마음을 닦는 무도는 남는다”', hint: '인덕 +15 · 제자 충성도 상승' },
        ],
      };
    }
  }

  // 6.5 타 문파와의 사건 · 문하생의 말썽 · 반란 (난이도가 높을수록 잦다)
  const drama = pickDramaEvent(state);
  if (drama) return drama;

  // 7. 랜덤 도장깨기 / 인간 드라마 / 강호 결투 대규모 풀 (매 계절 약 56% 확률)
  if (Math.random() > 0.56) return null;

  const pool: ActiveEvent[] = [];

  // [인간 드라마 신규 8종]
  if (!triggered.has('life_drunk_smith') && state.turn >= 6) {
    pool.push({
      id: 'life_drunk_smith',
      title: '술 취한 떠돌이 대장장이',
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: '술병을 든 덥수룩한 대장장이가 처마 밑에 쓰러져 자다가 깨어나더니, 벽에 걸린 당신의 무기를 보고 눈을 번뜩인다.',
      speaker: '떠돌이 대장장이',
      dialogue: '“어이, 칼 주인! 내게 술값 스무 푼만 보태 주면 네 그 무딘 칼날을 내가 하룻밤 새 명검처럼 다듬어 주지. 어때?”',
      options: [
        { id: 'smith_pay', label: `술값 25${cMeta.currency}을 쥐여 주고 무기를 맡긴다`, hint: '장착 무기 +1강 즉시 연마!', disabled: state.money < 25, disabledReason: '재화 부족' },
        { id: 'smith_meal', label: '돈 대신 따뜻한 밥과 국을 대접한다', hint: '인덕 +12 · 50% 확률 무료 연마' },
      ],
    });
  }

  if (!triggered.has('life_poor_mother') && state.turn >= 5) {
    pool.push({
      id: 'life_poor_mother',
      title: '가난한 어머니의 간청',
      category: 'LIFE',
      sceneActor: 'SPOUSE',
      narration: '낡은 치마를 입은 아낙이 어린 아들의 손을 잡고 대문 앞에 서 있다. 동네 불량배들에게 매번 삯을 뺏긴다며 호신술이라도 배울 수 있겠느냐고 묻는다.',
      speaker: '장터 아낙',
      dialogue: '“월사금 낼 형편은 안 됩니다만… 아이가 험한 세상에서 제 몸 하나 지킬 수 있게만 가르쳐 주실 수 있을까요?”',
      options: [
        { id: 'mother_teach', label: '“돈은 필요 없소. 아이를 보내시오.”', hint: '인덕 +20 · 충직한 제자 1명 입문' },
        { id: 'mother_patrol', label: '불량배들을 직접 찾아가 혼내 주고 돈을 되찾아 준다', hint: '인덕 +15 · 명성 +18' },
        { id: 'mother_refuse', label: '도장 형편상 무료 교육은 어렵다며 돌려보낸다', hint: '상무 +8' },
      ],
    });
  }

  if (!triggered.has('life_landlord_bully') && state.turn >= 10 && state.facilities.yard <= 2) {
    pool.push({
      id: 'life_landlord_bully',
      title: '지방 토호의 도장 터 강제 매입 협박',
      category: 'LIFE',
      sceneActor: 'ENEMY',
      narration: '비단 옷을 입은 고을 토호가 하인들을 거느리고 와, 도장 터에 창고를 지어야겠다며 헐값에 땅을 넘기라고 윽박지른다.',
      speaker: '고을 토호',
      dialogue: '“고작 이런 낡은 도장 따위 붙들고 뭐 하려는가? 백 푼 줄 테니 당장 방 빼게!”',
      options: [
        { id: 'landlord_fight', label: '토호의 호위 무사를 비무로 꺾어 기세를 꺾는다', hint: '승리 시 명성 +35 · 위엄 +15' },
        { id: 'landlord_firm', label: '“내 선대의 혼이 깃든 터다. 당장 나가라!”', hint: '구도 +15 · 위엄 +10' },
      ],
    });
  }

  if (!triggered.has('life_burglar') && state.books.length >= 2) {
    pool.push({
      id: 'life_burglar',
      title: '한밤중 장서각의 도둑',
      category: 'LIFE',
      sceneActor: 'ENEMY',
      narration: '달 없는 새벽, 장서각 창문이 삐걱거리는 소리에 눈을 떴다. 검은 복면의 사내가 당신이 애지중지 모은 비급 상자에 손을 뻗고 있다!',
      options: [
        { id: 'burglar_fight', label: '목검을 들고 즉시 덮쳐 제압한다 (비무)', hint: '승리 시 명성 +25 · 도둑의 소지금 +65 노획' },
        { id: 'burglar_warn', label: '호통을 쳐서 쫓아낸다', hint: '안전 · 서적 무사 보존 · 인덕 +5' },
      ],
    });
  }

  if (!triggered.has('life_memorial') && state.turn >= 16) {
    pool.push({
      id: 'life_memorial',
      title: '선대 스승의 기일',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `어느덧 ${parentTitle}가 세상을 떠난 기일이 돌아왔다. 비가 새던 옛 마당과, 가로로 한 번 세로로 한 번 칼을 긋던 그 시절의 기억이 또렷하다.`,
      options: [
        { id: 'memorial_basic', label: '홀로 마당에 서서 밤새 횡베기와 종베기 천 번을 긋는다', hint: '원형 초식 EXP 대폭↑ · 구도 +15 · 통찰 +3' },
        { id: 'memorial_feast', label: '제자들과 조촐한 제사를 올리고 유파의 초심을 나눈다', hint: '제자 전원 충성 +12 · 인덕 +12' },
      ],
    });
  }

  if (!triggered.has('life_anniversary') && state.turn >= 40 && state.fame >= 150) {
    pool.push({
      id: 'life_anniversary',
      title: `【${state.sectName}】 창립 10주년 대잔치`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: '도장을 물려받은 지 십 년. 이제는 고을 안팎에서 수많은 문하생과 주민들이 축하 선물을 들고 대문 앞에 줄을 선다.',
      options: [
        { id: 'anniv_open', label: '마을 사람 모두에게 잔치 국수를 대접한다', hint: `재화 -60${cMeta.currency} · 인덕 +30 · 명성 +45`, disabled: state.money < 60, disabledReason: '재화 부족' },
        { id: 'anniv_tourney', label: '제자들과 공개 시연을 열어 위엄을 과시한다', hint: '명성 +40 · 위엄 +15 · 상무 +10' },
      ],
    });
  }

  if (!triggered.has('life_fallen_master') && state.fame >= 110) {
    pool.push({
      id: 'life_fallen_master',
      title: '몰락한 노사범의 현판 기탁',
      category: 'LIFE',
      sceneActor: 'RIVAL',
      narration: '이웃 고을에서 평생 도장을 지키던 늙은 사범이 후계자를 찾지 못해 문을 닫으며, 자신의 평생 비급 한 권을 당신에게 맡기러 찾아온다.',
      speaker: '늙은 도장주',
      dialogue: '“내 무술이 썩어 사라지느니, 자네처럼 살아 움직이는 도장에 보태지는 편이 낫겠지.”',
      options: [
        { id: 'fallen_accept', label: '예를 갖추어 절하고 비급을 정중히 이어받는다', hint: '희귀 서적 1권 무료 입수! · 인덕 +15 · 명성 +20' },
      ],
    });
  }

  // [특수 강호 결투 신규 4종]
  if (state.fame >= 65 && !triggered.has('duel_british_boxer')) {
    pool.push({
      id: 'duel_british_boxer',
      title: '영국 상선의 베어너클 복서 — 잭',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '항구에서 온 거구의 서양 선원이 주먹에 붕대를 감고 마당에 들어선다. “칼 따위 말고 맨주먹으로 한 판 붙어 보자”며 호탕하게 웃는다.',
      speaker: '영국 선원 잭',
      dialogue: '“런던의 브로턴식 복싱을 보여 주지! 버텨 내면 내 비전 교본을 넘겨 주마!”',
      options: [
        { id: 'boxer_fight', label: '도전을 받아들여 정면 승부한다 (비무)', hint: '승리 시 명성 +35 · 『브로턴의 권투 규칙』 획득!' },
        { id: 'boxer_drink', label: '싸움 대신 주막에서 술내기로 겨룬다', hint: '체력 +2 · 인덕 +8' },
      ],
    });
  }

  if (state.fame >= 95 && !triggered.has('duel_mongol_wrestler')) {
    pool.push({
      id: 'duel_mongol_wrestler',
      title: '북방 초원의 씨름 장사',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '곰 같은 체구의 북방 씨름 장사가 쇠사슬 같은 팔을 내보이며 도장에 도전장을 던진다.',
      options: [
        { id: 'mongol_fight', label: '힘 대 기술로 맞붙는다 (비무)', hint: '승리 시 명성 +45 · STR +3 · 재화 +90' },
        { id: 'mongol_skip', label: '정중히 사양하고 돌려보낸다', hint: '명성 -5' },
      ],
    });
  }

  if (state.fame >= 130 && !triggered.has('duel_tang_assassin')) {
    pool.push({
      id: 'duel_tang_assassin',
      title: '촉나라 당문 암기 여협객',
      category: 'DUEL',
      sceneActor: 'SPOUSE',
      narration: '비취색 도포를 걸친 냉정한 여협객이 소매 속에 암기를 품은 채 마당에 내려앉는다.',
      speaker: '당문 여협객',
      dialogue: '“근접 검술만으론 어림없을 텐데. 내 비침을 피할 수 있는지 시험해 보겠소?”',
      options: [
        { id: 'tang_fight', label: '원거리 암기 공세를 뚫고 승부한다 (비무)', hint: '승리 시 명성 +50 · 『당문 암기보』 획득!' },
        { id: 'tang_talk', label: '무술을 논하며 차를 대접한다', hint: '통찰 +3 · 인덕 +8' },
      ],
    });
  }

  if (state.flags.usedMagicPublicly && state.fame >= 200 && !triggered.has('fan_royal_summon')) {
    pool.push({
      id: 'fan_royal_summon',
      title: '황제/임금/쇼군의 비밀 국사(國師) 초빙',
      category: 'FANTASY',
      sceneActor: 'RIVAL',
      narration: '어두운 밤, 궁중 밀사가 은밀히 찾아와 당신의 기이한 초자연 도술을 나라의 비기로 삼고자 국사 초빙서를 내민다.',
      speaker: '궁중 밀사',
      dialogue: '“국고를 열어 도장을 후원하겠소. 나라의 수호 유파가 되어 주시겠소?”',
      options: [
        { id: 'royal_accept', label: '동맹을 맺고 국가 수호 유파를 선언한다', hint: '매 계절 국고 지원 +100 · 사후 국가세력급 엔딩 보정!' },
        { id: 'royal_decline', label: '“나의 무도는 권력의 칼이 아니다” 거절한다', hint: '구도 +30 · 위엄 +25' },
      ],
    });
  }

  // 프랑스 에페 결투가 앙리 뒤퐁
  if (state.fame >= 55 && !triggered.has('duel_henri')) {
    pool.push({
      id: 'duel_henri',
      title: '푸른 눈의 결투가 — 앙리 뒤퐁',
      category: 'DUEL',
      narration: '통역관을 대동한 훤칠한 유럽 신사가 가느다란 철검(에페)을 허리에 차고 마당에 들어선다.',
      speaker: '앙리 뒤퐁',
      dialogue: '“동양의 칼은 너무 무겁고 둔탁하다고 들었소. 내 프랑스 결투 검술과 한 판 겨뤄 보지 않겠소?”',
      options: [
        { id: 'henri_fight', label: '동양의 검으로 도전을 받아들인다 (비무)', hint: '승리 시 명성 +40 · 『프랑스 에페 결투 교본』 획득!' },
        { id: 'henri_decline', label: '무술 교류만 나누고 정중히 보낸다', hint: '인덕 +8 · 통찰 +2' },
      ],
    });
  }

  // 낭인 검귀 (진검결투 — 1회성 중반 위기 이벤트)
  if (state.fame >= 110 && state.turn >= 28 && !triggered.has('duel_sword_demon')) {
    pool.push({
      id: 'duel_sword_demon',
      title: '피에 굶주린 낭인 검귀 — 진검결투',
      category: 'DUEL',
      narration: '해 질 녘, 핏물이 덜 마른 칼을 어깨에 걸친 사내가 대문을 부수고 들어선다. 살기가 마당을 짓누른다.',
      speaker: '낭인 검귀',
      dialogue: '“근처 도장 셋을 박살 내고 왔다. 목검 따윈 치워. 진검으로 붙어 오늘 둘 중 하나만 살아서 나가자!”',
      options: [
        { id: 'demon_duel', label: '진검을 뽑아 들고 정면으로 맞선다 (진검결투)', hint: '⚠ 패배 시 사망/영구장애 · 승리 시 명성 +55 & 보검/명품 노획' },
        { id: 'demon_swarm', label: '제자들과 함께 에워싸 집단으로 제압해 쫓아낸다', hint: '안전 · 단 명성 -12, 위엄 -8' },
      ],
    });
  }

  // 20년 전 원수의 아들 (진검결투 — 실제 진검 원한 기록이 없을 때만 살기 높은 중년 이상 1회 발동)
  const hasRealGrudge = (state.flags.bloodGrudges || []).length > 0;
  if (!hasRealGrudge && state.reputation.ruthless >= 45 && state.age >= 42 && !triggered.has('duel_revenge_son')) {
    pool.push({
      id: 'duel_revenge_son',
      title: '스무 해 전 원수의 아들 — 진검결투',
      category: 'DUEL',
      narration: '과거 당신이 진검으로 베었던 검객의 아들이, 이십 년 동안 복수만 갈고닦아 백발이 들기 시작한 당신 앞에 나타났다.',
      speaker: '원수의 아들',
      dialogue: '“아버지의 원수! 오늘 여기서 네 목을 베어 무덤 앞에 바치겠다!”',
      options: [
        { id: 'revenge_son_duel', label: '“네 아비의 검을 기억한다. 덤벼라.” (진검결투)', hint: '⚠ 패배 시 사망/영구장애 · 승리 시 명성 +60 & 처분 결정' },
        { id: 'demon_swarm', label: '제자들과 함께 제압해 칼을 빼앗고 돌려보낸다', hint: '안전 · 위엄 소폭 하락' },
      ],
    });
  }

  // 부모님과 같은 역병 재발
  if (state.turn >= 14 && !triggered.has('life_plague')) {
    const pMeta = getPlagueMedicineMeta(state);
    const pct = Math.round(pMeta.cureChance * 100);
    pool.push({
      id: 'life_plague',
      title: '스승을 앗아간 그 역병의 재발',
      category: 'LIFE',
      narration: '프롤로그에서 부모님을 데려갔던 바로 그 지독한 열병이 다시 고을에 창궐했다. 문하생들이 쓰러지고 당신 역시 심한 오한을 느낀다.',
      options: [
        {
          id: 'plague_buy_med',
          label: `거액을 들여 최고급 약재로 모두를 치료한다 (-${pMeta.cost}${cMeta.currency})`,
          hint: `완치 확률 ${pct}% (약방·의원 배우자↑) · 실패 시 후유증/제자 피해 위험 · 인덕 +22`,
          disabled: state.money < pMeta.cost,
          disabledReason: '재화 부족',
        },
        { id: 'plague_endure', label: '약방과 호흡법으로 버텨 낸다', hint: '약방·체력에 따라 극복 또는 건강 -20 + 역병 후유증' },
      ],
    });
  }

  // 천재 고아 입문
  if (state.turn >= 8 && !triggered.has('life_genius_orphan')) {
    pool.push({
      id: 'life_genius_orphan',
      title: '빗속에 무릎 꿇은 천재 고아',
      category: 'LIFE',
      narration: '열두 살 남짓한 누더기 차림의 아이가 사흘 밤낮으로 대문 앞에 무릎을 꿇고 있다. 굶주렸으나 눈빛이 칼날처럼 날카롭다.',
      speaker: '고아 소년',
      dialogue: '“밥만 먹여 주시면 평생 마당을 쓸겠습니다. 제발 칼을 가르쳐 주십시오!”',
      options: [
        { id: 'orphan_accept', label: '안으로 들여 내문 제자로 거둔다', hint: '【천재】 태그 제자 영입! · 인덕 +15' },
        { id: 'orphan_reject', label: '은자 몇 푼만 쥐여 돌려보낸다', hint: `재화 -10${cMeta.currency} · 인덕 +5` },
      ],
    });
  }

  // 흉년 월사금 (최근 쿨다운 적용!)
  if (state.disciples.filter((d) => !d.dead).length >= 2 && !(state.flags.recentEventBases || []).includes('life_famine_tuition')) {
    pool.push({
      id: 'life_famine_tuition',
      title: '흉년과 밀린 월사금',
      category: 'LIFE',
      narration: '가뭄이 들어 농사꾼 집안 문하생들이 석 달째 월사금을 내지 못하고 고개를 숙인다.',
      speaker: '문하생 대표',
      dialogue: '“사부님, 면목 없습니다. 가을 추수가 끝나면 꼭 갚겠습니다…”',
      options: [
        { id: 'famine_forgive', label: '“돈 없으면 마당이나 쓸어라. 수련은 멈추지 마라.”', hint: '인덕 +18 · 제자 충성도 & 성장률 상승' },
        { id: 'famine_strict', label: '“도장도 유지해야 한다. 밀린 몫은 받아야겠다.”', hint: `재화 +35${cMeta.currency} · 상무 +12 · 충성도 소폭↓` },
      ],
    });
  }

  // 비급 출간 제안
  if (state.fame >= 90 && state.skills.length >= 4 && !triggered.has('life_publish')) {
    pool.push({
      id: 'life_publish',
      title: '거상의 비급서 출판 제안',
      category: 'LIFE',
      narration: '도성 제일의 서책방 주인이 거액의 돈보따리를 들고 찾아와, 당신이 창시한 무술의 입문서를 목판으로 찍어 팔자고 제안한다.',
      options: [
        { id: 'publish_yes', label: '기초 입문서만 발췌해 출간을 허락한다', hint: `재화 +220${cMeta.currency} · 명성 +30 · 상무 +25` },
        { id: 'publish_no', label: '“무술은 종이가 아니라 땀으로 전하는 것” 거절한다', hint: '구도 +20 · 통찰 +3' },
      ],
    });
  }

  // 산중 은둔 노고수 (후반 기연)
  if (state.age >= 45 && !triggered.has('duel_hermit')) {
    const isPeer = state.age >= 55 || (state.flags.tournamentWins || 0) >= 1;
    pool.push({
      id: 'duel_hermit',
      title: '산중의 늙은 은둔 고수',
      category: 'DUEL',
      narration: '짚신을 신은 허름한 백발 노인이 대나무 지팡이를 짚고 마당에 들어선다. 발걸음에 소리가 전혀 없다.',
      speaker: '은둔 노고수',
      dialogue: isPeer
        ? `“허허, 천하에 이름난 【${state.sectName}】 대종사의 검을 한 번 뵙고 싶어 산을 내려왔네. 늙은이 둘이서 세 합만 나누어 보지 않겠나?”`
        : '“자네 칼에 제법 깊은 냄새가 배었더군. 늙은이 심심풀이로 세 합만 맞춰 주겠나?”',
      options: [
        { id: 'hermit_fight', label: '예를 갖추고 비무를 청한다 (최상급 노고수 AI)', hint: '승패 무관 통찰/QI 대폭 상승 · 승리 시 주력 초식 경지 돌파!' },
        { id: 'hermit_bow', label: isPeer ? '차를 올리며 동시대 종사로서 검리를 나눈다' : '차만 대접하며 무도의 가르침을 청한다', hint: '통찰 +5 · QI +5 · 구도 +12' },
      ],
    });
  }

  // ★ 희귀 입문 이벤트 1: 인덕(>=20) & 통찰(>=28) & 명성(>=35) 달성 시에만 확률 출현 (미달 시 0%!) — 가보 비급 지참 문하생!
  const aliveCount = state.disciples.filter((d) => !d.dead).length;
  const maxD = state.facilities.yard === 1 ? 3 : state.facilities.yard === 2 ? 8 : state.facilities.yard === 3 ? 16 : 30;
  if (
    aliveCount < maxD &&
    state.reputation.virtue >= 20 &&
    state.stats.ins >= 28 &&
    state.fame >= 35
  ) {
    const bookGiftChance = Math.min(0.24, 0.06 + (state.reputation.virtue - 20) * 0.0025 + (state.stats.ins - 28) * 0.0015);
    if (Math.random() < bookGiftChance) {
      const candidateBooks = ALL_BOOKS_CATALOG.filter(
        (b) => (b.rarity === 'RARE' || b.rarity === 'LEGEND') && !state.books.some((ob) => ob.id === b.id) && !state.skills.some((s) => s.id === b.skillTemplateId)
      );
      if (candidateBooks.length > 0) {
        const giftBook = candidateBooks[Math.floor(Math.random() * candidateBooks.length)];
        return {
          id: `gift_disciple_book_${state.turn}`,
          title: '가보 비급을 품고 찾아온 후예',
          category: 'LIFE',
          sceneActor: 'DISCIPLE',
          narration: `비단 보자기에 귀한 서책을 싼 젊은 무인이 정문 앞에 무릎을 꿇었다.`,
          speaker: '몰락 무가의 후예',
          dialogue: `“인덕 높으신 【${state.sectName}】 사부님이라 들었습니다. 집안의 가보 『${giftBook.title}』을 바칠 테니, 부디 저를 제자로 거두어 주십시오!”`,
          script: [
            { speaker: '나레이션', role: 'NARRATOR', text: `해 질 녘, 먼지를 잔뜩 뒤집어쓴 젊은 무인이 비단 보자기를 꼭 끌어안은 채 대문 앞에 무릎을 꿇는다.` },
            { speaker: '몰락 무가의 후예', role: 'NPC', stageDirection: '보자기에서 오래된 비급을 꺼내 두 손으로 올린다', text: `저희 가문이 풍비박산 나고 남은 것은 이 『${giftBook.title}』뿐입니다.` },
            { speaker: '몰락 무가의 후예', role: 'NPC', text: `인덕과 안목이 깊으신 사부님이라면 이 비급을 바르게 이어 주실 거라 믿고 천 리 길을 달려왔습니다. 부디 저를 문하생으로 받아 주십시오!` },
          ],
          options: [
            { id: 'gift_book_accept', label: `“뜻이 가상하구나. 제자로 받아 함께 비급을 연마하자.”`, hint: `우수 문하생 입문 · 『${giftBook.title}』 획득 · 인덕 +8` },
            { id: 'gift_book_return', label: `“비급은 네 가문의 것이니 품에 간직하고 몸만 들어오너라.”`, hint: `충성도 100 천재 문하생 입문 · 인덕 +18 · 명성 +20` },
          ],
          meta: { giftBookId: giftBook.id },
        };
      }
    }
  }

  // ★ 희귀 입문 이벤트 2: (인덕>=25 또는 명성>=60) & (근력+정신>=55) 달성 시에만 확률 출현 (미달 시 0%!) — 명검 지참 문하생!
  if (
    aliveCount < maxD &&
    (state.reputation.virtue >= 25 || state.fame >= 60) &&
    state.stats.str + state.stats.wil >= 55
  ) {
    const weaponGiftChance = Math.min(0.22, 0.06 + state.reputation.virtue * 0.002 + state.fame * 0.0004);
    if (Math.random() < weaponGiftChance) {
      const candidateWeapons = ALL_WEAPONS_CATALOG.filter(
        (w) => (w.grade === 'FINE' || w.grade === 'TREASURE') && !state.weapons.some((ow) => ow.id === w.id)
      );
      if (candidateWeapons.length > 0) {
        const giftWeapon = candidateWeapons[Math.floor(Math.random() * candidateWeapons.length)];
        return {
          id: `gift_disciple_weapon_${state.turn}`,
          title: '명검을 안고 찾아온 방랑 무사',
          category: 'LIFE',
          sceneActor: 'DISCIPLE',
          narration: `서늘한 검기를 뿜는 병기를 등에 멘 젊은 무사가 공손히 포권하며 문하 입문을 청한다.`,
          speaker: '방랑 무사',
          dialogue: `“이 「${giftWeapon.name}」을 부끄럽지 않게 다룰 수 있는 곳은 【${state.sectName}】뿐이라 들었습니다. 이 병기와 함께 저를 받아 주십시오!”`,
          script: [
            { speaker: '나레이션', role: 'NARRATOR', text: `대문 너머로 예사롭지 않은 쇳소리가 들려온다. 젊은 무사 하나가 잘 벼려진 병기를 두 손으로 받쳐 들고 서 있다.` },
            { speaker: '방랑 무사', role: 'NPC', stageDirection: '병기를 높이 들어 올리며 공손히 예를 갖춘다', text: `스승을 잃고 떠돌다 사부님의 명성을 들었습니다. 이 「${giftWeapon.name}」은 저에게는 아직 과분한 명품입니다.` },
            { speaker: '방랑 무사', role: 'NPC', text: `부디 이 병기를 도장에 바치고, 사부님 밑에서 진짜 무도를 배우고 싶습니다!` },
          ],
          options: [
            { id: 'gift_weapon_accept', label: `“귀한 인연이군. 병기와 함께 너를 문하생으로 거두겠다.”`, hint: `우수 문하생 입문 · 「${giftWeapon.name}」 획득 · 명성 +12` },
            { id: 'gift_weapon_keep', label: `“명검의 주인은 네 자신이다. 그 칼을 쥔 채 내 밑에서 수련해라.”`, hint: `정예 문하생(근력·민첩↑ · 충성 100) 입문 · 인덕 +15` },
          ],
          meta: { giftWeaponId: giftWeapon.id },
        };
      }
    }
  }

  const recentBases = new Set(state.flags.recentEventBases || []);
  const isCooling = (baseKey: string) => recentBases.has(baseKey) || fixedGapCooling(state, baseKey);

  // ★ 문하생 독립(하산) 이벤트: 26세 이상(후계자 제외) 제자가 세상으로 나가 자신의 길을 걷는다! ★
  // 사범으로 붙잡아 둔 제자는 한동안 다시 하산을 청하지 않는다 (마흔 가까이 되어서야 드물게)
  const gradCandidate = state.disciples.find(
    (d) =>
      !d.dead &&
      d.role !== 'HEIR' &&
      d.age >= (d.role === 'INSTRUCTOR' ? 38 : 26) &&
      Math.random() < (d.role === 'INSTRUCTOR' ? 0.08 : d.age >= 31 ? 0.28 : 0.16)
  );
  if (gradCandidate && !isCooling('disciple_graduate')) {
    const statSum =
      gradCandidate.stats.str +
      gradCandidate.stats.agi +
      gradCandidate.stats.vit +
      gradCandidate.stats.wil +
      gradCandidate.stats.ins +
      gradCandidate.stats.qi;
    const isBitter = gradCandidate.loyalty < 55;
    return {
      id: `disciple_graduate_${gradCandidate.id}_${state.turn}`,
      title: isBitter ? `제자의 하산 — 불만을 품은 ${gradCandidate.name}` : `제자의 독립(하산) — ${gradCandidate.name}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: isBitter
        ? `${gradCandidate.name}(${gradCandidate.age}세)이(가) 서늘한 표정으로 짐을 꾸려 마당에 섰다.`
        : `어느덧 ${gradCandidate.age}세가 된 ${gradCandidate.name}이(가) 봇짐을 메고 스승 앞에 무릎을 꿇었다.`,
      speaker: gradCandidate.name,
      dialogue: isBitter
        ? '“이 도장에선 더 배울 게 없더군요. 이제 제 갈 길을 가겠습니다. ……다음에 만날 땐 스승과 제자가 아닐지도 모르지요.”'
        : statSum >= 175
        ? '“사부님의 가르침 덕분에 이제 천하에 나가 제 이름을 시험해 보고 싶습니다. 부디 하산을 허락해 주십시오!”'
        : '“사부님, 그동안 감사했습니다. 이제 나이가 차서 고향과 저잣거리에서 제 살림을 꾸려 보고자 합니다.”',
      options: isBitter
        ? [
            { id: 'grad_let_go', label: '“네 뜻이 그렇다면 말리지 않겠다. 가거라.”', hint: `${gradCandidate.name} 하산 · 훗날 적으로 돌아올 위험!` },
            { id: 'grad_gift_farewell', label: `노잣돈 40${cMeta.currency}을 쥐여 주며 진심으로 사과하고 배웅한다`, hint: `재화 -40 · 원한 완화 · 인덕 +10`, disabled: state.money < 40, disabledReason: '재화 부족' },
          ]
        : [
            { id: 'grad_bless', label: `“그래, 네 무도를 세상에 펼치고 오너라!” 격려하며 하산을 축복한다`, hint: `${gradCandidate.name} 독립 · 능력치에 따라 훗날 거물/잡인으로 재방문! · 명성 +15 · 인덕 +8` },
            { id: 'grad_keep', label: `“아직 도장에 네 손이 필요하다. 사범으로 남아 주지 않겠나?”`, hint: `사범으로 잔류 · 충성도 -12` },
          ],
      meta: { discipleId: gradCandidate.id, statSum },
    };
  }

  // ★ 진검결투에서 베어 죽인 자의 동료·자식·문도가 「복수의 혈귀」가 되어 찾아오는 연쇄 이벤트! ★
  const readyGrudge = (state.flags.bloodGrudges || []).find(
    (g) => !g.resolved && state.turn - g.killedTurn >= 10
  );
  if (readyGrudge && !isCooling('blood_grudge')) {
    const yearsPassed = Math.max(1, state.year - readyGrudge.killedYear);
    const triggerChance = yearsPassed >= 6 ? 0.44 : 0.24;
    if (Math.random() < triggerChance) {
      return buildBloodGrudgeEvent(state, readyGrudge);
    }
  }

  // ★ 독립(하산)한 제자의 재방문 이벤트 (대성한 거물 / 출세한 인물 / 평범한 잡인 / 배신해 적으로 돌아온 제자!) ★
  const revisitTarget = (state.graduatedDisciples || []).find(
    (g) => !g.revisited && state.year - g.graduatedYear >= 3 && Math.random() < 0.36
  );
  if (revisitTarget && !isCooling('grad_revisit')) {
    if (revisitTarget.fate === 'RIVAL_BETRAYER') {
      return {
        id: `grad_revisit_betray_${revisitTarget.id}_${state.turn}`,
        title: `적이 되어 돌아온 옛 제자 — ${revisitTarget.name}`,
        category: 'DUEL',
        sceneActor: 'ENEMY',
        narration: `어두운 도포를 휘날리며 대문을 걷어차고 들어온 자는…… 수년 전 도장을 떠났던 옛 제자 ${revisitTarget.name}이었다!`,
        speaker: revisitTarget.name,
        dialogue: `“오랜만입니다, 옛 사부님! ${revisitTarget.joinedSectName ? `${sectTag(revisitTarget.joinedSectName)}에서` : '타 문파에서'} 갈고닦은 칼로 오늘 【${state.sectName}】의 콧대를 꺾어 드리겠습니다!”`,
        options: [
          { id: 'grad_betray_fight', label: '“배은망덕한 놈, 목검으로 스승의 가르침을 다시 새겨 주마!” (비무 대결)', hint: '승리 시 명성 +55 · 배신 제자 제압' },
          { id: 'grad_betray_real_fight', label: '“스승에게 칼을 들이민 이상 진검으로 사문의 법도를 보이겠다!” (⚠ 진검결투)', hint: '⚠ 패배 시 사망/장애 · 승리 시 명성 +75 & 배신 제자 처분 결정' },
          { id: 'grad_betray_forgive', label: '“네 원망도 내 탓이다. 칼을 거두고 돌아가거라.”', hint: '명성 -10 · 인덕 +18 · 구도 +10' },
        ],
        meta: { gradId: revisitTarget.id, gradName: revisitTarget.name, gradPower: revisitTarget.powerScore },
      };
    }
    if (revisitTarget.fate === 'GRANDMASTER') {
      return {
        id: `grad_revisit_master_${revisitTarget.id}_${state.turn}`,
        title: `거물이 되어 돌아온 제자 — ${revisitTarget.name}`,
        category: 'LIFE',
        sceneActor: 'DISCIPLE',
        narration: `화려한 행렬과 함께 찾아온 이는 도장을 하산해 천하에 명성을 떨치는 대고수가 된 옛 제자 ${revisitTarget.name}이었다!`,
        speaker: revisitTarget.name,
        dialogue: `“사부님! 가르쳐 주신 「${revisitTarget.topSkillName}」 덕분에 큰 문파의 장문인이 되었습니다! 스승님 은혜에 보답하고자 선물을 준비했습니다!”`,
        options: [
          { id: 'grad_master_accept', label: '“장하구나! 네가 내 문하의 자랑이다.” 선물을 기쁘게 받는다', hint: `재화 +240 · 명성 +60 · 희귀 비급/명검 기증!` },
          { id: 'grad_master_spar', label: '“선물보다 네 칼이 얼마나 자랐는지 한 합 보자꾸나!”', hint: '친선 대련 · 통찰 +5 · 명성 +45 · 재화 +120' },
        ],
        meta: { gradId: revisitTarget.id, gradName: revisitTarget.name },
      };
    }
    if (revisitTarget.fate === 'SUCCESSFUL') {
      return {
        id: `grad_revisit_success_${revisitTarget.id}_${state.turn}`,
        title: `출세한 옛 제자의 방문 — ${revisitTarget.name}`,
        category: 'LIFE',
        sceneActor: 'DISCIPLE',
        narration: `말끔한 비단옷을 차려입은 옛 제자 ${revisitTarget.name}이(가) 묵직한 은자 꾸러미를 들고 스승을 찾아왔다.`,
        speaker: revisitTarget.name,
        dialogue: `“사부님, 잘 지내셨습니까! 저, 이제 고을 제일의 표국을 맡아 꽤 넉넉히 살고 있습니다. 도장 살림에 보태어 주십시오!”`,
        options: [
          { id: 'grad_success_money', label: '“고맙다, 잘 쓰마. 언제든 놀러 오너라.”', hint: `재화 +130 · 명성 +25 · 인덕 +6` },
          { id: 'grad_success_recruit', label: '“은자보다 네가 아는 쓸 만한 젊은이 하나 추천해 다오.”', hint: `우수 신입 문하생 입문 · 재화 +60` },
        ],
        meta: { gradId: revisitTarget.id, gradName: revisitTarget.name },
      };
    }
    // ORDINARY (능력치가 낮아 평범한 일개 잡인으로 정착한 제자!)
    return {
      id: `grad_revisit_ordinary_${revisitTarget.id}_${state.turn}`,
      title: `장터 백성이 된 옛 제자 — ${revisitTarget.name}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `소박한 무명옷 차림의 옛 제자 ${revisitTarget.name}이(가) 따뜻한 떡 보따리를 들고 쑥스럽게 대문 앞에 섰다.`,
      speaker: revisitTarget.name,
      dialogue: `“사부님…… 죄송합니다. 제가 재주가 없어 고수는 못 되고 장터에서 국밥 장사하며 살고 있습니다. 그래도 도장에서 배운 체력 덕분에 험한 세상 잘 버팁니다!”`,
      options: [
        { id: 'grad_ordinary_warm', label: '“무슨 소리냐! 제 힘으로 밥 벌어먹고 살면 그게 제일 훌륭한 무도다.”', hint: '건강 +8 · 인덕 +15 · 문하생 전원 충성도↑' },
        { id: 'grad_ordinary_tip', label: '“잘 먹고 살아라.” 도장 홍보나 부탁하며 차를 대접한다', hint: '명성 +12 · 상무 +8' },
      ],
      meta: { gradId: revisitTarget.id, gradName: revisitTarget.name },
    };
  }

  // ★ 질병 · 자연재해 · 진검습격 서사 이벤트 (난이도에 따라 발생률·치명도 급상승!) ★
  const diffCfg = getDifficultyConfig(state);
  const diffId = getDifficultyId(state);

  // [어려움 / 지옥 전용] 1) 자연재해: 대홍수 · 대흉년 · 지진!
  if (
    diffId !== 'EASY' &&
    state.turn >= 6 &&
    !isCooling('disaster_nature') &&
    Math.random() < diffCfg.disasterRate * 0.55
  ) {
    const repairCost = Math.round((110 + state.facilities.yard * 45) * diffCfg.expenseMult);
    const isFlood = state.season === 'SUMMER' || state.season === 'SPRING';
    const isDrought = state.season === 'AUTUMN';
    const disasterTitle = isFlood ? '천재지변 · 대홍수와 산사태' : isDrought ? '천재지변 · 대흉년과 기근' : '천재지변 · 혹한과 지진';
    const disasterAlly = bestSect(state, 40);
    return {
      id: `disaster_nature_${state.turn}`,
      title: `⚠ ${disasterTitle}`,
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: isFlood
        ? '사흘 밤낮 쏟아진 폭우에 고을 둑이 터지고 도장 담장과 기와가 무너져 내렸다! 문하생들까지 흙더미에 깔릴 뻔한 아찔한 재난이다.'
        : isDrought
        ? '메뚜기 떼와 극심한 가뭄으로 고을 전체에 굶주림이 덮쳤다. 쌀값이 세 배로 치솟고 문하생들도 기력을 잃고 있다.'
        : '한밤중 대지가 크게 흔들리며 도장 대들보가 쩍 갈라지고 혹한이 몰아닥쳤다! 당장 보수하지 않으면 큰 화를 입는다.',
      speaker: state.spouse?.alive ? state.spouse.name : '문하생 대표',
      dialogue: '“사부님! 당장 막대한 비용을 들여 수습하지 않으면 도장 시설과 식솔들 모두가 큰 타격을 입습니다!”',
      options: [
        {
          id: 'disaster_pay',
          label: `사재를 털어 즉각 보수·구휼한다 (-${repairCost}${cMeta.currency})`,
          hint: `도장 시설 보호 · 문하생 생존 보장 · 인덕 +16`,
          disabled: state.money < repairCost,
          disabledReason: '재화 부족',
        },
        ...(disasterAlly
          ? [
              {
                id: 'disaster_ally_aid',
                label: `${sectTag(disasterAlly.name)}이 보낸 구휼미와 일손을 받는다 (-${Math.round(repairCost / 2)}${cMeta.currency})`,
                hint: `절반의 비용으로 수습 · 인덕 +8 · ${disasterAlly.name.replace(/\(.*?\)/g, '')} 관계 -5 (신세)`,
                disabled: state.money < Math.round(repairCost / 2),
                disabledReason: '재화 부족',
              },
            ]
          : []),
        {
          id: 'disaster_endure',
          label: '“돈이 없다… 맨몸으로 버텨 낼 수밖에!”',
          hint: `⚠ 주인공 건강 -${diffId === 'HELL' ? 20 : 14} · 시설 손상/제자 부상·이탈 위험!`,
        },
      ],
      meta: { repairCost, cost: Math.round(repairCost / 2), allyId: disasterAlly?.id },
    };
  }

  // [어려움 / 지옥 전용] 2) 고을 대역병 재창궐 (반복 발동 가능!)
  if (
    diffId !== 'EASY' &&
    state.turn >= 10 &&
    !isCooling('disaster_plague') &&
    Math.random() < diffCfg.disasterRate * 0.55
  ) {
    const pMeta = getPlagueMedicineMeta(state);
    const pct = Math.round(pMeta.cureChance * 100);
    return {
      id: `disaster_plague_${state.turn}`,
      title: '☠ 고을 대역병(大疫病) 창궐',
      category: 'LIFE',
      sceneActor: state.spouse?.alive ? 'SPOUSE' : undefined, // 배우자가 없거나 먼저 떠났으면 의원이 말한다
      narration: '시신 싣는 수레가 골목을 지나가는 끔찍한 역병이 고을에 다시 번졌다! 도장 안에도 고열과 구토를 호소하는 이들이 속출한다.',
      speaker: state.spouse?.alive ? state.spouse.name : '동네 의원',
      dialogue: '“사부님, 이번 역병은 지난번보다 훨씬 독합니다! 거액의 약재를 구해도 완치를 장담하기 어렵습니다!”',
      options: [
        {
          id: 'plague_buy_med',
          label: `거액을 들여 도장 전원 약재를 구한다 (-${pMeta.cost}${cMeta.currency})`,
          hint: `완치 확률 ${pct}% · 실패 시 건강 -12 + 문하생 병사 위험!`,
          disabled: state.money < pMeta.cost,
          disabledReason: '재화 부족',
        },
        {
          id: 'plague_endure',
          label: '대문을 걸어 잠그고 체력과 약방으로 버틴다',
          hint: `⚠ 높은 확률로 건강 -20 + 역병 후유증 + 제자 병사 위험!`,
        },
      ],
    };
  }

  // [어려움 / 지옥 전용] 3) 살수단 · 광기의 살인검객 진검 암습!
  if (
    diffId !== 'EASY' &&
    state.turn >= 8 &&
    state.fame >= 45 &&
    !isCooling('realduel_assassin') &&
    // 흑도와 동맹을 맺으면 뒷골목의 칼이 훨씬 덜 날아든다.
    Math.random() < diffCfg.disasterRate * 0.5 * (getSects(state).some((sc) => sc.kind === 'OUTLAW' && sc.allied) ? 0.35 : 1)
  ) {
    const bribeCost = Math.round((130 + state.fame * 0.25) * diffCfg.expenseMult);
    const hasAliveDisc = state.disciples.some((d) => !d.dead);
    // 적대 문파가 있으면 살수를 보낸 쪽이 드러나고, 믿을 만한 문파가 있으면 구원을 청할 수 있다.
    const assassinSender = worstSect(state, -50);
    const assassinAlly = bestSect(state, 50);
    return {
      id: `realduel_assassin_${state.turn}`,
      title: '⚔ 살수단의 야습 — 피할 수 없는 진검승부',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: assassinSender
        ? `한밤중 도장 마당을 시커먼 살기가 뒤덮었다. ${sectTag(assassinSender.name, '이가')} 은자를 풀어 보낸 살수 두목이 시퍼런 진검을 빼 들고 정면으로 걸어온다!`
        : '한밤중 도장 마당을 시커먼 살기가 뒤덮었다. 경쟁 문파나 원한 품은 자가 보낸 살수 두목이 시퍼런 진검을 빼 들고 정면으로 걸어온다!',
      speaker: '피의 살수 두목',
      dialogue: `“【${state.sectName}】의 목에 현상금이 걸렸다. 오늘 밤 네 목을 따거나, 아니면 도장 금고를 통째로 털어 가겠다!”`,
      options: [
        {
          id: 'real_ambush_fight',
          label: '진검을 뽑아 들고 정면으로 맞선다 (⚠ 진검결투!)',
          hint: `⚠ 패배 시 ${Math.round(diffCfg.realDuelDeathRate * 100)}% 즉사 / 영구장애 · 승리 시 명성 +${Math.round(55 * diffCfg.fameGainMult)} & 포상`,
        },
        ...(hasAliveDisc
          ? [
              {
                id: 'real_ambush_sacrifice',
                label: '문하생들과 포위해 돌파구를 연다 (제자 사상 위험!)',
                hint: '진검결투 회피 · ⚠ 문하생 중 1명 중상 또는 전사 위험 · 명성 -15',
              },
            ]
          : []),
        ...(assassinAlly
          ? [
              {
                id: 'real_ambush_ally',
                label: `${sectTag(assassinAlly.name)}에 급히 전갈을 띄워 구원을 청한다`,
                hint: `진검결투 회피 · ${assassinAlly.name.replace(/\(.*?\)/g, '')} 관계 -10 (큰 신세) · 명성 -5`,
              },
            ]
          : []),
        {
          id: 'real_ambush_bribe',
          label: `금고를 열어 살수단을 매수해 물린다 (-${bribeCost}${cMeta.currency})`,
          hint: `목숨 보전 · 재화 -${bribeCost} · 명성 -22 · 권위 -10`,
          disabled: state.money < bribeCost,
          disabledReason: '재화 부족',
        },
      ],
      meta: { bribeCost, sectId: assassinSender?.id, allyId: assassinAlly?.id },
    };
  }

  // 겨울 열병 (지옥 난이도는 환절기 봄/가을에도 열병 발병 가능!)
  const feverSeasonOk = state.season === 'WINTER' || (diffId === 'HELL' && (state.season === 'SPRING' || state.season === 'AUTUMN') && Math.random() < 0.45);
  if (feverSeasonOk && !isCooling('hero_fever') && Math.random() < diffCfg.feverRate) {
    const fMeta = getFeverMedicineMeta(state);
    const curePct = Math.round(fMeta.cureChance * 100);
    const isElder = state.age >= 55;
    return {
      id: `hero_fever_${state.turn}`,
      title: state.season === 'WINTER' ? '매서운 겨울의 열병(熱病)' : '지독한 환절기 악성 열병(熱病)',
      category: 'LIFE',
      sceneActor: state.spouse?.alive ? 'SPOUSE' : undefined, // 배우자가 없거나 먼저 떠났으면 의원이 말한다
      narration: isElder
        ? '매서운 바람이 세월을 먹은 뼈마디 깊숙이 스며든 탓일까. 밤새 오한과 고열이 번갈아 찾아오며 기력이 뚝 떨어졌다.'
        : '찬 바람을 맞으며 수련을 강행한 탓일까. 온몸이 불덩이처럼 달아오르며 식은땀이 멈추지 않는다.',
      speaker: state.spouse?.alive ? state.spouse.name : '동네 의원',
      dialogue: isElder
        ? '“연세도 있으신데 폐에 찬 기운이 깊이 들었습니다! 당장 귀한 탕약을 쓰셔야 합니다만, 이번 열병은 독해 약효를 장담하기 어렵습니다!”'
        : '“폐에 찬 기운이 깊이 들었습니다! 당장 탕약을 쓰고 쉬셔야 합니다만, 이번 열병은 독해 약이 꼭 듣는다는 보장도 없습니다!”',
      options: [
        {
          id: 'fever_medicine',
          label: `귀한 탕약을 지어 먹는다 (-${fMeta.cost}${cMeta.currency})`,
          hint: `완치 ${curePct}% (건강 +10) · 실패 시 약효 미달/악화 (약방·체력↑, 노년↓)`,
          disabled: state.money < fMeta.cost,
          disabledReason: '재화 부족',
        },
        { id: 'fever_endure', label: '“이깟 열병쯤 내공으로 눌러 버리겠다!” 꾹 버틴다', hint: `건강 -${state.age >= 55 ? 20 : 15} · 영력 +3 · 정신 +2 (위험!)` },
      ],
    };
  }

  const sickDisc = state.disciples.find((d) => !d.dead && !d.isChild);
  if (sickDisc && state.turn >= 6 && !isCooling('disciple_illness') && Math.random() < diffCfg.discipleIllnessRate) {
    const dMeta = getDiscipleIllnessMeta(state);
    const payPct = Math.round(dMeta.payCureChance * 100);
    const carePct = Math.round(dMeta.careCureChance * 100);
    const doctorAlly = bestSect(state, 40);
    return {
      id: `disciple_illness_${sickDisc.id}_${state.turn}`,
      title: `문하생의 중병 — 쓰러진 ${sickDisc.name}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `한밤중 숙소에서 거친 기침 소리가 터져 나왔다. 문하생 ${sickDisc.name}(${sickDisc.age}세)이(가) 고열과 각혈로 쓰러져 있다!`,
      speaker: sickDisc.name,
      dialogue: '“쿨럭…… 사부님, 죄송합니다…… 몸이 말을 듣지 않습니다……”',
      options: [
        {
          id: 'disc_ill_pay',
          label: `도장 돈을 털어 명의와 탕약을 구한다 (-${dMeta.cost}${cMeta.currency})`,
          hint: `완치 ${payPct}% (충성 100 · 인덕 +14) · 실패 시 후유증 또는 병사!`,
          disabled: state.money < dMeta.cost,
          disabledReason: '재화 부족',
        },
        ...(doctorAlly
          ? [
              {
                id: 'disc_ill_ally',
                label: `${sectTag(doctorAlly.name)}에 의원을 청한다`,
                hint: `돈이 들지 않는다 · 완치 ${payPct}% · ${doctorAlly.name.replace(/\(.*?\)/g, '')} 관계 -4 (신세)`,
              },
            ]
          : []),
        { id: 'disc_ill_care', label: '직접 내공을 불어넣어 밤새 간호한다', hint: `내 건강 -8 · ${carePct}% 완치 (실패 시 병사!) · 인덕 +10` },
        { id: 'disc_ill_leave', label: '“형편이 넉넉지 않다… 하늘의 뜻에 맡길 수밖에.”', hint: `⚠ 높은 확률로 ${sickDisc.name} 병사 · 남은 제자 충성도↓ · 살기 +8` },
      ],
      meta: { discipleId: sickDisc.id, discipleName: sickDisc.name, allyId: doctorAlly?.id, cureChance: dMeta.payCureChance },
    };
  }

  // 노년 원로 문하생의 자연 임종 이벤트 (55세 이상 늙은 제자)
  // 후계자는 스승의 뒤를 이어야 하므로 노환 임종 대상에서 뺀다. (병이나 재난으로는 여전히 잃을 수 있다)
  const elderDisc = state.disciples.find((d) => !d.dead && d.role !== 'HEIR' && d.age >= 55 && Math.random() < 0.35);
  if (elderDisc && !isCooling('disciple_passing')) {
    return {
      id: `disciple_passing_${elderDisc.id}_${state.turn}`,
      title: `원로 제자의 마지막 인사 — ${elderDisc.name}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `평생을 곁에서 함께 늙어 온 원로 제자 ${elderDisc.name}(${elderDisc.age}세)이(가) 끝내 노환으로 자리에 누웠다.`,
      speaker: elderDisc.name,
      dialogue: `“사부님…… 젊은 날 이 마당에 첫발을 디딘 것이 제 일생 가장 큰 복이었습니다. 부디 오래오래 【${state.sectName}】을(를) 지켜 주십시오……”`,
      options: [
        { id: 'disc_pass_honor', label: '손을 꼭 잡고 평생의 인연에 감사하며 성대한 장례를 치른다', hint: `${elderDisc.name} 별세 · 통찰 +5 · 정신 +5 · 명성 +30` },
      ],
      meta: { discipleId: elderDisc.id, discipleName: elderDisc.name },
    };
  }

  const winsCount = state.flags.tournamentWins || 0;
  const isElderHero = state.age >= 55;
  const isMidHero = state.age >= 35 && state.age < 55;

  // ★ 풍부한 순환 서사 이벤트 풀 (최근 6회 이내 발동한 계열은 자동 제외 → 반복 도배 0%!) ★
  if (!isCooling('random_dojo_breaker')) {
    const isRealBreaker = diffCfg.realDuelUpgradeChance > 0 && Math.random() < diffCfg.realDuelUpgradeChance;
    // 사이가 틀어진 문파가 있으면 도전자는 그 문파에서 온다. 사이가 좋은 문파가 있으면 대신 나서 주기도 한다.
    const breakerSect = Math.random() < 0.65 ? worstSect(state, -15) : null;
    const breakerAlly = metSects(state).find((sc) => sc.relation >= 40 && sc.id !== breakerSect?.id);
    const breakerFrom = breakerSect ? `${sectTag(breakerSect.name)}의 ${breakerSect.champion}` : '';
    const breakerDialogue =
      isRealBreaker
        ? `“목검 장난 따위는 치워라! 【${state.sectName}】의 현판과 목숨을 걸고 진검으로 겨루러 왔다!”`
        : winsCount >= 1
        ? `“천하제일 우승 문파 【${state.sectName}】에 내 이름을 시험해 보려고 천 리를 달려왔소! 목검 한 합만 받아 주십시오!”`
        : isElderHero
        ? `“전설로만 듣던 백발의 노사부님이 아직 검을 놓지 않으셨다더군요. 후학의 패기를 한 합 시험해 주십시오!”`
        : state.fame >= 300
        ? `“강호에 명성이 자자한 【${state.sectName}】의 실력이 소문 그대로인지 직접 확인하러 왔소!”`
        : `“여기가 요즘 입소문이 자자하다는 【${state.sectName}】인가? 지면 저 현판은 내가 떼어 가겠소!”`;
    pool.push({
      id: `random_dojo_breaker_${state.turn}`,
      title: isRealBreaker ? '⚔ 진검 도장깨기 도전자의 습격' : winsCount >= 1 || isElderHero ? '명성을 찾아온 강호 도전자' : '도장깨기 도전자의 방문',
      category: 'DUEL',
      narration: breakerSect
        ? isRealBreaker
          ? `${josa(breakerFrom, '이가')} 시퍼런 진검을 빼 들고 대문 앞에 섰다! 쌓인 감정을 오늘 칼로 풀겠다는 것이다.`
          : `${josa(breakerFrom, '이가')} 목검을 둘러메고 대문을 두드린다. 두 문파 사이의 묵은 감정을 현판으로 가리자는 것이다.`
        : isRealBreaker
        ? '살기 어린 눈빛의 타 문파 무사가 시퍼런 진검을 빼 들고 대문 앞에 섰다! 오늘은 목검 비무가 아니다.'
        : winsCount >= 1 || isElderHero
        ? '전국을 떠돌던 혈기 왕성한 타 문파 고수가 목검을 둘러메고 대문 앞에 서서 도전을 청한다.'
        : '오만한 표정의 타 문파 고수가 목검을 둘러메고 대문을 두드린다. 문하생들이 긴장한 눈빛으로 당신을 바라본다.',
      speaker: breakerSect ? breakerSect.champion : isRealBreaker ? '살기 띤 도장깨기 검객' : '타 문파 도전자',
      dialogue: breakerDialogue,
      options: [
        {
          id: isRealBreaker ? 'breaker_fight_real' : 'breaker_fight',
          label: isRealBreaker
            ? '진검을 뽑아 도전에 응한다 (⚠ 진검결투 · 사망/장애 위험!)'
            : '도전을 받아들여 마당에 선다 (비무 / 제자 대리전 가능)',
          hint: isRealBreaker
            ? `⚠ 패배 시 ${Math.round(diffCfg.realDuelDeathRate * 100)}% 즉사/장애 · 승리 시 명성↑ & 포상금`
            : '승리 시 명성 & 포상금 · 패배 시 현판 강탈',
        },
        ...(breakerAlly
          ? [
              {
                id: 'breaker_ally',
                label: `때마침 들른 ${sectTag(breakerAlly.name)}의 고수가 대신 나서겠다고 한다`,
                hint: `위험도 명성 변화도 없다 · ${breakerAlly.name.replace(/\(.*?\)/g, '')} 관계 -6 (신세)`,
              },
            ]
          : []),
        { id: 'breaker_ignore', label: '“쓸데없는 힘자랑은 사절이오” 돌려보낸다', hint: `명성 -${isRealBreaker ? 16 : 8} · 구도 +5${breakerSect ? ' · 그쪽이 더 얕본다(관계 -3)' : ''}` },
      ],
      meta: { sectId: breakerSect?.id, allyId: breakerAlly?.id },
    });
  }

  if (!isCooling('random_inspiration')) {
    pool.push({
      id: `random_inspiration_${state.turn}`,
      title: isElderHero ? '빗소리 속의 무심(無心)' : '빗소리 속의 번뜩임',
      category: 'LIFE',
      narration: isElderHero
        ? '처마 끝에서 떨어지는 빗방울 소리를 고요히 듣다, 평생 휘둘러 온 초식에서 불필요한 힘 하나가 스르르 빠져나가는 경지를 느꼈다.'
        : '처마에서 떨어지는 빗방울 박자를 멍하니 듣다가, 문득 막혀 있던 초식의 맥이 머릿속에서 번개처럼 맞물린다.',
      options: [
        { id: 'insp_train', label: isElderHero ? '빗속 마당에 서서 천천히 초식의 결을 다듬는다' : '밤새 마당에서 휘두르며 깨달음을 몸에 새긴다', hint: '건강 -4 · 통찰 +3 · 주력 초식 경험치 대폭↑' },
        { id: 'insp_note', label: '붓으로 구상만 적어 두고 몸을 아낀다', hint: '통찰 +2 · 구도 +5' },
      ],
    });
  }

  if (!isCooling('life_festival_demo')) {
    const heckler = Math.random() < 0.6 ? worstSect(state, -35) : null;
    pool.push({
      id: `life_festival_demo_${state.turn}`,
      title: '고을 장터 축제의 무예 시연',
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: heckler
        ? `고을 큰 장날을 맞아 저잣거리 상인들이 도장에 무예 시연을 정중히 청해 왔다. 다만 ${sectTag(heckler.name)} 패거리가 구경꾼 사이에 섞여 훼방을 놓으려 벼른다는 말이 들린다.`
        : '고을 큰 장날을 맞아 저잣거리 상인들이 도장에 무예 시연을 정중히 청해 왔다.',
      speaker: '장터 상인 대표',
      dialogue: isElderHero
        ? `“큰 스승님, 직접 칼을 휘두르지 않으셔도 좋으니 문하생들과 함께 축제의 큰 어른으로 자리만 빛내 주십시오!”`
        : winsCount >= 1 || state.fame >= 350
        ? `“천하에 이름난 【${state.sectName}】의 대사부님께서 친히 한 자리 빛내 주신다면 고을 전체의 영광이겠습니다!”`
        : `“【${state.sectName}】의 멋진 초식을 고을 백성들에게 보여 주신다면 사례금도 두둑히 챙겨 드리겠습니다!”`,
      options: [
        { id: 'fest_demo_show', label: '문하생들과 함께 화려한 검무 시연을 펼친다', hint: `재화 +65 · 명성 +22 · 상무 +8` },
        { id: 'fest_demo_charity', label: '사례금은 사양하고 무료로 백성들에게 호신술을 가르친다', hint: '명성 +28 · 인덕 +16' },
        ...(heckler
          ? [
              {
                id: 'fest_demo_rebuke',
                label: `시연 도중 야유하는 ${sectTag(heckler.name)} 패거리를 호통쳐 쫓아낸다`,
                hint: `명성 +26 · 권위 +8 · 살기 +3 · ${heckler.name.replace(/\(.*?\)/g, '')} 관계 -6`,
              },
            ]
          : []),
      ],
      meta: { sectId: heckler?.id },
    });
  }

  if (!isCooling('life_herb_peddler')) {
    const hMeta = getHerbPeddlerMeta(state);
    const hPct = Math.round(hMeta.successChance * 100);
    const herbDialogue = isElderHero
      ? '“허허, 큰 어르신께서 연세가 드시니 기력이 예전 같지 않으시구려. 노년에 좋은 백년 산약초 한 뿌리 달여 드시겠소? 다만 약성이 강해 간혹 탈이 날 수도 있소.”'
      : isMidHero
      ? '“허허, 도장주 양반 안색을 보니 중년의 피로와 속병이 꽤 쌓였구먼. 백년 묵은 산약초 한 뿌리 달여 드시겠소? 다만 약성이 강해 간혹 탈이 날 수도 있소.”'
      : '“허허, 젊은 무인 양반 안색을 보니 수련하느라 기력이 꽤 축났구먼. 백년 묵은 산약초 한 뿌리 달여 드시겠소? 다만 약성이 강해 간혹 탈이 날 수도 있소.”';
    pool.push({
      id: `life_herb_peddler_${state.turn}`,
      title: '깊은 산속 약초꾼의 귀한 영약',
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: '흙 묻은 배낭을 멘 늙은 약초꾼이 산삼과 진귀한 약재를 싸 들고 도장 마당을 찾았다.',
      speaker: '산속 약초꾼',
      dialogue: herbDialogue,
      options: [
        {
          id: 'herb_buy',
          label: `산약초를 사서 푹 달여 마신다 (-${hMeta.cost}${cMeta.currency})`,
          hint: `성공 ${hPct}% (건강 +18 · 체력/영력 +2) · 실패 시 불량 약재 복통(건강 -6)`,
          disabled: state.money < hMeta.cost,
          disabledReason: '재화 부족',
        },
        { id: 'herb_tea', label: '따뜻한 물만 대접하고 약초 이야기로 안목을 넓힌다', hint: '통찰 +2 · 인덕 +4' },
      ],
    });
  }

  if (!isCooling('life_night_assassin') && state.fame >= 65) {
    pool.push({
      id: `life_night_assassin_${state.turn}`,
      title: '달밤의 낯선 자객',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '그믐달 아래, 담장을 소리 없이 넘어온 검은 복면의 자객이 도장 장서각을 노리고 숨어들었다!',
      speaker: '검은 복면 자객',
      dialogue:
        winsCount >= 1 || isElderHero
          ? '“……과연 천하의 대종사답게 기척을 단번에 알아채시는군. 비급만 순순히 내놓으시면 피는 보지 않겠소.”'
          : '“……눈치가 빠르군. 비급만 순순히 내놓으면 피는 보지 않겠다.”',
      options: [
        { id: 'assassin_fight', label: '“내 도장의 비급을 탐내다니, 목숨을 내놓아라!” (비무 제압)', hint: '승리 시 명성 +35 · 포상금 +90' },
        { id: 'assassin_scare', label: '압도적인 기세로 호통쳐 물러나게 한다 (영력·통찰 시험)', hint: '통찰+영력 ≥ 70 시 무혈 퇴치 + 명성 +25 · 미달 시 재화 도난' },
      ],
    });
  }

  if (!isCooling('life_disciple_quarrel') && state.disciples.filter((d) => !d.dead).length >= 2) {
    const aliveList = state.disciples.filter((d) => !d.dead);
    const d1 = aliveList[0];
    const d2 = aliveList[1];
    pool.push({
      id: `life_disciple_quarrel_${state.turn}`,
      title: '문하생 간의 대련 신경전',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `수련 도중 ${d1.name}과(와) ${d2.name}의 기세가 과열되어 멱살잡이 직전까지 치달았다!`,
      speaker: d1.name,
      dialogue: `“사부님! ${d2.name}이(가) 제 초식을 우습게 보고 멋대로 힘으로만 밀어붙입니다!”`,
      options: [
        { id: 'quarrel_mediate', label: '두 사람의 장단점을 차분히 짚어 화해시킨다', hint: '전 문하생 충성도 +10 · 인덕 +8 · 통찰 +2' },
        { id: 'quarrel_spar', label: '“말 대신 목검으로 끝장을 보거라!” 공개 대련을 붙인다', hint: '두 제자 스탯 대폭 상승 · 살기 +6' },
      ],
    });
  }

  if (!isCooling('life_wandering_tea')) {
    const isGreatMaster = isElderHero || winsCount >= 1;
    pool.push({
      id: `life_wandering_tea_${state.turn}`,
      title: '비 오는 날 낯선 검객과의 차담',
      category: 'LIFE',
      sceneActor: 'RIVAL',
      narration: '장대비를 피해 처마 밑에 들어선 낯선 중년 검객이 도장의 목인장을 보며 감탄한다.',
      speaker: '지나가던 중년 검객',
      dialogue: isGreatMaster
        ? `“아이고, 설마 천하에 이름난 【${state.sectName}】의 큰 스승님이십니까! 비를 피하다 귀한 인연을 만났으니, 차 한 잔 올리며 검리의 가르침을 청해도 되겠습니까?”`
        : '“목인장에 패인 칼자국이 참으로 곧고 깊구려. 비가 그칠 동안 차 한 잔 나누며 검리를 이야기해 보시겠소?”',
      options: [
        { id: 'tea_discuss', label: isGreatMaster ? '차를 권하며 후배 검객과 깊은 검리를 나눈다' : '밤늦도록 서로의 검리와 호흡법을 논한다', hint: '통찰 +3 · 정신 +2 · 주력 초식 숙련도↑ · 구도 +8' },
        { id: 'tea_spar', label: '“말보다 한 합 부딪쳐 보는 편이 빠르지요!” 가벼운 친선 비무', hint: '친선 대련 · 승리 시 명성 +28 · 초식 숙련↑' },
      ],
    });
  }

  if (pool.length === 0) {
    pool.push({
      id: `random_inspiration_${state.turn}`,
      title: '고요한 새벽의 깨달음',
      category: 'LIFE',
      narration: '새벽안개 속 홀로 목검을 휘두르다 호흡과 발걸음이 하나로 맞아떨어지는 순간을 느꼈다.',
      options: [
        { id: 'insp_train', label: '이 감각을 놓치지 않고 끝까지 휘두른다', hint: '건강 -3 · 통찰 +3 · 초식 숙련도↑' },
        { id: 'insp_note', label: '차분히 호흡을 정리하며 기록한다', hint: '통찰 +2 · 구도 +5' },
      ],
    });
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

export function getRewardWeaponForDemon(scale: number) {
  return scale >= 2.2 ? getWeaponById('wp_bl_12') : getWeaponById('wp_bl_09');
}

// 준비된 이름을 다 쓴 큰 도장에서는 성과 이름을 엮어 새 이름을 짓는다.
const EXTRA_NAME_PARTS: Record<GameState['country'], { family: string[]; given: string[]; sep: string }> = {
  KOREA: { family: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '신', '권'], given: ['도현', '서준', '하윤', '지호', '민준', '은우', '시우', '연우', '건우', '다온', '세아', '가람', '무진', '초희', '석범', '여울'], sep: '' },
  CHINA: { family: ['이', '왕', '장', '유', '진', '양', '황', '조', '오', '주', '서', '손'], given: ['청풍', '무영', '소소', '운비', '천룡', '옥봉', '자명', '설아', '검추', '벽하', '철심', '화영'], sep: '' },
  JAPAN: { family: ['사이토', '고바야시', '마츠모토', '이노우에', '기무라', '하야시', '시미즈', '모리', '오카다', '후지와라'], given: ['신노스케', '겐타', '아키라', '사부로', '치요', '오린', '나오', '류노스케', '코타로', '시즈카'], sep: ' ' },
};
function makeExtraDiscipleName(state: GameState, used: Set<string>): string {
  const parts = EXTRA_NAME_PARTS[state.country];
  for (let i = 0; i < 30; i++) {
    const candidate = `${parts.family[Math.floor(Math.random() * parts.family.length)]}${parts.sep}${parts.given[Math.floor(Math.random() * parts.given.length)]}`;
    if (!used.has(candidate)) return candidate;
  }
  return `문하생 ${state.disciples.length + 1}`;
}

export function createDiscipleEntity(
  state: GameState,
  opts?: {
    name?: string;
    archetype?: string;
    isGenius?: boolean;
    isChild?: boolean;
    childTalent?: Disciple['childTalent'];
    temperament?: Disciple['temperament']; // 사연이 정해진 입문자(첫 제자, 은혜를 입은 자 등)는 기질을 지정한다
  }
): Disciple {
  const cMeta = COUNTRIES[state.country];
  // 천하대회 명부의 고수·숙적·배우자와 같은 이름의 제자가 들어오면 대진표와 사건 제목에서 서로 헷갈린다.
  const usedNames = new Set([
    ...state.disciples.map((d) => d.name),
    ...(state.graduatedDisciples || []).map((g) => g.name),
    ...(state.tourneyRoster || []).map((f) => f.name),
    ...(state.spouse ? [state.spouse.name] : []),
    ...(state.rival?.name ? [state.rival.name] : []),
  ]);
  const pool = cMeta.discipleNames.filter((n) => !usedNames.has(n));
  const name = opts?.name || pool[Math.floor(Math.random() * pool.length)] || makeExtraDiscipleName(state, usedNames);
  const archetypes = ['우직한 농부 아들', '몰락 무사', '장터 고아', '서당 학동', '부두 인부', '명문가 자제', '방랑 낭인'];
  const archetype = opts?.archetype || archetypes[Math.floor(Math.random() * archetypes.length)];
  const isGenius = opts?.isGenius ?? Math.random() < (state.facilities.dorm >= 3 ? 0.28 : 0.14);
  const baseStat = isGenius ? 24 : 15;
  const elements: Disciple['talentElement'][] = ['PHYSICAL', 'WIND', 'QI', 'FIRE', 'ICE', 'LIGHTNING'];
  const weapons: WeaponGroup[] = ['BLADE', 'UNARMED', 'POLEARM', 'THROWN'];

  return {
    id: `disc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    archetype: opts?.isChild ? '친자녀' : archetype,
    age: opts?.isChild ? 10 : 15 + Math.floor(Math.random() * 9),
    isChild: opts?.isChild,
    childTalent: opts?.childTalent,
    isGenius,
    talentElement: elements[Math.floor(Math.random() * elements.length)],
    talentWeapon: weapons[Math.floor(Math.random() * weapons.length)],
    loyalty: opts?.isChild ? 90 : isGenius ? 65 : 78,
    ambition: isGenius ? 55 + Math.floor(Math.random() * 35) : 20 + Math.floor(Math.random() * 35),
    stats: {
      str: baseStat + Math.floor(Math.random() * 8),
      agi: baseStat + Math.floor(Math.random() * 8),
      vit: baseStat + Math.floor(Math.random() * 8),
      wil: baseStat + Math.floor(Math.random() * 8),
      ins: (isGenius ? 26 : 14) + Math.floor(Math.random() * 10),
      qi: (isGenius ? 22 : 10) + Math.floor(Math.random() * 8),
    },
    role: 'STUDENT',
    skills: createBaseSkills().map((s) => ({ ...s, masteryLevel: 1 })),
    joinedYear: state.year,
    tuition: opts?.isChild ? 0 : archetype === '명문가 자제' ? 22 : 10,
    ...(opts?.temperament
      ? { temperament: opts.temperament, temperamentKnown: true }
      : rollTemperament(getDifficultyId(state), opts?.isChild ? '친자녀' : archetype, { isChild: opts?.isChild, isGenius })),
  };
}
