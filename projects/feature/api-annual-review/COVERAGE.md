# 用例 → 检查点 → 脚本 追溯矩阵（TK-0391）

- 生成方式：按实际运行输出 `[check]` 记录逐条生成，结果来自 2026-11-19 全量执行。
- `check` 标题中的「用例#API-ANNIV-xxx-①」即用例检查点编号；一条检查点对应一个 `check`。
- 状态：success=通过，fail=未通过，skip=未执行（有明确原因）。

## 001-contract.test.ts

| # | 检查点（check 标题） | 状态 |
| --- | --- | --- |
| 1 | 用例#API-ANNIV-001-① 完整 biz 路径 POST /annual-review-v202612/get 返回 HTTP 200 且业务 status=0 | success |
| 2 | 用例#API-ANNIV-001-② 响应 data 同时包含 report 与 player 两个键 | success |
| 3 | 用例#API-ANNIV-001-③ report.user 为当前用户宽表行（id=21） | success |
| 4 | 用例#API-ANNIV-002-① 兼容短路径 POST /annual-review/get 同样返回 HTTP 200、status=0、report.user 非空 | success |
| 5 | 用例#API-ANNIV-002-② 完整路径与短路径的 status/msg/data 深度相等 | success |
| 6 | 用例#API-ANNIV-003-① report.user 包含文档约定的全部 61 个字段（无缺失） | success |
| 7 | 用例#API-ANNIV-003-② 非空字段 JSON 类型符合 stats 表 DDL 映射（数值=number、字符串=string、is_player=boolean） | success |
| 8 | 用例#API-ANNIV-003-③ 日期/时间字段非空时按接口文档允许的 string 或 number 返回 | success |
| 9 | 用例#API-ANNIV-004-① report.user.id、player.id 与请求登录用户一致（均为 21） | success |
| 10 | 用例#API-ANNIV-004-② player.createTime（注册时间戳）对应的北京日期与 report.user.register_date 一致 | success |
| 11 | 用例#API-ANNIV-005-① player 含文档字段 name/id/no/avatar/type/status/createTime/isHost | success |
| 12 | 用例#API-ANNIV-006-① 同一用户连续两次调用（status/msg/data）完全一致（只读幂等） | success |

## 002-auth-locale.test.ts

| # | 检查点（check 标题） | 状态 |
| --- | --- | --- |
| 1 | 用例#API-ANNIV-010-① 未登录（不传 l-user-id）返回 status=1、msg="User need login first"、data=null | success |
| 2 | 用例#API-ANNIV-010-② 登录用户 ID=0 视为未登录，返回 status=1、msg="User need login first" | success |
| 3 | 用例#API-ANNIV-011-① 请求体传 userId/id=8 不生效，仍返回登录用户 21 的数据（不越权） | success |
| 4 | 用例#API-ANNIV-011-② 请求体注入 userId 的响应与空请求体完全一致 | success |
| 5 | 用例#API-ANNIV-012-① 配置启用的六个大区（in/vi/th/ko/zh/ph）均返回 report.user | success |
| 6 | 用例#API-ANNIV-012-② 六个大区返回的 report.user 内容一致（数据源未配置 locale 维度，仅大区门禁生效） | success |
| 7 | 用例#API-ANNIV-013-① 未启用大区 ar 返回 status=0、report={}，player 正常 | success |
| 8 | 用例#API-ANNIV-013-② 未启用大区 en 同样返回 status=0、report={} | success |
| 9 | 用例#API-ANNIV-014-① 未启用大区下短路径与完整路径响应一致 | success |

## 003-time-window.test.ts

