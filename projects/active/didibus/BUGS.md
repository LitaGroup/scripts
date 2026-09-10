# didibus-v202609 BUG 跟踪

> 测试环境（api.test.cinta.team），服务端 v1.5.0，2026-09-09 实测。
> 触发方式：`POST active/v3/__cron`（l-debug-timestamp 指定北京时间：ko=23:05 / ph=00:05 / in+vi=01:05）。
> 修复后复跑验证：`node projects/active/didibus/tests/009-daily-settle.test.ts` / `010-total-settle.test.ts`。

## 待修复

### BUG-3 收礼榜贡献者奖励（AWARD_CONTRIBUTORS）未发放

- **影响用例**：010「收礼贡献者发奖」check
- **需求口径**（2026-09-09 确认）：**仅收礼总榜有贡献者奖励**——收礼 Top3 各自的贡献 Top1 获奖（送礼榜无贡献者概念）。
- **现象**：收礼总榜 Top3（B/A/C）的 `gift-recv` 奖励已正常发放，但三人各自的贡献 Top1（S1/S2/S4）的 `gift-recv-contributor` 奖励**完全无发放记录**。
- **证据**：`mod_common_award_record` 中无任何贡献者奖励行；造数已确认 `mod_common_rank_record` 含 contributor 字段：

```
B(收礼1000) ← 贡献 Top1 = S1(500)   期望 gift-recv-contributor stage=1（MICBOX 14328）  实际无
A(收礼650)  ← 贡献 Top1 = S2(600)   期望 stage=2（MICBOX 14327）                        实际无
C(收礼500)  ← 贡献 Top1 = S4(400)   期望 stage=3（BUBBLE 984）                          实际无
```

配置侧已核对：`gift-recv-contributor` stage=1/2/3 预置齐全；`AWARD_CONTRIBUTORS` 策略配置（contributorFromRank=1/ToRank=1、playerFromRank=1/ToRank=3）正确。

- **备注**：`mod_common_rank_result` 已废弃（见下方已关闭项），贡献者结算应从 `mod_common_rank_record`/Redis 取数，与该表无关。

## 已关闭（非 bug）

- ~~BUG-1 结算结果未写入 mod_common_rank_result~~（2026-09-09 确认）：`mod_common_rank_result` **表已废弃**，结算结果不再落库；结算状态以 `mod_common_round.status`=200 为准，结算正确性由发奖记录断言。009/010 用例已改为轮次状态位+发奖记录校验。

## 已修复（2026-09-10 复测转绿）

| 问题 | 说明 | 验证 |
|---|---|---|
| BUG-2 总榜（mainRound）结算发奖双倍 | 单次 cron 触发内同一玩家每个奖励产生 2 条 `mod_common_award_record`（日榜无此问题）→ 已修 | 010 送礼/收礼发奖 check ✅：S1=[4110,14328]、S4=[4109]、S2 view_only 恰好 1 条、收礼 Top3 各 1 条，全场 9 条无重复 |

## 已修复（2026-09-09 复测转绿）

| 问题 | 说明 | 验证 |
|---|---|---|
| 送礼消息券入账无幂等 | 同 orderNo 重发重复发券 → v1.5.0 mod_account（trans_no=send_/recv_+orderNo 唯一键幂等） | 003#12 ✅ |
| 期外送礼消息仍发券 | 框架 ±7d 宽限内消息到达业务层后 incr 无时间校验 → 已修 | 003#14 ✅ |
| 榜单加成时机/口径错误 | 需求口径：赠送时按 `金币数×buff` 计分，探索获得仅入背包；实现原在探索时加分且未乘倍率 → 已修 | 003#10、004#16 ✅ |

> 更早的已解决问题（配置时间口径、预置数据缺失、轮次初始化路径等）见 CASES.md「已发现问题跟踪」。
