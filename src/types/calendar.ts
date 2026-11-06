// ペアカレ (PairCal) データモデル定義

export type PartnerId = 'partnerA' | 'partnerB';
// デフォルトの3項目（二人予定・夫予定・妻予定）に加え、ユーザーが自由に追加・削除可能
export type CalendarCategoryId = string;
export type FilterCategoryId = 'all' | CalendarCategoryId;

// カレンダーの予定項目（カテゴリ）定義（追加・削除・カスタマイズ可能）
export interface CalendarCategoryItem {
  id: CalendarCategoryId;
  label: string;          // 例: "二人予定", "夫予定", "妻予定", "記念日", "家事"
  shortLabel: string;     // 例: "二人", "夫", "妻"
  icon: string;           // 例: "💕", "🐻", "🐰"
  accentColor: string;    // HEX
  bgColor: string;        // HEX
  textColor: string;      // HEX
  borderColor: string;    // HEX
  order: number;
}

// シフトスタンプの定義（ポチポチ連続入力用：夫用・妻用で別々に管理可能）
export interface StampPreset {
  id: string;
  partnerId?: PartnerId;  // 'partnerA' (夫の勤務リスト) | 'partnerB' (妻の勤務リスト)
  label: string;          // 例: "日勤", "遅A", "早A", "２夜", "明け", "準早", "準遅", "休み", "年休"
  shortLabel: string;     // カレンダーセル表示用（例: "日勤", "遅A", "早A", "２夜"）
  type: 'shift' | 'event';
  color: string;          // 背景パステルカラー (HEX)
  textColor: string;      // 文字カラー (HEX)
  startTime?: string;     // 付随する開始時間 例: "09:00"
  endTime?: string;       // 付随する終了時間 例: "18:05"
  icon?: string;          // 絵文字アイコン
  isHoliday?: boolean;    // ふたり休日一致判定用の休日フラグ（休・年休・有休・公休など）
  categoryId?: CalendarCategoryId;
  order: number;
}

// 日ごとのシフトデータ（2人並べて表示＋仕事終わりや休日のバイト重ね書き＋残業・休日出勤時間対応）
export interface ShiftEntry {
  id: string;             // `${date}_${partnerId}` (例: "2026-11-03_partnerA")
  date: string;           // "YYYY-MM-DD"
  partnerId: PartnerId;
  stampId: string;        // メインのシフト（例: 日勤、休み、休日出勤）
  customLabel?: string;
  startTime?: string;
  endTime?: string;

  // 普通の仕事＋バイト、または休みの日のバイト等の2つ目（サブ）記載欄
  subStampId?: string;
  subCustomLabel?: string; // 例: "バイト", "副業", "夜バイト"
  subStartTime?: string;   // 例: "18:30"
  subEndTime?: string;     // 例: "22:00"

  // 残業・休日出勤の記録（分単位計算・月間集計対応）
  overtimeMinutes?: number;    // 残業時間（分単位：例 35, 90）
  overtimeStartTime?: string;  // 残業開始時刻（例: "11:00"）
  overtimeEndTime?: string;    // 残業終了時刻（例: "11:35"）
  overtimeHours?: number;      // 従来の時間小数（後方互換用：例 1.5）

  holidayWorkMinutes?: number;   // 休日出勤時間（分単位：例 240, 480）
  holidayWorkStartTime?: string; // 休日出勤開始時刻
  holidayWorkEndTime?: string;   // 休日出勤終了時刻
  holidayWorkHours?: number;     // 従来の時間小数（後方互換用：例 4.0）
  isHolidayWork?: boolean;       // 休日出勤フラグ

  // ⏱️ 残業・休日出勤の「仮予定（見込み）」ステータス
  // 'tentative' = 仮予定（未確定。終業時等に確認して確定させる）
  // 'confirmed' = 実績確定（未指定時はデフォルトで確定扱い）
  overtimeStatus?: 'tentative' | 'confirmed';
  holidayWorkStatus?: 'tentative' | 'confirmed';

  memo?: string;
  createdBy: PartnerId;
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
  deletedAt?: string | null;
}

// 通知の対象端末（夫の端末のみ／妻の端末のみ／両方）
export type NotifyTarget = PartnerId | 'both';

