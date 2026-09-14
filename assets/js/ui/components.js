/** 共通 UI 部品：スナックバー・ダイアログ・メニュー */

import { escapeHtml, icon } from '../core/util.js';

/* ---------------- スナックバー ---------------- */

const snackRoot = () => document.getElementById('snackbar-root');

export function toast(message, { action, onAction, duration = 3200 } = {}) {
  const root = snackRoot();
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'snackbar';
  el.innerHTML = `<span style="flex:1 1 auto">${escapeHtml(message)}</span>${
    action ? `<button type="button">${escapeHtml(action)}</button>` : ''}`;
  if (action) {
    el.querySelector('button').addEventListener('click', () => {
      close();
      onAction?.();
    });
  }
  const close = () => {
    clearTimeout(timer);
    el.style.opacity = '0';
    el.style.transition = 'opacity 150ms';
    setTimeout(() => el.remove(), 160);
  };
  const timer = setTimeout(close, duration);
  root.appendChild(el);
  while (root.children.length > 3) root.firstElementChild.remove();
}

/* ---------------- ダイアログ ---------------- */

const dialogRoot = () => document.getElementById('dialog-root');
let openDialogs = 0;

/**
 * 汎用ダイアログ。resolve される値は onSubmit の戻り値（キャンセル時は null）。
 * @param {{title:string, body:string, submitLabel?:string, cancelLabel?:string|null,
 *          danger?:boolean, wide?:boolean, extraClass?:string,
 *          onMount?:(root:HTMLElement, api:{close:(v:any)=>void})=>void,
 *          onSubmit?:(root:HTMLElement)=>any}} opts
 */
export function dialog(opts) {
  return new Promise((resolve) => {
    const root = dialogRoot();
    const scrim = document.createElement('div');
    scrim.className = `scrim ${opts.extraClass ?? ''}`.trim();
    scrim.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(opts.title ?? '')}">
        ${opts.title ? `<div class="dialog__head"><h2>${escapeHtml(opts.title)}</h2></div>` : ''}
        <div class="dialog__body">${opts.body ?? ''}</div>
        <div class="dialog__foot">
          ${opts.cancelLabel === null ? '' : `<button type="button" class="btn btn--text" data-act="cancel">${escapeHtml(opts.cancelLabel ?? 'キャンセル')}</button>`}
          ${opts.submitLabel === null ? '' : `<button type="button" class="btn ${opts.danger ? 'btn--danger' : ''}" data-act="submit">${escapeHtml(opts.submitLabel ?? 'OK')}</button>`}
        </div>
      </div>`;

    const prevFocus = document.activeElement;
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      scrim.remove();
      openDialogs--;
      if (!openDialogs) document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus instanceof HTMLElement) prevFocus.focus?.();
      resolve(value);
    };

    const submit = () => {
      const value = opts.onSubmit ? opts.onSubmit(scrim) : true;
      if (value === undefined) return; // undefined はバリデーション失敗とみなし閉じない
      close(value);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); return; }
      if (e.key !== 'Tab') return;
      const focusables = [...scrim.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(null); });
    scrim.querySelector('[data-act="cancel"]')?.addEventListener('click', () => close(null));
    scrim.querySelector('[data-act="submit"]')?.addEventListener('click', submit);
    scrim.querySelector('.dialog').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    document.addEventListener('keydown', onKey, true);

    root.appendChild(scrim);
    openDialogs++;
    document.body.style.overflow = 'hidden';
    opts.onMount?.(scrim, { close, submit });

    const auto = scrim.querySelector('[autofocus]') ?? scrim.querySelector('[data-act="submit"]');
    setTimeout(() => auto?.focus?.(), 30);
  });
}

export function confirmDialog(title, message, { submitLabel = '実行', danger = false } = {}) {
  return dialog({
    title,
    body: `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
    submitLabel,
    danger,
  }).then(Boolean);
}

export function alertDialog(title, message) {
  return dialog({
    title,
    body: `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
    submitLabel: '閉じる',
    cancelLabel: null,
  });
}

/**
 * 1 行入力のダイアログ。キャンセル時は null。
 */
export function promptDialog(title, {
  label = '', value = '', placeholder = '', submitLabel = '保存',
  multiline = false, required = false, hint = '',
} = {}) {
  const control = multiline
    ? `<textarea class="textarea" data-f="v" placeholder="${escapeHtml(placeholder)}" autofocus>${escapeHtml(value)}</textarea>`
    : `<input class="input" data-f="v" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autofocus>`;
  return dialog({
    title,
    submitLabel,
    body: `<label class="field">
        ${label ? `<span class="field__label">${escapeHtml(label)}</span>` : ''}
        ${control}
      </label>
      ${hint ? `<p class="small muted">${escapeHtml(hint)}</p>` : ''}
      <p class="small" data-err style="color:var(--md-error);display:none"></p>`,
    onMount(root, api) {
      const input = root.querySelector('[data-f="v"]');
      if (!multiline) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); api.submit(); }
        });
      }
    },
    onSubmit(root) {
      const v = root.querySelector('[data-f="v"]').value.trim();
      if (required && !v) {
        const err = root.querySelector('[data-err]');
        err.textContent = '入力してください。';
        err.style.display = '';
        return undefined;
      }
      return v;
    },
  });
}

/* ---------------- コンテキストメニュー ---------------- */

/**
 * @param {HTMLElement} anchor 位置の基準になる要素
 * @param {Array<{label:string, icon?:string, danger?:boolean, divider?:boolean,
 *                onSelect?:()=>void}>} items
 */
export function contextMenu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map((it, i) => (it.divider
    ? '<hr>'
    : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'is-danger' : ''}">
         ${it.icon ? icon(it.icon, 'icon icon-sm') : '<span style="width:18px"></span>'}
         <span>${escapeHtml(it.label)}</span>
       </button>`)).join('');

  const close = () => {
    menu.remove();
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
  };
  const onDocClick = (e) => { if (!menu.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-i]');
    if (!btn) return;
    close();
    items[Number(btn.dataset.i)].onSelect?.();
  });

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = Math.min(rect.right - mw, window.innerWidth - mw - 8);
  let top = rect.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 4);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${top}px`;

  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    menu.querySelector('button')?.focus();
  }, 0);
  return close;
}

/* ---------------- 空状態 ---------------- */

export const emptyState = (iconName, title, desc = '', actionHtml = '') => `
  <div class="empty">
    ${icon(iconName)}
    <div><b>${escapeHtml(title)}</b></div>
    ${desc ? `<p class="small" style="max-width:38ch;margin:0">${escapeHtml(desc)}</p>` : ''}
    ${actionHtml}
  </div>`;
