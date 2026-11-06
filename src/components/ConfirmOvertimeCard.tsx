import React, { useState } from 'react';
import { Check, Clock, X, Sparkles, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { CoupleMetadata, PartnerId, ShiftEntry } from '../types/calendar';
import { formatMinutesToJa, getShiftHolidayWorkMinutes, getShiftOvertimeMinutes } from '../utils/presets';

interface ConfirmOvertimeCardProps {
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  shifts: Record<string, ShiftEntry>;
  onConfirmShift: (dateStr: string, partnerId: PartnerId, actualMinutes: number, isHolidayWork: boolean) => void;
  onCancelTentative: (dateStr: string, partnerId: PartnerId) => void;
}

export const ConfirmOvertimeCard: React.FC<ConfirmOvertimeCardProps> = ({
  activePartner,
  metadata,
  shifts,
  onConfirmShift,
  onCancelTentative,
}) => {
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [customMin, setCustomMin] = useState<string>('');

  // 今日の日付 (YYYY-MM-DD)
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 操作中パートナーのシフトの中で、未確定（仮・見込み）かつ今日以前のものを抽出
  const pendingEntries: ShiftEntry[] = Object.values(shifts)
    .filter((s) => {
      if (s.deletedAt || s.partnerId !== activePartner) return false;
      const isTentative = Boolean(s.isTentativeOvertime || s.isTentativeHolidayWork);
      if (!isTentative) return false;
      // 今日以前（過去または今日）の日付
      return s.date <= todayStr;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (pendingEntries.length === 0) {
    return null; // 未確定がなければ何も表示しない
  }

  // 一番古い未確定日をターゲットにする
  const currentEntry = pendingEntries[0];
  const isToday = currentEntry.date === todayStr;
  const isHw = Boolean(currentEntry.isTentativeHolidayWork || currentEntry.isHolidayWork);
  const plannedMinutes = isHw
    ? getShiftHolidayWorkMinutes(currentEntry)
    : getShiftOvertimeMinutes(currentEntry);

  const partner = metadata.partners[activePartner];
  const [, m, d] = currentEntry.date.split('-').map(Number);

  // 予定通り確定
  const handleConfirmAsIs = () => {
    onConfirmShift(currentEntry.date, activePartner, plannedMinutes, isHw);
    setIsAdjusting(false);
    setCustomMin('');
  };

  // 実時間を変更して確定
  const handleConfirmCustom = (min: number) => {
    onConfirmShift(currentEntry.date, activePartner, min, isHw);
    setIsAdjusting(false);
    setCustomMin('');
  };

  // 残業・休出なし（0分）にして完了
  const handleZeroAndComplete = () => {
    onCancelTentative(currentEntry.date, activePartner);
    setIsAdjusting(false);
    setCustomMin('');
  };

  return (
    <div className="mb-2.5 mx-2 rounded-2xl bg-linear-to-r from-[#FFF4EA] to-[#FFEBEF] border-2 border-[#FFD0BF] p-3 shadow-md animate-pop">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-black text-[#9C3D1C] flex items-center gap-1">
              <span>{partner.avatar}</span>
              <span>{partner.name}</span>
              <span>{isToday ? 'お疲れさま！今日の残業はどうだった？' : `${m}月${d}日の残業はどうだった？`}</span>
            </span>
            {pendingEntries.length > 1 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-extrabold text-[10px]">
                未確定あと{pendingEntries.length}件
              </span>
            )}
          </div>
          <p className="text-xs text-stone-600 font-bold">
            📅 {m}月{d}日({isToday ? '今日' : '過去'})の{isHw ? '休日出勤予定' : '残業予定'}:{' '}
            <span className="text-rose-600 font-black text-sm">{formatMinutesToJa(plannedMinutes)}</span>
            <span className="text-stone-400 text-[10px] ml-1">（仮登録中）</span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleZeroAndComplete}
          title="今日は残業なし（0分）にする"
          className="text-stone-400 hover:text-stone-600 font-bold text-xs p-1"
        >
          ✕
        </button>
      </div>

      {/* アクションボタン群 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handleConfirmAsIs}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-linear-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-black text-xs shadow-xs active:scale-95 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>予定通り {formatMinutesToJa(plannedMinutes)} で確定</span>
        </button>

        <button
          type="button"
          onClick={() => setIsAdjusting(!isAdjusting)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 font-bold text-xs shadow-2xs active:scale-95 transition-all"
        >
          <Clock className="w-3.5 h-3.5 text-[#FFB703]" />
          <span>実時間を微調整</span>
          {isAdjusting ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={handleZeroAndComplete}
          className="px-2 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-xs active:scale-95 transition-all"
        >
          残業なし（0分）
        </button>
      </div>

      {/* 微調整パネル（展開時） */}
      {isAdjusting && (
        <div className="mt-2 pt-2 border-t border-[#FFD0BF]/60 space-y-2 animate-fade-in text-xs">
          <div className="text-[11px] font-bold text-stone-600">実際の時間をタップして確定：</div>
          <div className="flex flex-wrap gap-1.5">
            {[15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 480].map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => handleConfirmCustom(min)}
                className={`px-2 py-1 rounded-lg font-bold border text-[11px] active:scale-95 transition-all ${
                  min === plannedMinutes
                    ? 'bg-rose-500 text-white border-rose-500 shadow-2xs'
                    : 'bg-white hover:bg-rose-50 text-stone-700 border-stone-200'
                }`}
              >
                {formatMinutesToJa(min)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="number"
              placeholder="直接分数（例: 35）"
              value={customMin}
              onChange={(e) => setCustomMin(e.target.value)}
              className="w-32 px-2.5 py-1 text-xs rounded-lg border border-stone-300 bg-white focus:outline-rose-400 font-bold"
            />
            <span className="text-stone-500 font-bold text-xs">分</span>
            <button
              type="button"
              disabled={!customMin || Number(customMin) < 0}
              onClick={() => handleConfirmCustom(Number(customMin))}
              className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-black text-xs shadow-2xs active:scale-95"
            >
              この時間で確定
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
