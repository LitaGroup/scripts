# 滴滴巴士·探险之旅（didibus-v202609）测试大纲

> 来源文档：需求 `documents/20.md`、技术设计 `documents/26.md`（**v1.5.0**，2026-09-09）、接口文档 `documents/29.md`（**v1.1.0**）、活动配置 `documents/27`（didibus-v202609.yaml）、初始化 SQL `documents/28`（init.sql）——均来自 <http://project.cinta.team/projects/70>
> 测试环境：test（`TestBaseClass`，API 直连 + MySQL 直连读写 + Redis 直连）
> 送礼通过 `POST active/v3/__consumer/funbit.gift_send` 模拟；结算通过 `POST active/v3/__cron`（可指定 time）手动触发。

## 活动要点（用例设计依据）

- 活动时间：开始 2026-09-23 14:00（北京时间，固定）；结束 2026-10-02 23:59:59（各大区本地，R 后缀）——约 9.5 天；大区 in/vi/ph/ko（已与需求方确认：开始较需求文档提前 1 天，结束不变）
- 探险券账户（**v1.5.0 mod_account 体系**）：账户标识 `accountName: "DIDIBUS-MILEAGE"`（`mod_account.name`，id=901）；余额/流水在 `mod_account_user` / `mod_account_user_record`，**唯一键 (biz, trans_no) 幂等**；旧 `active_coin`/`active_user_account`（N-A-DIDIBUS）已废弃
- 券比率：送礼 1 币 = 2 券（sender，`ticketPerCoinSender=2`）/ 0.5 券（receiver，`ticketPerCoinReceiver=0.5`，BigDecimal 小数**向下取整**）；每日进入发 10 券（`dailyEntryTickets=10`）
- **幂等流水号（v1.5.0）**：送礼入账 transNo=`send_{orderNo}`/`recv_{orderNo}`（Kafka 重投不重复入账，orderNo 为空则跳过入账）；/draw 由 Active 层 `ID.id("DRAW")` 生成 transNo，lucky-gift/lucky-mileage 两次抽奖共用（扣券幂等）；每日进入 transNo=`enter_{userId}_{yyyyMMdd}`（大区本地日期）
- 抽奖（双 LuckydrawModule）：
  - `lucky-gift`：礼物/道具抽奖，**统一扣券**（ACCOUNT 类型扣减）——普通巴士 30 券/次、飞行巴士 80 券/次，次数 ∈ {1,10,50}；奖池 `bus.normal` / `bus.flying`，权重和 < baseTotal(1.0)（可未中奖）
  - `lucky-mileage`：里程抽奖，price=0 **不扣费**；两巴士**独立里程奖池** `bus.mileage.normal`（+1/+3/+5/+10，权重 0.40/0.30/0.20/0.10）/ `bus.mileage.flying`（+3/+5/+10/+20，权重 0.35/0.30/0.25/0.10），权重和 = baseTotal ⇒ 每抽必得；条目 EVENT+VIEW 不实际发放，`award_count` 即里程值；失败 `execIgnoreError` 容错按 0 里程（`luckyMileage=null`、`totalMileage=0`）
  - `/draw` 响应：`{luckyGift, luckyMileage, totalMileage, bus}`；每次 /draw 写 **2 批** `mod_luckydraw_record`（topic=lucky-gift/lucky-mileage，按 (biz,user_id,pool,create_time) 一一对应）；`bus.forward` transNo=`bus_{luckyGift.id}`；参数校验失败报 `invalid parameter`
