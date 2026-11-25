import { ActiveEvent, GameState, SceneDialogueLine } from '../types/game';
import { COUNTRIES } from './worldAndEndings';
import { josa } from '../utils/korean';

// =========================================================================
// 마스터피스 스토리텔링 대본집
// 원칙:
// 1. 한 마디당 1~2문장(짧은 호흡!) — 절대 장황하게 욱여넣지 않는다.
// 2. 괄호 지문(stageDirection)으로 인물의 눈빛·손짓·침묵을 살린다.
// 3. 사소한 NPC와의 과거 인연이 10~25년 뒤 큰 은혜나 원한으로 반드시 되돌아온다.
// =========================================================================

/**
 * 말 상대 없이 홀로 겪는 사건인가? (빗소리 속 깨달음, 병, 회상 등)
 * — 이런 사건에 '방문자'가 대문으로 걸어 들어오거나 "상대를 바라본다"는 지문이 붙으면 어색하다.
 */
export function isSoloEvent(ev: ActiveEvent): boolean {
  if (ev.sceneActor || ev.speaker || ev.dialogue) return false;
  if (ev.category === 'RIVAL' || ev.category === 'DUEL' || ev.category === 'DEBT' || ev.category === 'FAMILY') return false;
  if (ev.script && ev.script.some((l) => l.role === 'NPC')) return false;
  return true;
}

export function buildShortLinesFromLegacy(
  ev: ActiveEvent,
  heroName: string
): SceneDialogueLine[] {
  if (ev.script && ev.script.length > 0) return ev.script;

  const lines: SceneDialogueLine[] = [];
  // 나레이션을 문장 단위로 쪼개어 짧은 호흡으로 분할
  const narParts = ev.narration
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  narParts.forEach((p) => lines.push({ speaker: '나레이션', role: 'NARRATOR', text: p }));

  if (ev.dialogue) {
    const clean = ev.dialogue.replace(/^“|”$/g, '').trim();
    const dlgParts = clean
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (dlgParts.length <= 2) {
      lines.push({ speaker: ev.speaker || '방문자', role: 'NPC', text: clean });
    } else {
      lines.push({ speaker: ev.speaker || '방문자', role: 'NPC', text: dlgParts.slice(0, 2).join(' ') });
      lines.push({ speaker: ev.speaker || '방문자', role: 'NPC', text: dlgParts.slice(2).join(' ') });
    }
  }

  lines.push({
    speaker: heroName,
    role: 'HERO',
    stageDirection: ev.dialogue ? '잠시 숨을 고르며 상대를 바라본다' : '홀로 잠시 생각에 잠긴다',
    text: '……어떻게 해야 할까.',
  });
  return lines;
}

