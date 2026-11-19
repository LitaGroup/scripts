# 实际运行记录（TK-0391）

## 环境

| 项 | 值 |
| --- | --- |
| 执行工位 | opencode-agent-01（worker 1082） |
| 执行时间 | 2026-11-19 17:53–17:54（北京时间，UTC+8） |
| Node.js | v24.22.1 |
| 依赖 | `npm install --ignore-scripts`（scripts 仓库 package.json） |
| 被测环境 | test：`https://api.test.cinta.team` |
| 被测配置 | Nacos `lita-active/active-v3`：`annual-review-v202612.yaml`（TK-0387 发布） |
| 脚本 commit | 见 scripts 仓库 main（提交说明 `test: 新增年度回忆接口 TK-0391 需求符合性测试`） |

## 执行命令与结果

```bash
cd projects/feature/api-annual-review/tests
node 001-contract.test.ts          # exit=0
node 002-auth-locale.test.ts       # exit=0
node 003-time-window.test.ts       # exit=0
node 004-config-regression.test.ts # exit=0
node 005-empty-edge.test.ts        # exit=0
node 006-prd-coverage.test.ts      # exit=0
```

| 脚本 | total | success | fail | skip | 耗时（ms） | done.status |
| --- | --- | --- | --- | --- | --- | --- |
| 001-contract.test.ts | 12 | 12 | 0 | 0 | 136 | success |
| 002-auth-locale.test.ts | 9 | 9 | 0 | 0 | 223 | success |
| 003-time-window.test.ts | 10 | 10 | 0 | 0 | 1561 | success |
| 004-config-regression.test.ts | 9 | 9 | 0 | 0 | 379 | success |
| 005-empty-edge.test.ts | 6 | 6 | 0 | 0 | 306 | success |
| 006-prd-coverage.test.ts | 26 | 25 | 0 | 1 | 162 | success |
| **合计** | **72** | **71** | **0** | **1** | — | — |

跳过项：`API-ANNIV-054-② 拍拍关系类型仅取 PRD 定义的五种` —— 抽查用户（8/11/14/21/28）宽表中 `*_relation_*` 全为 NULL，无样本可断言；关系取值口径由数据测试任务 TK-0379 覆盖。

## 红证抽查（P0 断言有效性）

| 项 | 内容 |
| --- | --- |
| 对象 | `001-contract.test.ts` / 用例#API-ANNIV-001-①（完整路径主流程） |
| 操作 | 临时把预期条件 `status=0` 改为 `status=99`，其余不变 |
| 结果 | 该 check 输出 `status=fail`，`[done].fail=1`，其余 11 条仍 success |
| 恢复 | 已还原脚本并重跑，`[done] success=12 fail=0` |
| 结论 | 断言可真实失败，不存在「恒真断言」 |

## 说明

- 每次请求均在 stdout 记录：Method、完整 URL、脱敏 Header、Body、HTTP 状态、脱敏完整响应体（`nick`/`avatar`/`name` 以 `***` 脱敏）、耗时。
- 无 mock、无重试到通过、无放宽断言。
- 未执行写操作、未造数、未清理（只读查询）。
