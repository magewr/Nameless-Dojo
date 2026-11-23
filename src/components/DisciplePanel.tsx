import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Disciple, DiscipleRole, GameState } from '../types/game';
import { getMaxDisciples } from '../engine/gameLogic';
import { canTalkToDisciple } from '../engine/sectLogic';
import { getLoyaltyCeiling, shownTemperament, TEMPERAMENTS } from '../data/temperament';
import { PixelPortrait } from './PixelPortrait';
import { HANJA_GLOSSARY, InGameSelect, InGameTooltip } from './InGameUI';
import { AlertTriangle, Crown, Eye, Info, MessageCircle, TrendingDown, TrendingUp, UserX, X, Zap } from 'lucide-react';
import { sound } from '../engine/sound';

// 문하생 탭: 한눈에 보는 현황 → 걸러 보기·정렬 → 제자 카드 → 상세(기질·충성 사정·면담·파문)

interface Props {
  state: GameState;
  onTeachAll: () => void;
  onTeachSkill: (discipleId: string, skillId: string) => void;
  onSetRole: (discipleId: string, role: DiscipleRole) => void;
  onTalk: (discipleId: string) => void;
  onExpel: (discipleId: string) => void;
}

export const ROLE_LABEL: Record<DiscipleRole, string> = {
  STUDENT: '수련생',
  INSTRUCTOR: '사범',
  ESCORT: '호위',
  HEIR: '★ 후계자',
};

const ROLE_SUB: Record<DiscipleRole, string> = {
  STUDENT: '일반 수련생',
  INSTRUCTOR: '사범 · 수련 지도 보조 (급여 발생)',
  ESCORT: '호위 · 상단 호위 수익↑',
  HEIR: '유파의 차기 도장주',
};

type FilterId = 'ALL' | 'ALERT' | 'TROUBLE' | 'INSTRUCTOR' | 'ESCORT' | 'STUDENT';
type SortId = 'LOYALTY' | 'POWER' | 'AGE' | 'JOINED';

const powerOf = (d: Disciple) => d.stats.str + d.stats.agi + d.stats.vit + d.stats.wil + d.stats.ins + d.stats.qi;

const loyaltyTone = (v: number) => (v >= 70 ? { bar: 'bg-emerald-500', text: 'text-emerald-300' } : v >= 45 ? { bar: 'bg-amber-500', text: 'text-amber-300' } : { bar: 'bg-red-600', text: 'text-red-300' });

// 스승이 눈여겨봐야 할 사정. (상한을 넘어 충성이 빠지는 정도는 막대 옆 화살표로만 알린다)
function getAlert(d: Disciple): { text: string; tone: 'DANGER' | 'WARN' } | null {
  if (d.temperament === 'SCHEMER' && d.exposed) return { text: d.watched ? '흑심이 드러남 · 감시 중' : '흑심이 드러남', tone: 'DANGER' };
  if (d.loyalty < 30) return { text: '마음이 거의 떠났다', tone: 'DANGER' };
  if (d.loyalty < 45) return { text: '불만이 쌓이고 있다', tone: 'WARN' };
  return null;
}

const TemperamentBadge: React.FC<{ d: Disciple }> = ({ d }) => {
  const shown = shownTemperament(d);
  if (!shown) {
    return (
      <InGameTooltip title="기질 — 아직 모른다" body="입문한 지 얼마 되지 않아 사람됨을 알 수 없습니다." sub="한 해쯤 곁에 두거나, 면담을 하면 기질이 드러납니다.">
        <span className="text-[10px] px-1.5 py-0.5 border border-dashed border-[#6b4728] text-[#a8957a] whitespace-nowrap">기질 ?</span>
      </InGameTooltip>
    );
  }
  const meta = TEMPERAMENTS[shown];
  return (
    <InGameTooltip title={`기질 — ${meta.label} (${meta.hanja})`} body={meta.desc} sub={`바라는 것: ${meta.wants} · 위험: ${meta.risk}`}>
      <span className={`text-[10px] px-1.5 py-0.5 border font-bold whitespace-nowrap ${meta.badge}`}>{meta.label}</span>
    </InGameTooltip>
  );
};

