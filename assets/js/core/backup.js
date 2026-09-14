/** 全データのバックアップ（エクスポート／インポート） */

import * as db from './db.js';
import * as store from './store.js';
import { sanitizeFolder, sanitizePrompt, sanitizeRevision, sanitizeSnippet, normalizeSettings } from './models.js';
import { APP } from './app-info.js';

export const BACKUP_KIND = 'sodateru-prompt.backup';
export const BACKUP_SCHEMA = 1;

/** 全ストアを 1 つの JSON オブジェクトにまとめる */
export async function buildBackup() {
  const [folders, prompts, revisions, snippets] = await Promise.all([
    db.getAll(db.STORES.folders),
    db.getAll(db.STORES.prompts),
    db.getAll(db.STORES.revisions),
    db.getAll(db.STORES.snippets),
  ]);
  return {
    kind: BACKUP_KIND,
    schemaVersion: BACKUP_SCHEMA,
    appVersion: APP.version,
    exportedAt: new Date().toISOString(),
    counts: {
      folders: folders.length,
      prompts: prompts.length,
      revisions: revisions.length,
      snippets: snippets.length,
    },
    settings: store.state.settings,
    data: { folders, prompts, revisions, snippets },
  };
}

export async function exportBackupText() {
  return JSON.stringify(await buildBackup(), null, 2);
}

/** 将来スキーマが変わったらここで段階的に変換する */
function migrateBackup(backup) {
  const version = Number(backup.schemaVersion) || 1;
  if (version > BACKUP_SCHEMA) {
    throw new Error('このバックアップは新しいバージョンで作られています。アプリを更新してください。');
  }
  return backup;
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON として読み取れませんでした。');
  }
  if (!parsed || typeof parsed !== 'object' || parsed.kind !== BACKUP_KIND) {
    throw new Error('「育てるプロンプト」のバックアップファイルではありません。');
  }
  return migrateBackup(parsed);
}

/**
 * バックアップを取り込む。
 * @param {object} backup
 * @param {{mode?: 'replace'|'merge', restoreSettings?: boolean}} opts
 *   replace: 既存データを全消去してから取り込む
 *   merge  : 同じ id は上書き、無いものは追加
 */
export async function importBackup(backup, { mode = 'merge', restoreSettings = true } = {}) {
  const src = backup.data ?? {};
  const payload = {
    [db.STORES.folders]: (src.folders ?? []).map(sanitizeFolder).filter(Boolean),
    [db.STORES.prompts]: (src.prompts ?? []).map(sanitizePrompt).filter(Boolean),
    [db.STORES.revisions]: (src.revisions ?? []).map(sanitizeRevision).filter(Boolean),
    [db.STORES.snippets]: (src.snippets ?? []).map(sanitizeSnippet).filter(Boolean),
  };

  await db.bulkWrite(payload, { replace: mode === 'replace' });

  if (restoreSettings && backup.settings) {
    await db.put(db.STORES.meta, { key: 'settings', value: normalizeSettings(backup.settings) });
  }
  await store.reload();

  return {
    folders: payload[db.STORES.folders].length,
    prompts: payload[db.STORES.prompts].length,
    revisions: payload[db.STORES.revisions].length,
    snippets: payload[db.STORES.snippets].length,
  };
}

export async function wipeEverything() {
  await db.wipeAll();
  await store.reload();
}

export function backupFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `sodateru-prompt_backup_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
