# 魔盒-幸运赐福（box-bless）冒烟测试大纲

> 来源文档：需求 `documents/80`（2026-10-20）、技术设计 `documents/85`（TECHNICAL_DESIGN.md **v2.1**，2026-10-20）——均来自项目 117 <http://project.cinta.team/projects/117>
> 冒烟范围：核心链路 7 条（配置 → 累加 → 发放 → 生效核销 → 队列过期 → 衰减 → 进度查询）。公屏广播文案、R9 下发明细导出、魔盒换新 new 标签不在本次范围（见待确认 #8）
> 测试环境：test；送礼通过 `POST active/v3/__consumer/funbit.gift_send` 模拟（ApiService.runConsumer），衰减通过 `POST active/v3/__cron`（runScheduledTask，time 精确到 cron 分钟）触发

## 活动要点（用例设计依据）

- **双服务分工**：active-v3（送礼累加 TaskModule / 日切衰减 cron / `/app/room` boxBless 聚合块 / 赐福抽取写队列）+ lita-basic（`treasure_box_bless_config/_user/_user_record` 三表、`gift_award_queue` 消费发放 BOX_BLESS_* 分支、`openBoxAward` 开奖生效核销）；funbit-api 依赖改造（`sendGift` 新增 `discount`，结算价=配置价×折扣/10，主播按折后分账）
- **赐福值进度零建表**（TaskModule，`stageType: REPEAT`，name=`bless`）：`mod_common_round`（一轮次=整活动期，按大区各一行）/ `mod_task_user_round`（value=当前赐福值；MAIN_NAME `-` 行存已结算最高 step 高水位）/ `mod_task_user_round_log`（唯一键 (biz,topic,round,user_id,trans_no)：累加 transNo=`{orderNo}`、衰减 transNo=`decay-{yyyyMMdd}`）/ `mod_task_user_round_step`（结算账本，settles 仅 DATA_RANGER 打点，发奖由 Active 层完成）
- **累加**：`@ActiveConsumer(GIFT_SEND)`（事件源 funbit gift_send 流水 → basic-scanner → Kafka）；白名单 = yaml `magicboxBless.gifts` 比例表 keys（按大区覆盖）；`add = 比例(giftId) × giftCount`；**背包送礼同样累加**（消息无 boxFree 信息，累加看所有送礼、核销只看购买送礼）
- **触发**：一次跨越多档 `stepDelta>0` → 循环抽取 stepDelta 次 → 写 `gift_award_queue`（`order_no={orderNo}:{k}`，唯一索引防重复）+ 房间公屏广播（触发时直接投递，房间=送礼时 roomId）
- **抽取范围**：yaml `pools ∩ treasure_box_bless_config(box_gift_id, state=1)` 加权随机一种；交集为空=配置错误告警不触发；倒计时 `expireSeconds → expires_second`；效果参数 `awardId/count → award_id/award_count`
- **六种赐福**（award_type 语义）：`BOX_BLESS_GUARANTEE` 保底券（award_id=必出礼物、count=数量）/ `BOX_BLESS_FREE` 免费券 / `BOX_BLESS_DISCOUNT` 优惠券（award_id=折扣值 1-9）/ `BOX_BLESS_DOUBLE` 开一送一 / `BOX_BLESS_PROB_UP` 概率提升（boxType='bless' 概率表）/ `GIFT` 背包礼物赐福（现有类型直达背包）
- **发放**（lita-basic `GiftAwardAutoTimer` @Timer 2s → `UnionAwardService`）：①config 校验（不支持该类型 → award_status=fail+飞书告警）②INSERT `_record`(type=GET, trans_no=队列 order_no) 幂等闸门 ③INSERT `_user`（该用户该魔盒无 ACTIVE 且无 WAITING → **ACTIVE**：active_time=now、expire_time=now+expires_second；否则 **WAITING**）④回填 record.bless_user_id；GIFT 走现有分支进 `user_gift_package` 背包（**不写 _user**）
- **生效核销**（`openBoxAwardCommon`，查 ACTIVE 且 expire_time>now，过期懒流转）：背包库存送礼（boxFree=true）跳过生效不核销（Q5 推荐口径，待产品拍板）；按类型改写——FREE→boxFree=true（0 扣费）/ DISCOUNT→item 带 discount / DOUBLE→拆两条（原数量扣费+追加同数量 free 条）/ GUARANTEE→整箱跳过概率全出 award_ref×bless_count（free=true，与 bizhong 计数互不影响）/ PROB_UP→boxType 强制 bless（优先级高于 svip/collect_box）；送礼成功 → 核销（UPDATE ... WHERE status='ACTIVE' 乐观防双消）+ USE 流水（trans_no=use_batch_no）+ 激活最早 WAITING（**重算倒计时**）；失败不核销；核销口径=一次赠送动作核销 1 张（无论 count 与收礼人数）
- **队列顺序**：WAITING 按 id 升序=触发顺序；当前赐福被核销或过期后，最早 WAITING 顶上变 ACTIVE 并重新起算倒计时
- **衰减**：`@ActiveCron`×3 大区日切（北京 23:05=ko 00:05、00:05=ph、01:05=in/vi，即各大区本地 00:05）；`decayAmount = floor(target × decayPercent / 100)`（默认 10%）；候选=value>0 且当天无正流水（衰减写的负流水不影响判定）；`update(upset=true, transNo=decay-{yyyyMMdd}, value=max(0, 当前值-decayAmount))` 扣到 0 不置负；step 回退不触发结算、MAIN 高水位防重复发奖；按日幂等可补跑
- **查询**：`POST /active/v3/app/room` 聚合块 `boxBless.boxes[]`：`{boxGiftId, value, target, addValue, active: {type, discount, expireTime, waitingCount} | null}`；魔盒清单 = yaml 比例表 keys（当前用户 locale 对应实例组）
- **R9 数据需求**（本期不导出、用例断言覆盖）：`_user`（locale / 魔盒 / status∈{WAITING,ACTIVE}=未使用 / create_time=下发时间 / use_time=使用时间）+ `_record`（GET/USE/EXPIRE 全量流水）联合完整覆盖

