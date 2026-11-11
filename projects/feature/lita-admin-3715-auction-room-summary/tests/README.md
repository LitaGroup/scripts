# 拍拍模式流水-房间维度（Admin 报表）测试脚本

- 项目：3715【报表需求】拍拍模式流水 - 房间维度
- 环境：https://admin.test.lita.game（非生产）
- 报表路由：`/#/data-stats-manager/auction-mode-room-summary`（configId `auction-mode-room-summary`）
- 本轮用例：`/task/20261111/TK-0165/TEST_CASES`（18 条）

## 覆盖范围

| 脚本 | 覆盖用例 | 说明 |
|:---|:---|:---|
| `tc-auth-reg.test.ts` | TC-AUTH-02、TC-AUTH-03、TC-REG-01、TC-REG-02 | 菜单权限反向验证 + 既有报表回归（qa-ai） |
| `tc-p0-report.test.ts` | TC-AUTH-01、TC-UI-01/02/03/06/07、TC-FILTER-01/02/03 | P0 报表主路径（admin） |

> 报表页 TC-AUTH-01、TC-UI-01~07、TC-FILTER-01~04、TC-EDGE-01~02 需要 `auction-mode-room-summary` 权限，
> 本轮测试账号 qa-ai 不具备该权限（直达路由跳 404），相关用例未代码化，按阻塞记录（见 COVERAGE.md）。

## 运行

```bash
cd projects/feature/lita-admin-3715-auction-room-summary/tests
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-auth-reg.test.ts
```

可选：`--evidence-dir=/tmp/tk188` 指定证据目录；默认 `./evidence/<脚本名>-<时间戳>/`。

环境变量：

| 变量 | 默认 | 说明 |
|:---|:---|:---|
| `SCRIPT_UI_BASE` | `https://admin.test.lita.game` | Admin 测试环境 |
| `SCRIPT_API_BASE` | `https://funbit-mgr.test.cinta.team` | 同源测试入口（WAF 转发目标） |
| `SCRIPT_DATA_MAIN_BASE` | `https://api.test.cinta.team` | data-main 网关（`/data-main/**` 转发目标） |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 无 | 运行时注入，禁止写入代码/日志/证据 |

## 网络层说明

执行机直连 `https://m-api.test.lita.game` 被边缘 WAF 拦截（403）。脚本仅在浏览器网络层将请求**原样**转发到同源测试入口，不修改业务参数、不注入响应（红线 R1 例外，报告中声明）。登录始终走页面真实表单。

## 证据

每次运行生成 `run.json`（接口路径/状态/响应摘要，token 已脱敏）与逐步截图。
