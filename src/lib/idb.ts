import { openDB } from "idb";
import { createJSONStorage } from "zustand/middleware";

export const IDbStore = openDB("logicflow", 5, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("projects")) {
      db.createObjectStore("projects");
    }
    if (!db.objectStoreNames.contains("uiConfig")) {
      db.createObjectStore("uiConfig");
    }
    if (!db.objectStoreNames.contains("agent")) {
      db.createObjectStore("agent");
    }
    if (!db.objectStoreNames.contains("checkpoints")) {
      db.createObjectStore("checkpoints");
    }
    if (!db.objectStoreNames.contains("fileAssets")) {
      db.createObjectStore("fileAssets");
    }
  },
});

export const createIDbStorage = <T>(storeName: string) =>
  createJSONStorage<T>(() => ({
    getItem: async (key) =>
      (await IDbStore)
        .get(storeName, key)
        .then((data) => data || null)
        .catch((e) => (console.error(`IndexedDB getItem error:`, e), null)),
    setItem: async (key, value) =>
      (await IDbStore).put(storeName, value, key).catch((e) => {
        console.error(`IndexedDB setItem error:`, e);
      }),
    removeItem: async (key) =>
      (await IDbStore).delete(storeName, key).catch((e) => {
        console.error(`IndexedDB removeItem error:`, e);
      }),
  }));
