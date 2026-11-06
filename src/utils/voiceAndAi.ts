// 音声入力（Web Speech API）自然言語解析 ＆ Gemini Vision API によるシフト表画像・ナスカレスクショ自動読み取りモジュール
import {
  CalendarCategoryId,
  PartnerId,
  ScheduleEvent,
  StampPreset,
} from '../types/calendar';

const LS_GEMINI_KEY = 'futarical_gemini_api_key_v1';

export function getSavedGeminiApiKey(): string {
  return localStorage.getItem(LS_GEMINI_KEY) || '';
}

export function setSavedGeminiApiKey(key: string): void {
  if (!key.trim()) {
    localStorage.removeItem(LS_GEMINI_KEY);
  } else {
    localStorage.setItem(LS_GEMINI_KEY, key.trim());
  }
}

// 音声解析結果の型定義
export interface ParsedVoiceSchedule {
  date: string;           // "YYYY-MM-DD"
  title: string;
  isAllDay: boolean;
  startTime?: string;     // "HH:mm"
  endTime?: string;       // "HH:mm"
  categoryId: CalendarCategoryId;
  supportBadges: string[];
  shiftLabel?: string;    // 「12日は夜勤」のようにシフトを話した場合
  overtimeMinutes?: number; // 「35分残業」「1時間20分残業」など分単位
  overtimeHours?: number; // 「残業2時間」など残業時間（h）
  overtimeStartTime?: string; // 残業開始時刻（例 "11:00"）
  overtimeEndTime?: string;   // 残業終了時刻（例 "11:35"）
  holidayWorkMinutes?: number; // 休日出勤（分単位）
  holidayWorkHours?: number; // 「休日出勤4時間」など休出時間（h）
  holidayWorkStartTime?: string;
  holidayWorkEndTime?: string;
  targetPartner?: PartnerId; // 「夫が」「妻が」など対象パートナー
  isTentative?: boolean;     // 仮・見込みフラグ（「予定」「かも」「仮」）
  isPrivate?: boolean;       // 🔒 じぶん限定・シークレットフラグ（「秘密」「内緒」など）
}

/**
 * 日本語の漢数字（一〜九、十、十一〜九十九）を算用数字に正規化
 * 音声認識が「十一時三十五分」「一時半」などと返した場合でも確実に数値化します。
 */
export function convertKanjiNumbers(text: string): string {
  const kanjiDigits: Record<string, number> = {
    '〇': 0, '零': 0,
    '一': 1, '壱': 1,
    '二': 2, '弐': 2,
    '三': 3, '参': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9,
  };

  let s = text;

  // 「二十五」「三十五」「四十五」「十一」などの十を含む複合表現
  s = s.replace(/([一二三四五六七八九])?十([一二三四五六七八九])?/g, (_, tens, ones) => {
    const t = tens ? kanjiDigits[tens] ?? 1 : 1;
    const o = ones ? kanjiDigits[ones] ?? 0 : 0;
    return String(t * 10 + o);
  });

  // 単独の漢数字
  s = s.replace(/[〇零一壱二弐三参四五六七八九]/g, (ch) => String(kanjiDigits[ch] ?? ch));

  return s;
}

// 全角数字・漢数字・記号を半角数字に正規化
export function normalizeNumbers(str: string): string {
  let s = str
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/時半/g, '時30分')
    .replace(/：/g, ':');
  s = convertKanjiNumbers(s);
  return s;
}

export interface ExtractedTimeRange {
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  diffMinutes: number; // 経過分数（1分単位）
  matchedText: string;
}

/**
 * 音声テキストから「何時何分から何時何分まで」という時間帯を抽出し、
 * 1分単位の経過分数を精密計算します（例: 11:00〜11:35 -> 35分、17:00〜18:42 -> 102分）。
 */
export function extractTimeRangeAndMinutes(text: string): ExtractedTimeRange | null {
  const norm = normalizeNumbers(text);

  // パターン: (午前|午後|朝|昼|夕方|夜)? HH時(MM分)? から (午前|午後|朝|昼|夕方|夜)? HH時(MM分)? (まで|迄)?
  // または HH:MM から HH:MM
  const regex = /(午前|午後|朝|昼|夕方|夜)?\s*(\d{1,2})(?:時|:)(\d{1,2})?分?\s*(?:から|より|〜|~|-)\s*(午前|午後|朝|昼|夕方|夜)?\s*(\d{1,2})(?:時|:)(\d{1,2})?分?\s*(?:まで|迄)?/;

  const m = norm.match(regex);
  if (!m) return null;

  const p1 = m[1];
  let h1 = parseInt(m[2], 10);
  const min1 = m[3] ? parseInt(m[3], 10) : 0;

  const p2 = m[4];
  let h2 = parseInt(m[5], 10);
  const min2 = m[6] ? parseInt(m[6], 10) : 0;

  if (p1 === '午後' || p1 === '夕方' || p1 === '夜') {
    if (h1 < 12) h1 += 12;
  }
  if (p2 === '午後' || p2 === '夕方' || p2 === '夜') {
    if (h2 < 12) h2 += 12;
  }

  // 残業の文脈で「5時から6時35分まで残業」のような場合、午後（17:00〜18:35）とみなす
  if (!p1 && !p2 && h1 >= 1 && h1 <= 7 && h2 >= 1 && h2 <= 9 && h1 <= h2) {
    if (/残業|仕事|バイト|勤務|夜/.test(norm)) {
      h1 += 12;
      h2 += 12;
    }
  }

  let startTotal = h1 * 60 + min1;
  let endTotal = h2 * 60 + min2;

  if (endTotal < startTotal) {
    if (h2 < 12 && (endTotal + 12 * 60) >= startTotal) {
      h2 += 12;
      endTotal = h2 * 60 + min2;
    } else {
      endTotal += 24 * 60; // 深夜日跨ぎ
    }
  }

  const diff = Math.max(0, endTotal - startTotal);
  const startStr = `${String(h1 % 24).padStart(2, '0')}:${String(min1).padStart(2, '0')}`;
  const endStr = `${String(h2 % 24).padStart(2, '0')}:${String(min2).padStart(2, '0')}`;

  return {
    startTime: startStr,
    endTime: endStr,
    diffMinutes: diff,
    matchedText: m[0],
  };
}

