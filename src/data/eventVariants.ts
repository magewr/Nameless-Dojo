import { Disciple, GameState, GraduatedDisciple } from '../types/game';
import { josa } from '../utils/korean';
import { freshFactor, FreshVariant, pickFresh } from '../engine/fresh';

// 자주 되풀이되는 고정 사건(events.ts)의 장면 변주.
// 선택지와 결과는 그대로 두고, 같은 사건이 와도 다른 장면·다른 말로 읽히게 한다.
// 고른 변주는 사건 meta.vkey(또는 vkeys)에 넣는다 — 사건이 끝나면 resolveEventOption이 「언제 봤는지」를 적고,
// pickFresh가 최근에 본 장면을 피한다. 키는 resolveEventOption이 만드는 계열 이름과 같아야 한다.

const byC = <T,>(s: GameState, kr: T, cn: T, jp: T): T => (s.country === 'CHINA' ? cn : s.country === 'JAPAN' ? jp : kr);
const isF = (d: Disciple) => d.gender === 'FEMALE';
// 이름 뒤에 괄호가 붙을 때처럼, 조사만 따로 필요할 때
const particle = (w: string, pair: Parameters<typeof josa>[1]) => josa(w, pair).slice(w.length);

// ───────── 1. 제자의 하산 (disciple_graduate) ─────────
interface GradScene extends FreshVariant {
  title: string;
  narration: string;
  dialogue: string;
}

