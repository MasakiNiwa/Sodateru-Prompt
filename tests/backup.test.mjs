/** バックアップの検証。壊れたファイルで既存データを失わないことを固定する */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// backup.js は store.js 経由でブラウザ API を触るので、最小限のスタブを置く。
// Node には本物の BroadcastChannel があり、そのままだとイベントループが
// 開いたままになってテストが終わらないので、必ず差し替える。
globalThis.indexedDB = { open: () => ({}) };
globalThis.BroadcastChannel = class { postMessage() {} close() {} };

const { parseBackup, BACKUP_KIND } = await import('../assets/js/core/backup.js');

const wrap = (data, extra = {}) => JSON.stringify({
  kind: BACKUP_KIND, schemaVersion: 1, data, ...extra,
});

const onePrompt = { id: 'P1', title: 'T', sections: [{ id: 'S1', title: 'a', body: 'b' }] };

test('正しいバックアップは読み込める', () => {
  const b = parseBackup(wrap({ prompts: [onePrompt], folders: [], revisions: [], snippets: [] }));
  assert.equal(b.counts.prompts, 1);
  assert.equal(b.records.prompts[0].id, 'P1');
});

test('kind が違えば受け付けない', () => {
  assert.throws(() => parseBackup(JSON.stringify({ kind: 'other', data: {} })), /バックアップファイルではありません/);
});

test('data が無いファイルは空のバックアップとして通さない', () => {
  // これを通すと「置き換え」で既存データが消える
  assert.throws(() => parseBackup(JSON.stringify({ kind: BACKUP_KIND })), /中身/);
});

test('data の中身が配列でなければ拒否する', () => {
  assert.throws(() => parseBackup(wrap({ prompts: 'nope' })), /形が正しくありません/);
});

test('中身が空ならエラーにする', () => {
  assert.throws(() => parseBackup(wrap({ prompts: [], folders: [], revisions: [], snippets: [] })), /1 件もありません/);
});

test('counts はファイルの値ではなく検証済みレコードから数える', () => {
  // 細工した counts をそのまま画面に出すと HTML を差し込まれてしまう
  const evil = wrap({ prompts: [onePrompt], folders: [], revisions: [], snippets: [] },
    { counts: { prompts: '<img src=x onerror=alert(1)>', revisions: 999 } });
  const b = parseBackup(evil);
  assert.equal(b.counts.prompts, 1);
  assert.equal(b.counts.revisions, 0);
  for (const v of Object.values(b.counts)) assert.equal(typeof v, 'number');
});

test('メタ情報は文字列として長さを切り詰める', () => {
  const b = parseBackup(wrap({ prompts: [onePrompt] }, { appVersion: { evil: true }, exportedAt: 'x'.repeat(500) }));
  assert.equal(b.meta.appVersion, '');
  assert.ok(b.meta.exportedAt.length <= 40);
});

test('同じ (promptId, version) の版は 1 つに絞る', () => {
  const rev = (id) => ({ id, promptId: 'P1', version: 2, sections: [] });
  const b = parseBackup(wrap({ prompts: [onePrompt], revisions: [rev('R1'), rev('R2')] }));
  assert.equal(b.records.revisions.length, 1);
  assert.equal(b.dropped.duplicateRevisions, 1);
});

test('親のいない版は取り込まない', () => {
  const b = parseBackup(wrap({
    prompts: [onePrompt],
    revisions: [{ id: 'R1', promptId: 'MISSING', version: 1, sections: [] }],
  }));
  assert.equal(b.records.revisions.length, 0);
  assert.equal(b.dropped.orphanRevisions, 1);
});

test('新しいスキーマは読み込まない', () => {
  assert.throws(() => parseBackup(JSON.stringify({ kind: BACKUP_KIND, schemaVersion: 99, data: {} })), /新しいバージョン/);
});
