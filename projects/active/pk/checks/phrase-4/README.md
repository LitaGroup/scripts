# 第四阶段检查

> 第四阶段，主要检查：
>
> 1. 陪玩榜正常从三阶段切换到四阶段
> 2. 陪玩榜四阶段内的PK 正常
> 3. 房间榜/家族榜 三阶段 -> 四阶段正常

参考奖励配置：http://project.cinta.team/api/documents/3.md



## 房间榜

检查大区：in，晋级时间：`2026-08-25T23:37:00+07:00`



1. 检查原阶段（room_in_100_50）是否完成结算
   1. 预期：status = 200
   2. 预期：奖励发放（3个给用户 player_type=USER、3个给房间 player_type=ROOM
   3. 预期：晋级名单 mod_common_player_list 中 key='room_in_100_50' locale='in'，数量与接口前 50 名榜单实际数量一致（以接口数量为准）
2. 检查新阶段（room_in_50_20）是否初始化完成
   1. 预期：status = 100
   2. 预期：有初始化的积分数据，且等于晋级名单的得分（100%继承）
      1. select * from mod_common_rank_record where biz={} and topic={} and `key`='-' and trans_no like 'INIT-%'



## 家族榜

检查大区：in，晋级时间：`2026-08-25T23:37:00+07:00`



1. 检查原阶段（family_in_100_50）是否完成结算
   1. 预期：status = 200
   2. 预期：奖励发放（给家族成员 player_type=USER 和 发放奖励给 家族 player_type=FAMILY）
   3. 预期：晋级名单 mod_common_player_list 中 key='family_in_100_50' locale='in'，数量与接口前 50 名榜单实际数量一致（以接口数量为准）
2. 检查新阶段（family_in_50_20）是否初始化完成
   1. 预期：status = 100
   2. 预期：有初始化的积分数据，且等于晋级名单的得分（100%继承）
      1. select * from mod_common_rank_record where biz={} and topic={} and `key`='-' and trans_no like 'INIT-%'





## 陪玩榜

晋级时间与 topic：

- locale='ko' `2026-08-25T23:37:00+09:00` topic='player_50_20' nextTopic='player_24_10' 和 nextTopic1v1='player_1v1_24_10'
- locale='ph' `2026-08-25T23:37:00+08:00` topic='player_50_20' nextTopic='player_24_10' 和 nextTopic1v1='player_1v1_24_10'
- locale='vi' `2026-08-25T23:37:00+07:00` topic='player_50_20' nextTopic='player_24_10' 和 nextTopic1v1='player_1v1_24_10'
- locale='in' `2026-08-25T23:37:00+07:00` topic='player_in_100_46' nextTopic='player_in_50_20' 和 nextTopic1v1='player_in_1v1_50_20'

1. 检查原阶段是否完成结算
   1. 预期：status=200
   2. 预期：奖励发放，包括：给排名前面的（陪玩）和贡献者的（用户 top1），配置阶段 100进50/46-总榜，核对前 10 名
   3. 预期：晋级名单 mod_common_player_list 中 key='{topic}' locale='{locale}'，数量与接口前 20（in 为 46）名榜单实际数量一致（以接口数量为准）
   4. 预期：BUFF 检查
      1. 上一阶段里面，按照PK的胜场来计算本阶段的BUFF
         1. 1 -> 1.0
         2. 2 -> 1.0
         3. 3 -> 1.05
         4. 4 -> 1.10
         5. 5 -> 1.15
         6. 6 -> 1.20
2. 检查复活赛是否初始化和结算
   1. 印尼：player_in_n_4，非印尼：player_n_4
   2. 在晋级时间之前，复活赛的status=0，晋级结算之后，status=100
   3. 复活赛的结算：`2026-08-25T23:37:00` 本地时间，结算之后，对应的status=200，且 排名前四的用户进入 晋级名单
      1. 印尼对应：player_in_100_46
      2. 非印尼：player_50_20
   4. 复活赛的结算：
      1. 积分检查：上个阶段（player_in_100_46 player_50_20）积分的50% 代入到新阶段（player_in_50_20 player_24_10）
      2. BUFF检查：上个阶段（player_in_100_46 player_50_20）的BUFF  100% 引入 到新阶段（player_in_50_20 player_24_10）
3. 检查新阶段（nextTopic）是否初始化完成
   1. 预期：status = 100
   2. 预期：start_time=2026-08-26T00:00:00 本地时间 finish_time=2026-08-28T23:30:00 本地时间
   3. 预期：有初始化的积分数据，且等于晋级名单得分的50%（继承50%积分）
      1. select * from mod_common_rank_record where biz={} and topic={} and `key`='-' and trans_no like 'INIT-%'
4. 检查新阶段 1v1 PK nextTopic1v1 是否初始化完成
   1. 预期：status = 100
   2. 预期：start_time=2026-08-26T00:00:00 本地时间 finish_time=2026-08-28T23:30:00 本地时间
   3. 预期：有第一期PK对阵数据
      1. select * from mod_common_round where biz={} and topic={nextTopic1v1} and `key`='2026082600' and locale={}，预期 status=100
      2. select * from mod_buff11pk_pair where biz={} and topic={} and `key`='2026082600' and locale={}，首日（前2轮）预期有 10 条对阵数据（in 为 23 条），次日（后4轮）预期有 12 条对阵数据（in 为 25 条）
      3. 

## 实现说明（phrase-4.check.ts，已按 pk-202606 线上数据验证）

1. **复活赛时间**：复活赛实际周期为 `2026-08-26T00:00:00` ~ `2026-08-26T23:30:00` 本地（与 `mod_common_round` 一致），结算时间取 `2026-08-26T23:37:00` 本地。检查按时间自适应：结算前预期 status=100，结算后预期 status=200。
2. **复活赛积分代入**：复活赛前 4 名代入新阶段的积分 = 复活赛总积分 + 上阶段总积分 × 50%，记录在 `mod_common_rank_record`（trans_no = `{复活赛topic}.revive.{player}`），非 `INIT-%` 记录。
3. **BUFF 存储**：`mod_buffpk_player_buff`（biz/topic/locale/player/buff），胜场 ≥3（BUFF>1.0）的玩家必须落表，胜场 1/2 的玩家也可能落表（BUFF 默认 1.0）；新阶段的陪玩榜 topic 与 1v1 topic 都会写入相同记录。脚本核对：每条记录 buff == 胜场映射值（1/2→1.0），且晋级名单内胜场 ≥3 的玩家必须有记录。
4. **陪玩榜奖励配置阶段**：使用文档 `100进46-总榜`（与线上 `mod_common_award` 中 name=`player_50_20` / `player_in_100_46` 的配置一致；文档中陪玩榜无 `100进50-总榜`）。
5. **晋级名单数量**：复活赛结算后，`mod_common_player_list`（key=原阶段topic）会追加复活赛前 4 名（score=0），因此数量预期 = 接口前 N 名实际数量 + 4（结算前不追加）。
6. **INIT 积分检查**：复活赛前 4 名 score=0，不走 `INIT-%` 代入，核对时剔除。
