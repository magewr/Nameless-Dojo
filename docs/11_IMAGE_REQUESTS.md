# 11. 이미지 생성 요청서

> 한 줄 요약: 코드가 부르는데 파일이 없는 그림, 다른 장면의 그림을 빌려 쓰는 자리, 탑다운 맵 같은 범용 그림으로 때우는 자리를 모았습니다. 한 번에 생성할 수 있도록 파일 이름, 크기, 프롬프트를 붙였습니다.

- 기준: 2026-11-25, `feat/elder-life`(7eb732e)와 작업 트리. 행 번호는 이 시점 기준입니다. `DojoSimView.tsx`, `MerchantAndEventModals.tsx`, `events.ts`, `tourney.ts`는 조사하는 동안에도 미커밋 수정이 이어져 행이 움직였으므로 사건 id나 심볼 이름을 함께 적었습니다.
- 크기는 기존 파일을 `sips -g pixelWidth -g pixelHeight`로 재서 맞췄습니다.

| 우선순위 | 장수 | 내용 |
|---|---|---|
| P1 | 22 | 없는 파일 4 · 일본 도장 맵 2 · 조선/청 진검 무대 2 · 맹수 스프라이트 5 · 엔딩 6 · 서막 3 |
| P2 | 19 | 노년 연대기 삽화 6 · 은거 고수 9 · 이계 사건 4 |
| P3 | 12 | 무술대회 무대 3 · 온보딩 사건 2 · 대오의 자리 6 · 금기 사망 1 |
| 합계 | 53 | |

## 지금 깨져 있는 참조

코드에 경로는 있는데 `public/assets`에 파일이 없는 것은 아래 4개뿐입니다. 모두 무사수행 역사 사건의 `illustration`입니다. 121e007에서 경로만 들어갔고 파일은 한 번도 커밋된 적이 없습니다. `EventModal`이 `onError`로 그림을 숨기기 때문에 화면이 깨져 보이지는 않지만, 사건이 뜰 때마다 404 요청이 나가고 의도한 그림은 나오지 않습니다. 파일만 넣으면 고쳐집니다(P1-1).

| 경로 | 참조 |
|---|---|
| `/assets/px_jr_tiger.jpg` | `src/data/journeyEvents/history.ts:326` |
| `/assets/px_jr_canal_procession.jpg` | `src/data/journeyEvents/history.ts:373` |
| `/assets/px_jr_refugees.jpg` | `src/data/journeyEvents/history.ts:516` |
| `/assets/px_jr_dejima.jpg` | `src/data/journeyEvents/history.ts:829` |

템플릿으로 조립하는 경로(`grid_walk_{kr|cn|jp}_{m|f}_age`, `grid_unarmed_{국가}_{성별}_8f`, `grid_fight_{국가}_{성별}_{mid|old}_8f`, 연대기 `IMG()` 34종)는 모든 조합을 파일과 대조했고 빠진 것이 없습니다. 일본 도장 맵은 파일이 없는 것이 아니라 `getDojoMapSrc()`가 국가 무관 범용 맵으로 조용히 떨어지는 경우입니다(P1-2).

그림 선택 로직 버그도 하나 있었습니다(이 문서를 쓴 직후 `startsWith`로 고쳤습니다). `EndingReportView.tsx:54`는 `state.deathCause === '진검결투 전사'`로 정확히 비교했는데, 무사수행 중 전사는 `'진검결투 전사 (무사수행)'`(`src/engine/journey.ts:406`)으로 기록됩니다. 그래서 길 위에서 죽으면 엔딩 첫 두 장면이 진검 무대가 아니라 겨울밤 임종 그림(`px_end_death.jpg`)과 임종 대사로 나옵니다. 연대기 쪽(`lineageFacts.ts:118`)은 `includes`로 판별해 「칼을 꽂은 자리」가 나오므로 두 장면이 서로 어긋납니다.

---

## 0. 공통 스타일 가이드

기존 그림 `px_chr_v_sword_grave`, `px_chr_v_family_rite`, `px_chr_v_orphan_school`, `px_chr_v_orphan_gate`, `px_end_death`, `px_battle_stage`, `px_battle_duel_stage`, `px_dojo_kr_ruin`, `px_dojo_cn_grand`, `px_dojo_grand_map`, `px_dojo_ruin_map`, `grid_enemy_unarmed_8f`, `grid_fight_female_8f`, `grid_ko_fallen_4x2`, `grid_portraits_npcs_4x3`을 직접 열어 보고 정리했습니다. 생성 도구가 참조 이미지를 받는다면 각 절에 적은 기존 파일을 같이 넣는 것이 톤을 맞추는 가장 확실한 방법입니다.

### 0.1 규격과 이름
- 모두 JPG, 1280×720(16:9)입니다. 장면, 맵, 전투 무대, 전투 시트가 예외 없이 이 크기입니다. 초상 시트(1152×864)와 `sp_*`·`pt_*`(1024×1024)는 이번 요청에 없습니다. 다른 비율로 나오면 16:9로 잘라 1280×720으로 맞춥니다. 용량은 기존처럼 200~600KB면 됩니다.
- 이름은 이 문서 표기 그대로 씁니다. 국가 변형은 `_kr`·`_cn`·`_jp` 꼬리를 붙입니다(기존 `sheet_walk_female_kr`, `px_chr_v_orphan_school_kr`과 같은 방식). 도장 맵만 기존대로 `px_dojo_{국가}_{상태}`입니다. 새로 생기는 접두어는 `px_prologue_`(서막)와 `px_ev_`(도장 사건) 두 개입니다.

### 0.2 장면 일러스트 — `px_chr_*`, `px_end_*`, `px_jr_*`, `px_ev_*`, `px_prologue_*`
- 화풍: 1990년대 후반 32비트 JRPG 컷신풍의 고밀도 픽셀아트입니다. 네모 픽셀이 보이지만 거칠지 않고, 하늘과 안개는 잔 디더링, 배경은 회화적인 픽셀 붓질로 처리합니다. 외곽선은 거의 쓰지 않습니다.
- 색: 채도 낮은 흙빛(고동, 황토, 청회, 남색) 위에 강한 광원 하나를 둡니다. 기존 그림은 세 가지 무드를 씁니다. 남색 밤과 호박색 등불·촛불(family_rite, orphan_gate, end_death), 핏빛 노을(sword_grave, 진검 무대), 황금빛 낮(대련 무대)입니다.
- 구도: 와이드 원경입니다. 인물은 화면 높이의 1/6~1/3로 작게 두고 뒷모습이나 옆모습 위주로 그리며 얼굴은 거의 묘사하지 않습니다. 전경(풀, 바위, 가지)은 어둡게 깔아 테두리처럼 쓰고, 주제는 중경, 원경은 산과 하늘의 대기 원근으로 채웁니다.
- 안전 영역: 엔딩과 서막 그림은 화면 전체에 `object-cover`로 깔리고 아래쪽을 대사창과 검은 그라데이션이 덮습니다(`EndingReportView.tsx:200-206`, `PrologueView.tsx:130-136`). 주제는 위쪽 2/3, 가로 가운데 60% 안에 둡니다. 세로 모바일 화면에서는 좌우가 크게 잘립니다. 사건 창 삽화는 `max-h-[38vh] object-cover`(`MerchantAndEventModals.tsx`의 `EventModal` illustration 블록)라 위아래가 잘리므로 주제를 세로 가운데에 둡니다.
- 인물: 주인공, 후계자, 창시자는 판마다 성별과 나라가 바뀝니다. 뒷모습, 원경, 실루엣으로 그려 특정하지 않습니다. 주인공 얼굴은 대사창 초상(`PixelPortrait`)이 따로 보여 줍니다.
- 글자: 현판, 비석, 책, 깃발의 글씨는 빈 판이나 읽히지 않는 획으로 둡니다.
- 시대 고증(`docs/08` 아트 원칙과 같음): 본편은 1750~1830년입니다. 조선은 초가·기와 한옥, 돌담, 갓·도포·상투. 청은 변발, 장삼·마괘, 붉은 기둥과 들린 처마, 패루. 에도는 촌마게, 하카마, 회색 가와라 기와·쇼지·엔가와, 석등. 연대기 `LATE` 삽화는 20세기 후반입니다.

아래 장면 프롬프트 끝에는 이 꼬리말을 이미 붙여 두었습니다.

