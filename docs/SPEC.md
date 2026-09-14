# 育てるプロンプト — 仕様書 (v0.1.0)

> プロンプトを育てるシステムノート

## 1. コンセプト

プロンプトを体系的に保管するメモ帳。プロンプトの**メモ**・**構造化**・**再利用**を実現する、
ローカルファーストなブラウザツール。

- プロンプトを**育てる**（版を重ねる）
- **差分**を残す
- **部品化**する
- あとから**再利用**する

## 2. 設計方針

### 2.1 技術選定

| 項目 | 選定 | 理由 |
| --- | --- | --- |
| 実行環境 | ブラウザのみ（静的サイト） | GitHub Pages で公開。サーバー不要 |
| ビルド | **なし**（ネイティブ ES Modules） | Pages への配置が単純。依存の陳腐化を避ける。将来 Vite 等を被せることは可能 |
| 永続化 | **IndexedDB** | 大量のテキスト／リビジョンを扱う。localStorage の 5MB 制限を回避 |
| 外部依存 | **ゼロ** | フォント・アイコン・diff ライブラリも自前。完全オフライン動作 |
| UI | 自前の Material Design 3 準拠 CSS | トークン（CSS カスタムプロパティ）ベースでテーマ切替が容易 |
| ルーティング | ハッシュルーター (`#/...`) | Pages のサブパス配信・リロードに強い |
| PWA | Service Worker + manifest | オフライン利用・ホーム画面追加 |

### 2.2 ローカルファースト

- すべてのデータは利用者のブラウザ内（IndexedDB）にのみ保存される。
- ネットワーク送信は一切行わない。
- データの可搬性は **JSON バックアップ**（エクスポート／インポート）で担保する。

### 2.3 拡張性

- DB スキーマはバージョン付き。`core/db.js` の `MIGRATIONS` に追記していく。
- バックアップ JSON も `schemaVersion` を持ち、インポート時にマイグレーションを通す。
- すべてのエンティティに `id` / `createdAt` / `updatedAt` を持たせ、
  将来の同期（CRDT／リモート同期）に備える。
- 画面は `views/*.js` の 1 ファイル = 1 画面。ルーターに登録するだけで増やせる。

## 3. データモデル

```
Folder   1 ──< Prompt   1 ──< Revision
                 │
                 └── sections[] (埋め込み・順序付き)

Snippet  (再利用候補ライブラリ / 独立)
Settings (単一レコード)
```

### 3.1 Folder（大きなまとまり／分類）

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | ULID 風の一意 ID |
| `name` | string | 表示名 |
| `color` | string | アクセント色キー（`green` 等） |
| `order` | number | 並び順 |
| `parentId` | string\|null | 将来の入れ子用（v0.1 では未使用） |
| `createdAt` / `updatedAt` | number | epoch ms |

### 3.2 Prompt（プロンプトメモ = 一つの取り組み）

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | 一意 ID |
| `folderId` | string\|null | 所属フォルダ |
| `title` | string | タイトル |
| `summary` | string | 概要・目的 |
| `tags` | string[] | タグ |
| `sections` | Section[] | 本体（構造化された作業コピー） |
| `starred` | boolean | お気に入り |
| `status` | `'draft'\|'active'\|'archived'` | 状態 |
| `revisionCount` | number | 確定済みの版数 |
| `createdAt` / `updatedAt` | number | epoch ms |

### 3.3 Section（プロンプト内のセクション）

セクション単位で独立して編集・コピー・部品化できる。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | 一意 ID |
| `title` | string | 見出し |
| `body` | string | 本文 |
| `kind` | SectionKind | 役割（下記） |
| `enabled` | boolean | 出力に含めるか |

`SectionKind`: `role` / `context` / `instruction` / `constraint` / `example` / `output` / `note` / `text`

### 3.4 Revision（版 / 時系列スタック）

