# 贡献指南

感谢你对神探项目的关注！本文档介绍如何参与项目开发。

## 开发环境搭建

### 前置条件

- Node.js >= 20.0.0
- pnpm
- AI Provider API Key（Anthropic / OpenAI / 兼容服务）

### 安装步骤

```bash
# 克隆仓库
git clone <repository-url>
cd shentan

# 安装依赖
pnpm install

# 安装 Playwright 浏览器
npx playwright install chromium

# 配置环境变量
cp .env.example .env
# 编辑 .env 配置 AI Provider

# 验证环境
pnpm build
pnpm test
```

## 项目结构

```
shentan/
├── apps/
│   ├── cli/          # 命令行应用 (@shentan/cli)
│   └── web/          # Web 可视化 (@shentan/web)
├── packages/
│   ├── core/         # 数据层 (@shentan/core) — Schema、查询、类型
│   ├── crawler/      # 爬虫引擎 (@shentan/crawler) — Playwright + 搜索
│   └── agents/       # AI Agent (@shentan/agents) — 编排器、工具、提示词
└── scripts/          # Web 端子进程入口
```

**依赖关系**: `web` → `core` | `agents` → `core` + `crawler` | `cli` → `core` + `agents`

## 编码规范

### TypeScript

- **strict mode** — 所有包启用 `strict: true`
- **ESM 模块** — `"type": "module"`，使用 `import/export` 语法
- **`.js` 后缀导入** — 相对导入必须带 `.js` 后缀（ESM 兼容）：
  ```typescript
  // 正确
  import { getDb } from './db/connection.js';
  // 错误
  import { getDb } from './db/connection';
  ```
- **workspace 引用** — 包间引用使用 `workspace:*` 协议

### 数据库

- **Drizzle ORM** — Schema-first，表名和列名使用 `snake_case`
- **Core 是唯一 Schema 源** — Web 端从 `@shentan/core/schema` 导入，不要重复定义
- **Core 使用 libsql**（异步），Web 使用 better-sqlite3（同步）

### Web 应用

- **Next.js 15 App Router** — 服务端组件优先，仅交互部分使用 `'use client'`
- **CSS** — 纯 CSS + CSS Variables，无 Tailwind 或 CSS-in-JS
- **API 路由** — 使用 `apiHandler` 包装，重操作加 `rateLimitResponse`

### 错误处理

- 使用 `packages/core/src/utils/errors.ts` 中的结构化错误类型
- 不要抛裸 `Error`，使用对应的 `ShentanError` 子类
- Web API 路由通过 `apiHandler` 自动捕获并返回标准化错误响应

### 测试

- **Vitest** 测试框架
- 测试文件放在源文件同目录，命名 `*.test.ts`
- 纯逻辑优先单元测试，数据库操作使用内存 SQLite
- 运行: `pnpm test` / `pnpm test:watch`

## 添加新 Agent

1. 在 `packages/agents/src/` 创建 Agent 文件（参考 `biographer.ts`）
2. 在 `packages/agents/src/prompts/` 添加系统提示词
3. 在 `packages/agents/src/tools/` 注册工具（Zod Schema 校验入参）
4. 在 `orchestrator.ts` 中编排新 Agent 的执行顺序
5. 添加对应的单元测试

## PR 流程

1. Fork 仓库并创建特性分支
2. 确保通过所有检查：
   ```bash
   pnpm build    # 构建通过
   pnpm test     # 测试通过
   ```
3. 提交 PR，描述变更内容和动机
4. 代码审查通过后合并

### 提交信息格式

使用 Conventional Commits 格式：

```
type(scope): 简短描述

详细说明（可选）
```

**type**: `feat` | `fix` | `refactor` | `docs` | `test` | `chore`
**scope**: `core` | `agents` | `crawler` | `web` | `cli`

示例：
- `feat(agents): 新增 StatementCollector Agent`
- `fix(crawler): 修复 DuckDuckGo 搜索结果解析`
- `refactor(core): 统一 Schema 定义，消除 Web 端重复`
