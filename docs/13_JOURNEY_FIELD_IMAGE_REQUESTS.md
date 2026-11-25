# 13. 무사수행 필드 이미지 요청서

> 한 줄 요약: 무사수행 필드를 도장 마당(`px_dojo_grand_map.jpg`)처럼 **지역마다 한 장으로 그린 지도 그림** 위에서 걷게 바꿉니다. 필요한 것은 지역 지도 9장이 먼저이고, 계절 그림, 지역 표제, 지도 바깥 배경은 그다음입니다. 코드는 이미 이 파일들을 부르고 있어서 `public/assets`에 넣으면 바로 나옵니다. 그림이 없는 지역은 지금처럼 코드로 그린 도트 땅을 씁니다.

- 기준: 2026-11-25, `feat/elder-life`.
- 화풍 기준은 `px_dojo_grand_map.jpg`입니다. 높은 각도의 탑다운 3/4 뷰, 또렷한 외곽, 부드러운 명암, 큼직한 픽셀이 보이는 2010년 무렵 2D RPG 맵 느낌입니다. 생성 도구가 참조 이미지를 받으면 이 그림을 늘 같이 넣습니다.

| 우선순위 | 장수 | 파일 | 보이는 자리 |
|---|---|---|---|
| P1 | 9 | `px_jr_map_{지역}.jpg` | 무사수행 필드 전체. 봄 그림이기도 합니다 |
| P2 | 최대 27 | `px_jr_map_{지역}_{summer,autumn,winter}.jpg` | 그 계절의 필드. P1 그림을 계절만 바꿔 고친 것 |
| P3 | 9 | `px_jr_region_{지역}.jpg` | 무사수행 첫날 3초 동안 뜨는 지역 표제 카드 |
| P4 | 3 | `px_jr_field_backdrop_{kr,cn,jp}.jpg` | 지도가 화면보다 작을 때 지도 바깥(큰 화면, 전도 [M]) |

파일 이름의 지역은 소문자 id입니다: `kr_jiri`, `kr_geumgang`, `kr_gwanseo`, `cn_huashan`, `cn_jiangnan`, `cn_huguang`, `jp_tokaido`, `jp_kyoto`, `jp_kyushu`.

---

## 왜 그림 한 장 지도인가

지금까지 필드는 16×16 도트 칸을 코드로 칠했습니다. 손을 더 대도 잡음으로 칠한 땅과 작은 사물이 반복되는 「만들어 낸 티」가 남습니다. 2010년 무렵 2D RPG(쯔꾸르 VX Ace 시절의 패럴랙스 매핑 등)의 예쁜 맵은 대개 맵 한 장을 통째로 그리고, 그 위에 걸을 수 있는 칸만 따로 표시하는 방식이었습니다. 도장 마당이 이미 이 방식이고 결과가 좋으므로 필드도 같은 길로 갑니다.

- 그림: 지역 하나를 한 장에 다 그립니다. 땅, 길, 물, 나무, 집, 산이 모두 그림입니다.
- 칸: 걷기, 날수, 사건 배치는 지금처럼 보이지 않는 칸(지리산 기준 30×22) 위에서 돕니다. 그림이 들어오면 제가 그림을 보고 칸 배치(`src/data/journeyMapLayouts.ts`)를 그림에 맞춥니다. **그림이 칸에 맞추는 것이 아니라 칸이 그림에 맞춥니다.** 그래서 안내도와 조금 달라도 괜찮습니다.
- 위에 얹는 것: 주인공, 장소 표시, 「!」, 새 떼, 나비, 구름 그림자, 날씨는 코드가 그림 위에 그립니다. 밟지 않은 땅은 그림의 빛을 빼고 어둑하게 가라앉혀 가립니다.

## 작업 순서

1. `docs/journey_map_guides/guide_{지역}_labeled.png`를 열어 구역 이름과 위치를 봅니다.
2. 생성 도구에 참조 이미지 두 장을 넣습니다.
   - `docs/journey_map_guides/guide_{지역}.png`: 배치 안내도. 글자가 없는 판입니다.
   - `public/assets/px_dojo_grand_map.jpg`: 화풍 기준.
