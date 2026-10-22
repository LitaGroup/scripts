# 魔盒-幸运赐福（box-bless）冒烟测试大纲

> 来源文档：需求 `documents/80`（2026-10-20）、技术设计 `TECHNICAL_DESIGN.md`（**v3.8**，2026-10-21）——项目 117 <http://project.cinta.team/projects/117>
> 实现已落地：active-v3 `active/magicbox/bless/` + `business/magicbox/bless/`；biz = **`magicbox-bless-v202611`**（alias `magicbox-bless`）
> 冒烟范围：核心链路 7 条（配置 → 累加 → 发放 → 生效核销 → 多券与过期 → 衰减 → 进度查询）。公屏广播文案、R9 下发明细导出、魔盒换新 new 标签不在本次范围
> 测试环境：test；送礼累加主路径走测试接口 `POST /active/v3/magicbox-bless/test/giftSend`（同步返回 value/stepNow），真实链路负例走 `POST active/v3/__consumer/funbit.gift_send`；衰减走 `POST active/v3/__cron`（body `{biz, time}`，time 为 ISO 带偏移、按 cron 表达式匹配）

## 活动要点（用例设计依据，v3.8 口径）

- **双服务分工**：active-v3（送礼累加 TaskModule / 日切衰减 cron / 独立查询接口 / 触发判断与发放写队列）+ lita-basic（`treasure_box_bless_config/_user/_user_record` 三表、`gift_award_queue` 消费发放 BOX_BLESS_* 分支、`openBoxAward` 开奖生效核销）；funbit-api 依赖改造（`sendGift` 新增 `discount`，结算价=配置价×折扣/10 向上取整，主播按折后分账）
- **赐福值进度零建表**（TaskModule，`stageType: REPEAT`）：3 个大区组实例 topic=`bless-default`(in/vi) / `bless-ko`(ko) / `bless-ph`(ph/ar)；**name=`bless_{boxId}`（6 魔盒各一行）**；一轮次=整活动期（P30D，periodDateFormat=yyyyMMdd）；`mod_task_user_round_log` 唯一键 (biz,topic,round,user_id,trans_no) 做消息幂等，**累加 transNo=`{batchNo}:bless:{boxId}`**、衰减 transNo=`decay-{yyyyMMdd}-{boxId}`；MAIN 行/`mod_task_user_round_step` 本活动不使用
- **累加过滤（三条同时满足）**：`boxId ∈ yaml gifts 白名单` + `roomSource=='voiceroom'` + `giftShelfType=='sysactive_treasur_box'`；`add = 比例(boxId, 大区组) × 实际魔盒数`。正式 consumer 链路实际魔盒数按 `batchNo` 查 funbit 库 `treasure_box`（`SUM(gift_count) WHERE batch_no+sender_id+box_gift_id`），≤0 跳过——**直接发 __consumer 消息必须先造 treasure_box 行**，否则不计；测试接口 `test/giftSend` 直接按入参 `giftCount`（不查 treasure_box）
- **触发判断收归 Active 层**（决策12，框架零改动）：自算 `stepNow=floor(value/target)`，与发放记录比对逐管发放；**发放幂等高水位=`active_source_record`**（unique_key=`bless:{userId}:{boxId}:{step}`，(active_name,unique_key) 唯一索引撞键跳过，**只升不降**，衰减不删 → 回升不重复发）；队列 `gift_award_queue.order_no='{orderNo}:s{step}'`、`award_status='create'`、`award_mod='add'`、`active_name=biz`、`expires_second`=券类倒计时秒、`remark=JSON {"boxId":N,"probUpRate"?}`
- **奖池配置在 DB**（v3.4 起）：`lita_basic.treasure_box_bless_config(gift_id, locale, bless_awards JSON, state)`，uk(gift_id,locale)；active-v3 @LocalCache 1 分钟只读抽取（加权随机，weight=0 等价停用）；表无行/state=0/JSON 为空 → 配置缺失告警不触发；yaml 只配 `magicboxBless.{roomSource, decayPercent, gifts, targets}`（比例/target 按大区组 default/ko/ph 覆盖，组缺失回退 default）
- **六种赐福**（队列 award_type）：`BOX_BLESS_GUARANTEE` 保底券（award_id=必出礼物、award_count=数量）/ `BOX_BLESS_FREE` 免费券 / `BOX_BLESS_DISCOUNT` 优惠券（award_id=折扣值 1-9）/ `BOX_BLESS_DOUBLE` 开一送一 / `BOX_BLESS_PROB_UP` 概率提升（award_id=提升礼物，remark.probUpRate=目标概率 0~1）/ `GIFT` 背包礼物赐福（现有类型直达背包，award_mod='add'、expires_second=awardNum×86400）
- **发放**（lita-basic `GiftAwardAutoTimer` @Timer 2s → `UnionAwardService` BOX_BLESS_* 分支，本地事务）：①按 (boxId, 用户大区) 校验 config（不在 bless_awards → award_status=fail+飞书告警）②INSERT `_record`(type=GET, trans_no=队列 order_no) 幂等闸门 ③INSERT `_user`（gift_id=boxId、award_config 效果参数快照、**status=ACTIVE 直接起算倒计时**：create_time=发放时刻、expire_time=now+expires_second）④回填 record.bless_user_id；GIFT 走现有分支进 `user_gift_package` 背包（**不写 _user**）
- **全生效模型**（决策13，产品确认）：**无 WAITING、无 EXPIRED、无激活动作**；多张券同时 ACTIVE、同时倒计时；使用时按 **id 升序（最早获得）** 取未过期券核销；过期不写状态/流水，统一按 `expire_time > now` 过滤推导；boxBless 响应 `active.couponCount`=该魔盒有效券数
- **生效核销**（lita-basic `openBoxAwardCommon`，查 `status='ACTIVE' AND expire_time>now ORDER BY id ASC LIMIT 1`）：仅**购买送礼（boxFree=false）**核销，背包库存送礼跳过生效不核销（决策11）；FREE→boxFree=true 0 扣费 / DISCOUNT→item 带 discount（依赖 funbit 改造）/ DOUBLE→拆两条（原数量扣费+追加同数量 free）/ GUARANTEE→整箱跳过概率全出 awardRef×count（free=true，与 bizhong 互不影响）/ **PROB_UP→内存中只把指定礼物概率调到 probUpRate、其余按原比例缩放**（决策5，不改 treasure_box_prob、不新增 box_type）；送礼成功→乐观核销（`UPDATE ... WHERE status='ACTIVE'`）+ `_record` USE 流水（trans_no=送礼批次号）；失败不核销；核销口径=一次赠送动作核销 1 张（无论 count 与收礼人数）
- **衰减**（决策12 自定义原子 SQL，不走模块 update、不动 MAIN 行）：`@ActiveCron 0 5 23/0/1 * * ?`（北京 23:05=ko 次日 00:05、00:05=ph/ar、01:05=in/vi；__cron 按 time 匹配）；口径=**昨天（刚结束的一天）全天无正流水才衰减**（衰减负流水 value<0 不影响判定）；`decayAmount=floor(target×decayPercent/100)`（示例 20%）；先插 log（trans_no=`decay-{yyyyMMdd}-{boxId}` 按日幂等）再 `UPDATE value=GREATEST(0, value-decay)` 扣到 0 不置负；按 biz+topic+name 限定范围，只扫 value>0
- **查询接口**（决策9，独立于 /app/room）：`POST /active/v3/magicbox-bless/boxBless {boxId}` → `{boxGiftId, boxImage, boxName, value(=累计值%target，Active 层自算), target, addValue, active{type(去前缀短名 GUARANTEE/FREE/...), discount, expireTime, couponCount, awardId, awardImage, awardName, awardPrice, probUpRate, blessReTime}|null, action}`；boxId 非活动魔盒/未传/活动未开启 → data=null。另有 `POST /magicbox-bless/list`（H5 六魔盒+奖池）；DefaultController `/{biz}/boxBless|h5List|testGiftSend|p/init` 同功能
- **测试接口**：`POST /active/v3/magicbox-bless/test/giftSend {orderNo, senderId, boxId, giftId?, giftCount, roomId?, locale?, roomSource?, sendTime?}` → `{orderNo, senderId, boxId, value, stepNow}`；内部 `context.getSession().setTimestamp(sendTime)` 覆盖时间后复用正式 `processGiftSend`，actualBoxCount 直接=giftCount（免造 treasure_box），同步返回可直接断言

