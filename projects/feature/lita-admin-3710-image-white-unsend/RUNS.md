# RUNS — 项目 3710 图片白名单 + 聊天记录 Unsend（TK-0335）

执行机：Linux，Node v24.22.1，Playwright 1.64.1（Chromium headless），时区 Asia/Shanghai。
环境：UI `https://admin.test.lita.game`（非生产）；接口同源入口 `https://funbit-mgr.test.cinta.team`；只读 SQL 经 `https://api.test.cinta.team/admin-ai/v1/query/execute`（test）。
账号：qa-ai（有权限，常规用例）；qa-noauth（无权限专用，用例 17 / NU-01）。口令与令牌仅运行时注入，本记录不含明文。

## 0. 部署与版本核查（2026-11-18 23:27 CST）

| 项 | 实测 | 结论 |
| --- | --- | --- |
| 前端入口 JS | `static/index-b99157df.js` | 本轮实际运行构建 |
| 入口 HTML Last-Modified | `Wed, 18 Nov 2026 07:23:05 GMT`（CST 15:23:05） | 早于本轮执行，执行期间未再部署 |
| 后端健康 | `GET /funbit/health` → `i'm ok` | 可用 |
| 聊天记录 chunk | `static/player-conver-4dea7ec9.js`（入口引用） | 含四项 Message type（Auto Greeting/Group Messaging/Normal/Unsend） |
| 图片白名单 chunk | 入口引用的 `index-*.js` 页面 chunk（含 `/api/userImageWhite/{list,addList,delete}`） | 页面功能可用 |
| 提测 | 项目 3710 提测 #46，2026-11-18 23:27:37 置「进行中」 | 沿用既有提测，不新建 |

## 1. 自测与脚本修复记录

| 时间（CST） | 范围 | 结果 | 说明 / 证据 |
| --- | --- | --- | --- |
| 23:00 | `CASES=1,6` | 18 步全部通过 | 入口 + BD-04R 页面构造 Locale 为空行 |
| 23:01 | 权限脚本 | 首次 8/9：#17-② 读取 `.app-main` 文本为空导致 OOPS 未取到；改为读取 `document.body.innerText` 后 9/9 通过 | 仅修正取证选择器，未改判定口径 |
| 23:01 | `CASES=21,23,24` | 25 步全部通过 | BD-14 动态基线 + 动态日期 |
| 23:02 | `CASES=19,20,25` | 9 步全部通过（阻塞取证） | 页面 No Data + SQL 对照 |
| 23:03 | `CASES=2,3,4,5,11,12,13,14,15,16,18,22` | 85 步 84 成功 / 1 失败 | #15-③ 读取的是筛选态 total=0；修正为在标签页 B 重置筛选并等待默认列表渲染后读取，重跑 15/15 通过 |
| 23:03 | `CASES=15`（修复后） | 15 步全部通过 | 默认列表 total=8 |
| 23:03 | `CASES=7,8` | 34 步全部通过 | 分页 T=29、批量分隔符 4 数据行 |
| 23:09 | `CASES=9,10` | 16 步全部通过 | 500 行新增与清理（约 7.8 分钟）、501 拦截 |
| 23:14 | `CASES=26,27,28` | 29 步全部通过 | Reset 后补 Search，会话白名单 17 行不变 |
| 23:16 | 全量自测 | 181 步 / 90 check 全部通过 | `evidence/lita-admin-3710-image-white-unsend-20261118-*`（自测目录） |

脚本类修复（均未改期望值、未放宽断言）：

1. `BD-04R`：由「等待存量资料缺失行」改为页面添加无 `user_config` 的真实用户（只读 SQL 仅作样本筛选/就绪确认）。
2. `#15-③`：默认列表总数改为标签页 B 重置筛选并等待默认列表渲染后读取（原读取筛选态 total=0，属取证路径错误）。
3. `#17-②`：404 页 OOPS 文本改为读取 `document.body.innerText`（原 `.app-main` 在该页为空）。
4. `#21`：BD-14 样本与 K 值改为执行日只读基线；D3 取 `player 1460` 最近 14 天 BATCH_SEND 窗口。
5. 每个用例补充结果截图（不改变检查点数量）。

## 2. 红证抽查（P0）

| 时间（CST） | 目标 | 操作 | 结果 | 日志 |
| --- | --- | --- | --- | --- |
| 23:20 | P0 `用例#1-① 路由` | 临时副本 `_redproof.test.ts` 将期望改为 `#/user-manager/user-image-white-REDPROOF`，仅运行 #1 | `[check] 用例#1-① ... expect:"...-REDPROOF" real:"#/user-manager/user-image-white" status:"fail"`；10 步 9 成功 / 1 失败 | `/tmp/opencode/tk335/redproof-fail.log` |
| 23:21 | 恢复 | 删除临时副本，原脚本仅运行 #1 | `用例#1-① status:"success"`；10 步 10 成功 | `/tmp/opencode/tk335/redproof-restored.log` |

临时副本已删除，仓库 `tests/` 仅保留两个正式脚本，未提交任何改错版本。

## 3. 正式执行