3. 아래 공통 프롬프트 앞에 지역 프롬프트를 붙여 넣고 만듭니다.
4. 크기를 맞춥니다. 30칸 지역(지리산, 금강산, 호광·사천, 교토·나라)은 **1024×768(4:3)**, 39칸 지역(나머지 다섯)은 **1280×720(16:9)**입니다. 다른 크기로 나오면 이 비율로 자르고 줄이면 됩니다. 2배 크기(2048×1536, 2560×1440)도 됩니다. 큰 화면에서 더 또렷합니다.
5. `public/assets/px_jr_map_{지역}.jpg`로 넣고 알려 주세요. 칸 배치를 그림에 맞추고 실제 화면에서 확인하겠습니다.

## 그릴 때 지킬 것

게임이 돌아가려면 다음은 지켜야 합니다. 나머지는 자유입니다.

- **왼쪽 끝 출발 길:** 안내도에서 길이 왼쪽 가장자리로 나가는 자리(도장으로 돌아가는 길목)에 길이 화면 밖으로 이어져야 합니다.
- **길로 이어진 구역과 막힌 구역:** 안내도에서 길로 이어진 구역끼리는 길이 있어야 하고, 길이 없는 구역 사이(회색 산줄기, 파란 물길)는 막혀 보여야 합니다. 갈림길이 지도 모양이 되는 것이 이 지도의 핵심입니다.
- **가장자리:** 지도 둘레는 넘어갈 수 없는 산이나 바다로 둘러쌉니다.
- **크기:** 칸 하나가 약 33화소입니다. 길 폭은 칸 하나(약 24~32화소), 집 한 채는 칸 둘 남짓(약 64화소), 나무 한 그루는 칸 하나 정도로 그립니다. 주인공이 칸 하나 크기로 그 위를 걷습니다.
- **비워 둘 것:** 사람, 동물, 글자, 나침반, 테두리, 지도 장식은 넣지 않습니다. 사람과 장소 표시는 코드가 얹습니다.
- **빛:** 해는 왼쪽 위, 그림자는 오른쪽 아래. 코드의 구름 그림자와 방향이 맞습니다. P1은 늦은 봄 한낮입니다.

## 공통 프롬프트

지역 프롬프트 뒤에 붙입니다(아래 지역 프롬프트에는 붙이지 않았습니다).

```text
Top-down RPG field map seen from a high three-quarter angle, in the style of a hand-crafted 2010s 2D JRPG parallax map and matching the attached dojo map image: detailed pixel art with clean readable shapes, soft painterly shading, crisp visible square pixels, rich but balanced colors, late spring daylight from the upper left with soft cast shadows falling to the lower right. Follow the attached layout guide image for where roads, rivers, sea, villages, forests and mountain ridges go. The guide's flat colors are only a plan: light green = grassland, yellow = rice paddies, dark green dots = forest, olive = grassy hill slopes, grey triangles = impassable rocky mountain ridge, blue = river or lake, dark blue = sea, beige = sandy shore, red squares = houses, purple = temple hall, tan lines = dirt roads, brown box on a river = wooden bridge. Dirt roads about 28 pixels wide, kept clear and walkable. Houses about 64 pixels wide, trees about 32 pixels wide. The whole map is ringed by impassable mountains, or by sea where the guide shows sea, and a road leaves the left edge where the guide's road does. No people, no animals, no text, no letters, no UI, no compass, no border, no frame, no watermark.
```

네거티브를 받는 도구라면: `people, characters, animals, text, letters, labels, map legend, compass, border, frame, isometric grid lines, blurry, smooth vector art, 3D render, photo`.

## P1. 지역 지도 9장

`guide_*_labeled.png`의 번호가 아래 구역 번호입니다.

### 조선

**`px_jr_map_kr_jiri.jpg`** · 지리산 · 1024×768
1 함양 장터 어귀(왼쪽 가운데, 출발) → 2 칠선계곡(위 가운데) / 3 화전민 마을(아래 가운데) → 5 청학동 가는 길(오른쪽 가운데) / 6 반야봉 너덜길(오른쪽 아래) → 4 천왕봉(오른쪽 위)

```text
Jirisan mountain region of Joseon-dynasty Korea, 18th century. On the left, the Hamyang market village: a cluster of thatched-roof and a few tiled-roof hanok houses with stone walls, a roadside tavern, rice paddies around it. A clear mountain stream runs down through the top center valley (Chilseon valley) with rocks and reeds. In the lower center, a burned-over hillside slash-and-burn farming hamlet with blackened stumps among pine forest. On the right, dense misty pine and oak forest on the path to a hidden village, a rocky scree trail with a bandit watch-fire in the lower right, and in the upper right the high grassy ridges leading to Cheonwangbong peak with a small stone altar.
```

