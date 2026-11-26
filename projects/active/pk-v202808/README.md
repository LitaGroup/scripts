# pk-v202808 周年荣耀竞技场 · 后端自动化用例

依据需求（奖励配置 / 赛程配置 / 礼物配置）、技术方案 v1.0.0 与用例文档
`pk-v202808-backend-self-test-cases` 编写，覆盖 17 条后端白盒用例。

- 期次：`biz=pk-v202808`（与 `pk-v202608`、`pk-ai-test` 完全隔离）
- 时间口径：活动北京时间 `2028-08-17 14:00:00` ~ `2028-08-29 23:59:59`；阶段榜/日榜/1v1 用大区本地时间
- 大区：`in / vi / ph / ko`（in/vi=UTC+7，ph=UTC+8，ko=UTC+9）
- 礼物：12 个，10561~10570 倍率 1，10628/10637 倍率 2；`stage` 仅展示分组，不参与计分
- 历史规则沿用：普通/SVIP/富豪送礼 Buff 1.1/1.2/1.5，前两阶段 Top10 Buff，PK 胜场 Buff

## 运行

依赖测试环境配置（`config.json` 的 `mysql` / `redis`，见根目录 `config.example.json`），
以及有效陪玩/家族等测试数据（见下方 fixtures）。

```bash
cd <repo-root>
node projects/active/pk-v202808/tests/001-config-init.test.ts
...
```

按用例文档第五节顺序执行（后阶段依赖前阶段结算生成的 `mod_common_player_list`）：

```
001 → 002/003 → 004/005
006 → 007 → 008 → 009 → 010 → 011
012 → 013
014 → 015
016 → 017
```

用户/CP 可并行；陪玩、印尼房间、印尼家族主链必须串行。

## 测试数据（fixtures）

部分用例需要真实有效陪玩、家族成员等测试数据，脚本从以下文件读取（不存在时相关步骤会
`skip` 并给出原因）：

```bash
export PK_FIXTURES=projects/active/pk-v202808/fixtures.json
```

结构见 `fixtures.example.json`：

| 字段 | 用途 |
|---|---|
| `players[locale][]` | 有效陪玩 UID（006 需 in 201 个、非 in 101 个；007 起沿用名单） |
| `rooms[locale][]` | 房间 ID（012/013 用；缺省时用隔离合成 ID） |
| `families[locale][].id/.members[]` | 家族及成员（014/015 需要真实成员校验全员奖励） |
| `users[locale][]` | 普通送礼用户（缺省时用隔离合成 UID） |
| `identities.normal/svip/rich[]` | 不同身份账号（003 校验 1.1/1.2/1.5 Buff） |
| `couples[locale][].{a,b,genderA,genderB}` | CP 双方及性别（005 校验男女奖励分流） |

合成 ID 段位：用户 `910xxxxxx`、房间 `920xxxxxx`、家族 `930xxxxxx`，按大区错开，避免污染真实数据。

## 用例与脚本

| 用例 | 脚本 | 主要校验 |
|---|---|---|
| 001 | `001-config-init.test.ts` | 32 模块/234 量级轮次、活动起止、礼物接口、55 个奖励名全量 diff、2028 时间 |
| 002 | `002-gift-score-time.test.ts` | 12 礼物五榜计分、后半程仍计分、消息幂等、未配置礼物、四个时间边界、ko 末小时只进总榜 |
| 003 | `003-order-routing-buff.test.ts` | 身份 Buff、订单仅进陪玩主榜+1v1、重放幂等、非 30 不加分、延迟消息原日榜、无效分支 |
| 004 | `004-user-daily-main.test.ts` | 13 个日榜 3300/2200/1100、日榜奖励、总榜=日榜之和、总榜 ADD/VIEW |
| 005 | `005-couple-daily-main.test.ts` | 正反向同 coupleId、13 日榜、男女日榜/总榜奖励、未知性别跳过 |
| 006 | `006-player-stage1.test.ts` | 海选 N→200/100、3 个日榜、晋级名单、Top1-10 与贡献 Top1 奖励 |
| 007 | `007-player-stage2.test.ts` | 50% 继承、Top10 Buff、1320/1210/1155、白名单外不计分、晋级与奖励 |
| 008 | `008-player-first-pk.test.ts` | 六场 1v1、pair 数量/不重复、平分、胜方奖励、46/20 名单与阶段奖励 |
| 009 | `009-player-revival.test.ts` | 复活榜仅 8/26、Top4 APPEND 至 50/24、继承+复活分、重复结算幂等 |
| 010 | `010-player-second-pk.test.ts` | 六场 1v1、25/12 对、3 胜 Buff 1.05、+1155、20/10 名单与奖励 |
| 011 | `011-player-final.test.ts` | 决赛名单、本地开始/统一结束、Top3 ADD、贡献 Top1、VIEW 只记录 |
| 012 | `012-room-in-stages.test.ts` | 印尼房间六阶段、名单 200/100/50/20/10、100% 继承、铭牌/边框/主题/贡献奖励 |
| 013 | `013-room-other-total.test.ts` | 非印尼 room 全程总榜、跨阶段累计、决赛奖励与 VIEW |
| 014 | `014-family-in-stages.test.ts` | 印尼家族六阶段、全员快照奖励、家族本体奖励、全球榜来源 topic |
| 015 | `015-family-other-global.test.ts` | 非印尼家族总榜、冠军 Banner、最终全球榜 4×Top3 与来源 topic |
| 016 | `016-query-api.test.ts` | 28 RankModule + 4 PkModule 查询、贡献者、get-pair、内部入口拒绝 |
| 017 | `017-settle-retry-reconcile.test.ts` | MySQL/Redis/接口三方对账、重跑不增量、ADD 单号唯一、其他 biz 隔离 |

## 已知限制

1. 当前测试环境未部署 `pk-v202808`（`POST /active/v3/pk-v202808/detail` 返回 `Active not found`），
   且仓库内无 `config.json`，本次只完成脚本编写，未产生执行结果。
2. 陪玩订单消息入口按 `funbit.play_order_status_log`、字段 `transNo/userId/playerId/amount/mainStatus/finishTime`
   实现；如提测版本契约不同，只需调整 `Pk202808Service.sendOrderStatus`。
3. 奖励全量 diff 覆盖需求表中的 ADD/VIEW 行；VIEW 中 CUSTOM 的占位 `award_id=-1` 以实际 SQL 设计稿为准。
4. 001 的“234 条轮次”按模块拆分为逐项断言，未硬编码总数（避免把旧期次计数当新期次事实）。
5. 014 的“结算前新增/移出家族成员”快照场景未自动化（需要写 `family_user` 测试数据），
   其余阶段奖励/名单/全球榜均已覆盖。

## 输出协议

遵循仓库统一协议（`start/act/check/done`），可直接被平台脚本执行器解析。