# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**ヤフオク自動出品ツール** - CSVファイルから商品情報を読み込み、ヤフオクへの出品を自動化するChrome拡張機能。

**技術スタック:**
- Chrome Extension (Manifest V3)
- Vanilla JavaScript
- Chrome Storage API
- Content Scripts
- Background Service Worker

**主要機能:**
- CSV形式の商品データ一括読み込み
- 画像の自動アップロード（最大5枚）
- 自動再出品設定
- エラー時のリトライ機能
- ChatWork通知連携

## コマンド

このプロジェクトにはビルドやテストコマンドはありません。拡張機能として直接Chromeにロードします。

**インストール:**
1. Chromeで `chrome://extensions/` を開く
2. デベロッパーモードをON
3. 「パッケージ化されていない拡張機能を読み込む」でプロジェクトフォルダを選択

**リロード:**
- コード変更後は `chrome://extensions/` で「再読み込み」ボタンをクリック
- Background Scriptの変更は拡張機能の再読み込みが必須
- Content Scriptの変更はヤフオクページのリロードが必要

**デバッグ:**
- **Popup UI**: 拡張機能アイコンを右クリック → 「検証」
- **Background Script**: `chrome://extensions/` → 拡張機能の「詳細」→「バックグラウンドページを検証」
- **Content Script**: ヤフオクページでF12を押してConsoleタブを確認

## アーキテクチャ

### 三層構造

```
Popup UI (popup/) ←→ Background Service Worker (background/) ←→ Content Script (content/)
     ↓                           ↓                                    ↓
  ユーザー操作              状態管理・制御フロー                ページ操作の実行
```

### 通信フロー

1. **出品開始**: `popup.js` → `chrome.runtime.sendMessage({action: 'startListing'})` → `background.js`
2. **ページ操作**: `background.js` → `chrome.tabs.sendMessage({action: 'postItem'})` → `content.js`
3. **完了通知**: `content.js` → `chrome.runtime.sendMessage({action: 'itemPosted'})` → `background.js`
4. **進捗更新**: `background.js` → `chrome.runtime.sendMessage({type: 'progress'})` → `popup.js`

### 状態管理

**グローバル状態 (`background.js:listingState`):**
- `isRunning`: 出品処理の実行状態
- `items`: CSV解析後の商品データ配列
- `images`: 画像ファイル名をキーとしたData URL辞書
- `settings`: リトライ回数・ChatWork設定
- `currentIndex`: 現在処理中の商品インデックス
- `retryCount`: 現在の商品のリトライ回数

**重要:** すべての状態は `background.js` で一元管理。`popup.js` は表示専用。

### ファイル役割

- **`manifest.json`**: 拡張機能の設定（権限、Content Script注入ルール）
- **`popup/popup.js`**: CSV/画像選択、設定UI、出品開始/停止操作
- **`background/background.js`**: 出品フロー制御、タブ管理、リトライロジック、ChatWork送信
- **`content/content.js`**: ヤフオクページのフォーム自動入力（DOM操作）
- **`lib/utils.js`**: 共通ユーティリティ（`sleep`, `waitForElement`, `typeText`, `convertDate`）
- **`lib/csvParser.js`**: CSV解析ライブラリ（引用符・エスケープ処理対応）

## 重要な実装パターン

### 1. Content Script注入タイミング

`manifest.json` で `"run_at": "document_idle"` を使用。ページの基本的なDOM構築後に実行されるため、`waitForElement()` で動的要素の出現を待つ必要がある。

### 2. 人間らしい操作シミュレーション

- **遅延**: `randomDelay(min, max)` でランダムな待機時間を挿入（`content.js:38-72`）
- **タイピング**: `typeText()` で1文字ずつ入力して `input` イベントを発火（`content.js:299-305`）
- **目的**: ヤフオクの自動化検知回避

### 3. XPathセレクタの使用

動的に変化するHTML構造に対応するため、一部要素は XPath で取得:
```javascript
await waitForElement(
  "//dt[contains(@class, 'js-toggleExpand-trigger')][contains(text(), '即決価格を設定する')]",
  10000,
  true,
  true  // useXPath = true
);
```

### 4. 画像アップロードの実装

- `popup.js`: `FileReader` でファイルを Data URL に変換（`popup.js:206-213`）
- `content.js`: Data URL を `File` オブジェクトに再変換（`content.js:128-132`）
- `DataTransfer` API で複数ファイルを `<input type="file">` にセット（`content.js:118-124`）

**理由:** Chrome拡張のコンテキスト間（popup ↔ content）でファイルオブジェクトを直接渡せないため

### 5. リトライメカニズム

`background.js:109-168` で実装:
- 出品失敗時、`retryCount` が上限未満ならページをリロードして再試行
- 上限到達時は ChatWork 通知 + エラーログ
- 成功時は `retryCount` をリセット

## Gemini CLI 連携

### トリガー
ユーザーが「Geminiと相談しながら進めて」（または類似表現）とリクエストした場合、Claude は Gemini CLI と協業します。