**`px_jr_map_kr_geumgang.jpg`** · 금강산 · 1024×768
1 단발령(왼쪽 가운데, 출발) → 2 장안사 계곡(위 가운데) / 3 해금강 바닷길(아래 가운데) → 4 만폭동(오른쪽 위), 5 비로봉 길(오른쪽 가운데) / 6 외금강 옥류동(오른쪽 아래)

```text
Geumgangsan, the Diamond Mountains of Joseon-dynasty Korea, 18th century. On the left, a winding mountain pass road over a pine-covered ridge with a small cairn. In the top center, the old Jangansa Buddhist temple: tiled halls with upturned eaves in a forested valley. In the lower center, a rocky seashore with white surf, sea stacks and sandy coves along the bottom edge. On the right, countless sharp pale granite spires and grassy slopes, a valley of many small waterfalls and jade-green pools in the upper right, and a clear stream with a tall waterfall in the lower right.
```

**`px_jr_map_kr_gwanseo.jpg`** · 의주대로 · 1280×720
1 홍제원 역참(왼쪽 가운데, 출발) → 2 송도 장시(위 가운데) / 3 수원 가는 샛길(아래 가운데) → 4 평양 대동문(가운데) → 5 묘향산 보현사(오른쪽 위) / 6 정주성과 청천강(오른쪽 아래)

```text
The great northwest highway of Joseon-dynasty Korea, 18th century, a broad open lowland. On the left, the Hongjewon relay station with a tiled post-station courtyard by the highway. In the top center, the busy market town of Songdo (Kaesong) with tiled shops and ginseng stalls. In the lower center, a quiet country lane through rice paddies and willow-lined streams. In the middle, the walled city of Pyongyang with the Daedong river gate and many tiled roofs. In the upper right, Myohyangsan mountain with the Bohyeonsa temple among forest. In the lower right, the Jeongju fortress walls beside the wide Cheongcheon river.
```

### 청

**`px_jr_map_cn_huashan.jpg`** · 화산 · 1280×720
1 옥천원 산문(왼쪽 가운데, 출발) → 2 천척당(위 가운데) / 3 화음현 마을(아래 가운데) → 5 북봉 운대(오른쪽 아래) → 4 장공잔도(위 가운데 오른쪽) / 6 남봉 낙안봉(오른쪽 가운데)

```text
Mount Hua (Huashan) in Qing-dynasty China, 18th century, steep granite mountain country. On the left, the Yuquan Taoist temple gate: red pillars, green glazed roof tiles, a paifang arch and an inn with red lanterns. In the top center, a narrow stone stairway cut into a sheer cliff with iron chains. In the lower center, Huayin village with grey-tiled houses and terraced fields. On the right, huge pale grey granite peaks with pine trees clinging to cliffs, a plank walkway bolted to a sheer cliff face, small Taoist pavilions on the summits, and drifting wisps of cloud in the gorges.
```

**`px_jr_map_cn_jiangnan.jpg`** · 강남 운하 · 1280×720
1 양주 운하 부두(왼쪽 가운데, 출발) → 2 소주 원림 골목(위 가운데) / 3 표국 호송길(아래 가운데) → 4 태호 갈대밭(위 가운데 오른쪽) → 5 항주 서호(아래 가운데 오른쪽) → 6 영은사 비래봉(오른쪽 가운데)

```text
The Jiangnan canal country of Qing-dynasty China, 18th century, flat green water country. On the left, the Yangzhou Grand Canal wharf with moored junks and sampans and a stone quay. In the top center, Suzhou with white-walled black-tiled houses, classical gardens, arched stone bridges over small canals. In the lower center, an escort-agency caravan road between rice paddies with a roadside post. In the top right center, the reed marshes of Lake Tai. In the lower right center, Hangzhou's West Lake with willow causeways and a pagoda. On the far right, the Lingyin temple at the foot of a small craggy limestone peak with cave Buddhas.
```

**`px_jr_map_cn_huguang.jpg`** · 호광·사천 산지 · 1024×768
1 양양 성 밖(왼쪽 가운데, 출발) → 2 유민 산채 골짜기(위 가운데) / 3 무당산 신도(아래 가운데) → 4 묘강 경계(오른쪽 위) / 5 대파산 고개(오른쪽 가운데) · 3 → 6 무당산 금정(오른쪽 아래)