```text
Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

### 0.3 전투 무대 — `px_battle_*`
- 기준: `px_battle_duel_stage.jpg`, `px_battle_stage.jpg` (둘 다 1280×720).
- 900×420 캔버스에 비율을 무시하고 늘려 그립니다(`AutoBattleView.tsx:256-258`, `1858-1859`). 세로가 약 17% 눌리고, 캐릭터 발은 원본 기준 y≈630(GROUND_Y 368/420)에 놓입니다. 아래 1/3(y≈480~720)에는 평평한 맨땅만 두고 구조물은 위 2/3에 둡니다. 땅 위에 사람을 세우지 않습니다.
- 진검 무대는 기존 일본판 구도를 따릅니다. 왼쪽 고목, 가운데 원경 랜드마크, 오른쪽 건물, 커다란 해와 핏빛 하늘입니다.

꼬리말:

```text
Side-view 2D fighting game stage background, nobody standing on the ground, flat open walkable ground across the bottom third, all landmarks in the upper two thirds, detailed late-1990s 32-bit pixel art with painterly dithering, crisp visible square pixels, 16:9, 1280x720, no text, no UI, no border.
```

### 0.4 도장 맵 — `px_dojo_*`
- 기준: `px_dojo_kr_ruin.jpg`, `px_dojo_kr_grand.jpg`, `px_dojo_cn_grand.jpg` (모두 1280×720). 높은 각도의 탑다운 3/4 뷰로, 담장 안 도장 터가 화면을 꽉 채우고 바깥은 숲입니다.
- 건물 위치는 고정입니다. 인물이 `DojoSimView.tsx`의 `LOC_COORDS`(1024×576 좌표)로 걸어가므로 위치가 어긋나면 엉뚱한 자리에 섭니다. 1280×720으로 환산(×1.25)하면 아래와 같습니다. 기존 조선·청·범용 맵이 모두 이 배치입니다.

| 시설 | 위치 | 좌표(1280×720) |
|---|---|---|
| 본관 HALL | 위 가운데 | (640, 269) |
| 장서각 LIBRARY | 왼쪽 위 | (256, 288) |
| 목인장 DUMMY | 왼쪽 가운데 | (306, 419) |
| 마당 YARD | 가운데, 비워 둠 | (640, 394) |
| 대장간 FORGE | 오른쪽 위 | (1000, 294) |
| 의원 CLINIC | 오른쪽 가운데 | (1000, 481) |
| 정문 GATE | 아래 가운데 | (640, 594) |

- 인물은 x 150~1130, y 262~601 사이를 돌아다닙니다(`DojoSimView.tsx` 배회 목적지 clamp, 작성 시점 349-350행). 이 범위 안쪽은 건물로 막지 않습니다.

꼬리말:

```text
High-angle top-down three-quarter view pixel-art map in the style of a 16-bit/32-bit JRPG town map, crisp pixel clusters, the walled compound fills the whole frame, no characters, no text, no UI, no border, 16:9, 1280x720.
```

### 0.5 스프라이트 시트 — `grid_*_8f`, `grid_ko_*_4x2`
- 기준: `grid_enemy_unarmed_8f.jpg`, `grid_ko_fallen_4x2.jpg` (둘 다 1280×720).
- 배경은 순수 크로마 그린 `#00FF00`입니다. 로더가 G>125, G−R>55, G−B>55인 픽셀을 가장자리부터 지웁니다(`spriteLoader.ts:39-42`). 피사체에는 채도 높은 초록을 쓰지 않습니다.
- 4열×2행, 한 칸에 한 동작입니다. 로더는 1024×576으로 줄인 뒤 연결 성분으로 몸체 8개를 찾습니다(`spriteLoader.ts:393-588`). 프레임끼리 닿지 않게 넉넉히 띄우고, 떨어진 파편·잔상·그림자·바닥선은 넣지 않습니다. 두 행 사이도 비웁니다.
- 적 시트는 왼쪽을 봅니다(`AutoBattleView.tsx:2055`, 적 nativeDir −1). 주인공 시트는 오른쪽입니다.
- 프레임 순서(`AutoBattleView.tsx:1889-1915` `resolvePoseFrame`): 윗줄은 ① 대기 ② 낮게 다가섬(이동 중에는 ①②를 번갈아 씀) ③ 크게 치켜든 준비 ④ 앞으로 전력 공격, 아랫줄은 ⑤ 낮은 2연격 ⑥ 막기·흘리기 ⑦ 몸 전체로 돌진 ⑧ 맞고 밀려남입니다.
- 화면 크기는 ①번 프레임 높이를 176px로 맞춰 정합니다(`AutoBattleView.tsx:1990`). 모든 프레임을 같은 축척으로 그립니다.

꼬리말:

```text
2D fighting game sprite sheet: 8 sprites in a 4-column by 2-row grid, each centered in its own equal cell with wide empty gaps so nothing touches, consistent scale across all frames, side view, crisp late-1990s 32-bit pixel art with dark outlines and painterly shading in the style of SNK and Capcom fighting games, solid pure chroma-key green background #00FF00 filling the whole image, no shadows, no ground line, no motion trails, no effects, no text, no grid lines, no green on the subject, 16:9, 1280x720.
```

### 0.6 공통 네거티브 (도구가 지원할 때)

```text
text, letters, kanji, hangul, calligraphy, watermark, signature, logo, frame, border, UI, photo, photorealistic, 3D render, vector art, smooth gradients, anime cel shading, blur, close-up face portrait
```

---

## P1. 없는 파일, 자주 보이는 대체 그림 (22장)

### P1-1. 없는 파일 4장 — 넣기만 하면 됨

무사수행 역사 사건 창 위에 뜨는 삽화입니다. 1280×720(기준 `px_chr_v_sword_grave.jpg` 실측 1280×720). 코드 수정은 필요 없습니다.

**`px_jr_tiger.jpg`** · `history.ts:326` 「호환(虎患)」(`h_kr_tiger`, 조선 지리산·관서, 겨울에 3배 잘 뜸)
해 지기 전에 문을 걸어 잠그는 겨울 산골 마을, 눈 위의 커다란 범 발자국, 능선 소나무 사이에서 내려다보는 호랑이.

```text
A remote Joseon-dynasty Korean mountain village at winter dusk, 18th century. Thatched-roof cottages with low stone walls half buried in snow; villagers in white padded clothes hurry to bar their wooden doors before sunset, and an old village chief kneels in the snowy lane with his hands pressed together, pleading. Enormous tiger pawprints cross the path in the foreground. On the forested ridge above the village, between dark pine trees, the silhouette of a huge Amur tiger watches, eyes faintly glowing. Cold blue twilight, one warm orange glow from a paper window, ominous silence. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_canal_procession.jpg`** · `history.ts:373` 「건륭제 남순 — 어가 앞의 백성」(`h_cn_nanxun`, 청 강남, 남순 해의 봄)
운하를 메운 용선 행렬, 강둑에 엎드린 백성, 고소장을 치켜들고 뛰쳐나간 노파와 칼을 뽑는 어전 시위.

```text
The Qianlong Emperor's southern inspection tour on the Grand Canal in Jiangnan, Qing-dynasty China, in spring. A long flotilla of ornate imperial dragon boats with yellow silk canopies and gilded dragon prows fills the canal. Along the stone embankment hundreds of commoners with queues kneel with their foreheads touching the ground under weeping willows; white-walled, black-tiled Jiangnan houses and an arched stone bridge stand behind. In the middle ground a frail old woman has broken out of the crowd, holding a petition scroll high above her head, while two imperial bodyguards in Qing armor draw their sabres toward her. Bright hazy spring light, a tense frozen moment. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_refugees.jpg`** · `history.ts:516` 「백련교의 난 — 유민 마을」(`h_cn_whitelotus`, 청 호광, 1796~1804)
불탄 마을, 생존자를 끌어내 캐묻는 향용, 산 위의 백련교 깃발, 죽은 어미 곁에 앉은 아이(잔혹하지 않게).

```text
A burned village in the hills of Hubei during the White Lotus Rebellion, Qing-dynasty China, 1790s. Smoldering ruins of mud-brick houses with collapsed thatch, gray smoke drifting. Local militiamen in padded jackets and red cloth headbands drag ragged survivors out of the ruins and question them at spear point while their captain wipes his sabre. On a distant hilltop white rebel banners flutter against an ash-gray sky. In the lower foreground a small child sits silently beside a body covered with a straw mat. Desaturated gray-brown palette with glowing orange embers, somber and non-graphic. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_dejima.jpg`** · `history.ts:829` 「페이튼호 사건」(`h_jp_phaeton`, 일본 규슈 나가사키, 1808 가을~1809 봄)
데지마가 보이는 나가사키 항, 화란 깃발을 단 영국 군함, 부두에서 손쓸 수 없이 지켜보는 부교소 무사들.

