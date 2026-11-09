# 项目 3710：Admin 用户发图片白名单 + 陪玩师聊天记录 Unsend

## 背景与范围

项目 3710《【Admin部分】【PRD】私信-用户发图&撤回功能》要求 Admin 端新增「用户发图片白名单」页面（Locale/ID/NO 筛选、列表、批量添加、删除、权限），并在「陪玩师聊天记录」的消息类型中展示/筛选 `Unsend`，同时不改变既有「用户会话限制白名单」行为。

本目录为 TK-0136 的 Admin UI 自动化执行脚本，覆盖 TK-0135 已验收的 28 条九列用例（P0 24 / P1 4）中可执行的 UI 部分，以及非 UI 的 NU-01/NU-02 条件项。

- 用例来源：`/task/20261109/TK-0135/HANDOFF`
- 技术方案：`/task/20261109/TK-0135/TECH_DESIGN`
- 执行任务：`/task/20261109/TK-0136/HANDOFF`
- 项目：3710；提测记录：46

## 目录与文件

| 文件 | 说明 |
| --- | --- |
| `tests/image-white-unsend.test.ts` | 主脚本：用例 #1~#16、#18、#21~#24、#26~#28；#6/#19/#20/#25 仅做阻塞取证 |
| `tests/image-white-permission.test.ts` | 用例 #17 + NU-01 三接口权限拒绝 |
| `tests/lib/admin-base.ts` | 项目私有基类：真实登录、WAF 同源转发、页面操作、截图与请求留痕、表格/分页/提示辅助 |
| `COVERAGE.md` | 检查点 ↔ check 双向核对与结果 |
| `RUNS.md` | 自测、红证、正式执行、重跑与数据清理记录 |
| `README.md` | 本文件 |

## 运行

仓库根目录执行，凭证仅在运行时注入，不写入脚本、日志或交付物：

```bash
# 主脚本（用例 #1~#28；#6/#19/#20/#25 阻塞取证）
ADMIN_USERNAME=… ADMIN_PASSWORD=*** \
  node projects/feature/lita-admin-3710-image-white-unsend/tests/image-white-unsend.test.ts

# 权限脚本（用例 #17 + NU-01）
NOPERM_USERNAME=… NOPERM_PASSWORD=*** \
  node projects/feature/lita-admin-3710-image-white-unsend/tests/image-white-permission.test.ts
```

可选环境变量：

- `SCRIPT_UI_BASE`（默认 `https://admin.test.lita.game`）
- `SCRIPT_API_BASE`（默认 `https://funbit-mgr.test.cinta.team`）
- `--evidence-dir=…` 指定证据目录（默认 `evidence/<slug>-<stamp>/`）
- 自测可用 `--from=N --to=M` 限定用例范围；正式执行不要传。

## 账号与数据前置

- 主脚本账号需具有 `user-image-white`、`user-im-white-list`、`player-convo` 权限；脚本只读取运行时 `ADMIN_USERNAME`/`ADMIN_PASSWORD`。
- 权限脚本账号需有「用户管理」菜单但**不含** `user-image-white`；直达页面应不可进入。脚本只读取 `NOPERM_USERNAME`/`NOPERM_PASSWORD`。
- 主脚本通过「陪玩师管理列表」页面只读采集 600 个真实用户 ID（`candidates.json` 写入证据目录）；用例 #9 使用其中 500 个。
- 图片白名单测试行全部通过页面添加/删除；脚本按 `Operator=当前登录账号` 清理本轮新增行，不删除其他操作人的数据。
- 会话限制白名单仅新增/删除本用例用户 S（`candidates[40]`），执行后恢复 Total=17 与历史 ID 集合。
- 禁止 SQL/DDL/DML 写库；执行侧仅用只读 SQL 做就绪/清理核对（`user_image_white`、`user_im_white`、`player_message`）。

## 环境与 WAF

- Admin UI：`https://admin.test.lita.game`（本轮入口 `static/index-f3fad263.js`，HTML Last-Modified 2026-11-09 20:33:30 CST）。
- 执行机直连 `https://m-api.test.lita.game` 返回 WAF 403；基类仅在 Playwright 浏览器层把该主机请求**原样转发**到同源测试入口 `https://funbit-mgr.test.cinta.team`，不改 URL 业务参数与请求/响应体（规范 R1 例外，已在本文件与代码注释声明）。
- 浏览器上下文设置 `serviceWorkers: 'block'`，避免 SPA 的 Service Worker 绕过 WAF 转发导致 CORS 失败。
- 验证点全部读取页面内容（DOM/可见文本/表格单元格/提示 toast），不读取接口响应、不执行 SQL；页面请求留痕与只读 SQL 仅用于证据索引/前置就绪/清理核对。

