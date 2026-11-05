import {
  CalendarDataStore,
  CoupleMetadata,
  NotifyTarget,
  PartnerId,
  ScheduleEvent,
} from '../types/calendar';
import {
  formatMinutesShort,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
} from './presets';

export const REMINDER_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: '開始時刻（定刻）' },
  { value: 10, label: '10分前' },
  { value: 30, label: '30分前' },
  { value: 60, label: '1時間前' },
  { value: 180, label: '3時間前' },
  { value: 1440, label: '前日（24時間前）' },
];

/**
 * 予定・タスクが指定パートナー（夫 または 妻）の端末に通知すべき対象かどうかを厳密判定
 * - 妻の予定/タスクなら妻の端末（partnerB）のみ true
 * - 夫の予定/タスクなら夫の端末（partnerA）のみ true
 */
export function shouldNotifyPartner(
  ev: ScheduleEvent,
  devicePartnerId: PartnerId
): boolean {
  if (ev.deletedAt || ev.isCompleted) return false;

  const target: NotifyTarget =
    ev.notifyTarget ||
    (ev.categoryId === 'partnerA'
      ? 'partnerA'
      : ev.categoryId === 'partnerB'
      ? 'partnerB'
      : ev.isTask
      ? ev.createdBy
      : 'both');

  if (target === 'both') return true;
  return target === devicePartnerId;
}

/**
 * 予定・タスクの通知対象ラベルを返す
 */
export function getNotifyTargetLabel(
  ev: ScheduleEvent,
  metadata: CoupleMetadata
): { target: NotifyTarget; label: string; badgeColor: string } {
  const pA = metadata.partners.partnerA;
  const pB = metadata.partners.partnerB;

  const target: NotifyTarget =
    ev.notifyTarget ||
    (ev.categoryId === 'partnerA'
      ? 'partnerA'
      : ev.categoryId === 'partnerB'
      ? 'partnerB'
      : ev.isTask
      ? ev.createdBy
      : 'both');

  if (target === 'partnerA') {
    return {
      target: 'partnerA',
      label: `🔔 ${pA.avatar}${pA.name}の端末のみ通知`,
      badgeColor: 'bg-[#E2F9FC] text-[#126875] border-[#A9E9F2]',
    };
  }
  if (target === 'partnerB') {
    return {
      target: 'partnerB',
      label: `🔔 ${pB.avatar}${pB.name}の端末のみ通知`,
      badgeColor: 'bg-[#F3EAFF] text-[#6638A6] border-[#DEC9FC]',
    };
  }
  return {
    target: 'both',
    label: '🔔 2人の端末に通知',
    badgeColor: 'bg-[#FFE5EC] text-[#9E2A47] border-[#FFC2D1]',
  };
}

/**
 * Googleカレンダーの予定・タスク追加URLを生成
 * ※操作中の本人のスマホで開くことで、本人のGoogleカレンダーのみに登録され、本人の端末だけにGoogleカレンダーから通知が届きます。
 */
