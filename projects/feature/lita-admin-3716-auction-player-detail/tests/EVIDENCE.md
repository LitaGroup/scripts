# EVIDENCE — 项目 3716 主播维度报表（TK-0201，预检轮）

> **预检轮声明：** 本证据包对应外部用例集的预检执行，不作为正式验收证据；正式轮以 TK-0206 合规用例集重跑后重新取证。

## 证据包

- 公开地址：http://work.cinta.team/files/20261111/f6b589bc-d7d4-4747-953b-2bdd7a493329.zip
- 大小：4.5 MB
- 内容：`p0-formal/`（P0 正式执行截图、run.json、导出 xlsx）、`p1-formal/`（P1 截图/run.json）、`reg02/`（REG-02 页面证据）、`export-guard/`（未选日期导出拦截）、`redproof/`（红证抽查日志）
- 脱敏说明：证据仅含业务页面与接口状态，账号密码/令牌/Cookie 未落盘；`run.json` 中 accessToken 已由基类 `mask()` 替换为 `***`；未上传任何个人信息或生产数据。

## 按用例证据

| 用例 | 证据文件（证据包内） | 内容摘要 |
|:---|:---|:---|
| TC-AUTH-01 | `p0-formal/01-auth01-menu-visible.png`、`02-auth01-report-opened.png` | 菜单可见；进入主播维度报表页（路由/标题） |
| TC-AUTH-02 | 无 | 阻塞：无无权限账号，未执行 |
| TC-AUTH-03 | 无 | 阻塞：无无权限账号，未执行 |
| TC-UI-01 | `p0-formal/03-ui01-initial-empty.png`、`p0-formal/run.json` | 首屏空态；query=0；分页/每页条数守卫 query 增量 0 |
| TC-UI-02 | `p0-formal/04-ui02-date-required.png` | 提示「请选择开始日期」；query 增量 0 |
| TC-UI-03 | `p0-formal/05-ui03-query-1110-page1.png`、`06-ui03-query-1110-page2.png` | 26 行；15/4/7；445,824.52；Total 26 |
| TC-UI-04 | `p1-formal/01-ui04-pagination-page2.png`、`run.json` | Total 26；20+6；批次无重复 |
| TC-FILTER-01 | `p0-formal/10-filter01-locale-in.png` | in 大区 23 行；单选；445,756.18 |
| TC-FILTER-02 | `p0-formal/11-filter02-room-batch.png` | 房间 10101473,1002 → 6 行 |
| TC-FILTER-03 | `p0-formal/12-filter03-player-batch.png` | 主播 322540,7214137 → 2 行 |
| TC-FILTER-04 | `p1-formal/02-filter04-locale-room.png` | 组合筛选 6 行；仅两房间 |
| TC-UI-05 | `p1-formal/03-ui05-after-reset.png` | 筛选项清空；表格空态 |
| TC-UI-06 | `p0-formal/09-ui06-export-clicked.png`、`p0-formal/export-*.xlsx` | 文件名含报表名；26 行×17 列；合计一致；表头 2 行 |
| TC-UI-07 | `p0-formal/07-ui07-table-headers.png` | 17 列表头完整、列序一致 |
| TC-UI-08 | `p0-formal/08-ui08-first-row.png` | 首行 17 字段与接口基线一致、不串列 |
| TC-REG-01 | `p1-formal/04-reg01-room-summary-1108.png` | 房间维度 12 列；18 行；35/21/14/728,846.40 |
| TC-REG-02 | `p1-formal/05-reg02-player-daily-report.png`、`reg02/01-reg02-grouped-header.png` | 页面/筛选项正常；仅见查询记录表 9 列；日维度 0 行 → 阻塞 |
| TC-EDGE-01 | 无 | 未执行（P2 时间不足） |
| TC-EDGE-02 | 无 | 未执行（P2 时间不足） |

## 重点回归证据

| 项 | 证据 |
|:---|:---|
| 首屏 0 查询 / 未选日期查询拦截 | `p0-formal/run.json`（query 计数）、`03`/`04` 截图 |
| 未选日期导出拦截 | `export-guard/export-no-date.png`、`export-guard.json`（提示「请选择开始日期」，query/download 均 0） |
| 分页/每页条数守卫 | `p0-formal/run.json` notes：首屏与重置后切换每页条数 query 增量 0；`13-guard-after-reset.png` |
| 2026-11-10 基线 | `p0-formal/05`、`06`、`run.json` |
| 17 列表头与导出 | `p0-formal/07`、`09`、`export-*.xlsx` |
| 既有报表回归 | `p1-formal/04-reg01-room-summary-1108.png`；REG-02 阻塞证据见上 |

## 红证抽查

- `redproof/redproof.log`：临时将 TC-UI-03-③ 比较值改为 445,824.53 后，该 check 状态 `fail`（real=445824.52），证明断言非永真；正式代码随后通过。
