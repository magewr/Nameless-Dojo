import React, { useState } from 'react';
import { CountryId, Gender } from '../types/game';
import { COUNTRIES } from '../data/worldAndEndings';
import { COUNTRY_LORE } from '../data/worldLore';
import { PixelPortrait } from './PixelPortrait';
import { sound } from '../engine/sound';
import { ArrowLeft, BookOpen, Swords, X } from 'lucide-react';

interface Props {
  onBack: () => void;
  onConfirm: (country: CountryId, gender: Gender, name: string, startAge: 15 | 20 | 28) => void;
}

export const CharacterCreate: React.FC<Props> = ({ onBack, onConfirm }) => {
  const [country, setCountry] = useState<CountryId>('KOREA');
  const [gender, setGender] = useState<Gender>('MALE');
  const [startAge, setStartAge] = useState<15 | 20 | 28>(20);
  const [name, setName] = useState('이도현');
  const [showCountryLore, setShowCountryLore] = useState(false);

  const handleCountryChange = (c: CountryId) => {
    sound.playClick();
    setCountry(c);
    if (c === 'KOREA') setName(gender === 'MALE' ? '이도현' : '이서연');
    if (c === 'CHINA') setName(gender === 'MALE' ? '진무극' : '진소월');
    if (c === 'JAPAN') setName(gender === 'MALE' ? '타케다 렌' : '타케다 유키');
  };

  const handleGenderChange = (g: Gender) => {
    sound.playClick();
    setGender(g);
    if (country === 'KOREA') setName(g === 'MALE' ? '이도현' : '이서연');
    if (country === 'CHINA') setName(g === 'MALE' ? '진무극' : '진소월');
    if (country === 'JAPAN') setName(g === 'MALE' ? '타케다 렌' : '타케다 유키');
  };

  const countryShort: Record<CountryId, { title: string; era: string; tag: string }> = {
    KOREA: { title: '조선', era: '1750 영조', tag: '의지·기공↑' },
    CHINA: { title: '청나라', era: '1750 건륭', tag: '수익·제자↑' },
    JAPAN: { title: '일본', era: '1750 에도', tag: '명성·검술↑' },
  };

  return (
    <div className="h-screen overflow-y-auto py-5 px-3 sm:px-4 flex items-center justify-center bg-[#120d0a]">
      <div className="rpg-window max-w-2xl w-full p-5 sm:p-6 space-y-5 animate-ink">
        <div className="flex items-center justify-between border-b-2 border-[#8c6239] pb-3">
          <button onClick={onBack} className="rpg-btn px-2.5 py-1 text-xs flex items-center gap-1 cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> 뒤로
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-[#fde68a]">1750년 · 새 도장주</h2>
          <div className="w-12" />
        </div>

        {/* 초상화 미리보기 + 이름/성별 */}
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-[#1b120c] border-2 border-[#6b4728] p-4">
          <PixelPortrait role="HERO" country={country} gender={gender} age={startAge} size={96} />
          <div className="flex-1 w-full space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['MALE', 'FEMALE'] as Gender[]).map((g) => (
                <button
                  key={g}
                  onClick={() => handleGenderChange(g)}
                  className={`py-2 text-xs font-bold border-2 cursor-pointer ${
                    gender === g ? 'seal-badge' : 'rpg-btn'
                  }`}
                >
                  {g === 'MALE' ? '남성 (男)' : '여성 (女)'}
                </button>
              ))}
            </div>
            <input
              type="text"
              maxLength={12}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full py-2 px-3 bg-[#120c08] border-2 border-[#8c6239] text-[#fde68a] font-bold text-sm focus:outline-none focus:border-[#fde047]"
              placeholder="계승자 이름"
            />
          </div>
        </div>

        {/* 1. 국가 선택 + 시대 배경 상세보기 */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {(['KOREA', 'CHINA', 'JAPAN'] as CountryId[]).map((cid) => {
              const info = countryShort[cid];
              const active = country === cid;
              return (
                <button
                  key={cid}
                  onClick={() => handleCountryChange(cid)}
                  className={`p-2.5 text-center border-2 cursor-pointer transition ${
                    active ? 'bg-[#4a2b1a] border-[#fde047]' : 'bg-[#1b120c] border-[#6b4728] hover:border-[#c9974c]'
                  }`}
                >
                  <div className="font-bold text-xs sm:text-sm text-[#fde68a] truncate">{info.title}</div>
                  <div className="text-[10px] text-[#c7b394] mt-0.5">{info.era}</div>
                  <div className="text-[10px] text-sky-300 mt-1 truncate">{info.tag}</div>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => { sound.playClick(); setShowCountryLore(true); }}
            className="w-full py-1.5 px-3 bg-[#1b120c] border border-[#6b4728] hover:border-[#d4a359] text-[11px] text-[#e6d8be] flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="truncate">📜 {COUNTRY_LORE[country].headline}</span>
            <span className="text-amber-300 font-bold shrink-0 flex items-center gap-0.5">
              <BookOpen className="w-3 h-3" /> 시대 상세
            </span>
          </button>
        </div>

        {showCountryLore && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
            <div className="rpg-window max-w-md w-full p-4 space-y-3 animate-ink">
              <div className="flex items-center justify-between border-b border-[#8c6239] pb-2">
                <div>
                  <div className="font-bold text-base text-[#fde68a]">{COUNTRY_LORE[country].name}</div>
                  <div className="text-[11px] text-amber-300">{COUNTRY_LORE[country].era}</div>
                </div>
                <button onClick={() => setShowCountryLore(false)} className="cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-xs leading-relaxed text-[#f5e9ce]">{COUNTRY_LORE[country].atmosphere}</p>
              <p className="text-xs leading-relaxed text-[#d6cbb8]">{COUNTRY_LORE[country].martialCulture}</p>
              <div className="p-2.5 bg-[#1b120c] border border-[#6b4728] text-[11px] text-sky-300">
                ★ 풍토 특성: {COUNTRY_LORE[country].bonusDesc}
              </div>
            </div>
          </div>
        )}

        {/* 2. 시작 연령 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { age: 15 as const, label: '15세 소년', sub: '긴 수명·성장↑' },
            { age: 20 as const, label: '20세 청년', sub: '균형·추천' },
            { age: 28 as const, label: '28세 성인', sub: '초반 강함' },
          ].map((item) => (
            <button
              key={item.age}
              onClick={() => { sound.playClick(); setStartAge(item.age); }}
              className={`p-2 text-center border-2 cursor-pointer ${
                startAge === item.age ? 'bg-[#4a2b1a] border-[#fde047]' : 'bg-[#1b120c] border-[#6b4728]'
              }`}
            >
              <div className="font-bold text-xs sm:text-sm text-[#fff8e7] whitespace-nowrap">{item.label}</div>
              <div className="text-[10px] text-[#c7b394] mt-0.5 leading-tight">{item.sub}</div>
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            sound.playDrum();
            onConfirm(country, gender, name, startAge);
          }}
          className="w-full seal-badge py-3.5 font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer"
        >
          <Swords className="w-5 h-5" /> 도장 물려받기 ({COUNTRIES[country].eraLabel})
        </button>
      </div>
    </div>
  );
};
