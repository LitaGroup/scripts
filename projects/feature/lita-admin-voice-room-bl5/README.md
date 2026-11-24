# Lita Admin 语音房优化（BL-0005 / TK-0443）UI 自动化用例

> 需求：PRD #3725 §4~§7（Admin 房间管理 / 房间推荐管理）
> 用例：TK-0442 交付的 67 条九列 UI 用例（#1~#67）
> 技术方案：`/task/20261124/TK-0442/TECH_DESIGN`
> 执行任务：TK-0443（WO-0043 / release #67）

## 1. 运行方式

Node.js 24+，仓库根目录直接运行（无需编译）：

```bash
# 有权限账号（#1~#64）
ADMIN_USERNAME=<有权限账号> ADMIN_PASSWORD=<密码> BL5_RUN_ID=<本轮标识> \
  node projects/feature/lita-admin-voice-room-bl5/tests/tc01-room-form.test.ts

# 无权限账号（#65~#67）
ADMIN_USERNAME=<有权限账号> ADMIN_PASSWORD=<密码> \
ADMIN_NOAUTH_USERNAME=<无权限账号> ADMIN_NOAUTH_PASSWORD=<密码> \
  node projects/feature/lita-admin-voice-room-bl5/tests/tc11-permission.test.ts
```

- `BL5_RUN_ID`：本轮造数标识。造数前缀 `QA-BL5-{BL5_RUN_ID}`，房间名 `-room/-notag/-cinta`。
  **每轮执行请使用新的 runId**（用例 #3/#7 的新建步骤要求同名房间不存在）。
- 账号密码只从环境变量注入，禁止写入代码/日志/证据/报告。
- 证据默认写入 `./evidence/{脚本名}-{时间}/`（截图 + `run.json`：请求响应留痕、清理记录、页面异常）。

## 2. 文件与覆盖

| 文件 | 用例 | 说明 |
| --- | --- | --- |
| `tests/tc01-room-form.test.ts` | #1 #2 #10 #17 #27 | 新建/编辑弹窗结构、Room Tag 开关、Room Category、房间类型 |
| `tests/tc02-room-tag-crud.test.ts` | #3 #4 #5 #6 #7 #11 #12 #20 | Room Tag / Room Category 写操作与房间类型连续修改 |
| `tests/tc03-room-filters.test.ts` | #8 #9 #13 #14 #15 #16 #19 #21 #22 #23 #26 | 房间列表新增筛选 + 原有筛选回归 + 空态 |
| `tests/tc04-room-regression.test.ts` | #24 #25 #28 #29 #30 | 列表列、分页、details/Edit 入口、角色入口、行操作 |
| `tests/tc05-rec-filters.test.ts` | #31~#39 | 推荐管理筛选（大区/状态/类型/房间ID/用户分类/组合/重置） |
| `tests/tc06-rec-fields.test.ts` | #40~#43 | 推荐管理展示字段、生效状态、历史空值 |
| `tests/tc07-rec-export.test.ts` | #44~#48 | 批量导出（文件名/列名/数据一致/空结果/空值） |
| `tests/tc08-rec-batch-add.test.ts` | #49~#57 | 批量添加（永久/短时/分隔符/校验/覆盖） |
| `tests/tc09-rec-batch-delete.test.ts` | #58~#60 | 批量删除（禁用/确认/取消） |
| `tests/tc10-rec-regression.test.ts` | #61~#64 | 推荐管理原有功能回归与分页 |
| `tests/tc11-permission.test.ts` | #65~#67 | qa-noauth 权限基线 |

`tests/lib/admin-base.ts`：登录、截图、请求留痕、脱敏、表格/弹窗/消息/分页等通用能力。
`tests/lib/voice-room-base.ts`：两页面元素定位、筛选、房间新建/编辑、推荐记录构造与清理、测试夹具。

## 3. 造数、清理与数据隔离

- 房间：页面「新建语音房」构造 `QA-BL5-{runId}-room`（有标签+分类+open）、`-notag`（无标签无分类+open）、
  `-cinta`（Cinta+close）。页面无删除房间能力，结束时清空标签/分类并置 close，保留并标注为测试数据。
- 推荐记录：通过页面「批量添加」写入真实实验KEY（已送礼用户 / 未送礼用户），仅使用 QA 自建房间；
  执行后通过页面「批量删除」按房间清理（`recDeleteByRoomIds`，含清理后复核）。
- 不写数据库、不直接调用写接口；验证点全部读取页面内容（含颜色 computed style、Excel 下载内容）。

## 4. 判定与输出

- 每个检查点一个 `check`，标题格式 `用例#N-① ...`（数据变体为 `用例#N-①[数据行x] ...`）。
- 输出协议沿用平台 `CheckBaseClass`：`[start]/[act]/[check]/[done]`。
- `COVERAGE.md` 为用例检查点与 check 的双向核对表；`RUNS.md` 为执行记录与证据目录索引。

## 5. 已知口径

- 用例 #15「房间Tagtype」筛选项：按 PRD §6 预期存在；实测缺失，判未通过并提交缺陷（CD-1）。
- 用例 #47 空结果导出：检查点①为通过判据，检查点②为实际行为观察记录。
- 用例 #46 导出比对：大区按 locale 编码（列表展示 `印尼(in)` ↔ 导出 `in`）、推荐类型按 `短时 ↔ 暂时`
  展示映射比对，其余字段严格相等；映射差异作为观察项记录。

## 6. 执行结果（FML2，2026-11-24）

- 67 条用例：通过 64 / 未通过 2（#15 D-1/#406、#46 D-2/#407）/ 阻塞 1（#20 用例数据序列冲突）/ 未执行 0。
- 检查点 237 个：通过 231 / 未通过 6。
- 明细见 `COVERAGE.md`（双向核对）与 `RUNS.md`（逐脚本运行记录）；证据见任务文档 `EVIDENCE.md`。
