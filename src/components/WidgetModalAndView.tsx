import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  Calendar,
  Sparkles,
  Heart,
  CalendarDays,
  Mic,
  Camera,
  Stamp,
  Settings,
  Timer,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import {
  CalendarDataStore,
  PartnerId,
  StampPreset,
} from '../types/calendar';
import {
  formatMinutesShort,
  formatMinutesToJa,
  getJapaneseHoliday,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
  resolveCategoryInfo,
} from '../utils/presets';
import { MonthlyOvertimeSummary, formatLastSeen } from './TopHeader';
import { buildGoogleCalendarUrl, shouldNotifyPartner } from '../utils/googleCalendar';

interface WidgetCompactViewProps {
  store: CalendarDataStore;
  activePartner: PartnerId;
  onToggleActivePartner: (p: PartnerId) => void;
  onMarkSeenNow: () => void;
  matchedHolidays: string[];
  overtimeSummary: MonthlyOvertimeSummary;
  onExitWidgetMode: () => void;
  onOpenCalendarWithStampDrawer: () => void;
  onOpenDayDetail: (dateStr: string) => void;
  onQuickAddEventForDate: (dateStr: string) => void;
  onToggleTaskComplete: (eventId: string) => void;
  onSelectDateInFullCalendar: (dateStr: string) => void;
  onOpenVoiceModal: (dateStr: string) => void;
  onOpenImageOcrModal: () => void;
  onOpenSettings: () => void;
}

// 今日から n 日間の日付配列を生成
function getUpcomingDates(daysCount = 7): {
  dateStr: string;
  label: string;
  subLabel: string;
  dayOfWeek: number;
  holidayName: string | null;
}[] {
  const now = new Date();
  const list = [];
  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];

  for (let i = 0; i < daysCount; i++) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const d = dt.getDate();
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const w = weekNames[dt.getDay()];
    const rel =
      i === 0
        ? '今日'
        : i === 1
        ? '明日'
        : i === 2
        ? '明後日'
        : `${i}日後`;
    list.push({
      dateStr,
      label: `${m}/${d}(${w})`,
      subLabel: rel,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }
  return list;
}

/**
 * デフォルト起動の「🏠 ふたりホーム（ウィジェット画面）」
 * スマホの縦画面でも文字が大きく100%読めるカード形式で、ここから1タップで月間カレンダーへ飛べます。
 */