- 里程生效：`bus.forward` 同步推进，越过探索点自动发奖（背包礼物+道具）；多地图循环（enableLoop）
- 榜单：送礼总榜+日榜（单实例 gift-send：mainRound+timeRound，日榜 Top6 自动发奖）、收礼总榜 gift-recv（Top3 + 贡献 Top1）；`/m/{topic}/rank` 响应含 `round`/`rankResult`/`my`/`myAll`
- 加成（**2026-09-09 与需求方确认口径**）：探索获得的背包礼物**仅入背包、不影响榜单**；当活动礼物被**赠送**时，按 **礼物金币数 × buff**（`gifts` 白名单 value 为倍率）计入榜单——送礼人计送礼总榜+日榜、收礼人计收礼总榜；buff 倍率：1001:1.0 / 1002:1.5 / 1003:2.0 / 1004:2.5 / 1005:3.0
- 轮播：Redis List 最近 20 条，按 locale 隔离
- 结算：日榜每日 ko/ph/in+vi 三时区 00:05 各触发一次（+5min 延迟、状态位幂等）；总榜活动结束次日同理
- `/detail` 聚合五块：`account`（accounts[].name="DIDIBUS-MILEAGE"、mine=余额）/ `bus` / `luckyGift` / `dailyTop1` / `marquee`
- 账户接口：`/m/account/detail`（accounts[]，type 字段废弃）、`/m/account/records`（name 必填="DIDIBUS-MILEAGE"，返回 type=INCREASE/DECREASE、amount 带符号、totalAmount）

## 公共层计划（写用例前先落地）

| 项 | 说明 |
|---|---|
| `DidibusService`（src/services/） | 封装：enter/detail/draw/marquee 接口调用、account/bus/lucky-gift/lucky-mileage/rank 模块接口调用、gift_send 消息构造、__cron 触发 |
| 数据准备 | MySQL 直写：测试用户探险券余额（mod_account_user）、清理里程/抽奖/榜单/任务/账户流水记录；Redis 清理：榜单 ZSet、marquee、抽奖锁、库存 |
| 配置基线 | 测试环境 Nacos `didibus-v202609.yaml` + `mod_common_award` 预置数据 + `mod_account`（id=901）+ `mod_common_event`；用例 001 负责校验存在性 |
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
| 查 `mod_account` | check | 存在 name=`DIDIBUS-MILEAGE`（id=901）记录，4 大区 locale_config 齐全 |
| 查 `mod_common_event` | check | 存在 name=`DIDIBUS_MILEAGE`（里程 EVENT，award_id 引用其 id=901） |
| 查 `mod_common_award` 里程条目 ×2 | check | `bus.mileage.normal` / `bus.mileage.flying` 各自：stage=0、award_type=EVENT、mod=VIEW、权重和=1.0（100% 必得）；normal 档位 +1/+3/+5/+10、flying 档位 +3/+5/+10/+20 |
| 查 `mod_common_award` 奖池 | check | `bus.normal` / `bus.flying`（lucky-gift 奖池）均有条目，权重和 ≤ baseTotal(1.0)（差值=未中奖） |
| 查 `mod_common_award` 探索点奖励 | check | 每个地图 awardName（bus.map-N）× 每个 stage 均有 ≥1 条 GIFT/道具 |
| 查 `mod_common_award` 每日进入/榜单奖励 | check | `daily-entry`（ACCOUNT，award_id=901→mod_account.id，count=10）；`gift-send-total` stage=1~3；`gift-send-daily` stage=1~6；`gift-recv` stage=1~3；`gift-recv-contributor` stage=1~3 |

### 002-enter —— 每日进入发券

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 清理测试用户账户/任务记录 | act | — |
| 首次调用 `/enter`（T_D1） | act | 返回 tickets=配置值（dailyEntryTickets） |
| 查账户余额 | check | `mod_account_user` 增加 dailyEntryTickets 券（流水 trans_no 幂等） |
| 查任务记录 | check | `mod_task_user_round` 当日轮次 condition=enter 完成，settle 已发奖 |
| 同日再次 `/enter`（T_D1） | act+check | 余额不再增加（transNo=`enter_{userId}_{dayKey}` 按日幂等，REPEAT maxTimes=1） |
| 跨天再次 `/enter`（T_D2） | act+check | 新一轮每日轮次，再次发放 dailyEntryTickets 券（REPEAT 按日重置） |
| 查 `/m/account/detail`、`/m/account/records`（T_D2） | check | 余额=2×dailyEntryTickets；变动记录含 2 笔入账 |