export function graduationScene(s: GameState, d: Disciple, strong: boolean, bitter: boolean): GradScene {
  const n = d.name;
  const age = d.age;
  if (bitter) {
    return pickFresh<GradScene>(s, 'disciple_graduate', [
      {
        id: 'b_sullen',
        title: `제자의 하산 — 불만을 품은 ${n}`,
        narration: `${age}세의 ${josa(n, '이가')} 서늘한 표정으로 짐을 꾸려 마당에 섰다.`,
        dialogue: '“이 도장에선 더 배울 게 없더군요. 이제 제 갈 길을 가겠습니다. ……다음에 만날 땐 스승과 제자가 아닐지도 모르지요.”',
      },
      {
        id: 'b_night',
        title: `한밤의 짐 보따리 — ${n}`,
        narration: `한밤중 마당에서 인기척이 났다. ${josa(n, '이가')} 아무에게도 알리지 않고 대문을 나서려다 스승과 눈이 마주쳤다.`,
        dialogue: '“……인사 없이 가려 했습니다. 이 도장에서 저는 늘 뒷전이었으니까요.”',
      },
      {
        id: 'b_public',
        title: `문하생들 앞에서 등을 돌린 ${n}`,
        narration: `아침 수련 자리에서 ${josa(n, '이가')} 목검을 바닥에 내던지고, 모두가 보는 앞에서 하산을 선언했다.`,
        dialogue: '“똑같은 초식만 몇 해째입니다! 더 큰 데서 배우겠습니다. 말리지 마십시오.”',
      },
      {
        id: 'b_poached',
        title: `다른 문파의 부름 — ${n}`,
        narration: `얼마 전 낯선 문파 사람이 다녀간 뒤로 ${n}의 눈빛이 달라졌다. 오늘 아침, 끝내 짐을 꾸려 마당에 섰다.`,
        dialogue: '“저쪽에서는 저를 사범으로 앉혀 주겠답니다. 여기서는 평생 막내 취급이겠지요.”',
      },
    ]);
  }
  const scenes: Array<GradScene & { strong?: string; plain?: string }> = [
    {
      id: 'bundle',
      title: `제자의 독립(하산) — ${n}`,
      narration: `어느덧 ${age}세가 된 ${josa(n, '이가')} 봇짐을 메고 스승 앞에 무릎을 꿇었다.`,
      dialogue: '',
      strong: '“사부님의 가르침 덕분에 이제 천하에 나가 제 이름을 시험해 보고 싶습니다. 부디 하산을 허락해 주십시오!”',
      plain: '“사부님, 그동안 감사했습니다. 이제 나이가 차서 고향과 저잣거리에서 제 살림을 꾸려 보고자 합니다.”',
    },
    {
      id: 'dawn',
      title: `새벽의 하직 인사 — ${n}`,
      narration: `별이 채 지지 않은 새벽, ${josa(n, '이가')} 마당을 정갈하게 쓸어 놓고 스승의 방문 앞에 엎드려 큰절을 올린다.`,
      dialogue: '',
      strong: '“밤새 생각했습니다. 이 담장 밖에서 제 칼이 얼마나 통하는지 알아보고 싶습니다. 하산을 허락해 주십시오.”',
      plain: '“고향에서 기별이 왔습니다. 늙으신 부모님을 이제는 제가 모셔야 할 때인 듯합니다.”',
    },
    {
      id: 'sword',
      title: `목검을 내려놓은 ${n}`,
      narration: `저녁 수련이 끝난 뒤, ${josa(n, '이가')} 손때 묻은 목검을 두 손으로 받쳐 스승 앞에 내려놓았다.`,
      dialogue: '',
      strong: '“이 목검은 사부님께 돌려드리겠습니다. 이제 제 칼을 찾으러 떠나야 할 것 같습니다.”',
      plain: '“칼은 여기 두고 가겠습니다. 이제부터는 식구들 먹여 살리는 일이 제 수련이 될 것 같습니다.”',
    },
    {
      id: 'rain',
      title: `비 갠 오후의 작별 — ${n}`,
      narration: `장대비가 그친 오후, 처마 끝 낙숫물 소리만 들린다. 봇짐을 멘 ${josa(n, '이가')} 대문 앞에서 차마 돌아서지 못하고 서 있다.`,
      dialogue: '',
      strong: '“비가 그치면 떠나려 했습니다. ……언젠가 이 도장의 이름을 천하에 알리고 돌아오겠습니다.”',
      plain: '“집에 일손이 모자란답니다. 칼은 놓아도 사부님 말씀은 놓지 않겠습니다.”',
    },
    {
      id: 'post',
      title: `다른 고을의 사범 자리 — ${n}`,
      narration: `이웃 고을 도장에서 ${josa(n, '을를')} 사범으로 모셔 가겠다는 서찰이 왔다. ${josa(n, '이가')} 서찰을 받쳐 들고 스승의 눈치를 살핀다.`,
      dialogue: '',
      strong: '“제 이름으로 문하생을 받아 보고 싶습니다. 사부님 이름에 누가 되지 않게 하겠습니다.”',
      plain: '“큰 자리는 아니지만 밥은 먹여 준답니다. 한번 가 보고 싶습니다.”',
    },
    {
      id: 'escort',
      title: byC(s, `상단 호위로 나서는 ${n}`, `표국(鏢局)에 들어가는 ${n}`, `상가(商家)의 경호를 맡는 ${n}`),
      narration: `${byC(s, `개성 상단의 행수가 ${josa(n, '을를')} 호위로 데려가고 싶다며 다녀갔다.`, `성내 표국의 총표두가 ${josa(n, '을를')} 표사로 쓰고 싶다며 다녀갔다.`, `오사카 상가의 지배인이 ${josa(n, '을를')} 경호로 쓰고 싶다며 다녀갔다.`)} ${josa(n, '은는')} 이미 마음을 정한 얼굴이다.`,
      dialogue: '',
      strong: '“천 리 길을 오가며 제 칼을 시험해 보고 싶습니다. 보내 주십시오.”',
      plain: '“품삯이 넉넉하답니다. 칼로 밥을 벌 수 있다면 그것도 사부님 덕입니다.”',
    },
    {
      id: 'exam',
      when: () => strong && !isF(d),
      title: byC(s, `무과(武科)에 나서는 ${n}`, `무거(武擧)에 응시하는 ${n}`, `번(藩)에 출사하는 ${n}`),
      narration: byC(
        s,
        `${josa(n, '이가')} 무과 초시에 붙었다는 방문(榜文)을 들고 뛰어 들어왔다. 한양 복시에 나가려면 도장을 떠나야 한다.`,
        `${josa(n, '이가')} 향시(鄕試) 무거에 붙었다는 소식을 들고 왔다. 성도(省都)의 시험장에 가려면 도장을 떠나야 한다.`,
        `이웃 번의 무예 사범이 ${josa(n, '을를')} 가신으로 들이고 싶다는 서찰을 보내왔다. ${josa(n, '은는')} 그 서찰을 받쳐 들고 마당에 섰다.`
      ),
      dialogue: byC(
        s,
        '“사부님께 배운 칼과 활로 나라의 녹을 먹어 보겠습니다. 한양으로 떠나도록 허락해 주십시오!”',
        '“사부님께 배운 무예로 무진사(武進士)에 도전해 보겠습니다. 떠나도록 허락해 주십시오!”',
        '“떠돌이 낭인으로 늙을 줄 알았던 제가 녹봉을 받게 되었습니다. 모두 사부님 덕분입니다.”'
      ),
    },
    {
      id: 'shop',
      when: () => !strong,
      title: `장사 밑천을 마련한 ${n}`,
      narration: `${josa(n, '이가')} 그동안 모은 엽전 꾸러미를 보여 주며 쑥스럽게 웃는다. 장터에 작은 가게 자리가 났다고 한다.`,
      dialogue: '“칼보다 셈이 더 맞는 사람인가 봅니다. 장터에 가게를 내 보려 합니다. 가끔 국밥이라도 대접하러 오겠습니다.”',
    },
    {
      id: 'wedding',
      when: () => !strong,
      title: `${isF(d) ? '시집가는' : '장가드는'} ${n}`,
      narration: `${josa(n, '이가')} 혼처가 정해졌다며 붉어진 얼굴로 스승 앞에 섰다. 혼례를 치르면 먼 고을에 살림을 차리게 된다고 한다.`,
      dialogue: '“이제 한 집안을 꾸리게 되었습니다. 도장에서 배운 대로 식구들을 지키며 살겠습니다.”',
    },
  ];
  const v = pickFresh(s, 'disciple_graduate', scenes);
  return { ...v, dialogue: v.dialogue || (strong ? v.strong : v.plain) || '' };
}

// ───────── 2. 하산한 제자의 재방문 (grad_revisit) ─────────
interface RevisitScene extends FreshVariant {
  title: string;
  narration: string;
  dialogue: string;
}

