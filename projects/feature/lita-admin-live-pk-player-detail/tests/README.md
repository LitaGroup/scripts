# Admin 直播PK场次数据（项目 3718）UI 测试脚本

- 项目：3718【报表需求】直播PK场次数据（S0，提测 54）
- 环境：https://admin.test.lita.game（非生产）
- 报表路由：`/#/data-stats-manager/live-data/live-pk-player-detail`（configId `live-pk-player-detail`，报表名「PK模式陪玩师明细」）
- 用例来源（唯一合法输入）：`/task/20261111/TK-0209/HANDOFF`（九列用例 1~18，2026-11-11 用例编写任务验收通过）
- 技术方案：`/task/20261111/TK-0209/TECH_DESIGN`（SK1~SK9、BD-01~03、元素定位、101 检查点引用式映射、N1）

## 覆盖范围

| 脚本 | 覆盖用例 | 检查点数 | 说明 |
|:---|:---|:--:|:---|
| `tc01-entry.test.ts` | #1、#2、#3 | 14 | 有权限菜单进入；BD-03 临时受限账号菜单不可见/直达拦截 |
| `tc02-filter.test.ts` | #4、#5、#9、#10、#12 | 26 | 日期必填拦截、两类空态、重置 |
| `tc03-query.test.ts` | #6（D1/D2）、#7、#8（D1~D4） | 38 | 33 行区间基线、单日 14 行、ID/NO/逗号/换行批量 |
| `tc04-pagination-fields.test.ts` | #11、#14 | 13 | 分页不重不漏、21 列字段/二级表头/角色文案/空值 |
| `tc05-export.test.ts` | #13 | 6 | 实际点击导出、打开 xlsx、全量行列与表头/首末行/空值核对 |
| `tc06-regression.test.ts` | #15~#18 | 24 | 单次开播时长、周榜单、直播间日数据、直播间流水回归 |

合计 18 条用例（P0=12 / P1=6），数据行展开后 **121 个检查点**；check 标题统一带 `用例#N-①[数据行]` 标记，COVERAGE.md 双向核对。

## 运行

```bash
cd projects/feature/lita-admin-live-pk-player-detail/tests

# 逐脚本运行（凭证仅运行时注入，禁止写入代码/日志/证据）
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc01-entry.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc02-filter.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc03-query.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc04-pagination-fields.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc05-export.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc06-regression.test.ts
```

可选：`--evidence-dir=/path/to/evidence` 指定证据目录；默认 `./evidence/<脚本名>-<时间戳>/`。每次运行生成 `run.json`（接口路径/状态/响应摘要，凭证已脱敏）与逐步截图。

**TMPDIR 必须指向非 /tmp 的可写目录**（执行机 /tmp 配额紧张会导致 Playwright 下载落盘失败）：

```bash
TMPDIR=/path/to/work-tmp ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc05-export.test.ts
```

环境变量：
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：有权限测试账号（qa-ai），运行时注入。
- `SCRIPT_UI_BASE`：默认 `https://admin.test.lita.game`。
- `SCRIPT_API_BASE`：默认 `https://funbit-mgr.test.cinta.team`。
- `SCRIPT_DATA_MAIN_BASE`：默认 `https://api.test.cinta.team`。

## 网络与 WAF 说明

执行机直连 `m-api.test.lita.game` 被边缘 WAF 403。基类仅在浏览器层做**同源原样转发**（ADMIN 测试代码开发规范 R1 例外）：

- `/data-main/*` → `https://api.test.cinta.team`
- 其它 `/admin/*` → `https://funbit-mgr.test.cinta.team`

不修改任何业务参数、不注入或篡改响应体；转发行为在代码注释、TEST_REPORT 与 EVIDENCE 中声明。

## 用例 2/3 的受限账号

`tc01-entry.test.ts` 在权限管理页面（`#/permission/role`）创建临时受限角色与账号：
- 角色仅勾选「数据统计管理 / 直播相关数据」并**取消勾选「直播PK场次数据」**；
- 账号随机口令、仅存在于运行时内存；
- 用例执行后用 `/api/admin/deleteAccount`、`/api/admin/deleteRole` 删除，并复核无残留。

## 已知环境限制

- 旧式 3 张报表（单次开播时长/周榜单数据/直播间日数据）查询走 `/admin-main/*`；执行环境 funbit-mgr 404、m-api 直连 WAF 403、api.test 返回「请先登录」。用例 15~17 若仍失败，按「阻塞（环境/鉴权）」记录，不伪造通过。
- 控制台 N1 观察项受同源转发 `/admin/init` 404 与 Sentry 上报影响，无法区分业务新增报错时标「未核实」。
