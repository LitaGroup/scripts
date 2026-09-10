# didibus-v202609 BUG 跟踪

> 测试环境（api.test.cinta.team），服务端 v1.5.0，2026-09-09 实测。
> 触发方式：`POST active/v3/__cron`（l-debug-timestamp 指定北京时间：ko=23:05 / ph=00:05 / in+vi=01:05）。
> 修复后复跑验证：`node projects/active/didibus/tests/009-daily-settle.test.ts` / `010-total-settle.test.ts`。

## 待修复

### BUG-1 结算结果未写入 mod_common_rank_result

- **影响用例**：009#7/9/11/12/18、010#8/12/14
- **现象**：日榜/总榜 cron 结算后，发奖正常执行、`mod_common_round.status` 已置 200（已结算），但 `mod_common_rank_result` **一条记录都没有**。
- **证据**：

```sql
-- 009 日榜结算（ko/ph/in+vi 三轮触发）+ 010 总榜结算（三轮触发）后：
SELECT * FROM mod_common_rank_result WHERE biz='didibus-v202609';  -- 0 行
SELECT topic, locale, `key`, status FROM mod_common_round
 WHERE biz='didibus-v202609' AND topic='gift-send' AND `key`='20260923';
-- 4 大区全部 status=200（已结算），且 Top6 奖励已正确发放
```

- **期望**：按技术设计 10.5/10.6，结算时应写入 `mod_common_rank_result`（TopN 快照），否则结算结果无审计与展示数据源。

### BUG-2 总榜（mainRound）结算发奖双倍 ⚠️ 线上会重复发奖，优先处理

- **影响用例**：010#13
- **现象**：单次 cron 触发内，同一玩家的每个奖励产生 **2 条** `mod_common_award_record`（create_time 相同、order_no 相邻），Top1 的 view_only 审计记录同样 ×2。**日榜（timeRound）结算无此问题**（009 发奖数量精确正确）。
- **证据**（010 总榜结算，in 大区，触发时间 北京 10-03 01:05）：

```
topic=gift-send  player=13129(Top1)  award_id=-1     mod=view_only  ×2  ← 审计记录双倍
topic=gift-send  player=13128(Top2)  award_id=4110   mod=add        ×2  ← 头像框发 2 个
topic=gift-send  player=13128(Top2)  award_id=14328  mod=add        ×2  ← 麦位框发 2 个
topic=gift-send  player=13131(Top3)  award_id=4109   mod=add        ×2
topic=gift-recv  player=13125(Top1)  award_id=-1     mod=view_only  ×2
topic=gift-recv  player=13126(Top2)  award_id=4110   mod=add        ×2
topic=gift-recv  player=13127(Top3)  award_id=4109   mod=add        ×2
```

ko 触发（北京 10-02 23:05）的 ko 大区结算同样双倍 → 非时区问题，疑似 mainRound settles 的发奖循环执行了两遍（timeRound 日榜结算路径正常）。

### BUG-3 收礼榜贡献者奖励（AWARD_CONTRIBUTORS）未发放

- **影响用例**：010#15
- **需求口径**（2026-09-09 确认）：**仅收礼总榜有贡献者奖励**——收礼 Top3 各自的贡献 Top1 获奖（送礼榜无贡献者概念）。
- **现象**：收礼总榜 Top3（B/A/C）的 `gift-recv` 奖励已正常发放，但三人各自的贡献 Top1（S1/S2/S4）的 `gift-recv-contributor` 奖励**完全无发放记录**。
- **证据**：`mod_common_award_record` 中无任何贡献者奖励行；造数已确认 `mod_common_rank_record` 含 contributor 字段：

```
B(收礼1000) ← 贡献 Top1 = S1(500)   期望 gift-recv-contributor stage=1（MICBOX 14328）  实际无
A(收礼650)  ← 贡献 Top1 = S2(600)   期望 stage=2（MICBOX 14327）                        实际无
C(收礼500)  ← 贡献 Top1 = S4(400)   期望 stage=3（BUBBLE 984）                          实际无
```

配置侧已核对：`gift-recv-contributor` stage=1/2/3 预置齐全；`AWARD_CONTRIBUTORS` 策略配置（contributorFromRank=1/ToRank=1、playerFromRank=1/ToRank=3）正确。

- **备注**：可能与 BUG-1 同源——若贡献者结算依赖 `mod_common_rank_result` 快照，则会被其缺失阻断。

## 已修复（2026-09-09 复测转绿）

| 问题 | 说明 | 验证 |
|---|---|---|
| 送礼消息券入账无幂等 | 同 orderNo 重发重复发券 → v1.5.0 mod_account（trans_no=send_/recv_+orderNo 唯一键幂等） | 003#12 ✅ |
| 期外送礼消息仍发券 | 框架 ±7d 宽限内消息到达业务层后 incr 无时间校验 → 已修 | 003#14 ✅ |
| 榜单加成时机/口径错误 | 需求口径：赠送时按 `金币数×buff` 计分，探索获得仅入背包；实现原在探索时加分且未乘倍率 → 已修 | 003#10、004#16 ✅ |

> 更早的已解决问题（配置时间口径、预置数据缺失、轮次初始化路径等）见 CASES.md「已发现问题跟踪」。
