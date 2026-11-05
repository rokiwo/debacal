import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Sparkles,
  Check,
} from 'lucide-react';
import { CalendarCategoryItem, CoupleMetadata } from '../types/calendar';
import {
  DEFAULT_CATEGORIES,
  EVENT_PATTERN_CATEGORIES,
  PASTEL_COLOR_PALETTE,
} from '../utils/presets';

interface CategoryManagerModalProps {
  categories: CalendarCategoryItem[];
  metadata: CoupleMetadata;
  onClose: () => void;
  onUpdateCategories: (nextCategories: CalendarCategoryItem[]) => void;
}

const QUICK_CATEGORY_TEMPLATES = [
  { label: 'バイト・副業', shortLabel: 'バイト', icon: '🏪', paletteIdx: 5 },
  { label: '記念日・特別日', shortLabel: '記念日', icon: '🎉', paletteIdx: 5 },
  { label: '家事・暮らし', shortLabel: '家事', icon: '🏠', paletteIdx: 6 },
  { label: '子ども・学校', shortLabel: '子ども', icon: '👶', paletteIdx: 2 },
  { label: '通院・健康', shortLabel: '通院', icon: '🏥', paletteIdx: 0 },
  { label: 'お出かけ・旅行', shortLabel: '旅行', icon: '✈️', paletteIdx: 3 },
  { label: '美容・サロン', shortLabel: '美容', icon: '💇‍♀️', paletteIdx: 1 },
  { label: '実家・家族', shortLabel: '実家', icon: '👵', paletteIdx: 7 },
  { label: 'お金・手続き', shortLabel: 'お金', icon: '💰', paletteIdx: 5 },
  { label: 'ペット', shortLabel: 'ペット', icon: '🐶', paletteIdx: 6 },
];

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  categories,
  metadata,
  onClose,
  onUpdateCategories,
}) => {
  const sorted = [...categories].sort((a, b) => a.order - b.order);

  const [newLabel, setNewLabel] = useState('');
  const [newIcon, setNewIcon] = useState('🎉');
  const [newPaletteIdx, setNewPaletteIdx] = useState(5);
  const [iconTabId, setIconTabId] = useState(EVENT_PATTERN_CATEGORIES[0].id);

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newLabel.trim();
    if (!clean) return;
    const pal = PASTEL_COLOR_PALETTE[newPaletteIdx] || PASTEL_COLOR_PALETTE[0];
    const created: CalendarCategoryItem = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: clean,
      shortLabel: clean.slice(0, 5),
      icon: newIcon,
      accentColor: pal.hex,
      bgColor: pal.bg,
      textColor: pal.text,
      borderColor: pal.border,
      order: sorted.length + 1,
    };
    onUpdateCategories([...sorted, created]);
    setNewLabel('');
  };

  const handleAddTemplate = (tpl: (typeof QUICK_CATEGORY_TEMPLATES)[number]) => {
    const pal = PASTEL_COLOR_PALETTE[tpl.paletteIdx] || PASTEL_COLOR_PALETTE[0];
    const created: CalendarCategoryItem = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: tpl.label,
      shortLabel: tpl.shortLabel,
      icon: tpl.icon,
      accentColor: pal.hex,
      bgColor: pal.bg,
      textColor: pal.text,
      borderColor: pal.border,
      order: sorted.length + 1,
    };
    onUpdateCategories([...sorted, created]);
  };

  const handleDelete = (id: string) => {
    if (sorted.length <= 1) return;
    const next = sorted
      .filter((c) => c.id !== id)
      .map((c, idx) => ({ ...c, order: idx + 1 }));
    onUpdateCategories(next);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sorted.length) return;
    const copy = [...sorted];
    const tmp = copy[idx];
    copy[idx] = copy[target];
    copy[target] = tmp;
    onUpdateCategories(copy.map((c, i) => ({ ...c, order: i + 1 })));
  };

  const handleResetDefaults = () => {
    const pA = metadata.partners.partnerA;
    const pB = metadata.partners.partnerB;
    const defaults: CalendarCategoryItem[] = [
      { ...DEFAULT_CATEGORIES[0] },
      {
        ...DEFAULT_CATEGORIES[1],
        icon: pA.avatar,
        label: `${pA.name}予定`,
        shortLabel: `${pA.name}予定`,
      },
      {
        ...DEFAULT_CATEGORIES[2],
        icon: pB.avatar,
        label: `${pB.name}予定`,
        shortLabel: `${pB.name}予定`,
      },
    ];
    onUpdateCategories(defaults);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        <div className="bg-white px-4 py-3.5 border-b border-[#FFE5EC] flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-stone-800">
              🗂️ カレンダー項目の追加・削除・整理
            </h2>
            <p className="text-[11px] text-stone-400">
              デフォルト（二人予定・夫予定・妻予定）に自由に追加・削除できます
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

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* 1. 新規項目追加フォーム */}
          <form
            onSubmit={handleAddCategory}
            className="bg-white rounded-2xl p-3.5 border-2 border-[#FFE5EC] space-y-3 shadow-2xs"
          >
            <div className="font-extrabold text-[#9E2A47] flex items-center gap-1">
              <Plus className="w-4 h-4 text-[#FF8FAB]" />
              <span>新しい予定項目（カテゴリ）を追加</span>
            </div>

            <div className="flex gap-2">
              <div className="w-11 h-10 rounded-xl bg-[#FFFBF7] border border-stone-200 flex items-center justify-center text-lg shrink-0">
                {newIcon}
              </div>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="項目名（例: バイト / 記念日 / 子ども）"
                className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-extrabold text-sm"
              />
            </div>

            {/* パターン別アイコン選択 */}
            <div className="space-y-1.5">
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {EVENT_PATTERN_CATEGORIES.map((grp) => (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => setIconTabId(grp.id)}
                    className={`px-2 py-1 rounded-xl text-[10px] font-extrabold whitespace-nowrap ${
                      iconTabId === grp.id
                        ? 'bg-[#FF8FAB] text-white'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {grp.tabLabel}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {(
                  EVENT_PATTERN_CATEGORIES.find((g) => g.id === iconTabId)?.icons ||
                  EVENT_PATTERN_CATEGORIES[0].icons
                ).map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setNewIcon(ic)}
                    className={`w-8 h-8 rounded-xl text-base shrink-0 flex items-center justify-center ${
                      newIcon === ic
                        ? 'bg-[#FFE5EC] ring-2 ring-[#FF8FAB]'
                        : 'bg-stone-50 hover:bg-stone-100 border border-stone-200/70'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* カラー選択 */}
            <div className="flex flex-wrap gap-1.5">
              {PASTEL_COLOR_PALETTE.map((pal, idx) => (
                <button
                  key={pal.name}
                  type="button"
                  onClick={() => setNewPaletteIdx(idx)}
                  style={{ backgroundColor: pal.bg, color: pal.text, borderColor: pal.hex }}
                  className={`px-2.5 py-1 rounded-xl font-extrabold border-2 flex items-center gap-1 ${
                    newPaletteIdx === idx ? 'scale-105 shadow-2xs' : 'opacity-80'
                  }`}
                >
                  <span>{pal.name}</span>
                  {newPaletteIdx === idx && <Check className="w-3 h-3" />}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={!newLabel.trim()}
              className="w-full py-2.5 rounded-2xl bg-[#FF8FAB] disabled:opacity-40 text-white font-extrabold shadow-xs flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>この予定項目を追加する</span>
            </button>

            {/* 1タップ追加テンプレート */}
            <div className="pt-2 border-t border-stone-100">
              <div className="text-[10px] font-bold text-stone-400 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#FF8FAB]" />
                <span>ワンタップで項目を追加：</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {QUICK_CATEGORY_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => handleAddTemplate(tpl)}
                    className="px-2.5 py-1 rounded-xl bg-stone-50 hover:bg-[#FFE5EC] border border-stone-200 text-[11px] font-bold text-stone-700"
                  >
                    ＋ {tpl.icon} {tpl.shortLabel}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {/* 2. 現在の予定項目一覧（並び替え・削除・初期値リセット） */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="font-extrabold text-stone-700">
                現在の予定項目 ({sorted.length}個)
              </span>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-[11px] font-bold text-stone-500 hover:text-[#9E2A47] flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>デフォルト3項目（二人・夫・妻）に戻す</span>
              </button>
            </div>

            {sorted.map((cat, idx) => (
              <div
                key={cat.id}
                className="bg-white rounded-2xl p-2.5 border border-stone-200/90 flex items-center justify-between gap-2 shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      backgroundColor: cat.bgColor,
                      color: cat.textColor,
                      borderColor: cat.accentColor,
                    }}
                    className="px-3 py-1 rounded-xl border-l-4 font-extrabold text-xs flex items-center gap-1"
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, -1)}
                    className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-30 text-stone-600"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === sorted.length - 1}
                    onClick={() => handleMove(idx, 1)}
                    className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-30 text-stone-600"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={sorted.length <= 1}
                    onClick={() => handleDelete(cat.id)}
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 disabled:opacity-30 text-rose-500"
                    title="この項目を削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
