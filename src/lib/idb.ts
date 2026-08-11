import { openDB } from "idb";
import { createJSONStorage } from "zustand/middleware";

export const IDbStore = openDB("logicflow", 6, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("projects")) {
      db.createObjectStore("projects");
    }
    if (!db.objectStoreNames.contains("uiConfig")) {
      db.createObjectStore("uiConfig");
    }
    if (!db.objectStoreNames.contains("checkpoints")) {
      db.createObjectStore("checkpoints");
    }
    if (!db.objectStoreNames.contains("fileAssets")) {
      db.createObjectStore("fileAssets");
    }
    if (!db.objectStoreNames.contains("agentProjects")) {
      db.createObjectStore("agentProjects");
    }
  },
});

export const createIDbStorage = <T>(storeName: string, onError?: () => void) =>
  createJSONStorage<T>(() => ({
    getItem: async (key) =>
      (await IDbStore)
        .get(storeName, key)
        .then((data) => data || null)
        .catch((e) => (console.error(`IndexedDB getItem error:`, e), null)),
    setItem: async (key, value) =>
      (await IDbStore).put(storeName, value, key).catch((e) => {
        console.error(`IndexedDB setItem error:`, e);
        onError?.();
      }),
    removeItem: async (key) =>
      (await IDbStore).delete(storeName, key).catch((e) => {
        console.error(`IndexedDB removeItem error:`, e);
      }),
  }));

export async function commitAgentEdit(
  projects: unknown,
  agentProjects: unknown,
  agentPreferences: {
    apiKeys: unknown;
    selectedModel: unknown;
    thinkingLevel: unknown;
  }
) {
  const db = await IDbStore;
  const transaction = db.transaction(
    ["projects", "agentProjects"],
    "readwrite"
  );
  await Promise.all([
    transaction
      .objectStore("projects")
      .put(JSON.stringify({ state: { projects }, version: 0 }), "projects"),
    transaction.objectStore("agentProjects").put(
      JSON.stringify({
        state: { ...agentPreferences, agentProjects },
        version: 0,
      }),
      "agent"
    ),
    transaction.done,
  ]);
}
