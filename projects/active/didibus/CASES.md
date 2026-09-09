# 滴滴巴士·探险之旅（didibus-v202609）测试大纲

> 来源文档：需求 `documents/20.md`、技术设计 `documents/21.md`（v1.2.0）
> 测试环境：test（`TestBaseClass`，API 直连 + MySQL 直连读写 + Redis 直连）
> 送礼通过 `POST active/v3/__consumer/funbit.gift_send` 模拟；结算通过 `POST active/v3/__cron`（可指定 time）手动触发。

## 活动要点（用例设计依据）

- 活动时间：开始 2026-09-23 14:00（北京时间，固定）；结束 2026-10-02 23:59:59（各大区本地，R 后缀）——约 9.5 天；大区 in/vi/ph/ko（已与需求方确认：开始较需求文档提前 1 天，结束不变）
- 探险券账户：`N-A-DIDIBUS`；送礼 1 币 = 2 券（sender）/ 1 券（receiver）；每日进入发 10 券（示例值，以实际配置为准）
- 抽奖：普通巴士 30 券/次、飞行巴士 80 券/次，次数 ∈ {1,10,50}；奖池只含道具/礼物（可未中奖）
- 里程：独立权重抽选（`DIDIBUS_MILEAGE`，档位示例 +1/+3/+5/+10、权重和=1.0，**实际档位与权重待提供**），每抽必得；两巴士共用里程配置
- 探索：bus.forward 同步推进，越过探索点自动发奖（背包礼物+道具）；多地图循环（enableLoop）
- 榜单：送礼总榜+日榜（单实例 mainRound+timeRound，日榜 Top6 自动发奖）、收礼总榜（Top3 + 贡献 Top1）
- 加成：探索点奖励中的背包礼物若 giftId ∈ `gifts`，按 buff 值给送礼/收礼总榜加分
- 轮播：Redis List 最近 20 条，按 locale 隔离
- 结算：日榜每日 ko/ph/in+vi 三时区 00:05 各触发一次（+5min 延迟、状态位幂等）；总榜活动结束次日同理

## 公共层计划（写用例前先落地）

| 项 | 说明 |
|---|---|
| `DidibusService`（src/services/） | 封装：enter/detail/draw/marquee 接口调用、account/bus/luckydraw/rank 模块接口调用、gift_send 消息构造、__cron 触发 |
| 数据准备 | MySQL 直写：测试用户探险券余额（active_user_account）、清理里程/抽奖/榜单/任务记录；Redis 清理：榜单 ZSet、marquee、抽奖锁、库存 |
| 配置基线 | 测试环境 Nacos `didibus-v202609.yaml` + `mod_common_award` 预置数据 + `active_coin` + `mod_common_event`；用例 001 负责校验存在性 |
| 测试用户 | 固定 userId 池（送礼人 A、收礼人 B、榜外用户 C 等），每用例执行前清理其数据，用例可重复执行 |

## 模拟时间约定（重要）

用例真实执行日期早于活动开始时间，**所有接口调用与 consumer 消息必须显式携带 `debugTimestamp`**（l-debug-timestamp 头），禁止依赖真实时间。

> ⚠️ **已验证的框架行为（2026-09-09 实测）**：外层「活动有效期校验」（±7d 宽限）与业务写路径均响应 `l-debug-timestamp`（draw 实测落库 create_time=debug 时间）。**格式要求**：`yyyy-MM-ddTHH:mm:ss`（服务器北京时区）或带 `±HH:mm` 偏移；**不支持毫秒（.000）与空格分隔**（解析失败会静默回退真实时间导致 not active）。
> ⚠️ **已知例外（待开发确认）**：TaskModule（daily-entry）的轮次/duringTime 计算疑似走**真实时间**——debug 时间在活动窗口内时 `m/daily-entry/detail` 仍返回 `round=null`、`duringTime=false`，`/enter` 返回 200 但不实际发券（不落库）。

按用途分四类模拟时间（均按目标大区本地时间换算：in/vi=UTC+7、ph=UTC+8、ko=UTC+9）：

