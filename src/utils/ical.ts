// iCal (.ics) インポート＆エクスポート ＆ ナスカレ（NurseKar）シフト自動振り分け連携ユーティリティ
import {
  CalendarCategoryId,
  CalendarDataStore,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import {
  CATEGORY_MAP,
  formatMinutesShort,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
} from './presets';
import { matchShiftStampByText } from './voiceAndAi';

// YYYY-MM-DD を YYYYMMDD 形式に変換
function formatIcsDateOnly(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

// YYYY-MM-DD の翌日を計算（終日予定のDTEND用）
function getNextDayIcs(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

// YYYY-MM-DD と HH:mm を YYYYMMDDTHHmm00 に変換
function formatIcsDateTime(dateStr: string, timeStr: string): string {
  const d = dateStr.replace(/-/g, '');
  const t = timeStr.replace(':', '') + '00';
  return `${d}T${t}`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export type IcsExportTarget = 'all' | 'shared_and_events' | 'partnerA' | 'partnerB';

// カレンダーデータストアを .ics (iCalendar) 文字列に変換
export function exportToIcs(
  store: CalendarDataStore,
  target: IcsExportTarget = 'all'
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PairCal//Couple Shift & Schedule Calendar//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ペアカレ (PairCal)',
    'X-WR-TIMEZONE:Asia/Tokyo',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Tokyo',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:JST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps) {
    stampMap.set(s.id, s);
  }

  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  let count = 0;

  // 1. シフトデータの出力
  if (target === 'all' || target === 'partnerA' || target === 'partnerB') {
    for (const shift of Object.values(store.shifts)) {
      if (shift.deletedAt) continue;
      if (target === 'partnerA' && shift.partnerId !== 'partnerA') continue;
      if (target === 'partnerB' && shift.partnerId !== 'partnerB') continue;

      const partner = store.metadata.partners[shift.partnerId];
      const stamp = stampMap.get(shift.stampId);
      const label =
        shift.customLabel || stamp?.label || (shift.isHolidayWork ? '休日出勤' : 'シフト');
      const icon = stamp?.icon || '';
      const extraParts: string[] = [];
      const otMin = getShiftOvertimeMinutes(shift);
      const holMin = getShiftHolidayWorkMinutes(shift);
      if (otMin > 0) extraParts.push(`残業+${formatMinutesShort(otMin)}`);
      if (holMin > 0) extraParts.push(`休出${formatMinutesShort(holMin)}`);
      if (shift.subCustomLabel) extraParts.push(`+${shift.subCustomLabel}`);
      const extraSuffix = extraParts.length > 0 ? ` (${extraParts.join('/')})` : '';

      const summary = `${partner.avatar}${partner.name}: ${icon}${label}${extraSuffix}`;
      const startTime = shift.startTime || stamp?.startTime;
      const endTime = shift.endTime || stamp?.endTime;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:futarical-shift-${shift.id}@futarical.local`);
      lines.push(`DTSTAMP:${dtstamp}`);

      if (startTime && endTime) {
        const endDayStr =
          endTime < startTime ? getNextDayIcs(shift.date) : formatIcsDateOnly(shift.date);
        lines.push(`DTSTART;TZID=Asia/Tokyo:${formatIcsDateTime(shift.date, startTime)}`);
        lines.push(`DTEND;TZID=Asia/Tokyo:${endDayStr}T${endTime.replace(':', '')}00`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(shift.date)}`);
        lines.push(`DTEND;VALUE=DATE:${getNextDayIcs(shift.date)}`);
      }

      lines.push(`SUMMARY:${escapeIcsText(summary)}`);
      if (shift.memo) {
        lines.push(`DESCRIPTION:${escapeIcsText(shift.memo)}`);
      }
      lines.push('END:VEVENT');
      count++;
    }
  }

  // 2. カレンダー予定データの出力
  for (const ev of Object.values(store.events)) {
    if (ev.deletedAt) continue;
    if (target === 'partnerA' && ev.categoryId !== 'partnerA' && ev.categoryId !== 'shared')
      continue;
    if (target === 'partnerB' && ev.categoryId !== 'partnerB' && ev.categoryId !== 'shared')
      continue;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:futarical-event-${ev.id}@futarical.local`);
    lines.push(`DTSTAMP:${dtstamp}`);

    if (!ev.isAllDay && ev.startTime) {
      const endT = ev.endTime || ev.startTime;
      const endDateStr = ev.endDate || ev.date;
      lines.push(`DTSTART;TZID=Asia/Tokyo:${formatIcsDateTime(ev.date, ev.startTime)}`);
      lines.push(`DTEND;TZID=Asia/Tokyo:${formatIcsDateTime(endDateStr, endT)}`);
    } else {
      const endDateStr = ev.endDate || ev.date;
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(ev.date)}`);
      lines.push(`DTEND;VALUE=DATE:${getNextDayIcs(endDateStr)}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);
    const descParts: string[] = [];
    if (ev.memo) descParts.push(ev.memo);
    if (ev.supportBadges && ev.supportBadges.length > 0) {
      descParts.push(`サポート: ${ev.supportBadges.join(' / ')}`);
    }
    if (descParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
    }
    lines.push('END:VEVENT');
    count++;
  }

  // 0件の時にスマホで「開けません」とならないよう、案内予定を1件含める
  if (count === 0) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(now.getDate()).padStart(2, '0')}`;
    lines.push('BEGIN:VEVENT');
    lines.push('UID:futarical-sample-welcome@futarical.local');
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(todayStr)}`);
    lines.push(`DTEND;VALUE=DATE:${getNextDayIcs(todayStr)}`);
    lines.push('SUMMARY:🐻💕🐰 ペアカレ カレンダー連携テスト');
    lines.push(
      'DESCRIPTION:ペアカレにシフトや予定を登録してから書き出すと、ここにまとめて表示されます。'
    );
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// .ics テキストをパースして「シフト」と「予定」に自動振り分けして返す（ナスカレ連携対応）
export function parseIcsWithShiftDetection(
  icsContent: string,
  defaultCategoryId: CalendarCategoryId = 'shared',
  targetPartnerId: PartnerId = 'partnerA',
  stamps: StampPreset[] = [],
  autoDetectShifts = true
): { events: ScheduleEvent[]; shifts: ShiftEntry[] } {
  const unfolded = icsContent.replace(/\r?\n[ \t]/g, '');
  const rawLines = unfolded.split(/\r?\n/);

  const importedEvents: ScheduleEvent[] = [];
  const importedShifts: ShiftEntry[] = [];
  let inEvent = false;
  let currentProps: Record<string, string> = {};

  const parseIcsTimestamp = (
    rawVal: string
  ): { date: string; time?: string; isAllDay: boolean } | null => {
    const clean = rawVal.trim();
    if (/^\d{8}$/.test(clean)) {
      return {
        date: `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`,
        isAllDay: true,
      };
    }
    const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (match) {
      const [, y, m, d, hh, mm, ss, isUtc] = match;
      if (isUtc) {
        const dt = new Date(
          Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss))
        );
        const jst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
        const jy = jst.getUTCFullYear();
        const jm = String(jst.getUTCMonth() + 1).padStart(2, '0');
        const jd = String(jst.getUTCDate()).padStart(2, '0');
        const jh = String(jst.getUTCHours()).padStart(2, '0');
        const jmin = String(jst.getUTCMinutes()).padStart(2, '0');
        return {
          date: `${jy}-${jm}-${jd}`,
          time: `${jh}:${jmin}`,
          isAllDay: false,
        };
      }
      return {
        date: `${y}-${m}-${d}`,
        time: `${hh}:${mm}`,
        isAllDay: false,
      };
    }
    return null;
  };

  const unescapeIcsText = (str: string) =>
    str
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');

  const nowIso = new Date().toISOString();
  const catInfo = CATEGORY_MAP[defaultCategoryId];

  for (const line of rawLines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentProps = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      const dtStartRaw = currentProps['DTSTART'];
      const summaryRaw = currentProps['SUMMARY'];
      if (dtStartRaw && summaryRaw) {
        const parsedStart = parseIcsTimestamp(dtStartRaw);
        const parsedEnd = currentProps['DTEND'] ? parseIcsTimestamp(currentProps['DTEND']) : null;

        if (parsedStart) {
          const cleanTitle = unescapeIcsText(summaryRaw).trim();

          // ナスカレ由来のシフト項目か判定（例: "[ナスカレ] 日勤", "日勤", "夜勤", "公休", "休み", "準夜" 等）
          const strippedForShift = cleanTitle
            .replace(/^(\[.*?\]|【.*?】)\s*/, '')
            .trim();

          const matchedStamp =
            autoDetectShifts && strippedForShift.length <= 6
              ? matchShiftStampByText(strippedForShift, stamps)
              : undefined;

          if (matchedStamp) {
            const shiftId = `${parsedStart.date}_${targetPartnerId}`;
            importedShifts.push({
              id: shiftId,
              date: parsedStart.date,
              partnerId: targetPartnerId,
              stampId: matchedStamp.id,
              startTime: parsedStart.time || matchedStamp.startTime,
              endTime: parsedEnd?.time || matchedStamp.endTime,
              memo: currentProps['DESCRIPTION']
                ? unescapeIcsText(currentProps['DESCRIPTION'])
                : undefined,
              createdBy: targetPartnerId,
              createdAt: nowIso,
              updatedAt: nowIso,
              deletedAt: null,
            });
          } else {
            const id = `ics_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            importedEvents.push({
              id,
              date: parsedStart.date,
              title: cleanTitle,
              categoryId: defaultCategoryId,
              color: catInfo.accentColor,
              isAllDay: parsedStart.isAllDay,
              startTime: parsedStart.time,
              endTime: parsedEnd?.time,
              memo: currentProps['DESCRIPTION']
                ? unescapeIcsText(currentProps['DESCRIPTION'])
                : undefined,
              createdBy: targetPartnerId,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
          }
        }
      }
      continue;
    }

    if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const keyPart = line.slice(0, colonIdx);
        const valPart = line.slice(colonIdx + 1);
        const baseKey = keyPart.split(';')[0].toUpperCase();
        currentProps[baseKey] = valPart;
      }
    }
  }

  return { events: importedEvents, shifts: importedShifts };
}

