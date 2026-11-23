import React from 'react';
import { CountryId, Gender } from '../types/game';

export type PortraitRole =
  | 'HERO'
  | 'MERCHANT'
  | 'ELDER'
  | 'DISCIPLE'
  | 'DISCIPLE_F'
  | 'SPOUSE'
  | 'WESTERN'
  | 'BLACKSMITH'
  | 'RIVAL'
  | 'ENEMY'
  | 'OFFICER'
  | 'HERMIT';

interface Props {
  role: PortraitRole;
  country?: CountryId;
  age?: number;
  gender?: Gender;
  variantHint?: string; // 화자·인물 이름/직업으로 성별·직군 100% 정확 매칭!
  size?: number;
  active?: boolean;
}

// 명시적 여성 이름 사전 (제자 + 배우자 — 100% 정확한 성별 매칭!)
const FEMALE_NAMES = new Set([
  // 조선 제자·배우자
  '최연화', '정하늘', '윤소희', '조은별', '송지우', '허연', '정해', '이서윤', '이서연', '클라라',
  // 청나라 제자·배우자
  '임청하', '소옥란', '황영아', '매초풍', '당소월', '린수', '쑤메이', '진소월', '백연화',
  // 일본 제자·배우자
  '타카하시 유키', '아오이 카나', '나카무라 하루', '사쿠라 미오', '카에데', '아야메', '타케다 유키', '하루카',
]);

// 명시적 남성 배우자/인물 이름 사전
const MALE_NAMES = new Set([
  '김철수', '박진호', '이강산', '한도윤', '강태풍', '서민재', '배무영', '강무', '윤재현', '한석진',
  '진소룡', '왕대산', '장무기', '곽정우', '조자룡', '백운비', '유비홍', '진영', '조운', '헨리',
  '사토 켄지', '야마다 신지', '미야모토 렌', '후지타 고로', '이토 다이스케', '와타나베 료', '쇼타로', '료마', '빌럼',
]);

export function detectNpcGender(hint: string): 'FEMALE' | 'MALE' | 'UNKNOWN' {
  const clean = hint.trim();
  if (!clean) return 'UNKNOWN';

  // 1. 정확 이름 일치 우선
  for (const fn of FEMALE_NAMES) {
    if (clean.includes(fn)) return 'FEMALE';
  }
  for (const mn of MALE_NAMES) {
    if (clean.includes(mn)) return 'MALE';
  }

  // 2. 여성 명사/직군 키워드 (아낙, 여협, 어미, 의녀 등!)
  if (/(아낙|여인|부인|어머니|어미|할머니|노파|여협|여검|여무사|여식|딸|누이|소녀|의녀|기생|낭자|소저|아씨)/.test(clean)) {
    return 'FEMALE';
  }

  // 3. 남성 명사/직군 키워드
  if (/(아들|소년|청년|사내|영감|노인|아비|아버지|두목|왈패|산적|선원|서생|검객|무사|교관|장교|종사관|대장장이|농부|반장|토호|검서관|밀사|거상|나그네|도장주|도전자|노고수|선교사|통역관)/.test(clean)) {
    return 'MALE';
  }

  return 'UNKNOWN';
}

// 4×3 초상화 그리드 시트 파서 (총 24종: 영웅 12종[3국×남여×청년/노년] + NPC 12종!)
// grid_portraits_heroes_4x3.jpg:
//   Row 0 (KOREA): [0,0] 남청년 | [1,0] 여청년 | [2,0] 남노장 | [3,0] 여노장
//   Row 1 (CHINA): [0,1] 남청년 | [1,1] 여청년 | [2,1] 남노장 | [3,1] 여노장
//   Row 2 (JAPAN): [0,2] 남청년 | [1,2] 여청년 | [2,2] 남노장 | [3,2] 여노장
// grid_portraits_npcs_4x3.jpg:
//   Row 0: [0,0] 만물객 | [1,0] 이웃어르신 | [2,0] 청년제자 | [3,0] 여제자
//   Row 1: [0,1] 여성배우자/아낙 | [1,1] 남성문인/선비 | [2,1] 서양이방인(남) | [3,1] 대장장이(남)
//   Row 2: [0,2] 숙적/젊은검객(남) | [1,2] 왈패/산적(남) | [2,2] 관군장교(남) | [3,2] 은둔노고수(남)

