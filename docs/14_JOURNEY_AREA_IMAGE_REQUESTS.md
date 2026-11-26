# 14. 무사수행 구역 지도 이미지 요청서

> 한 줄 요약: 무사수행 필드를 90년대 RPG처럼 **바깥 지도(지역 전도) + 구역 지도** 두 겹으로 바꿨습니다. 지난번에 받은 지역 그림 9장(`px_jr_map_*`)은 바깥 지도로 그대로 씁니다. 이번에 필요한 것은 구역(땅) 53곳의 **구역 지도 그림**입니다. 화면 여러 장 크기이고, 산은 세로로 길어 지그재그로 오릅니다. 그림이 없는 구역은 코드로 그린 땅으로 이미 돌아가므로, 한 지역씩 천천히 채워도 됩니다.

- 기준: 2026-11-26, `feat/elder-life`.
- 화풍 기준은 지난번과 같습니다. `px_dojo_grand_map.jpg`와 이미 받은 `px_jr_map_*` 그림들입니다. 높은 각도의 탑다운 3/4 뷰, 또렷한 외곽, 부드러운 명암, 큼직한 픽셀입니다.

| 우선순위 | 장수 | 파일 | 보이는 자리 |
|---|---|---|---|
| P1 | 6 | 지리산 구역 6곳 `px_jr_area_jiri_*.jpg` | 먼저 한 지역을 끝까지 맞춰 보고, 화풍과 크기를 정합니다 |
| P2 | 47 | 나머지 8개 지역의 구역 `px_jr_area_{구간 id}.jpg` | 지역별로 6곳(교토·나라는 5곳) |
| P3 | 선택 | `px_jr_area_{구간 id}_{summer,autumn,winter}.jpg` | 그 계절의 구역 지도. 없으면 코드가 계절 빛을 입힙니다 |

---

## 어떻게 바뀌었나

- **바깥 지도:** 지역 그림 위를 걸으며 땅과 땅 사이를 오갑니다. 사건은 놓이지 않고, 땅마다 **붉은 깃발(입구)**이 하나 있습니다. 깃발을 밟으면 그 땅의 구역 지도로 들어갑니다. 길 위의 돌발 사건(매복·맹수)은 바깥 지도에서도 일어납니다.
- **구역 지도:** 화면에 가로 스무남은 칸만 보이도록 바짝 다가서서 걷습니다. 아직 둘러보지 않은 곳은 빛을 빼고 흐리게 가려 둡니다.
  - 주막·사람·시대의 현장은 길가에 보입니다.
  - 고수·보물·사당·절경은 **막다른 산허리, 숲속 빈터, 벼랑 너머에 숨어 있다가 두 칸 안으로 다가가야 드러납니다.**
- **출구:** 구역 지도의 출구는 늘 **맨 아래 가운데**입니다. 그 칸에서 아래로 걸어 나가면 바깥 지도의 입구로 돌아갑니다.
- **날수:** 바깥 지도의 한 걸음은 하룻길의 절반쯤이고, 구역 지도의 한 걸음은 하루의 열세 분의 일쯤입니다. 한 계절(90일)에 구역 서너 곳을 둘러보고 사건 열 개 남짓을 만납니다(전과 같은 밀도).

## 구역 지도의 세 가지 꼴

| 꼴 | 칸 | 비율 | 권장 크기 | 지형 |
|---|---|---|---|---|
| 세로 | 36×64 | 9:16 | 1152×2048 | 산(MOUNTAIN), 고개(PASS) — 아래 출구에서 정상까지 벼랑 띠 사이를 지그재그로 오른다 |
| 정사각 | 48×48 | 1:1 | 1536×1536 | 절(TEMPLE), 숲(FOREST) — 돌계단 끝의 전각 마당 / 오솔길 끝마다 빈터 |
| 가로 | 64×36 | 16:9 | 2048×1152 | 마을(TOWN), 길(ROAD), 강(RIVER), 바다(COAST) |

권장 크기는 칸 하나가 32화소인 크기입니다. 비율만 맞으면 더 작아도 됩니다. 예를 들어 세로는 864×1536이나 1080×1920도 되고, 코드가 늘려서 깝니다. 다만 너무 작으면 바짝 다가선 화면에서 뭉개집니다. 긴 변이 1536화소 이상이면 좋습니다.

## 작업 순서

