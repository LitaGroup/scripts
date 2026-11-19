# lita-admin-game-entry-config

项目 105 / 工单 WO-0035「Admin 新增游戏入口展示配置」：Admin「游戏配置 - 游戏入口配置」页面的 UI 测试脚本（用例 #1~#41）。

## 用例来源

- 用例表格：TK-0409 HANDOFF v6 九列用例（41 条 / 131 个执行检查点，含 #5 数据行 A/B、#24 三个数据行）。
- 技术方案：`/task/20261119/TK-0409/TECH_DESIGN`（v1.2：S1~S7 骨架、F01~F33 覆盖矩阵、BD-01~BD-06 造数、元素定位、引用式断言映射、§8 数据安全边界）。
- 需求基线：`/task/20261119/TK-0346/REQUIREMENT`、`/task/20261119/TK-0346/API`、`/task/20261119/TK-0344/TECH_DESIGN`、`/task/20261119/TK-0344/API`。

## 运行前置

- Node.js v24+（原生 TS 类型剥离，`node xxx.test.ts` 直跑，无构建步骤）。
- 测试环境 `https://admin.test.lita.game`（`SCRIPT_UI_BASE` 可覆盖）。
- 账号：常规 `qa-ai`（`ADMIN_USERNAME`/`ADMIN_PASSWORD`）；无权限族 `qa-noauth`（`NOAUTH_USERNAME`/`NOAUTH_PASSWORD`）。
- 执行机直连 `m-api.test.lita.game` 被 WAF 403 时，基类按《ADMIN 测试代码开发规范》R1 例外做浏览器层同源原样转发到 `https://funbit-mgr.test.cinta.team`（不改 URL 业务参数、不改请求/响应体，网络层转发；`SCRIPT_API_BASE` 可覆盖）。
- 凭证仅运行时注入，禁止写入代码、日志、证据、文档。

## 运行方式

```bash
cd projects/feature/lita-admin-game-entry-config

# #1~#3 入口与权限（qa-ai + qa-noauth）
ADMIN_USERNAME=… ADMIN_PASSWORD=… NOAUTH_USERNAME=… NOAUTH_PASSWORD=… \
  node tests/tc01-entry-permission.test.ts

# #4~#12 列表与筛选
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc02-list-filter.test.ts

# #13~#16 分页
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc03-pagination.test.ts

# #17~#24 添加用户
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc04-add.test.ts

# #25~#30 勾选删除（#30 使用同一登录态的独立浏览器上下文）
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc05-select-delete.test.ts

# #31~#36 条件删除
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc06-filter-delete.test.ts

# #37~#39 导出
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc07-export.test.ts

# #40 现状基线回归
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc08-regression.test.ts

# #41 时间条件删除实际执行与恢复（需求方裁决授权；必须最后执行；默认禁止重复执行）
# 仅当确认当天 3 条存量可恢复、且需求方明确授权复验时，才设置 ALLOW_CASE41=1
ADMIN_USERNAME=… ADMIN_PASSWORD=… ALLOW_CASE41=1 node tests/tc09-time-delete-restore.test.ts
```

证据默认写入 `evidence/<slug>-<时间戳>/`（run.json + 截图 + 导出文件），可用 `--evidence-dir=<绝对路径>` 指定。

## 数据隔离与安全边界

- 存量白名单 1003 条（3 条 @2026-11-19 + 1000 条 @2026-10-19）为只读基线；除 #41 经需求方裁决授权外，严禁对存量执行批量/条件删除。
- 自建测试 UID 池：`19440456`、`13365989`、`8268067`、`7446886`、`7433600`、`7423160`、`7398493`、`7384743`。均来自测试环境 user_profile，且初始不在白名单。
- 自建数据全部通过页面「添加用户」构造、页面删除清理；每个用例使用独立浏览器上下文（重新登录）保证隔离。
- #41 只针对执行当天（2026-11-19）范围执行删除并恢复；前置校验 >10 条立即阻塞停止。
- **数据事件披露**：首轮 #41 执行时，当天 3 条存量中的 `22518445`、`12811470` 在 `user_profile`/`user`/`user_config` 均无记录，删除后页面「添加用户」返回「用户id不存在」无法复活；`5519` 页面复活成功。经需求方裁决（2026-11-19 20:38，方案 A），由技术-DBA 通过定向 SQL 恢复这 2 行（保留原始 migration 元数据），恢复后 Total=1003。**此后不得再次操作这 3 行**，#41 不重复执行；详见 `RUNS.md` 与任务 TEST_REPORT。

## 目录

```text
tests/
  lib/admin-base.ts          # 登录、WAF 同源转发、截图/请求留痕、上下文隔离
  lib/game-entry-base.ts     # 筛选/日期面板/分页/添加/删除/导出 页面操作与页面读数
  tc01-entry-permission.test.ts   # #1~#3
  tc02-list-filter.test.ts        # #4~#12
  tc03-pagination.test.ts         # #13~#16
  tc04-add.test.ts                # #17~#24
  tc05-select-delete.test.ts      # #25~#30
  tc06-filter-delete.test.ts      # #31~#36
  tc07-export.test.ts             # #37~#39
  tc08-regression.test.ts         # #40
  tc09-time-delete-restore.test.ts# #41（最后执行）
COVERAGE.md                  # 用例# → 检查点 → check 标记 → 结果
RUNS.md                      # 运行记录与数据事件
```

## 判定口径说明（偏差记录，不判缺陷）

按需求方裁决「需求文档为最高标准；需求文档未提及的全新问题保留现状」：

- **D-09 添加结果展示形式**：成功路径为 Toast「成功添加 N 个用户」；有失败时为「添加结果 成功 x 个，失败 y 个。原因…」弹窗；页面不展示「总计」字段。用例 #18/#19/#20/#21/#22/#23/#24 的检查点按页面实际展示的成功/失败数量核对，偏差在 COVERAGE/TEST_REPORT 列明。
- **D-10 条件删除确认文案**：实际为「确定删除{UID/时间范围}的全部 N 个用户吗？只会删除符合该筛选条件的用户。」，未包含用例预期的「将删除当前筛选条件下全部有效白名单」原文，语义一致。用例 #32/#33/#36/#41 的检查点按实际文案核对并在报告中披露。