| 轮次 | 时间（CST） | 命令 | 覆盖 | 结果 | 证据目录 |
| --- | --- | --- | --- | --- | --- |
| 正式-主脚本（第 1 次） | 23:27:37~23:38:56 | 全量 `node image-white-unsend.test.ts` | 25 条可代码化用例 + 19/20/25 阻塞取证；181 步 / 90 check | **90/90 通过**，0 fail / 0 skip | `/tmp/opencode/tk335/evidence/formal-main/` |
| 正式-权限脚本 | 23:39 | `node image-white-permission.test.ts` | #17 + NU-01 | **9/9 通过**（#17 3/3；NU-01 3/3） | `/tmp/opencode/tk335/evidence/formal-permission/` |
| 正式-主脚本（第 2 次，补结果截图） | 23:45:57~23:57:12 | 全量 `node image-white-unsend.test.ts --evidence-dir=.../formal-main2` | 181 步 / 90 check / 42 张截图 | **90/90 通过**，0 fail / 0 skip | `/tmp/opencode/tk335/evidence/formal-main2/` |

- 第 2 次正式执行的唯一目的是补齐每个用例的结果截图（脚本仅新增 `shot()`，未改任何断言）；两次结果一致，均保留。报告采用第 2 次证据，第 1 次原样保留可复核。
- 页面请求/响应、console error、requestfailed 均写入各证据目录 `run.json`；token 已由基类 `maskSensitive` 脱敏。
- 未发生断言失败后的重试；未发生基础设施中断重跑。

### 3.1 检查点数核对

| 用例# | check 数 | 用例# | check 数 |
| --- | --- | --- | --- |
| 1 | 3 | 13 | 3 |
| 2 | 3 | 14 | 3 |
| 3（D1/D2） | 6 | 15 | 3 |
| 4（D1/D2） | 6 | 16 | 2 |
| 5 | 3 | 18 | 3 |
| 6 | 3（M1 不存在，附加行跳过） | 21（D1/D2/D3） | 9 |
| 7 | 4 | 22 | 2 |
| 8（D1~D4） | 12 | 23 | 2 |
| 9 | 3 | 24 | 2 |
| 10 | 3 | 26 | 3 |
| 11 | 3 | 27 | 3 |
| 12 | 3 | 28 | 3 |

主脚本合计 90 check；权限脚本 #17 3 check + NU-01 3 项非 UI 核验；19/20/25 无 check（阻塞取证）。

## 4. UNSEND 数据缺口与 BD-13R 构造尝试（2026-11-18 23:39 CST）

| 项 | 实测 |
| --- | --- |
| `player_message.biz='UNSEND'` | **0 行**（stats，test） |
| `im_message.status=6` | 65 行（当日 48）；含 player 13285 会话撤回 |
| 已复制撤回行 | 样本 message_id `-P6iGzPOoVai7vOUsVTV` 的 `player_message.biz` = null |
| Admin 页面 | player 13285 + Unsend + 2026-11-05~11-18 → **No Data**；接口 `data=[]` |
| C 端撤回接口直连 | `POST https://m-api.test.lita.game/improxy/revokeMessage` → **403 Access Denied**（WAF） |
| 同源转发入口 | `POST https://funbit-mgr.test.cinta.team/improxy/revokeMessage` → HTTP 200、空响应体（非 3709 接口） |
| C 端账号 | 未提供普通用户 U / 陪玩师 P 的 C 端登录态；`LITA_USER_TOKEN` 为平台数据查询令牌，不能用于 C 端发送/撤回 |

结论：BD-13R 第 1~3 步（登录 U → 发送文本/图片/语音 → 2 分钟内撤回）在当前网络与凭证条件下不可执行；即使 3709 侧已产生 `status=6` 撤回，`player_message.biz` 仍未回写 `UNSEND`，Admin 数据源无行。19/20/25 按数据缺口阻塞上报，不以空结果通过。证据见 `EVIDENCE.md` 的 E-19/20/25 与 BD-13R 日志。

## 5. 数据清理

| 项 | 执行前 | 执行后 | 证据 |
| --- | --- | --- | --- |
| `user_image_white` 总行数 | 8（均为 liyang 存量） | **8** | 只读 SQL；`op_user='qa-ai'` = 0 |
| 本轮图片白名单新增行 | 0 | 全部页面删除 | `run.json` 各用例清理日志（2/21/3×4/500/2/1/0 等） |
| `user_im_white` 总行数 | 17 | **17**；测试用户 S 不存在 | 只读 SQL；#26-③/#27/#28 历史集合不变 |
| UNSEND 数据 | 0 | 0（未造数，未写库） | 只读 SQL |
| 权限 | qa-ai 已具备；qa-noauth 未开任何权限 | 未变更 | #17 菜单不可见、直达 #/404 |
| 账号/角色 | 未新建/未删除 | 无残留 | — |

- 造数全部为页面级（图片白名单添加/删除、会话限制白名单新增/删除）；只读 SQL 仅用于样本筛选、K 值基线、就绪确认与清理核对；未执行任何 INSERT/UPDATE/DELETE/DDL。
- 撤回消息无法通过 Admin 删除（聊天记录为纯查询页），未写库恢复，现状如实保留为 0 行 UNSEND。

## 6. FLAKY 风险

无。两次正式执行均为 0 失败；无「重试才通过」的用例。第 2 次正式执行仅补截图，不构成 FLAKY。

## 7. 遗留与待支持

1. 19/20/25：缺 `player_message.biz='UNSEND'` 行；需 3709/IM 侧按 FEATURES 20 契约在撤回成功时回写（或需求方对齐 3417/3406 判定口径）；同时需要可访问的 C 端发送/撤回通道（当前 m-api 被 WAF 403）。
2. 用例 6 附加行 M1（NO/Nick 缺失存量行）当前环境不存在，按用例口径跳过；主判定已通过。
3. 用例 21 D3（Group Messaging）使用 player 1460 的最近 14 天 BATCH_SEND 窗口（2026-07-23~08-06），因当前 14 天窗口内无该类型数据；已在 BD-14 记录时间范围。
