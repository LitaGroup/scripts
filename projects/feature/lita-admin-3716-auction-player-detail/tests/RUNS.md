# RUNS — 项目 3716「拍拍模式流水-主播维度」

> 环境：https://admin.test.lita.game（非生产）｜账号 qa-ai（运行时注入）｜前端入口 `static/index-c1477f3a.js`，HTML Last-Modified `2026-11-11 11:03:46 GMT`
> 数据：BD-0 测试环境存量只读（2026-11-10 等），不造数、无清理。

## 1. 正式执行（2026-11-11）

| 轮次 | 脚本 | 用例# | check | 结果 | 耗时 | 证据目录 |
|:--|:--|:--|--:|:--|--:|:--|
| F1 | `tc-formal-p0.test.ts` | 1/4/5/6/7/9 | 18 | 18/18 通过 | 75s | `evidence/formal-p0` |
| F2 | `tc-formal-p0-filter.test.ts` | 11/12(D1/D2)/13 | 10 | 10/10 通过 | 831s | `evidence/formal-p0-filter` |
| F3 | `tc-formal-p0b.test.ts` | 17/18/16 | 11 | 11/11 通过 | 53s | `evidence/formal-p0b` |
| F4 | `tc-formal-p1.test.ts` | 10/8 | 7 | 7/7 通过 | 131s | `evidence/formal-p1` |
| F5 | `tc-formal-p1b.test.ts` | 14/15 | 6 | 6/6 通过 | 99s | `evidence/formal-p1b` |
| F6 | `tc-formal-p2.test.ts` | 19/20 | 6 | 6/6 通过 | 64s | `evidence/formal-p2` |
| F7 | `tc-formal-p2-edge.test.ts` | 21/22 | 6 | 6/6 通过 | 81s | `evidence/formal-p2-edge` |

- 合计 64/64 已代码化 check 通过；未代码化 3 个 check（用例#2 TC-AUTH-02 ①、#3 TC-AUTH-03 ①②）因无受限账号记阻塞。
- 正式轮无断言失败、无 FLAKY（未出现“重试才通过”的用例）。
- 环境波动记录（不影响正式结论）：自测/准备阶段遇 data-main 查询偶发 502（HTML Bad Gateway），已在基类增加 ODPS 查询节流与 502 快速失败；正式轮未再出现导致用例失败的环境中断。

## 2. 红证抽查（自测阶段）

- 抽查用例：#9 TC-QUERY-01 ③（P0，合计 445,824.52）。
- 方法：临时脚本 `_redproof.test.ts` 将期望值改为 `445,824.53`，其余动作与正式脚本一致（登录→2026-11-10 查询→50/page→求和）。
- 结果：对应 check **失败** — `expect=445824.53, real=445824.52`，证明断言非永真。
- 恢复：删除临时脚本；正式 `tc-formal-p0.test.ts` 以正确期望值运行 18/18 通过。
- 证据：`evidence/redproof.log`、`evidence/redproof/`。

## 3. 自测阶段修正记录（仅脚本类问题，未改断言口径）

| 问题 | 处理 |
|:--|:--|
| Playwright `waitForResponse` 在多次查询后偶发漏捕（响应已到但事件未触发） | `clickQuery` 改为以页面可观察状态（行数/空态/Total 变化）等待新结果，响应事件仅用于状态码/节流 |
| Node fetch 转发连接池复用导致请求挂起 | 改用 Playwright `route.fetch` 做网络层同源原样转发 |
| 连续查询触发 data-main 502 | 基类增加 20s 查询发送节流；502 快速失败，不空等 |
| P1 翻页激活页选择器 `.is-active` 不匹配 | 兼容 Element UI `.active` 类 |
| P2 路由切换后旧筛选区残留，REG-02 ① 误读旧页面 | 等待 PDR 专有「数据维度」筛选项出现后再读取 |
| P1B 独立脚本缺少导航/rows 辅助 | 补 `nav + waitReportReady` 与 `rows()`（不影响断言） |
| 浏览器偶发被系统回收 | Chromium 启动参数增加 `--disable-dev-shm-usage --disable-gpu` |

## 4. 运行命令

```bash
cd projects/feature/lita-admin-3716-auction-player-detail/tests
ADMIN_USERNAME=*** ADMIN_PASSWORD=*** node tc-formal-p0.test.ts --evidence-dir=./evidence/p0
# 其余脚本同上（p0-filter/p0b/p1/p1b/p2/p2-edge）
```
