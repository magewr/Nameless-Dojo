// 무사수행 지역 지도를 글자 그림과 JSON으로 뽑는다.
//   npm run map:ascii -- KR_JIRI        → 그 지역의 칸 배치 (journeyMapLayouts.ts에 붙여 넣을 꼴)
//   npm run map:ascii -- --json > m.json → 모든 지역 (scripts/journey_map_guides.py의 입력)
import { getJourneyMap, mapToLayout } from '../src/data/journeyMap';
import { JOURNEY_REGIONS } from '../src/data/journeyRegions';

const args = process.argv.slice(2);
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
      zones: m.zones.map((z) => ({ ...z, name: r.legs.find((l) => l.id === z.legId)?.name || z.legId })),
    };
  });
  console.log(JSON.stringify(out));
} else {
  const ids = args.length ? args : JOURNEY_REGIONS.map((r) => r.id);
  ids.forEach((id) => {
    const r = JOURNEY_REGIONS.find((x) => x.id === id);
    if (!r) {
      console.error(`모르는 지역: ${id}`);
      return;
    }
    const m = getJourneyMap(r.id);
    console.log(`  ${r.id}: [ // ${r.name} ${m.w}×${m.h}, 출발점 (${m.entrance.x}, ${m.entrance.y})`);
    mapToLayout(m).forEach((row) => console.log(`    '${row}',`));
    console.log('  ],');
  });
}
