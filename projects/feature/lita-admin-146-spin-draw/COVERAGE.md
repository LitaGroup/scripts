# COVERAGE — 用例检查点与测试代码双向核对

用例来源：TK-0112 HANDOFF（`/task/20261109/TK-0112/HANDOFF`）；技术方案：`/task/20261109/TK-0112/TECH_DESIGN`。
执行轮次：TK-0115 正式执行（2026-11-09，提测 #44）；结果取自 `RUNS.md` 对应运行日志。
核对口径：正向——47 条用例每个检查点（含数据行 A/B/C）在代码中有唯一 check；反向——每个 check 均可映射回用例检查点。

## 1. 双向核对汇总

| 用例# | 检查点数 | 通过 | 未通过 | 结论 | 脚本 |
| --- | --- | --- | --- | --- | --- |
| 1 | 5 | 5 | 0 | 通过 | `spin-draw-entry.test.ts` |
| 2 | 5 | 5 | 0 | 通过 | `spin-draw-entry.test.ts` |
| 3 | 3 | 3 | 0 | 通过 | `spin-draw-validation.test.ts` |
| 4 | 3 | 3 | 0 | 通过 | `spin-draw-validation.test.ts` |
| 5 | 3 | 3 | 0 | 通过 | `spin-draw-validation.test.ts` |
| 6 | 3 | 3 | 0 | 通过 | `spin-draw-validation.test.ts` |
| 7 | 3 | 3 | 0 | 通过 | `spin-draw-validation.test.ts` |
| 8 | 3 | 3 | 0 | 通过 | `spin-draw-validation.test.ts` |
| 9 | 3 | 3 | 0 | 通过 | `spin-draw-validation.test.ts` |
| 10 | 3 | 3 | 0 | 通过 | `spin-draw-validation.test.ts` |
| 11 | 3 | 0 | 3 | 未通过 | `spin-draw-validation.test.ts` |
| 12 | 3 | 0 | 3 | 未通过 | `spin-draw-validation.test.ts` |
| 13 | 3 | 0 | 3 | 未通过 | `spin-draw-validation.test.ts` |
| 14 | 3 | 0 | 3 | 未通过 | `spin-draw-validation.test.ts` |
| 15 | 3 | 0 | 3 | 未通过 | `spin-draw-validation.test.ts` |
| 16 | 3 | 0 | 3 | 未通过 | `spin-draw-validation.test.ts` |
| 17 | 3 | 0 | 3 | 未通过 | `spin-draw-validation.test.ts` |
| 18 | 3 | 0 | 3 | 未通过 | `spin-draw-validation.test.ts` |
| 19 | 9 | 3 | 6 | 未通过 | `spin-draw-summary.test.ts` |
| 20 | 9 | 6 | 3 | 未通过 | `spin-draw-daily.test.ts` |
| 21 | 2 | 1 | 1 | 未通过 | `spin-draw-summary.test.ts` |
| 22 | 2 | 2 | 0 | 通过 | `spin-draw-summary.test.ts` |
| 23 | 3 | 0 | 3 | 未通过 | `spin-draw-summary.test.ts` |
| 24 | 2 | 1 | 1 | 未通过 | `spin-draw-summary.test.ts` |
| 25 | 3 | 2 | 1 | 未通过 | `spin-draw-daily.test.ts` |
| 26 | 3 | 3 | 0 | 通过 | `spin-draw-daily.test.ts` |
| 27 | 4 | 1 | 3 | 未通过 | `spin-draw-daily.test.ts` |
| 28 | 3 | 2 | 1 | 未通过 | `spin-draw-daily.test.ts` |
| 29 | 3 | 2 | 1 | 未通过 | `spin-draw-summary.test.ts` |
| 30 | 4 | 3 | 1 | 未通过 | `spin-draw-daily.test.ts` |
| 31 | 3 | 2 | 1 | 未通过 | `spin-draw-summary.test.ts` |
| 32 | 4 | 3 | 1 | 未通过 | `spin-draw-daily.test.ts` |
| 33 | 4 | 1 | 3 | 未通过 | `spin-draw-summary.test.ts` |
| 34 | 4 | 4 | 0 | 通过 | `spin-draw-daily.test.ts` |
| 35 | 8 | 2 | 6 | 未通过 | `spin-draw-summary.test.ts` |
| 36 | 6 | 6 | 0 | 通过 | `spin-draw-daily.test.ts` |
| 37 | 4 | 4 | 0 | 通过 | `spin-draw-reset-loading-pagination.test.ts` |
| 38 | 4 | 4 | 0 | 通过 | `spin-draw-reset-loading-pagination.test.ts` |
| 39 | 3 | 3 | 0 | 通过 | `spin-draw-reset-loading-pagination.test.ts` |
| 40 | 3 | 3 | 0 | 通过 | `spin-draw-reset-loading-pagination.test.ts` |
| 41 | 4 | 4 | 0 | 通过 | `spin-draw-entry.test.ts` |
| 42 | 4 | 4 | 0 | 通过 | `spin-draw-entry.test.ts` |
| 43 | 3 | 3 | 0 | 通过 | `spin-draw-reset-loading-pagination.test.ts` |
| 44 | 3 | 3 | 0 | 通过 | `spin-draw-reset-loading-pagination.test.ts` |
| 45 | 3 | 3 | 0 | 通过 | `spin-draw-reset-loading-pagination.test.ts` |
| 46 | 4 | 1 | 3 | 未通过 | `spin-draw-summary.test.ts` |
| 47 | 4 | 1 | 3 | 未通过 | `spin-draw-daily.test.ts` |

