# 项目139 测试覆盖记录

## TK-0096（2026-11-06）：缺陷 #233 修复回归（广播召人导入 405）

回归来源：缺陷 #233（广播召人配置「上传模版」选择文件时向页面根路径 POST，HTTP 405 console error）；脚本 `broad-import-233-regression.test.ts`。
范围：导入核心回归 + 页面轻量冒烟 + console/HTTP 基线；非全量回归。

| 回归项 | 检查点 | check 标记 | 结果 |
| --- | --- | --- | --- |
| 部署基线 | 前端入口 JS 为 `index-305af3b6.js` | `基线-①` | ✅ |
| 部署基线 | 入口 HTML Last-Modified 不早于修复构建时间 | `基线-②` | ✅ |
| 冒烟-页面加载 | 内容区可见、9 列表头完整 | `冒烟-S1-①` | ✅ |
| 冒烟-列表查询 | 按 ROOM ID 仅显示 1 条 6666 配置且字段 33/11 | `冒烟-S1-②` | ✅ |
| 冒烟-批量入口 | 多选列可见、未勾选时「批量删除」禁用 | `冒烟-S2-①` | ✅ |
| 冒烟-批量入口 | 勾选 1 行启用、取消勾选恢复禁用 | `冒烟-S2-②` | ✅ |
| 冒烟-单条删除 | 成功提示、目标记录从列表与数据删除、无错误提示 | `冒烟-S3-①` | ✅ |
| #233 核心 | 选择文件后无任何向页面根路径的 POST | `#233-①` | ✅ |
| #233 核心 | 选择文件后 console 无 405、无新增 error，且无 405 响应 | `#233-②` | ✅ |
| #233 核心 | Confirm 后仅 1 次调用 `/api/voiceroom/broad/uploadBroad` 且响应成功 | `#233-③` | ✅ |
| #233 核心 | 导入成功提示「上传成功!」 | `#233-④` | ✅ |
| #233 核心 | 列表刷新生成 1 条 6666 配置，优先级 12、日邀请 30 | `#233-⑤` | ✅ |
| console 基线 | 全流程新增 console error 为 0（`/admin/init` 404 为已知基线） | `#233-⑥` | ✅ |
| HTTP 基线 | 全流程无新增 HTTP 4xx/5xx（排除 `/admin/init` 404） | `#233-⑦` | ✅ |

双向核对：14 个 check 全部对应本轮回归项；无额外验证点、无遗漏。红证抽查：临时反转 `#233-①` 通过条件后该 check 失败（22/23），恢复后正式执行 23/23 通过。

## TK-0092（2026-11-06）：47 条 UI 用例 + 8 项非 UI 核验

用例来源：TK-0083 HANDOFF 九列表格；技术方案：TK-0083 TECH_DESIGN。执行轮次：TK-0092（无提测单）。

### 1. 47 条 UI 用例覆盖（107 个检查点）

