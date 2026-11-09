# RUNS — 运行记录（项目 146 / 提测 44）

执行环境：`https://admin.test.lita.game/`（测试环境）；后端同源入口 `https://funbit-mgr.test.cinta.team`；账号 qa-ai（密码仅运行时注入，未落盘）。

## 1. 部署核查（正式执行前）

| 项 | 实测值 | 说明 |
| --- | --- | --- |
| 前端入口 JS | `static/index-92003405.js` | 2026-11-09 18:22 采集 |
| 入口 HTML Last-Modified | `Mon, 09 Nov 2026 07:12:57 GMT`（北京时间 2026-11-09 15:12:57） | 早于提测时间 15:15，构建时间与提测窗口一致 |
| 后端探针 | `POST /api/admin/privilege`（Host: m-api.test.lita.game）→ HTTP 200 | 同源测试入口可用 |
| 页面路由 | `#/data-stats-manager/user-consumption/game-spin-draw-summary` / `.../game-spin-draw-daily` | 两页均可访问，菜单/面包屑/标题正常 |

结论：测试环境部署可用，未发现版本阻塞。

## 2. 正式执行（2026-11-09，提测 44 = 进行中）

| 序 | 脚本 | 开始（北京时间） | 检查点 | 通过 | 未通过 | 结论 | 运行日志 | 证据目录（仓库根 evidence/） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `spin-draw-entry.test.ts` | 18:19:32 | 18 | 18 | 0 | 成功 | `/home/ecs-user/logs/tk115/formal/entry.log` | `spin-draw-entry-20261109-181932` |
| 2 | `spin-draw-validation.test.ts` | 18:19:42 | 48 | 24 | 24 | 失败（用例 #11～#18） | `/home/ecs-user/logs/tk115/formal/validation.log` | `spin-draw-validation-20261109-181941` |
| 3 | `spin-draw-summary.test.ts` | 18:20:25 | 40 | 15 | 25 | 失败（#19/#21/#23/#24/#29/#31/#33/#35/#46） | `/home/ecs-user/logs/tk115/formal/summary.log` | `spin-draw-summary-20261109-182025` |
| 4 | `spin-draw-daily.test.ts` | 18:20:47 | 44 | 31 | 13 | 失败（#20/#25/#27/#28/#30/#32/#47） | `/home/ecs-user/logs/tk115/formal/daily.log` | `spin-draw-daily-20261109-182047` |
| 5 | `spin-draw-reset-loading-pagination.test.ts` | 18:21:09 | 23 | 23 | 0 | 成功 | `/home/ecs-user/logs/tk115/formal/reset-loading-pagination.log` | `spin-draw-reset-loading-pagination-20261109-182109` |

汇总：检查点 173 个，通过 111 / 未通过 62；用例 47 条，通过 23 / 未通过 24 / 阻塞 0 / 未执行 0。
无基础设施中断，无 FLAKY，无重跑。

## 3. 自测记录（正式执行前）

| 时间 | 脚本 | 结果 | 说明 |
| --- | --- | --- | --- |
| 18:06 | entry | 22/22（18 check + 4 act） | 菜单导航等待修正后通过 |
| 18:08 | validation | 40/64 | 8 条非法 UID 用例按预期失败 |
| 18:10 | summary | 28/53 | 展示格式类失败 |
| 18:12 | daily | 44/57 | claim 后修正空表等待与 Dismantle 解析 |
| 18:16 | reset-loading-pagination | 30/30 | 分页用例改为独立会话后通过 |

自测阶段仅修正脚本类问题（菜单展开等待、空表表头等待、独立会话隔离、文本解析、waitForFunction 参数）；未修改断言期望值，未 mock 任何业务接口。

## 4. 红证抽查（P0）

- 对象：用例 #26-②「RTP 显示 90.57%」。
- 操作：临时将期望值改为 `90.58%`，运行 `spin-draw-daily.test.ts`；对应 check 输出 `expect=90.58% / real=90.57% / status=fail`，失败数由 13 → 14。
- 恢复：将期望值恢复为 `90.57%` 后重新运行，失败数恢复 13；恢复后的代码为交付版本。
- 记录文件：`/home/ecs-user/logs/red-proof.log`（自测环境本地留存）。

## 5. 失败归因摘要

| 缺陷 | 现象 | 对应用例 | 归因 |
| --- | --- | --- | --- |
| #235 | 表头显示内部字段名而非需求英文标题 | #19、#20 | 前端展示/报表配置 |
| #240 | P&L 金额未带千分位 | #19、#21、#25、#33、#46 | 前端数值格式 |
| #236 | Details/Dismantle/Top Spending Room 文本金额未带千分位 | #23、#24、#27、#28、#29、#30、#31、#32、#33、#46、#47 | 后端返回文本格式 |
| #237 | 无数据时金额类字段返回 null 并显示 `-` | #35 | 后端查询结果 |
| #238 | Multiplier 比例 `80.9%` 未保留两位小数 | #47 | 后端返回文本格式 |
| #239 | 非法用户ID未阻断、无「请输入正确的用户ID」 | #11～#18 | 前端校验 |

环境/脚本/数据/用例归因失败：0。
