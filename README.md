# Model Context Protocol (MCP) Server + Github OAuth

これは、Github OAuthが組み込まれたリモートMCP接続をサポートする[Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction)サーバーです。

あなた自身のCloudflareアカウントにデプロイし、Github OAuthクライアントアプリを作成した後、完全に機能するリモートMCPサーバーを構築することができます。ユーザーはGitHubアカウントでサインインすることで、あなたのMCPサーバーに接続できるようになります。

これは、[`workers-oauth-provider`ライブラリ](https://github.com/cloudflare/workers-oauth-provider)を使用して、CloudflareにデプロイされたMCPサーバーに他のOAuthプロバイダーを統合する方法の参考例として使用できます。

MCPサーバー（[Cloudflare Workers](https://developers.cloudflare.com/workers/)によって駆動）は以下の役割を果たします：

* MCPクライアントに対するOAuth _サーバー_ として機能
* _実際の_ OAuthサーバー（この場合はGitHub）に対するOAuth _クライアント_ として機能

## はじめに

リポジトリを直接クローンして依存関係をインストールします：`npm install`。

または、以下のコマンドラインを使用してローカルマシンにリモートMCPサーバーを作成することもできます：
```bash
npm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-github-oauth
```

### 本番環境用
新しい[GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)を作成します：
- ホームページURLには `https://mcp-github-oauth.<your-subdomain>.workers.dev` を指定
- 認証コールバックURLには `https://mcp-github-oauth.<your-subdomain>.workers.dev/callback` を指定
- クライアントIDをメモし、クライアントシークレットを生成
- Wranglerを使用してシークレットを設定
```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY # ここにランダムな文字列を追加（例：openssl rand -hex 32）
```

> [!IMPORTANT]
> 最初のシークレットを作成する際、Wranglerが新しいWorkerを作成するかどうか尋ねてきます。「Y」を選択して新しいWorkerを作成し、シークレットを保存してください。

#### KVネームスペースの設定
- KVネームスペースを作成します：
`wrangler kv namespace create "OAUTH_KV"`
- WranglerファイルをKV IDで更新

#### デプロイ & テスト
MCPサーバーをデプロイして、workers.devドメインで利用可能にします
` wrangler deploy`

[Inspector](https://modelcontextprotocol.io/docs/tools/inspector)を使用してリモートサーバーをテストします：

```
npx @modelcontextprotocol/inspector@latest
```
`https://mcp-github-oauth.<your-subdomain>.workers.dev/sse` を入力し、接続をクリックします。認証フローを通過すると、ツールが動作していることが確認できます：

<img width="640" alt="image" src="https://github.com/user-attachments/assets/7973f392-0a9d-4712-b679-6dd23f824287" />

これでリモートMCPサーバーがデプロイされました！

### アクセス制御

#### Set up a KV namespace
- Create the KV namespace: 
`wrangler kv namespace create "OAUTH_KV"`
- Update the Wrangler file with the KV ID

#### Deploy & Test
Deploy the MCP server to make it available on your workers.dev domain 
` wrangler deploy`

Test the remote server using [Inspector](https://modelcontextprotocol.io/docs/tools/inspector): 

```
npx @modelcontextprotocol/inspector@latest
```
Enter `https://mcp-github-oauth.<your-subdomain>.workers.dev/sse` and hit connect. Once you go through the authentication flow, you'll see the Tools working: 

<img width="640" alt="image" src="https://github.com/user-attachments/assets/7973f392-0a9d-4712-b679-6dd23f824287" />

You now have a remote MCP server deployed! 

### アクセス制御

このMCPサーバーは認証にGitHub OAuthを使用します。認証されたすべてのGitHubユーザーは、「add」や「userInfoOctokit」などの基本ツールにアクセスできます。

「generateImage」ツールは、`ALLOWED_USERNAMES`設定にリストされた特定のGitHubユーザーに制限されています：

```typescript
// 画像生成アクセス用のGitHubユーザー名を追加
const ALLOWED_USERNAMES = new Set([
  'yourusername',
  'teammate1'
]);
```

### Claude DesktopからリモートMCPサーバーにアクセス

Claude Desktopを開き、Settings -> Developer -> Edit Configに移動します。これにより、ClaudeがアクセスできるMCPサーバーを制御する設定ファイルが開きます。

内容を以下の設定に置き換えます。Claude Desktopを再起動すると、ブラウザウィンドウが開きOAuthログインページが表示されます。認証フローを完了してClaudeにMCPサーバーへのアクセスを許可してください。アクセスを許可すると、ツールが使用可能になります。

```
{
  "mcpServers": {
    "math": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp-github-oauth.<your-subdomain>.workers.dev/sse"
      ]
    }
  }
}
```

ツール（🔨の下）がインターフェースに表示されたら、Claudeにそれらを使用するよう依頼できます。例：「23と19を足すのにmathツールを使ってもらえますか？」。ClaudeはツールをInvokeし、MCPサーバーによって生成された結果を表示するはずです。

### ローカル開発用
MCPサーバーの反復とテストを行いたい場合は、ローカル開発で実行できます。これには、GitHubで別のOAuthアプリを作成する必要があります：
- ホームページURLには `http://localhost:8788` を指定
- 認証コールバックURLには `http://localhost:8788/callback` を指定
- クライアントIDをメモし、クライアントシークレットを生成
- プロジェクトルートに`.dev.vars`ファイルを作成し、以下を記述：
```
GITHUB_CLIENT_ID=your_development_github_client_id
GITHUB_CLIENT_SECRET=your_development_github_client_secret
```

#### 開発 & テスト
サーバーをローカルで実行して `http://localhost:8788` で利用可能にします
`wrangler dev`

ローカルサーバーをテストするには、Inspectorに `http://localhost:8788/sse` を入力して接続をクリックします。プロンプトに従うと、「List Tools」を実行できるようになります。

#### Claudeと他のMCPクライアントの使用

Claudeを使用してリモートMCPサーバーに接続する際、エラーメッセージが表示される場合があります。これは、Claude DesktopがまだリモートMCPサーバーをサポートしていないため、時々混乱するからです。MCPサーバーが接続されているかどうかを確認するには、Claudeのインターフェースの右下隅にある🔨アイコンにカーソルを合わせます。そこでツールが利用可能になっているのが確認できるはずです。

#### CursorとMCPクライアントの使用

CursorをMCPサーバーに接続するには、`Type`を「Command」に選択し、`Command`フィールドにcommandとargsフィールドを1つに結合します（例：`npx mcp-remote https://<your-worker-name>.<your-subdomain>.workers.dev/sse`）。

CursorはHTTP+SSEサーバーをサポートしていますが、認証はサポートしていないため、まだ`mcp-remote`を使用する必要があります（HTTPサーバーではなくSTDIOサーバーを使用）。

WindsurfなどのMCPクライアントにMCPサーバーを接続するには、クライアントの設定ファイルを開き、Claudeの設定で使用したのと同じJSONを追加して、MCPクライアントを再起動します。

## どのように動作するか？

#### OAuthプロバイダー
OAuthプロバイダーライブラリは、Cloudflare Workers用の完全なOAuth 2.1サーバー実装として機能します。トークンの発行、検証、管理を含むOAuthフローの複雑さを処理します。このプロジェクトでは、以下の二重の役割を果たします：

- サーバーに接続するMCPクライアントの認証
- GitHubのOAuthサービスへの接続管理
- KVストレージでのトークンと認証状態の安全な保存

#### Durable MCP
Durable MCPは、CloudflareのDurable Objectsを使用してベースMCP機能を拡張し、以下を提供します：
- MCPサーバーの永続的な状態管理
- リクエスト間での認証コンテキストの安全な保存
- `this.props`を介した認証ユーザー情報へのアクセス
- ユーザーIDに基づく条件付きツール可用性のサポート

#### MCP Remote
MCP Remoteライブラリは、InspectorなどのMCPクライアントから呼び出せるツールをサーバーが公開できるようにします。以下の機能を提供します：
- クライアントとサーバー間の通信プロトコルの定義
- ツールを定義するための構造化された方法
- リクエストとレスポンスのシリアライゼーションとデシリアライゼーションの処理
- クライアントとサーバー間のServer-Sent Events（SSE）接続の維持