### 協業時の Claude の役割
- **批判的評価者**: Gemini の提案を鵜呑みにせず、必ず検証・評価する
- **統合責任者**: 複数の視点を統合し、最終判断を行う
- **品質管理者**: 実装の実現可能性、保守性、パフォーマンスを評価

### 協業ワークフロー
1. **PROMPT 準備**: 最新の要件と議論要約を `$PROMPT` に格納
2. **Gemini 呼び出し**:
   ```bash
   gemini <<EOF
   $PROMPT

   重要：以下の観点で複数の選択肢を提示してください：
   - 長所と短所を明確に
   - トレードオフを具体的に
   - 実装難易度の評価
   EOF
   ```
3. **出力形式**:
   ```md
   **Gemini ➜**
   <Gemini からの応答>

   **Claude ➜**
   <評価フレームワークに基づく分析>
   ```

### 📊 Claude の評価フレームワーク
**Claude ➜** セクションは必ず以下の構造に従う：

```
## Gemini提案の評価
✅ **採用可能な要素**: [具体的な良い点]
⚠️ **技術的懸念**: [実装上の問題点やリスク]
🔄 **Claude の代替案**: [独自の第3の選択肢]

## 最終判断
- **採用方針**: [Gemini案/Claude案/折衷案]
- **根拠**: [なぜその判断に至ったか]
- **実装計画**: [具体的な次のステップ]
```

### ⚡ 鵜呑み防止ルール
1. **Gemini の提案をそのまま採用することは禁止**
2. **必ず技術的検証を行う**
3. **独自案の検討を義務化**

## Codex 連携ガイド

### 目的
Codex から **Claude Code** が呼び出された際に、
Claude Code は Codex との対話コンテキストを保ちながら、複数ターンに渡り協働する。

### Codex の使い方
- ターミナルで以下を実行すると Codex と対話できる。
```bash
codex <<EOF
<質問・依頼内容>
EOF
```

### 協業時の Claude Code の役割
- **批判的評価者**: Codex の提案を鵜呑みにせず、必ず検証・評価する
- **技術検証者**: 実装の実現可能性、コードの品質、パフォーマンスを評価
- **統合責任者**: 複数の視点を統合し、実用的な最終案を提示

### 📊 Claude Code の評価フレームワーク
Codex から提案を受けた際は、必ず以下の構造で評価：

```
## Codex提案の評価
✅ **採用可能な要素**: [具体的な良い点]
⚠️ **技術的懸念**: [実装上の問題点やリスク]
🔄 **Claude Code の代替案**: [独自の第3の選択肢]

## 最終判断
- **採用方針**: [Codex案/Claude Code案/折衷案]
- **根拠**: [なぜその判断に至ったか]
- **実装計画**: [具体的な次のステップ]
```

### ⚡ 鵜呑み防止ルール
1. **Codex の提案をそのまま採用することは禁止**
2. **必ず技術的検証を行う**
3. **独自案の検討を義務化**
4. **実装前に必ずトレードオフを明確化**

## コーディング規約

### セレクタの優先順位
1. **ID** (`#elementId`) - 最も安定
2. **name属性** (`[name="fieldName"]`) - フォーム要素
3. **XPath** - テキスト内容を含む動的要素
4. **class** - 最終手段（頻繁に変更される可能性）

### エラーハンドリング
- すべての非同期処理に `try-catch` を使用
- `waitForElement()` でタイムアウト時間を明示的に指定
- エラーメッセージは日本語で具体的に（例: `'カテゴリ入力欄が見つかりません'`）

### 命名規則
- **関数**: 動詞で始めるキャメルケース（`handleStartListing`, `uploadImages`）
- **定数**: 大文字スネークケース（未使用だが、追加時は `MAX_RETRY_COUNT`）
- **DOM要素**: 具体的な名前（`csvFileInput`, `startButton`）

## 重要な注意事項

### セキュリティ
- ChatWork API Keyは `chrome.storage.local` に保存（平文）
- ヤフオクのセッションCookieを利用するため、ログイン情報は拡張機能で管理しない

### 制限事項
- **Manifest V3**: Service Workerは非永続的。長時間実行は `chrome.alarms` APIの検討が必要
- **タブ依存**: 出品中にヤフオクタブを閉じると処理が中断される
- **DOM依存**: ヤフオクのHTML構造変更でセレクタが無効化される可能性

### 後方互換性
- CSVフォーマットの変更は既存ユーザーに影響するため慎重に
- 設定項目の追加時は `loadSettings()` でデフォルト値を設定

## トラブルシューティング

### よくある問題

**画像がアップロードされない:**
- `content.js:99-125` の `uploadImages()` で Data URL → File 変換が失敗
- 原因: 画像形式が未対応 or ファイルサイズ超過
- 対処: `dataUrlToFile()` のエラーハンドリング強化

**「要素が見つかりません」エラー:**
- ヤフオクのDOM構造が変更された可能性
- 対処: Chrome DevTools でセレクタを再確認し、`content.js` を更新

**リトライが機能しない:**
- `background.js:109-168` のリトライロジックを確認
- ページリロード後の `waitForTabLoad()` のタイミング調整が必要な場合あり