| # | 检查点（check 标题） | 状态 |
| --- | --- | --- |
| 1 | 用例#API-ANNIV-020-① 活动开始时刻 2026-12-14T00:00:00+08:00（含）返回 report.user | success |
| 2 | 用例#API-ANNIV-020-② 活动结束时刻 2027-12-31T23:59:59+08:00（含）返回 report.user | success |
| 3 | 用例#API-ANNIV-021-① 开始前 1 秒（2026-12-13T23:59:59+08:00，7 天容错内）返回 status=0、report={} | success |
| 4 | 用例#API-ANNIV-021-② 开始前整 7 天边界（2026-12-07T00:00:00+08:00）返回 status=0、report={} | success |
| 5 | 用例#API-ANNIV-021-③ 开始前 7 天 + 1 秒（2026-12-06T23:59:59+08:00，超出容错）返回 status=1、msg="Activity is not active" | success |
| 6 | 用例#API-ANNIV-022-① 结束后 1 秒（2028-01-01T00:00:00+08:00，7 天容错内）返回 status=0、report={} | success |
| 7 | 用例#API-ANNIV-022-② 结束后整 7 天边界（2028-01-07T23:59:59+08:00）返回 status=0、report={} | success |
| 8 | 用例#API-ANNIV-022-③ 结束后 7 天 + 1 秒（2028-01-08T00:00:00+08:00，超出容错）返回 status=1、msg="Activity is not active" | success |
| 9 | 用例#API-ANNIV-023-① 活动期内短路径与完整路径的 status/msg/data 深度相等 | success |
| 10 | 用例#API-ANNIV-023-② 超出 7 天容错时两条路径均拒绝访问（status=1），错误文案差异记录为观察项 | success |

## 004-config-regression.test.ts

| # | 检查点（check 标题） | 状态 |
| --- | --- | --- |
| 1 | 用例#API-ANNIV-030-① 完整 biz 配置接口 /annual-review-v202612/config 返回 status=0 且 biz=annual-review-v202612 | success |
| 2 | 用例#API-ANNIV-030-② 配置开始/结束时间等于 Nacos 配置（2026-12-14T00:00:00+08:00 / 2027-12-31T23:59:59+08:00） | success |
| 3 | 用例#API-ANNIV-030-③ 配置 enableLocales 集合为 in/vi/th/ko/zh/ph 六个大区 | success |
| 4 | 用例#API-ANNIV-031-① 活动期内短路径 /annual-review/config 返回 status=0，startTime/finishTime/enableLocales 与完整路径一致 | success |
| 5 | 用例#API-ANNIV-032-① 回归：六周年 anniversary-v202608/config 返回 status=0 且 biz=anniversary-v202608 | success |
| 6 | 用例#API-ANNIV-032-② 回归：六周年 anniversary-v202608/get 在活动期内仍返回 status=0 且 report.user 非空 | success |
| 7 | 用例#API-ANNIV-033-① 回归：pk-v202608/config 返回 status=0 且 biz=pk-v202608 | success |
| 8 | 用例#API-ANNIV-034-① 未知子路径返回 status=1、msg="Method not found" | success |
| 9 | 用例#API-ANNIV-034-② 接口只接受 POST：GET /annual-review-v202612/get 返回非 200（实际 HTTP 500，框架默认处理，记录为观察项） | success |

## 005-empty-edge.test.ts

| # | 检查点（check 标题） | 状态 |
| --- | --- | --- |
| 1 | 用例#API-ANNIV-040-① 宽表无行用户 999999999 返回 status=0、report={}，player 为对象（不报错） | success |
| 2 | 用例#API-ANNIV-040-② 宽表无行时短路径与完整路径响应一致 | success |
| 3 | 用例#API-ANNIV-041-① 不传请求体（无 body）仍返回 status=0 且 report.user 非空 | success |
| 4 | 用例#API-ANNIV-041-② 请求体含未知字段时被忽略，响应与空对象请求完全一致 | success |
| 5 | 用例#API-ANNIV-043-① 连续 3 次调用同一用户，三次 status/msg/data 完全一致（只读幂等） | success |
| 6 | 用例#API-ANNIV-044-① 无数据用户请求后再次查询有数据用户，返回不受影响 | success |

## 006-prd-coverage.test.ts