```text
The forested highlands of Hubei and Sichuan in Qing-dynasty China, late 18th century. On the left, outside the grey brick walls of Xiangyang: a gate tower, refugee tents and an army checkpoint along the road. In the top center, a hidden forest valley with a stockade camp of refugees. In the lower center, the Wudang pilgrimage road lined with small Taoist shrines and stone steps. In the upper right, a dark dense jungle-like forest on the Miao frontier with a rope bridge. On the right, a high rocky pass through the Daba mountains. In the lower right, the summit of Wudangshan with a small golden bronze hall above the clouds.
```

### 에도

**`px_jr_map_jp_tokaido.jpg`** · 도카이도 · 1280×720
1 니혼바시~시나가와(왼쪽 가운데, 출발) → 2 하코네 관문(위 가운데) / 3 사타 고개 해안(아래 가운데) → 4 스루가 후지 들판(가운데) → 5 오이강 나루(오른쪽 위) / 6 나고야 도장 거리(오른쪽 아래)

```text
The Tokaido highway of Edo-period Japan, 18th century. On the left, the Shinagawa post town with rows of wooden inns with grey kawara roofs along the road. In the top center, the Hakone mountain checkpoint with a wooden gate and fence by a lake among cedar forest. In the lower center, the Satta pass coastal road above rocky shore and the sea along the bottom edge. In the middle, open fields and rice paddies with a pine-lined highway and small farmhouses, the base of Mount Fuji suggested by rising slopes. In the upper right, the wide shallow Oi river with gravel banks and river porters' huts, no bridge. In the lower right, a castle-town street of Nagoya with dojo buildings.
```

**`px_jr_map_jp_kyoto.jpg`** · 교토·나라 · 1024×768
1 산조 대교(왼쪽 가운데, 출발) → 2 기온 신사 거리(위 가운데) / 3 나라 고찰길(아래 가운데) → 4 구라마산 삼나무 숲(오른쪽 위) / 5 야규 마을(오른쪽 아래)

```text
Kyoto and Nara in Edo-period Japan, 18th century. On the left, the long wooden Sanjo bridge over the shallow Kamo river and the edge of the city with dense grey kawara rooftops. In the top center, the Gion shrine district with a vermilion torii gate, stone lanterns and a lantern-lined approach. In the lower center, the old temple road toward Nara with a great temple hall, a five-storied pagoda and deer park lawns. In the upper right, the deep dark Japanese cedar forest of Mount Kurama with a small mountain temple. In the lower right, the quiet Yagyu farming village with a small dojo among rice paddies and wooded hills.
```

**`px_jr_map_jp_kyushu.jpg`** · 규슈·나가사키 · 1280×720
1 나가사키 항구(왼쪽 가운데, 출발) → 2 데지마 앞 바다(위 가운데) / 3 운젠 지옥(아래 가운데) → 4 사쓰마 가고시마(오른쪽 가운데) → 5 사쿠라지마 해안(오른쪽 위) / 6 기리시마 신궁(오른쪽 아래)

```text
Kyushu in Edo-period Japan, 18th century, green hills between two seas. On the left, Nagasaki harbor with a stone quay, grey-tiled houses and a red Chinese temple gate. Along the top, the sea with the small fan-shaped walled island of Dejima, a Dutch sailing ship and junks offshore, and sandy beaches. In the lower center, the volcanic Unzen hills with steaming sulfur pools and bare yellow-white rock. On the right, the walled castle town of Kagoshima with samurai residences. In the upper right, a black volcanic shore facing the sea toward Sakurajima. In the lower right, the Kirishima shrine with a vermilion hall in deep forest.
```

## P2. 계절 그림 (선택)

P1 그림을 고치기 기능(이미지 편집)에 넣고 계절만 바꿉니다. 배치가 바뀌면 칸이 어긋나니 **구도와 배치는 그대로**라는 문장을 꼭 넣습니다. 계절 그림이 없으면 코드가 P1 그림에 계절 빛을 입힙니다. 겨울은 색을 빼고 희게 덮지만 눈이 쌓인 모습은 그림만큼 나오지 않으므로, 계절 그림 가운데서는 겨울이 가장 효과가 큽니다.

```text
Keep this exact map: identical composition, layout, roads, rivers, buildings and camera. Change only the season to {SEASON}. Same pixel art style.
```

