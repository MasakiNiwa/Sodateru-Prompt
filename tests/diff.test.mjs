import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../assets/js/core/diff.js';

const S = (id, level, title, body) => ({ id, level, title, body, kind: 'text', enabled: true });

test('行差分は追加と削除を数える', () => {
  const { stats } = D.diffLines('a\nb', 'a\nb\nc');
  assert.deepEqual(stats, { added: 1, removed: 0 });
});

test('同じ内容なら差分は出ない', () => {
  const { stats } = D.diffLines('a\nb', 'a\nb');
  assert.deepEqual(stats, { added: 0, removed: 0 });
});

test('置き換えた行には語単位のハイライトが付く', () => {
  const { lines } = D.diffLines('hello world', 'hello there');
  const add = lines.find((l) => l.type === 'add');
  assert.ok(add.parts, '語単位の差分が付いていない');
  assert.ok(add.parts.some(([op, t]) => op === '+' && t === 'there'));
});

test('collapseContext は離れた無変更行を畳む', () => {
  const { lines } = D.diffLines(Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n'),
    Array.from({ length: 30 }, (_, i) => (i === 15 ? 'changed' : `l${i}`)).join('\n'));
  const shown = D.collapseContext(lines, 3);
  assert.ok(shown.some((l) => l.type === 'skip'));
  assert.ok(shown.length < lines.length);
});

test('階層の変更もセクションの変更として拾う', () => {
  const r = D.diffSections([S('a', 1, 'T', 'x')], [S('a', 2, 'T', 'x')]);
  assert.equal(r[0].status, 'modified');
  assert.equal(r[0].levelChanged, true);
});

test('同一のセクションは変更なし', () => {
  assert.equal(D.diffSections([S('a', 1, 'T', 'x')], [S('a', 1, 'T', 'x')])[0].status, 'same');
});

test('追加と削除を区別する', () => {
  const r = D.diffSections([S('a', 1, 'A', '')], [S('b', 1, 'B', '')]);
  assert.deepEqual(r.map((e) => e.status).sort(), ['added', 'removed']);
});

test('本文以外（タイトル・概要・タグ・変数）の変化も拾う', () => {
  const a = { title: 'A', summary: '', tags: ['x'], variables: { v: '1' } };
  const b = { title: 'B', summary: 'S', tags: ['x', 'y'], variables: { v: '2' } };
  const labels = D.diffMeta(a, b).map((m) => m.label);
  assert.deepEqual(labels, ['タイトル', '概要', 'タグ', '変数の値']);
});

test('同じ内容ならメタ差分は出ない', () => {
  const a = { title: 'A', summary: 'S', tags: ['x'], variables: { v: '1' } };
  assert.deepEqual(D.diffMeta(a, { ...a }), []);
});

test('並び順だけ入れ替えた場合も変更として拾う', () => {
  // 入れ替えは「片方が動いた」と記録される（LCS に残らなかった側）。
  // 以前は両方とも same になり「違いはありません」と出てしまっていた。
  const a = [S('a', 1, 'A', 'x'), S('b', 1, 'B', 'y')];
  const b = [S('b', 1, 'B', 'y'), S('a', 1, 'A', 'x')];
  const r = D.diffSections(a, b);
  assert.equal(r.filter((e) => e.moved).length, 1, '並び替えが検出されていない');
  assert.ok(r.some((e) => e.status === 'modified'), '変更として現れていない');
});

test('並びが変わっていなければ moved は立たない', () => {
  const a = [S('a', 1, 'A', 'x'), S('b', 1, 'B', 'y')];
  assert.ok(D.diffSections(a, a.map((s) => ({ ...s }))).every((e) => !e.moved));
});