### 003-gift-send —— 送礼消费（发券 + 榜单）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 清理 A/B/C 账户与榜单 | act | — |
| 发送非活动礼物（giftId ∉ 白名单，消息时间 T_D1） | act+check | A/B 券余额不变；双榜无记录 |
| A 送 B 活动礼物 1001（buff=1.0）totalCoin=100（消息时间 T_D1） | act | `__consumer/funbit.gift_send` |
| 查券余额 | check | A += ⌊100×ticketPerCoinSender⌋=200、B += ⌊100×ticketPerCoinReceiver⌋=50（比率读配置 2 / 0.5，小数向下取整） |
| 查送礼总榜+日榜（T_D1） | check | `m/gift-send/rank` A=100×buff(1001)=**100** 分；当日 dayKey 分片同步 |
| 查收礼总榜（T_D1） | check | `m/gift-recv/rank` B=100 分，贡献者=A |
| A 送 B 高倍率礼物 1005（buff=3.0）totalCoin=100（T_D1） | act+check | 送礼/收礼总榜各 **+= coin×buff = 300**（A 累计 400、B 累计 400）；券按金币数正常入账（与倍率无关） |
| 同 orderNo 重发消息（T_D1） | act+check | 券与榜单不重复累计（mod_account 按 (biz, send_/recv_+orderNo) 幂等，流水各仅 1 条） |
| 活动期外时间戳的消息（T_OUT） | act+check | 不入账不记分（有效期校验） |

### 004-draw —— 抽奖核心链路（抽奖+里程+探索+加成+轮播）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 准备 A 余额 1000 券 | act | MySQL 直写 mod_account_user |
| 普通巴士抽 1 次（pool=normal,count=1，T_D1） | act | `/draw` 返回 `{luckyGift, luckyMileage, totalMileage, bus}` |
| 扣费 | check | 余额 1000→970（30×1，lucky-gift 统一扣券，lucky-mileage price=0 不重复扣） |
| 里程必得 | check | `totalMileage` ∈ normal 里程档位集合（+1/+3/+5/+10）且 >0 |
| 抽奖记录 ×2 | check | `mod_luckydraw_record` +2 批（topic=lucky-gift/lucky-mileage 各 1、item 各 1 条，mileage item.award_count=里程值）；`/m/lucky-gift/result`、`/m/lucky-mileage/result` 均可查 |
| bus 推进 | check | `bus.oldDistance=0`、`newDistance=totalMileage`；`m/bus/detail` 里程一致 |
| 飞行巴士抽 10 次（pool=flying,count=10，T_D1） | act | — |
| 扣费 | check | 970→170（80×10） |
| 里程 | check | `totalMileage` = 10 次抽选之和，每条 mileage item.award_count ∈ flying 档位集合（+3/+5/+10/+20） |
| 探索点发奖 | check | 累计里程越过 stage=10/30… 时 `crossed` 非空；`mod_bus_user_award` 有账本；对应奖励入 `gift_award_queue` |
| 探索获得礼物仅入背包 | check | 抽奖/探索发奖后 A 的送礼/收礼总榜**无变化**（buff 倍率在赠送环节计入，见 003；需求口径 2026-09-09 确认） |
| 轮播 | check | `/marquee` 最新 1 条为 A 的飞行巴士 ×10 记录 |

### 005-draw-boundary —— 抽奖边界与异常

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 余额不足（余额 10，抽 normal×1，T_D1） | check | 报错（应含 `didibus_not_enough`，见问题#9），余额/里程/记录均不变 |
| 非法 pool（pool=xx，T_D1） | check | 报错，无副作用 |
| 非法次数（count=2 / 0 / -1 / 100，T_D1） | check | 报错（仅允许 1/10/50） |
| 活动未开始/已结束（T_OUT：开始前 / 结束后） | check | 报错，不扣费 |
| 未开放大区（locale 非 in/vi/ph/ko，T_D1） | check | 报错 |
| 并发同 pool 抽奖（并行 N 个请求，T_D1） | check | 分布式锁生效（锁 key 按模块隔离：lucky-gift/lucky-mileage 各一把）：仅 1 成功或串行成功，余额扣减与 lucky-gift 记录数一致，不超扣 |

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
| `/detail` 聚合 | check | 返回 account+bus+luckyGift+dailyTop1+marquee 五块齐全 |

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
| 结算状态 | check | `mod_common_round.status`=200（已结算）；`mod_common_rank_result` 已废弃不再断言 |
| 日榜发奖 | check | Top1~6 按 stage=排名 各得 `gift-send-daily` 对应奖励（mod_common_award_record），Top7/8 无奖励 |
| 幂等 | check | 重复触发同轮次不重复发奖 |
| 时区覆盖 | check | ko/ph/in+vi 三次触发（各自 T_D1_SETTLE 换算北京时间）分别仅结算各自已结束轮次，互不误结算 |
| 未结束日不结算 | check | time=T_D1 中午触发，当日子榜不结算 |

