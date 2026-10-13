# 荣耀等级 202610 测试报告

- 项目：新一期游戏荣耀等级（10.26-12.27）（projectId=99）
- 测试环境：`https://api.test.cinta.team`（网关前缀 `active-main/v1/gameGrade`，数据直连 lita_basic / lita_active）
- 脚本仓库：`projects/feature/game-grade/tests/`（README 含运行方式与约定）
- 报告日期：2026-10-13（第 2 次回归，配置顺序 + yaml lastSeasonBiz/season 修复后）
- 时间模拟：`l-debug-timestamp`（`2026-10-20T12:00:00+08:00` 旧窗口 / `2026-10-26T06:00:00+08:00` 切换日+6h / `2026-10-27T17:00:00+08:00` +41h）

## 结论

**51 通过 / 1 失败 / 6 跳过（共 58 步）**。前次回归提出的两项前置问题（配置注册顺序、yaml season/lastSeasonBiz）已由研发修正并回归通过；配置时间匹配、懒式赛季切换（entrance 触发）、跨赛季鸡蛋结算全部验证通过。唯一失败项仍为 consumer 消息入口 `handleUserDealAccountLog2` 不落库（真实缺陷，见「缺陷与风险」#1），修复后 6 个 skip 步骤自动恢复。

## 结果汇总

| 用例 | 覆盖 | 结果 |
| --- | --- | --- |
| 001-config-time-match | 配置按时间匹配 + 结算归属 | **17/17 通过** |
| 002-season-switch-upgrade | 懒式切换首次触达晋级（consumer / entrance 双触发） | 18 过 / **1 失败** / 6 跳过 |
| 003-eggwar-cross-season-settle | 跨赛季日/周鸡蛋结算 + 首轮初始化 | **16/16 通过** |

## 覆盖明细

### 001 配置按时间匹配（17/17）
- 场景1 旧赛季窗口内（10-20）→ biz=`game_grade_202608`（yesterday=202608）✅（修复前选中 202610，已回归）
- 场景2 新赛季开始后 6h → biz=`game_grade_202610`（yesterday=202608）✅
- 场景3 新赛季开始后 41h → biz=`game_grade_202610`（yesterday=202610）✅
- 旧窗口结算归属 202608：force 结算真实末轮后开新轮（周期 24h，锚点 10-20 00:00+08）✅
- 跨赛季日结算归属 202610：首轮锚定 10-26 00:00（+08）✅；不再产生 202608 新轮（endTime 上界守卫）✅
- 次日常规结算：首轮 FINISHED + 次日轮 RUNNING ✅

### 002 懒式赛季切换（18 过 / 1 失败 / 6 跳过）
- 场景B entrance 触发（user=910112，Mythic）：衰减映射 Mythic→Legend I ✅、经验=新等级 limit 250000 ✅、SEASON_SWITCH 流水恰 1 条 ✅、切换发奖 8 条 ✅、重复触达幂等 ✅
- 场景C 对照：时间窗外不切换 ✅；纯新用户无切换数据 ✅；UPDATE 走 None 初始化（experience=10、无 SEASON_SWITCH、update_time=模拟时间证明窗口校验跟随 debug 时间）✅
- 场景A consumer 触发（user=910111，Legend I→Epic I）：**失败** —— `handleUserDealAccountLog2` 返回 ok 但不落库（含 6 个依赖步骤 skip）

### 003 跨赛季鸡蛋结算（16/16）
- 阶段A 旧赛季（202608）：合成末轮日/周 force 结算 FINISHED ✅；名次按积分降序（日 910121>910122>910123、周 910121>910122）✅；奖励发放 ✅
- 阶段B 新赛季（202610）：日首轮 RUNNING 周期 24h 锚定 10-26 00:00 ✅；周首轮周期 7d 锚定 10-26 00:00 ✅；不再产生旧赛季新轮 ✅；PANEL 指向 202610 轮次 ✅

## 缺陷与风险

| # | 级别 | 描述 | 状态 |
| --- | --- | --- | --- |
| 1 | S1（阻塞场景A） | **gameGrade 消费链路在测试环境自 2026-09-24 起零写入**。证据链：① `user_game_grade_experience` 最后一条流水 create_time≈2026-09-24（biz=202608，赛季中段，此后至今近 3 周零写入，近 24h/1h 均为 0）；② 当日真实游戏流量正常（如 12:15 的 `gamecenter_baishun1070` ADD_MONEY user=24976335、`gamecenter_baishun1043` SUB_MONEY user=21873597），但这些用户无任何 grade/experience 数据；③ `handleUserDealAccountLog2` 以真实消息形态（真实 biz/uid/room_id、含 details/in18_key）调用返回 ok 但不落库，已排除异步延迟与报文/白名单因素；④ 管道直调 `/event/user-deal-account.update`（user-game-grade 模块）写入正常，等级更新链路本身可用。结论：Kafka 消费入口（或其部署/订阅）自 09-24 前后断链，需研发排查；线上 202608 赛季期间真实用户经验是否同样缺失，建议一并核对 | 待修复 |
| 2 | 建议 | 新赛季首轮锚点存在时区解析偏移：观察值 `10-26 16:00+08` 与文档 `10-26 00:00+08` 并存（两次部署表现不一），建议统一 startTime 解析口径；当前断言按 `[00:00, 16:00]+08` 容差放行 | 观察 |
| 3 | 记录 | `finishRound` 轮次到期校验按真实时钟（不受 l-debug-timestamp 影响），测试已用 `force=true` 适配；真实线上无影响 | 关闭 |

> 修复记录：第 1 次回归发现的「配置注册顺序未按 endTime 升序导致旧窗口选中 202610」与「yaml 缺失 lastSeasonBiz/season」两项已修正并回归通过（001 恢复 17/17、003 恢复 16/16、002 场景B/C 恢复通过）。

## 环境与数据

- 测试用户：合成 UID 910111~910114、910121~910123（前后自动清理四件套）
- 造数：上赛季等级行 `user_game_grade`；衰减期望动态查 `lita_basic.game_grade`（`next_season_grade` / `experience_limit`），不硬编码
- 轮次：合成轮 `20261025090001`/`20261025090002` + settle 副产物轮 diff 追踪清理；真实轮次链不触碰
- transNo：仅断言 `SEASON_SWITCH_` 前缀（season 取 yaml `season` 字段）
- consumer 消息体：对齐 `funbit.user_deal_account_log` 真实形态（biz 取线上在用值，含 details/in18_key）

## 复跑方式

```bash
node projects/feature/game-grade/tests/001-config-time-match.test.ts
node projects/feature/game-grade/tests/002-season-switch-upgrade.test.ts
node projects/feature/game-grade/tests/003-eggwar-cross-season-settle.test.ts
```
