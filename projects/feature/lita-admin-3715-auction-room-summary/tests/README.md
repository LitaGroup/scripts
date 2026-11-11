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
| `tc-reg.test.ts` | 序号 15、16（TC-REG-01/02） | 6 | 陪玩师日报表、送礼详情回归；③ 受数据/日期交互影响 |

> 序号 2、3（TC-AUTH-02/03）需「非 admin 且无 `auction-mode-room-summary` 权限」账号；当前 qa-ai 已授 admin，环境无可用未授权账号，按阻塞记录（见 COVERAGE.md），不使用 mock/注入模拟权限。

## 运行

```bash
cd projects/feature/lita-admin-3715-auction-room-summary/tests
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-p0-report.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-p1-edge.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-reg.test.ts
```

可选：`--evidence-dir=/tmp/tk203` 指定证据目录；默认 `./evidence/<脚本名>-<时间戳>/`。

环境变量：

| 变量 | 默认 | 说明 |
|:---|:---|:---|
| `SCRIPT_UI_BASE` | `https://admin.test.lita.game` | Admin 测试环境 |
| `SCRIPT_API_BASE` | `https://funbit-mgr.test.cinta.team` | 同源测试入口（WAF 转发目标） |
| `SCRIPT_DATA_MAIN_BASE` | `https://api.test.cinta.team` | data-main 网关（`/data-main/**` 转发目标） |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 无 | 运行时注入，禁止写入代码/日志/证据 |

## 网络层说明

执行机直连 `https://m-api.test.lita.game` 被边缘 WAF 拦截（403）。脚本仅在浏览器网络层将请求**原样**转发到同源测试入口，不修改业务参数、不注入响应（红线 R1 例外，报告中声明）。登录始终走页面真实表单。

## 结果概览（TK-0203）

- P0 9 条：23/23 check 通过。
- P1/P2 5 条：13/13 check 通过。
- 回归 2 条：4/6 check 通过；REG-01 ③ 无数据、REG-02 ③ 日期交互不触发查询，按阻塞记录。
- 用例四态：通过 14 / 未通过 0 / 阻塞 4 / 未执行 0。

## 证据

每次运行生成 `run.json`（接口路径/状态/响应摘要，token 已脱敏）、`run.log` 与逐步截图。公开证据地址见任务文档 `EVIDENCE.md`。