## 公共层（已落地）

| 项 | 说明 |
|---|---|
| `BoxBlessService`（src/services/） | `config/initActivity/p/init`、`boxBless/list/testGiftSend`、`sendGiftConsumer`（__consumer 真实链路消息构造：box_id/gift_shelf_type/room_source 可参数化）、`runCron({biz,time})`；MySQL 查询（lita_active + lita_basic 双库）：mod_task_user_round(_log)、active_source_record、gift_award_queue、treasure_box_bless_config/_user/_user_record、mod_common_round |
| 清理 `cleanUsers` | 本 biz + 测试用户行：lita_active 的 mod_task_user_round(_log/_step)、active_source_record（`bless:{uid}:%`）；lita_basic 的 treasure_box_bless_user(_record)、gift_award_queue（active_name+user_id）。`mod_common_round` 公共轮次不清理 |
| 测试用户 | 复用 pk 用户池 USER_A=13126（送礼人）/USER_B=13125（收礼人）/USER_C=13127（大区覆盖对照），每用例执行前清理，可重复执行 |

注意 `treasure_box_bless_config`（active-v3 侧 @LocalCache 1 分钟）调参后有延迟；真实 consumer 正例链路需先在 funbit 库 `treasure_box` 造批次行（batch_no/sender_id/box_gift_id/gift_count），冒烟 002 仅用 consumer 覆盖负例过滤。

