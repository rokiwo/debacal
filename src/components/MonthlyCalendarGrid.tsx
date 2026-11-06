import React, { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  CalendarDataStore,
  FilterCategoryId,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import {
  formatMinutesShort,
  getJapaneseHoliday,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
  resolveCategoryInfo,
} from '../utils/presets';

interface MonthlyCalendarGridProps {
  year: number;
  month: number; // 1-12
  store: CalendarDataStore;
  activePartner: PartnerId;
  filterCategory: FilterCategoryId;
  isExpandedView: boolean;
  showShiftTimeInCell: boolean;
  selectedDate: string; // "YYYY-MM-DD"
  stampModeActive: boolean;
  onCellSingleTap: (dateStr: string) => void;
  onCellDoubleTap: (dateStr: string) => void;
  onQuickAddForSelectedDate: () => void;
  onSwipePrevMonth?: () => void;
  onSwipeNextMonth?: () => void;
}

interface DayCellData {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayOfWeek: number; // 0: Sun ... 6: Sat
  holidayName: string | null;
}

function buildMonthGrid(year: number, month: number): DayCellData[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;

  const cells: DayCellData[] = [];

  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const dt = new Date(year, month - 2, d);
    const yStr = dt.getFullYear();
    const mStr = String(dt.getMonth() + 1).padStart(2, '0');
    const dStr = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = new Date(year, month - 1, d);
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }

  const remaining = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const dt = new Date(year, month, d);
    const yStr = dt.getFullYear();
    const mStr = String(dt.getMonth() + 1).padStart(2, '0');
    const dStr = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }

  return cells;
}

