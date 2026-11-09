# RUNS — 运行记录（项目 146 / 提测 44）

执行环境：`https://admin.test.lita.game/`（测试环境）；后端同源入口 `https://funbit-mgr.test.cinta.team`；账号 qa-ai（密码仅运行时注入，未落盘）。

## 1. 本轮部署核查（TK-0128 缺陷修复回归，正式执行前）

| 项 | 实测值 | 说明 |
| --- | --- | --- |
| 前端入口 JS | `static/index-747ac2bd.js` | 2026-11-09 19:11 CST 采集；与修复任务声明的 dev `14feaeac` 构建一致 |
| 入口 HTML Last-Modified | `Mon, 09 Nov 2026 11:04:36 GMT`（北京时间 2026-11-09 19:04:36） | 不早于修复部署时间，匹配任务要求 |
| 前端修复证据（构建内） | `tableHeaderOverrides`（pl_amt→P&L、rtp→RTP、details→Details、dismantle→Dismantle、top_spending_room→Top Spending Room）、`tableColumnFormatters`（pl_amt→thousands）、`queryFieldOverrides.user_id.positiveInteger=true` 且 `validationMessage="请输入正确的用户ID"` | 覆盖 #235 / #240 / #239 的修复点 |
| 后端配置 `game-spin-draw-summary` | `status=VALID`、`mode=SQL`、`database=selectdb`、`updateTime=1794220980796`（2026-11-09 18:43:00 CST）、SQL SHA-256 `755b0a99…66d368`、`money_format` 7 处 | 覆盖 #236 / #237 的修复点，配置实时生效 |
| 后端配置 `game-spin-draw-daily` | `status=VALID`、`mode=SQL`、`database=selectdb`、`updateTime=1794220977714`（2026-11-09 18:42:57 CST）、SQL SHA-256 `2c673456…f46e53b`、`money_format` 7 处 | 覆盖 #236 / #238 的修复点，配置实时生效 |
| 页面路由 | `#/data-stats-manager/user-consumption/game-spin-draw-summary` / `.../game-spin-draw-daily` | 两页均可访问，菜单/面包屑/标题正常 |
| 后端探针 | `GET /admin/init`（同源入口）→ HTTP 200；登录 → `status=0` | 同源测试入口可用 |

结论：前端与后端修复均已部署到目标测试环境，未发现版本阻塞。

## 2. 本轮正式执行（TK-0128，2026-11-09，提测 44）

| 序 | 脚本 | 开始（北京时间） | 检查点 | 通过 | 未通过 | 结论 | 运行日志 | 证据目录（本地留存） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `spin-draw-entry.test.ts` | 19:15:47 | 18 | 18 | 0 | 成功 | `/home/ecs-user/work/tk0128/logs/spin-draw-entry.log` | `/home/ecs-user/work/tk0128/evidence/spin-draw-entry/` |
| 2 | `spin-draw-validation.test.ts` | 19:16:00 | 48 | 48 | 0 | 成功（#11～#18 全部通过） | `/home/ecs-user/work/tk0128/logs/spin-draw-validation.log` | `/home/ecs-user/work/tk0128/evidence/spin-draw-validation/` |
| 3 | `spin-draw-daily.test.ts` | 19:17:40 | 44 | 44 | 0 | 成功（#20/#25/#27/#28/#30/#32/#47 全部通过） | `/home/ecs-user/work/tk0128/logs/spin-draw-daily.log` | `/home/ecs-user/work/tk0128/evidence/spin-draw-daily/` |
| 4 | `spin-draw-reset-loading-pagination.test.ts` | 19:18:06 | 23 | 23 | 0 | 成功 | `/home/ecs-user/work/tk0128/logs/spin-draw-reset-loading-pagination.log` | `/home/ecs-user/work/tk0128/evidence/spin-draw-reset-loading-pagination/` |
| 5 | `spin-draw-summary.test.ts` | 19:18:44 | 40 | 40 | 0 | 成功（#19/#21/#23/#24/#29/#31/#33/#35/#46 全部通过） | `/home/ecs-user/work/tk0128/logs/spin-draw-summary-r2.log` | `/home/ecs-user/work/tk0128/evidence/spin-draw-summary-r2/` |