## 模拟时间约定（重要）

活动期（doc yaml）：**2026-11-01 00:00 ~ 2026-11-30 23:59:59**（R 后缀=各大区本地），`initTime=2026-10-25`。
**⚠️ 测试环境实测（2026-10-22 curl 探测）**：Nacos 实际上传窗口为 **2026-10-01 ~ 2026-11-30**（/config startTime=in/vi 本地 10-01 00:00），且当前生效轮次只覆盖 10 月（11-02 送礼 value=0 不落库、10-26 正常累加）——时间代号按实测可用窗口取值，Nacos 调整为 11 月窗口后需同步修改 `_lib/times.ts`。
**所有接口调用与 consumer 消息必须显式携带 `debugTimestamp`**（l-debug-timestamp 头），禁止依赖真实时间。格式：`yyyy-MM-ddTHH:mm:ss`（北京）或带 `±HH:mm` 偏移；不支持毫秒/空格分隔（解析失败静默回退真实时间——didibus 已验证的框架行为）。

| 代号 | 含义 | 取值（大区本地时间计） | 用途 |
|---|---|---|---|
| `T_INIT` | initTime 之后、轮次内 | 2026-10-26 12:00 | 配置校验、/p/init 轮次初始化 |
| `T_D1` | 活动第 1 天 | 2026-10-27 18:00 | 正式业务：累加/发放/生效/查询 |
| `T_D2` | 第 2 天 | 2026-10-28 10:00 | 跨天场景、衰减判定 |
| `T_D2_0001` | 第 2 天日切后 | 2026-10-28 00:01 | 「今日已送」对照造数（006） |
| `CRON_DECAY_*` | D1→D2 日切点（北京） | ko=2026-10-27T23:05+08:00、ph/ar=2026-10-28T00:05、in/vi=2026-10-28T01:05 | `__cron` 触发衰减（time 精确到 cron 分钟） |
| `T_OUT` | 活动期外（开始前） | 2026-09-28 12:00 | 拒绝场景：消息不累加 |

## 用例列表

