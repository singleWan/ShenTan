# ShenTan (神探)

**AI-Driven Character Biography & Event Reaction Collection System**

English | [简体中文](./README.md)

Enter a character name, and the system uses multiple collaborative AI Agents to automatically search and scrape web content, extract biographical events, collect public reactions to those events, and generate structured character timeline data. Supports both historical figures and fictional characters.

![ShenTan Web Interface Screenshot](images/6f7a5584-08fb-4643-ae9d-60bf6a380813.png)

## Features

- **Four-Stage Intelligent Collection** — Orchestrator dispatches Biographer → EventExplorer → StatementCollector → ReactionCollector agents in stages
- **Dynamic Quality Convergence** — Event expansion uses dynamic quality assessment with automatic stopping at threshold, avoiding wasted iterations
- **Multiple Search Engines** — Supports DuckDuckGo and SearXNG with various search modes (general, deep, broad, news, social media)
- **Smart Alias Resolution** — Automatically searches and resolves character aliases; users can also provide custom aliases
- **Real-Time Progress Tracking** — Web interface streams Agent logs and stage progress via SSE (Server-Sent Events)
- **Interactive Timeline** — Insert searches between events, expand individual events, or collect reactions per event
- **Multi AI Provider** — Supports Anthropic Claude, OpenAI, and compatible APIs (DeepSeek, Ollama, etc.)
- **Dual Interface** — CLI command line + Web visual interface, powered by the same core engine

## Architecture

```
User Input → Orchestrator
  ├→ Biographer Agent        → Search + Scrape → Extract Events → Save to DB
  ├→ EventExplorer Agent     → Search + Scrape → Expand Events → Save to DB  (N rounds, dynamic convergence)
  ├→ StatementCollector Agent → Search + Scrape → Collect Speeches/Policies → Save to DB
  └→ ReactionCollector Agent → Search + Scrape → Extract Reactions → Save to DB
→ Output structured character data (JSON / Markdown / Web visualization)
```

| Layer | Technology | Description |
|-------|-----------|-------------|
| AI Engine | Vercel AI SDK + Zod | Tool-calling loop, multi-provider support |
| Crawler | Playwright (Chromium) | Headless browser scraping + content extraction |
| Database | SQLite (libsql / better-sqlite3) | Drizzle ORM, dual-driver architecture |
| Web Framework | Next.js 15 (App Router, React 19) | Server-side rendering + SSE live logs |
| CLI Framework | Commander.js | Command-line entry point |
| Build System | pnpm Monorepo + TypeScript (ESM) | Workspace protocol for inter-package references |

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- pnpm
- Playwright browser (install on first use)
- AI Provider API Key (Anthropic / OpenAI / compatible service)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd shentan

# Install dependencies
pnpm install

# Install Playwright browser
npx playwright install chromium
```

### Configuration

All configuration is managed through the `.env` file. Copy and edit the environment file:

```bash
cp .env.example .env
```

Edit `.env` to configure your AI provider:

```bash
# Default provider
PROVIDER_DEFAULT=anthropic

# Provider: Anthropic Claude
PROVIDER_ANTHROPIC_TYPE=anthropic
PROVIDER_ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-xxx

# Provider: OpenAI (optional)
# PROVIDER_OPENAI_TYPE=openai
# PROVIDER_OPENAI_MODEL=gpt-4o
# OPENAI_API_KEY=sk-xxx

# Provider: OpenAI-compatible (DeepSeek / Ollama etc., optional)
# PROVIDER_CUSTOM_TYPE=openai-compatible
# PROVIDER_CUSTOM_MODEL=your-model
# PROVIDER_CUSTOM_BASE_URL=https://your-api-endpoint/v1
# PROVIDER_CUSTOM_API_KEY=sk-xxx
```

## Usage

### CLI

```bash
# Collect character data
pnpm cli collect <character-name>

# Specify type and source
pnpm cli collect "Trump" -t historical
pnpm cli collect "Harry Potter" -t fictional -s "Harry Potter series"

# Custom aliases and expansion rounds
pnpm cli collect "Cao Cao" -a "Cao Mengde,Lord of Wei" -r 8

# Export character data
pnpm cli export <name-or-id> -f json -o ./output
pnpm cli export <name-or-id> -f markdown -o ./output

# Delete data
pnpm cli delete character <name-or-id>
pnpm cli delete event <event-id>
pnpm cli delete reaction <reaction-id>

# Start Web UI
pnpm cli serve -p 3000
```

**CLI Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type` | Character type: `historical` or `fictional` | `historical` |
| `-s, --source` | Character source (e.g., "Harry Potter series") | — |
| `-r, --rounds` | Max event expansion rounds (dynamic convergence, may be fewer) | `5` |
| `-a, --aliases` | Custom aliases, comma-separated | — |
| `--db` | Database file path | `./data/shentan.db` |

### Web Interface

```bash
# Start Web dev server
pnpm web
```

Open `http://localhost:3000` in your browser:

1. **Home** — Browse all collected characters
2. **Collect** — Fill in character info, watch Agent logs in real-time
3. **Character Detail** — View timeline, events, and reactions
4. **Interactive Actions** — Search between events, collect reactions for individual events

### Export Formats

**JSON**: Complete character data with event list and reaction details.

**Markdown**: Timeline document with:
- Category labels (personal life, career, political activity, etc.)
- Importance star ratings
- Public reactions with sentiment indicators