export function revisitScene(s: GameState, g: GraduatedDisciple): RevisitScene {
  const n = g.name;
  const sk = g.topSkillName;
  if (g.fate === 'GRANDMASTER') {
    return pickFresh<RevisitScene>(s, 'grad_revisit', [
      {
        id: 'gm_procession',
        title: `거물이 되어 돌아온 제자 — ${n}`,
        narration: `화려한 행렬과 함께 찾아온 이는 도장을 하산해 천하에 명성을 떨치는 대고수가 된 옛 제자 ${n}이었다!`,
        dialogue: `“사부님! 가르쳐 주신 「${sk}」 덕분에 큰 문파의 장문인이 되었습니다! 스승님 은혜에 보답하고자 선물을 준비했습니다!”`,
      },
      {
        id: 'gm_alone',
        title: `삿갓을 벗은 장문인 — ${n}`,
        narration: `수행원도 없이 삿갓을 눌러쓴 길손이 대문을 두드린다. 삿갓을 벗자, 이제는 천하가 아는 이름이 된 옛 제자 ${n}의 얼굴이 드러났다.`,
        dialogue: `“행렬은 고을 어귀에 두고 왔습니다. 사부님 앞에서까지 장문인 노릇을 할 수는 없지요. 「${sk}」, 아직 하루도 거르지 않고 닦고 있습니다.”`,
      },
      {
        id: 'gm_homecoming',
        title: `옛 제자의 금의환향 — ${n}`,
        narration: `며칠 전부터 고을에 소문이 돌았다. 천하에 이름난 ${n} 장문인이 옛 스승을 뵈러 온다고. 오늘 아침, 대문 앞에 가마가 멈췄다.`,
        dialogue: `“사부님, 이 마당에서 처음 목검을 잡던 날이 엊그제 같습니다. 「${sk}」 덕분에 오늘의 제가 있습니다. 작은 정성을 받아 주십시오.”`,
      },
      {
        id: 'gm_students',
        title: `제자들을 이끌고 온 ${n}`,
        narration: `젊은 무인 여남은 명이 대문 앞에 줄지어 섰다. 맨 앞의 ${josa(n, '이가')} 그들에게 「너희 사조(師祖)이시다」라며 큰절을 시킨다.`,
        dialogue: `“제 문하생들입니다. 이 아이들에게도 「${sk}」의 뿌리가 어디인지 보여 주고 싶었습니다. 선물도 조금 마련했습니다.”`,
      },
    ]);
  }
  if (g.fate === 'SUCCESSFUL') {
    return pickFresh<RevisitScene>(s, 'grad_revisit', [
      {
        id: 'sc_bureau',
        title: `출세한 옛 제자의 방문 — ${n}`,
        narration: `말끔한 비단옷을 차려입은 옛 제자 ${josa(n, '이가')} 묵직한 은자 꾸러미를 들고 스승을 찾아왔다.`,
        dialogue: '“사부님, 잘 지내셨습니까! 저, 이제 고을 제일의 표국을 맡아 꽤 넉넉히 살고 있습니다. 도장 살림에 보태어 주십시오!”',
      },
      {
        id: 'sc_merchant',
        title: `큰 상인이 된 옛 제자 — ${n}`,
        narration: `비단 두루마기를 걸친 옛 제자 ${josa(n, '이가')} 하인에게 짐을 지워 들어섰다. 하산한 뒤 장사로 크게 일어섰다고 한다.`,
        dialogue: '“칼 쓰던 배짱으로 장사를 하니 남들이 못 하는 거래를 하게 되더군요. 도장 살림에 보태 주십시오!”',
      },
      {
        id: 'sc_dojo',
        title: `도장을 연 옛 제자 — ${n}`,
        narration: `옛 제자 ${josa(n, '이가')} 이웃 고을에 제 이름으로 도장을 열었다며 인사를 왔다. 손에는 묵직한 은자 꾸러미가 들려 있다.`,
        dialogue: '“문하생이 벌써 서른입니다. 가르쳐 보니 사부님이 저를 얼마나 참아 주셨는지 알겠더군요. 받아 주십시오.”',
      },
      {
        id: 'sc_guard',
        title: `세도가의 호위 무사가 된 옛 제자 — ${n}`,
        narration: `번듯한 갓에 칼을 찬 옛 제자 ${josa(n, '이가')} 말에서 내려 대문 앞에 섰다. 고을에서 손꼽히는 집안의 호위를 맡고 있다고 한다.`,
        dialogue: '“주인 어른께서 넉넉히 쳐주십니다. 사부님 문하에서 배웠다고 하니 다들 한 수 접어 주더군요. 조금 보태 드리겠습니다.”',
      },
    ]);
  }
  // ORDINARY
  return pickFresh<RevisitScene>(s, 'grad_revisit', [
    {
      id: 'or_soup',
      title: `장터 백성이 된 옛 제자 — ${n}`,
      narration: `소박한 무명옷 차림의 옛 제자 ${josa(n, '이가')} 따뜻한 떡 보따리를 들고 쑥스럽게 대문 앞에 섰다.`,
      dialogue: '“사부님…… 죄송합니다. 제가 재주가 없어 고수는 못 되고 장터에서 국밥 장사하며 살고 있습니다. 그래도 도장에서 배운 체력 덕분에 험한 세상 잘 버팁니다!”',
    },
    {
      id: 'or_farmer',
      title: `농사꾼이 된 옛 제자 — ${n}`,
      narration: `햇볕에 그을린 옛 제자 ${josa(n, '이가')} 햇곡식 자루를 지고 대문 앞에 섰다.`,
      dialogue: '“올해 농사가 잘되어 첫 곡식을 가져왔습니다. 고수는 못 되었어도, 쟁기질할 때마다 사부님께 배운 호흡을 씁니다.”',
    },
    {
      id: 'or_porter',
      title: `나루터 짐꾼이 된 옛 제자 — ${n}`,
      narration: `어깨에 굳은살이 박인 옛 제자 ${josa(n, '이가')} 말린 생선 한 두름을 들고 쭈뼛거리며 들어온다.`,
      dialogue: '“나루터에서 짐을 집니다. 다들 제가 힘이 세다고 놀라는데, 다 이 마당에서 기른 힘이지요.”',
    },
    {
      id: 'or_child',
      title: `아이 손을 잡고 온 옛 제자 — ${n}`,
      narration: `옛 제자 ${josa(n, '이가')} 코흘리개 아이의 손을 잡고 찾아왔다. 아이가 스승을 보더니 ${n} 뒤로 쏙 숨는다.`,
      dialogue: '“제 아이입니다. 크면 이 도장에 보내려고요. 그때까지 사부님 꼭 정정하셔야 합니다.”',
    },
  ]);
}