| 파일 끝 | {SEASON}에 넣을 말 |
|---|---|
| `_summer` | `midsummer: deep lush green grass and trees, tall green rice in the paddies, bright strong sunlight` |
| `_autumn` | `autumn: golden ripe rice paddies, red and orange maples mixed with green pines, fallen leaves on the roads, warm low sunlight` |
| `_winter` | `winter: snow covering the ground, roofs and fields, frozen paddies, snow-dusted dark green pines, bare grey deciduous trees, rivers still flowing dark blue, cold pale light` |

봄은 P1 그림을 그대로 씁니다(`_spring` 파일은 없어도 됩니다).

---

## P3. 지역 표제 9장

**코드:** 무사수행 첫날(`journey.day < 0.5`)에 `JourneyView`가 화면 가운데에 표제 카드를 3.2초 띄웁니다. 카드는 폭 최대 576px(`max-w-xl`), 16:9(`aspect-[16/9] object-cover`)이고, 아래쪽 약 1/3에 검은 그라데이션과 글자(「무사수행 n번째 · 계절」, 지역 이름과 한자, 「○○에서 길을 나선다」)가 얹힙니다. 그림이 없으면(`onError`) 글자만 나옵니다.

**규격:** JPG, 1280×720. 파일 이름의 지역 id는 소문자입니다(`KR_JIRI` → `px_jr_region_kr_jiri.jpg`).

**구도 요령:**
- 주제는 위쪽 2/3, 가로 가운데 70% 안에 둡니다. 아래 1/3은 글자가 덮으니 어둡고 단순한 길이나 땅으로 채웁니다.
- 이것은 길을 나서는 장면입니다. 정상에서 깨달음을 얻는 「대오의 자리」 그림(`px_jr_vista_*`)과 겹치지 않게, 출발 구간(아래 표의 첫 구간)에서 먼 랜드마크를 바라보는 길 위의 원경으로 그립니다. 앞에 길이 깔리고, 그 길이 화면 안쪽의 랜드마크로 이어지는 구도입니다.
- 인물은 넣는다면 아래쪽에 아주 작은 뒷모습 하나(삿갓 쓴 나그네)만 둡니다. 판마다 주인공의 나라와 성별이 바뀌므로 얼굴, 옷 색, 성별이 드러나지 않게 합니다.
- 계절을 타지 않게 맑은 늦은 오후 빛으로, 꽃, 단풍, 눈 없이 그립니다.

공통 꼬리말은 `docs/11` 0.2절 장면 꼬리말에 계절 중립 문구를 더한 것입니다(아래 프롬프트에 이미 붙였습니다).

