// 한국어 받침(종성) 자동 판별 조사 유틸리티 (괄호·특수문자 제거 후 마지막 한글 기준)
export function hasBatchim(word: string): boolean {
  const cleaned = word.replace(/\(.*?\)|\[.*?\]|【.*?】|「|」|『|』|\s+/g, '');
  if (!cleaned) return false;
  const lastCode = cleaned.charCodeAt(cleaned.length - 1);
  if (lastCode >= 0xac00 && lastCode <= 0xd7a3) {
    return (lastCode - 0xac00) % 28 !== 0;
  }
  return false;
}

export function josa(word: string, pair: '이가' | '은는' | '을를' | '과와' | '으로로' | '아야'): string {
  const batchim = hasBatchim(word);
  switch (pair) {
    case '으로로': {
      // ㄹ 받침 뒤에는 「로」 (칼로, 길로)
      const cleaned = word.replace(/\(.*?\)|\[.*?\]|【.*?】|「|」|『|』|\s+/g, '');
      const code = cleaned.charCodeAt(cleaned.length - 1);
      const rieul = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
      return `${word}${batchim && !rieul ? '으로' : '로'}`;
    }
    case '아야':
      return `${word}${batchim ? '아' : '야'}`;
    case '이가':
      return `${word}${batchim ? '이' : '가'}`;
    case '은는':
      return `${word}${batchim ? '은' : '는'}`;
    case '을를':
      return `${word}${batchim ? '을' : '를'}`;
    case '과와':
      return `${word}${batchim ? '과' : '와'}`;
  }
}