```text
Nagasaki harbor in autumn 1808, Edo-period Japan. The small fan-shaped artificial island of Dejima, lined with white-plastered Dutch warehouses and joined to the town by a short stone bridge, sits in the middle ground. Anchored in the bay is a three-masted British Royal Navy frigate with open gunports, deceptively flying a Dutch red-white-blue flag. On the stone quay in the foreground a few samurai of the Nagasaki magistrate's office, in kamishimo with topknots, stand rigid and watch helplessly; one clenches his fists. Small boats are tied below. Muted orange-and-slate dusk sky, tense and humiliated mood. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

### P1-2. 일본 도장 맵 2장

`getDojoMapSrc()`(`spriteLoader.ts:720-725`)는 조선과 청만 전용 맵(`px_dojo_kr_*`, `px_dojo_cn_*`)을 돌려주고, 일본은 724행에서 국가 무관 범용 맵(`px_dojo_grand_map.jpg`, `px_dojo_ruin_map.jpg`)으로 떨어집니다. 범용 맵은 초가 폐허와 청기와 누각이라 에도 도장으로 보이지 않습니다. 이 함수가 일본 플레이어의 메인 화면(`DojoSimView.tsx` 렌더 루프의 맵 그리기, 작성 시점 546행), 엔딩 장례·계승 장면(`EndingReportView.tsx:86`, `98`), 서막(`PrologueView.tsx:28`)을 모두 정합니다. 일본 판에서 가장 오래 보는 배경입니다. 마당 Lv.3 이상이면 grand입니다.

1280×720, 0.4절 배치 그대로(기준 `px_dojo_kr_ruin.jpg`, `px_dojo_kr_grand.jpg` 실측 1280×720, 참조 이미지로 같이 넣기 권장).

**`px_dojo_jp_ruin.jpg`** — 무너져 가는 에도 시골 검술 도장

```text
Map of an abandoned rural kenjutsu dojo compound in mid-18th-century Edo-period Japan, viewed from a high angle. Fixed layout: top center the main dojo hall with a sagging gray kawara tile roof missing many tiles and patched with straw mats, torn shoji screens and a rotting wooden engawa with front steps; top left a small kura storehouse with cracked white plaster used as a book archive; top right an open-sided smithy shed with a clay charcoal furnace glowing faintly; right middle a small thatched hut with herb baskets used as a clinic; left middle two weathered wooden makiwara striking posts; center a wide empty cracked bare-earth yard with puddles and weeds; bottom center a broken roofed wooden gate with one door hanging loose. A crumbling earthen tsuiji wall with exposed straw encloses everything; dense cedar and pine forest outside. Muted browns and mossy grays, overcast light. High-angle top-down three-quarter view pixel-art map in the style of a 16-bit/32-bit JRPG town map, crisp pixel clusters, the walled compound fills the whole frame, no characters, no text, no UI, no border, 16:9, 1280x720.
```

**`px_dojo_jp_grand.jpg`** — 번창한 에도 검술 도장

```text
Map of a prosperous kenjutsu dojo compound in Edo-period Japan, viewed from a high angle. Fixed layout: top center a large main dojo hall with a hip-and-gable roof of dark gray kawara tiles, onigawara ridge ends, a polished engawa, white shoji and paper lanterns at the entrance; top left a white kura storehouse with black-and-white namako tile walls used as a book archive; top right a busy smithy with a brick charcoal furnace, anvil and quenching barrels; right middle a tidy clinic cottage with herb-drying racks and a small fenced herb garden; left middle rows of makiwara posts and wooden-sword racks; center a wide raked-gravel training yard left open; bottom center an imposing roofed wooden gate flanked by stone lanterns. White plaster walls with tiled caps enclose the compound; pine trees and a few cherry trees outside, neat stone paths. Warm clear daylight. High-angle top-down three-quarter view pixel-art map in the style of a 16-bit/32-bit JRPG town map, crisp pixel clusters, the walled compound fills the whole frame, no characters, no text, no UI, no border, 16:9, 1280x720.
```

### P1-3. 조선·청 진검 무대 2장

진검 승부의 배경은 국가와 상관없이 `px_battle_duel_stage.jpg` 하나입니다(`AutoBattleView.tsx:1858`). 이 그림은 도리이와 신사가 있는 일본 풍경입니다. 무사수행 길 위의 승부는 목검 시합이 아니면 모두 진검이라(`journeyCore.ts:324-326`) 조선·청 플레이어도 도적, 맹수, 역사 사건 전투 대부분을 도리이 앞에서 치릅니다. 진검결투로 죽으면 엔딩 첫 두 장면(`EndingReportView.tsx:71`, `77`)에도 같은 도리이가 나옵니다.

1280×720, 0.3절 규칙(기준 `px_battle_duel_stage.jpg` 실측 1280×720, 참조 이미지로 같이 넣어 구도와 색을 맞출 것).

**`px_battle_duel_stage_kr.jpg`** — 핏빛 노을의 고갯마루. 노송, 서낭당 돌무더기와 장승, 버려진 정자.

```text
Background for a life-or-death sword duel in Joseon-dynasty Korea: a desolate mountain pass under a blood-red sunset with a huge pale sun and torn crimson clouds. On the left a gnarled old Korean red pine; in the center distance a seonangdang village shrine, a stone cairn beneath a sacred tree tied with faded cloth strips, flanked by a pair of carved wooden jangseung guardian posts; on the right an abandoned Joseon pavilion with a curved gray-tiled roof on a stone platform. Layered dark ridgelines and a misty valley behind. Flat cracked dirt with sparse dry grass across the entire bottom, a few red leaves drifting. No people. Side-view 2D fighting game stage background, nobody standing on the ground, flat open walkable ground across the bottom third, all landmarks in the upper two thirds, detailed late-1990s 32-bit pixel art with painterly dithering, crisp visible square pixels, 16:9, 1280x720, no text, no UI, no border.
```

**`px_battle_duel_stage_cn.jpg`** — 핏빛 노을의 벌판. 노송, 돌 패루, 붉은 기둥이 벗겨진 길가 사당.

```text
Background for a life-or-death sword duel in Qing-dynasty China: a desolate plain under a blood-red sunset with a huge pale sun and torn crimson clouds. On the left a gnarled old pine; in the center distance a weathered three-bay stone paifang memorial archway; on the right a ruined roadside temple pavilion with chipped red pillars and sharply upturned eaves. Jagged karst peaks fade into haze behind. Flat cracked earth with sparse dry grass across the entire bottom, a few dead leaves drifting. No people. Side-view 2D fighting game stage background, nobody standing on the ground, flat open walkable ground across the bottom third, all landmarks in the upper two thirds, detailed late-1990s 32-bit pixel art with painterly dithering, crisp visible square pixels, 16:9, 1280x720, no text, no UI, no border.
```

### P1-4. 맹수 전투 스프라이트 5장

무사수행 습격의 약 29%가 맹수전입니다(`amb_beast`, `journey.ts:253`, 가중치 0.3/1.02). 습격 수는 구간마다 지역 위험도와 날수로 정해져(`journey.ts:118-125`) 한 번 수행에 맹수전이 대략 0.3~1회 납니다. 그런데 맹수의 무기 계열이 `UNARMED`라(`common.ts:492`, `history.ts:347`) `getEnemyFightGridSrc()`가 `grid_enemy_unarmed_8f.jpg`를 돌려주고(`spriteLoader.ts:794`), 호랑이·곰·늑대가 맨손 무승으로 그려집니다. 쓰러질 때도 무승 KO 그림(`spriteLoader.ts:818`, 6번)이 나옵니다.

지역 맹수(`journeyRegions.ts`)는 지리산 산군=호랑이(45행), 외금강 반달곰(65), 묘향산 늑대 무리(85), 진령 표범(106), 대파산 흑곰(146), 하코네 들개 떼(167), 나라 숲·기리시마 멧돼지(187, 206)입니다. 태호 수적(126)은 사람이라 지금대로 둡니다. 시트는 4장으로 묶습니다. 호랑이(표범 겸용), 곰, 늑대(들개 겸용), 멧돼지입니다. 표범을 따로 원하면 호랑이 프롬프트에서 털 무늬만 바꿔 `grid_enemy_beast_leopard_8f.jpg`를 추가합니다.

1280×720, 4열×2행 8프레임, 모든 프레임이 왼쪽을 봅니다. 프레임 순서는 0.5절입니다(기준 `grid_enemy_unarmed_8f.jpg` 실측 1280×720, 참조 이미지로 같이 넣기 권장). 네 발 짐승은 ①번 프레임 높이가 낮아 그대로 176px에 맞추면 몸길이가 화면 절반 가까이 되므로, 연결할 때 기준 높이를 낮춰야 합니다(연결 작업 표 참고).

**`grid_enemy_beast_tiger_8f.jpg`** — 호랑이(표범 겸용)

```text
Sprite sheet of a huge Amur tiger enemy facing LEFT in every frame, orange fur with black stripes and a white belly. Top row, left to right: 1) idle stalking stance, body low, head lowered, tail raised; 2) creeping step forward, belly near the ground; 3) coiled windup rearing back with one forepaw raised high, claws out, jaws open; 4) lunging claw swipe to the left with the front leg fully extended. Bottom row, left to right: 5) low sweeping bite to the left at ground level; 6) defensive recoil with ears flat, snarling, weight shifted back; 7) full-length pounce leaping horizontally to the left with all four legs stretched; 8) hit reaction, knocked back with head turned away and eyes squeezed shut. 2D fighting game sprite sheet: 8 sprites in a 4-column by 2-row grid, each centered in its own equal cell with wide empty gaps so nothing touches, consistent scale across all frames, side view, crisp late-1990s 32-bit pixel art with dark outlines and painterly shading in the style of SNK and Capcom fighting games, solid pure chroma-key green background #00FF00 filling the whole image, no shadows, no ground line, no motion trails, no effects, no text, no grid lines, no green on the subject, 16:9, 1280x720.
```

**`grid_enemy_beast_bear_8f.jpg`** — 곰(반달곰·흑곰 겸용)

```text
Sprite sheet of a large Asiatic black bear enemy facing LEFT in every frame, glossy black fur, a tan muzzle and a white crescent on the chest. Top row, left to right: 1) idle on all fours, head low, swaying; 2) lumbering step forward; 3) rearing up on its hind legs with both forepaws raised high, roaring; 4) heavy downward paw smash to the left. Bottom row, left to right: 5) low sideways swipe at ground level; 6) guarding crouch with forearms raised in front of the face; 7) full-body charge to the left, head down; 8) hit reaction, staggering back with mouth open in pain. 2D fighting game sprite sheet: 8 sprites in a 4-column by 2-row grid, each centered in its own equal cell with wide empty gaps so nothing touches, consistent scale across all frames, side view, crisp late-1990s 32-bit pixel art with dark outlines and painterly shading in the style of SNK and Capcom fighting games, solid pure chroma-key green background #00FF00 filling the whole image, no shadows, no ground line, no motion trails, no effects, no text, no grid lines, no green on the subject, 16:9, 1280x720.
```

**`grid_enemy_beast_wolf_8f.jpg`** — 늑대(들개 겸용)

```text
Sprite sheet of a lean gray wolf enemy facing LEFT in every frame, gray-brown fur with a pale underside. Top row, left to right: 1) idle crouch with hackles raised and teeth bared; 2) low creeping step forward; 3) crouched coil just before springing; 4) leaping bite to the left. Bottom row, left to right: 5) low snapping bite at leg height; 6) defensive back-step with ears flat, growling; 7) full horizontal leap to the left with the body stretched out; 8) hit reaction, yelping and twisting away. 2D fighting game sprite sheet: 8 sprites in a 4-column by 2-row grid, each centered in its own equal cell with wide empty gaps so nothing touches, consistent scale across all frames, side view, crisp late-1990s 32-bit pixel art with dark outlines and painterly shading in the style of SNK and Capcom fighting games, solid pure chroma-key green background #00FF00 filling the whole image, no shadows, no ground line, no motion trails, no effects, no text, no grid lines, no green on the subject, 16:9, 1280x720.
```

**`grid_enemy_beast_boar_8f.jpg`** — 멧돼지

```text
Sprite sheet of a massive wild boar enemy facing LEFT in every frame, dark brown bristly coat and pale curved tusks. Top row, left to right: 1) idle, head low, tusks forward, breath steaming; 2) trotting step forward; 3) pawing the ground with head lowered, ready to charge; 4) upward tusk gore to the left. Bottom row, left to right: 5) low sideways tusk slash; 6) braced defensive stance with bristles raised; 7) full-speed charge to the left with all legs off the ground; 8) hit reaction, knocked sideways, squealing. 2D fighting game sprite sheet: 8 sprites in a 4-column by 2-row grid, each centered in its own equal cell with wide empty gaps so nothing touches, consistent scale across all frames, side view, crisp late-1990s 32-bit pixel art with dark outlines and painterly shading in the style of SNK and Capcom fighting games, solid pure chroma-key green background #00FF00 filling the whole image, no shadows, no ground line, no motion trails, no effects, no text, no grid lines, no green on the subject, 16:9, 1280x720.
```

**`grid_ko_beast_4x2.jpg`** — 맹수 쓰러짐(윗줄)과 꼬리 내림(아랫줄). 칸 순서: 윗줄 [0]호랑이 [1]곰 [2]늑대 [3]멧돼지, 아랫줄 [4]~[7] 같은 순서. 기존 `grid_ko_fallen_4x2.jpg`처럼 낮고 넓게, 모두 머리가 왼쪽. 게임은 KO 그림을 168×104 상자에 맞춰 그립니다(`AutoBattleView.tsx:1939`).

```text
Sprite sheet of defeated wild animals for a 2D fighting game, every head pointing LEFT. Top row, left to right, knocked out and lying limp on their side with eyes closed: 1) Amur tiger, 2) Asiatic black bear, 3) gray wolf, 4) wild boar. Bottom row, left to right, yielding, cowering low and backing away with ears flat and tail tucked: 5) tiger, 6) bear, 7) wolf, 8) boar. Each animal in the same colors as its fight sheet, drawn low and wide like a fallen-fighter sprite. 2D fighting game sprite sheet: 8 sprites in a 4-column by 2-row grid, each centered in its own equal cell with wide empty gaps so nothing touches, consistent scale across all frames, side view, crisp late-1990s 32-bit pixel art with dark outlines and painterly shading in the style of SNK and Capcom fighting games, solid pure chroma-key green background #00FF00 filling the whole image, no shadows, no ground line, no motion trails, no effects, no text, no grid lines, no green on the subject, 16:9, 1280x720.
```

### P1-5. 엔딩: 장례, 계승, 단절 6장

엔딩은 매 판 한 번 반드시 봅니다. 지금은 세 번째 장면 「장례와 계승」(`EndingReportView.tsx:86`)과 바로 다음 연대기 첫 장면 「계승」이 모두 `getDojoMapSrc()`의 탑다운 도장 맵입니다. 계승 장면은 이미지 필드가 없어서(`chronicleText.ts:9-13`, `chronicleBuilder.ts:146-155`) `EndingReportView.tsx:98`의 대체 배경으로 떨어지기 때문입니다. 게임 내내 보던 맵이 시네마틱 배경으로 두 장 연달아 나옵니다. 단절 루트도 첫 장면 `EXTINCT[0]`의 image가 빈 문자열이고(`chronicleText.ts:503`) `chronicleBuilder.ts:131`은 image를 넘기지도 않아 폐허 맵이 나옵니다.

1280×720(기준 `px_end_death.jpg`, `px_chr_stage_kr_2.jpg` 실측 1280×720). 세 나라 공용이므로 건물은 특정 국가색이 약한 동아시아 목조 건축으로 그립니다. 0.2절 안전 영역을 지킵니다.

**`px_end_funeral.jpg`** · `EndingReportView.tsx:85-91` 「{연도}년 · 장례와 계승」
새벽 도장 마당, 흰 상복 차림 제자들이 무릎 꿇고 본관 제단(위패, 향, 칼)을 향함. 맨 앞에 홀로 무릎 꿇은 후계자. 18세기에는 세 나라 모두 흰 상복이라 공용으로 씁니다.

```text
Funeral of an old sword master at his dojo at dawn, 18th-century East Asia. Seen from the training yard looking toward the open main hall: inside, a simple memorial altar with a wooden ancestral tablet, a lit incense burner, two candles and the master's sheathed sword laid across a stand. In the yard, rows of disciples in plain white hemp mourning robes kneel with heads bowed; one figure kneels alone at the very front, closest to the altar; more mourners fade into the morning mist toward the gate. Pale blue dawn light, warm candle glow from the hall, thin incense smoke rising, a few drifting petals. Quiet, dignified grief. Generic East Asian wooden architecture with tiled eaves that could be Korea, China or Japan. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_succession_intact.jpg`** · `chronicleText.ts:28-31` 「온전히 건너간 칼」
아침 수련, 새 종주를 따라 모든 제자가 똑같은 횡베기를 한 몸처럼 긋는다. 같은 현판, 본관 안 창시자의 칼.

