# 荣耀等级 202610 测试报告

- 项目：新一期游戏荣耀等级（10.26-12.27）（projectId=99）
- 测试环境：`https://api.test.cinta.team`（网关前缀 `active-main/v1/gameGrade`，数据直连 lita_basic / lita_active）
- 脚本仓库：`projects/feature/game-grade/tests/`（README 含运行方式与约定）
- 报告日期：2026-10-13（**全绿回归**：consumer 事件时间修正 + 服务端缓存 TTL 调至 10s + C2 纯新用户断言修正）
- 时间模拟：`l-debug-timestamp`（`2026-10-20T12:00:00+08:00` 旧窗口 / `2026-10-26T06:00:00+08:00` 切换日+6h / `2026-10-27T17:00:00+08:00` +41h）

## 结论

**58/58 全绿（001 17/17、002 25/25、003 16/16），多轮采样一致。** 本轮解决三项：① **consumer 业务时间取消息体 `create_time`（事件时间），不认 `l-debug-timestamp`** —— 用例消息 `create_time`/`id` 改为模拟 epoch（原用真实时间导致写入 202608、查 202610 落空）；② **服务端 per-user 赛季状态缓存** —— TTL 调整为 10s 后，用例间隔（>40s）天然超过 TTL，同一用户可重复跑（此前 TTL 较长时连续重跑命中热缓存会跳过切换导致 A/B 失败）；③ **场景 C2 断言修正** —— 纯新用户窗口内 GET 会初始化一行 `grade=None/experience=0`（无 SEASON_SWITCH），C2 按此断言且改用独立新用户 `USER_FRESH2`（C1 的旧窗口 GET 会先把用户初始化到 202608，C1/C2 不可共用用户）。另：此前「consumer 链路零写入」结论**不成立**（实测消费链路正常：真实用户 13567/8142 当日已在 202608 产生 SEASON_SWITCH）。

> 关键约定：用例必须使用**真实测试用户**（16525、16524、16523、16522、16521、16519、16518、16504、16501、16500、16499 等 11 个，见 `_lib/constants.ts`）——结算发奖、用户昵称/头像回填等写路径按 user_id 校验用户，合成 UID 会被静默跳过（合成用户结算有名次无奖励明细，真实用户正常：16521→6000、16519→3000、16518→1000）。

## 结果汇总

| 用例 | 覆盖 | 结果 |
| --- | --- | --- |
| 001-config-time-match | 配置按时间匹配 + 结算归属 | **17/17 通过**（多次采样一致） |
| 002-season-switch-upgrade | 懒式切换首次触达晋级（consumer / entrance 双触发） | **25/25 通过**（多次采样一致） |
| 003-eggwar-cross-season-settle | 跨赛季日/周鸡蛋结算 + 首轮初始化 | **16/16 通过**（多次采样一致） |

## 覆盖明细

### 001 配置按时间匹配（17/17）
- 场景1 旧赛季窗口内（10-20）→ biz=`game_grade_202608`（yesterday=202608）✅（修复前选中 202610，已回归）
- 场景2 新赛季开始后 6h → biz=`game_grade_202610`（yesterday=202608）✅
- 场景3 新赛季开始后 41h → biz=`game_grade_202610`（yesterday=202610）✅
- 旧窗口结算归属 202608：force 结算真实末轮后开新轮（周期 24h，锚点 10-20 00:00+08）✅
- 跨赛季日结算归属 202610：首轮锚定 10-26 00:00（+08）✅；不再产生 202608 新轮（endTime 上界守卫）✅
- 次日常规结算：首轮 FINISHED + 次日轮 RUNNING ✅

### 002 懒式赛季切换（25/25）
- 场景A consumer 触发（16525，Legend I→Epic I）：SEASON_SWITCH 经验流水 1 条、经验=映射等级 limit、游戏流水原样透传、切换发奖、同 transNo 幂等 ✅
- 场景B entrance 触发（16524，Mythic→Legend I/250000）：懒切换落库、SEASON_SWITCH 恰 1 条、切换发奖、重复触达幂等 ✅
- 场景C1 时间窗外（16523，ts=旧窗口）：无 202610 数据、无 SEASON_SWITCH ✅
- 场景C2 纯新用户窗口内（`USER_FRESH2`=16504）：初始化为 `grade=None/experience=0`、无 SEASON_SWITCH ✅
- 场景C3 纯新用户 UPDATE（窗口内）：`grade=None/experience=10`、无 SEASON_SWITCH、update_time=模拟时间 ✅
- 关键修正：`buildDealLog()` 的 `create_time`/`id` 取模拟 epoch（consumer 按事件时间判定赛季）；C2/C3 改用独立新用户（C1 的 GET 会把用户初始化到旧赛季，共用会导致 C2 变跨赛季切换）

### 003 跨赛季鸡蛋结算（16/16）
- 阶段A 旧赛季（202608）：合成末轮日/周 force 结算 FINISHED ✅；名次按积分降序（日 16521>16519>16518、周 16521>16519）✅；奖励按奖池比例发放（16521→6000、16519→3000、16518→1000，合计=奖池 9000）✅
- 阶段B 新赛季（202610）：日首轮 RUNNING 周期 24h 锚定 10-26 00:00 ✅；周首轮周期 7d 锚定 10-26 00:00 ✅；不再产生旧赛季新轮 ✅；PANEL 指向 202610 轮次 ✅

