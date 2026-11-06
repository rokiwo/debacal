import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Mic,
  MicOff,
  Check,
  Sparkles,
  Calendar,
  Clock,
  Timer,
  User,
  RotateCcw,
  Undo2,
  MessageCircle,
  Copy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CalendarCategoryItem,
  CoupleMetadata,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
} from '../types/calendar';
import {
  DEFAULT_CATEGORIES,
  formatMinutesToJa,
  resolveCategoryInfo,
  SUPPORT_BADGE_PRESETS,
} from '../utils/presets';
import {
  aiFormatSpokenText,
  AiFormattedSpeechResult,
  parseSpokenScheduleText,
} from '../utils/voiceAndAi';

interface VoiceEventModalProps {
  selectedDate: string; // "YYYY-MM-DD"
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  categories?: CalendarCategoryItem[];
  onClose: () => void;
  onSaveEvent: (ev: ScheduleEvent) => void;
  onUpdateShiftDetails?: (
    dateStr: string,
    partnerId: PartnerId,
    patch: Partial<ShiftEntry>
  ) => void;
}

// ブラウザの SpeechRecognition 型宣言
interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export const VoiceEventModal: React.FC<VoiceEventModalProps> = ({
  selectedDate,
  activePartner,
  metadata,
  categories,
  onClose,
  onSaveEvent,
  onUpdateShiftDetails,
}) => {
  const categoryList =
    categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;
  const currentPartner = activePartner === 'partnerA' ? partnerA : partnerB;

  // 🎙️ 録音状態
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  // 📝 発話フレーズの累積管理（間が空いても消えない配列管理）
  const [confirmedPhrases, setConfirmedPhrases] = useState<string[]>([]);
  const [interimText, setInterimText] = useState<string>('');

  // 🧠 AIリアルタイム文脈整形結果
  const [aiResult, setAiResult] = useState<AiFormattedSpeechResult>(() =>
    aiFormatSpokenText('', selectedDate, activePartner, partnerA.name, partnerB.name)
  );

  // フォーム編集フィールド（AI解析結果で自動反映され、手動微調整も可能）
  const [dateStr, setDateStr] = useState(selectedDate);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<CalendarCategoryId>('shared');
  const [isAllDay, setIsAllDay] = useState(true);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [supportBadges, setSupportBadges] = useState<string[]>([]);

  // 残業・休日出勤
  const [targetPartner, setTargetPartner] = useState<PartnerId>(activePartner);
  const [overtimeMinutes, setOvertimeMinutes] = useState<number | null>(null);
  const [overtimeHours, setOvertimeHours] = useState<number | null>(null);
  const [overtimeStartTime, setOvertimeStartTime] = useState<string | null>(null);
  const [overtimeEndTime, setOvertimeEndTime] = useState<string | null>(null);
  const [holidayWorkMinutes, setHolidayWorkMinutes] = useState<number | null>(null);
  const [holidayWorkHours, setHolidayWorkHours] = useState<number | null>(null);
  const [applyToShift, setApplyToShift] = useState<boolean>(true);
  const [isTentative, setIsTentative] = useState<boolean>(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return selectedDate > todayStr; // 未来日なら初期値で仮予定
  });

  // 詳細設定アコーディオン
  const [showDetailFields, setShowDetailFields] = useState(false);
  const [copiedLineMsg, setCopiedLineMsg] = useState(false);

  // Refs（SpeechRecognitionの安全なライフサイクル制御）
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isRecordingActiveRef = useRef<boolean>(false);
  const confirmedPhrasesRef = useRef<string[]>([]);
  confirmedPhrasesRef.current = confirmedPhrases;

  // 時刻範囲から残業分数を再計算するヘルパー（1分単位）
  const handleRecalculateOvertime = (start: string, end: string) => {
    setOvertimeStartTime(start);
    setOvertimeEndTime(end);
    if (!start || !end) return;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return;
    let diff = eh * 60 + em - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // 日またぎ
    if (diff >= 0) {
      setOvertimeMinutes(diff);
      setOvertimeHours(Math.round((diff / 60) * 10) / 10);
    }
  };

  // 全発話テキストのリアルタイムAI整形＆フォーム連動
  const updateAiAndForm = (phrases: string[], interim: string) => {
    const fullText = [...phrases, interim].filter(Boolean).join(' ').trim();
    const result = aiFormatSpokenText(
      fullText,
      selectedDate,
      activePartner,
      partnerA.name,
      partnerB.name
    );
    setAiResult(result);

    if (fullText) {
      setDateStr(result.date);
      setTitle(result.title);
      setIsAllDay(result.parsed.isAllDay);
      if (result.parsed.startTime) setStartTime(result.parsed.startTime);
      if (result.parsed.endTime) setEndTime(result.parsed.endTime);
      if (result.parsed.categoryId) setCategoryId(result.parsed.categoryId);
      if (result.parsed.supportBadges.length > 0) {
        setSupportBadges(result.parsed.supportBadges);
      }
      // 残業・休出の排他制御（どちらか一方のみを保持し、もう片方は確実にクリア）
      if (result.parsed.holidayWorkMinutes !== undefined || result.parsed.holidayWorkHours !== undefined) {
        const hwMin =
          result.parsed.holidayWorkMinutes !== undefined
            ? result.parsed.holidayWorkMinutes
            : Math.round((result.parsed.holidayWorkHours || 0) * 60);
        setHolidayWorkMinutes(hwMin);
        setHolidayWorkHours(
          result.parsed.holidayWorkHours ?? Math.round((hwMin / 60) * 10) / 10
        );
        // 残業はクリア
        setOvertimeMinutes(null);
        setOvertimeHours(null);
        setOvertimeStartTime(null);
        setOvertimeEndTime(null);
      } else if (result.parsed.overtimeMinutes !== undefined || result.parsed.overtimeHours !== undefined) {
        const otMin =
          result.parsed.overtimeMinutes !== undefined
            ? result.parsed.overtimeMinutes
            : Math.round((result.parsed.overtimeHours || 0) * 60);
        setOvertimeMinutes(otMin);
        setOvertimeHours(
          result.parsed.overtimeHours ?? Math.round((otMin / 60) * 10) / 10
        );
        if (result.parsed.overtimeStartTime !== undefined) {
          setOvertimeStartTime(result.parsed.overtimeStartTime);
        }
        if (result.parsed.overtimeEndTime !== undefined) {
          setOvertimeEndTime(result.parsed.overtimeEndTime);
        }
        // 休出はクリア
        setHolidayWorkMinutes(null);
        setHolidayWorkHours(null);
      } else {
        // 残業・休出が指定されていない場合は両方クリア
        setOvertimeMinutes(null);
        setOvertimeHours(null);
        setOvertimeStartTime(null);
        setOvertimeEndTime(null);
        setHolidayWorkMinutes(null);
        setHolidayWorkHours(null);
      }
      if (result.parsed.targetPartner) {
        setTargetPartner(result.parsed.targetPartner);
      }
      if (result.parsed.isTentative) {
        setIsTentative(true);
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        if (result.date > todayStr) {
          setIsTentative(true);
        }
      }
    }
  };

  // マイク認識の完全停止
  const stopListening = () => {
    isRecordingActiveRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  };

  // 🎙️ 音声認識の起動（iOS Safariで確実に反応するクリーンなWeb Speech API起動）
  // ※ getUserMedia を同時に呼ぶとiOSでマイク排他ロック競合が起き無音になるため、純粋にSpeechRecognitionのみを起動！
  const startListening = () => {
    setSpeechError(null);
    isRecordingActiveRef.current = true;

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRec) {
      setSpeechError(
        'このブラウザでは直接マイク起動がサポートされていません。下のテキスト欄をタップしてスマホキーボード左下の「🎤」からお話しください✨'
      );
      isRecordingActiveRef.current = false;
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }

      const rec = new SpeechRec();
      rec.lang = 'ja-JP';
      rec.interimResults = true;
      // continuous はブラウザによって途中で切れることがあるため、自然に扱い、確定フレーズを累積保存する
      rec.continuous = true;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let newFinalChunk = '';
        let currentInterim = '';

        // Web Speech API 標準の resultIndex から差分のみを正しく抽出！
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const transcript = res[0]?.transcript || '';
          if (res.isFinal) {
            newFinalChunk += transcript + ' ';
          } else {
            currentInterim += transcript;
          }
        }

        const trimmedFinal = newFinalChunk.trim();
        if (trimmedFinal) {
          setConfirmedPhrases((prev) => {
            // 直前と完全に同じフレーズの二重コミット防止
            if (prev.length > 0 && prev[prev.length - 1] === trimmedFinal) {
              return prev;
            }
            const next = [...prev, trimmedFinal];
            updateAiAndForm(next, currentInterim);
            return next;
          });
        } else {
          updateAiAndForm(confirmedPhrasesRef.current, currentInterim);
        }

        setInterimText(currentInterim);
      };

      rec.onerror = (e: { error: string }) => {
        console.warn('SpeechRecognition error:', e.error);
        if (e.error === 'no-speech') {
          // 考える時間（沈黙）は正常な間なのでエラーにしない
          return;
        }
        if (e.error === 'not-allowed') {
          setSpeechError(
            'マイクの使用が拒否されました。iPhoneの「設定 > Safari > マイク」で「許可」にしてください🐾'
          );
          setIsListening(false);
          isRecordingActiveRef.current = false;
          return;
        }
        // その他のエラー時は安全に停止
        setIsListening(false);
        isRecordingActiveRef.current = false;
      };

      rec.onend = () => {
        setIsListening(false);
        isRecordingActiveRef.current = false;
      };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch (err) {
      console.error('SpeechRecognition start failed:', err);
      setIsListening(false);
      isRecordingActiveRef.current = false;
      setSpeechError('マイクの起動に失敗しました。もう一度マイクボタンを押してください🐾');
    }
  };

  // トグル
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // ⌫ 直前の発話を取り消す（Undo）
  const handleUndoLastPhrase = () => {
    setConfirmedPhrases((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      updateAiAndForm(next, interimText);
      return next;
    });
  };

  // 🔄 最初からやり直す（リセット）
  const handleRestart = () => {
    stopListening();
    setConfirmedPhrases([]);
    setInterimText('');
    setTitle('');
    setOvertimeMinutes(null);
    setOvertimeHours(null);
    setOvertimeStartTime(null);
    setOvertimeEndTime(null);
    setHolidayWorkMinutes(null);
    setHolidayWorkHours(null);
    setSupportBadges([]);
    setSpeechError(null);
    updateAiAndForm([], '');
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  // カレンダーへ保存
  const executeSave = (shouldOpenLine = false) => {
    stopListening();

    const hasOtOrHw =
      overtimeMinutes !== null ||
      overtimeHours !== null ||
      holidayWorkMinutes !== null ||
      holidayWorkHours !== null;

    const cleanTitle = title.trim();
    const isPureOvertime =
      hasOtOrHw && (!cleanTitle || /^(残業|残業申請|仕事|仕事残業)$/.test(cleanTitle));

    const finalTitle =
      cleanTitle ||
      aiResult.cleanSentence ||
      (overtimeMinutes
        ? `残業 +${overtimeMinutes}分`
        : overtimeHours
        ? `残業 +${Math.round(overtimeHours * 60)}分`
        : '');

    if (!finalTitle && !hasOtOrHw) return;

    const nowIso = new Date().toISOString();
    const cat = resolveCategoryInfo(categoryId, categoryList);

    // 1. シフト反映
    if (applyToShift && onUpdateShiftDetails && hasOtOrHw) {
      const otM =
        overtimeMinutes !== null
          ? overtimeMinutes
          : overtimeHours
          ? Math.round(overtimeHours * 60)
          : undefined;
      const hwM =
        holidayWorkMinutes !== null
          ? holidayWorkMinutes
          : holidayWorkHours
          ? Math.round(holidayWorkHours * 60)
          : undefined;

      if (hwM !== undefined && hwM > 0) {
        // 休日出勤として反映（通常残業はクリア）
        onUpdateShiftDetails(dateStr, targetPartner, {
          isHolidayWork: true,
          holidayWorkMinutes: hwM,
          holidayWorkHours: Math.round((hwM / 60) * 10) / 10,
          isTentativeHolidayWork: isTentative,
          isTentativeOvertime: false,
          overtimeMinutes: 0,
          overtimeHours: 0,
          overtimeStartTime: undefined,
          overtimeEndTime: undefined,
        });
      } else if (otM !== undefined && otM > 0) {
        // 通常残業として反映（休日出勤はクリア）
        onUpdateShiftDetails(dateStr, targetPartner, {
          isHolidayWork: false,
          holidayWorkMinutes: 0,
          holidayWorkHours: 0,
          isTentativeHolidayWork: false,
          isTentativeOvertime: isTentative,
          overtimeMinutes: otM,
          overtimeHours: Math.round((otM / 60) * 10) / 10,
          overtimeStartTime: overtimeStartTime ?? undefined,
          overtimeEndTime: overtimeEndTime ?? undefined,
        });
      }
    }

    // 2. カレンダー個別予定
    if (finalTitle && (!isPureOvertime || !applyToShift)) {
      const ev: ScheduleEvent = {
        id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: dateStr,
        title: finalTitle,
        categoryId,
        color: cat.accentColor,
        isAllDay,
        startTime: isAllDay ? undefined : startTime,
        endTime: isAllDay ? undefined : endTime,
        supportBadges: supportBadges.length > 0 ? supportBadges : undefined,
        isTentative,
        createdBy: activePartner,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      onSaveEvent(ev);
    }

    // もしLINE送信も希望ならLINEを即座に開く
    if (shouldOpenLine && aiResult.partnerLineMessage) {
      const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(aiResult.partnerLineMessage)}`;
      window.open(lineUrl, '_blank');
    }

    onClose();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    executeSave(false);
  };

  // サンプルフレーズを適用
  const handleApplySample = (sample: string) => {
    setConfirmedPhrases([sample]);
    setInterimText('');
    updateAiAndForm([sample], '');
  };

  const hasAnyText = confirmedPhrases.length > 0 || interimText.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 animate-fade-in"
      onClick={() => {
        stopListening();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[94vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-4 py-3 border-b border-[#FFE5EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] text-white shadow-xs">
              <Mic className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-black text-stone-800 flex items-center gap-1.5">
                <span>AI音声で予定＆残業入力</span>
                <span className="px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-700 text-[10px] font-black">
                  ✨リアルタイムAI変換
                </span>
              </h2>
              <p className="text-[10px] text-stone-400 font-bold">
                考えながら話しても大丈夫！途中で間が空いても消えません
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopListening();
              onClose();
            }}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
          {/* 1. マイク録音エリア ＆ 多重音声波紋アニメーション */}
          <div className="bg-white rounded-3xl p-4 border-2 border-[#FFE5EC] text-center space-y-3 shadow-xs relative overflow-hidden">
            {/* 録音中の背景発光エフェクト */}
            {isListening && (
              <div className="absolute inset-0 bg-rose-50/50 pointer-events-none animate-pulse" />
            )}

            <div className="relative flex flex-col items-center justify-center gap-2 py-1">
              {/* マイクボタン本体 ＆ 🎙️ 多重音声波紋アニメーション */}
              <div className="relative flex items-center justify-center">
                {/* 録音中の多重ピンク波紋エフェクト */}
                {isListening && (
                  <>
                    <span className="absolute w-32 h-32 rounded-full bg-rose-300 animate-ping opacity-25 pointer-events-none [animation-duration:2.2s]" />
                    <span className="absolute w-28 h-28 rounded-full border-2 border-rose-400 animate-ping opacity-40 pointer-events-none [animation-duration:1.5s]" />
                    <span className="absolute w-24 h-24 rounded-full bg-rose-400 animate-pulse opacity-30 pointer-events-none" />
                  </>
                )}

                <button
                  type="button"
                  onClick={toggleListening}
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all relative z-10 ${
                    isListening
                      ? 'bg-gradient-to-tr from-rose-500 to-rose-600 text-white ring-8 ring-rose-200 scale-105 shadow-rose-300/50'
                      : 'bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] text-white hover:scale-105 active:scale-95'
                  }`}
                  title={isListening ? 'タップして音声を止める' : 'タップして音声を始める'}
                >
                  {isListening ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
                </button>
              </div>

              {/* 録音ステータス表示 ＆ リアルタイム音声イコライザー波形 */}
              <div className="space-y-1.5 w-full max-w-sm pt-1">
                {isListening && (
                  <div className="flex items-center justify-center gap-1 h-5">
                    <span className="w-1 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.3s] h-3.5" />
                    <span className="w-1 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.15s] h-5" />
                    <span className="w-1.5 bg-rose-600 rounded-full animate-bounce [animation-delay:0s] h-6" />
                    <span className="w-1 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.2s] h-5" />
                    <span className="w-1 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.4s] h-3.5" />
                  </div>
                )}

                <div className="font-black text-sm text-stone-800">
                  {isListening ? (
                    <span className="text-rose-600 flex items-center justify-center gap-1.5 animate-pulse">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                      聞き取り中…（話し終わったら下のボタンを押してね）
                    </span>
                  ) : hasAnyText ? (
                    '✅ 音声を停止しました。内容を確認してください'
                  ) : (
                    '上のマイクを押して話してください🐾'
                  )}
                </div>

                {/* ユーザーが自分のタイミングで切れる「話し終わった」ボタン ＆ 録音中Undoボタン */}
                {isListening ? (
                  <div className="space-y-2 w-full pt-1">
                    <button
                      type="button"
                      onClick={stopListening}
                      className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-95 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 animate-bounce"
                    >
                      <span>⏹️</span>
                      <span>話し終わった（確定する）</span>
                    </button>

                    {/* 録音中（話している最中）でも言い直せるUndoボタン！ */}
                    {confirmedPhrases.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndoLastPhrase}
                        className="w-full py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all shadow-2xs"
                        title="直前に話したフレーズを取り消して言い直す"
                      >
                        <Undo2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>⌫ 直前の発話を消す（マイクを止めず言い直す）</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                    <button
                      type="button"
                      onClick={startListening}
                      className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white font-extrabold text-xs shadow-xs active:scale-95 flex items-center gap-1.5"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>{hasAnyText ? '🎙️ 続きを話す（追記）' : '🎙️ タップして話す'}</span>
                    </button>

                    {confirmedPhrases.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndoLastPhrase}
                        className="py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs active:scale-95 flex items-center gap-1"
                        title="最後に話したフレーズを取り消す"
                      >
                        <Undo2 className="w-3.5 h-3.5 text-stone-500" />
                        <span>⌫ 1つ取り消す</span>
                      </button>
                    )}

                    {hasAnyText && (
                      <button
                        type="button"
                        onClick={handleRestart}
                        className="py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs active:scale-95 flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
                        <span>最初からやり直す</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* エラーメッセージ */}
            {speechError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs text-left leading-relaxed">
                ⚠️ {speechError}
              </div>
            )}

            {/* 🎙️ 話した言葉（文字起こし履歴）表示欄 */}
            <div className="text-left space-y-1 pt-1">
              <div className="flex items-center justify-between text-[11px] text-stone-400 font-bold px-1">
                <span>🎙️ 認識された言葉（何秒間が空いても消えません）:</span>
                {confirmedPhrases.length > 0 && (
                  <span className="text-[#FF8FAB] font-black">{confirmedPhrases.length}個のフレーズ</span>
                )}
              </div>
              <div className="w-full min-h-[52px] p-2.5 rounded-2xl border-2 border-stone-200 bg-[#FFFBF7] font-bold text-xs text-stone-800 leading-relaxed max-h-28 overflow-y-auto">
                {confirmedPhrases.length === 0 && !interimText ? (
                  <span className="text-stone-300">
                    話した内容がここにリアルタイムで書き起こされます…
                  </span>
                ) : (
                  <div>
                    {confirmedPhrases.map((phrase, idx) => (
                      <span key={idx} className="inline-block mr-1 text-stone-800">
                        {phrase}
                      </span>
                    ))}
                    {interimText && (
                      <span className="text-rose-500 animate-pulse font-black">
                        {interimText}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 声かけサンプルフレーズ */}
            <div className="pt-1 space-y-1">
              <div className="text-[10px] text-stone-400 font-bold text-left px-1">
                💡 タップして試せるサンプルフレーズ:
              </div>
              <div className="flex flex-wrap gap-1 justify-start">
                {[
                  '11時から11時35分まで残業',
                  '明日19時から飲み会 夜ご飯不要',
                  '15日2時間残業 お風呂いらない',
                  'あさって午後休で送り迎え必要',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => handleApplySample(sample)}
                    className="px-2 py-1 rounded-xl bg-stone-100 hover:bg-[#FFE5EC] text-stone-600 hover:text-[#9E2A47] text-[10px] font-bold transition-all active:scale-95"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {/* iPhone設定ガイド（立ち上げ直してもずっと許可状態にするヒント） */}
            <details className="text-left bg-stone-50 rounded-2xl p-2 border border-stone-200/80 text-[11px] text-stone-600">
              <summary className="font-bold text-stone-600 cursor-pointer list-none flex items-center justify-between px-1">
                <span>💡 iPhoneで毎回許可を聞かれないようにするには？</span>
                <span className="text-[10px] text-stone-400">▼</span>
              </summary>
              <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-stone-500 font-medium px-1">
                <p>・ SafariのURL欄左側の「ぁあ（または設定マーク）」＞「Webサイトの設定」＞「マイク: 許可」に設定すると、次回アプリを立ち上げ直してもずっと許可が維持されます✨</p>
                <p>・ Safariの共有ボタンから「ホーム画面に追加」して起動した場合も、権限が永続保持されます。</p>
              </div>
            </details>
          </div>

          {/* 2. ✨ AIリアルタイムきれいな文章＆カレンダー自動解析カード */}
          <div className="bg-gradient-to-br from-white via-[#FFFBF7] to-[#FFF0F5] rounded-3xl p-4 border-2 border-[#FFC2D1] space-y-3 shadow-sm">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#FFE5EC]">
              <div className="font-black text-[#9E2A47] text-xs sm:text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#FF8FAB]" />
                <span>AI自動解析・きれいな文章プレビュー</span>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FFE5EC] text-[#9E2A47]">
                自動反映中
              </span>
            </div>

            {/* AIが整えた美しい日本語タイトル */}
            <div className="p-3 rounded-2xl bg-white border border-[#FFC2D1] shadow-2xs space-y-2">
              <div className="text-[10px] font-extrabold text-stone-400">
                ✨ 整形された予定タイトル
              </div>
              <div className="font-black text-sm sm:text-base text-stone-800 leading-snug">
                {aiResult.cleanSentence || '（話すと自動で文章が組み立てられます）'}
              </div>

              {/* 抽出されたタグ（日付・時間・残業・伝言） */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="px-2 py-0.5 rounded-lg bg-[#E2F9FC] text-[#136370] font-extrabold text-[11px] flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {aiResult.dateLabel}
                </span>

                <span className="px-2 py-0.5 rounded-lg bg-[#F3EAFF] text-[#59318F] font-extrabold text-[11px] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {aiResult.timeLabel}
                </span>

                {aiResult.overtimeText && (
                  <span className="px-2 py-0.5 rounded-lg bg-[#FFF6D6] text-[#8A5A00] font-extrabold text-[11px] flex items-center gap-1">
                    <Timer className="w-3 h-3 text-[#D49600]" />
                    {aiResult.overtimeText}
                  </span>
                )}

                {aiResult.holidayWorkText && (
                  <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 font-extrabold text-[11px] flex items-center gap-1">
                    🎌 {aiResult.holidayWorkText}
                  </span>
                )}

                {aiResult.supportBadgeLabels.map((badge, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-lg bg-[#FFF0F5] text-[#9E2A47] font-extrabold text-[11px]"
                  >
                    🏷️ {badge}
                  </span>
                ))}
              </div>
            </div>

            {/* 💬 パートナーへLINEで連絡するワンタップボタン */}
            {aiResult.partnerLineMessage && (
              <div className="p-3 rounded-2xl bg-white border border-emerald-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-emerald-800 text-[11px] flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>パートナーへのLINE連絡文（AI自動生成）</span>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(aiResult.partnerLineMessage);
                        setCopiedLineMsg(true);
                        setTimeout(() => setCopiedLineMsg(false), 2000);
                      } catch {
                        // ignore
                      }
                    }}
                    className="text-[10px] font-bold text-stone-500 hover:text-emerald-700 flex items-center gap-0.5"
                  >
                    {copiedLineMsg ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLineMsg ? 'コピー完了！' : '文面をコピー'}</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/60 text-emerald-900 font-bold text-[11px] whitespace-pre-line border border-emerald-100 leading-relaxed">
                  {aiResult.partnerLineMessage}
                </div>

                <a
                  href={`https://line.me/R/share?text=${encodeURIComponent(aiResult.partnerLineMessage)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b04b] active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>💬 この内容をLINEでパートナーに送る</span>
                </a>
              </div>
            )}
          </div>

          {/* 3. 詳細フィールド調整（開閉アコーディオン） */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => setShowDetailFields(!showDetailFields)}
              className="w-full px-4 py-3 flex items-center justify-between text-stone-700 font-extrabold text-xs hover:bg-stone-50 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <span>📝</span>
                <span>日付・時間・タイトルの微調整</span>
                <span className="text-[10px] text-stone-400 font-normal">
                  {showDetailFields ? '（閉じる）' : '（タップして手動で直す）'}
                </span>
              </span>
              {showDetailFields ? (
                <ChevronUp className="w-4 h-4 text-stone-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-stone-400" />
              )}
            </button>

            {showDetailFields && (
              <div className="p-4 pt-1 border-t border-stone-100 space-y-3">
                <div>
                  <label className="block font-bold text-stone-500 mb-1">タイトル</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="予定のタイトル"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-extrabold text-sm text-stone-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-stone-500 mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> 日付
                    </label>
                    <input
                      type="date"
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-extrabold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-stone-500 mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 時間区切り
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAllDay(!isAllDay)}
                      className={`w-full py-1.5 px-3 rounded-xl font-extrabold border ${
                        isAllDay
                          ? 'bg-[#FFE5EC] border-[#FF8FAB] text-[#9E2A47]'
                          : 'bg-[#E2F9FC] border-[#56CFE1] text-[#136370]'
                      }`}
                    >
                      {isAllDay ? '終日予定' : `${startTime} 〜 ${endTime}`}
                    </button>
                  </div>
                </div>

                {!isAllDay && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                    />
                    <span>〜</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                    />
                  </div>
                )}

                {/* カテゴリ */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {categoryList.map((cat) => {
                    const selected = categoryId === cat.id;
                    const label =
                      cat.id === 'partnerA'
                        ? `${partnerA.avatar}${partnerA.name}予定`
                        : cat.id === 'partnerB'
                        ? `${partnerB.avatar}${partnerB.name}予定`
                        : `${cat.icon}${cat.label}`;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryId(cat.id)}
                        style={
                          selected
                            ? { backgroundColor: cat.accentColor, color: '#fff' }
                            : { backgroundColor: cat.bgColor, color: cat.textColor }
                        }
                        className="px-2.5 py-1 rounded-xl font-extrabold text-xs transition-colors"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* サポートバッジ */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {SUPPORT_BADGE_PRESETS.slice(0, 5).map((b) => {
                    const active = supportBadges.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() =>
                          setSupportBadges(
                            active
                              ? supportBadges.filter((x) => x !== b.id)
                              : [...supportBadges, b.id]
                          )
                        }
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                          active
                            ? 'bg-[#FFF6D6] border-[#FFB703] text-[#8A5A00]'
                            : 'bg-stone-50 border-stone-200 text-stone-500'
                        }`}
                      >
                        {b.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 仮・見込み予定（その日の終わりに確認）トグル */}
          {(overtimeMinutes !== null || holidayWorkMinutes !== null || isTentative) && (
            <div className="p-2.5 rounded-xl bg-[#FFFBF7] border border-[#FFE28A] flex items-center justify-between gap-2 animate-fade-in">
              <div className="text-xs">
                <div className="font-black text-[#8A5A00] flex items-center gap-1">
                  <span>💡 仮・見込み予定として登録</span>
                  {isTentative && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                      仮予定
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-stone-500 font-bold">
                  その日が終わる時にアプリから実時間の確認カードが出ます🐾
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={isTentative}
                  onChange={(e) => setIsTentative(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>
          )}

          {/* 4. アクションボタン（カレンダー登録 ＆ LINEにも同時送信） */}
          <div className="space-y-2 pt-1">
            <button
              type="submit"
              disabled={
                !title.trim() &&
                !hasAnyText &&
                overtimeMinutes === null &&
                overtimeHours === null &&
                holidayWorkMinutes === null &&
                holidayWorkHours === null
              }
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] disabled:opacity-40 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>
                {overtimeMinutes !== null || overtimeHours !== null
                  ? `⏱️ ${currentPartner.name}の残業(+${overtimeMinutes ?? Math.round((overtimeHours || 0) * 60)}分)を登録`
                  : 'この内容でカレンダーに登録する✨'}
              </span>
            </button>

            {/* 💬 カレンダー登録 ＋ LINEにも同時送信ボタン */}
            {aiResult.partnerLineMessage && (
              <button
                type="button"
                onClick={() => executeSave(true)}
                className="w-full py-2.5 rounded-2xl bg-[#E6F7EF] hover:bg-[#d2f2e3] text-[#136370] border border-[#a2e3c4] font-black text-xs flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                <MessageCircle className="w-4 h-4 text-[#06C755]" />
                <span>カレンダーに登録して、続けてLINEでも伝える 💬</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
