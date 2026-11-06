import React, { useEffect, useState } from 'react';
import {
  Stamp,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Settings2,
  X,
  Check,
  Mic,
  Camera,
  CalendarPlus,
  Smartphone,
  Timer,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckSquare,
} from 'lucide-react';
import {
  CoupleMetadata,
  PartnerId,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import {
  calculateMinutesBetween,
  formatMinutesShort,
  formatMinutesToJa,
  getPartnerShiftStamps,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
  SUPPORT_BADGE_PRESETS,
} from '../utils/presets';

export type StampDrawerTab = 'partnerA_shift' | 'partnerB_shift' | 'support_badge';

interface StampDrawerProps {
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  activeTab: StampDrawerTab;
  onChangeTab: (tab: StampDrawerTab) => void;
  stamps: StampPreset[];
  selectedStampId: string | null;
  onSelectStamp: (stampId: string | null) => void;
  selectedDate: string;
  onMoveDate: (deltaDays: number) => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: (next: boolean) => void;
  onApplyShiftAndAdvance: (stamp: StampPreset, targetPartner: PartnerId) => void;
  onClearShiftAndAdvance: (targetPartner: PartnerId) => void;
  onUpdateShiftDetailsOnSelectedDate: (
    targetPartner: PartnerId,
    patch: Partial<ShiftEntry>
  ) => void;
  currentShiftOnSelectedDate?: ShiftEntry;
  onToggleSupportBadgeOnSelectedDate: (badge: string) => void;
  activeSupportBadgesOnSelectedDate: string[];
  onOpenDayDetail: () => void;
  onOpenShiftStampManager: (partnerId?: PartnerId) => void;
  onOpenVoiceModal: () => void;
  onOpenImageOcrModal: () => void;
  onOpenWidgetModal: () => void;
  onOpenTaskManager?: () => void;
  onOpenShiftExport?: () => void;
  metadata: CoupleMetadata;
  activePartner?: PartnerId;
}

export const StampDrawer: React.FC<StampDrawerProps> = ({
  isOpen,
  onToggleOpen,
  activeTab,
  onChangeTab,
  stamps,
  selectedStampId,
  onSelectStamp,
  selectedDate,
  onMoveDate,
  autoAdvance,
  onToggleAutoAdvance,
  onApplyShiftAndAdvance,
  onClearShiftAndAdvance,
  onUpdateShiftDetailsOnSelectedDate,
  currentShiftOnSelectedDate,
  onToggleSupportBadgeOnSelectedDate,
  activeSupportBadgesOnSelectedDate,
  onOpenDayDetail,
  onOpenShiftStampManager,
  onOpenVoiceModal,
  onOpenImageOcrModal,
  onOpenWidgetModal,
  onOpenTaskManager,
  onOpenShiftExport,
  metadata,
  activePartner = 'partnerA',
}) => {
  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;

  const currentShiftPartner: PartnerId = activePartner;

  const shiftStamps = getPartnerShiftStamps(stamps, currentShiftPartner);

  const formatSelectedDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
    return `${m}/${d}(${w})`;
  };

  // 残業の開始・終了時刻から自動計算＆直接分数入力用のローカルstate
  const [showAutoCalc, setShowAutoCalc] = useState(false);
  const [calcStart, setCalcStart] = useState('11:00');
  const [calcEnd, setCalcEnd] = useState('11:35');
  const [directMin, setDirectMin] = useState('');

  useEffect(() => {
    const curOt = getShiftOvertimeMinutes(currentShiftOnSelectedDate);
    setDirectMin(curOt > 0 ? String(curOt) : '');
    const shiftEnd = currentShiftOnSelectedDate?.endTime || '17:00';
    setCalcStart(currentShiftOnSelectedDate?.overtimeStartTime || shiftEnd);
    setCalcEnd(currentShiftOnSelectedDate?.overtimeEndTime || '17:35');
  }, [currentShiftOnSelectedDate, selectedDate]);

  if (!isOpen) {
    return (
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#FFE5EC] shadow-[0_-4px_20px_rgba(255,143,171,0.15)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto px-2 py-1.5 grid grid-cols-5 gap-1">
          <button
            type="button"
            onClick={() => onToggleOpen(true)}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-[#FFE5EC]/70 text-[#9E2A47] active:scale-95 transition-all"
            title="シフトスタンプおよび残業・休日出勤の入力パネルを開きます"
          >
            <Stamp className="w-5 h-5 text-[#FF8FAB]" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight">
              シフト・残業
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenVoiceModal}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-[#F3EAFF]/80 text-[#59318F] active:scale-95 transition-all"
          >
            <Mic className="w-5 h-5 text-[#B388EB]" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight">
              声で予定
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenDayDetail}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] text-white shadow-md active:scale-95 transition-all"
          >
            <CalendarPlus className="w-5 h-5" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight truncate max-w-full">
              {formatSelectedDate(selectedDate)}詳細
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenImageOcrModal}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-[#E2F9FC]/80 text-[#136370] active:scale-95 transition-all"
          >
            <Camera className="w-5 h-5 text-[#56CFE1]" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight">
              AIシフト読取
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenTaskManager || onOpenWidgetModal}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-[#E6F7EF]/90 text-[#1E6645] active:scale-95 transition-all"
            title="タスク専用カレンダー ＆ Googleタスク連携を開く"
          >
            <CheckSquare className="w-5 h-5 text-[#52B788]" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight">
              タスク
            </span>
          </button>
        </div>
      </nav>
    );
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/98 backdrop-blur-md rounded-t-3xl shadow-2xl border-t-2 border-[#FF8FAB] pb-[env(safe-area-inset-bottom)] animate-pop">
      <div className="max-w-xl mx-auto px-3 pt-2 pb-2.5 space-y-1.5">
        {/* 1. ドロワー上部：選択日表示（カレンダーの日付タップで自由移動）＆ 連続翌日移動ON/OFF ＆ シフト種類編集 */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-stone-100 pb-1.5">
          <div className="flex items-center gap-1 bg-[#FFF0F5] px-2 py-1 rounded-2xl border border-[#FFC2D1]">
            <button
              type="button"
              onClick={() => onMoveDate(-1)}
              className="p-1 rounded-xl bg-white hover:bg-[#FFE5EC] text-stone-700 shadow-2xs"
              title="1日戻る"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenDayDetail}
              className="px-1.5 text-xs sm:text-sm font-extrabold text-[#9E2A47]"
            >
              🎯 {formatSelectedDate(selectedDate)}
            </button>
            <button
              type="button"
              onClick={() => onMoveDate(1)}
              className="p-1 rounded-xl bg-white hover:bg-[#FFE5EC] text-stone-700 shadow-2xs"
              title="1日進む"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onToggleAutoAdvance(!autoAdvance)}
              className={`px-2 py-1.5 rounded-2xl text-[11px] font-extrabold transition-all border ${
                autoAdvance
                  ? 'bg-[#E2F9FC] border-[#56CFE1] text-[#136370]'
                  : 'bg-stone-100 border-stone-300 text-stone-600'
              }`}
              title="シフトボタンを押したあとに自動で翌日に進むかどうかを切り替えます"
            >
              {autoAdvance ? '⏩ 連続翌日移動:ON' : '📌 同日留まり:OFF'}
            </button>

            <button
              type="button"
              onClick={() => onOpenShiftStampManager(currentShiftPartner)}
              className="px-2 py-1.5 rounded-2xl bg-[#FFE5EC] hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white text-[11px] font-extrabold transition-colors flex items-center gap-1 shadow-2xs"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>勤務リスト編集</span>
            </button>

            {onOpenShiftExport && (
              <button
                type="button"
                onClick={onOpenShiftExport}
                className="px-2 py-1.5 rounded-2xl bg-[#E2F9FC] hover:bg-[#56CFE1] text-[#126875] hover:text-white text-[11px] font-extrabold transition-colors flex items-center gap-1 shadow-2xs border border-[#A9E9F2]"
                title="シフト表を写真(PNG)として保存します"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>写真保存</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onToggleOpen(false)}
              className="p-1.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="text-[10px] font-bold text-stone-500 flex items-center justify-between px-1">
          <span>💡 カレンダーの数字をタップするとその日へ移動し、下のボタンでシフトが入ります</span>
        </div>

        {/* 2. 対象切替タブ（ユーザー要望：「夫として操作中は妻の方のシフト操作UIいらない」ため、操作中パートナー＋ごはんタブで構成） */}
        <div className="grid grid-cols-2 gap-1.5 bg-[#FFFBF7] p-1 rounded-2xl border border-stone-200/70">
          <button
            type="button"
            onClick={() => onChangeTab(activePartner === 'partnerB' ? 'partnerB_shift' : 'partnerA_shift')}
            className={`py-1.5 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab !== 'support_badge'
                ? activePartner === 'partnerB'
                  ? 'bg-[#B388EB] text-white shadow-sm'
                  : 'bg-[#56CFE1] text-white shadow-sm'
                : 'text-stone-600 hover:bg-white'
            }`}
          >
            <span>{activePartner === 'partnerB' ? partnerB.avatar : partnerA.avatar}</span>
            <span className="truncate">
              {activePartner === 'partnerB' ? partnerB.name : partnerA.name}のシフト入力
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('support_badge')}
            className={`py-1.5 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'support_badge'
                ? 'bg-[#FFB703] text-stone-900 shadow-sm'
                : 'text-stone-600 hover:bg-white'
            }`}
          >
            <span>🍳</span>
            <span className="truncate">ごはん・家事目印</span>
          </button>
        </div>

        {/* 3. シフトボタンパレット（1回押すごとに自動で翌日に移動！）＋ バイト＆残業クイック追記バー */}
        {(activeTab === 'partnerA_shift' || activeTab === 'partnerB_shift') && (
          <div className="space-y-1.5">
            {shiftStamps.length === 0 ? (
              <div className="py-3 px-4 rounded-2xl bg-[#FFFBF7] border border-dashed border-stone-300 flex items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-stone-600">
                  {currentShiftPartner === 'partnerA'
                    ? `${partnerA.avatar} ${partnerA.name}`
                    : `${partnerB.avatar} ${partnerB.name}`}
                  の勤務リストは空です
                </div>
                <button
                  type="button"
                  onClick={() => onOpenShiftStampManager(currentShiftPartner)}
                  className="px-3 py-1.5 rounded-xl bg-[#B388EB] text-white text-xs font-extrabold shadow-xs shrink-0"
                >
                  ＋ 勤務リストを追加
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto p-0.5">
                {shiftStamps.map((stamp) => {
                  const isSelected = selectedStampId === stamp.id;
                  return (
                    <button
                      key={stamp.id}
                      type="button"
                      onClick={() => {
                        onSelectStamp(stamp.id);
                        onApplyShiftAndAdvance(stamp, currentShiftPartner);
                      }}
                      style={{
                        backgroundColor: stamp.color,
                        color: stamp.textColor,
                      }}
                      className={`py-2 px-1.5 rounded-2xl font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs active:scale-90 transition-all border-2 ${
                        isSelected
                          ? 'border-stone-800 ring-2 ring-stone-800/15'
                          : 'border-white hover:brightness-95'
                      }`}
                    >
                      <div className="flex items-center gap-0.5">
                        {stamp.icon && <span className="text-sm">{stamp.icon}</span>}
                        <span className="truncate">{stamp.label}</span>
                      </div>
                      {stamp.startTime ? (
                        <span className="text-[9px] opacity-80 font-bold">
                          {stamp.startTime}-{stamp.endTime}
                        </span>
                      ) : (
                        <span className="text-[9px] opacity-65">
                          {stamp.isHoliday ? '💕終日(休)' : '終日'}
                        </span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    onSelectStamp('__ERASER__');
                    onClearShiftAndAdvance(currentShiftPartner);
                  }}
                  className={`py-2 px-1.5 rounded-2xl font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 bg-stone-100 text-stone-600 hover:bg-rose-50 hover:text-rose-600 border-2 ${
                    selectedStampId === '__ERASER__' ? 'border-rose-500' : 'border-stone-200'
                  }`}
                >
                  <Eraser className="w-4 h-4" />
                  <span>消して次へ</span>
                </button>
              </div>
            )}

            {/* 選択日の「＋仕事終わり・休日のバイト」＆「⏱️残業・休日出勤」ワンタップ重ね記載バー */}
            <div className="pt-1.5 border-t border-stone-100 space-y-1.5 text-[10px]">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <span className="font-bold text-stone-400 shrink-0">
                  {formatSelectedDate(selectedDate)}:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateShiftDetailsOnSelectedDate(currentShiftPartner, {
                      subStampId: currentShiftOnSelectedDate?.subCustomLabel ? undefined : 'shift_part',
                      subCustomLabel: currentShiftOnSelectedDate?.subCustomLabel ? undefined : '夜勤バイト',
                      subStartTime: '21:00',
                      subEndTime: '23:59',
                    })
                  }
                  className={`px-2.5 py-1 rounded-lg font-black border shrink-0 transition-all ${
                    currentShiftOnSelectedDate?.subCustomLabel
                      ? 'bg-amber-300 border-amber-400 text-stone-900 shadow-2xs'
                      : 'bg-[#FFFBF7] border-stone-200 text-stone-600 hover:bg-amber-50'
                  }`}
                  title="仕事終わりの夜勤バイトを1タップで追加（カレンダーに夜バと表示されます）"
                >
                  {currentShiftOnSelectedDate?.subCustomLabel ? '🌙夜勤バイト中' : '＋🌙夜勤バイト'}
                </button>

                {/* ⚡ 開始〜終了時刻から自動計算のトグルボタン */}
                <button
                  type="button"
                  onClick={() => setShowAutoCalc(!showAutoCalc)}
                  className={`px-2 py-1 rounded-lg font-extrabold border shrink-0 flex items-center gap-0.5 transition-all ${
                    showAutoCalc
                      ? 'bg-rose-500 text-white border-rose-500 shadow-2xs'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <Zap className="w-3 h-3 text-amber-300 shrink-0" />
                  <span>⚡時間から自動計算</span>
                  {showAutoCalc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {(() => {
                  const curOtMin = getShiftOvertimeMinutes(currentShiftOnSelectedDate);
                  const curHwMin = getShiftHolidayWorkMinutes(currentShiftOnSelectedDate);
                  return (
                    <>
                      {[
                        { label: '0分解除', min: 0 },
                        { label: '+15分', min: 15 },
                        { label: '+30分', min: 30 },
                        { label: '+35分', min: 35 },
                        { label: '+45分', min: 45 },
                        { label: '+60分(1h)', min: 60 },
                        { label: '+90分(1.5h)', min: 90 },
                        { label: '+120分(2h)', min: 120 },
                      ].map((b) => (
                        <button
                          key={b.min}
                          type="button"
                          onClick={() => {
                            const nextMin = b.min === 0 ? 0 : curOtMin === b.min ? 0 : b.min;
                            setDirectMin(nextMin > 0 ? String(nextMin) : '');
                            onUpdateShiftDetailsOnSelectedDate(currentShiftPartner, {
                              overtimeMinutes: nextMin,
                              overtimeHours: Math.round((nextMin / 60) * 10) / 10,
                              isHolidayWork: false,
                              holidayWorkMinutes: 0,
                              holidayWorkHours: 0,
                            });
                          }}
                          className={`px-2 py-1 rounded-lg font-extrabold border shrink-0 text-[10px] transition-all ${
                            curOtMin === b.min && curHwMin === 0 && b.min > 0
                              ? 'bg-rose-500 border-rose-500 text-white shadow-2xs scale-105'
                              : 'bg-[#FFFBF7] border-stone-200 text-stone-600'
                          }`}
                        >
                          {b.min === 0 ? '✕ 0分' : `⏱️${b.label}`}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          const nextHwMin = curHwMin === 240 ? 0 : 240;
                          onUpdateShiftDetailsOnSelectedDate(currentShiftPartner, {
                            isHolidayWork: nextHwMin > 0,
                            holidayWorkMinutes: nextHwMin,
                            holidayWorkHours: nextHwMin > 0 ? 4 : 0,
                            overtimeMinutes: 0,
                            overtimeHours: 0,
                          });
                        }}
                        className={`px-2 py-1 rounded-lg font-extrabold border shrink-0 text-[10px] ${
                          curHwMin === 240
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-[#FFECE5] border-[#FFD0BF] text-[#9C3D1C]'
                        }`}
                      >
                        💼休出4h(240分)
                      </button>
                    </>
                  );
                })()}
              </div>

              {/* ⚡ インライン展開：開始・終了時刻から自動計算パネル（例: 11:00〜11:35 -> 35分） */}
              {showAutoCalc && (() => {
                const diffMin = calculateMinutesBetween(calcStart, calcEnd);
                const shiftEnd = currentShiftOnSelectedDate?.endTime;
                return (
                  <div className="bg-gradient-to-r from-rose-50 via-amber-50/50 to-rose-50 p-2 rounded-xl border border-rose-200 shadow-2xs space-y-1.5 animate-pop">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-rose-900 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>残業時刻の自動計算（例：11:00〜11:35 → 35分）</span>
                      </span>
                      {shiftEnd && (
                        <button
                          type="button"
                          onClick={() => {
                            setCalcStart(shiftEnd);
                            setCalcEnd(currentShiftOnSelectedDate?.overtimeEndTime || shiftEnd);
                          }}
                          className="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-rose-700 font-bold text-[9px] hover:bg-rose-100"
                        >
                          💡 定時({shiftEnd})から開始
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-stone-200">
                        <span className="text-stone-400 font-bold text-[9px]">開始</span>
                        <input
                          type="time"
                          value={calcStart}
                          onChange={(e) => setCalcStart(e.target.value)}
                          className="font-black text-xs text-stone-800 bg-transparent outline-none"
                        />
                      </div>
                      <span className="text-stone-400 font-black">〜</span>
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-stone-200">
                        <span className="text-stone-400 font-bold text-[9px]">終了</span>
                        <input
                          type="time"
                          value={calcEnd}
                          onChange={(e) => setCalcEnd(e.target.value)}
                          className="font-black text-xs text-stone-800 bg-transparent outline-none"
                        />
                      </div>

                      <span className="px-2 py-1 rounded-lg bg-rose-500 text-white font-black text-xs shadow-2xs">
                        ⚡ 自動計算: {diffMin}分
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          onUpdateShiftDetailsOnSelectedDate(currentShiftPartner, {
                            overtimeMinutes: diffMin,
                            overtimeHours: Math.round((diffMin / 60) * 10) / 10,
                            overtimeStartTime: calcStart,
                            overtimeEndTime: calcEnd,
                            isHolidayWork: false,
                            holidayWorkMinutes: 0,
                            holidayWorkHours: 0,
                          });
                          setShowAutoCalc(false);
                        }}
                        className="px-3 py-1 rounded-lg bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black text-xs shadow-xs active:scale-95 transition-all ml-auto"
                      >
                        ⏱️ この内容で反映
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* 自由分数入力（例: [ 35 ] 分 反映） */}
              <div className="flex items-center gap-1.5 pt-0.5 text-[10px]">
                <span className="font-bold text-stone-500 shrink-0">直接分数入力:</span>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  placeholder="35"
                  value={directMin}
                  onChange={(e) => setDirectMin(e.target.value)}
                  className="w-16 px-1.5 py-0.5 rounded-md border border-stone-300 bg-white font-black text-center text-rose-600 text-xs"
                />
                <span className="font-bold text-stone-600">分</span>
                <button
                  type="button"
                  onClick={() => {
                    const val = Math.max(0, parseInt(directMin, 10) || 0);
                    onUpdateShiftDetailsOnSelectedDate(currentShiftPartner, {
                      overtimeMinutes: val,
                      overtimeHours: Math.round((val / 60) * 10) / 10,
                      isHolidayWork: false,
                      holidayWorkMinutes: 0,
                      holidayWorkHours: 0,
                    });
                  }}
                  className="px-2 py-0.5 rounded-md bg-stone-800 text-white font-extrabold hover:bg-stone-900 active:scale-95 shadow-2xs"
                >
                  反映
                </button>

                {(() => {
                  const curOt = getShiftOvertimeMinutes(currentShiftOnSelectedDate);
                  const curHw = getShiftHolidayWorkMinutes(currentShiftOnSelectedDate);
                  if (curOt === 0 && curHw === 0) return null;
                  return (
                    <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-extrabold text-[10px] ml-auto">
                      {curHw > 0 ? `休出 ${curHw}分` : `残業 +${curOt}分`} 反映中
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ごはん・家事すれ違い目印パレット */}
        {activeTab === 'support_badge' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-40 overflow-y-auto p-0.5">
            {SUPPORT_BADGE_PRESETS.map((item) => {
              const isActive = activeSupportBadgesOnSelectedDate.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggleSupportBadgeOnSelectedDate(item.id)}
                  className={`py-2 px-2.5 rounded-2xl text-left transition-all border-2 flex flex-col justify-center ${
                    isActive
                      ? 'bg-[#FFF6D6] border-[#FFB703] text-[#8A5A00] shadow-xs'
                      : 'bg-[#FFFBF7] border-stone-200 text-stone-700'
                  }`}
                >
                  <div className="text-xs font-extrabold flex items-center justify-between">
                    <span>{item.label}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-[#D49600]" />}
                  </div>
                  <span className="text-[10px] text-stone-400 truncate">{item.desc}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