// ───────── 3. 문하생의 병 (disciple_illness) ─────────
interface IllnessScene extends FreshVariant {
  label: string; // 결과 문구에 쓰는 병 이름
  title: string;
  narration: string;
  dialogue: string;
}

// 앓는 제자도 고른다 — 최근에 앓았던 제자는 피한다 (예전에는 언제나 맨 앞의 제자만 앓았다)
export function pickSickDisciple(s: GameState): Disciple | undefined {
  const pool = s.disciples.filter((d) => !d.dead && !d.isChild);
  if (pool.length === 0) return undefined;
  const items = pool.map((d) => [d, freshFactor(s, `disciple_illness:d_${d.id}`)] as [Disciple, number]);
  const total = items.reduce((a, [, w]) => a + w, 0);
  let roll = Math.random() * total;
  for (const [d, w] of items) {
    roll -= w;
    if (roll <= 0) return d;
  }
  return pool[pool.length - 1];
}

export function illnessScene(s: GameState, d: Disciple): IllnessScene {
  const n = d.name;
  const age = d.age;
  return pickFresh<IllnessScene>(s, 'disciple_illness', [
    {
      id: 'lung',
      label: '폐병',
      title: `문하생의 중병 — 쓰러진 ${n}`,
      narration: `한밤중 숙소에서 거친 기침 소리가 터져 나왔다. 문하생 ${n}(${age}세)${particle(n, '이가')} 고열과 각혈로 쓰러져 있다!`,
      dialogue: '“쿨럭…… 사부님, 죄송합니다…… 몸이 말을 듣지 않습니다……”',
    },
    {
      id: 'typhoid',
      label: '상한(傷寒)',
      title: `열에 들뜬 ${n}`,
      narration: `사흘째 열이 내리지 않는다. ${josa(n, '이가')} 헛소리를 하며 이불을 걷어찬다. 의원은 「상한(傷寒)」이라며 고개를 젓는다.`,
      dialogue: '“사부님…… 마당에…… 아직 목검을 안 치웠는데……”',
    },
    {
      id: 'dysentery',
      label: '이질',
      when: () => s.season === 'SUMMER' || s.season === 'AUTUMN',
      title: `이질에 쓰러진 ${n}`,
      narration: `무더위 끝에 고을에 이질이 돌았다. ${josa(n, '이가')} 하루 사이에 얼굴이 반쪽이 되어 일어나지 못한다.`,
      dialogue: '“물만 마셔도…… 속이 뒤집힙니다…… 송구합니다, 사부님……”',
    },
    {
      id: 'wound',
      label: '상처의 독',
      title: `곪아 버린 상처 — ${n}`,
      narration: `대련 중에 긁힌 상처를 대수롭지 않게 여긴 것이 탈이었다. ${n}의 팔이 퉁퉁 부어오르고 열이 펄펄 끓는다.`,
      dialogue: '“별것 아닌 줄 알았습니다…… 팔이…… 팔이 타는 것 같습니다……”',
    },
    {
      id: 'pox',
      label: byC(s, '마마', '천화(天花)', '포창(疱瘡)'),
      when: () => age < 24,
      title: byC(s, `마마를 앓는 ${n}`, `천화(天花)를 앓는 ${n}`, `포창(疱瘡)을 앓는 ${n}`),
      narration: `${n}의 온몸에 붉은 반점이 돋았다. 방문에 금줄을 치고 다른 문하생들의 출입을 막았다.`,
      dialogue: '“사부님, 가까이 오지 마십시오…… 옮으시면 안 됩니다……”',
    },
    {
      id: 'malaria',
      label: '학질',
      when: () => s.season === 'SUMMER',
      title: `학질에 떠는 ${n}`,
      narration: `한여름인데도 ${josa(n, '이가')} 이불을 세 겹이나 덮고 이를 딱딱 부딪친다. 오한과 고열이 하루걸러 번갈아 찾아온다.`,
      dialogue: '“추, 춥습니다…… 사부님…… 이 더위에 왜 이리 추운지……”',
    },
    {
      id: 'overwork',
      label: '과로 끝의 열병',
      title: `수련 중 쓰러진 ${n}`,
      narration: `새벽 수련 도중 ${josa(n, '이가')} 목검을 놓치며 그대로 쓰러졌다. 이마가 불덩이다. 몇 달째 남몰래 밤 수련까지 해 온 탓이라고 한다.`,
      dialogue: '“조금만…… 조금만 쉬면 일어나겠습니다…… 수련에 빠지면 안 되는데……”',
    },
    {
      id: 'cough',
      label: '해수(咳嗽)',
      when: () => s.season === 'WINTER',
      title: `한겨울의 해수(咳嗽) — ${n}`,
      narration: `얼음물로 냉수마찰을 하던 ${josa(n, '이가')} 그날 밤부터 기침이 멎지 않는다. 숨소리에 쇳소리가 섞였다.`,
      dialogue: '“쿨럭…… 괜찮습니다, 사부님…… 겨울이면 늘 이랬습니다……”',
    },
  ]);
}

