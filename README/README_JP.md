<p align="center">
  <img src="../public/logo-tile.svg" alt="PiCG logo" width="96">
</p>

# PiCG

<p align="right">
    <a href="../README.md">English</a> | <a href="./README_CN.md">中文</a> | <strong>日本語</strong>
</p>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)<br>
[![CI](https://github.com/lutianyu2001/PiCG/actions/workflows/ci.yml/badge.svg)](https://github.com/lutianyu2001/PiCG/actions/workflows/ci.yml)

ブラウザで動く軽量な画像ホスティング（画像置き場）ツールです。画像を自分の GitHub リポジトリまたは Cloudflare R2 バケットにアップロードし、そのリンクを発行します。

## 目次

- [概要](#概要)
- [特徴](#特徴)
- [前提条件](#前提条件)
- [インストール](#インストール)
- [使い方](#使い方)
- [Cloudflare R2](#cloudflare-r2)
- [GitHub Pages](#github-pages)
- [設定ファイル](#設定ファイル)
- [デプロイ](#デプロイ)
- [テスト](#テスト)
- [互換性](#互換性)
- [免責事項](#免責事項)
- [ライセンス](#ライセンス)
- [作者](#作者)

## 概要

PiCG はサーバーを持たない静的サイトです。ブラウザから GitHub REST API（Fine-grained personal access token を使用）、または Cloudflare R2 の S3 互換 API（R2 API トークンを使用）を直接呼び出し、画像を公開リポジトリまたはバケットにファイルとして保存して、GitHub、GitHub Pages、CDN、バケットの公開アドレス向けのリンクを作ります。画像はアップロード前にブラウザ内で圧縮し、透かしを入れられます。

PiCG は当初、v3.1.0 で刷新される前の最後のバージョンである [PicX v3.0.2 リリース](https://github.com/XPoet/picx/releases/tag/v3.0.2)（commit [d2c5db7](https://github.com/XPoet/picx/commit/d2c5db77901856656a545905208647c95dfff910)、2024-04-30）をフォークして手を加える予定でしたが、変更が増えるにつれ、一から書き直したほうがよいと判断しました。現在の PiCG は PicX とコード上の関係は一切ありません。コード以外の唯一の関係は、PicX の設定ファイルとの互換性を保っていることです。PicX、および PicX をもとにした以前の PiCG が保存した設定を読み込み、PiCG 自身の形式に変換します。

## 特徴

- 画像の保存先は GitHub リポジトリまたは Cloudflare R2 バケット。1 回のサインインではどちらか一方を使います
- この端末でサインインしたアカウントを記憶してサインインページに並べ、ワンクリックで再びサインインできます
- リポジトリまたはバケットごとのライブラリページ：編集できるパスでフォルダを閲覧し（階層をクリックして戻ったり、候補を見ながらパスを直接入力したりできます）、画像をドロップ、貼り付け、または選択すると、今いるフォルダにアップロードされます。フォルダの上にドロップするとそこへ、フォルダごとドロップするとその構成のままアップロードされます
- アップロードキュー：画像の送り先を表示し、名前を変更でき、まとめてアップロードします（GitHub では 1 つの commit）。追加した直後にアップロードする設定もあります
- アップロード先のサブフォルダ：なし、時刻による名前（date-fns の書式を設定可能。例：`yyyy/MM`）、または任意の名前
- ファイル名へのコンテンツハッシュとプレフィックスの付加
- GitHub リポジトリの 1 つのフォルダに置けるファイルは 1000 個まで。上限を超えるアップロードは失敗し、失敗した理由を表示します
- WebP、AVIF、JPEG（MozJPEG）への圧縮と文字の透かし。jSquash を使い Web Worker で処理します
- HEIC と HEIF の写真はアップロード時に変換します。ブラウザがデコードできない場合は libheif（LGPL-3.0）を読み込みます。libheif は `heif/` に別ファイルとして置いています（[NOTICE](../NOTICE) を参照）
- アップロード前に撮影場所などの写真のメタデータを削除します。向きとカラープロファイルは残します
- 再エンコードなしの名前変更、削除、プロパティ表示、複数選択（チェックボックス、Shift クリック、長押し）、一括コピーと一括削除
- リンクルール：GitHub、GitHub Pages、jsDelivr、Statically、jsDelivr ミラー、および独自のルール。リンクのみ、Markdown、HTML、BBCode、独自の形式でコピーできます
- GitHub Pages が画像のブランチをそのまま公開するため、デプロイは不要です。PiCG は Pages が有効かどうかを表示し、カスタムドメインを設定できます
- 複数のリポジトリまたはバケットに対応。設定はそれぞれ `.picg/settings.toml` に保存され、変更の数秒後に自動で書き戻されます
- 他の GitHub リポジトリからのインポート：まだない画像をパスを保ったままコピーします
- ツールボックス：圧縮、Base64 変換、透かし。ログインは不要です
- 簡体字中国語、繁体字中国語、英語、日本語の UI。トップバーに言語ボタンがあります
- ライトテーマとダークテーマ。トップバーの太陽・月のボタンで切り替えます。**設定**でシステムに合わせることもできます
- Material 3 のアニメーション：ページの切り替えでは内容がフェードし、フォルダーと画像は順に現れます。既定ではシステムの「動きを減らす」設定に従い、**設定**でオン・オフも選べます
- オープンソースのフォントを jsDelivr から読み込み、タイムアウトしたら npmmirror に切り替えます：Inter と Noto Sans（UI の言語に合った CJK フォントを優先）、タイトルの欧文には Josefin Sans を使います
- PWA としてインストール可能。スマートフォンでは下部ナビゲーションバーを使います。ページを開いたままでも新しいバージョンを通知します

## 前提条件

- GitHub アカウント、または R2 を使える Cloudflare アカウント
- ソースからビルドする場合：
  - pnpm 12.16.1（`package.json` の `packageManager` で固定）
  - Node.js 24.22.2（`package.json` の `devEngines.runtime` で固定）。pnpm がプロジェクト用にダウンロードするため、`pnpm` スクリプトはグローバルの Node.js を使いません

## インストール

### ホストされたサイトを使う（推奨）

[https://picg.lu.fm](https://picg.lu.fm) を開いてください。アプリとしてインストールするには、ブラウザのアドレスバーまたはメニューのインストールボタンを使います。

### ソースからのビルド

1. リポジトリをクローンし、依存関係をインストールします：

   ```bash
   git clone https://github.com/lutianyu2001/PiCG.git
   cd PiCG
   pnpm install
   ```

2. 開発サーバーを起動するか、サイトをビルドします：

   ```bash
   pnpm dev
   pnpm build
   ```

| コマンド | 説明 |
|---------|-------------|
| `pnpm dev` | エンコーダーのバイナリをコピーし、ポート 4000 でアプリを起動して開きます |
| `pnpm build` | サイトを `dist/picg/browser/` にビルドします |
| `pnpm serve` | 本番ビルドをポート 4173 で配信します |
| `pnpm wasm` | jSquash のエンコーダーのバイナリとそのライセンスを `node_modules/@jsquash` から `public/wasm/` にコピーします。`dev` と `build` が最初に実行します |
| `pnpm test` | 単体テストを実行します |
| `pnpm e2e` | ヘッドレス Chromium で、モックの GitHub API と R2 API に対してエンドツーエンドテストを実行します（先にビルドが必要） |
| `pnpm e2e:real` | 実際の GitHub API に対してスモークテストを実行します（[テスト](#テスト) を参照） |
| `pnpm typecheck` | コードとテンプレートの型をチェックします |
| `pnpm lint` | ESLint でチェックします |

アプリの動作は [`docs/spec.md`](../docs/spec.md) に記載しています。

## 使い方

サインインページには **GitHub** と **Cloudflare R2** の 2 つのタブがあります。サインインしたことのあるアカウントが最初に並び、クリックすると再びサインインできます。**別のアカウントを使う** も選べます。サインアウト時には、このアカウントを端末に残すかどうかを尋ねます。残さない場合は、そのトークンまたはキーとキャッシュした設定を削除します。

### GitHub

1. [公開リポジトリを作成します](https://github.com/new?name=picg-images-hosting&visibility=public)。例：`picg-images-hosting`。
2. [Fine-grained personal access token を作成します](https://github.com/settings/personal-access-tokens/new?name=PiCG&expires_in=90&contents=write)：
   - Repository access：**Only select repositories** を選び、画像用のリポジトリだけを選択します。
   - Repository permissions：**Contents** を **Read and write** にします。それ以外は **No access** のままにします。
3. PiCG を開き、トークンとリポジトリ名（カンマまたはスペース区切り。空欄なら `picg-images-hosting`）を入力して **サインイン** をクリックします。PiCG は各リポジトリのデフォルトブランチを使います。別のブランチを使うには `<REPO>@<BRANCH>` と書きます。ブランチがなければ、作成するかどうかを PiCG が尋ねます。ブランチは後から **設定** でも変更できます。PiCG と GitHub Pages が同じブランチを使うよう、デフォルトブランチの名前は `gh-pages` にすることをおすすめします。既存のリポジトリのブランチは **Branches** ページで名前を変更でき、PiCG は自動で追従します。

サインイン時にトークンをチェックします。PiCG は Classic token、指定したすべてのリポジトリに書き込めないトークン、それ以外のリポジトリにも書き込めるトークンを拒否します。リポジトリが多いと他のリポジトリのチェックに時間がかかるため、**トークンのセキュリティチェックをスキップ** でその部分だけを省略できます。空のリポジトリには `README.md` が作られ、すべてのリポジトリに `.nojekyll` が追加されます。これにより GitHub Pages は Jekyll を通さずにファイルを配信します。

トークンはブラウザの `localStorage` に難読化した形で保存されます。一目で読めないようにするだけで、鍵がアプリに含まれているため暗号化ではありません。

Note：GitHub は Fine-grained token の権限一覧をすべては公開していないため、画像用リポジトリ自体に付けられた余分な権限はチェックできません。**No access** のままにしてください。

## Cloudflare R2

1. Cloudflare のダッシュボードで R2 バケットを作成します。
2. バケットの **Settings** でカスタムドメインを接続するか、公開 `r2.dev` アドレスを有効にします（Cloudflare によって制限されており、本番利用は推奨されていません）。
3. バケットの **Settings** > **CORS policy** に、サインインページに表示されるポリシー（コピーボタン付き）を追加します。これがないと、PiCG からバケットへのリクエストはすべてブラウザにブロックされます。PiCG を `https://picg.lu.fm` で使う場合：

   ```json
   [
     {
       "AllowedOrigins": ["https://picg.lu.fm"],
       "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
       "AllowedHeaders": ["authorization", "content-type", "x-amz-content-sha256", "x-amz-date", "x-amz-copy-source", "if-match", "if-none-match"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. **Object Read & Write** の権限で、画像用バケットだけに適用した R2 API トークンを作成し、**Access Key ID** と **Secret Access Key** をコピーします。
5. PiCG で **Cloudflare R2** タブを開き、バケットの設定ページの表示どおりに **S3 API** アドレス（`https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<BUCKET>`）、2 つのキー、バケットの公開アドレスを入力して **サインイン** をクリックします。

サインイン時に PiCG はバケットの一覧を取得し、`.picg/check` を書き込んでから削除して、キーで読み書きできることを確かめます。ブラウザがリクエストをブロックした場合は、CORS ポリシーを確認するよう表示します。トークンがほかのバケットにもアクセスできるかは PiCG からは確認できないため、画像用バケットに限定してください。同じアカウントのバケットは **設定** で追加でき、それぞれに公開アドレスを設定します。

リンクには公開アドレス（`{public}/{path}`）を使い、サムネイルも同じです。画像は 1 枚ずつアップロードし、使われている名前は拒否されるため、まとめてアップロードしても一部だけが失敗することがあります。名前の変更はオブジェクトをコピーしてから元のものを削除します。別のリポジトリからのインポートと GitHub Pages は GitHub 専用です。

## GitHub Pages

GitHub Pages のリンクを使うには、画像用リポジトリごとに一度 GitHub Pages を有効にします。リポジトリの **Settings** > **Pages** で **Source** を **Deploy from a branch** にし、PiCG が使うブランチと `/ (root)` フォルダを選んで **Save** をクリックします。以後、アップロードした画像は通常数分で Pages に自動的に表示されます。

Pages のアドレスは、画像のブランチにある `CNAME` ファイル、次に `<OWNER>.github.io` の `CNAME` から決まり、どちらもなければ `https://<OWNER>.github.io/<REPO>` になります。設定ページから画像用リポジトリの `CNAME` を書き込んだり削除したりできます。ドメインの DNS を GitHub Pages に向けるのはご自身で行ってください。

Note：以前の PiCG は画像のブランチを `gh-pages` ブランチにコピーしてデプロイしていましたが、PiCG はもうそのブランチを更新しません。画像用リポジトリにまだ残っている場合は、`gh-pages` を削除してからデフォルトブランチの名前を `gh-pages` に変更することをおすすめします。または、**Settings** > **Pages** をデフォルトブランチに切り替え、`gh-pages` を削除してください。それまで PiCG は通知を表示し続けます。

## 設定ファイル

各画像用リポジトリの設定は画像用ブランチの `.picg/settings.toml` に、各バケットの設定はバケット内の `.picg/settings.toml` に保存されます。PiCG は最後の変更から 3 秒後にこのファイルを書き込みます（GitHub では書き込みごとに 1 つの commit）。テーマ、言語、アニメーションは端末にのみ保存されます。

PicX（v3.0.x 以降）または以前の PiCG が保存した設定は、独立したインポートモジュールが読み込み、すぐに使います。対象は、リポジトリの画像用ブランチまたはデフォルトブランチにある `.settings` と、PiCG が同じアドレスで配信されている場合にそれらがブラウザに保存していたデータです。その後 PiCG は、新しい形式で保存して古いファイルを削除するかどうかを尋ねます。同意するまでは、インポートした設定で動作し続けますが、設定をリポジトリに書き込みません。

## デプロイ

`pnpm build` は相対パスのアセットとハッシュルーティングを使う静的サイトを生成するため、`dist/picg/browser/` はどの静的ホスティングにも、サブパスにも置けます。

`.github/workflows/deploy.yml` の workflow は、`main` への push のたびにテストを実行してサイトをビルドし、公開用のブランチを使わずにビルド結果を GitHub Pages へ直接デプロイします：

1. フォークの場合は、**Actions** タブを開いて workflow を有効にします。GitHub は新しいフォークでは無効にしています。
2. リポジトリの **Settings** > **Pages** で **Source** を **GitHub Actions** にします。
3. 独自ドメインを使う場合は、同じページの **Custom domain** に入力し、`public/CNAME` にも同じドメインを残します。使わない場合は `public/CNAME` を削除し、デフォルトの `github.io` アドレスを使います。
4. `main` に push し、`deploy` workflow の完了を待ちます。

Note：HTTPS を使ってください。クリップボードへのリンクのコピーと PWA の両方に必要です。

## テスト

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright install --only-shell chromium
pnpm e2e
```

単体テストは、設定ファイル、設定のマージ、リンクルール、ファイル名の生成、トークンの難読化、メタデータの削除、PicX と以前のバージョンからの設定とトークンのインポートを対象としています。エンドツーエンドテストは、ビルドしたサイトをヘッドレス Chromium で操作し、GitHub API と R2 API はメモリ上の代替実装（R2 の代替はすべてのリクエストの署名を検証します）で置き換えるため、トークン、キー、リポジトリ、バケットのいずれも不要です。サインインのチェック（ブロックされたリポジトリと読み取り専用のリポジトリ、誤ったキーや書き込めない R2 キー、CORS ポリシーがない場合を含む）、アップロード、名前の変更、削除、新しいサブフォルダと日付別のサブフォルダ、1000 ファイルの上限、編集できるフォルダパス、設定の同期、ブランチ、デフォルトブランチの名前変更、記憶したアカウント、PicX の設定の変換、動きを減らす設定、新しいバージョンの通知を対象としています。

スモークテストは同じ流れを実際の GitHub API に対して、テスト用リポジトリの一時ブランチ上で実行し、終了後にそのブランチを削除します：

1. テスト用リポジトリだけにアクセスできる Fine-grained token を作成し、**Contents** を **Read and write** にします。
2. リポジトリの外のファイルに保存します。例：

   ```bash
   mkdir -p ~/.config/picg && read -rsp 'Token: ' T && printf %s "$T" > ~/.config/picg/e2e-token && chmod 600 ~/.config/picg/e2e-token && echo saved
   ```

   プロンプトに token を貼り付けます（表示されません）。入力を待つコマンドなので、通常のターミナルで実行してください。

3. 実行します：

   ```bash
   PICG_E2E_TOKEN_FILE=~/.config/picg/e2e-token PICG_E2E_REPO=<OWNER>/<REPO> pnpm e2e:real
   ```

   失敗すると、テストはページの内容と失敗したリクエストを表示し、テキストのレポートを `test-results/real/` に残します。
   レポート内の token は `<token>` に置き換えられます。trace、スクリーンショット、動画はどれも token を含むため記録しません。

GitHub Actions では、`CI` workflow が push と pull request のたびに単体テストとエンドツーエンドテストを実行します。手動で起動して **real** にチェックを入れると、`PICG_E2E_TOKEN` シークレットと `PICG_E2E_REPO` 変数を使ってスモークテストも実行します。

## 互換性

テスト環境：

- ビルド：Ubuntu 24.04.4 LTS（Linux 6.8）
  - Node.js 24.22.2
  - pnpm 12.16.1
- ブラウザ：Chrome for Testing 156.0.8078.4、ヘッドレス、GitHub API と R2 API はモック

## 免責事項

This project is not affiliated with, endorsed by, or sponsored by PicX or its maintainers. "PicX" refers to the software developed by XPoet (https://github.com/XPoet/picx) and is referenced here solely for descriptive purposes.

## ライセンス

Copyright 2026 Tianyu (Sky) Lu

The entire repository is licensed under the Apache License, Version 2.0 
(the "License"); you may not use any file in this repository except in 
compliance with the License. You may obtain a copy of the License at

```plaintext
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## 作者

Tianyu (Sky) Lu
