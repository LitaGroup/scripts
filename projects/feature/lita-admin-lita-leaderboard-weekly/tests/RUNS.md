# RUNS — 项目 3713 Lita Leaderboard Weekly Data（TK-0216）

运行环境：https://admin.test.lita.game（非生产）；账号 qa-ai（运行时注入，未落盘）；Node v24.22.1；Playwright 1.64.1。
工位约定：`TMPDIR` 指向工作区（/tmp 配额不足会导致浏览器下载/截图写盘失败）；入口 `index-c1477f3a.js`（2026-11-11 11:03:46 GMT）。

## 1. 自测轮（编码阶段）

| 时间 | 脚本 | check | 结果 | 说明 |
| --- | --- | ---: | --- | --- |
| 20:40 | tc-p0-core | 51 | 50 / 1 fail | 首轮暴露：用例间筛选项残留（相同 hash 导航未重载）→ 改为「定位路由 + 页面重置清空」 |
| 20:45 | tc-p0-core | 51 | 51/51 | 修复后通过 |
| 20:50 | tc-p1-core | 43 | 41 / 2 fail | 暴露 Week 列口径（9⑦/17④），提交任务提问 |
| 21:02 | tc-compat-chrome | 3 | 3/3 | Chrome 157.0.8103.50 |
| 21:02 | tc-compat-edge | 3 | 3/3 | Edge 157.0.4341.46 |
| 21:03 | tc-p0-core（红证） | 51 | 预期失败 | 临时把 D1 期望 Nick 改为 REDPROOF-EXPECTED-XYZ：`用例#6-③[D1]`、`用例#7-①[D1/D2]` 失败；已恢复并删除临时文件 |
| 21:03 | tc-p1-core | 43 | 41 / 2 待澄清 | 9⑦、17④ Week 列口径（已提问） |
| 21:03 | 需求方答复 | — | 已确认 | 9⑦/17④ 按周归一口径判通过；用例 14 按基线漂移实际存量判定 |

## 2. 正式执行（提测 52 置「进行中」后）

| 时间 | 脚本 | check | 结果 | 说明 |
| --- | --- | ---: | --- | --- |
| 21:05 | tc-p0-core（run1） | 51 | 50 / 1 fail | `用例#6-①[D3]` 成功提示未捕获（NO-TOAST）；归因：提示在查询完成后渲染，原 6s 捕获窗口不足（探测实测 3.8~5.8s，慢查询时超过 6s），属脚本等待不足，非产品缺陷；失败证据保留于 `formal-p0/` |
| 21:08 | tc-p0-core（run2，修正等待为 20s） | 51 | 51/51 | 正式结果采用本轮；首轮失败证据保留 |
| 21:10 | tc-p1-core | 43 | 43/43 | 含 9⑦/17④（周归一）、14③（Total892/45 基线漂移） |
| 21:13 | tc-compat-chrome | 3 | 3/3 | 用例 16 D1 |
| 21:14 | tc-compat-edge | 3 | 3/3 | 用例 16 D2 |

## 3. 运行命令
```bash
cd projects/feature/lita-admin-lita-leaderboard-weekly/tests
TMPDIR=<可写目录> ADMIN_USERNAME=<账号> ADMIN_PASSWORD=<口令> \
  node tc-p0-core.test.ts --evidence-dir=<证据目录>/p0
TMPDIR=<可写目录> ADMIN_USERNAME=<账号> ADMIN_PASSWORD=<口令> \
  node tc-p1-core.test.ts --evidence-dir=<证据目录>/p1
TMPDIR=<可写目录> ADMIN_USERNAME=<账号> ADMIN_PASSWORD=<口令> \
  node tc-compat-chrome.test.ts --evidence-dir=<证据目录>/chrome
TMPDIR=<可写目录> ADMIN_USERNAME=<账号> ADMIN_PASSWORD=<口令> \
  node tc-compat-edge.test.ts --evidence-dir=<证据目录>/edge
```

## 4. 平台登记
- scriptsPath：`projects/feature/lita-admin-lita-leaderboard-weekly`
- 导入结果：testId 见交付文档（导入后回填）。