export function parseIcsEvents(
  icsContent: string,
  defaultCategoryId: CalendarCategoryId = 'shared',
  createdBy: PartnerId = 'partnerA'
): ScheduleEvent[] {
  return parseIcsWithShiftDetection(icsContent, defaultCategoryId, createdBy, [], false).events;
}

/**
 * ナスカレの「LINEでシフト共有」テキストやメモ貼り付けからシフトと予定を一括解析
 * 例:
 * "11/1(日) 日勤 08:30-17:30"
 * "11/2(月) 夜勤 / 歯医者"
 * "3日 休み"
 */
export function parseNurseKarText(
  rawText: string,
  defaultYear: number,
  defaultMonth: number,
  targetPartnerId: PartnerId,
  stamps: StampPreset[],
  defaultCategoryId: CalendarCategoryId = 'shared'
): { shifts: ShiftEntry[]; events: ScheduleEvent[] } {
  const lines = rawText.split(/\r?\n/);
  const shifts: ShiftEntry[] = [];
  const events: ScheduleEvent[] = [];
  const nowIso = new Date().toISOString();
  const catInfo = CATEGORY_MAP[defaultCategoryId];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 日付の抽出: "11/3(火) ..." または "11月3日 ..." または "3日 ..." または "3(火) ..."
    let month = defaultMonth;
    let day = 0;
    let rest = '';

    const m1 = line.match(/^(\d{1,2})[\/月](\d{1,2})日?(?:\s*\([日月火水木金土祝]+\))?[\s:：・]*(.+)$/);
    if (m1) {
      month = Number(m1[1]);
      day = Number(m1[2]);
      rest = m1[3].trim();
    } else {
      const m2 = line.match(/^(\d{1,2})(?:日|\s*\([日月火水木金土祝]+\))[\s:：・]*(.+)$/);
      if (m2) {
        day = Number(m2[1]);
        rest = m2[2].trim();
      }
    }

    if (!day || day < 1 || day > 31 || !rest) continue;

    const dateStr = `${defaultYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const tokens = rest.split(/[\s\/／・,、]+/).filter(Boolean);

    for (const token of tokens) {
      const matchedStamp = matchShiftStampByText(token, stamps);
      if (matchedStamp) {
        shifts.push({
          id: `${dateStr}_${targetPartnerId}`,
          date: dateStr,
          partnerId: targetPartnerId,
          stampId: matchedStamp.id,
          startTime: matchedStamp.startTime,
          endTime: matchedStamp.endTime,
          createdBy: targetPartnerId,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        });
      } else if (!/^\d{1,2}:\d{2}/.test(token)) {
        events.push({
          id: `nk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          date: dateStr,
          title: token,
          categoryId: defaultCategoryId,
          color: catInfo.accentColor,
          isAllDay: true,
          createdBy: targetPartnerId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }
  }

  return { shifts, events };
}
