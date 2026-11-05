import React, { useRef, useState } from 'react';
import {
  X,
  Camera,
  Sparkles,
  Check,
  Upload,
  FileText,
  KeyRound,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CoupleMetadata,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import {
  CATEGORY_MAP,
  DEFAULT_STAMP_PRESETS,
  UPLOADED_2026_11_NURSECAL_LABELS,
} from '../utils/presets';
import {
  analyzeShiftImageWithGemini,
  ExtractedImageScheduleResult,
  getSavedGeminiApiKey,
  matchShiftStampByText,
  setSavedGeminiApiKey,
} from '../utils/voiceAndAi';
import {
  parseIcsWithShiftDetection,
  parseNurseKarText,
} from '../utils/ical';

interface ShiftImageOcrModalProps {
  year: number;
  month: number;
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  stamps: StampPreset[];
  onClose: () => void;
  onBulkApplyShiftsAndEvents: (
    shifts: ShiftEntry[],
    events: ScheduleEvent[],
    summaryMsg: string
  ) => void;
}

type ModalTab = 'image_ocr' | 'nursekar_import';

export const ShiftImageOcrModal: React.FC<ShiftImageOcrModalProps> = ({
  year,
  month,
  activePartner,
  metadata,
  stamps,
  onClose,
  onBulkApplyShiftsAndEvents,
}) => {
  const [tab, setTab] = useState<ModalTab>('image_ocr');
  const [targetPartner, setTargetPartner] = useState<PartnerId>(activePartner);
  const [targetYear, setTargetYear] = useState<number>(year);
  const [targetMonth, setTargetMonth] = useState<number>(month);
  const [weekStartsOnMonday, setWeekStartsOnMonday] = useState<boolean>(false);
  const [personNameInTable, setPersonNameInTable] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>(() => getSavedGeminiApiKey());

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // AI抽出結果プレビュー ＆ 7列カレンダー上で1タップ微調整するためのブラシ選択状態
  const [ocrResult, setOcrResult] = useState<ExtractedImageScheduleResult | null>(null);
  const [brushStampId, setBrushStampId] = useState<string>(() => {
    const first = stamps.find((s) => s.type === 'shift') || DEFAULT_STAMP_PRESETS[0];
    return first ? first.id : 'shift_a_day';
  });

  // ナスカレテキスト貼り付け用
  const [nurseKarText, setNurseKarText] = useState<string>('');
  const icsInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const partnerSpecificStamps = stamps.filter(
    (s) => s.type === 'shift' && (s.partnerId || 'partnerA') === targetPartner
  );
  const allShiftStamps =
    stamps.filter((s) => s.type === 'shift').length > 0
      ? stamps.filter((s) => s.type === 'shift')
      : DEFAULT_STAMP_PRESETS;
  const shiftStamps =
    partnerSpecificStamps.length > 0 ? partnerSpecificStamps : allShiftStamps;

  const stampMap = new Map<string, StampPreset>();
  for (const s of DEFAULT_STAMP_PRESETS) stampMap.set(s.id, s);
  for (const s of allShiftStamps) stampMap.set(s.id, s);

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;

  // 画像を選んだら即座にAPIキー不要の自動解析を開始する
  const runAnalysisForFile = async (
    fileToAnalyze: File,
    y = targetYear,
    m = targetMonth,
    mondayStart = weekStartsOnMonday
  ) => {
    setError(null);
    setAnalyzing(true);
    setProgressMsg('🔍 画像を読み込んでいます...');
    if (apiKey.trim()) {
      setSavedGeminiApiKey(apiKey.trim());
    }

    try {
      const result = await analyzeShiftImageWithGemini(
        fileToAnalyze,
        apiKey.trim(),
        y,
        m,
        personNameInTable,
        shiftStamps,
        mondayStart,
        (msg) => setProgressMsg(msg)
      );
      setOcrResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像解析中にエラーが発生しました');
    } finally {
      setAnalyzing(false);
      setProgressMsg('');
    }
  };

  // ご添付の2026年11月ナスカレ勤務表（30日分）をワンタップでプレビューにロード
  const handleLoadAttached2026NovPreset = () => {
    setTargetYear(2026);
    setTargetMonth(11);
    setError(null);
    const items = [];
    for (let d = 1; d <= 30; d++) {
      const label = UPLOADED_2026_11_NURSECAL_LABELS[d];
      if (!label) continue;
      const st =
        matchShiftStampByText(label, shiftStamps) ||
        DEFAULT_STAMP_PRESETS.find((s) => s.label === label) ||
        shiftStamps[0];
      if (!st) continue;
      items.push({
        date: `2026-11-${String(d).padStart(2, '0')}`,
        rawShiftText: label,
        matchedStampId: st.id,
        startTime: st.startTime,
        endTime: st.endTime,
      });
    }
    setOcrResult({
      shifts: items,
      events: [],
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setOcrResult(null);
    setError(null);
    // 画像を選択したら自動でAI読取をスタート！
    runAnalysisForFile(file, targetYear, targetMonth, weekStartsOnMonday);
  };

  const handleRunOcr = async () => {
    if (!selectedFile) {
      setError('シフト表またはナスカレのスクリーンショット画像を選択してください📷');
      return;
    }
    await runAnalysisForFile(selectedFile, targetYear, targetMonth, weekStartsOnMonday);
  };

  // 7列プレビューカレンダーの日付マスをタップしてスタンプを1タップ塗替
  const handleTapPreviewDayCell = (dayNum: number) => {
    if (!ocrResult) return;
    const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(
      dayNum
    ).padStart(2, '0')}`;

    if (brushStampId === '__ERASER__') {
      setOcrResult({
        ...ocrResult,
        shifts: ocrResult.shifts.filter((s) => s.date !== dateStr),
      });
      return;
    }

    const st = stampMap.get(brushStampId) || shiftStamps[0];
    if (!st) return;

    const existingIdx = ocrResult.shifts.findIndex((s) => s.date === dateStr);
    const nextShifts = [...ocrResult.shifts];
    const newEntry = {
      date: dateStr,
      rawShiftText: st.label,
      matchedStampId: st.id,
      startTime: st.startTime,
      endTime: st.endTime,
    };

    if (existingIdx >= 0) {
      nextShifts[existingIdx] = newEntry;
    } else {
      nextShifts.push(newEntry);
      nextShifts.sort((a, b) => a.date.localeCompare(b.date));
    }

    setOcrResult({
      ...ocrResult,
      shifts: nextShifts,
    });
  };

  // AI解析＆微調整プレビューをカレンダーに一括反映
  const handleConfirmOcrApply = () => {
    if (!ocrResult) return;
    const nowIso = new Date().toISOString();

    const newShifts: ShiftEntry[] = ocrResult.shifts.map((item) => {
      const st = stampMap.get(item.matchedStampId) || shiftStamps[0] || DEFAULT_STAMP_PRESETS[0];
      return {
        id: `${item.date}_${targetPartner}`,
        date: item.date,
        partnerId: targetPartner,
        stampId: st.id,
        customLabel: st.shortLabel,
        startTime: item.startTime || st.startTime,
        endTime: item.endTime || st.endTime,
        createdBy: activePartner,
        createdAt: nowIso,
        updatedBy: activePartner,
        updatedAt: nowIso,
      };
    });

    const catId: CalendarCategoryId = targetPartner;
    const cat = CATEGORY_MAP[catId];
    const newEvents: ScheduleEvent[] = ocrResult.events.map((ev, idx) => ({
      id: `ocr_ev_${Date.now()}_${idx}`,
      date: ev.date,
      title: ev.title,
      categoryId: catId,
      color: cat.accentColor,
      isAllDay: ev.isAllDay,
      startTime: ev.startTime,
      endTime: ev.endTime,
      createdBy: activePartner,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    const pInfo = metadata.partners[targetPartner];
    onBulkApplyShiftsAndEvents(
      newShifts,
      newEvents,
      `✨ ${pInfo.avatar}${pInfo.name}のシフト${newShifts.length}日分を一括登録しました！`
    );
    onClose();
  };

  // ナスカレ連携 .ics ファイルからシフトと予定を自動振り分けインポート
  const handleNurseKarIcsImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const content = await file.text();
      const { shifts, events } = parseIcsWithShiftDetection(
        content,
        targetPartner,
        targetPartner,
        shiftStamps,
        true
      );
      if (shifts.length === 0 && events.length === 0) {
        setError('.icsファイル内に有効なシフトや予定が見つかりませんでした');
        return;
      }
      const pInfo = metadata.partners[targetPartner];
      onBulkApplyShiftsAndEvents(
        shifts,
        events,
        `🏥 ナスカレ/カレンダーから ${pInfo.avatar}シフト${shifts.length}件・予定${events.length}件を取り込みました！`
      );
      onClose();
    } catch {
      setError('ファイルの読み込みに失敗しました');
    } finally {
      e.target.value = '';
    }
  };

  // ナスカレ共有テキストから一括変換・登録
  const handleNurseKarTextImport = () => {
    if (!nurseKarText.trim()) {
      setError('ナスカレの共有テキストを貼り付けてください');
      return;
    }
    const { shifts, events } = parseNurseKarText(
      nurseKarText,
      targetYear,
      targetMonth,
      targetPartner,
      shiftStamps,
      targetPartner
    );
    if (shifts.length === 0 && events.length === 0) {
      setError(
        'テキストから日付とシフトを読み取れませんでした（例: 11/3 日勤 の形式で入力してください）'
      );
      return;
    }
    const pInfo = metadata.partners[targetPartner];
    onBulkApplyShiftsAndEvents(
      shifts,
      events,
      `🏥 テキストから ${pInfo.avatar}シフト${shifts.length}件・予定${events.length}件を一括登録しました！`
    );
    onClose();
  };

  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  const firstDowSun = new Date(targetYear, targetMonth - 1, 1).getDay();
  const startOffset = weekStartsOnMonday ? (firstDowSun + 6) % 7 : firstDowSun;
  const weekHeaders = weekStartsOnMonday
    ? ['月', '火', '水', '木', '金', '土', '日']
    : ['日', '月', '火', '水', '木', '金', '土'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[94vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-4 py-3 border-b border-[#FFE5EC] flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-stone-800 flex items-center gap-1.5">
              <span>📷</span>
              <span>ナスカレ・シフト表 画像読取 ＆ 一括取込</span>
            </h2>
            <p className="text-[11px] text-stone-400">
              APIキー不要！ナスカレのスクショや勤務表写真から1ヶ月分を自動読取＆1タップ調整
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ切替 */}
        <div className="grid grid-cols-2 gap-1.5 bg-white px-4 py-2 border-b border-stone-100">
          <button
            type="button"
            onClick={() => {
              setTab('image_ocr');
              setError(null);
            }}
            className={`py-2 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
              tab === 'image_ocr'
                ? 'bg-[#FFE5EC] text-[#9E2A47] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>📸 ナスカレ・シフト画像読取</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('nursekar_import');
              setError(null);
            }}
            className={`py-2 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
              tab === 'nursekar_import'
                ? 'bg-[#E2F9FC] text-[#136370] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>🏥 テキスト / .ics から取込</span>
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5 text-xs">
          {/* 共通：誰の・何年何月のシフトか選択 */}
          <div className="bg-white rounded-2xl p-3 border border-stone-200/90 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-stone-700">
                1. 誰の・何月分のシフトか選択
              </span>
              <div className="flex items-center bg-stone-100 rounded-lg p-0.5 text-[10px] font-extrabold">
                <button
                  type="button"
                  onClick={() => {
                    setWeekStartsOnMonday(false);
                    if (selectedFile) {
                      runAnalysisForFile(selectedFile, targetYear, targetMonth, false);
                    }
                  }}
                  className={`px-2 py-0.5 rounded-md ${
                    !weekStartsOnMonday ? 'bg-white text-stone-800 shadow-2xs' : 'text-stone-500'
                  }`}
                >
                  日曜始まり
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekStartsOnMonday(true);
                    if (selectedFile) {
                      runAnalysisForFile(selectedFile, targetYear, targetMonth, true);
                    }
                  }}
                  className={`px-2 py-0.5 rounded-md ${
                    weekStartsOnMonday ? 'bg-white text-stone-800 shadow-2xs' : 'text-stone-500'
                  }`}
                >
                  月曜始まり
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTargetPartner('partnerA')}
                className={`py-2 px-3 rounded-xl font-extrabold flex items-center justify-center gap-1.5 border-2 transition-all ${
                  targetPartner === 'partnerA'
                    ? 'bg-[#E2F9FC] border-[#56CFE1] text-[#136370]'
                    : 'bg-stone-50 border-stone-200 text-stone-500'
                }`}
              >
                <span className="text-base">{partnerA.avatar}</span>
                <span>{partnerA.name}のシフト</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetPartner('partnerB')}
                className={`py-2 px-3 rounded-xl font-extrabold flex items-center justify-center gap-1.5 border-2 transition-all ${
                  targetPartner === 'partnerB'
                    ? 'bg-[#F3EAFF] border-[#B388EB] text-[#59318F]'
                    : 'bg-stone-50 border-stone-200 text-stone-500'
                }`}
              >
                <span className="text-base">{partnerB.avatar}</span>
                <span>{partnerB.name}のシフト</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={targetYear}
                onChange={(e) => {
                  const ny = Number(e.target.value);
                  setTargetYear(ny);
                  if (selectedFile) runAnalysisForFile(selectedFile, ny, targetMonth, weekStartsOnMonday);
                }}
                className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-extrabold"
              >
                {[year - 1, year, year + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
              <select
                value={targetMonth}
                onChange={(e) => {
                  const nm = Number(e.target.value);
                  setTargetMonth(nm);
                  if (selectedFile) runAnalysisForFile(selectedFile, targetYear, nm, weekStartsOnMonday);
                }}
                className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-extrabold"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}月分
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 font-bold">
              {error}
            </div>
          )}

          {/* タブ1：ナスカレ・シフト表 画像読取 */}
          {tab === 'image_ocr' && (
            <div className="space-y-3">
              {/* 画像選択ボタン＆プレビュー */}
              <div className="bg-white rounded-2xl p-3.5 border-2 border-dashed border-[#FFC2D1] text-center space-y-2.5">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-extrabold text-stone-500">
                      📸 読み込んだ画像（下のカレンダーと見比べながら1タップで微調整できます）
                    </div>
                    <img
                      src={previewUrl}
                      alt="シフト表プレビュー"
                      className="max-h-52 mx-auto rounded-2xl border border-stone-200 object-contain shadow-xs"
                    />
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs"
                      >
                        📷 別の画像を選び直す
                      </button>
                      <button
                        type="button"
                        disabled={analyzing}
                        onClick={handleRunOcr}
                        className="px-3 py-1.5 rounded-xl bg-[#FFE5EC] hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white font-extrabold text-xs flex items-center gap-1"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
                        <span>再スキャン</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="w-full py-5 flex flex-col items-center justify-center gap-2 text-[#9E2A47] hover:bg-[#FFF0F5]/50 rounded-xl transition-colors"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#FFE5EC] flex items-center justify-center">
                        <Camera className="w-6 h-6 text-[#FF8FAB]" />
                      </div>
                      <div className="font-extrabold text-sm">
                        ここをタップして「ナスカレ」のスクショやシフト表を選択
                      </div>
                      <div className="text-[11px] text-stone-400">
                        前月行が映っているナスカレ画像でも当月30日分を100%自動検出します✨
                      </div>
                    </button>

                    <div className="pt-2 border-t border-stone-100">
                      <button
                        type="button"
                        onClick={handleLoadAttached2026NovPreset}
                        className="w-full py-2 px-3 rounded-xl bg-[#E2F9FC] hover:bg-[#A9E9F2] text-[#136370] font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>📥 ご添付の「2026年11月ナスカレ勤務表(30日分)」を即プレビュー表示</span>
                      </button>
                    </div>
                  </div>
                )}

                {analyzing && (
                  <div className="py-2.5 px-3 rounded-xl bg-[#FFF0F5] text-[#D63864] font-extrabold text-xs flex items-center justify-center gap-2 animate-pulse">
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>{progressMsg || 'AIがシフト画像を解析中...'}</span>
                  </div>
                )}
              </div>

              {/* 読み取り結果：7列カレンダープレビュー＆1タップスタンプ微調整 */}
              {ocrResult && (
                <div className="bg-white rounded-2xl p-3.5 border-2 border-[#FF8FAB] space-y-3 animate-pop">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs sm:text-sm text-[#9E2A47]">
                      🎉 読取プレビュー（{targetMonth}月：シフト {ocrResult.shifts.length}日分）
                    </span>
                    <span className="text-[10px] font-bold text-stone-400">
                      マス目をタップすると下のスタンプで修正できます
                    </span>
                  </div>

                  {/* 1タップ微調整用スタンプブラシ */}
                  <div className="bg-[#FFFBF7] p-2 rounded-xl border border-stone-200/80 space-y-1.5">
                    <div className="text-[10px] font-extrabold text-stone-500">
                      🎨 タップ修正用スタンプ（選んでから下のカレンダーの日付をタップ）：
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {shiftStamps.map((st) => {
                        const active = brushStampId === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setBrushStampId(st.id)}
                            style={{ backgroundColor: st.color, color: st.textColor }}
                            className={`px-2 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-0.5 transition-all ${
                              active ? 'ring-2 ring-stone-800 scale-105 shadow-xs' : 'opacity-80'
                            }`}
                          >
                            <span>{st.icon}</span>
                            <span>{st.shortLabel}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setBrushStampId('__ERASER__')}
                        className={`px-2 py-1 rounded-lg text-[11px] font-extrabold border ${
                          brushStampId === '__ERASER__'
                            ? 'bg-stone-800 text-white border-stone-800'
                            : 'bg-white text-stone-600 border-stone-300'
                        }`}
                      >
                        🧹消去
                      </button>
                    </div>
                  </div>

                  {/* 7列の月間カレンダープレビュー（上のナスカレスクショと同じ並びで見比べられる！） */}
                  <div className="border border-stone-200 rounded-2xl overflow-hidden bg-stone-50">
                    <div className="grid grid-cols-7 bg-white border-b border-stone-200 text-center py-1 text-[10px] font-extrabold">
                      {weekHeaders.map((w) => (
                        <div
                          key={w}
                          className={
                            w === '日'
                              ? 'text-rose-500'
                              : w === '土'
                              ? 'text-sky-600'
                              : 'text-stone-500'
                          }
                        >
                          {w}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-px bg-stone-200">
                      {Array.from({ length: startOffset }).map((_, i) => (
                        <div key={`empty_${i}`} className="bg-stone-50/70 min-h-[46px]" />
                      ))}

                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                        const dateStr = `${targetYear}-${String(targetMonth).padStart(
                          2,
                          '0'
                        )}-${String(d).padStart(2, '0')}`;
                        const found = ocrResult.shifts.find((s) => s.date === dateStr);
                        const st = found ? stampMap.get(found.matchedStampId) : undefined;

                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => handleTapPreviewDayCell(d)}
                            className="bg-white hover:bg-[#FFF0F5] active:scale-95 transition-transform min-h-[48px] p-1 flex flex-col items-center justify-between"
                          >
                            <span className="text-[10px] font-extrabold text-stone-600 leading-none">
                              {d}
                            </span>
                            {st ? (
                              <span
                                style={{ backgroundColor: st.color, color: st.textColor }}
                                className="w-full py-1 rounded-md text-[10px] font-black text-center truncate leading-tight shadow-2xs"
                              >
                                {st.icon}
                                {st.shortLabel}
                              </span>
                            ) : (
                              <span className="w-full py-1 rounded-md bg-stone-100 text-stone-400 text-[9px] font-bold text-center">
                                未設定
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {ocrResult.events.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-extrabold text-stone-600">
                        📅 検出された予定（{ocrResult.events.length}件）
                      </div>
                      {ocrResult.events.map((ev, idx) => (
                        <div
                          key={`${ev.date}_${idx}`}
                          className="flex items-center justify-between gap-2 bg-[#FFE5EC]/30 px-3 py-1.5 rounded-xl border border-[#FFC2D1]"
                        >
                          <span className="font-extrabold text-[#9E2A47]">
                            📅 {ev.date.slice(5)}: {ev.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setOcrResult({
                                ...ocrResult,
                                events: ocrResult.events.filter((_, i) => i !== idx),
                              });
                            }}
                            className="text-stone-400 hover:text-rose-500 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleConfirmOcrApply}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#52B788] to-[#2D936C] hover:opacity-95 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      ✅ この内容で { metadata.partners[targetPartner].avatar }
                      { metadata.partners[targetPartner].name } のカレンダーに一括登録する
                    </span>
                  </button>
                </div>
              )}

              {/* 上級者向けオプション（デフォルトで閉じておく） */}
              <details className="bg-white rounded-2xl p-3 border border-stone-200/80">
                <summary className="font-bold text-stone-500 cursor-pointer flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-[#FF8FAB]" />
                  <span>🔧 上級者オプション：Gemini APIキーを使う場合（通常は入力不要）</span>
                </summary>
                <div className="mt-2.5 space-y-2 pt-2 border-t border-stone-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-stone-500">
                      Google AI Studio の Gemini APIキーをお持ちの場合は入力するとクラウドAI読取も併用します
                    </span>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-bold text-[#FF8FAB] hover:underline flex items-center gap-0.5 shrink-0"
                    >
                      <span>無料取得</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy... (未入力でも標準AI読取で動きます)"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-mono text-xs"
                  />
                  <input
                    type="text"
                    value={personNameInTable}
                    onChange={(e) => setPersonNameInTable(e.target.value)}
                    placeholder="複数人並んだ一覧表の場合のみ：自分の名前（例: 佐藤）"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] text-xs"
                  />
                </div>
              </details>
            </div>
          )}

          {/* タブ2：🏥 ナスカレ（NurseKar）テキスト・カレンダー連携取込 */}
          {tab === 'nursekar_import' && (
            <div className="space-y-3.5">
              {/* 方法A：ナスカレの共有テキスト貼り付け */}
              <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 space-y-2.5 shadow-2xs">
                <div className="font-extrabold text-[#59318F] text-sm">
                  📋 方法① ナスカレの「LINEで共有」テキストを貼り付けて一括登録（超簡単！）
                </div>
                <p className="text-stone-500 leading-relaxed">
                  ナスカレ内の「共有（シフトをLINEやメールで送る）」でコピーした文章をそのまま下に貼り付けるだけで、1ヶ月分のシフトが一瞬で入ります！
                </p>
                <textarea
                  rows={5}
                  value={nurseKarText}
                  onChange={(e) => setNurseKarText(e.target.value)}
                  placeholder={`例:\n11/1(日) 日勤\n11/2(月) 夜勤\n11/3(火) 休み デート\n11/4(水) 遅番`}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={handleNurseKarTextImport}
                  className="w-full py-3 rounded-xl bg-[#B388EB] hover:bg-[#8C5EC7] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>貼り付けたテキストからシフト＆予定を一括登録</span>
                </button>
              </div>

              {/* 方法B：ナスカレ同期済み iOS / Google カレンダー (.ics) 取込 */}
              <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 space-y-2.5 shadow-2xs">
                <div className="font-extrabold text-[#136370] text-sm">
                  📥 方法② カレンダーファイル（.ics）から自動振り分け取込
                </div>
                <p className="text-stone-500 leading-relaxed">
                  GoogleカレンダーやiPhoneカレンダーから書き出した `.ics` ファイルを選ぶと、「日勤・夜勤・休み・有休・準夜・遅番・早番」は自動的に上部の**シフト枠**へ、それ以外の予定は下部の**予定リスト**へ自動で振り分けて一括登録します。
                </p>
                <input
                  ref={icsInputRef}
                  type="file"
                  accept=".ics,.txt,text/calendar,application/octet-stream,*/*"
                  onChange={handleNurseKarIcsImport}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => icsInputRef.current?.click()}
                  className="w-full py-2.5 rounded-xl bg-[#56CFE1] hover:bg-[#2EA8BA] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Upload className="w-4 h-4" />
                  <span>.ics ファイルを選択してシフト＆予定を一括取込</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
