import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDataStore,
  CloudSyncConfig,
  FilterCategoryId,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
  WelcomeImageConfig,
} from './types/calendar';
import {
  createInitialDataStore,
  createUploaded2026NovShifts,
  DEFAULT_CATEGORIES,
  DEFAULT_STAMP_PRESETS,
  SAYA_DEFAULT_STAMPS,
  formatMinutesToJa,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
  LEGACY_DEFAULT_STAMP_IDS,
} from './utils/presets';
import { hashPasscode } from './utils/crypto';
import {
  getActivePartnerId,
  getSavedPassHash,
  loadLocalStore,
  loadSyncConfig,
  mergeCalendarStores,
  saveDedicatedWelcomePhoto,
  loadDedicatedWelcomePhoto,
  saveLocalStore,
  saveSyncConfig,
  setActivePartnerId,
  setSavedPassHash,
  syncWithGitHub,
  getSavedSharedKeyword,
  setSavedSharedKeyword,
  isSharedKeywordValid,
  setCustomKeywordDef,
  getCustomKeywordDef,
} from './utils/storage';
import { MonthlyOvertimeSummary, TopHeader } from './components/TopHeader';
import { MonthlyCalendarGrid } from './components/MonthlyCalendarGrid';
import { StampDrawer, StampDrawerTab } from './components/StampDrawer';
import { DayDetailModal } from './components/DayDetailModal';
import { SettingsAndSyncModal } from './components/SettingsAndSyncModal';
import { ShiftStampManagerModal } from './components/ShiftStampManagerModal';
import { ShiftImageOcrModal } from './components/ShiftImageOcrModal';
import { VoiceEventModal } from './components/VoiceEventModal';
import { WidgetCompactView, WidgetGuideModal } from './components/WidgetModalAndView';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { ExportPartnerMode, ShiftExportModal } from './components/ShiftExportModal';
import { TaskManagerModal } from './components/TaskManagerModal';
import { WelcomeImageModal } from './components/WelcomeImageModal';
import { SharedKeywordModal } from './components/SharedKeywordModal';
import { PartnerEventsModal } from './components/PartnerEventsModal';
import { ConfirmOvertimeCard } from './components/ConfirmOvertimeCard';
import { ErrorBoundary } from './components/ErrorBoundary';

