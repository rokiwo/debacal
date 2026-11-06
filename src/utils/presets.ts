// 初期シフトスタンプ・デフォルト予定項目（二人予定・夫予定・妻予定）・日本の祝日判定・サンプルデータ定義
import {
  CalendarCategoryId,
  CalendarCategoryItem,
  CalendarDataStore,
  CoupleMetadata,
  PartnerId,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';

export type CategoryInfo = CalendarCategoryItem;

// デフォルトのカレンダー予定項目（二人予定・夫予定・妻予定の3つを基本とし、自由に追加・削除可能）
export const DEFAULT_CATEGORIES: CalendarCategoryItem[] = [
  {
    id: 'shared',
    label: '二人予定',
    shortLabel: '二人予定',
    icon: '💕',
    accentColor: '#FF8FAB',
    bgColor: '#FFE5EC',
    textColor: '#9E2A47',
    borderColor: '#FFC2D1',
    order: 1,
  },
  {
    id: 'partnerA',
    label: 'ゆうと予定',
    shortLabel: 'ゆうと予定',
    icon: '🐻',
    accentColor: '#56CFE1',
    bgColor: '#E2F9FC',
    textColor: '#136370',
    borderColor: '#A9E9F2',
    order: 2,
  },
  {
    id: 'partnerB',
    label: '妻予定',
    shortLabel: '妻予定',
    icon: '🐰',
    accentColor: '#B388EB',
    bgColor: '#F3EAFF',
    textColor: '#59318F',
    borderColor: '#DEC9FC',
    order: 3,
  },
];

// 後方互換＆フォールバック用マップ
export const CATEGORY_MAP: Record<string, CalendarCategoryItem> = {
  shared: DEFAULT_CATEGORIES[0],
  partnerA: DEFAULT_CATEGORIES[1],
  partnerB: DEFAULT_CATEGORIES[2],
  anniversary: {
    id: 'anniversary',
    label: '記念日・特別日',
    shortLabel: '記念日',
    icon: '🎉',
    accentColor: '#FFB703',
    bgColor: '#FFF6D6',
    textColor: '#8A5A00',
    borderColor: '#FFE28A',
    order: 4,
  },
  chore: {
    id: 'chore',
    label: '家事・暮らし',
    shortLabel: '家事',
    icon: '🏠',
    accentColor: '#52B788',
    bgColor: '#E6F7EF',
    textColor: '#1E6645',
    borderColor: '#B2E6CE',
    order: 5,
  },
};

// カテゴリIDから安全にカテゴリ情報を取得するヘルパー
export function resolveCategoryInfo(
  categoryId: CalendarCategoryId,
  categories?: CalendarCategoryItem[],
  metadata?: CoupleMetadata
): CalendarCategoryItem {
  const list = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  const found = list.find((c) => c.id === categoryId) || CATEGORY_MAP[categoryId] || list[0] || DEFAULT_CATEGORIES[0];

  if (metadata) {
    if (found.id === 'partnerA') {
      return {
        ...found,
        icon: metadata.partners.partnerA.avatar,
        label: `${metadata.partners.partnerA.name}予定`,
        shortLabel: `${metadata.partners.partnerA.name}予定`,
      };
    }
    if (found.id === 'partnerB') {
      return {
        ...found,
        icon: metadata.partners.partnerB.avatar,
        label: `${metadata.partners.partnerB.name}予定`,
        shortLabel: `${metadata.partners.partnerB.name}予定`,
      };
    }
  }
  return found;
}

// すれ違いサポートアイコン（日付や予定に1タップで添えられる目印）
export const SUPPORT_BADGE_PRESETS: { id: string; label: string; short: string; desc: string }[] = [
  { id: '🍳夜ごはん不要', label: '🍳 夜ごはん不要', short: '🍳夕飯不要', desc: '飲み会や夜勤で夕食がいらない日' },
  { id: '🍱お弁当あり', label: '🍱 お弁当あり', short: '🍱お弁当', desc: 'お弁当を持参・準備する日' },
  { id: '🚗お迎えお願い', label: '🚗 お迎えお願い', short: '🚗お迎え', desc: '駅や職場へのお迎えリクエスト' },
  { id: '🍚夕飯おねがい', label: '🍚 夕飯おねがい', short: '🍚夕飯担当', desc: 'パートナーに夕食準備をお願い' },
  { id: '🛒買い物お願い', label: '🛒 買い物お願い', short: '🛒買い物', desc: '帰りに食材・日用品の買い物' },
  { id: '🧺洗濯お願い', label: '🧺 洗濯お願い', short: '🧺洗濯', desc: '洗濯物の取り込み・洗濯お願い' },
  { id: '🔑遅くなります', label: '🔑 遅くなります', short: '🔑帰宅遅め', desc: '残業やバイトで帰りが遅くなる目印' },
  { id: '👶送り迎え', label: '👶 送り迎え担当', short: '👶送迎', desc: '保育園や習い事の送迎目印' },
];

// 旧バージョンのデフォルトスタンプID（マイグレーションやマージ時に除外するため保持）
export const LEGACY_DEFAULT_STAMP_IDS = new Set([
  'shift_day',
  'shift_off',
  'shift_part',
  'shift_hol_work',
  'shift_night',
  'shift_semi_night',
  'shift_early',
  'shift_late',
  'shift_paid',
  'shift_ake',
  'shift_remote',
]);

// デフォルトのシフトスタンププリセット
// 🐻 夫（partnerA）：ご指定の12種類の勤務リストを初期登録済み
// 🐰 妻（partnerB）：ご要望により初期状態は空（[]）に設定（あとから自由に追加可能）
export const DEFAULT_STAMP_PRESETS: StampPreset[] = [
  {
    id: 'shift_a_day',
    partnerId: 'partnerA',
    label: '日勤',
    shortLabel: '日勤',
    type: 'shift',
    color: '#E2F9FC',
    textColor: '#126875',
    startTime: '09:00',
    endTime: '18:05',
    icon: '☀️',
    isHoliday: false,
    order: 1,
  },
  {
    id: 'shift_a_late_a',
    partnerId: 'partnerA',
    label: '遅A',
    shortLabel: '遅A',
    type: 'shift',
    color: '#FFF3D6',
    textColor: '#996300',
    startTime: '10:50',
    endTime: '20:05',
    icon: '🌆',
    isHoliday: false,
    order: 2,
  },
  {
    id: 'shift_a_late_b',
    partnerId: 'partnerA',
    label: '遅B',
    shortLabel: '遅B',
    type: 'shift',
    color: '#FFECE5',
    textColor: '#9C3D1C',
    startTime: '10:50',
    endTime: '20:05',
    icon: '🌇',
    isHoliday: false,
    order: 3,
  },
  {
    id: 'shift_a_early_a',
    partnerId: 'partnerA',
    label: '早A',
    shortLabel: '早A',
    type: 'shift',
    color: '#FFF6D6',
    textColor: '#8A5A00',
    startTime: '07:20',
    endTime: '16:35',
    icon: '🌅',
    isHoliday: false,
    order: 4,
  },
  {
    id: 'shift_a_early_b',
    partnerId: 'partnerA',
    label: '早B',
    shortLabel: '早B',
    type: 'shift',
    color: '#FEF3C7',
    textColor: '#92400E',
    startTime: '07:20',
    endTime: '16:35',
    icon: '🌄',
    isHoliday: false,
    order: 5,
  },
  {
    id: 'shift_a_2early',
    partnerId: 'partnerA',
    label: '２早',
    shortLabel: '２早',
    type: 'shift',
    color: '#D8F8EE',
    textColor: '#0F6E56',
    startTime: '07:20',
    endTime: '16:35',
    icon: '🌅',
    isHoliday: false,
    order: 6,
  },
  {
    id: 'shift_a_night',
    partnerId: 'partnerA',
    label: '夜勤',
    shortLabel: '夜勤',
    type: 'shift',
    color: '#E8E5FF',
    textColor: '#483D8B',
    startTime: '16:45',
    endTime: '23:59',
    icon: '🌙',
    isHoliday: false,
    order: 7,
  },
  {
    id: 'shift_a_2night',
    partnerId: 'partnerA',
    label: '２夜',
    shortLabel: '２夜',
    type: 'shift',
    color: '#F3EAFF',
    textColor: '#59318F',
    startTime: '16:45',
    endTime: '23:59',
    icon: '🌌',
    isHoliday: false,
    order: 8,
  },
  {
    id: 'shift_a_ake',
    partnerId: 'partnerA',
    label: '明け',
    shortLabel: '明け',
    type: 'shift',
    color: '#E0E7FF',
    textColor: '#3730A3',
    startTime: '00:00',
    endTime: '09:45',
    icon: '🍵',
    isHoliday: false,
    order: 9,
  },
  {
    id: 'shift_a_semi_early',
    partnerId: 'partnerA',
    label: '準早',
    shortLabel: '準早',
    type: 'shift',
    color: '#E6F7EF',
    textColor: '#1E6645',
    startTime: '07:50',
    endTime: '17:05',
    icon: '🌤️',
    isHoliday: false,
    order: 10,
  },
  {
    id: 'shift_a_semi_late',
    partnerId: 'partnerA',
    label: '準遅',
    shortLabel: '準遅',
    type: 'shift',
    color: '#EDE9FE',
    textColor: '#6D28D9',
    startTime: '09:50',
    endTime: '19:05',
    icon: '🌥️',
    isHoliday: false,
    order: 11,
  },
  {
    id: 'shift_a_off',
    partnerId: 'partnerA',
    label: '休み',
    shortLabel: '休み',
    type: 'shift',
    color: '#FFE5EC',
    textColor: '#D63864',
    icon: '🏠',
    isHoliday: true,
    order: 12,
  },
  {
    id: 'shift_a_paid',
    partnerId: 'partnerA',
    label: '年休',
    shortLabel: '年休',
    type: 'shift',
    color: '#D8F3DC',
    textColor: '#1B5E3A',
    icon: '🌴',
    isHoliday: true,
    order: 13,
  },
  // 🐰 さや（partnerB）専用シフト勤務プリセット（10種類＋休み・有休）
  {
    id: 'shift_b_night',
    partnerId: 'partnerB',
    label: '夜勤',
    shortLabel: '夜勤',
    type: 'shift',
    color: '#E8E5FF',
    textColor: '#483D8B',
    startTime: '17:00',
    endTime: '23:59',
    icon: '🌙',
    isHoliday: false,
    order: 1,
  },
  {
    id: 'shift_b_night_l',
    partnerId: 'partnerB',
    label: '夜L',
    shortLabel: '夜L',
    type: 'shift',
    color: '#EDE9FE',
    textColor: '#59318F',
    startTime: '17:00',
    endTime: '23:59',
    icon: '🌌',
    isHoliday: false,
    order: 2,
  },
  {
    id: 'shift_b_ake',
    partnerId: 'partnerB',
    label: '明け',
    shortLabel: '明け',
    type: 'shift',
    color: '#E0E7FF',
    textColor: '#3730A3',
    startTime: '00:00',
    endTime: '09:40',
    icon: '🍵',
    isHoliday: false,
    order: 3,
  },
  {
    id: 'shift_b_early',
    partnerId: 'partnerB',
    label: '早出',
    shortLabel: '早出',
    type: 'shift',
    color: '#FFF6D6',
    textColor: '#8A5A00',
    startTime: '07:10',
    endTime: '16:10',
    icon: '🌅',
    isHoliday: false,
    order: 4,
  },
  {
    id: 'shift_b_semi_late',
    partnerId: 'partnerB',
    label: '準遅',
    shortLabel: '準遅',
    type: 'shift',
    color: '#FFF0F5',
    textColor: '#9E2A47',
    startTime: '10:00',
    endTime: '19:00',
    icon: '🌥️',
    isHoliday: false,
    order: 5,
  },
  {
    id: 'shift_b_day',
    partnerId: 'partnerB',
    label: '日勤',
    shortLabel: '日勤',
    type: 'shift',
    color: '#E2F9FC',
    textColor: '#126875',
    startTime: '09:30',
    endTime: '18:30',
    icon: '☀️',
    isHoliday: false,
    order: 6,
  },
  {
    id: 'shift_b_late',
    partnerId: 'partnerB',
    label: '遅出',
    shortLabel: '遅出',
    type: 'shift',
    color: '#FFF3D6',
    textColor: '#996300',
    startTime: '11:00',
    endTime: '20:00',
    icon: '🌆',
    isHoliday: false,
    order: 7,
  },
  {
    id: 'shift_b_ken_gai',
    partnerId: 'partnerB',
    label: '研外',
    shortLabel: '研外',
    type: 'shift',
    color: '#E6F7EF',
    textColor: '#1E6645',
    startTime: '',
    endTime: '',
    icon: '📝',
    isHoliday: false,
    order: 8,
  },
  {
    id: 'shift_b_ken_nai',
    partnerId: 'partnerB',
    label: '研内',
    shortLabel: '研内',
    type: 'shift',
    color: '#F3EAFF',
    textColor: '#6638A6',
    startTime: '09:00',
    endTime: '18:00',
    icon: '🏢',
    isHoliday: false,
    order: 9,
  },
  {
    id: 'shift_b_gou_setsu',
    partnerId: 'partnerB',
    label: '合説',
    shortLabel: '合説',
    type: 'shift',
    color: '#FFE5EC',
    textColor: '#B8335A',
    startTime: '',
    endTime: '',
    icon: '🤝',
    isHoliday: false,
    order: 10,
  },
  {
    id: 'shift_b_off',
    partnerId: 'partnerB',
    label: '休み',
    shortLabel: '休み',
    type: 'shift',
    color: '#FFE5EC',
    textColor: '#D63864',
    icon: '🏠',
    isHoliday: true,
    order: 11,
  },
  {
    id: 'shift_b_paid',
    partnerId: 'partnerB',
    label: '有休',
    shortLabel: '有休',
    type: 'shift',
    color: '#D8F3DC',
    textColor: '#1B5E3A',
    icon: '🌴',
    isHoliday: true,
    order: 12,
  },
];

// さや（partnerB）のプリセットスタンプ抽出用定数
export const SAYA_DEFAULT_STAMPS: StampPreset[] = DEFAULT_STAMP_PRESETS.filter(
  (s) => s.partnerId === 'partnerB'
);

// パートナー別のシフトスタンプ一覧を取得（partnerId未設定の旧スタンプはpartnerA扱いにする）
export function getPartnerShiftStamps(
  stamps: StampPreset[],
  partnerId: PartnerId
): StampPreset[] {
  return stamps
    .filter((s) => s.type === 'shift' && (s.partnerId || 'partnerA') === partnerId)
    .sort((a, b) => a.order - b.order);
}

// パステルカラー選択肢（シフトスタンプ＆予定項目カラー用）
export const PASTEL_COLOR_PALETTE = [
  { name: 'さくらピンク', hex: '#FF8FAB', bg: '#FFE5EC', text: '#B8335A', border: '#FFC2D1' },
  { name: 'ベビーローズ', hex: '#FF6B8B', bg: '#FFF0F5', text: '#E05277', border: '#FFB3C6' },
  { name: 'ミントブルー', hex: '#56CFE1', bg: '#E2F9FC', text: '#126875', border: '#A9E9F2' },
  { name: 'ラベンダー', hex: '#B388EB', bg: '#F3EAFF', text: '#6638A6', border: '#DEC9FC' },
  { name: 'ナイトパープル', hex: '#7C83FD', bg: '#E8E5FF', text: '#483D8B', border: '#C5C8FF' },
  { name: 'ミモザイエロー', hex: '#FFB703', bg: '#FFF3D6', text: '#996300', border: '#FFE28A' },
  { name: 'セージグリーン', hex: '#52B788', bg: '#E6F7EF', text: '#1E6645', border: '#B2E6CE' },
  { name: 'ピーチコーラル', hex: '#FF9E7D', bg: '#FFECE5', text: '#9C3D1C', border: '#FFD0BF' },
];

// シフト用アイコン絵文字のクイック選択リスト（フラット互換用）
export const SHIFT_ICON_CHOICES = [
  '☀️', '🌙', '🌆', '🌅', '⏰', '🏠', '🌴', '🍵', '💻', '🏪',
  '💼', '🚄', '🏥', '🏢', '🩺', '🚑', '🍳', '✨', '💤', '🎉',
];

// パターン別・シフト用アイコン絵文字グループ
export const SHIFT_ICON_PATTERNS: {
  category: string;
  icons: string[];
}[] = [
  {
    category: '☀️ 時間帯・基本シフト',
    icons: ['☀️', '🌤️', '🌅', '🌆', '🌙', '🌌', '⏰', '⏱️', '🍵', '💤', '🛌', '🔥', '⚡', '🌈'],
  },
  {
    category: '🏥 医療・オフィス・現場',
    icons: ['🏥', '🩺', '💉', '🚑', '💊', '🏢', '💻', '💼', '📊', '📝', '📞', '✈️', '🚄', '🚗'],
  },
  {
    category: '🏪 バイト・副業・店舗',
    icons: ['🏪', '☕', '🍽️', '🍔', '🍰', '🛒', '📦', '🚚', '🛵', '🍳', '🍺', '💇‍♀️', '📚', '🎵'],
  },
  {
    category: '🌴 休日・休暇・暮らし',
    icons: ['🏠', '🌴', '🌸', '🌻', '🍁', '⛄', '🎉', '🎂', '👶', '🏫', '🐶', '🐱', '💕', '✨'],
  },
];

// カレンダー予定追加時の「パターン別アイコン＆ワンタップ予定プリセット」
export interface EventPatternPresetItem {
  icon: string;
  label: string;       // ボタン表示名
  title: string;       // 自動入力される予定タイトル
  startTime?: string;  // 推奨開始時間
  endTime?: string;    // 推奨終了時間
  supportBadge?: string;
}

export interface EventPatternCategory {
  id: string;
  tabLabel: string;
  items: EventPatternPresetItem[];
  icons: string[];     // アイコンだけ選びたい時用の絵文字一覧
}

export const EVENT_PATTERN_CATEGORIES: EventPatternCategory[] = [
  {
    id: 'date_out',
    tabLabel: '💖 デート・お出かけ',
    icons: [
      '💖', '💕', '💑', '👩‍❤️‍👨', '💍', '💐', '🎂', '🎉', '🎁', '🎬',
      '🍿', '🚗', '🚙', '✈️', '🏖️', '🎡', '🎢', '🗼', '🎪', '🏕️',
      '♨️', '🏨', '🛍️', '💄', '👗', '✨', '⭐', '🎆', '🎇', '🌃',
      '📸', '💌', '🧸', '🎈', '🥰', '😍',
    ],
    items: [],
  },
  {
    id: 'food_cafe',
    tabLabel: '🍽️ 食事・カフェ',
    icons: [
      '🍽️', '☕', '🍰', '🍣', '🥩', '🍖', '🍔', '🍕', '🍜', '🍲',
      '🥟', '🍛', '🍱', '🍙', '🥪', '🥞', '🍩', '🍦', '🍨', '🍮',
      '🍻', '🍺', '🍷', '🥂', '🍶', '🍸', '🍹', '🧋', '🍵', '🍎',
      '🍓', '🍇', '🍒', '🍳', '🥖', '🥨',
    ],
    items: [],
  },
  {
    id: 'chore_life',
    tabLabel: '🏠 暮らし・家事',
    icons: [
      '🏠', '🏡', '🛒', '📦', '🗑️', '🧹', '🧺', '🧼', '🧽', '🍚',
      '🍳', '🍱', '🏦', '💰', '💳', '🔧', '🔨', '📮', '💡', '🛋️',
      '🪴', '🌿', '🚿', '🛁', '🔑', '🚗', '⛽', '💴', '🧾', '📱',
      '💻', '🔌', '📦', '⏰', '🛏️', '✨',
    ],
    items: [],
  },
  {
    id: 'medical_beauty',
    tabLabel: '🏥 通院・美容・健康',
    icons: [
      '🏥', '🦷', '💇‍♀️', '💇‍♂️', '💅', '💆‍♀️', '💆‍♂️', '🏋️', '🧘‍♀️', '🏃',
      '💉', '💊', '🩺', '👓', '🧖‍♀️', '🧖‍♂️', '🧴', '💄', '🌿', '🌱',
      '🍎', '🥗', '🩹', '🌡️', '🛌', '💤', '🍵', '🕊️', '🌸', '✨',
    ],
    items: [],
  },
  {
    id: 'work_sub',
    tabLabel: '💼 仕事・バイト・予定',
    icons: [
      '💼', '🏢', '💻', '🏪', '⏱️', '📝', '📊', '📅', '📞', '📠',
      '✈️', '🚄', '🚆', '🚗', '🚕', '🤝', '🎓', '📚', '✏️', '📌',
      '🔥', '⚡', '🌙', '🌌', '☀️', '☕', '👨‍💻', '👩‍💻', '🏷️', '📢',
    ],
    items: [],
  },
  {
    id: 'family_pet',
    tabLabel: '🐶 家族・ペット・趣味',
    icons: [
      '🐶', '🐱', '🐾', '🐰', '🐻', '🐹', '🐥', '🦜', '🐠', '👵',
      '👴', '👶', '👧', '👦', '🏫', '🎒', '🎮', '🎵', '🎸', '🎹',
      '🎨', '⚽', '⚾', '🎾', '🏸', '🏊', '🚴', '⛺', '🎣', '⛳',
    ],
    items: [],
  },
];

// シフト時間のワンタッププリセット
export const SHIFT_TIME_PRESETS = [
  { label: '時間なし（休日等）', start: '', end: '' },
  { label: '08:30〜17:30 (日勤)', start: '08:30', end: '17:30' },
  { label: '09:00〜18:00 (定時)', start: '09:00', end: '18:00' },
  { label: '21:00〜23:59 (夜勤バイト)', start: '21:00', end: '23:59' },
  { label: '16:30〜09:00 (夜勤)', start: '16:30', end: '09:00' },
  { label: '07:00〜16:00 (早番)', start: '07:00', end: '16:00' },
  { label: '11:00〜20:00 (遅番)', start: '11:00', end: '20:00' },
];

// 日本の祝日リスト（2025〜2028年主要祝日＋固定祝日フォールバック）
const FIXED_HOLIDAYS: Record<string, string> = {
  // 2025年
  '2025-01-01': '元日',
  '2025-01-13': '成人の日',
  '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日',
  '2025-02-24': '振替休日',
  '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日',
  '2025-05-03': '憲法記念日',
  '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日',
  '2025-05-06': '振替休日',
  '2025-07-21': '海の日',
  '2025-08-11': '山の日',
  '2025-09-15': '敬老の日',
  '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日',
  '2025-11-03': '文化の日',
  '2025-11-23': '勤労感謝の日',
  '2025-11-24': '振替休日',
  // 2026年
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
  // 2027年
  '2027-01-01': '元日',
  '2027-01-11': '成人の日',
  '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日',
  '2027-03-21': '春分の日',
  '2027-03-22': '振替休日',
  '2027-04-29': '昭和の日',
  '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日',
  '2027-07-19': '海の日',
  '2027-08-11': '山の日',
  '2027-09-20': '敬老の日',
  '2027-09-23': '秋分の日',
  '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日',
};

export function getJapaneseHoliday(dateStr: string): string | null {
  if (FIXED_HOLIDAYS[dateStr]) return FIXED_HOLIDAYS[dateStr];
  const monthDay = dateStr.slice(5);
  const fallbackMap: Record<string, string> = {
    '01-01': '元日',
    '02-11': '建国記念の日',
    '02-23': '天皇誕生日',
    '04-29': '昭和の日',
    '05-03': '憲法記念日',
    '05-04': 'みどりの日',
    '05-05': 'こどもの日',
    '08-11': '山の日',
    '11-03': '文化の日',
    '11-23': '勤労感謝の日',
  };
  return fallbackMap[monthDay] || null;
}

export function createDefaultMetadata(): CoupleMetadata {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  return {
    partners: {
      partnerA: {
        name: 'ゆうと',
        avatar: '🐻',
        themeColor: '#56CFE1',
        bgColor: '#E2F9FC',
        lastSeenAt: now.toISOString(),
      },
      partnerB: {
        name: 'さや',
        avatar: '🐰',
        themeColor: '#B388EB',
        bgColor: '#F3EAFF',
        lastSeenAt: twoHoursAgo,
      },
    },
    lastSyncedAt: '',
    updatedAt: now.toISOString(),
  };
}

// ご添付いただいた2026年11月ナスカレ勤務表（1日〜30日）の正確なシフト一覧
export const UPLOADED_2026_11_NURSECAL_LABELS: Record<number, string> = {
  1: '明け',
  2: '休み',
  3: '２早',
  4: '遅A',
  5: '休み',
  6: '休み',
  7: '２夜',
  8: '明け',
  9: '休み',
  10: '休み',
  11: '遅A',
  12: '遅B',
  13: '日勤',
  14: '夜勤',
  15: '明け',
  16: '休み',
  17: '早A',
  18: '早B',
  19: '遅A',
  20: '休み',
  21: '日勤',
  22: '夜勤',
  23: '明け',
  24: '休み',
  25: '早B',
  26: '遅A',
  27: '準早',
  28: '夜勤',
  29: '明け',
  30: '休み',
};

// 2026年11月の30日分のシフトデータを生成（夫のデフォルト勤務表として初期反映＆ワンタップ復元可能）
export function createUploaded2026NovShifts(
  partnerId: PartnerId = 'partnerA',
  stamps: StampPreset[] = DEFAULT_STAMP_PRESETS
): Record<string, ShiftEntry> {
  const result: Record<string, ShiftEntry> = {};
  const partnerStamps = getPartnerShiftStamps(stamps, partnerId);
  const pool = partnerStamps.length > 0 ? partnerStamps : DEFAULT_STAMP_PRESETS;
  const nowIso = '2026-11-04T00:00:00.000Z';

  for (let day = 1; day <= 30; day++) {
    const label = UPLOADED_2026_11_NURSECAL_LABELS[day];
    if (!label) continue;
    const stamp =
      pool.find((s) => s.label === label || s.shortLabel === label) ||
      DEFAULT_STAMP_PRESETS.find((s) => s.label === label || s.shortLabel === label);
    if (!stamp) continue;
    const dateStr = `2026-11-${String(day).padStart(2, '0')}`;
    result[`${dateStr}_${partnerId}`] = {
      id: `shift_${dateStr}_${partnerId}`,
      date: dateStr,
      partnerId,
      stampId: stamp.id,
      customLabel: stamp.shortLabel,
      startTime: stamp.startTime,
      endTime: stamp.endTime,
      createdBy: partnerId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }
  return result;
}

// 初期ストアを作成（初期登録されていたサンプル予定はすべて削除し、2026年11月ナスカレ勤務表を初期セット）
export function createInitialDataStore(): CalendarDataStore {
  const now = new Date();
  const metadata = createDefaultMetadata();

  return {
    version: 1,
    metadata,
    categories: DEFAULT_CATEGORIES,
    stamps: DEFAULT_STAMP_PRESETS,
    shifts: createUploaded2026NovShifts('partnerA', DEFAULT_STAMP_PRESETS),
    events: {},
    daySupports: {},
    updatedAt: now.toISOString(),
  };
}

// ==========================================
// ⏱️ 残業・休日出勤の分単位計算＆フォーマットユーティリティ
// ==========================================

/**
 * シフトエントリから分単位の残業時間を取得（overtimeMinutes または過去の overtimeHours から算出）
 */
export function getShiftOvertimeMinutes(shift?: ShiftEntry): number {
  if (!shift) return 0;
  if (typeof shift.overtimeMinutes === 'number') {
    return Math.max(0, Math.round(shift.overtimeMinutes));
  }
  if (typeof shift.overtimeHours === 'number' && shift.overtimeHours > 0) {
    return Math.max(0, Math.round(shift.overtimeHours * 60));
  }
  return 0;
}

/**
 * シフトエントリから分単位の休日出勤時間を取得
 */
export function getShiftHolidayWorkMinutes(shift?: ShiftEntry): number {
  if (!shift) return 0;
  if (typeof shift.holidayWorkMinutes === 'number') {
    return Math.max(0, Math.round(shift.holidayWorkMinutes));
  }
  if (typeof shift.holidayWorkHours === 'number' && shift.holidayWorkHours > 0) {
    return Math.max(0, Math.round(shift.holidayWorkHours * 60));
  }
  return 0;
}

/**
 * 分数を「◯時間◯分」形式の日本語文字列に変換（例: 35 -> "35分", 90 -> "1時間30分", 120 -> "2時間"）
 */
export function formatMinutesToJa(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m === 0) return '0分';
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  if (hours === 0) return `${mins}分`;
  if (mins === 0) return `${hours}時間`;
  return `${hours}時間${mins}分`;
}

/**
 * 分数を「◯◯分」形式の純粋な分数文字列に変換（ユーザー要望：1時間を60分として◯◯分のみ表示）
 * 例: 35 -> "35分", 90 -> "90分", 120 -> "120分", 335 -> "335分"
 */
export function formatMinutesOnly(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0));
  return `${m}分`;
}