| 用例# | 检查点 | 脚本 / check 标记 | 结果 |
| --- | --- | --- | --- |
| 1 | ① 表格首列为多选列且工具栏「批量删除」按钮可见 | `broad-config-47cases.test.ts` `用例#1-① 表格首列为多选列且工具栏「批量删除」按钮可见` | ✅ |
| 1 | ② 未勾选任何行时「批量删除」按钮为禁用态 | `broad-config-47cases.test.ts` `用例#1-② 未勾选任何行时「批量删除」按钮为禁用态` | ✅ |
| 2 | ① 勾选两行后「批量删除」按钮为可用态 | `broad-config-47cases.test.ts` `用例#2-① 勾选两行后「批量删除」按钮为可用态` | ✅ |
| 2 | ② 二次确认文案为「确认删除选中的 2 条广播召人配置？」 | `broad-config-47cases.test.ts` `用例#2-② 二次确认文案为「确认删除选中的 2 条广播召人配置？」` | ✅ |
| 3 | ① 取消后两个目标 roomId 仍各显示 1 条，列表总数仍为删除前总数 | `broad-config-47cases.test.ts` `用例#3-① 取消后两个目标 roomId 仍各显示 1 条，列表总数仍为删除前总数` | ✅ |
| 3 | ② 页面不出现批量删除成功提示 | `broad-config-47cases.test.ts` `用例#3-② 页面不出现批量删除成功提示` | ✅ |
| 4 | ① 页面轻提示为「成功删除2条数据」 | `broad-config-47cases.test.ts` `用例#4-① 页面轻提示为「成功删除2条数据」` | ✅ |
| 4 | ② 刷新后的列表不含两个勾选 roomId，仍显示未勾选 roomId | `broad-config-47cases.test.ts` `用例#4-② 刷新后的列表不含两个勾选 roomId，仍显示未勾选 roomId` | ✅ |
| 4 | ③ 表格勾选数为 0，「批量删除」按钮恢复禁用态 | `broad-config-47cases.test.ts` `用例#4-③ 表格勾选数为 0，「批量删除」按钮恢复禁用态` | ✅ |
| 5 | ① 查询结果不再显示房间 6666 的配置 | `broad-config-47cases.test.ts` `用例#5-① 查询结果不再显示房间 6666 的配置` | ✅ |
| 5 | ② 页面不出现错误提示或空白页 | `broad-config-47cases.test.ts` `用例#5-② 页面不出现错误提示或空白页` | ✅ |
| 6 | ① 列表仅显示 1 条房间 6666 的配置 | `broad-config-47cases.test.ts` `用例#6-① 列表仅显示 1 条房间 6666 的配置` | ✅ |
| 6 | ② 该行优先级为 33、日广播邀请人数为 11 | `broad-config-47cases.test.ts` `用例#6-② 该行优先级为 33、日广播邀请人数为 11` | ✅ |
| 7 | ① 目标行优先级显示 77 | `broad-config-47cases.test.ts` `用例#7-① 目标行优先级显示 77` | ✅ |
| 7 | ② 目标行房间ID仍为 6666、日广播邀请人数仍为 11 | `broad-config-47cases.test.ts` `用例#7-② 目标行房间ID仍为 6666、日广播邀请人数仍为 11` | ✅ |
| 7 | ③ 目标查询结果总行数为 1 | `broad-config-47cases.test.ts` `用例#7-③ 目标查询结果总行数为 1` | ✅ |
| 8 | ① 列表仅显示 1 条房间 6666 的配置 | `broad-config-47cases.test.ts` `用例#8-① 列表仅显示 1 条房间 6666 的配置` | ✅ |
| 8 | ② 该行优先级为 12、日广播邀请人数为 30 | `broad-config-47cases.test.ts` `用例#8-② 该行优先级为 12、日广播邀请人数为 30` | ✅ |
| 9 | ① 第 2 页为高亮页，每页 20 条，首行 roomId 不同于第 1 页记录值 | `broad-config-47cases.test.ts` `用例#9-① 第 2 页为高亮页，每页 20 条，首行 roomId 不同于第 1 页记录值` | ✅ |
| 9 | ② 返回后第 1 页为高亮页，分页总数仍为原总数 | `broad-config-47cases.test.ts` `用例#9-② 返回后第 1 页为高亮页，分页总数仍为原总数` | ✅ |
| 10 | ① 列表总行数为 1，目标房间 6666 行数为 1，非目标行数为 0 | `broad-config-47cases.test.ts` `用例#10-① 列表总行数为 1，目标房间 6666 行数为 1，非目标行数为 0` | ✅ |
| 10 | ② 目标行优先级为 33、日广播邀请人数为 11 | `broad-config-47cases.test.ts` `用例#10-② 目标行优先级为 33、日广播邀请人数为 11` | ✅ |
| 11 | ① 列表至少 1 行且每行「大区」均显示英语(en) | `broad-config-47cases.test.ts` `用例#11-① 列表至少 1 行且每行「大区」均显示英语(en)` | ✅ |
| 11 | ② 房间 6666 的目标配置在结果中可见 | `broad-config-47cases.test.ts` `用例#11-② 房间 6666 的目标配置在结果中可见` | ✅ |
| 12 | ① 表格首列为多选列且工具栏「批量删除」按钮可见 | `anchor-certification-47cases.test.ts` `用例#12-① 表格首列为多选列且工具栏「批量删除」按钮可见` | ✅ |
| 12 | ② 未勾选任何行时「批量删除」按钮为禁用态 | `anchor-certification-47cases.test.ts` `用例#12-② 未勾选任何行时「批量删除」按钮为禁用态` | ✅ |
| 13 | ① 勾选两行后「批量删除」按钮为可用态 | `anchor-certification-47cases.test.ts` `用例#13-① 勾选两行后「批量删除」按钮为可用态` | ✅ |
| 13 | ② 二次确认文案为「确认删除选中的 2 条主播认证标识？」 | `anchor-certification-47cases.test.ts` `用例#13-② 二次确认文案为「确认删除选中的 2 条主播认证标识？」` | ✅ |
| 14 | ① 页面轻提示为「成功删除2条数据」 | `anchor-certification-47cases.test.ts` `用例#14-① 页面轻提示为「成功删除2条数据」` | ✅ |
| 14 | ② 刷新后的列表不含两个勾选认证，仍显示未勾选认证 | `anchor-certification-47cases.test.ts` `用例#14-② 刷新后的列表不含两个勾选认证，仍显示未勾选认证` | ✅ |
| 14 | ③ 表格勾选数为 0，「批量删除」按钮恢复禁用态 | `anchor-certification-47cases.test.ts` `用例#14-③ 表格勾选数为 0，「批量删除」按钮恢复禁用态` | ✅ |
| 15 | ① 取消后两个目标认证仍各显示 1 条，列表总数仍为删除前总数 | `anchor-certification-47cases.test.ts` `用例#15-① 取消后两个目标认证仍各显示 1 条，列表总数仍为删除前总数` | ✅ |
| 15 | ② 页面不出现批量删除成功提示 | `anchor-certification-47cases.test.ts` `用例#15-② 页面不出现批量删除成功提示` | ✅ |
| 16 | ① S1 轻提示为「成功删除1条数据，1条记录不存在已跳过」 | `anchor-certification-47cases.test.ts` `用例#16-① S1 轻提示为「成功删除1条数据，1条记录不存在已跳过」` | ✅ |
| 16 | ② S1 列表不再显示认证 A 与认证 B | `anchor-certification-47cases.test.ts` `用例#16-② S1 列表不再显示认证 A 与认证 B` | ✅ |
| 16 | ③ S1 表格勾选数为 0，「批量删除」按钮恢复禁用态 | `anchor-certification-47cases.test.ts` `用例#16-③ S1 表格勾选数为 0，「批量删除」按钮恢复禁用态` | ✅ |
| 17 | ① 查询结果不再显示 uid 1789 的本用例认证 | `anchor-certification-47cases.test.ts` `用例#17-① 查询结果不再显示 uid 1789 的本用例认证` | ✅ |
| 17 | ② 页面不出现错误提示或空白页 | `anchor-certification-47cases.test.ts` `用例#17-② 页面不出现错误提示或空白页` | ✅ |
| 18 | ① 列表显示三个目标 uid 的认证，每个 uid 恰好 1 条，合计 3 条 | `anchor-certification-47cases.test.ts` `用例#18-① 列表显示三个目标 uid 的认证，每个 uid 恰好 1 条，合计 3 条` | ✅ |
| 18 | ② 三条认证类型均为金色主播-普通、认证内容均为本次内容 | `anchor-certification-47cases.test.ts` `用例#18-② 三条认证类型均为金色主播-普通、认证内容均为本次内容` | ✅ |
| 18 | ③ 三条生效时间与过期时间分别等于前置值 | `anchor-certification-47cases.test.ts` `用例#18-③ 三条生效时间与过期时间分别等于前置值` | ✅ |
| 19 | ① 目标行认证内容显示编辑后内容 | `anchor-certification-47cases.test.ts` `用例#19-① 目标行认证内容显示编辑后内容` | ✅ |
| 19 | ② 目标行认证类型与有效期保持前置快照值 | `anchor-certification-47cases.test.ts` `用例#19-② 目标行认证类型与有效期保持前置快照值` | ✅ |
| 19 | ③ 目标查询结果总行数为 1 | `anchor-certification-47cases.test.ts` `用例#19-③ 目标查询结果总行数为 1` | ✅ |
| 20 | ① 下载 1 个可打开的 xlsx 文件且首个工作表存在 | `anchor-certification-47cases.test.ts` `用例#20-① 下载 1 个可打开的 xlsx 文件且首个工作表存在` | ✅ |
| 20 | ② 表头依次为 11 列 | `anchor-certification-47cases.test.ts` `用例#20-② 表头依次为 11 列` | ✅ |
| 20 | ③ 数据行恰好 1 条 | `anchor-certification-47cases.test.ts` `用例#20-③ 数据行恰好 1 条` | ✅ |
| 20 | ④ 数据行用户ID为 1789，类型、内容、颜色与有效期等于前置造数值 | `anchor-certification-47cases.test.ts` `用例#20-④ 数据行用户ID为 1789，类型、内容、颜色与有效期等于前置造数值` | ✅ |
| 21 | ① 主表存在「成为陪玩师时间」列 | `withdraw-become-player-time-47cases.test.ts` `用例#21-① 主表存在「成为陪玩师时间」列` | ✅ |
| 21 | ② 主表原始表头索引 21 为「上次提现时间」、索引 22 为「成为陪玩师时间」 | `withdraw-become-player-time-47cases.test.ts` `用例#21-② 主表原始表头索引 21 为「上次提现时间」、索引 22 为「成为陪玩师时间」` | ✅ |
| 22 | ① 目标行「成为陪玩师时间」符合 yyyy-MM-dd HH:mm:ss 格式 | `withdraw-become-player-time-47cases.test.ts` `用例#22-① 目标行「成为陪玩师时间」符合 yyyy-MM-dd HH:mm:ss 格式` | ✅ |
| 22 | ② 目标行显示值等于前置记录值 | `withdraw-become-player-time-47cases.test.ts` `用例#22-② 目标行显示值等于前置记录值` | ✅ |
| 23 | ① 目标行「成为陪玩师时间」符合 yyyy-MM-dd HH:mm:ss 格式 | `withdraw-become-player-time-47cases.test.ts` `用例#23-① 目标行「成为陪玩师时间」符合 yyyy-MM-dd HH:mm:ss 格式` | ✅ |
| 23 | ② 目标行显示值等于前置记录值 | `withdraw-become-player-time-47cases.test.ts` `用例#23-② 目标行显示值等于前置记录值` | ✅ |
| 24 | ① 目标行「成为陪玩师时间」符合 yyyy-MM-dd HH:mm:ss 格式 | `withdraw-become-player-time-47cases.test.ts` `用例#24-① 目标行「成为陪玩师时间」符合 yyyy-MM-dd HH:mm:ss 格式` | ✅ |
| 24 | ② 目标行显示值等于前置记录值 | `withdraw-become-player-time-47cases.test.ts` `用例#24-② 目标行显示值等于前置记录值` | ✅ |
| 25 | ① 目标提现记录可见 | `withdraw-become-player-time-47cases.test.ts` `用例#25-① 目标提现记录可见` | ✅ |
| 25 | ② 目标行「成为陪玩师时间」单元格仅显示 - | `withdraw-become-player-time-47cases.test.ts` `用例#25-② 目标行「成为陪玩师时间」单元格仅显示 -` | ✅ |
| 26 | ① 首个工作表表头共 50 列 | `withdraw-become-player-time-47cases.test.ts` `用例#26-① 首个工作表表头共 50 列` | ✅ |
| 26 | ② 0 基索引 43 为「最新提现状态的更新时间」、44 为「成为陪玩师时间」、45 为「商户交易流水号」 | `withdraw-become-player-time-47cases.test.ts` `用例#26-② 0 基索引 43 为「最新提现状态的更新时间」、44 为「成为陪玩师时间」、45 为「商户交易流水号」` | ✅ |
| 26 | ③ 剔除索引 44 新列后，其余 49 列名称与顺序等于既有基线 | `withdraw-become-player-time-47cases.test.ts` `用例#26-③ 剔除索引 44 新列后，其余 49 列名称与顺序等于既有基线` | ✅ |
| 26 | ④ 代表行申请时间、大神ID、状态、支付方式与前置样本快照一致 | `withdraw-become-player-time-47cases.test.ts` `用例#26-④ 代表行申请时间、大神ID、状态、支付方式与前置样本快照一致` | ✅ |
| 27 | ① 按 uid 与申请时间可匹配 1 条导出行 | `withdraw-become-player-time-47cases.test.ts` `用例#27-① 按 uid 与申请时间可匹配 1 条导出行` | ✅ |
| 27 | ② 匹配行「成为陪玩师时间」精确等于前置记录值 | `withdraw-become-player-time-47cases.test.ts` `用例#27-② 匹配行「成为陪玩师时间」精确等于前置记录值` | ✅ |
| 27 | ③ 匹配行时间单元格不符合 yyyy-MM-dd HH:mm:ss 的数量为 0 | `withdraw-become-player-time-47cases.test.ts` `用例#27-③ 匹配行时间单元格不符合 yyyy-MM-dd HH:mm:ss 的数量为 0` | ✅ |
| 28 | ① 按 uid 与申请时间可匹配 1 条导出行 | `withdraw-become-player-time-47cases.test.ts` `用例#28-① 按 uid 与申请时间可匹配 1 条导出行` | ✅ |
| 28 | ② 首个工作表存在「成为陪玩师时间」列表头 | `withdraw-become-player-time-47cases.test.ts` `用例#28-② 首个工作表存在「成为陪玩师时间」列表头` | ✅ |
| 28 | ③ 目标空值样本的「成为陪玩师时间」单元格为空白，不显示 - | `withdraw-become-player-time-47cases.test.ts` `用例#28-③ 目标空值样本的「成为陪玩师时间」单元格为空白，不显示 -` | ✅ |
| 29 | ① 列表至少 1 行且每行「状态」均为待审核 | `withdraw-become-player-time-47cases.test.ts` `用例#29-① 列表至少 1 行且每行「状态」均为待审核` | ✅ |
| 29 | ② 新列「成为陪玩师时间」表头仍可见 | `withdraw-become-player-time-47cases.test.ts` `用例#29-② 新列「成为陪玩师时间」表头仍可见` | ✅ |
| 30 | ① 列表至少 1 行且每行「昵称/No」均包含所选陪玩师No | `withdraw-become-player-time-47cases.test.ts` `用例#30-① 列表至少 1 行且每行「昵称/No」均包含所选陪玩师No` | ✅ |
| 30 | ② 目标样本记录可见 | `withdraw-become-player-time-47cases.test.ts` `用例#30-② 目标样本记录可见` | ✅ |
| 31 | ① 列表至少 1 行且每行「申请提交时间」均在起止日期范围内 | `withdraw-become-player-time-47cases.test.ts` `用例#31-① 列表至少 1 行且每行「申请提交时间」均在起止日期范围内` | ✅ |
| 31 | ② 目标样本记录可见 | `withdraw-become-player-time-47cases.test.ts` `用例#31-② 目标样本记录可见` | ✅ |
| 32 | ① 当前页行键有序集合等于同条件预期，分页总数等于预期 | `withdraw-become-player-time-47cases.test.ts` `用例#32-① 当前页行键有序集合等于同条件预期，分页总数等于预期` | ✅ |
| 32 | ② 筛选框保持所选值且目标样本可见 | `withdraw-become-player-time-47cases.test.ts` `用例#32-② 筛选框保持所选值且目标样本可见` | ✅ |
| 33 | ① 当前页行键有序集合等于同条件预期，分页总数等于预期 | `withdraw-become-player-time-47cases.test.ts` `用例#33-① 当前页行键有序集合等于同条件预期，分页总数等于预期` | ✅ |
| 33 | ② 筛选框保持所选值且目标样本可见 | `withdraw-become-player-time-47cases.test.ts` `用例#33-② 筛选框保持所选值且目标样本可见` | ✅ |
| 34 | ① 列表至少 1 行且每行支付方式=payloco | `withdraw-become-player-time-47cases.test.ts` `用例#34-① 列表至少 1 行且每行支付方式=payloco` | ✅ |
| 34 | ② 筛选框保持所选值 | `withdraw-become-player-time-47cases.test.ts` `用例#34-② 筛选框保持所选值` | ✅ |
| 35 | ① 列表至少 1 行且每行折扣订单数>=1 | `withdraw-become-player-time-47cases.test.ts` `用例#35-① 列表至少 1 行且每行折扣订单数>=1` | ✅ |
| 35 | ② 筛选框保持所选值 | `withdraw-become-player-time-47cases.test.ts` `用例#35-② 筛选框保持所选值` | ✅ |
| 36 | ① 列表至少 1 行且每行待处理欠款金额记录非0 | `withdraw-become-player-time-47cases.test.ts` `用例#36-① 列表至少 1 行且每行待处理欠款金额记录非0` | ✅ |
| 36 | ② 筛选框保持所选值 | `withdraw-become-player-time-47cases.test.ts` `用例#36-② 筛选框保持所选值` | ✅ |
| 37 | ① 列表至少 1 行且每行银行账户风险包含有风险，收款信息不匹配 | `withdraw-become-player-time-47cases.test.ts` `用例#37-① 列表至少 1 行且每行银行账户风险包含有风险，收款信息不匹配` | ✅ |
| 37 | ② 筛选框保持所选值 | `withdraw-become-player-time-47cases.test.ts` `用例#37-② 筛选框保持所选值` | ✅ |
| 38 | ① 列表至少 1 行且每行风险类型包含洗钱审核中 | `withdraw-become-player-time-47cases.test.ts` `用例#38-① 列表至少 1 行且每行风险类型包含洗钱审核中` | ✅ |
| 38 | ② 筛选框保持所选值 | `withdraw-become-player-time-47cases.test.ts` `用例#38-② 筛选框保持所选值` | ✅ |
| 39 | ① 列表至少 1 行且每行是否是Cinta陪陪=不是 | `withdraw-become-player-time-47cases.test.ts` `用例#39-① 列表至少 1 行且每行是否是Cinta陪陪=不是` | ✅ |
| 39 | ② 筛选框保持所选值 | `withdraw-become-player-time-47cases.test.ts` `用例#39-② 筛选框保持所选值` | ✅ |
| 40 | ① 当前页行键有序集合等于同条件预期，分页总数等于预期 | `withdraw-become-player-time-47cases.test.ts` `用例#40-① 当前页行键有序集合等于同条件预期，分页总数等于预期` | ✅ |
| 40 | ② 筛选框保持所选值且目标样本可见 | `withdraw-become-player-time-47cases.test.ts` `用例#40-② 筛选框保持所选值且目标样本可见` | ✅ |
| 41 | ① 当前页行键有序集合等于同条件预期集合，分页总数等于预期 | `withdraw-become-player-time-47cases.test.ts` `用例#41-① 当前页行键有序集合等于同条件预期集合，分页总数等于预期` | ✅ |
| 41 | ② 目标组合样本可见，四个筛选框保持前置所选值 | `withdraw-become-player-time-47cases.test.ts` `用例#41-② 目标组合样本可见，四个筛选框保持前置所选值` | ✅ |
| 42 | ① 全部筛选控件恢复为前置记录的默认快照 | `withdraw-become-player-time-47cases.test.ts` `用例#42-① 全部筛选控件恢复为前置记录的默认快照` | ✅ |
| 42 | ② 列表总数恢复为前置记录的默认总数 | `withdraw-become-player-time-47cases.test.ts` `用例#42-② 列表总数恢复为前置记录的默认总数` | ✅ |
| 43 | ① 第 2 页为高亮页，首行行键不同于第 1 页，筛选与每页条数保持不变 | `withdraw-become-player-time-47cases.test.ts` `用例#43-① 第 2 页为高亮页，首行行键不同于第 1 页，筛选与每页条数保持不变` | ✅ |
| 43 | ② 返回后第 1 页为高亮页，总数仍为原总数 | `withdraw-become-player-time-47cases.test.ts` `用例#43-② 返回后第 1 页为高亮页，总数仍为原总数` | ✅ |
| 44 | ① 每页条数显示 10/page | `withdraw-become-player-time-47cases.test.ts` `用例#44-① 每页条数显示 10/page` | ✅ |
| 44 | ② 当前页数据不超过 10 行且分页总数仍为原总数 | `withdraw-become-player-time-47cases.test.ts` `用例#44-② 当前页数据不超过 10 行且分页总数仍为原总数` | ✅ |
| 44 | ③ 新列「成为陪玩师时间」表头仍可见 | `withdraw-become-player-time-47cases.test.ts` `用例#44-③ 新列「成为陪玩师时间」表头仍可见` | ✅ |
| 45 | ① 未勾选时「通过」按钮禁用，勾选一行后按钮可用 | `withdraw-become-player-time-47cases.test.ts` `用例#45-① 未勾选时「通过」按钮禁用，勾选一行后按钮可用` | ✅ |
| 45 | ② 目标记录仍显示「待审核」，页面未出现处理结果提示 | `withdraw-become-player-time-47cases.test.ts` `用例#45-② 目标记录仍显示「待审核」，页面未出现处理结果提示` | ✅ |
| 46 | ① 未勾选时「批量拒绝」按钮禁用，勾选一行后按钮可用 | `withdraw-become-player-time-47cases.test.ts` `用例#46-① 未勾选时「批量拒绝」按钮禁用，勾选一行后按钮可用` | ✅ |
| 46 | ② 目标记录仍显示「待审核」，页面未出现处理结果提示 | `withdraw-become-player-time-47cases.test.ts` `用例#46-② 目标记录仍显示「待审核」，页面未出现处理结果提示` | ✅ |
| 47 | ① 未勾选时「提交到渠道」按钮禁用，勾选一行后按钮可用 | `withdraw-become-player-time-47cases.test.ts` `用例#47-① 未勾选时「提交到渠道」按钮禁用，勾选一行后按钮可用` | ✅ |
| 47 | ② 目标记录仍显示「已通过&待打款」，页面未出现处理结果提示 | `withdraw-become-player-time-47cases.test.ts` `用例#47-② 目标记录仍显示「已通过&待打款」，页面未出现处理结果提示` | ✅ |

