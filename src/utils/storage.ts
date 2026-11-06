// IndexedDB + localStorage 永続化 ＆ Conflict-Free 差分マージ ＆ GitHub Gist/Repo クラウド同期モジュール
import {
  CalendarDataStore,
  CloudSyncConfig,
  DaySupportEntry,
  EncryptedPayload,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
  WelcomeImageConfig,
} from '../types/calendar';
import { decryptCalendarStore, encryptCalendarStore } from './crypto';
import {
  createInitialDataStore,
  DEFAULT_STAMP_PRESETS,
  LEGACY_DEFAULT_STAMP_IDS,
} from './presets';
import { getDefaultCloudCredentials } from './defaultCloud';

const DB_NAME = 'DebaCalDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

const LS_STORE_KEY = 'debacal_store_v1';
const LS_ENCRYPTED_KEY = 'debacal_encrypted_v1';
const LS_PASS_HASH_KEY = 'debacal_pass_hash_v1';
const LS_SYNC_CONFIG_KEY = 'debacal_sync_config_v1';
const LS_ACTIVE_PARTNER_KEY = 'debacal_active_partner_v1';
export const LS_WELCOME_PHOTO_KEY = 'debacal_welcome_photo_dedicated_v1';
export const LS_SHARED_KEYWORD_KEY = 'debacal_shared_keyword_v1';
export const LS_CUSTOM_KEYWORD_DEF_KEY = 'debacal_custom_keyword_def_v1';

// デフォルトの特定の合言葉（ひらがな、カタカナ、アルファベット表記揺れを許容）
export const DEFAULT_SHARED_KEYWORDS = ['ゆうとさや', 'ゆとさや', 'yutosaya', 'paircal', 'debacal', 'futari'];

/**
 * 文字列を正規化（全角半角スペース除去、英字小文字化、全角英数を半角化、カタカナをひらがなへ変換）
 */
export function normalizeKeyword(input: string): string {
  if (!input) return '';
  let s = input.trim().replace(/\s+/g, '').toLowerCase();
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  s = s.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  return s;
}

/**
 * 入力された合言葉（キーワード）が合致するか検証
 */
export function isSharedKeywordValid(input: string, customDef?: string): boolean {
  const normInput = normalizeKeyword(input);
  if (!normInput) return false;

  if (customDef && customDef.trim()) {
    if (normInput === normalizeKeyword(customDef)) return true;
  }
  const savedCustomDef = localStorage.getItem(LS_CUSTOM_KEYWORD_DEF_KEY);
  if (savedCustomDef && savedCustomDef.trim()) {
    if (normInput === normalizeKeyword(savedCustomDef)) return true;
  }

  return DEFAULT_SHARED_KEYWORDS.some((kw) => normInput === normalizeKeyword(kw));
}

export function getSavedSharedKeyword(): string | null {
  return localStorage.getItem(LS_SHARED_KEYWORD_KEY);
}

export function setSavedSharedKeyword(kw: string | null): void {
  if (!kw) {
    localStorage.removeItem(LS_SHARED_KEYWORD_KEY);
  } else {
    localStorage.setItem(LS_SHARED_KEYWORD_KEY, kw.trim());
  }
}

export function getCustomKeywordDef(): string | null {
  return localStorage.getItem(LS_CUSTOM_KEYWORD_DEF_KEY);
}

export function setCustomKeywordDef(kw: string | null): void {
  if (!kw) {
    localStorage.removeItem(LS_CUSTOM_KEYWORD_DEF_KEY);
  } else {
    localStorage.setItem(LS_CUSTOM_KEYWORD_DEF_KEY, kw.trim());
  }
}

const GIST_FILENAME = 'debacal-encrypted.json';

// IndexedDB ヘルパー
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIdb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, val: T): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDBが使えない環境ではlocalStorageでカバー
  }
}

// 📸 お気に入り写真・ウェルカム画像の専用永続化（クラウド同期や容量制限で絶対に消えない独立保存領域）
export async function saveDedicatedWelcomePhoto(config: WelcomeImageConfig): Promise<void> {
  try {
    await idbSet(LS_WELCOME_PHOTO_KEY, config);
  } catch {}
  try {
    localStorage.setItem(LS_WELCOME_PHOTO_KEY, JSON.stringify(config));
  } catch {}
}