```text
season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

| 파일 | 지역 | 출발 구간 | 원경의 랜드마크 |
|---|---|---|---|
| `px_jr_region_kr_jiri.jpg` | 지리산(智異山) | 함양 장터 어귀 | 겹겹이 이어진 지리산 능선과 천왕봉 |
| `px_jr_region_kr_geumgang.jpg` | 금강산(金剛山) | 단발령 | 고개 너머 일만이천 봉의 흰 바위 봉우리 |
| `px_jr_region_kr_gwanseo.jpg` | 의주대로(義州大路) | 홍제원 역참 | 북쪽으로 뻗은 큰길과 멀리 개성·평양 쪽 들판 |
| `px_jr_region_cn_huashan.jpg` | 화산(華山) | 옥천원 산문 | 깎아지른 화산 다섯 봉우리 |
| `px_jr_region_cn_jiangnan.jpg` | 강남 운하(江南運河) | 양주 운하 부두 | 운하를 따라 늘어선 부두, 돛배, 백벽 회와 마을 |
| `px_jr_region_cn_huguang.jpg` | 호광·사천(湖廣·四川) | 양양 성 밖 | 성벽 밖 유민 천막 너머 무당산 연봉 |
| `px_jr_region_jp_tokaido.jpg` | 도카이도(東海道) | 니혼바시~시나가와 | 소나무 가로수 역참길 끝의 후지산 |
| `px_jr_region_jp_kyoto.jpg` | 교토·나라(京·奈良) | 산조 대교 | 가모강 다리 너머 히가시야마와 탑 |
| `px_jr_region_jp_kyushu.jpg` | 규슈·나가사키(九州·長崎) | 나가사키 항구 | 항구의 데지마 부채꼴 섬과 범선, 언덕의 당인 거리 |

### 조선

**`px_jr_region_kr_jiri.jpg`** · 참조 `px_jr_vista_jiri.jpg`, `px_prologue_yard_kr.jpg`
함양 장터 어귀에서 지리산으로 들어가는 흙길. 길가에 초가 주막과 장승, 멀리 겹겹의 능선.

```text
The dirt road out of a small Joseon-dynasty Korean market town at the foot of Jirisan, 18th century: a thatched-roof roadside tavern with a white cloth banner on a pole, a pair of carved wooden village guardian totems (jangseung) flanking the road, low stone walls, and beyond them layer upon layer of blue-green mountain ridges receding into haze, the highest peak Cheonwangbong faintly lit by warm sunlight, a single tiny traveler in a straw hat walking away from the viewer far down the road, season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_region_kr_geumgang.jpg`** · 참조 `px_jr_vista_geumgang.jpg`
단발령 고갯마루. 고개 너머로 흰 화강암 봉우리 수천 개가 창끝처럼 솟은 금강산이 처음 보이는 순간.

```text
The top of Danballyeong pass in Joseon-dynasty Korea, 18th century: a narrow mountain path crests a ridge between gnarled red pines and a small stone cairn with a weathered shrine post, and beyond it the Diamond Mountains (Geumgangsan) suddenly appear across the valley, thousands of sharp pale granite spires rising like spear tips out of drifting mist, glowing in warm side light, a single tiny traveler in a straw hat stopped at the crest seen from behind, season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_region_kr_gwanseo.jpg`** · 참조 `px_prologue_yard_kr.jpg`
홍제원 역참. 기와 역참 건물과 말 매는 기둥, 북쪽 의주로 뻗은 넓은 큰길과 멀리 사신 행렬의 깃발.

```text
Hongjewon relay station just outside the northwest gate of Hanyang in Joseon-dynasty Korea, 18th century: a tiled-roof government post station with a courtyard, wooden hitching posts and a stone water trough, a wide packed-earth highway running north between rice fields and low hills toward a hazy horizon, far along the road a tiny procession of an envoy mission with red and blue banners and pack horses, willow trees along a stream, a single tiny traveler in a straw hat on the road seen from behind, season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

### 청

**`px_jr_region_cn_huashan.jpg`** · 참조 `px_jr_vista_huashan.jpg`, `px_dojo_cn_grand.jpg`
옥천원 산문 앞 돌길. 붉은 기둥의 도관 산문 너머 하늘을 찌르는 화산의 회색 절벽.

```text
The stone-paved approach to the Yuquan Taoist temple gate at the foot of Mount Hua in Qing-dynasty China, 18th century: a red-pillared paifang archway with green glazed roof tiles and a blank plaque, incense smoke curling from a bronze burner, a small inn with hanging red lanterns beside the path, and behind them the colossal sheer grey granite cliffs of Huashan's peaks soaring into bands of cloud, a thin line of cliffside stairs visible on the rock, a single tiny traveler in a conical bamboo hat seen from behind, season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_region_cn_jiangnan.jpg`** · 참조 `px_jr_canal_procession.jpg`
양주 운하 부두. 돌다리와 백벽 회와(白壁灰瓦) 집, 돛배와 표국 깃발이 늘어선 운하가 화면 안쪽으로 이어진다.

```text
The Grand Canal wharf at Yangzhou in Qing-dynasty China, 18th century: a stone quay piled with salt sacks and cargo crates, wooden junks and sampans with patched sails moored along the canal, white-walled black-tiled merchant houses with horse-head gables lining both banks, an arched stone bridge in the middle distance, a triangular escort-agency flag fluttering on a pole, willows trailing over the water, the canal stretching away into soft golden haze, a single tiny traveler in a conical bamboo hat on the quay seen from behind, season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_region_cn_huguang.jpg`** · 참조 `px_jr_refugees.jpg`, `px_jr_vista_wudang.jpg`
양양 성 밖. 성벽 아래 유민 천막과 관군 초소, 그 너머 푸른 무당산 연봉과 봉우리 위 금빛 전각 한 점.

