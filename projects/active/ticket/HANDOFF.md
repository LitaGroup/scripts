---
description: "Lita 六周年周年通票（ticket-v202608）技术交接文档"
type: docs
version: 1.0.0
date: 2026-09-01
---

# ticket-v202608 技术交接文档（HANDOFF）

> 面向接手维护/运维同学的一份速览手册。详细设计见 [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)，产品功能见 [FEATURE.md](FEATURE.md)，初始化 SQL 见 [init.sql](init.sql)。

## 目录

- [1. 活动概览](#1-活动概览)
- [2. 代码与配置位置](#2-代码与配置位置)
- [3. 架构与模块组成](#3-架构与模块组成)
- [4. 对外接口](#4-对外接口)
- [5. 核心链路](#5-核心链路)
- [6. 消息消费映射](#6-消息消费映射)
- [7. 数据存储](#7-数据存储)
- [8. 上线/初始化清单](#8-上线初始化清单)
- [9. 排障指南](#9-排障指南)
- [10. 已知陷阱](#10-已知陷阱)
- [11. 遗留事项](#11-遗留事项)

---

## 1. 活动概览

| 项 | 内容 |
|:---|:---|
| biz | `ticket-v202608` |
| 活动名 | Lita 六周年周年通票 |
| 大区 | in / vi / ph / ko / ar（ar 为测试大区，提前开启） |
| 活动周期 | 2026-08-13 ~ 2026-08-31（`finishTime`） |
| 经验获取截止 | 2026-08-29 23:59:59（`expEndTime`，之后不再加经验，仍可查看/补发奖励） |
| 玩法 | 消耗/送礼 1:1 累计经验 + 今日任务（P1D）+ 累计挑战（P19D 单轮次）→ 升级发奖（Lv1–100 + Lv100 后每 10,000 经验循环发 10 蜡烛） |

## 2. 代码与配置位置

| 内容 | 位置 |
|:---|:---|
| 活动主类（全部入口/Consumer/Cron） | `src/main/java/gg/lita/active/v3/active/ticket/TicketActive.java` |
| 活动配置类 | `src/main/java/gg/lita/active/v3/active/ticket/TicketConfig.java` |
| 活动示例配置（以 Nacos 为准） | `src/main/java/gg/lita/active/v3/active/ticket/ticket-v202608.yaml` |
| Nacos | dataId: `ticket-v202608.yaml`，group: `active-v3` |
| 初始化 SQL（上线前在 active 库执行） | `doc/202608/ticket-v202608/init.sql` |

无 Business 层、无自定义 Controller：HTTP 由 `DefaultController` 自动路由到 `@ActiveRequest` 方法。

## 3. 架构与模块组成

```
TicketActive → LevelModule ×2（ticket / ticket-consume）
             → TaskModule ×27（20 每日任务 + R02A 中间模块 + 6 累计挑战）
             → Coordinator → 基础设施层
```

| 模块实例 | 类型 | 职责 |
|:---|:---|:---|
| `ticket` | LevelModule | 总经验账户、等级计算、等级/循环奖励记账（`awardStrategy=USER`，需 pick 发放） |
| `ticket-consume` | LevelModule | 消耗经验 1:1 累计（消耗卡片展示），单级无奖励，**仅由送礼路径写入** |
| `G01`~`R01`（20 个） | TaskModule | 今日任务，P1D 轮次，`stageType=REPEAT`，`maxTimes=1`，`awardStrategy=AUTO` |
| `R02A` | TaskModule | 充值中间追踪：每日累计充值 ≥1000 金币 → settle 触发 `6TH_RECHARGE_DAILY` EVENT |
| `M01/B05/C06/C07/R02/P02` | TaskModule | 累计挑战，P19D 单轮次（跨天累计不重置）；B05/C06/C07/R02 为 STAGE，M01/P02 为 REPEAT |

**排期门控**：`dailySchedule`（key=`yyyyMMdd`）控制每日开启哪些任务；互斥任务（G03↔G04、B01↔B02↔B03）靠排期每日只排一项实现。未排期任务不统计、不展示。

## 4. 对外接口

统一前缀：`POST /active/v3/ticket-v202608/{path}`

| 路径 | 方法 | 说明 |
|:---|:---|:---|
| `/enter` | `enter(EnterRequest{page})` | 客户端进入页面上报：`home`→G01、`view`→G08、`wish`→G09、`create`→M01（整期幂等，无排期检查） |
| `/detail` | `detail()` | 通票详情：经验/等级 + 今日任务 + 累计挑战 + matrix（gap/任务完成数/消耗经验） |
| `/pick` | `pick()` | 批量领取未发放等级奖励（`level=-1` 全部），返回合并后的弹窗奖励列表 |
| `/task/list` | `taskList({tab})` | 任务列表（`tab=daily/challenge`）+ 消耗经验卡片数值 |
| `/p/init` | pipeline | 初始化所有任务模块轮次记录（上线必跑） |

## 5. 核心链路

### 5.1 任务经验回流（主要经验来源）

```
任务行为 → TaskModule.update → REPEAT/STAGE 达成 → AUTO settle
  → AwardCoordinator 查 mod_common_award(6TH_EXP_{taskId}) → EVENT 类型
  → 写 mod_common_event_record(name=6TH_EXPERIENCE, count=任务经验, locale)
  → basic-scanner 扫表逐条发射 ModCommonEventRecordMessage
  → TicketActive.handleEventRecord → handleExpEvent
  → LevelModule(ticket).update 加经验 → 记账等级/循环奖励(mod_level_user_award)
  → 用户调 /pick（或 /detail 后由前端触发）批量发放 → 合并弹窗
```

- 所有任务共享 1 条事件定义：`mod_common_event(id=3, name=6TH_EXPERIENCE)`
- scanner 按次发射增量，`count` 即本次任务经验，消费端直接用，无需差值计算

### 5.2 消耗经验（送礼双写）

```
GIFT_SEND 消息 → handleGiftSend
  → 礼物须命中 expSources.expGifts，否则忽略
  → 若命中 pkGifts 且 P01 当日排期 → P01.update（transNo={orderNo}_P01）
  → 所有 expGifts 按 totalCoin 1:1 → addExpWithConsume（transNo={orderNo}_EXP）
      双写 ticket + ticket-consume
```

**两条经验写入路径职责区分**：

| 方法 | 写入目标 | 触发 |
|:---|:---|:---|
| `addExp()` | 仅 `ticket` | 任务经验（`6TH_EXPERIENCE` 回流） |
| `addExpWithConsume()` | `ticket` + `ticket-consume` | 送礼消耗（GIFT_SEND，按 totalCoin 1:1） |

### 5.3 充值里程碑（两阶段管道）

```
RECHARGE_STATUS_LOG → handleRecharge → R02A.update(value=diamonds)  [P1D 每日重置]
  → 当日累计 ≥1000 → settle EVENT 6TH_RECHARGE_DAILY
  → handleEventRecord → updateRechargeMilestone → R02.update（transNo=R02_{userId}_{dayKey} 天级去重）
  → R02 STAGE 累计 3 天 → settle 6TH_EXP_R02（600 经验）
```

### 5.4 防重机制

| 环节 | 防重键 |
|:---|:---|
| 经验入账 | `mod_level_user_experience_record` 唯一键 `(biz, topic, player, transNo)`，transNo 为 `varchar(64)` |
| 等级/循环奖励 | `mod_level_user_award` 唯一键 `(biz, topic, player, level)` |
| 领取并发 | `LevelPickAction` 内置分布式锁 `active-v3:level:pick:{userId}` |
| 每日任务 | transNo 含 dayKey（如 `G01_{userId}_{yyyyMMdd}`） |
| 关系挑战 B05 | transNo=`{player}-{relation_id}` 全局去重，保证 3 个不同用户 |

## 6. 消息消费映射

`TicketActive` 中的 `@ActiveConsumer`：

| Consumer | 消息 | 处理 |
|:---|:---|:---|
| `handleMomentPraise` | PRAISE_RECORD_LOG | G02：Moment 点赞（srcType=moment，话题命中 `momentTopics`，transNo=`{srcId}_{userId}`） |
| `handleGiftSend` | GIFT_SEND | P01 任务 + 消耗经验双写（见 5.2） |
| `handleRecharge` | RECHARGE_STATUS_LOG | R02A 充值累计（见 5.3） |
| `handleOrderStatus` | PLAY_ORDER_STATUS_LOG | G05：mainStatus=30 完单 |
| `handleRoomStay` | ROOM_DAILY_STAY | G03/G04：在房时长（totalTime/60000 分钟） |
| `handleVoiceRoomAccess` | VOICE_ROOM_ACCESS_LOG | G06：进房（type=in） |
| `handleOnMic` | VOICE_ROOM_MIC_LOG | G07：上麦（logType=upMic） |
| `handleEventRecord` | MOD_COMMON_EVENT_RECORD | EVENT 事件路由（见下表） |

`handleEventRecord` 事件路由：

| EVENT name | 处理 | 目标任务 |
|:---|:---|:---|
| `6TH_EXPERIENCE` | `handleExpEvent` | ticket 加经验（校验 expEndTime） |
| `6TH_PK_GIFT` / `6TH_GARDEN_GIFT` / `6TH_SEED_COST` / `6TH_RELATION_UPGRADE` / `6TH_CANDLE_CONTRIBUTE` / `6TH_CAKE_CALL` / `6TH_RECHARGE_DRAW` | `updateDailyTask` | P01 / B01 / B02 / B03 / C01 / C02 / R01 |
| `6TH_CAKE_OWN` | `updateCakeOwn` | C03/C04/C05（每日）+ C06/C07（挑战，layers）；extra 含 `color` 时 C07 额外累计 colorful |
| `6TH_GARDEN_RELATION_CREATE` | `updateRelationCreate` | B05（extra: `{"relation_id":N,"type":1/2/3}`，1=CP 2=friend 3=family） |
| `6TH_PK_DAILY_TOP_1` | `updateChallengeTask` | P02（最多 39 次） |
| `6TH_RECHARGE_DAILY` | `updateRechargeMilestone` | R02 |

Cron：`@ActiveCron("0 0 2 1 9 ?")` `awardReissueCron` —— 活动结束补发（见「遗留事项」）。

## 7. 数据存储

全部复用模块现有表，无新增表：

| 表 | 用途 |
|:---|:---|
| `mod_level_user_experience` | 经验账户（topic=ticket / ticket-consume） |
| `mod_level_user_experience_record` | 经验流水（transNo 防重，`varchar(64)`） |
| `mod_level_user_award` | 等级/循环奖励记账（picked 标记领取状态） |
| `mod_task_user_round` / `mod_task_user_round_step` | 任务进度与结算记录 |
| `mod_common_event` | 事件定义（15 条，id 1–15，见 init.sql） |
| `mod_common_event_record` | 事件记录（含 `locale` 列，basic-scanner 扫表发射） |
| `mod_common_award` | 奖励定义（level 奖励 + 各任务 `6TH_EXP_*`） |

无活动自建 Redis Key。

## 8. 上线/初始化清单

1. **SQL**：在 active 库执行 `doc/202608/ticket-v202608/init.sql`（mod_common_event 事件定义 + mod_common_award 奖励定义）
2. **Nacos**：发布 `active-v3/ticket-v202608.yaml`（以代码库中 yaml 为模板，注意大区时间后缀语法，如 `R|...ar`、`A` 等）
3. **初始化管道**：调用 `POST /active/v3/ticket-v202608/p/init`，初始化全部 27 个任务模块轮次
4. **验证**：
   - `POST /active/v3/ticket-v202608/enter {"page":"home"}` → G01 完成 → 经验 +100
   - `POST /active/v3/ticket-v202608/detail` → 返回等级/任务
   - `POST /active/v3/ticket-v202608/pick` → 返回发放奖励

## 9. 排障指南

| 现象 | 排查点 |
|:---|:---|
| 任务完成但经验未到账 | ① `mod_task_user_round_step` 是否已 settle；② `mod_common_event_record` 是否有 `6TH_EXPERIENCE` 记录；③ basic-scanner 是否发射；④ `handleEventRecord` 日志（入口会打印完整消息字段） |
| 经验被跳过 | 看日志关键字：`EXP 不在有效期内`（过 expEndTime）/ `EXP 数量无效` / `每日任务未在排期中` |
| 经验重复/丢失 | 查 `mod_level_user_experience_record` 按 `(biz, topic, player, transNo)`，transNo 冲突会被唯一键拒绝（视为重复投递，正常忽略） |
| 奖励未发放 | 查 `mod_level_user_award` 该用户 `picked=false` 记录；调 `/pick` 手动触发；检查领取锁 `active-v3:level:pick:{userId}` |
| 每日任务未触发 | 确认 `dailySchedule[yyyyMMdd]`（注意是**大区当地时间**）包含该任务；排期跳过有 info 日志 |
| 送礼未加经验 | 确认 giftId 在 `expSources.expGifts`；日志 `非经验值配置的礼物，跳过` |
| 循环奖励 | Lv100 后每 10,000 经验一级（level 101+），同样走 `mod_level_user_award` + pick 发放 |

关键日志均为 info 级，搜索关键字：`收到 EVENT 事件`、`每日任务执行`、`EXP 增加完成`、`buildUserContext`。

## 10. 已知陷阱

1. **transNo 全链路是 String**（`varchar(64)`），不要传 long；经验流水唯一键防重依赖它。
2. **消息消费时 `prevTime` 不能为 0**：`ActiveContext.timestamp` 来自消息的 `prevTime`，为 0 会导致任务有效期校验失败被跳过。模拟消息测试时务必设置。
3. **每日任务排期按大区当地时间**（`LDate.format("yyyyMMdd", timestamp, locale)`），配置 key 是 `yyyyMMdd` 不是 `MM-dd`。
4. **G02 是按 Moment 作者加经验**（点赞消息中的 userId 是点赞人，需取 `moment.authorId`），且需话题命中 `momentTopics`。
5. **`ticket-consume` 只含送礼经验**：任务经验不写入消耗账户，消耗卡片 = 纯 1:1 消耗。
6. **R02A 是内部中间模块**：不在 `tasks.daily/challenge` 注册表中，不对外展示，仅用于驱动 R02。
7. **事件奖励 locale**：`AwardCoordinator.resolveLocale(playerType, player)` 在写入 `mod_common_event_record` 时填充，scanner 消息带回 locale。
8. **配置时间后缀语法**：`startTime` 支持大区差异化（如 `R|...ar` 提前开、`A` 后缀），改时间配置时勿破坏该语法。

## 11. 遗留事项

| 项 | 状态 | 说明 |
|:---|:---|:---|
| `awardReissueCron` | ⚠️ TODO | 方法体只有日志，未实现扫 `mod_level_user_award(picked=false)` 逐用户 pick 补发；活动结束后如需补发需先补实现或手工处理 |
| `handleRecharge` payStatus 过滤 | ⚠️ 已注释 | 原设计 payStatus=30 才计入，当前代码注释掉了该判断，所有状态变更都会计入 R02A（依赖 recharge 记录实际状态） |
| G06 重复触发 | 注意 | `handleRoomStay` 中 G06 逻辑已注释，改由 `handleVoiceRoomAccess`（VOICE_ROOM_ACCESS_LOG）实现 |
| 子活动 EVENT 对齐 | 依赖外部 | B01–B03/C01–C05/R01/P02/B05 等 EVENT 由分会场活动发送，name 与 extra 格式以本文档第 6 节为准 |

---

**维护人**: Lita R&D Team

**更新记录**:
- v1.0.0 (2026-09-01): 初始版本，整理自 TECHNICAL_DESIGN.md v2.0.0 与当前代码实现