### 2. 非 UI 核验附录（8 项）

| 编号 | 核验点 | 脚本 / check 标记 | 结果 |
| --- | --- | --- | --- |
| N-A3-API | 广播批量删除响应 status=0/data=成功删除2条数据 | `broad-config-47cases.test.ts` `N-A3-API 广播批量删除响应 status=0 且 data=成功删除2条数据` | ✅ |
| N-A5-EMPTY | 广播批量删除空参数保护（三次） | `broad-config-47cases.test.ts` `N-A5-EMPTY 三次空请求均返回「请选择要删除的数据」且无业务删除` | ✅ |
| N-B3-LOG | 主播认证删除审计日志（DELETE/操作人/uid） | `anchor-certification-47cases.test.ts` `N-B3-LOG 每个被删认证 ID 均有 DELETE 审计日志且操作人/内容匹配` | ✅ |
| N-B5-EMPTY | 主播认证批量删除空参数保护（三次） | `anchor-certification-47cases.test.ts` `N-B5-EMPTY 三次空请求均返回「请选择要删除的数据」且无业务删除` | ✅ |
| N-D1-OBSERVE | 相对基线无新增 console error，无 HTTP 500 | `non-ui-verification.test.ts` `N-D1-OBSERVE 相对基线无新增 console error，全部业务接口无 HTTP 500` | ❌ |
| N-D2-FE | 前端部署 hash 与声明一致 | `non-ui-verification.test.ts` `N-D2-FE 部署前端 hash 与任务声明 index-cddef5cd.js 一致` | ❌ |
| N-D2-BE | 后端部署 commit 可核对 | `non-ui-verification.test.ts` `N-D2-BE 可证明后端部署 commit 与声明 funbit-api b5ad323d / lita-public f53a2c75 一致` | ❌ |
| N-D3-ENV | m-api 403 / funbit-mgr 同源入口可用 | `non-ui-verification.test.ts` `N-D3-ENV m-api 直连 403 与 funbit-mgr 同源入口可用均被记录，403 不记为业务结果` | ✅ |

