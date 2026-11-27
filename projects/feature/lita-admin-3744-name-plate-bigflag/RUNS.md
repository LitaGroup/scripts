# RUNS — TK-0768 / WO-0058 / BL-0057

运行环境：`https://admin.test.lita.game/`（测试环境）｜运行工位：opencode-agent-01｜TMPDIR=`$PWD/.tmp-playwright`。

| 时间（本地） | 脚本 / 参数 | 运行摘要 | 结果 | 证据目录 |
| --- | --- | --- | --- | --- |
| 2026-11-27 16:47:52 | `tc01-name-plate.test.ts --case=1` | 轻量自测闸门 P0 冒烟（#1） | 12/12 通过 | `evidence-selftest-case1/` |
| 2026-11-27 16:47:58 | `tc01-name-plate.test.ts --case=1`（临时改错 #1-② 期望值为「是」） | 红证抽查：确认断言非永真 | 11 通过 / 1 失败（真实 `[check]` fail：expect=是 real=否） | `evidence-redproof/`、`evidence-redproof.log` |
| 2026-11-27 16:48:06 | `tc01-name-plate.test.ts --case=1`（恢复正确期望值） | 红证恢复 | 12/12 通过 | `evidence-selftest-recover/`、`evidence-recover.log` |
| 2026-11-27 17:12:33 | `tc02-noauth.test.ts` | #11/#12 无权限族（qa-noauth） | 3/3 通过 | `evidence-noauth/` |
| 2026-11-27 17:14:18 | `tc01-name-plate.test.ts --run-id=20261127-1645` | 正式单轮 #1~#10、#13（13 条用例，71 checks） | 63 通过 / 6 失败 / 2 跳过；失败：#2 D4（脚本缺背景图，4 checks）、#9（缓存未生效，1）、#10（状态台账漏记探针行，1）；#13 阻塞 2 skip | `evidence-formal3/` |
| 2026-11-27 17:19:45 | `tc01-name-plate.test.ts --case=2,10` | 定向复跑：D4 补背景图 + #10 台账修正 | 17/19；D4 4/4 通过、#10 3/3 通过；D1/D2 因已被 #4 改值出现 2 个预期差异（非产品问题） | `evidence-d4-rerun/` |
| 2026-11-27 17:20:30 | `tc01-name-plate.test.ts --case=2` | 将 D1/D2 恢复原值后复跑 #2，确认 16/16 全通过 | 16/16 通过 | `evidence-case2-final/` |
| 2026-11-27 17:01~17:10 | `tc09-probe.test.ts`（临时诊断，非交付脚本） | 诊断 #9：硬刷新 4 轮×5s，`/api/admin/privilege` 未重新拉取、字段始终不可见；重登后可见 | 失败现象复现 | `evidence-probe9/`（临时） |

## 说明

- 正式执行采用单轮跑完；#2 D4 与 #10 的失败经五路归因均为**脚本/状态台账问题**，按规范仅对 `--case=2,10` / `--case=2` 定向复跑，保留首次失败证据。
- #9 的失败不可由脚本修复解释：#7 已证明重新登录后授权可见；不重登时页面未重新请求权限接口，等待 168s 仍不生效。归因为技术方案「约 120 秒缓存」假设未复现，作用例问题反馈，未提交产品缺陷。
- #13 无法构造「仅字段 key、无页面节点」状态：权限树父节点半选仍被 `updateRole` 一并提交（`name-plate-index`/`effect-manager`），菜单与直达均保留页面权限；按用例约定记阻塞/未覆盖。
- 专用角色/账号已在正式执行结束删除；自建铭牌无删除入口，按 `qa_bigflag_` 前缀隔离保留，明细见 TEST_REPORT。