/**
 * 分数を「◯◯分 (◯時間◯分)」形式に変換（分数を最優先しつつ時間も併記）
 * 例: 35 -> "35分", 90 -> "90分 (1時間30分)", 120 -> "120分 (2時間)"
 */
export function formatMinutesWithJa(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m === 0) return '0分';
  if (m < 60) return `${m}分`;
  return `${m}分 (${formatMinutesToJa(m)})`;
}

/**
 * 分数を短縮・コンパクト形式に変換（マス目・バッジ用：分単位を常に明瞭表示）
 * 例: 35 -> "35分", 90 -> "90分", 120 -> "120分"
 */
export function formatMinutesShort(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m === 0) return '0分';
  return `${m}分`;
}

/**
 * 開始時刻 "HH:mm" と終了時刻 "HH:mm" から経過分数（分単位）を自動計算（日跨ぎ対応）
 * 例: "11:00" と "11:35" -> 35
 * 例: "17:30" と "19:15" -> 105 (1時間45分)
 * 例: "22:00" と "01:30" -> 210 (3時間30分)
 */
export function calculateMinutesBetween(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const sParts = startTime.split(':').map(Number);
  const eParts = endTime.split(':').map(Number);
  if (sParts.length < 2 || eParts.length < 2) return 0;
  const [sh, sm] = sParts;
  const [eh, em] = eParts;
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return 0;

  const startTotal = sh * 60 + sm;
  let endTotal = eh * 60 + em;

  if (endTotal < startTotal) {
    // 翌日の時刻（日跨ぎ）
    endTotal += 24 * 60;
  }

  return Math.max(0, endTotal - startTotal);
}


