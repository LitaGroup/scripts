# active/didibus 滴滴巴士·探险之旅测试用例

测试环境（test）用例。biz=`didibus-v202609`，设计依据见 `../CASES.md`（技术设计 **v1.9.0**，2026-09-16 需求澄清 + 配置表：双 LuckydrawModule `lucky-gift` 扣券抽礼物/道具 + `lucky-mileage` 免费抽里程；礼物三档——礼物架普通礼物 10797~10801 buff=1.0 **唯一发券**（ticketGifts）、奖池背包 10794~10796 buff=1.1、探索点背包 10789/10791/10792/10793 buff=1.3 仅计榜；账户体系为 mod_account，账户标识 `DIDIBUS-MILEAGE`，余额/流水在 `mod_account_user` / `mod_account_user_record`，按 (biz, trans_no) 幂等）。

## 运行前提

1. **真实时间门槛**：框架活动有效期校验使用**真实时间**（前后各宽限 7 天），业务接口仅在真实时间 ∈ **2026-09-16 ~ 2026-10-10** 时可用；窗口外所有用例首步探测失败、后续步骤统一 skip。`l-debug-timestamp` 只负责模拟业务时间，不能绕过该门槛。
2. **预置数据**：`mod_account`（id=901，name=DIDIBUS-MILEAGE）、`mod_common_event`（DIDIBUS_MILEAGE）、`mod_common_award`（里程/双奖池/探索点/日进入/四组榜单奖励）需先配置，001 负责校验。
3. **活动礼物 ID**：`_lib/constants.ts` 的 `ACTIVITY_GIFTS`/`TICKET_GIFTS`/`BACKPACK_GIFTS`（2026-09-16 配置表 12 礼物三档）需与服务端 Nacos `gifts`/`ticketGifts` 配置一致，003 的送礼链路才会真正执行（不一致时相关步骤 fail/skip）。
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
| 001-config-init | /config 时间与大区、mod_account（DIDIBUS-MILEAGE）、mod_common_event、双里程奖池（bus.mileage.normal/flying 各权重和=1.0）、礼物奖池（bus.normal/bus.flying）、探索点奖励覆盖地图配置、daily-entry（ACCOUNT#901）、四组榜单奖励 stage 齐全 |
| 002-enter | 每日进入发券（mod_account 幂等入账）、任务轮次记录、同日幂等、跨天新一轮、账户接口 |
| 003-gift-send | 非活动礼物过滤、普通礼物（10797）sender×2/receiver×0.5 发券（向下取整，仅 ticketGifts 发券）、榜单计分=价值×buff（奖池背包 10794×1.1、探索背包 10789×1.3 只计榜不发券）、送礼总榜+日榜+收礼总榜（Redis+落库）、orderNo 幂等（流水 trans_no=send_/recv_+orderNo 各 1 条）、期外消息无副作用 |
| 004-draw | 扣费（normal/flying，lucky-gift 统一扣券）、里程必得（分 pool 档位动态读取）、双抽奖记录（lucky-gift/lucky-mileage 各一批，道具 item 可为 0（权重和 0.9065），result 接口可查）、bus 推进、探索点发奖账本、探索不影响榜单（buff 在赠送环节计入）、轮播最新条（mileage=本次 totalMileage） |
| 005-draw-boundary | 余额不足（didibus_not_enough）、非法 pool/count、活动未开始/已结束、未开放大区、并发分布式锁不超扣（按 lucky-gift 批次计数） |
| 006-bus-explore | 循环抽奖直至第二圈：loopNo 递增、里程记录/trans_no 一致、loop0 全覆盖、loop1 重发、发奖幂等（单地图 map-1，距离动态读取） |
| 007-rank-query | 送礼/收礼总榜排序与 selfRank、日榜 Top1（round-top）、大区隔离、/detail 聚合五块（bus 含 remaining）、/gifts 礼物清单（仅 ticketGifts 5 礼物、价格升序、coin/diamond、buff=1.0） |
| 008-marquee | 20 条上限、最新在前（首条 mileage=最后 1 抽 totalMileage）、内容字段（playerId/nickname/avatar/mileage）、大区隔离 |
| 009-daily-settle | 日榜 Top3 结算与发奖（Top4~8 无奖励）、ko/ph/in+vi 三时区逐次覆盖、幂等、未结束日不误结算 |
| 010-total-settle | 送礼 Top3（Top1 分大区 COIN view_only + 5 道具自动发放）、收礼 Top3、贡献 Top1（stage=玩家排名）、三时区覆盖、幂等、活动未结束不结算 |

## 说明

- **模拟时间**（`_lib/times.ts`）：业务接口/消息用大区本地时间（T_PRE/T_D1/T_D2/T_OUT_*）；`__cron` 触发用北京时间精确到 cron 分钟（ko=23:05 / ph=00:05 / in+vi=01:05）。
- **造数方式**：券余额走 MySQL 直写（`setTicketBalance` → `mod_account_user`）；榜单走 Redis ZADD 直写 + `mod_common_rank_record` 直写贡献者（003 单独覆盖 consumer 真实链路）。
- **配置动态读取**：里程档位（bus.mileage.normal/flying 分池）、奖池价格（m/lucky-gift/detail）、地图/探索点、各组榜单奖励均从 `mod_common_award` / `m/bus/detail` 动态读取，不硬编码。
- 清理范围仅限 `didibus-v202609` biz 与 `active:didibus:` Redis 前缀（含 `mod_account_user`/`mod_account_user_record` 中本 biz 测试用户行），不影响其他活动。
