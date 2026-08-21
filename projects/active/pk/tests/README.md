# active/pk 家族榜测试用例

测试环境（test）用例，移植自 `lita/tests/cases/active/pk/cases/family-*`。

## 运行方式

依赖 test 环境配置（`config.json` 的 `mysql` / `redis` 块，见 `config.example.json`）。

按依赖顺序执行（后一个依赖前一个结算生成的 `mod_common_player_list` 白名单）：

```bash
node projects/active/pk/tests/family-001-init.test.ts
node projects/active/pk/tests/family-002-n-200.test.ts
node projects/active/pk/tests/family-003-200-100.test.ts
node projects/active/pk/tests/family-004-100-50.test.ts
node projects/active/pk/tests/family-005-50-20.test.ts
node projects/active/pk/tests/family-006-20-10.test.ts
node projects/active/pk/tests/family-007-10-1.test.ts
```

## 用例说明

| 用例 | 赛段 | 校验点 |
|---|---|---|
| family-001-init | family-init 初始化 | mod_common_round 配置（非 in 大区总榜 / in 大区 6 个分赛段的时间与状态） |
| family-002-n-200 | 海选赛 | 白名单、成员发奖（NAMEPLATE）、LitaTeam 晋级通知 |
| family-003-200-100 | 200进100 | init 初始化积分、白名单、成员发奖、LitaTeam 晋级通知 |
| family-004-100-50 | 100进50 | init、白名单、成员+家族本体发奖、LitaTeam 晋级通知 |
| family-005-50-20 | 50进20 | init、白名单、成员+家族本体发奖、LitaTeam 晋级通知 |
| family-006-20-10 | 20进10 | init、白名单、成员+家族本体发奖、LitaTeam 晋级通知 |
| family-007-10-1 | 决赛 | init、白名单、家族本体发奖（3 道具）、LitaTeam 决赛结果（rank1 / rank2-3） |

## 说明

- 结算走 `POST active/v3/pk-ai-test/p/family-settle`（provider 端点，非 `__cron`）。
- 每个用例会清理对应 topic 的历史 round / 白名单 / 奖励记录与排行榜 Redis key，可重复执行。
- 送礼通过 `__consumer/funbit.gift_send` 模拟，每家族 10 次，礼物 ID 随机（含 2 倍 buff 礼物）。
