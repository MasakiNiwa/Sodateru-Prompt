/**
 * 新規プロンプトのひな形。
 *
 * ここに 1 件足すだけで作成ダイアログの選択肢が増える。
 * セクションは level（見出しの深さ）を持てる。
 */

export const TEMPLATES = [
  {
    id: 'blank',
    name: '空から書く',
    description: 'セクションを 1 つだけ置いた状態ではじめます。',
    sections: [
      { title: '', kind: 'instruction', level: 1, body: '' },
    ],
  },
  {
    id: 'basic',
    name: '基本形',
    description: '役割・前提・指示・制約・出力形式の 5 点セット。',
    sections: [
      { title: '役割', kind: 'role', level: 1, body: 'あなたは{{専門分野}}の専門家です。' },
      { title: '前提', kind: 'context', level: 1, body: '' },
      { title: '指示', kind: 'instruction', level: 1, body: '' },
      { title: '制約', kind: 'constraint', level: 1, body: '- \n- ' },
      { title: '出力形式', kind: 'output', level: 1, body: '' },
    ],
  },
  {
    id: 'outline',
    name: '見出しを重ねる',
    description: '大見出しの下に小見出しをぶら下げた、階層のある構成。',
    sections: [
      { title: '前提', kind: 'context', level: 1, body: '' },
      { title: '対象読者', kind: 'context', level: 2, body: '' },
      { title: '背景', kind: 'context', level: 2, body: '' },
      { title: '指示', kind: 'instruction', level: 1, body: '' },
      { title: '手順', kind: 'instruction', level: 2, body: '1. \n2. \n3. ' },
      { title: '注意点', kind: 'constraint', level: 2, body: '' },
      { title: '出力形式', kind: 'output', level: 1, body: '' },
    ],
  },
  {
    id: 'analysis',
    name: '分析タスク',
    description: '入力データを分析させるとき向け。',
    sections: [
      { title: '役割', kind: 'role', level: 1, body: 'あなたは経験豊富なアナリストです。' },
      { title: '入力', kind: 'context', level: 1, body: '{{入力データ}}' },
      { title: '分析の観点', kind: 'instruction', level: 1, body: '- \n- \n- ' },
      { title: '制約', kind: 'constraint', level: 1, body: '- 推測と事実を区別して書く\n- 根拠を必ず添える' },
      { title: '出力形式', kind: 'output', level: 1, body: '' },
    ],
  },
  {
    id: 'rewrite',
    name: '文章の推敲',
    description: '既存の文章を直させるとき向け。',
    sections: [
      { title: '役割', kind: 'role', level: 1, body: 'あなたは丁寧な編集者です。' },
      { title: '対象の文章', kind: 'context', level: 1, body: '{{原文}}' },
      { title: '指示', kind: 'instruction', level: 1, body: '上の文章を推敲してください。' },
      { title: '直す観点', kind: 'instruction', level: 2, body: '- 冗長な表現\n- 用語の揺れ\n- 論理の飛躍' },
      { title: '制約', kind: 'constraint', level: 1, body: '- 原文の意図を変えない\n- 変更した箇所と理由を併記する' },
    ],
  },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