| 代号 | 含义 | 取值（以大区本地时间计） | 用途 |
|---|---|---|---|
| `T_PRE` | 活动开始前 | 2026-09-23 12:00 | 初始化类：配置校验、榜单/轮次初始化触发（框架前宽限 7 天，可访问但业务操作应被拒） |
| `T_D1` | 活动第 1 天 | 2026-09-23 18:00 | 正式业务访问：enter / draw / gift_send 消息 / 榜单查询 / 轮播 |
| `T_D2` | 活动第 2 天 | 2026-09-24 10:00 | 跨天场景：新一轮每日进入发券、日榜切日 |
| `T_D1_SETTLE` | 第 1 天日榜结算点 | 2026-09-24 00:05（各大区） | `__cron` 触发日榜结算 |
| `T_END_SETTLE` | 总榜结算点 | 2026-10-03 00:05（各大区） | `__cron` 触发总榜结算 |
| `T_OUT` | 活动期外 | 开始前（09-19）/ 结束后（10-05） | 拒绝场景：业务操作应报错、消息不记分（均在 ±7d 宽限内，确保请求能到达业务层） |

规则：
1. **初始化/造数/清理**：MySQL / Redis 直写无时间概念，随时可执行；但凡是**通过接口触发服务端初始化**的动作（如首次访问触发轮次/榜单初始化），必须用 `T_PRE` 的模拟时间执行，确保初始化落在活动开始前。
2. **正式业务访问**（enter/draw/consumer/查询）必须用活动时间窗口内的模拟时间（`T_D1`/`T_D2`）。
3. **结算触发**：`__cron` 的 `time` 参数用对应大区的日切点后 +5min（`T_D1_SETTLE` / `T_END_SETTLE`），逐大区换算（ko=北京前一日 23:05、ph=北京 00:05、in/vi=北京 01:05）。
4. 同一用例内不同阶段切换模拟时间时，须注意"日切"副作用（如 002 跨天会触发新一轮发券），断言以模拟时间所在大区日为准。

## 用例列表

### 001-config-init —— 配置与预置数据校验

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 调用 `/didibus-v202609/config`（T_PRE） | check | 返回开始/结束时间（09-24 14:00 ~ 10-02 23:59:59）、enableLocales 含 in/vi/ph/ko |
| 查 `active_coin` | check | 存在 type=`N-A-DIDIBUS` 记录，4 大区 locale_config 齐全 |
| 查 `mod_common_event` | check | 存在 name=`DIDIBUS_MILEAGE` |
| 查 `mod_common_award` 里程条目 | check | name=`DIDIBUS_MILEAGE`、stage=0、award_type=EVENT、mod=VIEW；档位集合与配置一致（**待提供**）；权重和=1.0（100% 必得） |
| 查 `mod_common_award` 奖池 | check | `DIDIBUS_LUCKYDRAW_NORMAL` / `DIDIBUS_LUCKYDRAW_FLYING` 均有条目，权重和 ≤ baseTotal(1.0) |
| 查 `mod_common_award` 探索点奖励 | check | 每个地图 awardName（bus.map-N）× 每个 stage 均有 ≥1 条 GIFT/道具 |
| 查 `mod_common_award` 每日进入/榜单奖励 | check | `daily-entry`（ACTIVE_COIN，count=10）；`gift-send-total` stage=1~3；`gift-send-daily` stage=1~6；`gift-recv` stage=1~3；`gift-recv-contributor` stage=1~3 |

### 002-enter —— 每日进入发券

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 清理测试用户账户/任务记录 | act | — |
| 首次调用 `/enter`（T_D1） | act | 返回 tickets=配置值（dailyEntryTickets） |
| 查账户余额 | check | `active_user_account` 增加 dailyEntryTickets 券 |
| 查任务记录 | check | `mod_task_user_round` 当日轮次 condition=enter 完成，settle 已发奖 |
| 同日再次 `/enter`（T_D1） | act+check | 余额不再增加（transNo 按日幂等，REPEAT maxTimes=1） |
| 跨天再次 `/enter`（T_D2） | act+check | 新一轮每日轮次，再次发放 dailyEntryTickets 券（REPEAT 按日重置） |
| 查 `/m/account/detail`、`/m/account/records`（T_D2） | check | 余额=2×dailyEntryTickets；变动记录含 2 笔入账 |

### 003-gift-send —— 送礼消费（发券 + 榜单）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 清理 A/B/C 账户与榜单 | act | — |
| 发送非活动礼物（giftId ∉ 白名单，消息时间 T_D1） | act+check | A/B 券余额不变；双榜无记录 |
| A 送 B 活动礼物 totalCoin=100（消息时间 T_D1） | act | `__consumer/funbit.gift_send` |
| 查券余额 | check | A +100×ticketPerCoinSender、B +100×ticketPerCoinReceiver（比率读配置，示例 ×2 / ×1） |
| 查送礼总榜+日榜（T_D1） | check | `m/gift-send/rank` A=100 分；当日 dayKey 分片同步 +100 |
| 查收礼总榜（T_D1） | check | `m/gift-recv/rank` B=100 分，贡献者=A |
| 同 orderNo 重发消息（T_D1） | act+check | 券与榜单不重复累计（幂等） |
| 活动期外时间戳的消息（T_OUT） | act+check | 不入账不记分（有效期校验） |