const LoyaltyBar: React.FC<{ d: Disciple; cap: number; compact?: boolean }> = ({ d, cap, compact }) => {
  const tone = loyaltyTone(d.loyalty);
  const falling = d.loyalty > cap;
  const rising = d.loyalty < cap && !(shownTemperament(d) && TEMPERAMENTS[shownTemperament(d)!].trouble);
  return (
    <InGameTooltip
      title={`충성 ${d.loyalty} / 상한 ${cap}`}
      body="돌봐 주면 오르지만, 기질이 바라는 것이 채워지지 않으면 상한에 막힙니다. 상한을 넘은 충성은 계절마다 빠집니다."
      sub="낮은 충성은 말썽과 야반도주, 반란으로 이어집니다."
      className="w-full"
    >
      <div className="w-full flex items-center gap-1.5">
        <div className="relative flex-1 h-2 bg-[#120c08] border border-[#5c432c]">
          <div className={`h-full ${tone.bar}`} style={{ width: `${d.loyalty}%` }} />
          {cap < 100 && <div className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-[#fde68a]" style={{ left: `calc(${cap}% - 1px)` }} />}
        </div>
        <span className={`text-[11px] font-bold tabular-nums ${tone.text} ${compact ? 'w-6 text-right' : 'w-7 text-right'}`}>{d.loyalty}</span>
        {falling ? <TrendingDown className="w-3 h-3 text-red-400 shrink-0" /> : rising ? <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" /> : <span className="w-3 shrink-0" />}
      </div>
    </InGameTooltip>
  );
};

export const DisciplePanel: React.FC<Props> = ({ state, onTeachAll, onTeachSkill, onSetRole, onTalk, onExpel }) => {
  const [filter, setFilter] = useState<FilterId>('ALL');
  const [sort, setSort] = useState<SortId>('LOYALTY');
  const [skillToTeach, setSkillToTeach] = useState<string>(state.skills[0]?.id || '');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmExpel, setConfirmExpel] = useState(false);

  const alive = state.disciples.filter((d) => !d.dead);
  const maxD = getMaxDisciples(state.facilities);
  const rows = useMemo(
    () =>
      alive.map((d) => {
        const ceiling = getLoyaltyCeiling(d, state);
        const shown = shownTemperament(d);
        return { d, ceiling, shown, alert: getAlert(d), isTrouble: !!shown && TEMPERAMENTS[shown].trouble };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.disciples, state.reputation, state.money, state.fame, state.facilities, state.seasonPlan, state.signboardStolen, state.debt]
  );

  const avgLoyalty = rows.length ? Math.round(rows.reduce((a, r) => a + r.d.loyalty, 0) / rows.length) : 0;
  const alertCount = rows.filter((r) => r.alert).length;
  const troubleCount = rows.filter((r) => r.isTrouble).length;
  const unknownCount = rows.filter((r) => !r.shown).length;
  const heir = alive.find((d) => d.role === 'HEIR');
  const countRole = (r: DiscipleRole) => alive.filter((d) => d.role === r).length;

  const filters: Array<{ id: FilterId; label: string; n: number }> = [
    { id: 'ALL', label: '전체', n: rows.length },
    { id: 'ALERT', label: '주의 필요', n: alertCount },
    { id: 'TROUBLE', label: '말썽꾼', n: troubleCount },
    { id: 'INSTRUCTOR', label: '사범', n: countRole('INSTRUCTOR') },
    { id: 'ESCORT', label: '호위', n: countRole('ESCORT') },
    { id: 'STUDENT', label: '수련생', n: countRole('STUDENT') },
  ];

  const visible = rows
    .filter((r) => {
      if (filter === 'ALERT') return !!r.alert;
      if (filter === 'TROUBLE') return r.isTrouble;
      if (filter === 'ALL') return true;
      return r.d.role === filter;
    })
    .sort((a, b) => {
      if (a.d.role === 'HEIR' && b.d.role !== 'HEIR') return -1;
      if (b.d.role === 'HEIR' && a.d.role !== 'HEIR') return 1;
      if (sort === 'LOYALTY') return a.d.loyalty - b.d.loyalty;
      if (sort === 'POWER') return powerOf(b.d) - powerOf(a.d);
      if (sort === 'AGE') return b.d.age - a.d.age;
      return a.d.joinedYear - b.d.joinedYear;
    });

  const detail = rows.find((r) => r.d.id === detailId) || null;
  const talkReady = canTalkToDisciple(state);
  const closeDetail = () => {
    setDetailId(null);
    setConfirmExpel(false);
  };

  return (
    <div className="space-y-3">
      {/* 현황 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-[#1b120c] border border-[#6b4728] px-3 py-2">
          <div className="text-[10px] text-[#c7b394]">문하생</div>
          <div className="text-base font-bold text-[#fde68a] tabular-nums">
            {alive.length}
            <span className="text-xs text-[#c7b394] font-normal"> / {maxD}명</span>
          </div>
        </div>
        <div className="bg-[#1b120c] border border-[#6b4728] px-3 py-2">
          <div className="text-[10px] text-[#c7b394]">평균 충성</div>
          <div className={`text-base font-bold tabular-nums ${loyaltyTone(avgLoyalty).text}`}>{rows.length ? avgLoyalty : '—'}</div>
        </div>
        <button
          onClick={() => { sound.playClick(); setFilter(alertCount > 0 ? 'ALERT' : 'ALL'); }}
          className={`text-left px-3 py-2 border cursor-pointer ${alertCount > 0 ? 'bg-[#2a1210] border-red-500/70' : 'bg-[#1b120c] border-[#6b4728]'}`}
        >
          <div className="text-[10px] text-[#c7b394]">주의 필요</div>
          <div className={`text-base font-bold tabular-nums flex items-center gap-1 ${alertCount > 0 ? 'text-red-300' : 'text-[#fde68a]'}`}>
            {alertCount > 0 && <AlertTriangle className="w-3.5 h-3.5" />}
            {alertCount}명
            {unknownCount > 0 && <span className="text-[10px] text-[#a8957a] font-normal">· 기질 미파악 {unknownCount}</span>}
          </div>
        </button>
        <div className="bg-[#1b120c] border border-[#6b4728] px-3 py-2 min-w-0">
          <div className="text-[10px] text-[#c7b394]">후계자</div>
          <div className={`text-sm font-bold truncate flex items-center gap-1 ${heir ? 'text-[#fde68a]' : 'text-[#a8957a]'}`}>
            {heir && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            {heir ? heir.name : '미지명'}
          </div>
        </div>
      </div>

      {/* 초식 전수 · 걸러 보기 · 정렬 */}
      <div className="bg-[#1b120c] border border-[#6b4728] p-2.5 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0">
            <InGameSelect
              title="문하생에게 전수할 초식 선택"
              value={skillToTeach}
              onChange={setSkillToTeach}
              options={state.skills.map((s) => ({ value: s.id, label: `${s.customName || s.name} (Lv.${s.masteryLevel})`, sub: `위력 ${s.power}` }))}
            />
          </div>
          <button
            disabled={alive.length === 0}
            onClick={() => { sound.playClick(); onTeachAll(); }}
            className="seal-badge px-3 py-1.5 text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
          >
            <Zap className="w-3.5 h-3.5" /> 계획에 [제자 지도] 추가
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => { sound.playClick(); setFilter(f.id); }}
              className={`px-2 py-1 text-[11px] border cursor-pointer ${filter === f.id ? 'bg-[#3d291a] border-[#fde047] text-[#fde68a] font-bold' : 'bg-[#120c08] border-[#5c432c] text-[#c7b394]'}`}
            >
              {f.label} <span className="tabular-nums opacity-80">{f.n}</span>
            </button>
          ))}
          <div className="ml-auto w-36">
            <InGameSelect
              title="정렬 기준"
              value={sort}
              onChange={(v) => setSort(v as SortId)}
              options={[
                { value: 'LOYALTY', label: '충성 낮은 순' },
                { value: 'POWER', label: '무력 높은 순' },
                { value: 'AGE', label: '나이 많은 순' },
                { value: 'JOINED', label: '입문 순' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* 제자 카드 */}
      {alive.length === 0 ? (
        <div className="text-center py-10 text-xs text-[#c7b394]">아직 문하생이 없습니다.</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-8 text-xs text-[#c7b394]">이 조건에 해당하는 문하생이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {visible.map(({ d, ceiling, alert }) => {
            const topSkill = [...d.skills].sort((a, b) => b.masteryLevel - a.masteryLevel)[0];
            const hasMutation = d.skills.some((s) => s.isMutated);
            return (
              <div
                key={d.id}
                className={`border-2 ${d.role === 'HEIR' ? 'bg-[#362614] border-[#fde047]' : alert?.tone === 'DANGER' ? 'bg-[#231210] border-red-600/70' : 'bg-[#1b120c] border-[#5c432c]'}`}
              >
                {alert && (
                  <div className={`px-2.5 py-1 text-[10px] font-bold flex items-center gap-1 ${alert.tone === 'DANGER' ? 'bg-red-950/80 text-red-200' : 'bg-amber-950/70 text-amber-200'}`}>
                    {d.watched ? <Eye className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {alert.text}
                  </div>
                )}
                <div className="p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <PixelPortrait role={d.isChild ? 'HERO' : 'DISCIPLE'} country={state.country} gender={d.gender} age={d.age} variantHint={d.name + d.archetype} size={40} />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-[#fde68a] flex items-center gap-1">
                          {d.role === 'HEIR' && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                          <span className="truncate">{d.name}</span>
                          <span className="text-[11px] text-[#c7b394] font-normal shrink-0">{d.age}세</span>
                          {d.isGenius && <span className="text-[10px] text-amber-300 shrink-0">★천재</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                          <TemperamentBadge d={d} />
                          <span className="text-[10px] text-[#a8957a] truncate">{d.archetype}</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-24 shrink-0">
                      <InGameSelect
                        title={`${d.name}의 직책 지정`}
                        value={d.role}
                        onChange={(val) => onSetRole(d.id, val as DiscipleRole)}
                        options={(['STUDENT', 'INSTRUCTOR', 'ESCORT', 'HEIR'] as DiscipleRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r], sub: ROLE_SUB[r] }))}
                      />
                    </div>
                  </div>

                  <LoyaltyBar d={d} cap={ceiling.cap} />

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-[#c7b394] min-w-0 truncate">
                      <span className="text-[#e6d8be]">무력 <b className="tabular-nums">{powerOf(d)}</b></span>
                      <span className="mx-1 text-[#5c432c]">|</span>
                      {topSkill ? `${topSkill.customName || topSkill.name} Lv.${topSkill.masteryLevel}` : '초식 없음'}
                      {d.skills.length > 1 && ` 외 ${d.skills.length - 1}종`}
                      {hasMutation && <span className="text-fuchsia-300 ml-1">★변이</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => { sound.playClick(); setDetailId(d.id); }} className="rpg-btn px-2.5 py-1 text-[11px] flex items-center gap-0.5 cursor-pointer">
                        <Info className="w-3 h-3 text-sky-300" /> 상세
                      </button>
                      <button onClick={() => { sound.playClick(); onTeachSkill(d.id, skillToTeach); }} className="seal-badge px-2.5 py-1 text-[11px] font-bold cursor-pointer">
                        전수
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 상세 (창 안쪽 스크롤 영역에 갇히지 않도록 body에 띄운다) */}
      {detail && createPortal(
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3" onClick={closeDetail}>
          <div className="rpg-window max-w-md w-full p-4 space-y-3 animate-ink max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#8c6239] pb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <PixelPortrait role={detail.d.isChild ? 'HERO' : 'DISCIPLE'} country={state.country} gender={detail.d.gender} age={detail.d.age} variantHint={detail.d.name + detail.d.archetype} size={48} />
                <div className="min-w-0">
                  <div className="font-bold text-base text-[#fde68a] truncate">
                    {detail.d.name} ({detail.d.age}세) {detail.d.isGenius ? '★ 천재' : ''}
                  </div>
                  <div className="text-[11px] text-amber-300 truncate">
                    {detail.d.archetype} · {ROLE_LABEL[detail.d.role]} · {detail.d.joinedYear}년 입문
                  </div>
                </div>
              </div>
              <button onClick={closeDetail} className="cursor-pointer shrink-0"><X className="w-5 h-5" /></button>
            </div>

            {/* 기질 */}
            <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#fde68a]">기질</span>
                <TemperamentBadge d={detail.d} />
              </div>
              {detail.shown ? (
                <>
                  <p className="text-[#f5e9ce] leading-relaxed">{TEMPERAMENTS[detail.shown].desc}</p>
                  <div className="text-[11px] text-emerald-200">바라는 것 — {TEMPERAMENTS[detail.shown].wants}</div>
                  {TEMPERAMENTS[detail.shown].trouble && <div className="text-[11px] text-red-300">내버려 두면 — {TEMPERAMENTS[detail.shown].risk}</div>}
                  {detail.d.temperament === 'SCHEMER' && detail.d.exposed && (
                    <div className="text-[11px] text-rose-200 border-t border-[#4a3423] pt-1.5">
                      흑심의 진척 {Math.round(detail.d.plot || 0)}% — 가득 차면 반란을 일으킵니다. 후계자로 세우면 멈추고, 감시를 붙이면 느려지며, 파문하면 끝납니다.
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[#c7b394] leading-relaxed">아직 사람됨을 알 수 없습니다. 한 해쯤 곁에 두거나 면담을 하면 드러납니다.</p>
              )}
            </div>

            {/* 충성과 그 사정 */}
            <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#fde68a]">충성</span>
                <span className="text-[11px] text-[#c7b394]">
                  상한 <b className="text-[#fde68a] tabular-nums">{detail.ceiling.cap}</b> · 야심 <b className="text-[#fde68a] tabular-nums">{detail.d.ambition}</b>
                </span>
              </div>
              <LoyaltyBar d={detail.d} cap={detail.ceiling.cap} />
              {detail.shown && detail.ceiling.notes.length > 0 ? (
                <ul className="space-y-0.5">
                  {detail.ceiling.notes.map((n, i) => (
                    <li key={i} className="flex justify-between gap-2 text-[11px]">
                      <span className="text-[#e6d8be]">{n.text}</span>
                      <span className={`tabular-nums font-bold ${n.delta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>상한 {n.delta >= 0 ? '+' : ''}{n.delta}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[11px] text-[#a8957a]">{detail.shown ? '지금은 상한을 흔드는 사정이 없습니다.' : '기질을 알아야 무엇이 충성을 막는지 보입니다.'}</div>
              )}
            </div>

            {/* 능력치 */}
            <div className="grid grid-cols-6 gap-1 text-center text-xs">
              {([
                ['근력', detail.d.stats.str, HANJA_GLOSSARY.STR],
                ['민첩', detail.d.stats.agi, HANJA_GLOSSARY.AGI],
                ['체력', detail.d.stats.vit, HANJA_GLOSSARY.VIT],
                ['정신', detail.d.stats.wil, HANJA_GLOSSARY.WIL],
                ['통찰', detail.d.stats.ins, HANJA_GLOSSARY.INS],
                ['영력', detail.d.stats.qi, HANJA_GLOSSARY.QI],
              ] as const).map(([k, v, tip]) => (
                <InGameTooltip key={k} {...tip} className="w-full">
                  <div className="w-full bg-[#1b120c] border border-[#5c432c] py-1">
                    <div className="text-[10px] text-[#c7b394] underline decoration-dotted">{k}</div>
                    <div className="font-bold text-[#fde68a] tabular-nums">{v}</div>
                  </div>
                </InGameTooltip>
              ))}
            </div>

            {/* 초식 */}
            <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-1.5 text-xs">
              <div className="font-bold text-[#fde68a]">습득 초식 ({detail.d.skills.length}종)</div>
              <div className="space-y-1">
                {detail.d.skills.map((s) => (
                  <div key={s.id} className="flex justify-between items-center text-[11px] bg-[#120c08] px-2 py-1 border border-[#4a3423]">
                    <span className="text-[#f5e9ce]">
                      {s.customName || s.name} Lv.{s.masteryLevel}
                      {s.isMutated && <span className="ml-1 text-fuchsia-300">[변이 각성]</span>}
                      {s.isDegraded && <span className="ml-1 text-amber-400">[열화 전수]</span>}
                    </span>
                    <span className="text-[#c7b394]">위력 {s.power}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 행동 */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                disabled={!talkReady}
                onClick={() => { sound.playClick(); onTalk(detail.d.id); }}
                className="flex-1 seal-badge px-3 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
              >
                <MessageCircle className="w-3.5 h-3.5" /> {talkReady ? '면담한다 (충성 +6 · 기질 파악)' : '이번 계절 면담은 마쳤다'}
              </button>
              {!detail.d.isChild &&
                (confirmExpel ? (
                  <button
                    onClick={() => { sound.playClick(); onExpel(detail.d.id); closeDetail(); }}
                    className="px-3 py-2 text-xs font-bold bg-red-900 border border-red-400 text-red-100 cursor-pointer flex items-center gap-1"
                  >
                    <UserX className="w-3.5 h-3.5" /> 정말 파문한다
                  </button>
                ) : (
                  <button onClick={() => { sound.playClick(); setConfirmExpel(true); }} className="rpg-btn px-3 py-2 text-xs cursor-pointer flex items-center gap-1 text-red-200">
                    <UserX className="w-3.5 h-3.5" /> 파문
                  </button>
                ))}
            </div>
            {confirmExpel && (
              <p className="text-[11px] text-red-200 leading-relaxed">
                파문한 제자는 돌아오지 않습니다. 원한을 품으면 사이가 나쁜 문파에 몸을 의탁해 훗날 적으로 찾아올 수 있고, 허물없는 제자를 내치면 남은 문하생의 충성이 떨어집니다.
              </p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
