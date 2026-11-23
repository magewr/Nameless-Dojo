import { BattleConfig, CountryId, GameState, Gender, Skill, Stats } from '../types/game';
import { BOOK_SKILL_TEMPLATES, createBaseSkills, SIGNATURE_RECIPES } from '../data/booksAndSkills';
import { createBattleConfig } from '../data/events';
import { ALL_WEAPONS_CATALOG } from '../data/weapons';
import { createNewGame } from '../engine/gameLogic';

// 테스트관(?vfx-demo=1)에서 "실제 전투 화면"을 바로 틀어 보기 위한 견본 대진.
// 이펙트를 손볼 때 시연용 버튼이 아니라 실전과 똑같은 코드 경로를 눈으로 확인하려는 용도다.

export interface BattlePreviewPreset {
  id: string;
  label: string;
  desc: string;
  heroAge: number;
  heroLevel: number; // 초식 숙련도
  heroStat: number; // 능력치 기준값
  heroSkills: string[];
  heroWeaponGroup: 'BLADE' | 'UNARMED';
  enemy: {
    name: string;
    title: string;
    age: number;
    ai: BattleConfig['enemyAi'];
    scale: number;
    weapon: BattleConfig['enemyWeaponGroup'];
    skills: string[];
    stats?: Stats; // 지정하면 강도(scale)로 계산한 능력치 대신 쓴다 (주인공과 호각으로 맞출 때)
    skillLevel?: number; // 지정하면 초식 숙련도를 이 값으로 맞춘다
    hp?: number;
  };
  realDuel?: boolean;
}

export const BATTLE_PREVIEW_PRESETS: BattlePreviewPreset[] = [
  {
    id: 'novice',
    label: '입문 비무',
    desc: '저숙련 도검 · 기본 참격',
    heroAge: 22,
    heroLevel: 2,
    heroStat: 22,
    heroSkills: ['base_h_slash', 'base_v_slash', 'sk_kr_01'],
    heroWeaponGroup: 'BLADE',
    enemy: { name: '타 문파 도전자', title: '도장깨기 무사', age: 27, ai: 'AGGRESSIVE', scale: 1.0, weapon: 'BLADE', skills: ['sk_kr_01', 'sk_cn_01', 'sk_jp_03'] },
  },
  {
    id: 'mid',
    label: '중견 검객전',
    desc: 'Lv.6 연격 · 강공 · 찌르기',
    heroAge: 34,
    heroLevel: 6,
    heroStat: 48,
    heroSkills: ['sig_cross_slash', 'sk_kr_06', 'sk_kr_02', 'sig_gale_flurry', 'sk_cn_03'],
    heroWeaponGroup: 'BLADE',
    enemy: { name: '쌍도 여삼', title: '흑도 대표 무사', age: 33, ai: 'RUSHDOWN', scale: 1.9, weapon: 'BLADE', skills: ['sk_jp_03', 'sk_jp_06', 'sk_kr_06'] },
  },
  {
    id: 'master',
    label: '고수 반격전',
    desc: 'Lv.9 간파 연환 · 암전 연참',
    heroAge: 46,
    heroLevel: 9,
    heroStat: 78,
    heroSkills: ['sig_issen', 'sig_cross_slash', 'sk_cn_03', 'sig_flowing_riposte', 'sig_counter_zwerch'],
    heroWeaponGroup: 'BLADE',
    enemy: { name: '자하검존', title: '화산파 장문인', age: 58, ai: 'OLD_MASTER', scale: 2.8, weapon: 'BLADE', skills: ['sk_kr_02', 'sk_cn_03', 'sk_jp_03'] },
  },
  {
    // 양쪽 모두 간파 초식을 여럿 갖춘 호각의 초고수. 반격을 반격으로 받는 연환 공방(최대 8합)이 길게 이어지는지 보는 대진.
    id: 'chain',
    label: '초고수 연환 공방',
    desc: '호각의 두 고수 · 반격의 반격',
    heroAge: 52,
    heroLevel: 10,
    heroStat: 90,
    heroSkills: ['sig_issen', 'sk_cn_03', 'sig_flowing_riposte', 'sk_we_02', 'sig_barehand_blade', 'sig_cross_slash'],
    heroWeaponGroup: 'BLADE',
    enemy: {
      name: '백운검선',
      title: '백운검파 장문인',
      age: 58,
      ai: 'OLD_MASTER',
      scale: 3.6,
      weapon: 'BLADE',
      skills: ['sk_jp_03', 'sk_cn_03', 'sk_we_02', 'sk_jp_01', 'sk_kr_02'],
      stats: { str: 90, agi: 90, vit: 90, wil: 90, ins: 96, qi: 90 },
      skillLevel: 10,
      hp: 700,
    },
  },
  {
    id: 'element',
    label: '원소 술법전',
    desc: '화염 · 빙결 · 뇌전 · 강기',
    heroAge: 40,
    heroLevel: 7,
    heroStat: 60,
    heroSkills: ['sk_fn_01', 'sk_fn_02', 'sk_fn_03', 'sig_crimson_slash', 'sig_thunder_drop', 'sig_formless_qi'],
    heroWeaponGroup: 'BLADE',
    enemy: { name: '철산장군', title: '팔도 제일창', age: 44, ai: 'HEAVY', scale: 2.3, weapon: 'POLEARM', skills: ['sk_kr_05', 'sk_jp_05', 'sk_cn_06'] },
  },
  {
    id: 'unarmed',
    label: '맨손 권법전',
    desc: '권풍 · 발경 · 연환퇴',
    heroAge: 30,
    heroLevel: 6,
    heroStat: 50,
    heroSkills: ['sk_cn_01', 'sk_cn_05', 'sig_shatter_fist', 'sig_whirl_kicks', 'sk_we_04'],
    heroWeaponGroup: 'UNARMED',
    enemy: { name: '철장 곽노대', title: '표국 대표 무사', age: 38, ai: 'HEAVY', scale: 1.8, weapon: 'UNARMED', skills: ['sk_cn_01', 'sk_cn_02', 'sk_we_04'] },
  },
  {
    id: 'duel',
    label: '진검 · 노고수',
    desc: 'Lv.10 극의 · 진검결투 무대',
    heroAge: 63,
    heroLevel: 10,
    heroStat: 70,
    heroSkills: ['sig_issen', 'sig_behead', 'sig_mountain_split', 'sk_cn_03', 'sig_flash_draw'],
    heroWeaponGroup: 'BLADE',
    enemy: { name: '검마 혈영', title: '천하무적 검마', age: 50, ai: 'DUELIST', scale: 3.2, weapon: 'BLADE', skills: ['sk_jp_03', 'sk_cn_03', 'sk_kr_06'] },
    realDuel: true,
  },
];

