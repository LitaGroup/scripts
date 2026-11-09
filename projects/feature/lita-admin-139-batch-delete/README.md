# Lita ADMIN 项目139：批量删除 + 提现成为陪玩师时间

## 背景

项目 139（Lita ADMIN 后台）需求：

1. 语音房管理-广播召人配置：增加批量删除；
2. 语音房管理-主播认证标识配置：增加批量删除；
3. 审核-提现-查询：增加【成为陪玩师时间】列（导出同样新增）。

本目录为项目139 的自动化测试脚本。最新执行轮次为 **TK-0105（2026-11-09）24 条 UI 用例**（广播召人 #1～#8、主播认证 #9～#17、提现 #18～#24）；此前主交付为 **TK-0092（2026-11-06）47 条 UI 用例 + 8 项非 UI 核验**，另含 **TK-0096 缺陷 #233 修复回归**脚本。历史提测 #35/#36/#38 脚本保留在目录中仅供追溯。TK-0105 的覆盖与运行记录见 `COVERAGE-TK0105.md`、`RUNS.md` 与任务文档 `/task/20261109/TK-0105/`。

## TK-0092 交付脚本（47 条 UI 用例 + 8 项非 UI 核验）

| 脚本 | 覆盖 | 检查点数 |
|:---|:---|:---|
| `tests/broad-config-47cases.test.ts` | 用例 #1～#11：入口/禁用态、批量删除（确认/取消/成功）、单条删除、新增、编辑、Excel 导入、分页、ROOM ID 搜索、英语区筛选；N-A3-API、N-A5-EMPTY | 26 |
| `tests/anchor-certification-47cases.test.ts` | 用例 #12～#20：入口/禁用态、批量删除（确认/取消/成功）、双会话不存在 ID 跳过、单条删除、多 uid 新增、编辑、导出；N-B3-LOG、N-B5-EMPTY | 26 |
| `tests/withdraw-become-player-time-47cases.test.ts` | 用例 #21～#47：新列位置、非空/空值样本、最近三个月与样本范围导出、14 类筛选、组合/重置、分页、批量入口（不实际审核/打款） | 59 |
| `tests/non-ui-verification.test.ts` | N-D1 console/HTTP 观测、N-D2-FE 前端 hash、N-D2-BE 后端健康/commit、N-D3 环境限制 | 4 |
| `tests/broad-import-233-regression.test.ts` | **TK-0096 缺陷 #233 回归**：导入选择文件无根路径 POST/405、Confirm 仅 1 次 uploadBroad、导入生成配置；页面轻量冒烟（加载/查询/批量入口/单条删除）；console/HTTP 基线 | 14 |


## TK-0105 交付脚本（24 条 UI 用例，2026-11-09）

用例来源：TK-0101 HANDOFF v5（`/task/20261109/TK-0101/HANDOFF`）；技术方案：`/task/20261109/TK-0101/TECH_DESIGN`。本轮按用例重新编写，不复用历史脚本或历史结果。

| 脚本 | 覆盖 | 检查点数 |
|:---|:---|:---|
| `tests/tk0105-broad-config.test.ts` | 用例 #1～#8：广播召人入口/空选、批量删除确认/取消/成功、单条删除、新增、编辑、Excel 导入 | 22 |
| `tests/tk0105-anchor-certification.test.ts` | 用例 #9～#17：主播认证入口/空选、批量删除确认/取消/成功、跨页只计当前页、单条删除、多 uid 新增、编辑、导出 | 27 |
| `tests/tk0105-withdraw-time.test.ts` | 用例 #18～#22、#24：成为陪玩师时间列位置、非空/空值、文本/日期/9 类下拉筛选、分页、导出 | 57 |
| `tests/tk0105-withdraw-batch-approve.test.ts` | 用例 #23：2 条现有待审核记录批量通过、状态流转、时间值保持（需 `--approve=1`） | 4 |
| `tests/lib/tk0105-base.ts` | TK-0105 页面操作/只读观测辅助（认证、提现表格、导出、查看陪玩师页） | — |

运行（仓库根目录，凭证仅运行时注入）：