1. `docs/journey_area_guides/guide_{구간 id}_labeled.png`를 열어 출구(▼), 가장 깊은 곳(★), 구역 이름을 봅니다.
2. 생성 도구에 참조 이미지를 넣습니다.
   - `docs/journey_area_guides/guide_{구간 id}.png`: 배치 안내도. 글자가 없는 판입니다.
   - `public/assets/px_jr_map_{지역}.jpg`: 이미 받은 그 지역의 바깥 지도. 같은 땅으로 보이게 합니다.
   - (있으면) `public/assets/px_dojo_grand_map.jpg`: 화풍 기준.
3. 아래 공통 프롬프트 앞에 지형 프롬프트와 구역 한 줄을 붙여 넣고 만듭니다.
4. 비율을 맞춰 `public/assets/px_jr_area_{구간 id}.jpg`로 넣고 알려 주세요. 지역 하나(6장)씩 모아서 알려 주셔도 됩니다.
5. 제가 그림을 보고 칸 배치(`src/data/journeyAreaLayouts.ts`)를 그림에 맞춥니다. **칸이 그림에 맞추므로 안내도와 달라도 됩니다.** 길이 더 굽거나, 빈터가 다른 데 있거나, 벼랑 층수가 달라도 괜찮습니다.

## 그릴 때 지킬 것

- **출구:** 맨 아래 가장자리 가운데로 길 하나가 화면 밖으로 나가야 합니다. 바깥 지도로 돌아가는 길입니다.
- **가장자리:** 지도 둘레는 넘어갈 수 없게 둘러쌉니다. 봉우리, 벼랑, 빽빽한 숲, 바다로 막고, 출구만 열어 둡니다.
- **막다른 곳을 살릴 것:** 숨은 사건은 큰길에서 벗어난 곳에 놓입니다. 오솔길 끝의 빈터, 벼랑 아래 바위굴 입구, 산허리 끝의 작은 평지, 숲속 못가, 섬으로 이어진 모랫길 같은 곳입니다. 그림에 이런 곳이 너덧 군데 있으면 좋습니다. 그 자리에 무엇이 있는지(상자, 비석, 사람)는 그리지 않고 **빈자리로** 둡니다. 코드가 그 위에 얹습니다.
- **산은 오르는 맛이 나게(세로 지도):** 아래는 숲과 개울, 위로 갈수록 바위와 운무입니다. 층마다 바위 벼랑 띠가 가로로 막고, 돌계단·나무 사다리·쇠사슬 길로 한 군데씩만 뚫려 있습니다. 고개(PASS)는 벼랑에 박은 **판자 잔도**가 있습니다. 맨 위에 정상 마루가 있습니다.
- **칸 크기:** 권장 크기에서 칸 하나는 32화소입니다. 길 폭은 칸 하나, 집 한 채는 칸 둘에서 셋, 나무 한 그루는 칸 하나 정도로 그립니다. 주인공이 칸 하나 크기로 걷습니다.
- **비워 둘 것:** 사람, 동물, 글자, 테두리, 나침반은 넣지 않습니다.
- **빛:** 해는 왼쪽 위, 그림자는 오른쪽 아래입니다. 기본 그림은 늦은 봄 한낮입니다.

## 공통 프롬프트

지형 프롬프트와 구역 한 줄 뒤에 붙입니다.

```text
Top-down RPG local area map seen from a high three-quarter angle, in the style of a hand-crafted 1990s–2010s 2D JRPG town or dungeon map, matching the attached region map painting and dojo map: detailed pixel art with clean readable shapes, soft painterly shading, crisp visible square pixels, rich but balanced colors, late spring daylight from the upper left with soft shadows to the lower right. This is a zoomed-in walkable area, not a world map: everything is drawn at character scale, one tile is 32 pixels, dirt paths one tile wide, houses two to three tiles wide, trees about one tile wide. Follow the attached layout guide image for where paths, cliffs, water, buildings and dense woods go. The guide's flat colors are only a plan: light green = open grass, olive = grassy slope, yellow = rice paddies, mid green dots = open woodland you can walk through, very dark green = dense impassable forest, grey triangles = impassable peaks, grey hatched = rock cliff, blue = stream or lake, dark blue = sea, beige = sand, red squares = houses, purple = temple or shrine hall, tan lines = dirt roads, thin pale lines = narrow footpaths, brown boxes = wooden bridges or plank walkways. Keep small secluded empty spots at the ends of side paths. The map is enclosed by impassable terrain on all sides except one dirt road that leaves the bottom edge at the center. No people, no animals, no text, no letters, no UI, no border, no frame, no watermark.
```

