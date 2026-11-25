import { josa } from '../../utils/korean';
import { BattleConfig, JourneyRegionId, WeaponGroup } from '../../types/game';
import {
  addFame,
  addRep,
  addStats,
  gainInsight,
  giveBook,
  giveWeapon,
  H,
  highlight,
  JourneyEventDef,
  journeyBattle,
  N,
  P,
  roadScale,
  say,
  spendDays,
  trainEquipped,
} from '../../engine/journeyCore';

// 은거 고수. 지역마다 한 명씩, 일생에 한 번 만난다.
// 모두 Lv.9(입신)에서 멈춘 사람들이다 — 극의를 가르쳐 줄 수는 없지만, 벽이 어디에 있는지는 안다.

interface MasterDef {
  key: string;
  region: JourneyRegionId;
  name: string;
  title: string;
  age: number;
  place: string;
  scene: string;
  greet: string;
  wall: string; // 벽에 대해 남기는 말
  ai: BattleConfig['enemyAi'];
  weapon: WeaponGroup;
  skills: string[];
  bookId: string;
  weaponId?: string;
  scaleMult: number;
}

const MASTERS: MasterDef[] = [
  {
    key: 'master_jiri',
    region: 'KR_JIRI',
    name: '청학동 은자',
    title: '세상을 등진 조선세법의 마지막 전인',
    age: 71,
    place: '청학동 초가',
    scene: '안개 낀 초가 마당. 백발 노인이 싸리비로 낙엽을 쓸고 있다. 그 비질에 군더더기가 없다.',
    greet: '이 산골까지 칼을 메고 온 걸 보니, 수련이 막혔구먼. 아니면 사람을 찾는 겐가?',
    wall: '나는 평생 그 벽 앞에서 멈췄네. 벽을 넘은 사람은… 아직 본 적이 없어. 자네가 첫 사람이 될지도 모르지.',
    ai: 'OLD_MASTER',
    weapon: 'BLADE',
    skills: ['sk_kr_02', 'sk_kr_06', 'sk_cn_03', 'base_v_slash'],
    bookId: 'bk_kr_02',
    scaleMult: 1.15,
  },
  {
    key: 'master_geumgang',
    region: 'KR_GEUMGANG',
    name: '구룡폭포 노승',
    title: '폭포 아래서 사십 년을 앉아 있던 이',
    age: 78,
    place: '폭포 옆 바위굴',
    scene: '폭포 소리에 묻힌 바위굴. 바짝 마른 노승이 물보라를 맞으며 앉아 있다. 숨소리가 들리지 않는다.',
    greet: '…폭포가 시끄럽다고 느끼시오? 사십 년 앉아 있으면, 폭포도 조용해진다오.',
    wall: '빈승도 그 벽을 보았소. 넘으려 할수록 벽은 높아지더이다. 넘으려는 마음을 내려놓았을 때… 아니, 그때도 넘지는 못했소.',
    ai: 'OLD_MASTER',
    weapon: 'UNARMED',
    skills: ['sk_kr_03', 'sk_cn_03', 'sk_cn_01', 'sk_kr_04'],
    bookId: 'bk_kr_08',
    scaleMult: 1.1,
  },
  {
    key: 'master_gwanseo',
    region: 'KR_GWANSEO',
    name: '백두 포수 노인',
    title: '창 한 자루로 범을 잡던 관서의 사냥꾼',
    age: 64,
    place: '산자락 사냥막',
    scene: '사냥막 앞에 범 가죽이 널려 있다. 외팔의 노인이 창날을 숫돌에 갈고 있다.',
    greet: '관서 사람은 벼슬길이 막혀 있으니 창이나 갈지. 자네는 어디서 왔나?',
    wall: '범을 마흔 마리 잡았네. 그런데도 마흔한 번째가 무서웠지. 그 두려움이 내 벽이었네.',
    ai: 'HEAVY',
    weapon: 'POLEARM',
    skills: ['sk_kr_05', 'sk_kr_07', 'sk_cn_06'],
    bookId: 'bk_kr_05',
    weaponId: 'wp_pl_02',
    scaleMult: 1.1,
  },
  {
    key: 'master_huashan',
    region: 'CN_HUASHAN',
    name: '화산 검선(劍仙)',
    title: '구름 위 낙안봉에 사는 늙은 검객',
    age: 69,
    place: '낙안봉 바위 정자',
    scene: '구름 위 바위 정자. 한 노인이 차를 끓이고 있다. 검은 정자 기둥에 무심히 기대 세워져 있다.',
    greet: '천 길을 올라와 차 한 잔 얻어 마시려는 게요? 앉으시오. 검 이야기는 차가 식은 뒤에 합시다.',
    wall: '화산의 검은 빠르다 하오. 나는 평생 더 빠르려 했소. 벽은… 빠르기로 넘는 것이 아니었던 모양이오.',
    ai: 'DUELIST',
    weapon: 'BLADE',
    skills: ['sk_cn_03', 'sk_cn_05', 'sk_jp_03', 'sk_cn_01'],
    bookId: 'bk_cn_08',
    scaleMult: 1.2,
  },
  {
    key: 'master_jiangnan',
    region: 'CN_JIANGNAN',
    name: '진가구 노권사',
    title: '하남에서 흘러온 태극의 노인',
    age: 66,
    place: '서호 버드나무 아래',
    scene: '서호 버드나무 아래, 노인이 혼자 느릿느릿 손을 젓고 있다. 물고기들이 그 손을 따라 모였다 흩어진다.',
    greet: '젊은이, 힘을 주면 지는 게요. 이 늙은이 손을 한번 밀어 보겠소?',
    wall: '흘리고 또 흘려서 여기까지 왔소. 그런데 마지막 한 겹은 흘려지지가 않더군. 그게 벽이오.',
    ai: 'OLD_MASTER',
    weapon: 'UNARMED',
    skills: ['sk_cn_03', 'sk_cn_04', 'sk_cn_01', 'sk_cn_05'],
    bookId: 'bk_cn_03',
    scaleMult: 1.15,
  },
  {
    key: 'master_huguang',
    region: 'CN_HUGUANG',
    name: '묘강 독수(毒手)',
    title: '독과 암기의 여인',
    age: 52,
    place: '대나무 숲 오두막',
    scene: '대나무 숲 속 오두막. 문 앞에 형형색색의 독초가 말라 가고, 처마 끝에 가느다란 바늘들이 매달려 있다.',
    greet: '한 발짝만 더 오면 바늘 세 개가 목에 박힐 거예요. …칼을 내려놓는 걸 보니 손님이군요.',
    wall: '독은 상대를 이기게 해 주지만, 벽은 넘게 해 주지 않아요. 나도 그걸 너무 늦게 알았죠.',
    ai: 'RANGED',
    weapon: 'THROWN',
    skills: ['sk_cn_07', 'sk_cn_02', 'sk_jp_07'],
    bookId: 'bk_cn_07',
    scaleMult: 1.15,
  },
  {
    key: 'master_tokaido',
    region: 'JP_TOKAIDO',
    name: '떠돌이 검호(劍豪)',
    title: '도카이도를 서른 번 오간 신카게류 낭인',
    age: 58,
    place: '오이강 나루 찻집',
    scene: '나루 찻집 툇마루. 남루한 차림의 낭인이 경단을 먹고 있다. 옆에 둔 칼집만은 반들반들하다.',
    greet: '자네도 무사수행 중인가. 나도 서른 해째 수행 중이지. 끝이 안 나는구먼, 허허.',
    wall: '이기는 칼, 지지 않는 칼, 죽이지 않는 칼… 다 배웠네. 그다음이 없더군. 그다음이 벽이야.',
    ai: 'DUELIST',
    weapon: 'BLADE',
    skills: ['sk_jp_01', 'sk_jp_03', 'sk_jp_04', 'sk_cn_03'],
    bookId: 'bk_jp_01',
    scaleMult: 1.15,
  },
  {
    key: 'master_kyoto',
    region: 'JP_KYOTO',
    name: '천구(天狗) 가면의 검객',
    title: '구라마산에 산다는 정체불명의 이도류',
    age: 61,
    place: '삼나무 숲 공터',
    scene: '달빛 내린 삼나무 숲 공터. 붉은 천구 가면을 쓴 이가 양손에 목검을 쥐고 서 있다.',
    greet: '우시와카가 여기서 검을 배웠다지. 거짓말이다. 그래도 사람들은 오지. 너도 그런 사람이냐?',
    wall: '두 자루를 쥐면 하나일 때보다 강해질 줄 알았다. 벽은 두 배로 높아지더군.',
    ai: 'RUSHDOWN',
    weapon: 'BLADE',
    skills: ['sk_jp_03', 'sk_jp_01', 'sk_jp_06', 'sk_kr_06'],
    bookId: 'bk_jp_02',
    scaleMult: 1.25,
  },
  {
    key: 'master_kyushu',
    region: 'JP_KYUSHU',
    name: '지겐류 노검객',
    title: '첫 칼에 모든 것을 거는 사쓰마의 노인',
    age: 67,
    place: '성하 마을 공터',
    scene: '공터에 굵은 말뚝이 박혀 있다. 노인이 목검을 높이 치켜들고 「체스토!」 기합과 함께 말뚝을 내리친다. 말뚝에서 연기가 난다.',
    greet: '두 번째 칼은 생각하지 마라. 첫 칼에 죽지 않으면 둘째 칼은 없다.',
    wall: '첫 칼에 모든 것을 걸었다. 그 첫 칼이 끝내 벽을 넘지 못했다. 그러니 나는 아직 첫 칼을 연습한다.',
    ai: 'HEAVY',
    weapon: 'BLADE',
    skills: ['sk_jp_06', 'sk_jp_03', 'base_v_slash'],
    bookId: 'bk_jp_06',
    scaleMult: 1.2,
  },
];

