# 2612 年度 PK 用例 ↔ 检查点覆盖表（COVERAGE）

- 任务：TK-0649
- 用例文档：`projects/active/pk/tests/CASES.md`
- 脚本目录：`projects/active/pk/tests/pk2612-*.test.ts`

| 用例编号 | 脚本 | check / act 标题 | 结果（待执行） |
|---|---|---|---|
| API-PK2612-CFG-01 | pk2612-001-config.test.ts | 完整 biz pk-v202612 在活动期内可访问，返回 biz 与起止时间 | 待执行 |
| API-PK2612-CFG-02 | pk2612-001-config.test.ts | alias pk 在活动期内解析到 2612 活动，起止时间一致 | 待执行 |
| API-PK2612-CFG-03 | pk2612-001-config.test.ts | 完整 biz config 的大区为 in/vi/ph/ko，无 ar | 待执行 |
| API-PK2612-CFG-04 | pk2612-001-config.test.ts | config 的 startTime/finishTime 与需求 UTC+8 绝对时间一致 | 待执行 |
| API-PK2612-CFG-05 | pk2612-001-config.test.ts | alias pk config 与完整 biz 一致（biz/时间/大区） | 待执行 |
| API-PK2612-CFG-06 | pk2612-001-config.test.ts | 活动开始前超过平台 7 天宽限期不可访问（2026-12-09 12:00） | 待执行 |
| API-PK2612-CFG-07 | pk2612-001-config.test.ts | 活动结束后超过平台 7 天宽限期不可访问（2027-01-10 12:00） | 待执行 |
| API-PK2612-CFG-08 | pk2612-001-config.test.ts | alias pk 在活动开始前超过宽限期不可访问（2026-12-09） | 待执行 |
| API-PK2612-CFG-09 | pk2612-001-config.test.ts | 旧 biz pk-v202608 在六周年活动期仍可访问且时间未变 | 待执行 |
| API-PK2612-CFG-10 | pk2612-001-config.test.ts | 旧 biz pk-v202608 在 2612 活动期不返回 2612 数据 | 待执行 |
| API-PK2612-CFG-11 | pk2612-001-config.test.ts | ar 大区未启用：player_in_n_200 在 ar 无详情 | 待执行 |
| API-PK2612-CFG-12 | pk2612-001-config.test.ts | in 大区已启用：player_in_n_200 在 in 返回主轮次 | 待执行 |
| API-PK2612-SCH-01 | pk2612-002-schedule.test.ts / pk2612-007-schedule-db.test.ts | 初始化全部 32 个榜单元数据（幂等）；002 接口断言 + 007 SQL 辅助断言 | 待执行 |
| API-PK2612-SCH-02 | pk2612-002-schedule.test.ts | player_in_n_200 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-03 | pk2612-002-schedule.test.ts | player_in_200_100 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-04 | pk2612-002-schedule.test.ts | player_in_100_46 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-05 | pk2612-002-schedule.test.ts | player_in_1v1_100_46 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-06 | pk2612-002-schedule.test.ts | player_in_50_20 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-07 | pk2612-002-schedule.test.ts | player_in_1v1_50_20 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-08 | pk2612-002-schedule.test.ts | player_in_n_4 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-09 | pk2612-002-schedule.test.ts | player_in_20_1 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-10 | pk2612-002-schedule.test.ts | player_n_100 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-11 | pk2612-002-schedule.test.ts | player_100_50 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-12 | pk2612-002-schedule.test.ts | player_50_20 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-13 | pk2612-002-schedule.test.ts | player_1v1_50_20 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-14 | pk2612-002-schedule.test.ts | player_24_10 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-15 | pk2612-002-schedule.test.ts | player_1v1_24_10 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-16 | pk2612-002-schedule.test.ts | player_n_4 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-17 | pk2612-002-schedule.test.ts | player_10_1 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-18 | pk2612-002-schedule.test.ts | room_in_n_200 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-19 | pk2612-002-schedule.test.ts | room_in_200_100 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-20 | pk2612-002-schedule.test.ts | room_in_100_50 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-21 | pk2612-002-schedule.test.ts | room_in_50_20 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-22 | pk2612-002-schedule.test.ts | room_in_20_10 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-23 | pk2612-002-schedule.test.ts | room_in_10_1 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-24 | pk2612-002-schedule.test.ts | family_in_n_200 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-25 | pk2612-002-schedule.test.ts | family_in_200_100 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-26 | pk2612-002-schedule.test.ts | family_in_100_50 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-27 | pk2612-002-schedule.test.ts | family_in_50_20 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-28 | pk2612-002-schedule.test.ts | family_in_20_10 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-29 | pk2612-002-schedule.test.ts | family_in_10_1 主轮次与轮次时间（in） | 待执行 |
| API-PK2612-SCH-30 | pk2612-002-schedule.test.ts | room 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-31 | pk2612-002-schedule.test.ts | family 主轮次与轮次时间（vi/ph/ko） | 待执行 |
| API-PK2612-SCH-32 | pk2612-002-schedule.test.ts | user 主轮次与轮次时间（in/vi/ph/ko） | 待执行 |
| API-PK2612-SCH-33 | pk2612-002-schedule.test.ts | couple 主轮次与轮次时间（in/vi/ph/ko） | 待执行 |
| API-PK2612-AWD-01 | pk2612-003-awards.test.ts | 奖励配置总行数为 512，ADD 470、VIEW 42（需求方 2026-11-25 确认） | 待执行 |
| API-PK2612-AWD-02 | pk2612-003-awards.test.ts | YAML 引用的 54 个 awardName 均有奖励配置（无缺失结算奖励） | 待执行 |
| API-PK2612-AWD-03 | pk2612-003-awards.test.ts | 奖励配置不存在未被 YAML 引用的孤儿 awardName | 待执行 |
| API-PK2612-AWD-04 | pk2612-003-awards.test.ts | 房间榜 N进200 第1名：A级房间铭牌 163，7天 | 待执行 |
| API-PK2612-AWD-05 | pk2612-003-awards.test.ts | 房间榜 N进200 贡献TOP1：A级气泡 1093，7天 | 待执行 |
| API-PK2612-AWD-06 | pk2612-003-awards.test.ts | 家族榜 N进200 第1名：A级铭牌 10391，5天 | 待执行 |
| API-PK2612-AWD-07 | pk2612-003-awards.test.ts | 陪玩榜 N进200 第1名：麦位框 14939 + 铭牌 10373，7天 | 待执行 |
| API-PK2612-AWD-08 | pk2612-003-awards.test.ts | 陪玩榜 N进200 第4名：麦位框 14939 + 铭牌 10374，5天 | 待执行 |
| API-PK2612-AWD-09 | pk2612-003-awards.test.ts | 陪玩榜 N进200 贡献TOP1：麦位框 14940，5天 | 待执行 |
| API-PK2612-AWD-10 | pk2612-003-awards.test.ts | 陪玩榜 决赛 第1名 ADD 奖励与 3459 一致 | 待执行 |
| API-PK2612-AWD-11 | pk2612-003-awards.test.ts | 陪玩榜 1V1 100进46 获胜奖励：麦位框 14942 + 飘屏 147，5天 | 待执行 |
| API-PK2612-AWD-12 | pk2612-003-awards.test.ts | 陪玩榜 1V1 50进20 获胜奖励：飘屏 148 + 声波 145，7天 | 待执行 |
| API-PK2612-AWD-13 | pk2612-003-awards.test.ts | 用户榜 日榜第1名：麦位框 14946 + 气泡 1098 + EVENT 通票，5天 | 待执行 |
| API-PK2612-AWD-14 | pk2612-003-awards.test.ts | 用户榜 总榜第1名 ADD：铭牌/主页特效/麦位框/头像框/声波/座驾，125天 | 待执行 |
| API-PK2612-AWD-15 | pk2612-003-awards.test.ts | CP 榜 总榜第1名（女）：头像框/麦位框/飘屏/座驾，125天 | 待执行 |
| API-PK2612-AWD-16 | pk2612-003-awards.test.ts | CP 榜 总榜第1名（男）：头像框/麦位框/飘屏/座驾，125天 | 待执行 |
| API-PK2612-AWD-17 | pk2612-003-awards.test.ts | 42 项 VIEW 特殊奖励均为非自动发放类型（mod=VIEW） | 待执行 |
| API-PK2612-AWD-18 | pk2612-003-awards.test.ts | 奖励详情接口 award-details 在活动期可访问且返回模块奖励 | 待执行 |
| API-PK2612-AWD-19 | pk2612-003-awards.test.ts | 需求未列出的 room-contributor 不应存在奖励配置 | 待执行 |
| API-PK2612-AWD-20 | pk2612-003-awards.test.ts | 保留 7 条六周年通票 EVENT=14 奖励（需求方确认 470 ADD 含 EVENT） | 待执行 |
| API-PK2612-AWD-21 | pk2612-003-awards.test.ts | 贡献者奖励 player_type 均为 USER（房间贡献者不应发房间） | 待执行 |
| API-PK2612-AWD-22 | pk2612-003-awards.test.ts | 家族成员铭牌奖励 player_type 均为 USER（家族内所有用户） | 待执行 |
| API-PK2612-GIFT-01 | pk2612-004-gift-buff.test.ts | 活动礼物展示 12 个，阶段分布 4/4/4，特殊礼物 2 个 | 待执行 |
| API-PK2612-GIFT-02 | pk2612-004-gift-buff.test.ts | 2 倍礼物按 giftBuffs 计分，1 倍礼物为基准（比值 2） | 待执行 |
| API-PK2612-GIFT-03 | pk2612-004-gift-buff.test.ts | 未配置 giftBuffs 的礼物不计分（增量 0） | 待执行 |
| API-PK2612-GIFT-04 | pk2612-004-gift-buff.test.ts | 用户榜日榜 key 为送礼日 20261218 且当前积分可查询 | 待执行 |
| API-PK2612-BUF-01 | pk2612-005-winner-buff.test.ts | 2612 已产生 1V1 胜场数据（前置条件） | 待执行 |
| API-PK2612-BUF-02 | pk2612-005-winner-buff.test.ts | 下一阶段玩家 Buff 与当前阶段胜场映射一致（0–6 胜） | 待执行 |
| API-PK2612-REG-01 | pk2612-006-old-biz.test.ts | 旧 biz pk-v202608 在六周年活动期返回自身 biz 与起止时间 | 待执行 |
| API-PK2612-REG-02 | pk2612-006-old-biz.test.ts | 旧 biz player_n_100 在 2026-08-18 仍可读取主轮次 | 待执行 |
| API-PK2612-REG-03 | pk2612-006-old-biz.test.ts | 旧 biz player_n_100 仍包含 2026-08-17/18/19 三轮日榜 | 待执行 |
| API-PK2612-REG-04 | pk2612-006-old-biz.test.ts | 2612 配置未覆盖旧 biz：旧 biz 数据仍为 pk-v202608 | 待执行 |

