# active/didibus 滴滴巴士·探险之旅测试用例

测试环境（test）用例。biz=`didibus-v202609`，设计依据见 `../CASES.md`。

## 运行前提

1. **真实时间门槛**：框架活动有效期校验使用**真实时间**（前后各宽限 7 天），业务接口仅在真实时间 ∈ **2026-09-16 ~ 2026-10-10** 时可用；窗口外所有用例首步探测失败、后续步骤统一 skip。`l-debug-timestamp` 只负责模拟业务时间，不能绕过该门槛。
2. **预置数据**：`active_coin`（N-A-DIDIBUS）、`mod_common_event`（DIDIBUS_MILEAGE）、`mod_common_award`（里程/双奖池/探索点/日进入/四组榜单奖励）需先配置，001 负责校验。
3. **活动礼物 ID**：填入 `_lib/constants.ts` 的 `ACTIVITY_GIFTS` 后，003 的送礼链路、004 的榜单加成才会真正执行（否则相关步骤 skip）。
4. 依赖 test 环境配置（`config.json` 的 `mysql` / `redis` 块）。

## 运行方式

```bash
node projects/active/didibus/tests/001-config-init.test.ts
node projects/active/didibus/tests/002-enter.test.ts
node projects/active/didibus/tests/003-gift-send.test.ts
node projects/active/didibus/tests/004-draw.test.ts
node projects/active/didibus/tests/005-draw-boundary.test.ts
node projects/active/didibus/tests/006-bus-explore.test.ts
node projects/active/didibus/tests/007-rank-query.test.ts
node projects/active/didibus/tests/008-marquee.test.ts
node projects/active/didibus/tests/009-daily-settle.test.ts
node projects/active/didibus/tests/010-total-settle.test.ts
```

001 是其余用例的前置（配置校验）；各用例自清理、可独立重跑。

## 用例说明

| 用例 | 校验点 |
|---|---|
| 001-config-init | /config 时间与大区、active_coin、mod_common_event、里程（权重和=1.0）、双奖池、探索点奖励覆盖地图配置、daily-entry、四组榜单奖励 stage 齐全 |
| 002-enter | 每日进入发券、任务轮次记录、同日幂等、跨天新一轮、账户接口 |
| 003-gift-send | 非活动礼物过滤、sender/receiver 比率发券、送礼总榜+日榜+收礼总榜（Redis+落库）、orderNo 幂等、期外消息无副作用 |
| 004-draw | 扣费（normal/flying）、里程必得（档位动态读取）、抽奖记录、bus 推进、探索点发奖账本、榜单 buff 加成、轮播最新条 |
| 005-draw-boundary | 余额不足（didibus_not_enough）、非法 pool/count、活动未开始/已结束、未开放大区、并发分布式锁不超扣 |
| 006-bus-explore | 循环抽奖直至第二圈：loopNo 递增、里程记录/trans_no 一致、loop0 全覆盖、loop1 重发、发奖幂等 |
| 007-rank-query | 送礼/收礼总榜排序与 selfRank、日榜 Top1（round-top）、大区隔离、/detail 聚合五块 |
| 008-marquee | 20 条上限、最新在前、内容字段、大区隔离 |
| 009-daily-settle | 日榜 Top6 结算与发奖、ko/ph/in+vi 三时区逐次覆盖、幂等、未结束日不误结算 |
| 010-total-settle | 送礼 Top3（Top1 CUSTOM 不自动发放）、收礼 Top3、贡献 Top1（stage=玩家排名）、三时区覆盖、幂等、活动未结束不结算 |

## 说明

- **模拟时间**（`_lib/times.ts`）：业务接口/消息用大区本地时间（T_PRE/T_D1/T_D2/T_OUT_*）；`__cron` 触发用北京时间精确到 cron 分钟（ko=23:05 / ph=00:05 / in+vi=01:05）。
- **造数方式**：券余额走 MySQL 直写（`setTicketBalance`）；榜单走 Redis ZADD 直写 + `mod_common_rank_record` 直写贡献者（003 单独覆盖 consumer 真实链路）。
- **配置动态读取**：里程档位、奖池价格、地图/探索点、各组榜单奖励均从 `mod_common_award` / `m/bus/detail` / `m/luckydraw/detail` 动态读取，不硬编码。
- 清理范围仅限 `didibus-v202609` biz 与 `active:didibus:` Redis 前缀，不影响其他活动。
