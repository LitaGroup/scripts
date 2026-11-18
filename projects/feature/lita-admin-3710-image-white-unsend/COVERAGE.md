# COVERAGE — 项目 3710 图片白名单 + 聊天记录 Unsend（TK-0335）

> 用例来源：TK-0334 HANDOFF 九列用例（28 条）；技术方案：TK-0334 TECH_DESIGN。
> 本表为「用例检查点 ↔ 代码 check」双向核对矩阵：正向每个检查点在代码中有唯一 check；反向每个 check 均能映射回用例检查点。
> 结果取自 2026-11-18 正式执行（主脚本 90 check + 权限脚本 3 check + NU-01 3 项非 UI）。

| 用例# | 检查点（含数据行） | 脚本 / check 标记 | 结果 |
| --- | --- | --- | --- |
| 1 | ① 路由为 #/user-manager/user-image-white | `image-white-unsend.test.ts` `用例#1-① 路由为 #/user-manager/user-image-white` | ✅ 通过 |
| 1 | ② 页面标题显示「用户发图片白名单」 | `image-white-unsend.test.ts` `用例#1-② 页面标题显示「用户发图片白名单」` | ✅ 通过 |
| 1 | ③ Locale/ID/NO/Search/Reset Filters/添加均可见且默认值为空 | `image-white-unsend.test.ts` `用例#1-③ Locale/ID/NO/Search/Reset Filters/添加均可见且默认值为空` | ✅ 通过 |
| 2 | ① 两次按 L 筛选后每行 Locale 均为 L 且包含目标行 | `image-white-unsend.test.ts` `用例#2-① 两次按 L 筛选后每行 Locale 均为 L 且包含目标行` | ✅ 通过 |
| 2 | ② 两次结果均不包含另一 Locale 的行 | `image-white-unsend.test.ts` `用例#2-② 两次结果均不包含另一 Locale 的行` | ✅ 通过 |
| 2 | ③ 清空与重置后 Locale 为空且默认列表两类行均可见 | `image-white-unsend.test.ts` `用例#2-③ 清空与重置后 Locale 为空且默认列表两类行均可见` | ✅ 通过 |
| 3 | ①[D1] 存在 ID 查询恰有 1 行 | `image-white-unsend.test.ts` `用例#3-①[D1] 存在 ID 查询恰有 1 行` | ✅ 通过 |
| 3 | ②[D1] ID 列为存在样本值 | `image-white-unsend.test.ts` `用例#3-②[D1] ID 列为存在样本值` | ✅ 通过 |
| 3 | ③[D1] 页面无错误提示 | `image-white-unsend.test.ts` `用例#3-③[D1] 页面无错误提示` | ✅ 通过 |
| 3 | ①[D2] 不存在 ID 查询为 0 行并显示 No Data | `image-white-unsend.test.ts` `用例#3-①[D2] 不存在 ID 查询为 0 行并显示 No Data` | ✅ 通过 |
| 3 | ②[D2] 不显示其他 ID | `image-white-unsend.test.ts` `用例#3-②[D2] 不显示其他 ID` | ✅ 通过 |
| 3 | ③[D2] 页面无错误提示 | `image-white-unsend.test.ts` `用例#3-③[D2] 页面无错误提示` | ✅ 通过 |
| 4 | ①[D1] 存在 NO 查询恰有 1 行 | `image-white-unsend.test.ts` `用例#4-①[D1] 存在 NO 查询恰有 1 行` | ✅ 通过 |
| 4 | ②[D1] NO 与对应 ID 单元格正确 | `image-white-unsend.test.ts` `用例#4-②[D1] NO 与对应 ID 单元格正确` | ✅ 通过 |
| 4 | ③[D1] 页面无错误提示 | `image-white-unsend.test.ts` `用例#4-③[D1] 页面无错误提示` | ✅ 通过 |
| 4 | ①[D2] 不存在 NO 查询为 0 行并显示 No Data | `image-white-unsend.test.ts` `用例#4-①[D2] 不存在 NO 查询为 0 行并显示 No Data` | ✅ 通过 |
| 4 | ②[D2] 不显示其他 NO | `image-white-unsend.test.ts` `用例#4-②[D2] 不显示其他 NO` | ✅ 通过 |
| 4 | ③[D2] 页面无错误提示 | `image-white-unsend.test.ts` `用例#4-③[D2] 页面无错误提示` | ✅ 通过 |
| 5 | ① 表头七列顺序正确 | `image-white-unsend.test.ts` `用例#5-① 表头七列顺序正确` | ✅ 通过 |
| 5 | ② 目标行七字段完整且 Add Time/Operator 非空 | `image-white-unsend.test.ts` `用例#5-② 目标行七字段完整且 Add Time/Operator 非空` | ✅ 通过 |
| 5 | ③ Action 列显示删除操作 | `image-white-unsend.test.ts` `用例#5-③ Action 列显示删除操作` | ✅ 通过 |
| 6 | ① 添加结果提示新增 1/重复 0/不存在 0 | `image-white-unsend.test.ts` `用例#6-① 添加结果提示新增 1/重复 0/不存在 0` | ✅ 通过 |
| 6 | ② 目标行 Locale 为空且 ID/NO/Nick 与 BD-04R 记录一致 | `image-white-unsend.test.ts` `用例#6-② 目标行 Locale 为空且 ID/NO/Nick 与 BD-04R 记录一致` | ✅ 通过 |
| 6 | ③ 页面无错误提示、无白屏且表格可见 | `image-white-unsend.test.ts` `用例#6-③ 页面无错误提示、无白屏且表格可见` | ✅ 通过 |
| 7 | ① 初始分页显示 Total=T、第 1 页、每页 D 条 | `image-white-unsend.test.ts` `用例#7-① 初始分页显示 Total=T、第 1 页、每页 D 条` | ✅ 通过 |
| 7 | ② 第一页行数为 D 且 ID 均属于 BD-05 数据集 | `image-white-unsend.test.ts` `用例#7-② 第一页行数为 D 且 ID 均属于 BD-05 数据集` | ✅ 通过 |
| 7 | ③ 下一页为第 2 页且行数与第一页不重复 | `image-white-unsend.test.ts` `用例#7-③ 下一页为第 2 页且行数与第一页不重复` | ✅ 通过 |
| 7 | ④ 切换 S=20/page 后回第 1 页、Total=T、行数 min(S,T) | `image-white-unsend.test.ts` `用例#7-④ 切换 S=20/page 后回第 1 页、Total=T、行数 min(S,T)` | ✅ 通过 |
| 8 | ①[D1] 新增 3/重复 0/不存在 0 | `image-white-unsend.test.ts` `用例#8-①[D1] 新增 3/重复 0/不存在 0` | ✅ 通过 |
| 8 | ②[D1] 列表总数较添加前增加 3 | `image-white-unsend.test.ts` `用例#8-②[D1] 列表总数较添加前增加 3` | ✅ 通过 |
| 8 | ③[D1] 三个 UID 分别查询均只显示对应 1 行 | `image-white-unsend.test.ts` `用例#8-③[D1] 三个 UID 分别查询均只显示对应 1 行` | ✅ 通过 |
| 8 | ①[D2] 新增 3/重复 0/不存在 0 | `image-white-unsend.test.ts` `用例#8-①[D2] 新增 3/重复 0/不存在 0` | ✅ 通过 |
| 8 | ②[D2] 列表总数较添加前增加 3 | `image-white-unsend.test.ts` `用例#8-②[D2] 列表总数较添加前增加 3` | ✅ 通过 |
| 8 | ③[D2] 三个 UID 分别查询均只显示对应 1 行 | `image-white-unsend.test.ts` `用例#8-③[D2] 三个 UID 分别查询均只显示对应 1 行` | ✅ 通过 |
| 8 | ①[D3] 新增 3/重复 0/不存在 0 | `image-white-unsend.test.ts` `用例#8-①[D3] 新增 3/重复 0/不存在 0` | ✅ 通过 |
| 8 | ②[D3] 列表总数较添加前增加 3 | `image-white-unsend.test.ts` `用例#8-②[D3] 列表总数较添加前增加 3` | ✅ 通过 |
| 8 | ③[D3] 三个 UID 分别查询均只显示对应 1 行 | `image-white-unsend.test.ts` `用例#8-③[D3] 三个 UID 分别查询均只显示对应 1 行` | ✅ 通过 |
| 8 | ①[D4] 新增 3/重复 0/不存在 0 | `image-white-unsend.test.ts` `用例#8-①[D4] 新增 3/重复 0/不存在 0` | ✅ 通过 |
| 8 | ②[D4] 列表总数较添加前增加 3 | `image-white-unsend.test.ts` `用例#8-②[D4] 列表总数较添加前增加 3` | ✅ 通过 |
| 8 | ③[D4] 三个 UID 分别查询均只显示对应 1 行 | `image-white-unsend.test.ts` `用例#8-③[D4] 三个 UID 分别查询均只显示对应 1 行` | ✅ 通过 |
| 9 | ① 结果提示新增 500/重复 0/不存在 0 | `image-white-unsend.test.ts` `用例#9-① 结果提示新增 500/重复 0/不存在 0` | ✅ 通过 |
| 9 | ② 列表总数为 T+500 | `image-white-unsend.test.ts` `用例#9-② 列表总数为 T+500` | ✅ 通过 |
| 9 | ③ 首/中/尾三个样本各只显示对应 1 行 | `image-white-unsend.test.ts` `用例#9-③ 首/中/尾三个样本各只显示对应 1 行` | ✅ 通过 |
| 10 | ① 页面出现错误提示 | `image-white-unsend.test.ts` `用例#10-① 页面出现错误提示` | ✅ 通过 |
| 10 | ② 提示明确表达单次最多添加 500 个用户 | `image-white-unsend.test.ts` `用例#10-② 提示明确表达单次最多添加 500 个用户` | ✅ 通过 |
| 10 | ③ 列表总数与行集合不变 | `image-white-unsend.test.ts` `用例#10-③ 列表总数与行集合不变` | ✅ 通过 |
| 11 | ① 首次新增 2/重复 0/不存在 0 | `image-white-unsend.test.ts` `用例#11-① 首次新增 2/重复 0/不存在 0` | ✅ 通过 |
| 11 | ② 第二次新增 0/重复 2/不存在 0 | `image-white-unsend.test.ts` `用例#11-② 第二次新增 0/重复 2/不存在 0` | ✅ 通过 |
| 11 | ③ A、B 各 1 行且总数仅增加 2 | `image-white-unsend.test.ts` `用例#11-③ A、B 各 1 行且总数仅增加 2` | ✅ 通过 |
| 12 | ① 出现用户 ID 格式错误提示并指出 abc | `image-white-unsend.test.ts` `用例#12-① 出现用户 ID 格式错误提示并指出 abc` | ✅ 通过 |
| 12 | ② 添加弹窗仍打开 | `image-white-unsend.test.ts` `用例#12-② 添加弹窗仍打开` | ✅ 通过 |
| 12 | ③ 列表总数与行集合不变 | `image-white-unsend.test.ts` `用例#12-③ 列表总数与行集合不变` | ✅ 通过 |
| 13 | ① 新增 1/重复 0/不存在 1 | `image-white-unsend.test.ts` `用例#13-① 新增 1/重复 0/不存在 1` | ✅ 通过 |
| 13 | ② A 查询 1 行，N 查询 No Data | `image-white-unsend.test.ts` `用例#13-② A 查询 1 行，N 查询 No Data` | ✅ 通过 |
| 13 | ③ 总数较初始仅增加 1 | `image-white-unsend.test.ts` `用例#13-③ 总数较初始仅增加 1` | ✅ 通过 |
| 14 | ① 出现二次确认框并提供取消与确认 | `image-white-unsend.test.ts` `用例#14-① 出现二次确认框并提供取消与确认` | ✅ 通过 |
| 14 | ② 确认后目标 ID 查询为 No Data | `image-white-unsend.test.ts` `用例#14-② 确认后目标 ID 查询为 No Data` | ✅ 通过 |
| 14 | ③ 默认列表总数为 T-1 | `image-white-unsend.test.ts` `用例#14-③ 默认列表总数为 T-1` | ✅ 通过 |
| 15 | ① 标签页 A 删除后目标行消失 | `image-white-unsend.test.ts` `用例#15-① 标签页 A 删除后目标行消失` | ✅ 通过 |
| 15 | ② 标签页 B 第二次确认后不出现错误提示 | `image-white-unsend.test.ts` `用例#15-② 标签页 B 第二次确认后不出现错误提示` | ✅ 通过 |
| 15 | ③ 刷新后目标仍 No Data 且总数为 T-1 | `image-white-unsend.test.ts` `用例#15-③ 刷新后目标仍 No Data 且总数为 T-1` | ✅ 通过 |
| 16 | ① Add Time 为年月日时分秒且与本次提交时间一致 | `image-white-unsend.test.ts` `用例#16-① Add Time 为年月日时分秒且与本次提交时间一致` | ✅ 通过 |
| 16 | ② Operator 为当前登录 Admin 用户名 | `image-white-unsend.test.ts` `用例#16-② Operator 为当前登录 Admin 用户名` | ✅ 通过 |
| 17 | ① 左侧菜单不显示「用户管理」分组及「用户发图片白名单」菜单 | `image-white-permission.test.ts` `用例#17-① 左侧菜单不显示「用户管理」分组及「用户发图片白名单」菜单` | ✅ 通过 |
| 17 | ② 直达后跳转 #/404 并显示 OOPS，不显示白名单页面标题与筛选区 | `image-white-permission.test.ts` `用例#17-② 直达后跳转 #/404 并显示 OOPS，不显示白名单页面标题与筛选区` | ✅ 通过 |
| 17 | ③ 不展示白名单七列表格及任何白名单数据 | `image-white-permission.test.ts` `用例#17-③ 不展示白名单七列表格及任何白名单数据` | ✅ 通过 |
| 18 | ① 展开前 Message type 为空 | `image-white-unsend.test.ts` `用例#18-① 展开前 Message type 为空` | ✅ 通过 |
| 18 | ② 下拉选项依次为 Auto Greeting/Group Messaging/Normal/Unsend | `image-white-unsend.test.ts` `用例#18-② 下拉选项依次为 Auto Greeting/Group Messaging/Normal/Unsend` | ✅ 通过 |
| 18 | ③ 其他筛选为空且日期保持默认近 14 天范围 | `image-white-unsend.test.ts` `用例#18-③ 其他筛选为空且日期保持默认近 14 天范围` | ✅ 通过 |
| 21 | ①[D1] 列表行数等于 BD-14 记录 K 且大于 0 | `image-white-unsend.test.ts` `用例#21-①[D1] 列表行数等于 BD-14 记录 K 且大于 0` | ✅ 通过 |
| 21 | ②[D1] 每行 message type 均为对应展示值 | `image-white-unsend.test.ts` `用例#21-②[D1] 每行 message type 均为对应展示值` | ✅ 通过 |
| 21 | ③[D1] 不出现其他消息类型且页面无错误提示 | `image-white-unsend.test.ts` `用例#21-③[D1] 不出现其他消息类型且页面无错误提示` | ✅ 通过 |
| 21 | ①[D2] 列表行数等于 BD-14 记录 K 且大于 0 | `image-white-unsend.test.ts` `用例#21-①[D2] 列表行数等于 BD-14 记录 K 且大于 0` | ✅ 通过 |
| 21 | ②[D2] 每行 message type 均为对应展示值 | `image-white-unsend.test.ts` `用例#21-②[D2] 每行 message type 均为对应展示值` | ✅ 通过 |
| 21 | ③[D2] 不出现其他消息类型且页面无错误提示 | `image-white-unsend.test.ts` `用例#21-③[D2] 不出现其他消息类型且页面无错误提示` | ✅ 通过 |
| 21 | ①[D3] 列表行数等于 BD-14 记录 K 且大于 0 | `image-white-unsend.test.ts` `用例#21-①[D3] 列表行数等于 BD-14 记录 K 且大于 0` | ✅ 通过 |
| 21 | ②[D3] 每行 message type 均为对应展示值 | `image-white-unsend.test.ts` `用例#21-②[D3] 每行 message type 均为对应展示值` | ✅ 通过 |
| 21 | ③[D3] 不出现其他消息类型且页面无错误提示 | `image-white-unsend.test.ts` `用例#21-③[D3] 不出现其他消息类型且页面无错误提示` | ✅ 通过 |
| 22 | ① 页面提示原文「player id or user id 必须填一个」 | `image-white-unsend.test.ts` `用例#22-① 页面提示原文「player id or user id 必须填一个」` | ✅ 通过 |
| 22 | ② 不展示查询结果且原筛选值不被修改 | `image-white-unsend.test.ts` `用例#22-② 不展示查询结果且原筛选值不被修改` | ✅ 通过 |
| 23 | ① 页面提示原文「时间跨度不能大于14天」 | `image-white-unsend.test.ts` `用例#23-① 页面提示原文「时间跨度不能大于14天」` | ✅ 通过 |
| 23 | ② 不展示查询结果且输入条件保留 | `image-white-unsend.test.ts` `用例#23-② 不展示查询结果且输入条件保留` | ✅ 通过 |
| 24 | ① Search 后开始与结束日期均为开始日期 | `image-white-unsend.test.ts` `用例#24-① Search 后开始与结束日期均为开始日期` | ✅ 通过 |
| 24 | ② 无日期错误提示且主内容区/结果表格可见 | `image-white-unsend.test.ts` `用例#24-② 无日期错误提示且主内容区/结果表格可见` | ✅ 通过 |
| 26 | ① 会话页查询 I 为 No Data 且不出现 I | `image-white-unsend.test.ts` `用例#26-① 会话页查询 I 为 No Data 且不出现 I` | ✅ 通过 |
| 26 | ② 重置后默认列表总数仍为 T 且不包含 I | `image-white-unsend.test.ts` `用例#26-② 重置后默认列表总数仍为 T 且不包含 I` | ✅ 通过 |
| 26 | ③ 历史行集合保持不变且页面无错误提示 | `image-white-unsend.test.ts` `用例#26-③ 历史行集合保持不变且页面无错误提示` | ✅ 通过 |
| 27 | ① 初始 Total=T、10/page、第 1 页 10 行且 ID 集合一致 | `image-white-unsend.test.ts` `用例#27-① 初始 Total=T、10/page、第 1 页 10 行且 ID 集合一致` | ✅ 通过 |
| 27 | ② 第 2 页行数 T-10、ID 集合一致且不与第一页重复 | `image-white-unsend.test.ts` `用例#27-② 第 2 页行数 T-10、ID 集合一致且不与第一页重复` | ✅ 通过 |
| 27 | ③ 返回第 1 页后行数与 ID 集合和初始一致 | `image-white-unsend.test.ts` `用例#27-③ 返回第 1 页后行数与 ID 集合和初始一致` | ✅ 通过 |
| 28 | ① 新增后 Total=T+1，S 查询仅 1 行且字段完整 | `image-white-unsend.test.ts` `用例#28-① 新增后 Total=T+1，S 查询仅 1 行且字段完整` | ✅ 通过 |
| 28 | ② 删除后 S 查询不再显示并显示 No Data | `image-white-unsend.test.ts` `用例#28-② 删除后 S 查询不再显示并显示 No Data` | ✅ 通过 |
| 28 | ③ 重置后默认列表恢复 T 且历史集合不变 | `image-white-unsend.test.ts` `用例#28-③ 重置后默认列表恢复 T 且历史集合不变` | ✅ 通过 |
| 19 | 全部检查点（按 Unsend 筛选仅显示撤回消息） | 无 check：BD-13R 数据缺口阻塞取证（`image-white-unsend.test.ts` case19Blocked） | ⛔ 阻塞 |
| 20 | 全部检查点（撤回行 message type 显示 Unsend） | 无 check：BD-13R 数据缺口阻塞取证（`image-white-unsend.test.ts` case20Blocked） | ⛔ 阻塞 |
| 25 | 全部检查点（撤回内容红色 [Unsend] 前缀与原内容） | 无 check：BD-13R 数据缺口阻塞取证（`image-white-unsend.test.ts` case25Blocked） | ⛔ 阻塞 |

## 双向核对结论

- 正向：已代码化用例 1~16、18、21~24、26~28 共 25 条的检查点均在代码中有唯一 check；用例 19/20/25 因 `player_message.biz='UNSEND'`=0 无法取得目标数据，按阻塞处理，无检查点可执行（上游用例已约定不得以空结果通过）。
- 反向：主脚本 check 90 个、权限脚本 check 3 个，全部能映射回上表用例检查点；NU-01 三项为非 UI 附录（不进入九列）。
- 合计：主脚本 90/90 通过；权限脚本 3/3 通过；阻塞 3 条（19/20/25）。无多验、无漏验。
- 红证抽查：临时将 `用例#1-①` 期望路由改为 `...-REDPROOF`，该 check 失败（expect/real 可区分）；删除临时副本后原脚本通过。详见 RUNS.md。