| # | 检查点（check 标题） | 状态 |
| --- | --- | --- |
| 1 | 用例#API-ANNIV-050-00-① PRD P0 首页：player.name/avatar 可返回（昵称+头像展示数据源） | success |
| 2 | 用例#API-ANNIV-050-01-① PRD P1 注册天数：report.user 提供所需字段 [register_date,register_day] | success |
| 3 | 用例#API-ANNIV-050-02-① PRD P2 活跃天数：report.user 提供所需字段 [active_day] | success |
| 4 | 用例#API-ANNIV-050-03-① PRD P3 活跃时段：report.user 提供所需字段 [active_time] | success |
| 5 | 用例#API-ANNIV-050-04-① PRD P4 合集-2026年的第一次：report.user 提供所需字段 [first_chats_user_id,first_order_user_id,first_receiver_id,first_receiver_gift_id,first_sender_id,first_sender_gift_id] | success |
| 6 | 用例#API-ANNIV-050-05-① PRD P5 大R-超豪俱乐部：report.user 提供所需字段 [enter_super_luxury_club_count] | success |
| 7 | 用例#API-ANNIV-050-06-① PRD P6 大R-VIP 501：report.user 提供所需字段 [become_bigr_time] | success |
| 8 | 用例#API-ANNIV-050-07-① PRD P7 技能下单-偏好技能：report.user 提供所需字段 [skill_id,skill_order_count] | success |
| 9 | 用例#API-ANNIV-050-08-① PRD P8 技能下单-用户侧：report.user 提供所需字段 [complete_order_total,complete_most_player_id,most_player_order_count] | success |
| 10 | 用例#API-ANNIV-050-09-① PRD P9 技能下单-陪玩侧：report.user 提供所需字段 [is_player,order_most_user_id] | success |
| 11 | 用例#API-ANNIV-050-10-① PRD P10 语音房-特殊时间：report.user 提供所需字段 [voice_special_time] | success |
| 12 | 用例#API-ANNIV-050-11-① PRD P11 语音房-停留时间：report.user 提供所需字段 [voice_room_id,voice_stay_time] | success |
| 13 | 用例#API-ANNIV-050-12-① PRD P12 语音房-社交游戏：report.user 提供所需字段 [social_game_rounds,most_social_game] | success |
| 14 | 用例#API-ANNIV-050-13-① PRD P13 礼物-聚合信息：report.user 提供所需字段 [sender_uv,receiver_most_expensive_gift,receiver_most_expensive_gift_price,receiver_most_expensive_sender_id,most_expensive_sender_id,most_expensive_sender_price,most_expensive_receiver_id,most_expensive_receiver_gift_price] | success |
| 15 | 用例#API-ANNIV-050-14-① PRD P14 拍拍房-首个拍拍关系：report.user 提供所需字段 [first_relation_type,first_relation_user_id,first_relation_time] | success |
| 16 | 用例#API-ANNIV-050-15-① PRD P15 拍拍房-最高身价：report.user 提供所需字段 [top_value_relation_type,top_value_relation_level,top_value_relation_user_id,top_value_relation_value,top_value_relation_time] | success |
| 17 | 用例#API-ANNIV-050-16-① PRD P16 拍拍房-最长的关系：report.user 提供所需字段 [longest_relation_type,longest_relation_user_id,longest_relation_days] | success |
| 18 | 用例#API-ANNIV-050-17-① PRD P17 私聊-聊天最多：report.user 提供所需字段 [most_chats_user_id,most_chats_count] | success |
| 19 | 用例#API-ANNIV-050-18-① PRD P18 私聊-特殊时间：report.user 提供所需字段 [chats_special_time] | success |
| 20 | 用例#API-ANNIV-050-19-① PRD P19 年度身份卡：report.user 提供所需字段 [identity_code,identity_name,identity_priority,identity_metric_name,identity_metric_value] | success |
| 21 | 用例#API-ANNIV-050-20-① PRD P20 总结页：report.user 提供所需字段 [active_day,skill_id,voice_room_id,voice_stay_time,identity_code,identity_name] | success |
| 22 | 用例#API-ANNIV-051-① 身份卡 identity_code 仅取文档定义的 12 个 code | success |
| 23 | 用例#API-ANNIV-052-① 身份卡 identity_name 与 code 的文档名称一致 | success |
| 24 | 用例#API-ANNIV-053-① 身份卡 identity_priority 与 code 的文档优先级一致（1 最高） | success |
| 25 | 用例#API-ANNIV-054-① 活跃时段 active_time 仅取 PRD 定义的四个区间 | success |
| 26 | 用例#API-ANNIV-054-② 拍拍关系类型仅取 PRD 定义的五种（cp/friend/bestie/brother/family） | skip |

## 汇总

| 指标 | 数值 |
| --- | --- |
| 检查点总数 | 72 |
| 通过 | 71 |
| 未通过 | 0 |
| 跳过 | 1 |
