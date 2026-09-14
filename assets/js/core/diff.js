/**
 * 依存ゼロの差分エンジン。
 *
 * 行単位の LCS で追加／削除を求め、隣り合う「削除→追加」のペアについては
 * さらに語単位の LCS をかけて変更箇所をハイライトする。
 */

const MAX_LCS_CELLS = 4_000_000; // 総当たり DP の上限（超えたら分割統治へ）

/** 共通の接頭・接尾を除いてから LCS をかける */
function lcsMatrixOps(a, b) {
  const table = [];
  for (let i = 0; i <= a.length; i++) table.push(new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { ops.push(['=', a[i]]); i++; j++; } else if (table[i + 1][j] >= table[i][j + 1]) { ops.push(['-', a[i]]); i++; } else { ops.push(['+', b[j]]); j++; }
  }
  while (i < a.length) { ops.push(['-', a[i]]); i++; }
  while (j < b.length) { ops.push(['+', b[j]]); j++; }
  return ops;
}

/**
 * 2 つの配列の差分を求める。
 * @returns {Array<['='|'-'|'+', any]>}
 */
export function diffArrays(a, b) {
  const ops = [];

  let start = 0;
  const maxStart = Math.min(a.length, b.length);
  while (start < maxStart && a[start] === b[start]) start++;

  let end = 0;
  while (end < Math.min(a.length, b.length) - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;

  const midA = a.slice(start, a.length - end);
  const midB = b.slice(start, b.length - end);

  for (let i = 0; i < start; i++) ops.push(['=', a[i]]);

  if (midA.length === 0) {
    for (const x of midB) ops.push(['+', x]);
  } else if (midB.length === 0) {
    for (const x of midA) ops.push(['-', x]);
  } else if ((midA.length + 1) * (midB.length + 1) <= MAX_LCS_CELLS) {
    ops.push(...lcsMatrixOps(midA, midB));
  } else {
    // 巨大すぎる場合は全置換にフォールバック（メモリ枯渇を避ける）
    for (const x of midA) ops.push(['-', x]);
    for (const x of midB) ops.push(['+', x]);
  }

  for (let i = a.length - end; i < a.length; i++) ops.push(['=', a[i]]);
  return ops;
}

const splitLines = (text) => String(text ?? '').replace(/\r\n?/g, '\n').split('\n');

/** 語・記号・空白の単位に分割（日本語は 1 文字ずつ扱って粒度を保つ） */
function splitWords(text) {
  return String(text ?? '').match(/[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_]/gu) ?? [];
}

/**
 * 行差分。結果は表示しやすい形に整形済み。
 * @returns {{lines: Array, stats: {added:number, removed:number}}}
 */
export function diffLines(oldText, newText) {
  const ops = diffArrays(splitLines(oldText), splitLines(newText));

  // 削除と追加が連続する箇所を「変更」としてまとめ、語単位のハイライトを付ける
  const lines = [];
  let oldNo = 0;
  let newNo = 0;
  let added = 0;
  let removed = 0;

  for (let i = 0; i < ops.length; i++) {
    const [op, value] = ops[i];
    if (op === '=') {
      oldNo++; newNo++;
      lines.push({ type: 'ctx', oldNo, newNo, text: value });
      continue;
    }
    if (op === '-') {
      // 連続する削除ブロックと追加ブロックを取り出す
      const dels = [];
      while (i < ops.length && ops[i][0] === '-') { dels.push(ops[i][1]); i++; }
      const adds = [];
      while (i < ops.length && ops[i][0] === '+') { adds.push(ops[i][1]); i++; }
      i--;

      for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
        const d = dels[k];
        const a = adds[k];
        if (d !== undefined && a !== undefined) {
          const parts = diffArrays(splitWords(d), splitWords(a));
          oldNo++; removed++;
          lines.push({ type: 'del', oldNo, text: d, parts: parts.filter((p) => p[0] !== '+') });
          newNo++; added++;
          lines.push({ type: 'add', newNo, text: a, parts: parts.filter((p) => p[0] !== '-') });
        } else if (d !== undefined) {
          oldNo++; removed++;
          lines.push({ type: 'del', oldNo, text: d });
        } else {
          newNo++; added++;
          lines.push({ type: 'add', newNo, text: a });
        }
      }
      continue;
    }
    // op === '+'
    newNo++; added++;
    lines.push({ type: 'add', newNo, text: value });
  }

  return { lines, stats: { added, removed } };
}

/** 前後 context 行だけを残し、離れた無変更行は畳む */
export function collapseContext(lines, context = 3) {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.type === 'ctx') return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  if (!keep.includes(true)) return [];

  const out = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) { out.push({ type: 'skip', count: skipped }); skipped = 0; }
      out.push(l);
    } else {
      skipped++;
    }
  });
  if (skipped) out.push({ type: 'skip', count: skipped });
  return out;
}

/**
 * セクション配列同士を突き合わせる。
 * 同じ section.id を持つものを対応付け、無いものは追加／削除とみなす。
 * @returns {Array<{status:'added'|'removed'|'modified'|'same'|'moved',
 *                  title:string, old?:object, next?:object}>}
 */
export function diffSections(oldSections = [], newSections = []) {
  const oldById = new Map(oldSections.map((s) => [s.id, s]));
  const newById = new Map(newSections.map((s) => [s.id, s]));
  const result = [];

  for (const s of newSections) {
    const prev = oldById.get(s.id);
    if (!prev) {
      result.push({ status: 'added', title: s.title || '(無題のセクション)', next: s });
    } else {
      const changed = prev.body !== s.body || prev.title !== s.title
        || prev.kind !== s.kind || prev.enabled !== s.enabled;
      result.push({
        status: changed ? 'modified' : 'same',
        title: s.title || prev.title || '(無題のセクション)',
        old: prev,
        next: s,
      });
    }
  }
  for (const s of oldSections) {
    if (!newById.has(s.id)) {
      result.push({ status: 'removed', title: s.title || '(無題のセクション)', old: s });
    }
  }
  return result;
}