### 010-total-settle —— 总榜结算（Cron）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 构造送礼总榜/收礼总榜数据（真实 gift_send 消息，T_D1；禁直写 DB/Redis） | act | 含收礼榜贡献者；造数后走 /rank 接口自检分值 |
| 触发 `__cron`（time=T_END_SETTLE，各大区 00:05） | act | — |
| 送礼总榜 | check | 轮次 status=200；Top1 CUSTOM 仅记录不自动发放；Top2-3 自动发放 |
| 收礼总榜 | check | Top3 按 `gift-recv` stage=排名发奖 |
| 收礼贡献者 | check | 收礼 Top3 各自的贡献 Top1 按 `gift-recv-contributor` stage=玩家排名发奖；大区隔离（ko 贡献者奖励只发 ko 本地贡献 Top1，不跨大区、不重复） |
| 幂等 | check | 三个时区 cron 依次触发，仅首次生效，重复安全 |
| 活动外触发 | check | time=T_D1（活动未结束）触发不结算总榜 |

## 执行顺序与依赖

```
001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010
（001 是其余所有用例的前置；003/004 为 007~010 提供造数手段，但各用例自清理、可独立重跑）
```

## 待确认事项

1. ~~**测试环境 biz 名**~~ ✅ 已确认：`didibus-v202609`
2. ~~**活动礼物 ID**~~ ✅ 已从配置确认：1001~1005（金币礼物1~4 + 钻石礼物），已写入 `_lib/constants.ts` 的 `ACTIVITY_GIFTS`
3. ~~**里程档位与权重**~~ ✅ v1.4.0 已确定：normal +1/+3/+5/+10（0.40/0.30/0.20/0.10）、flying +3/+5/+10/+20（0.35/0.30/0.25/0.10），两巴士独立奖池；用例从 `mod_common_award` 动态读取（001 分池校验权重和=1.0，004 按实际档位断言），不硬编码
4. **大区时间模拟**：`/enter` 与结算的大区时间依赖 `debugTimestamp`（l-debug-timestamp），沿用 pk 用例的做法；但活动有效性门槛走真实时间（见「模拟时间约定」⚠️）
5. **checks/ 线上巡检**：上线后另补（各阶段 config/榜单/结算结果只读巡检），本次先不建。

## 已发现问题跟踪