네거티브를 받는 도구라면 이것을 넣습니다: `people, characters, animals, text, letters, labels, map legend, compass, border, frame, world map, tiny scale, blurry, smooth vector art, 3D render, photo`.

## 지형 프롬프트

**세로 · 산(MOUNTAIN)**
```text
Tall vertical mountain climb map. At the bottom, pine and oak forest with a clear stream crossed by a small wooden bridge near the bottom-center entrance. Going up, the slope is cut by horizontal bands of grey rock cliffs, one above another, each passable only at one gap with stone steps or a ladder, so the trail zigzags left and right across grassy terraces. Wind-bent pines, boulders and patches of mist higher up. At the very top, a small open summit ridge surrounded by jagged peaks.
```

**세로 · 고개(PASS)**
```text
Tall vertical mountain pass map. Steep grey rock everywhere, narrow ledges between horizontal cliff bands, the trail zigzagging upward with wooden plank walkways bolted to the cliff faces and iron chains as handrails at each crossing. Sparse pines in cracks, scree slopes, a few hidden ledges and cave mouths off the trail. A windy saddle at the top.
```

**정사각 · 절(TEMPLE)**
```text
Square temple grounds map. From the bottom-center entrance a stone-paved path winds up through old forest to a walled temple courtyard near the top: a large main hall with upturned tiled eaves, smaller side halls, monk quarters and a small pagoda. Side footpaths branch into the woods to a lotus pond with a pavilion, a hermit's hut, and a rock garden in secluded clearings. Dense forest walls between them.
```

**정사각 · 숲(FOREST)**
```text
Square deep forest map. Dense, dark, impassable woods with a main dirt path from the bottom-center entrance winding toward a clearing near the top, and narrow footpaths branching to small secluded clearings: a mossy pond, an old hut, a ring of boulders. A stream runs down one side under a log bridge. Light falls in shafts into the clearings.
```

**가로 · 마을(TOWN)**
```text
Wide town map. A main street runs left to right across the middle, joined from the bottom-center entrance; side alleys run up and down from it, lined closely with houses, shops and courtyards; a small market square near the center; a walled government office or shrine compound at the top of one alley. Outside the houses, rice paddies and dense groves fill the edges.
```

**가로 · 길(ROAD)**
```text
Wide countryside highway map. A dirt highway meanders left to right across the map, joined from the bottom-center entrance, passing a roadside inn, a small hamlet and fields; a stream crosses it under a wooden bridge; footpaths lead off into groves and up small hills to secluded spots. Dense woods and ridges along the edges.
```

**가로 · 강(RIVER)**
```text
Wide river map. A broad river flows left to right across the middle with reeds and sandbars on its banks and two wooden bridges across it. A riverside path and a small village on the near (bottom) bank, joined from the bottom-center entrance; on the far (top) bank a path to a pavilion on a low hill. Dense woods along the edges, side paths to quiet spots by the water.
```

**가로 · 바다(COAST)**
```text
Wide coastal map. The sea fills the top of the map with an irregular shoreline of sandy coves and dark rock cliffs; a small island with a few pines is joined to the beach by a sandbar. A coastal path runs left to right above the beach with a fishing hamlet, joined from the bottom-center entrance; a sea cave hides in the cliffs. Pine woods and hills inland toward the bottom.
```

## 구역 목록

`구간 id`가 파일 이름입니다. 예: `px_jr_area_jiri_peak.jpg`. 구역 한 줄은 지형 프롬프트 앞에 붙입니다.

### P1 · 지리산 (조선)

| 구간 id | 구역 | 꼴 | 구역 한 줄 |
|---|---|---|---|
| `jiri_gate` | 함양 장터 어귀 | 가로 · 마을 | Hamyang market town at the foot of Jirisan, Joseon Korea: thatched and tiled hanok houses with stone walls, a busy market street with stalls and a tavern. |
| `jiri_valley` | 칠선계곡 | 가로 · 강 | Chilseon valley, Jirisan: a clear rocky mountain river with pools and small waterfalls between forested slopes, a hermit's pavilion on the far bank. |
| `jiri_burnfield` | 화전민 마을 | 정사각 · 숲 | A slash-and-burn farming hamlet on a burned hillside in deep Jirisan pine forest: blackened stumps, small thatched huts, patches of millet. |
| `jiri_hermit` | 청학동 가는 길 | 정사각 · 숲 | The misty forest path to Cheonghak-dong, a hidden village of recluses: ancient pines, mossy rocks, fog between the trees. |
| `jiri_bandit` | 반야봉 너덜길 | 세로 · 고개 | Banyabong scree trail: loose grey rubble slopes and cliffs, a bandit watch-fire camp on a ledge near the top. |
| `jiri_peak` | 천왕봉 | 세로 · 산 | Cheonwangbong, the highest peak of Jirisan: grassy ridges above a sea of clouds, a small stone altar on the summit. |

