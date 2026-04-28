# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-04-29

### Added

- 四阶段智能收集流水线：Biographer → EventExplorer → StatementCollector → ReactionCollector
- 动态质量收敛：事件拓展根据质量评估自动停止
- 多 AI Provider 支持：Anthropic Claude、OpenAI 及兼容接口（DeepSeek、Ollama 等）
- 多搜索引擎：DuckDuckGo + SearXNG，支持通用/深度/广泛/新闻/社交媒体搜索模式
- 智能别名解析：自动搜索角色别名，支持用户自定义补充
- Web 可视化界面：角色列表、时间线详情、在线收集（SSE 实时日志）
- CLI 命令行：collect / export / delete / serve 四个子命令
- 交互式时间线：事件间隔插入搜索、单个事件拓展和反应收集
- 并发反应收集：`runWithConcurrency` Promise 池，默认 3 并发
- 结构化错误类型：11 种 `ShentanError` 子类，支持错误码和上下文
- 结构化日志：`StructuredLogger` 支持 debug/info/warn/error 级别和子 logger
- API 限流：基于 IP 的滑动窗口限流，收集 1/min、拓展 3/min、删除 10/min
- API 错误处理：`apiHandler` 统一包装，自动错误码→HTTP 状态码映射
- 前端 Error Boundary：React 渲染错误捕获，赛博朋克风格错误页面
- 日期标准化：中文/英文/民国/公元前/虚构角色日期统一解析
- 单元测试：Vitest 框架，51 个测试覆盖日期解析、错误类型、并发控制

### Changed

- Schema 统一：Web 端从 `@shentan/core/schema` 导入，消除双重定义漂移风险
- Runner 重构：抽取 `ProcessManager` 泛型类，消除 collect/task runner 约 350 行重复代码
- 数据库批量操作：`saveEvents`/`saveReactions` 使用事务批量插入，`exportCharacter` 预构建索引消除 N+1 查询
- Agent 子进程入口：替换手动 .env 解析为 `dotenv` 库

### Removed

- 移除 `searchTasks` 表（死代码）
- 移除 `apps/web/src/app/api/collect-status` 死 API 路由
- 移除 `packages/agents/src/prompts/orchestrator.ts` 未使用的 prompt
- 移除 CLI 中未使用的 `ora` 和 `chalk` 依赖