```text
Morning practice at a modest East Asian sword dojo a few years after its founder's death. Seen from behind the rows of disciples: everyone performs the same horizontal sword cut in perfect unison, exactly mirroring the new master who leads at the front. Above the main hall entrance hangs the same weathered wooden signboard, blank with no readable characters, and the late founder's sword rests on a rack inside the open hall. Clear spring morning light, long soft shadows, a calm sense of unbroken continuity. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_succession_flourish.jpg`** · `chronicleText.ts:32-36` 「청출어람의 계절」
꽃 핀 봄날 시끄러운 마당, 저마다 다른 변형 초식을 겨루는 젊은 제자들, 툇마루에서 지켜보는 새 종주.

```text
A lively, crowded sword dojo yard in full spring bloom a generation after its founder. Dozens of young disciples practice many different variations at once, twin swords, spear, staff, high leaping cuts and low sweeping cuts, and small groups eagerly demonstrate new moves to each other. The new master sits on the hall veranda watching with quiet pride. A large blossoming tree spreads over the yard, petals drifting through the air. Bright, noisy, energetic midday light. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_succession_degraded.jpg`** · `chronicleText.ts:37-41` 「흐려진 획」
해 질 녘 홀로 칼을 긋는 새 종주, 자세는 맞지만 굳어 있다. 벽의 바랜 초식도, 그늘에서 말없이 지켜보는 늙은 제자 둘, 허공에 남은 더 날카로운 옛 궤적의 잔상.

```text
Dusk in a quiet sword dojo. The diligent new master practices a single sword cut alone in the yard, posture correct but stiff. On the wall inside the open hall hangs a faded ink scroll illustrating the founder's original technique, its brushstrokes far sharper than the movement in the yard. Two elderly senior disciples watch silently from the shadow of the veranda. A faint pale afterimage of a sharper, older sword stroke hangs in the air like a ghost. Washed-out, desaturated colors, cold fading light. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_succession_scattered.jpg`** · `chronicleText.ts:42-46` 「주인 없는 현판」
안개 낀 아침, 못 하나에 비뚤게 걸린 현판, 봇짐을 메고 세 갈래 길로 흩어지는 제자들.

```text
Morning fog outside the gate of a sword dojo whose master died without naming an heir. The wooden signboard over the gate hangs crooked from a single nail. Former disciples carrying travel bundles walk away in different directions along three diverging country roads, none looking back; one pauses at the fork. The empty yard is visible through the half-open gate. Gray-blue fog, muted colors, a feeling of dispersal. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_extinct_beam.jpg`** · `chronicleText.ts:501-506` 단절 루트 첫 장면 「허물어진 도장과 잊힌 현판」
지붕을 헐던 목수가 대들보 틈에서 기름종이에 싼 얇은 수련 일지를 꺼낸다. 바닥에 나뒹구는 빈 현판.

