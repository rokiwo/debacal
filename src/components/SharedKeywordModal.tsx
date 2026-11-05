import React, { useState } from 'react';
import { KeyRound, Sparkles, X, CheckCircle2, AlertCircle, Heart } from 'lucide-react';

interface SharedKeywordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitKeyword: (keyword: string) => Promise<{ success: boolean; message?: string }>;
  isSyncing?: boolean;
}

export const SharedKeywordModal: React.FC<SharedKeywordModalProps> = ({
  isOpen,
  onClose,
  onSubmitKeyword,
  isSyncing = false,
}) => {
  const [keyword, setKeyword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) {
      setErrorMsg('合言葉を入力してください。');
      return;
    }
    setErrorMsg(null);
    setLoading(true);

    try {
      const result = await onSubmitKeyword(keyword.trim());
      if (!result.success) {
        setErrorMsg(result.message || '合言葉が一致しませんでした。正しいキーワードを入力してください。');
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || '通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#FFFBF7] rounded-3xl shadow-2xl border-2 border-[#FFE5EC] overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-[#FF8FAB]/20 via-[#FFE5EC]/40 to-[#B388EB]/20 px-5 py-4 border-b border-[#FFE5EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-white text-[#D63864] shadow-xs">
              <KeyRound className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-stone-800 flex items-center gap-1.5">
                <span>ふたりの合言葉を入力</span>
                <Heart className="w-4 h-4 fill-[#FF8FAB] text-[#FF8FAB]" />
              </h3>
              <p className="text-[11px] text-stone-500 font-bold">
                キーワード入力でカレンダーを共有
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/80 hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 本文 */}
        <div className="p-5 space-y-4">
          <div className="bg-white p-3.5 rounded-2xl border border-stone-200/80 shadow-2xs space-y-1.5">
            <p className="text-xs text-stone-700 font-bold leading-relaxed">
              最初はこの端末のカレンダーは<span className="text-[#D63864] font-black">まっさらな状態</span>になっています🐾
            </p>
            <p className="text-xs text-stone-600 leading-relaxed">
              ふたりだけの<strong className="text-stone-800">特定の合言葉（キーワード）</strong>を入力すると、共有カレンダーに接続して予定やシフトが読み込まれます💕
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-stone-700 block">
                🗝️ 共有キーワード（合言葉）
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="例: ゆうとさや"
                autoFocus
                className="w-full px-4 py-3 rounded-2xl border-2 border-[#FFC2D1] bg-white font-black text-base text-stone-800 placeholder:text-stone-300 focus:border-[#FF8FAB] focus:outline-none shadow-inner"
              />
              <p className="text-[11px] text-stone-400 font-bold">
                💡 ひらがな・カタカナ・ローマ字のいずれでも照合されます
              </p>
            </div>

            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-start gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isSyncing}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#FF8FAB] via-[#FF758F] to-[#B388EB] hover:opacity-95 text-white text-sm font-black shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading || isSyncing ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin text-white" />
                  <span>共有カレンダーに接続中...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>✨ 共有カレンダーに接続する</span>
                </>
              )}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-stone-400 hover:text-stone-600 font-bold py-1 px-3 hover:underline"
              >
                あとで入力する（まっさらのまま使う）
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
