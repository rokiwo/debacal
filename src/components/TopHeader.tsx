import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Settings,
  RefreshCw,
  Maximize2,
  Minimize2,
  Clock,
  Heart,
  Plus,
  Timer,
  Camera,
} from 'lucide-react';
import {
  CalendarCategoryItem,
  CoupleMetadata,
  FilterCategoryId,
  PartnerId,
  ShiftEntry,
} from '../types/calendar';
import {
  formatMinutesToJa,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
} from '../utils/presets';

export interface PartnerOvertimeSummary {
  overtimeMinutes: number;        // 通常残業（分単位：例 35）
  holidayWorkMinutes: number;     // 休日出勤（分単位：例 240）
  totalExtraMinutes: number;      // 確定合計時間（分単位：例 275）
  tentativeExtraMinutes: number;  // 仮・見込み残業合計（分単位：例 120）
  overtimeHours: number;          // 従来の時間小数（後方互換用）
  holidayWorkHours: number;       // 従来の時間小数
  totalExtraHours: number;        // 従来の時間小数
  overtimeFormatted: string;      // 「35分」「1時間30分」
  holidayWorkFormatted: string;   // 「4時間」
  totalExtraFormatted: string;    // 「4時間35分」
  tentativeExtraFormatted: string;// 「2時間」
  partTimeCount: number;
  entries: ShiftEntry[];
  tentativeEntries: ShiftEntry[]; // 仮予定のシフト一覧
}

export interface MonthlyOvertimeSummary {
  partnerA: PartnerOvertimeSummary;
  partnerB: PartnerOvertimeSummary;
}

interface TopHeaderProps {
  year: number;
  month: number; // 1-12
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onSelectYearMonth: (y: number, m: number) => void;
  activePartner: PartnerId;
  onToggleActivePartner: (p: PartnerId) => void;
  metadata: CoupleMetadata;
  categories: CalendarCategoryItem[];
  onOpenCategoryManager: () => void;
  onMarkSeenNow: () => void;
  matchedHolidays: string[]; // "YYYY-MM-DD" の配列
  overtimeSummary: MonthlyOvertimeSummary;
  onSelectDate: (dateStr: string) => void;
  filterCategory: FilterCategoryId;
  onChangeFilter: (cat: FilterCategoryId) => void;
  isExpandedView: boolean;
  onToggleExpandedView: () => void;
  showShiftTimeInCell: boolean;
  onToggleShowShiftTime: () => void;
  unreadCountForPartner: number;
  isSyncing: boolean;
  syncEnabled: boolean;
  onTriggerSync: () => void;
  onOpenSettings: () => void;
  onLockScreen?: () => void;
  onOpenWidgetHome?: () => void;
  onOpenShiftExport?: () => void;
  onOpenWelcomeImage?: () => void;
  isShared?: boolean;
  onOpenSharedKeywordModal?: () => void;
  partnerNewCount?: number;
  onOpenPartnerEvents?: () => void;
}

