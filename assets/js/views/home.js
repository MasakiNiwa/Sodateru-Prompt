/** ホーム：最近の動き・お気に入り・統計 */

import * as store from '../core/store.js';
import { renderAppBar, renderFab } from '../ui/shell.js';
import { emptyState } from '../ui/components.js';
import { escapeHtml, icon, relTime } from '../core/util.js';
import { openPalette } from '../ui/palette.js';
import { newPromptFlow } from './prompt-actions.js';
import { APP } from '../core/app-info.js';

const promptRow = (p) => `
  <a class="listitem" href="#/prompts/${escapeHtml(p.id)}">
    <span class="listitem__lead">${icon(p.starred ? 'star' : 'notes')}</span>
    <span class="listitem__body">
      <span class="listitem__title">${escapeHtml(p.title || '無題のプロンプト')}</span>
      <span class="listitem__meta">
        <span>${icon('folder', 'icon icon-sm')} ${escapeHtml(store.folderName(p.folderId))}</span>
        <span>${escapeHtml(relTime(p.updatedAt))}</span>
        ${p.revisionCount ? `<span class="badge badge--v">v${p.revisionCount}</span>` : '<span class="badge badge--draft">未確定</span>'}
      </span>
    </span>
  </a>`;

export function render(main) {
  const s = store.stats();
  const recent = store.queryPrompts({ sort: 'updated' }).slice(0, 6);
  const starred = store.state.prompts.filter((p) => p.starred).slice(0, 6);

  renderAppBar({
    title: APP.name,
    subtitle: APP.tagline,
    actions: [{ id: 'search', icon: 'search', label: '検索' }],
  }, (id) => { if (id === 'search') openPalette(); });

  renderFab({ label: '新規プロンプト', onClick: () => newPromptFlow() });

  main.innerHTML = `
    <section class="section-block">
      <div class="statgrid">
        <div class="stat"><div class="stat__n">${s.prompts}</div><div class="stat__l">プロンプト</div></div>
        <div class="stat"><div class="stat__n">${s.versions}</div><div class="stat__l">保存された版</div></div>
        <div class="stat"><div class="stat__n">${s.sections}</div><div class="stat__l">セクション</div></div>
        <div class="stat"><div class="stat__n">${s.snippets}</div><div class="stat__l">再利用部品</div></div>
      </div>
    </section>

    ${starred.length ? `
      <section class="section-block">
        <h2>${icon('star')} お気に入り</h2>
        <div class="list">${starred.map(promptRow).join('')}</div>
      </section>` : ''}

    <section class="section-block">
      <h2>${icon('history')} 最近更新したプロンプト</h2>
      ${recent.length
    ? `<div class="list">${recent.map(promptRow).join('')}</div>
         <div class="row row--end" style="margin-top:12px">
           <a class="btn btn--text" href="#/prompts">すべて見る</a>
         </div>`
    : emptyState('sprout', 'まだプロンプトがありません',
      'ひとつの取り組みごとにプロンプトを作り、版を重ねて育てていきます。',
      '<button type="button" class="btn" data-new>最初のプロンプトを作る</button>')}
    </section>

    <section class="section-block">
      <h2>${icon('sprout')} 育てかた</h2>
      <div class="grid-cards">
        <div class="card">
          <h3>1. 構造化して書く</h3>
          <p class="small muted" style="margin:8px 0 0">役割・前提・指示・制約…とセクションに分けて書くと、
          あとから一部分だけを差し替えられます。</p>
        </div>
        <div class="card">
          <h3>2. 版を保存する</h3>
          <p class="small muted" style="margin:8px 0 0">試した区切りで「版を保存」。
          何をどう変えたかがタイムラインに残り、差分で比べられます。</p>
        </div>
        <div class="card">
          <h3>3. 部品にして再利用</h3>
          <p class="small muted" style="margin:8px 0 0">よく効いたセクションは部品として登録。
          別のプロンプトへワンタップで挿入できます。</p>
        </div>
      </div>
    </section>`;

  main.querySelector('[data-new]')?.addEventListener('click', () => newPromptFlow());
}