```text
Inside a half-demolished old dojo hall about twenty years after its owner died. Roof tiles have been stripped away, exposing rafters and a patch of sky, and a dusty shaft of sunlight falls through the hole. A village carpenter on a wooden ladder pulls a thin notebook wrapped in oiled paper out of a gap in the main roof beam and looks at it curiously. On the floor below, a faded blank wooden signboard lies among broken tiles and tools. Warm dusty light against a dark interior. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

### P1-6. 서막 빗속 마당 3장

새 게임마다 보는 서막 7장면 가운데 5~7번째(「장례를 치른 다음 날」, 「빗물 새는 도장 마당」, 「새로운 시작」)가 `ruinBg = getDojoMapSrc(국가, 1)`입니다(`PrologueView.tsx:28`, `64`, `71`, `79`). 서막이 끝나자마자 메인 화면에서 같은 탑다운 맵을 다시 봅니다. 눈높이 장면으로 바꿉니다. 대사에 나오는 「땀때가 검게 배인 목검 두 자루」(68행)와 「글씨조차 바랜 빈 현판」(82행)을 그림에 넣고, 사람은 그리지 않습니다. 주인공의 성별과 나이는 판마다 다르고 얼굴은 대사창 초상이 보여 줍니다.

1280×720(기준 `px_chr_v_orphan_gate.jpg`, `px_end_death.jpg` 실측 1280×720). 1750년 이른 봄비, 차가운 청회색. 각국 폐허 맵(`px_dojo_kr_ruin`, `px_dojo_cn_ruin`, P1-2의 `px_dojo_jp_ruin`)과 건물 재료를 맞춥니다.

**`px_prologue_yard_kr.jpg`** — 조선 초가 폐허 도장

```text
Eye-level view across the yard of a ruined Joseon-dynasty Korean sword dojo in cold early-spring rain, 1750. The main hall has a sagging thatched roof full of holes; rain pours through and drips from the eaves into puddles; the paper doors are torn; a low stone wall capped with rotting straw surrounds the muddy, empty yard. Two sweat-darkened wooden practice swords lean against a veranda post. Above the hall entrance hangs a cracked wooden signboard whose characters have faded completely blank. No people. Cold gray-blue rain light, one faint warm glow from inside, melancholy but quietly hopeful. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_prologue_yard_cn.jpg`** — 청 강남의 칠 벗겨진 작은 무관

```text
Eye-level view across the yard of a small ruined Qing-dynasty martial arts hall in Jiangnan, China, in cold early-spring rain, 1750. Red lacquer peels from the pillars, broken black roof tiles on upturned eaves drip rain into puddles, the lattice windows are torn, and a cracked whitewashed wall with a round moon gate surrounds the muddy, empty yard. Two sweat-darkened wooden practice swords lean against a veranda pillar. Above the hall entrance hangs a cracked wooden signboard whose characters have faded completely blank. No people. Cold gray-blue rain light, one faint warm glow from inside, melancholy but quietly hopeful. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_prologue_yard_jp.jpg`** — 에도 시골 검술 도장 폐허

```text
Eye-level view across the yard of a ruined rural kenjutsu dojo in Edo-period Japan in cold early-spring rain, 1750. The gray kawara tile roof sags and is missing tiles; rain streams from the eaves into puddles; torn shoji, a weathered wooden engawa, and a crumbling earthen wall with exposed straw surround the muddy, empty yard. Two sweat-darkened wooden bokken lean against an engawa post. Above the entrance hangs a cracked wooden signboard whose characters have faded completely blank. No people. Cold gray-blue rain light, one faint warm glow from inside, melancholy but quietly hopeful. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

---

## P2. 남의 그림을 빌려 쓰는 삽화 (15장)

### P2-1. 노년 연대기 삽화 6장

사후 연대기는 조건이 맞는 개인 삽화를 최대 3개 고릅니다(`chronicleVignettes.ts:374-385`). 최근 추가된 노년 삽화 6개는 모두 다른 삽화의 그림을 빌려 쓰고, 대부분 원래 주인과 한 연대기에 같이 뽑힐 수 있습니다. 같은 위치(EARLY/MID)끼리면 같은 그림이 연달아 나옵니다.

| 삽화 | 행 | 지금 그림 | 같은 연대기에 같이 뽑힐 수 있는 원래 주인 | 새 파일 |
|---|---|---|---|---|
| `elder_epitaph` 스스로 지은 묘비명 (LATE) | 168 | `sword_grave` | `duel_grave`(281, 진검 전사 시). 무사수행 「검총」(`common.ts:264`)도 같은 그림 | `px_chr_v_epitaph.jpg` |
| `elder_abdication` 살아서 물려준 현판 (EARLY) | 181 | `family_rite` | `child_house`(109). 둘 다 EARLY라 자식이 후계자면 연달아 같은 그림 | `px_chr_v_abdication.jpg` |
| `elder_last_disciple` 관문제자 (EARLY) | 192 | `orphan_school` | `orphan_school`(122, 청·일본). 둘 다 EARLY | `px_chr_v_last_disciple.jpg` |
| `elder_open_books` 누구나 읽을 수 있는 비급 (MID) | 203 | `manual` | `manual_recorded`(331). 둘 다 MID | `px_chr_v_open_books.jpg` |
| `elder_school` 도장 옆의 글방 (MID) | 215 | `orphan_school` | `orphan_school`(122), `elder_last_disciple`(192) | `px_chr_v_village_school.jpg` |
| `elder_memoir` 세 권의 회고록 (LATE) | 227 | `diary` | `spouse_diary`(305) | `px_chr_v_memoir.jpg` |

1280×720(기준 `px_chr_v_family_rite.jpg` 실측 1280×720). 시대는 EARLY가 사후 한 세대 무렵(19세기 전반), MID가 19세기 말, LATE가 20세기 후반입니다(`chronicleBuilder.ts:122`, `222-227`). 원래 그림과 겹치지 않게 장면을 잡았습니다. 예를 들어 `orphan_school`은 밤 등불 아래 툇마루 글방이므로 `village_school`은 한낮의 따로 선 서당과 쌀가마로, `diary`는 도장 시대의 등잔 밑 일기이므로 `memoir`는 현대 문서고로 그립니다.

**`px_chr_v_epitaph.jpg`** — 가을 언덕의 무덤과 새로 세운 비석, 그 앞에서 묘비명을 외는 현대 입문생들

```text
Late 20th century. The hillside grave of an old martial arts founder in autumn: a round grassy burial mound and before it a tall, weathered stone stele with columns of deeply carved inscription, carved marks only and not legible, recently re-erected on a new stone base. A row of young students in white training uniforms kneel in front of the stele with eyes closed, reciting the epitaph from memory, while an older instructor stands to one side. Golden autumn light, silver pampas grass and red maples, distant mountains in haze. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_v_abdication.jpg`** — 툇마루에 물러앉아 침묵하는 백발 창시자(뒷모습), 마당에서 내린 현판을 든 후계자와 첫 도전자

```text
Late afternoon at an East Asian sword dojo, early 19th century. A white-haired old founder in plain robes, seen from behind in silhouette, sits on the wooden veranda of the main hall with hands resting on the knees, watching in silence. In the yard below, the successor stands holding the dojo's old wooden signboard, blank with no readable characters, that has just been taken down, facing a first challenger who bows at the gate; disciples line both sides of the yard. Warm golden light, long shadows, the solemn ceremony of a living handover. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_v_last_disciple.jpg`** — 눈 내린 새벽, 아주 늙은 스승이 어린 막내 제자 하나의 손목을 잡아 자세를 고쳐 준다

```text
Dawn in a snowy dojo yard. A very old sword master with white hair tied up personally corrects the stance of a single small child disciple, gently holding the child's wrist on a wooden practice sword. The master's own sword lies on the veranda behind them. No one else is in the yard; footprints in the fresh snow lead only to the two of them. Soft pink-and-blue dawn light, breath visible in the cold air, intimate and tender. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_v_open_books.jpg`** — 활짝 연 대문 처마 밑에서 온갖 사람이 비급을 베껴 쓰는 19세기 말 풍경

```text
Late 19th century. The front gate of an old sword dojo stands wide open; under the eaves, long low tables are set out where townspeople, travelers, young martial artists and a foreign visitor sit copying illustrated sword-technique manuals by hand. Stacks of hand-copied booklets, ink stones and brushes cover the tables, and a woodblock printer inks a carved block nearby. The open pages show small drawings of sword postures with no readable text. Busy, generous atmosphere in warm afternoon light. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_v_village_school.jpg`** — 낡은 도장 옆 한낮의 서당, 글 읽는 아이들, 쌀가마를 지고 도장으로 가는 옛 학동들

```text
Late 19th century, a small rural village. A modest village schoolhouse built with the late founder's bequest stands beside an aging sword dojo with a patched roof. Through the schoolhouse's open doors, many village children sit on the floor reading aloud from books with their teacher. In the lane outside, two grown men who once studied there carry sacks of rice on their shoulders toward the dojo gate. A persimmon tree with orange fruit, bright warm afternoon, gentle and hopeful. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_chr_v_memoir.jpg`** — 현대 대학 문서고, 흰 장갑을 낀 연구자가 나란히 놓인 회고록 세 권을 넘긴다