export const WidgetCompactView: React.FC<WidgetCompactViewProps> = ({
  store,
  activePartner,
  onToggleActivePartner,
  onMarkSeenNow,
  matchedHolidays,
  overtimeSummary,
  onExitWidgetMode,
  onOpenCalendarWithStampDrawer,
  onOpenDayDetail,
  onQuickAddEventForDate,
  onToggleTaskComplete,
  onSelectDateInFullCalendar,
  onOpenVoiceModal,
  onOpenImageOcrModal,
  onOpenSettings,
}) => {
  const [daysCount, setDaysCount] = useState<7 | 14 | 30>(7);
  const upcoming = getUpcomingDates(daysCount);

  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps) stampMap.set(s.id, s);

  const partnerA = store.metadata.partners.partnerA;
  const partnerB = store.metadata.partners.partnerB;
  const otherPartnerId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
  const otherProfile = store.metadata.partners[otherPartnerId];

  const todayStr = upcoming[0]?.dateStr || '';

  return (
    <div className="min-h-screen bg-[#FFFBF7] pb-24">
      {/* 上部固定ヘッダー */}
      <header className="sticky top-0 z-30 bg-[#FFFBF7]/95 backdrop-blur-md border-b border-[#FFE5EC] shadow-2xs">
        <div className="max-w-xl mx-auto px-3 py-2.5 space-y-2">
          {/* 1段目：タイトル ＆ 月間カレンダーへ飛ぶ特大ボタン */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-lg">🐻💕🐰</span>
              <div>
                <h1 className="font-extrabold text-sm sm:text-base text-stone-800 leading-tight">
                  ペアカレ
                </h1>
                <p className="text-[10px] font-bold text-stone-400 leading-none">
                  {otherProfile.avatar}{otherProfile.name}の確認: {formatLastSeen(otherProfile.lastSeenAt)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* 操作中パートナー切替 */}
              <div className="flex items-center bg-white rounded-full p-0.5 border border-stone-200">
                <button
                  type="button"
                  onClick={() => onToggleActivePartner('partnerA')}
                  className={`px-2 py-1 rounded-full text-[11px] font-extrabold transition-all ${
                    activePartner === 'partnerA'
                      ? 'bg-[#E2F9FC] text-[#126875] shadow-2xs'
                      : 'text-stone-400'
                  }`}
                >
                  {partnerA.avatar}{partnerA.name}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleActivePartner('partnerB')}
                  className={`px-2 py-1 rounded-full text-[11px] font-extrabold transition-all ${
                    activePartner === 'partnerB'
                      ? 'bg-[#F3EAFF] text-[#6638A6] shadow-2xs'
                      : 'text-stone-400'
                  }`}
                >
                  {partnerB.avatar}{partnerB.name}
                </button>
              </div>

              {/* カレンダー全体へ飛ぶメインボタン */}
              <button
                type="button"
                onClick={onExitWidgetMode}
                className="px-3 py-2 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white text-xs font-extrabold flex items-center gap-1 shadow-sm active:scale-95 transition-transform"
              >
                <CalendarDays className="w-4 h-4" />
                <span>カレンダーへ</span>
              </button>
            </div>
          </div>

          {/* 2段目：今月の休日一致 ＆ 残業・バイト集計 ＆ 表示日数切替 */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onExitWidgetMode}
                className="px-2.5 py-1 rounded-full bg-[#FFE5EC] text-[#D63864] text-[11px] font-extrabold flex items-center gap-1"
              >
                <Heart className="w-3 h-3 fill-[#FF8FAB] text-[#FF8FAB]" />
                <span>今月お休み一致 {matchedHolidays.length}日</span>
              </button>

              <button
                type="button"
                onClick={onExitWidgetMode}
                className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-extrabold flex items-center gap-1"
              >
                <Timer className="w-3 h-3 text-amber-600" />
                <span>
                  残業 {partnerA.avatar}
                  {overtimeSummary.partnerA.totalExtraFormatted} / {partnerB.avatar}
                  {overtimeSummary.partnerB.totalExtraFormatted}
                </span>
              </button>

              <button
                type="button"
                onClick={onMarkSeenNow}
                className="px-2 py-1 rounded-full bg-[#E6F7EF] text-[#1E6645] text-[10px] font-extrabold flex items-center gap-0.5"
              >
                <CheckCircle2 className="w-3 h-3 text-[#52B788]" />
                <span>既読にする</span>
              </button>
            </div>

            {/* 表示日数切り替え */}
            <div className="flex items-center bg-stone-100 rounded-xl p-0.5 text-[10px] font-extrabold">
              {([7, 14, 30] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setDaysCount(cnt)}
                  className={`px-2 py-1 rounded-lg transition-all ${
                    daysCount === cnt
                      ? 'bg-white text-stone-800 shadow-2xs'
                      : 'text-stone-500'
                  }`}
                >
                  {cnt}日間
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* メイン：今日からのシフト＆予定カード一覧（スマホ縦画面で文字がくっきり読める大判レイアウト） */}
      <main className="max-w-xl mx-auto px-3 pt-3 space-y-2.5">
        {upcoming.map((day, idx) => {
          const sA = store.shifts[`${day.dateStr}_partnerA`];
          const sB = store.shifts[`${day.dateStr}_partnerB`];
          const shiftA = sA && !sA.deletedAt ? sA : undefined;
          const shiftB = sB && !sB.deletedAt ? sB : undefined;
          const stampA = shiftA ? stampMap.get(shiftA.stampId) : undefined;
          const stampB = shiftB ? stampMap.get(shiftB.stampId) : undefined;

          const subStampA = shiftA?.subStampId ? stampMap.get(shiftA.subStampId) : undefined;
          const subStampB = shiftB?.subStampId ? stampMap.get(shiftB.subStampId) : undefined;
          const subLabelA = shiftA?.subCustomLabel || subStampA?.label;
          const subLabelB = shiftB?.subCustomLabel || subStampB?.label;

          const isBothHoliday = matchedHolidays.includes(day.dateStr);

          const events = Object.values(store.events)
            .filter((e) => !e.deletedAt && e.date === day.dateStr)
            .sort((a, b) => {
              if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
              return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
            });

          const supports = [
            ...(store.daySupports?.[day.dateStr]?.badges || []),
            ...events.flatMap((e) => e.supportBadges || []),
          ];
          const uniqueSupports = Array.from(new Set(supports));

          return (
            <div
              key={day.dateStr}
              onClick={() => onOpenDayDetail(day.dateStr)}
              className={`rounded-3xl p-3.5 border-2 transition-all cursor-pointer active:scale-[0.99] ${
                idx === 0
                  ? 'bg-white border-[#FF8FAB] shadow-md'
                  : isBothHoliday
                  ? 'bg-gradient-to-r from-[#FFF0F5] via-white to-[#FFF9FB] border-[#FFC2D1] shadow-xs'
                  : 'bg-white border-stone-200/90 hover:border-[#FF8FAB] shadow-2xs'
              }`}
            >
              {/* カード上部：日付・曜日・祝日・休日一致・カレンダーで開くボタン */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded-xl text-xs font-extrabold shrink-0 ${
                      idx === 0
                        ? 'bg-[#FF8FAB] text-white'
                        : idx === 1
                        ? 'bg-[#FFE5EC] text-[#9E2A47]'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {day.subLabel}
                  </span>
                  <span
                    className={`text-base font-extrabold ${
                      day.dayOfWeek === 0 || day.holidayName
                        ? 'text-rose-500'
                        : day.dayOfWeek === 6
                        ? 'text-sky-600'
                        : 'text-stone-800'
                    }`}
                  >
                    {day.label}
                  </span>
                  {day.holidayName && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 text-[11px] font-extrabold truncate">
                      {day.holidayName}
                    </span>
                  )}
                  {isBothHoliday && (
                    <span className="px-2 py-0.5 rounded-full bg-[#FFE5EC] text-[#D63864] text-[11px] font-extrabold shrink-0">
                      💕ふたり休日
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDateInFullCalendar(day.dateStr);
                    }}
                    className="px-2 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 text-[11px] font-bold flex items-center gap-0.5"
                    title="月間カレンダーのこの場所へ移動"
                  >
                    <Calendar className="w-3 h-3" />
                    <span>カレンダー</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickAddEventForDate(day.dateStr);
                    }}
                    className="px-2 py-1 rounded-xl bg-[#FFF0F5] text-[#D63864] text-[11px] font-extrabold flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>予定追加</span>
                  </button>
                </div>
              </div>

              {/* カード中段：夫・妻の2人並列シフトボックス（バイト・残業も大きく表示） */}
              <div className="grid grid-cols-2 gap-2">
                {/* 夫シフト */}
                {(() => {
                  const otMinA = getShiftOvertimeMinutes(shiftA);
                  const holMinA = getShiftHolidayWorkMinutes(shiftA);
                  const hasExtraA = Boolean(subLabelA) || otMinA > 0 || holMinA > 0;
                  return (
                    <div
                      style={
                        stampA
                          ? { backgroundColor: stampA.color, color: stampA.textColor }
                          : undefined
                      }
                      className={`rounded-2xl px-3 py-2 border flex flex-col justify-center ${
                        stampA
                          ? 'border-black/5'
                          : hasExtraA
                          ? 'bg-rose-50/90 text-rose-900 border-rose-200'
                          : 'bg-stone-50 text-stone-400 border-dashed border-stone-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold opacity-85">
                          {partnerA.avatar} {partnerA.name}
                        </span>
                        {(shiftA?.startTime || stampA?.startTime) && (
                          <span className="text-[11px] font-bold opacity-85">
                            {shiftA?.startTime || stampA?.startTime}〜
                            {shiftA?.endTime || stampA?.endTime || ''}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-black mt-0.5 flex flex-wrap items-center gap-1">
                        {(stampA || !hasExtraA) && (
                          <span>
                            {stampA
                              ? `${stampA.icon || ''} ${shiftA?.customLabel || stampA.label}`
                              : 'シフト未登録'}
                          </span>
                        )}
                        {subLabelA && (
                          <span className="px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 text-[11px] font-extrabold">
                            ＋🏪{subLabelA}
                            {shiftA?.subStartTime ? `(${shiftA.subStartTime})` : ''}
                          </span>
                        )}
                        {(otMinA > 0 || holMinA > 0) && (
                          <span className="px-1.5 py-0.5 rounded-lg bg-rose-500 text-white text-[11px] font-extrabold">
                            {holMinA > 0
                              ? `⏱️休出${formatMinutesShort(holMinA)}`
                              : `⏱️残業+${formatMinutesShort(otMinA)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 妻シフト */}
                {(() => {
                  const otMinB = getShiftOvertimeMinutes(shiftB);
                  const holMinB = getShiftHolidayWorkMinutes(shiftB);
                  const hasExtraB = Boolean(subLabelB) || otMinB > 0 || holMinB > 0;
                  return (
                    <div
                      style={
                        stampB
                          ? { backgroundColor: stampB.color, color: stampB.textColor }
                          : undefined
                      }
                      className={`rounded-2xl px-3 py-2 border flex flex-col justify-center ${
                        stampB
                          ? 'border-black/5'
                          : hasExtraB
                          ? 'bg-rose-50/90 text-rose-900 border-rose-200'
                          : 'bg-stone-50 text-stone-400 border-dashed border-stone-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold opacity-85">
                          {partnerB.avatar} {partnerB.name}
                        </span>
                        {(shiftB?.startTime || stampB?.startTime) && (
                          <span className="text-[11px] font-bold opacity-85">
                            {shiftB?.startTime || stampB?.startTime}〜
                            {shiftB?.endTime || stampB?.endTime || ''}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-black mt-0.5 flex flex-wrap items-center gap-1">
                        {(stampB || !hasExtraB) && (
                          <span>
                            {stampB
                              ? `${stampB.icon || ''} ${shiftB?.customLabel || stampB.label}`
                              : 'シフト未登録'}
                          </span>
                        )}
                        {subLabelB && (
                          <span className="px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 text-[11px] font-extrabold">
                            ＋🏪{subLabelB}
                            {shiftB?.subStartTime ? `(${shiftB.subStartTime})` : ''}
                          </span>
                        )}
                        {(otMinB > 0 || holMinB > 0) && (
                          <span className="px-1.5 py-0.5 rounded-lg bg-rose-500 text-white text-[11px] font-extrabold">
                            {holMinB > 0
                              ? `⏱️休出${formatMinutesShort(holMinB)}`
                              : `⏱️残業+${formatMinutesShort(otMinB)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* カード下段：予定＆タスクリスト（二人予定・夫予定・妻予定）＆すれ違いサポート */}
              {(events.length > 0 || uniqueSupports.length > 0) && (
                <div className="mt-2.5 pt-2 border-t border-stone-200/60 space-y-1.5">
                  {uniqueSupports.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {uniqueSupports.map((b) => (
                        <span
                          key={b}
                          className="px-2 py-0.5 rounded-lg bg-[#FFF6D6] border border-[#FFE28A] text-[#8A5A00] text-xs font-extrabold"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  )}

                  {events.map((ev) => {
                    const cat = resolveCategoryInfo(ev.categoryId, store.categories, store.metadata);
                    const isMyNotif = shouldNotifyPartner(ev, activePartner);
                    return (
                      <div
                        key={ev.id}
                        style={{
                          backgroundColor: cat.bgColor,
                          color: cat.textColor,
                          borderLeftColor: ev.color || cat.accentColor,
                        }}
                        className={`px-3 py-1.5 rounded-xl border-l-4 flex items-center justify-between gap-2 text-xs sm:text-sm font-extrabold ${
                          ev.isTask && ev.isCompleted ? 'opacity-65 line-through' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {ev.isTask && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleTaskComplete(ev.id);
                              }}
                              className="text-sm shrink-0"
                              title="タスク完了切替"
                            >
                              {ev.isCompleted ? '✅' : '⬜'}
                            </button>
                          )}
                          <span
                            style={{ backgroundColor: cat.accentColor }}
                            className="px-1.5 py-0.5 rounded-md text-white text-[10px] font-extrabold shrink-0"
                          >
                            {cat.icon}{cat.shortLabel}
                          </span>
                          {!ev.isAllDay && ev.startTime && (
                            <span className="text-xs font-black opacity-85 shrink-0">
                              {ev.startTime}
                            </span>
                          )}
                          <span className="truncate whitespace-nowrap overflow-hidden flex-1">
                            {ev.title}
                          </span>
                        </div>

                        {isMyNotif && (
                          <a
                            href={buildGoogleCalendarUrl(ev, store.metadata)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 px-2 py-0.5 rounded-lg bg-white/90 text-sky-700 border border-sky-200 text-[10px] font-extrabold"
                            title="自分のGoogleカレンダーで通知登録"
                          >
                            🔔通知
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </main>

      {/* 右下フローティング「＋」ボタン（ウィジェット画面からも1タップで予定・タスク追加） */}
      <button
        type="button"
        onClick={() => onQuickAddEventForDate(todayStr)}
        title="予定・タスクを追加"
        className="fixed right-4 bottom-20 z-40 flex items-center gap-1.5 px-4 py-3.5 rounded-full bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] text-white font-black shadow-xl hover:scale-105 active:scale-95 transition-all border-2 border-white"
      >
        <span className="text-xl leading-none">＋</span>
        <span className="text-xs">予定・タスク追加</span>
      </button>

      {/* 下部固定スマホドック（ウィジェット画面からカレンダー・スタンプ・音声・カメラへ即アクセス） */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#FFE5EC] shadow-lg">
        <div className="max-w-xl mx-auto px-2 py-2 grid grid-cols-5 gap-1.5">
          <button
            type="button"
            onClick={onExitWidgetMode}
            className="py-2 px-1 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white font-extrabold text-[11px] flex flex-col items-center justify-center gap-0.5 shadow-xs active:scale-95"
          >
            <CalendarDays className="w-4 h-4" />
            <span>月間カレンダー</span>
          </button>

          <button
            type="button"
            onClick={onOpenCalendarWithStampDrawer}
            className="py-2 px-1 rounded-2xl bg-[#FFF0F5] text-[#9E2A47] border border-[#FFC2D1] font-extrabold text-[11px] flex flex-col items-center justify-center gap-0.5 active:scale-95"
          >
            <Stamp className="w-4 h-4 text-[#FF8FAB]" />
            <span>シフト連続入力</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenVoiceModal(todayStr)}
            className="py-2 px-1 rounded-2xl bg-[#F3EAFF] text-[#59318F] border border-[#DEC9FC] font-extrabold text-[11px] flex flex-col items-center justify-center gap-0.5 active:scale-95"
          >
            <Mic className="w-4 h-4 text-[#B388EB]" />
            <span>声で予定追加</span>
          </button>

          <button
            type="button"
            onClick={onOpenImageOcrModal}
            className="py-2 px-1 rounded-2xl bg-[#E2F9FC] text-[#136370] border border-[#A9E9F2] font-extrabold text-[11px] flex flex-col items-center justify-center gap-0.5 active:scale-95"
          >
            <Camera className="w-4 h-4 text-[#56CFE1]" />
            <span>シフト画像読取</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="py-2 px-1 rounded-2xl bg-stone-100 text-stone-700 border border-stone-200 font-extrabold text-[11px] flex flex-col items-center justify-center gap-0.5 active:scale-95"
          >
            <Settings className="w-4 h-4 text-stone-600" />
            <span>設定・同期</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface WidgetGuideModalProps {
  store: CalendarDataStore;
  onClose: () => void;
  onOpenWidgetPreview: () => void;
}

export const WidgetGuideModal: React.FC<WidgetGuideModalProps> = ({
  store,
  onClose,
  onOpenWidgetPreview,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedScriptable, setCopiedScriptable] = useState(false);

  const widgetUrl = `${window.location.origin}${window.location.pathname}?widget=1`;

  // iPhone Scriptableアプリ用のネイティブウィジェットコードを自動生成
  const generateScriptableCode = () => {
    const upcoming = getUpcomingDates(3);
    const stampMap = new Map<string, StampPreset>();
    for (const s of store.stamps) stampMap.set(s.id, s);

    const pA = store.metadata.partners.partnerA;
    const pB = store.metadata.partners.partnerB;

    const summaryRows = upcoming.map((d) => {
      const sA = store.shifts[`${d.dateStr}_partnerA`];
      const sB = store.shifts[`${d.dateStr}_partnerB`];
      const stA = sA && !sA.deletedAt ? stampMap.get(sA.stampId) : undefined;
      const stB = sB && !sB.deletedAt ? stampMap.get(sB.stampId) : undefined;
      const evs = Object.values(store.events)
        .filter((e) => !e.deletedAt && e.date === d.dateStr)
        .map((e) => e.title)
        .join(' / ');
      return {
        day: `${d.subLabel} ${d.label}`,
        shiftA: `${pA.avatar}${stA ? stA.label : '-'}`,
        shiftB: `${pB.avatar}${stB ? stB.label : '-'}`,
        events: evs || '予定なし',
      };
    });

    return `// ペアカレ (PairCal) iPhone ホーム画面ウィジェット用スクリプト (Scriptable用)
const APP_URL = "${window.location.origin}${window.location.pathname}";
const DAYS = ${JSON.stringify(summaryRows, null, 2)};

let w = new ListWidget();
w.backgroundColor = new Color("#FFFBF7");
w.url = APP_URL;
w.setPadding(12, 14, 12, 14);

let header = w.addStack();
let title = header.addText("🐻💕🐰 ペアカレ");
title.font = Font.boldRoundedSystemFont(13);
title.textColor = new Color("#9E2A47");
w.addSpacer(6);

for (const item of DAYS) {
  let row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  
  let dTxt = row.addText(item.day + "  ");
  dTxt.font = Font.boldRoundedSystemFont(11);
  dTxt.textColor = new Color("#44403C");
  
  let sTxt = row.addText(item.shiftA + " | " + item.shiftB);
  sTxt.font = Font.boldRoundedSystemFont(11);
  sTxt.textColor = new Color("#D63864");
  w.addSpacer(2);

  if (item.events !== "予定なし") {
    let eTxt = w.addText("  📅 " + item.events);
    eTxt.font = Font.mediumRoundedSystemFont(10);
    eTxt.textColor = new Color("#6638A6");
    eTxt.lineLimit = 1;
  }
  w.addSpacer(4);
}

Script.setWidget(w);
Script.complete();
w.presentMedium();`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        <div className="bg-white px-4 py-3.5 border-b border-[#FFE5EC] flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-stone-800 flex items-center gap-1.5">
              <Smartphone className="w-5 h-5 text-[#FF8FAB]" />
              <span>iPhone / Android ウィジェット設定</span>
            </h2>
            <p className="text-[11px] text-stone-400">
              スマホのホーム画面に2人のシフト＆予定を常時表示する方法
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* 1. ウィジェット専用コンパクト画面のプレビュー＆URL */}
          <div className="bg-white rounded-2xl p-4 border-2 border-[#FFE5EC] space-y-2.5 shadow-2xs">
            <div className="font-extrabold text-sm text-[#9E2A47] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#FF8FAB]" />
              <span>① ウィジェット専用コンパクト画面（Android / iPhone 共通）</span>
            </div>
            <p className="text-stone-600 leading-relaxed">
              「今日・明日・明後日の2人のシフトと予定」だけをカード表示する専用URL（`?widget=1`）を搭載しています。
              Androidの「Web Widget」アプリ等にこのURLを設定すると、ホーム画面にそのまま常時表示できます！
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={onOpenWidgetPreview}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>ウィジェット画面を今すぐ表示</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(widgetUrl);
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                }}
                className="py-2.5 px-3 rounded-xl bg-[#FFFBF7] hover:bg-[#FFE5EC] border border-[#FFC2D1] text-[#9E2A47] font-extrabold text-xs flex items-center gap-1"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'URLコピー済!' : '専用URLをコピー'}</span>
              </button>
            </div>
          </div>

          {/* 2. iPhone (iOS) ホーム画面ウィジェット (Scriptable連携) */}
          <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-2.5 shadow-2xs">
            <div className="font-extrabold text-sm text-[#59318F] flex items-center gap-1.5">
              <span>🍎</span>
              <span>② iPhone ホーム画面ウィジェット（Scriptable用コード自動生成）</span>
            </div>
            <p className="text-stone-600 leading-relaxed">
              iPhoneの無料定番アプリ「Scriptable」に以下の自動生成コードを貼り付けるだけで、iPhoneのホーム画面に本物のネイティブウィジェットとして2人のシフト＆予定を表示できます（タップするとペアカレが開きます）。
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(generateScriptableCode());
                setCopiedScriptable(true);
                setTimeout(() => setCopiedScriptable(false), 2500);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-[#F3EAFF] hover:bg-[#B388EB] text-[#59318F] hover:text-white font-extrabold text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              {copiedScriptable ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>
                {copiedScriptable
                  ? '✅ iPhone Scriptable用コードをコピーしました！'
                  : '📋 iPhone用ウィジェットコードをワンタップでコピー'}
              </span>
            </button>
          </div>

          {/* 3. スマホのホーム画面にアプリアイコン追加 ＆ 標準カレンダーウィジェット連携 */}
          <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-2 shadow-2xs">
            <div className="font-extrabold text-sm text-[#136370] flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#56CFE1]" />
              <span>③ ホーム画面アプリ化（PWA）＆ 標準カレンダーウィジェット連携</span>
            </div>
            <ul className="space-y-1.5 text-stone-600 list-disc pl-4 leading-relaxed">
              <li>
                <strong>iPhone (Safari)</strong>：画面下の「共有ボタン（四角から上矢印）」➔ <strong>「ホーム画面に追加」</strong> で可愛いアプリアイコンとして1タップ起動できます。
              </li>
              <li>
                <strong>Android (Chrome)</strong>：右上のメニュー「⋮」➔ <strong>「ホーム画面に追加（アプリをインストール）」</strong> でホーム画面に配置できます。
              </li>
              <li>
                <strong>iPhone / Android 標準カレンダーウィジェットに表示したい場合</strong>：「設定・同期」➔「.icsエクスポート」を押すと、スマホ標準カレンダーのウィジェットに2人のシフトを表示できます。
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
