import {
  ActiveEvent,
  BattleConfig,
  BattleEnemyKind,
  BloodGrudge,
  CountryId,
  GameState,
  SceneDialogueLine,
} from '../types/game';
import { josa } from '../utils/korean';

// ---------------------------------------------------------------- 전투 유형 분류

export function classifyBattleEnemyKind(battle: BattleConfig): BattleEnemyKind {
  if (battle.enemyKind) return battle.enemyKind;
  const id = battle.id || '';
  const follow = battle.eventFollowupId || '';

  if (follow.startsWith('sect_rebel|') || id.startsWith('b_rebel_')) return 'REBEL_DISCIPLE';
  if (id.startsWith('b_betray_')) return 'BETRAYER_DISCIPLE';
  if (id.startsWith('b_grudge_') || id === 'b_revenge_son' || id === 'b_karma_orphan') return 'BLOOD_AVENGER';
  if (battle.isRivalBattle || id.startsWith('b_rival_')) return 'RIVAL';
  if (follow === 'gm_win_spar' || follow === 'gm_win_real' || id.startsWith('b_grandmaster_')) return 'GRANDMASTER';
  if (follow.startsWith('sect_spar|')) return 'SECT_SPAR';
  if (follow.startsWith('sect_peace|')) return 'SECT_PEACE';
  if (follow.startsWith('sect_raid|')) return 'SECT_RAID';
  if (follow.startsWith('sect_aid|')) return 'SECT_AID';
  if (follow.startsWith('sect_duel|')) return 'SECT_DUEL';
  if (id.startsWith('b_ambush_') || id.startsWith('b_assassin_') || id === 'b_burglar') return 'ASSASSIN';
  if (id === 'b_demon') return 'DEMON';
  if (follow === 'clear_debt_win' || id === 'b_debt_duel') return 'DEBT';
  if (id === 'b_inquisition') return 'OFFICER';
  if (follow === 'hermit_reward' || id === 'b_hermit') return 'HERMIT';
  if (battle.isTournament) return 'TOURNAMENT';
  if (['b_henri', 'b_boxer', 'b_mongol', 'b_tang', 'b_jp_shogun', 'b_cn_tourney'].includes(id)) return 'FOREIGN';
  if (['b_onboard_thug', 'b_karma_thug', 'b_cn_opium', 'b_jp_famine', 'b_landlord'].includes(id)) return 'THUG';
  if (id.startsWith('spar_')) return 'SPAR';
  return 'BREAKER';
}

// ---------------------------------------------------------------- 전투 결과 오버레이(AutoBattleView) 상황별 상대 패배 대사

export function getBattleOverlayResultCopy(
  battle: BattleConfig,
  state: GameState,
  victory: boolean,
  winnerName: string,
  justParriesCount: number
): { headline: string; subline: string; enemyQuote?: string; ctaLabel: string } {
  if (battle.spectatorMode) {
    return {
      headline: '★ 절정 비무 종료 ★',
      subline: `${winnerName}의 승리! 두 절정 고수의 초식에서 깊은 깨달음을 얻었다.`,
      ctaLabel: '다음 무대로 ▶',
    };
  }

  const kind = classifyBattleEnemyKind(battle);
  const eName = battle.enemyName;

  if (!victory) {
    return {
      headline: '패 배 (敗北)',
      subline: battle.isRealDuel
        ? '진검결투에서 치명상을 입고 쓰러졌다… 운명의 판정이 기다린다.'
        : battle.isTournament
        ? `${battle.title}에서 아쉽게 발걸음을 멈췄다.`
        : '아쉬운 패배였다. 초식을 더 갈고닦자.',
      ctaLabel: '결과 확인 ▶',
    };
  }

  // 승리 시 — 진검결투 여부 & 상대 유형별 즉석 패배 대사!
  const isReal = battle.isRealDuel;
  const needsAftermath = isReal && battle.id !== 'b_rival_4';
  const parryTag = justParriesCount > 0 ? ` (간파 ${justParriesCount}회)` : '';

  let enemyQuote = '';
  let subline = `【${state.sectName}】 ${josa(winnerName, '이가')} ${josa(eName, '을를')} 제압했다!${parryTag}`;

  if (isReal) {
    subline = `진검이 피를 머금고 멈췄다. ${josa(eName, '이가')} 피를 흘리며 바닥에 쓰러졌다.${parryTag}`;
    switch (kind) {
      case 'REBEL_DISCIPLE':
        enemyQuote = '“크윽…… 끝내 사부님의 칼끝은 넘지 못했군요. ……망설이지 말고 거두십시오.”';
        break;
      case 'BETRAYER_DISCIPLE':
        enemyQuote = '“이럴 리가…… 타 문파에서 이를 갈고 돌아왔건만…… 사부님, 끝내시려거든 끝내십시오……”';
        break;
      case 'BLOOD_AVENGER':
        enemyQuote = `“크헉…… ${battle.grudgeMeta?.victimName ? `${battle.grudgeMeta.victimName}의` : '그날의'} 원한도 못 갚고…… 같은 칼에 쓰러지다니……”`;
        break;
      case 'RIVAL':
        subline = `황혼 아래 최후의 한 합이 끝났다. 평생의 숙적 ${josa(eName, '이가')} 미소 지으며 무릎을 꿇었다.`;
        enemyQuote = '“……후후, 마지막까지 자네다운 칼이었네. 내 평생의 벗이여, 이 칼을 받아 주게……”';
        break;
      case 'GRANDMASTER':
        enemyQuote = '“……쿨럭, 피비린내가 달구나. 평생 찾아 헤맨 극의를 네 칼끝에서 보았으니 여한이 없다.”';
        break;
      case 'ASSASSIN':
      case 'DEMON':
        enemyQuote = '“크하학…… 칼맛 한 번 매섭군…… 어서 숨통을 끊어라. 살려 두면 네 목을 따러 다시 올 테니……”';
        break;
      case 'DEBT':
        enemyQuote = '“으악! 피, 피가 멈추지 않아! 빚은 없던 일로 하겠소, 제발 목숨만은 살려 주시오!”';
        break;
      case 'OFFICER':
        enemyQuote = '“크윽…… 요사한 무인 놈…… 나를 베면 조정이 결코 가만두지 않을 것이다……”';
        break;
      case 'SECT_DUEL':
      case 'SECT_RAID':
      case 'SECT_AID':
        enemyQuote = '“쿨럭…… 진검을 뽑은 이상 변명은 없다. 목을 치든, 꺾인 칼을 쥐여 돌려보내든 네 뜻대로 해라.”';
        break;
      default:
        enemyQuote = '“크윽…… 목숨을 건 승부였으니 원망은 없다. ……끝을 내라.”';
        break;
    }
  } else {
    switch (kind) {
      case 'REBEL_DISCIPLE':
        enemyQuote = '“……결국 사부님의 그늘은 넘지 못했군요. 내치시려거든 지금 내치십시오.”';
        break;
      case 'BETRAYER_DISCIPLE':
        enemyQuote = '“분하다…… 그토록 칼을 갈아 왔는데, 아직도 사부님 손바닥 안이었다니……!”';
        break;
      case 'RIVAL':
        enemyQuote = state.age >= 55
          ? '“……백발이 되어서도 자네 칼은 여전히 매섭군. 오늘 일합은 내가 졌네.”'
          : '“……네 칼이 또 한 뼘 자랐군. 오늘 패배는 인정하지. 하지만 다음엔 다를 걸세.”';
        break;
      case 'GRANDMASTER':
        enemyQuote = '“……과연 무명의 칼끝에 하늘이 서렸구나. 오늘 일합은 오래도록 기억하겠네.”';
        break;
      case 'SECT_SPAR':
        enemyQuote = '“과연 듣던 대로 깊은 검리요! 오늘 한 수 제대로 배웠소.”';
        break;
      case 'SECT_PEACE':
        enemyQuote = '“하하, 통쾌한 한 합이었소! 칼이 부딪치니 묵은 앙금이 씻겨 내려가는군.”';
        break;
      case 'SECT_DUEL':
      case 'SECT_RAID':
      case 'SECT_AID':
        enemyQuote = '“크윽…… 이 치욕을 문파에 어찌 아뢸꼬……!”';
        break;
      case 'ASSASSIN':
        enemyQuote = '“쳇, 의뢰인이 말한 수준이 아니잖아……! 오늘은 물러난다!”';
        break;
      case 'THUG':
        enemyQuote = '“으악! 살려 줘! 다시는 이 도장 근처에 얼씬도 안 하겠소!”';
        break;
      case 'FOREIGN':
        if (battle.id === 'b_henri') enemyQuote = '“마니피크……! 동양의 검이 이토록 정교할 줄이야!”';
        else if (battle.id === 'b_boxer') enemyQuote = '“하하, 젠장! 턱이 얼얼하군! 끝내주는 주먹 맛이었어, 친구!”';
        else if (battle.id === 'b_mongol') enemyQuote = '“허어, 내 괴력을 정면으로 버텨 내다니! 진짜 호걸이로구나!”';
        else if (battle.id === 'b_tang') enemyQuote = '“어머…… 내 비침을 다 쳐 내다니. 흥, 오늘 한 수는 인정하지요.”';
        else enemyQuote = '“……훌륭한 일합이었소. 그대의 이름은 천하에 널리 알려질 것이오.”';
        break;
      case 'HERMIT':
        enemyQuote = '“허허, 과연 눈이 밝고 칼끝이 살아 있구나! 실로 유쾌한 일합이었네.”';
        break;
      case 'TOURNAMENT':
        enemyQuote = '“……완패요. 이 무대의 주인공은 그대인 듯하군.”';
        break;
      case 'SPAR':
        enemyQuote = '“훌륭한 초식이오! 땀이 식기 전에 방금 그 한 수를 곱씹어 보겠소.”';
        break;
      default:
        enemyQuote = `“……【${state.sectName}】의 이름은 헛소문이 아니었군. 오늘의 패배를 인정하겠소.”`;
        break;
    }
  }

  return {
    headline: isReal ? '⚔ 진검 승부 결정 ⚔' : '★ 승 리 (勝利) ★',
    subline,
    enemyQuote,
    ctaLabel: needsAftermath ? '쓰러진 상대의 처분 결정 ▶' : '결과 확인 ▶',
  };
}