// ───────── 4. 주인공의 열병 (hero_fever) ─────────
interface FeverScene extends FreshVariant {
  label: string;
  title: string;
  narration: string;
  dialogue: string;
}

export function feverScene(s: GameState): FeverScene {
  const elder = s.age >= 55;
  const winter = s.season === 'WINTER';
  return pickFresh<FeverScene>(s, 'hero_fever', [
    {
      id: 'chill',
      label: winter ? '겨울 열병' : '환절기 열병',
      title: winter ? '매서운 겨울의 열병(熱病)' : '지독한 환절기 악성 열병(熱病)',
      narration: elder
        ? '매서운 바람이 세월을 먹은 뼈마디 깊숙이 스며든 탓일까. 밤새 오한과 고열이 번갈아 찾아오며 기력이 뚝 떨어졌다.'
        : '찬 바람을 맞으며 수련을 강행한 탓일까. 온몸이 불덩이처럼 달아오르며 식은땀이 멈추지 않는다.',
      dialogue: elder
        ? '“연세도 있으신데 폐에 찬 기운이 깊이 들었습니다! 당장 귀한 탕약을 쓰셔야 합니다만, 이번 열병은 독해 약효를 장담하기 어렵습니다!”'
        : '“폐에 찬 기운이 깊이 들었습니다! 당장 탕약을 쓰고 쉬셔야 합니다만, 이번 열병은 독해 약이 꼭 듣는다는 보장도 없습니다!”',
    },
    {
      id: 'icewater',
      label: '고뿔',
      when: () => winter && !elder,
      title: '냉수마찰 끝의 고뿔',
      narration: '언 우물물을 뒤집어쓰는 새벽 수련을 하루도 거르지 않았더니, 끝내 몸이 탈이 났다. 코가 막히고 머리가 깨질 듯하다.',
      dialogue: '“얼음물 수련도 정도가 있지요! 이번 고뿔은 폐까지 내려갔습니다. 약을 쓰셔야 합니다.”',
    },
    {
      id: 'old_wound',
      label: '덧난 옛 상처',
      when: () => s.age >= 35,
      title: '찬 바람에 도진 옛 상처',
      narration: '젊은 날 칼에 베였던 옆구리가 찬 바람이 불자 다시 욱신거리더니, 기어이 열이 오르기 시작했다.',
      dialogue: '“묵은 상처에 찬 기운이 들어 덧났습니다. 이번엔 가볍게 넘길 일이 아닙니다.”',
    },
    {
      id: 'phlegm',
      label: '담(痰) 결림',
      when: () => s.age >= 48,
      title: '가슴에 맺힌 담(痰)',
      narration: '숨을 들이쉴 때마다 가슴 한복판이 결린다. 밤새 마른기침이 이어지고 열이 오르내린다.',
      dialogue: '“담이 결리고 열이 오르는 것이 예사롭지 않습니다. 탕약으로 다스려야 합니다.”',
    },
    {
      id: 'snowroad',
      label: '눈길의 오한',
      when: () => winter,
      title: '눈보라 길 끝의 오한',
      narration: '이웃 고을 상가(喪家)에 문상을 다녀오던 길에 눈보라를 만났다. 돌아온 날 밤부터 오한이 들어 이가 맞부딪친다.',
      dialogue: '“눈보라를 너무 오래 맞으셨습니다. 열이 쉽게 내리지 않을 겁니다.”',
    },
    {
      id: 'malaria',
      label: '학질',
      when: () => !winter,
      title: '사흘거리 학질(瘧疾)',
      narration: '오한과 고열이 사흘 간격으로 번갈아 찾아온다. 고을 사람들은 「사흘거리」라 부르며 혀를 찬다.',
      dialogue: '“학질입니다. 독한 놈이라 약을 써도 오래갈 수 있습니다.”',
    },
  ]);
}

// ───────── 5. 순환 사건 풀 (random_* / life_*) ─────────
interface Scene extends FreshVariant {
  title: string;
  narration: string;
}