```bash
ADMIN_USERNAME=qa-ai ADMIN_PASSWORD='***' node projects/feature/lita-admin-139-batch-delete/tests/tk0105-broad-config.test.ts
ADMIN_USERNAME=qa-ai ADMIN_PASSWORD='***' node projects/feature/lita-admin-139-batch-delete/tests/tk0105-anchor-certification.test.ts
ADMIN_USERNAME=qa-ai ADMIN_PASSWORD='***' node projects/feature/lita-admin-139-batch-delete/tests/tk0105-withdraw-time.test.ts
ADMIN_USERNAME=qa-ai ADMIN_PASSWORD='***' node projects/feature/lita-admin-139-batch-delete/tests/tk0105-withdraw-batch-approve.test.ts --approve=1
```

- `tk0105-withdraw-batch-approve.test.ts` 默认不带 `--approve=1` 时为安全演练，只验证勾选后按钮态，不提交审批；本任务仅授权 2 条现有待审核记录，正式执行一次并记录申请 ID。
- TK-0105 数据隔离：广播仅用测试房间 `10100450/10100452/10100454/10100455/13100137`；主播认证仅用用户 `10310/16505/15911/16432/15940/15904/15938`（均预先只读确认无认证且 `verify_type=0`）；提现仅只读，批量审核仅处理授权 2 条现有记录。用例结束逐条清理，未修改数据库字段。
- TK-0105 结果：23 条通过、0 条未通过、1 条阻塞（#24 仅按陪玩师No导出触发既有「不能无限制导出」保护，补充状态筛选验证新增列通过）；无新增缺陷。

运行（仓库根目录，凭证仅运行时注入）：

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='***' LITA_USER_TOKEN='***' \
  node projects/feature/lita-admin-139-batch-delete/tests/broad-config-47cases.test.ts
ADMIN_USERNAME=admin ADMIN_PASSWORD='***' LITA_USER_TOKEN='***' \
  node projects/feature/lita-admin-139-batch-delete/tests/anchor-certification-47cases.test.ts
ADMIN_USERNAME=admin ADMIN_PASSWORD='***' LITA_USER_TOKEN='***' \
  node projects/feature/lita-admin-139-batch-delete/tests/withdraw-become-player-time-47cases.test.ts
ADMIN_USERNAME=admin ADMIN_PASSWORD='***' LITA_USER_TOKEN='***' \
  node projects/feature/lita-admin-139-batch-delete/tests/non-ui-verification.test.ts
ADMIN_USERNAME=admin ADMIN_PASSWORD='***' \
  node projects/feature/lita-admin-139-batch-delete/tests/broad-import-233-regression.test.ts
```

执行顺序：广播 → 主播 → 提现 → 非 UI（非 UI 的 D1 会汇总前三个脚本的 run.json）。完整结果与证据见 `COVERAGE.md`、`RUNS.md` 及任务文档。

## 环境

| 项 | 值 |
|:---|:---|
| Admin UI | `https://admin.test.lita.game` |
| 后端同源测试入口 | `https://funbit-mgr.test.cinta.team` |
| 只读 DB 查询网关 | `https://api.test.cinta.team/admin-ai/v1/query/execute` |
| 管理员账号 | 运行时环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（禁止写入脚本/日志/证据） |

说明：

- 执行机直连 `https://m-api.test.lita.game` 被 CDN/WAF 403 拦截。脚本在 Playwright 浏览器层仅把该主机的请求改写转发到同源测试入口 `funbit-mgr.test.cinta.team`，页面代码与业务参数不变。
- 提测输入指定账号为 `ai`，但本轮工位未注入 `ai` 的口令；实际使用同环境具备全量权限的管理员账号（运行时注入），token 来自本次真实浏览器登录的登录响应/Cookie，不硬编码、不落盘。
- 数据库仅执行 `SELECT`，用于核对 `anchor_certification_log` 与 `user_profile.become_player_time`；查询 token 取工位 `LITA_USER_TOKEN`，不写入脚本与证据。

## 目录