### P2 · 금강산 (조선)

| 구간 id | 구역 | 꼴 | 구역 한 줄 |
|---|---|---|---|
| `gg_danbal` | 단발령 | 세로 · 고개 | Danballyeong pass: a pine-covered ridge road climbing to a windy saddle with a stone cairn and a view of distant white peaks. |
| `gg_jangan` | 장안사 계곡 | 정사각 · 절 | Jangansa, an old Buddhist temple in a forested valley of the Diamond Mountains. |
| `gg_coast` | 해금강 바닷길 | 가로 · 바다 | Haegeumgang coast: white surf, sea stacks of pale granite, a fishing hamlet, a shipwreck on the rocks. |
| `gg_manpok` | 만폭동 | 가로 · 강 | Manpokdong, the valley of ten thousand waterfalls: cascades and jade-green pools between granite slabs. |
| `gg_outer` | 외금강 옥류동 | 세로 · 산 | Okryudong in Outer Geumgang: a jade stream climbing past granite spires to the Guryong waterfall at the top. |
| `gg_inner` | 비로봉 길 | 세로 · 산 | The trail to Birobong, highest peak of Geumgangsan: countless sharp pale granite spires. |

### P2 · 의주대로 (조선)

| 구간 id | 구역 | 꼴 | 구역 한 줄 |
|---|---|---|---|
| `gs_hongje` | 홍제원 역참 | 가로 · 길 | Hongjewon post station on the royal road north: an inn for envoys, stables, a stone milestone. |
| `gs_gaeseong` | 송도(개성) 장시 | 가로 · 마을 | Songdo (Gaeseong) market town: merchant houses, ginseng shops and warehouses. |
| `gs_market` | 수원 가는 샛길 | 가로 · 길 | A side road toward Suwon: fields and a new stone fortress wall under construction. |
| `gs_pyongyang` | 평양 대동문 | 가로 · 마을 | Pyongyang by the Daedong gate: a big walled city street along the Daedong river. |
| `gs_myohyang` | 묘향산 보현사 | 정사각 · 절 | Bohyeonsa temple on Myohyangsan, where warrior monks once trained. |
| `gs_jeongju` | 정주성과 청천강 | 가로 · 강 | Jeongju fortress town by the Cheongcheon river: walls, a ferry landing, tense guard posts. |

### P2 · 화산 (명·청)

| 구간 id | 구역 | 꼴 | 구역 한 줄 |
|---|---|---|---|
| `hs_yuquan` | 옥천원 산문 | 정사각 · 절 | Yuquanyuan Taoist temple gate at the foot of Mount Hua: red pillars, an inn for pilgrims. |
| `hs_qianchi` | 천척당 | 세로 · 고개 | Qianchizhuang, the thousand-foot stair: a steep stone stairway cut into a cliff with iron chains. |
| `hs_village` | 화음현 마을 | 가로 · 마을 | Huayin county town below Mount Hua: grey-tiled houses, a yamen, a market. |
| `hs_north` | 북봉 운대 | 세로 · 산 | North Peak of Mount Hua above the clouds: a small Taoist hall on the summit. |
| `hs_plank` | 장공잔도 | 세로 · 고개 | The Changkong plank walk: single wooden planks bolted to a sheer cliff above a bottomless drop. |
| `hs_south` | 남봉 낙안봉 | 세로 · 산 | South Peak Luoyan, highest of Mount Hua: wind-bent pines on granite, a summit pavilion. |

### P2 · 강남 운하 (명·청)

| 구간 id | 구역 | 꼴 | 구역 한 줄 |
|---|---|---|---|
| `jn_yangzhou` | 양주 운하 부두 | 가로 · 강 | Yangzhou Grand Canal wharf: salt merchants' mansions, boats, an escort agency banner. |
| `jn_suzhou` | 소주 원림 골목 | 가로 · 마을 | Suzhou garden alleys: whitewashed walls, canals, teahouses, a classical garden. |
| `jn_biaoju` | 표국 호송길 | 가로 · 길 | The escort road: a flat road between rice fields and mulberry groves where convoys pass. |
| `jn_taihu` | 태호 갈대밭 | 가로 · 강 | Lake Tai reed marshes: a sea of reeds with hidden channels where water bandits lurk. |
| `jn_hangzhou` | 항주 서호 | 가로 · 마을 | Hangzhou by West Lake: willows, a causeway, lakeside pavilions. |
| `jn_lingyin` | 영은사 비래봉 | 정사각 · 절 | Lingyin temple and Feilai peak: carved Buddha grottoes in limestone. |

