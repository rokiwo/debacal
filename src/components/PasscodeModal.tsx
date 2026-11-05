import React, { useState } from 'react';
import { Lock, Heart, ShieldCheck, KeyRound, Eye, EyeOff, Sparkles } from 'lucide-react';

interface PasscodeModalProps {
  hasSavedPasscode: boolean;
  onUnlock: (password: string) => Promise<boolean>;
  onSetupPasscode: (password: string) => Promise<void>;
  onSkipForNow: () => void;
}

// 合言葉（パスワード）ロック解除＆初回設定モーダル
export const PasscodeModal: React.FC<PasscodeModalProps> = ({
  hasSavedPasscode,
  onUnlock,
  onSetupPasscode,
  onSkipForNow,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('ふたりの合言葉（パスワード）を入力してください');
      return;
    }

    setLoading(true);
    try {
      if (hasSavedPasscode) {
        const ok = await onUnlock(password.trim());
        if (!ok) {
          setError('合言葉が違います。もう一度ご確認ください🐾');
        }
      } else {
        if (password.trim().length < 4) {
          setError('合言葉は4文字以上で設定してください');
          setLoading(false);
          return;
        }
        if (confirmPassword && password.trim() !== confirmPassword.trim()) {
          setError('確認用の合言葉が一致しません');
          setLoading(false);
          return;
        }
        await onSetupPasscode(password.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#FFFBF7]/95 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border-2 border-[#FFE5EC] p-6 sm:p-8 animate-pop">
        {/* アイコン＆タイトル */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#FFE5EC] to-[#F3EAFF] flex items-center justify-center shadow-sm mb-3 border-2 border-white">
            <span className="text-3xl">🐻💕🐰</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFE5EC] text-[#9E2A47] text-xs font-bold mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            AES-GCM 256bit 暗号化保護
          </div>
          <h1 className="text-2xl font-extrabold text-stone-800 tracking-tight">
            ペアカレ <span className="text-[#FF8FAB] font-bold text-lg">PairCal</span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {hasSavedPasscode
              ? '夫婦の合言葉を入力してカレンダーを開きましょう'
              : 'ふたりの予定を守る「合言葉（パスワード）」を設定しましょう'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1.5 ml-1">
              🔑 ふたりの合言葉（パスワード）
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="例: futari2026 / 記念日など"
                autoFocus
                className="w-full px-4 py-3 pr-11 rounded-2xl border-2 border-stone-200 focus:border-[#FF8FAB] focus:outline-none text-stone-800 bg-[#FFFBF7] font-bold text-sm transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1"
                title="パスワード表示切替"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!hasSavedPasscode && (
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1.5 ml-1">
                🔑 合言葉の確認（任意・同じものを入力）
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="確認用（空欄でもそのまま登録可能）"
                className="w-full px-4 py-2.5 rounded-2xl border-2 border-stone-200 focus:border-[#FF8FAB] focus:outline-none text-stone-800 bg-[#FFFBF7] text-sm transition-colors"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white font-extrabold text-sm shadow-md hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            {hasSavedPasscode ? (
              <>
                <Lock className="w-4 h-4" />
                ロックを解除して開く
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                合言葉を設定してはじめる
              </>
            )}
          </button>

          {!hasSavedPasscode && (
            <button
              type="button"
              onClick={onSkipForNow}
              className="w-full py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FF8FAB]" />
              まずは合言葉なしで今すぐ試す（あとから設定可）
            </button>
          )}
        </form>

        <div className="mt-5 pt-4 border-t border-stone-100 text-[11px] text-stone-400 leading-relaxed flex items-start gap-2">
          <Heart className="w-4 h-4 text-[#FF8FAB] shrink-0 mt-0.5" />
          <span>
            合言葉はブラウザ内の Web Crypto API (PBKDF2 + AES-GCM) で暗号鍵に変換されます。GitHubクラウド同期時も平文データは外部に一切送信されません。
          </span>
        </div>
      </div>
    </div>
  );
};
