# 2612 年度 PK 接口测试用例（API-PK2612）

- 任务：TK-0649
- 需求：文档 3458《【2026年度盛典】赛事PK》、文档 3459 奖励配置表、文档 3452 需求澄清（Q01–Q26）
- 方案：TK-0607 `TECH_DESIGN` v15
- 环境：测试环境 `https://api.test.cinta.team`
- 业务时间：`l-debug-timestamp` 模拟，活动期 2026-12-17 11:00 ~ 2027-01-02 23:59:59（UTC+8）
- 脚本：`projects/active/pk/tests/pk2612-*.test.ts`

## 一、配置与路由（CFG）

| 编号 | 场景 | 优先级 | 请求 | 预期 | 需求追溯 |
|---|---|---|---|---|---|
| API-PK2612-CFG-01 | 完整 biz 活动期内可访问 | P0 | `POST /active/v3/pk-v202612/detail` | `biz=pk-v202612`，`beginTime=2026-12-17T11:00:00+08:00A`，`endTime=2027-01-02T23:59:59+08:00A` | Q01/Q02/Q25 |
| API-PK2612-CFG-02 | alias 路由解析到 2612 | P0 | `POST /active/v3/pk/detail` | 同 CFG-01 | 文档 3639（alias=pk） |
| API-PK2612-CFG-03 | 大区为 in/vi/ph/ko，无 ar | P0 | `POST /active/v3/pk-v202612/config` | `enableLocales=[in,vi,ph,ko]` | Q03 |
| API-PK2612-CFG-04 | 活动起止为 UTC+8 绝对时间 | P0 | `POST /active/v3/pk-v202612/config` | `startTime=1797...`（2026-12-17 11:00 +08），`finishTime` 对应 2027-01-02 23:59:59 | Q02/Q25 |
| API-PK2612-CFG-05 | alias config 与完整 biz 一致 | P1 | `POST /active/v3/pk/config` | biz/时间/大区完全一致 | 文档 3639 |
| API-PK2612-CFG-06 | 开始前超过平台 7 天宽限期不可访问 | P0 | `POST /active/v3/pk-v202612/detail`，debug=2026-12-09 12:00 | 业务 `status != 0`，且活动已注册（非 Active not found）；平台对活动链接前后各放宽 7 天 | Q02 |
| API-PK2612-CFG-07 | 结束后超过 7 天宽限期不可访问 | P0 | 同上，debug=2027-01-10 12:00 | 业务 `status != 0`，且活动已注册 | Q25 |
| API-PK2612-CFG-08 | alias 开始前超过宽限期无当期 pk 活动 | P1 | `POST /active/v3/pk/detail`，debug=2026-12-09 12:00 | 业务 `status != 0` | alias 唯一性约束 |
| API-PK2612-CFG-09 | 旧 biz 六周年期内仍可访问 | P0 | `POST /active/v3/pk-v202608/detail`，debug=2026-08-18 | `biz=pk-v202608`，起止时间未变 | 复用隔离 |
| API-PK2612-CFG-10 | 旧 biz 在 2612 活动期不返回新数据 | P1 | `POST /active/v3/pk-v202608/detail`，debug=2026-12-18 | 业务错误，不回退到 2612 | 复用隔离 |
| API-PK2612-CFG-11 | ar 未启用 | P1 | `POST /active/v3/pk-v202612/m/player_in_n_200/detail`，locale=ar | `detail=null` | Q03 |
| API-PK2612-CFG-12 | in 已启用 | P1 | 同上，locale=in | `detail.key='-'` | Q03 |

## 二、17 天赛程与轮次（SCH）

| 编号 | 场景 | 优先级 | 请求 | 预期 | 需求追溯 |
|---|---|---|---|---|---|
| API-PK2612-SCH-01 | 初始化 32 个模块轮次 | P0 | 对 32 个 topic 调用 `POST /m/{topic}/init` | 全部成功；幂等 | TK-0607 6.1.3 |
| API-PK2612-SCH-02~17 | 陪陪榜印尼 8 个 topic 主轮次/日榜/1V1 轮次 | P0 | `POST /m/{topic}/detail`，locale=in | 主轮次起止、日榜 4/4 天、1V1 每阶段 4 天 8 场（00-17、18-23）；阶段 3=12/25-28，阶段 4=12/29-1/1，复活 12/29，决赛 1/2 | 3458 赛事表（需求方 2026-11-25 确认） |
| API-PK2612-SCH-18~25 | 陪陪榜非印尼 8 个 topic | P0 | 同上，locale=vi/ph/ko | 同上（N进100、100进50、50进20、24进10、复活 12/29、决赛 1/2） | 3458 赛事表 |
| API-PK2612-SCH-26~31 | 房间/家族印尼六阶段 | P0 | 同上，locale=in | 阶段 12/17-20、12/21-24、12/25-27、12/28-30、12/31、1/2 | 3458 赛事表（需求方 2026-11-25 确认） |
| API-PK2612-SCH-32~33 | 房间/家族非印尼总榜 | P0 | locale=vi/ph/ko | 12/17 11:00 ~ 2027-01-02 23:59:59 | 3458 赛事表 |
| API-PK2612-SCH-34~35 | 用户/CP 17 日榜 + 总榜 | P0 | locale=in/vi/ph/ko | 17 个本地日榜（12/17~1/2），总榜到 2027-01-02 23:59:59 | 3458 赛事表 |

## 三、奖励配置（AWD）