### 3. 双向核对与统计

- 正向：47 条用例的 107 个检查点在代码中均有唯一 check 对应；逐条结果见上表。
- 反向：代码中所有 `用例#N-①` 形式 check 均能映射回 TK-0083 用例检查点；无额外验证点、无缺失检查点。
- 非 UI：8 项附录均有独立 check；N-A3/N-A5 在广播脚本，N-B3/N-B5 在主播脚本，N-D1/D2/D3 在非 UI 脚本。
- UI 四态统计：通过 47 / 未通过 0 / 阻塞 0 / 未执行 0；执行率 100%；通过率 100%。
- 非 UI 结论：通过 5（N-A3/N-A5/N-B3/N-B5/N-D3）；未通过 2（N-D1 缺陷 #233；N-D2-FE 候选部署偏差）；未核实/阻塞 1（N-D2-BE）。
- 证据：`official-check-results.json`、四个官方运行日志、`network-summary.md` 及本地 `evidence/` 截图；公开地址见任务 EVIDENCE.md。

> 说明：N-D1 的 405 console error 已提交缺陷 #233（前端/低/开放），不影响 47 条 UI 用例检查点；N-D2-FE 为部署 hash 与任务声明不一致的候选偏差，按已知口径记录，不创建功能缺陷；N-D2-BE 无构建/部署 commit 证据，按未核实披露。

