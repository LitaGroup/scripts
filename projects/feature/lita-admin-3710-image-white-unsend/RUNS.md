# RUNS — 项目 3710 图片白名单 + Unsend（TK-0136）

执行机：Linux，Node v24.22.1，Playwright 1.64.1（Chromium headless），时区 Asia/Shanghai。
环境：UI `https://admin.test.lita.game`；接口同源入口 `https://funbit-mgr.test.cinta.team`；账号口令仅运行时注入，本记录不含口令或 token。

## 0. 部署基线（2026-11-09）

| 项 | 实测 | 结论 |
| --- | --- | --- |
| 前端入口 JS | `static/index-f3fad263.js` | 本轮实际运行构建 |
| 入口 HTML Last-Modified | `Mon, 09 Nov 2026 12:33:30 GMT` = 2026-11-09 20:33:30 CST | 早于执行时间，执行期间无再次部署 |
| 图片白名单页面 chunk | `static/index-ddc0acfc.js`，含 `/api/userImageWhite/{list,addList,delete}`、500 上限、7 列、page-sizes 10/20/30/40/50 | 已部署 |
| 聊天记录 chunk | `static/player-conver-3fec84bd.js`，含 `UNSEND`/`Unsend`、四项下拉、`messageTypeFilter` | 已部署 |
| 会话限制白名单 chunk | `static/im-white-f8517031.js`，`handleClearFilter` 仅清空 `valueUserId` | 既有行为 |
| 后端健康 | `/funbit/health` → `i'm ok` | 可用 |

## 1. 自测与脚本修复记录

| 时间（CST） | 范围 | 结果 | 说明 / 证据目录 |
| --- | --- | --- | --- |
| 22:55 | `--from=1 --to=5` | 44 步全部通过 | `evidence-tk136/selftest-1-5/` |
| 22:56 | `--from=7 --to=8` | 33 步 30 成功 / 3 失败 | #7-①/③ 当前页选择器误用 `.is-active`，修正为 `.active`；#7-④ 单页分页隐藏，后续修正断言 |
| 22:58 | `--from=7 --to=7` | 13 步 12 成功 / 1 失败 | #7-④ 单页分页隐藏；证据 `selftest-7b/`（首次失败保留） |
| 22:58 | `--from=10 --to=16` | 46 步全部通过 | `selftest-10-16/` |
| 22:59 | `--from=18 --to=24` | 32 步 28 成功 / 4 失败 | #24 因 Service Worker 绕过 WAF 转发触发 CORS，修正浏览器上下文 `serviceWorkers:'block'` |
| 23:01 | `--from=22 --to=24` | 14 步全部通过 | `selftest-22-24b/` |
| 23:01 | `--from=26 --to=28` | 26 步 24 成功 / 2 失败 | #26-②、#28-③ 用例问题 Q-01（Reset 不刷新），保留失败 |
| 23:02 | `--from=9 --to=9` | 10 步全部通过；500 行清理耗时 452s | `selftest-9/` |
| 23:10 | 权限脚本 | 9 步全部通过（#17 3 + NU-01 3） | `selftest-permission/` |
| 23:12 | `--from=22 --to=28` | 35 步 33 成功 / 2 失败 | 仅 #26-②、#28-③ 用例问题；`selftest-22-28c/` |
| 23:12 | `--from=15 --to=15` | 13 步全部通过 | `selftest-15c/` |

脚本类修复（均未改期望值/未放宽断言）：

1. `listTotal()` 当前页选择器：`.el-pager li.is-active` → `.el-pager li.active, .el-pager li.is-active`。
2. `convoSetDates()`/`sessionReset()`/`selectByLabel()` 等改为等待可观测的输入值/下拉项，移除固定 sleep。
3. 浏览器上下文 `serviceWorkers: 'block'`，避免 SPA Service Worker 绕过 WAF 同源转发导致 CORS。
4. #7-④：Total=11、20/page 只有 1 页，`el-pagination` 按 `hide-on-single-page` 隐藏；在“仅一个分页即第 1 页”时以 Total/行数/ID 集合等价判定，数据口径未放宽。

## 2. 红证抽查（P0）