// 빗소리 속의 번뜩임 — 깨달음이 찾아오는 일상의 순간들
export function inspirationScene(s: GameState): Scene {
  const elder = s.age >= 55;
  return pickFresh<Scene>(s, 'random_inspiration', [
    {
      id: 'rain',
      title: elder ? '빗소리 속의 무심(無心)' : '빗소리 속의 번뜩임',
      narration: elder
        ? '처마 끝에서 떨어지는 빗방울 소리를 고요히 듣다, 평생 휘둘러 온 초식에서 불필요한 힘 하나가 스르르 빠져나가는 경지를 느꼈다.'
        : '처마에서 떨어지는 빗방울 박자를 멍하니 듣다가, 문득 막혀 있던 초식의 맥이 머릿속에서 번개처럼 맞물린다.',
    },
    {
      id: 'fog',
      title: '새벽안개 속의 한 수',
      narration: '새벽안개가 마당을 덮은 날, 목인장 앞에 선 채 안개가 칼끝에 갈라졌다 다시 모이는 모양을 보다가 막혀 있던 초식의 길이 보였다.',
    },
    {
      id: 'moon',
      title: '달그림자의 검로(劍路)',
      narration: '보름달 아래 마당에 대나무 그림자가 흔들린다. 바람을 따라 움직이는 그 그림자의 궤적이 초식의 빈틈을 정확히 메우고 있었다.',
    },
    {
      id: 'firewood',
      title: '장작을 패다가',
      narration: '장작을 패던 도끼가 나뭇결을 따라 저절로 갈라지는 순간, 칼도 결을 따라야 한다는 것을 머리보다 손이 먼저 알았다.',
    },
    {
      id: 'well',
      title: '두레박줄의 힘',
      narration: '우물물을 길어 올리다 문득, 두레박줄이 손바닥에서 미끄러지지 않을 만큼의 힘이 얼마인지 깨달았다. 칼자루를 쥐는 힘도 딱 그만큼이면 된다.',
    },
    {
      id: 'leaf',
      when: () => s.season === 'AUTUMN',
      title: '낙엽 한 장',
      narration: '마당에 떨어지는 낙엽 한 장을 베려다 헛손질을 했다. 두 번째에는 베려 하지 않고 따라갔다. 낙엽이 칼날 위에 사뿐히 내려앉았다.',
    },
    {
      id: 'snow',
      when: () => s.season === 'WINTER',
      title: '첫눈 위의 발자국',
      narration: '첫눈 덮인 마당에 찍힌 제 발자국을 내려다보았다. 초식을 펼칠 때 발이 어디서 흔들리는지 눈 위에 고스란히 남아 있었다.',
    },
    {
      id: 'kids',
      title: '아이들의 막대기 칼싸움',
      narration: '대문 밖에서 동네 아이들이 막대기로 칼싸움을 한다. 아무것도 모르는 아이의 막무가내 한 수가 오래 막혀 있던 생각을 툭 건드렸다.',
    },
  ]);
}

// 장터 축제의 무예 시연 — 나라와 계절마다 다른 잔치
export function festivalScene(s: GameState): Scene & { speaker: string; merchant: boolean } {
  const S = s.season;
  return pickFresh<Scene & { speaker: string; merchant: boolean }>(s, 'life_festival_demo', [
    {
      id: 'market',
      speaker: '장터 상인 대표',
      merchant: true,
      title: '고을 장터 축제의 무예 시연',
      narration: '고을 큰 장날을 맞아 저잣거리 상인들이 도장에 무예 시연을 정중히 청해 왔다.',
    },
    {
      id: 'kr_dano',
      when: () => s.country === 'KOREA' && S === 'SUMMER',
      speaker: '고을 유지',
      merchant: false,
      title: '단옷날 씨름판 곁의 무예 시연',
      narration: '단옷날, 냇가 버드나무에 그네가 걸리고 씨름판이 벌어졌다. 고을 유지들이 씨름판 곁에서 무예 시연을 해 달라고 청해 왔다.',
    },
    {
      id: 'kr_chuseok',
      when: () => s.country === 'KOREA' && S === 'AUTUMN',
      speaker: '마을 어른',
      merchant: false,
      title: '한가위 놀이판의 무예 시연',
      narration: '한가위 보름달 아래 강강술래가 돌고 놀이판이 벌어졌다. 마을 어른들이 도장 사람들의 시연으로 놀이판을 마무리하고 싶다 한다.',
    },
    {
      id: 'kr_daeboreum',
      when: () => s.country === 'KOREA' && (S === 'SPRING' || S === 'WINTER'),
      speaker: '마을 어른',
      merchant: false,
      title: '정월 대보름 달집 앞의 무예 시연',
      narration: '정월 대보름, 들판에 달집이 높이 쌓였다. 쥐불놀이 불꽃 사이로 마을 사람들이 도장의 칼춤을 보고 싶다며 찾아왔다.',
    },
    {
      id: 'cn_yuanxiao',
      when: () => s.country === 'CHINA' && (S === 'SPRING' || S === 'WINTER'),
      speaker: '상인 조합 대표',
      merchant: true,
      title: '원소절(元宵節) 등불 거리의 무예 시연',
      narration: '원소절 밤, 거리마다 등롱이 걸리고 사자춤 패가 북을 울린다. 상인 조합에서 사자춤 사이에 무예 시연을 넣고 싶다며 청해 왔다.',
    },
    {
      id: 'cn_miaohui',
      when: () => s.country === 'CHINA',
      speaker: '묘회를 맡은 상인',
      merchant: true,
      title: '묘회(廟會) 장터의 무예 시연',
      narration: '성황묘 앞에 묘회가 열려 잡기단과 약장수, 설서인이 몰려들었다. 묘회를 주관하는 상인들이 도장에 무예 시연을 청해 왔다.',
    },
    {
      id: 'cn_midautumn',
      when: () => s.country === 'CHINA' && S === 'AUTUMN',
      speaker: '장터 어른',
      merchant: false,
      title: '중추절 달맞이 장터의 무예 시연',
      narration: '중추절을 맞아 월병 장수와 등롱 장수로 장터가 붐빈다. 장터 어른들이 달맞이 놀이에 무예 시연을 곁들이고 싶다 한다.',
    },
    {
      id: 'jp_matsuri',
      when: () => s.country === 'JAPAN',
      speaker: '신사의 신관',
      merchant: false,
      title: '신사 마쓰리의 봉납 연무(演武)',
      narration: '고을 신사의 마쓰리 날, 가마(미코시)가 거리를 누빈다. 신사 사람들이 신 앞에 바치는 봉납 연무를 도장에 맡기고 싶다며 찾아왔다.',
    },
    {
      id: 'jp_bon',
      when: () => s.country === 'JAPAN' && S === 'SUMMER',
      speaker: '마을 청년회 대표',
      merchant: false,
      title: '본오도리(盆踊り) 밤의 무예 시연',
      narration: '우란분 무렵, 망루 아래에서 본오도리 춤판이 밤새 이어진다. 마을 청년회가 춤판 사이에 칼 시연을 보여 달라고 청해 왔다.',
    },
  ]);
}