// -------------------------------------------------------------------------
// 1. 6대 인과응보 복선 회수 이벤트 (사소한 NPC가 10~25년 뒤 운명으로 돌아온다!)
// -------------------------------------------------------------------------
export function pickConsequenceChainEvent(state: GameState): ActiveEvent | null {
  const mem = state.flags.storyMemory || {};
  const triggered = new Set(state.flags.triggeredEvents);
  const cMeta = COUNTRIES[state.country];
  const hero = state.name;

  // [복선 체인 1] 옛날 빗속에서 내쫓았던 고아 소년 → 15년 뒤 피의 복수 검객으로 귀환!
  if (mem.orphan === 'REJECTED' && state.turn >= 44 && !triggered.has('karma_orphan_revenge')) {
    return {
      id: 'karma_orphan_revenge',
      title: '빗속의 기억 — 돌아온 고아',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '비 오는 저녁, 검은 도포를 걸친 젊은 검객이 우산도 없이 마당 한가운데 선다.',
      speaker: '낯선 젊은 검객',
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: '초여름 비가 마당 흙을 어둡게 적시고 있었다.' },
        { speaker: '나레이션', role: 'NARRATOR', text: '대문이 천천히 열리더니, 서늘한 눈빛의 젊은 검객이 빗속을 걸어 들어온다.' },
        { speaker: '낯선 젊은 검객', role: 'NPC', stageDirection: '손바닥에 낡은 엽전 한 닢을 올려놓으며', text: '……기억하십니까, 도장주님.' },
        { speaker: hero, role: 'HERO', stageDirection: '미간을 좁히며', text: '누구시오? 초면인 듯한데.' },
        { speaker: '낯선 젊은 검객', role: 'NPC', emote: 'ANGRY', text: '십여 년 전, 사흘 밤낮 비를 맞으며 대문 앞에 무릎 꿇었던 거지 아이입니다.' },
        { speaker: '낯선 젊은 검객', role: 'NPC', text: '당신은 동전 몇 푼을 던져 주고 문을 닫았지요.' },
        { speaker: '낯선 젊은 검객', role: 'NPC', stageDirection: '칼집에서 서늘한 진검을 빼 들며', text: '그날 밤 산속 다른 스승을 만나 피를 토하며 칼을 배웠습니다. 당신의 선택이 틀렸다는 걸, 오늘 내 칼로 증명하겠소.' },
        { speaker: hero, role: 'HERO', stageDirection: '조용히 숨을 내쉬며', text: '……그때의 아이였군. 원망을 품고 살아온 세월이 칼끝에 묻어 있네.' },
      ],
      outcomeScripts: {
        karma_orphan_apologize: [
          { speaker: hero, role: 'HERO', stageDirection: '칼을 내려놓고 깊이 고개를 숙이며', text: '미안하네. 그땐 내 한 몸 건사하기도 벅차 네 눈빛을 제대로 보지 못했어.' },
          { speaker: '젊은 검객', role: 'NPC', stageDirection: '치켜든 칼끝이 미세하게 흔들린다', text: '……비겁하게 사죄 따위로 넘어가려 하지 마시오.' },
          { speaker: '젊은 검객', role: 'NPC', stageDirection: '한참의 침묵 끝에 칼을 거두며', text: '흥, 맥이 빠지는군. 동전은 돌려드리겠소. 다음번엔 진짜 검으로 답하십시오.' },
        ],
      },
      options: [
        { id: 'karma_orphan_duel', label: '“그 원한, 내 칼로 온전히 받아 주마.” (진검결투)', hint: '⚠ 진검결투 · 승리 시 명성 +70 & 명검 노획' },
        { id: 'karma_orphan_apologize', label: '칼을 내려놓고 그날의 매정함을 진심으로 사과한다', hint: '전투 회피 · 인덕 +25 · 명성 -10 · 젊은 검객의 원한 해소' },
      ],
    };
  }

  // [복선 체인 2] 옛날 따뜻한 국밥을 대접했던 떠돌이 대장장이 → 사실 당대 제일의 은둔 명장!
  if (mem.smith === 'WARM' && state.turn >= 48 && !triggered.has('karma_smith_gift')) {
    return {
      id: 'karma_smith_gift',
      title: '뜨거운 국밥 한 그릇의 값',
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: '예전에 처마 밑에서 술 취해 자던 대장장이 영감이, 이번엔 말끔한 옷차림으로 길쭉한 비단 보따리를 안고 찾아온다.',
      speaker: '명장 황 노인',
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: '가을바람이 선선하던 날, 백발이 성성해진 낯익은 노인이 대문 앞에서 헛기침을 한다.' },
        { speaker: '명장 황 노인', role: 'NPC', stageDirection: '껄껄 웃으며 마당으로 들어선다', text: '허허, 도장주. 그새 마당이 참 번듯해졌구려. 날 기억하나?' },
        { speaker: hero, role: 'HERO', emote: '!', text: '어르신! 예전에 우리 처마 밑에서 술에 취해 주무시던 대장장이 영감님 아니십니까?' },
        { speaker: '명장 황 노인', role: 'NPC', text: '그날 아무 대가도 안 바라고 끓여 준 그 뜨끈한 국밥 한 그릇이, 평생 쇳덩이만 두드리던 늙은이 가슴에 오래 남았지.' },
        { speaker: '명장 황 노인', role: 'NPC', stageDirection: '비단 보따리를 풀어 서늘하게 빛나는 보검을 꺼내며', text: '이제 내 눈도 어두워져 더는 망치를 못 잡네. 내 일생의 마지막 칼일세. 자네 같은 무인이 쥐어 주어야 이 놈도 원이 없겠지.' },
      ],
      outcomeScripts: {
        karma_smith_take: [
          { speaker: hero, role: 'HERO', stageDirection: '두 손으로 보검을 공손히 받아 들며', text: '이토록 귀한 칼을…… 평생 가보로 삼아 부끄럽지 않게 쓰겠습니다.' },
          {
            speaker: '명장 황 노인',
            role: 'NPC',
            stageDirection: '만족스럽게 고개를 끄덕이고 돌아서며',
            text:
              state.age >= 50
                ? '부디 오래 살아 천하에 이름을 남기게나. 잘 있게, 훌륭한 벗이여.'
                : state.age >= 35
                ? '부디 오래 살아 천하에 이름을 남기게나. 잘 있게, 도장주.'
                : '부디 오래 살아 천하에 이름을 남기게나. 잘 있게, 젊은 친구.',
          },
        ],
      },
      options: [
        { id: 'karma_smith_take', label: '두 손으로 깊이 절하고 명장의 마지막 보검을 받는다', hint: '★ 전설 보검 무료 획득! · 인덕 +15 · 명성 +35' },
      ],
    };
  }

  // [복선 체인 3] 초반 2턴에 혼내 준 장터 왈패 두목 → 12년 뒤 개과천선해 도적단 습격을 미리 제보!
  if (mem.thug === 'FOUGHT' && state.turn >= 34 && !triggered.has('karma_thug_repay')) {
    return {
      id: 'karma_thug_repay',
      title: '옛날 왈패의 다급한 발걸음',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: '어둑한 저녁, 옛날 도장에 행패를 부렸던 왈패 두목이 숨을 헐떡이며 대문을 두드린다.',
      speaker: '짐꾼 반장 (옛 왈패)',
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: '해가 막 넘어가던 무렵, 굵은 땀을 흘린 사내가 대문 틈으로 급히 고개를 들이민다.' },
        { speaker: '짐꾼 반장', role: 'NPC', emote: '!', text: '도장주님! 접니다, 예전에 여기 몽둥이 들고 행패 부리다 호되게 혼났던 놈이요!' },
        { speaker: hero, role: 'HERO', text: '아…… 그때 그 사람인가. 행색이 많이 단정해졌군. 무슨 일인가?' },
        { speaker: '짐꾼 반장', role: 'NPC', stageDirection: '목소리를 낮추며', text: '그날 사부님 목검에 얻어맞고 정신 차려서 지금 장터 짐꾼 반장으로 밥 벌어먹고 삽니다.' },
        { speaker: '짐꾼 반장', role: 'NPC', text: '방금 주막에서 들었는데, 험악한 산적 패거리들이 오늘 밤 이 도장 창고를 털려고 숨어들고 있답니다! 미리 대비하십시오!' },
      ],
      outcomeScripts: {
        karma_thug_ambush: [
          { speaker: '나레이션', role: 'NARRATOR', text: '미리 매복해 있던 당신과 제자들이 담을 넘던 도적들을 단숨에 포박해 관아에 넘겼다.' },
          { speaker: hero, role: 'HERO', text: '자네 덕분에 큰 화를 면했네. 옛일은 잊고 언제든 차 한 잔 마시러 들르게.' },
        ],
      },
      options: [
        { id: 'karma_thug_ambush', label: '제보를 믿고 제자들과 밤새 매복해 도적들을 일망타진한다', hint: '도적 현상금 +120 · 명성 +35 · 인덕 +15' },
      ],
    };
  }

  // [복선 체인 3-B] 초반 2턴에 돈으로 비굴하게 넘겼다면 → 8년 뒤 더 큰 패거리를 데려와 갈취!
  if (mem.thug === 'BRIBED' && state.turn >= 24 && !triggered.has('karma_thug_extort')) {
    return {
      id: 'karma_thug_extort',
      title: '커져 버린 옛날의 악연',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '예전에 돈을 쥐여 돌려보냈던 왈패 두목이 이제는 번듯한 깡패 조직 두목이 되어 다시 마당을 밟는다.',
      speaker: '장터 조직 두목',
      script: [
        { speaker: '장터 조직 두목', role: 'NPC', stageDirection: '비웃으며 마당을 빙 둘러본다', text: '오호라, 옛날에 돈 몇 푼 쥐여 주며 벌벌 떨던 그 도장이 꽤 커졌구려?' },
        { speaker: hero, role: 'HERO', text: '……그때 다 끝난 일 아니었나. 또 무슨 수작인가.' },
        { speaker: '장터 조직 두목', role: 'NPC', emote: 'ANGRY', text: '이 구역에서 장사하려면 매달 자릿세를 내야지. 이번엔 백 푼쯤 내놓으셔야겠소!' },
      ],
      outcomeScripts: {
        karma_thug_pay_again: [
          { speaker: '나레이션', role: 'NARRATOR', text: '또다시 돈을 쥐여 주자 패거리들은 낄낄거리며 대문을 나갔다. 지켜보던 문하생들의 고개가 푹 숙여졌다.' },
        ],
      },
      options: [
        { id: 'karma_thug_crush', label: '“이번엔 어림없다.” 칼을 들어 악연을 끝장낸다 (비무)', hint: '승리 시 명성 +45 · 빼앗긴 자존심 회복 · 재화 +100' },
        { id: 'karma_thug_pay_again', label: '소란을 피하려 요구한 돈을 건넨다', hint: `재화 -80${cMeta.currency} · 명성 -20`, disabled: state.money < 80, disabledReason: '재화 부족' },
      ],
    };
  }

  // [복선 체인 4] 옛날 무료로 호신술을 가르쳤던 가난한 어머니의 아들 → 20년 뒤 거상이 되어 은혜 보답!
  if (mem.mother === 'HELPED' && state.turn >= 62 && !triggered.has('karma_mother_repay')) {
    return {
      id: 'karma_mother_repay',
      title: '비단 수레를 끌고 온 옛 소년',
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: '화려한 상단 수레 세 대가 도장 대문 앞에 멈춰 서고, 젊은 거상이 뛰어나와 마당 바닥에 넙죽 큰절을 올린다.',
      speaker: '거상 청년',
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: '대문 밖에서 수레바퀴 소리가 요란하더니, 비단 도포를 입은 젊은 상인이 마당으로 뛰어 들어온다.' },
        { speaker: '거상 청년', role: 'NPC', stageDirection: '흙마당에 무릎을 꿇고 큰절을 올리며', text: '사부님! 소인, 어릴 적 어미 손 잡고 찾아왔던 그 장터 아이입니다!' },
        { speaker: hero, role: 'HERO', stageDirection: '놀란 눈으로 청년을 일으켜 세우며', text: '세상에…… 깡마르던 꼬마가 언제 이리 훌륭한 어른이 되었는가!' },
        { speaker: '거상 청년', role: 'NPC', text: '사부님께 배운 호신술 덕분에 험한 행상 길에서도 목숨을 지켰고, 이제는 고을 제일의 상단을 꾸리게 되었습니다.' },
        { speaker: '거상 청년', role: 'NPC', stageDirection: '은자 궤짝과 희귀 서책을 내밀며', text: '어머니께서 돌아가시기 전까지 늘 사부님 은혜를 갚으라 하셨습니다. 부디 도장 살림에 보태어 주십시오!' },
      ],
      outcomeScripts: {
        karma_mother_accept: [
          { speaker: hero, role: 'HERO', stageDirection: '눈시울이 살짝 뜨거워지며', text: '……그때 문을 열어 주길 참 잘했구나. 고맙다, 정말 고맙구나.' },
        ],
      },
      options: [
        { id: 'karma_mother_accept', label: '따뜻하게 등을 두드리며 청년의 정성을 받아들인다', hint: `재화 +320${cMeta.currency} · 명성 +45 · 인덕 +20` },
      ],
    };
  }

  // [복선 체인 5] 옛날 빚을 정직하게 갚았던 쌀가게 영감의 은퇴 선물
  if (mem.debt === 'HONORED' && state.turn >= 26 && !triggered.has('karma_debt_honored')) {
    return {
      id: 'karma_debt_honored',
      title: '쌀가게 영감의 마지막 부탁',
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: '초반에 빚을 독촉하던 영감이 허리가 더 굽은 채 찾아와 작은 나무 상자를 내민다.',
      speaker: state.country === 'JAPAN' ? '집주인 영감' : '쌀가게 영감',
      script: [
        { speaker: state.country === 'JAPAN' ? '집주인 영감' : '쌀가게 영감', role: 'NPC', text: '여보게 도장주. 나 이제 장사 접고 고향으로 내려가네.' },
        { speaker: hero, role: 'HERO', text: '벌써 그렇게 되셨습니까. 그동안 신세가 많았습니다.' },
        { speaker: state.country === 'JAPAN' ? '집주인 영감' : '쌀가게 영감', role: 'NPC', stageDirection: '조용히 웃으며', text: '사실 그때 자네가 빚을 제때 갚을 줄은 몰랐어. 약속을 지키는 놈은 반드시 크게 되더군.' },
        { speaker: state.country === 'JAPAN' ? '집주인 영감' : '쌀가게 영감', role: 'NPC', text: '내가 알던 단골 상인들에게 자네 도장 이름을 쫙 퍼뜨려 놨으니, 앞으로 문하생들이 꽤 찾아올 걸세.' },
      ],
      outcomeScripts: {
        karma_debt_bow: [
          { speaker: hero, role: 'HERO', stageDirection: '대문 밖까지 영감을 배웅하며', text: '부디 고향에서 만수무강하십시오, 어르신.' },
        ],
      },
      options: [
        { id: 'karma_debt_bow', label: '깊이 고개 숙여 배웅한다', hint: '명성 +30 · 재화 +60 · 인덕 +12 · 상무 +10' },
      ],
    };
  }

  return null;
}

