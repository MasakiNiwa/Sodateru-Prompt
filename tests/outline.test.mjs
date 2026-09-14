import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../assets/js/core/outline.js';

const S = (id, level) => ({ id, level, title: id, body: '', kind: 'text', enabled: true });
const ids = (arr) => arr.map((s) => `${s.id}${s.level}`).join(' ');

test('normalizeLevels はレベルの飛びをならす', () => {
  assert.equal(ids(O.normalizeLevels([S('a', 3), S('b', 4), S('c', 1)])), 'a1 b2 c1');
});

test('subtreeRange は配下をすべて含む', () => {
  const s = [S('a', 1), S('b', 2), S('c', 3), S('d', 1)];
  assert.deepEqual(O.subtreeRange(s, 0), [0, 3]);
  assert.deepEqual(O.subtreeRange(s, 1), [1, 3]);
  assert.deepEqual(O.subtreeRange(s, 3), [3, 4]);
});

test('moveUp は配下ごと動かす', () => {
  assert.equal(ids(O.moveUp([S('a', 1), S('b', 1), S('c', 2)], 1)), 'b1 c2 a1');
});

test('moveDown は次の兄弟の配下をまたぐ', () => {
  assert.equal(ids(O.moveDown([S('a', 1), S('b', 1), S('c', 2), S('d', 1)], 0)), 'b1 c2 a1 d1');
});

test('先頭での moveUp は何もしない', () => {
  const s = [S('a', 1), S('b', 1)];
  assert.equal(O.moveUp(s, 0), s);
});

test('字下げすると配下も一緒に深くなる', () => {
  assert.equal(ids(O.shiftLevel([S('a', 1), S('b', 1), S('c', 2)], 1, 1)), 'a1 b2 c3');
});

test('レベルが飛ぶ字下げは拒否する', () => {
  const s = [S('a', 1), S('b', 1), S('c', 2)];
  assert.equal(O.shiftLevel(s, 2, 1), s, 'c はすでに b の子');
  assert.equal(O.shiftLevel(s, 0, 1), s, '先頭は字下げできない');
});

test('レベル 1 より浅くはできない', () => {
  const s = [S('a', 1)];
  assert.equal(O.shiftLevel(s, 0, -1), s);
  assert.equal(ids(O.shiftLevel([S('a', 1), S('b', 2), S('c', 3)], 1, -1)), 'a1 b1 c2');
});

test('親を失った配下はレベルがならされる', () => {
  assert.equal(ids(O.moveSubtree([S('a', 1), S('b', 2), S('c', 1)], 1, 0)), 'b1 a1 c1');
});

test('自分の範囲内への移動は何もしない', () => {
  const s = [S('a', 1), S('b', 2)];
  assert.equal(O.moveSubtree(s, 0, 1), s);
});

test('buildTree はレベルどおりに入れ子にする', () => {
  const tree = O.buildTree([S('a', 1), S('b', 2), S('c', 3), S('d', 1)]);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].children[0].section.id, 'b');
  assert.equal(tree[0].children[0].children[0].section.id, 'c');
});

test('clampLevel は 1〜MAX_LEVEL に収める', () => {
  assert.equal(O.clampLevel(0), 1);
  assert.equal(O.clampLevel(undefined), 1);
  assert.equal(O.clampLevel(99), O.MAX_LEVEL);
});
