import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Clock,
  Check,
  Sparkles,
  Heart,
} from 'lucide-react';
import { CoupleMetadata, PartnerId, StampPreset } from '../types/calendar';
import {
  DEFAULT_STAMP_PRESETS,
  SAYA_DEFAULT_STAMPS,
  getPartnerShiftStamps,
  PASTEL_COLOR_PALETTE,
  SHIFT_ICON_PATTERNS,
  SHIFT_TIME_PRESETS,
} from '../utils/presets';

interface ShiftStampManagerModalProps {
  stamps: StampPreset[];
  initialPartnerId?: PartnerId;
  metadata?: CoupleMetadata;
  onClose: () => void;
  onUpdateStamps: (nextStamps: StampPreset[]) => void;
}

const QUICK_SHIFT_TEMPLATES: {
  label: string;
  icon: string;
  startTime?: string;
  endTime?: string;
  isHoliday: boolean;
  paletteIndex: number;
}[] = [
  { label: '日勤', icon: '☀️', startTime: '09:00', endTime: '18:05', isHoliday: false, paletteIndex: 2 },
  { label: '休み', icon: '🏠', isHoliday: true, paletteIndex: 0 },
  { label: '年休', icon: '🌴', isHoliday: true, paletteIndex: 6 },
  { label: '当直', icon: '🏥', startTime: '17:00', endTime: '09:00', isHoliday: false, paletteIndex: 4 },
  { label: '午前半休', icon: '🌤️', startTime: '13:00', endTime: '17:30', isHoliday: false, paletteIndex: 0 },
  { label: '午後半休', icon: '🌆', startTime: '08:30', endTime: '12:30', isHoliday: false, paletteIndex: 5 },
  { label: '夜バイト', icon: '🏪', startTime: '18:00', endTime: '22:00', isHoliday: false, paletteIndex: 5 },
  { label: '昼バイト', icon: '☕', startTime: '10:00', endTime: '15:00', isHoliday: false, paletteIndex: 5 },
  { label: '休日出勤', icon: '💼', startTime: '09:00', endTime: '17:00', isHoliday: false, paletteIndex: 7 },
  { label: '在宅勤務', icon: '💻', startTime: '09:00', endTime: '18:00', isHoliday: false, paletteIndex: 6 },
  { label: '公休', icon: '🌸', isHoliday: true, paletteIndex: 1 },
  { label: '夜勤入り', icon: '🌙', startTime: '16:45', endTime: '23:59', isHoliday: false, paletteIndex: 3 },
  { label: '明け', icon: '🍵', startTime: '00:00', endTime: '09:45', isHoliday: false, paletteIndex: 4 },
];

