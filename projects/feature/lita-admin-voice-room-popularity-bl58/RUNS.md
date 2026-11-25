# BL-0058 房间人气推荐设置 — RUNS

- 执行任务：TK-0687；环境：`https://admin.test.lita.game`（非生产）
- 账号：`qa-ai`（常规）/ `qa-noauth`（无权限专用，未开权）；密码仅运行时注入
- 部署基线：前端 `static/index-7fed8e8c.js`；入口 HTML Last-Modified `2026-11-25 12:08:52 GMT`；列表 Total=159
- 检查点总数：97（COVERAGE 双向核对）

## 1. 轻量自测闸门（2026-11-25 23:13~23:31 CST）

| 时间 | 脚本 / 范围 | 命令要点 | 结果 | 证据目录 |
|---|---|---|---|---|
| 23:13 | tc01 `--case=1` | `--case=1` | 3/3 通过；发现 `#1-①` 缺 `pass` 导致误判，已修正 | `workfiles/run-tc01-c1`、`run-tc01-c1b` |
| 23:15 | tc02 `--case=13` | `--case=13` | 3/3 通过 | `workfiles/run-tc02-c13` |
| 23:16 | tc02 `--case=14,15,16,17` | 4 条 | 12/13；`#15-②` 字段集合断言过严（弹窗态无「推荐说明」label），按检查点语义修正为「必含四字段+仅允许白名单+无禁用字段」；`#15` 复跑 4/4 通过 | `workfiles/run-tc02-rest`、`run-tc02-c15b` |
| 23:17 | tc03 全量 | 5 条 | 11/11 通过 | `workfiles/run-tc03` |
| 23:18 | tc04 全量 | 3 条 | 8/8 通过 | `workfiles/run-tc04` |
| 23:19 | tc05 全量 | 2 条 | 7/7 通过 | `workfiles/run-tc05` |
| 23:19 | tc06 全量 | 4 条 | 15/18；`#27c-①`（类型错误缺行号）、`#27f-①`（不存在房间被导入）、`#27f-②`（整表落库）失败，保留为产品缺陷证据 | `workfiles/run-tc06` |
| 23:29 | tc06 `--case=28,29` | 2 条 | 4/4 通过（修正 Total 读取为默认列表口径） | `workfiles/run-tc06-c2829` |
| 23:22 | tc07 全量 | 4 条 | 6/7；`#32-②` 的 N 误用造数前总数，修正为「含目标行时 N」；复跑 7/7 通过 | `workfiles/run-tc07`、`run-tc07c` |
| 23:26 | tc08 全量 | 2 条 | 3/3 通过 | `workfiles/run-tc08` |
| 23:30 | tc01 全量 | 12 条 | 43/44；`#2-r3` 断言「恰 1 行」未计入共享基准 B3（B3 同为房间+用户 23）；按检查点①「组合列值精确匹配」修正并记录「印尼存量 1 行 + 基准 B3 1 行」；`--case=2` 复跑 4/4 通过 | `workfiles/run-tc01-full`、`run-tc01-c2` |

## 2. 红证抽查（P0 `用例#1`，真实 `[check]` 失败 → 恢复通过）

- 临时把 `#1-①` 期望 USER ID 改为 24：
  - `[check] 用例#1-① USER ID 列每一行均显示 23` → `status=fail`，`expect=每一行 USER ID=24（红证临时改错）`，`real=共 3 行；不符合 3 行：23,23,23`
  - 日志：`workfiles/run-red/fail.log`；证据：`workfiles/run-red/fail`
- 恢复期望 23 后 `--case=1` 复跑：
  - `[check] 用例#1-①` → `status=success`，`real=共 3 行；不符合 0 行`
  - 日志：`workfiles/run-red/pass.log`；证据：`workfiles/run-red/pass2`

## 3. 正式执行（单轮，2026-11-25 23:32:33~23:38:50 CST）

- 总耗时：约 6 分 17 秒（不含证据整理与缺陷提交）。
- 并发策略：只读/无写入用例 3 路安全并发；写删/导入用例按独立实体顺序执行，避免唯一键与 Total 计数互相干扰。
- 会话：tc01 首次真实 UI 登录并保存 qa-ai storageState；后续文件 `REUSE_STATE=1` 复用同一会话；tc08 使用 qa-noauth 独立登录（未开权）。

