# 水果机数据查询测试脚本说明

本目录为项目 146「飞书预警+admin后台增加水果机数据」的两页 Admin UI 测试脚本，对应 TK-0112 的 47 条用例（P0 28 / P1 19）。

## 文件用途

| 文件 | 覆盖用例 | 说明 |
| --- | --- | --- |
| `spin-draw-entry.test.ts` | #1、#2、#41、#42 | 左侧菜单进入汇总/按日页、路由/面包屑/标题/查询区；两页首次进入空态 |
| `spin-draw-validation.test.ts` | #3～#18 | 三项必填缺失/全空 Toast 与结果区无副作用；用户ID 字母/小数/负数/0 的阻断提示 |
| `spin-draw-summary.test.ts` | #19、#21～#24、#29、#31、#33、#35、#46 | 汇总页单日/跨日/跨月、P&L/RTP/Details/Dismantle、房间排序与截断、跨页一致性、空数据、数字格式 |
| `spin-draw-daily.test.ts` | #20、#25～#28、#30、#32、#34、#36、#47 | 按日页逐日行数/日期、各指标、房间、跨页一致性、空数据、数字格式 |
| `spin-draw-reset-loading-pagination.test.ts` | #37～#40、#43～#45 | 重置、加载遮罩出现/消失、25 条分页、20/10 per page、Go to 跳页 |
| `lib/admin-base.ts` | — | 基类：真实登录、WAF 同源转发、查询等待、表格/分页/Toast 读取、截图与请求留痕 |
| `lib/page-values.ts` | — | 解析页面 Details/Room 文本、金额与比例；不访问接口/数据库 |

## 运行

```bash
# 仓库根目录
ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-entry.test.ts
```

- 环境变量：`ADMIN_USERNAME`、`ADMIN_PASSWORD`（必填，运行时注入）；`SCRIPT_UI_BASE`、`SCRIPT_ADMIN_HOST` 可选覆盖。
- 输出：stdout 逐行 `[log]/[act]/[check]/[done]` 协议；每个 check 标题带 `用例#N-检查点`。
- 证据：默认写入仓库根 `evidence/<slug>-<时间戳>/`（截图 + run.json），已 gitignore；可用 `--evidence-dir=` 覆盖。

## 数据与等待

- 数据只读，样本 UID：17612704（常规）、11925763（12 房间）、15164495（25 日分页）、17612690（无数据）；不造数、不写库。
- 参数化用例 #19/#20/#35/#36 的每个数据行使用独立浏览器会话（重新登录 + 新上下文）。
- 报表查询等待查询响应 + 加载遮罩消失 + 结果表/空态渲染；不使用固定长 sleep。
- 验证点全部读取页面内容；接口响应只用于等待与 run.json 留痕，不作为断言依据。

## 已知环境处理

- `/admin/*`、`/api/admin/*` 从 `m-api.test.lita.game` 原样转发到 `funbit-mgr.test.cinta.team`（WAF 403 的 R1 例外；转发时移除 Host 头，由目标入口填充，2026-11-09 回归时网关按目标入口 Host 路由）；`/data-main/*` 直连。
- 登录密码、token 不写入脚本/日志/证据。

## 结果口径

- 通过：全部检查点满足；未通过：任一检查点不满足且归因产品缺陷；阻塞/未执行：外部原因或明确排除。
- 本轮正式结果与证据索引见项目根 `COVERAGE.md`、`RUNS.md` 与任务文档 `TEST_REPORT.md`、`EVIDENCE.md`。
