import React, { useState } from 'react';
import { Heart, X, Settings, Sparkles, Calendar, Maximize2 } from 'lucide-react';
import { CalendarDataStore, PartnerId, WelcomeImageConfig } from '../types/calendar';
import { formatMinutesShort, getJapaneseHoliday, getShiftOvertimeMinutes } from '../utils/presets';
import { loadDedicatedWelcomePhoto } from '../utils/storage';

interface WelcomeImageModalProps {
  store: CalendarDataStore;
  config: WelcomeImageConfig;
  onClose: () => void;
  onOpenSettings?: () => void;
  onUpdateConfig?: (newConfig: WelcomeImageConfig) => void;
}

export const WelcomeImageModal: React.FC<WelcomeImageModalProps> = ({
  store,
  config,
  onClose,
  onOpenSettings,
  onUpdateConfig,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dontShowToday, setDontShowToday] = useState(false);

  // 📸 表示中の写真を内部stateで強固に保護（親の同期や再レンダリングで写真が一瞬消えるのを100%防止）
  const [displayPhotoUrl, setDisplayPhotoUrl] = useState<string>(() => config.dataUrl || '');

  React.useEffect(() => {
    if (config.dataUrl) {
      setDisplayPhotoUrl(config.dataUrl);
    } else {
      // 専用ストレージから直接安全に補完復元
      loadDedicatedWelcomePhoto().then((saved) => {
        if (saved?.dataUrl) {
          setDisplayPhotoUrl(saved.dataUrl);
        }
      });
    }
  }, [config.dataUrl]);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][today.getDay()];
  const holidayName = getJapaneseHoliday(dateStr);

  const partnerA = store.metadata.partners.partnerA;
  const partnerB = store.metadata.partners.partnerB;

  const stampMap = new Map(store.stamps.map((s) => [s.id, s]));

  const shiftA = store.shifts[`${dateStr}_partnerA`];
  const shiftB = store.shifts[`${dateStr}_partnerB`];
  const activeShiftA = shiftA && !shiftA.deletedAt ? shiftA : undefined;
  const activeShiftB = shiftB && !shiftB.deletedAt ? shiftB : undefined;
  const stampA = activeShiftA ? stampMap.get(activeShiftA.stampId) : undefined;
  const stampB = activeShiftB ? stampMap.get(activeShiftB.stampId) : undefined;

  const isBothOff =
    (stampA?.isHoliday || /休/.test(stampA?.label || '')) &&
    (stampB?.isHoliday || /休/.test(stampB?.label || ''));

  const handleClose = () => {
    if (dontShowToday && onUpdateConfig) {
      onUpdateConfig({
        ...config,
        lastShownDate: dateStr,
      });
    }
    onClose();
  };

  const renderShiftBadge = (
    name: string,
    avatar: string,
    shift: typeof activeShiftA,
    stamp: typeof stampA,
    defaultColor: string
  ) => {
    const label = shift?.customLabel || stamp?.label || 'シフト未定';
    const sub = shift?.subCustomLabel;
    const ot = getShiftOvertimeMinutes(shift);

    return (
      <div
        style={stamp ? { backgroundColor: stamp.color, color: stamp.textColor } : { backgroundColor: defaultColor }}
        className="flex-1 px-2.5 py-1.5 rounded-xl border border-stone-200/50 shadow-2xs text-left"
      >
        <div className="text-[10px] opacity-75 font-black flex items-center gap-1">
          <span>{avatar}</span>
          <span>{name}</span>
        </div>
        <div className="font-extrabold text-xs sm:text-sm flex items-center gap-1 mt-0.5 truncate">
          <span>{stamp?.icon || ''}</span>
          <span>{label}</span>
          {sub && <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-300 text-stone-900 font-black shadow-2xs">夜バ</span>}
          {ot > 0 && <span className="text-[10px] px-1 rounded bg-rose-500 text-white">+{formatMinutesShort(ot)}</span>}
        </div>
        {(shift?.startTime || stamp?.startTime) && (
          <div className="text-[10px] opacity-80 font-bold mt-0.5">
            {shift?.startTime || stamp?.startTime}〜{shift?.endTime || stamp?.endTime}
          </div>
        )}
      </div>
    );
  };

  // 全画面写真ビュー
  if (isFullscreen && displayPhotoUrl) {
    return (
      <div
        onClick={() => setIsFullscreen(false)}
        className="fixed inset-0 z-[80] bg-black/95 flex flex-col items-center justify-center p-2 cursor-pointer animate-fade-in"
      >
        <button
          type="button"
          onClick={() => setIsFullscreen(false)}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white z-10"
        >
          <X className="w-6 h-6" />
        </button>
        <img
          src={displayPhotoUrl}
          alt="お気に入り写真"
          className="max-h-[90vh] max-w-[95vw] object-contain rounded-2xl shadow-2xl"
        />
        <div className="absolute bottom-6 text-white/80 text-xs font-bold bg-black/50 px-3 py-1.5 rounded-full">
          画面タップで戻る
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-stone-900/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border-2 border-pink-200/90 overflow-hidden flex flex-col max-h-[92vh] animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-[#FFE5EC] via-[#FFF0F5] to-[#F3EAFF] px-4 py-3 border-b border-pink-200/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xl">🐻💕🐰</span>
            <div>
              <div className="text-xs font-black text-[#9E2A47] flex items-center gap-1">
                <span>ペアカレ</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/80 text-rose-500 font-bold">
                  お気に入りフォト📸
                </span>
              </div>
              <div className="text-[11px] text-stone-600 font-bold">
                {config.message || '今日も一日お疲れ様💕'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="p-1.5 rounded-full hover:bg-white/60 text-stone-600 transition-colors"
                title="写真や表示設定を変更"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-full hover:bg-white/60 text-stone-600 transition-colors"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* メイン写真エリア */}
        <div className="relative bg-stone-100 flex-1 min-h-[220px] max-h-[50vh] overflow-hidden flex items-center justify-center group">
          {displayPhotoUrl ? (
            <>
              <img
                src={displayPhotoUrl}
                alt="起動時お気に入り写真"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102 cursor-pointer"
                onClick={() => setIsFullscreen(true)}
              />
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-xl bg-black/60 hover:bg-black/80 text-white text-[11px] font-black flex items-center gap-1 backdrop-blur-xs shadow-md"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>拡大</span>
              </button>
            </>
          ) : (
            <div className="p-8 text-center text-stone-400 space-y-2">
              <Sparkles className="w-10 h-10 mx-auto text-pink-300 animate-pulse" />
              <p className="text-xs font-bold">お気に入りの写真がまだ設定されていません</p>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#FF8FAB] text-white text-xs font-black shadow-xs"
                >
                  設定画面で写真を登録する📸
                </button>
              )}
            </div>
          )}
        </div>

        {/* 今日の日付 ＆ 2人のシフトミニサマリー */}
        <div className="p-3.5 space-y-2.5 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-black text-stone-800 text-sm">
              <Calendar className="w-4 h-4 text-[#FF8FAB]" />
              <span>
                今日：{year}年{month}月{day}日({dayOfWeekStr})
              </span>
              {holidayName && <span className="text-xs text-rose-500 font-bold">（{holidayName}）</span>}
            </div>
            {isBothOff && (
              <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-[11px] font-black animate-bounce">
                💕 今日は2人ともお休み！
              </span>
            )}
          </div>

          <div className="flex items-stretch gap-2">
            {renderShiftBadge(partnerA.name, partnerA.avatar, activeShiftA, stampA, '#E2F9FC')}
            {renderShiftBadge(partnerB.name, partnerB.avatar, activeShiftB, stampB, '#F3EAFF')}
          </div>

          {/* フッター操作ボタン */}
          <div className="pt-1 flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-stone-500 font-bold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowToday}
                onChange={(e) => setDontShowToday(e.target.checked)}
                className="rounded border-stone-300 text-rose-500 focus:ring-rose-400 w-3.5 h-3.5"
              />
              <span>今日はもう表示しない</span>
            </label>

            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] hover:from-[#FF758F] hover:to-[#9E6EE6] text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Heart className="w-4 h-4 fill-white" />
              <span>カレンダーを開く</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