export async function loadDedicatedWelcomePhoto(): Promise<WelcomeImageConfig | null> {
  const fromIdb = await idbGet<WelcomeImageConfig>(LS_WELCOME_PHOTO_KEY);
  if (fromIdb && fromIdb.dataUrl) {
    return fromIdb;
  }
  try {
    const raw = localStorage.getItem(LS_WELCOME_PHOTO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WelcomeImageConfig;
      if (parsed && parsed.dataUrl) return parsed;
    }
  } catch {}
  return fromIdb || null;
}

// ISO日時文字列をミリ秒に変換
function toTimeMs(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Conflict-Free Merge（データが消えない差分マージ）
 * ローカルとクラウド（またはバックアップ）のデータをIDごとに updatedAt タイムスタンプ比較し、
 * 新しい方を採用して統合します。
 */
export function mergeCalendarStores(
  local: CalendarDataStore,
  remote: CalendarDataStore
): CalendarDataStore {
  // 1. シフトのマージ（IDごと）
  const mergedShifts: Record<string, ShiftEntry> = { ...local.shifts };
  for (const [id, remoteShift] of Object.entries(remote.shifts || {})) {
    const localShift = mergedShifts[id];
    if (!localShift || toTimeMs(remoteShift.updatedAt) > toTimeMs(localShift.updatedAt)) {
      mergedShifts[id] = remoteShift;
    }
  }

  // クラウド同期・マージ時にも休出と残業の重複二重登録を自動クリーンアップ
  for (const [id, s] of Object.entries(mergedShifts)) {
    if (!s || s.deletedAt) continue;
    const otMin = s.overtimeMinutes ?? (s.overtimeHours ? s.overtimeHours * 60 : 0);
    const hwMin = s.holidayWorkMinutes ?? (s.holidayWorkHours ? s.holidayWorkHours * 60 : 0);
    if (hwMin > 0 && otMin > 0) {
      mergedShifts[id] = {
        ...s,
        isHolidayWork: true,
        overtimeMinutes: 0,
        overtimeHours: 0,
        overtimeStartTime: undefined,
        overtimeEndTime: undefined,
      };
    }
  }

  // 2. 予定イベントのマージ（IDごと）
  const mergedEvents: Record<string, ScheduleEvent> = { ...local.events };
  for (const [id, remoteEvent] of Object.entries(remote.events || {})) {
    const localEvent = mergedEvents[id];
    if (!localEvent || toTimeMs(remoteEvent.updatedAt) > toTimeMs(localEvent.updatedAt)) {
      mergedEvents[id] = remoteEvent;
    }
  }

  // 3. すれ違いサポートアイコン（日付ごと）のマージ
  const mergedSupports: Record<string, DaySupportEntry> = { ...(local.daySupports || {}) };
  for (const [date, remoteSup] of Object.entries(remote.daySupports || {})) {
    const localSup = mergedSupports[date];
    if (!localSup || toTimeMs(remoteSup.updatedAt) > toTimeMs(localSup.updatedAt)) {
      mergedSupports[date] = remoteSup;
    }
  }

  // 4. スタンププリセットのマージ（旧デフォルトスタンプは除外し、更新日時が新しい方を優先しつつ統合）
  const isRemoteNewer = toTimeMs(remote.updatedAt) > toTimeMs(local.updatedAt);
  const primaryStamps = (isRemoteNewer ? remote.stamps : local.stamps) || [];
  const secondaryStamps = (isRemoteNewer ? local.stamps : remote.stamps) || [];

  const stampMap = new Map<string, StampPreset>();
  for (const s of DEFAULT_STAMP_PRESETS) {
    stampMap.set(s.id, s);
  }
  for (const s of secondaryStamps) {
    if (!LEGACY_DEFAULT_STAMP_IDS.has(s.id) && s.type === 'shift') {
      stampMap.set(s.id, { ...s, partnerId: s.partnerId || 'partnerA' });
    }
  }
  for (const s of primaryStamps) {
    if (!LEGACY_DEFAULT_STAMP_IDS.has(s.id) && s.type === 'shift') {
      stampMap.set(s.id, { ...s, partnerId: s.partnerId || 'partnerA' });
    }
  }
  const mergedStamps = Array.from(stampMap.values()).sort((a, b) => a.order - b.order);

  // 4-2. カレンダー予定項目（categories）のマージ
  const mergedCategories =
    toTimeMs(remote.updatedAt) > toTimeMs(local.updatedAt)
      ? remote.categories || local.categories
      : local.categories || remote.categories;

  // 5. メタデータ＆最終確認日時（lastSeenAt は常に新しい方を採用）
  const localMeta = local.metadata;
  const remoteMeta = remote.metadata;

  // 📸 お気に入り写真・ウェルカム設定のマージ保護
  // ローカルに写真があれば、クラウド同期で写真が未設定のリモートデータが降ってきても100%ローカルの写真を保持！
  const localWelcome = localMeta?.welcomeImageConfig;
  const remoteWelcome = remoteMeta?.welcomeImageConfig;
  let mergedWelcome: WelcomeImageConfig | undefined = localWelcome || remoteWelcome;

  if (localWelcome?.dataUrl) {
    // ローカルに写真があれば絶対に保護
    mergedWelcome = localWelcome;
  } else if (remoteWelcome?.dataUrl) {
    // ローカルに無くてリモートに写真があれば採用
    mergedWelcome = remoteWelcome;
  } else if (localWelcome) {
    mergedWelcome = localWelcome;
  } else if (remoteWelcome) {
    mergedWelcome = remoteWelcome;
  }

  // 👫 パートナーA / B のアイコン・プロフィールマージ保護（相手端末の同期でアイコンが初期化されるのを完全防止）
  const mergePartnerProfile = (
    pid: 'partnerA' | 'partnerB',
    defaultAvatar: string,
    defaultName: string
  ) => {
    const locP = localMeta?.partners?.[pid];
    const remP = remoteMeta?.partners?.[pid];
    if (!locP && !remP) {
      return { name: defaultName, avatar: defaultAvatar, themeColor: '', bgColor: '', lastSeenAt: '' };
    }
    if (!remP) return locP;
    if (!locP) return remP;

    // もしローカルのアバターがデフォルト以外にカスタマイズされていて、リモートがデフォルトならローカルを優先
    const locCustom = locP.avatar && locP.avatar !== defaultAvatar;
    const remCustom = remP.avatar && remP.avatar !== defaultAvatar;

    let chosenAvatar = locP.avatar || defaultAvatar;
    let chosenName = locP.name || defaultName;

    if (locCustom && !remCustom) {
      chosenAvatar = locP.avatar;
    } else if (!locCustom && remCustom) {
      chosenAvatar = remP.avatar;
    } else {
      // 両方カスタムまたは両方デフォルトの場合は更新時刻が新しい方を優先
      chosenAvatar =
        toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt)
          ? remP.avatar || locP.avatar || defaultAvatar
          : locP.avatar || remP.avatar || defaultAvatar;
    }

    if (locP.name && locP.name !== defaultName && (!remP.name || remP.name === defaultName)) {
      chosenName = locP.name;
    } else if (remP.name && remP.name !== defaultName && (!locP.name || locP.name === defaultName)) {
      chosenName = remP.name;
    } else {
      chosenName =
        toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt)
          ? remP.name || locP.name || defaultName
          : locP.name || remP.name || defaultName;
    }

    const lastSeen =
      toTimeMs(remP.lastSeenAt) > toTimeMs(locP.lastSeenAt)
        ? remP.lastSeenAt
        : locP.lastSeenAt;

    return {
      ...(toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt) ? remP : locP),
      name: chosenName,
      avatar: chosenAvatar,
      lastSeenAt: lastSeen,
    };
  };

  const partnerA = mergePartnerProfile('partnerA', '🐻', 'ゆうと');
  const partnerB = mergePartnerProfile('partnerB', '🐰', 'さや');

  const nowIso = new Date().toISOString();

  return {
    version: 1,
    metadata: {
      partners: {
        partnerA,
        partnerB,
      },
      welcomeImageConfig: mergedWelcome,
      lastSyncedAt: nowIso,
      updatedAt:
        toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt)
          ? remoteMeta.updatedAt
          : localMeta.updatedAt || nowIso,
    },
    categories: mergedCategories,
    stamps: mergedStamps,
    shifts: mergedShifts,
    events: mergedEvents,
    daySupports: mergedSupports,
    updatedAt: nowIso,
  };
}