## 公共层计划（脚本落地前先建）

| 项 | 说明 |
|---|---|
| `BoxBlessService`（src/services/） | 封装：`/app/room` boxBless 块查询、`__consumer/funbit.gift_send` 消息构造（GiftSendMessage：giftId/senderId/receiverId/roomId/totalCoin/orderNo/sendTime/locale）、`__cron` 衰减触发、`openBoxAward`（lita-basic，鉴权方式待确认，参照 SpinDrawService AccessToken 伪造先例） |
| MySQL 直连（lita_active + lita_basic 双库） | 造数/清理：`mod_task_user_round(_log/_step)`（本 biz 测试用户行）、`treasure_box_bless_user(_record)`、`gift_award_queue`（测试用户 BOX_BLESS_* 行）、`user_gift_package`（GIFT 赐福发放产物） |
| 配置基线 | Nacos `{biz}.yaml`（gifts/pools/decayPercent/TaskModule 实例）+ `treasure_box_bless_config` + `treasure_box_prob` bless 行 + `mod_common_round` 轮次初始化（`/p/init` 或首访触发，幂等）——001 负责校验存在性 |
| 测试用户 | 固定 userId 池（送礼人 A、收礼人 B、衰减对照 C 等），每用例执行前清理其数据，用例可重复执行 |

清理范围仅限本 biz 与测试用户行；`mod_common_round` 为公共轮次不清理。注意 `treasure_box_bless_config`（active-v3 侧 1 分钟缓存）与 `treasure_box_prob`（60s 缓存）调参后有延迟。

## 模拟时间约定（重要）

活动预期 2026-10-28 发布，冒烟执行时活动未开始/窗口待定——**所有接口调用与 consumer 消息必须显式携带 `debugTimestamp`**（l-debug-timestamp 头），禁止依赖真实时间。格式：`yyyy-MM-ddTHH:mm:ss`（北京）或带 `±HH:mm` 偏移；不支持毫秒/空格分隔（解析失败静默回退真实时间——didibus 已验证的框架行为，active-v3 同框架）。活动有效期门槛是否响应 debug 时间随 001 实测确认。

