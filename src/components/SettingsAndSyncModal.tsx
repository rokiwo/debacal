import React, { useRef, useState } from 'react';
import {
  X,
  Cloud,
  Calendar,
  Users,
  ShieldCheck,
  RefreshCw,
  Download,
  Upload,
  Sparkles,
  Copy,
  Check,
  KeyRound,
  FolderGit2,
  Camera,
  Eye,
  Trash2,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CalendarDataStore,
  CloudSyncConfig,
  EncryptedPayload,
  PartnerId,
  ScheduleEvent,
  WelcomeImageConfig,
} from '../types/calendar';
import { decryptCalendarStore, encryptCalendarStore } from '../utils/crypto';
import { exportToIcs, IcsExportTarget, parseIcsEvents } from '../utils/ical';
import { generatePartnerNotificationIcs, openOrShareIcsOnDevice } from '../utils/googleCalendar';
import { createNewSecretGist } from '../utils/storage';

interface SettingsAndSyncModalProps {
  store: CalendarDataStore;
  activePartner: PartnerId;
  syncConfig: CloudSyncConfig;
  currentPassword: string;
  onClose: () => void;
  onUpdateSyncConfig: (config: CloudSyncConfig) => void;
  onUpdatePassword: (newPassword: string) => Promise<void>;
  onTriggerCloudSync: (configOverride?: CloudSyncConfig, passwordOverride?: string) => Promise<void>;
  onMergeRemoteStore: (remoteStore: CalendarDataStore, message: string) => void;
  onImportEvents: (events: ScheduleEvent[]) => void;
  onClearAllEvents: () => void;
  onClearAllShifts: () => void;
  onClearAllData: () => void;
  onUpdatePartnerProfiles: (
    partnerAName: string,
    partnerAAvatar: string,
    partnerBName: string,
    partnerBAvatar: string
  ) => void;
  onUpdateWelcomeImageConfig?: (config: WelcomeImageConfig) => void;
  onPreviewWelcomeImage?: (config: WelcomeImageConfig) => void;
  isShared?: boolean;
  onOpenSharedKeywordModal?: () => void;
  onUnshareCalendar?: () => void;
}

type SettingsTab = 'sync' | 'ical_backup' | 'profile' | 'welcome_image';

const AVATAR_CHOICES = ['🐻', '🐰', '🐱', '🐶', '🦊', '🐼', '🐨', '🦁', '🐥', '🐧', '🧑', '👩', '🤵', '👰'];

