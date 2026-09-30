import type {
  MeResponse,
  PosCreateSaleInput,
  PosSaleDto,
  ProductListItemDto,
} from '@lanyard/contracts';

const DB_NAME = 'lanyard-offline-pos';
const DB_VERSION = 1;
const META_STORE = 'meta';
const SECURE_STORE = 'secure';
const PIN_CHECK = 'lanyard-offline-pos-v1';

type EncryptedValue = { iv: string; data: string };

export interface OfflineCatalog {
  branchId: string;
  updatedAt: string;
  products: ProductListItemDto[];
}

export interface OfflineSession {
  staff: MeResponse;
  branches: Array<{ id: string; name: string }>;
  cachedAt: string;
}

export interface OfflineReceiptLine {
  productId: string;
  name: string;
  form?: string;
  strength?: string;
  unitPriceKobo: number;
  quantity: number;
}

export type OfflineQueueStatus = 'pending' | 'syncing' | 'conflict';

export interface OfflineQueuedSale {
  id: string;
  branchId: string;
  branchName?: string;
  capturedAt: string;
  request: PosCreateSaleInput;
  lines: OfflineReceiptLine[];
  totalKobo: number;
  status: OfflineQueueStatus;
  attempts: number;
  lastAttemptAt?: string;
  conflict?: { message: string; code?: string; details?: unknown };
}

export interface OfflineSyncedSale {
  id: string;
  syncedAt: string;
  sale: PosSaleDto;
}

let sessionKey: CryptoKey | null = null;

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
    if (!database.objectStoreNames.contains(SECURE_STORE)) database.createObjectStore(SECURE_STORE);
  };
  return requestResult(request);
}

async function readStore<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, 'readonly');
    const value = await requestResult(transaction.objectStore(storeName).get(key));
    return value as T | undefined;
  } finally {
    database.close();
  }
}

async function writeStore(storeName: string, key: IDBValidKey, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
    });
  } finally {
    database.close();
  }
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: arrayBuffer(salt), iterations: 210_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(value: unknown, key = sessionKey): Promise<EncryptedValue> {
  if (!key) throw new Error('Offline POS is locked');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clear = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, clear);
  return { iv: encodeBase64(iv), data: encodeBase64(new Uint8Array(encrypted)) };
}

async function decrypt<T>(value: EncryptedValue, key = sessionKey): Promise<T> {
  if (!key) throw new Error('Offline POS is locked');
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: arrayBuffer(decodeBase64(value.iv)) },
    key,
    arrayBuffer(decodeBase64(value.data)),
  );
  return JSON.parse(new TextDecoder().decode(clear)) as T;
}

async function readSecure<T>(key: string): Promise<T | undefined> {
  const encrypted = await readStore<EncryptedValue>(SECURE_STORE, key);
  return encrypted ? decrypt<T>(encrypted) : undefined;
}

async function writeSecure(key: string, value: unknown): Promise<void> {
  await writeStore(SECURE_STORE, key, await encrypt(value));
}

export function isOfflinePosUnlocked(): boolean {
  return sessionKey !== null;
}

export async function hasOfflinePin(): Promise<boolean> {
  return Boolean(await readStore<string>(META_STORE, 'salt'));
}

export async function configureOfflinePin(pin: string): Promise<void> {
  if (!/^\d{6,12}$/.test(pin)) throw new Error('Use a 6 to 12 digit offline PIN');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  await writeStore(META_STORE, 'salt', encodeBase64(salt));
  await writeStore(SECURE_STORE, 'pin-check', await encrypt(PIN_CHECK, key));
  sessionKey = key;
}

export async function unlockOfflinePos(pin: string): Promise<void> {
  const encodedSalt = await readStore<string>(META_STORE, 'salt');
  const check = await readStore<EncryptedValue>(SECURE_STORE, 'pin-check');
  if (!encodedSalt || !check) throw new Error('Offline access has not been configured');
  const key = await deriveKey(pin, decodeBase64(encodedSalt));
  try {
    if ((await decrypt<string>(check, key)) !== PIN_CHECK) throw new Error('Invalid offline PIN');
  } catch {
    throw new Error('Invalid offline PIN');
  }
  sessionKey = key;
}

export function lockOfflinePos(): void {
  sessionKey = null;
}

export async function resetOfflinePos(): Promise<void> {
  sessionKey = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not clear offline data'));
    request.onblocked = () => reject(new Error('Close other Lanyard tabs before clearing offline data'));
  });
}

export async function getDeviceId(): Promise<string> {
  const existing = await readSecure<string>('device-id');
  if (existing) return existing;
  const deviceId = crypto.randomUUID();
  await writeSecure('device-id', deviceId);
  return deviceId;
}

export const saveOfflineSession = (value: OfflineSession) => writeSecure('session', value);
export const getOfflineSession = () => readSecure<OfflineSession>('session');

export const saveCatalog = (catalog: OfflineCatalog) =>
  writeSecure(`catalog:${catalog.branchId}`, catalog);
export const getCatalog = (branchId: string) =>
  readSecure<OfflineCatalog>(`catalog:${branchId}`);

export async function enqueueSale(sale: OfflineQueuedSale): Promise<void> {
  const encrypted = await encrypt(sale);
  const database = await openDatabase();
  try {
    const transaction = database.transaction([META_STORE, SECURE_STORE], 'readwrite');
    const metaStore = transaction.objectStore(META_STORE);
    const secureStore = transaction.objectStore(SECURE_STORE);
    const ids = ((await requestResult(metaStore.get('queue:index'))) as string[] | undefined) ?? [];
    secureStore.put(encrypted, `queue:${sale.id}`);
    if (!ids.includes(sale.id)) metaStore.put([...ids, sale.id], 'queue:index');
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not queue sale'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Queue write aborted'));
    });
  } finally {
    database.close();
  }
}

export async function listQueuedSales(): Promise<OfflineQueuedSale[]> {
  const ids = (await readStore<string[]>(META_STORE, 'queue:index')) ?? [];
  const sales = await Promise.all(ids.map((id) => readSecure<OfflineQueuedSale>(`queue:${id}`)));
  return sales.filter((sale): sale is OfflineQueuedSale => Boolean(sale));
}

export async function updateQueuedSale(sale: OfflineQueuedSale): Promise<void> {
  await writeSecure(`queue:${sale.id}`, sale);
}

export async function removeQueuedSale(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([META_STORE, SECURE_STORE], 'readwrite');
    const metaStore = transaction.objectStore(META_STORE);
    const ids = ((await requestResult(metaStore.get('queue:index'))) as string[] | undefined) ?? [];
    transaction.objectStore(SECURE_STORE).delete(`queue:${id}`);
    metaStore.put(ids.filter((candidate) => candidate !== id), 'queue:index');
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove sale'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Queue removal aborted'));
    });
  } finally {
    database.close();
  }
}

export async function saveSyncedSale(value: OfflineSyncedSale): Promise<void> {
  await writeSecure(`synced:${value.id}`, value);
}
