# COVERAGE — 项目 3710 用户发图片白名单 + 聊天记录 Unsend（TK-0136 / TK-0140 回归）

> 用例来源：`/task/20261109/TK-0135/HANDOFF`；技术方案：`/task/20261109/TK-0135/TECH_DESIGN`。
> 结果口径：TK-0136 正式执行 `formal-20261109-2313`（87 check）+ 权限脚本 `formal-permission-2313`（#17 3 check + NU-01 3 check）；TK-0140 缺陷 #252 回归执行 `formal-regression`（#2/#5/#7/#14/#26/#27/#28，22 check 全部通过）。#7 本轮改为 T=21、20/page 分页保持可见，直接断言 `currentPage=1`，请求序列仅 `page=1&rows=20`，不再使用“单页隐藏等价”判定。
> 双向核对：正向 28 条用例共 107 个检查点（含数据行展开与阻塞项）均有归属；反向 90 个 UI check 均映射回用例检查点。用例 #6/#19/#20/#25 因前置数据缺失无 check（阻塞取证）；#26-②/#28-③ 已按实际行为（Reset 后补 Search）通过，Q-01 说明保留。

## 1. 用例 → 检查点 → check 双向矩阵

| 用例# | 检查点 | 脚本 / check 标记 | 结果 |
| --- | --- | --- | --- |
| 1 | 用例#1-① 路由为 #/user-manager/user-image-white | `image-white-unsend.test.ts` / `用例#1-① 路由为 #/user-manager/user-image-white` | ✅ |
| 1 | 用例#1-② 页面标题显示「用户发图片白名单」 | `image-white-unsend.test.ts` / `用例#1-② 页面标题显示「用户发图片白名单」` | ✅ |
| 1 | 用例#1-③ Locale/ID/NO/Search/Reset Filters/添加均可见且默认值为空 | `image-white-unsend.test.ts` / `用例#1-③ Locale/ID/NO/Search/Reset Filters/添加均可见且默认值为空` | ✅ |
| 2 | 用例#2-① 两次按 L 筛选后每行 Locale 均为 L 且包含目标行 | `image-white-unsend.test.ts` / `用例#2-① 两次按 L 筛选后每行 Locale 均为 L 且包含目标行` | ✅ |
| 2 | 用例#2-② 两次结果均不包含另一 Locale 的行 | `image-white-unsend.test.ts` / `用例#2-② 两次结果均不包含另一 Locale 的行` | ✅ |
| 2 | 用例#2-③ 清空与重置后 Locale 为空且默认列表两类行均可见 | `image-white-unsend.test.ts` / `用例#2-③ 清空与重置后 Locale 为空且默认列表两类行均可见` | ✅ |
| 3 | 用例#3-①[D1] 存在 ID 查询恰有 1 行 | `image-white-unsend.test.ts` / `用例#3-①[D1] 存在 ID 查询恰有 1 行` | ✅ |
| 3 | 用例#3-①[D2] 不存在 ID 查询为 0 行并显示 No Data | `image-white-unsend.test.ts` / `用例#3-①[D2] 不存在 ID 查询为 0 行并显示 No Data` | ✅ |
| 3 | 用例#3-②[D1] ID 列为存在样本值 | `image-white-unsend.test.ts` / `用例#3-②[D1] ID 列为存在样本值` | ✅ |
| 3 | 用例#3-②[D2] 不显示其他 ID | `image-white-unsend.test.ts` / `用例#3-②[D2] 不显示其他 ID` | ✅ |
| 3 | 用例#3-③[D1] 页面无错误提示 | `image-white-unsend.test.ts` / `用例#3-③[D1] 页面无错误提示` | ✅ |
| 3 | 用例#3-③[D2] 页面无错误提示 | `image-white-unsend.test.ts` / `用例#3-③[D2] 页面无错误提示` | ✅ |
| 4 | 用例#4-①[D1] 存在 NO 查询恰有 1 行 | `image-white-unsend.test.ts` / `用例#4-①[D1] 存在 NO 查询恰有 1 行` | ✅ |
| 4 | 用例#4-①[D2] 不存在 NO 查询为 0 行并显示 No Data | `image-white-unsend.test.ts` / `用例#4-①[D2] 不存在 NO 查询为 0 行并显示 No Data` | ✅ |
| 4 | 用例#4-②[D1] NO 与对应 ID 单元格正确 | `image-white-unsend.test.ts` / `用例#4-②[D1] NO 与对应 ID 单元格正确` | ✅ |
| 4 | 用例#4-②[D2] 不显示其他 NO | `image-white-unsend.test.ts` / `用例#4-②[D2] 不显示其他 NO` | ✅ |
| 4 | 用例#4-③[D1] 页面无错误提示 | `image-white-unsend.test.ts` / `用例#4-③[D1] 页面无错误提示` | ✅ |
| 4 | 用例#4-③[D2] 页面无错误提示 | `image-white-unsend.test.ts` / `用例#4-③[D2] 页面无错误提示` | ✅ |
| 5 | 用例#5-① 表头七列顺序正确 | `image-white-unsend.test.ts` / `用例#5-① 表头七列顺序正确` | ✅ |
| 5 | 用例#5-② 目标行七字段完整且 Add Time/Operator 非空 | `image-white-unsend.test.ts` / `用例#5-② 目标行七字段完整且 Add Time/Operator 非空` | ✅ |
| 5 | 用例#5-③ Action 列显示删除操作 | `image-white-unsend.test.ts` / `用例#5-③ Action 列显示删除操作` | ✅ |
| 7 | 用例#7-① 初始分页 Total=T/第1页/每页D条 | `image-white-unsend.test.ts` / `用例#7-① 初始分页 Total=T/第1页/每页D条` | ✅ |
| 7 | 用例#7-② 第一页行数为 D 且 ID 集合一致 | `image-white-unsend.test.ts` / `用例#7-② 第一页行数为 D 且 ID 集合一致` | ✅ |
| 7 | 用例#7-③ 下一页为第 2 页且行数与第一页不重复 | `image-white-unsend.test.ts` / `用例#7-③ 下一页为第 2 页且行数与第一页不重复` | ✅ |
| 7 | 用例#7-④ 切换 S=20/page 后回第 1 页、Total=T、行数 min(S,T) | `image-white-unsend.test.ts` / `用例#7-④ 切换 S=20/page 后回第 1 页、Total=T、行数 min(S,T)` | ✅（TK-0140 回归：T=21，切 20/page 后分页可见，`current=1`、rows=20、Total=21，请求序列仅 `page=1&rows=20`） |
| 8 | 用例#8-①[D1] 新增 3/重复 0/不存在 0 | `image-white-unsend.test.ts` / `用例#8-①[D1] 新增 3/重复 0/不存在 0` | ✅ |
| 8 | 用例#8-①[D2] 新增 3/重复 0/不存在 0 | `image-white-unsend.test.ts` / `用例#8-①[D2] 新增 3/重复 0/不存在 0` | ✅ |
| 8 | 用例#8-①[D3] 新增 3/重复 0/不存在 0 | `image-white-unsend.test.ts` / `用例#8-①[D3] 新增 3/重复 0/不存在 0` | ✅ |
| 8 | 用例#8-①[D4] 新增 3/重复 0/不存在 0 | `image-white-unsend.test.ts` / `用例#8-①[D4] 新增 3/重复 0/不存在 0` | ✅ |
| 8 | 用例#8-②[D1] 列表总数较添加前增加 3 | `image-white-unsend.test.ts` / `用例#8-②[D1] 列表总数较添加前增加 3` | ✅ |
| 8 | 用例#8-②[D2] 列表总数较添加前增加 3 | `image-white-unsend.test.ts` / `用例#8-②[D2] 列表总数较添加前增加 3` | ✅ |
| 8 | 用例#8-②[D3] 列表总数较添加前增加 3 | `image-white-unsend.test.ts` / `用例#8-②[D3] 列表总数较添加前增加 3` | ✅ |
| 8 | 用例#8-②[D4] 列表总数较添加前增加 3 | `image-white-unsend.test.ts` / `用例#8-②[D4] 列表总数较添加前增加 3` | ✅ |
| 8 | 用例#8-③[D1] 三个 UID 分别查询均只显示对应 1 行 | `image-white-unsend.test.ts` / `用例#8-③[D1] 三个 UID 分别查询均只显示对应 1 行` | ✅ |
| 8 | 用例#8-③[D2] 三个 UID 分别查询均只显示对应 1 行 | `image-white-unsend.test.ts` / `用例#8-③[D2] 三个 UID 分别查询均只显示对应 1 行` | ✅ |
| 8 | 用例#8-③[D3] 三个 UID 分别查询均只显示对应 1 行 | `image-white-unsend.test.ts` / `用例#8-③[D3] 三个 UID 分别查询均只显示对应 1 行` | ✅ |
| 8 | 用例#8-③[D4] 三个 UID 分别查询均只显示对应 1 行 | `image-white-unsend.test.ts` / `用例#8-③[D4] 三个 UID 分别查询均只显示对应 1 行` | ✅ |
| 9 | 用例#9-① 结果提示新增 500/重复 0/不存在 0 | `image-white-unsend.test.ts` / `用例#9-① 结果提示新增 500/重复 0/不存在 0` | ✅ |
| 9 | 用例#9-② 列表总数为 T+500 | `image-white-unsend.test.ts` / `用例#9-② 列表总数为 T+500` | ✅ |
| 9 | 用例#9-③ 首/中/尾三个样本各只显示对应 1 行 | `image-white-unsend.test.ts` / `用例#9-③ 首/中/尾三个样本各只显示对应 1 行` | ✅ |
| 10 | 用例#10-① 页面出现错误提示 | `image-white-unsend.test.ts` / `用例#10-① 页面出现错误提示` | ✅ |
| 10 | 用例#10-② 提示明确表达单次最多添加 500 个用户 | `image-white-unsend.test.ts` / `用例#10-② 提示明确表达单次最多添加 500 个用户` | ✅ |
| 10 | 用例#10-③ 列表总数与行集合不变 | `image-white-unsend.test.ts` / `用例#10-③ 列表总数与行集合不变` | ✅ |
| 11 | 用例#11-① 首次新增 2/重复 0/不存在 0 | `image-white-unsend.test.ts` / `用例#11-① 首次新增 2/重复 0/不存在 0` | ✅ |
| 11 | 用例#11-② 第二次新增 0/重复 2/不存在 0 | `image-white-unsend.test.ts` / `用例#11-② 第二次新增 0/重复 2/不存在 0` | ✅ |
| 11 | 用例#11-③ A、B 各 1 行且总数仅增加 2 | `image-white-unsend.test.ts` / `用例#11-③ A、B 各 1 行且总数仅增加 2` | ✅ |
| 12 | 用例#12-① 出现用户 ID 格式错误提示并指出 abc | `image-white-unsend.test.ts` / `用例#12-① 出现用户 ID 格式错误提示并指出 abc` | ✅ |
| 12 | 用例#12-② 添加弹窗仍打开 | `image-white-unsend.test.ts` / `用例#12-② 添加弹窗仍打开` | ✅ |
| 12 | 用例#12-③ 列表总数与行集合不变 | `image-white-unsend.test.ts` / `用例#12-③ 列表总数与行集合不变` | ✅ |
| 13 | 用例#13-① 新增 1/重复 0/不存在 1 | `image-white-unsend.test.ts` / `用例#13-① 新增 1/重复 0/不存在 1` | ✅ |
| 13 | 用例#13-② A 查询 1 行，N 查询 No Data | `image-white-unsend.test.ts` / `用例#13-② A 查询 1 行，N 查询 No Data` | ✅ |
| 13 | 用例#13-③ 总数较初始仅增加 1 | `image-white-unsend.test.ts` / `用例#13-③ 总数较初始仅增加 1` | ✅ |
| 14 | 用例#14-① 出现二次确认框并提供取消与确认 | `image-white-unsend.test.ts` / `用例#14-① 出现二次确认框并提供取消与确认` | ✅ |
| 14 | 用例#14-② 确认后目标 ID 查询为 No Data | `image-white-unsend.test.ts` / `用例#14-② 确认后目标 ID 查询为 No Data` | ✅ |
| 14 | 用例#14-③ 默认列表总数为 T-1 | `image-white-unsend.test.ts` / `用例#14-③ 默认列表总数为 T-1` | ✅ |
| 15 | 用例#15-① 标签页 A 删除后目标行消失 | `image-white-unsend.test.ts` / `用例#15-① 标签页 A 删除后目标行消失` | ✅ |
| 15 | 用例#15-② 标签页 B 第二次确认后不出现错误提示 | `image-white-unsend.test.ts` / `用例#15-② 标签页 B 第二次确认后不出现错误提示` | ✅ |
| 15 | 用例#15-③ 刷新后目标仍 No Data 且总数为 T-1 | `image-white-unsend.test.ts` / `用例#15-③ 刷新后目标仍 No Data 且总数为 T-1` | ✅ |
| 16 | 用例#16-① Add Time 为年月日时分秒且与本次提交时间一致 | `image-white-unsend.test.ts` / `用例#16-① Add Time 为年月日时分秒且与本次提交时间一致` | ✅ |
| 16 | 用例#16-② Operator 为当前登录 Admin 用户名 | `image-white-unsend.test.ts` / `用例#16-② Operator 为当前登录 Admin 用户名` | ✅ |
| 17 | 用例#17-① 用户管理下不显示用户发图片白名单菜单 | `image-white-unsend.test.ts` / `用例#17-① 用户管理下不显示用户发图片白名单菜单` | ✅ |
| 17 | 用例#17-② 直达后不显示页面标题及 Locale/ID/NO 筛选区 | `image-white-unsend.test.ts` / `用例#17-② 直达后不显示页面标题及 Locale/ID/NO 筛选区` | ✅ |
| 17 | 用例#17-③ 不展示白名单七列表格及任何白名单数据 | `image-white-unsend.test.ts` / `用例#17-③ 不展示白名单七列表格及任何白名单数据` | ✅ |
| 18 | 用例#18-① 展开前 Message type 为空 | `image-white-unsend.test.ts` / `用例#18-① 展开前 Message type 为空` | ✅ |
| 18 | 用例#18-② 下拉选项依次为 Auto Greeting/Group Messaging/Normal/Unsend | `image-white-unsend.test.ts` / `用例#18-② 下拉选项依次为 Auto Greeting/Group Messaging/Normal/Unsend` | ✅ |
| 18 | 用例#18-③ 其他筛选为空且日期保持默认范围 | `image-white-unsend.test.ts` / `用例#18-③ 其他筛选为空且日期保持默认范围` | ✅ |
| 21 | 用例#21-①[D1] 列表行数等于 BD-14 记录 K 且大于 0 | `image-white-unsend.test.ts` / `用例#21-①[D1] 列表行数等于 BD-14 记录 K 且大于 0` | ✅ |
| 21 | 用例#21-①[D2] 列表行数等于 BD-14 记录 K 且大于 0 | `image-white-unsend.test.ts` / `用例#21-①[D2] 列表行数等于 BD-14 记录 K 且大于 0` | ✅ |
| 21 | 用例#21-①[D3] 列表行数等于 BD-14 记录 K 且大于 0 | `image-white-unsend.test.ts` / `用例#21-①[D3] 列表行数等于 BD-14 记录 K 且大于 0` | ✅ |
| 21 | 用例#21-②[D1] 每行 message type 均为对应展示值 | `image-white-unsend.test.ts` / `用例#21-②[D1] 每行 message type 均为对应展示值` | ✅ |
| 21 | 用例#21-②[D2] 每行 message type 均为对应展示值 | `image-white-unsend.test.ts` / `用例#21-②[D2] 每行 message type 均为对应展示值` | ✅ |
| 21 | 用例#21-②[D3] 每行 message type 均为对应展示值 | `image-white-unsend.test.ts` / `用例#21-②[D3] 每行 message type 均为对应展示值` | ✅ |
| 21 | 用例#21-③[D1] 不出现其他消息类型且页面无错误提示 | `image-white-unsend.test.ts` / `用例#21-③[D1] 不出现其他消息类型且页面无错误提示` | ✅ |
| 21 | 用例#21-③[D2] 不出现其他消息类型且页面无错误提示 | `image-white-unsend.test.ts` / `用例#21-③[D2] 不出现其他消息类型且页面无错误提示` | ✅ |
| 21 | 用例#21-③[D3] 不出现其他消息类型且页面无错误提示 | `image-white-unsend.test.ts` / `用例#21-③[D3] 不出现其他消息类型且页面无错误提示` | ✅ |
| 22 | 用例#22-① 页面提示原文「player id or user id 必须填一个」 | `image-white-unsend.test.ts` / `用例#22-① 页面提示原文「player id or user id 必须填一个」` | ✅ |
| 22 | 用例#22-② 不展示查询结果且原筛选值不被修改 | `image-white-unsend.test.ts` / `用例#22-② 不展示查询结果且原筛选值不被修改` | ✅ |
| 23 | 用例#23-① 页面提示原文「时间跨度不能大于14天」 | `image-white-unsend.test.ts` / `用例#23-① 页面提示原文「时间跨度不能大于14天」` | ✅ |
| 23 | 用例#23-② 不展示查询结果且输入条件保留 | `image-white-unsend.test.ts` / `用例#23-② 不展示查询结果且输入条件保留` | ✅ |
| 24 | 用例#24-① Search 后开始与结束日期均为 2026-11-09 | `image-white-unsend.test.ts` / `用例#24-① Search 后开始与结束日期均为 2026-11-09` | ✅ |
| 24 | 用例#24-② 无日期错误提示且主内容区/结果表格可见 | `image-white-unsend.test.ts` / `用例#24-② 无日期错误提示且主内容区/结果表格可见` | ✅ |
| 26 | 用例#26-① 会话页查询 I 为 No Data 且不出现 I | `image-white-unsend.test.ts` / `用例#26-① 会话页查询 I 为 No Data 且不出现 I` | ✅ |
| 26 | 用例#26-② 重置后默认列表总数仍为 T 且不包含 I | `image-white-unsend.test.ts` / `用例#26-② 重置后默认列表总数仍为 T 且不包含 I` | ✅（按实际行为：Reset 仅清空 USER ID，补 Search 后默认列表 Total=17、不含 I；Q-01 保留） |
| 26 | 用例#26-③ 历史行集合保持不变且页面无错误提示 | `image-white-unsend.test.ts` / `用例#26-③ 历史行集合保持不变且页面无错误提示` | ✅ |
| 27 | 用例#27-① 初始 Total=T、10/page、第 1 页 10 行且 ID 集合一致 | `image-white-unsend.test.ts` / `用例#27-① 初始 Total=T、10/page、第 1 页 10 行且 ID 集合一致` | ✅ |
| 27 | 用例#27-② 第 2 页行数 T-10、ID 集合一致且不与第一页重复 | `image-white-unsend.test.ts` / `用例#27-② 第 2 页行数 T-10、ID 集合一致且不与第一页重复` | ✅ |
| 27 | 用例#27-③ 返回第 1 页后行数与 ID 集合和初始一致 | `image-white-unsend.test.ts` / `用例#27-③ 返回第 1 页后行数与 ID 集合和初始一致` | ✅ |
| 28 | 用例#28-① 新增后 Total=T+1，S 查询仅 1 行且字段完整 | `image-white-unsend.test.ts` / `用例#28-① 新增后 Total=T+1，S 查询仅 1 行且字段完整` | ✅ |
| 28 | 用例#28-② 删除后 S 查询不再显示并显示 No Data | `image-white-unsend.test.ts` / `用例#28-② 删除后 S 查询不再显示并显示 No Data` | ✅ |
| 28 | 用例#28-③ 重置后默认列表恢复 T 且历史集合不变 | `image-white-unsend.test.ts` / `用例#28-③ 重置后默认列表恢复 T 且历史集合不变` | ✅（按实际行为：Reset 仅清空 USER ID，补 Search 后默认列表 Total=17、历史集合不变；Q-01 保留） |
| 6 | ① M1 行 NO/Nick 为空且 ID 显示 | 无 check（阻塞取证） | ⛔ 阻塞：BD-04 无 M1/M2 历史行；页面无法添加不存在用户；禁止 SQL 造数 |
| 6 | ② M2 行 Locale 为空且其余资料不受影响 | 无 check（阻塞取证） | ⛔ 阻塞：BD-04 无 M1/M2 历史行；页面无法添加不存在用户；禁止 SQL 造数 |
| 6 | ③ 两次查询无错误/无白屏/表格可见 | 无 check（阻塞取证） | ⛔ 阻塞：BD-04 无 M1/M2 历史行；页面无法添加不存在用户；禁止 SQL 造数 |
| 19 | ① 列表显示 U 条目标撤回消息 | 无 check（阻塞取证） | ⛔ 阻塞：player_message.biz=UNSEND 计数=0；无 3709 真实撤回数据 |
| 19 | ② 每行 message type 均为 Unsend | 无 check（阻塞取证） | ⛔ 阻塞：player_message.biz=UNSEND 计数=0；无 3709 真实撤回数据 |
| 19 | ③ 不出现其他消息类型 | 无 check（阻塞取证） | ⛔ 阻塞：player_message.biz=UNSEND 计数=0；无 3709 真实撤回数据 |
| 20 | ① 按发送时间与原内容定位目标行 | 无 check（阻塞取证） | ⛔ 阻塞：player_message.biz=UNSEND 计数=0；无 3709 真实撤回数据 |
| 20 | ② 该行 message type 显示 Unsend | 无 check（阻塞取证） | ⛔ 阻塞：player_message.biz=UNSEND 计数=0；无 3709 真实撤回数据 |
| 25 | ①[D1] content 以 [Unsend] 开头 | 无 check（阻塞取证） | ⛔ 阻塞：无 UNSEND 文本/图片/语音数据；不得以空结果通过 |
| 25 | ②[D1] [Unsend] 为红色 | 无 check（阻塞取证） | ⛔ 阻塞：无 UNSEND 文本/图片/语音数据；不得以空结果通过 |
| 25 | ③[D1] 原文保留 | 无 check（阻塞取证） | ⛔ 阻塞：无 UNSEND 文本/图片/语音数据；不得以空结果通过 |
| 25 | ①[D2] content 以 [Unsend] 开头 | 无 check（阻塞取证） | ⛔ 阻塞：无 UNSEND 文本/图片/语音数据；不得以空结果通过 |
| 25 | ②[D2] [Unsend] 为红色 | 无 check（阻塞取证） | ⛔ 阻塞：无 UNSEND 文本/图片/语音数据；不得以空结果通过 |
| 25 | ③[D2] 图片 URL 保留 | 无 check（阻塞取证） | ⛔ 阻塞：无 UNSEND 文本/图片/语音数据；不得以空结果通过 |
| 25 | ①[D3] content 以 [Unsend] 开头 | 无 check（阻塞取证） | ⛔ 阻塞：无 UNSEND 文本/图片/语音数据；不得以空结果通过 |
| 25 | ②[D3] [Unsend] 为红色 | 无 check（阻塞取证） | ⛔ 阻塞：无 UNSEND 文本/图片/语音数据；不得以空结果通过 |
| 25 | ③[D3] 语音 URL 保留 | 无 check（阻塞取证） | ⛔ 阻塞：无 UNSEND 文本/图片/语音数据；不得以空结果通过 |

