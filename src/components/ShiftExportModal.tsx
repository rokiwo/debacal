import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  Share2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import {
  CalendarDataStore,
  PartnerId,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import {
  formatMinutesShort,
  getJapaneseHoliday,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
} from '../utils/presets';

export type ExportPartnerMode = 'partnerA' | 'partnerB' | 'both';

interface ShiftExportModalProps {
  year: number;
  month: number;
  store: CalendarDataStore;
  onClose: () => void;
  defaultMode?: ExportPartnerMode;
}

interface CalendarCellData {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  dayOfWeek: number;
  holidayName?: string | null;
}

// カレンダーグリッドセル生成
function buildMonthCells(year: number, month: number): CalendarCellData[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDayOfWeek = firstDay.getDay(); // 0: 日曜
  const totalDays = lastDay.getDate();

  const cells: CalendarCellData[] = [];

  // 前月末
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const dt = new Date(year, month - 2, d);
    const yStr = dt.getFullYear();
    const mStr = String(dt.getMonth() + 1).padStart(2, '0');
    const dStr = String(d).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: false,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }

  // 当月
  for (let d = 1; d <= totalDays; d++) {
    const dt = new Date(year, month - 1, d);
    const mStr = String(month).padStart(2, '0');
    const dStr = String(d).padStart(2, '0');
    const dateStr = `${year}-${mStr}-${dStr}`;
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: true,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }

  // 翌月初
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const dt = new Date(year, month, d);
    const yStr = dt.getFullYear();
    const mStr = String(dt.getMonth() + 1).padStart(2, '0');
    const dStr = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: false,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }

  return cells;
}