export function formatLastSeen(isoStr?: string): string {
  if (!isoStr) return '未確認';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return '未確認';

  const now = new Date();
  const diffMin = Math.floor((now.getTime() - dt.getTime()) / 60000);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');

  if (diffMin < 1) return `たった今 (${hh}:${min})`;
  if (diffMin < 60) return `${diffMin}分前 (${hh}:${min})`;

  const isSameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();

  if (isSameDay) {
    return `今日 ${hh}:${min}`;
  }
  return `${mm}/${dd} ${hh}:${min}`;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSelectYearMonth,
  activePartner,
  onToggleActivePartner,
  metadata,
  categories,
  onOpenCategoryManager,
  onMarkSeenNow,
  matchedHolidays,
  overtimeSummary,
  onSelectDate,
  filterCategory,
  onChangeFilter,
  isExpandedView,
  onToggleExpandedView,
  showShiftTimeInCell,
  onToggleShowShiftTime,
  unreadCountForPartner,
  isSyncing,
  syncEnabled,
  onTriggerSync,
  onOpenSettings,
  onLockScreen,
  onOpenWidgetHome,
  onOpenShiftExport,
  onOpenWelcomeImage,
  isShared = false,
  onOpenSharedKeywordModal,
  partnerNewCount = 0,
  onOpenPartnerEvents,
}) => {
  const [showHolidayPopup, setShowHolidayPopup] = useState(false);
  const [showOvertimePopup, setShowOvertimePopup] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;
  const otherPartnerId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
  const otherPartner = metadata.partners[otherPartnerId];
  const currentPartner = metadata.partners[activePartner];

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  return (
    <header className="sticky top-0 z-30 bg-[#FFFBF7]/95 backdrop-blur-md border-b border-[#FFE5EC] shadow-xs">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 pt-1.5 pb-1.5 space-y-1.5">
        {/* 1段目：年月ナビゲーション ＆ [写真] [人(パートナー切替)] [更新] [設定]（全て綺麗に上段に収まる配置） */}
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {/* 左側：年月切替 ＆ 今日 */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* 年月ピル */}
            <div className="flex items-center bg-white rounded-xl border border-stone-200/90 shadow-2xs px-0.5 py-0.5">
              <button
                type="button"
                onClick={onPrevMonth}
                className="p-1 rounded-lg hover:bg-[#FFE5EC]/60 text-stone-600 active:scale-90"
                title="前の月"
              >
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowMonthPicker(!showMonthPicker)}
                className="px-1.5 py-0.5 rounded-lg hover:bg-[#FFF0F5] flex items-baseline gap-0.5"
              >
                <span className="text-[10px] sm:text-xs font-bold text-stone-400">{year}年</span>
                <span className="text-sm sm:text-base font-black text-stone-800">
                  {month}月
                </span>
              </button>
              <button
                type="button"
                onClick={onNextMonth}
                className="p-1 rounded-lg hover:bg-[#FFE5EC]/60 text-stone-600 active:scale-90"
                title="次の月"
              >
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onToday}
              className="px-1.5 sm:px-2 py-1 rounded-xl bg-white border border-stone-200 text-stone-600 text-[11px] sm:text-xs font-extrabold shadow-2xs hover:bg-stone-50 active:scale-95 shrink-0"
            >
              今日
            </button>
          </div>

          {/* 右側：📸 写真 ＆ 🐻🐰 人 ＆ 🔄 更新 ＆ ⚙️ 設定（写真と人のマークを程よく左に寄せ、全て綺麗に上段に横並び） */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* 📸 写真（シフト表・カレンダー画像保存・共有） */}
            {onOpenShiftExport && (
              <button
                type="button"
                onClick={onOpenShiftExport}
                className="px-1.5 sm:px-2 py-1 rounded-xl bg-[#E2F9FC] hover:bg-[#56CFE1] text-[#126875] hover:text-white border border-[#A9E9F2] text-[11px] sm:text-xs font-black flex items-center gap-0.5 sm:gap-1 active:scale-95 transition-all shadow-2xs shrink-0"
                title="シフト表・カレンダーを写真(画像)として保存・共有"
              >
                <Camera className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
                <span className="text-[11px] sm:text-xs">写真</span>
              </button>
            )}

            {/* 🐻🐰 操作中パートナー切替（人マーク） */}
            <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200 shadow-2xs shrink-0">
              <button
                type="button"
                onClick={() => onToggleActivePartner('partnerA')}
                className={`w-6.5 h-6.5 sm:w-7.5 sm:h-7 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center leading-none ${
                  activePartner === 'partnerA'
                    ? 'bg-[#56CFE1] text-white shadow-xs scale-105'
                    : 'text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 opacity-60'
                }`}
                title={`現在: ${partnerA.name}（タップで選択）`}
              >
                <span>{partnerA.avatar}</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleActivePartner('partnerB')}
                className={`w-6.5 h-6.5 sm:w-7.5 sm:h-7 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center leading-none ${
                  activePartner === 'partnerB'
                    ? 'bg-[#B388EB] text-white shadow-xs scale-105'
                    : 'text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 opacity-60'
                }`}
                title={`現在: ${partnerB.name}（タップで選択）`}
              >
                <span>{partnerB.avatar}</span>
              </button>
            </div>

            {/* 🔄 更新（クラウド同期マーク） */}
            {syncEnabled && (
              <button
                type="button"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className="p-1 sm:p-1.5 rounded-xl bg-white border border-stone-200 text-stone-600 active:scale-90 shadow-2xs hover:bg-stone-50 shrink-0"
                title="クラウド同期"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#FF8FAB]' : 'text-stone-600'}`} />
              </button>
            )}

            {/* ⚙️ 設定（歯車マーク） */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1 sm:p-1.5 rounded-xl bg-white border border-stone-200 text-stone-700 active:scale-90 shadow-2xs hover:bg-stone-50 shrink-0"
              title="設定・クラウド同期・iCal連携"
            >
              <Settings className="w-3.5 h-3.5 text-[#FF8FAB]" />
            </button>
          </div>
        </div>

        {/* 2段目：ふたりの集計（残業時間・休一致・予定確認）※上段に更新・設定が移ったため広々と重ならずに表示 */}
        <div className="flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
          {/* 左側：⏱️残業時間 ＆ ✨休一致 ＆ 💌パートナー予定 ＆ ✅既読 */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* ⏱️ 今月の残業時間バッジ */}
            {/* ⏱️ 今月の残業時間バッジ（操作中のパートナーのみ表示） */}
            <div className="relative shrink-0">
              {(() => {
                const currentPartner = metadata.partners[activePartner];
                const activeSum = overtimeSummary[activePartner];
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowOvertimePopup(!showOvertimePopup);
                        setShowHolidayPopup(false);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#FFF6D6] hover:bg-[#FFE8A3] border border-[#FFE28A] text-[#8A5A00] text-xs font-black shadow-2xs active:scale-95 transition-all"
                      title={`${currentPartner.name}の今月の残業時間・休日出勤時間・バイト回数を確認`}
                    >
                      <Timer className="w-3.5 h-3.5 text-[#D49600] shrink-0" />
                      <span>{currentPartner.avatar} 残業</span>
                      <span className="font-black">
                        {activeSum.totalExtraMinutes}分
                      </span>
                      {activeSum.tentativeExtraMinutes > 0 && (
                        <span className="text-[10px] font-extrabold text-[#D49600] opacity-90">
                          (+仮{activeSum.tentativeExtraMinutes}分)
                        </span>
                      )}
                    </button>

                    {showOvertimePopup && (
                      <div className="absolute left-0 mt-1.5 w-72 sm:w-80 bg-white rounded-2xl shadow-xl border-2 border-[#FFE28A] p-3 z-50 animate-pop text-xs space-y-2">
                        <div className="flex items-center justify-between pb-1 border-b border-stone-100">
                          <span className="font-extrabold text-[#8A5A00] flex items-center gap-1">
                            <Timer className="w-4 h-4 text-[#FFB703]" />
                            {month}月の残業・休出（{currentPartner.name}）
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowOvertimePopup(false)}
                            className="text-stone-400 hover:text-stone-600 font-bold px-1"
                          >
                            ✕
                          </button>
                        </div>

                        {/* 現在操作中のパートナーのカードのみ表示 */}
                        <div className="p-2.5 rounded-xl bg-[#FFFBF7] border border-stone-200/80 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-stone-800 flex items-center gap-1">
                              <span>{currentPartner.avatar}</span>
                              <span>{currentPartner.name}</span>
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#FFF6D6] text-[#8A5A00] font-black text-xs">
                              確定 {activeSum.totalExtraMinutes}分
                              {activeSum.totalExtraMinutes >= 60 && ` (${activeSum.totalExtraFormatted})`}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] text-stone-600 font-bold">
                            <span>
                              ⏱️ 通常残業: {activeSum.overtimeMinutes}分
                              {activeSum.overtimeMinutes >= 60 && ` (${activeSum.overtimeFormatted})`}
                            </span>
                            <span>
                              💼 休日出勤: {activeSum.holidayWorkMinutes}分
                              {activeSum.holidayWorkMinutes >= 60 && ` (${activeSum.holidayWorkFormatted})`}
                            </span>
                            <span>🏪 バイト: {activeSum.partTimeCount}回</span>
                          </div>

                          {/* 💡 仮・見込み予定セクション */}
                          {activeSum.tentativeExtraMinutes > 0 && (
                            <div className="p-2 rounded-xl bg-[#FFF6D6]/70 border border-[#FFE28A] space-y-1">
                              <div className="flex items-center justify-between font-extrabold text-[#8A5A00] text-[11px]">
                                <span className="flex items-center gap-1">
                                  <span>💡 仮・見込み残業:</span>
                                </span>
                                <span className="font-black text-rose-600">
                                  +{activeSum.tentativeExtraMinutes}分 ({activeSum.tentativeExtraFormatted})
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {activeSum.tentativeEntries.map((ten) => (
                                  <button
                                    key={ten.id}
                                    type="button"
                                    onClick={() => {
                                      onSelectDate(ten.date);
                                      setShowOvertimePopup(false);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-white border border-[#FFD0BF] text-[10px] font-bold text-[#9C3D1C] hover:border-rose-400"
                                  >
                                    {Number(ten.date.split('-')[2])}日(仮{ten.isTentativeHolidayWork ? '休出' : '残業'}{ten.holidayWorkMinutes || ten.overtimeMinutes}分)
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {activeSum.entries.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1 border-t border-stone-100">
                              {activeSum.entries.map((en) => {
                                const dayN = Number(en.date.split('-')[2]);
                                const hwMin = getShiftHolidayWorkMinutes(en);
                                let otMin = getShiftOvertimeMinutes(en);
                                if (hwMin > 0 && otMin > 0 && (en.isHolidayWork || en.stampId === 'shift_hol_work' || otMin === hwMin)) {
                                  otMin = 0; // 重複時は休出優先
                                }

                                const labelParts: string[] = [];
                                if (hwMin > 0) labelParts.push(`休出${hwMin}分`);
                                if (otMin > 0) labelParts.push(`+${otMin}分`);
                                if (labelParts.length === 0 && (en.subCustomLabel || en.subStampId || en.stampId === 'shift_part')) {
                                  labelParts.push('バイト');
                                }

                                return (
                                  <button
                                    key={en.id}
                                    type="button"
                                    onClick={() => {
                                      onSelectDate(en.date);
                                      setShowOvertimePopup(false);
                                    }}
                                    className="px-1.5 py-0.5 rounded-lg bg-white border border-stone-200 text-[10px] font-bold text-stone-700 hover:border-[#FF8FAB]"
                                  >
                                    {dayN}日({labelParts.join(' / ') || '予定'})
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* ✨今月のお休み一致バッジ */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowHolidayPopup(!showHolidayPopup);
                  setShowOvertimePopup(false);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#FFE5EC] hover:bg-[#FFD1DC] border border-[#FFC2D1] text-[#9E2A47] text-xs font-black shadow-2xs active:scale-95 transition-all"
                title="ふたり共通のお休み日"
              >
                <Sparkles className="w-3 h-3 text-[#FF8FAB] shrink-0" />
                <span>休一致</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white text-[#D63864] font-black text-xs">
                  {matchedHolidays.length}
                </span>
              </button>

              {showHolidayPopup && (
                <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border-2 border-[#FFE5EC] p-3 z-50 animate-pop">
                  <div className="flex items-center justify-between mb-2 pb-1 border-b border-stone-100">
                    <span className="text-xs font-extrabold text-[#9E2A47] flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 fill-[#FF8FAB] text-[#FF8FAB]" />
                      {month}月のふたり休日一致 ({matchedHolidays.length}日)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowHolidayPopup(false)}
                      className="text-stone-400 hover:text-stone-600 text-xs font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                  {matchedHolidays.length === 0 ? (
                    <p className="text-xs text-stone-500 py-2 text-center">
                      まだ今月の2人共通のお休み日がありません🐾
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                      {matchedHolidays.map((dateStr) => {
                        const dayNum = Number(dateStr.split('-')[2]);
                        const dt = new Date(
                          Number(dateStr.split('-')[0]),
                          Number(dateStr.split('-')[1]) - 1,
                          dayNum
                        );
                        const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => {
                              onSelectDate(dateStr);
                              setShowHolidayPopup(false);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-[#FFE5EC]/70 hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white text-xs font-extrabold"
                          >
                            💕 {month}/{dayNum}({w})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 💌 パートナーが打った予定確認ボタン */}
            {onOpenPartnerEvents && (
              <button
                type="button"
                onClick={onOpenPartnerEvents}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl text-xs font-black shadow-2xs active:scale-95 transition-all border shrink-0 ${
                  partnerNewCount > 0
                    ? 'bg-gradient-to-r from-rose-500 to-[#FF8FAB] text-white border-rose-300 ring-2 ring-rose-200 animate-pulse'
                    : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200'
                }`}
                title={`${otherPartner.name}が打った予定・シフトを確認`}
              >
                <span>💌</span>
                <span className="hidden min-[370px]:inline">{otherPartner.name}の</span>
                <span>予定</span>
                {partnerNewCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-white text-rose-600 text-[10px] font-black">
                    {partnerNewCount}
                  </span>
                )}
              </button>
            )}

            {/* ✅ すべて既読にするクイックボタン（新着がある時だけヘッダーにも即座に表示！） */}
            {partnerNewCount > 0 && (
              <button
                type="button"
                onClick={onMarkSeenNow}
                className="hidden min-[420px]:flex items-center gap-0.5 px-2 py-1 rounded-xl bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-300 text-[11px] font-black shadow-2xs active:scale-95 transition-all shrink-0"
                title="相手の新着予定をすべて既読にする"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>既読</span>
              </button>
            )}
          </div>

          {/* 右側：🔑 合言葉で共有ボタン（未共有の場合にのみ表示） */}
          {!isShared && onOpenSharedKeywordModal && (
            <div className="flex items-center gap-1 shrink-0 pl-1">
              <button
                type="button"
                onClick={onOpenSharedKeywordModal}
                className="px-2 py-1 rounded-xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white text-[10px] sm:text-xs font-black shadow-xs flex items-center gap-1 active:scale-95 animate-pulse shrink-0"
                title="合言葉を入力してカレンダーを共有"
              >
                <span>🔑</span>
                <span>共有</span>
              </button>
            </div>
          )}
        </div>

        {/* 年月ジャンプピッカー */}
        {showMonthPicker && (
          <div className="bg-white rounded-3xl p-3 border-2 border-[#FFE5EC] shadow-lg flex flex-wrap items-center justify-between gap-2 animate-pop">
            <div className="flex items-center gap-1.5">
              {[year - 1, year, year + 1].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => onSelectYearMonth(y, month)}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold ${
                    y === year ? 'bg-[#FF8FAB] text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {y}年
                </button>
              ))}
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 flex-1">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onSelectYearMonth(year, m);
                    setShowMonthPicker(false);
                  }}
                  className={`py-1 rounded-xl text-xs font-bold ${
                    m === month ? 'bg-[#B388EB] text-white font-extrabold' : 'bg-[#FFFBF7] text-stone-700'
                  }`}
                >
                  {m}月
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 下段：カレンダー予定項目フィルタ（デフォルト：すべて | 💕二人予定 | 🐻夫予定 | 🐰妻予定 ＋ 項目追加・削除ボタン）＋ 全件/コンパクト（3件まで）切替 */}
        <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onChangeFilter('all')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold transition-all flex items-center gap-1 ${
                filterCategory === 'all'
                  ? 'bg-stone-800 text-white shadow-2xs'
                  : 'bg-white text-stone-600 border border-stone-200/80'
              }`}
            >
              <span>🌈</span>
              <span>すべて</span>
            </button>

            {sortedCategories.map((cat) => {
              const isActive = filterCategory === cat.id;
              const displayLabel =
                cat.id === 'partnerA'
                  ? `${partnerA.name}予定`
                  : cat.id === 'partnerB'
                  ? `${partnerB.name}予定`
                  : cat.shortLabel;
              const displayIcon =
                cat.id === 'partnerA'
                  ? partnerA.avatar
                  : cat.id === 'partnerB'
                  ? partnerB.avatar
                  : cat.icon;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onChangeFilter(cat.id)}
                  style={
                    isActive
                      ? { backgroundColor: cat.accentColor, color: '#ffffff' }
                      : undefined
                  }
                  className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold transition-all flex items-center gap-1 ${
                    isActive
                      ? 'shadow-2xs scale-[1.02]'
                      : 'bg-white text-stone-600 border border-stone-200/80'
                  }`}
                >
                  <span>{displayIcon}</span>
                  <span>{displayLabel}</span>
                </button>
              );
            })}

            {/* カレンダー項目の追加・削除ボタン */}
            <button
              type="button"
              onClick={onOpenCategoryManager}
              className="px-2 py-1 rounded-full bg-[#FFF0F5] hover:bg-[#FFE5EC] border border-[#FFC2D1] text-[#9E2A47] text-[10px] font-extrabold flex items-center gap-0.5 shrink-0"
              title="カレンダーの予定項目を追加・削除する"
            >
              <Plus className="w-3 h-3" />
              <span>項目編集</span>
            </button>
          </div>

          {/* 右端：シフト時間表示トグル ＋ 全件展開 / コンパクト(3件まで)切替 */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleShowShiftTime}
              className={`px-2 py-1 rounded-full text-[10px] font-bold border flex items-center gap-0.5 ${
                showShiftTimeInCell
                  ? 'bg-[#E2F9FC] border-[#56CFE1] text-[#136370]'
                  : 'bg-white border-stone-200 text-stone-500'
              }`}
              title="シフト枠に開始時間を表示"
            >
              <Clock className="w-3 h-3" />
              <span className="hidden sm:inline">時間</span>
            </button>

            <button
              type="button"
              onClick={onToggleExpandedView}
              className={`px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-extrabold border flex items-center gap-1 ${
                isExpandedView
                  ? 'bg-[#FFE5EC] border-[#FF8FAB] text-[#9E2A47]'
                  : 'bg-white border-stone-200 text-stone-700'
              }`}
              title="コンパクト時は1日3件まで表示し、全件展開時はすべて表示します"
            >
              {isExpandedView ? (
                <>
                  <Maximize2 className="w-3 h-3" />
                  <span>全件表示</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3 h-3" />
                  <span>コンパクト(3件)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