## 缺陷与风险

| # | 级别 | 描述 | 状态 |
| --- | --- | --- | --- |
| 1 | 已修正（用例） | **consumer 业务时间取消息体 `create_time`（事件时间），不认 `l-debug-timestamp`**。实测：仅改 `create_time`（真实 now → 模拟 2026-10-26 epoch）即改变落库赛季（202608→202610），改请求头无效；`/GET`、`/entrance`、`/event/user-deal-account.update` 则按 `l-debug-timestamp`。原用例 `buildDealLog()` 用 `Date.now()` → 消息按真实时间入账 202608，步骤 5 查 202610 落空。**用例已修正**：消息 `create_time`/`id` 取模拟 epoch。原「consumer 链路自 09-24 零写入」结论**撤销**——实测消费链路正常（真实用户 13567/8142 当日已在 202608 产生 SEASON_SWITCH） | 关闭 |
| 2 | 已解决（环境） | **服务端 per-user 赛季状态缓存（TTL）**：直连改库/清库不失效缓存。此前 TTL 较长时，同一用户连续重跑命中热缓存会跳过切换（A/B 失败）；**TTL 调整为 10s** 后用例间隔（>40s）天然超过 TTL，同一用户可重复跑，A/B 稳定通过 | 关闭 |
| 3 | 已修正（用例） | **场景 C2 断言修正**：纯新用户窗口内 GET 会初始化一行 `grade=None/experience=0`（无 SEASON_SWITCH），原断言「无等级行」不成立；且 C1 的旧窗口 GET 会把用户初始化到 202608，C1/C2 共用用户会使 C2 变跨赛季切换。**修正**：C2 断言改为「存在 None/0 行且 SEASON_SWITCH=0」，并将 C2/C3 改用独立新用户 `USER_FRESH2`（16504） | 关闭 |
| 4 | 记录 | **残留的 202610 非锚定日蛋轮会干扰 001**：若存在如 `20261027110000` 的旧轮，步骤 10 settle 因「当期已有轮」不再创建锚定首轮 → 步骤 11/14 失败。复跑前需清理 202610 残留轮次（`mod_eggwar_round`/`mod_eggwar_user_round`）。本轮已清理后 001 恢复 17/17 | 已知 |
| 5 | 记录 | 新赛季首轮锚点：001/003 多轮实测精确锚定 `2026-10-26 00:00:00+08`（旧 GMT-8 误解析到 16:00 的现象未复现；`ANCHOR_TOLERANCE_MS` 已收紧为 0） | 关闭 |
| 6 | 记录 | `finishRound` 轮次到期校验按真实时钟（不受 l-debug-timestamp 影响），测试已用 `force=true` 适配；真实线上无影响 | 关闭 |

> 修复记录：第 1 次回归「配置注册顺序未按 endTime 升序」已修正；本轮完成：① consumer 消息 `create_time`/`id` 改模拟 epoch（缺陷 #1）；② 服务端缓存 TTL 调 10s，恢复可重复跑（缺陷 #2）；③ C2 断言修正 + C2/C3 独立用户（缺陷 #3）；④ 清理 202610 残留轮次恢复 001（缺陷 #4）。结果：58/58 全绿。

## 环境与数据

- 测试用户：真实测试用户池（16525、16524、16523、16522、16521、16519、16518、16504、16501、16500、16499 等 11 个，见 `_lib/constants.ts`）；用例前后清理其 game-grade 数据（biz=202608、202610 四件套）
- 造数：上赛季等级行 `user_game_grade`；衰减期望动态查 `lita_basic.game_grade`（`next_season_grade` / `experience_limit`），不硬编码
- 轮次：合成轮 `20261025090001`/`20261025090002` + settle 副产物轮 diff 追踪清理；真实轮次链不触碰
- transNo：仅断言 `SEASON_SWITCH_` 前缀（season 取 yaml `season` 字段）
- consumer 消息体：对齐 `funbit.user_deal_account_log` 真实形态（biz 取线上在用值，含 details/in18_key/room_id）；**`create_time`/`id` 取模拟 epoch**（该端点按消息事件时间判定赛季，不认 `l-debug-timestamp`）
- 002 用户：`USER_CONSUMER=16525`（consumer）、`USER_ENTRANCE=16524`（entrance）、`USER_FRESH=16523`（C1）、`USER_FRESH2=16504`（C2/C3，须独立于 C1）
- 清理局限：`cleanUserGradeData` 仅删 lita_basic 四表；服务端 per-user 赛季状态缓存在此范围外（TTL=10s，用例间隔已超过）
- 复跑前置：清理 202610 残留轮次（`mod_eggwar_round`/`mod_eggwar_user_round`，避免 001 步骤 11/14 受非锚定旧轮干扰）
- 排查工具：API 失败请求自动在错误信息附带可复现 curl（敏感头脱敏）；`APITestResource.lastCurl` 可主动打印最近一次请求（场景 A 已接入）

## 复跑方式

```bash
node projects/feature/game-grade/tests/001-config-time-match.test.ts
node projects/feature/game-grade/tests/002-season-switch-upgrade.test.ts
node projects/feature/game-grade/tests/003-eggwar-cross-season-settle.test.ts
```
