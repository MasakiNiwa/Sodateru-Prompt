/** 差分の HTML 描画 */

import { diffLines, collapseContext, diffSections, diffMeta } from '../core/diff.js';
import { escapeHtml, icon } from '../core/util.js';
import { levelLabel, levelOf } from '../core/outline.js';

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
 * @param {{label?:string, context?:number|null, actionHtml?:string}} opts
 *   context を null にすると全行表示
 */
export function renderTextDiff(oldText, newText, opts = {}) {
  const { label = '', context = 3, actionHtml = '' } = opts;
  const { lines, stats } = diffLines(oldText, newText);
  const shown = context === null ? lines : collapseContext(lines, context);

  const head = `<div class="diff__head">
      <span style="flex:1 1 auto;min-width:0">${escapeHtml(label)}</span>
      <span class="diff__stat">
        <span class="add">+${stats.added}</span><span class="del">-${stats.removed}</span>
      </span>
      ${actionHtml}
    </div>`;

  if (!stats.added && !stats.removed) {
    return `<div class="diff">${head}<div class="diff__body">
      <div class="diff__line diff__line--skip">本文に変更はありません</div></div></div>`;
  }
  return `<div class="diff">${head}<div class="diff__body">${shown.map(renderLine).join('')}</div></div>`;
}

/** 見出しやレベルなど、本文以外の変化を 1 行で説明する */
function metaNotes(entry) {
  const notes = [];
  if (entry.status === 'modified') {
    if (entry.old.title !== entry.next.title) {
      notes.push(`見出し: ${entry.old.title || '(なし)'} → ${entry.next.title || '(なし)'}`);
    }
    if (entry.levelChanged) {
      notes.push(`階層: ${levelLabel(levelOf(entry.old))} → ${levelLabel(levelOf(entry.next))}`);
    }
    if (entry.moved) notes.push('並び順が変わりました');
    if (entry.old.kind !== entry.next.kind) notes.push('役割を変更');
    if (entry.old.enabled !== entry.next.enabled) {
      notes.push(entry.next.enabled === false ? '出力から外した' : '出力に戻した');
    }
  }
  return notes.length
    ? `<div class="diff-secname">${notes.map(escapeHtml).join('　/　')}</div>`
    : '';
}

/** 「このセクションだけ比較元に戻す」ボタン（比較先が作業コピーのときだけ） */
const restoreHtml = (entry, enabled) => (enabled
  ? `<button type="button" class="btn btn--text btn--sm" data-restore-sec="${escapeHtml((entry.old ?? entry.next).id)}"
       title="このセクションだけ比較元の状態に戻す">${icon('restore', 'icon icon-sm')} 戻す</button>`
  : '');

/**
 * セクション単位の差分ビュー。
 * @param {object[]} oldSections 比較元
 * @param {object[]} newSections 比較先
 * @param {{showUnchanged?:boolean, context?:number|null, restorable?:boolean}} opts
 *   restorable: 比較元の内容を取り込むボタンを各ブロックに出す
 */
export function renderSectionsDiff(oldSections, newSections, opts = {}) {
  const { showUnchanged = false, context = 3, restorable = false } = opts;
  const entries = diffSections(oldSections, newSections);
  const visible = entries.filter((e) => showUnchanged || e.status !== 'same');
  const meta = opts.meta ?? [];

  const metaBlock = meta.length ? `
    <div class="diff">
      <div class="diff__head">本文以外の変更</div>
      <div class="diff__body">
        ${meta.map((m) => `<div class="diff__line diff__line--ctx" style="padding:4px 12px">
          <span class="diff__text"><b>${escapeHtml(m.label)}</b>　${escapeHtml(m.before || '(なし)')} → ${escapeHtml(m.after || '(なし)')}</span>
        </div>`).join('')}
      </div>
    </div>` : '';

  if (!visible.length) {
    return metaBlock + (meta.length ? '' : `<div class="diff"><div class="diff__body">
      <div class="diff__line diff__line--skip">2 つの版に違いはありません</div></div></div>`);
  }

  return metaBlock + visible.map((e) => {
    const oldBody = e.old?.body ?? '';
    const newBody = e.next?.body ?? '';
    const badge = e.status === 'added' ? '＋ 追加' : e.status === 'removed' ? '− 削除' : '';
    const depth = levelOf(e.old ?? e.next);
    const prefix = depth > 1 ? `${'　'.repeat(depth - 1)}└ ` : '';
    const label = `${prefix}${e.title}${badge ? `　${badge}` : ''}`;

    // 中身は同じで並び順だけ変わったときは、本文差分を出しても意味がない
    if (e.status === 'modified' && e.moved && e.old.body === e.next.body && e.old.title === e.next.title) {
      return metaNotes(e) + `<div class="diff"><div class="diff__head">${escapeHtml(label)}
        <span class="spacer"></span><span class="small">本文の変更なし</span>${restoreHtml(e, restorable)}</div></div>`;
    }

    if (e.status === 'same') {
      return `<div class="diff"><div class="diff__head">${escapeHtml(label)}
        <span class="spacer"></span><span class="small">変更なし</span></div></div>`;
    }

    return metaNotes(e) + renderTextDiff(oldBody, newBody, { label, context, actionHtml: restoreHtml(e, restorable) });
  }).join('');
}
