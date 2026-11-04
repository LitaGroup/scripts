# 运行记录（提测 #35 / 项目139）

执行机：Linux，Node v24.22.1，Chromium 156（Playwright 1.64.1），时区 Asia/Shanghai。
运行方式：在 `LitaGroup/scripts` 仓库根目录执行，`ADMIN_USERNAME/ADMIN_PASSWORD/LITA_USER_TOKEN` 均通过运行时环境注入（密码与 token 不记录）。

## 提测状态流转

| 时间 | 操作 | 结果 |
|:---|:---|:---|
| 2026-11-04 12:03 | `POST /api/releases/35/status.md` `{"status":"进行中"}` | 成功，提测 #35 状态 = 进行中（首次执行脚本前） |

## 首轮测试（缺陷修复前）

| 时间 | 脚本 | 命令（脱敏） | 结果 | 证据 |
|:---|:---|:---|:---|:---|
| 2026-11-04 12:16:48 | `broad-config-batch-delete.test.ts` | `ADMIN_USERNAME=*** ADMIN_PASSWORD=*** node ...` | 9/9 通过 | `evidence/broad-config-batch-delete-20261104-121648/` |
| 2026-11-04 12:35:25 | `anchor-certification-batch-delete.test.ts` | 同上 | 10 通过 / 1 失败（末页回退，缺陷 #223） | `evidence/anchor-certification-batch-delete-20261104-123525/` |
| 2026-11-04 12:32:36 | `withdraw-become-player-time.test.ts` | 同上 | 8/8 通过 | `evidence/withdraw-become-player-time-20261104-123236/` |
| 2026-11-04 12:33:58 | `withdraw-export.test.ts` | 同上 | 8/8 通过 | `evidence/withdraw-export-20261104-123358/` |
| 2026-11-04 12:35:00 | `broad-batch-delete-api.test.ts` | 同上 + `LITA_USER_TOKEN` | 7/7 通过 | `evidence/broad-batch-delete-api-20261104-123500/` |

说明：

- 调试阶段曾因脚本自身问题失败（multipart 上传经代理丢 body、列表固定列选择器、分页子行干扰），均已修正后重跑，不属于产品缺陷。
- 主播认证末页回退失败已复现最小请求：`POST /api/anchor/certification/page page=3`（total=19）返回 `status=3 系统错误`，提交缺陷 **#223**（后端，高），修复任务 TK-0052。
- 缺陷详情：`http://work.cinta.team/api/defects/223.md`。

## 缺陷闭环

| 缺陷 | 状态 | 修复 | 关联脚本 | 回归结果 |
|:---|:---|:---|:---|:---|
| #223 主播认证超范围分页返回系统错误，导致末页删除后不回退 | 开放 → 修复（12:44:19）→ 关闭（12:48:06） | funbit-api `test-mgr` `a8ae30d3db`（合并 `13e0efec1b`） | `anchor-certification-batch-delete.test.ts` | 2026-11-04 12:44:44 运行 11/11 通过；超范围 page=3/5 返回 status=0、data=[] |

## 最终回归（缺陷全部关闭后）

时间：2026-11-04 12:48 ~ 12:50（CST）
环境：Admin `https://admin.test.lita.game`；接口 `https://funbit-mgr.test.cinta.team`；只读 DB 查询网关。

| 时间 | 脚本 | 结果 | 证据 |
|:---|:---|:---|:---|
| 12:48:09 | `broad-config-batch-delete.test.ts` | 9/9 通过 | `evidence/broad-config-batch-delete-20261104-124809/` |
| 12:48:34 | `anchor-certification-batch-delete.test.ts` | 11/11 通过 | `evidence/anchor-certification-batch-delete-20261104-124834/` |
| 12:49:03 | `withdraw-become-player-time.test.ts` | 8/8 通过 | `evidence/withdraw-become-player-time-20261104-124902/` |
| 12:49:46 | `withdraw-export.test.ts` | 9/9 通过 | `evidence/withdraw-export-20261104-124946/` |
| 12:49:55 | `broad-batch-delete-api.test.ts` | 7/7 通过 | `evidence/broad-batch-delete-api-20261104-124955/` |
| — | **合计** | **44 通过 / 0 失败 / 0 跳过** | — |