| 编号 | 场景 | 优先级 | 请求 | 预期 | 需求追溯 |
|---|---|---|---|---|---|
| API-PK2612-AWD-01 | 奖励总行数与 ADD/VIEW 分布 | P0 | 只读 SQL `mod_common_award` | 512 行，470 ADD / 42 VIEW（含 7 条 EVENT=14） | 需求方 2026-11-25 确认 |
| API-PK2612-AWD-02 | YAML 引用的 54 个 awardName 均有配置 | P0 | 只读 SQL + YAML 引用清单 | 无缺失（`room-contributor` 不在需求内） | 3459 / 需求方确认 |
| API-PK2612-AWD-03 | 无孤儿 awardName | P1 | 只读 SQL | 所有配置 name 均被 YAML 引用 | TK-0607 7.3 |
| API-PK2612-AWD-04~14 | 关键名次奖励内容 | P0/P1 | 只读 SQL | 房间/家族/陪陪/用户/CP 关键名次道具 ID、数量、天数、发放对象与 3459 一致 | 3459 |
| API-PK2612-AWD-15 | 42 项 VIEW 不含普通自动发奖道具 | P1 | 只读 SQL | VIEW 42 行且类型均为 CUSTOM/COIN/BANNER/GIFT 等 | Q18 |
| API-PK2612-AWD-16 | award-details 接口可用 | P1 | `POST /active/v3/pk-v202612/award-details` | 返回 >=20 模块、>=10 个有奖励模块 | TK-0607 5.2 |
| API-PK2612-AWD-19 | room-contributor 不配置 | P1 | 只读 SQL | `room-contributor` 0 行 | 3459 / 需求方确认 |
| API-PK2612-AWD-20 | 保留 7 条 EVENT=14 | P1 | 只读 SQL | `award_type='EVENT'` 7 行 | 需求方 2026-11-25 确认 |
| API-PK2612-AWD-21 | 贡献者奖励发放对象 | P0 | 只读 SQL | 所有 `-contributor` 奖励 `player_type=USER` | 3459 发放对象 |
| API-PK2612-AWD-22 | 家族成员铭牌发放对象 | P0 | 只读 SQL | `family_in_*` 的 `NAMEPLATE` 奖励 `player_type=USER` | 3459「家族内所有用户」 |

## 四、礼物与 Buff（GIFT/BUF）

| 编号 | 场景 | 优先级 | 请求 | 预期 | 需求追溯 |
|---|---|---|---|---|---|
| API-PK2612-GIFT-01 | 活动礼物展示 | P1 | `POST /active/v3/pk-v202612/active-gifts` | 12 个礼物，stage 1/2/0 = 4/4/4，special=2 | Q22 兜底 |
| API-PK2612-GIFT-02 | 2 倍礼物计分 | P0 | `POST /__consumer/funbit.gift_send` ×2 + 用户榜查询 | 2 倍礼物积分增量 = 1 倍礼物增量 × 2 | 3458 改动点 2 / Q26 |
| API-PK2612-GIFT-03 | 未配置礼物不计分 | P0 | 送礼 + 用户榜查询 | 积分增量 0 | Q26 |
| API-PK2612-GIFT-04 | 日榜 key 正确 | P1 | 用户榜查询 | `round.key=20261218` | 3458 日榜 |
| API-PK2612-BUF-01 | 1V1 胜场数据前置 | P1 | 只读 SQL `mod_buff11pk_pair` | 胜场记录 > 0；无数据记 BLOCKED | Q24 |
| API-PK2612-BUF-02 | 获胜 Buff 映射 | P0 | 只读 SQL `mod_buff11pk_pair` + `mod_buffpk_player_buff` | 1/2→1.0、3→1.05、4→1.1、5→1.15、6→1.2 | Q24 / TK-0607 3.3 |

## 五、旧活动回归（REG）

| 编号 | 场景 | 优先级 | 请求 | 预期 | 需求追溯 |
|---|---|---|---|---|---|
| API-PK2612-REG-01 | 旧 biz detail 不变 | P0 | `POST /active/v3/pk-v202608/detail`，debug=2026-08-18 | 六周年起止时间不变 | Q05/Q16 |
| API-PK2612-REG-02 | 旧 biz 主轮次可读 | P1 | `POST /m/player_n_100/detail`，locale=vi | `biz=pk-v202608`，`key='-'` | 复用隔离 |
| API-PK2612-REG-03 | 旧 biz 日榜仍在 | P1 | 同上 | 包含 `20260817/18/19` | 复用隔离 |
| API-PK2612-REG-04 | 旧 biz 家族总榜可读 | P1 | `POST /m/family/detail`，locale=vi | `biz=pk-v202608` | 复用隔离 |

## 已确认口径（需求方 2026-11-25）

1. **赛程以 3458 赛事表为准**：陪陪 1V1 两阶段各 4 天 8 场（12/25-28、12/29-1/1），复活 12/29，决赛 1/2；房间/家族 100进50 12/25-27、50进20 12/28-30、20进10 12/31、决赛 1/2。
2. **奖励 470 ADD / 42 VIEW / 512 行**：保留 7 条 `EVENT=14`，不配置 `room-contributor`。
3. **room-contributor 以需求为准**：3459 未列，不配置。

## 风险

1. Q22 礼物 ID/Buff：Deadline 2026-12-02，当前按六周年兜底；正式数值提供后需更新 GIFT 用例期望。
2. BUF 用例数据：需要测试环境 1V1 全链路数据，当前无写入授权时按 BLOCKED 处理。
3. dev 当前分支 YAML/SQL 仍为 6 场/1/1/505 行，需按上述确认口径调整后才可通过本用例。
