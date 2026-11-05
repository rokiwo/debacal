// Web Crypto API (PBKDF2 + AES-GCM 256bit) による夫婦パスワード暗号化・復号モジュール
import { CalendarDataStore, EncryptedPayload } from '../types/calendar';

const PBKDF2_ITERATIONS = 100000;

// Uint8Array と Base64 の相互変換ユーティリティ
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// パスワード文字列とSaltから AES-GCM 256bit 暗号鍵を導出
async function deriveAesKey(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// カレンダーデータストアをパスワードで AES-GCM 暗号化
export async function encryptCalendarStore(
  store: CalendarDataStore,
  password: string
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(store));

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, PBKDF2_ITERATIONS);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    plaintext
  );

  return {
    app: 'FutariCal',
    version: 1,
    cipher: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: uint8ToBase64(salt),
    iv: uint8ToBase64(iv),
    ciphertext: uint8ToBase64(new Uint8Array(encryptedBuffer)),
    updatedAt: store.updatedAt || new Date().toISOString(),
  };
}

// 暗号化ペイロードをパスワードで復号して CalendarDataStore を取得
export async function decryptCalendarStore(
  payload: EncryptedPayload,
  password: string
): Promise<CalendarDataStore> {
  if (!payload || payload.app !== 'FutariCal' || !payload.ciphertext) {
    throw new Error('暗号化データの形式が正しくありません。');
  }

  const salt = base64ToUint8(payload.salt);
  const iv = base64ToUint8(payload.iv);
  const ciphertext = base64ToUint8(payload.ciphertext);
  const iterations = payload.iterations || PBKDF2_ITERATIONS;

  try {
    const key = await deriveAesKey(password, salt, iterations);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(decryptedBuffer);
    return JSON.parse(jsonStr) as CalendarDataStore;
  } catch {
    throw new Error('合言葉（パスワード）が違うか、データが破損しています。');
  }
}

// パスワードの簡易ハッシュ（ローカル画面ロック照合用）
export async function hashPasscode(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`FutariCal_Pass_${password}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return uint8ToBase64(new Uint8Array(hashBuffer));
}
