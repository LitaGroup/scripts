# BL-0058 Admin 房间人气推荐设置 — UI 测试代码

- 项目：3743「【Admin部分】【PRD】语音房侧边栏推荐优化」；迭代 2026W48 / BL-0058
- 用例来源：TK-0686 HANDOFF 九列用例 37 条；技术方案：`/task/20261125/TK-0686/TECH_DESIGN`
- 被测页面：`https://admin.test.lita.game/#/voice-room/voice-room-popularity-recommend`
- 执行任务：TK-0687（技术-测试-Admin 用例执行）

## 目录

```
tests/
  lib/admin-base.ts                 # 项目内私有基类（真实 UI 登录 + storageState + newContext 隔离 + 截图/run.json/脱敏）
  tc01-list-query.test.ts           # #1~#12 列表筛选/展示/排序/分页/空值（27 checks）
  tc02-create.test.ts               # #13~#17 单条新增（16 checks）
  tc03-create-negative.test.ts      # #18~#22 新增校验与取消（11 checks）
  tc04-batch-structure.test.ts      # #23/#30/#31 批量弹窗结构与模板下载（8 checks）
  tc05-excel-valid.test.ts          # #24/#25 合法 Excel 导入与库内重复（7 checks）
  tc06-excel-invalid.test.ts        # #26~#29 文件内重复/非法行/超限/空文件（18 checks）
  tc07-delete.test.ts               # #32~#35 单删/批量删除/操作人（7 checks）
  tc08-noauth.test.ts               # #36/#37 qa-noauth 无权限（3 checks）
COVERAGE.md                         # 97 checks 与用例检查点双向核对
RUNS.md                             # 自测与正式执行记录
```

## 运行

Node.js 24+ 原生 TypeScript，无需编译；凭证仅运行时注入：

```bash
cd <scripts 仓库根目录>
export TMPDIR="$PWD/.tmp-playwright"
export ADMIN_USERNAME=qa-ai ADMIN_PASSWORD=***
node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc01-list-query.test.ts
```

单条用例（轻量自测/定向复跑）：

```bash
node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc01-list-query.test.ts --case=1
node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc06-excel-invalid.test.ts --case=27
```

无权限族使用 qa-noauth（绝不开权）：

```bash
NOAUTH_USERNAME=qa-noauth NOAUTH_PASSWORD=*** \
  node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc08-noauth.test.ts
```

正式执行可先集中登录一次，再用 `REUSE_STATE=1` 复用 30 分钟内的真实会话（避免并行文件重复登录）：

```bash
node projects/.../tc01-list-query.test.ts          # 首次登录并保存 qa-ai storageState
REUSE_STATE=1 node projects/.../tc03-create-negative.test.ts
```

## 数据隔离与清理

- `tc01` 建立套件级共享基准 B1/B2/B3（权重 5001/5002/5003），套件结束按权重+操作人 `qa-ai` 清理；存量 159 条只读。
- 写删用例每条自建独立记录并在用例内删除；Excel 导入使用独立地区与权重；非法文件预期不落库，若产品异常落库则按操作人 `qa-ai` 兜底清理。
- 执行结束可通过列表筛选各语言区确认 qa-ai 自建记录为 0；本轮数据审计见 `EVIDENCE.md`。

## 环境说明

- 执行机实测可直连 `m-api.test.lita.game`（未登录返回 401，不是 WAF 403），默认 **不启用 WAF 转发**；基类保留 `ENABLE_WAF_FORWARD=1` 的同源原样转发能力（`/admin|/api|/voiceroom -> SCRIPT_API_BASE`、`/data-main -> SCRIPT_DB_API`，不改请求/响应体），如未来出现 403 再启用并在报告声明。
- 页面请求/响应经 `maskSensitive` 脱敏后写入 `evidence/run.json`；密码、token、Cookie 不写入代码、日志、证据或报告。
- 等待策略：响应事件 + web-first 可见性 + loading 消失 + 表格落定，无固定 sleep 作为断言前置。

## 定向回归记录（2026-11-26，TK-0693）

- 背景：缺陷 419（Excel 导入未校验不存在 ROOM ID，高/后端）与 420（类型非法提示缺行号，中/后端）修复部署后，做定向回归。
- 范围：仅 tc04（#23/#30/#31）、tc05（#24/#25）、tc06（#26~#29），共 9 条用例 / 33 checks；不重跑 tc01/tc02/tc03/tc07/tc08。
- 结果：33/33 check 通过；#27c 提示「第 2 行 未知的推荐类型: abc」、#27f 提示「第 2 行 ROOM ID 999999999 不存在」且整表不落库；缺陷 419、420 已关闭。
- 平台运行器：testId 174 单次 `run.md` 返回 `ERR_MODULE_NOT_FOUND`（运行 ID 351），已按规则熔断，正式结果均为工位 `node xxx.test.ts` 实跑。
- 数据：回归后 Total=159，qa-ai 自建行 0，ROOM ID=999999999 0 行，USER ID=23 仅存量 id=325。
- 详细报告：任务 TK-0693 `TEST_REPORT.md` / `EVIDENCE.md` / `RUNS.md` / `COVERAGE.md`。
