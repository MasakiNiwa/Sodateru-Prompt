/**
 * 「版＝その時点の Prompt 全体」という定義の回帰テスト。
 * store.js は IndexedDB に触れるため、純粋な部分だけをここで固定する。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevision, createPrompt } from '../assets/js/core/models.js';

/** store.snapshotOf と同じ 5 項目。ここが版の定義 */
const SNAPSHOT_FIELDS = ['title', 'summary', 'tags', 'sections', 'variables'];

test('版のスナップショットは中身 5 項目をすべて持つ', () => {
  const prompt = createPrompt({
    title: 'T', summary: 'S', tags: ['a'],
    variables: { x: '1' },
  });
  const rev = createRevision(prompt, 'メモ', 1);
  for (const f of SNAPSHOT_FIELDS) {
    assert.ok(f in rev, `版に ${f} が入っていない`);
  }
  assert.deepEqual(rev.variables, { x: '1' }, '変数の値が版に残っていない');
});

test('版は元のプロンプトと参照を共有しない', () => {
  const prompt = createPrompt({ tags: ['a'], variables: { x: '1' } });
  const rev = createRevision(prompt, '', 1);
  prompt.tags.push('b');
  prompt.variables.x = '2';
  prompt.sections[0].body = 'changed';
  assert.deepEqual(rev.tags, ['a']);
  assert.deepEqual(rev.variables, { x: '1' });
  assert.equal(rev.sections[0].body, '');
});

test('変数だけ違えば別のスナップショットとみなせる', () => {
  const pick = (o) => JSON.stringify(Object.fromEntries(SNAPSHOT_FIELDS.map((f) => [f, o[f] ?? null])));
  const a = createPrompt({ title: 'T', variables: { x: '1' } });
  const b = { ...a, variables: { x: '2' } };
  assert.notEqual(pick(a), pick(b), '変数の違いを取りこぼしている');
});

test('タイトルだけ違えば別のスナップショットとみなせる', () => {
  const pick = (o) => JSON.stringify(Object.fromEntries(SNAPSHOT_FIELDS.map((f) => [f, o[f] ?? null])));
  const a = createPrompt({ title: 'T' });
  assert.notEqual(pick(a), pick({ ...a, title: 'U' }));
});
