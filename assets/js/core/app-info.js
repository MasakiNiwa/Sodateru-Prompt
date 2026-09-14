/** アプリのメタ情報。リリースのたびにここを更新する */

export const APP = {
  name: '育てるプロンプト',
  tagline: 'プロンプトを育てるシステムノート',
  version: '0.1.0',
  releasedAt: '2026-09-14',
  repository: 'https://github.com/MasakiNiwa/Sodateru-Prompt',
  issues: 'https://github.com/MasakiNiwa/Sodateru-Prompt/issues',
  license: 'MIT',
};

/** ヘルプの「更新履歴」に表示する。新しい版を上に足していく */
export const CHANGELOG = [
  {
    version: '0.1.0',
    date: '2026-09-14',
    notes: [
      'プロンプトの作成・セクション単位の構造化編集',
      '版（リビジョン）の保存と時系列タイムライン',
      '任意の 2 版の差分表示（行単位 + 語単位ハイライト）',
      'フォルダ・タグ・全文検索・コマンドパレットによる分類とアクセス',
      '再利用候補（部品）ライブラリと、プロンプトへの挿入',
      'Markdown / プレーンテキスト / XML タグ / 本文のみ / JSON での出力',
      '全データの JSON バックアップとインポート',
      '設定ページ・ヘルプページ、ダークモード、PWA オフライン対応',
    ],
  },
];
