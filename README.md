# iStockVisual

Astro + Cloudflare（Pages / D1 / R2）素材站基础框架。Sanity 承载内容元数据，Better Auth + D1 做会员，GitHub 连接 Cloudflare 自动发布。

## 技术栈

- **前端 / SSR**：Astro 7 + `@astrojs/cloudflare`
- **分类**：前端配置 `Photos / Illustrations / Vectors / 3D`（[`src/config/categories.ts`](src/config/categories.ts)）
- **CMS**：Sanity（[`sanity/`](sanity/)）
- **对象存储**：Cloudflare R2（binding：`MEDIA`）
- **数据库 / 会员**：Cloudflare D1 + Better Auth（binding：`DB`）
- **AI 修图**：[`/tools/ai-edit`](src/pages/tools/ai-edit.astro) 占位页（尚未接真实模型）

未配置 Sanity 时，站点会自动使用本地 demo 素材，方便先跑通 UI。

## 快速开始

### 1. 安装依赖

```bash
npm install
npm install --prefix sanity
```

### 2. 本地环境变量

```bash
copy .dev.vars.example .dev.vars
```

编辑 `.dev.vars`：

- `BETTER_AUTH_SECRET`：长随机字符串（可用 `openssl rand -hex 32`）
- `BETTER_AUTH_URL`：`http://localhost:4325`
- Sanity 相关变量可先留空（将使用 demo 素材）

### 3. 本地 D1 迁移

```bash
npm run db:migrate:local
```

> `wrangler.jsonc` 里的 `database_id` 先是占位符。本地 `migrations apply --local` 可用；上线前请用 `wrangler d1 create istockvisual-db` 创建真实库并替换 ID。

### 4. 启动站点

```bash
npm run dev
```

打开 <http://localhost:4325>。

### 5.（可选）启动 Sanity Studio

1. 在 [sanity.io](https://www.sanity.io) 创建项目
2. 设置环境变量 `SANITY_STUDIO_PROJECT_ID` / `SANITY_STUDIO_DATASET`
3. 把同一 `projectId` / `dataset` 写入根目录 `.dev.vars`（`SANITY_PROJECT_ID` 等）
4. 运行：

```bash
npm run sanity:dev
```

在 Studio 中创建 `asset` 文档，填入 `r2ObjectKey`（对应 R2 中的对象 key）。

## 主要路由

| 路径 | 说明 |
|---|---|
| `/` | 首页 |
| `/photos` `/illustrations` `/vectors` `/3d` | 分类列表 |
| `/:category/:slug` | 素材详情 |
| `/login` `/signup` `/account` | 会员 |
| `/tools/ai-edit` | AI 修图占位 |
| `/api/auth/*` | Better Auth |
| `/api/download/:id` | 受控下载（需登录；Pro 素材需 `plan=pro`） |

## Cloudflare 资源（免费层起步）

在 Cloudflare Dashboard / Wrangler 中创建：

1. **D1**：`istockvisual-db` → 把 `database_id` 写入 [`wrangler.jsonc`](wrangler.jsonc)
2. **R2**：`istockvisual-media` → binding `MEDIA`
3. 应用远程迁移：

```bash
npm run db:migrate:remote
```

推荐环境变量（Pages / Workers）：

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`（生产域名，如 `https://istockvisual.com`）
- `SANITY_PROJECT_ID`
- `SANITY_DATASET`
- `SANITY_API_TOKEN`（只读 token，可选）
- `PUBLIC_SANITY_PROJECT_ID` / `PUBLIC_SANITY_DATASET`（若希望构建期也能读公开配置）

## GitHub → Cloudflare 发布

1. 推送本仓库到 GitHub
2. Cloudflare Dashboard → **Workers & Pages** → Create → 连接该 GitHub 仓库
3. 构建设置：
   - Build command：`npm run build`
   - Deploy command / 输出：按 Astro Cloudflare adapter（本仓库使用 `wrangler.jsonc` + `npm run build`，可用 `npx wrangler deploy` 或 Pages 的 Workers 集成）
4. 绑定同一 D1、R2，并配置上面的环境变量
5. 首次部署前执行 `npm run db:migrate:remote`

## 下载权限逻辑

1. 必须已登录
2. 若 Sanity 中 `isPremium === true`，则要求用户 `plan === 'pro'`
3. 从 R2 `MEDIA` 按 `r2ObjectKey` 流式返回文件

`plan` / `planExpiresAt` 已写入 D1 `user` 表，支付（Stripe 等）可后续接入，不必改表结构。

## 目录结构（核心）

```
src/
  config/categories.ts
  lib/auth.ts | sanity.ts | r2.ts
  pages/...
  components/...
sanity/                 # 无头 CMS Studio
migrations/0001_init.sql
wrangler.jsonc
```

## GitHub 自动备份

仓库地址：**https://github.com/yayadel/istockvisual.com**

- 使用项目根目录的 `github_token`（已在 `.gitignore`，不会上传）
- 手动备份：`npm run backup`
- **持续自动备份**（文件改动后约 10 秒提交并推送）：

```bash
npm run backup:watch
```

Cursor 里 Agent 改完文件也会触发备份（`.cursor/hooks.json`）。

> `keyword_store/` 体积过大已排除在 Git 之外，仅保留在本地。

## 本期不做

- Stripe / 订阅支付闭环
- 真实 AI 推理与计费
- OAuth 社交登录
- 素材批量导入流水线