// -------------------------------------------------------------------------
// 2. 한 인간의 일생을 체감하는 「생애 변곡점 감성 컷신 (4종)」
// -------------------------------------------------------------------------
export function pickLifeMilestoneEvent(state: GameState): ActiveEvent | null {
  const triggered = new Set(state.flags.triggeredEvents);
  const hero = state.name;
  const topSkill = [...state.skills].sort((a, b) => b.masteryLevel - a.masteryLevel)[0];
  const topName = topSkill?.customName || topSkill?.name || '횡베기';

  // 1) 35세 중년 진입 — 굳은살과 깊어진 시야
  if (state.age >= 35 && state.age <= 39 && !triggered.has('life_age_35')) {
    return {
      id: 'life_age_35',
      title: '서른다섯 — 손바닥의 굳은살',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: '새벽 수련을 마치고 툇마루에 앉아 문득 자신의 오른손을 내려다본다.',
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: '새벽안개가 걷히는 마당. 수련을 마치고 툇마루에 걸터앉아 오른손을 펼쳤다.' },
        { speaker: hero, role: 'HERO', stageDirection: '손바닥의 두꺼운 굳은살을 어루만지며', text: '어느새 서른다섯인가…….' },
        { speaker: hero, role: 'HERO', text: '스무 살 적처럼 밤새 휘두르면 다음 날 어깨가 뻐근해지더군.' },
        { speaker: hero, role: 'HERO', stageDirection: '멀리 목인장을 응시하며 희미하게 웃는다', text: '대신 이상한 일이 생겼어. 이제는 상대가 칼을 뽑기도 전에, 저 자가 어디로 발을 디딜지 눈에 보이기 시작했거든.' },
      ],
      outcomeScripts: {
        age35_body: [
          { speaker: hero, role: 'HERO', text: '아직 늙기엔 이르다. 한 걸음 더 빠르게, 한 치 더 강하게 단련할 뿐이다.' },
        ],
        age35_mind: [
          { speaker: hero, role: 'HERO', text: '힘으로 베는 시대는 지났다. 이제는 이치와 기(氣)로 칼을 다스릴 때다.' },
        ],
      },
      options: [
        { id: 'age35_body', label: '“아직 전성기다. 육체의 끝을 더 밀어붙이겠다.”', hint: 'STR +3 · AGI +3 · VIT +2' },
        { id: 'age35_mind', label: '“이제는 힘보다 눈과 마음으로 베는 경지로 나아가겠다.”', hint: 'INS +4 · WIL +3 · QI +4' },
      ],
    };
  }

  // 2) 50세 첫 백발 — 노고수의 문턱
  if (state.age >= 50 && state.age <= 54 && !triggered.has('life_age_50')) {
    return {
      id: 'life_age_50',
      title: '쉰 살 — 물동이에 비친 첫 백발',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: '아침 세수를 하려 우물물을 들여다보다가, 귀밑에 하얗게 센 머리카락 몇 올을 발견한다.',
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: '차가운 우물물에 얼굴을 씻으려 고개를 숙였다가, 문득 수면 위에 멈춰 섰다.' },
        { speaker: hero, role: 'HERO', stageDirection: '귀밑머리를 손끝으로 쓸어 보며', text: '……하얗게 셌구나.' },
        { speaker: hero, role: 'HERO', text: '어느새 스승님이 돌아가시던 나이에 가까워졌어.' },
        { speaker: hero, role: 'HERO', stageDirection: '마당에서 기합을 넣는 젊은 제자들을 바라보며', text: '무릎은 시큰거려도 상관없다. 열 번 휘두를 것을 단 한 번의 「' + topName + '」으로 끝내면 그만이니.' },
      ],
      outcomeScripts: {
        age50_accept: [
          { speaker: '나레이션', role: 'NARRATOR', text: '세월을 받아들인 순간, 오히려 머릿속을 감싸던 마지막 안개가 걷히는 듯한 맑은 통찰이 찾아왔다.' },
        ],
      },
      options: [
        { id: 'age50_accept', label: '세월의 무게를 받아들이고 노고수의 경지로 들어선다', hint: 'INS +6 · WIL +5 · QI +5 · 구도 +15' },
      ],
    };
  }

  // 3) 배우자와 함께 늙어가는 밤 (결혼 후 18년 이상 경과)
  if (state.spouse && state.spouse.alive && state.year >= state.spouse.marriedYear + 18 && !triggered.has('life_spouse_silver')) {
    const sp = state.spouse;
    const spouseIsMale = sp.gender === 'MALE' || state.gender === 'FEMALE';
    return {
      id: 'life_spouse_silver',
      title: '함께 센 머리 — 툇마루의 차 한 잔',
      category: 'FAMILY',
      sceneActor: 'SPOUSE',
      narration: `어느 가을밤, ${sp.name}이(가) 따뜻한 차 두 잔을 들고 툇마루로 나온다.`,
      speaker: sp.name,
      script: spouseIsMale
        ? [
            { speaker: '나레이션', role: 'NARRATOR', text: '제자들이 모두 잠든 고요한 밤. 귀뚜라미 소리만 마당을 채우고 있었다.' },
            { speaker: sp.name, role: 'NPC', stageDirection: '김이 모락모락 나는 찻잔을 건네며', text: '여보, 또 밤늦게까지 검을 닦고 있었구려. 손이 다 텄소.' },
            { speaker: hero, role: 'HERO', stageDirection: '미안한 듯 웃으며 찻잔을 받는다', text: '당신이야말로, 이 고집 센 도장주 곁을 지키느라 고생이 많았어요.' },
            { speaker: sp.name, role: 'NPC', emote: 'HEART', text: '허허, 새삼스럽게 무슨 소리요. 비 새던 마당이 이만큼 커지는 걸 그대 곁에서 지켜본 것만으로 내 일생은 충분하오.' },
            { speaker: hero, role: 'HERO', stageDirection: '조용히 남편의 손을 덮어 잡으며', text: '……고마워요. 내 일생에서 칼보다 더 귀한 인연을 만났네요.' },
          ]
        : [
            { speaker: '나레이션', role: 'NARRATOR', text: '제자들이 모두 잠든 고요한 밤. 귀뚜라미 소리만 마당을 채우고 있었다.' },
            { speaker: sp.name, role: 'NPC', stageDirection: '김이 모락모락 나는 찻잔을 건네며', text: '여보, 또 밤늦게까지 칼을 닦고 계셨군요. 손이 다 텄어요.' },
            { speaker: hero, role: 'HERO', stageDirection: '미안한 듯 웃으며 찻잔을 받는다', text: '당신이야말로, 이 무뚝뚝한 무인 뒷바라지하느라 손마디가 다 거칠어졌구려.' },
            { speaker: sp.name, role: 'NPC', emote: 'HEART', text: '어머, 새삼스럽게 왜 그러세요. 비 새던 마당이 이만큼 커지는 걸 곁에서 지켜본 것만으로도 저는 충분히 행복했어요.' },
            { speaker: hero, role: 'HERO', stageDirection: '조용히 아내의 손을 덮어 잡으며', text: '……고맙소. 내 일생에서 칼보다 더 귀한 인연을 만났군.' },
          ],
      outcomeScripts: {
        spouse_silver_ok: [
          { speaker: '나레이션', role: 'NARRATOR', text: '두 사람은 말없이 달빛 아래 차가 식어 갈 때까지 나란히 앉아 있었다. 가슴 깊은 곳에서 따뜻한 기운이 차올랐다.' },
        ],
      },
      options: [
        { id: 'spouse_silver_ok', label: '말없이 손을 잡은 채 밤하늘을 함께 바라본다', hint: '건강 +12 · WIL +4 · 인덕 +15' },
      ],
    };
  }

  // 4) 66세 황혼기 — 유파 전서(비급) 집필
  if (state.age >= 66 && !state.flags.wroteManual && !triggered.has('life_age_66_manual')) {
    return {
      id: 'life_age_66_manual',
      title: '황혼의 붓 — 유파 전서를 남기다',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: '아침마다 숨이 가빠진다. 평생 익히고 창시한 무술이 나와 함께 흙으로 돌아가지 않도록, 이제는 붓을 들 때다.',
      script: [
        { speaker: '나레이션', role: 'NARRATOR', text: '겨울 새벽, 기침을 참으며 서재의 먹을 갈았다. 손끝이 미세하게 떨린다.' },
        { speaker: hero, role: 'HERO', text: '내가 이 마당에서 칼을 잡을 날도 이제 몇 계절 남지 않았구나.' },
        { speaker: hero, role: 'HERO', stageDirection: '하얀 한지 첫 장에 천천히 붓을 대며', text: '횡베기 하나, 종베기 하나에서 시작해 여기까지 온 모든 이치를…… 백 년 뒤의 후손들도 읽을 수 있게 남겨 두자.' },
      ],
      outcomeScripts: {
        write_manual_yes: [
          { speaker: '나레이션', role: 'NARRATOR', text: `밤낮을 꼬박 지새워 마침내 『【${state.sectName}】 정통 비급 전서』를 탈고했다. 마지막 낙관을 찍는 순간, 평생의 짐이 내려앉는 듯한 평온이 찾아왔다.` },
        ],
      },
      options: [
        { id: 'write_manual_yes', label: '마지막 기력을 모아 유파의 모든 초식을 전서로 집필한다', hint: '건강 -8 · 명성 +80 · 사후 200년 전승력 & 레거시 극대화!' },
      ],
    };
  }

  return null;
}