// ローカルからデータストアを読み込み（写真専用ストレージとも自動連携復元）
export async function loadLocalStore(): Promise<CalendarDataStore> {
  let loadedStore: CalendarDataStore | null = null;
  const idbData = await idbGet<CalendarDataStore>(LS_STORE_KEY);
  if (idbData && idbData.version) {
    loadedStore = idbData;
  } else {
    try {
      const raw = localStorage.getItem(LS_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CalendarDataStore;
        if (parsed && parsed.version) {
          await idbSet(LS_STORE_KEY, parsed);
          loadedStore = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!loadedStore) {
    loadedStore = createInitialDataStore();
    await saveLocalStore(loadedStore);
  }

  // 📸 写真専用ストレージからの確実な復元（ストア内に写真が無ければ独立保存領域から復元）
  const dedicatedPhoto = await loadDedicatedWelcomePhoto();
  if (dedicatedPhoto && dedicatedPhoto.dataUrl) {
    if (!loadedStore.metadata?.welcomeImageConfig?.dataUrl) {
      loadedStore = {
        ...loadedStore,
        metadata: {
          ...loadedStore.metadata,
          welcomeImageConfig: dedicatedPhoto,
        },
      };
    }
  }

  return loadedStore;
}

// ローカルへデータストアを保存（IndexedDB + localStorage 両方に保存し、写真専用ストレージにも二重保存）
export async function saveLocalStore(
  store: CalendarDataStore,
  password?: string
): Promise<void> {
  // 📸 写真データがあれば専用ストレージにも即座に二重保存（クラウド同期や容量制限で消えるのを100%防止）
  if (store.metadata?.welcomeImageConfig?.dataUrl) {
    await saveDedicatedWelcomePhoto(store.metadata.welcomeImageConfig);
  }

  try {
    localStorage.setItem(LS_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota error
  }
  await idbSet(LS_STORE_KEY, store);

  if (password) {
    try {
      const encrypted = await encryptCalendarStore(store, password);
      localStorage.setItem(LS_ENCRYPTED_KEY, JSON.stringify(encrypted));
      await idbSet(LS_ENCRYPTED_KEY, encrypted);
    } catch {
      // ignore
    }
  }
}

// 保存済みパスワードハッシュの取得・設定
export function getSavedPassHash(): string | null {
  return localStorage.getItem(LS_PASS_HASH_KEY);
}

export function setSavedPassHash(hash: string | null): void {
  if (!hash) {
    localStorage.removeItem(LS_PASS_HASH_KEY);
  } else {
    localStorage.setItem(LS_PASS_HASH_KEY, hash);
  }
}

// 現在操作中のパートナーID（夫 / 妻）の取得・保存
export function getActivePartnerId(): PartnerId {
  const saved = localStorage.getItem(LS_ACTIVE_PARTNER_KEY);
  return saved === 'partnerB' ? 'partnerB' : 'partnerA';
}

export function setActivePartnerId(partnerId: PartnerId): void {
  localStorage.setItem(LS_ACTIVE_PARTNER_KEY, partnerId);
}

// クラウド同期設定の取得・保存（特定の合言葉が入力された場合のみ自動同期が有効になる）
export function loadSyncConfig(): CloudSyncConfig {
  const defaults = getDefaultCloudCredentials();
  const isKeywordAuthenticated = Boolean(getSavedSharedKeyword());
  try {
    const raw = localStorage.getItem(LS_SYNC_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CloudSyncConfig;
      const token = parsed.githubToken?.trim() || defaults.token;
      const gistId = parsed.gistId?.trim() || defaults.gistId;
      return {
        ...parsed,
        enabled: isKeywordAuthenticated && Boolean(token && (parsed.mode === 'repo' ? parsed.repoOwner : gistId)),
        githubToken: token,
        gistId,
        autoSync: parsed.autoSync ?? true,
      };
    }
  } catch {
    // ignore
  }
  return {
    enabled: isKeywordAuthenticated && Boolean(defaults.token && defaults.gistId),
    mode: 'gist',
    githubToken: defaults.token,
    gistId: defaults.gistId,
    repoOwner: 'rokiwo',
    repoName: 'debacal',
    repoBranch: 'main',
    repoFilePath: 'data/calendar-encrypted.json',
    autoSync: true,
  };
}

export function saveSyncConfig(config: CloudSyncConfig): void {
  localStorage.setItem(LS_SYNC_CONFIG_KEY, JSON.stringify(config));
}

// UTF-8 文字列と Base64 の変換（GitHub Contents API用）
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const clean = b64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// 新しいシークレットGistをワンタップで自動作成
export async function createNewSecretGist(
  githubToken: string,
  store: CalendarDataStore,
  password: string
): Promise<string> {
  const defaults = getDefaultCloudCredentials();
  const effectivePass = password?.trim() || defaults.defaultPass;
  const effectiveToken = githubToken?.trim() || defaults.token;
  const encrypted = await encryptCalendarStore(store, effectivePass);
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${effectiveToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: 'デバカレ (DebaCal) 暗号化スケジュールデータ（AES-GCM 256bit）',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(encrypted, null, 2),
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gistの作成に失敗しました (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.id as string;
}

// GitHub (Secret Gist または リポジトリ内専用データファイル) と双方向マージ同期を実行
export async function syncWithGitHub(
  localStore: CalendarDataStore,
  config: CloudSyncConfig,
  password?: string
): Promise<{ mergedStore: CalendarDataStore; statusMessage: string }> {
  const defaults = getDefaultCloudCredentials();
  const effectiveToken = config.githubToken?.trim() || defaults.token;
  const effectiveGistId = config.gistId?.trim() || defaults.gistId;
  const effectivePass = password?.trim() || defaults.defaultPass;

  if (!effectiveToken) {
    throw new Error('クラウド同期トークンが設定されていません。');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${effectiveToken}`,
    'Content-Type': 'application/json',
  };

  let mergedStore = localStore;

  if (config.mode === 'gist') {
    if (!effectiveGistId) {
      throw new Error('Gist ID が未設定です。');
    }
    const gistUrl = `https://api.github.com/gists/${effectiveGistId}`;
    const getRes = await fetch(gistUrl, { headers, cache: 'no-store' });
    if (!getRes.ok) {
      throw new Error(`クラウドデータの取得に失敗しました (${getRes.status})。`);
    }
    const gistData = await getRes.json();
    const fileObj =
      gistData.files?.[GIST_FILENAME] ||
      (Object.values(gistData.files || {})[0] as { content?: string } | undefined);

    if (fileObj && fileObj.content) {
      try {
        const parsed = JSON.parse(fileObj.content) as EncryptedPayload;
        if (parsed && parsed.app === 'FutariCal') {
          try {
            const remoteStore = await decryptCalendarStore(parsed, effectivePass);
            mergedStore = mergeCalendarStores(localStore, remoteStore);
          } catch {
            // カスタムパスワードからデフォルトキーへフォールバック試行
            const remoteStore = await decryptCalendarStore(parsed, defaults.defaultPass);
            mergedStore = mergeCalendarStores(localStore, remoteStore);
          }
        }
      } catch {
        // 初回または空ファイルの場合はそのままアップロードへ進む
      }
    }

    // マージ後のストアを暗号化してGistへ保存
    const encrypted = await encryptCalendarStore(mergedStore, effectivePass);
    const patchRes = await fetch(gistUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(encrypted, null, 2),
          },
        },
      }),
    });

    if (!patchRes.ok) {
      throw new Error(`クラウドへの保存に失敗しました (${patchRes.status})。`);
    }

    await saveLocalStore(mergedStore, effectivePass);
    return {
      mergedStore,
      statusMessage: '✨ 夫婦クラウドと自動同期しました！',
    };
  } else {
    // リポジトリ内専用ファイル (例: data/calendar-encrypted.json) モード
    const owner = config.repoOwner?.trim() || 'rokiwo';
    const repo = config.repoName?.trim() || 'debacal';
    const branch = config.repoBranch?.trim() || 'main';
    const filePath = (config.repoFilePath?.trim() || 'data/calendar-encrypted.json').replace(/^\/+/, '');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    let existingSha: string | undefined;

    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
      headers,
      cache: 'no-store',
    });

    if (getRes.ok) {
      const fileData = await getRes.json();
      existingSha = fileData.sha;
      if (fileData.content) {
        const jsonStr = base64ToUtf8(fileData.content);
        const parsed = JSON.parse(jsonStr) as EncryptedPayload;
        if (parsed && parsed.app === 'FutariCal') {
          const remoteStore = await decryptCalendarStore(parsed, effectivePass);
          mergedStore = mergeCalendarStores(localStore, remoteStore);
        }
      }
    } else if (getRes.status !== 404) {
      throw new Error(`リポジトリデータ取得エラー (${getRes.status})`);
    }

    const encrypted = await encryptCalendarStore(mergedStore, effectivePass);
    const contentB64 = utf8ToBase64(JSON.stringify(encrypted, null, 2));

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Sync encrypted calendar data (${new Date().toLocaleString('ja-JP')})`,
        content: contentB64,
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });

    if (!putRes.ok) {
      throw new Error(`リポジトリへの暗号化データ保存に失敗しました (${putRes.status})`);
    }

    await saveLocalStore(mergedStore, effectivePass);
    return {
      mergedStore,
      statusMessage: `✨ 夫婦クラウド (${owner}/${repo}) と自動同期しました！`,
    };
  }
}