- 用例数：47（通过 23 / 未通过 24）；检查点总数 173（通过 111 / 未通过 62）。
- 通过用例：1、2、3、4、5、6、7、8、9、10、22、26、34、36、37、38、39、40、41、42、43、44、45
- 未通过用例：11、12、13、14、15、16、17、18、19、20、21、23、24、25、27、28、29、30、31、32、33、35、46、47

## 2. 逐用例检查点明细

| 用例# | 检查点 | 检查描述 | 脚本 / check 标记 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | ① | 左侧「水果机数据-汇总」菜单呈选中态 | `spin-draw-entry.test.ts` → `用例#1-①` | ✅ |
| 1 | ② | 地址栏 hash 为汇总页路由 | `spin-draw-entry.test.ts` → `用例#1-②` | ✅ |
| 1 | ③ | 面包屑依次显示 Dashboard / 数据统计管理 / 用户数据 / 水果机数据-汇总 | `spin-draw-entry.test.ts` → `用例#1-③` | ✅ |
| 1 | ④ | 页面标题显示「水果机数据-汇总」 | `spin-draw-entry.test.ts` → `用例#1-④` | ✅ |
| 1 | ⑤ | 查询区显示三项必填与查询/重置按钮 | `spin-draw-entry.test.ts` → `用例#1-⑤` | ✅ |
| 2 | ① | 左侧「水果机数据-按日」菜单呈选中态 | `spin-draw-entry.test.ts` → `用例#2-①` | ✅ |
| 2 | ② | 地址栏 hash 为按日页路由 | `spin-draw-entry.test.ts` → `用例#2-②` | ✅ |
| 2 | ③ | 面包屑依次显示 Dashboard / 数据统计管理 / 用户数据 / 水果机数据-按日 | `spin-draw-entry.test.ts` → `用例#2-③` | ✅ |
| 2 | ④ | 页面标题显示「水果机数据-按日」 | `spin-draw-entry.test.ts` → `用例#2-④` | ✅ |
| 2 | ⑤ | 查询区显示三项必填与查询/重置按钮 | `spin-draw-entry.test.ts` → `用例#2-⑤` | ✅ |
| 41 | ① | 三个查询输入框均为空 | `spin-draw-entry.test.ts` → `用例#41-①` | ✅ |
| 41 | ② | 结果区显示「请输入查询条件后查看数据」 | `spin-draw-entry.test.ts` → `用例#41-②` | ✅ |
| 41 | ③ | 分页显示 Total 0 且结果表无数据行 | `spin-draw-entry.test.ts` → `用例#41-③` | ✅ |
| 41 | ④ | 上一页与下一页按钮均为禁用态 | `spin-draw-entry.test.ts` → `用例#41-④` | ✅ |
| 42 | ① | 三个查询输入框均为空 | `spin-draw-entry.test.ts` → `用例#42-①` | ✅ |
| 42 | ② | 结果区显示「请输入查询条件后查看数据」 | `spin-draw-entry.test.ts` → `用例#42-②` | ✅ |
| 42 | ③ | 分页显示 Total 0 且结果表无数据行 | `spin-draw-entry.test.ts` → `用例#42-③` | ✅ |
| 42 | ④ | 上一页与下一页按钮均为禁用态 | `spin-draw-entry.test.ts` → `用例#42-④` | ✅ |
| 3 | ① | Toast 提示「请选择开始日期」 | `spin-draw-validation.test.ts` → `用例#3-①` | ✅ |
| 3 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#3-②` | ✅ |
| 3 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#3-③` | ✅ |
| 4 | ① | Toast 提示「请选择结束日期」 | `spin-draw-validation.test.ts` → `用例#4-①` | ✅ |
| 4 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#4-②` | ✅ |
| 4 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#4-③` | ✅ |
| 5 | ① | Toast 提示「请输入用户ID」 | `spin-draw-validation.test.ts` → `用例#5-①` | ✅ |
| 5 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#5-②` | ✅ |
| 5 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#5-③` | ✅ |
| 6 | ① | Toast 提示「请选择开始日期」 | `spin-draw-validation.test.ts` → `用例#6-①` | ✅ |
| 6 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#6-②` | ✅ |
| 6 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#6-③` | ✅ |
| 7 | ① | Toast 提示「请选择开始日期」 | `spin-draw-validation.test.ts` → `用例#7-①` | ✅ |
| 7 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#7-②` | ✅ |
| 7 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#7-③` | ✅ |
| 8 | ① | Toast 提示「请选择结束日期」 | `spin-draw-validation.test.ts` → `用例#8-①` | ✅ |
| 8 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#8-②` | ✅ |
| 8 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#8-③` | ✅ |
| 9 | ① | Toast 提示「请输入用户ID」 | `spin-draw-validation.test.ts` → `用例#9-①` | ✅ |
| 9 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#9-②` | ✅ |
| 9 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#9-③` | ✅ |
| 10 | ① | Toast 提示「请选择开始日期」 | `spin-draw-validation.test.ts` → `用例#10-①` | ✅ |
| 10 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#10-②` | ✅ |
| 10 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#10-③` | ✅ |
| 11 | ① | Toast 提示「请输入正确的用户ID」 | `spin-draw-validation.test.ts` → `用例#11-①` | ❌ |
| 11 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#11-②` | ❌ |
| 11 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#11-③` | ❌ |
| 12 | ① | Toast 提示「请输入正确的用户ID」 | `spin-draw-validation.test.ts` → `用例#12-①` | ❌ |
| 12 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#12-②` | ❌ |
| 12 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#12-③` | ❌ |
| 13 | ① | Toast 提示「请输入正确的用户ID」 | `spin-draw-validation.test.ts` → `用例#13-①` | ❌ |
| 13 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#13-②` | ❌ |
| 13 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#13-③` | ❌ |
| 14 | ① | Toast 提示「请输入正确的用户ID」 | `spin-draw-validation.test.ts` → `用例#14-①` | ❌ |
| 14 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#14-②` | ❌ |
| 14 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#14-③` | ❌ |
| 15 | ① | Toast 提示「请输入正确的用户ID」 | `spin-draw-validation.test.ts` → `用例#15-①` | ❌ |
| 15 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#15-②` | ❌ |
| 15 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#15-③` | ❌ |
| 16 | ① | Toast 提示「请输入正确的用户ID」 | `spin-draw-validation.test.ts` → `用例#16-①` | ❌ |
| 16 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#16-②` | ❌ |
| 16 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#16-③` | ❌ |
| 17 | ① | Toast 提示「请输入正确的用户ID」 | `spin-draw-validation.test.ts` → `用例#17-①` | ❌ |
| 17 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#17-②` | ❌ |
| 17 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#17-③` | ❌ |
| 18 | ① | Toast 提示「请输入正确的用户ID」 | `spin-draw-validation.test.ts` → `用例#18-①` | ❌ |
| 18 | ② | 结果区保持查询前状态且不出现数据行 | `spin-draw-validation.test.ts` → `用例#18-②` | ❌ |
| 18 | ③ | 结果区显示「请输入查询条件后查看数据」且 Total 0 | `spin-draw-validation.test.ts` → `用例#18-③` | ❌ |
| 19 | A-① | 列表显示 1 行且 Total 1 | `spin-draw-summary.test.ts` → `用例#19-A-①` | ✅ |
| 19 | A-② | 表头依次为 P&L / RTP / Details / Dismantle / Top Spending Room | `spin-draw-summary.test.ts` → `用例#19-A-②` | ❌ |
| 19 | A-③ | P&L 显示 -44,042 | `spin-draw-summary.test.ts` → `用例#19-A-③` | ❌ |
| 19 | B-① | 列表显示 1 行且 Total 1 | `spin-draw-summary.test.ts` → `用例#19-B-①` | ✅ |
| 19 | B-② | 表头依次为 P&L / RTP / Details / Dismantle / Top Spending Room | `spin-draw-summary.test.ts` → `用例#19-B-②` | ❌ |
| 19 | B-③ | P&L 显示 68,766 | `spin-draw-summary.test.ts` → `用例#19-B-③` | ❌ |
| 19 | C-① | 列表显示 1 行且 Total 1 | `spin-draw-summary.test.ts` → `用例#19-C-①` | ✅ |
| 19 | C-② | 表头依次为 P&L / RTP / Details / Dismantle / Top Spending Room | `spin-draw-summary.test.ts` → `用例#19-C-②` | ❌ |
| 19 | C-③ | P&L 显示 -48,804 | `spin-draw-summary.test.ts` → `用例#19-C-③` | ❌ |
| 21 | ① | P&L 显示 -44,042 | `spin-draw-summary.test.ts` → `用例#21-①` | ❌ |
| 21 | ② | P&L 等于抽奖盈亏加翻倍盈亏加神灯奖励 | `spin-draw-summary.test.ts` → `用例#21-②` | ✅ |
| 22 | ① | RTP 显示 90.57% | `spin-draw-summary.test.ts` → `用例#22-①` | ✅ |
| 22 | ② | RTP 按 [1+P&L/抽奖投入] 计算并保留两位百分比 | `spin-draw-summary.test.ts` → `用例#22-②` | ✅ |
| 23 | ① | Aladdin 段显示 input：466,800；output：437,612（93.75%） | `spin-draw-summary.test.ts` → `用例#23-①` | ❌ |
| 23 | ② | Multiplier 段显示 input：218,574；output：183,264（83.85%） | `spin-draw-summary.test.ts` → `用例#23-②` | ❌ |
| 23 | ③ | Magic Lamp 段显示 20,456 | `spin-draw-summary.test.ts` → `用例#23-③` | ❌ |
| 24 | ① | Dismantle 显示 317,189（67.95%） | `spin-draw-summary.test.ts` → `用例#24-①` | ❌ |
| 24 | ② | Dismantle 金额占抽奖投入 67.95% | `spin-draw-summary.test.ts` → `用例#24-②` | ✅ |
| 29 | ① | 房间依次显示 ID=10100458: 278,400、ID=10101463: 140,000、ID=10100663: 48,400 | `spin-draw-summary.test.ts` → `用例#29-①` | ❌ |
| 29 | ② | 单元格仅包含 3 个房间条目 | `spin-draw-summary.test.ts` → `用例#29-②` | ✅ |
| 29 | ③ | 三个房间金额按 278,400 > 140,000 > 48,400 降序 | `spin-draw-summary.test.ts` → `用例#29-③` | ✅ |
| 31 | ① | Top Spending Room 仅显示 10 个房间条目 | `spin-draw-summary.test.ts` → `用例#31-①` | ✅ |
| 31 | ② | 10 个条目金额依次为 22,500、2,700、2,100、900、600、600、600、600、600、300 | `spin-draw-summary.test.ts` → `用例#31-②` | ❌ |
| 31 | ③ | 每个条目均显示 ID=房间ID: 金额 | `spin-draw-summary.test.ts` → `用例#31-③` | ✅ |
| 33 | ① | P&L 显示 68,766 且等于五个有数据日期合计 | `spin-draw-summary.test.ts` → `用例#33-①` | ❌ |
| 33 | ② | Aladdin 与 Magic Lamp 显示区间合计 | `spin-draw-summary.test.ts` → `用例#33-②` | ❌ |
| 33 | ③ | Multiplier 与 Dismantle 显示区间合计 | `spin-draw-summary.test.ts` → `用例#33-③` | ❌ |
| 33 | ④ | RTP 显示 102.31% 且按区间合计计算 | `spin-draw-summary.test.ts` → `用例#33-④` | ✅ |
| 35 | A-① | 列表显示 1 行且 Total 1 | `spin-draw-summary.test.ts` → `用例#35-A-①` | ✅ |
| 35 | A-② | P&L 显示 0 且 RTP 显示 - | `spin-draw-summary.test.ts` → `用例#35-A-②` | ❌ |
| 35 | A-③ | Aladdin 与 Multiplier 显示 input：0；output：0（-），Magic Lamp 显示 0 | `spin-draw-summary.test.ts` → `用例#35-A-③` | ❌ |
| 35 | A-④ | Dismantle 显示 0（-）且无房间条目 | `spin-draw-summary.test.ts` → `用例#35-A-④` | ❌ |
| 35 | B-① | 列表显示 1 行且 Total 1 | `spin-draw-summary.test.ts` → `用例#35-B-①` | ✅ |
| 35 | B-② | P&L 显示 0 且 RTP 显示 - | `spin-draw-summary.test.ts` → `用例#35-B-②` | ❌ |
| 35 | B-③ | Aladdin 与 Multiplier 显示 input：0；output：0（-），Magic Lamp 显示 0 | `spin-draw-summary.test.ts` → `用例#35-B-③` | ❌ |
| 35 | B-④ | Dismantle 显示 0（-）且无房间条目 | `spin-draw-summary.test.ts` → `用例#35-B-④` | ❌ |
| 46 | ① | P&L、Aladdin、Magic Lamp 金额均带千分位 | `spin-draw-summary.test.ts` → `用例#46-①` | ❌ |
| 46 | ② | Multiplier 与 Dismantle 金额均带千分位 | `spin-draw-summary.test.ts` → `用例#46-②` | ❌ |
| 46 | ③ | 所有比例两位小数带 % | `spin-draw-summary.test.ts` → `用例#46-③` | ✅ |
| 46 | ④ | Top Spending Room 金额均带千分位 | `spin-draw-summary.test.ts` → `用例#46-④` | ❌ |
| 20 | A-① | 列表显示 1 行且 Total 1 | `spin-draw-daily.test.ts` → `用例#20-A-①` | ✅ |
| 20 | A-② | 表头依次为 Date / P&L / RTP / Details / Dismantle / Top Spending Room | `spin-draw-daily.test.ts` → `用例#20-A-②` | ❌ |
| 20 | A-③ | Date 依次为 2026-11-08 | `spin-draw-daily.test.ts` → `用例#20-A-③` | ✅ |
| 20 | B-① | 列表显示 5 行且 Total 5 | `spin-draw-daily.test.ts` → `用例#20-B-①` | ✅ |
| 20 | B-② | 表头依次为 Date / P&L / RTP / Details / Dismantle / Top Spending Room | `spin-draw-daily.test.ts` → `用例#20-B-②` | ❌ |
| 20 | B-③ | Date 依次为 2026-11-02、2026-11-03、2026-11-04、2026-11-05、2026-11-08 | `spin-draw-daily.test.ts` → `用例#20-B-③` | ✅ |
| 20 | C-① | 列表显示 3 行且 Total 3 | `spin-draw-daily.test.ts` → `用例#20-C-①` | ✅ |
| 20 | C-② | 表头依次为 Date / P&L / RTP / Details / Dismantle / Top Spending Room | `spin-draw-daily.test.ts` → `用例#20-C-②` | ❌ |
| 20 | C-③ | Date 依次为 2026-10-31、2026-11-01、2026-11-02 | `spin-draw-daily.test.ts` → `用例#20-C-③` | ✅ |
| 25 | ① | 结果仅 1 行且 Date 显示 2026-11-08 | `spin-draw-daily.test.ts` → `用例#25-①` | ✅ |
| 25 | ② | P&L 显示 -44,042 | `spin-draw-daily.test.ts` → `用例#25-②` | ❌ |
| 25 | ③ | P&L 等于抽奖盈亏加翻倍盈亏加神灯奖励 | `spin-draw-daily.test.ts` → `用例#25-③` | ✅ |
| 26 | ① | 结果仅 1 行且 Date 显示 2026-11-08 | `spin-draw-daily.test.ts` → `用例#26-①` | ✅ |
| 26 | ② | RTP 显示 90.57% | `spin-draw-daily.test.ts` → `用例#26-②` | ✅ |
| 26 | ③ | RTP 按 [1+P&L/抽奖投入] 计算并保留两位百分比 | `spin-draw-daily.test.ts` → `用例#26-③` | ✅ |
| 27 | ① | 结果仅 1 行且 Date 显示 2026-11-08 | `spin-draw-daily.test.ts` → `用例#27-①` | ✅ |
| 27 | ② | Aladdin 段显示 input：466,800；output：437,612（93.75%） | `spin-draw-daily.test.ts` → `用例#27-②` | ❌ |
| 27 | ③ | Multiplier 段显示 input：218,574；output：183,264（83.85%） | `spin-draw-daily.test.ts` → `用例#27-③` | ❌ |
| 27 | ④ | Magic Lamp 段显示 20,456 | `spin-draw-daily.test.ts` → `用例#27-④` | ❌ |
| 28 | ① | 结果仅 1 行且 Date 显示 2026-11-08 | `spin-draw-daily.test.ts` → `用例#28-①` | ✅ |
| 28 | ② | Dismantle 显示 317,189（67.95%） | `spin-draw-daily.test.ts` → `用例#28-②` | ❌ |
| 28 | ③ | Dismantle 金额占抽奖投入 67.95% | `spin-draw-daily.test.ts` → `用例#28-③` | ✅ |
| 30 | ① | 结果仅 1 行且 Date 显示 2026-11-08 | `spin-draw-daily.test.ts` → `用例#30-①` | ✅ |
| 30 | ② | 房间依次显示 ID=10100458: 278,400、ID=10101463: 140,000、ID=10100663: 48,400 | `spin-draw-daily.test.ts` → `用例#30-②` | ❌ |
| 30 | ③ | 单元格仅包含 3 个房间条目 | `spin-draw-daily.test.ts` → `用例#30-③` | ✅ |
| 30 | ④ | 三个房间金额按 278,400 > 140,000 > 48,400 降序 | `spin-draw-daily.test.ts` → `用例#30-④` | ✅ |
| 32 | ① | 结果仅 1 行且 Date 显示 2026-10-02 | `spin-draw-daily.test.ts` → `用例#32-①` | ✅ |
| 32 | ② | Top Spending Room 仅显示 10 个房间条目 | `spin-draw-daily.test.ts` → `用例#32-②` | ✅ |
| 32 | ③ | 10 个条目金额依次为 22,500、2,700、2,100、900、600、600、600、600、600、300 | `spin-draw-daily.test.ts` → `用例#32-③` | ❌ |
| 32 | ④ | 每个条目均显示 ID=房间ID: 金额 | `spin-draw-daily.test.ts` → `用例#32-④` | ✅ |
| 34 | ① | 列表仅显示 2026-11-02、2026-11-03、2026-11-04、2026-11-05、2026-11-08 5 行 | `spin-draw-daily.test.ts` → `用例#34-①` | ✅ |
| 34 | ② | 五行 P&L 分别为 27,352、57,705、40,269、-12,518、-44,042 且合计 68,766 | `spin-draw-daily.test.ts` → `用例#34-②` | ✅ |
| 34 | ③ | Aladdin input 合计 2,978,230、output 合计 3,028,238，Magic Lamp 合计 128,197 | `spin-draw-daily.test.ts` → `用例#34-③` | ✅ |
| 34 | ④ | Multiplier input 合计 1,558,611、output 合计 1,449,172，Dismantle 合计 2,021,059 | `spin-draw-daily.test.ts` → `用例#34-④` | ✅ |
| 36 | A-① | 结果区显示「暂无数据」 | `spin-draw-daily.test.ts` → `用例#36-A-①` | ✅ |
| 36 | A-② | 分页显示 Total 0 且结果表无数据行 | `spin-draw-daily.test.ts` → `用例#36-A-②` | ✅ |
| 36 | A-③ | 上一页与下一页按钮均为禁用态 | `spin-draw-daily.test.ts` → `用例#36-A-③` | ✅ |
| 36 | B-① | 结果区显示「暂无数据」 | `spin-draw-daily.test.ts` → `用例#36-B-①` | ✅ |
| 36 | B-② | 分页显示 Total 0 且结果表无数据行 | `spin-draw-daily.test.ts` → `用例#36-B-②` | ✅ |
| 36 | B-③ | 上一页与下一页按钮均为禁用态 | `spin-draw-daily.test.ts` → `用例#36-B-③` | ✅ |
| 47 | ① | 2026-11-04 行 Aladdin 显示 input：1,052,800；output：1,082,920（102.86%） | `spin-draw-daily.test.ts` → `用例#47-①` | ❌ |
| 47 | ② | 2026-11-05 行 Multiplier 比例显示 80.90% | `spin-draw-daily.test.ts` → `用例#47-②` | ❌ |
| 47 | ③ | 四行 RTP 依次显示 117.27%、106.56%、103.82%、97.03% | `spin-draw-daily.test.ts` → `用例#47-③` | ✅ |
| 47 | ④ | 四行 Dismantle 比例与金额显示 | `spin-draw-daily.test.ts` → `用例#47-④` | ❌ |
| 37 | ① | 开始日期、结束日期、用户ID三个输入框均为空 | `spin-draw-reset-loading-pagination.test.ts` → `用例#37-①` | ✅ |
| 37 | ② | Toast 提示「已重置查询条件」 | `spin-draw-reset-loading-pagination.test.ts` → `用例#37-②` | ✅ |
| 37 | ③ | 原查询结果被清空且分页显示 Total 0 | `spin-draw-reset-loading-pagination.test.ts` → `用例#37-③` | ✅ |
| 37 | ④ | 结果区显示「请输入查询条件后查看数据」 | `spin-draw-reset-loading-pagination.test.ts` → `用例#37-④` | ✅ |
| 38 | ① | 开始日期、结束日期、用户ID三个输入框均为空 | `spin-draw-reset-loading-pagination.test.ts` → `用例#38-①` | ✅ |
| 38 | ② | Toast 提示「已重置查询条件」 | `spin-draw-reset-loading-pagination.test.ts` → `用例#38-②` | ✅ |
| 38 | ③ | 原查询结果被清空且分页显示 Total 0 | `spin-draw-reset-loading-pagination.test.ts` → `用例#38-③` | ✅ |
| 38 | ④ | 结果区显示「请输入查询条件后查看数据」 | `spin-draw-reset-loading-pagination.test.ts` → `用例#38-④` | ✅ |
| 39 | ① | 点击查询后结果区出现加载遮罩 | `spin-draw-reset-loading-pagination.test.ts` → `用例#39-①` | ✅ |
| 39 | ② | 加载结束后遮罩消失 | `spin-draw-reset-loading-pagination.test.ts` → `用例#39-②` | ✅ |
| 39 | ③ | 遮罩消失后显示 1 行结果且查询条件保持 | `spin-draw-reset-loading-pagination.test.ts` → `用例#39-③` | ✅ |
| 40 | ① | 点击查询后结果区出现加载遮罩 | `spin-draw-reset-loading-pagination.test.ts` → `用例#40-①` | ✅ |
| 40 | ② | 加载结束后遮罩消失 | `spin-draw-reset-loading-pagination.test.ts` → `用例#40-②` | ✅ |
| 40 | ③ | 遮罩消失后显示 1 行结果且查询条件保持 | `spin-draw-reset-loading-pagination.test.ts` → `用例#40-③` | ✅ |
| 43 | ① | 首次查询 Total 25，第 1 页 20 行且日期 2026-10-15～2026-11-03 | `spin-draw-reset-loading-pagination.test.ts` → `用例#43-①` | ✅ |
| 43 | ② | 下一页第 2 页 5 行且日期 2026-11-04～2026-11-08 | `spin-draw-reset-loading-pagination.test.ts` → `用例#43-②` | ✅ |
| 43 | ③ | 上一页回到第 1 页并重新显示 20 行 | `spin-draw-reset-loading-pagination.test.ts` → `用例#43-③` | ✅ |
| 44 | ① | 分页大小显示 10/page 且 Total 25 不变 | `spin-draw-reset-loading-pagination.test.ts` → `用例#44-①` | ✅ |
| 44 | ② | 当前为第 1 页且显示 10 行，Date 从 2026-10-15 至 2026-10-24 | `spin-draw-reset-loading-pagination.test.ts` → `用例#44-②` | ✅ |
| 44 | ③ | 页码显示 1、2、3，页码 1 选中，上一页禁用、下一页可用 | `spin-draw-reset-loading-pagination.test.ts` → `用例#44-③` | ✅ |
| 45 | ① | 页码 2 呈选中态 | `spin-draw-reset-loading-pagination.test.ts` → `用例#45-①` | ✅ |
| 45 | ② | 第 2 页显示 5 行，Date 依次为 2026-11-04～2026-11-08 | `spin-draw-reset-loading-pagination.test.ts` → `用例#45-②` | ✅ |
| 45 | ③ | Total 25 不变，上一页可用、下一页禁用 | `spin-draw-reset-loading-pagination.test.ts` → `用例#45-③` | ✅ |