汇总：检查点 173 个，通过 173 / 未通过 0；用例 47 条，通过 47 / 未通过 0 / 阻塞 0 / 未执行 0。
无基础设施中断，无 FLAKY，无重试到通过。

## 3. 本轮脚本类修正（非产品缺陷）

| 问题 | 发现 | 处理 | 影响面 | 证据 |
| --- | --- | --- | --- | --- |
| 同源转发保留 `Host: m-api.test.lita.game` 时，测试网关返回占位响应（`HTTP 200 "oh ~~"`），登录接口不可达 | 19:13 首次运行 entry 脚本时登录等待超时；直连探测确认网关行为变化 | `tests/lib/admin-base.ts` 转发时移除 Host 头，由目标入口 `funbit-mgr` 填充；业务 URL/参数/响应体不变（R1 例外仍成立）；README 同步更新 | 仅网络层，不影响任何断言与期望 | 失败探测：`/home/ecs-user/work/tk0128/logs/spin-draw-entry.log`（首次）；修正后 entry 22/22 |
| #46-② 将 Dismantle 单元格整体（含占比 `（67.95%）`）与金额 `317,189` 比较，导致误报失败 | 19:18 summary 首次正式运行 1 个 check 失败 | 仅取单元格金额部分比较（`^(-?[\d,]+)`），占比仍由 #46-③ 校验；未改期望金额、未放宽断言、未改用例 | 仅 #46-② check 实现 | 修正前日志：`/home/ecs-user/work/tk0128/logs/spin-draw-summary.pre-fix.log`；失败截图：`evidence/spin-draw-summary-pre-fix/`；修正后 53/53（40 check + 13 act） |

> 说明：上述两项均为脚本/环境适配问题，未据此创建产品缺陷；原始失败证据按要求保留，未用成功证据覆盖。

## 4. 本轮红证抽查（P0）

- 对象：P0 用例 #46-②「Multiplier 与 Dismantle 金额均带千分位」（本轮修正后的 check）。
- 操作：临时将期望值 `Dismantle=317,189` 改为 `Dismantle=317,190`，运行 `spin-draw-summary.test.ts`；对应 check 输出 `expect=...317,190 / real=...317,189 / status=fail`，失败数 1。
- 恢复：从备份恢复测试文件，`sha256sum -c` 校验通过（`d3e4128c...b25e23`），恢复后的代码即正式执行版本。
- 记录：`/home/ecs-user/work/tk0128/logs/redproof.log`。
- 结论：断言非永真，红证抽查通过。

## 5. 历史轮次（TK-0115 首次执行，2026-11-09 18:19～18:22）

| 序 | 脚本 | 检查点 | 通过 | 未通过 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | `spin-draw-entry.test.ts` | 18 | 18 | 0 | 成功 |
| 2 | `spin-draw-validation.test.ts` | 48 | 24 | 24 | 失败（#11～#18） |
| 3 | `spin-draw-summary.test.ts` | 40 | 15 | 25 | 失败（#19/#21/#23/#24/#29/#31/#33/#35/#46） |
| 4 | `spin-draw-daily.test.ts` | 44 | 31 | 13 | 失败（#20/#25/#27/#28/#30/#32/#47） |
| 5 | `spin-draw-reset-loading-pagination.test.ts` | 23 | 23 | 0 | 成功 |

历史汇总：检查点 173 个，通过 111 / 未通过 62；用例 47 条，通过 23 / 未通过 24；6 个缺陷 #235～#240 开放。详见 TK-0115 TEST_REPORT / EVIDENCE / COVERAGE。
