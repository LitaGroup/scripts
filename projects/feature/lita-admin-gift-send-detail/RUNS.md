# 运行记录 — 项目 141 送礼详情（提测 34）

## 环境

| 项 | 值 |
|:---|:---|
| 执行时间（最终回归） | 2026-11-04 10:20:24 ～ 10:26:22（+08:00） |
| UI 环境 | `https://admin.test.lita.game`（部署入口 `static/index-fc372756.js`，2026-11-03 23:07:22 +0800） |
| data-main 接口 | `https://api.test.cinta.team`（测试网关，同一 data-main 服务） |
| 报表配置 | `configId=gift-send-detail`，`database=odps` |
| 浏览器 | Playwright Chromium（headless，1680×1050） |
| Node | v24.22.1 |
| 运行账号 | `ai`（受控会话桩；登录接口被 WAF 拦截，详见“环境限制”） |

## 最终回归结果（提测 34 置为“进行中”后执行）

| # | 脚本 | 校验点 | 成功 | 失败 | 跳过 | 退出码 | 开始 | 结束 |
|:--|:---|:--|--:|--:|--:|--:|:---|:---|
| 1 | `gift-send-detail-page-validation.test.ts` | 页面加载、必填、三选一、语言区枚举 | 12 | 0 | 0 | 0 | 10:20:24 | 10:20:41 |
| 2 | `gift-send-detail-filters-pagination.test.ts` | 送礼人/收礼人/礼物ID、语言区、房间ID 批量、分页 | 11 | 0 | 0 | 0 | 10:20:41 | 10:23:22 |
| 3 | `gift-send-detail-export.test.ts` | 合法导出/非法不导出 | 5 | 0 | 0 | 0 | 10:23:22 | 10:23:38 |
| 4 | `gift-send-detail-deeplink-reset.test.ts` | 深链、重置、查询中重置、其他报表 | 12 | 0 | 0 | 0 | 10:23:38 | 10:24:22 |
| 5 | `gift-send-detail-api.test.ts` | config/query/download/异常 | 18 | 0 | 0 | 0 | 10:24:22 | 10:26:22 |
| **合计** |  |  | **58** | **0** | **0** |  |  |  |

原始输出（每脚本完整 `[start]/[act]/[check]/[done]`）：`/tmp/tk45/final-regression-status/summary.log` 及同目录 `*.log`；截图与 `run.json`/`api-calls.json` 在 `/tmp/tk45/final-regression-status/<脚本名>/`。

## 运行命令

```bash
cd projects/feature/lita-admin-gift-send-detail/tests
node gift-send-detail-page-validation.test.ts
node gift-send-detail-filters-pagination.test.ts
node gift-send-detail-export.test.ts
node gift-send-detail-deeplink-reset.test.ts
node gift-send-detail-api.test.ts
```

## 提测状态证据

| 时间 | 操作 | 结果 |
|:---|:---|:---|
| 2026-11-04 10:20（执行前） | `POST /api/releases/34/status.md {"status":"进行中"}` | 成功，清单显示“进行中” |
| 2026-11-04 10:26（最终回归通过后） | `POST /api/releases/34/status.md {"status":"已通过"}` | 成功，清单显示“已通过” |

## 环境限制与观察

1. **WAF 登录拦截（环境限制，非产品缺陷）**
   - 执行机直连 `https://m-api.test.lita.game/admin/init`、`/admin/login` 均返回 `403 {"message":"Access Denied"}`；同一域名下静态资源与 `/data-main/*` 正常。已用浏览器（headless/headed）与 curl 复现，签名头（test/stable wasm）均无法改变结果。
   - 处理：UI 脚本使用受控会话桩仅替换 `/admin/init`、`/api/admin/privilege`；`config/get`、`query`、`query/download` 全部转发到 `https://api.test.cinta.team` 的同一 `data-main` 服务并逐条留痕。未使用任何密码或伪造业务数据。
   - 影响：未能验证真实账号登录后的会话与菜单权限；报表页面路由权限 `admin/gift-send-detail` 已通过页面加载验证。
2. **部署构建与任务描述不一致（观察项，非产品缺陷）**
   - 任务描述：`static/index-346af143.js`（2026-11-03 22:00:46 +0800）。
   - 实际入口：`static/index-fc372756.js`（2026-11-03 23:07:22 +0800），页面 chunk 为 `index-15984e28.js`；旧构建 `346af143` 仍可访问，页面 chunk 为 `index-5ad186cd.js`。
   - 两者均包含 `gift-send-detail` 的 `requiredAnyOf`、`queryPrefill`、日期必填配置；本次按实际部署构建测试。建议提测方确认部署构建与提测 commit 的对应关系。
3. **查询耗时**：ODPS 单次查询约 15–25 秒，脚本以响应事件等待，未使用固定长睡眠。

## 缺陷

- 项目 141 缺陷清单：0 条。
- 本次测试未发现可复现的产品缺陷。
