import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../assets/js/core/variables.js';

test('出現順に取り出し、重複は 1 つに、前後の空白は落とす', () => {
  const sections = [{ title: '', body: '{{ x }} {{y}} {{x}}' }];
  assert.deepEqual(V.extractVariables(sections), ['x', 'y']);
});

test('見出しに書いた変数も拾う', () => {
  assert.deepEqual(V.extractVariables([{ title: '{{題名}}', body: '' }]), ['題名']);
});

test('値を差し込み、空のものは穴のまま残す', () => {
  assert.equal(V.applyVariables('hi {{name}} {{age}}', { name: '太郎' }), 'hi 太郎 {{age}}');
  assert.equal(V.applyVariables('hi {{name}}', {}, { keepEmpty: false }), 'hi ');
});

test('使わなくなった変数の値は捨てる', () => {
  assert.deepEqual(V.pruneValues({ a: '1', b: '2' }, ['a']), { a: '1' });
});

test('改行をまたぐ波括弧は変数として扱わない', () => {
  assert.deepEqual(V.extractVariables([{ title: '', body: '{{a\nb}}' }]), []);
});