## Project Structure

```
shentan/
├── apps/
│   ├── cli/                    # CLI application (@shentan/cli)
│   │   └── src/
│   │       ├── index.ts        # Commander.js command registration
│   │       └── commands/       # collect / export / delete / serve
│   └── web/                    # Web application (@shentan/web)
│       └── src/
│           ├── app/            # Next.js App Router pages and API routes
│           ├── components/     # React components
│           └── lib/            # Data access layer and task management
├── packages/
│   ├── core/                   # Core data layer (@shentan/core)
│   │   └── src/db/             # Drizzle Schema, connection, queries
│   ├── crawler/                # Crawler engine (@shentan/crawler)
│   │   └── src/                # Playwright browser, search, content extraction
│   └── agents/                 # AI Agents (@shentan/agents)
│       └── src/
│           ├── orchestrator.ts       # Orchestrator: dispatches agents
│           ├── biographer.ts         # Biography collection agent
│           ├── event-explorer.ts     # Event expansion agent
│           ├── statement-collector.ts # Statement collection agent
│           ├── reaction-collector.ts # Reaction collection agent
│           ├── alias-resolver.ts     # Alias resolution
│           ├── quality-assessor.ts   # Quality assessment and convergence
│           ├── tools/                # Agent tool definitions (Zod Schema)
│           ├── prompts/              # System prompts
│           ├── provider/             # AI Provider factory
│           └── config/               # Environment-based config loader
├── scripts/
│   ├── agent-runner.ts         # Web sub-process entry for single tasks
│   └── task-runner.ts          # Web sub-process entry for full collection
├── .env                        # Environment variable configuration
├── pnpm-workspace.yaml         # Monorepo workspace config
└── tsconfig.base.json          # TypeScript base config
```

## Development

### Common Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm dev              # Run CLI in dev mode
pnpm web              # Start Web dev server
pnpm db:generate      # Generate Drizzle migration files
pnpm db:migrate       # Execute database migrations
```

### Adding a New Agent

1. Create an agent file in `packages/agents/src/`
2. Add a system prompt in `packages/agents/src/prompts/`
3. Register tools in `packages/agents/src/tools/` (Zod Schema for input validation)
4. Add the agent to the orchestration sequence in `orchestrator.ts`

### Environment Variables

All configuration is managed through the `.env` file. No additional config files needed.

#### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `PROVIDER_DEFAULT` | Default provider name | First defined provider |
| `MAX_TOKENS` | Global max AI output tokens | `8000` |
| `DATABASE_PATH` | SQLite database path | `./data/shentan.db` |
| `PORT` | Web service port | `3000` |

#### Provider Definition

Define AI providers via `PROVIDER_<NAME>_*` prefix (auto-discovery):

| Variable Pattern | Description | Required |
|-----------------|-------------|----------|
| `PROVIDER_<NAME>_TYPE` | Provider type: `anthropic` / `openai` / `openai-compatible` | Yes |
| `PROVIDER_<NAME>_MODEL` | Model name | Yes |
| `PROVIDER_<NAME>_API_KEY` | API key (also supports `<NAME>_API_KEY`) | No |
| `PROVIDER_<NAME>_BASE_URL` | Custom API endpoint (required for `openai-compatible`) | No |

#### Search Engine

| Variable | Description | Default |
|----------|-------------|---------|
| `SEARXNG_BASE_URL` | SearXNG service URL | (disabled) |
| `SEARXNG_ENABLED` | Enable/disable | `true` |
| `SEARXNG_CACHE_TTL` | Cache TTL in seconds | `1800` |

#### API Retry & Throttling

Automatically retries with exponential backoff on rate limits (429) or server errors (5xx), with a minimum interval between requests.

| Variable | Description | Default |
|----------|-------------|---------|
| `RETRY_MAX_RETRIES` | Max retry attempts (`0` to disable) | `3` |
| `RETRY_BASE_DELAY` | Initial retry delay (ms) | `2000` |
| `RETRY_MAX_DELAY` | Max delay cap (ms) | `30000` |
| `API_MIN_INTERVAL` | Min interval between requests (ms, `0` to disable) | `1000` |

#### Agent Overrides (Optional)

| Variable Pattern | Description | Default |
|-----------------|-------------|---------|
| `AGENT_<NAME>_MAX_ITERATIONS` | Max iterations | `25` |
| `AGENT_<NAME>_MAX_TOKENS` | Max output tokens | Inherits global `MAX_TOKENS` |

Agent names: `BIOGRAPHER` / `EVENT_EXPLORER` / `STATEMENT_COLLECTOR` / `REACTION_COLLECTOR`

#### Quality Control (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `QUALITY_MAX_EXPLORE_ROUNDS` | Max exploration rounds | `5` |
| `QUALITY_MIN_EXPLORE_ROUNDS` | Min exploration rounds | `2` |
| `QUALITY_CONVERGENCE_THRESHOLD` | Convergence threshold | `2` |
| `QUALITY_CONSECUTIVE_DRY_ROUNDS` | Consecutive dry rounds | `2` |

### Coding Conventions

- TypeScript strict mode, ESM module system
- Relative imports use `.js` extension (ESM compatibility)
- Table and column names use snake_case, ORM maps to camelCase
- Web app: App Router, server components preferred

## License

MIT
