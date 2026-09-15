import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../assets/js/core/models.js';

test('v0.1 形式（level なし）のセクションは階層 1 として読み込める', () => {
  const p = M.sanitizePrompt({
    id: 'P1',
    sections: [{ id: 'S1', title: '指示', body: 'x', kind: 'instruction', enabled: true }],
  });
  assert.equal(p.sections[0].level, 1);
  assert.deepEqual(p.variables, {});
});

test('壊れた値は安全な既定へ寄せる', () => {
  const p = M.sanitizePrompt({ id: 'P', title: 123, tags: 'nope', status: 'bogus', sections: 'nope' });
  assert.equal(p.title, '123');
  assert.deepEqual(p.tags, []);
  assert.equal(p.status, 'draft');
  assert.ok(Array.isArray(p.sections));
});

test('取り込んだセクションの階層の飛びはならされる', () => {
  const p = M.sanitizePrompt({
    id: 'P',
    sections: [{ id: 'a', level: 4 }, { id: 'b', level: 4 }],
  });
  assert.deepEqual(p.sections.map((s) => s.level), [1, 2]);
});

test('変数の値は文字列の辞書に揃える', () => {
  assert.deepEqual(M.sanitizeVariables({ a: 1, b: null, c: 'x' }), { a: '1', c: 'x' });
  assert.deepEqual(M.sanitizeVariables(['nope']), {});
});

test('版のスナップショットは promptId が無ければ捨てる', () => {
  assert.equal(M.sanitizeRevision({ version: 1 }), null);
  assert.equal(M.sanitizeRevision({ promptId: 'P', version: 2 }).version, 2);
});

test('設定は既定値とマージし、知らないキーは捨てる', () => {
  const s = M.normalizeSettings({ theme: 'dark', unknown: 1 });
  assert.equal(s.theme, 'dark');
  assert.equal(s.unknown, undefined);
  assert.equal(s.density, M.DEFAULT_SETTINGS.density);
});

test('v0.5 以前のプロンプトは revisionCount を採番カウンタとして引き継ぐ', () => {
  const p = M.sanitizePrompt({ id: 'P', revisionCount: 7 });
  assert.equal(p.lastVersion, 7, '次の版番号が巻き戻ると一意制約に衝突する');
  assert.equal(p.revisionCount, 7);
});

test('lastVersion があればそちらを優先する', () => {
  const p = M.sanitizePrompt({ id: 'P', revisionCount: 2, lastVersion: 9 });
  assert.equal(p.lastVersion, 9);
  assert.equal(p.revisionCount, 2);
});

test('負の値は 0 に丸める', () => {
  const p = M.sanitizePrompt({ id: 'P', revisionCount: -3, lastVersion: -1 });
  assert.equal(p.revisionCount, 0);
  assert.equal(p.lastVersion, 0);
});