function resolveGridCell(
  role: PortraitRole,
  country: CountryId,
  age: number,
  gender: Gender,
  variantHint = ''
): { src: string; col: number; row: number } {
  const heroSrc = '/assets/grid_portraits_heroes_4x3.jpg';
  const ageSrc = '/assets/grid_portraits_ages_4x3.jpg';
  const npcSrc = '/assets/grid_portraits_npcs_4x3.jpg';
  const cRow = country === 'CHINA' ? 1 : country === 'JAPAN' ? 2 : 0;

  // 주인공 4단계 연령 초상화 (소년 15~19 → 청년 20~34 → 중년 35~54 → 원로 55+!)
  if (role === 'HERO') {
    if (age < 20) {
      return { src: ageSrc, col: gender === 'FEMALE' ? 1 : 0, row: cRow };
    }
    if (age >= 55) {
      return { src: heroSrc, col: gender === 'FEMALE' ? 3 : 2, row: cRow };
    }
    if (age >= 35) {
      return { src: ageSrc, col: gender === 'FEMALE' ? 3 : 2, row: cRow };
    }
    return { src: heroSrc, col: gender === 'FEMALE' ? 1 : 0, row: cRow };
  }

  const hint = variantHint.trim();
  const detectedGender = detectNpcGender(hint);

  // ★ 1순위: 여성으로 명확히 판별된 NPC는 어떤 role로 들어와도 절대 남성 초상이 나오지 않도록 보장! ★
  if (role === 'DISCIPLE_F' || detectedGender === 'FEMALE') {
    if (/(노파|할머니|어미|노여협)/.test(hint) || age >= 55) {
      return { src: heroSrc, col: 3, row: cRow }; // 기품 있는 원로 여성
    }
    if (/(여협|여검|여무사|매초풍|당소월)/.test(hint)) {
      return { src: heroSrc, col: 1, row: hint.includes('당문') ? 1 : cRow }; // 무복 여협객!
    }
    if (/(아낙|여인|부인|어머니|의녀|여식|클라라|허연|정해|이서윤|린수|쑤메이|카에데|아야메)/.test(hint) || role === 'SPOUSE') {
      return { src: npcSrc, col: 0, row: 1 }; // 온화한 동양 여성 아낙/배우자
    }
    return { src: npcSrc, col: 3, row: 0 }; // 총명한 젊은 여제자
  }

  // ★ 2순위: 남성 / 고유 직군 NPC 정확 매칭 ★
  if (role === 'MERCHANT') return { src: npcSrc, col: 0, row: 0 };
  if (role === 'HERMIT' || /(노고수|은둔|도사|검선|검존|대사|장군|검호)/.test(hint)) return { src: npcSrc, col: 3, row: 2 };
  if (role === 'ELDER' || /(영감|노인|쌀가게|집주인|늙은 도장주)/.test(hint)) return { src: npcSrc, col: 1, row: 0 };
  if (role === 'OFFICER' || /(관군|포도청|교관|토벌|장교|종사관|집행관)/.test(hint)) return { src: npcSrc, col: 2, row: 2 };
  if (role === 'WESTERN' || /(서양|선교사|선원|앙리|잭|헨리|빌럼|유럽|통역)/.test(hint)) return { src: npcSrc, col: 2, row: 1 };
  if (role === 'BLACKSMITH' || /(대장장이|대장간)/.test(hint)) return { src: npcSrc, col: 3, row: 1 };
  if (/(검서관|밀사|토호|거상|문인|서생|상인|조운|쇼타로)/.test(hint)) return { src: npcSrc, col: 1, row: 1 };

  if (role === 'SPOUSE') {
    const spGender = detectedGender !== 'UNKNOWN' ? detectedGender : gender;
    if (age >= 55) {
      return { src: heroSrc, col: spGender === 'FEMALE' ? 3 : 2, row: cRow };
    }
    return spGender === 'MALE' ? { src: npcSrc, col: 1, row: 1 } : { src: npcSrc, col: 0, row: 1 };
  }

  if (role === 'RIVAL') {
    if (age >= 58) return { src: npcSrc, col: 3, row: 2 };
    return { src: npcSrc, col: 0, row: 2 };
  }

  if (role === 'ENEMY') {
    if (/(왈패|전당포|조직|산적|짐꾼|검귀)/.test(hint)) return { src: npcSrc, col: 1, row: 2 };
    if (/(검객|무사|사범|도전자|원수|후예)/.test(hint)) return { src: npcSrc, col: 0, row: 2 };
    if (/(농부|나그네|소년|구경꾼|대표)/.test(hint)) return { src: npcSrc, col: 2, row: 0 };
    return { src: npcSrc, col: 1, row: 2 };
  }

  // 기본 남성 문하생 / 청년
  return { src: npcSrc, col: 2, row: 0 };
}

