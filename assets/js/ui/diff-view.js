/** 差分の HTML 描画 */

import { diffLines, collapseContext, diffSections } from '../core/diff.js';
import { escapeHtml } from '../core/util.js';

const renderParts = (parts) => parts.map(([op, text]) => (op === '='
  ? escapeHtml(text)
  : `<mark>${escapeHtml(text)}</mark>`)).join('');

function renderLine(line) {
  if (line.type === 'skip') {
    return `<div class="diff__line diff__line--skip">⋯ ${line.count} 行省略</div>`;
  }
  const sign = { add: '+', del: '-', ctx: ' ' }[line.type];
  const gutter = line.type === 'add' ? line.newNo : line.oldNo;
  const text = line.parts ? renderParts(line.parts) : escapeHtml(line.text);
  return `<div class="diff__line diff__line--${line.type}">
    <span class="diff__gutter">${gutter ?? ''}</span>
    <span class="diff__sign">${sign}</span>
    <span class="diff__text">${text || '&nbsp;'}</span>
  </div>`;
}

/**
 * テキスト 2 つの差分ブロック。
 * @param {{label?:string, context?:number|null}} opts context を null にすると全行表示
 */
export function renderTextDiff(oldText, newText, opts = {}) {
  const { label = '', context = 3 } = opts;
  const { lines, stats } = diffLines(oldText, newText);
  const shown = context === null ? lines : collapseContext(lines, context);

  const head = `<div class="diff__head">
      <span style="flex:1 1 auto;min-width:0">${escapeHtml(label)}</span>
      <span class="diff__stat">
        <span class="add">+${stats.added}</span><span class="del">-${stats.removed}</span>
      </span>
    </div>`;

  if (!stats.added && !stats.removed) {
    return `<div class="diff">${head}<div class="diff__body">
      <div class="diff__line diff__line--skip">変更はありません</div></div></div>`;
  }
  return `<div class="diff">${head}<div class="diff__body">${shown.map(renderLine).join('')}</div></div>`;
}

/**
 * セクション単位の差分ビュー。
 * @param {object[]} oldSections
 * @param {object[]} newSections
 * @param {{showUnchanged?:boolean, context?:number|null}} opts
 */
export function renderSectionsDiff(oldSections, newSections, opts = {}) {
  const { showUnchanged = false, context = 3 } = opts;
  const entries = diffSections(oldSections, newSections);
  const visible = entries.filter((e) => showUnchanged || e.status !== 'same');

  if (!visible.length) {
    return `<div class="diff"><div class="diff__body">
      <div class="diff__line diff__line--skip">2 つの版に違いはありません</div></div></div>`;
  }

  return visible.map((e) => {
    const oldBody = e.old?.body ?? '';
    const newBody = e.next?.body ?? '';
    const badge = e.status === 'added' ? '＋ 追加' : e.status === 'removed' ? '− 削除' : '';
    const label = `${e.title}${badge ? `　${badge}` : ''}`;
    if (e.status === 'same') {
      return `<div class="diff"><div class="diff__head">${escapeHtml(e.title)}
        <span class="spacer"></span><span class="small">変更なし</span></div></div>`;
    }
    const titleNote = e.status === 'modified' && e.old.title !== e.next.title
      ? `<div class="diff-secname">見出し: ${escapeHtml(e.old.title || '(なし)')} → ${escapeHtml(e.next.title || '(なし)')}</div>`
      : '';
    return titleNote + renderTextDiff(oldBody, newBody, { label, context });
  }).join('');
}
