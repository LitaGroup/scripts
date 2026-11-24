# RUNS — 执行记录

## R3 定向回归（TK-0552，2026-11-25）

- 环境：https://admin.test.lita.game（非生产）；入口 `static/index-f609ce81.js`（HTTP Last-Modified `2026-11-24 18:32:10 GMT` = 2026-11-25 02:32:10 +08:00）；推荐管理 chunk `recommend-config-319cdf51.js`（HTTP 200，bundle 含 `hide-on-single-page":e.listTotal===0`）；后端 funbit-mgr `GET /actuator/health` = `{"status":"UP"}`（2026-11-25 02:37 +08）
- 版本对照：#408 修复部署记录（TK-0549/TK-0551）要求入口 `index-f609ce81.js`、chunk `recommend-config-319cdf51.js`、test 合并 `55ffc525`；本轮入口与 chunk 一致（test 分支 SHA 由修复任务记录，本工位无仓库读取凭证）
- 账号：qa-ai；密码运行时注入，不落盘
- 轮次：`BL5_RUN_ID=R2F`（复用 R2 遗留 QA 测试房间，避免新增房间）；命令：`node projects/feature/lita-admin-voice-room-bl5/tests/<file>.test.ts --evidence-dir=<dir>`
- 执行时间窗：2026-11-25 02:47:14 ~ 02:59（北京时间）；tc08 于 02:58 补测
- 证据目录：`work/bl5-r3/evidence-R3/<file>/`（工位内），公开索引见任务文档 `EVIDENCE`（TK-0552）
- 单元自测：tc10 `evidence-selftest-tc10b`（22/22 通过）；红证抽查 `evidence-redproof-tc05`（#31-① 临时错误期望→失败→恢复）

| 脚本 | 用例 | 检查点 | 步数(act+check) | 耗时 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| tc05-rec-filters | #31~#39 | 24 | 37 | 81.2s | 全部通过 | 含 P0 #31~#35；红证抽查 #31-① 已恢复 |
| tc06-rec-fields | #40~#43 | 25 | 34 | 57.4s | 全部通过 | 含 P0 #40~#42（数据行展开） |
| tc07-rec-export | #44~#48 | 12 | 18 | 63.1s | 全部通过 | 含 P0 #44/#45；#46 四检查点（#407 回归保持通过） |
| tc08-rec-batch-add | #49~#57 | 27 | 40 | 95.6s | 全部通过 | 含 P0 #49；批量添加/校验/覆盖规则全部通过 |
| tc09-rec-batch-delete | #58~#60 | 9 | 13 | 85.9s | 全部通过 | 含 P0 #58~#60 |
| tc10-rec-regression | #61~#64 | 12 | 22 | 43.5s | 全部通过 | #64 v9：AC-6 造数 Total 16→28；第 2 页切 20/page → 页码 1/行数 20/Total 28/无 No Data；API 留痕仅 1 次 page=1&rows=20（无旧 page=2 覆盖） |

合计（本轮）：34 条用例 / 109 个检查点，通过 109；四态 通过 34 / 未通过 0 / 阻塞 0 / 未执行 0。
累计（R2 结果 + R3 更新）：67 条用例 / 239 个检查点；通过 67 / 未通过 0。

## R3 造数与清理记录

| 项 | 内容 | 结果 |
| --- | --- | --- |
| AC-6 分页记录 | `configKey=QA_BL5_TEST_R2F_P`，`POST /api/voiceroom/batchAddVoiceRoomConfigRecommend`，`recommendType=forever`、`weight=0`、12 个房间ID（取自房间管理列表真实行） | 造数后全量 Total=28（基线 15 + AC-1 1 + AC-6 12）；逐脚本结束接口 `batchDeleteVoiceRoomConfigRecommend` 删除并按页面「用户分类/Total」复核 |
| AC-1~AC-5 记录 | 各脚本页面「批量添加」写入 QA 自建房间（BD-1/BD-2/BD-3）的真实实验KEY | 每个脚本结束按房间页面「批量删除」并复核 |
| 清理复核（R3 结束） | 推荐列表全量 `GET voiceRoomConfigRecommendList?page=1&rows=100`：Total=15、返回 15 行、`QA_BL5_TEST*` 残留 0 | 通过（`logs-R3/cleanup-verify.log`） |
| 测试房间 | 复用 `QA-BL5-R2F-room` / `-notag` / `-cinta`；未新建房间 | 房间为既有 QA 测试数据；本轮未修改真实业务数据 |
| 数据库 | 未执行任何写库操作 | 符合授权（SQL 仅只读，本任务未使用） |