// ---------------------------------------------------------------- 복수의 혈귀 프로필 생성기

const AVENGER_NAMES: Record<CountryId, string[]> = {
  KOREA: ['강혈', '박무영', '서진악', '윤천살', '한적염', '조백야', '이흑풍', '정원한'],
  CHINA: ['혈영랑', '진무정', '소적혈', '백원혼', '엽고성', '곽천수', '당적살', '임혈검'],
  JAPAN: ['쿠로카게 겐지', '아카츠키 렌', '키리사메 신', '호무라 타케시', '야미가와 료', '사쿠라바 카인'],
};

export function pickAvengerProfile(
  country: CountryId,
  victimName: string,
  victimTitle: string,
  kind: BattleEnemyKind,
  usedNames: Set<string>
): { relation: BloodGrudge['avengerRelation']; name: string } {
  const pool = AVENGER_NAMES[country] || AVENGER_NAMES.KOREA;
  const fresh = pool.filter((n) => !usedNames.has(n));
  const pickedName = (fresh.length > 0 ? fresh : pool)[Math.floor(Math.random() * (fresh.length > 0 ? fresh.length : pool.length))];

  let relations: BloodGrudge['avengerRelation'][] = ['자식', '아우', '동료', '사제(師弟)'];
  if (kind === 'SECT_DUEL' || kind === 'SECT_RAID' || kind === 'SECT_AID' || kind === 'GRANDMASTER') {
    relations = ['사제(師弟)', '문도', '자식', '동료'];
  } else if (kind === 'ASSASSIN' || kind === 'DEMON' || kind === 'DEBT') {
    relations = ['동료', '아우', '자식'];
  } else if (kind === 'REBEL_DISCIPLE' || kind === 'BETRAYER_DISCIPLE') {
    relations = ['아우', '동료', '연인', '자식'];
  } else if (kind === 'OFFICER') {
    relations = ['자식', '동료', '아우'];
  }
  const relation = relations[Math.floor(Math.random() * relations.length)];
  // 성씨가 같으면 더 실감나게 유지, 기본은 이름 풀에서 선택
  void victimName;
  void victimTitle;
  return { relation, name: pickedName };
}

// ---------------------------------------------------------------- 진검전투 승리 직후 상대방 처분 이벤트

