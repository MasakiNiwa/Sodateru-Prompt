import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../assets/js/core/format.js';

const S = (id, level, title, body = '', kind = 'text') => ({
  id, level, title, body, kind, enabled: true,
});

const prompt = {
  title: 'T', summary: '', revisionCount: 0,
  sections: [
    S('a', 1, '前提', 'ctx', 'context'),
    S('b', 2, '背景', 'bg', 'note'),
    S('c', 1, '指示', 'do {{x}}', 'instruction'),
  ],
};

test('Markdown は階層を見出しの深さで表す', () => {
  const md = F.renderPrompt(prompt, 'markdown');
  assert.match(md, /^## 前提$/m);
  assert.match(md, /^### 背景$/m);
  assert.match(md, /^## 指示$/m);
});

test('XML は配下を親タグの内側に入れる', () => {
  const xml = F.renderPrompt(prompt, 'xml');
  const open = xml.indexOf('<context');
  const child = xml.indexOf('<note');
  const close = xml.indexOf('</context>');
  assert.ok(open < child && child < close, `入れ子になっていない:\n${xml}`);
});

test('XML はタグ名にできない見出しを name 属性に残す', () => {
  const xml = F.renderPrompt(prompt, 'xml');
  assert.match(xml, /<context name="前提">/);
  assert.match(xml, /<note name="背景">/);
});

test('XML は英数字の見出しをタグ名にする', () => {
  const p = { title: '', sections: [S('a', 1, 'Output Format', 'json')] };
  assert.match(F.renderPrompt(p, 'xml'), /<output_format>/);
});

test('XML は中身も配下も空の見出しを出さない', () => {
  const p = { title: '', sections: [S('a', 1, '空の親', '', 'context'), S('b', 2, '空の子', '', 'note')] };
  assert.equal(F.renderPrompt(p, 'xml'), '');
});

test('XML は本文の字下げをそのまま残す', () => {
  const code = 'def f():\n    return 1';
  const p = { title: '', sections: [S('a', 1, 'Outer', '', 'context'), S('b', 2, 'Inner', code, 'note')] };
  assert.ok(F.renderPrompt(p, 'xml').includes(code));
});

test('JSON は階層を入れ子で表す', () => {
  const j = JSON.parse(F.renderPrompt(prompt, 'json'));
  assert.equal(j.sections.length, 2);
  assert.equal(j.sections[0].sections[0].title, '背景');
});

test('プレーンテキストは階層を行頭記号で表す', () => {
  const p = F.renderPrompt(prompt, 'plain');
  assert.match(p, /^■ 前提$/m);
  assert.match(p, /^▸ 背景$/m);
});

test('変数は指定したときだけ差し込まれる', () => {
  assert.match(F.renderPrompt(prompt, 'body', { variables: { x: 'それ' } }), /do それ/);
  assert.match(F.renderPrompt(prompt, 'body'), /do \{\{x\}\}/);
});

test('配下を持つ空の見出しは出力に残る', () => {
  const p = { title: '', sections: [S('a', 1, '', ''), S('b', 2, '子', 'x')] };
  assert.match(F.renderPrompt(p, 'markdown'), /### 子/);
});

test('無効なセクションは既定で出力しない', () => {
  const p = { title: '', sections: [{ ...S('a', 1, '出さない', 'hidden'), enabled: false }] };
  assert.equal(F.renderPrompt(p, 'body'), '');
  assert.equal(F.renderPrompt(p, 'body', { includeDisabled: true }), 'hidden');
});