export const ShiftStampManagerModal: React.FC<ShiftStampManagerModalProps> = ({
  stamps,
  initialPartnerId = 'partnerA',
  metadata,
  onClose,
  onUpdateStamps,
}) => {
  const [targetPartner, setTargetPartner] = useState<PartnerId>(initialPartnerId);

  const partnerAName = metadata?.partners.partnerA.name || 'ゆうと';
  const partnerAAvatar = metadata?.partners.partnerA.avatar || '🐻';
  const partnerBName = metadata?.partners.partnerB.name || 'さや';
  const partnerBAvatar = metadata?.partners.partnerB.avatar || '🐰';

  // 現在選択中のパートナーのシフトリスト
  const shiftStamps = getPartnerShiftStamps(stamps, targetPartner);
  // もう一方のパートナーのシフトリスト（保存時に維持する）
  const otherPartnerId: PartnerId = targetPartner === 'partnerA' ? 'partnerB' : 'partnerA';
  const otherPartnerStamps = getPartnerShiftStamps(stamps, otherPartnerId);

  const commitPartnerStamps = (nextForTarget: StampPreset[]) => {
    const normalizedTarget = nextForTarget.map((s, idx) => ({
      ...s,
      partnerId: targetPartner,
      order: idx + 1,
    }));
    const normalizedOther = otherPartnerStamps.map((s, idx) => ({
      ...s,
      partnerId: otherPartnerId,
      order: idx + 1,
    }));
    onUpdateStamps(
      targetPartner === 'partnerA'
        ? [...normalizedTarget, ...normalizedOther]
        : [...normalizedOther, ...normalizedTarget]
    );
  };

  // どのシフトカードを展開編集しているか（nullなら新規追加または閉じた状態）
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [iconCatIdx, setIconCatIdx] = useState<number>(0);

  // 新規追加フォーム状態
  const [newLabel, setNewLabel] = useState('');
  const [newIcon, setNewIcon] = useState('☀️');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('18:05');
  const [newHasTime, setNewHasTime] = useState(true);
  const [newPaletteIdx, setNewPaletteIdx] = useState(0);
  const [newIsHoliday, setNewIsHoliday] = useState(false);

  // 新規シフト追加
  const handleAddNewShift = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newLabel.trim();
    if (!clean) return;

    const pal = PASTEL_COLOR_PALETTE[newPaletteIdx] || PASTEL_COLOR_PALETTE[0];
    const created: StampPreset = {
      id: `shift_${targetPartner}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      partnerId: targetPartner,
      label: clean,
      shortLabel: clean.slice(0, 3),
      type: 'shift',
      color: pal.bg,
      textColor: pal.text,
      startTime: newHasTime && newStartTime ? newStartTime : undefined,
      endTime: newHasTime && newEndTime ? newEndTime : undefined,
      icon: newIcon,
      isHoliday: newIsHoliday,
      order: shiftStamps.length + 1,
    };

    commitPartnerStamps([...shiftStamps, created]);
    setNewLabel('');
  };

  // ワンタップテンプレートから即追加
  const handleAddFromTemplate = (tpl: (typeof QUICK_SHIFT_TEMPLATES)[number]) => {
    const pal = PASTEL_COLOR_PALETTE[tpl.paletteIndex] || PASTEL_COLOR_PALETTE[0];
    const created: StampPreset = {
      id: `shift_${targetPartner}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      partnerId: targetPartner,
      label: tpl.label,
      shortLabel: tpl.label.slice(0, 3),
      type: 'shift',
      color: pal.bg,
      textColor: pal.text,
      startTime: tpl.startTime,
      endTime: tpl.endTime,
      icon: tpl.icon,
      isHoliday: tpl.isHoliday,
      order: shiftStamps.length + 1,
    };
    commitPartnerStamps([...shiftStamps, created]);
  };

  // 既存スタンプのフィールドをインライン更新
  const handleUpdateOne = (id: string, patch: Partial<StampPreset>) => {
    const next = shiftStamps.map((s) => {
      if (s.id !== id) return s;
      const updated = { ...s, ...patch, partnerId: targetPartner };
      if (patch.label !== undefined) {
        updated.shortLabel = patch.label.slice(0, 3) || updated.shortLabel;
      }
      return updated;
    });
    commitPartnerStamps(next);
  };

  // 並び順変更
  const handleMoveOrder = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= shiftStamps.length) return;
    const cloned = [...shiftStamps];
    const temp = cloned[index];
    cloned[index] = cloned[targetIdx];
    cloned[targetIdx] = temp;
    commitPartnerStamps(cloned);
  };

  // 削除（妻のリストを空にできるよう0件まで削除可能）
  const handleDelete = (id: string) => {
    const filtered = shiftStamps.filter((s) => s.id !== id);
    commitPartnerStamps(filtered);
  };

  const currentPartnerName = targetPartner === 'partnerA' ? partnerAName : partnerBName;
  const currentPartnerAvatar = targetPartner === 'partnerA' ? partnerAAvatar : partnerBAvatar;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-4 py-3 border-b border-[#FFE5EC] space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-stone-800 flex items-center gap-1.5">
                <span>🎨</span>
                <span>勤務リスト（シフト種類）の登録・編集</span>
              </h2>
              <p className="text-[11px] text-stone-400">
                {partnerAAvatar}{partnerAName}用と{partnerBAvatar}{partnerBName}用で別々に勤務リストを管理できます
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-2xl bg-[#FF8FAB] text-white font-extrabold text-xs shadow-xs"
            >
              完了して閉じる
            </button>
          </div>

          {/* 🐻 夫の勤務リスト ⇔ 🐰 妻の勤務リスト 切替タブ */}
          <div className="grid grid-cols-2 gap-1.5 bg-[#FFFBF7] p-1 rounded-2xl border border-stone-200">
            <button
              type="button"
              onClick={() => {
                setTargetPartner('partnerA');
                setExpandedId(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                targetPartner === 'partnerA'
                  ? 'bg-[#56CFE1] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              <span>{partnerAAvatar}</span>
              <span>{partnerAName}の勤務リスト ({getPartnerShiftStamps(stamps, 'partnerA').length}種)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTargetPartner('partnerB');
                setExpandedId(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                targetPartner === 'partnerB'
                  ? 'bg-[#B388EB] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              <span>{partnerBAvatar}</span>
              <span>{partnerBName}の勤務リスト ({getPartnerShiftStamps(stamps, 'partnerB').length}種)</span>
            </button>
          </div>

          {/* プリセット一括反映ボタン */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] text-stone-500 font-bold">
              {targetPartner === 'partnerB' ? '🐰 さやの勤務表:' : '🐻 夫の勤務表:'}
            </span>
            {targetPartner === 'partnerB' ? (
              <button
                type="button"
                onClick={() => {
                  commitPartnerStamps(SAYA_DEFAULT_STAMPS);
                }}
                className="px-2.5 py-1 rounded-xl bg-[#F3EAFF] hover:bg-[#B388EB] text-[#59318F] hover:text-white font-extrabold text-[11px] transition-colors border border-purple-200 shadow-2xs"
                title="夜勤・夜L・明け・早出・準遅・日勤・遅出・研外・研内・合説・休み・有休をセット"
              >
                ✨ さやの10種勤務テンプレを一括反映
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const pAStamps = DEFAULT_STAMP_PRESETS.filter((s) => s.partnerId === 'partnerA');
                  commitPartnerStamps(pAStamps);
                }}
                className="px-2.5 py-1 rounded-xl bg-[#E2F9FC] hover:bg-[#56CFE1] text-[#136370] hover:text-white font-extrabold text-[11px] transition-colors border border-cyan-200 shadow-2xs"
                title="日勤・遅A・遅B・早A・早B・２早・夜勤・２夜・明け・準早・準遅・休み・年休をセット"
              >
                ✨ 夫の12種勤務テンプレを一括反映
              </button>
            )}
          </div>
        </div>

        {/* スクロールコンテンツ */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
          {/* 1. 新しいシフト種類をかんたん追加 */}
          <form
            onSubmit={handleAddNewShift}
            className="bg-white rounded-2xl p-3.5 border-2 border-[#FFE5EC] shadow-xs space-y-3"
          >
            <div className="text-xs font-extrabold text-[#9E2A47] flex items-center gap-1">
              <Plus className="w-4 h-4 text-[#FF8FAB]" />
              <span>
                {currentPartnerAvatar} {currentPartnerName}の新しいシフト種類を追加
              </span>
            </div>

            {/* 名前＆アイコン入力 */}
            <div className="flex gap-2">
              <div className="w-12 h-11 rounded-2xl bg-[#FFFBF7] border border-stone-200 flex items-center justify-center text-xl shrink-0">
                {newIcon}
              </div>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="シフト名を入力（例: 日勤A / 遅出 / 当直）"
                className="flex-1 px-3.5 py-2.5 rounded-2xl border border-stone-200 bg-[#FFFBF7] font-extrabold text-sm text-stone-800 focus:border-[#FF8FAB] focus:outline-none"
              />
            </div>

            {/* パターン別アイコンワンタップ選択 */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-stone-500">
                パターン別アイコンをタップで選択
              </div>
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {SHIFT_ICON_PATTERNS.map((grp, idx) => (
                  <button
                    key={grp.category}
                    type="button"
                    onClick={() => setIconCatIdx(idx)}
                    className={`px-2 py-1 rounded-xl text-[10px] font-extrabold whitespace-nowrap transition-all ${
                      iconCatIdx === idx
                        ? 'bg-[#FF8FAB] text-white'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {grp.category}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {(SHIFT_ICON_PATTERNS[iconCatIdx]?.icons || SHIFT_ICON_PATTERNS[0].icons).map(
                  (ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setNewIcon(ic)}
                      className={`w-8 h-8 rounded-xl text-base shrink-0 flex items-center justify-center transition-all ${
                        newIcon === ic
                          ? 'bg-[#FFE5EC] ring-2 ring-[#FF8FAB] scale-105'
                          : 'bg-stone-50 hover:bg-stone-100 border border-stone-200/70'
                      }`}
                    >
                      {ic}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* カラーワンタップ選択 */}
            <div>
              <div className="text-[11px] font-bold text-stone-500 mb-1">
                背景カラーをタップで選択
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PASTEL_COLOR_PALETTE.map((pal, idx) => (
                  <button
                    key={pal.name}
                    type="button"
                    onClick={() => setNewPaletteIdx(idx)}
                    style={{ backgroundColor: pal.bg, color: pal.text, borderColor: pal.hex }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold border-2 flex items-center gap-1 transition-all ${
                      newPaletteIdx === idx ? 'scale-105 shadow-xs ring-2 ring-stone-700/20' : 'opacity-80'
                    }`}
                  >
                    <span>{pal.name}</span>
                    {newPaletteIdx === idx && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            </div>

            {/* 時間プリセット＆時刻入力 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newHasTime}
                    onChange={(e) => setNewHasTime(e.target.checked)}
                    className="rounded text-[#FF8FAB]"
                  />
                  <span>勤務時間を設定する</span>
                </label>

                <label className="flex items-center gap-1.5 text-xs font-bold text-[#D63864] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsHoliday}
                    onChange={(e) => {
                      setNewIsHoliday(e.target.checked);
                      if (e.target.checked) setNewHasTime(false);
                    }}
                    className="rounded text-[#FF8FAB]"
                  />
                  <span>💕 お休み判定（休日一致対象）</span>
                </label>
              </div>

              {newHasTime && (
                <div className="space-y-1.5">
                  <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
                    {SHIFT_TIME_PRESETS.filter((p) => p.start).map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setNewStartTime(preset.start);
                          setNewEndTime(preset.end);
                        }}
                        className="px-2 py-1 rounded-lg bg-[#FFFBF7] hover:bg-[#FFE5EC] border border-stone-200 text-[10px] font-bold text-stone-600 shrink-0"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-xs"
                    />
                    <span className="text-xs font-bold text-stone-400">〜</span>
                    <input
                      type="time"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!newLabel.trim()}
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] disabled:opacity-40 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>このシフト種類を追加する</span>
            </button>

            {/* 1タップ追加テンプレート */}
            <div className="pt-2 border-t border-stone-100">
              <div className="text-[10px] font-bold text-stone-400 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#FF8FAB]" />
                <span>よく使われるシフトを1タップで追加：</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {QUICK_SHIFT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => handleAddFromTemplate(tpl)}
                    className="px-2.5 py-1 rounded-xl bg-stone-50 hover:bg-[#FFE5EC] border border-stone-200 text-[11px] font-bold text-stone-700 transition-colors"
                  >
                    ＋ {tpl.icon} {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {/* 2. 登録済みシフト一覧（タップでその場でかんたん編集） */}
          <div className="space-y-2">
            <div className="text-xs font-extrabold text-stone-700 px-1 flex flex-wrap items-center justify-between gap-2">
              <span>
                📋 {currentPartnerAvatar} {currentPartnerName}の勤務リスト ({shiftStamps.length}種類)
              </span>
              <div className="flex items-center gap-1.5">
                {targetPartner === 'partnerA' && (
                  <button
                    type="button"
                    onClick={() =>
                      commitPartnerStamps(
                        DEFAULT_STAMP_PRESETS.filter((s) => s.partnerId === 'partnerA')
                      )
                    }
                    className="px-2.5 py-1 rounded-xl bg-[#E2F9FC] hover:bg-[#56CFE1] text-[#136370] hover:text-white text-[10px] font-extrabold transition-colors"
                  >
                    🔄 夫の12種リストに戻す
                  </button>
                )}
                {shiftStamps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => commitPartnerStamps([])}
                    className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-extrabold transition-colors"
                  >
                    🗑️ リストを空にする
                  </button>
                )}
              </div>
            </div>

            {shiftStamps.length === 0 && (
              <div className="bg-white rounded-2xl p-5 border border-dashed border-stone-300 text-center space-y-1.5">
                <div className="text-sm font-extrabold text-stone-600">
                  {currentPartnerAvatar} {currentPartnerName}の勤務リストは現在「空」です
                </div>
                <p className="text-[11px] text-stone-400">
                  上の入力欄またはワンタップ追加ボタンから、いつでも{currentPartnerName}用のシフトを追加できます✨
                </p>
              </div>
            )}

            {shiftStamps.map((stamp, idx) => {
              const isExpanded = expandedId === stamp.id;
              return (
                <div
                  key={stamp.id}
                  className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                    isExpanded
                      ? 'border-2 border-[#FF8FAB] shadow-md'
                      : 'border-stone-200/90 shadow-2xs'
                  }`}
                >
                  {/* カード上部サマリー行 */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : stamp.id)}
                    className="p-2.5 sm:p-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-stone-50/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        style={{ backgroundColor: stamp.color, color: stamp.textColor }}
                        className="px-3 py-1.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-1 shadow-2xs shrink-0"
                      >
                        <span>{stamp.icon}</span>
                        <span>{stamp.label}</span>
                      </span>

                      <div className="min-w-0">
                        {stamp.startTime ? (
                          <span className="text-xs font-bold text-stone-600 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-stone-400" />
                            {stamp.startTime}〜{stamp.endTime}
                          </span>
                        ) : (
                          <span className="text-[11px] text-stone-400">時間指定なし</span>
                        )}
                        {stamp.isHoliday && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-[#D63864]">
                            <Heart className="w-2.5 h-2.5 fill-[#FF8FAB] text-[#FF8FAB]" />
                            お休み判定対象
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 並び替え＆編集ボタン */}
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveOrder(idx, -1)}
                        className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-30 text-stone-600"
                        title="上へ移動"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === shiftStamps.length - 1}
                        onClick={() => handleMoveOrder(idx, 1)}
                        className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-30 text-stone-600"
                        title="下へ移動"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : stamp.id)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-extrabold ${
                          isExpanded
                            ? 'bg-stone-800 text-white'
                            : 'bg-[#FFE5EC] text-[#9E2A47]'
                        }`}
                      >
                        {isExpanded ? '閉じる' : '編集'}
                      </button>
                    </div>
                  </div>

                  {/* インライン展開編集エリア */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-2 border-t border-stone-100 bg-[#FFFBF7]/60 space-y-3 text-xs">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-stone-500 mb-1">
                            アイコン
                          </label>
                          <input
                            type="text"
                            value={stamp.icon || ''}
                            onChange={(e) =>
                              handleUpdateOne(stamp.id, { icon: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-center text-base font-bold"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[11px] font-bold text-stone-500 mb-1">
                            シフト名
                          </label>
                          <input
                            type="text"
                            value={stamp.label}
                            onChange={(e) =>
                              handleUpdateOne(stamp.id, { label: e.target.value })
                            }
                            className="w-full px-3 py-1.5 rounded-xl border border-stone-200 bg-white font-extrabold text-sm"
                          />
                        </div>
                      </div>

                      {/* パターン別アイコンチップ選択 */}
                      <div className="space-y-1">
                        <div className="flex gap-1 overflow-x-auto pb-0.5">
                          {SHIFT_ICON_PATTERNS.map((grp, gIdx) => (
                            <button
                              key={grp.category}
                              type="button"
                              onClick={() => setIconCatIdx(gIdx)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold whitespace-nowrap ${
                                iconCatIdx === gIdx
                                  ? 'bg-[#FF8FAB] text-white'
                                  : 'bg-white border border-stone-200 text-stone-500'
                              }`}
                            >
                              {grp.category}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(
                            SHIFT_ICON_PATTERNS[iconCatIdx]?.icons ||
                            SHIFT_ICON_PATTERNS[0].icons
                          ).map((ic) => (
                            <button
                              key={ic}
                              type="button"
                              onClick={() => handleUpdateOne(stamp.id, { icon: ic })}
                              className={`w-7 h-7 rounded-lg text-sm shrink-0 ${
                                stamp.icon === ic
                                  ? 'bg-[#FFE5EC] ring-2 ring-[#FF8FAB]'
                                  : 'bg-white border border-stone-200'
                              }`}
                            >
                              {ic}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 勤務時間プリセット＆ピッカー */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-stone-500">
                          勤務時間（プリセットまたは直接指定）
                        </div>
                        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
                          {SHIFT_TIME_PRESETS.map((pr) => (
                            <button
                              key={pr.label}
                              type="button"
                              onClick={() =>
                                handleUpdateOne(stamp.id, {
                                  startTime: pr.start || undefined,
                                  endTime: pr.end || undefined,
                                })
                              }
                              className="px-2 py-1 rounded-lg bg-white hover:bg-[#FFE5EC] border border-stone-200 text-[10px] font-bold text-stone-600 shrink-0"
                            >
                              {pr.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={stamp.startTime || ''}
                            onChange={(e) =>
                              handleUpdateOne(stamp.id, {
                                startTime: e.target.value || undefined,
                              })
                            }
                            className="flex-1 px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white font-bold"
                          />
                          <span>〜</span>
                          <input
                            type="time"
                            value={stamp.endTime || ''}
                            onChange={(e) =>
                              handleUpdateOne(stamp.id, {
                                endTime: e.target.value || undefined,
                              })
                            }
                            className="flex-1 px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white font-bold"
                          />
                        </div>
                      </div>

                      {/* カラー変更 */}
                      <div className="flex flex-wrap gap-1.5">
                        {PASTEL_COLOR_PALETTE.map((pal) => (
                          <button
                            key={pal.name}
                            type="button"
                            onClick={() =>
                              handleUpdateOne(stamp.id, {
                                color: pal.bg,
                                textColor: pal.text,
                              })
                            }
                            style={{
                              backgroundColor: pal.bg,
                              color: pal.text,
                              borderColor: pal.hex,
                            }}
                            className="px-2 py-1 rounded-lg border font-extrabold text-[11px]"
                          >
                            {pal.name}
                          </button>
                        ))}
                      </div>

                      {/* 休日一致フラグ＆削除ボタン */}
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-1.5 font-bold text-[#9E2A47] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(stamp.isHoliday)}
                            onChange={(e) =>
                              handleUpdateOne(stamp.id, { isHoliday: e.target.checked })
                            }
                            className="rounded text-[#FF8FAB]"
                          />
                          <span>💕 ふたり休日一致の対象にする</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => handleDelete(stamp.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>削除</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