export function buildRealDuelAftermathEvent(
  prev: GameState,
  next: GameState,
  battle: BattleConfig,
  fighterType: 'HERO' | 'DISCIPLE',
  discipleName?: string,
  battleBadges?: Array<{ label: string; tone: 'GOOD' | 'WARN' | 'MAGIC' | 'NORMAL' }>
): ActiveEvent {
  const kind = classifyBattleEnemyKind(battle);
  const eName = battle.enemyName;
  const eTitle = battle.enemyTitle;
  const follow = battle.eventFollowupId || '';
  const followParts = follow.split('|');

  // 타 문파 / 반란 메타 추출
  let sectId: string | undefined = battle.grudgeMeta?.sectId;
  let leaderId: string | undefined = battle.grudgeMeta?.leaderId;
  let followerIds: string[] = battle.grudgeMeta?.followerIds || [];
  let backerId: string | undefined;

  if (follow.startsWith('sect_rebel|')) {
    leaderId = followParts[1] || leaderId;
    followerIds = (followParts[2] || '').split(',').filter(Boolean);
    backerId = followParts[3] || undefined;
  } else if (follow.startsWith('sect_duel|') || follow.startsWith('sect_raid|')) {
    sectId = followParts[1] || sectId;
  } else if (follow.startsWith('sect_aid|')) {
    sectId = followParts[2] || sectId; // 적대 문파 측
  }

  const sectObj = sectId ? (next.sects || []).find((s) => s.id === sectId) : undefined;
  const sectShort = sectObj ? sectObj.name.replace(/\(.*?\)/g, '') : undefined;

  const victorLine =
    fighterType === 'DISCIPLE' && discipleName
      ? `${josa(discipleName, '이가')} 붉게 물든 칼끝을 겨눈 채 숨을 고르며 스승인 당신을 돌아본다.`
      : `붉게 물든 진검의 끝이 쓰러진 ${eName}의 목덜미 앞에 멈춰 섰다.`;

  let title = `⚔ 진검 승부의 끝 — 쓰러진 ${eName}`;
  let sceneActor: ActiveEvent['sceneActor'] = 'ENEMY';
  let script: SceneDialogueLine[] = [];
  let execLabel = `칼을 내리쳐 ${eName}의 숨통을 끊는다 (사살)`;
  let execHint = '살기↑ · 위엄↑ · 명성 +15 · ⚠ 훗날 동료나 자식이 복수의 혈귀가 되어 찾아올 수 있음';
  let spareLabel = '칼을 거두고 목숨만은 살려 돌려보낸다 (방면)';
  let spareHint = '인덕↑ · 구도↑ · 원한이 혈귀로 번지지 않음';
  let thirdOption: { id: string; label: string; hint: string } | null = null;
  let execOutcome: SceneDialogueLine[] = [];
  let spareOutcome: SceneDialogueLine[] = [];
  let thirdOutcome: SceneDialogueLine[] | undefined;

  switch (kind) {
    case 'REBEL_DISCIPLE': {
      title = `⚔ 반란의 끝 — 칼끝 아래 쓰러진 제자 ${eName}`;
      sceneActor = 'DISCIPLE';
      script = [
        { speaker: '나레이션', role: 'NARRATOR', text: `${victorLine} 마당에 피 냄새가 번지고, 반란에 가담했던 문하생들이 넋을 잃고 얼어붙었다.` },
        {
          speaker: eName,
          role: 'NPC',
          stageDirection: '(어깨를 움켜쥔 채 피를 토하며 무릎을 꿇는다)',
          text: '“크윽…… 결국 사부님의 칼끝은 넘지 못했군요. 등을 돌린 날부터 각오한 일입니다. ……망설이지 말고 거두십시오.”',
        },
        {
          speaker: prev.name,
          role: 'HERO',
          stageDirection: '(피 묻은 칼날을 내려다보며)',
          text: '내 손으로 길러 낸 제자의 목숨이 지금 이 칼끝에 달려 있다. 어찌 처분할 것인가……',
        },
      ];
      execLabel = `반란의 대가를 피로 묻는다 — ${josa(eName, '을를')} 벤다 (처형)`;
      execHint = '권위 +14 · 살기 +22 · 반란 완전 진압 · ⚠ 피붙이나 동료가 복수의 혈귀로 돌아올 수 있음';
      spareLabel = '목숨은 거두지 않고 파문해 대문 밖으로 내친다 (추방)';
      spareHint = '권위 +10 · 인덕 +16 · 반란 진압 · 복수의 혈귀 방지 (훗날 타 문파의 적으로 재회 가능)';
      thirdOption = {
        id: 'aftermath_mercy_subdue',
        label: '칼을 부러뜨리고 상처를 싸매 말단으로 묶어 둔다 (삭발·감시 속 속죄)',
        hint: '인덕 +20 · 구도 +10 · 권위 +6 · 제자 생존(충성 초기화·감시 부여)',
      };
      execOutcome = [
        { speaker: '나레이션', role: 'NARRATOR', text: `차갑게 빛난 칼날이 한 번 꺾이자, 반란을 일으켰던 ${josa(eName, '은는')} 끝내 숨을 거두었다.` },
        { speaker: '나레이션', role: 'NARRATOR', text: '뒤따르던 문하생들이 일제히 무기를 던지고 땅에 이마를 박았다. 도장에는 서늘한 위엄과 무거운 침묵이 내려앉았다.' },
      ];
      spareOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“내 손으로 거둔 아이의 피까지 마당에 묻히지는 않겠다. 꺾인 칼을 들고 당장 이 문턱을 떠나라.”' },
        { speaker: eName, role: 'NPC', text: '“……이 치욕과 은혜, 둘 다 잊지 않겠습니다, 사부님.”' },
        { speaker: '나레이션', role: 'NARRATOR', text: `${josa(eName, '이가')} 비틀거리며 대문 밖으로 사라지자, 남은 제자들이 안도의 한숨과 함께 무릎을 꿇었다.` },
      ];
      thirdOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“죽어서 끝낼 생각 마라. 네가 어지럽힌 마당을 평생 쓸며 죗값을 치러라.”' },
        { speaker: eName, role: 'NPC', stageDirection: '(부러진 칼자루를 바라보며 고개를 깊게 숙인다)', text: '“……살려 주신 목숨, 다시는 헛되이 들지 않겠습니다……”' },
      ];
      break;
    }

    case 'BETRAYER_DISCIPLE': {
      title = `⚔ 배신한 옛 제자의 최후 — ${eName}`;
      sceneActor = 'ENEMY';
      script = [
        { speaker: '나레이션', role: 'NARRATOR', text: `${victorLine} 옛날 이 마당에서 함께 땀을 흘리던 제자가 이제는 피를 흘리며 엎드려 있다.` },
        {
          speaker: eName,
          role: 'NPC',
          stageDirection: '(꺾인 검을 짚고 가까스로 고개를 든다)',
          text: '“이럴 수가…… 타 문파에서 그토록 이를 갈고 배워 왔건만…… 아직도 사부님 칼끝에 닿지 못하다니. 배은망덕한 놈이니 베시려거든 베십시오……”',
        },
      ];
      execLabel = `배신자에게 사문(師門)의 피의 법도를 내린다 — ${josa(eName, '을를')} 벤다`;
      execHint = '살기 +20 · 명성 +20 · 위엄 +8 · ⚠ 그를 따르던 자가 복수의 혈귀로 찾아올 수 있음';
      spareLabel = '“다시는 내 이름을 입에 올리지 마라.” 목숨만 살려 쫓아낸다';
      spareHint = '인덕 +18 · 구도 +10 · 원한 청산';
      execOutcome = [
        { speaker: '나레이션', role: 'NARRATOR', text: `스승을 등지고 칼을 겨눴던 옛 제자 ${josa(eName, '은는')} 끝내 옛 도장 마당에서 숨을 거두었다.` },
        { speaker: '나레이션', role: 'NARRATOR', text: '강호에는 “배신한 제자는 스승의 진검을 피하지 못한다”는 서늘한 소문이 번졌다.' },
      ];
      spareOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“한때 내 문하에 들었던 정을 봐서 목숨만은 남겨 둔다. 칼을 버리고 돌아가거라.”' },
        { speaker: eName, role: 'NPC', text: '“……면목 없습니다, 사부님. 다시는 강호에 발을 들이지 않겠습니다……”' },
      ];
      break;
    }

    case 'BLOOD_AVENGER': {
      const vic = battle.grudgeMeta?.victimName;
      const rel = battle.grudgeMeta?.avengerRelation;
      title = `☠ 피의 업보 — 쓰러진 복수의 혈귀 ${eName}`;
      sceneActor = 'ENEMY';
      script = [
        { speaker: '나레이션', role: 'NARRATOR', text: `${victorLine} 복수만을 품고 칼을 갈아 온 혈귀가 붉은 피를 토하며 바닥에 무너졌다.` },
        {
          speaker: eName,
          role: 'NPC',
          stageDirection: '(충혈된 눈으로 당신을 노려보며)',
          text: vic
            ? `“크헉…… ${vic}${rel ? `의 ${rel}로서` : '의 원한을'} 끝내 못 갚고 같은 칼에 쓰러지다니……! 어서 죽여라…… 저승에서라도 네 목을 노릴 테니……!”`
            : '“크헉…… 기어이 원수도 못 갚고 같은 칼에 쓰러지다니……! 망설이지 말고 숨통을 끊어라!”',
        },
      ];
      execLabel = '피의 업보를 피로 끝낸다 — 숨통을 끊는다 (사살)';
      execHint = '살기 +22 · 명성 +20 · 위엄 +6 · ⚠ 원한의 연쇄가 또 다른 혈귀를 부를 수 있음';
      spareLabel = '“살육의 고리는 여기서 끊겠다.” 지혈해 주고 살려 보낸다';
      spareHint = '인덕 +22 · 구도 +16 · 피의 연쇄 종결';
      execOutcome = [
        { speaker: '나레이션', role: 'NARRATOR', text: `끝내 자비를 거부한 ${eName}의 목숨을 거두었다. 마당에 또 한 줄기 깊은 피의 업보가 새겨졌다.` },
      ];
      spareOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“네 원한은 내가 짊어진 업보다. 하지만 이 피의 고리를 네 대에서 더 잇지는 않겠다. 살아라.”' },
        { speaker: eName, role: 'NPC', stageDirection: '(치밀어 오르는 분노와 허탈함 속에 이를 악문다)', text: '“……빌어먹을…… 동정 따위 필요 없건만……”' },
        { speaker: '나레이션', role: 'NARRATOR', text: `상처를 싸매 쫓아낸 ${josa(eName, '은는')} 끝내 칼을 버리고 빗속으로 사라졌다.` },
      ];
      break;
    }

    case 'GRANDMASTER': {
      title = `⚔ 절정 진검결투의 끝 — 쓰러진 ${eName}`;
      sceneActor = 'RIVAL';
      script = [
        { speaker: '나레이션', role: 'NARRATOR', text: `${victorLine} 천하에 이름 높던 절정 고수가 깊은 상처를 안고 고요히 무릎을 꿇었다.` },
        {
          speaker: eName,
          role: 'NPC',
          stageDirection: '(입가의 피를 닦으며 담담히 미소 짓는다)',
          text: '“……후후, 피비린내가 이토록 달 줄이야. 평생 찾아 헤맨 극의를 그대 칼끝에서 보았으니 여한이 없네. 생사결의 법도대로 거두게.”',
        },
      ];
      execLabel = '생사결의 법도를 끝까지 치른다 — 일격에 숨통을 끊는다';
      execHint = '살기 +25 · 명성 +35 · 위엄 +10 · ⚠ 문하 제자들이 복수의 혈귀가 되어 찾아올 수 있음';
      spareLabel = '“당대 고수의 목숨을 어찌 헛되이 거두겠소.” 정중히 부축해 상처를 치료한다';
      spareHint = '인덕 +25 · 구도 +18 · 통찰 +3 · 강호의 깊은 경외를 얻음';
      execOutcome = [
        { speaker: eName, role: 'NPC', text: '“……고맙네. 무인답게 가는군……”' },
        { speaker: '나레이션', role: 'NARRATOR', text: `당대 절정 고수 ${josa(eName, '이가')} 당신의 진검 아래 숨을 거두었다. 천하가 경악하고, 그 문도들은 피눈물을 삼켰다.` },
      ];
      spareOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“승부는 이미 가려졌소. 이 시대의 귀한 검을 여기서 꺾을 수는 없소.”' },
        { speaker: eName, role: 'NPC', text: `“……칼끝의 날카로움보다 그대의 도량이 더 무섭군. 오늘부로 강호는 【${prev.sectName}】의 것이네.”` },
        { speaker: '나레이션', role: 'NARRATOR', text: `정중히 상처를 싸매 돌려보낸 일화는 순식간에 강호의 미담으로 퍼져 나갔다. (통찰 +3)` },
      ];
      break;
    }

    case 'DEBT': {
      title = `⚔ 빚 청산 진검결투 — 무릎 꿇은 ${eName}`;
      sceneActor = 'ENEMY';
      script = [
        { speaker: '나레이션', role: 'NARRATOR', text: `${victorLine} 바닥에 나뒹군 전당포 두목이 피투성이 손으로 품속 차용증을 꺼내 갈기갈기 찢어 던졌다.` },
        {
          speaker: eName,
          role: 'NPC',
          stageDirection: '(사색이 된 채 덜덜 떨며)',
          text: '“으악! 알았소, 빚은 없던 일로 하겠소! 차용증도 다 찢었소! 제발 목숨만은 살려 주시오!”',
        },
      ];
      execLabel = '“피를 보러 온 놈은 피로 갚아야지.” 숨통을 끊는다';
      execHint = '살기 +24 · 전당포 금고 잔금 +70 노획 · ⚠ 조직의 형제·자식이 복수의 혈귀가 될 수 있음';
      spareLabel = '차용증만 확인하고 목숨은 살려 쫓아낸다';
      spareHint = '인덕 +14 · 빚 전액 청산 유지 · 추가 원한 없음';
      execOutcome = [
        { speaker: '나레이션', role: 'NARRATOR', text: '비명이 짧게 끊겼다. 뒤따르던 전당포 패거리들이 기겁하며 흩어졌고, 당신은 바닥에 떨어진 은자 주머니까지 거두었다.' },
      ];
      spareOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“꺼져라. 다시는 이 도장 문턱을 넘볼 생각 마라.”' },
        { speaker: '나레이션', role: 'NARRATOR', text: '전당포 두목이 피를 흘리며 기어가듯 달아났다. 지긋지긋하던 빚의 족쇄가 마침내 끊어졌다.' },
      ];
      break;
    }

    case 'OFFICER': {
      title = `⚔ 요괴 도장 토벌전의 끝 — 쓰러진 ${eName}`;
      sceneActor = 'ENEMY';
      script = [
        { speaker: '나레이션', role: 'NARRATOR', text: `${victorLine} 갑옷이 갈라진 관군 토벌대장이 부러진 창을 짚고 피를 뱉었다.` },
        {
          speaker: eName,
          role: 'NPC',
          stageDirection: '(이를 갈며 당신을 노려본다)',
          text: '“크윽…… 요사한 무인 놈…… 내 목을 베면 조정이 대군을 몰고 와 네 도장을 잿더미로 만들 것이다!”',
        },
      ];
      execLabel = '“조정이든 누구든 막는 자는 벤다.” 토벌대장을 베어 버린다';
      execHint = '살기 +28 · 이단 +20 · 명성 +25 · ⚠ 동료 장교나 자식이 복수의 혈귀로 찾아올 수 있음';
      spareLabel = '목숨을 살려 돌려보내 조정에 경고를 전하게 한다';
      spareHint = '인덕 +15 · 구도 +10 · 관군의 원한 완화';
      execOutcome = [
        { speaker: '나레이션', role: 'NARRATOR', text: '토벌대장이 쓰러지자 관군 병사들이 공포에 질려 뿔뿔이 흩어졌다. 당신의 이름은 공포의 전설로 각인되었다.' },
      ];
      spareOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“돌아가 조정에 전하시오. 우리는 백성을 해치지 않으니, 다시는 칼을 들이대지 말라고.”' },
        { speaker: '나레이션', role: 'NARRATOR', text: '토벌대장이 부하들의 부축을 받으며 창백한 얼굴로 물러났다.' },
      ];
      break;
    }

    case 'ASSASSIN':
    case 'DEMON': {
      title = `⚔ 생사결의 끝 — 쓰러진 ${eName}`;
      sceneActor = 'ENEMY';
      script = [
        { speaker: '나레이션', role: 'NARRATOR', text: `${victorLine} 피에 굶주려 도장을 덮쳤던 자가 깊은 자상을 입고 쓰러져 거칠게 숨을 몰아쉰다.` },
        {
          speaker: eName,
          role: 'NPC',
          stageDirection: '(피 묻은 이를 드러내며 비릿하게 웃는다)',
          text: '“크하학…… 칼맛 한 번 지독하군…… 어서 숨통을 끊어라. 어설프게 살려 보내면 네 목을 따러 다시 올 테니……”',
        },
      ];
      execLabel = `후환을 남기지 않고 ${eName}의 숨통을 끊는다 (사살)`;
      execHint = '살기 +20 · 명성 +18 · 위엄 +6 · ⚠ 암살단 동료나 혈연이 복수의 혈귀로 찾아올 수 있음';
      spareLabel = '칼을 부러뜨리고 목숨만 살려 어둠 속으로 쫓아낸다';
      spareHint = '인덕 +14 · 구도 +8 · 피의 연쇄 방지 (단 명성 소폭 조정 없음)';
      execOutcome = [
        { speaker: '나레이션', role: 'NARRATOR', text: `어둠 속에서 칼을 들이밀었던 ${josa(eName, '은는')} 차가운 마당 위에서 끝내 숨이 멎었다.` },
      ];
      spareOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“칼을 꺾었으니 이제 네 손으로 누구도 해치지 못할 것이다. 살아서 죗값을 치러라.”' },
        { speaker: '나레이션', role: 'NARRATOR', text: `${josa(eName, '이가')} 부러진 칼자루를 내팽개치고 비틀거리며 어둠 속으로 사라졌다.` },
      ];
      break;
    }

    case 'SECT_DUEL':
    case 'SECT_RAID':
    case 'SECT_AID': {
      title = `⚔ 진검 승부의 끝 — ${sectShort ? `${sectShort}의 ` : ''}${eName}`;
      sceneActor = 'ENEMY';
      script = [
        { speaker: '나레이션', role: 'NARRATOR', text: `${victorLine} ${sectShort ? `【${sectShort}】을 대표해 진검을 뽑았던 ` : ''}${josa(eName, '이가')} 붉은 피를 쏟으며 바닥에 무릎을 꿇었다.` },
        {
          speaker: eName,
          role: 'NPC',
          stageDirection: '(떨리는 손으로 상처를 누르며)',
          text: '“쿨럭…… 진검을 뽑은 이상 변명은 없다. 내 목을 쳐 문파의 본보기로 삼든, 꺾인 칼을 쥐여 돌려보내든 네 뜻대로 해라……”',
        },
      ];
      execLabel = `진검의 대가를 묻는다 — ${josa(eName, '을를')} 베어 죽인다`;
      execHint = `살기 +22 · 위엄 +8 · 명성 +18 · ${sectShort ? `${sectShort} 관계 -25(불구대천) · ` : ''}⚠ 사제/문도가 복수의 혈귀로 찾아올 수 있음`;
      spareLabel = '급소를 피해 지혈한 뒤 문파로 돌려보낸다 (방면)';
      spareHint = `인덕 +18 · 구도 +8 · ${sectShort ? `${sectShort} 관계 +8(도량에 경외) · ` : ''}복수의 혈귀 방지`;
      execOutcome = [
        { speaker: '나레이션', role: 'NARRATOR', text: `진검이 한 번 더 번쩍이자 ${josa(eName, '은는')} 그 자리에서 절명했다. ${sectShort ? `【${sectShort}】과의 사이는 돌이킬 수 없는 피의 원한으로 물들었다.` : '강호에 서늘한 피바람의 소문이 퍼졌다.'}` },
      ];
      spareOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“승부는 이미 끝났소. 목숨까지 거두어 피의 원한을 키울 생각은 없소. 돌아가 치료하시오.”' },
        { speaker: eName, role: 'NPC', text: `“……죽일 수 있었는데도 칼을 거두다니. 【${prev.sectName}】의 칼뿐 아니라 그 도량에 진심으로 졌소……”` },
      ];
      break;
    }

    default: {
      title = `⚔ 진검결투의 끝 — 쓰러진 ${eName}`;
      sceneActor = 'ENEMY';
      script = [
        { speaker: '나레이션', role: 'NARRATOR', text: `${victorLine} 생사를 걸고 덤벼들었던 ${josa(eName, '이가')} 피를 흘리며 엎드려 있다.` },
        {
          speaker: eName,
          role: 'NPC',
          stageDirection: '(거친 숨을 내쉬며 고개를 떨군다)',
          text: '“크윽…… 목숨을 걸고 진검을 뽑았으니 원망은 없다. ……네 뜻대로 끝을 내라.”',
        },
      ];
      execLabel = `생사결의 끝을 맺는다 — ${eName}의 숨통을 끊는다 (사살)`;
      execHint = '살기 +20 · 위엄 +6 · 명성 +15 · ⚠ 훗날 자식이나 동료가 복수의 혈귀가 되어 찾아올 수 있음';
      spareLabel = '칼을 거두고 목숨만은 살려 돌려보낸다 (방면)';
      spareHint = '인덕 +16 · 구도 +8 · 원한이 혈귀로 번지지 않음';
      execOutcome = [
        { speaker: '나레이션', role: 'NARRATOR', text: `진검의 승부는 피로 막을 내렸다. 쓰러진 ${josa(eName, '은는')} 다시 일어나지 못했고, 도장 마당에 무거운 살기가 남았다.` },
      ];
      spareOutcome = [
        { speaker: prev.name, role: 'HERO', text: '“목숨까지 앗을 생각은 없다. 꺾인 칼을 거두고 물러나라.”' },
        { speaker: eName, role: 'NPC', text: '“……살려 준 빚, 평생 잊지 않겠소. 다시는 칼을 겨누지 않겠소.”' },
      ];
      break;
    }
  }

  const options = [
    { id: 'aftermath_execute', label: execLabel, hint: execHint },
    { id: 'aftermath_spare', label: spareLabel, hint: spareHint },
    ...(thirdOption ? [thirdOption] : []),
  ];

  const outcomeScripts: Record<string, SceneDialogueLine[]> = {
    aftermath_execute: execOutcome,
    aftermath_spare: spareOutcome,
    ...(thirdOutcome ? { aftermath_mercy_subdue: thirdOutcome } : {}),
  };

  return {
    id: `duel_aftermath_${battle.id}_${next.turn}`,
    title,
    category: 'DUEL',
    sceneActor,
    narration: script[0]?.text || victorLine,
    speaker: eName,
    dialogue: script[1]?.text || '',
    script,
    outcomeScripts,
    options,
    meta: {
      enemyName: eName,
      enemyTitle: eTitle,
      enemyKind: kind,
      sectId,
      leaderId,
      followerIds,
      backerId,
      battleTitle: battle.title,
      battleBadges: battleBadges || [],
    },
  };
}