```text
Outside the walls of Xiangyang in Hubei, Qing-dynasty China, late 18th century: a grey brick city wall with a gate tower on one side, a cluster of patched refugee tents and cooking fires along the road below it, a small Qing army checkpoint with a striped barrier pole and a banner, and far beyond, across green rolling hills, the forested blue peaks of the Wudang Mountains with a tiny glint of a golden hall on the highest summit, a single tiny traveler in a conical bamboo hat walking toward the mountains seen from behind, season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

### 에도

**`px_jr_region_jp_tokaido.jpg`** · 참조 `px_dojo_jp_grand.jpg`
시나가와 역참을 벗어난 도카이도. 소나무 가로수와 이정표 무덤(이치리즈카), 해안 너머 후지산.

```text
The Tokaido highway leaving Shinagawa post town in Edo-period Japan, 18th century: a wide sandy road lined with tall black pine trees, a small earthen milestone mound (ichirizuka) topped by a tree, a row of wooden inns with grey kawara roofs and indigo noren curtains on one side, the calm bay on the other with small fishing boats, and Mount Fuji rising pale and perfect far in the distance, a single tiny traveler in a sedge hat walking away from the viewer, season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_region_jp_kyoto.jpg`** · 참조 `px_jr_vista_kurama.jpg`
산조 대교. 목조 난간의 긴 다리가 가모강을 건너고, 건너편 기와 지붕 사이로 오층탑과 히가시야마 산자락.

```text
The Sanjo Ohashi bridge over the Kamo River at the entrance to Kyoto in Edo-period Japan, 18th century: a long wooden bridge with ornamented bronze post caps on its railings crossing a wide shallow river with pebble banks, the city beyond with dense grey kawara rooftops, a five-storied pagoda rising among them, and the soft wooded hills of Higashiyama behind, warm low sunlight glinting on the water, a single tiny traveler in a sedge hat starting across the bridge seen from behind, season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_region_jp_kyushu.jpg`** · 참조 `px_jr_dejima.jpg`, `px_jr_vista_sakurajima.jpg`
나가사키 항구 언덕길. 돌계단 아래로 부채꼴 데지마와 정박한 네덜란드 범선, 중국 정크선, 푸른 만.

```text
A stone-stepped hillside lane above Nagasaki harbor in Edo-period Japan, 18th century: grey-tiled rooftops and a Chinese-style red temple gate tumbling down the slope, the fan-shaped artificial island of Dejima in the bay below with its walled warehouses, a tall Dutch three-masted sailing ship and several Chinese junks at anchor, green hills enclosing the deep blue harbor, sunlight sparkling on the water, a single tiny traveler in a sedge hat descending the steps seen from behind, season-neutral clear late afternoon (no blossoms, no autumn leaves, no snow), a road in the darker, simpler foreground leading the eye toward the landmark, subject in the upper two thirds, Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

---

## P4. 지도 바깥 배경 3장

그림 지도는 보통 화면 크기 그대로 깔려서 지도 바깥이 잘 보이지 않습니다. 2560 폭 같은 큰 화면이나 전도 [M]에서만 보이므로 가장 나중에 만들어도 됩니다.

**코드:** `src/components/JourneyView.tsx`의 그리기 루프에서 지도(월드)가 화면보다 작을 때만 `loadRawImage('/assets/px_jr_field_backdrop_{kr|cn|jp}.jpg')`를 화면 전체에 `cover`로 깔고, 위에 `rgba(14,10,20,0.35)`를 덮은 뒤 지도를 가운데에 얹습니다. 나라는 주인공 국적이 아니라 지역의 나라(`region.country`)를 따릅니다.

**규격:** JPG, 1280×720(16:9). 기준 그림은 `px_jr_vista_jiri.jpg`(1280×720)입니다.

**구도 요령:**
- 가운데 60~85%는 지도가 덮습니다. 데스크톱 전도에서는 좌우 띠, 세로 휴대폰에서는 위아래 띠만 보입니다. 그래서 주제를 한곳에 모으지 말고 화면 전체에 고르게 펼칩니다. 가운데에 해, 탑, 인물처럼 눈길을 끄는 것을 두지 않습니다.
- 지도가 위에서 내려다본 그림이므로 배경도 높은 하늘에서 내려다본 조감으로 그립니다. 지평선과 하늘은 넣지 않습니다.
- 지도보다 튀면 안 됩니다. 명암 차가 작고 채도가 낮은 밤빛 또는 새벽빛으로 그립니다. 코드가 35%를 더 어둡게 덮습니다.
- 계절을 타지 않게 꽃, 단풍, 눈 없이 그립니다(지도가 계절마다 바뀝니다).

공통 꼬리말(이 절 프롬프트 끝에 이미 붙였습니다):

