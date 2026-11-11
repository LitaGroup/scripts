# 项目 3716「拍拍模式流水-主播维度」Admin UI 测试

> 用例来源：`/task/20261111/TK-0206/HANDOFF` 第 3 节九列表格（22 条，P0 13 / P1 7 / P2 2）
> 技术方案：`/task/20261111/TK-0206/TECH_DESIGN`
> 被测页面：数据统计管理 - 语音房相关数据 - 拍拍模式流水-主播维度
> 路由：`/#/data-stats-manager/voice-room-data/auction-mode-player-detail`

## 目录

```
projects/feature/lita-admin-3716-auction-player-detail/tests/
├── lib/admin-base.ts                 # 登录 / WAF 同源转发 / 条件等待 / 截图 / 页面读取
├── tc-formal-p0.test.ts              # 用例#1/#4/#5/#6/#7/#9      （18 checks）
├── tc-formal-p0-filter.test.ts       # 用例#11/#12(D1/D2)/#13    （10 checks）
├── tc-formal-p0b.test.ts             # 用例#17/#18/#16           （11 checks）
├── tc-formal-p1.test.ts              # 用例#10/#8                （7 checks）
├── tc-formal-p1b.test.ts             # 用例#14/#15               （6 checks）
├── tc-formal-p2.test.ts              # 用例#19/#20               （6 checks）
├── tc-formal-p2-edge.test.ts         # 用例#21/#22               （6 checks）
├── COVERAGE.md                       # 用例检查点 ↔ check 双向对照
├── RUNS.md                           # 运行记录与红证抽查
└── README.md
```

- 未代码化：用例#2 TC-AUTH-02、#3 TC-AUTH-03（需「非 admin 且无 auction-mode-player-detail 权限」受限账号，本轮无该账号，记阻塞）。

## 运行

```bash
cd projects/feature/lita-admin-3716-auction-player-detail/tests

ADMIN_USERNAME=*** ADMIN_PASSWORD=*** \
  node tc-formal-p0.test.ts --evidence-dir=./evidence/p0
ADMIN_USERNAME=*** ADMIN_PASSWORD=*** \
  node tc-formal-p0-filter.test.ts --evidence-dir=./evidence/p0-filter
ADMIN_USERNAME=*** ADMIN_PASSWORD=*** \
  node tc-formal-p0b.test.ts --evidence-dir=./evidence/p0b
ADMIN_USERNAME=*** ADMIN_PASSWORD=*** \
  node tc-formal-p1.test.ts --evidence-dir=./evidence/p1
ADMIN_USERNAME=*** ADMIN_PASSWORD=*** \
  node tc-formal-p1b.test.ts --evidence-dir=./evidence/p1b
ADMIN_USERNAME=*** ADMIN_PASSWORD=*** \
  node tc-formal-p2.test.ts --evidence-dir=./evidence/p2
ADMIN_USERNAME=*** ADMIN_PASSWORD=*** \
  node tc-formal-p2-edge.test.ts --evidence-dir=./evidence/p2-edge
```

- Node.js v24+ 直接运行 TypeScript（类型剥离），无需编译。
- 凭证仅运行时环境变量注入，不写入代码/日志/证据。
- 证据：每个 check 的截图、`run.json`（页面请求留痕，已脱敏）、导出 xlsx。
- 只读测试环境存量数据（BD-0），不造数、无清理责任。

## 环境适配与口径

- **WAF 同源转发**：执行机直连 `m-api.test.lita.game` 返回 403；基类仅在网络层把请求原样转发到 `https://funbit-mgr.test.cinta.team`（`/data-main/*` → `https://api.test.cinta.team`），不改路径/方法/业务参数、不注入响应（《ADMIN 测试代码开发规范》R1 例外条款）。
- **ODPS 查询节流**：连续统计查询间隔不足 20s 时测试环境偶发 502；基类在两次查询之间做发送节流。该等待不参与任何检查点判定，查询结果仍由响应事件 + 页面落定条件确认。
- 页面表头为接口返回的小写列名（17 列），按列数/列序/不截断判定，不因小写判失败（上游技术方案 D2）。
- 导出 `auction success - Date&Time` 含「 - 」，EasyExcel 呈现两行表头；按 17 列/26 数据行/合计/不错列判定，表头层数仅作观察项（上游技术方案 D3）。实测：表头 2 行，数据 17 列×26 行，合计 445,824.52，首行与页面一致。
- 筛选页“大区”为单选，选项「印尼语区」对应需求中的 `in` 大区。