## 2. 非 UI 核验

| 编号 | 检查点 | 脚本 / check 标记 | 结果 |
| --- | --- | --- | --- |
| NU-01 | NU-01-① 无权限时 list 返回 status=1,msg=无权限 | `image-white-permission.test.ts` / `NU-01-① 无权限时 list 返回 status=1,msg=无权限` | ✅ |
| NU-01 | NU-01-② 无权限时 addList 返回 status=1,msg=无权限 | `image-white-permission.test.ts` / `NU-01-② 无权限时 addList 返回 status=1,msg=无权限` | ✅ |
| NU-01 | NU-01-③ 无权限时 delete 返回 status=1,msg=无权限 | `image-white-permission.test.ts` / `NU-01-③ 无权限时 delete 返回 status=1,msg=无权限` | ✅ |
| NU-02 | 未充值用户私信限制不受图片白名单影响（条件项） | 未生成 check | ⚠️ 未验证/待 3709 联调（无 3709/IM 客户端条件，未编造结果） |

## 3. 结果汇总

- UI 检查点：90 个（87 主脚本 + 3 权限脚本）。TK-0136 正式执行通过 88 / 失败 2（#26-②、#28-③）；TK-0140 回归后 #26-②、#28-③ 已按实际行为通过，累计通过 90 / 失败 0。
- 用例四态（TK-0140 回归后）：通过 24 / 未通过 0 / 阻塞 4（#6、#19、#20、#25）/ 未执行 0。
- 执行率 = (24+0)/28 = 85.71%；通过率 = 24/(24+0) = 100%。
- FLAKY 风险：TK-0136 自测页面竞态 #7（切 20/page 后一次 No Data）已由缺陷 #252 修复（`handleSizeChange` 重置 currentPage + `fetchSeq` 防过期响应）；TK-0140 回归直接观测 current=1，请求序列仅 `page=1&rows=20`，无 FLAKY。历史首次失败证据保留，不覆盖。
- 红证：TK-0140 P0 `用例#7-④` 临时改错期望 → check fail → 恢复 → check success；TK-0136 P0 #1-① 红证保留。
- 产品缺陷：#252（前端分页）已修复并回归通过，待关闭；其余 0。用例问题：Q-01（#26-②/#28-③ Reset Filters 不刷新，既有页面行为，已按实际行为判定）；Q-02（#6 BD-04 无数据）。