export const SettingsAndSyncModal: React.FC<SettingsAndSyncModalProps> = ({
  store,
  activePartner,
  syncConfig,
  currentPassword,
  onClose,
  onUpdateSyncConfig,
  onUpdatePassword,
  onTriggerCloudSync,
  onMergeRemoteStore,
  onImportEvents,
  onClearAllEvents,
  onClearAllShifts,
  onClearAllData,
  onUpdatePartnerProfiles,
  onUpdateWelcomeImageConfig,
  onPreviewWelcomeImage,
  isShared = false,
  onOpenSharedKeywordModal,
  onUnshareCalendar,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sync');

  // クラウド同期フォーム状態
  const [mode, setMode] = useState<'gist' | 'repo'>(syncConfig.mode || 'gist');
  const [githubToken, setGithubToken] = useState(syncConfig.githubToken || '');
  const [gistId, setGistId] = useState(syncConfig.gistId || '');
  const [repoOwner, setRepoOwner] = useState(syncConfig.repoOwner || '');
  const [repoName, setRepoName] = useState(syncConfig.repoName || 'debacal');
  const [repoBranch, setRepoBranch] = useState(syncConfig.repoBranch || 'main');
  const [repoFilePath, setRepoFilePath] = useState(
    syncConfig.repoFilePath || 'data/calendar-encrypted.json'
  );
  const [autoSync, setAutoSync] = useState(syncConfig.autoSync ?? true);
  const [passwordInput, setPasswordInput] = useState(currentPassword || '');
  const [sharePasteText, setSharePasteText] = useState('');

  // プロフィール編集状態
  const [nameA, setNameA] = useState(store.metadata.partners.partnerA.name);
  const [avatarA, setAvatarA] = useState(store.metadata.partners.partnerA.avatar);
  const [nameB, setNameB] = useState(store.metadata.partners.partnerB.name);
  const [avatarB, setAvatarB] = useState(store.metadata.partners.partnerB.avatar);

  // 起動時お気に入り写真設定状態
  const initialWelcome = store.metadata.welcomeImageConfig || {
    enabled: true,
    dataUrl: '',
    message: '今日も一日お疲れ様💕',
    mode: 'always',
  };
  const [welcomeEnabled, setWelcomeEnabled] = useState(initialWelcome.enabled);
  const [welcomeDataUrl, setWelcomeDataUrl] = useState(initialWelcome.dataUrl || '');
  const [welcomeMessage, setWelcomeMessage] = useState(initialWelcome.message || '今日も一日お疲れ様💕');
  const [welcomeMode, setWelcomeMode] = useState<'always' | 'daily'>(initialWelcome.mode || 'always');

  // iCal設定状態
  const [icsExportTarget, setIcsExportTarget] = useState<IcsExportTarget>('all');
  const [icsImportCategory, setIcsImportCategory] = useState<CalendarCategoryId>('shared');

  // UIメッセージ状態
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [welcomeSavedSuccess, setWelcomeSavedSuccess] = useState(false);

  const icsFileInputRef = useRef<HTMLInputElement>(null);
  const jsonRestoreInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectWelcomeImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) return;

      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setWelcomeDataUrl(compressed);
          setWelcomeEnabled(true);
        } else {
          setWelcomeDataUrl(rawDataUrl);
          setWelcomeEnabled(true);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveWelcomeConfig = () => {
    const newConfig: WelcomeImageConfig = {
      enabled: welcomeEnabled,
      dataUrl: welcomeDataUrl,
      message: welcomeMessage.trim() || '今日も一日お疲れ様💕',
      mode: welcomeMode,
      lastShownDate: store.metadata.welcomeImageConfig?.lastShownDate,
    };
    onUpdateWelcomeImageConfig?.(newConfig);
    setWelcomeSavedSuccess(true);
    setTimeout(() => {
      setWelcomeSavedSuccess(false);
    }, 4000);
    setStatusMsg({
      type: 'ok',
      text: '📸 起動時のお気に入り写真・ウェルカム設定を保存・適用しました✨',
    });
  };

  const buildCurrentConfig = (overrideGistId?: string): CloudSyncConfig => ({
    enabled: Boolean(githubToken.trim() && (mode === 'repo' ? repoOwner.trim() : (overrideGistId ?? gistId).trim())),
    mode,
    githubToken: githubToken.trim(),
    gistId: (overrideGistId ?? gistId).trim(),
    repoOwner: repoOwner.trim(),
    repoName: repoName.trim() || 'debacal',
    repoBranch: repoBranch.trim() || 'main',
    repoFilePath: repoFilePath.trim() || 'data/calendar-encrypted.json',
    autoSync,
  });

  // 設定保存＆今すぐ同期
  const handleSaveAndSync = async () => {
    setStatusMsg(null);
    setBusy(true);
    try {
      if (passwordInput.trim()) {
        await onUpdatePassword(passwordInput.trim());
      }
      const nextCfg = buildCurrentConfig();
      onUpdateSyncConfig(nextCfg);

      if (nextCfg.enabled) {
        await onTriggerCloudSync(nextCfg, passwordInput.trim() || undefined);
        setStatusMsg({
          type: 'ok',
          text: '設定を保存し、クラウド同期を完了しました✨',
        });
      } else {
        setStatusMsg({
          type: 'ok',
          text: '設定を保存しました✨',
        });
      }
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '同期中にエラーが発生しました',
      });
    } finally {
      setBusy(false);
    }
  };

  // ワンタップで新しい Secret Gist を自動作成
  const handleCreateSecretGist = async () => {
    setStatusMsg(null);
    if (!githubToken.trim()) {
      setStatusMsg({
        type: 'err',
        text: '先に GitHub Personal Access Token (gistスコープ付き) を入力してください',
      });
      return;
    }
    setBusy(true);
    try {
      if (passwordInput.trim()) {
        await onUpdatePassword(passwordInput.trim());
      }
      const newId = await createNewSecretGist(githubToken.trim(), store, passwordInput.trim());
      setGistId(newId);
      const nextCfg = buildCurrentConfig(newId);
      onUpdateSyncConfig(nextCfg);
      setStatusMsg({
        type: 'ok',
        text: `専用シークレットGist (${newId}) を自動作成し、データを保存しました✨`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gist作成に失敗しました',
      });
    } finally {
      setBusy(false);
    }
  };

  // パートナー共有用ワンタップ設定テキストをコピー
  const handleCopyPartnerShareText = async () => {
    const shareText = [
      '【デバカレ (DebaCal) 共有設定🛠️】',
      `🌐 アプリURL: ${window.location.origin}${window.location.pathname}`,
      `💡 パスワードロック不要（URLを開くだけですぐ使えます）`,
      mode === 'gist' ? `☁️ Gist ID: ${gistId}` : `☁️ Repo: ${repoOwner}/${repoName}`,
      `🔐 GitHub Token: ${githubToken}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      // ignore
    }
  };

  // パートナーからLINE等で送られてきた共有設定テキストを貼り付けて自動反映
  const handleApplyPastedShareText = async () => {
    setStatusMsg(null);
    const text = sharePasteText.trim();
    if (!text) {
      setStatusMsg({
        type: 'err',
        text: 'パートナーから送られた「共有設定テキスト」を貼り付けてください📋',
      });
      return;
    }

    const passMatch = text.match(/合言葉\(パスワード\):\s*(.+)/);
    const gistMatch = text.match(/Gist ID:\s*([a-zA-Z0-9]+)/);
    const repoMatch = text.match(/Repo:\s*([^\s/]+)\/([^\s]+)/);
    const tokenMatch = text.match(/GitHub Token:\s*([a-zA-Z0-9_]+)/);

    const nextPass = passMatch ? passMatch[1].trim() : passwordInput.trim();
    const nextToken = tokenMatch ? tokenMatch[1].trim() : githubToken.trim();
    const nextGist = gistMatch ? gistMatch[1].trim() : gistId.trim();
    const nextMode: 'gist' | 'repo' = repoMatch && !gistMatch ? 'repo' : 'gist';
    const nextOwner = repoMatch ? repoMatch[1].trim() : repoOwner.trim();
    const nextRepo = repoMatch ? repoMatch[2].trim() : repoName.trim();

    if (nextPass && nextPass !== '(設定した合言葉)') setPasswordInput(nextPass);
    if (nextToken) setGithubToken(nextToken);
    if (nextGist) setGistId(nextGist);
    setMode(nextMode);
    if (nextOwner) setRepoOwner(nextOwner);
    if (nextRepo) setRepoName(nextRepo);

    if (!nextPass || nextPass.length < 4 || nextPass === '(設定した合言葉)') {
      setStatusMsg({
        type: 'err',
        text: 'テキストから合言葉（4文字以上）を読み取れませんでした。上の欄に合言葉を入力してください🔑',
      });
      return;
    }

    setBusy(true);
    try {
      await onUpdatePassword(nextPass);
      const nextCfg: CloudSyncConfig = {
        enabled: Boolean(nextToken && (nextMode === 'repo' ? nextOwner : nextGist)),
        mode: nextMode,
        githubToken: nextToken,
        gistId: nextGist,
        repoOwner: nextOwner,
        repoName: nextRepo || 'futari-calendar',
        repoBranch: repoBranch.trim() || 'main',
        repoFilePath: repoFilePath.trim() || 'data/calendar-encrypted.json',
        autoSync: true,
      };
      onUpdateSyncConfig(nextCfg);
      if (nextCfg.enabled) {
        await onTriggerCloudSync(nextCfg, nextPass);
        setStatusMsg({
          type: 'ok',
          text: 'パートナーの共有設定を自動反映し、クラウド同期を完了しました💕',
        });
      } else {
        setStatusMsg({
          type: 'ok',
          text: '合言葉を設定しました🔑（クラウド同期にはGitHub TokenとGist IDが必要です）',
        });
      }
      setSharePasteText('');
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '共有設定の同期に失敗しました',
      });
    } finally {
      setBusy(false);
    }
  };

  // .ics エクスポート実行（iPhone/Android/PCのカレンダーで確実に開ける方式）
  const handleExportIcs = async () => {
    const icsText = exportToIcs(store, icsExportTarget);
    const filename = `futarical-${icsExportTarget}-${new Date().toISOString().slice(0, 10)}.ics`;
    await openOrShareIcsOnDevice(icsText, filename);
    setStatusMsg({
      type: 'ok',
      text: 'カレンダーファイル (.ics) を開きました📅 そのまま「すべて追加」を押すとスマホのカレンダーに取り込めます✨',
    });
  };

  // .ics インポート実行
  const handleImportIcsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const events = parseIcsEvents(text, icsImportCategory, activePartner);
      if (events.length === 0) {
        setStatusMsg({ type: 'err', text: '.ics ファイル内に予定データが見つかりませんでした。' });
        return;
      }
      onImportEvents(events);
      setStatusMsg({
        type: 'ok',
        text: `${events.length} 件の予定を .ics ファイルからインポートしました✨`,
      });
    } catch {
      setStatusMsg({ type: 'err', text: '.ics ファイルの読み込みに失敗しました。' });
    } finally {
      e.target.value = '';
    }
  };

  // JSON フルバックアップ書き出し（暗号化 or 平文選択可能）
  const handleDownloadBackupJson = async (encrypt: boolean) => {
    try {
      let contentStr = '';
      let suffix = 'plain';
      if (encrypt) {
        const pass = passwordInput.trim() || currentPassword;
        if (!pass) {
          setStatusMsg({
            type: 'err',
            text: '暗号化バックアップには「合言葉（パスワード）」の設定が必要です🔑',
          });
          return;
        }
        const encryptedPayload = await encryptCalendarStore(store, pass);
        contentStr = JSON.stringify(encryptedPayload, null, 2);
        suffix = 'encrypted';
      } else {
        contentStr = JSON.stringify(store, null, 2);
      }

      const blob = new Blob([contentStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `futarical-backup-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg({
        type: 'ok',
        text: `JSONバックアップファイル（${encrypt ? 'AES-GCM暗号化済' : '標準JSON'}）を保存しました💾`,
      });
    } catch {
      setStatusMsg({ type: 'err', text: 'バックアップの作成に失敗しました' });
    }
  };

  // JSON バックアップから差分マージ復元
  const handleRestoreBackupJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      let restoredStore: CalendarDataStore;
      if (parsed && parsed.app === 'FutariCal' && parsed.ciphertext) {
        const pass = passwordInput.trim() || currentPassword;
        if (!pass) {
          setStatusMsg({
            type: 'err',
            text: '暗号化バックアップの復元には「同期・暗号化」タブで合言葉を入力してください🔑',
          });
          return;
        }
        restoredStore = await decryptCalendarStore(parsed as EncryptedPayload, pass);
      } else if (parsed && parsed.shifts && parsed.events) {
        restoredStore = parsed as CalendarDataStore;
      } else {
        throw new Error('対応していないJSONフォーマットです');
      }

      onMergeRemoteStore(restoredStore, 'バックアップJSONから差分マージ復元しました✨');
      setStatusMsg({
        type: 'ok',
        text: 'バックアップデータを既存データと安全に差分マージ復元しました✨',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'バックアップファイルの復元に失敗しました',
      });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[90vh] bg-[#FFFBF7] rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-5 py-3.5 border-b border-[#FFE5EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-stone-800 flex items-center gap-1.5">
                <span>設定・クラウド暗号化同期</span>
                <span className="px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-300">🛠️デバカレ</span>
              </h2>
              <p className="text-[11px] text-stone-400">
                本番（ふたりカレンダー）と完全分離された開発・検証環境
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブバー */}
        <div className="grid grid-cols-4 gap-1 bg-white px-2 sm:px-4 pt-2 pb-2 border-b border-stone-100">
          <button
            type="button"
            onClick={() => {
              setActiveTab('sync');
              setStatusMsg(null);
            }}
            className={`py-2 px-1 rounded-2xl text-[10px] sm:text-xs font-extrabold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'sync'
                ? 'bg-[#FFE5EC] text-[#9E2A47] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">📲 夫婦共有</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('ical_backup');
              setStatusMsg(null);
            }}
            className={`py-2 px-1 rounded-2xl text-[10px] sm:text-xs font-extrabold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'ical_backup'
                ? 'bg-[#E2F9FC] text-[#136370] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">📅 カレンダー</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('profile');
              setStatusMsg(null);
            }}
            className={`py-2 px-1 rounded-2xl text-[10px] sm:text-xs font-extrabold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'profile'
                ? 'bg-[#F3EAFF] text-[#59318F] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">👫 ふたり設定</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('welcome_image');
              setStatusMsg(null);
            }}
            className={`py-2 px-1 rounded-2xl text-[10px] sm:text-xs font-extrabold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'welcome_image'
                ? 'bg-[#FFF0F5] text-rose-600 shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 shrink-0" />
            <span className="truncate">📸 起動フォト</span>
          </button>
        </div>

        {/* コンテンツ領域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {statusMsg && (
            <div
              className={`p-3 rounded-2xl font-bold border ${
                statusMsg.type === 'ok'
                  ? 'bg-[#E6F7EF] border-[#52B788] text-[#1E6645]'
                  : 'bg-rose-50 border-rose-200 text-rose-600'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          {/* タブ1：超かんたん夫婦共有 ＆ データ削除 */}
          {activeTab === 'sync' && (() => {
            const inviteUrl = 'https://rokiwo.github.io/debacal/';
            return (
            <div className="space-y-4">
              {/* 🔑 合言葉によるカレンダー共有ステータス */}
              <div className="bg-white rounded-3xl p-4 border-2 border-[#BCEBF5] space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-extrabold text-stone-800 text-sm flex items-center gap-1.5">
                    <span>🔑</span>
                    <span>合言葉によるカレンダー共有</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-extrabold text-[10px] ${
                      isShared
                        ? 'bg-[#E6F7EF] text-[#1E6645]'
                        : 'bg-amber-100 text-amber-800 animate-pulse'
                    }`}
                  >
                    {isShared ? '✅ 認証済：共有中' : '⚠️ 未共有（まっさら状態）'}
                  </span>
                </div>

                <p className="text-[11px] text-stone-600 leading-relaxed">
                  初めてURLを開いた端末はまっさらな状態で起動します。ふたりのカレンダーデータを共有するには、合言葉（例：<strong>ゆうとさや</strong>）を入力してください。
                </p>

                <div className="flex flex-wrap gap-2">
                  {!isShared ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSharedKeywordModal?.();
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-rose-400 text-white font-extrabold text-xs shadow-xs hover:opacity-95 flex items-center gap-1.5"
                    >
                      <span>🔑</span>
                      <span>合言葉を入力して共有する</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenSharedKeywordModal?.();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs flex items-center gap-1"
                      >
                        <span>🔑</span>
                        <span>合言葉を再入力</span>
                      </button>

                      {onUnshareCalendar && (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                'カレンダーの共有を解除し、この端末をまっさらな初期状態に戻しますか？\n（クラウド上のデータは消えません。再度合言葉を入力すればいつでも元に戻せます）'
                              )
                            ) {
                              onUnshareCalendar();
                              onClose();
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs border border-rose-200 flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>共有を解除（まっさらに戻す）</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 💑 設定不要！URLを送るだけの超かんたん夫婦共有 */}
              <div className="bg-white rounded-3xl p-4 border-2 border-[#FF8FAB] space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-extrabold text-stone-800 text-sm flex items-center gap-1.5">
                    <span>💑</span>
                    <span>パートナーとの共有方法（1タップ招待）</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#E6F7EF] text-[#1E6645] font-extrabold text-[10px]">
                    ✅ 自動クラウド同期 ON
                  </span>
                </div>

                {/* 🔓 パスワードロック不要のご案内 */}
                <div className="p-3 rounded-2xl bg-[#EAF7FA] border border-[#BCEBF5] flex items-center gap-2.5 text-stone-700">
                  <span className="text-xl shrink-0">🔓</span>
                  <div className="text-[11px] font-bold leading-relaxed">
                    <strong>パスワード入力不要！</strong> 初回に合言葉（ゆうとさや）を入力するだけで、以後はパスワード入力なしでずっと同じカレンダーが共有されます✨
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[#FFF0F5] border border-[#FFC2D1] text-stone-700 space-y-1 leading-relaxed">
                  <div className="font-extrabold text-[#9E2A47] text-xs">
                    🎉 パートナーへの共有は下のボタンを押すだけ！
                  </div>
                  <p className="text-[11px] font-bold">
                    ① 下のボタンで<strong>パートナーにLINEで招待URLを送る</strong>（またはQRコードを読み取ってもらう）
                    <br />
                    ② パートナーが開いて、合言葉<strong>「ゆうとさや」</strong>を入力するだけでふたりのカレンダーが同期されます✨
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <a
                    href={`https://line.me/R/share?text=${encodeURIComponent(
                      `🐻💕🐰 共有シフト＆予定カレンダー「デバカレ」\nこの招待リンクを開いて、合言葉【ゆうとさや】を入れてね👇\n${inviteUrl}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="py-3 px-4 rounded-2xl bg-[#06C755] hover:bg-[#05b04b] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>💚 LINEでパートナーに招待URLを送る</span>
                  </a>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                        setCopiedShare(true);
                        setTimeout(() => setCopiedShare(false), 2500);
                        setStatusMsg({
                          type: 'ok',
                          text: 'パートナー招待用URLをコピーしました📋 LINE等でパートナーに送ってください💕',
                        });
                      } catch {
                        // ignore
                      }
                    }}
                    className="py-3 px-4 rounded-2xl bg-[#FF8FAB] hover:bg-[#e57393] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {copiedShare ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedShare ? '招待URLをコピーしました！' : '📋 招待用URLをコピー'}</span>
                  </button>
                </div>

                {/* 隣のパートナーがスマホカメラで1秒で開けるQRコード */}
                <div className="flex flex-col sm:flex-row items-center gap-3 p-3 rounded-2xl bg-[#FFFBF7] border border-stone-200/80">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                      inviteUrl
                    )}`}
                    alt="デバカレ共有QRコード"
                    className="w-24 h-24 rounded-xl border border-stone-200 bg-white p-1 shrink-0"
                  />
                  <div className="space-y-1.5 text-center sm:text-left flex-1">
                    <div className="font-extrabold text-stone-800 text-xs">
                      📱 隣にいるならカメラでQR読み取りでもOK！
                    </div>
                    <p className="text-[11px] text-stone-500">
                      パートナーのスマホのカメラでこのQRコードを読み取るだけで、合言葉も自動セットされて同じカレンダーがすぐ開きます。
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onTriggerCloudSync();
                          setStatusMsg({
                            type: 'ok',
                            text: '✨ 夫婦クラウドと最新のシフト・予定を同期しました！',
                          });
                        } catch {
                          // ignore
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#E2F9FC] hover:bg-[#56CFE1] text-[#136370] hover:text-white font-extrabold text-xs inline-flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                      <span>🔄 今すぐ手動で最新同期する</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 🗑️ 既存のシフトデータ・予定データの削除（リセット） */}
              <div className="bg-rose-50/70 rounded-2xl p-4 border border-rose-200 space-y-2.5">
                <h3 className="text-sm font-extrabold text-rose-700">
                  🗑️ 既存のシフトデータ・予定データの削除（リセット）
                </h3>
                <p className="text-stone-600 text-[11px]">
                  登録済みのシフトデータ（残業・休出・バイト含む）や予定・タスクデータを削除して白紙に戻せます（シフトスタンプの種類設定や項目設定は消えません）。
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllShifts();
                      setStatusMsg({
                        type: 'ok',
                        text: '登録されていたすべてのシフトデータ（残業・休出・バイト含む）を削除しました✨',
                      });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-xs"
                  >
                    🗑️ 既存のシフトデータをすべて削除
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClearAllEvents();
                      setStatusMsg({
                        type: 'ok',
                        text: '登録されていたすべての予定・タスクデータを削除しました✨',
                      });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs shadow-xs"
                  >
                    🗑️ 既存の予定・タスクデータをすべて削除
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClearAllData();
                      setStatusMsg({
                        type: 'ok',
                        text: 'すべてのシフトデータと予定・タスクデータを一括削除しました✨',
                      });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-extrabold text-xs shadow-xs"
                  >
                    🗑️ 予定＋シフトを両方すべて一括削除
                  </button>
                </div>
              </div>

              {/* 🔧 上級者向け詳細設定（通常は変更不要） */}
              <details className="bg-white rounded-2xl p-3.5 border border-stone-200/80">
                <summary className="font-bold text-stone-500 cursor-pointer flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#56CFE1]" />
                  <span>🔧 上級者向け詳細設定：独自GitHub保存先（通常は変更不要）</span>
                </summary>
                <div className="mt-3 pt-3 border-t border-stone-100 space-y-3">
                  <div className="grid grid-cols-2 gap-2 bg-[#FFFBF7] p-1 rounded-xl border border-stone-200">
                    <button
                      type="button"
                      onClick={() => setMode('gist')}
                      className={`py-1.5 rounded-lg font-extrabold text-xs transition-all ${
                        mode === 'gist'
                          ? 'bg-[#FF8FAB] text-white shadow-2xs'
                          : 'text-stone-600 hover:bg-white'
                      }`}
                    >
                      🔒 Secret Gist 保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('repo')}
                      className={`py-1.5 rounded-lg font-extrabold text-xs transition-all flex items-center justify-center gap-1 ${
                        mode === 'repo'
                          ? 'bg-[#56CFE1] text-white shadow-2xs'
                          : 'text-stone-600 hover:bg-white'
                      }`}
                    >
                      <FolderGit2 className="w-3.5 h-3.5" />
                      リポジトリ内JSON
                    </button>
                  </div>

                  {mode === 'gist' && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={gistId}
                        onChange={(e) => setGistId(e.target.value)}
                        placeholder="Gist ID（自動設定済み）"
                        className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-mono text-xs"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleCreateSecretGist}
                        className="px-3 py-2 rounded-xl bg-[#F3EAFF] text-[#59318F] font-extrabold text-xs shrink-0 flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>新規Gist作成</span>
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleSaveAndSync}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-stone-800 text-white font-extrabold text-xs"
                    >
                      詳細設定を保存して同期
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyPartnerShareText}
                      className="py-2.5 px-3 rounded-xl border border-stone-300 text-stone-700 font-bold text-xs"
                    >
                      設定テキストコピー
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sharePasteText}
                      onChange={(e) => setSharePasteText(e.target.value)}
                      placeholder="共有設定テキストを貼り付け"
                      className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleApplyPastedShareText}
                      className="px-3 py-1.5 rounded-xl bg-[#126875] text-white font-bold text-xs"
                    >
                      反映
                    </button>
                  </div>
                </div>
              </details>
            </div>
            );
          })()}

          {/* タブ2：iCal (.ics) カレンダー連携 ＆ JSONバックアップ */}
          {activeTab === 'ical_backup' && (
            <div className="space-y-4">
              {/* 🔔 スマホのカレンダー＆Googleカレンダー通知連携（夫の端末専用 ／ 妻の端末専用） */}
              <div className="bg-[#F6F9FF] rounded-2xl p-4 border border-sky-200/90 space-y-2.5 shadow-2xs">
                <h3 className="text-sm font-extrabold text-sky-900 flex items-center gap-1.5">
                  🔔 スマホのカレンダーに通知付きで取り込む（夫専用 ／ 妻専用）
                </h3>
                <p className="text-stone-600 leading-relaxed">
                  下のボタンを押すと、<strong>夫のボタンなら夫のシフト・予定・タスクだけ</strong>、<strong>妻のボタンなら妻のシフト・予定・タスクだけ</strong>に通知アラーム（VALARM）が入ったカレンダーがスマホで直接開きます！
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const icsText = generatePartnerNotificationIcs(store, 'partnerA');
                      const fname = `futarical-notify-partnerA-${new Date().toISOString().slice(0, 10)}.ics`;
                      await openOrShareIcsOnDevice(icsText, fname);
                      setStatusMsg({
                        type: 'ok',
                        text: `${store.metadata.partners.partnerA.avatar}${store.metadata.partners.partnerA.name}の端末専用の通知付きカレンダーを開きました🔔「すべて追加」を押すとカレンダーに登録されます！`,
                      });
                    }}
                    className="py-3 px-3 rounded-xl bg-[#126875] hover:bg-[#0D4F59] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>
                      {store.metadata.partners.partnerA.avatar}{' '}
                      {store.metadata.partners.partnerA.name}のスマホに通知カレンダーを追加
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const icsText = generatePartnerNotificationIcs(store, 'partnerB');
                      const fname = `futarical-notify-partnerB-${new Date().toISOString().slice(0, 10)}.ics`;
                      await openOrShareIcsOnDevice(icsText, fname);
                      setStatusMsg({
                        type: 'ok',
                        text: `${store.metadata.partners.partnerB.avatar}${store.metadata.partners.partnerB.name}の端末専用の通知付きカレンダーを開きました🔔「すべて追加」を押すとカレンダーに登録されます！`,
                      });
                    }}
                    className="py-3 px-3 rounded-xl bg-[#6638A6] hover:bg-[#4F2A82] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>
                      {store.metadata.partners.partnerB.avatar}{' '}
                      {store.metadata.partners.partnerB.name}のスマホに通知カレンダーを追加
                    </span>
                  </button>
                </div>

                <div className="pt-1 text-[11px] text-stone-500">
                  💡 <strong>1件ずつGoogleカレンダーアプリへ直接通知を入れる場合</strong>は、各予定やタスクの横にある <strong>「🔔 Googleカレンダー通知登録」</strong> ボタンを押すとGoogleカレンダーアプリが直接開きます！
                </div>
              </div>

              {/* iCal (.ics) エクスポート＆インポート */}
              <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-3 shadow-2xs">
                <h3 className="text-sm font-extrabold text-stone-800 flex items-center gap-1.5">
                  📅 カレンダーファイル（.ics）の書き出し＆取り込み
                </h3>
                <p className="text-stone-500">
                  iPhone標準カレンダー・Googleカレンダー・ナスカレ等とカレンダーデータを入出力できます。
                </p>

                <div className="p-3 rounded-xl bg-[#FFFBF7] border border-stone-200/80 space-y-2">
                  <label className="block font-bold text-stone-700">
                    📤 ペアカレのシフト・予定をスマホのカレンダーで開く
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={icsExportTarget}
                      onChange={(e) => setIcsExportTarget(e.target.value as IcsExportTarget)}
                      className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-white font-bold"
                    >
                      <option value="all">🌈 2人のシフト＋すべての予定</option>
                      <option value="shared_and_events">💕 予定のみ（シフトを除く）</option>
                      <option value="partnerA">
                        {store.metadata.partners.partnerA.avatar}{' '}
                        {store.metadata.partners.partnerA.name}のシフト＆共有予定
                      </option>
                      <option value="partnerB">
                        {store.metadata.partners.partnerB.avatar}{' '}
                        {store.metadata.partners.partnerB.name}のシフト＆共有予定
                      </option>
                    </select>
                    <button
                      type="button"
                      onClick={handleExportIcs}
                      className="px-4 py-2 rounded-xl bg-[#56CFE1] hover:bg-[#2EA8BA] text-white font-extrabold flex items-center gap-1.5 shadow-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>カレンダーで開く(.ics)</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#FFFBF7] border border-stone-200/80 space-y-2">
                  <label className="block font-bold text-stone-700">
                    📥 外部の .ics ファイルをペアカレに取り込む
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={icsImportCategory}
                      onChange={(e) =>
                        setIcsImportCategory(e.target.value as CalendarCategoryId)
                      }
                      className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-white font-bold"
                    >
                      <option value="shared">💕 ふたりの共有予定として取込</option>
                      <option value="partnerA">
                        {store.metadata.partners.partnerA.avatar}{' '}
                        {store.metadata.partners.partnerA.name}の予定として取込
                      </option>
                      <option value="partnerB">
                        {store.metadata.partners.partnerB.avatar}{' '}
                        {store.metadata.partners.partnerB.name}の予定として取込
                      </option>
                      <option value="anniversary">🎉 記念日として取込</option>
                      <option value="chore">🏠 家事予定として取込</option>
                    </select>
                    <input
                      ref={icsFileInputRef}
                      type="file"
                      accept=".ics,.txt,text/calendar,application/octet-stream,*/*"
                      onChange={handleImportIcsFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => icsFileInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-[#B388EB] hover:bg-[#8C5EC7] text-white font-extrabold flex items-center gap-1.5 shadow-xs"
                    >
                      <Upload className="w-4 h-4" />
                      <span>.ics ファイルを選択</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 1タップ JSONバックアップ保存・復元 */}
              <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-3 shadow-2xs">
                <h3 className="text-sm font-extrabold text-stone-800">
                  💾 ワンタップ JSON バックアップ保存 ＆ 差分マージ復元
                </h3>
                <p className="text-stone-500">
                  機種変更時や念のための控えとして、すべてのシフト・予定・スタンプ設定を1ファイルに保存・復元できます（復元時も既存データを消さずに差分マージします）。
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadBackupJson(true)}
                    className="px-3.5 py-2.5 rounded-xl bg-[#FFE5EC] hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white font-extrabold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>🔐 暗号化JSONバックアップ保存</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadBackupJson(false)}
                    className="px-3.5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>📄 標準JSONバックアップ保存</span>
                  </button>

                  <input
                    ref={jsonRestoreInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleRestoreBackupJson}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if ('serviceWorker' in navigator) {
                          const regs = await navigator.serviceWorker.getRegistrations();
                          for (const r of regs) await r.unregister();
                        }
                        if ('caches' in window) {
                          const keys = await caches.keys();
                          for (const k of keys) await caches.delete(k);
                        }
                      } catch {
                        // ignore
                      }
                      window.location.reload();
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-[#FFF0F5] hover:bg-[#FFE5EC] border border-[#FFC2D1] text-[#9E2A47] font-extrabold flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 text-[#FF8FAB]" />
                    <span>🔄 最新版へ完全更新（キャッシュ破棄＆再読込）</span>
                  </button>
                </div>
              </div>

              {/* 🗑️ 全シフト・全予定一括削除（リセット） */}
              <div className="bg-rose-50/70 rounded-2xl p-4 border border-rose-200 space-y-2.5">
                <h3 className="text-sm font-extrabold text-rose-700">
                  🗑️ 既存のシフトデータ・予定データの削除（リセット）
                </h3>
                <p className="text-stone-600">
                  現在登録されているシフトデータ（残業・休出・バイト含む）や予定・タスクを一括で空にします（シフト種類の設定は残ります）。
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllShifts();
                      setStatusMsg({
                        type: 'ok',
                        text: '登録されていたすべてのシフトデータを削除しました✨',
                      });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-xs"
                  >
                    🗑️ すべてのシフトデータを削除
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClearAllEvents();
                      setStatusMsg({
                        type: 'ok',
                        text: '登録されていたすべての予定・タスクを削除しました✨',
                      });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs shadow-xs"
                  >
                    🗑️ すべての予定・タスクを削除
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClearAllData();
                      setStatusMsg({
                        type: 'ok',
                        text: 'すべてのシフトデータと予定・タスクデータを一括削除しました✨',
                      });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-extrabold text-xs shadow-xs"
                  >
                    🗑️ 予定＋シフトをすべて一括削除
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* タブ3：ふたりのプロフィール設定 */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-4 shadow-2xs">
              <h3 className="text-sm font-extrabold text-stone-800">
                👫 ふたりの表示名＆アイコン設定
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* パートナーA */}
                <div className="p-3.5 rounded-2xl bg-[#E2F9FC]/60 border border-[#56CFE1]/40 space-y-2.5">
                  <div className="font-extrabold text-[#136370] text-xs">
                    パートナーA（左側シフト枠）
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      表示名（ニックネーム）
                    </label>
                    <input
                      type="text"
                      value={nameA}
                      onChange={(e) => setNameA(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white font-extrabold text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      アイコン絵文字
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {AVATAR_CHOICES.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setAvatarA(em)}
                          className={`w-8 h-8 rounded-xl text-base flex items-center justify-center ${
                            avatarA === em
                              ? 'bg-[#56CFE1] text-white shadow-xs scale-110'
                              : 'bg-white hover:bg-stone-100'
                          }`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* パートナーB */}
                <div className="p-3.5 rounded-2xl bg-[#F3EAFF]/60 border border-[#B388EB]/40 space-y-2.5">
                  <div className="font-extrabold text-[#59318F] text-xs">
                    パートナーB（右側シフト枠）
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      表示名（ニックネーム）
                    </label>
                    <input
                      type="text"
                      value={nameB}
                      onChange={(e) => setNameB(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white font-extrabold text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      アイコン絵文字
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {AVATAR_CHOICES.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setAvatarB(em)}
                          className={`w-8 h-8 rounded-xl text-base flex items-center justify-center ${
                            avatarB === em
                              ? 'bg-[#B388EB] text-white shadow-xs scale-110'
                              : 'bg-white hover:bg-stone-100'
                          }`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onUpdatePartnerProfiles(
                    nameA.trim() || 'ゆうと',
                    avatarA || '🐻',
                    nameB.trim() || 'さや',
                    avatarB || '🐰'
                  );
                  setStatusMsg({
                    type: 'ok',
                    text: 'ふたりのプロフィール（名前・アイコン）を更新しました💕',
                  });
                }}
                className="w-full py-3 rounded-2xl bg-[#FF8FAB] hover:bg-[#E06C88] text-white font-extrabold text-sm shadow-sm transition-colors"
              >
                プロフィールを保存する
              </button>
            </div>
          )}

          {/* タブ4：📸 起動時のお気に入り写真・ウェルカム設定 */}
          {activeTab === 'welcome_image' && (
            <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-4 shadow-2xs">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-stone-800 flex items-center gap-1.5">
                    <span>📸</span>
                    <span>起動時のお気に入り写真・ウェルカム設定</span>
                  </h3>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-[11px] font-bold text-stone-600">起動時に表示:</span>
                    <input
                      type="checkbox"
                      checked={welcomeEnabled}
                      onChange={(e) => setWelcomeEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-500 focus:ring-rose-400"
                    />
                  </label>
                </div>
                <p className="text-stone-500 text-[11px] mt-1 leading-relaxed">
                  ペアカレを起動した際に、設定したふたりの写真や大切な思い出の写真、その日のふたりのシフトがウェルカム画面としてパッと表示されます💕
                </p>
              </div>

              {/* 写真選択＆プレビュー */}
              <div className="p-3 rounded-2xl bg-[#FFF9FB] border border-pink-200/80 space-y-3">
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSelectWelcomeImage}
                  className="hidden"
                />

                {welcomeDataUrl ? (
                  <div className="space-y-2.5">
                    <div className="relative rounded-2xl overflow-hidden border-2 border-pink-200 max-h-56 bg-black flex items-center justify-center">
                      <img
                        src={welcomeDataUrl}
                        alt="設定中のお気に入り写真"
                        className="w-full h-56 object-cover"
                      />
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (onPreviewWelcomeImage) {
                              onPreviewWelcomeImage({
                                enabled: welcomeEnabled,
                                dataUrl: welcomeDataUrl,
                                message: welcomeMessage,
                                mode: welcomeMode,
                              });
                            }
                          }}
                          className="px-2.5 py-1 rounded-xl bg-black/60 hover:bg-black/80 text-white text-[11px] font-black flex items-center gap-1 shadow-md"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>プレビュー</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => imageFileInputRef.current?.click()}
                        className="flex-1 py-2 px-3 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-extrabold text-xs shadow-2xs flex items-center justify-center gap-1.5"
                      >
                        <Camera className="w-4 h-4 text-rose-500" />
                        <span>別の写真に変更する</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setWelcomeDataUrl('');
                          setWelcomeEnabled(false);
                        }}
                        className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold text-xs flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>写真を削除</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 px-4 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-[#FFE5EC] text-rose-500 flex items-center justify-center mx-auto text-2xl shadow-inner">
                      📸
                    </div>
                    <div>
                      <div className="font-extrabold text-stone-800 text-xs sm:text-sm">
                        お気に入りの写真がまだ選ばれていません
                      </div>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        スマホの写真アルバムやカメラから画像を選んでください
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => imageFileInputRef.current?.click()}
                      className="py-2.5 px-5 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] hover:from-[#FF758F] hover:to-[#9E6EE6] text-white font-black text-xs shadow-md active:scale-95 transition-all inline-flex items-center gap-1.5"
                    >
                      <Upload className="w-4 h-4" />
                      <span>📁 スマホの写真から選ぶ</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 表示モード＆メッセージ設定 */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">
                    💬 写真の上に添えるメッセージ
                  </label>
                  <input
                    type="text"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="例: 今日も一日お疲れ様💕 / おかえりなさい🐻🐰"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white font-extrabold text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">
                    ⏱️ 表示するタイミング
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWelcomeMode('always')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        welcomeMode === 'always'
                          ? 'bg-[#FFE5EC] border-rose-300 text-[#9E2A47] font-black shadow-2xs'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50 font-bold'
                      }`}
                    >
                      <div className="text-xs">毎回表示</div>
                      <div className="text-[10px] opacity-75 mt-0.5">アプリを開くたびに出す</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWelcomeMode('daily')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        welcomeMode === 'daily'
                          ? 'bg-[#FFE5EC] border-rose-300 text-[#9E2A47] font-black shadow-2xs'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50 font-bold'
                      }`}
                    >
                      <div className="text-xs">1日1回だけ</div>
                      <div className="text-[10px] opacity-75 mt-0.5">今日最初の起動時のみ</div>
                    </button>
                  </div>
                </div>
              </div>

              {/* 保存完了インライン通知バッジ */}
              {welcomeSavedSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-800 text-xs font-black flex items-center justify-between gap-2 shadow-sm animate-pop">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>✅ 適用されました！次回起動時またはプレビューで表示されます</span>
                  </div>
                  {onPreviewWelcomeImage && welcomeDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        onPreviewWelcomeImage({
                          enabled: welcomeEnabled,
                          dataUrl: welcomeDataUrl,
                          message: welcomeMessage,
                          mode: welcomeMode,
                        });
                      }}
                      className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-extrabold text-[11px] shrink-0 shadow-2xs hover:bg-emerald-700 flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>今すぐ見る</span>
                    </button>
                  )}
                </div>
              )}

              {/* 保存＆プレビューボタン */}
              <div className="pt-2 flex items-center gap-2">
                {welcomeDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onPreviewWelcomeImage) {
                        onPreviewWelcomeImage({
                          enabled: welcomeEnabled,
                          dataUrl: welcomeDataUrl,
                          message: welcomeMessage,
                          mode: welcomeMode,
                        });
                      }
                    }}
                    className="py-3 px-4 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs active:scale-95 shrink-0"
                  >
                    <Eye className="w-4 h-4" />
                    <span>プレビュー確認</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveWelcomeConfig}
                  className={`flex-1 py-3.5 rounded-2xl text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                    welcomeSavedSuccess
                      ? 'bg-emerald-500 ring-2 ring-emerald-300 scale-[1.01]'
                      : 'bg-gradient-to-r from-[#FF8FAB] to-[#FF758F] hover:opacity-95'
                  }`}
                >
                  {welcomeSavedSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-white animate-bounce" />
                      <span>🎉 適用されました！（保存完了）</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>お気に入り写真設定を保存</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
