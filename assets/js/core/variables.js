/**
 * 変数プレースホルダ `{{変数名}}`。
 *
 * 使い回すプロンプトの「毎回変わるところ」だけを穴にしておき、
 * 出力のときに値を差し込む。値はプロンプトごとに覚えておく。
 */

// {{ ～ }}。改行と波括弧は含められない
const PLACEHOLDER = /\{\{\s*([^{}\n]+?)\s*\}\}/g;

/** テキストから変数名を出現順に取り出す */
export function extractFromText(text) {
  const names = [];
  for (const m of String(text ?? '').matchAll(PLACEHOLDER)) {
    const name = m[1].trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** セクション群（タイトルと本文）から変数名を出現順に取り出す */
export function extractVariables(sections = []) {
  const names = [];
  for (const s of sections) {
    for (const name of extractFromText(`${s.title ?? ''}\n${s.body ?? ''}`)) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/**
 * 値を差し込む。
 * @param {string} text
 * @param {Record<string,string>} values
 * @param {{keepEmpty?:boolean}} opts keepEmpty: 値が空のものは穴のまま残す（既定）
 */
export function applyVariables(text, values = {}, { keepEmpty = true } = {}) {
  return String(text ?? '').replace(PLACEHOLDER, (whole, rawName) => {
    const name = rawName.trim();
    const value = values[name];
    if (value === undefined || value === null || value === '') return keepEmpty ? whole : '';
    return String(value);
  });
}

/** セクション配列に値を差し込んだ新しい配列を返す */
export function applyToSections(sections = [], values = {}, opts = {}) {
  if (!Object.keys(values).length) return sections;
  return sections.map((s) => ({
    ...s,
    title: applyVariables(s.title, values, opts),
    body: applyVariables(s.body, values, opts),
  }));
}

/** 保存されている値のうち、今も使われている変数のぶんだけ残す */
export function pruneValues(values = {}, names = []) {
  const out = {};
  for (const name of names) {
    if (values[name] !== undefined) out[name] = values[name];
  }
  return out;
}

export const hasVariables = (sections) => extractVariables(sections).length > 0;