export const MASTER_EVENTS: JourneyEventDef[] = MASTERS.map(
  (m): JourneyEventDef => ({
    key: m.key,
    kind: 'MASTER',
    regions: [m.region],
    once: true,
    label: () => m.place,
    build: (s) => {
      const worthy = s.reputation.virtue + s.reputation.ascetic >= 60 || s.fame >= 700;
      return {
        title: `은거 고수 — ${m.name}`,
        category: 'DUEL',
        sceneActor: 'RIVAL',
        illustration: `/assets/px_jr_${m.key}.jpg`,
        narration: m.scene,
        script: [N(m.scene), P(m.name, m.greet), H(s, `${s.sectName}의 ${s.name}이라 합니다. 한 수 가르침을 청하러 왔습니다.`, '포권하며')],
        options: [
          { id: 'duel', label: '비무를 청한다 (2일)', hint: `이기면 비급을 전수받는다. 져도 한 합에서 배운다 — 상대 ${m.title}` },
          {
            id: 'ask',
            label: '칼을 내려놓고 가르침만 청한다 (3일)',
            hint: worthy ? '세평과 명성을 보고 받아 줄 것이다' : '아직 그만한 이름이 없다 (인덕+구도 60 또는 명성 700)',
            disabled: !worthy,
            disabledReason: '인덕+구도 60 또는 명성 700',
          },
          { id: 'leave', label: '방해하지 않고 물러난다' },
        ],
      };
    },
    resolve: (s, opt, c) => {
      if (opt === 'duel') {
        const n = spendDays(s, 2);
        return journeyBattle(n, c, opt, {
          title: `은거 고수 — ${m.name}`,
          subtitle: m.title,
          name: m.name,
          enemyTitle: m.title,
          age: m.age,
          ai: m.ai,
          scale: Math.max(2.4, roadScale(n, m.scaleMult)),
          weapon: m.weapon,
          skills: m.skills,
          rewardFame: 45,
        });
      }
      if (opt === 'ask') {
        let n = spendDays(s, 3);
        const b = giveBook(n, m.bookId, 40);
        n = addStats(b.state, { ins: 3, wil: 2 });
        const g = gainInsight(n, 8, m.place);
        n = highlight(g.state, `${m.name}에게 가르침을 받았다`);
        return say(n, [
          [m.name, '칼을 내려놓고 온 사람에게는 칼로 답하지 않는 법이지.'],
          ['나레이션', b.title ? `사흘 동안 ${m.name}의 곁에서 ${b.title}의 요체를 들었다. (해독 40% 진행, 통찰 +3, 정신 +2)` : `사흘 동안 ${m.name}의 곁에서 무리(武理)를 들었다. (통찰 +3, 정신 +2)`],
          [m.name, m.wall],
          ['나레이션', g.text],
        ]);
      }
      return s;
    },
    onBattle: (s, _opt, won) => {
      if (won) {
        let n = addFame(addRep(s, { ascetic: 8 }), 20);
        const b = giveBook(n, m.bookId, 50);
        n = b.state;
        let wText = '';
        if (m.weaponId) {
          const w = giveWeapon(n, m.weaponId);
          n = w.state;
          if (w.name) wText = ` 노인이 쓰던 「${w.name}」도 함께 내주었다.`;
        }
        const g = gainInsight(n, 10, m.place);
        n = highlight(g.state, `${josa(m.name, '을를')} 꺾고 ${josa(b.title || '무리', '을를')} 전수받았다`);
        return say(n, [
          [m.name, '…졌군. 오랜만에 기분 좋게 졌어.'],
          ['나레이션', b.title ? `${josa(m.name, '이가')} 품에서 낡은 책을 꺼내 건넸다. ${b.title}! (해독 50% 진행)${wText}` : `${josa(m.name, '이가')} 자신의 검리를 남김없이 풀어 주었다.${wText}`],
          [m.name, m.wall],
          ['나레이션', g.text],
        ]);
      }
      let n = trainEquipped(addStats(s, { ins: 4, wil: 3 }), 60);
      const g = gainInsight(n, 18, m.place);
      n = highlight(g.state, `${m.name}에게 졌지만 한 합에서 크게 배웠다`);
      return say(n, [
        [m.name, '나쁘지 않아. 다만 마지막 한 수에서 마음이 먼저 나갔네.'],
        ['나레이션', `진 칼끝을 오래 바라보았다. 그 한 합이 머릿속에서 수백 번 되풀이된다. (통찰 +4, 정신 +3, 장착 초식 숙련 +60)`],
        [m.name, m.wall],
        ['나레이션', g.text],
      ]);
    },
  })
);
