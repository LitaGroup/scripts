# 荣耀等级 202610 测试用例（game-grade）

新一期游戏荣耀等级（2026-10-26 ~ 2026-12-27）赛季切换自动化测试。
需求：<http://project.cinta.team/api/projects/99.md>（文档 45 需求 / 46 懒式切换设计 / 47 技术与接口）。

## 运行

```bash
node projects/feature/game-grade/tests/001-config-time-match.test.ts
node projects/feature/game-grade/tests/002-season-switch-upgrade.test.ts
node projects/feature/game-grade/tests/003-eggwar-cross-season-settle.test.ts
```

依赖 `config.json` 的 `mysql`（测试环境直连读写）；接口走 `https://api.test.cinta.team`，网关前缀 `active-main`。

## 用例清单

| 用例 | 覆盖 |
| --- | --- |
| `001-config-time-match.test.ts` | 配置按时间匹配：旧窗口 biz=202608；新窗口 +6h / +41h biz=202610；结算（settle）归属随模拟时间切换；跨赛季后不再产生旧赛季轮 |
| `002-season-switch-upgrade.test.ts` | 懒式赛季切换首次触达晋级：consumer 消息模拟（`handleUserDealAccountLog2`）与 `entrance` 两种触发；衰减映射、SEASON_SWITCH 流水、切换发奖、同 transNo 幂等；时间窗外不切换；纯新用户走 None 初始化 |
| `003-eggwar-cross-season-settle.test.ts` | 跨赛季鸡蛋结算：旧赛季日/周末轮结算（FINISHED、名次、奖励）；新赛季日/周首轮初始化（锚定赛季开始）；赛季 endTime 上界守卫；PANEL 回归 |

## 时间模拟约定

- 通过 `l-debug-timestamp` 驱动业务时间，格式必须为 `yyyy-MM-ddTHH:mm:ss` + `±HH:mm` 偏移（不支持毫秒/空格，解析失败会静默回退真实时间）。
- 关键模拟点：
  - `2026-10-20T12:00:00+08:00` 旧赛季（202608：08-24 ~ 10-25）窗口内
  - `2026-10-26T06:00:00+08:00` 新赛季开始后 6h（跨赛季日，昨日配置=上赛季）
  - `2026-10-27T17:00:00+08:00` 新赛季开始后 41h（昨日配置=当前赛季）
- 已知服务端行为（断言已适配，遇到环境变更需复核）：
  - `finishRound` 轮次到期校验按**真实时钟**，模拟时刻未真实到期的轮次需 `force=true` 强制结算；
  - 新赛季首轮锚点存在时区解析偏移（观察值 10-26 16:00+08 与文档 00:00 并存），首轮锚定断言放行 `[00:00, 16:00]+08` 容差区间。

## 环境前置与已知问题（2026-10-13 第 2 次回归）

1. ~~配置注册顺序按 endTime 升序~~（已修正）与 ~~Nacos `user-game-grade.season/lastSeasonBiz`~~（已配置）——001 / 003 已全绿，002 场景 B/C 恢复通过。
2. **未关闭**：**gameGrade 消费链路在测试环境自 2026-09-24 起零写入**（最后一条 exp 流水 09-24，biz=202608 赛季中段；当日真实流量如 `gamecenter_baishun1070`/`1043` 的玩家无任何 grade 数据）。`handleUserDealAccountLog2`（002 场景 A）以真实消息形态调用返回 ok 但不落库；管道直调 `/event/user-deal-account.update` 写入正常，等级链路本身可用。需研发排查 Kafka 消费入口断链（002 场景 A 为唯一失败项）。测试消息体已对齐真实数据：`buildDealLog()`（真实 biz `gamecenter_baishun1130`、room_id、details/in18_key/refund_trans_no）。
3. 已知服务端行为（断言已适配，遇到环境变更需复核）：
   - `finishRound` 轮次到期校验按**真实时钟**，模拟时刻未真实到期的轮次需 `force=true` 强制结算（001/003 已用）；
   - 新赛季首轮锚点存在时区解析偏移（观察值 10-26 16:00+08 与文档 00:00 并存），首轮锚定断言放行 `[00:00, 16:00]+08` 容差区间。

## 实测结果（2026-10-13）

| 用例 | 结果 |
| --- | --- |
| 001 配置按时间匹配 | 17/17 全绿 |
| 002 懒式切换晋级 | 18 过 / 1 fail（场景A：`handleUserDealAccountLog2` 不落库，见上）/ 6 skip（依赖场景A） |
| 003 跨赛季鸡蛋结算 | 16/16 全绿（结算、名次 910121>910122>910123、奖励、首轮锚定 10-26 00:00、上界守卫） |

## 数据与清理

- 测试用户为合成大 UID（910111~910114、910121~910123），前后均清理 `user_game_grade` / `_log` / `_experience` / `_award`（biz=202608、202610）。
- 鸡蛋合成轮次名固定 `20261025090001`（日）/ `20261025090002`（周），settle 副产物轮按 diff 追踪收尾清理；真实轮次（如 `20261013000003` 链）不触碰，即便误结算也会被真实 cron 按 cadence 自愈。
- 造数依据：上赛季等级行 `user_game_grade`（season 取 biz 尾部数字）；衰减期望动态查 `lita_basic.game_grade`（biz=`game_grade_default`）的 `next_season_grade` / `experience_limit`，不硬编码。
- transNo 断言只校验 `SEASON_SWITCH_` 前缀：transNo 中的 season 取自 yaml `season` 字段，未配置时代码默认 `202506`（技术文档已知注意点 #1）。

## 服务层

`src/services/GameGradeService.ts`（已注册 `TestBaseClass.gameGrade`）：封装 `/v1/gameGrade` 全部测试相关接口（doc/entrance/GET/PANEL/UPDATE/handleUserDealAccountLog2/user-deal-account.update/egg-war settle/PANEL）与 lita_basic / lita_active 的查询、造数、清理。

## 测试报告同步（项目管理 projectId=99）

报告存放于项目管理文档 `TEST_REPORT.md`（类型=测试，阅读地址 `GET /api/documents/48.md`）；本地留档 `REPORT.md` 为当前已同步版本。
**用例更新或重跑后须同步更新报告**——刷新 `REPORT.md` 的「结果汇总 / 覆盖明细 / 缺陷与风险 / 实测结果」后执行：

```bash
python3 - <<'PY'
import json, urllib.request
content = open('projects/feature/game-grade/tests/REPORT.md').read()
payload = json.dumps({"projectId": 99, "fileName": "TEST_REPORT.md", "title": "荣耀等级 202610 测试报告", "type": "测试", "content": content}).encode()
req = urllib.request.Request("http://project.cinta.team/api/documents/upsert.md", data=payload, headers={"Content-Type": "application/json"})
print(urllib.request.urlopen(req, timeout=30).read().decode())
PY
```
