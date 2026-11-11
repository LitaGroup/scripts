# 项目 3713 / Lita Leaderboard Weekly Data — Admin UI 用例脚本

## 1. 范围
- 项目：3713【报表需求】Lita Leaderboard Weekly Data（提测 52，迭代 w291）
- 被测页面：Admin → 数据统计管理 → 用户数据 → Lita Leaderboard Weekly Data
- 路由：`#/data-stats-manager/user-consumption/lita-leaderboard-weekly`
- 用例来源：`/task/20261111/TK-0204/HANDOFF`（17 条九列用例，参数化展开 24 个执行单元）
- 技术方案：`/task/20261111/TK-0204/TECH_DESIGN`（SK1-SK9 / BD-0 / B1-B10 / L01-L21 / 102 条断言映射）
- 覆盖：17 条用例中 16 条已代码化（100 个 check）；用例 2 因缺无 lita-leaderboard-weekly 权限的普通账号，未代码化并记阻塞。

## 2. 目录
```
tests/
├── lib/admin-base.ts            # 登录/同源转发/等待/表格/分页/下载/失败截图基类
├── tc-p0-core.test.ts           # 用例 1、3、4、5、6(D1-D3)、7(D1-D2)、8、12（51 check）
├── tc-p1-core.test.ts           # 用例 9、10(D1-D2)、11、13、14、15(D1-D3)、17（43 check）
├── tc-compat-chrome.test.ts     # 用例 16 D1（3 check）
├── tc-compat-edge.test.ts       # 用例 16 D2（3 check）
├── COVERAGE.md                  # 检查点 ↔ check 双向核对
├── RUNS.md                      # 运行记录
└── README.md
```

## 3. 运行
```bash
cd projects/feature/lita-admin-lita-leaderboard-weekly/tests

# 必需：运行时账号（不写入代码/日志/证据）
export ADMIN_USERNAME=<有权限账号>
export ADMIN_PASSWORD=<口令>

# 工位 /tmp 配额满会导致浏览器下载/截图写盘失败，建议 TMPDIR 指向工作区
export TMPDIR=/path/to/writable/tmp

node tc-p0-core.test.ts --evidence-dir=/path/to/evidence/p0
node tc-p1-core.test.ts --evidence-dir=/path/to/evidence/p1
node tc-compat-chrome.test.ts --evidence-dir=/path/to/evidence/chrome
node tc-compat-edge.test.ts --evidence-dir=/path/to/evidence/edge
```
- Node.js v24+ 原生 TS 类型剥离，无编译步骤。
- 证据目录内 `run.json` 记录请求/响应摘要（已脱敏）与截图清单；断言失败自动补 `FAIL-*.png`。

## 4. 网络与数据
- 执行机直连 `m-api.test.lita.game` 被 WAF 403。基类仅在浏览器网络层把该主机请求原样转发：
  `/admin/*` → `https://funbit-mgr.test.cinta.team`，`/data-main/*` → `https://api.test.cinta.team`。
  不修改 URL 业务参数、不修改请求/响应体、不 mock 任何被测接口（R1 例外条款，报告已声明）。
- BD-0 无造数：仅只读查询与导出，无写操作、无角色/权限变更；导出文件留在证据目录。

## 5. 口径说明
- Week 列按周归一口径显示周一（选择 2026-11-08 查询时 Week=2026-11-02，Week Range=2026-11-02 ~ 2026-11-08）；已获需求方答复确认，用例 9⑦/17④ 记用例问题反馈。
- 用例 14 的 Total 从文档基线 476 漂移到 892（sender_id=11966854 过滤有效），经需求方确认按实际存量 892/45 页判定。
- 用例 16 使用本机安装的 Google Chrome 157 / Microsoft Edge 157（Playwright `channel: chrome/msedge`）。

## 6. 平台登记
- scriptsPath：`projects/feature/lita-admin-lita-leaderboard-weekly`（首次配置）
- 导入：`POST /api/scripts/import.md {"projectId":3713}`，testId 见 RUNS.md 与交付文档。