```text
Late 20th century university archive reading room. Under a desk lamp, a researcher wearing white cotton gloves carefully turns the pages of three thread-bound old memoir volumes laid side by side; the open third volume shows long columns of handwritten names rendered as illegible brush strokes. Nearby lie a later hand-copied edition and index cards. Shelves of archival boxes fade into darkness. Warm lamp light in a dark room, reverent quiet. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

### P2-2. 은거 고수 9장

은거 고수 9명(조선·청·일본 각 3명)이 모두 `px_chr_v_grandmaster.jpg`를 씁니다(`masters.ts:204`). 이 그림은 연대기 삽화 「스승보다 멀리 간 제자」(`chronicleVignettes.ts:73`)의 것이라 한 판에서 고수를 만날 때마다 같은 그림이 나오고 엔딩에서 또 나옵니다. 각 고수의 장면 문장(`masters.ts`의 `scene`)을 그대로 그림으로 옮깁니다. 파일 이름은 `px_jr_` + 고수 `key`입니다.

1280×720(기준 `px_chr_v_grandmaster.jpg` 실측 1280×720). 사건 창 삽화라 주제를 세로 가운데에 둡니다.

**`px_jr_master_jiri.jpg`** · 청학동 은자(`masters.ts:51`) — 안개 낀 초가 마당, 군더더기 없는 비질로 낙엽을 쓰는 백발 노인

```text
A misty thatched-cottage courtyard deep in the Cheonghak-dong valley of Jirisan, Joseon Korea. A white-haired hermit in a faded white robe sweeps fallen leaves with a twig broom; every stroke is precise and economical and the leaves gather in one perfectly straight line. A wooden sword leans against the mud wall of the cottage. Thick morning mist, autumn colors, absolute stillness. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_master_geumgang.jpg`** · 구룡폭포 노승(`masters.ts:67`) — 폭포 옆 바위굴, 물보라를 맞으며 미동 없이 앉은 마른 노승

```text
A rock cave beside the thundering Guryong waterfall in the Diamond Mountains, Geumgangsan, Joseon Korea. A gaunt old Buddhist monk in a gray robe sits in meditation at the mouth of the cave, drenched by spray and utterly motionless. White water crashes into a deep jade pool below, a faint rainbow in the mist, pale granite cliffs. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_master_gwanseo.jpg`** · 백두 포수 노인(`masters.ts:83`) — 범 가죽이 널린 사냥막, 숫돌에 창날을 가는 외팔 노인

```text
A hunter's log hut at the foot of snowy mountains on the northwestern frontier of Joseon Korea. A tiger skin is stretched on a drying frame outside. A one-armed old hunter in fur-lined clothes sits on a stump, sharpening a long spear blade on a whetstone braced against his knee. Snow on the ground, smoke from the chimney, cold steel-blue light. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_master_huashan.jpg`** · 화산 검선(`masters.ts:100`) — 구름 위 바위 정자, 차를 끓이는 노인, 기둥에 무심히 기댄 검

```text
A tiny stone pavilion perched on a cliff above a sea of clouds on the Wild Goose Peak of Mount Huashan, Qing-dynasty China. An old swordsman with a long white beard brews tea on a small clay stove; his sword leans carelessly against a pavilion pillar. Sheer granite cliffs and twisted pines, golden late-afternoon light over the clouds. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_master_jiangnan.jpg`** · 진가구 노권사(`masters.ts:116`) — 서호 버드나무 아래 느릿한 태극, 손을 따라 모였다 흩어지는 물고기

```text
West Lake in Hangzhou, Qing-dynasty China. Under a great weeping willow at the water's edge, an old man in a plain gray robe slowly moves his hands in tai chi; in the lake beside him a school of orange carp gathers and swirls, following the motion of his hand. Misty lake, a distant pagoda and stone causeway, soft spring light. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_master_huguang.jpg`** · 묘강 독수(`masters.ts:132`, 여성) — 대숲 오두막, 문 앞에 마르는 형형색색 독초, 처마 끝의 가는 바늘들

```text
A small hut hidden in a dense bamboo forest in the Miao borderlands of Huguang, Qing-dynasty China. Bundles of brightly colored poisonous herbs hang drying by the door, and thin silver needles dangle from the eaves, glinting. A woman in dark indigo Miao clothing with silver hair ornaments sits on the doorstep grinding something in a stone mortar, eyes on the path. Shafts of gold light through the bamboo, eerie quiet. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_master_tokaido.jpg`** · 떠돌이 검호(`masters.ts:148`) — 오이강 나루 찻집 툇마루, 경단을 먹는 남루한 낭인, 반들반들한 칼집

```text
A teahouse at the Oi River crossing on the Tokaido road, Edo-period Japan. On the bench of the open veranda a shabbily dressed ronin in a worn kimono, straw hat pushed back, eats skewered dango; the sword scabbard beside him is the only thing polished to a gleam. Travelers and porters wait for the river crossing, a plain cloth banner flutters, and Mount Fuji is faint in the distance. Mild daylight. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_master_kyoto.jpg`** · 천구 가면의 검객(`masters.ts:164`) — 달빛 내린 삼나무 숲 공터, 붉은 천구 가면, 양손의 목검

```text
A moonlit clearing in the ancient cedar forest of Mount Kurama near Kyoto, Edo-period Japan. A mysterious swordsman wearing a red long-nosed tengu mask stands in the center holding a wooden sword in each hand, robes stirring in the wind. Towering cedar trunks ring the clearing. Cold silver moonlight and deep blue shadows, eerie. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_master_kyushu.jpg`** · 지겐류 노검객(`masters.ts:180`) — 굵은 말뚝을 기합과 함께 내리치는 노인, 연기 나는 말뚝, 멀리 사쿠라지마

```text
An open practice ground in a castle town in Satsuma, Kyushu, Edo-period Japan. A thick wooden post is driven into the earth. An old samurai with a gray topknot holds a heavy wooden sword high beside his head in the Jigen-ryu stance and strikes down at the post with a great shout; splinters fly and the post smokes from the impact. The volcano Sakurajima looms in the distance with a plume of ash. Harsh bright sunlight. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

---

### P2-3. 이계 사건 4장 (2026-11-25 추가)

이계 기술을 배울 길을 넓히면서 새로 넣은 무사수행 사건입니다(`src/data/journeyEvents/arcane.ts`). 지금은 그림 없이 나옵니다. 사건 창 삽화라 1280×720이고, 주제는 세로 가운데에 둡니다. 술법의 빛은 이 그림들의 유일한 강한 광원으로 쓰고, 과장된 판타지 이펙트보다 "조선·청·에도의 풍경 속에 이상한 것 하나"로 그립니다.

**`px_jr_arcane_kr.jpg`** · 「이계의 은자 — 산신각의 이인(異人)」(`arcane_kr_hermit`, 조선 지역 은거 고수 자리)
눈 덮인 산신각 뒤 너럭바위에 홑옷 차림의 사내가 앉아 있고, 그가 앉은 자리만 눈이 녹아 김이 오른다.

```text
A small Korean mountain-spirit shrine (sansingak) with a tiled roof deep in a snowy pine forest, Joseon dynasty, 18th century. Behind the shrine, on a broad flat boulder, sits a lean man in a thin single-layer white hemp robe, cross-legged, eyes closed. Everything around is covered in deep snow, but a perfect circle of bare wet rock surrounds him and white steam rises from it, glowing faintly orange from within as if from hidden embers. A traveling swordsman with a straw hat stands small in the foreground snow, looking at him. Cold blue-gray winter light with one warm orange glow at the center. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_arcane_cn.jpg`** · 「이계의 은자 — 곤륜에서 내려온 방사(方士)」(`arcane_cn_hermit`, 청 지역 은거 고수 자리)
골짜기에 연단로 연기가 피어오르고, 그을린 도포의 방사가 화로에 부채질을 하다 고개를 든다.

```text
A misty mountain gorge in Qing-dynasty China with sheer karst cliffs and pine trees. On a stone ledge stands a bronze alchemical furnace (liandan lu) on three legs, thick blue-white smoke curling up from it, a faint blue electric crackle dancing inside the smoke. A Taoist fangshi alchemist with a topknot and soot-stained gray robes, holding a palm-leaf fan, turns his head toward a visiting swordsman who stands small on the path below. Jars, scrolls and herbs around the furnace. Cool jade-and-gray palette with one bright blue-white accent. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_arcane_jp.jpg`** · 「이계의 은자 — 음양사(陰陽師)」(`arcane_jp_hermit`, 일본 지역 은거 고수 자리)
종이 학 한 마리를 따라가니 작은 사당 앞에서 흰 가리기누 차림의 음양사가 부적을 접고 있다.

```text
A tiny weathered Shinto roadside shrine in a cedar forest at dusk, Edo-period Japan, with a small vermilion torii and stone lanterns. In front of it an onmyoji in a white kariginu robe and black eboshi cap kneels, folding paper talismans. A single folded paper crane glows softly and floats in the air between him and a ronin who has just arrived on the path, small in the foreground. Paper ofuda charms hang from a rope. Deep indigo and moss-green palette with one soft pale-gold glow from the paper crane. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_meteor.jpg`** · 「별똥별이 떨어진 자리」(`tr_meteor`, 보물 자리, 세 나라 공통)
나무가 부채꼴로 쓰러진 숲 한가운데 움푹 꺼진 구덩이, 바닥의 검은 돌이 아직 따뜻해 김을 낸다.

```text
A forest clearing at dawn after a meteor strike, East Asian mountains. Tall pine trees lie flattened outward in a fan pattern around a shallow scorched crater. At the bottom of the crater sits a fist-sized black stone with faint glowing red cracks, thin steam rising from it into the cold air. A lone swordsman crouches at the crater's rim, reaching a hand toward the stone. Blue pre-dawn light, smoke and mist, one deep red-orange glow from the stone. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

## P3. 있으면 좋은 장면 (12장)

자주 보는 장면만 골랐습니다. 위에서부터 우선입니다.

### P3-1. 무술대회 전투 무대 3장

무술대회는 예선 4판과 본선 최대 4판을 치르는데(`TournamentView.tsx:18`, `tournament.ts:16-24`), 대회 경기는 목검 승부라(`tourney.ts:406`) 모두 대련 무대 `px_battle_stage.jpg`, 곧 대숲 속 도장 앞마당에서 열립니다(`AutoBattleView.tsx:1858`). 대회장은 나라마다 정해져 있습니다(`tournament.ts:33-37`). 대진표 화면(`TournamentView.tsx`)에는 그림이 없습니다.

1280×720, 0.3절 규칙(기준 `px_battle_stage.jpg` 실측 1280×720). 관중은 원경의 작은 실루엣으로만 둡니다.

**`px_battle_tourney_stage_kr.jpg`** — 한양 훈련원 특설 비무대

