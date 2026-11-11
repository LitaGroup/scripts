# COVERAGE — 项目 3716「拍拍模式流水-主播维度」22 条用例

> 用例来源：`/task/20261111/TK-0206/HANDOFF` 第 3 节九列表格（22 条，P0 13 / P1 7 / P2 2）
> 技术方案：`/task/20261111/TK-0206/TECH_DESIGN`
> 双向核对：正向（用例→代码）每个检查点在代码中有唯一 check；反向（代码→用例）每个 check 均可映射回检查点。
> 参数化展开：TC-FILTER-02 按数据行 D1（逗号）/D2（换行）分别执行 ①②，并以 ③ 校验两行结果一致，共 5 个 check。

| 用例# | 用例编号 | 优先级 | 检查点 | 脚本 / check 标记 | 结果 |
|:--|:--|:--|:--|:--|:--|
| 1 | TC-AUTH-01 | P0 | ① 菜单项可见 | tc-formal-p0 `用例#1-①` | 通过 |
| 1 | TC-AUTH-01 | P0 | ② 面包屑与标题正确 | tc-formal-p0 `用例#1-②` | 通过 |
| 1 | TC-AUTH-01 | P0 | ③ 路由正确 | tc-formal-p0 `用例#1-③` | 通过 |
| 2 | TC-AUTH-02 | P1 | ① 无权限账号不可见菜单 | 未代码化（无受限账号，阻塞） | 阻塞 |
| 3 | TC-AUTH-03 | P1 | ① 直达呈现 404；② 路由不停留 | 未代码化（无受限账号，阻塞） | 阻塞 |
| 4 | TC-INIT-01 | P0 | ① 空态文案 | tc-formal-p0 `用例#4-①` | 通过 |
| 4 | TC-INIT-01 | P0 | ② Total 0 且分页禁用 | tc-formal-p0 `用例#4-②` | 通过 |
| 4 | TC-INIT-01 | P0 | ③ 无数据行/无 loading | tc-formal-p0 `用例#4-③` | 通过 |
| 5 | TC-VALID-01 | P0 | ① 提示「请选择开始日期」 | tc-formal-p0 `用例#5-①` | 通过 |
| 5 | TC-VALID-01 | P0 | ② 表格保持空态/无行/无 loading | tc-formal-p0 `用例#5-②` | 通过 |
| 5 | TC-VALID-01 | P0 | ③ Total 0 | tc-formal-p0 `用例#5-③` | 通过 |
| 6 | TC-VALID-02 | P0 | ① 导出必填拦截、不下载 | tc-formal-p0 `用例#6-①` | 通过 |
| 6 | TC-VALID-02 | P0 | ② 表格保持空态 | tc-formal-p0 `用例#6-②` | 通过 |
| 7 | TC-GUARD-01 | P0 | ① 操作后空态/无数据行 | tc-formal-p0 `用例#7-①` | 通过 |
| 7 | TC-GUARD-01 | P0 | ② Total 0 且分页禁用 | tc-formal-p0 `用例#7-②` | 通过 |
| 7 | TC-GUARD-01 | P0 | ③ 无 loading/无新数据 | tc-formal-p0 `用例#7-③` | 通过 |
| 8 | TC-GUARD-02 | P0 | ① 重置后空态/无行 | tc-formal-p1 `用例#8-①` | 通过 |
| 8 | TC-GUARD-02 | P0 | ② 操作分页后仍空态 | tc-formal-p1 `用例#8-②` | 通过 |
| 8 | TC-GUARD-02 | P0 | ③ Total 0 且分页禁用 | tc-formal-p1 `用例#8-③` | 通过 |
| 8 | TC-GUARD-02 | P0 | ④ 无 loading/无新数据 | tc-formal-p1 `用例#8-④` | 通过 |
| 9 | TC-QUERY-01 | P0 | ① Total 26 / 26 行 | tc-formal-p0 `用例#9-①` | 通过 |
| 9 | TC-QUERY-01 | P0 | ② 状态分布 15/4/7 | tc-formal-p0 `用例#9-②` | 通过 |
| 9 | TC-QUERY-01 | P0 | ③ 合计 445,824.52 | tc-formal-p0 `用例#9-③` | 通过 |
| 9 | TC-QUERY-01 | P0 | ④ date 列区间 | tc-formal-p0 `用例#9-④` | 通过 |
| 10 | TC-PAGE-01 | P1 | ① Total 26 恒定 | tc-formal-p1 `用例#10-①` | 通过 |
| 10 | TC-PAGE-01 | P1 | ② 20+6 行不重复 | tc-formal-p1 `用例#10-②` | 通过 |
| 10 | TC-PAGE-01 | P1 | ③ 50/page 26 行集合一致 | tc-formal-p1 `用例#10-③` | 通过 |
| 11 | TC-FILTER-01 | P0 | ① 大区单选 | tc-formal-p0-filter `用例#11-①` | 通过 |
| 11 | TC-FILTER-01 | P0 | ② Total 23 / 23 行 | tc-formal-p0-filter `用例#11-②` | 通过 |
| 11 | TC-FILTER-01 | P0 | ③ 合计 445,756.18 | tc-formal-p0-filter `用例#11-③` | 通过 |
| 12 | TC-FILTER-02 | P0 | ①[数据行D1] 6 行 | tc-formal-p0-filter `用例#12-①[数据行D1]` | 通过 |
| 12 | TC-FILTER-02 | P0 | ②[数据行D1] 房间集合 | tc-formal-p0-filter `用例#12-②[数据行D1]` | 通过 |
| 12 | TC-FILTER-02 | P0 | ①[数据行D2] 6 行 | tc-formal-p0-filter `用例#12-①[数据行D2]` | 通过 |
| 12 | TC-FILTER-02 | P0 | ②[数据行D2] 房间集合 | tc-formal-p0-filter `用例#12-②[数据行D2]` | 通过 |
| 12 | TC-FILTER-02 | P0 | ③[D1/D2] 两行结果一致 | tc-formal-p0-filter `用例#12-③[数据行D1/D2]` | 通过 |
| 13 | TC-FILTER-03 | P0 | ① Total 2 / 2 行 | tc-formal-p0-filter `用例#13-①` | 通过 |
| 13 | TC-FILTER-03 | P0 | ② player_id 集合 | tc-formal-p0-filter `用例#13-②` | 通过 |
| 14 | TC-FILTER-04 | P1 | ① 6 行 | tc-formal-p1 `用例#14-①` | 通过 |
| 14 | TC-FILTER-04 | P1 | ② 房间集合 | tc-formal-p1 `用例#14-②` | 通过 |
| 14 | TC-FILTER-04 | P1 | ③ 交集性质 | tc-formal-p1 `用例#14-③` | 通过 |
| 15 | TC-RESET-01 | P1 | ① 条件清空 | tc-formal-p1 `用例#15-①` | 通过 |
| 15 | TC-RESET-01 | P1 | ② 空态/0 行 | tc-formal-p1 `用例#15-②` | 通过 |
| 15 | TC-RESET-01 | P1 | ③ Total 0 且分页禁用 | tc-formal-p1 `用例#15-③` | 通过 |
| 16 | TC-EXPORT-01 | P0 | ① 文件名 | tc-formal-p0b `用例#16-①` | 通过 |
| 16 | TC-EXPORT-01 | P0 | ② 17 列×26 行 | tc-formal-p0b `用例#16-②` | 通过 |
| 16 | TC-EXPORT-01 | P0 | ③ 合计 445,824.52 | tc-formal-p0b `用例#16-③` | 通过 |
| 16 | TC-EXPORT-01 | P0 | ④ 数据不错列 | tc-formal-p0b `用例#16-④` | 通过 |
| 17 | TC-DISP-01 | P0 | ① 17 列顺序 | tc-formal-p0b `用例#17-①` | 通过 |
| 17 | TC-DISP-01 | P0 | ② 列名完整不截断 | tc-formal-p0b `用例#17-②` | 通过 |
| 17 | TC-DISP-01 | P0 | ③ 连字符列名单行平铺 | tc-formal-p0b `用例#17-③` | 通过 |
| 18 | TC-DISP-02 | P0 | ① 批次号 | tc-formal-p0b `用例#18-①` | 通过 |
| 18 | TC-DISP-02 | P0 | ② 主播ID/编号/昵称 | tc-formal-p0b `用例#18-②` | 通过 |
| 18 | TC-DISP-02 | P0 | ③ 房间/状态/流水/竞价人数 | tc-formal-p0b `用例#18-③` | 通过 |
| 18 | TC-DISP-02 | P0 | ④ 得标/时间/关系 | tc-formal-p0b `用例#18-④` | 通过 |
| 19 | TC-REG-01 | P1 | ① 12 列表头 | tc-formal-p2 `用例#19-①` | 通过 |
| 19 | TC-REG-01 | P1 | ② 18 行/Total 18 | tc-formal-p2 `用例#19-②` | 通过 |
| 19 | TC-REG-01 | P1 | ③ 合计 35/21/14/728,846.40 | tc-formal-p2 `用例#19-③` | 通过 |
| 20 | TC-REG-02 | P1 | ① 筛选项完整 | tc-formal-p2 `用例#20-①` | 通过 |
| 20 | TC-REG-02 | P1 | ② 两级分组表头 | tc-formal-p2 `用例#20-②` | 通过 |
| 20 | TC-REG-02 | P1 | ③ 数据行>0 | tc-formal-p2 `用例#20-③` | 通过 |
| 21 | TC-EDGE-01 | P2 | ① 0 行/空态「暂无数据」 | tc-formal-p2 `用例#21-①` | 通过 |
| 21 | TC-EDGE-01 | P2 | ② Total 0 | tc-formal-p2 `用例#21-②` | 通过 |
| 21 | TC-EDGE-01 | P2 | ③ 无报错/不白屏 | tc-formal-p2 `用例#21-③` | 通过 |
| 22 | TC-EDGE-02 | P2 | ① 不白屏/不崩溃 | tc-formal-p2 `用例#22-①` | 通过 |
| 22 | TC-EDGE-02 | P2 | ② 数据行或空态/无报错 | tc-formal-p2 `用例#22-②` | 通过 |
| 22 | TC-EDGE-02 | P2 | ③ Total N≥0 | tc-formal-p2 `用例#22-③` | 通过 |

## 统计

- 用例总数：22（P0 13 / P1 7 / P2 2）。
- 检查点总数：67（含 TC-FILTER-02 按 D1/D2 展开后的 5 个）。
- 已代码化检查点：64；未代码化：3（TC-AUTH-02 ①、TC-AUTH-03 ①②，因无受限账号阻塞）。
- 注：上表“结果”为最终定稿回填口径；执行明细与证据见 `RUNS.md`、任务文档 `TEST_REPORT.md`/`EVIDENCE.md`。
