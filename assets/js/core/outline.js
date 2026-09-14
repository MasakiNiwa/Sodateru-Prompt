/**
 * セクションの階層（見出しレベル）を扱う。
 *
 * セクションは見出しのように重ねられる。フラットな配列に level(1-4) を持たせ、
 * 「直前のセクションより 1 段までしか深くできない」という制約だけを守らせることで、
 * 並び替えや差分の扱いを単純なまま保っている。
 */

export const MAX_LEVEL = 4;

export const LEVEL_LABELS = ['大見出し', '中見出し', '小見出し', '細目'];

export const clampLevel = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_LEVEL, n) : 1;
};

export const levelOf = (section) => clampLevel(section?.level);

export const levelLabel = (level) => LEVEL_LABELS[clampLevel(level) - 1];

/**
 * レベルの飛びをならす。
 * 先頭は必ず 1、以降は直前 + 1 を超えないようにする。
 * @returns {object[]} 補正が要るときだけ新しい配列
 */
export function normalizeLevels(sections) {
  let changed = false;
  let prev = 0;
  const out = sections.map((s) => {
    const wanted = levelOf(s);
    const level = Math.min(wanted, prev + 1);
    prev = level;
    if (level === s.level) return s;
    changed = true;
    return { ...s, level };
  });
  return changed ? out : sections;
}

/**
 * index のセクションとその配下（より深いレベルが続く範囲）を返す。
 * @returns {[number, number]} [開始, 終了(排他)]
 */
export function subtreeRange(sections, index) {
  const base = levelOf(sections[index]);
  let end = index + 1;
  while (end < sections.length && levelOf(sections[end]) > base) end++;
  return [index, end];
}

export const subtreeSize = (sections, index) => subtreeRange(sections, index)[1] - index;

/** 同じ親を持つ「次の兄弟」の位置。無ければ -1 */
export function nextSiblingIndex(sections, index) {
  const base = levelOf(sections[index]);
  const [, end] = subtreeRange(sections, index);
  if (end >= sections.length) return -1;
  return levelOf(sections[end]) === base ? end : -1;
}

/** 同じ親を持つ「前の兄弟」の位置。無ければ -1 */
export function prevSiblingIndex(sections, index) {
  const base = levelOf(sections[index]);
  for (let i = index - 1; i >= 0; i--) {
    const lv = levelOf(sections[i]);
    if (lv === base) return i;
    if (lv < base) return -1;
  }
  return -1;
}

/** index のサブツリーを toIndex の位置へ動かす（配下ごと移動する） */
export function moveSubtree(sections, index, toIndex) {
  const [start, end] = subtreeRange(sections, index);
  if (toIndex >= start && toIndex < end) return sections;
  const block = sections.slice(start, end);
  const rest = [...sections.slice(0, start), ...sections.slice(end)];
  const insertAt = toIndex > start ? toIndex - block.length : toIndex;
  const clamped = Math.max(0, Math.min(rest.length, insertAt));
  return normalizeLevels([...rest.slice(0, clamped), ...block, ...rest.slice(clamped)]);
}

/** 前の兄弟と入れ替える（配下ごと） */
export function moveUp(sections, index) {
  const prev = prevSiblingIndex(sections, index);
  if (prev < 0) return sections;
  return moveSubtree(sections, index, prev);
}

/** 次の兄弟の後ろへ動かす（配下ごと） */
export function moveDown(sections, index) {
  const next = nextSiblingIndex(sections, index);
  if (next < 0) return sections;
  const [, nextEnd] = subtreeRange(sections, next);
  return moveSubtree(sections, index, nextEnd);
}

/**
 * サブツリーごと 1 段深く／浅くする。
 * 深くできるのは「直前のセクションと同じ深さまで」（＝その子になれるときだけ）。
 */
export function shiftLevel(sections, index, delta) {
  const [start, end] = subtreeRange(sections, index);
  const base = levelOf(sections[start]);
  const target = base + delta;

  if (delta > 0) {
    const prevLevel = start > 0 ? levelOf(sections[start - 1]) : 0;
    if (target > prevLevel + 1 || target > MAX_LEVEL) return sections;
  } else if (target < 1) {
    return sections;
  }

  const out = sections.slice();
  for (let i = start; i < end; i++) {
    out[i] = { ...out[i], level: clampLevel(levelOf(out[i]) + delta) };
  }
  return normalizeLevels(out);
}

export const canIndent = (sections, index) => shiftLevel(sections, index, 1) !== sections;
export const canOutdent = (sections, index) => levelOf(sections[index]) > 1;

/**
 * フラットな配列を入れ子の木にする（出力用）。
 * @returns {Array<{section:object, children:Array}>}
 */
export function buildTree(sections) {
  const root = { children: [] };
  const stack = [{ node: root, level: 0 }];
  for (const section of sections) {
    const level = levelOf(section);
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    const node = { section, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, level });
  }
  return root.children;
}

/** 見出しの前に置く行頭記号（プレーンテキスト出力用） */
export const LEVEL_MARKERS = ['■', '▸', '・', '-'];
export const levelMarker = (level) => LEVEL_MARKERS[clampLevel(level) - 1];
