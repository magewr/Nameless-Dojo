import React, { useEffect, useMemo, useState } from 'react';
import { ActiveEvent, Book, GameState, ImprintedTrait, MerchantOffer, SceneDialogueLine, Skill, Weapon } from '../types/game';
import { COUNTRIES } from '../data/worldAndEndings';
import { ELEMENT_LABEL, FORM_LABEL, getTraitCandidates, MASTERY_NAMES, WEAPON_GROUP_LABEL } from '../data/booksAndSkills';
import { getMerchantBookAppraisal, getWeaponAppraisal } from '../data/worldLore';
import { buildShortLinesFromLegacy } from '../data/storyScripts';
import { PixelPortrait } from './PixelPortrait';
import { BookOpen, ChevronRight, Info, Sparkles, Swords, X } from 'lucide-react';
import { sound } from '../engine/sound';

// 감정 리듬 타자기 훅 (마침표·물음표·말줄임표에서 숨을 고르듯 잠시 멈춤!)
function useExpressiveTypewriter(text: string, enabled: boolean, baseSpeedMs = 26) {
  const [typedLen, setTypedLen] = useState(0);

  useEffect(() => {
    setTypedLen(0);
  }, [text, enabled]);

  useEffect(() => {
    if (!enabled || typedLen >= text.length) return;
    const prevChar = text[typedLen - 1] || '';
    const isPauseChar = prevChar === '…' || prevChar === '.' || prevChar === '?' || prevChar === '!';
    const delay = isPauseChar ? 170 : baseSpeedMs;
    const timer = setTimeout(() => {
      if (typedLen % 3 === 0 && !isPauseChar) sound.playBlip();
      setTypedLen((v) => Math.min(text.length, v + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [text, enabled, typedLen, baseSpeedMs]);

  return {
    typedLen,
    done: typedLen >= text.length,
    skipToEnd: () => setTypedLen(text.length),
  };
}

// 1. 비밀 상인 만물객 상점 (상세 감정 대화 포함!)
export const MerchantModal: React.FC<{
  state: GameState;
  offer: MerchantOffer;
  onClose: () => void;
  onBuyBook: (bookId: string) => void;
  onBuyWeapon: (weaponId: string) => void;
}> = ({ state, offer, onClose, onBuyBook, onBuyWeapon }) => {
  const currency = COUNTRIES[state.country].currency;
  const [inspectBook, setInspectBook] = useState<Book | null>(null);
  const [inspectWeapon, setInspectWeapon] = useState<Weapon | null>(null);

  const bookAppraisal = inspectBook ? getMerchantBookAppraisal(inspectBook) : null;
  const weaponAppraisal = inspectWeapon ? getWeaponAppraisal(inspectWeapon) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-2 sm:p-4">
      <div className="rpg-window max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-ink">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#8c6239] bg-[#1b120c]">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-[#fde68a] truncate">비밀 상인 「만물객(萬物客)」</h2>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-xs text-amber-300">{state.money}{currency}</span>
            <button onClick={onClose} className="p-1 hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-4">
          <div className="flex gap-3 items-center bg-[#1b120c] p-3 border-2 border-[#6b4728]">
            <PixelPortrait role="MERCHANT" country={state.country} size={64} />
            <div className="space-y-1 text-xs sm:text-sm leading-relaxed min-w-0">
              <div className="text-[#fb923c] font-bold">만물객</div>
              <p className="text-[#f5e9ce]">{offer.greeting}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-[#fde68a] flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" /> 진귀한 서적 (비급)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {offer.books.map((b) => {
                const owned = state.books.some((ob) => ob.id === b.id);
                const isGrim = b.rarity === 'GRIMOIRE';
                const app = getMerchantBookAppraisal(b);
                return (
                  <div
                    key={b.id}
                    className={`p-3 border-2 flex flex-col justify-between gap-2 ${
                      isGrim ? 'bg-[#361459] border-fuchsia-400' : b.rarity === 'LEGACY' ? 'bg-[#3d2914] border-amber-400' : 'bg-[#1f1610] border-[#6b4728]'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-[#fff8e7]">{b.title}</div>
                      <div className="text-[11px] mt-0.5 text-amber-300">
                        {app.rarityLabel}
                        {app.skillPreview && ` · 초식 「${app.skillPreview.customName || app.skillPreview.name}」`}
                      </div>
                      {b.unreadableHint && <p className="text-[11px] text-fuchsia-200 mt-1">{b.unreadableHint}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { sound.playClick(); setInspectBook(b); }}
                        className="rpg-btn px-2.5 py-1.5 text-xs flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Info className="w-3.5 h-3.5 text-sky-300" /> 상세 감정
                      </button>
                      <button
                        disabled={owned || state.money < b.price}
                        onClick={() => { sound.playClick(); onBuyBook(b.id); }}
                        className="flex-1 seal-badge py-1.5 text-xs font-bold disabled:opacity-40 cursor-pointer"
                      >
                        {owned ? '구매 완료' : `구매 (${b.price}${currency})`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {offer.weapons.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#fde68a] flex items-center gap-1.5">
                <Swords className="w-4 h-4" /> 진귀한 병기
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {offer.weapons.map((w) => {
                  const owned = state.weapons.some((ow) => ow.id === w.id);
                  return (
                    <div key={w.id} className="p-3 bg-[#1f1610] border-2 border-[#6b4728] flex flex-col justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-[#fff8e7]">{w.name}</div>
                        <div className="text-[11px] text-[#c7b394]">
                          {WEAPON_GROUP_LABEL[w.group]} · 공격력 {w.attack}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { sound.playClick(); setInspectWeapon(w); }}
                          className="rpg-btn px-2.5 py-1.5 text-xs flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Info className="w-3.5 h-3.5 text-sky-300" /> 상세 감정
                        </button>
                        <button
                          disabled={owned || state.money < w.price}
                          onClick={() => { sound.playClick(); onBuyWeapon(w.id); }}
                          className="flex-1 seal-badge py-1.5 text-xs font-bold disabled:opacity-40 cursor-pointer"
                        >
                          {owned ? '구매 완료' : `구매 (${w.price}${currency})`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 만물객 서적 상세 감정 팝업 */}
      {inspectBook && bookAppraisal && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-3">
          <div className="rpg-window max-w-md w-full p-4 space-y-3 animate-ink max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#8c6239] pb-2 gap-2">
              <div className="min-w-0">
                <div className="text-[10px] text-amber-300">{bookAppraisal.rarityLabel}</div>
                <div className="font-bold text-base text-[#fde68a] truncate">{inspectBook.title}</div>
              </div>
              <button onClick={() => setInspectBook(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex gap-3 items-start bg-[#1b120c] p-3 border border-[#6b4728]">
              <PixelPortrait role="MERCHANT" country={state.country} size={52} />
              <div className="space-y-1 text-xs leading-relaxed">
                <div className="text-[#fb923c] font-bold">만물객의 감정</div>
                <p className="text-[#f5e9ce]">{bookAppraisal.merchantQuote}</p>
              </div>
            </div>

            {bookAppraisal.skillPreview && (
              <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-[#fde68a]">
                    습득 초식: {bookAppraisal.skillPreview.customName || bookAppraisal.skillPreview.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#3d291a] text-sky-300 shrink-0">
                    {FORM_LABEL[bookAppraisal.skillPreview.form]} · {ELEMENT_LABEL[bookAppraisal.skillPreview.element]}
                  </span>
                </div>
                <p className="text-[#d6cbb8] leading-relaxed">{bookAppraisal.skillPreview.description}</p>
                <div className="grid grid-cols-3 gap-1.5 text-center pt-1">
                  <div className="bg-[#120c08] border border-[#5c432c] py-1">
                    <div className="text-[10px] text-[#c7b394]">기본 위력</div>
                    <div className="font-bold text-[#fde68a]">{bookAppraisal.skillPreview.isPassive ? '심법' : bookAppraisal.skillPreview.power}</div>
                  </div>
                  <div className="bg-[#120c08] border border-[#5c432c] py-1">
                    <div className="text-[10px] text-[#c7b394]">소모 기력</div>
                    <div className="font-bold text-sky-300">{bookAppraisal.skillPreview.qiCost}</div>
                  </div>
                  <div className="bg-[#120c08] border border-[#5c432c] py-1">
                    <div className="text-[10px] text-[#c7b394]">궁합 병기</div>
                    <div className="font-bold text-amber-300">{WEAPON_GROUP_LABEL[bookAppraisal.skillPreview.weapon]}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1 text-[11px] bg-[#1b120c] p-2.5 border border-[#5c432c]">
              <div className="text-amber-300">• 습득 방법: {bookAppraisal.decodeNote}</div>
              <div className="text-[#d6cbb8]">• 운용 조언: {bookAppraisal.craftTip}</div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setInspectBook(null)} className="rpg-btn px-3 py-2 text-xs cursor-pointer">닫기</button>
              <button
                disabled={state.books.some((ob) => ob.id === inspectBook.id) || state.money < inspectBook.price}
                onClick={() => { sound.playClick(); onBuyBook(inspectBook.id); setInspectBook(null); }}
                className="flex-1 seal-badge py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                {state.books.some((ob) => ob.id === inspectBook.id) ? '이미 보유 중' : `구매하기 (${inspectBook.price}${currency})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 만물객 무기 상세 감정 팝업 */}
      {inspectWeapon && weaponAppraisal && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-3">
          <div className="rpg-window max-w-md w-full p-4 space-y-3 animate-ink max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#8c6239] pb-2 gap-2">
              <div className="min-w-0">
                <div className="text-[10px] text-amber-300">{weaponAppraisal.gradeLabel} · {WEAPON_GROUP_LABEL[inspectWeapon.group]}</div>
                <div className="font-bold text-base text-[#fde68a] truncate">{inspectWeapon.name}</div>
              </div>
              <button onClick={() => setInspectWeapon(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex gap-3 items-start bg-[#1b120c] p-3 border border-[#6b4728]">
              <PixelPortrait role="MERCHANT" country={state.country} size={52} />
              <div className="space-y-1 text-xs leading-relaxed">
                <div className="text-[#fb923c] font-bold">만물객의 감정</div>
                <p className="text-[#f5e9ce]">{weaponAppraisal.merchantQuote}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
              <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                <div className="text-[10px] text-[#c7b394]">공격력</div>
                <div className="font-bold text-[#fde68a]">{inspectWeapon.attack}</div>
              </div>
              <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                <div className="text-[10px] text-[#c7b394]">속도 보정</div>
                <div className="font-bold text-emerald-300">{inspectWeapon.speedBonus >= 0 ? '+' : ''}{Math.round(inspectWeapon.speedBonus * 100)}%</div>
              </div>
              <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                <div className="text-[10px] text-[#c7b394]">체세 파괴</div>
                <div className="font-bold text-amber-300">{inspectWeapon.postureBreak}</div>
              </div>
            </div>

            <div className="bg-[#1b120c] border border-[#5c432c] p-3 space-y-1.5 text-xs">
              <div className="text-sky-300 font-bold">★ {weaponAppraisal.affinityText}</div>
              <div className="text-[#e6d8be]">• 고유 특성: {inspectWeapon.passiveText}</div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setInspectWeapon(null)} className="rpg-btn px-3 py-2 text-xs cursor-pointer">닫기</button>
              <button
                disabled={state.weapons.some((ow) => ow.id === inspectWeapon.id) || state.money < inspectWeapon.price}
                onClick={() => { sound.playClick(); onBuyWeapon(inspectWeapon.id); setInspectWeapon(null); }}
                className="flex-1 seal-badge py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                {state.weapons.some((ow) => ow.id === inspectWeapon.id) ? '이미 보유 중' : `구매하기 (${inspectWeapon.price}${currency})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 2. 정통 2D RPG 컷신 대화 씬 (짧은 호흡 분할 + 지문 + 감정 타자기 + 듀얼 초상화!)
export const EventModal: React.FC<{
  event: ActiveEvent;
  state: GameState;
  sceneReady: boolean;
  onSelect: (optionId: string) => void;
}> = ({ event, state, sceneReady, onSelect }) => {
  const lines = useMemo(() => buildShortLinesFromLegacy(event, state.name), [event, state.name]);
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    setLineIdx(0);
  }, [event.id]);

  const currentLine = lines[Math.min(lineIdx, lines.length - 1)];
  const isLastLine = lineIdx >= lines.length - 1;
  const { typedLen, done: lineFinished, skipToEnd } = useExpressiveTypewriter(currentLine.text, sceneReady, 25);

  const advanceDialogue = () => {
    if (!sceneReady) return;
    if (!lineFinished) {
      skipToEnd();
      return;
    }
    if (!isLastLine) {
      sound.playClick();
      setLineIdx((i) => i + 1);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.key === 'Enter') && (!isLastLine || !lineFinished)) {
        e.preventDefault();
        advanceDialogue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const npcRole =
    event.sceneActor === 'MERCHANT'
      ? 'MERCHANT'
      : event.category === 'RIVAL' || event.sceneActor === 'RIVAL'
      ? 'RIVAL'
      : event.category === 'DUEL' || event.category === 'DEBT' || event.sceneActor === 'ENEMY'
      ? 'ENEMY'
      : event.category === 'FAMILY' || event.sceneActor === 'SPOUSE'
      ? 'SPOUSE'
      : 'DISCIPLE';

  if (!sceneReady) {
    return (
      <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-between">
        <div className="h-11 bg-[#0d0906] flex items-center justify-center border-b-2 border-[#8c6239]">
          <span className="text-xs text-[#fde68a] tracking-widest font-bold">사건 · {event.title}</span>
        </div>
        <div className="h-14 bg-[#0d0906] flex items-center justify-center border-t-2 border-[#8c6239]">
          <span className="text-xs text-[#e6d8be] animate-pulse">누군가 도장 대문을 열고 들어옵니다…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex flex-col justify-end p-2.5 sm:p-5">
      <div className="fixed top-0 inset-x-0 h-11 bg-[#0d0906] border-b-2 border-[#8c6239] flex items-center justify-between px-4">
        <span className="text-xs text-[#fde68a] font-bold">사건 · {event.title}</span>
        <span className="text-[11px] text-[#c7b394]">{lineIdx + 1} / {lines.length}</span>
      </div>

      <div className="max-w-3xl w-full mx-auto space-y-2.5 animate-ink">
        {isLastLine && lineFinished && (
          <div className="space-y-1.5 animate-ink">
            {event.options.map((opt) => (
              <button
                key={opt.id}
                disabled={opt.disabled}
                onClick={() => { sound.playClick(); onSelect(opt.id); }}
                className="w-full rpg-btn text-left p-3 disabled:opacity-45 cursor-pointer bg-[#2b1e16]/96 hover:bg-[#473120]"
              >
                <div className="text-xs sm:text-sm font-bold text-[#fde68a]">▶ {opt.label}</div>
                {(opt.hint || opt.disabledReason) && (
                  <div className={`text-[11px] mt-0.5 pl-4 ${opt.disabled ? 'text-rose-400' : 'text-[#d6cbb8]'}`}>
                    {opt.disabled ? `불가: ${opt.disabledReason}` : opt.hint}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div
          onClick={advanceDialogue}
          className="rpg-window p-3.5 sm:p-4 bg-[#221710]/96 flex items-center gap-3 sm:gap-4 cursor-pointer"
        >
          <PixelPortrait
            role="HERO"
            country={state.country}
            age={state.age}
            gender={state.gender}
            size={74}
            active={currentLine.role === 'HERO'}
          />

          <div className="flex-1 min-w-0 min-h-[88px] flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs font-bold px-2 py-0.5 ${
                    currentLine.role === 'HERO'
                      ? 'bg-[#2c4c6e] text-white'
                      : currentLine.role === 'NPC'
                      ? 'bg-[#9e2a2b] text-white'
                      : 'bg-[#473120] text-[#fde68a]'
                  }`}
                >
                  {currentLine.speaker}
                </span>
                {currentLine.stageDirection && (
                  <span className="text-[11px] italic text-[#c9a977]">({currentLine.stageDirection})</span>
                )}
              </div>
              <p className="text-xs sm:text-sm leading-6 text-[#f5e9ce]">
                {currentLine.text.slice(0, typedLen)}
                {!lineFinished && <span className="inline-block w-2 h-3.5 bg-[#fde68a] ml-0.5 animate-pulse" />}
              </p>
            </div>

            {(!isLastLine || !lineFinished) && (
              <div className="flex justify-end text-[11px] text-[#e5b75a] pt-1">
                <span className="flex items-center gap-0.5 animate-bob">
                  계속 <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            )}
          </div>

          <PixelPortrait
            role={npcRole}
            country={state.country}
            gender={state.gender}
            variantHint={currentLine.role === 'NPC' ? currentLine.speaker : event.speaker || event.title}
            size={74}
            active={currentLine.role === 'NPC'}
          />
        </div>
      </div>
    </div>
  );
};

// 2.5 이벤트 선택 결말 컷신 모달 (선택 직후 2~3마디 여운 대사 + 변화량 뱃지!)
export interface EventResultNotice {
  title: string;
  npcRole?: 'MERCHANT' | 'RIVAL' | 'ENEMY' | 'SPOUSE' | 'DISCIPLE';
  lines: SceneDialogueLine[];
  badges: Array<{ label: string; tone: 'GOOD' | 'WARN' | 'MAGIC' | 'NORMAL' }>;
}

export const EventResultModal: React.FC<{
  notice: EventResultNotice;
  state: GameState;
  onConfirm: () => void;
}> = ({ notice, state, onConfirm }) => {
  const [idx, setIdx] = useState(0);
  const cur = notice.lines[Math.min(idx, notice.lines.length - 1)];
  const isLast = idx >= notice.lines.length - 1;
  const { typedLen, done, skipToEnd } = useExpressiveTypewriter(cur.text, true, 25);

  const handleNext = () => {
    if (!done) {
      skipToEnd();
      return;
    }
    sound.playClick();
    if (!isLast) setIdx((i) => i + 1);
    else onConfirm();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div onClick={handleNext} className="fixed inset-0 z-50 bg-black/40 flex flex-col justify-end p-2.5 sm:p-5 cursor-pointer">
      <div className="fixed top-0 inset-x-0 h-11 bg-[#0d0906] border-b-2 border-[#8c6239] flex items-center justify-between px-4">
        <span className="text-xs text-[#fde68a] font-bold">결말 · {notice.title}</span>
        <span className="text-[11px] text-[#c7b394]">결말 ({idx + 1}/{notice.lines.length})</span>
      </div>

      <div className="max-w-3xl w-full mx-auto rpg-window p-4 sm:p-5 bg-[#221710]/96 space-y-3 animate-ink">
        <div className="flex items-start gap-3.5">
          <PixelPortrait
            role={cur.role === 'NPC' ? notice.npcRole || 'DISCIPLE' : 'HERO'}
            country={state.country}
            age={state.age}
            gender={state.gender}
            variantHint={cur.speaker || notice.title}
            size={68}
          />
          <div className="flex-1 space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#fde68a]">{cur.speaker}</span>
              {cur.stageDirection && <span className="text-[11px] italic text-[#c9a977]">({cur.stageDirection})</span>}
            </div>
            <p className="text-xs sm:text-sm leading-6 text-[#f5e9ce]">
              {cur.text
                .slice(0, typedLen)
                .split(/(「[^」]+」|『[^』]+』|【[^】]+】|\[[^\]]+\]|\+\d+[%냥은량문]?|-\d+[%냥은량문]?)/g)
                .map((part, i) => {
                  if (/^(「|『|【|\[)/.test(part)) return <span key={i} className="text-[#fde68a] font-bold">{part}</span>;
                  if (/^\+/.test(part)) return <span key={i} className="text-emerald-300 font-bold">{part}</span>;
                  if (/^-/.test(part)) return <span key={i} className="text-rose-400 font-bold">{part}</span>;
                  return <React.Fragment key={i}>{part}</React.Fragment>;
                })}
              {!done && <span className="inline-block w-2 h-3.5 bg-[#fde68a] ml-0.5 animate-pulse" />}
            </p>
            {isLast && done && notice.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5 animate-ink">
                {notice.badges.map((b, i) => (
                  <span
                    key={i}
                    className={`text-[11px] px-2 py-0.5 border font-bold ${
                      b.tone === 'MAGIC'
                        ? 'bg-[#361459] border-fuchsia-400 text-fuchsia-200'
                        : b.tone === 'GOOD'
                        ? 'bg-[#1a3324] border-emerald-400 text-emerald-200'
                        : b.tone === 'WARN'
                        ? 'bg-[#451515] border-rose-400 text-rose-200'
                        : 'bg-[#2e2219] border-[#c9974c] text-[#fde68a]'
                    }`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {done && (
          <div className="flex justify-end pt-1">
            <span className="text-xs text-[#fde68a] flex items-center gap-1 animate-bob">
              {isLast ? '계속하기 (클릭 / Space)' : '다음'} <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// 3. 3·6·9단계 연마 각인 선택 모달
export const TraitSelectModal: React.FC<{
  skill: Skill;
  onPick: (trait: ImprintedTrait) => void;
}> = ({ skill, onPick }) => {
  const tier = skill.pendingTraitTier || 3;
  const candidates = getTraitCandidates(skill, tier);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="rpg-window max-w-xl w-full p-5 sm:p-6 space-y-4 animate-ink">
        <div className="text-center border-b-2 border-[#8c6239] pb-3">
          <span className="seal-badge text-xs px-2.5 py-0.5">{tier}단계 경지 돌파 · 연마 각인</span>
          <h3 className="text-xl sm:text-2xl font-bold text-[#fde68a] mt-2">
            「{skill.customName || skill.name}」 {MASTERY_NAMES[tier]} 각성
          </h3>
          <p className="text-xs text-[#d6cbb8] mt-1">이 초식의 평생 성질을 결정할 각인 1가지를 선택하세요.</p>
        </div>

        <div className="space-y-2.5">
          {candidates.map((tr) => (
            <button
              key={tr.id}
              onClick={() => { sound.playLevelUp(); onPick(tr); }}
              className="w-full rpg-btn text-left p-4 cursor-pointer"
            >
              <div className="font-bold text-base text-[#fde68a]">★ {tr.label}</div>
              <div className="text-xs text-[#e6d8be] mt-1">{tr.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