### 001-config-init —— 配置与预置数据校验

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 调用活动 config（T_INIT） | check | 起止时间=实测 Nacos 窗口（2026-10-01~11-30 各大区本地）、enableLocales 含 ko/ph/in/vi/ar |
| /p/init 初始化（round=1，T_INIT） | act | 幂等（pipelines.init 依次 init 三个 TaskModule 实例） |
| 查 `mod_common_round` | check | bless-default/bless-ko/bless-ph 各大区均有轮次且覆盖 T_D1（轮次 key 随 Nacos 窗口，当前观测=202610） |
| 查 lita_basic 三表存在性 | check | `treasure_box_bless_config` / `_user` / `_user_record` 可查询（建表完成，init.sql） |
| 查 `treasure_box_bless_config` | check | 6 魔盒（6040/6041/6155/6526/6527/8978）× 当前大区 state=1 行齐全；bless_awards 可解析、weight 和>0、类型 ⊆ 六种赐福 |
| h5List 接口（T_D1） | check | 返回 6 个魔盒（id 升序）且每个 blessAwards 非空（交叉验证 DB 配置与接口解析） |
| boxBless 边界 | check | 未传/非法 boxId → data=null；新用户合法 boxId → value=0/target=100/addValue=5/active=null |

### 002-bless-add —— 送礼累加赐福值

> 主路径走 `test/giftSend`（同步返回 value/stepNow，免造 treasure_box）；真实 `__consumer` 链路仅覆盖负例过滤。

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 清理测试用户 A/C 数据 | act | — |
| 负例：consumer 消息 giftShelfType≠sysactive_treasur_box（T_D1） | act+check | 无 _round/_log 行（宝箱流水过滤） |
| 负例：consumer 消息 roomSource≠voiceroom | act+check | 不累加（来源过滤） |
| 负例：boxId=999999（非白名单） | act+check | 不累加（白名单过滤） |
| 正例：testGiftSend A 送 6040×1（T_D1，locale=in） | act+check | 同步返回 value=5、stepNow=0；`mod_task_user_round`（topic=bless-default, name=bless_6040）value=5；_log 正流水 1 条 trans_no=`{orderNo}:bless:6040` |
| 同 orderNo 重发（幂等） | act+check | value 不变、_log 仍 1 条、无队列/无 source_record |
| 一次送 40 个跨 2 档（+200 → value=205） | act+check | 返回 stepNow=2；`active_source_record` 出现 `bless:{A}:6040:1`/`:2`；`gift_award_queue` 新增 2 条 order_no=`{orderNo}:s1`/`:s2`、award_type ∈ config 类型、expires_second>0（券类）、remark 含 boxId=6040 |
| 期外消息（T_OUT） | act+check | 不累加（报错或静默跳过，记录实测行为） |
| 大区覆盖（locale=ko） | act+check | USER_C 走 task-ko 实例：topic=bless-ko、value += 4（ko 比例）、target=80 |

### 003-bless-grant —— 赐福发放（队列消费）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 真实链路触发（002 的跨档送礼）后等待消费（@Timer 2s） | act | — |
| 赐福状态（全生效模型） | check | `_user` 每队列行一条：status=**ACTIVE**（无 WAITING）、create_time=发放时刻、expire_time=create_time+expires_second、gift_id=boxId、locale=用户大区、bless_type/award_config 快照正确 |
| GET 流水（R9 下发明细） | check | `_record` type=GET：trans_no=队列 order_no、bless_user_id 已回填、create_time=下发时间 |
| 队列重放幂等 | act+check | 同 order_no 重复消费：record 唯一键挡住、`_user` 不重复 |
| 全类型覆盖（造数直写队列行 ×5 类型，award_status=create） | act | GUARANTEE/FREE/DISCOUNT/DOUBLE/PROB_UP 各一条（GIFT 未中则一并造） |
| 全类型发放正确 | check | 消费后各类型 `_user/_record` 齐全、award_config 快照正确（GUARANTEE awardRef+count、DISCOUNT discount、PROB_UP awardRef+probUpRate）；GIFT 类型直达 `user_gift_package` 背包（active_name=biz）且**不写** `_user` |
| config 兜底 | check | 队列造一条 config 停用/未配置的类型 → award_status=fail（发放侧二次校验） |

