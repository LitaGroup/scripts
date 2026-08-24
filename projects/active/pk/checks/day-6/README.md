增加检查：day-6，项目：pk

主要检查: 房间榜（印尼）、家族榜（印尼）、陪玩榜（全部） 的晋级



参考奖励配置：http://project.cinta.team/api/documents/3.md



## 房间榜

检查大区：in，晋级时间：`2026-08-22T23:37:00+07:00`



1. 检查原阶段（room_in_200_100）是否完成结算
   1. 预期：status = 200
   2. 预期：奖励发放（3个给用户 player_type=USER、3个给房间 player_type=ROOM
   3. 预期：晋级名单 mod_common_player_list 中 key='room_in_200_100' locale='in'，数量与接口前 100 名榜单实际数量一致（以接口数量为准）
2. 检查新阶段（room_in_100_50）是否初始化完成
   1. 预期：status = 100
   2. 预期：有初始化的积分数据，且等于晋级名单的得分（100%继承）
      1. select * from mod_common_rank_record where biz={} and topic={} and `key`='-' and trans_no like 'INIT-%'



## 陪玩榜

晋级时间与 topic：

- locale='ko' `2026-08-22T23:37:00+09:00` topic='player_100_50' nextTopic='player_50_20' 和 nextTopic1v1='player_1v1_50_20'
- locale='ph' `2026-08-22T23:37:00+08:00` topic='player_100_50' nextTopic='player_50_20' 和 nextTopic1v1='player_1v1_50_20'
- locale='vi' `2026-08-22T23:37:00+07:00` topic='player_100_50' nextTopic='player_50_20' 和 nextTopic1v1='player_1v1_50_20'
- locale='in' `2026-08-22T23:37:00+07:00` topic='player_in_200_100' nextTopic='player_in_100_46' 和 nextTopic1v1='player_in_1v1_100_46'

1. 检查原阶段是否完成结算
   1. 预期：status=200
   2. 预期：奖励发放，包括：给排名前面的（陪玩）和贡献者的（用户 top1），配置阶段 200进100-总榜，核对前 10 名
   3. 预期：晋级名单 mod_common_player_list 中 key='{topic}' locale='{locale}'，数量与接口前 50（in 为 100）名榜单实际数量一致（以接口数量为准）
2. 检查新阶段（nextTopic）是否初始化完成
   1. 预期：status = 100
   2. 预期：start_time=2026-08-23T00:00:00 本地时间 finish_time=2026-08-25T23:30:00 本地时间
   3. 预期：有初始化的积分数据，且等于晋级名单得分的50%（继承50%积分）
      1. select * from mod_common_rank_record where biz={} and topic={} and `key`='-' and trans_no like 'INIT-%'
3. 检查新阶段 1v1 PK nextTopic1v1 是否初始化完成
   1. 预期：status = 100
   2. 预期：start_time=2026-08-23T00:00:00 本地时间 finish_time=2026-08-25T23:30:00 本地时间
   3. 预期：有第一期PK对阵数据
      1. select * from mod_common_round where biz={} and topic={nextTopic1v1} and `key`='2026082300' and locale={}，预期 status=100
      2. select * from mod_buff11pk_pair where biz={} and topic={} and `key`='2026082300' and locale={}，预期有 25 条对阵数据（in 为 50 条）

## 家族榜

检查大区：in，晋级时间：`2026-08-22T23:37:00+07:00`



1. 检查原阶段（family_in_200_100）是否完成结算
   1. 预期：status = 200
   2. 预期：奖励发放（给家族成员 player_type=USER）
   3. 预期：晋级名单 mod_common_player_list 中 key='family_in_200_100' locale='in'，数量与接口前 100 名榜单实际数量一致（以接口数量为准）
2. 检查新阶段（family_in_100_50）是否初始化完成
   1. 预期：status = 100
   2. 预期：有初始化的积分数据，且等于晋级名单的得分（100%继承）
      1. select * from mod_common_rank_record where biz={} and topic={} and `key`='-' and trans_no like 'INIT-%'
