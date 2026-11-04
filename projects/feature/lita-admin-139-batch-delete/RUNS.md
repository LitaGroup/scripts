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

| 缺陷 | 状态 | 关联脚本 | 回归结果 |
|:---|:---|:---|:---|
| #223 主播认证超范围分页返回系统错误，导致末页删除后不回退 | 开放 → 修复中（TK-0052） | `anchor-certification-batch-delete.test.ts` | 待修复后回归 |

## 最终回归

待缺陷 #223 修复并关闭后补充。
