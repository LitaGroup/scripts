# active/pk 赛事 PK 测试用例

本目录包含六周年 PK（`pk-v202608`）与 2612 年度 PK（`pk-v202612`）的测试脚本。

## 目录

| 文件 | 说明 |
|---|---|
| `family-001-init.test.ts` ~ `family-007-10-1.test.ts` | 六周年家族榜结算链路用例（`pk-ai-test` 测试 biz，历史用例） |
| `player-001-init.test.ts` | 六周年陪陪榜初始化轮次用例（历史用例） |
| `pk2612-001-config.test.ts` | 2612 配置与路由：完整 biz / alias / 时间 / 大区 / 旧 biz 隔离 |
| `pk2612-002-schedule.test.ts` | 2612 17 天赛程与 32 个 module 的主轮次、日榜、1V1 轮次 |
| `pk2612-003-awards.test.ts` | 2612 奖励配置（512/470/42）、awardName 引用完整性、关键名次内容、发放对象 |
| `pk2612-004-gift-buff.test.ts` | 2612 活动礼物展示与 giftBuffs 计分行为 |
| `pk2612-005-winner-buff.test.ts` | 2612 PK 获胜 Buff（当前 1V1 阶段胜场 → 下一阶段 Buff） |
| `pk2612-006-old-biz.test.ts` | 六周年 pk-v202608 回归（新旧活动数据隔离） |
| `pk2612-007-schedule-db.test.ts` | 2612 赛程轮次只读 SQL 辅助校验 |
| `pk2612-008-alias-api.test.ts` | 2612 alias `/active/v3/pk/**` 接口与完整 biz 一致性 |
| `_lib/pk2612.ts` | 2612 公共常量、轮次期望、礼物/榜单/只读 SQL 辅助方法 |

## 运行方式

依赖 Node.js 24+ 与测试环境配置（`config.json`）：

- `userToken`：测试环境 `admin-ai/v1/query/execute` 只读查询令牌（奖励配置类断言使用）。
- 2612 用例默认只读：通过接口初始化轮次、送礼、查榜，不直连 MySQL 写入。
- 六周年 family/player 历史用例仍依赖 `config.json` 的 `mysql` / `redis` 配置。

```bash
node projects/active/pk/tests/pk2612-001-config.test.ts
node projects/active/pk/tests/pk2612-002-schedule.test.ts
node projects/active/pk/tests/pk2612-003-awards.test.ts
node projects/active/pk/tests/pk2612-004-gift-buff.test.ts
node projects/active/pk/tests/pk2612-005-winner-buff.test.ts
node projects/active/pk/tests/pk2612-006-old-biz.test.ts
node projects/active/pk/tests/pk2612-007-schedule-db.test.ts
node projects/active/pk/tests/pk2612-008-alias-api.test.ts
```

## 2612 用例口径

- 需求来源：文档 3458《【2026年度盛典】赛事PK》、文档 3459 奖励配置表、文档 3452 需求澄清。
- 技术方案：TK-0607 `TECH_DESIGN` v15（`pk-v202612` 纯配置复用，Java 零修改）。
- 活动时间：2026-12-17 11:00 至 2027-01-02 23:59:59（UTC+8）；日榜/阶段按本地时间。
- 大区：in / vi / ph / ko（不含 ar）。
- 赛程（需求方 2026-11-25 确认以 3458 赛事表为准）：
  - 印尼：N进200（12/17-20）→ 200进100（12/21-24）→ 1V1PK100进46（12/25-28，8 场）→ 1V1PK50进20（12/29-1/1，8 场）→ 复活+4（12/29）→ 决赛（1/2）。
  - 非印尼：N进100（12/17-20）→ 100进50（12/21-24）→ 1V1PK50进20（12/25-28）→ 1V1PK24进10（12/29-1/1）→ 复活+4（12/29）→ 决赛（1/2）。
  - 房间/家族印尼：12/17-20、12/21-24、12/25-27、12/28-30、12/31、1/2；其他大区总榜；用户/CP 17 个本地日榜 + 总榜。
- 礼物：Q22 正式数值未提供前，按需求澄清兜底沿用六周年 `giftBuffs`。
- 奖励（需求方 2026-11-25 确认）：470 ADD / 42 VIEW / 512 行；保留 7 条 `EVENT=14` 通票奖励，不配置 `room-contributor`。

## 说明

- 2612 用例使用 `l-debug-timestamp` 模拟活动期业务时间，不修改测试环境真实时间。
- `pk2612-002` 会调用各 module 的 `init` 事件创建轮次（幂等，重复 key 被忽略），不会清理测试环境已有数据。
- `pk2612-004` 会通过 `__consumer/funbit.gift_send` 产生真实送礼数据（测试环境），使用固定测试用户；不写 MySQL。
- `pk2612-005` 依赖测试环境已有 1V1 胜场与下一阶段 Buff 数据；无数据时按 BLOCKED 记录，不伪造通过。
- 所有断言失败均保留请求 curl（含脱敏 Header）与响应摘要，便于复核。