| Lane | 脚本 / 范围 | 开始 | 结束 | 步数 / check | 结果 | 证据目录 |
|---|---|---|---|---|---|---|
| A | tc01 #1~#12 | 23:32:33 | 23:33:32 | 44 步 / 27 checks | 27/27 通过 | `workfiles/formal/ev-tc01` |
| B1 | tc03 #18~#22 | 23:33:36 | 23:34:14 | 21 步 / 11 checks | 11/11 通过 | `workfiles/formal/ev-tc03` |
| B2 | tc04 #23/#30/#31 | 23:33:36 | 23:34:14 | 12 步 / 8 checks | 8/8 通过 | `workfiles/formal/ev-tc04` |
| B3 | tc08 #36~#37（qa-noauth） | 23:33:36 | 23:34:14 | 6 步 / 3 checks | 3/3 通过 | `workfiles/formal/ev-tc08` |
| C | tc02 #13~#17 | 23:34:17 | 23:35:31 | 36 步 / 16 checks | 16/16 通过 | `workfiles/formal/ev-tc02` |
| D | tc05 #24~#25 | 23:35:34 | 23:36:08 | 14 步 / 7 checks | 7/7 通过 | `workfiles/formal/ev-tc05` |
| E | tc06 #26~#29 | 23:36:10 | 23:37:59 | 28 步 / 18 checks | 15/18 通过；3 失败（#27c-①、#27f-①、#27f-②） | `workfiles/formal/ev-tc06` |
| F | tc07 #32~#35 | 23:38:02 | 23:38:50 | 22 步 / 7 checks | 7/7 通过 | `workfiles/formal/ev-tc07` |

### 四态汇总

- 用例总数 37；通过 36、未通过 1（#27）、阻塞 0、未执行 0。
- 执行率 =（36+1）/37 = **100%**；通过率 = 36/（36+1）= **97.30%**。
- 检查点：97 个；通过 94、失败 3（#27c-①、#27f-①、#27f-②）。
- FLAKY：0（正式执行无基础设施抖动重跑）。
- 产品缺陷：2 条（419 高/后端、420 中/后端），均开放，未关联提测。

## 4. 数据清理核对（2026-11-25 23:40 CST）

- 默认列表 Total=**159**，与执行前基线一致。
- 8 个语言区逐区筛选：`qa-ai` 自建行 = **0**（印尼/越南/泰国/英语/阿拉伯/中文/韩国/菲律宾）。
- `ROOM ID=999999999` 查询：**0 行**（#27f 异常落库行已兜底清理）。
- `USER ID=23` 查询：仅存量 id=325（印尼/10100001/侧边推荐/权重 1000/操作人 zhangjinyu），未被修改。
- 审计证据：`workfiles/audit-final/audit.json`、`audit-console.log`。


---

## 2026-11-26 TK-0693 缺陷 419/420 修复后定向回归

- 模式：定向回归，仅 tc04（#23/#30/#31）、tc05（#24/#25）、tc06（#26~#29）；脚本沿用 commit `b439708`，零改动。
- 环境：`https://admin.test.lita.game`；账号 qa-ai 真实 UI 登录 1 次，tc05/tc06 复用 30 分钟内 storageState。

| 时间（CST） | 运行 | 结果 | 证据 |
|---|---|---|---|
| 00:09:32 | 平台 testId 174 `tc06-excel-invalid`（run.md / MCP run_test） | **error**，76ms，`ERR_MODULE_NOT_FOUND`；运行 ID 351 → **熔断**，不再调用 | `TEST_REPORT.md` §3 |
| 00:09:46~00:10:39 | tc06 `--case=27` 预跑 | 12/12 check 通过 | `preflight/tc06-case27.log` |
| 00:10:50~00:11:43 | 红证：临时改错 #27c 期望 → `--case=27` | 11 通过 / 1 预期失败（#27c-① status=fail） | 公开日志 `338bfff5-…log` |
| 00:11:50~00:12:44 | 恢复期望 → `--case=27` | 12/12 通过（同一 check status=success） | 公开日志 `e3f5ea4e-…log` |
| 00:12:53~00:13:04 | 正式 tc04 全量 | **8/8 check 通过** | `formal/tc04/`、`formal/tc04.log` |
| 00:13:07~00:13:32 | 正式 tc05 全量 | **7/7 check 通过** | `formal/tc05/`、`formal/tc05.log` |
| 00:13:38~00:14:59 | 正式 tc06 全量 | **18/18 check 通过** | `formal/tc06/`、`formal/tc06.log` |
| 00:16 左右 | 数据审计（50/page × 4 页） | Total=159；qa-ai=0；999999999=0；USER ID=23 仅存量 id=325 | `audit/full-audit.json` |

- 合计：9 条用例 / 33 checks，**33/33 通过**；FLAKY=0；缺陷 419/420 关闭。
- 证据总包：`http://work.cinta.team/files/20261125/244a4ff9-6641-4858-a7b4-2c8069212aa2.zip`。
