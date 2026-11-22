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

export function josa(word: string, pair: '이가' | '은는' | '을를' | '과와'): string {
  const batchim = hasBatchim(word);
  switch (pair) {
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