| 时间（CST） | 目标 | 操作 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 23:12 / 23:34 | P0 `用例#1-① 路由` | 临时副本把期望路由改为 `#/user-manager/user-image-white-REDPROOF`，仅运行 #1；随后用原脚本重跑 #1 | 失败：`[check] 用例#1-① status:"fail"`（expect=REDPROOF, real=原路由）；恢复后：`[check] 用例#1-① status:"success"`；9 步 8 成功/1 失败 → 9/9 通过；临时脚本已删除，未提交 | `redproof-v2-fail.log`、`redproof-v2-restored.log`、`redproof-comparison.log`（公开地址见 EVIDENCE E-32） |

### 2.1 返工补充（红证）

- 可复现红证日志：`redproof-v2-fail.log`（`[check] 用例#1-① ... status:"fail"`，expect=`...-REDPROOF`）、`redproof-v2-restored.log`（`[check] 用例#1-① ... status:"success"`）、`redproof-comparison.log`（两段对照）；临时脚本已删除，未提交。公开地址见 EVIDENCE E-32。

## 3. 正式执行

| 轮次 | 时间（CST） | 命令 | 覆盖 | 结果 | 证据目录 |
| --- | --- | --- | --- | --- | --- |
| 正式-主脚本 | 23:13:18~23:23:00 | 全量（#1~#28） | 167 步 / 87 check | 164 成功 / 3 失败：`#7-④`（单页隐藏可观测性缺口）、`#26-②`、`#28-③`（用例问题 Q-01） | `evidence-tk136/formal-20261109-2313/` |
| 正式-权限脚本 | 23:23:35~23:23:37 | #17 + NU-01 | 9 步 / 6 check | 全部通过 | `evidence-tk136/formal-permission-2313/` |
| 正式-#7 重跑 | 23:24:08~23:24:29 | `--from=7 --to=7` | 13 步 / 4 check | 全部通过（`current=(hidden), total=11, rows=11, pagesVisible=false`） | `evidence-tk136/formal-case7-rerun/` |

### 定稿口径

- #7-④ 采用重跑结果；首次正式失败原因是 **单页分页控件 `hide-on-single-page` 隐藏、currentPage 不可观测**，属用例/技术方案可观测性缺口，**非 FLAKY、非产品缺陷**；按 TECH_DESIGN §6 ④ 的 count 口径以 Total=11/rows=11/11 个 ID 等价判定，数据口径未放宽。首次失败 `run.json`/截图保留在 `formal-20261109-2313/`，未用成功证据覆盖。
- #26-②、#28-③ 保持失败结论，归因为用例问题 Q-01（Reset Filters 不刷新），用例级按阻塞记录；不伪造通过。
- #6、#19、#20、#25 无 check，仅阻塞取证；#19/#20/#25 的 Unsend 空结果截图 `formal-20261109-2313/17-case19-25-unsend-empty.png`。

### FLAKY 风险

| 用例 | 首次失败现象 | 正式执行现象 | 证据 |
| --- | --- | --- | --- |
| #7（自测页面竞态） | 自测 `selftest-7b`：切 20/page 后页面 No Data；API 同时发出 `page=2&rows=20`（空）与 `page=1&rows=20`（11 行），最后渲染为 page=2 空结果 | 正式执行 final 请求 `page=1&rows=20`，11 行、Total=11；单页分页隐藏 | 自测失败截图/run.json + 正式 calls 126/127；首次失败证据保留。**注：#7-④ 正式首次失败为可观测性缺口，不按 FLAKY 计。** |

## 4. 数据清理

| 项 | 执行前 | 执行后 | 证据 |
| --- | --- | --- | --- |
| 图片白名单 `user_image_white` | 0 行 | 0 行 | 只读 SQL 计数 0；`run.json` 清理日志 |
| 图片白名单本轮行（Operator=qa-tk136-admin） | — | 500+11+12+… 全部删除；收尾清理 0 | `whiteCleanupByOperator` 日志/截图 |
| 会话限制白名单 `user_im_white` | 17 行 | 17 行；测试用户 S=16302、I=16305 均不存在 | 只读 SQL：total=17、test_rows=0 |
| 会话限制白名单历史集合 | 17 ID | 17 ID 不变 | #26-③/#27/#28 case 检查 |
| 测试账号/角色 | 创建 qa-tk136-admin、qa-tk136-noimg、角色 qa_tk136_noimg | 全部删除；页面剩余 qa-tk136 相关 0 | `evidence-tk136/cleanup-accounts/{before,after}.png` |
| UNSEND 数据 | 0 | 0（未造数） | 只读 SQL `player_message.biz='UNSEND'`=0 |