// 시트별 실측 격자선(1152×864) 기준 순수 내부 초상화 영역 (나무 테두리·옆 칸 침범 0px, 1:1 비율 유지!)
const PORTRAIT_SHEET_GRID: Record<string, { w: number; h: number; xLines: number[]; yLines: number[]; pad: number }> = {
  '/assets/grid_portraits_heroes_4x3.jpg': {
    w: 1152,
    h: 864,
    xLines: [5, 295, 584, 872, 1146],
    yLines: [3, 295, 579, 863],
    pad: 10,
  },
  '/assets/grid_portraits_ages_4x3.jpg': {
    w: 1152,
    h: 864,
    xLines: [14, 301, 566, 871, 1138],
    yLines: [9, 296, 577, 852],
    pad: 12,
  },
  '/assets/grid_portraits_npcs_4x3.jpg': {
    w: 1152,
    h: 864,
    xLines: [2, 290, 579, 861, 1150],
    yLines: [4, 280, 563, 859],
    pad: 8,
  },
};

function computePortraitCropStyle(src: string, col: number, row: number): React.CSSProperties {
  const meta = PORTRAIT_SHEET_GRID[src];
  if (!meta) {
    return {
      backgroundImage: `url(${src})`,
      backgroundSize: '412% 312%',
      backgroundPosition: `${(col / 3) * 100}% ${(row / 2) * 100}%`,
      backgroundRepeat: 'no-repeat',
    };
  }
  const x0 = meta.xLines[col] + meta.pad;
  const x1 = meta.xLines[col + 1] - meta.pad;
  const y0 = meta.yLines[row] + meta.pad;
  const y1 = meta.yLines[row + 1] - meta.pad;
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);
  const side = Math.min(cw, ch);
  const sx0 = (x0 + x1) * 0.5 - side * 0.5;
  const sy0 = (y0 + y1) * 0.5 - side * 0.5;
  const sizeX = (meta.w / side) * 100;
  const sizeY = (meta.h / side) * 100;
  const posX = (sx0 / (meta.w - side)) * 100;
  const posY = (sy0 / (meta.h - side)) * 100;

  return {
    backgroundImage: `url(${src})`,
    backgroundSize: `${sizeX.toFixed(2)}% ${sizeY.toFixed(2)}%`,
    backgroundPosition: `${posX.toFixed(2)}% ${posY.toFixed(2)}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export const PixelPortrait: React.FC<Props> = ({
  role,
  country = 'KOREA',
  age = 22,
  gender = 'MALE',
  variantHint = '',
  size = 64,
  active = true,
}) => {
  const cell = resolveGridCell(role, country, age, gender, variantHint);
  const isOldHero = role === 'HERO' && age >= 55;
  const cropStyle = computePortraitCropStyle(cell.src, cell.col, cell.row);

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative shrink-0 border-2 overflow-hidden bg-[#16100b] transition-all duration-150 ${
        active
          ? 'border-[#f2c96b] shadow-[0_0_12px_rgba(242,201,107,0.35)]'
          : 'border-[#523b26] opacity-45 grayscale-[45%]'
      }`}
    >
      <div
        role="img"
        aria-label={role}
        className="w-full h-full pixel-canvas"
        style={cropStyle}
      />
      {isOldHero && (
        <div className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-center text-[#fde68a] py-0.5 leading-none">
          원로
        </div>
      )}
    </div>
  );
};
