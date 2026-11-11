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
