# RUNS — 拍拍模式流水-房间维度

| 时间 | 脚本 | 命令（凭证运行时注入，不落盘） | 结果 | 证据 |
|:---|:---|:---|:---|:---|
| 2026-11-11 17:44:34 | tc-auth-reg.test.ts | `ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-auth-reg.test.ts` | 4/6 check 通过；TC-REG-01-①、TC-REG-02-② 未通过（未执行查询导致表头未渲染） | `evidence/auction-room-summary-auth-reg-20261111-174434/` |
| 2026-11-11 17:45:45 | tc-auth-reg.test.ts | 同上（修正：补充日期与查询步骤） | 4/6 通过；TC-REG-01-①、TC-REG-02-② 仍未通过：必填「数据维度」未选/日期提交后未触发 `/stats/query`；两次查询等待超时 | `evidence/auction-room-summary-auth-reg-20261111-174545/` |

## 结论口径
- TC-AUTH-02 / TC-AUTH-03（P1）单独运行稳定通过（菜单 390 项无目标项；直达路由 `#/404` 且无表格）。
- TC-REG-01 / TC-REG-02 仅完成“页面可打开 + 筛选项”部分的观察；查询未触发，表头核验未完成，按阻塞记录，不计入通过。
- 报表页全部 P0 用例因账号无 `auction-mode-room-summary` 权限无法执行。

## 环境备注
- `m-api.test.lita.game` 直连 403，脚本按同源入口转发（未改业务参数）。
- 2026-11-11 17:50~18:00 期间 data-main 配置加载间歇失败：同一路由多次访问中，`.query-field` 时而渲染、时而显示「当前报表未配置查询条件」。该现象影响回归用例复现，未作为产品缺陷判定依据。

## 第二轮（admin 账号，2026-11-11 18:02~18:10）

| 时间 | 脚本 | 结果 | 证据 |
|:---|:---|:---|:---|
| 18:02:47 | tc-p0-report.test.ts | 6/6 通过（前 6 项），导出下载读取失败 | `evidence/auction-room-summary-p0-20261111-180247/` |
| 18:04:29 | tc-p0-report.test.ts | 9/10 通过；TC-UI-06 文件名含 `+`、TC-FILTER-01 行数断言口径错误 | `evidence/auction-room-summary-p0-20261111-180429/` |
| 18:08:20 | tc-p0-report.test.ts | 9/10 通过；TC-UI-06 未通过（文件名 `拍拍模式流水+-+房间维度_94879002.xlsx`，缺陷 #309） | `evidence/auction-room-summary-p0-20261111-180820/` |

- 稳定通过：AUTH-01、UI-01、UI-02、UI-03（行数+合计）、UI-07、FILTER-01（Total=30）、FILTER-02（2 行）、FILTER-03（1 行指标）。
- 未通过：UI-06 文件名空格被编码为 `+`（内容 18×12 与合计一致）。
- 未执行：UI-04、UI-05、FILTER-04、REG-01/02、EDGE-01/02（20 分钟目标内优先 P0）。