```text
Background for a national martial arts tournament held at the Hullyeonwon military training ground in Hanyang, Joseon Korea, on a bright day. A wide flat packed-earth arena floor. Behind it, a rope barrier with a distant crowd of spectators in white clothes and black gat hats as small silhouettes, tall poles with colorful five-direction military banners, a war drum on a stand, and a raised official pavilion with a curved tiled roof where officials in red robes sit. Granite mountains on the horizon, clear blue sky with white clouds. Side-view 2D fighting game stage background, nobody standing on the ground, flat open walkable ground across the bottom third, all landmarks in the upper two thirds, detailed late-1990s 32-bit pixel art with painterly dithering, crisp visible square pixels, 16:9, 1280x720, no text, no UI, no border.
```

**`px_battle_tourney_stage_cn.jpg`** — 강남 금릉 대연무장

```text
Background for a grand martial arts tournament in the great arena of Jinling, Nanjing, Qing-dynasty China, on a bright day. A wide flat stone-paved arena floor. Behind it, a red-lacquered grandstand under upturned tiled eaves hung with red lanterns and silk banners, a distant crowd of spectators as small silhouettes, a large bronze gong on a frame, and beyond them the city wall and a pagoda. Clear sky with drifting clouds. Side-view 2D fighting game stage background, nobody standing on the ground, flat open walkable ground across the bottom third, all landmarks in the upper two thirds, detailed late-1990s 32-bit pixel art with painterly dithering, crisp visible square pixels, 16:9, 1280x720, no text, no UI, no border.
```

**`px_battle_tourney_stage_jp.jpg`** — 에도성 어전 특설 무대

```text
Background for the shogun's sword tournament on a special ground inside Edo Castle, Edo-period Japan, on a bright day. A wide flat ground of white raked gravel. Behind it, an enclosure of black-and-white striped jinmaku curtains bearing plain circular crests, a raised viewing pavilion with lowered bamboo blinds, rows of seated samurai retainers as small silhouettes, stone castle walls and a white castle turret beyond, pine trees. Clear sky. Side-view 2D fighting game stage background, nobody standing on the ground, flat open walkable ground across the bottom third, all landmarks in the upper two thirds, detailed late-1990s 32-bit pixel art with painterly dithering, crisp visible square pixels, 16:9, 1280x720, no text, no UI, no border.
```

### P3-2. 온보딩 사건 2장 (+ 기존 그림 연결 1건)

매 판 2·3번째 턴에 반드시 나오는 온보딩 사건(`events.ts:120-239`)은 초상 두 개만 나오고 그림이 없습니다. 사건 창은 이미 `illustration`을 지원합니다(`types/game.ts:585`). 1280×720(기준 `px_chr_v_orphan_gate.jpg` 실측 1280×720), 사건 창 삽화라 주제를 세로 가운데에 둡니다. 건물은 세 나라 공용으로 특정 국가색이 약하게 그립니다.

「빗속에 무릎 꿇은 천재 고아」(`life_genius_orphan`, `events.ts:1215`)는 새로 그리지 않습니다. 빗속 대문 앞 아이 그림 `px_chr_v_orphan_gate.jpg`가 이미 같은 장면이고, 아이를 돌려보내면 연대기에서 같은 대문이 다시 나오는 연결 장치가 됩니다(연결 작업 표 참고).

**`px_ev_onboard_thug.jpg`** · `events.ts:123` 「빗물 새는 마당의 불청객」(2턴째) — 한낮 땡볕, 대문을 걷어차고 몽둥이를 든 채 들어서는 왈패 두목과 패거리

```text
Harsh midday sun over a shabby little sword dojo. Seen from inside the dusty yard: the weathered wooden gate has just been kicked open, and a burly thug leader in rough peasant clothes with rolled sleeves strides in swinging a wooden club, sneering, with three ragged henchmen crowding behind him in the gateway. A bucket and a broken practice dummy lie in the yard; the small roof over the gate is missing tiles. Bleached hot light with hard short shadows, tense. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_ev_onboard_first_disciple.jpg`** · `events.ts:187` 「첫 번째 문하생」(3턴째) — 새벽, 낡은 책을 품에 안고 반쯤 열린 대문으로 들어서는 동네 청년

```text
Early dawn at the gate of a shabby little sword dojo. A shy young village man in plain work clothes steps through the half-open gate into the empty yard, hugging an old, worn book to his chest; behind him the village lane is still blue with morning mist. A single wooden sword rests against the veranda. Soft cool dawn light warming at the horizon, hopeful. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

### P3-3. 대오의 자리 6장

무사수행 6개 지역의 마지막 구간에 있는 「대오(大悟)의 자리」(`common.ts:154-161`, `journeyRegions.ts`의 `vista`)는 깨달음을 크게 올려 주는 절정 장면인데 그림이 없습니다. 파일 이름은 `px_jr_` + vista `key`입니다. 1280×720(기준 `px_chr_v_sword_grave.jpg` 실측 1280×720). 길손(주인공)은 작게, 뒷모습으로만 그립니다.

**`px_jr_vista_jiri.jpg`** · `common.ts:156` 천왕봉 일출

```text
Sunrise from Cheonwangbong, the summit of Jirisan in Joseon Korea. A lone traveler with a sword on the back stands on the rocky summit, seen small from behind; a sea of clouds spreads below, a red sun rises over the eastern horizon, and layered blue ridges emerge from the clouds. Breathtaking stillness. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_vista_geumgang.jpg`** · `common.ts:157` 구룡폭포

```text
Guryong Falls, the Falls of Nine Dragons, in the Diamond Mountains of Joseon Korea: a towering white waterfall plunges over pale granite into a deep jade pool, a rainbow shimmering in the spray. A small lone traveler stands on a rock ledge looking up. Autumn foliage on the cliffs. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_vista_huashan.jpg`** · `common.ts:158` 장공잔도

```text
The Changkong plank walkway on Mount Huashan, Qing-dynasty China: narrow wooden planks pinned to a sheer granite cliff face with iron chains for handholds, clouds flowing far below. A lone traveler presses against the cliff halfway along, seen small from a distance. Dizzying height, crisp cold light. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_vista_wudang.jpg`** · `common.ts:159` 무당산 금정

```text
The Golden Summit of Wudang Mountain, Qing-dynasty China: the gilded bronze Golden Hall atop the highest peak blazes gold in the sunlight above a sea of clouds, ringed by stone walls and steep stairways, with wind-bent pines. A small lone traveler climbs the final stairs. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_vista_kurama.jpg`** · `common.ts:160` 구라마산의 밤 (P2-2 `master_kyoto`와 같은 산이므로 공터가 아니라 뿌리 길로 구분)

```text
Night on the root path of Mount Kurama, Edo-period Japan: enormous gnarled cedar roots snake across the forest trail, moonlight slanting between giant trunks. High on a branch a shadowy figure crouches, watching, visible only as a silhouette. Below, a small lone traveler with a lantern pauses on the roots. Deep blue darkness, silver moonlight, uncanny. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

**`px_jr_vista_sakurajima.jpg`** · `common.ts:161` 사쿠라지마 분연