| 代号 | 含义 | 取值（大区本地时间计） | 用途 |
|---|---|---|---|
| `T_PRE` | 活动开始前 | 上线前 1~2 天 | 配置校验、轮次初始化触发 |
| `T_D1` | 活动第 1 天 | 上线日 18:00（按实际上线时间定） | 正式业务：累加/发放/生效/查询 |
| `T_D2` | 第 2 天 | 次日 10:00 | 跨天场景、衰减判定 |
| `T_D2_0001` | 第 2 天日切后 | 次日 00:01 | 「今日已送」对照造数（006） |
| `T_D2_SETTLE` | 第 2 天日切点 | 次日 00:05（各大区换算北京：ko=前一日 23:05、ph=00:05、in/vi=01:05） | `__cron` 触发衰减 |
| `T_OUT` | 活动期外 | 开始前/结束后（框架 ±7d 宽限内） | 拒绝场景：消息不累加 |

## 用例列表

### 001-config-init —— 配置与预置数据校验

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 调用活动 config（T_PRE） | check | 活动 biz 可访问、enableLocales、起止时间与上线计划一致（biz 名/别名确认，见待确认 #1） |
| 读 yaml 业务配置 | check | `magicboxBless.gifts`（default+大区覆盖，魔盒 giftId 清单=金币/钻石魔盒）、`pools`（六类条目、权重和>0、expireSeconds）、`decayPercent`；TaskModule 实例（按大区分组）`repeat.values` 的 target |
| 查 `mod_common_round` | check | bless 任务轮次已初始化：一个轮次=整活动期（periodDuration=活动时长），各大区一行 |
| 查 lita_basic 三表存在性 | check | `treasure_box_bless_config` / `_user` / `_user_record` 可查询（建表完成，上线清单 #1） |
| 查 `treasure_box_bless_config` | check | 金币/钻石魔盒各有 ≥1 条 state=1；启用类型 ⊆ yaml pools 类型集合（交集非空） |
| 查 `treasure_box_prob` | check | `box_type='bless'` 概率行存在（每魔盒，PROB_UP 前置） |
| funbit discount 依赖 | check | `sendGift` 携带 `discount`（如 5 折）结算价=原价×折扣/10（DISCOUNT 生效前置，验证路径见待确认 #6） |
| 队列环境干净度 | check | `gift_award_queue` 无本 biz 历史 `award_status=fail` 的 BOX_BLESS_* 积压（可选） |

### 002-bless-add —— 送礼累加赐福值

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 清理测试用户 A 的进度/赐福/队列数据 | act | — |
| 送非魔盒礼物（giftId ∉ gifts keys，T_D1） | act+check | 进度不变、无队列写入（白名单过滤） |
| 送 1 个金币魔盒（T_D1） | act | `__consumer/funbit.gift_send` |
| 累加正确 | check | 该魔盒 value += 比例(giftId)×1（_round 绝对值）；_log 正流水 1 条 value=+add、transNo=`{orderNo}`；未达 target 无队列 |
| 同 orderNo 重发消息（T_D1） | act+check | value 不再增加、_log 仅 1 条、无重复队列（唯一键幂等） |
| 一次送 N 个跨多档（T_D1） | act+check | value 累计正确；队列新增 stepDelta 条且 `order_no={orderNo}:1..stepDelta` 连续；每条 award_type ∈ pools∩config、expires_second=配置倒计时 |
| 期外消息（T_OUT） | act+check | 不累加（有效期校验） |
| 大区比例（若配置了覆盖） | check | locale=ko 送礼按 ko 比例表累加、走 task-ko 实例轮次 |

> 注：进度按（用户×魔盒）独立（需求 R1/R6），实现以 TaskModule 多 name 或多实例表达，断言粒度以测试环境实际配置为准（待确认 #3）。背包送礼累加语义无法经消息区分（无 boxFree 字段），按设计=照常累加，核销侧口径在 004 验证。