// ---------------------------------------------------------------- 복수의 혈귀 연쇄 이벤트 생성

export function buildBloodGrudgeEvent(state: GameState, grudge: BloodGrudge): ActiveEvent {
  const yearsAgo = Math.max(1, state.year - grudge.killedYear);
  const relCall =
    grudge.avengerRelation === '자식'
      ? '아버지'
      : grudge.avengerRelation === '아우'
      ? '형님'
      : grudge.avengerRelation === '사제(師弟)'
      ? '사형'
      : grudge.avengerRelation === '문도'
      ? '사부님'
      : grudge.avengerRelation === '연인'
      ? '그 사람'
      : '벗';

  const canAtone = state.reputation.virtue >= 35 || state.reputation.ascetic >= 35;

  const script: SceneDialogueLine[] = [
    {
      speaker: '나레이션',
      role: 'NARRATOR',
      text: `해 질 녘, 핏빛 살기를 두른 낯선 검객이 피 묻은 천으로 칼자루를 감은 채 도장 대문 앞에 섰다. 눈동자에는 살아 있는 사람의 빛이 없었다.`,
    },
    {
      speaker: grudge.avengerName,
      role: 'NPC',
      stageDirection: '(시퍼런 진검을 뽑아 땅에 긁으며)',
      text: `“【${state.sectName}】의 ${state.name}……! ${yearsAgo}년 전(${grudge.killedYear}년), 네 칼에 숨이 끊어졌던 ${grudge.victimTitle} ${josa(grudge.victimName, '을를')} 기억하느냐!”`,
      emote: 'ANGRY',
    },
    {
      speaker: grudge.avengerName,
      role: 'NPC',
      text: `“나는 그분의 ${grudge.avengerRelation} ${grudge.avengerName}이다! 그날 이후 단 하루도 편히 잠들지 못하고 피를 토하며 칼을 갈아 왔다…… 오늘 네 목을 베어 ${relCall}의 무덤 앞에 바치겠다!”`,
      emote: '!',
    },
  ];

  const options = [
    {
      id: 'grudge_duel',
      label: `“내가 진 피의 업보다. 덤벼라!” 진검을 뽑아 정면으로 맞선다 (⚠ 진검결투)`,
      hint: '⚠ 패배 시 사망/영구장애 · 승리 시 명성 +65 & 혈귀의 처분 결정',
    },
    ...(canAtone
      ? [
          {
            id: 'grudge_atone',
            label: '“내 칼이 남긴 원한이 맞다. 칼등으로만 받아 내겠다 — 살육은 여기서 끝내자.”',
            hint: '진검결투 회피 · 건강 -16 · 명성 -12 · 인덕 +25 · 구도 +18 · 원한 청산',
          },
        ]
      : []),
    {
      id: 'grudge_disarm',
      label: '제자들과 함께 포위해 칼을 빼앗아 쫓아낸다',
      hint: '안전 · 단 명성 -18, 위엄 -12, 원한은 남음',
    },
  ];

  return {
    id: `blood_grudge_${grudge.id}_${state.turn}`,
    title: `☠ 복수의 혈귀 — ${grudge.avengerName}`,
    category: 'DUEL',
    sceneActor: 'ENEMY',
    narration: `${yearsAgo}년 전(${grudge.killedYear}년) 당신이 진검으로 베었던 ${grudge.victimName}의 ${grudge.avengerRelation} ${josa(grudge.avengerName, '이가')} 복수의 혈귀가 되어 찾아왔다.`,
    speaker: grudge.avengerName,
    dialogue: script[2].text,
    script,
    outcomeScripts: {
      grudge_atone: [
        { speaker: '나레이션', role: 'NARRATOR', text: '당신은 날을 세우지 않은 채 혈귀의 맹공을 온몸으로 받아 냈다. 소매가 찢기고 깊은 생채기가 났으나, 끝내 칼날을 들이대지 않았다.' },
        { speaker: grudge.avengerName, role: 'NPC', text: '“……왜 베지 않는 거냐! 이래서는 내가…… 내가 무엇을 위해 십 리 피눈물을 삼켰단 말이냐……!”' },
        { speaker: '나레이션', role: 'NARRATOR', text: `${josa(grudge.avengerName, '은는')} 끝내 무릎을 꿇고 통곡하다가 부러진 칼을 땅에 꽂고 어둠 속으로 사라졌다.` },
      ],
      grudge_disarm: [
        { speaker: '나레이션', role: 'NARRATOR', text: `문하생들과 포위망을 좁혀 가까스로 ${grudge.avengerName}의 칼을 쳐 내고 몰아냈다. 비겁하다는 수군거림이 등 뒤로 남았다.` },
      ],
    },
    options,
    meta: {
      grudgeId: grudge.id,
      victimName: grudge.victimName,
      victimTitle: grudge.victimTitle,
      avengerName: grudge.avengerName,
      avengerRelation: grudge.avengerRelation,
      killedYear: grudge.killedYear,
      sectId: grudge.sectId,
    },
  };
}