## 5. 环境/依赖未验证

- 3709/IM 未交付真实 UNSEND 数据（`player_message.biz='UNSEND'`=0，`im_message.status=6`=0），#19/#20/#25 阻塞。
- NU-02 无 3709/IM 客户端条件，未验证；待 3709 联调。

## 6. TK-0140 缺陷 #252 回归（2026-11-10）

### 6.1 部署基线

| 项 | 实测 | 结论 |
| --- | --- | --- |
| 前端入口 JS | `static/index-02cabc45.js` | 修复后构建 |
| 入口 HTML Last-Modified | `Mon, 09 Nov 2026 15:55:35 GMT` = 2026-11-09 23:55:35 CST | 晚于修复推送 23:52 CST |
| 图片白名单 chunk | `static/index-30a2dc02.js` | 含 `handleSizeChange(i){this.pageSize=i,this.currentPage=1,this.fetchData()}` 与 `fetchSeq` 过期响应防护 |
| 后端健康 | `/funbit/health` 可用（登录与接口正常） | 可用 |

### 6.2 自测与红证

| 时间（CST） | 范围 | 结果 | 证据 |
| --- | --- | --- | --- |
| 00:00 | `CASES=7`（首次） | 13 步 12 成功 / 1 失败：T=21 时 10/page 的第 2 页应为 10 行而非 11，修正 #7-③ 行数口径后重跑 | `evidence/lita-admin-3710-image-white-unsend-20261110-000059/` |
| 00:01 | `CASES=7`（修复口径后） | 13 步全部通过；#7-④ `current=1,pageSize=20/page,total=21,rows=20,pages=[1,2],badSizeCalls=[]` | `evidence/lita-admin-3710-image-white-unsend-20261110-000153/` |
| 00:02 | `CASES=26,27,28` | 28 步全部通过；#26-②/#28-③ 按实际行为（Reset 后补 Search）通过 | `evidence/lita-admin-3710-image-white-unsend-20261110-000227/` |
| 00:04 | `CASES=2,5,14` | 28 步全部通过 | `evidence/lita-admin-3710-image-white-unsend-20261110-000401/` |
| 00:05 | 红证：临时副本将 #7-④ 的 `p4.current === '1'` 改为 `'9'` | `[check] 用例#7-④ status:"fail"`；删除临时副本后恢复脚本 `status:"success"` | `redproof-7-fail.log`、`redproof-7-restored.log` |

### 6.3 正式回归

| 轮次 | 时间（CST） | 命令 | 覆盖 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- |
| TK-0140 回归 | 00:05:xx~00:08:xx | `CASES=2,5,7,14,26,27,28` | 59 步 / 22 check | **全部通过**（0 失败 / 0 skip） | `formal-regression/`、`formal-regression.log` |

- #7 请求序列（run.json）：`page=1&rows=10` → `page=2&rows=10` → `page=1&rows=20`，无 `page=2&rows=20`。
- #26/#28 默认列表：Reset 后补 Search（USER ID 为空），Total=17、历史 17 ID 不变。
- 提测 46 在正式回归前置「进行中」，回归完成后按真实结果重新判定。

### 6.4 数据清理（TK-0140）

| 项 | 执行前 | 执行后 | 证据 |
| --- | --- | --- | --- |
| 图片白名单 `user_image_white` | 0 行 | **0 行** | 只读 SQL；各轮 `whiteCleanupByOperator` 日志 |
| 会话限制白名单 `user_im_white` | 17 行 | **17 行**；测试用户 16302/16305 均不存在 | 只读 SQL：total=17、test_rows=0 |
| 会话限制白名单历史集合 | 17 ID | **17 ID 不变** | #26-③/#27/#28 检查 |
| 测试账号/角色 | 使用既有 qa-ai（507 权限） | 未新建/未删除账号；无残留 | 登录日志（不输出凭证） |
