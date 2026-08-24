# 陪玩榜



## player-001-init

初始化数据

1. 清理历史数据
   1. delete from mod_common_round where biz={} and topic like 'player_%'
2. 执行初始化任务
   1. __cron，模拟时间为：`2026-08-16T12:00:00+08:00`
3. 第 1 阶段检查（n->100） mod_common_round
   1. 总榜：locale = ko/vi/ph  topic=player_n_100  start_time=2026-08-17T14:00:00 北京时间  finish_time=2026-08-19T23:30:00 本地时间
   2. 总榜：locale = in  topic=player_in_n_200  start_time=2026-08-17T14:00:00 北京时间  finish_time=2026-08-19T23:30:00 本地时间
   3. 日榜：locale = ko/vi/ph  topic=player_n_100 3条，且各个开始时间和结束时间，都是 本地时间的 0点
   4. 日榜：locale = in  topic=player_in_n_200 3条，且各个开始时间和结束时间，都是 本地时间的 0点
4. 第 2 阶段检查（100->50） 
   1. 总榜：locale = ko/vi/ph  topic=player_100_50  start_time=2026-08-20T00:00:00 本地时间  finish_time=2026-08-22T23:30:00 本地时间
   2. 总榜：locale = in  topic=player_in_200_100  start_time=2026-08-20T00:00:00 本地时间  finish_time=2026-08-22T23:30:00 本地时间
   3. 日榜：locale = ko/vi/ph  topic=player_100_50 3条，且各个开始时间和结束时间，都是 本地时间的 0点
   4. 日榜：locale = in  topic=player_in_200_100 3条，且各个开始时间和结束时间，都是 本地时间的 0点
5. 第 3 阶段检查（50->20）
   1. 总榜：locale = ko/vi/ph  topic=player_50_20 和 player_1v1_50_20  start_time=2026-08-23T00:00:00 本地时间  finish_time=2026-08-25T23:30:00 本地时间
   2. 总榜：locale = in  topic=player_in_100_46 和  player_in_1v1_100_46 start_time=2026-08-23T00:00:00 本地时间  finish_time=2026-08-25T23:30:00 本地时间
   3. PK轮次：locale = ko/vi/ph topic=player_1v1_50_20 `key` 不等于 `-`，共有 6 条/大区，且 `key` 对应的开始时间 是 每天的 0点 和 18点，结束时间是 17点和23点，均是本地时间
   4. PK轮次：locale = in topic=player_in_1v1_100_46 `key` 不等于 `-`，共有 6 条/大区，且 `key` 对应的开始时间 是 每天的 0点 和 18点，结束时间是 17点和23点，均是本地时间
6. 第 4 阶段检查（24->10）
   1. 总榜：locale = ko/vi/ph  topic=player_24_10 和 player_1v1_24_10  start_time=2026-08-26T00:00:00 本地时间  finish_time=2026-08-28T23:30:00 本地时间
   2. 总榜：locale = in  topic=player_in_50_20 和  player_in_1v1_50_20 start_time=2026-08-26T00:00:00 本地时间  finish_time=2026-08-28T23:30:00 本地时间
   3. PK轮次：locale = ko/vi/ph topic=player_1v1_24_10 `key` 不等于 `-`，共有 6 条/大区，且 `key` 对应的开始时间 是 每天的 0点 和 18点，结束时间是 17点和23点，均是本地时间
   4. PK轮次：locale = in topic=player_in_1v1_50_20 `key` 不等于 `-`，共有 6 条/大区，且 `key` 对应的开始时间 是 每天的 0点 和 18点，结束时间是 17点和23点，均是本地时间
   5. 复活赛：locale=in/vi/ph/ko topic=player_n_4 和 player_in_n_4 start_time=2026-08-26T00:00:00 本地时间  finish_time=2026-08-26T23:30:00 本地时间
7. 第 5 阶段检查（决赛）
   1. 总榜：locale = ko/vi/ph  topic=player_10_1  start_time=2026-08-29T00:00:00 本地时间  finish_time=2026-08-29T23:59:59 北京时间
   2. 总榜：locale = in  topic=player_in_20_1 start_time=2026-08-29T00:00:00 本地时间  finish_time=2026-08-29T23:59:59 北京时间