### P2 · 호광·사천 산지 (명·청)

| 구간 id | 구역 | 꼴 | 구역 한 줄 |
|---|---|---|---|
| `hg_xiangyang` | 양양 성 밖 | 가로 · 마을 | Outside Xiangyang city walls: refugee tents, a soldiers' checkpoint, a rough market. |
| `hg_refugee` | 유민 산채 골짜기 | 정사각 · 숲 | A forest valley where displaced refugees built a stockade village. |
| `hg_wudang` | 무당산 신도 | 정사각 · 절 | The Wudang pilgrim way: Taoist halls along a forest stair. |
| `hg_miao` | 묘강 경계 | 정사각 · 숲 | The Miao frontier: humid jungle forest, stilt houses, mist. |
| `hg_daba` | 대파산 고개 | 세로 · 고개 | Daba mountain pass: rough cliffs where bears and bandits live. |
| `hg_jinding` | 무당산 금정 | 세로 · 산 | The Golden Summit of Wudang: a bronze hall above the clouds. |

### P2 · 도카이도 (에도)

| 구간 id | 구역 | 꼴 | 구역 한 줄 |
|---|---|---|---|
| `tk_nihonbashi` | 니혼바시~시나가와 | 가로 · 마을 | Edo from Nihonbashi to Shinagawa: wooden machiya shops, a bridge, inns. |
| `tk_hakone` | 하코네 관문 | 세로 · 고개 | Hakone checkpoint pass: a stone-paved road climbing through cedar forest to a barrier gate. |
| `tk_coast` | 사타 고개 해안 | 가로 · 바다 | Satta pass coast: cliffs above Suruga bay with Mount Fuji in the distance. |
| `tk_fuji` | 스루가 후지 들판 | 가로 · 길 | Suruga plain below Mount Fuji: the Tokaido road through fields and pine rows. |
| `tk_oi` | 오이강 나루 | 가로 · 강 | The Oi river crossing: a wide shallow river with porters' landing and no bridge. |
| `tk_dojo` | 나고야 도장 거리 | 가로 · 마을 | Nagoya castle town street of sword dojos. |

### P2 · 교토·나라 (에도)

| 구간 id | 구역 | 꼴 | 구역 한 줄 |
|---|---|---|---|
| `ky_sanjo` | 산조 대교 | 가로 · 마을 | Kyoto by the Sanjo great bridge over the Kamo river: tea houses and inns. |
| `ky_gion` | 기온 신사 거리 | 정사각 · 절 | Gion shrine quarter: vermilion torii, stone lanterns, a Shinto shrine. |
| `ky_nara` | 나라 고찰길 | 정사각 · 절 | Old Nara temple road: a great wooden hall and a five-storied pagoda. |
| `ky_kurama` | 구라마산 삼나무 숲 | 정사각 · 숲 | Kurama mountain cedar forest: giant roots across the path, a tengu legend. |
| `ky_yagyu` | 야규 마을 | 정사각 · 숲 | Yagyu village in wooded hills: a sword school and a split boulder. |

### P2 · 규슈·나가사키 (에도)

| 구간 id | 구역 | 꼴 | 구역 한 줄 |
|---|---|---|---|
| `ks_nagasaki` | 나가사키 항구 | 가로 · 바다 | Nagasaki harbor: warehouses, junks and a Dutch ship at anchor. |
| `ks_dejima` | 데지마 앞 바다 | 가로 · 바다 | The bay off Dejima: the fan-shaped trading island, small boats. |
| `ks_unzen` | 운젠 지옥 | 세로 · 산 | Unzen hells: steaming volcanic vents and sulfur pools on a mountainside. |
| `ks_satsuma` | 사쓰마 가고시마 | 가로 · 마을 | Kagoshima, Satsuma castle town, with Sakurajima smoking across the bay. |
| `ks_sakurajima` | 사쿠라지마 해안 | 가로 · 바다 | Sakurajima shore: black volcanic sand and lava rocks. |
| `ks_kirishima` | 기리시마 신궁 | 정사각 · 절 | Kirishima shrine in cedar forest below volcanic peaks. |

