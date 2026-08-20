# AGENTS.md

Script collection: automated test scripts (`*.test.ts`) and online health-check scripts (`*.check.ts`). All scripts conform to the shared output protocol below.

## Stack
- Runtime: Node.js v24+ with native TypeScript type stripping — `node xxxxx.ts {params}` (no build/compile, no ts-node/tsx, no flags).
- Module system: ESM (`package.json` has `"type": "module"`).
- Local `.ts` imports MUST use the `.ts` extension — Node 24 does NOT resolve `.js`→`.ts` (e.g. `import { x } from './foo.ts'`).
- No build / test / lint / typecheck tooling is configured; do not assume any.

## Layout
- Scripts: `projects/<category>/<activity>/{checks,tests}` (current: `projects/active/pk/{checks,tests}`, empty).
  - `tests/`  — automated test cases (`.test.ts`)
  - `checks/` — online health checks (`.check.ts`)
- Shared layers live in top-level `src/`: `src/resources/` (resource layer), `src/services/` (service layer), `src/base/` (business layer).
- Config: `config.json` (gitignored) holds secrets like `userToken`; `config.example.json` is the committed template; override path via `LITA_CONFIG_PATH`.

## Architecture (three layers)
1. **Resource layer** (`src/resources/`) — connectors to MySQL / Redis / Nacos / API per environment:
   - Test env: direct connection (host/account/password), **read-write**, for test scenarios.
   - Prod env: via API proxy, **read-only**, for queries and checks.
   - Implemented: `APIProdResource` (prod API; fixed host `https://api.cinta.team/`; `l-user-token` from `config.json`; SQL-query endpoint `admin-ai/v1/query/execute`; known DBs in `databases.ts`), `MySQLProdResource` (prod MySQL via API proxy; **read-only** — client-side guard rejects write/DDL/multi-statement).
   - Planned: `MySQLTestResource` (test, DB-password direct).
2. **Service layer** (`src/services/`) — env-aware business implementations. Construct with `'prod' | 'test'`; host auto-selected (`api.cinta.team` / `api.test.cinta.team`).
   - `ServiceBase` (abstract): holds `env`; exposes `api` (env-routed `APIProdResource`) and `sqlQuery(database, sql)` (read-only-guarded via `MySQLProdResource`).
   - `AwardService` (bound to `active` DB; values are escaped; `awardTime` is ms-epoch, window = `awardTime → awardTime+30s`; `player_type` is a string e.g. `USER`):
     - `queryAwardRecord(biz, topic, awardTime)` → `mod_common_award_record`.
     - `queryPlayerAwardRecord(biz, topic, players, awardTime, playerType?)` → `mod_common_award_record` (`player IN (...)`, optional `player_type`).
     - `queryAwardConfig(biz, name)` → `mod_common_award`, `ORDER BY stage, sequence`.
   - `ApiService`: header setters `setUserId`/`setUserLocale`/`setTraceId`/`setDebugTimestamp` (and generic `setHeader`); `call(path, {method, body})`; `runScheduledTask(debugTimestamp?)` → `POST active/v3/__cron`; `runConsumer(topic, items)` → `POST active/v3/__consumer/{topic}` (items is a list whose shape varies by topic).
3. **Business layer** (`src/base/`) — base classes for test cases and online checks.
   - Implemented: `CheckBaseClass` (abstract). Template-method pattern: subclass overrides `run()` and calls `act(title, fn)` / `check(title, fn)`; the script invokes `await new Sub().execute()`, which emits `start` → `run()` → `done`. Also exposes `log(msg)` and `skip(msg)` (throws, caught → `skip` status).
   - `check` fn returns `{expect, real, pass?, message?}`; `pass` defaults to `expect===real`; returning with `pass:false` or throwing → `fail`; calling `this.skip(msg)` inside the fn → `skip`.
   - `act` fn: completes → `success`; throws → `fail`; `this.skip(msg)` → `skip`.

### Environment coupling
- Test cases (`tests/`) depend on **test-env** resource libs.
- Online checks (`checks/`) depend on **prod-env** resource libs.

## Script conventions

### Naming
- Tests: `xxxxxx.test.ts`
- Checks: `xxxxx.check.ts`

### Run
`node xxxxx.ts {parameters}`

### Output protocol (strict)
- Emit via **stdout, unbuffered** (real-time). One logical record per line.
- Line format: `[{type}] {data}\n`. Lines not starting with `[{type}]` default to `type=log`.
- Types and their JSON `data` shapes:
  - `log`   — free text.
  - `start` — `{"total":13,"time":0,"startTime":"2026-08-23T12:23:23.332"}`
  - `act`   — `{"no":1,"title":"...","status":"success|fail|skip","message":"...","time":234}`
  - `check` — `{"no":1,"title":"...","expect":"...","real":"...","status":"success|fail|skip","message":"...","time":2343}`
  - `done`  — `{"status":"success","total":13,"success":13,"fail":0,"skip":0,"message":"...","time":2342,"cost":2342}`
- `time` = milliseconds elapsed since `start`.
- For `act`/`check` `status`: `success` (no message needed) / `fail` (message = failure reason) / `skip` (message = skip reason).

## Git
- Default branch: `main`
- Workflow: commit directly to `main`; no release branches.