---

## R2 回归（TK-0548，2026-11-25）

- 环境：https://admin.test.lita.game（前端入口 `static/index-d0fa4676.js`，HTML Last-Modified `2026-11-24 22:57:45 +08:00`；房间管理 chunk `index-3f01b1af.js` 含 `valueTagType`）
- 后端：funbit-mgr test-mgr `fbcd3f82cc`（含 `dce6be890d`），`GET /actuator/health` = `{"status":"UP"}`（2026-11-25 00:08 +08）
- 账号：qa-ai（#1~#64）、qa-noauth（#65~#67）；密码运行时注入，不落盘
- 轮次：`BL5_RUN_ID=R2F`；命令：`node projects/feature/lita-admin-voice-room-bl5/tests/<file>.test.ts --evidence-dir=<dir>`
- 证据目录：`work/bl5-r2/evidence-R2F/<file>/`（工位内），公开索引见任务文档 `EVIDENCE`（TK-0548）
- 执行时间窗：2026-11-25 00:25:10 ~ 00:48:22（北京时间）；tc10 因 #408 失败后于 00:48~00:51 单独重跑确认

| 脚本 | 用例 | 检查点 | 步数(act+check) | 耗时 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| tc01-room-form | #1 #2 #10 #17 #27 | 13 | 21 | 4.8s | 全部通过 | - |
| tc02-room-tag-crud | #3 #4 #5 #6 #7 #11 #12 #20 | 38 | 56 | 208.9s | 全部通过 | #20 按 v8 序列 fun→fun1→orders→fun1→fun，4 次保存成功、无次数提示 |
| tc03-room-filters | #8 #9 #13 #14 #15 #16 #19 #21 #22 #23 #26 | 54 | 82 | 178.6s | 全部通过 | #15 恢复：筛选控件可见；选 chat 后 28 行逐行读取详情 Tagtype 均为 chat、BD-2(fun) 排除；Total=28=行数 |
| tc04-room-regression | #24 #25 #28 #29 #30 | 14 | 25 | 24.3s | 全部通过 | - |
| tc05-rec-filters | #31~#39 | 24 | 37 | 185.7s | 全部通过 | - |
| tc06-rec-fields | #40~#43 | 25 | 34 | 55.8s | 全部通过 | - |
| tc07-rec-export | #44~#48 | 12 | 18 | 93.2s | 全部通过 | #46 四检查点：#407 回归通过（永久时间空/无 NaN，短时起止一致） |
| tc08-rec-batch-add | #49~#57 | 27 | 40 | 100.1s | 全部通过 | - |
| tc09-rec-batch-delete | #58~#60 | 9 | 13 | 237.5s | 全部通过 | - |
| tc10-rec-regression | #61~#64 | 11 | 19 | 184.1s | 通过 10 / 未通过 1 | #64-② 切换 20/page 后列表 0 行、分页消失；缺陷 #408 |
| tc10-rec-regression（复跑） | #61~#64 | 11 | 19 | 183.9s | 通过 10 / 未通过 1 | 复跑仍复现 #64-②（同一缺陷，非偶发） |
| tc11-permission | #65~#67 | 9 | 13 | 0.9s | 全部通过 | qa-noauth 基线干净，未开启任何权限 |
| tc12-room-type-edit | #18 | 2 | 5 | 15.8s | 全部通过 | - |

合计：67 条用例 / 238 个检查点；通过 66 / 未通过 1（#64，缺陷 #408）/ 阻塞 0 / 未执行 0。
检查点：通过 237 / 未通过 1（#64-②）。

## R2 造数与清理记录

| 项 | 内容 | 结果 |
| --- | --- | --- |
| 测试房间 | `QA-BL5-R2F-room`（有标签+分类+open、Tagtype=chat）、`QA-BL5-R2F-notag`（无标签无分类+open、Tagtype=fun）、`QA-BL5-R2F-cinta`（Cinta+close）；自测轮 R2S/R2T/R2U 产生的房间 | 页面构造成功；页面无删除房间能力，保留并标注为测试数据；执行后统一清空标签/分类并置 close |
| 推荐记录 | AC-1~AC-5、#49~#60 自建记录均写入 QA 自建房间的真实实验KEY（已送礼用户/未送礼用户） | 每个脚本结束按房间页面「批量删除」并复核无残留；R2 结束再次统一清理全部 QA-BL5-* 房间记录 |
| 被编辑字段 | BD-1/BD-2/BD-3 的标签、分类、房间类型、Tagtype、openState | 按用例步骤编辑；结束时清空标签/分类并置 close；Tagtype 无清除入口，测试房间保留 chat/fun 标注 |
| 数据库 | 未执行任何写库操作；未读取数据库 | 符合任务授权（SQL 仅只读，本任务未使用） |