export function buildGoogleCalendarUrl(
  ev: ScheduleEvent,
  metadata: CoupleMetadata
): string {
  const [y, m, d] = ev.date.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');

  let datesParam = '';
  if (ev.isAllDay || !ev.startTime) {
    // 終日または時間未指定タスクの場合は当日09:00〜09:30（通知が確実に鳴るよう時間枠を設定）
    if (ev.isTask) {
      const startStr = `${y}${pad(m)}${pad(d)}T090000`;
      const endStr = `${y}${pad(m)}${pad(d)}T093000`;
      datesParam = `${startStr}/${endStr}`;
    } else {
      const nextDt = new Date(y, m - 1, d + 1);
      const startStr = `${y}${pad(m)}${pad(d)}`;
      const endStr = `${nextDt.getFullYear()}${pad(nextDt.getMonth() + 1)}${pad(
        nextDt.getDate()
      )}`;
      datesParam = `${startStr}/${endStr}`;
    }
  } else {
    const [sh, sm] = ev.startTime.split(':').map(Number);
    const startStr = `${y}${pad(m)}${pad(d)}T${pad(sh)}${pad(sm || 0)}00`;

    let eh = sh + 1;
    let em = sm || 0;
    if (ev.endTime) {
      const parts = ev.endTime.split(':').map(Number);
      eh = parts[0];
      em = parts[1] || 0;
    }
    if (eh >= 24) eh = 23;
    const endStr = `${y}${pad(m)}${pad(d)}T${pad(eh)}${pad(em)}00`;
    datesParam = `${startStr}/${endStr}`;
  }

  const prefix = ev.isTask ? '✅【タスク】' : '';
  const text = `${prefix}${ev.title}`;

  const notifyInfo = getNotifyTargetLabel(ev, metadata);
  const remMin = ev.reminderMinutes ?? 30;
  const remLabel =
    REMINDER_PRESETS.find((r) => r.value === remMin)?.label || `${remMin}分前`;

  const detailsLines = [
    ev.memo ? `メモ: ${ev.memo}` : '',
    `通知対象: ${notifyInfo.label}`,
    `推奨通知タイミング: ${remLabel}`,
    '--- ペアカレ (PairCal) より登録 ---',
  ].filter(Boolean);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text,
    dates: datesParam,
    details: detailsLines.join('\n'),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * 指定したパートナー（夫のみ または 妻のみ）の対象タスク・予定・シフトを抽出し、
 * カレンダーの通知アラーム（VALARM）付き .ics ファイルを生成する
 * ※予定・シフトが0件の状態で押された場合も「開けないエラー」にならないよう、確認用のサンプル通知予定を1件含めます。
 */
export function generatePartnerNotificationIcs(
  store: CalendarDataStore,
  targetPartner: PartnerId
): string {
  const partner = store.metadata.partners[targetPartner];
  const stampMap = new Map(store.stamps.map((s) => [s.id, s]));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FutariCal//GoogleCalendarPartnerSync//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:ペアカレ (${partner.avatar}${partner.name}専用通知)`,
    'X-WR-TIMEZONE:Asia/Tokyo',
  ];

  const pad = (n: number) => String(n).padStart(2, '0');
  const nowStamp =
    new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let itemCount = 0;

  // 1. 対象パートナーのシフト（残業・休出・バイト含む）を出力
  const partnerShifts = Object.values(store.shifts).filter(
    (s) => !s.deletedAt && s.partnerId === targetPartner
  );

  for (const s of partnerShifts) {
    const stamp = stampMap.get(s.stampId);
    const label = s.customLabel || stamp?.label || (s.isHolidayWork ? '休日出勤' : 'シフト');
    const icon = stamp?.icon || '📅';
    const [y, m, d] = s.date.split('-').map(Number);
    const dateCompact = `${y}${pad(m)}${pad(d)}`;

    const extraParts: string[] = [];
    const otMin = getShiftOvertimeMinutes(s);
    const holMin = getShiftHolidayWorkMinutes(s);
    if (otMin > 0) extraParts.push(`残業+${formatMinutesShort(otMin)}`);
    if (holMin > 0) extraParts.push(`休出${formatMinutesShort(holMin)}`);
    if (s.subCustomLabel) extraParts.push(`+${s.subCustomLabel}`);
    const extraSuffix = extraParts.length > 0 ? ` (${extraParts.join('/')})` : '';

    const summary = `${partner.avatar}${icon}${label}${extraSuffix}`.replace(/\r?\n/g, ' ');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:futarical-shift-${s.id}@futarical.local`);
    lines.push(`DTSTAMP:${nowStamp}`);

    const startT = s.startTime || stamp?.startTime;
    const endT = s.endTime || stamp?.endTime;
    if (startT && endT && startT < endT) {
      const [sh, sm] = startT.split(':').map(Number);
      const [eh, em] = endT.split(':').map(Number);
      lines.push(`DTSTART:${dateCompact}T${pad(sh)}${pad(sm || 0)}00`);
      lines.push(`DTEND:${dateCompact}T${pad(eh)}${pad(em || 0)}00`);
    } else {
      const nextDt = new Date(y, m - 1, d + 1);
      const nextCompact = `${nextDt.getFullYear()}${pad(nextDt.getMonth() + 1)}${pad(
        nextDt.getDate()
      )}`;
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
      lines.push(`DTEND;VALUE=DATE:${nextCompact}`);
    }

    lines.push(`SUMMARY:${summary}`);
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${summary}`);
    lines.push('TRIGGER:-PT60M');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
    itemCount++;
  }

  // 2. 対象パートナーに通知すべき予定＆タスクを出力
  const events = Object.values(store.events).filter((ev) =>
    shouldNotifyPartner(ev, targetPartner)
  );

  for (const ev of events) {
    const [y, m, d] = ev.date.split('-').map(Number);
    const dateCompact = `${y}${pad(m)}${pad(d)}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:futarical-ev-${ev.id}-${targetPartner}@futarical.local`);
    lines.push(`DTSTAMP:${nowStamp}`);

    if (ev.isAllDay && !ev.isTask) {
      const nextDt = new Date(y, m - 1, d + 1);
      const nextCompact = `${nextDt.getFullYear()}${pad(
        nextDt.getMonth() + 1
      )}${pad(nextDt.getDate())}`;
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
      lines.push(`DTEND;VALUE=DATE:${nextCompact}`);
    } else {
      const startT = ev.startTime || '09:00';
      const endT = ev.endTime || '09:30';
      const [sh, sm] = startT.split(':').map(Number);
      const [eh, em] = endT.split(':').map(Number);
      lines.push(`DTSTART:${dateCompact}T${pad(sh)}${pad(sm || 0)}00`);
      lines.push(`DTEND:${dateCompact}T${pad(eh)}${pad(em || 0)}00`);
    }

    const summary = `${ev.isTask ? '✅【タスク】' : ''}${ev.title}`.replace(
      /\r?\n/g,
      ' '
    );
    lines.push(`SUMMARY:${summary}`);
    if (ev.memo) {
      lines.push(`DESCRIPTION:${ev.memo.replace(/\r?\n/g, '\\n')}`);
    }

    const remMin = ev.reminderMinutes ?? 30;
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${summary}`);
    if (remMin <= 0) {
      lines.push('TRIGGER:PT0M');
    } else {
      lines.push(`TRIGGER:-PT${remMin}M`);
    }
    lines.push('END:VALARM');

    lines.push('END:VEVENT');
    itemCount++;
  }

  // 3. まだ予定もシフトも0件の状態で押された場合、空の.icsでスマホがエラーにならないよう案内イベントを1件入れる
  if (itemCount === 0) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const dateCompact = `${y}${pad(m)}${pad(d)}`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:futarical-welcome-${targetPartner}@futarical.local`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${dateCompact}T090000`);
    lines.push(`DTEND:${dateCompact}T093000`);
    lines.push(`SUMMARY:🔔 ペアカレ通知連携テスト（${partner.avatar}${partner.name}専用）`);
    lines.push('DESCRIPTION:ペアカレで予定やシフトを登録してから再度読み込むと、まとめてカレンダーに取り込まれます。');
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:ペアカレ通知テスト');
    lines.push('TRIGGER:-PT10M');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * スマホ（iPhone / Android）およびPCで .ics カレンダーを確実に開く・共有・保存するヘルパー
 */
export async function openOrShareIcsOnDevice(
  icsText: string,
  filename: string
): Promise<'shared' | 'opened' | 'downloaded'> {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  // iPhone / iPad Safari の場合は data:text/calendar スキームでOS標準の「カレンダーに追加」画面が直接開く
  if (isIOS) {
    const dataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText)}`;
    const a = document.createElement('a');
    a.href = dataUri;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return 'opened';
  }

  // Android 等で Web Share API (ファイル共有) が使える場合は「Googleカレンダー」等を直接選べるシートを出す
  try {
    const file = new File([icsText], filename, { type: 'text/calendar;charset=utf-8' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'ペアカレ カレンダー連携',
        files: [file],
      });
      return 'shared';
    }
  } catch {
    // キャンセルまたは非対応時は通常ダウンロードへフォールバック
  }

  // PC / 標準ブラウザ向けダウンロード
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return 'downloaded';
}

