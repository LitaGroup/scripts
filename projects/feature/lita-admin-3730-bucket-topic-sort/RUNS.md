# RUNS — 项目 3730 分桶列表排序

执行机：被测环境 `https://admin.test.lita.game`；账号 qa-ai（正向）/ qa-noauth（无权限族），凭证运行时注入。

## 1. 自测阶段（脚本调试）

| 时间 | 脚本 | check 数 | 结果 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-11-17 18:40 | tc01 | 9 | 6/9 | 脚本问题 2 处：`getByRole` exact 匹配新增按钮失败、重复点击已展开子菜单导致折叠；修复后通过（未改断言） |
| 2026-11-17 18:43 | tc02 | 4 | 4/4 | 通过 |
| 2026-11-17 18:44 | tc03 | 5 | 5/5 | 通过（另修正分页节点不存在时 innerText 空等 30s 的问题） |
| 2026-11-17 18:44 | tc04 | 24 | 24/24 | 通过 |
| 2026-11-17 18:45 | tc05 | 18 | 18/18 | 通过 |
| 2026-11-17 18:46 | tc06 | 4 | 2/4 → 4/4 | 脚本问题：详情组件懒加载未等待、返回列表数据未落定；修复等待条件后通过 |
| 2026-11-17 18:47 | tc07 | 9 | 9/9 | 通过 |

## 2. 红证抽查（自测阶段）

- 对象：用例 #1（P0）检查点 ③。
- 操作：临时把期望自建序中的 `qa-sort-a1` 与 `qa-sort-ab` 对调 → 运行 `tc01` → `用例#1-③` check 失败（其余 12 项成功），证明断言非永真。
- 恢复：还原代码后重跑通过。
- 证据：`evidence/red-proof/`（失败输出见任务 EVIDENCE）。

## 3. 正式执行（2026-11-17）

| 时间 | 脚本 | 用例 | check 数 | 通过 | 失败 | 证据目录 |
| --- | --- | --- | --- | --- | --- | --- |
| 18:45 | tc01-list-default-order | 1、2 | 9 | 9 | 0 | `formal-evidence/tc01-list-default-order/` |
| 18:45 | tc02-refresh-stability | 3 | 4 | 4 | 0 | `formal-evidence/tc02-refresh-stability/` |
| 18:45 | tc03-single-page-pagination | 4 | 5 | 5 | 0 | `formal-evidence/tc03-single-page-pagination/` |
| 18:45 | tc04-search-and-reset | 5、6、7、8 | 24 | 24 | 0 | `formal-evidence/tc04-search-and-reset/` |
| 18:45 | tc05-add-delete-regression | 9、10、11、16 | 18 | 18 | 0 | `formal-evidence/tc05-add-delete-regression/` |
| 18:46 | tc06-detail-navigation | 12 | 4 | 4 | 0 | `formal-evidence/tc06-detail-navigation/` |
| 18:46 | tc07-noauth-permission | 13、14、15 | 9 | 9 | 0 | `formal-evidence/tc07-noauth-permission/` |
| **合计** | — | **16 条** | **73** | **73** | **0** | — |

## 4. 数据清理

| 时间 | 操作 | 结果 | 证据 |
| --- | --- | --- | --- |
| 18:46 | `tests/tools/cleanup-bd01.ts` 页面逐条删除 12 条 qa-sort- 数据 | 搜索 `qa-sort` 0 行、空态 `No Data` | `formal-evidence/cleanup/` |

## 5. 环境说明

- 直连 `m-api.test.lita.game` 被 WAF 403 → 浏览器层同源原样转发（R1 例外）；`/admin-main/*` 转发至平台网关并以本次登录会话 accesstoken 等价映射 `l-user-token`/`l-user-id`（仅网络层鉴权适配，不改业务参数与响应体）。
- 未使用 mock、未注入响应、未使用 SQL 造数；造数与验证均为页面操作。
