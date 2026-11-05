import React, { useState, useMemo } from 'react';
import {
  X,
  CheckSquare,
  Square,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Bell,
  ListTodo,
  Share2,
  Sparkles,
  Clock,
  User,
  Filter,
} from 'lucide-react';
import {
  CalendarCategoryItem,
  CoupleMetadata,
  NotifyTarget,
  PartnerId,
  ScheduleEvent,
} from '../types/calendar';
import {
  buildGoogleCalendarUrl,
  REMINDER_PRESETS,
} from '../utils/googleCalendar';
import { getJapaneseHoliday } from '../utils/presets';

interface TaskManagerModalProps {
  events: Record<string, ScheduleEvent>;
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  categories?: CalendarCategoryItem[];
  onClose: () => void;
  onSaveEvent: (ev: ScheduleEvent) => void;
  onDeleteEvent: (id: string) => void;
  onToggleTaskComplete: (id: string) => void;
}

type TabType = 'calendar' | 'list' | 'google';

export const TaskManagerModal: React.FC<TaskManagerModalProps> = ({
  events,
  activePartner,
  metadata,
  categories,
  onClose,
  onSaveEvent,
  onDeleteEvent,
  onToggleTaskComplete,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [partnerFilter, setPartnerFilter] = useState<'all' | 'partnerA' | 'partnerB' | 'shared'>('all');
  const [showCompleted, setShowCompleted] = useState(true);

  // カレンダー表示用の年月
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  // 新規タスクフォーム
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  );
  const [newTime, setNewTime] = useState('');
  const [newTarget, setNewTarget] = useState<NotifyTarget>('both');
  const [newReminder, setNewReminder] = useState<number>(30);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;

  // タスクのみ抽出（isTask === true かつ deletedAt なし）
  const allTasks = useMemo(() => {
    return Object.values(events).filter((ev) => ev.isTask && !ev.deletedAt);
  }, [events]);

  // フィルター適用後のタスク
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (!showCompleted && t.isCompleted) return false;
      if (partnerFilter === 'all') return true;
      if (partnerFilter === 'partnerA') return t.categoryId === 'partnerA' || t.notifyTarget === 'partnerA';
      if (partnerFilter === 'partnerB') return t.categoryId === 'partnerB' || t.notifyTarget === 'partnerB';
      if (partnerFilter === 'shared') return t.categoryId === 'shared' || t.notifyTarget === 'both';
      return true;
    });
  }, [allTasks, showCompleted, partnerFilter]);

  // カレンダーグリッドの日付生成
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth - 1, 1);
    const lastDay = new Date(calYear, calMonth, 0);
    const startDayOfWeek = firstDay.getDay(); // 0: 日曜
    const totalDays = lastDay.getDate();

    const cells: {
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      holidayName: string | null;
      tasks: ScheduleEvent[];
    }[] = [];

    // 前月の日
    const prevMonthLastDay = new Date(calYear, calMonth - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const m = calMonth === 1 ? 12 : calMonth - 1;
      const y = calMonth === 1 ? calYear - 1 : calYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isToday: false,
        holidayName: getJapaneseHoliday(dateStr),
        tasks: [],
      });
    }

    // 当月の日
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayTasks = filteredTasks.filter((t) => t.date === dateStr);
      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        holidayName: getJapaneseHoliday(dateStr),
        tasks: dayTasks,
      });
    }

    // 翌月の日（行末埋め）
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const m = calMonth === 12 ? 1 : calMonth + 1;
        const y = calMonth === 12 ? calYear + 1 : calYear;
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({
          dateStr,
          dayNum: d,
          isCurrentMonth: false,
          isToday: false,
          holidayName: getJapaneseHoliday(dateStr),
          tasks: [],
        });
      }
    }

    return cells;
  }, [calYear, calMonth, filteredTasks, now]);

  // 新規タスク保存
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const nowIso = new Date().toISOString();
    const taskEv: ScheduleEvent = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: newDate,
      title: newTitle.trim(),
      categoryId: newTarget === 'partnerA' ? 'partnerA' : newTarget === 'partnerB' ? 'partnerB' : 'shared',
      color: newTarget === 'partnerA' ? '#56CFE1' : newTarget === 'partnerB' ? '#B388EB' : '#FF8FAB',
      isAllDay: !newTime,
      startTime: newTime || undefined,
      isTask: true,
      isCompleted: false,
      notifyTarget: newTarget,
      reminderMinutes: newReminder,
      createdBy: activePartner,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    onSaveEvent(taskEv);
    setNewTitle('');
    setNewTime('');
    setIsAdding(false);
  };

  // タスク共有用テキストコピー
  const handleShareTask = (task: ScheduleEvent) => {
    const pLabel =
      task.notifyTarget === 'partnerA'
        ? `${partnerA.avatar}${partnerA.name}のタスク`
        : task.notifyTarget === 'partnerB'
        ? `${partnerB.avatar}${partnerB.name}のタスク`
        : 'ふたりのタスク';
    const text = `【${pLabel}】\n📋 ${task.title}\n📅 期限: ${task.date}${task.startTime ? ` ${task.startTime}` : ''}\n※ペアカレより`;
    navigator.clipboard.writeText(text);
    setCopiedId(task.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Google Tasks用フォーマットコピー
  const handleCopyForGoogleTasks = (task: ScheduleEvent) => {
    const text = `${task.title} (期限: ${task.date}${task.startTime ? ` ${task.startTime}` : ''})`;
    navigator.clipboard.writeText(text);
    setCopiedId(`gt_${task.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 年月送り
  const handlePrevMonth = () => {
    if (calMonth === 1) {
      setCalYear((y) => y - 1);
      setCalMonth(12);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 12) {
      setCalYear((y) => y + 1);
      setCalMonth(1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-4 py-3 border-b border-[#FFE5EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] flex items-center justify-center text-white shadow-xs">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-stone-800 flex items-center gap-1.5">
                <span>ふたりタスク管理</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-extrabold">
                  {allTasks.filter((t) => !t.isCompleted).length}件 未完了
                </span>
              </h2>
              <p className="text-[11px] text-stone-400">
                タスク専用カレンダー ＆ Googleタスク連携 ＆ 端末別通知
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ切り替えバー */}
        <div className="bg-[#FFF0F5]/80 px-4 py-2 border-b border-[#FFE5EC] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-stone-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                activeTab === 'calendar'
                  ? 'bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>タスクカレンダー</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                activeTab === 'list'
                  ? 'bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <ListTodo className="w-3.5 h-3.5" />
              <span>タスク一覧</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('google')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                activeTab === 'google'
                  ? 'bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Google連携・通知</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="px-3 py-1.5 rounded-xl bg-[#FF8FAB] text-white text-xs font-black flex items-center gap-1 shadow-xs hover:bg-[#FF758F] active:scale-95 transition-all shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新規タスク</span>
          </button>
        </div>

        {/* 新規タスク追加フォーム（トグル展開） */}
        {isAdding && (
          <form
            onSubmit={handleCreateTask}
            className="bg-white p-3.5 border-b border-[#FFE5EC] space-y-2.5 animate-pop"
          >
            <div className="font-extrabold text-xs text-rose-700 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                <span>新しいタスクを追加</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-stone-400 hover:text-stone-600 text-[11px]"
              >
                キャンセル
              </button>
            </div>

            <div>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="タスク名（例: 牛乳を買う / 書類提出 / 郵便出す）"
                className="w-full px-3 py-2 rounded-xl border-2 border-stone-200 bg-[#FFFBF7] font-black text-xs text-stone-800 focus:border-[#FF8FAB] focus:outline-none"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[10px] font-extrabold text-stone-500 mb-0.5">
                  📅 期限日
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-stone-500 mb-0.5">
                  ⏰ 時間（任意）
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-xs"
                />
              </div>
            </div>

            {/* 担当者・通知対象 */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-stone-100 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black text-stone-500">担当・通知先:</span>
                <button
                  type="button"
                  onClick={() => setNewTarget('partnerA')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-black transition-all ${
                    newTarget === 'partnerA'
                      ? 'bg-[#56CFE1] text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {partnerA.avatar}{partnerA.name}
                </button>
                <button
                  type="button"
                  onClick={() => setNewTarget('partnerB')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-black transition-all ${
                    newTarget === 'partnerB'
                      ? 'bg-[#B388EB] text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {partnerB.avatar}{partnerB.name}
                </button>
                <button
                  type="button"
                  onClick={() => setNewTarget('both')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-black transition-all ${
                    newTarget === 'both'
                      ? 'bg-[#FF8FAB] text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  💕ふたり
                </button>
              </div>

              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white text-xs font-black shadow-xs disabled:opacity-40"
              >
                追加する
              </button>
            </div>
          </form>
        )}

        {/* フィルター＆絞り込みバー */}
        <div className="bg-white/80 px-4 py-1.5 border-b border-stone-200/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3 text-stone-400" />
            <button
              type="button"
              onClick={() => setPartnerFilter('all')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                partnerFilter === 'all'
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-600'
              }`}
            >
              全員
            </button>
            <button
              type="button"
              onClick={() => setPartnerFilter('partnerA')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                partnerFilter === 'partnerA'
                  ? 'bg-[#56CFE1] text-white'
                  : 'bg-stone-100 text-stone-600'
              }`}
            >
              {partnerA.avatar}{partnerA.name}
            </button>
            <button
              type="button"
              onClick={() => setPartnerFilter('partnerB')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                partnerFilter === 'partnerB'
                  ? 'bg-[#B388EB] text-white'
                  : 'bg-stone-100 text-stone-600'
              }`}
            >
              {partnerB.avatar}{partnerB.name}
            </button>
          </div>

          <label className="flex items-center gap-1 text-[11px] font-bold text-stone-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-rose-500 focus:ring-rose-400"
            />
            <span>完了済みを表示</span>
          </label>
        </div>

        {/* コンテンツエリア */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {/* 📅 タブ1: タスク専用カレンダー */}
          {activeTab === 'calendar' && (
            <div className="space-y-3">
              {/* 年月送りヘッダー */}
              <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-stone-200 shadow-2xs">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 rounded-xl hover:bg-stone-100 text-stone-600"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="text-sm font-black text-stone-800">
                  {calYear}年 {calMonth}月のタスクカレンダー
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 rounded-xl hover:bg-stone-100 text-stone-600"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* 曜日ヘッダー */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black">
                {['日', '月', '火', '水', '木', '金', '土'].map((w, idx) => (
                  <div
                    key={w}
                    className={`py-1 rounded-lg ${
                      idx === 0 ? 'text-rose-500 bg-rose-50/60' : idx === 6 ? 'text-sky-600 bg-sky-50/60' : 'text-stone-600 bg-stone-100/60'
                    }`}
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* カレンダーマス目（タスク専用） */}
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell) => {
                  return (
                    <div
                      key={cell.dateStr}
                      onClick={() => {
                        setNewDate(cell.dateStr);
                        setIsAdding(true);
                      }}
                      className={`min-h-[85px] sm:min-h-[105px] p-1 rounded-xl border flex flex-col justify-between transition-all cursor-pointer ${
                        !cell.isCurrentMonth
                          ? 'opacity-35 bg-stone-50/60 border-stone-200'
                          : cell.isToday
                          ? 'bg-[#FFF9FB] border-rose-300 ring-2 ring-rose-200'
                          : 'bg-white border-stone-200 hover:border-rose-300'
                      }`}
                    >
                      {/* 日付ヘッダー */}
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className={`text-[10px] font-black leading-none ${
                            cell.isToday
                              ? 'w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center'
                              : cell.holidayName
                              ? 'text-rose-500'
                              : 'text-stone-700'
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {cell.tasks.length > 0 && (
                          <span className="text-[9px] font-extrabold text-stone-400">
                            {cell.tasks.filter((t) => !t.isCompleted).length > 0
                              ? `🔴${cell.tasks.filter((t) => !t.isCompleted).length}`
                              : '✅'}
                          </span>
                        )}
                      </div>

                      {/* タスク一覧 */}
                      <div className="flex-1 space-y-0.5 overflow-hidden">
                        {cell.tasks.map((t) => (
                          <div
                            key={t.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTaskComplete(t.id);
                            }}
                            title={`${t.title}（タップで完了切替）`}
                            className={`px-1 py-0.5 rounded text-[9px] sm:text-[10px] font-black truncate flex items-center gap-1 transition-all ${
                              t.isCompleted
                                ? 'bg-stone-100 text-stone-400 line-through'
                                : t.categoryId === 'partnerA'
                                ? 'bg-[#E2F9FC] text-[#126875] border-l-2 border-[#56CFE1]'
                                : t.categoryId === 'partnerB'
                                ? 'bg-[#F3EAFF] text-[#6638A6] border-l-2 border-[#B388EB]'
                                : 'bg-[#FFE5EC] text-[#9E2A47] border-l-2 border-[#FF8FAB]'
                            }`}
                          >
                            <span>{t.isCompleted ? '✅' : '⬜'}</span>
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}
                      </div>

                      <div className="text-[8px] text-stone-300 text-right opacity-0 hover:opacity-100">
                        ＋追加
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 📋 タブ2: タスク一覧リスト */}
          {activeTab === 'list' && (
            <div className="space-y-2.5">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-stone-400 space-y-2">
                  <CheckSquare className="w-10 h-10 mx-auto text-stone-300" />
                  <p className="font-extrabold text-xs">登録されているタスクはありません</p>
                  <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="px-3 py-1.5 rounded-xl bg-[#FF8FAB] text-white text-xs font-black shadow-xs"
                  >
                    ＋ 最初のタスクを追加
                  </button>
                </div>
              ) : (
                filteredTasks.map((t) => {
                  const targetLabel =
                    t.notifyTarget === 'partnerA'
                      ? `${partnerA.avatar}${partnerA.name}`
                      : t.notifyTarget === 'partnerB'
                      ? `${partnerB.avatar}${partnerB.name}`
                      : '💕ふたり';
                  const gCalUrl = buildGoogleCalendarUrl(t, metadata);

                  return (
                    <div
                      key={t.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        t.isCompleted
                          ? 'bg-stone-50 border-stone-200 opacity-60'
                          : 'bg-white border-stone-200/90 hover:border-rose-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          onClick={() => onToggleTaskComplete(t.id)}
                          className="flex items-start gap-2.5 flex-1 cursor-pointer select-none"
                        >
                          <button
                            type="button"
                            className="mt-0.5 text-rose-500 hover:scale-110 transition-transform"
                          >
                            {t.isCompleted ? (
                              <CheckSquare className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <Square className="w-5 h-5 text-stone-400" />
                            )}
                          </button>
                          <div>
                            <div
                              className={`font-black text-xs sm:text-sm text-stone-800 ${
                                t.isCompleted ? 'line-through text-stone-400' : ''
                              }`}
                            >
                              {t.title}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-extrabold text-stone-400">
                              <span className="flex items-center gap-0.5 text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md">
                                <CalendarIcon className="w-3 h-3" />
                                <span>{t.date}</span>
                                {t.startTime && <span>{t.startTime}</span>}
                              </span>
                              <span className="px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-600">
                                担当: {targetLabel}
                              </span>
                              {t.reminderMinutes !== undefined && (
                                <span className="flex items-center gap-0.5 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
                                  <Bell className="w-3 h-3 text-amber-500" />
                                  <span>{t.reminderMinutes === 0 ? '定刻通知' : `${t.reminderMinutes}分前`}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* アクションボタン（Google連携・共有・削除） */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Googleカレンダーに通知付き登録 */}
                          <a
                            href={gCalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-[10px] font-black flex items-center gap-0.5 transition-colors"
                            title="Googleカレンダーにリマインダー通知付きで登録"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Google通知</span>
                          </a>

                          {/* パートナーにLINE等で共有 */}
                          <button
                            type="button"
                            onClick={() => handleShareTask(t)}
                            className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-black flex items-center gap-0.5 transition-colors"
                            title="パートナーにLINE等で共有文をコピー"
                          >
                            {copiedId === t.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Share2 className="w-3.5 h-3.5" />
                            )}
                            <span className="hidden sm:inline">
                              {copiedId === t.id ? 'コピー済' : '共有'}
                            </span>
                          </button>

                          {/* 削除 */}
                          <button
                            type="button"
                            onClick={() => onDeleteEvent(t.id)}
                            className="p-1.5 rounded-xl text-stone-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                            title="タスクを削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 🔔 タブ3: Googleタスク＆通知連携ガイド */}
          {activeTab === 'google' && (
            <div className="space-y-3.5">
              <div className="bg-gradient-to-r from-sky-50 to-indigo-50 border-2 border-sky-200 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-black">
                    G
                  </div>
                  <div>
                    <h3 className="font-black text-xs sm:text-sm text-sky-900">
                      Google Tasks ＆ Googleカレンダー通知連携
                    </h3>
                    <p className="text-[11px] text-sky-700">
                      スマホのGoogleタスクやカレンダーと連携して、確実にプッシュ通知を受け取れます
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <a
                    href="https://tasks.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl bg-white border border-sky-200 hover:border-sky-400 text-sky-900 text-xs font-black flex items-center justify-between shadow-2xs transition-all"
                  >
                    <span className="flex items-center gap-1.5">
                      <ExternalLink className="w-4 h-4 text-sky-600" />
                      <span>Google Tasks を開く</span>
                    </span>
                    <span className="text-[10px] text-stone-400">tasks.google.com</span>
                  </a>

                  <a
                    href="https://calendar.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl bg-white border border-sky-200 hover:border-sky-400 text-sky-900 text-xs font-black flex items-center justify-between shadow-2xs transition-all"
                  >
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4 text-sky-600" />
                      <span>Googleカレンダーを開く</span>
                    </span>
                    <span className="text-[10px] text-stone-400">calendar.google.com</span>
                  </a>
                </div>
              </div>

              {/* 未完了タスクをGoogleカレンダーにワンタップ登録 */}
              <div className="bg-white rounded-2xl p-3.5 border border-stone-200 space-y-2">
                <div className="font-black text-xs text-stone-800 flex items-center justify-between">
                  <span>📅 未完了タスクのGoogleカレンダー通知登録</span>
                  <span className="text-[10px] text-stone-400">
                    タップでスマホのGoogleカレンダーに一発追加
                  </span>
                </div>

                <div className="space-y-1.5">
                  {allTasks
                    .filter((t) => !t.isCompleted)
                    .slice(0, 5)
                    .map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-[#FFFBF7] border border-stone-200 text-xs"
                      >
                        <div className="truncate mr-2">
                          <span className="font-black text-stone-700">{task.title}</span>
                          <span className="text-[10px] text-stone-400 ml-1.5">({task.date})</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyForGoogleTasks(task)}
                            className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-[10px] font-bold"
                          >
                            {copiedId === `gt_${task.id}` ? 'コピー済' : 'Tasks用コピー'}
                          </button>
                          <a
                            href={buildGoogleCalendarUrl(task, metadata)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-black shadow-2xs"
                          >
                            🔔 通知登録
                          </a>
                        </div>
                      </div>
                    ))}
                  {allTasks.filter((t) => !t.isCompleted).length === 0 && (
                    <p className="text-xs text-stone-400 py-3 text-center">
                      現在未完了のタスクはありません✨
                    </p>
                  )}
                </div>
              </div>

              {/* 端末別通知の仕組み解説 */}
              <div className="bg-[#FFF9FB] rounded-2xl p-3 border border-pink-200 text-xs text-stone-600 space-y-1.5">
                <div className="font-black text-[#9E2A47] flex items-center gap-1">
                  <Bell className="w-3.5 h-3.5 text-[#FF8FAB]" />
                  <span>💡 端末別通知のしくみ</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  タスク作成時に担当者を「{partnerA.avatar}{partnerA.name}」または「{partnerB.avatar}{partnerB.name}」に設定すると、Googleカレンダー通知を登録した際、担当した本人のスマホ端末だけにリマインダー通知が届きます。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
