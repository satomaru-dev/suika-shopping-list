# スイカの買い物リスト

家族で共有できる、音声・Siri対応の買い物リストPWAです。既存のNotionや旧アプリには接続しない、完全に独立したアプリです。

## できること

- iPhone／Androidのホーム画面に追加
- 文字入力とブラウザの音声認識で商品を追加
- 「牛乳と卵とパン」の複数商品入力
- 購入済み・未購入への復元・購入履歴
- 3回以上の履歴から購入間隔の中央値を計算し、予定日の3日前から提案
- 「Hey Siri、買い物リストに追加して」で追加するショートカット
- 共通PIN、30日セッション、ログイン試行制限
- 曖昧な表記ゆれを利用者が確認して統合

## まず画面を見る

Node.js 20.9以上をインストールし、PowerShellでこのフォルダを開きます。

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開きます。`.env.example`は最初から`DEMO_MODE=true`なので、Supabaseなしで購入履歴469件を使った画面を確認できます。デモ操作はサーバーを止めるとリセットされます。

## 本番用Supabaseを作る

1. 自分のSupabaseアカウントで新しいProjectを作ります。
2. Supabase DashboardのSQL Editorを開きます。
3. [`supabase/migrations/20260811000100_initial_schema.sql`](supabase/migrations/20260811000100_initial_schema.sql) の内容を貼り付けて実行します。
4. Project SettingsのAPI画面からProject URLと`service_role`キーを確認します。
5. `.env.local`を次のように変更します。

```env
SUPABASE_URL=https://自分のproject-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=自分のservice-role-key
APP_SETUP_SECRET=十分に長いランダムな文字列
DEMO_MODE=false
```

`SUPABASE_SERVICE_ROLE_KEY`はブラウザへ公開してはいけません。`NEXT_PUBLIC_`を付けず、GitHubへも登録しないでください。本アプリはこのキーをサーバーAPI内だけで使用します。

### 初回PIN設定

1. `npm run dev`で起動します。
2. 画面に`APP_SETUP_SECRET`と家族共通PINを入力します。
3. 初回設定が完了したら、Vercelから`APP_SETUP_SECRET`を削除できます。

PINはArgon2idハッシュで保存され、平文は保存されません。

## 469件の購入履歴を移す

同梱した`data/purchase-history.json`は、添付CSVから商品名と購入日時だけを抽出したものです。記入者などの情報は含みません。

初回PIN設定後、Supabaseの環境変数を設定したPCで実行します。

```powershell
npm run history:import
```

インポート元のSHA-256、バッチID、行番号を保存するため、同じファイルを再実行しても二重登録されません。完了時に「合計469件」と表示されることを確認してください。

## Vercelへ公開する

1. このフォルダを自分の新しいGitHubリポジトリへpushします。
2. 自分のVercelアカウントで「Add New Project」からそのリポジトリを選びます。
3. VercelのEnvironment Variablesへ以下を設定します。

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_SETUP_SECRET=...
DEMO_MODE=false
```

4. Deployします。
5. 公開URLで初回PIN設定を行います。
6. 設定後はVercelの`APP_SETUP_SECRET`を削除して再デプロイします。

旧アプリのVercel Project、いわぶさんのGitHub、Notionは使いません。

## iPhoneのHey Siri設定

公開後、アプリの「設定」画面に画像付き手順と専用URLが表示されます。

1. 「iPhone用トークンを発行」を押します。
2. iPhoneの「ショートカット」アプリで新規ショートカットを作ります。
3. 名前を`買い物リストに追加して`にします。
4. 「テキストを音声入力」アクションを追加し、質問を`何を追加しますか？`にします。
5. 「URLの内容を取得」を追加します。
6. URLは設定画面の`https://公開URL/api/siri/items`、メソッドは`POST`にします。
7. JSON本文へ`text`を作り、値に音声入力結果を指定します。
8. ヘッダ`Authorization`へ`Bearer `に続けて発行トークンを指定します。
9. 必要ならレスポンスの`message`を「テキストを読み上げ」で読み上げます。

以後、「Hey Siri、買い物リストに追加して」と話すとSiriが商品名を尋ねます。トークンを紛失した場合は設定画面の「無効化」を押してください。

## Androidと画面内音声入力

マイクボタンはブラウザの`SpeechRecognition`または`webkitSpeechRecognition`を利用します。対応していないブラウザ、マイク拒否、認識失敗時も文字入力は利用できます。音声ファイルはアプリやSupabaseへ保存しません。

## 検証

```powershell
npm test
npm run lint
npm run build
```

実装時点で、単体テスト11件、ESLint、本番ビルドを通過しています。

## セキュリティ構成

- `anon`／`authenticated`にはDBテーブル権限を付与しません。
- 全テーブルでRLSを有効化しています。
- `service_role`はNext.jsサーバー内だけで使用します。
- セッションとSiriトークンはランダム値のSHA-256ハッシュだけをDBへ保存します。
- SiriトークンはiPhoneごとに発行・無効化できます。
- 新規Supabase ProjectのData API権限変更に対応し、`service_role`権限をMigrationで明示しています。