## 结果摘要（TK-0136，2026-11-09）

- 用例四态：通过 22 / 未通过 0 / 阻塞 6（#6、#19、#20、#25、#26、#28）/ 未执行 0。
- 执行率 78.57%；通过率 100%（22/22）。
- 产品缺陷 0；FLAKY 风险 1（自测页面竞态：#7 切条数后一次 No Data，正式 final page=1、11 行；首次证据保留）；#7-④ 正式首次失败为单页隐藏可观测性缺口，按 TECH_DESIGN §6 ④ count 口径重跑通过，数据口径未放宽，非 FLAKY/非产品缺陷。
- 红证：P0 #1-① 临时改错期望 → check fail → 恢复 → check success；公开日志见 EVIDENCE E-32。
- 用例问题：Q-01（#26-②/#28-③ Reset Filters 仅清空输入、不刷新列表，与 `origin/dev` 的 `src/views/im/im-white.vue` 既有行为一致）；Q-02（#6 BD-04 无历史资料缺失行）。
- 未验证：NU-02（无 3709/IM 客户端条件）。
- 证据与报告：`/task/20261109/TK-0136/TEST_REPORT.md`、`EVIDENCE.md`、`COVERAGE.md`、`HANDOFF.md`。

## TK-0140 缺陷 #252 回归（2026-11-10）

- 环境构建：入口 `static/index-02cabc45.js`；HTML Last-Modified 2026-11-09 23:55:35 CST；图片白名单 chunk `static/index-30a2dc02.js` 含修复（`handleSizeChange` 先置 `currentPage=1`、`fetchSeq` 防过期响应）。
- 回归范围：`CASES=2,5,7,14,26,27,28`（`--from/--to` 仍可用；`CASES` 仅用于回归选择，正式平台全量执行不传）。
- #7：使用 21 个真实用户（Total=21）执行第 2 页切 20/page，分页保持可见，断言 `current=1`、`pageSize=20/page`、Total=21、rows=20，并核对请求序列仅 `page=1&rows=20`（无 `page=2&rows=20` 覆盖请求）。
- #26-②、#28-③：按实际行为，`Reset Filters` 仅清空 USER ID 输入、不刷新列表；Reset 后补一次 `Search`（USER ID 为空）再核对默认列表 Total 与历史 ID 集合（Q-01 说明保留，未改原用例）。
- 结果：`formal-regression` 59 步全部通过（22 check 全部通过）；图片白名单清理 0、会话限制白名单 17/测试行 0。
- 详细记录：`/task/20261109/TK-0140/TEST_REPORT.md`、`EVIDENCE.md`、`COVERAGE.md`、`HANDOFF.md`。

## TK-0144 阻塞补测复核（2026-11-10）

- 范围：TK-0135 九列用例 #6、#19、#20、#25；回归 #18（Unsend 下拉）与 #21（既有消息类型）。
- 数据构造通道：工位 #1059 资源权限「无权限」；`https://api.test.cinta.team/admin-ai/v1/query/execute` 为只读查询通道，执行 INSERT 返回 `SQL错误 [S1009]: Statement.executeQuery() cannot issue statements that do not produce result sets`；页面 `addList` 跳过不存在用户，聊天记录页无 `player_message.biz` 写入口。
- 数据变更：**未执行任何 INSERT/UPDATE/DELETE；未造数、未清理**。`user_image_white` 保持 1 行（5517/liyang，需求方数据，未改动）；`player_message.biz='UNSEND'` 仍为 0；候选会话 7016/13419 仍为 15 行。
- 页面阻塞取证：`CASES=6,19` 运行 7 步全部成功；#6 白名单 Total=1、rows=1；#19/#20/#25 按 player 7016 + Unsend + 2026-10-28~2026-11-10 查询 0 行（No Data）。
- 回归：`CASES=18,21` 运行 22 步 / 12 check 全部通过（#18 3/3、#21 9/9）。
- 结论：#6/#19/#20/#25 **阻塞（数据构造通道不可用，需求方 2026-11-10 选择 C 维持现状按阻塞交付）**；无新增产品缺陷；提测 46 维持 TK-0140 的「已通过」，4 条阻塞未闭环。
- 详细记录：`/task/20261110/TK-0144/TEST_REPORT.md`、`EVIDENCE.md`、`COVERAGE.md`、`HANDOFF.md`。