```text
High aerial bird's-eye view looking straight down, no horizon, no sky, evenly spread detail across the whole frame with nothing eye-catching in the center, low contrast, muted dusk palette, season-neutral (no blossoms, no autumn leaves, no snow), detailed 2D pixel art in the style of a late-1990s 32-bit JRPG world map, painterly pixel shading with fine dithering, crisp visible square pixels, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark, no characters.
```

**`px_jr_field_backdrop_kr.jpg`** · 조선(지리산, 금강산, 의주대로)
화강암 봉우리와 소나무 능선 사이로 운해가 흐르는 조감.

```text
A sea of clouds flowing between countless granite mountain ridges of Joseon-dynasty Korea seen from high above, rounded pale granite peaks and dark green Korean red pine forests poking through drifting white cloud layers, thin mountain streams glinting in the valleys, a few tiny thatched-roof hamlets barely visible in clearings near the edges, deep indigo and slate-blue shadows with a faint warm dusk light, High aerial bird's-eye view looking straight down, no horizon, no sky, evenly spread detail across the whole frame with nothing eye-catching in the center, low contrast, muted dusk palette, season-neutral (no blossoms, no autumn leaves, no snow), detailed 2D pixel art in the style of a late-1990s 32-bit JRPG world map, painterly pixel shading with fine dithering, crisp visible square pixels, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark, no characters.
```

**`px_jr_field_backdrop_cn.jpg`** · 청(화산, 강남 운하, 호광·사천)
깎아지른 바위 봉우리, 굽이치는 강과 운하, 계단식 논이 운무 사이에 흩어진 조감.

```text
A vast Qing-dynasty Chinese landscape seen from high above: sheer vertical grey rock pinnacles in the style of Huashan rising through bands of mist, a winding jade-green river and canals with tiny sampans, terraced rice paddies stepping down misty hillsides, small grey-tiled villages and a distant temple roof tucked into the corners, soft teal and ink-grey tones with faint amber dusk light, High aerial bird's-eye view looking straight down, no horizon, no sky, evenly spread detail across the whole frame with nothing eye-catching in the center, low contrast, muted dusk palette, season-neutral (no blossoms, no autumn leaves, no snow), detailed 2D pixel art in the style of a late-1990s 32-bit JRPG world map, painterly pixel shading with fine dithering, crisp visible square pixels, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark, no characters.
```

**`px_jr_field_backdrop_jp.jpg`** · 에도(도카이도, 교토·나라, 규슈·나가사키)
삼나무 숲 능선, 해안선과 파도, 화산 능선의 연기가 섞인 조감.

```text
An Edo-period Japanese landscape seen from high above: dark Japanese cedar forests covering steep folded ridges, a rugged coastline with white surf curling around rocky islets, a volcanic ridge trailing a thin plume of steam, a highway lined with pine trees and tiny post-town rooftops of grey kawara tiles near the edges, ink-blue and deep green tones with faint violet dusk light, High aerial bird's-eye view looking straight down, no horizon, no sky, evenly spread detail across the whole frame with nothing eye-catching in the center, low contrast, muted dusk palette, season-neutral (no blossoms, no autumn leaves, no snow), detailed 2D pixel art in the style of a late-1990s 32-bit JRPG world map, painterly pixel shading with fine dithering, crisp visible square pixels, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark, no characters.
```

---

## 넣은 뒤 확인

```bash
ls public/assets | grep -E 'px_jr_(map|region|field_backdrop)_'
```

- 지역 지도: 넣은 뒤 알려 주시면 제가 칸 배치를 그림에 맞춥니다(`src/data/journeyMapLayouts.ts`). 그 전에도 그림은 바로 보이지만, 칸이 아직 옛 배치라 강 위를 걷거나 길이 아닌 곳이 빠르게 걸릴 수 있습니다.
- 계절 그림: 그 계절에 무사수행을 떠나면 보입니다.
- 표제: 새 무사수행을 떠나면 첫 화면에 3초 뜹니다.
- 배경: 큰 화면이나 전도 [M]에서 지도 둘레에 보입니다.

## 안내도 다시 그리기

칸 배치가 바뀌면 안내도를 다시 뽑습니다(Pillow 필요).

```bash
npm run -s map:ascii -- --json > /tmp/journey_maps.json
```

```bash
python3 scripts/journey_map_guides.py /tmp/journey_maps.json docs/journey_map_guides
```
