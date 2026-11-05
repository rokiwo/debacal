import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCheck,
  Calendar,
  Clock,
  Sparkles,
  ChevronRight,
  Bell,
  CheckCircle2,
  FileText,
  Briefcase,
} from 'lucide-react';
import {
  CalendarDataStore,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import { resolveCategoryInfo } from '../utils/presets';

interface PartnerEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: CalendarDataStore;
  activePartner: PartnerId;
  onMarkSeenNow: () => void;
  onSelectDate: (dateStr: string) => void;
}

export const PartnerEventsModal: React.FC<PartnerEventsModalProps> = ({
  isOpen,
  onClose,
  store,
  activePartner,
  onMarkSeenNow,
  onSelectDate,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'shifts'>('all');

  const otherPartnerId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
  const partnerA = store.metadata?.partners?.partnerA || { name: 'ゆうと', avatar: '🐻' };
  const partnerB = store.metadata?.partners?.partnerB || { name: 'さや', avatar: '🐰' };
  const currentPartner = store.metadata?.partners?.[activePartner] || (activePartner === 'partnerA' ? partnerA : partnerB);
  const otherPartner = store.metadata?.partners?.[otherPartnerId] || (otherPartnerId === 'partnerB' ? partnerB : partnerA);

  const myLastSeenMs = Date.parse(currentPartner.lastSeenAt || '') || 0;

  const stampMap = useMemo(() => {
    const map = new Map<string, StampPreset>();
    for (const s of store.stamps || []) {
      map.set(s.id, s);
    }
    return map;
  }, [store.stamps]);

  // 今日の日付文字列
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }, []);

  // 相手（otherPartner）が作成・更新した予定
  const partnerEvents = useMemo(() => {
    const list: Array<{
      event: ScheduleEvent;
      isNew: boolean;
      updatedMs: number;
    }> = [];

    for (const ev of Object.values(store.events || {})) {
      if (!ev || ev.deletedAt) continue;
      // 相手が作成した予定、もしくは相手専用カテゴリの予定
      if (ev.createdBy === otherPartnerId) {
        const updatedMs = Date.parse(ev.updatedAt || ev.createdAt) || 0;
        const isNew = updatedMs > myLastSeenMs;
        list.push({ event: ev, isNew, updatedMs });
      }
    }

    // 新着優先、その次は日付順（今日以降優先、過去は後）
    return list.sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return a.event.date.localeCompare(b.event.date);
    });
  }, [myLastSeenMs, otherPartnerId, store.events]);

  // 相手のシフト登録・変更
  const partnerShifts = useMemo(() => {
    const list: Array<{
      shift: ShiftEntry;
      isNew: boolean;
      updatedMs: number;
    }> = [];

    for (const s of Object.values(store.shifts || {})) {
      if (!s || s.deletedAt || s.partnerId !== otherPartnerId) continue;
      const updatedMs = Date.parse(s.updatedAt || s.createdAt) || 0;
      const isNew = updatedMs > myLastSeenMs;
      // 直近前後30日程度、または新着のもの
      if (isNew || s.date >= todayStr) {
        list.push({ shift: s, isNew, updatedMs });
      }
    }

    return list.sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return a.shift.date.localeCompare(b.shift.date);
    });
  }, [myLastSeenMs, otherPartnerId, store.shifts, todayStr]);

  // 全体の新着件数（予定＋シフト）
  const totalNewCount = useMemo(() => {
    const evCount = partnerEvents.filter((item) => item.isNew).length;
    const shCount = partnerShifts.filter((item) => item.isNew).length;
    return evCount + shCount;
  }, [partnerEvents, partnerShifts]);

  if (!isOpen) return null;

  const handleItemClick = (dateStr: string) => {
    onSelectDate(dateStr);
    onClose();
  };

  const handleMarkAllAsSeen = () => {
    onMarkSeenNow();
  };

  // 日付の日本語フォーマット
  const formatDateJa = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const week = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
    const isToday = dateStr === todayStr;
    return {
      text: `${m}月${d}日(${week})`,
      isToday,
      isPast: dateStr < todayStr,
      weekColor: dt.getDay() === 0 ? 'text-rose-500' : dt.getDay() === 6 ? 'text-sky-500' : 'text-stone-700',
    };
  };

  // 更新日時のフォーマット
  const formatUpdateTime = (updatedMs: number) => {
    if (!updatedMs) return '';
    const now = Date.now();
    const diffSec = Math.floor((now - updatedMs) / 1000);
    if (diffSec < 60) return 'たった今';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}分前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}時間前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}日前`;
    const d = new Date(updatedMs);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border-2 border-[#FFE5EC]">
        {/* ヘッダーエリア */}
        <div className="bg-gradient-to-r from-[#FFF0F5] to-[#F3EAFF] p-4 sm:p-5 border-b border-[#FFE5EC] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{otherPartner.avatar}</span>
              <div>
                <h3 className="text-base sm:text-lg font-black text-stone-800 flex items-center gap-1.5">
                  <span>{otherPartner.name}が打った予定</span>
                  {totalNewCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-xs font-black animate-pulse">
                      🆕 新着 {totalNewCount}件
                    </span>
                  )}
                </h3>
                <p className="text-xs text-stone-500 font-bold">
                  {otherPartner.name}が登録・更新した予定をまとめて確認できます
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-all"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 「すべて既読にする」ボタン */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkAllAsSeen}
              disabled={totalNewCount === 0}
              className={`flex-1 py-2 px-3 rounded-2xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                totalNewCount > 0
                  ? 'bg-[#FF8FAB] hover:bg-[#FF7597] text-white active:scale-[0.98]'
                  : 'bg-stone-100 text-stone-400 cursor-default'
              }`}
            >
              <CheckCheck className="w-4 h-4" />
              <span>
                {totalNewCount > 0
                  ? `すべて既読にする (新着 ${totalNewCount}件をクリア)`
                  : 'すべて既読済みです ✨'}
              </span>
            </button>
          </div>

          {/* タブ切り替え */}
          <div className="mt-3 flex items-center bg-white/80 p-0.5 rounded-xl border border-stone-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex-1 py-1 px-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'all'
                  ? 'bg-[#FF8FAB] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>予定一覧 ({partnerEvents.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('new')}
              className={`flex-1 py-1 px-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'new'
                  ? 'bg-rose-500 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>新着のみ ({partnerEvents.filter((i) => i.isNew).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('shifts')}
              className={`flex-1 py-1 px-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'shifts'
                  ? 'bg-[#B388EB] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>シフト ({partnerShifts.length})</span>
            </button>
          </div>
        </div>

        {/* リスト本文エリア */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 bg-[#FFFBF7]">
          {activeTab === 'shifts' ? (
            /* シフトタブ一覧 */
            partnerShifts.length === 0 ? (
              <div className="text-center py-10 text-stone-400 space-y-2">
                <Briefcase className="w-10 h-10 mx-auto opacity-30 text-[#B388EB]" />
                <p className="text-xs font-bold">{otherPartner.name}の直近シフトはまだ登録されていません🐾</p>
              </div>
            ) : (
              partnerShifts.map(({ shift, isNew, updatedMs }) => {
                const dateInfo = formatDateJa(shift.date);
                const stamp = stampMap.get(shift.stampId);
                const hasSub = Boolean(shift.subCustomLabel || shift.subStampId);
                return (
                  <div
                    key={shift.id}
                    onClick={() => handleItemClick(shift.date)}
                    className={`p-3 rounded-2xl bg-white border transition-all cursor-pointer hover:border-[#B388EB] hover:shadow-xs active:scale-[0.99] flex items-center justify-between gap-2 ${
                      isNew ? 'border-rose-400 bg-rose-50/30 ring-1 ring-rose-300' : 'border-stone-200/80'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-black ${dateInfo.weekColor}`}>
                          {dateInfo.text}
                        </span>
                        {dateInfo.isToday && (
                          <span className="px-1.5 py-0.2 rounded-full bg-[#FF8FAB] text-white text-[10px] font-black">
                            今日
                          </span>
                        )}
                        {isNew && (
                          <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                            🆕 新着
                          </span>
                        )}
                        <span className="text-[10px] text-stone-400 font-bold ml-auto">
                          {formatUpdateTime(updatedMs)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          style={
                            stamp
                              ? { backgroundColor: stamp.color, color: stamp.textColor }
                              : undefined
                          }
                          className="px-2.5 py-1 rounded-xl text-xs font-black inline-flex items-center gap-1"
                        >
                          <span>{stamp?.icon || '💼'}</span>
                          <span>{shift.customLabel || stamp?.label || 'シフト'}</span>
                        </span>

                        {hasSub && (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-300 text-stone-900 text-xs font-black">
                            夜バ
                          </span>
                        )}

                        {shift.isHolidayWork && (
                          <span className="px-2 py-0.5 rounded-lg bg-rose-500 text-white text-xs font-black">
                            休日出勤
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                  </div>
                );
              })
            )
          ) : (
            /* 予定一覧・新着タブ */
            (() => {
              const displayList =
                activeTab === 'new'
                  ? partnerEvents.filter((item) => item.isNew)
                  : partnerEvents;

              if (displayList.length === 0) {
                return (
                  <div className="text-center py-12 text-stone-400 space-y-2">
                    <Calendar className="w-10 h-10 mx-auto opacity-30 text-[#FF8FAB]" />
                    <p className="text-xs font-bold">
                      {activeTab === 'new'
                        ? '未確認の新着予定はありません✨'
                        : `${otherPartner.name}が登録した予定はまだありません🐾`}
                    </p>
                    <p className="text-[11px] text-stone-400">
                      {otherPartner.name}が新しい予定を登録すると、ここに届きます💌
                    </p>
                  </div>
                );
              }

              return displayList.map(({ event, isNew, updatedMs }) => {
                const dateInfo = formatDateJa(event.date);
                const cat = resolveCategoryInfo(event.categoryId, store.categories, store.metadata);
                return (
                  <div
                    key={event.id}
                    onClick={() => handleItemClick(event.date)}
                    className={`p-3 rounded-2xl bg-white border transition-all cursor-pointer hover:border-[#FF8FAB] hover:shadow-xs active:scale-[0.99] flex items-center justify-between gap-2.5 ${
                      isNew ? 'border-rose-400 bg-rose-50/30 ring-1 ring-rose-300' : 'border-stone-200/80'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* 日付・新着バッジ・更新時刻 */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-black ${dateInfo.weekColor}`}>
                          {dateInfo.text}
                        </span>
                        {dateInfo.isToday && (
                          <span className="px-1.5 py-0.2 rounded-full bg-[#FF8FAB] text-white text-[10px] font-black">
                            今日
                          </span>
                        )}
                        {isNew && (
                          <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                            🆕 新着
                          </span>
                        )}
                        <span className="text-[10px] text-stone-400 font-bold ml-auto">
                          {formatUpdateTime(updatedMs)}に登録/更新
                        </span>
                      </div>

                      {/* 予定タイトル ＆ カテゴリ */}
                      <div className="flex items-center gap-1.5">
                        <span
                          style={{ backgroundColor: cat.bgColor, color: cat.textColor }}
                          className="px-2 py-0.5 rounded-lg text-xs font-black shrink-0 flex items-center gap-0.5"
                        >
                          <span>{cat.icon}</span>
                          <span>{cat.shortLabel}</span>
                        </span>

                        <span className="text-xs sm:text-sm font-black text-stone-800 truncate">
                          {event.title}
                        </span>
                      </div>

                      {/* 時間 ＆ メモ */}
                      <div className="flex items-center gap-2 text-[11px] text-stone-500 font-bold">
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3 text-stone-400" />
                          {event.isAllDay
                            ? '終日'
                            : `${event.startTime || ''}${event.endTime ? `〜${event.endTime}` : ''}`}
                        </span>

                        {event.memo && (
                          <span className="flex items-center gap-0.5 truncate text-stone-400 max-w-[180px]">
                            <FileText className="w-3 h-3" />
                            {event.memo}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] font-bold text-stone-400 hidden sm:inline">開く</span>
                      <ChevronRight className="w-4 h-4 text-stone-300" />
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>

        {/* フッター */}
        <div className="p-3 bg-stone-50 border-t border-stone-200/80 flex items-center justify-between text-xs text-stone-500 font-bold">
          <span>予定をタップするとその日の詳細が開きます</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-xl bg-white border border-stone-200 text-stone-700 font-black hover:bg-stone-100"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
