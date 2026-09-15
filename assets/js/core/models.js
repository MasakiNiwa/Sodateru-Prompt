/** エンティティの定義・生成・正規化 */

import { uid, now, clone } from './util.js';
import { clampLevel, normalizeLevels } from './outline.js';

/** セクションの役割。出力形式ごとの見出し／タグ名にも使われる */
export const SECTION_KINDS = [
  { id: 'text', label: '本文', tag: 'text' },
  { id: 'role', label: '役割', tag: 'role' },
  { id: 'context', label: '前提', tag: 'context' },
  { id: 'instruction', label: '指示', tag: 'instruction' },
  { id: 'constraint', label: '制約', tag: 'constraints' },
  { id: 'example', label: '例', tag: 'examples' },
  { id: 'output', label: '出力形式', tag: 'output_format' },
  { id: 'note', label: 'メモ', tag: 'note' },
];

export const KIND_MAP = Object.fromEntries(SECTION_KINDS.map((k) => [k.id, k]));
export const kindLabel = (id) => KIND_MAP[id]?.label ?? id;
export const kindTag = (id) => KIND_MAP[id]?.tag ?? 'section';

export const PROMPT_STATUSES = [
  { id: 'draft', label: '下書き' },
  { id: 'active', label: '運用中' },
  { id: 'archived', label: 'アーカイブ' },
];
export const statusLabel = (id) => PROMPT_STATUSES.find((s) => s.id === id)?.label ?? id;

export function createSection(patch = {}) {
  return {
    id: uid(),
    title: '',
    body: '',
    kind: 'text',
    level: 1,
    enabled: true,
    ...patch,
  };
}

export function createPrompt(patch = {}) {
  const t = now();
  return {
    id: uid(),
    folderId: null,
    title: '',
    summary: '',
    tags: [],
    sections: [createSection({ title: '指示', kind: 'instruction' })],
    variables: {},
    starred: false,
    status: 'draft',
    // revisionCount = いま残っている版の数 / lastVersion = 最後に発行した番号。
    // 版を削除しても番号は再利用しないので、この 2 つは一致しないことがある。
    revisionCount: 0,
    lastVersion: 0,
    createdAt: t,
    updatedAt: t,
    ...patch,
  };
}

export function createFolder(patch = {}) {
  const t = now();
  return {
    id: uid(),
    name: '',
    color: 'green',
    order: t,
    parentId: null,
    createdAt: t,
    updatedAt: t,
    ...patch,
  };
}

export function createSnippet(patch = {}) {
  const t = now();
  return {
    id: uid(),
    title: '',
    body: '',
    kind: 'text',
    tags: [],
    sourcePromptId: null,
    useCount: 0,
    createdAt: t,
    updatedAt: t,
    ...patch,
  };
}

/** プロンプトの現在の内容から版（スナップショット）を作る */
export function createRevision(prompt, message, version) {
  return {
    id: uid(),
    promptId: prompt.id,
    version,
    message: message ?? '',
    title: prompt.title,
    summary: prompt.summary,
    tags: clone(prompt.tags ?? []),
    sections: clone(prompt.sections ?? []),
    variables: clone(prompt.variables ?? {}),
    createdAt: now(),
  };
}

export const DEFAULT_SETTINGS = {
  theme: 'system',
  density: 'comfortable',
  defaultExportFormat: 'markdown',
  includeDisabledSections: false,
  editorFontSize: 15,
  confirmDelete: true,
  showSectionTitlesInPlain: true,
};

/** 保存済み設定を既定値とマージ（未知キーは捨てる） */
export function normalizeSettings(saved) {
  const out = { ...DEFAULT_SETTINGS };
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (saved[key] !== undefined && saved[key] !== null) out[key] = saved[key];
    }
  }
  return out;
}

/** 変数の値は「文字列 → 文字列」の辞書に揃える */
export function sanitizeVariables(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key === 'string' && key && value !== undefined && value !== null) {
      out[key] = String(value);
    }
  }
  return out;
}

/** 外部データのセクション 1 件を安全な形へ整える */
export function sanitizeSection(s) {
  return {
    id: typeof s?.id === 'string' && s.id ? s.id : uid(),
    title: String(s?.title ?? ''),
    body: String(s?.body ?? ''),
    kind: KIND_MAP[s?.kind] ? s.kind : 'text',
    level: clampLevel(s?.level),
    enabled: s?.enabled !== false,
  };
}

/** 外部データ（インポート）を安全な形へ整える */
export function sanitizePrompt(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = createPrompt();
  const sections = Array.isArray(raw.sections) && raw.sections.length
    ? normalizeLevels(raw.sections.map(sanitizeSection))
    : base.sections;
  return {
    ...base,
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    title: String(raw.title ?? ''),
    summary: String(raw.summary ?? ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    sections,
    starred: Boolean(raw.starred),
    status: PROMPT_STATUSES.some((s) => s.id === raw.status) ? raw.status : 'draft',
    revisionCount: Number.isFinite(raw.revisionCount) ? Math.max(0, raw.revisionCount) : 0,
    // v0.5 以前は lastVersion を持たない。その頃の revisionCount は採番カウンタだった
    lastVersion: Number.isFinite(raw.lastVersion)
      ? Math.max(0, raw.lastVersion)
      : (Number.isFinite(raw.revisionCount) ? Math.max(0, raw.revisionCount) : 0),
    variables: sanitizeVariables(raw.variables),
    folderId: typeof raw.folderId === 'string' ? raw.folderId : null,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : base.createdAt,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : base.updatedAt,
  };
}

export function sanitizeFolder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = createFolder();
  return {
    ...base,
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    name: String(raw.name ?? '無題のフォルダ'),
    order: Number.isFinite(raw.order) ? raw.order : base.order,
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
  };
}

export function sanitizeSnippet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = createSnippet();
  return {
    ...base,
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    title: String(raw.title ?? ''),
    body: String(raw.body ?? ''),
    kind: KIND_MAP[raw.kind] ? raw.kind : 'text',
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    useCount: Number.isFinite(raw.useCount) ? raw.useCount : 0,
    sourcePromptId: typeof raw.sourcePromptId === 'string' ? raw.sourcePromptId : null,
  };
}

export function sanitizeRevision(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.promptId !== 'string') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    promptId: raw.promptId,
    version: Number.isFinite(raw.version) ? raw.version : 1,
    message: String(raw.message ?? ''),
    title: String(raw.title ?? ''),
    summary: String(raw.summary ?? ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    sections: Array.isArray(raw.sections) ? normalizeLevels(raw.sections.map(sanitizeSection)) : [],
    variables: sanitizeVariables(raw.variables),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now(),
  };
}