export const MonthlyCalendarGrid: React.FC<MonthlyCalendarGridProps> = ({
  year,
  month,
  store,
  activePartner,
  filterCategory,
  isExpandedView,
  showShiftTimeInCell,
  selectedDate,
  stampModeActive,
  onCellSingleTap,
  onCellDoubleTap,
  onQuickAddForSelectedDate,
  onSwipePrevMonth,
  onSwipeNextMonth,
}) => {
  const [poppedShiftId, setPoppedShiftId] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const lastTapRef = useRef<{ dateStr: string; time: number } | null>(null);
  const lastDoubleTapTimeRef = useRef<number>(0);

  // ダブルタップ実行（400ms以内の二重発火をガード）
  const triggerDoubleTap = (dateStr: string) => {
    if (!dateStr) return;
    const now = Date.now();
    if (now - lastDoubleTapTimeRef.current < 450) return;
    lastDoubleTapTimeRef.current = now;
    lastTapRef.current = null;
    onCellDoubleTap(dateStr);
  };

  // シングルタップ＝その日に移動、ダブルタップ＝その日のすべての予定一覧（DayDetailModal）を表示
  const handleDateCellTap = (dateStr: string) => {
    if (!dateStr) return;
    if (stampModeActive) {
      onCellSingleTap(dateStr);
      return;
    }

    const nowMs = Date.now();
    if (
      lastTapRef.current &&
      lastTapRef.current.dateStr === dateStr &&
      nowMs - lastTapRef.current.time < 400
    ) {
      triggerDoubleTap(dateStr);
      return;
    }

    lastTapRef.current = { dateStr, time: nowMs };
    onCellSingleTap(dateStr);
  };

  const cells = buildMonthGrid(year, month);

  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps || []) {
    stampMap.set(s.id, s);
  }

  const partnerA = store.metadata?.partners?.partnerA || { name: 'ゆうと', avatar: '🐻' };
  const partnerB = store.metadata?.partners?.partnerB || { name: 'さや', avatar: '🐰' };
  const otherPartnerId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
  const otherPartner =
    store.metadata?.partners?.[otherPartnerId] || (otherPartnerId === 'partnerB' ? partnerB : partnerA);
  const otherLastSeenMs = Date.parse(otherPartner?.lastSeenAt || '') || 0;

  const eventsByDate = new Map<string, ScheduleEvent[]>();
  for (const ev of Object.values(store.events || {})) {
    if (!ev || ev.deletedAt) continue;
    if (filterCategory !== 'all' && ev.categoryId !== filterCategory) continue;

    const list = eventsByDate.get(ev.date) || [];
    list.push(ev);
    eventsByDate.set(ev.date, list);
  }

  for (const [, list] of eventsByDate) {
    list.sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
    });
  }

  // 休日一致判定（休日出勤やバイトが入っていない純粋な休日のみ一致とみなす場合はサブシフトも考慮可能だが、まず休日スタンプで判定）
  const isHolidayShift = (shift?: ShiftEntry): boolean => {
    if (!shift || shift.deletedAt || shift.isHolidayWork) return false;
    const preset = stampMap.get(shift.stampId);
    if (!preset) return false;
    if (preset.isHoliday) return true;
    return /休|有休|公休|夏休|冬休/.test(preset.label);
  };

  const isUnreadByPartner = (updatedAt: string, createdBy: PartnerId): boolean => {
    if (createdBy !== activePartner) return false;
    const updatedMs = Date.parse(updatedAt) || 0;
    return updatedMs > otherLastSeenMs;
  };

  const myLastSeenMs = Date.parse(store.metadata.partners[activePartner].lastSeenAt || '') || 0;
  const isNewFromPartner = (updatedAt: string, createdBy: PartnerId): boolean => {
    if (createdBy === activePartner) return false;
    const updatedMs = Date.parse(updatedAt) || 0;
    return updatedMs > myLastSeenMs;
  };

  const weekDays = [
    { label: '日', color: 'text-rose-500 bg-rose-50/70' },
    { label: '月', color: 'text-stone-600 bg-white/80' },
    { label: '火', color: 'text-stone-600 bg-white/80' },
    { label: '水', color: 'text-stone-600 bg-white/80' },
    { label: '木', color: 'text-stone-600 bg-white/80' },
    { label: '金', color: 'text-stone-600 bg-white/80' },
    { label: '土', color: 'text-sky-600 bg-sky-50/70' },
  ];

  // スマホ用のカレンダー表示スタイル切替（'grid' = 7列マス目 / 'list' = 縦1列くっきりリスト）
  const [mobileLayout, setMobileLayout] = useState<'grid' | 'list'>('grid');

  // 詳細プレビューバーの表示（'bottom' = カレンダー下部に表示 / 'hidden' = 非表示）
  const [previewPosition, setPreviewPosition] = useState<'bottom' | 'hidden'>(() => {
    try {
      const saved =
        localStorage.getItem('paircal_preview_position') ||
        localStorage.getItem('futarical_preview_position');
      if (saved === 'bottom' || saved === 'hidden') return saved;
    } catch {
      // ignore
    }
    return 'bottom'; // カレンダーを上部に最大化するためデフォルトは下部に配置
  });

  const handleSetPreviewPosition = (pos: 'bottom' | 'hidden') => {
    setPreviewPosition(pos);
    try {
      localStorage.setItem('paircal_preview_position', pos);
    } catch {
      // ignore
    }
  };

  // 各パートナーのシフト枠（三段表示：1段目メインシフト ＋ 2段目「夜バ」 ＋ 3段目残業時間バッジ）を描画
  const renderPartnerShiftBox = (
    shift: ShiftEntry | undefined,
    partnerAvatar: string,
    unreadColorClass: string,
    boxPartnerId?: PartnerId
  ) => {
    const stamp = shift ? stampMap.get(shift.stampId) : undefined;
    const subStamp = shift?.subStampId ? stampMap.get(shift.subStampId) : undefined;
    const hasSubWork = Boolean(shift?.subCustomLabel || subStamp);
    const otMin = getShiftOvertimeMinutes(shift);
    const hwMin = getShiftHolidayWorkMinutes(shift);
    // 操作しているパートナー（activePartner）のみ残業時間を表示（さや操作中はゆうとの残業を非表示）
    const isTargetPartner = boxPartnerId ? boxPartnerId === activePartner : shift?.partnerId === activePartner;
    const showOvertime = isTargetPartner && (otMin > 0 || hwMin > 0);
    const hasExtra = hasSubWork || showOvertime;

    const timeInfo =
      shift?.startTime || stamp?.startTime
        ? `${shift?.startTime || stamp?.startTime}${shift?.endTime || stamp?.endTime ? `-${shift?.endTime || stamp?.endTime}` : ''}`
        : '';

    // スマホの小さなマス目（幅約24px）でも確実に2文字が綺麗に見えるよう抽出
    const rawLabel = shift?.customLabel || stamp?.shortLabel || stamp?.label || '';
    const twoCharLabel = rawLabel.slice(0, 2);

    return (
      <div
        title={timeInfo ? `${stamp?.label || 'シフト'}: ${timeInfo}` : undefined}
        style={
          stamp
            ? { backgroundColor: stamp.color, color: stamp.textColor }
            : undefined
        }
        className={`relative w-full min-w-0 max-w-full rounded sm:rounded-lg px-[1px] sm:px-0.5 py-[1px] sm:py-0.5 font-black flex flex-col items-center justify-start leading-none sm:leading-tight border pointer-events-none overflow-hidden ${
          stamp
            ? 'border-black/5'
            : hasExtra
            ? 'bg-rose-50/90 text-rose-800 border-rose-200'
            : 'bg-stone-50/90 text-stone-300 border-dashed border-stone-200/80'
        }`}
      >
        {/* 1段目：メインシフト行（スマホでも2文字が一切欠けずにくっきり表示） */}
        <div className="flex items-center justify-center w-full min-w-0 py-[0.5px]">
          {stamp ? (
            <span className="text-[8px] min-[380px]:text-[9px] sm:text-[10px] font-black tracking-[-0.06em] sm:tracking-normal truncate text-center leading-none select-none">
              {twoCharLabel}
            </span>
          ) : (
            <span className="text-[8px] font-normal opacity-75">{partnerAvatar}</span>
          )}
        </div>

        {/* 2段目：夜勤バイト（ご要望：「夜バ」と表示・三段配置） */}
        {hasSubWork && (
          <div className="w-full min-w-0 mt-[1px] px-0.5 rounded-xs bg-amber-300 text-stone-900 text-[7px] min-[380px]:text-[8px] sm:text-[9px] font-black text-center truncate leading-tight shadow-2xs">
            夜バ
          </div>
        )}

        {/* 3段目：残業時間・休日出勤時間のバッジ表示（仮予定ならオレンジ仮バッジ） */}
        {showOvertime && (() => {
          const isTentative = Boolean(
            (otMin > 0 && shift?.isTentativeOvertime) ||
            (hwMin > 0 && shift?.isTentativeHolidayWork)
          );
          return (
            <div
              className={`w-full min-w-0 mt-[1px] px-0.5 rounded-xs text-[7px] min-[380px]:text-[8px] sm:text-[8.5px] font-black text-center truncate leading-tight shadow-2xs ${
                isTentative
                  ? 'bg-amber-500 text-white border border-dashed border-amber-300'
                  : 'bg-rose-500 text-white'
              }`}
            >
              {isTentative ? (hwMin > 0 ? `仮休${formatMinutesShort(hwMin)}` : `仮残${formatMinutesShort(otMin)}`) : (hwMin > 0 ? `休${formatMinutesShort(hwMin)}` : `残${formatMinutesShort(otMin)}`)}
            </div>
          );
        })()}

        {/* シフト時間常時表示ONの時 */}
        {showShiftTimeInCell &&
          stamp &&
          (shift?.startTime || stamp.startTime) && (
            <span className="text-[7px] sm:text-[8px] font-bold opacity-90 tracking-tighter truncate max-w-full">
              {shift?.startTime || stamp.startTime}
            </span>
          )}

        {/* 未読ドット */}
        {shift &&
          (isUnreadByPartner(shift.updatedAt, shift.createdBy) ||
            isNewFromPartner(shift.updatedAt, shift.createdBy)) && (
            <span
              className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${unreadColorClass} ring-1 ring-white`}
            />
          )}

        {/* タップ時の時間ポップオーバー */}
        {poppedShiftId === shift?.id && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap bg-stone-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-md">
            {shift?.startTime || stamp?.startTime || ''}
            {(shift?.endTime || stamp?.endTime) ? `-${shift?.endTime || stamp?.endTime}` : ''}
            {shift?.subStartTime ? ` / 🌙夜勤バイト:${shift.subStartTime}-${shift.subEndTime || ''}` : ''}
          </div>
        )}
      </div>
    );
  };

  // 現在選択されている日付のデータ（スマホ7列カレンダー下部の大文字プレビューバー用）
  const selectedCell = cells.find((c) => c.dateStr === selectedDate);
  const selShiftA = store.shifts[`${selectedDate}_partnerA`];
  const selShiftB = store.shifts[`${selectedDate}_partnerB`];
  const activeSelShiftA = selShiftA && !selShiftA.deletedAt ? selShiftA : undefined;
  const activeSelShiftB = selShiftB && !selShiftB.deletedAt ? selShiftB : undefined;
  const selStampA = activeSelShiftA ? stampMap.get(activeSelShiftA.stampId) : undefined;
  const selStampB = activeSelShiftB ? stampMap.get(activeSelShiftB.stampId) : undefined;
  const selEvents = eventsByDate.get(selectedDate) || [];

  // 選択日の大文字プレビューカード（カレンダーの下部に配置・親指で押しやすい設計）
  const renderSelectedDatePreviewCard = () => {
    if (!selectedCell || previewPosition === 'hidden') return null;

    return (
      <div
        onClick={() => onCellDoubleTap(selectedDate)}
        className="mt-2 mx-0.5 sm:mx-0 p-2.5 sm:p-3 rounded-2xl bg-white border border-[#FF8FAB]/60 shadow-sm cursor-pointer hover:bg-[#FFF9FB] transition-all animate-pop"
      >
        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
          <div className="font-extrabold text-xs sm:text-sm text-stone-800 flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-lg bg-[#FFE5EC] text-[#9E2A47] text-[10px] sm:text-xs font-black">
              選択中
            </span>
            <span>
              {month}月{selectedCell.dayNumber}日(
              {['日', '月', '火', '水', '木', '金', '土'][selectedCell.dayOfWeek]})
            </span>
            {selectedCell.holidayName && (
              <span className="text-xs text-rose-500 font-bold">{selectedCell.holidayName}</span>
            )}
            <span className="text-[11px] text-stone-500 font-bold ml-1">
              (予定 {selEvents.length}件)
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAddForSelectedDate();
              }}
              className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-[#FF8FAB] to-[#FF758F] text-white text-xs font-extrabold shadow-2xs hover:opacity-90 active:scale-95"
            >
              ＋ 予定追加
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSetPreviewPosition('hidden');
              }}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              title="プレビューを非表示にする"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 mb-1.5 items-start">
          <div
            style={
              selStampA
                ? { backgroundColor: selStampA.color, color: selStampA.textColor }
                : undefined
            }
            className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex flex-col items-start gap-1 w-full min-w-0 ${
              selStampA
                ? ''
                : getShiftOvertimeMinutes(activeSelShiftA) > 0 ||
                  getShiftHolidayWorkMinutes(activeSelShiftA) > 0 ||
                  activeSelShiftA?.subCustomLabel
                ? 'bg-rose-50 text-rose-900 border border-rose-200'
                : 'bg-stone-100 text-stone-400'
            }`}
          >
            {/* 1段目：メインシフト */}
            <div className="flex items-center gap-1 flex-wrap">
              <span>{partnerA.avatar}{partnerA.name}:</span>
              <span>
                {selStampA
                  ? `${selStampA.icon || ''}${activeSelShiftA?.customLabel || selStampA.label}`
                  : 'シフト未定'}
              </span>
            </div>

            {/* 2段目：夜勤バイト（勤務の下に配置） */}
            {activeSelShiftA?.subCustomLabel && (
              <span className="px-1.5 py-0.5 rounded bg-amber-300 text-stone-900 text-[10px] font-black shadow-2xs">
                夜バ
              </span>
            )}

            {/* 3段目：残業・休日出勤（勤務の下に配置） */}
            {(() => {
              const otA = getShiftOvertimeMinutes(activeSelShiftA);
              const hwA = getShiftHolidayWorkMinutes(activeSelShiftA);
              if (otA === 0 && hwA === 0) return null;
              return (
                <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-black shadow-2xs">
                  {hwA > 0 ? `休出${formatMinutesShort(hwA)}` : `残業+${formatMinutesShort(otA)}`}
                </span>
              );
            })()}
          </div>

          <div
            style={
              selStampB
                ? { backgroundColor: selStampB.color, color: selStampB.textColor }
                : undefined
            }
            className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex flex-col items-start gap-1 w-full min-w-0 ${
              selStampB
                ? ''
                : getShiftOvertimeMinutes(activeSelShiftB) > 0 ||
                  getShiftHolidayWorkMinutes(activeSelShiftB) > 0 ||
                  activeSelShiftB?.subCustomLabel
                ? 'bg-rose-50 text-rose-900 border border-rose-200'
                : 'bg-stone-100 text-stone-400'
            }`}
          >
            {/* 1段目：メインシフト */}
            <div className="flex items-center gap-1 flex-wrap">
              <span>{partnerB.avatar}{partnerB.name}:</span>
              <span>
                {selStampB
                  ? `${selStampB.icon || ''}${activeSelShiftB?.customLabel || selStampB.label}`
                  : 'シフト未定'}
              </span>
            </div>

            {/* 2段目：夜勤バイト（勤務の下に配置） */}
            {activeSelShiftB?.subCustomLabel && (
              <span className="px-1.5 py-0.5 rounded bg-amber-300 text-stone-900 text-[10px] font-black shadow-2xs">
                夜バ
              </span>
            )}

            {/* 3段目：残業・休日出勤（勤務の下に配置） */}
            {(() => {
              const otB = getShiftOvertimeMinutes(activeSelShiftB);
              const hwB = getShiftHolidayWorkMinutes(activeSelShiftB);
              if (otB === 0 && hwB === 0) return null;
              return (
                <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-black shadow-2xs">
                  {hwB > 0 ? `休出${formatMinutesShort(hwB)}` : `残業+${formatMinutesShort(otB)}`}
                </span>
              );
            })()}
          </div>
        </div>

        {selEvents.length > 0 ? (
          <div className="space-y-1">
            {selEvents.map((ev) => {
              const cat = resolveCategoryInfo(ev.categoryId, store.categories, store.metadata);
              return (
                <div
                  key={ev.id}
                  style={{ backgroundColor: cat.bgColor, color: cat.textColor }}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-between gap-1.5 ${
                    ev.isTask && ev.isCompleted ? 'opacity-65 line-through' : ''
                  } ${isNewFromPartner(ev.updatedAt, ev.createdBy) ? 'ring-2 ring-rose-400 shadow-xs' : ''}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="shrink-0">
                      {ev.isTask ? (ev.isCompleted ? '✅' : '⬜') : `${cat.icon}${cat.shortLabel}`}
                    </span>
                    {isNewFromPartner(ev.updatedAt, ev.createdBy) && (
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black shrink-0 animate-pulse">
                        🆕 新着
                      </span>
                    )}
                    {!ev.isAllDay && ev.startTime && <span className="shrink-0 text-stone-700">{ev.startTime}</span>}
                    <span className="truncate whitespace-nowrap overflow-hidden flex-1">{ev.title}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 text-[10px] font-bold opacity-85">
                    <span>
                      {(ev.createdBy === 'partnerB' ? partnerB : partnerA).avatar}
                      {(ev.createdBy === 'partnerB' ? partnerB : partnerA).name}が登録
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-stone-400 font-bold">
            この日の予定はまだありません（ダブルタップで詳細、右下の「＋」で予定追加）
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null || touchStartY.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx > 0) {
            onSwipePrevMonth?.();
          } else {
            onSwipeNextMonth?.();
          }
        }
        touchStartX.current = null;
        touchStartY.current = null;
      }}
      className={`max-w-5xl mx-auto px-0.5 sm:px-4 pt-1 transition-all ${
        stampModeActive ? 'pb-72' : 'pb-28'
      }`}
    >
      {/* カレンダー上部スリムバー（左：凡例 右：7列マス目 ⇔ 縦1列リスト切替） */}
      <div className="flex items-center justify-between px-1 py-1 mb-1 text-[10px] font-extrabold text-stone-500">
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded-md bg-[#E2F9FC] text-[#126875]">
            左: {partnerA.avatar}{partnerA.name}
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-[#F3EAFF] text-[#6638A6]">
            右: {partnerB.avatar}{partnerB.name}
          </span>
        </div>

        <div className="flex items-center bg-stone-100 p-0.5 rounded-lg text-[10px] font-extrabold">
          <button
            type="button"
            onClick={() => setMobileLayout('grid')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              mobileLayout === 'grid'
                ? 'bg-white text-[#9E2A47] shadow-2xs'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            📅 マス目
          </button>
          <button
            type="button"
            onClick={() => setMobileLayout('list')}
            className={`px-2 py-0.5 rounded-md transition-all sm:hidden ${
              mobileLayout === 'list'
                ? 'bg-white text-[#9E2A47] shadow-2xs'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            📋 リスト
          </button>
        </div>
      </div>

      {/* 📋 スマホ縦1列リストモード（スマホの縦長画面で1日1行・大文字で全部読めるモード） */}
      {mobileLayout === 'list' && (
        <div className="space-y-1.5 px-1 sm:hidden">
          {cells
            .filter((c) => c.isCurrentMonth)
            .map((cell) => {
              const sA = store.shifts[`${cell.dateStr}_partnerA`];
              const sB = store.shifts[`${cell.dateStr}_partnerB`];
              const actA = sA && !sA.deletedAt ? sA : undefined;
              const actB = sB && !sB.deletedAt ? sB : undefined;
              const stA = actA ? stampMap.get(actA.stampId) : undefined;
              const stB = actB ? stampMap.get(actB.stampId) : undefined;
              const isBothHol = isHolidayShift(actA) && isHolidayShift(actB);
              const dayEvents = eventsByDate.get(cell.dateStr) || [];
              const visibleEvs = isExpandedView ? dayEvents : dayEvents.slice(0, 3);
              const hiddenCnt = isExpandedView ? 0 : Math.max(0, dayEvents.length - 3);
              const supports = [
                ...(store.daySupports?.[cell.dateStr]?.badges || []),
                ...dayEvents.flatMap((e) => e.supportBadges || []),
              ];
              const uniqSupports = Array.from(new Set(supports));
              const isSelected = selectedDate === cell.dateStr;
              const wLabel = ['日', '月', '火', '水', '木', '金', '土'][cell.dayOfWeek];

              return (
                <div
                  key={cell.dateStr}
                  onClick={() => handleDateCellTap(cell.dateStr)}
                  onDoubleClick={() => triggerDoubleTap(cell.dateStr)}
                  className={`rounded-2xl p-2.5 border transition-all cursor-pointer select-none ${
                    isBothHol
                      ? 'bg-gradient-to-r from-[#FFF0F5] via-white to-[#FFF9FB] border-[#FFB3C6]'
                      : 'bg-white border-stone-200/90'
                  } ${
                    isSelected
                      ? 'ring-2 ring-[#FF8FAB] border-[#FF8FAB] shadow-sm'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* 左：日付・曜日 */}
                    <div className="flex items-center gap-1.5 min-w-[78px]">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black ${
                          cell.isToday
                            ? 'bg-[#FF8FAB] text-white'
                            : cell.dayOfWeek === 0 || cell.holidayName
                            ? 'bg-rose-50 text-rose-500'
                            : cell.dayOfWeek === 6
                            ? 'bg-sky-50 text-sky-600'
                            : 'bg-stone-100 text-stone-800'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                      <div>
                        <div
                          className={`text-xs font-extrabold leading-tight ${
                            cell.dayOfWeek === 0 || cell.holidayName
                              ? 'text-rose-500'
                              : cell.dayOfWeek === 6
                              ? 'text-sky-600'
                              : 'text-stone-700'
                          }`}
                        >
                          {wLabel}曜
                        </div>
                        {cell.holidayName && (
                          <div className="text-[9px] font-bold text-rose-500 leading-none">
                            {cell.holidayName}
                          </div>
                        )}
                      </div>
                      {isBothHol && <span className="text-xs">💕</span>}
                    </div>

                    {/* 右：2人のシフト並列（大文字表示） */}
                    <div className="grid grid-cols-2 gap-1.5 flex-1 items-start">
                      <div
                        style={
                          stA ? { backgroundColor: stA.color, color: stA.textColor } : undefined
                        }
                        className={`px-2 py-1.5 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 ${
                          stA ? '' : 'bg-stone-50 text-stone-300 border border-dashed border-stone-200'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span>{partnerA.avatar}</span>
                          <span>{stA ? `${stA.icon || ''}${actA?.customLabel || stA.label}` : '-'}</span>
                        </div>
                        {(actA?.subCustomLabel || actA?.subStampId) && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-300 text-stone-900 text-[10px] font-black shadow-2xs">
                            夜バ
                          </span>
                        )}
                        {(() => {
                          const otA = getShiftOvertimeMinutes(actA);
                          const hwA = getShiftHolidayWorkMinutes(actA);
                          if (otA === 0 && hwA === 0) return null;
                          return (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white text-[10px] font-black shadow-2xs">
                              {hwA > 0 ? `休出${formatMinutesShort(hwA)}` : `+残${formatMinutesShort(otA)}`}
                            </span>
                          );
                        })()}
                      </div>

                      <div
                        style={
                          stB ? { backgroundColor: stB.color, color: stB.textColor } : undefined
                        }
                        className={`px-2 py-1.5 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 ${
                          stB ? '' : 'bg-stone-50 text-stone-300 border border-dashed border-stone-200'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span>{partnerB.avatar}</span>
                          <span>{stB ? `${stB.icon || ''}${actB?.customLabel || stB.label}` : '-'}</span>
                        </div>
                        {(actB?.subCustomLabel || actB?.subStampId) && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-300 text-stone-900 text-[10px] font-black shadow-2xs">
                            夜バ
                          </span>
                        )}
                        {(() => {
                          const otB = getShiftOvertimeMinutes(actB);
                          const hwB = getShiftHolidayWorkMinutes(actB);
                          if (otB === 0 && hwB === 0) return null;
                          return (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white text-[10px] font-black shadow-2xs">
                              {hwB > 0 ? `休出${formatMinutesShort(hwB)}` : `+残${formatMinutesShort(otB)}`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* 予定＆サポートバッジ（2行以上になりそうな場合は1行で省略） */}
                  {(visibleEvs.length > 0 || uniqSupports.length > 0) && (
                    <div className="mt-1.5 pt-1.5 border-t border-stone-100 space-y-1">
                      {uniqSupports.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {uniqSupports.map((b) => (
                            <span
                              key={b}
                              className="px-1.5 py-0.5 rounded bg-[#FFF6D6] text-[#8A5A00] text-[10px] font-extrabold"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      )}
                      {visibleEvs.map((ev) => {
                        const cat = resolveCategoryInfo(
                          ev.categoryId,
                          store.categories,
                          store.metadata
                        );
                        const isFromOther = ev.createdBy === otherPartnerId;
                        const unreadForMe = isNewFromPartner(ev.updatedAt, ev.createdBy);
                        return (
                          <div
                            key={ev.id}
                            style={{
                              backgroundColor: cat.bgColor,
                              color: cat.textColor,
                              borderLeftColor: ev.color || cat.accentColor,
                            }}
                            className={`px-2.5 py-1 rounded-lg border-l-4 text-xs font-extrabold flex items-center gap-1.5 overflow-hidden ${
                              ev.isTask && ev.isCompleted ? 'opacity-65 line-through' : ''
                            }`}
                          >
                            <span className="text-[10px] opacity-85 shrink-0">
                              {ev.isTask ? (ev.isCompleted ? '✅' : '⬜') : `${cat.icon}${cat.shortLabel}`}
                            </span>
                            {isFromOther && (
                              <span className="text-xs shrink-0" title={`${otherPartner.name}が登録`}>
                                {otherPartner.avatar}
                              </span>
                            )}
                            {unreadForMe && (
                              <span className="px-1 py-0.2 rounded bg-rose-500 text-white text-[9px] font-black shrink-0 animate-pulse">
                                🆕
                              </span>
                            )}
                            {!ev.isAllDay && ev.startTime && (
                              <span className="text-[11px] font-black shrink-0">
                                {ev.startTime}
                              </span>
                            )}
                            <span className="truncate whitespace-nowrap overflow-hidden flex-1">
                              {ev.title}
                            </span>
                          </div>
                        );
                      })}
                      {hiddenCnt > 0 && (
                        <div className="text-[11px] font-extrabold text-[#9E2A47]">
                          ＋他{hiddenCnt}件の予定（ダブルタップで全件表示）
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* 📅 7列月間カレンダーグリッド（PCでは常時表示、スマホでは 'grid' 選択時に表示） */}
      <div className={mobileLayout === 'list' ? 'hidden sm:block' : 'block'}>
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 gap-[1.5px] sm:gap-1.5 mb-1">
          {weekDays.map((w) => (
            <div
              key={w.label}
              className={`text-center py-1 rounded-lg sm:rounded-xl text-[11px] font-extrabold border border-stone-200/50 ${w.color}`}
            >
              {w.label}
            </div>
          ))}
        </div>

        {/* 月間カレンダーグリッド */}
        <div className="grid grid-cols-7 gap-[1.5px] sm:gap-1.5">
          {cells.map((cell) => {
            const shiftA = store.shifts[`${cell.dateStr}_partnerA`];
            const shiftB = store.shifts[`${cell.dateStr}_partnerB`];
            const activeShiftA = shiftA && !shiftA.deletedAt ? shiftA : undefined;
            const activeShiftB = shiftB && !shiftB.deletedAt ? shiftB : undefined;

            const isBothHoliday = isHolidayShift(activeShiftA) && isHolidayShift(activeShiftB);
            const dayEvents = eventsByDate.get(cell.dateStr) || [];

            // コンパクトモード時は最大3件までに制限し、4件以上ある場合は「＋他〇件」を表示！
            const visibleEvents = isExpandedView ? dayEvents : dayEvents.slice(0, 3);
            const hiddenEventsCount = isExpandedView
              ? 0
              : Math.max(0, dayEvents.length - 3);

            const daySupport = store.daySupports?.[cell.dateStr];
            const supportBadges = [
              ...(daySupport?.badges || []),
              ...dayEvents.flatMap((e) => e.supportBadges || []),
            ];
            const uniqueSupports = Array.from(new Set(supportBadges));

            const isSelected = selectedDate === cell.dateStr;

            let dateTextColor = 'text-stone-700';
            if (cell.dayOfWeek === 0 || cell.holidayName) {
              dateTextColor = 'text-rose-500';
            } else if (cell.dayOfWeek === 6) {
              dateTextColor = 'text-sky-600';
            }

            return (
              <div
                key={cell.dateStr}
                onClick={() => handleDateCellTap(cell.dateStr)}
                onDoubleClick={() => triggerDoubleTap(cell.dateStr)}
                className={`group relative flex flex-col rounded-lg sm:rounded-2xl border transition-all cursor-pointer select-none overflow-hidden ${
                  isExpandedView ? 'min-h-[105px] sm:min-h-[136px]' : 'min-h-[82px] sm:min-h-[118px]'
                } ${
                  !cell.isCurrentMonth ? 'opacity-40 bg-stone-50/70' : 'bg-white'
                } ${
                  isBothHoliday && cell.isCurrentMonth
                    ? 'bg-gradient-to-b from-[#FFF0F5] via-white to-[#FFF9FB] border-[#FFB3C6] shadow-xs'
                    : 'border-stone-200/80 active:scale-[0.98]'
                } ${
                  isSelected
                    ? stampModeActive
                      ? 'ring-2 sm:ring-3 ring-[#FF8FAB] border-[#FF8FAB] shadow-md z-10'
                      : 'ring-2 ring-[#FF8FAB] border-[#FF8FAB] bg-[#FFFDFD] shadow-sm z-10'
                    : ''
                } p-[2px] sm:p-1.5`}
              >
                {/* 1. 日付ヘッダー行 */}
                <div className="flex items-center justify-between gap-0.5 mb-0.5 px-0.5">
                  <div className="flex items-center gap-0.5 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center text-[11px] sm:text-sm font-black leading-none ${
                        cell.isToday
                          ? 'w-4.5 h-4.5 sm:w-6 sm:h-6 rounded-full bg-[#FF8FAB] text-white shadow-2xs'
                          : isSelected
                          ? 'w-4.5 h-4.5 sm:w-6 sm:h-6 rounded-full bg-[#FFE5EC] text-[#9E2A47]'
                          : dateTextColor
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {cell.holidayName && (
                      <span
                        className="text-[8px] sm:text-[10px] font-bold text-rose-500 truncate max-w-[28px] sm:max-w-[70px]"
                        title={cell.holidayName}
                      >
                        {cell.holidayName}
                      </span>
                    )}
                  </div>

                  {isBothHoliday && (
                    <span
                      className="inline-flex items-center text-[9px] sm:text-[10px] leading-none"
                      title="✨2人ともお休みの日！"
                    >
                      💕
                    </span>
                  )}
                </div>

                {/* 2. シフト2人並列バー（夫・妻横並び＋バイト＋残業表示） */}
                <div className="grid grid-cols-2 gap-[1px] sm:gap-0.5 mb-0.5 shrink-0">
                  {renderPartnerShiftBox(activeShiftA, partnerA.avatar, 'bg-[#FF8FAB]')}
                  {renderPartnerShiftBox(activeShiftB, partnerB.avatar, 'bg-[#B388EB]')}
                </div>

                {/* 3. すれ違いサポートアイコン */}
                {uniqueSupports.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mb-0.5 shrink-0">
                    {uniqueSupports.slice(0, isExpandedView ? undefined : 1).map((badge) => (
                      <span
                        key={badge}
                        className="px-0.5 py-0.1 rounded-xs bg-[#FFF6D6] border border-[#FFE28A] text-[#8A5A00] text-[8.5px] sm:text-[9px] font-extrabold leading-tight truncate max-w-full"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                )}

                {/* 4. 予定リストエリア（2行以上になりそうな場合は記載せず1行でピシッと省略！） */}
                <div className="flex-1 flex flex-col gap-[2px] min-w-0">
                  {visibleEvents.map((ev) => {
                    const cat = resolveCategoryInfo(ev.categoryId, store.categories, store.metadata);
                    const unreadForOther = isUnreadByPartner(ev.updatedAt, ev.createdBy);
                    const unreadForMe = isNewFromPartner(ev.updatedAt, ev.createdBy);

                    return (
                      <div
                        key={ev.id}
                        style={{
                          backgroundColor: cat.bgColor,
                          color: cat.textColor,
                          borderLeftColor: ev.color || cat.accentColor,
                        }}
                        className={`relative rounded-xs sm:rounded px-[2.5px] sm:pl-1 sm:pr-0.5 py-[1.5px] sm:py-0.5 border-l-2 sm:border-l-3 text-[10px] sm:text-[11px] font-extrabold leading-[1.2] tracking-tighter sm:tracking-normal overflow-hidden ${
                          ev.isTask && ev.isCompleted ? 'opacity-65 line-through' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-0.5 min-w-0">
                          <div className="min-w-0 flex-1 truncate whitespace-nowrap overflow-hidden flex items-center">
                            {ev.isTask && (
                              <span className="mr-0.5 text-[9px] shrink-0">
                                {ev.isCompleted ? '✅' : '⬜'}
                              </span>
                            )}
                            {/* 相手が打った予定には相手のアバターアイコンを表示 */}
                            {ev.createdBy === otherPartnerId && (
                              <span className="mr-0.5 text-[8.5px] sm:text-[9.5px] shrink-0" title={`${otherPartner.name}が登録`}>
                                {otherPartner.avatar}
                              </span>
                            )}
                            {/* 自分が未確認の新着予定には 🆕 バッジを表示 */}
                            {unreadForMe && (
                              <span className="mr-0.5 px-0.5 py-0.1 rounded-xs bg-rose-500 text-white text-[7.5px] sm:text-[8px] font-black shrink-0 animate-pulse">
                                🆕
                              </span>
                            )}
                            {!ev.isAllDay && ev.startTime && (
                              <span className="hidden sm:inline text-[8px] font-extrabold opacity-80 mr-0.5 shrink-0">
                                {ev.startTime}
                              </span>
                            )}
                            <span className="truncate">{ev.title}</span>
                          </div>

                          {(unreadForOther || unreadForMe) && (
                            <span
                              className={`shrink-0 w-1.5 h-1.5 rounded-full ring-1 ring-white ${
                                unreadForMe ? 'bg-rose-500 animate-ping' : 'bg-[#FF8FAB]'
                              }`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* コンパクトモードで4件以上予定がある場合の「＋他〇件」表示 */}
                  {hiddenEventsCount > 0 && (
                    <div className="text-[9px] sm:text-[10px] font-extrabold text-[#9E2A47] bg-[#FFF0F5] rounded-xs px-0.5 py-0.2 text-center leading-tight truncate">
                      ＋他{hiddenEventsCount}件
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 下部配置の場合の選択日プレビューカード */}
        {previewPosition === 'bottom' && renderSelectedDatePreviewCard()}
      </div>
    </div>
  );
};
