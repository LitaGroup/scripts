# 测试用例说明（项目139）

## 公共能力（lib/admin-base.ts）

- 真实登录：`ADMIN_USERNAME` / `ADMIN_PASSWORD` 运行时注入，AccessToken 来自本次登录响应或 Cookie；
- 请求转发：浏览器层将 `m-api.test.lita.game` 改写为 `funbit-mgr.test.cinta.team`（WAF 403 规避，业务参数不变）；
- 留痕：每个 act 关键步骤截图；页面接口、脚本直连接口、只读 SQL 写入 `run.json`；token/密码脱敏；
- 只读 DB：`dbQuery(sql, database)` 经测试环境 `admin-ai` 查询网关，仅 SELECT。

## 脚本

| 脚本 | 覆盖 | 关键断言 |
|:---|:---|:---|
| `broad-config-batch-delete.test.ts` | 广播召人配置批量删除全链路 + 单条新增/编辑/删除 + Excel 导入 | 未勾选禁用、确认条数、取消不删除、成功文案“成功删除2条数据”、刷新与勾选清空、未勾选行保留、末页回退、导入成功 |
| `anchor-certification-batch-delete.test.ts` | 主播认证标识配置批量删除全链路 + 审计日志 + 单条编辑/删除 + 导出 | 多 uid 新增、确认条数、取消、成功文案、未勾选行保留、`anchor_certification_log` DELETE + operator=admin、重复/不存在 ID 文案、导出表头、末页回退 |
| `withdraw-become-player-time.test.ts` | 提现列表新列展示、格式、空值、接口/DB 一致性、分页/筛选、批量审核入口 | 新列紧跟“上次提现时间”、`yyyy-MM-dd HH:mm:ss`、空值 `-`、页面=接口=DB、翻页/筛选、批量按钮勾选前后禁用态 |
| `withdraw-export.test.ts` | 页面【导出结果】真实下载并解析 Excel | 无筛选保护、日期区间 `yyyy-MM-dd` 导出成功、50 列、索引 44=成为陪玩师时间、43/45 相邻列不变、抽样值与接口一致 |
| `broad-batch-delete-api.test.ts` | 广播召人批量删除接口契约 | 空 body/空数组报错、正常删除文案、重复 ID 去重、不存在 ID 忽略、DB 记录删除 |

## 运行顺序建议

1. `broad-config-batch-delete.test.ts`
2. `anchor-certification-batch-delete.test.ts`
3. `withdraw-become-player-time.test.ts`
4. `withdraw-export.test.ts`
5. `broad-batch-delete-api.test.ts`

各脚本可独立运行；测试数据在脚本 `finally` 中清理。

## 注意事项

- 主播认证“末页回退”用例会新增 11 条“银色主播-普通”测试认证；当前环境该认证类型无存量数据，过滤后仅测试数据，删除后清理。
- 广播召人末页回退需要页容量 2：脚本通过 Vue 组件状态设置 `pageSize=2` 构造末页（页面默认 100），数据全部为本次新增的英语区测试配置。
- 提现批量审核仅验证入口/禁用态，不执行审核；避免修改真实提现业务数据。
- 账号、密码、token、会话数据不得写入脚本、日志、报告或证据。
