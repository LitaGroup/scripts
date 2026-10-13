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
- **consumer 事件时间**：`handleUserDealAccountLog2` 的业务时间取**消息体 `create_time`（事件时间）**，**不认 `l-debug-timestamp`**（实测：改 `create_time` 即改变落库赛季，改请求头无效）。跨赛季用例的消息 `create_time`/`id` 必须设为模拟 epoch，否则按真实时间落入当前（旧）赛季 biz。
- 已知服务端行为（断言已适配，遇到环境变更需复核）：
  - `finishRound` 轮次到期校验按**真实时钟**，模拟时刻未真实到期的轮次需 `force=true` 强制结算；
  - 新赛季首轮锚点：本次回归实测精确锚定 `2026-10-26 00:00:00+08`（旧 GMT-8 误解析到 16:00 的现象未复现），`ANCHOR_TOLERANCE_MS=0`。

## 环境前置与已知问题（2026-10-13 全绿回归）

1. ~~配置注册顺序按 endTime 升序~~ 已修正——001 / 003 多次采样稳定全绿。
2. **consumer 事件时间语义（已适配）**：`handleUserDealAccountLog2`（002 场景 A）的业务时间取**消息体 `create_time`**，**不认 `l-debug-timestamp`**——原用例消息 `create_time=Date.now()`（真实时间，仍在 202608 窗口）→ 写入 `game_grade_202608`、不触发切换，步骤 5 查 202610 自然落空。**已修正**：`buildDealLog()` 增加 `createTimeMs` 参数，`id`/`create_time` 取模拟 epoch（`Date.parse(TS_SWITCH_EARLY)`）。
3. **服务端 per-user 缓存 TTL=10s（已调整）**：服务端对用户赛季状态有缓存（**直连改库/清库不失效**）。TTL 改 10s 后，用例间隔（每跑 >40s）天然超过 TTL，**同一用户可重复跑**；早前 TTL 较长时连续重跑会命中热缓存跳过切换（A/B 失败）。
4. **纯新用户窗口内 GET 会初始化一行 `grade=None/experience=0`**（无 SEASON_SWITCH）。因此 002 场景 C2 断言为「存在 None/0 初始化行 且 SEASON_SWITCH=0」，且 **C2/C3 使用独立的新用户 `USER_FRESH2`（16504）**——因为 C1 的旧窗口 GET 也会把用户初始化到 202608，若 C1/C2 共用同一用户，C2 会变成跨赛季切换（写出 SEASON_SWITCH，断言不成立）。
5. **若干残留会干扰 001**：202610 若有**非锚定的旧日蛋轮**（如 `20261027110000`），步骤 10 的 settle 会因「当期已有轮」不再创建锚定首轮 → 步骤 11/14 失败。复跑前需清理 202610 残留轮次（`mod_eggwar_round`/`mod_eggwar_user_round`）。
6. 已知服务端行为（断言已适配，遇到环境变更需复核）：
   - `finishRound` 轮次到期校验按**真实时钟**，模拟时刻未真实到期的轮次需 `force=true` 强制结算（001/003 已用）；
   - 首轮锚点：001/003 均实测精确锚定 `2026-10-26 00:00:00+08`（旧 GMT-8 误解析到 16:00 的现象已消除，`ANCHOR_TOLERANCE_MS=0`）。

## 实测结果（2026-10-13 全绿）

| 用例 | 结果 |
| --- | --- |
| 001 配置按时间匹配 | **17/17 全绿**（多次采样一致） |
| 002 懒式切换晋级 | **25/25 全绿**（A/B 懒切换、C1 时间窗外、C2 纯新用户 None/0、C3 UPDATE None/10 全部通过；多次采样一致） |
| 003 跨赛季鸡蛋结算 | **16/16 全绿**（多次采样一致）（结算、名次 16521>16519>16518、奖励 6000/3000/1000、首轮精确锚定 10-26 00:00+08、上界守卫） |

## 数据与清理

- 测试用户：**必须使用真实测试用户**（`TEST_USER_POOL`：16525、16524、16523、16522、16521、16519、16518、16504、16501、16500、16499 等 11 个，见 `_lib/constants.ts`）——结算发奖、用户昵称/头像回填等写路径按 user_id 校验用户，合成 UID 会被静默跳过（实测：合成用户结算有名次无奖励明细，真实用户正常发放）。用例前后清理其 game-grade 数据（biz=202608、202610 四件套）。
- 002 用户：`USER_CONSUMER=16525`（consumer）、`USER_ENTRANCE=16524`（entrance）、`USER_FRESH=16523`（C1 时间窗外）、`USER_FRESH2=16504`（C2/C3 纯新用户，须独立）。
- **清理局限**：`cleanUserGradeData` 仅删 lita_basic 四表；服务端 per-user 赛季状态缓存在此范围外（TTL 10s 内重复跑会命中缓存）。
- 鸡蛋合成轮次名固定 `20261025090001`（日）/ `20261025090002`（周），settle 副产物轮按 diff 追踪收尾清理；真实轮次（如 `20261013000003` 链）不触碰，即便误结算也会被真实 cron 按 cadence 自愈。
- 造数依据：上赛季等级行 `user_game_grade`（season 取 biz 尾部数字）；衰减期望动态查 `lita_basic.game_grade`（biz=`game_grade_default`）的 `next_season_grade` / `experience_limit`，不硬编码。
- transNo 断言只校验 `SEASON_SWITCH_` 前缀：transNo 中的 season 取自 yaml `season` 字段。

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
