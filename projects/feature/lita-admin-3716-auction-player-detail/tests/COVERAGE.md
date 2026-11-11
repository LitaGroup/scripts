# COVERAGE — 项目 3716 主播维度报表（正式轮）

> 用例来源：`/task/20261111/TK-0206/HANDOFF`（22 条，P0 13 / P1 7 / P2 2）
> 技术方案：`/task/20261111/TK-0206/TECH_DESIGN`
> 双向核对：每个用例检查点在代码中有唯一 check；每个 check 映射回对应检查点。

| 用例# | 优先级 | 检查点 | 脚本 / check 标记 | 结果 |
|:---|:---|:---|:---|:---|
| TC-AUTH-01 | P0 | ① 菜单项可见 | tc-formal-p0 `用例#TC-AUTH-01-①` | 通过 |
| TC-AUTH-01 | P0 | ② 面包屑与标题正确 | tc-formal-p0 `用例#TC-AUTH-01-②` | 通过 |
| TC-AUTH-01 | P0 | ③ 路由正确 | tc-formal-p0 `用例#TC-AUTH-01-③` | 通过 |
| TC-AUTH-02 | P1 | ① 无权限账号不可见菜单 | 无（无受限账号，阻塞） | 阻塞 |
| TC-AUTH-03 | P1 | ① 无权限账号直达 404 / ② 路由不停留 | 无（无受限账号，阻塞） | 阻塞 |
| TC-INIT-01 | P0 | ① 空态文案 | tc-formal-p0 `用例#TC-INIT-01-①` | 通过 |
| TC-INIT-01 | P0 | ② Total 0 且分页禁用 | tc-formal-p0 `用例#TC-INIT-01-②` | 通过 |
| TC-INIT-01 | P0 | ③ 无数据行/无 loading | tc-formal-p0 `用例#TC-INIT-01-③` | 通过 |
| TC-VALID-01 | P0 | ① 提示「请选择开始日期」 | tc-formal-p0 `用例#TC-VALID-01-①` | 通过 |
| TC-VALID-01 | P0 | ② 表格保持空态 | tc-formal-p0 `用例#TC-VALID-01-②` | 通过 |
| TC-VALID-01 | P0 | ③ Total 0 / 无查询 | tc-formal-p0 `用例#TC-VALID-01-③` | 通过 |
| TC-VALID-02 | P0 | ① 导出必填拦截、不下载 | tc-formal-p0 `用例#TC-VALID-02-①` | 通过 |
| TC-VALID-02 | P0 | ② 表格保持空态 | tc-formal-p0 `用例#TC-VALID-02-②` | 通过 |
| TC-GUARD-01 | P0 | ① 操作后空态/无数据行 | tc-formal-p0 `用例#TC-GUARD-01-①` | 通过 |
| TC-GUARD-01 | P0 | ② Total 0 且分页禁用 | tc-formal-p0 `用例#TC-GUARD-01-②` | 通过 |
| TC-GUARD-01 | P0 | ③ 无 loading/无新数据/无 query | tc-formal-p0 `用例#TC-GUARD-01-③` | 通过 |
| TC-GUARD-02 | P0 | ① 重置后空态 | tc-formal-p1p2 `用例#TC-GUARD-02-①`（由 RESET-01 覆盖后置态） | 通过 |
| TC-GUARD-02 | P0 | ② 操作分页后仍空态 | tc-formal-p1p2 `用例#TC-GUARD-02-②` | 通过 |
| TC-GUARD-02 | P0 | ③ Total 0 且分页禁用 | tc-formal-p1p2 `用例#TC-GUARD-02-③` | 通过 |
| TC-GUARD-02 | P0 | ④ 无 loading/无新数据/无 query | tc-formal-p1p2 `用例#TC-GUARD-02-④` | 通过 |
| TC-QUERY-01 | P0 | ① Total 26 / 26 行 | tc-formal-p0 `用例#TC-QUERY-01-①` | 通过 |
| TC-QUERY-01 | P0 | ② 状态分布 15/4/7 | tc-formal-p0 `用例#TC-QUERY-01-②` | 通过 |
| TC-QUERY-01 | P0 | ③ 合计 445,824.52 | tc-formal-p0 `用例#TC-QUERY-01-③` | 通过 |
| TC-QUERY-01 | P0 | ④ date 列区间 | tc-formal-p0 `用例#TC-QUERY-01-④` | 通过 |
| TC-PAGE-01 | P1 | ① Total 26 | tc-formal-p1p2 `用例#TC-PAGE-01-①` | 通过 |
| TC-PAGE-01 | P1 | ② 20+6 不重复 | tc-formal-p1p2 `用例#TC-PAGE-01-②` | 通过 |
| TC-PAGE-01 | P1 | ③ 50/page 26 行集合一致 | tc-formal-p1p2 `用例#TC-PAGE-01-③` | 通过 |
| TC-FILTER-01 | P0 | ① 大区单选 | tc-formal-p0 `用例#TC-FILTER-01-①` | 通过 |
| TC-FILTER-01 | P0 | ② Total 23 / 23 行 | tc-formal-p0 `用例#TC-FILTER-01-②` | 通过 |
| TC-FILTER-01 | P0 | ③ 合计 445,756.18 | tc-formal-p0 `用例#TC-FILTER-01-③` | 通过 |
| TC-FILTER-02 | P0 | ① D1 6 行 | tc-formal-p0 `用例#TC-FILTER-02-①` | 通过 |
| TC-FILTER-02 | P0 | ② D1 房间集合 | tc-formal-p0 `用例#TC-FILTER-02-②` | 通过 |
| TC-FILTER-02 | P0 | ③ D1/D2 结果一致 | tc-formal-p0 `用例#TC-FILTER-02-③` | 通过 |
| TC-FILTER-03 | P0 | ① 2 行 | tc-formal-p0 `用例#TC-FILTER-03-①` | 通过 |
| TC-FILTER-03 | P0 | ② player_id 集合 | tc-formal-p0 `用例#TC-FILTER-03-②` | 通过 |
| TC-FILTER-04 | P1 | ① 6 行 | tc-formal-p1p2 `用例#TC-FILTER-04-①` | 通过 |
| TC-FILTER-04 | P1 | ② 房间集合 | tc-formal-p1p2 `用例#TC-FILTER-04-②` | 通过 |
| TC-FILTER-04 | P1 | ③ 交集性质 | tc-formal-p1p2 `用例#TC-FILTER-04-③` | 通过 |
| TC-RESET-01 | P1 | ① 条件清空 | tc-formal-p1p2 `用例#TC-RESET-01-①` | 通过 |
| TC-RESET-01 | P1 | ② 空态/0 行 | tc-formal-p1p2 `用例#TC-RESET-01-②` | 通过 |
| TC-RESET-01 | P1 | ③ Total 0 且分页禁用 | tc-formal-p1p2 `用例#TC-RESET-01-③` | 通过 |
| TC-EXPORT-01 | P0 | ① 文件名 | tc-formal-p0 `用例#TC-EXPORT-01-①` | 通过 |
| TC-EXPORT-01 | P0 | ② 17 列×26 行 | tc-formal-p0 `用例#TC-EXPORT-01-②` | 通过 |
| TC-EXPORT-01 | P0 | ③ 合计 445,824.52 | tc-formal-p0 `用例#TC-EXPORT-01-③` | 通过 |
| TC-EXPORT-01 | P0 | ④ 数据不错列 | tc-formal-p0 `用例#TC-EXPORT-01-④` | 通过 |
| TC-DISP-01 | P0 | ① 17 列顺序 | tc-formal-p0 `用例#TC-DISP-01-①` | 通过 |
| TC-DISP-01 | P0 | ② 列名完整不截断 | tc-formal-p0 `用例#TC-DISP-01-②` | 通过 |
| TC-DISP-01 | P0 | ③ 连字符列名单行平铺 | tc-formal-p0 `用例#TC-DISP-01-③` | 通过 |
| TC-DISP-02 | P0 | ① 批次号 | tc-formal-p0 `用例#TC-DISP-02-①` | 通过 |
| TC-DISP-02 | P0 | ② 主播ID/编号/昵称 | tc-formal-p0 `用例#TC-DISP-02-②` | 通过 |
| TC-DISP-02 | P0 | ③ 房间/状态/流水/竞价人数 | tc-formal-p0 `用例#TC-DISP-02-③` | 通过 |
| TC-DISP-02 | P0 | ④ 得标/时间/关系 | tc-formal-p0 `用例#TC-DISP-02-④` | 通过 |
| TC-REG-01 | P1 | ① 12 列表头 | tc-formal-p1p2 `用例#TC-REG-01-①` | 通过 |
| TC-REG-01 | P1 | ② 18 行/Total 18 | tc-formal-p1p2 `用例#TC-REG-01-②` | 通过 |
| TC-REG-01 | P1 | ③ 合计 35/21/14/728,846.40 | tc-formal-p1p2 `用例#TC-REG-01-③` | 通过 |
| TC-REG-02 | P1 | ① 筛选项完整 | tc-reg02-formal `用例#TC-REG-02-①`（P1P2 已先行验证） | 通过 |
| TC-REG-02 | P1 | ② 两级分组表头 | tc-reg02-formal `用例#TC-REG-02-②` | 通过 |
| TC-REG-02 | P1 | ③ 数据行>0 | tc-reg02-formal `用例#TC-REG-02-③` | 通过 |
| TC-EDGE-01 | P2 | ① 0 行/空态 | tc-formal-p1p2 `用例#TC-EDGE-01-①` | 通过 |
| TC-EDGE-01 | P2 | ② Total 0 | tc-formal-p1p2 `用例#TC-EDGE-01-②` | 通过 |
| TC-EDGE-01 | P2 | ③ 无报错/不白屏 | tc-formal-p1p2 `用例#TC-EDGE-01-③` | 通过 |
| TC-EDGE-02 | P2 | ① 不白屏/不崩溃 | tc-formal-p1p2 `用例#TC-EDGE-02-①` | 通过 |
| TC-EDGE-02 | P2 | ② 数据行或空态/无报错 | tc-formal-p1p2 `用例#TC-EDGE-02-②` | 通过 |
| TC-EDGE-02 | P2 | ③ Total N≥0 | tc-formal-p1p2 `用例#TC-EDGE-02-③` | 通过 |

> 执行说明：P0 因 ODPS 单次查询约 2–3 分钟，拆为 `tc-formal-p0.test.ts`（26 个 check）与 `tc-formal-p0b.test.ts`（11 个 check）；P1/P2 由 `tc-formal-p1p2.test.ts` 执行（23 个 check）。REG-02 补测：`player-daily-report` 为 configId，实际入口 `/#/data-stats-manager/player-stats/player-data-report-new`（菜单 Player Data Report(New)，页面标题「陪玩师日报表」）；日维度 2026-07-01~07-31 查到 19,978 行，两级分组表头（2 行/86 列）正常，`tc-reg02-formal.test.ts` 3/3 通过。唯一检查点 62 个全部通过（REG-02 ① 复跑一次）。