### 004-draw —— 抽奖核心链路（抽奖+里程+探索+加成+轮播）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 准备 A 余额 1000 券 | act | MySQL 直写 |
| 普通巴士抽 1 次（pool=normal,count=1，T_D1） | act | `/draw` 返回 |
| 扣费 | check | 余额 1000→970（30×1） |
| 里程必得 | check | `totalMileage` ∈ 配置档位集合 且 >0 |
| 抽奖记录 | check | `mod_luckydraw_record` +1 批、item=1 条；`/m/luckydraw/result` 可查到 |
| bus 推进 | check | `bus.oldDistance=0`、`newDistance=totalMileage`；`m/bus/detail` 里程一致 |
| 飞行巴士抽 10 次（pool=flying,count=10，T_D1） | act | — |
| 扣费 | check | 970→170（80×10） |
| 里程 | check | `totalMileage` = 10 次抽选之和，每次 ∈ 档位集合 |
| 探索点发奖 | check | 累计里程越过 stage=10/30… 时 `crossed` 非空；`mod_bus_user_award` 有账本；对应奖励入 `gift_award_queue` |
| 榜单加成 | check | crossed 奖励含白名单背包礼物时，A 的送礼/收礼总榜各 +Σbuff |
| 轮播 | check | `/marquee` 最新 1 条为 A 的飞行巴士 ×10 记录 |

### 005-draw-boundary —— 抽奖边界与异常

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 余额不足（余额 10，抽 normal×1，T_D1） | check | 报错 `didibus_not_enough`，余额/里程/记录均不变 |
| 非法 pool（pool=xx，T_D1） | check | 报错，无副作用 |
| 非法次数（count=2 / 0 / -1 / 100，T_D1） | check | 报错（仅允许 1/10/50） |
| 活动未开始/已结束（T_OUT：开始前 / 结束后） | check | 报错，不扣费 |
| 未开放大区（locale 非 in/vi/ph/ko，T_D1） | check | 报错 |
| 并发同 pool 抽奖（并行 N 个请求，T_D1） | check | 分布式锁生效：仅 1 成功或串行成功，余额扣减与记录一致，不超扣 |

### 006-bus-explore —— 里程探索与循环

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 准备余额，多次抽满 map-1（100 里程，T_D1） | act | — |
| 单点跨越 | check | 一次 forward 跨多个探索点时，`crossed` 含全部越点，逐点发奖不遗漏 |
| 超里程累积 | check | 单点超出部分累积到下一段（newDistance 准确） |
| 已探索次数 | check | `m/bus/detail` 各地图/探索点"已探索次数"+1；首图未探索点置灰语义（detail 数据体现） |
| 循环 | check | 走完最后一个地图后回到 map-1，`loopNo`+1；末点超出里程保留到新一轮 |
| 探索发奖幂等 | check | 同 transNo 重复 forward 不重复发奖（`mod_bus_user_award` 幂等） |

### 007-rank-query —— 榜单查询

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 构造多用户送礼数据（消息时间 T_D1） | act | 多个用户不同分值入送礼/收礼榜 |
| 送礼总榜 | check | `m/gift-send/rank` 按分降序、分页正确、selfRank 正确 |
| 收礼总榜 | check | `m/gift-recv/rank` 同上 |
| 日榜 Top1（领航探险） | check | `m/gift-send/round-top` 返回当日 top1 用户 |
| 大区隔离 | check | in 与 vi 数据互不可见（Redis key 含 locale） |
| `/detail` 聚合 | check | 返回 account+bus+luckydraw+dailyTop1+marquee 五块齐全 |

### 008-marquee —— 轮播记录

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 连续抽奖 25 次（T_D1） | act | — |
| 条数上限 | check | `/marquee` 返回 ≤20 条（LTRIM 生效） |
| 顺序 | check | 最新记录在最前（LPUSH） |
| 内容 | check | 每条含 playerId/pool/count |
| 大区隔离 | check | 切 locale 查询互不影响 |

### 009-daily-settle —— 日榜结算（Cron）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 构造当日日榜 ≥6 人数据（消息时间 T_D1） | act | 不同分值 |
| 触发 `__cron`（time=T_D1_SETTLE，各大区 00:05） | act | — |
| 结算结果 | check | `mod_common_rank_result` 记录当日子榜 Top6，状态位=已结算 |
| 日榜发奖 | check | Top1~6 按 stage=排名 各得 `gift-send-daily` 对应奖励（mod_common_award_record） |
| 幂等 | check | 重复触发同轮次不重复发奖 |
| 时区覆盖 | check | ko/ph/in+vi 三次触发（各自 T_D1_SETTLE 换算北京时间）分别仅结算各自已结束轮次，互不误结算 |
| 未结束日不结算 | check | time=T_D1 中午触发，当日子榜不结算 |