// 약초꾼의 영약 — 파는 사람과 약재가 매번 다르다
export function herbScene(s: GameState): Scene & { speaker: string; item: string } {
  return pickFresh<Scene & { speaker: string; item: string }>(s, 'life_herb_peddler', [
    {
      id: 'herbalist',
      speaker: '산속 약초꾼',
      item: '산약초',
      title: '깊은 산속 약초꾼의 귀한 영약',
      narration: '흙 묻은 배낭을 멘 늙은 약초꾼이 산삼과 진귀한 약재를 싸 들고 도장 마당을 찾았다.',
    },
    {
      id: 'kr_simmani',
      when: () => s.country === 'KOREA',
      speaker: '늙은 심마니',
      item: '산삼',
      title: '심마니가 캐 온 산삼',
      narration: '「심봤다」 소리를 평생 세 번 들어 봤다는 늙은 심마니가 이끼로 싼 산삼 한 뿌리를 조심스레 풀어 보인다.',
    },
    {
      id: 'cn_lingzhi',
      when: () => s.country === 'CHINA',
      speaker: '약재상 주인',
      item: '영지(靈芝)',
      title: '약재상이 가져온 영지(靈芝)',
      narration: '성내 약재상 주인이 붉게 윤이 나는 영지버섯을 비단 보자기에 싸 들고 찾아왔다. 깊은 산 고목에서 백 년을 자란 것이라 한다.',
    },
    {
      id: 'jp_ninjin',
      when: () => s.country === 'JAPAN',
      speaker: '떠돌이 약장수',
      item: '조선 인삼',
      title: '약장수가 가져온 조선 인삼',
      narration: '쓰시마를 거쳐 들어왔다는 조선 인삼을 품에 안은 약장수가 찾아왔다. 값이 금보다 비싸다며 너스레를 떤다.',
    },
    {
      id: 'doctor',
      speaker: '떠돌이 의원',
      item: '보약',
      title: '떠돌이 의원의 보약 한 제',
      narration: '침통을 허리에 찬 떠돌이 의원이 진맥을 해 주겠다며 마루에 앉았다. 맥을 짚더니 보약 한 제를 권한다.',
    },
  ]);
}

// 달밤의 자객 — 노리는 것과 숨어든 길이 매번 다르다
export function assassinScene(s: GameState): Scene {
  return pickFresh<Scene>(s, 'life_night_assassin', [
    {
      id: 'library',
      title: '달밤의 낯선 자객',
      narration: '그믐달 아래, 담장을 소리 없이 넘어온 검은 복면의 자객이 도장 장서각을 노리고 숨어들었다!',
    },
    {
      id: 'roof',
      title: '지붕 위의 발소리',
      narration: '자정 무렵, 기와 위를 고양이보다 가볍게 걷는 발소리가 들렸다. 복면 쓴 그림자 하나가 처마 끝에 거꾸로 매달려 장서각 창을 엿보고 있다.',
    },
    {
      id: 'lamp',
      title: '꺼진 등불, 장서각의 그림자',
      narration: '장서각의 등불이 바람도 없이 꺼졌다. 서가 사이에서 비급 상자를 더듬는 손이 보인다.',
    },
    {
      id: 'well',
      title: '우물가에 숨은 복면객',
      narration: '새벽 물을 길으러 나왔다가 우물 뒤에 웅크린 검은 형체와 마주쳤다. 등에 맨 보따리 틈으로 도장 비급의 표지가 비죽 나와 있다!',
    },
  ]);
}