---

# 历史轮次覆盖记录（提测 #35 / #36 / #38）
需求来源：`http://work.cinta.team/api/documents/132.md`、技术方案 `task/2026-11-04/TK-0048/TECH_DESIGN.md`、接口文档 `doc 3376`。

图例：✅ 已执行通过；❌ 已执行失败（已提缺陷）；⏭ 未执行（附原因）。

## 1. 广播召人配置批量删除

| 需求点 | 测试点 | 脚本 / 步骤 | 结果 |
|:---|:---|:---|:---|
| 列表多选列 + 批量删除按钮 | 页面存在多选列与按钮 | `broad-config-batch-delete` act2 | ✅ |
| 未勾选禁用 | 初始按钮 disabled | act2 | ✅ |
| 勾选多条 | 勾选 2 行后按钮启用 | act4 | ✅ |
| 二次确认提示条数 | 弹窗文案“确认删除选中的 2 条广播召人配置？” | act4 | ✅ |
| 取消不删除 | 取消后不发请求、行数不变、勾选保留 | act5 | ✅ |
| 成功提示（后端 data 文案） | 提示“成功删除2条数据” | act6 | ✅ |
| 列表刷新 + 勾选清空 | 删除后行消失、按钮恢复禁用 | act6 | ✅ |
| 仅删除当前页勾选行 | 新增 3 条，仅勾选 2 条，第 3 条保留 | act6 | ✅ |
| 末页整页删除后回退一页 | 英语区 3 条测试数据，页容量 2，删末页 1 条后回到第 1 页 | act9 | ✅ |
| 单条删除/新增/编辑 | 页面单条新增 → 编辑优先级 → 删除 | act7 | ✅ |
| Excel 导入 | 页面导入 1 条并接口核对 | act8 | ✅ |
| 空参/异常提示 | 空 body、空数组返回“请选择要删除的数据” | `broad-batch-delete-api` act2/3 | ✅ |
| 重复/不存在 ID | 重复去重计 1 条；不存在返回“成功删除0条数据” | `broad-batch-delete-api` act5/6/7 | ✅ |