1. ~~**Nacos 配置时间不符**~~ ✅ 已修复（2026-09-09）：start=2026-09-23 14:00（北京）、finish=R 后缀各大区本地 10-02 23:59:59（/config 返回最晚绝对时间 in/vi = 1790960399000，已验证为正确语义）
2. ~~**预置数据全部缺失**~~ ✅ 已配置（2026-09-09 001 通过）：里程档位实测 normal [1,3,5,10] / flying [3,5,10,20] 权重和各 1.0；双奖池各 2 条权重和 0.5；daily-entry ACTIVE_COIN×10；榜单奖励 stage 齐全（总榜 Top1 均为 CUSTOM/VIEW 手动下发）
3. ~~**业务接口真实时间门槛**~~ ✅ 已解决（2026-09-09 配置修复后）：l-debug-timestamp 可驱动有效期校验与业务时间，002~010 随时可跑。格式要求：`yyyy-MM-ddTHH:mm:ss`（北京）或带 `±HH:mm` 偏移，不支持毫秒/空格分隔。
4. ~~**TaskModule 疑似不响应 debug 时间**~~ ✅ 已解决（根因是**缺初始化步骤**）：正确初始化接口为 `POST v3/didibus-v202609/p/init`（body `{"round":1}`，一次创建 总榜 gift-send/gift-recv、日榜 gift-send×10、任务 daily-entry×10，4 大区，幂等；`m/daily-entry/init` 是错误路径且轮次日界不对）。/p/init 后 002 enter 发券全链路正常。001 已内置清理+/p/init+轮次检查。
5. ~~**轮次时间口径不符（001#11/13 fail，002#5 fail 同根因）**~~ ✅ 新配置已修复（documents/27，2026-09-08 更新）：
   - 总榜（gift-send/gift-recv）`mainRound.startTime` 改为**绝对时间** `2026-09-23T14:00:00+08:00`（不再 R 后缀）→ 总榜开始=活动开始，全大区一致
   - 任务（daily-entry）`roundSetting.firstStartTime` 补 **R 后缀**（`2026-09-23T00:00:00+08:00R`）→ 轮次日界=各大区本地零点，round key 按本地 yyyyMMdd
   - ⚠️ 已重跑 001 验证通过（2026-09-09，18/18）：总榜 8 条开始=活动开始、日榜/任务轮次 40+40 条起止=本地日界
6. ~~**活动礼物 ID / buff 待提供**~~ ✅ 已从配置确认：白名单+buff = 1001:1.0 / 1002:1.5 / 1003:2.0 / 1004:2.5 / 1005:3.0
7. **【v1.4.0 架构变更】抽奖改双 LuckydrawModule**（2026-09-09 设计更新，本次已同步用例；init.sql 已重灌测试环境，004 冒烟 16/17 通过，服务端双模块已生效）：
   - 原 `luckydraw` 模块拆分为 `lucky-gift`（礼物/道具，扣券）+ `lucky-mileage`（里程，price=0 不扣费，权重和=baseTotal 100% 必得，条目 mod=VIEW 不实际发放）
   - 奖池 name 改小写点分：`bus.normal`/`bus.flying`；里程拆两独立奖池 `bus.mileage.normal`/`bus.mileage.flying`（原 `DIDIBUS_LUCKYDRAW_*`、单一名 `DIDIBUS_MILEAGE` 的 award 条目废弃；`mod_common_event` DIDIBUS_MILEAGE 保留作 award_id 引用）
   - 模块接口：`m/luckydraw/*` → `m/lucky-gift/*`，新增 `m/lucky-mileage/records|result`；`/draw` 响应新增 `luckyMileage` 字段；`/detail` 五块中 `luckydraw` → `luckyGift`
   - 每次 /draw 写 2 批 `mod_luckydraw_record`（topic=lucky-gift/lucky-mileage）；分布式锁 key 含模块名（`luckydraw-draw-didibus-v202609-lucky-gift-{userId}-{pool}`）
8. **【需求理解不一致→实现待改】榜单加成时机与口径错误**（2026-09-09 与需求方确认）：
   - **需求口径**：探索获得的背包礼物仅入背包、不影响榜单；礼物被**赠送**时按 `金币数 × buff` 计入送礼/收礼总榜（buff = gifts 白名单 value 倍率）
   - **当前实现（v1.5.0）**：在**探索时**按 buff 加分（`applyRankBuff`），且 `rank.update` transNo=null 被 (player,'') 幂等去重导致仅首次 /draw 生效（实测：两次 draw 应 4.5+3.5=8，实际 4.5）；赠送时按 coin×1 计分、未乘 buff
   - 用例已按需求口径更新：003 新增高倍率礼物（1005 ×3.0）断言、004#16 改为「探索不影响榜单」——✅ 开发修复后复跑全部转绿（2026-09-09，003 14/14、004 17/17）；同期 #11 期外发券也已修复