// カレンダー予定・タスクデータ
export interface ScheduleEvent {
  id: string;             // UUID
  date: string;           // "YYYY-MM-DD"
  endDate?: string;       // "YYYY-MM-DD"
  title: string;          // 予定・タスク名
  categoryId: CalendarCategoryId;
  color: string;          // 色分け用カラーコード
  isAllDay: boolean;
  startTime?: string;     // "HH:mm"
  endTime?: string;       // "HH:mm"
  memo?: string;
  supportBadges?: string[]; // 例: ["🍳夜ごはん不要", "🍱お弁当あり"]

  // タスク機能＆Googleカレンダー端末別通知フィールド
  isTask?: boolean;           // true の場合はタスク（ToDoチェック付き）として扱う
  isCompleted?: boolean;      // タスクの完了チェック状態
  notifyTarget?: NotifyTarget; // 通知を送る対象（'partnerA'=夫の端末のみ, 'partnerB'=妻の端末のみ, 'both'=両方）
  reminderMinutes?: number;   // Googleカレンダー通知タイミング（分前: 0=定刻, 10=10分前, 30=30分前, 60=1時間前, 1440=前日）
  googleCalSynced?: boolean;  // Googleカレンダーへ登録済みフラグ

  createdBy: PartnerId;   // 誰が入れたか
  createdAt: string;      // いつ予定を入れたか
  updatedAt: string;      // いつ更新したか
  deletedAt?: string | null;
}

// 日付ごとの「🍳すれ違いサポートアイコン（ごはん・家事目印）」記録
export interface DaySupportEntry {
  id: string;             // `support_${date}`
  date: string;           // "YYYY-MM-DD"
  badges: string[];       // 例: ["🍳夜ごはん不要", "🍱お弁当あり", "🚗お迎えお願い"]
  memo?: string;
  updatedBy: PartnerId;
  updatedAt: string;      // ISO 8601
}

// 夫婦のプロフィール＆最終確認（既読）ステータス
export interface PartnerProfile {
  name: string;
  avatar: string;
  themeColor: string;
  bgColor: string;
  lastSeenAt: string;     // ISO 8601
}

// 起動時お気に入り画像・ウェルカム画面設定
export interface WelcomeImageConfig {
  enabled: boolean;          // 起動時に表示するかどうか
  dataUrl?: string;          // Base64画像データ または 画像URL
  message?: string;          // 表示メッセージ（例：「今日も1日お疲れ様💕」）
  mode?: 'always' | 'daily'; // 'always'=毎回 / 'daily'=1日1回
  lastShownDate?: string;    // 最終表示日付 "YYYY-MM-DD"
}

export interface CoupleMetadata {
  partners: {
    partnerA: PartnerProfile;
    partnerB: PartnerProfile;
  };
  lastSyncedAt: string;
  updatedAt?: string;
  welcomeImageConfig?: WelcomeImageConfig;
}

// カレンダー全体の保存データストア構造（Conflict-Free Merge対応）
export interface CalendarDataStore {
  version: number;
  metadata: CoupleMetadata;
  categories?: CalendarCategoryItem[];      // カスタマイズ可能なカレンダー予定項目リスト
  stamps: StampPreset[];
  shifts: Record<string, ShiftEntry>;        // key: `${date}_${partnerId}`
  events: Record<string, ScheduleEvent>;     // key: event.id
  daySupports: Record<string, DaySupportEntry>; // key: date ("YYYY-MM-DD")
  updatedAt: string;
}

// クラウド同期設定（GitHub Gist または GitHub リポジトリ内専用データファイル）
export interface CloudSyncConfig {
  enabled: boolean;
  mode: 'gist' | 'repo';
  githubToken: string;
  gistId: string;
  repoOwner?: string;
  repoName?: string;
  repoBranch?: string;
  repoFilePath?: string;
  autoSync: boolean;
}

// 暗号化ペイロード形式（GitHub Gist / リポジトリ保存用）
export interface EncryptedPayload {
  app: 'FutariCal';
  version: number;
  cipher: 'AES-GCM-256';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;           // Base64
  iv: string;             // Base64
  ciphertext: string;     // Base64
  updatedAt: string;
}
