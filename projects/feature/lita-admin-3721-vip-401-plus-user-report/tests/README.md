# 项目3721「>=401用户数据」Admin UI 测试

> 用例来源：`/task/20261119/TK-0339/HANDOFF` 第 4 节九列表格（34 条，v5）
> 技术方案：`/task/20261119/TK-0339/TECH_DESIGN`
> 被测页面：数据统计管理 - 用户数据 - >=401用户数据
> 路由：`/#/data-stats-manager/user-consumption/vip-401-plus-user-report`

## 目录

```
projects/feature/lita-admin-3721-vip-401-plus-user-report/tests/
├── lib/admin-base.ts                 # 登录 / WAF 同源转发 / 条件等待 / 页面读取 / 截图 / 证据
├── tc01-entry.test.ts                # 用例#1/#2/#3        （11 checks）
├── tc02-filter.test.ts               # 用例#4/#5/#6/#7/#8/#9/#13（49 checks）
├── tc03-validation.test.ts           # 用例#10/#11/#12     （22 checks）
├── tc04-fields.test.ts               # 用例#14/#15/#16/#17/#18/#19/#20（19 checks）
├── tc05-pagination.test.ts           # 用例#21/#22/#23/#24/#25/#26（16 checks）
├── tc06-export.test.ts               # 用例#27/#28/#29     （5 checks）
├── tc07-regression.test.ts           # 用例#32/#33/#34     （7 checks）
├── tc08-noauth.test.ts               # 用例#30/#31（qa-noauth）（5 checks）
├── COVERAGE.md                       # 用例检查点 ↔ check 双向对照（134 行）
├── RUNS.md                           # 自测/红证/正式执行记录
└── README.md
```

- 参数化数据行：用例 6（2 行）、7（8 行）、8（4 行）、11（5 行）、12（5 行），check 标记带 `[数据行x]`；检查点总数 134。
- 未代码化用例：无（34 条全部代码化执行）。

## 运行

```bash
cd projects/feature/lita-admin-3721-vip-401-plus-user-report/tests

# 正向账号 qa-ai（凭证仅运行时注入，不写入代码/日志/证据）
ADMIN_USERNAME=… ADMIN_PASSWORD=… \
  node tc01-entry.test.ts --evidence-dir=./evidence/tc01
ADMIN_USERNAME=… ADMIN_PASSWORD=… \
  node tc02-filter.test.ts --evidence-dir=./evidence/tc02
ADMIN_USERNAME=… ADMIN_PASSWORD=… \
  node tc03-validation.test.ts --evidence-dir=./evidence/tc03
ADMIN_USERNAME=… ADMIN_PASSWORD=… \
  node tc04-fields.test.ts --evidence-dir=./evidence/tc04
ADMIN_USERNAME=… ADMIN_PASSWORD=… \
  node tc05-pagination.test.ts --evidence-dir=./evidence/tc05
ADMIN_USERNAME=… ADMIN_PASSWORD=… \
  node tc06-export.test.ts --evidence-dir=./evidence/tc06
ADMIN_USERNAME=… ADMIN_PASSWORD=… \
  node tc07-regression.test.ts --evidence-dir=./evidence/tc07

# 无权限账号 qa-noauth（密码默认取 ADMIN_PASSWORD；可用 ADMIN_NOAUTH_PASSWORD 覆盖）
ADMIN_USERNAME=… ADMIN_PASSWORD=… ADMIN_NOAUTH_USERNAME=qa-noauth \
  node tc08-noauth.test.ts --evidence-dir=./evidence/tc08
```

- Node.js v24+ 直接运行 TypeScript（类型剥离），无需编译。
- `TMPDIR` 建议指向非 `/tmp` 可写目录（导出下载落盘）。
- 证据：每个脚本生成 `evidence/…/run.json`（页面请求留痕，已脱敏）与关键截图；导出 xlsx 仅存本地证据目录。

## 环境与口径

- **WAF 同源转发**：执行机直连 `m-api.test.lita.game` 的 `/admin/*`、`/api/*` 返回 403；基类仅在浏览器网络层把请求原样转发到 `https://funbit-mgr.test.cinta.team`（不改路径/方法/业务参数、不注入响应），`/data-main/*` 保持直连。对应《ADMIN 测试代码开发规范》R1 例外条款。
- **查询**：`POST /data-main/admin/stats/query`（页面真实触发）；等待以响应事件 + 提示文案 + loading 消失 + 表格落定条件为准。
- **重置**：需求 #3435 §3.3 要求「清空全部筛选条件并恢复默认状态，同时刷新列表」；页面会先提示「已重置查询条件」，随后自动按默认条件查询并提示「查询完成，共 N 条」。
- **导出**：`POST /data-main/admin/stats/query/download` 返回 blob，浏览器直接下载；表头与页面一致，空值单元格现状为空白（缺陷 #363）。
- **无权限**：qa-noauth 不开启任何权限；只验证本报表菜单不可见与直达 URL 跳 #/404。
- **数据**：只读存量；不造数、不写库、无清理。报表数据源 T+1，执行当日 Total 19750（随每日更新变化）。

## 正式执行结果（2026-11-19）

- 正式轮（2026-11-19 11:49-11:55）：通过 26 / 未通过 7 / 阻塞 1（数据限制）/ 未执行 0。
- 回归轮（12:06/12:10）：缺陷 #361（排序第三级）、#363（导出空值）修复部署后复跑通过，缺陷已关闭；最终通过 28 / 未通过 5 / 阻塞 1，最终通过率 28/33 = 84.8%，执行率 33/34 = 97.1%。
- 开放缺陷：#357 最近活跃过滤未生效（高）；#358 分页选项（中）；#359 表头大小写（中）；#360 数据更新时间（中）；#362 导出文件名（中）。均 releaseId=null。
- 已关闭缺陷：#361、#363（回归通过，记录验证人/版本/时间/结果）。
- 详见 `COVERAGE.md`、`RUNS.md` 与任务文档 TEST_REPORT/EVIDENCE。