## 3. 未通过检查点证据摘要

| 用例# | 检查点 | 期望 | 实际 |
| --- | --- | --- | --- |
| 11 | ① | 请输入正确的用户ID | 查询完成，共 1 条 |
| 11 | ② | 0 行\|Total 0\|请输入查询条件后查看数据 | 1 行\|Total 1\| |
| 11 | ③ | 请输入查询条件后查看数据\|Total 0 | \|Total 1 |
| 12 | ① | 请输入正确的用户ID | 查询完成，共 1 条 |
| 12 | ② | 0 行\|Total 0\|请输入查询条件后查看数据 | 1 行\|Total 1\| |
| 12 | ③ | 请输入查询条件后查看数据\|Total 0 | \|Total 1 |
| 13 | ① | 请输入正确的用户ID | 查询完成，共 1 条 |
| 13 | ② | 0 行\|Total 0\|请输入查询条件后查看数据 | 1 行\|Total 1\| |
| 13 | ③ | 请输入查询条件后查看数据\|Total 0 | \|Total 1 |
| 14 | ① | 请输入正确的用户ID | 查询完成，共 1 条 |
| 14 | ② | 0 行\|Total 0\|请输入查询条件后查看数据 | 1 行\|Total 1\| |
| 14 | ③ | 请输入查询条件后查看数据\|Total 0 | \|Total 1 |
| 15 | ① | 请输入正确的用户ID | 查询完成，共 0 条 |
| 15 | ② | 0 行\|Total 0\|请输入查询条件后查看数据 | 0 行\|Total 0\|暂无数据 |
| 15 | ③ | 请输入查询条件后查看数据\|Total 0 | 暂无数据\|Total 0 |
| 16 | ① | 请输入正确的用户ID | 查询完成，共 0 条 |
| 16 | ② | 0 行\|Total 0\|请输入查询条件后查看数据 | 0 行\|Total 0\|暂无数据 |
| 16 | ③ | 请输入查询条件后查看数据\|Total 0 | 暂无数据\|Total 0 |
| 17 | ① | 请输入正确的用户ID | 查询完成，共 0 条 |
| 17 | ② | 0 行\|Total 0\|请输入查询条件后查看数据 | 0 行\|Total 0\|暂无数据 |
| 17 | ③ | 请输入查询条件后查看数据\|Total 0 | 暂无数据\|Total 0 |
| 18 | ① | 请输入正确的用户ID | 查询完成，共 1 条 |
| 18 | ② | 0 行\|Total 0\|请输入查询条件后查看数据 | 1 行\|Total 1\| |
| 18 | ③ | 请输入查询条件后查看数据\|Total 0 | \|Total 1 |
| 19 | A-② | P&L / RTP / Details / Dismantle / Top Spending Room | pl_amt / rtp / details / dismantle / top_spending_room |
| 19 | A-③ | -44,042 | -44042 |
| 19 | B-② | P&L / RTP / Details / Dismantle / Top Spending Room | pl_amt / rtp / details / dismantle / top_spending_room |
| 19 | B-③ | 68,766 | 68766 |
| 19 | C-② | P&L / RTP / Details / Dismantle / Top Spending Room | pl_amt / rtp / details / dismantle / top_spending_room |
| 19 | C-③ | -48,804 | -48804 |
| 21 | ① | -44,042 | -44042 |
| 23 | ① | input：466,800；output：437,612（93.75%） | input：466800；output：437612（93.75%） |
| 23 | ② | input：218,574；output：183,264（83.85%） | input：218574；output：183264（83.85%） |
| 23 | ③ | 20,456 | 20456 |
| 24 | ① | 317,189（67.95%） | 317189（67.95%） |
| 29 | ① | ID=10100458: 278,400；ID=10101463: 140,000；ID=10100663: 48,400 | ID=10100458: 278400；ID=10101463: 140000；ID=10100663: 48400 |
| 31 | ② | 22,500、2,700、2,100、900、600、600、600、600、600、300 | 22500、2700、2100、900、600、600、600、600、600、300 |
| 33 | ① | 68,766 | 68766 |
| 33 | ② | input：2,978,230；output：3,028,238（101.68%）；Magic Lamp：128,197 | input：2978230；output：3028238（101.68%）；Magic Lamp：128197 |
| 33 | ③ | input：1,558,611；output：1,449,172（92.98%）；Dismantle：2,021,059（67.86%） | input：1558611；output：1449172（92.98%）；Dismantle：2021059（67.86%） |
| 35 | A-② | P&L=0；RTP=- | P&L=-；RTP=- |
| 35 | A-③ | Aladdin=input：0；output：0（-）；Multiplier=input：0；output：0（-）；Magic Lamp=0 | Aladdin=null；Multiplier=null；Magic Lamp=null |
| 35 | A-④ | Dismantle=0（-）；房间条目=0 | Dismantle=-；房间条目=0 |
| 35 | B-② | P&L=0；RTP=- | P&L=-；RTP=- |
| 35 | B-③ | Aladdin=input：0；output：0（-）；Multiplier=input：0；output：0（-）；Magic Lamp=0 | Aladdin=null；Multiplier=null；Magic Lamp=null |
| 35 | B-④ | Dismantle=0（-）；房间条目=0 | Dismantle=-；房间条目=0 |
| 46 | ① | P&L=-44,042；Aladdin input：466,800；output：437,612；Magic Lamp=20,456 | P&L=-44042；Aladdin input：466800；output：437612；Magic Lamp=20456 |
| 46 | ② | Multiplier input：218,574；output：183,264；Dismantle=317,189 | Multiplier input：218574；output：183264；Dismantle=317189（67.95%） |
| 46 | ④ | 278,400、140,000、48,400 | 278400、140000、48400 |
| 20 | A-② | Date / P&L / RTP / Details / Dismantle / Top Spending Room | dt / pl_amt / rtp / details / dismantle / top_spending_room |
| 20 | B-② | Date / P&L / RTP / Details / Dismantle / Top Spending Room | dt / pl_amt / rtp / details / dismantle / top_spending_room |
| 20 | C-② | Date / P&L / RTP / Details / Dismantle / Top Spending Room | dt / pl_amt / rtp / details / dismantle / top_spending_room |
| 25 | ② | -44,042 | -44042 |
| 27 | ② | input：466,800；output：437,612（93.75%） | input：466800；output：437612（93.75%） |
| 27 | ③ | input：218,574；output：183,264（83.85%） | input：218574；output：183264（83.85%） |
| 27 | ④ | 20,456 | 20456 |
| 28 | ② | 317,189（67.95%） | 317189（67.95%） |
| 30 | ② | ID=10100458: 278,400；ID=10101463: 140,000；ID=10100663: 48,400 | ID=10100458: 278400；ID=10101463: 140000；ID=10100663: 48400 |
| 32 | ③ | 22,500、2,700、2,100、900、600、600、600、600、600、300 | 22500、2700、2100、900、600、600、600、600、600、300 |
| 47 | ① | input：1,052,800；output：1,082,920（102.86%） | input：1052800；output：1082920（102.86%） |
| 47 | ② | 80.90% | 80.9% |
| 47 | ④ | 62.54%/99,066、75.29%/661,827、64.75%/681,644、62.04%/261,333 | 62.54%/99066、75.29%/661827、64.75%/681644、62.04%/261333 |

## 4. 反向核对说明

- 代码中每个 `uiCheck` 的标题均以 `用例#N-检查点` 开头；本文件第 2 节列出全部 173 个 check，与用例检查点集合一致。
- 参数化数据行（#19/#20 各 3 行、#35/#36 各 2 行）按 `A-①`、`B-①` 形式逐行展开，行数×检查点数与用例定义一致。
- 公式类检查点（#21-②、#22-②、#24-②、#25-③、#26-③、#28-③）按页面显示值重算并与预期数值比对；展示格式类检查点（#23、#27、#29、#31、#33、#46、#47 等）按页面原始文本精确比对。

## 5. 自测红证抽查

- 对象：P0 用例 #26-②「RTP 显示 90.57%」。
- 操作：临时将期望值改为 `90.58%` 后运行 `spin-draw-daily.test.ts`，对应 check 失败（expect=90.58%，real=90.57%），失败数由 13 增至 14；恢复为 `90.57%` 后重新运行，失败数恢复 13。
- 结论：断言非永真，红证抽查通过；恢复后的代码为最终交付版本。
