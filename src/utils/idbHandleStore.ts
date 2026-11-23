import type { FinPulseFileSystemFileHandle } from '@/types/fsa';

const DB_NAME = 'finpulse-excel-sync';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const HANDLE_KEY = 'activeWorkbook';

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open error'));
  });
}

export async function saveFileHandle(handle: FinPulseFileSystemFileHandle): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write error'));
    });
  } finally {
    db.close();
  }
}

export async function loadFileHandle(): Promise<FinPulseFileSystemFileHandle | null> {
  if (!hasIndexedDb()) return null;
  try {
    const db = await openDb();
    try {
      return await new Promise<FinPulseFileSystemFileHandle | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        req.onsuccess = () => resolve((req.result as FinPulseFileSystemFileHandle | undefined) ?? null);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB read error'));
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function clearFileHandle(): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete error'));
      });
    } finally {
      db.close();
    }
  } catch {
    // Bezpieczne zignorowanie błędu w trybie prywatnym
  }
}