```text
Sakurajima volcano rising from Kagoshima Bay, Edo-period Japan, erupting a towering column of gray ash into the sky; the bay reflects the plume and the ground trembles. A small lone traveler stands on the shore at the edge of the castle town, watching. Dramatic, ominous light with an orange glow at the crater. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

### P3-4. 금기 사망 엔딩 1장

금기 초식의 반동으로 죽으면(`주화입마 반동사`) 엔딩 첫 대사는 마지막 일격 직후 경맥이 터져 그 자리에 무릎을 꿇은 채 숨졌다고 하는데(`EndingReportView.tsx:59-60`), 배경은 겨울밤 이부자리 임종 그림입니다(`EndingReportView.tsx:71`, `77`). 1280×720(기준 `px_end_death.jpg` 실측 1280×720).

**`px_end_forbidden.jpg`** — 불탄 원 한가운데 칼을 꽂고 무릎 꿇은 채 굳은 검객의 실루엣, 몸에서 꺼져 가는 붉은 기맥

```text
Aftermath of a forbidden sword technique at night: a lone swordsman kneels motionless at the center of a scorched, cracked circle of earth, sword driven into the ground, face hidden in shadow. Faint crimson-violet energy veins fade from the body like dying embers, and wisps of smoke rise. Around the circle, trees are bent outward and debris lies scattered as if by a blast. A full moon behind thin clouds. Silhouette, tragic and awe-inspiring. Detailed 2D pixel art in the style of a late-1990s 32-bit JRPG cutscene, painterly pixel shading with fine dithering, crisp visible square pixels, muted earthy palette with one strong accent light, cinematic wide shot with small figures, layered atmospheric depth, darker and simpler foreground along the bottom edge, 16:9, 1280x720, no text, no letters, no UI, no border, no watermark.
```

---

## 검토했지만 이번 배치에서 뺀 것

- 맨손 중년·원로 전투 시트: `getHeroFightGridSrc()`(`spriteLoader.ts:761-766`)는 35~54세 맨손 주인공에게 청년 시트를 그대로 쓰고, 55세 이상은 국가 구분 없는 `grid_unarmed_old(_f)_8f`를 씁니다. 무기 계열이 맨손인 판에만 해당해 뺐습니다. 하려면 `grid_unarmed_{kr|cn|jp}_{m|f}_{mid|old}_8f` 12장입니다.
- NPC 초상(`grid_portraits_npcs_4x3.jpg`)은 세 나라 공용이지만 범동아시아풍이라 어색하지 않습니다.
- 대체역사 루트의 세 번째 장면은 타이틀 그림을 재사용하고(`chronicleText.ts:419`, `451`, `483`), 두 번째 장면은 `px_end_era19`를 세 나라가 같이 씁니다(411, 436, 468). 드문 루트라 뺐습니다. 하려면 `px_chr_alt_{kr|cn|jp}_3.jpg` 3장입니다.
- 영길리 사관과의 목검 시합(`history.ts:481-495`)은 기본 낭인 적 스프라이트로 그려집니다. 한 번뿐인 사건입니다.
- 호위 중 전사, 역병, 열병, 폐관 중 주화입마로 죽으면 임종 그림이 나옵니다. 문맥상 무리가 없습니다.
- 무사수행 필드는 `JourneyView.tsx`가 수묵 담채풍으로 직접 그립니다(11행 주석). 지역 배경 그림은 필요 없습니다.
- 무사수행 「검총」(`common.ts:264`)과 「부적으로 봉인된 상자」(`common.ts:383`)는 연대기 그림(`sword_grave`, `sealed_box`)을 쓰지만 내용이 같은 장면이라 그대로 둡니다. P2-1이 들어가면 `sword_grave`는 칼 꽂은 돌무더기 장면 두 곳에서만 쓰입니다.
- 노년부 사건 60종(`journeyEvents/elder*.ts`)과 「후계자 지명의 밤」(`heir_conflict`, `events.ts:653`) 같은 조건부 사건은 한 사건을 볼 확률이 낮아 뺐습니다.
- 파비콘이 없습니다(`index.html`에 icon 링크 없음, 브라우저가 `/favicon.ico`를 요청해 404). 원하면 32×32 픽셀 아이콘 하나와 `<link rel="icon">` 한 줄입니다.
- 화면에 나오지 않는 참조: `MainDojoHub.tsx`(`dojo_*.jpg`, `merchant.jpg`), `DojoWorld2D.tsx`(국가 구분 없이 범용 맵 고정), `RealtimeBattle.tsx`(`sheet_fight_*.jpg`)는 어디서도 import되지 않습니다. 파일은 모두 있습니다. 반대로 `battle_bg.jpg`, `title_bg.jpg`, `grid_fight_old_8f.jpg`, `sheet_fight_cn.jpg`, `sheet_fight_kr.jpg`, `pt_*.jpg` 8장, `sp_*` 중 8장(`sp_disciple_top`, `sp_enemy_fight`, `sp_hero_fight`, `sp_hero_female_fight`, `sp_hero_female_top`, `sp_hero_old_fight`, `sp_hero_top`, `sp_hero_young_top`)은 어떤 코드도 참조하지 않습니다.

---

## 생성 후 연결 작업 (개발자용)

이 문서를 쓰면서 코드는 고치지 않았습니다. 그림을 넣은 뒤 아래를 바꾸면 됩니다.

| 그림 | 파일:행 | 바꿀 내용 |
|---|---|---|
| `px_jr_tiger`, `px_jr_canal_procession`, `px_jr_refugees`, `px_jr_dejima` | `history.ts:326`, `373`, `516`, `829` | 없음. 경로가 이미 들어 있어 파일만 넣으면 나옵니다. |
| `px_dojo_jp_ruin`, `px_dojo_jp_grand` | `spriteLoader.ts:724` | `getDojoMapSrc()`에 `if (country === 'JAPAN') return isGrand ? '/assets/px_dojo_jp_grand.jpg' : '/assets/px_dojo_jp_ruin.jpg';`를 넣고 범용 맵은 마지막 대체로 남깁니다. 프리로드 목록(`spriteLoader.ts:828-833`)에 두 장 추가. 메인 화면, 엔딩, 서막은 모두 이 함수를 거치므로 따로 고칠 곳은 없습니다. |
| `px_battle_duel_stage_kr`, `_cn` | `spriteLoader.ts:725` 다음, `AutoBattleView.tsx:1858`, `EndingReportView.tsx:71`, `77` | `getDojoMapSrc()` 옆에 `getBattleStageSrc(country, { isRealDuel, isTournament })`를 만들고 1858행에서 `state.country`로 부릅니다(일본은 기존 `px_battle_duel_stage.jpg`). 엔딩 71·77행의 진검 전사 배경도 같은 함수로 바꿉니다. 프리로드(`spriteLoader.ts:834-835`)에 추가. |
| (같은 곳의 버그) | `EndingReportView.tsx:54` | 고쳤습니다(`startsWith('진검결투 전사')`). 무사수행 중 전사도 진검 무대로 나옵니다. |
| `grid_enemy_beast_{tiger,bear,wolf,boar}_8f` | `spriteLoader.ts:790` | `getEnemyFightGridSrc()` 맨 앞에서 이름으로 판별합니다. `/(산군\|호랑이\|표범)/`→tiger, `/곰/`→bear, `/(늑대\|들개)/`→wolf, `/멧돼지/`→boar. 현재 데이터에서 사람 이름과 겹치지 않는 것을 확인했습니다. `범`은 「범을 잡던 관서의 사냥꾼」(`masters.ts:80`, 사람)과 겹치므로 쓰지 않습니다. |
| (같은 시트) | `AutoBattleView.tsx:1876`, `1990`, `2507` | `176 / refHeight`의 기준 높이를 맹수 시트일 때 120 안팎으로 낮춥니다. 0번 프레임 높이로 맞추면 네 발 짐승은 몸길이가 사람의 두 배 가까이 됩니다. |
| `grid_ko_beast_4x2` | `AutoBattleView.tsx:1924-1944`, `spriteLoader.ts:799-823` | 적이 맹수 시트면 KO 시트를 `/assets/grid_ko_beast_4x2.jpg`로, 인덱스는 호랑이 0, 곰 1, 늑대 2, 멧돼지 3, `f.yielded`면 +4. 이 시트는 전부 왼쪽을 보므로 1943-1944행의 `koIdx === 0`이면 오른쪽이라는 규칙에서 빼야 합니다. |
| `px_jr_arcane_kr`, `_cn`, `_jp`, `px_jr_meteor` | `src/data/journeyEvents/arcane.ts`의 `HERMITS` 정의와 `meteor.build` | `HermitDef`에 `illustration` 필드를 더해 세 은자에 각각 경로를 넣고, `build`의 반환값에 `illustration: h.illustration`을 넣습니다. 운석은 `meteor.build` 반환값에 `illustration: '/assets/px_jr_meteor.jpg'` 한 줄. |
| `px_end_funeral` | `EndingReportView.tsx:86` | 단절 루트가 아니면 `'/assets/px_end_funeral.jpg'`, 단절이면 지금처럼 `getDojoMapSrc(state.country, 1)`. |
| `px_chr_succession_{intact,flourish,degraded,scattered}` | `chronicleText.ts:9-13`, `27-47`, `chronicleBuilder.ts:146-155` | `Fragment`에 `image?: string` 추가, `SUCCESSION_OPENING` 네 항목에 `image: IMG('succession_intact')` 등, `openingEntry`에 `image: opening.image`. |
| `px_chr_extinct_beam` | `chronicleText.ts:503`, `chronicleBuilder.ts:131` | `image: ''`를 `IMG('extinct_beam')`으로 바꾸고, 131행 항목에 `image: EXTINCT[0].image`를 넣습니다. 지금은 값이 있어도 넘기지 않습니다. |
| `px_prologue_yard_{kr,cn,jp}` | `PrologueView.tsx:28` | `ruinBg`를 국가 코드로 만든 `/assets/px_prologue_yard_${cc}.jpg`로 바꿉니다. 64·71·79행이 이 값을 씁니다. 원하면 32행(첫 장면, 타이틀 그림 재사용)도 같은 그림으로. |
| `px_chr_v_{epitaph,abdication,last_disciple,open_books,village_school,memoir}` | `chronicleVignettes.ts:168`, `181`, `192`, `203`, `215`, `227` | 각각 `IMG('epitaph')`, `IMG('abdication')`, `IMG('last_disciple')`, `IMG('open_books')`, `IMG('village_school')`, `IMG('memoir')`. |
| `px_jr_master_*` 9장 | `masters.ts:204` | `` illustration: `/assets/px_jr_${m.key}.jpg` ``. 사건 창은 로드에 실패하면 그림을 숨기므로(`MerchantAndEventModals.tsx` `EventModal`의 `onError`) 9장을 모두 넣은 뒤 바꿉니다. |
| `px_battle_tourney_stage_{kr,cn,jp}` | `AutoBattleView.tsx:1858` (위 `getBattleStageSrc`) | `battle.isTournament`이면 국가별 대회 무대. 이 값은 `tourney.ts:407`, `tournament.ts:168`, `244`에서 켜집니다. |
| `px_ev_onboard_thug`, `px_ev_onboard_first_disciple` | `events.ts:123`(`onboard_thug`), `187`(`onboard_first_disciple`) | 각 사건 객체에 `illustration: '/assets/px_ev_onboard_thug.jpg'`, `'/assets/px_ev_onboard_first_disciple.jpg'` 추가. |
| (기존 그림 연결) | `events.ts:1215`(`life_genius_orphan`) | `life_genius_orphan`에 `illustration: '/assets/px_chr_v_orphan_gate.jpg'` 추가. 새로 그릴 필요 없습니다. |
| `px_jr_vista_*` 6장 | `common.ts:171` 다음 | vista `build`에 `` illustration: `/assets/px_jr_${key}.jpg` `` 추가. |
| `px_end_forbidden` | `EndingReportView.tsx:71`, `77` | `isForbiddenDeath`이면 `'/assets/px_end_forbidden.jpg'`. |
