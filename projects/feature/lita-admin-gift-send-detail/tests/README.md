# 送礼详情测试脚本

## 覆盖功能点

| 脚本 | 功能点 | 查询次数（约） |
|:---|:---|:---|
| `gift-send-detail-page-validation.test.ts` | 页面加载、筛选项、按钮、初始空表/分页、日期必填、三选一（查询+导出）、语言区枚举、重置入口 | 0 |
| `gift-send-detail-filters-pagination.test.ts` | 送礼人/收礼人/礼物ID 查询、语言区+接收用户、房间ID 换行/逗号批量、组合筛选、分页下一页 | 7 |
| `gift-send-detail-export.test.ts` | 合法条件导出 xlsx（文件名/表头/数据/请求参数）、非法条件不导出 | 1 次导出 |
| `gift-send-detail-deeplink-reset.test.ts` | `?uid=` 预填、不自动查询、补日期查询、重置、其他报表页面不受影响 | 1 |
| `gift-send-detail-api.test.ts` | config/get、query（送礼人/收礼人/礼物ID/语言区/房间ID/分页/表头）、download、未知 configId | 7 次接口 |

## 执行方式

在 scripts 仓库根目录安装依赖后，进入 `tests/` 执行：

```bash
cd projects/feature/lita-admin-gift-send-detail/tests
node gift-send-detail-page-validation.test.ts
node gift-send-detail-filters-pagination.test.ts
node gift-send-detail-export.test.ts
node gift-send-detail-deeplink-reset.test.ts
node gift-send-detail-api.test.ts
```

可选参数：

```bash
node xxx.test.ts --evidence-dir=/tmp/gift-send-detail-<scene>
```

默认证据目录：`./evidence/<脚本名>-<yyyyMMdd-HHmmss>/`，包含每一步截图、`run.json`（接口 URL/参数/状态/响应摘要）或 `api-calls.json`。

## 环境变量

| 变量 | 默认值 | 说明 |
|:---|:---|:---|
| `SCRIPT_UI_BASE` | `https://admin.test.lita.game` | Admin 测试环境地址 |
| `SCRIPT_API_BASE` | `https://api.test.cinta.team` | data-main 测试网关（内网可达） |
| `ADMIN_USERNAME` | 空 | 真实登录账号；未设置时使用受控会话桩 |
| `ADMIN_PASSWORD` | 空 | 真实登录密码；仅运行时使用，禁止写入脚本/日志 |

## 数据依赖

- 送礼用户 `6360225`：`2026-11-02 ~ 2026-11-03` 共 1 条。
- 接收用户 `6420152`：`2026-11-03` 共 375 条。
- 礼物ID `9358`：`2026-11-03` 共 254952 条（仅取前 20 行断言）。
- 语言区 `in` + 接收用户 `6420152`：`2026-11-03` 共 375 条。
- 房间ID `10101411,10101412`：`2026-11-03` 共 1089 条。
- 组合：送礼用户 `6360225` + 语言区 `in` + 房间 `10101411/10101412`：1 条。

均为测试环境只读查询，不修改业务数据；导出文件仅解析表头与首行，不做保存。

## 注意事项

1. **登录 WAF 限制**：执行机直连 `m-api.test.lita.game/admin/*` 返回 403（边缘 WAF），真实登录不可达。未提供账号密码时脚本使用受控会话桩，仅替换 `/admin/init`、`/api/admin/privilege`；`data-main` 的 config/query/download 全部转发到真实测试后端并记录请求响应。提供账号密码时会先真实登录，失败直接报错。
2. **查询耗时**：ODPS 单次查询约 15–25 秒，脚本等待响应而不是固定 sleep；分页下一次查询沿用原条件。
3. **操作留痕**：每个关键操作后截图；接口留痕包含完整 URL、请求体、HTTP 状态、响应摘要；敏感字段不落盘。
4. **断言口径**：表头以接口返回的 18 列为准（`送礼用户id` 等为接口原文小写）；日期范围、送礼/收礼/礼物ID、语言区、房间ID 均校验请求体与响应值。
5. **导出**：使用 Playwright 下载事件 + `exceljs` 解析，文件名形如 `礼物赠送明细查询_<随机数>.xlsx`。

## 未覆盖与排除

- 生产环境、性能压测、安全渗透、旧送礼详情页面。
- 真实登录后的权限/菜单差异（受 WAF 限制无法登录）；本次通过 admin 权限会话桩进入页面，报表权限路由 `admin/gift-send-detail` 已在页面加载中验证。
- 大数据量全量导出（仅用单条送礼用户条件验证表头与数据）。
