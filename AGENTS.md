# AGENTS.md

Script collection: automated test scripts (`*.test.ts`), online health-check scripts (`*.check.ts`), and data export scripts (`*.export.ts`). All scripts conform to the shared output protocol below.

## Stack
- Runtime: Node.js v24+ with native TypeScript type stripping — `node xxxxx.ts {params}` (no build/compile, no ts-node/tsx, no flags).
- Module system: ESM (`package.json` has `"type": "module"`).
- Local `.ts` imports MUST use the `.ts` extension — Node 24 does NOT resolve `.js`→`.ts` (e.g. `import { x } from './foo.ts'`).
- No build / test / lint / typecheck tooling is configured; do not assume any.

## Layout
- Scripts: `projects/<category>/<activity>/{checks,tests,exports}` (current: `projects/active/pk/{checks,tests,exports}`, `projects/funbit/option/{checks,tests}`.
  - `tests/`  — automated test cases (`.test.ts`)
  - `checks/` — online health checks (`.check.ts`)
  - `exports/` — data export scripts (`.export.ts`)
- APP scripts (Appium-based): `projects/app/<module>/` (current: `projects/app/core/`); platform/flavor/kind are encoded in the file name, so `checks`/`tests` subfolders are NOT used.
- Shared layers live in top-level `src/`: `src/resources/` (resource layer), `src/services/` (service layer), `src/base/` (business layer).
- Config: `config.json` (gitignored) holds secrets like `userToken`; `config.example.json` is the committed template; override path via `LITA_CONFIG_PATH`.
- APP data config: `config.app.json` (gitignored) holds accounts/passwords for APP scripts; `config.app.example.json` is the committed template; path is passed via env `SCRIPT_CONFIG` (default: none).
- Docs: `docs/app-scripts.md` (APP script conventions: state-driven model, timeouts/polling, keyboard handling, adb locator workflow, field experience), `docs/export-scripts.md` (export script guide: base-class API, serializers, output example).

## Architecture (three layers)
1. **Resource layer** (`src/resources/`) — connectors to MySQL / Redis / Nacos / API per environment:
   - Test env: direct connection (host/account/password), **read-write**, for test scenarios.
   - Prod env: via API proxy, **read-only**, for queries and checks.
   - Implemented: `APIProdResource` (prod API; fixed host `https://api.cinta.team/`; `l-user-token` from `config.json`; SQL-query endpoint `admin-ai/v1/query/execute`; known DBs in `databases.ts`), `MySQLProdResource` (prod MySQL via API proxy; **read-only** — client-side guard rejects write/DDL/multi-statement).
   - `AppiumResource` (APP automation): zero-dependency W3C WebDriver/Appium HTTP client over global `fetch`; server URL from env `SCRIPT_APPIUM_URL` (default `http://127.0.0.1:4723/`; internal fallback `http://172.20.1.79:4723/`); session lifecycle, `exists/waitFor/click(auto-retries stale/transient-missing)/input(W3C key-actions typing)/textOf/isDisplayed/source/back/screenshotBase64/hideKeyboard(BACK-key fallback when ineffective, e.g. password fields)/isKeyboardShown/swipeUp/swipeDown/swipeInElement/currentActivity`; locator helpers `by.id/accessibilityId/xpath/text/textContains` (cross-platform attribute matching).
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
   - `ExportBaseClass` (abstract, data export, extends `CheckBaseClass`): parses `--output-dir=<dir>`（必填，缺失/`--format` 非法时直接 fail，不进 run()）与 `--format=csv|xlsx|json|yaml|json-line|markdown`（默认 `csv`）；子类在 `run()` 中调用 `export(title, data, {columns?, filename?})`（每个导出为一个 `act` 步骤，写文件到 output-dir，filename 缺省为 slug(title)+扩展名，传入时也会强制改为当前格式扩展名）；`run()` 结束后、`done` 之前输出一行 `[files]`（所有导出文件 `{title, file}` 数组，file 为相对 output-dir 的文件名）。内置通用序列化方法 `toCsv`（RFC 4180 + UTF-8 BOM，便于 Excel 打开中文）/`toXlsx`（exceljs，单 sheet）/`toJson`/`toJsonLine`/`toYaml`/`toMarkdown`（`|` 转义）；columns 缺省取首行对象键序，`ExportColumn = { key, header? }`。示例见 `projects/active/pk/exports/sample.export.ts`。
   - `check` fn returns `{expect, real, pass?, message?}`; `pass` defaults to `expect===real`; returning with `pass:false` or throwing → `fail`; calling `this.skip(msg)` inside the fn → `skip`.
   - `act` fn: completes → `success`; throws → `fail`; `this.skip(msg)` → `skip`.
   - `AppBaseClass` (abstract, APP scripts, extends `CheckBaseClass`): constructed with `(platform: 'android'|'ios', flavor: 'lita'|'lite')`; owns the Appium session — `run()` creates the session (`act` step, then `activateApp()` to foreground), calls subclass `runCase()`, then destroys the session. Subclass implements `capabilities()` and `runCase()`; optional hooks `login(account)` and `onUnknownState()` (default: press back).
   - `AppBaseClass` is **state-driven** (see "APP script conventions"): subclass registers states via `addState({name, kind?, activity?, detect, handle?})` — `activity` (optional, exact/suffix match) gates detection: **current Activity is checked first, and element-level `detect` runs only when it matches**; helpers: `currentState()` (first matching `detect`, else `'unknown'`), `closePopups()` (loops over `kind:'popup'` states, handles multi-layer), `ensureState(name, timeoutMs)` / `ensureAnyState(names, timeoutMs)` (close popups → detect → migrate via `handle` / `onUnknownState`; `unknown` has a grace period `unknownGraceMs` default 5s for splash/startup; note target must be reachable by `currentState()` — earlier-registered states like `logged-in` may shadow page states; **state wait timeout defaults to `stateTimeoutMs` = 5s, special cases may pass an explicit timeoutMs**), `ensureLoggedIn()` (relies on `'logged-in'`/`'logged-out'` states; logs in via `login(account)` when logged out; same 5s default timeout), `activateApp()` / `terminateApp()` (via `mobile:` commands; appId from `capabilities()`).
   - Activity tracking: `activity` state variable holds the current page Activity (auto-refreshed before each state detection; every `act` completion also refreshes and prints `[log] 当前 Activity: xxx`); `isActivity(name | RegExp)` (async, refreshes then matches; string supports exact/suffix match) is the dedicated method for page-entry judgment — e.g. `.ui.login.LoginActivity` ⇒ logged-out.
   - Fail-fast on Activity mismatch: `assertActivity(expected)` throws when the current Activity differs; `act(title, fn, { expectActivity })` asserts it right after the operation — a mismatch marks that step `fail` and all later `act`/`check` steps are auto-`skip`ped. Same fail-fast for page-entry waits: `waitForElement(locator, desc?, timeoutMs?)` / `waitForActivity(expect, timeoutMs?)` — on timeout the step fails with the current Activity in the message and later steps skip. Page-entry waits must not exceed `pageTimeoutMs` (default 3s). Element precondition: `assertExists(locator, desc?)` fails the step immediately when the element is missing (plain fail, no skip-all).
   - `AppBaseClass` env: `env` from `SCRIPT_ENV` (`TEST` default / `PROD`); `scriptConfig` / `account(name='default')` read `accounts.{name}.username/password` from the JSON file at `SCRIPT_CONFIG`.

### Environment coupling
- Test cases (`tests/`) depend on **test-env** resource libs.
- Online checks (`checks/`) depend on **prod-env** resource libs.

## Script conventions

### Naming
- Tests: `xxxxxx.test.ts`
- Checks: `xxxxx.check.ts`
- Exports: `xxxxx.export.ts` (run: `node xxxxx.export.ts --output-dir=xxxxx [--format=csv]`)
- APP scripts: `{name}.{ios|android}.{lita|lite}.{check|test}.ts` (e.g. `login.android.lita.check.ts`)

### Run
`node xxxxx.ts {parameters}`

### APP script conventions (Appium)
- Env vars:
  - `SCRIPT_APPIUM_URL` — Appium server URL, default `http://127.0.0.1:4723/` (internal fallback `http://172.20.1.79:4723/`)
  - `SCRIPT_ENV` — `TEST` (default) / `PROD`
  - `SCRIPT_CONFIG` — optional path to a JSON data config file providing accounts/passwords (see `config.app.example.json`)
- Writing cases: to obtain element IDs/locators or check the current page Activity, use emulator/device commands instead of guessing, e.g.:
  - Current Activity: `adb shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'`
  - UI hierarchy / resource IDs: `adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml` (or `adb exec-out uiautomator dump /dev/tty`)
  - Element bounds/screenshot: `adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png`
- State-driven writing: never assume the current screen; always detect state first, then act/check:
  1. Register states in the constructor via `this.addState(...)` — popups first, then `'logged-in'`/`'logged-out'`, then other pages (registration order = detection order). Declare `activity` whenever known — detection checks the current Activity first and runs element-level `detect` only on match (faster, avoids cross-page false positives).
  2. Popups may stack in multiple layers — mark them `kind: 'popup'` with a `handle` that closes them; `closePopups()` loops until none remain.
  3. Use `ensureLoggedIn()` / `ensureState(name)` at the start of each flow to guarantee the preconditions before operating.
- **State waits (`ensureState` / `ensureAnyState` / `ensureLoggedIn`) default to 5s (`stateTimeoutMs`)**; special cases (e.g. first app launch, login completion) may pass an explicit longer `timeoutMs`.
- **State-detection polling intervals default to 200ms (`statePollMs`; `waitFor`'s `intervalMs` also defaults to 200ms)** — framework-internal sleeps are all 200ms; special cases may set them individually.

### Export script conventions
- Params（在 `process.argv` 解析）：
  - `--output-dir=<dir>` — 必填；输出目录，不存在自动创建；缺失时脚本直接 fail（不执行 run()）
  - `--format=<fmt>` — 输出类型，默认 `csv`；支持 `csv` / `xlsx` / `json` / `yaml` / `json-line` / `markdown`；非法值直接 fail
- 数据通过 `ExportBaseClass.export(title, data, opts?)` 写出，见 Business layer 说明。
- 完整编写说明见 `docs/export-scripts.md`。

### Output protocol (strict)
- Emit via **stdout, unbuffered** (real-time). One logical record per line.
- Line format: `[{type}] {data}\n`. Lines not starting with `[{type}]` default to `type=log`.
- Types and their JSON `data` shapes:
  - `log`   — free text.
  - `start` — `{"total":13,"time":0,"startTime":"2026-08-23T12:23:23.332"}`
  - `act`   — `{"no":1,"title":"...","status":"success|fail|skip","message":"...","time":234}`
  - `check` — `{"no":1,"title":"...","expect":"...","real":"...","status":"success|fail|skip","message":"...","time":2343}`
  - `files` — `[{"title":"...","file":"xxxxxx.csv"},...]` 导出的文件名与相对地址（导出脚本在 `done` 之前输出一次）
  - `done`  — `{"status":"success","total":13,"success":13,"fail":0,"skip":0,"message":"...","time":2342,"cost":2342}`
- `time` = milliseconds elapsed since `start`.
- For `act`/`check` `status`: `success` (no message needed) / `fail` (message = failure reason) / `skip` (message = skip reason).

## Git
- Default branch: `main`
- Workflow: commit directly to `main`; no release branches.