### 003-bless-grant —— 赐福发放（队列消费）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 真实链路触发（002 的跨档送礼）后等待消费（@Timer 2s） | act | — |
| 首个赐福状态 | check | `_user` 首条=ACTIVE：active_time=now、expire_time=now+expires_second（倒计时起点=**发放时刻**）、queue_no=1、locale/box_gift_id/bless_type/参数快照正确 |
| 第二条排队 | check | `_user` 第二条=WAITING（无 active_time） |
| GET 流水（R9 下发明细） | check | `_record` type=GET：trans_no=队列 order_no、create_time=下发时间、bless_user_id 已回填 |
| 队列重放幂等 | act+check | 对同一 order_no 重复触发发放动作：record 唯一键挡住、`_user` 不重复、状态不变 |
| 全类型覆盖（造数直写队列行 ×5 类型，award_status=create） | act | GUARANTEE/FREE/DISCOUNT/DOUBLE/PROB_UP 各一条（GIFT 已由真实链路概率覆盖，未中则一并造） |
| 全类型发放正确 | check | 消费后各类型 `_user/_record` 齐全、效果参数快照（GUARANTEE award_id=礼物/count、DISCOUNT discount 值）正确；GIFT 类型直达 `user_gift_package` 背包（active_name=biz）且**不写** `_user` |
| config 兜底 | check | 队列造一条 config 停用/未配置的类型 → award_status=fail（发放侧二次校验，冒烟可造数验证或降级为代码走查） |

### 004-bless-apply —— 赐福生效与核销（核心）

> 前置：使指定类型赐福处于 ACTIVE（优先消费 003 造数队列，或直写 `_user` status=ACTIVE+expire_time 未来）。核销那一次开箱送礼本身也是魔盒送礼，**进度照常累加**属预期副作用。

| 步骤 | 类型 | 校验点 |
|---|---|---|
| FREE 免费券：openBoxAward（T_D1） | act+check | 扣费 0（boxFree 语义）；核销：status=USED、use_time、use_batch_no、`_record` USE 流水（trans_no=use_batch_no） |
| DISCOUNT 优惠券：openBoxAward | act+check | 实扣=原价×折扣/10（funbit discount 生效）；正常核销 |
| DOUBLE 开一送一：openBoxAward | act+check | 产出数量×2（原数量扣费 + 追加同数量 free 条）；正常核销 |
| GUARANTEE 保底券：openBoxAward | act+check | 整箱跳过概率：全部格产出=award_ref 礼物×bless_count、free=true（不扣费）；与 bizhong 计数互不影响 |
| PROB_UP 概率提升：openBoxAward | act+check | boxType 强制=bless 按 `treasure_box_prob` bless 概率表开奖；正常核销 |
| 核销激活下一条 | check | 原 ACTIVE=USED 后，最早 WAITING 顶上变 ACTIVE 且 active_time/expire_time **重算**（=激活时刻+valid_seconds） |
| 送礼失败不核销 | act+check | 造金币不足使 openBox 扣费失败（用 DISCOUNT 场景）→ 赐福仍 ACTIVE、无 USE 流水 |
| 背包送礼不核销（Q5 推荐口径） | act+check | 造背包库存 → 走背包送礼链路（boxFree=true）→ 赐福不生效、状态仍 ACTIVE（**待产品拍板**，拍板相反则改为「生效但 FREE/DISCOUNT 无收益消耗」口径） |

### 005-bless-queue —— 队列顺序与过期

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 一次触发多赐福排队 | check | 002 跨档送礼产生的 ≥2 条赐福：按 queue_no/id 升序，仅第 1 条 ACTIVE、其余 WAITING |
| 核销后顶替 | act+check | 核销当前（走 004）→ 最早 WAITING→ACTIVE、倒计时重算 |
| 过期懒流转 | act+check | 直写当前 ACTIVE 的 expire_time=过去 → 调用 openBoxAward（或 app/room 查询）触发：status=EXPIRED + `_record` EXPIRE 流水（trans_no=`exp-{bless_user_id}`）+ 下一条 WAITING 激活（若有） |
| 过期后重新累加正常触发 | act+check | 赐福全部终结后再次跨档送礼 → 新赐福正常 ACTIVE（无残留状态阻塞） |

### 006-decay —— 赐福值衰减（日切 Cron）