function findSkill(id: string): Skill | null {
  const base = createBaseSkills().find((s) => s.id === id);
  if (base) return base;
  const sig = SIGNATURE_RECIPES.find((r) => r.result.id === id)?.result;
  const tpl = sig || BOOK_SKILL_TEMPLATES[id];
  return tpl ? { creator: '시험 무인', masteryLevel: 1, ...tpl, masteryExp: 0, imprintedTraits: [] } : null;
}

export function buildBattlePreview(preset: BattlePreviewPreset, country: CountryId, gender: Gender): { state: GameState; battle: BattleConfig } {
  const base = createNewGame(country, gender, '시험 무인', 20, 'EASY');
  const skills = preset.heroSkills
    .map(findSkill)
    .filter((s): s is Skill => !!s)
    .map((s) => ({ ...s, masteryLevel: preset.heroLevel, masteryExp: 0, imprintedTraits: s.imprintedTraits || [] }));
  const weapon =
    ALL_WEAPONS_CATALOG.filter((w) => w.group === preset.heroWeaponGroup).sort((a, b) => b.attack - a.attack)[preset.heroLevel >= 8 ? 0 : 2] ||
    base.weapons[0];
  const st = preset.heroStat;
  const state: GameState = {
    ...base,
    phase: 'BATTLE',
    sectName: '청류검문',
    sectNamed: true,
    age: preset.heroAge,
    year: 1750 + (preset.heroAge - 20),
    fame: preset.heroLevel * 120,
    health: 100,
    stats: { str: st, agi: st, vit: st, wil: st, ins: st + 6, qi: st },
    skills,
    equippedActiveIds: skills.filter((s) => !s.isPassive).map((s) => s.id),
    equippedPassiveIds: [],
    weapons: [{ ...weapon }],
    equippedWeaponId: weapon.id,
    battleTactic: 'BALANCED',
  };
  const e = preset.enemy;
  const battle = createBattleConfig(
    `preview_${preset.id}_${Date.now()}`,
    `미리보기 — ${preset.label}`,
    preset.desc,
    !!preset.realDuel,
    e.name,
    e.title,
    e.age,
    e.ai,
    e.scale,
    e.weapon,
    e.skills,
    { rewardMoney: 0, rewardFame: 0 }
  );
  return {
    state,
    battle: {
      ...battle,
      canUseDisciple: false,
      ...(e.stats ? { enemyStats: e.stats } : {}),
      ...(e.hp ? { enemyHp: e.hp } : {}),
      ...(e.skillLevel ? { enemySkills: battle.enemySkills.map((sk) => ({ ...sk, masteryLevel: e.skillLevel! })) } : {}),
    },
  };
}