最终回归后复核：英语区广播召人测试房间无残留；主播认证测试 uid 无残留；类型 4 认证数量为 0。

提测 #35 于 2026-11-04 12:50:07 置为 **已通过**。

---

# 提测 #36 返工轮次（2026-11-04）

执行机：Linux，Node v24.22.1，Chromium（Playwright 1.64.1），时区 Asia/Shanghai。
运行方式：仓库根目录，`ADMIN_USERNAME` / `ADMIN_PASSWORD` / `LITA_USER_TOKEN` 运行时注入（密码与 token 不落盘）。
账号说明：工位未注入 `ai` 口令，使用同环境全权限管理员 `admin`。

## 提测状态流转

| 时间 | 操作 | 结果 |
|:---|:---|:---|
| 2026-11-04 17:08 | `POST /api/releases/36/status.md {"status":"进行中"}` | 成功，提测 #36 = 进行中 |

## 缺陷修复前运行

| 时间 | 脚本 | 结果 | 证据 |
|:---|:---|:---|:---|
| 17:17 | broad-config-batch-delete | 9/9 通过 | `evidence/broad-config-batch-delete-20261104-171733/` |
| 17:41 | anchor-certification-batch-delete | 11/11 通过 | `evidence/anchor-certification-batch-delete-20261104-1741*/` |
| 17:42 | pagination-rules | 19/20 通过；失败=缺陷 #228 | `evidence/pagination-rules-20261104-174227/` |
| 17:39 | broad-batch-delete-api | 7/7 通过 | `evidence/broad-batch-delete-api-*/` |
| 17:46 | withdraw-become-player-time | 8/8 通过 | `evidence/withdraw-become-player-time-*/` |
| 17:46 | withdraw-export | 9/9 通过 | `evidence/withdraw-export-20261104-174600/` |

## 缺陷

| 缺陷 | 状态 | 关联 | 说明 |
|:---|:---|:---|:---|
| #228 主播认证分页无结果时未回显请求 rows，前端每页条数 10→20 | 开放 | 修复子任务 TK-0059 | 后端 `AnchorCertificationService.pageList` count<=0 分支未设置 page/rows |

最终回归与提测判定在 #228 修复后补充。

---

# 提测 #38（2026-11-04 19:36 创建）

## 结论：未验证（测试环境部署阻塞）

需求方 19:40 指示：本轮新提测为 #38，期望前端 `lita-admin-original @ dev` `7d4a2331`（功能提交 `eb418ed8`，2026-11-04 19:16/19:19 CST）；若测试环境未部署本次提交，输出阻塞报告并将 #38 置未通过。

| 检查项（2026-11-04 19:39~19:40 CST） | 实测 | 判定 |
|:---|:---|:---|
| Admin 入口构建 | `static/index-7b10d3c1.js`（与 #36 相同） | 旧构建 |
| Admin HTML Last-Modified | 2026-11-04 09:00:07 GMT = 17:00:07 CST | 早于提交 19:16/19:19 |
| Admin HTML SHA256 | `d78e09288747340515d004cd23baaf26eb923b5d449bb09cef0773138dba39d5` | 构建未更新 |
| 后端实例启动 | `process_start_time_seconds=1.793767215895E9` = 12:40:15 CST | 实例未重启 |
| 接口探针 | rows=10/7 的空结果仍返回 `data.rows=20`；正常 rows=10；page=99 返回 `data=[]` | 后端旧实例 |
| 页面行为 | 主播认证空结果后 size 10→20 | 旧交互 |

- 提测 **#38 已置「未通过」**（判定时间 2026-11-04 19:39:57），备注：测试环境未部署本次提交，未验证。
- 未执行 #38 全量回归：旧构建不能代表 #38 结果；#38 的“批量删除成功刷新当前页/恢复原交互/失败单次提示/旧请求防覆盖”均未判定。
- 证据：`evidence/release38-deploy-blocked-20261104-193948/`（入口 HTML/headers/hash、actuator、api-probe.json、ui-probe 截图与 run.json）。
- 详细报告：`/task/20261104/TK-0058/TEST_REPORT.md`（阅读地址 `http://work.cinta.team/api/docs/detail/task/20261104/TK-0058/TEST_REPORT.md`）。
