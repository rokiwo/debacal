import React, { useEffect, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Trash2,
  Edit3,
  CheckCircle2,
  Heart,
  Mic,
  Bell,
  CheckSquare,
  Square,
  ExternalLink,
  Stamp,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CalendarDataStore,
  NotifyTarget,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import {
  DEFAULT_CATEGORIES,
  EVENT_PATTERN_CATEGORIES,
  formatMinutesShort,
  getJapaneseHoliday,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
  resolveCategoryInfo,
  SUPPORT_BADGE_PRESETS,
} from '../utils/presets';
import {
  buildGoogleCalendarUrl,
  getNotifyTargetLabel,
  REMINDER_PRESETS,
  shouldNotifyPartner,
} from '../utils/googleCalendar';

interface DayDetailModalProps {
  dateStr: string; // "YYYY-MM-DD"
  store: CalendarDataStore;
  activePartner: PartnerId;
  initialOpenEventForm?: boolean;
  onClose: () => void;
  onMoveDate: (deltaDays: number) => void;
  onSetShiftAndAdvance?: (
    dateStr: string,
    partnerId: PartnerId,
    stamp: StampPreset | null,
    advanceDate?: boolean
  ) => void;
  onUpdateShiftDetails?: (
    dateStr: string,
    partnerId: PartnerId,
    patch: Partial<ShiftEntry>
  ) => void;
  onToggleDaySupportBadge: (dateStr: string, badge: string) => void;
  onSaveEvent: (event: ScheduleEvent) => void;
  onToggleTaskComplete: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onOpenVoiceModal: () => void;
  onOpenShiftStampManager?: (partnerId?: PartnerId) => void;
  onOpenCategoryManager: () => void;
  onOpenShiftInput?: () => void;
}

function formatShortDateTime(isoStr?: string): string {
  if (!isoStr) return '';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return '';
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${m}/${d} ${hh}:${mm}`;
}

export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  dateStr,
  store,
  activePartner,
  initialOpenEventForm = false,
  onClose,
  onMoveDate,
  onToggleDaySupportBadge,
  onSaveEvent,
  onToggleTaskComplete,
  onDeleteEvent,
  onOpenVoiceModal,
  onOpenCategoryManager,
  onOpenShiftInput,
}) => {
  const [showEventForm, setShowEventForm] = useState(initialOpenEventForm);
  const [formTabMode, setFormTabMode] = useState<'event' | 'task'>('event');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [patternTabId, setPatternTabId] = useState<string>(
    EVENT_PATTERN_CATEGORIES[0].id
  );

  // 新規・編集用フォームステート
  const [eventDate, setEventDate] = useState<string>(dateStr);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<CalendarCategoryId>(
    activePartner === 'partnerB' ? 'partnerB' : 'shared'
  );
  const [isTask, setIsTask] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState<NotifyTarget>(activePartner);
  const [reminderMinutes, setReminderMinutes] = useState<number>(30);
  const [autoOpenGoogleCal, setAutoOpenGoogleCal] = useState<boolean>(false);

  const [isAllDay, setIsAllDay] = useState(false);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [memo, setMemo] = useState('');
  const [eventBadges, setEventBadges] = useState<string[]>([]);

  useEffect(() => {
    if (!editingEventId) {
      setEventDate(dateStr);
    }
  }, [dateStr, editingEventId]);

  useEffect(() => {
    if (initialOpenEventForm) {
      setShowEventForm(true);
    }
  }, [initialOpenEventForm]);

  const [y, m, d] = (dateStr || '').split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1, d || 1);
  const weekDay = ['日', '月', '火', '水', '木', '金', '土'][Number.isNaN(dt.getDay()) ? 0 : dt.getDay()];
  const holidayName = dateStr ? getJapaneseHoliday(dateStr) : null;

  const partnerA = store.metadata?.partners?.partnerA || { name: 'ゆうと', avatar: '🐻' };
  const partnerB = store.metadata?.partners?.partnerB || { name: 'さや', avatar: '🐰' };
  const currentPartnerInfo =
    activePartner === 'partnerB' ? partnerB : partnerA;

  const categories =
    store.categories && store.categories.length > 0
      ? [...store.categories].sort((a, b) => a.order - b.order)
      : DEFAULT_CATEGORIES;

  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps || []) {
    stampMap.set(s.id, s);
  }

  const rawShiftA = store.shifts?.[`${dateStr}_partnerA`];
  const rawShiftB = store.shifts?.[`${dateStr}_partnerB`];
  const shiftA = rawShiftA && !rawShiftA.deletedAt ? rawShiftA : undefined;
  const shiftB = rawShiftB && !rawShiftB.deletedAt ? rawShiftB : undefined;

  const stampA = shiftA ? stampMap.get(shiftA.stampId) : undefined;
  const stampB = shiftB ? stampMap.get(shiftB.stampId) : undefined;

  const isHolidayShift = (shift?: ShiftEntry) => {
    if (!shift || shift.isHolidayWork) return false;
    const p = stampMap.get(shift.stampId);
    return Boolean(p?.isHoliday || (p && /休|有休|公休/.test(p.label)));
  };
  const isBothHoliday = isHolidayShift(shiftA) && isHolidayShift(shiftB);

  const dayEvents = Object.values(store.events || {})
    .filter((e): e is ScheduleEvent => Boolean(e && !e.deletedAt && e.date === dateStr))
    .sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
    });

  const daySupport = store.daySupports?.[dateStr];
  const activeDayBadges = daySupport?.badges || [];

  // カテゴリ選択に応じて通知対象端末を自動連動（妻予定なら妻の端末のみ、夫予定なら夫の端末のみ）
  const handleSelectCategory = (catId: CalendarCategoryId) => {
    setCategoryId(catId);
    if (catId === 'partnerA') {
      setNotifyTarget('partnerA');
    } else if (catId === 'partnerB') {
      setNotifyTarget('partnerB');
    } else if (!isTask) {
      setNotifyTarget('both');
    }
  };

  const renderAuditAndReadStatus = (createdBy?: PartnerId, createdAt?: string, updatedAt?: string) => {
    try {
      const effectiveCreatorId = createdBy === 'partnerB' ? 'partnerB' : 'partnerA';
      const creator =
        store.metadata?.partners?.[effectiveCreatorId] ||
        (effectiveCreatorId === 'partnerB' ? partnerB : partnerA);
      const otherId: PartnerId = effectiveCreatorId === 'partnerA' ? 'partnerB' : 'partnerA';
      const other =
        store.metadata?.partners?.[otherId] ||
        (otherId === 'partnerB' ? partnerB : partnerA);

      const updatedMs = Date.parse(updatedAt || createdAt || '') || 0;
      const otherLastSeenMs = Date.parse(other.lastSeenAt || '') || 0;
      const isReadByOther = otherLastSeenMs >= updatedMs;

      const isEdited =
        updatedAt && createdAt && Math.abs(Date.parse(updatedAt) - Date.parse(createdAt)) > 5000;

      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-500 mt-1.5 pt-1.5 border-t border-black/5">
          <span>
            {creator.avatar} {creator.name}が {formatShortDateTime(updatedAt || createdAt)} に
            {isEdited ? '更新' : '追加'}
          </span>
          <span>•</span>
          {isReadByOther ? (
            <span className="inline-flex items-center gap-0.5 font-extrabold text-[#1E6645]">
              <CheckCircle2 className="w-3 h-3 text-[#52B788]" />
              {other.avatar} {formatShortDateTime(other.lastSeenAt)} 確認済
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 font-extrabold text-[#D63864] bg-[#FFE5EC] px-1.5 py-0.2 rounded-full">
              🆕 {other.avatar}{other.name}は未確認
            </span>
          )}
        </div>
      );
    } catch {
      return null;
    }
  };

  const handleOpenNewForm = (
    defaultCatId?: CalendarCategoryId,
    mode: 'event' | 'task' = 'event'
  ) => {
    setEditingEventId(null);
    setEventDate(dateStr);
    setTitle('');
    setFormTabMode(mode);
    const defaultTaskMode = mode === 'task';
    const nextCat = defaultCatId || (defaultTaskMode ? activePartner : categories[0]?.id || 'shared');
    setCategoryId(nextCat);
    setIsTask(defaultTaskMode);
    if (nextCat === 'partnerA') {
      setNotifyTarget('partnerA');
    } else if (nextCat === 'partnerB') {
      setNotifyTarget('partnerB');
    } else {
      setNotifyTarget(defaultTaskMode ? activePartner : 'both');
    }
    setReminderMinutes(30);
    setAutoOpenGoogleCal(defaultTaskMode);
    setIsAllDay(false);
    setStartTime('10:00');
    setEndTime('11:00');
    setMemo('');
    setEventBadges([]);
    setShowEventForm(true);
  };

  const handleStartEditEvent = (ev: ScheduleEvent) => {
    setEditingEventId(ev.id);
    setEventDate(ev.date || dateStr);
    setTitle(ev.title);
    setCategoryId(ev.categoryId);
    const taskFlag = Boolean(ev.isTask);
    setIsTask(taskFlag);
    setFormTabMode(taskFlag ? 'task' : 'event');
    setNotifyTarget(
      ev.notifyTarget ||
        (ev.categoryId === 'partnerA'
          ? 'partnerA'
          : ev.categoryId === 'partnerB'
          ? 'partnerB'
          : 'both')
    );
    setReminderMinutes(ev.reminderMinutes ?? 30);
    setAutoOpenGoogleCal(false);
    setIsAllDay(ev.isAllDay);
    setStartTime(ev.startTime || '10:00');
    setEndTime(ev.endTime || '11:00');
    setMemo(ev.memo || '');
    setEventBadges(ev.supportBadges || []);
    setShowEventForm(true);
  };

  const handleSubmitEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const nowIso = new Date().toISOString();
    const cat = resolveCategoryInfo(categoryId, store.categories, store.metadata);
    const existing = editingEventId ? store.events[editingEventId] : undefined;
    const finalDate = (eventDate || dateStr).trim();

    const newEvent: ScheduleEvent = {
      id: editingEventId || `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: finalDate,
      title: title.trim(),
      categoryId,
      color: cat.accentColor,
      isAllDay,
      startTime: isAllDay ? undefined : startTime,
      endTime: isAllDay ? undefined : endTime,
      memo: memo.trim() || undefined,
      supportBadges: eventBadges.length > 0 ? eventBadges : undefined,
      isTask,
      isCompleted: existing ? existing.isCompleted : false,
      notifyTarget,
      reminderMinutes,
      googleCalSynced: existing?.googleCalSynced || autoOpenGoogleCal,
      createdBy: existing ? existing.createdBy : activePartner,
      createdAt: existing ? existing.createdAt : nowIso,
      updatedAt: nowIso,
    };

    onSaveEvent(newEvent);

    // もし「保存時にGoogleカレンダー通知をセット」がONで、かつ自分の端末が通知対象の場合のみGoogleカレンダーを起動！
    if (autoOpenGoogleCal && shouldNotifyPartner(newEvent, activePartner)) {
      const gcalUrl = buildGoogleCalendarUrl(newEvent, store.metadata);
      window.open(gcalUrl, '_blank', 'noopener,noreferrer');
    }

    setShowEventForm(false);
    setEditingEventId(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[92vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* 1. モーダルヘッダー：日付切替＆ふたり休日バッジ */}
        <div className="bg-white px-4 py-3 border-b border-[#FFE5EC] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onMoveDate(-1)}
              className="p-1.5 rounded-xl bg-stone-100 hover:bg-[#FFE5EC] text-stone-600"
              title="前日へ"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="px-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-extrabold text-stone-800">
                  {m}月{d}日({weekDay})
                </h2>
                {holidayName && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-xs font-extrabold">
                    {holidayName}
                  </span>
                )}
                {isBothHoliday && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FFE5EC] text-[#D63864] text-xs font-extrabold flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 fill-[#FF8FAB] text-[#FF8FAB]" />
                    ふたり休日一致✨
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onMoveDate(1)}
              className="p-1.5 rounded-xl bg-stone-100 hover:bg-[#FFE5EC] text-stone-600"
              title="翌日へ"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. モーダル本文 */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
          {/* セクションA（最上部）：この日のすべての予定＆タスク一覧 ＋ 新規追加フォーム（TimeTree風） */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <h3 className="text-sm font-extrabold text-stone-800">
                📅 この日の予定・タスク ({dayEvents.length}件)
              </h3>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVoiceModal();
                  }}
                  className="px-2 py-1.5 rounded-2xl bg-[#B388EB] hover:bg-[#8C5EC7] text-white text-[11px] font-extrabold shadow-xs flex items-center gap-1"
                >
                  <Mic className="w-3 h-3" />
                  <span>声で追加</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewForm(activePartner, 'task')}
                  className="px-2.5 py-1.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-extrabold shadow-xs flex items-center gap-1"
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>＋タスク</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewForm(undefined, 'event')}
                  className="px-2.5 py-1.5 rounded-2xl bg-[#FF8FAB] hover:bg-[#E06C88] text-white text-[11px] font-extrabold shadow-xs flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>＋予定</span>
                </button>
              </div>
            </div>

            {/* 項目別（二人予定・夫予定・妻予定）ワンタップ入力開始ボタン */}
            {!showEventForm && (
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((cat) => {
                  const resolved = resolveCategoryInfo(cat.id, store.categories, store.metadata);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleOpenNewForm(cat.id, 'event')}
                      style={{
                        backgroundColor: resolved.bgColor,
                        color: resolved.textColor,
                        borderColor: resolved.accentColor,
                      }}
                      className="px-2.5 py-1 rounded-xl border text-xs font-extrabold flex items-center gap-1 shadow-2xs active:scale-95"
                    >
                      <span>＋ {resolved.icon}</span>
                      <span>{resolved.shortLabel}を追加</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={onOpenCategoryManager}
                  className="px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 text-[11px] font-bold"
                >
                  ＋項目の追加・削除
                </button>
              </div>
            )}

            {/* 新規・編集フォーム（予定 ／ Googleカレンダー連携タスク） */}
            {showEventForm && (
              <form
                onSubmit={handleSubmitEvent}
                className="bg-white rounded-2xl p-3.5 border-2 border-[#FF8FAB] shadow-md space-y-3 animate-pop"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#9E2A47]">
                    {editingEventId
                      ? '✏️ 予定・タスクを編集'
                      : isTask
                      ? '✅ 新しいタスク（Googleカレンダー端末別通知）を追加'
                      : '✨ 新しい予定を追加'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEventForm(false)}
                    className="text-xs text-stone-400 hover:text-stone-600 font-bold"
                  >
                    閉じる
                  </button>
                </div>

                {/* 📅予定 ⇔ ✅タスク(ToDo) 2タブ切替 */}
                <div className="grid grid-cols-2 gap-1 bg-stone-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setFormTabMode('event');
                      setIsTask(false);
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all ${
                      formTabMode === 'event'
                        ? 'bg-white text-[#9E2A47] shadow-xs'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    <span>📅 通常の予定</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTabMode('task');
                      setIsTask(true);
                      if (categoryId === 'partnerA') {
                        setNotifyTarget('partnerA');
                      } else if (categoryId === 'partnerB') {
                        setNotifyTarget('partnerB');
                      } else {
                        setNotifyTarget(activePartner);
                      }
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all ${
                      formTabMode === 'task'
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    <CheckSquare className="w-3 h-3" />
                    <span>✅ タスク(通知)</span>
                  </button>
                </div>

                {/* 充実した絵文字アイコンパレット（ご要望：「定型パターンはいらない。アイコンをもっと充実させてほしい」） */}
                <div className="bg-[#FFFBF7] rounded-2xl p-2.5 border border-[#FFE5EC] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-[#9E2A47] flex items-center gap-1">
                      <span>✨</span>
                      <span>アイコン絵文字パレット（タップでタイトルの先頭に入ります）</span>
                    </span>
                  </div>

                      {/* 絵文字カテゴリ切替タブ */}
                      <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                        {EVENT_PATTERN_CATEGORIES.map((grp) => {
                          const active = patternTabId === grp.id;
                          return (
                            <button
                              key={grp.id}
                              type="button"
                              onClick={() => setPatternTabId(grp.id)}
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold whitespace-nowrap transition-all ${
                                active
                                  ? 'bg-[#FF8FAB] text-white shadow-2xs'
                                  : 'bg-white text-stone-600 border border-stone-200/80 hover:bg-stone-50'
                              }`}
                            >
                              {grp.tabLabel}
                            </button>
                          );
                        })}
                      </div>

                      {(() => {
                        const currentGrp =
                          EVENT_PATTERN_CATEGORIES.find((g) => g.id === patternTabId) ||
                          EVENT_PATTERN_CATEGORIES[0];
                        return (
                          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-0.5">
                            {currentGrp.icons.map((ic) => (
                              <button
                                key={ic}
                                type="button"
                                onClick={() => {
                                  const cleaned = title.replace(
                                    /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+\s*/u,
                                    ''
                                  );
                                  setTitle(`${ic} ${cleaned}`);
                                }}
                                className="w-8 h-8 rounded-xl bg-white hover:bg-[#FFE5EC] border border-stone-200/80 text-base flex items-center justify-center active:scale-90 transition-transform shadow-2xs shrink-0"
                                title={`タイトルの先頭に「${ic}」を付ける`}
                              >
                                {ic}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* 📅 予定の日付（間違えても後からいつでも日程を変更可能！） */}
                    <div className="flex items-center justify-between gap-2 p-2 rounded-2xl bg-white border border-[#FFE5EC] shadow-2xs">
                      <span className="text-xs font-black text-stone-700 flex items-center gap-1.5 shrink-0">
                        <span>📅</span>
                        <span>予定の日付:</span>
                      </span>
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        <input
                          type="date"
                          value={eventDate}
                          onChange={(e) => setEventDate(e.target.value)}
                          className="px-2.5 py-1 rounded-xl border border-stone-200 bg-[#FFFBF7] text-xs font-black text-stone-800 focus:border-[#FF8FAB] focus:outline-none"
                        />
                        {eventDate !== dateStr && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#FFE5EC] text-[#D63864] text-[10px] font-black shrink-0 animate-pop">
                            日付変更
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <textarea
                        rows={2}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={
                          isTask
                            ? 'タスク・やることを入力（例：市役所へ行く、振込、牛乳を買うなど）'
                            : '予定タイトルを入力（上のアイコンをタップすると先頭に絵文字が入ります）'
                        }
                        autoFocus
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] text-sm font-bold text-stone-800 focus:border-[#FF8FAB] focus:outline-none"
                      />
                    </div>

                    {/* カテゴリ選択（二人予定・夫予定・妻予定＋追加項目） */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {categories.map((c) => {
                        const cat = resolveCategoryInfo(c.id, store.categories, store.metadata);
                        const selected = categoryId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectCategory(c.id)}
                            style={
                              selected
                                ? { backgroundColor: cat.accentColor, color: '#fff' }
                                : { backgroundColor: cat.bgColor, color: cat.textColor }
                            }
                            className="px-2.5 py-1 rounded-xl text-xs font-extrabold transition-all"
                          >
                            {cat.icon} {cat.shortLabel}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={onOpenCategoryManager}
                        className="px-2 py-1 rounded-xl bg-stone-100 text-stone-600 text-[10px] font-bold"
                      >
                        ＋項目編集
                      </button>
                    </div>

                    {/* 時間設定 */}
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 font-bold text-stone-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isAllDay}
                          onChange={(e) => setIsAllDay(e.target.checked)}
                          className="rounded text-[#FF8FAB]"
                        />
                        <span>終日</span>
                      </label>

                      {!isAllDay && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="px-2.5 py-1 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                          />
                          <span>〜</span>
                          <input
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="px-2.5 py-1 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                          />
                        </div>
                      )}
                    </div>

                    {/* 🔔 Googleカレンダー連携 ＆ 端末別通知設定（妻なら妻の端末のみ、夫なら夫の端末のみに通知） */}
                    <div className="bg-[#F6F9FF] rounded-2xl p-3 border border-sky-200/90 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-sky-900 flex items-center gap-1">
                          <Bell className="w-3.5 h-3.5 text-sky-600" />
                          <span>Googleカレンダー通知対象（端末別通知）</span>
                        </span>
                        <span className="text-[10px] font-bold text-sky-700">
                          ※選んだ人のスマホにだけ通知されます
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setNotifyTarget('partnerA')}
                          className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold border transition-all ${
                            notifyTarget === 'partnerA'
                              ? 'bg-[#126875] text-white border-[#126875] shadow-2xs'
                              : 'bg-white text-stone-600 border-stone-200'
                          }`}
                        >
                          {partnerA.avatar} {partnerA.name}の端末のみ
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotifyTarget('partnerB')}
                          className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold border transition-all ${
                            notifyTarget === 'partnerB'
                              ? 'bg-[#6638A6] text-white border-[#6638A6] shadow-2xs'
                              : 'bg-white text-stone-600 border-stone-200'
                          }`}
                        >
                          {partnerB.avatar} {partnerB.name}の端末のみ
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotifyTarget('both')}
                          className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold border transition-all ${
                            notifyTarget === 'both'
                              ? 'bg-[#D63864] text-white border-[#D63864] shadow-2xs'
                              : 'bg-white text-stone-600 border-stone-200'
                          }`}
                        >
                          💕 2人の端末とも
                        </button>
                      </div>

                      {/* 通知タイミング */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-bold text-stone-600">通知時間:</span>
                        {REMINDER_PRESETS.map((rm) => (
                          <button
                            key={rm.value}
                            type="button"
                            onClick={() => setReminderMinutes(rm.value)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${
                              reminderMinutes === rm.value
                                ? 'bg-sky-600 text-white border-sky-600'
                                : 'bg-white text-stone-600 border-stone-200'
                            }`}
                          >
                            {rm.label}
                          </button>
                        ))}
                      </div>

                      {/* 現在の操作端末（activePartner）が通知対象に含まれている場合のみ、保存時Googleカレンダー起動チェックを表示 */}
                      {notifyTarget === 'both' || notifyTarget === activePartner ? (
                        <label className="flex items-center gap-1.5 pt-1 text-[11px] font-extrabold text-sky-900 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoOpenGoogleCal}
                            onChange={(e) => setAutoOpenGoogleCal(e.target.checked)}
                            className="rounded text-sky-600"
                          />
                          <span>
                            📲 保存と同時にこの端末（{currentPartnerInfo.avatar}
                            {currentPartnerInfo.name}）のGoogleカレンダーを開いて通知セットする
                          </span>
                        </label>
                      ) : (
                        <div className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                          💡 この予定・タスクは「
                          {notifyTarget === 'partnerA'
                            ? `${partnerA.avatar}${partnerA.name}`
                            : `${partnerB.avatar}${partnerB.name}`}
                          の端末のみ通知」に設定されています。あなたの端末には通知されず、相手の画面にGoogleカレンダー通知ボタンが表示されます。
                        </div>
                      )}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        placeholder="メモ・場所・持ち物など（任意）"
                        className="w-full px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] text-xs text-stone-700"
                      />
                    </div>

                    {/* 確定・保存ボタン（ご要望：「予定の保存・編集の確定ボタンが探しにくい」を完全に解消する特大目立ちボタン） */}
                    <div className="pt-2 space-y-2">
                      <button
                        type="submit"
                        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#FF8FAB] via-[#FF758F] to-[#B388EB] hover:opacity-95 text-white text-sm font-black shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                        <span>
                          {editingEventId
                            ? '✏️ 変更を確定・保存する'
                            : isTask
                            ? '✅ タスクを追加・登録する'
                            : '✨ この予定を保存・確定する'}
                        </span>
                      </button>

                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowEventForm(false)}
                          className="text-stone-400 hover:text-stone-600 text-xs font-bold py-1 px-3 rounded-lg hover:bg-stone-100 transition-colors"
                        >
                          キャンセルして閉じる
                        </button>
                      </div>
                    </div>
              </form>
            )}

            {/* 予定＆タスク一覧表示 */}
            {dayEvents.length === 0 ? (
              <div className="bg-white rounded-2xl p-4 text-center border border-dashed border-stone-200 text-xs text-stone-400">
                この日の予定・タスクはまだありません🐾 上の「＋予定」「＋タスク」からすぐ登録できます。
              </div>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((ev) => {
                  const cat = resolveCategoryInfo(ev.categoryId, store.categories, store.metadata);
                  const isMyNotificationTarget = shouldNotifyPartner(ev, activePartner);
                  const notifyInfo = getNotifyTargetLabel(ev, store.metadata);

                  return (
                    <div
                      key={ev.id}
                      style={{
                        backgroundColor: cat.bgColor,
                        borderLeftColor: ev.color || cat.accentColor,
                      }}
                      className={`rounded-2xl p-3 border-l-4 shadow-xs transition-all ${
                        ev.isTask && ev.isCompleted ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {ev.isTask && (
                              <button
                                type="button"
                                onClick={() => onToggleTaskComplete(ev.id)}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-black flex items-center gap-1 transition-all ${
                                  ev.isCompleted
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white text-emerald-700 border border-emerald-400 shadow-2xs'
                                }`}
                              >
                                {ev.isCompleted ? (
                                  <>
                                    <CheckSquare className="w-3 h-3" />
                                    <span>完了済</span>
                                  </>
                                ) : (
                                  <>
                                    <Square className="w-3 h-3" />
                                    <span>タスク未完了（タップで完了）</span>
                                  </>
                                )}
                              </button>
                            )}

                            <span
                              style={{ backgroundColor: cat.accentColor }}
                              className="px-2 py-0.5 rounded-full text-white text-[10px] font-extrabold"
                            >
                              {cat.icon} {cat.shortLabel}
                            </span>

                            <span className="text-xs font-extrabold text-stone-700 flex items-center gap-0.5">
                              <Clock className="w-3 h-3 opacity-70" />
                              {ev.isAllDay
                                ? '終日'
                                : `${ev.startTime || ''}${ev.endTime ? `〜${ev.endTime}` : ''}`}
                            </span>

                            <span className="px-2 py-0.5 rounded-full bg-white/80 text-stone-700 text-[10px] font-extrabold flex items-center gap-0.5">
                              <Bell className="w-2.5 h-2.5 text-sky-600" />
                              <span>{notifyInfo.label}</span>
                            </span>
                          </div>

                          <p
                            style={{ color: cat.textColor }}
                            className={`text-sm font-extrabold whitespace-pre-wrap break-words leading-snug ${
                              ev.isTask && ev.isCompleted ? 'line-through' : ''
                            }`}
                          >
                            {ev.title}
                          </p>

                          {ev.memo && (
                            <p className="text-xs text-stone-600 bg-white/70 rounded-xl px-2.5 py-1 whitespace-pre-wrap">
                              📝 {ev.memo}
                            </p>
                          )}

                          {/* Googleカレンダー通知登録ボタン：現在の操作端末（妻 or 夫）が通知対象の時だけ表示！ */}
                          {isMyNotificationTarget && (
                            <div className="pt-1">
                              <a
                                href={buildGoogleCalendarUrl(ev, store.metadata)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-extrabold shadow-2xs transition-all"
                              >
                                <Bell className="w-3 h-3 text-sky-600" />
                                <span>
                                  🔔 {currentPartnerInfo.avatar}{currentPartnerInfo.name}のGoogleカレンダーに通知登録
                                </span>
                                <ExternalLink className="w-3 h-3 opacity-70" />
                              </a>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditEvent(ev)}
                            className="p-1.5 rounded-xl bg-white/80 hover:bg-white text-stone-600 shadow-2xs"
                            title="予定を編集"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEvent(ev.id)}
                            className="p-1.5 rounded-xl bg-white/80 hover:bg-rose-50 text-rose-500 shadow-2xs"
                            title="予定を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {renderAuditAndReadStatus(ev.createdBy, ev.createdAt, ev.updatedAt)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* セクションB：この日のシフト確認（確認専用 ＆ シフト入力画面への案内） */}
          <div className="bg-white rounded-2xl p-3 border border-stone-200/90 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-stone-700 flex items-center gap-1.5">
                <span>🐾</span>
                <span>{m}/{d} のシフト確認</span>
              </span>
              {onOpenShiftInput && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenShiftInput();
                  }}
                  className="px-2.5 py-1 rounded-xl bg-[#FFE5EC] hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white text-[11px] font-extrabold flex items-center gap-1 transition-colors shadow-2xs"
                >
                  <Stamp className="w-3.5 h-3.5" />
                  <span>シフト入力へ</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* ゆうと（partnerA） */}
              <div className="bg-[#FFFBF7] p-2.5 rounded-xl border border-stone-200/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-stone-700 flex items-center gap-1">
                    <span>{partnerA.avatar}</span>
                    <span>{partnerA.name}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {stampA ? (
                    <span
                      style={{ backgroundColor: stampA.color, color: stampA.textColor }}
                      className="px-2.5 py-0.5 rounded-lg font-black text-xs shadow-2xs flex items-center gap-1"
                    >
                      <span>{stampA.icon}</span>
                      <span>{shiftA?.customLabel || stampA.label}</span>
                      {(shiftA?.startTime || stampA.startTime) && (
                        <span className="text-[10px] opacity-80 font-bold">
                          {shiftA?.startTime || stampA.startTime}〜{shiftA?.endTime || stampA.endTime}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-stone-400 font-bold text-[11px]">シフト未設定</span>
                  )}
                  {Boolean(shiftA?.subCustomLabel || shiftA?.subStampId) && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-300 text-stone-900 font-black text-[10px] shadow-2xs">
                      🌙 夜バ
                    </span>
                  )}
                  {(getShiftHolidayWorkMinutes(shiftA) > 0 || getShiftOvertimeMinutes(shiftA) > 0) && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-black text-[10px] shadow-2xs">
                      {getShiftHolidayWorkMinutes(shiftA) > 0
                        ? `💼 休出${formatMinutesShort(getShiftHolidayWorkMinutes(shiftA))}`
                        : `⏱️ 残+${formatMinutesShort(getShiftOvertimeMinutes(shiftA))}`}
                    </span>
                  )}
                </div>
                {shiftA && renderAuditAndReadStatus(shiftA.createdBy, shiftA.createdAt, shiftA.updatedAt)}
              </div>

              {/* さや（partnerB） */}
              <div className="bg-[#FFFBF7] p-2.5 rounded-xl border border-stone-200/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-stone-700 flex items-center gap-1">
                    <span>{partnerB.avatar}</span>
                    <span>{partnerB.name}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {stampB ? (
                    <span
                      style={{ backgroundColor: stampB.color, color: stampB.textColor }}
                      className="px-2.5 py-0.5 rounded-lg font-black text-xs shadow-2xs flex items-center gap-1"
                    >
                      <span>{stampB.icon}</span>
                      <span>{shiftB?.customLabel || stampB.label}</span>
                      {(shiftB?.startTime || stampB.startTime) && (
                        <span className="text-[10px] opacity-80 font-bold">
                          {shiftB?.startTime || stampB.startTime}〜{shiftB?.endTime || stampB.endTime}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-stone-400 font-bold text-[11px]">シフト未設定</span>
                  )}
                  {Boolean(shiftB?.subCustomLabel || shiftB?.subStampId) && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-300 text-stone-900 font-black text-[10px] shadow-2xs">
                      🌙 夜バ
                    </span>
                  )}
                  {(getShiftHolidayWorkMinutes(shiftB) > 0 || getShiftOvertimeMinutes(shiftB) > 0) && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-black text-[10px] shadow-2xs">
                      {getShiftHolidayWorkMinutes(shiftB) > 0
                        ? `💼 休出${formatMinutesShort(getShiftHolidayWorkMinutes(shiftB))}`
                        : `⏱️ 残+${formatMinutesShort(getShiftOvertimeMinutes(shiftB))}`}
                    </span>
                  )}
                </div>
                {shiftB && renderAuditAndReadStatus(shiftB.createdBy, shiftB.createdAt, shiftB.updatedAt)}
              </div>
            </div>

            <div className="text-[10px] text-stone-400 font-bold pt-0.5">
              💡 シフト・夜勤バイト・残業の登録・変更は画面下の「シフト入力」から行えます
            </div>
          </div>

          {/* セクションC：🍳すれ違いサポートアイコン（1タップでごはん・お迎え目印） */}
          <div className="bg-white rounded-2xl p-3 border border-stone-200/90 shadow-xs">
            <div className="text-xs font-extrabold text-stone-700 mb-2">
              🍳 ごはん・お迎え目印（1タップで日付に表示）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUPPORT_BADGE_PRESETS.map((b) => {
                const isOn = activeDayBadges.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onToggleDaySupportBadge(dateStr, b.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold border transition-all ${
                      isOn
                        ? 'bg-[#FFF6D6] border-[#FFB703] text-[#8A5A00] shadow-2xs scale-[1.02]'
                        : 'bg-[#FFFBF7] border-stone-200 text-stone-600'
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