> ⚠️ 口径探测：cron 在大区日切后 5 分钟执行，"当天没送"的正流水判定按**刚结束的一天（需求语义）**还是**执行当日（设计原文 `create_time ∈ 今日` 字面）**，设计存在歧义——步骤 2 实测确认后记录口径。

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 造数：C 两日均无正流水、value=X>0（流水在更早日期） | act | — |
| 口径探测：A 于 T_D1 送（D1 有正流水、D2 无）、B 于 T_D2_0001 送（D2 有、D1 无） | act | — |
| 触发 ko 日切 cron（time=T_D2_SETTLE 换算北京） | act | — |
| 确定性衰减：C | check | value -= floor(target×10%)；`_log` 负流水 1 条 transNo=`decay-{yyyyMMdd}`、value=-decayAmount |
| 口径结论：A/B 恰好其一衰减 | check | 口径1（昨日=D1）：A 送了不衰减、B 衰减；口径2（今日=D2）：A 衰减、B 不衰减。实测记录；若与需求口径（A 不该衰减）不符 → 记录问题与需求方确认 |
| 扣到 0 不置负 | check | value < decayAmount 的用户衰减后=0 |
| 幂等 | act+check | 重复触发同日 cron：无新增负流水、value 不变（decay-{yyyyMMdd} 幂等） |
| 高水位不重复发奖 | act+check | C 衰减后重新累加至原已结算 step → 不重复触发赐福（step 回退/唯一键）；跨到新 step → 正常触发 |
| 大区隔离 | check | ph 日切触发仅影响 ph 轮次用户，ko 用户 value 不变（各 locale 独立轮次行） |
| value=0 不衰减 | check | 候选过滤 value>0，0 值用户无负流水 |

> 注：衰减按魔盒独立（送金币没送钻石 → 仅钻石衰减），受口径影响构造较繁，冒烟先不展开，全量用例补。

### 007-app-room —— 进度条与赐福状态查询

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 无赐福查询（清空 A 的 `_user`） | check | `boxBless.boxes[]` 清单=yaml 比例表 keys；value/target 与 `_round` 一致、addValue=比例表；active=null |
| 有 ACTIVE 查询 | check | active={type, discount, expireTime, waitingCount} 与 `_user` 一致（waitingCount=WAITING 条数） |
| 大区实例 | check | locale=ko 用户 target/addValue 按 task-ko 实例配置返回 |
| 新用户 | check | 全 0 进度、boxes 齐全不报错 |

## 执行顺序与依赖

```
001 → 002 → 003 → 004 → 005 → 006 → 007
（001 是其余所有用例的前置；002 为 003/005 提供真实队列数据；004 依赖 003 发放的赐福；各用例自清理、可独立重跑）
```

## 待确认事项

1. **biz 名/别名**（设计示意 `magicbox-bless`）与测试环境 `{biz}.yaml`、`main.yaml` 注册、活动起止时间（预期 2026-10-28 上线）
2. **魔盒礼物 ID 与参数**：金币/钻石魔盒真实 giftId（yaml gifts keys）、各魔盒 target、比例（含大区覆盖）、各赐福类型 `expireSeconds`（待运营配值——005 过期用例用造数绕过真实等待）
3. **TaskModule 进度划分**：按魔盒多 name 还是多实例表达（设计 yaml 为示意），决定 002/006/007 断言粒度
4. **Q5 背包送礼是否核销**待产品拍板（冒烟按推荐口径=购买送礼才核销；拍板相反需改 004 末步）
5. **衰减"当天没送"口径**：日切 cron 执行时刻的"今日"语义（刚结束的一天 vs 执行当日）——006 内置探测步骤，实测后回填结论
6. **lita-basic 调用方式**：`openBoxAward` 测试环境鉴权（参照 SpinDrawService AccessToken 伪造先例）；funbit `sendGift` discount 的可观测验证路径（结算流水/响应金额）
7. **测试环境前置**（上线清单 #1/#2/#3/#5/#8）：三表建表、TaskModule `stepDelta` 框架小改+存量活动回归、funbit discount 支持、`treasure_box_prob` bless 概率行、Nacos yaml 上传
8. **范围外（后续补）**：公屏广播两态文案（active-v3 直投，需房间通道验证手段）、R9 下发明细导出（exports/）、魔盒换新 new 标签（纯配置：update_time+tag_days=9）、checks/ 线上巡检