// 日付文字列 "YYYY-MM-DD" に deltaDays 日を加算した "YYYY-MM-DD" を返す
function addDaysToDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export const App: React.FC = () => {
  const now = new Date();
  const initialDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}`;

  const [store, setStore] = useState<CalendarDataStore>(() => createInitialDataStore());
  const [isLoaded, setIsLoaded] = useState(false);

  // デフォルトで「📅月間カレンダー」画面で起動（ウィジェットはヘッダーの「🏠ウィジェット」ボタンから閲覧可能）
  const [isWidgetMode, setIsWidgetMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'widget';
  });

  // 表示中の年月・選択日
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(initialDateStr);

  // 操作中のパートナー（夫 / 妻）
  const [activePartner, setActivePartner] = useState<PartnerId>(() => getActivePartnerId());

  // フィルタ＆表示モード（コンパクト3件表示をデフォルトにし、ヘッダーから全件表示へ切替可能）
  const [filterCategory, setFilterCategory] = useState<FilterCategoryId>('all');
  const [isExpandedView, setIsExpandedView] = useState<boolean>(false);
  const [showShiftTimeInCell, setShowShiftTimeInCell] = useState<boolean>(false);

  // シフト連続入力ドロワー状態 ＆ 連続翌日移動ON/OFF
  const [stampDrawerOpen, setStampDrawerOpen] = useState<boolean>(false);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [stampDrawerTab, setStampDrawerTab] = useState<StampDrawerTab>(() =>
    getActivePartnerId() === 'partnerB' ? 'partnerB_shift' : 'partnerA_shift'
  );
  const [selectedStampId, setSelectedStampId] = useState<string | null>(() =>
    getActivePartnerId() === 'partnerB' ? 'shift_b_day' : 'shift_a_day'
  );

  // 各種モーダル開閉状態
  const [dayDetailOpen, setDayDetailOpen] = useState<boolean>(false);
  const [openEventFormDirectly, setOpenEventFormDirectly] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [shiftManagerOpen, setShiftManagerOpen] = useState<boolean>(false);
  const [shiftManagerPartner, setShiftManagerPartner] = useState<PartnerId>('partnerA');
  const [categoryManagerOpen, setCategoryManagerOpen] = useState<boolean>(false);
  const [imageOcrOpen, setImageOcrOpen] = useState<boolean>(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState<boolean>(false);
  const [widgetGuideOpen, setWidgetGuideOpen] = useState<boolean>(false);
  const [shiftExportOpen, setShiftExportOpen] = useState<boolean>(false);
  const [shiftExportMode, setShiftExportMode] = useState<ExportPartnerMode>('partnerA');
  const [taskManagerOpen, setTaskManagerOpen] = useState<boolean>(false);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState<boolean>(false);
  const [welcomePreviewConfig, setWelcomePreviewConfig] = useState<WelcomeImageConfig | null>(null);
  const [partnerEventsModalOpen, setPartnerEventsModalOpen] = useState<boolean>(false);

  // クラウド同期状態（特定の合言葉が入力された場合のみ共有同期が有効になる）
  const [savedSharedKeyword, setSavedSharedKeywordState] = useState<string | null>(() => getSavedSharedKeyword());
  const [sharedKeywordModalOpen, setSharedKeywordModalOpen] = useState<boolean>(false);
  const [savedPassHash, setSavedPassHashState] = useState<string | null>(null);
  const [sessionPassword, setSessionPassword] = useState<string>('');
  const [syncConfig, setSyncConfig] = useState<CloudSyncConfig>(() => loadSyncConfig());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // トースト通知メッセージ
  const [toastText, setToastText] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastText(msg);
  }, []);

  useEffect(() => {
    if (!toastText) return;
    const timer = setTimeout(() => setToastText(null), 2400);
    return () => clearTimeout(timer);
  }, [toastText]);

  // 📱 スマホの戻る操作（Androidの戻るボタン / iPhoneの画面端スワイプ戻る）でアプリが終了せずモーダルやドロワーが閉じるようにするHistory API連動ナビゲーション
  const dayDetailOpenRef = useRef(dayDetailOpen);
  const settingsOpenRef = useRef(settingsOpen);
  const shiftManagerOpenRef = useRef(shiftManagerOpen);
  const categoryManagerOpenRef = useRef(categoryManagerOpen);
  const imageOcrOpenRef = useRef(imageOcrOpen);
  const voiceModalOpenRef = useRef(voiceModalOpen);
  const widgetGuideOpenRef = useRef(widgetGuideOpen);
  const shiftExportOpenRef = useRef(shiftExportOpen);
  const taskManagerOpenRef = useRef(taskManagerOpen);
  const welcomeModalOpenRef = useRef(welcomeModalOpen);
  const sharedKeywordModalOpenRef = useRef(sharedKeywordModalOpen);
  const partnerEventsModalOpenRef = useRef(partnerEventsModalOpen);
  const stampDrawerOpenRef = useRef(stampDrawerOpen);
  const isWidgetModeRef = useRef(isWidgetMode);
  const lastBackPressTimeRef = useRef<number>(0);
  const isInternalBackRef = useRef<boolean>(false);

  useEffect(() => { dayDetailOpenRef.current = dayDetailOpen; }, [dayDetailOpen]);
  useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);
  useEffect(() => { shiftManagerOpenRef.current = shiftManagerOpen; }, [shiftManagerOpen]);
  useEffect(() => { categoryManagerOpenRef.current = categoryManagerOpen; }, [categoryManagerOpen]);
  useEffect(() => { imageOcrOpenRef.current = imageOcrOpen; }, [imageOcrOpen]);
  useEffect(() => { voiceModalOpenRef.current = voiceModalOpen; }, [voiceModalOpen]);
  useEffect(() => { widgetGuideOpenRef.current = widgetGuideOpen; }, [widgetGuideOpen]);
  useEffect(() => { shiftExportOpenRef.current = shiftExportOpen; }, [shiftExportOpen]);
  useEffect(() => { taskManagerOpenRef.current = taskManagerOpen; }, [taskManagerOpen]);
  useEffect(() => { welcomeModalOpenRef.current = welcomeModalOpen; }, [welcomeModalOpen]);
  useEffect(() => { sharedKeywordModalOpenRef.current = sharedKeywordModalOpen; }, [sharedKeywordModalOpen]);
  useEffect(() => { partnerEventsModalOpenRef.current = partnerEventsModalOpen; }, [partnerEventsModalOpen]);
  useEffect(() => { stampDrawerOpenRef.current = stampDrawerOpen; }, [stampDrawerOpen]);
  useEffect(() => { isWidgetModeRef.current = isWidgetMode; }, [isWidgetMode]);

  // 新しいモーダルや画面レイヤーを開く際に履歴を1つ進める
  const pushNavLayer = useCallback((layerName: string) => {
    try {
      window.history.pushState({ futarical_layer: layerName, time: Date.now() }, '');
    } catch {
      // ignore
    }
  }, []);

  // UI上の「閉じる / ✕」ボタンを押した時のクローズ処理（履歴スタックも正常に巻き戻す）
  const closeNavLayer = useCallback((closeAction: () => void) => {
    closeAction();
    try {
      if (window.history.state && window.history.state.futarical_layer) {
        isInternalBackRef.current = true;
        window.history.back();
      }
    } catch {
      // ignore
    }
  }, []);

  // モーダル・ドロワー・画面の開閉ラッパー関数
  const openDayDetailModal = useCallback(
    (dateStr: string, directEventForm = false) => {
      setSelectedDate(dateStr);
      const [ny, nm] = dateStr.split('-').map(Number);
      setYear(ny);
      setMonth(nm);
      setOpenEventFormDirectly(directEventForm);
      setDayDetailOpen(true);
      pushNavLayer('dayDetail');
    },
    [pushNavLayer]
  );

  const openSettingsModal = useCallback(() => {
    setSettingsOpen(true);
    pushNavLayer('settings');
  }, [pushNavLayer]);

  const openShiftManagerModal = useCallback(
    (partnerId?: PartnerId) => {
      setShiftManagerPartner(partnerId || activePartner);
      setShiftManagerOpen(true);
      pushNavLayer('shiftManager');
    },
    [activePartner, pushNavLayer]
  );

  const openCategoryManagerModal = useCallback(() => {
    setCategoryManagerOpen(true);
    pushNavLayer('categoryManager');
  }, [pushNavLayer]);

  const openImageOcrModal = useCallback(() => {
    setImageOcrOpen(true);
    pushNavLayer('imageOcr');
  }, [pushNavLayer]);

  const openVoiceModal = useCallback(
    (dateStr?: string) => {
      if (dateStr) setSelectedDate(dateStr);
      setVoiceModalOpen(true);
      pushNavLayer('voice');
    },
    [pushNavLayer]
  );

  const openWidgetGuideModal = useCallback(() => {
    setWidgetGuideOpen(true);
    pushNavLayer('widgetGuide');
  }, [pushNavLayer]);

  const openShiftExportModal = useCallback(
    (defaultMode?: ExportPartnerMode) => {
      if (defaultMode) setShiftExportMode(defaultMode);
      setShiftExportOpen(true);
      pushNavLayer('shiftExport');
    },
    [pushNavLayer]
  );

  const openStampDrawer = useCallback(() => {
    setStampDrawerOpen(true);
    pushNavLayer('stampDrawer');
  }, [pushNavLayer]);

  const openTaskManagerModal = useCallback(() => {
    setTaskManagerOpen(true);
    pushNavLayer('taskManager');
  }, [pushNavLayer]);

  const openWelcomeModal = useCallback(() => {
    setWelcomePreviewConfig(null);
    setWelcomeModalOpen(true);
    pushNavLayer('welcomeModal');
  }, [pushNavLayer]);

  const openSharedKeywordModal = useCallback(() => {
    setSharedKeywordModalOpen(true);
    pushNavLayer('sharedKeyword');
  }, [pushNavLayer]);

  const openPartnerEventsModal = useCallback(() => {
    setPartnerEventsModalOpen(true);
    pushNavLayer('partnerEvents');
  }, [pushNavLayer]);

  const enterCalendarMode = useCallback(() => {
    setIsWidgetMode(false);
    pushNavLayer('calendar');
  }, [pushNavLayer]);

  // Android戻るボタン／iPhone戻るスワイプ（popstate）のインターセプト処理
  useEffect(() => {
    try {
      window.history.replaceState({ futarical_root: true }, '');
      window.history.pushState({ futarical_home: true }, '');
    } catch {
      // ignore
    }

    const handlePopState = () => {
      // 内部の✕ボタン等でhistory.back()が呼ばれた場合はhandlePopStateの処理をスキップ
      if (isInternalBackRef.current) {
        isInternalBackRef.current = false;
        return;
      }

      // 1. もしモーダルが開いていればモーダルを閉じる
      if (
        dayDetailOpenRef.current ||
        settingsOpenRef.current ||
        shiftManagerOpenRef.current ||
        categoryManagerOpenRef.current ||
        imageOcrOpenRef.current ||
        voiceModalOpenRef.current ||
        widgetGuideOpenRef.current ||
        shiftExportOpenRef.current ||
        taskManagerOpenRef.current ||
        welcomeModalOpenRef.current ||
        sharedKeywordModalOpenRef.current ||
        partnerEventsModalOpenRef.current
      ) {
        setDayDetailOpen(false);
        setOpenEventFormDirectly(false);
        setSettingsOpen(false);
        setShiftManagerOpen(false);
        setCategoryManagerOpen(false);
        setImageOcrOpen(false);
        setVoiceModalOpen(false);
        setWidgetGuideOpen(false);
        setShiftExportOpen(false);
        setTaskManagerOpen(false);
        setWelcomeModalOpen(false);
        setWelcomePreviewConfig(null);
        setSharedKeywordModalOpen(false);
        setPartnerEventsModalOpen(false);
        return;
      }

      // 2. もしシフト入力ドロワーが開いていれば閉じる
      if (stampDrawerOpenRef.current) {
        setStampDrawerOpen(false);
        return;
      }

      // 3. もしウィジェット画面（isWidgetMode）ならカレンダー画面に戻る
      if (isWidgetModeRef.current) {
        setIsWidgetMode(false);
        return;
      }

      // 4. ホーム画面での誤終了防止（2度押し離脱ガード）
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        // 2秒以内に再度戻るが押されたらブラウザ履歴に従って終了
        window.history.back();
      } else {
        lastBackPressTimeRef.current = now;
        showToast('💡 もう一度「戻る」を押すとアプリを終了します');
        try {
          window.history.pushState({ futarical_home: true }, '');
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showToast]);

  // 初回ロード（IndexedDB / localStorage から復元＋夫の12種シフトプリセット＆妻の空リスト自動適用＋#key招待リンク自動解除）
  useEffect(() => {
    let mounted = true;

    // 1. URLハッシュに #key=... が含まれていれば、パートナー招待リンクとして自動ロック解除＆保存しURL欄から消去
    let inviteKeyFromHash = '';
    if (window.location.hash.startsWith('#key=')) {
      try {
        inviteKeyFromHash = decodeURIComponent(window.location.hash.slice(5)).trim();
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search
        );
      } catch {
        // ignore
      }
    }

    loadLocalStore().then(async (loaded) => {
      if (!mounted) return;

      // ご要望：「パスワードロック機能いらないや」を自動適用（既存のロックハッシュをクリア）
      const DISABLE_PASSCODE_FLAG = 'paircal_disable_passcode_lock_20261104_v1';
      if (localStorage.getItem(DISABLE_PASSCODE_FLAG) !== '1') {
        localStorage.removeItem('futarical_pass_hash_v1');
        setSavedPassHash(null);
        setSavedPassHashState(null);
        localStorage.setItem(DISABLE_PASSCODE_FLAG, '1');
      }

      let activeSessionPass = '';
      if (inviteKeyFromHash && inviteKeyFromHash.length >= 4) {
        setSessionPassword(inviteKeyFromHash);
        activeSessionPass = inviteKeyFromHash;
      }

      // ご要望：「既存の予定データとシフトデータを削除しておいてほしい」を自動適用
      const CLEAR_SHIFTS_AND_EVENTS_FLAG = 'futarical_clear_all_shifts_and_events_20261103_v2';
      const shouldClearAll = localStorage.getItem(CLEAR_SHIFTS_AND_EVENTS_FLAG) !== '1';

      // ご要望：「夫の方の12種の勤務リストを登録し、妻の方は空にしておく」を自動適用
      const HUSBAND_12_SHIFTS_FLAG = 'futarical_husband_shifts_preset_20261104_v4';
      const shouldApplyHusband12Presets =
        localStorage.getItem(HUSBAND_12_SHIFTS_FLAG) !== '1';

      // 添付の2026年11月ナスカレ勤務表（30日分）を自動適用
      const NURSECAL_2026_11_FLAG = 'futarical_nursecal_202611_preset_v1';
      const shouldApplyNursecal202611 =
        localStorage.getItem(NURSECAL_2026_11_FLAG) !== '1';

      // ご要望：「さやの方のシフト入力テンプレ（10種＋休み・有休）」を自動適用
      const SAYA_10_SHIFTS_FLAG = 'paircal_saya_shifts_preset_20261104_v2';
      const shouldApplySayaPresets =
        localStorage.getItem(SAYA_10_SHIFTS_FLAG) !== '1';

      const cleanedLoadedStamps = (loaded.stamps || [])
        .filter((s) => s.type === 'shift' && !LEGACY_DEFAULT_STAMP_IDS.has(s.id))
        .map((s) => ({ ...s, partnerId: s.partnerId || 'partnerA' }));

      // 既存のスタンプデータがある場合はユーザーのカスタム編集・アイコンを最優先で維持！
      let nextStamps =
        cleanedLoadedStamps.length > 0
          ? cleanedLoadedStamps
          : [...DEFAULT_STAMP_PRESETS];

      let nextMetadata = loaded.metadata;
      if (shouldApplySayaPresets && !nextStamps.some((s) => s.partnerId === 'partnerB')) {
        // さや（partnerB）のスタンプが未登録の場合のみ初期テンプレを投入
        const nonPartnerBStamps = nextStamps.filter((s) => s.partnerId !== 'partnerB');
        nextStamps = [...nonPartnerBStamps, ...SAYA_DEFAULT_STAMPS];
      }

      if (nextMetadata?.partners?.partnerB?.name === '妻') {
        nextMetadata = {
          ...nextMetadata,
          partners: {
            ...nextMetadata.partners,
            partnerB: {
              ...nextMetadata.partners.partnerB,
              name: 'さや',
            },
          },
        };
      }

      // ご要望：「夫→ゆうとに名前変更」を自動適用
      const YUUTO_NAME_FLAG = 'paircal_yuuto_name_preset_20261105_v1';
      let hasRenamedToYuuto = false;
      if (localStorage.getItem(YUUTO_NAME_FLAG) !== '1') {
        if (!nextMetadata?.partners?.partnerA?.name || nextMetadata.partners.partnerA.name === '夫') {
          nextMetadata = {
            ...nextMetadata,
            partners: {
              ...nextMetadata.partners,
              partnerA: {
                ...nextMetadata.partners.partnerA,
                name: 'ゆうと',
              },
            },
          };
          hasRenamedToYuuto = true;
        }
        localStorage.setItem(YUUTO_NAME_FLAG, '1');
      }

      // カテゴリ名の「夫予定」も「ゆうと予定」に自動追従
      const nextCategories = (loaded.categories && loaded.categories.length > 0
        ? loaded.categories
        : DEFAULT_CATEGORIES
      ).map((cat) => {
        if (cat.id === 'partnerA' && (cat.label === '夫予定' || cat.shortLabel === '夫予定')) {
          return {
            ...cat,
            label: 'ゆうと予定',
            shortLabel: 'ゆうと予定',
          };
        }
        return cat;
      });

      const baseShifts = shouldClearAll ? {} : loaded.shifts || {};
      const nextShiftsRaw = shouldApplyNursecal202611
        ? { ...baseShifts, ...createUploaded2026NovShifts('partnerA', nextStamps) }
        : baseShifts;

      // 過去の二重登録バグの修復 ＆ 未来日の残業・休日出勤をすべて固定で仮予定に補正
      let shiftsRepaired = false;
      const nextShifts = { ...nextShiftsRaw };
      const todayStr = new Date().toISOString().split('T')[0];
      for (const [k, s] of Object.entries(nextShifts)) {
        if (!s || s.deletedAt) continue;
        const otMin = getShiftOvertimeMinutes(s);
        const hwMin = getShiftHolidayWorkMinutes(s);
        let modified = false;
        let patched = { ...s };

        if (hwMin > 0 && otMin > 0) {
          // 休出フラグまたは同額重複の場合は休出として残業を0にリセット
          patched = {
            ...patched,
            isHolidayWork: true,
            overtimeMinutes: 0,
            overtimeHours: 0,
            overtimeStartTime: undefined,
            overtimeEndTime: undefined,
          };
          modified = true;
        }

        // 💡 ユーザー要望：未来日（今日より後）に入っている残業・休日出勤は、固定で仮予定（未確定）に補正
        if (s.date > todayStr) {
          const hasOt = (patched.overtimeMinutes && patched.overtimeMinutes > 0) || (patched.overtimeHours && patched.overtimeHours > 0);
          const hasHw = patched.isHolidayWork || (patched.holidayWorkMinutes && patched.holidayWorkMinutes > 0) || (patched.holidayWorkHours && patched.holidayWorkHours > 0) || patched.stampId === 'shift_hol_work';

          if (hasOt && !patched.isTentativeOvertime) {
            patched.isTentativeOvertime = true;
            patched.overtimeStatus = 'tentative';
            modified = true;
          }
          if (hasHw && !patched.isTentativeHolidayWork) {
            patched.isTentativeHolidayWork = true;
            patched.holidayWorkStatus = 'tentative';
            modified = true;
          }
        }

        if (modified) {
          patched.updatedAt = new Date().toISOString();
          nextShifts[k] = patched;
          shiftsRepaired = true;
        }
      }

      const nowIso = new Date().toISOString();
      const hasAnyPresetChange =
        shouldApplyHusband12Presets ||
        shouldApplyNursecal202611 ||
        shouldApplySayaPresets ||
        hasRenamedToYuuto ||
        shiftsRepaired;

      const nextStore: CalendarDataStore = {
        ...loaded,
        metadata: nextMetadata || loaded.metadata,
        shifts: nextShifts,
        events: shouldClearAll ? {} : loaded.events || {},
        daySupports: shouldClearAll ? {} : loaded.daySupports || {},
        categories: nextCategories,
        stamps: nextStamps,
        updatedAt: hasAnyPresetChange ? nowIso : loaded.updatedAt || nowIso,
      };

      if (shouldClearAll) {
        localStorage.setItem(CLEAR_SHIFTS_AND_EVENTS_FLAG, '1');
      }
      if (shouldApplyHusband12Presets) {
        localStorage.setItem(HUSBAND_12_SHIFTS_FLAG, '1');
      }
      if (shouldApplyNursecal202611) {
        localStorage.setItem(NURSECAL_2026_11_FLAG, '1');
      }
      if (shouldApplySayaPresets) {
        localStorage.setItem(SAYA_10_SHIFTS_FLAG, '1');
      }
      // 🔑 共有キーワード（合言葉）の認証状態をチェック
      let currentKeyword = getSavedSharedKeyword();
      if (!currentKeyword && inviteKeyFromHash && isSharedKeywordValid(inviteKeyFromHash)) {
        setSavedSharedKeyword(inviteKeyFromHash);
        currentKeyword = inviteKeyFromHash;
      }
      setSavedSharedKeywordState(currentKeyword);

      // 合言葉が未入力の場合（初回起動・未共有端末）はまっさらな状態のカレンダーで起動
      if (!currentKeyword) {
        const freshStore = createInitialDataStore();
        setStore(freshStore);
        setIsLoaded(true);
        // 初回ロード完了後にふんわり合言葉入力モーダルを開く
        setTimeout(() => {
          if (mounted) {
            setSharedKeywordModalOpen(true);
          }
        }, 350);
        return;
      }

      if (shouldClearAll || hasAnyPresetChange) {
        await saveLocalStore(nextStore, activeSessionPass || undefined);
      }

      setStore(nextStore);
      setIsLoaded(true);

      // 合言葉認証済みの端末のみクラウドから最新データを自動マージ取得
      const initialCfg = loadSyncConfig();
      if (initialCfg.enabled && initialCfg.githubToken) {
        try {
          setIsSyncing(true);
          const { mergedStore } = await syncWithGitHub(
            nextStore,
            initialCfg,
            activeSessionPass || undefined
          );
          if (mounted) {
            // 📸 クラウドから返ってきた mergedStore に写真が無い場合でもローカルの写真を100%保護
            const preservedWelcome =
              nextStore.metadata?.welcomeImageConfig?.dataUrl
                ? nextStore.metadata.welcomeImageConfig
                : mergedStore.metadata?.welcomeImageConfig;
            setStore({
              ...mergedStore,
              metadata: {
                ...mergedStore.metadata,
                welcomeImageConfig: preservedWelcome || mergedStore.metadata?.welcomeImageConfig,
              },
            });
          }
        } catch {
          // オフライン時はローカルデータを維持
        } finally {
          if (mounted) setIsSyncing(false);
        }
      }
    }).catch((err) => {
      console.error('Failed to load local store:', err);
      if (mounted) {
        setStore(createInitialDataStore());
        setIsLoaded(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 📸 起動時のお気に入り写真・ウェルカム画面自動表示
  const hasCheckedWelcomeLaunchRef = useRef(false);
  useEffect(() => {
    if (!isLoaded || hasCheckedWelcomeLaunchRef.current) return;
    hasCheckedWelcomeLaunchRef.current = true;

    const welcomeCfg = store.metadata?.welcomeImageConfig;
    if (welcomeCfg && welcomeCfg.enabled && welcomeCfg.dataUrl) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getDate()
      ).padStart(2, '0')}`;
      if (welcomeCfg.mode === 'daily') {
        if (welcomeCfg.lastShownDate !== todayStr) {
          openWelcomeModal();
        }
      } else {
        openWelcomeModal();
      }
    }
  }, [isLoaded, store.metadata?.welcomeImageConfig, openWelcomeModal]);

  // ストア変更時のローカル保存＆自動クラウド同期（合言葉未設定でもデフォルト夫婦暗号鍵で自動同期）
  const commitStore = useCallback(
    async (nextStore: CalendarDataStore, triggerAutoCloud = true) => {
      const stamped: CalendarDataStore = {
        ...nextStore,
        updatedAt: new Date().toISOString(),
      };
      setStore(stamped);
      await saveLocalStore(stamped, sessionPassword || undefined);

      if (
        triggerAutoCloud &&
        syncConfig.enabled &&
        syncConfig.autoSync &&
        syncConfig.githubToken
      ) {
        try {
          setIsSyncing(true);
          const { mergedStore } = await syncWithGitHub(stamped, syncConfig, sessionPassword);
          const preservedWelcome =
            stamped.metadata?.welcomeImageConfig?.dataUrl
              ? stamped.metadata.welcomeImageConfig
              : mergedStore.metadata?.welcomeImageConfig;
          setStore({
            ...mergedStore,
            metadata: {
              ...mergedStore.metadata,
              welcomeImageConfig: preservedWelcome || mergedStore.metadata?.welcomeImageConfig,
            },
          });
        } catch {
          // オフライン時はローカル保存を維持
        } finally {
          setIsSyncing(false);
        }
      }
    },
    [sessionPassword, syncConfig]
  );

  // 🔑 合言葉の検証と共有カレンダー同期開始
  const handleSubmitKeyword = useCallback(
    async (keyword: string): Promise<{ success: boolean; message?: string }> => {
      const isValid = isSharedKeywordValid(keyword);
      if (!isValid) {
        return {
          success: false,
          message: '合言葉が一致しませんでした。正しい合言葉を入力してください。',
        };
      }

      // 合言葉をローカルに保存
      setSavedSharedKeyword(keyword);
      setSavedSharedKeywordState(keyword);

      // クラウド同期設定を有効化
      const nextSyncCfg = loadSyncConfig();
      nextSyncCfg.enabled = true;
      saveSyncConfig(nextSyncCfg);
      setSyncConfig(nextSyncCfg);

      // 直ちにクラウドから最新データを同期ダウンロード
      try {
        setIsSyncing(true);
        const { mergedStore } = await syncWithGitHub(store, nextSyncCfg, sessionPassword);
        const preservedWelcome =
          store.metadata?.welcomeImageConfig?.dataUrl
            ? store.metadata.welcomeImageConfig
            : mergedStore.metadata?.welcomeImageConfig;
        const finalStore: CalendarDataStore = {
          ...mergedStore,
          metadata: {
            ...mergedStore.metadata,
            welcomeImageConfig: preservedWelcome || mergedStore.metadata?.welcomeImageConfig,
          },
        };
        setStore(finalStore);
        await saveLocalStore(finalStore, sessionPassword || undefined);
        showToast('✨ 合言葉が確認できました！カレンダーの共有を開始しました💕');
        return { success: true };
      } catch (err: any) {
        showToast('⚠️ 同期中に一時的なエラーが発生しました');
        return { success: true };
      } finally {
        setIsSyncing(false);
      }
    },
    [sessionPassword, showToast, store]
  );

  // 🚪 カレンダーの共有を解除（ログアウトしてまっさらな状態に戻す）
  const handleUnshareCalendar = useCallback(async () => {
    setSavedSharedKeyword(null);
    setSavedSharedKeywordState(null);
    const nextSyncCfg = loadSyncConfig();
    nextSyncCfg.enabled = false;
    saveSyncConfig(nextSyncCfg);
    setSyncConfig(nextSyncCfg);

    const freshStore = createInitialDataStore();
    setStore(freshStore);
    await saveLocalStore(freshStore);
    showToast('カレンダーの共有を解除し、まっさらな状態に戻しました🐾');
  }, [showToast]);

  // 選択日を移動し、月が変わればカレンダー表示月も追従させる
  const moveSelectedDate = useCallback((deltaDays: number) => {
    setSelectedDate((prev) => {
      const nextDate = addDaysToDateStr(prev, deltaDays);
      const [ny, nm] = nextDate.split('-').map(Number);
      setYear(ny);
      setMonth(nm);
      return nextDate;
    });
  }, []);

  // 指定日にシフトを登録または消去する（advanceDate=true の場合は翌日へ自動移動、false の場合は同じ日に留まる）
  const handleSetShiftAndAdvance = useCallback(
    (
      dateStr: string,
      partnerId: PartnerId,
      stamp: StampPreset | null,
      advanceDate = true
    ) => {
      const shiftId = `${dateStr}_${partnerId}`;
      const nowIso = new Date().toISOString();
      const existing = store.shifts[shiftId];

      let nextShift: ShiftEntry;
      if (!stamp) {
        nextShift = {
          id: shiftId,
          date: dateStr,
          partnerId,
          stampId: existing?.stampId || '',
          createdBy: activePartner,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
          deletedAt: nowIso,
        };
      } else {
        const isHolWorkStamp = Boolean(
          stamp.id === 'shift_hol_work' ||
          stamp.label.includes('休出') ||
          stamp.label.includes('休日出勤')
        );
        const todayDate = new Date();
        const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
        const isFutureDate = dateStr > todayStr;

        nextShift = {
          ...(existing && !existing.deletedAt ? existing : {}),
          id: shiftId,
          date: dateStr,
          partnerId,
          stampId: stamp.id,
          startTime: stamp.startTime,
          endTime: stamp.endTime,
          isHolidayWork: isHolWorkStamp ? true : (existing?.isHolidayWork || false),
          holidayWorkMinutes: isHolWorkStamp ? (existing?.holidayWorkMinutes || 240) : existing?.holidayWorkMinutes,
          holidayWorkHours: isHolWorkStamp ? (existing?.holidayWorkHours || 4) : existing?.holidayWorkHours,
          // 未来日（登録日より後）は固定で仮予定（未確定）にする
          isTentativeHolidayWork: isHolWorkStamp && isFutureDate ? true : existing?.isTentativeHolidayWork,
          holidayWorkStatus: isHolWorkStamp && isFutureDate ? 'tentative' : existing?.holidayWorkStatus,
          isTentativeOvertime: isFutureDate && ((existing?.overtimeMinutes || 0) > 0 || (existing?.overtimeHours || 0) > 0) ? true : existing?.isTentativeOvertime,
          overtimeStatus: isFutureDate && ((existing?.overtimeMinutes || 0) > 0 || (existing?.overtimeHours || 0) > 0) ? 'tentative' : existing?.overtimeStatus,
          createdBy: activePartner,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
      }

      const nextStore: CalendarDataStore = {
        ...store,
        shifts: {
          ...store.shifts,
          [shiftId]: nextShift,
        },
      };
      commitStore(nextStore);

      if (advanceDate) {
        // 連続スタンプモード時は翌日へ自動移動！
        const nextDate = addDaysToDateStr(dateStr, 1);
        setSelectedDate(nextDate);
        const [ny, nm] = nextDate.split('-').map(Number);
        setYear(ny);
        setMonth(nm);
      } else {
        const [, m, d] = dateStr.split('-').map(Number);
        showToast(
          stamp
            ? `✨ ${m}/${d} のシフトを「${stamp.label}」に更新しました`
            : `🧹 ${m}/${d} のシフトをクリアしました`
        );
      }
    },
    [activePartner, commitStore, showToast, store]
  );

  // 指定日のサブシフト（仕事終わり・休日のバイト）や残業・休日出勤時間を更新（日付は移動しない）
  const handleUpdateShiftDetails = useCallback(
    (dateStr: string, partnerId: PartnerId, patch: Partial<ShiftEntry>) => {
      const shiftId = `${dateStr}_${partnerId}`;
      const nowIso = new Date().toISOString();
      const existing = store.shifts[shiftId];
      const activeExisting = existing && !existing.deletedAt ? existing : undefined;

      const defaultStampId = activeExisting?.stampId
        ? activeExisting.stampId
        : patch.isHolidayWork || (patch.holidayWorkHours && patch.holidayWorkHours > 0)
        ? 'shift_hol_work'
        : '';

      const isPatchHw = Boolean(
        patch.isHolidayWork ||
        (patch.holidayWorkMinutes !== undefined && patch.holidayWorkMinutes > 0) ||
        (patch.holidayWorkHours !== undefined && patch.holidayWorkHours > 0)
      );
      const isPatchOt = Boolean(
        (patch.overtimeMinutes !== undefined && patch.overtimeMinutes > 0) ||
        (patch.overtimeHours !== undefined && patch.overtimeHours > 0)
      );

      const cleanPatch: Partial<ShiftEntry> = { ...patch };
      if (isPatchHw && patch.overtimeMinutes === undefined) {
        cleanPatch.overtimeMinutes = 0;
        cleanPatch.overtimeHours = 0;
        cleanPatch.overtimeStartTime = undefined;
        cleanPatch.overtimeEndTime = undefined;
      } else if (isPatchOt && patch.holidayWorkMinutes === undefined) {
        cleanPatch.isHolidayWork = false;
        cleanPatch.holidayWorkMinutes = 0;
        cleanPatch.holidayWorkHours = 0;
      }

      const nextShift: ShiftEntry = {
        ...(activeExisting || {
          id: shiftId,
          date: dateStr,
          partnerId,
          stampId: defaultStampId,
          createdBy: activePartner,
          createdAt: nowIso,
        }),
        ...cleanPatch,
        id: shiftId,
        date: dateStr,
        partnerId,
        updatedAt: nowIso,
        deletedAt: null,
      };

      // 💡 ユーザー要望：登録日（今日）より後の未来日の残業・休日出勤は、固定で仮残業（未確定）にする！
      const todayDate = new Date();
      const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
      const isFutureDate = dateStr > todayStr;

      if (isFutureDate) {
        if (
          (nextShift.overtimeMinutes && nextShift.overtimeMinutes > 0) ||
          (nextShift.overtimeHours && nextShift.overtimeHours > 0)
        ) {
          nextShift.isTentativeOvertime = true;
          nextShift.overtimeStatus = 'tentative';
        }
        if (
          nextShift.isHolidayWork ||
          (nextShift.holidayWorkMinutes && nextShift.holidayWorkMinutes > 0) ||
          (nextShift.holidayWorkHours && nextShift.holidayWorkHours > 0) ||
          nextShift.stampId === 'shift_hol_work'
        ) {
          nextShift.isTentativeHolidayWork = true;
          nextShift.holidayWorkStatus = 'tentative';
        }
      }

      commitStore({
        ...store,
        shifts: {
          ...store.shifts,
          [shiftId]: nextShift,
        },
      });

      const [, m, d] = dateStr.split('-').map(Number);
      const pName = store.metadata.partners[partnerId].name;
      if (
        patch.overtimeMinutes !== undefined ||
        patch.holidayWorkMinutes !== undefined ||
        patch.overtimeHours !== undefined ||
        patch.holidayWorkHours !== undefined
      ) {
        const isHw = Boolean(patch.isHolidayWork || (patch.holidayWorkMinutes || 0) > 0 || (patch.holidayWorkHours || 0) > 0);
        const otMin =
          patch.overtimeMinutes !== undefined
            ? patch.overtimeMinutes
            : patch.overtimeHours !== undefined
            ? Math.round(patch.overtimeHours * 60)
            : 0;
        const hwMin =
          patch.holidayWorkMinutes !== undefined
            ? patch.holidayWorkMinutes
            : patch.holidayWorkHours !== undefined
            ? Math.round(patch.holidayWorkHours * 60)
            : 0;
        const minVal = isHw ? hwMin : otMin;
        const kind = isHw ? '休日出勤' : '残業';
        showToast(
          minVal > 0
            ? `⏱️ ${m}/${d}（${pName}）に${kind} +${minVal}分${minVal >= 60 ? ` (${formatMinutesToJa(minVal)})` : ''} を反映しました！`
            : `⏱️ ${m}/${d}（${pName}）の残業・休出時間を0分にリセットしました`
        );
      } else {
        showToast(`✨ ${m}/${d}（${pName}）のシフト詳細を反映しました！`);
      }
    },
    [activePartner, commitStore, showToast, store]
  );

  // その日の終わりにアプリから実残業時間を確定させるコールバック
  const handleConfirmShiftActual = useCallback(
    (dateStr: string, partnerId: PartnerId, actualMinutes: number, isHolidayWork: boolean) => {
      const shiftId = `${dateStr}_${partnerId}`;
      const existing = store.shifts[shiftId];
      if (!existing) return;

      const nowIso = new Date().toISOString();
      const patch: Partial<ShiftEntry> = isHolidayWork
        ? {
            isHolidayWork: true,
            isTentativeHolidayWork: false,
            isTentativeOvertime: false,
            holidayWorkMinutes: actualMinutes,
            holidayWorkHours: Math.round((actualMinutes / 60) * 10) / 10,
            overtimeMinutes: 0,
            overtimeHours: 0,
            updatedAt: nowIso,
          }
        : {
            isHolidayWork: false,
            isTentativeHolidayWork: false,
            isTentativeOvertime: false,
            overtimeMinutes: actualMinutes,
            overtimeHours: Math.round((actualMinutes / 60) * 10) / 10,
            holidayWorkMinutes: 0,
            holidayWorkHours: 0,
            updatedAt: nowIso,
          };

      handleUpdateShiftDetails(dateStr, partnerId, patch);
      showToast(
        actualMinutes > 0
          ? `🎉 お疲れさまでした！実残業 ${formatMinutesToJa(actualMinutes)} で確定しました！`
          : `🎉 お疲れさまでした！残業なし(0分)で確定しました！`
      );
    },
    [handleUpdateShiftDetails, showToast, store.shifts]
  );

  // 仮残業のキャンセル（残業なし・0分で完了）
  const handleCancelTentativeShift = useCallback(
    (dateStr: string, partnerId: PartnerId) => {
      const nowIso = new Date().toISOString();
      handleUpdateShiftDetails(dateStr, partnerId, {
        isTentativeHolidayWork: false,
        isTentativeOvertime: false,
        holidayWorkMinutes: 0,
        holidayWorkHours: 0,
        overtimeMinutes: 0,
        overtimeHours: 0,
        updatedAt: nowIso,
      });
      showToast('🎉 お疲れさまでした！残業なしで完了しました🐾');
    },
    [handleUpdateShiftDetails, showToast]
  );

  // AI画像読取やナスカレ連携からの一括シフト＆予定登録
  const handleBulkApplyShiftsAndEvents = useCallback(
    (newShifts: ShiftEntry[], newEvents: ScheduleEvent[], summaryMsg: string) => {
      const nextShifts = { ...store.shifts };
      for (const s of newShifts) {
        nextShifts[s.id] = s;
      }
      const nextEvents = { ...store.events };
      for (const ev of newEvents) {
        nextEvents[ev.id] = ev;
      }
      commitStore({
        ...store,
        shifts: nextShifts,
        events: nextEvents,
      });
      showToast(summaryMsg);
    },
    [commitStore, showToast, store]
  );

  // 日付ごとの「🍳すれ違いサポートアイコン」をON/OFF
  const handleToggleDaySupportBadge = useCallback(
    (dateStr: string, badge: string) => {
      const nowIso = new Date().toISOString();
      const existing = store.daySupports?.[dateStr];
      const currentBadges = existing?.badges || [];
      const nextBadges = currentBadges.includes(badge)
        ? currentBadges.filter((b) => b !== badge)
        : [...currentBadges, badge];

      const nextStore: CalendarDataStore = {
        ...store,
        daySupports: {
          ...(store.daySupports || {}),
          [dateStr]: {
            id: `support_${dateStr}`,
            date: dateStr,
            badges: nextBadges,
            updatedBy: activePartner,
            updatedAt: nowIso,
          },
        },
      };
      commitStore(nextStore);
    },
    [activePartner, commitStore, store]
  );

  // 月間カレンダーの日付セルを「シングルタップ」した時の処理（その日に選択移動。勝手にスタンプされるバグを完全に防止）
  const handleCellSingleTap = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);
      const [ny, nm, nd] = dateStr.split('-').map(Number);
      if (ny !== year || nm !== month) {
        setYear(ny);
        setMonth(nm);
      }
      if (stampDrawerOpen) {
        showToast(`🎯 ${nm}/${nd} を選択中（下のボタンでシフト入力できます）`);
      }
    },
    [month, showToast, stampDrawerOpen, year]
  );

  // 月間カレンダーの日付セルを「ダブルタップ」した時の処理（TimeTree風：その日のすべての予定を表示）
  const handleCellDoubleTap = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);
      const [ny, nm] = dateStr.split('-').map(Number);
      if (ny !== year || nm !== month) {
        setYear(ny);
        setMonth(nm);
      }
      setOpenEventFormDirectly(false);
      setDayDetailOpen(true);
    },
    [month, year]
  );

  // 右下の「＋」ボタンから選択中の日（または指定日）に予定・タスクを直接追加する処理
  const handleQuickAddForDate = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);
      const [ny, nm] = dateStr.split('-').map(Number);
      if (ny !== year || nm !== month) {
        setYear(ny);
        setMonth(nm);
      }
      setOpenEventFormDirectly(true);
      setDayDetailOpen(true);
    },
    [month, year]
  );

  // 予定・タスクの追加・更新
  const handleSaveEvent = useCallback(
    (ev: ScheduleEvent) => {
      const nextStore: CalendarDataStore = {
        ...store,
        events: {
          ...store.events,
          [ev.id]: ev,
        },
      };
      commitStore(nextStore);
      const [, m, d] = ev.date.split('-').map(Number);
      showToast(
        `${ev.isTask ? '✅' : '📅'} ${m}/${d} に「${ev.title}」を登録しました💕`
      );
    },
    [commitStore, showToast, store]
  );

  // タスクの完了／未完了を1タップ切替
  const handleToggleTaskComplete = useCallback(
    (eventId: string) => {
      const existing = store.events[eventId];
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const nextCompleted = !existing.isCompleted;
      const nextStore: CalendarDataStore = {
        ...store,
        events: {
          ...store.events,
          [eventId]: {
            ...existing,
            isCompleted: nextCompleted,
            updatedAt: nowIso,
          },
        },
      };
      commitStore(nextStore);
      showToast(nextCompleted ? '✅ タスクを完了にしました！' : '⬜ タスクを未完了に戻しました');
    },
    [commitStore, showToast, store]
  );

  // 予定の論理削除
  const handleDeleteEvent = useCallback(
    (eventId: string) => {
      const existing = store.events[eventId];
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const nextStore: CalendarDataStore = {
        ...store,
        events: {
          ...store.events,
          [eventId]: {
            ...existing,
            updatedAt: nowIso,
            deletedAt: nowIso,
          },
        },
      };
      commitStore(nextStore);
      showToast('予定を削除しました');
    },
    [commitStore, showToast, store]
  );

  // 登録されているすべての予定・タスクを一括削除
  const handleClearAllEvents = useCallback(() => {
    const nowIso = new Date().toISOString();
    const deletedEvents: Record<string, ScheduleEvent> = {};
    for (const [id, ev] of Object.entries(store.events)) {
      deletedEvents[id] = {
        ...ev,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };
    }
    commitStore({
      ...store,
      events: deletedEvents,
      daySupports: {},
    });
    showToast('🗑️ すべての予定・タスクを削除しました');
  }, [commitStore, showToast, store]);

  // 登録されているすべてのシフトデータ（残業・休出・バイト含む）を一括削除
  const handleClearAllShifts = useCallback(() => {
    const nowIso = new Date().toISOString();
    const deletedShifts: Record<string, ShiftEntry> = {};
    for (const [id, s] of Object.entries(store.shifts)) {
      deletedShifts[id] = {
        ...s,
        overtimeHours: 0,
        holidayWorkHours: 0,
        isHolidayWork: false,
        subStampId: undefined,
        subCustomLabel: undefined,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };
    }
    commitStore({
      ...store,
      shifts: deletedShifts,
    });
    showToast('🗑️ すべてのシフトデータを削除しました');
  }, [commitStore, showToast, store]);

  // 予定データ＋シフトデータを両方すべて一括削除
  const handleClearAllData = useCallback(() => {
    const nowIso = new Date().toISOString();
    const deletedEvents: Record<string, ScheduleEvent> = {};
    for (const [id, ev] of Object.entries(store.events)) {
      deletedEvents[id] = {
        ...ev,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };
    }
    const deletedShifts: Record<string, ShiftEntry> = {};
    for (const [id, s] of Object.entries(store.shifts)) {
      deletedShifts[id] = {
        ...s,
        overtimeHours: 0,
        holidayWorkHours: 0,
        isHolidayWork: false,
        subStampId: undefined,
        subCustomLabel: undefined,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };
    }
    commitStore({
      ...store,
      shifts: deletedShifts,
      events: deletedEvents,
      daySupports: {},
    });
    showToast('🗑️ 予定データとシフトデータをすべて削除しました');
  }, [commitStore, showToast, store]);

  // 操作中パートナーの切り替え（🐻夫 ⇔ 🐰妻）
  const handleToggleActivePartner = useCallback(
    (partnerId: PartnerId) => {
      setActivePartner(partnerId);
      setActivePartnerId(partnerId);
      setStampDrawerTab(partnerId === 'partnerB' ? 'partnerB_shift' : 'partnerA_shift');
      const p = store.metadata.partners[partnerId];
      showToast(`${p.avatar} ${p.name}として操作中に切り替えました`);
    },
    [showToast, store.metadata.partners]
  );

  // 自分の最終確認日時（既読ステータス）を「たった今」に更新
  const handleMarkSeenNow = useCallback(() => {
    const nowIso = new Date().toISOString();
    const currentPartnerProfile = store.metadata.partners[activePartner];
    const nextStore: CalendarDataStore = {
      ...store,
      metadata: {
        ...store.metadata,
        partners: {
          ...store.metadata.partners,
          [activePartner]: {
            ...currentPartnerProfile,
            lastSeenAt: nowIso,
          },
        },
        updatedAt: nowIso,
      },
    };
    commitStore(nextStore);
    showToast(
      `✅ ${currentPartnerProfile.avatar}${currentPartnerProfile.name}の最終確認時刻を更新しました！`
    );
  }, [activePartner, commitStore, showToast, store]);

  // 今月の「✨ふたり休日一致」の日付リストを自動検出
  const matchedHolidays = useMemo(() => {
    const stampMap = new Map<string, StampPreset>();
    for (const s of store.stamps) stampMap.set(s.id, s);

    const isHol = (shift?: ShiftEntry) => {
      if (!shift || shift.deletedAt) return false;
      const st = stampMap.get(shift.stampId);
      if (!st) return false;
      return Boolean(st.isHoliday || /休|有休|公休|夏休|冬休/.test(st.label));
    };

    const daysInMonth = new Date(year, month, 0).getDate();
    const matched: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sA = store.shifts[`${dateStr}_partnerA`];
      const sB = store.shifts[`${dateStr}_partnerB`];
      if (isHol(sA) && isHol(sB)) {
        matched.push(dateStr);
      }
    }
    return matched;
  }, [month, store.shifts, store.stamps, year]);

  // 今月の「⏱️残業・休日出勤・バイト集計」を分単位で自動精密算出（計算ミス・誤差ゼロ）
  const overtimeSummary: MonthlyOvertimeSummary = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const calcFor = (pid: PartnerId) => {
      let overtimeMinutes = 0;
      let holidayWorkMinutes = 0;
      let tentativeExtraMinutes = 0;
      let partTimeCount = 0;
      const entries: ShiftEntry[] = [];
      const tentativeEntries: ShiftEntry[] = [];

      for (const s of Object.values(store.shifts)) {
        if (s.deletedAt || s.partnerId !== pid || !s.date.startsWith(prefix)) continue;
        let otMin = getShiftOvertimeMinutes(s);
        const hwMin = getShiftHolidayWorkMinutes(s);
        const hasSub = Boolean(s.subCustomLabel || s.subStampId || s.stampId === 'shift_part');

        // 万一過去のデータで休出と残業の両方が保存されている場合、休出を優先して残業の重複二重カウントを防止
        if (hwMin > 0 && otMin > 0) {
          if (s.isHolidayWork || s.stampId === 'shift_hol_work' || otMin === hwMin) {
            otMin = 0;
          }
        }

        const isTentative = Boolean(
          (otMin > 0 && s.isTentativeOvertime) ||
          (hwMin > 0 && s.isTentativeHolidayWork)
        );

        if (isTentative) {
          // 仮・見込み残業/休出
          tentativeExtraMinutes += (otMin + hwMin);
          tentativeEntries.push(s);
        } else {
          // 確定済み残業/休出
          if (otMin > 0) overtimeMinutes += otMin;
          if (hwMin > 0) holidayWorkMinutes += hwMin;
          if (otMin > 0 || hwMin > 0 || s.isHolidayWork || hasSub) {
            entries.push(s);
          }
        }

        if (hasSub) partTimeCount += 1;
      }

      entries.sort((a, b) => a.date.localeCompare(b.date));
      tentativeEntries.sort((a, b) => a.date.localeCompare(b.date));
      const totalExtraMinutes = overtimeMinutes + holidayWorkMinutes;

      return {
        overtimeMinutes,
        holidayWorkMinutes,
        totalExtraMinutes,
        tentativeExtraMinutes,
        overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
        holidayWorkHours: Math.round((holidayWorkMinutes / 60) * 10) / 10,
        totalExtraHours: Math.round((totalExtraMinutes / 60) * 10) / 10,
        overtimeFormatted: formatMinutesToJa(overtimeMinutes),
        holidayWorkFormatted: formatMinutesToJa(holidayWorkMinutes),
        totalExtraFormatted: formatMinutesToJa(totalExtraMinutes),
        tentativeExtraFormatted: formatMinutesToJa(tentativeExtraMinutes),
        partTimeCount,
        entries,
        tentativeEntries,
      };
    };

    return {
      partnerA: calcFor('partnerA'),
      partnerB: calcFor('partnerB'),
    };
  }, [month, store.shifts, year]);

  // カレンダー予定項目リスト（未設定時はデフォルト：二人予定・夫予定・妻予定）
  const activeCategories = useMemo(
    () =>
      store.categories && store.categories.length > 0
        ? store.categories
        : DEFAULT_CATEGORIES,
    [store.categories]
  );

  // パートナーがまだ見ていない変更（未確認件数）をカウント
  const unreadCountForPartner = useMemo(() => {
    const otherId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
    const otherSeenMs = Date.parse(store.metadata.partners[otherId].lastSeenAt || '') || 0;
    let count = 0;

    for (const s of Object.values(store.shifts)) {
      if (s.deletedAt) continue;
      if (s.createdBy === activePartner && (Date.parse(s.updatedAt) || 0) > otherSeenMs) {
        count++;
      }
    }
    for (const ev of Object.values(store.events)) {
      if (ev.deletedAt) continue;
      if (ev.createdBy === activePartner && (Date.parse(ev.updatedAt) || 0) > otherSeenMs) {
        count++;
      }
    }
    return count;
  }, [activePartner, store.events, store.metadata.partners, store.shifts]);

  // 相手（otherPartner）が作成・更新した未確認アイテム（新着予定＋シフト）の総数
  const partnerNewCount = useMemo(() => {
    const otherId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
    const mySeenMs = Date.parse(store.metadata.partners[activePartner].lastSeenAt || '') || 0;
    let count = 0;

    for (const ev of Object.values(store.events || {})) {
      if (!ev || ev.deletedAt) continue;
      if (ev.createdBy === otherId && (Date.parse(ev.updatedAt || ev.createdAt) || 0) > mySeenMs) {
        count++;
      }
    }
    for (const s of Object.values(store.shifts || {})) {
      if (!s || s.deletedAt) continue;
      if (s.partnerId === otherId && (Date.parse(s.updatedAt || s.createdAt) || 0) > mySeenMs) {
        count++;
      }
    }
    return count;
  }, [activePartner, store.events, store.metadata.partners, store.shifts]);

  const handleTriggerCloudSync = useCallback(
    async (configOverride?: CloudSyncConfig, passwordOverride?: string) => {
      const cfg = configOverride || syncConfig;
      const pass = passwordOverride || sessionPassword;
      setIsSyncing(true);
      try {
        const { mergedStore, statusMessage } = await syncWithGitHub(store, cfg, pass);
        const preservedWelcome =
          store.metadata?.welcomeImageConfig?.dataUrl
            ? store.metadata.welcomeImageConfig
            : mergedStore.metadata?.welcomeImageConfig;
        setStore({
          ...mergedStore,
          metadata: {
            ...mergedStore.metadata,
            welcomeImageConfig: preservedWelcome || mergedStore.metadata?.welcomeImageConfig,
          },
        });
        showToast(statusMessage);
      } catch (err) {
        showToast(err instanceof Error ? err.message : '同期エラーが発生しました');
        throw err;
      } finally {
        setIsSyncing(false);
      }
    },
    [sessionPassword, showToast, store, syncConfig]
  );

  // スマホでアプリ画面を開き直した時（フォーカス復帰時）に自動でクラウド同期
  useEffect(() => {
    if (!isLoaded || !syncConfig.enabled || !syncConfig.githubToken) return;
    const onFocus = () => {
      syncWithGitHub(store, syncConfig, sessionPassword)
        .then(({ mergedStore }) => {
          const preservedWelcome =
            store.metadata?.welcomeImageConfig?.dataUrl
              ? store.metadata.welcomeImageConfig
              : mergedStore.metadata?.welcomeImageConfig;
          setStore({
            ...mergedStore,
            metadata: {
              ...mergedStore.metadata,
              welcomeImageConfig: preservedWelcome || mergedStore.metadata?.welcomeImageConfig,
            },
          });
        })
        .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isLoaded, sessionPassword, store, syncConfig]);

  const handlePrevMonth = useCallback(() => {
    setMonth((m) => {
      let ny = year;
      let nm = m - 1;
      if (m === 1) {
        ny = year - 1;
        nm = 12;
        setYear(ny);
      }
      setSelectedDate(`${ny}-${String(nm).padStart(2, '0')}-01`);
      return nm;
    });
  }, [year]);

  const handleNextMonth = useCallback(() => {
    setMonth((m) => {
      let ny = year;
      let nm = m + 1;
      if (m === 12) {
        ny = year + 1;
        nm = 1;
        setYear(ny);
      }
      setSelectedDate(`${ny}-${String(nm).padStart(2, '0')}-01`);
      return nm;
    });
  }, [year]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF7] text-stone-600 font-bold">
        🐻💕🐰 ペアカレを読み込み中...
      </div>
    );
  }

  const currentDrawerPartner: PartnerId = activePartner;
  const currentShiftOnSelectedDate = store.shifts[
    `${selectedDate}_${activePartner}`
  ]?.deletedAt
    ? undefined
    : store.shifts[`${selectedDate}_${activePartner}`];

  return (
    <div className="min-h-screen bg-[#FFFBF7] text-stone-700 flex flex-col">
      {/* トースト通知 */}
      {toastText && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-stone-800/95 text-white text-xs font-extrabold shadow-lg animate-pop whitespace-nowrap">
          {toastText}
        </div>
      )}

      {/* 🏠 デフォルト画面：ウィジェット（ふたりホーム）モード */}
      {isWidgetMode ? (
        <WidgetCompactView
          store={store}
          activePartner={activePartner}
          onToggleActivePartner={handleToggleActivePartner}
          onMarkSeenNow={handleMarkSeenNow}
          matchedHolidays={matchedHolidays}
          overtimeSummary={overtimeSummary}
          onExitWidgetMode={enterCalendarMode}
          onOpenCalendarWithStampDrawer={() => {
            enterCalendarMode();
            openStampDrawer();
          }}
          onOpenDayDetail={(dateStr) => {
            openDayDetailModal(dateStr, false);
          }}
          onQuickAddEventForDate={(dateStr) => {
            handleQuickAddForDate(dateStr);
          }}
          onToggleTaskComplete={handleToggleTaskComplete}
          onSelectDateInFullCalendar={(dateStr) => {
            setSelectedDate(dateStr);
            const [ny, nm] = dateStr.split('-').map(Number);
            setYear(ny);
            setMonth(nm);
            enterCalendarMode();
          }}
          onOpenVoiceModal={(dateStr) => {
            openVoiceModal(dateStr);
          }}
          onOpenImageOcrModal={openImageOcrModal}
          onOpenSettings={openSettingsModal}
        />
      ) : (
        <>
          {/* トップヘッダー */}
          <TopHeader
            year={year}
            month={month}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            onToday={() => {
              const t = new Date();
              setYear(t.getFullYear());
              setMonth(t.getMonth() + 1);
              setSelectedDate(
                `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
                  t.getDate()
                ).padStart(2, '0')}`
              );
            }}
            onSelectYearMonth={(y, m) => {
              setYear(y);
              setMonth(m);
              setSelectedDate(`${y}-${String(m).padStart(2, '0')}-01`);
            }}
            activePartner={activePartner}
            onToggleActivePartner={handleToggleActivePartner}
            metadata={store.metadata}
            categories={activeCategories}
            onOpenCategoryManager={openCategoryManagerModal}
            onMarkSeenNow={handleMarkSeenNow}
            matchedHolidays={matchedHolidays}
            overtimeSummary={overtimeSummary}
            onSelectDate={(dateStr) => {
              openDayDetailModal(dateStr, false);
            }}
            filterCategory={filterCategory}
            onChangeFilter={setFilterCategory}
            isExpandedView={isExpandedView}
            onToggleExpandedView={() => setIsExpandedView(!isExpandedView)}
            showShiftTimeInCell={showShiftTimeInCell}
            onToggleShowShiftTime={() => setShowShiftTimeInCell(!showShiftTimeInCell)}
            unreadCountForPartner={unreadCountForPartner}
            isSyncing={isSyncing}
            syncEnabled={syncConfig.enabled}
            onTriggerSync={() => handleTriggerCloudSync()}
            onOpenSettings={openSettingsModal}
            onOpenWidgetHome={() => {
              closeNavLayer(() => setIsWidgetMode(true));
            }}
            onOpenShiftExport={() => openShiftExportModal(activePartner)}
            onOpenWelcomeImage={openWelcomeModal}
            isShared={Boolean(savedSharedKeyword)}
            onOpenSharedKeywordModal={openSharedKeywordModal}
            partnerNewCount={partnerNewCount}
            onOpenPartnerEvents={openPartnerEventsModal}
          />

          {/* 🌟 その日の終わりに実残業時間をそっちから確認してワンタップ確定させるお疲れさまカード */}
          <ConfirmOvertimeCard
            activePartner={activePartner}
            metadata={store.metadata}
            shifts={store.shifts}
            onConfirmShift={handleConfirmShiftActual}
            onCancelTentative={handleCancelTentativeShift}
          />

          {/* 月間カレンダーグリッド（シングルタップ移動・ダブルタップ予定一覧・右下＋予定追加） */}
          <main className="flex-1">
            <MonthlyCalendarGrid
              year={year}
              month={month}
              store={store}
              activePartner={activePartner}
              filterCategory={filterCategory}
              isExpandedView={isExpandedView}
              showShiftTimeInCell={showShiftTimeInCell}
              selectedDate={selectedDate}
              stampModeActive={stampDrawerOpen}
              onCellSingleTap={handleCellSingleTap}
              onCellDoubleTap={(dateStr) => openDayDetailModal(dateStr, false)}
              onQuickAddForSelectedDate={() => handleQuickAddForDate(selectedDate)}
              onSwipePrevMonth={handlePrevMonth}
              onSwipeNextMonth={handleNextMonth}
            />
          </main>

          {/* ボトム「シフト連続入力ドロワー ＆ スマホ用下部5ボタンアクションドック」 */}
          <StampDrawer
            isOpen={stampDrawerOpen}
            onToggleOpen={(open) => {
              if (open) {
                openStampDrawer();
              } else {
                closeNavLayer(() => setStampDrawerOpen(false));
              }
            }}
            activeTab={stampDrawerTab}
            onChangeTab={setStampDrawerTab}
            stamps={store.stamps}
            selectedStampId={selectedStampId}
            onSelectStamp={setSelectedStampId}
            selectedDate={selectedDate}
            onMoveDate={moveSelectedDate}
            autoAdvance={autoAdvance}
            onToggleAutoAdvance={setAutoAdvance}
            onApplyShiftAndAdvance={(stamp, targetPartner) =>
              handleSetShiftAndAdvance(selectedDate, targetPartner, stamp, autoAdvance)
            }
            onClearShiftAndAdvance={(targetPartner) =>
              handleSetShiftAndAdvance(selectedDate, targetPartner, null, autoAdvance)
            }
            onUpdateShiftDetailsOnSelectedDate={(targetPartner, patch) => {
              handleUpdateShiftDetails(selectedDate, targetPartner, patch);
              const [, m, d] = selectedDate.split('-').map(Number);
              showToast(`✨ ${m}/${d} のシフト詳細（バイト・残業）を更新しました`);
            }}
            currentShiftOnSelectedDate={currentShiftOnSelectedDate}
            onToggleSupportBadgeOnSelectedDate={(badge) =>
              handleToggleDaySupportBadge(selectedDate, badge)
            }
            activeSupportBadgesOnSelectedDate={store.daySupports?.[selectedDate]?.badges || []}
            onOpenDayDetail={() => {
              openDayDetailModal(selectedDate, true);
            }}
            onOpenShiftStampManager={(pid) => {
              openShiftManagerModal(pid || currentDrawerPartner);
            }}
            onOpenVoiceModal={() => openVoiceModal(selectedDate)}
            onOpenImageOcrModal={openImageOcrModal}
            onOpenWidgetModal={() => {
              closeNavLayer(() => setIsWidgetMode(true));
            }}
            onOpenTaskManager={openTaskManagerModal}
            onOpenShiftExport={() => openShiftExportModal(currentDrawerPartner)}
            metadata={store.metadata}
            activePartner={activePartner}
          />
        </>
      )}

      {/* 日付詳細＆シフト・予定・タスクモーダル */}
      {dayDetailOpen && (
        <ErrorBoundary
          fallbackTitle={`${selectedDate} の予定・シフト表示中に一時的なエラーが発生しました`}
          onReset={() =>
            closeNavLayer(() => {
              setDayDetailOpen(false);
              setOpenEventFormDirectly(false);
            })
          }
        >
          <DayDetailModal
            dateStr={selectedDate}
            store={store}
            activePartner={activePartner}
            initialOpenEventForm={openEventFormDirectly}
            onClose={() =>
              closeNavLayer(() => {
                setDayDetailOpen(false);
                setOpenEventFormDirectly(false);
              })
            }
            onMoveDate={moveSelectedDate}
            onSetShiftAndAdvance={handleSetShiftAndAdvance}
            onUpdateShiftDetails={handleUpdateShiftDetails}
            onToggleDaySupportBadge={handleToggleDaySupportBadge}
            onSaveEvent={handleSaveEvent}
            onToggleTaskComplete={handleToggleTaskComplete}
            onDeleteEvent={handleDeleteEvent}
            onOpenVoiceModal={() => openVoiceModal(selectedDate)}
            onOpenShiftStampManager={(pid) => {
              openShiftManagerModal(pid || activePartner);
            }}
            onOpenCategoryManager={openCategoryManagerModal}
            onOpenShiftInput={openStampDrawer}
          />
        </ErrorBoundary>
      )}

      {/* 🗂️ カレンダー予定項目の追加・削除モーダル（デフォ：二人予定・夫予定・妻予定） */}
      {categoryManagerOpen && (
        <CategoryManagerModal
          categories={activeCategories}
          metadata={store.metadata}
          onClose={() => closeNavLayer(() => setCategoryManagerOpen(false))}
          onUpdateCategories={(nextCats) => {
            commitStore({
              ...store,
              categories: nextCats,
            });
            if (
              filterCategory !== 'all' &&
              !nextCats.some((c) => c.id === filterCategory)
            ) {
              setFilterCategory('all');
            }
            showToast('カレンダーの予定項目を更新しました🗂️');
          }}
        />
      )}

      {/* 🎨 シフト種類の登録・かんたん編集モーダル */}
      {shiftManagerOpen && (
        <ShiftStampManagerModal
          stamps={store.stamps}
          initialPartnerId={shiftManagerPartner}
          metadata={store.metadata}
          onClose={() => closeNavLayer(() => setShiftManagerOpen(false))}
          onUpdateStamps={(nextStamps) => {
            commitStore({
              ...store,
              stamps: nextStamps,
            });
            showToast('勤務リストを更新しました🎨');
          }}
        />
      )}

      {/* 📷 シフト表AI画像自動読み取り ＆ 🏥 ナスカレ一括取込モーダル */}
      {imageOcrOpen && (
        <ShiftImageOcrModal
          year={year}
          month={month}
          activePartner={activePartner}
          metadata={store.metadata}
          stamps={store.stamps}
          onClose={() => closeNavLayer(() => setImageOcrOpen(false))}
          onBulkApplyShiftsAndEvents={handleBulkApplyShiftsAndEvents}
        />
      )}

      {/* 🎙️ 音声で予定を入れるモーダル */}
      {voiceModalOpen && (
        <VoiceEventModal
          selectedDate={selectedDate}
          activePartner={activePartner}
          metadata={store.metadata}
          categories={activeCategories}
          onClose={() => closeNavLayer(() => setVoiceModalOpen(false))}
          onSaveEvent={handleSaveEvent}
          onUpdateShiftDetails={handleUpdateShiftDetails}
        />
      )}

      {/* 📱 iPhone / Android ホーム画面ウィジェット設定モーダル */}
      {widgetGuideOpen && (
        <WidgetGuideModal
          store={store}
          onClose={() => closeNavLayer(() => setWidgetGuideOpen(false))}
          onOpenWidgetPreview={() => {
            closeNavLayer(() => setWidgetGuideOpen(false));
            setIsWidgetMode(true);
          }}
        />
      )}

      {/* 設定・GitHub暗号化同期・iCal連携・バックアップモーダル */}
      {settingsOpen && (
        <SettingsAndSyncModal
          store={store}
          activePartner={activePartner}
          syncConfig={syncConfig}
          currentPassword={sessionPassword}
          onClose={() => closeNavLayer(() => setSettingsOpen(false))}
          onUpdateSyncConfig={(nextCfg) => {
            setSyncConfig(nextCfg);
            saveSyncConfig(nextCfg);
          }}
          onUpdatePassword={async (newPass) => {
            setSessionPassword(newPass);
            await saveLocalStore(store, newPass);
          }}
          onTriggerCloudSync={handleTriggerCloudSync}
          onMergeRemoteStore={(remoteStore, message) => {
            const merged = mergeCalendarStores(store, remoteStore);
            commitStore(merged, false);
            showToast(message);
          }}
          onImportEvents={(events) => {
            const nextEvents = { ...store.events };
            for (const ev of events) {
              nextEvents[ev.id] = ev;
            }
            commitStore({
              ...store,
              events: nextEvents,
            });
          }}
          onClearAllEvents={handleClearAllEvents}
          onClearAllShifts={handleClearAllShifts}
          onClearAllData={handleClearAllData}
          onUpdatePartnerProfiles={(nameA, avatarA, nameB, avatarB) => {
            const nowIso = new Date().toISOString();
            commitStore({
              ...store,
              metadata: {
                ...store.metadata,
                partners: {
                  partnerA: {
                    ...store.metadata.partners.partnerA,
                    name: nameA,
                    avatar: avatarA,
                  },
                  partnerB: {
                    ...store.metadata.partners.partnerB,
                    name: nameB,
                    avatar: avatarB,
                  },
                },
                updatedAt: nowIso,
              },
            });
          }}
          onUpdateWelcomeImageConfig={async (newCfg) => {
            await saveDedicatedWelcomePhoto(newCfg);
            const nextStore: CalendarDataStore = {
              ...store,
              metadata: {
                ...store.metadata,
                welcomeImageConfig: newCfg,
                updatedAt: new Date().toISOString(),
              },
              updatedAt: new Date().toISOString(),
            };
            commitStore(nextStore);
            showToast('📸 お気に入り写真設定を保存しました✨');
          }}
          onPreviewWelcomeImage={(cfg) => {
            setWelcomePreviewConfig(cfg);
            setWelcomeModalOpen(true);
            pushNavLayer('welcomeModal');
          }}
          isShared={Boolean(savedSharedKeyword)}
          onOpenSharedKeywordModal={openSharedKeywordModal}
          onUnshareCalendar={handleUnshareCalendar}
        />
      )}

      {/* 📸 シフト写真(PNG)画像保存モーダル（ナスカレ風特大表示・予定なし純粋シフトカレンダー） */}
      {shiftExportOpen && (
        <ShiftExportModal
          year={year}
          month={month}
          store={store}
          defaultMode={shiftExportMode}
          onClose={() => closeNavLayer(() => setShiftExportOpen(false))}
        />
      )}

      {/* ✅ ふたりタスク管理モーダル（タスク専用カレンダー ＆ Googleタスク連携 ＆ 端末別通知） */}
      {taskManagerOpen && (
        <TaskManagerModal
          events={store.events}
          activePartner={activePartner}
          metadata={store.metadata}
          categories={activeCategories}
          onClose={() => closeNavLayer(() => setTaskManagerOpen(false))}
          onSaveEvent={handleSaveEvent}
          onDeleteEvent={handleDeleteEvent}
          onToggleTaskComplete={handleToggleTaskComplete}
        />
      )}

      {/* 📸 起動時お気に入り写真モーダル（ウェルカムフォト・2人の今日シフト・フルスクリーン写真） */}
      {welcomeModalOpen && (
        <WelcomeImageModal
          store={store}
          config={
            welcomePreviewConfig ||
            store.metadata?.welcomeImageConfig || {
              enabled: true,
              dataUrl: '',
              message: '今日も一日お疲れ様💕',
              mode: 'always',
            }
          }
          onClose={() =>
            closeNavLayer(() => {
              setWelcomeModalOpen(false);
              setWelcomePreviewConfig(null);
            })
          }
          onOpenSettings={() =>
            closeNavLayer(() => {
              setWelcomeModalOpen(false);
              setWelcomePreviewConfig(null);
              openSettingsModal();
            })
          }
          onUpdateConfig={async (newCfg) => {
            await saveDedicatedWelcomePhoto(newCfg);
            const nextStore: CalendarDataStore = {
              ...store,
              metadata: {
                ...store.metadata,
                welcomeImageConfig: newCfg,
                updatedAt: new Date().toISOString(),
              },
              updatedAt: new Date().toISOString(),
            };
            commitStore(nextStore);
          }}
        />
      )}

      {/* 🗝️ ふたりの合言葉（初回認証・カレンダー共有）モーダル */}
      <SharedKeywordModal
        isOpen={sharedKeywordModalOpen}
        onClose={() => closeNavLayer(() => setSharedKeywordModalOpen(false))}
        onSubmitKeyword={handleSubmitKeyword}
        isSyncing={isSyncing}
      />

      {/* 💌 相手が打った予定確認モーダル（相手の予定一覧 ＆ すべて既読にするボタン） */}
      {partnerEventsModalOpen && (
        <PartnerEventsModal
          isOpen={partnerEventsModalOpen}
          onClose={() => closeNavLayer(() => setPartnerEventsModalOpen(false))}
          store={store}
          activePartner={activePartner}
          onMarkSeenNow={handleMarkSeenNow}
          onSelectDate={(dateStr) => {
            openDayDetailModal(dateStr, false);
          }}
        />
      )}
    </div>
  );
};

export default App;