「版を保存」で作られるスナップショット。ここに時系列が積み上がり、差分の元になる。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | 一意 ID |
| `promptId` | string | 親プロンプト |
| `version` | number | 1 始まりの連番 |
| `message` | string | 変更メモ（コミットメッセージ相当） |
| `sections` | Section[] | その時点のスナップショット |
| `title` / `summary` / `tags` | - | その時点のメタ情報 |
| `createdAt` | number | epoch ms |

### 3.5 Snippet（再利用候補）

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | 一意 ID |
| `title` | string | 名前 |
| `body` | string | 本文 |
| `kind` | SectionKind | 役割 |
| `tags` | string[] | タグ |
| `sourcePromptId` | string\|null | 抽出元 |
| `useCount` | number | 使用回数（よく使う部品の上位表示に使用） |
| `createdAt` / `updatedAt` | number | epoch ms |

### 3.6 Settings

`theme` (`system`/`light`/`dark`) / `density` (`comfortable`/`compact`) /
`defaultExportFormat` / `autoSnapshot` / `editorFontSize` / `confirmDelete`

## 4. 機能要件

| # | 要件 | 実装 |
| --- | --- | --- |
| F1 | 一つの取り組みごとに時系列でメモをストック | Prompt ごとの Revision タイムライン |
| F2 | 差分をとる | 任意の 2 版（作業コピー含む）の行単位 LCS 差分 + 語単位ハイライト |
| F3 | 大きなまとまりで分類 | Folder + Tag + 検索 + お気に入り |
| F4 | 目的のメモへのアクセスと再利用が簡単 | 全文検索・コマンドパレット (`Ctrl/⌘+K`)・最近使った順・ワンタップコピー |
| F5 | プロンプト内を構造化しセクションごとに更新 | Section エディタ（追加／並替／役割設定／個別コピー／有効無効） |
| F6 | 再利用要素を再利用候補リストに登録 | Snippet ライブラリ。セクションから 1 タップ登録、プロンプトへ挿入 |
| F7 | プロンプトごとにテキスト形式で出力 | Markdown / プレーンテキスト / XML タグ / JSON。コピー & ファイル保存 |
| F8 | 全データをバックアップ | 全ストアを 1 つの JSON に。インポートは「置換」「マージ」を選択可 |
| F9 | 設定ページ | テーマ・表示密度・既定出力形式・データ管理 |
| F10 | ヘルプページ | 使い方・ショートカット・バージョン情報・GitHub リポジトリへのリンク |

## 5. 画面構成

| ルート | 画面 | 内容 |
| --- | --- | --- |
| `#/` | ホーム | 最近更新・お気に入り・統計 |
| `#/prompts` | プロンプト一覧 | フォルダ／タグ／検索で絞り込み |
| `#/prompts/:id` | プロンプト詳細 | 編集 / 履歴 / 差分 / 出力 の 4 タブ |
| `#/snippets` | 部品ライブラリ | 再利用候補の一覧・編集 |
| `#/settings` | 設定 | 各種設定・バックアップ |
| `#/help` | ヘルプ | 使い方・バージョン・GitHub リンク |

## 6. UI 方針

- Material Design 3 準拠のトークン（色・角丸・エレベーション・タイポ）。
- **PC**: 左にナビゲーションレール、コンテンツは最大 1200px。
- **スマホ**: 上部アプリバー + 下部ナビゲーションバー、FAB は右下。
- タップ領域は最低 48×48px。
- ダーク／ライト対応（OS 追従 + 手動切替）。
- アイコンは SVG スプライトを HTML に内包（外部リクエストゼロ）。

## 7. ロードマップ

### v0.1.0（初期版・本リリース）
F1〜F10 の一通りを実装。

### v0.2 以降の候補
- セクションのドラッグ&ドロップ並び替え
- 版同士のマージ／特定セクションのみ過去版から復元
- テンプレート機能（新規作成時のひな形）
- 変数プレースホルダ（`{{name}}`）と値の差し込み
- Markdown プレビュー
- ファイルシステムアクセス API による自動バックアップ
- 全文検索インデックスの最適化
- 複数プロンプトの一括出力