## 2. 主播认证标识配置批量删除

| 需求点 | 测试点 | 脚本 / 步骤 | 结果 |
|:---|:---|:---|:---|
| 列表多选列 + 批量删除按钮 | 页面存在 | `anchor-certification-batch-delete` act2 | ✅ |
| 未勾选禁用 | 初始 disabled | act2 | ✅ |
| 多选 + 二次确认条数 | 勾选 2 条，弹窗“确认删除选中的 2 条主播认证标识？” | act4 | ✅ |
| 取消不删除 | 取消后不发请求、行数不变 | act5 | ✅ |
| 成功提示 + 刷新 + 清空 | “成功删除2条数据”、行消失、按钮禁用 | act6 | ✅ |
| 仅删除当前页勾选行 | 新增 3 条仅勾选 2 条，未勾选记录保留 | act6 | ✅ |
| 不存在 ID 跳过并说明 | “成功删除1条数据，1条记录不存在已跳过” | act8 | ✅ |
| 重复 ID 不误报 | `ids=[id,id]` → “成功删除1条数据” | act8 | ✅ |
| 审计日志 DELETE（含操作人） | 只读 DB 核对 `anchor_certification_log`，operate_type=DELETE、operate_name=admin、content 含 uid | act7 | ✅ |
| 单条新增（多 uid） | 页面一次新增 3 个 uid | act3 | ✅ |
| 单条编辑/删除 | 编辑认证内容、单条删除确认 | act9 | ✅ |
| 导出 | 页面导出 Excel，11 列表头完整 | act10 | ✅ |
| 末页整页删除后回退一页 | 新增 11 条“银色主播-普通”，第 2 页删除唯一记录 | act11 | ✅（首轮 ❌ 缺陷 #223，修复 `a8ae30d3db` 后回归通过） |

