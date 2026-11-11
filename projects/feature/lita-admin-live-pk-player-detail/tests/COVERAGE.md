# COVERAGE — Admin 直播PK场次数据（项目 3718）

- 定稿来源：本轮正式执行日志（121 个 check 实际执行）
- 用例来源：/task/20261111/TK-0209/HANDOFF；技术方案：/task/20261111/TK-0209/TECH_DESIGN
- 正式执行：2026-11-11 22:37~23:02（提测 54「进行中」）；缺陷 #313（表头二级结构）、#314（导出空值占位）
- 双向核对：下表每一行对应代码中一个 check；代码中每个 check 均可在下表找到（正向无漏验、反向无私增）

| 用例# | 检查点 | check 标记（代码） | 脚本 | 结果 | 用例级结论 |
|---|---|---|---|---|---|
| 1 | ① 「直播相关数据」子菜单中可见「直播PK场次数据」菜单项 | `用例#1-① 「直播相关数据」子菜单中可见「直播PK场次数据」菜单项` | tc01-entry.test.ts | 通过 | 通过 |
| 1 | ② 地址栏路由为 #/data-stats-manager/live-data/live-pk-player-detail | `用例#1-② 地址栏路由为 #/data-stats-manager/live-data/live-pk-player-detail` | tc01-entry.test.ts | 通过 | 通过 |
| 1 | ③ 页内标题显示「PK模式陪玩师明细」 | `用例#1-③ 页内标题显示「PK模式陪玩师明细」` | tc01-entry.test.ts | 通过 | 通过 |
| 1 | ④ 筛选区显示 5 个筛选项 | `用例#1-④ 筛选区显示 5 个筛选项` | tc01-entry.test.ts | 通过 | 通过 |
| 1 | ⑤ 筛选项标签依次为 开始日期*、结束日期*、大区、陪玩师ID、陪玩师NO | `用例#1-⑤ 筛选项标签依次为 开始日期*、结束日期*、大区、陪玩师ID、陪玩师NO` | tc01-entry.test.ts | 通过 | 通过 |
| 1 | ⑥ 「查询」「重置」「导出报表」三个按钮可见 | `用例#1-⑥ 「查询」「重置」「导出报表」三个按钮可见` | tc01-entry.test.ts | 通过 | 通过 |
| 1 | ⑦ 表格区显示「请输入查询条件后查看数据」 | `用例#1-⑦ 表格区显示「请输入查询条件后查看数据」` | tc01-entry.test.ts | 通过 | 通过 |
| 1 | ⑧ 分页显示 Total 0 | `用例#1-⑧ 分页显示 Total 0` | tc01-entry.test.ts | 通过 | 通过 |
| 2 | ① 「直播相关数据」子菜单中不显示「直播PK场次数据」菜单项 | `用例#2-① 「直播相关数据」子菜单中不显示「直播PK场次数据」菜单项` | tc01-entry.test.ts | 通过 | 通过 |
| 2 | ② 「单次开播时长」「周榜单数据」「直播间日数据」「直播间流水」菜单项可见 | `用例#2-② 「单次开播时长」「周榜单数据」「直播间日数据」「直播间流水」菜单项可见` | tc01-entry.test.ts | 通过 | 通过 |
| 2 | ③ 进入「单次开播时长」路由 #/data-stats-manager/live-data/single-live-duration | `用例#2-③ 进入「单次开播时长」路由 #/data-stats-manager/live-data/single-live-duration` | tc01-entry.test.ts | 通过 | 通过 |
| 3 | ① 页面不渲染「PK模式陪玩师明细」报表内容（无筛选区/无数据表格） | `用例#3-① 页面不渲染「PK模式陪玩师明细」报表内容（无筛选区/无数据表格）` | tc01-entry.test.ts | 通过 | 通过 |
| 3 | ② 页面不显示任何报表数据行 | `用例#3-② 页面不显示任何报表数据行` | tc01-entry.test.ts | 通过 | 通过 |
| 3 | ③ 「直播相关数据」子菜单中不显示「直播PK场次数据」 | `用例#3-③ 「直播相关数据」子菜单中不显示「直播PK场次数据」` | tc01-entry.test.ts | 通过 | 通过 |
| 4 | ① 出现提示「请选择开始日期」 | `用例#4-① 出现提示「请选择开始日期」` | tc02-filter.test.ts | 通过 | 通过 |
| 4 | ② 表格区保持「请输入查询条件后查看数据」 | `用例#4-② 表格区保持「请输入查询条件后查看数据」` | tc02-filter.test.ts | 通过 | 通过 |
| 4 | ③ 表格无数据行 | `用例#4-③ 表格无数据行` | tc02-filter.test.ts | 通过 | 通过 |
| 4 | ④ 分页显示 Total 0 | `用例#4-④ 分页显示 Total 0` | tc02-filter.test.ts | 通过 | 通过 |
| 4 | ⑤ 未发起查询：无查询请求、无 loading、无「查询完成」提示 | `用例#4-⑤ 未发起查询：无查询请求、无 loading、无「查询完成」提示` | tc02-filter.test.ts | 通过 | 通过 |
| 5 | ① 出现提示「请选择结束日期」 | `用例#5-① 出现提示「请选择结束日期」` | tc02-filter.test.ts | 通过 | 通过 |
| 5 | ② 表格区保持「请输入查询条件后查看数据」 | `用例#5-② 表格区保持「请输入查询条件后查看数据」` | tc02-filter.test.ts | 通过 | 通过 |
| 5 | ③ 表格无数据行 | `用例#5-③ 表格无数据行` | tc02-filter.test.ts | 通过 | 通过 |
| 5 | ④ 分页显示 Total 0 | `用例#5-④ 分页显示 Total 0` | tc02-filter.test.ts | 通过 | 通过 |
| 5 | ⑤ 未发起查询：无查询请求、无 loading、无「查询完成」提示 | `用例#5-⑤ 未发起查询：无查询请求、无 loading、无「查询完成」提示` | tc02-filter.test.ts | 通过 | 通过 |
| 6 | ①[D1] 出现提示「查询完成，共 33 条」 | `用例#6-①[D1] 出现提示「查询完成，共 33 条」` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ①[D2] 出现提示「查询完成，共 33 条」 | `用例#6-①[D2] 出现提示「查询完成，共 33 条」` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ②[D1] 分页显示 Total 33 | `用例#6-②[D1] 分页显示 Total 33` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ②[D2] 分页显示 Total 33 | `用例#6-②[D2] 分页显示 Total 33` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ③[D1] 四页合计 33 行数据 | `用例#6-③[D1] 四页合计 33 行数据` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ③[D2] 四页合计 33 行数据 | `用例#6-③[D2] 四页合计 33 行数据` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ④[D1] 日期分布 11-02=12、11-04=2、11-05=5、11-10=14 | `用例#6-④[D1] 日期分布 11-02=12、11-04=2、11-05=5、11-10=14` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ④[D2] 日期分布 11-02=12、11-04=2、11-05=5、11-10=14 | `用例#6-④[D2] 日期分布 11-02=12、11-04=2、11-05=5、11-10=14` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ⑤[D1] 全部数据按 date、pk id、pk rank 升序排列 | `用例#6-⑤[D1] 全部数据按 date、pk id、pk rank 升序排列` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ⑤[D2] 全部数据按 date、pk id、pk rank 升序排列 | `用例#6-⑤[D2] 全部数据按 date、pk id、pk rank 升序排列` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ⑥[D1] pk id=227 两行依次为 rank1/Aurynnnnn、rank2/🎡꯴𝜗Ordin 🐉 | `用例#6-⑥[D1] pk id=227 两行依次为 rank1/Aurynnnnn、rank2/🎡꯴𝜗Ordin 🐉` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ⑥[D2] pk id=227 两行依次为 rank1/Aurynnnnn、rank2/🎡꯴𝜗Ordin 🐉 | `用例#6-⑥[D2] pk id=227 两行依次为 rank1/Aurynnnnn、rank2/🎡꯴𝜗Ordin 🐉` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ⑦[D1] 首行 date=2026-11-02、pk id=227、pk rank=1 | `用例#6-⑦[D1] 首行 date=2026-11-02、pk id=227、pk rank=1` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ⑦[D2] 首行 date=2026-11-02、pk id=227、pk rank=1 | `用例#6-⑦[D2] 首行 date=2026-11-02、pk id=227、pk rank=1` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ⑧[D1] 末行 date=2026-11-10、pk id=256、pk rank=2 | `用例#6-⑧[D1] 末行 date=2026-11-10、pk id=256、pk rank=2` | tc03-query.test.ts | 通过 | 通过 |
| 6 | ⑧[D2] 末行 date=2026-11-10、pk id=256、pk rank=2 | `用例#6-⑧[D2] 末行 date=2026-11-10、pk id=256、pk rank=2` | tc03-query.test.ts | 通过 | 通过 |
| 7 | ① 出现提示「查询完成，共 14 条」 | `用例#7-① 出现提示「查询完成，共 14 条」` | tc03-query.test.ts | 通过 | 通过 |
| 7 | ② 分页显示 Total 14 | `用例#7-② 分页显示 Total 14` | tc03-query.test.ts | 通过 | 通过 |
| 7 | ③ 第 1 页 10 行、第 2 页 4 行 | `用例#7-③ 第 1 页 10 行、第 2 页 4 行` | tc03-query.test.ts | 通过 | 通过 |
| 7 | ④ 14 行 date 列均显示 2026-11-10 | `用例#7-④ 14 行 date 列均显示 2026-11-10` | tc03-query.test.ts | 通过 | 通过 |
| 7 | ⑤ 首行 pk id=247、pk rank=1、player_nick=cc⁰⁷⁰⁷ | `用例#7-⑤ 首行 pk id=247、pk rank=1、player_nick=cc⁰⁷⁰⁷` | tc03-query.test.ts | 通过 | 通过 |
| 7 | ⑥ 末行 pk id=256、pk rank=2、player_nick=ᴷᵒˢ Nickolas🎶 | `用例#7-⑥ 末行 pk id=256、pk rank=2、player_nick=ᴷᵒˢ Nickolas🎶` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ①[D1] 出现提示「查询完成，共 3 条」 | `用例#8-①[D1] 出现提示「查询完成，共 3 条」` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ①[D2] 出现提示「查询完成，共 3 条」 | `用例#8-①[D2] 出现提示「查询完成，共 3 条」` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ①[D3] 出现提示「查询完成，共 8 条」 | `用例#8-①[D3] 出现提示「查询完成，共 8 条」` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ①[D4] 出现提示「查询完成，共 8 条」 | `用例#8-①[D4] 出现提示「查询完成，共 8 条」` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ②[D1] 分页显示 Total 3 | `用例#8-②[D1] 分页显示 Total 3` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ②[D2] 分页显示 Total 3 | `用例#8-②[D2] 分页显示 Total 3` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ②[D3] 分页显示 Total 8 | `用例#8-②[D3] 分页显示 Total 8` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ②[D4] 分页显示 Total 8 | `用例#8-②[D4] 分页显示 Total 8` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ③[D1] 列表显示 3 行数据 | `用例#8-③[D1] 列表显示 3 行数据` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ③[D2] 列表显示 3 行数据 | `用例#8-③[D2] 列表显示 3 行数据` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ③[D3] 列表显示 8 行数据 | `用例#8-③[D3] 列表显示 8 行数据` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ③[D4] 列表显示 8 行数据 | `用例#8-③[D4] 列表显示 8 行数据` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ④[D1] 所有数据行第 3 列满足数据行列值约定 | `用例#8-④[D1] 所有数据行第 3 列满足数据行列值约定` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ④[D2] 所有数据行第 4 列满足数据行列值约定 | `用例#8-④[D2] 所有数据行第 4 列满足数据行列值约定` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ④[D3] 所有数据行第 3 列满足数据行列值约定 | `用例#8-④[D3] 所有数据行第 3 列满足数据行列值约定` | tc03-query.test.ts | 通过 | 通过 |
| 8 | ④[D4] 所有数据行第 3 列满足数据行列值约定 | `用例#8-④[D4] 所有数据行第 3 列满足数据行列值约定` | tc03-query.test.ts | 通过 | 通过 |
| 9 | ① 出现提示「查询完成，共 0 条」 | `用例#9-① 出现提示「查询完成，共 0 条」` | tc02-filter.test.ts | 通过 | 通过 |
| 9 | ② 表格显示空态文案「暂无数据」 | `用例#9-② 表格显示空态文案「暂无数据」` | tc02-filter.test.ts | 通过 | 通过 |
| 9 | ③ 表格无数据行 | `用例#9-③ 表格无数据行` | tc02-filter.test.ts | 通过 | 通过 |
| 9 | ④ 分页显示 Total 0 | `用例#9-④ 分页显示 Total 0` | tc02-filter.test.ts | 通过 | 通过 |
| 9 | ⑤ 页面无错误提示 | `用例#9-⑤ 页面无错误提示` | tc02-filter.test.ts | 通过 | 通过 |
| 10 | ① 出现提示「查询完成，共 0 条」 | `用例#10-① 出现提示「查询完成，共 0 条」` | tc02-filter.test.ts | 通过 | 通过 |
| 10 | ② 表格显示空态文案「暂无数据」 | `用例#10-② 表格显示空态文案「暂无数据」` | tc02-filter.test.ts | 通过 | 通过 |
| 10 | ③ 表格无数据行 | `用例#10-③ 表格无数据行` | tc02-filter.test.ts | 通过 | 通过 |
| 10 | ④ 分页显示 Total 0 | `用例#10-④ 分页显示 Total 0` | tc02-filter.test.ts | 通过 | 通过 |
| 10 | ⑤ 页面无错误提示 | `用例#10-⑤ 页面无错误提示` | tc02-filter.test.ts | 通过 | 通过 |
| 11 | ① 切换后分页显示 Total 33、页码 1~4 | `用例#11-① 切换后分页显示 Total 33、页码 1~4` | tc04-pagination-fields.test.ts | 通过 | 通过 |
| 11 | ② 第 1 页显示 10 行 | `用例#11-② 第 1 页显示 10 行` | tc04-pagination-fields.test.ts | 通过 | 通过 |
| 11 | ③ 第 2、3 页各显示 10 行 | `用例#11-③ 第 2、3 页各显示 10 行` | tc04-pagination-fields.test.ts | 通过 | 通过 |
| 11 | ④ 第 4 页显示 3 行 | `用例#11-④ 第 4 页显示 3 行` | tc04-pagination-fields.test.ts | 通过 | 通过 |
| 11 | ⑤ 四页 33 行按 date+pk id+player_id 无重复、无丢失 | `用例#11-⑤ 四页 33 行按 date+pk id+player_id 无重复、无丢失` | tc04-pagination-fields.test.ts | 通过 | 通过 |
| 11 | ⑥ 第 4 页 3 行 pk id 依次 255、256、256，pk rank 依次 2、1、2 | `用例#11-⑥ 第 4 页 3 行 pk id 依次 255、256、256，pk rank 依次 2、1、2` | tc04-pagination-fields.test.ts | 通过 | 通过 |
| 12 | ① 开始日期、结束日期恢复为空且显示 placeholder | `用例#12-① 开始日期、结束日期恢复为空且显示 placeholder` | tc02-filter.test.ts | 通过 | 通过 |
| 12 | ② 大区恢复未选且显示 placeholder 请选择大区 | `用例#12-② 大区恢复未选且显示 placeholder 请选择大区` | tc02-filter.test.ts | 通过 | 通过 |
| 12 | ③ 陪玩师ID、陪玩师NO 输入框为空 | `用例#12-③ 陪玩师ID、陪玩师NO 输入框为空` | tc02-filter.test.ts | 通过 | 通过 |
| 12 | ④ 表格数据清空并显示「请输入查询条件后查看数据」 | `用例#12-④ 表格数据清空并显示「请输入查询条件后查看数据」` | tc02-filter.test.ts | 通过 | 通过 |
| 12 | ⑤ 分页显示 Total 0 | `用例#12-⑤ 分页显示 Total 0` | tc02-filter.test.ts | 通过 | 通过 |
| 12 | ⑥ 重置后不自动查询（无请求、无 loading、无「查询完成」提示） | `用例#12-⑥ 重置后不自动查询（无请求、无 loading、无「查询完成」提示）` | tc02-filter.test.ts | 通过 | 通过 |
| 13 | ① 下载 .xlsx 文件且文件名包含「PK模式陪玩师明细」 | `用例#13-① 下载 .xlsx 文件且文件名包含「PK模式陪玩师明细」` | tc05-export.test.ts | 通过 | 未通过 |
| 13 | ② 文件共 35 行 × 21 列（2 行表头 + 33 行数据） | `用例#13-② 文件共 35 行 × 21 列（2 行表头 + 33 行数据）` | tc05-export.test.ts | 通过 | 未通过 |
| 13 | ③ 二级表头：Total PK Score 父表头下含 Taptap、giftsend coins 子表头，21 列完整 | `用例#13-③ 二级表头：Total PK Score 父表头下含 Taptap、giftsend coins 子表头，21 列完整` | tc05-export.test.ts | 通过 | 未通过 |
| 13 | ④ 首条数据行 date=2026-11-02、pk id=227、player_id=450400、pk rank=1 | `用例#13-④ 首条数据行 date=2026-11-02、pk id=227、player_id=450400、pk rank=1` | tc05-export.test.ts | 通过 | 未通过 |
| 13 | ⑤ 末条数据行 date=2026-11-10、pk id=256、player_id=20410529、pk rank=2 | `用例#13-⑤ 末条数据行 date=2026-11-10、pk id=256、player_id=20410529、pk rank=2` | tc05-export.test.ts | 通过 | 未通过 |
| 13 | ⑥ top 1 spender uid/no/nick 空值单元格与页面渲染一致（页面显示「-」） | `用例#13-⑥ top 1 spender uid/no/nick 空值单元格与页面渲染一致（页面显示「-」）` | tc05-export.test.ts | 未通过 | 未通过 |
| 14 | ① 表格表头共显示 21 列 | `用例#14-① 表格表头共显示 21 列` | tc04-pagination-fields.test.ts | 通过 | 未通过 |
| 14 | ② 21 个列名依次与约定完全一致 | `用例#14-② 21 个列名依次与约定完全一致` | tc04-pagination-fields.test.ts | 通过 | 未通过 |
| 14 | ③ Total PK Score 呈二级表头（父表头 + Taptap/giftsend coins 子表头） | `用例#14-③ Total PK Score 呈二级表头（父表头 + Taptap/giftsend coins 子表头）` | tc04-pagination-fields.test.ts | 未通过 | 未通过 |
| 14 | ④ player_role 列显示值仅为「发起者」或「参加者」 | `用例#14-④ player_role 列显示值仅为「发起者」或「参加者」` | tc04-pagination-fields.test.ts | 通过 | 未通过 |
| 14 | ⑤ 无原始异常列名（无 player_role_code、null/undefined 列名） | `用例#14-⑤ 无原始异常列名（无 player_role_code、null/undefined 列名）` | tc04-pagination-fields.test.ts | 通过 | 未通过 |
| 14 | ⑥ top 1 spender uid/no/nick 空值行显示「-」 | `用例#14-⑥ top 1 spender uid/no/nick 空值行显示「-」` | tc04-pagination-fields.test.ts | 通过 | 未通过 |
| 14 | ⑦ 页面无报错 | `用例#14-⑦ 页面无报错` | tc04-pagination-fields.test.ts | 通过 | 未通过 |
| 15 | ① 「直播相关数据」子菜单中可见「单次开播时长」菜单项 | `用例#15-① 「直播相关数据」子菜单中可见「单次开播时长」菜单项` | tc06-regression.test.ts | 通过 | 阻塞（环境/鉴权） |
| 15 | ② 地址栏路由为 #/data-stats-manager/live-data/single-live-duration | `用例#15-② 地址栏路由为 #/data-stats-manager/live-data/single-live-duration` | tc06-regression.test.ts | 通过 | 阻塞（环境/鉴权） |
| 15 | ③ 查询完成，页面无错误提示 | `用例#15-③ 查询完成，页面无错误提示` | tc06-regression.test.ts | 未通过 | 阻塞（环境/鉴权） |
| 15 | ④ 列表显示数据行或「No Data」空态且 Total 一致 | `用例#15-④ 列表显示数据行或「No Data」空态且 Total 一致` | tc06-regression.test.ts | 通过 | 阻塞（环境/鉴权） |
| 15 | ⑤ 点击「导出」触发文件下载，文件可正常打开 | `用例#15-⑤ 点击「导出」触发文件下载，文件可正常打开` | tc06-regression.test.ts | 未通过 | 阻塞（环境/鉴权） |
| 15 | ⑥ 文件表头列名与页面表格列名一致（Date、Locale、Room ID、User ID、Duration (h)） | `用例#15-⑥ 文件表头列名与页面表格列名一致（Date、Locale、Room ID、User ID、Duration (h)）` | tc06-regression.test.ts | 未通过 | 阻塞（环境/鉴权） |
| 16 | ① 「直播相关数据」子菜单中可见「周榜单数据」菜单项 | `用例#16-① 「直播相关数据」子菜单中可见「周榜单数据」菜单项` | tc06-regression.test.ts | 通过 | 阻塞（环境/鉴权） |
| 16 | ② 地址栏路由为 #/data-stats-manager/live-data/week-rank | `用例#16-② 地址栏路由为 #/data-stats-manager/live-data/week-rank` | tc06-regression.test.ts | 通过 | 阻塞（环境/鉴权） |
| 16 | ③ 查询完成，页面无错误提示 | `用例#16-③ 查询完成，页面无错误提示` | tc06-regression.test.ts | 未通过 | 阻塞（环境/鉴权） |
| 16 | ④ 列表显示数据行或「No Data」空态且 Total 一致 | `用例#16-④ 列表显示数据行或「No Data」空态且 Total 一致` | tc06-regression.test.ts | 通过 | 阻塞（环境/鉴权） |
| 16 | ⑤ 点击「导出」触发文件下载，文件可正常打开 | `用例#16-⑤ 点击「导出」触发文件下载，文件可正常打开` | tc06-regression.test.ts | 未通过 | 阻塞（环境/鉴权） |
| 16 | ⑥ 文件表头列名与页面表格列名一致（Event Type、Week、Locale、Room ID、Score） | `用例#16-⑥ 文件表头列名与页面表格列名一致（Event Type、Week、Locale、Room ID、Score）` | tc06-regression.test.ts | 未通过 | 阻塞（环境/鉴权） |
| 17 | ① 「直播相关数据」子菜单中可见「直播间日数据」菜单项 | `用例#17-① 「直播相关数据」子菜单中可见「直播间日数据」菜单项` | tc06-regression.test.ts | 通过 | 阻塞（环境/鉴权） |
| 17 | ② 地址栏路由为 #/data-stats-manager/live-data/room-day-data | `用例#17-② 地址栏路由为 #/data-stats-manager/live-data/room-day-data` | tc06-regression.test.ts | 通过 | 阻塞（环境/鉴权） |
| 17 | ③ 查询完成，页面无错误提示 | `用例#17-③ 查询完成，页面无错误提示` | tc06-regression.test.ts | 未通过 | 阻塞（环境/鉴权） |
| 17 | ④ 列表显示数据行或「No Data」空态且 Total 一致 | `用例#17-④ 列表显示数据行或「No Data」空态且 Total 一致` | tc06-regression.test.ts | 通过 | 阻塞（环境/鉴权） |
| 17 | ⑤ 点击「导出」触发文件下载，文件可正常打开 | `用例#17-⑤ 点击「导出」触发文件下载，文件可正常打开` | tc06-regression.test.ts | 未通过 | 阻塞（环境/鉴权） |
| 17 | ⑥ 文件表头列名与页面表格列名一致（24 列） | `用例#17-⑥ 文件表头列名与页面表格列名一致（24 列）` | tc06-regression.test.ts | 未通过 | 阻塞（环境/鉴权） |
| 18 | ① 「直播相关数据」子菜单中可见「直播间流水」菜单项 | `用例#18-① 「直播相关数据」子菜单中可见「直播间流水」菜单项` | tc06-regression.test.ts | 通过 | 通过 |
| 18 | ② 地址栏路由为 #/data-stats-manager/live-data/live-room-flow | `用例#18-② 地址栏路由为 #/data-stats-manager/live-data/live-room-flow` | tc06-regression.test.ts | 通过 | 通过 |
| 18 | ③ 出现提示「查询完成，共 N 条」且页面无错误提示 | `用例#18-③ 出现提示「查询完成，共 N 条」且页面无错误提示` | tc06-regression.test.ts | 通过 | 通过 |
| 18 | ④ 列表显示数据行，分页 Total 大于 0 | `用例#18-④ 列表显示数据行，分页 Total 大于 0` | tc06-regression.test.ts | 通过 | 通过 |
| 18 | ⑤ 点击「导出报表」触发文件下载，文件可正常打开 | `用例#18-⑤ 点击「导出报表」触发文件下载，文件可正常打开` | tc06-regression.test.ts | 通过 | 通过 |
| 18 | ⑥ 文件表头列名与页面表格列名一致（30 列） | `用例#18-⑥ 文件表头列名与页面表格列名一致（30 列）` | tc06-regression.test.ts | 通过 | 通过 |

## 说明

- 用例 13 未通过：13⑥ 导出空值单元格为空、页面显示「-」，列表与导出占位不一致（缺陷见 TEST_REPORT）。
- 用例 14 未通过：14③ 页面表头为单行扁平 21 列，无 Total PK Score 二级表头（缺陷见 TEST_REPORT）。
- 用例 15~17 阻塞：旧式报表 /admin-main/* 在当前同源入口 404（环境/鉴权），其 ③⑤⑥ 失败为环境阻塞证据，不计产品缺陷。

## 统计

- 用例条数：18（P0=12 / P1=6）
- 检查点总数（数据行展开后）：121
- check 通过：110 / 121