// ---------------------------------------------------------------- 목검·비무·예외 진검 승리 결말 대사 (buildBattleConclusionNotice용)

export function buildDetailedVictoryConclusion(
  prev: GameState,
  battle: BattleConfig,
  fighterType: 'HERO' | 'DISCIPLE',
  discipleName?: string
): { title: string; speaker: string; role: 'HERO' | 'RIVAL' | 'ENEMY' | 'DISCIPLE'; body: string } | null {
  const kind = classifyBattleEnemyKind(battle);
  const eName = battle.enemyName;
  const isElder = prev.age >= 55;
  const prevWins = prev.flags.tournamentWins || 0;

  // 제자 출전 승리 (목검 비무)
  if (fighterType === 'DISCIPLE') {
    const dName = discipleName || '문하생';
    if (kind === 'BETRAYER_DISCIPLE') {
      return {
        title: `${battle.title} — 제자가 배신자를 꺾다`,
        speaker: eName,
        role: 'ENEMY',
        body: `${josa(dName, '이가')} 배신한 옛 동문 ${josa(eName, '을를')} 정면으로 쓰러뜨렸다.\n“……젠장, 사부님도 아니고 후배 제자에게까지 꺾이다니……! 면목이 없군……”`,
      };
    }
    if (kind === 'SECT_SPAR') {
      return {
        title: `${battle.title} — 제자의 훌륭한 교류 비무`,
        speaker: dName,
        role: 'DISCIPLE',
        body: `“사부님! 가르쳐 주신 초식으로 타 문파 사범님과 멋진 승부를 겨뤘습니다!”\n${josa(eName, '이가')} 고개를 끄덕이며 【${prev.sectName}】 문하의 탄탄한 기본기를 칭찬했다.`,
      };
    }
    if (kind === 'ASSASSIN' || kind === 'THUG') {
      return {
        title: `${battle.title} — 제자가 불청객을 물리치다`,
        speaker: dName,
        role: 'DISCIPLE',
        body: `“사부님, 도장은 제가 지켰습니다!”\n${josa(eName, '이가')} “제자 놈까지 괴물이잖아!”라며 꽁지가 빠지게 달아났다.`,
      };
    }
    return {
      title: `${battle.title} — 제자의 승전보`,
      speaker: dName,
      role: 'DISCIPLE',
      body: `“사부님! 가르쳐 주신 초식으로 해냈습니다!”\n${josa(eName, '이가')} “스승뿐 아니라 제자마저 무섭군……”이라며 혀를 내두르고 물러갔다.`,
    };
  }

  // 라이벌 4막 최후의 진검결투 승리 — 황혼의 작별 & 보검 유품 계승!
  if (battle.id === 'b_rival_4') {
    return {
      title: `최후의 한 합 — 평생의 숙적 ${eName}과의 작별`,
      speaker: eName,
      role: 'RIVAL',
      body: `황혼이 붉게 물든 마당, 최후의 진검을 주고받은 ${josa(eName, '이가')} 미소 지으며 칼을 떨어뜨리고 무릎을 꿇었다.\n“……후후, 마지막까지 자네다운 칼이었네. 병상에서 썩어 죽는 대신, 평생 겨뤄 온 벗의 칼끝을 보며 눈을 감으니 여한이 없네…… 내 보검을 부디 자네가 거두어 주게……”\n그날 밤, 반백 년을 함께 걸어온 평생의 숙적은 고요히 숨을 거두었다.`,
    };
  }

  // 반란 제자 목검 제압
  if (kind === 'REBEL_DISCIPLE') {
    return {
      title: `반란 진압 — 꺾인 제자 ${eName}`,
      speaker: eName,
      role: 'DISCIPLE',
      body: `목검 일격에 무기를 놓친 ${josa(eName, '이가')} 마당에 무릎을 꿇었다. 뒤따르던 문하생들도 일제히 고개를 숙였다.\n“……결국 사부님의 그늘은 넘지 못했군요. 더 할 말은 없습니다. 지금 당장 대문을 떠나겠습니다.”`,
    };
  }

  // 배신해 적이 되어 돌아온 옛 문하생 (목검 비무)
  if (kind === 'BETRAYER_DISCIPLE') {
    return {
      title: `배신한 옛 제자 제압 — ${eName}`,
      speaker: eName,
      role: 'ENEMY',
      body: `손목이 꺾이며 무기를 떨어뜨린 옛 제자 ${josa(eName, '이가')} 믿을 수 없다는 눈으로 당신을 올려다보았다.\n“이럴 수가…… 타 문파에서 그토록 이를 갈고 배워 왔는데, 아직도 사부님 칼끝에 닿지 못하다니……! ……예전처럼 한 번만 더, 아니…… 아무것도 아닙니다. 다시는 나타나지 않겠습니다.”`,
    };
  }

  // 타 문파 교류 비무
  if (kind === 'SECT_SPAR') {
    return {
      title: `${battle.title} — 뜻깊은 교류 비무`,
      speaker: eName,
      role: 'RIVAL',
      body: `${josa(eName, '이가')} 목검을 거두고 정중히 포권하며 땀을 닦았다.\n“과연 듣던 대로 【${prev.sectName}】의 검리는 깊구려! 승패를 떠나 오늘 한 수 크게 배웠소. 문파에 돌아가 장문인께도 정중히 전하겠소.”`,
    };
  }

  // 타 문파 화해 일합
  if (kind === 'SECT_PEACE') {
    return {
      title: `${battle.title} — 칼로 씻어 낸 묵은 원한`,
      speaker: eName,
      role: 'RIVAL',
      body: `${josa(eName, '이가')} 호탕하게 웃으며 무기를 내려놓고 술병을 들어 올렸다.\n“하하, 통쾌한 한 합이었소! 역시 무인끼리는 말보다 칼끝을 한 번 맞대는 편이 묵은 체증이 싹 내려가는군. 자, 오늘 밤은 원한을 털고 한잔합시다!”`,
    };
  }

  // 타 문파 대표 무사 대결 / 습격 방어 / 우호 문파 원군 (목검/비무)
  if (kind === 'SECT_RAID') {
    return {
      title: `${battle.title} — 적대 문파 습격 격퇴`,
      speaker: eName,
      role: 'ENEMY',
      body: `대문 앞을 덮쳤던 ${josa(eName, '이가')} 어깨를 감싸 쥐고 비틀거리며 뒤로 물러났다.\n“크윽…… 【${prev.sectName}】 도장주가 이 정도 괴물일 줄이야……! 전원 물러나라!”`,
    };
  }
  if (kind === 'SECT_DUEL') {
    return {
      title: `${battle.title} — 타 문파 대표 무사 격파`,
      speaker: eName,
      role: 'ENEMY',
      body: `${josa(eName, '이가')} 꺾인 무기를 쥔 채 창백한 얼굴로 입술을 깨물었다.\n“……크윽, 이 치욕을 문파에 어찌 아뢸꼬. 오늘은 물러나지만 우리 문파가 이 일을 잊지 않을 것이오.”`,
    };
  }
  if (kind === 'SECT_AID') {
    return {
      title: `${battle.title} — 동맹 문파 원군 승리`,
      speaker: eName,
      role: 'ENEMY',
      body: `${josa(eName, '이가')} 기세가 꺾인 채 병력을 물렸다.\n“쳇, 【${prev.sectName}】이 직접 끼어들 줄이야……! 오늘은 이쯤에서 물러난다!”`,
    };
  }

  // 자객 / 비급 도둑
  if (kind === 'ASSASSIN') {
    return {
      title: `${battle.title} — 침입자 제압`,
      speaker: eName,
      role: 'ENEMY',
      body: `복면이 반쯤 찢어진 ${josa(eName, '이가')} 바닥을 구른 뒤 급히 담장 위로 몸을 날렸다.\n“쳇, 의뢰인이 말한 수준이 아니잖아……! 임무 실패다!”`,
    };
  }

  // 이국/특수 강호 고수들
  if (kind === 'FOREIGN') {
    if (battle.id === 'b_henri') {
      return {
        title: '앙리 뒤퐁 — 동서양 검술의 만남',
        speaker: eName,
        role: 'RIVAL',
        body: `앙리 뒤퐁이 에페를 가슴 앞에 세우며 우아하게 고개를 숙였다.\n“마니피크(Magnifique)……! 동양의 칼이 이토록 정교하고 매서울 줄이야. 약속대로 내 프랑스 에페 교본을 그대에게 바치겠소, 마스터!”`,
      };
    }
    if (battle.id === 'b_boxer') {
      return {
        title: '영국 복서 잭 — 호쾌한 맨손 승부',
        speaker: eName,
        role: 'RIVAL',
        body: `잭이 턱을 문지르며 껄껄 웃고 두꺼운 손을 내밀었다.\n“하하, 젠장! 눈앞에 별이 번쩍이네! 동양 주먹 맛 한 번 끝내주는구먼, 친구! 이 브로턴 권투 교본, 자네가 가질 자격이 충분해!”`,
      };
    }
    if (battle.id === 'b_mongol') {
      return {
        title: '북방 초원의 씨름 장사 — 괴력을 꺾다',
        speaker: eName,
        role: 'RIVAL',
        body: `거구의 장사가 모래를 털며 껄껄 웃고 엄지를 치켜세웠다.\n“허어, 내 괴력을 정면으로 버텨 내고 넘기다니! 초원에서도 좀처럼 보기 힘든 진짜 호걸이로구나!”`,
      };
    }
    if (battle.id === 'b_tang') {
      return {
        title: '당문 암기 여협객 — 비침을 뚫다',
        speaker: eName,
        role: 'RIVAL',
        body: `당문 여협객이 소매를 털며 콧방귀를 뀌었지만 눈빛에는 감탄이 서려 있었다.\n“어머…… 내 비침을 단 하나도 안 맞고 전부 쳐 내다니. 흥, 오늘 한 수는 인정해 드리지요. 이 암기 비급, 허투루 쓰지 마세요.”`,
      };
    }
    if (battle.id === 'b_jp_shogun') {
      return {
        title: '에도성 어전 시합 — 쇼군 앞의 승리',
        speaker: eName,
        role: 'RIVAL',
        body: `야규 사범 대리가 목검을 내리고 깊이 고개를 숙였다. 어전 곳곳에서 나지막한 탄성이 터져 나왔다.\n“……완패요. 쇼군 전하 앞에서 이토록 맑은 검을 보게 될 줄이야. 천하 제일검의 이름은 그대의 것이오.”`,
      };
    }
    if (battle.id === 'b_cn_tourney') {
      return {
        title: '강남 천하 비무대회 — 중원 제패',
        speaker: eName,
        role: 'RIVAL',
        body: `소림 속가 대사형이 합장하며 진심 어린 경의를 표했다.\n“아미타불…… 【${prev.sectName}】의 절기는 소림의 고수들 앞에서도 결코 밀리지 않는구려. 오늘 승부는 소승의 완패요.”`,
      };
    }
  }

  // 왈패 / 흑사회 / 굶주린 낭인 / 토호 호위
  if (kind === 'THUG') {
    if (battle.id === 'b_jp_famine') {
      return {
        title: '굶주린 낭인 무리 격퇴',
        speaker: eName,
        role: 'ENEMY',
        body: `무기를 놓친 낭인 두목이 흙바닥에 주저앉아 허탈하게 웃었다.\n“……젠장, 굶어 죽으나 맞아 죽으나 매한가지라 덤볐는데…… 알았소, 물러나겠소.”`,
      };
    }
    if (battle.id === 'b_cn_opium') {
      return {
        title: '아편 밀수단 소탕 완료',
        speaker: eName,
        role: 'ENEMY',
        body: `부두 바닥에 나뒹군 밀수단 두목이 악을 쓰며 부하들과 배를 향해 도주했다.\n“빌어먹을 정의로운 척하는 무인 놈……! 광둥 흑사회를 건드린 걸 후회하게 될 거다!”`,
      };
    }
    if (battle.id === 'b_landlord') {
      return {
        title: '토호의 호위 무사 격퇴',
        speaker: eName,
        role: 'ENEMY',
        body: `창을 떨어뜨린 용병 호위가 고개를 절레절레 저으며 토호 쪽으로 물러섰다.\n“이 돈 받고는 못 싸우겠소, 나으리! 저 양반은 보통 도장주가 아니오!”`,
      };
    }
    return {
      title: `${battle.title} — 불청객 제압`,
      speaker: eName,
      role: 'ENEMY',
      body: `코피를 흘리며 나뒹군 ${josa(eName, '이가')} 꽁지가 빠지게 달아났다.\n“으악! 이, 이 집 도장주 눈빛이 완전히 미쳤어! 다시는 얼씬도 안 하겠소!”`,
    };
  }

  // 기본 도장깨기 (목검 비무)
  if (kind === 'BREAKER') {
    return {
      title: `${battle.title} — 도장 현판을 지켜 내다`,
      speaker: eName,
      role: 'ENEMY',
      body: `${josa(eName, '이가')} 꺾인 목검을 내려놓고 씁쓸하게 고개를 숙였다.\n${
        prevWins >= 1 || isElder
          ? `“……천하에 이름난 【${prev.sectName}】 대종사의 현판을 넘본 내 안목이 짧았소. 훗날 다시 수련해 정중히 한 수 청하겠소.”`
          : `“……【${prev.sectName}】의 이름은 헛된 소문이 아니었군. 현판은 그대가 지킬 자격이 있소. 오늘의 패배를 뼈에 새기겠소.”`
      }`,
    };
  }

  return null;
}
