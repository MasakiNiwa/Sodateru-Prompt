/**
 * IndexedDB の薄いラッパー。
 *
 * 拡張方針:
 *   スキーマを変更するときは MIGRATIONS に「次のバージョン番号」のエントリを
 *   追加するだけでよい。既存ユーザーは古いバージョンから順に適用される。
 */

export const DB_NAME = 'sodateru-prompt';
export const DB_VERSION = 1;

export const STORES = {
  folders: 'folders',
  prompts: 'prompts',
  revisions: 'revisions',
  snippets: 'snippets',
  meta: 'meta',
};

/**
 * key   : このバージョンへ上げるときに実行する処理
 * value : (db, tx) => void   ※ upgradeneeded 内なので同期 API のみ使用可
 */
const MIGRATIONS = {
  1(db) {
    const folders = db.createObjectStore(STORES.folders, { keyPath: 'id' });
    folders.createIndex('order', 'order');

    const prompts = db.createObjectStore(STORES.prompts, { keyPath: 'id' });
    prompts.createIndex('folderId', 'folderId');
    prompts.createIndex('updatedAt', 'updatedAt');
    prompts.createIndex('status', 'status');

    const revisions = db.createObjectStore(STORES.revisions, { keyPath: 'id' });
    revisions.createIndex('promptId', 'promptId');
    revisions.createIndex('promptId_version', ['promptId', 'version'], { unique: true });

    const snippets = db.createObjectStore(STORES.snippets, { keyPath: 'id' });
    snippets.createIndex('updatedAt', 'updatedAt');

    db.createObjectStore(STORES.meta, { keyPath: 'key' });
  },
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      for (let v = event.oldVersion + 1; v <= DB_VERSION; v++) {
        MIGRATIONS[v]?.(db, req.transaction);
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('別のタブが古いバージョンで開いています。他のタブを閉じて再読み込みしてください。'));
  });
  return dbPromise;
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function run(storeNames, mode, fn) {
  const db = await openDB();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('トランザクションが中断されました'));
    Promise.resolve(fn(...names.map((n) => tx.objectStore(n)), tx))
      .then((r) => { result = r; })
      .catch((err) => { reject(err); try { tx.abort(); } catch { /* 済 */ } });
  });
}

export const get = (store, key) => run(store, 'readonly', (s) => wrap(s.get(key)));
export const getAll = (store) => run(store, 'readonly', (s) => wrap(s.getAll()));
export const put = (store, value) => run(store, 'readwrite', (s) => wrap(s.put(value)).then(() => value));
export const del = (store, key) => run(store, 'readwrite', (s) => wrap(s.delete(key)));
export const clearStore = (store) => run(store, 'readwrite', (s) => wrap(s.clear()));

export const putMany = (store, values) => run(store, 'readwrite',
  (s) => Promise.all(values.map((v) => wrap(s.put(v)))));

export const getAllByIndex = (store, index, query) => run(store, 'readonly',
  (s) => wrap(s.index(index).getAll(query)));

export const deleteByIndex = (store, index, query) => run(store, 'readwrite', (s) => new Promise((resolve, reject) => {
  const req = s.index(index).openKeyCursor(query);
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) { resolve(); return; }
    s.delete(cursor.primaryKey);
    cursor.continue();
  };
  req.onerror = () => reject(req.error);
}));

export const count = (store) => run(store, 'readonly', (s) => wrap(s.count()));

/**
 * 版の確定（履歴の追加 + プロンプト側の採番更新）を 1 トランザクションで行う。
 * 別々に書くと、途中で失敗したときに番号と履歴がずれる。
 */
export function commitRevisionTx(revision, prompt) {
  return run([STORES.revisions, STORES.prompts], 'readwrite', (revs, prompts) => Promise.all([
    wrap(revs.put(revision)),
    wrap(prompts.put(prompt)),
  ]));
}

/** 版を消し、同じトランザクションでプロンプト側の残数も直す */
export function deleteRevisionTx(revId, prompt) {
  return run([STORES.revisions, STORES.prompts], 'readwrite', (revs, prompts) => Promise.all([
    wrap(revs.delete(revId)),
    wrap(prompts.put(prompt)),
  ]));
}

/** 複数ストアへの一括書き込みを 1 トランザクションで行う（バックアップ復元用） */
export function bulkWrite(payload, { replace = false } = {}) {
  const names = Object.keys(payload);
  if (!names.length) return Promise.resolve();
  return run(names, 'readwrite', (...stores) => {
    const tasks = [];
    names.forEach((name, i) => {
      const store = stores[i];
      if (replace) tasks.push(wrap(store.clear()));
      for (const record of payload[name]) tasks.push(wrap(store.put(record)));
    });
    return Promise.all(tasks);
  });
}

/** 全データ削除（設定も含む） */
export async function wipeAll() {
  const names = Object.values(STORES);
  return run(names, 'readwrite', (...stores) => Promise.all(
    stores.filter((s) => typeof s.clear === 'function').map((s) => wrap(s.clear())),
  ));
}
