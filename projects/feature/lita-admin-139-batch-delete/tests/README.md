# 测试用例说明（项目139）

## TK-0092 主交付脚本

| 脚本 | 覆盖 | 说明 |
|:---|:---|:---|
| `broad-config-47cases.test.ts` | 广播召人 #1～#11 + N-A3-API/N-A5-EMPTY | 47 条标准用例中的广播模块；数据池 6666/12001/10000，逐用例预检/造数/清理 |
| `anchor-certification-47cases.test.ts` | 主播认证 #12～#20 + N-B3-LOG/N-B5-EMPTY | 双会话、审计日志、多 uid 新增、编辑、导出；uid 池 19440456/19526094/1789 |
| `withdraw-become-player-time-47cases.test.ts` | 提现 #21～#47 | 只读提现数据 + 页面导出 xlsx 解析；不实际审核/打款 |
| `non-ui-verification.test.ts` | N-D1/D2-FE/D2-BE/D3 | 汇总前三个脚本 run.json，console/HTTP 观测与版本/环境核验 |

以上脚本均为 `node xxx.test.ts` 直跑，check 标题带 `用例#N-①` 标记；COVERAGE.md 双向核对。凭证仅运行时注入。

## 公共能力（lib/admin-base.ts）

- 真实登录：`ADMIN_USERNAME` / `ADMIN_PASSWORD` 运行时注入，AccessToken 来自本次登录响应或 Cookie；
- 请求转发：浏览器层将 `m-api.test.lita.game` 改写为 `funbit-mgr.test.cinta.team`（WAF 403 规避，业务参数不变）；
- 留痕：每个 act 关键步骤截图；页面接口、脚本直连接口、只读 SQL 写入 `run.json`；token/密码脱敏；
- 只读 DB：`dbQuery(sql, database)` 经测试环境 `admin-ai` 查询网关，仅 SELECT。

## 脚本

| 脚本 | 覆盖 | 关键断言 |
|:---|:---|:---|
| `broad-config-batch-delete.test.ts` | 广播召人配置批量删除全链路 + 单条新增/编辑/删除 + Excel 导入 | 未勾选禁用、确认条数、取消不删除、成功文案“成功删除2条数据”、刷新与勾选清空、未勾选行保留、末页删空成功回第 1 页并保留英语区筛选/每页条数、导入成功 |
| `anchor-certification-batch-delete.test.ts` | 主播认证标识配置批量删除全链路 + 审计日志 + 单条编辑/删除 + 导出 | 多 uid 新增、确认条数、取消、成功文案、未勾选行保留、`anchor_certification_log` DELETE + operator=admin、重复/不存在 ID 文案、导出表头、末页删空成功回第 1 页并保留认证类型筛选/每页条数 |
| `pagination-rules.test.ts` | 提测36 通用分页规则（广播召人 + 主播认证） | 普通翻页不变、Search/Reset/改条数回第 1 页、取消/失败停留原页且勾选保留、失败仅提示一次、删除后刷新未返回时切页/切筛选旧响应不覆盖、#223 超末页、无结果查询保留每页条数 |
| `withdraw-become-player-time.test.ts` | 提现列表新列展示、格式、空值、接口/DB 一致性、分页/筛选、批量审核入口 | 新列紧跟“上次提现时间”、`yyyy-MM-dd HH:mm:ss`、空值 `-`、页面=接口=DB、翻页/筛选、批量按钮勾选前后禁用态 |
| `withdraw-export.test.ts` | 页面【导出结果】真实下载并解析 Excel | 无筛选保护、日期区间 `yyyy-MM-dd` 导出成功、50 列、索引 44=成为陪玩师时间、43/45 相邻列不变、抽样值与接口一致 |
| `broad-batch-delete-api.test.ts` | 广播召人批量删除接口契约 | 空 body/空数组报错、正常删除文案、重复 ID 去重、不存在 ID 忽略、DB 记录删除 |

## 运行顺序建议

1. `broad-config-batch-delete.test.ts`
2. `anchor-certification-batch-delete.test.ts`
3. `pagination-rules.test.ts`
4. `withdraw-become-player-time.test.ts`
5. `withdraw-export.test.ts`
6. `broad-batch-delete-api.test.ts`

各脚本可独立运行；测试数据在脚本 `finally` 中清理。

## 注意事项

- 主播认证“末页删空”用例会新增 11 条“银色主播-普通”测试认证；当前环境该认证类型无存量数据，过滤后仅测试数据，删除后清理。
- 广播召人英语区仅 3 个测试房间；末页/旧响应用例通过 Vue 组件状态设置 2 条/页或 1 条/页构造分页（数据全部为本次新增的英语区测试配置）。
- `pagination-rules.test.ts` 的“无结果查询保留每页条数”用例在缺陷 #228 修复前会失败；该用例同时断言接口回显 `rows` 与页面每页条数不漂移。
- 失败提示用例通过 Playwright 路由拦截返回 HTTP 500，不触达后端，不修改数据。
- 提现批量审核仅验证入口/禁用态，不执行审核；避免修改真实提现业务数据。
- 账号、密码、token、会话数据不得写入脚本、日志、报告或证据。