### 004-bless-apply —— 赐福生效与核销（核心）

> 前置：使指定类型赐福处于 ACTIVE（优先消费 003 造数队列，或直写 `_user` status=ACTIVE+expire_time 未来）。核销那一次开箱送礼本身也是魔盒送礼，**进度照常累加**属预期副作用。openBoxAward 鉴权参照 SpinDrawService AccessToken 伪造先例。

| 步骤 | 类型 | 校验点 |
|---|---|---|
| FREE 免费券：openBoxAward（T_D1） | act+check | 扣费 0（boxFree 语义）；核销：status=USED + `_record` USE 流水（trans_no=送礼批次号） |
| DISCOUNT 优惠券：openBoxAward | act+check | 实扣=原价×折扣/10（小数向上取整，funbit discount 生效）；正常核销 |
| DOUBLE 开一送一：openBoxAward | act+check | 产出数量×2（原数量扣费 + 追加同数量 free 条）；正常核销 |
| GUARANTEE 保底券：openBoxAward | act+check | 整箱跳过概率：全部格产出=awardRef 礼物×count、free=true（不扣费）；与 bizhong 计数互不影响 |
| PROB_UP 概率提升：openBoxAward | act+check | 内存调权（指定礼物概率=probUpRate、其余按原比例缩放），不改 treasure_box_prob；正常核销 |
| 最早获得先用 | act+check | 多张 ACTIVE 券时核销 id 最小的一张；其余券保持 ACTIVE 继续倒计时（无激活/重算动作） |
| 送礼失败不核销 | act+check | 造金币不足使扣费失败 → 赐福仍 ACTIVE、无 USE 流水 |
| 背包送礼不核销（决策11） | act+check | 走背包库存送礼链路（boxFree=true）→ 赐福不生效、状态仍 ACTIVE 继续倒计时 |

### 005-bless-multi —— 多券并存与过期（全生效模型）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 一次触发多赐福 | check | 002 跨档送礼产生的 ≥2 条赐福**全部 ACTIVE**（无 WAITING）、同时倒计时（expire_time=各自 create_time+expires_second） |
| 核销顺序 | act+check | openBoxAward 核销**最早获得**（id 最小）的一张 → USED；其余 ACTIVE 不受影响 |
| 过期纯推导 | act+check | 直写某券 expire_time=过去 → 无状态流转/无 EXPIRE 流水；boxBless 查询与 openBoxAward 生效均按 expire_time>now 过滤该券（couponCount 减 1、active 取下一最早未过期券） |
| 过期后重新触发 | act+check | 全部过期后再次跨档送礼 → 新赐福正常 ACTIVE（无残留状态阻塞；source_record 高水位只升不降不影响新管数发放） |

### 006-decay —— 赐福值衰减（日切 Cron）

> 口径已明确（v3.8）：**昨天（刚结束的一天）全天无正流水才衰减**；decayAmount=floor(target×decayPercent/100)，示例 decayPercent=20。

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 造数：C 昨天无正流水、value=X>0（流水在更早日期） | act | — |
| 对照：A 于 T_D1 送（昨天有正流水）、value>0 | act | — |
| 触发 in/vi 日切 cron（__cron time=2026-11-03T01:05:00+08:00） | act | — |
| 确定性衰减：C | check | value -= floor(target×20%)；`_log` 负流水 1 条 trans_no=`decay-{yyyyMMdd}-{boxId}`、value=-decayAmount |
| 昨天送过不衰减：A | check | value 不变、无负流水 |
| 扣到 0 不置负 | check | value < decayAmount 的用户衰减后=0（GREATEST(0,…)） |
| 幂等 | act+check | 重复触发同日 cron：无新增负流水、value 不变（decay-{yyyyMMdd}-{boxId} 幂等） |
| 高水位不重复发奖 | act+check | C 衰减后重新累加至历史已达管数 → 不重复触发（source_record 只升不降）；跨到新管数 → 正常触发 |
| 大区隔离 | check | ko 日切触发仅影响 bless-ko 轮次用户，in 用户 value 不变 |
| value=0 不衰减 | check | 候选过滤 value>0，0 值用户无负流水 |

