# EVIDENCE — 项目 3716 主播维度报表（TK-0201，正式轮）

## 证据包

- 公开地址：http://work.cinta.team/files/20261111/ed884840-eb4a-4a9f-b89e-d9dab415f248.zip
- 大小：3.3 MB
- 内容：`formal-p0-v3/`（P0 A 26 check）、`formal-p0b/`（P0 B 11 check/导出 xlsx）、`formal-p1p2/`（P1/P2 23 check）、`reg02-formal/`（REG-02 补测 3 check/分组表头截图）、`redproof-formal/`（红证日志）
- 脱敏：仅业务页面与请求状态；账号密码/令牌/Cookie 未落盘；run.json accessToken 已 mask；无个人信息/生产数据。

## 按用例证据

| 用例 | 证据文件 | 摘要 |
|:---|:---|:---|
| TC-AUTH-01 | `formal-p0-v3/01-auth01-menu-visible.png`、`02-auth01-report-opened.png` | 菜单/面包屑/标题/路由 |
| TC-AUTH-02/03 | 无 | 阻塞：无受限账号 |
| TC-INIT-01 | `formal-p0-v3/03-init01-initial.png`、`run.json` | 空态/Total 0/分页禁用 |
| TC-VALID-01 | `formal-p0-v3/04-valid01-date-required.png` | 提示/空态 |
| TC-VALID-02 | `formal-p0-v3/05-valid02-export-required.png` | 导出拦截/提示 |
| TC-GUARD-01 | `formal-p0-v3/06-guard01-initial.png`、`run.json` | 空态/禁用/query 0 |
| TC-GUARD-02 | `formal-p1p2/guard02-after-reset.png`、`run.json` | 重置后守卫 |
| TC-QUERY-01 | `formal-p0-v3/07-query01-1110-all.png` | 26 行/445,824.52 |
| TC-PAGE-01 | `formal-p1p2/page01-page2.png` | 20+6/50-page |
| TC-FILTER-01 | `formal-p0-v3/08-filter01-locale-in.png` | 23 行/445,756.18 |
| TC-FILTER-02 | `formal-p0-v3/09-filter02-d1-comma.png`、`10-filter02-d2-newline.png` | D1/D2 6 行 |
| TC-FILTER-03 | `formal-p0-v3/11-filter03-player-batch.png` | 2 行 |
| TC-FILTER-04 | `formal-p1p2/filter04-locale-room.png` | 6 行 |
| TC-RESET-01 | `formal-p1p2/reset01-after-reset.png` | 清空/空态/Total 0 |
| TC-EXPORT-01 | `formal-p0b/export01-clicked.png`、`export-*.xlsx` | 17×26/合计 |
| TC-DISP-01 | `formal-p0b/disp01-headers.png` | 17 列 |
| TC-DISP-02 | `formal-p0b/disp02-first-row.png`（同查询截图） | 首行字段 |
| TC-REG-01 | `formal-p1p2/reg01-room-summary-1108.png` | 12 列/18 行/合计 |
| TC-REG-02 | `formal-p1p2/reg02-player-daily.png`、`reg02-formal/01-reg02-grouped-header.png` | 实际入口 player-data-report-new；日维度 2026-07-01~07-31，19,978 行；表头 2 行/86 列，父级分组 7 个 |
| TC-EDGE-01 | `formal-p1p2/edge01-no-data.png` | 空态/Total 0 |
| TC-EDGE-02 | `formal-p1p2/edge02-long-ids.png` | 5 行/Total 5 |

## 红证

- `redproof-formal/`：临时错误期望的 INIT-01-① check 状态 fail（real=请输入查询条件后查看数据）；正式 P0 运行通过。