## 3. 审核-提现-查询新增【成为陪玩师时间】

| 需求点 | 测试点 | 脚本 / 步骤 | 结果 |
|:---|:---|:---|:---|
| 新列在上次提现时间之后 | 表头索引 21/22，紧邻 | `withdraw-become-player-time` act2 | ✅ |
| 格式 `yyyy-MM-dd HH:mm:ss` | 当前页 30 行全部符合或 `-` | act3 | ✅ |
| 空值显示 `-` | 当前页出现 4 个 `-`，接口/DB 空值对应 | act3/act5 | ✅ |
| 值与 `user_profile.become_player_time` 一致 | 非空样本页面=接口=DB；空值样本页面 `-`、DB 空 | act4/act5 | ✅ |
| 导出 Excel 含同名新列 | 50 列，0 基索引 44=成为陪玩师时间，43/45 不变 | `withdraw-export` act6 | ✅ |
| 导出值与列表一致 | 最近三个月 7 行抽样，导出值=接口值 | `withdraw-export` act7 | ✅ |
| 页面导出按钮实际参数 | 页面日期选择器输出 `yyyy-MM-dd`，导出成功（历史 startDate 类型问题复核） | `withdraw-export` act4/5 | ✅ |
| 既有筛选/分页 | 翻页、陪玩师ID筛选、状态筛选 | `withdraw-become-player-time` act6/7 | ✅ |
| 批量审核不受影响 | 状态=待审核，勾选前批量拒绝禁用、勾选后启用（不执行审核） | `withdraw-become-player-time` act8 | ✅ |
| 导出其它列不受影响 | 50 列表头逐项比对，既有列齐全 | `withdraw-export` act6 | ✅ |

## 未覆盖项与原因

| 项 | 原因 |
|:---|:---|
| 实际执行批量审核/打款 | 会修改真实提现业务数据，违反“禁止修改/删除真实业务数据”限制；仅验证入口与禁用态 |
| APIPOST 页面条目核对 | 工位无 APIPOST Token，需求方已确认以项目文档 3376 替代 |
| 数据库直连 | 执行机无测试库直连权限；改用测试环境只读查询网关 `admin-ai` 执行 SELECT |
| `ai` 账号登录 | 工位未注入 `ai` 口令；使用同环境全权限管理员账号真实登录，token 来自本次登录 |

