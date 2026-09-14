/** プロンプトをテキスト形式へ書き出す */

import { kindLabel, kindTag } from './models.js';
import { safeFileName } from './util.js';
import { buildTree, levelOf, levelMarker } from './outline.js';
import { applyToSections } from './variables.js';

export const FORMATS = [
  { id: 'markdown', label: 'Markdown', ext: 'md', mime: 'text/markdown' },
  { id: 'plain', label: 'プレーンテキスト', ext: 'txt', mime: 'text/plain' },
  { id: 'xml', label: 'XML タグ', ext: 'txt', mime: 'text/plain' },
  { id: 'body', label: '本文のみ', ext: 'txt', mime: 'text/plain' },
  { id: 'json', label: 'JSON', ext: 'json', mime: 'application/json' },
];

export const getFormat = (id) => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

/**
 * 出力に載せるセクションを選ぶ。
 * 中身が空でも、配下にセクションがある見出しは残す（階層が崩れるため）。
 */
function visibleSections(prompt, includeDisabled) {
  const all = prompt.sections ?? [];
  const allowed = all.filter((s) => includeDisabled || s.enabled !== false);
  return allowed.filter((s, i) => {
    if (s.title.trim() || s.body.trim()) return true;
    const next = allowed[i + 1];
    return Boolean(next) && levelOf(next) > levelOf(s);
  });
}

/** 見出しを XML タグ名に使える形へ。使えないときは空文字 */
const asciiSlug = (title) => String(title ?? '')
  .trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const escapeXmlAttr = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 開始タグを組み立てる。
 * 見出しがタグ名にできない（日本語など）ときは役割のタグ名を使い、
 * 見出しは name 属性に残す。こうしないと親子・兄弟が同じタグ名になり、
 * どの見出しだったのか分からなくなる。
 */
function xmlTagParts(section) {
  const slug = asciiSlug(section.title);
  if (slug) return { tag: slug, attr: '' };
  const title = String(section.title ?? '').trim();
  return { tag: kindTag(section.kind), attr: title ? ` name="${escapeXmlAttr(title)}"` : '' };
}

const headingText = (s) => s.title.trim() || kindLabel(s.kind);

function toMarkdown(prompt, sections) {
  const out = [];
  if (prompt.title) out.push(`# ${prompt.title}`, '');
  if (prompt.summary) out.push(`> ${prompt.summary.replace(/\n/g, '\n> ')}`, '');
  for (const s of sections) {
    // プロンプト名が # なので、レベル 1 のセクションは ## から始める
    out.push(`${'#'.repeat(levelOf(s) + 1)} ${headingText(s)}`, '');
    if (s.body.trim()) out.push(s.body.trim(), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function toPlain(prompt, sections, { showTitles = true } = {}) {
  const out = [];
  if (prompt.title) out.push(`【${prompt.title}】`, '');
  for (const s of sections) {
    if (showTitles) out.push(`${levelMarker(levelOf(s))} ${headingText(s)}`);
    if (s.body.trim()) out.push(s.body.trim());
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 見出しの階層をタグの入れ子として書き出す。
 * 本文は字下げせずそのまま出す（コードなど、字下げに意味がある内容を壊さないため）。
 */
function toXml(prompt, sections) {
  const walk = (nodes, depth) => {
    const lines = [];
    for (const { section, children } of nodes) {
      const body = section.body.trim();
      const inner = walk(children, depth + 1);
      // 中身も配下も空なら、タグごと出さない
      if (!body && !inner.length) continue;
      const pad = '  '.repeat(depth);
      const { tag, attr } = xmlTagParts(section);
      lines.push(`${pad}<${tag}${attr}>`);
      if (body) lines.push(body);
      lines.push(...inner);
      lines.push(`${pad}</${tag}>`);
    }
    return lines;
  };
  return walk(buildTree(sections), 0).join('\n').trim();
}

const toBody = (sections) => sections.map((s) => s.body.trim()).filter(Boolean).join('\n\n');

function toJson(prompt, sections) {
  const toNode = ({ section, children }) => {
    const node = { title: section.title, kind: section.kind, body: section.body };
    if (children.length) node.sections = children.map(toNode);
    return node;
  };
  return JSON.stringify({
    title: prompt.title,
    summary: prompt.summary,
    tags: prompt.tags ?? [],
    version: prompt.revisionCount ?? 0,
    sections: buildTree(sections).map(toNode),
  }, null, 2);
}

/**
 * @param {object} prompt  プロンプト（または版のスナップショット）
 * @param {string} formatId
 * @param {{includeDisabled?:boolean, showTitles?:boolean,
 *          variables?:Record<string,string>, keepEmptyVariables?:boolean}} opts
 */
export function renderPrompt(prompt, formatId = 'markdown', opts = {}) {
  let sections = visibleSections(prompt, opts.includeDisabled);
  if (opts.variables && Object.keys(opts.variables).length) {
    sections = applyToSections(sections, opts.variables, { keepEmpty: opts.keepEmptyVariables !== false });
  }
  switch (formatId) {
    case 'plain': return toPlain(prompt, sections, opts);
    case 'xml': return toXml(prompt, sections);
    case 'body': return toBody(sections);
    case 'json': return toJson(prompt, sections);
    case 'markdown':
    default: return toMarkdown(prompt, sections);
  }
}

export function exportFileName(prompt, formatId) {
  const fmt = getFormat(formatId);
  const base = safeFileName(prompt.title || '無題のプロンプト');
  const v = prompt.revisionCount ? `_v${prompt.revisionCount}` : '';
  return `${base}${v}.${fmt.ext}`;
}

/** 単一セクションのテキスト（セクション単位のコピー用） */
export function renderSection(section, formatId = 'markdown') {
  const heading = headingText(section);
  switch (formatId) {
    case 'xml': {
      const { tag, attr } = xmlTagParts(section);
      return `<${tag}${attr}>\n${section.body.trim()}\n</${tag}>`;
    }
    case 'body': return section.body.trim();
    case 'plain': return `${levelMarker(levelOf(section))} ${heading}\n${section.body.trim()}`;
    case 'markdown':
    default: return `${'#'.repeat(levelOf(section) + 1)} ${heading}\n\n${section.body.trim()}`;
  }
}
