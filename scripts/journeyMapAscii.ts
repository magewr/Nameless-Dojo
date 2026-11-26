// 무사수행 지도를 글자 그림과 JSON으로 뽑는다.
//   npm run map:ascii -- KR_JIRI              → 그 지역 바깥 지도의 칸 배치 (journeyMapLayouts.ts에 붙여 넣을 꼴)
//   npm run map:ascii -- jiri_valley          → 그 구역 지도의 칸 배치 (journeyAreaLayouts.ts에 붙여 넣을 꼴)
//   npm run map:ascii -- --json > m.json       → 모든 지역의 바깥 지도 (scripts/journey_map_guides.py의 입력)
//   npm run map:ascii -- --areas-json > a.json → 모든 구역의 생성 배치 (안내도 그리기·칸 맞춤 도구의 입력)
import { getJourneyMap, JourneyMap, mapToLayout } from '../src/data/journeyMap';
import { JOURNEY_REGIONS } from '../src/data/journeyRegions';
import { areaShape, getAreaMap, getGeneratedAreaMap, legRegion } from '../src/data/journeyAreas';

const args = process.argv.slice(2);

function farthest(m: JourneyMap) {
  let best = { x: m.entrance.x, y: m.entrance.y, d: 0 };
  for (let i = 0; i < m.w * m.h; i++) {
    if (m.reach[i] && m.walkDist[i] !== 65535 && m.walkDist[i] > best.d) best = { x: i % m.w, y: Math.floor(i / m.w), d: m.walkDist[i] };
  }
  return best;
}

if (args.includes('--json')) {
  const out = JOURNEY_REGIONS.map((r) => {
    const m = getJourneyMap(r.id);
    return {
      id: r.id,
      name: r.name,
      w: m.w,
      h: m.h,
      tiles: m.tiles,
      zone: Array.from(m.zone),
      entrance: m.entrance,
      gates: m.gates,
      zones: m.zones.map((z) => ({ ...z, name: r.legs.find((l) => l.id === z.legId)?.name || z.legId })),
    };
  });
  console.log(JSON.stringify(out));
} else if (args.includes('--areas-json')) {
  const out = JOURNEY_REGIONS.flatMap((r) =>
    r.legs.map((leg) => {
      // 그림에 맞추기 전의 생성 배치 — 안내도와 칸 맞춤 도구는 늘 이것에서 출발한다
      const m = getGeneratedAreaMap(leg.id);
      let reach = 0;
      for (let i = 0; i < m.w * m.h; i++) if (m.reach[i]) reach++;
      return {
        id: leg.id,
        regionId: r.id,
        region: r.name,
        name: leg.name,
        terrain: leg.terrain,
        shape: areaShape(leg.terrain),
        w: m.w,
        h: m.h,
        tiles: m.tiles,
        entrance: m.entrance,
        goal: farthest(m),
        reach,
      };
    })
  );
  console.log(JSON.stringify(out));
} else {
  const ids = args.length ? args : JOURNEY_REGIONS.map((r) => r.id);
  ids.forEach((id) => {
    const r = JOURNEY_REGIONS.find((x) => x.id === id);
    if (r) {
      const m = getJourneyMap(r.id);
      console.log(`  ${r.id}: [ // ${r.name} ${m.w}×${m.h}, 출발점 (${m.entrance.x}, ${m.entrance.y})`);
      mapToLayout(m).forEach((row) => console.log(`    '${row}',`));
      console.log('  ],');
      return;
    }
    const found = legRegion(id);
    if (found) {
      const m = getAreaMap(id);
      console.log(`  ${id}: [ // ${found.region.name} · ${found.leg.name} ${m.w}×${m.h}, 출구 (${m.entrance.x}, ${m.entrance.y})`);
      mapToLayout(m).forEach((row) => console.log(`    '${row}',`));
      console.log('  ],');
      return;
    }
    console.error(`모르는 지역·구역: ${id}`);
  });
}
