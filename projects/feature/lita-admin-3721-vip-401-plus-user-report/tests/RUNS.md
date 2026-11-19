# RUNS — 项目3721「>=401用户数据」

> 环境：https://admin.test.lita.game（非生产）｜账号 qa-ai / qa-noauth（运行时注入）
> 前端入口 `static/index-b99157df.js`，HTML Last-Modified `2026-11-18 07:23:05 GMT`
> 数据：只读存量；不造数、无清理；报表数据源 T+1（执行日 2026-11-19，Total 19750）。

## 1. 自测阶段（2026-11-19 11:39 ~ 11:48）

| 脚本 | 用例# | check | 自测结果 | 脚本类修正 |
| --- | --- | --- | --- | --- |
| `tc01-entry.test.ts` | 1/2/3 | 11 | 11/11 通过 | 菜单跳转后等待 URL 变化，避免读到旧路由 |
| `tc02-filter.test.ts` | 4/5/6/7/8/9/13 | 49 | 47 通过 / 2 失败（用例7英语区数据限制、用例8窗口越界） | 无（失败为真实结果） |
| `tc03-validation.test.ts` | 10/11/12 | 22 | 22/22 通过 | 无 |
| `tc04-fields.test.ts` | 14/15/16/17/18/19/20 | 19 | 17 通过 / 2 失败（用例15大小写、用例20更新时间） | 重置改为等待自动查询完成提示（先「已重置查询条件」再「查询完成」） |
| `tc05-pagination.test.ts` | 21/22/23/24/25/26 | 16 | 14 通过 / 2 失败（用例21排序、用例24分页选项） | 无 |
| `tc06-export.test.ts` | 27/28/29 | 5 | 3 通过 / 2 失败（用例27文件名、用例28空值） | 无 |
| `tc07-regression.test.ts` | 32/33/34 | 7 | 7/7 通过 | 无 |
| `tc08-noauth.test.ts` | 30/31 | 5 | 5/5 通过 | 无 |

- 自测修复仅涉及定位/等待/命名冲突（`total` 字段与方法冲突、重置提示捕获、菜单跳转等待），未修改任何断言期望值。
- 环境事件：11:34~11:36 `funbit-mgr /admin/init|login` 短暂 503，按基础设施失败处理；11:36 恢复后重跑，未计入用例失败。

## 2. 红证抽查（自测阶段）

- 抽查用例：#1（P0）③ 浏览器标签标题。
- 方法：临时脚本 `_redproof.test.ts` 将期望改为 `>=401用户数据 - Lita Admin_REDPROOF`，其余动作与正式脚本一致。
- 结果：对应 check **失败** — `expect=>=401用户数据 - Lita Admin_REDPROOF, real=>=401用户数据 - Lita Admin`，证明断言非永真。
- 恢复：删除临时脚本；正式 `tc01-entry.test.ts` 以正确期望运行 11/11 通过。
- 证据：`evidence/redproof/redproof.log`（公开地址见 EVIDENCE E-25）。

## 3. 正式执行（2026-11-19 11:49:10 ~ 11:55:56）

| 轮次 | 脚本 | 用例# | check | 结果 | 耗时 | 证据目录 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | `tc01-entry.test.ts` | 1/2/3 | 11 | 11/11 通过 | 2.6s | `evidence/formal/tc01-entry` |
| F2 | `tc02-filter.test.ts` | 4/5/6/7/8/9/13 | 49 | 47 通过 / 2 失败 | 162.0s | `evidence/formal/tc02-filter` |
| F3 | `tc03-validation.test.ts` | 10/11/12 | 22 | 22/22 通过 | 114.5s | `evidence/formal/tc03-validation` |
| F4 | `tc04-fields.test.ts` | 14/15/16/17/18/19/20 | 19 | 17 通过 / 2 失败 | 55.8s | `evidence/formal/tc04-fields` |
| F5 | `tc05-pagination.test.ts` | 21/22/23/24/25/26 | 16 | 14 通过 / 2 失败 | 40.4s | `evidence/formal/tc05-pagination` |
| F6 | `tc06-export.test.ts` | 27/28/29 | 5 | 3 通过 / 2 失败 | 14.6s | `evidence/formal/tc06-export` |
| F7 | `tc07-regression.test.ts` | 32/33/34 | 7 | 7/7 通过 | 6.9s | `evidence/formal/tc07-regression` |
| F8 | `tc08-noauth.test.ts` | 30/31 | 5 | 5/5 通过 | 1.3s | `evidence/formal/tc08-noauth` |

- 合计 134 个 check：通过 126 / 未通过 7 / 阻塞 1（用例#7 英语区数据限制）。
- 正式轮无断言失败后重试、无 FLAKY。
- 失败均保留失败截图与 run.json 请求留痕；未用重跑覆盖首次失败证据。

## 4. 运行命令

```bash
cd projects/feature/lita-admin-3721-vip-401-plus-user-report/tests
ADMIN_USERNAME=… ADMIN_PASSWORD=… TMPDIR=<非/tmp可写目录> \
  node tc01-entry.test.ts --evidence-dir=./evidence/tc01
# 其余脚本同上（tc02/tc03/tc04/tc05/tc06/tc07/tc08）
```

- 凭证仅运行时环境变量注入，不写入代码/日志/证据。
- 导出文件仅保存在执行机 evidence 目录；本任务无需清理业务数据。

## 5. 回归轮（2026-11-19 12:06 / 12:10）

| 缺陷 | 修复/部署 | 回归脚本 | 回归结果 | 证据 |
| --- | --- | --- | --- | --- |
| #361 排序第三级 User ID 未升序 | data-main 2026-11-19 12:01 部署（ORDER BY vip_level DESC, last_login_date DESC, user_id ASC） | `tc05-pagination.test.ts` | 用例#21③ 通过；其余 15 个 check 通过；仅 #24① 仍失败（#358 未修复） | `evidence/verify/tc05-pagination`；日志已上传 E-27 |
| #363 导出空值空白 | data-main test d10839d，2026-11-19 12:05 生效 | `tc06-export.test.ts` | 用例#28② 通过（空白 0 个，「-」357302 个）；#27② 仍失败（#362 未修复）；#29 通过 | `evidence/regress-363/tc06`；日志/文件已上传 E-27 |

- 回归结论：#361、#363 回归通过并已关闭（验证人：技术-测试-Admin 用例执行；环境：Admin 测试环境；时间：2026-11-19 12:06/12:10）。
- 回归未改变首次失败证据；正式轮结果仍按 26/7/1 记录，最终用例状态按回归后 28/5/1 统计。
- R9 合规修正：正式执行后移除 3 处非断言的固定等待（`waitForTimeout`），并对受影响脚本 tc03/tc05/tc08 复跑：tc03 22/22、tc08 5/5 通过；tc05 仅 #24 失败（#21 已因修复通过）。