// 문하생 다툼 — 다투는 두 사람과 까닭이 매번 다르다
export function quarrelScene(s: GameState, a: string, b: string): Scene & { dialogue: string } {
  return pickFresh<Scene & { dialogue: string }>(s, 'life_disciple_quarrel', [
    {
      id: 'form',
      title: '문하생 간의 대련 신경전',
      narration: `수련 도중 ${josa(a, '과와')} ${b}의 기세가 과열되어 멱살잡이 직전까지 치달았다!`,
      dialogue: `“사부님! ${josa(b, '이가')} 제 초식을 우습게 보고 멋대로 힘으로만 밀어붙입니다!”`,
    },
    {
      id: 'meal',
      title: '밥상머리 주먹다짐',
      narration: `저녁 밥상에서 반찬 한 점을 두고 시작된 말다툼이 ${josa(a, '과와')} ${b}의 주먹다짐으로 번졌다. 밥상이 엎어졌다.`,
      dialogue: `“사부님, 이번만큼은 못 참습니다! ${josa(b, '이가')} 매번 제 몫까지 집어 먹습니다!”`,
    },
    {
      id: 'rank',
      title: '사범 자리를 둘러싼 신경전',
      narration: `도장에 사범 자리가 하나 빈다는 말이 돌자 ${josa(a, '과와')} ${b} 사이에 찬바람이 분다. 오늘은 마당 한복판에서 서로 노려보고 있다.`,
      dialogue: `“제가 먼저 들어왔습니다! 그런데 ${josa(b, '이가')} 아우들 앞에서 저를 무시합니다.”`,
    },
    {
      id: 'sword',
      title: '부러진 목검의 주인',
      narration: `${a}의 목검이 두 동강 난 채 발견되었다. ${josa(a, '은는')} ${josa(b, '을를')} 범인으로 지목했고, 둘은 마당에서 맞붙기 직전이다.`,
      dialogue: `“아버님이 깎아 주신 목검입니다! ${josa(b, '이가')} 몰래 휘두르다 부러뜨린 게 틀림없습니다!”`,
    },
    {
      id: 'hometown',
      title: '고향 사투리 놀림',
      narration: `${josa(b, '이가')} ${a}의 고향 사투리를 흉내 내며 놀린 것이 화근이 되었다. 웃던 문하생들이 슬금슬금 물러선다.`,
      dialogue: `“사부님, 제 고향을 욕보이는 건 못 참습니다! 오늘 결판을 내겠습니다!”`,
    },
  ]);
}

// 비 오는 날의 손님 — 처마 밑에 들어선 무인이 매번 다르다
export function teaGuestScene(s: GameState): Scene & { speaker: string; plain: string } {
  return pickFresh<Scene & { speaker: string; plain: string }>(s, 'life_wandering_tea', [
    {
      id: 'swordsman',
      speaker: '지나가던 중년 검객',
      title: '비 오는 날 낯선 검객과의 차담',
      narration: '장대비를 피해 처마 밑에 들어선 낯선 중년 검객이 도장의 목인장을 보며 감탄한다.',
      plain: '“목인장에 패인 칼자국이 참으로 곧고 깊구려. 비가 그칠 동안 차 한 잔 나누며 검리를 이야기해 보시겠소?”',
    },
    {
      id: 'ronin',
      speaker: '비를 피하는 늙은 낭인',
      title: '처마 밑의 늙은 떠돌이 무사',
      narration: '낡은 칼집을 허리에 찬 늙은 떠돌이 무사가 처마 밑에서 젖은 짚신을 털고 있다. 눈매만은 아직 날카롭다.',
      plain: '“신세를 좀 지겠소. 늙은이 칼도 칼이라, 비 그칠 때까지 검 이야기나 나누면 어떻겠소?”',
    },
    {
      id: 'monk',
      speaker: '탁발하는 무승(武僧)',
      title: '빗속의 탁발승',
      narration: '삿갓 끝에서 빗물이 줄줄 흐르는 탁발승이 대문 앞에서 합장한다. 지팡이 쥔 손등에 굳은살이 두껍다. 보통 스님은 아니다.',
      plain: '“빗길에 시주는 바라지 않소. 다만 차 한 잔 얻어 마시며 이 도장의 무예 이야기를 듣고 싶구려.”',
    },
    {
      id: 'swordswoman',
      speaker: '젖은 삿갓의 여검객',
      title: '젖은 삿갓의 여검객',
      narration: '쏟아지는 비를 뚫고 삿갓을 쓴 여검객이 처마 밑으로 들어섰다. 등에 비스듬히 멘 장검이 예사롭지 않다.',
      plain: '“실례하겠어요. 도장 마당의 발자국을 보니 범상치 않은 분이 가르치시는군요. 비 그칠 동안 검 이야기 한 자락 청해도 될까요?”',
    },
    {
      id: 'officer',
      speaker: '퇴역한 늙은 무관',
      title: '비를 피한 퇴역 무관',
      narration: '도롱이를 걸친 퇴역 무관이 비를 피해 들어섰다. 군영에서 늙었다는 사람답게 허리가 곧다.',
      plain: '“군영에서 칼밥을 먹은 지 삼십 년이오. 이 도장 칼은 군영 칼과 어떻게 다른지, 차 한 잔 하며 들어 보고 싶소.”',
    },
  ]);
}

// 흉년의 밀린 월사금 — 흉년이 든 까닭이 매번 다르다
export function famineScene(s: GameState): Scene {
  return pickFresh<Scene>(s, 'life_famine_tuition', [
    {
      id: 'drought',
      title: '흉년과 밀린 월사금',
      narration: '가뭄이 들어 농사꾼 집안 문하생들이 석 달째 월사금을 내지 못하고 고개를 숙인다.',
    },
    {
      id: 'flood',
      title: '물난리 끝의 밀린 월사금',
      narration: '여름 큰물에 강가 논밭이 쓸려 나갔다. 강마을에서 온 문하생들이 젖은 짚신 차림으로 월사금 대신 고개를 숙인다.',
    },
    {
      id: 'locust',
      title: '메뚜기 떼가 휩쓴 들판',
      narration: '하늘을 덮은 메뚜기 떼가 들판을 휩쓸고 갔다. 농사꾼 집안 문하생들이 빈손으로 와서 마당만 쓸고 있다.',
    },
    {
      id: 'frost',
      title: '냉해 든 해의 월사금',
      narration: '이른 서리에 벼가 여물지 못했다. 문하생 부모들이 월사금 대신 쭉정이 섞인 곡식 자루를 들고 와 면목 없어 한다.',
    },
  ]);
}