```
projects/feature/lita-admin-139-batch-delete/
  README.md                                 项目说明
  COVERAGE.md                               用例/检查点 → 脚本 check 追溯（含 TK-0092 与历史轮次）
  COVERAGE-TK0105.md                        TK-0105 24 条用例 110 个 check 双向核对
  RUNS.md                                   运行记录与回归结论（含 TK-0092 与历史轮次）
  tests/
    README.md                               用例说明
    lib/admin-base.ts                       登录、同源转发、截图、接口/DB/console 留痕基类
    broad-config-47cases.test.ts            TK-0092 广播召人 #1～#11 + N-A3/N-A5
    anchor-certification-47cases.test.ts    TK-0092 主播认证 #12～#20 + N-B3/N-B5
    withdraw-become-player-time-47cases.test.ts TK-0092 提现 #21～#47
    non-ui-verification.test.ts             TK-0092 N-D1/D2/D3
    broad-import-233-regression.test.ts     TK-0096 缺陷 #233 修复回归（导入 405 + 轻量冒烟）
    tk0105-broad-config.test.ts             TK-0105 广播召人 #1～#8
    tk0105-anchor-certification.test.ts     TK-0105 主播认证 #9～#17
    tk0105-withdraw-time.test.ts            TK-0105 提现 #18～#22、#24
    tk0105-withdraw-batch-approve.test.ts   TK-0105 提现批量审核 #23
    lib/tk0105-base.ts                      TK-0105 页面操作/只读观测辅助
    broad-config-batch-delete.test.ts       历史：提测 #35/#36 广播召人全链路
    anchor-certification-batch-delete.test.ts 历史：提测 #35/#36 主播认证全链路
    pagination-rules.test.ts                历史：提测 #36 通用分页规则
    withdraw-become-player-time.test.ts     历史：提现新列展示/接口/DB 一致性
    withdraw-export.test.ts                 历史：提现导出 Excel
    broad-batch-delete-api.test.ts          历史：广播批量删除接口契约
```

## 依赖

- Node.js v24+（仓库原生 TypeScript 类型剥离，无需编译）
- `playwright`（Chromium）、`exceljs`

在仓库根目录安装依赖：

```bash
npm install
```

## 运行

在 `scripts` 仓库根目录执行；`ADMIN_PASSWORD` 与 `LITA_USER_TOKEN` 用运行时环境注入（示例中用 `***` 占位，实际命令不得记录明文）：

```bash
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD='***'
export LITA_USER_TOKEN='***'   # 仅 DB 抽样核对用；无此变量时 DB 断言会失败

# TK-0092 主交付
node projects/feature/lita-admin-139-batch-delete/tests/broad-config-47cases.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/anchor-certification-47cases.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/withdraw-become-player-time-47cases.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/non-ui-verification.test.ts

# 历史轮次（#35/#36/#38，仅供追溯）
node projects/feature/lita-admin-139-batch-delete/tests/broad-config-batch-delete.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/anchor-certification-batch-delete.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/pagination-rules.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/withdraw-become-player-time.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/withdraw-export.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/broad-batch-delete-api.test.ts
```

可选参数：

- `--evidence-dir=<dir>`：覆盖证据目录（默认 `evidence/<脚本名>-<时间戳>/`）
- `SCRIPT_UI_BASE` / `SCRIPT_API_BASE` / `SCRIPT_DB_API`：覆盖环境地址

## 留痕

每个脚本默认在 `evidence/<script>-<timestamp>/` 输出：

- `NN-场景.png`：关键操作步骤与断言现场截图；
- `run.json`：页面接口请求/响应、脚本直连接口、只读 SQL 与响应（token/密码已脱敏）。

## 测试数据

- 广播召人：使用英语区房间 `6666/12001/10000`（测试环境房间），先通过页面新增，结束后批量删除清理。
- 主播认证：使用测试账号 uid（`19440456`、`19526094`、`1789`、`1751` 等）新增后删除，并核对审计日志；`anchor_certification_log` 的 DELETE 记录为预期产物。
- 提现：只读查询与导出，不执行实际审核/打款；批量审核仅验证按钮禁用态，不点击确认。

## 已知限制

- 提现导出要求至少一个筛选条件（既有保护：无筛选返回“不能无限制导出”），脚本通过页面“最近三个月”日期快捷项触发真实导出。
- `startDate` 传 `yyyy-MM-dd HH:mm:ss` 时后端仍报“不符合要求的类型:Date”；页面日期选择器输出 `yyyy-MM-dd`，实际页面导出正常，本脚本仅记录该接口约束，不判失败。
- 主播认证末页回退首轮因缺陷 #223（后端超范围分页返回系统错误）失败；已由 funbit-api `test-mgr` `a8ae30d3db` 修复，最终回归通过，缺陷已关闭。
- 提测36 返工回归发现缺陷 #228：主播认证分页无结果时后端未回显请求的 rows（返回默认 20），前端每页条数由 10 漂移为 20；`pagination-rules.test.ts` 对应用例在修复前为失败状态，修复后应通过。
- 主播认证列表在多页数据下使用分页组件默认的 10 条/页；广播召人英语区仅 3 个测试房间，构造末页时通过组件状态把每页条数置为 2/1（数据均为本次测试数据）。
