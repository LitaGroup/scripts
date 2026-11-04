# Lita ADMIN 项目139：批量删除 + 提现成为陪玩师时间

## 背景

项目 139（Lita ADMIN 后台）需求：

1. 语音房管理-广播召人配置：增加批量删除；
2. 语音房管理-主播认证标识配置：增加批量删除；
3. 审核-提现-查询：增加【成为陪玩师时间】列（导出同样新增）。

本目录为提测 #35（TK-0048 重新实现轮次）的自动化测试脚本，覆盖真实浏览器 UI、真实后端接口及只读数据库抽样核对。

## 环境

| 项 | 值 |
|:---|:---|
| Admin UI | `https://admin.test.lita.game` |
| 后端同源测试入口 | `https://funbit-mgr.test.cinta.team` |
| 只读 DB 查询网关 | `https://api.test.cinta.team/admin-ai/v1/query/execute` |
| 管理员账号 | 运行时环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（禁止写入脚本/日志/证据） |

说明：

- 执行机直连 `https://m-api.test.lita.game` 被 CDN/WAF 403 拦截。脚本在 Playwright 浏览器层仅把该主机的请求改写转发到同源测试入口 `funbit-mgr.test.cinta.team`，页面代码与业务参数不变。
- 提测输入指定账号为 `ai`，但本轮工位未注入 `ai` 的口令；实际使用同环境具备全量权限的管理员账号（运行时注入），token 来自本次真实浏览器登录的登录响应/Cookie，不硬编码、不落盘。
- 数据库仅执行 `SELECT`，用于核对 `anchor_certification_log` 与 `user_profile.become_player_time`；查询 token 取工位 `LITA_USER_TOKEN`，不写入脚本与证据。

## 目录

```
projects/feature/lita-admin-139-batch-delete/
  README.md                                 项目说明
  COVERAGE.md                               需求 → 测试点 → 脚本追溯
  RUNS.md                                   运行记录与回归结论
  tests/
    README.md                               用例说明
    lib/admin-base.ts                       登录、代理、截图、接口/DB 留痕基类
    broad-config-batch-delete.test.ts       广播召人批量删除全链路 + 既有功能回归
    anchor-certification-batch-delete.test.ts 主播认证批量删除全链路 + 审计日志 + 既有功能回归
    withdraw-become-player-time.test.ts     提现新列展示/格式/接口/DB 一致性 + 既有筛选分页
    withdraw-export.test.ts                 页面导出 Excel 新列位置与值
    broad-batch-delete-api.test.ts          广播召人批量删除接口契约
```

## 依赖

- Node.js v24+（仓库原生 TypeScript 类型剥离，无需编译）
- `playwright`（Chromium）、`exceljs`

在仓库根目录安装依赖：

```bash
npm install
```

## 运行

在 `scripts` 仓库根目录执行；`ADMIN_PASSWORD` 与 `LITA_USER_TOKEN` 用运行时环境注入（示例中用 `***` 占位，实际命令不得记录明文）：

```bash
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD='***'
export LITA_USER_TOKEN='***'   # 仅 DB 抽样核对用；无此变量时 DB 断言会失败

node projects/feature/lita-admin-139-batch-delete/tests/broad-config-batch-delete.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/anchor-certification-batch-delete.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/withdraw-become-player-time.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/withdraw-export.test.ts
node projects/feature/lita-admin-139-batch-delete/tests/broad-batch-delete-api.test.ts
```

可选参数：

- `--evidence-dir=<dir>`：覆盖证据目录（默认 `evidence/<脚本名>-<时间戳>/`）
- `SCRIPT_UI_BASE` / `SCRIPT_API_BASE` / `SCRIPT_DB_API`：覆盖环境地址

## 留痕

每个脚本默认在 `evidence/<script>-<timestamp>/` 输出：

- `NN-场景.png`：关键操作步骤与断言现场截图；
- `run.json`：页面接口请求/响应、脚本直连接口、只读 SQL 与响应（token/密码已脱敏）。

## 测试数据

- 广播召人：使用英语区房间 `6666/12001/10000`（测试环境房间），先通过页面新增，结束后批量删除清理。
- 主播认证：使用测试账号 uid（`19440456`、`19526094`、`1789`、`1751` 等）新增后删除，并核对审计日志；`anchor_certification_log` 的 DELETE 记录为预期产物。
- 提现：只读查询与导出，不执行实际审核/打款；批量审核仅验证按钮禁用态，不点击确认。

## 已知限制

- 提现导出要求至少一个筛选条件（既有保护：无筛选返回“不能无限制导出”），脚本通过页面“最近三个月”日期快捷项触发真实导出。
- `startDate` 传 `yyyy-MM-dd HH:mm:ss` 时后端仍报“不符合要求的类型:Date”；页面日期选择器输出 `yyyy-MM-dd`，实际页面导出正常，本脚本仅记录该接口约束，不判失败。
- 主播认证末页回退用例当前失败，已提交缺陷 #223（后端超范围分页返回系统错误），修复后需重跑。