> 说明：`pk2612-007-schedule-db.test.ts` 是 SCH-02~33 的只读 SQL 辅助校验脚本，逐 topic 校验 `mod_common_round` 主轮次、日榜、1V1 轮次时间，避免 langSheet 缺失等接口问题干扰赛程配置判定。

| API-PK2612-ALIAS-01 | pk2612-008-alias-api.test.ts | alias active-gifts 返回 12 个礼物，4/4/4，special=2 | 待执行 |
| API-PK2612-ALIAS-02 | pk2612-008-alias-api.test.ts | alias m/player_in_n_200/detail 返回 pk-v202612 主轮次与 4 个日榜 | 待执行 |
| API-PK2612-ALIAS-03 | pk2612-008-alias-api.test.ts | alias m/player_in_1v1_100_46/detail 返回 8 个 1V1 轮次 | 待执行 |
| API-PK2612-ALIAS-04 | pk2612-008-alias-api.test.ts | alias p/player-detail 返回模块详情且全部归属 pk-v202612 | 待执行 |
| API-PK2612-ALIAS-05 | pk2612-008-alias-api.test.ts | alias p/player-in-detail 返回印尼/非印尼陪陪阶段详情 | 待执行 |
| API-PK2612-ALIAS-06 | pk2612-008-alias-api.test.ts | alias p/family-detail 返回印尼家族阶段详情 | 待执行 |
| API-PK2612-ALIAS-07 | pk2612-008-alias-api.test.ts | alias p/room-detail 返回房间总榜详情 | 待执行 |
| API-PK2612-ALIAS-08 | pk2612-008-alias-api.test.ts | alias p/player-awards 返回陪陪奖励详情 | 待执行 |
| API-PK2612-ALIAS-09 | pk2612-008-alias-api.test.ts | alias p/user-awards 返回用户榜奖励详情 | 待执行 |
| API-PK2612-ALIAS-10 | pk2612-008-alias-api.test.ts | alias p/room-awards 返回房间榜奖励详情 | 待执行 |
| API-PK2612-ALIAS-11 | pk2612-008-alias-api.test.ts | alias p/family-awards 返回家族榜奖励详情 | 待执行 |
| API-PK2612-ALIAS-12 | pk2612-008-alias-api.test.ts | alias p/couple-awards 返回 CP 榜奖励详情 | 待执行 |
| API-PK2612-ALIAS-13 | pk2612-008-alias-api.test.ts | alias m/user/detail 返回 17 个日榜 | 待执行 |
| API-PK2612-ALIAS-14 | pk2612-008-alias-api.test.ts | alias m/couple/detail 返回 17 个日榜 | 待执行 |
| API-PK2612-ALIAS-15 | pk2612-008-alias-api.test.ts | alias m/room/detail 返回房间总榜主轮次 | 待执行 |
| API-PK2612-ALIAS-16 | pk2612-008-alias-api.test.ts | alias m/family/detail 返回家族总榜主轮次 | 待执行 |
| API-PK2612-ALIAS-17 | pk2612-008-alias-api.test.ts | alias m/player_in_n_200/rank 返回主轮次（榜单可为空） | 待执行 |
| API-PK2612-ALIAS-18 | pk2612-008-alias-api.test.ts | alias m/user/rank 返回 20261219 日榜结构 | 待执行 |
| API-PK2612-ALIAS-19 | pk2612-008-alias-api.test.ts | alias m/player_in_1v1_100_46/score 返回 1V1 轮次 | 待执行 |
| API-PK2612-ALIAS-20 | pk2612-008-alias-api.test.ts | alias global-family-rank 返回数组 | 待执行 |
| API-PK2612-ALIAS-21 | pk2612-008-alias-api.test.ts | alias get-pair 返回对阵结构 | 待执行 |
| API-PK2612-ALIAS-22 | pk2612-008-alias-api.test.ts | alias p/room-rank 返回房间阶段榜 | 待执行 |
| API-PK2612-ALIAS-23 | pk2612-008-alias-api.test.ts | alias p/family-rank 返回印尼家族阶段榜 | 待执行 |
| API-PK2612-ALIAS-24 | pk2612-008-alias-api.test.ts | alias 与完整 biz 的 player_in_n_200 detail 一致 | 待执行 |
| API-PK2612-ALIAS-25 | pk2612-008-alias-api.test.ts | alias 与完整 biz 的 active-gifts 一致 | 待执行 |
| API-PK2612-ALIAS-26 | pk2612-008-alias-api.test.ts | alias 与完整 biz 的 player-in-detail 模块集合一致 | 待执行 |
| API-PK2612-ALIAS-27 | pk2612-008-alias-api.test.ts | alias 与完整 biz 的 m/user/rank 积分一致 | 待执行 |