## 脚本修复记录（R2）

| 项 | 说明 |
| --- | --- |
| `recPageSize` / `managerPageSize` | 切换每页条数后增加列表接口响应等待，避免读取到加载中的空表；首轮 tc10 #64 的 0 行现象在修复等待后仍复现，最终归因为产品缺陷 #408，未通过等待或放宽断言掩盖 |
| #15 | 按修复后实现重写：选择 chat 后逐行打开详情 Edit 读取「房间Tagtype」，全量 28 行校验；不再使用「控件缺失」判定 |
| #20 | 按 v8 序列更新：娱乐(fun)→娱乐1(fun1)→派单(orders)→娱乐1(fun1)→娱乐(fun)，避开个人房禁用态 |
| #46 | 按 v8 扩为四检查点：AC-2 短时起止一致 + AC-1 永久空值/无 NaN |

---

## FML2 首轮（TK-0443，2026-11-24，历史保留）

- 环境：前端入口 `static/index-f156d69d.js`，HTML Last-Modified `2026-11-24 18:03:01 +08:00`
- 账号：qa-ai（#1~#64）、qa-noauth（#65~#67）；密码运行时注入，不落盘
- 轮次：`BL5_RUN_ID=FML2`；证据目录：`/tmp/opencode/evidence-<file>-FML2`（本地），公开索引见 TK-0443 `EVIDENCE.md`

| 脚本 | 用例 | 检查点 | 步数(act+check) | 耗时 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| tc01-room-form | #1 #2 #10 #17 #27 | 13 | 21 | 4.4s | 全部通过 | - |
| tc02-room-tag-crud | #3 #4 #5 #6 #7 #11 #12 #20 | 38 | 56 | 194.8s | 通过 36 / 未通过 2 | #20 阻塞（个人房类型下拉禁用，检查点①②失败） |
| tc03-room-filters | #8 #9 #13 #14 #15 #16 #19 #21 #22 #23 #26 | 54 | 80 | 110.3s | 通过 51 / 未通过 3 | #15 未通过（Tagtype 筛选项缺失，D-1/#406） |
| tc04-room-regression | #24 #25 #28 #29 #30 | 14 | 25 | 30.6s（首次） | 通过 13 / 未通过 1 | #25-③ 首次因登录 401 重试后残留错误提示失败（FLAKY） |
| tc04-room-regression（重跑） | #24 #25 #28 #29 #30 | 14 | 25 | 23.7s | 全部通过 | 基础设施中断后整条重跑；首次失败证据保留 |
| tc05-rec-filters | #31~#39 | 24 | 37 | 185.9s | 全部通过 | - |
| tc06-rec-fields | #40~#43 | 25 | 34 | 59.1s | 全部通过 | - |
| tc07-rec-export | #44~#48 | 11 | 17 | 87.6s | 通过 10 / 未通过 1 | #46-③ 未通过（永久记录推荐时间 NaN，D-2/#407） |
| tc08-rec-batch-add | #49~#57 | 27 | 40 | 98.5s | 全部通过 | - |
| tc09-rec-batch-delete | #58~#60 | 9 | 13 | 236.9s | 全部通过 | - |
| tc10-rec-regression | #61~#64 | 11 | 19 | 184.9s | 全部通过 | - |
| tc11-permission | #65~#67 | 9 | 13 | 0.8s | 全部通过 | qa-noauth 基线干净 |
| tc12-room-type-edit | #18 | 2 | 5 | 15.1s | 全部通过 | 使用非个人房行验证编辑弹窗 |

合计：67 条用例 / 237 个检查点；通过 64 / 未通过 2 / 阻塞 1 / 未执行 0。

## FML2 造数与清理记录（历史）

| 项 | 内容 | 结果 |
| --- | --- | --- |
| 测试房间 | `QA-BL5-FML2-room`、`-notag`、`-cinta` | 页面构造成功；页面无删除房间能力，保留并标注测试数据 |
| 推荐记录 | AC-1~AC-5 与 #49~#60 产生的记录 | 页面「批量添加」构造；每个脚本结束按房间「批量删除」并复核无残留 |
| 真实实验KEY | 已送礼用户 / 未送礼用户 | 仅写入 QA 自建房间；执行后立即批量删除，未触碰存量记录 |
| 数据库 | 未执行任何写库操作 | 符合任务授权 |