### 007-box-bless-query —— 进度条与赐福状态查询（独立接口）

| 步骤 | 类型 | 校验点 |
|---|---|---|
| 无赐福查询（清空 A 的 `_user`） | check | `boxBless {boxId}`：value=value%target、target/addValue 与 yaml 一致、active=null |
| 有 ACTIVE 查询 | check | active={type(短名), discount, expireTime, couponCount, ...} 与 `_user` 最早未过期一张一致；couponCount=有效券总数 |
| 进度自算口径 | check | 衰减后 value%target 与接口返回一致（不依赖模块 progress 事件） |
| 大区实例 | check | locale=ko 用户 target=80/addValue=4 按 task-ko 配置返回 |
| 非活动魔盒/未开启 | check | boxId 非白名单 → data=null |
| h5List | check | 6 魔盒 + 各大区奖池（背包/保底礼物含图片/名称/价格） |

## 执行顺序与依赖

```
001 → 002 → 003 → 004 → 005 → 006 → 007
（001 是其余所有用例的前置；002 为 003/005 提供真实队列数据；004 依赖 003 发放的赐福；各用例自清理、可独立重跑）
```

## 待确认事项

1. ~~biz 名/别名~~ **已确认**：`magicbox-bless-v202611`（alias `magicbox-bless`）。**Nacos 实测窗口=2026-10-01~11-30（in/vi 本地换算），与 doc yaml 的 11-01~11-30 不一致**（2026-10-22 探测，应为提前开放测试）；轮次 key 当前观测=202610。正式上线调整窗口后需同步 `_lib/times.ts` 与 001 断言
2. **魔盒礼物 ID 与参数**：6040/6041/6155/6526/6527/8978，default 比例 5/8/5/8/5/8、ko 4/6/4/6/4/6，target default/ph=100、ko=80（**已经 test/giftSend 实测**：6040×1 → value=5、target=100、addValue=5，与 yaml 样例一致）；各赐福类型 `expireSeconds` 待运营配值（005 过期用例用造数绕过真实等待）
3. **测试环境前置**（上线清单 #1/#3/#5/#6/#8）：lita_basic 三表建表（init.sql）、funbit discount 支持（004 DISCOUNT 前置）、`treasure_box_bless_config` 初始化、Nacos `{biz}.yaml` 上传 + `main.yaml` 注册、上传后先跑 `/{biz}/p/init` 预建轮次
4. **lita-basic 调用方式**：`openBoxAward` 测试环境鉴权（参照 SpinDrawService AccessToken 伪造先例）；funbit `sendGift` discount 的可观测验证路径（结算流水/响应金额）
5. **真实 consumer 正例**：需先在 funbit 库 `treasure_box` 造批次行（batch_no/sender_id/box_gift_id/gift_count），冒烟 002 以 test/giftSend 覆盖正例、consumer 仅覆盖负例过滤，真实链路正例后续补
6. **测试环境轮次不一致（2026-10-22 实测）**：bless-default 只有 10 月轮次、bless-ko/bless-ph 只有 11 月轮次（ko/ph 在 10 月送礼 value=0 不落库、11 月正常）——疑似三个 TaskModule 实例 roundSetting 配置不一致或历史 init 残留，`/p/init` 幂等不补齐。需拉齐 Nacos 配置后重跑 init，否则 002 的 ko 大区步骤会 fail
7. **范围外（后续补）**：公屏广播两态文案（active-v3 直投，需房间通道验证手段）、进度刷新消息 BOX_BLESS_REFRESH、背包礼物弹窗 MAGICBOX_BLESS_AWARD、R9 下发明细导出（exports/）、魔盒换新 new 标签（纯配置：update_time+tag_days=9）、checks/ 线上巡检