### 010-total-settle —— 总榜结算（Cron）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 构造送礼总榜/收礼总榜数据（消息时间在活动期内，跨多日 T_D1~T_D2） | act | 含收礼榜贡献者 |
| 触发 `__cron`（time=T_END_SETTLE，各大区 00:05） | act | — |
| 送礼总榜 | check | Top3 结算记录；Top1 CUSTOM 仅记录不自动发放；Top2-3 自动发放 |
| 收礼总榜 | check | Top3 按 `gift-recv` stage=排名发奖 |
| 收礼贡献者 | check | 收礼 Top3 各自的贡献 Top1 按 `gift-recv-contributor` stage=玩家排名发奖 |
| 幂等 | check | 三个时区 cron 依次触发，仅首次生效，重复安全 |
| 活动外触发 | check | time=T_D1（活动未结束）触发不结算总榜 |

## 执行顺序与依赖

```
001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010
（001 是其余所有用例的前置；003/004 为 007~010 提供造数手段，但各用例自清理、可独立重跑）
```

## 待确认事项

1. ~~**测试环境 biz 名**~~ ✅ 已确认：`didibus-v202609`
2. **活动礼物 ID**：由用户提供后写入 `_lib/constants.ts` 的 `ACTIVITY_GIFTS`（为空时 003/004 相关步骤自动 skip）
3. **里程档位与权重**：用例已从 `mod_common_award` 动态读取（001 校验权重和=1.0，004 按实际档位断言），无需硬编码；用户提供后仅需核对配置
4. **大区时间模拟**：`/enter` 与结算的大区时间依赖 `debugTimestamp`（l-debug-timestamp），沿用 pk 用例的做法；但活动有效性门槛走真实时间（见「模拟时间约定」⚠️）
5. **checks/ 线上巡检**：上线后另补（各阶段 config/榜单/结算结果只读巡检），本次先不建。

## 已发现问题跟踪

1. ~~**Nacos 配置时间不符**~~ ✅ 已修复（2026-09-09）：start=2026-09-23 14:00（北京）、finish=R 后缀各大区本地 10-02 23:59:59（/config 返回最晚绝对时间 in/vi = 1790960399000，已验证为正确语义）
2. ~~**预置数据全部缺失**~~ ✅ 已配置（2026-09-09 001 通过）：里程档位实测 [1,3,5,10] 权重和 1.0；双奖池各 2 条权重和 0.5；daily-entry ACTIVE_COIN×10；榜单奖励 stage 齐全（总榜 Top1 均为 CUSTOM/VIEW 手动下发）
3. ~~**业务接口真实时间门槛**~~ ✅ 已解决（2026-09-09 配置修复后）：l-debug-timestamp 可驱动有效期校验与业务时间，002~010 随时可跑。格式要求：`yyyy-MM-ddTHH:mm:ss`（北京）或带 `±HH:mm` 偏移，不支持毫秒/空格分隔。
4. ~~**TaskModule 疑似不响应 debug 时间**~~ ✅ 已解决（根因是**缺初始化步骤**）：正确初始化接口为 `POST v3/didibus-v202609/p/init`（body `{"round":1}`，一次创建 总榜 gift-send/gift-recv、日榜 gift-send×10、任务 daily-entry×10，4 大区，幂等；`m/daily-entry/init` 是错误路径且轮次日界不对）。/p/init 后 002 enter 发券全链路正常。001 已内置清理+/p/init+轮次检查。
5. **【配置问题→001#11/13 fail，002#5 fail 同根因】轮次时间口径不符**：
   - 总榜（gift-send/gift-recv）开始=各大区**本地 14:00**（in/vi 07:00Z、ko 05:00Z），而 /config 活动开始为固定北京 14:00（06:00Z）→ 总榜开始≠活动开始（ph 恰好相等）
   - 任务（daily-entry）轮次日界为**北京零点**（start=16:00Z）而非各大区本地零点 → round=20260922（in 本地 09-23 记成前一天）；roundSetting 缺 R 后缀
6. **【信息】活动礼物 ID 已从配置确认**：奖池与探索点奖励中的 GIFT 为 1001~1005（金币礼物1~4 + 钻石礼物）；`gifts` 白名单 buff 值仍待提供。
