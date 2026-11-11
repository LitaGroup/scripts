# 拍拍模式流水-房间维度（Admin 报表）测试脚本

- 项目：3715【报表需求】拍拍模式流水 - 房间维度
- 环境：https://admin.test.lita.game（非生产）
- 报表路由：`/#/data-stats-manager/voice-room-data/auction-mode-room-summary`（configId `auction-mode-room-summary`）
- 用例来源（唯一合法输入）：`/task/20261111/TK-0207/HANDOFF`（九列用例 1~18，2026-11-11 19:52 用例编写任务验收通过）
- 技术方案：`/task/20261111/TK-0207/TECH_DESIGN`

## 覆盖范围

| 脚本 | 覆盖用例 | check 数 | 说明 |
|:---|:---|:--:|:---|
| `tc-p0-report.test.ts` | 序号 1、4、5、6、9、10、11、12、13（TC-AUTH-01、UI-01/02/03/06/07、FILTER-01/02/03） | 23 | P0 主路径；含 FILTER-02 逗号/换行两数据行 |
| `tc-p1-edge.test.ts` | 序号 7、8、14、17、18（TC-UI-04/05、FILTER-04、EDGE-01/02） | 13 | 分页、重置、组合筛选、异常边界 |
| `tc-auth-unauth.test.ts` | 序号 2、3（TC-AUTH-02/03） | 3 | 无权限账号菜单不可见、直达路由 404 |
| `tc-reg.test.ts` | 序号 15、16（TC-REG-01/02） | 6 | 陪玩师日报表两级分组表头、送礼详情表头；日期+ID 查询 |

> 序号 2、3 需「非 admin 且无 `auction-mode-room-summary` 权限」账号。TK-0212 已创建 `qa-noauth-3715`（role 27），凭证保存在受控文件、运行时读取；不得用 mock/注入模拟权限。未授权账号运行 `tc-auth-unauth.test.ts`，正向账号运行其余脚本。

## 运行

```bash
cd projects/feature/lita-admin-3715-auction-room-summary/tests

# P0 主路径（qa-ai）
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-p0-report.test.ts

# P1/P2（qa-ai）
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-p1-edge.test.ts

# 回归页（qa-ai）
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-reg.test.ts

# 无权限账号反向验证（qa-noauth-3715，凭证从受控文件读取，勿写入命令历史）
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-auth-unauth.test.ts
```

可选：`--evidence-dir=/path/to/evidence` 指定证据目录；默认 `./evidence/<脚本名>-<时间戳>/`。每次运行生成 `run.json`（接口路径/状态/响应摘要，token 已脱敏）、`run.log` 与逐步截图。

环境变量：

| 变量 | 默认 | 说明 |
|:---|:---|:---|
| `SCRIPT_UI_BASE` | `https://admin.test.lita.game` | Admin 测试环境 |
| `SCRIPT_API_BASE` | `https://funbit-mgr.test.cinta.team` | 同源测试入口（WAF 转发目标） |
| `SCRIPT_DATA_MAIN_BASE` | `https://api.test.cinta.team` | data-main 网关（`/data-main/**` 转发目标） |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 无 | 运行时注入，禁止写入代码/日志/证据 |

## 网络层说明

执行机直连 `https://m-api.test.lita.game` 被边缘 WAF 拦截（403）。脚本仅在浏览器网络层将请求**原样**转发到同源测试入口，不修改业务参数、不注入响应（红线 R1 例外，报告中声明）。登录始终走页面真实表单。

## 结果概览

### TK-0219 补验（2026-11-11 20:35）

- 范围：序号 2、3、15、16（4 条 P1）。
- 四态：通过 4 / 未通过 0 / 阻塞 0 / 未执行 0；执行率 100%、通过率 100%。
- check：9/9 通过。
- 关键事实：
  - qa-noauth-3715 登录成功，菜单无「拍拍模式流水-房间维度」，直链跳 `#/404` 且不渲染报表。
  - 陪玩师日报表日维度 2026-07-01~07-31 返回 19,978 行，两级分组表头 2 行/86 列/7 个父级分组；用例原日期 2026-11-08 为 Total 0（环境存量差异）。
  - 送礼详情按「日期 2026-11-08 + 送礼用户ID 6360225」查询成功，Total 1、表头 18 列、1 行；仅日期查询被既有 requiredAnyOf 规则拦截（非缺陷）。

### TK-0203 历史执行（2026-11-11 19:55~19:59）

- P0 9 条：23/23 check 通过。
- P1/P2 5 条：13/13 check 通过。
- 回归 2 条：4/6 check 通过；当时 REG-01 ③ 无数据、REG-02 ③ 日期交互不触发，按阻塞记录；本轮已补验通过。
- 历史四态：通过 14 / 未通过 0 / 阻塞 4 / 未执行 0。

## 证据

公开证据地址、运行记录与逐条结论见 `RUNS.md`、`COVERAGE.md` 及任务文档 `/task/20261111/TK-0219/EVIDENCE`。