---

# 提测 #36 返工轮次：通用分页规则（2026-11-04）

规则来源：lita-admin-original 根 `AGENTS.md`「列表与分页」。脚本：`tests/pagination-rules.test.ts`（A=广播召人，B=主播认证）。

| # | 规则/场景 | 测试点 | 脚本/步骤 | 结果 |
|:--|:---|:---|:---|:---|
| 1 | 普通翻页不变 | 第 2 页翻页后仍为第 2 页，数据与接口一致 | pagination A1 | ✅ |
| 2 | 重新查询回第 1 页 | 第 2 页点 Search 后 page=1，每页条数不变 | pagination A2 | ✅ |
| 3 | 修改每页条数回第 1 页 | 第 2 页切换 20/page 后 page=1 | pagination A3 | ✅ |
| 4 | 取消停留原页、保留勾选 | 第 2 页取消确认：page=2、勾选保留、无 batchDelete 请求 | pagination A4 | ✅ |
| 5 | 失败停留原页、保留勾选、仅提示一次 | 第 2 页注入 HTTP 500：page=2、勾选保留、1 条错误提示 | pagination A5 | ✅ |
| 6 | 批量删除成功回第 1 页并保留筛选/条数 | 英语区末页 1 条删除：page=1、locale=en、2/page、2 条数据 | pagination A6、broad 脚本 act9 | ✅ |
| 7 | 旧响应不覆盖（翻页） | 删除后第 1 页刷新暂缓，切第 2 页；释放旧响应后仍为第 2 页 | pagination A7 | ✅ |
| 8 | 批量删除主流程 | 未勾选禁用、多选、二次确认、成功文案、刷新、勾选清空、仅删勾选行 | broad 脚本 | ✅ |
| 9 | 单条增删改 / Excel 导入 | 页面新增→编辑→删除；导入后接口核对 | broad 脚本 | ✅ |
| 10 | 广播批量删除接口契约 | 空参/空数组报错、重复去重、不存在忽略、只读 DB 核对 | broad-batch-delete-api | ✅ |
| 11 | 普通翻页不变 + Search | 类型 4 第 2 页 1 条；Search 后 page=1 | pagination B1/B2 | ✅ |
| 12 | 修改每页条数回第 1 页 | 第 2 页切换 20/page 后 page=1、size=20 | pagination B3 | ✅ |
| 13 | Reset 回第 1 页并清空筛选 | 第 2 页 Reset 后 page=1、认证类型为空 | pagination B4 | ✅ |
| 14 | 取消停留原页、保留勾选 | 第 2 页取消：page=2、勾选保留、无 batchDelete 请求 | pagination B5 | ✅ |
| 15 | 失败停留原页、保留勾选、仅提示一次 | 第 2 页注入 HTTP 500：page=2、勾选保留、1 条提示 | pagination B6 | ✅ |
| 16 | 末页删空成功回第 1 页并保留筛选/条数 | 11 条类型 4，第 2 页唯一记录删除：page=1、size=10、type=4、10 条 | pagination B7、anchor 脚本 act11 | ✅ |
| 17 | 旧响应不覆盖（筛选） | 删除后刷新暂缓，切换用户ID筛选；释放旧响应后仍为筛选结果 | pagination B8 | ✅ |
| 18 | 后端 #223 超末页 | page=2/99、rows=10：status=0、data=[]、total=10 | pagination B9 | ✅ |
| 19 | 无结果查询保留每页条数 | rows=10 查询无结果：接口回显 rows=10，页面保持 10/page，Reset 后仍 10/page | pagination B10 | ❌ 缺陷 #228 |
| 20 | 主播批量删除主流程/审计/单条/导出 | 多选、取消、成功、DELETE 日志、重复/不存在 ID、编辑/删除、导出 11 列 | anchor 脚本 | ✅ |
| 21 | 提现新列与导出 | 表头索引 44、值/空值、导出 50 列、日期参数、既有筛选/分页/批量审核入口 | withdraw 脚本 | ✅ |

未覆盖项：

| 项 | 原因 |
|:---|:---|
| 实际执行批量审核/打款 | 会修改真实提现业务数据，违反数据限制；仅验证入口与禁用态 |
| APIPOST 页面条目 | 工位无 APIPOST Token，需求方已确认以项目文档 3376 替代 |
| `ai` 账号登录 | 工位未注入 ai 口令；使用同环境全权限 admin 账号，token 来自本次登录 |
| 性能/安全渗透/生产 | 任务排除项 |


---

# 提测 #38（2026-11-04 19:36）

**未验证（部署阻塞）**：测试环境入口仍为 `static/index-7b10d3c1.js`（Last-Modified 17:00:07 CST），后端实例启动时间 12:40:15 CST，均早于本轮前端提交 `eb418ed8`/`7d4a2331`（19:16/19:19）。#38 已置「未通过」，未执行全量回归，不对本轮“批量删除成功刷新当前页/恢复原交互/失败单次提示/旧请求防覆盖”作通过判定。证据与详情见 `RUNS.md` 提测 #38 章节及 `/task/20261104/TK-0058/TEST_REPORT.md`。