export const ShiftExportModal: React.FC<ShiftExportModalProps> = ({
  year: initialYear,
  month: initialMonth,
  store,
  onClose,
  defaultMode = 'partnerA',
}) => {
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [exportMode, setExportMode] = useState<ExportPartnerMode>(defaultMode);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const partnerA = store.metadata.partners.partnerA;
  const partnerB = store.metadata.partners.partnerB;

  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps) {
    stampMap.set(s.id, s);
  }

  // 前月・翌月切替
  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Canvas にナスカレ風の月間シフト表を高解像度で描画
  useEffect(() => {
    setIsGenerating(true);

    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;

    const cells = buildMonthCells(viewYear, viewMonth);
    const numRows = Math.ceil(cells.length / 7);

    // 高解像度（2倍スケール）
    const scale = 2;
    const width = 1050; // CSSピクセル相当
    const headerHeight = 120; // 年月ヘッダー
    const weekHeaderHeight = 44; // 曜日ヘッダー
    const cellWidth = Math.floor(width / 7);
    const cellHeight = exportMode === 'both' ? 180 : 160; // 2人並列時は少し高さを確保
    const gridHeight = numRows * cellHeight;
    const totalHeight = headerHeight + weekHeaderHeight + gridHeight;

    canvas.width = width * scale;
    canvas.height = totalHeight * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);

    // 1. 全体背景（白）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, totalHeight);

    // 2. 年月ヘッダー（添付画像と同じナスカレ風の爽やかなスカイブルー）
    ctx.fillStyle = '#82C0E8';
    ctx.fillRect(0, 0, width, headerHeight);

    // 年月テキスト
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 「2026年」
    ctx.font = '700 24px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(`${viewYear}年`, width / 2, 42);

    // 「11月」特大
    ctx.font = '900 44px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(`${viewMonth}月`, width / 2, 85);

    // 対象者バッジ（ヘッダー右側）
    ctx.textAlign = 'right';
    ctx.font = '800 18px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif';
    let targetLabel = '';
    if (exportMode === 'partnerA') {
      targetLabel = `${partnerA.avatar} ${partnerA.name}の勤務表`;
    } else if (exportMode === 'partnerB') {
      targetLabel = `${partnerB.avatar} ${partnerB.name}の勤務表`;
    } else {
      targetLabel = `💕 ${partnerA.name}・${partnerB.name} 夫婦シフト表`;
    }
    ctx.fillText(targetLabel, width - 24, 45);

    // 3. 曜日ヘッダー行（日 月 火 水 木 金 土）
    const weekBgY = headerHeight;
    ctx.fillStyle = '#82C0E8';
    ctx.fillRect(0, weekBgY, width, weekHeaderHeight);

    // 曜日区切り線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;

    const weekLabels = [
      { text: '日', color: '#E53935' }, // 赤
      { text: '月', color: '#FFFFFF' }, // 白
      { text: '火', color: '#FFFFFF' }, // 白
      { text: '水', color: '#FFFFFF' }, // 白
      { text: '木', color: '#FFFFFF' }, // 白
      { text: '金', color: '#FFFFFF' }, // 白
      { text: '土', color: '#0288D1' }, // 青
    ];

    ctx.font = '900 22px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (let c = 0; c < 7; c++) {
      const x = c * cellWidth + cellWidth / 2;
      const y = weekBgY + weekHeaderHeight / 2;
      ctx.fillStyle = weekLabels[c].color;
      ctx.fillText(weekLabels[c].text, x, y);
    }

    // 4. カレンダー各マスの描画
    const startGridY = headerHeight + weekHeaderHeight;

    cells.forEach((cell, idx) => {
      const col = idx % 7;
      const row = Math.floor(idx / 7);
      const x = col * cellWidth;
      const y = startGridY + row * cellHeight;

      // セル背景
      ctx.fillStyle = cell.isCurrentMonth ? '#FFFFFF' : '#FAFAFA';
      ctx.fillRect(x, y, cellWidth, cellHeight);

      // セル枠線
      ctx.strokeStyle = '#E0E0E0';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellWidth, cellHeight);

      // 日付の数字（左上）
      let numColor = '#212121';
      if (!cell.isCurrentMonth) {
        numColor = '#BDBDBD';
      } else if (cell.dayOfWeek === 0 || cell.holidayName) {
        numColor = '#D32F2F'; // 日曜・祝日は赤
      } else if (cell.dayOfWeek === 6) {
        numColor = '#1976D2'; // 土曜は青
      }

      ctx.fillStyle = numColor;
      ctx.font = '900 24px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(cell.dayNumber), x + 8, y + 8);

      // 祝日名（あれば日付横に小さく）
      if (cell.holidayName && cell.isCurrentMonth) {
        ctx.fillStyle = '#D32F2F';
        ctx.font = '700 10px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif';
        ctx.fillText(cell.holidayName.slice(0, 4), x + 42, y + 10);
      }

      // シフトデータの取得
      const sA = store.shifts[`${cell.dateStr}_partnerA`];
      const sB = store.shifts[`${cell.dateStr}_partnerB`];
      const actA = sA && !sA.deletedAt ? sA : undefined;
      const actB = sB && !sB.deletedAt ? sB : undefined;

      const stampA = actA ? stampMap.get(actA.stampId) : undefined;
      const stampB = actB ? stampMap.get(actB.stampId) : undefined;

      const labelA = actA?.customLabel || stampA?.shortLabel || stampA?.label || '';
      const labelB = actB?.customLabel || stampB?.shortLabel || stampB?.label || '';

      // ナスカレ風シフトカラーの決定ヘルパー
      const resolveShiftColor = (label: string, fallbackColor?: string): string => {
        if (/休|年休|有休|公休|冬休|夏休/.test(label)) return '#D32F2F'; // 鮮やかな赤
        if (/明|明け/.test(label)) return '#0288D1'; // 鮮やかな水色・青
        if (/夜|２夜|夜勤/.test(label)) return '#1565C0'; // 濃い青
        if (/早|早A|早B|２早/.test(label)) return '#26A69A'; // エメラルドグリーン・ミント
        if (/遅|遅A|遅B|準遅/.test(label)) return '#2E7D32'; // 濃い緑
        if (/日勤|日/.test(label)) return '#EF6C00'; // 鮮やかなオレンジ
        if (/準早|研修/.test(label)) return '#AB47BC'; // 鮮やかな紫・ピンク
        return fallbackColor || '#37474F';
      };

      // ──【モード1: ゆうとのみ または さやのみ】（シフト文字位置固定で波打ち解消＆夜バ・残業・休出を拡大表示）──
      if (exportMode === 'partnerA' || exportMode === 'partnerB') {
        const isPartnerA = exportMode === 'partnerA';
        const label = isPartnerA ? labelA : labelB;
        const stamp = isPartnerA ? stampA : stampB;
        const shift = isPartnerA ? actA : actB;

        if (label) {
          const shiftColor = resolveShiftColor(label, stamp?.textColor);
          const hasSub = Boolean(shift?.subCustomLabel || shift?.subStampId);
          const otMin = getShiftOvertimeMinutes(shift);
          const hwMin = getShiftHolidayWorkMinutes(shift);

          // シフトテキスト（波打ち防止：バイトや残業の有無に関係なくY座標を完全に固定！）
          ctx.fillStyle = shiftColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // 文字数に応じたフォントサイズ
          const fontSize = label.length <= 2 ? 40 : label.length <= 3 ? 33 : 26;
          ctx.font = `900 ${fontSize}px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif`;

          // メインシフト位置：常にマス目の高さ45%（y + 72）に水平一直線で固定！
          const shiftCenterY = y + 72;
          ctx.fillText(label, x + cellWidth / 2, shiftCenterY);

          // 勤務の「下」のエリア（y + 118）に夜勤バイト（夜バ）と残業・休日出勤を大きく記載
          const extraY = y + 120;
          const badges: { text: string; bg: string; color: string; width: number }[] = [];

          if (hasSub) {
            badges.push({
              text: '夜バ',
              bg: '#FFC107', // アンバー
              color: '#212121',
              width: 56,
            });
          }

          if (hwMin > 0) {
            // 休日出勤（オレンジ赤バッジではっきりと区別）
            badges.push({
              text: `休出${formatMinutesShort(hwMin)}`,
              bg: '#E65100', // 濃いオレンジ
              color: '#FFFFFF',
              width: 66,
            });
          } else if (otMin > 0) {
            // 通常残業（鮮やかな赤バッジ）
            badges.push({
              text: `残+${formatMinutesShort(otMin)}`,
              bg: '#D32F2F', // 赤
              color: '#FFFFFF',
              width: 66,
            });
          }

          if (badges.length === 1) {
            // 1つの場合：中央に大きく配置（フォント16px, 高さ26px）
            const b = badges[0];
            const badgeW = Math.max(b.width + 10, 68);
            const badgeH = 26;
            const bx = x + cellWidth / 2 - badgeW / 2;
            const by = extraY - badgeH / 2;

            ctx.fillStyle = b.bg;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(bx, by, badgeW, badgeH, 6) : ctx.rect(bx, by, badgeW, badgeH);
            ctx.fill();

            ctx.fillStyle = b.color;
            ctx.font = '900 16px "Zen Maru Gothic", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.text, x + cellWidth / 2, extraY);
          } else if (badges.length >= 2) {
            // 2つの場合：横並びに大きく配置（各フォント14px, 高さ24px）
            const badgeH = 24;
            const gap = 5;
            const totalW = badges[0].width + badges[1].width + gap;
            let currentX = x + cellWidth / 2 - totalW / 2;

            for (const b of badges) {
              const bx = currentX;
              const by = extraY - badgeH / 2;

              ctx.fillStyle = b.bg;
              ctx.beginPath();
              ctx.roundRect ? ctx.roundRect(bx, by, b.width, badgeH, 5) : ctx.rect(bx, by, b.width, badgeH);
              ctx.fill();

              ctx.fillStyle = b.color;
              ctx.font = '900 14px "Zen Maru Gothic", sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(b.text, bx + b.width / 2, extraY);

              currentX += b.width + gap;
            }
          }
        }
      }

      // ──【モード2: 2人両方】（上段にゆうと、下段にさやを波打ちゼロで固定配置！）──
      else {
        const hasA = Boolean(labelA);
        const hasB = Boolean(labelB);

        // 2人とも同じ休日の場合は仲良しハートマーク
        const bothHoliday =
          hasA &&
          hasB &&
          /休|年休|有休/.test(labelA) &&
          /休|年休|有休/.test(labelB);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 上段：ゆうと（位置固定で波打ち解消＆下段に残業・夜勤バイトを拡大配置）
        if (hasA) {
          const colorA = resolveShiftColor(labelA, stampA?.textColor);
          ctx.fillStyle = colorA;
          const fontSizeA = labelA.length <= 2 ? 28 : 22;
          ctx.font = `900 ${fontSizeA}px "Zen Maru Gothic", sans-serif`;

          // メインシフトY位置固定（波打ちゼロ）
          const yA = y + 52;
          ctx.fillText(`${labelA}`, x + cellWidth / 2 + 10, yA);

          // 左横に夫のアバターアイコン
          ctx.font = '700 15px sans-serif';
          ctx.fillStyle = '#56CFE1';
          ctx.fillText(partnerA.avatar, x + 18, yA);

          // 勤務の「下」に残業・休日出勤・夜勤バイトを配置
          const subA = Boolean(actA?.subCustomLabel || actA?.subStampId);
          const otMinA = getShiftOvertimeMinutes(actA);
          const hwMinA = getShiftHolidayWorkMinutes(actA);

          if (subA || otMinA > 0 || hwMinA > 0) {
            const subYA = yA + 23;
            const badges: { text: string; bg: string; color: string; width: number }[] = [];
            if (subA) badges.push({ text: '夜バ', bg: '#FFC107', color: '#212121', width: 38 });
            if (hwMinA > 0) badges.push({ text: `休出${formatMinutesShort(hwMinA)}`, bg: '#E65100', color: '#FFFFFF', width: 48 });
            else if (otMinA > 0) badges.push({ text: `残+${formatMinutesShort(otMinA)}`, bg: '#D32F2F', color: '#FFFFFF', width: 48 });

            const gap = 4;
            const totalW = badges.reduce((acc, b) => acc + b.width, 0) + (badges.length - 1) * gap;
            let currentX = x + cellWidth / 2 + 10 - totalW / 2;

            for (const b of badges) {
              const bHeight = 19;
              const bx = currentX;
              const by = subYA - bHeight / 2;

              ctx.fillStyle = b.bg;
              ctx.beginPath();
              ctx.roundRect ? ctx.roundRect(bx, by, b.width, bHeight, 4) : ctx.rect(bx, by, b.width, bHeight);
              ctx.fill();

              ctx.fillStyle = b.color;
              ctx.font = '900 12px "Zen Maru Gothic", sans-serif';
              ctx.fillText(b.text, bx + b.width / 2, subYA);

              currentX += b.width + gap;
            }
          }
        }

        // 下段：さや（位置固定で波打ち解消＆下段に残業・夜勤バイトを拡大配置）
        if (hasB) {
          const colorB = resolveShiftColor(labelB, stampB?.textColor);
          ctx.fillStyle = colorB;
          const fontSizeB = labelB.length <= 2 ? 28 : 22;
          ctx.font = `900 ${fontSizeB}px "Zen Maru Gothic", sans-serif`;

          // メインシフトY位置固定（波打ちゼロ）
          const yB = y + 120;
          ctx.fillText(`${labelB}`, x + cellWidth / 2 + 10, yB);

          // 左横に妻のアバターアイコン
          ctx.font = '700 15px sans-serif';
          ctx.fillStyle = '#B388EB';
          ctx.fillText(partnerB.avatar, x + 18, yB);

          // 勤務の「下」に残業・休日出勤・夜勤バイトを配置
          const subB = Boolean(actB?.subCustomLabel || actB?.subStampId);
          const otMinB = getShiftOvertimeMinutes(actB);
          const hwMinB = getShiftHolidayWorkMinutes(actB);

          if (subB || otMinB > 0 || hwMinB > 0) {
            const subYB = yB + 23;
            const badges: { text: string; bg: string; color: string; width: number }[] = [];
            if (subB) badges.push({ text: '夜バ', bg: '#FFC107', color: '#212121', width: 38 });
            if (hwMinB > 0) badges.push({ text: `休出${formatMinutesShort(hwMinB)}`, bg: '#E65100', color: '#FFFFFF', width: 48 });
            else if (otMinB > 0) badges.push({ text: `残+${formatMinutesShort(otMinB)}`, bg: '#D32F2F', color: '#FFFFFF', width: 48 });

            const gap = 4;
            const totalW = badges.reduce((acc, b) => acc + b.width, 0) + (badges.length - 1) * gap;
            let currentX = x + cellWidth / 2 + 10 - totalW / 2;

            for (const b of badges) {
              const bHeight = 19;
              const bx = currentX;
              const by = subYB - bHeight / 2;

              ctx.fillStyle = b.bg;
              ctx.beginPath();
              ctx.roundRect ? ctx.roundRect(bx, by, b.width, bHeight, 4) : ctx.rect(bx, by, b.width, bHeight);
              ctx.fill();

              ctx.fillStyle = b.color;
              ctx.font = '900 12px "Zen Maru Gothic", sans-serif';
              ctx.fillText(b.text, bx + b.width / 2, subYB);

              currentX += b.width + gap;
            }
          }
        }

        // 2人とも休みの時の記念ハート
        if (bothHoliday) {
          ctx.font = '700 14px sans-serif';
          ctx.fillStyle = '#E91E63';
          ctx.fillText('💕', x + cellWidth - 16, y + 14);
        }
      }
    });

    // 5. 下部クレジットフッター（控えめでおしゃれ）
    ctx.fillStyle = '#82C0E8';
    ctx.fillRect(0, totalHeight - 4, width, 4);

    // DataURLに変換
    try {
      const dataUrl = canvas.toDataURL('image/png');
      setImageDataUrl(dataUrl);
    } catch {
      // ignore
    } finally {
      setIsGenerating(false);
    }
  }, [exportMode, partnerA, partnerB, store, viewMonth, viewYear]);

  // ダウンロード実行
  const handleDownload = () => {
    if (!imageDataUrl) return;
    const a = document.createElement('a');
    const partnerName =
      exportMode === 'partnerA'
        ? partnerA.name
        : exportMode === 'partnerB'
        ? partnerB.name
        : '夫婦共有';
    a.download = `シフト表_${viewYear}年${viewMonth}月_${partnerName}.png`;
    a.href = imageDataUrl;
    a.click();
  };

  // Web Share API（スマホでLINEや写真アプリに保存）
  const handleShare = async () => {
    if (!imageDataUrl || !canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File(
          [blob],
          `シフト表_${viewYear}年${viewMonth}月.png`,
          { type: 'image/png' }
        );
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `シフト表 ${viewYear}年${viewMonth}月`,
          });
        } else {
          // 非対応なら通常ダウンロード
          handleDownload();
        }
      }, 'image/png');
    } catch {
      handleDownload();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[94vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-4 py-3 border-b border-[#FFE5EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E2F9FC] flex items-center justify-center text-[#126875]">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-stone-800 flex items-center gap-1.5">
                <span>📸 シフト表を写真として保存</span>
              </h2>
              <p className="text-[10px] text-stone-400">
                ナスカレ風にマス全体に大きくシフトを描画したPNG写真を生成します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コントロールバー：年月切替 ＆ 対象切替タブ（夫のみ / 妻のみ / 両方） */}
        <div className="p-3 bg-white border-b border-stone-100 space-y-2">
          {/* 1. 年月切替バー */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-xl bg-stone-100 hover:bg-[#FFE5EC] text-stone-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-black text-stone-800 px-2">
                {viewYear}年 {viewMonth}月
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-xl bg-stone-100 hover:bg-[#FFE5EC] text-stone-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-[11px] font-bold text-stone-400">
              ※予定は含めずシフトのみ出力
            </span>
          </div>

          {/* 2. 対象切替タブ（夫のみ / 妻のみ / 両方） */}
          <div className="grid grid-cols-3 gap-1 bg-[#FFFBF7] p-1 rounded-2xl border border-stone-200">
            <button
              type="button"
              onClick={() => setExportMode('partnerA')}
              className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 ${
                exportMode === 'partnerA'
                  ? 'bg-[#56CFE1] text-white shadow-sm scale-[1.02]'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              <span>{partnerA.avatar}</span>
              <span>{partnerA.name}のみ</span>
            </button>

            <button
              type="button"
              onClick={() => setExportMode('partnerB')}
              className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 ${
                exportMode === 'partnerB'
                  ? 'bg-[#B388EB] text-white shadow-sm scale-[1.02]'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              <span>{partnerB.avatar}</span>
              <span>{partnerB.name}のみ</span>
            </button>

            <button
              type="button"
              onClick={() => setExportMode('both')}
              className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 ${
                exportMode === 'both'
                  ? 'bg-[#FF8FAB] text-white shadow-sm scale-[1.02]'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              <span>💕</span>
              <span>2人両方並列</span>
            </button>
          </div>
        </div>

        {/* プレビュー表示エリア（スマホ画面でも縦スクロールで綺麗に全体を確認可能） */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col items-center justify-center bg-stone-100/70">
          {isGenerating ? (
            <div className="py-20 text-stone-500 font-bold flex flex-col items-center gap-2">
              <span className="animate-spin text-2xl">⏳</span>
              <span>高画質シフト画像を生成中...</span>
            </div>
          ) : imageDataUrl ? (
            <div className="w-full flex flex-col items-center space-y-2">
              <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-lg border border-stone-300 bg-white">
                <img
                  src={imageDataUrl}
                  alt="シフト表プレビュー"
                  className="w-full h-auto object-contain block"
                />
              </div>
              <p className="text-[11px] font-bold text-stone-500 text-center">
                💡 スマホでは上の画像を長押しして「写真に追加 / 画像を保存」もできます
              </p>
            </div>
          ) : (
            <div className="py-20 text-rose-500 font-bold">画像の生成に失敗しました</div>
          )}
        </div>

        {/* フッター操作アクション（PNGダウンロード / 共有） */}
        <div className="bg-white p-3 border-t border-[#FFE5EC] flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!imageDataUrl || isGenerating}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] disabled:opacity-40 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>📸 写真を保存する (PNG)</span>
          </button>

          {'share' in navigator && (
            <button
              type="button"
              onClick={handleShare}
              disabled={!imageDataUrl || isGenerating}
              className="py-3 px-4 rounded-2xl bg-[#E2F9FC] text-[#126875] font-black text-sm border border-[#A9E9F2] shadow-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all"
              title="LINEや他アプリに送る"
            >
              <Share2 className="w-4 h-4" />
              <span>共有</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
