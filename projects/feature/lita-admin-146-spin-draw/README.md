# Lita Admin — 水果机数据查询（项目 146）

项目 146《飞书预警+admin后台增加水果机数据》的 Admin 端 UI 测试脚本，覆盖「水果机数据-汇总」「水果机数据-按日」两个页面的 47 条既有用例（TK-0112 交付，P0 28 / P1 19）。

- 用例来源：TK-0112 HANDOFF `/task/20261109/TK-0112/HANDOFF`（九列用例，前七列为唯一判定依据）
- 技术方案：`/task/20261109/TK-0112/TECH_DESIGN`（骨架、元素定位、造数方案、引用式断言映射）
- 页面地址：
  - 汇总：`https://admin.test.lita.game/#/data-stats-manager/user-consumption/game-spin-draw-summary`
  - 按日：`https://admin.test.lita.game/#/data-stats-manager/user-consumption/game-spin-draw-daily`
- 执行环境：`https://admin.test.lita.game/`（测试环境，非生产）；后端同源测试入口 `https://funbit-mgr.test.cinta.team`。

## 测试范围

| 场景族 | 覆盖用例 | 脚本 |
| --- | --- | --- |
| 入口（菜单/路由/面包屑/标题/查询区） | #1、#2 | `tests/spin-draw-entry.test.ts` |
| 初始空态 | #41、#42 | `tests/spin-draw-entry.test.ts` |
| 必填校验（缺开始/结束/UID/全空） | #3～#10 | `tests/spin-draw-validation.test.ts` |
| 非法用户ID（abc / 1.5 / -1 / 0） | #11～#18 | `tests/spin-draw-validation.test.ts` |
| 汇总查询、P&L/RTP/Details/Dismantle/房间、空数据、数字格式 | #19、#21～#24、#29、#31、#33、#35、#46 | `tests/spin-draw-summary.test.ts` |
| 按日查询、逐日指标/房间、跨页一致性、空数据、数字格式 | #20、#25～#28、#30、#32、#34、#36、#47 | `tests/spin-draw-daily.test.ts` |
| 重置、加载遮罩、分页（20/10 per page、Go to） | #37～#40、#43～#45 | `tests/spin-draw-reset-loading-pagination.test.ts` |

排除项：导出报表（任务明确不在范围，脚本不点击、不断言）；生产环境；业务代码修改；用例修改。

## 目录结构

```
lita-admin-146-spin-draw/
  README.md
  COVERAGE.md              # 47 条用例 × 173 个检查点的双向核对与结果
  RUNS.md                  # 正式执行/自测运行记录
  tests/
    README.md
    lib/admin-base.ts      # Playwright 基类：真实登录、WAF 同源转发、查询等待、截图与请求留痕
    lib/page-values.ts     # 页面文本解析（Details/Room/金额/比例），仅解析页面显示值
    spin-draw-entry.test.ts
    spin-draw-validation.test.ts
    spin-draw-summary.test.ts
    spin-draw-daily.test.ts
    spin-draw-reset-loading-pagination.test.ts
```

## 依赖

- Node.js >= 24（原生 TypeScript 类型剥离，`node xxx.test.ts` 直接运行，无需编译）
- `playwright`（Chromium，仓库根目录 `npm install`）
- 运行时账号：`ADMIN_USERNAME` / `ADMIN_PASSWORD`（仅环境变量注入，不写入仓库）

## 环境与网络

- 执行机直连 `https://m-api.test.lita.game` 的 `/admin/*`、`/api/admin/*` 被边缘 WAF 403；脚本在浏览器层仅把这两类路径原样转发到同源测试入口 `https://funbit-mgr.test.cinta.team`（转发时移除 Host 头，由目标入口填充；2026-11-09 回归时该网关按目标入口 Host 路由），不改 URL 业务参数、不改请求/响应体（R1 例外）。
- `/data-main/*` 查询接口直连 `m-api.test.lita.game`。
- 报表查询等待绑定查询响应 + `.el-loading-mask` 消失 + 结果表/空态渲染，不使用固定长 sleep。
- 凭证不写入代码、日志、证据；`evidence/run.json` 中 token 已脱敏。

## 运行

```bash
# 在 scripts 仓库根目录执行
ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-entry.test.ts
ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-validation.test.ts
ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-summary.test.ts
ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-daily.test.ts
ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-reset-loading-pagination.test.ts
```

可选参数：`--evidence-dir=/path` 指定证据目录（默认 `evidence/<slug>-<时间戳>/`，已 gitignore）。

## 数据

- 全程只读：不造数、不写库；样本为 BD-01～BD-04 既有数据（UID 17612704 / 11925763 / 15164495 / 17612690）。
- 执行前通过 ODPS 只读查询核对样本日期集合与原始汇总（P&L、lottery_cost、double、lamp、diamond、房间数），仅用于前置就绪与预期计算，不作为 UI 验证点。
- 清理：无写入，无需清理；执行结束关闭浏览器上下文。

## 本轮结果（2026-11-09，提测 #44 缺陷修复回归 / TK-0128）

- 部署核查：前端 `static/index-747ac2bd.js`、HTML Last-Modified 2026-11-09 19:04:36 CST（dev `14feaeac` 构建）；后端两个报表配置 updateTime 18:42:57 / 18:43:00 CST，SQL 含 `money_format` 修复。
- 47 条用例：通过 47 / 未通过 0 / 阻塞 0 / 未执行 0；执行率 100%，通过率 100%。
- 检查点：173 个，通过 173 / 未通过 0；原 24 条未通过用例及其关联用例全部通过。
- 回归中仅修正脚本类问题：同源转发 Host 头适配（网关按目标入口 Host 路由）与 #46-② 金额文本取值（不改变断言期望）；无产品缺陷新增。
- 详细结果见 `COVERAGE.md`、`RUNS.md` 与任务文档 `TEST_REPORT.md`、`EVIDENCE.md`。

## 历史结果（2026-11-09，提测 #44 首次执行 / TK-0115）

- 47 条用例：通过 23 / 未通过 24 / 阻塞 0 / 未执行 0；检查点 173 个，通过 111 / 未通过 62。
- 未通过归因：6 个产品缺陷（#235 表头、#240 P&L 千分位、#236 Details/房间金额千分位、#237 空数据金额显示、#238 比例末尾 0、#239 非法用户ID未阻断）。
