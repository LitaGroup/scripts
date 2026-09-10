# didibus-v202609 BUG 跟踪

> 测试环境（api.test.cinta.team），服务端 v1.5.0，2026-09-09 实测。
> 触发方式：`POST active/v3/__cron`（l-debug-timestamp 指定北京时间：ko=23:05 / ph=00:05 / in+vi=01:05）。
> 修复后复跑验证：`node projects/active/didibus/tests/009-daily-settle.test.ts` / `010-total-settle.test.ts`。

## 待修复

### BUG-4 收礼贡献者结算跨大区串数据（贡献 Top1 发错人 + 同一人重复发奖）

- **影响用例**：010「大区隔离：ko 收礼贡献 Top1 奖励发给 ko 本地贡献者」check
- **现象**：ko 大区收礼总榜 Top1 是 B（ko 本地仅 S6 贡献 100），但 ko 结算时贡献者奖励（gift-recv-contributor stage1=14328）发给了 **S1**——S1 是 **in 大区** B 的贡献 Top1（500），在 ko 无任何送礼。随后 in 结算又给 S1 正常发了一次 → **S1 累计得 2 次 stage1 贡献奖励，ko 本地贡献者 S6 一次未得**。
- **证据**（010 真实 gift_send 造数：in `S1→B 500 / S2→B 300 / S3→B 200`，ko `S6→B 100`）：

```
-- ko 结算批（北京 10-02 23:05 触发）：
player=13128(S1) topic=gift-recv award_id=14328  ← 错！应为 ko 本地贡献 Top1 S6(13133)
-- in 结算批（北京 10-03 01:05 触发）：
player=13128(S1) topic=gift-recv award_id=14328  ← in 的正确发放（第 2 次，重复）
player=13129(S2) topic=gift-recv award_id=14327  ← stage2 ✓
player=13131(S4) topic=gift-recv award_id=984    ← stage3 ✓
-- S6 的 gift-recv 记录：0 条
```

- **推断**：贡献者聚合未按 locale 隔离——按收礼玩家 B 全局取贡献 Top1（S1 总分 500 > S6 的 100），导致 ko 发错人；且贡献者奖励无 (玩家×stage) 级幂等，同一贡献者被多个大区重复发放。

## 已关闭（非 bug）

- ~~BUG-1 结算结果未写入 mod_common_rank_result~~（2026-09-09 确认）：`mod_common_rank_result` **表已废弃**，结算结果不再落库；结算状态以 `mod_common_round.status`=200 为准，结算正确性由发奖记录断言。009/010 用例已改为轮次状态位+发奖记录校验。
- ~~BUG-3 收礼榜贡献者奖励未发放~~（2026-09-10 确认为**造数问题**）：直写 `mod_common_rank_record` 不驱动贡献者结算；010 造数改为**真实 gift_send 消息链路**后贡献者奖励正常发放（S1/S2/S4 按 stage=1/2/3 各得 14328/14327/984 ✓）。真实链路下暴露出新的跨大区问题，见 BUG-4。

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