## 받은 그림 (2026-11-26)

53장이 모두 들어왔습니다. 크기는 세로 720×1280, 가로 1280×720, 정사각 1024×1024로, 칸 하나가 약 20화소입니다. 바짝 다가선 화면에서는 3.5배쯤 커져 조금 뭉툭합니다. 더 또렷하게 하려면 같은 그림을 권장 크기(칸당 32화소)로 다시 뽑거나 2배로 키워 넣으면 됩니다. 칸 배치는 바뀌지 않습니다.

칸 배치는 `scripts/journey_area_fit.py`로 그림에 맞췄습니다. 그림은 안내도를 보고 그렸으므로 안내도를 「대체로 맞는 정답」으로 삼고, 칸마다 그림의 빛깔·결을 읽는 분류기를 53장 전체에 걸쳐 가르쳤습니다. 분류기는 안내도로 배운 뒤 그림 쪽으로 고친 배치로 다시 배우기를 세 번 했습니다.
- **막힌 곳:** 우거진 숲, 벼랑, 물, 집을 그림이 있는 자리로 옮겼습니다. 사전 확률은 안내도의 그 칸과 둘레 5×5에 있던 것입니다.
- **길:** 그림마다 길 빛깔(그늘진 숲길, 산의 나무 계단과 잔도 포함)을 배워 그림의 길 위로 다시 그었습니다.
- **마지막 손질:** 가장자리를 막고, 출구에서 닿지 않는 큰 빈터에는 짧은 오솔길을 냈습니다.

그림을 바꾸거나 새로 넣으면 다시 돌립니다. 다른 구역의 배치는 건드리지 않습니다.

```bash
npm run -s map:ascii -- --areas-json > /tmp/areas.json
```

```bash
python3 scripts/journey_area_fit.py /tmp/areas.json --overlay /tmp/fit jiri_peak
```

`/tmp/fit/<구간 id>.jpg`에서 결과를 그림 위에 겹쳐 볼 수 있습니다.

| 색 | 뜻 |
|---|---|
| 주황 점 | 길 |
| 붉은색 | 벼랑·봉우리 |
| 보라 | 우거진 숲 |
| 빨강 | 집 |
| 파랑 | 물 |
| 분홍 | 출구에서 닿지 않는 칸 |

자동으로 맞춘 뒤 네 곳은 손으로 고쳤습니다. 이 네 곳은 도구를 다시 돌리면 손질이 사라지니, 다시 돌리지 말고 배치를 직접 고칩니다.
- `gg_danbal`(단발령): 그림이 안내도와 전혀 다른 나무 계단길입니다. 출구부터 정상 돌탑 앞까지 계단을 칸으로 따라 그렸습니다.
- `jn_suzhou`(소주): 붉은 벽돌 큰길이 집으로 읽혀 막혀 있던 것을 열었습니다. 흰 벽 집과 위쪽 전각은 막았습니다.
- `gs_hongje`(홍제원): 초가 열한 채, 비석, 역참 본채를 막았습니다.
- `hg_miao`(묘강): 풀빛 오솔길 다섯 줄과 개울을 건너는 다리 둘을 열었습니다. 집, 못, 큰 바위는 막았습니다.

`--areas-json`은 그림에 맞추기 전의 생성 배치(안내도와 같은 것)를 내보내므로, 몇 번을 다시 돌려도 늘 같은 바탕에서 출발합니다.

## 넣은 다음 확인할 것

- 아래 가운데 출구로 길이 이어지는가.
- 둘레가 막혀 있는가. 출구 말고 화면 밖으로 새는 길이 없는가.
- 막다른 빈터가 너덧 군데 있는가.
- 산·고개 그림은 아래에서 위로 오르는 길이 한 줄로 읽히는가.

## 안내도 다시 그리기

생성기의 지도 모양이 바뀌면 안내도를 다시 그립니다. Pillow가 필요합니다(`pip install pillow`).

```bash
npm run -s map:ascii -- --areas-json > /tmp/areas.json
python3 scripts/journey_map_guides.py --areas /tmp/areas.json docs/journey_area_guides
```

한 구역만 다시 그리려면 끝에 구간 id를 붙입니다(`... docs/journey_area_guides jiri_peak`). 지금 칸 배치를 글자로 보려면 `npm run map:ascii -- jiri_peak`입니다.
