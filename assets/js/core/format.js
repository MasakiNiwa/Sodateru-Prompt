/** プロンプトをテキスト形式へ書き出す */

import { kindLabel, kindTag } from './models.js';
import { safeFileName } from './util.js';

export const FORMATS = [
  { id: 'markdown', label: 'Markdown', ext: 'md', mime: 'text/markdown' },
  { id: 'plain', label: 'プレーンテキスト', ext: 'txt', mime: 'text/plain' },
  { id: 'xml', label: 'XML タグ', ext: 'txt', mime: 'text/plain' },
  { id: 'body', label: '本文のみ', ext: 'txt', mime: 'text/plain' },
  { id: 'json', label: 'JSON', ext: 'json', mime: 'application/json' },
];

export const getFormat = (id) => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

const visibleSections = (prompt, includeDisabled) => (prompt.sections ?? [])
  .filter((s) => (includeDisabled || s.enabled !== false))
  .filter((s) => s.title.trim() || s.body.trim());

/** XML タグ名として使える形に落とす */
function tagName(section) {
  const fromTitle = String(section.title ?? '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return fromTitle || kindTag(section.kind);
}

function toMarkdown(prompt, sections) {
  const out = [];
  if (prompt.title) out.push(`# ${prompt.title}`, '');
  if (prompt.summary) out.push(`> ${prompt.summary.replace(/\n/g, '\n> ')}`, '');
  for (const s of sections) {
    out.push(`## ${s.title || kindLabel(s.kind)}`, '');
    if (s.body.trim()) out.push(s.body.trim(), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function toPlain(prompt, sections, { showTitles = true } = {}) {
  const out = [];
  if (prompt.title) out.push(`【${prompt.title}】`, '');
  for (const s of sections) {
    if (showTitles) out.push(`■ ${s.title || kindLabel(s.kind)}`);
    if (s.body.trim()) out.push(s.body.trim());
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function toXml(prompt, sections) {
  const out = [];
  for (const s of sections) {
    const tag = tagName(s);
    out.push(`<${tag}>`, s.body.trim(), `</${tag}>`, '');
  }
  return out.join('\n').trim();
}

const toBody = (sections) => sections.map((s) => s.body.trim()).filter(Boolean).join('\n\n');

function toJson(prompt, sections) {
  return JSON.stringify({
    title: prompt.title,
    summary: prompt.summary,
    tags: prompt.tags ?? [],
    version: prompt.revisionCount ?? 0,
    sections: sections.map((s) => ({
      title: s.title, kind: s.kind, body: s.body,
    })),
  }, null, 2);
}

/**
 * @param {object} prompt  プロンプト（または版のスナップショット）
 * @param {string} formatId
 * @param {{includeDisabled?:boolean, showTitles?:boolean}} opts
 */
export function renderPrompt(prompt, formatId = 'markdown', opts = {}) {
  const sections = visibleSections(prompt, opts.includeDisabled);
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
  switch (formatId) {
    case 'xml': return `<${tagName(section)}>\n${section.body.trim()}\n</${tagName(section)}>`;
    case 'body': return section.body.trim();
    case 'plain': return `■ ${section.title || kindLabel(section.kind)}\n${section.body.trim()}`;
    case 'markdown':
    default: return `## ${section.title || kindLabel(section.kind)}\n\n${section.body.trim()}`;
  }
}