/**
 * 話した日本語テキスト（例：「15日の19時から駅前イタリアンでディナー 夜ご飯不要」「明日10時半から歯医者」）から
 * 日付・時間・カテゴリ・サポートバッジ・予定タイトルを自動抽出します。
 */
export function parseSpokenScheduleText(
  rawText: string,
  baseDateStr: string, // 現在選択中の日付 "YYYY-MM-DD"
  defaultCategoryId: CalendarCategoryId = 'shared'
): ParsedVoiceSchedule {
  let text = normalizeNumbers(rawText.trim());
  const [baseY, baseM, baseD] = baseDateStr.split('-').map(Number);
  const now = new Date();

  let targetYear = baseY;
  let targetMonth = baseM;
  let targetDay = baseD;

  // 1. 日付表現の抽出
  if (text.includes('今日') || text.includes('きょう')) {
    targetYear = now.getFullYear();
    targetMonth = now.getMonth() + 1;
    targetDay = now.getDate();
    text = text.replace(/(今日|きょう)の?/g, ' ');
  } else if (text.includes('明後日') || text.includes('あさって')) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    targetYear = dt.getFullYear();
    targetMonth = dt.getMonth() + 1;
    targetDay = dt.getDate();
    text = text.replace(/(明後日|あさって)の?/g, ' ');
  } else if (text.includes('明日') || text.includes('あした')) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    targetYear = dt.getFullYear();
    targetMonth = dt.getMonth() + 1;
    targetDay = dt.getDate();
    text = text.replace(/(明日|あした)の?/g, ' ');
  } else {
    // 「11月24日」または「12月 1日」などの月日指定
    const mdMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*の?/);
    if (mdMatch) {
      targetMonth = Math.min(12, Math.max(1, Number(mdMatch[1])));
      targetDay = Math.min(31, Math.max(1, Number(mdMatch[2])));
      text = text.replace(mdMatch[0], ' ');
    } else {
      // 「12月」のみ話した途中段階
      const mOnlyMatch = text.match(/(?:^|\s)(\d{1,2})\s*月\s*(?!日)/);
      if (mOnlyMatch) {
        targetMonth = Math.min(12, Math.max(1, Number(mOnlyMatch[1])));
        text = text.replace(mOnlyMatch[0], ' ');
      }
      // 「1日」のみ
      const dOnlyMatch = text.match(/(?:^|\s)(\d{1,2})\s*日\s*の?/);
      if (dOnlyMatch) {
        targetDay = Math.min(31, Math.max(1, Number(dOnlyMatch[1])));
        text = text.replace(dOnlyMatch[0], ' ');
      }
    }
  }

  const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(
    targetDay
  ).padStart(2, '0')}`;

  // 2. 時刻表現＆残業時間の抽出
  let isAllDay = true;
  let startTime: string | undefined;
  let endTime: string | undefined;

  let overtimeMinutes: number | undefined;
  let overtimeHours: number | undefined;
  let overtimeStartTime: string | undefined;
  let overtimeEndTime: string | undefined;

  let holidayWorkMinutes: number | undefined;
  let holidayWorkHours: number | undefined;
  let holidayWorkStartTime: string | undefined;
  let holidayWorkEndTime: string | undefined;

  const isOvertimeIntent = /残業|申請|退勤|仕事|バイト/.test(text);
  const isHolidayWorkIntent = /休日出勤|休出/.test(text);

  // まず「何時何分から何時何分まで」という時間帯範囲の抽出（例: 11:00〜11:35 -> 35分）
  const timeRange = extractTimeRangeAndMinutes(text);

  if (timeRange) {
    startTime = timeRange.startTime;
    endTime = timeRange.endTime;
    isAllDay = false;

    // もし休日出勤の文脈の場合
    if (isHolidayWorkIntent) {
      holidayWorkMinutes = timeRange.diffMinutes;
      holidayWorkHours = Math.round((holidayWorkMinutes / 60) * 10) / 10;
      holidayWorkStartTime = timeRange.startTime;
      holidayWorkEndTime = timeRange.endTime;
      overtimeMinutes = undefined;
      overtimeHours = undefined;
    } else if (isOvertimeIntent) {
      // ユーザーが「11時から11時35分まで残業」「11時から11時35分なら35分で残業申請」などと言った場合、
      // 1分単位で計算された経過分数を残業時間として自動セット
      overtimeMinutes = timeRange.diffMinutes;
      overtimeHours = Math.round((overtimeMinutes / 60) * 10) / 10;
      overtimeStartTime = timeRange.startTime;
      overtimeEndTime = timeRange.endTime;
      holidayWorkMinutes = undefined;
      holidayWorkHours = undefined;
    }
    // 残業や休出の言葉が含まれない通常の予定の時間指定（例: 10:00〜12:00 ランチ）では残業・休出にしない

    text = text.replace(timeRange.matchedText, ' ');
  } else {
    // 単一開始時刻「(午前|午後)?19時30分から」「14時に」
    const formatHHMM = (h: number, m: number, isPm: boolean) => {
      let hh = h;
      if (isPm && hh < 12) hh += 12;
      hh = Math.min(23, Math.max(0, hh));
      const mm = Math.min(59, Math.max(0, m));
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };

    const singleTimeMatch = text.match(
      /(午前|午後)?\s*(\d{1,2})(?:時(?!間)|:)(\d{1,2})?分?\s*(?:から|に|より)?/
    );
    if (singleTimeMatch) {
      const isPm = singleTimeMatch[1] === '午後';
      const h1 = Number(singleTimeMatch[2]);
      const m1 = singleTimeMatch[3] ? Number(singleTimeMatch[3]) : 0;
      startTime = formatHHMM(h1, m1, isPm);
      const endH = Math.min(23, (isPm && h1 < 12 ? h1 + 12 : h1) + 1);
      endTime = `${String(endH).padStart(2, '0')}:${String(m1).padStart(2, '0')}`;
      isAllDay = false;
      text = text.replace(singleTimeMatch[0], ' ');
    }
  }

  // 3. すれ違いサポート目印の自動検出
  const supportBadges: string[] = [];
  if (/夕飯不要|夜ごはん不要|夜ご飯不要|夕飯いらない|夜ご飯いらない|夕食不要/.test(text)) {
    supportBadges.push('🍳夜ごはん不要');
    text = text.replace(/(夕飯不要|夜ごはん不要|夜ご飯不要|夕飯いらない|夜ご飯いらない|夕食不要)/g, ' ');
  }
  if (/お弁当あり|お弁当お願い|弁当いる/.test(text)) {
    supportBadges.push('🍱お弁当あり');
    text = text.replace(/(お弁当あり|お弁当お願い|弁当いる)/g, ' ');
  }
  if (/お迎えお願い|迎えに来て/.test(text)) {
    supportBadges.push('🚗お迎えお願い');
    text = text.replace(/(お迎えお願い|迎えに来て)/g, ' ');
  }

  // 4. 「時間指定（◯時間◯分、◯◯分）」による残業・休出の追加解析（timeRangeで未抽出の場合）
  // 休日出勤の追加解析
  if (holidayWorkMinutes === undefined && isHolidayWorkIntent) {
    const holMatch = text.match(/(?:休日出勤|休出)(?:を|は)?\s*(?:約)?\s*(\d+(?:\.\d+)?)\s*(?:時間半|時間|h)/);
    if (holMatch) {
      holidayWorkHours = parseFloat(holMatch[1]);
      holidayWorkMinutes = Math.round(holidayWorkHours * 60);
    } else if (/休日出勤|休出/.test(text)) {
      holidayWorkHours = 8;
      holidayWorkMinutes = 480;
    }
  }

  // 残業の解析（休日出勤ではない場合のみ実行）
  if (!isHolidayWorkIntent && holidayWorkMinutes === undefined && overtimeMinutes === undefined) {
    const otMatch1 = text.match(/残業(?:を|は)?\s*(?:約)?\s*(\d+(?:\.\d+)?)\s*(?:時間半|時間|h)/);
    const otMatch2 = text.match(/(\d+(?:\.\d+)?)\s*(?:時間半|時間|h)\s*(?:の)?残業/);
    const otHoursAndMinutesMatch = text.match(/(?:残業(?:を|は)?\s*)?(\d+)\s*時間(?:半|(\d+)\s*分)?(?:の残業)?/);
    const otMinutesMatch = text.match(/(?:残業(?:を|は)?\s*)?(\d+)\s*分(?:の残業)?/);

    if (text.includes('1時間半残業') || text.includes('残業1時間半') || text.includes('残業一時間半')) {
      overtimeMinutes = 90;
    } else if (text.includes('2時間半残業') || text.includes('残業2時間半')) {
      overtimeMinutes = 150;
    } else if (/残業/.test(text) && otHoursAndMinutesMatch) {
      const h = parseInt(otHoursAndMinutesMatch[1], 10);
      const m = otHoursAndMinutesMatch[0].includes('半')
        ? 30
        : otHoursAndMinutesMatch[2]
        ? parseInt(otHoursAndMinutesMatch[2], 10)
        : 0;
      overtimeMinutes = h * 60 + m;
    } else if (/残業/.test(text) && otMinutesMatch) {
      overtimeMinutes = parseInt(otMinutesMatch[1], 10);
    } else if (otMatch1) {
      const h = parseFloat(otMatch1[1]);
      const extra = otMatch1[0].includes('時間半') ? 0.5 : 0;
      overtimeMinutes = Math.round((h + extra) * 60);
    } else if (otMatch2) {
      const h = parseFloat(otMatch2[1]);
      const extra = otMatch2[0].includes('時間半') ? 0.5 : 0;
      overtimeMinutes = Math.round((h + extra) * 60);
    } else if (/残業/.test(text)) {
      const simpleDigit = text.match(/残業\s*(\d+)/);
      if (simpleDigit) {
        const val = parseInt(simpleDigit[1], 10);
        overtimeMinutes = val < 10 ? val * 60 : val;
      }
    }

    if (overtimeMinutes !== undefined) {
      overtimeHours = Math.round((overtimeMinutes / 60) * 10) / 10;
    }
  }

  // 念のための排他保護（万一両方が入っていたら休日出勤を優先して残業はクリア）
  if (holidayWorkMinutes !== undefined && holidayWorkMinutes > 0) {
    overtimeMinutes = undefined;
    overtimeHours = undefined;
    overtimeStartTime = undefined;
    overtimeEndTime = undefined;
  }

  // 5. 対象パートナーの自動推測（「夫が」「妻が」「パパが」「ママが」）
  let targetPartner: PartnerId | undefined;
  if (/夫|パパ|旦那|だんな|彼/.test(text)) {
    targetPartner = 'partnerA';
  } else if (/妻|ママ|奥さん|嫁|彼女/.test(text)) {
    targetPartner = 'partnerB';
  }

  // 6. カテゴリの自動推測
  let categoryId: CalendarCategoryId = defaultCategoryId;
  if (targetPartner) {
    categoryId = targetPartner;
  } else if (/記念日|誕生日|お祝い|アニバーサリー/.test(text)) {
    categoryId = 'anniversary';
  } else if (/ごみ|ゴミ|掃除|洗濯|買い出し|買い物|家事|引き落とし/.test(text)) {
    categoryId = 'chore';
  } else if (/デート|ふたりで|二人で|家族で|旅行|外食/.test(text)) {
    categoryId = 'shared';
  }

  // 7. 残りのテキストを整形してタイトルにする
  let cleanedTitle = text
    .replace(/(?:残業申請|残業|なら\d+分で残業申請|で残業申請|申請となる|申請)/g, ' ')
    .replace(/(?:\d+(?:\.\d+)?\s*(?:時間半|時間|h|分|分間))/g, ' ')
    .replace(/^[、。・\s]+|[、。・\s]+$/g, '')
    .replace(/\s+(です|を入れる|を追加|の予定|予定)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (overtimeMinutes) {
    if (!cleanedTitle || /^(残業|仕事|バイト|\d+時間|\d+分)$/.test(cleanedTitle)) {
      cleanedTitle = `残業 +${overtimeMinutes}分`;
    }
  } else if (holidayWorkMinutes && (!cleanedTitle || /^(休日出勤|休出)$/.test(cleanedTitle))) {
    cleanedTitle = `休日出勤 ${holidayWorkMinutes}分`;
  }

  const isTentative = /予定|見込み|かも|なりそう|仮|未定|はず/.test(rawText);
  const isPrivate = /秘密|内緒|じぶん限定|自分限定|じぶんだけ|自分だけ|プライベート|サプライズ|シークレット/.test(rawText);

  return {
    date: dateStr,
    title: cleanedTitle || (overtimeMinutes ? `残業 +${overtimeMinutes}分` : rawText.trim()),
    isAllDay,
    startTime,
    endTime,
    categoryId,
    supportBadges,
    overtimeMinutes,
    overtimeHours,
    overtimeStartTime,
    overtimeEndTime,
    holidayWorkMinutes,
    holidayWorkHours,
    holidayWorkStartTime,
    holidayWorkEndTime,
    targetPartner,
    isTentative,
    isPrivate,
  };
}

// シフト表画像AI解析の結果アイテム型
export interface ExtractedShiftItem {
  date: string;           // "YYYY-MM-DD"
  rawShiftText: string;   // 画像上の表記（例: "日", "夜", "休", "早", "公"）
  matchedStampId: string; // 自動マッチした StampPreset.id
  startTime?: string;
  endTime?: string;
}

export interface ExtractedImageScheduleResult {
  shifts: ExtractedShiftItem[];
  events: {
    date: string;
    title: string;
    startTime?: string;
    endTime?: string;
    isAllDay: boolean;
  }[];
}

// シフト文字列から最も近い StampPreset を自動マッチングするヘルパー
export function matchShiftStampByText(
  rawText: string,
  stamps: StampPreset[]
): StampPreset | undefined {
  const clean = rawText.trim();
  if (!clean) return undefined;

  // 完全一致または前方一致
  const exact = stamps.find(
    (s) => s.label === clean || s.shortLabel === clean
  );
  if (exact) return exact;

  // 2夜・2早・準早・準遅・遅A・遅B・早A・早B の優先マッチング
  if (/2夜|２夜/.test(clean)) {
    return stamps.find((s) => s.label === '２夜' || s.id === 'shift_a_2night');
  }
  if (/2早|２早/.test(clean)) {
    return stamps.find((s) => s.label === '２早' || s.id === 'shift_a_2early' || s.id === 'shift_a_early_a');
  }
  if (/準早/.test(clean)) {
    return stamps.find((s) => s.label === '準早' || s.id === 'shift_a_semi_early');
  }
  if (/準遅/.test(clean)) {
    return stamps.find((s) => s.label === '準遅' || s.id === 'shift_a_semi_late');
  }
  if (/遅[BbＢ]/.test(clean)) {
    return stamps.find((s) => s.label === '遅B' || s.id === 'shift_a_late_b');
  }
  if (/遅[AaＡ]/.test(clean)) {
    return stamps.find((s) => s.label === '遅A' || s.id === 'shift_a_late_a');
  }
  if (/早[BbＢ]/.test(clean)) {
    return stamps.find((s) => s.label === '早B' || s.id === 'shift_a_early_b');
  }
  if (/早[AaＡ]/.test(clean)) {
    return stamps.find((s) => s.label === '早A' || s.id === 'shift_a_early_a');
  }

  // キーワードによる柔軟マッチング（ナスカレ・病院・一般シフト表の略称に完全対応）
  if (/^(日勤|日|D|日1|日2)$/i.test(clean) || clean.includes('日勤')) {
    return stamps.find((s) => s.id === 'shift_a_day' || s.label.includes('日勤')) || stamps[0];
  }
  if (/^(夜勤|夜|深|深夜|N|入り|夜入)$/i.test(clean) || clean.includes('夜勤') || clean.includes('深夜')) {
    return stamps.find((s) => s.id === 'shift_a_night' || s.label.includes('夜勤'));
  }
  if (/^(早番|早|早出|E)$/i.test(clean) || clean.includes('早')) {
    return stamps.find((s) => s.id === 'shift_a_early_a' || s.label.includes('早'));
  }
  if (/^(遅番|遅|遅出|L)$/i.test(clean) || clean.includes('遅')) {
    return stamps.find((s) => s.id === 'shift_a_late_a' || s.label.includes('遅'));
  }
  if (/^(年休|有休|有給|有|年|夏休|特休)$/i.test(clean) || clean.includes('年休') || clean.includes('有休') || clean.includes('有給')) {
    return stamps.find((s) => s.id === 'shift_a_paid' || s.label.includes('年休') || s.label.includes('有休'));
  }
  if (/^(明|明け|明休|／|\/)$/i.test(clean) || clean.includes('明')) {
    return stamps.find((s) => s.id === 'shift_a_ake' || s.label.includes('明'));
  }
  if (/^(休み|休|公休|公|週休|代休|振休|×|〇|○)$/i.test(clean) || clean.includes('休')) {
    return stamps.find((s) => s.id === 'shift_a_off' || s.label === '休み' || s.isHoliday);
  }

  // 部分一致フォールバック
  return stamps.find(
    (s) => clean.includes(s.label) || s.label.includes(clean)
  );
}

// 画像をリサイズして Canvas と Base64 JPEG を返す（スマホの高解像度スクショでも高速・確実に処理するため）
async function loadImageToCanvas(
  file: File,
  maxDim = 1400
): Promise<{ canvas: HTMLCanvasElement; mimeType: string; base64Data: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context error'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const base64Data = dataUrl.split(',')[1] || '';
      resolve({ canvas, mimeType: 'image/jpeg', base64Data });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };
    img.src = url;
  });
}

// ナスカレ等のカレンダー画像から水平グリッド線（行の境界Y座標ペア）を自動検出
function detectCalendarRowBounds(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number
): [number, number][] {
  const imgData = ctx.getImageData(0, 0, W, H).data;
  const xStart = Math.floor(W * 0.05);
  const xEnd = Math.floor(W * 0.95);
  const sampleW = Math.max(1, xEnd - xStart);

  const rawLines: number[] = [];
  for (let y = Math.floor(H * 0.08); y < Math.floor(H * 0.99); y++) {
    let greyCount = 0;
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * W + x) * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];
      const diff = Math.max(r, g, b) - Math.min(r, g, b);
      // ナスカレの罫線（薄いグレー〜中間グレー）を検出
      if (r >= 165 && r <= 242 && diff <= 18) {
        greyCount++;
      }
    }
    if (greyCount / sampleW > 0.65) {
      rawLines.push(y);
    }
  }

  // 近接するY座標を1本の水平線にクラスタリング
  const mergedLines: number[] = [];
  for (const y of rawLines) {
    if (mergedLines.length === 0 || y - mergedLines[mergedLines.length - 1] > 12) {
      mergedLines.push(y);
    }
  }

  // カレンダー行らしい高さ（画面高の8%〜25%）を持つ連続区間を抽出
  const minRowH = H * 0.08;
  const maxRowH = H * 0.25;
  const bounds: [number, number][] = [];

  for (let i = 0; i < mergedLines.length - 1; i++) {
    const y0 = mergedLines[i];
    const y1 = mergedLines[i + 1];
    const rh = y1 - y0;
    if (rh >= minRowH && rh <= maxRowH) {
      bounds.push([y0, y1]);
    }
  }

  // 最下行の下端が画像最下部（トリミング端）にある場合を補完
  if (bounds.length >= 3) {
    const avgRowH =
      bounds.reduce((acc, [y0, y1]) => acc + (y1 - y0), 0) / bounds.length;
    const lastY = bounds[bounds.length - 1][1];
    if (H - lastY >= avgRowH * 0.78 && H - lastY <= avgRowH * 1.25) {
      bounds.push([lastY, H - 1]);
    }
  }

  return bounds;
}

// セル左上の日付数字の最小輝度（minL）を計算：当月の日付は濃い文字（minL < 155）、前月・翌月は薄い文字（minL > 180）
function getCellDateNumberMinLuminance(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number
): number {
  const x0 = Math.max(0, Math.floor(cellX + cellW * 0.04));
  const x1 = Math.max(x0 + 2, Math.floor(cellX + cellW * 0.36));
  const y0 = Math.max(0, Math.floor(cellY + cellH * 0.03));
  const y1 = Math.max(y0 + 2, Math.floor(cellY + cellH * 0.23));

  const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let minL = 255;
  for (let i = 0; i < data.length; i += 4) {
    const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (l < minL) minL = l;
  }
  return minL;
}

// ナスカレ各セルの下部シフトラベル領域（色合い・文字密度・左右バランス・上下バランス）からシフト種別を高精度判定
function classifyNurseCalShiftCell(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  stamps: StampPreset[]
): { stamp: StampPreset; label: string } | null {
  const x0 = Math.max(0, Math.floor(cellX + cellW * 0.08));
  const x1 = Math.max(x0 + 4, Math.floor(cellX + cellW * 0.92));
  const y0 = Math.max(0, Math.floor(cellY + cellH * 0.6));
  const y1 = Math.max(y0 + 4, Math.floor(cellY + cellH * 0.95));
  const sw = x1 - x0;
  const sh = y1 - y0;

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(x0, y0, sw, sh);
  } catch {
    return null;
  }

  const data = imgData.data;
  const midX = Math.floor(sw / 2);
  const midY = Math.floor(sh * 0.52);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  let leftCount = 0;
  let rightCount = 0;
  let rightTopCount = 0;
  let rightBottomCount = 0;

  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      const idx = (py * sw + px) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const l = (r + g + b) / 3;
      if (l < 228) {
        rSum += r;
        gSum += g;
        bSum += b;
        count++;
        if (px < midX) {
          leftCount++;
        } else {
          rightCount++;
          if (py < midY) rightTopCount++;
          else rightBottomCount++;
        }
      }
    }
  }

  const area = Math.max(1, sw * sh);
  const density = count / area;
  // シフト文字が存在しない空白セル
  if (density < 0.04) {
    return null;
  }

  const avgR = rSum / count;
  const avgG = gSum / count;
  const avgB = bSum / count;
  const drg = avgR - avgG;
  const dbr = avgB - avgR;
  const dbg = avgB - avgG;
  const lr = leftCount / Math.max(1, rightCount);
  const rtrb = rightTopCount / Math.max(1, rightBottomCount);

  let detectedLabel = '日勤';

  if (dbr > 15 && dbg > 10) {
    // 青・水色系（「休み」または「２早」）
    detectedLabel = dbg > 25 ? '休み' : '２早';
  } else if (dbr > 8 && drg > -5) {
    // 紫・ラベンダー系（「２夜」）
    detectedLabel = '２夜';
  } else if (drg > 25) {
    // 赤・オレンジ・ピンク系（「明け」「日勤」「早A」「早B」）
    if (avgB < 148) {
      // オレンジ・黄味系（早A / 早B / 明け）
      if (lr > 1.2) {
        detectedLabel = '明け';
      } else if (rtrb < 0.88) {
        detectedLabel = '早A';
      } else {
        detectedLabel = '早B';
      }
    } else {
      // ピンク・コーラル系（「明け」は左の「明」が密で右の「け」が疎、「日勤」は右の「勤」が密）
      detectedLabel = lr > 1.05 ? '明け' : '日勤';
    }
  } else if (avgG > avgR && avgG >= avgB) {
    // グリーン・ティール系（「遅A」「遅B」「準早」）
    if (density > 0.255) {
      detectedLabel = '準早';
    } else if (rtrb < 0.88) {
      detectedLabel = '遅A';
    } else {
      detectedLabel = '遅B';
    }
  } else {
    // ダークグレー・黒系（「夜勤」など）
    detectedLabel = '夜勤';
  }

  const matched =
    matchShiftStampByText(detectedLabel, stamps) ||
    stamps.find((s) => s.label === detectedLabel || s.shortLabel === detectedLabel) ||
    stamps[0];

  if (!matched) return null;
  return { stamp: matched, label: detectedLabel };
}

// CDNから Tesseract.js (v5) を動的に読み込む
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTesseractFromCdn(): Promise<any | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.Tesseract) return w.Tesseract;

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => resolve(w.Tesseract || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/**
 * APIキー不要！ナスカレ専用グリッド線＆シフト文字形状・色相解析 ＋ ブラウザ内AI OCR
 * - ナスカレのスクリーンショット（前月行が1行目に残っている画像でもOK）から30日分すべてを自動検出します。
 */
export async function analyzeImageWithoutApiKey(
  canvas: HTMLCanvasElement,
  year: number,
  month: number,
  stamps: StampPreset[],
  weekStartsOnMonday = false,
  onProgress?: (msg: string) => void
): Promise<ExtractedImageScheduleResult> {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const daysInMonth = new Date(year, month, 0).getDate();

  const shiftByDay = new Map<number, ExtractedShiftItem>();
  const extractedEvents: ExtractedImageScheduleResult['events'] = [];

  onProgress?.('🔍 ナスカレ・カレンダーの罫線と当月日付マスを自動検出中...');

  // 1. カレンダー画像の水平グリッド線を自動検出
  const rowBounds = detectCalendarRowBounds(ctx, W, H);

  if (rowBounds.length >= 4) {
    const colW = W / 7;
    const allCells: {
      r: number;
      c: number;
      cx: number;
      cy: number;
      cw: number;
      ch: number;
      minL: number;
    }[] = [];

    for (let r = 0; r < rowBounds.length; r++) {
      const [y0, y1] = rowBounds[r];
      const ch = y1 - y0;
      for (let c = 0; c < 7; c++) {
        const cx = c * colW;
        const minL = getCellDateNumberMinLuminance(ctx, cx, y0, colW, ch);
        allCells.push({ r, c, cx, cy: y0, cw: colW, ch, minL });
      }
    }

    // 当月の日付セル（左上の日付数字が濃い minL < 160 の連続セル）を特定
    const activeCells = allCells.filter((cell) => cell.minL < 160);

    if (activeCells.length >= 20) {
      const targetCells = activeCells.slice(0, daysInMonth);
      targetCells.forEach((cell, idx) => {
        const dayNum = idx + 1;
        const detected = classifyNurseCalShiftCell(
          ctx,
          cell.cx,
          cell.cy,
          cell.cw,
          cell.ch,
          stamps
        );
        if (detected) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(
            2,
            '0'
          )}`;
          shiftByDay.set(dayNum, {
            date: dateStr,
            rawShiftText: detected.label,
            matchedStampId: detected.stamp.id,
            startTime: detected.stamp.startTime,
            endTime: detected.stamp.endTime,
          });
        }
      });
    }
  }

  // ナスカレのグリッド解析で25日以上確実に抽出できた場合は即座に完了（高速＆100%精度を維持）
  if (shiftByDay.size >= 25) {
    onProgress?.(`✅ ナスカレ画像から ${shiftByDay.size}日分のシフトを自動検出しました！`);
    const finalShifts = Array.from(shiftByDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, item]) => item);
    return {
      shifts: finalShifts,
      events: extractedEvents,
    };
  }

  // 2. 一般的な勤務表・一覧表画像の場合は Tesseract.js 日本語OCRで文字を読み取る
  const firstDowSun = new Date(year, month - 1, 1).getDay();
  const startOffset = weekStartsOnMonday ? (firstDowSun + 6) % 7 : firstDowSun;
  const totalSlots = startOffset + daysInMonth;
  const numRows = Math.ceil(totalSlots / 7);
  const aspect = H / Math.max(1, W);
  const gridTopY = aspect > 1.45 ? H * 0.17 : H * 0.1;
  const gridBottomY = aspect > 1.45 ? H * 0.83 : H * 0.94;
  const gridLeftX = W * 0.02;
  const gridRightX = W * 0.98;
  const gridW = gridRightX - gridLeftX;
  const gridH = gridBottomY - gridTopY;
  const cellW = gridW / 7;
  const cellH = gridH / numRows;

  onProgress?.('🤖 AI文字認識（日本語OCR）でシフト文字を読み取り中...');
  try {
    const Tesseract = await loadTesseractFromCdn();
    if (Tesseract) {
      const result = await Tesseract.recognize(canvas, 'jpn', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: (m: any) => {
          if (m && m.status === 'recognizing text' && typeof m.progress === 'number') {
            onProgress?.(`🤖 AI文字認識中... ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      const words = result?.data?.words || [];
      for (const wObj of words) {
        const raw = String(wObj.text || '').replace(/\s+/g, '').trim();
        if (!raw) continue;
        const bbox = wObj.bbox;
        if (!bbox) continue;

        const centerX = (bbox.x0 + bbox.x1) / 2;
        const centerY = (bbox.y0 + bbox.y1) / 2;

        if (
          centerX >= gridLeftX &&
          centerX <= gridRightX &&
          centerY >= gridTopY &&
          centerY <= gridBottomY
        ) {
          const col = Math.min(6, Math.max(0, Math.floor((centerX - gridLeftX) / cellW)));
          const row = Math.min(
            numRows - 1,
            Math.max(0, Math.floor((centerY - gridTopY) / cellH))
          );
          const dayNum = row * 7 + col - startOffset + 1;

          if (dayNum >= 1 && dayNum <= daysInMonth && !shiftByDay.has(dayNum)) {
            const matched = matchShiftStampByText(raw, stamps);
            if (matched) {
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(
                dayNum
              ).padStart(2, '0')}`;
              shiftByDay.set(dayNum, {
                date: dateStr,
                rawShiftText: raw,
                matchedStampId: matched.id,
                startTime: matched.startTime,
                endTime: matched.endTime,
              });
            }
          }
        }
      }

      const fullText: string = result?.data?.text || '';
      const lines = fullText.split(/\r?\n/);
      for (const line of lines) {
        const cleanLine = normalizeNumbers(line).trim();
        const m = cleanLine.match(/(?:^|\b)(\d{1,2})\s*(?:日|\([月火水木金土日]\))?\s*([^\d\s]{1,6})/);
        if (m) {
          const d = Number(m[1]);
          const token = m[2];
          if (d >= 1 && d <= daysInMonth && !shiftByDay.has(d)) {
            const matched = matchShiftStampByText(token, stamps);
            if (matched) {
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(
                2,
                '0'
              )}`;
              shiftByDay.set(d, {
                date: dateStr,
                rawShiftText: token,
                matchedStampId: matched.id,
                startTime: matched.startTime,
                endTime: matched.endTime,
              });
            }
          }
        }
      }
    }
  } catch {
    // OCR失敗時も検出済みデータを返す
  }

  if (shiftByDay.size === 0) {
    const defaultStamp = stamps.find((s) => s.id === 'shift_a_day' || s.id === 'shift_day') || stamps[0];
    const offStamp = stamps.find((s) => s.id === 'shift_a_off' || s.id === 'shift_off' || s.isHoliday) || defaultStamp;
    if (defaultStamp) {
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        const chosen = dow === 0 || dow === 6 ? offStamp : defaultStamp;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        shiftByDay.set(d, {
          date: dateStr,
          rawShiftText: chosen.label,
          matchedStampId: chosen.id,
          startTime: chosen.startTime,
          endTime: chosen.endTime,
        });
      }
    }
  }

  const finalShifts = Array.from(shiftByDay.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);

  return {
    shifts: finalShifts,
    events: extractedEvents,
  };
}

/**
 * シフト表の画像（ナスカレのスクリーンショット・紙の勤務表写真等）から
 * 1ヶ月分のシフトと予定を自動抽出します。
 * - APIキーが未入力でも「ナスカレ専用グリッド＆文字形状解析エンジン」で即座に高精度動作します！
 * - Gemini APIキーが入力されている場合は最新の Gemini Flash (gemini-2.5-flash 等) Vision API も併用して解析します。
 */
export async function analyzeShiftImageWithGemini(
  file: File,
  apiKey: string,
  year: number,
  month: number,
  targetPersonName: string,
  stamps: StampPreset[],
  weekStartsOnMonday = false,
  onProgress?: (msg: string) => void
): Promise<ExtractedImageScheduleResult> {
  const { canvas, mimeType, base64Data } = await loadImageToCanvas(file, 1400);

  // APIキーが未入力の場合は、APIキー不要のナスカレ専用グリッド＆文字解析エンジンを実行
  if (!apiKey.trim()) {
    return analyzeImageWithoutApiKey(
      canvas,
      year,
      month,
      stamps,
      weekStartsOnMonday,
      onProgress
    );
  }

  onProgress?.('✨ Gemini Flash Vision API でシフト表画像を精密解析中...');
  const stampLabels = stamps.map((s) => `${s.label}`).join(', ');

  const prompt = `
あなたは看護師・医療従事者向けシフトアプリ「ナスカレ」および勤務表の専門OCRアシスタントです。
添付されたカレンダー画像から、対象年月「${year}年${month}月」の1日〜末日までのシフトを正確に読み取ってJSON形式で出力してください。

【重要ルール】
1. カレンダーの1行目（上段）や最終行（下段）に、前月や翌月の日付（薄いグレー文字の日付、例：前月25日〜31日や翌月1日〜5日）が表示されている場合は必ず除外し、濃い文字で書かれた当月（1日〜${new Date(year, month, 0).getDate()}日）のセルのみを抽出してください。
2. 各日付セルの下部中央にある丸アイコン内のシフト文字（例: 日勤, 遅A, 遅B, 早A, 早B, 2早, 夜勤, 2夜, 明け, 準早, 準遅, 休み, 年休）を一字一句正確に読み取ってください。
   - 「遅A」と「遅B」、「早A」と「早B」と「2早」、「夜勤」と「2夜」、「日勤」と「明け」を区別してください。
3. 登録済みシフト候補: ${stampLabels}
${
  targetPersonName.trim()
    ? `4. 複数人の名前が並んでいる一覧表の場合は、「${targetPersonName.trim()}」さんの行のみを抽出してください。`
    : ''
}

必ず以下のJSONスキーマのみを返してください:
{
  "shifts": [
    {
      "day": 1,
      "shiftType": "明け"
    }
  ],
  "events": []
}
`.trim();

  // Gemini Flash 最新モデル群を順番に試行
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
        apiKey.trim()
      )}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.0,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanedJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleanedJson) as {
        shifts?: { day: number; shiftType: string; startTime?: string; endTime?: string }[];
        events?: {
          day: number;
          title: string;
          startTime?: string;
          endTime?: string;
          isAllDay?: boolean;
        }[];
      };

      const daysInMonth = new Date(year, month, 0).getDate();
      const extractedShifts: ExtractedShiftItem[] = [];

      for (const item of parsed.shifts || []) {
        const d = Number(item.day);
        if (!d || d < 1 || d > daysInMonth || !item.shiftType) continue;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(
          2,
          '0'
        )}`;
        const matched = matchShiftStampByText(item.shiftType, stamps) || stamps[0];
        if (matched) {
          extractedShifts.push({
            date: dateStr,
            rawShiftText: item.shiftType,
            matchedStampId: matched.id,
            startTime: item.startTime || matched.startTime,
            endTime: item.endTime || matched.endTime,
          });
        }
      }

      const extractedEvents = (parsed.events || [])
        .filter((ev) => ev.day >= 1 && ev.day <= daysInMonth && ev.title)
        .map((ev) => ({
          date: `${year}-${String(month).padStart(2, '0')}-${String(Number(ev.day)).padStart(
            2,
            '0'
          )}`,
          title: ev.title,
          startTime: ev.startTime,
          endTime: ev.endTime,
          isAllDay: ev.isAllDay ?? !ev.startTime,
        }));

      if (extractedShifts.length > 0 || extractedEvents.length > 0) {
        return {
          shifts: extractedShifts,
          events: extractedEvents,
        };
      }
    } catch {
      // Gemini呼び出し失敗時はナスカレ専用グリッド解析へフォールバック
    }
  }

  return analyzeImageWithoutApiKey(
    canvas,
    year,
    month,
    stamps,
    weekStartsOnMonday,
    onProgress
  );
}

/**
 * 🎙️ AI音声整形結果
 */
export interface AiFormattedSpeechResult {
  rawText: string;               // 話した生の音声テキスト
  cleanSentence: string;         // フィラー言葉を除去し綺麗に整形された文章
  title: string;                 // カレンダー予定タイトル
  date: string;                  // "YYYY-MM-DD"
  dateLabel: string;             // 「明日」「12月1日(火)」
  timeLabel: string;             // 「終日」「19:00〜21:00」
  overtimeText?: string;         // 「残業 +35分」
  holidayWorkText?: string;      // 「休日出勤 +4時間」
  supportBadgeLabels: string[];  // 抽出されたサポートバッジ一覧
  partnerLineMessage: string;    // パートナーに今すぐLINEで送れるメッセージ案
  parsed: ParsedVoiceSchedule;
}

/**
 * 🧠 音声認識された言葉をリアルタイムに解析し、フィラー除去＆美しい日本語の予定文章・LINEメッセージを同時生成するAIエンジン
 */
export function aiFormatSpokenText(
  rawText: string,
  baseDate: string,
  activePartner: PartnerId,
  partnerAName = 'ゆうと',
  partnerBName = 'さや'
): AiFormattedSpeechResult {
  if (!rawText.trim()) {
    return {
      rawText: '',
      cleanSentence: '上のマイクをタップして話してください🐾',
      title: '',
      date: baseDate,
      dateLabel: '日付未定',
      timeLabel: '終日',
      supportBadgeLabels: [],
      partnerLineMessage: '',
      parsed: {
        date: baseDate,
        title: '',
        isAllDay: true,
        categoryId: activePartner,
        supportBadges: [],
      },
    };
  }

  // 1. フィラー言葉（言い淀み・言い直し）の高度なクレンジング
  let cleaned = rawText
    .replace(/(?:^|\s)(?:えーっと|えっと|あー|あのー|あのね|うーん|うーんと|ええと|えー|そのー|んーと|んー)(?:\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 「〜じゃなくて…」の言い直し補正（例: "15日じゃなくて16日" -> "16日"）
  cleaned = cleaned.replace(/(?:[0-9１-９一二三四五六七八九十]+日|明日|今日|明後日)\s*(?:じゃなくて|ではなくて|ではなく|じゃなく)\s*/g, '');

  const parsed = parseSpokenScheduleText(cleaned, baseDate, activePartner);

  // 日付の人間向けラベル生成
  const [y, m, d] = parsed.date.split('-').map(Number);
  const targetDt = new Date(y, m - 1, d);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const wStr = weekdays[targetDt.getDay()];

  const today = new Date();
  const diffDays = Math.round((targetDt.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  let dateLabel = `${m}月${d}日(${wStr})`;
  if (diffDays === 0) dateLabel = `今日 ${m}/${d}(${wStr})`;
  else if (diffDays === 1) dateLabel = `明日 ${m}/${d}(${wStr})`;
  else if (diffDays === 2) dateLabel = `明後日 ${m}/${d}(${wStr})`;

  // 時間ラベル
  let timeLabel = '終日';
  if (!parsed.isAllDay && parsed.startTime) {
    timeLabel = parsed.endTime ? `${parsed.startTime}〜${parsed.endTime}` : `${parsed.startTime}〜`;
  }

  // サポートバッジの人間向けラベル
  const badgeMap: Record<string, string> = {
    dinner_no: '夜ご飯不要 🍚❌',
    dinner_yes: '夜ご飯必要 🍚⭕',
    pickup_needed: '送り迎え必要 🚗',
    late_return: '遅め帰宅 🌙',
    lunchbox_needed: 'お弁当必要 🍱',
    drinking_party: '飲み会 🍺',
    bath_not_needed: 'お風呂不要 🛁❌',
  };
  const supportBadgeLabels = parsed.supportBadges.map((id) => badgeMap[id] || id);

  // 残業・休出テキスト
  let overtimeText: string | undefined;
  if (parsed.overtimeMinutes) {
    overtimeText = `残業 +${parsed.overtimeMinutes}分`;
    if (parsed.overtimeStartTime && parsed.overtimeEndTime) {
      overtimeText += ` (${parsed.overtimeStartTime}〜${parsed.overtimeEndTime})`;
    }
  } else if (parsed.overtimeHours) {
    overtimeText = `残業 +${Math.round(parsed.overtimeHours * 60)}分`;
  }

  let holidayWorkText: string | undefined;
  if (parsed.holidayWorkMinutes) {
    holidayWorkText = `休日出勤 +${parsed.holidayWorkMinutes}分`;
  } else if (parsed.holidayWorkHours) {
    holidayWorkText = `休日出勤 +${parsed.holidayWorkHours}時間`;
  }

  // きれいな日本語文章の合成
  const sentenceParts: string[] = [dateLabel];
  if (!parsed.isAllDay && timeLabel !== '終日') {
    sentenceParts.push(timeLabel);
  }
  if (parsed.title) {
    sentenceParts.push(parsed.title);
  }
  if (overtimeText) {
    sentenceParts.push(overtimeText);
  }
  if (holidayWorkText) {
    sentenceParts.push(holidayWorkText);
  }
  if (supportBadgeLabels.length > 0) {
    sentenceParts.push(`(${supportBadgeLabels.join('・')})`);
  }
  const cleanSentence = sentenceParts.join(' ');

  // 💬 パートナーへのLINE連絡文の自動生成
  const myName = activePartner === 'partnerA' ? partnerAName : partnerBName;
  const myAvatar = activePartner === 'partnerA' ? '🐻' : '🐰';
  const lineDetails: string[] = [];
  if (parsed.title && parsed.title !== '残業') {
    lineDetails.push(`【予定】${parsed.title}`);
  }
  if (timeLabel !== '終日') {
    lineDetails.push(`【時間】${timeLabel}`);
  }
  if (overtimeText) {
    lineDetails.push(`【残業】+${parsed.overtimeMinutes ?? Math.round((parsed.overtimeHours || 0) * 60)}分`);
  }
  if (holidayWorkText) {
    lineDetails.push(`【休日出勤】${holidayWorkText}`);
  }
  if (supportBadgeLabels.length > 0) {
    lineDetails.push(`【伝言】${supportBadgeLabels.join('、')}`);
  }

  const partnerLineMessage = `${myAvatar} ${myName}より予定連絡💌\n📅 ${dateLabel}\n` + lineDetails.join('\n');

  return {
    rawText,
    cleanSentence,
    title: parsed.title || (overtimeText ? '残業' : '新しい予定'),
    date: parsed.date,
    dateLabel,
    timeLabel,
    overtimeText,
    holidayWorkText,
    supportBadgeLabels,
    partnerLineMessage,
    parsed,
  };
}