9. **【信息→005#2 降级为提示】余额不足错误信息未透出 `didibus_not_enough`**（2026-09-09 实测）：余额不足 / 未开放大区均返回 `Request processing failed: null`，notEnoughMsg 配置疑似未生效；005 改为仅断言「报错+无副作用」，错误文本作为 message 提示
10. ~~**送礼消息券入账无幂等（003#11 fail）**~~ ✅ 已修复（v1.5.0，2026-09-09）：账户体系迁移 mod_account，送礼入账 transNo=`send_{orderNo}`/`recv_{orderNo}`，`mod_account_user_record` 唯一键 (biz, trans_no) INSERT IGNORE 幂等；orderNo 为空跳过入账并 warn
11. ~~**期外送礼消息仍发券（003#12 fail，v1.5.0 未修）**~~ ✅ 已修复（2026-09-09 复测，003#14 转绿：期外消息券与榜单均不变）
12. **【v1.5.0 架构变更】账户体系迁移 mod_account**（2026-09-09 设计更新 + 接口文档 v1.1.0，本次已同步用例）：
    - `active_coin`/`active_user_account`/`active_user_account_log` → `mod_account`（id=901，name=`DIDIBUS-MILEAGE`）/`mod_account_user`/`mod_account_user_record`（唯一键 (biz, trans_no) 幂等，amount 带符号、含 total_amount）
    - BusinessConfig `ticketAccountType` → `accountName`；LuckydrawModule 账户配置 `type: ACCOUNT` + `accountName`；daily-entry 奖励 `award_type=ACCOUNT`（award_id=901 → mod_account.id）
    - `/draw` transNo 由 Active 层 `ID.id("DRAW")` 生成（前端不传），lucky-gift/lucky-mileage 共用；pool/count 校验提前到 Active 层（`invalid parameter`）
    - `/m/account/detail` 返回 `accounts: [{name:"DIDIBUS-MILEAGE", mine}]`（type 废弃）；`/m/account/records` 请求 name 必填=DIDIBUS-MILEAGE，响应含 type=INCREASE/DECREASE、totalAmount
    - ⚠️ ~~Bug #8（榜单加成 transNo=null 被去重）~~ → 根因确认为**需求理解不一致**（见 #8），已按正确口径修复并验证通过（2026-09-09，003#10 / 004#16 转绿）
13. ~~**结算结果未写入 mod_common_rank_result**~~ ✅ 非 bug（2026-09-09 确认）：`mod_common_rank_result` **表已废弃**，结算结果不再落库；结算状态以 `mod_common_round.status`=200 为准，结算正确性由发奖记录（mod_common_award_record）断言。009/010 已改为轮次状态位+发奖记录校验（009 17 步、010 16 步）
14. ~~**总榜（mainRound）结算发奖双倍**~~ ✅ 已修复（2026-09-10 复测，010 送礼发奖 check 转绿：S1=[4110,14328]、S4=[4109]、Top1 view_only 恰好 1 条、收礼榜同样单份，全场 9 条无重复）。原现象：单次 cron 触发内同一玩家每个奖励产生 2 条 `mod_common_award_record`（create_time 相同、order_no 相邻）；日榜（timeRound）无此问题
15. ~~**收礼榜贡献者奖励（AWARD_CONTRIBUTORS）未发放**~~ ✅ 造数问题（2026-09-10 确认）：直写 `mod_common_rank_record` 不驱动贡献者结算；010 造数改为**真实 gift_send 消息链路**后贡献者奖励正常发放（010#14 转绿：S1/S2/S4 按 stage=1/2/3 得 14328/14327/984）。需求口径（2026-09-09 确认）：仅收礼总榜有贡献者奖励
16. ~~**收礼贡献者结算跨大区串数据（010#15 fail）**~~ ✅ 造数问题（2026-09-10 确认）：ko 造数曾复用 in 的收礼 Top1 uid（13125），同一 uid 出现在两个大区榜单在生产上不会发生；ko 改用专属用户（S6→S7）后 010 **17/17 全绿**（ko 贡献者奖励正确发给 S6、S1 恰好 1 次）。经验：造数时同一 uid 不得跨大区上榜
